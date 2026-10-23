import type { RGB } from '../../term/color.ts';
import { hex, mix } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import { buildSites, slotRect, slotsOn, wallGaps } from '../layout.ts';
import { M, MATERIALS } from '../materials.ts';
import { hash3, noise2, onWall, puff, wallOf, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, PointLight, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';
import type { Disc, Pt } from './floor.ts';
import { by, Floor, growth, scatter } from './floor.ts';

// Orbital Station: a cosy deck in orbit. Navy hull plate and pale panels,
// a band of viewports with a grand one behind the holo-table where a planet
// turns and its moon creeps by, portholes full of twinkling stars, a glass
// floor over the void; a nav console, server racks, a radar scope, a
// pulsing reactor, a comms dish, a holo-table, sleep pods and an airlock.
// Out on the deck: hydroponics under grow lights, a galley with a coffee
// machine, a lounge, an aquarium, planter trees, EVA suits on a rack, a
// treadmill, crates and consoles, and a little drone that hoovers up
// whatever the crew drops.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#05070d'),
  wall: hex('#1b2436'),
  wall2: hex('#212b3f'),
  floor: hex('#36435a'),
  floor2: hex('#252f42'),
  text: hex('#e6eef9'),
  dim: hex('#7686a0'),
  accent: hex('#ff9a3c'),
  accent2: hex('#4cc6ff'),
  panel: hex('#0a101c'),
  panelText: hex('#d8e5f4'),
  border: hex('#3d6fa8'),
  bubble: hex('#edf4ff'),
  bubbleText: hex('#0d1726'),
  good: hex('#5ee08f'),
  warn: hex('#ffb238'),
  bad: hex('#ff5468'),
};

const GRADE: Grade = { ambient: hex('#8696b8'), illum: 1, bloom: 0.65, vignette: 0.2 };

// What everything is made of, by role. The view out of the windows is
// recoloured stone and such, sealed in the hull where nothing reaches it.
const STEEL = M.METAL; // frames, fittings, trim
const HULL = M.CONCRETE; // navy hull plate
const PANEL = M.PLASTER; // pale wall panels
const WHITE = M.TILE; // station-white bodies
const ORANGE = M.PLASTIC; // livery, hazard paint, insulation
const SPACE = M.OBSIDIAN; // the void, dark screens
const SEAM = M.ROCK_DARK; // seams and shadow gaps
const DECK = M.ROCK; // deck plate
const FABRIC = M.CARPET; // cushions, mattresses
const OCEAN = M.DIRT;
const DEEP = M.CLOTH; // the ocean toward the night side
const LAND = M.MOSS; // also the radar's afterglow
const DESERT = M.BRICK;
const CLOUD = M.BONE;
const NIGHT = M.WOOD;
const CITY = M.GOLD_ORE;
const MOON = M.CANDLE;
const NEBULA = M.BRIMSTONE;
const FAINT = M.PAPER; // dim stars
const SCOPE = M.COAL; // the radar's dark glass

const COLORS: Partial<Record<number, string>> = {
  [M.METAL]: '#8f9bb0',
  [M.CONCRETE]: '#3b4660',
  [M.PLASTER]: '#a7b2c4',
  [M.TILE]: '#e2e8f0',
  [M.PLASTIC]: '#f08a3a',
  [M.OBSIDIAN]: '#04060d',
  [M.ROCK_DARK]: '#171d2b',
  [M.ROCK]: '#5b667e',
  [M.CARPET]: '#3f6096',
  [M.GLASS]: '#5f86b4',
  [M.CRYSTAL]: '#b4f0ff',
  [M.LAMP]: '#fff8ea',
  [M.LEAF]: '#4fae4a',
  [M.DIRT]: '#3a86dc',
  [M.CLOTH]: '#173a72',
  [M.MOSS]: '#6cb852',
  [M.BRICK]: '#c4a066',
  [M.BONE]: '#f2f6fc',
  [M.WOOD]: '#0b1430',
  [M.GOLD_ORE]: '#ffd27a',
  [M.CANDLE]: '#a4acbb',
  [M.BRIMSTONE]: '#1e1740',
  [M.PAPER]: '#8d99b8',
  [M.COAL]: '#062016',
};

const CYAN: RGB = hex('#5ce8ff');
const WHITE_HOT: RGB = hex('#e8fbff');
const SUNLIT: RGB = hex('#cfe0ff');
const LAMPLIGHT: RGB = hex('#e6eeff');
const SCREEN_GLOW: RGB = hex('#6fd8ff');
const AMBER: RGB = hex('#ffb04a');
const RED: RGB = hex('#ff4848');
const GREEN: RGB = hex('#7dff7a');
const GROW: RGB = hex('#c77dff');
const HOLO: RGB = hex('#8ff6ff');
const HOLO_DIM: RGB = hex('#2f86ad');
const DATA: RGB = hex('#7ff0ff');
const DUST: RGB = hex('#b9c8e6');
const DUST_GLOW: RGB = hex('#56688c');
const BUBBLE: RGB = hex('#cfefff');
const SNORE: RGB = hex('#dfe8ff');

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
const TAU = Math.PI * 2;

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const alongEnd = (L: Layout, wall: Side) => (wall === 'left' ? L.D : L.W);
const along = (s: Slot) => (s.wall === 'left' ? s.y0 : s.x0);
const wrap = (a: number) => ((a % TAU) + TAU) % TAU;

// On a wall (or in a slot's frame), a round on screen: `a` along the wall
// and `h` up, sheared by the projection (a step along drops half a pixel).
const discD = (da: number, dh: number) => Math.hypot(da, dh - da / 2);

// ── slot frame ───────────────────────────────────────────────────────────
// a along the wall, b out into the room (negative: into the slab), h up.
function sput(v: Voxels, s: Slot, a: number, b: number, h: number, m: number, shade?: number): void {
  v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, m, shade);
}

