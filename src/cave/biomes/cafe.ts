import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { keepClear, slotRect, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import { FLAME, flicker, hash3, isSolid, keepFire, noise2, puff, wallOf, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// The Cozy Café: a corner café on a rainy evening. Oak floorboards, sage
// wainscot under cream plaster fallen away from the brick here and there,
// tall windows streaming with rain over the lights of the town, string
// lights along the tops of the walls and a fire in a brick hearth. Espresso
// hisses at the bar, cups steam on the tables and a ginger cat sleeps by
// the fire.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#1a120d'),
  wall: hex('#ead9bb'),
  wall2: hex('#d9c3a0'),
  floor: hex('#a36a3c'),
  floor2: hex('#8a5a33'),
  text: hex('#f4e8d4'),
  dim: hex('#a88d74'),
  accent: hex('#e0a84a'),
  accent2: hex('#c8663f'),
  panel: hex('#24180f'),
  panelText: hex('#f4e8d4'),
  border: hex('#9a6a44'),
  bubble: hex('#fff7ea'),
  bubbleText: hex('#3b2a1e'),
  good: hex('#8fbf7a'),
  warn: hex('#e8a94e'),
  bad: hex('#d0583e'),
};

const GRADE: Grade = { ambient: hex('#c8ac96'), illum: 1, bloom: 0.5, vignette: 0.2 };

// Warm wood and brick. ROCK is the oak floorboards and DIRT walnut (trim,
// the mantel): wood that never burns, so a blast can't take the room;
// GRAVEL is the splinters it leaves. CONCRETE sage paint, OBSIDIAN chalkboard slate, PLASTIC the
// green front door, BONE porcelain, GOLD_ORE brass, BRIMSTONE pastry and
// ginger cat, TILE the rainy sky outside and ROCK_DARK the roofs under it.
const COLORS: Partial<Record<number, string>> = {
  [M.WOOD]: '#9c653b',
  [M.ROCK]: '#96613a',
  [M.GRAVEL]: '#6e4a30',
  [M.DIRT]: '#5b3a24',
  [M.PLASTER]: '#ead9bb',
  [M.BRICK]: '#a5583c',
  [M.CONCRETE]: '#8fa98a',
  [M.CLOTH]: '#b95f3e',
  [M.CARPET]: '#cf9c3e',
  [M.OBSIDIAN]: '#2c3530',
  [M.PLASTIC]: '#3f5e4c',
  [M.METAL]: '#a7aeb3',
  [M.BONE]: '#f0e8d8',
  [M.GOLD_ORE]: '#d1a64a',
  [M.BRIMSTONE]: '#d98f45',
  [M.TILE]: '#2f3d55',
  [M.ROCK_DARK]: '#181d27',
  [M.LEAF]: '#5d9150',
  [M.MOSS]: '#3f6e3c',
};

// A gingerbread house, iced, with a brick-red roof and a lit window.
const BUILD: BuildStyle = { mats: [M.BRIMSTONE, M.CANDLE, M.BRICK, M.LAMP], shape: 'house' };

const RAIN: RGB = hex('#cfe0ee');
const LAMPLIGHT: RGB = hex('#ffcf8a');
const SCREENLIGHT: RGB = hex('#8fdcff');
const WIFI: RGB = hex('#6eeaff');
const FLASH: RGB = hex('#dce6ff');
const PAGE: RGB = hex('#efe8d6');
const COFFEE: RGB = hex('#5a3420');
const SLEEP: RGB = hex('#f3ead8');
const EMBER: RGB = hex('#ff9a3c');
const NOTE: RGB = hex('#ffe3a0');
const BOOKS = [M.CLOTH, M.CARPET, M.CONCRETE, M.PLASTIC, M.TILE, M.PAPER, M.DIRT, M.OBSIDIAN, M.BONE];

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
const PLUS: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];

const RAIL = 8; // the chair rail atop the wainscot, above the floor
const SPAN = 12; // string lights: hooks this far apart
const SILL = 6; // window glass starts this high

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── fixtures ─────────────────────────────────────────────────────────────
// What weather() animates, recorded by generate() (and the props it
// builds) per world.
type Pane = { wall: Side; a0: number; a1: number; h0: number; h1: number };
type Win = Pane & { T: number; floor: number; trough: number[]; sky: number[]; tint: number[] };
type Clock = { wall: Side; T: number; floor: number; a: number; h: number; r: number; painted: number[]; sec: number };
type Kitty = { x: number; y: number; z: number };
type Fixtures = {
  windows: Win[];
  bulbs: number[];
  cups: number[]; // the top coffee voxel of every cup that steams
  flames: Array<readonly [number, number, number]>;
  fire: readonly [number, number, number] | null; // the hearth's light
  clock: Clock | null;
  cat: Kitty | null;
  lamps: Array<readonly [number, number, number]>; // floor lamps out on the floor
  candles: Array<readonly [number, number, number]>; // jar candles on the tables
  piano: readonly [number, number, number] | null; // where its notes rise
  flash: boolean;
};

const FIXTURES = new WeakMap<Voxels, Fixtures>();

// ── frames ───────────────────────────────────────────────────────────────
// On a wall: `a` along it, `o` out from its face (0 = the first voxel of
// floor, negative into the slab), `h` above the floor. A layout or a slot's
// wall gives the slab thickness and floor height.
type Frame = { T: number; floor: number };

function at(F: Frame, wall: Side, a: number, o: number): [number, number] {
  return wall === 'left' ? [F.T + o, a] : [a, F.T + o];
}

function wput(v: Voxels, F: Frame, wall: Side, a: number, o: number, h: number, m: number, shade?: number): void {
  const [x, y] = at(F, wall, a, o);
  v.put(x, y, F.floor + h, m, shade);
}

function wget(v: Voxels, F: Frame, wall: Side, a: number, o: number, h: number): number {
  const [x, y] = at(F, wall, a, o);
  return v.get(x, y, F.floor + h);
}

const frameOf = (s: Slot): Frame => ({ T: wallOf(s), floor: s.z0 });
const along = (s: Slot) => (s.wall === 'left' ? s.y0 : s.x0);

// In a slot's frame (see props.ts): a along the wall, b out, h up.
function sput(v: Voxels, s: Slot, a: number, b: number, h: number, m: number, shade?: number): void {
  v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, m, shade);
}

function sget(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.get(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

function sidx(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.idx(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

// Fills [a0, a1) x [b0, b1) x [h0, h1).
function sfill(v: Voxels, s: Slot, a0: number, b0: number, h0: number, a1: number, b1: number, h1: number, m: number, shade?: number): void {
  for (let h = h0; h < h1; h++) for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) sput(v, s, a, b, h, m, shade);
}

// Fills a world box [x0, x1) x [y0, y1) x [z0, z1).
function box(v: Voxels, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number, shade?: number): void {
  for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.put(x, y, z, m, shade);
}

// ── materials in patterns ────────────────────────────────────────────────
// Running bond: bricks five long and two high in cream mortar.
function brick(seed: number, a: number, h: number): [number, number] {
  const hh = h + 300;
  const course = Math.floor(hh / 3);
  const k = a + 300 + (course & 1) * 3;
  if (hh % 3 === 2 || k % 6 === 0) return [M.PLASTER, 1];
  return [M.BRICK, 1 + Math.floor(hash3(seed, Math.floor(k / 6), course, 7) * 6)];
}

// The inner face of a wall: walnut skirting, sage panelling to the chair
// rail, cream plaster above with the brick showing through where it has
// come away, and a walnut cornice.
function face(seed: number, wall: Side, a: number, h: number, R: number): [number, number] {
  if (h < 0) return brick(seed, a + 1, h);
  if (h < 2) return [M.DIRT, h === 0 ? 2 : 4];
  if (h < RAIL) {
    const pa = (a + 3) % 7;
    if (h === 2 || h === RAIL - 1 || pa === 0) return [M.CONCRETE, 6];
    if (h === RAIL - 2 || pa === 1) return [M.CONCRETE, 2];
    return [M.CONCRETE, 4];
  }
  if (h === RAIL) return [M.DIRT, 5];
  if (h >= R - 2) return [M.DIRT, h === R - 1 ? 6 : 3];
  const k = wall === 'left' ? 1 : 2;
  const n = noise2(seed + k, a * 0.08, h * 0.1) + 0.1 * (hash3(seed, a, h, k) - 0.5);
  if (n > 0.66) return brick(seed, a + 1, h);
  return [M.PLASTER, n > 0.62 ? 1 : 3 + Math.floor(hash3(seed, a >> 1, h >> 1, 9 + k) * 3)];
}

// Oak boards four wide running along x, staggered, with dark seams.
function plank(seed: number, T: number, x: number, y: number): [number, number] {
  const j = y - T;
  const row = Math.floor(j / 5);
  if (j % 5 === 4) return [M.ROCK, 1];
  const len = 10 + Math.floor(hash3(seed, row, 0, 51) * 10);
  const u = x - T + Math.floor(hash3(seed, row, 1, 52) * len);
  if (u % len === 0) return [M.ROCK, 0];
  const n = Math.floor(u / len);
  let s = hash3(seed, row, n, 56) < 0.1 ? 5 : 2 + Math.floor(hash3(seed, row, n, 53) * 3);
  if (hash3(seed, x, y, 54) < 0.07) s += hash3(seed, x, y, 55) < 0.5 ? -1 : 1;
  return [M.ROCK, clamp(s, 1, 7)];
}

// ── small things ─────────────────────────────────────────────────────────
// A mug, round at this scale: a plus of porcelain round `rings` layers of
// coffee (the bottom `full` of them filled) on a plus-shaped foot at z.
// Returns the voxel index of each layer inside, bottom up.
function cup(v: Voxels, x: number, y: number, z: number, rings = 1, full = rings): number[] {
  for (const [dx, dy] of PLUS) v.put(x + dx, y + dy, z, M.BONE, dx || dy ? 4 : 2);
  const inside: number[] = [];
  for (let k = 1; k <= rings; k++) {
    for (let n = 1; n < PLUS.length; n++) v.put(x + PLUS[n][0], y + PLUS[n][1], z + k, M.BONE, k === rings ? 6 : 5);
    v.put(x, y, z + k, k <= full ? M.COFFEE : M.AIR, k <= full ? 3 : 0);
    inside.push(v.idx(x, y, z + k));
  }
  FIXTURES.get(v)?.cups.push(inside[rings - 1]);
  return inside;
}

// A terracotta pot 3 x 3 with its corner at (x, y) and a leafy crown
// `tall` voxels high on a short stem. Leaves only grow into air.
function plant(v: Voxels, x: number, y: number, z: number, tall: number, rng: Rng): void {
  for (let h = 0; h < 3; h++) {
    for (let dy = 0; dy < 3; dy++) {
      for (let dx = 0; dx < 3; dx++) {
        const soil = h === 2 && dx === 1 && dy === 1;
        v.put(x + dx, y + dy, z + h, soil ? M.DIRT : M.BRICK, h === 2 ? 6 : h === 0 ? 2 : 4);
      }
    }
  }
  const cx = x + 1;
  const cy = y + 1;
  const stem = Math.max(1, tall >> 2);
  for (let h = 3; h < 3 + stem; h++) v.put(cx, cy, z + h, M.WOOD, 2);
  const rz = Math.max(1.5, (tall - stem) / 2);
  const r = clamp(tall / 3.4, 1.6, 2.6);
  const hc = 3 + stem + rz;
  for (let h = Math.floor(hc - rz); h <= Math.ceil(hc + rz); h++) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const e = (dx / r) ** 2 + (dy / r) ** 2 + ((h - hc) / rz) ** 2;
        if (e > 1 || !rng.chance(e < 0.45 ? 0.95 : 0.7)) continue;
        if (v.get(cx + dx, cy + dy, z + h) !== M.AIR) continue;
        const top = h - hc > rz * 0.3;
        v.put(cx + dx, cy + dy, z + h, !top && rng.chance(0.35) ? M.MOSS : M.LEAF, top ? rng.int(4, 7) : rng.int(1, 5));
      }
    }
  }
}

// A framed picture on a wall: walnut frame standing a voxel proud, the
// canvas set back in the wall face. `paint` colours the canvas, (x, y) from
// its bottom-left as seen.
function picture(v: Voxels, F: Frame, wall: Side, a0: number, a1: number, h0: number, h1: number, paint: (x: number, y: number, w: number, hh: number) => [number, number]): void {
  const w = a1 - a0 - 2;
  const hh = h1 - h0 - 2;
  for (let h = h0; h < h1; h++) {
    for (let a = a0; a < a1; a++) {
      if (a === a0 || a === a1 - 1 || h === h0 || h === h1 - 1) {
        wput(v, F, wall, a, 0, h, M.DIRT, h === h1 - 1 ? 5 : 3);
        continue;
      }
      // as seen, x runs to the right: +a on the right wall, -a on the left
      const x = wall === 'right' ? a - a0 - 1 : a1 - 2 - a;
      const [m, s] = paint(x, h - h0 - 1, w, hh);
      wput(v, F, wall, a, -1, h, m, s);
    }
  }
}

// Hills under a hazy evening sky with a low sun.
function hills(x: number, y: number, w: number, h: number): [number, number] {
  const far = Math.round(h * (0.42 + 0.14 * Math.sin(x * 0.7 + 1)));
  const near = Math.round(h * (0.22 + 0.12 * Math.sin(x * 0.5 + 3)));
  if (y < near) return [M.MOSS, 3];
  if (y < far) return [M.CONCRETE, 3];
  if ((x - w * 0.68) ** 2 + (y - h * 0.62) ** 2 < 2.2) return [M.GOLD_ORE, 6];
  return y > h * 0.75 ? [M.TILE, 6] : [M.BONE, 3];
}

// A coffee cup on mustard, steam curling off it.
function cupArt(x: number, y: number, w: number, h: number): [number, number] {
  const cx = Math.floor(w / 2);
  const top = Math.floor(h * 0.55);
  if (y < top && y > 0 && Math.abs(x - cx) <= Math.max(1, Math.floor(w / 4))) return y === top - 1 ? [M.DIRT, 2] : [M.BONE, 6];
  if (y === 0 && Math.abs(x - cx) <= Math.max(1, Math.floor(w / 4)) + 1) return [M.BONE, 4];
  if (y > top && x === cx + ((y >> 1) & 1)) return [M.CANDLE, 7];
  return [M.CARPET, 4];
}

// ── windows ──────────────────────────────────────────────────────────────
// What shows through the glass at height y of hh: rooftops with a lit
// window here and there under a rainy evening sky, paler low down.
function outside(seed: number, k: number, a: number, y: number, hh: number): [number, number] {
  const block = Math.floor((a + k) / 4);
  const roof = Math.floor(hh * (0.14 + 0.3 * hash3(seed, block, k, 41)));
  if (y < roof) {
    if ((a & 1) === 0 && y % 3 === 1 && y < roof - 1 && hash3(seed, a, y, k) < 0.3) return [M.LED_AMBER, 2];
    return [M.ROCK_DARK, 2 + Math.floor(hash3(seed, a, y, 43) * 3)];
  }
  if (hash3(seed, a, Math.floor(y / 3), k + 44) < 0.06) return [M.TILE, 7]; // a streak of rain
  return [M.TILE, clamp(Math.round(6 - (y / hh) * 5), 0, 7)];
}

