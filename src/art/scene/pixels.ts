// Whole-bitmap pixel work for the scene's pictures: cropping a sprite to
// what was painted, splitting one by a mask, copying a region, telling two
// pictures apart, and lifting light off what it was drawn on.

import { Canvas } from '../canvas.ts';
import type { Bitmap } from '../types.ts';

// The convex hull of some points, clockwise on screen.
export function hullOf(pts: ReadonlyArray<readonly [number, number]>): Array<[number, number]> {
  const p = pts.map(([x, y]) => [x, y] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: number[], a: number[], b: number[]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (q: Array<[number, number]>) => {
    const out: Array<[number, number]> = [];
    for (const v of q) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], v) <= 1e-9) out.pop();
      out.push(v);
    }
    return out.slice(0, -1);
  };
  return [...half(p), ...half([...p].reverse())];
}

// Splits a premultiplied picture by a coverage mask (alpha of `mask`):
// `inside` keeps each pixel times the coverage, `outside` the rest.
export function split(c: Bitmap, mask: Bitmap): { inside: Canvas; outside: Canvas } {
  const inside = new Canvas(c.width, c.height);
  const outside = new Canvas(c.width, c.height);
  const s = c.data;
  const m = mask.data;
  const a = inside.data;
  const b = outside.data;
  for (let o = 0; o < s.length; o += 4) {
    if (s[o + 3] === 0 && s[o] === 0) continue;
    const k = m[o + 3] / 255;
    for (let j = 0; j < 4; j++) {
      const v = s[o + j] * k;
      a[o + j] = v;
      b[o + j] = s[o + j] - v;
    }
  }
  return { inside, outside };
}

// The part of `c` anything was painted on, as its own canvas and where it
// sat; null when nothing was.
export function cropped(c: Canvas): { img: Canvas; x: number; y: number } | null {
  const { width: w, height: h } = c;
  const u = new Uint32Array(c.data.buffer, c.data.byteOffset, w * h);
  let x0 = w;
  let x1 = -1;
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    let any = false;
    for (let x = 0, o = y * w; x < w; x++, o++) {
      if (u[o] === 0) continue;
      any = true;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
    if (!any) continue;
    if (y0 < 0) y0 = y;
    y1 = y;
  }
  if (y0 < 0) return null;
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  if (cw === w && ch === h) return { img: c, x: 0, y: 0 };
  const img = new Canvas(cw, ch);
  for (let y = 0; y < ch; y++) img.data.set(c.data.subarray(((y0 + y) * w + x0) * 4, ((y0 + y) * w + x0 + cw) * 4), y * cw * 4);
  return { img, x: x0, y: y0 };
}

const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
const words = (b: Bitmap) => new Uint32Array(b.data.buffer, b.data.byteOffset, b.width * b.height);

// Whether two pictures are the same, pixel for pixel.
export function same(a: Bitmap, b: Bitmap): boolean {
  if (a === b) return true;
  if (a.width !== b.width || a.height !== b.height) return false;
  if (!LE || a.data.byteOffset % 4 || b.data.byteOffset % 4) {
    for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
    return true;
  }
  const x = words(a);
  const y = words(b);
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

// The w x h of `b` from (x, y), which must lie inside it, as its own canvas.
export function region(b: Bitmap, x: number, y: number, w: number, h: number): Canvas {
  const c = new Canvas(w, h);
  for (let j = 0; j < h; j++) c.data.set(b.data.subarray(((y + j) * b.width + x) * 4, ((y + j) * b.width + x + w) * 4), j * w * 4);
  return c;
}

// A drawing made twice, on its own (`own`, on clear) and over `under` (an
// opaque picture: `onto`), as one picture to lay over `under`: its own
// pixel wherever laying that on `under` gives `onto` (plain painting, right
// over anything), else the least-alpha pixel that gives `onto` exactly over
// `under`. That is light blended 'screen' or 'lighter': it lifts each
// channel by its own share, which no one pixel laid over can do for every
// ground, so it is made exact for the one it was drawn on.
export function lift(own: Bitmap, onto: Bitmap, under: Bitmap): Canvas {
  const out = new Canvas(own.width, own.height);
  const s = own.data;
  const r = onto.data;
  const b = under.data;
  const d = out.data;
  for (let o = 0; o < s.length; o += 4) {
    const f = 1 - s[o + 3] / 255;
    if (Math.abs(s[o] + b[o] * f - r[o]) <= 1.01 && Math.abs(s[o + 1] + b[o + 1] * f - r[o + 1]) <= 1.01 && Math.abs(s[o + 2] + b[o + 2] * f - r[o + 2]) <= 1.01) {
      d[o] = s[o];
      d[o + 1] = s[o + 1];
      d[o + 2] = s[o + 2];
      d[o + 3] = s[o + 3];
      continue;
    }
    // Over `under` a pixel (p, alpha) gives p + under (1 - alpha): each
    // channel lifted needs alpha >= (onto - under) / (255 - under), each
    // darkened alpha >= (under - onto) / under.
    let al = 0;
    for (let c = 0; c < 3; c++) {
      const rc = r[o + c];
      const bc = b[o + c];
      const need = rc > bc ? (rc - bc) / (255 - bc) : rc < bc ? (bc - rc) / bc : 0;
      if (need > al) al = need;
    }
    if (al <= 0) continue;
    const A = Math.min(255, Math.ceil(al * 255));
    const k = 1 - A / 255;
    for (let c = 0; c < 3; c++) d[o + c] = Math.min(A, r[o + c] - b[o + c] * k);
    d[o + 3] = A;
  }
  return out;
}

// A box, ends exclusive, and whether light was laid on in it.
export type Box = { x0: number; y0: number; x1: number; y1: number; light: boolean };

// Boxes merged wherever they come within `gap` px of each other, so that
// marks close together become one piece; top to bottom, left to right.
export function clusters(boxes: readonly Box[], gap: number): Box[] {
  const out = boxes.map((b) => ({ ...b }));
  for (let merged = true; merged; ) {
    merged = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = out.length - 1; j > i; j--) {
        const a = out[i];
        const b = out[j];
        if (b.x0 > a.x1 + gap || a.x0 > b.x1 + gap || b.y0 > a.y1 + gap || a.y0 > b.y1 + gap) continue;
        out[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), light: a.light || b.light };
        out.splice(j, 1);
        merged = true;
      }
    }
  }
  return out.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
}
