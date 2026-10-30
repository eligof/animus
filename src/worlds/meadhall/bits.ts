import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, circle, hash, withAlpha } from './kit.ts';

// Small things the hall is full of, drawn in any frame: flames and candles,
// rounded stones, fieldstone blocks and logs, fur, stools and benches,
// barrels, drinking horns, round shields, woven zigzag borders, and the
// helpers they share (hull, ring, fillPts, blot).

// ── screen-space helpers ─────────────────────────────────────────────────────

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

// ── fire ─────────────────────────────────────────────────────────────────────

// Flames as nested tongues in the plane v = n, `phase` sets their sway and
// `lick` (0..1) how far they reach this moment.
export function flames(k: Kit, a: number, n: number, z: number, scale: number, phase = 0, lick = 0.5): void {
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
  const tall = (i: number) => 0.85 + 0.3 * lick * (0.5 + 0.5 * Math.sin(phase * 3.1 + i * 2.3));
  tongue(-1.2 * scale, 1.1 * scale, 3.4 * scale * tall(0), sw(0), C.ember);
  tongue(1.1 * scale, 1.0 * scale, 3.0 * scale * tall(1), sw(1), C.ember);
  tongue(0, 1.5 * scale, 4.4 * scale * tall(2), sw(2), C.ember);
  tongue(-0.9 * scale, 0.7 * scale, 2.4 * scale * tall(3), sw(3), C.flame);
  tongue(0.8 * scale, 0.7 * scale, 2.2 * scale * tall(4), sw(4), C.flame);
  tongue(0, 1.0 * scale, 3.2 * scale * tall(5), sw(5), C.flame);
  tongue(0, 0.5 * scale, 1.8 * scale * tall(6), sw(6), C.flameHot);
}

// A candle's flame at (u, v, z): a teardrop with a hot core; `f` (0..1)
// stretches it as it flickers.
export function flame(k: Kit, u: number, v: number, z: number, size = 1, f = 0.5, glow = 0.45): void {
  const [x, y] = k.p(u, v, z);
  const h = (0.42 + 0.14 * f) * k.s * size;
  const w = 0.17 * k.s * size;
  k.halo(u, v, z + 0.2, 1.7 * size, '#ffc070', glow * (0.85 + 0.3 * f));
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x, y - h);
  pen.quadraticCurveTo(x + w * 1.5, y + h * 0.15, x, y + h * 0.45);
  pen.quadraticCurveTo(x - w * 1.5, y + h * 0.15, x, y - h);
  pen.fillStyle = C.flame;
  pen.fill();
  pen.beginPath();
  pen.ellipse(x, y + h * 0.15, w * 0.5, h * 0.28, 0, 0, Math.PI * 2);
  pen.fillStyle = C.flameHot;
  pen.fill();
}

// A tallow candle standing on z (its flame drawn by `flame`, or `lit`).
export function candle(k: Kit, u: number, v: number, z: number, h: number, lit = true): void {
  k.cyl(u, v, z, 0.3, h, C.cream);
  k.line([[u - 0.12, v + 0.3, z + h], [u - 0.15, v + 0.32, z + h - 0.6]], shade(C.cream, -0.12), Math.max(0.7, 0.08 * k.s));
  if (lit) flame(k, u, v, z + h + 0.4, 1, 0.5);
}

// An iron dish on a spike holding a candle: the holder only.
export function candleDish(k: Kit, u: number, v: number, z: number): void {
  k.disc(u, v, z + 0.05, 0.6, C.iron, k.thin);
  k.disc(u, v, z + 0.12, 0.45, C.ironDark, 0);
}

// ── stone and wood ───────────────────────────────────────────────────────────

// A rounded stone sitting on z: a squashed dome, lit on its upper left.
export function pebble(k: Kit, u: number, v: number, z: number, r: number, h: number, color: Color, line = k.thin): void {
  const e = k.ell(u, v, z, r);
  const [, ty] = k.p(u, v, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx, ty + (e.cy - ty) * 0.25, e.cx - e.rx * 0.45, ty, e.cx, ty);
  pen.bezierCurveTo(e.cx + e.rx * 0.45, ty, e.cx + e.rx, ty + (e.cy - ty) * 0.25, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, ty + (e.cy - ty) * 0.35, 0, e.cx, e.cy, e.rx * 1.25);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.25));
  k.paint(g, line);
}