// A window in a wall: a cream frame proud of the face, glass two voxels
// in (with glazing bars) and the town beyond it, a recess in front of the
// glass for the rain to run down and, under it, a gutter of water behind a
// sill lip that catches it.
function glaze(v: Voxels, F: Frame, p: Pane, seed: number): Win {
  const { wall, a0, a1, h0, h1 } = p;
  const w = a1 - a0;
  const panes = Math.max(1, Math.round((w + 1) / 5));
  const bars = new Set<number>();
  for (let k = 1; k < panes; k++) bars.add(a0 + Math.round((k * (w + 1)) / panes) - 1);
  const transom = h0 + Math.round((h1 - h0) * 0.7);
  const k = (wall === 'left' ? 17 : 29) + a0;
  const win: Win = { ...p, T: F.T, floor: F.floor, trough: [], sky: [], tint: [] };
  for (let h = h0 - 2; h <= h1; h++) {
    for (let a = a0 - 1; a <= a1; a++) {
      const glass = a >= a0 && a < a1 && h >= h0 && h < h1;
      if (!glass) {
        wput(v, F, wall, a, -1, h, M.BONE, h === h1 || h === h0 - 2 ? 6 : 5);
        wput(v, F, wall, a, -2, h, M.BONE, 3);
        continue;
      }
      wput(v, F, wall, a, -1, h, M.AIR, 0);
      const bar = bars.has(a) || h === transom;
      wput(v, F, wall, a, -2, h, bar ? M.BONE : M.GLASS, bar ? 4 : 5);
      const [m, s] = outside(seed, k, a, h - h0, h1 - h0);
      wput(v, F, wall, a, -3, h, m, s);
      if (m === M.TILE) {
        const [x, y] = at(F, wall, a, -3);
        win.sky.push(v.idx(x, y, F.floor + h));
        win.tint.push(s);
      }
    }
  }
  for (let a = a0; a < a1; a++) {
    wput(v, F, wall, a, -1, h0 - 1, M.WATER, 3);
    wput(v, F, wall, a, 0, h0 - 1, M.BONE, 6);
    wput(v, F, wall, a, 0, h0, M.BONE, 5);
    wput(v, F, wall, a, 0, h0 + 1, M.BONE, 7);
    const [x, y] = at(F, wall, a, -1);
    win.trough.push(v.idx(x, y, F.floor + h0 - 1));
  }
  FIXTURES.get(v)?.windows.push(win);
  return win;
}

// ── props ────────────────────────────────────────────────────────────────

// write: a laptop on an oak table, a mug of coffee beside it, a notebook
// and a little plant, a chair pulled out. Working wakes the screen.
const LID: ReadonlyArray<readonly [number, number]> = [3, 4, 5, 6].flatMap((a) => [6, 7, 8].map((h) => [a, h] as const));

const laptopTable: Prop = {
  name: 'laptop table',
  build(v, s, rng) {
    sfill(v, s, 1, 0, 4, 10, 5, 5, M.WOOD, 5); // top
    for (let a = 1; a < 10; a++) sput(v, s, a, 4, 4, M.WOOD, 6);
    for (const a of [1, 9]) for (const b of [0, 4]) sfill(v, s, a, b, 0, a + 1, b + 1, 4, M.WOOD, 2);
    sfill(v, s, 2, 4, 3, 9, 5, 4, M.WOOD, 3); // apron
    sfill(v, s, 3, 0, 5, 7, 3, 6, M.METAL, 5); // laptop
    for (let a = 4; a < 6; a++) sput(v, s, a, 2, 5, M.METAL, 2);
    for (const [a, h] of LID) sput(v, s, a, 0, h, M.OBSIDIAN, 2);
    cup(v, wx(s, 8, 2), wy(s, 8, 2), s.z0 + 5);
    sfill(v, s, 1, 3, 5, 3, 4, 6, M.PAPER, 6); // notebook
    sput(v, s, 2, 2, 5, M.DIRT, 1); // pen
    sfill(v, s, 1, 0, 5, 3, 2, 6, M.BRICK, 4); // a little plant
    for (const [a, b, h] of [[1, 0, 6], [2, 0, 6], [1, 1, 6], [2, 1, 6], [1, 0, 7], [2, 1, 7], [2, 0, 8]] as const) sput(v, s, a, b, h, rng.chance(0.3) ? M.MOSS : M.LEAF, rng.int(3, 7));
    // the chair, pulled out
    sfill(v, s, 4, 5, 2, 7, 7, 3, M.WOOD, 5);
    for (const a of [4, 6]) for (const b of [5, 6]) sfill(v, s, a, b, 0, a + 1, b + 1, 2, M.DIRT, 3);
    sfill(v, s, 4, 6, 3, 7, 7, 6, M.WOOD, 3);
    sfill(v, s, 4, 6, 6, 7, 7, 7, M.WOOD, 6);
  },
  tick(c, s, active) {
    const v = c.v;
    const scroll = Math.floor(c.t * 5);
    for (const [a, h] of LID) {
      const was = sget(v, s, a, 0, h);
      if (was !== M.SCREEN && was !== M.OBSIDIAN) continue;
      const row = 8 - h + scroll;
      const text = a - 3 < 1 + Math.floor(hash3(7, row, 0, 1) * 4);
      if (active) sput(v, s, a, 0, h, M.SCREEN, text ? 7 : 1);
      else sput(v, s, a, 0, h, M.OBSIDIAN, 2);
    }
    if (active) c.light({ x: wx(s, 5, 2), y: wy(s, 5, 2), z: s.z0 + 7.5, color: SCREENLIGHT, radius: 14, intensity: 0.5 + 0.05 * Math.sin(c.t * 7) });
  },
};

// read: a tall bookcase of every colour of binding with a plant trailing
// off the top, a mustard armchair beside it and a floor lamp leaning over.
// Reading turns the lamp up; dust motes drift in its light and the pages
// of the open book turn.
const BOARDS = [0, 5, 10, 15, 19];

const readingNook: Prop = {
  name: 'reading nook',
  build(v, s, rng) {
    const top = BOARDS[BOARDS.length - 1];
    sfill(v, s, 1, 0, 0, 8, 1, top, M.WOOD, 1);
    for (const a of [0, 8]) sfill(v, s, a, 0, 0, a + 1, 3, top + 1, M.WOOD, 3);
    for (const h of BOARDS) sfill(v, s, 0, 0, h, 9, 3, h + 1, M.WOOD, 5);
    for (let k = 0; k + 1 < BOARDS.length; k++) {
      const h0 = BOARDS[k] + 1;
      const room = BOARDS[k + 1] - h0;
      for (let a = 1; a < 8; ) {
        const r = rng.next();
        if (r < 0.08) {
          a++;
        } else if (r < 0.2 && a + 2 <= 8) {
          for (let i = rng.int(1, 2) - 1; i >= 0; i--) sfill(v, s, a, 1, h0 + i, a + 2, 3, h0 + i + 1, rng.pick(BOOKS), rng.int(2, 6));
          a += 2;
        } else {
          sfill(v, s, a, 1, h0, a + 1, 3, h0 + room - rng.int(0, 1), rng.pick(BOOKS), rng.int(1, 6));
          a++;
        }
      }
    }
    // a pothos trailing off the top
    sfill(v, s, 5, 1, top + 1, 7, 3, top + 2, M.BRICK, 5);
    for (let a = 4; a < 8; a++) for (let b = 0; b < 3; b++) if (rng.chance(0.7)) sput(v, s, a, b, top + 2, M.LEAF, rng.int(3, 7));
    for (let h = top; h > top - 7; h--) if (rng.chance(0.8)) sput(v, s, 7 + (h & 1), 3, h, h & 1 ? M.MOSS : M.LEAF, rng.int(2, 6));
    // the armchair
    sfill(v, s, 9, 0, 0, 13, 4, 2, M.CARPET, 2);
    sfill(v, s, 10, 1, 2, 12, 4, 3, M.CARPET, 5);
    sfill(v, s, 9, 0, 2, 13, 1, 7, M.CARPET, 3);
    for (const a of [9, 12]) sfill(v, s, a, 1, 2, a + 1, 4, 4, M.CARPET, 4);
    sfill(v, s, 10, 2, 3, 12, 3, 4, M.PAPER, 6); // an open book
    // the floor lamp
    sput(v, s, 13, 1, 0, M.METAL, 2);
    for (let h = 1; h < 13; h++) sput(v, s, 13, 1, h, M.GOLD_ORE, 4);
    sfill(v, s, 12, 0, 13, 14, 3, 14, M.LAMP, 6);
    sfill(v, s, 12, 0, 14, 14, 3, 15, M.CANDLE, 5);
  },
  tick(c, s, active) {
    const x = wx(s, 12.5, 1.5);
    const y = wy(s, 12.5, 1.5);
    c.light({ x, y, z: s.z0 + 12.5, color: LAMPLIGHT, radius: active ? 18 : 13, intensity: active ? 0.7 : 0.4 });
    if (!active) return;
    if (c.rng.chance(c.dt * 2.5)) {
      c.spawn({ kind: 'glint', x: x + c.rng.range(-2, 2), y: y + c.rng.range(-2, 2), z: s.z0 + c.rng.range(6, 11), vx: c.rng.range(-0.3, 0.3), vy: c.rng.range(-0.3, 0.3), vz: c.rng.range(-0.2, 0.3), life: c.rng.range(1.2, 2.4), color: LAMPLIGHT, glow: true, gravity: 0 });
    }
    // a page turns now and then
    const turn = Math.floor(c.t / 1.4) & 1;
    sput(c.v, s, 10, 2, 3, M.PAPER, turn ? 7 : 5);
    sput(c.v, s, 11, 2, 3, M.PAPER, turn ? 5 : 7);
  },
};

// search: a newspaper rack, three tiers of papers and a top row of
// magazines, with a basket of rolled papers at its foot. Searching it
// rustles the pages and sends the odd sheet fluttering down.
const PAPERS = [0, 4, 8];

const newsRack: Prop = {
  name: 'newspaper rack',
  build(v, s, rng) {
    for (const a of [0, 11]) sfill(v, s, a, 0, 0, a + 1, 3, 13, M.WOOD, 3);
    sfill(v, s, 1, 0, 0, 11, 1, 13, M.WOOD, 1);
    sfill(v, s, 0, 0, 12, 12, 3, 13, M.WOOD, 5);
    sfill(v, s, 4, 0, 13, 8, 1, 14, M.GOLD_ORE, 5); // a brass plate
    for (const hb of PAPERS) {
      sfill(v, s, 1, 0, hb, 11, 3, hb + 1, M.WOOD, 5);
      for (let a = 1; a < 11; a++) sput(v, s, a, 2, hb + 1, M.WOOD, 6); // the ledge lip
      for (let p = 0; p < 3; p++) {
        const a0 = 1 + p * 3 + (p > 0 ? 1 : 0);
        const mag = hb === PAPERS[PAPERS.length - 1];
        const cover = rng.pick([M.CLOTH, M.CARPET, M.CONCRETE, M.PLASTIC, M.TILE]);
        for (let a = a0; a < a0 + 3; a++) {
          for (let h = hb + 1; h <= hb + 3; h++) {
            let m: number = M.PAPER;
            let sh = h === hb + 2 ? 3 : 6;
            if (mag) {
              m = h === hb + 3 && a === a0 + 1 ? M.PAPER : cover;
              sh = rng.int(3, 6);
            } else if (h === hb + 3) {
              m = a === a0 + 2 ? M.PAPER : M.DIRT; // headline
              sh = a === a0 + 2 ? 6 : 1;
            } else if (h === hb + 2 && a === a0) {
              m = M.ROCK_DARK; // a photo
              sh = 4;
            }
            sput(v, s, a, 1, h, m, sh);
          }
        }
      }
    }
    // the basket
    for (let a = 7; a < 11; a++) for (let b = 2; b < 4; b++) sfill(v, s, a, b, 0, a + 1, b + 1, 2, M.WOOD, (a + b) & 1 ? 3 : 5);
    for (const [a, b, h] of [[8, 3, 2], [9, 2, 2], [9, 3, 3], [8, 2, 3]] as const) sput(v, s, a, b, h, M.PAPER, 6);
  },
  tick(c, s, active) {
    if (!c.rng.chance(c.dt * (active ? 9 : 0.4))) return;
    const a = c.rng.int(1, 10);
    const h = c.rng.pick(PAPERS) + c.rng.int(1, 3);
    if (sget(c.v, s, a, 1, h) === M.PAPER) sput(c.v, s, a, 1, h, M.PAPER, c.rng.int(4, 7));
    if (active && c.rng.chance(0.3)) {
      const out = s.wall === 'right' ? [0, 1] : [1, 0];
      c.spawn({ kind: 'debris', x: wx(s, a + 0.5, 2.5), y: wy(s, a + 0.5, 2.5), z: s.z0 + h + 1, vx: out[0] * c.rng.range(0.5, 1.5) + c.rng.range(-0.5, 0.5), vy: out[1] * c.rng.range(0.5, 1.5) + c.rng.range(-0.5, 0.5), vz: c.rng.range(0.5, 1.5), life: 2.5, color: PAGE, glow: false, gravity: 3 });
    }
  },
};

// run: the espresso bar, standing out on the floor. A back counter with the
// grinder, jars of beans and stacks of cups under a walnut gantry that
// carries a shelf of mugs and the chalkboard menu; a marble-topped front
// counter with the machine (two group heads over two
// cups, a steam wand) and a glass case of pastries. Running it pulls shots:
// coffee streams into a cup and fills it, the wand hisses steam, and the
// cup is served and the next one started.
const HEADS = [2, 5]; // group heads, along the counter
const POUR = 5; // seconds per shot
const MENU = { h0: 11, h1: 17 }; // the menu board on the gantry, [h0, h1)