function sget(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.get(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

function sidx(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  const x = wx(s, a, b);
  const y = wy(s, a, b);
  const z = s.z0 + h;
  return v.inside(x, y, z) ? v.idx(x, y, z) : -1;
}

// Fills [a0, a1) x [b0, b1) x [h0, h1).
function sfill(v: Voxels, s: Slot, a0: number, b0: number, h0: number, a1: number, b1: number, h1: number, m: number, shade?: number): void {
  for (let h = h0; h < h1; h++) for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) sput(v, s, a, b, h, m, shade);
}

// A direction in the slot's frame as world (x, y).
function dirOf(s: Slot, da: number, db: number): [number, number] {
  return s.wall === 'right' ? [da, db] : [db, da];
}

// Sets voxel i to m (shade) if it still holds one of the materials a
// fixture cycles through, so nothing that replaced it is painted over.
function cycle(v: Voxels, i: number, m: number, shade: number, states: readonly number[]): void {
  if (i < 0) return;
  const cur = v.mat[i];
  if (cur === m ? v.shade[i] === shade : !states.includes(cur)) return;
  v.set(i, m, shade);
}

// ── the view ─────────────────────────────────────────────────────────────
// Space is drawn in screen-aligned coordinates (u right, w up) per plane:
// 0 the right wall, 1 the left wall, 2 the glass floor. The planet and its
// moon sit in the right wall's view.
type Planet = { u: number; w: number; r: number };

const SPIN = 0.05; // the planet's turn, radians per second
const STAR_P = 0.035;
const BIG_P = 0.0035;
const BIG: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const STARS = [SPACE, FAINT, M.SCREEN, M.LAMP];
const SKY_MAT = new Uint8Array(256);
for (const m of [SPACE, FAINT, M.SCREEN, M.LAMP, NEBULA, OCEAN, DEEP, LAND, DESERT, CLOUD, NIGHT, CITY, MOON, SEAM, M.NEON_CYAN]) SKY_MAT[m] = 1;

// Material << 3 | shade of the view at cell (ka, kh) of a plane, (u, w)
// its screen-aligned position, at time t.
function sky(seed: number, p: Planet | null, plane: number, ka: number, kh: number, u: number, w: number, t: number): number {
  if (p) {
    const q = planetAt(seed, p, u, w, t);
    if (q >= 0) return q;
    const mo = moonAt(p, u, w, t);
    if (mo >= 0) return mo;
  }
  // a few big stars, a cross of light that pulses
  for (const [da, dh] of BIG) {
    if (hash3(seed, ka + da, kh + dh, 30 + plane) >= BIG_P) continue;
    const ph = hash3(seed, ka + da, kh + dh, 31 + plane);
    const lit = Math.sin(t * (0.8 + ph) + ph * 50) > -0.6;
    if (!da && !dh) return ((lit ? M.LAMP : M.SCREEN) << 3) | 7;
    return lit ? (M.SCREEN << 3) | 3 : (FAINT << 3) | 2;
  }
  const r = hash3(seed, ka, kh, 40 + plane);
  if (r < STAR_P) {
    let lvl = r < STAR_P * 0.18 ? 3 : r < STAR_P * 0.42 ? 2 : 1;
    const ph = hash3(seed, ka, kh, 50 + plane);
    const tw = Math.sin(t * (0.5 + ph * 2) + ph * 97);
    if (tw > 0.86) lvl--;
    else if (tw < -0.985 && lvl < 3) lvl++;
    if (lvl > 0) return (STARS[lvl] << 3) | 7;
  }
  const n = 0.7 * noise2(seed + plane * 7, u * 0.045, w * 0.07) + 0.3 * noise2(seed + 3 + plane, u * 0.16, w * 0.2);
  if (n > 0.6) return (NEBULA << 3) | Math.min(7, ((n - 0.6) * 30) | 0);
  return (SPACE << 3) | (r < 0.5 ? 2 : 4);
}

// The planet: oceans, continents, desert, ice caps and weather, lit from
// the upper left, city lights on the night side, a glowing limb.
function planetAt(seed: number, p: Planet, u: number, w: number, t: number): number {
  const x = (u - p.u) / p.r;
  const y = (w - p.w) / p.r;
  const d2 = x * x + y * y;
  const rim = 1 + 1.6 / p.r;
  if (d2 >= rim * rim) return -1;
  if (d2 >= 1) {
    const lit = -0.55 * x + 0.4 * y;
    if (d2 < (1 + 0.8 / p.r) ** 2 && lit > -0.3) return (M.NEON_CYAN << 3) | (lit > 0.3 ? 7 : 3);
    if (lit > 0.25) return (M.SCREEN << 3) | 1;
    return -1;
  }
  const z = Math.sqrt(1 - d2);
  const light = -0.6 * x + 0.45 * y + 0.66 * z;
  const lon = Math.atan2(x, z) + t * SPIN;
  const ice = y > 0.8 || y < -0.84;
  const shore = Math.sin(lon * 2.3 + Math.sin(y * 3.1) * 1.4) + 0.6 * Math.sin(lon * 5.7 - y * 4.3 + 1.1);
  const land = !ice && shore > 0.45;
  const cloud = Math.sin(y * 8 + Math.sin(lon * 3 + t * 0.03) * 1.7) > 0.72;
  if (light < 0.05) {
    if (land && !cloud && hash3(seed, Math.floor(lon * 9), Math.floor(y * 8), 60) > 0.62) return (CITY << 3) | 6;
    return (NIGHT << 3) | (light < -0.25 ? 0 : 3);
  }
  if (light < 0.3) return cloud || ice ? (MOON << 3) | 2 : land ? (LAND << 3) | 0 : (DEEP << 3) | ((light * 20) | 0);
  const m = cloud || ice ? CLOUD : land ? (Math.abs(y) < 0.35 && shore > 0.95 ? DESERT : LAND) : OCEAN;
  return (m << 3) | Math.min(7, ((light - 0.3) * 11) | 0);
}

// The moon, creeping along its orbit behind the planet.
function moonAt(p: Planet, u: number, w: number, t: number): number {
  const ang = 2.4 + t * 0.008;
  const mr = Math.max(1.6, p.r * 0.22);
  const x = (u - (p.u + Math.cos(ang) * p.r * 2.3)) / mr;
  const y = (w - (p.w + p.r * 0.5 + Math.sin(ang) * p.r * 0.3)) / mr;
  const d2 = x * x + y * y;
  if (d2 >= 1) return -1;
  const light = -0.6 * x + 0.48 * y + 0.64 * Math.sqrt(1 - d2);
  if (light < 0.1) return (SEAM << 3) | 2;
  return (MOON << 3) | Math.min(7, (light * 8) | 0);
}

// ── fixtures ─────────────────────────────────────────────────────────────
// What weather() animates, recorded by generate() per world.
type Cells = { idx: number[]; ka: number[]; kh: number[]; pl: number[]; u: number[]; w: number[]; at: number };
type Blink = { i: number; on: number; off: number; period: number; phase: number; duty: number };
type Beacon = { i: number; x: number; y: number; z: number; phase: number };
type Vent = { x: number; y: number; z: number; period: number; phase: number; burst: number };
type Plant = { x: number; y: number; base: number; top: number; max: number };
type Board = { cols: number[][]; phase: number[]; leds: number[] };
// A fish in its tank; i < 0 until it is released (at voxel -1 - i).
type Fish = { i: number; m: number; dir: number; lo: [number, number, number]; hi: [number, number, number] };
type Belt = { cells: number[]; k: number[] };
type Drone = { x: number; y: number; hx: number; hy: number; tx: number; ty: number; next: number; rest: number; cells: number[]; head: number; roam: number[] };
type Fixtures = {
  seed: number;
  planet: Planet;
  sun: PointLight;
  near: Cells; // round the planet: refreshed often
  far: Cells; // just stars
  studs: number[];
  studK: number[];
  blinks: Blink[];
  beacons: Beacon[];
  vents: Vent[];
  lamps: PointLight[];
  plants: Plant[];
  leaves: number[];
  grow: PointLight[];
  mist: Array<[number, number, number]>;
  fish: Fish[];
  belts: Belt[];
  galley: { steam: [number, number, number]; light: PointLight } | null;
  boards: Board[];
  drone: Drone | null;
  holo: { x: number; y: number; z: number; r: number } | null;
};

const FIXTURES = new WeakMap<Voxels, Fixtures>();

const cells = (): Cells => ({ idx: [], ka: [], kh: [], pl: [], u: [], w: [], at: 0 });

// Puts a cell of view at voxel (x, y, z) and records it for weather().
function addSky(v: Voxels, fx: Fixtures, x: number, y: number, z: number, plane: number, ka: number, kh: number, u: number, w: number): void {
  if (!v.inside(x, y, z)) return;
  const i = v.idx(x, y, z);
  const p = plane === 0 ? fx.planet : null;
  const q = sky(fx.seed, p, plane, ka, kh, u, w, 0);
  v.set(i, q >> 3, q & 7);
  const near = p !== null && Math.abs(u - p.u) < p.r * 2.9 + 4;
  const c = near ? fx.near : fx.far;
  c.idx.push(i);
  c.ka.push(ka);
  c.kh.push(kh);
  c.pl.push(plane);
  c.u.push(u);
  c.w.push(w);
}

// Re-evaluates the next `per` cells of view, round robin.
function refresh(v: Voxels, fx: Fixtures, c: Cells, per: number, t: number): void {
  const n = c.idx.length;
  for (let k = 0; k < Math.min(per, n); k++) {
    const j = c.at;
    c.at = j + 1 === n ? 0 : j + 1;
    const i = c.idx[j];
    const cur = v.mat[i];
    if (!SKY_MAT[cur]) continue; // knocked out
    const q = sky(fx.seed, c.pl[j] === 0 ? fx.planet : null, c.pl[j], c.ka[j], c.kh[j], c.u[j], c.w[j], t);
    if (cur !== q >> 3 || v.shade[i] !== (q & 7)) v.set(i, q >> 3, q & 7);
  }
}

// ── props ────────────────────────────────────────────────────────────────
const SCREEN_STATES = [M.LED_AMBER, WHITE, M.SCREEN, SEAM, SPACE];
const LED_STATES = [SEAM, M.NEON_GREEN, M.LED_AMBER, M.SCREEN, M.LED_RED];

// write: the nav console. A desk of keys under a big screen plotting the
// course, the ship's marker blinking on it; at work the plot races and
// data scrolls down its side.
function navConsole(): Prop {
  const S0 = 6; // the screen's bottom row
  const ROWS = 7;
  const pixel = (sa: number, sh: number, cols: number, t: number, active: boolean): [number, number] => {
    const ph = t * (active ? 1.4 : 0.25);
    const ship = Math.floor(cols * 0.45);
    const course = 3 + 2.2 * Math.sin(sa * 0.55 + ph) * Math.cos(sa * 0.21 - ph * 0.4);
    const on = Math.abs(sh - course) < 0.55;
    if (sa === ship && Math.abs(sh - course) < 1.1) return Math.floor(t * (active ? 6 : 2)) & 1 ? [M.LED_AMBER, 7] : [WHITE, 7];
    if (on && (sa < ship || (sa & 1) === 0)) return [M.SCREEN, sa < ship ? 7 : 2];
    if (active && sa >= cols - 2 && hash3(7, sa, sh, Math.floor(t * 7)) > 0.45) return [M.SCREEN, 4];
    if (sa % 3 === 0 && sh % 3 === 0) return [SEAM, 6];
    return [SPACE, 3];
  };
  return {
    name: 'nav console',
    build(v, s) {
      const L = s.len;
      const cols = L - 2;
      for (let h = S0 - 1; h <= S0 + ROWS; h++) {
        for (let a = 0; a < L; a++) {
          sput(v, s, a, 0, h, HULL, 1);
          const edge = a === 0 || a === L - 1 || h === S0 - 1 || h === S0 + ROWS;
          if (edge) sput(v, s, a, 1, h, STEEL, h === S0 + ROWS ? 7 : 5);
          else {
            const [m, sh] = pixel(a - 1, h - S0, cols, 0, false);
            sput(v, s, a, 1, h, m, sh);
          }
        }
      }
      sfill(v, s, 1, 1, 0, L - 1, 6, 1, SEAM, 2); // toe kick
      sfill(v, s, 1, 1, 1, L - 1, 6, 4, WHITE, 4); // cabinet
      sfill(v, s, 2, 5, 2, L - 2, 6, 3, ORANGE, 4); // livery stripe
      sfill(v, s, 0, 1, 4, L, 7, 5, STEEL, 6); // desk top
      for (let a = 2; a < L - 2; a++) sput(v, s, a, 5, 4, SEAM, 2); // keys, dark
      // side monitors on the desk, angled in
      for (const a of [0, L - 1]) {
        sfill(v, s, a, 3, 5, a + 1, 5, 8, HULL, 2);
        sput(v, s, a, 4, 6, M.SCREEN, 3);
        sput(v, s, a, 4, 7, M.SCREEN, 5);
      }
    },
    tick(c, s, active) {
      const v = c.v;
      const L = s.len;
      const cols = L - 2;
      for (let sa = 0; sa < cols; sa++) {
        for (let sh = 0; sh < ROWS; sh++) {
          const [m, shade] = pixel(sa, sh, cols, c.t, active);
          cycle(v, sidx(v, s, sa + 1, 1, S0 + sh), m, shade, SCREEN_STATES);
        }
      }
      const tick = Math.floor(c.t * (active ? 9 : 0.8));
      for (let a = 2; a < L - 2; a++) {
        const on = hash3(3, a, 0, tick) > (active ? 0.45 : 0.75);
        cycle(v, sidx(v, s, a, 5, 4), on ? (a % 3 ? M.SCREEN : M.LED_AMBER) : SEAM, on ? 7 : 2, LED_STATES);
      }
      c.light({ x: wx(s, L / 2, 3), y: wy(s, L / 2, 3), z: s.z0 + 9, color: SCREEN_GLOW, radius: active ? 18 : 12, intensity: active ? 0.42 + 0.05 * Math.sin(c.t * 13) : 0.22 });
    },
  };
}

// read: the data archive. Server racks set back into the wall, LEDs winking
// down their fronts; reading runs a scan line down them and sends bits of
// data drifting off.
function archive(): Prop {
  const TOP = 15;
  const LEDS = [M.NEON_GREEN, M.NEON_GREEN, M.LED_AMBER, M.SCREEN];
  const ledOf = (a: number, h: number) => LEDS[Math.floor(hash3(11, a, h, 0) * LEDS.length)];
  const racks = (s: Slot) => {
    const n = Math.max(1, Math.floor((s.len + 1) / 5));
    const off = Math.floor((s.len - (n * 5 - 1)) / 2);
    return Array.from({ length: n }, (_, k) => off + k * 5);
  };
  const isLed = (h: number) => (h & 1) === 1 && h < TOP - 1;
  return {
    name: 'data archive',
    build(v, s) {
      for (const a0 of racks(s)) {
        sfill(v, s, a0, -2, 0, a0 + 4, 2, TOP, HULL, 1);
        for (let h = 0; h < TOP; h++) {
          for (let a = a0; a < a0 + 4; a++) {
            const edge = a === a0 || a === a0 + 3 || h === 0 || h === TOP - 1;
            if (edge) sput(v, s, a, 2, h, STEEL, h === TOP - 1 ? 7 : 5);
            else if (isLed(h)) sput(v, s, a, 2, h, hash3(5, a, h, 1) > 0.4 ? ledOf(a, h) : SEAM, 6);
            else sput(v, s, a, 2, h, SEAM, 1);
          }
        }
        sfill(v, s, a0, -2, TOP, a0 + 4, 3, TOP + 1, STEEL, 6);
      }
      // the cable tray over them, into the wall
      for (let a = 0; a < s.len; a++) {
        sput(v, s, a, -1, TOP + 1, STEEL, 4);
        sput(v, s, a, 0, TOP + 1, a % 4 === 1 ? ORANGE : STEEL, a % 4 === 1 ? 4 : 6);
      }
    },
    tick(c, s, active) {
      const v = c.v;
      const rs = racks(s);
      for (let k = active ? 8 : 3; k > 0; k--) {
        const a = rs[c.rng.int(0, rs.length - 1)] + c.rng.int(1, 2);
        const h = 1 + 2 * c.rng.int(0, (TOP - 3) >> 1);
        const on = c.rng.chance(0.6);
        cycle(v, sidx(v, s, a, 2, h), on ? ledOf(a, h) : SEAM, on ? 6 : 1, LED_STATES);
      }
      const mid = s.len / 2;
      if (active) {
        // a scan line runs down the fronts
        const h = TOP - 2 - 2 * (Math.floor(c.t * 7) % ((TOP - 1) >> 1));
        for (const a0 of rs) for (const a of [a0 + 1, a0 + 2]) cycle(v, sidx(v, s, a, 2, h), M.SCREEN, 7, LED_STATES);
        if (c.rng.chance(c.dt * 6)) {
          const [ox, oy] = dirOf(s, 0, 1);
          const a = c.rng.range(0.5, s.len - 0.5);
          c.spawn({ kind: 'glint', x: wx(s, a, 3), y: wy(s, a, 3), z: s.z0 + c.rng.range(2, TOP - 2), vx: ox * c.rng.range(0.6, 1.4), vy: oy * c.rng.range(0.6, 1.4), vz: c.rng.range(0.4, 1.2), life: c.rng.range(1, 1.8), color: DATA, glow: true, gravity: -0.3 });
        }
      }
      c.light({ x: wx(s, mid, 4), y: wy(s, mid, 4), z: s.z0 + 8, color: active ? SCREEN_GLOW : GREEN, radius: active ? 18 : 11, intensity: active ? 0.45 : 0.18 });
    },
  };
}

// search: the scanner. A round radar scope on the wall over a desk, its
// beam sweeping and blips lighting up behind it; in use it sweeps fast and
// throws a sweeping green light over the floor.
function scanner(): Prop {
  const CH = 10; // the scope's centre height
  const R = 4.3;
  const BLIPS: ReadonlyArray<readonly [number, number]> = [[2.7, 0.7], [3.4, 2.6], [1.8, 4.3], [3.1, 5.4]];
  const centre = (s: Slot) => (s.len - 1) / 2;
  // The warning light, on the highest voxel of the bezel.
  const beaconAt = (s: Slot): [number, number] => {
    const ca = centre(s);
    let top: [number, number] = [Math.round(ca), 0];
    for (let a = 0; a < s.len; a++) {
      for (let h = 4; h <= CH + 7; h++) {
        const d = discD(a - ca, h - CH);
        if (d >= R && d < R + 1.3 && h > top[1]) top = [a, h];
      }
    }
    return [top[0], top[1] + 1];
  };
  const pixel = (da: number, dh: number, theta: number): [number, number] => {
    const dw = dh - da / 2;
    const d = Math.hypot(da, dw);
    if (d < 0.75) return [M.NEON_GREEN, 7];
    const lag = wrap(theta - Math.atan2(dw, da));
    for (const [br, ba] of BLIPS) {
      if (Math.hypot(da - br * Math.cos(ba), dw - br * Math.sin(ba)) < 0.75 && wrap(theta - ba) < 2.4) return [M.LED_AMBER, 7];
    }
    if (lag < 0.3) return [M.NEON_GREEN, 5];
    if (lag < 0.9) return [LAND, 6];
    if (lag < 1.6) return [LAND, 2];
    if (Math.abs(d - R * 0.58) < 0.45 || Math.abs(da) < 0.5 || Math.abs(dw) < 0.5) return [LAND, 0];
    return [SCOPE, 4];
  };
  const STATES = [M.NEON_GREEN, M.LED_AMBER, LAND, SCOPE];
  return {
    name: 'scanner',
    build(v, s) {
      const L = s.len;
      const ca = centre(s);
      sfill(v, s, 1, 0, 0, L - 1, 4, 1, SEAM, 2);
      sfill(v, s, 1, 0, 1, L - 1, 4, 3, WHITE, 4);
      sfill(v, s, 0, 0, 3, L, 4, 4, STEEL, 6);
      for (let a = 2; a < L - 2; a += 2) sput(v, s, a, 3, 3, SEAM, 2);
      for (let a = 0; a < L; a++) {
        for (let h = 4; h <= CH + 7; h++) {
          const d = discD(a - ca, h - CH);
          if (d < R) {
            const [m, sh] = pixel(a - ca, h - CH, 0);
            sput(v, s, a, 0, h, m, sh);
          } else if (d < R + 1.3) {
            const bolt = Math.abs(((Math.atan2(h - CH - (a - ca) / 2, a - ca) / TAU) * 8) % 1) < 0.18;
            sput(v, s, a, 0, h, STEEL, bolt ? 7 : 4);
            sput(v, s, a, 1, h, STEEL, 5);
          }
        }
      }
      const [ta, th] = beaconAt(s);
      sput(v, s, ta, 0, th, M.LED_RED, 7);
    },
    tick(c, s, active) {
      const v = c.v;
      const L = s.len;
      const ca = centre(s);
      const theta = c.t * (active ? 2.4 : 0.8);
      for (let a = 0; a < L; a++) {
        for (let h = 4; h <= CH + 6; h++) {
          if (discD(a - ca, h - CH) >= R) continue;
          const [m, sh] = pixel(a - ca, h - CH, theta);
          cycle(v, sidx(v, s, a, 0, h), m, sh, STATES);
        }
      }
      const [ta, th] = beaconAt(s);
      const red = c.t % 1.6 < 0.25;
      cycle(v, sidx(v, s, ta, 0, th), red ? M.LED_RED : SEAM, red ? 7 : 3, [M.LED_RED, SEAM]);
      for (let a = 2; a < L - 2; a += 2) {
        const on = hash3(9, a, 0, Math.floor(c.t * (active ? 7 : 1))) > 0.5;
        cycle(v, sidx(v, s, a, 3, 3), on ? M.NEON_GREEN : SEAM, on ? 6 : 2, LED_STATES);
      }
      const x = wx(s, ca, 1);
      const y = wy(s, ca, 1);
      c.light({ x, y, z: s.z0 + CH, color: GREEN, radius: active ? 16 : 11, intensity: active ? 0.42 : 0.22 });
      if (active) {
        const [ox, oy] = dirOf(s, Math.cos(theta) * 5, 6 + Math.sin(theta) * 3);
        c.light({ x: x + ox, y: y + oy, z: s.z0 + 1, color: GREEN, radius: 10, intensity: 0.4 });
      }
    },
  };
}

// run: the reactor. A crystal core in a glass column banded in steel on a
// hazard-striped plinth, coolant lines climbing out of the plinth into its
// lid; plasma rings ride up it and it pulses. Running a
// command makes it race, flash white-hot and blow coolant steam.
function reactor(): Prop {
  const centre = (s: Slot) => [Math.floor(s.len / 2), Math.floor(s.dep / 2)] as const;
  const RING: Array<[number, number]> = [];
  const CORE: Array<[number, number]> = [];
  for (let db = -3; db <= 3; db++) {
    for (let da = -3; da <= 3; da++) {
      const d = Math.hypot(da, db);
      if (d < 1.7) CORE.push([da, db]);
      else if (d < 2.6) RING.push([da, db]);
    }
  }
  const BASE = [M.AIR, M.NEON_CYAN];
  return {
    name: 'reactor',
    build(v, s) {
      const [ca, cb] = centre(s);
      for (let b = 0; b < s.dep; b++) {
        for (let a = 0; a < s.len; a++) {
          const da = a - ca;
          const db = b - cb;
          const d = Math.hypot(da, db);
          const ang = Math.atan2(db, da);
          if (d < 5.4) sput(v, s, a, b, 0, d >= 4.6 ? (Math.floor(((ang + Math.PI) / TAU) * 16) & 1 ? ORANGE : SEAM) : STEEL, d >= 4.6 ? 4 : 3);
          if (d < 4.6) sput(v, s, a, b, 1, HULL, 2);
          if (d < 4) sput(v, s, a, b, 2, STEEL, 5);
          for (let h = 3; h <= 13; h++) {
            if (h === 3 || h === 13) {
              if (d < 3.8) sput(v, s, a, b, h, STEEL, h === 13 ? 6 : 4);
            } else if (d < 1.7) sput(v, s, a, b, h, M.CRYSTAL, 5);
            else if (d < 2.6) sput(v, s, a, b, h, M.AIR);
            else if (d < 3.7) sput(v, s, a, b, h, h === 8 ? STEEL : M.GLASS, h === 8 ? 6 : 4);
          }
          if (Math.abs(da) === 3 && Math.abs(db) === 3) for (let h = 3; h <= 13; h++) sput(v, s, a, b, h, STEEL, 3);
          if (d < 3.2) sput(v, s, a, b, 14, HULL, 2);
          if (d < 2.2) sput(v, s, a, b, 15, STEEL, 5);
          if (d < 1.2) sput(v, s, a, b, 16, STEEL, 7);
        }
      }
      for (const da of [-4, -3, 3, 4]) {
        const a = ca + da;
        if (Math.abs(da) === 4) sput(v, s, a, cb, 1, M.LED_AMBER, 7);
      }
      sput(v, s, ca, cb, 17, M.LED_RED, 7);
      // coolant lines up out of the back of the plinth and over into the
      // column, and the vents on the lid
      for (const da of [-2, 2]) {
        for (let h = 1; h <= 11; h++) sput(v, s, ca + da, 0, h, STEEL, h === 11 ? 6 : 3);
        for (let b = 1; b < cb - 2; b++) for (const h of [10, 11]) sput(v, s, ca + da, b, h, STEEL, h === 11 ? 6 : 3);
        sput(v, s, ca + da, 0, 5, ORANGE, 4);
      }
      for (const da of [-3, 3]) sput(v, s, ca + da, cb, 15, STEEL, 6);
    },
    tick(c, s, active) {
      const v = c.v;
      const [ca, cb] = centre(s);
      const t = c.t;
      const span = 9;
      const at = (t * (active ? 7 : 2.2)) % span;
      for (let h = 4; h <= 12; h++) {
        const on = Math.abs(h - 4 - at) < 0.6 || Math.abs(h - 4 - ((at + span / 2) % span)) < 0.6;
        for (const [da, db] of RING) cycle(v, sidx(v, s, ca + da, cb + db, h), on ? M.NEON_CYAN : M.AIR, on ? 6 : 0, BASE);
      }
      // the core shimmers, a layer at a time; hot, it flashes
      const hc = c.rng.int(4, 12);
      for (const [da, db] of CORE) {
        const hot = active && c.rng.chance(0.45);
        cycle(v, sidx(v, s, ca + da, cb + db, hc), hot ? M.NEON_CYAN : M.CRYSTAL, c.rng.int(3, 7), [M.CRYSTAL, M.NEON_CYAN]);
      }
      // plinth lights chase round; the beacon on top blinks
      const chase = Math.floor(t * (active ? 8 : 2)) % 4;
      [[-4, 0], [0, -4], [4, 0], [0, 4]].forEach(([da, db], k) => {
        if (Math.hypot(da, db) < 4.6) cycle(v, sidx(v, s, ca + da, cb + db, 1), k === chase ? M.LED_AMBER : HULL, k === chase ? 7 : 2, [M.LED_AMBER, HULL]);
      });
      const blink = t % (active ? 0.6 : 1.4) < 0.2;
      cycle(v, sidx(v, s, ca, cb, 17), blink ? M.LED_RED : SEAM, blink ? 7 : 3, [M.LED_RED, SEAM]);
      const x = wx(s, ca + 0.5, cb + 0.5);
      const y = wy(s, ca + 0.5, cb + 0.5);
      const pulse = 0.5 + 0.5 * Math.sin(t * (active ? 5 : 1.4));
      c.light({ x, y, z: s.z0 + 8, color: active ? mix(CYAN, WHITE_HOT, pulse * 0.6) : CYAN, radius: active ? 24 + 6 * pulse : 16 + 4 * pulse, intensity: active ? 0.6 + 0.35 * pulse : 0.3 + 0.15 * pulse });
      if (blink) c.light({ x, y, z: s.z0 + 17.5, color: RED, radius: 8, intensity: 0.5 });
      // coolant vents
      const venting = active ? true : t % 9 < 1.2;
      if (venting && c.rng.chance(c.dt * (active ? 14 : 10))) {
        const da = c.rng.chance(0.5) ? -3 : 3;
        puff(c, wx(s, ca + da, cb), wy(s, ca + da, cb), s.z0 + 16, M.STEAM, c.rng.int(40, 70));
      }
    },
  };
}

// web: the comms array. A dish on a mast on its own pedestal, tipped up
// toward the room, its feed horn amber, a red light on the rim, and a
// console under it; transmitting sends rings of light out along its beam
// and data across the screens.
function commsArray(): Prop {
  const C = [4, 4, 11] as const; // the dish's vertex (a, b, h)
  const N = [0, 0.6, 0.8] as const; // its axis
  const E1 = [1, 0, 0] as const;
  const E2 = [0, 0.8, -0.6] as const;
  const F = 2.4;
  const R = 4.2;
  const FOCUS = [C[0] + N[0] * F, C[1] + N[1] * F, C[2] + N[2] * F] as const;
  const RIM_TOP = [4, 2, 16] as const;
  const SCREENS = [3, 4, 5];
  return {
    name: 'comms array',
    build(v, s) {
      for (let b = 1; b < 8; b++) {
        for (let a = 1; a < 8; a++) {
          const corner = (a === 1 || a === 7) && (b === 1 || b === 7);
          if (!corner) sput(v, s, a, b, 0, HULL, 2);
          if (a > 1 && a < 7 && b > 1 && b < 7) sput(v, s, a, b, 1, STEEL, 4);
        }
      }
      for (let h = 2; h < 10; h++) {
        sput(v, s, 4, 4, h, STEEL, 3);
        sput(v, s, 4, 3, h, STEEL, 5);
      }
      sfill(v, s, 6, 2, 2, 8, 4, 5, HULL, 2); // equipment box
      sput(v, s, 6, 4, 3, M.LED_AMBER, 7);
      sput(v, s, 7, 4, 3, M.NEON_GREEN, 7);
      // the console under the dish: a desk, its screens on a riser
      sfill(v, s, 2, 6, 0, 7, 9, 3, HULL, 2);
      sfill(v, s, 2, 6, 3, 7, 9, 4, STEEL, 6);
      sfill(v, s, 2, 6, 4, 7, 7, 6, HULL, 3);
      for (const a of SCREENS) for (const h of [4, 5]) sput(v, s, a, 6, h, M.SCREEN, 4);
      sput(v, s, 2, 8, 3, M.LED_AMBER, 7);
      sput(v, s, 6, 8, 3, M.NEON_GREEN, 7);
      for (let h = 6; h <= 16; h++) {
        for (let b = 0; b < 9; b++) {
          for (let a = 0; a < 9; a++) {
            const p = [a - C[0], b - C[1], h - C[2]];
            const u = p[0] * N[0] + p[1] * N[1] + p[2] * N[2];
            const rho2 = p[0] * p[0] + p[1] * p[1] + p[2] * p[2] - u * u;
            if (rho2 > R * R || Math.abs(u - rho2 / (4 * F)) > 0.72) continue;
            const rim = Math.sqrt(rho2) > R - 0.9;
            sput(v, s, a, b, h, rim ? STEEL : WHITE, rim ? 6 : rho2 < 2 ? 6 : 3);
          }
        }
      }
      // struts from the rim to the feed
      for (let k = 0; k < 3; k++) {
        const al = Math.PI / 2 + (k * TAU) / 3;
        const lift = (R * R) / (4 * F);
        const rim = [0, 1, 2].map((j) => C[j] + R * (Math.cos(al) * E1[j] + Math.sin(al) * E2[j]) + N[j] * lift);
        for (let i = 1; i < 10; i++) {
          const q = i / 10;
          const a = Math.round(rim[0] + (FOCUS[0] - rim[0]) * q);
          const b = Math.round(rim[1] + (FOCUS[1] - rim[1]) * q);
          const h = Math.round(rim[2] + (FOCUS[2] - rim[2]) * q);
          if (sget(v, s, a, b, h) === M.AIR) sput(v, s, a, b, h, STEEL, 4);
        }
      }
      sput(v, s, Math.round(FOCUS[0]), Math.round(FOCUS[1]), Math.round(FOCUS[2]), M.LED_AMBER, 7);
      sput(v, s, RIM_TOP[0], RIM_TOP[1], RIM_TOP[2] - 1, STEEL, 6);
      sput(v, s, RIM_TOP[0], RIM_TOP[1], RIM_TOP[2], M.LED_RED, 7);
    },
    tick(c, s, active) {
      const v = c.v;
      const t = c.t;
      const red = t % 2 < 0.3;
      cycle(v, sidx(v, s, RIM_TOP[0], RIM_TOP[1], RIM_TOP[2]), red ? M.LED_RED : SEAM, red ? 7 : 3, [M.LED_RED, SEAM]);
      const tick = Math.floor(t * (active ? 6 : 1.2));
      cycle(v, sidx(v, s, 6, 4, 3), hash3(2, tick, 0, 0) > 0.4 ? M.LED_AMBER : SEAM, 7, LED_STATES);
      cycle(v, sidx(v, s, 7, 4, 3), hash3(2, tick, 1, 0) > 0.3 ? M.NEON_GREEN : SEAM, 7, LED_STATES);
      for (const a of SCREENS) for (const h of [4, 5]) cycle(v, sidx(v, s, a, 6, h), M.SCREEN, active ? 3 + Math.floor(hash3(5, tick, a, h) * 5) : 4, [M.SCREEN]);
      const fx0 = wx(s, FOCUS[0] + 0.5, FOCUS[1] + 0.5);
      const fy0 = wy(s, FOCUS[0] + 0.5, FOCUS[1] + 0.5);
      const fz0 = s.z0 + FOCUS[2] + 0.5;
      if (red) c.light({ x: wx(s, RIM_TOP[0] + 0.5, RIM_TOP[1] + 0.5), y: wy(s, RIM_TOP[0] + 0.5, RIM_TOP[1] + 0.5), z: s.z0 + RIM_TOP[2] + 0.5, color: RED, radius: 8, intensity: 0.45 });
      const PULSE = 0.45;
      const since = t % PULSE;
      c.light({ x: fx0, y: fy0, z: fz0, color: AMBER, radius: active ? 16 : 9, intensity: active ? 0.3 + 0.6 * (1 - since / PULSE) : 0.22 });
      if (!active || since >= c.dt) return;
      const [nx, ny] = dirOf(s, N[0], N[1]);
      const [ex, ey] = dirOf(s, E1[0], E1[1]);
      const [gx, gy] = dirOf(s, E2[0], E2[1]);
      for (let k = 0; k < 12; k++) {
        const th = (k / 12) * TAU;
        const rx = Math.cos(th) * ex + Math.sin(th) * gx;
        const ry = Math.cos(th) * ey + Math.sin(th) * gy;
        const rz = Math.sin(th) * E2[2];
        c.spawn({ kind: 'glint', x: fx0, y: fy0, z: fz0, vx: nx * 7 + rx * 2.4, vy: ny * 7 + ry * 2.4, vz: N[2] * 7 + rz * 2.4, life: 1.1, color: k & 1 ? AMBER : CYAN, glow: true, gravity: 0 });
      }
    },
  };
}

// think: the holo-table. A table with a glowing grid top and a projector
// lens; over it a wireframe globe turns, made of light. Thinking spins it
// up, grows it and sends a satellite round it.
function holoTable(): Prop {
  const TOP = 4;
  const HC = 10.5; // the globe's centre height
  return {
    name: 'holo-table',
    build(v, s) {
      const L = s.len;
      const B = s.dep;
      sfill(v, s, 3, 1, 0, L - 3, B - 1, 1, STEEL, 3);
      sfill(v, s, 4, 2, 1, L - 4, B - 2, TOP, HULL, 2);
      const ma = (L - 1) / 2;
      const mb = (B - 1) / 2;
      for (let b = 0; b < B; b++) {
        for (let a = 1; a < L - 1; a++) {
          if ((a === 1 || a === L - 2) && (b === 0 || b === B - 1)) continue;
          const edge = a === 1 || a === L - 2 || b === 0 || b === B - 1;
          const lens = Math.abs(a - ma) < 1 && Math.abs(b - mb) < 1;
          if (edge) sput(v, s, a, b, TOP, STEEL, 6);
          else if (lens) sput(v, s, a, b, TOP, M.SCREEN, 7);
          else sput(v, s, a, b, TOP, (a + b) % 3 === 0 && (a - b) % 3 === 0 ? M.SCREEN : SPACE, (a + b) % 3 === 0 && (a - b) % 3 === 0 ? 2 : 3);
        }
      }
      for (let a = 2; a < L - 2; a += 3) sput(v, s, a, B - 1, TOP - 1, M.NEON_CYAN, 5); // under-lights on the front edge
    },
    tick(c, s, active) {
      const cx = wx(s, s.len / 2, s.dep / 2);
      const cy = wy(s, s.len / 2, s.dep / 2);
      const cz = s.z0 + HC;
      const R = active ? 3.6 : 2.8;
      const rot = c.t * (active ? 1.3 : 0.5);
      const life = c.dt * 1.5 + 0.01;
      const pt = (lat: number, lon: number, rr = R, near?: RGB, far?: RGB) => {
        const cl = Math.cos(lat);
        const dx = rr * cl * Math.cos(lon + rot);
        const dy = rr * cl * Math.sin(lon + rot);
        const dz = rr * Math.sin(lat);
        c.spawn({ kind: 'glint', x: cx + dx, y: cy + dy, z: cz + dz, vx: 0, vy: 0, vz: 0, life, color: dx + dy > -0.5 ? (near ?? HOLO) : (far ?? HOLO_DIM), glow: true, gravity: 0 });
      };
      for (let m = 0; m < 6; m++) for (let k = 1; k < 6; k++) pt(-Math.PI / 2 + (k * Math.PI) / 6, (m * Math.PI) / 3);
      for (let k = 0; k < 12; k++) pt(0, (k + 0.5) * (Math.PI / 6));
      pt(Math.PI / 2, 0);
      pt(-Math.PI / 2, 0);
      // the beam up from the lens
      for (let k = 0; k < 3; k++) {
        const z = s.z0 + TOP + 1 + c.rng.range(0, HC - TOP - R - 1);
        c.spawn({ kind: 'glint', x: cx + c.rng.range(-0.6, 0.6), y: cy + c.rng.range(-0.6, 0.6), z, vx: 0, vy: 0, vz: 2, life, color: HOLO_DIM, glow: true, gravity: 0 });
      }
      if (active) {
        const a = c.t * 2.2;
        pt(0.25 * Math.sin(a * 0.5), a - rot, R * 1.6, AMBER, AMBER);
        for (let k = 0; k < 8; k++) pt(0.25 * Math.sin((a - k * 0.2) * 0.5), a - rot - 0.4 - k * 0.5, R * 1.6, HOLO_DIM, HOLO_DIM);
      }
      c.light({ x: cx, y: cy, z: cz, color: HOLO, radius: active ? 18 : 12, intensity: active ? 0.4 : 0.2 });
    },
  };
}

// idle: the sleep pods. Hypersleep capsules lying side by side, head to
// the back, under glass lids; a light inside each rises and falls like
// breathing. A step along their feet, a side table with a reading lamp.
// Kept low: it stands out in front of the room.
function sleepPods(): Prop {
  const PW = 5; // a pod's width
  const PL = 9; // and length
  const LID = 4; // the glass lid's height
  const pods = (s: Slot) => Math.max(1, Math.floor(s.len / PW));
  const off = (s: Slot) => Math.floor((s.len - pods(s) * PW) / 2);
  return {
    name: 'sleep pods',
    build(v, s) {
      const n = pods(s);
      for (let k = 0; k < n; k++) {
        const a0 = off(s) + k * PW;
        for (let j = 0; j < PL; j++) {
          for (let i = 0; i < PW; i++) {
            const a = a0 + i;
            const side = i === 0 || i === PW - 1;
            const end = j === 0 || j === PL - 1;
            sput(v, s, a, j, 0, STEEL, side && end ? 2 : 3);
            if (j === 0) {
              // the head end, a raised white hood
              for (let h = 1; h <= LID + 1; h++) sput(v, s, a, j, h, side || h === LID + 1 ? WHITE : HULL, side ? 4 : h === LID + 1 ? 6 : 2);
            } else if (side || end) {
              for (let h = 1; h < LID; h++) sput(v, s, a, j, h, h === 2 && side ? ORANGE : WHITE, h === 2 && side ? 4 : h === LID - 1 ? 6 : 5);
            } else {
              sput(v, s, a, j, 1, FABRIC, 4);
              sput(v, s, a, j, LID, M.GLASS, 4);
              if (i === 2 && j > 1 && j < PL - 2) sput(v, s, a, j, LID + 1, M.GLASS, 5); // the lid's ridge
            }
          }
        }
        for (let j = 1; j < PL - 1; j++) sput(v, s, a0 + 2, j, 2, SEAM, 2); // the light strip
        sput(v, s, a0 + 2, PL - 1, 2, M.NEON_GREEN, 7);
      }
      // a step along their feet, and a side table with a reading lamp and a mug
      const L = s.len;
      sfill(v, s, 1, PL, 0, L - 4, PL + 1, 1, FABRIC, 3);
      sfill(v, s, L - 3, PL, 0, L - 1, PL + 2, 2, WHITE, 4);
      sput(v, s, L - 3, PL, 2, STEEL, 5);
      sput(v, s, L - 3, PL, 3, M.LAMP, 7);
      sput(v, s, L - 2, PL + 1, 2, ORANGE, 5);
    },
    tick(c, s, active) {
      const v = c.v;
      const n = pods(s);
      for (let k = 0; k < n; k++) {
        const a0 = off(s) + k * PW;
        const level = (0.5 + 0.5 * Math.sin(c.t * 0.8 + k * 2.1)) * (PL - 2);
        for (let j = 1; j < PL - 1; j++) {
          const on = j - 1 < level;
          cycle(v, sidx(v, s, a0 + 2, j, 2), on ? M.SCREEN : SEAM, on ? 4 : 2, [M.SCREEN, SEAM]);
        }
        const st = k === 1 && c.t % 3 < 1.5 ? M.LED_AMBER : M.NEON_GREEN;
        cycle(v, sidx(v, s, a0 + 2, PL - 1, 2), st, 7, [M.NEON_GREEN, M.LED_AMBER]);
        c.light({ x: wx(s, a0 + 2.5, PL / 2), y: wy(s, a0 + 2.5, PL / 2), z: s.z0 + 3, color: CYAN, radius: 9, intensity: 0.1 + 0.25 * (level / (PL - 2)) });
        if (active && k === n >> 1 && c.rng.chance(c.dt * 0.7)) {
          const [ox, oy] = dirOf(s, 0.3, 0.4);
          c.spawn({ kind: 'zzz', x: wx(s, a0 + 2.5, 2.5), y: wy(s, a0 + 2.5, 2.5), z: s.z0 + LID + 2, vx: ox, vy: oy, vz: 1.4, life: 2, color: SNORE, glow: false, gravity: -0.2 });
        }
      }
      const L = s.len;
      c.light({ x: wx(s, L - 2.5, PL + 0.5), y: wy(s, L - 2.5, PL + 0.5), z: s.z0 + 4, color: AMBER, radius: 9, intensity: 0.35 });
    },
  };
}

// entrance: the airlock. A hazard-framed door into a short lit passage
// through the hull to the outer hatch; its leaves slide apart for whoever
// comes or goes, the light over it going from red to green.
function airlock(): Prop {
  const A0 = 1;
  const A1 = 11;
  const HALF = (A1 - A0) >> 1;
  const TALL = 16;
  const state = new WeakMap<Slot, { open: number; k: number }>();
  const LEAF = [WHITE, STEEL, ORANGE, M.GLASS, SEAM, M.AIR];
  // A leaf's voxel `lc` columns in from its outer edge.
  const leaf = (lc: number, h: number): [number, number] => {
    if (lc === HALF - 1) return [STEEL, 3];
    if (h === 7 || h === 8) return [ORANGE, 4];
    if (h >= 10 && h < 13 && lc >= 1 && lc < 3) return [M.GLASS, 4];
    if (h === 0) return [SEAM, 2];
    return [WHITE, lc === 0 ? 2 : 4];
  };
  const paint = (v: Voxels, s: Slot, k: number) => {
    for (let a = A0; a < A1; a++) {
      const left = a - A0 < HALF;
      const lc = left ? a - A0 + k : A1 - 1 - a + k;
      for (let h = 0; h < TALL; h++) {
        const [m, sh] = lc < HALF ? leaf(lc, h) : [M.AIR, 0];
        cycle(v, sidx(v, s, a, -2, h), m, sh, LEAF);
      }
    }
  };
  return {
    name: 'airlock',
    build(v, s) {
      const deep = -(wallOf(s) - 1); // the hull's last voxel stays
      const ca = (A0 + A1 - 1) / 2;
      for (let b = deep + 1; b < 0; b++) {
        for (let a = A0; a < A1; a++) {
          for (let h = 0; h < TALL; h++) sput(v, s, a, b, h, M.AIR);
          sput(v, s, a, b, -1, (a + b) & 1 ? STEEL : SEAM, (a + b) & 1 ? 5 : 6);
        }
        for (const a of [A0 - 1, A1]) for (let h = 0; h < TALL; h++) sput(v, s, a, b, h, (b & 1) === 0 ? STEEL : HULL, (b & 1) === 0 ? 6 : 2);
        if (b % 3 === 0) sput(v, s, A0 - 1, b, TALL - 3, M.LAMP, 7);
      }
      // the outer hatch, a porthole of stars
      for (let a = A0; a < A1; a++) {
        for (let h = 0; h < TALL; h++) {
          const d = discD(a - ca, h - 9);
          sput(v, s, a, deep, h, d < 2.6 ? M.GLASS : d < 3.6 ? STEEL : HULL, d < 3.6 ? 6 : 2);
          if (d < 2.6) {
            const r = hash3(77, a, h, along(s));
            sput(v, s, a, deep - 1, h, r < 0.12 ? M.LAMP : r < 0.24 ? FAINT : SPACE, 7);
          }
        }
      }
      paint(v, s, 0);
      for (const a of [A0 - 1, A1]) {
        for (let h = 0; h < TALL + 2; h++) {
          sput(v, s, a, -1, h, STEEL, 4);
          sput(v, s, a, 0, h, ((h + a) >> 1) & 1 ? ORANGE : SEAM, 4);
        }
      }
      for (let a = A0 - 1; a <= A1; a++) {
        for (const h of [TALL, TALL + 1]) {
          sput(v, s, a, -1, h, STEEL, 4);
          sput(v, s, a, 0, h, ((h + a) >> 1) & 1 ? ORANGE : SEAM, 4);
        }
      }
      sput(v, s, HALF, 0, TALL + 2, M.LED_RED, 7);
      sput(v, s, HALF + 1, 0, TALL + 2, M.LED_RED, 7);
      sfill(v, s, A1 + 1, 0, 6, A1 + 3, 1, 9, HULL, 2); // keypad
      sput(v, s, A1 + 1, 0, 7, M.SCREEN, 6);
      sput(v, s, A1 + 2, 0, 7, M.LED_AMBER, 7);
      for (let b = 0; b < 3; b++) for (let a = A0; a < A1; a++) sput(v, s, a, b, -1, ((a + b) >> 1) & 1 ? ORANGE : SEAM, 3);
    },
    tick(c, s, active) {
      const v = c.v;
      const st = state.get(s) ?? { open: 0, k: -1 };
      state.set(s, st);
      st.open = clamp(st.open + (active ? 1 : -1) * c.dt * 1.8, 0, 1);
      const k = Math.round(st.open * HALF);
      if (k !== st.k || c.rng.chance(c.dt)) {
        if (st.k === 0 && k > 0) {
          for (let n = 0; n < 4; n++) puff(c, wx(s, c.rng.int(A0, A1 - 1), -3), wy(s, c.rng.int(A0, A1 - 1), -3), s.z0 + c.rng.int(1, 4), M.STEAM, c.rng.int(25, 45));
        }
        paint(v, s, k);
        st.k = k;
      }
      const moving = st.open > 0 && st.open < 1;
      const sig = moving && Math.floor(c.t * 6) & 1 ? SEAM : st.open > 0.02 ? M.NEON_GREEN : M.LED_RED;
      for (const a of [HALF, HALF + 1]) cycle(v, sidx(v, s, a, 0, TALL + 2), sig, sig === SEAM ? 3 : 7, [M.LED_RED, M.NEON_GREEN, SEAM]);
      const key = Math.floor(c.t * 2) & 1;
      cycle(v, sidx(v, s, A1 + 2, 0, 7), key ? M.LED_AMBER : SEAM, key ? 7 : 3, [M.LED_AMBER, SEAM]);
      const mid = HALF + 0.5;
      if (sig !== SEAM) c.light({ x: wx(s, mid, 1), y: wy(s, mid, 1), z: s.z0 + TALL + 2.5, color: st.open > 0.02 ? GREEN : RED, radius: 12, intensity: 0.5 });
      const inside = -(wallOf(s) >> 1);
      c.light({ x: wx(s, mid, inside), y: wy(s, mid, inside), z: s.z0 + TALL - 4, color: moving ? AMBER : LAMPLIGHT, radius: 14, intensity: moving ? 0.6 : 0.35 });
    },
  };
}

const PROPS: Record<SlotKind, Prop> = {
  write: navConsole(),
  read: archive(),
  search: scanner(),
  run: reactor(),
  web: commsArray(),
  think: holoTable(),
  idle: sleepPods(),
  entrance: airlock(),
};

// ── plan ─────────────────────────────────────────────────────────────────
// Where everything goes, from the layout alone (so pois() agrees with
// generate()): the window band's heights, the grand viewport and the tall
// windows in the right wall's gaps, the planet, and the features on the
// floor (see floor.ts), with the POIs they bring.
type Plan = {
  floor: Floor;
  top: number; // the room's height above the floor
  lo: number; // the window band, [lo, hi) above the floor
  hi: number;
  tall: Array<[number, number]>; // right wall: floor-to-band panes [a0, a1)
  grand: [number, number]; // right wall: the grand viewport's lower panes [a0, a1)
  planet: Planet;
  deck: Disc | null;
  glass: number; // the deck window's radius
  bench: Poi | null; // the seat by the deck window
  hydro: Disc | null;
  galley: Disc | null;
  lounge: Disc | null;
  tank: Disc | null;
  trees: Disc | null;
  suits: Disc | null;
  gym: Disc | null;
  dock: Disc | null;
  farms: Disc[]; // more hydroponic bays, on a big deck
  island: Disc | null; // the command island
  clusters: Cluster[];
  decor: Pt[];
  spare: Uint8Array; // floor still free for odds and ends
};

// An equipment cluster: hydroponic rows, cargo, engineering, science or ops.
type Cluster = Disc & { kind: number };
const ROWS = 0;
const CARGO = 1;
const ENGINE = 2;
const SCIENCE = 3;
const OPS = 4;
const KINDS = [CARGO, ROWS, ENGINE, SCIENCE, CARGO, OPS, ENGINE, ROWS, CARGO, SCIENCE, OPS, ENGINE];

const PLANS = new WeakMap<Layout, Plan>();

// A feature's own frame: q runs toward the hub along whichever axis is
// nearer, u across it. `at` maps (u, q) to the floor, `poi` makes a POI at
// (u, q) looking at (fu, fq).
function axes(s: Pt, hub: Pt) {
  const toX = Math.abs(hub.x - s.x) > Math.abs(hub.y - s.y);
  const sq = (toX ? Math.sign(hub.x - s.x) : Math.sign(hub.y - s.y)) || 1;
  const cx = Math.round(s.x);
  const cy = Math.round(s.y);
  const at = (u: number, q: number): [number, number] => (toX ? [cx + q * sq, cy + u] : [cx + u, cy + q * sq]);
  const poi = (u: number, q: number, kind: Poi['kind'], fu: number, fq: number): Poi => {
    const [x, y] = at(Math.round(u), Math.round(q));
    const [fx, fy] = at(fu, fq);
    return { x, y, kind, face: { x: fx, y: fy } };
  };
  return { at, poi };
}

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W, T } = L;
  const f = new Floor(L, 'station');
  const g = growth(L);
  const hub = f.hub;
  const top = L.H - L.floor;
  const lo = top >= 40 ? 22 : top >= 32 ? 20 : Math.max(16, top - 9);
  const hi = top - 4;

  // The grand viewport in the right wall's widest gap, from just off the
  // floor to the header, with the planet filling it; floor-to-ceiling
  // panes in its other wide gaps; a view out of the widest.
  const rights = slotsOn(L, 'right');
  const widest = wallGaps(L, 'right')
    .map(([g0, g1]): [number, number] => [Math.max(g0, T + 4), Math.min(g1, W - 4)])
    .reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p), [T + 4, T + 4]);
  const pu = widest[1] - widest[0] >= 8 ? Math.round((widest[0] + widest[1]) / 2) : Math.round(T + (W - T) * 0.6);
  const r = clamp((hi - 4) / 2.236 - 0.6, 3, 18);
  const prevEnd = Math.max(T, ...rights.filter((s) => s.x0 + s.len <= pu).map((s) => s.x0 + s.len));
  const nextStart = Math.min(W - 3, ...rights.filter((s) => s.x0 > pu).map((s) => s.x0));
  const grand: [number, number] = [Math.max(prevEnd + 2, Math.round(pu - r - 3)), Math.min(nextStart - 2, Math.round(pu + r + 4))];
  const tall: Array<[number, number]> = [];
  for (const [g0, g1] of wallGaps(L, 'right')) {
    if (g0 === T) continue;
    const a0 = g0 + 2;
    const a1 = Math.min(g1 - 2, W - 4);
    if (a1 - a0 >= 5 && (a1 <= grand[0] - 2 || a0 >= grand[1] + 2)) tall.push([a0, a1]);
  }
  const views: Array<[number, number]> = [...tall, grand];
  for (const [a0, a1] of views.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))) {
    const x = Math.round((a0 + a1 - 1) / 2);
    const p: Poi = { x, y: T + 3, kind: 'view', face: { x, y: T - 1 } };
    if (a1 - a0 >= 3 && f.reachable(p, null)) {
      f.addPoi(p);
      break;
    }
  }

  // The observation deck: a glass floor over the void, a bench beside it.
  let bench: Poi | null = null;
  const deck = f.place(Math.round(9 + 8 * g), f.at(0.84, 0.84), {
    min: 6,
    inside: true,
    pois: (s) => {
      const gr = s.r - 3;
      return [by({ ...s, r: gr }, 'view', 1, hub), by({ ...s, r: gr }, 'seat', 1, hub, 1.7)];
    },
  });
  if (deck) bench = f.pois[f.pois.length - 1];
  // The command island: a ring of desks open toward the hub, the holo-ring
  // turning over it.
  const island = f.place(Math.round(9 + 4 * g + 3 * clamp((W - 170) / 86, 0, 1)), f.at(0.7, 0.7), {
    min: 7,
    inside: true,
    spread: 10,
    pois: (s) => [by({ ...s, r: s.r - 4 }, 'view', 0, hub)],
  });
  const hydro = f.place(Math.round(6 + 5 * g), f.at(0.45, 0.94), { min: 4, pois: (s) => [by(s, 'view', 1, hub)] });
  const galley = f.place(Math.round(5 + 2 * g), f.at(0.94, 0.45), { min: 4, inside: true, pois: (s) => [axes(s, hub).poi(-2, s.r - 0.5, 'drink', -2, 0)] });
  const lounge = f.place(Math.round(6 + 3 * g), f.at(0.12, 0.9), { min: 5, inside: true, pois: (s) => [axes(s, hub).poi(0, -(s.r - 4), 'seat', 0, 6)] });
  const tank = f.place(Math.round(4 + 2 * g), f.at(0.95, 0.22), { min: 4, pois: (s) => [by(s, 'view', 1, hub)] });
  const trees = f.place(Math.round(5 + 3 * g), f.at(0.96, 0.66), { min: 5 });
  const suits = f.place(Math.round(5 + 2 * g), f.at(0.24, 0.96), { min: 5 });
  const gym = f.place(5, f.at(0.7, 0.96), { min: 5, spread: 12 });
  const dock = f.place(3, f.at(0.62, 0.92), { min: 3, spread: 20, pois: (s) => [by(s, 'pet', 2, hub)] });

  // A big deck gets more hydroponic bays.
  const big = clamp((W - 170) / 86, 0, 1);
  const farms: Disc[] = [];
  for (let k = 0; k < Math.round(2 * big); k++) {
    const d = f.place(Math.round(7 + 2 * big), f.at(k ? 0.18 : 0.4, k ? 0.42 : 0.18), { min: 5, spread: 30 });
    if (d) farms.push(d);
  }

  // Zones on the floor left: the command ring round the hub, equipment
  // clusters spread over the deck, then odds and ends between them.
  const spare = f.free(2);
  const clusters = pickClusters(L, spare, f.rng);
  const ok = (x: number, y: number) => {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!spare[x + dx + W * (y + dy)]) return false;
    return true;
  };
  const decor = scatter(L, f.rng, Math.round((5 + 11 * g) * (1 + 0.6 * big)), 9, ok);
  for (const p of decor) mark(spare, L, p.x, p.y, 3);
  const planet = { u: pu, w: (4 + hi) / 2 - pu / 2, r };
  const P: Plan = { floor: f, top, lo, hi, tall, grand, planet, deck, glass: deck ? deck.r - 3 : 0, bench, hydro, galley, lounge, tank, trees, suits, gym, dock, farms, island, clusters, decor, spare };
  PLANS.set(L, P);
  return P;
}

