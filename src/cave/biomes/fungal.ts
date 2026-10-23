import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { slotRect, slotsOn, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { fillStrata, hangers, hash3, isFlammable, isSolid, makeProps, noise2, onWall, pit, puff, roughenWalls, veins, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Prop, Slot, SlotKind, StationKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';
import type { Disc, Pt } from './floor.ts';
import { aside, by, calm, campfirePoi, disc, Floor, growth, scatter, WORN } from './floor.ts';

// Fungal Caverns: a damp hollow gone over to fungus. Purple-grey and teal
// rock under moss, groves of giant mushrooms on pale stalks, a grove that
// glows, glowing bracket fungus on the walls, pits of toxic sludge, a clear
// spring, a fairy ring, stumps to sit on, puffball vents, and spores
// drifting up through the dark. Almost all the light is the fungus's own.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#07060a'),
  wall: hex('#16111d'),
  wall2: hex('#1b1524'),
  floor: hex('#221a2b'),
  floor2: hex('#1c1524'),
  text: hex('#d6f5e3'),
  dim: hex('#76938a'),
  accent: hex('#57e0b0'),
  accent2: hex('#c27cff'),
  panel: hex('#0d0a12'),
  panelText: hex('#d6f5e3'),
  border: hex('#4a3866'),
  bubble: hex('#e3f7ec'),
  bubbleText: hex('#151019'),
  good: hex('#8ee26a'),
  warn: hex('#e8c95a'),
  bad: hex('#ff5c7c'),
};

const GRADE: Grade = { ambient: hex('#46385e'), illum: 1.1, bloom: 0.8, vignette: 0.2 };

// Rock in purple-grey and teal, plum soil, blue-green moss, mauve timber,
// verdigris fittings, plum cloth, amber wax. Obsidian (no lava here to make
// it) becomes the violet caps and the wax doubles as the orange ones, so
// the big mushrooms neither burn nor glow.
const COLORS: Partial<Record<number, string>> = {
  [M.ROCK]: '#584e6a',
  [M.ROCK_DARK]: '#2c414c',
  [M.DIRT]: '#433348',
  [M.GRAVEL]: '#544d63',
  [M.MOSS]: '#2e5e46',
  [M.WOOD]: '#5c4348',
  [M.METAL]: '#5b8a7c',
  [M.CLOTH]: '#663a78',
  [M.OBSIDIAN]: '#8a44a0',
  [M.BRICK]: '#6a6080',
  [M.CANDLE]: '#b5602e',
  [M.SLUDGE]: '#8fd12c',
};

export const FUNGAL_MATS: PropMats = {
  frame: M.WOOD,
  metal: M.METAL,
  cloth: M.CLOTH,
  stone: M.BRICK,
  stone2: M.ROCK_DARK,
  glow: M.FUNGUS,
  liquid: M.SLUDGE,
  quench: M.WATER,
  candle: M.CANDLE,
  ore: M.CRYSTAL,
  seam: M.FUNGUS,
  rubble: M.GRAVEL,
  fuel: M.COAL,
  trim: M.CRYSTAL,
  bone: M.BONE,
  books: [M.CLOTH, M.WOOD, M.BONE, M.MOSS, M.FUNGUS, M.METAL, M.BRICK],
  rune: hex('#8dffd2'),
};

const TEAL: RGB = hex('#5ff0c0'); // fungus light
const VIOLET: RGB = hex('#a77bff'); // crystal light
const LANTERN: RGB = hex('#ffb070'); // the stations' lanterns
const SLIME: RGB = hex('#9be03a'); // sludge light
const SLIME_DROP: RGB = hex('#c4f25a');
const WATER_DROP: RGB = hex('#7fc6d6');
const MOTES: readonly RGB[] = [hex('#b4ffe6'), hex('#d8ff9e'), hex('#cdb0ff'), hex('#7ff5d0')];

// Rock layers bottom to top: [material, weight, min, max thickness].
const STRATA: Strata = {
  bands: [
    [M.ROCK, 5, 3, 7],
    [M.ROCK_DARK, 4, 2, 5],
    [M.DIRT, 1, 1, 2],
  ],
  topsoil: [
    [M.DIRT, 3, 2, 4],
    [M.ROCK_DARK, 2, 1, 3],
  ],
  soilDepth: 6,
  warp: 4,
};

const ROCKY = new Set<number>([M.ROCK, M.ROCK_DARK, M.DIRT]);
const FIERY = new Set<SlotKind>(['run', 'think', 'idle']); // props that keep a flame

// How tall each prop stands (candle and campfire flames and its lantern
// included), so decor clears it and never hides it.
const PROP_TOP: Record<SlotKind, number> = { write: 10, run: 10, think: 12, idle: 11, read: 20, search: 15, web: 15, entrance: 20 };
const STAND = 14; // a wizard's height, kept clear and in view over the walkways
const POOL_TOP = 3; // the sludge pit, kept in view
const HEAT_PAD = 5; // nothing that burns this close to a prop that keeps a flame...
const HEAT_TOP = 18; // ...below this height above the floor

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── props ────────────────────────────────────────────────────────────────
// The tunnel mouth with its torch swapped for a lamp of glowing fungus on
// the same stick and cup: nothing burns by the way in.
function tunnel(base: Prop): Prop {
  const m = FUNGAL_MATS;
  // The torch cup: metal on the stick, at the far end of the frame.
  const cup = (v: Voxels, s: Slot): [number, number, number] | null => {
    const x = wx(s, s.len - 1, 0);
    const y = wy(s, s.len - 1, 0);
    for (let h = 3; h < 32; h++) if (v.get(x, y, s.z0 + h) === m.metal && v.get(x, y, s.z0 + h - 1) === m.frame) return [x, y, s.z0 + h];
    return null;
  };
  return {
    name: base.name,
    build(v, s, rng) {
      base.build(v, s, rng);
      const at = cup(v, s);
      if (!at) return;
      const [x, y, z] = at;
      v.put(x, y, z + 1, M.FUNGUS, 7);
      v.put(x, y, z + 2, M.FUNGUS, 6);
      for (const d of [-1, 1]) {
        const [cx, cy] = s.wall === 'right' ? [x + d, y] : [x, y + d];
        if (v.get(cx, cy, z + 2) === M.AIR) v.put(cx, cy, z + 2, M.FUNGUS, 4);
      }
    },
    tick(c, s) {
      const at = cup(c.v, s);
      if (!at || c.v.get(at[0], at[1], at[2] + 1) !== M.FUNGUS) return;
      const [x, y, z] = at;
      c.light({ x: x + 0.5, y: y + 0.5, z: z + 2.5, color: TEAL, radius: 18, intensity: 0.5 + 0.1 * Math.sin(c.t * 1.3 + x) });
      if (c.rng.chance(c.dt * 0.8)) mote(c, x + 0.5, y + 0.5, z + 3);
    },
  };
}

// Lit by nothing but the fungus, the wizards' robes take on the cave's teal
// and violet and they get lost in it; so every station keeps a warm lantern
// by where its agent stands: two voxels of lamp under a verdigris cap, on a
// verdigris post at a front corner of the prop or, where the prop fills its
// floor, on a board of the bookshelf or hung off the dig face's timber. A
// lamp, not a flame: nothing catches. It glows low while nobody works there
// and lights whoever does warm against the cool cave.
type Hang = { a: number; b: number; h: number; post: boolean }; // the lamp's lower voxel, in the slot's frame

const HANGS: Record<StationKind, (s: Slot) => Hang> = {
  write: (s) => ({ a: s.len - 1, b: s.dep - 1, h: 7, post: true }), // between the hammer and the bucket
  read: (s) => ({ a: s.len - 2, b: s.dep - 1, h: 11, post: false }), // on the middle board, before the books
  search: (s) => ({ a: s.len - 1, b: 2, h: 9, post: false }), // off the timber post
  run: (s) => ({ a: s.len - 1, b: s.dep - 1, h: 7, post: true }), // outside the hearth stones
  web: (s) => ({ a: s.len - 1, b: s.dep - 1, h: 7, post: true }),
  think: (s) => ({ a: s.len - 1, b: s.dep - 1, h: 7, post: true }), // before the altar's end
  idle: (s) => ({ a: s.len - 1, b: s.dep - 1, h: 7, post: true }), // clear of the fire ring
};

function lantern(base: Prop, hang: (s: Slot) => Hang): Prop {
  const m = FUNGAL_MATS;
  const at = (s: Slot): [number, number, number] => {
    const { a, b, h } = hang(s);
    return [wx(s, a, b), wy(s, a, b), s.z0 + h];
  };
  return {
    name: base.name,
    build(v, s, rng) {
      base.build(v, s, rng);
      const [x, y, z] = at(s);
      if (hang(s).post) for (let k = s.z0; k < z; k++) v.put(x, y, k, m.metal, k === z - 1 ? 6 : 2);
      v.put(x, y, z, M.LAMP, 7);
      v.put(x, y, z + 1, M.LAMP, 5);
      v.put(x, y, z + 2, m.metal, 5);
    },
    tick(c, s, active) {
      base.tick?.(c, s, active);
      const [x, y, z] = at(s);
      if (c.v.get(x, y, z) !== M.LAMP) return;
      const k = 0.94 + 0.06 * Math.sin(c.t * 2.1 + x + y);
      c.light({ x: x + 0.5, y: y + 0.5, z: z + 1, color: LANTERN, radius: 10, intensity: 0.35 * k });
      // and over the agent at work, from the feet to the hat
      if (active) c.light({ x: s.spot.x, y: s.spot.y, z: s.z0 + 6, color: LANTERN, radius: 16, intensity: 1.2 * k });
    },
  };
}

const BASE = makeProps(FUNGAL_MATS);
const lit = (k: StationKind) => lantern(BASE[k], HANGS[k]);
const PROPS: Record<SlotKind, Prop> = {
  write: lit('write'),
  read: lit('read'),
  search: lit('search'),
  run: lit('run'),
  web: lit('web'),
  think: lit('think'),
  idle: lit('idle'),
  entrance: tunnel(BASE.entrance),
};

// A mushroom house: pale stalk walls, a violet cap of a roof, glowing windows.
const BUILD: BuildStyle = { mats: [M.BONE, M.OBSIDIAN, M.FUNGUS], shape: 'house' };

// ── generate ─────────────────────────────────────────────────────────────
// What decor needs to know about the room while it grows.
type Room = {
  v: Voxels;
  L: Layout;
  free: Uint8Array; // floor cells open for decor
  hgt: Uint8Array; // per floor cell: how high above the floor must stay clear...
  seen: Uint8Array; // ...and in view
  hot: Uint8Array; // per floor cell: near a flame
  vents: Vent[];
  lamps: Lamp[];
  placed: Array<[number, number, number]>; // mushroom stalks: x, y, cap radius
};

// The air voxel over a patch of fungus (spores puff from it) and what the
// patch is made of.
type Vent = [x: number, y: number, z: number, mat: number];

// A glowing cap's or colony's light; (cx, cy, cz) is the voxel it needs
// still there, `fall` how far out round it spores sift down (0: none).
type Lamp = { x: number; y: number; z: number; r: number; color: RGB; k: number; phase: number; cx: number; cy: number; cz: number; mat: number; fall: number };

// A puffball vent: every `period` seconds it coughs up a cloud of spores.
type Burst = { x: number; y: number; z: number; period: number; phase: number };

type Scene = { vents: Vent[]; lamps: Lamp[]; pools: Site[]; bursts: Burst[]; spring: Site | null };

// Per generated world, for weather(); a world generated elsewhere is
// surveyed on first use.
const SCENES = new WeakMap<Voxels, Scene>();

// ── plan ─────────────────────────────────────────────────────────────────
// Where everything the characters visit goes, from the layout alone (so
// pois() agrees with generate()): the sludge pit a slime lives by, the glow
// grove, the spring, the glade of stumps, the fairy ring; and the groves of
// giant mushrooms and the smaller sludge pools in between.
type Plan = {
  floor: Floor;
  pool: Disc | null;
  pools: Disc[];
  spring: Disc | null;
  glow: Disc | null;
  glade: Disc | null;
  ring: Disc | null;
  groves: Disc[];
};

const PLANS = new WeakMap<Layout, Plan>();

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W } = L;
  const f = new Floor(L, 'fungal');
  const g = growth(L);
  const hub = f.hub;
  const pr = clamp(Math.round(W * 0.07), 5, 10);
  const pool = f.place(Math.round(pr * 1.6), f.at(0.92, 0.62), { min: 7, pois: (s) => [by(s, 'pet', 2, hub)] });
  const span = L.H - L.floor;
  // A giant's crown must not hide the work area, a plaza or a POI.
  const open = (s: Disc, tall: number) => !f.hides(s.x, s.y, s.r * 0.6, tall) && !corner(s);
  // The back corner is the corner giant's.
  const corner = (s: Disc) => Math.hypot(s.x - L.T, s.y - L.T) < s.r + 24;
  const glow = f.place(Math.round(8 + 6 * g), f.at(0.86, 0.9), { min: 6, spread: 20, tall: span * 0.5, ok: (s) => open(s, span * 0.5), pois: (s) => [aside(s, 'view', 5, hub)] });
  const spring = f.place(Math.round(4 + 2 * g), f.at(0.6, 0.93), { min: 4, pois: (s) => [by(s, 'drink', 1, hub)] });
  const glade = f.place(Math.round(4 + 2 * g), f.at(0.25, 0.95), { min: 4, inside: true, pois: (s) => [{ x: Math.round(s.x), y: Math.round(s.y), kind: 'seat', face: { x: Math.round(hub.x), y: Math.round(hub.y) } }] });
  const ring = f.place(Math.round(4 + 2 * g), f.at(0.72, 0.74), { min: 4, inside: true, pois: (s) => [{ x: Math.round(s.x), y: Math.round(s.y), kind: 'dance' }] });
  // Too small a cave for much: warm up by the campfire too.
  const warm = f.pois.length < 4 ? campfirePoi(L) : null;
  if (warm && f.reachable(warm, null)) f.addPoi(warm);
  const groves: Disc[] = [];
  for (const [fx, fy] of [[0.97, 0.35], [0.4, 0.97], [0.97, 0.97], [0.78, 0.55]].slice(0, Math.round(1 + 3 * g))) {
    const d = f.place(Math.round(6 + 6 * g), f.at(fx, fy), { min: 5, spread: 20, tall: span * 0.42, ok: (s) => open(s, span * 0.42) });
    if (d) groves.push(d);
  }
  const pools: Disc[] = [];
  for (let k = Math.round(1 + 2 * g); k > 0; k--) {
    const d = f.place(f.rng.range(4, 6 + g), f.at(f.rng.range(0.3, 0.95), f.rng.range(0.3, 0.95)), { min: 4, spread: 40, ok: (s) => !corner(s) });
    if (d) pools.push(d);
  }
  const P: Plan = { floor: f, pool, pools, spring, glow, glade, ring, groves };
  PLANS.set(L, P);
  return P;
}

