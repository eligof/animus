import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Rect, Site } from '../layout.ts';
import { keepClear, openSites, slotRect, wallGaps } from '../layout.ts';
import { M, MATERIALS } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { FLAME, fillStrata, flicker, hash3, heap, isSolid, keepFire, makeProps, noise2, onWall, pit, puff, roughenWalls, veins, wx, wy } from '../props.ts';
import type { Biome, Ctx, Grade, Layout, Particle, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// Snowy Depths: deeper down and colder. Blue-grey rock banded with packed
// ice, frozen falls down the walls and icicles off their tops, snow drifted
// against the walls and banked along the cuts, a pond frozen over, and snow
// sifting down through the dark. The only warmth is fire: iron braziers,
// the campfire, the hearth under the pot, the altar candles.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#06090e'),
  wall: hex('#121a24'),
  wall2: hex('#16202c'),
  floor: hex('#1f2a37'),
  floor2: hex('#19232f'),
  text: hex('#e2edf7'),
  dim: hex('#7b8ea5'),
  accent: hex('#8ed2ff'),
  accent2: hex('#ff9d4d'),
  panel: hex('#0b1018'),
  panelText: hex('#e2edf7'),
  border: hex('#3a5470'),
  bubble: hex('#eef6ff'),
  bubbleText: hex('#0f1722'),
  good: hex('#8fe3c0'),
  warn: hex('#ffc65c'),
  bad: hex('#ff5c4d'),
};

const GRADE: Grade = { ambient: hex('#2a3444'), illum: 1, bloom: 0.6, vignette: 0.35 };

// Cold stone: the rock, scree and dressed stone all go blue-grey.
const COLORS: Partial<Record<number, string>> = {
  [M.ROCK]: '#536276',
  [M.ROCK_DARK]: '#313c4c',
  [M.GRAVEL]: '#68768a',
  [M.BRICK]: '#717d8d',
  [M.ICE]: '#74b6e6', // bluer than the snow, so the ice reads against it
};

export const SNOWY_MATS: PropMats = {
  frame: M.WOOD,
  metal: M.METAL,
  cloth: M.CLOTH,
  stone: M.BRICK,
  stone2: M.ROCK_DARK,
  glow: M.CRYSTAL,
  liquid: M.WATER, // snow melting for tea
  quench: M.WATER,
  candle: M.CANDLE,
  ore: M.GOLD_ORE,
  seam: M.ICE,
  rubble: M.GRAVEL,
  fuel: M.COAL,
  trim: M.ICE, // frozen inlays, well below the candle flames
  bone: M.BONE,
  books: [M.CLOTH, M.WOOD, M.BONE, M.METAL, M.BRICK, M.OBSIDIAN, M.CANDLE],
  rune: hex('#a9e2ff'),
};

const BASE = makeProps(SNOWY_MATS);

// The fire props puff steam now and then: cold air over heat.
const PROPS: Record<SlotKind, Prop> = {
  ...BASE,
  run: steaming(BASE.run, (s) => [Math.floor(s.len / 2), Math.floor(s.dep / 2), 10], 0.5, 3),
  idle: steaming(BASE.idle, (s) => [s.len - 3, Math.floor(s.dep / 2) + 2, 11], 0.7, 0.7),
};

// Rock layers bottom to top, packed ice between them; dark rock up top so
// the icicles stand out against it.
const STRATA: Strata = {
  bands: [
    [M.ROCK, 5, 3, 7],
    [M.ROCK_DARK, 3, 2, 4],
    [M.ICE, 2, 1, 2],
  ],
  topsoil: [
    [M.ROCK_DARK, 3, 2, 3],
    [M.ROCK, 2, 1, 2],
  ],
  soilDepth: 8,
  warp: 3,
};

const THAW = 4; // no ice in the rock, no snow on the ground, this near a fire
const COLD = 8; // ice and snow decor from this far out
const ICICLE_FLOOR = 22; // icicles end at least this high above the floor (clear of props and flames)
const FLAME_CLEAR = 4; // ...and this far to the side of any flame
const BRAZIER_LIFE = 7;
const BRAZIER_FLAMES: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const FLAKES: readonly RGB[] = [hex('#dfe9f5'), hex('#eef4fb'), hex('#c6d4e4')];
const FLAKE_GLOW: readonly RGB[] = [hex('#5d6b7c'), hex('#6d7b8c'), hex('#4f5c6c')]; // snow catching what light there is
const GLINTS: readonly RGB[] = [hex('#f2fcff'), hex('#bfeaff'), hex('#dff6ff')];
const EMBER: RGB = hex('#ff7a2a');
const ICE_LIGHT: RGB = hex('#7fc4ff');
const FLAKE_AREA = 550; // floor voxels per flake per second
const LANDS = 0.1; // share of flakes that settle as snow (the rest melt on touch)

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// What a grain of snow cannot slide into (solid or powder), and what it can
// rest on (those, or liquid). Unknown ids and M.OUT read as rock.
const FIRM = new Uint8Array(256);
const HOLDS = new Uint8Array(256);
const POWDER = new Uint8Array(256);
for (let id = 0; id < 256; id++) {
  const k = MATERIALS[id]?.kind ?? 'solid';
  if (k === 'solid' || k === 'powder') FIRM[id] = 1;
  if (FIRM[id] || k === 'liquid') HOLDS[id] = 1;
  if (k === 'powder') POWDER[id] = 1;
}