const espressoBar: Prop = {
  name: 'espresso bar',
  build(v, s, rng) {
    // back counter
    sfill(v, s, 0, 0, 0, 11, 3, 4, M.DIRT, 3);
    for (let a = 0; a < 11; a += 2) sfill(v, s, a, 2, 0, a + 1, 3, 4, M.DIRT, 5);
    sfill(v, s, 0, 0, 4, 11, 3, 5, M.CANDLE, 5);
    sfill(v, s, 8, 0, 5, 10, 2, 8, M.METAL, 3); // grinder
    sfill(v, s, 8, 0, 8, 10, 2, 10, M.GLASS, 5);
    sfill(v, s, 8, 0, 8, 10, 1, 9, M.DIRT, 2); // beans in the hopper
    for (const a of [4, 6]) {
      sput(v, s, a, 1, 5, M.GLASS, 5);
      sput(v, s, a, 1, 6, M.GLASS, 5);
      sput(v, s, a, 0, 5, M.DIRT, 2);
      sput(v, s, a, 0, 6, M.DIRT, 3);
    }
    for (let h = 5; h < 9; h++) sput(v, s, 1, 1, h, M.BONE, h & 1 ? 6 : 4); // stacked cups
    // the gantry: two posts off the back counter carrying the shelf of mugs
    // and the menu
    for (const a of [0, 10]) sfill(v, s, a, 0, 5, a + 1, 1, MENU.h1 + 1, M.DIRT, 3);
    sfill(v, s, 0, 0, MENU.h1, 11, 1, MENU.h1 + 1, M.DIRT, 5);
    sfill(v, s, 0, 0, 10, 11, 2, 11, M.WOOD, 5);
    for (let a = 1; a < 10; a += 2) sput(v, s, a, 1, 11, rng.pick([M.BONE, M.BONE, M.CLOTH, M.CONCRETE, M.CARPET]), 5);
    // front counter: slatted oak under marble
    sfill(v, s, 0, 6, 0, 11, 10, 5, M.DIRT, 3);
    for (let a = 0; a < 11; a++) sfill(v, s, a, 9, 1, a + 1, 10, 5, M.DIRT, a & 1 ? 2 : 5);
    sfill(v, s, 0, 9, 0, 11, 10, 1, M.DIRT, 1);
    sfill(v, s, 0, 6, 5, 11, 11, 6, M.CANDLE, 6);
    // the machine
    sfill(v, s, 1, 6, 6, 7, 8, 12, M.OBSIDIAN, 4);
    for (let a = 1; a < 7; a++) sput(v, s, a, 7, 11, M.METAL, 6); // chrome trim
    sfill(v, s, 1, 6, 12, 7, 8, 13, M.METAL, 6);
    sfill(v, s, 3, 6, 13, 5, 8, 14, M.GOLD_ORE, 6);
    sput(v, s, 3, 7, 10, M.BONE, 7); // pressure gauge
    sput(v, s, 4, 7, 10, M.LED_RED, 6);
    for (const a of [1, 6]) sput(v, s, a, 7, 13, M.BONE, 6);
    for (const a of HEADS) {
      sput(v, s, a, 8, 10, M.METAL, 1);
      sput(v, s, a, 9, 10, M.METAL, 2);
    }
    for (let a = 1; a < 7; a++) for (let b = 8; b < 11; b++) sput(v, s, a, b, 6, M.METAL, 2); // drip tray
    HEADS.forEach((a, k) => cup(v, wx(s, a, 9), wy(s, a, 9), s.z0 + 6, 2, k === 0 ? 2 : 0));
    for (let h = 7; h < 11; h++) sput(v, s, 0, 8, h, M.METAL, 6); // steam wand
    sput(v, s, 0, 9, 7, M.METAL, 4);
    // the pastry case
    sfill(v, s, 7, 6, 6, 11, 10, 10, M.GLASS, 5);
    sfill(v, s, 8, 7, 6, 10, 9, 9, M.AIR, 0);
    sput(v, s, 8, 7, 6, M.BRIMSTONE, 5);
    sput(v, s, 9, 7, 6, M.BRIMSTONE, 3);
    sput(v, s, 8, 8, 6, M.CLOTH, 4);
    sput(v, s, 9, 8, 6, M.CANDLE, 6);
    sput(v, s, 8, 7, 7, M.BRIMSTONE, 6);
    sput(v, s, 9, 8, 7, M.BRIMSTONE, 4);
    // the chalkboard menu between the posts, its rim walnut
    const w = 9;
    const hh = MENU.h1 - MENU.h0 - 1;
    for (let a = 1; a < 10; a++) {
      sput(v, s, a, 0, MENU.h0, M.DIRT, 4);
      // as seen, x runs to the right: +a in the right wall's frame, -a in the left's
      const x = s.wall === 'right' ? a - 1 : 9 - a;
      for (let y = 0; y < hh; y++) {
        let m: [number, number] = [M.OBSIDIAN, 2 + (hash3(5, x, y, 6) < 0.2 ? 1 : 0)];
        if (y === hh - 1) m = x >= 1 && x < w - 1 && (x & 3) !== 3 ? [M.CANDLE, 7] : [M.OBSIDIAN, 3];
        else if (y === 0 && x < 2) m = [M.CLOTH, 5]; // a doodled cup
        else if ((hh - 1 - y) % 2 === 0 && y > 0) {
          if (x >= w - 2) m = [M.BRIMSTONE, 6]; // prices
          else if (x < 2 + Math.floor(hash3(5, y, 0, 3) * (w - 4)) && hash3(5, x, y, 4) > 0.15) m = [M.CANDLE, 6];
        }
        sput(v, s, a, 0, MENU.h0 + 1 + y, m[0], m[1]);
      }
    }
  },
  tick(c, s, active) {
    const v = c.v;
    const lit = Math.floor(c.t * 2) % 2 === 0;
    if (sget(v, s, 4, 7, 10) === M.LED_RED || sget(v, s, 4, 7, 10) === M.LED_AMBER) sput(v, s, 4, 7, 10, active && lit ? M.LED_AMBER : M.LED_RED, 6);
    const wand = () => {
      for (let k = 0; k < 2; k++) puff(c, wx(s, 0, 10), wy(s, 0, 10), s.z0 + 7 + k, M.STEAM, c.rng.int(25, 50));
    };
    if (!active) {
      if (c.rng.chance(c.dt * 0.15)) wand();
      return;
    }
    c.light({ x: wx(s, 4, 9), y: wy(s, 4, 9), z: s.z0 + 9, color: LAMPLIGHT, radius: 14, intensity: 0.45 });
    if (c.rng.chance(c.dt * 1.2)) wand();
    // pull a shot into one cup, then the other
    const k = Math.floor(c.t / POUR) % HEADS.length;
    const ph = c.t % POUR;
    const a = HEADS[k];
    const lower = sidx(v, s, a, 9, 7);
    const upper = sidx(v, s, a, 9, 8);
    if (ph < 2.6) {
      if (ph < 0.15) for (const i of [lower, upper]) if (v.mat[i] === M.COFFEE) v.set(i, M.AIR, 0, 0); // a fresh cup
      if (c.rng.chance(c.dt * 14)) {
        c.spawn({ kind: 'drop', x: wx(s, a + 0.5, 9.5), y: wy(s, a + 0.5, 9.5), z: s.z0 + 9.9, vx: 0, vy: 0, vz: -1, life: 1, color: COFFEE, glow: false, gravity: 20 });
      }
      if (ph > 0.9 && v.mat[lower] === M.AIR) v.set(lower, M.COFFEE, 3, 0);
      if (ph > 1.9 && v.mat[lower] === M.COFFEE && v.mat[upper] === M.AIR) v.set(upper, M.COFFEE, 4, 0);
    } else if (c.rng.chance(c.dt * 3)) {
      puff(c, wx(s, a, 9), wy(s, a, 9), s.z0 + 9, M.STEAM, c.rng.int(20, 40));
    }
  },
};

// web: the phone nook. A short length of the café's panelled wall standing
// out on the floor, a black telephone with brass bells hung on it, a shelf
// with the phone book and a notepad, a stool, a tall plant, and a neon wifi
// sign on its top. Browsing takes the receiver off the hook and sets the
// sign's arcs pulsing; now and then the phone rings by itself.
// What stands before the panel keeps to its back end (low a) or out front
// at that end, so as seen the panel shows past it in either frame.
const NOOK = 12; // the panel's height (its cornice at the top)
const WIFI_AT = { a: 4, h: NOOK + 1 };
const ON_HOOK: ReadonlyArray<readonly [number, number, number]> = [[4, 2, 8], [4, 2, 9], [4, 2, 10]];
const OFF_HOOK: ReadonlyArray<readonly [number, number, number]> = [[3, 2, 5], [4, 2, 5], [5, 2, 5]];

function wifiArc(a: number, h: number): number {
  const dx = a - WIFI_AT.a;
  const dy = h - WIFI_AT.h;
  if (dy < 0 || Math.abs(dx) > dy + 0.5) return -1;
  const d = Math.hypot(dx, dy);
  if (d < 0.5) return 0;
  if (Math.abs(d - 2) < 0.55) return 1;
  if (Math.abs(d - 3.6) < 0.55) return 2;
  return -1;
}

const phoneCorner: Prop = {
  name: 'phone nook',
  build(v, s, rng) {
    // the panel: skirting, sage panelling, the chair rail, plaster, cornice
    const seed = rng.int(0, 0x3fffff);
    for (let a = 0; a < 9; a++) {
      for (let h = 0; h < NOOK + 1; h++) sput(v, s, a, 0, h, ...face(seed, s.wall, a, h, NOOK + 1));
    }
    sfill(v, s, 1, 1, 4, 6, 3, 5, M.WOOD, 5); // shelf
    for (const a of [1, 5]) sput(v, s, a, 1, 3, M.DIRT, 2);
    sfill(v, s, 1, 1, 5, 3, 3, 7, M.CARPET, 4); // the phone book
    sput(v, s, 3, 1, 5, M.PAPER, 7); // a notepad
    sput(v, s, 4, 1, 5, M.PAPER, 6);
    sfill(v, s, 5, 1, 7, 8, 2, 12, M.OBSIDIAN, 3); // the telephone
    sput(v, s, 6, 2, 9, M.METAL, 6); // dial
    sput(v, s, 5, 1, 12, M.GOLD_ORE, 6);
    sput(v, s, 7, 1, 12, M.GOLD_ORE, 6);
    for (const [a, b, h] of ON_HOOK) sput(v, s, a, b, h, M.OBSIDIAN, 4);
    sput(v, s, 4, 2, 7, M.DIRT, 1); // cord
    // the stool
    sfill(v, s, 2, 5, 3, 4, 7, 4, M.WOOD, 5);
    for (const a of [2, 3]) for (const b of [5, 6]) if ((a + b) & 1) sfill(v, s, a, b, 0, a + 1, b + 1, 3, M.DIRT, 3);
    // a snake plant
    sfill(v, s, 0, 5, 0, 2, 7, 3, M.BRICK, 4);
    for (const [a, b] of [[0, 5], [1, 6], [0, 6], [1, 5]] as const) {
      const tall = rng.int(5, 9);
      for (let h = 3; h < 3 + tall; h++) sput(v, s, a, b, h, h > 1 + tall ? M.MOSS : M.LEAF, (h + a) & 1 ? 3 : 6);
    }
    // the wifi sign, standing on the cornice
    for (let h = WIFI_AT.h; h < WIFI_AT.h + 5; h++) for (let a = 0; a < 9; a++) if (wifiArc(a, h) >= 0) sput(v, s, a, 0, h, M.NEON_CYAN, 7);
  },
  tick(c, s, active) {
    const v = c.v;
    // the sign: steady, or pulsing out arc by arc
    const step = Math.floor(c.t * 3) % 4;
    for (let h = WIFI_AT.h; h < WIFI_AT.h + 5; h++) {
      for (let a = 0; a < 9; a++) {
        const k = wifiArc(a, h);
        if (k < 0) continue;
        const was = sget(v, s, a, 0, h);
        if (was !== M.NEON_CYAN && was !== M.OBSIDIAN) continue;
        const on = !active || k <= step;
        sput(v, s, a, 0, h, on ? M.NEON_CYAN : M.OBSIDIAN, on ? 7 : 2);
      }
    }
    c.light({ x: wx(s, WIFI_AT.a, 2), y: wy(s, WIFI_AT.a, 2), z: s.z0 + WIFI_AT.h + 1.5, color: WIFI, radius: active ? 16 : 10, intensity: active ? 0.5 : 0.25 });
    // the receiver
    const [want, gone] = active ? [OFF_HOOK, ON_HOOK] : [ON_HOOK, OFF_HOOK];
    if (sget(v, s, 6, 1, 9) === M.OBSIDIAN) {
      for (const [a, b, h] of gone) if (sget(v, s, a, b, h) === M.OBSIDIAN) sput(v, s, a, b, h, M.AIR, 0);
      for (const [a, b, h] of want) if (sget(v, s, a, b, h) === M.AIR) sput(v, s, a, b, h, M.OBSIDIAN, 4);
    }
    // ring, ring
    const ringing = active ? (c.t % 2) < 0.3 : (c.t + 7) % 31 < 1.6 && (c.t % 0.8) < 0.5;
    if (ringing && c.rng.chance(c.dt * 12)) {
      const a = c.rng.chance(0.5) ? 5 : 7;
      c.spawn({ kind: 'glint', x: wx(s, a + 0.5, 2), y: wy(s, a + 0.5, 2), z: s.z0 + 13, vx: c.rng.range(-1.5, 1.5), vy: c.rng.range(-1.5, 1.5), vz: c.rng.range(0.5, 2), life: 0.5, color: hex('#ffe9a8'), glow: true, gravity: 0 });
    }
  },
};

// think: a booth. A high-backed banquette in oxblood leather with pillows
// at the ends, a walnut-framed glass screen along the top of its back, and
// before it a little marble table with a mug, the paper and a jar candle.
// Thinking steams the mug and turns the candle up.
const BOOTH = { back: 8, top: 14 }; // the leather back's top, the screen's rail

const booth: Prop = {
  name: 'booth',
  build(v, s) {
    sfill(v, s, 0, 0, 0, 12, 3, 3, M.WOOD, 3); // the bench
    for (let a = 0; a < 12; a += 3) sfill(v, s, a, 2, 0, a + 1, 3, 3, M.DIRT, 4);
    sfill(v, s, 0, 0, 3, 12, 3, 4, M.CLOTH, 5); // seat cushion
    for (let a = 0; a < 12; a++) for (let h = 4; h < BOOTH.back; h++) sput(v, s, a, 0, h, M.CLOTH, (a + h) % 3 === 0 ? 2 : 4); // tufted back
    for (const a of [0, 11]) sfill(v, s, a, 0, 4, a + 1, 3, 6, M.CLOTH, 3); // ends
    sfill(v, s, 1, 1, 4, 3, 2, 6, M.CARPET, 5); // pillows
    sfill(v, s, 9, 1, 4, 11, 2, 6, M.CONCRETE, 5);
    // the screen: walnut posts and rails, glass between, a brass rail on top
    sfill(v, s, 0, 0, BOOTH.back, 12, 1, BOOTH.back + 1, M.DIRT, 5);
    for (const a of [0, 4, 7, 11]) sfill(v, s, a, 0, BOOTH.back + 1, a + 1, 1, BOOTH.top, M.DIRT, 3);
    for (let a = 1; a < 11; a++) {
      if (a === 4 || a === 7) continue;
      for (let h = BOOTH.back + 1; h < BOOTH.top; h++) sput(v, s, a, 0, h, M.GLASS, 5);
    }
    sfill(v, s, 0, 0, BOOTH.top, 12, 1, BOOTH.top + 1, M.GOLD_ORE, 5);
    // the table: a walnut pedestal under a marble top
    sfill(v, s, 4, 4, 0, 8, 7, 1, M.DIRT, 2);
    sfill(v, s, 5, 5, 1, 7, 6, 4, M.DIRT, 3);
    sfill(v, s, 3, 4, 4, 9, 7, 5, M.CANDLE, 6);
    cup(v, wx(s, 4, 5), wy(s, 4, 5), s.z0 + 5);
    sfill(v, s, 6, 4, 5, 8, 6, 6, M.PAPER, 6); // the paper, folded
    sput(v, s, 7, 4, 5, M.ROCK_DARK, 4); // its photo
    sput(v, s, 8, 6, 5, M.GLASS, 5); // the jar candle
    sput(v, s, 8, 6, 6, M.LED_AMBER, 6);
  },
  tick(c, s, active) {
    const v = c.v;
    if (sget(v, s, 8, 6, 6) === M.LED_AMBER) sput(v, s, 8, 6, 6, M.LED_AMBER, active && c.rng.chance(0.7) ? 7 : 6);
    c.light({ x: wx(s, 8.5, 6.5), y: wy(s, 8.5, 6.5), z: s.z0 + 7, color: LAMPLIGHT, radius: active ? 14 : 9, intensity: (active ? 0.55 : 0.3) * flicker(c.t * 0.6, 4) });
    if (active && c.rng.chance(c.dt * 2)) puff(c, wx(s, 4, 5), wy(s, 4, 5), s.z0 + 7, M.STEAM, c.rng.int(25, 45));
  },
};

// idle: a terracotta sofa out on a rug, a black cat asleep on one cushion,
// a knitted throw, a low floor lamp and a coffee table. Low all round, so it
// hides nothing behind it. The cat always dozes; with company it flicks its
// tail.
const BLACK_CAT: ReadonlyArray<readonly [number, number, number]> = [
  [9, 2, 4], [10, 2, 4], [11, 2, 4], [9, 3, 4], [10, 3, 4], [11, 3, 4], // body
  [9, 2, 5], [10, 2, 5], [10, 3, 5], // back
  [12, 3, 4], [12, 3, 5], [12, 2, 5], // head
];
const TAIL_DOWN: readonly [number, number, number] = [8, 3, 4];
const TAIL_UP: readonly [number, number, number] = [8, 4, 5];

