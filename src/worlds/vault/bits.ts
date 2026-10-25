import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the vault is full of, drawn in any frame: gold bars and
// coins, heaps of them, brass stanchions and velvet ropes, ledgers, caged
// amber lamps, dials, leather chairs and a few shape helpers.

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

// An upright cone frustum (lamp shades, pans): radius r0 at z0, r1 at z1,
// shaded across, its top opening in `inside`.
export function frustum(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color, inside: Color | null): void {
  const bot = ring(k, [cu, cv, z0], [0, 0, 1], r0, 24);
  const top = ring(k, [cu, cv, z1], [0, 0, 1], r1, 24);
  const sil = hull([...bot, ...top]);
  fillPts(k, sil, across(k, sil, base), 0);
  if (inside) fillPts(k, top, inside, k.thin);
  fillPts(k, sil, null, k.lw);
}

// ── gold ─────────────────────────────────────────────────────────────────────

// A gold ingot lying from (u, v, z), `l` along u (or along v when `along`
// is 'v'), `w` across, `h` tall, its sides sloped in. Only the faces the
// viewer sees: the top, the +v front and the +u end.
export function goldBar(k: Kit, u: number, v: number, z: number, l = 1.8, w = 0.9, h = 0.5, along: 'u' | 'v' = 'u', color: Color = C.gold): void {
  const [du, dv] = along === 'u' ? [l, w] : [w, l];
  const iu = Math.min(du, dv) * 0.18 + (along === 'u' ? 0.08 : 0);
  const iv = Math.min(du, dv) * 0.18 + (along === 'v' ? 0.08 : 0);
  const b = (fu: number, fv: number): P3 => [u + fu * du, v + fv * dv, z];
  const t = (fu: number, fv: number): P3 => [u + iu + fu * (du - 2 * iu), v + iv + fv * (dv - 2 * iv), z + h];
  const line = Math.max(0.8, k.thin * 0.8);
  k.poly([b(0, 1), b(1, 1), t(1, 1), t(0, 1)], k.side(color, 0, 1, 0.22), line);
  k.poly([b(1, 0), b(1, 1), t(1, 1), t(1, 0)], k.side(color, 1, 0, 0.22), line);
  k.poly([t(0, 0), t(1, 0), t(1, 1), t(0, 1)], shade(color, 0.22), line);
  if (k.s * h >= 3) {
    // a bright glint along the top's front edge
    k.line([t(0.12, 0.92), t(0.6, 0.92)], withAlpha(C.goldLight, 0.9), Math.max(0.8, 0.09 * k.s));
  }
}

// A pyramid of gold bars on z: `rows` rows, each one fewer and set in half
// a bar, the bars along u, ranked nearer the viewer last.
export function barStack(k: Kit, u: number, v: number, z: number, cols: number, deep: number, rows: number, l = 1.8, w = 0.9, h = 0.5): void {
  for (let r = 0; r < rows; r++) {
    const n = cols - r;
    const m = Math.max(1, deep - r);
    if (n <= 0) break;
    for (let j = 0; j < m; j++) {
      for (let i = 0; i < n; i++) {
        goldBar(k, u + (r * l) / 2 + i * (l + 0.06), v + (r * w) / 2 + j * (w + 0.06), z + r * h, l, w, h);
      }
    }
  }
}

// A stack of n coins standing at (u, v, z).
export function coins(k: Kit, u: number, v: number, z: number, n: number, r = 0.42): void {
  const h = n * 0.16;
  k.cyl(u, v, z, r, h, C.goldDeep, { top: C.gold, line: Math.max(0.8, k.thin * 0.8) });
  if (k.s * h >= 4 && k.s >= 5) {
    const e = k.ell(u, v, z, r);
    k.pen.beginPath();
    for (let i = 1; i < n; i += 2) {
      const [, y] = k.p(u, v, z + i * 0.16);
      k.pen.moveTo(e.cx - e.rx * 0.95, y + e.ry * 0.6);
      k.pen.quadraticCurveTo(e.cx, y + e.ry * 1.6, e.cx + e.rx * 0.95, y + e.ry * 0.6);
    }
    k.pen.strokeStyle = withAlpha(C.brassDark, 0.7);
    k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    k.pen.stroke();
  }
}