// ── plan ─────────────────────────────────────────────────────────────────
// What depends on the layout alone, shared by generate() and weather():
// where the braziers stand, where the icefalls run, and how far every floor
// column is from a fire.
type Fall = { wall: 'left' | 'right'; a: number; half: number };
type Plan = { braziers: Array<[number, number]>; falls: Fall[]; heat: Float32Array; cold: Uint8Array };

const PLANS = new WeakMap<Layout, Plan>();

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W, D, T } = L;
  // Braziers between the props on the warm (right) wall; icefalls between
  // them on the cold (left) wall, and down both walls in the back corner.
  const braziers: Array<[number, number]> = [];
  for (const [a0, a1] of wallGaps(L, 'right')) {
    if (a0 > T && a1 < W && a1 - a0 >= 6) braziers.push(onWall(L, 'right', Math.floor((a0 + a1 - 1) / 2), 2));
  }
  const falls: Fall[] = [];
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    for (const [a0, a1] of wallGaps(L, wall)) {
      const len = a1 - a0;
      if (a0 === T) {
        const half = clamp((len - 2) / 3, 1.5, 3.5);
        if (len >= 5) falls.push({ wall, a: T + half, half });
      } else if (wall === 'left' && a1 < end && len >= 6) {
        falls.push({ wall, a: (a0 + a1) / 2, half: Math.min(4, (len - 3) / 2) });
      }
    }
  }
  const heat = heatMap(L, braziers);
  const cold = new Uint8Array(W * D);
  for (let i = 0; i < W * D; i++) cold[i] = heat[i] >= COLD ? 1 : 0;
  const p = { braziers, falls, heat, cold };
  PLANS.set(L, p);
  return p;
}

// Distance from every column to the nearest fire: the footprints of the
// props that keep a flame, the entrance torch and the braziers.
function heatMap(L: Layout, braziers: ReadonlyArray<readonly [number, number]>): Float32Array {
  const { W, D } = L;
  const rects: Rect[] = [];
  for (const s of L.slots) {
    if (s.kind === 'run' || s.kind === 'think' || s.kind === 'idle') rects.push(slotRect(s));
    else if (s.kind === 'entrance') rects.push(box(s, s.len - 2, -2, s.len + 1, 2));
  }
  for (const [x, y] of braziers) rects.push({ x0: x - 1, y0: y - 1, x1: x + 2, y1: y + 2 });
  const out = new Float32Array(W * D);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      let best = Infinity;
      for (const r of rects) {
        const dx = Math.max(r.x0 - x, 0, x - r.x1 + 1);
        const dy = Math.max(r.y0 - y, 0, y - r.y1 + 1);
        best = Math.min(best, Math.hypot(dx, dy));
      }
      out[x + W * y] = best;
    }
  }
  return out;
}

// [a0, a1) x [b0, b1) of a slot's frame, in world coordinates.
function box(s: Slot, a0: number, b0: number, a1: number, b1: number): Rect {
  const xa = wx(s, a0, b0);
  const xb = wx(s, a1 - 1, b1 - 1);
  const ya = wy(s, a0, b0);
  const yb = wy(s, a1 - 1, b1 - 1);
  return { x0: Math.min(xa, xb), y0: Math.min(ya, yb), x1: Math.max(xa, xb) + 1, y1: Math.max(ya, yb) + 1 };
}

// ── generate ─────────────────────────────────────────────────────────────
// Ice voxels the camera can see, for weather() to glint, and the frozen
// pond, for its cold light.
const ICE_SEEN = new WeakMap<Voxels, Int32Array>();
const PONDS = new WeakMap<Voxels, Site>();