// A log lying along u from u0 to u1 at (v, z) (its axis), radius r: bark,
// and its cut end showing rings on the +u end.
export function log(k: Kit, u0: number, u1: number, v: number, z: number, r: number, bark: Color = C.log): void {
  const top: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const th = (i / 8) * Math.PI;
    top.push(k.p(u0, v + Math.cos(th) * r, z + Math.sin(th) * r));
  }
  const pts: Pt[] = [];
  for (let i = 0; i <= 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    pts.push(k.p(u0, v + Math.cos(th) * r, z + Math.sin(th) * r), k.p(u1, v + Math.cos(th) * r, z + Math.sin(th) * r));
  }
  const body = hull(pts);
  const xs = body.map((p) => p[1]);
  const g = k.pen.createLinearGradient(0, Math.min(...xs), 0, Math.max(...xs));
  g.addColorStop(0, shade(bark, 0.15));
  g.addColorStop(0.5, bark);
  g.addColorStop(1, shade(bark, -0.3));
  fillPts(k, body, g, k.lw);
  if (k.fine) {
    k.line([[u0 + 0.4, v - r * 0.2, z + r * 0.8], [u1 - 0.5, v - r * 0.15, z + r * 0.85]], shade(bark, -0.3), Math.max(0.6, 0.06 * k.s));
  }
  const end = ring(k, [u1, v, z], [1, 0, 0], r, 16);
  fillPts(k, end, '#d9b07a', k.thin);
  fillPts(k, ring(k, [u1 + 0.01, v, z], [1, 0, 0], r * 0.55, 12), '#c39058', 0);
  fillPts(k, ring(k, [u1 + 0.02, v, z], [1, 0, 0], r * 0.2, 8), '#b27c48', 0);
}

// ── fur ──────────────────────────────────────────────────────────────────────

// A pelt's outline: the polygon of frame points with a tufted edge (small
// points outward between corners), filled and inked.
export function furry(k: Kit, pts: ReadonlyArray<P3>, fill: Color | Gradient, seed: number, tuft = 0.28, line = k.lw): void {
  const sp = pts.map((q) => k.p(...q));
  let area = 0;
  for (let i = 0; i < sp.length; i++) {
    const q = sp[(i + 1) % sp.length];
    area += sp[i][0] * q[1] - q[0] * sp[i][1];
  }
  const sgn = area > 0 ? 1 : -1; // outward is (dy, -dx) on a clockwise screen polygon
  const out: Pt[] = [];
  for (let i = 0; i < sp.length; i++) {
    const pa = sp[i];
    const pb = sp[(i + 1) % sp.length];
    const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]);
    const n = Math.max(1, Math.round(len / Math.max(3, 0.55 * k.s)));
    const nx = (sgn * (pb[1] - pa[1])) / (len || 1);
    const ny = (-sgn * (pb[0] - pa[0])) / (len || 1);
    for (let j = 0; j < n; j++) {
      const t0 = j / n;
      const th = (j + 0.5) / n;
      out.push([pa[0] + (pb[0] - pa[0]) * t0, pa[1] + (pb[1] - pa[1]) * t0]);
      const d = tuft * k.s * (0.6 + hash(seed, i, j) * 0.8);
      out.push([pa[0] + (pb[0] - pa[0]) * th + nx * d, pa[1] + (pb[1] - pa[1]) * th + ny * d]);
    }
  }
  fillPts(k, out, fill, line);
}

// ── seats ────────────────────────────────────────────────────────────────────

// A three-legged stool, its seat at h.
export function stool(k: Kit, cu: number, cv: number, h: number, wood: Color = C.timber): void {
  k.shadow(cu, cv, 1.3, 1.3, 0.24);
  for (const a of [0.6, 2.7, 4.6]) {
    k.rod([[cu + Math.cos(a) * 0.45, cv + Math.sin(a) * 0.45, h - 0.3], [cu + Math.cos(a) * 1.0, cv + Math.sin(a) * 1.0, 0]], shade(wood, -0.1), 0.2);
  }
  k.cyl(cu, cv, h - 0.45, 1.05, 0.45, wood);
}

// A plank bench along u from u0 to u1, v0 to v1 deep, seat at h, on two
// splayed slab legs.
export function bench(k: Kit, u0: number, u1: number, v0: number, v1: number, h: number, wood: Color = C.timber): void {
  k.shadow((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) * 0.55, (v1 - v0) * 0.9, 0.22);
  for (const u of [u0 + 0.9, u1 - 1.5]) k.box(u, v0 + 0.15, 0, 0.6, v1 - v0 - 0.3, h - 0.5, shade(wood, -0.12), { line: k.thin, stripe: false });
  k.box(u0, v0, h - 0.5, u1 - u0, v1 - v0, 0.5, wood);
}

