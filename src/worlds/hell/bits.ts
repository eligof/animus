import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things hell is full of, drawn in any frame: skulls and bones,
// candles of black wax, flames, chains, grimoires, crystals of brimstone
// and obsidian, rocks.

// ── skulls and bones ─────────────────────────────────────────────────────────

export type SkullOpts = { eyes?: Color; tilt?: number; jaw?: boolean; base?: Color; line?: number };

// A cartoon skull facing the viewer, its cranium r units round, sitting on
// (u, v, z) (the bottom of its jaw). `eyes` lights the sockets.
export function skull(k: Kit, u: number, v: number, z: number, r: number, o: SkullOpts = {}): void {
  const R = r * k.s;
  const [bx, by] = k.p(u, v, z);
  const cx = bx;
  const cy = by - R * 1.05;
  const pen = k.pen;
  const base = o.base ?? C.bone;
  const line = o.line ?? (R < 4 ? k.thin : k.lw);
  pen.save();
  if (o.tilt) {
    pen.translate(bx, by);
    pen.rotate(o.tilt);
    pen.translate(-bx, -by);
  }
  // cranium and jaw as one outline
  const jaw = o.jaw !== false;
  pen.beginPath();
  pen.arc(cx, cy, R, Math.PI * 0.82, Math.PI * 0.18, false);
  if (jaw) {
    pen.lineTo(cx + R * 0.62, cy + R * 0.78);
    pen.quadraticCurveTo(cx + R * 0.6, cy + R * 1.05, cx + R * 0.3, cy + R * 1.05);
    pen.lineTo(cx - R * 0.3, cy + R * 1.05);
    pen.quadraticCurveTo(cx - R * 0.6, cy + R * 1.05, cx - R * 0.62, cy + R * 0.78);
  }
  pen.closePath();
  const g = pen.createRadialGradient(cx - R * 0.4, cy - R * 0.45, 0, cx, cy, R * 1.5);
  g.addColorStop(0, shade(base, 0.25));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.28));
  k.paint(g, line);
  if (R < 2.2) {
    // too small for a face: two dark dots
    for (const d of [-1, 1]) {
      pen.beginPath();
      pen.arc(cx + d * R * 0.4, cy + R * 0.15, Math.max(0.5, R * 0.28), 0, Math.PI * 2);
      pen.fillStyle = o.eyes ?? INK;
      pen.fill();
    }
    pen.restore();
    return;
  }
  // sockets, the nose, the teeth
  for (const d of [-1, 1]) {
    pen.beginPath();
    pen.ellipse(cx + d * R * 0.4, cy + R * 0.18, R * 0.27, R * 0.31, d * 0.25, 0, Math.PI * 2);
    pen.fillStyle = o.eyes ?? INK;
    pen.fill();
  }
  if (o.eyes) {
    for (const d of [-1, 1]) {
      pen.beginPath();
      pen.arc(cx + d * R * 0.4, cy + R * 0.2, R * 0.12, 0, Math.PI * 2);
      pen.fillStyle = '#fff6c8';
      pen.fill();
    }
  }
  pen.beginPath();
  pen.moveTo(cx, cy + R * 0.42);
  pen.lineTo(cx - R * 0.12, cy + R * 0.62);
  pen.lineTo(cx + R * 0.12, cy + R * 0.62);
  pen.closePath();
  pen.fillStyle = INK;
  pen.fill();
  if (jaw && R >= 4) {
    pen.beginPath();
    pen.moveTo(cx - R * 0.42, cy + R * 0.82);
    pen.lineTo(cx + R * 0.42, cy + R * 0.82);
    for (const f of [-0.2, 0, 0.2]) {
      pen.moveTo(cx + f * R, cy + R * 0.72);
      pen.lineTo(cx + f * R, cy + R * 0.95);
    }
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(0.7, k.thin * 0.7);
    pen.stroke();
  }
  pen.restore();
}