// A coin lying loose on z (flat), or tipped on its edge.
export function coin(k: Kit, u: number, v: number, z: number, r = 0.42): void {
  k.disc(u, v, z, r, C.gold, Math.max(0.7, k.thin * 0.7));
  if (k.s * r >= 3) k.disc(u - r * 0.15, v - r * 0.15, z + 0.01, r * 0.55, shade(C.gold, 0.25), 0);
}

// A heap of coins: a dome rx x rv across and h tall on z, shining toward
// the upper left, coins strewn over it, some bars and a few loose coins
// round its foot.
export function coinHeap(k: Kit, cu: number, cv: number, z: number, ru: number, rv: number, h: number, seed: number): void {
  const pts: Pt[] = [];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const zz = z + h * Math.sin((f * Math.PI) / 2);
    const rr = Math.cos((f * Math.PI) / 2);
    for (let j = 0; j < 24; j++) {
      const a = (j / 24) * Math.PI * 2;
      pts.push(k.p(cu + Math.cos(a) * ru * rr, cv + Math.sin(a) * rv * rr, zz));
    }
  }
  const sil = hull(pts);
  const [tx, ty] = k.p(cu - ru * 0.25, cv - rv * 0.25, z + h * 0.8);
  const R = Math.max(ru, rv) * k.s * 1.6;
  const g = k.pen.createRadialGradient(tx, ty, 0, tx, ty, R);
  g.addColorStop(0, C.goldLight);
  g.addColorStop(0.3, C.gold);
  g.addColorStop(0.75, C.goldDeep);
  g.addColorStop(1, shade(C.goldDeep, -0.25));
  fillPts(k, sil, g, k.lw);
  // coins on the surface (the half toward the viewer): little ellipses,
  // bright and dark, in one path a tone
  const pen = k.pen;
  const tones: Array<[Color, Array<[number, number, number]>]> = [[withAlpha('#fff3c4', 0.85), []], [withAlpha('#a86d14', 0.75), []], [withAlpha(C.gold, 1), []]];
  const n = Math.round(ru * rv * (k.fine ? 9 : 4));
  const cr = Math.max(1, 0.32 * k.s);
  for (let i = 0; i < n; i++) {
    const a = Math.PI * (-0.2 + 1.4 * hash(seed, i, 1));
    const f = Math.sqrt(hash(seed, i, 2)) * 0.95;
    const el = Math.acos(f);
    const u = cu + Math.cos(a) * ru * f;
    const w = cv + Math.sin(a) * rv * f;
    const zz = z + h * Math.sin(el);
    const [x, y] = k.p(u, w, zz);
    tones[i % 5 === 0 ? 0 : i % 3 === 0 ? 1 : 2][1].push([x, y, hash(seed, i, 3)]);
  }
  for (const [c, list] of tones) {
    pen.beginPath();
    for (const [x, y, r] of list) {
      pen.moveTo(x + cr, y);
      pen.ellipse(x, y, cr, cr * (0.45 + r * 0.3), r - 0.5, 0, Math.PI * 2);
    }
    pen.fillStyle = c;
    pen.fill();
  }
  // a rim of light on the upper left
  const lit = sil.filter((p) => p[0] < tx + R * 0.1 && p[1] < ty + R * 0.3);
  if (lit.length > 2) {
    pen.beginPath();
    lit.sort((p, q) => p[0] - q[0]).forEach(([x, y], i) => (i ? pen.lineTo(x + 1.2, y + 1.2) : pen.moveTo(x + 1.2, y + 1.2)));
    pen.strokeStyle = withAlpha('#fff6d0', 0.55);
    pen.lineWidth = Math.max(0.8, 0.12 * k.s);
    pen.stroke();
  }
}

// ── brass and velvet ─────────────────────────────────────────────────────────

const POST_H = 3.4;

