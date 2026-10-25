import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things Snowy Depths is full of, drawn in any frame: icicles, ice
// crystals, snow lumps and snowballs, rocks, logs, flames, lanterns, a
// kettle, mugs, crates, barrels, sacks, furs and little firs.

// ── geometry ────────────────────────────────────────────────────────────────

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

// Frame points round a circle of radius r centred on c, square to n.
export function ring3(c: P3, n: P3, r: number, steps = 20): P3[] {
  const l = Math.hypot(...n) || 1;
  const N: P3 = [n[0] / l, n[1] / l, n[2] / l];
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const A = cr(N, ref);
  const la = Math.hypot(...A);
  const a: P3 = [A[0] / la, A[1] / la, A[2] / la];
  const b = cr(N, a);
  const out: P3[] = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const cs = Math.cos(th) * r;
    const sn = Math.sin(th) * r;
    out.push([c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn]);
  }
  return out;
}

// Fills (and inks) a closed screen polygon.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// A convex solid's faces (frame points), drawn as the camera sees them:
// the faces turned toward it, each tinted by where it faces (tops, the lit
// side, the side in shade), inner edges in `edge`, the silhouette in ink.
// The camera looks down (-1, -1, -1) in any prop or wall frame.
export function facets(k: Kit, faces: ReadonlyArray<ReadonlyArray<P3>>, mid: P3, tone: { top: Color; lit: Color; dark: Color }, edge: Color, line = k.lw): void {
  const all: Pt[] = [];
  const pen = k.pen;
  const seen: P3[][] = [];
  for (const f of faces) {
    let n = cross(sub(f[1], f[0]), sub(f[2], f[0]));
    const c = f.reduce<P3>((m, q) => [m[0] + q[0] / f.length, m[1] + q[1] / f.length, m[2] + q[2] / f.length], [0, 0, 0]);
    const o = sub(c, mid);
    if (n[0] * o[0] + n[1] * o[1] + n[2] * o[2] < 0) n = [-n[0], -n[1], -n[2]];
    for (const q of f) all.push(k.p(...q));
    if (n[0] + n[1] + n[2] <= 1e-9) continue;
    const l = Math.hypot(...n) || 1;
    const col = n[2] / l > 0.55 ? tone.top : k.lit(n[0], n[1]) ? tone.lit : tone.dark;
    k.poly(f, col, 0);
    seen.push([...f]);
  }
  if (line > 0) {
    pen.beginPath();
    for (const f of seen) k.trace(f);
    pen.strokeStyle = edge;
    pen.lineWidth = Math.max(0.7, line * 0.5);
    pen.lineJoin = 'round';
    pen.stroke();
    fillPts(k, hull(all), null, line);
  }
}

// ── ice and snow ──────────────────────────────────────────────────────────

