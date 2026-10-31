import { shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, hash, withAlpha } from './kit.ts';

// Small things the base is full of, drawn in any frame: rounded panels,
// glowing screens, holograms, mugs, stools and crates, the planet's odd
// flora, and the geometry helpers they share (rings in any plane, hulls,
// quads).

export type Quad = readonly [P3, P3, P3, P3];

// ── shape helpers ────────────────────────────────────────────────────────────

// A point on a quad: fu along a -> b, fz along a -> d.
export const on = (q: Quad, fu: number, fz: number): P3 => {
  const [a, b, , d] = q;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

// The quad inset by fractions of itself.
export const sub = (q: Quad, f0: number, z0: number, f1: number, z1: number): Quad => [on(q, f0, z0), on(q, f1, z0), on(q, f1, z1), on(q, f0, z1)];

// Fills (and inks, line > 0) a polygon of screen points.
export function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | Gradient | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
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

// Frame points round a circle of radius r centred on c, square to n, from
// angle a0 to a1 (radians round n, from a fixed reference).
function arc3(c: P3, n: P3, r: number, a0 = 0, a1 = Math.PI * 2, steps = 20): P3[] {
  const l = Math.hypot(...n) || 1;
  const N: P3 = [n[0] / l, n[1] / l, n[2] / l];
  const ref: P3 = Math.abs(N[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const cr = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const A = cr(N, ref);
  const la = Math.hypot(...A);
  const a: P3 = [A[0] / la, A[1] / la, A[2] / la];
  const b = cr(N, a);
  const out: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const th = a0 + ((a1 - a0) * i) / steps;
    const cs = Math.cos(th) * r;
    const sn = Math.sin(th) * r;
    out.push([c[0] + a[0] * cs + b[0] * sn, c[1] + a[1] * cs + b[1] * sn, c[2] + a[2] * cs + b[2] * sn]);
  }
  return out;
}

// Screen points round a circle (see arc3).
export function ring(k: Kit, c: P3, n: P3, r: number, steps = 20): Pt[] {
  return arc3(c, n, r, 0, Math.PI * 2, steps).slice(0, -1).map((p) => k.p(...p));
}

// The front of an upright cylinder between za and zb (what shows between
// two collars): the near half of each rim, joined. Leaves the path open
// for the caller to fill.
export function band(k: Kit, cu: number, cv: number, r: number, za: number, zb: number): void {
  const a = k.ell(cu, cv, za, r);
  const b = k.ell(cu, cv, zb, r);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(b.cx, b.cy, b.rx, b.ry, b.rot, 0, Math.PI);
  pen.lineTo(a.cx - a.rx, a.cy);
  pen.ellipse(a.cx, a.cy, a.rx, a.ry, a.rot, Math.PI, 0, true);
  pen.closePath();
}

// A left-to-right gradient across screen points: lit left, dark right.
export function across(k: Kit, pts: ReadonlyArray<Pt>, base: Color, lift = 0.14, drop = 0.24): Gradient {
  const xs = pts.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, lift * 0.6));
  g.addColorStop(0.3, shade(base, lift));
  g.addColorStop(0.7, base);
  g.addColorStop(1, shade(base, -drop));
  return g;
}

// An upright cone frustum (a funnel, a pot, a lamp's cap): radius r0 at
// z0, r1 at z1, shaded across, its top opening in `inside` (none: shut).
export function frustum(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color, inside: Color | Gradient | null): void {
  const bot = ring(k, [cu, cv, z0], [0, 0, 1], r0, 24);
  const top = ring(k, [cu, cv, z1], [0, 0, 1], r1, 24);
  const sil = hull([...bot, ...top]);
  fillPts(k, sil, across(k, sil, base), 0);
  if (inside) fillPts(k, top, inside, k.thin);
  else fillPts(k, top, shade(base, 0.14), k.thin);
  fillPts(k, sil, null, k.lw);
}