const sofa: Prop = {
  name: 'sofa',
  build(v, s) {
    sfill(v, s, 1, 0, 0, 14, 5, 3, M.CLOTH, 2);
    for (const a of [1, 13]) for (const b of [0, 4]) sput(v, s, a, b, 0, M.DIRT, 2);
    for (let a = 3; a < 12; a++) sfill(v, s, a, 1, 3, a + 1, 5, 4, M.CLOTH, (a - 3) % 3 === 2 ? 3 : 5);
    sfill(v, s, 1, 0, 3, 14, 1, 8, M.CLOTH, 3);
    for (let a = 2; a < 13; a++) sput(v, s, a, 1, 4, M.CLOTH, 4); // back cushions
    for (let a = 2; a < 13; a++) sput(v, s, a, 1, 5, M.CLOTH, 4);
    for (const a of [1, 2, 12, 13]) sfill(v, s, a, 1, 3, a + 1, 5, 6, M.CLOTH, a === 1 || a === 13 ? 5 : 4);
    sfill(v, s, 1, 0, 6, 3, 5, 7, M.CANDLE, 6); // a throw over the arm
    sput(v, s, 3, 2, 4, M.CARPET, 6); // a cushion
    sput(v, s, 3, 1, 6, M.CARPET, 5);
    for (const [a, b, h] of BLACK_CAT) sput(v, s, a, b, h, M.OBSIDIAN, 3);
    for (const [a, b, h] of [[12, 2, 6], [12, 3, 6]] as const) sput(v, s, a, b, h, M.OBSIDIAN, 2); // ears
    sput(v, s, 12, 2, 4, M.CANDLE, 7); // white bib
    sput(v, s, ...TAIL_DOWN, M.OBSIDIAN, 2);
    // the rug, in the floorboards
    for (let a = 2; a < 13; a++) {
      for (let b = 5; b < 11; b++) {
        const edge = a === 2 || a === 12 || b === 5 || b === 10;
        sput(v, s, a, b, -1, edge ? M.CLOTH : (a + b) % 4 === 0 ? M.CANDLE : M.CARPET, edge ? 3 : 4);
      }
    }
    // coffee table, a mug and books on it
    sfill(v, s, 4, 7, 3, 11, 10, 4, M.WOOD, 5);
    for (const a of [4, 10]) for (const b of [7, 9]) sfill(v, s, a, b, 0, a + 1, b + 1, 3, M.DIRT, 2);
    cup(v, wx(s, 6, 8), wy(s, 6, 8), s.z0 + 4);
    sfill(v, s, 8, 8, 4, 10, 9, 5, M.CONCRETE, 4);
    sfill(v, s, 8, 8, 5, 10, 9, 6, M.CLOTH, 5);
    // the floor lamp
    sput(v, s, 0, 1, 0, M.METAL, 2);
    for (let h = 1; h < 9; h++) sput(v, s, 0, 1, h, M.GOLD_ORE, 4);
    sfill(v, s, 0, 0, 9, 1, 3, 10, M.LAMP, 6);
    sfill(v, s, 0, 0, 10, 1, 3, 11, M.CANDLE, 5);
  },
  tick(c, s, active) {
    const v = c.v;
    c.light({ x: wx(s, 0.5, 1.5), y: wy(s, 0.5, 1.5), z: s.z0 + 8.5, color: LAMPLIGHT, radius: 16, intensity: 0.55 });
    // breathing
    const breath = Math.sin(c.t * 2.2) > 0;
    if (sget(v, s, 10, 2, 5) === M.OBSIDIAN) sput(v, s, 10, 2, 5, M.OBSIDIAN, breath ? 5 : 3);
    // the tail
    const up = active && Math.floor(c.t * 1.6) % 3 === 0;
    const [on, off] = up ? [TAIL_UP, TAIL_DOWN] : [TAIL_DOWN, TAIL_UP];
    if (sget(v, s, ...off) === M.OBSIDIAN) sput(v, s, ...off, M.AIR, 0);
    if (sget(v, s, ...on) === M.AIR) sput(v, s, ...on, M.OBSIDIAN, 2);
    if (c.rng.chance(c.dt * (active ? 0.9 : 0.5))) {
      c.spawn({ kind: 'zzz', x: wx(s, 12.5, 2.5), y: wy(s, 12.5, 2.5), z: s.z0 + 7, vx: c.rng.range(-0.3, 0.3), vy: c.rng.range(-0.3, 0.3), vz: 1.2, life: 2, color: SLEEP, glow: false, gravity: 0 });
    }
  },
};

// entrance: the front door, green with glass in its top half and a transom
// over it, set back in a walnut frame with the rainy street beyond. A warm
// lantern beside it, an umbrella stand, a scarf on a hook, a doormat and a
// little neon cup. The door swings open while someone comes or goes, and
// the bell over it rings.
const DOOR = { a0: 3, a1: 10, top: 15 }; // the doorway [a0, a1) x [0, top)

function doorShade(a: number, h: number): [number, number] {
  const glass = h >= 8 && h < 13 && a > DOOR.a0 && a < DOOR.a1 - 1 && a !== 6;
  if (glass) return [M.GLASS, 5];
  const rim = a === DOOR.a0 || a === DOOR.a1 - 1 || h === 0 || h === 7 || h === 13 || h === DOOR.top - 1;
  return [M.PLASTIC, rim ? 6 : (h > 1 && h < 6 && a > DOOR.a0 + 1 && a < DOOR.a1 - 2) ? 2 : 4];
}

const frontDoor: Prop = {
  name: 'front door',
  build(v, s, rng) {
    const F = frameOf(s);
    const deep = -(wallOf(s) - 2);
    // the street outside
    for (let a = DOOR.a0 - 1; a <= DOOR.a1; a++) {
      for (let h = 0; h < DOOR.top + 5; h++) {
        for (let b = deep; b <= -3; b++) {
          let m: number = M.TILE;
          let sh = clamp(6 - Math.floor(h / 4), 1, 6);
          if (h < 2) [m, sh] = [M.ROCK_DARK, 3];
          else if (b === deep && h < 9 && ((a + 13) >> 2) & 1) [m, sh] = [M.ROCK_DARK, 2];
          else if (b === deep && a === DOOR.a0 + 1 && h < 12) [m, sh] = [M.METAL, 1]; // a lamp post
          else if (b === deep && a === DOOR.a0 + 1 && h === 12) [m, sh] = [M.LAMP, 7];
          else if (b > deep) [m, sh] = [M.AIR, 0];
          wput(v, F, s.wall, along(s) + a, b, h, m, sh);
        }
      }
    }
    // frame, doorway and door
    for (let h = 0; h < DOOR.top + 5; h++) {
      for (let a = DOOR.a0 - 1; a <= DOOR.a1; a++) {
        const opening = a >= DOOR.a0 && a < DOOR.a1 && h < DOOR.top;
        if (!opening) {
          sput(v, s, a, -1, h, M.DIRT, h === DOOR.top + 4 ? 5 : 3);
          sput(v, s, a, -2, h, M.DIRT, 2);
          continue;
        }
        sput(v, s, a, -1, h, M.AIR, 0);
        sput(v, s, a, -2, h, ...doorShade(a, h));
      }
    }
    sput(v, s, DOOR.a1 - 2, -1, 7, M.GOLD_ORE, 7); // handle
    sput(v, s, 6, 0, DOOR.top, M.GOLD_ORE, 6); // the bell
    glaze(v, F, { wall: s.wall, a0: along(s) + DOOR.a0, a1: along(s) + DOOR.a1, h0: DOOR.top + 2, h1: DOOR.top + 5 }, rng.int(0, 0x3fffff));
    // doormat
    for (let a = DOOR.a0; a < DOOR.a1; a++) for (let b = 0; b < 3; b++) sput(v, s, a, b, -1, b === 1 && a > DOOR.a0 && a < DOOR.a1 - 1 ? M.CARPET : M.DIRT, 2);
    // the lantern
    sput(v, s, 11, 0, 11, M.METAL, 3);
    sput(v, s, 11, 1, 10, M.METAL, 2);
    sput(v, s, 11, 1, 11, M.LAMP, 7);
    sput(v, s, 11, 1, 12, M.METAL, 4);
    // umbrella stand and a scarf on a hook
    for (let a = 12; a < 14; a++) for (let b = 1; b < 3; b++) sfill(v, s, a, b, 0, a + 1, b + 1, 3, M.METAL, 2);
    for (let h = 3; h < 7; h++) sput(v, s, 12, 1, h, M.CLOTH, 4);
    for (let h = 3; h < 6; h++) sput(v, s, 13, 2, h, M.TILE, 3);
    sput(v, s, 12, 1, 7, M.DIRT, 2);
    sput(v, s, 13, 0, 14, M.GOLD_ORE, 6);
    for (let h = 9; h < 14; h++) sput(v, s, 13, 0, h, M.CARPET, h & 1 ? 3 : 5);
    // a little neon cup over the lantern
    for (const [a, h] of [[11, 16], [12, 16], [13, 16], [11, 17], [13, 17], [11, 18], [12, 18], [13, 18], [14, 17], [12, 19], [12, 20]] as const) sput(v, s, a, 0, h, h > 18 ? M.NEON_CYAN : M.NEON_PINK, 7);
  },
  tick(c, s, active) {
    const v = c.v;
    c.light({ x: wx(s, 11.5, 1.5), y: wy(s, 11.5, 1.5), z: s.z0 + 11.5, color: LAMPLIGHT, radius: 18, intensity: 0.6 * flicker(c.t * 0.3, 2) });
    // the door: shut in its frame, or swung into the room on its hinge
    for (let h = 0; h < DOOR.top; h++) {
      for (let a = DOOR.a0; a < DOOR.a1; a++) {
        const [m, sh] = doorShade(a, h);
        const shut = sget(v, s, a, -2, h);
        if (active ? shut === m : shut === M.AIR) sput(v, s, a, -2, h, active ? M.AIR : m, active ? 0 : sh);
      }
      for (let b = -1; b < DOOR.a1 - DOOR.a0 - 2; b++) {
        const [m, sh] = doorShade(DOOR.a1 - 1 - (b + 2), h);
        const open = sget(v, s, DOOR.a0, b, h);
        if (active ? open === M.AIR : open === m) sput(v, s, DOOR.a0, b, h, active ? m : M.AIR, active ? sh : 0);
      }
    }
    if (!active) return;
    // rain in the open doorway, cool air, and the bell
    if (c.rng.chance(c.dt * 10)) {
      c.spawn({ kind: 'drop', x: wx(s, c.rng.range(DOOR.a0 + 1, DOOR.a1), -2.5), y: wy(s, c.rng.range(DOOR.a0 + 1, DOOR.a1), -2.5), z: s.z0 + DOOR.top - 0.5, vx: 0, vy: 0, vz: -6, life: 2, color: RAIN, glow: false, gravity: 20 });
    }
    if (c.t % 3 < 0.6 && c.rng.chance(c.dt * 10)) {
      c.spawn({ kind: 'glint', x: wx(s, 6.5, 1), y: wy(s, 6.5, 1), z: s.z0 + DOOR.top + 0.5, vx: c.rng.range(-1.5, 1.5), vy: c.rng.range(-1.5, 1.5), vz: c.rng.range(0, 1.5), life: 0.5, color: hex('#ffe9a8'), glow: true, gravity: 0 });
    }
  },
};

const PROPS: Record<SlotKind, Prop> = {
  write: laptopTable,
  read: readingNook,
  search: newsRack,
  run: espressoBar,
  web: phoneCorner,
  think: booth,
  idle: sofa,
  entrance: frontDoor,
};

// ── plan ─────────────────────────────────────────────────────────────────
// Where everything off the props goes, from the layout alone, so pois()
// agrees with generate(): the hearth in the back corner, windows and plants
// in the wall gaps, the cat by the fire, and out front the pastry counter,
// lounges, a piano, long tables and rows of two-seat tables on rugs, with
// open floor between. Nothing lands on a cell keepClear() reserves (props,
// spots, paths, the hub, the plazas).
type Hearth = { a0: number; fw: number; p: number; fh: number };
type Spot = { x: number; y: number };
type Axis = 'x' | 'y';
type Zone =
  | { kind: 'island' | 'reading' | 'piano' | 'long' | 'lamp'; x: number; y: number }
  | { kind: 'lounge'; x: number; y: number; rx: number; ry: number }
  | { kind: 'row'; x: number; y: number; axis: Axis; k: number; n: number; hedge: boolean }
  | { kind: 'bench'; x: number; y: number; axis: Axis }
  | { kind: 'planter'; x: number; y: number; len: number; axis: Axis };
type Plan = {
  hearth: Hearth;
  warm: Spot;
  panes: Pane[];
  plants: Array<{ x: number; y: number; tall: number }>;
  logs: Spot | null;
  zones: Zone[];
  cat: Spot | null;
  pois: Poi[];
};

