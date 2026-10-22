import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { keepClear, openSites, slotRect, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { beams, buildTorch, fillStrata, fuelNear, hangers, heap, makeProps, noise2, onWall, pit, roughenWalls, tendTorch, tone, TORCH_LIFE, veins } from '../props.ts';
import type { Biome, Ctx, Grade, Layout, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// The Mines: the first stretch below the surface. Brown rock in layers of
// dirt and dark stone, coal seams and gold veins, timbered walls lit by
// torches, a pool of seep water and a slick of oil.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#0a0705'),
  wall: hex('#1b140f'),
  wall2: hex('#211811'),
  floor: hex('#2b2118'),
  floor2: hex('#241b13'),
  text: hex('#ecd9b4'),
  dim: hex('#8c7556'),
  accent: hex('#f2b33d'),
  accent2: hex('#ff7b2e'),
  panel: hex('#120c08'),
  panelText: hex('#ecd9b4'),
  border: hex('#6e4b2a'),
  bubble: hex('#f4e7c9'),
  bubbleText: hex('#1c130b'),
  good: hex('#9ad46a'),
  warn: hex('#ffb13b'),
  bad: hex('#ff4f3a'),
};

const GRADE: Grade = { ambient: hex('#786250'), illum: 1.2, bloom: 0.6, vignette: 0.3 };

// What the props are made of here; other biomes reuse the props with their own.
export const MINES_MATS: PropMats = {
  frame: M.WOOD,
  metal: M.METAL,
  cloth: M.CLOTH,
  stone: M.BRICK,
  stone2: M.ROCK_DARK,
  glow: M.CRYSTAL,
  liquid: M.POTION,
  quench: M.WATER,
  candle: M.CANDLE,
  ore: M.GOLD_ORE,
  seam: M.COAL,
  rubble: M.GRAVEL,
  fuel: M.COAL,
  trim: M.GOLD_ORE,
  bone: M.BONE,
  books: [M.CLOTH, M.WOOD, M.BONE, M.OBSIDIAN, M.MOSS, M.BRICK, M.METAL],
  rune: hex('#ffd98a'),
};

const PROPS = makeProps(MINES_MATS);

// Rock layers bottom to top: [material, weight, min, max thickness].
const STRATA: Strata = {
  bands: [
    [M.ROCK, 5, 3, 7],
    [M.ROCK_DARK, 3, 2, 4],
    [M.DIRT, 2, 1, 3],
  ],
  topsoil: [
    [M.DIRT, 4, 2, 4],
    [M.ROCK, 1, 1, 2],
  ],
  soilDepth: 7,
  seam: M.COAL,
  seams: 3,
  warp: 3,
};

const ROCKY = new Set<number>([M.ROCK, M.ROCK_DARK, M.DIRT, M.COAL]);
const FIERY = new Set<SlotKind>(['run', 'think', 'idle', 'entrance']); // props that keep a flame

const BEAM_H = 22; // the timber header, above the floor
const TORCH_H = 13; // wall torch cups, above the floor
const TORCH_GAP = 16; // at least this far apart
const OIL_CLEAR = 14; // oil stays this far from any flame

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, T, floor } = L;
  clear(v);
  const keep = keepClear(L);

  // Pools: seep water, and oil in whichever site is farthest from the fires.
  const wr = clamp(Math.round(W * 0.075), 5, 11);
  const or = clamp(Math.round(W * 0.05), 3, 7);
  const sites = openSites(L, rng, [
    [wr, Math.round(wr * 0.7)],
    [or, Math.round(or * 0.75)],
  ]);
  sites.sort((a, b) => fireDistance(L, b) - fireDistance(L, a));
  const oil = sites.length > 1 && fireDistance(L, sites[0]) >= OIL_CLEAR + Math.max(sites[0].rx, sites[0].ry) ? sites[0] : null;
  const water = sites.find((s) => s !== oil) ?? null;

  // Rock: walls, floor, a lip along the front cuts, boulders and stalagmites.
  const free = freeFloor(L, keep, sites);
  const top = columnTops(L, rng, free);
  fillStrata(v, L, rng, STRATA, top);
  soil(v, L, rng, top);
  veins(v, L, rng, M.GOLD_ORE, Math.round((W * D) / 700), (m) => ROCKY.has(m));
  roughenWalls(v, L, rng);

  if (water) {
    pit(v, L, water, Math.min(4, floor - 2), M.WATER);
    rim(v, L, rng, water, M.MOSS);
  }
  if (oil) {
    pit(v, L, oil, 2, M.OIL);
    rim(v, L, rng, oil, M.DIRT);
  }

  // Timbering: posts at the corner, between props and at the front cut,
  // with a header along the top.
  for (const wall of ['left', 'right'] as const) beams(v, L, wall, posts(L, wall), floor + BEAM_H, M.WOOD);

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  // Wall torches wherever nothing that burns is near (mostly over props).
  const lit: Array<[number, number]> = [];
  for (const [x, y, z] of torchSites(L)) {
    if (lit.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < TORCH_GAP)) continue;
    if (oil && Math.hypot(oil.x - x, oil.y - y) < Math.max(oil.rx, oil.ry) + OIL_CLEAR) continue;
    if (fuelNear(v, x, y, z - 3, z + TORCH_LIFE, 3, 0)) continue; // a tongue climbs TORCH_LIFE - 1 at most
    buildTorch(v, x, y, z, MINES_MATS);
    lit.push([x, y]);
  }

  // Spill in the back corner: gravel with a lick of sand from the crack above.
  const r = clamp(5 + (W - 72) / 30, 5, 8);
  const skip = (x: number, y: number) => keep[x + W * y] === 1;
  heap(v, L, T, T, r, M.GRAVEL, skip);
  heap(v, L, T, T + 2, r * 0.6, M.SAND, skip);
  litter(v, L, rng, free);

  hangers(v, L, rng, M.WOOD, M.MOSS, Math.round((W + D) / 9), floor + BEAM_H + 2);

  // The crack the sand trickles from: a notch in the face, open in front.
  const [cx, cy, cz] = crack(L);
  for (let z = cz - 1; z <= cz + 1; z++) {
    v.put(cx - 1, cy, z, M.AIR);
    v.put(cx, cy, z, M.AIR);
  }
}

