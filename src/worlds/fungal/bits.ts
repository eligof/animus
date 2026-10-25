import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the caverns are full of, drawn in any frame: mushrooms of
// every size, shelf fungi, crystals, boulders and tufts, hanging roots and
// vines, potion bottles, jars, candles and books.

// Toward the viewer, in any prop or wall frame (moving along (1, 1, 1)
// leaves a point where it is on screen).
const VIEW: P3 = [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)];
const dot = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: P3): P3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const add = (a: P3, b: P3, k = 1): P3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

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
  const N = norm(n);
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = norm(cross(N, ref));
  const b = cross(N, a);
  const out: Pt[] = [];
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    out.push(k.p(...add(add(c, a, Math.cos(th) * r), b, Math.sin(th) * r)));
  }
  return out;
}

export function shape(k: Kit, pts: ReadonlyArray<Pt>): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
}

export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient, line = 0): void {
  shape(k, pts);
  k.paint(c, line);
}

// A gradient lit from the left across screen x0..x1.
export function across(k: Kit, x0: number, x1: number, base: Color, lift = 0.14, sink = -0.24): Gradient {
  const g = k.pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, lift * 0.5));
  g.addColorStop(0.3, shade(base, lift));
  g.addColorStop(0.62, base);
  g.addColorStop(1, shade(base, sink));
  return g;
}

// ── mushrooms ──────────────────────────────────────────────────────────────

export type Cap = 'dome' | 'flat' | 'cone' | 'bun';

export type ShroomOpts = {
  cap?: Cap;
  spots?: Color | null; // spot colour (none: null)
  glow?: boolean; // the cap is lit from within
  skirt?: boolean; // a ring round the stalk under the cap
  lean?: readonly [number, number]; // the cap's offset from over the foot (u, v)
  stalk?: Color;
  seed?: number;
  rb?: number; // the stalk's radius at the foot (default r * 0.26)
};

// A mushroom on z0: its stalk up to h, its cap of radius r over it. Domes
// and buns rise over the rim, flat caps barely, cones to a point.
export function shroom(k: Kit, cu: number, cv: number, z0: number, h: number, r: number, color: Color, o: ShroomOpts = {}): void {
  const cap = o.cap ?? 'dome';
  const [lu, lv] = o.lean ?? [0, 0];
  const tu = cu + lu;
  const tv = cv + lv;
  const stalkC = o.stalk ?? C.stalk;
  const rb = o.rb ?? r * 0.26;
  const rt = rb * 0.72;
  const seed = o.seed ?? 1;
  // the stalk: a tapered tube with a bulb at its foot, darker under the cap
  const bot = ring(k, [cu, cv, z0 + rb * 0.4], [0, 0, 1], rb, 16);
  const top = ring(k, [tu, tv, z0 + h], [0, 0, 1], rt, 16);
  const sil = hull([...bot, ...top]);
  const xs = sil.map((p) => p[0]);
  fillPts(k, sil, across(k, Math.min(...xs), Math.max(...xs), stalkC, 0.08, -0.26), 0);
  const [, ty] = k.p(tu, tv, z0 + h);
  const [, by] = k.p(cu, cv, z0);
  const under = k.pen.createLinearGradient(0, ty, 0, by);
  under.addColorStop(0, withAlpha('#2a1830', 0.5));
  under.addColorStop(0.22, withAlpha('#2a1830', 0));
  shape(k, sil);
  k.paint(under, k.lw);
  const bulb = k.ell(cu, cv, z0 + rb * 0.35, rb * 1.15);
  k.pen.beginPath();
  k.pen.ellipse(bulb.cx, bulb.cy - rb * 0.25 * k.s, bulb.rx, bulb.ry * 1.25, bulb.rot, 0, Math.PI);
  k.paint(shade(stalkC, -0.05), k.thin);
  if (o.skirt) {
    const zs = z0 + h - Math.min(h * 0.22, r * 0.5);
    const s0 = ring(k, [cu + lu * 0.8, cv + lv * 0.8, zs + rb * 0.3], [0, 0, 1], rt * 1.05, 16);
    const s1 = ring(k, [cu + lu * 0.8, cv + lv * 0.8, zs - rb * 0.5], [0, 0, 1], rt * 1.9, 16);
    fillPts(k, hull([...s0, ...s1]), shade(stalkC, 0.06), k.thin);
  }
  capOn(k, tu, tv, z0 + h, r, color, cap, o.spots === undefined ? null : o.spots, !!o.glow, seed);
}

