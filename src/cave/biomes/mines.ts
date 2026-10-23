import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { inRect, slotRect, slotsOn, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { beams, buildTorch, fillStrata, FLAME, flicker, fuelNear, hangers, hash3, heap, keepFire, makeProps, noise2, onWall, pit, puff, roughenWalls, tendTorch, tone, TORCH_LIFE, veins } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';
import type { Disc, Pt } from './floor.ts';
import { by, calm, campfirePoi, disc, Floor, growth, scatter, WORN } from './floor.ts';

// The Mines: the first stretch below the surface. Brown rock in layers of
// dirt and dark stone, coal seams and gold veins, timbered walls lit by
// torches, a seep pool and puddles, a slick of oil; out on the floor a
// miners' camp round a fire pit, a gold-shot outcrop, a cart on rails
// running off into the dark, stacked timber, boulders and stalagmites.

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

const GRADE: Grade = { ambient: hex('#ac9074'), illum: 1.3, bloom: 0.6, vignette: 0.2 };

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

// A stone and timber tower: a timber frame filled in with brick and rock.
const BUILD: BuildStyle = { mats: [M.WOOD, M.BRICK, M.ROCK], shape: 'tower' };

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
const OIL_NEAR = 11; // or at the very least this far
const CAMP_LIFE = 9; // the camp fire's flames, in ticks (as the campfire's)
const POST_CUP = 7; // a camp torch's cup, above the floor
const DAMP_CLEAR = 7; // moss and mushrooms stay this far from a flame
const CAMP_FLAMES: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

const EMBER = hex('#ff7a2a');
const GOLD_GLINT = hex('#fff0a0');

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── plan ─────────────────────────────────────────────────────────────────
// Where everything the characters visit goes, from the layout alone (so
// pois() and weather() agree with generate()): the seep pool, the camp,
// the gold outcrop, the cart and its rails, the timber stack, the oil, the
// puddles; where the camp's logs, tent and torches stand, and the lanterns
// along the walkways.
type Rails = { x0: number; y0: number; alongX: boolean; len: number }; // (x0, y0): the buffer end's first rail; runs `len` along +x or +y
type Tent = { x: number; y: number; alongX: boolean }; // centre of its floor, ridge along x or y
type Plan = {
  floor: Floor;
  pool: Disc | null;
  oil: Disc | null;
  vein: Disc | null;
  camp: Disc | null;
  torches: Array<[number, number, number]>; // torch cups on posts: round the camp, along the walkways
  cart: Disc | null;
  rails: Rails | null;
  timber: Disc | null;
  puddles: Disc[];
  logs: Pt[]; // log seats by the camp fire
  tent: Tent | null;
  crates: Pt[]; // crate seats by the cart
};

const PLANS = new WeakMap<Layout, Plan>();

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W, floor } = L;
  const f = new Floor(L, 'mines');
  const g = growth(L);
  const hub = f.hub;
  const logs: Pt[] = [];
  const crates: Pt[] = [];
  const torches: Array<[number, number, number]> = [];
  let tent: Tent | null = null;

  // The seep pool: drink at its edge.
  const wr = clamp(Math.round(W * 0.08), 5, 13);
  const pool = f.place(Math.round(wr * 1.5), f.at(0.7, 0.9), { min: 4, pois: (s) => [by(s, 'drink', 1, hub)] });

  // Oil, well away from the props that keep a flame (wall torches give way
  // to it; the camp and the lanterns keep clear of it).
  const or = clamp(Math.round(W * 0.05), 3, 7);
  const hot = firePoints(L, null, []);
  // A small room crowded with fire props makes do with a smaller slick, closer in.
  const slick = (clear: number, min: number, gap: number) => f.place(Math.round(or * 1.45), f.at(0.97, 0.97), { min, gap, spread: 40, ok: (s) => hot.every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= s.r + clear) });
  const oil = slick(OIL_CLEAR, 4, 2) ?? slick(OIL_NEAR, 3, 1);
  const oily = (x: number, y: number, r: number) => oil !== null && Math.hypot(oil.x - x, oil.y - y) < oil.r + OIL_CLEAR + r;

  // The camp: a fire pit, logs to sit on, a tent and torches round it.
  const camp = f.place(Math.round(9 + 3 * g), f.at(0.93, 0.62), {
    min: 9,
    inside: true,
    ok: (s) => !oily(s.x, s.y, s.r),
    pois: (s) => {
      const warm = by({ ...s, r: 4 }, 'warm', 0, hub);
      const seat = by({ ...s, r: 5 }, 'seat', 0, hub, 1.25);
      return [warm, seat];
    },
  });
  if (camp) {
    logs.push(f.pois[f.pois.length - 1]);
    const cx = Math.round(camp.x);
    const cy = Math.round(camp.y);
    const a0 = Math.atan2(logs[0].y - cy, logs[0].x - cx);
    const off = (p: Pt) => f.paths[p.x + W * p.y] === 1;
    for (const da of [-Math.PI * 0.6, Math.PI * 0.62]) {
      const p = { x: Math.round(cx + Math.cos(a0 + da) * 5), y: Math.round(cy + Math.sin(a0 + da) * 5) };
      if (!off(p)) logs.push(p);
    }
    // The tent across the fire from the walkway in.
    const back = Math.atan2(cy - hub.y, cx - hub.x);
    const t = { x: Math.round(cx + Math.cos(back) * 8), y: Math.round(cy + Math.sin(back) * 8), alongX: Math.abs(Math.cos(back)) < 0.7 };
    const tc = tentCells(t);
    if (camp.r >= 11 && tc.every((p) => !off(p) && Math.hypot(p.x - camp.x, p.y - camp.y) < camp.r + 1)) tent = t;
    const fuel = [...logs.flatMap(logCells.bind(null, cx, cy)), ...(tent ? tc : [])];
    for (let k = 0; k < 12 && torches.length < 4; k++) {
      const a = (k / 12) * Math.PI * 2 + 0.3;
      const x = Math.round(cx + Math.cos(a) * (camp.r - 1.5));
      const y = Math.round(cy + Math.sin(a) * (camp.r - 1.5));
      if (off({ x, y }) || fuel.some((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) < 5)) continue;
      if (torches.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 7)) continue;
      torches.push([x, y, floor + POST_CUP]);
    }
  }

  // The gold outcrop: a view of the vein.
  const vein = f.place(Math.round(4 + 4 * g), f.at(0.46, 0.95), { min: 3, pois: (s) => [by(s, 'view', 5, hub)] });

  // The cart on its rails, a crate beside it to sit on.
  const cart = f.place(Math.round(5 + 2 * g), f.at(0.88, 0.86), { min: 5, inside: true, pois: (s) => [cartSeat(s, L, f, hub)] });
  let rails: Rails | null = null;
  if (cart) {
    crates.push(f.pois[f.pois.length - 1]);
    rails = railsFor(L, f, cart);
  }

  // The timber stack, with a mine rat living under it.
  const timber = f.place(Math.round(4 + 2 * g), f.at(0.2, 0.95), { min: 3, pois: (s) => [by(s, 'pet', 2, hub)] });

  // Too small a cave for the camp: warm up by the campfire prop instead.
  const warm = camp ? null : campfirePoi(L);
  if (warm && f.reachable(warm, null)) f.addPoi(warm);

  // Lanterns on posts beside the walkways: out to the POIs and the plazas,
  // and in from the props to the hub.
  const lantern = (a: Pt, b: Pt, at: number) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 20) return;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    for (const side of [1, -1]) {
      const x = Math.round(a.x + ux * len * at - uy * side * 4);
      const y = Math.round(a.y + uy * len * at + ux * side * 4);
      if (x < L.T + 2 || y < L.T + 2 || x > W - 3 || y > L.D - 3) continue;
      if (f.paths[x + W * y]) continue;
      if (f.sites.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + 2) || torches.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 14) || oily(x, y, 0)) continue;
      torches.push([x, y, floor + POST_CUP + 1]);
      disc(f.paths, L, x, y, 1.5);
      return;
    }
  };
  for (const p of f.pois) lantern(hub, p, 0.55);
  for (const p of f.plazas) lantern(hub, p, 0.7);
  for (const s of L.slots) lantern(s.spot, hub, 0.5);

  // Puddles anywhere damp and open.
  const fires = firePoints(L, camp, torches);
  const puddles: Disc[] = [];
  const n = Math.round(2 + 6 * g);
  for (let k = 0; k < n; k++) {
    const d = f.place(f.rng.range(3, 5), f.at(f.rng.range(0.2, 0.95), f.rng.range(0.2, 0.95)), { min: 3, spread: 30, ok: (s) => fires.every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= s.r + DAMP_CLEAR) });
    if (d) puddles.push(d);
  }
  const P: Plan = { floor: f, pool, oil, vein, camp, torches, cart, rails, timber, puddles, logs, tent, crates };
  PLANS.set(L, P);
  return P;
}

