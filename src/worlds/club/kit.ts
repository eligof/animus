import { Canvas } from '../../art/canvas.ts';
import type { At, BoxOpts, CylOpts } from '../../art/iso.ts';
import { contactShadow, inkWidth, isoBox, isoCylinder, mix, path, shade } from '../../art/iso.ts';
import type { Color, Gradient, Pen } from '../../art/types.ts';
import type { PropView } from '../types.ts';

// The club's drawing kit (after the café's): its colours, the beat, and a
// Kit that draws in one frame (a prop's u, v, z or a wall's along, out, up)
// with the club's ink, so every piece shares one outline weight and one
// light. Neon tubes (a soft wash, the coloured glass, a white-hot core),
// a sprite cache for animated props (their still parts drawn once per
// scale, the moving bits on top every frame) and particle helpers.

export type Pt = [number, number];
export type P3 = [number, number, number];

// The one outline colour: a deep aubergine, nearly black.
export const INK = '#1b1024';

export const C = {
  // the room
  brick: '#6a3a52',
  brickLit: '#7a4560',
  brickDark: '#552c44',
  mortar: '#3a2236',
  paint: '#2a2131',
  concrete: '#3e3648',
  cap: '#4a4152',
  // materials
  black: '#2b2633',
  gear: '#37313f',
  steel: '#8e8aa3',
  steelDark: '#5f5a72',
  chrome: '#d3d2e2',
  velvet: '#8c1f5e',
  velvetDark: '#6c1749',
  plum: '#5a2a6e',
  wood: '#6a3c2a',
  woodDark: '#4a291f',
  brass: '#e2b24e',
  red: '#d8344c',
  leaf: '#3f9a5a',
  leafDark: '#2c7346',
  leafLight: '#6cc27a',
  paper: '#f1e7f4',
  glass: '#a8c8e8',
  screen: '#1a1430',
  // neon
  pink: '#ff3cac',
  cyan: '#21e6ff',
  lime: '#b6ff3b',
  violet: '#a45bff',
  amber: '#ffb547',
  hot: '#ff3b5c',
  white: '#fff4fb',
} as const;

export const NEONS: readonly Color[] = [C.pink, C.cyan, C.lime, C.violet, C.amber];

// ── the beat: 120 BPM ─────────────────────────────────────────────────────
// Four beats in two seconds: a station a local works is shown as a 2 s loop
// (see PropArt.animated), and comes round on the beat.
export const BEAT = 60 / 120;
export const beatOf = (t: number): number => Math.floor(t / BEAT);
// 1 on the kick, falling off sharply to the next.
export const kick = (t: number): number => (1 - (t / BEAT - Math.floor(t / BEAT))) ** 3;

// Deterministic noise in [0, 1) from a few integers.
export function hash(a: number, b = 0, c = 0): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Draws in one affine frame: at(u, v, z) to canvas px. Lit faces point
// screen-left (light from the upper left), whichever wall the frame is on.
export class Kit {
  readonly pen: Pen;
  readonly at: At;
  readonly s: number;
  readonly lw: number; // outline px
  readonly thin: number; // inner lines px
  readonly fine: boolean; // zoomed in enough for small detail
  private ox: number;
  private oy: number;
  readonly eu: Pt;
  readonly ev: Pt;
  readonly ez: Pt;

  constructor(pen: Pen, at: At, s: number) {
    this.pen = pen;
    this.at = at;
    this.s = s;
    this.lw = inkWidth(s);
    this.thin = Math.max(1, this.lw * 0.6);
    this.fine = s >= 7;
    const o = at(0, 0, 0);
    const d = (p: Pt): Pt => [p[0] - o[0], p[1] - o[1]];
    this.ox = o[0];
    this.oy = o[1];
    this.eu = d(at(1, 0, 0));
    this.ev = d(at(0, 1, 0));
    this.ez = d(at(0, 0, 1));
  }

  p(u: number, v: number, z: number): Pt {
    return [this.ox + u * this.eu[0] + v * this.ev[0] + z * this.ez[0], this.oy + u * this.eu[1] + v * this.ev[1] + z * this.ez[1]];
  }

  // True if a face whose outward normal is (nu, nv) is lit (faces screen-left).
  lit(nu: number, nv: number): boolean {
    return nu * this.eu[0] + nv * this.ev[0] < 0;
  }

  // A vertical face's colour by which way it faces.
  side(base: Color, nu: number, nv: number, k = 0.18): Color {
    return this.lit(nu, nv) ? base : shade(base, -k);
  }