// A cap of radius r whose rim sits at z over (cu, cv).
export function capOn(k: Kit, cu: number, cv: number, z: number, r: number, color: Color, cap: Cap, spots: Color | null, glow: boolean, seed: number): void {
  const pen = k.pen;
  const dh = cap === 'flat' ? r * 0.32 : cap === 'bun' ? r * 0.85 : cap === 'cone' ? r * 1.1 : r * 0.62;
  const zr = cap === 'bun' ? z + r * 0.12 : z;
  const e = k.ell(cu, cv, zr, r);
  const [cx, cy] = [e.cx, e.cy];
  const ry2 = Math.sqrt(e.ry * e.ry + (dh * k.s) ** 2);
  // the cap's edge: a lip of gills under the rim's front
  const lip = Math.max(1, r * 0.16 * k.s);
  pen.beginPath();
  pen.ellipse(cx, cy + lip, e.rx * 0.97, e.ry * 0.97, 0, 0, Math.PI);
  pen.ellipse(cx, cy, e.rx, e.ry, 0, Math.PI, 0, true);
  pen.closePath();
  k.paint(glow ? shade(color, 0.25) : C.gill, k.lw);
  // the dome
  pen.beginPath();
  if (cap === 'cone') {
    const [px, py] = [cx, cy - dh * k.s];
    pen.moveTo(cx - e.rx, cy);
    pen.bezierCurveTo(cx - e.rx * 0.95, cy - dh * k.s * 0.45, px - e.rx * 0.35, py + dh * k.s * 0.1, px, py);
    pen.bezierCurveTo(px + e.rx * 0.35, py + dh * k.s * 0.1, cx + e.rx * 0.95, cy - dh * k.s * 0.45, cx + e.rx, cy);
  } else {
    pen.ellipse(cx, cy, e.rx, ry2, 0, Math.PI, Math.PI * 2);
  }
  pen.ellipse(cx, cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const hx = cx - e.rx * 0.35;
  const hy = cy - ry2 * 0.55;
  const g = pen.createRadialGradient(hx, hy, 0, cx, cy - ry2 * 0.2, e.rx * 1.25);
  if (glow) {
    g.addColorStop(0, C.glowHot);
    g.addColorStop(0.35, shade(color, 0.3));
    g.addColorStop(0.8, color);
    g.addColorStop(1, shade(color, -0.25));
  } else {
    g.addColorStop(0, shade(color, 0.3));
    g.addColorStop(0.3, shade(color, 0.1));
    g.addColorStop(0.75, color);
    g.addColorStop(1, shade(color, -0.3));
  }
  k.paint(g, k.lw);
  // a sheen across the top left
  pen.beginPath();
  pen.ellipse(hx, hy + ry2 * 0.08, e.rx * 0.32, ry2 * 0.14, -0.35, 0, Math.PI * 2);
  pen.fillStyle = withAlpha('#ffffff', glow ? 0.45 : 0.28);
  pen.fill();
  // spots on the side toward the viewer
  if (spots && r * k.s > 5) {
    const n = 7 + Math.floor(hash(seed, 3) * 4);
    pen.beginPath();
    for (let i = 0; i < n; i++) {
      const th = hash(seed, i, 11) * Math.PI * 2;
      const ph = 0.15 + hash(seed, i, 12) * 1.1;
      const N: P3 = norm([Math.cos(th) * Math.cos(ph) / r, Math.sin(th) * Math.cos(ph) / r, Math.sin(ph) / Math.max(0.1, dh)]);
      if (dot(N, VIEW) < 0.25) continue;
      const c: P3 = [cu + Math.cos(th) * Math.cos(ph) * r * 0.98, cv + Math.sin(th) * Math.cos(ph) * r * 0.98, zr + Math.sin(ph) * dh];
      if (cap === 'cone' && ph > 0.9) continue;
      const pts = ring(k, c, N, r * (0.1 + hash(seed, i, 13) * 0.09), 10);
      pts.forEach(([x, y], j) => (j ? pen.lineTo(x, y) : pen.moveTo(x, y)));
      pen.closePath();
    }
    pen.fillStyle = spots;
    pen.fill();
  }
  if (glow) k.halo(cu, cv, zr + dh * 0.5, r * 2.2, C.glow, 0.42);
}

// A clump of little mushrooms round (cu, cv) on z, `n` of them within
// radius `spread`, back ones first.
export function clump(k: Kit, cu: number, cv: number, z: number, n: number, spread: number, size: number, colors: readonly Color[], seed: number, glow = false): void {
  const items: Array<{ u: number; v: number; h: number; r: number; c: Color }> = [];
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 21) * Math.PI * 2;
    const d = Math.sqrt(hash(seed, i, 22)) * spread;
    const sz = size * (0.55 + hash(seed, i, 23) * 0.6);
    items.push({ u: cu + Math.cos(a) * d, v: cv + Math.sin(a) * d, h: sz * 1.5, r: sz * 0.7, c: colors[Math.floor(hash(seed, i, 24) * colors.length)] });
  }
  items.sort((p, q) => p.u + p.v - (q.u + q.v));
  for (const m of items) {
    const lean = (hash(seed, m.u * 7, 25) - 0.5) * m.r * 0.5;
    shroom(k, m.u, m.v, z, m.h, m.r, m.c, { cap: m.r < 0.5 ? 'cone' : 'dome', glow, spots: !glow && m.r > 0.6 && m.c === C.capRed ? C.spot : null, lean: [lean, -lean], seed: Math.floor(m.u * 31 + m.v * 17) });
  }
}