// A brass stanchion: a weighted round foot, a post and a ball on top.
export function stanchion(k: Kit, u: number, v: number): void {
  k.shadow(u, v, 0.9, 0.9, 0.25);
  k.cyl(u, v, 0, 0.62, 0.22, C.brassDark, { top: C.brass });
  k.cyl(u, v, 0.22, 0.14, POST_H - 0.3, C.brass, { line: Math.max(0.8, k.thin) });
  const [x, y] = k.p(u, v, POST_H);
  const r = Math.max(1.4, 0.3 * k.s);
  k.pen.beginPath();
  k.pen.arc(x, y, r, 0, Math.PI * 2);
  const g = k.pen.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r);
  g.addColorStop(0, C.brassLight);
  g.addColorStop(1, C.brassDark);
  k.paint(g, k.thin);
}

// A velvet rope swagged between two stanchion tops.
export function rope(k: Kit, a: readonly [number, number], b: readonly [number, number], sag = 1.0): void {
  const pts: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, POST_H - 0.25 - sag * 4 * t * (1 - t)]);
  }
  k.rod(pts, C.velvet, 0.2);
  k.line(pts.slice(1, -1).map(([u, v, z]) => [u, v, z + 0.06] as P3), withAlpha('#ff8a9a', 0.5), Math.max(0.6, 0.06 * k.s));
}

// ── books and lamps ──────────────────────────────────────────────────────────

export const BINDINGS: readonly Color[] = ['#7d2a2e', '#2f5a45', '#2c3a5c', '#8a5a32', '#1f2329', '#5a2a4a', '#9a6a2a', '#3d5a6a'];

