import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { slotsOn, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { digFace, entrance, fillStrata, flicker, hangers, hash3, heap, isFlammable, isSolid, keepFire, makeProps, noise2, onWall, pit, puff, roughenWalls, veins, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';
import type { Disc, Pt } from './floor.ts';
import { by, calm, campfirePoi, Floor, growth, scatter, WORN } from './floor.ts';

// Hell: the bottom of everything. Blood-red and black rock banded with
// obsidian and veined with brimstone, a field of bones round a bone throne,
// a lake and a pond of lava in obsidian basins, cracks of lava running
// across the floor, a lava fall pouring into a basin in the back corner,
// obsidian spires, brimstone outcrops and vents that spit flame.
// Everything near the heat is stone, metal or bone, so the place glows
// without burning down.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#0c0404'),
  wall: hex('#1f0a09'),
  wall2: hex('#280d0b'),
  floor: hex('#30110e'),
  floor2: hex('#270e0c'),
  text: hex('#f0e4cc'),
  dim: hex('#9a6a58'),
  accent: hex('#ff7a1f'),
  accent2: hex('#d0201c'),
  panel: hex('#140505'),
  panelText: hex('#f0e4cc'),
  border: hex('#7c1c16'),
  bubble: hex('#f2e8d2'),
  bubbleText: hex('#1e0806'),
  good: hex('#b5d45a'),
  warn: hex('#ffb02e'),
  bad: hex('#ff3a2a'),
};

const GRADE: Grade = { ambient: hex('#8a4c36'), illum: 2, bloom: 1, vignette: 0.2 };

// Blood-red and black rock, sulphur-bright brimstone, blood-dyed cloth and
// black wax.
const COLORS: Partial<Record<number, string>> = {
  [M.ROCK]: '#983a26',
  [M.ROCK_DARK]: '#4c2622',
  [M.GRAVEL]: '#4e2e28',
  [M.BRICK]: '#6a2018',
  [M.CLOTH]: '#6e1420',
  [M.CANDLE]: '#3b1d20',
  [M.BRIMSTONE]: '#c49a22',
  [M.ASH]: '#4f4744',
};

// What the props are made of here: obsidian for timber, brick for stone,
// lava in the cauldron and the anvil's crucible.
export const HELL_MATS: PropMats = {
  frame: M.OBSIDIAN,
  metal: M.METAL,
  cloth: M.CLOTH,
  stone: M.BRICK,
  stone2: M.OBSIDIAN,
  glow: M.CRYSTAL,
  liquid: M.LAVA,
  quench: M.LAVA,
  candle: M.CANDLE,
  ore: M.BRIMSTONE,
  seam: M.BONE,
  rubble: M.GRAVEL,
  fuel: M.BRIMSTONE,
  trim: M.GOLD_ORE,
  bone: M.BONE,
  books: [M.BONE, M.OBSIDIAN, M.BRICK, M.METAL, M.CLOTH, M.ROCK_DARK, M.GOLD_ORE],
  rune: hex('#ff8a3d'),
};

const PROPS: Record<SlotKind, Prop> = {
  ...makeProps(HELL_MATS),
  search: digFace({ ...HELL_MATS, frame: M.METAL }), // iron-braced, so obsidian in the face still digs
  entrance: boneGate(HELL_MATS),
};

// An obsidian statue, trimmed in bone and gold.
const BUILD: BuildStyle = { mats: [M.OBSIDIAN, M.ROCK_DARK, M.BONE, M.GOLD_ORE], shape: 'statue' };

// Rock layers bottom to top: [material, weight, min, max thickness].
const STRATA: Strata = {
  bands: [
    [M.ROCK, 5, 3, 7],
    [M.ROCK_DARK, 3, 2, 4],
    [M.OBSIDIAN, 1, 1, 2],
  ],
  topsoil: [
    [M.ROCK_DARK, 3, 2, 4],
    [M.ROCK, 2, 1, 3],
  ],
  soilDepth: 6,
  seam: M.OBSIDIAN,
  seams: 2,
  warp: 4,
};

const ROCKY = new Set<number>([M.ROCK, M.ROCK_DARK]);

const SCONCE_H = 16; // lava sconces, above the floor
const SCONCE_GAP = 18; // at least this far apart
const CHAIN_H = 22; // chains hang no lower than this above the floor
const HEAT_CLEAR = 3; // nothing that burns this close to lava
const JET = 1.6; // seconds a vent spits flame
const JET_H = 9; // the jet's tallest column of flame
const FAR = 8; // brimstone on the floor stays this far from any heat

const LAVA_GLOW: RGB = hex('#ff5a14');
const FLAME: RGB = hex('#ff9a3c');
const EMBERS: readonly RGB[] = [hex('#ffd27a'), hex('#ff9a3c'), hex('#ff6a1f'), hex('#e8401a')];
const DROPS: readonly RGB[] = [hex('#ffc04a'), hex('#ff8a24'), hex('#ff6a1a')];
const SPARKS: readonly RGB[] = [hex('#fff2b0'), hex('#ffc84a'), hex('#ff8a2a')];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// What weather() needs from generate(): where the heat is.
type Basin = { rx: number; ry: number; cells: Array<[number, number]>; fall: [number, number] };
type Hell = {
  pools: Site[];
  surface: Array<[number, number, number]>; // the lava's top voxels in the pools and cracks
  basin: Basin | null;
  vents: Array<[number, number]>;
  sconces: Array<[number, number, number]>; // each one's middle lava voxel
  cracks: Array<[number, number, number]>; // a few lava voxels along each crack, glowing
};
const STATE = new WeakMap<Voxels, Hell>();

// ── plan ─────────────────────────────────────────────────────────────────
// Where everything the characters visit goes, from the layout alone (so
// pois() agrees with generate()): the lava lake and pond (warm, at a safe
// distance), the basin under the fall (a view of it), the bone field with
// its throne (a seat) and an imp, the spires; and the vents, away from
// every walkway.
type Plan = {
  floor: Floor;
  pools: Disc[];
  basin: Basin | null;
  bones: Disc | null;
  throne: Pt | null;
  spires: Disc[];
  vents: Array<[number, number]>;
  outcrops: Disc[];
};

const PLANS = new WeakMap<Layout, Plan>();

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W, H, T, floor } = L;
  const f = new Floor(L, 'hell');
  const g = growth(L);
  const hub = f.hub;
  const span = H - floor;
  const basin = cornerBasin(L, f.keep);
  if (basin) {
    // Stand back from the basin and watch the fall.
    const [fx, fy] = basin.fall;
    for (const k of [6, 8, 10, 4]) {
      const p: Poi = { x: T + basin.rx + k, y: fy + Math.round(k * 0.7), kind: 'view', face: { x: fx, y: fy } };
      if (f.reachable(p, null)) {
        f.addPoi(p);
        break;
      }
    }
  }
  // Lava: a lake and a pond, each in a crust (the disc covers the crust), warm at a safe distance.
  const lr = clamp(Math.round(W * 0.11), 6, 16);
  const pr = clamp(Math.round(W * 0.05), 3, 7);
  const pools: Disc[] = [];
  for (const [r, fx, fy] of [[lr, 0.76, 0.78], [pr, 0.93, 0.5]] as const) {
    const d = f.place(Math.round(r * 1.65), f.at(fx, fy), { min: Math.round(r * 1.1), pois: (s) => [by(s, 'warm', 2, hub)] });
    if (d) pools.push(d);
  }
  // The bone field: a throne of bones to sit on, an imp among the skulls.
  let throne: Pt | null = null;
  const bones = f.place(Math.round(7 + 4 * g), f.at(0.42, 0.93), {
    min: 5,
    inside: true,
    pois: (s) => [
      { x: Math.round(s.x), y: Math.round(s.y), kind: 'seat', face: { x: Math.round(hub.x), y: Math.round(hub.y) } },
      by({ ...s, r: s.r - 2 }, 'pet', 0, hub, 1.6),
    ],
  });
  if (bones) throne = { x: Math.round(bones.x), y: Math.round(bones.y) };
  const warm = f.pois.length < 4 ? campfirePoi(L) : null;
  if (warm && f.reachable(warm, null)) f.addPoi(warm);
  // Obsidian spires, tall and black.
  const spires: Disc[] = [];
  for (let k = Math.round(1 + 3 * g); k > 0; k--) {
    const tall = span * f.rng.range(0.35, 0.6);
    const d = f.place(f.rng.range(3, 3.5 + 1.5 * g), f.at(f.rng.range(0.3, 1), f.rng.range(0.3, 1)), { min: 2.5, spread: 60, tall, ok: (s) => !f.hides(s.x, s.y, s.r, tall) });
    if (d) spires.push({ ...d, tall });
  }
  // Vents, well off every walkway; brimstone outcrops, well away from the heat.
  const vents: Array<[number, number]> = [];
  for (let k = Math.round(2 + 4 * g); k > 0; k--) {
    const d = f.place(4, f.at(f.rng.range(0.25, 1), f.rng.range(0.25, 1)), { min: 4, gap: 3, spread: 60 });
    if (d) vents.push([Math.round(d.x), Math.round(d.y)]);
  }
  const hot = (s: Disc) =>
    pools.some((p) => Math.hypot(s.x - p.x, s.y - p.y) < p.r + s.r + FAR) || vents.some(([x, y]) => Math.hypot(s.x - x, s.y - y) < s.r + FAR) || (basin !== null && s.x < T + basin.rx + FAR + s.r && s.y < T + basin.ry + FAR + s.r);
  const outcrops: Disc[] = [];
  for (let k = Math.round(1 + 3 * g); k > 0; k--) {
    const d = f.place(f.rng.range(3, 4 + 2 * g), f.at(f.rng.range(0.25, 1), f.rng.range(0.25, 1)), { min: 2.5, spread: 60, ok: (s) => !hot(s) });
    if (d) outcrops.push(d);
  }
  const P: Plan = { floor: f, pools, basin, bones, throne, spires, vents, outcrops };
  PLANS.set(L, P);
  return P;
}