  // True if the screen box round these frame points (grown by m px) falls
  // on the canvas: the shell skips what a tile of it cannot show.
  seen(pts: ReadonlyArray<P3>, m = 0): boolean {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const [u, v, z] of pts) {
      const [x, y] = this.p(u, v, z);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    return x1 + m >= 0 && y1 + m >= 0 && x0 - m <= this.pen.width && y0 - m <= this.pen.height;
  }

  // The box u0..u1 x v0..v1 x z0..z1 seen (see `seen`).
  seenBox(u0: number, v0: number, z0: number, u1: number, v1: number, z1: number, m = 0): boolean {
    return this.seen([[u0, v0, z0], [u1, v0, z0], [u0, v1, z0], [u1, v1, z0], [u0, v0, z1], [u1, v0, z1], [u0, v1, z1], [u1, v1, z1]], m);
  }

  box(u0: number, v0: number, z0: number, du: number, dv: number, dz: number, base: Color, o: BoxOpts = {}): void {
    isoBox(this.pen, this.at, u0, v0, z0, du, dv, dz, base, { ink: INK, line: this.lw, ...o });
  }

  cyl(cu: number, cv: number, z0: number, r: number, h: number, base: Color, o: CylOpts = {}): void {
    isoCylinder(this.pen, this.at, cu, cv, z0, r, h, base, { ink: INK, line: this.lw, ...o });
  }

  // Adds a polygon of frame points to the path.
  trace(pts: ReadonlyArray<P3>, round = 0): void {
    path(this.pen, pts.map(([u, v, z]) => this.p(u, v, z)), round * this.s);
  }

  // Fills a polygon of frame points; outlines it when line > 0.
  poly(pts: ReadonlyArray<P3>, fill: Color | Gradient, line = this.lw, round = 0): void {
    const pen = this.pen;
    pen.beginPath();
    this.trace(pts, round);
    this.paint(fill, line);
  }