// Clears the floor cells within r of (cx, cy) in a mask.
function mark(mask: Uint8Array, L: Layout, cx: number, cy: number, r: number): void {
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(L.D - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(L.W - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[x + L.W * y] = 0;
    }
  }
}

// Equipment clusters, spread over the free floor about one per 2200 floor
// cells, each a disc clear of everything by a voxel all round.
function pickClusters(L: Layout, spare: Uint8Array, rng: Rng): Cluster[] {
  const { W, D, T } = L;
  const dist = new Int32Array(W * D).fill(-1);
  const queue = new Int32Array(W * D);
  let n = 0;
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      const i = x + W * y;
      if (!spare[i] || x < T + 2 || y < T + 2 || x >= W - 3 || y >= D - 3) {
        dist[i] = 0;
        queue[n++] = i;
      }
    }
  }
  for (let q = 0; q < n; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= D) continue;
        const j = nx + W * ny;
        if (dist[j] < 0) {
          dist[j] = dist[i] + 1;
          queue[n++] = j;
        }
      }
    }
  }
  const cand: number[] = [];
  for (let i = 0; i < dist.length; i++) if (dist[i] >= 7) cand.push(i);
  // the roomiest spots first, give or take
  cand.sort((p, q) => dist[q] - dist[p]);
  for (let k = cand.length - 1; k > 0; k--) {
    const j = Math.max(0, k - rng.int(0, 400));
    [cand[k], cand[j]] = [cand[j], cand[k]];
  }
  const want = Math.round(((W - T) * (D - T)) / 2200);
  const out: Cluster[] = [];
  for (const i of cand) {
    if (out.length >= want) break;
    const x = i % W;
    const y = Math.floor(i / W);
    const r = Math.min(9, dist[i] - 2);
    if (out.some((c) => Math.hypot(c.x - x, c.y - y) < c.r + r + 4)) continue;
    out.push({ x, y, r, kind: KINDS[out.length % KINDS.length] });
  }
  for (const c of out) mark(spare, L, c.x, c.y, c.r + 2);
  return out;
}

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  clear(v);
  const P = plan(L);
  const seed = rng.int(0, 0x3fffffff);
  const pz = L.floor + (4 + P.hi) / 2;
  const fx: Fixtures = {
    seed,
    planet: P.planet,
    sun: { x: P.planet.u, y: L.T - 2, z: pz, color: SUNLIT, radius: clamp(P.planet.r * 2.6, 8, 34), intensity: 0.35 },
    near: cells(),
    far: cells(),
    studs: [],
    studK: [],
    blinks: [],
    beacons: [],
    vents: [],
    lamps: [],
    plants: [],
    leaves: [],
    grow: [],
    mist: [],
    fish: [],
    belts: [],
    galley: null,
    boards: [],
    drone: null,
    holo: null,
  };
  hull(v, L);
  underside(v, L, fx);
  deck(v, L, seed, fx);
  for (const wall of SIDES) clad(v, L, P, wall, seed, fx);
  topLights(v, L, fx);
  if (P.deck) floorWindow(v, L, P, fx);
  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);
  for (const wall of SIDES) gapFixtures(v, L, P, wall, rng, fx);
  lampBars(v, L, P, fx);
  if (P.hydro) hydroponics(v, L, P.hydro, P.floor.hub, rng, fx);
  if (P.galley) galley(v, L, P.galley, P.floor.hub, fx);
  if (P.lounge) lounge(v, L, P.lounge, P.floor.hub, rng, fx);
  if (P.tank) aquarium(v, L, P.tank, P.floor.hub, rng, fx);
  if (P.trees) arboretum(v, L, P.trees, rng, fx);
  if (P.suits) suitRack(v, L, P.suits, P.floor.hub);
  if (P.gym) treadmill(v, L, P.gym, P.floor.hub, fx);
  for (const d of P.farms) hydroponics(v, L, d, P.floor.hub, rng, fx);
  island(v, L, P, fx);
  for (const c of P.clusters) cluster(v, L, c, P.floor.hub, rng, fx);
  if (P.dock) dock(v, L, P, fx);
  for (const p of P.decor) odds(v, L, p, rng, fx);
  cargo(v, L, P);
  filler(v, L, P, rng, fx);
  FIXTURES.set(v, fx);
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// The hull: the wall slabs in layers from the room out (service gap, ribbed
// orange insulation, pressure hull, outer skin), which the cut ends and the
// tops show; under the deck, hull plate on an outer skin.
function hull(v: Voxels, L: Layout): void {
  const { W, D, H, T, floor } = L;
  for (let z = 0; z < H; z++) {
    const rib = z % 12 === 5;
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        let m: number;
        let s: number;
        if (x < T || y < T) {
          const d = Math.max(x < T ? T - 1 - x : -1, y < T ? T - 1 - y : -1);
          if (d === T - 1) [m, s] = [STEEL, 3];
          else if (d === T - 2) [m, s] = [HULL, 1];
          else if (d <= 1) [m, s] = [SEAM, 2];
          else if (rib) [m, s] = [STEEL, 2];
          else [m, s] = [ORANGE, 2];
        } else if (z < floor) {
          [m, s] = z === 0 ? [STEEL, 2] : [HULL, 1];
        } else continue;
        v.set(v.idx(x, y, z), m, s);
      }
    }
  }
}

