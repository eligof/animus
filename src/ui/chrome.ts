import type { Activity, AgentEvent, AgentInfo } from '../agents.ts';
import { rested } from '../agents.ts';
import type { Account } from '../claude/account.ts';
import { isCheck } from '../claude/gains.ts';
import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import type { Theme } from '../themes/types.ts';
import type { Actor } from '../world/stage.ts';

// The chrome round the room: the room is the star, so the bars are
// margins, not panels. One ground colour under all of them, no rules or
// key chips; colour kept for who an agent is (its dot) and for what needs
// you (warn, bad).
//
//   header   brand, world; counts with no zeros (working, need you,
//            failing, idle), mode, clock
//   crew bar (left) NEEDS YOU pinned on top while anything does, then the
//            crew: a state shape in the agent's colour, its name, a dim
//            tool glyph; under it, what it is doing while there is room
//   row 1    the log: milestones only (finished, failed, your turn, asks
//            you, a test or build run), newest first, whole items only;
//            with no crew bar, what needs you pinned instead
//   row 2    the keys for now: an agent picked, its chat, an overlay,
//            paused

export type ChromeCtx = {
  theme: Theme;
  actors: Actor[];
  selectedId: string | null;
  account: Account | null;
  mode: string;
  events: AgentEvent[];
  notice: string;
  // A passing tip, at the start of the log row.
  tip?: string;
  t: number;
  now: number;
  paused: boolean;
  // No crew bar on screen (a narrow terminal, or the dashboard): the log
  // row pins what needs you instead, while anything does.
  pinNeeds?: boolean;
  // Where keys go in the chat window, when one is open (see World.chatFocus).
  chat?: 'input' | 'log' | null;
  // What is over the scene, so the hints can follow it.
  overlay?: 'none' | 'help' | 'picker';
  // The selected agent's card is showing (i hides it).
  card?: boolean;
  view?: 'scene' | 'dashboard';
  // r can switch to the scene (the terminal shows images).
  canScene?: boolean;
};

const GLYPHS: Record<Activity, string> = {
  write: '✎', read: '▤', search: '◎', run: '▶', web: '≋', delegate: '⇢', think: '…', talk: '»', done: '✔', idle: '◌', error: '✖',
};

export function activityGlyph(a: Activity): string {
  return GLYPHS[a];
}

export function activityColor(a: Activity, theme: Theme): RGB {
  const p = theme.palette;
  switch (a) {
    case 'done': return p.good;
    case 'error': return p.bad;
    case 'idle': return p.dim;
    case 'run': return p.warn;
    case 'web':
    case 'delegate': return p.accent2;
    default: return p.accent;
  }
}

export function elapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// Ages in ten-second steps (now, 10s … 50s, then minutes): calm to read,
// and a cell to send every ten seconds at most.
export function stepAge(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 10) return 'now';
  if (s < 60) return `${Math.floor(s / 10) * 10}s`;
  return elapsed(ms);
}

const len = (s: string) => [...s].length;

// `s` in at most `n` cells, cut only between words (one long word is cut
// with an ellipsis: it has nowhere else to break).
export function fitWords(s: string, n: number): string {
  if (n <= 0) return '';
  const cs = [...s];
  if (cs.length <= n) return s;
  if (n === 1) return '…';
  const head = cs.slice(0, n - 1).join('');
  // The head ends on a word's end when a space comes next.
  const sp = cs[n - 1] === ' ' ? head.length : head.lastIndexOf(' ');
  const cut = sp > 0 ? head.slice(0, sp) : head;
  return cut.replace(/[\s·,;:—-]+$/u, '') + '…';
}

// What an agent is doing, in `n` cells: in full when it fits, else its
// target alone (the tool's word goes: the glyph beside it says the kind,
// "fetch docs.anthropic.com" → "docs.anthropic.com"), cut between words.
export function fitDetail(a: Activity, detail: string, n: number): string {
  const d = detail.trim() || a;
  if (len(d) <= n) return d;
  const target = d.replace(/^(Read|NotebookRead|Edit|MultiEdit|Write|NotebookEdit|Grep|Glob|LS|fetch|search|\$|→)\s+/, '');
  return fitWords(target, n);
}

