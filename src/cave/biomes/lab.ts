import type { RGB } from '../../term/color.ts';
import { hex, mix } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import { buildSites, hub, keepClear, slotRect, slotsOn, wallGaps } from '../layout.ts';
import { M, MATERIALS } from '../materials.ts';
import { beat, flicker, hash3, keepFire, noise2, puff, tone, wallOf } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Particle, Poi, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// The Mad Science Lab: a bright tiled laboratory at the top of a tower in a
// thunderstorm. White tile and plaster over brick, a glowing reagent line
// run through the walls, glassware bubbling on the benches, specimens
// floating in tanks, a tesla coil that arcs when something runs, a rat in
// a wheel, and lightning in the windows now and then.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#0b191e'),
  wall: hex('#d9e4e8'),
  wall2: hex('#c3d3d8'),
  floor: hex('#9fb2b9'),
  floor2: hex('#8a9ea6'),
  text: hex('#e6f3f2'),
  dim: hex('#7d979d'),
  accent: hex('#22c7b8'),
  accent2: hex('#ff8a3d'),
  panel: hex('#0f262c'),
  panelText: hex('#eaf6f4'),
  border: hex('#2a9d8f'),
  bubble: hex('#ffffff'),
  bubbleText: hex('#12343b'),
  good: hex('#3ddc97'),
  warn: hex('#ffa53d'),
  bad: hex('#ff4d5a'),
};

const GRADE: Grade = { ambient: hex('#88949e'), illum: 1, bloom: 0.6, vignette: 0.25 };

// Cool white plaster and porcelain on the walls over a blue-grey tiled
// floor (dark enough that white coats stand out), teal plastic, charcoal
// resin bench tops.
// The cave materials are recast: GOLD_ORE as hazard yellow, BRIMSTONE as
// warning orange, ROCK as copper windings, MOSS as chalkboard green, CANDLE
// as porcelain, CLOTH as fire-engine red, COAL as the night sky outside and
// SLUDGE as an orange reagent.
const COLORS: Partial<Record<number, string>> = {
  [M.PLASTER]: '#e3eaeb',
  [M.TILE]: '#a9b6c0',
  [M.PLASTIC]: '#24a596',
  [M.OBSIDIAN]: '#262d33',
  [M.GOLD_ORE]: '#f2c230',
  [M.BRIMSTONE]: '#f0862a',
  [M.ROCK]: '#c97a3c',
  [M.ROCK_DARK]: '#7c4322',
  [M.MOSS]: '#26473c',
  [M.CANDLE]: '#f1f4f3',
  [M.CLOTH]: '#cf3b40',
  [M.COAL]: '#0c1336',
  [M.SLUDGE]: '#ff9c33',
};

const DARK = M.OBSIDIAN; // unlit screen and lamp pixels, bezels, resin tops
const DADO = 9; // the teal rail between the tiled dado and the plaster
const WALL_TILE = 4; // wall tile pitch, grout included
const FLOOR_TILE = 8; // floor tile pitch, grout included
const UPPER = 24; // lowest row of the windows and posters high on the walls

const COOL: RGB = hex('#e8f3ff');
const SCREEN_GLOW: RGB = hex('#7fe0ff');
const HELIX_PINK: RGB = hex('#ff7ad0');
const WARM: RGB = hex('#ffd9a0');
const HOTPLATE: RGB = hex('#ff7a4a');
const FLAME: RGB = hex('#ff9a3c');
const AMBER: RGB = hex('#ffb347');
const RED: RGB = hex('#ff4040');
const AQUA: RGB = hex('#8ff0ff');
const CHALK: RGB = hex('#f4f1e6');
const STORM: RGB = hex('#dce8ff');
const VIOLET: RGB = hex('#b9a8ff');
const CORE: RGB = hex('#b48cff');
const ARC: readonly RGB[] = [hex('#ffffff'), hex('#e2f1ff'), hex('#a9d4ff'), hex('#c6b6ff')];
const SOLDER: readonly RGB[] = [hex('#fff6c8'), hex('#ffe08a'), hex('#ffffff')];
const NOTES: readonly RGB[] = [hex('#ff8ad8'), hex('#8af7ff'), hex('#ffe17a'), hex('#a8ff8a')];
const RUNES: readonly RGB[] = [hex('#8ff8e8'), hex('#ffd27a')];
const LIQUID_LIGHT: Partial<Record<number, RGB>> = {
  [M.ACID]: hex('#7dff5a'),
  [M.POTION]: hex('#e070ff'),
  [M.WATER]: hex('#6fc0ff'),
  [M.SLUDGE]: hex('#ffb347'),
};
const REAGENTS = [M.POTION, M.ACID, M.SLUDGE, M.ACID, M.POTION, M.WATER];

const LIQ = new Uint8Array(256);
for (const m of MATERIALS) if (m && m.kind === 'liquid') LIQ[m.id] = 1;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── frames ───────────────────────────────────────────────────────────────
type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];

// A local frame on the floor: `u` runs along the thing, `w` out toward the
// viewer (+x or +y, so its front is a face the camera sees), `h` up from z0.
// On a wall, w = -1 is the face of the slab and lower w runs into it.
type Frame = { x0: number; y0: number; z0: number; ux: number; uy: number; vx: number; vy: number };
type P3 = { x: number; y: number; z: number };

const fx = (f: Frame, u: number, w: number) => f.x0 + u * f.ux + w * f.vx;
const fy = (f: Frame, u: number, w: number) => f.y0 + u * f.uy + w * f.vy;

function put(v: Voxels, f: Frame, u: number, w: number, h: number, m: number, shade?: number, life?: number): void {
  v.put(fx(f, u, w), fy(f, u, w), f.z0 + h, m, shade, life);
}

function get(v: Voxels, f: Frame, u: number, w: number, h: number): number {
  return v.get(fx(f, u, w), fy(f, u, w), f.z0 + h);
}

function cell(v: Voxels, f: Frame, u: number, w: number, h: number): number {
  return v.idx(fx(f, u, w), fy(f, u, w), f.z0 + h);
}

// Fills [u0, u1) x [w0, w1) x [h0, h1).
function box(v: Voxels, f: Frame, u0: number, w0: number, h0: number, u1: number, w1: number, h1: number, m: number, shade?: number): void {
  for (let h = h0; h < h1; h++) {
    for (let w = w0; w < w1; w++) {
      for (let u = u0; u < u1; u++) put(v, f, u, w, h, m, shade);
    }
  }
}

// A world point (for lights and particles) at frame (u, w, h).
function at(f: Frame, u: number, w: number, h: number): P3 {
  return { x: fx(f, u, w), y: fy(f, u, w), z: f.z0 + h };
}

function wallFrame(L: Layout, wall: Side, along: number): Frame {
  return wall === 'right'
    ? { x0: along, y0: L.T, z0: L.floor, ux: 1, uy: 0, vx: 0, vy: 1 }
    : { x0: L.T, y0: along, z0: L.floor, ux: 0, uy: 1, vx: 1, vy: 0 };
}

function slotFrame(s: Slot): Frame {
  return s.wall === 'right'
    ? { x0: s.x0, y0: s.y0, z0: s.z0, ux: 1, uy: 0, vx: 0, vy: 1 }
    : { x0: s.x0, y0: s.y0, z0: s.z0, ux: 0, uy: 1, vx: 1, vy: 0 };
}

// ── effects ──────────────────────────────────────────────────────────────
function light(c: Ctx, p: P3, color: RGB, radius: number, intensity: number): void {
  if (!(intensity > 0)) return;
  c.light({ x: p.x, y: p.y, z: Math.max(0, p.z), color, radius: clamp(radius, 6, 40), intensity: Math.min(2, intensity) });
}

// Spawns a particle if it starts inside the world.
function emit(c: Ctx, p: Particle): void {
  const v = c.v;
  if (!(p.x >= 0 && p.y >= 0 && p.z >= 0 && p.x <= v.W && p.y <= v.D && p.z <= v.H && p.life > 0)) return;
  p.life = Math.min(p.life, 10);
  c.spawn(p);
}

function glint(c: Ctx, p: P3, vx: number, vy: number, vz: number, life: number, color: RGB, gravity = 0): void {
  emit(c, { kind: 'glint', x: p.x, y: p.y, z: p.z, vx, vy, vz, life, color, glow: true, gravity });
}

function puffAt(c: Ctx, f: Frame, u: number, w: number, h: number, m: number, life: number): void {
  puff(c, fx(f, u, w), fy(f, u, w), f.z0 + h, m, life);
}

// A crackling electric arc from a to b: short-lived glints along a jagged
// path, wandering most at the middle.
function arc(c: Ctx, a: P3, b: P3, jag: number, life: number): void {
  const n = Math.max(3, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / 0.7));
  let ox = 0;
  let oy = 0;
  let oz = 0;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const env = Math.sin(Math.PI * t) * 2;
    ox = ox * 0.8 + c.rng.range(-jag, jag);
    oy = oy * 0.8 + c.rng.range(-jag, jag);
    oz = oz * 0.8 + c.rng.range(-jag, jag);
    const p = { x: a.x + (b.x - a.x) * t + ox * env, y: a.y + (b.y - a.y) * t + oy * env, z: a.z + (b.z - a.z) * t + oz * env };
    glint(c, p, 0, 0, 0, life * c.rng.range(0.6, 1), c.rng.pick(ARC));
  }
}

function sparks(c: Ctx, p: P3, n: number, speed: number, colors: readonly RGB[] = SOLDER): void {
  for (let k = 0; k < n; k++) {
    emit(c, { kind: 'spark', x: p.x, y: p.y, z: p.z, vx: c.rng.range(-speed, speed), vy: c.rng.range(-speed, speed), vz: c.rng.range(speed * 0.5, speed * 1.5), life: c.rng.range(0.2, 0.5), color: c.rng.pick(colors), glow: true, gravity: 18 });
  }
}

// ── per-world state ──────────────────────────────────────────────────────
type Book = { u: number; h0: number; h1: number; m: number; shade: number };
type Chalk = { strokes: Array<[number, number]>; drawn: number; mode: 'hold' | 'erase' | 'write'; timer: number; erased: number };
type Fish = { i: number; m: number; dir: number; next: number };
type Window = { grid: Int32Array; cols: number; rows: number; p: P3 };

// What weather() animates, recorded by generate() per world.
type Fixtures = {
  lamps: Array<{ cells: number[]; p: P3; broken: boolean }>;
  clock: { f: Frame; u: number; h: number; face: Array<[number, number, number]>; last: number } | null;
  tube: number[];
  tubeLit: number[];
  windows: Window[];
  stars: number[];
  storm: { next: number; until: number; again: number };
  flasks: number[];
  blinkers: Array<{ i: number; on: number; period: number; phase: number; duty: number }>;
  vents: Array<{ p: P3; rate: number; m: number }>;
  glows: Array<{ p: P3; color: RGB; radius: number; intensity: number; pulse: number }>;
  heat: P3[];
  burners: P3[];
  boils: Array<{ i: number; mouth: P3 }>;
  tanks: Array<{ p: P3; height: number; cells: number[]; color: RGB }>;
  aquaria: Array<{ f: Frame; fish: Fish[]; ready: boolean }>;
  rats: Array<{ f: Frame; p: number; dir: number; wheel: boolean; next: number; angle: number }>;
  ladders: Frame[];
  slabs: Array<{ f: Frame; next: number; twitch: number }>;
  booms: Array<{ f: Frame }>;
  reactors: Array<{ core: P3; cells: number[]; r: number; half: number }>;
  frost: P3[];
  globes: P3[];
};

type Lab = {
  screen: number; // the workbench's last screen frame
  helix: number; // the scanner's last frame
  books: Book[];
  pulled: number; // the book pulled out, -1 for none
  chalk: Chalk | null;
  door: number; // airlock, 0 shut .. 1 open
  fx: Fixtures | null;
};

const STATE = new WeakMap<Voxels, Lab>();

function labOf(v: Voxels): Lab {
  let s = STATE.get(v);
  if (!s) {
    s = { screen: -1, helix: -1, books: [], pulled: -1, chalk: null, door: 1, fx: null };
    STATE.set(v, s);
  }
  return s;
}

function noFixtures(): Fixtures {
  return {
    lamps: [],
    clock: null,
    tube: [],
    tubeLit: [],
    windows: [],
    stars: [],
    storm: { next: 4, until: 0, again: 0 },
    flasks: [],
    blinkers: [],
    vents: [],
    glows: [],
    heat: [],
    burners: [],
    boils: [],
    tanks: [],
    aquaria: [],
    rats: [],
    ladders: [],
    slabs: [],
    booms: [],
    reactors: [],
    frost: [],
    globes: [],
  };
}

// ── glassware ────────────────────────────────────────────────────────────
// An Erlenmeyer flask on a 3 x 3 footprint at (u0, w0): a glass base, two
// layers of `liquid` walled in glass, a narrow neck. Returns the liquid.
function flask(v: Voxels, f: Frame, u0: number, w0: number, h0: number, liquid: number): number[] {
  const out: number[] = [];
  for (let du = 0; du < 3; du++) {
    for (let dw = 0; dw < 3; dw++) {
      const mid = du === 1 && dw === 1;
      const edge = du !== 1 && dw !== 1; // a corner
      put(v, f, u0 + du, w0 + dw, h0, M.GLASS, 5);
      for (let h = h0 + 1; h < h0 + 3; h++) {
        put(v, f, u0 + du, w0 + dw, h, mid ? liquid : M.GLASS, mid ? 3 : 5);
        if (mid) out.push(cell(v, f, u0 + du, w0 + dw, h));
      }
      if (!mid && !edge) for (let h = h0 + 3; h < h0 + 5; h++) put(v, f, u0 + du, w0 + dw, h, M.GLASS, 6);
    }
  }
  return out;
}

// A row of test tubes along u from u0: glass in front and behind, liquid
// in every other column, dividers sticking up between them.
function tubeRack(v: Voxels, f: Frame, u0: number, n: number, w0: number, h0: number, rng: Rng, flasks: number[]): void {
  for (let i = 0; i <= 2 * n; i++) {
    const u = u0 + i;
    const tube = (i & 1) === 1;
    for (let h = h0; h < h0 + 2; h++) {
      put(v, f, u, w0, h, M.GLASS, 5);
      put(v, f, u, w0 + 2, h, M.GLASS, 5);
      if (tube) {
        const liquid = rng.pick(REAGENTS);
        put(v, f, u, w0 + 1, h, liquid, 3);
        flasks.push(cell(v, f, u, w0 + 1, h));
      } else {
        put(v, f, u, w0 + 1, h, M.GLASS, 5);
      }
    }
    if (!tube) put(v, f, u, w0 + 1, h0 + 2, M.GLASS, 6);
  }
}

// A potted plant in a size x size footprint, `tall` high: a terracotta pot,
// a stem and a crown of leaves (a mutant one has glowing pods).
function plant(v: Voxels, f: Frame, u0: number, w0: number, size: number, tall: number, rng: Rng, mutant = false): void {
  const c = (size - 1) / 2;
  const pu = u0 + Math.floor(c) - 1;
  const pw = w0 + Math.floor(c) - 1;
  box(v, f, pu, pw, 0, pu + 3, pw + 3, 2, M.BRICK, 3);
  for (let du = 0; du < 3; du++) for (let dw = 0; dw < 3; dw++) put(v, f, pu + du, pw + dw, 2, du === 1 && dw === 1 ? M.DIRT : M.BRICK, 6);
  for (let h = 3; h < tall - 2; h++) put(v, f, pu + 1, pw + 1, h, M.WOOD, 2);
  const r = c + 0.6;
  const hc = tall - Math.max(2, (tall - 4) / 2);
  const rh = Math.max(2, (tall - 4) / 2);
  for (let h = 4; h <= tall; h++) {
    for (let w = w0; w < w0 + size; w++) {
      for (let u = u0; u < u0 + size; u++) {
        const e = ((u - u0 - c) / r) ** 2 + ((w - w0 - c) / r) ** 2 + ((h - hc) / rh) ** 2;
        if (e > 1 || !rng.chance(0.85 - e * 0.35)) continue;
        if (mutant && e > 0.55 && rng.chance(0.18)) put(v, f, u, w, h, M.FUNGUS, 6);
        else put(v, f, u, w, h, M.LEAF, clamp(Math.round(2 + (h - 4) * 0.5 + rng.int(-1, 1)), 0, 7));
      }
    }
  }
}

// ── posters and signs ────────────────────────────────────────────────────
// Pixel art pinned flush in a wall face, top row first.
const INK: Record<string, number> = {
  W: M.PAPER,
  K: DARK,
  Y: M.GOLD_ORE,
  O: M.BRIMSTONE,
  R: M.CLOTH,
  T: M.PLASTIC,
  G: M.LEAF,
  C: M.ROCK,
  B: M.BRICK,
  A: M.CANDLE,
  N: M.NEON_GREEN,
  S: M.METAL,
};

type PosterKind = 'volt' | 'radiation' | 'bio' | 'chart' | 'molecule' | 'notice' | 'first' | 'exit';

const POSTERS: Record<PosterKind, readonly string[]> = {
  volt: ['...K...', '..KYK..', '..YKY..', '.KYKYK.', '.YYKYY.', 'KKKKKKK'],
  radiation: ['KKKKKKK', 'KYYYYYK', 'KYKYKYK', 'KYYKYYK', 'KYKKKYK', 'KYYYYYK', 'KKKKKKK'],
  bio: ['OKO', 'KOK', 'OKO'],
  chart: ['WWWWWW', 'WKWWWW', 'WKWWTW', 'WKWOTW', 'WKROTW', 'WKROTW', 'WKKKKW', 'WWWWWW'],
  molecule: ['WWWWWWW', 'WRKWWTW', 'WWKKKWW', 'WWWKWWW', 'WTKKWRW', 'WWWWKWW', 'WWWWWWW'],
  notice: ['TTTTTT', 'TTTTTT', 'WWWWWW', 'WKKKWW', 'WWWWWW', 'WKKKKW', 'WKKWWW', 'WWWWWW'],
  first: ['NNN', 'NAN', 'ANA', 'NAN'],
  exit: ['NNNNNN', 'NKNKNN', 'NNNNNN'],
};

function poster(v: Voxels, f: Frame, kind: PosterKind, u0: number, h0: number): void {
  const art = POSTERS[kind];
  art.forEach((row, r) => {
    for (let i = 0; i < row.length; i++) {
      const m = INK[row[i]];
      if (m === undefined) continue;
      put(v, f, u0 + i, -1, h0 + art.length - 1 - r, m, row[i] === 'W' ? 7 : 5);
    }
  });
}

const posterSize = (k: PosterKind) => ({ w: POSTERS[k][0].length, h: POSTERS[k].length });

// A periodic table, 13 x 8: an 11-column table of coloured cells on paper.
function periodicTable(v: Voxels, f: Frame, u0: number, h0: number): void {
  const GROUPS = [M.CLOTH, M.BRIMSTONE, M.GOLD_ORE, M.GOLD_ORE, M.GOLD_ORE, M.GOLD_ORE, M.ROCK, M.ROCK, M.LEAF, M.PLASTIC, M.MOSS];
  const shape = (r: number, k: number) =>
    r === 0 ? k === 0 || k === 10 : r <= 2 ? k <= 1 || k >= 6 : r <= 4 ? true : r === 5 ? false : k >= 2 && k <= 9;
  for (let j = 0; j < 8; j++) {
    for (let i = 0; i < 13; i++) {
      const r = 6 - j;
      const k = i - 1;
      const inside = i > 0 && i < 12 && j > 0 && j < 7;
      const lit = inside && shape(r, k);
      const m = lit ? (r === 6 ? M.BRICK : GROUPS[k]) : M.PAPER;
      put(v, f, u0 + i, -1, h0 + j, m, lit ? 4 + ((i + j) & 1) : 7);
    }
  }
}