// A disc site as the ellipse of a pit, its rim inside the disc.
function pond(d: Disc, flat: number): Site {
  const rx = Math.max(2, d.r / 1.6);
  return { x: Math.round(d.x), y: Math.round(d.y), rx, ry: Math.max(2, rx * flat) };
}

function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, floor } = L;
  clear(v);
  const P = plan(L);
  const keep = P.floor.keep;
  const sludge = [P.pool, ...P.pools].filter((d): d is Disc => d !== null).map((d, k) => pond(d, k ? rng.range(0.6, 1) : 0.7));
  const spring = P.spring ? pond(P.spring, 0.8) : null;

  // Floor for decor, and for mushrooms the groves too.
  const free = P.floor.free(1);
  const grows = free.slice();
  for (const d of [P.glow, ...P.groves]) if (d) disc(grows, L, d.x, d.y, d.r);
  for (let i = 0; i < W * D; i++) if (P.floor.paths[i]) grows[i] = 0;
  const hot = heatMap(L);
  const mounds = new Uint8Array(W * D);
  const top = columnTops(L, rng, free, mounds);
  fillStrata(v, L, rng, STRATA, top);
  carpet(v, L, rng, top, free, hot, mounds, P.floor.trails);
  veins(v, L, rng, M.CRYSTAL, Math.round((W * D) / 1400), (m) => ROCKY.has(m));
  veins(v, L, rng, M.FUNGUS, Math.round((W * D) / 3000), (m) => ROCKY.has(m), [3, 7]);
  roughenWalls(v, L, rng);
  overgrow(v, L, rng, hot);

  for (const s of sludge) {
    pit(v, L, s, Math.min(4, floor - 2), M.SLUDGE);
    rim(v, L, rng, s, hot);
  }
  if (spring) wellspring(v, L, rng, spring, P.floor.hub);

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  const [hgt, seen] = clearance(L, keep, P.floor.paths, spring ? [...sludge, spring] : sludge, P.floor.pois);
  const R: Room = { v, L, free: grows, hgt, seen, hot, vents: [], lamps: [], placed: [] };
  if (P.glade) glade(R, rng, P.glade);
  if (P.ring) fairyRing(R, rng, P.ring);
  mushrooms(R, rng, P);
  colonies(R, rng);
  hangers(v, L, rng, M.MOSS, M.MOSS, Math.round((W + D) / 10), floor + PROP_TOP.read + 2);
  strands(R, rng);
  R.free = free;
  lumps(R, rng);
  waymarks(R, rng, P.floor);
  mycelium(v, L, rng, hot);
  const bursts = puffballs(R, rng);
  SCENES.set(v, { vents: R.vents, lamps: R.lamps, pools: sludge, bursts, spring });
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Floor cells (walls included) near a prop that keeps a flame.
function heatMap(L: Layout): Uint8Array {
  const { W, D } = L;
  const hot = new Uint8Array(W * D);
  for (const s of L.slots) {
    if (!FIERY.has(s.kind)) continue;
    const r = slotRect(s);
    for (let y = Math.max(0, r.y0 - HEAT_PAD); y < Math.min(D, r.y1 + HEAT_PAD); y++) {
      for (let x = Math.max(0, r.x0 - HEAT_PAD); x < Math.min(W, r.x1 + HEAT_PAD); x++) hot[x + W * y] = 1;
    }
  }
  return hot;
}