// The voxels (x, y) of a log seat at p, square to the fire at (fx, fy):
// two across, four long.
function logCells(fx: number, fy: number, p: Pt): Pt[] {
  const radial = Math.abs(p.x - fx) >= Math.abs(p.y - fy);
  const out = Math.sign(radial ? p.x - fx : p.y - fy) || 1;
  const cells: Pt[] = [];
  for (let t = -2; t <= 1; t++) for (let w = 0; w < 2; w++) cells.push(radial ? { x: p.x + w * out, y: p.y + t } : { x: p.x + t, y: p.y + w * out });
  return cells;
}

// A tent's floor: five across, seven along its ridge.
function tentCells(t: Tent): Pt[] {
  const cells: Pt[] = [];
  for (let i = -3; i <= 3; i++) for (let q = -2; q <= 2; q++) cells.push(t.alongX ? { x: t.x + i, y: t.y + q } : { x: t.x + q, y: t.y + i });
  return cells;
}

// The crate seat beside a cart: square to the rails, on the hub's side.
function cartSeat(s: Disc, L: Layout, f: Floor, hub: Pt): Poi {
  const alongX = railAxis(L, f, s);
  const side = alongX ? Math.sign(hub.y - s.y) || -1 : Math.sign(hub.x - s.x) || -1;
  const off = Math.round(s.r - 1.5);
  const x = Math.round(s.x) + (alongX ? 0 : side * off);
  const y = Math.round(s.y) + (alongX ? side * off : 0);
  return { x, y, kind: 'seat', face: { x: Math.round(s.x), y: Math.round(s.y) } };
}

// Rails run off toward whichever front cut they reach further clear of
// plazas, props and other features (walkways they may cross: they lie flat).
function railAxis(L: Layout, f: Floor, s: Disc): boolean {
  return railRun(L, f, s, true) >= railRun(L, f, s, false);
}

function railStart(s: Disc, alongX: boolean): [number, number] {
  return alongX ? [Math.round(s.x) - 4, Math.round(s.y) - 1] : [Math.round(s.x) - 1, Math.round(s.y) - 4];
}

