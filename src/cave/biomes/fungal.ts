import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { keepClear, openSites, slotRect, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { fillStrata, hangers, hash3, isFlammable, isSolid, makeProps, noise2, onWall, pit, puff, roughenWalls, veins, wx, wy } from '../props.ts';
import type { Biome, Ctx, Grade, Layout, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// Fungal Caverns: a damp hollow gone over to fungus. Purple-grey and teal
// rock under moss, giant mushrooms on pale stalks, glowing bracket fungus
// on the walls, a pit of toxic sludge, and spores drifting up through the
// dark. Almost all the light is the fungus's own.

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

const GRADE: Grade = { ambient: hex('#241c30'), illum: 1.1, bloom: 0.8, vignette: 0.35 };

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

// How tall each prop stands (candle and campfire flames included), so decor
// clears it and never hides it.
const PROP_TOP: Record<SlotKind, number> = { write: 6, run: 10, think: 12, idle: 11, read: 20, search: 15, web: 15, entrance: 20 };
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

const BASE = makeProps(FUNGAL_MATS);
const PROPS: Record<SlotKind, Prop> = { ...BASE, entrance: tunnel(BASE.entrance) };

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

type Scene = { vents: Vent[]; lamps: Lamp[]; pool: Site | null };

// Per generated world, for weather(); a world generated elsewhere is
// surveyed on first use.
const SCENES = new WeakMap<Voxels, Scene>();

function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, floor } = L;
  clear(v);
  const keep = keepClear(L);

  // The sludge pit, on open floor in front of the work area.
  const pr = clamp(Math.round(W * 0.07), 5, 10);
  const pool = openSites(L, rng, [[pr, Math.round(pr * 0.7)]])[0] ?? null;

  const free = freeFloor(L, keep, pool);
  const hot = heatMap(L);
  const top = columnTops(L, rng, free);
  fillStrata(v, L, rng, STRATA, top);
  carpet(v, L, rng, top, free, hot);
  veins(v, L, rng, M.CRYSTAL, Math.round((W * D) / 1400), (m) => ROCKY.has(m));
  veins(v, L, rng, M.FUNGUS, Math.round((W * D) / 3000), (m) => ROCKY.has(m), [3, 7]);
  roughenWalls(v, L, rng);
  overgrow(v, L, rng, hot);

  if (pool) {
    pit(v, L, pool, Math.min(4, floor - 2), M.SLUDGE);
    rim(v, L, rng, pool, hot);
  }

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  const [hgt, seen] = clearance(L, keep, pool);
  const R: Room = { v, L, free, hgt, seen, hot, vents: [], lamps: [], placed: [] };
  mushrooms(R, rng);
  colonies(R, rng);
  hangers(v, L, rng, M.MOSS, M.MOSS, Math.round((W + D) / 10), floor + PROP_TOP.read + 2);
  strands(R, rng);
  lumps(R, rng);
  SCENES.set(v, { vents: R.vents, lamps: R.lamps, pool });
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Floor cells free for decor: not where agents work or walk, not round the pool.
function freeFloor(L: Layout, keep: Uint8Array, pool: Site | null): Uint8Array {
  const { W, D, T } = L;
  const free = new Uint8Array(W * D);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      if (keep[x + W * y]) continue;
      if (pool && ((x - pool.x) / (pool.rx + 3)) ** 2 + ((y - pool.y) / (pool.ry + 3)) ** 2 <= 1) continue;
      free[x + W * y] = 1;
    }
  }
  return free;
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
// prop's own footprint only).
function clearance(L: Layout, keep: Uint8Array, pool: Site | null): [hgt: Uint8Array, seen: Uint8Array] {
  const { W, D } = L;
  const hgt = new Uint8Array(W * D);
  const seen = new Uint8Array(W * D);
  for (let i = 0; i < W * D; i++) if (keep[i]) hgt[i] = seen[i] = STAND;
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
  for (const s of L.slots) {
    const { x: sx, y: sy } = s.spot;
    for (let y = Math.max(0, sy - 4); y <= Math.min(D - 1, sy + 4); y++) {
      for (let x = Math.max(0, sx - 4); x <= Math.min(W - 1, sx + 4); x++) {
        if ((x - sx) ** 2 + (y - sy) ** 2 > 16) continue;
        hgt[x + W * y] = Math.max(hgt[x + W * y], STAND);
        seen[x + W * y] = Math.max(seen[x + W * y], STAND);
      }
    }
  }
  if (pool) {
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
function columnTops(L: Layout, rng: Rng, free: Uint8Array): Uint8Array {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  const grow = (W - 72) / 98; // 0 at the smallest chunk, 1 at the largest
  const band = 5 + Math.round(grow * 8);
  const lip = 3 + grow * 5;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      const c = x + W * y;
      if (x < T || y < T) {
        top[c] = H - (noise2(seed, x * 0.3, y * 0.3) > 0.8 ? 1 : 0);
        continue;
      }
      let h = floor;
      if (free[c]) {
        const edge = Math.min(W - 1 - x, D - 1 - y);
        if (edge < band) h += Math.max(0, Math.round((noise2(seed + 1, x * 0.09, y * 0.09) * 1.4 - 0.4) * lip * (1 - edge / band) ** 2));
        const b = noise2(seed + 2, x * 0.3, y * 0.3);
        if (b > 0.7) h++;
        if (b > 0.86) h++;
      }
      top[c] = h;
    }
  }
  for (let k = Math.round((W * D) / 1600); k > 0; k--) {
    const cx = rng.int(T + 2, W - 3);
    const cy = rng.int(T + 2, D - 3);
    if (!free[cx + W * cy]) continue;
    const r = rng.range(1.8, 3.5 + 2 * grow);
    const tall = rng.int(2, 3 + Math.round(2 * grow));
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const c = x + W * y;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1 || !free[c]) continue;
        top[c] = Math.max(top[c], floor + Math.round(tall * Math.sqrt(1 - d * d)));
      }
    }
  }
  return top;
}

