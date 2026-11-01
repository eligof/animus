// Builds as sculpted cartoon objects, not voxels. The blocks of
// world/build.ts stay the progress model (bricks, hauls, the laid count);
// here they are only surveyed for where the build stands, how big it is
// and where its features sit (a door, the beacon, a chimney), and each
// shape is drawn smooth in the world's build colours from drums, boxes,
// balls and a gable roof, lit by the art rules (top +12 %, the face toward
// the lower left as is, the one toward the lower right −18 %), with one
// highlight along the top's front edge and the world's ink round each part.
// While it goes up the solid is cut at the laid height (a fresh course on
// top, hollow where walls rise round a room), two scaffold poles and a
// plank stand by it, and the rest shows as a clean ghost: a faint fill in
// the ghost hue inside a firm light outline (a plan, not a cloud). A soft
// shadow lies under it on the floor (its own sprite, drawn with the
// floors, so nobody walking behind it is darkened). The supply pile is a few stacked bricks on a pallet.
// All drawn once per change and cached (see Scene) as sprites placed
// relative to the projected world origin.

import type { RGB } from '../../term/color.ts';
import type { Block } from '../../world/build.ts';
import type { Rect } from '../../world/layout.ts';
import type { Layout } from '../../world/types.ts';
import type { BuildShape, RoomArt } from '../../worlds/types.ts';
import { Canvas } from '../canvas.ts';
import { contactShadow, hexOf, inkWidth, isoBox, mix, path, rgbOf, shade } from '../iso.ts';
import type { Color, Pen } from '../types.ts';

// A cached picture: its top-left (x, y) in canvas px relative to where the
// world origin projects.
export type Sprite = { img: Canvas; x: number; y: number };

// What a build is drawn from (a BuildFrame has all of it).
export type BuildLook = { shape: BuildShape; blocks: readonly Block[]; pending: readonly Block[]; colors: readonly RGB[]; ghost: RGB };

type Pt = [number, number];
type At = (x: number, y: number, z: number) => Pt;

const SQ2 = Math.SQRT2;
const WOOD = '#9a7048'; // scaffold poles
const PLANK = '#c49a62';

// ── the survey ───────────────────────────────────────────────────────────
// Where the blocks stand and how each course spreads, in units relative to
// the build's centre (block edges, not centres), and its cap-coloured
// blocks (windows, eyes, beacons) by their centres.

type Course = { n: number; x0: number; x1: number; y0: number; y1: number; r: number; m: number };
type Spot = { x: number; y: number; z: number };

class Survey {
  readonly cx: number;
  readonly cy: number;
  readonly top: number; // the top of the highest block
  readonly caps: Spot[] = [];
  readonly blocks: Spot[] = []; // every block's centre (z: its course)
  private courses: Course[] = [];

  constructor(all: readonly Block[], cap: number) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let z0 = Infinity;
    for (const b of all) z0 = Math.min(z0, b.z);
    for (const b of all) {
      if (b.z !== z0) continue;
      x0 = Math.min(x0, b.x);
      x1 = Math.max(x1, b.x + 1);
      y0 = Math.min(y0, b.y);
      y1 = Math.max(y1, b.y + 1);
    }
    this.cx = (x0 + x1) / 2;
    this.cy = (y0 + y1) / 2;
    let top = 0;
    for (const b of all) {
      const x = b.x + 0.5 - this.cx;
      const y = b.y + 0.5 - this.cy;
      top = Math.max(top, b.z + 1);
      this.blocks.push({ x, y, z: b.z });
      if (cap > 0 && b.c === cap) this.caps.push({ x, y, z: b.z });
      const c = (this.courses[b.z] ??= { n: 0, x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, r: 0, m: 0 });
      c.n++;
      c.x0 = Math.min(c.x0, x - 0.5);
      c.x1 = Math.max(c.x1, x + 0.5);
      c.y0 = Math.min(c.y0, y - 0.5);
      c.y1 = Math.max(c.y1, y + 0.5);
      c.r = Math.max(c.r, Math.hypot(x, y) + 0.5);
      c.m = Math.max(c.m, Math.abs(x) + Math.abs(y));
    }
    this.top = top;
  }

  // Course z (the nearest course below with blocks, or an empty one).
  course(z: number): Course {
    for (let k = Math.min(Math.floor(z), this.courses.length - 1); k >= 0; k--) if (this.courses[k]) return this.courses[k];
    return { n: 0, x0: 0, x1: 0, y0: 0, y1: 0, r: 0, m: 0 };
  }

  // The footprint's extent: the widest course on each side.
  get extent(): { x0: number; x1: number; y0: number; y1: number } {
    const e = { x0: 0, x1: 0, y0: 0, y1: 0 };
    for (const c of this.courses) {
      if (!c) continue;
      e.x0 = Math.min(e.x0, c.x0);
      e.x1 = Math.max(e.x1, c.x1);
      e.y0 = Math.min(e.y0, c.y0);
      e.y1 = Math.max(e.y1, c.y1);
    }
    return e;
  }

  // The top of the column at (x, y) up to height z (0 when bare).
  floorAt(x: number, y: number, z: number): number {
    let h = 0;
    for (const b of this.blocks) if (b.z < z && Math.abs(b.x - x) < 0.5 && Math.abs(b.y - y) < 0.5) h = Math.max(h, b.z + 1);
    return h;
  }
}

// ── materials ──────────────────────────────────────────────────────────────
// The world's build colours in order: up to three plain ones (frame, body,
// trim or roof), then the cap that glows. Plain colours are kept from
// out-shining the room: a top face no brighter than about its brightest
// wall.

type Mats = { a: Color; b: Color; c: Color; cap: Color };