// Frame points round a rounded rectangle on the plane v = n, from (a0, z0)
// to (a1, z1), its top corners rounded by rt and its bottom ones by rb.
export function rrect(a0: number, z0: number, a1: number, z1: number, n: number, rt: number, rb = rt, steps = 6): P3[] {
  const out: P3[] = [];
  const corner = (ca: number, cz: number, r: number, from: number) => {
    for (let i = 0; i <= steps; i++) {
      const th = from + (i / steps) * (Math.PI / 2);
      out.push([ca + Math.cos(th) * r, n, cz + Math.sin(th) * r]);
    }
  };
  const w = a1 - a0;
  const h = z1 - z0;
  const t = Math.min(rt, w / 2, h / 2);
  const b = Math.min(rb, w / 2, h / 2);
  // counter-clockwise from the bottom left, in (a, z)
  if (b > 0.001) corner(a0 + b, z0 + b, b, Math.PI);
  else out.push([a0, n, z0]);
  if (b > 0.001) corner(a1 - b, z0 + b, b, Math.PI * 1.5);
  else out.push([a1, n, z0]);
  if (t > 0.001) corner(a1 - t, z1 - t, t, 0);
  else out.push([a1, n, z1]);
  if (t > 0.001) corner(a0 + t, z1 - t, t, Math.PI / 2);
  else out.push([a0, n, z1]);
  return out;
}

// The same on the level plane z: (u0, v0) to (u1, v1), every corner r.
export function rflat(u0: number, v0: number, u1: number, v1: number, z: number, r: number, steps = 5): P3[] {
  const out: P3[] = [];
  const rr = Math.min(r, (u1 - u0) / 2, (v1 - v0) / 2);
  const corner = (cu: number, cv: number, from: number) => {
    for (let i = 0; i <= steps; i++) {
      const th = from + (i / steps) * (Math.PI / 2);
      out.push([cu + Math.cos(th) * rr, cv + Math.sin(th) * rr, z]);
    }
  };
  corner(u0 + rr, v0 + rr, Math.PI);
  corner(u1 - rr, v0 + rr, Math.PI * 1.5);
  corner(u1 - rr, v1 - rr, 0);
  corner(u0 + rr, v1 - rr, Math.PI / 2);
  return out;
}

// Tiny lit dots at frame points (rivets, indicator pips), only zoomed in.
export function rivets(k: Kit, pts: ReadonlyArray<P3>, color: Color = '#eef2f8', r = 0.12): void {
  if (!k.fine || !pts.length) return;
  const pen = k.pen;
  const px = Math.max(0.7, r * k.s);
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x + px, y);
    pen.arc(x, y, px, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha(INK, 0.5);
  pen.fill();
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x - px * 0.25 + px * 0.55, y - px * 0.3);
    pen.arc(x - px * 0.25, y - px * 0.3, px * 0.55, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();
}

// Round lights at frame points, each a dot of `color` (px at least `min`).
export function pips(k: Kit, pts: ReadonlyArray<P3>, color: Color, r = 0.16, min = 0.8): void {
  if (!pts.length) return;
  const pen = k.pen;
  const px = Math.max(min, r * k.s);
  pen.beginPath();
  for (const [u, v, z] of pts) {
    const [x, y] = k.p(u, v, z);
    pen.moveTo(x + px, y);
    pen.arc(x, y, px, 0, Math.PI * 2);
  }
  pen.fillStyle = color;
  pen.fill();
}

// ── screens and holograms ────────────────────────────────────────────────────

// A screen's dark glass on a quad (a gradient and a sheen), inked round.
export function glassQuad(k: Kit, q: Quad, top: Color = '#2c2650', low: Color = '#191632', line = k.thin): void {
  k.poly([...q], k.grad(q[3], q[1], [[0, top], [1, low]]), line);
  k.poly([on(q, 0.58, 0.05), on(q, 0.72, 0.05), on(q, 0.46, 0.95), on(q, 0.32, 0.95)], '#ffffff12', 0);
}

