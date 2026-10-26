import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the shelter is full of, drawn in any frame: hand-wheel
// valves, round gauges (ticks and a needle, never digits), caged lamps,
// rivets, hazard stripes, tins with plain bands, a diner's checker, a steel
// swivel chair, a folding chair and a few shape helpers.

// ── shape helpers ────────────────────────────────────────────────────────────

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

// A left-to-right gradient across screen points: lit left, dark right.
export function across(k: Kit, pts: ReadonlyArray<Pt>, base: Color, lift = 0.14, drop = 0.24): Gradient {
  const xs = pts.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, lift * 0.5));
  g.addColorStop(0.3, shade(base, lift));
  g.addColorStop(0.65, base);
  g.addColorStop(1, shade(base, -drop));
  return g;
}

// An upright cone frustum (lamp shades, pots): radius r0 at z0, r1 at z1,
// shaded across, its top opening in `inside`.
export function frustum(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color, inside: Color | null): void {
  const bot = ring(k, [cu, cv, z0], [0, 0, 1], r0, 24);
  const top = ring(k, [cu, cv, z1], [0, 0, 1], r1, 24);
  const sil = hull([...bot, ...top]);
  fillPts(k, sil, across(k, sil, base), 0);
  if (inside) fillPts(k, top, inside, k.thin);
  fillPts(k, sil, null, k.lw);
}

// A small round dot at a frame point, r units.
export function dot(k: Kit, u: number, v: number, z: number, r: number, color: Color, line = 0): void {
  const [x, y] = k.p(u, v, z);
  k.pen.beginPath();
  k.pen.arc(x, y, Math.max(0.7, r * k.s), 0, Math.PI * 2);
  k.paint(color, line);
}

// Rivets: small round heads at frame points, one path.
export function rivets(k: Kit, pts: ReadonlyArray<P3>, color: Color = C.rivet, r = 0.13): void {
  if (!pts.length) return;
  const pen = k.pen;
  const R = Math.max(0.7, r * k.s);
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x + R, y);
    pen.arc(x, y, R, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();
}

// Amber and black stripes across the quad a0..a1 x z0..z1 on the plane
// v = n (a door frame, a kick plate, a fuse box door), outlined when line > 0.
export function hazard(k: Kit, a0: number, z0: number, a1: number, z1: number, n: number, line = k.thin, lit = true, pitch = 1.3): void {
  const amber = lit ? C.hazard : shade(C.hazard, -0.16);
  const black = lit ? C.black : shade(C.black, -0.1);
  k.rect(a0, z0, a1, z1, n, amber, 0);
  const pen = k.pen;
  pen.save();
  pen.beginPath();
  k.trace([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]]);
  pen.clip();
  pen.beginPath();
  const h = z1 - z0;
  for (let a = a0 - h; a < a1 + pitch; a += pitch * 2) k.trace([[a, n, z0], [a + pitch, n, z0], [a + pitch + h, n, z1], [a + h, n, z1]]);
  pen.fillStyle = black;
  pen.fill();
  pen.restore();
  if (line > 0) {
    pen.beginPath();
    k.trace([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]]);
    k.paint(null, line);
  }
}

// The same stripes on the plane u = n (an end face), b along v.
export function hazardEnd(k: Kit, b0: number, z0: number, b1: number, z1: number, n: number, line = k.thin, pitch = 1.3): void {
  const lit = k.lit(1, 0);
  const pen = k.pen;
  k.poly([[n, b0, z0], [n, b1, z0], [n, b1, z1], [n, b0, z1]], lit ? C.hazard : shade(C.hazard, -0.18), 0);
  pen.save();
  pen.beginPath();
  k.trace([[n, b0, z0], [n, b1, z0], [n, b1, z1], [n, b0, z1]]);
  pen.clip();
  pen.beginPath();
  const h = z1 - z0;
  for (let b = b0 - h; b < b1 + pitch; b += pitch * 2) k.trace([[n, b, z0], [n, b + pitch, z0], [n, b + pitch + h, z1], [n, b + h, z1]]);
  pen.fillStyle = lit ? C.black : shade(C.black, -0.1);
  pen.fill();
  pen.restore();
  if (line > 0) {
    pen.beginPath();
    k.trace([[n, b0, z0], [n, b1, z0], [n, b1, z1], [n, b0, z1]]);
    k.paint(null, line);
  }
}

// ── valves and gauges ────────────────────────────────────────────────────────

