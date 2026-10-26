import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the Startup is full of, drawn in any frame: plants in their
// pots, a bar stool, a mug, books on a shelf, casters, a lamp's dome and a
// few shape helpers. Nothing carries a word, a digit or a maker's mark.

// ── shape helpers ────────────────────────────────────────────────────────────

// The convex hull of screen points (monotone chain).
export function hull(pts: ReadonlyArray<Pt>): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Pt[]) => {
    const out: Pt[] = [];
    for (const q of list) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], q) <= 1e-9) out.pop();
      out.push(q);
    }
    return out;
  };
  const lo = half(p);
  const up = half([...p].reverse());
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// Screen points round a circle of radius r centred on c, square to n.
export function ring(k: Kit, c: P3, n: P3, r: number, steps = 20): Pt[] {
  const l = Math.hypot(...n) || 1;
  const N: P3 = [n[0] / l, n[1] / l, n[2] / l];
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const A = cr(N, ref);
  const la = Math.hypot(...A);
  const a: P3 = [A[0] / la, A[1] / la, A[2] / la];
  const b = cr(N, a);
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const cs = Math.cos(th) * r;
    const sn = Math.sin(th) * r;
    out.push(k.p(c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn));
  }
  return out;
}

// Fills (and inks, line > 0) a polygon of screen points.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

// A left-to-right gradient across screen points: lit left, dark right.
export function across(k: Kit, pts: ReadonlyArray<Pt>, base: Color, lift = 0.14, drop = 0.24): Gradient {
  const xs = pts.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, lift * 0.5));
  g.addColorStop(0.3, shade(base, lift));
  g.addColorStop(0.65, base);
  g.addColorStop(1, shade(base, -drop));
  return g;
}

// An upright cone frustum (pots, shades, a hopper): radius r0 at z0, r1 at
// z1, shaded across, its top opening in `inside`.
export function frustum(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color, inside: Color | null): void {
  const bot = ring(k, [cu, cv, z0], [0, 0, 1], r0, 24);
  const top = ring(k, [cu, cv, z1], [0, 0, 1], r1, 24);
  const sil = hull([...bot, ...top]);
  fillPts(k, sil, across(k, sil, base), 0);
  if (inside) fillPts(k, top, inside, k.thin);
  fillPts(k, sil, null, k.lw);
}

// A dome shade hung with its rim at z (a pendant's, a floor lamp's): a
// half ball of radius r over the rim, black outside, the warm bulb under
// it.
export function dome(k: Kit, cu: number, cv: number, z: number, r: number, color: Color, bulb: Color | null): void {
  const rim = ring(k, [cu, cv, z], [0, 0, 1], r, 24);
  const pts: Pt[] = [...rim];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push(...ring(k, [cu, cv, z + Math.sin(a) * r * 0.85], [0, 0, 1], Math.cos(a) * r, 16));
  }
  const sil = hull(pts);
  fillPts(k, sil, across(k, sil, color, 0.3, 0.2), k.lw);
  // the rim's inside, lit by the bulb
  if (bulb) {
    fillPts(k, rim, withAlpha(bulb, 0.9), k.thin);
    const [x, y] = k.p(cu, cv, z - 0.1);
    k.pen.beginPath();
    k.pen.ellipse(x, y + 0.12 * r * k.s, r * 0.32 * k.s, r * 0.22 * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = C.bulb;
    k.pen.fill();
  }
  // a glint up the lit side
  if (k.fine) {
    const [x0, y0] = k.p(cu - r * 0.55, cv + r * 0.3, z + r * 0.25);
    const [x1, y1] = k.p(cu - r * 0.3, cv + r * 0.2, z + r * 0.62);
    k.pen.beginPath();
    k.pen.moveTo(x0, y0);
    k.pen.lineTo(x1, y1);
    k.pen.strokeStyle = withAlpha('#ffffff', 0.35);
    k.pen.lineWidth = 0.14 * k.s;
    k.pen.lineCap = 'round';
    k.pen.stroke();
  }
}

