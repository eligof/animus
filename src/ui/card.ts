import type { AgentInfo } from '../agents.ts';
import { rested } from '../agents.ts';
import type { Meter, Meters } from '../pet/meters.ts';
import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { cellSafe } from '../term/width.ts';
import type { Palette } from '../themes/types.ts';
import { activityGlyph, elapsed } from './chrome.ts';

// The selected agent's card: terminal text over the scene beside its
// character (like the labels, crisp at any zoom), with its pet meters and
// plain facts. Meters are words, not emoji: emoji are double width in some
// terminals and would break the frame. Their bars are box-drawing lines
// (heavy where filled, light where not), which terminals draw as one
// continuous stroke: slim even in tall cells, where blocks look heavy.
//
//   ╭─ ★3 nova · lead ──────────────────── 4m ─╮
//   │ ✎ Edit src/parser.ts                     │
//   │ "Fix the tokenizer edge case"       main │
//   │ context ━━━━━━━━──  78%                  │
//   │ energy  ━━━━━━━━──  80%                  │
//   │ health  ━━━━━━━━━━   ok   mood ▲12       │
//   │ opus 5.5 · 9m on task · 3 subagents      │
//   ╰─ [⏎]talk  [c]heer  [tab] next  [esc] ────╯

export const CARD_W = 44;
export const CARD_H = 8;
// A box to place: the card, or the chat window it grows into.
export type Size = { w: number; h: number };
const CARD: Size = { w: CARD_W, h: CARD_H };
const GAP = 1; // cells kept clear between the character and the card
const BAR = 10;
// Column offsets inside the card (from its left edge).
const TEXT_X = 2; // where content starts
const INNER_W = CARD_W - 2 * TEXT_X; // content cells per row
const BAR_X = 10; // a meter's first bar cell
const VAL_X = 20; // a meter's value
const MOOD_X = 28; // the 'mood' label
const MOODV_X = 33; // its arrow and streak
const BRANCH_MAX = 14;

// The cells a character covers on screen, ends inclusive (see figureBox).
export type Box = { x0: number; y0: number; x1: number; y1: number };
export type Side = 'right' | 'left' | 'above' | 'below';
const SIDES: readonly Side[] = ['right', 'left', 'above', 'below'];
// Where the card goes: its top-left cell, and the side of its character it
// took (null: docked in a corner).
export type Placement = { x: number; y: number; side: Side | null };

export type CardOpts = {
  info: AgentInfo;
  meters: Meters | null;
  subs: number; // its live subagents
  color: RGB; // the agent's own colour
  palette: Palette;
  now: number;
};

// 'claude-opus-5-5' → 'opus 5.5' (a date suffix dropped); anything else as is.
export function modelName(m: string): string {
  const k = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(m);
  return k ? `${k[1]} ${k[2]}.${k[3]}` : m;
}

export function tokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 999_500) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Where the card (or a box of another `size`) goes for a character
// covering `box`: beside it with a cell between, on the first side with
// room (`prefer`, the side it took last frame, so it does not flip back
// and forth as its character moves; then right, left, above, below),
// centred on it and inside the scene. With no room on any side it docks in
// a corner: one that keeps clear of it whenever any does; else one that
// spares its head (the top row, over a hat too), covering the least of it;
// the farthest such.
// With no character in view it docks in the bottom-right corner.
export function placeCard(scene: Rect, box: Box | null, prefer: Side | null = null, size: Size = CARD): Placement {
  const W = size.w;
  const H = size.h;
  const maxX = scene.x + scene.w - W;
  const maxY = scene.y + scene.h - H;
  const clampX = (x: number) => Math.max(scene.x, Math.min(maxX, x));
  const clampY = (y: number) => Math.max(scene.y, Math.min(maxY, y));
  if (!box || ![box.x0, box.y0, box.x1, box.y1].every(Number.isFinite)) return { x: clampX(maxX - 1), y: clampY(maxY - 1), side: null };
  const midX = clampX(Math.round((box.x0 + box.x1 + 1 - W) / 2));
  const midY = clampY(Math.round((box.y0 + box.y1 + 1 - H) / 2));
  const spots: Record<Side, [number, number]> = {
    right: [box.x1 + 1 + GAP, midY],
    left: [box.x0 - GAP - W, midY],
    above: [midX, box.y0 - GAP - H],
    below: [midX, box.y1 + 1 + GAP],
  };
  for (const side of prefer ? [prefer, ...SIDES] : SIDES) {
    const [x, y] = spots[side];
    if (x >= scene.x && x <= maxX && y >= scene.y && y <= maxY) return { x, y, side };
  }
  // The corners, a cell in from the scene's edges, then flush with them.
  const cx = (box.x0 + box.x1 + 1) / 2;
  const cy = (box.y0 + box.y1 + 1) / 2;
  let best: { p: Placement; key: number[] } | null = null;
  for (const inset of [1, 0]) {
    for (const [right, bottom] of [[1, 1], [0, 1], [1, 0], [0, 0]]) {
      const x = clampX(right ? maxX - inset : scene.x + inset);
      const y = clampY(bottom ? maxY - inset : scene.y + inset);
      const cols = Math.max(0, Math.min(x + W - 1, box.x1) - Math.max(x, box.x0) + 1);
      const rows = Math.max(0, Math.min(y + H - 1, box.y1) - Math.max(y, box.y0) + 1);
      const head = cols > 0 && y <= box.y0 && box.y0 <= y + H - 1 ? 1 : 0;
      const far = (x + W / 2 - cx) ** 2 + (y + H / 2 - cy) ** 2;
      // Clear of it, sparing the head, least covered, a cell in, then
      // farthest.
      const key = [cols * rows ? 1 : 0, head, cols * rows, -inset, -far];
      if (!best || before(key, best.key)) best = { p: { x, y, side: null }, key };
    }
  }
  return best!.p;
}