// ── State ────────────────────────────────────────────────────────────────

// One state per agent, worst first; the header's counts, the NEEDS YOU
// block and the crew's shapes all read it, so they never disagree:
//   error    its last tool call failed (and still stands)
//   input    blocked on you: a permission, a question, a plan to approve
//   turn     a lead whose turn ended: your move
//   working  at it
//   idle     a subagent waiting on its lead
//   done     a subagent finished, on its way out
export type Status = 'error' | 'input' | 'turn' | 'working' | 'idle' | 'done';

export function statusOf(a: AgentInfo): Status {
  if (a.activity === 'error') return 'error';
  if (a.needs === 'input' || a.needs === 'plan') return 'input';
  // A source that leaves `needs` out: a lead at rest is still your turn.
  if (a.needs === 'turn' || (a.activity === 'idle' && a.role === 'lead')) return 'turn';
  if (a.activity === 'idle') return 'idle';
  if (a.activity === 'done') return 'done';
  return 'working';
}

export const needsYou = (st: Status): boolean => st === 'error' || st === 'input' || st === 'turn';

// Each state its own shape, so the column reads without colour too.
const SHAPE: Record<Status, string> = { working: '●', input: '▲', turn: '◆', error: '✖', idle: '○', done: '✔' };

export function stateGlyph(st: Status): string {
  return SHAPE[st];
}

const RANK: Record<Status, number> = { error: 0, input: 1, turn: 2, working: 3, idle: 4, done: 5 };

export type Alert = { a: Actor; st: Status; why: string; since: number };

// What needs you: failing first, then blocked on you, then your turn;
// within each, the longest waiting first.
export function alertsOf(actors: readonly Actor[]): Alert[] {
  const out: Alert[] = [];
  for (const a of actors) {
    const st = statusOf(a.info);
    if (needsYou(st)) out.push({ a, st, why: reasonOf(a.info, st), since: a.info.since });
  }
  return out.sort((x, y) => RANK[x.st] - RANK[y.st] || x.since - y.since || (x.a.info.id < y.a.info.id ? -1 : 1));
}

function reasonOf(a: AgentInfo, st: Status): string {
  if (st === 'error') return 'failed';
  if (st === 'input') return a.needs === 'plan' ? 'plan ready' : 'asks you';
  return a.detail === 'interrupted' ? 'interrupted' : 'your turn';
}

// How long it has been at it: its working stretch while it works (a
// subagent's from when it arrived), else the time in its state.
function onTask(a: Actor, now: number): number {
  const v = a.info.vitals;
  if (statusOf(a.info) === 'working' && v && v.busySince && !rested(v, now)) return now - Math.max(v.busySince, a.info.role === 'sub' ? a.bornAt : 0);
  return now - a.info.since;
}

// Teams in order: each lead, then its subagents; subagents whose lead is
// gone after all teams.
type Row = { a: Actor; sub: boolean; team: number };

function teams(actors: readonly Actor[]): Row[] {
  const ids = new Set(actors.map((a) => a.info.id));
  const kids = new Map<string, Actor[]>();
  for (const a of actors) {
    const pid = a.info.role === 'sub' ? a.info.parentId : undefined;
    if (pid && ids.has(pid) && pid !== a.info.id) kids.set(pid, [...(kids.get(pid) ?? []), a]);
  }
  const out: Row[] = [];
  const placed = new Set<string>();
  let team = 0;
  for (const a of actors) {
    if (a.info.role !== 'lead' || placed.has(a.info.id)) continue;
    placed.add(a.info.id);
    out.push({ a, sub: false, team });
    for (const k of kids.get(a.info.id) ?? []) {
      placed.add(k.info.id);
      out.push({ a: k, sub: true, team });
    }
    team++;
  }
  for (const a of actors) if (!placed.has(a.info.id)) out.push({ a, sub: a.info.role === 'sub', team: team++ });
  return out;
}

// ── Drawing helpers ──────────────────────────────────────────────────────