  // A quad on the plane v = n: (a0, z0) to (a1, z1).
  rect(a0: number, n: number, z0: number, a1: number, z1: number, fill: Color | Gradient, line = 0, round = 0): void {
    this.poly([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]], fill, line, round);
  }

  // Fill then ink the current path.
  paint(fill: Color | Gradient | null, line = this.lw, ink: Color = INK): void {
    const pen = this.pen;
    if (fill) {
      pen.fillStyle = fill;
      pen.fill();
    }
    if (line > 0) {
      pen.strokeStyle = ink;
      pen.lineWidth = line;
      pen.lineJoin = 'round';
      pen.lineCap = 'round';
      pen.stroke();
    }
  }

  // An open polyline of frame points.
  line(pts: ReadonlyArray<P3>, color: Color | Gradient, width: number, cap: 'round' | 'butt' = 'round'): void {
    const pen = this.pen;
    pen.beginPath();
    pts.forEach(([u, v, z], i) => {
      const [x, y] = this.p(u, v, z);
      if (i) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.lineJoin = 'round';
    pen.lineCap = cap;
    pen.stroke();
  }

  // A bent rod (stands, rails, cables): ink under the colour.
  rod(pts: ReadonlyArray<P3>, color: Color, w: number): void {
    const px = w * this.s;
    this.line(pts, INK, px + this.lw * 1.4);
    this.line(pts, color, px);
  }

  // The screen ellipse of a level circle.
  ell(cu: number, cv: number, z: number, r: number): { cx: number; cy: number; rx: number; ry: number; rot: number } {
    const [cx, cy] = this.p(cu, cv, z);
    const ux = this.eu[0] * r;
    const uy = this.eu[1] * r;
    const vx = this.ev[0] * r;
    const vy = this.ev[1] * r;
    const p = ux * ux + vx * vx;
    const q = ux * uy + vx * vy;
    const t = uy * uy + vy * vy;
    const mid = (p + t) / 2;
    const dif = Math.hypot((p - t) / 2, q);
    return { cx, cy, rx: Math.sqrt(mid + dif), ry: Math.sqrt(Math.max(0, mid - dif)), rot: 0.5 * Math.atan2(2 * q, p - t) };
  }

  // A level disc (table tops, platters, stool seats).
  disc(cu: number, cv: number, z: number, r: number, fill: Color | Gradient, line = this.lw): void {
    const e = this.ell(cu, cv, z, r);
    this.pen.beginPath();
    this.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    this.paint(fill, line);
  }

  // A circle on the plane v = n (speaker cones, dials, a mirror ball's
  // face): centre (a, z), radius r.
  ring(a: number, n: number, z: number, r: number, fill: Color | Gradient | null, line = this.lw, ink: Color = INK): void {
    const [cx, cy] = this.p(a, n, z);
    const pen = this.pen;
    pen.save();
    pen.transform(this.eu[0] * r, this.eu[1] * r, this.ez[0] * r, this.ez[1] * r, cx, cy);
    pen.beginPath();
    pen.arc(0, 0, 1, 0, Math.PI * 2);
    pen.restore();
    this.paint(fill, line, ink);
  }

  // A soft shadow on the floor (or at height z).
  shadow(cu: number, cv: number, ru: number, rv: number, a = 0.3, z = 0): void {
    contactShadow(this.pen, this.at, cu, cv, ru, rv, a, z, '#07030c');
  }

  // A soft halo round a frame point, r in units.
  halo(u: number, v: number, z: number, r: number, color: Color, a: number, op: 'screen' | 'lighter' = 'screen'): void {
    const [x, y] = this.p(u, v, z);
    softDot(this.pen, x, y, r * this.s, color, a, op);
  }

  // A pool of light lying on a level plane, ru x rv units.
  pool(cu: number, cv: number, ru: number, rv: number, color: Color, a: number, z = 0, op: 'screen' | 'lighter' = 'screen'): void {
    this.blob(cu, cv, z, [ru, 0, 0], [0, rv, 0], color, a, op);
  }

  // A soft glow on the plane v = n round (a, z), ra x rz units.
  wash(a: number, n: number, z: number, ra: number, rz: number, color: Color, k: number, op: 'screen' | 'lighter' = 'screen'): void {
    this.blob(a, n, z, [ra, 0, 0], [0, 0, rz], color, k, op);
  }

  private blob(cu: number, cv: number, z: number, A: P3, B: P3, color: Color, a: number, op: 'screen' | 'lighter'): void {
    if (!(a > 0)) return;
    const [cx, cy] = this.p(cu, cv, z);
    const ax = A[0] * this.eu[0] + A[1] * this.ev[0] + A[2] * this.ez[0];
    const ay = A[0] * this.eu[1] + A[1] * this.ev[1] + A[2] * this.ez[1];
    const bx = B[0] * this.eu[0] + B[1] * this.ev[0] + B[2] * this.ez[0];
    const by = B[0] * this.eu[1] + B[1] * this.ev[1] + B[2] * this.ez[1];
    const pen = this.pen;
    pen.save();
    pen.globalCompositeOperation = op;
    pen.transform(ax, ay, bx, by, cx, cy);
    const g = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      g.addColorStop(t, withAlpha(color, Math.min(1, a) * (1 - t) * (1 - t)));
    }
    pen.fillStyle = g;
    pen.beginPath();
    pen.arc(0, 0, 1, 0, Math.PI * 2);
    pen.fill();
    pen.restore();
  }

  // A gradient on a plane: from frame point a to b, constant along the
  // frame direction `iso` (so it follows the plane, not the screen).
  lgrad(a: P3, b: P3, iso: P3, stops: ReadonlyArray<readonly [number, Color]>): Gradient {
    const [x0, y0] = this.p(...a);
    const [x1, y1] = this.p(...b);
    const ix = iso[0] * this.eu[0] + iso[1] * this.ev[0] + iso[2] * this.ez[0];
    const iy = iso[0] * this.eu[1] + iso[1] * this.ev[1] + iso[2] * this.ez[1];
    const l = Math.hypot(ix, iy) || 1;
    const nx = -iy / l;
    const ny = ix / l;
    const d = (x1 - x0) * nx + (y1 - y0) * ny;
    const g = this.pen.createLinearGradient(x0, y0, x0 + nx * d, y0 + ny * d);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
  }

  // Bottom to top up a face square to v (constant along u).
  vgrad(u: number, v: number, z0: number, z1: number, stops: ReadonlyArray<readonly [number, Color]>): Gradient {
    return this.lgrad([u, v, z0], [u, v, z1], [1, 0, 0], stops);
  }

  // A gradient across the screen between two frame points.
  grad(a: P3, b: P3, stops: ReadonlyArray<readonly [number, Color]>): Gradient {
    const [x0, y0] = this.p(...a);
    const [x1, y1] = this.p(...b);
    const g = this.pen.createLinearGradient(x0, y0, x1, y1);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
  }

  // A neon tube along frame points: a soft wash round it, the coloured
  // glass, and its white-hot core. `w` is the tube's width in units, `glow`
  // scales the wash (0: none, for a tube switched off).
  neon(pts: ReadonlyArray<P3>, color: Color, w = 0.32, glow = 1): void {
    const pen = this.pen;
    if (glow > 0) {
      pen.save();
      pen.globalCompositeOperation = 'screen';
      this.line(pts, withAlpha(color, 0.055 * glow), Math.max(6, w * 9 * this.s));
      this.line(pts, withAlpha(color, 0.13 * glow), Math.max(4, w * 4.5 * this.s));
      this.line(pts, withAlpha(color, 0.28 * glow), Math.max(2.5, w * 2.2 * this.s));
      pen.restore();
    }
    const tube = glow > 0 ? color : mix(color, C.black, 0.62);
    this.line(pts, tube, Math.max(1.4, w * this.s));
    if (glow > 0) this.line(pts, mix(color, '#ffffff', 0.7), Math.max(0.7, w * 0.38 * this.s));
  }
}

