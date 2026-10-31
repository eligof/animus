import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash } from './kit.ts';

// Small things the colony is full of, drawn in any frame: flames, logs and
// stones, barrels, crates and sacks, wheels, books, lamps, leaves and pots.

// ── geometry ────────────────────────────────────────────────────────────────

const norm = (n: P3): P3 => {
  const l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
};
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Two unit vectors spanning the plane square to n.
function basis(n: P3): [P3, P3] {
  const N = norm(n);
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = norm(cross(N, ref));
  return [a, cross(N, a)];
}

// The frame point at angle th on the circle (c, r) in the plane (a, b).
const onCircle = (c: P3, a: P3, b: P3, r: number, th: number): P3 => {
  const cs = Math.cos(th) * r;
  const sn = Math.sin(th) * r;
  return [c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn];
};

// Screen points round a circle of radius r centred on c, square to n.
export function ring(k: Kit, c: P3, n: P3, r: number, steps = 20): Pt[] {
  const [a, b] = basis(n);
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) out.push(k.p(...onCircle(c, a, b, r, (i / steps) * Math.PI * 2)));
  return out;
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

// Fills (and inks) a closed polygon of screen points.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, fill: Color | Gradient | null, line = k.lw): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(fill, line);
}

// An upright cone cut flat (a lamp's foot, a flower pot): radius r0 at z0
// to r1 at z1, shaded across like a cylinder (lit left), its top an ellipse.
export function frustum(k: Kit, cu: number, cv: number, z0: number, z1: number, r0: number, r1: number, base: Color, top: Color = shade(base, 0.12)): void {
  const sil = hull([...ring(k, [cu, cv, z0], [0, 0, 1], r0, 20), ...ring(k, [cu, cv, z1], [0, 0, 1], r1, 20)]);
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const [x] of sil) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  const g = k.pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, 0.1));
  g.addColorStop(0.35, base);
  g.addColorStop(1, shade(base, -0.25));
  fillPts(k, sil, g, k.lw);
  k.disc(cu, cv, z1, r1, top, k.thin);
}

// A ball centred on (cu, cv, z), r across, lit from the upper left.
export function ball(k: Kit, cu: number, cv: number, z: number, r: number, base: Color, line = k.lw): void {
  const [x, y] = k.p(cu, cv, z);
  const R = r * k.s;
  const g = k.pen.createRadialGradient(x - R * 0.35, y - R * 0.4, 0, x, y, R);
  g.addColorStop(0, shade(base, 0.3));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.22));
  k.pen.beginPath();
  k.pen.arc(x, y, R, 0, Math.PI * 2);
  k.paint(g, line);
}

// Smooth 1-D noise in [-1, 1] along x (seeded): wavy hill lines and stones.
export function wave(x: number, seed: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash(i, seed, 7) * 2 - 1;
  const b = hash(i + 1, seed, 7) * 2 - 1;
  const t = f * f * (3 - 2 * f);
  return a + (b - a) * t;
}

// ── fire and light ──────────────────────────────────────────────────────────

// Flames as nested tongues in the plane v = n, `phase` sets their sway
// (they loop in 2 s while it runs at a multiple of PI / 2 a second).
export function flames(k: Kit, a: number, n: number, z: number, scale: number, phase = 0): void {
  const tongue = (du: number, w: number, h: number, sway: number, c: Color) => {
    k.poly([[a + du - w, n, z], [a + du - w * 0.8, n, z + h * 0.45], [a + du + sway, n, z + h], [a + du + w * 0.8, n, z + h * 0.45], [a + du + w, n, z]], c, 0, 0.5 * scale);
  };
  const sw = (i: number) => Math.sin(phase * 2 + i * 1.7) * 0.35 * scale;
  const hh = (i: number) => 1 + Math.sin(phase * 4 + i * 2.3) * 0.12;
  tongue(-1.2 * scale, 1.1 * scale, 3.4 * scale * hh(0), sw(0), C.fire);
  tongue(1.1 * scale, 1.0 * scale, 3.0 * scale * hh(1), sw(1), C.fire);
  tongue(0, 1.5 * scale, 4.4 * scale * hh(2), sw(2), C.fire);
  tongue(-0.9 * scale, 0.7 * scale, 2.4 * scale * hh(3), sw(3), C.flame);
  tongue(0.8 * scale, 0.7 * scale, 2.2 * scale * hh(4), sw(4), C.flame);
  tongue(0, 1.0 * scale, 3.2 * scale * hh(5), sw(5), C.flame);
  tongue(0, 0.5 * scale, 1.8 * scale * hh(6), sw(6), C.flameHot);
}