// A disc site as the ellipse of a pool, its crust inside the disc.
function ellipse(d: Disc, flat: number): Site {
  const rx = Math.max(2, d.r / 1.65);
  return { x: Math.round(d.x), y: Math.round(d.y), rx, ry: Math.max(2, rx * flat) };
}

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, T, floor } = L;
  clear(v);
  const P = plan(L);
  const pools = P.pools.map((d, k) => ellipse(d, k ? 0.8 : 0.7));
  const basin = P.basin;
  const vents = P.vents;

  // Rock: walls, floor, a lip along the front cuts, bumps and boulders.
  const free = P.floor.free(2);
  const top = columnTops(L, rng, free, P.spires, P.outcrops);
  fillStrata(v, L, rng, STRATA, top);
  scorch(v, L, rng, top, P.floor.trails);
  veins(v, L, rng, M.OBSIDIAN, Math.round((W * D) / 900), (m) => ROCKY.has(m));
  veins(v, L, rng, M.BRIMSTONE, Math.round((W * D) / 1500), (m) => ROCKY.has(m), [4, 9]);
  roughenWalls(v, L, rng);
  for (const d of P.outcrops) brimstone(v, L, rng, d, top);

  const depth = Math.min(4, floor - 2);
  for (const p of pools) {
    pit(v, L, p, depth, M.LAVA);
    crust(v, L, rng, p);
  }
  const cracks = fissures(v, L, rng, P, pools);
  if (basin) buildBasin(v, L, basin);
  for (const [x, y] of vents) buildVent(v, L, rng, x, y);
  // Before the props: their fire beds are meant to burn.
  cool(v, L, vents);

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  const sconces = buildSconces(v, L);
  const far = (x: number, y: number) => {
    if (pools.some((p) => Math.hypot(x - p.x, y - p.y) < Math.max(p.rx, p.ry) + FAR)) return false;
    if (basin && x < T + basin.rx + FAR && y < T + basin.ry + FAR) return false;
    if (vents.some(([vx, vy]) => Math.hypot(x - vx, y - vy) < FAR)) return false;
    if (cracks.some(([cx, cy]) => Math.hypot(x - cx, y - cy) < FAR)) return false;
    return !sconces.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < FAR);
  };
  if (P.bones) boneField(v, L, rng, P.bones, P.throne, P.floor);
  litter(v, L, rng, free, far);
  hangers(v, L, rng, M.METAL, M.BRIMSTONE, Math.round((W + D) / 10), floor + CHAIN_H);
  if (basin) carveFall(v, L, basin);

  const surface: Array<[number, number, number]> = [];
  const z = floor - 2;
  for (const p of pools) {
    for (let y = Math.floor(p.y - p.ry); y <= Math.ceil(p.y + p.ry); y++) {
      for (let x = Math.floor(p.x - p.rx); x <= Math.ceil(p.x + p.rx); x++) if (v.get(x, y, z) === M.LAVA && v.get(x, y, z + 1) === M.AIR) surface.push([x, y, z]);
    }
  }
  STATE.set(v, { pools, surface, basin, vents, sconces, cracks });
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// A quarter-ellipse basin in the back corner, between the two walls and
// clear of the first prop on each: the lava fall pours into it. Null when
// the corner is too tight.
function cornerBasin(L: Layout, keep: Uint8Array): Basin | null {
  const { W, T } = L;
  const xe = Math.min(...slotsOn(L, 'right').map((s) => s.x0)) - 3;
  const ye = Math.min(...slotsOn(L, 'left').map((s) => s.y0)) - 3;
  for (let shrink = 0; shrink < 3; shrink++) {
    const rx = Math.min(8, xe - T) - shrink; // the rim reaches T + rx
    const ry = Math.min(8, ye - T) - shrink;
    if (rx < 3 || ry < 4) return null;
    const inside = (x: number, y: number) => x >= T && y >= T && ((x - T + 0.5) / rx) ** 2 + ((y - T + 0.5) / ry) ** 2 < 1;
    const cells: Array<[number, number]> = [];
    let ok = true;
    for (let y = T; y <= T + ry; y++) {
      for (let x = T; x <= T + rx; x++) {
        const near = inside(x, y) || inside(x - 1, y) || inside(x + 1, y) || inside(x, y - 1) || inside(x, y + 1) || inside(x - 1, y - 1) || inside(x + 1, y + 1) || inside(x - 1, y + 1) || inside(x + 1, y - 1);
        if (near && keep[x + W * y]) ok = false;
        if (inside(x, y)) cells.push([x, y]);
      }
    }
    if (!ok) continue;
    const fy = T + Math.round(ry * 0.4);
    return { rx, ry, cells, fall: [T, fy] };
  }
  return null;
}