const lum = (c: readonly number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

function matsOf(colors: readonly RGB[], ceil: number): Mats {
  const n = colors.length;
  const cap = colors[n - 1] ?? [255, 230, 160];
  const plain = n >= 2 ? colors.slice(0, -1) : colors.length ? colors : [[200, 200, 200] as RGB];
  const tame = (c: RGB): Color => {
    const top = rgbOf(shade(hexOf(c), 0.12));
    const k = Math.min(1, ceil / Math.max(1, lum(top)));
    return hexOf([c[0] * k, c[1] * k, c[2] * k]);
  };
  const a = tame(plain[0]);
  const b = plain[1] ? tame(plain[1]) : a;
  const c = plain[2] ? tame(plain[2]) : b;
  return { a, b, c, cap: hexOf(cap) };
}

// How bright the room's walls are: the brighter wall's upper-quartile
// value, read once per room and size through `sample` (a point's value in
// the painted shell, or null where there is none to read): 255 when there
// is no wall to measure. Builds' plain colours stay a little above it.
const WALLS = new WeakMap<RoomArt, Map<string, number>>();
export function wallValue(room: RoomArt, L: Layout, sample: (x: number, y: number, z: number) => number | null): number {
  const key = `${L.W}x${L.D}x${L.H}x${L.T}`;
  let seen = WALLS.get(room);
  if (!seen) WALLS.set(room, (seen = new Map()));
  let v = seen.get(key);
  if (v !== undefined) return v;
  const upper = (wall: 'left' | 'right') => {
    const vs: number[] = [];
    for (let i = 0; i <= 12; i++) {
      for (let j = 0; j <= 6; j++) {
        const u = 0.2 + (0.6 * i) / 12;
        const z = L.H * (0.12 + (0.76 * j) / 6);
        const q = wall === 'left' ? sample(L.T, L.T + (L.D - L.T) * u, z) : sample(L.T + (L.W - L.T) * u, L.T, z);
        if (q !== null) vs.push(q);
      }
    }
    vs.sort((p, q) => p - q);
    return vs.length > 20 ? vs[Math.floor(0.75 * (vs.length - 1))] : -1;
  };
  const best = Math.max(upper('left'), upper('right'));
  v = best < 0 ? 255 : best;
  seen.set(key, v);
  return v;
}

// ── the chisel: smooth outlined parts, cut at a height ────────────────────
// Every part is drawn up to `cut` (its top there is the fresh course); a
// ghost chisel draws every material in the ghost hue with light lines.
// Each part's silhouette is kept, for the ghost's outline.

type Ghost = { fill: Color; line: Color };

class Chisel {
  readonly sils: Array<(p: Pen) => void> = [];
  readonly pen: Canvas;
  readonly at: At;
  readonly s: number;
  readonly ink: Color;
  readonly lw: number;
  readonly cut: number;
  readonly ghost: Ghost | null;

  constructor(pen: Canvas, at: At, s: number, ink: Color, lw: number, cut: number, ghost: Ghost | null) {
    this.pen = pen;
    this.at = at;
    this.s = s;
    this.ink = ink;
    this.lw = lw;
    this.cut = cut;
    this.ghost = ghost;
  }

  private col(c: Color): Color {
    return this.ghost ? this.ghost.fill : c;
  }

  private get line(): Color {
    return this.ghost ? this.ghost.line : this.ink;
  }

  // Fills the path just built, then inks it round.
  private inkIt(fill: Color | ReturnType<Pen['createLinearGradient']>, w = this.lw): void {
    const p = this.pen;
    p.fillStyle = fill;
    p.fill();
    p.strokeStyle = this.line;
    p.lineWidth = this.ghost ? w * 0.6 : w;
    p.lineJoin = 'round';
    p.lineCap = 'round';
    p.stroke();
  }

  // A box from (x0, y0, z0) to (x1, y1, z1), rounded `round` units at its
  // silhouette; cut, its top is fresh and `hollow` shows the room inside
  // walls that thick.
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, base: Color, o: { round?: number; hollow?: number; stripe?: boolean } = {}): void {
    if (z0 >= this.cut) return;
    const cut = z1 > this.cut;
    z1 = Math.min(z1, this.cut);
    const c = this.col(base);
    const at = this.at;
    const corners: Pt[] = [];
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) corners.push(at(x, y, z));
    const sil = hull(corners);
    const r = (o.round ?? 0) * this.s;
    this.sils.push((p) => path(p, sil, r));
    isoBox(this.pen, at, x0, y0, z0, x1 - x0, y1 - y0, z1 - z0, c, { ink: this.line, line: this.ghost ? this.lw * 0.6 : this.lw, round: o.round, stripe: o.stripe ?? !this.ghost, top: cut && !this.ghost ? shade(c, 0.2) : undefined });
    if (cut && o.hollow && !this.ghost) {
      const t = o.hollow;
      if (x1 - x0 > 2 * t + 0.4 && y1 - y0 > 2 * t + 0.4) {
        this.pen.beginPath();
        path(this.pen, [at(x0 + t, y0 + t, z1), at(x1 - t, y0 + t, z1), at(x1 - t, y1 - t, z1), at(x0 + t, y1 - t, z1)]);
        this.inkIt(mix(c, this.ink, 0.62), this.lw * 0.6);
      }
    }
  }

  // An upright drum from a circle `r0` round (x0, y0) at z0 up to one `r1`
  // round (x1, y1) at z1: a cylinder, a frustum, or (its top moved over) a
  // leaning cone. The side is lit across (left lit, right dark), the top an
  // ellipse with a light rim along its front; `hollow` as for a box.
  drum(x0: number, y0: number, z0: number, r0: number, x1: number, y1: number, z1: number, r1: number, base: Color, o: { hollow?: number; flat?: boolean } = {}): void {
    if (z0 >= this.cut) return;
    const cut = z1 > this.cut;
    if (cut) {
      const k = (this.cut - z0) / (z1 - z0);
      x1 = x0 + (x1 - x0) * k;
      y1 = y0 + (y1 - y0) * k;
      r1 = r0 + (r1 - r0) * k;
      z1 = this.cut;
    }
    const p = this.pen;
    const s = this.s;
    const B = this.at(x0, y0, z0);
    const T = this.at(x1, y1, z1);
    const a0 = SQ2 * r0 * s;
    const a1 = SQ2 * r1 * s;
    const sil = (q: Pen) => drumPath(q, B, a0, T, a1);
    this.sils.push(sil);
    const c = this.col(base);
    p.save();
    p.beginPath();
    sil(p);
    const xl = Math.min(B[0] - a0, T[0] - a1);
    const xr = Math.max(B[0] + a0, T[0] + a1);
    const g = p.createLinearGradient(xl, 0, xr, 0);
    g.addColorStop(0, shade(c, 0.06));
    g.addColorStop(0.3, shade(c, 0.14));
    g.addColorStop(0.6, c);
    g.addColorStop(1, shade(c, -0.24));
    p.fillStyle = g;
    p.fill();
    if (a1 > 1 && (!o.flat || cut)) {
      const top = cut && !this.ghost ? shade(c, 0.2) : shade(c, 0.12);
      p.beginPath();
      p.ellipse(T[0], T[1], a1, a1 / 2, 0, 0, Math.PI * 2);
      p.fillStyle = top;
      p.fill();
      if (cut && o.hollow && !this.ghost && r1 > o.hollow + 0.3) {
        const ai = SQ2 * (r1 - o.hollow) * s;
        p.beginPath();
        p.ellipse(T[0], T[1], ai, ai / 2, 0, 0, Math.PI * 2);
        this.inkIt(mix(c, this.ink, 0.62), this.lw * 0.6);
      }
      p.lineCap = 'round';
      if (!this.ghost && a1 > 3 * this.lw) {
        const ah = a1 - this.lw * 1.1;
        p.beginPath();
        p.ellipse(T[0], T[1], ah, ah / 2, 0, Math.PI * 0.22, Math.PI * 0.92);
        p.strokeStyle = mix(top, '#fffdf4', 0.45);
        p.lineWidth = Math.max(1, this.lw * 0.55);
        p.stroke();
      }
      p.beginPath();
      p.ellipse(T[0], T[1], a1, a1 / 2, 0, 0, Math.PI);
      p.strokeStyle = this.line;
      p.lineWidth = this.lw * 0.6;
      p.stroke();
    }
    p.beginPath();
    sil(p);
    p.strokeStyle = this.line;
    p.lineWidth = this.ghost ? this.lw * 0.6 : this.lw;
    p.lineJoin = 'round';
    p.stroke();
    p.restore();
  }

  // A band wrapped round an upright body (a belt, a hoop), from z0 to z1
  // round (x, y): only its front shows, the body above it stays in view.
  ring(x: number, y: number, z0: number, z1: number, r0: number, r1: number, base: Color): void {
    if (this.ghost || z0 >= this.cut) return;
    z1 = Math.min(z1, this.cut);
    const p = this.pen;
    const B = this.at(x, y, z0);
    const T = this.at(x, y, z1);
    const a0 = SQ2 * r0 * this.s;
    const a1 = SQ2 * r1 * this.s;
    p.save();
    p.beginPath();
    p.ellipse(B[0], B[1], a0, a0 / 2, 0, 0, Math.PI);
    p.ellipse(T[0], T[1], a1, a1 / 2, 0, Math.PI, 0, true);
    p.closePath();
    const g = p.createLinearGradient(B[0] - a0, 0, B[0] + a0, 0);
    g.addColorStop(0, shade(base, 0.06));
    g.addColorStop(0.3, shade(base, 0.14));
    g.addColorStop(0.6, base);
    g.addColorStop(1, shade(base, -0.24));
    p.lineJoin = 'round';
    this.inkIt(g, this.lw * 0.8);
    p.restore();
  }

  // A bent, tapering tube through `pts` (a hat, a horn) as one outlined
  // shape: the parts' outlines first, their fills over them, so only the
  // outer half of the ink shows.
  tube(pts: ReadonlyArray<{ x: number; y: number; z: number; r: number }>, base: Color): void {
    const p = this.pen;
    const segs: Array<{ sil: (q: Pen) => void; xl: number; xr: number }> = [];
    for (let i = 0; i + 1 < pts.length; i++) {
      const u = pts[i];
      let v = pts[i + 1];
      if (u.z >= this.cut) break;
      if (v.z > this.cut) {
        const k = (this.cut - u.z) / (v.z - u.z);
        v = { x: u.x + (v.x - u.x) * k, y: u.y + (v.y - u.y) * k, z: this.cut, r: u.r + (v.r - u.r) * k };
      }
      const B = this.at(u.x, u.y, u.z);
      const T = this.at(v.x, v.y, v.z);
      const a0 = SQ2 * u.r * this.s;
      const a1 = SQ2 * v.r * this.s;
      segs.push({ sil: (q) => drumPath(q, B, a0, T, a1), xl: Math.min(B[0] - a0, T[0] - a1), xr: Math.max(B[0] + a0, T[0] + a1) });
    }
    if (!segs.length) return;
    const c = this.col(base);
    p.save();
    p.lineJoin = 'round';
    for (const g of segs) {
      this.sils.push(g.sil);
      p.beginPath();
      g.sil(p);
      p.strokeStyle = this.line;
      p.lineWidth = (this.ghost ? this.lw * 0.6 : this.lw) * 2;
      p.stroke();
    }
    // one light across the whole tube, so its parts meet without seams
    const gr = p.createLinearGradient(Math.min(...segs.map((g) => g.xl)), 0, Math.max(...segs.map((g) => g.xr)), 0);
    gr.addColorStop(0, shade(c, 0.06));
    gr.addColorStop(0.3, shade(c, 0.14));
    gr.addColorStop(0.6, c);
    gr.addColorStop(1, shade(c, -0.24));
    p.fillStyle = gr;
    for (const g of segs) {
      p.beginPath();
      g.sil(p);
      p.fill();
    }
    p.restore();
  }

  // A ball r units round (x, y, z), lit from the upper left; `glow` for a
  // lamp (a hot pale core). Drawn once at least half of it stands.
  ball(x: number, y: number, z: number, r: number, base: Color, glow = false): void {
    if (z > this.cut) return;
    const [cx, cy] = this.at(x, y, z);
    const rx = SQ2 * r * this.s;
    const ry = Math.sqrt(1.5) * r * this.s;
    this.sils.push((q) => q.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2));
    const c = this.col(base);
    const p = this.pen;
    p.beginPath();
    p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const g = p.createRadialGradient(cx - rx * 0.35, cy - ry * 0.4, 0, cx - rx * 0.2, cy - ry * 0.2, rx * 1.3);
    if (glow && !this.ghost) {
      g.addColorStop(0, mix(c, '#ffffff', 0.85));
      g.addColorStop(0.35, mix(c, '#ffffff', 0.35));
      g.addColorStop(1, c);
    } else {
      g.addColorStop(0, shade(c, 0.3));
      g.addColorStop(0.45, shade(c, 0.06));
      g.addColorStop(1, shade(c, -0.24));
    }
    this.inkIt(g);
  }

  // A flat shape on a face (a door, a window): `pts` in units, filled and
  // inked thin. Not drawn in a ghost, nor before the course over it is laid.
  decal(pts: ReadonlyArray<readonly [number, number, number]>, fill: Color, w = 0.6): void {
    if (this.ghost) return;
    let z1 = -Infinity;
    for (const q of pts) z1 = Math.max(z1, q[2]);
    if (z1 > this.cut + 0.05) return;
    this.pen.beginPath();
    path(this.pen, pts.map(([x, y, z]) => this.at(x, y, z)));
    this.inkIt(fill, this.lw * w);
  }

  // A thin line on a face, below the cut.
  seam(a: readonly [number, number, number], b: readonly [number, number, number], color: Color, w = 0.45): void {
    if (this.ghost || Math.max(a[2], b[2]) > this.cut + 0.05) return;
    const p = this.pen;
    p.beginPath();
    p.moveTo(...this.at(a[0], a[1], a[2]));
    p.lineTo(...this.at(b[0], b[1], b[2]));
    p.strokeStyle = color;
    p.lineWidth = Math.max(1, this.lw * w);
    p.lineCap = 'round';
    p.stroke();
  }

  // A gable roof along x from x0 to x1: eaves `dy` either side of the
  // ridge at zE, the ridge at zR. The end toward +x is the gable, `wall`
  // inside a rim of roof. Cut below the ridge, its top is flat.
  gable(x0: number, x1: number, dy: number, zE: number, zR: number, base: Color, wall: Color): void {
    if (zE >= this.cut) return;
    const zc = Math.min(zR, this.cut);
    const cut = zc < zR;
    const dc = (dy * (zR - zc)) / (zR - zE);
    const at = this.at;
    const c = this.col(base);
    const p = this.pen;
    const front: Pt[] = [at(x0, dy, zE), at(x1, dy, zE), at(x1, dc, zc), at(x0, dc, zc)];
    const end: Pt[] = cut ? [at(x1, dy, zE), at(x1, -dy, zE), at(x1, -dc, zc), at(x1, dc, zc)] : [at(x1, dy, zE), at(x1, -dy, zE), at(x1, 0, zR)];
    const all = [...front, ...end, at(x0, -dy, zE), at(x0, -dc, zc)];
    const sil = hull(all);
    this.sils.push((q) => path(q, sil));
    p.save();
    p.lineJoin = 'round';
    p.lineCap = 'round';
    p.beginPath();
    path(p, sil);
    p.fillStyle = shade(c, -0.18);
    p.fill();
    // The slope toward the viewer: a little brighter than a wall facing
    // the same way, as it tips up toward the light.
    const fc = shade(c, 0.05);
    p.beginPath();
    path(p, front);
    p.fillStyle = fc;
    p.fill();
    // The gable: the wall inside a rim of roof.
    p.beginPath();
    path(p, end);
    p.fillStyle = shade(c, -0.18);
    p.fill();
    if (!this.ghost) {
      const rim = Math.min(0.55, dy * 0.2);
      const k = (zR - zE) / dy;
      const inner: Pt[] = cut
        ? [at(x1, dy - rim, zE), at(x1, -dy + rim, zE), at(x1, -Math.max(0, dc - rim), zc), at(x1, Math.max(0, dc - rim), zc)]
        : [at(x1, dy - rim, zE), at(x1, -dy + rim, zE), at(x1, 0, zR - rim * k * 1.2)];
      p.beginPath();
      path(p, inner);
      p.fillStyle = shade(this.col(wall), -0.18);
      p.fill();
      p.strokeStyle = this.ink;
      p.lineWidth = this.lw * 0.5;
      p.stroke();
      // Courses of tiles across the slope, and a light edge along the eave.
      for (let i = 1; i < 4; i++) {
        const z = zE + ((zR - zE) * i) / 4;
        if (z >= zc - 0.15) break;
        const y = (dy * (zR - z)) / (zR - zE);
        p.beginPath();
        p.moveTo(...at(x0 + 0.15, y, z));
        p.lineTo(...at(x1 - 0.15, y, z));
        p.strokeStyle = shade(c, -0.16);
        p.lineWidth = Math.max(1, this.lw * 0.45);
        p.stroke();
      }
      p.beginPath();
      const e = this.lw * 1.1;
      const [ax, ay] = at(x0, dy, zE);
      const [bx, by] = at(x1, dy, zE);
      p.moveTo(ax + e * 0.6, ay - e);
      p.lineTo(bx - e * 0.9, by - e);
      p.strokeStyle = mix(fc, '#fffdf4', 0.45);
      p.lineWidth = Math.max(1, this.lw * 0.55);
      p.stroke();
    }
    if (cut) {
      const top: Pt[] = [at(x0, -dc, zc), at(x1, -dc, zc), at(x1, dc, zc), at(x0, dc, zc)];
      p.beginPath();
      path(p, top);
      p.fillStyle = this.ghost ? c : shade(c, 0.2);
      p.fill();
      p.strokeStyle = this.line;
      p.lineWidth = this.lw * 0.6;
      p.stroke();
    }
    // Inner edges: where the slope meets the gable, and the ridge.
    p.beginPath();
    p.moveTo(...at(x1, dy, zE));
    p.lineTo(...at(x1, dc, zc));
    p.strokeStyle = this.line;
    p.lineWidth = this.lw * 0.6;
    p.stroke();
    p.beginPath();
    path(p, sil);
    p.lineWidth = this.ghost ? this.lw * 0.6 : this.lw;
    p.stroke();
    p.restore();
  }

  // A smooth pyramid on a square footprint `a0` either side of the middle
  // at z0, rising to an apex at zA; above zP the tip is the glowing cap.
  // Courses run round it, a stair climbs the face toward the lower left.
  pyramid(a0: number, z0: number, zA: number, zP: number, m: Mats): void {
    const at = this.at;
    const half = (z: number) => a0 * ((zA - z) / (zA - z0));
    const p = this.pen;
    const body = (zb: number, zt: number, base: Color, cap: boolean) => {
      if (zb >= this.cut) return;
      const cut = zt > this.cut;
      zt = Math.min(zt, this.cut);
      const h = half(zb);
      const k = half(zt);
      const P0 = (x: number, y: number) => at(x * h, y * h, zb);
      const P1 = (x: number, y: number) => at(x * k, y * k, zt);
      const c = this.col(base);
      // The faces seen: toward the lower left (lit) and the lower right.
      const left: Pt[] = [P0(-1, 1), P0(1, 1), P1(1, 1), P1(-1, 1)];
      const right: Pt[] = [P0(1, 1), P0(1, -1), P1(1, -1), P1(1, 1)];
      const sil = hull([...left, ...right, P1(-1, -1)]);
      this.sils.push((q) => path(q, sil));
      const fl = cap && !this.ghost ? shade(c, 0.12) : shade(c, 0.05);
      const fr = cap && !this.ghost ? shade(c, -0.08) : shade(c, -0.16);
      p.save();
      p.lineJoin = 'round';
      p.lineCap = 'round';
      p.beginPath();
      path(p, left);
      p.fillStyle = fl;
      p.fill();
      p.beginPath();
      path(p, right);
      p.fillStyle = fr;
      p.fill();
      if (!this.ghost && !cap) {
        // Courses every two units round both faces.
        for (let z = zb + 2; z < zt - 0.3; z += 2) {
          const q = half(z);
          p.beginPath();
          p.moveTo(...at(-q, q, z));
          p.lineTo(...at(q, q, z));
          p.lineTo(...at(q, -q, z));
          p.strokeStyle = shade(c, -0.24);
          p.lineWidth = Math.max(1, this.lw * 0.45);
          p.stroke();
        }
        // The stair: a strip up the middle of the lit face, step by step.
        const w = Math.min(1.2, h * 0.28);
        const strip: Pt[] = [at(-w, h, zb), at(w, h, zb), at(w, k, zt), at(-w, k, zt)];
        p.beginPath();
        path(p, strip);
        p.fillStyle = shade(m.c === m.a ? mix(m.c, this.ink, 0.15) : m.c, 0.02);
        p.fill();
        p.strokeStyle = this.ink;
        p.lineWidth = this.lw * 0.5;
        p.stroke();
        for (let z = zb + 0.55; z < zt - 0.2; z += 0.55) {
          const q = half(z);
          p.beginPath();
          p.moveTo(...at(-w, q, z));
          p.lineTo(...at(w, q, z));
          p.strokeStyle = mix(m.c, this.ink, 0.45);
          p.lineWidth = Math.max(1, this.lw * 0.35);
          p.stroke();
        }
      }
      if (cut) {
        p.beginPath();
        path(p, [P1(1, 1), P1(1, -1), P1(-1, -1), P1(-1, 1)]);
        p.fillStyle = this.ghost ? c : shade(c, 0.2);
        p.fill();
        p.strokeStyle = this.line;
        p.lineWidth = this.lw * 0.6;
        p.stroke();
      }
      // the ridge toward the viewer, a light edge beside it on the lit face
      p.beginPath();
      p.moveTo(...P0(1, 1));
      p.lineTo(...P1(1, 1));
      p.strokeStyle = this.line;
      p.lineWidth = this.lw * 0.6;
      p.stroke();
      if (!this.ghost) {
        const e = this.lw * 0.9;
        const [ax, ay] = P0(1, 1);
        const [bx, by] = P1(1, 1);
        p.beginPath();
        p.moveTo(ax - e * 1.2, ay - e * 1.6);
        p.lineTo(bx - e * 0.9, by + (cut ? e * 1.2 : e * 2.2));
        p.strokeStyle = mix(fl, '#fffdf4', 0.45);
        p.lineWidth = Math.max(1, this.lw * 0.5);
        p.stroke();
      }
      p.beginPath();
      path(p, sil);
      p.strokeStyle = this.line;
      p.lineWidth = this.ghost ? this.lw * 0.6 : this.lw;
      p.stroke();
      p.restore();
    };
    body(z0, zP, m.a, false);
    body(zP, zA, m.cap, true);
  }
}