// Where sand trickles from, over the corner heap.
function crack(L: Layout): [number, number, number] {
  return [L.T, L.T + 2, L.H - 3];
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Distance from a site to the nearest prop that keeps a flame.
function fireDistance(L: Layout, s: Site): number {
  let best = Infinity;
  for (const slot of L.slots) {
    if (!FIERY.has(slot.kind)) continue;
    const r = slotRect(slot);
    const dx = Math.max(r.x0 - s.x, 0, s.x - r.x1);
    const dy = Math.max(r.y0 - s.y, 0, s.y - r.y1);
    best = Math.min(best, Math.hypot(dx, dy));
  }
  return best;
}

// Floor cells free for decor: not where agents work or walk, not round the pools.
function freeFloor(L: Layout, keep: Uint8Array, pools: readonly Site[]): Uint8Array {
  const { W, D, T } = L;
  const free = new Uint8Array(W * D);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      if (keep[x + W * y]) continue;
      if (pools.some((p) => ((x - p.x) / (p.rx + 3)) ** 2 + ((y - p.y) / (p.ry + 3)) ** 2 <= 1)) continue;
      free[x + W * y] = 1;
    }
  }
  return free;
}

// Height of the rock in every column: the walls to H (a ragged voxel off
// the top here and there), the floor to `floor`, with a rocky lip rising
// along the front cuts, bumps, boulders and stalagmites on free floor.
// Everything scales up a little with the chunk.
function columnTops(L: Layout, rng: Rng, free: Uint8Array): Uint8Array {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  const grow = (W - 72) / 98; // 0 at the smallest chunk, 1 at the largest
  const band = 5 + Math.round(grow * 8);
  const lip = 3 + grow * 6;
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
        const b = noise2(seed + 2, x * 0.35, y * 0.35);
        if (b > 0.74) h++;
        if (b > 0.88) h++;
      }
      top[c] = h;
    }
  }
  // Boulders (low domes) and stalagmites (tall cones).
  for (let k = Math.round((W * D) / 1200); k > 0; k--) {
    const cx = rng.int(T + 2, W - 3);
    const cy = rng.int(T + 2, D - 3);
    if (!free[cx + W * cy]) continue;
    const spike = rng.chance(0.4);
    const r = spike ? rng.range(1.6, 2.6 + grow) : rng.range(1.5, 3.2 + 2 * grow);
    const tall = spike ? rng.int(5, 10 + Math.round(4 * grow)) : rng.int(2, 4 + Math.round(2 * grow));
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const c = x + W * y;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1 || !free[c]) continue;
        const h = Math.round(tall * (spike ? (1 - d) ** 1.5 : Math.sqrt(1 - d * d)));
        top[c] = Math.max(top[c], floor + h);
      }
    }
  }
  return top;
}