const PLANS = new WeakMap<Layout, Plan>();

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W, D, H, T, floor } = L;
  const R = H - floor;
  const busy = keepClear(L);
  const keep = Uint8Array.from(busy);
  const free = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) if (x < T || y < T || x >= W - 1 || y >= D - 1 || busy[x + W * y]) return false;
    }
    return true;
  };
  let dirty = true;
  const mark = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = Math.max(0, y0); y < Math.min(D, y1); y++) for (let x = Math.max(0, x0); x < Math.min(W, x1); x++) busy[x + W * y] = 1;
    dirty = true;
  };
  // The nearest free cell to (x, y) within r, or null.
  const near = (x: number, y: number, r: number, ok: (x: number, y: number) => boolean = () => true): Spot | null => {
    let best: Spot | null = null;
    let bd = Infinity;
    for (let yy = Math.round(y) - r; yy <= Math.round(y) + r; yy++) {
      for (let xx = Math.round(x) - r; xx <= Math.round(x) + r; xx++) {
        const d = Math.hypot(xx - x, yy - y);
        if (d < bd && d <= r && free(xx, yy, xx + 1, yy + 1) && ok(xx, yy)) {
          bd = d;
          best = { x: xx, y: yy };
        }
      }
    }
    return best;
  };
  const slot = (k: SlotKind) => L.slots.find((s) => s.kind === k);
  // Open floor round the props out in the room, so the tables keep back.
  for (const s of L.slots) {
    if (!s.island) continue;
    const r = slotRect(s);
    mark(r.x0 - 4, r.y0 - 4, r.x1 + 4, r.y1 + 4);
  }

  // The hearth: on the left wall, from the back corner along as far as the
  // floor before it is free (it and its hearthstones), up to 13 wide.
  const p = W >= 100 ? 5 : 4;
  let fw = 0;
  while (fw < 14 && free(T, T + fw, T + p + 2, T + fw + 1)) fw++;
  fw = clamp(fw - 1, 6, 13);
  const hearth: Hearth = { a0: T, fw, p, fh: R >= 40 ? 10 : 7 };
  mark(T, T, T + p + 2, T + fw);
  const warm = near(T + p + 3, T + fw / 2, 5, (x) => x >= T + p + 2) ?? { x: T + p + 2, y: T + (fw >> 1) };
  mark(warm.x - 1, warm.y - 1, warm.x + 2, warm.y + 2);
  const logs = free(T, T + fw, T + 3, T + fw + 3) ? { x: T, y: T + fw } : null;
  if (logs) mark(logs.x, logs.y, logs.x + 3, logs.y + 3);
  // Nothing tall between the fire and the viewer.
  const fireCol = p / 2 - fw / 2; // the firebox's screen column, x - y
  for (let y = T; y < Math.min(D, T + fw + 14); y++) {
    for (let x = T; x < Math.min(W, T + p + 16); x++) if (Math.abs(x - y - fireCol) < 9) busy[x + W * y] = 1;
  }

  // The ginger cat on its cushion, as near the fire as there is room
  // without sitting in front of it.
  let cat: Spot | null = null;
  let cd = Infinity;
  for (let y = T; y < D - 6; y++) {
    for (let x = T; x < W - 7; x++) {
      const d = Math.hypot(x + 3 - warm.x, y + 2 - warm.y) + (Math.abs(x - y + 1 - fireCol) < 9 ? 25 : 0);
      if (d >= cd || !free(x - 1, y - 1, x + 7, y + 6)) continue;
      cd = d;
      cat = { x, y };
    }
  }
  if (cat) mark(cat.x - 1, cat.y - 1, cat.x + 7, cat.y + 6);

  // Windows in the gaps along the walls (tall ones with a plant each side
  // where there is room), a plant in the narrow gaps.
  const panes: Pane[] = [];
  const plants: Array<{ x: number; y: number; tall: number }> = [];
  const potAt = (wall: Side, a: number, tall: number) => {
    const [x, y] = at(L, wall, a - 1, 0);
    if (!free(x, y, x + 3, y + 3)) return;
    plants.push({ x, y, tall });
    mark(x - 1, y - 1, x + 4, y + 4); // and the leaves over it
  };
  const top = Math.min(R - 8, SILL + 26);
  for (const wall of SIDES) {
    const end = wall === 'left' ? D : W;
    for (const [g0, g1] of wallGaps(L, wall)) {
      let u0 = g0 + 1;
      let u1 = g1 - 1;
      if (g0 === T) u0 = wall === 'left' ? T + fw + (logs ? 4 : 1) : T + p + 2;
      if (g1 === end) u1 = end - 2;
      const w = u1 - u0;
      if (w >= 5 && top - SILL >= 8) {
        const ww = w >= 11 ? Math.min(15, w - 6) : w - 2;
        const a0 = u0 + ((w - ww) >> 1);
        panes.push({ wall, a0, a1: a0 + ww, h0: SILL, h1: top });
        if (w >= 11) {
          potAt(wall, u0 + 1, 9 + (a0 % 4));
          potAt(wall, u1 - 2, 10 - (a0 % 3));
        }
      } else if (w >= 3) {
        potAt(wall, u0 + (w >> 1), 7 + (u0 % 4));
      }
    }
  }

  // Out on the open floor, in zones: the pastry island out front, a big
  // rug-and-sofa centrepiece, reading corners, the piano and long tables,
  // lounges, rows of two-seat tables on shared rugs, then a few small groups
  // in the widest stretches left and a bench in any corner still bare. A
  // summed-area table of `busy` answers "is this rectangle free" at once.
  const W1 = W + 1;
  const sat = new Int32Array(W1 * (D + 1));
  const rebuild = () => {
    for (let y = 0; y < D; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) {
        row += busy[x + W * y];
        sat[x + 1 + W1 * (y + 1)] = sat[x + 1 + W1 * y] + row;
      }
    }
    dirty = false;
  };
  // Free and on the floor, [x0, x1] x [y0, y1] inclusive.
  const clearRect = (x0: number, y0: number, x1: number, y1: number): boolean => {
    if (x0 < T || y0 < T || x1 > W - 3 || y1 > D - 3) return false;
    if (dirty) rebuild();
    return sat[x1 + 1 + W1 * (y1 + 1)] - sat[x0 + W1 * (y1 + 1)] - sat[x1 + 1 + W1 * y0] + sat[x0 + W1 * y0] === 0;
  };
  const cover = new Uint8Array(W * D);
  for (const s of L.slots) {
    const r = slotRect(s);
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) cover[x + W * y] = 1;
  }
  for (const pl of plants) for (let y = pl.y; y < pl.y + 3; y++) for (let x = pl.x; x < pl.x + 3; x++) cover[x + W * y] = 1;
  const zones: Zone[] = [];
  const centres: Spot[] = [];
  const claim = (x: number, y: number, hx: number, hy: number) => {
    mark(x - hx, y - hy, x + hx + 1, y + hy + 1);
    for (let yy = y - hy; yy <= y + hy; yy++) for (let xx = x - hx; xx <= x + hx; xx++) cover[xx + W * yy] = 1;
    centres.push({ x, y });
  };
  // The best spot by `score` for a zone of half-size hx x hy with `gap`
  // voxels of floor kept round it.
  const place = (hx: number, hy: number, gap: number, score: (x: number, y: number) => number): Spot | null => {
    let best: Spot | null = null;
    let bs = -Infinity;
    for (let y = T + hy + gap; y < D - hy - gap - 2; y += 2) {
      for (let x = T + hx + gap; x < W - hx - gap - 2; x += 2) {
        if (!clearRect(x - hx - gap, y - hy - gap, x + hx + gap, y + hy + gap)) continue;
        const sc = score(x, y) + hash3(0xcafe, x, y, 3) * 0.5;
        if (sc > bs) {
          bs = sc;
          best = { x, y };
        }
      }
    }
    if (best) claim(best.x, best.y, hx, hy);
    return best;
  };
  const spread = (x: number, y: number) => {
    let m = 80;
    for (const c of centres) m = Math.min(m, Math.hypot(c.x - x, c.y - y));
    return m;
  };
  const toward = (fx: number, fy: number) => {
    const tx = T + (W - T) * fx;
    const ty = T + (D - T) * fy;
    return (x: number, y: number) => -Math.hypot(x - tx, y - ty);
  };
  // spread out, leaning to the front of the room
  const fore = (x: number, y: number) => spread(x, y) + 0.12 * (x + y - W - D + 2 * T);
  // Things out on the floor run parallel to the nearer wall: along x on the
  // right wall's side of the diagonal, along y on the left's.
  const wallward = (x: number, y: number): Axis => (x - T >= y - T ? 'x' : 'y');
  let A = 0;
  for (let y = T; y < D - 2; y++) for (let x = T; x < W - 2; x++) if (!busy[x + W * y]) A++;

  const zp: Poi[] = [];
  const isle = place(7, 4, 2, toward(0.72, 0.72));
  if (isle) {
    zones.push({ kind: 'island', x: isle.x, y: isle.y });
    for (const dx of [-4, -1, 2, 5]) zp.push({ x: isle.x + dx, y: isle.y + 4, kind: 'drink', face: { x: isle.x + dx, y: isle.y } });
  }
  const addLounge = (rx: number, score: (x: number, y: number) => number) => {
    for (; rx >= 6; rx--) {
      const at0 = place(rx, rx - 1, 2, score);
      if (!at0) continue;
      const ry = rx - 1;
      zones.push({ kind: 'lounge', x: at0.x, y: at0.y, rx, ry });
      const { x, y } = at0;
      const mid = rx >= 10 ? { x, y } : { x, y: y - ry + 6 };
      for (const dx of [-2, 2]) zp.push({ x: x + dx, y: y - ry + 4, kind: 'seat', face: mid });
      if (rx >= 10) for (const dx of [-2, 2]) zp.push({ x: x + dx, y: y + ry - 4, kind: 'seat', face: mid });
      zp.push({ x: x + rx - 4, y, kind: 'seat', face: mid });
      zp.push({ x: x - rx + 3, y, kind: 'seat', face: mid });
      return;
    }
  };
  addLounge(clamp(Math.round(Math.sqrt(A) / 16), 6, 11), toward(0.5, 0.5));
  const read = slot('read');
  for (let n = A > 20000 ? 2 : A > 3000 ? 1 : 0; n > 0; n--) {
    const near0 = read ? { x: read.spot.x + 10, y: read.spot.y } : { x: T + 20, y: T + 20 };
    const r = place(7, 7, 2, (x, y) => (n > 1 ? -Math.hypot(x - near0.x, y - near0.y) : fore(x, y)));
    if (!r) break;
    zones.push({ kind: 'reading', x: r.x, y: r.y });
    zp.push({ x: r.x - 2, y: r.y, kind: 'seat', face: { x: r.x - 2, y: r.y + 4 } });
    zp.push({ x: r.x + 3, y: r.y, kind: 'seat', face: { x: r.x + 3, y: r.y + 4 } });
  }
  if (A > 6000) {
    const pn = place(5, 6, 2, fore);
    if (pn) {
      zones.push({ kind: 'piano', x: pn.x, y: pn.y });
      zp.push({ x: pn.x, y: pn.y + 5, kind: 'seat', face: pn });
      zp.push({ x: pn.x + 3, y: pn.y + 6, kind: 'dance', face: pn });
    }
  }
  for (let n = A > 25000 ? 2 : A > 7000 ? 1 : 0; n > 0; n--) {
    const lt = place(6, 5, 2, fore);
    if (!lt) break;
    zones.push({ kind: 'long', x: lt.x, y: lt.y });
    for (const dx of [-4, 2]) zp.push({ x: lt.x + dx, y: lt.y + 4, kind: 'seat', face: { x: lt.x + dx, y: lt.y } });
  }
  for (let n = Math.floor(A / 15000); n > 0; n--) addLounge(clamp(Math.round(W * 0.04), 6, 9), fore);
  // Rows of two or three two-seat tables on a shared rug, a hedge along
  // the back of most. `rowSeats` adds the points of interest of one at
  // (x, y).
  let k = 0;
  const rowSeats = (x: number, y: number, axis: Axis, n: number) => {
    const ds = n === 3 ? [-8, 0, 8] : [-4, 4];
    const at0 = (d: number, e: number): Spot => (axis === 'x' ? { x: x + d, y: y + e } : { x: x + e, y: y + d });
    for (const d of ds) for (const e of [-3, 3]) zp.push({ ...at0(d, e), kind: 'seat', face: at0(d, 0) });
    zp.push({ ...at0(n === 3 ? -4 : 0, 3), kind: 'drink', face: { x, y } });
  };
  // Half-sizes along x and y of a row of n along `axis`, with a hedge or not.
  const rowSize = (axis: Axis, n: number, hedge: boolean): [number, number] => {
    const along0 = n === 3 ? 11 : 7;
    const across = hedge ? 8 : 6;
    return axis === 'x' ? [along0, across] : [across, along0];
  };
  for (let n = clamp(Math.round(A / 6000), 1, 7); n > 0; n--, k++) {
    // across x or y by turns, each on the side of the room it runs with
    const axis = k & 1 ? 'y' : 'x';
    const len = k % 3 === 2 ? 2 : 3;
    const score = (x: number, y: number) => fore(x, y) - (wallward(x, y) === axis ? 0 : 40);
    let hedge = true;
    let t = place(...rowSize(axis, len, true), 3, score);
    if (!t) {
      hedge = false;
      t = place(...rowSize(axis, len, false), 2, score);
    }
    if (!t) continue;
    zones.push({ kind: 'row', x: t.x, y: t.y, axis, k, n: len, hedge });
    rowSeats(t.x, t.y, axis, len);
  }
  // Then the bare stretches, the widest first, each get one group (two
  // tables on a rug, a bench backed onto a hedge, a bench by a potted plant
  // and now and then a floor lamp) until none is OPEN voxels clear of
  // everything all round: the floor between the zones stays open, to walk
  // and to see the crew on. `far` is each cell's distance to the nearest
  // claimed floor.
  const OPEN = clamp(Math.round(W / 18), 9, 14);
  const PATHS = clamp(Math.round(15000 / W), 60, 130);
  const far = new Float32Array(W * D).fill(1e6);
  for (let i = 0; i < W * D; i++) if (cover[i]) far[i] = 0;
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
  const nearer = (x: number, y: number, hx: number, hy: number) => {
    const r = 3 * OPEN;
    for (let yy = Math.max(0, y - hy - r); yy <= Math.min(D - 1, y + hy + r); yy++) {
      for (let xx = Math.max(0, x - hx - r); xx <= Math.min(W - 1, x + hx + r); xx++) {
        const d = Math.hypot(Math.max(0, Math.abs(xx - x) - hx), Math.max(0, Math.abs(yy - y) - hy));
        if (d < far[xx + W * yy]) far[xx + W * yy] = d;
      }
    }
  };
  // Each group: its half-size along x and y, and what it adds at (x, y).
  type Group = { hx: number; hy: number; add: (x: number, y: number) => void };
  const groups = (axis: Axis, lamp: boolean): Group[] => {
    const xy = (x: number, y: number, a: number, q: number): Spot => (axis === 'x' ? { x: x + a, y: y + q } : { x: x + q, y: y + a });
    const span = (a: number, q: number) => (axis === 'x' ? [a, q] : [q, a]);
    const duo = (hedge: boolean): Group => {
      const [hx, hy] = rowSize(axis, 2, hedge);
      return {
        hx,
        hy,
        add: (x, y) => {
          zones.push({ kind: 'row', x, y, axis, k: k++, n: 2, hedge });
          rowSeats(x, y, axis, 2);
        },
      };
    };
    return [
      duo(true),
      duo(false),
      {
        // a bench backed onto a hedge
        hx: span(7, 4)[0],
        hy: span(7, 4)[1],
        add: (x, y) => {
          zones.push({ kind: 'planter', ...xy(x, y, 0, -2), len: 13, axis });
          zones.push({ kind: 'bench', ...xy(x, y, 0, 1), axis });
          zp.push({ ...xy(x, y, 0, 2), kind: 'seat', face: xy(x, y, 0, 7) });
        },
      },
      {
        // a bench with a floor lamp at one end, or a potted plant
        hx: span(8, 3)[0],
        hy: span(8, 3)[1],
        add: (x, y) => {
          zones.push({ kind: 'bench', x, y, axis });
          if (lamp) zones.push({ kind: 'lamp', ...xy(x, y, -4, -1) });
          else {
            const pot = xy(x, y, 4, -1);
            plants.push({ x: pot.x, y: pot.y, tall: 7 + ((x + y) % 4) });
          }
          zp.push({ ...xy(x, y, 0, 1), kind: 'seat', face: xy(x, y, 0, 6) });
        },
      },
    ];
  };
  let lamps = Math.max(1, Math.round(A / 8000));
  const dead = new Uint8Array(W * D);
  for (let tries = 0; tries < 400; tries++) {
    const cand: Array<{ i: number; s: number }> = [];
    for (let y = T + 4; y < D - 6; y += 2) {
      for (let x = T + 4; x < W - 6; x += 2) {
        const i = x + W * y;
        if (far[i] >= OPEN && !dead[i]) cand.push({ i, s: far[i] + 0.04 * (x + y - W - D) + 2 * hash3(0xcafe, x, y, 6) });
      }
    }
    if (!cand.length) break;
    cand.sort((a, b) => b.s - a.s);
    let done = false;
    for (const { i } of cand) {
      const x = i % W;
      const y = (i - x) / W;
      const h = hash3(0xcafe, x, y, 10);
      const lit = lamps > 0 && hash3(0xcafe, x, y, 11) < 0.5;
      const [duoH, duo, hedged, nook] = groups(wallward(x, y), lit);
      for (const g of h < 0.25 ? [duoH, duo, hedged, nook] : h < 0.65 ? [hedged, nook] : [nook, hedged]) {
        if (!clearRect(x - g.hx - 1, y - g.hy - 1, x + g.hx + 1, y + g.hy + 1)) continue;
        claim(x, y, g.hx, g.hy);
        nearer(x, y, g.hx, g.hy);
        g.add(x, y);
        if (g === nook && lit) lamps--;
        done = true;
        break;
      }
      if (done) break;
      dead[i] = 1;
    }
    if (!done) break;
  }
  // Last, in any 16 x 16 stretch still bare off the walkways, a bench (or
  // where one won't go, a potted plant) drawn up to whatever is nearest, so
  // no corner reads as left over.
  const nearest = (tx: number, ty: number, hx: number, hy: number): Spot | null => {
    let best: Spot | null = null;
    let bd = Infinity;
    for (let y = ty + 1; y < ty + 15; y++) {
      for (let x = tx + 1; x < tx + 15; x++) {
        const d = far[x + W * y] + 0.1 * Math.hypot(x - tx - 7.5, y - ty - 7.5);
        if (d < bd && clearRect(x - hx - 1, y - hy - 1, x + hx + 1, y + hy + 1)) {
          bd = d;
          best = { x, y };
        }
      }
    }
    return best;
  };
  for (let ty = T; ty + 8 < D - 2; ty += 16) {
    for (let tx = T; tx + 8 < W - 2; tx += 16) {
      let c = 0;
      let paths = 0;
      for (let y = ty; y < Math.min(D, ty + 16); y++) {
        for (let x = tx; x < Math.min(W, tx + 16); x++) {
          c += cover[x + W * y];
          paths += keep[x + W * y];
        }
      }
      if (c >= 24 || paths > PATHS) continue;
      const axes: readonly Axis[] = wallward(tx + 8, ty + 8) === 'x' ? ['x', 'y'] : ['y', 'x'];
      let done = false;
      for (const axis of axes) {
        const t = axis === 'x' ? nearest(tx, ty, 3, 1) : nearest(tx, ty, 1, 3);
        if (!t) continue;
        claim(t.x, t.y, axis === 'x' ? 3 : 1, axis === 'x' ? 1 : 3);
        nearer(t.x, t.y, axis === 'x' ? 3 : 1, axis === 'x' ? 1 : 3);
        zones.push({ kind: 'bench', x: t.x, y: t.y, axis });
        zp.push(axis === 'x' ? { x: t.x, y: t.y + 1, kind: 'seat', face: { x: t.x, y: t.y + 6 } } : { x: t.x + 1, y: t.y, kind: 'seat', face: { x: t.x + 6, y: t.y } });
        done = true;
        break;
      }
      const t = done ? null : nearest(tx, ty, 2, 2);
      if (!t) continue;
      claim(t.x, t.y, 2, 2);
      nearer(t.x, t.y, 2, 2);
      plants.push({ x: t.x - 1, y: t.y - 1, tall: 6 + ((t.x + t.y) % 4) });
    }
  }

  // Points of interest, all on open floor.
  const pois: Poi[] = [{ x: warm.x, y: warm.y, kind: 'warm', face: { x: T + 1, y: T + fw / 2 } }, ...zp];
  const bar = slot('run');
  let drink: Spot | null = null;
  if (bar) {
    // at an end of the front counter, round the side of the bar
    const ends = [[-3, bar.dep - 3], [bar.len + 2, bar.dep - 3]] as const;
    for (const [a, b] of ends) drink ??= near(wx(bar, a, b), wy(bar, a, b), 4);
    if (drink) pois.push({ ...drink, kind: 'drink', face: { x: wx(bar, 4, 8), y: wy(bar, 4, 8) } });
  }
  if (!drink && !pois.some((q) => q.kind === 'drink')) {
    const t = zones.find((z) => z.kind === 'row');
    if (t) pois.push({ x: t.x, y: t.y + 3, kind: 'drink', face: { x: t.x, y: t.y } });
  }
  const views = [...panes].sort((a, b) => b.a1 - b.a0 - (a.a1 - a.a0));
  let view: Spot | null = null;
  let looking: Spot | null = null;
  for (const pn of views) {
    const mid = (pn.a0 + pn.a1) / 2;
    const [x, y] = at(L, pn.wall, Math.round(mid), 3);
    view = near(x, y, 2);
    if (view) {
      looking = { x: at(L, pn.wall, mid, -2)[0], y: at(L, pn.wall, mid, -2)[1] };
      break;
    }
  }
  if (view && looking) pois.push({ ...view, kind: 'view', face: looking });
  if (cat) pois.push({ x: cat.x + 3, y: cat.y + 5, kind: 'pet', face: { x: cat.x + 3, y: cat.y + 2 } });

  // Keep everything off cells keepClear reserves.
  const out = pois.filter((q) => q.x >= T && q.y >= T && q.x < W && q.y < D && !keep[q.x + W * q.y]);
  const res: Plan = { hearth, warm, panes, plants, logs, zones, cat, pois: out };
  PLANS.set(L, res);
  return res;
}

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  clear(v);
  const P = plan(L);
  const seed = rng.int(0, 0x3fffffff);
  const fx: Fixtures = { windows: [], bulbs: [], cups: [], flames: [], fire: null, clock: null, cat: null, lamps: [], candles: [], piano: null, flash: false };
  FIXTURES.set(v, fx);
  shell(v, L, seed);
  hearth(v, L, P.hearth, seed, fx);
  for (const p of P.panes) glaze(v, L, p, seed);
  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);
  wallDecor(v, L, fx);
  if (P.logs) firewood(v, L, P.logs);
  let tables = 0;
  for (const zn of P.zones) {
    switch (zn.kind) {
      case 'island':
        pastryCounter(v, L, zn, fx);
        break;
      case 'lounge':
        lounge(v, L, zn, rng, fx);
        break;
      case 'reading':
        readingCorner(v, L, zn, rng, fx);
        break;
      case 'piano':
        piano(v, L, zn, fx);
        break;
      case 'long':
        longTable(v, L, zn, rng, fx);
        break;
      case 'row':
        tableRow(v, L, zn, zn.axis, zn.k, zn.n, tables, rng);
        tables += zn.n;
        if (zn.hedge) planter(v, L, zn.axis === 'x' ? { x: zn.x, y: zn.y - 8 } : { x: zn.x - 8, y: zn.y }, zn.n === 3 ? 19 : 13, zn.axis, rng);
        break;
      case 'bench':
        bench(v, L, zn, zn.axis, rng);
        break;
      case 'planter':
        planter(v, L, zn, zn.len, zn.axis, rng);
        break;
      case 'lamp':
        floorLamp(v, L, zn);
        break;
    }
  }
  for (const pl of P.plants) plant(v, pl.x, pl.y, L.floor, pl.tall, rng);
  if (P.cat) fx.cat = kitty(v, L, P.cat);
  stringLights(v, L, seed, fx);
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// The building: brick walls (the inner faces finished), a brick footing
// under walnut joists under the oak floor.
function shell(v: Voxels, L: Layout, seed: number): void {
  const { W, D, H, T, floor } = L;
  const R = H - floor;
  for (let z = 0; z < floor; z++) {
    for (let y = T; y < D; y++) {
      for (let x = T; x < W; x++) {
        const [m, s] = z === floor - 1 ? plank(seed, T, x, y) : z === floor - 2 ? [M.DIRT, (x + y) % 5 === 0 ? 1 : 3] : brick(seed, x + y, z - floor);
        v.put(x, y, z, m, s);
      }
    }
  }
  for (let z = 0; z < H; z++) {
    const h = z - floor;
    for (let y = 0; y < D; y++) {
      const x1 = y < T ? W : T;
      for (let x = 0; x < x1; x++) {
        let ms: [number, number];
        if (z === H - 1) ms = [M.DIRT, 3 + ((x + y) & 1)];
        else if (x < T && y < T) ms = brick(seed, x + y, h);
        else if (x < T) ms = x === T - 1 ? face(seed, 'left', y, h, R) : brick(seed, y - (x - T), h);
        else ms = y === T - 1 ? face(seed, 'right', x, h, R) : brick(seed, x - (y - T), h);
        v.put(x, y, z, ms[0], ms[1]);
      }
    }
  }
}