// A spoked hand-wheel standing on the plane v = n: a smooth round rim (no
// teeth), `spokes` spokes to a hub, turned by `turn` radians.
export function wheel(k: Kit, a: number, n: number, z: number, r: number, turn: number, color: Color = C.red, spokes = 4): void {
  const w = Math.max(0.16, r * 0.17);
  const segs: Array<[P3, P3]> = [];
  for (let i = 0; i < spokes; i++) {
    const th = turn + (i / spokes) * Math.PI * 2;
    segs.push([[a, n, z], [a + Math.cos(th) * r, n, z + Math.sin(th) * r]]);
  }
  // spokes: ink under the metal
  k.segs(segs, INK, w * k.s + k.lw * 1.2, 'round');
  k.segs(segs, shade(color, -0.12), w * k.s, 'round');
  // the rim: an ink ring, the colour on it, a light along its upper left
  const rim = (r0: number) => {
    const pts: P3[] = [];
    for (let i = 0; i <= 32; i++) {
      const th = (i / 32) * Math.PI * 2;
      pts.push([a + Math.cos(th) * r0, n + 0.02, z + Math.sin(th) * r0]);
    }
    return pts;
  };
  const ring0 = rim(r);
  k.line(ring0, INK, w * 1.6 * k.s + k.lw * 1.2);
  k.line(ring0, color, w * 1.6 * k.s);
  if (r * k.s >= 5) {
    const arc: P3[] = [];
    for (let i = 0; i <= 10; i++) {
      const th = Math.PI * (0.55 + (0.5 * i) / 10);
      arc.push([a + Math.cos(th) * r, n + 0.04, z + Math.sin(th) * r]);
    }
    k.line(arc, withAlpha('#ffffff', 0.45), Math.max(0.6, w * 0.5 * k.s));
  }
  k.face(a, n + 0.05, z, Math.max(0.2, r * 0.26), shade(color, 0.1), k.thin, 14);
}

// A round gauge on the plane v = n: a chrome bezel, a cream face with
// ticks and a red arc (no digits), the needle at angle `needle` (radians,
// 0 pointing right, pi/2 up).
export function gauge(k: Kit, a: number, n: number, z: number, r: number, needle: number, face: Color = C.cream): void {
  k.face(a, n, z, r, C.chrome, k.lw, 22);
  k.face(a, n + 0.03, z, r * 0.78, face, 0, 22);
  if (k.s * r >= 3.5) {
    const seg: Array<[P3, P3]> = [];
    const m = k.s * r >= 8 ? 9 : 5;
    for (let i = 0; i < m; i++) {
      const th = Math.PI * (1.15 - (1.3 * i) / (m - 1));
      seg.push([[a + Math.cos(th) * r * 0.55, n + 0.05, z + Math.sin(th) * r * 0.55], [a + Math.cos(th) * r * 0.72, n + 0.05, z + Math.sin(th) * r * 0.72]]);
    }
    k.segs(seg, withAlpha(INK, 0.8), Math.max(0.6, 0.06 * k.s));
    const red: P3[] = [];
    for (let i = 0; i <= 6; i++) {
      const th = Math.PI * (0.05 - (0.2 * i) / 6);
      red.push([a + Math.cos(th) * r * 0.64, n + 0.05, z + Math.sin(th) * r * 0.64]);
    }
    k.line(red, C.red, Math.max(0.8, r * 0.14 * k.s));
  }
  needleOf(k, a, n, z, r, needle);
}

// Just a gauge's needle (for animated ones, over a still face).
export function needleOf(k: Kit, a: number, n: number, z: number, r: number, needle: number): void {
  k.line([[a, n + 0.07, z], [a + Math.cos(needle) * r * 0.66, n + 0.07, z + Math.sin(needle) * r * 0.66]], C.red, Math.max(0.8, 0.1 * k.s));
  k.face(a, n + 0.08, z, Math.max(0.12, r * 0.14), INK, 0, 10);
}

// ── lamps ────────────────────────────────────────────────────────────────────

