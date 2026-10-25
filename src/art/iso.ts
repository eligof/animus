// Shared art primitives for the illustrated worlds, so every prop is drawn
// the same way: outlined-cartoon boxes and cylinders (ink outline, faces
// lit from the upper left), floor quads, soft contact shadows, glows and
// colour helpers.
//
// Everything draws through an `At` that maps units to canvas px, so one
// drawing serves both wall frames and islands:
//   project(ox, oy, s)        world (x, y, z) -> px (the scene projection)
//   frame(P, wall, x0, y0)    prop-local (u along the wall, v out of it, z)
//   scaleOf(at)               px per unit (the length of one unit of z)
//   isoBox, boxFaces, isoCylinder, floorQuad, contactShadow, glow
//   path(pen, pts, round)     a polygon path, corners optionally rounded
//   inked(pen, fill, ink, w)  fill then outline the current path
//   shade, mix, alpha, rgbOf, hexOf, ink, inkWidth
// Faces are culled by projected winding and shaded by which way they face
// on screen, never by which wall a prop stands on.

import { parseColor } from './canvas.ts';
import type { Color, Gradient, Pen } from './types.ts';

export type At = (u: number, v: number, z: number) => [number, number];
export type RGB = readonly [number, number, number];
type Pt = [number, number];

// Default ink: a warm dark plum. Worlds pass their own.
export const INK: Color = '#2b2233';

// ---- colour -------------------------------------------------------------------

const WARM: RGB = [255, 248, 228]; // what lit faces lift toward
const COOL: RGB = [34, 26, 62]; // what shaded faces sink toward

function rgba(c: Color): [number, number, number, number] {
  const p = parseColor(c);
  if (!p) throw new TypeError(`unparseable colour '${c}'`);
  return [p[0], p[1], p[2], p[3]];
}

const hex2 = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');

// '#rrggbb', or '#rrggbbaa' when a < 1.
export function hexOf(c: RGB, a = 1): Color {
  return `#${hex2(c[0])}${hex2(c[1])}${hex2(c[2])}${a < 1 ? hex2(a * 255) : ''}`;
}

export function rgbOf(c: Color): [number, number, number] {
  const [r, g, b] = rgba(c);
  return [Math.round(r), Math.round(g), Math.round(b)];
}

// c with its alpha replaced by a.
export function alpha(c: Color, a: number): Color {
  const [r, g, b] = rgba(c);
  return hexOf([r, g, b], Math.max(0, Math.min(1, a)));
}

// Straight-RGBA blend from a (t = 0) to b (t = 1).
export function mix(a: Color, b: Color, t: number): Color {
  const p = rgba(a);
  const q = rgba(b);
  const k = Math.max(0, Math.min(1, t));
  const f = (i: number) => p[i] + (q[i] - p[i]) * k;
  return hexOf([f(0), f(1), f(2)], f(3));
}

// k > 0 lifts toward a warm white, k < 0 sinks toward a cool dark (hue
// shifted like painted light and shade); |k| is the blend amount.
export function shade(c: Color, k: number): Color {
  const [r, g, b, a] = rgba(c);
  const to = k >= 0 ? WARM : COOL;
  const t = Math.min(1, Math.abs(k));
  return hexOf([r + (to[0] - r) * t, g + (to[1] - g) * t, b + (to[2] - b) * t], a);
}

// A world's ink from its dominant colour: very dark, keeping a hint of hue.
export function ink(c: Color): Color {
  return mix(c, '#120d18', 0.82);
}

// Outline width in px for props at s px per unit (figures use 0.28 s).
export function inkWidth(s: number): number {
  return Math.max(1.5, 0.3 * s);
}

// ---- projection -----------------------------------------------------------------

// The scene's 2:1 projection: larger x + y is nearer the viewer.
export function project(ox: number, oy: number, s: number): At {
  return (x, y, z) => [ox + (x - y) * s, oy + ((x + y) * s) / 2 - z * s];
}

// Prop-local units on a wall: u runs along the wall, v out into the room.
// The left wall (x < T) runs along y, the right wall (y < T) along x.
export function frame(P: At, wall: 'left' | 'right', x0: number, y0: number): At {
  return wall === 'left' ? (u, v, z) => P(x0 + v, y0 + u, z) : (u, v, z) => P(x0 + u, y0 + v, z);
}