// Per floor cell, how high above the floor things there stand: `hgt` for
// clearance (each prop padded a voxel, the walkways and spots to a
// wizard's height), `seen` for what must stay in view (the same, but each
// prop's own footprint only, and of the walkways out in the open only the
// POIs at their ends).
function clearance(L: Layout, keep: Uint8Array, paths: Uint8Array, pools: readonly Site[], pois: readonly Pt[]): [hgt: Uint8Array, seen: Uint8Array] {
  const { W, D } = L;
  const hgt = new Uint8Array(W * D);
  const seen = new Uint8Array(W * D);
  for (let i = 0; i < W * D; i++) {
    if (keep[i]) hgt[i] = seen[i] = STAND;
    else if (paths[i]) hgt[i] = STAND;
  }
  const rect = (s: Slot, pad: number, f: (c: number) => void) => {
    const r = slotRect(s);
    for (let y = Math.max(0, r.y0 - pad); y < Math.min(D, r.y1 + pad); y++) {
      for (let x = Math.max(0, r.x0 - pad); x < Math.min(W, r.x1 + pad); x++) f(x + W * y);
    }
  };
  for (const s of L.slots) {
    rect(s, 1, (c) => {
      hgt[c] = PROP_TOP[s.kind];
      seen[c] = 0;
    });
  }
  for (const s of L.slots) rect(s, 0, (c) => (seen[c] = PROP_TOP[s.kind]));
  const stand = (sx: number, sy: number, r: number) => {
    for (let y = Math.max(0, Math.floor(sy - r)); y <= Math.min(D - 1, Math.ceil(sy + r)); y++) {
      for (let x = Math.max(0, Math.floor(sx - r)); x <= Math.min(W - 1, Math.ceil(sx + r)); x++) {
        if ((x - sx) ** 2 + (y - sy) ** 2 > r * r) continue;
        hgt[x + W * y] = Math.max(hgt[x + W * y], STAND);
        seen[x + W * y] = Math.max(seen[x + W * y], STAND);
      }
    }
  };
  for (const s of L.slots) stand(s.spot.x, s.spot.y, 4);
  for (const p of pois) stand(p.x, p.y, 2.5);
  for (const pool of pools) {
    for (let y = Math.floor(pool.y - pool.ry - 2); y <= Math.ceil(pool.y + pool.ry + 2); y++) {
      for (let x = Math.floor(pool.x - pool.rx - 2); x <= Math.ceil(pool.x + pool.rx + 2); x++) {
        if (x < 0 || y < 0 || x >= W || y >= D || ((x - pool.x) / (pool.rx + 1)) ** 2 + ((y - pool.y) / (pool.ry + 1)) ** 2 > 1) continue;
        hgt[x + W * y] = Math.max(hgt[x + W * y], POOL_TOP);
        seen[x + W * y] = Math.max(seen[x + W * y], POOL_TOP);
      }
    }
  }
  return [hgt, seen];
}

// Something that burns may go at (x, y, z).
function cool(R: Room, x: number, y: number, z: number): boolean {
  const { W, D, floor } = R.L;
  if (z >= floor + HEAT_TOP || x < 0 || y < 0 || x >= W || y >= D) return true;
  return R.hot[x + W * y] === 0;
}

// (x, y, z) is in the wall slab, or above whatever stands on that floor cell.
function unclaimed(R: Room, x: number, y: number, z: number): boolean {
  const { W, T, floor } = R.L;
  return x < T || y < T || z > floor + R.hgt[x + W * y];
}

// Decor of material m may fill the air at (x, y, z): clear over whatever
// stands below, nothing that burns near a flame, and never in front of a
// prop or a walkway as the camera sees it (along the view ray, -1 -1 -1).
function room(R: Room, x: number, y: number, z: number, m: number): boolean {
  const { L, hgt, seen } = R;
  const { W, T, floor } = L;
  if (isFlammable(m) && !cool(R, x, y, z)) return false;
  if (x < T || y < T) return true;
  const h = hgt[x + W * y];
  if (h && z <= floor + h) return false;
  for (let k = Math.max(1, z - floor - STAND); k <= z - floor; k++) {
    const px = x - k;
    const py = y - k;
    if (px < T || py < T) break;
    const ph = seen[px + W * py];
    if (ph && z - k < floor + ph) return false;
  }
  return true;
}

// Wall rock, as roughenWalls leaves it bulging out of the faces.
const WALLISH = new Set<number>([...ROCKY, M.MOSS, M.FUNGUS, M.CRYSTAL]);

// Height of the rock in every column: the walls to H (a ragged voxel off
// the top here and there), the floor to `floor`, with a mossy lip rising
// along the front cuts, hummocks and low mounds on free floor.
function columnTops(L: Layout, rng: Rng, free: Uint8Array, mounds: Uint8Array): Uint8Array {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  const grow = growth(L);
  const band = 5 + Math.round(grow * 8);
  const lip = 3 + grow * 5;
  const cells: number[] = [];
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      const c = x + W * y;
      if (x < T || y < T) {
        top[c] = H - (noise2(seed, x * 0.3, y * 0.3) > 0.8 ? 1 : 0);
        continue;
      }
      let h = floor;
      if (free[c]) {
        cells.push(c);
        const edge = Math.min(W - 1 - x, D - 1 - y);
        if (edge < band) h += Math.max(0, Math.round((noise2(seed + 1, x * 0.09, y * 0.09) * 1.4 - 0.4) * lip * (1 - edge / band) ** 2));
        const b = noise2(seed + 2, x * 0.3, y * 0.3);
        if (b > 0.7) h++;
        if (b > 0.86) h++;
      }
      top[c] = h;
    }
  }
  // Hummocks, and broad mounds of moss.
  for (let k = Math.round(cells.length / 160); k > 0 && cells.length; k--) {
    const c0 = cells[rng.int(0, cells.length - 1)];
    const cx = c0 % W;
    const cy = (c0 - cx) / W;
    const big = rng.chance(0.4);
    const r = big ? rng.range(3.5, 4.5 + 4 * grow) : rng.range(1.8, 3.5 + 2 * grow);
    const tall = big ? rng.int(3, 4 + Math.round(4 * grow)) : rng.int(2, 3 + Math.round(2 * grow));
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const c = x + W * y;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1 || x < T || y < T || x >= W || y >= D || !free[c]) continue;
        top[c] = Math.max(top[c], floor + Math.round(tall * Math.sqrt(1 - d * d) * (0.8 + 0.4 * noise2(seed + 3, x * 0.4, y * 0.4))));
        if (big) mounds[c] = 1;
      }
    }
  }
  return top;
}

