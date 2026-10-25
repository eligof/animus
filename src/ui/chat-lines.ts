import { ours } from '../agents.ts';
import type { Bubble } from '../agents.ts';
import type { Outgoing } from '../claude/inbox.ts';
import { cellSafe } from '../term/width.ts';
import { fit } from './card.ts';
import { activityGlyph } from './chrome.ts';

// The chat window's lines: an agent's conversation, and the messages sent
// to it, laid out for a width. A speaker's name opens each message in a
// gutter, its text wrapped beside it; tool steps are one-line rows; a
// long message (over FOLD + 1 lines) folds after FOLD until opened. Every line is
// cell-safe (see wrap), whatever the transcript held.
//
//   you    Fix the tokenizer edge case
//   nova   On it. I'll start by reading the code
//          around it.
//     ▶ $ npm test ✓
//     thinking…
//   you →  add a test too  ✓ delivered

export const FOLD = 6;
export const GUTTER = 7; // the speaker's column

// How a piece of a line is coloured (the window maps these to its palette).
export type Tone = 'ink' | 'dim' | 'name' | 'you' | 'good' | 'warn' | 'bad';
export type Seg = { text: string; tone: Tone };
export type Line = Seg[];
// A folded message's '… more' line, and which message it opens.
export type Fold = { line: number; id: string };
// The agent's name, and who prompts it ('you' for a lead, 'task' for a subagent).
export type Names = { agent: string; prompter: string };
// A message's text wrapped at a width (see wrap), kept from one layout for
// the next by its id: while folded only as far as the fold needs, in full
// once opened. `total`: how many lines it wraps to in full, once counted.
export type Wrapped = { text: string; width: number; open: boolean; lines: readonly string[]; total?: number };
export type Wraps = Map<string, Wrapped>;

const cells = (s: string) => [...s].length;
const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - cells(s)));

// Text as lines of at most `width` cells, as the screen draws it (cellSafe:
// control and zero-width characters dropped, wide ones '?', tabs spaces),
// broken at spaces where it can and mid-word where it must. Its own line
// breaks stay (a run of blank lines as one); blank ends go. With `limit`,
// only the first `limit` of those lines, and the text is read no further
// than they need.
export function wrap(text: string, width: number, limit = Infinity): string[] {
  const w = Math.max(1, Math.floor(width));
  const out: string[] = [];
  // A blank line is owed before the next line (none at either end).
  let blank = false;
  const line = (s: string) => {
    if (blank) out.push('');
    blank = false;
    out.push(s);
  };
  for (let p = 0; p <= text.length && out.length < limit; ) {
    const found = text.indexOf('\n', p);
    const nl = found < 0 ? text.length : found;
    // The paragraph's cells, read as far as the line being made needs.
    let q = p;
    const next = (): string | null => {
      while (q < nl) {
        // Printable ASCII is its own cell (cellSafe's answer, sooner).
        const u = text.charCodeAt(q);
        if (u >= 0x20 && u < 0x7f) return text[q++];
        const cp = text.codePointAt(q)!;
        const c = cellSafe(text.slice(q, (q += cp > 0xffff ? 2 : 1)));
        if (c) return c;
      }
      return null;
    };
    let cs: string[] = [];
    while (out.length < limit) {
      // A line breaks when some cell past `width` is not a space (trailing
      // spaces go): read until one is, or the paragraph ends.
      let past = false;
      for (let i = cs.length - 1; i >= w && !past; i--) past = cs[i] !== ' ';
      for (let c = past ? null : next(); c !== null; c = next()) {
        cs.push(c);
        if (cs.length > w && c !== ' ') {
          past = true;
          break;
        }
      }
      if (!past) {
        while (cs.length && cs[cs.length - 1] === ' ') cs.pop();
        // Nothing (or only spaces) is a blank line: a paragraph broken
        // before always has something left.
        if (cs.length) line(cs.join(''));
        else if (out.length) blank = true;
        break;
      }
      let cut = cs.lastIndexOf(' ', w);
      if (cut <= 0) cut = w;
      line(cs.slice(0, cut).join('').trimEnd());
      // The next line starts at the first cell that is not a space (there
      // is one: the one past `width`).
      let k = cut;
      while (cs[k] === ' ') k++;
      cs = cs.slice(k);
    }
    p = nl + 1;
  }
  return out.length > limit ? out.slice(0, limit) : out;
}

// A sent message's state, at the end of its line.
export function status(o: Outgoing): Seg {
  switch (o.status) {
    case 'sending':
      return { text: 'sending…', tone: 'dim' };
    case 'waiting':
      return { text: 'sent, waiting', tone: 'dim' };
    case 'delivered':
      return { text: '✓ delivered', tone: 'good' };
    case 'unseen':
      return { text: 'not seen', tone: 'warn' };
    case 'failed':
      return { text: `✗ not sent: ${o.reason}`, tone: 'bad' };
    case 'copied':
      // OSC 52: some terminals ignore it.
      return { text: 'copied (if your terminal allows it)', tone: 'dim' };
  }
}

