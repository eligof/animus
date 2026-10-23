import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { slotRect, slotsOn, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { altar, entrance, fillStrata, hash3, isSolid, makeProps, noise2, onWall, pit, puff, tone, veins, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';
import type { Disc, Pt } from './floor.ts';
import { aside, by, calm, campfirePoi, disc, Floor, growth } from './floor.ts';

// The Vault: an old high-tech facility sunk into the rock, after Noita's
// Holvi and the Hiisi base. Riveted steel plate and patched brickwork over
// grey stone, pipes along the walls and across the floor, machinery humming
// on the deck, sodium-amber status lights, cold white lamps and hazard
// paint. And what it keeps: rows of deposit boxes behind small brass doors
// at the back, gold in a lit cage by the hub, counting tables out front,
// gold behind glass in the walls, a crucible of it molten. The acid pit is
// the only green.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#08090a'),
  wall: hex('#16181b'),
  wall2: hex('#1b1d21'),
  floor: hex('#222529'),
  floor2: hex('#1c1f22'),
  text: hex('#e8eaec'),
  dim: hex('#868c92'),
  accent: hex('#ffb347'),
  accent2: hex('#e8c547'),
  panel: hex('#0c0d0f'),
  panelText: hex('#e8eaec'),
  border: hex('#4c5258'),
  bubble: hex('#eef0f2'),
  bubbleText: hex('#121315'),
  good: hex('#9ad46a'),
  warn: hex('#e8c547'),
  bad: hex('#ff5a4a'),
};

const GRADE: Grade = { ambient: hex('#464e56'), illum: 1, bloom: 0.7, vignette: 0.2 };

// Cool stone and steel. LAMP is the cold white of lamp tubes, LED_AMBER
// the sodium glow of status lights and screens, GOLD_ORE gold (and hazard
// paint), CANDLE brass, CARPET the oxblood leather of the counting mats,
// LAVA gold run molten, OBSIDIAN gunmetal, PLASTIC the water cooler's body.
const COLORS: Partial<Record<number, string>> = {
  [M.ROCK]: '#52555a',
  [M.ROCK_DARK]: '#303236',
  [M.BRICK]: '#5f5a55',
  [M.OBSIDIAN]: '#1e2023',
  [M.CLOTH]: '#6b6048',
  [M.LAMP]: '#eef3f6',
  [M.GOLD_ORE]: '#e8c547',
  [M.PLASTIC]: '#d8dde2',
  [M.CANDLE]: '#b08a45',
  [M.CARPET]: '#5c2a26',
  [M.LAVA]: '#ffb43c',
};

const TUBE = M.LAMP; // a lit lamp tube
const AMBER = M.LED_AMBER; // a lit status light or screen pixel
const RED = M.LED_RED; // a laser emitter
const GOLD = M.GOLD_ORE;
const BRASS = M.CANDLE;
const LAMP: RGB = hex('#dfe8ee');
const WARM: RGB = hex('#ffb347');
const ACID_GLOW: RGB = hex('#72ff4c');
const GLINT: RGB = hex('#fff0a0');
const STATUS: Partial<Record<number, RGB>> = { [AMBER]: WARM, [TUBE]: LAMP };
const DARK = M.OBSIDIAN; // an unlit lamp or screen pixel, seams, shadow

// What the props are made of here: steel frames and fittings, brick
// plinths, a lamp in the orb, and gold molten in the crucible (the pot is
// all steel).
export const VAULT_MATS: PropMats = {
  frame: M.METAL,
  metal: M.METAL,
  cloth: M.CLOTH,
  stone: M.BRICK,
  stone2: M.OBSIDIAN,
  glow: M.LAMP,
  liquid: M.LAVA,
  quench: M.WATER,
  candle: M.METAL, // the console's lamp stalks
  ore: M.GOLD_ORE,
  seam: M.OBSIDIAN,
  rubble: M.GRAVEL,
  fuel: M.COAL,
  trim: M.GOLD_ORE,
  bone: M.BONE,
  books: [M.CLOTH, M.CLOTH, M.METAL, M.OBSIDIAN, M.BONE, M.BRICK, M.CANDLE],
  rune: hex('#ffd08a'),
};

// Rock layers bottom to top: [material, weight, min, max thickness].
const STRATA: Strata = {
  bands: [
    [M.ROCK, 5, 3, 7],
    [M.ROCK_DARK, 3, 2, 4],
  ],
  seam: M.OBSIDIAN,
  seams: 2,
  warp: 2,
};

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

const SKIRT = 2; // kick plate at the foot of the walls
const PW = 9; // wall panel pitch along the wall, seam included
const PH = 7; // ...and up it, give or take
const LOW = 22; // the steel pipe run: clear of the tallest props (19)
const TILE = 8; // floor plate pitch
const FLANGE = 11; // pipe collars this far apart
const LAMP_GAP = 14; // lamps at least this far apart
const CRATES = 9; // the back corner the crates keep (see crates())
const AISLE = 4; // floor between rows of deposit boxes
const CAGE_H = 10; // the gold cage's bars

const N6: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── fixtures ─────────────────────────────────────────────────────────────
// What weather() animates, recorded by generate() per world.
type Lamp = { x: number; y: number; z: number; cells: number[]; broken: boolean };
type Blinker = { x: number; y: number; z: number; on: number; period: number; phase: number; duty: number; lx: number; ly: number; glow: boolean };
type Vent = { x: number; y: number; z: number; period: number; phase: number; burst: number };
// A lamp that just shines: its lit voxel, and the light it throws.
type Glow = { i: number; m: number; x: number; y: number; z: number; color: RGB; radius: number; intensity: number };
type Fixtures = {
  lamps: Lamp[];
  blinkers: Blinker[];
  vents: Vent[];
  glows: Glow[];
  gold: number[]; // gold voxels on show, that now and then catch the light
  pool: Site | null;
  grates: Array<[number, number, number]>; // open cells between channel bars
  leak: [number, number, number] | null;
  posts: Array<[number, number, number]>; // lamp post heads
};

const FIXTURES = new WeakMap<Voxels, Fixtures>();

// ── props ────────────────────────────────────────────────────────────────
// In the slot's frame (see props.ts): a along the wall, b out, h up.
function sput(v: Voxels, s: Slot, a: number, b: number, h: number, m: number, shade?: number): void {
  v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, m, shade);
}

function sget(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.get(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

// Turns a lamp voxel on or off, unless it has been knocked out.
function lamp(v: Voxels, x: number, y: number, z: number, on: boolean, lit: number): void {
  const m = v.get(x, y, z);
  if (m !== lit && m !== DARK) return;
  const want = on ? lit : DARK;
  if (m !== want) v.put(x, y, z, want, on ? 7 : 2);
}

// think: the altar refitted as a control desk. Steel instead of stone, a
// monitor where the skull sat, status lamps on the candle stalks. Thinking
// scrolls the screen and sets the lamps blinking.
function controlDesk(m: PropMats): Prop {
  const base = altar(m);
  const SLAB = 4; // the desk top, as in altar()
  const screen = (s: Slot): Array<[number, number]> => {
    const mid = s.len >> 1;
    const out: Array<[number, number]> = [];
    for (let h = SLAB + 2; h < SLAB + 5; h++) for (let a = mid - 2; a < mid + 2; a++) out.push([a, h]);
    return out;
  };
  const stalks = (s: Slot): ReadonlyArray<readonly [number, number]> => [[1, 1], [s.len - 2, 1]];
  return {
    name: 'console',
    build(v, s, rng) {
      base.build(v, s, rng);
      const L = s.len;
      const mid = L >> 1;
      for (let h = 0; h <= SLAB; h++) {
        for (let b = 0; b < 6; b++) {
          for (let a = 0; a < L; a++) if (sget(v, s, a, b, h) === m.stone) sput(v, s, a, b, h, M.METAL, h === SLAB ? 6 : 3);
        }
      }
      // off with the runner, skull, candles and flames
      for (let h = 1; h < SLAB; h++) for (let a = mid - 1; a <= mid; a++) if (sget(v, s, a, 5, h) === m.cloth) sput(v, s, a, 5, h, M.AIR);
      for (let h = SLAB + 1; h < SLAB + 6; h++) {
        for (let b = 0; b < 6; b++) for (let a = 0; a < L; a++) sput(v, s, a, b, h, M.AIR);
      }
      for (let h = SLAB + 1; h < SLAB + 6; h++) {
        for (let b = 0; b < 2; b++) for (let a = mid - 3; a < mid + 3; a++) sput(v, s, a, b, h, DARK, 3);
      }
      for (const [a, h] of screen(s)) sput(v, s, a, 1, h, rng.chance(0.4) ? AMBER : DARK, 6);
      for (let a = mid - 2; a < mid + 2; a++) sput(v, s, a, 3, SLAB + 1, M.METAL, a & 1 ? 6 : 4); // keyboard
      for (const [a, b] of stalks(s)) {
        for (let h = SLAB + 1; h < SLAB + 4; h++) sput(v, s, a, b, h, M.METAL, 4);
        sput(v, s, a, b, SLAB + 4, TUBE, 7);
      }
    },
    tick(c, s, active) {
      const v = c.v;
      if (c.rng.chance(c.dt * (active ? 30 : 3))) {
        const [a, h] = c.rng.pick(screen(s));
        const was = sget(v, s, a, 1, h);
        if (was === AMBER || was === DARK) sput(v, s, a, 1, h, c.rng.chance(active ? 0.55 : 0.3) ? AMBER : DARK, 6);
      }
      const mid = s.len / 2;
      c.light({ x: wx(s, mid, 2), y: wy(s, mid, 2), z: s.z0 + SLAB + 3.5, color: WARM, radius: active ? 18 : 12, intensity: active ? 0.5 + 0.1 * Math.sin(c.t * 9) : 0.28 });
      stalks(s).forEach(([a, b], k) => {
        const on = active ? (Math.floor(c.t * 3) + k) % 2 === 0 : (c.t * 0.5 + k * 0.7) % 2 < 1.6;
        lamp(v, wx(s, a, b), wy(s, a, b), s.z0 + SLAB + 4, on, TUBE);
      });
    },
  };
}

// entrance: the tunnel as a blast door. Hazard paint up the posts, the
// door wound most of the way up, and a beacon on the torch bracket that
// flashes amber while someone comes or goes.
function blastDoor(m: PropMats): Prop {
  const base = entrance(m);
  const OPEN = 10; // as in entrance()
  const TALL = 18;
  const BRACKET = 12;
  const beaconAt = (s: Slot) => [wx(s, s.len - 1, 0), wy(s, s.len - 1, 0), s.z0 + BRACKET + 1] as const;
  return {
    name: 'blast door',
    build(v, s, rng) {
      base.build(v, s, rng);
      const [x, y, z] = beaconAt(s);
      v.put(x, y, z, AMBER, 7);
      v.put(x, y, z + 1, m.metal, 6);
      for (const a of [0, OPEN + 1]) {
        for (let h = 0; h < TALL; h++) if (sget(v, s, a, 0, h) === m.frame) sput(v, s, a, 0, h, (h >> 1) & 1 ? GOLD : DARK, 4);
      }
      for (let h = TALL - 5; h < TALL; h++) {
        for (let a = 1; a <= OPEN; a++) {
          if (sget(v, s, a, -2, h) !== M.AIR) continue;
          const edge = h === TALL - 5;
          sput(v, s, a, -2, h, edge ? ((a >> 1) & 1 ? GOLD : DARK) : M.METAL, edge ? 4 : 2 + (h & 1));
        }
      }
    },
    tick(c, s, active) {
      const [x, y, z] = beaconAt(s);
      const on = !active || Math.floor(c.t * 4) % 2 === 0;
      lamp(c.v, x, y, z, on, AMBER);
      if (on && c.v.get(x, y, z) === AMBER) {
        c.light({ x: x + 0.5, y: y + 0.5, z: z + 0.5, color: WARM, radius: active ? 20 : 12, intensity: active ? 0.8 : 0.35 });
      }
    },
  };
}

const PROPS: Record<SlotKind, Prop> = { ...makeProps(VAULT_MATS), think: controlDesk(VAULT_MATS), entrance: blastDoor(VAULT_MATS) };

// A machine: a steel frame, gunmetal panels, amber lights, hazard stripes.
const BUILD: BuildStyle = { mats: [M.METAL, M.OBSIDIAN, M.LED_AMBER, M.GOLD_ORE], shape: 'machine' };

// ── generate ─────────────────────────────────────────────────────────────
// Heights above the floor: the room's, the steel pipe run's (2 tall) and
// the cable duct's near the top (3 tall).
type Plan = { top: number; low: number; hi: number };

function plan(L: Layout): Plan {
  const top = L.H - L.floor;
  return { top, low: LOW, hi: top - 4 };
}

const alongEnd = (L: Layout, wall: Side) => (wall === 'left' ? L.D : L.W);
const along = (s: Slot) => (s.wall === 'left' ? s.y0 : s.x0);

function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, H, T, floor } = L;
  clear(v);
  const P = plan(L);
  const F = floorPlan(L);
  const keep = F.floor.keep;
  const fx: Fixtures = { lamps: [], blinkers: [], vents: [], glows: [], gold: [], pool: null, grates: [], leak: null, posts: [] };
  fx.pool = F.pit ? { x: Math.round(F.pit.x), y: Math.round(F.pit.y), rx: F.pit.r / 1.6, ry: (F.pit.r / 1.6) * 0.7 } : null;

  // Stone: the wall slabs to H (a voxel off the top here and there), the
  // floor slab flat, dark seams in the cut faces. Under the deck, where
  // nothing shows but the front cuts, the slab is plain rock, written
  // straight into the grid (the world is committed after generate(), which
  // drops the change log).
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) top[x + W * y] = x < T || y < T ? H - (noise2(seed, x * 0.3, y * 0.3) > 0.8 ? 1 : 0) : x >= W - 2 || y >= D - 2 ? floor : 0;
  }
  fillStrata(v, L, rng, STRATA, top);
  for (let z = 0; z < floor - 2; z++) {
    for (let y = T; y < D - 2; y++) {
      const i = v.idx(T, y, z);
      v.mat.fill(M.ROCK, i, i + W - 2 - T);
      v.shade.fill(2, i, i + W - 2 - T);
    }
  }
  veins(v, L, rng, M.OBSIDIAN, Math.round((W * D) / 2400), (m) => m === M.ROCK || m === M.ROCK_DARK, [3, 7]);

  deck(v, L, seed, F.floor.trails);
  strips(v, L, F.floor);
  const breach = breachOf(L, seed);
  for (const wall of SIDES) clad(v, L, P, wall, seed, breach, fx);
  if (fx.pool) {
    const p = fx.pool;
    acidPit(v, L, p, keep);
    channels(v, L, p, F, fx);
    line(v, Math.floor(p.x - p.rx) - 4, Math.floor(p.y - p.ry) - 4, 0, W - 1, D - 1, floor);
  }

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  for (const wall of SIDES) {
    steelRun(v, L, P, wall, seed, fx);
    gapFixtures(v, L, P, wall, rng, fx);
    lamps(v, L, P, wall, F.zones, fx);
  }
  duct(v, L, P, seed);
  if (fx.lamps.length) fx.lamps[rng.int(0, fx.lamps.length - 1)].broken = true;
  fx.leak = leak(v, L, P, rng);

  // Out on the deck.
  for (const d of F.grates) grate(v, L, rng, d, fx);
  for (const d of F.machines) machine(v, L, rng, d, F, fx);
  if (F.cooler) cooler(v, L, F.cooler);
  if (F.showcase) showcase(v, L, F.showcase, fx);
  if (F.lounge) lounge(v, L, rng, F.lounge, F.floor);
  for (const p of F.posts) lampPost(v, L, p, fx);
  for (const z of F.zones) {
    if (z.kind === 'machine') continue;
    paint(v, L, z);
    ZONES[z.kind](v, L, z, rng, fx);
  }
  crates(v, L, keep);
  const free = F.floor.free(1);
  for (let i = 0; i < W * D; i++) if (F.taken[i]) free[i] = 0;
  litter(v, L, rng, free, fx.pool);
  FIXTURES.set(v, fx);
}