// The floor's top voxel, in calm broad shades: plum soil with dark rock
// showing through, worn pale along the walkways, and on open floor (never
// by a fire) carpets and tufts of moss.
function carpet(v: Voxels, L: Layout, rng: Rng, top: Uint8Array, free: Uint8Array, hot: Uint8Array, mounds: Uint8Array, trails: Uint8Array): void {
  const { W, D, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      const z = top[c] - 1;
      const g = noise2(seed + 1, x * 0.35, y * 0.35);
      const n = noise2(seed, x * 0.11, y * 0.11) * 0.75 + g * 0.25 + (mounds[c] ? 0.25 : 0);
      const warm = hot[c] === 1;
      if (trails[c] && z === floor - 1 && !warm) {
        v.put(x, y, z, M.DIRT, WORN); // worn smooth and pale
        continue;
      }
      const mossy = free[c] && !warm && n > 0.64;
      const m = mossy ? M.MOSS : g < 0.2 ? M.ROCK_DARK : M.DIRT;
      v.put(x, y, z, m, calm(seed + 2, x, y) + (mossy && mounds[c] ? 1 : 0));
      if (n > 0.3) v.put(x, y, z - 1, M.DIRT);
      if (!free[c] || warm) continue;
      if (m === M.MOSS && n > 0.78 && g > 0.5) v.put(x, y, z + 1, M.MOSS, rng.int(4, 6));
    }
  }
}

// Moss creeping up the inner wall faces from the floor; spares the wall
// behind each prop up to its top, and everything near a flame.
function overgrow(v: Voxels, L: Layout, rng: Rng, hot: Uint8Array): void {
  const { W, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? L.D : W;
    const spans = slotsOn(L, wall).map((s) => {
      const a0 = wall === 'left' ? s.y0 : s.x0;
      return [a0 - 3, a0 + s.len + 3, floor + PROP_TOP[s.kind] + 2] as const;
    });
    for (let a = T; a < end; a++) {
      const creep = floor + 2 + Math.round(noise2(seed + 1, a * 0.08, 0.5) * 10);
      for (let z = floor; z < creep; z++) {
        if (spans.some(([a0, a1, h]) => a >= a0 && a < a1 && z < h)) continue;
        if (noise2(seed + (wall === 'left' ? 0 : 5), a * 0.16, z * 0.2) <= 0.3) continue;
        // The face: the first solid voxel in from the room.
        for (let o = 1; o >= -3; o--) {
          const [x, y] = onWall(L, wall, a, o);
          if (!isSolid(v.get(x, y, z))) continue;
          if (z < floor + HEAT_TOP && hot[x + W * y]) break;
          v.put(x, y, z, M.MOSS);
          break;
        }
      }
    }
  }
}

// A dark crust round the pit (no loose grains to slide in), studded with
// moss and glowing fungus.
function rim(v: Voxels, L: Layout, rng: Rng, s: Site, hot: Uint8Array): void {
  const z = L.floor - 1;
  for (let y = Math.floor(s.y - s.ry - 3); y <= Math.ceil(s.y + s.ry + 3); y++) {
    for (let x = Math.floor(s.x - s.rx - 3); x <= Math.ceil(s.x + s.rx + 3); x++) {
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e <= 1 || e > 2.4) continue;
      v.put(x, y, z, M.ROCK_DARK, e < 1.5 ? 0 : 2);
      if (e < 1.8 && !hot[x + L.W * y] && rng.chance(0.35) && v.get(x, y, z + 1) === M.AIR) v.put(x, y, z + 1, rng.chance(0.6) ? M.FUNGUS : M.MOSS, rng.int(3, 7));
    }
  }
}

// ── mushrooms ────────────────────────────────────────────────────────────
type Shroom = {
  x: number; // the stalk's foot, centre (voxel units)
  y: number;
  z: number; // first air above the ground there
  tall: number; // stalk height; the cap sits on top
  stem: number; // stalk radius
  lx: number; // how far the stalk leans by its top
  ly: number;
  r: number; // cap radius
  dome: number; // how far the cap rises over its root
  droop: number; // how far its rim hangs below it
  cap: number;
  dots: number; // spots on the cap (0: none)
  seed: number;
};

const STALK = M.BONE;
const AMBER = M.CANDLE; // orange caps
const PURPLE = M.OBSIDIAN; // violet caps

function sprout(rng: Rng, x: number, y: number, z: number, tall: number, stem: number, r: number, cap: number, dots = 0): Shroom {
  const a = rng.range(0, Math.PI * 2);
  const lean = rng.range(0, tall * 0.1);
  return { x, y, z, tall, stem, lx: Math.cos(a) * lean, ly: Math.sin(a) * lean, r, dome: r * 0.4, droop: r * 0.3, cap, dots, seed: rng.int(0, 0x3fffffff) };
}

// Visits every voxel of a mushroom with its material and shade, the stalk
// first; stops (false) as soon as `f` says no.
function eachVoxel(s: Shroom, f: (x: number, y: number, z: number, m: number, shade: number) => boolean): boolean {
  for (let h = -2; h < s.tall; h++) {
    const t = Math.max(0, h) / s.tall;
    const r = s.stem * (1 - 0.15 * t) + (h < 3 ? s.stem * 0.6 * (1 - Math.max(0, h) / 3) ** 2 : 0);
    const ox = s.x + s.lx * t * t;
    const oy = s.y + s.ly * t * t;
    for (let y = Math.floor(oy - r); y <= Math.ceil(oy + r); y++) {
      for (let x = Math.floor(ox - r); x <= Math.ceil(ox + r); x++) {
        const dx = x + 0.5 - ox;
        const dy = y + 0.5 - oy;
        if (dx * dx + dy * dy > r * r) continue;
        const shade = 2 + Math.min(4, Math.round(((dx + dy) / (r + 0.5) + 1) * 1.6 + hash3(s.seed, x, y, h) * 1.4));
        if (!f(x, y, s.z + h, STALK, shade)) return false;
      }
    }
  }
  const cx = s.x + s.lx;
  const cy = s.y + s.ly;
  const zc = s.z + s.tall;
  for (let y = Math.floor(cy - s.r); y <= Math.ceil(cy + s.r); y++) {
    for (let x = Math.floor(cx - s.r); x <= Math.ceil(cx + s.r); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / s.r;
      if (d > 1) continue;
      const zb = zc - Math.round(s.droop * d * d);
      const zt = zc + Math.round(s.dome * Math.sqrt(1 - d * d));
      for (let z = zb; z <= zt; z++) {
        let m = s.cap;
        let shade = z === zt ? (d < 0.55 ? 6 : 5) : d > 0.8 ? 2 : 3;
        if (z === zt && s.dots && d < 0.9 && hash3(s.seed, x, y, 1) < 0.14) {
          m = s.dots;
          shade = 7;
        }
        if (!f(x, y, z, m, shade)) return false;
      }
    }
  }
  return true;
}

// True if the mushroom can grow here: in the world, into air only (or the
// wall slab, or the ground under its foot), its stalk on free floor, clear
// over props and walkways, nothing that burns near a flame, and never in
// front of a prop or a walkway as the camera sees it.
function fits(R: Room, s: Shroom): boolean {
  const { v, L, free } = R;
  const { W, D, H, T } = L;
  return eachVoxel(s, (x, y, z, m) => {
    if (x < 0 || y < 0 || z < 0 || x >= W || y >= D || z >= H) return false;
    if (x < T || y < T) return true;
    const here = v.get(x, y, z);
    if (here !== M.AIR) return (m === STALK && z < s.z + 2) || ((x < T + 2 || y < T + 2) && WALLISH.has(here));
    if (m === STALK && !free[x + W * y]) return false;
    return room(R, x, y, z, m);
  });
}

// Size steps tried when a mushroom does not fit: [cap and stalk, height].
const SCALES: ReadonlyArray<readonly [number, number]> = [[1, 1], [0.8, 1], [0.65, 0.9], [0.5, 0.8], [0.4, 0.7]];

// Glowing fungus burns (slowly); crystal glows and does not.
const fireproof = (m: number) => (m === M.FUNGUS ? M.CRYSTAL : m);

