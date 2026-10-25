import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import type { Theme } from '../themes/types.ts';
import { ACTIVITIES } from '../agents.ts';
import { clip } from '../claude/activity.ts';
import { wrap } from './chat-lines.ts';
import { activityColor, activityGlyph } from './chrome.ts';
import { MIN_COLS, MIN_ROWS } from './layout.ts';
import { spriteFor, traitsFor } from '../world/character.ts';

export function drawBox(s: Screen, r: Rect, border: RGB, bg: RGB, title?: string): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const top = y === r.y;
      const bot = y === r.y + r.h - 1;
      const lft = x === r.x;
      const rgt = x === r.x + r.w - 1;
      let ch = ' ';
      if (top && lft) ch = '╭';
      else if (top && rgt) ch = '╮';
      else if (bot && lft) ch = '╰';
      else if (bot && rgt) ch = '╯';
      else if (top || bot) ch = '─';
      else if (lft || rgt) ch = '│';
      s.put(x, y, ch, border, bg);
    }
  }
  if (title) s.text(r.x + 2, r.y, ` ${title} `, border, bg, BOLD, r.x + r.w - 2);
}

function centered(r: Rect, w: number, h: number): Rect {
  const bw = Math.min(w, r.w);
  const bh = Math.min(h, r.h);
  return { x: r.x + Math.floor((r.w - bw) / 2), y: r.y + Math.floor((r.h - bh) / 2), w: bw, h: bh };
}

const HELP: Array<[string, string]> = [
  ['t / T', 'next / previous scene preset'],
  ['1-9, 0', 'jump to a preset'],
  ['p', 'preset picker (live preview)'],
  ['tab / shift-tab', 'select agent (← → too)'],
  ['esc', 'clear selection / close'],
  ['i / c / enter', 'card on / off · cheer · talk to it'],
  ['d', 'toggle the demo crew'],
  ['r', 'scene / agent dashboard'],
  ['l', 'lighting on / off'],
  ['+ / -', 'zoom in / out (z: auto)'],
  ['f', 'fullscreen scene (hide the panels)'],
  ['space', 'pause animation'],
  ['?', 'this help'],
  ['q / ctrl-c', 'quit'],
];

// `images`: the terminal shows images, so r switches to the scene; without,
// a line in its place says where the scene is. `note`: something the user
// should know (the crews not being saved), under the keys; on the smallest
// screen there is no room for it, and the way out says it too.
export function drawHelp(s: Screen, r: Rect, theme: Theme, images = false, note: string | null = null): void {
  const p = theme.palette;
  const rows = HELP.flatMap(([k, what]): Array<[string, string]> => {
    if (k !== 'r') return [[k, what]];
    return images ? [[k, what]] : [['', 'the scene needs kitty, Ghostty or WezTerm']];
  });
  const W = 58;
  // Broken after its first colon, where it reads best.
  const said = note ? wrap(note.replace(': ', ':\n'), W - 4) : [];
  const box = centered(r, W, rows.length + 9 + (said.length ? said.length + 1 : 0));
  drawBox(s, box, p.border, p.panel, 'HELP');
  const end = box.x + box.w - 1;
  let y = box.y + 2;
  for (const [k, what] of rows) {
    if (y >= box.y + box.h - 1) break;
    // A note (no key) takes the whole line.
    s.text(box.x + 3, y, k, p.accent, p.panel, BOLD, end);
    s.text(k ? box.x + 21 : box.x + 3, y, what, k ? p.panelText : p.dim, p.panel, 0, end);
    y++;
  }
  if (said.length) y++;
  for (const line of said) {
    if (y >= box.y + box.h - 1) break;
    s.text(box.x + 3, y, line, p.warn, p.panel, 0, end);
    y++;
  }
  y++;
  if (y < box.y + box.h - 2) {
    let x = box.x + 3;
    s.text(x, y, 'activities:', p.dim, p.panel, 0, end);
    y++;
    for (const a of ACTIVITIES) {
      const label = `${activityGlyph(a)} ${a}`;
      if (x + label.length + 2 > end) {
        x = box.x + 3;
        y++;
      }
      if (y >= box.y + box.h - 1) break;
      s.put(x, y, activityGlyph(a), activityColor(a, theme), p.panel);
      x = s.text(x + 2, y, a, p.panelText, p.panel, 0, end) + 2;
    }
  }
}