// The outline of a drum's side: the bottom ellipse's front, the top's
// back, and the two lines tangent to both (in a space where the ellipses
// are circles: y doubled).
function drumPath(p: Pen, B: Pt, a0: number, T: Pt, a1: number): void {
  const bx = B[0];
  const by = 2 * B[1];
  const tx = T[0];
  const ty = 2 * T[1];
  const d = Math.hypot(tx - bx, ty - by);
  if (d < 1e-6 || d <= Math.abs(a0 - a1)) {
    const [c, a] = a0 >= a1 ? [B, a0] : [T, a1];
    p.ellipse(c[0], c[1], a, a / 2, 0, 0, Math.PI * 2);
    return;
  }
  const ex = (tx - bx) / d;
  const ey = (ty - by) / d;
  const k = (a0 - a1) / d;
  const q = Math.sqrt(Math.max(0, 1 - k * k));
  const np = Math.atan2(k * ey + q * ex, k * ex - q * ey);
  const nm = Math.atan2(k * ey - q * ex, k * ex + q * ey);
  const back = Math.atan2(-ey, -ex);
  const fwd = Math.atan2(ey, ex);
  p.ellipse(B[0], B[1], a0, a0 / 2, 0, np, nm, !through(np, nm, back));
  if (a1 > 0.01) p.ellipse(T[0], T[1], a1, a1 / 2, 0, nm, np, !through(nm, np, fwd));
  else p.lineTo(T[0], T[1]);
  p.closePath();
}