function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, T } = L;
  clear(v);
  const keep = keepClear(L);
  const P = plan(L);

  // A pond frozen over and a sheet of ice, both well away from the fires.
  const pr = clamp(Math.round(W * 0.085), 5, 12);
  const sr = clamp(Math.round(W * 0.05), 3, 7);
  const sites = openSites(L, rng, [
    [pr, Math.round(pr * 0.7)],
    [sr, Math.round(sr * 0.75)],
  ]);
  const [pond, sheet] = sites.filter((s) => P.heat[Math.round(s.x) + W * Math.round(s.y)] >= COLD + Math.max(s.rx, s.ry));

  // Rock: walls, floor, boulders, a low lip along the front cuts; ice in it.
  const free = freeFloor(L, keep, sites, P.braziers);
  const top = columnTops(L, rng, free);
  fillStrata(v, L, rng, STRATA, top);
  veins(v, L, rng, M.ICE, Math.round((W * D) / 900), (m) => m === M.ROCK || m === M.ROCK_DARK);
  roughenWalls(v, L, rng);
  thaw(v, L, P.heat);
  surface(v, L, rng, top, keep, P.heat);
  if (pond) frozenPond(v, L, rng, pond);
  if (pond) PONDS.set(v, pond);
  else PONDS.delete(v);
  if (sheet) iceSheet(v, L, rng, sheet);

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);
  for (const [x, y] of P.braziers) buildBrazier(v, x, y, L.floor);

  // Ice and snow, wherever it is cold.
  const cold = (x: number, y: number) => x >= T && y >= T && x < W && y < D && free[x + W * y] === 1 && P.cold[x + W * y] === 1;
  spikes(v, L, rng, cold);
  drifts(v, L, rng, cold);
  for (const f of P.falls) icefall(v, L, rng, f, keep, P.heat);
  heap(v, L, T, T, clamp(5 + (W - 72) / 30, 5, 8), M.SNOW, (x, y) => keep[x + W * y] === 1 || P.cold[x + W * y] === 0);
  // High up, only the flames' own columns are too warm.
  const flames = flameColumns(v, L);
  const high = (x: number, y: number) => flames.every(([fx, fy]) => Math.hypot(x - fx, y - fy) >= FLAME_CLEAR);
  icicles(v, L, rng, high);
  caps(v, L, rng);
  ledges(v, L, P.heat, high);

  quench(v, L);
  settle(v, L);
  ICE_SEEN.set(v, visibleIce(v, L));
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Floor cells free for decor: not where agents work or walk, not round the
// pools, not under a brazier.
function freeFloor(L: Layout, keep: Uint8Array, pools: readonly Site[], braziers: ReadonlyArray<readonly [number, number]>): Uint8Array {
  const { W, D, T } = L;
  const free = new Uint8Array(W * D);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      if (keep[x + W * y]) continue;
      if (pools.some((p) => ((x - p.x) / (p.rx + 3)) ** 2 + ((y - p.y) / (p.ry + 3)) ** 2 <= 1)) continue;
      if (braziers.some(([bx, by]) => Math.abs(x - bx) <= 2 && Math.abs(y - by) <= 2)) continue;
      free[x + W * y] = 1;
    }
  }
  return free;
}

// Height of the rock in every column: the walls to H (a ragged voxel off
// the top here and there), the floor to `floor` with a low lip along the
// front cuts (the snow banks up on it later), bumps and boulders.
function columnTops(L: Layout, rng: Rng, free: Uint8Array): Uint8Array {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  const grow = (W - 72) / 98; // 0 at the smallest chunk, 1 at the largest
  const band = 4 + Math.round(grow * 5);
  const lip = 1 + grow * 3;
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
        if (noise2(seed + 2, x * 0.35, y * 0.35) > 0.8) h++;
      }
      top[c] = h;
    }
  }
  // Boulders: low domes the snow will cap.
  for (let k = Math.round((W * D) / 1400); k > 0; k--) {
    const cx = rng.int(T + 2, W - 3);
    const cy = rng.int(T + 2, D - 3);
    if (!free[cx + W * cy]) continue;
    const r = rng.range(1.5, 3 + 2 * grow);
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

// No ice left in the rock near a fire, from the floor slab to the wall tops.
function thaw(v: Voxels, L: Layout, heat: Float32Array): void {
  const { W, D, H } = L;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      if (heat[x + W * y] >= THAW) continue;
      for (let z = 0; z < H; z++) {
        const i = v.idx(x, y, z);
        if (v.mat[i] === M.ICE) v.set(i, M.ROCK, v.shade[i]);
      }
    }
  }
}

// The floor's top voxel: snow over most of it, deeper in places, with bare
// rock and scree showing; trodden through to rock in patches along the
// paths; melted back to bare rock round every fire.
function surface(v: Voxels, L: Layout, rng: Rng, top: Uint8Array, keep: Uint8Array, heat: Float32Array): void {
  const { W, D, T } = L;
  const seed = rng.int(0, 0x3fffffff);
  // Snow only where it rests: no neighbour more than a voxel lower.
  const flat = (x: number, y: number, h: number) => DIRS.every(([dx, dy]) => {
    const nx = x + dx;
    const ny = y + dy;
    return nx < T || ny < T || nx >= W || ny >= D || top[nx + W * ny] >= h - 1;
  });
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      const z = top[c] - 1;
      const n = noise2(seed, x * 0.11, y * 0.11);
      const p = noise2(seed + 1, x * 0.3, y * 0.3); // finer patches
      const f = hash3(seed, x, y, 0);
      let m: number;
      if (heat[c] < THAW + (n - 0.5) * 3) m = p < 0.25 ? M.ROCK_DARK : p > 0.7 || f > 0.85 ? M.GRAVEL : M.ROCK;
      else if (keep[c]) m = n + 0.5 * p > 0.55 ? M.SNOW : p < 0.25 ? M.ROCK : M.GRAVEL;
      else m = n < 0.14 ? M.ROCK : n < 0.2 && f > 0.5 ? M.GRAVEL : M.SNOW;
      if (POWDER[m] && !flat(x, y, top[c])) m = M.ROCK;
      v.put(x, y, z, m);
      if (m === M.SNOW && n > 0.45 && z > 0) v.put(x, y, z - 1, M.SNOW);
    }
  }
}