// A bone from a to b (frame points), w units thick, knobbed at both ends.
export function bone(k: Kit, a: P3, b: P3, w: number, color: Color = C.bone): void {
  const A = k.p(...a);
  const B = k.p(...b);
  const l = Math.hypot(B[0] - A[0], B[1] - A[1]) || 1;
  const nx = -(B[1] - A[1]) / l;
  const ny = (B[0] - A[0]) / l;
  const W = Math.max(1.2, w * k.s);
  const knobs: Pt[] = [];
  for (const P of [A, B]) for (const d of [-1, 1]) knobs.push([P[0] + nx * d * W * 0.45, P[1] + ny * d * W * 0.45]);
  const pen = k.pen;
  const pass = (c: Color, grow: number) => {
    pen.beginPath();
    pen.moveTo(A[0], A[1]);
    pen.lineTo(B[0], B[1]);
    pen.strokeStyle = c;
    pen.lineWidth = W + grow * 2;
    pen.lineCap = 'butt';
    pen.stroke();
    pen.beginPath();
    for (const [x, y] of knobs) {
      pen.moveTo(x + W * 0.55 + grow, y);
      pen.arc(x, y, W * 0.55 + grow, 0, Math.PI * 2);
    }
    pen.fillStyle = c;
    pen.fill();
  };
  pass(INK, k.thin * 0.8);
  pass(color, 0);
  // a shaded underside along the shaft
  pen.beginPath();
  pen.moveTo(A[0] + nx * W * 0.25, A[1] + ny * W * 0.25 + W * 0.15);
  pen.lineTo(B[0] + nx * W * 0.25, B[1] + ny * W * 0.25 + W * 0.15);
  pen.strokeStyle = withAlpha(shade(color, -0.35), 0.6);
  pen.lineWidth = W * 0.3;
  pen.stroke();
  pen.lineCap = 'round';
}

// A heap of bones and a skull or two round (cu, cv) on z, r units across.
export function bonePile(k: Kit, cu: number, cv: number, z: number, r: number, seed: number, skulls = 2): void {
  k.shadow(cu, cv, r * 1.1, r * 0.9, 0.28, z);
  const n = Math.round(4 + r * 3);
  const items: Array<{ d: number; f: () => void }> = [];
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 1) * Math.PI * 2;
    const rr = Math.sqrt(hash(seed, i, 2)) * r * 0.8;
    const u = cu + Math.cos(a) * rr;
    const w = cv + Math.sin(a) * rr;
    const zz = z + (1 - rr / r) * r * 0.45;
    const th = hash(seed, i, 3) * Math.PI;
    const L = 0.8 + hash(seed, i, 4) * 0.9;
    const tone = hash(seed, i, 5) < 0.3 ? C.boneShade : C.bone;
    items.push({ d: u + w + zz, f: () => bone(k, [u - Math.cos(th) * L, w - Math.sin(th) * L, zz + 0.1], [u + Math.cos(th) * L, w + Math.sin(th) * L, zz + 0.25], 0.32, tone) });
  }
  for (let i = 0; i < skulls; i++) {
    const a = hash(seed, i, 6) * Math.PI * 2;
    const rr = hash(seed, i, 7) * r * 0.45;
    const u = cu + Math.cos(a) * rr;
    const w = cv + Math.sin(a) * rr;
    const zz = z + (1 - rr / r) * r * 0.4;
    items.push({ d: u + w + zz + 0.5, f: () => skull(k, u, w, zz, 0.62 + hash(seed, i, 8) * 0.2, { tilt: (hash(seed, i, 9) - 0.5) * 0.6 }) });
  }
  items.sort((p, q) => p.d - q.d);
  for (const it of items) it.f();
}

// ── candles and fire ─────────────────────────────────────────────────────────

// A candle of black (or bone) wax h tall on z, drips down its side, lit.
export function candle(k: Kit, u: number, v: number, z: number, h: number, r = 0.32, wax: Color = C.wax, lit = true): void {
  k.cyl(u, v, z, r, h, wax, { line: k.thin });
  if (k.s * r >= 1.6) {
    // drips over the rim on the lit side
    const drips: Array<[number, number]> = [[-0.6, 0.45], [0.1, 0.3], [0.55, 0.6]];
    for (const [f, l] of drips) {
      const a = Math.PI * 0.5 + f;
      k.line([[u + Math.cos(a) * r, v + Math.sin(a) * r, z + h], [u + Math.cos(a) * r, v + Math.sin(a) * r, z + h - l * h * 0.5]], shade(wax, 0.12), Math.max(0.8, r * 0.5 * k.s));
    }
  }
  if (!lit) return;
  flame(k, u, v, z + h + 0.05, Math.max(0.24, r * 0.8), Math.max(0.6, r * 2.4), 0);
  k.halo(u, v, z + h + 0.6, 1.8, '#ffb060', 0.42);
}

