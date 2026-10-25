import type { RGB } from './color.ts';
import { cellSafe } from './width.ts';

export type Rect = { x: number; y: number; w: number; h: number };

export const BOLD = 1;

// A colour slot set to this uses the terminal's default colour (SGR 39/49).
// The scene's cells take it so the image drawn under them shows.
export const DEFAULT = -1;

const pack = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];
const unpack = (n: number): RGB => [(n >> 16) & 255, (n >> 8) & 255, n & 255];

function blend(packed: number, c: RGB, a: number): number {
  const k = Math.max(0, Math.min(1, a));
  const r = (packed >> 16) & 255;
  const g = (packed >> 8) & 255;
  const b = packed & 255;
  return (
    (Math.round(r + (c[0] - r) * k) << 16) |
    (Math.round(g + (c[1] - g) * k) << 8) |
    Math.round(b + (c[2] - b) * k)
  );
}

// A grid of cells (char + packed fg/bg RGB + attributes). Every glyph is
// assumed to occupy exactly one terminal column.
export class Screen {
  readonly width: number;
  readonly height: number;
  ch: string[];
  fg: Int32Array;
  bg: Int32Array;
  attr: Uint8Array;

  constructor(width: number, height: number) {
    this.width = Math.max(0, width | 0);
    this.height = Math.max(0, height | 0);
    const n = this.width * this.height;
    this.ch = new Array<string>(n).fill(' ');
    this.fg = new Int32Array(n).fill(0xffffff);
    this.bg = new Int32Array(n);
    this.attr = new Uint8Array(n);
  }

  clear(bg: RGB, fg: RGB = [255, 255, 255]): void {
    this.ch.fill(' ');
    this.fg.fill(pack(fg));
    this.bg.fill(pack(bg));
    this.attr.fill(0);
  }

  private index(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= this.width || yi >= this.height) return -1;
    return yi * this.width + xi;
  }

  put(x: number, y: number, ch: string, fg?: RGB, bg?: RGB, attr = 0): void {
    const i = this.index(x, y);
    if (i < 0) return;
    this.ch[i] = ch;
    if (fg) this.fg[i] = pack(fg);
    if (bg) this.bg[i] = pack(bg);
    this.attr[i] = attr;
  }

  text(x: number, y: number, s: string, fg?: RGB, bg?: RGB, attr = 0, maxX = Infinity): number {
    let cx = Math.floor(x);
    for (const ch of s) {
      if (cx >= maxX) break;
      const safe = cellSafe(ch);
      if (!safe) continue;
      this.put(cx, y, safe, fg, bg, attr);
      cx++;
    }
    return cx;
  }

  // Blank cells on the terminal's default background over `r`: windows for
  // an image drawn under the cells.
  punch(r: Rect): void {
    for (let y = Math.max(0, r.y); y < Math.min(this.height, r.y + r.h); y++) {
      for (let x = Math.max(0, r.x); x < Math.min(this.width, r.x + r.w); x++) {
        const i = y * this.width + x;
        this.ch[i] = ' ';
        this.fg[i] = DEFAULT;
        this.bg[i] = DEFAULT;
        this.attr[i] = 0;
      }
    }
  }

  fill(r: Rect, ch: string, fg?: RGB, bg?: RGB): void {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.put(x, y, ch, fg, bg);
  }

  // A cell on the default colour (unknown here) takes `c` itself.
  blendBg(x: number, y: number, c: RGB, a: number): void {
    const i = this.index(x, y);
    if (i >= 0) this.bg[i] = this.bg[i] === DEFAULT ? pack(c) : blend(this.bg[i], c, a);
  }

  blendFg(x: number, y: number, c: RGB, a: number): void {
    const i = this.index(x, y);
    if (i >= 0) this.fg[i] = this.fg[i] === DEFAULT ? pack(c) : blend(this.fg[i], c, a);
  }

  charAt(x: number, y: number): string {
    const i = this.index(x, y);
    return i < 0 ? '' : this.ch[i];
  }

  fgAt(x: number, y: number): RGB {
    const i = this.index(x, y);
    return i < 0 ? [0, 0, 0] : unpack(this.fg[i]);
  }

  bgAt(x: number, y: number): RGB {
    const i = this.index(x, y);
    return i < 0 ? [0, 0, 0] : unpack(this.bg[i]);
  }

  // Plain text of the screen, one line per row (used by snapshots and tests).
  toText(): string {
    const lines: string[] = [];
    for (let y = 0; y < this.height; y++) lines.push(this.ch.slice(y * this.width, (y + 1) * this.width).join(''));
    return lines.join('\n');
  }
}