// A folded message's '… N more lines'. N takes the whole message wrapped,
// so it is counted only when the line is drawn, once.
function moreLines(e: Wrapped): Seg {
  return {
    tone: 'dim',
    get text() {
      e.total ??= wrap(e.text, e.width).length;
      return `… ${e.total - FOLD} more lines`;
    },
  };
}

const NOTHING: readonly string[] = [''];

// The lines for `log` (oldest first) and the messages `sent` to it at
// `width` cells, those in `open` in full. A sent message the transcript
// shows is drawn there with its state; the rest go in by the time they
// were sent. One an earlier process sent under the name animus is shown
// dim as 'animus', not as yours (see ours; `self`: this process). The
// messages' text is wrapped afresh only where `prev` (an earlier layout's
// wraps) has no wrapping of it at this width; `wraps` holds those of this
// layout.
export function layoutChat(log: readonly Bubble[], sent: readonly Outgoing[], width: number, open: ReadonlySet<string>, names: Names, self = process.pid, prev?: Wraps): { lines: Line[]; folds: Fold[]; wraps: Wraps } {
  const lines: Line[] = [];
  const folds: Fold[] = [];
  const wraps: Wraps = new Map();
  const textW = Math.max(1, width - GUTTER);
  const indent: Seg = { text: ' '.repeat(GUTTER), tone: 'dim' };
  const speech = (id: string, who: string, tone: Tone, text: string, mark: Seg | null) => {
    const full = open.has(id);
    const had = prev?.get(id);
    // Folded, a line past the fold tells it folds.
    const e = had && had.text === text && had.width === textW && had.open === full ? had : { text, width: textW, open: full, lines: wrap(text, textW, full ? Infinity : FOLD + 2) };
    wraps.set(id, e);
    const all = e.lines.length ? e.lines : NOTHING;
    const folded = all.length > FOLD + 1 && !full;
    (folded ? all.slice(0, FOLD) : all).forEach((t, i) => lines.push([i === 0 ? { text: pad(fit(who, GUTTER - 1), GUTTER), tone } : indent, { text: t, tone: 'ink' }]));
    if (folded) {
      folds.push({ line: lines.length, id });
      lines.push([indent, moreLines(e)]);
    }
    if (!mark) return;
    const m = { ...mark, text: fit(mark.text, textW) };
    const last = lines[lines.length - 1];
    if (last.reduce((n, sg) => n + cells(sg.text), 0) + 2 + cells(m.text) <= width) last.push({ text: '  ', tone: 'dim' }, m);
    else lines.push([indent, m]);
  };
  const step = (b: Bubble) => {
    const mark: Seg | null =
      b.outcome === 'ok' ? { text: ' ✓', tone: 'good' } : b.outcome === 'failed' ? { text: ' ✗', tone: 'bad' } : b.outcome === 'refused' ? { text: ' refused', tone: 'dim' } : null;
    const head = `  ${activityGlyph(b.activity ?? 'run')} `;
    const room = width - cells(head) - (mark ? cells(mark.text) : 0);
    lines.push([{ text: head, tone: 'dim' }, { text: fit(b.text, room), tone: 'dim' }, ...(mark ? [mark] : [])]);
  };
  // A delivered message is drawn by its transcript entry; one whose entry
  // is gone (past the log's cap, or never linked) goes in by its time.
  const ids = new Set(log.map((b) => b.id));
  const shownBy = (o: Outgoing) => o.status === 'delivered' && !!o.bubble && ids.has(o.bubble);
  const delivered = new Map(sent.filter(shownBy).map((o) => [o.bubble!, o]));
  const waiting = sent.filter((o) => !shownBy(o));
  let k = 0;
  const upTo = (t: number) => {
    for (; k < waiting.length && waiting[k].at <= t; k++) speech(waiting[k].id, 'you →', 'you', waiting[k].text, status(waiting[k]));
  };
  for (const b of log) {
    if (b.at > 0) upTo(b.at - 1);
    if (b.kind === 'agent') speech(b.id, names.agent, 'name', b.text, null);
    else if (b.kind === 'user') speech(b.id, names.prompter, 'you', b.text, null);
    else if (b.kind === 'sent') {
      // An earlier run's message is shown but never as yours, nor with a
      // state: it was not followed. (The label is what the gutter holds.)
      if (!ours(b, self)) {
        speech(b.id, 'animus', 'dim', b.text, null);
        continue;
      }
      const o = delivered.get(b.id);
      speech(b.id, 'you →', 'you', b.text, o ? status(o) : null);
    } else if (b.kind === 'tool') step(b);
    else lines.push([{ text: '  thinking…', tone: 'dim' }]);
  }
  upTo(Infinity);
  return { lines, folds, wraps };
}
