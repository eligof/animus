import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash } from './kit.ts';

// Small things the café is full of, drawn in any frame: cups, candles,
// flames, foliage, ivy, books and cushions.

// A cup on its saucer at (u, v) standing on z; `latte` draws a heart in
// the crema.
export function cup(k: Kit, u: number, v: number, z: number, color: Color = C.china, latte = true, r = 0.5): void {
  k.disc(u, v, z + 0.05, r * 1.6, shade(C.china, -0.04), k.thin);
  k.cyl(u, v, z + 0.1, r, r * 1.5, color);
  k.disc(u, v, z + 0.1 + r * 1.5 - 0.06, r * 0.8, C.coffee, 0);
  if (latte && k.s * r >= 5) {
    const [x, y] = k.p(u, v, z + 0.1 + r * 1.5 - 0.05);
    const h = r * k.s * 0.45;
    k.pen.beginPath();
    k.pen.moveTo(x, y + h * 0.6);
    k.pen.bezierCurveTo(x - h * 1.4, y - h * 0.2, x - h * 0.6, y - h * 0.9, x, y - h * 0.3);
    k.pen.bezierCurveTo(x + h * 0.6, y - h * 0.9, x + h * 1.4, y - h * 0.2, x, y + h * 0.6);
    k.pen.fillStyle = C.crema;
    k.pen.fill();
  }
  // the handle, on the +u side
  k.rod([[u + r * 0.95, v, z + r * 1.3], [u + r * 1.45, v, z + r * 1.05], [u + r * 0.95, v, z + r * 0.55]], color, Math.max(0.08, r * 0.2));
}

// A candle in a little glass jar, lit.
export function jarCandle(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.45, 0.8, '#e8c98a');
  const [x, y] = k.p(u, v, z + 1.15);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.14 * k.s, 0.28 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = C.flame;
  k.pen.fill();
  k.halo(u, v, z + 1.1, 1.8, '#ffc070', 0.5);
}

export function candle(k: Kit, u: number, n: number, z: number, h: number): void {
  k.cyl(u, n, z, 0.3, h, '#f5ecd8');
  const [x, y] = k.p(u, n, z + h + 0.45);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.16 * k.s, 0.32 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = C.flame;
  k.pen.fill();
  k.halo(u, n, z + h + 0.45, 1.6, '#ffc070', 0.45);
}

// Flames as nested tongues in the plane v = n, `phase` sets their sway.
export function flames(k: Kit, a: number, n: number, z: number, scale: number, phase = 0): void {
  const tongue = (du: number, w: number, h: number, sway: number, c: Color) => {
    k.poly(
      [
        [a + du - w, n, z],
        [a + du - w * 0.8, n, z + h * 0.45],
        [a + du + sway, n, z + h],
        [a + du + w * 0.8, n, z + h * 0.45],
        [a + du + w, n, z],
      ],
      c,
      0,
      0.5 * scale,
    );
  };
  const sw = (i: number) => Math.sin(phase * 2.3 + i * 1.7) * 0.35 * scale;
  tongue(-1.2 * scale, 1.1 * scale, 3.4 * scale, sw(0), C.fire);
  tongue(1.1 * scale, 1.0 * scale, 3.0 * scale, sw(1), C.fire);
  tongue(0, 1.5 * scale, 4.4 * scale, sw(2), C.fire);
  tongue(-0.9 * scale, 0.7 * scale, 2.4 * scale, sw(3), C.flame);
  tongue(0.8 * scale, 0.7 * scale, 2.2 * scale, sw(4), C.flame);
  tongue(0, 1.0 * scale, 3.2 * scale, sw(5), C.flame);
  tongue(0, 0.5 * scale, 1.8 * scale, sw(6), C.flameHot);
}

// Ivy spilling down from (u, n, z) in strands about `len` long.
export function ivy(k: Kit, u: number, n: number, z: number, len: number, seed: number, strands = 3): void {
  for (let j = 0; j < strands; j++) {
    const du = (j - (strands - 1) / 2) * 0.5;
    const pts: P3[] = [];
    const l = len * (0.6 + hash(seed, j, 51) * 0.5);
    for (let i = 0; i <= 6; i++) pts.push([u + du + Math.sin(i * 1.3 + j) * 0.25, n, z - (l * i) / 6]);
    k.line(pts, C.leafDark, Math.max(0.8, 0.1 * k.s));
    for (let i = 1; i <= 6; i++) {
      const [x, y] = k.p(pts[i][0] + (i & 1 ? 0.25 : -0.25), n + 0.1, pts[i][2]);
      k.pen.beginPath();
      k.pen.ellipse(x, y, 0.38 * k.s, 0.26 * k.s, i & 1 ? 0.5 : -0.5, 0, Math.PI * 2);
      k.paint(i % 3 ? C.leaf : C.leafLight, k.thin * 0.8);
    }
  }
}

// A bushy crown of leaves round (cu, cv, z): n leaves on an ellipsoid of
// radii r (across) and h (up), far ones first, lit ones toward the top left.
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