export function scaleOf(at: At): number {
  const [x0, y0] = at(0, 0, 0);
  const [x1, y1] = at(0, 0, 1);
  return Math.hypot(x1 - x0, y1 - y0);
}

// ---- paths ------------------------------------------------------------------------

// Adds a closed polygon to the path; round > 0 cuts each corner with a
// quadratic of that many px (clamped to half the shorter neighbour edge).
export function path(pen: Pen, pts: ReadonlyArray<Pt>, round = 0): void {
  const n = pts.length;
  if (n < 2) return;
  if (round <= 0) {
    pen.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < n; i++) pen.lineTo(pts[i][0], pts[i][1]);
    pen.closePath();
    return;
  }
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n];
    const c = pts[i];
    const q = pts[(i + 1) % n];
    const lp = Math.hypot(p[0] - c[0], p[1] - c[1]);
    const lq = Math.hypot(q[0] - c[0], q[1] - c[1]);
    const r = Math.min(round, lp / 2, lq / 2);
    const ax = c[0] + ((p[0] - c[0]) * r) / (lp || 1);
    const ay = c[1] + ((p[1] - c[1]) * r) / (lp || 1);
    if (i === 0) pen.moveTo(ax, ay);
    else pen.lineTo(ax, ay);
    pen.quadraticCurveTo(c[0], c[1], c[0] + ((q[0] - c[0]) * r) / (lq || 1), c[1] + ((q[1] - c[1]) * r) / (lq || 1));
  }
  pen.closePath();
}

// Fills the current path, then strokes it in ink with round joins: the
// cheap way to draw any outlined shape (the path is built once). Line 0
// skips the outline.
export function inked(pen: Pen, fill: Color | Gradient, inkColor: Color = INK, line = 1.5): void {
  pen.fillStyle = fill;
  pen.fill();
  if (line <= 0) return;
  pen.strokeStyle = inkColor;
  pen.lineWidth = line;
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  pen.stroke();
}

// ---- boxes ----------------------------------------------------------------------

export type Side = '+u' | '-u' | '+v' | '-v' | '+z' | '-z';
export type Face = { side: Side; kind: 'top' | 'left' | 'right'; pts: Pt[] };

// Corner i of a box: bit 0 -> u1, bit 1 -> v1, bit 2 -> z1. Each face lists
// its corners counter-clockwise seen from outside (right-handed u, v, z).
const FACES: ReadonlyArray<[Side, number[]]> = [
  ['+z', [4, 5, 7, 6]],
  ['-z', [0, 2, 3, 1]],
  ['+u', [1, 3, 7, 5]],
  ['-u', [0, 4, 6, 2]],
  ['+v', [2, 6, 7, 3]],
  ['-v', [0, 1, 5, 4]],
];
const EDGES: ReadonlyArray<[number, number, Side, Side]> = [
  [0, 4, '-u', '-v'],
  [1, 5, '+u', '-v'],
  [3, 7, '+u', '+v'],
  [2, 6, '-u', '+v'],
  [4, 5, '+z', '-v'],
  [5, 7, '+z', '+u'],
  [7, 6, '+z', '+v'],
  [6, 4, '+z', '-u'],
  [0, 1, '-z', '-v'],
  [1, 3, '-z', '+u'],
  [3, 2, '-z', '+v'],
  [2, 0, '-z', '-u'],
];

function corners(at: At, u0: number, v0: number, z0: number, du: number, dv: number, dz: number): Pt[] {
  if (du < 0) [u0, du] = [u0 + du, -du];
  if (dv < 0) [v0, dv] = [v0 + dv, -dv];
  if (dz < 0) [z0, dz] = [z0 + dz, -dz];
  const c: Pt[] = [];
  for (let i = 0; i < 8; i++) c.push(at(i & 1 ? u0 + du : u0, i & 2 ? v0 + dv : v0, i & 4 ? z0 + dz : z0));
  return c;
}

function area(p: ReadonlyArray<Pt>): number {
  let a = 0;
  for (let i = 0; i < p.length; i++) {
    const q = p[(i + 1) % p.length];
    a += p[i][0] * q[1] - q[0] * p[i][1];
  }
  return a / 2;
}

const cross = (a: Pt, b: Pt) => a[0] * b[1] - a[1] * b[0];

