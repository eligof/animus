import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';

export const CLEAR = -1;

export type PixelSprite = { w: number; h: number; px: Array<Array<RGB | null>>; ax: number; ay: number };

const pack = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];

// Glyph for each 2x3 pattern (bit 0 = top-left … bit 5 = bottom-right).
// Unicode's sextant block skips the patterns that already exist as block
// elements (empty, left half, right half, full).
const SEXTANT: string[] = Array.from({ length: 64 }, (_, p) => {
  if (p === 0) return ' ';
  if (p === 63) return '█';
  if (p === 21) return '▌';
  if (p === 42) return '▐';
  return String.fromCodePoint(0x1fb00 + p - 1 - (p > 21 ? 1 : 0) - (p > 42 ? 1 : 0));
});

// Inverse of SEXTANT: the 2x3 pattern a cell shows, or -1 for any other
// character (text, half blocks).
export function sextantPattern(ch: string): number {
  if (!ch) return -1;
  if (ch === ' ') return 0;
  if (ch === '█') return 63;
  if (ch === '▌') return 21;
  if (ch === '▐') return 42;
  const i = ch.codePointAt(0)! - 0x1fb00;
  if (i < 0 || i > 59) return -1;
  let p = i + 1;
  if (p >= 21) p++;
  if (p >= 42) p++;
  return p;
}

const dist2 = (a: number, b: number) => {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return dr * dr + dg * dg + db * db;
};
const unpack = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

// A grid of square pixels. Each terminal cell shows two of them stacked
// (upper half block: fg = top pixel, bg = bottom pixel).
export class PixelCanvas {
  readonly w: number;
  readonly h: number;
  data: Int32Array;

  constructor(w: number, h: number) {
    this.w = Math.max(0, w | 0);
    this.h = Math.max(0, h | 0);
    this.data = new Int32Array(this.w * this.h).fill(CLEAR);
  }

  clear(c: RGB): void {
    this.data.fill(pack(c));
  }

  set(x: number, y: number, c: RGB): void {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    this.data[yi * this.w + xi] = pack(c);
  }

  get(x: number, y: number): RGB | null {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return null;
    const v = this.data[yi * this.w + xi];
    return v === CLEAR ? null : unpack(v);
  }

  blend(x: number, y: number, c: RGB, a: number): void {
    const cur = this.get(x, y);
    if (!cur) return;
    const k = Math.max(0, Math.min(1, a));
    this.set(x, y, [
      Math.round(cur[0] + (c[0] - cur[0]) * k),
      Math.round(cur[1] + (c[1] - cur[1]) * k),
      Math.round(cur[2] + (c[2] - cur[2]) * k),
    ]);
  }

  sprite(sp: PixelSprite, x: number, y: number): void {
    const left = Math.round(x) - sp.ax;
    const top = Math.round(y) - sp.ay;
    for (let r = 0; r < sp.h; r++) {
      const row = sp.px[r];
      for (let c = 0; c < sp.w; c++) {
        const p = row[c];
        if (p) this.set(left + c, top + r, p);
      }
    }
  }

  // Composites into `r` with sextant glyphs: each cell shows a 2x3 block of
  // pixels in two colours — the block's most common colour as background and
  // its most distinct one as foreground, every pixel snapped to the nearer.
  blitSextant(s: Screen, r: Rect, fallback: RGB = [0, 0, 0]): void {
    const fb = pack(fallback);
    const px = new Int32Array(6);
    for (let cy = 0; cy < r.h; cy++) {
      const sy = r.y + cy;
      if (sy < 0 || sy >= s.height) continue;
      for (let cx = 0; cx < r.w; cx++) {
        const sx = r.x + cx;
        if (sx < 0 || sx >= s.width) continue;
        for (let k = 0; k < 6; k++) {
          const x = 2 * cx + (k & 1);
          const y = 3 * cy + (k >> 1);
          const v = x < this.w && y < this.h ? this.data[y * this.w + x] : CLEAR;
          px[k] = v === CLEAR ? fb : v;
        }
        const i = sy * s.width + sx;
        if (px[0] === px[1] && px[0] === px[2] && px[0] === px[3] && px[0] === px[4] && px[0] === px[5]) {
          s.ch[i] = ' ';
          s.fg[i] = px[0];
          s.bg[i] = px[0];
          s.attr[i] = 0;
          continue;
        }
        let bg = px[0];
        let bgCount = 0;
        for (let i = 0; i < 6; i++) {
          let n = 0;
          for (let j = 0; j < 6; j++) if (px[j] === px[i]) n++;
          if (n > bgCount) {
            bgCount = n;
            bg = px[i];
          }
        }
        let fg = bg;
        let score = -1;
        for (let i = 0; i < 6; i++) {
          if (px[i] === bg) continue;
          let n = 0;
          for (let j = 0; j < 6; j++) if (px[j] === px[i]) n++;
          const sc = dist2(px[i], bg) * Math.sqrt(n);
          if (sc > score) {
            score = sc;
            fg = px[i];
          }
        }
        let bits = 0;
        if (fg !== bg) for (let k = 0; k < 6; k++) if (px[k] === fg || dist2(px[k], fg) < dist2(px[k], bg)) bits |= 1 << k;
        s.ch[i] = SEXTANT[bits];
        s.fg[i] = fg;
        s.bg[i] = bg;
        s.attr[i] = 0;
      }
    }
  }

  // Composites into `r` of the screen: cell row y shows pixel rows 2y, 2y+1.
  blit(s: Screen, r: Rect, fallback: RGB = [0, 0, 0]): void {
    const fb = pack(fallback);
    for (let cy = 0; cy < r.h; cy++) {
      const sy = r.y + cy;
      if (sy < 0 || sy >= s.height) continue;
      for (let cx = 0; cx < r.w; cx++) {
        const sx = r.x + cx;
        if (sx < 0 || sx >= s.width) continue;
        const inX = cx < this.w;
        let top = inX && 2 * cy < this.h ? this.data[2 * cy * this.w + cx] : CLEAR;
        let bot = inX && 2 * cy + 1 < this.h ? this.data[(2 * cy + 1) * this.w + cx] : CLEAR;
        if (top === CLEAR) top = fb;
        if (bot === CLEAR) bot = fb;
        const i = sy * s.width + sx;
        s.ch[i] = top === bot ? ' ' : '▀';
        s.fg[i] = top;
        s.bg[i] = bot;
        s.attr[i] = 0;
      }
    }
  }
}