// How far the rails get from the cart toward a cut (the whole way: the
// distance to the cut plus one).
function railRun(L: Layout, f: Floor, s: Disc, alongX: boolean): number {
  const [x0, y0] = railStart(s, alongX);
  const end = alongX ? L.W - x0 : L.D - y0;
  const blocked = (x: number, y: number) =>
    f.plazas.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + 2) ||
    L.slots.some((sl) => inRect(slotRect(sl), x, y, 1)) ||
    f.sites.some((o) => o !== s && Math.hypot(o.x - x, o.y - y) < o.r);
  for (let len = 0; len < end; len++) {
    for (let q = -1; q <= 4; q++) if (alongX ? blocked(x0 + len, y0 + q) : blocked(x0 + q, y0 + len)) return len;
  }
  return end + 1;
}

// The rails from just behind the cart out toward a front cut, marked off
// so decor keeps off them.
function railsFor(L: Layout, f: Floor, cart: Disc): Rails {
  const alongX = railAxis(L, f, cart);
  const [x0, y0] = railStart(cart, alongX);
  const len = Math.max(12, Math.min(railRun(L, f, cart, alongX), alongX ? L.W - x0 : L.D - y0));
  for (let i = 0; i < len; i++) {
    for (let q = -1; q <= 4; q++) {
      const x = alongX ? x0 + i : x0 + q;
      const y = alongX ? y0 + q : y0 + i;
      if (x >= 0 && y >= 0 && x < L.W && y < L.D) f.paths[x + L.W * y] = 1;
    }
  }
  return { x0, y0, alongX, len };
}

// Every flame's floor position: the fire props, the wall torch sites, the
// camp fire and its torches.
function firePoints(L: Layout, camp: Disc | null, torches: ReadonlyArray<readonly [number, number, number]>): Pt[] {
  const out: Pt[] = [];
  for (const s of L.slots) {
    if (!FIERY.has(s.kind)) continue;
    const r = slotRect(s);
    for (let y = r.y0; y < r.y1; y += 2) for (let x = r.x0; x < r.x1; x += 2) out.push({ x, y });
  }
  for (const [x, y] of torchSites(L)) out.push({ x, y });
  if (camp) out.push({ x: camp.x, y: camp.y });
  for (const [x, y] of torches) out.push({ x, y });
  return out;
}

// A disc site as the ellipse of a pool, its rim inside the disc.
function pond(d: Disc, flat: number): Site {
  const rx = Math.max(2, d.r / 1.5);
  return { x: Math.round(d.x), y: Math.round(d.y), rx, ry: Math.max(2, rx * flat) };
}

// ── generate ─────────────────────────────────────────────────────────────
// Exposed gold on the outcrop, for weather() to glint.
const GLINTS = new WeakMap<Voxels, Int32Array>();

function generate(v: Voxels, L: Layout, rng: Rng): void {
  const { W, D, T, floor } = L;
  clear(v);
  const P = plan(L);
  const keep = P.floor.keep;
  const free = P.floor.free(2);
  const fires = firePoints(L, P.camp, P.torches);
  const damp = (x: number, y: number) => fires.every((p) => Math.hypot(p.x - x, p.y - y) >= DAMP_CLEAR);

  // Rock: walls, floor, a lip along the front cuts, boulders, stalagmites
  // and outcrops.
  const top = columnTops(L, rng, free, P.vein);
  fillStrata(v, L, rng, STRATA, top);
  soil(v, L, rng, top, P.floor.trails);
  veins(v, L, rng, M.GOLD_ORE, Math.round((W * D) / 700), (m) => ROCKY.has(m));
  roughenWalls(v, L, rng);
  ore(v, L, rng, top, free, P.vein);

  const water = P.pool ? pond(P.pool, 0.7) : null;
  if (water) {
    pit(v, L, water, Math.min(4, floor - 2), M.WATER);
    rim(v, L, rng, water, M.MOSS);
    // a stalagmite or two standing in the water
    for (let k = water.rx >= 6 ? 2 : water.rx >= 4 ? 1 : 0; k > 0; k--) {
      const a = rng.range(0, Math.PI * 2);
      const x = Math.round(water.x + Math.cos(a) * water.rx * 0.35);
      const y = Math.round(water.y + Math.sin(a) * water.ry * 0.35);
      const tall = rng.int(4, 9);
      for (let z = 1; z < floor + tall; z++) v.put(x, y, z, z > floor + tall - 3 ? M.ROCK_DARK : M.ROCK);
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) for (let z = 1; z < floor + Math.round(tall * 0.4); z++) v.put(x + dx, y + dy, z, M.ROCK);
    }
  }
  for (const d of P.puddles) {
    const s = pond(d, rng.range(0.6, 1));
    pit(v, L, s, 2, M.WATER);
    rim(v, L, rng, s, M.MOSS);
  }
  if (P.oil) {
    const s = pond(P.oil, 0.75);
    pit(v, L, s, 2, M.OIL);
    rim(v, L, rng, s, M.DIRT);
  }

  // Timbering: posts at the corner, between props and at the front cut,
  // with a header along the top.
  for (const wall of ['left', 'right'] as const) beams(v, L, wall, posts(L, wall), floor + BEAM_H, M.WOOD);

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  if (P.rails && P.cart) railway(v, L, rng, P.rails, P.cart, P.crates);
  if (P.camp) camp(v, L, rng, P.camp, P.logs, P.tent);
  if (P.timber) timberStack(v, L, rng, P.timber);
  for (const [x, y, cup] of P.torches) {
    if (fuelNear(v, x, y, cup - 3, cup + TORCH_LIFE, 3, 0)) continue;
    for (let z = v.ground(x, y, floor + 2); z < cup - 3; z++) v.put(x, y, z, M.WOOD, 2);
    buildTorch(v, x, y, cup, MINES_MATS);
  }
  barrels(v, L, rng, P, fires);

  // Wall torches wherever nothing that burns is near (mostly over props).
  const lit: Array<[number, number]> = [];
  for (const [x, y, z] of torchSites(L)) {
    if (lit.some(([lx, ly]) => Math.hypot(lx - x, ly - y) < TORCH_GAP)) continue;
    if (P.oil && Math.hypot(P.oil.x - x, P.oil.y - y) < P.oil.r + OIL_CLEAR) continue;
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
  spoil(v, L, rng, free);
  frames(v, L, rng, free, fires);
  mushrooms(v, L, rng, free, damp, P);

  hangers(v, L, rng, M.WOOD, M.MOSS, Math.round((W + D) / 9), floor + BEAM_H + 2);

  // The crack the sand trickles from: a notch in the face, open in front.
  const [cx, cy, cz] = crack(L);
  for (let z = cz - 1; z <= cz + 1; z++) {
    v.put(cx - 1, cy, z, M.AIR);
    v.put(cx, cy, z, M.AIR);
  }
  GLINTS.set(v, exposedGold(v, L, P.vein));
}