// ── the deck plan ────────────────────────────────────────────────────────
// Where everything out on the floor goes, from the layout alone (so pois()
// agrees with generate()). First the features with their walkways: the
// acid pit, the water cooler (and in small rooms a case of gold and a
// guard's corner). Then, on the deck that leaves, machinery out toward the
// edges (a drone tends the first) and the zones: deposit boxes in rows in
// the back corner, counting tables out front, the gold cage by the hub.
// Then lamp posts along the walkways, floor grates, and groups of gear in
// the bare stretches between, each with open deck round it. Nothing goes
// on a cell keepClear() reserves.
type Axis = 'x' | 'y';
type ZoneKind = 'machine' | 'boxes' | 'cage' | 'counter' | 'loading' | 'pallets' | 'cash' | 'safes' | 'trolley' | 'sacks';
// A zone in its own frame: u along it, w across it toward the camera (+y
// for one along x, +x for one along y), from its corner (x0, y0); `len`
// along u, `dep` along w, `tall` how high it rises. `face` is the side its
// door or its seats are on (+1 the camera's, -1 the far one), `n` how many
// rows or tables it has.
type Zone = { kind: ZoneKind; x0: number; y0: number; axis: Axis; len: number; dep: number; tall: number; face: 1 | -1; n: number };
type Box = { x0: number; y0: number; x1: number; y1: number }; // [x0, x1) x [y0, y1)

const zx = (z: Zone, u: number, w: number) => (z.axis === 'x' ? z.x0 + u : z.x0 + w);
const zy = (z: Zone, u: number, w: number) => (z.axis === 'x' ? z.y0 + w : z.y0 + u);
const boxOf = (z: Zone): Box => (z.axis === 'x' ? { x0: z.x0, y0: z.y0, x1: z.x0 + z.len, y1: z.y0 + z.dep } : { x0: z.x0, y0: z.y0, x1: z.x0 + z.dep, y1: z.y0 + z.len });
const inBox = (b: Box, x: number, y: number) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1;

// How high a zone stands solid enough to hide someone behind it: the cage
// is bars, a counting table its top and what is stacked on it.
const screen = (z: Zone) => (z.kind === 'cage' ? 6 : z.kind === 'counter' ? 5 : z.tall);

function zput(v: Voxels, L: Layout, z: Zone, u: number, w: number, h: number, m: number, shade?: number): void {
  v.put(zx(z, u, w), zy(z, u, w), L.floor + h, m, shade);
}

type FloorPlan = {
  floor: Floor;
  pit: Disc | null;
  cooler: Disc | null;
  showcase: Disc | null;
  lounge: Disc | null;
  machines: Disc[];
  zones: Zone[];
  taken: Uint8Array; // the zones' footprints
  grates: Disc[];
  posts: Pt[];
};

const FLOORS = new WeakMap<Layout, FloorPlan>();

// The deck left for the zones once the features are down, and a placer for
// rectangles on it: off every walkway, feature and held stretch, and not
// standing where it would hide what must stay in view (see Floor.hides).
class Deck {
  readonly L: Layout;
  readonly f: Floor;
  readonly zones: Zone[] = [];
  readonly taken: Uint8Array; // zone footprints
  readonly high: Uint8Array; // ...and how high they rise
  readonly held: Uint8Array; // floor kept for something else: channels, pipes, the yard, the crates, wall fixtures
  private readonly sat: Int32Array;
  private readonly back: Uint8Array; // voxels back along the camera's line to the nearest cell in view
  private readonly shades = new Map<number, Int32Array>();
  private readonly fresh: Box[] = []; // zones claimed since the table was built
  private version = 0;
  private satAt = -1;
  private seenAt = -1;

  constructor(L: Layout, f: Floor) {
    this.L = L;
    this.f = f;
    const n = L.W * L.D;
    this.taken = new Uint8Array(n);
    this.high = new Uint8Array(n);
    this.held = new Uint8Array(n);
    this.back = new Uint8Array(n);
    this.sat = new Int32Array((L.W + 1) * (L.D + 1));
    for (const s of f.sites) disc(this.held, L, s.x, s.y, s.r + 2);
  }

  // Something changed what blocks the deck (a walkway, say).
  touch(): void {
    this.version++;
  }

  // True if a zone or held floor lies within r of (x, y).
  near(x: number, y: number, r: number): boolean {
    const { W, D } = this.L;
    for (let yy = Math.max(0, y - r); yy <= Math.min(D - 1, y + r); yy++) {
      for (let xx = Math.max(0, x - r); xx <= Math.min(W - 1, x + r); xx++) if (this.taken[xx + W * yy] || this.held[xx + W * yy]) return true;
    }
    return false;
  }

  hold(x0: number, y0: number, x1: number, y1: number): void {
    const { W, D } = this.L;
    for (let y = Math.max(0, y0); y < Math.min(D, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) this.held[x + W * y] = 1;
    this.version++;
  }

  // Cells counted by a summed-area table in [x0, x1) x [y0, y1), clipped.
  private count(s: Int32Array, x0: number, y0: number, x1: number, y1: number): number {
    const { W, D } = this.L;
    const W1 = W + 1;
    x0 = clamp(x0, 0, W);
    x1 = clamp(x1, 0, W);
    y0 = clamp(y0, 0, D);
    y1 = clamp(y1, 0, D);
    return s[x1 + W1 * y1] - s[x0 + W1 * y1] - s[x1 + W1 * y0] + s[x0 + W1 * y0];
  }

  private table(): Int32Array {
    if (this.satAt === this.version && this.fresh.length < 32) return this.sat;
    this.fresh.length = 0;
    const { W, D } = this.L;
    const W1 = W + 1;
    const p = this.f.paths;
    for (let y = 0; y < D; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        const i = x + W * y;
        row += p[i] | this.taken[i] | this.held[i];
        this.sat[x + 1 + W1 * (y + 1)] = this.sat[x + 1 + W1 * y] + row;
      }
    }
    this.satAt = this.version;
    return this.sat;
  }

  // True if [x0, x1) x [y0, y1) is open deck, `edge` voxels off the walls
  // and clear of the front cuts.
  open(x0: number, y0: number, x1: number, y1: number, edge = 2): boolean {
    const { W, D, T } = this.L;
    if (x0 < T + edge || y0 < T + edge || x1 > W - 3 || y1 > D - 3) return false;
    if (this.count(this.table(), x0, y0, x1, y1) !== 0) return false;
    return !this.fresh.some((b) => b.x0 < x1 && x0 < b.x1 && b.y0 < y1 && y0 < b.y1);
  }

  // True if something `t` tall on [x0, x1) x [y0, y1) would hide nothing
  // that must stay in view: no such cell lies up to `t` back along the
  // camera's line from it.
  unseen(x0: number, y0: number, x1: number, y1: number, t: number): boolean {
    return this.count(this.shadow(t), x0 - 1, y0 - 1, x1 + 1, y1 + 1) === 0;
  }

  private shadow(t: number): Int32Array {
    const { W, D } = this.L;
    if (this.seenAt !== this.f.pois.length) {
      this.seenAt = this.f.pois.length;
      this.shades.clear();
      const seen = this.f.seen;
      for (let y = 0; y < D; y++) {
        for (let x = 0; x < W; x++) {
          const i = x + W * y;
          this.back[i] = x === 0 || y === 0 ? 255 : seen[i - W - 1] ? 1 : Math.min(255, this.back[i - W - 1] + 1);
        }
      }
    }
    let s = this.shades.get(t);
    if (s) return s;
    s = new Int32Array((W + 1) * (D + 1));
    const W1 = W + 1;
    for (let y = 0; y < D; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += this.back[x + W * y] <= t ? 1 : 0;
        s[x + 1 + W1 * (y + 1)] = s[x + 1 + W1 * y] + row;
      }
    }
    this.shades.set(t, s);
    return s;
  }

  claim(z: Zone): void {
    const b = boxOf(z);
    const { W } = this.L;
    const h = screen(z);
    for (let y = b.y0; y < b.y1; y++) {
      for (let x = b.x0; x < b.x1; x++) {
        this.taken[x + W * y] = 1;
        this.high[x + W * y] = Math.max(this.high[x + W * y], h);
      }
    }
    this.zones.push(z);
    this.fresh.push(b);
  }

  // The best place by `score` for a zone `make` builds with its corner at
  // (x0, y0) along `axis`, every `step` voxels (x0 or y0 held to `at` when
  // given), where it fits with its points of interest (`pois`) all
  // standing clear; claims it, and adds them.
  place(make: (x0: number, y0: number, axis: Axis) => Zone, axes: readonly Axis[], gap: number, score: (z: Zone) => number, pois: (z: Zone) => Poi[] = () => [], at: { x0?: number; y0?: number } = {}, step = 2): Zone | null {
    const { W, D, T } = this.L;
    const wall = at.x0 !== undefined || at.y0 !== undefined;
    const cand: Array<[number, Zone]> = [];
    for (const axis of axes) {
      const size = make(0, 0, axis);
      const sx = axis === 'x' ? size.len : size.dep;
      const sy = axis === 'x' ? size.dep : size.len;
      for (let y0 = at.y0 ?? T + 2; y0 < D - 3; y0 += at.y0 === undefined ? step : D) {
        for (let x0 = at.x0 ?? T + 2; x0 < W - 3; x0 += at.x0 === undefined ? step : W) {
          const gx = wall && x0 === T ? T : x0 - gap;
          const gy = wall && y0 === T ? T : y0 - gap;
          if (!this.open(gx, gy, x0 + sx + gap, y0 + sy + gap, wall ? 0 : 2) || !this.unseen(x0, y0, x0 + sx, y0 + sy, screen(size))) continue;
          const z = make(x0, y0, axis);
          cand.push([score(z), z]);
        }
      }
    }
    // The best, and only if its points of interest do not stand clear the
    // rest in turn.
    let best = -1;
    for (let k = 0; k < cand.length; k++) if (best < 0 || cand[k][0] > cand[best][0]) best = k;
    if (best < 0) return null;
    if (this.take(cand[best][1], pois)) return cand[best][1];
    cand.splice(best, 1);
    cand.sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < Math.min(cand.length, 200); k++) if (this.take(cand[k][1], pois)) return cand[k][1];
    return null;
  }

  private take(z: Zone, pois: (z: Zone) => Poi[]): boolean {
    const ps = pois(z);
    if (!ps.every((p) => this.stand(p, z))) return false;
    this.claim(z);
    for (const p of ps) this.f.addPoi(p);
    this.version++;
    return true;
  }

  // True if a point of interest by zone `own` stands clear: off keepClear,
  // on open deck, reachable (see Floor.reachable), not hidden past a seated
  // figure's knees by anything tall in front, and its walkway from the hub
  // crosses no zone (its own only at the very end).
  private stand(p: Poi, own: Zone): boolean {
    const { W, D } = this.L;
    const f = this.f;
    const b = boxOf(own);
    const i = p.x + W * p.y;
    if (f.keep[i] || this.taken[i] || this.held[i]) return false;
    if (!f.reachable(p, null)) return false;
    for (let k = 1; k <= 20; k++) {
      for (let o = -1; o <= 1; o++) {
        const x = p.x + k + o;
        const y = p.y + k - o;
        if (x >= W || y >= D) continue;
        const h = inBox(b, x, y) ? screen(own) : this.high[x + W * y];
        if (h > k + 4) return false;
      }
    }
    const h = f.hub;
    const n = Math.ceil(Math.hypot(p.x - h.x, p.y - h.y));
    for (let k = 0; k <= n; k++) {
      const x = Math.round(h.x + ((p.x - h.x) * k) / n);
      const y = Math.round(h.y + ((p.y - h.y) * k) / n);
      for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
        if (this.taken[x + dx + W * (y + dy)]) return false;
        if (n - k > 2 && inBox(b, x + dx, y + dy)) return false;
      }
    }
    return true;
  }
}