// A shelf fungus jutting from an upright face (the plane v = n, facing +v):
// a half disc r out from the face at (u, z), `th` thick, ringed on top.
export function bracket(k: Kit, u: number, n: number, z: number, r: number, color: Color, glow = false, th = 0.35): void {
  const steps = 14;
  const top: P3[] = [];
  const bot: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    const w = r * 1.25 * Math.cos(a);
    const o = r * Math.sin(a);
    top.push([u + w, n + o, z]);
    bot.push([u + w * 0.92, n + o * 0.9, z - th]);
  }
  // the underside's edge, then the top
  k.poly([...top, ...bot.reverse()], glow ? shade(color, 0.2) : shade(color, -0.22), k.thin);
  const [x0] = k.p(u - r * 1.25, n, z);
  const [x1] = k.p(u + r * 1.25, n, z);
  const g = k.pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(color, glow ? 0.4 : 0.16));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.12));
  k.poly(top, g, k.lw);
  if (r * k.s > 6) {
    // growth rings
    const pts: P3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      pts.push([u + r * 0.8 * Math.cos(a), n + r * 0.62 * Math.sin(a), z]);
    }
    k.line(pts, glow ? C.glowHot : shade(color, 0.28), Math.max(0.7, 0.07 * k.s));
  }
  if (glow) k.halo(u, n + r * 0.5, z, r * 2.4, C.glow, 0.35);
}

// ── crystals ───────────────────────────────────────────────────────────────