// The preset picker, docked at the left so the live preview stays visible.
// Up to six presets get a name and a tagline each; more get one row each
// (the selected preset's tagline goes at the bottom), scrolling to keep the
// selection in view.
export function drawPicker(s: Screen, r: Rect, themes: readonly Theme[], index: number, t: number): void {
  const cur = themes[index] ?? themes[0];
  const p = cur.palette;
  const compact = themes.length > 6;
  const per = compact ? 1 : 3;
  const want = themes.length * per + (compact ? 7 : 5);
  const w = Math.min(46, r.w - 2);
  const box = { x: r.x + 1, y: r.y + 1, w, h: Math.max(8, Math.min(r.h - 2, want)) };
  drawBox(s, box, p.border, p.panel, 'SCENES');
  const end = box.x + box.w - 1;
  const visible = Math.max(1, Math.floor((box.h - (compact ? 6 : 4)) / per));
  const first = Math.max(0, Math.min(themes.length - visible, index - Math.floor(visible / 2)));
  for (let i = first; i < Math.min(themes.length, first + visible); i++) {
    const th = themes[i];
    const y = box.y + 2 + (i - first) * per;
    const sel = i === index;
    const bg = sel ? mix(p.panel, p.accent, 0.22) : p.panel;
    s.fill({ x: box.x + 1, y, w: end - box.x - 1, h: compact ? 1 : 2 }, ' ', undefined, bg);
    s.text(box.x + 2, y, sel ? (Math.floor(t * 3) % 2 ? '▸' : '▹') : ' ', p.accent, bg, BOLD, end);
    s.text(box.x + 4, y, i < 9 ? `${i + 1}` : i === 9 ? '0' : ' ', p.dim, bg, 0, end);
    s.text(box.x + 6, y, clip(th.name, end - box.x - 18), sel ? p.panelText : mix(p.panelText, p.panel, 0.25), bg, BOLD, end - 11);
    const sw = [th.palette.wall, th.palette.floor, th.palette.accent, th.palette.accent2, th.palette.panel];
    sw.forEach((c, k) => s.put(end - 10 + k * 2, y, '█', c, bg));
    if (!compact) s.text(box.x + 6, y + 1, clip(th.tagline, end - box.x - 7), p.dim, bg, 0, end - 1);
  }
  if (first > 0) s.put(end - 1, box.y + 1, '▲', p.dim, p.panel);
  if (first + visible < themes.length) s.put(end - 1, box.y + box.h - (compact ? 4 : 3), '▼', p.dim, p.panel);
  if (compact) s.text(box.x + 2, box.y + box.h - 3, clip(cur.tagline, end - box.x - 3), p.dim, p.panel, 0, end);
  s.text(box.x + 2, box.y + box.h - 2, '↑↓ preview · enter apply · esc cancel', p.dim, p.panel, 0, end);
}

// Curtain sweep across `r` at `p` (0..1): everything behind the band is
// dimmed — background and foreground — and the band is drawn on top.
export function drawWipe(s: Screen, r: Rect, p: number, accent: RGB, backdrop: RGB): void {
  if (p < 0 || p >= 1) return;
  const band = '░▒▓██▓▒░';
  const bx = r.x + Math.floor(p * (r.w + band.length)) - band.length;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = Math.max(r.x, bx + band.length); x < r.x + r.w; x++) {
      s.blendBg(x, y, backdrop, 0.7);
      s.blendFg(x, y, backdrop, 0.7);
    }
    [...band].forEach((ch, i) => {
      const x = bx + i;
      if (x >= r.x && x < r.x + r.w) s.put(x, y, ch, accent);
    });
  }
}

export function drawTooSmall(s: Screen, theme: Theme, t = 0): void {
  const p = theme.palette;
  s.clear(p.bg, p.panelText);
  const msg = `animus needs at least ${MIN_COLS}×${MIN_ROWS}`;
  const now = `(now ${s.width}×${s.height})`;
  const cy = Math.max(0, Math.floor(s.height / 2) - 3);
  const sp = spriteFor(traitsFor('sleepy', 'sub'), 'sleep', t, 1);
  const z = Math.floor(t * 1.5) % 3;
  s.text(Math.floor((s.width - 5) / 2) + 5, cy - 1 + (2 - z), ['z', 'Z', 'z'][z], p.dim);
  const sx = Math.floor((s.width - 5) / 2);
  sp.cells.forEach((row, y) => row.forEach((c, x) => c && s.put(sx + x, cy + y, c.ch, c.fg, c.bg)));
  s.text(Math.max(0, Math.floor((s.width - msg.length) / 2)), cy + 5, msg, p.panelText, undefined, BOLD);
  s.text(Math.max(0, Math.floor((s.width - now.length) / 2)), cy + 6, now, p.dim);
}