function floorPlan(L: Layout): FloorPlan {
  const hit = FLOORS.get(L);
  if (hit) return hit;
  const { W, D, T } = L;
  const f = new Floor(L, 'vault');
  const g = growth(L);
  const hub = f.hub;
  const pr = clamp(Math.round(W * 0.07), 4, 9);
  const pit = f.place(Math.round(pr * 1.6), f.at(0.72, 0.76), { min: 6, pois: (s) => [by(s, 'view', 1, hub)] });
  const cooler = f.place(3, f.at(0.56, 0.94), { min: 3, pois: (s) => [by(s, 'drink', 1, hub)] });
  // Small rooms have no floor for the cage or the counting tables: a case
  // of gold to look at and a guard's corner of crates to sit in instead.
  let showcase: Disc | null = null;
  let lounge: Disc | null = null;
  if (g < 0.45) {
    const tall = 10 + Math.round(6 * g);
    showcase = f.place(Math.round(4 + 2 * g), f.at(0.93, 0.62), { min: 3, tall, ok: (s) => !f.hides(s.x, s.y, s.r, tall), pois: (s) => [aside(s, 'view', 4, hub)] });
    lounge = f.place(Math.round(4 + g), f.at(0.36, 0.95), { min: 4, inside: true, pois: (s) => [{ x: Math.round(s.x), y: Math.round(s.y), kind: 'seat', face: { x: Math.round(hub.x), y: Math.round(hub.y) } }] });
  }

  // Held for what generate() runs across the deck: the pit's channels to
  // the front cuts, the crates in the back corner, the wall fixtures in
  // every gap but the back ones (and each machine's pipe to its wall, as
  // it goes down). And the yard, the floor in front of the hub that belongs
  // to life.
  const deck = new Deck(L, f);
  if (pit) {
    const px = Math.round(pit.x);
    const py = Math.round(pit.y);
    deck.hold(px, py - 5, W, py + 6);
    deck.hold(px - 5, py, px + 6, D);
  }
  deck.hold(T, T, T + CRATES, T + CRATES + 1);
  for (const wall of SIDES) {
    for (const [g0, g1] of wallGaps(L, wall)) {
      if (g0 === T) continue;
      if (wall === 'right') deck.hold(g0, T, g1, T + 5);
      else deck.hold(T, g0, T + 5, g1);
    }
  }
  const yd = (Math.min(W, D) - T) * 0.13;
  disc(deck.held, L, hub.x + yd, hub.y + yd, 5 + 6 * g);
  deck.touch();

  // Machinery out toward the edges, a drone tending the first.
  const machines: Disc[] = [];
  const mr = Math.round(5 + 2 * g);
  const mh = Math.round(9 + 5 * g);
  [[0.95, 0.9], [0.84, 0.97], [0.97, 0.35], [0.2, 0.97]].slice(0, Math.round(1 + 3 * g)).forEach(([fx, fy], k) => {
    const want = f.at(fx, fy);
    for (let r = mr; r >= 4; r -= 2) {
      const n = Math.max(5, Math.round(r * 1.25));
      const disc = (z: Zone): Disc => ({ x: z.x0 + (n >> 1), y: z.y0 + (n >> 1), r, tall: mh });
      const make = (x0: number, y0: number): Zone => ({ kind: 'machine', x0, y0, axis: 'x', len: n, dep: n, tall: mh, face: 1, n: r });
      const score = (z: Zone) => -Math.hypot(z.x0 + n / 2 - want.x, z.y0 + n / 2 - want.y) - 16 * hash3(0x3ac4, z.x0, z.y0, k);
      const z = deck.place(make, ['x'], 2, score, machines.length ? undefined : (z) => [aside(disc(z), 'pet', 2, hub)]);
      if (!z) continue;
      machines.push(disc(z));
      // its pipe back to the nearer wall
      if (z.x0 - T < z.y0 - T) deck.hold(T, z.y0 + (n >> 1) - 1, z.x0, z.y0 + (n >> 1) + 3);
      else deck.hold(z.x0 + (n >> 1) - 1, T, z.x0 + (n >> 1) + 3, z.y0);
      break;
    }
  });

  const early = f.pois.slice();
  depositRows(deck, g);
  counters(deck, g);
  cageByHub(deck, g);

  // Lamp posts beside the walkways: out to the features and the plazas, in
  // from the props.
  const posts: Pt[] = [];
  const post = (a: Pt, b: Pt, at: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 20) return;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (const side of [1, -1]) {
      const x = Math.round(a.x + ux * len * at - uy * side * 4);
      const y = Math.round(a.y + uy * len * at + ux * side * 4);
      if (x < T + 2 || y < T + 2 || x > W - 3 || y > D - 3 || f.paths[x + W * y] || deck.held[x + W * y]) continue;
      if (f.sites.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + 2) || posts.some((p) => Math.hypot(p.x - x, p.y - y) < 20)) continue;
      if (deck.near(x, y, 2)) continue;
      let kept = false; // its foot and its arm keep off keepClear too
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) kept ||= f.keep[x + dx + W * (y + dy)] === 1;
      if (kept) continue;
      posts.push({ x, y });
      f.paths[x + W * y] = 1;
      return;
    }
  };
  for (const p of early) post(hub, p, 0.55);
  for (const p of f.plazas) post(hub, p, 0.7);
  for (const s of L.slots) post(s.spot, hub, 0.5);
  deck.touch();

  const grates = floorGrates(deck, g);
  fill(deck, g);
  // A warm spot by the campfire, in a room with few other places to go.
  const warm = f.pois.length < 4 ? campfirePoi(L) : null;
  if (warm && !f.keep[warm.x + W * warm.y] && f.reachable(warm, null)) f.addPoi(warm);
  const P: FloorPlan = { floor: f, pit, cooler, showcase, lounge, machines, zones: deck.zones.filter((z) => z.kind !== 'machine'), taken: deck.taken, grates, posts };
  FLOORS.set(L, P);
  return P;
}

// The side of a zone (along `axis` with its middle at cx, cy) that faces
// the hub.
function toward(hub: Pt, axis: Axis, cx: number, cy: number): 1 | -1 {
  return (axis === 'x' ? hub.y - cy : hub.x - cx) < 0 ? -1 : 1;
}

const middle = (z: Zone): Pt => {
  const b = boxOf(z);
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 };
};

// Deposit boxes, in rows along the back of the room: against the wall in
// the stretch each wall keeps clear at its back corner (past the crates),
// with a row or two in front, each a step lower so every face shows.
function depositRows(deck: Deck, g: number): void {
  const { L } = deck;
  const { T } = L;
  const top = g >= 0.5 ? 12 : 10;
  for (const wall of SIDES) {
    const [g0, g1] = wallGaps(L, wall)[0] ?? [0, 0];
    if (g0 !== T) continue;
    const from = T + CRATES + 3;
    const axis: Axis = wall === 'right' ? 'x' : 'y';
    let done = false;
    for (let rows = g >= 0.3 ? 2 : 1; rows >= 1 && !done; rows--) {
      const dep = rows * 3 + (rows - 1) * AISLE;
      for (let len = Math.min(Math.round(16 + 18 * g), g1 - 3 - from); len >= 9 && !done; len -= 3) {
        const make = (x0: number, y0: number): Zone => ({ kind: 'boxes', x0, y0, axis, len, dep, tall: top, face: 1, n: rows });
        const at = axis === 'x' ? { y0: T } : { x0: T };
        done = deck.place(make, [axis], 2, (z) => -Math.abs((axis === 'x' ? z.x0 : z.y0) - from), undefined, at, 1) !== null;
      }
    }
  }
  // And out on the floor in front of them, a stack or two more along each
  // wall's way, the aisles carrying on between.
  const out = [deck.f.at(0.2, 0.1), deck.f.at(0.1, 0.2)].slice(0, g >= 0.7 ? 2 : g >= 0.35 ? 1 : 0);
  out.forEach((t, k) => {
    const axis: Axis = k ? 'y' : 'x';
    for (let len = Math.round(14 + 10 * g); len >= 11; len -= 3) {
      const make = (x0: number, y0: number): Zone => ({ kind: 'boxes', x0, y0, axis, len, dep: 6 + AISLE, tall: top - 2, face: 1, n: 2 });
      const score = (z: Zone) => -Math.hypot(middle(z).x - t.x, middle(z).y - t.y);
      if (deck.place(make, [axis], 3, score, undefined, {}, 2)) break;
    }
  });
}

// The gold cage: as near the hub as there is room, its door toward it, a
// pair of laser posts either side of the way in, someone stopping to look.
// Smaller where the floor is short.
function cageByHub(deck: Deck, g: number): void {
  const hub = deck.f.hub;
  // near the hub, square to it, on the camera's side of it if it can
  const score = (z: Zone) => {
    const c = middle(z);
    const off = z.axis === 'x' ? Math.abs(c.x - hub.x) : Math.abs(c.y - hub.y);
    return -Math.hypot(c.x - hub.x, c.y - hub.y) - 0.6 * off + 0.3 * (c.x + c.y - hub.x - hub.y);
  };
  for (const n of [13, 11, 9, 7].filter((n) => n <= 9 + 4 * g + 1)) {
    const apron = n > 7 ? 4 : 3;
    const make = (x0: number, y0: number, axis: Axis): Zone => {
      const cx = x0 + (axis === 'x' ? n : n + apron) / 2;
      const cy = y0 + (axis === 'x' ? n + apron : n) / 2;
      return { kind: 'cage', x0, y0, axis, len: n, dep: n + apron, tall: CAGE_H + 2, face: toward(hub, axis, cx, cy), n };
    };
    const view = (z: Zone): Poi[] => {
      const w = z.face < 0 ? -2 : z.dep + 1;
      const mid = z.len >> 1;
      const cw = z.face < 0 ? apron + (n >> 1) : n >> 1;
      return [{ x: zx(z, mid, w), y: zy(z, mid, w), kind: 'view', face: { x: zx(z, mid, cw), y: zy(z, mid, cw) } }];
    };
    for (const gap of [2, 1]) if (deck.place(make, ['x', 'y'], gap, score, view)) return;
  }
}

// Counting tables: up to three in a row, tellers' stools along the side
// toward the hub, out in the front half of the room (two such islands in
// the biggest rooms).
function counters(deck: Deck, g: number): void {
  const { L } = deck;
  const hub = deck.f.hub;
  const dep = 6;
  const seats = (z: Zone): Poi[] => {
    const out: Poi[] = [];
    const w = z.face < 0 ? 1 : 4;
    const tw = z.face < 0 ? 3 : 2;
    for (let j = 0; j < z.n; j++) out.push({ x: zx(z, 7 * j + 3, w), y: zy(z, 7 * j + 3, w), kind: 'seat', face: { x: zx(z, 7 * j + 3, tw), y: zy(z, 7 * j + 3, tw) } });
    return out;
  };
  const targets = [deck.f.at(0.45, 0.86), deck.f.at(0.86, 0.45)].slice(0, L.W >= 200 ? 2 : 1);
  for (const t of targets) {
    const score = (z: Zone) => {
      const c = middle(z);
      let apart = 80;
      for (const o of deck.zones) apart = Math.min(apart, Math.hypot(middle(o).x - c.x, middle(o).y - c.y));
      return -Math.hypot(c.x - t.x, c.y - t.y) + 0.5 * apart;
    };
    for (let n = g >= 0.4 ? 3 : 2; n >= 1; n--) {
      const len = 7 * n - 1;
      const make = (x0: number, y0: number, axis: Axis): Zone => {
        const cx = x0 + (axis === 'x' ? len : dep) / 2;
        const cy = y0 + (axis === 'x' ? dep : len) / 2;
        return { kind: 'counter', x0, y0, axis, len, dep, tall: 8, face: toward(hub, axis, cx, cy), n };
      };
      if (deck.place(make, ['x', 'y'], 2, score, seats) || deck.place(make, ['x', 'y'], 1, score, seats)) break;
    }
  }
}

// Floor grates on the open deck, well apart.
function floorGrates(deck: Deck, g: number): Disc[] {
  const { L, f } = deck;
  const { W, D, T } = L;
  const out: Disc[] = [];
  const want = Math.round(2 + 4 * g);
  for (let tries = 0; tries < 60 && out.length < want; tries++) {
    const r = f.rng.range(3, 4.5);
    const n = Math.round(r * 1.3);
    const x = f.rng.int(T + 8, W - 10);
    const y = f.rng.int(T + 8, D - 10);
    const x0 = x - (n >> 1);
    const y0 = y - (n >> 1);
    if (!deck.open(x0 - 2, y0 - 2, x0 + n + 2, y0 + n + 2)) continue;
    if (out.some((d) => Math.hypot(d.x - x, d.y - y) < 30)) continue;
    out.push({ x, y, r });
    deck.hold(x0 - 1, y0 - 1, x0 + n + 1, y0 + n + 1);
  }
  return out;
}

// The bare stretches, the widest first and the front of the room before
// the back, each get a group: a forklift by its pallets, a yard of pallets
// in rows, a row of safes, cash trolleys with sacks of coin (or, where none
// of those fits, something smaller) until none is OPEN voxels clear of
// everything. The back keeps more open deck than the front: the deck
// between the groups stays open, to walk and to see the crew on.
type Group = { kind: ZoneKind; len: number; dep: number; tall: number; shadow: number; n: number };
const GROUPS: readonly Group[] = [
  { kind: 'loading', len: 12, dep: 11, tall: 12, shadow: 8, n: 0 },
  { kind: 'pallets', len: 16, dep: 10, tall: 8, shadow: 8, n: 3 },
  { kind: 'cash', len: 12, dep: 7, tall: 7, shadow: 5, n: 0 },
  { kind: 'safes', len: 16, dep: 5, tall: 7, shadow: 7, n: 3 },
  { kind: 'pallets', len: 9, dep: 4, tall: 8, shadow: 8, n: 2 },
  { kind: 'trolley', len: 6, dep: 6, tall: 7, shadow: 5, n: 0 },
  { kind: 'safes', len: 11, dep: 3, tall: 7, shadow: 7, n: 2 },
  { kind: 'sacks', len: 5, dep: 5, tall: 4, shadow: 4, n: 0 },
];