// A planet map on a screen quad: landmasses, their contour lines and a
// faint grid (no text: shapes only).
export function mapOn(k: Kit, q: Quad, seed: number): void {
  const pen = k.pen;
  // grid
  const grid: Array<[P3, P3]> = [];
  for (const f of [0.25, 0.5, 0.75]) {
    grid.push([on(q, f, 0.08), on(q, f, 0.92)]);
    grid.push([on(q, 0.06, f), on(q, 0.94, f)]);
  }
  k.segs(grid, withAlpha(C.cyan, 0.22), Math.max(0.6, 0.05 * k.s));
  // two or three islands of land, each a blob with a contour or two inside
  const blobs = 2 + Math.floor(hash(seed, 1) * 2);
  for (let b = 0; b < blobs; b++) {
    const cu = 0.22 + hash(seed, b, 2) * 0.56;
    const cz = 0.25 + hash(seed, b, 3) * 0.5;
    const r = 0.13 + hash(seed, b, 4) * 0.12;
    const blob = (scale: number): P3[] => {
      const pts: P3[] = [];
      for (let i = 0; i < 14; i++) {
        const th = (i / 14) * Math.PI * 2;
        const rr = r * scale * (0.75 + hash(seed, b * 20 + i, 5) * 0.45);
        pts.push(on(q, Math.min(0.94, Math.max(0.06, cu + Math.cos(th) * rr * 0.8)), Math.min(0.92, Math.max(0.08, cz + Math.sin(th) * rr))));
      }
      return pts;
    };
    const land = b % 2 ? C.flora : C.grass;
    k.poly(blob(1), withAlpha(land, 0.75), 0, 0.15);
    pen.beginPath();
    k.trace(blob(0.62), 0.12);
    if (k.fine) k.trace(blob(0.3), 0.08);
    pen.strokeStyle = withAlpha('#ffffff', 0.55);
    pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    pen.stroke();
  }
}

// A hologram globe of wire lines round (cu, cv, cz), r units, at strength a
// (0..1): a faint disc, its rim, meridians and parallels, a soft halo.
export function holoGlobe(k: Kit, cu: number, cv: number, cz: number, r: number, a: number, spin = 0, color: Color = C.holo): void {
  const [x, y] = k.p(cu, cv, cz);
  const R = r * k.s;
  const pen = k.pen;
  k.halo(cu, cv, cz, r * 1.25, color, 0.3 * a);
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  pen.fillStyle = withAlpha(color, 0.16 * a);
  pen.fill();
  pen.beginPath();
  // meridians, turning with spin
  for (let i = 0; i < 3; i++) {
    const ph = spin + (i / 3) * Math.PI;
    const rx = Math.abs(Math.cos(ph)) * R;
    if (rx < 0.5) {
      pen.moveTo(x, y - R);
      pen.lineTo(x, y + R);
      continue;
    }
    pen.moveTo(x + rx, y);
    pen.ellipse(x, y, rx, R, 0, 0, Math.PI * 2);
  }
  // the equator and two parallels
  for (const f of [-0.55, 0, 0.55]) {
    const yy = y + f * R;
    const rx = Math.sqrt(1 - f * f) * R;
    pen.moveTo(x + rx, yy);
    pen.ellipse(x, yy, rx, rx * 0.28, 0, 0, Math.PI * 2);
  }
  pen.strokeStyle = withAlpha(color, 0.55 * a);
  pen.lineWidth = Math.max(0.6, 0.07 * k.s);
  pen.stroke();
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  pen.strokeStyle = withAlpha(shade(color, 0.3), 0.9 * a);
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.stroke();
}

// ── small things ────────────────────────────────────────────────────────────

// A mug standing on z, handle toward +u, a coloured band round it, ink
// round it `line` px.
export function mug(k: Kit, u: number, v: number, z: number, color: Color = C.white, r = 0.42, bandC: Color = C.magenta, line = k.lw): void {
  k.rod([[u + r * 0.9, v, z + r * 1.7], [u + r * 1.55, v, z + r * 1.3], [u + r * 0.9, v, z + r * 0.6]], color, Math.max(0.07, r * 0.2));
  k.cyl(u, v, z, r, r * 2.1, color, { line });
  band(k, u, v, r, z + r * 0.9, z + r * 1.35);
  k.paint(bandC, 0);
  k.disc(u, v, z + r * 2.1 - 0.04, r * 0.78, '#6a3a2a', 0);
}

// A hover stool: a round white seat on a slim post, a ring of light at its
// foot (no legs: it stands on a glowing disc).
export function stool(k: Kit, cu: number, cv: number, seat: Color = C.magenta, h = 3.6): void {
  k.shadow(cu, cv, 1.25, 1.25, 0.24);
  k.cyl(cu, cv, 0, 0.95, 0.3, C.panelDark);
  k.disc(cu, cv, 0.31, 0.6, withAlpha(C.cyan, 0.85), 0);
  k.cyl(cu, cv, 0.3, 0.2, h - 0.9, C.panel);
  k.cyl(cu, cv, h - 0.6, 1.05, 0.45, C.white);
  k.disc(cu, cv, h - 0.13, 0.82, seat, k.thin);
}