// The deck's cut faces: a support beam under the plating, then pipes and
// cable runs in the dark, and a line of running lights along the keel.
function underside(v: Voxels, L: Layout, fx: Fixtures): void {
  const { W, D, T, floor } = L;
  const zc = (floor - 2) / 2;
  const pr = Math.max(1.2, (floor - 4) / 2.4);
  for (const face of [0, 1]) {
    const n = face ? W : D;
    for (let a = T; a < n; a++) {
      const [x, y] = face ? [a, D - 1] : [W - 1, a];
      const ac = T + 5 + Math.round((a - T - 5) / 11) * 11;
      for (let z = 1; z < floor - 1; z++) {
        const dp = Math.hypot(a - ac, z - zc);
        let m: number = SEAM;
        let s = 2;
        if (z === floor - 2) [m, s] = [STEEL, 5];
        else if (dp < pr - 0.9) [m, s] = Math.round((a - T - 5) / 11) & 1 ? [ORANGE, 3] : [HULL, 3];
        else if (dp < pr + 0.1) [m, s] = [STEEL, 4];
        else if (z === 1 && (a & 7) < 2) [m, s] = [M.NEON_CYAN, 4];
        else if (z === floor - 3 && (a % 5) === 2) [m, s] = [ORANGE, 2];
        v.put(x, y, z, m, s);
      }
    }
  }
  // nav lights at the keel's corner: amber, blinking
  for (const [x, y] of [[W - 1, D - 1], [W - 2, D - 1], [W - 1, D - 2]] as const) {
    v.put(x, y, 1, M.LED_AMBER, 7);
    fx.blinks.push({ i: v.idx(x, y, 1), on: M.LED_AMBER, off: SEAM, period: 1.6, phase: 0, duty: 0.15 });
  }
}

// The deck: steel plates on a grid with dark seams and corner rivets, a
// few of them grating, tread plate or pale service hatches; a grated
// gutter at the foot of the walls; hazard rings round the assembly bays
// (where the crew builds); guide lights chasing out from the back corner
// along both walls.
const PT = 12;
const GUIDE = 17;