// Water in a pit, its top layer frozen a voxel below the floor, with a hole
// or two of open water, and a shore of bare rock and scree round the bowl.
function frozenPond(v: Voxels, L: Layout, rng: Rng, s: Site): void {
  pit(v, L, s, Math.min(4, L.floor - 2), M.WATER);
  const z = L.floor - 2;
  const seed = rng.int(0, 0x3fffffff);
  const holes: Array<[number, number, number]> = [];
  for (let k = rng.int(1, 2); k > 0; k--) {
    const a = rng.range(0, Math.PI * 2);
    const d = rng.range(0, 0.3);
    holes.push([s.x + Math.cos(a) * d * s.rx, s.y + Math.sin(a) * d * s.ry, rng.range(0.9, 1.5)]);
  }
  for (let y = Math.floor(s.y - s.ry - 3); y <= Math.ceil(s.y + s.ry + 3); y++) {
    for (let x = Math.floor(s.x - s.rx - 3); x <= Math.ceil(s.x + s.rx + 3); x++) {
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e > 1 && e <= 1.5 + 0.6 * noise2(seed + 1, x * 0.3, y * 0.3)) {
        const f = hash3(seed, x, y, 1);
        v.put(x, y, L.floor - 1, f < 0.35 ? M.ROCK_DARK : f < 0.75 ? M.ROCK : M.GRAVEL);
        continue;
      }
      if (v.get(x, y, z) !== M.WATER) continue;
      // Open water only where there is water under it.
      if (v.get(x, y, z - 1) === M.WATER && holes.some(([hx, hy, r]) => Math.hypot(x - hx, y - hy) < r)) continue;
      // Crust: pale cracks across it.
      const crack = Math.abs(noise2(seed, x * 0.35, y * 0.35) - 0.5) < 0.05;
      v.put(x, y, z, M.ICE, crack ? 7 : 4 + (hash3(seed, x, y, 0) < 0.5 ? 1 : 0));
    }
  }
}

// A frozen puddle: ice two voxels thick, flush with the floor.
function iceSheet(v: Voxels, L: Layout, rng: Rng, s: Site): void {
  const seed = rng.int(0, 0x3fffffff);
  for (let y = Math.floor(s.y - s.ry - 1); y <= Math.ceil(s.y + s.ry + 1); y++) {
    for (let x = Math.floor(s.x - s.rx - 1); x <= Math.ceil(s.x + s.rx + 1); x++) {
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e > 1 + 0.4 * noise2(seed, x * 0.5, y * 0.5)) continue;
      v.put(x, y, L.floor - 1, M.ICE, rng.int(2, 6));
      v.put(x, y, L.floor - 2, M.ICE, 1);
    }
  }
}

// An iron brazier: four legs, a bowl of coal, flames over its middle.
function buildBrazier(v: Voxels, x: number, y: number, z: number): void {
  for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    v.put(x + dx, y + dy, z, M.METAL, 1);
    v.put(x + dx, y + dy, z + 1, M.METAL, 2);
  }
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      v.put(x + dx, y + dy, z + 2, M.METAL, 2);
      if (dx || dy) v.put(x + dx, y + dy, z + 3, M.METAL, 5);
      else v.put(x, y, z + 3, M.COAL);
    }
  }
  for (const [dx, dy] of BRAZIER_FLAMES) v.put(x + dx, y + dy, z + 4, M.FIRE, 2, BRAZIER_LIFE);
}