// A cargo crate: a white box with orange bands round its corners, a lid
// seam and a handle on each side the viewer sees.
export function crateBox(k: Kit, u: number, v: number, z: number, du: number, dv: number, dz: number, body: Color = C.white, stripe: Color = C.orange, seed = 0): void {
  k.box(u, v, z, du, dv, dz, body, { round: 0.25 });
  const bw = Math.min(0.7, du * 0.16);
  // corner bands on the front (+v) and the end (+u)
  const fv = v + dv + 0.01;
  const eu = u + du + 0.01;
  k.poly([[u, fv, z], [u + bw, fv, z], [u + bw, fv, z + dz], [u, fv, z + dz]], k.side(stripe, 0, 1, 0.14), 0);
  k.poly([[u + du - bw, fv, z], [u + du, fv, z], [u + du, fv, z + dz], [u + du - bw, fv, z + dz]], k.side(stripe, 0, 1, 0.14), 0);
  k.poly([[eu, v + dv - bw, z], [eu, v + dv, z], [eu, v + dv, z + dz], [eu, v + dv - bw, z + dz]], k.side(stripe, 1, 0, 0.14), 0);
  k.poly([[eu, v, z], [eu, v + bw, z], [eu, v + bw, z + dz], [eu, v, z + dz]], k.side(stripe, 1, 0, 0.14), 0);
  // the lid's seam round the two faces in view
  k.line([[u, fv, z + dz * 0.78], [u + du, fv, z + dz * 0.78], [eu, v, z + dz * 0.78]], withAlpha(INK, 0.7), k.thin * 0.8);
  // handles: dark slots
  const hz = z + dz * 0.5;
  k.poly([[u + du * 0.35, fv + 0.01, hz - 0.25], [u + du * 0.65, fv + 0.01, hz - 0.25], [u + du * 0.65, fv + 0.01, hz + 0.25], [u + du * 0.35, fv + 0.01, hz + 0.25]], shade(C.panelDark, -0.3), k.thin * 0.7, 0.15);
  k.poly([[eu + 0.01, v + dv * 0.35, hz - 0.25], [eu + 0.01, v + dv * 0.65, hz - 0.25], [eu + 0.01, v + dv * 0.65, hz + 0.25], [eu + 0.01, v + dv * 0.35, hz + 0.25]], shade(C.panelDark, -0.4), k.thin * 0.7, 0.15);
  // a stencilled chevron or a dot on top, by seed
  if (hash(seed, 7) < 0.5) {
    const cu = u + du / 2;
    const cv = v + dv / 2;
    k.poly([[cu - 0.7, cv + 0.5, z + dz + 0.01], [cu, cv - 0.3, z + dz + 0.01], [cu + 0.7, cv + 0.5, z + dz + 0.01], [cu, cv + 0.05, z + dz + 0.01]], withAlpha(stripe, 0.9), 0);
  } else {
    k.disc(u + du / 2, v + dv / 2, z + dz + 0.01, Math.min(du, dv) * 0.18, withAlpha(stripe, 0.9), 0);
  }
}

// ── the planet's flora ──────────────────────────────────────────────────────
// Drawn on the upright plane v = n from a foot at (a, z): giant odd plants
// seen through the glass, and the little ones in the base's pots.

// Points along a curving stalk from (a, z) up h, its tip leaning by `lean`.
function stalkPts(a: number, n: number, z: number, h: number, lean: number, steps = 8): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    out.push([a + lean * t * t, n, z + h * t]);
  }
  return out;
}

// A stalk as a tapering ribbon of width w at the foot, ink round it.
function stalk(k: Kit, pts: ReadonlyArray<P3>, w: number, color: Color, line: number): void {
  const left: P3[] = [];
  const right: P3[] = [];
  pts.forEach(([a, n, z], i) => {
    const t = i / (pts.length - 1);
    const half = (w * (1 - t * 0.55)) / 2;
    left.push([a - half, n, z]);
    right.push([a + half, n, z]);
  });
  k.poly([...left, ...right.reverse()], color, line);
}