// The ground every bar sits on: the world's own dark (about what the lit
// room's surround comes to), so the room floats in one field.
export function chromeBg(theme: Theme): RGB {
  return theme.palette.bg;
}

// The quiet text tones on that ground.
function tones(theme: Theme) {
  const p = theme.palette;
  const bg = chromeBg(theme);
  return {
    bg,
    text: p.panelText,
    soft: mix(p.panelText, bg, 0.3),
    dim: mix(p.dim, bg, 0.1),
    faint: mix(p.dim, bg, 0.45),
  };
}

function fillRow(s: Screen, r: Rect, y: number, bg: RGB): void {
  s.fill({ x: r.x, y, w: r.w, h: 1 }, ' ', undefined, bg);
}

type Seg = { s: string; fg: RGB; bold?: boolean };

const segLen = (segs: Seg[]) => segs.reduce((n, g) => n + len(g.s), 0);

function drawSegs(s: Screen, x: number, y: number, segs: Seg[], bg: RGB, end: number): number {
  for (const g of segs) x = s.text(x, y, g.s, g.fg, bg, g.bold ? BOLD : 0, end);
  return x;
}

// Whole items only, in order, `gap` between: what does not fit is left out,
// never cut mid-word. The first item alone may shrink (its last segment
// cut between words) so a line is never empty.
function fitItems(items: Seg[][], room: number, gap: number): Seg[][] {
  const out: Seg[][] = [];
  let used = 0;
  for (const it of items) {
    const w = segLen(it) + (out.length ? gap : 0);
    if (used + w <= room) {
      out.push(it);
      used += w;
      continue;
    }
    if (out.length === 0 && it.length) {
      const head = it.slice(0, -1);
      const last = it[it.length - 1];
      const left = room - segLen(head);
      if (left >= 4) out.push([...head, { ...last, s: fitWords(last.s, left) }]);
    }
    break;
  }
  return out;
}

const GAP = 3;

// ── Header ───────────────────────────────────────────────────────────────

export function drawHeader(s: Screen, r: Rect, c: ChromeCtx): void {
  const p = c.theme.palette;
  const k = tones(c.theme);
  fillRow(s, r, r.y, k.bg);
  const end = r.x + r.w - 2;
  // Lined up with the crew's shapes below it. Still: a brand that shimmers
  // repaints every frame for nothing.
  let x = r.x + 2;
  x = s.text(x, r.y, '◆', p.accent, k.bg, 0, end);
  x = s.text(x + 1, r.y, 'animus', k.dim, k.bg, 0, end);
  x = s.text(x + 2, r.y, c.theme.name, k.text, k.bg, BOLD, end);
  if (c.paused) x = s.text(x + 3, r.y, '❚❚ paused', p.warn, k.bg, BOLD, end);

  const n: Record<Status, number> = { error: 0, input: 0, turn: 0, working: 0, idle: 0, done: 0 };
  for (const a of c.actors) n[statusOf(a.info)]++;
  const needs = n.input + n.turn;
  const idle = n.idle + n.done;
  const clock = new Date(c.now);
  const hhmm = `${String(clock.getHours()).padStart(2, '0')}:${String(clock.getMinutes()).padStart(2, '0')}`;
  const count = (v: number, word: string, ink: RGB, wordInk: RGB): Seg[] => [{ s: `${v}`, fg: ink, bold: ink !== k.text }, { s: ` ${word}`, fg: wordInk }];
  // Only counts that are there; least needed first out when short:
  // account, idle, clock, mode.
  const items: Array<{ segs: Seg[]; keep: number }> = [];
  if (n.working) items.push({ segs: count(n.working, 'working', k.text, k.dim), keep: 5 });
  if (needs) items.push({ segs: count(needs, needs === 1 ? 'needs you' : 'need you', p.warn, p.warn), keep: 6 });
  if (n.error) items.push({ segs: count(n.error, 'failing', p.bad, p.bad), keep: 7 });
  if (idle) items.push({ segs: count(idle, 'idle', k.text, k.dim), keep: 2 });
  items.push({ segs: [{ s: c.account ? c.account.name : 'not signed in', fg: k.dim }], keep: 1 });
  // Demo agents are made up: say so, warm.
  items.push({ segs: [{ s: c.mode, fg: c.mode === 'live' ? k.dim : p.warn }], keep: 4 });
  items.push({ segs: [{ s: hhmm, fg: k.dim }], keep: 3 });
  const width = () => items.reduce((m, it, i) => m + segLen(it.segs) + (i ? 3 : 0), 0);
  while (items.length > 1 && end - width() < x + 3) {
    let lo = 0;
    for (let i = 1; i < items.length; i++) if (items[i].keep < items[lo].keep) lo = i;
    items.splice(lo, 1);
  }
  let rx = end - width();
  if (rx < x + 3) return;
  items.forEach((it, i) => {
    if (i) rx = s.text(rx, r.y, ' · ', k.faint, k.bg, 0, end);
    rx = drawSegs(s, rx, r.y, it.segs, k.bg, end);
  });
}