function deck(v: Voxels, L: Layout, seed: number, fx: Fixtures): void {
  const { W, D, T, floor } = L;
  const z = floor - 1;
  const bays = buildSites(L);
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const gx = x - T;
      const gy = y - T;
      let m: number = STEEL;
      let s = 4;
      const bay = bays.find((b) => Math.abs(Math.hypot(x - b.x, y - b.y) - b.r - 1.6) < 0.7);
      if (bay) {
        const ang = Math.atan2(y - bay.y, x - bay.x);
        [m, s] = Math.floor(((ang + Math.PI) / TAU) * 40) & 1 ? [ORANGE, 4] : [SEAM, 3];
      } else if (gx < 2 || gy < 2) {
        const bar = gx < 2 && gy < 2 ? true : gx < 2 ? (y & 3) < 2 : (x & 3) < 2;
        [m, s] = bar ? [STEEL, 3] : [SEAM, 4];
      } else {
        const ix = (gx - 2) % PT;
        const iy = (gy - 2) % PT;
        const px = Math.floor((gx - 2) / PT);
        const py = Math.floor((gy - 2) / PT);
        const r = hash3(seed, px, py, 7);
        if (ix === 0 || iy === 0) [m, s] = ix === 0 && iy === 0 && (px & 1) === 0 && (py & 1) === 0 ? [M.SCREEN, 1] : [HULL, 5];
        else if (r < 0.06) [m, s] = [PANEL, ix === 1 || iy === 1 ? 2 : 0];
        else [m, s] = [DECK, ix === 1 || iy === 1 ? 6 : (px + py) & 1 ? 3 : 4];
      }
      v.set(v.idx(x, y, z), m, s);
    }
  }
  for (const wall of SIDES) {
    const end = alongEnd(L, wall);
    for (let a = T + GUIDE; a < end - 1; a++) {
      const k = a - T - GUIDE;
      if (k % 4 >= 2) continue;
      const [x, y] = onWall(L, wall, a, GUIDE);
      v.put(x, y, z, SEAM, 5);
      fx.studs.push(v.idx(x, y, z));
      fx.studK.push(k >> 2);
    }
  }
}

// The wall face, bottom to top: a dark kick plate and a steel rail, pale
// panels with an orange stripe, a steel sill, the window band, a steel
// header, a strip of cove lights and a steel cap. The right wall's band is
// one long viewport split by mullions (and runs down to the floor in the
// wider gaps); the left wall's has round portholes between hull plates.
const PW = 12; // panel pitch along the wall
const MW = 14; // mullion pitch

function clad(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number, fx: Fixtures): void {
  const { T, floor } = L;
  const end = alongEnd(L, wall);
  const right = wall === 'right';
  const plane = right ? 0 : 1;
  const { lo, hi, top } = P;
  const hm = 3 + Math.floor((lo - 5) / 2); // the stripe between two rows of panels
  const ports = right ? [] : portholes(L, P);
  const pr = clamp((hi - lo) / 2.236 - 1.6, 2, 6.5);
  const pc = (lo + hi - 1) / 2;
  for (let a = T; a < end; a++) {
    const [x, y] = onWall(L, wall, a, -1);
    const [x2, y2] = onWall(L, wall, a, -2);
    const ia = (a - T) % PW;
    const pa = Math.floor((a - T) / PW);
    const tall = right ? P.tall.find(([a0, a1]) => a >= a0 - 1 && a <= a1) : undefined;
    const big = right && P.grand[1] > P.grand[0] && a >= P.grand[0] - 1 && a <= P.grand[1];
    const pane = (h: number) => {
      v.put(x, y, floor + h, M.GLASS, 4);
      addSky(v, fx, x2, y2, floor + h, plane, a, h, right ? a : -a, h - a / 2);
    };
    for (let h = 0; h < top; h++) {
      const z = floor + h;
      let m: number = HULL;
      let s = 2;
      if (h <= 1) [m, s] = [SEAM, 3];
      else if (h === 2) [m, s] = [STEEL, 6];
      else if (big && h < lo) {
        const ma = (a - T) % MW;
        if (a === P.grand[0] - 1 || a === P.grand[1] || h === 3) [m, s] = [STEEL, h === 3 ? 6 : 4];
        else if (ma < 2) [m, s] = [STEEL, ma === 0 ? 5 : 3];
        else {
          pane(h);
          continue;
        }
      } else if (h < lo - 2) {
        if (tall) {
          if (a === tall[0] - 1 || a === tall[1]) [m, s] = [STEEL, 4];
          else if (h === 3) [m, s] = [STEEL, 6];
          else {
            pane(h);
            continue;
          }
        } else if (h === hm) [m, s] = [ORANGE, 4];
        else if (ia === 0 || h === 3) [m, s] = [SEAM, 3];
        else {
          const rivet = (ia === 1 || ia === PW - 1) && (h === 4 || h === hm + 1);
          const bevel = h === hm - 1 || h === lo - 3;
          [m, s] = rivet ? [STEEL, 7] : [PANEL, bevel ? 6 : 2 + Math.floor(hash3(seed, pa, h > hm ? 1 : 0, 3 + plane) * 3)];
        }
      } else if (h < lo) [m, s] = [STEEL, h === lo - 2 ? 6 : 3];
      else if (h < hi) {
        if (right) {
          const ma = (a - T) % MW;
          if (ma < 2 || a < T + 2 || a >= end - 3) [m, s] = [STEEL, ma === 0 ? 5 : 3];
          else {
            pane(h);
            continue;
          }
        } else {
          let hitPort = false;
          for (const c of ports) {
            const d = discD(a - c, h - pc);
            if (d < pr) {
              pane(h);
              hitPort = true;
              break;
            }
            if (d < pr + 1.6) {
              const bolt = Math.abs(((Math.atan2(h - pc - (a - c) / 2, a - c) / TAU) * 8) % 1) < 0.2;
              [m, s] = [STEEL, bolt ? 7 : 4];
              hitPort = true;
              break;
            }
          }
          if (hitPort && m === HULL) continue;
          if (!hitPort) [m, s] = ia === 0 || h === lo ? [SEAM, 3] : [HULL, 2 + Math.floor(hash3(seed, pa, 2, 9) * 3)];
        }
      } else if (h < hi + 2) [m, s] = [STEEL, h === hi ? 5 : 7];
      else if (h === top - 2) [m, s] = (a - T) % 12 < 3 ? [M.NEON_CYAN, 2] : [HULL, 2];
      else if (h === top - 1) [m, s] = [STEEL, 6];
      v.put(x, y, z, m, s);
    }
  }
}

// Porthole centres along the left wall, clear of the airlock below.
function portholes(L: Layout, P: Plan): number[] {
  const out: number[] = [];
  const door = L.slots.find((s) => s.kind === 'entrance' && s.wall === 'left');
  const gap = 24;
  for (let c = L.T + 13; c < L.D - 12; c += gap) {
    if (door && P.lo < 21 && c > door.y0 - 8 && c < door.y0 + door.len + 8) continue;
    out.push(c);
  }
  return out;
}

// Running lights along the tops of the walls, chasing out to the ends.
function topLights(v: Voxels, L: Layout, fx: Fixtures): void {
  const { H, T } = L;
  for (const wall of SIDES) {
    const end = alongEnd(L, wall);
    for (let a = T + 8, k = 0; a < end - 2; a += 12, k++) {
      const [x, y] = onWall(L, wall, a, -Math.ceil(T / 2));
      v.put(x, y, H - 1, SEAM, 3);
      fx.blinks.push({ i: v.idx(x, y, H - 1), on: M.LAMP, off: SEAM, period: 3, phase: 3 - k * 0.12, duty: 0.08 });
    }
  }
}

// The glass floor: a round window in the deck over a well of stars, a
// steel rim studded with lights chasing round it.
function floorWindow(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const s = P.deck!;
  const gr = P.glass;
  const z = L.floor - 1;
  for (let y = Math.floor(s.y - gr - 2); y <= Math.ceil(s.y + gr + 2); y++) {
    for (let x = Math.floor(s.x - gr - 2); x <= Math.ceil(s.x + gr + 2); x++) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d < gr) {
        v.put(x, y, z, M.GLASS, 4);
        v.put(x, y, z - 1, M.AIR);
        addSky(v, fx, x, y, z - 2, 2, x, y, x - y, -(x + y) / 2);
      } else if (d < gr + 1.3) {
        const ang = Math.atan2(y - s.y, x - s.x);
        const stud = Math.abs(((ang / TAU) * 16 + 16) % 1) < 0.12 && d >= gr + 0.3;
        v.put(x, y, z, stud ? SEAM : STEEL, stud ? 5 : 6);
        if (stud) fx.blinks.push({ i: v.idx(x, y, z), on: M.SCREEN, off: SEAM, period: 4, phase: ((ang + Math.PI) / TAU) * 4, duty: 0.3 });
      }
    }
  }
  // a well wall of hull under the glass, so the view sits in a frame
  for (let y = Math.floor(s.y - gr - 1); y <= Math.ceil(s.y + gr + 1); y++) {
    for (let x = Math.floor(s.x - gr - 1); x <= Math.ceil(s.x + gr + 1); x++) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d >= gr && d < gr + 1.5) v.put(x, y, z - 1, STEEL, 2);
    }
  }
  // a bench behind the seat looking down into it, and another across
  const b = P.bench;
  if (!b) return;
  const a0 = Math.atan2(b.y - s.y, b.x - s.x);
  for (const a of [a0, a0 + Math.PI * 0.85]) {
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const cx = s.x + ux * (gr + 2.6);
    const cy = s.y + uy * (gr + 2.6);
    for (let k = -3; k <= 3; k++) {
      for (const back of [0, 1]) {
        const x = Math.round(cx - uy * k + ux * back);
        const y = Math.round(cy + ux * k + uy * back);
        if (v.get(x, y, L.floor) !== M.AIR || Math.hypot(x - s.x, y - s.y) > s.r) continue;
        const end = Math.abs(k) === 3;
        v.put(x, y, L.floor, STEEL, end ? 5 : 2);
        v.put(x, y, L.floor + 1, back || end ? WHITE : FABRIC, back || end ? 5 : 4);
        if (back) v.put(x, y, L.floor + 2, WHITE, 7);
      }
    }
  }
}

// Something in every gap between props: on the right wall a ledge under a
// tall window or an amber warning beacon; on the left lockers, a status
// board of bar graphs, or a steam vent.
function gapFixtures(v: Voxels, L: Layout, P: Plan, wall: Side, rng: Rng, fx: Fixtures): void {
  const end = alongEnd(L, wall);
  const keep = P.floor.paths;
  const floorFree = (a0: number, a1: number, b1: number) => {
    for (let a = a0; a < a1; a++) {
      for (let b = 0; b < b1; b++) {
        const [x, y] = onWall(L, wall, a, b);
        if (keep[x + L.W * y]) return false;
      }
    }
    return true;
  };
  let n = 0;
  for (const [g0, g1] of wallGaps(L, wall)) {
    if (g0 === L.T) continue;
    const e = Math.min(g1, end - 3);
    const w = e - g0;
    if (w < 4) continue;
    const mid = Math.floor((g0 + e) / 2);
    if (wall === 'right') {
      const t = P.tall.find(([a0]) => a0 >= g0 && a0 < g1);
      if (t && floorFree(t[0], t[1], 1)) for (let a = t[0]; a < t[1]; a++) {
        const [x, y] = onWall(L, wall, a, 0);
        v.put(x, y, L.floor + 3, STEEL, 6);
        v.put(x, y, L.floor + 2, SEAM, 2);
      }
      beacon(v, L, P, wall, t ? mid : mid, fx, t ? P.lo + 2 : P.lo - 4);
      continue;
    }
    const kind = n++ % 3;
    if (kind === 0 && w >= 9 && floorFree(g0 + 1, e - 1, 2)) lockers(v, L, wall, g0 + 1, e - 1, rng);
    else if (kind !== 2 && w >= 8) board(v, L, wall, g0 + 1, e - 1, rng, fx);
    else vent(v, L, wall, mid, fx, rng);
    beacon(v, L, P, wall, mid, fx, P.lo - 4);
  }
}

// An amber warning beacon on a bracket; it turns, sweeping its light.
function beacon(v: Voxels, L: Layout, P: Plan, wall: Side, a: number, fx: Fixtures, h: number): void {
  if (h < 17 || h >= P.top - 3) return;
  const z = L.floor + h;
  const [bx, by] = onWall(L, wall, a, 0);
  if (v.get(bx, by, z) !== M.AIR || v.get(bx, by, z - 1) !== M.AIR) return;
  v.put(bx, by, z - 1, STEEL, 5);
  v.put(bx, by, z, M.LED_AMBER, 7);
  fx.beacons.push({ i: v.idx(bx, by, z), x: bx + 0.5, y: by + 0.5, z: z + 0.5, phase: hash3(fx.seed, a, h, 31) * TAU });
}

// A row of lockers, alternately white and orange, with a light each.
function lockers(v: Voxels, L: Layout, wall: Side, a0: number, a1: number, rng: Rng): void {
  const H = 12;
  for (let a = a0; a < a1; a++) {
    const k = Math.floor((a - a0) / 3);
    const i = (a - a0) % 3;
    for (let h = 0; h < H; h++) {
      for (const o of [0, 1]) {
        const [x, y] = onWall(L, wall, a, o);
        const z = L.floor + h;
        if (o === 0 || h === 0 || h === H - 1) v.put(x, y, z, h === H - 1 ? STEEL : HULL, h === H - 1 ? 6 : 2);
        else if (i === 2 || a === a1 - 1) v.put(x, y, z, SEAM, 2);
        else if (h === 9 && i === 1) v.put(x, y, z, rng.chance(0.7) ? M.NEON_GREEN : M.LED_RED, 7);
        else if (h === 6 && i === 1) v.put(x, y, z, STEEL, 7);
        else v.put(x, y, z, k & 1 ? ORANGE : WHITE, h > 9 ? 5 : 3);
      }
    }
  }
}

// A status board: bar graphs that rise and fall over a row of lights.
function board(v: Voxels, L: Layout, wall: Side, a0: number, a1: number, rng: Rng, fx: Fixtures): void {
  const h0 = 6;
  const h1 = 15;
  const cols: number[][] = [];
  const phase: number[] = [];
  const leds: number[] = [];
  for (let a = a0; a < a1; a++) {
    const col: number[] = [];
    for (let h = h0; h < h1; h++) {
      const [x, y] = onWall(L, wall, a, -1);
      const z = L.floor + h;
      const edge = a === a0 || a === a1 - 1 || h === h0 || h === h1 - 1;
      if (edge) v.put(x, y, z, STEEL, 5);
      else if (h === h1 - 2) {
        v.put(x, y, z, rng.chance(0.5) ? M.LED_AMBER : M.NEON_GREEN, 7);
        leds.push(v.idx(x, y, z));
      } else {
        v.put(x, y, z, SPACE, 3);
        if ((a - a0) % 2 === 1) col.push(v.idx(x, y, z));
      }
    }
    if (col.length) {
      cols.push(col);
      phase.push(rng.range(0, TAU));
    }
  }
  fx.boards.push({ cols, phase, leds });
}

// A louvred vent that blows off steam now and then.
function vent(v: Voxels, L: Layout, wall: Side, a: number, fx: Fixtures, rng: Rng): void {
  for (let da = -1; da <= 1; da++) {
    for (let h = 4; h <= 9; h++) {
      const [x, y] = onWall(L, wall, a + da, -1);
      v.put(x, y, L.floor + h, h & 1 ? SEAM : STEEL, 6);
    }
  }
  const [x, y] = onWall(L, wall, a, 0);
  fx.vents.push({ x, y, z: L.floor + 7, period: rng.range(7, 13), phase: rng.range(0, 13), burst: 1.4 });
}

// Light bars under the sill over each prop on a wall, lighting it; a
// downlight over each out on the deck.
function lampBars(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const h = P.lo - 3;
  for (const s of L.slots) {
    if (s.kind === 'entrance') continue;
    if (s.island) {
      const r = slotRect(s);
      fx.lamps.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2, z: L.floor + Math.min(h, 20) - 1, color: LAMPLIGHT, radius: 20, intensity: 0.18 });
      continue;
    }
    const c = along(s) + Math.floor(s.len / 2);
    const wall = s.wall;
    if (wall === 'right' && c + 2 >= P.grand[0] - 1 && c - 2 <= P.grand[1]) continue; // nothing to hang it from
    if (h >= 18) {
      for (let i = -2; i <= 2; i++) {
        const [x, y] = onWall(L, wall, c + i, -1);
        v.put(x, y, L.floor + h, Math.abs(i) === 2 ? STEEL : M.LAMP, Math.abs(i) === 2 ? 6 : 4);
      }
    }
    const [lx, ly] = onWall(L, wall, c, 4);
    fx.lamps.push({ x: lx + 0.5, y: ly + 0.5, z: L.floor + Math.min(h, 20) - 1, color: LAMPLIGHT, radius: 20, intensity: 0.22 });
  }
}