// Ice on the open floor: clusters of spikes (a tall one with smaller ones
// round it) and a pillar or two, all on cold ground.
function spikes(v: Voxels, L: Layout, rng: Rng, cold: (x: number, y: number) => boolean): void {
  const { W, D, H, T, floor } = L;
  const grow = (W - 72) / 98;
  const seed = rng.int(0, 0x3fffffff);
  const cone = (cx: number, cy: number, r: number, tall: number, pillar: boolean) => {
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if (!cold(x, y)) continue;
        const g = v.ground(x, y, floor + 4);
        const d = Math.hypot(x - cx, y - cy);
        for (let i = 0; i < tall; i++) {
          // Pillars keep their girth (a little wobble) and taper at the top; spikes are cones.
          const rz = pillar ? r * (0.8 + 0.4 * noise2(seed + cx, i * 0.3, cy)) * Math.min(1, (tall - i) / (r * 2)) : r * (1 - i / tall) ** 0.8;
          if (d > rz) continue;
          if (v.get(x, y, g + i) === M.AIR) v.put(x, y, g + i, M.ICE, Math.min(7, 3 + ((i + x + y) % 4)));
        }
      }
    }
  };
  const spots: Array<[number, number]> = [];
  for (let y = T + 3; y < D - 3; y++) for (let x = T + 3; x < W - 3; x++) if (cold(x, y)) spots.push([x, y]);
  let pillars = 1 + Math.round(grow);
  for (let k = Math.round(spots.length / 300); k > 0 && spots.length; k--) {
    const [cx, cy] = rng.pick(spots);
    if (v.ground(cx, cy, floor + 4) > floor + 1) continue; // something there already
    if (pillars > 0 && rng.chance(0.3)) {
      pillars--;
      cone(cx, cy, rng.range(1.6, 2.2 + grow), rng.int(Math.round((H - floor) * 0.3), Math.round((H - floor) * 0.5)), true);
      continue;
    }
    const tall = rng.int(4, 8 + Math.round(6 * grow));
    cone(cx, cy, rng.range(1.4, 2.2 + grow), tall, false);
    for (let j = rng.int(1, 3); j > 0; j--) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2, 3.5);
      cone(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rng.range(1, 1.6), Math.max(2, Math.round(tall * rng.range(0.3, 0.65))), false);
    }
  }
}

// Snow drifted against the walls and banked along the front cuts, on cold
// open floor. No column stands more than a voxel above a neighbour, so the
// powder lies still.
function drifts(v: Voxels, L: Layout, rng: Rng, cold: (x: number, y: number) => boolean): void {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const grow = (W - 72) / 98;
  const band = 4 + 6 * grow;
  const bank = 1.5 + 3 * grow;
  const g = new Uint8Array(W * D);
  const s = new Uint8Array(W * D);
  const drift = new Uint8Array(W * D);
  const wallDrift = (out: number, along: number, k: number) => 1.2 + (2 + 3 * grow) * noise2(seed + k, along * 0.12, 0.5) - out * 0.9;
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      let z = floor - 1;
      while (z < H - 1 && v.get(x, y, z) !== M.AIR) z++;
      g[c] = z;
      s[c] = z;
      if (!cold(x, y)) continue;
      let h = Math.max(wallDrift(x - T, y, 0), wallDrift(y - T, x, 1));
      const edge = Math.min(W - 1 - x, D - 1 - y);
      if (edge < band) h = Math.max(h, bank * (1 - edge / band) * (0.5 + noise2(seed + 2, x * 0.08, y * 0.08)));
      h = Math.floor(h);
      if (h > 0) {
        s[c] = Math.min(H - 1, z + h);
        drift[c] = 1;
      }
    }
  }
  for (let changed = true, pass = 0; changed && pass < 32; pass++) {
    changed = false;
    for (let y = T; y < D; y++) {
      for (let x = T; x < W; x++) {
        const c = x + W * y;
        if (!drift[c]) continue;
        let lo = 255;
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= T && ny >= T && nx < W && ny < D) lo = Math.min(lo, s[nx + W * ny]);
        }
        if (s[c] > lo + 1) {
          s[c] = Math.max(g[c], lo + 1);
          changed = true;
        }
      }
    }
  }
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      for (let z = g[c]; z < s[c]; z++) if (v.get(x, y, z) === M.AIR) v.put(x, y, z, M.SNOW);
    }
  }
}