// A bulb-topped stalk: a glowing round pod on a tall curving stalk.
export function bulbPlant(k: Kit, a: number, n: number, z: number, h: number, lean: number, r: number, color: Color, line = k.thin, glow = 0.35): void {
  const pts = stalkPts(a, n, z, h, lean);
  stalk(k, pts, Math.max(0.35, r * 0.32), C.stalk, line);
  const [ta, , tz] = pts[pts.length - 1];
  if (glow > 0) k.halo(ta, n, tz + r * 0.4, r * 2, color, glow);
  const [x, y] = k.p(ta, n, tz + r * 0.55);
  const R = r * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, R * 0.92, R, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - R * 0.35, y - R * 0.4, 0, x, y, R * 1.1);
  g.addColorStop(0, shade(color, 0.55));
  g.addColorStop(0.45, color);
  g.addColorStop(1, shade(color, -0.25));
  k.paint(g, line);
  // a shine
  pen.beginPath();
  pen.ellipse(x - R * 0.35, y - R * 0.42, R * 0.22, R * 0.15, -0.6, 0, Math.PI * 2);
  pen.fillStyle = '#ffffffb0';
  pen.fill();
}

// A spiral frond: a stalk that leans out by `lean` and curls over into a
// fiddlehead of radius r on the side `dir` (+1 or -1).
export function frondPlant(k: Kit, a: number, n: number, z: number, h: number, dir: number, r: number, color: Color, line = k.thin, lean = dir * r * 0.4): void {
  // the stalk rises, then winds inward round a centre beside its top
  const pts: P3[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([a + lean * t * t, n, z + (h - r) * t]);
  }
  const ca = a + lean + dir * r;
  const cz = z + h - r;
  for (let i = 1; i <= 22; i++) {
    const th = Math.PI - (i / 22) * Math.PI * 2.3;
    const rr = r * (1 - (i / 22) * 0.85);
    pts.push([ca + dir * Math.cos(th) * rr, n, cz + Math.sin(th) * rr]);
  }
  const wpx = Math.max(1.2, r * 0.42 * k.s);
  k.line(pts, INK, wpx + line * 2);
  k.line(pts, color, wpx);
  // little leaves up the stalk, one side then the other, reaching up
  for (let i = 3; i < steps; i += 2) {
    const [pa, , pz] = pts[i];
    const side = (i >> 1) & 1 ? 1 : -1;
    const [x, y] = k.p(pa, n, pz);
    const [x1, y1] = k.p(pa + side * r * 0.9, n, pz + r * 0.7);
    const L = Math.hypot(x1 - x, y1 - y);
    if (L >= 1.5) leaf(k, x, y, Math.atan2(y1 - y, x1 - x), L, L * 0.32, shade(color, 0.18));
  }
}

// One pointed leaf from (x, y) toward angle a, length L px (screen space),
// a rib down its middle when it is big enough to see.
export function leaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color): void {
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
  if (L > 10) {
    pen.beginPath();
    pen.moveTo(x0, y0);
    const [rx, ry] = P(L * 0.85, 0);
    pen.lineTo(rx, ry);
    pen.strokeStyle = shade(fill, -0.3);
    pen.lineWidth = Math.max(0.7, k.thin * 0.6);
    pen.stroke();
  }
}

// A puffball tree: a slim trunk and round puffs of colour, the lit one on top.
export function puffPlant(k: Kit, a: number, n: number, z: number, h: number, r: number, color: Color, line = k.thin, seed = 0): void {
  const pts = stalkPts(a, n, z, h - r * 0.6, (hash(seed, 3) - 0.5) * r);
  stalk(k, pts, Math.max(0.35, r * 0.3), shade(C.stalk, -0.05), line);
  const [ta, , tz] = pts[pts.length - 1];
  const puffs: Array<[number, number, number]> = [
    [-r * 0.7, -r * 0.15, r * 0.7],
    [r * 0.75, -r * 0.05, r * 0.65],
    [0, r * 0.35, r * 0.85],
  ];
  const pen = k.pen;
  for (const [da, dz, pr] of puffs) {
    const [x, y] = k.p(ta + da, n, tz + dz);
    const R = pr * k.s;
    pen.beginPath();
    pen.arc(x, y, R, 0, Math.PI * 2);
    const g = pen.createRadialGradient(x - R * 0.4, y - R * 0.45, 0, x, y, R * 1.05);
    g.addColorStop(0, shade(color, 0.4));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.22));
    k.paint(g, line);
  }
  // speckles on the top puff
  if (k.fine) {
    const [x, y] = k.p(ta, n, tz + r * 0.35);
    pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const px = x + (hash(seed, i, 5) - 0.5) * r * k.s;
      const py = y + (hash(seed, i, 6) - 0.5) * r * k.s * 0.8;
      pen.moveTo(px + 0.12 * k.s, py);
      pen.arc(px, py, 0.12 * k.s, 0, Math.PI * 2);
    }
    pen.fillStyle = '#ffffff90';
    pen.fill();
  }
}