// A row of ledgers standing on a shelf at z, their spines on the plane v,
// from u0 to u1, no taller than hmax: leather spines with gilt bands.
export function ledgerRow(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const byColor = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.3) {
    const w = 0.55 + hash(seed, i, 61) * 0.45;
    if (u + w > u1) break;
    const h = hmax * (0.78 + hash(seed, i, 63) * 0.22);
    const c = BINDINGS[Math.floor(hash(seed, i, 64) * BINDINGS.length)];
    const lean = hash(seed, i, 65) < 0.06 && i > 0 ? 0.35 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (byColor.get(c) ?? byColor.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.3 : 0.03);
    i++;
  }
  for (const [c, qs] of byColor) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  // gilt bands near the head and the foot, and a label patch
  pen.beginPath();
  for (const q of all) {
    const hh = q[3][2] - q[0][2];
    for (const f of [0.12, 0.2, 0.86]) {
      const [x0, y0] = k.p(q[0][0] + (q[3][0] - q[0][0]) * f, v, q[0][2] + hh * f);
      const [x1, y1] = k.p(q[1][0] + (q[2][0] - q[1][0]) * f, v, q[1][2] + hh * f);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = withAlpha(C.brassLight, 0.8);
  pen.lineWidth = Math.max(0.6, 0.08 * k.s);
  pen.stroke();
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
}

// A caged amber lamp hanging (or standing) at (u, v, z): a glass bulb in
// wire guards under a little steel cap, lit or not.
export function cageLamp(k: Kit, u: number, v: number, z: number, r: number, on: boolean, glow = 0.5): void {
  const [x, y] = k.p(u, v, z);
  const pen = k.pen;
  const R = r * k.s;
  if (on) k.halo(u, v, z, r * 6, C.glow, glow);
  pen.beginPath();
  pen.ellipse(x, y, R, R * 1.15, 0, 0, Math.PI * 2);
  if (on) {
    const g = pen.createRadialGradient(x - R * 0.3, y - R * 0.3, 0, x, y, R * 1.1);
    g.addColorStop(0, '#fffbe6');
    g.addColorStop(0.5, C.lamp);
    g.addColorStop(1, C.amber);
    k.paint(g, k.thin);
  } else k.paint(shade(C.amber, -0.55), k.thin);
  // the guard wires
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
  // the cap
  k.pen.beginPath();
  k.pen.ellipse(x, y - R * 1.1, R * 0.75, R * 0.4, 0, 0, Math.PI * 2);
  k.paint(C.gunmetal, k.thin);
}

// A dial standing on the plane v = n: a bezel, a face, a ring of ticks
// and a knob turned to `turn` radians.
export function dial(k: Kit, a: number, n: number, z: number, r: number, turn: number, face: Color = C.cream, bezel: Color = C.brass): void {
  k.face(a, n, z, r, bezel, k.lw, 24);
  k.face(a, n + 0.05, z, r * 0.78, face, k.thin, 24);
  if (k.s * r >= 4) {
    const seg: Array<[P3, P3]> = [];
    const m = k.s * r >= 9 ? 24 : 12;
    for (let i = 0; i < m; i++) {
      const th = (i / m) * Math.PI * 2 + turn;
      const r0 = r * (i % 3 === 0 ? 0.52 : 0.62);
      seg.push([[a + Math.cos(th) * r0, n + 0.06, z + Math.sin(th) * r0], [a + Math.cos(th) * r * 0.74, n + 0.06, z + Math.sin(th) * r * 0.74]]);
    }
    k.segs(seg, withAlpha(INK, 0.8), Math.max(0.6, 0.05 * k.s));
  }
  k.face(a, n + 0.1, z, r * 0.36, shade(bezel, 0.1), k.thin, 16);
  const th = turn + Math.PI / 2;
  k.line([[a, n + 0.12, z], [a + Math.cos(th) * r * 0.32, n + 0.12, z + Math.sin(th) * r * 0.32]], INK, Math.max(0.8, 0.08 * k.s));
}

// A leather swivel chair at (cu, cv), its sitter facing angle `face`.
export function chair(k: Kit, cu: number, cv: number, face: number, cover: Color = C.oxblood): void {
  const du = Math.cos(face);
  const dv = Math.sin(face);
  const zs = 3.3;
  k.shadow(cu, cv, 1.6, 1.6, 0.24);
  // the star base on casters, the column
  for (let i = 0; i < 5; i++) {
    const a = face + (i / 5) * Math.PI * 2 + 0.3;
    k.rod([[cu, cv, 0.5], [cu + Math.cos(a) * 1.2, cv + Math.sin(a) * 1.2, 0.25]], C.iron, 0.14);
  }
  k.cyl(cu, cv, 0.4, 0.16, zs - 0.8, C.chrome, { line: k.thin });
  const behind = du + dv > 0;
  const back = () => {
    const bu = cu - du * 1.05;
    const bv = cv - dv * 1.05;
    const pu = -dv;
    const pv = du;
    const q = (s: number, z: number, o = 0): P3 => [bu + pu * s - du * o, bv + pv * s - dv * o, z];
    k.poly([q(-1.05, zs + 0.3), q(1.05, zs + 0.3), q(1.1, zs + 3.6, 0.25), q(-1.1, zs + 3.6, 0.25)], k.side(cover, -du, -dv, 0.2), k.lw, 0.5);
    if (k.fine) for (const s of [-0.5, 0, 0.5]) k.disc(bu + pu * s - du * 0.1, bv + pv * s - dv * 0.1, zs + 2.3, 0.1, shade(cover, -0.35), 0);
  };
  if (behind) back();
  k.cyl(cu, cv, zs - 0.4, 1.25, 0.6, cover, { top: shade(cover, 0.12) });
  if (!behind) back();
}

// A faceted gem at screen (x, y), r px: a crown over a pointed pavilion.
export function gem(k: Kit, x: number, y: number, r: number, color: Color): void {
  const pen = k.pen;
  const top = y - r * 0.55;
  const mid = y - r * 0.1;
  pen.beginPath();
  pen.moveTo(x - r * 0.55, top);
  pen.lineTo(x + r * 0.55, top);
  pen.lineTo(x + r, mid);
  pen.lineTo(x, y + r * 0.95);
  pen.lineTo(x - r, mid);
  pen.closePath();
  const g = pen.createLinearGradient(x - r, top, x + r, y + r);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.35));
  k.paint(g, Math.max(0.8, k.thin));
  pen.beginPath();
  pen.moveTo(x - r, mid);
  pen.lineTo(x + r, mid);
  pen.moveTo(x - r * 0.25, top);
  pen.lineTo(x - r * 0.45, mid);
  pen.lineTo(x, y + r * 0.95);
  pen.lineTo(x + r * 0.45, mid);
  pen.lineTo(x + r * 0.25, top);
  pen.strokeStyle = withAlpha('#ffffff', 0.55);
  pen.lineWidth = Math.max(0.6, r * 0.08);
  pen.stroke();
}

// Rivets: small round heads at frame points, one path (bright side up-left).
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