function fill(deck: Deck, g: number): void {
  const { L, f } = deck;
  const { W, D, T } = L;
  const OPEN = clamp(Math.round(W / 20), 8, 13);
  const FORE = 0.06; // how hard the groups lean toward the front of the room
  const DENSE = 0.75; // the open deck they keep round them in the front half, of OPEN
  const SPARE = 1.6; // ...and in the back half
  // Distance to the nearest thing standing on the deck (or a wall).
  const far = new Float32Array(W * D).fill(1e6);
  const thing = (i: number) => (far[i] = 0);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (x < T || y < T || x >= W - 1 || y >= D - 1 || deck.taken[x + W * y]) thing(x + W * y);
  for (const s of L.slots) {
    const r = slotRect(s);
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) thing(x + W * y);
  }
  const mark = new Uint8Array(W * D);
  for (const s of f.sites) disc(mark, L, s.x, s.y, s.r);
  for (let i = 0; i < W * D; i++) if (mark[i]) thing(i);
  for (let y = 1; y < D; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = x + W * y;
      far[i] = Math.min(far[i], far[i - 1] + 1, far[i - W] + 1, far[i - W - 1] + Math.SQRT2, far[i - W + 1] + Math.SQRT2);
    }
  }
  for (let y = D - 2; y >= 0; y--) {
    for (let x = W - 2; x >= 1; x--) {
      const i = x + W * y;
      far[i] = Math.min(far[i], far[i + 1] + 1, far[i + W] + 1, far[i + W + 1] + Math.SQRT2, far[i + W - 1] + Math.SQRT2);
    }
  }
  const nearer = (b: Box) => {
    const r = 2 * OPEN;
    for (let y = Math.max(0, b.y0 - r); y < Math.min(D, b.y1 + r); y++) {
      for (let x = Math.max(0, b.x0 - r); x < Math.min(W, b.x1 + r); x++) {
        const d = Math.hypot(Math.max(0, b.x0 - x, x - b.x1 + 1), Math.max(0, b.y0 - y, y - b.y1 + 1));
        if (d < far[x + W * y]) far[x + W * y] = d;
      }
    }
  };
  // Things out on the floor run parallel to the nearer wall: along x on the
  // right wall's side of the diagonal, along y on the left's.
  const wallward = (x: number, y: number): Axis[] => (x >= y ? ['x', 'y'] : ['y', 'x']);
  const at = (gr: Group, axis: Axis, cx: number, cy: number): Zone => {
    const [sx, sy] = axis === 'x' ? [gr.len, gr.dep] : [gr.dep, gr.len];
    return { kind: gr.kind, x0: cx - (sx >> 1), y0: cy - (sy >> 1), axis, len: gr.len, dep: gr.dep, tall: gr.tall, face: 1, n: gr.n };
  };
  const put = (z: Zone) => {
    deck.claim(z);
    nearer(boxOf(z));
  };
  const loading = Math.max(1, Math.round(g * 2));
  let forklifts = 0;
  const big = GROUPS.findIndex((gr) => gr.kind === 'trolley'); // the first of the small groups
  const cand: Array<[number, number]> = [];
  for (let y = T + 4; y < D - 5; y += 3) {
    for (let x = T + 4; x < W - 5; x += 3) {
      const i = x + W * y;
      if (far[i] >= OPEN * DENSE) cand.push([Math.min(far[i], 3 * OPEN) + FORE * (x + y - W - D) + 2 * hash3(0x7a17, x, y, 6), i]);
    }
  }
  cand.sort((a, b) => b[0] - a[0]);
  for (const [, i] of cand) {
    const x = i % W;
    const y = (i - x) / W;
    const fore = x + y - 2 * T > W - T; // the front half of the room
    if (far[i] < (fore ? OPEN * DENSE : OPEN * SPARE)) continue;
    // the big groups by turns, then the small ones; the forklifts first
    const k = Math.floor(hash3(0x7a17, x, y, 9) * (big - 1)) + 1;
    const order = [...(forklifts < loading ? [GROUPS[0]] : []), ...GROUPS.slice(k, big), ...GROUPS.slice(1, k), ...GROUPS.slice(big)];
    let done = false;
    for (const gr of order) {
      for (const axis of wallward(x, y)) {
        const [sx, sy] = axis === 'x' ? [gr.len, gr.dep] : [gr.dep, gr.len];
        const x0 = x - (sx >> 1);
        const y0 = y - (sy >> 1);
        const gap = fore ? 1 : 2;
        if (!deck.open(x0 - gap, y0 - gap, x0 + sx + gap, y0 + sy + gap) || !deck.unseen(x0, y0, x0 + sx, y0 + sy, gr.shadow)) continue;
        put(at(gr, axis, x, y));
        if (gr.kind === 'loading') forklifts++;
        done = true;
        break;
      }
      if (done) break;
    }
  }
}

// Empties a reused world (four voxels at a look: most of it is air).
function clear(v: Voxels): void {
  const words = v.mat.byteOffset % 4 === 0 ? new Uint32Array(v.mat.buffer, v.mat.byteOffset, v.size >> 2) : new Uint32Array(0);
  for (let k = 0; k < words.length; k++) {
    if (words[k] === 0) continue;
    for (let i = 4 * k; i < 4 * k + 4; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
  }
  for (let i = words.length * 4; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// The floor: a grated gutter along the foot of both walls, then steel
// plates with dark seams and corner rivets, each plate its own calm shade,
// worn bright along the walkways and through to the stone here and there,
// over a dark subfloor.
function deck(v: Voxels, L: Layout, seed: number, trails: Uint8Array): void {
  const { W, D, T, floor } = L;
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      v.put(x, y, floor - 2, DARK, 1);
      const gx = x - T;
      const gy = y - T;
      if (gx < 2 || gy < 2) {
        const bar = (gx < 2 && gy < 2) || (gx < 2 ? y % 3 === 0 : x % 3 === 0);
        v.put(x, y, floor - 1, bar ? M.METAL : M.AIR, 6);
        continue;
      }
      const ix = (gx - 2) % TILE;
      const iy = (gy - 2) % TILE;
      const r = hash3(seed, Math.floor((gx - 2) / TILE), Math.floor((gy - 2) / TILE), 11);
      let m: number = M.METAL;
      let s = 2 + Math.floor(r * 3);
      if (noise2(seed + 21, x * 0.12, y * 0.12) < 0.14) {
        m = M.ROCK;
        s = calm(seed, x, y);
      } else if (ix === 0 || iy === 0) {
        m = DARK;
        s = 3;
      } else if ((ix === 1 || ix === TILE - 1) && (iy === 1 || iy === TILE - 1)) {
        s = 7;
      } else if (trails[x + W * y]) {
        s = 6; // worn bright where feet go
      }
      v.put(x, y, floor - 1, m, s);
    }
  }
}

// Guide lights set flush in the deck down the middle of the walkways from
// the hub to the props and the plazas, one every 24 voxels.
function strips(v: Voxels, L: Layout, f: Floor): void {
  const lanes: Array<[Pt, Pt]> = [...f.plazas.map((p): [Pt, Pt] => [f.hub, p]), ...L.slots.map((s): [Pt, Pt] => [s.spot, f.hub])];
  for (const [a, b] of lanes) {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    for (let d = 12; d < len - 6; d += 24) {
      const x = Math.round(a.x + ((b.x - a.x) * d) / len);
      const y = Math.round(a.y + ((b.y - a.y) * d) / len);
      if (x < L.T + 2 || y < L.T + 2 || x >= L.W || y >= L.D) continue;
      const m = v.get(x, y, L.floor - 1);
      if ((m === M.METAL || m === DARK || m === M.ROCK) && v.get(x, y, L.floor) === M.AIR) v.put(x, y, L.floor - 1, TUBE, 4);
    }
  }
}

// The hole torn in the plating behind the dig face, where the stone shows:
// the face itself and a ragged arch round it.
function breachOf(L: Layout, seed: number): (wall: Side, a: number, h: number) => boolean {
  const s = L.slots.find((k) => k.kind === 'search');
  if (!s) return () => false;
  const a0 = along(s);
  const mid = a0 + s.len / 2;
  const rx = s.len / 2 + 3;
  const ry = 17;
  return (wall, a, h) => {
    if (wall !== s.wall) return false;
    if (a >= a0 && a < a0 + s.len && h < 15) return true;
    const e = ((a + 0.5 - mid) / rx) ** 2 + (h / ry) ** 2;
    return e < 0.75 + 0.5 * noise2(seed + 31, a * 0.35, h * 0.35);
  };
}

// The wall face, bottom to top: kick plate, a band of panels, a dark
// channel behind the steel run, a band of panels, a channel behind the
// duct, a course of brick. Each panel band is split into rows about PH
// tall.
type Band = 'skirt' | 'lower' | 'upper' | 'strip' | 'cornice';
type Row = { band: Band; k: number; r0: number; r1: number };

function profile(P: Plan): Row[] {
  const rows: Row[] = [];
  const flat = (band: Band, h0: number, h1: number) => {
    for (let h = h0; h < h1; h++) rows[h] = { band, k: 0, r0: h0, r1: h1 };
  };
  const panels = (band: Band, h0: number, h1: number) => {
    const span = h1 - h0;
    const n = Math.max(1, Math.round(span / PH));
    for (let k = 0; k < n; k++) {
      const r0 = h0 + Math.floor((k * span) / n);
      const r1 = h0 + Math.floor(((k + 1) * span) / n);
      for (let h = r0; h < r1; h++) rows[h] = { band, k, r0, r1 };
    }
  };
  flat('skirt', 0, SKIRT);
  panels('lower', SKIRT, P.low);
  flat('strip', P.low, P.low + 2);
  if (P.hi > P.low + 2) panels('upper', P.low + 2, P.hi);
  flat('strip', P.hi, P.hi + 3);
  flat('cornice', P.hi + 3, P.top);
  return rows;
}

type Panel = 'plate' | 'vent' | 'case' | 'window';

// Cladding on a wall's inner face. Panels are riveted steel with patches of
// brickwork and of bare stone; whole panels clear of the props may instead
// be louvred vents, dark windows onto blinking machinery, or lit cases of
// gold behind glass. Steel ribs stand between pairs of upper panels.
function clad(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number, open: (wall: Side, a: number, h: number) => boolean, fx: Fixtures): void {
  const { T, floor } = L;
  const end = alongEnd(L, wall);
  const k = wall === 'left' ? 1 : 2;
  const rows = profile(P);
  const spans = slotsOn(L, wall).map((s) => [along(s) - 4, along(s) + s.len + 4] as const);
  const behind = (a0: number, a1: number) => spans.some(([s0, s1]) => a0 < s1 && a1 > s0);
  const cases: Array<[number, number, number]> = [];
  const at = (a: number, o: number, h: number, m: number, shade: number) => {
    const [x, y] = onWall(L, wall, a, o);
    const z = floor + h;
    if (isSolid(v.get(x, y, z))) v.put(x, y, z, m, shade);
  };
  // Whether each panel (by its column and row) touches the breach.
  const torn = new Map<number, boolean>();
  for (let a = T; a < end; a++) {
    const pa = Math.floor((a - T) / PW);
    const ia = (a - T) % PW;
    const a0 = T + pa * PW;
    for (let h = 0; h < P.top; h++) {
      if (open(wall, a, h)) continue;
      const R = rows[h];
      const bare = noise2(seed + 5 + k, a * 0.1, h * 0.1) < 0.13;
      if (!bare) at(a, -2, h, M.METAL, 1);
      if (R.band === 'skirt' || R.band === 'strip') {
        at(a, -1, h, DARK, R.band === 'skirt' ? 4 : 2);
        continue;
      }
      if (R.band === 'cornice') {
        at(a, -1, h, ...brick(seed, a, h));
        continue;
      }
      const upper = R.band === 'upper';
      const ih = h - R.r0;
      const tall = R.r1 - R.r0;
      const key = pa * 64 + R.r0;
      let hit = torn.get(key);
      if (hit === undefined) torn.set(key, (hit = touches(open, wall, a0, R.r0, R.r1)));
      const whole = a0 + PW < end && tall >= 5 && (upper || !behind(a0, a0 + PW + 1)) && !hit;
      const kind = whole ? panelKind(hash3(seed, pa, R.k, k * 2 + (upper ? 1 : 0)), upper) : 'plate';
      if (kind === 'case' && ia === 0 && ih === 0) cases.push([a0, R.r0, R.r1]);
      const seam = ia === 0 || ih === 0;
      if (kind === 'vent' && !seam) {
        at(a, -1, h, ih & 1 ? M.AIR : M.METAL, 6);
        at(a, -2, h, DARK, 1);
        if (ia === PW >> 1 && ih === tall >> 1) {
          const [x, y] = onWall(L, wall, a, 0);
          fx.vents.push({ x, y, z: floor + h, period: 6 + hash3(seed, pa, R.k, 50 + k) * 8, phase: hash3(seed, pa, R.k, 51 + k) * 14, burst: 1.5 });
        }
        continue;
      }
      if (kind === 'window' && !seam) {
        at(a, -1, h, M.GLASS, 4);
        at(a, -2, h, M.AIR, 0);
        const r = hash3(seed, a, h, 60 + k);
        const [bx, by] = onWall(L, wall, a, -3);
        if (r < 0.16) {
          const on = r < 0.06 ? TUBE : AMBER;
          v.put(bx, by, floor + h, on, 7);
          fx.blinkers.push({ x: bx, y: by, z: floor + h, on, period: 0.6 + hash3(seed, a, h, 61) * 2.4, phase: hash3(seed, a, h, 62) * 3, duty: 0.25 + hash3(seed, a, h, 63) * 0.6, lx: 0, ly: 0, glow: false });
        } else {
          v.put(bx, by, floor + h, DARK, ih === 1 || ih === tall - 1 ? 5 : 1);
        }
        continue;
      }
      // Plate, or brick, or the bare stone where both have gone.
      if (kind === 'plate' && bare) continue;
      if (kind === 'plate' && noise2(seed + 3 + k, a * 0.08, h * 0.12) > 0.68) {
        at(a, -1, h, ...brick(seed, a, h));
        continue;
      }
      if (seam) {
        at(a, -1, h, DARK, 4);
        continue;
      }
      const tone0 = 2 + Math.floor(hash3(seed, pa, R.k, 70 + k) * 3);
      const rivet = (ia === 1 || ia === PW - 1) && (ih === 1 || ih === tall - 1);
      at(a, -1, h, M.METAL, rivet ? 7 : ih === tall - 1 ? tone0 + 2 : ih === 1 ? tone0 - 1 : tone0);
    }
  }
  for (const [a0, r0, r1] of cases) goldCase(v, L, wall, a0, r0, r1, fx);
  // Ribs between pairs of upper panels, from the steel run to the duct.
  for (let a = T + PW; a < end - 1; a += 2 * PW) {
    for (let h = P.low + 2; h < P.hi; h++) {
      const [x, y] = onWall(L, wall, a, 0);
      if (v.get(x, y, floor + h) === M.AIR) v.put(x, y, floor + h, M.METAL, h === P.hi - 1 ? 6 : 4);
    }
  }
}

// What a whole panel clear of the props is.
function panelKind(r: number, upper: boolean): Panel {
  if (upper) return r < 0.06 ? 'case' : r < 0.2 ? 'vent' : r < 0.45 ? 'window' : 'plate';
  return r < 0.14 ? 'vent' : r < 0.3 ? 'window' : 'plate';
}

// True if any voxel of the panel at a0 spanning rows r0..r1 lies in the breach.
function touches(open: (wall: Side, a: number, h: number) => boolean, wall: Side, a0: number, r0: number, r1: number): boolean {
  for (let a = a0; a <= a0 + PW; a++) for (let h = r0; h <= r1; h++) if (open(wall, a, h)) return true;
  return false;
}

// Brickwork in running bond: 5 x 2 bricks, dark mortar.
function brick(seed: number, a: number, h: number): [number, number] {
  const course = Math.floor(h / 3);
  const off = (course & 1) * 3;
  if (h % 3 === 0 || (a + off) % 6 === 0) return [M.ROCK_DARK, 1];
  return [M.BRICK, 2 + Math.floor(hash3(seed, Math.floor((a + off) / 6), course, 7) * 5)];
}

// A case set into the wall behind a glass pane: steel shelves of gold
// bars, lit by a cold tube along its top.
function goldCase(v: Voxels, L: Layout, wall: Side, a0: number, r0: number, r1: number, fx: Fixtures): void {
  for (let a = a0; a <= a0 + PW; a++) {
    for (let h = r0; h <= r1; h++) {
      const inner = a > a0 && a < a0 + PW && h > r0 && h < r1;
      const ih = h - r0;
      for (let o = -4; o <= -1; o++) {
        const [x, y] = onWall(L, wall, a, o);
        const z = L.floor + h;
        if (!inner || o === -4) {
          v.put(x, y, z, M.METAL, o === -1 ? 5 : 1);
        } else if (o === -1) {
          v.put(x, y, z, M.GLASS, 5);
        } else if (h === r1 - 1) {
          v.put(x, y, z, o === -2 ? TUBE : DARK, o === -2 ? 7 : 1);
        } else if (ih % 3 === 1) {
          v.put(x, y, z, M.METAL, 4); // a shelf
        } else if (ih % 3 === 2 && (a - a0) % 3 !== 0) {
          v.put(x, y, z, GOLD, o === -2 ? 6 + ((a - a0) & 1) : 4);
          if (o === -2) fx.gold.push(v.idx(x, y, z));
        } else {
          v.put(x, y, z, DARK, 1);
        }
      }
    }
  }
}

// The acid pit: a bowl sunk in the floor and lined with steel wherever the
// acid touches (it eats stone and brick), hazard paint round its mouth and
// a low steel kerb round that.
function acidPit(v: Voxels, L: Layout, s: Site, keep: Uint8Array): void {
  const depth = Math.min(4, L.floor - 2);
  pit(v, L, s, depth, M.ACID);
  const x0 = Math.floor(s.x - s.rx) - 3;
  const x1 = Math.ceil(s.x + s.rx) + 3;
  const y0 = Math.floor(s.y - s.ry) - 3;
  const y1 = Math.ceil(s.y + s.ry) + 3;
  line(v, x0, y0, L.floor - 1 - depth, x1, y1, L.floor - 1);
  const z = L.floor - 1;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < L.T + 2 || y < L.T + 2 || x >= L.W || y >= L.D) continue;
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e <= 1) continue;
      if (e <= 1.7) {
        v.put(x, y, z, (x >> 1) & 1 ? GOLD : DARK, 4);
      } else if (e <= 2.4 && !keep[x + L.W * y]) {
        v.put(x, y, z, M.METAL, 6);
        v.put(x, y, z + 1, M.METAL, 5);
      }
    }
  }
}