// ── the prefab's stores ─────────────────────────────────────────────────────

// An upright capsule standing on z0, h tall and r round: rounded ends, a
// coloured lid band from bz0 to bz1 (heights over z0), shaded across, ink
// round it (`line` px) and along the band's edges.
export function capsule(k: Kit, cu: number, cv: number, z0: number, r: number, h: number, body: Color, bandC: Color, bz0: number, bz1: number, line = k.lw): void {
  const e = r * 0.42; // how far each rounded end reaches
  const prof: Array<{ z: number; r: number }> = [];
  for (let i = 0; i <= 4; i++) {
    const ph = (i / 4) * (Math.PI / 2);
    prof.push({ z: z0 + e - e * Math.cos(ph), r: r * (0.55 + 0.45 * Math.sin(ph)) });
    prof.push({ z: z0 + h - e + e * Math.sin(ph), r: r * (0.55 + 0.45 * Math.cos(ph)) });
  }
  prof.push({ z: z0 + bz0, r }, { z: z0 + bz1, r });
  const pts = (from: number, to: number) => prof.filter((q) => q.z >= from - 1e-6 && q.z <= to + 1e-6).flatMap((q) => ring(k, [cu, cv, q.z], [0, 0, 1], q.r, 20));
  const sil = hull(pts(-Infinity, Infinity));
  const g = across(k, sil, body, 0.12, 0.26);
  fillPts(k, sil, g, 0);
  fillPts(k, hull(pts(z0 + bz0, z0 + bz1)), across(k, sil, bandC, 0.1, 0.22), 0);
  fillPts(k, hull(pts(z0 + bz1, Infinity)), g, 0);
  for (const z of [z0 + bz0, z0 + bz1]) {
    const el = k.ell(cu, cv, z, r);
    k.pen.beginPath();
    k.pen.ellipse(el.cx, el.cy, el.rx, el.ry, el.rot, 0, Math.PI);
    k.paint(null, Math.min(line, k.thin) * 0.8);
  }
  fillPts(k, sil, null, line);
}

// A big paddle leaf from screen point (x, y) toward angle a, L px long and
// w px wide at its widest (two thirds along), a rib down it.
export function paddleLeaf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color): void {
  const pen = k.pen;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (s: number, t: number): Pt => [x + ca * s - sa * t, y + sa * s + ca * t];
  const [x0, y0] = P(0, 0);
  pen.beginPath();
  pen.moveTo(x0, y0);
  const c = [P(L * 0.2, -w * 0.5), P(L * 0.55, -w * 1.05), P(L * 1.02, -w * 0.75), P(L * 1.02, w * 0.75), P(L * 0.55, w * 1.05), P(L * 0.2, w * 0.5)];
  const tip = P(L, 0);
  pen.bezierCurveTo(c[0][0], c[0][1], c[1][0], c[1][1], P(L * 0.72, -w * 0.82)[0], P(L * 0.72, -w * 0.82)[1]);
  pen.bezierCurveTo(c[2][0], c[2][1], tip[0] + sa * w * 0.3, tip[1] - ca * w * 0.3, tip[0], tip[1]);
  pen.bezierCurveTo(tip[0] - sa * w * 0.3, tip[1] + ca * w * 0.3, c[3][0], c[3][1], P(L * 0.72, w * 0.82)[0], P(L * 0.72, w * 0.82)[1]);
  pen.bezierCurveTo(c[4][0], c[4][1], c[5][0], c[5][1], x0, y0);
  pen.closePath();
  const g = pen.createLinearGradient(P(0, -w)[0], P(0, -w)[1], P(0, w)[0], P(0, w)[1]);
  g.addColorStop(0, shade(fill, 0.22));
  g.addColorStop(0.55, fill);
  g.addColorStop(1, shade(fill, -0.18));
  k.paint(g, k.thin);
  if (L > 6) {
    pen.beginPath();
    pen.moveTo(x0, y0);
    const [rx, ry] = P(L * 0.9, 0);
    pen.lineTo(rx, ry);
    pen.strokeStyle = shade(fill, -0.32);
    pen.lineWidth = Math.max(0.7, k.thin * 0.6);
    pen.stroke();
  }
}