// Whether going clockwise (increasing angle) from a0 to a1 passes m.
function through(a0: number, a1: number, m: number): boolean {
  const n = (v: number) => ((v % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  return n(m - a0) < n(a1 - a0);
}

function hull(pts: readonly Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && turn(lo[lo.length - 2], lo[lo.length - 1], q) <= 1e-9) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    while (up.length >= 2 && turn(up[up.length - 2], up[up.length - 1], p[i]) <= 1e-9) up.pop();
    up.push(p[i]);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

// ── the shapes ───────────────────────────────────────────────────────────
// Each reads its proportions off the survey (the blueprints in
// world/build.ts say where things are) and draws itself back to front.

type Form = (k: Chisel, sv: Survey, m: Mats) => void;

// The highest cap-coloured block (the beacon), or null.
function beacon(sv: Survey): Spot | null {
  let b: Spot | null = null;
  for (const c of sv.caps) if (!b || c.z > b.z) b = c;
  return b;
}

// An arched opening on a drum's surface facing angle `th`: `hw` units
// either side, from z0 to z1 (the arch's top).
function onDrum(r: (z: number) => number, th: number, hw: number, z0: number, z1: number): Array<[number, number, number]> {
  const pts: Array<[number, number, number]> = [];
  const pt = (t: number, z: number) => {
    const rz = r(z) + 0.04;
    const a = th + t / rz;
    pts.push([Math.cos(a) * rz, Math.sin(a) * rz, z]);
  };
  const spring = z1 - hw;
  pt(-hw, z0);
  pt(hw, z0);
  for (let i = 0; i <= 8; i++) {
    const a = (Math.PI * i) / 8;
    pt(hw * Math.cos(a), spring + hw * Math.sin(a) * 1.1);
  }
  return pts;
}

// A round tower: a stepped plinth, a tapering banded shaft with a door and
// lit slits, a corbelled crown with rounded merlons, a lantern on a post.
// Slimmer than its blocks (they are a stout drum), the crown and plinth
// near their reach.
const tower: Form = (k, sv, m) => {
  const bc = beacon(sv);
  const H = bc ? bc.z - 1 : sv.top - 2;
  const rP = Math.max(1.5, sv.course(0).r - 0.45);
  const rS = Math.max(1, rP * 0.62);
  const rC = Math.max(rS + 0.5, rP * 0.8);
  const zS = Math.min(2, H - 5);
  const zC = H - 4;
  const rT = rS * 0.86;
  const rAt = (z: number) => rS + ((rT - rS) * (z - zS)) / Math.max(1, zC - zS);
  k.drum(0, 0, 0, rP, 0, 0, zS * 0.55, rP, m.b, { hollow: 0.7 });
  k.drum(0, 0, zS * 0.55, rP - 0.45, 0, 0, zS, rP - 0.55, m.b, { hollow: 0.7 });
  k.drum(0, 0, zS, rS + 0.3, 0, 0, zS + 0.6, rS + 0.25, m.a);
  k.drum(0, 0, zS + 0.6, rS, 0, 0, zC, rT, m.a, { hollow: 0.55 });
  const span = zC - zS;
  for (const t of span > 9 ? [0.36, 0.7] : [0.55]) {
    const z = zS + span * t;
    k.ring(0, 0, z, z + 0.7, rAt(z) + 0.14, rAt(z + 0.7) + 0.14, m.b);
  }
  k.decal(onDrum(rAt, Math.PI / 4, Math.min(0.9, rS * 0.35), zS + 0.6, zS + 3.4), mix(m.a, k.ink, 0.6));
  for (let z = zS + 5, i = 0; z + 2 < zC - 0.8; z += 4.5, i++) {
    const turn = [0.12, Math.PI / 2 - 0.12, Math.PI / 4][i % 3];
    k.decal(onDrum(rAt, turn, 0.3, z, z + 1.7), m.cap);
  }
  k.drum(0, 0, zC - 1, rT, 0, 0, zC, rC, m.b);
  k.drum(0, 0, zC, rC, 0, 0, H - 1, rC, m.b, { hollow: 0.55 });
  // Merlons round the rim, the post and its lantern among them.
  const N = Math.max(10, Math.round(rC * 1.25) * 2);
  const mr = Math.min(0.9, ((Math.PI * rC) / N) * 0.8);
  const ring = rC - mr * 0.75;
  const teeth: Array<[number, number]> = [];
  for (let i = 0; i < N; i += 2) teeth.push([Math.cos(((i + 0.5) * 2 * Math.PI) / N) * ring, Math.sin(((i + 0.5) * 2 * Math.PI) / N) * ring]);
  teeth.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
  const tooth = ([x, y]: [number, number]) => k.drum(x, y, H - 1, mr, x, y, H - 0.05, mr * 0.9, m.b);
  for (const t of teeth) if (t[0] + t[1] < 0) tooth(t);
  k.drum(0, 0, H - 1, 0.5, 0, 0, H + 1.4, 0.42, m.a);
  k.drum(0, 0, H + 1.3, 0.72, 0, 0, H + 1.55, 0.72, m.b);
  k.ball(0, 0, H + 2.2, 0.72, m.cap, true);
  for (const t of teeth) if (t[0] + t[1] >= 0) tooth(t);
};

// A cottage: a plinth, walls with corner posts and a beam under the eaves,
// a door and lit windows, a stone chimney behind the ridge and a steep
// gable roof with deep eaves.
const house: Form = (k, sv, m) => {
  const c1 = sv.course(1);
  const hw = Math.max(1.5, (c1.x1 - c1.x0) / 2);
  const hd = Math.max(1.5, (c1.y1 - c1.y0) / 2);
  let wt = 1;
  while (wt < sv.top && sv.course(wt).x1 - sv.course(wt).x0 <= 2 * hw + 0.4) wt++;
  const ridge = Math.min(sv.top, wt + hd + 1.5);
  const trim = m.a;
  k.box(-hw - 0.3, -hd - 0.3, 0, hw + 0.3, hd + 0.3, 0.7, trim, { round: 0.15 });
  k.box(-hw, -hd, 0.7, hw, hd, wt, m.b, { hollow: 0.45 });
  // corner posts at the three corners in view, the beam over the walls
  const p = 0.32;
  for (const [x, y] of [[hw, hd], [hw, -hd], [-hw, hd]] as const) k.box(x - p, y - p, 0.7, x + p, y + p, wt, trim, { stripe: false });
  k.box(-hw - 0.08, -hd - 0.08, wt - 0.55, hw + 0.08, hd + 0.08, wt, trim);
  // A door in the front wall (toward the lower left), windows either side
  // and in the end wall, lit from within.
  const dz = 0.7;
  const doorTop = Math.min(wt - 0.8, dz + 3.2);
  const arch = (x: number, y: number, w: number, z0: number, z1: number, along: 'x' | 'y') => {
    const pts: Array<[number, number, number]> = [];
    const put = (t: number, z: number) => pts.push(along === 'x' ? [x + t, y, z] : [x, y + t, z]);
    put(-w, z0);
    put(w, z0);
    for (let i = 0; i <= 8; i++) {
      const a = (Math.PI * i) / 8;
      put(w * Math.cos(a), z1 - w + w * Math.sin(a));
    }
    return pts;
  };
  const wood = mix(trim, k.ink, 0.45);
  k.decal(arch(0, hd + 0.02, 0.85, dz, doorTop, 'x'), wood);
  k.seam([0.45, hd + 0.03, dz + 1.4], [0.45, hd + 0.03, dz + 1.45], mix(m.cap, '#ffffff', 0.4), 1.4);
  const win = (x: number, y: number, along: 'x' | 'y') => {
    const z0 = Math.min(wt - 2.6, dz + 1.3);
    const z1 = z0 + 1.7;
    const w = 0.62;
    const sq = (t: number, z: number): [number, number, number] => (along === 'x' ? [x + t, y, z] : [x, y + t, z]);
    k.decal([sq(-w - 0.18, z0 - 0.18), sq(w + 0.18, z0 - 0.18), sq(w + 0.18, z1 + 0.18), sq(-w - 0.18, z1 + 0.18)], trim, 0.5);
    k.decal([sq(-w, z0), sq(w, z0), sq(w, z1), sq(-w, z1)], m.cap, 0.5);
    k.seam(sq(0, z0), sq(0, z1), trim, 0.7);
    k.seam(sq(-w, (z0 + z1) / 2), sq(w, (z0 + z1) / 2), trim, 0.7);
  };
  if (hw >= 3.4) for (const x of [-hw * 0.58, hw * 0.58]) win(x, hd + 0.02, 'x');
  win(hw + 0.02, 0, 'y');
  // The chimney: what of the blocks stands over the ridge, but the cap.
  let cx0 = Infinity;
  let cx1 = -Infinity;
  let cy0 = Infinity;
  let cy1 = -Infinity;
  let ct = 0;
  for (const b of sv.blocks) {
    if (b.z < ridge || sv.caps.some((c) => c.x === b.x && c.y === b.y && c.z === b.z)) continue;
    cx0 = Math.min(cx0, b.x - 0.5);
    cx1 = Math.max(cx1, b.x + 0.5);
    cy0 = Math.min(cy0, b.y - 0.5);
    cy1 = Math.max(cy1, b.y + 0.5);
    ct = Math.max(ct, b.z + 1);
  }
  if (ct > 0) {
    k.box(cx0 + 0.1, cy0 + 0.1, wt, cx1 - 0.1, cy1 - 0.1, ct - 0.4, m.c === m.b ? trim : m.c, { stripe: false });
    k.box(cx0 - 0.1, cy0 - 0.1, ct - 0.4, cx1 + 0.1, cy1 + 0.1, ct + 0.1, trim, { hollow: 0.3 });
    if (k.cut >= ct + 0.1) k.decal([[cx0 + 0.25, cy0 + 0.25, ct + 0.1], [cx1 - 0.25, cy0 + 0.25, ct + 0.1], [cx1 - 0.25, cy1 - 0.25, ct + 0.1], [cx0 + 0.25, cy1 - 0.25, ct + 0.1]], m.cap, 0.4);
  }
  const roof = m.c === m.b ? mix(m.c, k.ink, 0.22) : m.c;
  k.gable(-hw - 0.9, hw + 0.9, hd + 1.1, wt - 0.3, ridge, roof, m.b);
};

// A smooth pyramid on a low plinth: courses, a stair up its lit face, a
// glowing tip. Square to the walls (a corner toward the viewer), its
// corners inside the circle the blueprint's diamond keeps clear (so nobody
// walks into them), as tall as its blocks.
const pyramid: Form = (k, sv, m) => {
  const a = Math.max(1.5, (sv.course(0).m + 1.1) / SQ2);
  let zP = sv.top - 2.4;
  for (const c of sv.caps) zP = Math.min(zP, c.z);
  k.box(-a - 0.25, -a - 0.25, 0, a + 0.25, a + 0.25, 0.8, m.b, { round: 0.12 });
  k.pyramid(a - 0.2, 0.8, sv.top + 0.3, Math.max(1.5, zP + 0.4), m);
};

// A robed figure on a two-step plinth: a flared robe with a belt and
// folds, round shoulders, a head with glowing eyes and a stone beard under
// a broad brim, a tall bent hat with a star on its tip, and an arm out to
// the staff at its side, crowned by an orb.
const statue: Form = (k, sv, m) => {
  const c0 = sv.course(0);
  const P = Math.max(1.5, (c0.x1 - c0.x0) / 2);
  let ph = 1;
  while (ph < sv.top && sv.course(ph).x1 - sv.course(ph).x0 > 2 * P - 0.4) ph++;
  const caps = [...sv.caps].sort((p, q) => p.z - q.z);
  const eyes = caps[0] && caps[1] && caps[0].z === caps[1].z ? caps[0].z : null;
  const robeH = eyes !== null ? eyes - ph - 1 : Math.max(3, Math.round((sv.top - ph) * 0.4));
  const star = beacon(sv);
  const hatTop = star ? star.z + 0.9 : sv.top;
  const base = ph + robeH;
  const w0 = Math.max(1.2, -sv.course(ph).x0 - 0.1);
  const w1 = Math.max(0.8, Math.min(w0 - 0.5, -sv.course(ph + robeH - 1).x0 - 0.3));
  k.box(-P, -P, 0, P, P, ph - 0.9, m.b, { round: 0.25 });
  k.box(-P + 0.4, -P + 0.4, ph - 0.9, P - 0.4, P - 0.4, ph, m.c, { round: 0.2 });
  // a blank plaque on the front of the plinth
  if (ph > 2.2) k.decal([[-P * 0.42, P + 0.02, 0.45], [P * 0.42, P + 0.02, 0.45], [P * 0.42, P + 0.02, ph - 1.3], [-P * 0.42, P + 0.02, ph - 1.3]], mix(m.c, k.ink, 0.12), 0.5);
  // The staff stands at its right hand (toward screen right).
  const d = Math.min(P - 0.9, w0 + 1.2) / SQ2;
  const staffTop = base + 3.6;
  k.drum(d, -d, ph, 0.24, d, -d, staffTop, 0.2, m.c);
  k.drum(d, -d, staffTop - 0.25, 0.38, d, -d, staffTop + 0.1, 0.4, m.b);
  // the robe, its hem and belt, folds down its front, the shoulders
  k.drum(0, 0, ph, w0 + 0.22, 0, 0, ph + 0.55, w0 + 0.16, m.a);
  k.drum(0, 0, ph + 0.55, w0, 0, 0, base - 0.4, w1, m.a, { flat: true });
  const wAt = (z: number) => w0 + ((w1 - w0) * (z - ph - 0.55)) / Math.max(1, base - 0.4 - ph - 0.55);
  const zb = ph + robeH * 0.5;
  for (const t of [-0.5, 0.5]) {
    const a = Math.PI / 4 + t / Math.max(1, w0);
    k.seam([Math.cos(a) * (w0 + 0.03), Math.sin(a) * (w0 + 0.03), ph + 0.65], [Math.cos(a) * (wAt(zb) + 0.05), Math.sin(a) * (wAt(zb) + 0.05), zb], mix(m.a, k.ink, 0.35), 0.5);
  }
  k.ring(0, 0, zb, zb + 0.5, wAt(zb) + 0.12, wAt(zb + 0.5) + 0.12, m.c);
  k.ball(0, 0, base - 0.45, w1 + 0.3, m.a);
  // the arm out to the staff, and the hand on it
  const za = base - 1.3;
  if (k.cut > za) {
    const p = k.pen;
    const [ax, ay] = k.at((w1 + 0.1) / SQ2, -(w1 + 0.1) / SQ2, base - 0.6);
    const [hx, hy] = k.at(d, -d, za);
    const lw = 0.9 * k.s;
    p.save();
    p.lineCap = 'round';
    p.beginPath();
    p.moveTo(ax, ay);
    p.lineTo(hx, hy);
    if (!k.ghost) {
      p.strokeStyle = k.ink;
      p.lineWidth = lw + 2 * k.lw;
      p.stroke();
      p.strokeStyle = shade(m.a, -0.1);
      p.lineWidth = lw;
      p.stroke();
    }
    p.restore();
    k.sils.push((q) => {
      q.moveTo(ax, ay);
      q.lineTo(hx, hy);
    });
    k.ball(d, -d, za, 0.45, m.b);
  }
  // head, eyes and beard; the bent hat sits low on the head (no brim, so
  // the face shows from above), a band round it, a star on its tip
  const hr = Math.max(0.85, Math.min(1.3, w1 * 0.7 + 0.4));
  const hz = base + 0.15 + hr;
  k.ball(0, 0, hz, hr, m.b);
  if (k.cut > hz && !k.ghost) {
    const beard: Array<[number, number, number]> = [];
    const bz = hz - hr * 0.42;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI / 4 - 0.85 + (1.7 * i) / 8;
      beard.push([Math.cos(a) * hr * 0.95, Math.sin(a) * hr * 0.95, bz - Math.sin((Math.PI * i) / 8) * 0.15]);
    }
    beard.push([((w1 + 0.3) * Math.cos(Math.PI / 4)) * 1.02, ((w1 + 0.3) * Math.sin(Math.PI / 4)) * 1.02, base - 1.5]);
    k.decal(beard, shade(m.c, 0.04), 0.6);
    for (const t of [-0.42, 0.42]) {
      const a = Math.PI / 4 + t;
      const [ex, ey] = k.at(Math.cos(a) * hr * 0.86, Math.sin(a) * hr * 0.86, hz - hr * 0.12);
      k.pen.beginPath();
      k.pen.ellipse(ex, ey, 0.16 * k.s + 0.8, 0.13 * k.s + 0.8, 0, 0, Math.PI * 2);
      k.pen.fillStyle = mix(m.cap, '#ffffff', 0.35);
      k.pen.fill();
      k.pen.strokeStyle = k.ink;
      k.pen.lineWidth = k.lw * 0.35;
      k.pen.stroke();
    }
  }
  const brim = hz + hr * 0.3;
  k.drum(0, 0, brim, hr * 0.98, 0, 0, brim + 0.32, hr * 0.94, m.c);
  const lean = star ? { x: star.x, y: star.y } : { x: -1.5, y: 1.5 };
  const hat: Array<{ x: number; y: number; z: number; r: number }> = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    hat.push({ x: lean.x * t * t, y: lean.y * t * t, z: brim + 0.3 + (hatTop - 0.8 - brim) * t, r: Math.max(0.1, (hr * 0.88) * (1 - t) + 0.1) });
  }
  k.tube(hat, m.a);
  if (star) k.ball(star.x, star.y, hatTop - 0.5, 0.42, m.cap, true);
  k.ball(d, -d, staffTop + 0.72, 0.62, m.cap, true);
};