// The fireplace: a brick chimney breast up the left wall in the back
// corner, its firebox open to the room with a bed of coal and flames on
// it, a flue up the back, a walnut mantel with a painting over it and
// brick hearthstones set in the floor before it. Everything near the
// flames is brick, coal or metal.
function hearth(v: Voxels, L: Layout, H: Hearth, seed: number, fx: Fixtures): void {
  const { a0, fw, p, fh } = H;
  const R = L.H - L.floor;
  const f0 = a0 + 2;
  const f1 = a0 + fw - 2;
  const mid = a0 + (fw >> 1);
  for (let h = -1; h < R; h++) {
    for (let a = a0; a < a0 + fw; a++) {
      for (let o = -1; o < p; o++) {
        const [m, s] = brick(seed, a + o, h);
        wput(v, L, 'left', a, o, h, m, s);
      }
    }
  }
  for (let h = 1; h < fh; h++) for (let a = f0; a < f1; a++) for (let o = 0; o < p; o++) wput(v, L, 'left', a, o, h, M.AIR, 0);
  // a sooty lining, so the flames stand out against it
  for (let h = 1; h <= fh; h++) {
    for (let a = f0 - 1; a <= f1; a++) {
      for (let o = -1; o < p - 1; o++) if (isSolid(wget(v, L, 'left', a, o, h))) wput(v, L, 'left', a, o, h, M.OBSIDIAN, (a + h + o) & 1 ? 0 : 2);
    }
  }
  for (let a = f0; a < f1; a++) {
    for (let o = 0; o < p - 1; o++) wput(v, L, 'left', a, o, 1, M.COAL, 3 + ((a + o) & 3));
    wput(v, L, 'left', a, p - 1, 1, M.BRICK, 5);
    wput(v, L, 'left', a, 0, 2, M.COAL, 1); // charred logs at the back
  }
  for (const a of [f0, f1 - 1]) for (let h = 2; h < 4; h++) wput(v, L, 'left', a, p - 1, h, M.METAL, h === 3 ? 6 : 2); // firedogs
  for (let a = f0; a < f1; a++) {
    for (let o = 1; o < p - 1; o++) {
      const [x, y] = at(L, 'left', a, o);
      for (const h of [2, 3]) {
        v.put(x, y, L.floor + h, M.FIRE, 2, 6);
        fx.flames.push([x, y, L.floor + h]);
      }
    }
  }
  for (let h = fh; h < R; h++) for (let a = mid - 1; a < mid + 1; a++) for (let o = 0; o < 2; o++) wput(v, L, 'left', a, o, h, M.AIR, 0);
  const [lx, ly] = at(L, 'left', mid, 1);
  fx.fire = [lx + 0.5, ly, L.floor + 3];
  // mantel, and on it two electric candles and a little plant
  for (let a = a0; a < a0 + fw + 1; a++) for (let o = p - 1; o < p + 2; o++) wput(v, L, 'left', a, o, fh + 1, M.DIRT, o === p + 1 ? 6 : 4);
  for (const a of [a0 + 1, a0 + fw - 2]) {
    wput(v, L, 'left', a, p, fh + 2, M.CANDLE, 5);
    wput(v, L, 'left', a, p, fh + 3, M.CANDLE, 6);
    wput(v, L, 'left', a, p, fh + 4, M.LED_AMBER, 7);
  }
  wput(v, L, 'left', mid + 1, p, fh + 2, M.BRICK, 5);
  wput(v, L, 'left', mid + 1, p, fh + 3, M.LEAF, 5);
  wput(v, L, 'left', mid + 2, p, fh + 3, M.LEAF, 3);
  wput(v, L, 'left', mid + 1, p, fh + 4, M.LEAF, 6);
  // the painting over the mantel
  const ph = Math.min(9, R - fh - 12);
  if (ph >= 5 && fw >= 8) picture(v, { T: L.T + p, floor: L.floor }, 'left', a0 + 1, a0 + fw - 1, fh + 5, fh + 5 + ph, hills);
  // hearthstones in the floor
  for (let a = a0; a < a0 + fw + 1; a++) for (let o = p; o < p + 2; o++) wput(v, L, 'left', a, o, -1, M.BRICK, (a + o) & 1 ? 2 : 4);
}

// Logs stacked by the hearth.
function firewood(v: Voxels, L: Layout, at0: Spot): void {
  for (let h = 0; h < 3; h++) {
    for (let k = 0; k < 3 - (h >> 1); k++) {
      const y = at0.y + k;
      for (let x = at0.x; x < at0.x + 3; x++) v.put(x, y, L.floor + h, M.WOOD, x === at0.x + 2 ? 6 : 2 + ((k + h) & 1));
    }
  }
}

// Wall pieces over the props on the walls: the clock over the laptop
// table, a print over the newspaper rack.
function wallDecor(v: Voxels, L: Layout, fx: Fixtures): void {
  const R = L.H - L.floor;
  const slot = (k: SlotKind) => L.slots.find((s) => s.kind === k);
  const write = slot('write');
  if (write && !write.island) {
    const r = R >= 40 ? 5 : 4;
    const h = clamp(R - 10 - r, 11 + r, 22);
    const a = along(write) + 5;
    for (let dh = -r; dh <= r; dh++) {
      for (let da = -r; da <= r; da++) {
        const d = Math.hypot(da, dh);
        if (d > r + 0.35) continue;
        wput(v, L, write.wall, a + da, 0, h + dh, d > r - 0.75 ? M.GOLD_ORE : M.CANDLE, d > r - 0.75 ? 5 : 6);
      }
    }
    for (const [da, dh] of [[0, r - 1], [r - 1, 0], [0, 1 - r], [1 - r, 0]] as const) wput(v, L, write.wall, a + da, 0, h + dh, M.DIRT, 2);
    wput(v, L, write.wall, a, 0, h, M.GOLD_ORE, 7);
    fx.clock = { wall: write.wall, T: L.T, floor: L.floor, a, h, r, painted: [], sec: -1 };
  }
  const search = slot('search');
  if (search && !search.island && R - 8 - 15 >= 5) {
    const a0 = along(search) + 2;
    picture(v, L, search.wall, a0, a0 + 8, 15, Math.min(15 + 8, R - 8), cupArt);
  }
}

// String lights swagged along the tops of both walls, warm bulbs hanging
// off a dark wire, wrapping round anything in the way.
function stringLights(v: Voxels, L: Layout, seed: number, fx: Fixtures): void {
  const R = L.H - L.floor;
  const h0 = R - 5;
  for (const wall of SIDES) {
    const end = wall === 'left' ? L.D : L.W;
    for (let a = L.T; a < end - 1; a++) {
      const u = ((a - L.T) % SPAN) / SPAN;
      const h = h0 - Math.round(2.4 * Math.sin(u * Math.PI));
      let o = 0;
      while (o < 9 && wget(v, L, wall, a, o, h) !== M.AIR) o++;
      if (o >= 9) continue;
      wput(v, L, wall, a, o, h, M.DIRT, 1);
      if ((a - L.T) % 4 !== 2 || wget(v, L, wall, a, o, h - 1) !== M.AIR) continue;
      wput(v, L, wall, a, o, h - 1, hash3(seed, a, 0, 61) < 0.25 ? M.LED_AMBER : M.LAMP, 7);
      const [x, y] = at(L, wall, a, o);
      fx.bulbs.push(v.idx(x, y, L.floor + h - 1));
    }
  }
}

