import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the station is full of, drawn in any frame: hazard paint,
// crates, stools, mugs and pouches, screens, rivets, foliage and the
// geometry helpers they share (rings in any plane, hulls, quads).

export type Quad = readonly [P3, P3, P3, P3];

// A point on a quad: fu along a -> b, fz along a -> d.
export const on = (q: Quad, fu: number, fz: number): P3 => {
  const [a, b, , d] = q;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

// The quad inset by fractions of itself.
export const sub = (q: Quad, f0: number, z0: number, f1: number, z1: number): Quad => [on(q, f0, z0), on(q, f1, z0), on(q, f1, z1), on(q, f0, z1)];

// Fills a polygon of screen points.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

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

// Frame points round a circle of radius r centred on c, square to n, from
// angle a0 to a1 (radians round n, from a fixed reference).
export function arc3(c: P3, n: P3, r: number, a0 = 0, a1 = Math.PI * 2, steps = 20): P3[] {
  const l = Math.hypot(...n) || 1;
  const N: P3 = [n[0] / l, n[1] / l, n[2] / l];
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const A = cr(N, ref);
  const la = Math.hypot(...A);
  const a: P3 = [A[0] / la, A[1] / la, A[2] / la];
  const b = cr(N, a);
  const out: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const th = a0 + ((a1 - a0) * i) / steps;
    const cs = Math.cos(th) * r;
    const sn = Math.sin(th) * r;
    out.push([c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn]);
  }
  return out;
}

// Screen points round a circle (see arc3).
export function ring(k: Kit, c: P3, n: P3, r: number, steps = 20): Pt[] {
  return arc3(c, n, r, 0, Math.PI * 2, steps).slice(0, -1).map((p) => k.p(...p));
}

// A circle on the upright plane v = n (a porthole, a dial), (a, z) its
// centre: screen points.
export function wallRing(k: Kit, a: number, n: number, z: number, r: number, steps = 24): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    out.push(k.p(a + Math.cos(th) * r, n, z + Math.sin(th) * r));
  }
  return out;
}

// The front of an upright cylinder between za and zb (what shows between
// two collars): the near half of each rim, joined.
export function band(k: Kit, cu: number, cv: number, r: number, za: number, zb: number): void {
  const a = k.ell(cu, cv, za, r);
  const b = k.ell(cu, cv, zb, r);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(b.cx, b.cy, b.rx, b.ry, b.rot, 0, Math.PI);
  pen.lineTo(a.cx - a.rx, a.cy);
  pen.ellipse(a.cx, a.cy, a.rx, a.ry, a.rot, Math.PI, 0, true);
  pen.closePath();
}

// Diagonal hazard stripes across a quad: yellow and ink, `n` pairs.
export function hazard(k: Kit, q: Quad, n = 5, line = k.thin, a = C.yellow, b = '#22232c'): void {
  const pen = k.pen;
  k.poly([...q], a, 0);
  pen.save();
  pen.beginPath();
  k.trace([...q]);
  pen.clip();
  pen.beginPath();
  const w = 1 / n;
  for (let i = -n; i < 2 * n; i++) {
    const f = i * w;
    k.trace([on(q, f, 0), on(q, f + w / 2, 0), on(q, f + w / 2 + 1, 1), on(q, f + 1, 1)]);
  }
  pen.fillStyle = b;
  pen.fill();
  pen.restore();
  if (line <= 0) return;
  pen.beginPath();
  k.trace([...q]);
  k.paint(null, line);
}

// Rivets: tiny lit dots at frame points (only when zoomed in).
export function rivets(k: Kit, pts: ReadonlyArray<P3>, color: Color = '#eef2f8', r = 0.12): void {
  if (!k.fine || !pts.length) return;
  const pen = k.pen;
  const px = Math.max(0.7, r * k.s);
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x + px, y);
    pen.arc(x, y, px, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha(INK, 0.55);
  pen.fill();
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x - px * 0.25 + px * 0.55, y - px * 0.3);
    pen.arc(x - px * 0.25, y - px * 0.3, px * 0.55, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();
}

// A glowing screen on a quad: a dark glass gradient, a sheen, an ink frame.
export function glass(k: Kit, q: Quad, lit: boolean, tint: Color = C.screen): void {
  k.poly([...q], lit ? k.grad(q[3], q[1], [[0, shade(tint, 0.3)], [1, tint]]) : k.grad(q[3], q[1], [[0, C.screenMid], [1, C.screenDark]]), k.thin);
  k.poly([on(q, 0.55, 0.04), on(q, 0.72, 0.04), on(q, 0.4, 0.96), on(q, 0.23, 0.96)], '#ffffff16', 0);
}