const hex2 = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');

// '#rrggbb' with alpha a, as '#rrggbbaa'.
export function withAlpha(c: Color, a: number): Color {
  return `${c.slice(0, 7)}${hex2(a * 255)}`;
}

// A soft dot of light, radius r px.
export function softDot(pen: Pen, x: number, y: number, r: number, color: Color, a: number, op: 'screen' | 'lighter' | 'source-over' = 'screen'): void {
  if (!(r > 0) || !(a > 0)) return;
  pen.save();
  pen.globalCompositeOperation = op;
  const g = pen.createRadialGradient(x, y, 0, x, y, r);
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    g.addColorStop(t, withAlpha(color, Math.min(1, a) * (1 - t) * (1 - t)));
  }
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(x, y, r, 0, Math.PI * 2);
  pen.fill();
  pen.restore();
}

export const kitOf = (v: { pen: Pen; at: At; s: number }): Kit => new Kit(v.pen, v.at, v.s);

// ── sprites for animated props ─────────────────────────────────────────────
// An animated prop is redrawn every frame; its still parts are painted once
// per (scale, frame axes, placement) into a sprite and copied in whole
// pixels, so a frame costs a copy plus the moving bits. The whole prop is
// snapped to the pixel grid (under half a pixel), so a panning camera does
// not repaint it.

type Sprite = { img: Canvas; x: number; y: number };
const SPRITES = new Map<string, Sprite>();
const MAX_SPRITES = 96;
const q = (n: number, k = 1000) => Math.round(n * k) / k;

// Paints `still` (in the prop's frame) through the cache, then returns a Kit
// on the real pen, snapped like the sprite, for the moving bits. `height`
// bounds the sprite (units).
export function still(v: PropView, id: string, height: number, paint: (k: Kit) => void): Kit {
  const o = v.at(0, 0, 0);
  const ix = Math.round(o[0]);
  const iy = Math.round(o[1]);
  const snap: At = (u, w, z) => {
    const p = v.at(u, w, z);
    return [p[0] + ix - o[0], p[1] + iy - o[1]];
  };
  const a = (u: number, w: number, z: number): Pt => {
    const p = v.at(u, w, z);
    return [p[0] - o[0], p[1] - o[1]];
  };
  const eu = a(1, 0, 0);
  const ev = a(0, 1, 0);
  const ez = a(0, 0, 1);
  const key = [id, v.len, v.dep, v.seed, q(eu[0]), q(eu[1]), q(ev[0]), q(ev[1]), q(ez[0]), q(ez[1])].join('|');
  let sp = SPRITES.get(key);
  if (sp) SPRITES.delete(key);
  else {
    // The footprint box, a unit round, up to `height`.
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const u of [-1, v.len + 1]) {
      for (const w of [-1, v.dep + 1]) {
        for (const z of [-1, height + 1]) {
          const [x, y] = a(u, w, z);
          x0 = Math.min(x0, x);
          y0 = Math.min(y0, y);
          x1 = Math.max(x1, x);
          y1 = Math.max(y1, y);
        }
      }
    }
    const bx = Math.floor(x0) - 2;
    const by = Math.floor(y0) - 2;
    const img = new Canvas(Math.ceil(x1) + 2 - bx, Math.ceil(y1) + 2 - by);
    const at: At = (u, w, z) => {
      const p = a(u, w, z);
      return [p[0] - bx, p[1] - by];
    };
    paint(new Kit(img, at, v.s));
    sp = { img, x: bx, y: by };
  }
  SPRITES.set(key, sp);
  if (SPRITES.size > MAX_SPRITES) SPRITES.delete(SPRITES.keys().next().value!);
  v.pen.drawImage(sp.img, ix + sp.x, iy + sp.y);
  return new Kit(v.pen, snap, v.s);
}

// ── particles ────────────────────────────────────────────────────────────────
// How many of a steady stream (rate a second) are due this frame: the same
// at the same clock whoever asks.
export function due(t: number, dt: number, rate: number, salt = 0): number {
  const off = hash(salt) * 7;
  return Math.max(0, Math.floor((t + off) * rate) - Math.floor((t + off - dt) * rate));
}

// '#rrggbb' as an RGB triple (for particles).
export function rgb(c: Color): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