// Screen directions of one unit along u, v and z at the origin.
function axes(at: At): [Pt, Pt, Pt] {
  const [ox, oy] = at(0, 0, 0);
  const d = (p: Pt): Pt => [p[0] - ox, p[1] - oy];
  return [d(at(1, 0, 0)), d(at(0, 1, 0)), d(at(0, 0, 1))];
}

// The faces of a box that face the viewer, with their shading role: a face
// is visible when its projected winding matches the top's (the camera looks
// down), and a side is 'left' or 'right' by where its normal points on
// screen (light comes from the upper left).
export function boxFaces(at: At, u0: number, v0: number, z0: number, du: number, dv: number, dz: number): Face[] {
  const c = corners(at, u0, v0, z0, du, dv, dz);
  const [eu, ev] = axes(at);
  const sign = Math.sign(cross(eu, ev));
  const out: Face[] = [];
  for (const [side, idx] of FACES) {
    const pts = idx.map((i) => c[i]);
    if (!(area(pts) * sign > 1e-6)) continue;
    let kind: Face['kind'] = 'top';
    if (side[1] !== 'z') {
      const nx = (side[0] === '+' ? 1 : -1) * (side[1] === 'u' ? eu : ev)[0];
      kind = nx < 0 ? 'left' : 'right';
    }
    out.push({ side, kind, pts });
  }
  return out;
}

function hull(pts: ReadonlyArray<Pt>): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && turn(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && turn(up[up.length - 2], up[up.length - 1], q) <= 1e-9) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// A convex polygon moved in by d px on every edge.
function inset(p: ReadonlyArray<Pt>, d: number): Pt[] {
  const n = p.length;
  const cx = p.reduce((s, q) => s + q[0], 0) / n;
  const cy = p.reduce((s, q) => s + q[1], 0) / n;
  const nrm: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = p[i];
    const b = p[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    let nx = -(b[1] - a[1]) / l;
    let ny = (b[0] - a[0]) / l;
    if (nx * (cx - a[0]) + ny * (cy - a[1]) < 0) [nx, ny] = [-nx, -ny];
    nrm.push([nx, ny]);
  }
  return p.map((q, i) => {
    const m = nrm[(i + n - 1) % n];
    const k = nrm[i];
    const f = d / (1 + m[0] * k[0] + m[1] * k[1]);
    return [q[0] + f * (m[0] + k[0]), q[1] + f * (m[1] + k[1])] as Pt;
  });
}

export type BoxOpts = {
  ink?: Color;
  line?: number; // outline px (default inkWidth(s)); 0 = none
  round?: number; // silhouette corner radius in units
  top?: Color; // face colours (default: base lifted 12 %, base, base dropped 18 %)
  left?: Color;
  right?: Color;
  stripe?: boolean; // highlight stripe along the top's front edges (default true)
};

// A box from (u0, v0, z0) spanning du x dv x dz units: visible faces filled
// and shaded, a highlight stripe inside the top's front edges, thinner ink
// on the inner edges and a full-width ink outline round the silhouette.
export function isoBox(pen: Pen, at: At, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, base: Color, o: BoxOpts = {}): void {
  const faces = boxFaces(at, u0, v0, z0, du, dv, dz);
  if (!faces.length) return;
  const c = corners(at, u0, v0, z0, du, dv, dz);
  const s = scaleOf(at);
  const line = o.line ?? inkWidth(s);
  const inkC = o.ink ?? INK;
  const fills = { top: o.top ?? shade(base, 0.12), left: o.left ?? base, right: o.right ?? shade(base, -0.18) };
  const sil = hull(c);
  const round = (o.round ?? 0) * s;
  const seen = new Set(faces.map((f) => f.side));

  pen.save();
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  pen.save();
  pen.beginPath();
  path(pen, sil, round);
  if (round > 0) pen.clip();
  // under-fill: the faces' shared anti-aliased edges blend over this, not
  // over whatever is behind the box
  pen.fillStyle = fills.right;
  pen.fill();
  for (const f of faces) {
    pen.beginPath();
    path(pen, f.pts);
    pen.fillStyle = fills[f.kind];
    pen.fill();
  }
  const top = faces.find((f) => f.side === '+z');
  if (top && o.stripe !== false && line > 0) stripe(pen, top.pts, seen, line, fills.top);
  if (line > 0) {
    pen.beginPath();
    for (const [a, b, f, g] of EDGES) {
      if (!seen.has(f) || !seen.has(g)) continue;
      pen.moveTo(c[a][0], c[a][1]);
      pen.lineTo(c[b][0], c[b][1]);
    }
    pen.strokeStyle = inkC;
    pen.lineWidth = line * 0.6;
    pen.stroke();
  }
  pen.restore();
  if (line > 0) {
    pen.beginPath();
    path(pen, sil, round);
    pen.strokeStyle = inkC;
    pen.lineWidth = line;
    pen.stroke();
  }
  pen.restore();
}

