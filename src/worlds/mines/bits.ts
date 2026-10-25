import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the mine is full of, drawn in any frame: lanterns and
// flames, picks and shovels, barrels, crates, sacks, rocks and ore, gold
// nuggets and their glint, rails, wheels, logs and rope.

// ── geometry ────────────────────────────────────────────────────────────────

const norm = (n: P3): P3 => {
  const l = Math.hypot(...n) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
};
const cross = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// Two unit vectors spanning the plane square to n.
export function basis(n: P3): [P3, P3] {
  const N = norm(n);
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const a = norm(cross(N, ref));
  return [a, cross(N, a)];
}

// The frame point at angle th on the circle (c, r) in the plane (a, b).
export const onCircle = (c: P3, a: P3, b: P3, r: number, th: number): P3 => {
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

// A left-to-right screen gradient across a set of points: lit left, dark right.
export function across(k: Kit, pts: ReadonlyArray<Pt>, base: Color, hi = 0.14, lo = -0.24): Gradient {
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const [x] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
  }
  const g = k.pen.createLinearGradient(x0, 0, x1 + 0.01, 0);
  g.addColorStop(0, shade(base, hi * 0.5));
  g.addColorStop(0.3, shade(base, hi));
  g.addColorStop(0.65, base);
  g.addColorStop(1, shade(base, lo));
  return g;
}

// ── light ───────────────────────────────────────────────────────────────────

// A hurricane lantern standing on z: an iron foot, a glass globe (glowing
// when lit), wire guards, a cap and a bail. `glow` 0..1 sets how bright.
export function lantern(k: Kit, u: number, v: number, z: number, glow = 1, sc = 1): void {
  const s = k.s;
  const r = 0.5 * sc;
  k.cyl(u, v, z, r, 0.28 * sc, C.iron, { line: k.thin });
  const [gx, gy] = k.p(u, v, z + 0.85 * sc);
  const e = k.ell(u, v, z, r * 0.85);
  const rx = e.rx;
  const ry = 0.62 * sc * s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(gx, gy, rx, ry, 0, 0, Math.PI * 2);
  if (glow > 0) {
    const g = pen.createRadialGradient(gx - rx * 0.2, gy, 0, gx, gy, Math.max(rx, ry));
    g.addColorStop(0, '#fffbe0');
    g.addColorStop(0.45, glow > 0.6 ? '#ffe08a' : '#f6d48c');
    g.addColorStop(1, glow > 0.6 ? '#f0a440' : '#c99a5a');
    k.paint(g, k.thin);
  } else k.paint('#b9a68a', k.thin);
  // wire guards
  if (s * sc >= 5) {
    pen.beginPath();
    for (const f of [-0.45, 0.45]) {
      pen.moveTo(gx + rx * f, gy - ry * 0.85);
      pen.lineTo(gx + rx * f, gy + ry * 0.85);
    }
    pen.strokeStyle = withAlpha(INK, 0.8);
    pen.lineWidth = Math.max(0.7, k.thin * 0.6);
    pen.stroke();
  }
  k.cyl(u, v, z + 1.38 * sc, r * 0.9, 0.22 * sc, C.iron, { line: k.thin });
  k.cyl(u, v, z + 1.6 * sc, r * 0.4, 0.2 * sc, C.ironLight, { line: k.thin });
  // the bail
  const [ax, ay] = k.p(u, v, z + 1.62 * sc);
  pen.beginPath();
  pen.ellipse(ax, ay - 0.05 * s, rx * 0.75, 0.45 * sc * s, 0, Math.PI, Math.PI * 2);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, 0.09 * s * sc);
  pen.stroke();
  if (glow > 0) {
    k.halo(u, v, z + 0.85 * sc, 2.6 * sc, '#ffcf7a', 0.5 * glow);
    k.halo(u, v, z + 0.85 * sc, 1.1 * sc, '#fff2c0', 0.5 * glow);
  }
}

// A lantern hung from (u, v, ztop) on a short chain `len` long.
export function hangLantern(k: Kit, u: number, v: number, ztop: number, len: number, glow = 1, sc = 1): void {
  k.line([[u, v, ztop], [u, v, ztop - len]], INK, Math.max(0.8, 0.09 * k.s));
  lantern(k, u, v, ztop - len - 2.05 * sc, glow, sc);
}