// Height of the rock in every column: the walls to H (a ragged voxel off
// the top here and there), the floor to `floor`, with a lip rising along
// the front cuts, bumps and low boulders on free floor.
function columnTops(L: Layout, rng: Rng, free: Uint8Array, spires: readonly Disc[], outcrops: readonly Disc[]): Uint8Array {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  const grow = growth(L);
  const band = 5 + Math.round(grow * 8);
  const lip = 3 + grow * 6;
  const cells: number[] = [];
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      const c = x + W * y;
      if (x < T || y < T) {
        top[c] = H - (noise2(seed, x * 0.3, y * 0.3) > 0.78 ? 1 : 0);
        continue;
      }
      let h = floor;
      if (free[c]) {
        cells.push(c);
        const edge = Math.min(W - 1 - x, D - 1 - y);
        if (edge < band) h += Math.max(0, Math.round((noise2(seed + 1, x * 0.09, y * 0.09) * 1.4 - 0.4) * lip * (1 - edge / band) ** 2));
        const b = noise2(seed + 2, x * 0.35, y * 0.35);
        if (b > 0.74) h++;
        if (b > 0.88) h++;
      }
      top[c] = h;
    }
  }
  const raise = (cx: number, cy: number, r: number, tall: number, shape: (d: number) => number, ok: (c: number) => boolean) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const c = x + W * y;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1 || x < T || y < T || x >= W || y >= D || !ok(c)) continue;
        top[c] = Math.min(H - 2, Math.max(top[c], floor + Math.round(tall * shape(d))));
      }
    }
  };
  // Boulders, low and lumpy.
  for (let k = Math.round(cells.length / 260); k > 0 && cells.length; k--) {
    const c = cells[rng.int(0, cells.length - 1)];
    const r = rng.range(1.5, 3 + 3 * grow);
    raise(c % W, Math.floor(c / W), r, rng.int(2, 3 + Math.round(3 * grow)), (d) => Math.sqrt(1 - d * d) * (0.7 + 0.3 * noise2(seed + 3, d * 5, r)), (cc) => free[cc] === 1);
  }
  // Brimstone outcrops: craggy mounds (brimstone() yellows them).
  for (const d of outcrops) raise(d.x, d.y, d.r, Math.round(4 + d.r), (q) => Math.max(0.2, (1 - q * q) * (0.6 + 0.5 * noise2(seed + 4, q * 4, d.x))), () => true);
  // Spires: tall black cones.
  for (const d of spires) raise(d.x, d.y, d.r, Math.round(d.tall ?? 12), (q) => (1 - q) ** 1.3, () => true);
  return top;
}

// Brimstone through an outcrop, thickest on its crown, with crystals of it
// standing on top.
function brimstone(v: Voxels, L: Layout, rng: Rng, d: Disc, top: Uint8Array): void {
  const { W, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = Math.floor(d.y - d.r); y <= Math.ceil(d.y + d.r); y++) {
    for (let x = Math.floor(d.x - d.r); x <= Math.ceil(d.x + d.r); x++) {
      if (Math.hypot(x - d.x, y - d.y) > d.r) continue;
      const h = top[x + W * y];
      for (let z = floor; z < h; z++) if (noise2(seed, (x + z) * 0.4, (y - z) * 0.4) > 0.45 || z === h - 1) v.put(x, y, z, M.BRIMSTONE, 2 + Math.floor(hash3(seed, x, y, z) * 5));
      if (h > floor + 3 && rng.chance(0.12)) for (let k = 0; k < rng.int(1, 3); k++) v.put(x, y, h + k, M.BRIMSTONE, 6);
    }
  }
}