// An engine on skids: a rounded casing with a lamp row, vents and a lit
// screen, a domed tank, a pipe across to a banded stack, a beacon on the
// stack.
const machine: Form = (k, sv, m) => {
  const c0 = sv.course(0);
  const hx = Math.max(1.5, (c0.x1 - c0.x0) / 2);
  const hy = Math.max(1.5, (c0.y1 - c0.y0) / 2);
  // The casing: the courses reaching its right and front sides (what
  // stands on it keeps back from them).
  let bh = 1;
  while (bh < sv.top && sv.course(bh).x1 > c0.x1 - 0.4 && sv.course(bh).y1 > c0.y1 - 0.4) bh++;
  const bc = beacon(sv);
  // The stack: the column under the beacon (else the highest blocks).
  let sx = hx - 1.5;
  let sy = -hy + 1.5;
  let stTop = sv.top;
  if (bc) {
    stTop = bc.z;
    let n = 0;
    let ax = 0;
    let ay = 0;
    for (const b of sv.blocks) {
      if (b.z !== bc.z - 1) continue;
      ax += b.x;
      ay += b.y;
      n++;
    }
    if (n) [sx, sy] = [ax / n, ay / n];
  }
  // The tank: what stands on the casing's first course up, away from the stack.
  let tx0 = Infinity;
  let tx1 = -Infinity;
  let tt = bh;
  for (const b of sv.blocks) {
    if (b.z !== bh || Math.hypot(b.x - sx, b.y - sy) < 1.6) continue;
    tx0 = Math.min(tx0, b.x - 0.5);
    tx1 = Math.max(tx1, b.x + 0.5);
  }
  const tr = Number.isFinite(tx0) ? Math.max(0.8, (tx1 - tx0) / 2) : 0;
  const tx = (tx0 + tx1) / 2;
  if (tr) for (const b of sv.blocks) if (b.z >= bh && Math.abs(b.x - tx) < tr && Math.abs(b.y) < tr && Math.hypot(b.x - sx, b.y - sy) >= 1.6) tt = Math.max(tt, b.z + 1);
  const frame = m.a;
  k.box(-hx + 0.05, -hy + 0.05, 0, hx - 0.05, hy - 0.05, 0.6, frame, { round: 0.2 });
  k.box(-hx + 0.4, -hy + 0.4, 0.6, hx - 0.4, hy - 0.4, bh - 0.5, m.b, { round: 0.45 });
  k.box(-hx + 0.25, -hy + 0.25, bh - 0.5, hx - 0.25, hy - 0.25, bh, frame, { round: 0.3 });
  // The front (toward the lower left): lamps under the lid, vents below.
  const fy = hy - 0.38;
  for (let x = -hx + 1.4; x < hx - 1; x += 2.2) {
    const [lx, ly] = k.at(x, fy, bh - 1.25);
    if (!k.ghost && k.cut > bh - 0.6) {
      k.pen.beginPath();
      k.pen.ellipse(lx, ly, 0.36 * k.s, 0.42 * k.s, 0, 0, Math.PI * 2);
      k.pen.fillStyle = m.cap;
      k.pen.fill();
      k.pen.strokeStyle = k.ink;
      k.pen.lineWidth = k.lw * 0.5;
      k.pen.stroke();
      k.pen.beginPath();
      k.pen.ellipse(lx - 0.1 * k.s, ly - 0.12 * k.s, 0.12 * k.s, 0.12 * k.s, 0, 0, Math.PI * 2);
      k.pen.fillStyle = '#ffffff';
      k.pen.fill();
    }
  }
  const vent = mix(m.b, k.ink, 0.45);
  for (let z = 1.4; z < bh - 2.2; z += 0.7) k.seam([-hx + 0.9, fy, z], [-hx * 0.1, fy, z], vent, 0.7);
  // The side (toward the lower right): a lit screen in a frame.
  const sxf = hx - 0.38;
  const s0 = 1.4;
  const s1 = Math.min(bh - 1.3, s0 + 2.4);
  const sw = Math.min(hy - 0.8, 1.7);
  if (s1 > s0 + 0.6) {
    k.decal([[sxf, -sw - 0.2, s0 - 0.2], [sxf, sw + 0.2, s0 - 0.2], [sxf, sw + 0.2, s1 + 0.2], [sxf, -sw - 0.2, s1 + 0.2]], frame, 0.5);
    k.decal([[sxf, -sw, s0], [sxf, sw, s0], [sxf, sw, s1], [sxf, -sw, s1]], m.cap, 0.5);
    const wave = mix(m.cap, k.ink, 0.5);
    const zm = (s0 + s1) / 2;
    for (let i = 0; i < 6; i++) {
      const y0 = -sw + 0.25 + ((2 * sw - 0.5) * i) / 6;
      const y1 = -sw + 0.25 + ((2 * sw - 0.5) * (i + 1)) / 6;
      k.seam([sxf, y0, zm + (i % 2 ? 0.45 : -0.35)], [sxf, y1, zm + (i % 2 ? -0.35 : 0.45)], wave, 0.6);
    }
  }
  // On the lid: the pipe at the back, the tank, the stack.
  const py = sy + 0.5;
  const pz = bh + 2.2;
  if (tr && k.cut > pz + 0.4) {
    const [ax, ay] = k.at(tx + tr * 0.5, py, pz);
    const [bx, by] = k.at(sx, py, pz);
    const p = k.pen;
    p.save();
    p.lineCap = 'round';
    p.beginPath();
    p.moveTo(ax, ay);
    p.lineTo(bx, by);
    if (!k.ghost) {
      p.strokeStyle = k.ink;
      p.lineWidth = 0.75 * k.s + 2 * k.lw;
      p.stroke();
      p.strokeStyle = shade(frame, 0.08);
      p.lineWidth = 0.75 * k.s;
      p.stroke();
      p.beginPath();
      p.moveTo(ax, ay - 0.22 * k.s);
      p.lineTo(bx, by - 0.22 * k.s);
      p.strokeStyle = mix(shade(frame, 0.12), '#fffdf4', 0.4);
      p.lineWidth = Math.max(1, k.lw * 0.5);
      p.stroke();
    }
    p.restore();
  }
  if (tr) {
    // a squat tank on a ring of feet, one hoop round it, a domed lid
    const r = tr * 0.9;
    const zd = Math.max(bh + 1.2, tt - 1.3);
    k.drum(tx, 0, bh, r * 0.85, tx, 0, bh + 0.35, r * 0.85, frame);
    k.drum(tx, 0, bh + 0.35, r, tx, 0, zd, r, m.c);
    if (zd - bh > 1.6) k.ring(tx, 0, (bh + zd) / 2 - 0.2, (bh + zd) / 2 + 0.2, r + 0.08, r + 0.08, frame);
    k.drum(tx, 0, zd, r, tx, 0, zd + 0.55, r * 0.78, m.c, { flat: true });
    k.drum(tx, 0, zd + 0.55, r * 0.78, tx, 0, tt - 0.15, r * 0.4, m.c);
    k.drum(tx, 0, tt - 0.2, 0.3, tx, 0, tt + 0.25, 0.3, frame);
  }
  const sr = 0.95;
  k.drum(sx, sy, bh, sr, sx, sy, stTop - 0.4, sr * 0.92, frame);
  for (let z = bh + 2; z < stTop - 1.2; z += 3) k.ring(sx, sy, z, z + 0.5, sr * 0.97 + 0.12, sr * 0.96 + 0.12, m.b);
  k.drum(sx, sy, stTop - 0.6, sr + 0.2, sx, sy, stTop, sr + 0.22, m.b, { hollow: 0.3 });
  if (bc) k.ball(sx, sy, stTop + 0.65, 0.6, m.cap, true);
};