// Where sand trickles from, over the corner heap.
function crack(L: Layout): [number, number, number] {
  return [L.T, L.T + 2, L.H - 3];
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Height of the rock in every column: the walls to H (a ragged voxel off
// the top here and there), the floor to `floor`, with a rocky lip rising
// along the front cuts, bumps, and on free floor boulders, stalagmites,
// stalagmite clusters and craggy outcrops, crowded in rocky stretches and
// sparse in between; and the gold outcrop. Everything scales with the chunk.
function columnTops(L: Layout, rng: Rng, free: Uint8Array, vein: Disc | null): Uint8Array {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  const grow = growth(L);
  const band = 5 + Math.round(grow * 8);
  const lip = 3 + grow * 6;
  let open = 0;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      const c = x + W * y;
      if (x < T || y < T) {
        top[c] = H - (noise2(seed, x * 0.3, y * 0.3) > 0.8 ? 1 : 0);
        continue;
      }
      let h = floor;
      if (free[c]) {
        open++;
        const edge = Math.min(W - 1 - x, D - 1 - y);
        if (edge < band) h += Math.max(0, Math.round((noise2(seed + 1, x * 0.09, y * 0.09) * 1.4 - 0.4) * lip * (1 - edge / band) ** 2));
        const b = noise2(seed + 2, x * 0.35, y * 0.35);
        if (b > 0.74) h++;
        if (b > 0.88) h++;
      }
      top[c] = h;
    }
  }
  const raise = (cx: number, cy: number, r: number, tall: number, shape: (d: number, x: number, y: number) => number, ok: (c: number) => boolean) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const c = x + W * y;
        const d = Math.hypot(x - cx, y - cy) / r;
        if (d >= 1 || x < T || y < T || x >= W || y >= D || !ok(c)) continue;
        top[c] = Math.min(H - 2, Math.max(top[c], floor + Math.round(tall * shape(d, x, y))));
      }
    }
  };
  // Not against the walls: the wall torches over the gaps need clear rock round them.
  const onFree = (c: number) => free[c] === 1 && c % W >= T + 5 && c >= W * (T + 5);
  const dome = (d: number) => Math.sqrt(1 - d * d);
  const cone = (d: number) => (1 - d) ** 1.4;
  const crag = (k: number) => (d: number, x: number, y: number) => Math.max(0, dome(d) * (0.55 + 0.6 * noise2(seed + k, x * 0.45, y * 0.45)) - 0.08);
  // A free spot, more likely where the ground is rocky.
  const cells: number[] = [];
  for (let c = 0; c < W * D; c++) if (onFree(c)) cells.push(c);
  const pick = (bias: number) => {
    if (!cells.length) return null;
    const c = cells[rng.int(0, cells.length - 1)];
    const x = c % W;
    const y = (c - x) / W;
    return noise2(seed + 3, x * 0.06, y * 0.06) + bias > rng.next() ? [x, y] : null;
  };
  // Counts grow with the floor, but slower past mid-size caves so the
  // biggest worlds stay readable instead of a forest of spikes.
  const many = (per: number, base: number, slow: number) => Math.round(Math.min(open / per, base + open / slow));
  // Boulders (low domes) and lone stalagmites (tall cones).
  for (let k = many(90, 60, 400); k > 0; k--) {
    const at = pick(0.15);
    if (!at) continue;
    const spike = rng.chance(0.35);
    const r = spike ? rng.range(1.6, 2.6 + 1.5 * grow) : rng.range(1.5, 3 + 3 * grow);
    const tall = spike ? rng.int(6, 10 + Math.round(14 * grow)) : rng.int(2, 3 + Math.round(5 * grow));
    raise(at[0], at[1], r, tall, spike ? cone : crag(k), onFree);
  }
  // Stalagmite clusters: a tall one with smaller ones crowding round it.
  for (let k = many(500, 6, 3000); k > 0; k--) {
    const at = pick(0.3);
    if (!at) continue;
    const tall = rng.int(12, 16 + Math.round(20 * grow));
    raise(at[0], at[1], rng.range(2.6, 3.4 + 2.4 * grow), tall, cone, onFree);
    for (let j = rng.int(3, 6); j > 0; j--) {
      const a = rng.range(0, Math.PI * 2);
      const d = rng.range(2.5, 4.5 + 2 * grow);
      raise(at[0] + Math.cos(a) * d, at[1] + Math.sin(a) * d, rng.range(1.3, 2.4 + grow), Math.round(tall * rng.range(0.2, 0.6)), cone, onFree);
    }
  }
  // Outcrops: craggy tors of rock (ore() salts them with gold and coal).
  for (let k = many(400, 8, 2500); k > 0; k--) {
    const at = pick(0.2);
    if (!at) continue;
    const r = rng.range(3, 4 + 4 * grow);
    raise(at[0], at[1], r, rng.int(5, 7 + Math.round(9 * grow)), crag(100 + k), onFree);
  }
  // The gold outcrop: a big craggy tor with a spire.
  if (vein) {
    const tall = Math.round(8 + 8 * grow);
    raise(vein.x, vein.y, vein.r, tall, (d, x, y) => Math.max(0.15, (1 - d * d) * (0.6 + 0.5 * noise2(seed + 9, x * 0.35, y * 0.35))), () => true);
    raise(vein.x + vein.r * 0.25, vein.y - vein.r * 0.25, vein.r * 0.5, tall + 4, cone, () => true);
  }
  return top;
}