// Flames as nested tongues in the plane v = n, `phase` sets their sway.
export function flames(k: Kit, a: number, n: number, z: number, scale: number, phase = 0): void {
  const tongue = (du: number, w: number, h: number, sway: number, c: Color) => {
    k.poly([[a + du - w, n, z], [a + du - w * 0.8, n, z + h * 0.45], [a + du + sway, n, z + h], [a + du + w * 0.8, n, z + h * 0.45], [a + du + w, n, z]], c, 0, 0.5 * scale);
  };
  const sw = (i: number) => Math.sin(phase * 2.3 + i * 1.7) * 0.35 * scale;
  const hh = (i: number) => 1 + Math.sin(phase * 3.1 + i * 2.3) * 0.12;
  tongue(-1.2 * scale, 1.1 * scale, 3.4 * scale * hh(0), sw(0), C.fire);
  tongue(1.1 * scale, 1.0 * scale, 3.0 * scale * hh(1), sw(1), C.fire);
  tongue(0, 1.5 * scale, 4.4 * scale * hh(2), sw(2), C.fire);
  tongue(-0.9 * scale, 0.7 * scale, 2.4 * scale * hh(3), sw(3), C.flame);
  tongue(0.8 * scale, 0.7 * scale, 2.2 * scale * hh(4), sw(4), C.flame);
  tongue(0, 1.0 * scale, 3.2 * scale * hh(5), sw(5), C.flame);
  tongue(0, 0.5 * scale, 1.8 * scale * hh(6), sw(6), C.flameHot);
}

export function candle(k: Kit, u: number, n: number, z: number, h: number): void {
  k.cyl(u, n, z, 0.28, h, '#efe2c4');
  const [x, y] = k.p(u, n, z + h + 0.42);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.15 * k.s, 0.3 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = C.flame;
  k.pen.fill();
  k.halo(u, n, z + h + 0.42, 1.6, '#ffc070', 0.45);
}

// A four-pointed glint on a frame point: gold catching the lamp light.
export function sparkle(k: Kit, u: number, v: number, z: number, r: number, a = 1): void {
  const [x, y] = k.p(u, v, z);
  const R = r * k.s;
  const w = R * 0.22;
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x, y - R);
  pen.quadraticCurveTo(x + w, y - w, x + R, y);
  pen.quadraticCurveTo(x + w, y + w, x, y + R);
  pen.quadraticCurveTo(x - w, y + w, x - R, y);
  pen.quadraticCurveTo(x - w, y - w, x, y - R);
  pen.closePath();
  pen.fillStyle = withAlpha('#fffbe6', Math.min(1, a));
  pen.fill();
  k.halo(u, v, z, r * 1.6, '#ffe28a', 0.45 * a);
}

// ── tools ───────────────────────────────────────────────────────────────────

const add = (a: P3, b: P3, f = 1): P3 => [a[0] + b[0] * f, a[1] + b[1] * f, a[2] + b[2] * f];

// A pick: the haft from `grip` to `head`, the iron head across it along
// `side` (a unit vector), its points curving back toward the grip.
export function pickaxe(k: Kit, grip: P3, head: P3, side: P3, size = 1, haft: Color = C.timber): void {
  const d = norm([grip[0] - head[0], grip[1] - head[1], grip[2] - head[2]]);
  k.rod([grip, add(head, d, -0.15)], haft, 0.24 * size);
  const L = 1.35 * size;
  const pts: P3[] = [add(add(head, side, -L), d, 0.45 * size), add(add(head, side, -L * 0.55), d, 0.08 * size), head, add(add(head, side, L * 0.55), d, 0.08 * size), add(add(head, side, L), d, 0.45 * size)];
  k.line(pts, INK, (0.3 * size) * k.s + k.lw * 1.4);
  k.line(pts, C.ironLight, 0.3 * size * k.s);
  k.line(pts.slice(1, 4), shade(C.ironLight, 0.25), Math.max(0.6, 0.1 * size * k.s));
  k.disc(...head, 0.22 * size, C.iron, k.thin);
}