// One pointed leaf from (x, y) toward angle a, length L px (screen space).
export function leaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color, rib = true): void {
  const pen = k.pen;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (s: number, t: number): [number, number] => [x + ca * s - sa * t, y + sa * s + ca * t];
  pen.beginPath();
  const [x0, y0] = P(0, 0);
  pen.moveTo(x0, y0);
  const [c1x, c1y] = P(L * 0.3, -w);
  const [c2x, c2y] = P(L * 0.8, -w * 0.8);
  const [tx, ty] = P(L, 0);
  pen.bezierCurveTo(c1x, c1y, c2x, c2y, tx, ty);
  const [d1x, d1y] = P(L * 0.8, w * 0.8);
  const [d2x, d2y] = P(L * 0.3, w);
  pen.bezierCurveTo(d1x, d1y, d2x, d2y, x0, y0);
  pen.closePath();
  k.paint(fill, k.thin);
  if (rib && L > 10) {
    pen.beginPath();
    pen.moveTo(x0, y0);
    const [rx, ry] = P(L * 0.85, 0);
    pen.lineTo(rx, ry);
    pen.strokeStyle = shade(fill, -0.3);
    pen.lineWidth = Math.max(0.7, k.thin * 0.6);
    pen.stroke();
  }
}

// A round leaf (a monstera's, a fiddle-leaf fig's), its stalk at (x, y),
// toward angle a, L px long: a broad rounded blade with a midrib and, for
// a monstera, a few notches cut in its edge; a fig's is broadest near its
// tip, like a fiddle.
export function paddle(k: Kit, x: number, y: number, a: number, L: number, fill: Color, notched = false, fiddle = false): void {
  const pen = k.pen;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (s: number, t: number): [number, number] => [x + ca * s - sa * t, y + sa * s + ca * t];
  const w = L * 0.42;
  pen.beginPath();
  pen.moveTo(...P(0, 0));
  const [c0, c1] = fiddle ? [0.3, 1.45] : [1.1, 1.05];
  pen.bezierCurveTo(...P(L * 0.1, -w * c0), ...P(L * 0.98, -w * c1), ...P(L, 0));
  pen.bezierCurveTo(...P(L * 0.98, w * c1), ...P(L * 0.1, w * c0), ...P(0, 0));
  pen.closePath();
  k.paint(fill, k.thin);
  pen.beginPath();
  pen.moveTo(...P(L * 0.05, 0));
  pen.lineTo(...P(L * 0.85, 0));
  pen.strokeStyle = shade(fill, -0.28);
  pen.lineWidth = Math.max(0.6, k.thin * 0.55);
  pen.stroke();
  if (notched && L > 6) {
    // a monstera's splits, from the edge in toward the rib
    pen.beginPath();
    for (const f of [0.35, 0.6]) {
      for (const sd of [-1, 1]) {
        pen.moveTo(...P(L * f, sd * w * 0.95));
        pen.lineTo(...P(L * (f + 0.06), sd * w * 0.35));
      }
    }
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(0.7, k.thin * 0.8);
    pen.stroke();
  }
}

// ── pots and plants ─────────────────────────────────────────────────────────

// A plain pot with a rim, standing on z, soil showing.
export function pot(k: Kit, u: number, v: number, z: number, r: number, h: number, color: Color = C.pot): void {
  k.shadow(u, v, r * 1.25, r * 1.25, 0.26, z);
  frustum(k, u, v, z, r * 0.78, z + h * 0.82, r * 0.95, color, null);
  k.cyl(u, v, z + h * 0.8, r, h * 0.2, shade(color, 0.04));
  k.disc(u, v, z + h - 0.02, r * 0.84, '#4a3428', 0);
}

// A snake plant: tall upright blades, banded, from (u, v, z), h tall.
export function snake(k: Kit, u: number, v: number, z: number, h: number, seed: number): void {
  const [x, y] = k.p(u, v, z);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.16 + (hash(seed, i, 7) - 0.5) * 0.14;
    const L = h * k.s * (0.7 + hash(seed, i, 8) * 0.3);
    const dx = (i - (n - 1) / 2) * 0.12 * k.s;
    leaf(k, x + dx, y, a, L, L * 0.12, i & 1 ? C.leaf : '#3e7d4a', false);
    if (k.fine) {
      // the yellow edge and a band or two across
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      k.pen.beginPath();
      for (const f of [0.35, 0.6]) {
        k.pen.moveTo(x + dx + ca * L * f - sa * L * 0.07, y + sa * L * f + ca * L * 0.07);
        k.pen.lineTo(x + dx + ca * L * f + sa * L * 0.07, y + sa * L * f - ca * L * 0.07);
      }
      k.pen.strokeStyle = withAlpha(C.leafLight, 0.7);
      k.pen.lineWidth = 0.08 * k.s;
      k.pen.stroke();
    }
  }
}