// The hydroponics bay: glass troughs of water on legs, a row of plants
// growing out of each under a grow light on posts, and a glass tank of
// water feeding them.
function hydroponics(v: Voxels, L: Layout, s: Disc, hub: Pt, rng: Rng, fx: Fixtures): void {
  const { at } = axes(s, hub);
  const n = s.r >= 10 ? 3 : s.r >= 7 ? 2 : 1;
  const wd = 4 * n - 1;
  const tank = s.r >= 8;
  let half = Math.max(2, Math.floor(Math.sqrt(Math.max(0, s.r * s.r - (wd / 2 + 1) ** 2))) - 1);
  if (tank) half = Math.min(half, Math.floor(s.r) - 6);
  const z0 = L.floor;
  const put: Put = (u, q, h, m, sh) => {
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  const q0 = -((wd - 1) >> 1);
  for (let k = 0; k < n; k++) trough(put, at, z0, half, q0 + 4 * k, rng, fx);
  if (tank) {
    const ut = half + 3;
    for (let dq = -2; dq <= 2; dq++) {
      for (let du = -2; du <= 2; du++) {
        const d = Math.hypot(du, dq);
        if (d >= 2.6) continue;
        put(ut + du, dq, 0, STEEL, 3);
        for (let h = 1; h < 9; h++) put(ut + du, dq, h, d < 1.5 ? M.WATER : h === 4 ? STEEL : M.GLASS, d < 1.5 ? undefined : h === 4 ? 6 : 4);
        put(ut + du, dq, 9, STEEL, d < 1.5 ? 7 : 5);
      }
    }
  }
  leavesIn(v, fx, s, z0);
}

type Put = (u: number, q: number, h: number, m: number, shade?: number) => void;

// A hydroponic trough along u in [-half, half] with its rims at q = qa and
// qa + 2: glass sides round a channel of water on legs, a plant every third
// voxel and a grow light on posts over it (purple, or white daylight).
function trough(put: Put, at: (u: number, q: number) => [number, number], z0: number, half: number, qa: number, rng: Rng, fx: Fixtures, daylight = false): void {
  for (let u = -half; u <= half; u++) {
    const end = u === -half || u === half;
    for (let q = qa; q < qa + 3; q++) {
      if (end && (q === qa || q === qa + 2)) {
        put(u, q, 0, STEEL, 3);
        put(u, q, 1, STEEL, 3);
      }
      put(u, q, 2, STEEL, 5);
      const rim = end || q !== qa + 1;
      put(u, q, 3, rim ? M.GLASS : M.WATER, rim ? 4 : undefined);
      put(u, q, 4, rim ? STEEL : WHITE, rim ? 6 : 5);
    }
  }
  for (let u = -half + 2; u <= half - 2; u += 3) {
    const tall = rng.int(2, 4);
    for (let h = 4; h < 5 + tall; h++) put(u, qa + 1, h, M.LEAF, rng.int(2, 6));
    for (const [du, dq] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (rng.chance(0.8)) put(u + du, qa + 1 + dq, 4 + tall, M.LEAF, rng.int(3, 7));
      if (rng.chance(0.4)) put(u + du, qa + 1 + dq, 3 + tall, M.LEAF, rng.int(1, 5));
    }
    const [x, y] = at(u, qa + 1);
    fx.plants.push({ x, y, base: z0 + 5, top: z0 + 5 + tall, max: z0 + 8 });
  }
  for (const u of [-half, half]) for (let h = 5; h < 10; h++) put(u, qa + 1, h, STEEL, 4);
  for (let u = -half; u <= half; u++) {
    const lamp = Math.abs(u) < half && (u & 1) === 0;
    put(u, qa + 1, 10, lamp ? (daylight ? M.LAMP : M.NEON_PURPLE) : STEEL, lamp ? 4 : 6);
    put(u, qa + 1, 11, STEEL, 6);
  }
  const [lx, ly] = at(0, qa + 1);
  fx.grow.push({ x: lx + 0.5, y: ly + 0.5, z: z0 + 8, color: daylight ? SUNLIT : GROW, radius: 9 + half, intensity: daylight ? 0.2 : 0.26 });
  for (let u = -half + 1; u < half; u += 2) {
    const [x, y] = at(u, qa + 1);
    fx.mist.push([x + 0.5, y + 0.5, z0 + 9.5]);
  }
}

// Records the leaves within a disc, for weather() to stir.
function leavesIn(v: Voxels, fx: Fixtures, s: Disc, z0: number): void {
  for (let y = Math.floor(s.y - s.r - 1); y <= Math.ceil(s.y + s.r + 1); y++) {
    for (let x = Math.floor(s.x - s.r - 1); x <= Math.ceil(s.x + s.r + 1); x++) {
      for (let z = z0 + 3; z < z0 + 10; z++) if (v.get(x, y, z) === M.LEAF) fx.leaves.push(v.idx(x, y, z));
    }
  }
}

// The command island: a ring of desks open toward the hub, screens on
// their outer rim, captains' chairs inside and a projector at the heart, a
// lit rim in the deck round it; the holo-ring turns over it (weather()).
function island(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const s = P.island;
  if (!s) return;
  const hub = P.floor.hub;
  const z0 = L.floor;
  const R = s.r;
  const r0 = R - 4;
  const r1 = R - 1.5;
  const open = Math.atan2(hub.y - s.y, hub.x - s.x);
  for (let y = Math.floor(s.y - R); y <= Math.ceil(s.y + R); y++) {
    for (let x = Math.floor(s.x - R); x <= Math.ceil(s.x + R); x++) {
      const d = Math.hypot(x - s.x, y - s.y);
      const ang = Math.atan2(y - s.y, x - s.x);
      const k = Math.floor(((ang + Math.PI) / TAU) * 72);
      if (Math.abs(d - (R - 0.5)) < 0.5) v.put(x, y, z0 - 1, k % 3 ? STEEL : M.NEON_CYAN, k % 3 ? 6 : 3);
      if (d < 1.6) {
        for (let h = 0; h < 3; h++) v.put(x, y, z0 + h, h === 2 ? STEEL : HULL, h === 2 ? 6 : 2);
        v.put(x, y, z0 + 3, M.NEON_CYAN, 4);
      }
      if (d < r0 || d >= r1 || Math.abs(wrapPi(ang - open)) < 0.5) continue;
      const outer = d >= r1 - 1;
      v.put(x, y, z0, SEAM, 2);
      v.put(x, y, z0 + 1, WHITE, 4);
      v.put(x, y, z0 + 2, outer ? ORANGE : WHITE, outer ? 4 : 5);
      v.put(x, y, z0 + 3, STEEL, 6);
      if (!outer) continue;
      v.put(x, y, z0 + 4, HULL, 2);
      if (k % 4) {
        v.put(x, y, z0 + 5, M.SCREEN, 3);
        if (k % 3 === 0) fx.blinks.push({ i: v.idx(x, y, z0 + 5), on: M.SCREEN, off: SPACE, period: 0.6 + (k % 5) * 0.3, phase: k * 0.17, duty: 0.6 });
      } else v.put(x, y, z0 + 5, STEEL, 5);
    }
  }
  // chairs facing the desks, the captain's in the middle
  for (const da of [-0.8, 0, 0.8]) {
    const a = open + Math.PI + da;
    const cx = Math.round(s.x + Math.cos(a) * (r0 - 1.5));
    const cy = Math.round(s.y + Math.sin(a) * (r0 - 1.5));
    const bx = Math.round(s.x + Math.cos(a) * (r0 - 2.6));
    const by2 = Math.round(s.y + Math.sin(a) * (r0 - 2.6));
    if (Math.hypot(cx - s.x, cy - s.y) < 2.5) continue;
    v.put(cx, cy, z0, STEEL, 4);
    v.put(cx, cy, z0 + 1, STEEL, 5);
    v.put(cx, cy, z0 + 2, da ? FABRIC : ORANGE, 4);
    if (Math.hypot(bx - s.x, by2 - s.y) >= 2) for (let h = 2; h < (da ? 4 : 5); h++) v.put(bx, by2, z0 + h, da ? FABRIC : ORANGE, 5);
  }
  fx.holo = { x: s.x + 0.5, y: s.y + 0.5, z: z0 + 12, r: Math.max(3, r0 - 0.5) };
}

// An equipment cluster, laid out facing the hub, a railing (or a glass
// partition) round its back.
function cluster(v: Voxels, L: Layout, c: Cluster, hub: Pt, rng: Rng, fx: Fixtures): void {
  const { at } = axes(c, hub);
  const z0 = L.floor;
  const R = c.r;
  const put: Put = (u, q, h, m, sh) => {
    if (Math.hypot(u, q) > R + 0.4) return;
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  const crate = (u0: number, q0: number, h0: number, n: number, face: number) => {
    for (let h = 0; h < n; h++) {
      for (let q = 0; q < n; q++) {
        for (let u = 0; u < n; u++) {
          const edges = +(u === 0 || u === n - 1) + +(q === 0 || q === n - 1) + +(h === 0 || h === n - 1);
          const strap = u === n >> 1 && edges < 2;
          put(u0 + u, q0 + q, h0 + h, edges >= 2 ? STEEL : strap ? ORANGE : face, edges >= 2 ? 6 : h === n - 2 ? 5 : 3);
        }
      }
    }
  };
  const blink = (u: number, q: number, h: number, on: number) => {
    const [x, y] = at(u, q);
    put(u, q, h, on, 7);
    if (v.get(x, y, z0 + h) === on) fx.blinks.push({ i: v.idx(x, y, z0 + h), on, off: SEAM, period: rng.range(0.5, 2.5), phase: rng.range(0, 2), duty: rng.range(0.3, 0.8) });
  };
  let partition = false;
  switch (c.kind) {
    case ROWS: {
      const qs = R >= 8 ? [-5, -1, 3] : [-3, 1];
      const reach = R >= 8 ? 5.5 : 3.5;
      const half = Math.max(2, Math.floor(Math.sqrt(Math.max(0, R * R - reach * reach))));
      for (const qa of qs) trough(put, at, z0, half, qa, rng, fx, true);
      leavesIn(v, fx, c, z0);
      break;
    }
    case CARGO: {
      // stacks on a grid, a gap between each
      const n = R >= 6 ? 4 : 3;
      const pitch = n + 1;
      const m = Math.floor((2 * R + 2) / pitch);
      const start = -Math.floor((m * pitch - 1) / 2);
      const faces = [ORANGE, WHITE, HULL, ORANGE];
      for (let gq = 0; gq < m; gq++) {
        for (let gu = 0; gu < m; gu++) {
          const u = start + gu * pitch;
          const q = start + gq * pitch;
          const far = Math.max(Math.hypot(u, q), Math.hypot(u + n - 1, q), Math.hypot(u, q + n - 1), Math.hypot(u + n - 1, q + n - 1));
          if (far > R + 0.4 || rng.chance(0.15)) continue;
          const face = faces[rng.int(0, 3)];
          crate(u, q, 0, n, face);
          if (rng.chance(0.55)) crate(u + (n > 3 ? 1 : 0), q, n, n - 1, face === WHITE ? ORANGE : WHITE);
        }
      }
      break;
    }
    case ENGINE: {
      // a generator, a gas tank, a cable spool
      for (let u = -4; u <= 0; u++) {
        for (let q = -1; q <= 1; q++) {
          for (let h = 0; h < 5; h++) put(u, q, h, h === 4 ? ((u + q) & 1 ? STEEL : SEAM) : h === 2 ? ORANGE : HULL, h === 4 ? 6 : 2);
        }
      }
      blink(-3, 1, 3, M.LED_AMBER);
      blink(-1, 1, 3, M.NEON_GREEN);
      const [vx, vy] = at(-2, 0);
      fx.vents.push({ x: vx, y: vy, z: z0 + 5, period: rng.range(6, 11), phase: rng.range(0, 10), burst: 1.2 });
      for (let q = -3; q <= 0; q++) {
        for (let u = 2; u <= 5; u++) {
          const d = Math.hypot(u - 3.5, q + 1.5);
          if (d > 1.9) continue;
          for (let h = 0; h < 7; h++) put(u, q, h, h === 6 ? STEEL : h === 2 || h === 4 ? ORANGE : WHITE, h === 6 ? 6 : 4);
        }
      }
      for (const [u, q] of [[2, 2], [3, 2], [2, 3], [3, 3]]) for (let h = 0; h < 3; h++) put(u, q, h, h === 1 ? STEEL : ORANGE, 4);
      break;
    }
    case SCIENCE: {
      // a lab bench with a microscope, two specimen tanks, a sample fridge
      for (let u = -4; u <= 1; u++) {
        for (let q = -1; q <= 0; q++) {
          put(u, q, 0, SEAM, 2);
          put(u, q, 1, WHITE, 4);
          put(u, q, 2, WHITE, 5);
          put(u, q, 3, STEEL, 6);
        }
      }
      put(-3, -1, 4, STEEL, 4);
      put(-3, -1, 5, STEEL, 6);
      put(-2, -1, 4, M.SCREEN, 5);
      put(0, -1, 4, M.GLASS, 5);
      put(1, 0, 4, ORANGE, 5);
      [[3, -3, M.NEON_GREEN], [3, 1, M.NEON_PURPLE]].forEach(([u0, q0, core]) => {
        for (let q = 0; q < 3; q++) {
          for (let u = 0; u < 3; u++) {
            put(u0 + u, q0 + q, 0, STEEL, 3);
            for (let h = 1; h < 6; h++) put(u0 + u, q0 + q, h, u === 1 && q === 1 ? core : M.GLASS, u === 1 && q === 1 ? 5 : 4);
            put(u0 + u, q0 + q, 6, STEEL, 6);
          }
        }
      });
      for (let u = -4; u <= -3; u++) for (let q = 2; q <= 3; q++) for (let h = 0; h < 6; h++) put(u, q, h, WHITE, h === 5 ? 6 : 4);
      blink(-3, 3, 4, M.SCREEN);
      partition = true;
      break;
    }
    default: {
      // operations: consoles in a row with their chairs
      for (const cu of [-4, 0, 4]) {
        for (let u = cu - 1; u <= cu + 1; u++) {
          for (let q = -1; q <= 0; q++) for (let h = 0; h < 4; h++) put(u, q, h, h === 3 ? STEEL : WHITE, h === 3 ? 6 : 4);
          for (let h = 4; h < 7; h++) {
            const edge = u !== cu || h === 6;
            put(u, -1, h, edge ? STEEL : M.SCREEN, edge ? 5 : 4);
          }
        }
        blink(cu, -1, 5, M.SCREEN);
        put(cu, 2, 0, STEEL, 4);
        put(cu, 2, 1, STEEL, 5);
        put(cu, 2, 2, FABRIC, 4);
        put(cu, 3, 2, FABRIC, 3);
        put(cu, 3, 3, FABRIC, 5);
      }
    }
  }
  // the railing (or glass partition) round its back, away from the hub
  const back = Math.atan2(c.y - hub.y, c.x - hub.x);
  for (let y = Math.floor(c.y - R - 2); y <= Math.ceil(c.y + R + 2); y++) {
    for (let x = Math.floor(c.x - R - 2); x <= Math.ceil(c.x + R + 2); x++) {
      const d = Math.hypot(x - c.x, y - c.y);
      if (Math.abs(d - R - 1) >= 0.55 || Math.abs(wrapPi(Math.atan2(y - c.y, x - c.x) - back)) > 1) continue;
      if (v.get(x, y, z0) !== M.AIR) continue;
      const post = (x + y) % 3 === 0;
      if (partition) {
        for (let h = 0; h < 5; h++) v.put(x, y, z0 + h, post ? STEEL : M.GLASS, post ? 5 : 4);
        v.put(x, y, z0 + 5, STEEL, 6);
      } else {
        if (post) for (let h = 0; h < 3; h++) v.put(x, y, z0 + h, STEEL, 4);
        v.put(x, y, z0 + 3, post ? STEEL : ORANGE, post ? 6 : 4);
      }
    }
  }
}

const wrapPi = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

// Odds and ends wherever a 16-voxel tile of floor is still bare and has
// room: a bollard light, a crate, a planter or a bin.
function filler(v: Voxels, L: Layout, P: Plan, rng: Rng, fx: Fixtures): void {
  const S = 16;
  const { W, D, T, floor } = L;
  const spare = P.spare.slice();
  for (let ty = T; ty + S <= D - 1; ty += S) {
    for (let tx = T; tx + S <= W - 1; tx += S) {
      let cov = 0;
      let lit = false;
      for (let y = ty; y < ty + S && !lit; y++) {
        for (let x = tx; x < tx + S && !lit; x++) {
          let up = false;
          for (let z = floor - 2; z < floor + 12; z++) {
            const m = v.get(x, y, z);
            if (GLOWS[m]) lit = true;
            if (z >= floor + 2 && m !== M.AIR && SOLIDISH[m]) up = true;
          }
          if (up) cov++;
        }
      }
      if (lit || cov >= S * S * 0.03) continue;
      for (let tries = 0; tries < 16; tries++) {
        const x = rng.int(tx + 2, tx + S - 3);
        const y = rng.int(ty + 2, ty + S - 3);
        let ok = true;
        for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) ok = spare[x + dx + W * (y + dy)] === 1 && v.get(x + dx, y + dy, floor) === M.AIR;
        if (!ok) continue;
        odd(v, L, x, y, rng.int(0, 3), rng, fx);
        mark(spare, L, x, y, 3);
        break;
      }
    }
  }
}

const GLOWS = new Uint8Array(256);
const SOLIDISH = new Uint8Array(256);
for (const m of MATERIALS) {
  if (!m) continue;
  if (m.glow) GLOWS[m.id] = 1;
  if (m.kind === 'solid' || m.kind === 'powder') SOLIDISH[m.id] = 1;
}

// One small thing at (x, y): a bollard light, a crate, a planter, a bin.
function odd(v: Voxels, L: Layout, x: number, y: number, kind: number, rng: Rng, fx: Fixtures): void {
  const z = L.floor;
  if (kind === 0) {
    for (let h = 0; h < 3; h++) v.put(x, y, z + h, STEEL, h ? 5 : 3);
    v.put(x, y, z + 3, M.LAMP, 6);
    v.put(x, y, z + 4, STEEL, 7);
    fx.lamps.push({ x: x + 0.5, y: y + 0.5, z: z + 3.5, color: AMBER, radius: 8, intensity: 0.25 });
  } else if (kind === 1) {
    const face = rng.chance(0.5) ? ORANGE : WHITE;
    for (let h = 0; h < 3; h++) {
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) v.put(x + dx, y + dy, z + h, h === 2 ? STEEL : face, h === 2 ? 6 : 4);
    }
  } else if (kind === 2) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) for (let h = 0; h < 2; h++) v.put(x + dx, y + dy, z + h, WHITE, 3 + h * 2);
    for (let h = 2; h < 6; h++) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -1; dx <= 2; dx++) {
          if (Math.hypot(dx - 0.5, dy - 0.5) < 1.7 - (h - 3.5) * 0.3 && rng.chance(0.8)) {
            v.put(x + dx, y + dy, z + h, M.LEAF, rng.int(1, 7));
            fx.leaves.push(v.idx(x + dx, y + dy, z + h));
          }
        }
      }
    }
  } else {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        for (let h = 0; h < 3; h++) v.put(x + dx, y + dy, z + h, HULL, 2 + h);
        v.put(x + dx, y + dy, z + 3, ORANGE, 5);
      }
    }
  }
}