// Grows the biggest version of `s` that fits, in crystal instead of fungus
// if that is what it takes near a flame. False if none does.
function plant(R: Room, s: Shroom, gap = 0.75): boolean {
  const { W, D, T } = R.L;
  if (s.x < T || s.y < T || s.x >= W || s.y >= D) return false;
  if (R.placed.some(([x, y, r]) => Math.hypot(x - s.x, y - s.y) < (r + s.r) * gap + 1)) return false;
  for (const [kr, kt] of SCALES) {
    const looks = [[s.cap, s.dots]];
    if (isFlammable(s.cap) || isFlammable(s.dots)) looks.push([fireproof(s.cap), fireproof(s.dots)]);
    for (const [cap, dots] of looks) {
      const r = s.r * kr;
      const t: Shroom = {
        ...s,
        r,
        stem: Math.max(0.75, s.stem * (0.6 + 0.4 * kr)),
        tall: Math.max(1, Math.round(s.tall * kt)),
        dome: r * 0.4,
        droop: r * 0.3,
        cap,
        dots,
      };
      if (!fits(R, t)) continue;
      grow(R, t);
      return true;
    }
  }
  return false;
}

function grow(R: Room, s: Shroom): void {
  const { v } = R;
  eachVoxel(s, (x, y, z, m, shade) => {
    if (v.get(x, y, z) === M.AIR) v.put(x, y, z, m, shade);
    return true;
  });
  R.placed.push([s.x, s.y, s.r]);
  const cx = Math.floor(s.x + s.lx);
  const cy = Math.floor(s.y + s.ly);
  const zt = s.z + s.tall + Math.round(s.dome);
  R.vents.push([cx, cy, zt + 1, v.get(cx, cy, zt)]);
  const glow = s.cap === M.FUNGUS || s.dots === M.FUNGUS ? TEAL : s.cap === M.CRYSTAL || s.dots === M.CRYSTAL ? VIOLET : null;
  if (glow && s.r >= 3.5) {
    const k = s.cap === M.FUNGUS || s.cap === M.CRYSTAL ? 0.45 : 0.4;
    R.lamps.push({ x: cx + 0.5, y: cy + 0.5, z: zt + 1, r: clamp(s.r * 2.4 + 8, 10, 38), color: glow, k, phase: s.seed % 7, cx, cy, cz: zt, mat: v.get(cx, cy, zt), fall: s.r });
  }
}

// Where mushrooms grow: a giant in the back corner, one at the far end of
// each wall, tall ones in the gaps between the low props of the right wall
// (capped above them), squat broad ones on the open floor in front, and
// clusters of small glowing ones round their feet. The big caps are violet
// with glowing freckles (crystal ones by a flame) or orange; the glow is
// mostly underfoot.
function mushrooms(R: Room, rng: Rng, P: Plan): void {
  const { v, L, free } = R;
  const { W, D, H, T, floor } = L;
  const span = H - floor;
  const grow = growth(L);
  const ground = (x: number, y: number) => v.ground(Math.floor(x), Math.floor(y), floor + 6);
  const big = () => (rng.chance(0.7) ? PURPLE : AMBER);
  const freckles = (cap: number) => (cap === PURPLE ? M.FUNGUS : cap === AMBER ? M.BONE : 0);

  {
    const c = T + 2.5 + grow;
    plant(R, sprout(rng, c, c, ground(c, c), Math.round(span * 0.58), 2 + grow, 8 + 7 * grow, PURPLE, M.CRYSTAL));
  }

  const glowEnd = rng.chance(0.5) ? 'left' : 'right'; // one wall end grows a glowing giant
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    const along = (s: Slot) => (wall === 'left' ? s.y0 : s.x0);
    const mine = slotsOn(L, wall);
    for (const [a0, a1] of wallGaps(L, wall)) {
      if (a0 === T || a1 - a0 < 5) continue;
      if (a1 === end) {
        // by the front cut, clear of the prop beside it, capped over any flame
        const r = 4.5 + 3 * grow + rng.range(0, 1);
        const a = clamp(a1 - 2 - r * 0.85, (a0 + a1) / 2, a1 - 3);
        const [x, y] = onWall(L, wall, a, 1.5 + 0.5 * grow);
        const cap = wall === glowEnd ? M.FUNGUS : PURPLE;
        const tall = Math.max(Math.round(span * rng.range(0.38, 0.5)), HEAT_TOP + Math.round(r * 0.3) + 2);
        plant(R, sprout(rng, x, y, ground(x, y), tall, 1.4 + 0.6 * grow, r, cap, freckles(cap)));
        continue;
      }
      if (wall === 'left' || !rng.chance(0.75)) continue;
      const tops = mine.filter((s) => along(s) + s.len === a0 || along(s) === a1).map((s) => PROP_TOP[s.kind]);
      const [x, y] = onWall(L, wall, (a0 + a1) / 2, 1.5);
      const r = 4 + 2 * grow + rng.range(0, 1.5);
      const tall = Math.max(...tops, HEAT_TOP) + 2 + Math.round(r * 0.3) + rng.int(0, 3);
      plant(R, sprout(rng, x, y, ground(x, y), tall, 1.4, r, PURPLE, M.FUNGUS), 0.5);
    }
  }

  // The groves: a giant in the middle, smaller giants round it. The glow
  // grove's caps glow (crystal by a flame).
  for (const d of [P.glow, ...P.groves]) {
    if (!d) continue;
    const glowing = d === P.glow;
    const cap0 = glowing ? M.FUNGUS : big();
    const g = sprout(rng, Math.round(d.x) + 0.5, Math.round(d.y) + 0.5, ground(d.x, d.y), Math.round(span * (glowing ? 0.48 : 0.4) * rng.range(0.85, 1.1)), 1.6 + 0.8 * grow, d.r * 0.55, cap0, glowing ? M.CRYSTAL : freckles(cap0));
    plant(R, g, 0.5);
    const n = rng.int(3, 4 + Math.round(2 * grow));
    const a0 = rng.range(0, Math.PI * 2);
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
      const dd = d.r * rng.range(0.6, 0.85);
      const x = Math.floor(d.x + Math.cos(a) * dd) + 0.5;
      const y = Math.floor(d.y + Math.sin(a) * dd) + 0.5;
      const cap = glowing ? (rng.chance(0.75) ? M.FUNGUS : M.CRYSTAL) : big();
      plant(R, sprout(rng, x, y, ground(x, y), Math.round(span * rng.range(0.14, 0.3)), rng.range(1.1, 1.6 + 0.4 * grow), rng.range(2.8, 3.6 + 2 * grow), cap, glowing ? 0 : freckles(cap)), 0.45);
    }
  }

  const cell = (tries: number) => {
    let best: readonly [number, number] | null = null;
    for (let k = 0, got = 0; k < 40 && got < tries; k++) {
      const x = rng.int(T + 2, W - 3);
      const y = rng.int(T + 2, D - 3);
      if (!free[x + W * y]) continue;
      got++;
      if (!best || x + y > best[0] + best[1]) best = [x + 0.5, y + 0.5];
    }
    return best;
  };
  for (let n = Math.round(1 + (W * D) / 1300), k = 0; n > 0 && k < 160; k++) {
    const at = cell(3);
    if (!at) break;
    const [x, y] = at;
    const cap = big();
    const s = sprout(rng, x, y, ground(x, y), Math.round(rng.int(4, 8) * (1 + 0.5 * grow)), rng.range(1.3, 2), rng.range(3.5, 5.5) * (1 + 0.35 * grow), cap, freckles(cap));
    if (plant(R, s)) n--;
  }

  // Undergrowth: little glowing ones, mostly round the feet of the big ones.
  const bigs = R.placed.slice();
  for (let n = Math.round((W * D) / 550); n > 0; n--) {
    let at: readonly [number, number] | null;
    if (bigs.length && rng.chance(0.5)) {
      const [bx, by, br] = rng.pick(bigs);
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2.5, 3 + br * 0.6);
      at = [Math.floor(bx + Math.cos(a) * d) + 0.5, Math.floor(by + Math.sin(a) * d) + 0.5];
    } else {
      at = cell(1);
    }
    if (!at) continue;
    const cap = rng.pick([M.FUNGUS, M.FUNGUS, M.CRYSTAL, PURPLE]);
    for (let j = rng.int(2, 4); j > 0; j--) {
      const x = Math.floor(at[0] + rng.range(-2.5, 2.5)) + 0.5;
      const y = Math.floor(at[1] + rng.range(-2.5, 2.5)) + 0.5;
      plant(R, sprout(rng, x, y, ground(x, y), rng.int(1, 4), 0.75, rng.range(1, 2.2), cap, cap === PURPLE ? M.FUNGUS : 0), 0.4);
    }
  }
}

