import type { RGB } from '../term/color.ts';
import type { BuildShape } from '../worlds/types.ts';
import type { Rect } from './layout.ts';
import { buildSites, hub } from './layout.ts';
import type { Rng } from './rng.ts';
import type { Layout } from './types.ts';

// Building together: what characters raise on the build plazas, block by
// block. A blueprint is a list of unit blocks, bottom-up, each coloured by
// an index into the world's build colours; a construction hands it out in
// bricks (one carried load each, two for a small build). What is still to
// come is the build's ghost (the scene draws it as a hologram). Nothing
// here is drawn: the scene renders `blocks.slice(0, laid)` and the ghost.

// (x, y, z) is the block's low corner in units; `c` indexes the colours.
export type Block = { x: number; y: number; z: number; c: number };
export type Shape = BuildShape;
export type Plaza = { x: number; y: number; r: number };
export type Disc = { x: number; y: number; r: number };
// What a world builds with: colours, frame first; the last is the glowing
// cap that crowns it (a lamp, a beacon, neon). One colour serves for all.
export type BuildStyle = { colors: readonly RGB[]; shape: Shape };

export const SHAPES: readonly Shape[] = ['tower', 'house', 'pyramid', 'statue', 'machine'];
// What goes up on the second plaza next to the world's own shape.
const COMPANION: Record<Shape, Shape> = { tower: 'statue', house: 'tower', pyramid: 'statue', statue: 'tower', machine: 'tower' };
const RENEW_AFTER = 240; // seconds with every plaza built before the oldest is rebuilt
const COOLDOWN = 6; // seconds between finishing one build and starting the next
const SMALL = 30; // builds of fewer bricks than this go up two bricks a haul

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// The colour index of the cap.
export function capOf(colors: readonly RGB[]): number {
  return Math.max(0, colors.length - 1);
}

// ── blueprints ───────────────────────────────────────────────────────────
// Every shape is a solid `fill` (a material code, or 0) over a box round
// the origin; only its skin is kept (a block with an empty neighbour), so
// the inside stays hollow and cheap. `paint` then recolours skin blocks or
// cuts them (0) for doors and windows. Codes are colour index + 1.
type Fill = (x: number, y: number, z: number) => number;
type Code = { x: number; y: number; z: number; m: number };

function skin(R: number, H: number, fill: Fill, paint?: (x: number, y: number, z: number, m: number) => number): Code[] {
  const out: Code[] = [];
  const at = (x: number, y: number, z: number) => (z < 0 ? 1 : fill(x, y, z));
  const n = Math.ceil(R);
  for (let z = 0; z <= H; z++) {
    for (let y = -n; y <= n; y++) {
      for (let x = -n; x <= n; x++) {
        const m = fill(x, y, z);
        if (!m) continue;
        const open =
          !at(x + 1, y, z) || !at(x - 1, y, z) || !at(x, y + 1, z) || !at(x, y - 1, z) || !at(x, y, z + 1) || !at(x, y, z - 1) ||
          !at(x + 1, y + 1, z) || !at(x - 1, y - 1, z) || !at(x + 1, y - 1, z) || !at(x - 1, y + 1, z);
        if (!open) continue;
        const p = paint ? paint(x, y, z, m) : m;
        if (p) out.push({ x, y, z, m: p });
      }
    }
  }
  return out;
}

type Mats = { a: number; b: number; c: number; cap: number };

// Material codes for a palette of `n` colours: up to three plain ones, then
// the cap.
function matsOf(n: number): Mats {
  const cap = Math.max(0, n - 1) + 1;
  const plain = n >= 2 ? n - 1 : 1;
  const a = 1;
  const b = plain >= 2 ? 2 : a;
  const c = plain >= 3 ? 3 : b;
  return { a, b, c, cap };
}