// ── drinking horns ───────────────────────────────────────────────────────────

// A drinking horn along a centreline of frame points from its mouth to its
// tip, r at the mouth; a gold band at the mouth, mead inside when it is
// held mouth up; `ink` its outline.
export function horn(k: Kit, line: ReadonlyArray<P3>, r: number, full = false, ink = k.lw): void {
  const pts = line.map((p) => k.p(...p));
  const left: Pt[] = [];
  const right: Pt[] = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dx, dy) || 1;
    const rr = r * k.s * (1 - i / (n - 1)) ** 0.85 + 0.2;
    left.push([pts[i][0] - (dy / l) * rr, pts[i][1] + (dx / l) * rr]);
    right.push([pts[i][0] + (dy / l) * rr, pts[i][1] - (dx / l) * rr]);
  }
  const body = [...left, ...right.reverse()];
  const xs = body.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(C.horn, 0.12));
  g.addColorStop(0.55, C.horn);
  g.addColorStop(1, '#b89c6a');
  fillPts(k, body, g, ink);
  // the tip darkens, the band at the mouth
  const tip = Math.max(1, Math.floor(n * 0.7));
  k.line(line.slice(tip), '#7a5a3a', Math.max(1, r * 0.55 * k.s));
  const [m0, m1] = [line[0], line[1]];
  const dir: P3 = [m1[0] - m0[0], m1[1] - m0[1], m1[2] - m0[2]];
  const lb = Math.hypot(...dir) || 1;
  const band: P3 = [m0[0] + (dir[0] / lb) * r * 0.45, m0[1] + (dir[1] / lb) * r * 0.45, m0[2] + (dir[2] / lb) * r * 0.45];
  fillPts(k, hull([...ring(k, m0, dir, r * 1.02, 14), ...ring(k, band, dir, r * 0.95, 14)]), C.gold, Math.min(k.thin, ink));
  fillPts(k, ring(k, m0, dir, r, 16), full ? '#c98a2a' : '#3a2416', Math.min(k.thin, ink));
  if (full) fillPts(k, ring(k, [m0[0], m0[1], m0[2] + 0.01], dir, r * 0.55, 12), '#e8b04a', 0);
}

// ── knot rules ───────────────────────────────────────────────────────────────

// A short run of zigzag (a woven border) on the plane v = n.
export function zigzag(k: Kit, a0: number, a1: number, n: number, z: number, h: number, color: Color, width: number): void {
  const pts: P3[] = [];
  const step = h * 1.1;
  let up = false;
  for (let a = a0; a <= a1 + 1e-6; a += step / 2) {
    pts.push([a, n, up ? z + h / 2 : z - h / 2]);
    up = !up;
  }
  k.line(pts, color, width);
}

// A soft shade (or light) on the upright plane v = n: an ellipse ru along
// by rz up, falling off from its middle.
export function blot(k: Kit, cu: number, n: number, cz: number, ru: number, rz: number, color: Color, a: number, op: 'source-over' | 'screen' = 'source-over'): void {
  const [cx, cy] = k.p(cu, n, cz);
  const [ux, uy] = k.p(cu + ru, n, cz);
  const [zx, zy] = k.p(cu, n, cz + rz);
  const pen = k.pen;
  pen.save();
  pen.globalCompositeOperation = op;
  pen.transform(ux - cx, uy - cy, zx - cx, zy - cy, cx, cy);
  const g = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    g.addColorStop(t, withAlpha(color, a * (1 - t) * (1 - t)));
  }
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(0, 0, 1, 0, Math.PI * 2);
  pen.fill();
  pen.restore();
}