// ── Crew bar ─────────────────────────────────────────────────────────────

// Tools worth a glyph at the row's end; thinking, waiting and the rest
// have their say in the state shape.
const TOOLISH: ReadonlySet<Activity> = new Set(['write', 'read', 'search', 'run', 'web', 'delegate', 'talk']);
const ALERT_ROWS = 6;

// Down the left: what needs you, pinned on top while anything does, then
// the crew, team by team (subagents two cells in, a blank row between
// teams). Each row: a state shape in the agent's colour, its name, how
// long it has been at it (once that is a while) and a dim tool glyph.
// Under a working agent, what it is doing, while the whole crew fits with
// those lines; under the selected one always.
export function drawRoster(s: Screen, r: Rect, c: ChromeCtx): void {
  const p = c.theme.palette;
  const k = tones(c.theme);
  for (let y = r.y; y < r.y + r.h; y++) fillRow(s, r, y, k.bg);
  // A cell of air on the side that faces the room.
  const right = r.x + r.w - 1;
  const bottom = r.y + r.h;
  // A row of air under the header.
  let y = r.y + 1;
  const lift = mix(k.bg, k.text, 0.07);
  const mark = (yy: number, a: Actor) => {
    s.fill({ x: r.x, y: yy, w: r.w - 1, h: 1 }, ' ', undefined, lift);
    s.put(r.x, yy, '▌', a.traits.color, k.bg);
  };

  const alerts = alertsOf(c.actors);
  if (alerts.length && bottom - y >= 3) {
    s.text(r.x + 2, y, 'NEEDS YOU', k.dim, k.bg, BOLD, right);
    s.text(r.x + 12, y, `${alerts.length}`, p.warn, k.bg, BOLD, right);
    y++;
    const cap = Math.max(1, Math.min(ALERT_ROWS, Math.floor((bottom - y) / 3)));
    const shown = alerts.length > cap ? cap - 1 : alerts.length;
    for (const al of alerts.slice(0, shown)) {
      const sel = al.a.info.id === c.selectedId;
      const bg = sel ? lift : k.bg;
      if (sel) mark(y, al.a);
      const tone = al.st === 'error' ? p.bad : p.warn;
      s.put(r.x + 2, y, SHAPE[al.st], tone, bg, BOLD);
      // The wait, right-aligned in a column three wide; the reason before
      // it, so reasons and ages line up down the block. A name too long to
      // sit beside its reason keeps the room: the shape says the reason.
      const age = stepAge(c.now - al.since);
      s.text(right - len(age), y, age, k.dim, bg, 0, right);
      const nameX = r.x + 4;
      const whyX = right - 4 - len(al.why);
      const name = al.a.info.name;
      const why = len(name) <= whyX - 1 - nameX;
      if (why) s.text(whyX, y, al.why, mix(tone, bg, 0.15), bg, 0, right - 4);
      const nameEnd = why ? whyX - 1 : right - 4;
      s.text(nameX, y, fitWords(name, nameEnd - nameX), k.text, bg, al.a.info.role === 'lead' ? BOLD : 0, nameEnd);
      y++;
    }
    if (shown < alerts.length) {
      s.text(r.x + 4, y, `+${alerts.length - shown} more`, k.dim, k.bg, 0, right);
      y++;
    }
    y++;
  }
  if (y >= bottom) return;

  const rows = teams(c.actors);
  type Line = { row: Row; detail: boolean } | null;
  const build = (all: boolean, gaps: boolean): Line[] => {
    const out: Line[] = [];
    rows.forEach((row, i) => {
      if (gaps && i > 0 && row.team !== rows[i - 1].team) out.push(null);
      out.push({ row, detail: false });
      const sel = row.a.info.id === c.selectedId;
      if (sel || (all && statusOf(row.a.info) === 'working')) out.push({ row, detail: true });
    });
    return out;
  };
  const room = bottom - y;
  // Roomiest first: every working agent's line, then the selected one's
  // only, then no gaps between teams.
  let lines = build(true, true);
  if (lines.length > room) lines = build(false, true);
  if (lines.length > room) lines = build(false, false);
  let more = 0;
  if (lines.length > room) {
    // Still too many: a window that keeps the selected agent in view.
    const fit = Math.max(1, room - 1);
    const sel = Math.max(0, lines.findIndex((l) => l?.row.a.info.id === c.selectedId));
    const start = Math.max(0, Math.min(sel - Math.floor(fit / 2), lines.length - fit));
    more = lines.filter((l, i) => l && !l.detail && (i < start || i >= start + fit)).length;
    lines = lines.slice(start, start + fit);
  }
  for (const l of lines) {
    if (l === null) {
      y++;
      continue;
    }
    const a = l.row.a;
    const info = a.info;
    const st = statusOf(info);
    const sel = info.id === c.selectedId;
    const bg = sel ? lift : k.bg;
    if (sel) mark(y, a);
    // Subagents sit two cells in under their lead: indent, not tree lines.
    const dotX = r.x + (l.row.sub ? 4 : 2);
    const nameX = dotX + 2;
    const quiet = st === 'idle' || st === 'done';
    if (l.detail) {
      s.text(nameX, y, fitDetail(info.activity, info.detail, right - nameX), sel ? k.soft : k.dim, bg, 0, right);
      y++;
      continue;
    }
    s.put(dotX, y, SHAPE[st], quiet ? mix(a.traits.color, k.bg, 0.5) : a.traits.color, bg, needsYou(st) ? BOLD : 0);
    // The tool's glyph in the last column (it changes only on a switch of
    // tool); the alerts' reasons live in NEEDS YOU, not here.
    const glyphX = right - 1;
    if (st === 'working' && TOOLISH.has(info.activity)) s.put(glyphX, y, GLYPHS[info.activity], mix(activityColor(info.activity, c.theme), bg, 0.4), bg);
    // Seconds are noise: the time shows from a minute, and goes warm once
    // one step has taken five (a stuck tool).
    let nameEnd = glyphX - 1;
    const ms = onTask(a, c.now);
    if ((st === 'working' || st === 'idle') && ms >= 60_000) {
      const age = elapsed(ms);
      const stuck = st === 'working' && c.now - info.since >= 300_000;
      s.text(glyphX - 1 - len(age), y, age, stuck ? p.warn : k.dim, bg, 0, glyphX - 1);
      nameEnd = glyphX - 2 - len(age);
    }
    const lead = !l.row.sub;
    const ink = sel ? a.traits.color : quiet ? k.faint : lead || needsYou(st) ? k.text : k.soft;
    s.text(nameX, y, fitWords(info.name, nameEnd - nameX), ink, bg, lead || sel ? BOLD : 0, nameEnd);
    y++;
  }
  if (more > 0) s.text(r.x + 2, bottom - 1, `+${more} more`, k.dim, k.bg, 0, right);
}