// ── wall growth ──────────────────────────────────────────────────────────
// Colonies on the wall faces, spaced along each wall the way torches would
// be: a few shelves of bracket fungus with glowing patches round them and
// a soft light, so the rock reads between them. Most glow teal, some are
// violet crystal; now and then one is violet or orange shelf fungus that
// does not glow.
function colonies(R: Room, rng: Rng): void {
  const { v, L } = R;
  const { W, D, H, T, floor } = L;
  const grow = clamp((W - 72) / 98, 0, 1);
  const seed = rng.int(0, 0x3fffffff);
  const step = 15 + 5 * grow;
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    for (let at = T + rng.range(3, step * 0.6); at < end - 4; at += step * rng.range(0.8, 1.2)) {
      const a = Math.round(at);
      const mat = rng.chance(0.82) ? (rng.chance(0.3) ? M.CRYSTAL : M.FUNGUS) : rng.pick([PURPLE, AMBER]);
      const ra = rng.range(2.5, 4 + 2 * grow);
      const rz = rng.range(2, 3 + 1.5 * grow);
      let z = 0;
      let root: [number, number, number] | null = null;
      for (let tries = 0; tries < 4 && !root; tries++) {
        z = rng.int(floor + 5, H - 6);
        for (let j = rng.int(1, 3); j > 0; j--) {
          const sa = Math.round(a + rng.range(-ra, ra) * 0.7);
          const sz = Math.round(z + rng.range(-rz, rz) * 0.8);
          const half = rng.range(1.8, 3 + 1.5 * grow);
          const out = half * rng.range(0.6, 0.85);
          if (!shelf(R, wall, sa, sz, half, out, mat, false)) continue;
          shelf(R, wall, sa, sz, half, out, mat, true);
          if (!root) root = [...onWall(L, wall, sa, 0), sz];
        }
      }
      if (!root || (mat !== M.FUNGUS && mat !== M.CRYSTAL)) continue;
      for (let dz = -Math.ceil(rz); dz <= Math.ceil(rz); dz++) {
        for (let da = -Math.ceil(ra); da <= Math.ceil(ra); da++) {
          const e = (da / ra) ** 2 + (dz / rz) ** 2;
          if (e > 1 || noise2(seed, (a + da) * 0.45, (z + dz) * 0.45) * (1.2 - e) < 0.45) continue;
          for (let o = 1; o >= -3; o--) {
            const [x, y] = onWall(L, wall, a + da, o);
            const here = v.get(x, y, z + dz);
            if (here === M.AIR) continue;
            if (WALLISH.has(here) && unclaimed(R, x, y, z + dz) && (mat === M.CRYSTAL || cool(R, x, y, z + dz))) v.put(x, y, z + dz, mat, 3 + Math.round((1 - e) * 4));
            break;
          }
        }
      }
      const [lx, ly] = onWall(L, wall, a, 2);
      const [cx, cy, cz] = root;
      R.lamps.push({ x: lx + 0.5, y: ly + 0.5, z: z + 1, r: Math.round(20 + 8 * grow), color: mat === M.CRYSTAL ? VIOLET : TEAL, k: 0.38, phase: a % 7, cx, cy, cz, mat, fall: 0 });
    }
  }
}

// One shelf at `along` a wall, height z, rooted two voxels into the face;
// checks (build false) or grows it. It may only displace wall rock.
function shelf(R: Room, wall: 'left' | 'right', along: number, z: number, half: number, out: number, mat: number, build: boolean): boolean {
  const { v, L } = R;
  const { W, D, H } = L;
  for (let da = -Math.ceil(half); da <= Math.ceil(half); da++) {
    const t = da / half;
    if (t * t > 1) continue;
    const reach = Math.round(out * Math.sqrt(1 - t * t));
    for (let o = -2; o <= reach; o++) {
      const thick = o < reach * 0.5 ? 2 : 1;
      const [x, y] = onWall(L, wall, along + da, o);
      for (let dz = 0; dz < thick; dz++) {
        const zz = z + dz;
        if (x < 0 || y < 0 || x >= W || y >= D || zz >= H) return false;
        const here = v.get(x, y, zz);
        if (here !== M.AIR && (!WALLISH.has(here) || !unclaimed(R, x, y, zz))) return false;
        if (here !== M.AIR ? isFlammable(mat) && !cool(R, x, y, zz) : !room(R, x, y, zz, mat)) return false;
        if (build) v.put(x, y, zz, mat, dz === thick - 1 ? (o === reach ? 5 : 6) : 3);
      }
    }
  }
  if (build) {
    const [x, y] = onWall(L, wall, along, 0);
    R.vents.push([x, y, z + 2, mat]);
  }
  return true;
}

// Moss strands hanging from the top of the wall faces, a few ending in a
// glowing bead of fungus.
function strands(R: Room, rng: Rng): void {
  const { v, L } = R;
  const { W, D, H, T, floor } = L;
  for (let n = Math.round((W + D) / 6); n > 0; n--) {
    const wall = rng.chance(0.5) ? 'left' : 'right';
    let a = rng.int(T + 1, (wall === 'left' ? D : W) - 2);
    const len = rng.int(3, 6 + Math.round((H - floor) * 0.3));
    let z = H - 1;
    let last: [number, number, number] | null = null;
    for (let i = 0; i < len; i++, z--) {
      const [x, y] = onWall(L, wall, a, 0);
      if (v.get(x, y, z) !== M.AIR || !room(R, x, y, z, M.FUNGUS)) break;
      v.put(x, y, z, M.MOSS, rng.int(0, 3));
      last = [x, y, z];
      if (rng.chance(0.15)) a += rng.chance(0.5) ? 1 : -1;
    }
    if (last && rng.chance(0.3)) {
      const [x, y, zz] = last;
      v.put(x, y, zz, M.FUNGUS, 7);
    }
  }
}

// Glowing lumps of fungus on the open floor, mostly by a mushroom's foot.
function lumps(R: Room, rng: Rng): void {
  const { v, L, free } = R;
  const { W, D, T, floor } = L;
  const bigs = R.placed.filter(([, , r]) => r >= 3);
  for (let n = Math.round((W * D) / 750); n > 0; n--) {
    let cx = rng.int(T + 2, W - 3);
    let cy = rng.int(T + 2, D - 3);
    if (bigs.length && rng.chance(0.45)) {
      const [bx, by] = rng.pick(bigs);
      const a = rng.range(0, Math.PI * 2);
      cx = Math.round(bx + Math.cos(a) * rng.range(2, 4));
      cy = Math.round(by + Math.sin(a) * rng.range(2, 4));
    }
    if (cx < T || cy < T || cx >= W || cy >= D || !free[cx + W * cy] || !cool(R, cx, cy, floor)) continue;
    const r = rng.range(1, 2.4);
    const tall = rng.int(1, 3);
    let peak: Vent | null = null;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d > 1 || x < T || y < T || x >= W || y >= D || !free[x + W * y] || !cool(R, x, y, floor)) continue;
        const g = v.ground(x, y, floor + 6);
        const h = Math.max(1, Math.round(tall * (1 - d * d) + rng.range(-0.4, 0.4)));
        for (let z = g; z < g + h; z++) if (v.get(x, y, z) === M.AIR) v.put(x, y, z, M.FUNGUS, z === g + h - 1 ? rng.int(5, 7) : 3);
        if (!peak || g + h > peak[2]) peak = [x, y, g + h, M.FUNGUS];
      }
    }
    if (peak) R.vents.push(peak);
  }
}