// A six-sided crystal from `base` along `axis`, `len` long, r thick, its
// point the last quarter. Faces shaded by which way they turn on screen.
export function crystal(k: Kit, base: P3, axis: P3, len: number, r: number, color: Color, line = k.lw): void {
  const A = norm(axis);
  const ref: P3 = Math.abs(A[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = norm(cross(A, ref));
  const b = cross(A, a);
  const sides = 6;
  const shoulder = add(base, A, len * 0.74);
  const tip = add(base, A, len);
  const rim = (c: P3, rr: number) => {
    const out: P3[] = [];
    for (let i = 0; i < sides; i++) {
      const th = (i / sides) * Math.PI * 2 + 0.3;
      out.push(add(add(c, a, Math.cos(th) * rr), b, Math.sin(th) * rr));
    }
    return out;
  };
  const lo = rim(base, r);
  const hi = rim(shoulder, r);
  const faces: Array<{ pts: P3[]; n: P3 }> = [];
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    const th = ((i + 0.5) / sides) * Math.PI * 2 + 0.3;
    const out = norm(add(add([0, 0, 0], a, Math.cos(th)), b, Math.sin(th)));
    faces.push({ pts: [lo[i], lo[j], hi[j], hi[i]], n: out });
    faces.push({ pts: [hi[i], hi[j], tip], n: norm(add(out, A, 0.6)) });
  }
  const pen = k.pen;
  const sil = hull([...lo, ...hi, tip].map((p) => k.p(...p)));
  fillPts(k, sil, shade(color, -0.2), 0);
  for (const f of faces) {
    if (dot(f.n, VIEW) <= 0.02) continue;
    // lit when the face turns screen-left or up
    const [x0, y0] = k.p(0, 0, 0);
    const [x1, y1] = k.p(...f.n);
    const sx = x1 - x0;
    const sy = y1 - y0;
    const lit = -sx * 0.7 - sy * 0.7;
    const c = lit > 0.25 * k.s ? shade(color, 0.3) : lit > -0.2 * k.s ? color : shade(color, -0.22);
    pen.beginPath();
    k.trace(f.pts);
    pen.fillStyle = c;
    pen.fill();
  }
  // a bright edge down the lit side
  k.line([lo[3], hi[3], tip], withAlpha('#ffffff', 0.55), Math.max(0.8, r * 0.18 * k.s));
  if (line > 0) {
    shape(k, sil);
    k.paint(null, line);
  }
}

// A cluster of crystals growing out of (cu, cv, z) along `up` (a floor
// cluster points up, a wall one out of the face), lit within.
export function crystals(k: Kit, cu: number, cv: number, z: number, size: number, up: P3, color: Color, seed: number, n = 5): void {
  const U = norm(up);
  const items: Array<{ base: P3; axis: P3; len: number; r: number; d: number }> = [];
  for (let i = 0; i < n; i++) {
    const spread = i === 0 ? 0 : 0.55 + hash(seed, i, 31) * 0.5;
    const a = hash(seed, i, 32) * Math.PI * 2;
    const ref: P3 = Math.abs(U[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const p = norm(cross(U, ref));
    const q = cross(U, p);
    const off = add(add([0, 0, 0], p, Math.cos(a) * spread), q, Math.sin(a) * spread);
    const axis = norm(add(U, off, 0.9));
    const len = size * (i === 0 ? 1 : 0.45 + hash(seed, i, 33) * 0.45);
    const base: P3 = add([cu, cv, z], off, size * 0.18);
    items.push({ base, axis, len, r: len * 0.16 + size * 0.04, d: dot(add(base, axis, len * 0.5), VIEW) });
  }
  items.sort((p, q) => p.d - q.d);
  k.halo(cu + U[0] * size * 0.5, cv + U[1] * size * 0.5, z + U[2] * size * 0.5, size * 1.4, C.crystal, 0.3);
  for (const c of items) crystal(k, c.base, c.axis, c.len, c.r, color);
  k.halo(cu + U[0] * size * 0.4, cv + U[1] * size * 0.4, z + U[2] * size * 0.4, size * 0.6, C.crystalLit, 0.35);
}

// ── stone, moss, roots and vines ──────────────────────────────────────────

// A rounded boulder sitting on z at (cu, cv), r across and h tall, lumpy
// by seed, lit from the upper left.
export function boulder(k: Kit, cu: number, cv: number, z: number, r: number, h: number, color: Color, seed: number, moss = false): void {
  const pts: Pt[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const j = 0.82 + hash(seed, i, 41) * 0.3;
    // a ring round the foot, a smaller one up top
    pts.push(k.p(cu + Math.cos(th) * r * j, cv + Math.sin(th) * r * j, z));
    pts.push(k.p(cu + Math.cos(th) * r * j * 0.62, cv + Math.sin(th) * r * j * 0.62, z + h * (0.75 + hash(seed, i, 42) * 0.25)));
  }
  const sil = hull(pts);
  const [cx, cy] = k.p(cu, cv, z + h * 0.6);
  const g = k.pen.createRadialGradient(cx - r * k.s * 0.5, cy - h * k.s * 0.35, 0, cx, cy, Math.max(r * 1.6, h) * k.s);
  g.addColorStop(0, shade(color, 0.25));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.32));
  fillPts(k, sil, g, 0);
  if (moss) {
    // a cap of moss on top
    const top: Pt[] = [];
    for (let i = 0; i < 12; i++) {
      const th = (i / 12) * Math.PI * 2;
      const j = 0.6 + hash(seed, i, 43) * 0.2;
      top.push(k.p(cu + Math.cos(th) * r * j - r * 0.1, cv + Math.sin(th) * r * j - r * 0.1, z + h * 0.95));
    }
    k.pen.save();
    shape(k, sil);
    k.pen.clip();
    const mt = hull(top);
    shape(k, mt);
    k.paint(C.moss, 0);
    k.pen.restore();
  }
  shape(k, sil);
  k.paint(null, k.lw);
}

// A tuft of grass blades at (u, v, z), blades about h tall (screen space).
export function tuft(k: Kit, u: number, v: number, z: number, h: number, color: Color, seed: number, blades = 5): void {
  const [x, y] = k.p(u, v, z);
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < blades; i++) {
    const a = -Math.PI / 2 + (i - (blades - 1) / 2) * 0.32 + (hash(seed, i, 51) - 0.5) * 0.2;
    const L = h * k.s * (0.6 + hash(seed, i, 52) * 0.5);
    const bx = x + (i - (blades - 1) / 2) * 0.12 * k.s;
    pen.moveTo(bx - 0.12 * k.s, y);
    pen.quadraticCurveTo(bx + Math.cos(a) * L * 0.4, y + Math.sin(a) * L * 0.6, bx + Math.cos(a) * L, y + Math.sin(a) * L);
    pen.quadraticCurveTo(bx + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5, bx + 0.12 * k.s, y);
    pen.closePath();
  }
  k.paint(color, k.thin * 0.8);
}