// The floor's top voxels, in calm broad shades: red rock, charred black in
// patches, glassy obsidian where something once melted; worn pale along
// the walkways.
function scorch(v: Voxels, L: Layout, rng: Rng, top: Uint8Array, trails: Uint8Array): void {
  const { W, D, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      const z = top[c] - 1;
      if (z > floor + 2) continue; // rock standing on the floor keeps its layers
      const n = noise2(seed, x * 0.08, y * 0.08);
      const f = noise2(seed + 1, x * 0.45, y * 0.45);
      if (trails[c] && z === floor - 1) {
        v.put(x, y, z, M.ROCK, WORN); // worn pale
        continue;
      }
      const m = n < 0.24 || f < 0.05 ? M.ROCK_DARK : n > 0.88 || f > 0.94 ? M.OBSIDIAN : M.ROCK;
      v.put(x, y, z, m, calm(seed + 2, x, y));
      if (n < 0.2) v.put(x, y, z - 1, M.ROCK_DARK, 2);
    }
  }
}

// A crust round a lava pool: a rim of cooled obsidian, charred rock
// beyond it, a few chunks of obsidian standing proud, and the odd raft of
// crust floating on the lava.
function crust(v: Voxels, L: Layout, rng: Rng, s: Site): void {
  const z = L.floor - 1;
  for (let y = Math.floor(s.y - s.ry - 3); y <= Math.ceil(s.y + s.ry + 3); y++) {
    for (let x = Math.floor(s.x - s.rx - 3); x <= Math.ceil(s.x + s.rx + 3); x++) {
      const e = ((x - s.x) / s.rx) ** 2 + ((y - s.y) / s.ry) ** 2;
      if (e < 0.5) {
        if (rng.chance(0.04) && v.get(x, y, z - 1) === M.LAVA) v.put(x, y, z, M.OBSIDIAN, rng.int(0, 2));
        continue;
      }
      if (e <= 1 || e > 2.6) continue;
      const glass = e < 1.5 || (e < 2 && rng.chance(0.3));
      v.put(x, y, z, glass ? M.OBSIDIAN : M.ROCK_DARK, glass ? rng.int(2, 6) : rng.int(0, 3));
      if (e < 1.8 && rng.chance(0.18) && v.get(x, y, z + 1) === M.AIR) v.put(x, y, z + 1, M.OBSIDIAN, rng.int(4, 7));
    }
  }
}

// Cracks of lava in the floor, each in a lip of obsidian: from the pools
// out toward the hub, and lone fissures across the open floor. The crust
// stays whole where a walkway crosses, and they never open beside a
// hollow. Returns a few voxels along each, for the light.
function fissures(v: Voxels, L: Layout, rng: Rng, P: Plan, pools: readonly Site[]): Array<[number, number, number]> {
  const { W, D, T, floor } = L;
  const z = floor - 1;
  const f = P.floor;
  const grow = growth(L);
  const out: Array<[number, number, number]> = [];
  const solid = (x: number, y: number, zz: number) => isSolid(v.get(x, y, zz));
  const open = (x: number, y: number) =>
    x > T + 1 && y > T + 1 && x < W - 2 && y < D - 2 && !f.paths[x + W * y] &&
    !f.sites.some((s) => !P.pools.includes(s) && Math.hypot(s.x - x, s.y - y) < s.r + 1) &&
    solid(x, y, z) && solid(x, y, z - 1) && solid(x + 1, y, z) && solid(x - 1, y, z) && solid(x, y + 1, z) && solid(x, y - 1, z);
  const crack = (x0: number, y0: number, a0: number, len: number) => {
    let x = x0;
    let y = y0;
    let a = a0;
    let n = 0;
    for (let i = 0; i < len; i++) {
      const cx = Math.round(x);
      const cy = Math.round(y);
      if (open(cx, cy)) {
        v.put(cx, cy, z, M.LAVA, rng.int(2, 7));
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (v.get(cx + dx, cy + dy, z) !== M.LAVA) v.put(cx + dx, cy + dy, z, M.OBSIDIAN, rng.int(1, 4));
        if (n++ % 9 === 4) out.push([cx, cy, z]);
      }
      a += rng.range(-0.35, 0.35);
      x += Math.cos(a);
      y += Math.sin(a);
    }
  };
  // From the pools toward the hub.
  pools.forEach((p, k) => {
    for (let j = k ? 1 : rng.int(2, 3); j > 0; j--) {
      const a = Math.atan2(f.hub.y - p.y, f.hub.x - p.x) + rng.range(-0.9, 0.9);
      const e = 1.7;
      crack(p.x + Math.cos(a) * p.rx * e, p.y + Math.sin(a) * p.ry * e, a, rng.int(20, 30 + Math.round(12 * grow)));
    }
  });
  // Lone fissures on the open floor.
  const free = f.free(2);
  for (const q of scatter(L, rng, Math.round(3 + 11 * grow), 18, (x, y) => free[x + W * y] === 1)) crack(q.x, q.y, rng.range(0, Math.PI * 2), rng.int(12, 20 + Math.round(14 * grow)));
  return out;
}