// An oil lamp standing on z: a brass foot and font, a glass chimney lit
// from inside, a little flame; `glow` 0..1 sets how bright.
export function oilLamp(k: Kit, u: number, v: number, z: number, glow = 1, sc = 1): void {
  const s = k.s;
  k.cyl(u, v, z, 0.55 * sc, 0.2 * sc, '#b8863a', { line: k.thin });
  k.cyl(u, v, z + 0.2 * sc, 0.2 * sc, 0.35 * sc, '#b8863a', { line: k.thin });
  // the font: a squat brass bulb
  const [fx, fy] = k.p(u, v, z + 0.85 * sc);
  const e = k.ell(u, v, z, 0.55 * sc);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(fx, fy, e.rx, 0.32 * sc * s, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(fx - e.rx * 0.35, fy - 0.1 * s, 0, fx, fy, e.rx);
  g.addColorStop(0, '#f4d48a');
  g.addColorStop(1, '#a8742e');
  k.paint(g, k.thin);
  // the chimney: a bulged glass with the flame in it
  const [cx, cy] = k.p(u, v, z + 1.75 * sc);
  const rx = 0.36 * sc * s;
  const ry = 0.62 * sc * s;
  pen.beginPath();
  pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  if (glow > 0) {
    const gg = pen.createRadialGradient(cx, cy + ry * 0.2, 0, cx, cy, ry);
    gg.addColorStop(0, '#fffbe0');
    gg.addColorStop(0.5, '#ffe08a');
    gg.addColorStop(1, '#f0b050');
    k.paint(gg, k.thin);
  } else k.paint('#d8ccb0', k.thin);
  k.cyl(u, v, z + 2.35 * sc, 0.16 * sc, 0.3 * sc, '#d8ccb0', { line: k.thin });
  if (glow > 0) {
    k.halo(u, v, z + 1.7 * sc, 3.2 * sc, '#ffcf7a', 0.42 * glow);
    k.halo(u, v, z + 1.7 * sc, 1.2 * sc, '#fff2c0', 0.5 * glow);
  }
}

// ── wood and stone ──────────────────────────────────────────────────────────

// A log lying along u from u0 to u1, its axis at (cv, cz), radius r: bark
// round it, the sawn +u end showing its rings.
export function logU(k: Kit, u0: number, u1: number, cv: number, cz: number, r: number, bark: Color = C.log): void {
  const a = ring(k, [u0, cv, cz], [1, 0, 0], r, 16);
  const b = ring(k, [u1, cv, cz], [1, 0, 0], r, 16);
  logBody(k, a, b, bark, r, u0, u1, cv, cz, 'u');
}

// A log lying along v (the sawn +v end toward the viewer).
export function logV(k: Kit, v0: number, v1: number, cu: number, cz: number, r: number, bark: Color = C.log): void {
  const a = ring(k, [cu, v0, cz], [0, 1, 0], r, 16);
  const b = ring(k, [cu, v1, cz], [0, 1, 0], r, 16);
  logBody(k, a, b, bark, r, v0, v1, cu, cz, 'v');
}

function logBody(k: Kit, a: Pt[], b: Pt[], bark: Color, r: number, l0: number, l1: number, c: number, cz: number, axis: 'u' | 'v'): void {
  const sil = hull([...a, ...b]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of sil) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const g = k.pen.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(bark, 0.18));
  g.addColorStop(0.5, bark);
  g.addColorStop(1, shade(bark, -0.3));
  fillPts(k, sil, g, k.lw);
  if (k.fine) {
    // bark seams along the log
    const n: P3 = axis === 'u' ? [1, 0, 0] : [0, 1, 0];
    const at = (l: number): P3 => (axis === 'u' ? [l, c, cz] : [c, l, cz]);
    const p0 = ring(k, at(l0 + 0.4), n, r, 16);
    const p1 = ring(k, at(l1 - 0.4), n, r, 16);
    k.pen.beginPath();
    for (const ix of [3, 5, 12]) {
      k.pen.moveTo(...p0[ix]);
      k.pen.lineTo(...p1[ix]);
    }
    k.pen.strokeStyle = shade(bark, -0.35);
    k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    k.pen.stroke();
  }
  fillPts(k, b, '#d9b07a', k.thin);
  if (r * k.s >= 3) {
    const n: P3 = axis === 'u' ? [1, 0, 0] : [0, 1, 0];
    const end: P3 = axis === 'u' ? [l1 + 0.01, c, cz] : [c, l1 + 0.01, cz];
    fillPts(k, ring(k, end, n, r * 0.62, 14), '#c99a62', 0);
    fillPts(k, ring(k, end, n, r * 0.28, 10), '#b98a52', 0);
  }
}