// A root: a tapering bendy line from a to b through c (frame points), w
// thick at a, ink under bark.
export function root(k: Kit, a: P3, c: P3, b: P3, w: number, color: Color = C.root): void {
  const n = 8;
  const pts: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = (1 - t) * (1 - t);
    const q = 2 * (1 - t) * t;
    const r = t * t;
    pts.push([a[0] * m + c[0] * q + b[0] * r, a[1] * m + c[1] * q + b[1] * r, a[2] * m + c[2] * q + b[2] * r]);
  }
  for (let i = 0; i < n; i++) {
    const ww = w * (1 - (i / n) * 0.85);
    k.line([pts[i], pts[i + 1]], INK, ww * k.s + k.lw * 1.2);
  }
  for (let i = 0; i < n; i++) {
    const ww = w * (1 - (i / n) * 0.85);
    k.line([pts[i], pts[i + 1]], color, ww * k.s);
  }
  if (w * k.s > 3) {
    const hi: P3[] = pts.slice(0, n - 1).map(([u, v, z]) => [u - w * 0.18, v, z + w * 0.18]);
    k.line(hi, shade(color, 0.25), Math.max(0.7, w * 0.22 * k.s));
  }
}

// A screen-space ribbon down a path of frame points, w0 thick at the start
// tapering to w1 (units): a root's body, lit along its left edge.
export function ribbon(k: Kit, pts: ReadonlyArray<P3>, w0: number, w1: number, color: Color): void {
  const sp = pts.map((p) => k.p(...p));
  const n = sp.length;
  const l: Pt[] = [];
  const r: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = sp[Math.max(0, i - 1)];
    const b = sp[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const w = ((w0 + (w1 - w0) * (i / (n - 1))) * k.s) / 2;
    const nx = (-dy / len) * w;
    const ny = (dx / len) * w;
    l.push([sp[i][0] + nx, sp[i][1] + ny]);
    r.push([sp[i][0] - nx, sp[i][1] - ny]);
  }
  const pen = k.pen;
  pen.beginPath();
  [...l, ...r.reverse()].forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  const xs = sp.map((p) => p[0]);
  const x0 = Math.min(...xs) - w0 * k.s;
  const x1 = Math.max(...xs) + w0 * k.s;
  const g = pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(color, 0.18));
  g.addColorStop(0.5, color);
  g.addColorStop(1, shade(color, -0.25));
  k.paint(g, k.lw);
  // bark lines
  pen.beginPath();
  for (let i = 1; i < n - 1; i += 2) {
    const [x, y] = sp[i];
    const [lx, ly] = l[i];
    pen.moveTo(x + (lx - x) * 0.5, y + (ly - y) * 0.5);
    pen.lineTo(x - (lx - x) * 0.2, y - (ly - y) * 0.2 + k.s * 0.6);
  }
  pen.strokeStyle = withAlpha(INK, 0.45);
  pen.lineWidth = Math.max(0.7, k.thin * 0.6);
  pen.stroke();
}