// The lounge: a rug set in the floor, a sofa along its back facing a low
// table, an armchair at each side, a floor lamp and a plant by the sofa.
function lounge(v: Voxels, L: Layout, s: Site, rng: Rng, fx: Fixtures): void {
  const { x: cx, y: cy, rx, ry } = s;
  const z = L.floor;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (e > 1) continue;
      const [m, sh] = e > 0.78 ? [M.CLOTH, 3] : e > 0.62 ? [M.CANDLE, 5] : (x + y) % 4 === 0 || (x - y) % 4 === 0 ? [M.CLOTH, 5] : [M.CARPET, 4];
      v.put(x, y, z - 1, m, sh);
    }
  }
  // sofa facing +y
  const y0 = cy - ry + 1;
  const sl = Math.min(rx - 3, 5);
  box(v, cx - sl, y0, z, cx + sl + 1, y0 + 3, z + 2, M.CONCRETE, 2);
  box(v, cx - sl, y0 + 1, z + 2, cx + sl + 1, y0 + 3, z + 3, M.CONCRETE, 5);
  for (let x = cx - sl + 3; x < cx + sl - 1; x += 3) v.put(x, y0 + 2, z + 2, M.CONCRETE, 3);
  box(v, cx - sl, y0, z + 2, cx + sl + 1, y0 + 1, z + 5, M.CONCRETE, 3);
  for (const x of [cx - sl, cx + sl]) box(v, x, y0, z + 2, x + 1, y0 + 3, z + 4, M.CONCRETE, 4);
  v.put(cx - sl + 1, y0 + 1, z + 3, M.CARPET, 6);
  v.put(cx + sl - 1, y0 + 1, z + 3, M.CLOTH, 6);
  // a second sofa facing the first, for the big centrepiece
  const big = rx >= 10;
  if (big) {
    const y1 = cy + ry - 3;
    box(v, cx - sl, y1, z, cx + sl + 1, y1 + 3, z + 2, M.CLOTH, 2);
    box(v, cx - sl, y1, z + 2, cx + sl + 1, y1 + 2, z + 3, M.CLOTH, 5);
    for (let x = cx - sl + 3; x < cx + sl - 1; x += 3) v.put(x, y1, z + 2, M.CLOTH, 3);
    box(v, cx - sl, y1 + 2, z + 2, cx + sl + 1, y1 + 3, z + 5, M.CLOTH, 3);
    for (const x of [cx - sl, cx + sl]) box(v, x, y1, z + 2, x + 1, y1 + 3, z + 4, M.CLOTH, 4);
    v.put(cx, y1 + 1, z + 3, M.CARPET, 6);
  }
  // the low table
  const ty = big ? cy - 1 : y0 + 5;
  box(v, cx - 2, ty, z + 2, cx + 3, ty + 2, z + 3, M.WOOD, 5);
  for (const x of [cx - 2, cx + 2]) for (const y of [ty, ty + 1]) v.put(x, y, z, M.DIRT, 2);
  for (const x of [cx - 2, cx + 2]) for (const y of [ty, ty + 1]) v.put(x, y, z + 1, M.DIRT, 3);
  v.put(cx + 2, ty + 1, z + 3, M.BRIMSTONE, 6); // a croissant
  v.put(cx - 2, ty, z + 3, M.CLOTH, 4); // a book
  v.put(cx - 1, ty, z + 3, M.CLOTH, 5);
  // a floor lamp at one end of the sofa, a plant at the other
  const lx = cx + sl + 1;
  v.put(lx, y0, z, M.METAL, 2);
  for (let h = 1; h < 10; h++) v.put(lx, y0, z + h, M.GOLD_ORE, 4);
  box(v, lx - 1, y0 - 1, z + 10, lx + 2, y0 + 2, z + 11, M.LAMP, 6);
  box(v, lx - 1, y0 - 1, z + 11, lx + 2, y0 + 2, z + 12, M.CANDLE, 5);
  fx.lamps.push([lx + 0.5, y0 + 0.5, z + 10]);
  if (sl + 5 <= rx) plant(v, cx - sl - 4, y0, z, 8 + (cx % 3), rng);
  // armchairs either side, facing in
  for (const side of [-1, 1]) {
    const back = side < 0 ? cx - rx : cx + rx - 1;
    const x0 = side < 0 ? back : back - 2;
    box(v, x0, cy - 1, z, x0 + 3, cy + 2, z + 2, M.CARPET, 2);
    box(v, x0, cy - 1, z + 2, x0 + 3, cy + 2, z + 3, M.CARPET, 5);
    box(v, back, cy - 1, z + 2, back + 1, cy + 2, z + 5, M.CARPET, 3);
    for (const y of [cy - 1, cy + 1]) box(v, x0, y, z + 3, x0 + 3, y + 1, z + 4, M.CARPET, 4);
  }
}

// An upright walnut piano with its keys to +y, sheet music on the stand, a
// lamp and a plant on top and a bench before it.
function piano(v: Voxels, L: Layout, s: Spot, fx: Fixtures): void {
  const { x: cx, y: cy } = s;
  const z = L.floor;
  box(v, cx - 3, cy - 1, z, cx + 4, cy + 1, z + 7, M.DIRT, 2);
  box(v, cx - 3, cy - 1, z + 7, cx + 4, cy + 1, z + 8, M.DIRT, 5);
  for (let x = cx - 2; x < cx + 3; x++) for (let h = 1; h < 3; h++) v.put(x, cy, z + h, M.DIRT, 4); // the lower panel
  for (const x of [cx - 3, cx + 3]) for (let h = 0; h < 3; h++) v.put(x, cy + 1, z + h, M.DIRT, 3); // legs
  for (let x = cx - 3; x < cx + 4; x++) {
    v.put(x, cy + 1, z + 3, M.DIRT, 5);
    const k = (x - cx + 70) % 7;
    v.put(x, cy + 1, z + 4, k === 1 || k === 2 || k === 4 || k === 5 ? M.OBSIDIAN : M.BONE, 7);
  }
  for (let x = cx - 1; x < cx + 2; x++) for (let h = 5; h < 7; h++) v.put(x, cy + 1, z + h, M.PAPER, 6 + (x & 1));
  v.put(cx + 2, cy, z + 8, M.GOLD_ORE, 4);
  v.put(cx + 2, cy, z + 9, M.LAMP, 7);
  v.put(cx - 2, cy, z + 8, M.BRICK, 5);
  v.put(cx - 2, cy, z + 9, M.LEAF, 5);
  v.put(cx - 2, cy - 1, z + 9, M.LEAF, 3);
  // the bench
  box(v, cx - 2, cy + 3, z + 2, cx + 3, cy + 5, z + 3, M.DIRT, 5);
  for (const x of [cx - 2, cx + 2]) for (const y of [cy + 3, cy + 4]) box(v, x, y, z, x + 1, y + 1, z + 2, M.DIRT, 2);
  fx.piano = [cx + 0.5, cy + 1.5, z + 6];
}

// A long oak table with a bench down each side, a laptop glowing, cups
// steaming and a jar candle.
function longTable(v: Voxels, L: Layout, s: Spot, rng: Rng, fx: Fixtures): void {
  const { x: cx, y: cy } = s;
  const z = L.floor;
  box(v, cx - 5, cy - 1, z + 4, cx + 6, cy + 2, z + 5, M.WOOD, 5);
  for (let x = cx - 5; x < cx + 6; x++) v.put(x, cy + 1, z + 4, M.WOOD, 6);
  for (const x of [cx - 5, cx + 5]) for (const y of [cy - 1, cy + 1]) box(v, x, y, z, x + 1, y + 1, z + 4, M.DIRT, 2);
  for (let x = cx - 4; x < cx + 5; x++) v.put(x, cy, z + 1, M.DIRT, 3); // stretcher
  for (const y of [cy - 3, cy + 3]) {
    box(v, cx - 4, y, z + 2, cx + 5, y + 1, z + 3, M.WOOD, 4);
    for (const x of [cx - 4, cx, cx + 4]) box(v, x, y, z, x + 1, y + 1, z + 2, M.DIRT, 2);
  }
  // a laptop, lid up and lit
  box(v, cx - 4, cy, z + 5, cx - 1, cy + 2, z + 6, M.METAL, 5);
  box(v, cx - 4, cy - 1, z + 5, cx - 1, cy, z + 8, M.SCREEN, 5);
  cup(v, cx + 1, cy, z + 5);
  v.put(cx + 4, cy, z + 5, M.GLASS, 5);
  v.put(cx + 4, cy, z + 6, M.LAMP, 7); // a jar candle
  if (rng.chance(0.7)) v.put(cx + 3, cy + 1, z + 5, M.BRIMSTONE, 5);
  fx.candles.push([cx + 4.5, cy + 0.5, z + 7]);
}

// The pastry counter: a walnut island with a marble top, a coffee urn, a
// glass case of pastries and a cake on a stand with a cherry on top.
function pastryCounter(v: Voxels, L: Layout, s: Spot, fx: Fixtures): void {
  const { x: cx, y: cy } = s;
  const z = L.floor;
  box(v, cx - 5, cy - 2, z, cx + 6, cy + 1, z + 4, M.DIRT, 3);
  for (let x = cx - 5; x < cx + 6; x++) for (let h = 1; h < 4; h++) v.put(x, cy, z + h, M.DIRT, x & 1 ? 2 : 5);
  for (let x = cx - 5; x < cx + 6; x++) v.put(x, cy, z, M.DIRT, 1);
  box(v, cx - 6, cy - 3, z + 4, cx + 7, cy + 2, z + 5, M.CANDLE, 6);
  // the urn
  box(v, cx - 5, cy - 2, z + 5, cx - 3, cy, z + 9, M.METAL, 5);
  v.put(cx - 5, cy - 2, z + 9, M.GOLD_ORE, 6);
  v.put(cx - 4, cy - 1, z + 8, M.LED_AMBER, 7);
  v.put(cx - 4, cy, z + 6, M.METAL, 2); // the tap
  // the case of pastries
  box(v, cx - 2, cy - 2, z + 5, cx + 3, cy + 1, z + 8, M.GLASS, 5);
  box(v, cx - 1, cy - 1, z + 5, cx + 2, cy, z + 7, M.AIR, 0);
  for (const [dx, h, m, sh] of [[-1, 5, M.BRIMSTONE, 5], [0, 5, M.CLOTH, 4], [1, 5, M.BRIMSTONE, 3], [-1, 6, M.CANDLE, 6], [1, 6, M.BRIMSTONE, 6]] as const) v.put(cx + dx, cy - 1, z + h, m, sh);
  // the cake
  v.put(cx + 4, cy - 1, z + 5, M.METAL, 6);
  for (const [dx, dy] of PLUS) v.put(cx + 4 + dx, cy - 1 + dy, z + 6, M.BONE, 6);
  box(v, cx + 3, cy - 2, z + 7, cx + 6, cy + 1, z + 8, M.CLOTH, 5);
  box(v, cx + 3, cy - 2, z + 8, cx + 6, cy + 1, z + 9, M.CANDLE, 7);
  v.put(cx + 4, cy - 1, z + 9, M.LED_RED, 6);
  for (let h = 5; h < 8; h++) v.put(cx + 6, cy - 3, z + h, M.BONE, h & 1 ? 6 : 4); // cups
  // stools along the front
  for (const dx of [-4, -1, 2, 5]) {
    v.put(cx + dx, cy + 3, z, M.METAL, 2);
    v.put(cx + dx, cy + 3, z + 1, M.METAL, 4);
    v.put(cx + dx, cy + 3, z + 2, M.CLOTH, 5);
  }
  fx.candles.push([cx + 0.5, cy + 1.5, z + 8]);
}

const RUGS = [M.CLOTH, M.CONCRETE, M.CARPET];

// A rug set in the floorboards: an ellipse (or, `square`, a rectangle with
// clipped corners) of `field` in a cream border.
function rug(v: Voxels, L: Layout, cx: number, cy: number, rx: number, ry: number, field: number, square = false): void {
  for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
    for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
      const ex = Math.abs(dx) / rx;
      const ey = Math.abs(dy) / ry;
      const e = square ? Math.max(ex, ey) + (ex > 0.85 && ey > 0.85 ? 0.2 : 0) : Math.hypot(ex, ey);
      if (e > 1) continue;
      const edge = square ? Math.abs(dx) >= Math.floor(rx) || Math.abs(dy) >= Math.floor(ry) : e > 0.8;
      v.put(cx + dx, cy + dy, L.floor - 1, edge ? M.CANDLE : field, edge ? 5 : ((dx + dy) & 3) === 0 ? 6 : 4);
    }
  }
}

// A bistro table: a round top on an iron pedestal, walnut or marble, and a
// chair each side along `along`. Its number `n` picks how it is laid, the
// same mix all over the room: a cup of coffee on one in three, else a
// croissant on a plate, a book or two, a posy in a jar or nothing, and a jar
// candle on one in five.
const COVERS = [M.CLOTH, M.CARPET, M.CONCRETE, M.PLASTIC, M.TILE];

function bistro(v: Voxels, L: Layout, cx: number, cy: number, along: Axis, rng: Rng, marble: boolean, n: number): void {
  const z = L.floor;
  for (let h = 0; h < 4; h++) v.put(cx, cy, z + h, M.METAL, 1);
  for (const [dx, dy] of PLUS) v.put(cx + dx, cy + dy, z, M.METAL, 2);
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (Math.abs(dx) + Math.abs(dy) >= 4) continue;
      const rim = Math.abs(dx) === 2 || Math.abs(dy) === 2;
      v.put(cx + dx, cy + dy, z + 4, marble ? M.CANDLE : M.DIRT, marble ? (rim ? 4 : 6) : rim ? 4 : 6);
    }
  }
  const lay = (n * 7) % 12; // runs through all twelve, neighbours apart
  if (lay < 4) {
    cup(v, cx, cy, z + 5);
    if (rng.chance(0.4)) v.put(cx + 1, cy + 2, z + 5, M.BRIMSTONE, 5);
  } else if (lay < 6) {
    v.put(cx, cy, z + 5, M.BONE, 4); // a croissant on a plate
    v.put(cx + 1, cy, z + 5, M.BONE, 3);
    v.put(cx, cy, z + 6, M.BRIMSTONE, 5);
  } else if (lay < 8) {
    const m = rng.pick(COVERS); // a book, and maybe another on it
    v.put(cx, cy, z + 5, m, 4);
    v.put(cx + 1, cy, z + 5, m, 5);
    if (rng.chance(0.5)) v.put(cx, cy, z + 6, rng.pick(COVERS), 5);
  } else if (lay < 10) {
    v.put(cx, cy, z + 5, M.GLASS, 5); // a posy in a jar
    v.put(cx, cy, z + 6, M.LEAF, 4);
    v.put(cx, cy, z + 7, rng.pick([M.CLOTH, M.CARPET, M.BRIMSTONE]), 6);
  }
  if ((n * 3 + 1) % 5 === 0) {
    v.put(cx - 1, cy + 1, z + 5, M.GLASS, 5);
    v.put(cx - 1, cy + 1, z + 6, M.LAMP, 7); // a jar candle
    FIXTURES.get(v)?.candles.push([cx - 0.5, cy + 1.5, z + 7]);
  }
  for (const side of [-1, 1]) {
    const o0 = side < 0 ? -5 : 4; // the seat's near corner, out along `along`
    const ob = side < 0 ? -5 : 5; // its back
    const cell = (o: number, q: number): [number, number] => (along === 'x' ? [cx + o, cy + q] : [cx + q, cy + o]);
    for (let o = o0; o < o0 + 2; o++) {
      for (let q = 0; q < 2; q++) {
        const [x, y] = cell(o, q);
        v.put(x, y, z, M.DIRT, 2);
        v.put(x, y, z + 1, M.DIRT, 3);
        v.put(x, y, z + 2, M.WOOD, 5);
        if (o === ob) for (let h = 3; h < 6; h++) v.put(x, y, z + h, M.WOOD, 3);
      }
    }
  }
}

// Two or three two-seat tables in a row along `axis` on one long rug, all
// with the same tops, numbered on from `t0`.
function tableRow(v: Voxels, L: Layout, s: Spot, axis: Axis, k: number, n: number, t0: number, rng: Rng): void {
  const long = n === 3 ? 10.5 : 6.5;
  const [rx, ry] = axis === 'x' ? [long, 5.5] : [5.5, long];
  rug(v, L, s.x, s.y, rx, ry, RUGS[k % RUGS.length], true);
  (n === 3 ? [-8, 0, 8] : [-4, 4]).forEach((d, i) => bistro(v, L, axis === 'x' ? s.x + d : s.x, axis === 'x' ? s.y : s.y + d, axis === 'x' ? 'y' : 'x', rng, k % 3 === 1, t0 + i));
}