// A cartoon stone sitting on z: a lumpy outline round (cu, cv), r across
// and h tall, lit from the upper left.
export function rock(k: Kit, cu: number, cv: number, z: number, r: number, h: number, color: Color, seed: number, line = k.lw): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const cx = e.cx;
  const base = e.cy;
  const N = 11;
  const pts: Pt[] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2;
    const j = 0.82 + hash(seed, i, 3) * 0.3;
    const sn = Math.sin(th);
    const y = sn > 0 ? base + e.ry * sn * j : base + (base - ty) * sn * j;
    pts.push([cx + Math.cos(th) * e.rx * j, y]);
  }
  const pen = k.pen;
  pen.beginPath();
  pts.forEach(([x, y], i) => {
    const n = pts[(i + 1) % N];
    const mx = (x + n[0]) / 2;
    const my = (y + n[1]) / 2;
    if (i === 0) pen.moveTo(mx, my);
    else pen.quadraticCurveTo(x, y, mx, my);
  });
  pen.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2);
  pen.closePath();
  const g = pen.createRadialGradient(cx - e.rx * 0.35, ty + (base - ty) * 0.35, 0, cx, base - (base - ty) * 0.3, Math.max(e.rx, base - ty) * 1.25);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.3));
  k.paint(g, line);
}

