import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Art, StationDef } from './types.ts';

const pad = (s: string, w: number) => s + ' '.repeat(Math.max(0, w - [...s].length));

export function art(rows: string[], fg: string[], bg?: string[]): Art {
  const w = Math.max(0, ...rows.map((r) => [...r].length));
  const h = rows.length;
  const pr = rows.map((r) => pad(r, w));
  const pf = Array.from({ length: h }, (_, i) => pad(fg[i] ?? '', w));
  const pb = bg ? Array.from({ length: h }, (_, i) => pad(bg[i] ?? '', w)) : null;
  const cells = pr.map((row, y) => {
    const ch = [...row];
    const f = [...pf[y]];
    const b = pb ? [...pb[y]] : [];
    return ch.map((c, x) => ({ ch: c, f: f[x] ?? ' ', b: b[x] ?? ' ' }));
  });
  return { rows: pr, fg: pf, bg: pb, w, h, cells };
}

// Key grid derived from glyphs: each glyph maps through `map`, other
// non-space glyphs get `fallback`, spaces stay spaces.
export function byChar(rows: string[], map: Record<string, string>, fallback = ' '): string[] {
  return rows.map((r) => [...r].map((c) => (c === ' ' ? ' ' : map[c] ?? fallback)).join(''));
}

export function frameAt(def: StationDef, t: number, active: boolean): Art {
  const frames = active && def.active && def.active.length ? def.active : def.frames;
  return frames[Math.floor(Math.max(0, t) * def.fps) % frames.length];
}

export function drawArt(s: Screen, a: Art, x: number, y: number, colors: Record<string, RGB>, clip?: Rect): void {
  for (let r = 0; r < a.h; r++) {
    const yy = y + r;
    if (clip && (yy < clip.y || yy >= clip.y + clip.h)) continue;
    const row = a.cells[r];
    for (let c = 0; c < a.w; c++) {
      const xx = x + c;
      if (clip && (xx < clip.x || xx >= clip.x + clip.w)) continue;
      const cell = row[c];
      const bg = cell.b !== ' ' ? colors[cell.b] : undefined;
      if (cell.ch === ' ' && !bg) continue;
      s.put(xx, yy, cell.ch, cell.f !== ' ' ? colors[cell.f] : undefined, bg);
    }
  }
}

// Wall area above each floor band (between the previous band and this one).
export function wallBands(r: Rect, floors: number[]): Rect[] {
  const out: Rect[] = [];
  let top = r.y;
  for (const fy of floors) {
    out.push({ x: r.x, y: top, w: r.w, h: Math.max(0, fy - top) });
    top = fy + 2;
  }
  return out;
}

// Deterministic hash noise in [0, 1) for integer inputs.
export function noise(n: number, seed = 0): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 0..1 triangle wave with the given period (seconds).
export function pulse(t: number, period: number, offset = 0): number {
  const p = (((t + offset) % period) + period) % period / period;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

// Writes text clipped to a rect.
export function textIn(s: Screen, r: Rect, x: number, y: number, str: string, fg?: RGB, bg?: RGB): void {
  if (y < r.y || y >= r.y + r.h) return;
  let cx = x;
  for (const ch of str) {
    if (cx >= r.x && cx < r.x + r.w) s.put(cx, y, ch, fg, bg);
    cx++;
  }
}

// Paints the 2-row floor bands; `tile` picks each cell's style.
export function drawFloors(
  s: Screen,
  r: Rect,
  floors: number[],
  tile: (x: number, row: number, level: number) => { ch: string; fg: RGB; bg: RGB },
): void {
  floors.forEach((fy, level) => {
    for (let row = 0; row < 2; row++) {
      const y = fy + row;
      if (y < r.y || y >= r.y + r.h) continue;
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = tile(x - r.x, row, level);
        s.put(x, y, c.ch, c.fg, c.bg);
      }
    }
  });
}