// The galley: a counter toward the hub with a coffee machine and its pot,
// a water cooler and mugs; behind it a round table with stools.
function galley(v: Voxels, L: Layout, s: Disc, hub: Pt, fx: Fixtures): void {
  const { at } = axes(s, hub);
  const z0 = L.floor;
  const qc = Math.max(0, Math.round(s.r) - 3); // the counter's middle row
  const put = (u: number, q: number, h: number, m: number, sh?: number) => {
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  for (let u = -3; u <= 3; u++) {
    for (let q = qc - 1; q <= qc + 1; q++) {
      put(u, q, 0, SEAM, 2);
      put(u, q, 1, WHITE, 4);
      put(u, q, 2, q === qc + 1 && Math.abs(u) < 3 ? ORANGE : WHITE, 4);
      put(u, q, 3, STEEL, 6);
    }
  }
  // the coffee machine at the back, its pot in front on the counter
  for (let u = -3; u <= -1; u++) for (let h = 4; h <= 7; h++) put(u, qc - 1, h, HULL, h === 7 ? 4 : 2);
  put(-1, qc - 1, 6, M.SCREEN, 6);
  put(-3, qc - 1, 7, M.LED_AMBER, 7);
  put(-2, qc - 1, 7, STEEL, 6);
  put(-2, qc, 4, M.COFFEE);
  put(-3, qc, 4, M.GLASS, 4);
  put(-1, qc, 4, M.GLASS, 4);
  put(-2, qc + 1, 4, M.GLASS, 4);
  // the water cooler: a glass jug, a column of water inside
  for (let u = 1; u <= 3; u++) {
    for (let q = qc - 1; q <= qc + 1; q++) {
      for (let h = 4; h <= 6; h++) {
        const core = u === 2 && q === qc;
        if (core && h < 6) put(u, q, h, M.WATER);
        else put(u, q, h, core ? STEEL : M.GLASS, core ? 6 : 4);
      }
    }
  }
  put(0, qc + 1, 4, ORANGE, 5); // mugs
  put(0, qc, 4, WHITE, 7);
  // the table behind, with stools round it
  const qt = qc - 5;
  if (qt - 3 >= -s.r) {
    for (let h = 0; h < 3; h++) put(0, qt, h, STEEL, h === 2 ? 5 : 3);
    for (let dq = -1; dq <= 1; dq++) for (let du = -1; du <= 1; du++) put(du, qt + dq, 3, WHITE, du || dq ? 5 : 7);
    put(0, qt, 4, ORANGE, 5);
    for (const [du, dq] of [[-3, 0], [3, 0], [0, -3]]) {
      put(du, qt + dq, 0, STEEL, 4);
      put(du, qt + dq, 1, STEEL, 5);
      put(du, qt + dq, 2, ORANGE, 5);
    }
  }
  const [px, py] = at(-2, qc);
  const [lx, ly] = at(0, qc);
  fx.galley = { steam: [px, py, z0 + 5], light: { x: lx + 0.5, y: ly + 0.5, z: z0 + 8, color: AMBER, radius: 13, intensity: 0.38 } };
}

// The lounge: a rug, a sofa with its back to the room's edge, a low table,
// a floor lamp and a potted palm.
function lounge(v: Voxels, L: Layout, s: Disc, hub: Pt, rng: Rng, fx: Fixtures): void {
  const { at } = axes(s, hub);
  const z0 = L.floor;
  const R = Math.round(s.r);
  const put = (u: number, q: number, h: number, m: number, sh?: number) => {
    if (Math.hypot(u, q) > s.r + 0.5) return;
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  for (let q = -R; q <= R; q++) {
    for (let u = -R; u <= R; u++) {
      const d = Math.hypot(u, q * 1.15);
      if (d < R - 1) put(u, q, -1, FABRIC, Math.abs(d - (R - 3.5)) < 0.6 ? 7 : d > R - 2 ? 1 : 3);
    }
  }
  const qb = -(R - 2); // the sofa's back
  for (let u = -4; u <= 4; u++) {
    const arm = Math.abs(u) === 4;
    put(u, qb, 0, STEEL, 3);
    put(u, qb + 1, 0, STEEL, 3);
    put(u, qb, 1, FABRIC, 5);
    put(u, qb, 2, arm ? WHITE : FABRIC, arm ? 5 : 6);
    if (!arm) put(u, qb, 3, FABRIC, 7);
    put(u, qb + 1, 1, arm ? WHITE : FABRIC, arm ? 5 : (u & 1) ? 4 : 3);
    if (arm) put(u, qb + 1, 2, WHITE, 6);
  }
  // the table to one side, a mug and a glowing slate on it
  for (const [du, dq] of [[3, 2], [4, 2], [3, 3], [4, 3]]) {
    put(du, qb + dq, 0, STEEL, 3);
    put(du, qb + dq, 1, WHITE, 6);
  }
  put(3, qb + 2, 2, ORANGE, 5);
  put(4, qb + 3, 2, M.SCREEN, 5);
  // the lamp, warm, by the sofa's end
  for (let h = 0; h < 7; h++) put(-5, qb + 1, h, STEEL, h ? 5 : 3);
  put(-5, qb + 1, 7, M.LAMP, 7);
  const [lx, ly] = at(-5, qb + 2);
  fx.lamps.push({ x: lx + 0.5, y: ly + 0.5, z: z0 + 6, color: AMBER, radius: 14, intensity: 0.45 });
  // a palm in a pot
  if (R >= 7) {
    const pu = 6;
    const pq = qb + 1;
    for (let h = 0; h < 2; h++) for (const [du, dq] of [[0, 0], [1, 0], [0, 1], [1, 1]]) put(pu + du, pq + dq, h, ORANGE, 3 + h);
    for (let h = 2; h < 7; h++) put(pu, pq, h, DESERT, 1 + (h & 1) * 2); // the trunk
    for (let k = 0; k < 18; k++) {
      const a = rng.range(0, TAU);
      const rr = rng.range(0.8, 2.6);
      put(pu + Math.round(Math.cos(a) * rr), pq + Math.round(Math.sin(a) * rr), 7 - Math.round(rr * 0.6), M.LEAF, rng.int(2, 7));
    }
  }
}

// An aquarium on a stand: gravel, kelp and fish behind glass.
function aquarium(v: Voxels, L: Layout, s: Disc, hub: Pt, rng: Rng, fx: Fixtures): void {
  const { at } = axes(s, hub);
  const z0 = L.floor;
  const U = Math.max(2, Math.round(s.r) - 2);
  const put = (u: number, q: number, h: number, m: number, sh?: number) => {
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  for (let q = -2; q <= 2; q++) {
    for (let u = -U; u <= U; u++) {
      const wall = Math.abs(u) === U || Math.abs(q) === 2;
      put(u, q, 0, STEEL, 3);
      put(u, q, 1, wall ? STEEL : HULL, wall ? 6 : 2);
      put(u, q, 2, wall ? M.GLASS : DESERT, wall ? 4 : rng.int(1, 6));
      for (let h = 3; h < 7; h++) put(u, q, h, wall ? M.GLASS : M.WATER, wall ? 4 : undefined);
      put(u, q, 7, wall ? STEEL : M.GLASS, wall ? 6 : 5);
    }
  }
  for (let u = -U + 1; u < U; u += 2) {
    const q = rng.int(-1, 1);
    for (let h = 3; h < 3 + rng.int(1, 3); h++) put(u, q, h, M.LEAF, rng.int(1, 6));
  }
  const [lx, ly] = at(0, 0);
  fx.lamps.push({ x: lx + 0.5, y: ly + 0.5, z: z0 + 8, color: CYAN, radius: 10, intensity: 0.3 });
  const lo = at(-U + 1, -1);
  const hi = at(U - 1, 1);
  const box: [[number, number, number], [number, number, number]] = [
    [Math.min(lo[0], hi[0]), Math.min(lo[1], hi[1]), z0 + 3],
    [Math.max(lo[0], hi[0]), Math.max(lo[1], hi[1]), z0 + 6],
  ];
  for (let k = 0; k < Math.min(4, U); k++) {
    const x = rng.int(box[0][0], box[1][0]);
    const y = rng.int(box[0][1], box[1][1]);
    const z = rng.int(z0 + 3, z0 + 5);
    if (v.get(x, y, z) !== M.WATER) continue;
    // released once the world runs, so healing never grows a ghost of one back
    fx.fish.push({ i: -1 - v.idx(x, y, z), m: k & 1 ? M.LED_AMBER : ORANGE, dir: rng.int(0, 3), lo: box[0], hi: box[1] });
  }
}

// The arboretum: raised planters, each with a little tree.
function arboretum(v: Voxels, L: Layout, s: Disc, rng: Rng, fx: Fixtures): void {
  const z0 = L.floor;
  const n = s.r >= 7 ? 3 : s.r >= 6 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + 0.6;
    const off = n === 1 ? 0 : s.r - 4;
    const cx = Math.round(s.x + Math.cos(a) * off);
    const cy = Math.round(s.y + Math.sin(a) * off);
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const rim = Math.abs(dx) === 2 || Math.abs(dy) === 2;
        v.put(cx + dx, cy + dy, z0, rim ? WHITE : DESERT, rim ? 4 : 2);
        v.put(cx + dx, cy + dy, z0 + 1, rim ? WHITE : DESERT, rim ? 6 : rng.int(0, 3));
      }
    }
    const tall = rng.int(4, 6);
    for (let h = 2; h < 2 + tall; h++) v.put(cx, cy, z0 + h, DESERT, h & 1 ? 1 : 3);
    const top = z0 + 2 + tall;
    for (let dz = -1; dz <= 3; dz++) {
      for (let dy = -3; dy <= 3; dy++) {
        for (let dx = -3; dx <= 3; dx++) {
          const d = Math.hypot(dx, dy, dz * 1.3 - 0.5);
          if (d < 2.9 && rng.chance(d < 2 ? 0.95 : 0.6)) v.put(cx + dx, cy + dy, top + dz, M.LEAF, rng.int(1, 7));
        }
      }
    }
    for (let dz = -1; dz <= 3; dz++) {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) if (v.get(cx + dx, cy + dy, top + dz) === M.LEAF) fx.leaves.push(v.idx(cx + dx, cy + dy, top + dz));
    }
  }
  fx.lamps.push({ x: s.x, y: s.y, z: z0 + 12, color: SUNLIT, radius: Math.min(30, 10 + s.r * 1.5), intensity: 0.3 });
}

// EVA suits on a rack: white, banded in orange, gold visors.
function suitRack(v: Voxels, L: Layout, s: Disc, hub: Pt): void {
  const { at } = axes(s, hub);
  const z0 = L.floor;
  const put = (u: number, q: number, h: number, m: number, sh?: number) => {
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  const n = s.r >= 7 ? 3 : 2;
  const span = (n - 1) * 4;
  for (let u = -span / 2 - 2; u <= span / 2 + 2; u++) {
    put(u, -2, 11, STEEL, 6);
    if (Math.abs(u) === span / 2 + 2) for (let h = 0; h < 11; h++) put(u, -2, h, STEEL, 4);
  }
  for (let k = 0; k < n; k++) {
    const c = -span / 2 + k * 4;
    for (let h = 0; h < 4; h++) for (const du of [-1, 1]) put(c + du, 0, h, WHITE, h === 0 ? 2 : 5); // legs
    for (let h = 4; h < 8; h++) {
      for (let du = -1; du <= 1; du++) for (const q of [0, -1]) put(c + du, q, h, h === 5 ? ORANGE : WHITE, h === 5 ? 4 : 6);
      put(c, -2, h, STEEL, 3); // backpack against the rack
    }
    for (let h = 5; h < 8; h++) for (const du of [-2, 2]) put(c + du, 0, h, WHITE, 4); // arms
    for (let h = 8; h < 10; h++) {
      for (let du = -1; du <= 1; du++) put(c + du, -1, h, WHITE, 7);
      for (let du = -1; du <= 1; du++) put(c + du, 0, h, du === 0 || h === 9 ? CITY : WHITE, 6); // visor
    }
    put(c, 0, 10, STEEL, 5);
  }
}

// A treadmill: a belt that runs, rails and a little screen.
function treadmill(v: Voxels, L: Layout, s: Disc, hub: Pt, fx: Fixtures): void {
  const { at } = axes(s, hub);
  const z0 = L.floor;
  const put = (u: number, q: number, h: number, m: number, sh?: number) => {
    const [x, y] = at(u, q);
    v.put(x, y, z0 + h, m, sh);
  };
  const belt: Belt = { cells: [], k: [] };
  for (let q = -3; q <= 3; q++) {
    for (let u = -2; u <= 2; u++) {
      const side = Math.abs(u) === 2;
      put(u, q, 0, side ? WHITE : SEAM, side ? 4 : 3);
      if (!side) {
        const [x, y] = at(u, q);
        belt.cells.push(v.idx(x, y, z0));
        belt.k.push(q + 3);
      }
    }
  }
  for (const u of [-2, 2]) for (let h = 1; h < 5; h++) put(u, 3, h, STEEL, 4);
  for (let u = -2; u <= 2; u++) put(u, 3, 5, u === 0 ? M.SCREEN : STEEL, 6);
  for (const u of [-2, 2]) for (let q = 1; q <= 3; q++) put(u, q, 4, STEEL, 6);
  fx.belts.push(belt);
}

// The drone's dock: a lit landing ring flush in the deck and a charging
// post with a light that blinks while it charges. The drone itself is made
// once the world runs (so healing never grows a ghost of it back).
function dock(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const s = P.dock!;
  const cx = Math.round(s.x);
  const cy = Math.round(s.y);
  const z = L.floor - 1;
  for (let y = cy - 3; y <= cy + 3; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d < 1.6) v.put(x, y, z, ORANGE, 4);
      else if (d < 2.7) v.put(x, y, z, M.NEON_CYAN, 3);
      else if (d < 3.3) v.put(x, y, z, STEEL, 6);
    }
  }
  // the post, on the side away from the hub
  const hub = P.floor.hub;
  const a = Math.atan2(cy - hub.y, cx - hub.x);
  const px = Math.round(cx + Math.cos(a) * 3.6);
  const py = Math.round(cy + Math.sin(a) * 3.6);
  for (let h = 0; h < 4; h++) v.put(px, py, L.floor + h, STEEL, h === 3 ? 6 : 3);
  v.put(px, py, L.floor + 4, M.LED_AMBER, 7);
  fx.blinks.push({ i: v.idx(px, py, L.floor + 4), on: M.LED_AMBER, off: SEAM, period: 1.2, phase: 0, duty: 0.5 });
  // where it may roam: free floor round the dock, the whole drone clear
  const free = P.floor.free(1);
  const W = L.W;
  const roam: number[] = [];
  const R = 12 + 8 * growth(L);
  for (let y = cy - R; y <= cy + R; y++) {
    for (let x = cx - R; x <= cx + R; x++) {
      if (x < L.T + 2 || y < L.T + 2 || x >= W - 2 || y >= L.D - 2 || Math.hypot(x - cx, y - cy) > R) continue;
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) for (let dx = -2; dx <= 2 && ok; dx++) ok = free[x + dx + W * (y + dy)] === 1 || Math.hypot(x + dx - cx, y + dy - cy) < 3;
      if (ok) roam.push(x + W * y);
    }
  }
  fx.drone = { x: cx, y: cy, hx: cx, hy: cy, tx: cx, ty: cy, next: 0, rest: 3, cells: [], head: 0, roam };
}