// The bone field: bones heaped and strewn, skulls, ribcages, and in the
// middle a throne of obsidian and bone facing the room.
function boneField(v: Voxels, L: Layout, rng: Rng, d: Disc, throne: Pt | null, f: Floor): void {
  const { W, floor } = L;
  const open = (x: number, y: number) => !f.paths[x + W * y] && Math.hypot(x - d.x, y - d.y) < d.r && v.ground(x, y, floor + 4) <= floor + 1;
  const skip = (x: number, y: number) => !open(x, y);
  for (let k = Math.round(d.r * 0.9); k > 0; k--) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(3, d.r - 1.5);
    const x = Math.round(d.x + Math.cos(a) * r);
    const y = Math.round(d.y + Math.sin(a) * r);
    if (open(x, y)) bonePile(v, L, rng, x, y, rng.range(1.8, 3), skip);
  }
  for (let k = Math.round(d.r * 2.5); k > 0; k--) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(2.5, d.r);
    const x = Math.round(d.x + Math.cos(a) * r);
    const y = Math.round(d.y + Math.sin(a) * r);
    const alongX = rng.chance(0.5);
    const n = rng.int(2, 4);
    let ok = true;
    for (let i = 0; i < n && ok; i++) ok = open(alongX ? x + i : x, alongX ? y : y + i);
    if (!ok) continue;
    const g = v.ground(x, y, floor + 4);
    for (let i = 0; i < n; i++) v.put(alongX ? x + i : x, alongX ? y : y + i, g, M.BONE, i === 0 || i === n - 1 ? 7 : 4);
  }
  // A ribcage or two: arches of bone over a spine.
  for (let k = rng.int(1, 2); k > 0; k--) {
    const a = rng.range(0, Math.PI * 2);
    const x0 = Math.round(d.x + Math.cos(a) * d.r * 0.6);
    const y0 = Math.round(d.y + Math.sin(a) * d.r * 0.6);
    let ok = true;
    for (let i = -1; i <= 6 && ok; i++) for (let q = -2; q <= 2 && ok; q++) ok = open(x0 + i, y0 + q);
    if (!ok) continue;
    for (let i = 0; i < 6; i++) {
      v.put(x0 + i, y0, floor, M.BONE, 5);
      if (i % 2) continue;
      for (const q of [-2, 2]) v.put(x0 + i, y0 + q, floor, M.BONE, 4);
      for (const q of [-2, -1, 1, 2]) v.put(x0 + i, y0 + q, floor + (Math.abs(q) === 2 ? 1 : 2), M.BONE, 6);
      v.put(x0 + i, y0, floor + 3, M.BONE, 7);
    }
  }
  if (!throne) return;
  // The throne: an obsidian seat, a backrest of bone with skulls on its
  // posts, armrests; it faces the hub.
  const { x: tx, y: ty } = throne;
  const fx = Math.sign(f.hub.x - tx) || 1;
  const fy = Math.sign(f.hub.y - ty) || 1;
  const backX = Math.abs(f.hub.x - tx) >= Math.abs(f.hub.y - ty); // the back runs along y, behind in x
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) for (let h = 0; h < 2; h++) v.put(x, y, floor + h, M.OBSIDIAN, h ? 5 : 2);
  for (let q = -1; q <= 1; q++) {
    const [bx, by] = backX ? [tx - 2 * fx, ty + q] : [tx + q, ty - 2 * fy];
    for (let h = 0; h < 6; h++) v.put(bx, by, floor + h, q === 0 && h > 2 ? M.OBSIDIAN : M.BONE, h === 5 ? 7 : 4);
  }
  for (const q of [-2, 2]) {
    const [ax, ay] = backX ? [tx, ty + q] : [tx + q, ty];
    for (let h = 0; h < 3; h++) v.put(ax, ay, floor + h, M.BONE, h === 2 ? 7 : 3);
    const [px, py] = backX ? [tx - 2 * fx, ty + q] : [tx + q, ty - 2 * fy];
    floorSkull(v, px - (backX ? 0 : 1), py - (backX ? 1 : 0), floor, !backX);
  }
}

// The basin: lava three deep in the corner, walled by an obsidian rim one
// voxel proud of it (the rock behind is lined with obsidian too, so no
// hollow in the wall lets it out).
function buildBasin(v: Voxels, L: Layout, b: Basin): void {
  const { W, floor } = L;
  const inside = new Set(b.cells.map(([x, y]) => x + W * y));
  const lip = floor + 1;
  for (const [x, y] of b.cells) {
    for (let z = floor - 2; z <= floor; z++) v.put(x, y, z, M.LAVA);
    v.put(x, y, lip, M.AIR);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (inside.has(nx + W * ny)) continue;
        for (let z = floor - 3; z <= lip; z++) v.put(nx, ny, z, M.OBSIDIAN, z === lip ? 6 : 2 + ((nx + ny + z) & 1));
      }
    }
  }
}

// The lava fall: a clear drop down the wall face from a crack near the
// top into the basin, two voxels wide.
function carveFall(v: Voxels, L: Layout, b: Basin): void {
  const [fx, fy] = b.fall;
  const cz = crackZ(L);
  for (const y of [fy, fy + 1]) {
    for (let z = L.floor + 1; z <= cz + 1; z++) v.put(fx, y, z, M.AIR);
    for (let z = cz - 1; z <= cz + 1; z++) {
      v.put(fx - 1, y, z, M.AIR);
      v.put(fx - 2, y, z, M.OBSIDIAN, 0);
    }
  }
  for (let y = fy - 1; y <= fy + 2; y++) {
    v.put(fx - 1, y, cz - 2, M.OBSIDIAN, 3);
    v.put(fx - 1, y, cz + 2, M.OBSIDIAN, 5);
  }
  for (let z = cz - 1; z <= cz + 1; z++) {
    v.put(fx - 1, fy - 1, z, M.OBSIDIAN, 2);
    v.put(fx - 1, fy + 2, z, M.OBSIDIAN, 4);
  }
}

function crackZ(L: Layout): number {
  return L.H - 4;
}

// A flame vent: a low obsidian cone with a throat down its middle.
function buildVent(v: Voxels, L: Layout, rng: Rng, x: number, y: number): void {
  const z = L.floor;
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > 2.9) continue;
      v.put(x + dx, y + dy, z - 1, d < 1.6 ? M.OBSIDIAN : M.ROCK_DARK, rng.int(0, 3));
      if (d <= 2.3) v.put(x + dx, y + dy, z, M.OBSIDIAN, rng.int(1, 5));
      if (d <= 1.5) v.put(x + dx, y + dy, z + 1, M.OBSIDIAN, rng.int(3, 7));
    }
  }
  v.put(x, y, z, M.AIR);
  v.put(x, y, z + 1, M.AIR);
  v.put(x, y, z - 1, M.OBSIDIAN, 0);
}

// Anything that burns close to the lava or a vent's flames (a brimstone
// vein that ran too near) turns to dark rock.
function cool(v: Voxels, L: Layout, vents: ReadonlyArray<[number, number]>): void {
  const quench = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    for (let z = z0; z <= z1; z++) {
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) if (isFlammable(v.get(x, y, z))) v.put(x, y, z, M.ROCK_DARK);
      }
    }
  };
  const r = HEAT_CLEAR;
  for (let i = 0; i < v.size; i++) {
    if (v.mat[i] !== M.LAVA) continue;
    const x = v.xOf(i);
    const y = v.yOf(i);
    const z = v.zOf(i);
    quench(x - r, y - r, z - r, x + r, y + r, z + r);
  }
  for (const [x, y] of vents) quench(x - 4, y - 4, L.floor - 1, x + 4, y + 4, L.floor + JET_H + 10);
}