// A fringe of icicles hanging from z along u (a0 to a1) on the plane v = n:
// about one every `step` units, up to `len` long, all in one path.
export function icicles(k: Kit, a0: number, a1: number, n: number, z: number, len: number, seed: number, step = 0.9, fill: Color = C.iceHi): void {
  const pen = k.pen;
  pen.beginPath();
  let i = 0;
  for (let a = a0 + hash(seed, 1) * step * 0.5; a < a1 - 0.3; a += step * (0.6 + hash(seed, i, 2) * 0.8), i++) {
    const w = 0.22 + hash(seed, i, 3) * 0.25;
    const r = hash(seed, i, 4);
    const l = len * (r < 0.25 ? 0.2 + r : 0.35 + hash(seed, i, 5) * 0.65);
    const lean = (hash(seed, i, 6) - 0.5) * 0.15;
    if (!k.seen([[a, n, z], [a, n, z - l]], w * k.s)) continue;
    k.trace([[a - w, n, z + 0.1], [a + w, n, z + 0.1], [a + w * 0.35 + lean, n, z - l * 0.6], [a + lean * 2, n, z - l], [a - w * 0.35 + lean, n, z - l * 0.6]]);
  }
  pen.fillStyle = fill;
  pen.fill();
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.75);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A hexagonal ice crystal standing at (u, v, z): r across, its shaft h
// long, leaning by (lu, lv) a unit up, ending in a point.
export function crystal(k: Kit, u: number, v: number, z: number, r: number, h: number, lu = 0, lv = 0, rot = 0, tone = ICE_TONE): void {
  const base: P3[] = [];
  const top: P3[] = [];
  const L = Math.hypot(lu, lv, 1);
  const [du, dv, dz] = [lu / L, lv / L, 1 / L];
  for (let i = 0; i < 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    const cu = Math.cos(a) * r;
    const cv = Math.sin(a) * r;
    base.push([u + cu, v + cv, z]);
    top.push([u + cu * 0.92 + du * h, v + cv * 0.92 + dv * h, z + dz * h]);
  }
  const tip: P3 = [u + du * (h + r * 1.6), v + dv * (h + r * 1.6), z + dz * (h + r * 1.6)];
  const faces: P3[][] = [];
  for (let i = 0; i < 6; i++) {
    const j = (i + 1) % 6;
    faces.push([base[i], base[j], top[j], top[i]], [top[i], top[j], tip]);
  }
  const mid: P3 = [u + du * h * 0.5, v + dv * h * 0.5, z + dz * h * 0.5];
  facets(k, faces, mid, tone, withAlpha(C.frost, 0.85));
}

export const ICE_TONE = { top: C.frost, lit: '#b6e4f7', dark: '#5e9fd5' };

// A dome of snow (or anything soft) on z, r across and h tall; lit from the
// upper left.
export function lump(k: Kit, cu: number, cv: number, z: number, r: number, h: number, base: Color = C.snow, line = k.lw): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx, ty + (e.cy - ty) * 0.3, e.cx - e.rx * 0.55, ty, e.cx, ty);
  pen.bezierCurveTo(e.cx + e.rx * 0.55, ty, e.cx + e.rx, ty + (e.cy - ty) * 0.3, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, ty + (e.cy - ty) * 0.35, 0, e.cx, e.cy, e.rx * 1.25);
  g.addColorStop(0, shade(base, 0.35));
  g.addColorStop(0.45, base);
  g.addColorStop(1, shade(base, -0.28));
  k.paint(g, line);
}

// A ball (a snowman's, a snowball) of radius r resting with its middle at
// (u, v, z).
export function ball(k: Kit, u: number, v: number, z: number, r: number, base: Color = C.snow, line = k.lw): void {
  const [x, y] = k.p(u, v, z);
  const R = r * k.s * 1.04;
  const pen = k.pen;
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - R * 0.4, y - R * 0.45, R * 0.05, x, y, R * 1.05);
  g.addColorStop(0, shade(base, 0.4));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.3));
  k.paint(g, line);
}

// A rock: a lumpy grey dome, snow on its crown when `snowy`.
export function rock(k: Kit, u: number, v: number, z: number, r: number, h: number, seed: number, snowy = true, base: Color = C.rock): void {
  const pts: Pt[] = [];
  const e = k.ell(u, v, z, r);
  const [, ty] = k.p(u, v, z + h);
  const n = 9;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const j = 0.85 + hash(seed, i, 7) * 0.3;
    const x = e.cx + Math.cos(a) * e.rx * j;
    const y = e.cy + Math.sin(a) * (e.cy - ty) * (i === 0 || i === n ? 0 : j);
    pts.push([x, y]);
  }
  for (let i = 1; i < 8; i++) {
    const a = (i / 8) * Math.PI;
    pts.push([e.cx + Math.cos(a) * e.rx, e.cy + Math.sin(a) * e.ry]);
  }
  const pen = k.pen;
  const g = pen.createLinearGradient(e.cx - e.rx, ty, e.cx + e.rx * 0.6, e.cy + e.ry);
  g.addColorStop(0, shade(base, 0.22));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.3));
  fillPts(k, pts, g, k.lw);
  if (!snowy) return;
  // a cap of snow on the crown
  const cap: Pt[] = [];
  const top = pts.slice(2, n - 1);
  for (const [x, y] of top) cap.push([x, y - 0.15 * k.s]);
  for (let i = top.length - 1; i >= 0; i--) {
    const [x, y] = top[i];
    const d = (i % 2 ? 0.45 : 0.25) * (e.cy - ty);
    cap.push([x + (e.cx - x) * 0.08, y + d]);
  }
  fillPts(k, cap, C.snow, k.thin);
}