// A frozen fall down a wall face: narrow at the top, spreading and
// thickening to a mound at its foot, streaked down its length, sunk a voxel
// into the rock.
function icefall(v: Voxels, L: Layout, rng: Rng, f: Fall, keep: Uint8Array, heat: Float32Array): void {
  const { W, H, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const span = H - 1 - floor;
  for (let z = floor; z < H; z++) {
    const t = (H - 1 - z) / span; // 0 at the top, 1 at the floor
    const w = f.half * (0.4 + 0.6 * t * t) + (noise2(seed, z * 0.2, 0) - 0.5) * 1.6;
    if (w < 0.4) continue;
    for (let a = Math.floor(f.a - w); a <= Math.ceil(f.a + w); a++) {
      const d = Math.abs(a + 0.5 - f.a) / w;
      if (d > 1) continue;
      const thick = Math.max(1, Math.round((1 - d) * (0.5 + 2.6 * t ** 3)));
      const streak = Math.min(7, 2 + Math.floor(hash3(seed, a, 0, z >> 3) * 4) + (t > 0.9 ? 1 : 0));
      for (let o = -1; o < thick; o++) {
        const [x, y] = onWall(L, f.wall, a, o);
        if (!v.inside(x, y, z) || keep[x + W * y] || heat[x + W * y] < COLD) continue;
        const m = v.get(x, y, z);
        if (o < 0 ? isSolid(m) || m === M.AIR : m === M.AIR || POWDER[m]) v.put(x, y, z, M.ICE, streak);
      }
    }
  }
}

// Columns (x, y) where a flame burns or will: every fire voxel, and the
// hearth under each cauldron.
function flameColumns(v: Voxels, L: Layout): Array<[number, number]> {
  const lit = new Uint8Array(L.W * L.D);
  for (let z = L.floor; z < Math.min(L.H, L.floor + 24); z++) {
    for (let y = 0; y < L.D; y++) {
      for (let x = 0; x < L.W; x++) if (v.mat[v.idx(x, y, z)] === M.FIRE) lit[x + L.W * y] = 1;
    }
  }
  for (const s of L.slots) {
    if (s.kind === 'run') lit[wx(s, Math.floor(s.len / 2), Math.floor(s.dep / 2)) + L.W * wy(s, Math.floor(s.len / 2), Math.floor(s.dep / 2))] = 1;
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < lit.length; i++) if (lit[i]) out.push([i % L.W, Math.floor(i / L.W)]);
  return out;
}

// Icicles off the tops of the inner wall faces, under a rim of ice along
// the top: a long spike with shorter ones beside and in front of it.
function icicles(v: Voxels, L: Layout, rng: Rng, coldAt: (x: number, y: number) => boolean): void {
  const { W, D, H, T, floor } = L;
  const grow = (W - 72) / 98;
  const minZ = floor + ICICLE_FLOOR;
  const seed = rng.int(0, 0x3fffffff);
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    for (let a = T; a < end; a++) {
      for (let z = H - 3; z < H; z++) {
        const [x, y] = onWall(L, wall, a, -1);
        if (coldAt(x, y) && noise2(seed + (wall === 'left' ? 0 : 1), a * 0.25, z * 0.5) > 0.42 && isSolid(v.get(x, y, z))) v.put(x, y, z, M.ICE, 5);
      }
    }
  }
  const spike = (wall: 'left' | 'right', a: number, o: number, n: number) => {
    for (let i = 0; i < n; i++) {
      const z = H - 1 - i;
      if (z < minZ) return;
      const [x, y] = onWall(L, wall, a, o);
      if (v.get(x, y, z) !== M.AIR || !coldAt(x, y)) return;
      v.put(x, y, z, M.ICE, i >= n - 2 ? 7 : 5 + (i & 1));
    }
  };
  for (let k = Math.round((W + D) / 4); k > 0; k--) {
    const wall = rng.chance(0.5) ? 'left' : 'right';
    const a = rng.int(T + 1, (wall === 'left' ? D : W) - 2);
    const n = rng.int(3, 6 + Math.round(8 * grow));
    spike(wall, a, 0, n);
    spike(wall, a + 1, 0, Math.round(n * rng.range(0.4, 0.8)));
    if (n > 4) {
      spike(wall, a - 1, 0, Math.round(n * 0.35));
      spike(wall, a, 1, Math.round(n * 0.45));
    }
  }
}

// Snow capping the wall tops, short of the inner edge, packed to ice under
// it here and there (solid, so the slabs stay rock).
function caps(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, H, T } = L;
  const seed = rng.int(0, 0x3fffffff);
  const wall = (x: number, y: number) => x < T || y < T;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      if (!wall(x, y)) continue;
      if (DIRS.some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < W && y + dy < D && !wall(x + dx, y + dy))) continue;
      let z = H - 1;
      while (z > 0 && v.get(x, y, z) === M.AIR) z--;
      v.put(x, y, z, M.SNOW);
      if (noise2(seed, x * 0.2, y * 0.2) > 0.45) v.put(x, y, z - 1, M.ICE, 6);
    }
  }
}

// A dusting of snow on whatever juts from the wall faces (bulges in the
// rock, the steps of an icefall, the tops of props, not their shelves),
// where it is cold: near the fires only up where no flame reaches.
function ledges(v: Voxels, L: Layout, heat: Float32Array, high: (x: number, y: number) => boolean): void {
  const { W, D, H, T, floor } = L;
  const rects = L.slots.map(slotRect);
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    for (let a = T; a < end; a++) {
      for (let o = 0; o < 2; o++) {
        const [x, y] = onWall(L, wall, a, o);
        let z0 = heat[x + W * y] >= COLD ? floor + 2 : high(x, y) ? floor + ICICLE_FLOOR : H;
        if (rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1)) z0 = Math.max(z0, v.ground(x, y));
        for (let z = z0; z < H; z++) {
          if (v.get(x, y, z) === M.AIR && isSolid(v.get(x, y, z - 1))) v.put(x, y, z, M.SNOW);
        }
      }
    }
  }
}