// Gold and coal in the rock standing on the floor: specks through every
// outcrop and boulder, and fat veins through the gold outcrop.
function ore(v: Voxels, L: Layout, rng: Rng, top: Uint8Array, free: Uint8Array, vein: Disc | null): void {
  const { W, D, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      const h = top[c];
      if (h <= floor + 2 || !free[c]) continue;
      const rich = noise2(seed + 2, x * 0.15, y * 0.15) > 0.62; // some tors carry gold, most only coal
      for (let z = floor; z < h - 1; z++) {
        const r = hash3(seed, x, y, z);
        if (r < (rich ? 0.07 : 0.008)) v.put(x, y, z, M.GOLD_ORE);
        else if (r < 0.1) v.put(x, y, z, M.COAL);
      }
    }
  }
  if (!vein) return;
  for (let y = Math.floor(vein.y - vein.r); y <= Math.ceil(vein.y + vein.r); y++) {
    for (let x = Math.floor(vein.x - vein.r); x <= Math.ceil(vein.x + vein.r); x++) {
      if (x < T || y < T || x >= W || y >= D) continue;
      for (let z = floor; z < top[x + W * y]; z++) {
        const n = noise2(seed + 1, (x - y) * 0.3 + z * 0.12, z * 0.42 + (x + y) * 0.08);
        if (Math.abs(n - 0.5) < 0.07) v.put(x, y, z, M.GOLD_ORE);
        else if (Math.abs(n - 0.2) < 0.03) v.put(x, y, z, M.COAL);
      }
    }
  }
  // Nuggets and dust round its foot.
  for (let k = Math.round(4 + vein.r * 2); k > 0; k--) {
    const a = rng.range(0, Math.PI * 2);
    const d = vein.r + rng.range(0.2, 1.5);
    const x = Math.round(vein.x + Math.cos(a) * d);
    const y = Math.round(vein.y + Math.sin(a) * d);
    const z = v.ground(x, y, floor + 2);
    if (z <= floor + 1 && v.get(x, y, z) === M.AIR) v.put(x, y, z, rng.chance(0.4) ? M.GOLD_ORE : M.ROCK, rng.int(3, 7));
  }
}

// Gold on the outcrop with open air on a side the camera sees.
function exposedGold(v: Voxels, L: Layout, vein: Disc | null): Int32Array {
  if (!vein) return new Int32Array(0);
  const out: number[] = [];
  for (let z = L.floor; z < Math.min(L.H, L.floor + 24); z++) {
    for (let y = Math.floor(vein.y - vein.r - 2); y <= Math.ceil(vein.y + vein.r + 2); y++) {
      for (let x = Math.floor(vein.x - vein.r - 2); x <= Math.ceil(vein.x + vein.r + 2); x++) {
        if (v.get(x, y, z) !== M.GOLD_ORE) continue;
        if (v.get(x + 1, y, z) === M.AIR || v.get(x, y + 1, z) === M.AIR || v.get(x, y, z + 1) === M.AIR) out.push(v.idx(x, y, z));
      }
    }
  }
  return Int32Array.from(out);
}

// Loose stuff on the open floor: drifts of gravel and sand, rocks, and the
// odd gold nugget glinting in the dark.
function litter(v: Voxels, L: Layout, rng: Rng, free: Uint8Array): void {
  const { W, D, T } = L;
  const open = (x: number, y: number) => x >= T && y >= T && x < W && y < D && free[x + W * y] === 1;
  for (let k = Math.round((W * D) / 1800); k > 0; k--) {
    const x = rng.int(T + 3, W - 4);
    const y = rng.int(T + 3, D - 4);
    if (open(x, y)) heap(v, L, x, y, rng.range(2, 4), rng.chance(0.6) ? M.GRAVEL : M.SAND, (hx, hy) => !open(hx, hy));
  }
  for (let k = Math.round((W * D) / 1500); k > 0; k--) {
    const x = rng.int(T + 2, W - 3);
    const y = rng.int(T + 2, D - 3);
    if (!open(x, y)) continue;
    const z = v.ground(x, y);
    if (v.get(x, y, z) === M.AIR) v.put(x, y, z, rng.chance(0.3) ? M.GOLD_DUST : rng.pick([M.ROCK, M.ROCK_DARK, M.COAL]), rng.int(2, 7));
  }
}