// ── wood ──────────────────────────────────────────────────────────────────

// A log lying from a to b (frame points), radius r: bark round it, its
// end facing the viewer cut to show rings.
export function log(k: Kit, a: P3, b: P3, r: number, bark: Color = C.bark, cut: Color = '#e0b47c'): void {
  const n = sub(b, a);
  const ra = ring3(a, n, r, 16);
  const rb = ring3(b, n, r, 16);
  const sil = hull([...ra, ...rb].map((q) => k.p(...q)));
  const pen = k.pen;
  const top = k.p(a[0], a[1], a[2] + r);
  const bot = k.p(a[0], a[1], a[2] - r);
  const g = pen.createLinearGradient(top[0], top[1], bot[0], bot[1]);
  g.addColorStop(0, shade(bark, 0.2));
  g.addColorStop(0.45, bark);
  g.addColorStop(1, shade(bark, -0.3));
  fillPts(k, sil, g, 0);
  if (k.fine) {
    // bark grain along it
    pen.beginPath();
    for (const f of [-0.45, 0.1, 0.55]) {
      const p0 = k.p(a[0], a[1], a[2] + r * f);
      const p1 = k.p(b[0], b[1], b[2] + r * f);
      pen.moveTo(p0[0], p0[1]);
      pen.lineTo(p1[0], p1[1]);
    }
    pen.strokeStyle = withAlpha(shade(bark, -0.4), 0.6);
    pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    pen.stroke();
  }
  // the end toward the camera
  const toward = n[0] + n[1] + n[2] > 0 ? rb : ra;
  const end = toward.map((q) => k.p(...q));
  fillPts(k, end, cut, k.thin);
  const c = toward === rb ? b : a;
  const inner = ring3(c, n, r * 0.5, 12).map((q) => k.p(...q));
  pen.beginPath();
  inner.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  pen.strokeStyle = withAlpha(shade(cut, -0.35), 0.8);
  pen.lineWidth = Math.max(0.6, 0.06 * k.s);
  pen.stroke();
  fillPts(k, sil, null, k.lw);
}

// A plank crate with corner battens.
export function crate(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, wood: Color = C.woodLight, seed = 0): void {
  k.box(u0, v0, z0, du, dv, dz, wood, { stripe: false });
  const dark = shade(wood, -0.38);
  const lw = Math.max(0.7, 0.07 * k.s);
  const pen = k.pen;
  pen.beginPath();
  // planks on the two faces the viewer sees
  const rows = Math.max(2, Math.round(dz / 0.9));
  for (let i = 1; i < rows; i++) {
    const z = z0 + (dz * i) / rows;
    k.run([[u0, v0 + dv, z], [u0 + du, v0 + dv, z], [u0 + du, v0, z]]);
  }
  pen.strokeStyle = dark;
  pen.lineWidth = lw;
  pen.stroke();
  // battens at the corners
  const b = Math.min(0.35, du * 0.15, dv * 0.15);
  k.poly([[u0, v0 + dv, z0], [u0 + b, v0 + dv, z0], [u0 + b, v0 + dv, z0 + dz], [u0, v0 + dv, z0 + dz]], shade(wood, -0.12), 0);
  k.poly([[u0 + du - b, v0 + dv, z0], [u0 + du, v0 + dv, z0], [u0 + du, v0 + dv, z0 + dz], [u0 + du - b, v0 + dv, z0 + dz]], shade(wood, -0.12), 0);
  k.poly([[u0 + du, v0, z0], [u0 + du, v0 + b, z0], [u0 + du, v0 + b, z0 + dz], [u0 + du, v0, z0 + dz]], shade(wood, -0.3), 0);
  if (hash(seed, 9) < 0.5 && k.fine) {
    // a stencilled mark: a snowflake asterisk
    const [x, y] = k.p(u0 + du / 2, v0 + dv, z0 + dz / 2);
    const r = Math.min(du, dz) * 0.22 * k.s;
    pen.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI;
      pen.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r);
      pen.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    pen.strokeStyle = withAlpha(C.woodDeep, 0.7);
    pen.lineWidth = Math.max(0.8, 0.1 * k.s);
    pen.stroke();
  }
}