// A round tower: a plinth, a shaft banded every few courses with slit
// windows and a door facing the viewer, an overhanging crown with
// battlements, and a beacon on top.
function tower(m: Mats, R: number, H: number): Code[] {
  const shaft = R - 1.2;
  const N = Math.max(8, Math.round(R * 1.6) * 2);
  const merlon = (x: number, y: number) => Math.floor(((Math.atan2(y, x) + Math.PI) / (2 * Math.PI)) * N) % 2 === 0;
  const fill: Fill = (x, y, z) => {
    const d = Math.hypot(x, y);
    const post = Math.abs(x) <= 1 && Math.abs(y) <= 1;
    if (z <= 1) return d <= R + 0.3 ? m.b : 0;
    if (z < H - 4) return d <= shaft + 0.3 ? (z % 6 === 5 ? m.b : m.a) : 0;
    if (z <= H - 2) return d <= R + 0.3 ? m.b : 0;
    if (z === H - 1) return d <= R + 0.3 && d > R - 1.2 && merlon(x, y) ? m.b : post ? m.a : 0;
    if (z === H) return post ? m.a : 0;
    if (z === H + 1) return x === 0 && y === 0 ? m.cap : 0;
    return 0;
  };
  return skin(R + 1, H + 1, fill, (x, y, z, mat) => {
    if (z >= 2 && z <= 4 && x > 0 && y > 0 && Math.abs(x - y) <= 1) return 0; // door
    // Slit windows, lit from within, on the faces toward the viewer.
    const slit = z >= 7 && z < H - 5 && z % 6 >= 1 && z % 6 <= 2;
    if (slit && ((Math.abs(y) <= 0 && x > 0) || (Math.abs(x) <= 0 && y > 0) || (x > 0 && y > 0 && x === y + 1))) return m.cap;
    return mat;
  });
}

// A cottage: plinth, cornered walls with a door and lit windows, a gabled
// roof with overhanging eaves, and a chimney with a glow on top.
function house(m: Mats, R: number, H: number): Code[] {
  let hw = Math.floor(R * 0.75);
  let hd = Math.floor(R * 0.52);
  while (Math.hypot(hw + 1, hd + 1) > R + 0.3 && hw > 3) {
    hw--;
    if (hd > 2 && Math.hypot(hw + 1, hd + 1) > R + 0.3) hd--;
  }
  const wallH = clamp(Math.round(H * 0.4), 4, 9);
  const ridge = wallH + hd + 2;
  const cx = hw - 3;
  const cy = -Math.max(1, hd - 2);
  const chimTop = ridge + 3;
  const fill: Fill = (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if ((x === cx || x === cx + 1) && (y === cy || y === cy - 1) && z > wallH && z <= chimTop) return m.a;
    if (x === cx && y === cy && z === chimTop + 1) return m.cap;
    if (z === 0) return ax <= hw && ay <= hd ? m.a : 0;
    if (z <= wallH) return ax <= hw && ay <= hd ? ((ax === hw && ay === hd) || z === wallH ? m.a : m.b) : 0;
    const k = z - wallH;
    return ay <= hd + 2 - k && ax <= hw + 1 ? m.c : 0;
  };
  return skin(R + 1, chimTop + 1, fill, (x, y, z, mat) => {
    const ax = Math.abs(x);
    if (z >= 1 && z <= 3 && y === hd && ax <= 1) return 0; // door
    if (z >= 2 && z <= 3 && z < wallH && ((x === hw && Math.abs(y) <= 1) || (y === hd && ax === hw - 2 && hw >= 5))) return m.cap; // lit windows
    // Gable ends in wall material under the eaves.
    if (z > wallH && ax === hw + 1 && Math.abs(y) < hd + 2 - (z - wallH) && mat === m.c) return m.b;
    return mat;
  });
}

// A stepped pyramid on a diamond footprint, so one face looks straight at
// the viewer: banded courses, a stair up the front, a glowing pyramidion.
function pyramid(m: Mats, R: number, H: number): Code[] {
  const B = Math.max(4, Math.floor(R));
  const rise = clamp(Math.round(H / (B + 1)), 1, 2);
  const top = (B + 1) * rise - 1;
  const fill: Fill = (x, y, z) => {
    const h = B - Math.floor(z / rise);
    const d = Math.abs(x) + Math.abs(y);
    if (h < 0 || d > h) return 0;
    if (h <= 1) return m.cap;
    if (x > 0 && y > 0 && Math.abs(x - y) <= 1) return m.c;
    return Math.floor(z / (2 * rise)) % 2 ? m.b : m.a;
  };
  return skin(B + 1, top + 1, fill);
}