// A plank crate: a box with board seams, corner battens and a brace
// across the faces the viewer sees (the +v front and the +u end).
export function crate(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, wood: Color = C.plankLight): void {
  k.box(u0, v0, z0, du, dv, dz, wood, { stripe: false });
  const u1 = u0 + du;
  const v1 = v0 + dv;
  const z1 = z0 + dz;
  const pen = k.pen;
  pen.beginPath();
  for (let z = z0 + 0.8; z < z1 - 0.3; z += 0.8) {
    for (const [a, b] of [[[u0, v1, z], [u1, v1, z]], [[u1, v1, z], [u1, v0, z]]] as Array<[P3, P3]>) {
      const [x0, y0] = k.p(...a);
      const [x1, y1] = k.p(...b);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = shade(wood, -0.35);
  pen.lineWidth = Math.max(0.6, 0.07 * k.s);
  pen.stroke();
  const t = 0.32;
  const front = (a: number, z: number): P3 => [a, v1 + 0.01, z];
  const end = (a: number, z: number): P3 => [u1 + 0.01, a, z];
  const tone = (nu: number, nv: number) => k.side(shade(wood, -0.08), nu, nv, 0.2);
  if (dz > 1.2 && du > 1.2) {
    k.poly([front(u0, z0), front(u0 + t, z0), front(u0 + t, z1), front(u0, z1)], tone(0, 1), k.thin);
    k.poly([front(u1 - t, z0), front(u1, z0), front(u1, z1), front(u1 - t, z1)], tone(0, 1), k.thin);
    k.poly([front(u0 + t, z0), front(u0 + t + 0.35, z0), front(u1 - t, z1 - 0.35), front(u1 - t, z1), front(u1 - t - 0.35, z1), front(u0 + t, z0 + 0.35)], tone(0, 1), k.thin);
  }
  if (dz > 1.2 && dv > 1.2) {
    k.poly([end(v0, z0), end(v0 + t, z0), end(v0 + t, z1), end(v0, z1)], tone(1, 0), k.thin);
    k.poly([end(v1 - t, z0), end(v1, z0), end(v1, z1), end(v1 - t, z1)], tone(1, 0), k.thin);
  }
}

// A barrel standing on z: bellied staves, iron hoops, its top open (full
// of `fill`) or lidded.
export function barrel(k: Kit, cu: number, cv: number, z: number, r: number, h: number, wood: Color = C.plank, fill: Color | null = null): void {
  const e0 = k.ell(cu, cv, z, r * 0.88);
  const em = k.ell(cu, cv, z + h / 2, r * 1.06);
  const e1 = k.ell(cu, cv, z + h, r * 0.88);
  const pen = k.pen;
  const body = () => {
    pen.beginPath();
    pen.moveTo(e0.cx - e0.rx, e0.cy);
    pen.quadraticCurveTo(em.cx - em.rx * 1.06, em.cy, e1.cx - e1.rx, e1.cy);
    pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, Math.PI, Math.PI * 2);
    pen.quadraticCurveTo(em.cx + em.rx * 1.06, em.cy, e0.cx + e0.rx, e0.cy);
    pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
    pen.closePath();
  };
  body();
  const g = pen.createLinearGradient(em.cx - em.rx, 0, em.cx + em.rx, 0);
  g.addColorStop(0, shade(wood, 0.06));
  g.addColorStop(0.3, shade(wood, 0.16));
  g.addColorStop(0.65, wood);
  g.addColorStop(1, shade(wood, -0.28));
  pen.fillStyle = g;
  pen.fill();
  if (k.s * r >= 3) {
    pen.beginPath();
    for (const f of [-0.6, -0.2, 0.2, 0.6]) {
      pen.moveTo(e0.cx + e0.rx * f, e0.cy + e0.ry * Math.sqrt(1 - f * f));
      pen.quadraticCurveTo(em.cx + em.rx * f * 1.08, em.cy + em.ry * Math.sqrt(1 - f * f), e1.cx + e1.rx * f, e1.cy + e1.ry * Math.sqrt(1 - f * f));
    }
    pen.strokeStyle = shade(wood, -0.3);
    pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    pen.stroke();
  }
  for (const f of [0.14, 0.42, 0.86]) {
    const zz = z + h * f;
    const bulge = 1 + 0.18 * Math.sin(f * Math.PI);
    const eh = k.ell(cu, cv, zz, r * 0.88 * bulge);
    pen.beginPath();
    pen.ellipse(eh.cx, eh.cy, eh.rx, eh.ry, 0, 0, Math.PI);
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(1.2, 0.22 * k.s + k.thin);
    pen.stroke();
    pen.strokeStyle = C.steelDark;
    pen.lineWidth = Math.max(0.6, 0.16 * k.s);
    pen.stroke();
  }
  body();
  k.paint(null, k.lw);
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, 0, Math.PI * 2);
  k.paint(shade(wood, 0.1), k.thin);
  if (fill) {
    pen.beginPath();
    pen.ellipse(e1.cx, e1.cy + e1.ry * 0.08, e1.rx * 0.8, e1.ry * 0.75, 0, 0, Math.PI * 2);
    k.paint(fill, 0);
  }
}