// A caged lamp under a little hood at (u, v, z): a warm bulb in wire
// guards, lit or not.
export function cageLamp(k: Kit, u: number, v: number, z: number, r: number, on: boolean, glow = 0.45): void {
  const [x, y] = k.p(u, v, z);
  const pen = k.pen;
  const R = r * k.s;
  if (on) k.halo(u, v, z, r * 6, '#ffd890', glow);
  pen.beginPath();
  pen.ellipse(x, y, R, R * 1.15, 0, 0, Math.PI * 2);
  if (on) {
    const g = pen.createRadialGradient(x - R * 0.3, y - R * 0.3, 0, x, y, R * 1.1);
    g.addColorStop(0, '#fffbe6');
    g.addColorStop(0.5, C.lamp);
    g.addColorStop(1, C.valve);
    k.paint(g, k.thin);
  } else k.paint(shade(C.valve, -0.55), k.thin);
  if (R >= 3) {
    pen.beginPath();
    pen.moveTo(x, y - R * 1.15);
    pen.lineTo(x, y + R * 1.15);
    pen.moveTo(x - R, y);
    pen.quadraticCurveTo(x, y + R * 0.5, x + R, y);
    pen.strokeStyle = withAlpha(INK, 0.8);
    pen.lineWidth = Math.max(0.6, k.thin * 0.6);
    pen.stroke();
  }
  // the hood
  pen.beginPath();
  pen.moveTo(x - R * 1.25, y - R * 0.75);
  pen.quadraticCurveTo(x, y - R * 2.1, x + R * 1.25, y - R * 0.75);
  pen.closePath();
  k.paint(C.steelDark, k.thin);
}

// ── tins and boxes ───────────────────────────────────────────────────────────

export const BANDS: readonly Color[] = ['#c8463a', '#3f9e9a', '#e2b33c', '#7fbf4a', '#efe6cc', '#e8833a', '#8a5aa8'];

// A band of colour round an upright cylinder (cu, cv, r) from z0 to z1:
// the front of its side only, shaded across like the cylinder.
export function sleeve(k: Kit, cu: number, cv: number, r: number, z0: number, z1: number, color: Color, line = 0): void {
  const lo = k.ell(cu, cv, z0, r);
  const hi = k.ell(cu, cv, z1, r);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(lo.cx, lo.cy, lo.rx, lo.ry, lo.rot, 0, Math.PI);
  pen.ellipse(hi.cx, hi.cy, hi.rx, hi.ry, hi.rot, Math.PI, 0, true);
  pen.closePath();
  const g = pen.createLinearGradient(lo.cx - lo.rx, 0, lo.cx + lo.rx, 0);
  g.addColorStop(0, shade(color, 0.06));
  g.addColorStop(0.3, shade(color, 0.14));
  g.addColorStop(0.6, color);
  g.addColorStop(1, shade(color, -0.24));
  k.paint(g, line);
}

// A tin can: tin-plate with a plain coloured label band and a lid.
export function tin(k: Kit, u: number, v: number, z: number, r: number, h: number, band: Color): void {
  k.cyl(u, v, z, r, h, '#b9c0c2', { line: k.thin, top: '#d8dee0' });
  sleeve(k, u, v, r, z + h * 0.18, z + h * 0.82, band);
  if (k.fine) {
    const e = k.ell(u, v, z + h, r * 0.7);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    k.pen.strokeStyle = withAlpha(INK, 0.35);
    k.pen.lineWidth = Math.max(0.5, 0.05 * k.s);
    k.pen.stroke();
  }
}

// Upright binders or manuals along u from u0 to u1, spines facing +v at v,
// standing on z, coloured spines with a plain band (never lettering).
export function binders(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number, depth = 2.2): void {
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = Math.min(u1 - u, 0.55 + hash(seed, i, 1) * 0.5);
    const h = hmax * (0.78 + hash(seed, i, 2) * 0.22);
    const c = BANDS[Math.floor(hash(seed, i, 3) * BANDS.length)];
    k.box(u, v - depth, z, w, depth, h, c, { line: k.thin, stripe: false });
    if (k.s * w >= 2.5) {
      k.poly([[u + w * 0.2, v + 0.01, z + h * 0.62], [u + w * 0.8, v + 0.01, z + h * 0.62], [u + w * 0.8, v + 0.01, z + h * 0.78], [u + w * 0.2, v + 0.01, z + h * 0.78]], k.side(C.cream, 0, 1, 0.1), 0);
      if (k.fine) k.disc(u + w / 2, v + 0.01, z + h * 0.25, 0.12, shade(c, -0.35), 0);
    }
    u += w + 0.04;
    i++;
  }
}

// ── seats ────────────────────────────────────────────────────────────────────