// Points along a quadratic-ish path through several frame points.
export function curve(pts: ReadonlyArray<P3>, steps: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (pts.length - 1);
    const j = Math.min(pts.length - 2, Math.floor(t));
    const f = t - j;
    const e = f * f * (3 - 2 * f);
    out.push([pts[j][0] + (pts[j + 1][0] - pts[j][0]) * e, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * f, pts[j][2] + (pts[j + 1][2] - pts[j][2]) * f]);
  }
  return out;
}

// A vine hanging from (u, n, z) on a face (plane v = n), about len long,
// leaves along it; returns the screen point of its tip.
export function vine(k: Kit, u: number, n: number, z: number, len: number, seed: number, color: Color = C.mossDark, leafC: Color = C.moss): Pt {
  const pts: P3[] = [];
  const steps = Math.max(4, Math.round(len / 1.2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([u + Math.sin(t * 5 + seed) * 0.45 * t, n + 0.1, z - len * t]);
  }
  k.line(pts, INK, Math.max(1.4, 0.14 * k.s) + k.thin);
  k.line(pts, color, Math.max(0.8, 0.14 * k.s));
  if (k.s >= 2.5) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 1; i <= steps; i += 1) {
      const [x, y] = k.p(pts[i][0] + (i & 1 ? 0.3 : -0.3), n + 0.15, pts[i][2]);
      const L = 0.42 * k.s;
      const a = (i & 1 ? 0.6 : Math.PI - 0.6) + hash(seed, i, 61) * 0.3;
      pen.moveTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      pen.ellipse(x, y, L, L * 0.55, a, 0, Math.PI * 2);
    }
    k.paint(leafC, k.thin * 0.7);
  }
  return k.p(...pts[steps]);
}

// ── things made by hand ───────────────────────────────────────────────────