// Grated channels of acid running from the pit out to the front cuts, one
// along x and one along y, each clear of the props and features (plated
// over where a walkway crosses): acid three wide just under the bars, steel
// walls, a steel end at the cut, guide lights along the rims. Records the
// gaps between the bars, where it fumes.
function channels(v: Voxels, L: Layout, s: Site, F: FloorPlan, fx: Fixtures): void {
  const z = L.floor - 1;
  const f = F.floor;
  // Never through a prop, a spot, a plaza or another feature; across a
  // walkway it runs under a steel plate.
  const blocked = (x: number, y: number) => f.seen[x + L.W * y] === 1 || f.sites.some((o) => o !== F.pit && Math.hypot(o.x - x, o.y - y) < o.r + 1);
  const covered = (x: number, y: number) => f.paths[x + L.W * y] === 1;
  for (const axis of [0, 1]) {
    const r = axis ? s.ry : s.rx;
    const from = Math.floor(r * 0.7);
    const end = axis ? L.D : L.W;
    const c0 = axis ? s.y : s.x;
    // world (x, y) at distance d from the pit's centre along the axis, offset q across it
    const at = (d: number, q: number): [number, number] => (axis ? [s.x + q, c0 + d] : [c0 + d, s.y + q]);
    let last = from;
    while (c0 + last + 1 < end - 1) {
      const d = last + 1;
      let ok = true;
      for (let q = -2; q <= 2 && ok; q++) {
        const [x, y] = at(d, q);
        if (blocked(x, y)) ok = false;
      }
      if (!ok) break;
      last = d;
    }
    if (c0 + last + 1 < end - 1 || last - r < 4) continue; // blocked short of the cut
    for (let d = from; c0 + d < end; d++) {
      const cut = c0 + d === end - 1;
      let plate = false;
      for (let q = -2; q <= 2 && !plate; q++) plate = covered(...at(d, q));
      for (let q = -2; q <= 2; q++) {
        const [x, y] = at(d, q);
        const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
        const rim = q === -2 || q === 2;
        const below = v.get(x, y, z - 1);
        if (cut || rim) {
          if (below !== M.ACID) v.put(x, y, z - 1, M.METAL, 2);
        } else {
          v.put(x, y, z - 1, M.ACID);
        }
        if (v.get(x, y, z - 2) !== M.ACID) v.put(x, y, z - 2, M.METAL, 1);
        if (e <= 1) continue; // the pit's open mouth
        v.put(x, y, z + 1, M.AIR);
        if (plate) {
          v.put(x, y, z, M.METAL, rim ? 4 : 6);
        } else if (cut || rim) {
          const stud = rim && !cut && d % 6 === 0;
          v.put(x, y, z, stud ? AMBER : M.METAL, stud ? 7 : 5);
        } else if (d % 4) {
          // open: the camera looks down a voxel and across one, so the
          // acid only shows through gaps wider than that
          v.put(x, y, z, M.AIR);
          fx.grates.push([x, y, z]);
        } else {
          v.put(x, y, z, M.METAL, 7);
        }
      }
    }
  }
}

// Steel wherever acid touches something it could eat, in a box.
function line(v: Voxels, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): void {
  for (let z = z0; z <= z1; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (v.get(x, y, z) !== M.ACID) continue;
        for (const [dx, dy, dz] of N6) {
          const m = v.get(x + dx, y + dy, z + dz);
          if (m !== M.ACID && m !== M.AIR && m !== M.METAL && m !== M.GLASS && m !== M.OUT) v.put(x + dx, y + dy, z + dz, M.METAL, 1);
        }
      }
    }
  }
}

// The steel pipe run along a wall: 2 x 2, collared every FLANGE, with a
// release valve or two that vents steam.
function steelRun(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number, fx: Fixtures): void {
  const end = alongEnd(L, wall);
  const k = wall === 'left' ? 1 : 2;
  const z0 = L.floor + P.low;
  for (let a = L.T; a < end; a++) {
    for (let o = 0; o < 2; o++) {
      const [x, y] = onWall(L, wall, a, o);
      v.put(x, y, z0, M.METAL, o ? 3 : 2);
      v.put(x, y, z0 + 1, M.METAL, o ? 6 : 5);
    }
  }
  const off = L.T + 3 + Math.floor(hash3(seed, 1, k, 41) * FLANGE);
  for (let a = off; a < end - 1; a += FLANGE) {
    for (let o = 0; o < 3; o++) {
      for (let dz = -1; dz < 3; dz++) {
        if (o === 2 && (dz === -1 || dz === 2)) continue;
        if (o < 2 && dz >= 0 && dz < 2) continue;
        const [x, y] = onWall(L, wall, a, o);
        v.put(x, y, z0 + dz, M.METAL, 4);
      }
    }
  }
  const n = Math.max(1, Math.round((end - L.T) / 50));
  for (let i = 0; i < n; i++) {
    const a = L.T + Math.round(((i + 0.5 + (hash3(seed, i, k, 43) - 0.5) * 0.5) * (end - L.T)) / n);
    const [x, y] = onWall(L, wall, a, 1);
    v.put(x, y, z0 + 2, M.METAL, 6);
    v.put(x, y, z0 + 3, M.METAL, 4);
    fx.vents.push({ x, y, z: z0 + 4, period: 5 + hash3(seed, i, k, 44) * 6, phase: hash3(seed, i, k, 45) * 11, burst: 1.2 });
  }
}

// The cable duct along the top of both walls: 3 x 3 steel, collared along
// the way, an amber marker lamp every so often.
function duct(v: Voxels, L: Layout, P: Plan, seed: number): void {
  const z0 = L.floor + P.hi;
  for (const wall of SIDES) {
    const end = alongEnd(L, wall);
    for (let a = L.T; a < end; a++) {
      for (let o = 0; o < 3; o++) {
        for (let dz = 0; dz < 3; dz++) {
          const [x, y] = onWall(L, wall, a, o);
          const marker = o === 2 && dz === 1 && a < end - 1 && (a - L.T) % 24 === 22;
          v.put(x, y, z0 + dz, marker ? AMBER : M.METAL, marker ? 7 : o === 2 ? 4 : 3);
        }
      }
    }
    const off = L.T + 4 + Math.floor(hash3(seed, 2, wall === 'left' ? 1 : 2, 46) * FLANGE);
    for (let a = off; a < end - 2; a += 2 * FLANGE) {
      for (let o = 0; o < 3; o++) {
        for (let dz = 0; dz < 3; dz++) {
          const [x, y] = onWall(L, wall, a, o);
          if (v.get(x, y, z0 + dz) === M.METAL) v.put(x, y, z0 + dz, M.METAL, dz === 2 ? 6 : 4);
        }
      }
    }
  }
}

// Something in every gap between props along a wall: a safe, a riser with
// a valve wheel, or a box of status lamps.
function gapFixtures(v: Voxels, L: Layout, P: Plan, wall: Side, rng: Rng, fx: Fixtures): void {
  const end = alongEnd(L, wall);
  let n = wall === 'left' ? 1 : 0;
  for (const [g0, g1] of wallGaps(L, wall)) {
    if (g0 === L.T) continue; // the back corner keeps the crates and the deposit boxes
    const a0 = g0 + 1;
    const w = g1 - 1 - a0;
    if (w < 2 || (g1 === end && w < 3)) continue;
    const kind = w >= 4 ? n++ % 4 : 1;
    if (kind === 0) wallSafe(v, L, wall, a0, w);
    else if (kind === 1 || kind === 3) riser(v, L, wall, a0, w, P.low);
    else statusBox(v, L, wall, a0, w, rng, fx);
  }
}

// A safe against the wall: a steel box on a dark plinth, its door on the
// face toward the room with a brass dial and a handle.
function wallSafe(v: Voxels, L: Layout, wall: Side, a0: number, w: number): void {
  const S = Math.min(5, w);
  const p = a0 + Math.floor((w - S) / 2);
  const tall = S + 3;
  for (let i = 0; i < S; i++) {
    for (let o = 0; o < 3; o++) {
      const [x, y] = onWall(L, wall, p + i, o);
      for (let h = 0; h < tall; h++) {
        const face = o === 2 && i > 0 && i < S - 1 && h > 1 && h < tall - 2;
        v.put(x, y, L.floor + h, h === 0 ? DARK : M.METAL, h === 0 ? 2 : h === tall - 1 ? 6 : face ? 4 : 2);
      }
    }
  }
  const [dx, dy] = onWall(L, wall, p + (S >> 1), 2);
  v.put(dx, dy, L.floor + tall - 3, BRASS, 6); // the dial
  const [hx, hy] = onWall(L, wall, p + 1, 2);
  v.put(hx, hy, L.floor + 3, M.METAL, 7); // the handle
}

// A riser from the floor to the pipe run, with a valve wheel on its front.
function riser(v: Voxels, L: Layout, wall: Side, a0: number, w: number, ph: number): void {
  const p = a0 + Math.floor((w - 2) / 2);
  for (let h = -1; h < ph; h++) {
    for (let i = 0; i < 2; i++) {
      for (let o = 0; o < 2; o++) {
        const [x, y] = onWall(L, wall, p + i, o);
        v.put(x, y, L.floor + h, M.METAL, i ? 3 : 5);
      }
    }
  }
  const vh = 10;
  for (let i = -1; i <= 2; i++) {
    for (let dh = -1; dh <= 2; dh++) {
      const rim = i === -1 || i === 2 || dh === -1 || dh === 2;
      const corner = (i === -1 || i === 2) && (dh === -1 || dh === 2);
      if (!rim || corner) continue;
      const [x, y] = onWall(L, wall, p + i, 2);
      v.put(x, y, L.floor + vh + dh, M.METAL, 7);
    }
  }
  const [x, y] = onWall(L, wall, p, 2);
  v.put(x, y, L.floor + vh, DARK, 3); // hub
}

// A control box on the wall: a dark case in a steel rim, status lamps on
// its face, a conduit down to the floor.
function statusBox(v: Voxels, L: Layout, wall: Side, a0: number, w: number, rng: Rng, fx: Fixtures): void {
  const bw = Math.min(5, w);
  const p = a0 + Math.floor((w - bw) / 2);
  for (let i = 0; i < bw; i++) {
    for (let h = 8; h < 14; h++) {
      const [x, y] = onWall(L, wall, p + i, 0);
      const rim = i === 0 || i === bw - 1 || h === 8 || h === 13;
      v.put(x, y, L.floor + h, rim ? M.METAL : DARK, rim ? 5 : 2);
    }
  }
  let lit = 0;
  for (let h = 10; h <= 12; h += 2) {
    for (let i = 1; i < bw - 1; i++) {
      if (rng.chance(0.35)) continue;
      const [x, y] = onWall(L, wall, p + i, 0);
      const [lx, ly] = onWall(L, wall, p + i, 1);
      const on = rng.chance(0.3) ? TUBE : AMBER;
      v.put(x, y, L.floor + h, on, 7);
      fx.blinkers.push({ x, y, z: L.floor + h, on, period: rng.range(0.5, 2.5), phase: rng.range(0, 3), duty: rng.range(0.3, 0.8), lx: lx + 0.5, ly: ly + 0.5, glow: lit++ < 2 });
    }
  }
  const [cx, cy] = onWall(L, wall, p + (bw >> 1), 0);
  for (let h = 0; h < 8; h++) v.put(cx, cy, L.floor + h, DARK, 4);
}