// A terracotta pot with a rim, standing on z.
export function pot(k: Kit, u: number, v: number, z: number, r: number, h: number, color: Color = C.terracotta): void {
  k.cyl(u, v, z, r * 0.82, h * 0.8, color);
  k.cyl(u, v, z + h * 0.78, r, h * 0.22, shade(color, 0.08));
  k.disc(u, v, z + h - 0.02, r * 0.82, '#4a3122', 0);
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

const pathOf = (k: Kit, pts: ReadonlyArray<Pt>) => {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
};

// A lampshade (or any upright cone frustum): radius r0 at z0, r1 at z1,
// shaded across, its top opening in `inside`.
export function frustum(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color, inside: Color): void {
  const bot = ring(k, [cu, cv, z0], [0, 0, 1], r0, 24);
  const top = ring(k, [cu, cv, z1], [0, 0, 1], r1, 24);
  const sil = hull([...bot, ...top]);
  const xs = sil.map((p) => p[0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const g = k.pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, 0.08));
  g.addColorStop(0.35, shade(base, 0.14));
  g.addColorStop(0.7, base);
  g.addColorStop(1, shade(base, -0.22));
  pathOf(k, sil);
  k.paint(g, 0);
  pathOf(k, top);
  k.paint(inside, k.thin);
  pathOf(k, sil);
  k.paint(null, k.lw);
}

// A bentwood café chair at (cu, cv), its sitter facing angle `face` (in
// the u-v plane), the back hoop behind.
export function chair(k: Kit, cu: number, cv: number, face: number, wood: Color = C.walnut, seat: Color = '#d9b77c'): void {
  const du = Math.cos(face);
  const dv = Math.sin(face);
  const pu = -dv;
  const pv = du;
  const zs = 3.6;
  const r = 1.3;
  const bu = cu - du * r * 0.8;
  const bv = cv - dv * r * 0.8;
  const hoop: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const th = (i / 12) * Math.PI;
    const side = Math.cos(th);
    const up = i === 0 || i === 12 ? 0 : 1;
    const z = zs + 0.2 + (up ? 2.7 + Math.sin(th) * 1.2 : 0);
    const lean = (z - zs) * 0.1;
    hoop.push([bu + pu * side * r * 0.8 - du * lean, bv + pv * side * r * 0.8 - dv * lean, z]);
  }
  const behind = du + dv > 0; // the hoop is on the far side
  const legs = () => {
    for (const a of [0.8, 2.35, 3.9, 5.5]) {
      const ca = Math.cos(a + face);
      const sa = Math.sin(a + face);
      k.rod([[cu + ca * r * 0.65, cv + sa * r * 0.65, zs], [cu + ca * r * 0.92, cv + sa * r * 0.92, 0]], wood, 0.2);
    }
  };
  k.shadow(cu, cv, r * 1.3, r * 1.3, 0.24);
  if (behind) k.rod(hoop, wood, 0.26);
  legs();
  k.cyl(cu, cv, zs - 0.35, r, 0.4, wood);
  k.disc(cu, cv, zs + 0.05, r * 0.8, seat, k.thin);
  if (!behind) k.rod(hoop, wood, 0.26);
}

// A bar stool: a round seat on splayed legs with a footrest ring.
export function stool(k: Kit, cu: number, cv: number, top: Color, wood: Color = C.walnutDark, h = 5.2): void {
  k.shadow(cu, cv, 1.3, 1.3, 0.22);
  const ring2 = (z: number, r: number) => {
    const e = k.ell(cu, cv, z, r);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  };
  ring2(1.8, 0.95);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1.4, 0.2 * k.s + k.lw * 1.2);
  k.pen.stroke();
  k.pen.strokeStyle = C.brass;
  k.pen.lineWidth = Math.max(0.8, 0.2 * k.s);
  k.pen.stroke();
  for (const a of [0.8, 2.35, 3.9, 5.5]) {
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    k.rod([[cu + ca * 0.6, cv + sa * 0.6, h - 0.4], [cu + ca * 0.95, cv + sa * 0.95, 0]], wood, 0.16);
  }
  k.cyl(cu, cv, h - 0.5, 1.0, 0.5, top);
}

export const BINDINGS: readonly Color[] = ['#b5543a', '#dba640', '#2f6e6a', '#efe0c2', '#8f2f2f', '#5f8b7d', '#34476b', '#7a4a6a', '#c98a4a', '#3d5a40'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number, gaps = true): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const tops: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.42 + hash(seed, i, 61) * 0.4;
    if (u + w > u1) break;
    if (gaps && hash(seed, i, 62) < 0.08 && u > u0 + 1) {
      u += 0.6;
      i++;
      continue;
    }
    const h = hmax * (0.68 + hash(seed, i, 63) * 0.3);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
    const lean = hash(seed, i, 65) < 0.07 && i > 0 ? 0.35 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    tops.push(q);
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
    // bands across the spines
    pen.beginPath();
    for (const q of tops) {
      const [a, b] = [q[0], q[1]];
      const hh = q[3][2] - a[2];
      for (const f of [0.18, 0.82]) {
        const [x0, y0] = k.p(a[0] + (q[3][0] - a[0]) * f, v, a[2] + hh * f);
        const [x1, y1] = k.p(b[0] + (q[2][0] - b[0]) * f, v, b[2] + hh * f);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = '#f3dfae99';
    pen.lineWidth = Math.max(0.7, 0.07 * k.s);
    pen.stroke();
  }
  pen.beginPath();
  for (const q of tops) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}