// ── the open floor ───────────────────────────────────────────────────────
// A clear spring: a basin of water in a crust of dark rock and moss, a lip
// of mossy rock on its far side with crystals in it.
function wellspring(v: Voxels, L: Layout, rng: Rng, s: Site, from: Pt): void {
  pit(v, L, s, Math.min(3, L.floor - 2), M.WATER);
  const z = L.floor - 1;
  const away = Math.atan2(s.y - from.y, s.x - from.x);
  for (let y = Math.floor(s.y - s.ry - 3); y <= Math.ceil(s.y + s.ry + 3); y++) {
    for (let x = Math.floor(s.x - s.rx - 3); x <= Math.ceil(s.x + s.rx + 3); x++) {
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e <= 1 || e > 2.4) continue;
      v.put(x, y, z, e < 1.5 ? M.ROCK_DARK : M.MOSS, e < 1.5 ? 1 : rng.int(2, 6));
      const off = Math.abs(((Math.atan2(y - s.y, x - s.x) - away + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (off > 1.2 || e > 2) continue;
      const h = Math.round((1.2 - off) * 2.5 + rng.range(0, 1.2));
      for (let k = 0; k < h; k++) v.put(x, y, z + 1 + k, k === h - 1 ? M.MOSS : M.ROCK, k === h - 1 ? 5 : rng.int(1, 5));
      if (h >= 2 && rng.chance(0.25)) v.put(x, y, z + 1 + h, M.CRYSTAL, rng.int(4, 7));
    }
  }
}

// Stumps of giant mushrooms cut long ago, round a mossy clearing; the one
// in the middle is a seat.
function glade(R: Room, rng: Rng, d: Disc): void {
  const { v, L } = R;
  const cx = Math.round(d.x);
  const cy = Math.round(d.y);
  stump(v, L, cx, cy, 1.6, 2);
  const n = rng.int(2, 3);
  const a0 = rng.range(0, Math.PI * 2);
  for (let k = 0; k < n; k++) {
    const a = a0 + (k / n) * Math.PI * 2;
    const x = Math.round(cx + Math.cos(a) * (d.r - 1.5));
    const y = Math.round(cy + Math.sin(a) * (d.r - 1.5));
    if (pathAt(R, x, y)) continue;
    stump(v, L, x, y, rng.range(1.2, 1.9), rng.int(1, 4));
  }
}

// True if (x, y) is on a walkway (kept clear to a wizard's height).
function pathAt(R: Room, x: number, y: number): boolean {
  return R.hgt[x + R.L.W * y] >= STAND;
}

// A stump: a short pale stalk, its cut top ringed, moss at its foot.
function stump(v: Voxels, L: Layout, cx: number, cy: number, r: number, h: number): void {
  const z = L.floor;
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const dd = Math.hypot(x - cx, y - cy);
      if (dd <= r) {
        for (let k = 0; k < h; k++) v.put(x, y, z + k, M.BONE, k === h - 1 ? (Math.abs(dd - r * 0.55) < 0.5 ? 4 : 6) : 2 + Math.min(3, Math.round(dd + (x - cx) * 0.5)));
      } else if (dd <= r + 1 && v.get(x, y, z) === M.AIR && v.get(x, y, z - 1) !== M.AIR && (x + y) % 2 === 0) {
        v.put(x, y, z - 1, M.MOSS, 4);
      }
    }
  }
}

// A fairy ring: little glowing mushrooms in a circle round a floor of moss
// (open where the walkway comes in), and its soft light.
function fairyRing(R: Room, rng: Rng, d: Disc): void {
  const { v, L } = R;
  const cx = Math.round(d.x);
  const cy = Math.round(d.y);
  const rr = d.r - 1.2;
  for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
    for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
      if (Math.hypot(x - cx, y - cy) < rr - 1 && v.get(x, y, L.floor) === M.AIR) v.put(x, y, L.floor - 1, M.MOSS, (x + y) & 1 ? 3 : 5);
    }
  }
  const n = Math.round(rr * 2.6);
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rng.range(-0.1, 0.1);
    const x = Math.round(cx + Math.cos(a) * rr);
    const y = Math.round(cy + Math.sin(a) * rr);
    if (pathAt(R, Math.round(cx + (x - cx) * 1.4), Math.round(cy + (y - cy) * 1.4))) continue; // where a walkway comes in
    const g = v.ground(x, y, L.floor + 2);
    const tall = rng.int(1, 2);
    for (let h = 0; h < tall; h++) v.put(x, y, g + h, M.BONE, 5);
    v.put(x, y, g + tall, M.FUNGUS, rng.int(5, 7));
  }
  R.lamps.push({ x: cx + 0.5, y: cy + 0.5, z: L.floor + 3, r: Math.round(10 + rr * 2), color: TEAL, k: 0.3, phase: cx % 7, cx: Math.round(cx + rr), cy, cz: L.floor + 1, mat: M.FUNGUS, fall: 0 });
}

// Little glowing mushrooms along both edges of every walkway out from the
// hub, so the way to each POI and plaza shows in the dark.
function waymarks(R: Room, rng: Rng, f: Floor): void {
  const { v, L } = R;
  const { W, T, floor } = L;
  const ends: Pt[] = [...f.pois, ...f.plazas];
  for (const e of ends) {
    const len = Math.hypot(e.x - f.hub.x, e.y - f.hub.y);
    const ux = (e.x - f.hub.x) / len;
    const uy = (e.y - f.hub.y) / len;
    for (let d = 7, side = 1; d < len - 5; d += rng.range(5, 8), side = -side) {
      const x = Math.round(f.hub.x + ux * d - uy * side * 2.7);
      const y = Math.round(f.hub.y + uy * d + ux * side * 2.7);
      if (x < T || y < T || x >= W || y >= L.D || R.hgt[x + W * y] > STAND || f.keep[x + W * y] || !cool(R, x, y, floor)) continue;
      const g = v.ground(x, y, floor + 2);
      if (g > floor + 1 || v.get(x, y, g) !== M.AIR) continue;
      const tall = rng.int(1, 2);
      for (let h = 0; h < tall; h++) v.put(x, y, g + h, M.BONE, 5);
      v.put(x, y, g + tall, rng.chance(0.8) ? M.FUNGUS : M.CRYSTAL, rng.int(5, 7));
    }
  }
}

// Mycelium: threads of glowing fungus wandering through the floor itself,
// everywhere but by a flame; flush, so feet pass over them.
function mycelium(v: Voxels, L: Layout, rng: Rng, hot: Uint8Array): void {
  const { W, D, T, floor } = L;
  const z = floor - 1;
  const ok = (x: number, y: number) => x >= T && y >= T && x < W && y < D && !hot[x + W * y] && v.get(x, y, z + 1) === M.AIR;
  for (let k = Math.round(((W - T) * (D - T)) / 300); k > 0; k--) {
    let x = rng.int(T + 2, W - 3);
    let y = rng.int(T + 2, D - 3);
    let a = rng.range(0, Math.PI * 2);
    for (let i = rng.int(8, 22); i > 0; i--) {
      if (!ok(x, y)) break;
      const m = v.get(x, y, z);
      if (m === M.DIRT || m === M.ROCK_DARK || m === M.MOSS) v.put(x, y, z, M.FUNGUS, rng.int(3, 6));
      a += rng.range(-0.7, 0.7);
      x = Math.round(x + Math.cos(a));
      y = Math.round(y + Math.sin(a));
    }
  }
}

// Puffball vents on open, cool floor: a ring of fungus round a dark mouth
// that every several seconds coughs up a cloud of spores.
function puffballs(R: Room, rng: Rng): Burst[] {
  const { v, L, free } = R;
  const { W, floor } = L;
  const out: Burst[] = [];
  const ok = (x: number, y: number) => free[x + W * y] === 1 && cool(R, x, y, floor);
  for (const p of scatter(L, rng, Math.round(2 + 5 * growth(L)), 18, (x, y) => ok(x, y) && ok(x + 2, y) && ok(x - 2, y) && ok(x, y + 2) && ok(x, y - 2))) {
    const r = rng.range(1.6, 2.4);
    for (let y = Math.floor(p.y - r - 1); y <= Math.ceil(p.y + r + 1); y++) {
      for (let x = Math.floor(p.x - r - 1); x <= Math.ceil(p.x + r + 1); x++) {
        const dd = Math.hypot(x - p.x, y - p.y);
        if (!ok(x, y)) continue;
        const g = v.ground(x, y, floor + 4);
        if (dd < 1) {
          v.put(x, y, g - 1, M.ROCK_DARK, 0);
        } else if (dd <= r + 0.5) {
          const h = dd < r - 0.3 ? 2 : 1;
          for (let k = 0; k < h; k++) if (v.get(x, y, g + k) === M.AIR) v.put(x, y, g + k, k === h - 1 ? M.FUNGUS : M.MOSS, k === h - 1 ? rng.int(4, 7) : 3);
        }
      }
    }
    const z = v.ground(p.x, p.y, floor + 4);
    out.push({ x: p.x, y: p.y, z, period: rng.range(6, 11), phase: rng.range(0, 11) });
    R.vents.push([p.x, p.y, z + 1, M.FUNGUS]);
  }
  return out;
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const { vents, lamps, pools, bursts, spring } = SCENES.get(c.v) ?? survey(c.v, L);
  if (vents.length) {
    if (c.rng.chance(c.dt * (1 + vents.length / 25))) spores(c, c.rng.pick(vents));
    if (c.rng.chance(c.dt * (2 + (L.W * L.D) / 2000))) {
      const [x, y, z] = c.rng.pick(vents);
      mote(c, clamp(x + c.rng.range(-2, 3), 0, L.W), clamp(y + c.rng.range(-2, 3), 0, L.D), clamp(z + c.rng.range(0, 3), 0, L.H - 0.5));
    }
  }
  for (const l of lamps) lamp(c, L, l);
  pools.forEach((p, k) => sludge(c, L, p, k));
  for (const b of bursts) puffball(c, b);
  if (spring) trickle(c, L, spring);
  if (c.rng.chance(c.dt * 0.25)) drip(c, L);
}