// Lamp tubes hung under the steel run, over the props and the deposit
// boxes against that wall.
function lamps(v: Voxels, L: Layout, P: Plan, wall: Side, zones: readonly Zone[], fx: Fixtures): void {
  const z = L.floor + P.low - 1;
  const sites = slotsOn(L, wall).filter((s) => s.kind !== 'entrance').map((s) => along(s) + (s.len >> 1));
  const axis: Axis = wall === 'right' ? 'x' : 'y';
  for (const b of zones) {
    if (b.kind !== 'boxes' || b.axis !== axis || (axis === 'x' ? b.y0 : b.x0) !== L.T) continue;
    const a0 = axis === 'x' ? b.x0 : b.y0;
    for (let a = a0 + 4; a < a0 + b.len - 3; a += LAMP_GAP + 2) sites.push(a);
  }
  sites.sort((p, q) => p - q);
  let last = -Infinity;
  for (const c of sites) {
    if (c - last < LAMP_GAP) continue;
    last = c;
    const cells: number[] = [];
    for (let i = -3; i <= 3; i++) {
      const [x, y] = onWall(L, wall, c + i, 1);
      const glass = Math.abs(i) < 3;
      v.put(x, y, z, glass ? TUBE : M.METAL, glass ? 7 : 5);
      if (glass) cells.push(v.idx(x, y, z));
    }
    const [lx, ly] = onWall(L, wall, c, 2);
    fx.lamps.push({ x: lx + 0.5, y: ly + 0.5, z: z - 0.5, cells, broken: false });
  }
}

// Where the steel run drips: a spot under it, over open floor, in a gap
// between props.
function leak(v: Voxels, L: Layout, P: Plan, rng: Rng): [number, number, number] | null {
  const spots: Array<[number, number, number]> = [];
  for (const wall of SIDES) {
    for (const [g0, g1] of wallGaps(L, wall)) {
      if (g0 === L.T) continue;
      for (let a = g0; a < g1; a++) {
        const [x, y] = onWall(L, wall, a, 1);
        const [ox, oy] = onWall(L, wall, a, 2);
        let clear = true;
        for (let h = 0; h < P.low && clear; h++) clear = v.get(x, y, L.floor + h) === M.AIR && v.get(ox, oy, L.floor + h) === M.AIR;
        if (clear) spots.push([x + 0.5, y + 0.5, L.floor + P.low - 0.3]);
      }
    }
  }
  return spots.length ? rng.pick(spots) : null;
}

// Crates and a drum of something nasty stacked in the back corner.
function crates(v: Voxels, L: Layout, keep: Uint8Array): void {
  const { T, W, floor } = L;
  const free = (x0: number, y0: number, sx: number, sy: number) => {
    for (let y = y0; y < y0 + sy; y++) for (let x = x0; x < x0 + sx; x++) if (keep[x + W * y] || v.get(x, y, floor) !== M.AIR) return false;
    return true;
  };
  if (free(T, T, 4, 4)) {
    box(v, T, T, floor, 4, 4, 4);
    box(v, T, T, floor + 4, 3, 3, 3);
  }
  if (free(T, T + 4, 4, 4)) box(v, T, T + 4, floor, 4, 4, 4);
  if (free(T + 4, T, 3, 3)) {
    // the drum, banded in hazard paint
    for (let z = floor; z < floor + 5; z++) {
      for (let y = T; y < T + 3; y++) {
        for (let x = T + 4; x < T + 7; x++) {
          if ((x === T + 4 || x === T + 6) && (y === T || y === T + 2)) continue;
          v.put(x, y, z, z === floor + 2 ? GOLD : M.METAL, z === floor + 4 ? 6 : 2);
        }
      }
    }
  }
}

// Loose stuff on the open floor: grit, and the odd scrap of steel.
function litter(v: Voxels, L: Layout, rng: Rng, free: Uint8Array, pool: Site | null): void {
  const { W, D, T, floor } = L;
  const open = (x: number, y: number) => {
    if (x < T + 2 || y < T + 2 || x >= W || y >= D || !free[x + W * y]) return false;
    if (pool && ((x - pool.x) / (pool.rx + 4)) ** 2 + ((y - pool.y) / (pool.ry + 4)) ** 2 <= 1) return false;
    return v.get(x, y, floor - 1) !== M.AIR && v.get(x, y, floor) === M.AIR;
  };
  for (let k = Math.round((W * D) / 900); k > 0; k--) {
    const x = rng.int(T + 1, W - 2);
    const y = rng.int(T + 1, D - 2);
    if (!open(x, y)) continue;
    v.put(x, y, floor, rng.chance(0.7) ? M.GRAVEL : M.METAL, rng.int(2, 5));
    if (rng.chance(0.4) && open(x + 1, y)) v.put(x + 1, y, floor, M.GRAVEL, rng.int(2, 5));
  }
}

// ── out on the deck ──────────────────────────────────────────────────────
// A floor grate: bars every third voxel over a dark sump with an amber
// light down in it (and now and then a breath of steam).
function grate(v: Voxels, L: Layout, rng: Rng, d: Disc, fx: Fixtures): void {
  const z = L.floor - 1;
  const n = Math.round(d.r * 1.3);
  const x0 = Math.round(d.x) - (n >> 1);
  const y0 = Math.round(d.y) - (n >> 1);
  const alongX = rng.chance(0.5);
  for (let j = -1; j <= n; j++) {
    for (let i = -1; i <= n; i++) {
      const x = x0 + i;
      const y = y0 + j;
      if (i < 0 || j < 0 || i === n || j === n) {
        v.put(x, y, z, GOLD, ((i + j) >> 1) & 1 ? 2 : 5); // hazard frame
        continue;
      }
      v.put(x, y, z - 1, (i === n >> 1 || j === n >> 1) && (i + j) % 2 === 0 ? AMBER : DARK, 1);
      v.put(x, y, z, (alongX ? i : j) % 3 === 0 ? M.METAL : M.AIR, 6);
    }
  }
  if (rng.chance(0.5)) fx.vents.push({ x: x0 + (n >> 1), y: y0 + (n >> 1), z: L.floor, period: rng.range(7, 13), phase: rng.range(0, 13), burst: 1.4 });
}

// Machinery: a steel housing of gunmetal panels on a hazard-striped
// plinth, a bank of amber and white lights and a screen on the faces the
// camera sees, louvres that blow steam, a stack on top, a pipe out to the
// wall (sunk flush under any walkway).
function machine(v: Voxels, L: Layout, rng: Rng, d: Disc, F: FloorPlan, fx: Fixtures): void {
  const { floor } = L;
  const f = F.floor;
  const n = Math.max(5, Math.round(d.r * 1.25));
  const x0 = Math.round(d.x) - (n >> 1);
  const y0 = Math.round(d.y) - (n >> 1);
  const x1 = x0 + n - 1;
  const y1 = y0 + n - 1;
  const tall = Math.round((d.tall ?? 12) * rng.range(0.6, 0.85));
  for (let z = 0; z < tall; z++) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const edge = +(x === x0 || x === x1) + +(y === y0 || y === y1);
        let m: number = z < 2 ? GOLD : edge >= 2 ? M.METAL : DARK;
        let sh = edge >= 2 ? 6 : 3;
        if (z < 2) sh = ((x + y) >> 1) & 1 ? 2 : 5;
        else if (edge < 2 && (z % 4 === 1 || (x - x0) % 4 === 0 || (y - y0) % 4 === 0)) {
          m = M.METAL; // panel seams
          sh = 4;
        }
        if (z === tall - 1) {
          m = M.METAL;
          sh = 5;
        }
        v.put(x, y, floor + z, m, sh);
      }
    }
  }
  // The faces the camera sees (+x and +y): lights, a screen, louvres.
  const face = (side: 'x' | 'y', a: number, h: number, m: number, shade: number) => (side === 'x' ? v.put(x1, y0 + a, floor + h, m, shade) : v.put(x0 + a, y1, floor + h, m, shade));
  for (const side of ['x', 'y'] as const) {
    for (let a = 1; a < n - 1; a += 2) {
      const h = tall - 3;
      if (h < 4) break;
      const on = rng.chance(0.25) ? TUBE : AMBER;
      face(side, a, h, on, 7);
      const [x, y] = side === 'x' ? [x1, y0 + a] : [x0 + a, y1];
      fx.blinkers.push({ x, y, z: floor + h, on, period: rng.range(0.6, 2.4), phase: rng.range(0, 3), duty: rng.range(0.3, 0.8), lx: x + (side === 'x' ? 1 : 0.5), ly: y + (side === 'y' ? 1 : 0.5), glow: a === 1 });
    }
    if (side === 'x') {
      for (let h = 3; h < Math.min(tall - 4, 7); h++) for (let a = 1; a < Math.min(n - 1, 5); a++) face(side, a, h, rng.chance(0.45) ? AMBER : DARK, 6); // screen
    } else {
      for (let h = 3; h < tall - 4; h++) {
        if (h % 2) continue;
        for (let a = 1; a < n - 1; a++) face(side, a, h, M.METAL, 7); // louvres
      }
      fx.vents.push({ x: x0 + (n >> 1), y: y1 + 1, z: floor + 4, period: rng.range(5, 10), phase: rng.range(0, 10), burst: 1.2 });
    }
  }
  // An exhaust stack.
  const sx = x0 + 1;
  const sy = y0 + 1;
  for (let z = tall; z < tall + 4; z++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) v.put(sx + dx, sy + dy, floor + z, M.METAL, z === tall + 3 ? 6 : 3);
  fx.vents.push({ x: sx, y: sy, z: floor + tall + 4, period: rng.range(4, 8), phase: rng.range(0, 8), burst: 1 });
  // A pipe back to the nearer wall.
  const toLeft = x0 - L.T < y0 - L.T;
  const py = y0 + (n >> 1);
  const px = x0 + (n >> 1);
  for (let k = toLeft ? x0 - 1 : y0 - 1; k >= L.T; k--) {
    const [x, y] = toLeft ? [k, py] : [px, k];
    const [x2, y2] = toLeft ? [k, py + 1] : [px + 1, k];
    if (f.sites.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 1) || F.taken[x + L.W * y] || F.taken[x2 + L.W * y2]) break;
    const sunk = f.paths[x + L.W * y] || f.paths[x2 + L.W * y2];
    for (const [cx, cy] of [[x, y], [x2, y2]]) {
      if (sunk) v.put(cx, cy, floor - 1, M.METAL, 6);
      else for (let z = 0; z < 2; z++) if (v.get(cx, cy, floor + z) === M.AIR) v.put(cx, cy, floor + z, M.METAL, z ? 6 : 3);
    }
    if (!sunk && (k % 9 === 0)) for (const [cx, cy] of [[x, y], [x2, y2]]) if (v.get(cx, cy, floor + 2) === M.AIR) v.put(cx, cy, floor + 2, M.METAL, 4); // a collar
  }
}

// A water cooler: a pale cabinet with a tap, a glass jug of water on top.
function cooler(v: Voxels, L: Layout, d: Disc): void {
  const cx = Math.round(d.x);
  const cy = Math.round(d.y);
  const z = L.floor;
  for (let h = 0; h < 5; h++) for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) v.put(x, y, z + h, M.PLASTIC, h === 4 ? 6 : 3);
  v.put(cx + 1, cy + 1, z + 3, M.CARPET, 6); // the hot tap
  v.put(cx + 1, cy, z + 3, M.METAL, 6); // the cold one
  for (let h = 5; h < 9; h++) {
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        const core = x === cx && y === cy && h > 5 && h < 8;
        v.put(x, y, z + h, core ? M.WATER : M.GLASS, core ? undefined : 5);
      }
    }
  }
}

// A case of gold on a steel plinth: glass between steel corner posts, gold
// bars on its floor and on a shelf, a cold lamp under its lid.
function showcase(v: Voxels, L: Layout, d: Disc, fx: Fixtures): void {
  const { floor } = L;
  const n = Math.max(4, Math.round(d.r * 1.3));
  const x0 = Math.round(d.x) - (n >> 1);
  const y0 = Math.round(d.y) - (n >> 1);
  const tall = Math.round(d.tall ?? 10);
  const shelf = Math.round(tall / 2);
  let bulb = -1;
  for (let y = y0; y < y0 + n; y++) {
    for (let x = x0; x < x0 + n; x++) {
      const ex = x === x0 || x === x0 + n - 1;
      const ey = y === y0 || y === y0 + n - 1;
      for (let h = 0; h < tall; h++) {
        let m: number = M.AIR;
        let sh = 5;
        if (h < 2 || h === tall - 1) m = M.METAL;
        else if (ex && ey) m = M.METAL;
        else if (ex || ey) m = M.GLASS;
        else if (h === shelf) m = M.METAL;
        else if (h === 2 || h === shelf + 1) {
          m = GOLD;
          sh = (x + y) & 1 ? 7 : 5;
        } else if (h === tall - 2 && (x + y) % 3 === 0) {
          m = TUBE;
          sh = 7;
        }
        if (m === M.AIR) continue;
        v.put(x, y, floor + h, m, m === M.METAL ? (h === tall - 1 ? 6 : 3) : sh);
        if (m === GOLD && sh === 7) fx.gold.push(v.idx(x, y, floor + h));
        if (m === TUBE && bulb < 0) bulb = v.idx(x, y, floor + h);
      }
    }
  }
  if (bulb >= 0) fx.glows.push({ i: bulb, m: TUBE, x: d.x, y: d.y, z: floor + tall - 2, color: LAMP, radius: 12, intensity: 0.45 });
}

// Crates round a low one to sit on.
function lounge(v: Voxels, L: Layout, rng: Rng, d: Disc, f: Floor): void {
  const cx = Math.round(d.x);
  const cy = Math.round(d.y);
  box(v, cx - 1, cy - 1, L.floor, 3, 3, 2);
  const a0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < 3; k++) {
    const a = a0 + (k / 3) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (d.r - 1)) - 1;
    const y = Math.round(cy + Math.sin(a) * (d.r - 1)) - 1;
    let ok = true;
    for (let yy = y; yy < y + 3 && ok; yy++) for (let xx = x; xx < x + 3 && ok; xx++) ok = !f.paths[xx + L.W * yy] && v.get(xx, yy, L.floor) === M.AIR;
    if (!ok) continue;
    const h = rng.int(2, 4);
    box(v, x, y, L.floor, 3, 3, h);
    if (h <= 3 && rng.chance(0.6)) box(v, x, y, L.floor + h, 2, 2, 2);
  }
}

// A crate: steel edges round dark panels.
function box(v: Voxels, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number): void {
  for (let z = z0; z < z0 + sz; z++) {
    for (let y = y0; y < y0 + sy; y++) {
      for (let x = x0; x < x0 + sx; x++) {
        const edges = +(x === x0 || x === x0 + sx - 1) + +(y === y0 || y === y0 + sy - 1) + +(z === z0 || z === z0 + sz - 1);
        v.put(x, y, z, edges >= 2 ? M.METAL : DARK, edges >= 2 ? 6 : 3);
      }
    }
  }
}