// A barrel: a cylinder with iron hoops.
export function barrel(k: Kit, u: number, v: number, z: number, r: number, h: number, wood: Color = C.wood): void {
  k.cyl(u, v, z, r, h, wood);
  for (const f of [0.18, 0.82]) {
    const e = k.ell(u, v, z + h * f, r * 1.01);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
    k.pen.strokeStyle = C.iron;
    k.pen.lineWidth = Math.max(1, 0.18 * k.s);
    k.pen.stroke();
  }
}

// ── fire and light ───────────────────────────────────────────────────────────

// Flames as nested tongues in the plane v = n, `phase` sets their sway and
// `scale` their size.
export function flames(k: Kit, a: number, n: number, z: number, scale: number, phase = 0): void {
  const tongue = (du: number, w: number, h: number, sway: number, c: Color) => {
    k.poly([[a + du - w, n, z], [a + du - w * 0.8, n, z + h * 0.45], [a + du + sway, n, z + h], [a + du + w * 0.8, n, z + h * 0.45], [a + du + w, n, z]], c, 0, 0.5 * scale);
  };
  const sw = (i: number) => Math.sin(phase * 2.3 + i * 1.7) * 0.35 * scale;
  const hh = (i: number) => 1 + Math.sin(phase * 3.1 + i * 2.1) * 0.08;
  tongue(-1.2 * scale, 1.1 * scale, 3.4 * scale * hh(0), sw(0), C.fire);
  tongue(1.1 * scale, 1.0 * scale, 3.0 * scale * hh(1), sw(1), C.fire);
  tongue(0, 1.5 * scale, 4.4 * scale * hh(2), sw(2), C.fire);
  tongue(-0.9 * scale, 0.7 * scale, 2.4 * scale * hh(3), sw(3), C.flame);
  tongue(0.8 * scale, 0.7 * scale, 2.2 * scale * hh(4), sw(4), C.flame);
  tongue(0, 1.0 * scale, 3.2 * scale * hh(5), sw(5), C.flame);
  tongue(0, 0.5 * scale, 1.8 * scale * hh(6), sw(6), C.flameHot);
}

// An iron lantern standing at (u, v, z) (its foot), 1.2 across: its panes
// glow warm when `lit`, else dark.
export function lantern(k: Kit, u: number, v: number, z: number, lit = true, size = 1): void {
  const w = 1.1 * size;
  const h = 1.6 * size;
  const u0 = u - w / 2;
  const v0 = v - w / 2;
  k.box(u0 - 0.1 * size, v0 - 0.1 * size, z, w + 0.2 * size, w + 0.2 * size, 0.28 * size, C.iron, { line: k.thin, stripe: false });
  const zz = z + 0.28 * size;
  const pane = lit ? C.lamp : '#3a4256';
  const pane2 = lit ? '#f5b25a' : '#2c3344';
  k.poly([[u0, v0 + w, zz], [u0 + w, v0 + w, zz], [u0 + w, v0 + w, zz + h], [u0, v0 + w, zz + h]], k.lit(0, 1) ? pane : pane2, k.thin);
  k.poly([[u0 + w, v0, zz], [u0 + w, v0 + w, zz], [u0 + w, v0 + w, zz + h], [u0 + w, v0, zz + h]], k.lit(1, 0) ? pane : pane2, k.thin);
  if (lit) {
    const [x, y] = k.p(u, v + w / 2, zz + h * 0.45);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.16 * k.s * size, 0.32 * k.s * size, 0, 0, Math.PI * 2);
    k.pen.fillStyle = C.flameHot;
    k.pen.fill();
  }
  // the frame's corner posts
  for (const [pu, pv] of [[u0, v0 + w], [u0 + w, v0 + w], [u0 + w, v0]] as const) k.line([[pu, pv, zz], [pu, pv, zz + h]], INK, Math.max(1, 0.16 * k.s * size));
  // the cap and its ring
  const cz = zz + h;
  k.poly([[u0 - 0.15 * size, v0 + w + 0.15 * size, cz], [u0 + w + 0.15 * size, v0 + w + 0.15 * size, cz], [u, v, cz + 0.8 * size]], shade(C.iron, 0.15), k.thin);
  k.poly([[u0 + w + 0.15 * size, v0 - 0.15 * size, cz], [u0 + w + 0.15 * size, v0 + w + 0.15 * size, cz], [u, v, cz + 0.8 * size]], C.iron, k.thin);
  const [rx, ry] = k.p(u, v, cz + 1.05 * size);
  k.pen.beginPath();
  k.pen.ellipse(rx, ry, 0.3 * k.s * size, 0.26 * k.s * size, 0, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1, 0.12 * k.s * size);
  k.pen.stroke();
}