// A world this biome did not generate: find its fungus once.
function survey(v: Voxels, L: Layout): Scene {
  const vents: Vent[] = [];
  const { W, D, H, floor } = L;
  for (let z = floor; z < H - 1; z++) {
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        if (v.get(x, y, z) === M.FUNGUS && v.get(x, y, z + 1) === M.AIR && hash3(7, x, y, z) < 0.1) vents.push([x, y, z + 1, M.FUNGUS]);
      }
    }
  }
  const sc: Scene = { vents, lamps: [], pools: [], bursts: [], spring: null };
  SCENES.set(v, sc);
  return sc;
}

// A puff of spores off a patch of fungus, if it is still there.
function spores(c: Ctx, [x, y, z, m]: Vent): void {
  if (c.v.get(x, y, z - 1) !== m) return;
  for (let k = c.rng.int(2, 4); k > 0; k--) puff(c, x + c.rng.int(-1, 1), y + c.rng.int(-1, 1), z + c.rng.int(0, 1), M.SPORES, c.rng.int(70, 160));
}

// A glowing spore drifting up.
function mote(c: Ctx, x: number, y: number, z: number): void {
  c.spawn({ kind: 'ember', x, y, z, vx: c.rng.range(-0.5, 0.5), vy: c.rng.range(-0.5, 0.5), vz: c.rng.range(0.2, 0.8), life: c.rng.range(2.5, 6), color: c.rng.pick(MOTES), glow: true, gravity: -0.12 });
}

// A big cap's slow glow, and spores sifting down from under its rim.
function lamp(c: Ctx, L: Layout, l: Lamp): void {
  if (c.v.get(l.cx, l.cy, l.cz) !== l.mat) return;
  const pulse = 0.5 + 0.5 * Math.sin(c.t * 0.8 + l.phase);
  c.light({ x: l.x, y: l.y, z: l.z, color: l.color, radius: l.r, intensity: l.k * (0.8 + 0.25 * pulse) });
  if (!l.fall || !c.rng.chance(c.dt * 1.2)) return;
  const a = c.rng.range(0, Math.PI * 2);
  const d = l.fall * c.rng.range(0.5, 0.95);
  c.spawn({
    kind: 'ember',
    x: clamp(l.x + Math.cos(a) * d, 0, L.W),
    y: clamp(l.y + Math.sin(a) * d, 0, L.D),
    z: clamp(l.z - 2 - d * 0.4, 0, L.H),
    vx: c.rng.range(-0.3, 0.3),
    vy: c.rng.range(-0.3, 0.3),
    vz: -0.2,
    life: c.rng.range(3, 5),
    color: c.rng.pick(MOTES),
    glow: true,
    gravity: 0.25,
  });
}

// The sludge glows and pulses, bubbles pop on it, now and then a breath of
// toxic gas.
function sludge(c: Ctx, L: Layout, s: Site, n: number): void {
  const pulse = 0.5 + 0.5 * Math.sin(c.t * 1.3 + n * 2.1);
  c.light({ x: s.x + 0.5, y: s.y + 0.5, z: L.floor + 0.5, color: SLIME, radius: clamp(Math.max(s.rx, s.ry) * 2 + 10, 10, 36), intensity: 0.4 + 0.12 * pulse });
  if (!c.rng.chance(c.dt * 2.5 * Math.min(1, s.rx / 6))) return;
  const a = c.rng.range(0, Math.PI * 2);
  const k = Math.sqrt(c.rng.next()) * 0.75;
  const x = Math.round(s.x + Math.cos(a) * s.rx * k);
  const y = Math.round(s.y + Math.sin(a) * s.ry * k);
  let z = L.floor - 1;
  while (z > 0 && c.v.get(x, y, z) === M.AIR) z--;
  if (c.v.get(x, y, z) !== M.SLUDGE) return;
  c.v.put(x, y, z, M.SLUDGE, c.rng.int(6, 7));
  c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: z + 1.2, vx: c.rng.range(-0.5, 0.5), vy: c.rng.range(-0.5, 0.5), vz: c.rng.range(2, 4), life: 0.6, color: SLIME_DROP, glow: true, gravity: 20 });
  if (c.rng.chance(0.25)) puff(c, x, y, z + 1, M.TOXIC, c.rng.int(60, 120));
}

// A puffball's cough: a burst of spores and glowing motes, then quiet.
function puffball(c: Ctx, b: Burst): void {
  const u = (c.t + b.phase) % b.period;
  if (u > 0.9 || c.v.get(Math.floor(b.x), Math.floor(b.y), b.z) !== M.AIR) return;
  if (c.rng.chance(c.dt * 25)) puff(c, Math.floor(b.x) + c.rng.int(-1, 1), Math.floor(b.y) + c.rng.int(-1, 1), b.z + c.rng.int(0, 2), M.SPORES, c.rng.int(80, 180));
  if (c.rng.chance(c.dt * 12)) mote(c, b.x + c.rng.range(-1, 1), b.y + c.rng.range(-1, 1), b.z + c.rng.range(0.5, 2));
}

// The spring wells up: now and then a ripple glints on it.
function trickle(c: Ctx, L: Layout, s: Site): void {
  if (!c.rng.chance(c.dt * 1.5)) return;
  const a = c.rng.range(0, Math.PI * 2);
  const k = Math.sqrt(c.rng.next()) * 0.7;
  const x = Math.round(s.x + Math.cos(a) * s.rx * k);
  const y = Math.round(s.y + Math.sin(a) * s.ry * k);
  const z = L.floor - 2;
  if (c.v.get(x, y, z) !== M.WATER) return;
  c.v.put(x, y, z, M.WATER, c.rng.int(5, 7));
  c.spawn({ kind: 'glint', x: x + 0.5, y: y + 0.5, z: z + 1.1, vx: 0, vy: 0, vz: 0.2, life: c.rng.range(0.3, 0.6), color: WATER_DROP, glow: true, gravity: 0 });
}

// A drop of seep water (now and then sludge) off the top of a wall face,
// never over a prop.
function drip(c: Ctx, L: Layout): void {
  const wall = c.rng.chance(0.5) ? 'left' : 'right';
  const a = c.rng.int(L.T + 1, (wall === 'left' ? L.D : L.W) - 2);
  for (const s of slotsOn(L, wall)) {
    const a0 = wall === 'left' ? s.y0 : s.x0;
    if (a >= a0 - 1 && a <= a0 + s.len) return;
  }
  for (let o = 0; o < 3; o++) {
    const [x, y] = onWall(L, wall, a, o);
    if (c.v.get(x, y, L.H - 1) !== M.AIR) continue;
    const slime = c.rng.chance(0.2);
    c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: L.H - 0.5, vx: 0, vy: 0, vz: 0, life: 4, color: slime ? SLIME_DROP : WATER_DROP, glow: slime, gravity: 30, mat: slime ? M.SLUDGE : M.WATER });
    return;
  }
}

export const fungal: Biome = {
  id: 'fungal',
  name: 'Fungal Caverns',
  tagline: 'Giant mushrooms, glowing spores and a pit of toxic sludge',
  palette: PALETTE,
  backdrop: hex('#050307'),
  sky: 'spores',
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  build: BUILD,
  pois: (L) => plan(L).floor.pois.slice(),
};

export default fungal;