// A lamp post: a steel pole with an arm and a cold white lamp.
function lampPost(v: Voxels, L: Layout, p: Pt, fx: Fixtures): void {
  const z = L.floor;
  const H = 12;
  for (let h = 0; h < H; h++) v.put(p.x, p.y, z + h, M.METAL, h === 0 ? 2 : 4);
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) v.put(p.x + dx, p.y + dy, z, M.METAL, 2);
  v.put(p.x, p.y, z + H, M.METAL, 6);
  v.put(p.x + 1, p.y + 1, z + H, M.METAL, 6);
  v.put(p.x + 1, p.y + 1, z + H - 1, TUBE, 7);
  fx.posts.push([p.x + 1.5, p.y + 1.5, z + H - 1.5]);
}

// ── the zones ────────────────────────────────────────────────────────────
// Each built in its own frame (see Zone): u along it, w across toward the
// camera, h up from the floor.
type Builder = (v: Voxels, L: Layout, z: Zone, rng: Rng, fx: Fixtures) => void;

// Paint on the deck round a zone: white lines round a bay of gear, hazard
// stripes round the cage, a leather mat under the counting tables (the
// deposit boxes stand on bare plate).
function paint(v: Voxels, L: Layout, z: Zone): void {
  if (z.kind === 'boxes') return;
  const b = boxOf(z);
  const h = L.floor - 1;
  const deck = (m: number) => m === M.METAL || m === DARK || m === M.ROCK;
  for (let y = b.y0 - 1; y <= b.y1; y++) {
    for (let x = b.x0 - 1; x <= b.x1; x++) {
      if (!deck(v.get(x, y, h)) || v.get(x, y, L.floor) !== M.AIR && z.kind !== 'counter') continue;
      const rim = x === b.x0 - 1 || x === b.x1 || y === b.y0 - 1 || y === b.y1;
      if (z.kind === 'counter') v.put(x, y, h, M.CARPET, rim ? 2 : 3 + ((x + y) & 1));
      else if (!rim) continue;
      else if (z.kind === 'cage') v.put(x, y, h, ((x + y) >> 1) & 1 ? GOLD : DARK, 3);
      else v.put(x, y, h, M.TILE, 2);
    }
  }
}

// A fixed lamp: its lit voxel at (u, w, h) and the light it throws.
function glow(v: Voxels, L: Layout, z: Zone, u: number, w: number, h: number, m: number, color: RGB, radius: number, intensity: number, fx: Fixtures): void {
  const x = zx(z, u, w);
  const y = zy(z, u, w);
  v.put(x, y, L.floor + h, m, 7);
  fx.glows.push({ i: v.idx(x, y, L.floor + h), m, x: x + 0.5, y: y + 0.5, z: L.floor + h - 0.5, color, radius, intensity });
}

// Gold bars stacked in tiers on (u0, w0), `nu` x `nw` at the bottom, each
// tier laid across the one below and a bar in from its edges.
function bars(v: Voxels, L: Layout, z: Zone, u0: number, w0: number, h0: number, nu: number, nw: number, fx: Fixtures): void {
  for (let t = 0; nu - t > 0 && nw - t > 0; t++) {
    for (let u = u0 + (t >> 1); u < u0 + nu - ((t + 1) >> 1); u++) {
      for (let w = w0 + (t >> 1); w < w0 + nw - ((t + 1) >> 1); w++) {
        const bar = t & 1 ? (w - w0) >> 1 : (u - u0) >> 1; // two voxels a bar, crossways each tier
        const lit = (bar + (t & 1 ? u : w)) & 1;
        zput(v, L, z, u, w, h0 + t, GOLD, lit ? 7 : 5);
        if (lit && t > 0) fx.gold.push(v.idx(zx(z, u, w), zy(z, u, w), L.floor + h0 + t));
      }
    }
  }
}

// A pallet: slats over runners, one voxel high.
function pallet(v: Voxels, L: Layout, z: Zone, u0: number, w0: number, h0: number, nu: number, nw: number): void {
  for (let u = u0; u < u0 + nu; u++) for (let w = w0; w < w0 + nw; w++) zput(v, L, z, u, w, h0, M.WOOD, (u - u0) & 1 ? 2 : 5);
}

// A wooden crate: battens on its edges and across its faces.
function crate(v: Voxels, L: Layout, z: Zone, u0: number, w0: number, h0: number, nu: number, nw: number, nh: number): void {
  for (let h = h0; h < h0 + nh; h++) {
    for (let u = u0; u < u0 + nu; u++) {
      for (let w = w0; w < w0 + nw; w++) {
        const eu = u === u0 || u === u0 + nu - 1;
        const ew = w === w0 || w === w0 + nw - 1;
        const eh = h === h0 || h === h0 + nh - 1;
        const edges = +eu + +ew + +eh;
        zput(v, L, z, u, w, h, M.WOOD, edges >= 2 ? 6 : (u + w + h) % 3 === 0 ? 4 : 3);
      }
    }
  }
}

// A sack of coin: burlap, tied at the neck, a coin or two spilled.
function sack(v: Voxels, L: Layout, z: Zone, u: number, w: number): void {
  for (let du = 0; du < 2; du++) {
    for (let dw = 0; dw < 2; dw++) {
      zput(v, L, z, u + du, w + dw, 0, M.CLOTH, 3);
      zput(v, L, z, u + du, w + dw, 1, M.CLOTH, 4 + dw);
    }
  }
  zput(v, L, z, u, w + 1, 2, M.CLOTH, 6);
  zput(v, L, z, u, w + 1, 3, BRASS, 5); // the tie
  zput(v, L, z, u + 2, w + 1, 0, GOLD, 7);
}

// A floor safe: a steel box on a dark base, its door toward the camera
// with a brass dial and a handle.
function safe(v: Voxels, L: Layout, z: Zone, u0: number, nu: number, tall: number): void {
  for (let u = u0; u < u0 + nu; u++) {
    for (let w = 0; w < 3; w++) {
      for (let h = 0; h < tall; h++) {
        const door = w === 2 && u > u0 && u < u0 + nu - 1 && h > 1 && h < tall - 2;
        zput(v, L, z, u, w, h, h === 0 ? DARK : M.METAL, h === 0 ? 2 : h === tall - 1 ? 6 : door ? 4 : u === u0 + nu - 1 ? 3 : 2);
      }
    }
  }
  zput(v, L, z, u0 + (nu >> 1), 2, tall - 3, BRASS, 6); // the dial
  zput(v, L, z, u0 + 1, 2, 3, M.METAL, 7); // the handle
}

// Deposit boxes: rows of steel cabinets, the back one against the wall,
// each a grid of small brass doors with dark seams on the face toward the
// camera, a number plate on its end, a lamp on top of each row in front
// and a camera at the end of the back one looking down the aisles.
const depositBoxes: Builder = (v, L, z, rng, fx) => {
  const seed = rng.int(0, 0xffff);
  for (let k = 0; k < z.n; k++) {
    const w0 = k * (3 + AISLE);
    const top = z.tall - 2 * k;
    for (let u = 0; u < z.len; u++) {
      for (let w = w0; w < w0 + 3; w++) {
        for (let h = 0; h < top; h++) {
          const front = w === w0 + 2;
          const end = u === 0 || u === z.len - 1;
          let m: number = M.METAL;
          let sh = 2;
          if (h === 0) {
            m = DARK; // plinth
          } else if (h === top - 1) {
            sh = front ? 7 : 6; // the top
          } else if (end) {
            sh = u === z.len - 1 ? 4 : 2;
          } else if (front || w === w0 + 1) {
            const du = (u - 1) % 3;
            const dh = (h - 1) % 3;
            const open = hash3(seed, k * 97 + Math.floor((u - 1) / 3), Math.floor((h - 1) / 3), 5) < 0.04;
            if (du === 2 || dh === 2) {
              sh = 3; // seams
            } else if (open) {
              // an open box: the hollow behind its door, gold in it
              m = front ? M.AIR : du === 0 && dh === 0 ? GOLD : DARK;
              sh = m === GOLD ? 6 : 1;
            } else if (front) {
              m = BRASS;
              sh = du === 0 && dh === 1 ? 6 : du === 1 && dh === 0 ? 3 : 4 + ((u * 7 + h * 3) % 2);
            }
          }
          zput(v, L, z, u, w, h, m, sh);
        }
      }
    }
    zput(v, L, z, z.len - 1, w0 + 1, top - 3, BRASS, 6); // number plate
    if (k > 0) glow(v, L, z, z.len - 2, w0 + 1, top, TUBE, LAMP, 12, 0.4, fx);
  }
  // the camera, on the end of the back row
  const cu = z.len - 1;
  zput(v, L, z, cu, 1, z.tall, M.METAL, 4);
  zput(v, L, z, cu, 1, z.tall + 1, DARK, 2);
  zput(v, L, z, cu - 1, 1, z.tall + 1, DARK, 3);
  zput(v, L, z, cu - 2, 1, z.tall + 1, M.GLASS, 6);
  blink(v, L, z, cu, 1, z.tall + 2, 2.4, fx);
};

// A small status lamp that blinks slowly, at (u, w, h).
function blink(v: Voxels, L: Layout, z: Zone, u: number, w: number, h: number, period: number, fx: Fixtures): void {
  const x = zx(z, u, w);
  const y = zy(z, u, w);
  v.put(x, y, L.floor + h, AMBER, 7);
  fx.blinkers.push({ x, y, z: L.floor + h, on: AMBER, period, phase: hash3(7, x, y, h) * period, duty: 0.3, lx: 0, ly: 0, glow: false });
}

// The gold cage: a steel plinth fenced with bars, the door standing open
// on the side toward the hub, pallets of gold bars, coin sacks and a
// strongbox inside under a hanging amber lamp, a camera on the far corner
// post, and a laser post either side of the way in.
const goldCage: Builder = (v, L, z, _rng, fx) => {
  const n = z.n;
  const apron = z.dep - n;
  const c0 = z.face < 0 ? apron : 0; // the cage's first w
  const door = z.face < 0 ? c0 : c0 + n - 1; // the w of the door's side
  const mid = n >> 1;
  const H = CAGE_H;
  for (let u = 0; u < n; u++) {
    for (let w = c0; w < c0 + n; w++) {
      const edge = u === 0 || u === n - 1 || w === c0 || w === c0 + n - 1;
      zput(v, L, z, u, w, 0, M.METAL, edge ? 5 : 3);
      if (!edge) continue;
      const corner = (u === 0 || u === n - 1) && (w === c0 || w === c0 + n - 1);
      const gate = w === door && Math.abs(u - mid) <= 1;
      const bar = corner || (u + w) % 2 === 0;
      for (let h = 1; h <= H; h++) {
        if (gate && h < H - 1) continue;
        if (bar || h === H || (gate && h >= H - 1)) zput(v, L, z, u, w, h, M.METAL, corner ? 6 : h === H ? 6 : 5);
      }
      if (corner) zput(v, L, z, u, w, H + 1, M.METAL, 6);
    }
  }
  // cross bars over the top, and the lamp hung where they meet
  const cm = c0 + mid;
  for (let k = 1; k < n - 1; k++) {
    zput(v, L, z, k, cm, H, M.METAL, 5);
    zput(v, L, z, mid, c0 + k, H, M.METAL, 5);
  }
  zput(v, L, z, mid, cm, H - 1, M.METAL, 4);
  glow(v, L, z, mid, cm, H - 2, AMBER, WARM, 18, 0.75, fx);
  // the door, swung out beside the gateway
  const out = z.face < 0 ? -1 : 1;
  for (let k = 1; k <= 3; k++) {
    for (let h = 1; h < H - 1; h++) if (k === 3 || h === 1 || h === H - 2 || k === 1) zput(v, L, z, mid + 2, door + out * k, h, M.METAL, 5);
  }
  zput(v, L, z, mid - 2, door, 5, BRASS, 6); // the lock plate
  // inside: pallets of gold at the back, sacks and a strongbox at the sides
  const back = z.face < 0 ? c0 + n - 5 : c0 + 1; // the far side's first w
  for (const u0 of n > 7 ? [1, mid + 1] : [1]) {
    const nu = Math.min(4, n - 2 - u0);
    pallet(v, L, z, u0, back, 1, nu, 4);
    bars(v, L, z, u0, back, 2, nu, 4, fx);
  }
  if (n > 7) {
    const near = z.face < 0 ? c0 + n - 7 : c0 + 5;
    sack(v, L, z, 1, near);
    zput(v, L, z, n - 3, near, 1, M.METAL, 3);
    zput(v, L, z, n - 2, near, 1, M.METAL, 3);
    zput(v, L, z, n - 3, near, 2, BRASS, 5);
    zput(v, L, z, n - 2, near, 2, M.METAL, 6);
  }
  // the camera, on the far corner post
  const fw = z.face < 0 ? c0 + n - 1 : c0;
  const fu = n - 1;
  zput(v, L, z, fu, fw, H + 2, DARK, 2);
  zput(v, L, z, fu - 1, fw, H + 2, M.GLASS, 6);
  blink(v, L, z, fu, fw, H + 3, 2.8, fx);
  // the laser posts, either side of the way in
  for (const u of n > 7 ? [1, n - 2] : [0, n - 1]) laser(v, L, z, u, z.face < 0 ? 1 : c0 + n + 2);
};