const FORMS: Record<BuildShape, Form> = { tower, house, pyramid, statue, machine };

// ── the sprites ──────────────────────────────────────────────────────────

// A build as it stands, at `s` px per unit: its body (null when there is
// nothing to draw) and its shadow on the floor (null until a brick is
// laid). `ceil`: the room's wall value (see wallValue), which its plain
// colours stay a little under.
export function buildSprite(b: BuildLook, s: number, ink: Color, ceil = 255): { body: Sprite | null; floor: Sprite | null } {
  const all = b.pending.length ? [...b.blocks, ...b.pending] : b.blocks;
  if (!all.length) return { body: null, floor: null };
  const cap = b.colors.length > 1 ? b.colors.length - 1 : -1;
  const sv = new Survey(all, cap);
  const mats = matsOf(b.colors, Math.min(255, ceil * 1.1 + 18));
  const lw = inkWidth(s) + 0.5;
  const ext = sv.extent;
  // The canvas: the blocks' box and a margin for the beacon and scaffold.
  const corners: Pt[] = [];
  for (const x of [ext.x0 - 1.5, ext.x1 + 1.5]) for (const y of [ext.y0 - 1.5, ext.y1 + 1.5]) for (const z of [0, sv.top + 2]) corners.push([(sv.cx + x - (sv.cy + y)) * s, ((sv.cx + x + sv.cy + y) * s) / 2 - z * s]);
  const pad = lw * 2 + 2;
  const bx = Math.floor(Math.min(...corners.map((c) => c[0])) - pad);
  const by = Math.floor(Math.min(...corners.map((c) => c[1])) - pad);
  const w = Math.ceil(Math.max(...corners.map((c) => c[0])) + pad) - bx;
  const h = Math.ceil(Math.max(...corners.map((c) => c[1])) + pad) - by;
  const at: At = (x, y, z) => [(sv.cx + x - (sv.cy + y)) * s - bx, ((sv.cx + x + sv.cy + y) * s) / 2 - z * s - by];
  const form = FORMS[b.shape] ?? tower;
  const img = new Canvas(w, h);
  // How high it stands: the top laid course, as far round as it is laid.
  let cut = Infinity;
  if (b.pending.length) {
    let top = -1;
    for (const q of b.blocks) top = Math.max(top, q.z);
    if (top < 0) cut = 0;
    else {
      let laid = 0;
      let course = 0;
      for (const q of b.blocks) if (q.z === top) laid++;
      for (const q of all) if (q.z === top) course++;
      cut = top + laid / Math.max(1, course);
    }
    // The ghost of the rest: drawn whole and faint, inside a light outline.
    const g = new Canvas(w, h);
    const gh = hexOf(b.ghost);
    const k = new Chisel(g, at, s, ink, lw, Infinity, { fill: mix(gh, '#ffffff', 0.2), line: mix(gh, '#ffffff', 0.55) });
    form(k, sv, mats);
    const ring = new Canvas(w, h);
    ring.lineJoin = 'round';
    ring.strokeStyle = mix(gh, '#ffffff', 0.35);
    ring.lineWidth = Math.max(2, lw * 1.3);
    for (const sil of k.sils) {
      ring.beginPath();
      sil(ring);
      ring.stroke();
    }
    ring.globalCompositeOperation = 'destination-out';
    ring.fillStyle = '#000000';
    for (const sil of k.sils) {
      ring.beginPath();
      sil(ring);
      ring.fill();
    }
    img.globalAlpha = 0.13;
    img.drawImage(g, 0, 0);
    img.globalAlpha = 0.75;
    img.drawImage(ring, 0, 0);
    img.globalAlpha = 1;
  }
  if (cut > 0) form(new Chisel(img, at, s, ink, lw, cut, null), sv, mats);
  if (cut > 0.3 && cut < Infinity) scaffold(img, at, s, ink, lw, sv, cut);
  const body: Sprite = { img, x: bx, y: by };
  if (!b.blocks.length) return { body, floor: null };
  // The shadow: an ellipse a unit past the footprint, on the floor.
  const c0 = sv.course(0);
  const ru = (c0.x1 - c0.x0) / 2 + 1;
  const rv = (c0.y1 - c0.y0) / 2 + 1;
  const ox = (c0.x0 + c0.x1) / 2;
  const oy = (c0.y0 + c0.y1) / 2;
  const fc: Pt[] = [];
  for (const x of [-ru, ru]) for (const y of [-rv, rv]) fc.push([(sv.cx + ox + x - (sv.cy + oy + y)) * s, ((sv.cx + ox + x + sv.cy + oy + y) * s) / 2]);
  const fx = Math.floor(Math.min(...fc.map((c) => c[0])) - 2);
  const fy = Math.floor(Math.min(...fc.map((c) => c[1])) - 2);
  const floor = new Canvas(Math.ceil(Math.max(...fc.map((c) => c[0])) + 2) - fx, Math.ceil(Math.max(...fc.map((c) => c[1])) + 2) - fy);
  const fat: At = (x, y, z) => [(sv.cx + x - (sv.cy + y)) * s - fx, ((sv.cx + x + sv.cy + y) * s) / 2 - z * s - fy];
  contactShadow(floor, fat, ox, oy, ru, rv, 0.3);
  return { body, floor: { img: floor, x: fx, y: fy } };
}