// A copper kettle sitting at (u, v, z), body r across, spout toward -u.
export function kettle(k: Kit, u: number, v: number, z: number, r = 0.9, lid = 0, metal: Color = C.copper): void {
  // spout and handle behind and over the body
  k.rod([[u - r * 0.7, v, z + r * 0.6], [u - r * 1.25, v, z + r * 1.05], [u - r * 1.45, v, z + r * 1.3]], metal, 0.18 * r);
  const e = k.ell(u, v, z + r * 0.75, r);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(e.cx, e.cy, e.rx * 0.98, e.rx * 0.7, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, e.cy - e.rx * 0.35, 0, e.cx, e.cy, e.rx);
  g.addColorStop(0, shade(metal, 0.5));
  g.addColorStop(0.35, metal);
  g.addColorStop(1, shade(metal, -0.35));
  k.paint(g, k.lw);
  // the lid, lifting a little when it rattles
  k.disc(u, v, z + r * 1.3 + lid, r * 0.42, shade(metal, 0.1), k.thin);
  k.disc(u, v, z + r * 1.45 + lid, r * 0.14, C.iron, k.thin);
  k.rod([[u - r * 0.55, v, z + r * 1.25], [u - r * 0.3, v, z + r * 1.95], [u + r * 0.3, v, z + r * 1.95], [u + r * 0.55, v, z + r * 1.25]], C.iron, 0.09 * r);
}

// A mug of cocoa at (u, v, z), a marshmallow floating on it.
export function mug(k: Kit, u: number, v: number, z: number, color: Color = C.mug, r = 0.42): void {
  k.cyl(u, v, z, r, r * 2, color);
  k.disc(u, v, z + r * 2 - 0.05, r * 0.8, C.cocoa, 0);
  if (k.s * r >= 3) k.disc(u + r * 0.15, v - r * 0.1, z + r * 2, r * 0.3, '#fbf6ee', 0);
  k.rod([[u + r * 0.95, v, z + r * 1.6], [u + r * 1.5, v, z + r * 1.2], [u + r * 0.95, v, z + r * 0.6]], color, Math.max(0.08, r * 0.22));
}

// ── cloth, fur, greenery ───────────────────────────────────────────────────

// A ragged edge from a to b (frame points), its tufts reaching `d` toward
// `out`: the hem of a fur.
export function hem(a: P3, b: P3, n: number, out: P3, d: number): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const k = i % 2 ? d : d * 0.25;
    pts.push([a[0] + (b[0] - a[0]) * t + out[0] * k, a[1] + (b[1] - a[1]) * t + out[1] * k, a[2] + (b[2] - a[2]) * t + out[2] * k]);
  }
  return pts;
}