// A shovel: the haft from `top` to `foot`, a D grip at the top and the
// blade at the foot, broad along `side`.
export function shovel(k: Kit, top: P3, foot: P3, side: P3, size = 1): void {
  const d = norm([foot[0] - top[0], foot[1] - top[1], foot[2] - top[2]]);
  const neck = add(foot, d, -1.4 * size);
  k.rod([top, neck], C.timber, 0.2 * size);
  const w = 0.65 * size;
  k.rod([add(top, side, -0.35 * size), add(add(top, d, -0.5 * size), side, -0.3 * size), add(add(top, d, -0.5 * size), side, 0.3 * size), add(top, side, 0.35 * size)], C.timberDark, 0.1 * size);
  const blade: P3[] = [add(neck, side, -w * 0.55), add(neck, side, w * 0.55), add(add(foot, side, w), d, -0.25 * size), add(foot, d, 0.15 * size), add(add(foot, side, -w), d, -0.25 * size)];
  k.poly(blade, C.steel, k.lw, 0.15);
  k.line([add(neck, d, 0.2), add(foot, d, -0.1)], shade(C.steel, -0.25), Math.max(0.6, 0.08 * size * k.s));
}

// ── vessels and stores ──────────────────────────────────────────────────────

// A barrel standing on z: bellied staves, iron hoops, a lid (or open, full
// of `fill`).
export function barrel(k: Kit, cu: number, cv: number, z: number, r: number, h: number, wood: Color = C.timber, fill: Color | null = null): void {
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
  // staves
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
  // hoops
  for (const f of [0.14, 0.42, 0.86]) {
    const zz = z + h * f;
    const bulge = 1 + 0.18 * Math.sin(f * Math.PI);
    const eh = k.ell(cu, cv, zz, r * 0.88 * bulge);
    pen.beginPath();
    pen.ellipse(eh.cx, eh.cy, eh.rx, eh.ry, 0, 0, Math.PI);
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(1.2, 0.22 * k.s + k.thin);
    pen.stroke();
    pen.strokeStyle = C.ironLight;
    pen.lineWidth = Math.max(0.6, 0.16 * k.s);
    pen.stroke();
  }
  body();
  k.paint(null, k.lw);
  // the top
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, 0, Math.PI * 2);
  k.paint(shade(wood, 0.1), k.thin);
  if (fill) {
    pen.beginPath();
    pen.ellipse(e1.cx, e1.cy + e1.ry * 0.08, e1.rx * 0.8, e1.ry * 0.75, 0, 0, Math.PI * 2);
    k.paint(fill, 0);
  } else if (k.s * r >= 4) {
    pen.beginPath();
    for (const f of [-0.35, 0.35]) {
      pen.moveTo(e1.cx + e1.rx * f, e1.cy - e1.ry * Math.sqrt(1 - f * f));
      pen.lineTo(e1.cx + e1.rx * f, e1.cy + e1.ry * Math.sqrt(1 - f * f));
    }
    pen.strokeStyle = shade(wood, -0.25);
    pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    pen.stroke();
  }
}

// A plank crate: a box with board seams, corner battens and a brace
// across the faces the viewer sees (the +v front and the +u end).
export function crate(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, wood: Color = C.pine): void {
  k.box(u0, v0, z0, du, dv, dz, wood, { stripe: false });
  const u1 = u0 + du;
  const v1 = v0 + dv;
  const z1 = z0 + dz;
  const seam = Math.max(0.6, 0.07 * k.s);
  const pen = k.pen;
  // board seams
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
  pen.lineWidth = seam;
  pen.stroke();
  // battens round the faces and a brace across the front
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

// A lumpy burlap sack on z, r across and h tall; open ones show `inside`.
export function sack(k: Kit, cu: number, cv: number, z: number, r: number, h: number, open: boolean, seed: number, inside: Color = C.coal): void {
  const base = C.burlap;
  k.shadow(cu, cv, r * 1.1, r * 1.1, 0.24, z);
  const e0 = k.ell(cu, cv, z + 0.2, r);
  const e1 = k.ell(cu, cv, z + h, r * (open ? 0.92 : 0.45));
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
  // a stencilled band
  const band = hash(seed, 41) < 0.5 ? '#9c3b32' : '#3f5e7a';
  const y = e0.cy + (e1.cy - e0.cy) * 0.42;
  const half = e0.rx * 0.92;
  pen.beginPath();
  pen.moveTo(e0.cx - half, y);
  pen.quadraticCurveTo(e0.cx, y + e0.ry * 0.8, e0.cx + half, y);
  pen.strokeStyle = band;
  pen.lineWidth = Math.max(0.9, 0.2 * k.s);
  pen.stroke();
  if (open) {
    pen.beginPath();
    pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, 0, Math.PI * 2);
    k.paint(shade(base, 0.15), k.lw);
    pen.beginPath();
    pen.ellipse(e1.cx, e1.cy + e1.ry * 0.1, e1.rx * 0.8, e1.ry * 0.7, 0, 0, Math.PI * 2);
    k.paint(inside, 0);
    // lumps heaped in the mouth
    for (let i = 0; i < 5; i++) {
      const x = e1.cx + (hash(seed, i, 42) - 0.5) * e1.rx * 1.1;
      const yy = e1.cy + (hash(seed, i, 43) - 0.6) * e1.ry * 0.9;
      pen.beginPath();
      pen.ellipse(x, yy, 0.32 * k.s, 0.24 * k.s, hash(seed, i, 44) * 3, 0, Math.PI * 2);
      k.paint(i === 2 && inside !== C.gold ? C.gold : shade(inside, 0.15 + (i & 1) * 0.1), k.thin * 0.7);
    }
  } else {
    const [nx, ny] = k.p(cu, cv, z + h + 0.35);
    pen.beginPath();
    pen.ellipse(nx, ny, e1.rx * 0.8, e1.rx * 0.5, 0, 0, Math.PI * 2);
    k.paint(shade(base, 0.1), k.thin);
    k.line([[cu - r * 0.4, cv, z + h - 0.05], [cu + r * 0.4, cv, z + h - 0.05]], '#7a5a35', Math.max(0.9, 0.14 * k.s));
  }
}