// A steel swivel chair at (cu, cv), its sitter facing angle `face`: a vinyl
// seat and back on a chrome column and a star of feet.
export function chair(k: Kit, cu: number, cv: number, face: number, cover: Color = C.leather): void {
  const du = Math.cos(face);
  const dv = Math.sin(face);
  const zs = 3.3;
  k.shadow(cu, cv, 1.6, 1.6, 0.24);
  for (let i = 0; i < 4; i++) {
    const a = face + (i / 4) * Math.PI * 2 + Math.PI / 4;
    k.rod([[cu, cv, 0.5], [cu + Math.cos(a) * 1.2, cv + Math.sin(a) * 1.2, 0.2]], C.steelDark, 0.14);
  }
  k.cyl(cu, cv, 0.4, 0.16, zs - 0.8, C.chrome, { line: k.thin });
  const behind = du + dv > 0;
  const back = () => {
    const bu = cu - du * 1.05;
    const bv = cv - dv * 1.05;
    const pu = -dv;
    const pv = du;
    const q = (s: number, z: number, o = 0): P3 => [bu + pu * s - du * o, bv + pv * s - dv * o, z];
    k.rod([q(0, zs), q(0, zs + 1.2, 0.1)], C.chrome, 0.16);
    k.poly([q(-1.0, zs + 1.0), q(1.0, zs + 1.0), q(1.05, zs + 3.0, 0.2), q(-1.05, zs + 3.0, 0.2)], k.side(cover, -du, -dv, 0.2), k.lw, 0.5);
  };
  if (behind) back();
  k.cyl(cu, cv, zs - 0.4, 1.2, 0.55, cover, { top: shade(cover, 0.12) });
  if (!behind) back();
}

// A folding steel chair at (cu, cv), its sitter facing angle `face`: a
// slatted seat, a curved back panel on two uprights, the front legs
// crossing back under the seat.
export function foldChair(k: Kit, cu: number, cv: number, face: number, paint: Color = '#8a9592'): void {
  const du = Math.cos(face);
  const dv = Math.sin(face);
  const pu = -dv;
  const pv = du;
  const q = (s: number, f: number, z: number): P3 => [cu + pu * s + du * f, cv + pv * s + dv * f, z];
  const zs = 2.6;
  k.shadow(cu, cv, 1.3, 1.3, 0.22);
  const frame = shade(paint, -0.25);
  const back = () => {
    for (const s of [-0.68, 0.68]) k.rod([q(s, -1.1, 0), q(s, -0.82, 5.0)], frame, 0.12);
    k.poly([q(-0.74, -0.86, 3.7), q(0.74, -0.86, 3.7), q(0.74, -0.96, 4.95), q(-0.74, -0.96, 4.95)], k.side(paint, -du, -dv, 0.2), k.lw, 0.15);
  };
  const behind = du + dv > 0;
  if (behind) back();
  // the front legs, crossing back under the seat
  for (const s of [-0.7, 0.7]) k.rod([q(s, 0.95, 0), q(s, -0.55, zs)], frame, 0.12);
  k.poly([q(-0.78, -0.8, zs), q(0.78, -0.8, zs), q(0.78, 0.75, zs), q(-0.78, 0.75, zs)], shade(paint, 0.1), k.lw, 0.2);
  if (k.fine) {
    const slats: Array<[P3, P3]> = [];
    for (const f of [-0.3, 0.2]) slats.push([q(-0.66, f, zs + 0.01), q(0.66, f, zs + 0.01)]);
    k.segs(slats, withAlpha(INK, 0.35), 0.06 * k.s);
  }
  if (!behind) back();
}

// A red and cream checker on the floor (z just over it) from (u0, v0) to
// (u1, v1), nu x nv squares.
export function checker(k: Kit, u0: number, v0: number, u1: number, v1: number, nu: number, nv: number, z = 0.02): void {
  const tu = (u1 - u0) / nu;
  const tv = (v1 - v0) / nv;
  k.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], C.cream, k.thin);
  k.pen.beginPath();
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) if ((i + j) & 1) k.trace([[u0 + i * tu, v0 + j * tv, z], [u0 + (i + 1) * tu, v0 + j * tv, z], [u0 + (i + 1) * tu, v0 + (j + 1) * tv, z], [u0 + i * tu, v0 + (j + 1) * tv, z]]);
  k.pen.fillStyle = C.red;
  k.pen.fill();
}

// A wisp of light dust: a soft pale mote at a frame point.
export function mote(k: Kit, u: number, v: number, z: number, r: number, a: number): void {
  const [x, y] = k.p(u, v, z);
  const pen = k.pen;
  pen.beginPath();
  pen.arc(x, y, Math.max(0.6, r * k.s), 0, Math.PI * 2);
  pen.fillStyle = withAlpha('#eef8e8', a);
  pen.fill();
}