// The floor's top voxel: packed dirt with rock showing through and loose
// gravel here and there, in calm broad shades; worn pale along the walkways.
function soil(v: Voxels, L: Layout, rng: Rng, top: Uint8Array, trails: Uint8Array): void {
  const { W, D, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const c = x + W * y;
      const z = top[c] - 1;
      if (z > floor + 2) continue; // rock standing on the floor keeps its layers
      const n = noise2(seed, x * 0.16, y * 0.16);
      const shade = calm(seed + 1, x, y);
      if (trails[c] && z === floor - 1) {
        v.put(x, y, z, M.DIRT, hash3(seed, x, y, 1) < 0.2 ? WORN + 1 : WORN); // worn smooth and pale
        continue;
      }
      v.put(x, y, z, n < 0.22 ? M.ROCK : n > 0.84 ? M.GRAVEL : M.DIRT, shade);
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

// ── the open floor ───────────────────────────────────────────────────────
// Rails from a buffer stop out to the front cut on timber sleepers, a cart
// heaped with ore on them, and crates beside it (the first one a seat).
function railway(v: Voxels, L: Layout, rng: Rng, r: Rails, cart: Disc, seats: readonly Pt[]): void {
  const z = L.floor;
  // (along, across) on the rails to world (x, y)
  const at = (i: number, q: number): [number, number] => (r.alongX ? [r.x0 + i, r.y0 + q] : [r.x0 + q, r.y0 + i]);
  const put = (i: number, q: number, h: number, m: number, shade?: number) => {
    const [x, y] = at(i, q);
    v.put(x, y, z + h, m, shade);
  };
  for (let i = 0; i < r.len; i++) {
    for (let q = -1; q <= 4; q++) {
      put(i, q, 1, M.AIR);
      put(i, q, 0, M.AIR);
      if (i % 2 === 1) put(i, q, -1, M.WOOD, q === -1 || q === 4 ? 1 : 3); // sleepers, flush with the floor
    }
    put(i, 0, 0, M.METAL, 6);
    put(i, 3, 0, M.METAL, 6);
  }
  // Buffer stop: a timber block faced with iron.
  for (let q = -1; q <= 4; q++) {
    for (let h = 0; h < 3; h++) {
      put(0, q, h, M.WOOD, h === 2 ? 5 : 2);
      put(1, q, h, q === 0 || q === 3 ? M.METAL : M.WOOD, h === 2 ? 6 : 3);
    }
  }
  // The cart: wheels on the rails, an iron-cornered timber box, ore heaped in it.
  const c0 = clamp(Math.round(r.alongX ? cart.x - r.x0 : cart.y - r.y0) - 2, 3, Math.max(3, r.len - 7));
  for (const i of [c0 + 1, c0 + 4]) for (const q of [0, 3]) put(i, q, 1, M.METAL, 1);
  for (let i = c0; i < c0 + 6; i++) {
    for (let q = 0; q < 4; q++) {
      put(i, q, 2, M.METAL, 3);
      const wall = i === c0 || i === c0 + 5 || q === 0 || q === 3;
      const corner = (i === c0 || i === c0 + 5) && (q === 0 || q === 3);
      for (let h = 3; h < 5; h++) {
        if (wall) put(i, q, h, corner ? M.METAL : M.WOOD, corner ? 5 : h === 4 ? 5 : 3);
        else put(i, q, h, rng.chance(0.4) ? M.GOLD_ORE : rng.chance(0.5) ? M.COAL : M.ROCK, rng.int(2, 7));
      }
      if (!wall && rng.chance(0.55)) put(i, q, 5, rng.chance(0.5) ? M.GOLD_ORE : M.COAL, rng.int(3, 7));
    }
  }
  // Crates: the seat (two high) and a stack beside it.
  seats.forEach((p, k) => {
    crate(v, p.x - 1, p.y - 1, z, 3, 3, 2);
    if (k > 0) return;
    const [dx, dy] = r.alongX ? [3, 0] : [0, 3];
    const x = p.x - 1 + dx;
    const y = p.y - 1 + dy;
    let room = true;
    for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) if (v.get(xx, yy, z) !== M.AIR || v.get(xx, yy, z - 1) === M.AIR) room = false;
    if (room) {
      crate(v, x, y, z, 3, 3, 3);
      crate(v, x, y, z + 3, 2, 2, 2);
    }
  });
}

// A timber crate: dark planks inside light edges.
function crate(v: Voxels, x0: number, y0: number, z0: number, sx: number, sy: number, sz: number): void {
  for (let z = z0; z < z0 + sz; z++) {
    for (let y = y0; y < y0 + sy; y++) {
      for (let x = x0; x < x0 + sx; x++) {
        const edges = +(x === x0 || x === x0 + sx - 1) + +(y === y0 || y === y0 + sy - 1) + +(z === z0 || z === z0 + sz - 1);
        v.put(x, y, z, M.WOOD, edges >= 2 ? 6 : 2);
      }
    }
  }
}

// The miners' camp: a stone-ringed fire pit on a bed of coal, logs to sit
// on four voxels and more from the flames, and a canvas tent.
function camp(v: Voxels, L: Layout, rng: Rng, s: Disc, logs: readonly Pt[], tent: Tent | null): void {
  const z = L.floor;
  const fx = Math.round(s.x);
  const fy = Math.round(s.y);
  for (let y = fy - 3; y <= fy + 3; y++) {
    for (let x = fx - 3; x <= fx + 3; x++) {
      const d = Math.hypot(x - fx, y - fy);
      if (d <= 1.5) {
        v.put(x, y, z, M.COAL);
      } else if (d <= 2.6) {
        v.put(x, y, z, M.BRICK, rng.int(1, 6));
        if (rng.chance(0.35)) v.put(x, y, z + 1, M.BRICK, rng.int(3, 7));
      }
    }
  }
  for (const [dx, dy] of CAMP_FLAMES) v.put(fx + dx, fy + dy, z + 1, M.FIRE, 2, CAMP_LIFE);
  for (const p of logs) {
    for (const q of logCells(fx, fy, p)) {
      const end = Math.abs(q.x - p.x) + Math.abs(q.y - p.y) >= 2;
      v.put(q.x, q.y, z, M.WOOD, end ? 5 : 1);
      v.put(q.x, q.y, z + 1, M.WOOD, end ? 6 : 3);
    }
  }
  if (!tent) return;
  // An A-frame: canvas sloping down from a ridge pole on two uprights.
  for (const q of tentCells(tent)) {
    const across = tent.alongX ? q.y - tent.y : q.x - tent.x;
    const along = tent.alongX ? q.x - tent.x : q.y - tent.y;
    const h = 4 - Math.abs(across) * 2;
    if (h <= 0) continue;
    const front = along === -3 || along === 3;
    for (let k = 0; k < h; k++) {
      const flap = front && Math.abs(across) < 1 && k < 3; // the doorway, open
      if (!flap) v.put(q.x, q.y, z + k, k === h - 1 ? M.CLOTH : front ? M.CLOTH : M.CLOTH, k === h - 1 ? 5 : 2 + (Math.abs(along) & 1));
    }
  }
  for (const along of [-3, 3]) {
    const [x, y] = tent.alongX ? [tent.x + along, tent.y] : [tent.x, tent.y + along];
    for (let k = 0; k < 5; k++) v.put(x, y, z + k, M.WOOD, 3);
  }
}

// Barrels by the camp and the cart: staves bound with iron, clear of the
// walkways and every flame.
function barrels(v: Voxels, L: Layout, rng: Rng, P: Plan, fires: readonly Pt[]): void {
  const { W, floor } = L;
  const spots = [P.camp, P.cart].filter((d): d is Disc => d !== null);
  for (const d of spots) {
    for (let k = 0, made = 0; k < 16 && made < 2; k++) {
      const a = rng.range(0, Math.PI * 2);
      const x = Math.round(d.x + Math.cos(a) * (d.r - 1.5));
      const y = Math.round(d.y + Math.sin(a) * (d.r - 1.5));
      let room = fires.every((p) => Math.max(Math.abs(p.x - x), Math.abs(p.y - y)) > 5);
      for (let dy = -1; dy <= 1 && room; dy++) {
        for (let dx = -1; dx <= 1 && room; dx++) room = !P.floor.paths[x + dx + W * (y + dy)] && v.get(x + dx, y + dy, floor) === M.AIR && v.get(x + dx, y + dy, floor - 1) !== M.AIR;
      }
      if (!room) continue;
      for (let h = 0; h < 4; h++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx && dy) continue;
            const band = h === 1 || h === 3;
            v.put(x + dx, y + dy, floor + h, band ? M.METAL : M.WOOD, band ? 5 : h === 3 ? 5 : 2 + ((dx + dy) & 1));
          }
        }
      }
      made++;
    }
  }
}