// ── props ────────────────────────────────────────────────────────────────

// write: a workbench with a monitor full of code, a keyboard, a desk lamp
// and a soldering station. Working it scrolls the code and spits solder
// sparks off the circuit board.
function workbench(): Prop {
  const TOP = 4; // the bench top
  const ROWS = 4; // screen rows, TOP+2 .. TOP+5
  const CODE = [M.SCREEN, M.SCREEN, M.NEON_GREEN, M.SCREEN, M.LED_AMBER];
  // One line of code on the 5-pixel screen; returns where it ends.
  const line = (n: number, out: number[]): number => {
    const indent = Math.floor(hash3(77, n, 0, 1) * 3);
    const len = hash3(77, n, 0, 2) < 0.15 ? 0 : 1 + Math.floor(hash3(77, n, 0, 3) * (5 - indent));
    const col = CODE[Math.floor(hash3(77, n, 0, 4) * CODE.length)];
    for (let i = 0; i < 5; i++) out[i] = i >= indent && i < indent + len ? (i === indent ? M.SCREEN : col) : DARK;
    return indent + len;
  };
  const draw = (v: Voxels, f: Frame, scroll: number, cursor: boolean) => {
    const row = [0, 0, 0, 0, 0];
    for (let r = 0; r < ROWS; r++) {
      const end = line(scroll + r, row);
      if (cursor && r === ROWS - 1 && end < 5) row[end] = M.SCREEN;
      for (let i = 0; i < 5; i++) put(v, f, 3 + i, 1, TOP + 1 + ROWS - r, row[i], row[i] === DARK ? 1 : 6);
    }
  };
  return {
    name: 'workbench',
    build(v, s) {
      const f = slotFrame(s);
      const n = s.len;
      box(v, f, 0, 0, 0, 4, 6, TOP, M.PLASTIC, 4); // drawers
      box(v, f, 0, 5, 0, 4, 6, 1, DARK, 3);
      box(v, f, 0, 5, 2, 4, 6, 3, M.PLASTIC, 1);
      for (const h of [1, 3]) box(v, f, 1, 5, h, 3, 6, h + 1, M.METAL, 7);
      for (const w of [0, 5]) box(v, f, n - 1, w, 0, n, w + 1, TOP, M.METAL, 3);
      box(v, f, 4, 4, 1, n - 1, 5, 2, M.METAL, 5); // foot rail
      box(v, f, 0, 0, TOP, n, 6, TOP + 1, DARK, 3);
      box(v, f, 0, 5, TOP, n, 6, TOP + 1, DARK, 6);
      // the monitor
      box(v, f, 3, 0, TOP + 2, 8, 1, TOP + 6, DARK, 1);
      box(v, f, 2, 1, TOP + 1, 9, 2, TOP + 7, DARK, 3);
      put(v, f, 5, 0, TOP + 1, M.METAL, 4);
      draw(v, f, 0, false);
      // keyboard, circuit board, soldering station
      for (let u = 3; u < 8; u++) put(v, f, u, 3, TOP + 1, u & 1 ? M.METAL : M.TILE, 6);
      box(v, f, 8, 3, TOP + 1, 10, 5, TOP + 2, M.MOSS, 5);
      put(v, f, 9, 3, TOP + 2, DARK, 2);
      put(v, f, 8, 4, TOP + 2, M.LED_RED, 6);
      box(v, f, 9, 0, TOP + 1, 11, 2, TOP + 3, M.METAL, 3);
      put(v, f, 10, 1, TOP + 2, M.LED_RED, 7);
      put(v, f, 9, 2, TOP + 1, M.ROCK, 6); // a reel of solder
      // desk lamp, papers, a stool
      for (let h = TOP + 1; h < TOP + 6; h++) put(v, f, 0, 1, h, M.METAL, 4);
      put(v, f, 1, 1, TOP + 6, M.METAL, 5);
      put(v, f, 1, 2, TOP + 6, M.METAL, 6);
      put(v, f, 2, 2, TOP + 6, M.METAL, 6);
      put(v, f, 1, 2, TOP + 5, M.LAMP, 7);
      put(v, f, 0, 3, TOP + 1, M.PAPER, 6);
      put(v, f, 1, 3, TOP + 1, M.PAPER, 4);
      put(v, f, 0, 4, TOP + 1, M.PAPER, 7);
      put(v, f, 0, 3, TOP + 2, M.PAPER, 5);
      for (let h = 0; h < 3; h++) put(v, f, 7, 6, h, M.METAL, 3);
      box(v, f, 6, 6, 3, 9, 7, 4, M.PLASTIC, 6);
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const S = labOf(c.v);
      const scroll = active ? Math.floor(c.t * 7) : Math.floor(c.t / 4);
      const cursor = !active && Math.floor(c.t * 2) % 2 === 0;
      const key = scroll * 2 + (cursor ? 1 : 0) + (active ? 0.5 : 0);
      if (S.screen !== key) {
        S.screen = key;
        draw(c.v, f, scroll, cursor);
      }
      light(c, at(f, 5.5, 3, TOP + 4), SCREEN_GLOW, active ? 14 : 11, active ? 0.45 + 0.08 * Math.sin(c.t * 9) : 0.28);
      light(c, at(f, 1.5, 2.5, TOP + 4.5), WARM, 13, 0.45);
      if (!active) return;
      const p = at(f, 8.5, 4.5, TOP + 2.3);
      if (c.t % 0.35 < 0.08) light(c, p, SOLDER[0], 10, 0.9);
      if (beat(c, 0.35)) sparks(c, p, c.rng.int(3, 6), 3);
      if (c.rng.chance(c.dt * 1.2)) puffAt(c, f, 8, 4, TOP + 3, M.STEAM, 30);
    },
  };
}

// read: a tall bookshelf of ring binders, specimen jars and a model skull.
// Reading pulls a binder out now and then and lifts glowing notes off it.
function bookshelf(): Prop {
  const BOARDS = [0, 5, 10, 14, 18];
  const TOP = BOARDS[BOARDS.length - 1];
  const BINDERS = [M.PLASTIC, M.CLOTH, M.GOLD_ORE, DARK, M.PAPER, M.BRIMSTONE, M.TILE, M.PLASTIC, M.WOOD];
  // A jar of something on a glass base, lidded, 3 wide.
  const jar = (v: Voxels, f: Frame, u: number, h0: number, room: number, rng: Rng) => {
    const liquid = rng.pick(REAGENTS);
    const eye = rng.chance(0.3);
    const lid = h0 + room - 1;
    for (let h = h0; h <= lid; h++) {
      for (let a = u; a < u + 3; a++) {
        for (let w = 1; w <= 3; w++) {
          const mid = a === u + 1 && w === 2;
          if (h === h0) put(v, f, a, w, h, M.GLASS, 5);
          else if (h === lid) put(v, f, a, w, h, M.METAL, mid ? 6 : 4);
          else if (!mid) put(v, f, a, w, h, M.GLASS, 5);
          else put(v, f, a, w, h, eye && h === h0 + 1 ? M.TILE : liquid, 4);
        }
      }
    }
  };
  // Slides a binder out a voxel, or back in.
  const slide = (v: Voxels, f: Frame, b: Book, out: boolean) => {
    if (get(v, f, b.u, 2, b.h0) !== b.m) return;
    for (let h = b.h0; h < b.h1; h++) {
      put(v, f, b.u, 1, h, out ? M.AIR : b.m, b.shade);
      put(v, f, b.u, 3, h, out ? b.m : M.AIR, b.shade);
    }
  };
  return {
    name: 'bookshelf',
    build(v, s, rng) {
      const f = slotFrame(s);
      const n = s.len;
      const B = s.dep;
      box(v, f, 1, 0, 0, n - 1, 1, TOP, M.WOOD, 1);
      for (const u of [0, n - 1]) box(v, f, u, 0, 0, u + 1, B, TOP + 1, M.WOOD, 3);
      for (const h of BOARDS) box(v, f, 0, 0, h, n, B, h + 1, M.WOOD, 5);
      const books: Book[] = [];
      let skull = false;
      for (let k = 0; k + 1 < BOARDS.length; k++) {
        const h0 = BOARDS[k] + 1;
        const room = BOARDS[k + 1] - h0;
        for (let u = 1; u < n - 1; ) {
          const r = rng.next();
          if (r < 0.07) {
            u++;
          } else if (r < 0.17 && u + 3 <= n - 1) {
            jar(v, f, u, h0, room, rng);
            u += 3;
          } else if (r < 0.24 && !skull && k === BOARDS.length - 2 && u + 2 <= n - 1) {
            box(v, f, u, 1, h0, u + 2, 3, h0 + 2, M.BONE, 6);
            put(v, f, u, 2, h0 + 1, DARK, 0);
            put(v, f, u + 1, 2, h0 + 1, DARK, 0);
            skull = true;
            u += 2;
          } else if (r < 0.34) {
            const w = Math.min(rng.int(2, 3), n - 1 - u);
            for (let i = rng.int(1, 2) - 1; i >= 0; i--) box(v, f, u, 1, h0 + i, u + w, 3, h0 + i + 1, rng.pick(BINDERS), rng.int(2, 6));
            u += w;
          } else {
            const m = rng.pick(BINDERS);
            const shade = rng.int(2, 6);
            const h1 = h0 + Math.max(2, room - rng.int(0, 1));
            box(v, f, u, 1, h0, u + 1, 3, h1, m, shade);
            books.push({ u, h0, h1, m, shade });
            u++;
          }
        }
      }
      // on top: an archive box and a pile of paper
      box(v, f, 2, 0, TOP + 1, 5, 3, TOP + 3, M.CANDLE, 5);
      box(v, f, 3, 2, TOP + 2, 4, 3, TOP + 3, M.PLASTIC, 5);
      box(v, f, n - 4, 1, TOP + 1, n - 2, 3, TOP + 2, M.PAPER, 6);
      const S = labOf(v);
      S.books = books;
      S.pulled = -1;
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const S = labOf(c.v);
      const pick = Math.floor(hash3(5, Math.floor(c.t / 1.6), 0, 0) * S.books.length);
      const target = active && S.books.length && c.t % 1.6 < 1 ? pick : -1;
      if (target !== S.pulled) {
        if (S.pulled >= 0) slide(c.v, f, S.books[S.pulled], false);
        if (target >= 0) slide(c.v, f, S.books[target], true);
        S.pulled = target;
      }
      if (!active) return;
      light(c, at(f, s.len / 2, s.dep + 1, 9), RUNES[0], 12, 0.25 + 0.06 * Math.sin(c.t * 3));
      if (!c.rng.chance(c.dt * 5)) return;
      const sp = c.rng.range(0.4, 1.2);
      const p = at(f, c.rng.range(1, s.len - 1), s.dep, c.rng.range(2, 16));
      emit(c, { kind: 'rune', ...p, vx: f.vx * sp + c.rng.range(-0.3, 0.3), vy: f.vy * sp + c.rng.range(-0.3, 0.3), vz: c.rng.range(1.2, 2.5), life: c.rng.range(1.2, 2), color: c.rng.pick(RUNES), glow: true, gravity: -0.5 });
    },
  };
}

// search: a DNA scanner: a cabinet of status lamps, a tall display with a
// double helix turning on it, a rack of test tubes and a microscope.
// Searching spins the helix and sweeps a scan line down it.
function dnaScanner(): Prop {
  const CTR = 4; // counter top
  const S0 = 8; // screen rows S0 .. S1-1
  const S1 = 18;
  const LEDS = [M.LED_RED, M.LED_AMBER, M.NEON_GREEN, M.NEON_CYAN];
  const draw = (v: Voxels, f: Frame, q: number, scan: number) => {
    for (let j = 0; j < S1 - S0; j++) {
      const th = j * 0.8 + q * 0.35;
      const sn = Math.sin(th);
      const a = Math.round(2.5 + 2.45 * sn);
      const b = Math.round(2.5 - 2.45 * sn);
      const front = Math.cos(th) >= 0;
      for (let i = 0; i < 6; i++) {
        let m: number = DARK;
        let sh = 1;
        if (i === a && (front || i !== b)) {
          m = M.SCREEN;
          sh = front ? 7 : 2;
        } else if (i === b) {
          m = M.NEON_PINK;
          sh = front ? 2 : 7;
        } else if ((j & 1) === 0 && i > Math.min(a, b) && i < Math.max(a, b)) {
          m = M.SCREEN;
          sh = 0;
        } else if (j === scan) {
          m = M.LED_AMBER;
          sh = 4;
        }
        put(v, f, 2 + i, 1, S0 + j, m, sh);
      }
    }
  };
  return {
    name: 'DNA scanner',
    build(v, s, rng) {
      const f = slotFrame(s);
      const n = s.len;
      const B = s.dep;
      box(v, f, 0, 0, 0, n, B, CTR, M.METAL, 4);
      box(v, f, 0, B - 1, 0, n, B, 1, DARK, 2);
      for (const u of [4, 8]) box(v, f, u, B - 1, 1, u + 1, B, CTR - 1, M.METAL, 2);
      for (let u = 1; u < n - 1; u += 2) put(v, f, u, B - 1, CTR - 1, LEDS[(u >> 1) % LEDS.length], 6);
      box(v, f, 0, 0, CTR, n, B, CTR + 1, M.TILE, 6);
      // the display: casing, steel bezel, screen, a status bar on top
      box(v, f, 1, 0, CTR + 1, 9, 1, S1 + 1, DARK, 2);
      box(v, f, 1, 1, CTR + 1, 9, 2, S0 - 1, DARK, 1);
      box(v, f, 1, 1, S0 - 1, 9, 2, S1 + 1, M.METAL, 5);
      for (let u = 3; u < 7; u++) put(v, f, u, 1, S1 + 1, M.NEON_CYAN, 6);
      draw(v, f, 0, -1);
      // test tubes in front of it, backed by the display's foot
      const fl = labOf(v).fx?.flasks ?? [];
      for (let u = 2; u <= 8; u++) {
        const tube = (u & 1) === 1;
        const liquid = rng.pick(REAGENTS);
        for (let h = CTR + 1; h < CTR + 3; h++) {
          put(v, f, u, 3, h, M.GLASS, 5);
          put(v, f, u, 2, h, tube ? liquid : M.GLASS, tube ? 3 : 5);
          if (tube) fl.push(cell(v, f, u, 2, h));
        }
        if (!tube) put(v, f, u, 2, CTR + 3, M.GLASS, 6);
      }
      // the microscope
      box(v, f, 9, 1, CTR + 1, 12, 3, CTR + 2, M.METAL, 3);
      for (let h = CTR + 2; h < CTR + 7; h++) put(v, f, 11, 1, h, M.METAL, 4);
      put(v, f, 9, 2, CTR + 2, M.LAMP, 7);
      box(v, f, 9, 1, CTR + 3, 11, 3, CTR + 4, M.METAL, 6);
      put(v, f, 9, 2, CTR + 4, M.GLASS, 7);
      put(v, f, 9, 2, CTR + 5, DARK, 3);
      put(v, f, 10, 1, CTR + 6, M.METAL, 5);
      put(v, f, 10, 2, CTR + 6, M.METAL, 5);
      put(v, f, 9, 2, CTR + 6, M.METAL, 5);
      put(v, f, 10, 1, CTR + 7, DARK, 2);
      put(v, f, 10, 0, CTR + 8, DARK, 4);
      poster(v, f, 'bio', 9, 14);
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const S = labOf(c.v);
      const q = Math.floor(c.t * (active ? 12 : 4));
      if (S.helix !== q) {
        S.helix = q;
        draw(c.v, f, q, active ? q % (S1 - S0) : -1);
      }
      const k = Math.floor(c.t * (active ? 6 : 1.5));
      for (let u = 1; u < s.len - 1; u += 2) {
        const m = LEDS[(u >> 1) % LEDS.length];
        const cur = get(c.v, f, u, s.dep - 1, CTR - 1);
        if (cur !== m && cur !== DARK) continue;
        const on = hash3(9, u, k, 0) < (active ? 0.6 : 0.8);
        put(c.v, f, u, s.dep - 1, CTR - 1, on ? m : DARK, on ? 6 : 2);
      }
      const tint = mix(SCREEN_GLOW, HELIX_PINK, 0.3 + 0.3 * Math.sin(c.t * 2));
      light(c, at(f, 5, 3, 13), tint, active ? 16 : 12, active ? 0.45 + 0.15 * Math.sin(c.t * 6) : 0.25);
      if (active) light(c, at(f, 9.5, 3, CTR + 3), COOL, 8, 0.35);
    },
  };
}

// run: a tesla coil inside a hazard-striped square out on the floor:
// copper windings under a steel toroid, a grounding ball on a post and a
// control box. Running it throws arcs to the ball, the floor and the air,
// with flashes and sparks.
function teslaCoil(): Prop {
  const C = 5; // centre (u, w)
  const BALL = { u: 1, w: 8, h: 9 };
  const colTop = (v: Voxels, s: Slot) => clamp(v.H - s.z0 - 12, 12, 15);
  return {
    name: 'tesla coil',
    build(v, s) {
      const f = slotFrame(s);
      const top = colTop(v, s);
      for (let w = 0; w < s.dep; w++) {
        for (let u = 0; u < s.len; u++) {
          if (u <= 1 || u >= s.len - 2 || w >= s.dep - 2) put(v, f, u, w, -1, ((u + w) >> 1) & 1 ? M.GOLD_ORE : DARK, 4);
          const d = Math.hypot(u - C, w - C);
          if (d <= 3.2) put(v, f, u, w, 0, M.METAL, 2);
          if (d <= 2.7) put(v, f, u, w, 1, M.METAL, 5);
          if (d >= 1.8 && d <= 3.1) put(v, f, u, w, 2, M.ROCK, Math.round(Math.atan2(w - C, u - C) * 3) & 1 ? 6 : 3);
          if (d <= 1.5) for (let h = 2; h < top; h++) put(v, f, u, w, h, h & 1 ? M.ROCK : M.ROCK_DARK, h & 1 ? 6 : 4);
          for (let dh = -1; dh <= 1; dh++) if ((d - 3) ** 2 + dh * dh <= 1.25) put(v, f, u, w, top + 1 + dh, M.METAL, dh > 0 ? 7 : dh === 0 ? 6 : 4);
        }
      }
      put(v, f, C, C, top, M.METAL, 6);
      put(v, f, C, C, top + 1, M.METAL, 6);
      put(v, f, C, C, top + 2, M.METAL, 7);
      // grounding post and ball
      for (let h = 0; h < BALL.h - 1; h++) put(v, f, BALL.u, BALL.w, h, M.METAL, 3);
      for (let dh = -1; dh <= 1; dh++) {
        for (let dw = -1; dw <= 1; dw++) {
          for (let du = -1; du <= 1; du++) if (du * du + dw * dw + dh * dh <= 1.6) put(v, f, BALL.u + du, BALL.w + dw, BALL.h + dh, M.METAL, dh > 0 ? 7 : 6);
        }
      }
      // control box with a knife switch, cable run in the floor
      box(v, f, 8, 0, 0, 11, 2, 6, M.METAL, 3);
      box(v, f, 8, 0, 5, 11, 2, 6, M.METAL, 6);
      put(v, f, 9, 1, 4, M.LED_AMBER, 6);
      put(v, f, 8, 1, 3, M.SCREEN, 5);
      put(v, f, 10, 2, 3, DARK, 2);
      put(v, f, 10, 2, 4, M.CLOTH, 5);
      for (let u = 6; u <= 7; u++) put(v, f, u, 1, -1, DARK, 1);
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const top = colTop(c.v, s);
      const crown = at(f, C + 0.5, C + 0.5, top + 1.5);
      const led = get(c.v, f, 9, 1, 4);
      const on = !active || Math.floor(c.t * 4) % 2 === 0;
      if (led === M.LED_AMBER || led === DARK) put(c.v, f, 9, 1, 4, on ? M.LED_AMBER : DARK, 6);
      if (!active) {
        light(c, crown, ARC[2], 10, 0.12 + 0.05 * Math.sin(c.t * 5));
        if (c.rng.chance(c.dt * 1.5)) {
          const a = c.rng.range(0, Math.PI * 2);
          glint(c, { x: crown.x + 4 * Math.cos(a), y: crown.y + 4 * Math.sin(a), z: crown.z }, 0, 0, 0.5, 0.12, ARC[1]);
        }
        return;
      }
      light(c, crown, ARC[1], 20, 0.45 + 0.15 * Math.sin(c.t * 23));
      if (!c.rng.chance(c.dt * 14)) return;
      // any way round: nothing stands behind it out here
      const phi = c.rng.range(0, 2 * Math.PI);
      const cos = Math.cos(phi);
      const sin = Math.sin(phi);
      const from = at(f, C + 0.5 + 4 * cos, C + 0.5 + 4 * sin, top + 1.5);
      const r = c.rng.next();
      let to: P3;
      let strike = true;
      if (r < 0.4) {
        to = at(f, BALL.u + 0.5, BALL.w + 0.5, BALL.h + 0.5);
      } else if (r < 0.7) {
        const rr = c.rng.range(5.5, 7);
        to = at(f, C + 0.5 + rr * cos, C + 0.5 + rr * sin, 0.1);
      } else {
        const rr = c.rng.range(6, 8.5);
        to = at(f, C + 0.5 + rr * cos, C + 0.5 + rr * sin, top + 1.5 + c.rng.range(-5, 3));
        strike = false;
      }
      arc(c, from, to, 0.6, 0.12);
      light(c, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2, z: (from.z + to.z) / 2 }, ARC[0], 28, c.rng.range(0.9, 1.4));
      if (strike) sparks(c, to, c.rng.int(4, 8), 4, ARC);
    },
  };
}