// Lava sconces on the wall faces: a trough of three lava voxels in an iron
// cup, over the middle of each wide gap between props and over every prop
// low enough to leave room. Returns their middle voxels.
function buildSconces(v: Voxels, L: Layout): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = [];
  const z = L.floor + SCONCE_H;
  for (const wall of ['left', 'right'] as const) {
    const spans = slotsOn(L, wall).map((s) => [wall === 'left' ? s.y0 : s.x0, s.len] as const);
    const along: number[] = [];
    for (const [a0, a1] of wallGaps(L, wall)) if (a0 > L.T && a1 - a0 >= 6) along.push(Math.floor((a0 + a1) / 2));
    for (const [a0, len] of spans) along.push(a0 + Math.floor(len / 2));
    for (const a of along) {
      const [cx, cy] = onWall(L, wall, a, 0);
      if (out.some(([x, y]) => Math.hypot(x - cx, y - cy) < SCONCE_GAP)) continue;
      const gap = !spans.some(([a0, len]) => a + 3 >= a0 && a - 3 < a0 + len);
      if (sconce(v, L, wall, a, z, gap)) out.push([cx, cy, z]);
    }
  }
  return out;
}

function sconce(v: Voxels, L: Layout, wall: 'left' | 'right', a: number, z: number, gap: boolean): boolean {
  const cell = (da: number, o: number, dz: number) => {
    const [x, y] = onWall(L, wall, a + da, o);
    return [x, y, z + dz] as const;
  };
  // The cup and the air over the lava must be free (in a gap, carve them);
  // the rock behind must hold.
  for (let da = -2; da <= 2; da++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let o = 0; o <= 1; o++) {
        const [x, y, zz] = cell(da, o, dz);
        if (v.get(x, y, zz) !== M.AIR && !gap) return false;
      }
      if (dz === 1) continue;
      const [x, y, zz] = cell(da, -1, dz);
      if (!isSolid(v.get(x, y, zz)) && !gap) return false;
    }
  }
  for (let da = -2; da <= 2; da++) {
    for (let dz = -1; dz <= 1; dz++) {
      for (let o = 0; o <= 1; o++) {
        const [x, y, zz] = cell(da, o, dz);
        const lava = o === 0 && dz === 0 && Math.abs(da) <= 1;
        v.put(x, y, zz, dz === 1 ? M.AIR : lava ? M.LAVA : M.METAL, dz === -1 ? 2 : 5);
      }
      if (dz === 1) continue;
      const [x, y, zz] = cell(da, -1, dz);
      const m = v.get(x, y, zz);
      if (!isSolid(m) || isFlammable(m)) v.put(x, y, zz, M.ROCK_DARK);
    }
  }
  // A bracket under the cup.
  const [bx, by, bz] = cell(0, 0, -2);
  if (v.get(bx, by, bz) === M.AIR) v.put(bx, by, bz, M.METAL, 1);
  return true;
}

// Decor on the open floor: heaps of bones with skulls on top, lone skulls
// and bones, black obsidian spires, drifts of ash and, well away from any
// heat, clumps of brimstone.
function litter(v: Voxels, L: Layout, rng: Rng, free: Uint8Array, far: (x: number, y: number) => boolean): void {
  const { W, D, T, floor } = L;
  const grow = (W - 72) / 98;
  const open = (x: number, y: number) => x >= T && y >= T && x < W && y < D && free[x + W * y] === 1;
  const area = (x: number, y: number, w: number, d: number) => {
    for (let dy = 0; dy < d; dy++) for (let dx = 0; dx < w; dx++) if (!open(x + dx, y + dy)) return false;
    return true;
  };
  const skip = (x: number, y: number) => !open(x, y);

  for (let k = 1 + Math.round((W * D) / 4000); k > 0; k--) {
    const x = rng.int(T + 4, W - 5);
    const y = rng.int(T + 4, D - 5);
    if (area(x - 2, y - 2, 5, 5)) bonePile(v, L, rng, x, y, rng.range(2.5, 3.5 + grow), skip);
  }
  for (let k = Math.round((W * D) / 2200); k > 0; k--) {
    const x = rng.int(T + 2, W - 5);
    const y = rng.int(T + 2, D - 5);
    if (!area(x, y, 3, 3)) continue;
    const g = Math.max(v.ground(x, y, floor + 4), v.ground(x + 2, y + 2, floor + 4));
    floorSkull(v, x, y, g, rng.chance(0.5));
  }
  for (let k = Math.round((W * D) / 1500); k > 0; k--) {
    const x = rng.int(T + 2, W - 6);
    const y = rng.int(T + 2, D - 6);
    const alongX = rng.chance(0.5);
    const n = rng.int(3, 4);
    if (!area(x, y, alongX ? n : 1, alongX ? 1 : n)) continue;
    const g = v.ground(x, y, floor + 4);
    for (let i = 0; i < n; i++) {
      const bx = alongX ? x + i : x;
      const by = alongX ? y : y + i;
      if (v.get(bx, by, g) === M.AIR) v.put(bx, by, g, M.BONE, i === 0 || i === n - 1 ? 7 : 4);
    }
  }
  for (let k = Math.round((W * D) / 2400); k > 0; k--) {
    const cx = rng.int(T + 3, W - 4);
    const cy = rng.int(T + 3, D - 4);
    if (!area(cx - 2, cy - 2, 5, 5)) continue;
    const r = rng.range(1.4, 2.3 + grow * 0.6);
    const tall = rng.int(5, 9 + Math.round(grow * 5));
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1 || !open(x, y)) continue;
        const h = Math.max(1, Math.round(tall * (1 - d) ** 1.6));
        const g = v.ground(x, y, floor + 4);
        for (let z = g; z < g + h; z++) v.put(x, y, z, M.OBSIDIAN, Math.min(7, 1 + Math.round(((z - g) / h) * 4) + ((x + y) & 1) * 2));
      }
    }
  }
  for (let k = Math.round((W * D) / 3000); k > 0; k--) {
    const cx = rng.int(T + 3, W - 4);
    const cy = rng.int(T + 3, D - 4);
    if (!area(cx - 1, cy - 1, 3, 3) || !far(cx, cy)) continue;
    for (let y = cy - 1; y <= cy + 1; y++) {
      for (let x = cx - 1; x <= cx + 1; x++) {
        if (rng.chance(0.3) && (x !== cx || y !== cy)) continue;
        const g = v.ground(x, y, floor + 4);
        const h = x === cx && y === cy ? rng.int(2, 3) : 1;
        for (let z = g; z < g + h; z++) v.put(x, y, z, M.BRIMSTONE, rng.int(3, 7));
      }
    }
  }
  for (let k = Math.round((W * D) / 3500); k > 0; k--) {
    const x = rng.int(T + 3, W - 4);
    const y = rng.int(T + 3, D - 4);
    if (open(x, y)) heap(v, L, x, y, rng.range(2, 3.5), M.ASH, skip);
  }
}

