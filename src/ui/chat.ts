import type { AgentInfo, Bubble } from '../agents.ts';
import type { Outgoing } from '../claude/inbox.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import type { Key } from '../term/terminal.ts';
import type { Palette } from '../themes/types.ts';
import { CARD_H, CARD_W, drawFrame, fit, inks, legible, placeCard } from './card.ts';
import type { Box, Placement, Side } from './card.ts';
import { ChatInput } from './chat-input.ts';
import { layoutChat } from './chat-lines.ts';
import type { Fold, Line, Tone, Wraps } from './chat-lines.ts';

// The chat window: the selected agent's card grown into its conversation
// (see chat-lines.ts), an input line at the bottom. Placed by the card's
// rules (beside its character, else the corner that covers the least of
// it, always inside the scene), as big as the scene allows up to CHAT_MAX.
//
//   ╭─ nova · lead ─────────────────────────────────╮
//   │ you    Fix the tokenizer edge case            │
//   │ nova   On it. I'll start by reading the code  │
//   │        around it.                             │
//   │   ▶ $ npm test ✓                              │
//   │ you →  add a test too  ✓ delivered            │
//   ├───────────────────────────────────────────────┤
//   │ › and the docs▏                               │
//   ╰─ [⏎] send  [↑↓] scroll  [esc] leave ──────────╯

// How many layouts have been made (the tests watch the cache by it).
export const chatStats = { layouts: 0 };

export const CHAT_MAX = { w: 72, h: 24 };

// The window's state for one agent, kept while it is closed so a draft and
// the messages sent stay.
export type ChatView = {
  id: string;
  // Where keys go: the input line, or the log (scrolling; Esc goes back
  // to the card).
  focus: 'input' | 'log';
  input: ChatInput;
  sent: Outgoing[];
  open: Set<string>; // messages shown in full
  top: number | null; // the first line shown (null: following the newest)
  // As of the last draw: the first line shown, the lines, the log's rows,
  // and the folded message Enter opens (the lowest in view).
  first: number;
  total: number;
  rows: number;
  more: string | null;
  // The window's height so far (it only grows while the view lives), and
  // the layout last drawn (see Layout).
  h: number;
  cache: Layout | null;
  from: number; // the first character of the draft shown (sticky: moves when the cursor leaves the view)
};

// A layout of the conversation in one (log, sent, open) state, its `key`
// (see layoutKey), at the window width `w`: its lines, its folds and its
// messages' wrapped text (for the next layout to take what it can). And for
// that state, how many lines it takes at each width tried.
export type Layout = { key: string; w: number; lines: Line[]; folds: Fold[]; wraps: Wraps; counts: Map<number, number> };

export function newChatView(id: string): ChatView {
  return { id, focus: 'input', input: new ChatInput(), sent: [], open: new Set(), top: null, first: 0, total: 0, rows: 0, more: null, h: 0, cache: null, from: 0 };
}

export type ChatOpts = {
  info: AgentInfo;
  log: readonly Bubble[];
  reach: string | null; // why it cannot be sent to (null: it can)
  color: RGB; // the agent's own colour
  palette: Palette;
};

const cells = (s: string) => [...s].length;

// The window's size in `scene`: some 60% of its width and nearly its
// height, never under the card's size nor over CHAT_MAX or the scene.
export function chatSize(scene: Rect): { w: number; h: number } {
  const w = Math.max(CARD_W, Math.min(CHAT_MAX.w, Math.floor(scene.w * 0.6)));
  const h = Math.max(CARD_H, Math.min(CHAT_MAX.h, scene.h - 2));
  return { w: Math.min(w, scene.w), h: Math.min(h, scene.h) };
}

// Moves the view `d` lines (up is negative), from where the last draw
// left it or the keys since; at the bottom it follows the newest again.
function scrollBy(v: ChatView, d: number): void {
  const last = Math.max(0, v.total - v.rows);
  const top = Math.max(0, Math.min(last, Math.min(v.top ?? last, last) + d));
  v.top = top >= last ? null : top;
}

// What the layout depends on, as a short string: the log's size, end and
// text, the steps settled (each outcome counted apart: a step is settled
// in place, pending until then), the messages sent and their states, the
// names and the folds open.
function layoutKey(o: ChatOpts, v: ChatView): string {
  let chars = 0;
  const marks = { ok: 0, failed: 0, refused: 0, pending: 0 };
  for (const b of o.log) {
    chars += b.text.length;
    if (b.outcome) marks[b.outcome]++;
  }
  const last = o.log[o.log.length - 1];
  const sent = v.sent.map((m) => `${m.id}/${m.status}/${m.bubble ?? ''}/${m.text.length}/${m.reason.length}`).join(',');
  return [o.log.length, last?.id, last?.text.length, chars, `${marks.ok}/${marks.failed}/${marks.refused}`, sent, v.open.size, [...v.open].join(','), o.info.name, o.info.role].join('|');
}