// A bucket on z with a wire bail; `inside` shows in its mouth.
export function bucket(k: Kit, cu: number, cv: number, z: number, r: number, h: number, color: Color = C.ironLight, inside: Color = C.water): void {
  const e0 = k.ell(cu, cv, z, r * 0.78);
  const e1 = k.ell(cu, cv, z + h, r);
  const pts: Pt[] = [[e0.cx - e0.rx, e0.cy], [e1.cx - e1.rx, e1.cy], [e1.cx + e1.rx, e1.cy], [e0.cx + e0.rx, e0.cy]];
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(...pts[0]);
  pen.lineTo(...pts[1]);
  pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, Math.PI, Math.PI * 2);
  pen.lineTo(...pts[3]);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  k.paint(across(k, pts, color), k.lw);
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, 0, Math.PI * 2);
  k.paint(shade(color, -0.3), k.thin);
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy + e1.ry * 0.15, e1.rx * 0.82, e1.ry * 0.7, 0, 0, Math.PI * 2);
  k.paint(inside, 0);
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy - 0.1 * k.s, e1.rx * 0.95, h * 0.55 * k.s, 0, Math.PI * 1.05, Math.PI * 1.95);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, 0.08 * k.s);
  pen.stroke();
}

// ── rock, ore and gold ──────────────────────────────────────────────────────

// A cartoon rock sitting on z: a lumpy outline round (cu, cv), r across
// and h tall, lit from the upper left, a facet line or two.
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
    // the lower half hugs the floor ellipse; the upper rises to the top
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
  if (r * k.s >= 4) {
    // a facet: from the top left round to the right side
    pen.beginPath();
    pen.moveTo(cx - e.rx * 0.15, ty + (base - ty) * 0.15);
    pen.quadraticCurveTo(cx + e.rx * 0.1, base - (base - ty) * 0.35, cx + e.rx * 0.55, base - (base - ty) * 0.15);
    pen.strokeStyle = withAlpha(INK, 0.45);
    pen.lineWidth = Math.max(0.6, line * 0.5);
    pen.stroke();
  }
}

// A gold nugget: a little bright lump with a glint.
export function nugget(k: Kit, u: number, v: number, z: number, r: number, seed: number, glint = true): void {
  rock(k, u, v, z, r, r * 0.9, C.gold, seed, k.thin);
  if (glint && r * k.s >= 2.5) sparkle(k, u - r * 0.2, v, z + r * 0.75, Math.max(0.35, r * 0.7), 0.9);
}

