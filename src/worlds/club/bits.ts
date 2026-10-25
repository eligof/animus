import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the club is full of, drawn in any frame: stools, glasses,
// bottles, speaker cones, a platter, palm fronds, plush toys.

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

// Fills (and inks) a polygon of screen points.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | import('../../art/types.ts').Gradient, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

// A bar stool: a round velvet seat on a chrome column and foot ring.
export function stool(k: Kit, cu: number, cv: number, top: Color = C.velvet, h = 5.4): void {
  k.shadow(cu, cv, 1.3, 1.3, 0.28);
  k.disc(cu, cv, 0.05, 0.95, C.steelDark, k.thin);
  k.cyl(cu, cv, 0.05, 0.18, h - 0.5, C.chrome, { line: k.thin });
  const e = k.ell(cu, cv, 1.9, 0.75);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1.4, 0.18 * k.s + k.lw * 1.2);
  k.pen.stroke();
  k.pen.strokeStyle = C.chrome;
  k.pen.lineWidth = Math.max(0.8, 0.18 * k.s);
  k.pen.stroke();
  k.cyl(cu, cv, h - 0.55, 1.05, 0.55, top, { top: shade(top, 0.18) });
}

// A martini glass with a drink in it on z.
export function martini(k: Kit, u: number, v: number, z: number, drink: Color = C.lime, r = 0.5): void {
  k.disc(u, v, z + 0.02, r * 0.6, '#d8e4f0aa', k.thin * 0.7);
  k.line([[u, v, z], [u, v, z + r * 1.3]], '#e6eef8', Math.max(0.8, 0.09 * k.s));
  const e0 = k.ell(u, v, z + r * 1.3, 0.05);
  const e1 = k.ell(u, v, z + r * 2.4, r);
  fillPts(k, [[e0.cx, e0.cy], [e1.cx + e1.rx, e1.cy], [e1.cx - e1.rx, e1.cy]], withAlpha(drink, 0.85), k.thin);
  k.disc(u, v, z + r * 2.4, r, withAlpha(mix(drink, '#ffffff', 0.4), 0.9), k.thin);
}

// A tumbler or highball with a drink, an ice cube, maybe a straw.
export function tumbler(k: Kit, u: number, v: number, z: number, drink: Color, h = 1.1, r = 0.38, straw?: Color): void {
  k.cyl(u, v, z, r, h, '#cfe0eecc', { line: k.thin, top: withAlpha(mix(drink, '#ffffff', 0.25), 0.95) });
  k.cyl(u, v, z + 0.05, r * 0.86, h * 0.72, withAlpha(drink, 0.8), { line: 0, top: withAlpha(mix(drink, '#ffffff', 0.3), 0.9) });
  if (straw) k.rod([[u + r * 0.3, v, z + h * 0.6], [u + r * 0.9, v - 0.1, z + h + 0.7]], straw, 0.07);
}

// A bottle: body, shoulder and neck, a label band; glass catches the light.
export function bottle(k: Kit, u: number, v: number, z: number, glass: Color, h = 2.2, r = 0.42, label?: Color): void {
  k.cyl(u, v, z, r, h * 0.62, glass, { line: k.thin });
  const e0 = k.ell(u, v, z + h * 0.62, r);
  const e1 = k.ell(u, v, z + h * 0.78, r * 0.36);
  fillPts(k, [[e0.cx - e0.rx, e0.cy], [e0.cx + e0.rx, e0.cy], [e1.cx + e1.rx, e1.cy], [e1.cx - e1.rx, e1.cy]], shade(glass, 0.08), k.thin);
  k.cyl(u, v, z + h * 0.76, r * 0.34, h * 0.24, glass, { line: k.thin });
  if (label) k.cyl(u, v, z + h * 0.18, r * 1.01, h * 0.26, label, { line: 0 });
  k.line([[u - r * 0.45, v + r * 0.6, z + h * 0.15], [u - r * 0.45, v + r * 0.6, z + h * 0.55]], '#ffffff66', Math.max(0.7, 0.1 * k.s));
}

// A speaker cone on the plane v = n: surround, cone, dust cap; `pump`
// pushes it out (0..1).
export function cone(k: Kit, a: number, n: number, z: number, r: number, pump = 0): void {
  k.ring(a, n, z, r * 1.08, '#8e8aa3', k.thin);
  k.ring(a, n + 0.01, z, r, '#16121c', 0);
  const g = k.grad([a - r, n, z + r], [a + r, n, z - r], [[0, '#5a546a'], [1, '#262130']]);
  k.ring(a, n + 0.02, z, r * (0.8 + pump * 0.06), g, 0);
  k.ring(a, n + 0.04, z, r * (0.3 + pump * 0.05), shade('#3a3446', 0.1 + pump * 0.15), k.thin * 0.7);
}

// A turntable's platter and record seen from above, centre (u, v, z).
export function platter(k: Kit, u: number, v: number, z: number, r: number, label: Color): void {
  k.cyl(u, v, z, r, 0.18, C.steel, { line: k.thin });
  k.disc(u, v, z + 0.2, r * 0.93, '#18141e', 0);
  if (k.s * r >= 6) {
    for (const f of [0.78, 0.62]) {
      const e = k.ell(u, v, z + 0.2, r * f);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      k.pen.strokeStyle = '#3a3344';
      k.pen.lineWidth = Math.max(0.5, 0.05 * k.s);
      k.pen.stroke();
    }
  }
  k.disc(u, v, z + 0.21, r * 0.32, label, 0);
  k.disc(u, v, z + 0.22, r * 0.05, '#e8e4ee', 0);
}

// One pointed leaf from (x, y) toward angle a, length L px (screen space).
export function leaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color, line = k.thin): void {
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
  k.paint(fill, line);
}