// Odds and ends on the open floor, each within two voxels of p: a stack of
// cargo crates, a console with a flickering screen, a planter, a tool cart.
function odds(v: Voxels, L: Layout, p: Pt, rng: Rng, fx: Fixtures): void {
  const z = L.floor;
  const crate = (x0: number, y0: number, z0: number, n: number, face: number) => {
    for (let h = 0; h < n; h++) {
      for (let dy = 0; dy < n; dy++) {
        for (let dx = 0; dx < n; dx++) {
          const edges = +(dx === 0 || dx === n - 1) + +(dy === 0 || dy === n - 1) + +(h === 0 || h === n - 1);
          v.put(x0 + dx, y0 + dy, z0 + h, edges >= 2 ? STEEL : face, edges >= 2 ? 6 : h === n - 2 ? 5 : 3);
        }
      }
    }
  };
  switch (rng.int(0, 3)) {
    case 0: {
      crate(p.x - 2, p.y - 2, z, 4, rng.chance(0.5) ? ORANGE : WHITE);
      if (rng.chance(0.6)) crate(p.x - 2 + rng.int(0, 1), p.y - 2 + rng.int(0, 1), z + 4, 3, rng.chance(0.5) ? WHITE : HULL);
      else crate(p.x + 2, p.y - 1, z, 2, ORANGE);
      break;
    }
    case 1: {
      // a console: a white pedestal, a tilted dark screen with live readouts
      for (let dy = -1; dy <= 0; dy++) for (let dx = -1; dx <= 1; dx++) for (let h = 0; h < 4; h++) v.put(p.x + dx, p.y + dy, z + h, h === 3 ? STEEL : WHITE, h === 3 ? 6 : h === 0 ? 2 : 4);
      for (let dx = -1; dx <= 1; dx++) {
        for (let h = 4; h < 7; h++) {
          const edge = Math.abs(dx) === 1 || h === 6;
          v.put(p.x + dx, p.y - 1, z + h, edge ? STEEL : M.SCREEN, edge ? 5 : 4);
          if (!edge) fx.blinks.push({ i: v.idx(p.x + dx, p.y - 1, z + h), on: M.SCREEN, off: SPACE, period: rng.range(0.4, 1.6), phase: rng.range(0, 2), duty: rng.range(0.4, 0.8) });
        }
      }
      v.put(p.x - 1, p.y, z + 4, M.LED_AMBER, 7);
      v.put(p.x + 1, p.y, z + 4, M.NEON_GREEN, 7);
      fx.blinks.push({ i: v.idx(p.x - 1, p.y, z + 4), on: M.LED_AMBER, off: SEAM, period: 1.1, phase: rng.range(0, 1), duty: 0.5 });
      break;
    }
    case 2: {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) for (let h = 0; h < 3; h++) v.put(p.x + dx, p.y + dy, z + h, Math.abs(dx) === 1 || Math.abs(dy) === 1 ? WHITE : DESERT, h === 2 ? 6 : 3);
      for (let h = 3; h < 8; h++) {
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const r = Math.hypot(dx, dy, (h - 5.5) * 1.2);
            if (r < 2.4 && rng.chance(r < 1.5 ? 0.95 : 0.6)) {
              v.put(p.x + dx, p.y + dy, z + h, M.LEAF, rng.int(1, 7));
              fx.leaves.push(v.idx(p.x + dx, p.y + dy, z + h));
            }
          }
        }
      }
      break;
    }
    default: {
      for (let dy = -1; dy <= 0; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          v.put(p.x + dx, p.y + dy, z, Math.abs(dx) === 2 ? SEAM : HULL, 2);
          v.put(p.x + dx, p.y + dy, z + 1, ORANGE, 4);
          v.put(p.x + dx, p.y + dy, z + 2, ORANGE, 5);
          v.put(p.x + dx, p.y + dy, z + 3, STEEL, 6);
        }
      }
      for (let h = 4; h < 7; h++) v.put(p.x + 2, p.y, z + h, STEEL, 4); // handle
      v.put(p.x - 1, p.y - 1, z + 4, HULL, 3); // a toolbox on top
      v.put(p.x, p.y - 1, z + 4, HULL, 3);
      v.put(p.x - 1, p.y, z + 4, M.LED_AMBER, 6);
    }
  }
}

// Cargo in the back corner: containers and a canister.
function cargo(v: Voxels, L: Layout, P: Plan): void {
  const { T, W, floor } = L;
  const keep = P.floor.paths;
  const free = (x0: number, y0: number, sx: number, sy: number) => {
    for (let y = y0; y < y0 + sy; y++) for (let x = x0; x < x0 + sx; x++) if (keep[x + W * y] || v.get(x, y, floor) !== M.AIR) return false;
    return true;
  };
  const box = (x0: number, y0: number, z0: number, sx: number, sy: number, sz: number, face: number) => {
    for (let z = z0; z < z0 + sz; z++) {
      for (let y = y0; y < y0 + sy; y++) {
        for (let x = x0; x < x0 + sx; x++) {
          const edges = +(x === x0 || x === x0 + sx - 1) + +(y === y0 || y === y0 + sy - 1) + +(z === z0 || z === z0 + sz - 1);
          v.put(x, y, z, edges >= 2 ? STEEL : face, edges >= 2 ? 5 : z === z0 + sz - 2 ? 6 : 3);
        }
      }
    }
  };
  if (free(T, T, 5, 4)) {
    box(T, T, floor, 5, 4, 4, ORANGE);
    box(T, T, floor + 4, 4, 4, 3, WHITE);
  }
  if (free(T, T + 4, 4, 4)) box(T, T + 4, floor, 4, 4, 4, WHITE);
  if (free(T + 5, T, 3, 3)) {
    for (let z = floor; z < floor + 6; z++) {
      for (let y = T; y < T + 3; y++) {
        for (let x = T + 5; x < T + 8; x++) {
          if ((x === T + 5 || x === T + 7) && (y === T || y === T + 2)) continue;
          v.put(x, y, z, z === floor + 2 || z === floor + 4 ? ORANGE : STEEL, z === floor + 5 ? 6 : 3);
        }
      }
    }
  }
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const fx = FIXTURES.get(c.v);
  if (!fx) return;
  const v = c.v;
  const t = c.t;

  // The view: the planet turns, the moon creeps, stars twinkle.
  refresh(v, fx, fx.near, Math.ceil(fx.near.idx.length / 12), t);
  refresh(v, fx, fx.far, Math.ceil(fx.far.idx.length / 20), t);
  c.light(fx.sun);

  // Guide lights chase out from the back corner.
  for (let k = 0; k < fx.studs.length; k++) {
    const on = wrap(fx.studK[k] * 0.35 - t * 2.2) < 0.7;
    cycle(v, fx.studs[k], on ? M.LED_AMBER : SEAM, on ? 6 : 5, [M.LED_AMBER, SEAM]);
  }

  // Status lights blink, each to its beat.
  for (const b of fx.blinks) {
    const on = (((t + b.phase) % b.period) + b.period) % b.period < b.period * b.duty;
    cycle(v, b.i, on ? b.on : b.off, on ? 7 : 3, [b.on, b.off]);
  }

  // Warning beacons turn.
  for (const b of fx.beacons) {
    const a = t * 3.2 + b.phase;
    const on = Math.sin(a) > -0.2;
    cycle(v, b.i, on ? M.LED_AMBER : STEEL, on ? 7 : 4, [M.LED_AMBER, STEEL]);
    if (on) c.light({ x: b.x + Math.cos(a) * 2.5, y: b.y + Math.sin(a) * 2.5, z: b.z, color: AMBER, radius: 11, intensity: 0.4 });
  }

  for (const l of fx.lamps) c.light(l);

  // Vents blow off steam.
  for (const s of fx.vents) {
    if ((t + s.phase) % s.period >= s.burst) continue;
    if (c.rng.chance(c.dt * 25)) puff(c, s.x, s.y, s.z, M.STEAM, c.rng.int(30, 55));
  }

  // Status boards: one bar at a time finds its new level.
  for (const b of fx.boards) {
    if (!b.cols.length) continue;
    const k = Math.floor(t * 8) % b.cols.length;
    const col = b.cols[k];
    const lvl = Math.round((0.5 + 0.45 * Math.sin(t * 0.9 + b.phase[k]) * Math.sin(t * 0.37 + k)) * col.length);
    col.forEach((i, h) => cycle(v, i, h < lvl ? M.SCREEN : SPACE, h < lvl ? 3 + Math.min(4, h) : 3, [M.SCREEN, SPACE]));
    if (b.leds.length && c.rng.chance(c.dt * 2)) {
      const i = b.leds[c.rng.int(0, b.leds.length - 1)];
      const on = c.rng.chance(0.6);
      cycle(v, i, on ? (c.rng.chance(0.5) ? M.LED_AMBER : M.NEON_GREEN) : SEAM, on ? 7 : 3, LED_STATES);
    }
  }

  hydroTick(c, fx);
  fishTick(c, fx);
  for (const b of fx.belts) {
    const k0 = Math.floor(c.t * 6);
    b.cells.forEach((i, j) => cycle(v, i, SEAM, (b.k[j] + k0) % 3 === 0 ? 7 : 3, [SEAM]));
  }
  galleyTick(c, fx);
  if (fx.drone) droneTick(c, L, fx.drone);
  if (fx.holo) holoRing(c, fx.holo);

  // Dust motes drift in the air, catching the light.
  if (c.rng.chance(c.dt * 5)) {
    const glow = c.rng.chance(0.25);
    c.spawn({
      kind: 'glint',
      x: c.rng.range(L.T + 2, L.W - 2),
      y: c.rng.range(L.T + 2, L.D - 2),
      z: L.floor + c.rng.range(3, L.H - L.floor - 4),
      vx: c.rng.range(-0.3, 0.3),
      vy: c.rng.range(-0.3, 0.3),
      vz: c.rng.range(-0.15, 0.15),
      life: c.rng.range(3, 7),
      color: glow ? DUST_GLOW : DUST,
      glow,
      gravity: -0.02,
    });
  }
}

// The holo-ring over the command ring: a wide ring of light turning one
// way, a tilted one inside it the other, a beacon at the heart.
function holoRing(c: Ctx, h: { x: number; y: number; z: number; r: number }): void {
  const life = c.dt * 1.5 + 0.01;
  const n = Math.round(h.r * 3.5);
  const spin = c.t * 0.35;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU + spin;
    c.spawn({ kind: 'glint', x: h.x + Math.cos(a) * h.r, y: h.y + Math.sin(a) * h.r, z: h.z, vx: 0, vy: 0, vz: 0, life, color: k % 5 === 0 ? AMBER : HOLO, glow: true, gravity: 0 });
    const b = -(k / n) * TAU - spin * 1.7;
    const rr = h.r * 0.62;
    c.spawn({ kind: 'glint', x: h.x + Math.cos(b) * rr, y: h.y + Math.sin(b) * rr * 0.8, z: h.z + 1 + Math.sin(b) * rr * 0.45, vx: 0, vy: 0, vz: 0, life, color: HOLO_DIM, glow: true, gravity: 0 });
  }
  const pulse = Math.sin(c.t * 2.2) > 0;
  c.spawn({ kind: 'glint', x: h.x, y: h.y, z: h.z + 1, vx: 0, vy: 0, vz: 0, life, color: pulse ? WHITE_HOT : HOLO, glow: true, gravity: 0 });
  c.light({ x: h.x, y: h.y, z: h.z, color: HOLO, radius: clamp(h.r * 2.6, 8, 32), intensity: 0.32 });
}

// Hydroponics: grow lights hum, leaves stir, mist drifts down, and the
// plants grow (and get trimmed back).
function hydroTick(c: Ctx, fx: Fixtures): void {
  const v = c.v;
  for (const l of fx.grow) c.light({ ...l, intensity: l.intensity * (0.95 + 0.05 * Math.sin(c.t * 40 + l.x)) });
  if (fx.leaves.length && c.rng.chance(c.dt * 10)) {
    const i = fx.leaves[c.rng.int(0, fx.leaves.length - 1)];
    if (v.mat[i] === M.LEAF) v.set(i, M.LEAF, c.rng.int(1, 7));
  }
  if (fx.mist.length && c.rng.chance(c.dt * 3)) {
    const [x, y, z] = fx.mist[c.rng.int(0, fx.mist.length - 1)];
    c.spawn({ kind: 'drop', x: x + c.rng.range(-0.4, 0.4), y: y + c.rng.range(-0.4, 0.4), z, vx: 0, vy: 0, vz: -0.5, life: 1.2, color: BUBBLE, glow: false, gravity: 12 });
  }
  if (fx.plants.length && c.rng.chance(c.dt * 0.15)) {
    const p = fx.plants[c.rng.int(0, fx.plants.length - 1)];
    if (p.top < p.max && v.get(p.x, p.y, p.top) === M.AIR) {
      v.put(p.x, p.y, p.top, M.LEAF, c.rng.int(4, 7));
      fx.leaves.push(v.idx(p.x, p.y, p.top));
      p.top++;
    } else if (p.top > p.base + 1 && v.get(p.x, p.y, p.top - 1) === M.LEAF) {
      p.top--;
      v.put(p.x, p.y, p.top, M.AIR);
    }
  }
}

// Fish swim about their tank, a voxel at a time, trading places with water.
function fishTick(c: Ctx, fx: Fixtures): void {
  const v = c.v;
  for (const f of fx.fish) {
    if (f.i < 0) {
      const j = -1 - f.i;
      if (v.mat[j] === M.WATER) {
        v.set(j, f.m, 6);
        f.i = j;
      }
      continue;
    }
    if (v.mat[f.i] !== f.m || !c.rng.chance(c.dt * 4)) continue;
    if (c.rng.chance(0.2)) f.dir = c.rng.int(0, 5);
    const [dx, dy, dz] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]][f.dir];
    const x = v.xOf(f.i) + dx;
    const y = v.yOf(f.i) + dy;
    const z = v.zOf(f.i) + dz;
    if (x < f.lo[0] || y < f.lo[1] || z < f.lo[2] || x > f.hi[0] || y > f.hi[1] || z > f.hi[2] || v.get(x, y, z) !== M.WATER) {
      f.dir = c.rng.int(0, 5);
      continue;
    }
    const j = v.idx(x, y, z);
    v.swap(f.i, j);
    f.i = j;
  }
}

// The galley: the coffee steams.
function galleyTick(c: Ctx, fx: Fixtures): void {
  const g = fx.galley;
  if (!g) return;
  c.light(g.light);
  const [sx, sy, sz] = g.steam;
  if (c.v.get(sx, sy, sz - 1) === M.COFFEE && c.rng.chance(c.dt * 1.2)) puff(c, sx, sy, sz, M.STEAM, c.rng.int(20, 35));
}

// The cleaning drone: hovers about the free floor round its dock, picking
// up any grit or ash it passes over, and goes home now and then to charge.
const DRONE_STEP = 0.16;
const PLUS: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
const HEADS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DRONE_MATS: readonly number[] = [ORANGE, STEEL, WHITE, M.SCREEN];

function droneTick(c: Ctx, L: Layout, d: Drone): void {
  const v = c.v;
  const z = L.floor;
  const mine = (i: number) => d.cells.includes(i);
  // Could it hover with its centre at (x, y)?
  const fits = (x: number, y: number) => {
    for (const [dx, dy] of PLUS) {
      const ground = v.get(x + dx, y + dy, z);
      if (ground !== M.AIR && !isLoose(ground)) return false;
      for (const h of [1, 2]) {
        if (h === 2 && (dx || dy)) continue;
        const m = v.get(x + dx, y + dy, z + h);
        if (m !== M.AIR && !(v.inside(x + dx, y + dy, z + h) && mine(v.idx(x + dx, y + dy, z + h)))) return false;
      }
    }
    return true;
  };
  const draw = (x: number, y: number) => {
    for (const i of d.cells) if (DRONE_MATS.includes(v.mat[i])) v.set(i, M.AIR, 0, 0);
    d.cells = [];
    const [hx, hy] = HEADS[d.head];
    for (const [dx, dy] of PLUS) {
      const below = v.idx(x + dx, y + dy, z);
      if (isLoose(v.mat[below])) {
        v.set(below, M.AIR, 0, 0);
        c.spawn({ kind: 'glint', x: x + dx + 0.5, y: y + dy + 0.5, z: z + 0.5, vx: 0, vy: 0, vz: 1.5, life: 0.4, color: DATA, glow: true, gravity: 0 });
      }
      const i = v.idx(x + dx, y + dy, z + 1);
      const eye = dx === hx && dy === hy;
      v.set(i, dx || dy ? (eye ? M.SCREEN : ORANGE) : STEEL, eye ? 7 : 5);
      d.cells.push(i);
    }
    const top = v.idx(x, y, z + 2);
    v.set(top, WHITE, 7);
    d.cells.push(top);
    d.x = x;
    d.y = y;
  };
  if (!d.cells.length) {
    if (fits(d.x, d.y)) draw(d.x, d.y);
    return;
  }
  // Knocked about (blown up, buried)? Pick itself up and redraw.
  if (d.cells.some((i) => !DRONE_MATS.includes(v.mat[i]))) {
    d.cells = d.cells.filter((i) => DRONE_MATS.includes(v.mat[i]));
    if (fits(d.x, d.y)) draw(d.x, d.y);
  }
  const home = d.x === d.hx && d.y === d.hy;
  c.light({ x: d.x + 0.5, y: d.y + 0.5, z: z + 0.5, color: home ? AMBER : CYAN, radius: 7, intensity: 0.3 });
  if (c.t < d.next) return;
  d.next = c.t + DRONE_STEP;
  if (d.rest > 0) {
    d.rest -= DRONE_STEP;
    return;
  }
  if (d.x === d.tx && d.y === d.ty) {
    if (c.rng.chance(0.3) || !d.roam.length) {
      d.tx = d.hx;
      d.ty = d.hy;
    } else {
      const j = d.roam[c.rng.int(0, d.roam.length - 1)];
      d.tx = j % L.W;
      d.ty = Math.floor(j / L.W);
    }
    d.rest = home ? c.rng.range(3, 8) : c.rng.range(0.3, 1.5);
    return;
  }
  const sx = Math.sign(d.tx - d.x);
  const sy = Math.sign(d.ty - d.y);
  const tries: Array<[number, number]> = Math.abs(d.tx - d.x) >= Math.abs(d.ty - d.y) ? [[sx, 0], [0, sy]] : [[0, sy], [sx, 0]];
  for (const [dx, dy] of tries) {
    if (!dx && !dy) continue;
    if (fits(d.x + dx, d.y + dy)) {
      d.head = HEADS.findIndex(([hx, hy]) => hx === dx && hy === dy);
      draw(d.x + dx, d.y + dy);
      return;
    }
  }
  // Blocked: give up on that and go somewhere else.
  d.tx = d.x;
  d.ty = d.y;
}

const LOOSE = new Uint8Array(256);
for (const m of [M.SAND, M.GRAVEL, M.ASH, M.SNOW, M.GOLD_DUST, M.GUNPOWDER]) LOOSE[m] = 1;
const isLoose = (m: number) => LOOSE[m] === 1;

// ── the station ──────────────────────────────────────────────────────────
const BUILD: BuildStyle = { mats: [M.METAL, M.TILE, M.SCREEN, M.PLASTIC, M.LED_AMBER], shape: 'machine' };

export const station: Biome = {
  id: 'station',
  name: 'Orbital Station',
  tagline: 'A cosy deck in orbit, a planet turning past the glass',
  palette: PALETTE,
  backdrop: hex('#03050b'),
  sky: 'stars',
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  costume: 'astronaut',
  finale: { colors: [[160, 230, 255], [240, 250, 255], [255, 210, 140]], glow: true, gravity: 2 }, // sparks drifting in low gravity, gone where it lands
  build: BUILD,
  pois: (L) => plan(L).floor.pois.slice(),
};

export default station;
