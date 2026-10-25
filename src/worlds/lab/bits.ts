import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Profile, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the lab is full of, drawn in any frame: glassware, bubbles,
// hazard stripes, gauges, electric arcs, stools, crates and foliage.

// ── glassware ──────────────────────────────────────────────────────────────

// An Erlenmeyer flask `h` tall standing on z.
export function erlenmeyer(k: Kit, u: number, v: number, z: number, h: number, liquid: Color | null, fill = 0.45): void {
  const r = h * 0.42;
  const neck = h * 0.13;
  const prof: Profile = [[z, r * 0.92], [z + h * 0.04, r], [z + h * 0.58, neck * 1.05], [z + h * 0.92, neck], [z + h, neck * 1.25]];
  k.glass(u, v, prof, liquid, fill);
}

// A beaker: straight sides, a lip.
export function beaker(k: Kit, u: number, v: number, z: number, r: number, h: number, liquid: Color | null, fill = 0.55): void {
  k.glass(u, v, [[z, r * 0.96], [z + 0.06, r], [z + h * 0.92, r], [z + h, r * 1.07]], liquid, fill);
}

// A test tube standing in a rack hole: a narrow rounded vial.
export function tube(k: Kit, u: number, v: number, z: number, h: number, liquid: Color | null, fill = 0.5): void {
  const r = 0.24;
  k.glass(u, v, [[z, 0.02], [z + 0.12, r * 0.8], [z + 0.3, r], [z + h, r], [z + h + 0.05, r * 1.2]], liquid, fill, Math.max(0.8, k.thin * 0.8));
}

// A tall specimen jar with a lid: fluid, and what floats in it drawn by `thing`.
export function jar(k: Kit, u: number, v: number, z: number, r: number, h: number, fluid: Color, lid: Color, thing?: (x: number, y: number, size: number) => void): void {
  k.glass(u, v, [[z, r * 0.94], [z + 0.08, r], [z + h - 0.15, r], [z + h, r * 0.9]], fluid, 0.86);
  if (thing) {
    const [x, y] = k.p(u, v, z + h * 0.45);
    thing(x, y, r * k.s);
  }
  k.cyl(u, v, z + h, r * 0.95, Math.max(0.25, h * 0.08), lid, { line: k.thin });
}

// A round-bottomed flask: a glass bulb of radius R on z with a neck `nh`
// tall, `fill` of the bulb in liquid. Draws the bulb as the sphere's true
// outline (an ellipse √2 R wide, √1.5 R tall).
export function bulb(k: Kit, u: number, v: number, z: number, R: number, nh: number, liquid: Color | null, fill = 0.5): void {
  const pen = k.pen;
  const [cx, cy] = k.p(u, v, z + R);
  const rx = Math.SQRT2 * R * k.s;
  const ry = Math.sqrt(1.5) * R * k.s;
  // the neck behind the bulb's top
  const nr = R * 0.28;
  k.glass(u, v, [[z + R * 1.6, nr], [z + R * 2 + nh, nr], [z + R * 2 + nh + 0.08, nr * 1.3]], null, 0, k.thin);
  pen.beginPath();
  pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  pen.fillStyle = withAlpha(C.glass, 0.42);
  pen.fill();
  if (liquid && fill > 0) {
    pen.save();
    pen.beginPath();
    pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    pen.clip();
    const yl = cy + ry - fill * 2 * ry;
    const g = pen.createLinearGradient(cx - rx, 0, cx + rx, 0);
    g.addColorStop(0, shade(liquid, 0.22));
    g.addColorStop(0.55, liquid);
    g.addColorStop(1, shade(liquid, -0.22));
    pen.fillStyle = g;
    pen.fillRect(cx - rx - 1, yl, rx * 2 + 2, cy + ry - yl + 1);
    // the surface, an ellipse as wide as the bulb there
    const w = rx * Math.sqrt(Math.max(0, 1 - ((yl - cy) / ry) ** 2));
    pen.beginPath();
    pen.ellipse(cx, yl, w, w * 0.5, 0, 0, Math.PI * 2);
    pen.fillStyle = shade(liquid, 0.3);
    pen.fill();
    pen.restore();
  }
  pen.beginPath();
  pen.ellipse(cx - rx * 0.38, cy - ry * 0.38, rx * 0.22, ry * 0.14, -0.6, 0, Math.PI * 2);
  pen.fillStyle = '#ffffffb8';
  pen.fill();
  pen.beginPath();
  pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  k.paint(null, k.thin);
}