// A lumpy cloth sack on z, r across and h tall, tied at the neck.
export function sack(k: Kit, cu: number, cv: number, z: number, r: number, h: number, seed: number, base: Color = '#cdb487'): void {
  k.shadow(cu, cv, r * 1.1, r * 1.1, 0.24, z);
  const e0 = k.ell(cu, cv, z + 0.2, r);
  const e1 = k.ell(cu, cv, z + h, r * 0.45);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx, e0.cy);
  pen.bezierCurveTo(e0.cx - e0.rx * 1.12, (e0.cy + e1.cy) / 2, e1.cx - e1.rx * 1.05, e1.cy + (e0.cy - e1.cy) * 0.2, e1.cx - e1.rx, e1.cy);
  pen.lineTo(e1.cx + e1.rx, e1.cy);
  pen.bezierCurveTo(e1.cx + e1.rx * 1.05, e1.cy + (e0.cy - e1.cy) * 0.2, e0.cx + e0.rx * 1.12, (e0.cy + e1.cy) / 2, e0.cx + e0.rx, e0.cy);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(e0.cx - e0.rx, 0, e0.cx + e0.rx, 0);
  g.addColorStop(0, shade(base, 0.12));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.25));
  k.paint(g, k.lw);
  // a painted band round its middle
  const band = hash(seed, 41) < 0.5 ? C.cloth : C.clothBlue;
  const y = e0.cy + (e1.cy - e0.cy) * 0.42;
  const half = e0.rx * 0.92;
  pen.beginPath();
  pen.moveTo(e0.cx - half, y);
  pen.quadraticCurveTo(e0.cx, y + e0.ry * 0.8, e0.cx + half, y);
  pen.strokeStyle = band;
  pen.lineWidth = Math.max(0.9, 0.2 * k.s);
  pen.stroke();
  const [nx, ny] = k.p(cu, cv, z + h + 0.35);
  pen.beginPath();
  pen.ellipse(nx, ny, e1.rx * 0.8, e1.rx * 0.5, 0, 0, Math.PI * 2);
  k.paint(shade(base, 0.1), k.thin);
  k.line([[cu - r * 0.4, cv, z + h - 0.05], [cu + r * 0.4, cv, z + h - 0.05]], '#7a5a35', Math.max(0.9, 0.14 * k.s));
}