// ── Bottom rows ──────────────────────────────────────────────────────────

type Mile = { e: AgentEvent; glyph: string; tone: RGB; text: string };

// A milestone worth the log: what finished or failed, waits for you, or
// ran a test or a build. Reads, edits, searches and thinking are the crew
// bar's and the room's (what each does now), not news.
function milestone(e: AgentEvent, byId: Map<string, Actor>, theme: Theme): Mile | null {
  const p = theme.palette;
  switch (e.activity) {
    case 'error':
      return { e, glyph: SHAPE.error, tone: p.bad, text: 'failed' };
    case 'done':
      return { e, glyph: SHAPE.done, tone: p.good, text: 'finished' };
    case 'idle':
      // A lead's turn over; a subagent waiting on its lead is not news.
      if (e.needs !== 'turn' && byId.get(e.agentId)?.info.role !== 'lead') return null;
      return { e, glyph: SHAPE.turn, tone: p.warn, text: e.detail === 'interrupted' ? 'interrupted' : 'your turn' };
    case 'talk':
      if (e.needs === 'input' || e.needs === 'plan') return { e, glyph: SHAPE.input, tone: p.warn, text: e.needs === 'plan' ? 'plan ready' : 'asks you' };
      return null;
    case 'run': {
      const cmd = e.detail.replace(/^\$\s*/, '');
      return isCheck(cmd) ? { e, glyph: GLYPHS.run, tone: mix(p.warn, p.dim, 0.4), text: cmd } : null;
    }
    default:
      return null;
  }
}