// Bubbles rising through a column of liquid from z0 to z1 round (u, v):
// n of them, r px across at most, moving with the clock t (rate a second).
export function bubbles(k: Kit, u: number, v: number, z0: number, z1: number, spread: number, t: number, n: number, seed: number, color = '#ffffffd0', rate = 0.9): void {
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < n; i++) {
    const ph = (t * rate * (0.7 + hash(seed, i, 1) * 0.6) + hash(seed, i, 2)) % 1;
    const z = z0 + (z1 - z0) * ph;
    const du = (hash(seed, i, 3) - 0.5) * spread + Math.sin(ph * 9 + i) * spread * 0.12;
    const dv = (hash(seed, i, 4) - 0.5) * spread * 0.6;
    const [x, y] = k.p(u + du, v + dv, z);
    const r = Math.max(0.9, (0.07 + 0.08 * ph) * k.s);
    pen.moveTo(x + r, y);
    pen.arc(x, y, r, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();
}

// ── hazard stripes ─────────────────────────────────────────────────────────
// Yellow and black diagonal stripes over a polygon of frame points, `w`
// units a stripe, inked round when line > 0.
export function hazard(k: Kit, pts: ReadonlyArray<P3>, w = 0.8, line = k.thin): void {
  const pen = k.pen;
  pen.save();
  pen.beginPath();
  k.trace(pts);
  pen.fillStyle = C.hazard;
  pen.fill();
  pen.clip();
  const scr = pts.map(([u, v, z]) => k.p(u, v, z));
  const xs = scr.map((p) => p[0]);
  const ys = scr.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const step = Math.max(3, w * k.s * 2);
  const hgt = y1 - y0;
  pen.beginPath();
  for (let x = x0 - hgt - step; x < x1 + step; x += step) {
    pen.moveTo(x, y1);
    pen.lineTo(x + step / 2, y1);
    pen.lineTo(x + step / 2 + hgt, y0);
    pen.lineTo(x + hgt, y0);
    pen.closePath();
  }
  pen.fillStyle = C.hazardInk;
  pen.fill();
  pen.restore();
  if (line > 0) {
    pen.beginPath();
    k.trace(pts);
    k.paint(null, line);
  }
}

// ── gauges and lights ──────────────────────────────────────────────────────

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

export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

// A round gauge on the plane v = n (facing +v), centred (u, z), radius r:
// a chrome bezel, a cream face with ticks and a red needle at angle `a`
// (radians from straight up, clockwise as seen).
export function gauge(k: Kit, u: number, n: number, z: number, r: number, a: number | null, face: Color = '#f6f1e2'): void {
  fillPts(k, ring(k, [u, n, z], [0, 1, 0], r, 24), C.chrome, k.thin);
  fillPts(k, ring(k, [u, n + 0.02, z], [0, 1, 0], r * 0.78, 24), face, 0);
  if (k.s * r >= 4) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i <= 8; i++) {
      const th = -2.2 + (4.4 * i) / 8;
      const [x0, y0] = k.p(u + Math.sin(th) * r * 0.62, n + 0.03, z + Math.cos(th) * r * 0.62);
      const [x1, y1] = k.p(u + Math.sin(th) * r * 0.74, n + 0.03, z + Math.cos(th) * r * 0.74);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    pen.stroke();
    // a red arc toward the top of the scale
    const arcPts: P3[] = [];
    for (let i = 0; i <= 6; i++) {
      const th = 1.3 + (0.9 * i) / 6;
      arcPts.push([u + Math.sin(th) * r * 0.68, n + 0.03, z + Math.cos(th) * r * 0.68]);
    }
    k.line(arcPts, C.red, Math.max(0.7, 0.08 * k.s));
  }
  if (a !== null) needle(k, u, n, z, r, a);
}

// Just a gauge's needle (the moving part).
export function needle(k: Kit, u: number, n: number, z: number, r: number, a: number): void {
  k.line([[u, n + 0.05, z], [u + Math.sin(a) * r * 0.66, n + 0.05, z + Math.cos(a) * r * 0.66]], C.red, Math.max(0.8, 0.09 * k.s));
  k.dot(u, n + 0.06, z, Math.max(0.8, 0.1 * k.s), INK);
}

// A small round indicator light on a face, lit or dark.
export function pilot(k: Kit, u: number, n: number, z: number, r: number, color: Color, on: boolean): void {
  k.dot(u, n, z, Math.max(1, r * k.s), on ? color : shade(color, -0.55), k.thin * 0.7);
  if (on) {
    k.dot(u - r * 0.25, n, z + r * 0.3, Math.max(0.5, r * 0.35 * k.s), '#ffffffc0');
    k.halo(u, n + 0.1, z, r * 4, color, 0.45);
  }
}

// ── electricity ────────────────────────────────────────────────────────────

