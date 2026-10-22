import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import type { Theme } from '../themes/types.ts';
import { ACTIVITIES } from '../agents.ts';
import { clip } from '../claude/activity.ts';
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
  ['1-9', 'jump to a preset'],
  ['p', 'preset picker (live preview)'],
  ['tab / shift-tab', 'select agent (← → too)'],
  ['esc', 'clear selection / close'],
  ['d', 'toggle the demo crew'],
  ['space', 'pause animation'],
  ['?', 'this help'],
  ['q / ctrl-c', 'quit'],
];

export function drawHelp(s: Screen, r: Rect, theme: Theme): void {
  const p = theme.palette;
  const box = centered(r, 58, HELP.length + 9);
  drawBox(s, box, p.border, p.panel, 'HELP');
  const end = box.x + box.w - 1;
  let y = box.y + 2;
  for (const [k, what] of HELP) {
    if (y >= box.y + box.h - 1) break;
    s.text(box.x + 3, y, k, p.accent, p.panel, BOLD, end);
    s.text(box.x + 21, y, what, p.panelText, p.panel, 0, end);
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

export function drawPicker(s: Screen, r: Rect, themes: readonly Theme[], index: number, t: number): void {
  const cur = themes[index] ?? themes[0];
  const p = cur.palette;
  const box = centered(r, 64, themes.length * 3 + 5);
  drawBox(s, box, p.border, p.panel, 'SCENE PRESETS');
  const end = box.x + box.w - 1;
  themes.forEach((th, i) => {
    const y = box.y + 2 + i * 3;
    if (y + 1 >= box.y + box.h - 1) return;
    const sel = i === index;
    const bg = sel ? mix(p.panel, p.accent, 0.22) : p.panel;
    s.fill({ x: box.x + 1, y, w: end - box.x - 1, h: 2 }, ' ', undefined, bg);
    s.text(box.x + 2, y, sel ? (Math.floor(t * 3) % 2 ? '▸' : '▹') : ' ', p.accent, bg, BOLD, end);
    s.text(box.x + 4, y, `${i + 1}`, p.dim, bg, 0, end);
    s.text(box.x + 7, y, th.name, sel ? p.panelText : mix(p.panelText, p.panel, 0.25), bg, BOLD, end);
    const sw = [th.palette.wall, th.palette.floor, th.palette.accent, th.palette.accent2, th.palette.panel];
    sw.forEach((c, k) => s.put(end - 12 + k * 2, y, '█', c, bg));
    s.text(box.x + 7, y + 1, clip(th.tagline, end - box.x - 8), p.dim, bg, 0, end - 1);
  });
  s.text(box.x + 2, box.y + box.h - 2, '↑↓ preview · enter apply · esc cancel', p.dim, p.panel, 0, end);
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