// One flame standing on (u, v, z): w units wide, h tall, its tip swayed by
// `sway` (units across the screen).
export function flame(k: Kit, u: number, v: number, z: number, w: number, h: number, sway: number, hot: readonly [Color, Color, Color] = [C.fire, C.flame, C.flameHot]): void {
  const [x, y] = k.p(u, v, z);
  const W = w * k.s;
  const H = h * k.s;
  const S = sway * k.s;
  const pen = k.pen;
  const tongue = (f: number, c: Color) => {
    const ww = W * f;
    const hh = H * (0.45 + 0.55 * f);
    pen.beginPath();
    pen.moveTo(x - ww, y);
    pen.bezierCurveTo(x - ww * 1.1, y - hh * 0.45, x + S * f * 0.4 - ww * 0.3, y - hh * 0.7, x + S * f, y - hh);
    pen.bezierCurveTo(x + S * f * 0.4 + ww * 0.3, y - hh * 0.7, x + ww * 1.1, y - hh * 0.45, x + ww, y);
    pen.quadraticCurveTo(x, y + ww * 0.6, x - ww, y);
    pen.closePath();
    pen.fillStyle = c;
    pen.fill();
  };
  tongue(1, hot[0]);
  tongue(0.66, hot[1]);
  tongue(0.34, hot[2]);
}

// A bed of fire across a bowl round (cu, cv) on z, r units across, its
// tongues h tall; `phase` sets their sway (0 for a still picture).
export function fire(k: Kit, cu: number, cv: number, z: number, r: number, h: number, phase: number, seed = 0, hot?: readonly [Color, Color, Color]): void {
  const n = Math.max(3, Math.round(r * 2.2));
  const order: Array<{ d: number; i: number }> = [];
  for (let i = 0; i < n; i++) order.push({ d: hash(seed, i, 11), i });
  // back tongues first, the tallest in the middle
  for (let i = 0; i < n; i++) {
    const f = (i + 0.5) / n;
    const du = (f - 0.5) * 2 * r * 0.75;
    const mid = 1 - Math.abs(f - 0.5) * 1.3;
    const hh = h * (0.5 + 0.5 * mid) * (0.85 + 0.3 * hash(seed, i, 12)) * (1 + 0.12 * Math.sin(phase * 7 + i * 2.1));
    const sway = Math.sin(phase * 5.3 + i * 1.7) * 0.25 * h * 0.3;
    flame(k, cu + du * 0.7, cv - du * 0.7 - 0.2, z, r * 0.42, hh, sway, hot);
  }
}

// Nested tongues in the plane v = n (fire in a hearth, seen face on).
export function flames(k: Kit, a: number, n: number, z: number, scale: number, phase = 0): void {
  const tongue = (du: number, w: number, h: number, sway: number, c: Color) => {
    k.poly([[a + du - w, n, z], [a + du - w * 0.8, n, z + h * 0.45], [a + du + sway, n, z + h], [a + du + w * 0.8, n, z + h * 0.45], [a + du + w, n, z]], c, 0, 0.5 * scale);
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

// Glowing coals heaped in a bowl round (cu, cv) on z.
export function coals(k: Kit, cu: number, cv: number, z: number, r: number, seed: number, hot = 0.5): void {
  k.disc(cu, cv, z, r, k.rgrad(cu, cv, z, r, [[0, C.lavaHot], [0.6, C.lava], [1, C.lavaDeep]]), 0);
  const pen = k.pen;
  pen.beginPath();
  const n = Math.round(r * 4);
  for (let i = 0; i < n; i++) {
    const a = hash(seed, i, 21) * Math.PI * 2;
    const rr = Math.sqrt(hash(seed, i, 22)) * r * 0.85;
    const [x, y] = k.p(cu + Math.cos(a) * rr, cv + Math.sin(a) * rr, z + 0.1);
    const R = (0.25 + hash(seed, i, 23) * 0.25) * k.s;
    pen.moveTo(x + R, y);
    pen.ellipse(x, y, R, R * 0.7, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha(C.crust, 1 - hot * 0.6);
  pen.fill();
}

// ── iron ─────────────────────────────────────────────────────────────────────

// Points along a hanging chain from a to b, sagging `sag` units mid-way.
export function swag(a: P3, b: P3, sag: number, n = 10): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - sag * 4 * t * (1 - t)]);
  }
  return out;
}