// A figure on a plinth, staff raised: robe, head with glowing eyes, a tall
// bent hat, and an orb that glows on the staff.
function statue(m: Mats, R: number, H: number): Code[] {
  const P = Math.max(3, Math.floor(R / Math.SQRT2));
  const ph = 3;
  const F = Math.max(10, H - ph);
  const robeH = Math.round(F * 0.45);
  const w0 = Math.max(2, P * 0.48);
  const w1 = Math.max(1.2, P * 0.3);
  const hatH = Math.max(3, F - robeH - 4);
  const s = Math.min(Math.round(w0) + 2, Math.floor(R / Math.SQRT2)); // staff column at (s, -s): screen right
  const staffTop = ph + robeH + 4;
  const fill: Fill = (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (z < ph) return ax <= P && ay <= P ? (z === ph - 1 && (ax === P || ay === P) ? m.c : m.b) : 0;
    const q = z - ph;
    if (x === s && y === -s) return q <= staffTop - ph ? m.c : q === staffTop - ph + 1 ? m.cap : 0;
    if (q < robeH) {
      const w = w0 + ((w1 - w0) * q) / robeH;
      if (ax <= w && ay <= w) return m.a;
      // The arm reaching out to the staff.
      if (q === robeH - 2 && x > 0 && y < 0 && x === -y && x < s) return m.a;
      return 0;
    }
    if (q < robeH + 3) return ax <= 1 && ay <= 1 ? m.b : 0;
    if (q === robeH + 3) return ax <= 2 && ay <= 2 ? m.a : 0;
    const t = (q - robeH - 3) / hatH;
    if (t > 1) return x === -2 && y === 2 && q === robeH + 4 + hatH ? m.cap : 0; // a star on the tip
    const off = Math.round(t * t * 2);
    const r = 1.6 * (1 - t);
    return Math.abs(x + off) <= r && Math.abs(y - off) <= r ? m.a : x === -off && y === off && t <= 1 ? m.a : 0;
  };
  return skin(Math.max(P, s) + 1, ph + robeH + 4 + hatH + 1, fill, (x, y, z, mat) => {
    const q = z - ph;
    if (q === robeH + 1 && ((x === 1 && y === 0) || (x === 0 && y === 1))) return m.cap; // eyes
    return mat;
  });
}

// An engine: a riveted box with lit screens and a row of lamps, a tank on
// top, a pipe to a tall stack, and a beacon on the stack.
function machine(m: Mats, R: number, H: number): Code[] {
  let hx = Math.floor(R * 0.72);
  let hy = Math.floor(R * 0.55);
  while (Math.hypot(hx, hy) > R + 0.3 && hx > 3) {
    hx--;
    if (hy > 3 && Math.hypot(hx, hy) > R + 0.3) hy--;
  }
  const bh = clamp(Math.round(H * 0.4), 5, 10);
  const tx = -Math.round(hx / 2);
  const tr = Math.max(2, Math.min(hy - 1, 3.6));
  const tankTop = bh + Math.max(3, Math.round(H * 0.22));
  const sx = hx - 2;
  const sy = -hy + 1;
  const fill: Fill = (x, y, z) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    if (z < bh) {
      if (ax > hx || ay > hy) return 0;
      const edges = (ax === hx ? 1 : 0) + (ay === hy ? 1 : 0) + (z === 0 || z === bh - 1 ? 1 : 0);
      return edges >= 2 ? m.a : m.b;
    }
    if ((x === sx || x === sx + 1) && (y === sy || y === sy + 1)) return z < H ? ((z - bh) % 3 === 2 ? m.b : m.a) : z === H ? m.cap : 0;
    if (z <= tankTop && Math.hypot(x - tx, y) <= tr + 0.3) return z === tankTop ? m.a : m.c;
    if (z === bh + 2 && y === sy + 1 && x > tx + tr && x < sx) return m.c; // pipe
    return 0;
  };
  return skin(R + 1, H, fill, (x, y, z, mat) => {
    if (z >= 2 && z <= 3 && x === hx && Math.abs(y) <= 1) return m.cap; // screen
    if (z === bh - 2 && y === hy && Math.abs(x) <= hx - 2 && x % 3 === 0) return m.cap; // lamps
    if (z >= 2 && z <= bh - 4 && y === hy && Math.abs(x) <= hx - 2 && x % 2 === 0) return m.a; // vents
    return mat;
  });
}