// A burlap sack sitting on z, r across and h tall, tied at the neck.
export function sack(k: Kit, cu: number, cv: number, z: number, r: number, h: number, base: Color = '#c8ab7a', band: Color = C.navy): void {
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
  const y = e0.cy + (e1.cy - e0.cy) * 0.42;
  const half = e0.rx * 0.95;
  pen.beginPath();
  pen.moveTo(e0.cx - half, y);
  pen.quadraticCurveTo(e0.cx, y + e0.ry * 0.8, e0.cx + half, y);
  pen.strokeStyle = band;
  pen.lineWidth = Math.max(0.9, 0.16 * k.s);
  pen.stroke();
  const [nx, ny] = k.p(cu, cv, z + h + 0.35);
  pen.beginPath();
  pen.ellipse(nx, ny, e1.rx * 0.8, e1.rx * 0.5, 0, 0, Math.PI * 2);
  k.paint(shade(base, 0.1), k.thin);
  k.line([[cu - r * 0.4, cv, z + h - 0.05], [cu + r * 0.4, cv, z + h - 0.05]], C.rope, Math.max(0.9, 0.14 * k.s));
}

// A little snow-laden fir: tiers of boughs round a trunk, snow on each.
export function fir(k: Kit, u: number, v: number, z: number, h: number, r: number, seed: number): void {
  k.rod([[u, v, z], [u, v, z + h * 0.3]], C.woodDark, 0.3);
  const tiers = 4;
  for (let i = 0; i < tiers; i++) {
    const z0 = z + h * (0.18 + (i / tiers) * 0.62);
    const z1 = z0 + h * 0.36;
    const rr = r * (1 - i / (tiers + 0.6));
    const e = k.ell(u, v, z0, rr);
    const [tx, ty] = k.p(u, v, z1);
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(tx, ty);
    pen.lineTo(e.cx - e.rx, e.cy);
    pen.quadraticCurveTo(e.cx, e.cy + e.ry * 1.6, e.cx + e.rx, e.cy);
    pen.closePath();
    const g = pen.createLinearGradient(e.cx - e.rx, ty, e.cx + e.rx, e.cy);
    g.addColorStop(0, shade(C.pine, 0.12));
    g.addColorStop(1, shade(C.pine, -0.3));
    k.paint(g, k.lw);
    // snow along the bough's top
    pen.beginPath();
    pen.moveTo(tx, ty);
    pen.lineTo(e.cx - e.rx * 0.85, e.cy - e.ry * 0.2);
    pen.quadraticCurveTo(e.cx - e.rx * 0.2, e.cy - (e.cy - ty) * (0.25 + hash(seed, i) * 0.15), tx + e.rx * 0.3, ty + (e.cy - ty) * 0.45);
    pen.closePath();
    k.paint(C.snow, k.thin);
  }
}

// Flames standing upright on the screen over (u, v, z), about `size` units
// tall and `width` wide, swaying by `phase`: tongues of fire, then flame,
// then a hot core.
export function blaze(k: Kit, u: number, v: number, z: number, size: number, phase = 0, width = size): void {
  const [x, y] = k.p(u, v, z);
  const S = size * k.s;
  const Wd = width * k.s;
  const pen = k.pen;
  const tongue = (dx: number, w: number, h: number, sway: number, c: Color) => {
    const bx = x + dx * Wd;
    const tx = bx + sway * S;
    const ty = y - h * S;
    pen.beginPath();
    pen.moveTo(bx - w * Wd, y);
    pen.bezierCurveTo(bx - w * Wd * 1.15, y - h * S * 0.45, tx - w * Wd * 0.35, y - h * S * 0.75, tx, ty);
    pen.bezierCurveTo(tx + w * Wd * 0.35, y - h * S * 0.75, bx + w * Wd * 1.15, y - h * S * 0.45, bx + w * Wd, y);
    pen.quadraticCurveTo(bx, y + w * Wd * 0.4, bx - w * Wd, y);
    pen.closePath();
    pen.fillStyle = c;
    pen.fill();
  };
  const sw = (i: number) => Math.sin(phase * 2.3 + i * 1.7) * 0.07;
  const hh = (i: number) => 1 + Math.sin(phase * 3.1 + i * 2.1) * 0.1;
  tongue(-0.22, 0.2, 0.72 * hh(0), sw(0) - 0.06, C.fire);
  tongue(0.24, 0.18, 0.62 * hh(1), sw(1) + 0.06, C.fire);
  tongue(0, 0.3, 1.0 * hh(2), sw(2), C.fire);
  tongue(-0.12, 0.16, 0.58 * hh(3), sw(3), C.flame);
  tongue(0.12, 0.15, 0.5 * hh(4), sw(4), C.flame);
  tongue(0, 0.2, 0.72 * hh(5), sw(5), C.flame);
  tongue(0, 0.1, 0.4 * hh(6), sw(6), C.flameHot);
}