// web: a radio set on a cabinet with a lattice mast standing on it,
// dipoles, a dish and a red beacon. Browsing blinks the beacon fast and
// sends rings of signal out from the top.
function radioMast(): Prop {
  const mastTop = (v: Voxels, s: Slot) => clamp(v.H - s.z0 - 8, 14, 18);
  const DIAL = 4; // the dial's top row
  return {
    name: 'radio mast',
    build(v, s) {
      const f = slotFrame(s);
      const top = mastTop(v, s);
      box(v, f, 1, 0, 0, 8, 5, 6, M.WOOD, 3);
      box(v, f, 1, 0, 6, 8, 5, 7, M.WOOD, 6);
      box(v, f, 1, 4, 0, 8, 5, 1, M.WOOD, 1);
      for (let u = 2; u <= 4; u++) for (let h = 1; h <= 4; h++) put(v, f, u, 4, h, (u + h) & 1 ? DARK : M.WOOD, 1);
      box(v, f, 5, 4, DIAL - 1, 7, 5, DIAL + 1, M.LED_AMBER, 5);
      put(v, f, 5, 4, 1, M.METAL, 7);
      put(v, f, 6, 4, 1, M.METAL, 7);
      put(v, f, 6, 3, 7, M.METAL, 4); // a microphone
      put(v, f, 6, 3, 8, DARK, 3);
      // the mast, dipoles, beacon
      // a lattice: braces zigzag up the four faces
      for (let h = 7; h <= top; h++) {
        for (let u = 3; u <= 4; u++) for (let w = 1; w <= 2; w++) if (h % 3 === 0 || (u + w + h) % 2 === 0) put(v, f, u, w, h, M.METAL, (h + u + w) & 1 ? 3 : 6);
      }
      for (const [dh, half] of [[2, 3], [6, 2], [10, 1]] as const) {
        const h = top - dh;
        if (h <= 8) continue;
        for (let u = 3 - half; u <= 4 + half; u++) put(v, f, u, 1, h, M.METAL, 6);
      }
      put(v, f, 3, 1, top + 1, M.LED_RED, 7);
      put(v, f, 3, 1, top + 2, M.METAL, 6);
      // a dish facing the room
      const dh0 = Math.min(top - 5, 13);
      for (let dh = -2; dh <= 2; dh++) {
        for (let du = -2; du <= 2; du++) {
          const d = Math.hypot(du, dh);
          if (d <= 2.3) put(v, f, 4 + du, 3, dh0 + dh, M.METAL, d < 1 ? 3 : d < 1.8 ? 5 : 7);
        }
      }
      put(v, f, 4, 4, dh0, M.METAL, 2);
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const top = mastTop(c.v, s);
      const on = active ? Math.floor(c.t * 4) % 2 === 0 : c.t % 1.6 < 0.3;
      const cur = get(c.v, f, 3, 1, top + 1);
      if (cur === M.LED_RED || cur === DARK) put(c.v, f, 3, 1, top + 1, on ? M.LED_RED : DARK, on ? 7 : 2);
      if (on) light(c, at(f, 3.5, 1.5, top + 1.5), RED, active ? 14 : 9, active ? 0.75 : 0.45);
      const needle = active ? 5 + (Math.floor(c.t * 3) % 2) : 5;
      for (const u of [5, 6]) {
        const m = get(c.v, f, u, 4, DIAL);
        if (m === M.LED_AMBER || m === DARK) put(c.v, f, u, 4, DIAL, u === needle ? DARK : M.LED_AMBER, u === needle ? 1 : 5);
      }
      light(c, at(f, 6, 5, DIAL), AMBER, 7, 0.25);
      if (!active) return;
      if (beat(c, 0.5)) {
        const p = at(f, 4, 2, top + 1);
        const color = Math.floor(c.t * 2) % 2 ? AQUA : AMBER;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          glint(c, p, Math.cos(a) * 5, Math.sin(a) * 5, 0, 0.9, color);
        }
      }
      if (c.rng.chance(c.dt * 4)) glint(c, at(f, c.rng.range(0, 8), 1.5, top - 2 + 0.5), 0, 0, 0.6, 0.4, AQUA);
    },
  };
}

// think: a rolling chalkboard out on the floor, thick with scribbled
// working and a little graph: the board in a frame on two splayed feet
// with castors, a tray of chalk, and a model atom on a stand whose
// electrons never stop. Thinking wipes the board and writes it all out
// again.
function chalkboard(): Prop {
  const H0 = 3; // the frame's bottom row
  const H1 = 16; // ...and top
  const BW = 2; // the board's w (the feet reach two either side)
  const ATOM = { u: 9, w: 5, h: 7 }; // the atom's centre
  const ORBITS: ReadonlyArray<readonly [readonly [number, number, number], readonly [number, number, number]]> = [
    [[1, 0, 0], [0, 0.5, 0.87]],
    [[0, 1, 0], [0.87, 0, 0.5]],
    [[0.71, -0.71, 0], [0.35, 0.35, 0.87]],
  ];
  // Handwriting: lines of glyph columns, then a graph in the bottom right.
  const scribble = (rng: Rng): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    [14, 11, 8, 6, 4].forEach((h, k) => {
      let u = 1 + (k & 1);
      const end = k >= 2 ? 6 : 10;
      while (u <= end) {
        for (let g = rng.int(1, 3); g > 0 && u <= end; g--, u++) {
          const bits = rng.int(1, 3);
          if (bits & 1) out.push([u, h]);
          if (bits & 2) out.push([u, h - 1]);
          if (rng.chance(0.15)) out.push([u, h + 1]);
        }
        u++;
      }
    });
    for (let h = 9; h >= 4; h--) out.push([7, h]);
    for (let u = 8; u <= 10; u++) out.push([u, 4]);
    out.push([8, 5], [9, 6], [9, 7], [10, 9]);
    return out;
  };
  return {
    name: 'chalkboard',
    build(v, s, rng) {
      const f = slotFrame(s);
      const n = s.len;
      // the frame: two uprights on splayed feet with castors, and the board
      for (const u of [0, n - 1]) {
        box(v, f, u, BW - 2, 1, u + 1, BW + 3, 2, M.METAL, 4);
        for (const w of [BW - 2, BW + 2]) put(v, f, u, w, 0, DARK, 1);
        for (let h = 2; h <= H1; h++) put(v, f, u, BW, h, M.METAL, 3);
      }
      box(v, f, 1, BW, H0, n - 1, BW + 1, H0 + 1, M.WOOD, 4);
      box(v, f, 0, BW, H1, n, BW + 1, H1 + 1, M.WOOD, 6);
      for (let h = H0 + 1; h < H1; h++) for (let u = 1; u < n - 1; u++) put(v, f, u, BW, h, M.MOSS, rng.chance(0.12) ? 5 : rng.int(2, 3));
      box(v, f, 1, BW + 1, H0, n - 1, BW + 2, H0 + 1, M.WOOD, 6);
      put(v, f, 3, BW + 1, H0 + 1, M.CANDLE, 7);
      put(v, f, 4, BW + 1, H0 + 1, M.GOLD_ORE, 6);
      put(v, f, 7, BW + 1, H0 + 1, M.CLOTH, 3); // the duster
      put(v, f, 8, BW + 1, H0 + 1, M.CLOTH, 3);
      const strokes = scribble(rng).filter(([u, h]) => u >= 1 && u <= n - 2 && h > H0 && h < H1);
      for (const [u, h] of strokes) put(v, f, u, BW, h, M.PAPER, 6 + ((u + h) & 1));
      labOf(v).chalk = { strokes, drawn: strokes.length, mode: 'hold', timer: 0, erased: 0 };
      // a model atom on a stand in front of the board
      box(v, f, ATOM.u - 1, ATOM.w - 1, 0, ATOM.u + 2, ATOM.w + 2, 1, M.METAL, 3);
      for (let h = 1; h < ATOM.h - 1; h++) put(v, f, ATOM.u, ATOM.w, h, M.METAL, 5);
      for (let du = 0; du < 2; du++) {
        for (let dw = 0; dw < 2; dw++) for (let dh = 0; dh < 2; dh++) put(v, f, ATOM.u + du - 1, ATOM.w + dw - 1, ATOM.h - 1 + dh, (du + dw + dh) & 1 ? M.CLOTH : M.PLASTIC, 6);
      }
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const centre = at(f, ATOM.u, ATOM.w, ATOM.h);
      const spin = c.t * (active ? 5 : 2);
      ORBITS.forEach(([e1, e2], k) => {
        const a = spin + k * 2.1;
        const ca = Math.cos(a) * 2.6;
        const sa = Math.sin(a) * 2.6;
        glint(c, { x: centre.x + ca * e1[0] + sa * e2[0], y: centre.y + ca * e1[1] + sa * e2[1], z: centre.z + ca * e1[2] + sa * e2[2] }, 0, 0, 0, 0.06, AQUA);
      });
      const st = labOf(c.v).chalk;
      if (!st || !active) return;
      st.timer += c.dt;
      if (st.mode === 'hold') {
        if (st.timer > 2.5) {
          st.mode = 'erase';
          st.timer = 0;
          st.erased = 0;
        }
      } else if (st.mode === 'erase') {
        const col = Math.min(s.len - 2, Math.floor(st.timer * 10));
        while (st.erased < col) {
          const u = ++st.erased;
          for (let h = H0 + 1; h < H1; h++) if (get(c.v, f, u, BW, h) === M.PAPER) put(c.v, f, u, BW, h, M.MOSS, 5);
          glint(c, at(f, u + 0.5, BW + 1, c.rng.range(H0 + 2, H1 - 1)), 0, 0, -0.5, 0.6, CHALK, 3);
        }
        if (st.erased >= s.len - 2) {
          st.mode = 'write';
          st.timer = 0;
          st.drawn = 0;
        }
      } else {
        const want = Math.min(st.strokes.length, Math.floor(st.timer * 16));
        while (st.drawn < want) {
          const [u, h] = st.strokes[st.drawn++];
          if (get(c.v, f, u, BW, h) === M.MOSS) put(c.v, f, u, BW, h, M.PAPER, 6 + ((u + h) & 1));
        }
        if (st.drawn > 0 && c.rng.chance(c.dt * 6)) {
          const [u, h] = st.strokes[st.drawn - 1];
          glint(c, at(f, u + 0.5, BW + 1, h + 0.5), 0, 0, -0.3, 0.7, CHALK, 3);
        }
        if (st.drawn > 0) {
          const [u, h] = st.strokes[st.drawn - 1];
          light(c, at(f, u + 0.5, BW + 1.5, h), CHALK, 7, 0.2);
        }
        if (st.drawn >= st.strokes.length) {
          st.mode = 'hold';
          st.timer = 0;
        }
      }
    },
  };
}