// A monstera: split round leaves on stalks arching out of (u, v, z).
export function monstera(k: Kit, u: number, v: number, z: number, h: number, seed: number): void {
  const [x, y] = k.p(u, v, z);
  const n = 6;
  const leaves = Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + (hash(seed, i, 9) - 0.5) * 0.3;
    const L = h * k.s * (0.55 + hash(seed, i, 10) * 0.25);
    return { a, L, up: Math.sin(a) };
  }).sort((p, q) => q.L - p.L);
  for (const [i, lf] of leaves.entries()) {
    const sx = x + Math.cos(lf.a) * lf.L * 0.55;
    const sy = y + Math.sin(lf.a) * lf.L * 0.55;
    k.pen.beginPath();
    k.pen.moveTo(x, y);
    k.pen.quadraticCurveTo(x + Math.cos(lf.a) * lf.L * 0.2, y + Math.sin(lf.a) * lf.L * 0.5, sx, sy);
    k.pen.strokeStyle = '#3e7d4a';
    k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
    k.pen.stroke();
    paddle(k, sx, sy, lf.a + (lf.a < -Math.PI / 2 ? -0.35 : 0.35), lf.L * 0.8, i & 1 ? C.leafLight : C.leaf, true);
  }
}

// A little succulent in a pot on a desk.
export function succulent(k: Kit, u: number, v: number, z: number, r = 0.5): void {
  k.cyl(u, v, z, r, r * 1.3, C.pot);
  const [x, y] = k.p(u, v, z + r * 1.3);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.55;
    leaf(k, x, y, a, r * 1.8 * k.s, r * 0.55 * k.s, i & 1 ? C.leafLight : C.leaf, false);
  }
}

// ── furniture bits ──────────────────────────────────────────────────────────

// A modern bar stool: a round seat on four black steel legs with a
// footrest ring, h tall.
export function stool(k: Kit, cu: number, cv: number, h: number, seat: Color = C.birch, r = 0.95): void {
  k.shadow(cu, cv, r * 1.3, r * 1.3, 0.22);
  const ringAt = (z: number, rr: number) => {
    const e = k.ell(cu, cv, z, rr);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  };
  ringAt(h * 0.35, r * 0.85);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1.4, 0.18 * k.s + k.lw * 1.2);
  k.pen.stroke();
  k.pen.strokeStyle = C.steelLight;
  k.pen.lineWidth = Math.max(0.8, 0.18 * k.s);
  k.pen.stroke();
  for (const a of [0.8, 2.35, 3.9, 5.5]) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    k.rod([[cu + ca * r * 0.55, cv + sa * r * 0.55, h - 0.4], [cu + ca * r * 0.95, cv + sa * r * 0.95, 0]], C.steel, 0.13);
  }
  k.cyl(cu, cv, h - 0.45, r, 0.45, seat);
}

// A caster: a little black wheel under a fork, at (u, v) on the floor.
export function caster(k: Kit, u: number, v: number, along: 'u' | 'v' = 'u'): void {
  k.shadow(u, v, 0.45, 0.45, 0.3);
  const n: P3 = along === 'u' ? [0, 1, 0] : [1, 0, 0];
  fillPts(k, ring(k, [u, v, 0.3], n, 0.3, 12), C.tire, k.thin);
}

// A mug with a handle on the +u side, standing on z.
export function mug(k: Kit, u: number, v: number, z: number, color: Color, r = 0.32): void {
  k.cyl(u, v, z, r, r * 1.6, color, { line: k.thin });
  k.disc(u, v, z + r * 1.6 - 0.03, r * 0.78, C.coffee, 0);
  k.rod([[u + r * 0.9, v, z + r * 1.35], [u + r * 1.45, v, z + r * 1.0], [u + r * 0.9, v, z + r * 0.5]], color, Math.max(0.06, r * 0.22));
}

// Muted spines for books (no titles, no marks).
export const SPINES: readonly Color[] = ['#c9714b', '#4f7fae', '#e2b44a', '#3f8f8a', '#a35a6e', '#7b8a5a', '#d8cbb0', '#5a5f7a', '#b98c5a', '#8c6ab8'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.34 + hash(seed, i, 61) * 0.32;
    if (u + w > u1) break;
    const h = hmax * (0.66 + hash(seed, i, 63) * 0.32);
    const c = SPINES[Math.floor(hash(seed, i, 64) * SPINES.length)];
    const lean = hash(seed, i, 65) < 0.08 && i > 0 && u + w + 0.4 < u1 ? 0.35 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.3 : 0.02);
    i++;
  }
  for (const [c, qs] of byColor) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  if (k.fine) {
    // a pale band across each spine
    const bands: Array<[P3, P3]> = all.map((q) => {
      const f = 0.78;
      const hh = q[3][2] - q[0][2];
      return [[q[0][0] + (q[3][0] - q[0][0]) * f, v, q[0][2] + hh * f], [q[1][0] + (q[2][0] - q[1][0]) * f, v, q[1][2] + hh * f]];
    });
    k.segs(bands, withAlpha('#f6efe0', 0.6), Math.max(0.7, 0.08 * k.s));
  }
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A flat screen's face on the plane v = n, from (u0, z0) to (u1, z1): a
// gradient of the dark glass and a soft diagonal sheen.
export function glass(k: Kit, u0: number, z0: number, u1: number, z1: number, n: number, top: Color, bottom: Color): void {
  k.poly([[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]], k.vgrad(u0, n, z0, z1, [[0, bottom], [1, top]]), 0);
}