// The top face's edges toward visible sides, as a light stripe just inside
// the ink line, its ends pulled in a little.
function stripe(pen: Pen, top: Pt[], seen: Set<Side>, line: number, base: Color): void {
  const sides: Side[] = ['-v', '+u', '+v', '-u']; // edge i of the top runs top[i] -> top[i + 1]
  const w = Math.max(1, line * 0.55);
  const d = line * 0.5 + w * 0.5 + 0.25;
  // skip tops too thin to hold it
  const a: Pt = [top[1][0] - top[0][0], top[1][1] - top[0][1]];
  const b: Pt = [top[3][0] - top[0][0], top[3][1] - top[0][1]];
  const ar = Math.abs(cross(a, b));
  if (Math.min(ar / (Math.hypot(...a) || 1), ar / (Math.hypot(...b) || 1)) < 4 * d) return;
  const q = inset(top, d);
  let first = -1;
  for (let i = 0; i < 4; i++) if (seen.has(sides[i]) && !seen.has(sides[(i + 3) % 4])) first = i;
  if (first < 0) return;
  const pts: Pt[] = [q[first]];
  for (let i = first; seen.has(sides[i % 4]) && pts.length < 5; i++) pts.push(q[(i + 1) % 4]);
  if (pts.length < 2) return;
  const pull = (p: Pt, toward: Pt): Pt => {
    const l = Math.hypot(toward[0] - p[0], toward[1] - p[1]) || 1;
    const k = Math.min(0.2 * l, 2.5 * line) / l;
    return [p[0] + (toward[0] - p[0]) * k, p[1] + (toward[1] - p[1]) * k];
  };
  pts[0] = pull(pts[0], pts[1]);
  pts[pts.length - 1] = pull(pts[pts.length - 1], pts[pts.length - 2]);
  pen.beginPath();
  pen.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) pen.lineTo(pts[i][0], pts[i][1]);
  pen.strokeStyle = mix(base, '#fffdf4', 0.45);
  pen.lineWidth = w;
  pen.stroke();
}

// ---- cylinders --------------------------------------------------------------------

// The screen ellipse of a radius-r floor circle at (cu, cv, z).
function ellipseOf(at: At, cu: number, cv: number, z: number, r: number) {
  const [cx, cy] = at(cu, cv, z);
  const [ax, ay] = at(cu + r, cv, z);
  const [bx, by] = at(cu, cv + r, z);
  const ux = ax - cx;
  const uy = ay - cy;
  const vx = bx - cx;
  const vy = by - cy;
  const p = ux * ux + vx * vx;
  const q = ux * uy + vx * vy;
  const t = uy * uy + vy * vy;
  const mid = (p + t) / 2;
  const dif = Math.hypot((p - t) / 2, q);
  return { cx, cy, rx: Math.sqrt(mid + dif), ry: Math.sqrt(Math.max(0, mid - dif)), rot: 0.5 * Math.atan2(2 * q, p - t) };
}

export type CylOpts = { ink?: Color; line?: number; top?: Color };