// A heap of lumps round (cu, cv) on z: a dark mound with rocks of the given
// colours on it (gold among them, glinting).
export function heap(k: Kit, cu: number, cv: number, z: number, r: number, h: number, seed: number, colors: readonly Color[]): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx * 0.7, ty, e.cx + e.rx * 0.7, ty, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  k.paint(across(k, [[e.cx - e.rx, 0], [e.cx + e.rx, 0]], '#54453a'), k.lw);
  const n = Math.max(7, Math.round(r * 5));
  const lumps: Array<[number, number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 11) * Math.PI * 2;
    const d = Math.sqrt(hash(seed, i, 12)) * r * 0.72;
    const lu = cu + Math.cos(a) * d;
    const lv = cv + Math.sin(a) * d;
    const lz = z + h * (1 - (d / r) * (d / r)) * 0.8;
    lumps.push([lu, lv, lz, i]);
  }
  lumps.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  for (const [lu, lv, lz, i] of lumps) {
    const c = colors[Math.floor(hash(seed, i, 13) * colors.length)];
    const rr = r * (0.22 + hash(seed, i, 14) * 0.14);
    if (c === C.gold) nugget(k, lu, lv, lz, rr, seed + i);
    else rock(k, lu, lv, lz, rr, rr * 0.9, c, seed + i, k.thin);
  }
}

// ── track ───────────────────────────────────────────────────────────────────

// Rails along u from u0 to u1 centred on v, on sleepers, at height z.
export function rails(k: Kit, u0: number, u1: number, v: number, z: number, gauge = 1.8): void {
  const pen = k.pen;
  // sleepers
  for (let u = u0 + 0.35; u < u1 - 0.3; u += 1.5) k.box(u, v - gauge / 2 - 0.7, z, 0.6, gauge + 1.4, 0.22, C.timberOld, { line: k.thin, stripe: false });
  for (const side of [-1, 1]) {
    const w = v + (side * gauge) / 2;
    k.box(u0, w - 0.12, z + 0.22, u1 - u0, 0.24, 0.26, C.steel, { line: k.thin, stripe: false });
  }
  // a polished head on each rail
  pen.beginPath();
  for (const side of [-1, 1]) {
    const w = v + (side * gauge) / 2;
    const [x0, y0] = k.p(u0, w, z + 0.49);
    const [x1, y1] = k.p(u1, w, z + 0.49);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#e4e6ea';
  pen.lineWidth = Math.max(0.6, 0.07 * k.s);
  pen.stroke();
}

// A spoked wheel in the plane square to n, centred on c: a rim, a hub and
// `spokes` spokes turned by `angle`.
export function wheel(k: Kit, c: P3, n: P3, r: number, spokes: number, angle: number, rim: Color, hub: Color = rim, rimW = 0.18): void {
  const [a, b] = basis(n);
  const steps = r * k.s < 12 ? 14 : 28; // small wheels need fewer points round
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
  const sp: P3[][] = [];
  for (let i = 0; i < spokes; i++) {
    const th = angle + (i / spokes) * Math.PI * 2;
    sp.push([onCircle(c, a, b, r * 0.18, th), onCircle(c, a, b, r * (1 - rimW), th)]);
  }
  pen.beginPath();
  for (const [p, q] of sp) {
    const [x0, y0] = k.p(...p);
    const [x1, y1] = k.p(...q);
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

// ── wood ────────────────────────────────────────────────────────────────────

// A log lying along u from u0 to u1, its axis at (cv, cz), radius r: bark
// round it, the sawn +u end showing its rings.
export function logU(k: Kit, u0: number, u1: number, cv: number, cz: number, r: number, bark: Color = C.timberOld): void {
  const a = ring(k, [u0, cv, cz], [1, 0, 0], r, 16);
  const b = ring(k, [u1, cv, cz], [1, 0, 0], r, 16);
  const sil = hull([...a, ...b]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of sil) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const g = k.pen.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(bark, 0.16));
  g.addColorStop(0.5, bark);
  g.addColorStop(1, shade(bark, -0.3));
  fillPts(k, sil, g, k.lw);
  if (k.fine) {
    // bark seams along the log
    for (let i = 0; i < 3; i++) {
      const th = 1.9 + i * 0.7;
      const [p0, p1] = [ring(k, [u0 + 0.4, cv, cz], [1, 0, 0], r, 16), ring(k, [u1 - 0.4, cv, cz], [1, 0, 0], r, 16)];
      const ix = Math.floor(((th / (Math.PI * 2)) * 16) % 16);
      k.pen.beginPath();
      k.pen.moveTo(...p0[ix]);
      k.pen.lineTo(...p1[ix]);
      k.pen.strokeStyle = shade(bark, -0.35);
      k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
      k.pen.stroke();
    }
  }
  fillPts(k, b, '#d9b07a', k.thin);
  if (r * k.s >= 3) {
    fillPts(k, ring(k, [u1 + 0.01, cv, cz], [1, 0, 0], r * 0.62, 14), '#c99a62', 0);
    fillPts(k, ring(k, [u1 + 0.02, cv, cz], [1, 0, 0], r * 0.28, 10), '#b98a52', 0);
  }
}

// A log lying along v (the sawn +v end toward the viewer).
export function logV(k: Kit, v0: number, v1: number, cu: number, cz: number, r: number, bark: Color = C.timberOld): void {
  const a = ring(k, [cu, v0, cz], [0, 1, 0], r, 16);
  const b = ring(k, [cu, v1, cz], [0, 1, 0], r, 16);
  const sil = hull([...a, ...b]);
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const [, y] of sil) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const g = k.pen.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, shade(bark, 0.16));
  g.addColorStop(0.5, bark);
  g.addColorStop(1, shade(bark, -0.3));
  fillPts(k, sil, g, k.lw);
  fillPts(k, b, '#d9b07a', k.thin);
  if (r * k.s >= 3) {
    fillPts(k, ring(k, [cu, v1 + 0.01, cz], [0, 1, 0], r * 0.62, 14), '#c99a62', 0);
    fillPts(k, ring(k, [cu, v1 + 0.02, cz], [0, 1, 0], r * 0.28, 10), '#b98a52', 0);
  }
}