// A block of fieldstones: a box in stone with the stones' outlines on the
// faces the viewer sees.
export function stoneBlock(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, seed: number, color: Color = C.stone): void {
  k.box(u0, v0, z0, du, dv, dz, color, { stripe: false });
  const pen = k.pen;
  pen.beginPath();
  const course = 1.3;
  for (let r = 0; z0 + (r + 1) * course <= z0 + dz + 0.01; r++) {
    const z = z0 + r * course;
    // front face (v = v0 + dv)
    let u = u0 + (r & 1 ? 0.6 : 0);
    let i = 0;
    while (u < u0 + du - 0.3) {
      const w = 1.2 + hash(seed, r * 31 + i, 1) * 1.0;
      const b = Math.min(u0 + du - 0.12, u + w - 0.15);
      k.trace([[Math.max(u0 + 0.12, u + 0.08), v0 + dv, z + 0.1], [b, v0 + dv, z + 0.1], [b, v0 + dv, z + course - 0.1], [Math.max(u0 + 0.12, u + 0.08), v0 + dv, z + course - 0.1]], 0.4);
      u += w;
      i++;
    }
    // the +u end
    let w0 = v0 + (r & 1 ? 0 : 0.5);
    while (w0 < v0 + dv - 0.3) {
      const w = 1.1 + hash(seed, r * 31 + i, 2) * 0.9;
      const b = Math.min(v0 + dv - 0.12, w0 + w - 0.15);
      k.trace([[u0 + du, Math.max(v0 + 0.12, w0 + 0.08), z + 0.1], [u0 + du, b, z + 0.1], [u0 + du, b, z + course - 0.1], [u0 + du, Math.max(v0 + 0.12, w0 + 0.08), z + course - 0.1]], 0.4);
      w0 += w;
      i++;
    }
  }
  pen.fillStyle = '#a39e9855';
  pen.fill();
  pen.strokeStyle = withAlpha(INK, 0.6);
  pen.lineWidth = k.thin * 0.7;
  pen.stroke();
}

// ── shields ──────────────────────────────────────────────────────────────────

// Plain colours for shields, banners and swags (never an emblem).
export const CLOTH = [C.red, C.blue, C.green, C.ochre, C.cream] as const;

// A round shield hung flat on the plane v = n, centred (a, z), radius r: a
// plain colour split in halves or quarters (or a ring or a band of a
// second) by `seed`, boards, an iron rim and boss; lit from the upper left,
// its shadow on what it hangs on and firelight along its lower rim.
export function shieldFace(k: Kit, a: number, n: number, z: number, r: number, seed: number): void {
  const { pen, s } = k;
  const c1 = CLOTH[Math.floor(hash(seed, 14) * CLOTH.length)];
  let c2 = CLOTH[Math.floor(hash(seed, 15) * CLOTH.length)];
  if (c2 === c1) c2 = CLOTH[(CLOTH.indexOf(c1) + 2) % CLOTH.length];
  const pattern = Math.floor(hash(seed, 16) * 5);
  blot(k, a + r * 0.17, n - 0.4, z - r * 0.26, r * 1.05, r * 1.15, '#0c0604', 0.5);
  k.face(a, n, z, r, c1, k.lw);
  pen.save();
  pen.beginPath();
  k.trace(circle(a, n, z, r - 0.05));
  pen.clip();
  const half = (th0: number, c: Color) => k.poly([[a, n, z], ...circle(a, n, z, r, 16, th0, th0 + Math.PI)], c, 0);
  if (pattern === 0) half(Math.PI / 2, c2);
  else if (pattern === 1) half(Math.PI * 0.75, c2);
  else if (pattern === 2) {
    k.poly([[a, n, z], ...circle(a, n, z, r, 8, 0, Math.PI / 2)], c2, 0);
    k.poly([[a, n, z], ...circle(a, n, z, r, 8, Math.PI, Math.PI * 1.5)], c2, 0);
  } else if (pattern === 3) {
    k.face(a, n, z, r * 0.78, c2, 0);
    k.face(a, n, z, r * 0.56, c1, 0);
  } else k.rect(a - r, z - r * 0.2, a + r, z + r * 0.2, n, c2, 0);
  // boards, and the light from the upper left
  if (k.fine) {
    pen.beginPath();
    for (let du = -r + r * 0.39; du < r; du += r * 0.39) {
      const [x0, y0] = k.p(a + du, n, z - r);
      const [x1, y1] = k.p(a + du, n, z + r);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#00000022';
    pen.lineWidth = Math.max(0.6, 0.06 * s);
    pen.stroke();
  }
  const [hx, hy] = k.p(a - r * 0.4, n, z + r * 0.45);
  const g = pen.createRadialGradient(hx, hy, 0, hx, hy, r * s * 1.6);
  g.addColorStop(0, '#fff4dc40');
  g.addColorStop(0.5, '#fff4dc10');
  g.addColorStop(1, '#00000030');
  k.poly(circle(a, n, z, r), g, 0);
  pen.restore();
  // the iron rim, riveted
  pen.beginPath();
  k.trace(circle(a, n, z, r - 0.12));
  pen.strokeStyle = C.ironLight;
  pen.lineWidth = Math.max(1, 0.24 * s);
  pen.stroke();
  pen.beginPath();
  k.trace(circle(a, n, z, r));
  k.paint(null, k.lw);
  if (k.fine) {
    pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const th = (i / 10) * Math.PI * 2 + 0.3;
      const [x, y] = k.p(a + Math.cos(th) * (r - 0.12), n, z + Math.sin(th) * (r - 0.12));
      pen.moveTo(x + 0.1 * s, y);
      pen.arc(x, y, 0.1 * s, 0, Math.PI * 2);
    }
    pen.fillStyle = '#3f434a';
    pen.fill();
  }
  // the boss
  k.face(a, n + 0.1, z, r * 0.27, C.iron, k.thin);
  const [bx, by] = k.p(a - r * 0.08, n + 0.1, z + r * 0.09);
  pen.beginPath();
  pen.arc(bx, by, r * 0.1 * s, 0, Math.PI * 2);
  pen.fillStyle = '#c3c7cd';
  pen.fill();
  // firelight along the lower rim
  k.line(circle(a, n + 0.02, z, r + 0.05, 14, Math.PI * 1.15, Math.PI * 1.85), '#ffa04a99', Math.max(0.8, 0.16 * s));
}