// idle: the coffee corner, a low kitchen island out on the floor: teal
// cupboards and an under-counter fridge, an espresso machine, a carafe on
// a hot plate and a stack of mugs on top; in front an orange sofa under a
// floor lamp, and a plant. Idling brews: coffee drips into the mug and the
// machine steams.
function coffeeCorner(): Prop {
  const CT = 4; // counter top
  return {
    name: 'coffee corner',
    build(v, s, rng) {
      const f = slotFrame(s);
      const n = s.len;
      box(v, f, 0, 0, 0, n, 4, CT, M.PLASTIC, 4);
      box(v, f, 0, 3, 0, n, 4, 1, DARK, 2);
      for (const u of [0, 5]) box(v, f, u, 3, 1, u + 1, 4, CT, M.PLASTIC, 2); // door seams
      for (const u of [2, 7]) put(v, f, u, 3, 3, M.METAL, 7);
      box(v, f, 10, 3, 1, n - 1, 4, CT, M.CANDLE, 5); // fridge door
      put(v, f, 11, 3, 3, M.METAL, 7);
      put(v, f, 11, 3, 2, M.METAL, 7);
      box(v, f, 0, 0, CT, n, 4, CT + 1, M.METAL, 6);
      // espresso machine
      box(v, f, 1, 0, CT + 1, 5, 2, CT + 5, M.METAL, 2);
      box(v, f, 1, 0, CT + 5, 5, 3, CT + 6, M.METAL, 5);
      box(v, f, 2, 2, CT + 4, 4, 3, CT + 5, DARK, 1);
      box(v, f, 1, 2, CT + 1, 5, 3, CT + 2, M.METAL, 6);
      box(v, f, 2, 2, CT + 2, 4, 3, CT + 3, M.CANDLE, 6); // the mug
      put(v, f, 1, 1, CT + 4, M.SCREEN, 5);
      put(v, f, 4, 1, CT + 4, M.LED_RED, 7);
      // its water tank on top
      box(v, f, 1, 0, CT + 6, 4, 3, CT + 8, M.GLASS, 5);
      put(v, f, 2, 1, CT + 6, M.WATER, 3);
      // carafe on a hot plate
      put(v, f, 7, 1, CT, M.LED_RED, 6);
      for (let h = CT + 1; h <= CT + 2; h++) {
        for (let u = 6; u <= 8; u++) for (let w = 0; w <= 2; w++) put(v, f, u, w, h, u === 7 && w === 1 ? M.COFFEE : M.GLASS, 5);
      }
      for (const [du, dw] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(v, f, 7 + du, 1 + dw, CT + 3, M.GLASS, 6);
      put(v, f, 9, 1, CT + 2, DARK, 2);
      // mugs, stacked and upside down, and a sugar jar
      for (const [u, w, k] of [[11, 1, 2], [12, 2, 1], [13, 1, 1]] as const) {
        for (let h = CT + 1; h <= CT + k; h++) put(v, f, u, w, h, rng.pick([M.CANDLE, M.CLOTH, M.PLASTIC, M.GOLD_ORE]), 6);
      }
      put(v, f, 13, 0, CT + 1, M.GLASS, 6);
      put(v, f, 13, 0, CT + 2, M.METAL, 7);
      // sofa, floor lamp, plant
      box(v, f, 0, 7, 0, 6, 10, 2, M.BRIMSTONE, 4);
      box(v, f, 1, 8, 1, 5, 10, 2, M.BRIMSTONE, 6);
      box(v, f, 3, 8, 1, 4, 10, 2, M.BRIMSTONE, 3);
      box(v, f, 0, 7, 2, 6, 8, 4, M.BRIMSTONE, 3);
      for (const u of [0, 5]) box(v, f, u, 7, 2, u + 1, 10, 3, M.BRIMSTONE, 5);
      for (let h = 0; h < 9; h++) put(v, f, 7, 8, h, M.METAL, h === 0 ? 2 : 4);
      for (const [du, dw] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(v, f, 7 + du, 8 + dw, 0, M.METAL, 3);
      put(v, f, 7, 8, 9, M.LAMP, 7);
      box(v, f, 6, 7, 10, 9, 10, 11, M.CANDLE, 6);
      plant(v, f, 11, 7, 3, 8, rng);
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      light(c, at(f, 7.5, 8.5, 9.5), WARM, 18, 0.5);
      light(c, at(f, 7.5, 1.5, CT + 1), HOTPLATE, 7, 0.3);
      if (c.rng.chance(c.dt * 0.7)) puffAt(c, f, 7, 1, CT + 4, M.STEAM, 40);
      const dsp = get(c.v, f, 1, 1, CT + 4);
      if (dsp === M.SCREEN) put(c.v, f, 1, 1, CT + 4, M.SCREEN, Math.floor(c.t * (active ? 4 : 1)) % 2 ? 7 : 3);
      if (!active) return;
      light(c, at(f, 3, 3.5, CT + 4), WARM, 10, 0.35);
      if (c.rng.chance(c.dt * 10)) {
        const p = at(f, c.rng.range(2.3, 3.7), 2.5, CT + 3.9);
        emit(c, { kind: 'drop', ...p, vx: 0, vy: 0, vz: 0, life: 0.5, color: tone(M.COFFEE, 6), glow: false, gravity: 20 });
      }
      if (c.rng.chance(c.dt * 3)) puffAt(c, f, 3, 3, CT + 6, M.STEAM, 45);
    },
  };
}

// entrance: an airlock. Sliding doors with portholes in a hazard-striped
// frame, a decontamination chamber lit cyan behind them, an exit sign, a
// keypad and an amber lamp that flashes while someone comes or goes.
function airlock(): Prop {
  const OPEN = 10; // the doorway, u 1..OPEN
  const TALL = 15; // h 0..TALL-1
  const PANEL = OPEN / 2;
  // One voxel of a door panel: i from the outer edge (0) to the meeting
  // edge (PANEL - 1).
  const panel = (i: number, h: number): [number, number] => {
    if (h < 2) return [((i + h) & 2) ? M.GOLD_ORE : DARK, 4];
    if (i === PANEL - 1) return [DARK, 2];
    if (h >= 9 && h <= 11 && i >= 1 && i <= 3 && (i === 2 || h === 10)) return [M.GLASS, 5];
    if (h === TALL - 1) return [M.METAL, 2];
    return [M.METAL, i === 0 ? 3 : 5];
  };
  // Draws both panels `k` voxels open (0 shut .. PANEL in their pockets).
  const doors = (v: Voxels, f: Frame, k: number) => {
    for (let u = 1 - PANEL; u <= OPEN + PANEL; u++) {
      const left = u >= 1 - k && u <= PANEL - k;
      const right = u >= PANEL + 1 + k && u <= OPEN + k;
      for (let h = 0; h < TALL; h++) {
        if (!left && !right) {
          put(v, f, u, -2, h, M.AIR);
          continue;
        }
        const [m, sh] = panel(left ? u - (1 - k) : OPEN + k - u, h);
        put(v, f, u, -2, h, m, sh);
      }
    }
  };
  return {
    name: 'airlock',
    build(v, s) {
      const f = slotFrame(s);
      const deep = -(wallOf(s) - 1);
      for (let h = 0; h < TALL; h++) for (let u = 1; u <= OPEN; u++) for (let w = deep; w < 0; w++) put(v, f, u, w, h, M.AIR);
      for (let u = 1; u <= OPEN; u++) for (let w = deep; w < 0; w++) put(v, f, u, w, -1, M.METAL, w & 1 ? 3 : 5);
      // the inner door, its window lit from beyond
      for (let h = 0; h < TALL; h++) {
        for (let u = 1; u <= OPEN; u++) {
          const win = u >= 4 && u <= 7 && h >= 8 && h <= 11;
          put(v, f, u, deep, h, win ? M.GLASS : M.METAL, win ? 5 : u === 5 || u === 6 ? 2 : 4);
          if (win) put(v, f, u, deep - 1, h, M.LAMP, 6);
        }
      }
      for (let w = deep + 1; w <= -3; w++) {
        put(v, f, 0, w, TALL - 2, M.NEON_CYAN, 6);
        put(v, f, OPEN + 1, w, TALL - 2, M.NEON_CYAN, 6);
      }
      // frame: hazard-striped posts, a lintel with the amber lamp
      for (const u of [0, OPEN + 1]) {
        for (let h = 0; h < TALL + 1; h++) {
          put(v, f, u, -1, h, M.METAL, 3);
          put(v, f, u, 0, h, ((h + u) >> 1) & 1 ? M.GOLD_ORE : DARK, 4);
        }
      }
      for (let u = 0; u <= OPEN + 1; u++) {
        for (let h = TALL; h < TALL + 2; h++) {
          put(v, f, u, -1, h, M.METAL, 3);
          put(v, f, u, 0, h, M.METAL, h === TALL ? 4 : 6);
        }
      }
      put(v, f, 5, 1, TALL + 1, M.LED_AMBER, 7);
      put(v, f, 6, 1, TALL + 1, M.LED_AMBER, 7);
      box(v, f, 4, 1, TALL + 2, 8, 2, TALL + 3, M.METAL, 5);
      poster(v, f, 'exit', 3, TALL + 3);
      // keypad, threshold stripes
      box(v, f, 12, 0, 7, 14, 1, 10, M.METAL, 5);
      put(v, f, 12, 0, 9, M.SCREEN, 5);
      put(v, f, 13, 0, 8, M.LED_RED, 7);
      for (let u = 1; u <= OPEN; u++) for (let w = 0; w < 2; w++) put(v, f, u, w, -1, ((u + w) >> 1) & 1 ? M.GOLD_ORE : DARK, 4);
      // Built open, so the world's memory of the door is in its pockets:
      // healing then never grows a ghost door back across the doorway.
      doors(v, f, PANEL);
      labOf(v).door = 1;
    },
    tick(c, s, active) {
      const f = slotFrame(s);
      const S = labOf(c.v);
      const target = active ? 1 : 0;
      S.door += Math.sign(target - S.door) * Math.min(Math.abs(target - S.door), c.dt * 2.5);
      doors(c.v, f, Math.round(S.door * PANEL));
      const on = !active || Math.floor(c.t * 3) % 2 === 0;
      for (const u of [5, 6]) {
        const cur = get(c.v, f, u, 1, TALL + 1);
        if (cur === M.LED_AMBER || cur === DARK) put(c.v, f, u, 1, TALL + 1, on ? M.LED_AMBER : DARK, on ? 7 : 2);
      }
      if (on) light(c, at(f, 6, 2, TALL + 1.5), AMBER, active ? 20 : 9, active ? 0.85 : 0.3);
      const pad = get(c.v, f, 13, 0, 8);
      if (pad === M.LED_RED || pad === M.NEON_GREEN) put(c.v, f, 13, 0, 8, active ? M.NEON_GREEN : M.LED_RED, 7);
      light(c, at(f, 5.5, -2.5, TALL - 3), AQUA, 10, 0.3);
      if (active && c.rng.chance(c.dt * 6)) puffAt(c, f, c.rng.pick([1, OPEN]), 1, TALL - 1, M.STEAM, 35);
    },
  };
}

const PROPS: Record<SlotKind, Prop> = {
  write: workbench(),
  read: bookshelf(),
  search: dnaScanner(),
  run: teslaCoil(),
  web: radioMast(),
  think: chalkboard(),
  idle: coffeeCorner(),
  entrance: airlock(),
};

// ── the plan ─────────────────────────────────────────────────────────────
// Where everything goes, from the layout alone (generate() and pois() must
// agree): fixtures in the gaps between props, the back corner, lamps,
// windows high on the walls, and islands of lab furniture on the open
// floor, clear of every cell keepClear() reserves.
type Heights = { top: number; pipe: number; lamp: number; tube: number };

function heights(L: Layout): Heights {
  const top = L.H - L.floor;
  return { top, pipe: top - 3, lamp: top - 5, tube: top >= 36 ? top - 7 : -1 };
}

type GapKind = 'hood' | 'window' | 'radiator' | 'shelf' | 'rack' | 'shower' | 'plant' | 'extinguisher';
const GAP: Record<GapKind, { w: number; dep: number }> = {
  hood: { w: 9, dep: 6 },
  window: { w: 9, dep: 0 },
  radiator: { w: 6, dep: 2 },
  shelf: { w: 6, dep: 3 },
  rack: { w: 4, dep: 4 },
  shower: { w: 3, dep: 3 },
  plant: { w: 3, dep: 3 },
  extinguisher: { w: 2, dep: 2 },
};
const PREFS: Record<Side, readonly GapKind[]> = {
  right: ['hood', 'radiator', 'shelf', 'shower', 'rack', 'plant', 'extinguisher'],
  left: ['window', 'rack', 'shelf', 'radiator', 'plant', 'shower', 'extinguisher'],
};

type IslandKind =
  | 'tanks' | 'bench' | 'fish' | 'rat' | 'lounge' | 'ladder' | 'slab' | 'plant' | 'reactor' | 'servers' | 'gas' | 'cryo'
  | 'desk' | 'cart' | 'drums' | 'crates' | 'jar' | 'lamp' | 'globe' | 'sprout' | 'planter';
// The named islands in order of importance: footprint, where they would
// like to be (fractions of the floor from the back corner, spread over the
// room on a 3 x 3 grid, the reactor by the hub as the centrepiece), and the
// furniture inside the footprint as [u0, w0, u1, w1] (default: all of it).
type IslandSpec = { kind: IslandKind; lu: number; lw: number; fx: number; fy: number; parts?: ReadonlyArray<readonly [number, number, number, number]> };
const ISLANDS: readonly IslandSpec[] = [
  { kind: 'tanks', lu: 25, lw: 9, fx: 0.55, fy: 0.8 },
  { kind: 'rat', lu: 8, lw: 6, fx: 0.3, fy: 0.8 },
  { kind: 'bench', lu: 15, lw: 6, fx: 0.8, fy: 0.55 },
  { kind: 'lounge', lu: 12, lw: 7, fx: 0.8, fy: 0.3, parts: [[0, 0, 7, 3], [8, 0, 12, 4]] },
  { kind: 'fish', lu: 9, lw: 5, fx: 0.3, fy: 0.55 },
  { kind: 'reactor', lu: 11, lw: 11, fx: 0.55, fy: 0.55 },
  { kind: 'slab', lu: 17, lw: 7, fx: 0.8, fy: 0.8 },
  { kind: 'ladder', lu: 6, lw: 4, fx: 0.68, fy: 0.68 },
  { kind: 'servers', lu: 13, lw: 4, fx: 0.55, fy: 0.3 },
  { kind: 'cryo', lu: 12, lw: 5, fx: 0.3, fy: 0.3 },
  { kind: 'plant', lu: 5, lw: 5, fx: 0.42, fy: 0.68 },
  { kind: 'bench', lu: 15, lw: 6, fx: 0.68, fy: 0.95 },
  { kind: 'gas', lu: 9, lw: 3, fx: 0.95, fy: 0.68 },
];
// Furniture for the floor still bare once the named islands are in, by
// zone: a teaching lab of bench rows in front between the partitions, an
// office of desks on the right, stores on the left, and plants and lamps
// in the hall at the back where the agents walk. Each zone lays its pieces
// one way round, so they line up in rows, and takes turns through the
// first `cycle` kinds of its list (the rest are fallbacks): [kind, lu, lw].
type Zone = 'teach' | 'office' | 'store' | 'hall';
const ZONES: Record<Zone, { orient: 0 | 1 | null; cycle: number; fill: ReadonlyArray<readonly [IslandKind, number, number]> }> = {
  teach: { orient: 0, cycle: 3, fill: [['bench', 15, 6], ['bench', 15, 6], ['cart', 6, 3], ['jar', 3, 3]] },
  office: { orient: 1, cycle: 4, fill: [['desk', 7, 5], ['desk', 7, 5], ['desk', 7, 5], ['lamp', 3, 3], ['sprout', 3, 3]] },
  store: { orient: 0, cycle: 4, fill: [['crates', 5, 4], ['drums', 7, 3], ['gas', 9, 3], ['crates', 5, 4], ['sprout', 3, 3]] },
  hall: { orient: null, cycle: 3, fill: [['planter', 9, 3], ['plant', 5, 5], ['planter', 9, 3], ['sprout', 3, 3], ['lamp', 3, 3], ['globe', 3, 3]] },
};
const FILL_COVER = 0.1;
const PATCH = 16;
// Low glass partitions in big rooms: [runs along x (0) or y (1), where
// across, from, to], as fractions of the floor. Corridors cut doorways.
const PARTITIONS: ReadonlyArray<readonly [0 | 1, number, number, number]> = [
  [0, 0.66, 0.4, 0.97],
  [1, 0.66, 0.4, 0.97],
  [0, 0.36, 0.72, 0.97],
  [1, 0.36, 0.72, 0.97],
];
const TANK_PITCH = 8;
const MARGIN = 2; // walking room kept round each island
const VIEW = 14; // floor kept bare in front of a prop out on the floor

type Gap = { wall: Side; kind: GapKind; a0: number; f: Frame };
type Island = { kind: IslandKind; f: Frame; lu: number; lw: number; n: number };
type Partition = { f: Frame; len: number };
type Upper = { wall: Side; a0: number; kind: 'window' | 'table' | PosterKind };
type Plan = {
  hts: Heights;
  gaps: Gap[];
  corner: Frame | null;
  coats: boolean;
  lamps: Array<{ wall: Side; a: number }>;
  uppers: Upper[];
  partitions: Partition[];
  islands: Island[];
  pois: Poi[];
};

const PLANS = new Map<string, Plan>();

function plan(L: Layout): Plan {
  const key = `${L.W},${L.D},${L.H},${L.T},${L.floor}:${L.slots.map((s) => `${s.x0},${s.y0}`).join(';')}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  const { W, D, T } = L;
  const hts = heights(L);
  const keep = keepClear(L);
  const blocked = new Uint8Array(W * D);
  const each = (f: Frame, u0: number, w0: number, u1: number, w1: number, fn: (x: number, y: number) => void) => {
    for (let w = w0; w < w1; w++) for (let u = u0; u < u1; u++) fn(fx(f, u, w), fy(f, u, w));
  };
  const free = (f: Frame, u0: number, w0: number, u1: number, w1: number) => {
    let ok = true;
    each(f, u0, w0, u1, w1, (x, y) => {
      if (x < T || y < T || x >= W - 1 || y >= D - 1 || keep[x + W * y] || blocked[x + W * y]) ok = false;
    });
    return ok;
  };
  const block = (f: Frame, u0: number, w0: number, u1: number, w1: number) =>
    each(f, u0, w0, u1, w1, (x, y) => {
      if (x >= 0 && y >= 0 && x < W && y < D) blocked[x + W * y] = 1;
    });

  // Fixtures in the gaps between props, a different one each where it fits.
  const gaps: Gap[] = [];
  const used = new Set<GapKind>();
  const door = L.slots.find((s) => s.kind === 'entrance');
  for (const wall of SIDES) {
    const end = wall === 'left' ? D : W;
    for (const [g0, g1] of wallGaps(L, wall)) {
      if (g0 === T) continue;
      const lo = g0 + 1;
      const hi = g1 === end ? end - 2 : g1 - 1;
      const width = hi - lo;
      const byDoor = door?.wall === wall && g1 === (wall === 'left' ? door.y0 : door.x0);
      const fits = PREFS[wall].filter((k) => GAP[k].w <= width && !(k === 'window' && byDoor));
      const order = [...fits.filter((k) => !used.has(k)), ...fits.filter((k) => used.has(k) && k !== 'hood')];
      for (const k of order) {
        const a0 = lo + Math.floor((width - GAP[k].w) / 2);
        const f = wallFrame(L, wall, a0);
        if (!free(f, 0, 0, GAP[k].w, GAP[k].dep + 1)) continue;
        gaps.push({ wall, kind: k, a0, f });
        used.add(k);
        block(f, 0, 0, GAP[k].w, Math.max(1, GAP[k].dep));
        break;
      }
    }
  }

  // The back corner: an anatomy skeleton on its stand, a coat stand.
  const cf: Frame = { x0: T, y0: T, z0: L.floor, ux: 1, uy: 0, vx: 0, vy: 1 };
  const corner = free(cf, 0, 0, 7, 5) ? cf : null;
  if (corner) block(cf, 0, 0, 7, 5);
  const coats = corner !== null && free(cf, 0, 6, 3, 9);
  if (coats) block(cf, 0, 6, 3, 9);

  // Lamps over the props and the big fixtures, at least 16 apart.
  const lamps: Array<{ wall: Side; a: number }> = [];
  for (const wall of SIDES) {
    const along = (s: Slot) => (wall === 'left' ? s.y0 : s.x0);
    const sites = [
      ...slotsOn(L, wall).filter((s) => s.kind !== 'entrance').map((s) => along(s) + (s.len >> 1)),
      ...gaps.filter((g) => g.wall === wall && (g.kind === 'hood' || g.kind === 'shelf')).map((g) => g.a0 + (GAP[g.kind].w >> 1)),
    ].sort((p, q) => p - q);
    let last = -Infinity;
    for (const a of sites) {
      if (a - last < 16) continue;
      last = a;
      lamps.push({ wall, a });
    }
  }

  // Tall rooms: storm windows and posters high up, clear of the hood ducts.
  const uppers: Upper[] = [];
  const upTop = hts.tube > 0 ? hts.tube - 2 : hts.lamp - 1;
  if (upTop - UPPER >= 7) {
    const cycle: ReadonlyArray<Upper['kind']> = ['window', 'radiation', 'window', 'table', 'window', 'volt', 'window', 'molecule', 'window', 'notice'];
    let k = 0;
    for (const wall of SIDES) {
      const end = wall === 'left' ? D : W;
      const ducts = gaps.filter((g) => g.wall === wall && g.kind === 'hood').map((g) => [g.a0 - 2, g.a0 + GAP.hood.w + 2] as const);
      for (let a = T + 8; a + 10 < end - 2; a += 22) {
        if (ducts.some(([p, q]) => a + 10 > p && a < q)) continue;
        uppers.push({ wall, a0: a, kind: cycle[k++ % cycle.length] });
      }
    }
  }

  // Floor that is taken, for placing things: reserved floor, a margin by
  // the walls and the cuts, and MARGIN round anything already placed.
  const occ = new Uint8Array(W * D);
  const take = (x: number, y: number, r: number) => {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < D) occ[nx + W * ny] = 1;
      }
    }
  };
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      if (x < T + 1 || y < T + 1 || x >= W - 2 || y >= D - 2 || keep[x + W * y]) occ[x + W * y] = 1;
    }
  }
  for (let i = 0; i < W * D; i++) if (blocked[i]) take(i % W, Math.floor(i / W), MARGIN);
  // Nothing goes just in front of a prop out on the floor, where it would
  // hide it (the camera looks in along -x -y).
  for (const s of L.slots) {
    if (!s.island) continue;
    const r = slotRect(s);
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) for (let k = 1; k <= VIEW; k++) take(x + k, y + k, 1);
  }
  // Nor in front of the build plazas, where the haulers and builders would
  // be lost behind the tanks or a partition.
  for (const p of buildSites(L)) {
    for (let y = Math.floor(p.y - p.r); y <= p.y + p.r; y++) {
      for (let x = Math.floor(p.x - p.r); x <= p.x + p.r; x++) {
        if (Math.hypot(x - p.x, y - p.y) <= p.r) for (let k = 1; k <= VIEW; k++) take(x + k, y + k, 0);
      }
    }
  }

  // Low glass partitions carve big rooms into zones, broken for doorways
  // and wherever the floor is reserved.
  const partitions: Partition[] = [];
  if (Math.min(W, D) >= 150) {
    const clear = (x: number, y: number) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (occ[x + dx + W * (y + dy)]) return false;
      return true;
    };
    for (const [ax, across, from, to] of PARTITIONS) {
      const fixed = Math.round(T + (ax ? W - T : D - T) * across);
      const a0 = Math.round(T + (ax ? D - T : W - T) * from);
      const a1 = Math.min(Math.round(T + (ax ? D - T : W - T) * to), (ax ? D : W) - 3);
      let start = -1;
      for (let a = a0; a <= a1; a++) {
        const x = ax ? fixed : a;
        const y = ax ? a : fixed;
        const open = a < a1 && (a - a0) % 30 >= 4 && clear(x, y);
        if (open && start < 0) start = a;
        if (open || start < 0) continue;
        if (a - start >= 6) {
          const f: Frame = ax ? { x0: fixed, y0: start, z0: L.floor, ux: 0, uy: 1, vx: 1, vy: 0 } : { x0: start, y0: fixed, z0: L.floor, ux: 1, uy: 0, vx: 0, vy: 1 };
          partitions.push({ f, len: a - start });
          block(f, 0, 0, a - start, 1);
          for (let u = 0; u < a - start; u++) take(fx(f, u, 0), fy(f, u, 0), MARGIN);
        }
        start = -1;
      }
    }
  }

  // The named islands, each as near its favourite spot as fits.
  const islands: Island[] = [];
  let sat = satOf(occ, W, D);
  const settle = (kind: IslandKind, f: Frame, lu: number, lw: number, n: number, m: number, parts?: IslandSpec['parts']) => {
    islands.push({ kind, f, lu, lw, n });
    each(f, -m, -m, lu + m, lw + m, (x, y) => {
      if (x >= 0 && y >= 0 && x < W && y < D) occ[x + W * y] = 1;
    });
    for (const [u0, w0, u1, w1] of parts ?? [[0, 0, lu, lw]]) block(f, u0, w0, u1, w1);
    sat = satOf(occ, W, D);
  };
  const big = Math.min(W, D) >= 180;
  for (const spec of ISLANDS) {
    const sizes = spec.kind === 'tanks' ? [3, 2, 1] : spec.kind === 'reactor' && big ? [15, 11] : [1];
    for (const n of sizes) {
      const lu = spec.kind === 'tanks' ? n * TANK_PITCH + 1 : spec.kind === 'reactor' ? Math.max(n, spec.lu) : spec.lu;
      const lw = spec.kind === 'reactor' ? lu : spec.lw;
      const f = placeIsland(L, sat, lu, lw, MARGIN, T + (W - T) * spec.fx, T + (D - T) * spec.fy, null);
      if (!f) continue;
      settle(spec.kind, f, lu, lw, n, MARGIN, spec.parts);
      break;
    }
  }

  // Points of interest, on free floor next to what they are about.
  const pois: Poi[] = [];
  const h = hub(L);
  const ok = (x: number, y: number) => {
    if (x < T + 1 || y < T + 1 || x > W - 3 || y > D - 3 || keep[x + W * y]) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (blocked[x + dx + W * (y + dy)]) return false;
    return !pois.some((p) => Math.hypot(p.x - x, p.y - y) < 4);
  };
  const near = (p: P3 | { x: number; y: number }, r: number): [number, number] | null => {
    let best: [number, number] | null = null;
    let bd = Infinity;
    const cx = Math.round(p.x);
    const cy = Math.round(p.y);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const d = Math.hypot(cx + dx - p.x, cy + dy - p.y);
        if (d < bd && ok(cx + dx, cy + dy)) {
          bd = d;
          best = [cx + dx, cy + dy];
        }
      }
    }
    return best;
  };
  const add = (kind: Poi['kind'], cands: ReadonlyArray<{ x: number; y: number }>, face: { x: number; y: number }, r = 4) => {
    // the candidate nearest the hub wins: the shortest walk in
    const sorted = [...cands].sort((p, q) => Math.hypot(p.x - h.x, p.y - h.y) - Math.hypot(q.x - h.x, q.y - h.y));
    for (const c of sorted) {
      const p = near(c, r);
      if (p) {
        pois.push({ x: p[0], y: p[1], kind, face: { x: face.x, y: face.y } });
        return;
      }
    }
  };
  const isle = (k: IslandKind) => islands.find((i) => i.kind === k);
  const idle = L.slots.find((s) => s.kind === 'idle');
  if (idle) {
    const f = slotFrame(idle);
    add('drink', [at(f, idle.len + 2.5, 3, 0), at(f, -2.5, 3, 0)], at(f, 7.5, 1.5, 0), 9);
  }
  const lounge = isle('lounge');
  if (lounge) add('seat', [at(lounge.f, 3.5, 4.5, 0)], at(lounge.f, 3.5, 8, 0), 2);
  const rat = isle('rat');
  if (rat) add('pet', [at(rat.f, rat.lu / 2, rat.lw + 4, 0), at(rat.f, -4, rat.lw / 2, 0), at(rat.f, rat.lu + 4, rat.lw / 2, 0)], at(rat.f, rat.lu / 2, rat.lw / 2, 0));
  const front = (i: Island) => [at(i.f, i.lu / 2, i.lw + 2.5, 0), at(i.f, -2.5, i.lw / 2, 0), at(i.f, i.lu + 2.5, i.lw / 2, 0)];
  const tanks = isle('tanks');
  if (tanks) add('view', front(tanks), at(tanks.f, tanks.lu / 2, tanks.lw / 2, 0));
  const radiator = gaps.find((g) => g.kind === 'radiator');
  const bench = isle('bench');
  if (radiator) add('warm', [at(radiator.f, 3, 4, 0)], at(radiator.f, 3, 0.5, 0));
  else if (bench) add('warm', [at(bench.f, -2.5, 3.5, 0)], at(bench.f, 3.5, 3.5, 0));
  if (lounge) add('dance', [at(lounge.f, 10, 6.5, 0)], at(lounge.f, 10, 1.5, 0), 3);
  const fish = isle('fish');
  if (fish) add('view', front(fish), at(fish.f, fish.lu / 2, fish.lw / 2, 0));
  const win = gaps.find((g) => g.kind === 'window');
  if (win && pois.length < 8) add('view', [at(win.f, GAP.window.w / 2, 3.5, 0)], at(win.f, GAP.window.w / 2, -1, 0));
  const mutant = isle('plant');
  if (mutant && pois.length < 8) add('view', front(mutant), at(mutant.f, 2.5, 2.5, 0));
  for (const p of pois) take(p.x, p.y, 3);
  sat = satOf(occ, W, D);

  // Fill each 16 x 16 patch of floor that is still bare with its zone's
  // furniture, row by row, until the floor is furnished enough.
  const room = (W - 1 - T) * (D - 1 - T);
  let cover = 0;
  for (let y = T; y < D - 1; y++) for (let x = T; x < W - 1; x++) cover += blocked[x + W * y];
  const zoneOf = (x: number, y: number): Zone => {
    const zx = (x - T) / (W - T);
    const zy = (y - T) / (D - T);
    if (zx > 0.66 && zy > 0.66) return 'teach';
    if (zx > 0.66) return 'office';
    if (zy > 0.66) return 'store';
    return 'hall';
  };
  for (let py = T; py + PATCH <= D - 1 && cover < room * FILL_COVER; py += PATCH) {
    for (let px = T; px + PATCH <= W - 1 && cover < room * FILL_COVER; px += PATCH) {
      let used = 0;
      for (let y = py; y < py + PATCH; y++) for (let x = px; x < px + PATCH; x++) used += blocked[x + W * y];
      if (used >= 12) continue;
      const zone = ZONES[zoneOf(px + PATCH / 2, py + PATCH / 2)];
      const col = (px - T) / PATCH;
      const row = (py - T) / PATCH;
      // the hall keeps every other patch clear, for walking
      if (zone.orient === null && (col + row) % 2 === 1) continue;
      const k0 = (col + 2 * row) % zone.cycle;
      for (let k = 0; k < zone.fill.length; k++) {
        const [kind, lu, lw] = zone.fill[(k0 + k) % zone.fill.length];
        const m = lu * lw <= 9 ? 1 : MARGIN;
        const f = placeIsland(L, sat, lu, lw, m, px + PATCH / 2, py + PATCH / 2, [px - 2, py - 2, px + PATCH + 2, py + PATCH + 2], zone.orient);
        if (!f) continue;
        settle(kind, f, lu, lw, 1, m);
        cover += lu * lw;
        break;
      }
    }
  }

  const P: Plan = { hts, gaps, corner, coats, lamps, uppers, partitions, islands, pois: pois.slice(0, 8) };
  if (PLANS.size > 16) PLANS.clear();
  PLANS.set(key, P);
  return P;
}

// A summed-area table of `occ`, for O(1) box queries.
function satOf(occ: Uint8Array, W: number, D: number): Int32Array {
  const S = new Int32Array((W + 1) * (D + 1));
  for (let y = 0; y < D; y++) {
    let row = 0;
    for (let x = 0; x < W; x++) {
      row += occ[x + W * y];
      S[x + 1 + (W + 1) * (y + 1)] = S[x + 1 + (W + 1) * y] + row;
    }
  }
  return S;
}

// The free spot (lu x lw plus `m` all round, either way round) nearest
// (tx, ty), searched over the room or inside `win` ([x0, y0, x1, y1]), or
// null; `only` fixes which way round. `S` sums the floor that is taken.
function placeIsland(L: Layout, S: Int32Array, lu: number, lw: number, m: number, tx: number, ty: number, win: readonly number[] | null, only: 0 | 1 | null = null): Frame | null {
  const { W, D, T } = L;
  const sum = (x0: number, y0: number, x1: number, y1: number) => S[x1 + (W + 1) * y1] - S[x0 + (W + 1) * y1] - S[x1 + (W + 1) * y0] + S[x0 + (W + 1) * y0];
  let best: Frame | null = null;
  let cost = Infinity;
  for (const o of only === null ? [0, 1] : [only]) {
    const sx = o ? lw : lu;
    const sy = o ? lu : lw;
    const xa = Math.max(T + m, win ? win[0] : 0);
    const ya = Math.max(T + m, win ? win[1] : 0);
    const xb = Math.min(W - m - sx, win ? win[2] - sx : W);
    const yb = Math.min(D - m - sy, win ? win[3] - sy : D);
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) {
        if (sum(x - m, y - m, x + sx + m, y + sy + m) > 0) continue;
        const c = Math.hypot(x + sx / 2 - tx, y + sy / 2 - ty) + o * 0.5;
        if (c >= cost) continue;
        cost = c;
        best = o ? { x0: x, y0: y, z0: L.floor, ux: 0, uy: 1, vx: 1, vy: 0 } : { x0: x, y0: y, z0: L.floor, ux: 1, uy: 0, vx: 0, vy: 1 };
      }
    }
  }
  return best;
}

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  clear(v);
  STATE.delete(v);
  const S = labOf(v);
  const P = plan(L);
  const fx: Fixtures = noFixtures();
  S.fx = fx;
  const seed = rng.int(0, 0x3fffffff);
  shell(v, L, seed);
  services(v, L);
  pipes(v, L, P.hts, seed);
  if (P.hts.tube > 0) reagentLine(v, L, P.hts, fx);
  lamps(v, L, P, fx);
  for (const u of P.uppers) upper(v, L, P, u, rng, fx);
  overProps(v, L, fx);
  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);
  for (const g of P.gaps) gapFixture(v, P, g, rng, fx);
  if (P.corner) skeleton(v, P.corner);
  if (P.corner && P.coats) coatStand(v, P.corner);
  for (const p of P.partitions) partition(v, p.f, p.len);
  for (const i of P.islands) island(v, P, i, rng, fx);
  if (fx.lamps.length) fx.lamps[Math.floor(hash3(seed, 3, 1, 4) * fx.lamps.length)].broken = true;
  fx.storm.next = 2 + hash3(seed, 9, 9, 9) * 6;
  seal(v);
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Glass wherever a liquid would touch air beside or below it.
function seal(v: Voxels): void {
  const { W, D } = v;
  const WD = W * D;
  for (let i = 0; i < v.size; i++) {
    if (!LIQ[v.mat[i]]) continue;
    const x = i % W;
    const y = ((i / W) | 0) % D;
    const z = (i / WD) | 0;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, -1]]) {
      if (v.get(x + dx, y + dy, z + dz) === M.AIR) v.put(x + dx, y + dy, z + dz, M.GLASS, 5);
    }
  }
}

// The walls and floor. Walls in section, from the room out: a finish of
// skirting, a porcelain-tiled dado, teal rail and plaster, then a plaster
// coat, brick in running bond, a concrete core and an outer render, all on
// a concrete footing. The floor: blue-grey tiles over a screed and a
// concrete slab.
function shell(v: Voxels, L: Layout, seed: number): void {
  const { W, D, H, T, floor } = L;
  for (let z = 0; z < H; z++) {
    const h = z - floor;
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        const wall = x < T || y < T;
        if (!wall && z >= floor) continue;
        let m: number;
        let s: number;
        if (wall) {
          const d = x < T && y < T ? Math.min(T - 1 - x, T - 1 - y) : x < T ? T - 1 - x : T - 1 - y;
          const a = x < T && y < T ? x + y : x < T ? y : x;
          if (h < 0) {
            m = M.CONCRETE;
            s = 1 + Math.floor(hash3(seed, a, d, z) * 3);
          } else if (d === 0) {
            if (h < 2) {
              m = M.PLASTIC;
              s = h === 0 ? 2 : 4;
            } else if (h < DADO) {
              const grout = (h - 2) % WALL_TILE === WALL_TILE - 1 || a % WALL_TILE === 0;
              m = grout ? M.TILE : M.CANDLE;
              s = grout ? 6 : 4 + (hash3(seed, Math.floor(a / WALL_TILE), Math.floor(h / WALL_TILE), 5) < 0.3 ? 1 : 0);
            } else if (h === DADO) {
              m = M.PLASTIC;
              s = 6;
            } else {
              m = M.PLASTER;
              s = 4 + (noise2(seed, a * 0.12, h * 0.15) > 0.62 ? 1 : 0) + (hash3(seed, a, h, 6) < 0.15 ? 1 : 0);
            }
          } else if (d === 1) {
            m = M.PLASTER;
            s = 2;
          } else if (d === T - 1) {
            m = M.PLASTER;
            s = 5;
          } else if (d === T - 2) {
            m = M.CONCRETE;
            s = 2 + Math.floor(hash3(seed, a, d, z) * 3);
          } else {
            const course = Math.floor(z / 3);
            const off = (course & 1) * 3;
            if ((z % 3 === 0 && z < H - 1) || (a + off) % 6 === 0) {
              m = M.CONCRETE;
              s = 6;
            } else {
              m = M.BRICK;
              s = 2 + Math.floor(hash3(seed, Math.floor((a + off) / 6), course, d) * 5);
            }
          }
        } else if (z === floor - 1) {
          const gx = x - T;
          const gy = y - T;
          m = M.TILE;
          if (gx % FLOOR_TILE === 0 || gy % FLOOR_TILE === 0) {
            s = 0;
          } else {
            // no checker (it shimmers when shrunk): a shade per tile, mostly the same
            const r = hash3(seed, Math.floor(gx / FLOOR_TILE), Math.floor(gy / FLOOR_TILE), 9);
            s = 4 + (r < 0.2 ? 1 : 0) - (r > 0.85 ? 1 : 0);
          }
        } else if (z === floor - 2) {
          m = M.CONCRETE;
          s = 6;
        } else {
          m = M.CONCRETE;
          s = 2 + Math.floor(hash3(seed, x >> 1, y >> 1, z) * 3);
        }
        v.put(x, y, z, m, s);
      }
    }
  }
}

// Service runs in the floor slab, showing in section at the front cuts: a
// glass conduit of acid, a copper water main, a cable duct and a line of
// reagent. Each is capped in steel at the back.
function services(v: Voxels, L: Layout): void {
  const { W, D, T, floor } = L;
  const zc = Math.max(1, floor - 5);
  const runs = [
    { along: 0, at: Math.round(T + (D - T) * 0.35), ring: M.GLASS, core: M.ACID },
    { along: 0, at: Math.round(T + (D - T) * 0.62), ring: M.ROCK, core: M.WATER },
    { along: 1, at: Math.round(T + (W - T) * 0.45), ring: M.PLASTIC, core: DARK },
    { along: 1, at: Math.round(T + (W - T) * 0.75), ring: M.GLASS, core: M.POTION },
  ];
  for (const r of runs) {
    const end = r.along ? D : W;
    for (let s = T; s < end; s++) {
      for (let q = -1; q <= 1; q++) {
        for (let dz = -1; dz <= 1; dz++) {
          const core = q === 0 && dz === 0;
          const m = s === T ? M.METAL : core ? r.core : r.ring;
          v.put(r.along ? r.at + q : s, r.along ? s : r.at + q, zc + dz, m, core ? 4 : 5);
        }
      }
    }
  }
}

// A steel pipe run along the top of both walls, collared every 12 voxels,
// with a red valve wheel here and there.
function pipes(v: Voxels, L: Layout, hts: Heights, seed: number): void {
  for (const wall of SIDES) {
    const end = wall === 'left' ? L.D : L.W;
    const k = wall === 'left' ? 1 : 2;
    for (let a = L.T; a < end; a++) {
      const f = wallFrame(L, wall, a);
      for (let o = 0; o < 2; o++) {
        put(v, f, 0, o, hts.pipe, M.METAL, o ? 3 : 2);
        put(v, f, 0, o, hts.pipe + 1, M.METAL, o ? 6 : 5);
      }
      const off = a - L.T - 3 - Math.floor(hash3(seed, k, 1, 41) * 12);
      if (off % 12 === 0) {
        put(v, f, 0, 2, hts.pipe, M.METAL, 4);
        put(v, f, 0, 2, hts.pipe + 1, M.METAL, 5);
        if (off % 36 === 0) put(v, f, 0, 2, hts.pipe + 1, M.CLOTH, 6);
      }
    }
  }
}

// The reagent line: a glass tube set flush into both walls with a core of
// glowing potion, meeting in the back corner and capped at the front cuts.
// The weather sends pulses along it.
function reagentLine(v: Voxels, L: Layout, hts: Heights, fx: Fixtures): void {
  const { W, D, T } = L;
  const zc = L.floor + hts.tube;
  const shell = (x: number, y: number, cap: boolean, collar: boolean) => {
    for (let dz = -1; dz <= 1; dz++) v.put(x, y, zc + dz, cap || collar ? M.METAL : M.GLASS, cap ? 4 : collar ? 5 : 4);
  };
  for (let x = T - 3; x < W; x++) {
    for (let y = T - 3; y < T; y++) shell(x, y, x === W - 1, (x - T) % 16 === 8 && y !== T - 2);
  }
  for (let y = T - 3; y < D; y++) {
    for (let x = T - 3; x < T; x++) shell(x, y, y === D - 1, (y - T) % 16 === 8 && x !== T - 2);
  }
  // core, from the left wall's front end round to the right wall's
  for (let y = D - 2; y >= T - 2; y--) fx.tube.push(v.idx(T - 2, y, zc));
  for (let x = T - 1; x <= W - 2; x++) fx.tube.push(v.idx(x, T - 2, zc));
  for (const i of fx.tube) v.set(i, M.POTION, 2);
}

// Tube lights flush in the walls over the props.
function lamps(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const h = P.hts.lamp;
  for (const { wall, a } of P.lamps) {
    const f = wallFrame(L, wall, a);
    const cells: number[] = [];
    for (let u = -4; u <= 4; u++) {
      const tube = Math.abs(u) < 4;
      put(v, f, u, -1, h, tube ? M.LAMP : M.METAL, tube ? 7 : 4);
      put(v, f, u, 0, h + 1, M.METAL, 5);
      if (tube) cells.push(cell(v, f, u, -1, h));
    }
    // the light sits out in the room, so its pool falls on the floor and
    // not on the void over the wall tops
    fx.lamps.push({ cells, p: at(f, 0.5, 8, h - 10), broken: false });
  }
}

// A window in a wall face, `uw` wide over rows h0..h1-1: a steel frame and
// cross, glass, an air gap, and the night sky behind with stars and maybe
// the moon. Lightning lights the sky up now and then (see weather).
function stormWindow(v: Voxels, f: Frame, uw: number, h0: number, h1: number, rng: Rng, fx: Fixtures, moon: boolean): void {
  const cols = uw - 2;
  const rows = h1 - h0 - 2;
  const grid = new Int32Array(cols * rows).fill(-1);
  const mu = rng.int(2, uw - 3);
  const mh = rng.int(h0 + 2, h1 - 3);
  const cu = uw >> 1;
  const ch = (h0 + h1) >> 1;
  for (let h = h0; h < h1; h++) {
    for (let u = 0; u < uw; u++) {
      if (u === 0 || u === uw - 1 || h === h0 || h === h1 - 1) {
        put(v, f, u, -1, h, M.METAL, 6);
        put(v, f, u, -2, h, M.METAL, 3);
        continue;
      }
      const mull = u === cu || h === ch;
      put(v, f, u, -1, h, mull ? M.METAL : M.GLASS, mull ? 6 : 4);
      put(v, f, u, -2, h, M.AIR);
      const lune = moon && Math.hypot(u - mu, h - mh) <= 1.3;
      const star = !lune && rng.chance(0.1);
      put(v, f, u, -3, h, lune ? M.CANDLE : star ? M.LAMP : M.COAL, lune ? 6 : star ? 3 : rng.int(1, 4));
      const i = cell(v, f, u, -3, h);
      if (star) fx.stars.push(i);
      else if (!lune) grid[(u - 1) + cols * (h - h0 - 1)] = i;
    }
  }
  for (let u = 0; u < uw; u++) put(v, f, u, 0, h0 - 1, M.METAL, 6); // sill
  fx.windows.push({ grid, cols, rows, p: at(f, uw / 2, 3, (h0 + h1) / 2) });
}

function upper(v: Voxels, L: Layout, P: Plan, u: Upper, rng: Rng, fx: Fixtures): void {
  const f = wallFrame(L, u.wall, u.a0);
  const top = Math.min(P.hts.tube > 0 ? P.hts.tube - 2 : P.hts.lamp - 1, UPPER + 14);
  if (u.kind === 'window') {
    stormWindow(v, f, 10, UPPER, top, rng, fx, fx.windows.length === 0);
    return;
  }
  if (u.kind === 'table') {
    if (UPPER + 9 < top) periodicTable(v, f, -1, UPPER + 1);
    return;
  }
  const sz = posterSize(u.kind);
  if (UPPER + sz.h < top) poster(v, f, u.kind, (10 - sz.w) >> 1, UPPER + 1);
}

// Pinned on the wall over the workbench: the clock.
function overProps(v: Voxels, L: Layout, fx: Fixtures): void {
  for (const s of L.slots) {
    if (s.island) continue;
    const f = slotFrame(s);
    if (s.kind === 'write') {
      const cu = 5;
      const ch = 16;
      const face: Array<[number, number, number]> = [];
      for (let dh = -4; dh <= 4; dh++) {
        for (let du = -4; du <= 4; du++) {
          const d = Math.hypot(du, dh);
          if (d > 4.3) continue;
          const tick = (du === 0 || dh === 0) && Math.round(d) === 3;
          const m = d > 3.3 ? M.METAL : tick ? DARK : M.CANDLE;
          const sh = d > 3.3 ? (dh > 0 ? 6 : 4) : tick ? 2 : 6;
          put(v, f, cu + du, -1, ch + dh, m, sh);
          if (d <= 3.3) face.push([cell(v, f, cu + du, -1, ch + dh), m, sh]);
        }
      }
      fx.clock = { f, u: cu, h: ch, face, last: -1 };
    }
  }
}

// ── fixtures along the walls ─────────────────────────────────────────────
function gapFixture(v: Voxels, P: Plan, g: Gap, rng: Rng, fx: Fixtures): void {
  const f = g.f;
  switch (g.kind) {
    case 'hood': {
      // A fume hood: cupboards, a resin work surface, a steel enclosure
      // with a glass sash, a light inside, something brewing, and a duct
      // up the wall that vents steam.
      box(v, f, 0, 0, 0, 9, 6, 5, M.PLASTIC, 4);
      box(v, f, 0, 5, 0, 9, 6, 1, DARK, 2);
      box(v, f, 4, 5, 1, 5, 6, 5, M.PLASTIC, 1);
      for (const u of [3, 5]) put(v, f, u, 5, 3, M.METAL, 7);
      box(v, f, 0, 0, 5, 9, 6, 6, DARK, 3);
      box(v, f, 0, 0, 6, 9, 1, 16, M.METAL, 2);
      for (const u of [0, 8]) box(v, f, u, 0, 6, u + 1, 6, 16, M.METAL, 3);
      box(v, f, 0, 0, 16, 9, 6, 18, M.METAL, 3);
      box(v, f, 1, 5, 16, 8, 6, 17, M.BRIMSTONE, 5);
      box(v, f, 1, 5, 11, 8, 6, 16, M.GLASS, 6);
      box(v, f, 1, 5, 10, 8, 6, 11, M.METAL, 6);
      box(v, f, 2, 0, 15, 7, 1, 16, M.LAMP, 6);
      fx.flasks.push(...flask(v, f, 2, 1, 6, rng.pick(REAGENTS)));
      fx.flasks.push(...flask(v, f, 5, 2, 6, rng.pick(REAGENTS)));
      const duct = P.hts.pipe - 2;
      for (let h = 18; h <= duct; h++) {
        for (let u = 3; u <= 5; u++) for (let w = 1; w <= 3; w++) if (u !== 4 || w !== 2) put(v, f, u, w, h, M.METAL, (h - 18) % 6 === 0 ? 6 : u === 3 || w === 1 ? 3 : 5);
      }
      fx.vents.push({ p: at(f, 4, 2, duct + 1), rate: 3, m: M.STEAM });
      fx.vents.push({ p: at(f, 3, 3, 9), rate: 0.8, m: M.TOXIC });
      fx.glows.push({ p: at(f, 4.5, 3, 13), color: COOL, radius: 10, intensity: 0.35, pulse: 0 });
      break;
    }
    case 'window':
      stormWindow(v, f, GAP.window.w, 6, 18, rng, fx, false);
      break;
    case 'radiator': {
      for (let u = 0; u < 6; u++) {
        for (let h = 2; h < 9; h++) {
          put(v, f, u, 0, h, M.METAL, 4);
          if (!(u & 1)) put(v, f, u, 1, h, M.METAL, h === 8 ? 7 : 6);
        }
      }
      for (const u of [0, 5]) box(v, f, u, 0, 0, u + 1, 2, 2, M.METAL, 3);
      for (let u = 0; u < 6; u++) put(v, f, u, 0, 9, M.METAL, 5);
      put(v, f, 0, 1, 9, M.CLOTH, 6);
      poster(v, f, 'chart', 0, 12);
      fx.glows.push({ p: at(f, 3, 2.5, 5), color: HOTPLATE, radius: 9, intensity: 0.22, pulse: 0.05 });
      fx.heat.push(at(f, 3, 1.5, 9.5));
      break;
    }
    case 'shelf': {
      box(v, f, 0, 0, 0, 6, 3, 5, M.PLASTIC, 4);
      box(v, f, 0, 2, 0, 6, 3, 1, DARK, 2);
      for (let h = 1; h < 5; h++) put(v, f, 3, 2, h, M.PLASTIC, 1);
      for (const u of [2, 4]) put(v, f, u, 2, 3, M.METAL, 7);
      box(v, f, 0, 0, 5, 6, 3, 6, M.TILE, 6);
      fx.flasks.push(...flask(v, f, 0, 0, 6, rng.pick(REAGENTS)));
      fx.flasks.push(...flask(v, f, 3, 0, 6, rng.pick(REAGENTS)));
      for (const hb of P.hts.top >= 34 ? [12, 19] : [12]) {
        box(v, f, 0, 0, hb, 6, 3, hb + 1, M.METAL, 6);
        for (const u of [0, 5]) put(v, f, u, 0, hb - 1, M.METAL, 3);
        fx.flasks.push(...flask(v, f, 0, 0, hb + 1, rng.pick(REAGENTS)));
        fx.flasks.push(...flask(v, f, 3, 0, hb + 1, rng.pick(REAGENTS)));
      }
      break;
    }
    case 'rack': {
      box(v, f, 0, 0, 0, 4, 4, 14, M.METAL, 3);
      box(v, f, 0, 3, 0, 4, 4, 14, DARK, 2);
      box(v, f, 0, 0, 14, 4, 4, 15, M.METAL, 6);
      for (let h = 0; h < 14; h++) for (const u of [0, 3]) put(v, f, u, 3, h, M.METAL, 5);
      for (let h = 2; h < 13; h += 2) {
        for (const u of [1, 2]) {
          if (rng.chance(0.2)) continue;
          const m = rng.pick([M.LED_RED, M.NEON_GREEN, M.LED_AMBER, M.NEON_CYAN, M.NEON_GREEN]);
          put(v, f, u, 3, h, m, 6);
          fx.blinkers.push({ i: cell(v, f, u, 3, h), on: m, period: rng.range(0.4, 2.5), phase: rng.range(0, 3), duty: rng.range(0.3, 0.8) });
        }
      }
      for (const u of [1, 2]) put(v, f, u, 3, 1, M.METAL, 6);
      poster(v, f, 'notice', -1, 16);
      break;
    }
    case 'shower': {
      for (let h = 0; h <= 16; h++) put(v, f, 1, 0, h, M.METAL, 5);
      put(v, f, 1, 1, 16, M.METAL, 5);
      box(v, f, 0, 2, 15, 3, 3, 16, M.METAL, 7);
      for (let h = 11; h < 15; h++) put(v, f, 2, 2, h, M.METAL, 4);
      put(v, f, 2, 2, 10, M.GOLD_ORE, 6);
      box(v, f, 0, 1, 7, 3, 3, 8, M.METAL, 6);
      for (let u = 0; u < 3; u++) for (let w = 0; w < 3; w++) put(v, f, u, w, -1, u === 1 && w === 1 ? DARK : M.METAL, 5);
      poster(v, f, 'first', 0, 18);
      break;
    }
    case 'plant':
      plant(v, f, 0, 0, 3, 12, rng);
      break;
    case 'extinguisher': {
      box(v, f, 0, 0, 0, 1, 2, 6, M.CLOTH, 5);
      box(v, f, 0, 0, 6, 1, 2, 7, M.METAL, 6);
      for (let h = 2; h < 6; h++) put(v, f, 1, 1, h, DARK, 2);
      put(v, f, 0, -1, 4, M.METAL, 4);
      box(v, f, 0, -1, 9, 2, 0, 11, M.CLOTH, 6);
      break;
    }
  }
}

// An anatomy skeleton hung on a stand in the back corner.
function skeleton(v: Voxels, f: Frame): void {
  for (const [du, dw] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) put(v, f, 3 + du, 2 + dw, 0, M.METAL, 3);
  for (let h = 1; h < 16; h++) put(v, f, 3, 1, h, M.METAL, 4);
  put(v, f, 3, 2, 15, M.METAL, 6);
  const FIG = [
    '.BBB.', // 14
    '.KBK.', // 13
    '..B..', // 12
    '.BBB.', // 11
    'B.B.B', // 10
    'BBBBB', // 9
    'B.B.B', // 8
    'B.B.B', // 7
    '.BBB.', // 6
    '.B.B.', // 5
    '.B.B.', // 4
    '.B.B.', // 3
    '.B.B.', // 2
    'BB.BB', // 1
  ];
  FIG.forEach((row, r) => {
    for (let i = 0; i < 5; i++) {
      if (row[i] === '.') continue;
      put(v, f, 1 + i, 2, 14 - r, row[i] === 'K' ? DARK : M.BONE, row[i] === 'K' ? 1 : 6);
    }
  });
}

// A coat stand with two lab coats.
function coatStand(v: Voxels, f: Frame): void {
  for (let h = 0; h < 14; h++) put(v, f, 1, 7, h, M.METAL, 4);
  for (const [du, dw] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(v, f, 1 + du, 7 + dw, 0, M.METAL, 3);
  for (let h = 6; h < 13; h++) {
    put(v, f, 0, 7, h, M.CANDLE, h === 12 ? 7 : 5);
    put(v, f, 1, 8, h, M.CANDLE, h === 12 ? 7 : 6);
  }
  put(v, f, 1, 8, 9, M.PLASTIC, 5); // a teal pen in a pocket
}

// ── islands on the open floor ────────────────────────────────────────────
function island(v: Voxels, P: Plan, i: Island, rng: Rng, fx: Fixtures): void {
  const f = i.f;
  switch (i.kind) {
    case 'tanks':
      specimenTanks(v, f, i.n, P.hts.top, rng, fx);
      break;
    case 'bench':
      labBench(v, f, rng, fx);
      break;
    case 'fish':
      fishTank(v, f, fx);
      break;
    case 'rat':
      ratCage(v, f, fx);
      break;
    case 'lounge':
      lounge(v, f, fx);
      break;
    case 'ladder':
      jacobsLadder(v, f, fx);
      break;
    case 'slab':
      operatingSlab(v, f, fx);
      break;
    case 'plant': {
      const mutant = P.islands.filter((q) => q.kind === 'plant').indexOf(i) === 0;
      plant(v, f, 0, 0, 5, mutant ? 11 : rng.int(8, 12), rng, mutant);
      if (mutant) fx.glows.push({ p: at(f, 2.5, 2.5, 8), color: hex('#7dffb0'), radius: 9, intensity: 0.25, pulse: 0.1 });
      break;
    }
    case 'reactor':
      reactor(v, f, i.lu, fx);
      break;
    case 'desk':
      desk(v, f, rng.chance(0.55));
      break;
    case 'planter':
      planter(v, f, rng);
      break;
    case 'cart':
      cart(v, f, rng, fx);
      break;
    case 'drums':
      drums(v, f);
      break;
    case 'crates':
      crates(v, f);
      break;
    case 'jar':
      specimenJar(v, f, rng, fx);
      break;
    case 'lamp':
      floorLamp(v, f, fx);
      break;
    case 'globe':
      plasmaGlobe(v, f, fx);
      break;
    case 'sprout':
      plant(v, f, 0, 0, 3, rng.int(6, 9), rng);
      break;
    case 'servers':
      serverRow(v, f, rng, fx);
      break;
    case 'gas':
      gasCylinders(v, f, rng);
      break;
    case 'cryo':
      cryoPods(v, f, rng, fx);
      break;
  }
}

// A containment reactor in a hazard ring, n voxels across: a glowing
// crystal core inside a banded glass cylinder on a steel base ringed with
// lights.
function reactor(v: Voxels, f: Frame, n: number, fx: Fixtures): void {
  const C = (n - 1) / 2;
  const k = n / 11;
  const tall = Math.round(12 * k);
  const mid = Math.round(tall / 2) + 1;
  const cells: number[] = [];
  for (let w = 0; w < n; w++) {
    for (let u = 0; u < n; u++) {
      const d = Math.hypot(u - C, w - C);
      if (d >= 4.4 * k && d <= 5.5 * k) put(v, f, u, w, -1, Math.round(Math.atan2(w - C, u - C) * 4) & 1 ? M.GOLD_ORE : DARK, 4);
      if (d <= 4.1 * k) put(v, f, u, w, 0, M.METAL, 2);
      if (d <= 3.6 * k) put(v, f, u, w, 1, d > 3 * k && (u + w) & 1 ? M.NEON_CYAN : M.METAL, 6);
      for (let h = 2; h <= tall; h++) {
        if (d > 2.4 * k && d <= 3.4 * k) put(v, f, u, w, h, h === 2 || h === mid || h === tall ? M.METAL : M.GLASS, h === mid ? 6 : 4);
        else if (d <= 1.2 * k && h >= 3 && h < tall) {
          put(v, f, u, w, h, M.CRYSTAL, h === mid ? 7 : 4);
          cells.push(cell(v, f, u, w, h));
        }
      }
      if (d <= 3.4 * k) put(v, f, u, w, tall + 1, M.METAL, 5);
      if (d <= 2.2 * k) put(v, f, u, w, tall + 2, M.METAL, 6);
    }
  }
  for (let h = tall + 3; h < tall + 6; h++) put(v, f, C, C, h, M.METAL, 4);
  put(v, f, C, C, tall + 6, M.LED_RED, 7);
  fx.reactors.push({ core: at(f, C + 0.5, C + 0.5, mid + 0.5), cells, r: 1.9 * k, half: tall / 2 - 1 });
}

// A low glass partition: a steel sill, posts every six voxels, a teal
// band across the glass and a steel top rail.
function partition(v: Voxels, f: Frame, len: number): void {
  for (let u = 0; u < len; u++) {
    const post = u === 0 || u === len - 1 || u % 6 === 0;
    put(v, f, u, 0, 0, M.METAL, 3);
    for (let h = 1; h < 7; h++) put(v, f, u, 0, h, post ? M.METAL : h === 4 ? M.PLASTIC : M.GLASS, post ? 5 : 4);
    put(v, f, u, 0, 7, M.METAL, 6);
  }
}

// A desk with a monitor (asleep, or showing work), keyboard and mug, and a
// chair pushed in.
function desk(v: Voxels, f: Frame, on: boolean): void {
  for (const [u, w] of [[0, 0], [6, 0], [0, 2], [6, 2]]) for (let h = 0; h < 3; h++) put(v, f, u, w, h, M.METAL, 3);
  box(v, f, 0, 0, 3, 7, 3, 4, DARK, 3);
  box(v, f, 0, 2, 3, 7, 3, 4, DARK, 6);
  box(v, f, 2, 0, 4, 5, 1, 7, DARK, 1);
  box(v, f, 2, 1, 4, 5, 2, 7, on ? M.SCREEN : DARK, on ? 2 : 3);
  if (on) box(v, f, 2, 1, 6, 5, 2, 7, DARK, 1);
  box(v, f, 2, 2, 4, 5, 3, 5, M.METAL, 6);
  put(v, f, 5, 1, 4, M.CANDLE, 6);
  for (let h = 0; h < 2; h++) put(v, f, 3, 3, h, M.METAL, 3);
  box(v, f, 2, 3, 2, 5, 5, 3, M.PLASTIC, 5);
  box(v, f, 2, 4, 3, 5, 5, 5, M.PLASTIC, 3);
}

// A long teal planter trough of shrubs.
function planter(v: Voxels, f: Frame, rng: Rng): void {
  box(v, f, 0, 0, 0, 9, 3, 3, M.PLASTIC, 4);
  box(v, f, 0, 0, 2, 9, 3, 3, M.PLASTIC, 6);
  box(v, f, 1, 1, 2, 8, 2, 3, M.DIRT, 3);
  for (let h = 3; h < 7; h++) {
    for (let w = 0; w < 3; w++) {
      for (let u = 0; u < 9; u++) {
        const e = ((u - 4) / 4.6) ** 2 + (w - 1) ** 2 / 2.2 + ((h - 3.5) / 3) ** 2;
        if (e <= 1 && rng.chance(0.9 - e * 0.4)) put(v, f, u, w, h, M.LEAF, clamp(h - 1 + rng.int(-1, 1), 0, 7));
      }
    }
  }
}

// A steel trolley: two shelves on castors, a box below, a flask and a few
// test tubes on top.
function cart(v: Voxels, f: Frame, rng: Rng, fx: Fixtures): void {
  for (const [u, w] of [[0, 0], [5, 0], [0, 2], [5, 2]]) {
    put(v, f, u, w, 0, DARK, 1);
    for (let h = 1; h < 6; h++) put(v, f, u, w, h, M.METAL, 4);
  }
  box(v, f, 0, 0, 2, 6, 3, 3, M.METAL, 5);
  box(v, f, 0, 0, 5, 6, 3, 6, M.METAL, 6);
  box(v, f, 1, 0, 3, 3, 2, 5, M.CANDLE, 5);
  fx.flasks.push(...flask(v, f, 0, 0, 6, rng.pick(REAGENTS)));
  tubeRack(v, f, 3, 1, 0, 6, rng, fx.flasks);
}

// Two drums of hazardous waste, banded, lidded and marked.
function drums(v: Voxels, f: Frame): void {
  for (const u0 of [0, 4]) {
    for (let h = 0; h < 5; h++) {
      for (let dw = 0; dw < 3; dw++) {
        for (let du = 0; du < 3; du++) if (du === 1 || dw === 1) put(v, f, u0 + du, dw, h, h === 1 || h === 3 ? DARK : M.GOLD_ORE, h === 4 ? 6 : 4);
      }
    }
    put(v, f, u0 + 1, 1, 5, M.METAL, 6);
    put(v, f, u0 + 1, 2, 2, DARK, 1);
  }
}

// Wooden crates, one on another, and a carton beside them.
function crates(v: Voxels, f: Frame): void {
  const crate = (u0: number, w0: number, h0: number, n: number) => {
    for (let h = h0; h < h0 + n; h++) {
      for (let w = w0; w < w0 + n; w++) {
        for (let u = u0; u < u0 + n; u++) {
          const edges = +(u === u0 || u === u0 + n - 1) + +(w === w0 || w === w0 + n - 1) + +(h === h0 || h === h0 + n - 1);
          put(v, f, u, w, h, M.WOOD, edges >= 2 ? 1 : 4);
        }
      }
    }
  };
  crate(0, 0, 0, 4);
  crate(1, 0, 4, 3);
  box(v, f, 1, 3, 2, 3, 4, 3, M.CLOTH, 5);
  box(v, f, 4, 1, 0, 5, 3, 2, M.CANDLE, 5);
}

// A specimen jar on a steel pedestal: something pink floating in glowing
// liquid.
function specimenJar(v: Voxels, f: Frame, rng: Rng, fx: Fixtures): void {
  box(v, f, 0, 0, 0, 3, 3, 4, M.METAL, 3);
  box(v, f, 0, 0, 3, 3, 3, 4, M.METAL, 6);
  const liquid = rng.pick([M.ACID, M.POTION]);
  box(v, f, 0, 0, 4, 3, 3, 8, M.GLASS, 5);
  put(v, f, 1, 1, 5, M.NEON_PINK, 5);
  for (let h = 6; h < 8; h++) {
    put(v, f, 1, 1, h, liquid, 3);
    fx.flasks.push(cell(v, f, 1, 1, h));
  }
  box(v, f, 0, 0, 8, 3, 3, 9, M.METAL, 6);
}

// A floor lamp.
function floorLamp(v: Voxels, f: Frame, fx: Fixtures): void {
  for (const [du, dw] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) put(v, f, 1 + du, 1 + dw, 0, M.METAL, 3);
  for (let h = 1; h < 10; h++) put(v, f, 1, 1, h, M.METAL, 4);
  put(v, f, 1, 1, 10, M.LAMP, 7);
  box(v, f, 0, 0, 11, 3, 3, 12, M.CANDLE, 6);
  fx.glows.push({ p: at(f, 1.5, 1.5, 10), color: WARM, radius: 12, intensity: 0.3, pulse: 0 });
}

// A plasma globe on a pedestal; lightning crawls from its core to the glass.
function plasmaGlobe(v: Voxels, f: Frame, fx: Fixtures): void {
  box(v, f, 0, 0, 0, 3, 3, 3, DARK, 2);
  for (let dh = -1; dh <= 1; dh++) {
    for (let dw = -1; dw <= 1; dw++) for (let du = -1; du <= 1; du++) if (du * du + dw * dw + dh * dh <= 2.2) put(v, f, 1 + du, 1 + dw, 4 + dh, M.GLASS, 6);
  }
  put(v, f, 1, 1, 4, M.NEON_PURPLE, 7);
  fx.globes.push(at(f, 1.5, 1.5, 4.5));
}

// A row of server racks: steel rails, dark fronts full of blinking lamps,
// cables along the top.
function serverRow(v: Voxels, f: Frame, rng: Rng, fx: Fixtures): void {
  box(v, f, 0, 0, 0, 13, 4, 12, M.METAL, 3);
  box(v, f, 0, 3, 0, 13, 4, 12, DARK, 2);
  box(v, f, 0, 0, 12, 13, 4, 13, M.METAL, 6);
  for (let u = 0; u < 13; u += 4) for (let h = 0; h < 12; h++) put(v, f, u, 3, h, M.METAL, 5);
  for (let u = 0; u < 13; u++) {
    if (u % 4 === 0) continue;
    put(v, f, u, 3, 1, M.METAL, u & 1 ? 6 : 4);
    for (let h = 3; h < 11; h += 2) {
      if (rng.chance(0.35)) continue;
      const m = rng.pick([M.NEON_GREEN, M.NEON_GREEN, M.LED_AMBER, M.NEON_CYAN, M.LED_RED]);
      put(v, f, u, 3, h, m, 6);
      fx.blinkers.push({ i: cell(v, f, u, 3, h), on: m, period: rng.range(0.3, 2), phase: rng.range(0, 3), duty: rng.range(0.3, 0.85) });
    }
  }
  for (let u = 0; u < 13; u++) put(v, f, u, 1, 13, u % 3 ? DARK : M.PLASTIC, 2);
  fx.glows.push({ p: at(f, 6.5, 5, 6), color: hex('#7dffb0'), radius: 10, intensity: 0.2, pulse: 0.15 });
}

// Gas cylinders chained in a steel stand, each a different colour.
function gasCylinders(v: Voxels, f: Frame, rng: Rng): void {
  box(v, f, 0, 0, 0, 9, 3, 1, M.METAL, 3);
  for (const u of [0, 8]) for (let h = 1; h < 8; h++) put(v, f, u, 0, h, M.METAL, 4);
  for (let u = 0; u < 9; u++) put(v, f, u, 0, 6, M.METAL, 6);
  const colors = [M.CLOTH, M.PLASTIC, M.GOLD_ORE, M.METAL, M.BRIMSTONE];
  for (const u0 of [1, 4, 6]) {
    const m = rng.pick(colors);
    const tall = rng.int(7, 9);
    for (let h = 1; h < tall; h++) for (let du = 0; du < 2; du++) put(v, f, u0 + du, 1, h, m, h === tall - 1 ? 6 : du ? 3 : 5);
    put(v, f, u0, 1, tall, M.METAL, 7);
    put(v, f, u0, 2, tall - 1, DARK, 2);
  }
}

// Cryo pods: upright steel coffins with frosted glass fronts, a sleeper
// in each, cold light and frost drifting down inside.
function cryoPods(v: Voxels, f: Frame, rng: Rng, fx: Fixtures): void {
  for (let k = 0; k < 3; k++) {
    const u0 = k * 4;
    box(v, f, u0, 0, 0, u0 + 4, 5, 1, M.METAL, 3);
    box(v, f, u0, 0, 13, u0 + 4, 5, 15, M.METAL, 5);
    box(v, f, u0, 0, 1, u0 + 4, 1, 13, M.METAL, 2);
    for (const u of [u0, u0 + 3]) box(v, f, u, 0, 1, u + 1, 5, 13, M.METAL, 4);
    for (let h = 1; h < 13; h++) {
      for (let u = u0 + 1; u <= u0 + 2; u++) {
        put(v, f, u, 4, h, h < 3 || rng.chance(0.15) ? M.ICE : M.GLASS, 5);
      }
    }
    // the sleeper
    for (let h = 2; h < 9; h++) for (let u = u0 + 1; u <= u0 + 2; u++) put(v, f, u, 2, h, M.PLASTIC, h < 5 ? 3 : 5);
    for (let u = u0 + 1; u <= u0 + 2; u++) {
      put(v, f, u, 2, 9, M.BONE, 6);
      put(v, f, u, 2, 10, M.BONE, 7);
    }
    for (let u = u0 + 1; u <= u0 + 2; u++) put(v, f, u, 4, 13, M.NEON_CYAN, 6);
    fx.frost.push(at(f, u0 + 2, 3, 12));
    fx.glows.push({ p: at(f, u0 + 2, 6, 8), color: AQUA, radius: 9, intensity: 0.25, pulse: 0.08 });
  }
}

// A row of specimen tanks on a plinth: glass cylinders of glowing liquid
// between steel posts, capped and cabled, each with something floating in
// it: a brain, a homunculus, an eye.
function specimenTanks(v: Voxels, f: Frame, n: number, top: number, rng: Rng, fx: Fixtures): void {
  const lu = n * TANK_PITCH + 1;
  const lw = 9;
  const TH = clamp(top - 18, 9, 15); // glass height
  box(v, f, 0, 0, 0, lu, lw, 1, M.METAL, 3);
  box(v, f, 0, 0, 1, lu, lw, 2, M.METAL, 5);
  for (let u = 1; u < lu - 1; u += 2) put(v, f, u, lw - 1, 0, M.NEON_CYAN, 5);
  const kinds = ['brain', 'homunculus', 'eye'];
  const first = rng.int(0, 2);
  for (let k = 0; k < n; k++) {
    const cu = 4 + TANK_PITCH * k;
    const cw = 4;
    const liquid = rng.pick([M.ACID, M.ACID, M.POTION, M.WATER]);
    const cells: number[] = [];
    for (let dw = -4; dw <= 4; dw++) {
      for (let du = -4; du <= 4; du++) {
        const d = Math.hypot(du, dw);
        const u = cu + du;
        const w = cw + dw;
        if (d <= 3.4) put(v, f, u, w, 2, M.METAL, 2);
        for (let h = 3; h < 3 + TH; h++) {
          if (d <= 2.3) {
            if (h < 2 + TH) {
              put(v, f, u, w, h, liquid, 3);
              cells.push(cell(v, f, u, w, h));
            }
          } else if (d <= 3.3) {
            put(v, f, u, w, h, M.GLASS, 5);
          }
        }
        if (d <= 3.4) put(v, f, u, w, 3 + TH, M.METAL, 6);
        if (d <= 2.2) put(v, f, u, w, 4 + TH, M.METAL, 4);
        if (Math.abs(du) === 3 && Math.abs(dw) === 3) for (let h = 2; h < 3 + TH; h++) put(v, f, u, w, h, M.METAL, 4);
      }
    }
    for (let h = 5 + TH; h < 7 + TH; h++) put(v, f, cu, cw, h, DARK, 2);
    put(v, f, cu + 1, cw, 5 + TH, DARK, 2);
    specimen(v, f, cu, cw, 3 + Math.floor(TH / 2), kinds[(first + k) % 3]);
    fx.tanks.push({ p: at(f, cu + 0.5, cw + 0.5, 3), height: TH - 1, cells, color: LIQUID_LIGHT[liquid] ?? AQUA });
  }
}

function specimen(v: Voxels, f: Frame, cu: number, cw: number, hc: number, kind: string): void {
  if (kind === 'brain') {
    for (let dh = -2; dh <= 2; dh++) {
      for (let dw = -2; dw <= 2; dw++) {
        for (let du = -2; du <= 2; du++) {
          if ((du / 1.7) ** 2 + (dw / 1.4) ** 2 + (dh / 1.2) ** 2 <= 1) put(v, f, cu + du, cw + dw, hc + dh, M.NEON_PINK, (du + dh) & 1 ? 3 : 6);
        }
      }
    }
    for (let h = hc - 4; h < hc - 1; h++) put(v, f, cu, cw, h, M.NEON_PINK, 2);
  } else if (kind === 'homunculus') {
    const FIG = ['..K..', '.KKK.', '..K..', '.KKK.', 'K.K.K', '..K..', '.K.K.', '.K.K.'];
    FIG.forEach((row, r) => {
      for (let i = 0; i < 5; i++) if (row[i] === 'K') put(v, f, cu - 2 + i, cw, hc + 3 - r, DARK, 2);
    });
    put(v, f, cu, cw + 1, hc + 3, M.NEON_GREEN, 7);
  } else {
    for (let dh = -2; dh <= 2; dh++) {
      for (let dw = -2; dw <= 2; dw++) {
        for (let du = -2; du <= 2; du++) if (du * du + dw * dw + dh * dh <= 2.6) put(v, f, cu + du, cw + dw, hc + dh, M.TILE, 7);
      }
    }
    for (const [du, dh] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(v, f, cu + du, cw + 1, hc + dh, M.PLASTIC, 5);
    put(v, f, cu, cw + 1, hc, DARK, 0);
    put(v, f, cu, cw - 2, hc, M.NEON_PINK, 3);
  }
}

// A lab bench island: cupboards at both ends, a resin top, a Bunsen burner
// under a round flask on a tripod, Erlenmeyer flasks, test tubes and a
// notebook kept well clear of the flame.
function labBench(v: Voxels, f: Frame, rng: Rng, fx: Fixtures): void {
  const lu = 15;
  const lw = 6;
  const TOP = 4;
  for (const u0 of [0, lu - 4]) {
    box(v, f, u0, 0, 0, u0 + 4, lw, TOP, M.PLASTIC, 4);
    box(v, f, u0, lw - 1, 0, u0 + 4, lw, 1, DARK, 2);
    put(v, f, u0 + 1, lw - 1, 2, M.METAL, 7);
    put(v, f, u0 + 2, lw - 1, 2, M.METAL, 7);
  }
  box(v, f, 4, 1, 1, lu - 4, 2, 2, M.METAL, 5);
  box(v, f, 0, 0, TOP, lu, lw, TOP + 1, DARK, 3);
  box(v, f, 0, lw - 1, TOP, lu, lw, TOP + 1, DARK, 6);
  // burner, tripod, gauze, flask
  put(v, f, 3, 3, TOP + 1, M.METAL, 3);
  put(v, f, 3, 3, TOP + 2, M.METAL, 5);
  for (const [du, dw] of [[-1, -1], [1, -1], [0, 1]]) for (let h = TOP + 1; h < TOP + 5; h++) put(v, f, 3 + du, 3 + dw, h, M.METAL, 4);
  box(v, f, 2, 2, TOP + 5, 5, 5, TOP + 6, M.METAL, 6);
  const brew = rng.pick([M.POTION, M.ACID, M.SLUDGE]);
  for (const [du, dw] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) put(v, f, 3 + du, 3 + dw, TOP + 6, M.GLASS, 5);
  for (let h = TOP + 7; h < TOP + 9; h++) {
    for (let du = -1; du <= 1; du++) for (let dw = -1; dw <= 1; dw++) put(v, f, 3 + du, 3 + dw, h, du || dw ? M.GLASS : brew, du || dw ? 5 : 3);
  }
  for (let h = TOP + 9; h < TOP + 11; h++) for (const [du, dw] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) put(v, f, 3 + du, 3 + dw, h, M.GLASS, 6);
  put(v, f, 4, 3, TOP + 1, DARK, 2);
  put(v, f, 5, 3, TOP + 1, DARK, 2);
  put(v, f, 3, 3, TOP + 3, M.FIRE, 2, 5);
  fx.burners.push(at(f, 3, 3, TOP + 3));
  fx.boils.push({ i: cell(v, f, 3, 3, TOP + 8), mouth: at(f, 3, 3, TOP + 11) });
  // flasks, test tubes, a notebook and pencil
  fx.flasks.push(...flask(v, f, 6, 0, TOP + 1, rng.pick(REAGENTS)));
  fx.flasks.push(...flask(v, f, 10, 0, TOP + 1, rng.pick(REAGENTS)));
  tubeRack(v, f, 6, 3, 3, TOP + 1, rng, fx.flasks);
  box(v, f, 13, 1, TOP + 1, 15, 3, TOP + 2, M.PAPER, 6);
  put(v, f, 13, 3, TOP + 1, M.GOLD_ORE, 6);
}

// A fish tank on a black cabinet: sand, weed, a little castle, a lamp in
// the lid. The fish are let in by the weather, so they can swim about
// without the world remembering them as water.
function fishTank(v: Voxels, f: Frame, fx: Fixtures): void {
  box(v, f, 0, 0, 0, 9, 5, 5, DARK, 3);
  box(v, f, 0, 4, 0, 9, 5, 1, DARK, 1);
  box(v, f, 0, 0, 4, 9, 5, 5, M.METAL, 6);
  box(v, f, 0, 0, 5, 9, 5, 13, M.GLASS, 4);
  box(v, f, 1, 1, 6, 8, 4, 7, M.SAND);
  box(v, f, 1, 1, 7, 8, 4, 12, M.WATER, 3);
  box(v, f, 1, 1, 12, 8, 4, 13, M.AIR);
  box(v, f, 0, 0, 13, 9, 5, 14, DARK, 2);
  box(v, f, 2, 2, 13, 7, 3, 14, M.LAMP, 6);
  for (const [u, w, n] of [[2, 1, 4], [6, 3, 3], [3, 3, 2], [1, 2, 3]]) for (let h = 7; h < 7 + n; h++) put(v, f, u, w, h, M.LEAF, 4 + (h & 1));
  box(v, f, 5, 1, 7, 7, 2, 9, M.BRICK, 4);
  put(v, f, 5, 1, 9, M.BRICK, 6);
  fx.aquaria.push({ f, fish: [], ready: false });
  fx.glows.push({ p: at(f, 4.5, 2.5, 11), color: AQUA, radius: 12, intensity: 0.35, pulse: 0 });
}

// The rat's cage on a little table: a tray, wire all round, a wheel at the
// back and a food bowl. The rat itself is drawn by the weather.
function ratCage(v: Voxels, f: Frame, fx: Fixtures): void {
  for (const [u, w] of [[0, 0], [7, 0], [0, 5], [7, 5]]) for (let h = 0; h < 3; h++) put(v, f, u, w, h, M.METAL, 3);
  box(v, f, 0, 0, 3, 8, 6, 4, M.WOOD, 5);
  box(v, f, 1, 1, 4, 7, 5, 5, M.PLASTIC, 5);
  for (let h = 5; h <= 9; h++) {
    for (let w = 1; w <= 4; w++) {
      for (let u = 1; u <= 6; u++) {
        const side = u === 1 || u === 6 || w === 1 || w === 4;
        const corner = (u === 1 || u === 6) && (w === 1 || w === 4);
        if (h === 9) {
          if (side || u & 1) put(v, f, u, w, h, M.METAL, 6);
        } else if (corner || (side && ((u + w) & 1) === 0)) {
          put(v, f, u, w, h, M.METAL, 5);
        }
      }
    }
  }
  for (let h = 5; h <= 8; h++) {
    for (let u = 2; u <= 5; u++) {
      const d = Math.hypot(u - 3.5, h - 6.5);
      if (d >= 1 && d <= 2) put(v, f, u, 2, h, M.METAL, 6);
    }
  }
  put(v, f, 5, 2, 5, M.METAL, 7);
  put(v, f, 2, 2, 5, M.GOLD_ORE, 5);
  fx.rats.push({ f, p: 2, dir: 1, wheel: true, next: 0, angle: 0 });
}

// A sofa, a side table with a boombox (it plays all day; see weather).
function lounge(v: Voxels, f: Frame, fx: Fixtures): void {
  box(v, f, 0, 0, 0, 7, 3, 2, M.PLASTIC, 4);
  box(v, f, 0, 0, 2, 7, 1, 4, M.PLASTIC, 3);
  for (const u of [0, 6]) box(v, f, u, 0, 2, u + 1, 3, 3, M.PLASTIC, 5);
  box(v, f, 1, 1, 1, 6, 3, 2, M.PLASTIC, 6);
  put(v, f, 3, 1, 1, M.PLASTIC, 2);
  put(v, f, 3, 2, 1, M.PLASTIC, 2);
  put(v, f, 1, 1, 2, M.BRIMSTONE, 5);
  box(v, f, 8, 0, 0, 12, 4, 3, M.WOOD, 3);
  box(v, f, 8, 0, 3, 12, 4, 4, M.WOOD, 6);
  box(v, f, 9, 1, 4, 12, 3, 6, DARK, 2);
  for (const u of [9, 11]) {
    put(v, f, u, 2, 4, M.METAL, 6);
    put(v, f, u, 2, 5, M.METAL, 4);
  }
  put(v, f, 10, 2, 5, M.NEON_CYAN, 5);
  for (const u of [9, 10, 11]) put(v, f, u, 1, 6, M.METAL, 5);
  fx.booms.push({ f });
}

// A Jacob's ladder: two copper rods in a V on insulators over a little
// console. An arc climbs between them, pops at the top and starts again.
function jacobsLadder(v: Voxels, f: Frame, fx: Fixtures): void {
  box(v, f, 0, 0, 0, 6, 4, 4, M.METAL, 3);
  box(v, f, 0, 0, 4, 6, 4, 5, M.METAL, 6);
  put(v, f, 1, 3, 2, M.LED_AMBER, 6);
  put(v, f, 2, 3, 2, M.NEON_GREEN, 6);
  put(v, f, 3, 3, 2, M.LED_RED, 6);
  put(v, f, 4, 3, 3, M.SCREEN, 5);
  put(v, f, 2, 2, 5, M.CANDLE, 6);
  put(v, f, 3, 2, 5, M.CANDLE, 6);
  for (let k = 0; k < LADDER; k++) {
    put(v, f, 2 - (k >> 2), 2, 6 + k, M.ROCK, 6);
    put(v, f, 3 + (k >> 2), 2, 6 + k, M.ROCK, 6);
  }
  fx.ladders.push(f);
}
const LADDER = 10; // the rods' height

// An operating slab in a hazard-striped bay: a patient under a sheet with
// green feet and neck bolts, between two coil towers that zap across it.
function operatingSlab(v: Voxels, f: Frame, fx: Fixtures): void {
  for (let u = -1; u <= 17; u++) {
    for (let w = -1; w <= 7; w++) if (u === -1 || u === 17 || w === -1 || w === 7) put(v, f, u, w, -1, ((u + w) >> 1) & 1 ? M.GOLD_ORE : DARK, 4);
  }
  for (const [u, w] of [[3, 1], [13, 1], [3, 5], [13, 5]]) for (let h = 0; h < 4; h++) put(v, f, u, w, h, M.METAL, 3);
  box(v, f, 3, 1, 4, 14, 6, 5, M.METAL, 6);
  box(v, f, 6, 2, 5, 13, 5, 6, M.CANDLE, 5);
  box(v, f, 7, 3, 6, 12, 4, 7, M.CANDLE, 6);
  box(v, f, 4, 3, 5, 6, 4, 7, M.LEAF, 5);
  box(v, f, 4, 3, 7, 6, 4, 8, DARK, 2);
  put(v, f, 5, 2, 6, M.METAL, 7);
  put(v, f, 5, 4, 6, M.METAL, 7);
  put(v, f, 13, 2, 5, M.LEAF, 5);
  put(v, f, 13, 4, 5, M.LEAF, 5);
  for (const pole of [1, 15]) {
    box(v, f, pole - 1, 2, 0, pole + 1, 5, 2, M.METAL, 3);
    for (let h = 2; h < 12; h++) put(v, f, pole, 3, h, M.METAL, 4);
    for (let h = 6; h <= 10; h++) {
      for (const [du, dw] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) put(v, f, pole + du, 3 + dw, h, h & 1 ? M.ROCK : M.ROCK_DARK, h & 1 ? 6 : 4);
    }
    for (let dh = -1; dh <= 1; dh++) {
      for (let dw = -1; dw <= 1; dw++) for (let du = -1; du <= 1; du++) if (du * du + dw * dw + dh * dh <= 1.7) put(v, f, pole + du, 3 + dw, 13 + dh, M.METAL, dh > 0 ? 7 : 6);
    }
  }
  fx.slabs.push({ f, next: 2, twitch: 0 });
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx): void {
  const fx = STATE.get(c.v)?.fx;
  if (!fx) return;
  const v = c.v;

  // Tube lights hum; one is on its way out and stutters.
  for (const l of fx.lamps) {
    const on = !l.broken || (c.t + l.p.x) % 6 > 1.1 || Math.sin(c.t * 37) * Math.sin(c.t * 13 + l.p.y) > 0.2;
    for (const i of l.cells) {
      const m = v.mat[i];
      if ((m === M.LAMP || m === DARK) && m !== (on ? M.LAMP : DARK)) v.set(i, on ? M.LAMP : DARK, on ? 7 : 2);
    }
    if (on) light(c, l.p, COOL, 30, 0.42);
  }

  clockHands(c, fx);
  pulses(c, fx);
  storm(c, fx);

  // Status lamps blink, each to its own beat.
  for (const b of fx.blinkers) {
    const on = (c.t + b.phase) % b.period < b.period * b.duty;
    const m = v.mat[b.i];
    if ((m === b.on || m === DARK) && m !== (on ? b.on : DARK)) v.set(b.i, on ? b.on : DARK, on ? 6 : 2);
  }

  // Glassware bubbles.
  if (fx.flasks.length && c.rng.chance(c.dt * 8)) {
    const i = fx.flasks[c.rng.int(0, fx.flasks.length - 1)];
    const m = v.mat[i];
    if (LIQ[m]) {
      v.set(i, m, c.rng.int(3, 7));
      if (i + v.W * v.D < v.size && v.mat[i + v.W * v.D] === M.AIR) glint(c, { x: v.xOf(i) + 0.5, y: v.yOf(i) + 0.5, z: v.zOf(i) + 1 }, 0, 0, 1.2, 0.35, tone(m, 7));
    }
  }

  // Bunsen burners and what boils over them.
  for (const p of fx.burners) {
    keepFire(c, Math.floor(p.x), Math.floor(p.y), Math.floor(p.z), 5);
    light(c, { x: p.x + 0.5, y: p.y + 0.5, z: p.z + 0.5 }, FLAME, 10, 0.5 * flicker(c.t, p.x));
  }
  for (const b of fx.boils) {
    const m = v.mat[b.i];
    if (!LIQ[m]) continue;
    if (c.rng.chance(c.dt * 6)) v.set(b.i, m, c.rng.int(4, 7));
    if (c.rng.chance(c.dt * 1.5)) puff(c, Math.floor(b.mouth.x), Math.floor(b.mouth.y), Math.floor(b.mouth.z), M.STEAM, 40);
    if (c.rng.chance(c.dt * 3)) emit(c, { kind: 'drop', x: b.mouth.x + 0.5, y: b.mouth.y + 0.5, z: b.mouth.z, vx: c.rng.range(-0.5, 0.5), vy: c.rng.range(-0.5, 0.5), vz: c.rng.range(2, 3.5), life: 0.5, color: tone(m, 7), glow: true, gravity: 20 });
  }

  // Ducts and hoods vent.
  for (const s of fx.vents) {
    if (c.rng.chance(c.dt * s.rate)) puff(c, Math.floor(s.p.x), Math.floor(s.p.y), Math.floor(s.p.z), s.m, c.rng.int(40, 70));
  }
  for (const g of fx.glows) light(c, g.p, g.color, g.radius, g.intensity * (1 + g.pulse * Math.sin(c.t * 2 + g.p.x)));
  for (const p of fx.heat) {
    if (c.rng.chance(c.dt * 1.2)) emit(c, { kind: 'ember', x: p.x + c.rng.range(-2.5, 2.5), y: p.y, z: p.z, vx: 0, vy: 0, vz: c.rng.range(1, 2), life: 1, color: HOTPLATE, glow: false, gravity: -0.5 });
  }

  // Specimen tanks glow and bubble.
  fx.tanks.forEach((t, k) => {
    light(c, { x: t.p.x, y: t.p.y, z: t.p.z + t.height / 2 }, t.color, 16, 0.4 + 0.1 * Math.sin(c.t * 1.3 + k));
    if (c.rng.chance(c.dt * 4)) {
      const a = c.rng.range(0, Math.PI * 2);
      const r = c.rng.range(0, 1.8);
      const vz = c.rng.range(2, 3.5);
      glint(c, { x: t.p.x + r * Math.cos(a), y: t.p.y + r * Math.sin(a), z: t.p.z + 0.5 }, 0, 0, vz, (t.height - 1) / vz, mix(t.color, [255, 255, 255], 0.6));
    }
    if (t.cells.length && c.rng.chance(c.dt * 10)) {
      const i = t.cells[c.rng.int(0, t.cells.length - 1)];
      if (LIQ[v.mat[i]]) v.set(i, v.mat[i], c.rng.int(2, 6));
    }
  });

  for (const a of fx.aquaria) aquarium(c, a);
  for (const r of fx.rats) rat(c, r);

  // Jacob's ladders: an arc climbs the V and pops off the top.
  for (const f of fx.ladders) {
    const p = (c.t % 1.4) / 1.4;
    const k = p * (LADDER - 1);
    const spread = Math.floor(k) >> 2;
    const h = 6.5 + k;
    const from = at(f, 2.5 - spread, 2.5, h);
    const to = at(f, 3.5 + spread, 2.5, h);
    arc(c, from, to, 0.25, 0.08);
    light(c, at(f, 3, 2.5, h), VIOLET, 12, 0.55);
    if (beat(c, 1.4)) sparks(c, at(f, 3, 2.5, 6 + LADDER), 5, 2.5, ARC);
  }

  // The operating slab zaps now and then and the patient twitches.
  for (const s of fx.slabs) {
    if (c.t >= s.next) {
      s.next = c.t + c.rng.range(2.5, 6);
      s.twitch = c.t + 0.5;
      const a = at(s.f, 1.5, 3.5, 13.5);
      const b = at(s.f, 15.5, 3.5, 13.5);
      arc(c, a, b, 0.8, 0.25);
      arc(c, a, b, 0.8, 0.2);
      sparks(c, a, 5, 3, ARC);
      sparks(c, b, 5, 3, ARC);
    }
    const zap = s.twitch - c.t;
    if (zap > 0.25) light(c, at(s.f, 8.5, 3.5, 12), ARC[0], 30, 1.3);
    const twitch = zap > 0;
    put(v, s.f, 9, 5, 5, twitch ? M.AIR : M.LEAF, 4);
    put(v, s.f, 10, 5, 5, twitch ? M.LEAF : M.AIR, 4);
    light(c, at(s.f, 1.5, 3.5, 13.5), VIOLET, 7, 0.25);
    light(c, at(s.f, 15.5, 3.5, 13.5), VIOLET, 7, 0.25);
  }

  // Reactor cores throb, sparks circle inside the glass, now and then a
  // tongue of lightning licks the wall of the vessel.
  for (const r of fx.reactors) {
    const pulse = 0.5 + 0.5 * Math.sin(c.t * 3);
    light(c, r.core, CORE, 18, 0.4 + 0.4 * pulse);
    for (let k = 0; k < 2; k++) {
      const a = c.t * 4 + k * Math.PI;
      glint(c, { x: r.core.x + r.r * Math.cos(a), y: r.core.y + r.r * Math.sin(a), z: r.core.z + r.half * Math.sin(c.t * 1.7 + k) }, 0, 0, 0, 0.07, CORE);
    }
    if (r.cells.length && c.rng.chance(c.dt * 8)) {
      const i = r.cells[c.rng.int(0, r.cells.length - 1)];
      if (v.mat[i] === M.CRYSTAL) v.set(i, M.CRYSTAL, c.rng.int(3, 7));
    }
    if (c.rng.chance(c.dt * 0.8)) {
      const a = c.rng.range(0, Math.PI * 2);
      const z = r.core.z + c.rng.range(-r.half, r.half);
      arc(c, { x: r.core.x + Math.cos(a), y: r.core.y + Math.sin(a), z }, { x: r.core.x + r.r * 1.2 * Math.cos(a), y: r.core.y + r.r * 1.2 * Math.sin(a), z: z + c.rng.range(-1, 1) }, 0.3, 0.1);
    }
  }
  fx.globes.forEach((g, k) => {
    light(c, g, CORE, 8, 0.25 + 0.08 * Math.sin(c.t * 5 + k));
    if (c.rng.chance(c.dt * 5)) {
      const a = c.rng.range(0, Math.PI * 2);
      const e = c.rng.range(-0.7, 0.7);
      arc(c, g, { x: g.x + 1.3 * Math.cos(a), y: g.y + 1.3 * Math.sin(a), z: g.z + e }, 0.15, 0.08);
    }
  });
  for (const p of fx.frost) {
    if (c.rng.chance(c.dt * 1.5)) glint(c, { x: p.x + c.rng.range(-1, 1), y: p.y + c.rng.range(-0.5, 0.5), z: p.z }, 0, 0, -1.2, 1.5, CHALK);
  }

  // The boombox plays.
  for (const b of fx.booms) {
    if (c.rng.chance(c.dt * 1.8)) emit(c, { kind: 'rune', ...at(b.f, c.rng.pick([9.5, 11.5]), 2.5, 5.5), vx: c.rng.range(-0.4, 0.4), vy: c.rng.range(-0.4, 0.4), vz: c.rng.range(1, 1.8), life: 1.6, color: c.rng.pick(NOTES), glow: true, gravity: -0.4 });
    const i = cell(v, b.f, 10, 2, 5);
    if (v.mat[i] === M.NEON_CYAN || v.mat[i] === M.NEON_PINK) v.set(i, Math.floor(c.t * 4) % 3 ? M.NEON_CYAN : M.NEON_PINK, 5);
  }
}

// The clock's hands, from the wall clock's own time, redrawn each second.
function clockHands(c: Ctx, fx: Fixtures): void {
  const k = fx.clock;
  if (!k) return;
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hr = now.getHours() % 12;
  const key = (hr * 60 + min) * 60 + sec;
  if (k.last === key) return;
  k.last = key;
  for (const [i, m, s] of k.face) {
    const cur = c.v.mat[i];
    if (cur === M.CANDLE || cur === DARK || cur === M.CLOTH || cur === M.METAL) c.v.set(i, m, s);
  }
  const hand = (turn: number, len: number, m: number, sh: number) => {
    const a = turn * Math.PI * 2;
    for (let r = 1; r <= len; r++) put(c.v, k.f, k.u + Math.round(Math.sin(a) * r), -1, k.h + Math.round(Math.cos(a) * r), m, sh);
  };
  hand((hr + min / 60) / 12, 2, DARK, 2);
  hand((min + sec / 60) / 60, 3, DARK, 1);
  hand(sec / 60, 3, M.CLOTH, 6);
  put(c.v, k.f, k.u, -1, k.h, M.METAL, 7);
}

// Pulses of brighter potion along the reagent line.
function pulses(c: Ctx, fx: Fixtures): void {
  const n = fx.tube.length;
  if (!n) return;
  const v = c.v;
  const lit: number[] = [];
  const head = Math.floor(c.t * 14);
  for (let p = head % 18; p < n; p += 18) {
    lit.push(fx.tube[p]);
    if (p > 0) lit.push(fx.tube[p - 1]);
  }
  for (const i of fx.tubeLit) if (!lit.includes(i) && v.mat[i] === M.POTION) v.set(i, M.POTION, 2);
  for (const i of lit) if (v.mat[i] === M.POTION) v.set(i, M.POTION, 7);
  fx.tubeLit = lit;
}

// Lightning in the windows: the sky flashes white with a bolt through one
// window, lighting the room, sometimes twice; stars twinkle in between.
function storm(c: Ctx, fx: Fixtures): void {
  if (!fx.windows.length) return;
  const v = c.v;
  const st = fx.storm;
  const paint = (on: boolean) => {
    const bolt = on ? fx.windows[c.rng.int(0, fx.windows.length - 1)] : null;
    let col = bolt ? c.rng.int(0, bolt.cols - 1) : 0;
    for (const w of fx.windows) {
      for (let r = w.rows - 1; r >= 0; r--) {
        if (w === bolt) col = clamp(col + c.rng.int(-1, 1), 0, w.cols - 1);
        for (let q = 0; q < w.cols; q++) {
          const i = w.grid[q + w.cols * r];
          if (i < 0) continue;
          const m = v.mat[i];
          if (m !== M.COAL && m !== M.TILE && m !== M.LAMP) continue;
          if (!on) v.set(i, M.COAL, 1 + (i % 3));
          else v.set(i, w === bolt && q === col ? M.LAMP : M.TILE, 7);
        }
      }
    }
  };
  if (c.t >= st.next) {
    st.next = c.t + c.rng.range(7, 16);
    st.until = c.t + 0.12;
    st.again = c.rng.chance(0.5) ? c.t + 0.3 : 0;
    paint(true);
  } else if (st.again && c.t >= st.again) {
    st.again = 0;
    st.until = c.t + 0.08;
    paint(true);
  }
  if (st.until) {
    if (c.t >= st.until) {
      st.until = 0;
      paint(false);
    } else {
      for (const w of fx.windows) light(c, w.p, STORM, 30, 1.3);
    }
  }
  if (fx.stars.length && c.rng.chance(c.dt * 3)) {
    const i = fx.stars[c.rng.int(0, fx.stars.length - 1)];
    if (v.mat[i] === M.LAMP) v.set(i, M.LAMP, c.rng.int(1, 5));
  }
}

// Fish dart about the tank: each swaps places with the water it swims into.
function aquarium(c: Ctx, a: Fixtures['aquaria'][number]): void {
  const v = c.v;
  const f = a.f;
  if (!a.ready) {
    a.ready = true;
    for (const m of [M.GOLD_ORE, M.CLOTH, M.NEON_CYAN, M.BRIMSTONE]) {
      for (let tries = 0; tries < 8; tries++) {
        const i = cell(v, f, c.rng.int(1, 7), c.rng.int(1, 3), c.rng.int(8, 10));
        if (v.mat[i] !== M.WATER) continue;
        v.set(i, m, 6);
        a.fish.push({ i, m, dir: c.rng.chance(0.5) ? 1 : -1, next: c.t + c.rng.range(0.2, 1) });
        break;
      }
    }
  }
  for (const fish of a.fish) {
    if (c.t < fish.next || v.mat[fish.i] !== fish.m) continue;
    fish.next = c.t + c.rng.range(0.25, 0.8);
    const x = v.xOf(fish.i);
    const y = v.yOf(fish.i);
    const z = v.zOf(fish.i);
    const r = c.rng.next();
    let dx = f.ux * fish.dir;
    let dy = f.uy * fish.dir;
    let dz = 0;
    if (r < 0.2) {
      dx = f.vx * (c.rng.chance(0.5) ? 1 : -1);
      dy = f.vy * (dx === 0 ? (c.rng.chance(0.5) ? 1 : -1) : 0);
    } else if (r < 0.35) {
      dx = 0;
      dy = 0;
      dz = c.rng.chance(0.5) ? 1 : -1;
    }
    const j = v.idx(x + dx, y + dy, z + dz);
    if (v.inside(x + dx, y + dy, z + dz) && v.mat[j] === M.WATER && v.mat[j + v.W * v.D] !== M.AIR) {
      v.set(fish.i, M.WATER, 3);
      v.set(j, fish.m, 6);
      fish.i = j;
    } else if (dz === 0) {
      fish.dir = -fish.dir;
    }
  }
  if (c.rng.chance(c.dt * 4)) glint(c, at(f, 7.5, 1.5, 7.2), c.rng.range(-0.2, 0.2), 0, 3, 1.4, AQUA);
}

// The rat: runs in its wheel for a while (the spokes whirl), then pads up
// and down the front of the cage, nose glowing.
function rat(c: Ctx, r: Fixtures['rats'][number]): void {
  const v = c.v;
  const f = r.f;
  if (c.t >= r.next) {
    if (r.wheel) {
      r.wheel = c.rng.chance(0.3);
      r.next = c.t + c.rng.range(1, 3);
    } else if (c.rng.chance(0.25)) {
      r.wheel = true;
      r.p = 2;
      r.dir = 1;
      r.next = c.t + c.rng.range(2, 5);
    } else {
      if (c.rng.chance(0.4)) r.dir = -r.dir;
      else r.p = r.p === 2 ? 3 : 2;
      r.next = c.t + c.rng.range(0.3, 1);
    }
  }
  r.angle += c.dt * (r.wheel ? 14 : 0);
  // the row the rat lives in: three voxels, nose first
  for (let u = 2; u <= 5; u++) {
    const k = u - r.p;
    const body = k >= 0 && k <= 2;
    const nose = body && (r.dir > 0 ? k === 2 : k === 0);
    put(v, f, u, 3, 5, body ? (nose ? M.NEON_PINK : M.BONE) : M.AIR, nose ? 6 : 7);
  }
  const q = Math.floor(r.angle) & 1;
  put(v, f, 3, 2, 6, q ? M.METAL : M.AIR, 4);
  put(v, f, 4, 2, 7, q ? M.METAL : M.AIR, 4);
  put(v, f, 4, 2, 6, q ? M.AIR : M.METAL, 4);
  put(v, f, 3, 2, 7, q ? M.AIR : M.METAL, 4);
}

// ── points of interest ───────────────────────────────────────────────────
function pois(L: Layout): Poi[] {
  return plan(L).pois.map((p) => ({ ...p, face: p.face ? { ...p.face } : undefined }));
}

const BUILD: BuildStyle = { mats: [M.METAL, M.GLASS, M.SCREEN, M.PLASTIC], shape: 'machine' };

export const lab: Biome = {
  id: 'lab',
  name: 'Mad Science Lab',
  tagline: 'Bubbling flasks, a tesla coil and a very busy chalkboard',
  palette: PALETTE,
  backdrop: hex('#0b1a20'),
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  costume: 'scientist',
  finale: { colors: [[214, 255, 240], [150, 240, 214], [200, 230, 255]], glow: true, gravity: 10 }, // foam, gone where it lands
  build: BUILD,
  pois,
};

export default lab;