// An upright cylinder: the side shaded across with a gradient (lit left,
// dark right), an elliptical top, ink round the silhouette and thinner ink
// on the top's front rim.
export function isoCylinder(pen: Pen, at: At, cu: number, cv: number, z0: number, r: number, h: number, base: Color, o: CylOpts = {}): void {
  const bot = ellipseOf(at, cu, cv, z0, r);
  const [tx, ty] = at(cu, cv, z0 + h);
  const { rx, ry, rot } = bot;
  if (!(rx > 0)) return;
  const line = o.line ?? inkWidth(scaleOf(at));
  const inkC = o.ink ?? INK;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  // parameter of the rightmost point, and which way round is the front
  let tR = Math.atan2(-ry * sr, rx * cr);
  if (rx * Math.cos(tR) * cr - ry * Math.sin(tR) * sr < 0) tR += Math.PI;
  const tm = tR + Math.PI / 2;
  const fwd = rx * Math.cos(tm) * sr + ry * Math.sin(tm) * cr > 0;
  const half = fwd ? Math.PI : -Math.PI;
  const tL = tR + Math.PI;
  const ext = Math.hypot(rx * cr, ry * sr);

  const outline = () => {
    pen.beginPath();
    pen.ellipse(tx, ty, rx, ry, rot, tL, tL + half, !fwd); // back rim of the top
    pen.ellipse(bot.cx, bot.cy, rx, ry, rot, tR, tR + half, !fwd); // front of the base
    pen.closePath();
  };
  pen.save();
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  outline();
  const g = pen.createLinearGradient(bot.cx - ext, 0, bot.cx + ext, 0);
  g.addColorStop(0, shade(base, 0.06));
  g.addColorStop(0.3, shade(base, 0.14));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.24));
  pen.fillStyle = g;
  pen.fill();
  pen.beginPath();
  pen.ellipse(tx, ty, rx, ry, rot, 0, Math.PI * 2);
  pen.fillStyle = o.top ?? shade(base, 0.12);
  pen.fill();
  if (line > 0) {
    pen.strokeStyle = inkC;
    pen.beginPath();
    pen.ellipse(tx, ty, rx, ry, rot, tR, tR + half, !fwd);
    pen.lineWidth = line * 0.6;
    pen.stroke();
    outline();
    pen.lineWidth = line;
    pen.stroke();
  }
  pen.restore();
}

// ---- floors, shadows, light ---------------------------------------------------------

// A flat quad du x dv at height z (rugs, tiles, table tops). Outlined only
// when o.ink or o.line is given (default width: an inner line, 60 %).
export function floorQuad(pen: Pen, at: At, u0: number, v0: number, du: number, dv: number, z: number, fill: Color | Gradient, o: { ink?: Color; line?: number; round?: number } = {}): void {
  const s = scaleOf(at);
  const pts = [at(u0, v0, z), at(u0 + du, v0, z), at(u0 + du, v0 + dv, z), at(u0, v0 + dv, z)];
  pen.beginPath();
  path(pen, pts, (o.round ?? 0) * s);
  pen.fillStyle = fill;
  pen.fill();
  if (o.ink === undefined && o.line === undefined) return;
  const w = o.line ?? inkWidth(s) * 0.6;
  if (w <= 0) return;
  pen.save();
  pen.strokeStyle = o.ink ?? INK;
  pen.lineWidth = w;
  pen.lineJoin = 'round';
  pen.stroke();
  pen.restore();
}

// A soft dark ellipse on the floor (or at height z) under a prop or
// figure: radii ru, rv in units along u and v, radial falloff.
export function contactShadow(pen: Pen, at: At, cu: number, cv: number, ru: number, rv: number, a = 0.25, z = 0, color: Color = '#000000'): void {
  const [cx, cy] = at(cu, cv, z);
  const [ux, uy] = at(cu + ru, cv, z);
  const [vx, vy] = at(cu, cv + rv, z);
  const [r, g, b] = rgbOf(color);
  pen.save();
  pen.transform(ux - cx, uy - cy, vx - cx, vy - cy, cx, cy);
  const grad = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [t, k] of [[0, 1], [0.45, 0.85], [0.75, 0.4], [1, 0]]) grad.addColorStop(t, hexOf([r, g, b], a * k));
  pen.fillStyle = grad;
  pen.beginPath();
  pen.arc(0, 0, 1, 0, Math.PI * 2);
  pen.fill();
  pen.restore();
}

// A soft halo of radius r px round (x, y), added with `screen` (or
// `lighter` for hotter light). `a` is the centre's strength.
export function glow(pen: Pen, x: number, y: number, r: number, color: Color, a: number, op: 'screen' | 'lighter' = 'screen'): void {
  if (!(r > 0) || !(a > 0)) return;
  const rgb = rgbOf(color);
  pen.save();
  pen.globalCompositeOperation = op;
  const g = pen.createRadialGradient(x, y, 0, x, y, r);
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    g.addColorStop(t, hexOf(rgb, Math.min(1, a) * (1 - t) * (1 - t)));
  }
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(x, y, r, 0, Math.PI * 2);
  pen.fill();
  pen.restore();
}