// A mound of bones, with a skull or two on top.
function bonePile(v: Voxels, L: Layout, rng: Rng, cx: number, cy: number, r: number, skip: (x: number, y: number) => boolean): void {
  let peak = 0;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d >= r || skip(x, y)) continue;
      const h = Math.max(1, Math.round((r - d) * 0.75 + rng.range(-0.5, 0.5)));
      const g = v.ground(x, y, L.floor + 4);
      for (let z = g; z < g + h; z++) {
        if (v.get(x, y, z) !== M.AIR) continue;
        const gap = rng.chance(0.14);
        v.put(x, y, z, gap ? M.ROCK_DARK : M.BONE, gap ? 0 : rng.int(2, 7));
      }
      if (x === cx && y === cy) peak = g + h;
    }
  }
  if (peak) floorSkull(v, cx - 1, cy - 1, peak - 1, rng.chance(0.5));
  if (rng.chance(0.5)) {
    const x = cx + Math.round(r) - 1;
    const y = cy - 1;
    if (!skip(x, y) && !skip(x + 1, y + 2)) floorSkull(v, x, y, v.ground(x, y, L.floor + 4), true);
  }
}

// A skull lying on the floor at (x, y, z), facing +x or +y (both face
// the camera).
function floorSkull(v: Voxels, x: number, y: number, z: number, faceX: boolean): void {
  skull((a, b, h, m, shade) => (faceX ? v.put(x + b, y + a, z + h, m, shade) : v.put(x + a, y + b, z + h, m, shade)));
}

// A skull 3 wide, 2 deep and 3 tall, its face at b = 1: dark eye sockets
// either side of the nose, teeth below.
function skull(put: (a: number, b: number, h: number, m: number, shade: number) => void): void {
  for (let h = 0; h < 3; h++) {
    for (let b = 0; b < 2; b++) {
      for (let a = 0; a < 3; a++) {
        if (h === 2 && b === 0 && a !== 1) continue; // a rounded crown
        const eye = b === 1 && h === 1 && a !== 1;
        put(a, b, h, eye ? M.OBSIDIAN : M.BONE, eye ? 0 : h === 0 ? (a === 1 ? 3 : 5) : h === 2 ? 7 : 6);
      }
    }
  }
}

// entrance: the tunnel mouth with a skull over its obsidian lintel and a
// pair of bone horns curling up from the ends.
function boneGate(m: PropMats): Prop {
  const base = entrance(m);
  const TALL = 18; // the opening's height (the lintel sits on it, 2 thick)
  const at = (v: Voxels, s: Slot, a: number, b: number, h: number, mat: number, shade: number) => v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, mat, shade);
  return {
    name: 'gate',
    build(v, s, rng) {
      base.build(v, s, rng);
      skull((a, b, h, mat, shade) => at(v, s, 5 + a, b - 1, TALL + 2 + h, mat, shade));
      for (const [a, inward] of [[0, 1], [11, -1]]) {
        at(v, s, a, 0, TALL + 2, m.bone, 4);
        at(v, s, a, 0, TALL + 3, m.bone, 6);
        at(v, s, a + inward, 0, TALL + 4, m.bone, 7);
      }
    },
    tick: base.tick,
  };
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const st = STATE.get(c.v);
  if (!st) return;
  lakes(c, L, st);
  // The cracks glow and breathe embers.
  st.cracks.forEach(([x, y, z], k) => {
    if (c.v.get(x, y, z) !== M.LAVA) return;
    if (k % 2 === 0) c.light({ x: x + 0.5, y: y + 0.5, z: z + 2, color: LAVA_GLOW, radius: 16, intensity: 0.5 * flicker(c.t * 0.4, k * 3) });
    if (c.rng.chance(c.dt * 0.4)) rise(c, x + 0.5, y + 0.5, z + 1);
  });
  if (st.basin) fall(c, L, st.basin);
  jets(c, L, st.vents);
  st.sconces.forEach(([x, y, z], k) => {
    if (c.v.get(x, y, z) !== M.LAVA) return;
    c.light({ x: x + 0.5, y: y + 0.5, z: z + 1.5, color: LAVA_GLOW, radius: 18, intensity: 0.6 * flicker(c.t * 0.3, k * 7) });
    if (c.rng.chance(c.dt * 0.6)) rise(c, x + 0.5, y + 0.5, z + 1);
  });
  // Embers drifting up anywhere in the room.
  if (c.rng.chance(c.dt * 3)) rise(c, c.rng.range(L.T, L.W), c.rng.range(L.T, L.D), L.floor + c.rng.range(0, 8));
}

// The pools: their glow, a churning surface, bubbles that pop, embers and
// wisps of smoke.
function lakes(c: Ctx, L: Layout, st: Hell): void {
  st.pools.forEach((p, k) => {
    const r = Math.max(p.rx, p.ry);
    c.light({ x: p.x + 0.5, y: p.y + 0.5, z: L.floor + 2, color: LAVA_GLOW, radius: clamp(r * 2 + 14, 16, 40), intensity: 0.9 * flicker(c.t * 0.35, k * 5) });
  });
  const s = st.surface;
  if (!s.length) return;
  const v = c.v;
  for (let n = c.dt * s.length * 0.4; n > 0; n--) {
    if (n < 1 && !c.rng.chance(n)) break;
    const [x, y, z] = c.rng.pick(s);
    if (v.get(x, y, z) === M.LAVA) v.put(x, y, z, M.LAVA, c.rng.int(0, 7));
  }
  if (c.rng.chance(c.dt * (1.5 + s.length / 80))) {
    const [x, y, z] = c.rng.pick(s);
    if (v.get(x, y, z) === M.LAVA && v.get(x, y, z + 1) === M.AIR) {
      v.put(x, y, z, M.LAVA, 7);
      for (let k = c.rng.int(1, 3); k > 0; k--) {
        c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: z + 1.2, vx: c.rng.range(-1, 1), vy: c.rng.range(-1, 1), vz: c.rng.range(2.5, 5), life: 0.8, color: c.rng.pick(DROPS), glow: true, gravity: 20 });
      }
    }
  }
  if (c.rng.chance(c.dt * (1 + s.length / 60))) {
    const [x, y, z] = c.rng.pick(s);
    rise(c, x + 0.5, y + 0.5, z + 1);
  }
  if (c.rng.chance(c.dt * 0.8)) {
    const [x, y, z] = c.rng.pick(s);
    puff(c, x, y, z + 2, M.SMOKE, 70);
  }
}