// Heaps of spoil tipped out on the floor: gravel with a cap of sand.
function spoil(v: Voxels, L: Layout, rng: Rng, free: Uint8Array): void {
  const { W, D, T } = L;
  const grow = growth(L);
  const open = (x: number, y: number) => x >= T && y >= T && x < W && y < D && free[x + W * y] === 1;
  for (const p of scatter(L, rng, Math.round(1 + 4 * grow), 26, (x, y) => open(x, y) && Math.min(W - x, D - y) < 30)) {
    const r = rng.range(4, 5 + 3 * grow);
    heap(v, L, p.x, p.y, r, M.GRAVEL, (x, y) => !open(x, y));
    heap(v, L, p.x + 1, p.y + 1, r * 0.45, rng.chance(0.5) ? M.SAND : M.GRAVEL, (x, y) => !open(x, y));
  }
}

// Timber stacked to dry: beams in a 3-2-1 pile, and a few planks leant
// against it.
function timberStack(v: Voxels, L: Layout, rng: Rng, s: Disc): void {
  const alongX = rng.chance(0.5);
  const len = Math.max(5, Math.round(s.r * 1.6));
  const x0 = Math.round(s.x - (alongX ? len / 2 : 3));
  const y0 = Math.round(s.y - (alongX ? 3 : len / 2));
  for (let layer = 0; layer < 3; layer++) {
    for (let b = 0; b < 3 - layer; b++) {
      const across = b * 2 + layer;
      for (let i = 0; i < len; i++) {
        for (let w = 0; w < 2; w++) {
          for (let h = 0; h < 2; h++) {
            const x = alongX ? x0 + i : x0 + across + w;
            const y = alongX ? y0 + across + w : y0 + i;
            const end = i === 0 || i === len - 1;
            v.put(x, y, L.floor + layer * 2 + h, M.WOOD, end ? 6 : (h + w + b) & 1 ? 3 : 2);
          }
        }
      }
    }
  }
}

// Free-standing timber sets out on the floor: two posts and a cap, as if
// propping a roof that has long since gone; well clear of every flame.
function frames(v: Voxels, L: Layout, rng: Rng, free: Uint8Array, fires: readonly Pt[]): void {
  const { W, floor } = L;
  const grow = growth(L);
  const tall = BEAM_H - 4;
  const ok = (x: number, y: number) => free[x + W * y] === 1 && fires.every((p) => Math.hypot(p.x - x, p.y - y) > 8);
  for (const p of scatter(L, rng, Math.round(1 + 3 * grow), 22, ok)) {
    const alongX = rng.chance(0.5);
    const span = 7;
    const cells = (i: number): [number, number] => (alongX ? [p.x + i, p.y] : [p.x, p.y + i]);
    let fits = true;
    for (let i = -1; i <= span + 1 && fits; i++) {
      const [x, y] = cells(i);
      fits = ok(x, y) && v.ground(x, y, floor + 2) <= floor + 1;
    }
    if (!fits) continue;
    for (const i of [0, span - 1]) {
      const [x, y] = cells(i);
      for (let z = v.ground(x, y, floor + 2); z < floor + tall; z++) v.put(x, y, z, M.WOOD, i ? 4 : 2);
    }
    for (let i = -1; i <= span; i++) {
      const [x, y] = cells(i);
      v.put(x, y, floor + tall, M.WOOD, 3);
      v.put(x, y, floor + tall + 1, M.WOOD, 5);
    }
  }
}