// Counting tables in a row: steel frames with oxblood leather tops, gold
// bars and coin stacked on them, bundles of notes, a counting machine and
// a lamp each, the tellers' stools along the side toward the hub.
const countingTables: Builder = (v, L, z, rng, fx) => {
  const tw = z.face < 0 ? 2 : 0; // the tables' first w
  const sw = z.face < 0 ? 0 : 5; // the stools'
  const TOP = 3;
  for (let j = 0; j < z.n; j++) {
    const u0 = 7 * j;
    for (let u = u0; u < u0 + 6; u++) {
      for (let w = tw; w < tw + 4; w++) {
        const leg = (u === u0 || u === u0 + 5) && (w === tw || w === tw + 3);
        if (leg) for (let h = 0; h < TOP; h++) zput(v, L, z, u, w, h, M.METAL, 3);
        const rim = u === u0 || u === u0 + 5 || w === tw || w === tw + 3;
        zput(v, L, z, u, w, TOP, rim ? M.METAL : M.CARPET, rim ? 6 : 3);
      }
    }
    // what is on it, a different spread each table
    const back = z.face < 0 ? tw + 3 : tw; // the far edge from the tellers
    const fore = z.face < 0 ? tw + 1 : tw + 2;
    bars(v, L, z, u0 + 1, Math.min(back, fore), TOP + 1, 3, 2, fx);
    if (j % 2 === 0) {
      for (const [du, n] of [[4, 3], [5, 2]]) for (let h = 1; h <= n; h++) zput(v, L, z, u0 + du, fore, TOP + h, GOLD, h === n ? 7 : 5); // coin
      zput(v, L, z, u0 + 4, back, TOP + 1, M.PAPER, 5); // notes
      zput(v, L, z, u0 + 4, back, TOP + 2, M.PAPER, 6);
    } else {
      // the counting machine, its readout toward the camera
      for (const du of [4, 5]) for (const w of [tw + 1, tw + 2]) for (let h = 1; h <= 2; h++) zput(v, L, z, u0 + du, w, TOP + h, M.METAL, h === 2 ? 6 : 3);
      zput(v, L, z, u0 + 4, tw + 1, TOP + 3, M.PAPER, 6);
      const x = zx(z, u0 + 5, tw + 2);
      const y = zy(z, u0 + 5, tw + 2);
      v.put(x, y, L.floor + TOP + 2, AMBER, 7);
      fx.blinkers.push({ x, y, z: L.floor + TOP + 2, on: AMBER, period: rng.range(0.3, 0.6), phase: rng.range(0, 1), duty: 0.6, lx: 0, ly: 0, glow: false });
    }
    // a lamp on a brass stalk at the far corner
    const lu = j % 2 ? u0 : u0 + 5;
    for (let h = 1; h <= 3; h++) zput(v, L, z, lu, back, TOP + h, BRASS, 4);
    zput(v, L, z, lu, back, TOP + 4, M.METAL, 6);
    glow(v, L, z, lu + (j % 2 ? 1 : -1), back, TOP + 4, TUBE, WARM, 12, 0.45, fx);
    // the teller's stool
    const su = u0 + 3;
    zput(v, L, z, su, sw, 0, M.METAL, 2);
    zput(v, L, z, su, sw, 1, M.METAL, 3);
    zput(v, L, z, su, sw, 2, M.CARPET, 5);
  }
};

// A forklift with a pallet of crates up on its forks, and two more pallets
// waiting behind it.
const loading: Builder = (v, L, z, rng) => {
  // the truck, facing +u: yellow body over black wheels, an overhead
  // guard, the mast and forks in front
  for (let u = 0; u < 7; u++) {
    for (let w = 0; w < 5; w++) {
      const wheel = (u === 1 || u === 2 || u === 5) && (w === 0 || w === 4);
      if (wheel) {
        zput(v, L, z, u, w, 0, DARK, 1);
        zput(v, L, z, u, w, 1, DARK, 2);
      }
      if (w === 0 || w === 4) {
        zput(v, L, z, u, w, 2, GOLD, 5); // fenders
        continue;
      }
      for (let h = 0; h < 3; h++) zput(v, L, z, u, w, h, u === 0 ? M.METAL : GOLD, u === 0 ? 2 : h === 2 ? 5 : 4);
      if (u === 0) zput(v, L, z, u, w, 3, M.METAL, 3); // the counterweight
    }
  }
  zput(v, L, z, 2, 2, 3, DARK, 2); // the seat
  for (let w = 1; w <= 3; w++) zput(v, L, z, 1, w, 4, DARK, 3);
  zput(v, L, z, 4, 2, 3, M.METAL, 4); // the wheel
  zput(v, L, z, 4, 2, 4, DARK, 3);
  for (const [u, w] of [[1, 0], [1, 4], [5, 0], [5, 4]]) for (let h = 3; h < 8; h++) zput(v, L, z, u, w, h, M.METAL, 3);
  for (let u = 1; u <= 5; u++) for (let w = 0; w <= 4; w++) if (u === 1 || u === 5 || w === 0 || w === 4 || u === 3) zput(v, L, z, u, w, 8, M.METAL, 5);
  for (const w of [1, 3]) for (let h = 0; h < 11; h++) zput(v, L, z, 7, w, h, M.METAL, 5);
  for (let w = 1; w <= 3; w++) zput(v, L, z, 7, w, 10, M.METAL, 6);
  const lift = 2 + Math.floor(rng.range(0, 3));
  for (let w = 1; w <= 3; w++) zput(v, L, z, 7, w, lift, M.METAL, 3);
  for (const w of [1, 3]) for (let u = 8; u < 11; u++) zput(v, L, z, u, w, lift, M.METAL, 6);
  pallet(v, L, z, 8, 0, lift + 1, 4, 5);
  crate(v, L, z, 8, 0, lift + 2, 4, 5, 3);
  // the pallets behind
  for (const u0 of [2, 7]) {
    pallet(v, L, z, u0, 7, 0, 4, 4);
    if (u0 === 2) crate(v, L, z, u0, 7, 1, 4, 4, 4);
    else {
      crate(v, L, z, u0, 7, 1, 4, 2, 3);
      crate(v, L, z, u0, 9, 1, 4, 2, 2);
    }
  }
};

// Pallets in rows, two voxels of floor between: crates on most, gold
// bars on one, now and then a pallet standing empty.
const pallets: Builder = (v, L, z, rng, fx) => {
  const rows = z.dep >= 10 ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < z.n; c++) {
      const u0 = c * 6 - (z.n === 2 ? c : 0);
      const w0 = r * 6;
      const what = rng.int(0, 5);
      pallet(v, L, z, u0, w0, 0, 4, 4);
      if (what === 0) continue; // empty
      if (what === 1 && r + c > 0 && rng.chance(0.3)) {
        bars(v, L, z, u0, w0, 1, 4, 4, fx);
        continue;
      }
      const h = rng.int(3, 5);
      crate(v, L, z, u0, w0, 1, 4, 4, h);
      if (rng.chance(0.4)) crate(v, L, z, u0, w0, 1 + h, 3, 3, 2);
    }
  }
};

// A row of floor safes, each a little different in height, a camera on a
// post at the end watching them, and in front of now and then a longer row
// a laser post at either end.
const safes: Builder = (v, L, z, rng, fx) => {
  for (let k = 0; k < z.n; k++) safe(v, L, z, k * 5, 4, 6 + rng.int(0, 1));
  camera(v, L, z, z.len - 1, 1, -1, fx);
  if (z.dep > 3 && rng.chance(0.35)) for (const u of [0, 5 * z.n - 2]) laser(v, L, z, u, z.dep - 1);
};

// Cash on the move: a trolley of gold, another of notes, sacks of coin
// heaped by them.
const cash: Builder = (v, L, z, rng, fx) => {
  trolleyAt(v, L, z, 0, 0, fx, true);
  trolleyAt(v, L, z, 0, 4, fx, false);
  sack(v, L, z, 7, 0);
  sack(v, L, z, 9, 3);
  if (rng.chance(0.6)) sack(v, L, z, 7, 4);
};

// A cash trolley: a steel tray on four wheels with a push bar, gold or
// bundles of notes on it, its corner at (u0, w0).
function trolleyAt(v: Voxels, L: Layout, z: Zone, u0: number, w0: number, fx: Fixtures, gold: boolean): void {
  for (let u = 0; u < 6; u++) {
    for (let w = 0; w < 3; w++) {
      const corner = (u === 0 || u === 5) && (w === 0 || w === 2);
      if (corner) {
        zput(v, L, z, u0 + u, w0 + w, 0, DARK, 1);
        zput(v, L, z, u0 + u, w0 + w, 1, M.METAL, 3);
      }
      zput(v, L, z, u0 + u, w0 + w, 2, M.METAL, 5);
      if (u === 0 || u === 5 || w === 0 || w === 2) zput(v, L, z, u0 + u, w0 + w, 3, M.METAL, 6);
    }
  }
  for (const w of [0, 2]) for (let h = 4; h < 6; h++) zput(v, L, z, u0, w0 + w, h, M.METAL, 4);
  for (let w = 0; w < 3; w++) zput(v, L, z, u0, w0 + w, 6, M.METAL, 6);
  if (gold) bars(v, L, z, u0 + 1, w0 + 1, 3, 4, 1, fx);
  else for (let u = 1; u < 5; u++) for (let h = 3; h < 3 + (u & 1 ? 2 : 1); h++) zput(v, L, z, u0 + u, w0 + 1, h, M.PAPER, h & 1 ? 5 : 6);
}

// A cash trolley with a sack of coin beside it.
const trolley: Builder = (v, L, z, rng, fx) => {
  trolleyAt(v, L, z, 0, 0, fx, false);
  sack(v, L, z, 1 + rng.int(0, 2), 4);
};

// Coin sacks in a heap.
const sacks: Builder = (v, L, z) => {
  sack(v, L, z, 0, 0);
  sack(v, L, z, 2, 3);
};

// A security camera on a steel pole at (u, w), looking along u (`look` -1
// or +1), a slow amber light on it.
function camera(v: Voxels, L: Layout, z: Zone, u: number, w: number, look: number, fx: Fixtures): void {
  for (let h = 0; h < 12; h++) zput(v, L, z, u, w, h, M.METAL, h ? 4 : 2);
  zput(v, L, z, u, w, 12, DARK, 2);
  zput(v, L, z, u + look, w, 12, DARK, 3);
  zput(v, L, z, u + look, w, 11, M.GLASS, 6);
  zput(v, L, z, u, w, 13, M.METAL, 5);
  blink(v, L, z, u, w, 14, 2 + hash3(3, z.x0, z.y0, u), fx);
}

// A laser post: steel, a red emitter near the top.
function laser(v: Voxels, L: Layout, z: Zone, u: number, w: number): void {
  for (let h = 0; h < 7; h++) zput(v, L, z, u, w, h, h === 5 ? RED : M.METAL, h === 5 ? 3 : h === 6 ? 6 : h === 0 ? 2 : 4);
}

const ZONES: Record<Exclude<ZoneKind, 'machine'>, Builder> = { boxes: depositBoxes, cage: goldCage, counter: countingTables, loading, pallets, cash, safes, trolley, sacks };

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const fx = FIXTURES.get(c.v);
  if (!fx) return;
  const v = c.v;

  // Lamp tubes hum; the broken one stutters every few seconds.
  for (const l of fx.lamps) {
    const m = v.mat[l.cells[2]];
    if (m !== TUBE && m !== DARK) continue;
    const on = !l.broken || (c.t + l.x) % 7 > 1.3 || Math.sin(c.t * 41) * Math.sin(c.t * 17 + l.y) > 0;
    for (const i of l.cells) if (v.mat[i] === (on ? DARK : TUBE)) v.set(i, on ? TUBE : DARK, on ? 7 : 1);
    if (on) c.light({ x: l.x, y: l.y, z: l.z, color: LAMP, radius: 28, intensity: 0.8 + 0.03 * Math.sin(c.t * 50 + l.x) });
  }

  // Status lamps blink, each to its own beat.
  for (const b of fx.blinkers) {
    const on = (c.t + b.phase) % b.period < b.period * b.duty;
    lamp(v, b.x, b.y, b.z, on, b.on);
    if (on && b.glow && v.get(b.x, b.y, b.z) === b.on) c.light({ x: b.lx, y: b.ly, z: b.z + 0.5, color: STATUS[b.on]!, radius: 8, intensity: 0.4 });
  }

  // The cage lamp, the table lamps and the lamps over the boxes.
  for (const g of fx.glows) if (v.mat[g.i] === g.m) c.light({ x: g.x, y: g.y, z: g.z, color: g.color, radius: g.radius, intensity: g.intensity });

  // Gold catches the light.
  if (fx.gold.length && c.rng.chance(c.dt * 2.5)) {
    const i = fx.gold[c.rng.int(0, fx.gold.length - 1)];
    if (v.mat[i] === GOLD) c.spawn({ kind: 'glint', x: v.xOf(i) + c.rng.range(0.2, 0.8), y: v.yOf(i) + c.rng.range(0.2, 0.8), z: v.zOf(i) + 1, vx: 0, vy: 0, vz: 0.3, life: 0.5, color: GLINT, glow: true, gravity: 0 });
  }

  // Steam: vents and release valves blow off in bursts.
  for (const s of fx.vents) {
    if ((c.t + s.phase) % s.period >= s.burst) continue;
    if (c.rng.chance(c.dt * 30)) puff(c, s.x, s.y, s.z, M.STEAM, c.rng.int(30, 60));
  }

  // The pit glows and fumes, and now and then a bubble pops.
  const p = fx.pool;
  if (p) {
    c.light({ x: p.x + 0.5, y: p.y + 0.5, z: L.floor + 1, color: ACID_GLOW, radius: clamp(Math.max(p.rx, p.ry) * 2 + 10, 12, 30), intensity: 0.5 + 0.12 * Math.sin(c.t * 1.7) });
    if (c.rng.chance(c.dt * 1.4)) {
      const x = Math.round(p.x + c.rng.range(-0.6, 0.6) * p.rx);
      const y = Math.round(p.y + c.rng.range(-0.6, 0.6) * p.ry);
      puff(c, x, y, L.floor - 1, M.TOXIC, c.rng.int(80, 150));
    }
    if (c.rng.chance(c.dt * 3)) {
      const x = Math.round(p.x + c.rng.range(-0.5, 0.5) * p.rx);
      const y = Math.round(p.y + c.rng.range(-0.5, 0.5) * p.ry);
      const z = L.floor - 2;
      if (v.get(x, y, z) === M.ACID) {
        v.put(x, y, z, M.ACID, 7);
        c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: z + 1.2, vx: c.rng.range(-0.5, 0.5), vy: c.rng.range(-0.5, 0.5), vz: c.rng.range(2, 3.5), life: 0.5, color: tone(M.ACID, 7), glow: true, gravity: 20 });
      }
    }
  }
  // The channels fume through their grates.
  if (fx.grates.length && c.rng.chance(c.dt * 0.8)) {
    const [x, y, z] = fx.grates[c.rng.int(0, fx.grates.length - 1)];
    puff(c, x, y, z, M.TOXIC, c.rng.int(60, 120));
  }

  // Lamp posts light the walkways.
  for (const [x, y, z] of fx.posts) {
    if (v.get(Math.floor(x), Math.floor(y), Math.floor(z)) === TUBE) c.light({ x, y, z, color: LAMP, radius: 24, intensity: 0.7 });
  }

  // A leaky joint drips onto the floor.
  if (fx.leak && c.rng.chance(c.dt * 0.5)) {
    const [x, y, z] = fx.leak;
    c.spawn({ kind: 'drop', x, y, z, vx: 0, vy: 0, vz: 0, life: 4, color: tone(M.WATER, 6), glow: false, gravity: 30, mat: M.WATER });
  }
}

export const vault: Biome = {
  id: 'vault',
  name: 'The Vault',
  tagline: 'Deposit boxes, gold under amber lamps and acid in the pit',
  palette: PALETTE,
  backdrop: hex('#030606'),
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  build: BUILD,
  pois: (L) => floorPlan(L).floor.pois.slice(),
};

export default vault;