// `a` sorts before `b`, comparing in turn.
function before(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i];
  return false;
}

// Text as it will be drawn (zero-width dropped, wide glyphs '?'), cut to
// `cells` with a trailing '…' when longer.
export function fit(str: string, cells: number): string {
  const cs = [...str].map(cellSafe).filter(Boolean);
  if (cs.length <= cells) return cs.join('');
  return cells < 1 ? '' : `${cs.slice(0, cells - 1).join('')}…`;
}

const lum = (c: RGB): number => {
  const f = (v: number) => {
    const u = v / 255;
    return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const contrast = (a: RGB, b: RGB): number => {
  const [hi, lo] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

// `fg` mixed toward `toward` until it reads on `bg` at `min`:1 (WCAG).
export function legible(fg: RGB, bg: RGB, toward: RGB, min: number): RGB {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(fg, toward, Math.min(1, t));
    if (contrast(c, bg) >= min) return c;
  }
  return toward;
}

// A panel's colours on the world's palette: its background and text, and
// a frame and dim text that read on it.
export function inks(p: Palette): { bg: RGB; ink: RGB; edge: RGB; dim: RGB } {
  const bg = p.panel;
  const ink = p.panelText;
  return { bg, ink, edge: legible(p.border, bg, ink, 3), dim: legible(p.dim, bg, ink, 4.5) };
}

// A rounded frame over `r`, its inside cleared to `bg`.
export function drawFrame(s: Screen, r: Rect, edge: RGB, ink: RGB, bg: RGB): void {
  const right = r.x + r.w - 1;
  const bottom = r.y + r.h - 1;
  for (let j = 0; j < r.h; j++) s.fill({ x: r.x, y: r.y + j, w: r.w, h: 1 }, ' ', ink, bg);
  for (let i = r.x + 1; i < right; i++) {
    s.put(i, r.y, '─', edge, bg);
    s.put(i, bottom, '─', edge, bg);
  }
  for (let j = r.y + 1; j < bottom; j++) {
    s.put(r.x, j, '│', edge, bg);
    s.put(right, j, '│', edge, bg);
  }
  s.put(r.x, r.y, '╭', edge, bg);
  s.put(right, r.y, '╮', edge, bg);
  s.put(r.x, bottom, '╰', edge, bg);
  s.put(right, bottom, '╯', edge, bg);
}

// A meter's colour: good, warn or bad by level (`fill` meters, like the
// context, are bad when high); a critical one pulses between bad and dim.
function shade(m: Meter, fill: boolean, p: Palette, now: number, dim: RGB): RGB {
  if (m.critical) return Math.floor(now / 500) % 2 === 0 ? p.bad : dim;
  const v = fill ? 1 - m.value : m.value;
  return v > 0.5 ? p.good : v > 0.2 ? p.warn : p.bad;
}

// Draws the card for a character covering `box` (null: none in view),
// on the `prefer` side when it fits (see placeCard), and says where it
// went (null: nowhere, the scene is smaller than the card).
export function drawCard(s: Screen, scene: Rect, o: CardOpts, box: Box | null, prefer: Side | null = null): Placement | null {
  if (scene.w < CARD_W || scene.h < CARD_H) return null;
  const p = o.palette;
  const at = placeCard(scene, box, prefer);
  const { x, y } = at;
  const { bg, ink, edge, dim } = inks(p);
  // The agent's colour, made to read on the panel (as in the chat).
  const me = legible(o.color, bg, ink, 4.5);
  const right = x + CARD_W - 1;
  const cx = x + TEXT_X; // content left
  const end = right - 1; // content limit (exclusive)
  drawFrame(s, { x, y, w: CARD_W, h: CARD_H }, edge, ink, bg);
  const a = o.info;
  // Top edge: its level in its crew (★N, when it has one), the name in
  // its colour, the role, the time on this activity.
  const time = ` ${fit(elapsed(o.now - a.since), 6)} `;
  const timeX = right - 1 - time.length;
  s.put(cx, y, ' ', ink, bg);
  const lx = a.level ? s.text(cx + 1, y, `★${Math.min(99, a.level)} `, legible(p.warn, bg, ink, 4.5), bg, BOLD) : cx + 1;
  const nx = s.text(lx, y, fit(a.name, 16), me, bg, BOLD, timeX - 4);
  const roleRoom = timeX - 1 - nx - 3;
  if (roleRoom >= 1) s.text(nx, y, ` · ${fit(a.role, roleRoom)} `, dim, bg, 0, timeX - 1);
  s.text(timeX, y, time, dim, bg);
  // The activity, then the session's title and branch.
  const gx = s.text(cx, y + 1, `${activityGlyph(a.activity)} `, me, bg);
  s.text(gx, y + 1, fit(a.detail, end - gx), ink, bg, 0, end);
  const v = a.vitals;
  const branch = v?.branch ? fit(v.branch, BRANCH_MAX) : '';
  const titleW = INNER_W - (branch ? branch.length + 1 : 0);
  if (v?.title && titleW > 2) s.text(cx, y + 2, `"${fit(v.title, titleW - 2)}"`, ink, bg, 0, end);
  if (branch) s.text(end - branch.length, y + 2, branch, dim, bg, 0, end);
  const m = o.meters;
  if (!m || !v) {
    s.text(cx, y + 4, 'no vitals yet (no transcript read)', dim, bg, 0, end);
  } else {
    const row = (j: number, label: string, mt: Meter, fill: boolean, value: string) => {
      s.text(cx, y + j, label, ink, bg);
      const n = Math.round(mt.value * BAR);
      const c = shade(mt, fill, p, o.now, dim);
      for (let i = 0; i < BAR; i++) s.put(x + BAR_X + i, y + j, i < n ? '━' : '─', i < n ? c : dim, bg);
      s.text(x + VAL_X, y + j, value, c, bg, 0, end);
    };
    const pct = (mt: Meter) => `${Math.round(mt.value * 100)}%`.padStart(4);
    row(3, 'context', m.context, true, pct(m.context));
    row(4, 'energy', m.energy, false, pct(m.energy));
    row(5, 'health', m.health, false, m.health.value >= 0.99 ? '  ok' : pct(m.health));
    s.text(x + MOOD_X, y + 5, 'mood', ink, bg, 0, end);
    s.text(x + MOODV_X, y + 5, `${m.mood.value >= 0.5 ? '▲' : '▼'}${m.streak > 99 ? '99+' : m.streak}`, shade(m.mood, false, p, o.now, dim), bg, 0, end);
    // The time on its current working stretch, not the output so far: a
    // transcript is read from its tail, so that count would fall short.
    // None while it rests (the stretch is over).
    const onTask = rested(v, o.now) ? '' : `${elapsed(o.now - v.busySince)} on task`;
    const facts = [v.model ? modelName(v.model) : 'model ?', onTask, o.subs ? `${o.subs} subagent${o.subs === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    s.text(cx, y + 6, fit(facts, INNER_W), dim, bg, 0, end);
  }
  // Bottom edge: the keys.
  s.text(cx, y + CARD_H - 1, ' [⏎]talk  [c]heer  [tab] next  [esc] ', dim, bg, 0, end);
  return at;
}