// A coil of rope lying on z.
export function ropeCoil(k: Kit, cu: number, cv: number, z: number, r: number): void {
  for (let i = 0; i < 3; i++) {
    const e = k.ell(cu, cv, z + 0.2 + i * 0.28, r * (1 - i * 0.08));
    const pen = k.pen;
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(1.4, 0.32 * k.s + k.thin);
    pen.stroke();
    pen.strokeStyle = shade(C.rope, i === 2 ? 0.08 : -0.04 * i);
    pen.lineWidth = Math.max(0.8, 0.32 * k.s);
    pen.stroke();
  }
}

export const LEDGERS: readonly Color[] = ['#7a3a2a', '#3f4e3a', '#5a3a52', '#8a6a3a', '#34465e', '#6e2e2e', '#4a3a2a', '#a07a4a'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const tops: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.45 + hash(seed, i, 61) * 0.4;
    if (u + w > u1) break;
    const h = hmax * (0.7 + hash(seed, i, 63) * 0.28);
    const c = LEDGERS[Math.floor(hash(seed, i, 64) * LEDGERS.length)];
    const lean = hash(seed, i, 65) < 0.08 && i > 0 ? 0.35 : 0;
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
      for (const f of [0.2, 0.8]) {
        const [x0, y0] = k.p(a[0] + (q[3][0] - a[0]) * f, v, a[2] + hh * f);
        const [x1, y1] = k.p(b[0] + (q[2][0] - b[0]) * f, v, b[2] + hh * f);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = '#e8c87a99';
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

// Dynamite: a bundle of red sticks standing on z, tied with a cord, a fuse
// curling off the top (cartoon).
export function dynamite(k: Kit, cu: number, cv: number, z: number, n = 3, h = 1.7): void {
  const r = 0.24;
  const at: Array<[number, number]> = n === 1 ? [[0, 0]] : n === 2 ? [[-0.24, 0.1], [0.24, -0.1]] : [[-0.26, 0.18], [0.26, 0.18], [0, -0.22], [0.5, -0.3]].slice(0, n) as Array<[number, number]>;
  const sorted = [...at].sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  for (const [du, dv] of sorted) {
    k.cyl(cu + du, cv + dv, z, r, h, C.red, { line: k.thin });
    k.disc(cu + du, cv + dv, z + h, r * 0.55, '#e8d6b0', 0);
  }
  // the cord round the middle
  const e = k.ell(cu, cv, z + h * 0.55, 0.55);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0.1, Math.PI - 0.1);
  k.pen.strokeStyle = C.rope;
  k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  k.pen.stroke();
  // the fuse off the front stick
  const [du, dv] = sorted[sorted.length - 1];
  k.line([[cu + du, cv + dv, z + h], [cu + du + 0.15, cv + dv, z + h + 0.5], [cu + du + 0.55, cv + dv, z + h + 0.7], [cu + du + 0.7, cv + dv, z + h + 1.0]], '#3a2a20', Math.max(0.8, 0.09 * k.s));
}