const MAKERS: Record<Shape, (m: Mats, R: number, H: number) => Code[]> = { tower, house, pyramid, statue, machine };

// The blocks of a build, bottom-up, round the origin (z = 0 on the floor),
// coloured from a palette of `colors` colours: every footprint block within
// `R` of the centre, about `H` tall (a cap may stand a little higher).
// Within a course they run round from the back, so consecutive bricks are
// neighbours.
export function blueprint(shape: Shape, colors: number, R: number, H: number): Block[] {
  const bs = MAKERS[shape](matsOf(colors), R, H);
  const key = (b: Code) => (Math.atan2(b.y, b.x) + (Math.PI * 3) / 4 + 2 * Math.PI) % (2 * Math.PI);
  return bs
    .filter((b) => Math.hypot(b.x, b.y) <= R + 0.5)
    .map((b) => ({ b, k: key(b), r: Math.hypot(b.x, b.y) }))
    .sort((p, q) => p.b.z - q.b.z || p.k - q.k || p.r - q.r)
    .map(({ b }) => ({ x: b.x, y: b.y, z: b.z, c: b.m - 1 }));
}

// ── constructions ────────────────────────────────────────────────────────
// One build under way on a plaza: the blueprint placed on the floor, its
// bricks, and the pile of materials at the plaza's edge (the room's supply
// spot for it) that builders fetch from.
export class Construction {
  readonly plaza: Plaza;
  readonly shape: Shape;
  readonly blocks: Block[];
  readonly bricks: number[]; // brick k is blocks[bricks[k] .. bricks[k + 1])
  readonly reach: number; // furthest footprint block from the centre, edge included
  readonly pile: Rect;
  readonly top: { x: number; y: number; z: number };
  readonly cap: number;
  readonly per: number; // bricks laid per haul
  placed = 0; // bricks placed
  carriers = 0; // blocks on their way here

  // `pile`: where the materials lie (default: beside the plaza toward the hub).
  constructor(L: Layout, plaza: Plaza, shape: Shape, colors: readonly RGB[], H: number, pile?: Rect) {
    this.plaza = plaza;
    this.shape = shape;
    this.cap = capOf(colors);
    const cx = Math.round(plaza.x);
    const cy = Math.round(plaza.y);
    const R = buildReach(plaza);
    this.blocks = blueprint(shape, colors.length, R, H)
      .map((b) => ({ x: cx + b.x, y: cy + b.y, z: b.z, c: b.c }))
      .filter((b) => b.x >= L.T && b.y >= L.T && b.x < L.W && b.y < L.D && b.z < L.H);
    const n = clamp(Math.round(this.blocks.length / 22), 12, 40);
    const size = Math.ceil(this.blocks.length / n);
    this.bricks = [];
    for (let s = 0; s < this.blocks.length; s += size) this.bricks.push(s);
    this.bricks.push(this.blocks.length);
    // A small build would be done in a few trips anyway: twice the bricks a
    // trip finishes it while the crew is still around to see it.
    this.per = this.count < SMALL ? 2 : 1;
    this.reach = Math.max(1, ...this.blocks.map((b) => Math.hypot(b.x + 0.5 - plaza.x, b.y + 0.5 - plaza.y))) + 0.75;
    const hi = this.blocks.reduce((t, b) => (b.z > t.z || (b.z === t.z && b.c === this.cap) ? b : t), this.blocks[0] ?? { x: cx, y: cy, z: 0, c: 0 });
    this.top = { x: hi.x + 0.5, y: hi.y + 0.5, z: hi.z + 1 };
    this.pile = pile ?? supplyFor(L, plaza);
  }