function logItems(c: ChromeCtx, k: ReturnType<typeof tones>): Seg[][] {
  const byId = new Map(c.actors.map((a) => [a.info.id, a] as const));
  const seen = new Set<string>();
  const items: Seg[][] = [];
  for (let i = c.events.length - 1; i >= 0 && items.length < 12; i--) {
    const m = milestone(c.events[i], byId, c.theme);
    if (!m) continue;
    // One line per agent and news: the newest.
    const key = `${m.e.agentId}\n${m.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // The newest reads in full; the rest step back.
    const back = items.length === 0 ? 0 : 0.4;
    const who = byId.get(m.e.agentId)?.traits.color ?? k.text;
    const alert = m.glyph === SHAPE.error || m.glyph === SHAPE.turn || m.glyph === SHAPE.input;
    items.push([
      { s: m.glyph, fg: mix(m.tone, k.bg, back), bold: true },
      { s: ' ', fg: k.dim },
      { s: fitWords(m.e.name, 18), fg: mix(who, k.bg, back) },
      { s: ' ', fg: k.dim },
      { s: fitWords(m.text, 28), fg: mix(alert ? m.tone : k.soft, k.bg, back) },
      { s: ' ', fg: k.dim },
      { s: stepAge(c.now - m.e.at), fg: k.faint },
    ]);
  }
  return items;
}

// What needs you, for the log row when there is no crew bar: whole items,
// and "+N" for the rest.
function pinItems(c: ChromeCtx, k: ReturnType<typeof tones>, alerts: Alert[], room: number): Seg[][] {
  const p = c.theme.palette;
  const head: Seg[] = [{ s: 'needs you', fg: p.warn, bold: true }];
  const items = alerts.map((al): Seg[] => {
    const tone = al.st === 'error' ? p.bad : p.warn;
    return [
      { s: SHAPE[al.st], fg: tone, bold: true },
      { s: ' ', fg: k.dim },
      { s: fitWords(al.a.info.name, 18), fg: k.text },
      { s: ' ', fg: k.dim },
      { s: al.why, fg: tone },
      { s: ' ', fg: k.dim },
      { s: stepAge(c.now - al.since), fg: k.dim },
    ];
  });
  // As many as fit with room left for "+N" after them.
  for (let n = items.length; n >= 1; n--) {
    const tail: Seg[][] = n < items.length ? [[{ s: `+${items.length - n}`, fg: p.warn, bold: true }]] : [];
    const all = [head, ...items.slice(0, n), ...tail];
    if (all.reduce((m, it, i) => m + segLen(it) + (i ? GAP : 0), 0) <= room) return all;
  }
  return [head, [{ s: `+${items.length}`, fg: p.warn, bold: true }]];
}

type Hint = { key: string; label: string; keep: number };
const h = (key: string, label: string, keep: number): Hint => ({ key, label, keep });

// Only the keys this moment uses; `?` lists the rest.
function hintsFor(c: ChromeCtx): Hint[] {
  // While the chat's input has focus every app key types, so these instead.
  if (c.chat === 'input') return [h('enter', 'send', 9), h('esc', 'stop typing', 8), h('↑↓', 'scroll', 4), h('ctrl-c', 'quit', 2)];
  const pause = c.paused ? [h('space', 'resume', 10)] : [];
  if (c.chat === 'log') return [...pause, h('enter', 'write', 9), h('↑↓', 'scroll', 6), h('esc', 'close', 8), h('q', 'quit', 2)];
  if (c.overlay === 'picker') return [h('↑↓', 'try a world', 9), h('enter', 'keep', 8), h('esc', 'put back', 7), h('1-9', 'jump', 3)];
  if (c.overlay === 'help') return [h('esc', 'close', 9), h('q', 'quit', 2)];
  if (c.actors.some((a) => a.info.id === c.selectedId)) {
    return [
      ...pause,
      h('enter', 'talk', 9), h('c', 'cheer', 5), h('tab', 'next', 8),
      h('i', c.card === false ? 'show card' : 'hide card', 3), h('esc', 'back', 7), h('?', 'keys', 6),
    ];
  }
  const view = c.canScene === false ? [] : [h('r', c.view === 'dashboard' ? 'scene' : 'dashboard', 4)];
  return [
    ...pause,
    h('tab', 'pick an agent', 9), h('p', 'worlds', 5), ...view,
    ...(c.paused ? [] : [h('space', 'pause', 3)]), h('?', 'keys', 8), h('q', 'quit', 2),
  ];
}

// The two bottom rows. Row 1 says one thing: a tip or a notice when there
// is one, then (with no crew bar) what needs you, else the log. Row 2
// offers the keys for now.
export function drawFooter(s: Screen, r: Rect, c: ChromeCtx): void {
  const p = c.theme.palette;
  const k = tones(c.theme);
  fillRow(s, r, r.y, k.bg);
  fillRow(s, r, r.y + 1, k.bg);
  const x0 = r.x + 2;
  const end = r.x + r.w - 2;
  const room = end - x0;

  const items: Seg[][] = [];
  if (c.tip) items.push([{ s: c.tip, fg: p.accent }]);
  if (c.notice) items.push([{ s: c.notice, fg: p.warn }]);
  const alerts = c.pinNeeds ? alertsOf(c.actors) : [];
  let line: Seg[][];
  if (alerts.length) {
    const lead = fitItems(items, room, GAP);
    const used = lead.reduce((m, it, i) => m + segLen(it) + (i ? GAP : 0), 0);
    line = [...lead, ...pinItems(c, k, alerts, room - used - (lead.length ? GAP : 0))];
  } else {
    if (!c.notice) {
      const log = logItems(c, k);
      items.push(...(log.length ? log : [[{ s: 'no news yet', fg: k.faint }]]));
    }
    line = fitItems(items, room, GAP);
  }
  let x = x0;
  line.forEach((it, i) => {
    if (i) x += GAP;
    x = drawSegs(s, x, r.y, it, k.bg, end);
  });

  // Hints: drop the least needed until the rest fit whole.
  const hints = hintsFor(c);
  const hw = (hs: Hint[]) => hs.reduce((m, q, i) => m + len(q.key) + 1 + len(q.label) + (i ? GAP : 0), 0);
  while (hints.length > 1 && hw(hints) > room) {
    let lo = 0;
    for (let i = 1; i < hints.length; i++) if (hints[i].keep < hints[lo].keep) lo = i;
    hints.splice(lo, 1);
  }
  x = x0;
  hints.forEach((q, i) => {
    if (i) x += GAP;
    const hot = q.key === 'space' && q.label === 'resume';
    x = s.text(x, r.y + 1, q.key, hot ? p.warn : k.text, k.bg, BOLD, end);
    x = s.text(x + 1, r.y + 1, q.label, hot ? p.warn : k.dim, k.bg, 0, end);
  });
}