// Belt and braces: no ice or snow within a flame's reach (props keep theirs).
function quench(v: Voxels, L: Layout): void {
  const { W, D, H, T, floor } = L;
  const rects = L.slots.map(slotRect);
  const inProp = (x: number, y: number) => rects.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1);
  const fires: number[] = [];
  for (let i = 0; i < v.size; i++) if (v.mat[i] === M.FIRE) fires.push(i);
  for (const i of fires) {
    const fx = v.xOf(i);
    const fy = v.yOf(i);
    const fz = v.zOf(i);
    for (let z = Math.max(0, fz - 3); z <= Math.min(H - 1, fz + 8); z++) {
      for (let y = Math.max(0, fy - 3); y <= Math.min(D - 1, fy + 3); y++) {
        for (let x = Math.max(0, fx - 3); x <= Math.min(W - 1, fx + 3); x++) {
          const m = v.get(x, y, z);
          if ((m !== M.ICE && m !== M.SNOW) || inProp(x, y)) continue;
          v.put(x, y, z, x < T || y < T || z < floor ? M.ROCK : M.AIR);
        }
      }
    }
  }
}

// True if a grain of powder at (x, y, z) stays put: something under it, and
// on every side either something firm or something to stop a slide.
function settles(v: Voxels, x: number, y: number, z: number): boolean {
  if (z === 0) return true;
  if (!HOLDS[v.get(x, y, z - 1)]) return false;
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= v.W || ny >= v.D) continue;
    if (FIRM[v.get(nx, ny, z)]) continue;
    if (!HOLDS[v.get(nx, ny, z - 1)]) return false;
  }
  return true;
}

// Knocks off every grain that would slide (filling the floor slab with rock
// instead), until all the loose stuff rests.
function settle(v: Voxels, L: Layout): void {
  let list: number[] = [];
  for (let i = 0; i < v.size; i++) if (POWDER[v.mat[i]]) list.push(i);
  for (let pass = 0; pass < 24; pass++) {
    const kept: number[] = [];
    let moved = false;
    for (const i of list) {
      if (!POWDER[v.mat[i]]) continue;
      const x = v.xOf(i);
      const y = v.yOf(i);
      const z = v.zOf(i);
      if (settles(v, x, y, z)) {
        kept.push(i);
        continue;
      }
      if (z < L.floor && x >= L.T && y >= L.T) v.set(i, M.ROCK);
      else v.set(i, M.AIR, 0, 0);
      moved = true;
    }
    if (!moved) return;
    list = kept;
  }
}

// Ice with open air on a side the camera sees (+x, +y or above).
function visibleIce(v: Voxels, L: Layout): Int32Array {
  const out: number[] = [];
  for (let i = 0; i < v.size; i++) {
    if (v.mat[i] !== M.ICE) continue;
    const x = v.xOf(i);
    const y = v.yOf(i);
    const z = v.zOf(i);
    if (z < L.floor - 1) continue;
    if (v.get(x + 1, y, z) === M.AIR || v.get(x, y + 1, z) === M.AIR || v.get(x, y, z + 1) === M.AIR) out.push(i);
  }
  return Int32Array.from(out);
}

// ── props ────────────────────────────────────────────────────────────────
// Wraps a fire prop so steam curls up off it now and then, more often while
// it is worked. `at` is where, in the slot's frame (a, b, h).
function steaming(p: Prop, at: (s: Slot) => readonly [number, number, number], idle: number, busy: number): Prop {
  return {
    ...p,
    tick(c, s, active) {
      p.tick?.(c, s, active);
      if (!c.rng.chance(c.dt * (active ? busy : idle))) return;
      const [a, b, h] = at(s);
      const da = a + c.rng.int(-1, 1);
      const db = b + c.rng.int(-1, 1);
      puff(c, wx(s, da, db), wy(s, da, db), s.z0 + h, M.STEAM, 45);
    },
  };
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const P = plan(L);
  for (const [x, y] of P.braziers) tendBrazier(c, x, y, L.floor);
  snowfall(c, L, P.cold);
  if (c.rng.chance(c.dt * 2.5)) glint(c);
  // The ice holds a little cold light: the falls down the walls (one for
  // the pair in the back corner), the frozen pond.
  for (let k = 0; k < P.falls.length; k++) {
    const f = P.falls[k];
    if (f.a < L.T + 5 && f.wall === 'right') continue;
    const [x, y] = f.a < L.T + 5 ? [L.T + 2, L.T + 2] : onWall(L, f.wall, f.a, 1);
    c.light({ x, y, z: (L.floor + L.H) / 2, color: ICE_LIGHT, radius: 22, intensity: 0.12 + 0.03 * Math.sin(c.t * 0.7 + k * 1.9) });
  }
  const pond = PONDS.get(c.v);
  if (pond) c.light({ x: pond.x, y: pond.y, z: L.floor + 2, color: ICE_LIGHT, radius: clamp(Math.max(pond.rx, pond.ry) * 2.4, 12, 32), intensity: 0.28 + 0.04 * Math.sin(c.t * 0.5) });
  // Every half minute or so a cornice of snow slumps off the back corner.
  if ((c.t + 7) % 30 < 2 && c.rng.chance(0.5)) slough(c, L);
}