export const BINDINGS: readonly Color[] = ['#b9443a', '#dba642', '#3f8288', '#e9dcc0', '#8c2f2b', '#4d7d5c', '#36507a', '#6d4a78', '#c98a4a', '#2f4a66'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  for (let i = 0; u < u1 - 0.3; i++) {
    const w = 0.42 + hash(seed, i, 61) * 0.4;
    if (u + w > u1) break;
    if (hash(seed, i, 62) < 0.08 && u > u0 + 1) {
      u += 0.6;
      continue;
    }
    const h = hmax * (0.68 + hash(seed, i, 63) * 0.3);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
    const lean = hash(seed, i, 65) < 0.07 && i > 0 ? 0.35 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.3 : 0.02);
  }
  for (const [c, qs] of byColor) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  if (k.fine) {
    pen.beginPath();
    for (const q of all) {
      const hh = q[3][2] - q[0][2];
      for (const f of [0.18, 0.82]) k.run([[q[0][0] + (q[3][0] - q[0][0]) * f, v, q[0][2] + hh * f], [q[1][0] + (q[2][0] - q[1][0]) * f, v, q[1][2] + hh * f]]);
    }
    pen.strokeStyle = '#f3dfae99';
    pen.lineWidth = Math.max(0.7, 0.07 * k.s);
    pen.stroke();
  }
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A heap of snow on z, r across and h tall: one lumpy silhouette, lit from
// the upper left, a soft ridge across its crown. Only the crown is inked:
// its foot melts into the snow it lies on.
export function heap(k: Kit, cu: number, cv: number, z: number, r: number, h: number, seed: number, base: Color = C.snow, line = k.lw): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const H = e.cy - ty;
  const pen = k.pen;
  const n = 28;
  const crown: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const th = Math.PI - (i / n) * Math.PI;
    const bump = 1 + 0.08 * Math.sin(th * 3 + seed) + 0.05 * Math.sin(th * 5 + seed * 2);
    crown.push([e.cx + Math.cos(th) * e.rx, e.cy - Math.pow(Math.sin(th), 0.6) * H * bump]);
  }
  pen.beginPath();
  crown.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, ty + H * 0.3, 0, e.cx, e.cy, e.rx * 1.3);
  g.addColorStop(0, shade(base, 0.4));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.3));
  k.paint(g, 0);
  // the shade it casts along its foot, toward the viewer
  pen.beginPath();
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0.15, Math.PI - 0.15);
  pen.strokeStyle = withAlpha(shade(base, -0.45), 0.55);
  pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  pen.stroke();
  if (line > 0) {
    pen.beginPath();
    crown.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
    pen.strokeStyle = INK;
    pen.lineWidth = line;
    pen.lineJoin = 'round';
    pen.lineCap = 'round';
    pen.stroke();
  }
  pen.beginPath();
  pen.moveTo(e.cx - e.rx * 0.55, e.cy - H * 0.55);
  pen.quadraticCurveTo(e.cx - e.rx * 0.1, e.cy - H * 0.95, e.cx + e.rx * 0.45, e.cy - H * 0.7);
  pen.strokeStyle = withAlpha('#ffffff', 0.8);
  pen.lineWidth = Math.max(0.8, 0.14 * k.s);
  pen.lineCap = 'round';
  pen.stroke();
}