// A jagged path from a to b, wandering most mid-way: `jag` units at most.
export function zigzag(a: P3, b: P3, n: number, jag: number, seed: number): P3[] {
  const out: P3[] = [a];
  let ou = 0;
  let ov = 0;
  let oz = 0;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t);
    ou = ou * 0.5 + (hash(seed, i, 1) - 0.5) * jag * 2;
    ov = ov * 0.5 + (hash(seed, i, 2) - 0.5) * jag;
    oz = oz * 0.5 + (hash(seed, i, 3) - 0.5) * jag * 2;
    out.push([a[0] + (b[0] - a[0]) * t + ou * env, a[1] + (b[1] - a[1]) * t + ov * env, a[2] + (b[2] - a[2]) * t + oz * env]);
  }
  out.push(b);
  return out;
}

// An electric arc along `pts`: a violet glow, a pale blue body, a white core.
export function bolt(k: Kit, pts: ReadonlyArray<P3>, w = 1, glow = true): void {
  if (glow) k.line(pts, withAlpha(C.violet, 0.35), Math.max(3, 0.7 * w * k.s));
  k.line(pts, C.arc, Math.max(1.4, 0.25 * w * k.s));
  k.line(pts, '#ffffff', Math.max(0.8, 0.1 * w * k.s));
}

// ── furniture bits ──────────────────────────────────────────────────────────

// A lab stool: a round black seat on a chrome column, a foot ring and a
// five-armed base on castors.
export function stool(k: Kit, cu: number, cv: number, h = 4.6, seat: Color = '#2f3a40'): void {
  k.shadow(cu, cv, 1.35, 1.35, 0.24);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.3;
    const eu = cu + Math.cos(a) * 1.1;
    const ev = cv + Math.sin(a) * 1.1;
    k.rod([[cu, cv, 0.45], [eu, ev, 0.3]], C.steelDark, 0.16);
    k.dot(eu, ev, 0.15, Math.max(1, 0.16 * k.s), INK);
  }
  k.rod([[cu, cv, 0.4], [cu, cv, h - 0.4]], C.chrome, 0.24);
  const e = k.ell(cu, cv, h * 0.45, 0.8);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1.4, 0.16 * k.s + k.lw * 1.2);
  k.pen.stroke();
  k.pen.strokeStyle = C.chrome;
  k.pen.lineWidth = Math.max(0.8, 0.16 * k.s);
  k.pen.stroke();
  k.cyl(cu, cv, h - 0.5, 1.05, 0.5, seat);
}

// A slatted wooden crate, `w` x `d` x `h`, a hazard sign stencilled on its
// front (a black diamond on yellow).
export function crate(k: Kit, u0: number, v0: number, z0: number, w: number, d: number, h: number, wood: Color = C.wood, mark = true): void {
  k.box(u0, v0, z0, w, d, h, wood, { stripe: false });
  const pen = k.pen;
  // the slats: across the +v front and the +u end
  pen.beginPath();
  for (const f of [0.34, 0.67]) {
    const [a, b] = [k.p(u0, v0 + d, z0 + h * f), k.p(u0 + w, v0 + d, z0 + h * f)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
    const [c, e] = [k.p(u0 + w, v0, z0 + h * f), k.p(u0 + w, v0 + d, z0 + h * f)];
    pen.moveTo(c[0], c[1]);
    pen.lineTo(e[0], e[1]);
  }
  pen.strokeStyle = shade(wood, -0.38);
  pen.lineWidth = k.thin;
  pen.stroke();
  if (mark && w >= 1.6 && h >= 1.6) {
    const cu = u0 + w / 2;
    const cz = z0 + h / 2;
    const r = Math.min(w, h) * 0.24;
    k.poly([[cu - r, v0 + d + 0.02, cz], [cu, v0 + d + 0.02, cz + r], [cu + r, v0 + d + 0.02, cz], [cu, v0 + d + 0.02, cz - r]], C.hazard, k.thin * 0.8);
    k.dot(cu, v0 + d + 0.03, cz, Math.max(0.8, r * 0.3 * k.s), INK);
  }
}

// A steel gas cylinder on z: a tall rounded body, a collar and a valve.
export function cylinder(k: Kit, u: number, v: number, z: number, r: number, h: number, body: Color, collar: Color = C.chrome): void {
  k.shadow(u, v, r * 1.3, r * 1.3, 0.25, z);
  // a straight body, then a domed shoulder up to the neck
  const prof: Array<[number, number]> = [[z, r * 0.94], [z + 0.15, r]];
  const zs = z + h - r * 0.9;
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * 1.2;
    prof.push([zs + Math.sin(a) * r * 0.9, r * Math.cos(a)]);
  }
  prof.push([z + h, r * 0.34]);
  k.lathe(u, v, prof, body, k.lw, false);
  k.cyl(u, v, z + h - 0.05, r * 0.36, 0.5, collar, { line: k.thin });
  k.cyl(u, v, z + h + 0.45, r * 0.22, 0.45, C.brass, { line: k.thin });
  k.rod([[u, v, z + h + 0.75], [u + r * 0.55, v, z + h + 0.75]], C.brass, 0.14);
  // a pale band round the shoulder
  const e = k.ell(u, v, z + h - r * 1.6, r);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
  k.pen.strokeStyle = withAlpha('#ffffff', 0.55);
  k.pen.lineWidth = Math.max(1, 0.22 * k.s);
  k.pen.stroke();
}