// A chain along frame points: links when zoomed in, a beaded line when not.
export function chain(k: Kit, pts: ReadonlyArray<P3>, link = 0.55, color: Color = C.ironLight): void {
  const scr = pts.map((p) => k.p(...p));
  const L = link * k.s;
  const pen = k.pen;
  if (L < 3) {
    k.line(pts, INK, Math.max(1.2, 0.3 * k.s + k.thin));
    k.line(pts, color, Math.max(0.7, 0.18 * k.s));
    return;
  }
  // walk the polyline, a link every L px, alternating face-on and edge-on
  const at: Array<{ x: number; y: number; a: number }> = [];
  let carry = 0;
  for (let i = 1; i < scr.length; i++) {
    const [x0, y0] = scr[i - 1];
    const [x1, y1] = scr[i];
    const l = Math.hypot(x1 - x0, y1 - y0);
    const a = Math.atan2(y1 - y0, x1 - x0);
    let d = carry;
    while (d < l) {
      at.push({ x: x0 + ((x1 - x0) * d) / l, y: y0 + ((y1 - y0) * d) / l, a });
      d += L * 0.82;
    }
    carry = d - l;
  }
  const w = Math.max(0.8, L * 0.2);
  for (const pass of [0, 1]) {
    at.forEach((q, i) => {
      pen.beginPath();
      if (i & 1) {
        pen.moveTo(q.x - Math.cos(q.a) * L * 0.5, q.y - Math.sin(q.a) * L * 0.5);
        pen.lineTo(q.x + Math.cos(q.a) * L * 0.5, q.y + Math.sin(q.a) * L * 0.5);
      } else pen.ellipse(q.x, q.y, L * 0.52, L * 0.3, q.a, 0, Math.PI * 2);
      pen.strokeStyle = pass ? color : INK;
      pen.lineWidth = pass ? w : w + k.thin * 1.2;
      pen.stroke();
    });
  }
}

// An iron padlock hanging at a frame point.
export function padlock(k: Kit, u: number, v: number, z: number, r = 0.45): void {
  const [x, y] = k.p(u, v, z);
  const R = r * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.arc(x, y - R * 0.6, R * 0.55, Math.PI, 0);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(1, R * 0.35) + k.thin;
  pen.stroke();
  pen.strokeStyle = C.ironLight;
  pen.lineWidth = Math.max(0.7, R * 0.35);
  pen.stroke();
  pen.beginPath();
  pen.roundRect(x - R * 0.8, y - R * 0.6, R * 1.6, R * 1.3, R * 0.3);
  k.paint(C.gold, k.thin);
}

// ── books ────────────────────────────────────────────────────────────────────

export const BINDINGS: readonly Color[] = ['#6e1020', '#3c2427', '#5a2d6c', '#4a5a2a', '#8a4630', '#2f2436', '#a01c2a', '#7a5a3a', '#1f4a44', '#c9b48e'];