// Rows of "code" on a screen quad: short coloured bars, scrolled by `roll`
// (rows a second times t); none of it text.
export function codeRows(k: Kit, q: Quad, roll: number, rows = 7, colors: readonly Color[] = ['#1d5a7a', '#c0507a', '#2f8f5a', '#7a5ab0', '#16324a']): void {
  const pen = k.pen;
  const base = Math.floor(roll);
  const h = 0.8 / rows;
  for (const [ci, c] of colors.entries()) {
    pen.beginPath();
    let any = false;
    for (let i = 0; i < rows + 1; i++) {
      const row = base - i;
      if (Math.floor(hash(row, 3) * colors.length) !== ci) continue;
      const fz = 0.1 + (i + roll - base) * h;
      if (fz > 0.86) continue;
      const ind = Math.floor(hash(row, 1) * 4) * 0.07;
      const len = 0.2 + hash(row, 2) * 0.45;
      const f0 = 0.1 + ind;
      const f1 = Math.min(0.9, f0 + len);
      k.trace([on(q, f0, fz), on(q, f1, fz), on(q, f1, fz + h * 0.5), on(q, f0, fz + h * 0.5)]);
      any = true;
    }
    if (!any) continue;
    pen.fillStyle = c;
    pen.fill();
  }
}

// A cargo crate: a box with stencilled stripes on its two visible sides
// (chevrons, bars or a corner band by seed), a lid seam and corner caps.
export function crate(k: Kit, u: number, v: number, z: number, du: number, dv: number, dz: number, body: Color, stripe: Color, seed: number): void {
  k.box(u, v, z, du, dv, dz, body, { round: 0.12 });
  const style = Math.floor(hash(seed, 1) * 3);
  // the +v face and the +u face, each as a quad (bottom-left first)
  const fv: Quad = [[u, v + dv, z], [u + du, v + dv, z], [u + du, v + dv, z + dz], [u, v + dv, z + dz]];
  const fu: Quad = [[u + du, v + dv, z], [u + du, v, z], [u + du, v, z + dz], [u + du, v + dv, z + dz]];
  for (const [f, nu, nv] of [[fv, 0, 1], [fu, 1, 0]] as const) {
    const c = k.side(stripe, nu, nv, 0.16);
    if (style === 0) {
      // a band of chevrons
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 3; i++) {
        const f0 = 0.22 + i * 0.2;
        k.trace([on(f, f0, 0.3), on(f, f0 + 0.1, 0.5), on(f, f0, 0.7), on(f, f0 + 0.08, 0.7), on(f, f0 + 0.18, 0.5), on(f, f0 + 0.08, 0.3)]);
      }
      pen.fillStyle = c;
      pen.fill();
    } else if (style === 1) {
      // two bars across
      k.poly([on(f, 0.06, 0.58), on(f, 0.94, 0.58), on(f, 0.94, 0.72), on(f, 0.06, 0.72)], c, 0);
      k.poly([on(f, 0.06, 0.28), on(f, 0.94, 0.28), on(f, 0.94, 0.36), on(f, 0.06, 0.36)], c, 0);
    } else {
      // hazard corner and a square stencil block
      k.poly([on(f, 0.06, 0.08), on(f, 0.36, 0.08), on(f, 0.06, 0.42)], c, 0);
      k.poly([on(f, 0.55, 0.45), on(f, 0.85, 0.45), on(f, 0.85, 0.8), on(f, 0.55, 0.8)], withAlpha(c, 0.8), 0);
    }
  }
  // lid seam round the visible sides
  const zs = z + dz * 0.84;
  k.line([[u, v + dv, zs], [u + du, v + dv, zs], [u + du, v, zs]], withAlpha(INK, 0.6), Math.max(0.7, k.thin * 0.7));
}

// A swivel stool: a round seat on a post, a five-spoked foot.
export function stool(k: Kit, cu: number, cv: number, seat: Color, h = 3.6): void {
  k.shadow(cu, cv, 1.2, 1.2, 0.22);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    k.rod([[cu, cv, 0.35], [cu + Math.cos(a) * 1.0, cv + Math.sin(a) * 1.0, 0.15]], C.steelDark, 0.14);
  }
  k.rod([[cu, cv, 0.3], [cu, cv, h - 0.4]], C.steel, 0.2);
  k.cyl(cu, cv, h - 0.5, 0.95, 0.55, seat);
}

// A mug standing on z, handle toward +u.
export function mug(k: Kit, u: number, v: number, z: number, color: Color, r = 0.42): void {
  k.rod([[u + r * 0.9, v, z + r * 1.6], [u + r * 1.5, v, z + r * 1.3], [u + r * 0.9, v, z + r * 0.6]], color, Math.max(0.08, r * 0.22));
  k.cyl(u, v, z, r, r * 2, color);
  k.disc(u, v, z + r * 2 - 0.04, r * 0.78, '#4a2c1c', 0);
}

