import { Canvas } from '../../art/canvas.ts';
import type { At, BoxOpts, CylOpts } from '../../art/iso.ts';
import { contactShadow, inkWidth, isoBox, isoCylinder, path, shade } from '../../art/iso.ts';
import type { Color, Gradient, Pen } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropView } from '../types.ts';

// The Longhall's drawing kit (after the vault's): its colours, and a Kit
// that draws in one frame (a prop's u, v, z or a wall's along, out, up)
// with the hall's smoky brown ink, so every piece shares one outline weight
// and one light. Also a sprite cache for animated props (their still parts
// drawn once per scale, the moving bits on top every frame), a test for
// what a pen can see (the shell is painted a tile at a time) and small
// particle helpers.

export type Pt = [number, number];
export type P3 = [number, number, number];

// The one outline colour: a smoky brown.
export const INK = '#2a1a10';

export const C = {
  // timber, plaster and stone
  timber: '#7a5634',
  timberLight: '#94693f',
  timberDark: '#553a22',
  carving: '#a9814f',
  log: '#8c5e3a',
  plaster: '#b89e72',
  stone: '#82827a',
  stoneLight: '#9c9b92',
  stoneDark: '#686860',
  mortar: '#4a4a44',
  rushes: '#c9a85a',
  // iron, gold and leather
  iron: '#5a5e66',
  ironLight: '#7d828b',
  ironDark: '#3a3530',
  gold: '#d9a93f',
  leather: '#7a4a2a',
  leatherDark: '#5a3418',
  // cloth for shields, banners and swags: plain colours only
  red: '#a3322a',
  redDark: '#7a2620',
  blue: '#3b5a8c',
  green: '#3f6b45',
  ochre: '#b57a35',
  cream: '#e9dcc0',
  // fire and candlelight
  ember: '#ff8a3d',
  flame: '#ffc04a',
  flameHot: '#ffe29a',
  coal: '#3a2620',
  wax: '#f3e6c0',
  // outside: snow at night
  night: '#26314d',
  nightLow: '#3c4b70',
  snow: '#eef4fa',
  frost: '#bfd8e8',
  pine: '#22303a',
  // fur, horn, feathers, parchment and herbs
  fur: '#a08a6c',
  furDark: '#7d6a52',
  elk: '#7a5236',
  elkDark: '#5a3a24',
  wolf: '#8a8f96',
  wolfDark: '#6a6f76',
  horn: '#e6d6b0',
  raven: '#2a2a35',
  ravenSheen: '#4a5a7a',
  parchment: '#ead9b0',
  herb: '#6f8f4a',
} as const;

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

  // True if the screen box of the frame box (u0..u1, v0..v1, z0..z1),
  // grown by `pad` px, meets the pen: what is off it is not drawn at all.
  sees(u0: number, v0: number, z0: number, u1: number, v1: number, z1: number, pad = 4): boolean {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const u of [u0, u1]) {
      for (const v of [v0, v1]) {
        for (const z of [z0, z1]) {
          const [x, y] = this.p(u, v, z);
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    return x1 >= -pad && y1 >= -pad && x0 <= this.pen.width + pad && y0 <= this.pen.height + pad;
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
    this.pen.beginPath();
    this.trace(pts, round);
    this.paint(fill, line);
  }

  // A flat quad on the plane v = n, from (a0, z0) to (a1, z1).
  rect(a0: number, z0: number, a1: number, z1: number, n: number, fill: Color | Gradient, line = 0): void {
    this.poly([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]], fill, line);
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
  line(pts: ReadonlyArray<P3>, color: Color, width: number): void {
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
    pen.lineCap = 'round';
    pen.stroke();
  }

  // Many short segments in one stroke.
  segs(list: ReadonlyArray<readonly [P3, P3]>, color: Color, width: number, cap: 'round' | 'butt' = 'butt'): void {
    if (!list.length) return;
    const pen = this.pen;
    pen.beginPath();
    for (const [a, b] of list) {
      const [x0, y0] = this.p(...a);
      const [x1, y1] = this.p(...b);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = color;
    pen.lineWidth = width;
    pen.lineCap = cap;
    pen.stroke();
  }

  // A bent rod (rails, arms, handles): ink under metal.
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

  // A level disc (table tops, coins, lids).
  disc(cu: number, cv: number, z: number, r: number, fill: Color | Gradient, line = this.lw): void {
    const e = this.ell(cu, cv, z, r);
    this.pen.beginPath();
    this.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    this.paint(fill, line);
  }

  // A disc standing on the plane v = n (a dial, a door, a porthole).
  face(a: number, n: number, z: number, r: number, fill: Color | Gradient, line = this.lw, steps = 28): void {
    this.pen.beginPath();
    this.trace(circle(a, n, z, r, steps));
    this.paint(fill, line);
  }

  // A soft shadow on the floor (or at height z).
  shadow(cu: number, cv: number, ru: number, rv: number, a = 0.28, z = 0): void {
    contactShadow(this.pen, this.at, cu, cv, ru, rv, a, z, '#140a04');
  }

  // A soft halo round a frame point, r in units.
  halo(u: number, v: number, z: number, r: number, color: Color, a: number, op: 'screen' | 'lighter' = 'screen'): void {
    const [x, y] = this.p(u, v, z);
    softDot(this.pen, x, y, r * this.s, color, a, op);
  }

  // A pool of light lying on a level plane, ru x rv units.
  pool(cu: number, cv: number, ru: number, rv: number, color: Color, a: number, z = 0, op: 'screen' | 'lighter' = 'screen'): void {
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

  // A pool of light on the upright plane v = n, ru along u, rz up.
  wash(cu: number, n: number, cz: number, ru: number, rz: number, color: Color, a: number): void {
    const [cx, cy] = this.p(cu, n, cz);
    const pen = this.pen;
    pen.save();
    pen.globalCompositeOperation = 'screen';
    pen.transform(this.eu[0] * ru, this.eu[1] * ru, this.ez[0] * rz, this.ez[1] * rz, cx, cy);
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

  // A left-to-right screen gradient between two frame points' x (vertical
  // isolines: shade across an upright face).
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

// Frame points round a circle standing on the plane v = n.
export function circle(a: number, n: number, z: number, r: number, steps = 28, a0 = 0, a1 = Math.PI * 2): P3[] {
  const out: P3[] = [];
  const closed = a1 - a0 >= Math.PI * 2 - 1e-9;
  const k = closed ? steps : steps + 1;
  for (let i = 0; i < k; i++) {
    const th = a0 + ((a1 - a0) * i) / steps;
    out.push([a + Math.cos(th) * r, n, z + Math.sin(th) * r]);
  }
  return out;
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
const MAX_SPRITES = 48;
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

// A wisp rising off (u, v, z) in the prop's frame.
export function wisp(u: number, v: number, z: number, n: number, k: number, color: readonly [number, number, number] = [226, 232, 238], spread = 0.4): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  return { kind: 'steam', x: u + j(1) * spread, y: v + j(2) * spread, z, vx: j(3) * 0.5, vy: j(4) * 0.5, vz: 2.2 + j(5), life: 1.4 + j(6), color, glow: false, gravity: 0 };
}