// A cone tree on the plane v = n: a tall narrow cone from a foot w wide at
// (a, z), h high, its tip leaning by `lean`, ribbed in slanting rings that
// wind up it, lit on its left.
export function coneTree(k: Kit, a: number, n: number, z: number, h: number, w: number, color: Color, line = k.thin, lean = 0): void {
  const L: P3[] = [];
  const R: P3[] = [];
  const steps = 10;
  const at = (t: number) => a + lean * t * t;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const half = (w / 2) * (1 - t) ** 0.85;
    L.push([at(t) - half, n, z + h * t]);
    R.push([at(t) + half, n, z + h * t]);
  }
  const pts = [...L, ...R.reverse()];
  const [x0] = k.p(a - w / 2, n, z);
  const [x1] = k.p(a + w / 2, n, z);
  const [, y0] = k.p(a, n, z);
  const g = k.pen.createLinearGradient(Math.min(x0, x1), y0, Math.max(x0, x1), y0);
  g.addColorStop(0, shade(color, 0.22));
  g.addColorStop(0.55, color);
  g.addColorStop(1, shade(color, -0.25));
  k.poly(pts, g, line);
  // the rings: slanting bands up the cone, closer together toward its tip
  const ribs: Array<[P3, P3]> = [];
  const rings = Math.max(3, Math.round(h / (w * 0.42)));
  for (let i = 1; i < rings; i++) {
    const t = 1 - (1 - i / rings) ** 1.3;
    const half = (w / 2) * (1 - t) ** 0.85 * 0.98;
    const zz = z + h * t;
    ribs.push([[at(t) - half, n, zz - w * 0.1], [at(t) + half, n, zz + w * 0.14]]);
  }
  k.segs(ribs, withAlpha(shade(color, -0.45), 0.85), Math.max(0.6, line * 0.8), 'round');
  if (k.s >= 5) k.segs(ribs.map(([p, q]): [P3, P3] => [[p[0], n, p[2] + w * 0.08], [q[0] - w * 0.15, n, q[2] + w * 0.06]]), withAlpha(shade(color, 0.35), 0.6), Math.max(0.5, line * 0.5), 'round');
}

// A red-cap mushroom on the plane v = n: a pale teal stem at (a, z), a
// round red cap r wide with white spots.
export function mushroom(k: Kit, a: number, n: number, z: number, r: number, line = k.thin, cap: Color = '#e2453c'): void {
  const pen = k.pen;
  k.poly([[a - r * 0.26, n, z], [a + r * 0.26, n, z], [a + r * 0.2, n, z + r * 0.95], [a - r * 0.2, n, z + r * 0.95]], '#9fdde0', line);
  const [x, y] = k.p(a, n, z + r * 0.85);
  const R = r * k.s;
  pen.beginPath();
  pen.ellipse(x, y, R, R * 0.78, 0, Math.PI, Math.PI * 2);
  pen.quadraticCurveTo(x, y + R * 0.22, x - R, y);
  pen.closePath();
  const g = pen.createRadialGradient(x - R * 0.35, y - R * 0.55, 0, x, y - R * 0.3, R * 1.1);
  g.addColorStop(0, shade(cap, 0.35));
  g.addColorStop(0.6, cap);
  g.addColorStop(1, shade(cap, -0.25));
  k.paint(g, line);
  if (R < 2.5) return;
  pen.beginPath();
  for (const [dx, dy, sr] of [[-0.45, -0.3, 0.16], [0.1, -0.58, 0.13], [0.5, -0.25, 0.15], [-0.05, -0.18, 0.1]] as const) {
    pen.moveTo(x + dx * R + sr * R, y + dy * R);
    pen.arc(x + dx * R, y + dy * R, sr * R, 0, Math.PI * 2);
  }
  pen.fillStyle = '#fff6f0';
  pen.fill();
}