// A food pouch lying or standing on z: a squat rounded packet with a cap.
export function pouch(k: Kit, u: number, v: number, z: number, color: Color): void {
  k.box(u - 0.45, v - 0.2, z, 0.9, 0.4, 1.0, color, { round: 0.2, line: k.thin });
  k.cyl(u, v, z + 1.0, 0.15, 0.25, C.white, { line: k.thin * 0.8 });
}

// One pointed leaf from (x, y) toward angle a, length L px (screen space).
export function leaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color, rib = true): void {
  const pen = k.pen;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (s: number, t: number): Pt => [x + ca * s - sa * t, y + sa * s + ca * t];
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

// A bushy crown of leaves round (cu, cv, z): n leaves on an ellipsoid of
// radii r (across) and h (up), far ones first, lit ones toward the top.
export function crown(k: Kit, cu: number, cv: number, z: number, r: number, h: number, n: number, seed: number, greens: readonly Color[] = [C.leafDark, C.leaf, C.leafLight]): void {
  const leaves: Array<{ u: number; v: number; z: number; d: number; a: number; l: number }> = [];
  for (let i = 0; i < n; i++) {
    const th = hash(seed, i, 1) * Math.PI * 2;
    const ph = Math.acos(1 - 2 * (0.15 + hash(seed, i, 2) * 0.85));
    const u = cu + Math.cos(th) * Math.sin(ph) * r;
    const v = cv + Math.sin(th) * Math.sin(ph) * r;
    const zz = z + Math.cos(ph) * h;
    leaves.push({ u, v, z: zz, d: u + v + zz * 0.5, a: hash(seed, i, 3) * Math.PI, l: 0.75 + hash(seed, i, 4) * 0.5 });
  }
  leaves.sort((p, q) => p.d - q.d);
  const lo = Math.min(...leaves.map((q) => q.d));
  const hi = Math.max(...leaves.map((q) => q.d));
  for (const lf of leaves) {
    const [x, y] = k.p(lf.u, lf.v, lf.z);
    const t = (lf.d - lo) / (hi - lo || 1);
    const c = greens[Math.min(greens.length - 1, Math.floor(t * greens.length))];
    const L = lf.l * k.s * 0.9;
    k.pen.beginPath();
    k.pen.ellipse(x, y, L, L * 0.55, lf.a, 0, Math.PI * 2);
    k.paint(c, k.thin);
  }
}

// A fan of leaves out of (cu, cv, z): sprouts in hydroponic trays, herbs.
export function sprouts(k: Kit, cu: number, cv: number, z: number, n: number, len: number, seed: number, greens: readonly Color[] = [C.leaf, C.leafLight]): void {
  const [x, y] = k.p(cu, cv, z);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * (1.6 / Math.max(1, n - 1)) + (hash(seed, i, 7) - 0.5) * 0.3;
    leaf(k, x, y, a, (len * (0.75 + hash(seed, i, 8) * 0.4)) * k.s, len * 0.3 * k.s, greens[i % greens.length], false);
  }
}

export const BINDINGS: readonly Color[] = ['#e07a3a', '#3f6096', '#e7ecf2', '#2f8f7a', '#c0507a', '#f2c230', '#5a6a8a', '#7a5ab0', '#9fb3c8', '#d9534f'];

// A row of books (or data slates) standing on a shelf at z, their spines
// on the plane v, from u0 to u1, no taller than hmax. Books of one colour
// go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.4 + hash(seed, i, 61) * 0.4;
    if (u + w > u1) break;
    const h = hmax * (0.62 + hash(seed, i, 63) * 0.36);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
    const lean = hash(seed, i, 65) < 0.08 && i > 0 ? 0.3 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.28 : 0.02);
    i++;
  }
  for (const [c, qs] of byColor) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  if (k.fine) {
    // a label band on each spine (blank: no text)
    pen.beginPath();
    for (const q of all) {
      const hh = q[3][2] - q[0][2];
      k.trace([[q[0][0] + 0.08, v, q[0][2] + hh * 0.62], [q[1][0] - 0.08, v, q[1][2] + hh * 0.62], [q[1][0] - 0.08, v, q[1][2] + hh * 0.74], [q[0][0] + 0.08, v, q[0][2] + hh * 0.74]]);
    }
    pen.fillStyle = '#f4f1e899';
    pen.fill();
  }
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A potted plant in a sealed station planter: a white pot with an orange
// band and a little crown.
export function planter(k: Kit, u: number, v: number, z: number, r: number, h: number, seed: number): void {
  k.cyl(u, v, z, r, h, C.white);
  k.cyl(u, v, z + h * 0.55, r * 1.02, h * 0.18, C.orange, { line: k.thin });
  k.disc(u, v, z + h - 0.02, r * 0.82, C.soil, 0);
  crown(k, u, v, z + h + r * 0.7, r * 1.1, r * 0.75, 8, seed);
}