// A row of books standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax. Books of one colour go in one path.
export function bookRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number, gaps = true): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const tops: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.45 + hash(seed, i, 61) * 0.45;
    if (u + w > u1) break;
    if (gaps && hash(seed, i, 62) < 0.08 && u > u0 + 1) {
      u += 0.6;
      i++;
      continue;
    }
    const h = hmax * (0.66 + hash(seed, i, 63) * 0.32);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
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
  // gilt bands across the spines
  pen.beginPath();
  for (const q of tops) {
    const [a, b] = [q[0], q[1]];
    const hh = q[3][2] - a[2];
    for (const f of k.fine ? [0.16, 0.84] : [0.2]) {
      const [x0, y0] = k.p(a[0] + (q[3][0] - a[0]) * f, v, a[2] + hh * f);
      const [x1, y1] = k.p(b[0] + (q[2][0] - b[0]) * f, v, b[2] + hh * f);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = '#e2b03aaa';
  pen.lineWidth = Math.max(0.7, 0.08 * k.s);
  pen.stroke();
  pen.beginPath();
  for (const q of tops) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A closed tome lying on z: u0..u0+du by v0..v0+dv, `h` thick, with
// metal corners.
export function tome(k: Kit, u0: number, v0: number, z: number, du: number, dv: number, h: number, cover: Color): void {
  k.box(u0, v0, z, du, dv, h, cover, { line: k.thin, stripe: false });
  k.poly([[u0 + du, v0 + 0.12, z + 0.08], [u0 + du, v0 + dv - 0.12, z + 0.08], [u0 + du, v0 + dv - 0.12, z + h - 0.08], [u0 + du, v0 + 0.12, z + h - 0.08]], '#efe2c0', 0);
  if (k.fine) for (const [a, b] of [[u0, v0], [u0, v0 + dv - 0.5]] as const) k.poly([[a, b, z + h + 0.01], [a + 0.5, b, z + h + 0.01], [a + 0.5, b + 0.5, z + h + 0.01], [a, b + 0.5, z + h + 0.01]], C.gold, 0);
}

// ── geometry ───────────────────────────────────────────────────────────────────

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

// An upright cone frustum (a bowl, a pot's flare): radius r0 at z0, r1 at
// z1, shaded across, its top opening in `inside` (null: leave it open),
// `line` its outline.
export function frustum(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color, inside: Color | Gradient | null, line = k.lw): void {
  const bot = ring(k, [cu, cv, z0], [0, 0, 1], r0, 24);
  const top = ring(k, [cu, cv, z1], [0, 0, 1], r1, 24);
  const sil = hull([...bot, ...top]);
  const xs = sil.map((p) => p[0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const g = k.pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, 0.08));
  g.addColorStop(0.35, shade(base, 0.16));
  g.addColorStop(0.7, base);
  g.addColorStop(1, shade(base, -0.24));
  k.fill(sil, g, 0);
  if (inside) k.fill(top, inside, Math.min(k.thin, line));
  k.fill(sil, null, line);
}

// A shard of crystal (brimstone, obsidian) from (u, v, z), h tall and w
// across, leaning `lean` units toward +u: two faces, lit and shaded, a
// glint down the lit one; `line` its outline.
export function crystal(k: Kit, u: number, v: number, z: number, h: number, w: number, lean: number, base: Color, line = k.lw): void {
  const b0 = k.p(u - w / 2, v + w * 0.3, z);
  const b1 = k.p(u, v + w * 0.55, z);
  const b2 = k.p(u + w / 2, v + w * 0.3, z);
  const t0 = k.p(u - w * 0.42 + lean, v + w * 0.25, z + h * 0.78);
  const t1 = k.p(u + lean * 1.05, v + w * 0.45, z + h * 0.8);
  const t2 = k.p(u + w * 0.42 + lean, v + w * 0.25, z + h * 0.78);
  const tip = k.p(u + lean * 1.25, v + w * 0.3, z + h);
  k.fill([b0, b1, t1, tip, t0], shade(base, 0.1), 0);
  k.fill([b1, b2, t2, tip, t1], shade(base, -0.22), 0);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(b1[0], b1[1]);
  pen.lineTo(t1[0], t1[1]);
  pen.lineTo(tip[0], tip[1]);
  pen.strokeStyle = INK;
  pen.lineWidth = k.thin * 0.7;
  pen.stroke();
  // a glint along the lit face
  pen.beginPath();
  const m0: Pt = [(b0[0] * 0.7 + b1[0] * 0.3), (b0[1] * 0.7 + b1[1] * 0.3) - 1];
  const m1: Pt = [(t0[0] * 0.7 + t1[0] * 0.3), (t0[1] * 0.7 + t1[1] * 0.3)];
  pen.moveTo(m0[0], m0[1]);
  pen.lineTo(m1[0], m1[1]);
  pen.strokeStyle = withAlpha(shade(base, 0.6), 0.8);
  pen.lineWidth = Math.max(0.8, w * 0.12 * k.s);
  pen.stroke();
  k.fill([b0, b1, b2, t2, tip, t0], null, line);
}

// An upright spike (a spear point, a finial) from (u, v, z), h tall, w
// across, as seen face on.
export function spike(k: Kit, u: number, v: number, z: number, h: number, w: number, color: Color): void {
  const [x, y] = k.p(u, v, z);
  const W = w * k.s;
  const H = h * k.s;
  k.fill([[x - W, y], [x - W * 0.35, y - H * 0.35], [x, y - H], [x + W * 0.35, y - H * 0.35], [x + W, y]], color, k.thin);
  k.fill([[x, y], [x, y - H], [x + W * 0.35, y - H * 0.35], [x + W, y]], withAlpha(shade(color, -0.4), 0.6), 0);
}

// A lumpy rock on z round (cu, cv): rx across, h tall, `line` its outline.
export function rock(k: Kit, cu: number, cv: number, z: number, rx: number, h: number, base: Color, seed: number, line = k.lw): void {
  const e = k.ell(cu, cv, z, rx);
  const [, ty] = k.p(cu, cv, z + h);
  const pts: Pt[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const j = 0.93 + hash(seed, i, 31) * 0.14;
    const sn = Math.abs(Math.sin(a));
    pts.push([e.cx + Math.cos(a) * e.rx * j, e.cy + (ty - e.cy) * Math.pow(sn, 0.45) * j]);
  }
  for (let i = 1; i < n; i++) {
    const a = (i / n) * Math.PI;
    pts.push([e.cx + Math.cos(a) * e.rx, e.cy + Math.sin(a) * e.ry]);
  }
  const xs = pts.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), ty, Math.max(...xs), e.cy);
  g.addColorStop(0, shade(base, 0.18));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.3));
  k.fill(pts, g, line);
}