// ── foliage ───────────────────────────────────────────────────────────────

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

// A pot with a rim, standing on z.
export function pot(k: Kit, u: number, v: number, z: number, r: number, h: number, color: Color = C.terracotta): void {
  k.cyl(u, v, z, r * 0.82, h * 0.8, color);
  k.cyl(u, v, z + h * 0.78, r, h * 0.22, shade(color, 0.08));
  k.disc(u, v, z + h - 0.02, r * 0.82, '#3a2a20', 0);
}

// A mutant plant: fat lobed leaves and glowing seed pods on stalks.
export function mutant(k: Kit, u: number, v: number, z: number, size: number, seed: number, pod: Color = C.greenGlow): void {
  const [bx, by] = k.p(u, v, z);
  const S = k.s * size;
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42 + (hash(seed, i, 1) - 0.5) * 0.25;
    leaf(k, bx, by, a, (2.4 + hash(seed, i, 2) * 1.6) * S, 0.85 * S, i % 3 === 0 ? '#3f7a52' : i % 3 === 1 ? '#5aa35e' : '#79bf62');
  }
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 2 + (i - 1) * 0.55;
    const L = (3.6 + hash(seed, i, 3) * 1.2) * S;
    const ex = bx + Math.cos(a) * L;
    const ey = by + Math.sin(a) * L;
    k.pen.beginPath();
    k.pen.moveTo(bx, by);
    k.pen.quadraticCurveTo(bx + Math.cos(a) * L * 0.3, by - L * 0.6, ex, ey);
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = Math.max(1.6, 0.18 * S + k.lw);
    k.pen.stroke();
    k.pen.strokeStyle = '#4f8a46';
    k.pen.lineWidth = Math.max(0.8, 0.18 * S);
    k.pen.stroke();
    k.pen.beginPath();
    k.pen.ellipse(ex, ey, 0.42 * S, 0.5 * S, 0, 0, Math.PI * 2);
    k.paint(pod, k.thin);
    k.pen.beginPath();
    k.pen.ellipse(ex - 0.12 * S, ey - 0.15 * S, 0.12 * S, 0.16 * S, 0, 0, Math.PI * 2);
    k.pen.fillStyle = '#ffffffc0';
    k.pen.fill();
    const [hx, hy] = [ex, ey];
    k.pen.save();
    k.pen.globalCompositeOperation = 'screen';
    const g = k.pen.createRadialGradient(hx, hy, 0, hx, hy, 1.6 * S);
    g.addColorStop(0, withAlpha(pod, 0.45));
    g.addColorStop(1, withAlpha(pod, 0));
    k.pen.fillStyle = g;
    k.pen.beginPath();
    k.pen.arc(hx, hy, 1.6 * S, 0, Math.PI * 2);
    k.pen.fill();
    k.pen.restore();
  }
}

// Chalk-like squiggles that read as writing along the plane v = n from
// (u0, z) to u1: little words of wavy strokes with gaps.
export function scrawl(k: Kit, u0: number, u1: number, n: number, z: number, h: number, seed: number, color: Color, w: number): void {
  const pen = k.pen;
  pen.beginPath();
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const len = Math.min(u1 - u, 0.5 + hash(seed, i, 1) * 1.4);
    const steps = Math.max(3, Math.round(len * 5));
    for (let j = 0; j <= steps; j++) {
      const f = j / steps;
      const uu = u + len * f;
      const zz = z + Math.sin(f * steps * 1.9 + i) * h * 0.5 + (hash(seed, i, j) - 0.5) * h * 0.35;
      const [x, y] = k.p(uu, n, zz);
      if (j) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    }
    u += len + 0.25 + hash(seed, i, 2) * 0.3;
    i++;
  }
  pen.strokeStyle = color;
  pen.lineWidth = w;
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  pen.stroke();
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
