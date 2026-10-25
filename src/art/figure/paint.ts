import type { Color, Pen } from '../types.ts';

// The sprites' two-pass painter. Parts are recorded back to front, each in
// its own frame (a similarity transform from part units to sprite units),
// then painted twice: first every outlined part stroked at twice the
// outline width in ink (their union is the silhouette: a rim one outline
// wide round the whole figure), then every part filled, shaded and edged
// with a thin inner line, back to front, over that. Seams between parts get
// only the inner line, so the outline never doubles up.

export type Mat = readonly [number, number, number, number, number, number];
export const ID: Mat = [1, 0, 0, 1, 0, 0];

// m after n (n applies first).
export function mul(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export const move = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const turn = (r: number): Mat => [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0];
export const zoom = (k: number): Mat => [k, 0, 0, k, 0, 0];
export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

// Adds subpaths to the pen's current path, in the part's units.
export type Shape = (p: Pen) => void;

// A separate counter-clockwise ellipse: a hole in a nonzero fill.
export function hole(p: Pen, cx: number, cy: number, rx: number, ry: number): void {
  p.moveTo(cx + rx, cy);
  p.ellipse(cx, cy, rx, ry, 0, Math.PI * 2, 0, true);
  p.closePath();
}

// What a custom drawing gets: px per unit, the unit vector toward the light
// (upper left on screen) in its own frame, the ink and the inner line width
// in its units.
export type Ctx = { px: number; lx: number; ly: number; ink: Color; line: number };
export type DrawFn = (p: Pen, c: Ctx) => void;

export type BlobOpts = {
  dark?: Color | null; // the shaded side's colour (none: flat)
  d?: number; // how far the lit part is shifted toward the light, units
  line?: number; // inner line, as a fraction of the outline (0: none)
  sil?: boolean; // part of the silhouette (default true)
  rule?: 'nonzero' | 'evenodd';
};

type Op =
  | { k: 0; m: Mat; shape: Shape; fill: Color; dark: Color | null; d: number; line: number; sil: boolean; rule: 'nonzero' | 'evenodd' }
  | { k: 1; m: Mat; pts: readonly number[]; w: number; fill: Color; dark: Color | null; line: number; sil: boolean }
  | { k: 2; m: Mat; fn: DrawFn; sil: DrawFn | null };

export class Sketch {
  ops: Op[] = [];
  m: Mat = ID;
  private stack: Mat[] = [];

  push(n: Mat): void {
    this.stack.push(this.m);
    this.m = mul(this.m, n);
  }
  pop(): void {
    this.m = this.stack.pop() ?? ID;
  }
  at(n: Mat, fn: () => void): void {
    this.push(n);
    fn();
    this.pop();
  }

  // A filled, outlined shape.
  blob(shape: Shape, fill: Color, o: BlobOpts = {}): void {
    this.ops.push({ k: 0, m: this.m, shape, fill, dark: o.dark ?? null, d: o.d ?? 0.5, line: o.line ?? 0.6, sil: o.sil ?? true, rule: o.rule ?? 'nonzero' });
  }

  // A round-capped stroke (an arm, a leg, a tail) `w` units thick through
  // the points (x0, y0, x1, y1, ...); `dark` shades the side away from the
  // light.
  limb(pts: readonly number[], w: number, fill: Color, o: BlobOpts = {}): void {
    this.ops.push({ k: 1, m: this.m, pts, w, fill, dark: o.dark ?? null, line: o.line ?? 0.6, sil: o.sil ?? true });
  }

  // Free drawing in the second pass (details: eyes, mouths, prints, glints);
  // `sil` also adds to the silhouette in the first.
  draw(fn: DrawFn, sil: DrawFn | null = null): void {
    this.ops.push({ k: 2, m: this.m, fn, sil });
  }

  where(x: number, y: number): [number, number] {
    return apply(this.m, x, y);
  }
}

const LX = -0.62; // toward the light, on screen
const LY = -0.78;

function poly(p: Pen, pts: readonly number[]): void {
  p.beginPath();
  p.moveTo(pts[0], pts[1]);
  if (pts.length === 2) p.lineTo(pts[0] + 1e-3, pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
}

function ctxOf(M: Mat, W: number, ink: Color): Ctx {
  const det = M[0] * M[3] - M[1] * M[2];
  const px = Math.sqrt(Math.abs(det)) || 1;
  // the light's direction mapped back through the (similarity) transform
  const lx = (M[3] * LX - M[2] * LY) / det;
  const ly = (-M[1] * LX + M[0] * LY) / det;
  const l = Math.hypot(lx, ly) || 1;
  return { px, lx: lx / l, ly: ly / l, ink, line: (0.6 * W) / px };
}

// Paints a sketch: `base` maps sketch units to the pen's pixels, `W` is the
// outline width in px.
export function render(p: Pen, sk: Sketch, base: Mat, W: number, ink: Color): void {
  p.save();
  p.lineJoin = 'round';
  p.lineCap = 'round';
  p.strokeStyle = ink;
  p.fillStyle = ink;
  for (const op of sk.ops) {
    if (!op.sil) continue;
    const M = mul(base, op.m);
    p.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    const c = ctxOf(M, W, ink);
    if (op.k === 0) {
      p.beginPath();
      op.shape(p);
      p.lineWidth = (2 * W) / c.px;
      p.strokeStyle = ink;
      p.stroke();
    } else if (op.k === 1) {
      poly(p, op.pts);
      p.lineWidth = op.w + (2 * W) / c.px;
      p.strokeStyle = ink;
      p.stroke();
    } else if (op.sil) {
      p.strokeStyle = ink;
      p.fillStyle = ink;
      op.sil(p, c);
    }
  }
  for (const op of sk.ops) {
    const M = mul(base, op.m);
    p.setTransform(M[0], M[1], M[2], M[3], M[4], M[5]);
    const c = ctxOf(M, W, ink);
    if (op.k === 0) {
      p.beginPath();
      op.shape(p);
      if (op.dark) {
        p.fillStyle = op.dark;
        p.fill(op.rule);
        p.save();
        p.clip(op.rule);
        p.translate(c.lx * op.d, c.ly * op.d);
        p.beginPath();
        op.shape(p);
        p.fillStyle = op.fill;
        p.fill(op.rule);
        p.restore();
      } else {
        p.fillStyle = op.fill;
        p.fill(op.rule);
      }
      if (op.line > 0) {
        p.beginPath();
        op.shape(p);
        p.lineWidth = (op.line * W) / c.px;
        p.strokeStyle = ink;
        p.stroke();
      }
    } else if (op.k === 1) {
      poly(p, op.pts);
      if (op.line > 0) {
        p.lineWidth = op.w + (op.line * W) / c.px;
        p.strokeStyle = ink;
        p.stroke();
      }
      p.lineWidth = op.w;
      p.strokeStyle = op.dark ?? op.fill;
      p.stroke();
      if (op.dark) {
        p.save();
        p.translate(c.lx * op.w * 0.17, c.ly * op.w * 0.17);
        poly(p, op.pts);
        p.lineWidth = op.w * 0.6;
        p.strokeStyle = op.fill;
        p.stroke();
        p.restore();
      }
    } else {
      p.save();
      op.fn(p, c);
      p.restore();
    }
  }
  p.restore();
}