// A round-bellied potion flask on z: glass, the potion inside, a cork.
export function flask(k: Kit, u: number, v: number, z: number, r: number, potion: Color, glow = false): void {
  const [x, y] = k.p(u, v, z + r);
  const R = r * k.s;
  const pen = k.pen;
  // neck
  k.box(u - r * 0.25, v - r * 0.25, z + r * 1.6, r * 0.5, r * 0.5, r * 0.9, C.glass, { line: k.thin, stripe: false });
  k.cyl(u, v, z + r * 2.45, r * 0.3, r * 0.45, '#a8784a', { line: k.thin });
  // belly
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  k.paint(withAlpha(C.glass, 0.55), 0);
  pen.save();
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  pen.clip();
  pen.beginPath();
  pen.rect(x - R, y - R * 0.15, 2 * R, 2 * R);
  const g = pen.createLinearGradient(x - R, 0, x + R, 0);
  g.addColorStop(0, shade(potion, glow ? 0.35 : 0.15));
  g.addColorStop(1, shade(potion, -0.2));
  pen.fillStyle = g;
  pen.fill();
  pen.restore();
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  k.paint(null, k.thin);
  pen.beginPath();
  pen.ellipse(x - R * 0.4, y - R * 0.35, R * 0.22, R * 0.32, -0.5, 0, Math.PI * 2);
  pen.fillStyle = '#ffffffa0';
  pen.fill();
  if (glow) k.halo(u, v, z + r, r * 3, potion, 0.4);
}

// A tall bottle: a box body and a neck.
export function bottle(k: Kit, u: number, v: number, z: number, r: number, h: number, color: Color): void {
  k.cyl(u, v, z, r, h, color, { line: k.thin });
  k.cyl(u, v, z + h, r * 0.4, h * 0.35, color, { line: k.thin });
  k.cyl(u, v, z + h * 1.35, r * 0.45, h * 0.12, '#a8784a', { line: k.thin });
  const [x, y] = k.p(u - r * 0.5, v, z + h * 0.75);
  k.pen.beginPath();
  k.pen.ellipse(x, y, r * 0.18 * k.s, h * 0.22 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = '#ffffff70';
  k.pen.fill();
}

// A candle standing on z, lit.
export function candle(k: Kit, u: number, v: number, z: number, h: number, r = 0.3): void {
  k.cyl(u, v, z, r, h, C.wax, { line: k.thin });
  const [x, y] = k.p(u, v, z + h + 0.45);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.16 * k.s, 0.32 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = C.flame;
  k.pen.fill();
  k.halo(u, v, z + h + 0.45, 1.6, '#ffc070', 0.45);
}

export const BINDINGS: readonly Color[] = ['#8a3a4a', '#d0a24a', '#3f6e66', '#e8dcc0', '#5a3f7a', '#6f8b4a', '#34476b', '#a0583a', '#2e5a5e', '#7a4a6a'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.42 + hash(seed, i, 61) * 0.42;
    if (u + w > u1) break;
    if (hash(seed, i, 62) < 0.08 && u > u0 + 1) {
      u += 0.6;
      i++;
      continue;
    }
    const h = hmax * (0.62 + hash(seed, i, 63) * 0.36);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
    const lean = hash(seed, i, 65) < 0.08 && i > 0 ? 0.35 : 0;
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
    pen.beginPath();
    for (const q of all) {
      const hh = q[3][2] - q[0][2];
      for (const f of [0.2, 0.8]) {
        const [x0, y0] = k.p(q[0][0] + (q[3][0] - q[0][0]) * f, v, q[0][2] + hh * f);
        const [x1, y1] = k.p(q[1][0] + (q[2][0] - q[1][0]) * f, v, q[1][2] + hh * f);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
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

// A toadstool stool: a short pale stalk under a flat spotted cap to sit on.
export function toadstool(k: Kit, cu: number, cv: number, h: number, r: number, color: Color = C.capRed, seed = 1): void {
  k.shadow(cu, cv, r * 1.1, r * 1.1, 0.26);
  shroom(k, cu, cv, 0, h, r, color, { cap: 'flat', spots: C.spot, rb: r * 0.45, seed });
}