// Two poles and a plank by the side toward the lower right while a build
// goes up, the plank just under the fresh course.
function scaffold(pen: Canvas, at: At, s: number, ink: Color, lw: number, sv: Survey, cut: number): void {
  const c = sv.course(Math.max(0, Math.ceil(cut) - 1));
  const x = Math.min(c.x1 + 0.45, sv.extent.x1 - 0.3);
  const ym = (c.y0 + c.y1) / 2;
  const half = Math.max(0.8, Math.min(2.4, (c.y1 - c.y0) * 0.32));
  const top = cut + 1.5;
  const zp = Math.max(0.2, cut - 0.85);
  const line = lw * 0.8;
  const ys = [ym - half, ym + half];
  const pole = (y: number) => {
    const z0 = sv.floorAt(x, y, cut);
    const B = at(x, y, z0);
    const T = at(x, y, top);
    const r = Math.max(1.2, 0.17 * SQ2 * s);
    pen.beginPath();
    pen.moveTo(B[0], B[1]);
    pen.lineTo(T[0], T[1]);
    pen.lineCap = 'round';
    pen.strokeStyle = ink;
    pen.lineWidth = 2 * r + 2 * line;
    pen.stroke();
    pen.strokeStyle = WOOD;
    pen.lineWidth = 2 * r;
    pen.stroke();
    pen.beginPath();
    pen.moveTo(B[0] - r * 0.35, B[1]);
    pen.lineTo(T[0] - r * 0.35, T[1]);
    pen.strokeStyle = shade(WOOD, 0.25);
    pen.lineWidth = Math.max(1, r * 0.45);
    pen.stroke();
  };
  pole(ys[0]);
  isoBox(pen, at, x - 0.45, ys[0] - 0.55, zp, 0.9, ys[1] - ys[0] + 1.1, 0.26, PLANK, { ink, line });
  pole(ys[1]);
}