// A spoked wheel in the plane square to n, centred on c: a rim, a hub and
// `spokes` spokes turned by `angle`.
export function wheel(k: Kit, c: P3, n: P3, r: number, spokes: number, angle: number, rim: Color, hub: Color = rim, rimW = 0.18): void {
  const [a, b] = basis(n);
  const steps = r * k.s < 12 ? 14 : 28;
  const outer = ring(k, c, n, r, steps);
  const inner = ring(k, c, n, r * (1 - rimW), steps);
  const pen = k.pen;
  pen.beginPath();
  outer.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  inner.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  pen.fillStyle = rim;
  pen.fill('evenodd');
  pen.strokeStyle = INK;
  pen.lineWidth = k.thin;
  pen.lineJoin = 'round';
  pen.stroke();
  pen.beginPath();
  for (let i = 0; i < spokes; i++) {
    const th = angle + (i / spokes) * Math.PI * 2;
    const [x0, y0] = k.p(...onCircle(c, a, b, r * 0.18, th));
    const [x1, y1] = k.p(...onCircle(c, a, b, r * (1 - rimW), th));
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(1, r * 0.16 * k.s + k.thin);
  pen.lineCap = 'round';
  pen.stroke();
  pen.strokeStyle = rim;
  pen.lineWidth = Math.max(0.6, r * 0.16 * k.s);
  pen.stroke();
  fillPts(k, ring(k, c, n, r * 0.24, steps < 28 ? 8 : 12), hub, k.thin);
}

// ── books and paper ─────────────────────────────────────────────────────────

const BINDINGS: readonly Color[] = ['#a8443a', '#3f6a9a', '#d9a440', '#5f8a4a', '#7a4a6a', '#efe0c2', '#6e4a2a', '#2f5f6a', '#c06a3a'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const tops: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.42 + hash(seed, i, 61) * 0.4;
    if (u + w > u1) break;
    if (hash(seed, i, 62) < 0.08 && u > u0 + 1) {
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

// ── plants ──────────────────────────────────────────────────────────────────

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

// A sprout of a few leaves from (u, v, z): seedlings in a tray, herbs in
// a pot. `h` its height in units.
export function sprout(k: Kit, u: number, v: number, z: number, h: number, seed: number, greens: readonly Color[] = [C.leaf, C.green]): void {
  const [x, y] = k.p(u, v, z);
  const n = 3 + Math.floor(hash(seed, 1) * 2);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.62 + (hash(seed, i, 2) - 0.5) * 0.3;
    leaf(k, x, y, a, h * k.s * (0.8 + hash(seed, i, 3) * 0.4), h * k.s * 0.3, greens[i % greens.length], false);
  }
}

// ── furniture ───────────────────────────────────────────────────────────────

// A plank stool: a round seat on three splayed legs.
export function stool(k: Kit, cu: number, cv: number, h = 3.4, top: Color = C.plankLight, r = 1.0): void {
  k.shadow(cu, cv, r * 1.2, r * 1.2, 0.22);
  for (const a of [0.9, 3.0, 5.1]) {
    k.rod([[cu + Math.cos(a) * r * 0.5, cv + Math.sin(a) * r * 0.5, h - 0.4], [cu + Math.cos(a) * r * 0.95, cv + Math.sin(a) * r * 0.95, 0]], C.plankDark, 0.18);
  }
  k.cyl(cu, cv, h - 0.45, r, 0.45, top);
}

// A ladder-back chair at (cu, cv), its sitter facing angle `face` (in the
// u-v plane), the back behind.
export function chair(k: Kit, cu: number, cv: number, face: number, wood: Color = C.plank): void {
  const du = Math.cos(face);
  const dv = Math.sin(face);
  const pu = -dv;
  const pv = du;
  const zs = 3.2;
  const r = 1.15;
  const P = (f: number, sd: number, z: number): P3 => [cu + du * f * r + pu * sd * r, cv + dv * f * r + pv * sd * r, z];
  k.shadow(cu, cv, r * 1.25, r * 1.25, 0.22);
  const behind = du + dv > 0; // the back is on the far side
  const back = () => {
    for (const sd of [-0.85, 0.85]) k.rod([P(-0.85, sd, 0), P(-0.95, sd, zs + 3.6)], wood, 0.2);
    for (const z of [zs + 1.3, zs + 2.3, zs + 3.3]) k.rod([P(-0.9, -0.85, z), P(-0.9, 0.85, z)], shade(wood, 0.08), 0.24);
  };
  if (behind) back();
  for (const sd of [-0.85, 0.85]) k.rod([P(0.85, sd, zs), P(0.85, sd, 0)], wood, 0.2);
  // the seat: a square of planks
  k.poly([P(-1, -1, zs), P(1, -1, zs), P(1, 1, zs), P(-1, 1, zs)], shade(wood, 0.12), k.lw);
  if (!behind) back();
}

// ── outside ─────────────────────────────────────────────────────────────────

// The view out at dusk on the plane v = n, from a0 to a1 along and z0 to
// z1 up (the caller clips it to the opening): a big sky going from blue to
// apricot at the horizon, a low sun on some, a cloud or two lit from
// below, far hills and near green ones with a tree or a fence on them.
export function dusk(k: Kit, a0: number, a1: number, z0: number, z1: number, n: number, seed: number): void {
  const { pen, s } = k;
  const hz = z1 - z0;
  const horizon = z0 + hz * 0.36;
  k.poly([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]], k.vgrad(a0, n, z0, z1, [[0, C.skyLow], [0.3, C.skyLow], [0.5, '#e8b4a0'], [0.72, '#9a9ccc'], [1, C.skyTop]]), 0);
  // the sun going down, and its glow
  if (hash(seed, 81) < 0.55) {
    const su = a0 + (a1 - a0) * (0.25 + hash(seed, 82) * 0.5);
    const sz = horizon + 1.2;
    k.halo(su, n, sz, Math.min(6, hz * 0.4), '#ffe0a0', 0.55);
    k.face(su, n, sz, 1.1, '#fff2c0', 0, 16);
  } else k.halo(a0 + (a1 - a0) * 0.5, n, horizon, Math.min(7, hz * 0.4), '#ffd0a0', 0.35);
  // clouds: soft lumps, pink underneath
  const nc = 1 + Math.floor(hash(seed, 83) * 2);
  for (let i = 0; i < nc; i++) {
    const cu = a0 + (a1 - a0) * (0.2 + hash(seed, i, 84) * 0.6);
    const cz = horizon + hz * (0.32 + hash(seed, i, 85) * 0.22);
    const cw = 1.6 + hash(seed, i, 86) * 1.2;
    pen.beginPath();
    for (const [du, dz, r] of [[-cw, 0, 0.75], [-cw * 0.35, 0.45, 1.0], [cw * 0.35, 0.3, 0.9], [cw, 0, 0.65]] as const) {
      const [x, y] = k.p(cu + du, n, cz + dz);
      pen.moveTo(x + r * s, y);
      pen.ellipse(x, y, r * s * 1.2, r * s * 0.8, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = C.cloud;
    pen.fill();
    k.line([[cu - cw * 1.1, n, cz - 0.45], [cu + cw * 1.05, n, cz - 0.45]], '#f2b4a4', Math.max(0.9, 0.35 * s));
  }
  // far hills, then the near green ones
  const ridge = (base: number, amp: number, f: number, sd: number): P3[] => {
    const pts: P3[] = [[a1, n, z0 - 1], [a0, n, z0 - 1]];
    for (let a = a0; a <= a1 + 0.01; a += 0.5) pts.push([a, n, base + amp * wave(a * f + sd * 3.1, sd)]);
    return pts;
  };
  k.poly(ridge(horizon + 1.0, hz * 0.07, 0.3, seed + 1), '#8aa6a0', 0);
  k.poly(ridge(horizon - 0.6, hz * 0.08, 0.42, seed + 2), C.hillFar, 0);
  const near = ridge(z0 + hz * 0.2, hz * 0.07, 0.55, seed + 3);
  k.poly(near, k.vgrad(a0, n, z0, z0 + hz * 0.3, [[0, '#3e7030'], [1, C.hill]]), 0);
  k.line(near.slice(2), '#7ab85a', Math.max(0.8, 0.14 * s));
  // a tree on the far hill, or a fence on the near one
  if (hash(seed, 87) < 0.6) {
    const tu = a0 + (a1 - a0) * (0.2 + hash(seed, 88) * 0.6);
    const tz = horizon - 0.6 + hz * 0.08 * wave(tu * 0.42 + (seed + 2) * 3.1, seed + 2);
    k.line([[tu, n, tz - 0.2], [tu, n, tz + 1.1]], '#3a3020', Math.max(0.8, 0.18 * s));
    const [x, y] = k.p(tu, n, tz + 1.6);
    pen.beginPath();
    pen.ellipse(x, y, 0.75 * s, 0.85 * s, 0, 0, Math.PI * 2);
    pen.fillStyle = '#4f7a3a';
    pen.fill();
  }
  if (k.fine && hash(seed, 89) < 0.6) {
    const fz = (a: number) => z0 + hz * 0.2 + hz * 0.07 * wave(a * 0.55 + (seed + 3) * 3.1, seed + 3) - 0.9;
    const posts: Array<[P3, P3]> = [];
    for (let a = a0 + 0.8; a < a1; a += 1.4) posts.push([[a, n, fz(a)], [a, n, fz(a) + 0.9]]);
    k.segs(posts, '#5a4028', 0.12 * s);
    const rail: P3[] = [];
    for (let a = a0; a <= a1; a += 0.7) rail.push([a, n, fz(a) + 0.65]);
    k.line(rail, '#5a4028', 0.1 * s);
  }
}