export type ChatPlacement = Placement & { w: number; h: number };

// Draws the window for a character covering `box` (null: none in view;
// docked), on the `prefer` side when it fits, and says where it went
// (null: nowhere, the scene is smaller than the card). Notes in `v` what
// it showed, for the keys (see chatKey). All conversation text reaches the
// screen cell-safe: the lines are wrapped through cellSafe (chat-lines.ts)
// and Screen.text applies it again to whatever it draws.
export function drawChat(s: Screen, scene: Rect, v: ChatView, o: ChatOpts, box: Box | null, prefer: Side | null = null): ChatPlacement | null {
  if (scene.w < CARD_W || scene.h < CARD_H) return null;
  const size = chatSize(scene);
  // The lines depend on the width alone (the window then takes the height
  // they need, never less than it had), so lay out first. Narrower widths
  // are tried before covering the character.
  const key = layoutKey(o, v);
  const kept = v.cache;
  const counts = kept?.key === key ? kept.counts : new Map<number, number>();
  const names = { agent: o.info.name, prompter: o.info.role === 'sub' ? 'task' : 'you' };
  // The layouts made in this draw, by width; each takes the messages'
  // wrapping from the one last drawn wherever it still holds.
  const made = new Map<number, Layout>();
  const layout = (w: number): Layout => {
    if (kept?.key === key && kept.w === w) return kept;
    let l = made.get(w);
    if (!l) {
      chatStats.layouts++;
      l = { key, w, ...layoutChat(o.log, v.sent, w - 4, v.open, names, undefined, kept?.wraps), counts };
      made.set(w, l);
      counts.set(w, l.lines.length);
    }
    return l;
  };
  const count = (w: number) => counts.get(w) ?? layout(w).lines.length;
  // A conversation that fills the tallest window at full width fills it at
  // every narrower one too (narrower, it takes no fewer lines): the height
  // is then the same at every width, and trying widths takes no layouts.
  const filled = v.h >= size.h || count(size.w) + 4 >= size.h;
  const heightAt = (w: number) => (filled ? size.h : Math.min(size.h, Math.max(v.h, CARD_H, count(w) + 4)));
  let w = size.w;
  if (box) {
    // The side it is on wins at any width before the other side is
    // considered, so a character drifting about the middle does not flip it.
    const fits = (t: number, only: Side | null) => {
      const p = placeCard(scene, box, only, { w: t, h: heightAt(t) });
      return p.side !== null && (only === null || p.side === only);
    };
    const pass = prefer ? [prefer, null] : [null];
    search: for (const only of pass) {
      for (let t = size.w; t >= CARD_W; t--) {
        if (fits(t, only)) {
          w = t;
          break search;
        }
      }
    }
  }
  const h = heightAt(w);
  v.h = h;
  // Only the layout drawn is kept, for the next draw.
  const drawn = layout(w);
  v.cache = drawn;
  const at = { ...placeCard(scene, box, prefer, { w, h }), w, h };
  const { x, y } = at;
  const p = o.palette;
  const { bg, ink, edge, dim } = inks(p);
  const right = x + w - 1;
  const cx = x + 2; // content left
  const end = right - 1; // content limit (exclusive)
  const inner = end - cx;
  const me = legible(o.color, bg, ink, 4.5);
  const tone: Record<Tone, RGB> = { ink, dim, name: me, you: p.accent, good: p.good, warn: p.warn, bad: p.bad };
  drawFrame(s, { x, y, w, h }, edge, ink, bg);
  // Top edge: whose conversation.
  s.put(cx, y, ' ', ink, bg);
  const nx = s.text(cx + 1, y, fit(o.info.name, 16), me, bg, BOLD, end);
  s.text(nx, y, ` · ${o.info.role} `, dim, bg, 0, end);
  // The log, between the top edge and the separator.
  const rows = h - 4;
  const { lines, folds } = drawn;
  const last = Math.max(0, lines.length - rows);
  if (v.top !== null && v.top >= last) v.top = null;
  const first = v.top ?? last;
  Object.assign(v, { first, total: lines.length, rows, more: null });
  let moreAt = -1;
  for (const f of folds) {
    if (f.line >= first && f.line < first + rows) {
      v.more = f.id;
      moreAt = f.line;
    }
  }
  // Newest at the bottom, next to the input: a short log sits low.
  const shownN = Math.min(rows, lines.length - first);
  const ly = y + 1 + rows - shownN;
  for (let j = 0; j < shownN; j++) {
    let px = cx;
    for (const sg of lines[first + j]) px = s.text(px, ly + j, sg.text, tone[sg.tone], bg, sg.tone === 'name' ? BOLD : 0, end);
    if (first + j === moreAt) s.text(px, ly + j, '  [⏎] more', p.accent, bg, 0, end);
  }
  if (!lines.length) s.text(cx, y + rows, 'nothing said yet', dim, bg, 0, end);
  // The separator: why it cannot be sent to, and what is below the view.
  const sy = y + h - 3;
  for (let i = x + 1; i < right; i++) s.put(i, sy, '─', edge, bg);
  s.put(x, sy, '├', edge, bg);
  s.put(right, sy, '┤', edge, bg);
  const below = lines.length - (first + rows);
  const more = below > 0 ? ` ↓ ${below} more ` : '';
  if (o.reach) s.text(cx, sy, ` ${fit(`can't send: ${o.reach}`, inner - 2 - cells(more))} `, p.warn, bg, 0, end);
  if (more) s.text(end - cells(more), sy, more, dim, bg, 0, end);
  // The input line.
  const iy = y + h - 2;
  const typing = v.focus === 'input';
  s.text(cx, iy, '›', typing ? p.accent : dim, bg);
  const tx = cx + 2;
  const room = end - tx; // cells for the text and the cursor
  const chars = v.input.shown;
  if (typing) {
    // The view holds still until the cursor leaves it.
    let from = Math.min(v.from, Math.max(0, chars.length - (room - 1)));
    if (v.input.cursor < from) from = v.input.cursor;
    else if (v.input.cursor - from > room - 1) from = v.input.cursor - (room - 1);
    v.from = from;
    s.text(tx, iy, chars.slice(from, from + room).join(''), ink, bg, 0, end);
    // The cursor: its cell inverted.
    const cur = tx + v.input.cursor - from;
    s.put(cur, iy, chars[v.input.cursor] ?? ' ', bg, ink);
    if (!chars.length) s.text(cur + 1, iy, o.reach ? 'type here; ⏎ copies it' : 'type a message', dim, bg, 0, end);
  } else {
    s.text(tx, iy, fit(chars.length ? chars.join('') : o.reach ? '⏎ to write (it is copied, not sent)' : '⏎ to write', room), dim, bg, 0, end);
  }
  // Bottom edge: the keys.
  // Only what Enter would do: write (from the log), send or copy a draft,
  // open the fold in view; with none of those it does nothing.
  const enter = !typing ? '[⏎] write  ' : v.input.text.trim() ? (o.reach ? '[⏎] copy  ' : '[⏎] send  ') : v.more ? '[⏎] more  ' : '';
  s.text(cx, y + h - 1, ` ${enter}[↑↓] scroll  ${typing ? '[esc] leave' : '[esc] card'} `, dim, bg, 0, end);
  return at;
}

// What closing the window does to its view: the layout kept for drawing
// goes (the draft, the messages sent and the folds opened stay).
export function closeChat(v: ChatView): void {
  v.cache = null;
}

// What a key does in the chat window. Up, Down, PageUp and PageDown scroll
// in either focus. In the input every other key is the line's (q types q):
// Enter submits a draft or, with none, opens the message marked [⏎] more;
// Esc leaves the input for the log. In the log Enter goes back to the
// input, Home and End jump, Esc closes the window ('close'), and any other
// key is the app's ('pass').
export type ChatAction = 'submit' | 'close' | 'pass' | null;

export function chatKey(v: ChatView, k: Key): ChatAction {
  const page = Math.max(1, v.rows - 1);
  switch (k.name) {
    case 'up':
      scrollBy(v, -1);
      return null;
    case 'down':
      scrollBy(v, 1);
      return null;
    case 'pageup':
      scrollBy(v, -page);
      return null;
    case 'pagedown':
      scrollBy(v, page);
      return null;
  }
  if (v.focus === 'log') {
    switch (k.name) {
      case 'escape':
        return 'close';
      case 'enter':
        v.focus = 'input';
        return null;
      case 'home':
        v.top = 0;
        return null;
      case 'end':
        v.top = null;
        return null;
    }
    return 'pass';
  }
  if (k.name === 'escape') {
    v.focus = 'log';
    return null;
  }
  if (k.name === 'enter') {
    if (v.input.text.trim()) return 'submit';
    if (v.more) {
      // Opened in place: the view holds still while it grows.
      v.open.add(v.more);
      if (v.top === null) v.top = v.first;
    }
    return null;
  }
  v.input.key(k);
  return null;
}