// Keeps a brazier burning and lit while its bowl is there.
function tendBrazier(c: Ctx, x: number, y: number, z: number): void {
  if (c.v.get(x, y, z + 2) !== M.METAL) return;
  for (const [dx, dy] of BRAZIER_FLAMES) keepFire(c, x + dx, y + dy, z + 4, BRAZIER_LIFE);
  c.light({ x: x + 0.5, y: y + 0.5, z: z + 5.5, color: FLAME, radius: 22, intensity: 0.8 * flicker(c.t, x * 3 + y * 7) });
  if (c.rng.chance(c.dt * 2)) {
    c.spawn({ kind: 'ember', x: x + c.rng.range(0, 1), y: y + c.rng.range(0, 1), z: z + 5, vx: c.rng.range(-0.5, 0.5), vy: c.rng.range(-0.5, 0.5), vz: c.rng.range(1.5, 3), life: c.rng.range(0.8, 1.6), color: EMBER, glow: true, gravity: -0.5 });
  }
  if (c.rng.chance(c.dt * 0.6)) puff(c, x + c.rng.int(-1, 1), y + c.rng.int(-1, 1), z + 11, M.STEAM, 40);
}

// Snow sifting down over the whole room on a slow, shifting wind. Most
// flakes melt where they touch; one in ten settles, on cold ground only.
function snowfall(c: Ctx, L: Layout, cold: Uint8Array): void {
  const { W, D, H, T, floor } = L;
  const fall = Math.max(4, (H - floor) / 9); // slowest flakes still reach the floor
  const n0 = (((W - T) * (D - T)) / FLAKE_AREA) * c.dt;
  for (let n = Math.floor(n0 + c.rng.next()); n > 0; n--) {
    const x = c.rng.range(T, W);
    const y = c.rng.range(T, D);
    const z = H - c.rng.range(0.05, 1);
    const vx = 0.8 * Math.sin(c.t * 0.11) + c.rng.range(-0.4, 0.4);
    const vy = 0.6 * Math.sin(c.t * 0.07 + 2) + c.rng.range(-0.4, 0.4);
    const vz = -c.rng.range(fall, fall + 2);
    const life = Math.min(9.5, (z - floor) / -vz + 1);
    const lx = Math.floor(x + vx * life);
    const ly = Math.floor(y + vy * life);
    const lands = lx >= T && ly >= T && lx < W && ly < D && cold[lx + W * ly] === 1 && c.rng.chance(LANDS);
    const p: Particle = { kind: lands ? 'debris' : 'drop', x, y, z, vx, vy, vz, life, color: c.rng.pick(FLAKE_GLOW), glow: true, gravity: 0 };
    if (lands) p.mat = M.SNOW;
    c.spawn(p);
  }
}

// A glint off a random bit of exposed ice.
function glint(c: Ctx): void {
  const spots = ICE_SEEN.get(c.v);
  if (!spots || !spots.length) return;
  const v = c.v;
  const i = spots[c.rng.int(0, spots.length - 1)];
  if (v.mat[i] !== M.ICE) return;
  const x = v.xOf(i);
  const y = v.yOf(i);
  const z = v.zOf(i);
  const [ox, oy, oz] = v.get(x, y, z + 1) === M.AIR ? [0, 0, 1] : v.get(x + 1, y, z) === M.AIR ? [1, 0, 0] : [0, 1, 0];
  c.spawn({ kind: 'glint', x: x + 0.5 + ox * 0.6, y: y + 0.5 + oy * 0.6, z: z + 0.5 + oz * 0.6, vx: 0, vy: 0, vz: 0, life: c.rng.range(0.25, 0.6), color: c.rng.pick(GLINTS), glow: true, gravity: 0 });
}

// A clump of snow sliding off the wall top in the back corner.
function slough(c: Ctx, L: Layout): void {
  const a = L.T + c.rng.range(0.2, 3);
  const left = c.rng.chance(0.5);
  c.spawn({
    kind: 'debris',
    x: left ? L.T + 0.3 : a,
    y: left ? a : L.T + 0.3,
    z: L.H - 0.5,
    vx: c.rng.range(0, 1.2),
    vy: c.rng.range(0, 1.2),
    vz: -1,
    life: 4,
    color: c.rng.pick(FLAKES),
    glow: false,
    gravity: 24,
    mat: M.SNOW,
  });
}

export const snowy: Biome = {
  id: 'snowy',
  name: 'Snowy Depths',
  tagline: 'Frozen falls, drifted snow and a pond iced over',
  palette: PALETTE,
  backdrop: hex('#04060a'),
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
};

export default snowy;