// The screen outline of a soft lump: an ellipsoid at (cu, cv, cz), ru
// across and rz up.
function lump(k: Kit, cu: number, cv: number, cz: number, ru: number, rv: number, rz: number): Pt[] {
  const pts: Pt[] = [];
  for (const a of [-1.2, -0.7, -0.25, 0.25, 0.7, 1.2]) {
    const c = Math.cos(a);
    for (let i = 0; i < 18; i++) {
      const th = (i / 18) * Math.PI * 2;
      pts.push(k.p(cu + Math.cos(th) * ru * c, cv + Math.sin(th) * rv * c, cz + Math.sin(a) * rz));
    }
  }
  return hull(pts);
}

// A slumped beanbag at (cu, cv), r across and h tall: a soft body sagging
// on the floor, its back risen toward the wall, the hollow where you sit,
// a seam over the back.
export function beanbag(k: Kit, cu: number, cv: number, r: number, h: number, color: Color): void {
  k.shadow(cu, cv + 0.1 * r, r * 1.2, r * 1.1, 0.32);
  const back = lump(k, cu + 0.25 * r, cv - 0.55 * r, h * 0.56, r * 0.8, r * 0.5, h * 0.44);
  const body = lump(k, cu - 0.05 * r, cv + 0.12 * r, h * 0.28, r, r * 0.95, h * 0.28);
  const sil = hull([...back, ...body]);
  fillPts(k, sil, across(k, sil, color, 0.2, 0.26), k.lw);
  // the back's soft fold over the seat
  const [fx0, fy0] = k.p(cu - 0.55 * r, cv - 0.35 * r, h * 0.6);
  const [fx1, fy1] = k.p(cu + 0.35 * r, cv - 0.1 * r, h * 0.85);
  const [fx2, fy2] = k.p(cu + 0.95 * r, cv - 0.3 * r, h * 0.5);
  k.pen.beginPath();
  k.pen.moveTo(fx0, fy0);
  k.pen.quadraticCurveTo(fx1, fy1, fx2, fy2);
  k.pen.strokeStyle = withAlpha(shade(color, -0.4), 0.8);
  k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  k.pen.lineCap = 'round';
  k.pen.stroke();
  // the hollow: shade at its back, a lit lip along its front
  const [hx, hy] = k.p(cu - 0.1 * r, cv + 0.12 * r, h * 0.52);
  k.pen.beginPath();
  k.pen.ellipse(hx, hy, r * 0.62 * k.s, r * 0.3 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = withAlpha(shade(color, -0.32), 0.7);
  k.pen.fill();
  k.pen.beginPath();
  k.pen.ellipse(hx, hy + r * 0.04 * k.s, r * 0.6 * k.s, r * 0.28 * k.s, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  k.pen.strokeStyle = withAlpha(shade(color, 0.4), 0.9);
  k.pen.lineWidth = Math.max(0.8, 0.13 * k.s);
  k.pen.lineCap = 'round';
  k.pen.stroke();
  // a glint on the back's crown, and a seam over it
  const [gx, gy] = k.p(cu + 0.05 * r, cv - 0.65 * r, h * 0.92);
  k.pen.beginPath();
  k.pen.ellipse(gx, gy, r * 0.22 * k.s, r * 0.1 * k.s, -0.3, 0, Math.PI * 2);
  k.pen.fillStyle = withAlpha('#ffffff', 0.3);
  k.pen.fill();
  if (k.fine) {
    const [sx0, sy0] = k.p(cu - 0.9 * r, cv - 0.2 * r, h * 0.45);
    const [sx1, sy1] = k.p(cu - 0.15 * r, cv - 0.55 * r, h * 1.05);
    const [sx2, sy2] = k.p(cu + 0.65 * r, cv - 0.55 * r, h * 0.55);
    k.pen.beginPath();
    k.pen.moveTo(sx0, sy0);
    k.pen.quadraticCurveTo(sx1, sy1, sx2, sy2);
    k.pen.strokeStyle = withAlpha(INK, 0.35);
    k.pen.lineWidth = Math.max(0.6, 0.07 * k.s);
    k.pen.stroke();
  }
}