  get count(): number {
    return this.bricks.length - 1;
  }

  get complete(): boolean {
    return this.placed >= this.count;
  }

  // Blocks in place so far.
  get laid(): number {
    return this.bricks[Math.min(this.placed, this.count)];
  }

  // The colour of the next block to fetch.
  nextColor(): number {
    const k = Math.min(this.count - 1, this.placed + this.carriers * this.per);
    return this.blocks[this.bricks[Math.max(0, k)]]?.c ?? this.cap;
  }

  // The middle of brick k (floor coordinates and height).
  centroid(k: number): { x: number; y: number; z: number } {
    const k0 = this.bricks[clamp(k, 0, this.count - 1)];
    const k1 = this.bricks[clamp(k, 0, this.count - 1) + 1];
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = k0; i < k1; i++) {
      x += this.blocks[i].x + 0.5;
      y += this.blocks[i].y + 0.5;
      z += this.blocks[i].z + 0.5;
    }
    const n = Math.max(1, k1 - k0);
    return { x: x / n, y: y / n, z: z / n };
  }

  // Lays the next haul's bricks (`per`), unless one of their blocks is
  // `occupied` (someone stands there): returns what was placed, or null.
  place(occupied?: (x: number, y: number, z: number) => boolean): Block[] | null {
    if (this.complete) return null;
    const n = Math.min(this.per, this.count - this.placed);
    const bs = this.blocks.slice(this.bricks[this.placed], this.bricks[this.placed + n]);
    if (occupied && bs.some((b) => occupied(b.x, b.y, b.z))) return null;
    this.placed += n;
    return bs;
  }

  // The blocks standing so far.
  built(): Block[] {
    return this.blocks.slice(0, this.laid);
  }

  // The blueprint still to come, for the scene to draw as a ghost.
  ghost(): Block[] {
    return this.blocks.slice(this.laid);
  }

  // Takes the whole build down, back to the bare plaza.
  raze(): void {
    this.placed = 0;
    this.carriers = 0;
  }
}

// A 3x3 patch at the plaza's edge on the side toward the hub (or the
// nearest spot round it that is on the floor).
export function supplyFor(L: Layout, plaza: Plaza, clear: (r: Rect) => boolean = () => true): Rect {
  const h = hub(L);
  const a0 = Math.atan2(h.y - plaza.y, h.x - plaza.x);
  const d = plaza.r + 3;
  let first: Rect | null = null;
  for (const turn of [0, 0.5, -0.5, 1, -1, 1.6, -1.6, 2.2, -2.2, Math.PI]) {
    const x = Math.round(plaza.x + Math.cos(a0 + turn) * d) - 1;
    const y = Math.round(plaza.y + Math.sin(a0 + turn) * d) - 1;
    const r = { x0: x, y0: y, x1: x + 3, y1: y + 3 };
    first ??= r;
    if (x > L.T + 1 && y > L.T + 1 && x + 3 < L.W - 2 && y + 3 < L.D - 2 && clear(r)) return r;
  }
  return first!;
}

// Every build in a room: one per plaza at most, started one at a time when
// someone wants to build, rebuilt oldest-first once all stand for a while,
// so a long session keeps building without the room filling up.
// About how tall a build stands in room L (taller in a bigger room; a cap
// may stand a little higher), and how far round its plaza's centre it
// reaches.
export function buildHeight(L: Layout): number {
  return Math.min(L.H - 6, 12 + Math.round(12 * clamp((L.W - 72) / 98, 0, 1)));
}
const buildReach = (plaza: Plaza): number => Math.max(3, plaza.r - 1.5);