// The lava fall: drops pouring from the crack into the basin, a few of
// them landing as lava, which the basin swallows again; splashes, embers
// and its glow.
function fall(c: Ctx, L: Layout, b: Basin): void {
  const v = c.v;
  const [fx, fy] = b.fall;
  const cz = crackZ(L);
  const pour = 0.75 + 0.25 * Math.sin(c.t * 0.9) * Math.sin(c.t * 0.37 + 1);
  for (let n = c.dt * 40 * pour; n > 0; n--) {
    if (n < 1 && !c.rng.chance(n)) break;
    const y = fy + (c.rng.chance(0.5) ? 0 : 1);
    const wet = c.rng.chance(0.03);
    c.spawn({
      kind: 'drop',
      x: fx + c.rng.range(0.2, 0.8),
      y: y + c.rng.range(0.2, 0.8),
      z: cz + 0.5,
      vx: 0,
      vy: 0,
      vz: c.rng.range(-1.5, 0),
      life: 4,
      color: c.rng.pick(DROPS),
      glow: true,
      gravity: 30,
      ...(wet ? { mat: M.LAVA } : {}),
    });
  }
  const top = L.floor + 1;
  const glow = flicker(c.t * 0.5, 9);
  c.light({ x: fx + 0.5, y: fy + 1, z: cz, color: LAVA_GLOW, radius: 14, intensity: 0.5 * pour });
  c.light({ x: fx + 0.5, y: fy + 1, z: (cz + top) / 2, color: LAVA_GLOW, radius: 22, intensity: 0.55 * pour });
  c.light({ x: L.T + b.rx * 0.45, y: L.T + b.ry * 0.45, z: top + 1, color: LAVA_GLOW, radius: 26, intensity: 0.9 * glow });
  if (c.rng.chance(c.dt * 10 * pour)) {
    c.spawn({ kind: 'drop', x: fx + 0.5, y: fy + 1, z: top + 0.5, vx: c.rng.range(0, 3), vy: c.rng.range(-2.5, 2.5), vz: c.rng.range(3, 6), life: 0.8, color: c.rng.pick(DROPS), glow: true, gravity: 30 });
  }
  if (c.rng.chance(c.dt * 3)) {
    const [x, y] = c.rng.pick(b.cells);
    rise(c, x + 0.5, y + 0.5, top);
  }
  // The basin swallows what lands: the fall's own columns at once, the
  // rest of the top layer soon after.
  for (const [x, y] of b.cells) {
    for (let z = top; z <= top + 1; z++) {
      if (v.get(x, y, z) !== M.LAVA) continue;
      if (z > top || (x === fx && (y === fy || y === fy + 1)) || c.rng.chance(c.dt * 6)) {
        v.put(x, y, z, M.AIR, 0, 0);
        if (c.rng.chance(0.3)) puff(c, x, y, z, M.SMOKE, 40);
      }
    }
  }
}

// Flame vents: each one rumbles and smokes, then spits a column of fire
// for a moment, every several seconds; between times it smoulders.
function jets(c: Ctx, L: Layout, vents: ReadonlyArray<[number, number]>): void {
  vents.forEach(([x, y], k) => {
    const z0 = L.floor;
    const period = 7 + (k % 3) * 2.3;
    const u = (c.t + k * 3.1) % period;
    if (u > period - 0.8 && c.rng.chance(c.dt * 6)) puff(c, x, y, z0 + 2, M.SMOKE, 40);
    if (u >= JET) {
      c.light({ x: x + 0.5, y: y + 0.5, z: z0 + 1, color: LAVA_GLOW, radius: 8, intensity: 0.3 + 0.1 * Math.sin(c.t * 2 + k) });
      return;
    }
    const f = Math.sin((Math.PI * u) / JET);
    const tall = 3 + Math.round(f * JET_H);
    for (let h = 0; h < tall; h++) keepFire(c, x, y, z0 + h, 9);
    // a fatter plume above the cone
    for (let h = 2; h < 2 + tall * 0.6; h++) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) if (c.rng.chance(0.5)) keepFire(c, x + dx, y + dy, z0 + h, 6);
    }
    c.light({ x: x + 0.5, y: y + 0.5, z: z0 + 1 + tall / 2, color: FLAME, radius: 16 + 14 * f, intensity: (0.5 + 0.9 * f) * flicker(c.t, k * 3) });
    if (c.rng.chance(c.dt * 30 * f)) {
      const a = c.rng.range(0, Math.PI * 2);
      const sp = c.rng.range(2, 5);
      c.spawn({ kind: 'spark', x: x + 0.5, y: y + 0.5, z: z0 + tall, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: c.rng.range(4, 9), life: c.rng.range(0.3, 0.7), color: c.rng.pick(SPARKS), glow: true, gravity: 24, ignites: false });
    }
    if (c.rng.chance(c.dt * 8 * f)) rise(c, x + 0.5, y + 0.5, z0 + tall);
  });
}

// An ember drifting up from (x, y, z).
function rise(c: Ctx, x: number, y: number, z: number): void {
  c.spawn({ kind: 'ember', x, y, z, vx: c.rng.range(-0.5, 0.5), vy: c.rng.range(-0.5, 0.5), vz: c.rng.range(1, 2.5), life: c.rng.range(1.2, 3), color: c.rng.pick(EMBERS), glow: true, gravity: -0.6 });
}

export const hell: Biome = {
  id: 'hell',
  name: 'Hell',
  tagline: 'Lava lakes, brimstone and the bones of the damned',
  palette: PALETTE,
  backdrop: hex('#080202'),
  sky: 'embers',
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  build: BUILD,
  pois: (L) => plan(L).floor.pois.slice(),
};

export default hell;