// The supply pile: a pallet with a few bricks stacked on it, in the build's
// colours (not the cap), laid differently per pile, a soft shadow under it.
export function pileSprite(pile: Rect, colors: readonly RGB[], s: number, ink: Color, seed: number): Sprite {
  const plain = colors.length > 1 ? colors.slice(0, -1) : colors;
  const pad = Math.ceil(inkWidth(s) * 2 + 2 + 0.6 * s);
  const w = pile.x1 - pile.x0;
  const d = pile.y1 - pile.y0;
  const cs: Pt[] = [];
  for (const x of [pile.x0, pile.x1]) for (const y of [pile.y0, pile.y1]) for (const z of [0, 2]) cs.push([(x - y) * s, ((x + y) * s) / 2 - z * s]);
  const bx = Math.floor(Math.min(...cs.map((c) => c[0])) - pad);
  const by = Math.floor(Math.min(...cs.map((c) => c[1])) - pad);
  const img = new Canvas(Math.ceil(Math.max(...cs.map((c) => c[0])) + pad) - bx, Math.ceil(Math.max(...cs.map((c) => c[1])) + pad) - by);
  const at = (x: number, y: number, z: number): Pt => [(x - y) * s - bx, ((x + y) * s) / 2 - z * s - by];
  const local = (u: number, v: number, z: number): Pt => at(pile.x0 + u, pile.y0 + v, z);
  const line = inkWidth(s) * 0.8;
  contactShadow(img, local, w / 2, d / 2, w / 2 + 0.35, d / 2 + 0.35, 0.3);
  isoBox(img, local, 0.15, 0.15, 0, w - 0.3, d - 0.3, 0.35, '#8a6440', { ink, line, round: 0.15, stripe: false });
  // Bricks: two courses crosswise, back to front.
  const bricks: Array<[number, number, number, number, number, number]> = [];
  const bw = (w - 0.6) / 2;
  const bd = (d - 0.6) / 3;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) bricks.push([0.3 + i * bw, 0.3 + j * bd, 0.35, bw - 0.08, bd - 0.08, 0.55]);
  const top = seed % 3;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) if ((i + j + top) % 3) bricks.push([0.35 + i * ((w - 0.7) / 3), 0.35 + j * ((d - 0.7) / 2), 0.9, (w - 0.7) / 3 - 0.08, (d - 0.7) / 2 - 0.08, 0.55]);
  bricks.sort((p, q) => p[0] + p[1] + p[2] - (q[0] + q[1] + q[2]));
  bricks.forEach(([u, v, z, du, dv, dz], k) => {
    const c = plain[(k + seed) % plain.length] ?? [200, 120, 80];
    isoBox(img, local, u, v, z, du, dv, dz, hexOf(c), { ink, line, round: 0.12 });
  });
  return { img, x: bx, y: by };
}
