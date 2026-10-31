import { Canvas } from '../../art/canvas.ts';
import type { At, BoxOpts, CylOpts } from '../../art/iso.ts';
import { contactShadow, inkWidth, isoBox, isoCylinder, path, shade } from '../../art/iso.ts';
import type { Color, Gradient, Pen } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropView } from '../types.ts';

// Snowy Depths' drawing kit: its colours, and a Kit that draws in one frame
// (a prop's u, v, z or a wall's along, out, up) with the world's ink, so
// every piece shares one outline weight and one light (from the upper
// left). Also a sprite cache for animated props (their still parts drawn
// once per scale, the moving bits on top every frame) and the particles
// the world gives off: snowflakes, embers, steam, chips of ice.
// (The Kit's shape follows the café's kit; nothing is shared with it.)

export type Pt = [number, number];
export type P3 = [number, number, number];

// The one outline colour: a deep night navy.
export const INK = '#1a2136';

export const C = {
  // snow, from the lit crest of a drift to its shadowed foot
  snowHi: '#f4f8fd',
  snow: '#dfe8f3',
  snowMid: '#c6d4e5',
  snowLow: '#a7b9d0',
  snowDeep: '#8197b6',
  // ice, from frost to the deep blue inside a glacier
  frost: '#e6f7fd',
  iceHi: '#c4ecfa',
  ice: '#97d3ef',
  iceMid: '#68b2e0',
  iceDeep: '#4285c4',
  iceDark: '#2d5d9a',
  iceNight: '#1e3d6c',
  // the rock under it all
  rockHi: '#8593a8',
  rock: '#66748b',
  rockDark: '#4a566c',
  rockNight: '#2f384c',
  // timber
  woodLight: '#c08a58',
  wood: '#9b6943',
  woodDark: '#6c4429',
  woodDeep: '#4a2d1b',
  bark: '#76553a',
  // furs, wool and canvas
  furLight: '#e9cfa2',
  fur: '#c99e6c',
  furDark: '#94693f',
  furWhite: '#eee9e0',
  furGrey: '#a9a49c',
  wool: '#b9443a',
  woolDark: '#8c2f2b',
  mustard: '#dba642',
  teal: '#3f8288',
  navy: '#36507a',
  pine: '#4d7d5c',
  canvas: '#d9caa8',
  rope: '#c9a86e',
  // metal
  iron: '#3c4252',
  ironLight: '#5d6577',
  copper: '#c9773f',
  brass: '#d8aa4e',
  tin: '#b8c2cd',
  // fire and lamplight
  fire: '#ff8a2a',
  flame: '#ffc04a',
  flameHot: '#fff0b0',
  ember: '#ff6a24',
  lamp: '#ffcf7a',
  glow: '#ffb35c',
  // and the rest
  paper: '#f2e8d0',
  parchment: '#e6d2a2',
  carrot: '#f0862a',
  coal: '#2a2b33',
  water: '#183456',
  waterDeep: '#0e213c',
  fish: '#9db4c6',
  cocoa: '#6a3b24',
  mug: '#e9e2d4',
} as const;

// Where things stand in the stations' frames, for the shell to lay its
// light and ground round them: the fire pit's middle (idle), the stove's
// (run), the fishing hole's (think) and the ice gate's opening (entrance:
// its two sides along the wall and the top of its arch).
export const SPOT = {
  fire: [9.2, 6.2],
  stove: [3.7, 4.4],
  hole: [4.4, 4.4],
  gate: [3.6, 10.4, 12.2],
} as const;