// Loose stuff on the open floor: drifts of gravel and sand, and the odd
// gold nugget glinting in the dark.
function litter(v: Voxels, L: Layout, rng: Rng, free: Uint8Array): void {
  const { W, D, T } = L;
  const open = (x: number, y: number) => x >= T && y >= T && x < W && y < D && free[x + W * y] === 1;
  for (let k = Math.round((W * D) / 3000); k > 0; k--) {
    const x = rng.int(T + 3, W - 4);
    const y = rng.int(T + 3, D - 4);
    if (open(x, y)) heap(v, L, x, y, rng.range(2, 4), rng.chance(0.6) ? M.GRAVEL : M.SAND, (hx, hy) => !open(hx, hy));
  }
  for (let k = Math.round((W * D) / 2500); k > 0; k--) {
    const x = rng.int(T + 2, W - 3);
    const y = rng.int(T + 2, D - 3);
    if (!open(x, y)) continue;
    const z = v.ground(x, y);
    if (v.get(x, y, z) === M.AIR) v.put(x, y, z, M.GOLD_DUST);
  }
}

// The floor's top voxel: packed dirt with rock showing through and loose
// gravel here and there.
function soil(v: Voxels, L: Layout, rng: Rng, top: Uint8Array): void {
  const { W, D, T } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const z = top[x + W * y] - 1;
      const n = noise2(seed, x * 0.16, y * 0.16);
      v.put(x, y, z, n < 0.22 ? M.ROCK : n > 0.84 ? M.GRAVEL : M.DIRT);
      if (n > 0.4) v.put(x, y, z - 1, M.DIRT);
    }
  }
}

// A solid lip round a pool (no loose grains to slide in), with `mat`
// creeping out over the floor beside it.
function rim(v: Voxels, L: Layout, rng: Rng, s: Site, mat: number): void {
  const z = L.floor - 1;
  for (let y = Math.floor(s.y - s.ry - 2); y <= Math.ceil(s.y + s.ry + 2); y++) {
    for (let x = Math.floor(s.x - s.rx - 2); x <= Math.ceil(s.x + s.rx + 2); x++) {
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e <= 1 || e > 2.2) continue;
      v.put(x, y, z, mat);
      if (mat === M.MOSS && e < 1.6 && rng.chance(0.5) && v.get(x, y, z + 1) === M.AIR) v.put(x, y, z + 1, mat);
    }
  }
}

// Post positions along a wall: one at the back corner, one in every gap
// between props wide enough for it, one at the front cut.
function posts(L: Layout, wall: 'left' | 'right'): number[] {
  const end = wall === 'left' ? L.D : L.W;
  const out = [L.T];
  for (const [a0, a1] of wallGaps(L, wall)) {
    if (a0 === L.T) continue;
    if (a1 === end) {
      if (a1 - a0 >= 4) out.push(end - 2);
    } else if (a1 - a0 >= 4) {
      out.push(Math.floor((a0 + a1) / 2) - 1);
    }
  }
  return out;
}

// Where wall torches may hang (cup positions): over the middle of every
// gap between props, then over every prop. generate() lights those with no
// fuel near; weather() tends whichever are there.
const TORCH_SITES = new WeakMap<Layout, Array<[number, number, number]>>();

function torchSites(L: Layout): Array<[number, number, number]> {
  const hit = TORCH_SITES.get(L);
  if (hit) return hit;
  const out: Array<[number, number, number]> = [];
  for (const wall of ['left', 'right'] as const) {
    const along: number[] = [];
    for (const [a0, a1] of wallGaps(L, wall)) if (a0 > L.T && a1 - a0 >= 3) along.push(Math.floor((a0 + a1) / 2));
    for (const s of L.slots) if (s.wall === wall) along.push((wall === 'left' ? s.y0 : s.x0) + Math.floor(s.len / 2));
    for (const a of along) {
      const [x, y] = onWall(L, wall, a, 0);
      out.push([x, y, L.floor + TORCH_H]);
    }
  }
  TORCH_SITES.set(L, out);
  return out;
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  for (const [x, y, z] of torchSites(L)) tendTorch(c, x, y, z, MINES_MATS);
  if (c.rng.chance(c.dt * 0.3)) drip(c, L);
  // Every 40 s or so sand trickles for a moment from a crack over the corner heap.
  if ((c.t + 13) % 40 < 2.5 && c.rng.chance(0.6)) {
    const [x, y, z] = crack(L);
    if (c.v.get(x, y, z) === M.AIR) c.v.put(x, y, z, M.SAND, c.rng.int(0, 7));
  }
}

// A drop of seep water off the top of a wall face, never over a prop.
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
    c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: L.H - 0.5, vx: 0, vy: 0, vz: 0, life: 4, color: tone(M.WATER, 6), glow: false, gravity: 30, mat: M.WATER });
    return;
  }
}

export const mines: Biome = {
  id: 'mines',
  name: 'The Mines',
  tagline: 'Timbered shafts, coal seams and the glint of gold',
  palette: PALETTE,
  backdrop: hex('#060403'),
  grade: GRADE,
  generate,
  props: PROPS,
  weather,
};

export default mines;