// The floor's top voxel: plum soil with dark rock showing through, and on
// open floor (never by a fire, nor where a spark could carry one to a
// prop) carpets and tufts of moss.
function carpet(v: Voxels, L: Layout, rng: Rng, top: Uint8Array, free: Uint8Array, hot: Uint8Array): void {
  const { W, D, T } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      const z = top[c] - 1;
      const g = noise2(seed + 1, x * 0.35, y * 0.35);
      const n = noise2(seed, x * 0.11, y * 0.11) * 0.75 + g * 0.25;
      const warm = hot[c] === 1;
      // Solid moss only in small cores, dithered round them: fire spreads
      // face to face, so a spark burns one core, not the floor.
      const mossy = free[c] && !warm && (n > 0.72 || (n > 0.56 && ((x + y) & 1) === 0));
      const m = mossy ? M.MOSS : g < 0.2 ? M.ROCK_DARK : M.DIRT;
      v.put(x, y, z, m);
      if (n > 0.3) v.put(x, y, z - 1, M.DIRT);
      if (!free[c] || warm) continue;
      if (m === M.MOSS && n > 0.76 && g > 0.5) v.put(x, y, z + 1, M.MOSS, rng.int(4, 7));
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
    const spans = L.slots.filter((s) => s.wall === wall).map((s) => {
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
function mushrooms(R: Room, rng: Rng): void {
  const { v, L, free } = R;
  const { W, D, H, T, floor } = L;
  const span = H - floor;
  const grow = clamp((W - 72) / 98, 0, 1);
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
    const mine = L.slots.filter((s) => s.wall === wall);
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
  for (let n = Math.round(1 + (W * D) / 2600), k = 0; n > 0 && k < 80; k++) {
    const at = cell(3);
    if (!at) break;
    const [x, y] = at;
    const cap = big();
    const s = sprout(rng, x, y, ground(x, y), Math.round(rng.int(4, 8) * (1 + 0.5 * grow)), rng.range(1.3, 2), rng.range(3.5, 5.5) * (1 + 0.35 * grow), cap, freckles(cap));
    if (plant(R, s)) n--;
  }

  // Undergrowth: little glowing ones, mostly round the feet of the big ones.
  const bigs = R.placed.slice();
  for (let n = Math.round((W * D) / 900); n > 0; n--) {
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
  for (let n = Math.round((W * D) / 1400); n > 0; n--) {
    let cx = rng.int(T + 2, W - 3);
    let cy = rng.int(T + 2, D - 3);
    if (bigs.length && rng.chance(0.7)) {
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

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const { vents, lamps, pool } = SCENES.get(c.v) ?? survey(c.v, L);
  if (vents.length) {
    if (c.rng.chance(c.dt * (1 + vents.length / 25))) spores(c, c.rng.pick(vents));
    if (c.rng.chance(c.dt * (2 + (L.W * L.D) / 2000))) {
      const [x, y, z] = c.rng.pick(vents);
      mote(c, clamp(x + c.rng.range(-2, 3), 0, L.W), clamp(y + c.rng.range(-2, 3), 0, L.D), clamp(z + c.rng.range(0, 3), 0, L.H - 0.5));
    }
  }
  for (const l of lamps) lamp(c, L, l);
  if (pool) sludge(c, L, pool);
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
  const sc: Scene = { vents, lamps: [], pool: null };
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
function sludge(c: Ctx, L: Layout, s: Site): void {
  const pulse = 0.5 + 0.5 * Math.sin(c.t * 1.3);
  c.light({ x: s.x + 0.5, y: s.y + 0.5, z: L.floor + 0.5, color: SLIME, radius: clamp(Math.max(s.rx, s.ry) * 2 + 10, 10, 36), intensity: 0.4 + 0.12 * pulse });
  if (!c.rng.chance(c.dt * 2.5)) return;
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

// A drop of seep water (now and then sludge) off the top of a wall face,
// never over a prop.
function drip(c: Ctx, L: Layout): void {
  const wall = c.rng.chance(0.5) ? 'left' : 'right';
  const a = c.rng.int(L.T + 1, (wall === 'left' ? L.D : L.W) - 2);
  for (const s of L.slots) {
    const a0 = wall === 'left' ? s.y0 : s.x0;
    if (s.wall === wall && a >= a0 - 1 && a <= a0 + s.len) return;
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
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
};

export default fungal;