// Patches of small mushrooms where it is damp: pale stalks, glowing teal
// or rust-red caps.
function mushrooms(v: Voxels, L: Layout, rng: Rng, free: Uint8Array, damp: (x: number, y: number) => boolean, P: Plan): void {
  const { W, D, T, floor } = L;
  const wet = [P.pool, ...P.puddles].filter((d): d is Disc => d !== null);
  const ok = (x: number, y: number) => x >= T && y >= T && x < W && y < D && free[x + W * y] === 1 && damp(x, y);
  const n = Math.round((W * D) / 2200);
  for (let k = 0; k < n; k++) {
    let cx = rng.int(T + 2, W - 3);
    let cy = rng.int(T + 2, D - 3);
    if (wet.length && rng.chance(0.6)) {
      const d = rng.pick(wet);
      const a = rng.range(0, Math.PI * 2);
      cx = Math.round(d.x + Math.cos(a) * (d.r + 2));
      cy = Math.round(d.y + Math.sin(a) * (d.r + 2));
    }
    if (!ok(cx, cy)) continue;
    const cap = rng.chance(0.6) ? M.FUNGUS : M.BRICK;
    for (let j = rng.int(3, 6); j > 0; j--) {
      const x = cx + rng.int(-2, 2);
      const y = cy + rng.int(-2, 2);
      if (!ok(x, y)) continue;
      const g = v.ground(x, y, floor + 3);
      if (g > floor + 1 || v.get(x, y, g) !== M.AIR) continue;
      const stalk = rng.int(1, 3);
      for (let h = 0; h < stalk; h++) v.put(x, y, g + h, M.BONE, 5);
      v.put(x, y, g + stalk, cap, 6);
      if (stalk >= 2) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(x + dx, y + dy) && v.get(x + dx, y + dy, g + stalk) === M.AIR) v.put(x + dx, y + dy, g + stalk, cap, 3);
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
    for (const s of slotsOn(L, wall)) along.push((wall === 'left' ? s.y0 : s.x0) + Math.floor(s.len / 2));
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
  const P = plan(L);
  for (const [x, y, z] of torchSites(L)) tendTorch(c, x, y, z, MINES_MATS);
  for (const [x, y, z] of P.torches) tendTorch(c, x, y, z, MINES_MATS);
  if (P.camp) campfire(c, L, P.camp);
  if (c.rng.chance(c.dt * 0.3)) drip(c, L);
  // Every 40 s or so sand trickles for a moment from a crack over the corner heap.
  if ((c.t + 13) % 40 < 2.5 && c.rng.chance(0.6)) {
    const [x, y, z] = crack(L);
    if (c.v.get(x, y, z) === M.AIR) c.v.put(x, y, z, M.SAND, c.rng.int(0, 7));
  }
  // The gold outcrop catches the light.
  const gold = GLINTS.get(c.v);
  if (gold && gold.length && c.rng.chance(c.dt * 2)) {
    const i = gold[c.rng.int(0, gold.length - 1)];
    if (c.v.mat[i] === M.GOLD_ORE) {
      const x = c.v.xOf(i);
      const y = c.v.yOf(i);
      const z = c.v.zOf(i);
      c.spawn({ kind: 'glint', x: x + 0.8, y: y + 0.8, z: z + 0.8, vx: 0, vy: 0, vz: 0.3, life: c.rng.range(0.3, 0.6), color: GOLD_GLINT, glow: true, gravity: 0 });
    }
  }
}

// The camp fire: always burning while its coal bed is there, with embers
// and a curl of smoke.
function campfire(c: Ctx, L: Layout, s: Disc): void {
  const x = Math.round(s.x);
  const y = Math.round(s.y);
  const z = L.floor;
  if (c.v.get(x, y, z) !== M.COAL) return;
  for (const [dx, dy] of CAMP_FLAMES) keepFire(c, x + dx, y + dy, z + 1, CAMP_LIFE);
  if (c.rng.chance(c.dt * 3)) keepFire(c, x, y, z + 2, CAMP_LIFE);
  c.light({ x: x + 0.5, y: y + 0.5, z: z + 2.5, color: FLAME, radius: 30, intensity: 0.95 * flicker(c.t, 17) });
  if (c.rng.chance(c.dt * 2.5)) {
    c.spawn({ kind: 'ember', x: x + c.rng.range(0, 1), y: y + c.rng.range(0, 1), z: z + 2.5, vx: c.rng.range(-0.6, 0.6), vy: c.rng.range(-0.6, 0.6), vz: c.rng.range(1.5, 3), life: c.rng.range(0.8, 1.8), color: EMBER, glow: true, gravity: -0.5 });
  }
  if (c.rng.chance(c.dt * 0.8)) puff(c, x, y, z + 6, M.SMOKE, 60);
}

// A drop of seep water off the top of a wall face, never over a prop.
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
  build: BUILD,
  pois: (L) => plan(L).floor.pois.slice(),
};

export default mines;