// A palm frond: an arching rib from (x, y) with leaflets either side.
export function frond(k: Kit, x: number, y: number, a: number, L: number, droop: number, fill: Color): void {
  const pen = k.pen;
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    pts.push([x + Math.cos(a) * L * t, y + Math.sin(a) * L * t + droop * L * t * t]);
  }
  const n = 5;
  for (let i = 1; i <= n; i++) {
    const t = i / (n + 1);
    const j = Math.round(t * 8);
    const [px, py] = pts[j];
    const dir = Math.atan2(pts[Math.min(8, j + 1)][1] - pts[Math.max(0, j - 1)][1], pts[Math.min(8, j + 1)][0] - pts[Math.max(0, j - 1)][0]);
    const len = L * 0.34 * (1 - t * 0.5);
    for (const sd of [-1, 1]) leaf(k, px, py, dir + sd * 0.9 + 0.35, len, len * 0.22, fill, Math.max(0.6, k.thin * 0.5));
  }
  pen.beginPath();
  pts.forEach(([px, py], i) => (i ? pen.lineTo(px, py) : pen.moveTo(px, py)));
  pen.strokeStyle = shade(fill, -0.3);
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.stroke();
}

// A plush toy: a round body and head with ears and two dot eyes, sitting
// at (u, v, z); `kind` picks bear, cat or bunny.
export function plush(k: Kit, u: number, v: number, z: number, r: number, color: Color, kind: number): void {
  const [x, y] = k.p(u, v, z + r * 0.9);
  const R = r * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, R * 1.05, R * 0.95, 0, 0, Math.PI * 2);
  k.paint(color, k.thin);
  const hy = y - R * 1.35;
  const ear = (ex: number, ey: number, rx: number, ry: number) => {
    pen.beginPath();
    pen.ellipse(ex, ey, rx, ry, 0, 0, Math.PI * 2);
    k.paint(color, k.thin);
  };
  if (kind === 2) for (const sx of [-1, 1]) ear(x + sx * R * 0.35, hy - R * 0.85, R * 0.22, R * 0.6);
  else if (kind === 1) {
    for (const sx of [-1, 1]) {
      pen.beginPath();
      pen.moveTo(x + sx * R * 0.75, hy - R * 0.2);
      pen.lineTo(x + sx * R * 0.65, hy - R * 1.0);
      pen.lineTo(x + sx * R * 0.2, hy - R * 0.6);
      pen.closePath();
      k.paint(color, k.thin);
    }
  } else for (const sx of [-1, 1]) ear(x + sx * R * 0.62, hy - R * 0.55, R * 0.3, R * 0.3);
  pen.beginPath();
  pen.ellipse(x, hy, R * 0.85, R * 0.72, 0, 0, Math.PI * 2);
  k.paint(shade(color, 0.08), k.thin);
  if (R >= 3) {
    for (const sx of [-1, 1]) {
      pen.beginPath();
      pen.arc(x + sx * R * 0.3, hy - R * 0.05, Math.max(0.6, R * 0.1), 0, Math.PI * 2);
      pen.fillStyle = INK;
      pen.fill();
    }
  }
}

// A row of record spines in a cubby on the plane v = n, u0..u1, z0 up to
// at most h tall: thin sleeves in dull colours, one path a tone.
export function spines(k: Kit, u0: number, u1: number, n: number, z0: number, h: number, seed: number): void {
  const tones: Color[] = ['#2a2433', '#3a3044', '#4a3a3a', '#2f3a48', '#5a4a3a', '#e8e0d0', '#6a3a4a', '#3a4a3a'];
  const byTone = new Map<Color, P3[][]>();
  let u = u0;
  let i = 0;
  while (u < u1 - 0.05) {
    const w = 0.13 + hash(seed, i, 81) * 0.1;
    const hh = h * (0.9 + hash(seed, i, 82) * 0.1);
    const c = tones[Math.floor(hash(seed, i, 83) * tones.length)];
    const q: P3[] = [[u, n, z0], [Math.min(u1, u + w), n, z0], [Math.min(u1, u + w), n, z0 + hh], [u, n, z0 + hh]];
    (byTone.get(c) ?? byTone.set(c, []).get(c)!).push(q);
    u += w + 0.015;
    i++;
  }
  for (const [c, qs] of byTone) {
    k.pen.beginPath();
    for (const q of qs) k.trace(q);
    k.pen.fillStyle = k.side(c, 0, 1, 0.1);
    k.pen.fill();
  }
}

// A sleeve face-out: a square cover with bold shapes (no words).
export function sleeve(k: Kit, a: number, n: number, z0: number, w: number, seed: number): void {
  const bgs: Color[] = [C.pink, '#21c2d8', C.amber, '#f3eadf', '#2a1d4a', C.lime, '#7a5ae0'];
  const bg = bgs[Math.floor(hash(seed, 91) * bgs.length)];
  k.rect(a, n, z0, a + w, z0 + w, k.side(bg, 0, 1, 0.12), k.thin);
  const fg = bg === '#2a1d4a' ? C.pink : '#1d1a24';
  const kind = Math.floor(hash(seed, 92) * 3);
  const cx = a + w / 2;
  const cz = z0 + w / 2;
  if (kind === 0) k.ring(cx, n + 0.01, cz, w * 0.3, fg, 0);
  else if (kind === 1) k.poly([[a + w * 0.2, n + 0.01, z0 + w * 0.2], [a + w * 0.8, n + 0.01, z0 + w * 0.2], [cx, n + 0.01, z0 + w * 0.8]], fg, 0);
  else for (let i = 3; i >= 1; i--) k.ring(cx, n + 0.01, cz, (w * 0.4 * i) / 3, i & 1 ? fg : bg, 0);
}