// How tall the tallest build of any shape would stand over each floor cell
// (x + W * y) of room L, on every plaza (where a build goes up, what it may
// hide; the colours change none of it).
export function buildsOver(L: Layout): Float32Array {
  const out = new Float32Array(L.W * L.D);
  const H = buildHeight(L);
  for (const plaza of buildSites(L)) {
    const cx = Math.round(plaza.x);
    const cy = Math.round(plaza.y);
    for (const shape of SHAPES) {
      for (const b of blueprint(shape, 1, buildReach(plaza), H)) {
        const [x, y] = [cx + b.x, cy + b.y];
        if (x >= L.T && y >= L.T && x < L.W && y < L.D && b.z < L.H) out[x + L.W * y] = Math.max(out[x + L.W * y], b.z + 1);
      }
    }
  }
  return out;
}

export class Works {
  readonly plazas: Plaza[];
  readonly sites: Array<Construction | null>;
  readonly style: BuildStyle;
  version = 0; // bumped whenever a footprint or pile appears or goes
  onRaze: ((c: Construction) => void) | null = null;
  private L: Layout;
  private rng: Rng;
  private supply: readonly Rect[];
  private started = 0;
  private cool = 0;
  private finished: number[]; // clock time each plaza's build was completed
  private H: number;

  // `supply`: each plaza's pile (default: beside it toward the hub).
  constructor(L: Layout, style: BuildStyle, rng: Rng, supply?: readonly Rect[]) {
    this.L = L;
    this.style = style;
    this.rng = rng;
    this.plazas = buildSites(L);
    this.supply = supply ?? this.plazas.map((p) => supplyFor(L, p));
    this.sites = this.plazas.map(() => null);
    this.finished = this.plazas.map(() => -Infinity);
    this.H = buildHeight(L);
  }

  get builds(): Construction[] {
    return this.sites.filter((c): c is Construction => c !== null);
  }

  // The build under way, starting one on a free plaza if there is none
  // (and the last finished a little while ago, and nobody stands on the
  // plaza: `vacant`). With every plaza built, the oldest comes down for
  // something new once all have stood a while; until then, null.
  current(clock: number, vacant: (p: Plaza) => boolean = () => true): Construction | null {
    const going = this.builds.find((c) => !c.complete);
    if (going) return going;
    if (clock < this.cool) return null;
    if (this.sites.every((c) => c !== null)) this.renew(clock);
    const free = this.sites.findIndex((c, k) => c === null && vacant(this.plazas[k]));
    if (free < 0) return null;
    const shape = this.started === 0 ? this.style.shape : this.started === 1 ? COMPANION[this.style.shape] : this.rng.pick(SHAPES.filter((s) => s !== this.sites.find((c) => c)?.shape));
    this.started++;
    const c = new Construction(this.L, this.plazas[free], shape, this.style.colors, this.H, this.supply[free]);
    this.sites[free] = c;
    this.version++;
    return c;
  }

  // Marks a build finished: its pile goes, and the next may start soon.
  finish(c: Construction, clock: number): void {
    this.cool = clock + COOLDOWN;
    const k = this.sites.indexOf(c);
    if (k >= 0) this.finished[k] = clock;
    this.version++;
  }

  // Takes the oldest build down once every one has stood finished for a
  // while, freeing its plaza.
  private renew(clock: number): void {
    if (this.sites.some((c) => c === null || !c.complete)) return;
    let k = 0;
    for (let i = 1; i < this.finished.length; i++) if (this.finished[i] < this.finished[k]) k = i;
    if (clock - Math.max(...this.finished) < RENEW_AFTER) return;
    const c = this.sites[k]!;
    c.raze();
    this.sites[k] = null;
    this.finished[k] = -Infinity;
    this.version++;
    this.onRaze?.(c);
  }

  // Footprints (discs) characters walk round, and the piles of builds under
  // way.
  obstacles(): { discs: Disc[]; rects: Rect[] } {
    const discs: Disc[] = [];
    const rects: Rect[] = [];
    for (const c of this.builds) {
      discs.push({ x: c.plaza.x, y: c.plaza.y, r: c.reach });
      if (!c.complete) rects.push(c.pile);
    }
    return { discs, rects };
  }
}