// A reading corner: two low bookcases in an L, two armchairs side by side
// with a lamp on a little table between them, a floor lamp, a plant and a
// pile of books, on a sage rug.
function readingCorner(v: Voxels, L: Layout, s: Spot, rng: Rng, fx: Fixtures): void {
  const { x: cx, y: cy } = s;
  const z = L.floor;
  rug(v, L, cx, cy, 6.5, 6.5, M.CONCRETE, true);
  const books = (x0: number, y0: number, x1: number, y1: number, h0: number) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) for (let h = h0; h < h0 + 3 - (rng.chance(0.3) ? 1 : 0); h++) v.put(x, y, z + h, rng.pick(BOOKS), rng.int(2, 6));
  };
  // along x at the back, books facing +y
  box(v, cx - 6, cy - 7, z, cx + 4, cy - 6, z + 9, M.WOOD, 2);
  for (const h of [0, 4, 8]) box(v, cx - 6, cy - 6, z + h, cx + 4, cy - 5, z + h + 1, M.WOOD, 5);
  for (const x of [cx - 6, cx + 3]) box(v, x, cy - 6, z, x + 1, cy - 5, z + 9, M.WOOD, 4);
  books(cx - 5, cy - 6, cx + 3, cy - 5, 1);
  books(cx - 5, cy - 6, cx + 3, cy - 5, 5);
  // along y at the side, books facing +x
  box(v, cx - 7, cy - 4, z, cx - 6, cy + 5, z + 9, M.WOOD, 2);
  for (const h of [0, 4, 8]) box(v, cx - 6, cy - 4, z + h, cx - 5, cy + 5, z + h + 1, M.WOOD, 5);
  for (const y of [cy - 4, cy + 4]) box(v, cx - 6, y, z, cx - 5, y + 1, z + 9, M.WOOD, 4);
  books(cx - 6, cy - 3, cx - 5, cy + 4, 1);
  books(cx - 6, cy - 3, cx - 5, cy + 4, 5);
  // armchairs facing +y, a lamp table between
  for (const [x0, m] of [[cx - 3, M.CARPET], [cx + 2, M.CLOTH]] as const) {
    box(v, x0, cy - 3, z, x0 + 3, cy, z + 2, m, 2);
    box(v, x0, cy - 2, z + 2, x0 + 3, cy, z + 3, m, 5);
    box(v, x0, cy - 3, z + 2, x0 + 3, cy - 2, z + 6, m, 3);
    for (const x of [x0, x0 + 2]) box(v, x, cy - 2, z + 3, x + 1, cy, z + 4, m, 4);
  }
  v.put(cx, cy - 2, z, M.DIRT, 2);
  v.put(cx, cy - 2, z + 1, M.DIRT, 3);
  box(v, cx, cy - 2, z + 2, cx + 2, cy - 1, z + 3, M.WOOD, 5);
  v.put(cx, cy - 2, z + 3, M.GOLD_ORE, 5);
  v.put(cx, cy - 2, z + 4, M.LAMP, 7);
  v.put(cx + 1, cy - 2, z + 3, M.CLOTH, 4); // a book left open
  fx.candles.push([cx + 0.5, cy - 1.5, z + 5]);
  box(v, cx - 2, cy + 2, z, cx, cy + 3, z + 2, M.CARPET, 4); // a footstool
  floorLamp(v, L, { x: cx + 5, y: cy - 5 });
  plant(v, cx + 3, cy + 3, z, 9, rng);
  for (let h = 0; h < 3; h++) v.put(cx - 4, cy + 5, z + h, rng.pick(BOOKS), rng.int(2, 6));
}

// A long walnut planter of clipped hedge with a few flowers in it, 2 wide.
function planter(v: Voxels, L: Layout, s: Spot, len: number, axis: Axis, rng: Rng): void {
  const z = L.floor;
  const half = len >> 1;
  for (let a = -half; a <= half; a++) {
    for (let q = 0; q < 2; q++) {
      const [x, y] = axis === 'x' ? [s.x + a, s.y + q] : [s.x + q, s.y + a];
      const end = Math.abs(a) === half;
      v.put(x, y, z, M.DIRT, 2);
      v.put(x, y, z + 1, M.DIRT, end ? 5 : 3);
      v.put(x, y, z + 2, M.DIRT, end ? 6 : 1);
      const tall = 3 + (rng.chance(0.75) ? 1 : 0) + (rng.chance(0.35) ? 1 : 0) - (end ? 1 : 0);
      for (let h = 3; h < 3 + tall; h++) v.put(x, y, z + h, rng.chance(0.3) ? M.MOSS : M.LEAF, rng.int(2, 6));
      if (rng.chance(0.12)) v.put(x, y, z + 3 + tall, rng.pick([M.CLOTH, M.CARPET, M.CANDLE]), 6);
    }
  }
}

// An oak bench along `axis`, its back to -y (or -x), a cushion or two on it.
function bench(v: Voxels, L: Layout, s: Spot, axis: Axis, rng: Rng): void {
  const z = L.floor;
  const cell = (a: number, q: number): [number, number] => (axis === 'x' ? [s.x + a, s.y + q] : [s.x + q, s.y + a]);
  for (let a = -3; a <= 3; a++) {
    const [x, y] = cell(a, 0);
    const leg = a === -3 || a === 0 || a === 3;
    if (leg) for (let h = 0; h < 2; h++) v.put(x, y, z + h, M.DIRT, 2 + h);
    v.put(x, y, z + 2, M.WOOD, 5);
    const [bx, by] = cell(a, -1);
    if (leg) for (let h = 0; h < 3; h++) v.put(bx, by, z + h, M.DIRT, 2);
    for (let h = 3; h < 6; h++) v.put(bx, by, z + h, M.WOOD, h === 5 ? 6 : 3);
  }
  for (const a of [-2, 1]) {
    if (!rng.chance(0.6)) continue;
    const [x, y] = cell(a, 0);
    v.put(x, y, z + 3, rng.pick([M.CLOTH, M.CARPET, M.CONCRETE]), 5);
  }
}

// A brass floor lamp with a glowing shade.
function floorLamp(v: Voxels, L: Layout, s: Spot): void {
  const z = L.floor;
  v.put(s.x, s.y, z, M.METAL, 2);
  for (let h = 1; h < 9; h++) v.put(s.x, s.y, z + h, M.GOLD_ORE, 4);
  box(v, s.x - 1, s.y - 1, z + 9, s.x + 2, s.y + 2, z + 10, M.LAMP, 6);
  box(v, s.x - 1, s.y - 1, z + 10, s.x + 2, s.y + 2, z + 11, M.CANDLE, 5);
}

// The ginger cat, curled on a sage cushion with its corner at (x, y).
type CatCell = readonly [number, number, number, number, number]; // dx, dy, h, material, shade

function catCells(awake: boolean, breath: boolean, tail: boolean, ear: boolean): CatCell[] {
  const out: CatCell[] = [];
  for (let dx = 1; dx < 5; dx++) for (let dy = 1; dy < 3; dy++) out.push([dx, dy, 1, dx & 1 ? M.BRIMSTONE : M.WOOD, dx & 1 ? 5 : 4]);
  for (let dx = 2; dx < 4; dx++) for (let dy = 1; dy < 3; dy++) out.push([dx, dy, 2, dx === 3 ? M.WOOD : M.BRIMSTONE, breath ? 7 : 5]);
  const hh = awake ? 2 : 1;
  for (let dy = 1; dy < 3; dy++) {
    out.push([5, dy, hh, M.BRIMSTONE, 6]);
    out.push([5, dy, hh + 1, M.BRIMSTONE, 5]);
  }
  out.push([5, 1, hh + 2, M.BRIMSTONE, 3]);
  if (!ear) out.push([5, 2, hh + 2, M.BRIMSTONE, 3]);
  if (awake) out.push([5, 2, 1, M.CANDLE, 7]); // the bib, under the raised head
  for (let dx = 1; dx < 4; dx++) out.push([dx, 3, 1, M.BRIMSTONE, dx === 3 ? 6 : 4]);
  out.push(tail ? [0, 3, 2, M.CANDLE, 7] : [4, 3, 1, M.CANDLE, 7]);
  return out;
}

const CAT_SPACE: ReadonlyArray<readonly [number, number, number]> = (() => {
  const out: Array<readonly [number, number, number]> = [];
  for (let h = 1; h < 5; h++) for (let dy = 1; dy < 4; dy++) for (let dx = 0; dx < 6; dx++) out.push([dx, dy, h]);
  return out;
})();

function kitty(v: Voxels, L: Layout, s: Spot): Kitty {
  const z = L.floor;
  for (let dy = 0; dy < 4; dy++) {
    for (let dx = 0; dx < 6; dx++) {
      if ((dx === 0 || dx === 5) && (dy === 0 || dy === 3)) continue;
      v.put(s.x + dx, s.y + dy, z, M.CONCRETE, dx === 0 || dx === 5 || dy === 0 || dy === 3 ? 3 : 5);
    }
  }
  const k = { x: s.x, y: s.y, z };
  drawCat(v, k, catCells(false, false, false, false));
  return k;
}

function drawCat(v: Voxels, k: Kitty, cells: readonly CatCell[]): void {
  const want = new Map<number, CatCell>();
  for (const c of cells) want.set(v.idx(k.x + c[0], k.y + c[1], k.z + c[2]), c);
  for (const [dx, dy, h] of CAT_SPACE) {
    const i = v.idx(k.x + dx, k.y + dy, k.z + h);
    const c = want.get(i);
    const m = v.mat[i];
    if (c) {
      if (m === M.AIR || m === M.BRIMSTONE || m === M.WOOD || m === M.CANDLE) v.set(i, c[3], c[4], 0);
    } else if (m === M.BRIMSTONE || m === M.WOOD || m === M.CANDLE) {
      v.set(i, M.AIR, 0, 0);
    }
  }
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx): void {
  const fx = FIXTURES.get(c.v);
  if (!fx) return;
  const v = c.v;

  // The fire.
  for (const [x, y, z] of fx.flames) if (c.rng.chance(0.5)) keepFire(c, x, y, z, c.rng.int(4, 9));
  if (fx.fire) {
    const [x, y, z] = fx.fire;
    c.light({ x, y, z, color: FLAME, radius: 26, intensity: 0.8 * flicker(c.t, 3) });
    if (c.rng.chance(c.dt * 1.5)) {
      c.spawn({ kind: 'ember', x: x + c.rng.range(0, 2), y: y + c.rng.range(-2, 2), z: z + 0.5, vx: c.rng.range(0.2, 1), vy: c.rng.range(-0.4, 0.4), vz: c.rng.range(0.8, 1.8), life: c.rng.range(0.6, 1.2), color: EMBER, glow: true, gravity: -0.3 });
    }
  }

  for (const [x, y, z] of fx.lamps) c.light({ x, y, z, color: LAMPLIGHT, radius: 16, intensity: 0.5 });
  fx.candles.forEach(([x, y, z], k) => c.light({ x, y, z, color: LAMPLIGHT, radius: 8, intensity: 0.28 * flicker(c.t, k * 3) }));
  // Someone hums at the piano now and then.
  if (fx.piano && (c.t + 3) % 13 < 3 && c.rng.chance(c.dt * 3)) {
    const [x, y, z] = fx.piano;
    c.spawn({ kind: 'glint', x: x + c.rng.range(-2, 2), y, z, vx: c.rng.range(-0.4, 0.4), vy: c.rng.range(0, 0.4), vz: c.rng.range(1, 2), life: c.rng.range(1, 1.6), color: NOTE, glow: true, gravity: 0 });
  }

  // Rain runs down every window; some of it trickles into the gutter.
  for (const w of fx.windows) {
    // the gutter takes rain only while it is less than half full
    let full = 0;
    for (const i of w.trough) if (v.mat[i + v.W * v.D] !== M.AIR) full++;
    const room = full * 2 < w.trough.length;
    const n = (w.a1 - w.a0) * c.dt * 1.4;
    for (let k = Math.floor(n) + (c.rng.chance(n % 1) ? 1 : 0); k > 0; k--) {
      const a = c.rng.int(w.a0, w.a1 - 1);
      const [x, y] = at(w, w.wall, a, -1);
      const drip = room && c.rng.chance(0.02);
      c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: w.floor + w.h1 - 0.3, vx: 0, vy: 0, vz: -c.rng.range(2, 6), life: 6, color: RAIN, glow: false, gravity: c.rng.range(2, 8), mat: drip ? M.WATER : undefined });
    }
    if (w.trough.length && c.rng.chance(c.dt * 5)) {
      const i = w.trough[c.rng.int(0, w.trough.length - 1)];
      if (v.mat[i] === M.WATER) v.set(i, M.WATER, c.rng.int(2, 7), v.life[i]);
    }
  }

  // Now and then lightning over the town.
  const ph = (c.t + 9) % 37;
  const flash = ph < 0.12 || (ph > 0.3 && ph < 0.38);
  if (flash !== fx.flash) {
    fx.flash = flash;
    for (const w of fx.windows) {
      w.sky.forEach((i, k) => {
        if (v.mat[i] === M.TILE) v.set(i, M.TILE, flash ? 7 : w.tint[k], 0);
      });
    }
  }
  if (flash) {
    for (const w of fx.windows) {
      const [x, y] = at(w, w.wall, (w.a0 + w.a1) / 2, 1);
      c.light({ x, y, z: w.floor + (w.h0 + w.h1) / 2, color: FLASH, radius: 30, intensity: 0.9 });
    }
  }

  // The string lights twinkle.
  if (fx.bulbs.length) {
    for (let k = 0; k < 2; k++) {
      if (!c.rng.chance(c.dt * 8)) continue;
      const i = fx.bulbs[c.rng.int(0, fx.bulbs.length - 1)];
      const m = v.mat[i];
      if (m === M.LAMP || m === M.LED_AMBER) v.set(i, m === M.LAMP ? M.LED_AMBER : M.LAMP, 7, 0);
    }
  }

  // The clock.
  const ck = fx.clock;
  if (ck) {
    const sec = Math.floor(c.t);
    if (sec !== ck.sec) {
      ck.sec = sec;
      for (const i of ck.painted) if (v.mat[i] === M.DIRT || v.mat[i] === M.LED_RED) v.set(i, M.CANDLE, 6, 0);
      ck.painted = [];
      const t = 10 * 3600 + 8 * 60 + sec; // ten past ten when the café opens
      const sign = ck.wall === 'right' ? 1 : -1;
      const hand = (turn: number, len: number, m: number) => {
        const ang = turn * Math.PI * 2;
        for (let r = 0.5; r <= len; r += 0.5) {
          const [x, y] = at(ck, ck.wall, Math.round(ck.a + sign * Math.sin(ang) * r), 0);
          const z = ck.floor + Math.round(ck.h + Math.cos(ang) * r);
          const i = v.idx(x, y, z);
          if (v.mat[i] !== M.CANDLE && v.mat[i] !== M.LED_RED) continue;
          v.set(i, m, m === M.DIRT ? 1 : 6, 0);
          ck.painted.push(i);
        }
      };
      hand((t % 60) / 60, ck.r - 1, M.LED_RED);
      hand((t % 3600) / 3600, ck.r - 1, M.DIRT);
      hand((t % 43200) / 43200, ck.r - 2, M.DIRT);
    }
  }

  // Cups steam.
  if (fx.cups.length && c.rng.chance(c.dt * fx.cups.length * 0.7)) {
    const i = fx.cups[c.rng.int(0, fx.cups.length - 1)];
    if (v.mat[i] === M.COFFEE) puff(c, v.xOf(i), v.yOf(i), v.zOf(i) + 1, M.STEAM, c.rng.int(25, 45));
  }

  // The ginger cat dozes by the fire; every half minute it lifts its head
  // and swishes its tail for a while.
  const k = fx.cat;
  if (k) {
    const awake = (c.t + 5) % 28 < 5;
    const breath = Math.sin(c.t * 2) > 0.2;
    const tail = awake && Math.floor(c.t * 2.5) % 2 === 0;
    const ear = (c.t + 2) % 7 < 0.25;
    drawCat(v, k, catCells(awake, breath, tail, ear));
    if (!awake && c.rng.chance(c.dt * 0.5)) {
      c.spawn({ kind: 'zzz', x: k.x + 5.5, y: k.y + 1.5, z: k.z + 4, vx: 0.2, vy: 0.2, vz: 1, life: 2, color: SLEEP, glow: false, gravity: 0 });
    }
  }
}

// Where idle characters like to be: the sofas and armchairs, the warmth of
// the fire, a cup at the bar, the view of the rain and the cat.
function pois(L: Layout): Poi[] {
  return plan(L).pois.map((p) => ({ ...p }));
}

export const cafe: Biome = {
  id: 'cafe',
  name: 'Cozy Café',
  tagline: 'Rain on the windows, espresso and a cat by the fire',
  palette: PALETTE,
  backdrop: hex('#140d09'),
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  costume: 'casual',
  finale: { colors: [[244, 236, 220], [226, 204, 170], [250, 250, 244]], glow: false }, // paper confetti, gone where it lands
  build: BUILD,
  pois,
};

export default cafe;