// A smooth wobble in [0, 1] along x (a few sines, phases by seed).
export function wave(x: number, seed: number): number {
  return 0.5 + 0.24 * Math.sin(x * 0.31 + seed * 1.7) + 0.16 * Math.sin(x * 0.83 + seed * 3.1) + 0.1 * Math.sin(x * 1.9 + seed * 5.3);
}

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
  private eu: Pt;
  private ev: Pt;
  private ez: Pt;

  constructor(pen: Pen, at: At, s: number, lw = inkWidth(s)) {
    this.pen = pen;
    this.at = at;
    this.s = s;
    this.lw = lw;
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

  // True if the screen box round these frame points (grown by `pad` px)
  // touches the canvas: what lies wholly off it need not be drawn (the
  // room is painted a tile at a time).
  seen(pts: ReadonlyArray<P3>, pad = 0): boolean {
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
    const m = pad + this.lw * 2;
    return x1 >= -m && y1 >= -m && x0 <= this.pen.width + m && y0 <= this.pen.height + m;
  }

  // True if a face whose outward normal is (nu, nv) is lit (faces screen-left).
  lit(nu: number, nv: number): boolean {
    return nu * this.eu[0] + nv * this.ev[0] < 0;
  }

  // A vertical face's colour by which way it faces.
  side(base: Color, nu: number, nv: number, k = 0.18): Color {
    return this.lit(nu, nv) ? base : shade(base, -k);
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
  poly(pts: ReadonlyArray<P3>, fill: Color | Gradient | null, line = this.lw, round = 0): void {
    this.pen.beginPath();
    this.trace(pts, round);
    this.paint(fill, line);
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

  // Adds an open polyline of frame points to the path.
  run(pts: ReadonlyArray<P3>): void {
    pts.forEach(([u, v, z], i) => {
      const [x, y] = this.p(u, v, z);
      if (i) this.pen.lineTo(x, y);
      else this.pen.moveTo(x, y);
    });
  }

  // An open polyline of frame points.
  line(pts: ReadonlyArray<P3>, color: Color, width: number): void {
    const pen = this.pen;
    pen.beginPath();
    this.run(pts);
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.lineJoin = 'round';
    pen.lineCap = 'round';
    pen.stroke();
  }

  // A bent rod (legs, handles, poles): ink under the colour.
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

  // A level disc (stool tops, the fishing hole, a pond).
  disc(cu: number, cv: number, z: number, r: number, fill: Color | Gradient, line = this.lw): void {
    const e = this.ell(cu, cv, z, r);
    this.pen.beginPath();
    this.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    this.paint(fill, line);
  }

  // A soft shadow on the floor (or at height z), in the cave's cold dark.
  shadow(cu: number, cv: number, ru: number, rv: number, a = 0.26, z = 0): void {
    contactShadow(this.pen, this.at, cu, cv, ru, rv, a, z, '#0b1226');
  }

  // A soft halo round a frame point, r in units.
  halo(u: number, v: number, z: number, r: number, color: Color, a: number, op: 'screen' | 'lighter' = 'screen'): void {
    const [x, y] = this.p(u, v, z);
    softDot(this.pen, x, y, r * this.s, color, a, op);
  }

  // A pool of light lying on a level plane, ru x rv units.
  pool(cu: number, cv: number, ru: number, rv: number, color: Color, a: number, z = 0, op: 'screen' | 'lighter' | 'source-over' = 'screen'): void {
    const [cx, cy] = this.p(cu, cv, z);
    const pen = this.pen;
    pen.save();
    pen.globalCompositeOperation = op;
    pen.transform(this.eu[0] * ru, this.eu[1] * ru, this.ev[0] * rv, this.ev[1] * rv, cx, cy);
    const g = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      g.addColorStop(t, withAlpha(color, a * (1 - t) * (1 - t)));
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

  // A left-to-right screen gradient between two frame points' x.
  hgrad(a: P3, b: P3, stops: ReadonlyArray<readonly [number, Color]>): Gradient {
    const [x0, y0] = this.p(...a);
    const [x1] = this.p(...b);
    const g = this.pen.createLinearGradient(x0, y0, x1, y0);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
  }

  // A gradient across the screen between two frame points.
  grad(a: P3, b: P3, stops: ReadonlyArray<readonly [number, Color]>): Gradient {
    const [x0, y0] = this.p(...a);
    const [x1, y1] = this.p(...b);
    const g = this.pen.createLinearGradient(x0, y0, x1, y1);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
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

// A four-pointed glint (frost catching the light), r px from the middle to
// a point.
export function sparkle(pen: Pen, x: number, y: number, r: number, color: Color = '#ffffff'): void {
  if (!(r > 0.5)) return;
  const w = r * 0.22;
  pen.beginPath();
  pen.moveTo(x, y - r);
  pen.quadraticCurveTo(x + w, y - w, x + r, y);
  pen.quadraticCurveTo(x + w, y + w, x, y + r);
  pen.quadraticCurveTo(x - w, y + w, x - r, y);
  pen.quadraticCurveTo(x - w, y - w, x, y - r);
  pen.closePath();
  pen.fillStyle = color;
  pen.fill();
}

export const kitOf = (v: { pen: Pen; at: At; s: number }): Kit => new Kit(v.pen, v.at, v.s);

// A kit for small things (a desk's clutter and loops): its outline half
// the usual one, its inner lines thinner again, so a thing a unit across
// is not all ink.
export const smallKitOf = (v: { pen: Pen; at: At; s: number }): Kit => new Kit(v.pen, v.at, v.s, Math.max(1, inkWidth(v.s) * 0.5));

// ── sprites for animated props ─────────────────────────────────────────────
// An animated prop is redrawn every frame; its still parts are painted once
// per (scale, frame axes, placement) into a sprite and copied in whole
// pixels, so a frame costs a copy plus the moving bits. The whole prop is
// snapped to the pixel grid (under half a pixel), so a panning camera does
// not repaint it.

type Sprite = { img: Canvas; x: number; y: number };
const SPRITES = new Map<string, Sprite>();
const MAX_SPRITES = 48;
const q = (n: number, k = 1000) => Math.round(n * k) / k;

// Paints `still` (in the prop's frame) through the cache, then returns a Kit
// on the real pen, snapped like the sprite, for the moving bits. `height`
// bounds the sprite (units). `variant` tells apart still parts drawn more
// than one way (lit and unlit, say).
export function still(v: PropView, id: string, height: number, paint: (k: Kit) => void, variant = ''): Kit {
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
  const key = ['snowy', id, variant, v.len, v.dep, v.seed, q(eu[0]), q(eu[1]), q(ev[0]), q(ev[1]), q(ez[0]), q(ez[1])].join('|');
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

type Rgb = readonly [number, number, number];

// A wisp of steam rising off (u, v, z) in the prop's frame.
export function wisp(u: number, v: number, z: number, n: number, k: number, color: Rgb = [236, 242, 250]): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  return { kind: 'steam', x: u + j(1) * 0.4, y: v + j(2) * 0.4, z, vx: j(3) * 0.5, vy: j(4) * 0.5, vz: 2.4 + j(5), life: 1.4 + j(6), color, glow: false, gravity: 0 };
}

// A snowflake drifting down from (u, v, z), gone where it lands: slow, with
// a little sideways wander, its life just long enough to reach the floor
// (from no higher than about 20 units: a bit lives ten seconds at most).
export function flake(u: number, v: number, z: number, n: number, k: number, spread = 1): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  const vz = -(2.3 + j(5) * 0.8);
  return { kind: 'drop', x: u + j(1) * spread, y: v + j(2) * spread, z, vx: j(3) * 0.9, vy: j(4) * 0.9, vz, life: Math.min(9.8, z / -vz), color: [238, 245, 253], glow: false, gravity: 0.05 };
}

// An ember lifting off a fire.
export function ember(u: number, v: number, z: number, n: number, k: number, spread = 0.6): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  return { kind: 'ember', x: u + j(1) * spread, y: v + j(2) * spread, z, vx: j(3) * 0.9, vy: j(4) * 0.9, vz: 2 + j(5) * 1.4, life: 0.9 + j(6), color: [255, 150, 60], glow: true, gravity: -0.4 };
}

// A chip of ice knocked off, flying out and down.
export function chip(u: number, v: number, z: number, n: number, k: number): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  return { kind: 'spark', x: u + j(1), y: v, z, vx: j(3) * 4, vy: 2 + j(4) * 2, vz: 3 + j(5) * 3, life: 0.5 + j(6) * 0.3, color: [200, 236, 255], glow: false, gravity: 24 };
}
