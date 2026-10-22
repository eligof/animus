import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import type { Site } from '../layout.ts';
import { keepClear, openSites, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import type { PropMats, Strata } from '../props.ts';
import { altar, entrance, fillStrata, hash3, isSolid, makeProps, noise2, onWall, pit, puff, tone, veins, wx, wy } from '../props.ts';
import type { Biome, Ctx, Grade, Layout, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// The Vault: an old high-tech facility sunk into the rock, after Noita's
// Holvi and the Hiisi base. Riveted steel plate and patched brickwork over
// grey stone, pipes along the walls, acid glowing behind glass and in a
// steel-lined pit, status lights blinking in the gloom.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#060a0a'),
  wall: hex('#121a1b'),
  wall2: hex('#162021'),
  floor: hex('#1c2627'),
  floor2: hex('#172021'),
  text: hex('#d6ebe6'),
  dim: hex('#6d8783'),
  accent: hex('#8cf542'),
  accent2: hex('#3fe0d0'),
  panel: hex('#0a1011'),
  panelText: hex('#d6ebe6'),
  border: hex('#3a5250'),
  bubble: hex('#e4f4f0'),
  bubbleText: hex('#0b1413'),
  good: hex('#7fe35a'),
  warn: hex('#f0c44a'),
  bad: hex('#ff5a4a'),
};

const GRADE: Grade = { ambient: hex('#1e2a2a'), illum: 1, bloom: 0.7, vignette: 0.35 };

// Cool stone and steel. FUNGUS is recast as the mint glow of lamp tubes
// and screens, GOLD_ORE as hazard paint (and gold), OBSIDIAN as gunmetal.
const COLORS: Partial<Record<number, string>> = {
  [M.ROCK]: '#4c5553',
  [M.ROCK_DARK]: '#2f3635',
  [M.BRICK]: '#56625e',
  [M.OBSIDIAN]: '#1c2427',
  [M.CLOTH]: '#3d6660',
  [M.CRYSTAL]: '#a6e2ff',
  [M.FUNGUS]: '#b4ffe4',
  [M.GOLD_ORE]: '#e3b833',
};

const LAMP: RGB = hex('#a6fff2');
const ACID_GLOW: RGB = hex('#72ff4c');
const SCREEN: RGB = hex('#7dffd2');
const BEACON: RGB = hex('#ffb347');
const STATUS: Partial<Record<number, RGB>> = { [M.CRYSTAL]: hex('#86b8ff'), [M.FUNGUS]: hex('#72ffc4') };
const DARK = M.OBSIDIAN; // an unlit lamp or screen pixel, seams, shadow

// What the props are made of here: steel frames and fittings, brick
// plinths, a crystal orb, and acid in the cauldron (the pot is all steel).
export const VAULT_MATS: PropMats = {
  frame: M.METAL,
  metal: M.METAL,
  cloth: M.CLOTH,
  stone: M.BRICK,
  stone2: M.OBSIDIAN,
  glow: M.CRYSTAL,
  liquid: M.ACID,
  quench: M.WATER,
  candle: M.METAL, // the console's lamp stalks
  ore: M.GOLD_ORE,
  seam: M.OBSIDIAN,
  rubble: M.GRAVEL,
  fuel: M.COAL,
  trim: M.CRYSTAL,
  bone: M.BONE,
  books: [M.CLOTH, M.CLOTH, M.METAL, M.OBSIDIAN, M.BONE, M.BRICK, M.CANDLE],
  rune: hex('#8ff8e8'),
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
const TUBE_H = 13; // glass of the specimen tubes

const N6: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// ── fixtures ─────────────────────────────────────────────────────────────
// What weather() animates, recorded by generate() per world.
type Lamp = { x: number; y: number; z: number; cells: number[]; broken: boolean };
type Blinker = { x: number; y: number; z: number; on: number; period: number; phase: number; duty: number; lx: number; ly: number; glow: boolean };
type Vent = { x: number; y: number; z: number; period: number; phase: number; burst: number };
type Fixtures = {
  lamps: Lamp[];
  blinkers: Blinker[];
  vents: Vent[];
  tanks: number[]; // acid voxels behind glass
  pool: Site | null;
  grates: Array<[number, number, number]>; // open cells between channel bars
  leak: [number, number, number] | null;
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
      for (const [a, h] of screen(s)) sput(v, s, a, 1, h, rng.chance(0.4) ? M.FUNGUS : DARK, 6);
      for (let a = mid - 2; a < mid + 2; a++) sput(v, s, a, 3, SLAB + 1, M.METAL, a & 1 ? 6 : 4); // keyboard
      for (const [a, b] of stalks(s)) {
        for (let h = SLAB + 1; h < SLAB + 4; h++) sput(v, s, a, b, h, M.METAL, 4);
        sput(v, s, a, b, SLAB + 4, M.CRYSTAL, 7);
      }
    },
    tick(c, s, active) {
      const v = c.v;
      if (c.rng.chance(c.dt * (active ? 30 : 3))) {
        const [a, h] = c.rng.pick(screen(s));
        const was = sget(v, s, a, 1, h);
        if (was === M.FUNGUS || was === DARK) sput(v, s, a, 1, h, c.rng.chance(active ? 0.55 : 0.3) ? M.FUNGUS : DARK, 6);
      }
      const mid = s.len / 2;
      c.light({ x: wx(s, mid, 2), y: wy(s, mid, 2), z: s.z0 + SLAB + 3.5, color: SCREEN, radius: active ? 18 : 12, intensity: active ? 0.5 + 0.1 * Math.sin(c.t * 9) : 0.28 });
      stalks(s).forEach(([a, b], k) => {
        const on = active ? (Math.floor(c.t * 3) + k) % 2 === 0 : (c.t * 0.5 + k * 0.7) % 2 < 1.6;
        lamp(v, wx(s, a, b), wy(s, a, b), s.z0 + SLAB + 4, on, M.CRYSTAL);
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
      v.put(x, y, z, M.CRYSTAL, 7);
      v.put(x, y, z + 1, m.metal, 6);
      for (const a of [0, OPEN + 1]) {
        for (let h = 0; h < TALL; h++) if (sget(v, s, a, 0, h) === m.frame) sput(v, s, a, 0, h, (h >> 1) & 1 ? M.GOLD_ORE : DARK, 4);
      }
      for (let h = TALL - 5; h < TALL; h++) {
        for (let a = 1; a <= OPEN; a++) {
          if (sget(v, s, a, -2, h) !== M.AIR) continue;
          const edge = h === TALL - 5;
          sput(v, s, a, -2, h, edge ? ((a >> 1) & 1 ? M.GOLD_ORE : DARK) : M.METAL, edge ? 4 : 2 + (h & 1));
        }
      }
    },
    tick(c, s, active) {
      const [x, y, z] = beaconAt(s);
      const on = !active || Math.floor(c.t * 4) % 2 === 0;
      lamp(c.v, x, y, z, on, M.CRYSTAL);
      if (on && c.v.get(x, y, z) === M.CRYSTAL) {
        c.light({ x: x + 0.5, y: y + 0.5, z: z + 0.5, color: active ? BEACON : STATUS[M.CRYSTAL]!, radius: active ? 20 : 12, intensity: active ? 0.8 : 0.35 });
      }
    },
  };
}

const PROPS: Record<SlotKind, Prop> = { ...makeProps(VAULT_MATS), think: controlDesk(VAULT_MATS), entrance: blastDoor(VAULT_MATS) };

// ── generate ─────────────────────────────────────────────────────────────
// Heights above the floor: the room's, the steel pipe run's (2 tall) and
// the glass acid conduit's near the top (3 tall).
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
  const keep = keepClear(L);
  const fx: Fixtures = { lamps: [], blinkers: [], vents: [], tanks: [], pool: null, grates: [], leak: null };

  // The acid pit, out on the open floor.
  const pr = clamp(Math.round(W * 0.07), 4, 9);
  fx.pool = openSites(L, rng, [[pr, Math.round(pr * 0.7)]])[0] ?? null;

  // Stone: the wall slabs to H (a voxel off the top here and there), the
  // floor slab flat, crystal glinting in the cut faces.
  const seed = rng.int(0, 0x3fffffff);
  const top = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) top[x + W * y] = x < T || y < T ? H - (noise2(seed, x * 0.3, y * 0.3) > 0.8 ? 1 : 0) : floor;
  }
  fillStrata(v, L, rng, STRATA, top);
  veins(v, L, rng, M.CRYSTAL, Math.round((W * D) / 2400), (m) => m === M.ROCK || m === M.ROCK_DARK, [3, 7]);

  deck(v, L, seed);
  const breach = breachOf(L, seed);
  for (const wall of SIDES) clad(v, L, P, wall, seed, breach, fx);
  if (fx.pool) {
    acidPit(v, L, fx.pool, keep);
    channels(v, L, fx.pool, keep, fx);
    line(v, T, T, 0, W - 1, D - 1, floor);
  }

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  for (const wall of SIDES) {
    steelRun(v, L, P, wall, seed, fx);
    gapFixtures(v, L, P, wall, rng, fx);
    lamps(v, L, P, wall, fx);
  }
  conduit(v, L, P, seed, fx);
  if (fx.lamps.length) fx.lamps[rng.int(0, fx.lamps.length - 1)].broken = true;
  fx.leak = leak(v, L, P, rng);
  crates(v, L, keep);
  litter(v, L, rng, keep, fx.pool);
  FIXTURES.set(v, fx);
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// The floor: a grated gutter along the foot of both walls, then steel
// plates with dark seams and corner rivets (some tread plate), worn
// through to the stone here and there, over a dark subfloor.
function deck(v: Voxels, L: Layout, seed: number): void {
  const { W, D, T, floor } = L;
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      v.put(x, y, floor - 2, DARK, 1);
      const gx = x - T;
      const gy = y - T;
      if (gx < 2 || gy < 2) {
        const bar = (gx < 2 && gy < 2) || (gx < 2 ? (y & 1) === 0 : (x & 1) === 0);
        v.put(x, y, floor - 1, bar ? M.METAL : M.AIR, 6);
        continue;
      }
      const ix = (gx - 2) % TILE;
      const iy = (gy - 2) % TILE;
      const r = hash3(seed, Math.floor((gx - 2) / TILE), Math.floor((gy - 2) / TILE), 11);
      let m: number = M.METAL;
      let s = 1 + Math.floor(r * 4);
      if (noise2(seed + 21, x * 0.12, y * 0.12) < 0.14) {
        m = M.ROCK;
        s = Math.floor(hash3(seed, x, y, 12) * 8);
      } else if (ix === 0 || iy === 0) {
        m = DARK;
        s = 3;
      } else if ((ix === 1 || ix === TILE - 1) && (iy === 1 || iy === TILE - 1)) {
        s = 7;
      } else if (r > 0.7 && (x & 1) === 0 && (y & 1) === 0) {
        s = Math.min(7, s + 3); // tread plate
      } else if (hash3(seed, x, y, 13) < 0.3) {
        s++;
      }
      v.put(x, y, floor - 1, m, s);
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
// conduit, a course of brick. Each panel band is split into rows about PH
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

type Panel = 'plate' | 'vent' | 'tank' | 'window';

// Cladding on a wall's inner face. Panels are riveted steel with patches of
// brickwork and of bare stone; whole panels clear of the props may instead
// be louvred vents, dark windows onto blinking machinery, or glass tanks of
// acid. Steel ribs stand between pairs of upper panels.
function clad(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number, open: (wall: Side, a: number, h: number) => boolean, fx: Fixtures): void {
  const { T, floor } = L;
  const end = alongEnd(L, wall);
  const k = wall === 'left' ? 1 : 2;
  const rows = profile(P);
  const spans = L.slots.filter((s) => s.wall === wall).map((s) => [along(s) - 4, along(s) + s.len + 4] as const);
  const behind = (a0: number, a1: number) => spans.some(([s0, s1]) => a0 < s1 && a1 > s0);
  const tanks: Array<[number, number, number]> = [];
  const at = (a: number, o: number, h: number, m: number, shade: number) => {
    const [x, y] = onWall(L, wall, a, o);
    const z = floor + h;
    if (isSolid(v.get(x, y, z))) v.put(x, y, z, m, shade);
  };
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
      const whole = a0 + PW < end && tall >= 5 && (upper || !behind(a0, a0 + PW + 1)) && !touches(open, wall, a0, R.r0, R.r1);
      const kind = whole ? panelKind(hash3(seed, pa, R.k, k * 2 + (upper ? 1 : 0)), upper) : 'plate';
      if (kind === 'tank' && ia === 0 && ih === 0) tanks.push([a0, R.r0, R.r1]);
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
          const on = r < 0.08 ? M.CRYSTAL : M.FUNGUS;
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
  for (const [a0, r0, r1] of tanks) tank(v, L, wall, a0, r0, r1, fx);
  // Ribs between pairs of upper panels, from the steel run to the conduit.
  for (let a = T + PW; a < end - 1; a += 2 * PW) {
    for (let h = P.low + 2; h < P.hi; h++) {
      const [x, y] = onWall(L, wall, a, 0);
      if (v.get(x, y, floor + h) === M.AIR) v.put(x, y, floor + h, M.METAL, h === P.hi - 1 ? 6 : 4);
    }
  }
}

// What a whole panel clear of the props is.
function panelKind(r: number, upper: boolean): Panel {
  if (upper) return r < 0.2 ? 'tank' : r < 0.32 ? 'vent' : r < 0.52 ? 'window' : 'plate';
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

// A tank of acid set into the wall behind a glass pane: steel all round
// the acid but for the pane, so it has nothing it can eat.
function tank(v: Voxels, L: Layout, wall: Side, a0: number, r0: number, r1: number, fx: Fixtures): void {
  for (let a = a0; a <= a0 + PW; a++) {
    for (let h = r0; h <= r1; h++) {
      const inner = a > a0 && a < a0 + PW && h > r0 && h < r1;
      for (let o = -4; o <= -1; o++) {
        const [x, y] = onWall(L, wall, a, o);
        const z = L.floor + h;
        if (inner && (o === -2 || o === -3)) {
          v.put(x, y, z, M.ACID);
          fx.tanks.push(v.idx(x, y, z));
        } else if (inner && o === -1) {
          v.put(x, y, z, M.GLASS, 5);
        } else {
          v.put(x, y, z, M.METAL, o === -1 ? 5 : 1);
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
        v.put(x, y, z, (x >> 1) & 1 ? M.GOLD_ORE : DARK, 4);
      } else if (e <= 2.4 && !keep[x + L.W * y]) {
        v.put(x, y, z, M.METAL, 6);
        v.put(x, y, z + 1, M.METAL, 5);
      }
    }
  }
}

// Grated channels of acid running from the pit out to the front cuts, one
// along x and one along y, each over open floor only: acid three wide just
// under the bars, steel walls, a steel end at the cut, guide lights along
// the rims. Records the gaps between the bars, where it fumes.
function channels(v: Voxels, L: Layout, s: Site, keep: Uint8Array, fx: Fixtures): void {
  const z = L.floor - 1;
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
        if (keep[x + L.W * y]) ok = false;
      }
      if (!ok) break;
      last = d;
    }
    if (c0 + last + 1 < end - 1 || last - r < 4) continue; // blocked short of the cut
    for (let d = from; c0 + d < end; d++) {
      const cut = c0 + d === end - 1;
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
        if (cut || rim) {
          const stud = rim && !cut && d % 6 === 0;
          v.put(x, y, z, stud ? M.FUNGUS : M.METAL, stud ? 7 : 5);
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

// The glass conduit along the top of both walls: 3 x 3 glass round a core
// of acid, capped in steel at the front cuts and collared along the way.
// Shells first, then cores, so the two cores meet in the corner.
function conduit(v: Voxels, L: Layout, P: Plan, seed: number, fx: Fixtures): void {
  const z0 = L.floor + P.hi;
  for (const wall of SIDES) {
    const end = alongEnd(L, wall);
    for (let a = L.T; a < end; a++) {
      for (let o = 0; o < 3; o++) {
        for (let dz = 0; dz < 3; dz++) {
          const [x, y] = onWall(L, wall, a, o);
          v.put(x, y, z0 + dz, a === end - 1 ? M.METAL : M.GLASS, a === end - 1 ? 4 : 5);
        }
      }
    }
  }
  for (const wall of SIDES) {
    const end = alongEnd(L, wall);
    for (let a = L.T + 1; a < end - 1; a++) {
      const [x, y] = onWall(L, wall, a, 1);
      v.put(x, y, z0 + 1, M.ACID);
      fx.tanks.push(v.idx(x, y, z0 + 1));
    }
    const off = L.T + 4 + Math.floor(hash3(seed, 2, wall === 'left' ? 1 : 2, 46) * FLANGE);
    for (let a = off; a < end - 2; a += 2 * FLANGE) {
      for (let o = 0; o < 3; o++) {
        for (let dz = 0; dz < 3; dz++) {
          if (o === 1 && dz === 1) continue;
          const [x, y] = onWall(L, wall, a, o);
          v.put(x, y, z0 + dz, M.METAL, dz === 2 ? 6 : 4);
        }
      }
    }
  }
}

// Something in every gap between props along a wall: a glass tube of
// acid, a riser with a valve wheel, or a box of status lamps.
function gapFixtures(v: Voxels, L: Layout, P: Plan, wall: Side, rng: Rng, fx: Fixtures): void {
  const end = alongEnd(L, wall);
  let n = wall === 'left' ? 1 : 0;
  for (const [g0, g1] of wallGaps(L, wall)) {
    if (g0 === L.T) continue; // the back corner keeps the crates
    const a0 = g0 + 1;
    const w = g1 - 1 - a0;
    if (w < 2 || (g1 === end && w < 3)) continue;
    const kind = w >= 4 ? n++ % 3 : 1;
    if (kind === 0) tube(v, L, wall, a0, w, P.low);
    else if (kind === 1) riser(v, L, wall, a0, w, P.low);
    else statusBox(v, L, wall, a0, w, rng, fx);
  }
}

// A glass specimen tube of acid against the wall, fed from the pipe above.
function tube(v: Voxels, L: Layout, wall: Side, a0: number, w: number, ph: number): void {
  const S = w >= 6 ? 4 : 3;
  const ta = a0 + Math.floor((w - S) / 2);
  for (let o = 0; o < S; o++) {
    for (let i = 0; i < S; i++) {
      const [x, y] = onWall(L, wall, ta + i, o);
      const inner = o > 0 && o < S - 1 && i > 0 && i < S - 1;
      for (let h = 0; h < TUBE_H + 4; h++) {
        const z = L.floor + h;
        if (h < 2) v.put(x, y, z, M.METAL, h ? 5 : 2);
        else if (h < TUBE_H + 2) v.put(x, y, z, inner ? M.ACID : M.GLASS, 5);
        else v.put(x, y, z, M.METAL, h === TUBE_H + 3 ? 6 : 3);
      }
    }
  }
  const [fx, fy] = onWall(L, wall, ta + (S >> 1), 1);
  for (let h = TUBE_H + 4; h < ph; h++) v.put(fx, fy, L.floor + h, M.METAL, 4);
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
      const on = rng.chance(0.5) ? M.CRYSTAL : M.FUNGUS;
      v.put(x, y, L.floor + h, on, 7);
      fx.blinkers.push({ x, y, z: L.floor + h, on, period: rng.range(0.5, 2.5), phase: rng.range(0, 3), duty: rng.range(0.3, 0.8), lx: lx + 0.5, ly: ly + 0.5, glow: lit++ < 2 });
    }
  }
  const [cx, cy] = onWall(L, wall, p + (bw >> 1), 0);
  for (let h = 0; h < 8; h++) v.put(cx, cy, L.floor + h, DARK, 4);
}

// Lamp tubes hung under the steel run, over the props.
function lamps(v: Voxels, L: Layout, P: Plan, wall: Side, fx: Fixtures): void {
  const z = L.floor + P.low - 1;
  const sites = L.slots.filter((s) => s.wall === wall && s.kind !== 'entrance').map((s) => along(s) + (s.len >> 1)).sort((p, q) => p - q);
  let last = -Infinity;
  for (const c of sites) {
    if (c - last < LAMP_GAP) continue;
    last = c;
    const cells: number[] = [];
    for (let i = -3; i <= 3; i++) {
      const [x, y] = onWall(L, wall, c + i, 1);
      const glass = Math.abs(i) < 3;
      v.put(x, y, z, glass ? M.FUNGUS : M.METAL, glass ? 7 : 5);
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
  const box = (x0: number, y0: number, z0: number, n: number) => {
    for (let z = z0; z < z0 + n; z++) {
      for (let y = y0; y < y0 + n; y++) {
        for (let x = x0; x < x0 + n; x++) {
          const edges = +(x === x0 || x === x0 + n - 1) + +(y === y0 || y === y0 + n - 1) + +(z === z0 || z === z0 + n - 1);
          v.put(x, y, z, edges >= 2 ? M.METAL : DARK, edges >= 2 ? 6 : 3);
        }
      }
    }
  };
  if (free(T, T, 4, 4)) {
    box(T, T, floor, 4);
    box(T, T, floor + 4, 3);
  }
  if (free(T, T + 4, 4, 4)) box(T, T + 4, floor, 4);
  if (free(T + 4, T, 3, 3)) {
    // the drum, banded in glowing green
    for (let z = floor; z < floor + 5; z++) {
      for (let y = T; y < T + 3; y++) {
        for (let x = T + 4; x < T + 7; x++) {
          if ((x === T + 4 || x === T + 6) && (y === T || y === T + 2)) continue;
          v.put(x, y, z, z === floor + 2 ? M.FUNGUS : M.METAL, z === floor + 4 ? 6 : 2);
        }
      }
    }
  }
}

// Loose stuff on the open floor: grit, and the odd scrap of steel.
function litter(v: Voxels, L: Layout, rng: Rng, keep: Uint8Array, pool: Site | null): void {
  const { W, D, T, floor } = L;
  const open = (x: number, y: number) => {
    if (x < T + 2 || y < T + 2 || x >= W || y >= D || keep[x + W * y]) return false;
    if (pool && ((x - pool.x) / (pool.rx + 4)) ** 2 + ((y - pool.y) / (pool.ry + 4)) ** 2 <= 1) return false;
    return v.get(x, y, floor - 1) !== M.AIR && v.get(x, y, floor) === M.AIR;
  };
  for (let k = Math.round((W * D) / 900); k > 0; k--) {
    const x = rng.int(T + 1, W - 2);
    const y = rng.int(T + 1, D - 2);
    if (!open(x, y)) continue;
    v.put(x, y, floor, rng.chance(0.7) ? M.GRAVEL : M.METAL, rng.int(0, 7));
    if (rng.chance(0.4) && open(x + 1, y)) v.put(x + 1, y, floor, M.GRAVEL, rng.int(0, 7));
  }
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const fx = FIXTURES.get(c.v);
  if (!fx) return;
  const v = c.v;

  // Lamp tubes hum; the broken one stutters every few seconds.
  for (const l of fx.lamps) {
    const m = v.mat[l.cells[2]];
    if (m !== M.FUNGUS && m !== DARK) continue;
    const on = !l.broken || (c.t + l.x) % 7 > 1.3 || Math.sin(c.t * 41) * Math.sin(c.t * 17 + l.y) > 0;
    for (const i of l.cells) if (v.mat[i] === (on ? DARK : M.FUNGUS)) v.set(i, on ? M.FUNGUS : DARK, on ? 7 : 1);
    if (on) c.light({ x: l.x, y: l.y, z: l.z, color: LAMP, radius: 28, intensity: 0.8 + 0.03 * Math.sin(c.t * 50 + l.x) });
  }

  // Status lamps blink, each to its own beat.
  for (const b of fx.blinkers) {
    const on = (c.t + b.phase) % b.period < b.period * b.duty;
    lamp(v, b.x, b.y, b.z, on, b.on);
    if (on && b.glow && v.get(b.x, b.y, b.z) === b.on) c.light({ x: b.lx, y: b.ly, z: b.z + 0.5, color: STATUS[b.on]!, radius: 8, intensity: 0.4 });
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

  // Acid shimmers behind the glass.
  if (fx.tanks.length && c.rng.chance(c.dt * 12)) {
    const i = fx.tanks[c.rng.int(0, fx.tanks.length - 1)];
    if (v.mat[i] === M.ACID) v.set(i, M.ACID, c.rng.int(3, 7));
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
  tagline: 'Riveted steel, humming pipes and acid behind glass',
  palette: PALETTE,
  backdrop: hex('#030606'),
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
};

export default vault;