// ── barrels and sacks ────────────────────────────────────────────────────────

// A barrel standing at (cu, cv), radius r and h tall: staves bulging a
// little, two iron hoops, a lid of boards.
export function barrel(k: Kit, cu: number, cv: number, r: number, h: number, wood: Color = '#8a5e38'): void {
  k.shadow(cu, cv, r * 1.15, r * 1.15, 0.28);
  // the bulge: a wider band in the middle under the outline
  k.cyl(cu, cv, 0, r * 0.92, h, wood, { top: shade(wood, 0.12) });
  k.cyl(cu, cv, h * 0.25, r, h * 0.5, wood, { top: wood, line: 0 });
  const pen = k.pen;
  for (const z of [h * 0.16, h * 0.8]) {
    const e = k.ell(cu, cv, z, r * 0.95);
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(1.4, 0.3 * k.s);
    pen.stroke();
    pen.strokeStyle = C.ironDark;
    pen.lineWidth = Math.max(1, 0.2 * k.s);
    pen.stroke();
  }
  // the outline over the bulge, and the lid
  const side = k.ell(cu, cv, 0, r * 0.92);
  pen.beginPath();
  pen.ellipse(side.cx, side.cy, side.rx, side.ry, side.rot, 0, Math.PI);
  k.paint(null, k.lw);
  k.disc(cu, cv, h, r * 0.92, shade(wood, 0.14), k.lw);
  if (k.fine) {
    k.line([[cu - r * 0.6, cv - r * 0.3, h + 0.01], [cu + r * 0.6, cv + r * 0.3, h + 0.01]], shade(wood, -0.25), 0.06 * k.s);
    const e = k.ell(cu, cv, h + 0.02, r * 0.7);
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    k.paint(null, k.thin * 0.5);
  }
}

// A sack of grain slumped on the floor, its neck tied off and flopped over:
// a squat soft lump, wider than tall.
export function sack(k: Kit, cu: number, cv: number, r: number, h: number, cloth: Color = '#b49a6c'): void {
  k.shadow(cu, cv, r * 1.15, r, 0.26);
  pebble(k, cu, cv, 0, r, h * 0.62, cloth, k.lw);
  // a seam down its front, the neck tied and folded over
  if (k.fine) k.line([[cu + r * 0.2, cv + r * 0.75, h * 0.08], [cu + r * 0.1, cv + r * 0.6, h * 0.5]], shade(cloth, -0.2), 0.07 * k.s);
  k.poly([[cu - r * 0.35, cv, h * 0.58], [cu + r * 0.3, cv, h * 0.6], [cu + r * 0.25, cv, h * 0.82], [cu + r * 0.75, cv + 0.2, h * 0.7], [cu + r * 0.6, cv + 0.25, h * 0.95], [cu - r * 0.3, cv, h * 0.86]], shade(cloth, -0.05), k.thin, 0.15);
  k.line([[cu - r * 0.36, cv + 0.05, h * 0.66], [cu + r * 0.3, cv + 0.05, h * 0.68]], '#7a5a32', Math.max(0.9, 0.16 * k.s));
}
