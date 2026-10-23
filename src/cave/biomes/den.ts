import type { RGB } from '../../term/color.ts';
import { hex } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import { buildSites, hub, keepClear, slotsOn, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import { beat, flicker, hash3, noise2, onWall, puff, wallOf, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// Hacker's Den: a basement hideout lit by CRTs. Cinder-block walls under a
// band of dark panels where green glyphs rain, cable trays and pipes, a
// server rack humming in the corner, a lounge with a TV playing pong, a lava
// lamp, a mini fridge, an arcade, a workbench and a bed for the cat.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#020403'),
  wall: hex('#0a110c'),
  wall2: hex('#0c140e'),
  floor: hex('#1a1d1b'),
  floor2: hex('#161917'),
  text: hex('#b8ffc8'),
  dim: hex('#3f7a52'),
  accent: hex('#39ff6e'),
  accent2: hex('#ffb000'),
  panel: hex('#06100a'),
  panelText: hex('#b8ffc8'),
  border: hex('#1f8f45'),
  bubble: hex('#d4ffdc'),
  bubbleText: hex('#04180a'),
  good: hex('#39ff6e'),
  warn: hex('#ffb000'),
  bad: hex('#ff2a8a'),
};

const GRADE: Grade = { ambient: hex('#4e5c54'), illum: 1.1, bloom: 0.75, vignette: 0.2 };

// ROCK is the polished concrete floor, ROCK_DARK mortar and the slab under
// it, OBSIDIAN dark glass (screens off, panels, cables), FUNGUS dim
// phosphor, DIRT red (string, binders, pepperoni), BRICK cork, CANDLE
// crust, GOLD_ORE cheese and sticky notes.
const COLORS: Partial<Record<number, string>> = {
  [M.CONCRETE]: '#68706b',
  [M.ROCK]: '#6e7673',
  [M.ROCK_DARK]: '#30362f',
  [M.OBSIDIAN]: '#0a120d',
  [M.METAL]: '#6a736f',
  [M.PLASTIC]: '#8f8a72',
  [M.CLOTH]: '#7a2a6a',
  [M.CARPET]: '#1f3d2b',
  [M.WOOD]: '#6b5139',
  [M.BRICK]: '#8a6440',
  [M.DIRT]: '#b0302c',
  [M.CANDLE]: '#d49a4a',
  [M.GOLD_ORE]: '#f0c24e',
  [M.FUNGUS]: '#2a9a4c',
  [M.COAL]: '#1b1b1e',
};

const GREEN: RGB = hex('#5cff8c');
const AMBER: RGB = hex('#ffb347');
const WARM: RGB = hex('#ffd08a');
const BULB: RGB = hex('#ffcf8a');
const PINK: RGB = hex('#ff4fb0');
const CYAN: RGB = hex('#7fe8ff');
const RED: RGB = hex('#ff4040');
const PURPLE: RGB = hex('#d070ff');
const COLD: RGB = hex('#d8f0ff');
const GLYPH: RGB = hex('#8dff9c');
const FIZZ: RGB = hex('#cfe8d8');

type Side = 'left' | 'right';
const SIDES: readonly Side[] = ['left', 'right'];
const TAU = Math.PI * 2;
const PW = 12; // pitch of the dark wall panels, bezel included

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const alongEnd = (L: Layout, wall: Side) => (wall === 'left' ? L.D : L.W);

// Materials the animations repaint: screens, lamps, LEDs and their dark.
const PIXEL = new Uint8Array(256);
for (const m of [M.OBSIDIAN, M.NEON_GREEN, M.FUNGUS, M.SCREEN, M.LED_RED, M.LED_AMBER, M.NEON_PINK, M.LAMP]) PIXEL[m] = 1;

function px(v: Voxels, i: number, m: number, shade: number): void {
  if (PIXEL[v.mat[i]]) v.set(i, m, shade);
}

// 3 x 5 glyphs, rows top to bottom, 3 bits each.
const FONT: Record<string, readonly number[]> = {
  H: [5, 5, 7, 5, 5],
  A: [2, 5, 7, 5, 5],
  C: [7, 4, 4, 4, 7],
  K: [5, 5, 6, 5, 5],
  _: [0, 0, 0, 0, 7],
};
const DIGITS: ReadonlyArray<readonly number[]> = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];
const lit = (rows: readonly number[], col: number, row: number) => ((rows[row] >> (2 - col)) & 1) === 1;

// A triangle wave 0..n..0 over t.
function tri(t: number, n: number): number {
  const p = ((t % (2 * n)) + 2 * n) % (2 * n);
  return p < n ? p : 2 * n - p;
}

// Column i (0 = screen left) of a run n wide centred on `mid` along a wall:
// the right wall runs left to right on screen, the left wall right to left.
function textAlong(wall: Side, mid: number, n: number, i: number): number {
  const start = Math.round(mid - n / 2);
  return wall === 'right' ? start + i : start + n - 1 - i;
}

// ── fixtures ─────────────────────────────────────────────────────────────
// What weather() animates, recorded by generate() per world.
type Rain = { i0: number; n: number; speed: number; tail: number; cycle: number; phase: number; k: number };
type Blinker = { i: number; on: number; period: number; phase: number; duty: number };
type Fixtures = {
  rain: Rain[];
  sign: { cells: Array<[number, number]>; cursor: number[]; light: [number, number, number] } | null;
  clock: { cells: number[]; light: [number, number, number] } | null;
  blinkers: Blinker[];
  leak: [number, number, number] | null;
  tv: { cells: number[]; light: [number, number, number] } | null;
  lava: { cells: Array<[number, number, number, number]>; x: number; y: number; z: number } | null;
  fridge: { shut: number[]; open: number[]; handleShut: number[]; handleOpen: number[]; light: [number, number, number] } | null;
  brew: [number, number, number] | null;
  oven: number | null;
  lamps: Lamp[];
  arcade: { screens: number[][]; lights: Array<[number, number, number]> } | null;
  bench: { scope: number[]; tip: [number, number, number] } | null;
  junk: { screen: number[]; light: [number, number, number] } | null;
  screens: Array<{ cells: number[]; ink: number }>; // flicker at random
  pools: Pool[]; // steady light from the zones
};
type Pool = { x: number; y: number; z: number; color: RGB; radius: number; intensity: number };
// A lamp voxel and the light it casts; a broken one stutters.
type Lamp = { i: number; x: number; y: number; z: number; color: RGB; radius: number; intensity: number; broken: boolean };

const FIXTURES = new WeakMap<Voxels, Fixtures>();
// The conspiracy board's strings, pin to pin, per world.
const STRINGS = new WeakMap<Voxels, number[][]>();

// ── slot frame ───────────────────────────────────────────────────────────
// a along the wall, b out into the room (negative digs into the slab), h up.
function put(v: Voxels, s: Slot, a: number, b: number, h: number, m: number, shade?: number): void {
  v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, m, shade);
}

function get(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.get(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

function at(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.idx(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

// Fills [a0, a1) x [b0, b1) x [h0, h1).
function fill(v: Voxels, s: Slot, a0: number, b0: number, h0: number, a1: number, b1: number, h1: number, m: number, shade?: number): void {
  for (let h = h0; h < h1; h++) for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) put(v, s, a, b, h, m, shade);
}

function shine(c: Ctx, s: Slot, a: number, b: number, h: number, color: RGB, radius: number, intensity: number): void {
  c.light({ x: wx(s, a, b), y: wy(s, a, b), z: s.z0 + h, color, radius, intensity });
}

// A beanbag slumped on the floor round (cx, cy), its seat facing (fx, fy):
// tall at the back, sat in at the front, so whoever sits rests two voxels up.
function beanbag(v: Voxels, cx: number, cy: number, z0: number, fx: number, fy: number, r: number, mat: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = (dx * dx + dy * dy) / (r * r);
      if (d2 > 1) continue;
      const back = clamp(0.35 - (dx * fx + dy * fy) / r, 0, 1);
      const top = Math.floor(1.6 + Math.sqrt(1 - d2) * (0.9 + 3.2 * back));
      for (let h = 0; h < top; h++) v.put(x, y, z0 + h, mat, h === top - 1 ? 6 : h === 0 ? 1 : 3 + ((x + y + h) & 1));
    }
  }
  const { x, y } = seatOf(cx, cy, fx, fy);
  for (const [sx, sy] of [[x, y], [x + fx, y + fy]]) {
    if (v.get(sx, sy, z0) !== mat) continue;
    v.put(sx, sy, z0 + 1, mat, 5);
    for (let h = 2; h < 6; h++) if (v.get(sx, sy, z0 + h) === mat) v.put(sx, sy, z0 + h, M.AIR);
  }
}

function seatOf(cx: number, cy: number, fx: number, fy: number): { x: number; y: number } {
  return { x: Math.floor(cx + fx * 1.4), y: Math.floor(cy + fy * 1.4) };
}

// ── props ────────────────────────────────────────────────────────────────

// write: a desk under a big beige CRT with an amber terminal and a cyan
// panel either side, keyboard, mouse and a mug of coffee. Typing lights
// the keys and scrolls the green terminal.
type Rect = { a0: number; a1: number; h0: number; h1: number; b: number };

function scroll(v: Voxels, s: Slot, R: Rect, rng: Rng, ink: number): void {
  for (let h = R.h1 - 1; h > R.h0; h--) {
    for (let a = R.a0; a < R.a1; a++) {
      const below = at(v, s, a, R.b, h - 1);
      px(v, at(v, s, a, R.b, h), v.mat[below], v.shade[below]);
    }
  }
  const len = rng.int(0, R.a1 - R.a0);
  for (let a = R.a0; a < R.a1; a++) {
    const on = a - R.a0 < len && rng.chance(0.8);
    px(v, at(v, s, a, R.b, R.h0), on ? ink : M.OBSIDIAN, on ? rng.int(4, 7) : 1);
  }
}

function sparkle(v: Voxels, s: Slot, R: Rect, rng: Rng, ink: number, p: number): void {
  const a = rng.int(R.a0, R.a1 - 1);
  const h = rng.int(R.h0, R.h1 - 1);
  const on = rng.chance(p);
  px(v, at(v, s, a, R.b, h), on ? ink : M.OBSIDIAN, on ? rng.int(4, 7) : 1);
}

function battlestation(): Prop {
  const DESK = 4;
  const TERM: Rect = { a0: 4, a1: 8, h0: 6, h1: 11, b: 4 };
  const AMBER_TERM: Rect = { a0: 0, a1: 3, h0: 7, h1: 9, b: 2 };
  const PANEL: Rect = { a0: 9, a1: 11, h0: 7, h1: 11, b: 1 };
  const KEYS = [3, 4, 5, 6, 7];
  return {
    name: 'battlestation',
    build(v, s, rng) {
      fill(v, s, 0, 0, DESK, 11, 6, DESK + 1, M.WOOD, 3);
      fill(v, s, 0, 5, DESK, 11, 6, DESK + 1, M.WOOD, 6);
      for (const [a, b] of [[0, 0], [10, 0], [0, 5], [10, 5]]) fill(v, s, a, b, 0, a + 1, b + 1, DESK, M.METAL, 2);
      // the tower under the desk, its drive light on the front
      fill(v, s, 7, 1, 0, 10, 5, DESK, M.PLASTIC, 2);
      for (let h = 0; h < DESK; h++) put(v, s, 8, 4, h, M.PLASTIC, h & 1 ? 1 : 4);
      put(v, s, 9, 4, 2, M.NEON_GREEN, 6);
      // the big CRT: a deep tube behind a bezel
      fill(v, s, 4, 0, 6, 8, 2, 11, M.PLASTIC, 2);
      fill(v, s, 3, 2, 5, 9, 5, 12, M.PLASTIC, 4);
      fill(v, s, 3, 4, 11, 9, 5, 12, M.PLASTIC, 6);
      for (let h = TERM.h0; h < TERM.h1; h++) {
        for (let a = TERM.a0; a < TERM.a1; a++) {
          const on = a - TERM.a0 < rng.int(0, 4) && rng.chance(0.7);
          put(v, s, a, TERM.b, h, on ? M.NEON_GREEN : M.OBSIDIAN, on ? 5 : 1);
        }
      }
      // the amber terminal on a stand, the cyan panel on an arm
      put(v, s, 1, 1, 5, M.METAL, 3);
      fill(v, s, 0, 0, 6, 3, 3, 10, M.PLASTIC, 3);
      for (let h = AMBER_TERM.h0; h < AMBER_TERM.h1; h++) for (let a = AMBER_TERM.a0; a < AMBER_TERM.a1; a++) put(v, s, a, AMBER_TERM.b, h, rng.chance(0.6) ? M.LED_AMBER : M.OBSIDIAN, 5);
      fill(v, s, 9, 0, 5, 11, 2, 6, M.METAL, 3);
      fill(v, s, 9, 0, 6, 11, 1, 12, M.METAL, 2);
      fill(v, s, 9, 1, 6, 11, 2, 12, M.METAL, 5);
      for (let h = PANEL.h0; h < PANEL.h1; h++) for (let a = PANEL.a0; a < PANEL.a1; a++) put(v, s, a, PANEL.b, h, rng.chance(0.5) ? M.SCREEN : M.OBSIDIAN, 4);
      // keyboard, mouse, and a mug of coffee (the mug all round it)
      for (const a of KEYS) put(v, s, a, 5, DESK + 1, M.PLASTIC, a & 1 ? 6 : 5);
      put(v, s, 9, 5, DESK + 1, M.PLASTIC, 6);
      fill(v, s, 0, 3, DESK + 1, 3, 6, DESK + 3, M.DIRT, 5);
      put(v, s, 1, 4, DESK + 2, M.COFFEE);
    },
    tick(c, s, active) {
      const v = c.v;
      const k = s.x0 * 7 + s.y0 * 13;
      if (beat(c, active ? 0.1 : 0.85, k * 0.01)) scroll(v, s, TERM, c.rng, M.NEON_GREEN);
      if (c.rng.chance(c.dt * (active ? 16 : 2))) sparkle(v, s, AMBER_TERM, c.rng, M.LED_AMBER, 0.6);
      if (c.rng.chance(c.dt * (active ? 12 : 1.5))) sparkle(v, s, PANEL, c.rng, M.SCREEN, 0.5);
      const step = Math.floor(c.t * 11);
      for (const a of KEYS) {
        const i = at(v, s, a, 5, DESK + 1);
        const m = v.mat[i];
        if (m !== M.PLASTIC && m !== M.NEON_GREEN) continue;
        const on = active && hash3(k, a, step, 5) < 0.3;
        v.set(i, on ? M.NEON_GREEN : M.PLASTIC, on ? 7 : a & 1 ? 6 : 5);
      }
      const led = at(v, s, 9, 4, 2);
      if (v.mat[led] === M.NEON_GREEN || v.mat[led] === M.OBSIDIAN) {
        const on = active ? hash3(k, step, 1, 6) < 0.5 : (c.t + k) % 4 < 3.6;
        v.set(led, on ? M.NEON_GREEN : M.OBSIDIAN, on ? 6 : 1);
      }
      if (c.rng.chance(c.dt * 0.4)) puff(c, wx(s, 1, 4), wy(s, 1, 4), s.z0 + DESK + 3, M.STEAM, 22);
      // the CRT hums; now and then it rolls a dim bar
      const roll = hash3(k, Math.floor(c.t * 5), 2, 7) < 0.05 ? 0.55 : 1;
      shine(c, s, 6, 8, 7, GREEN, active ? 24 : 19, (active ? 0.65 : 0.42) * roll * (0.97 + 0.03 * Math.sin(c.t * 50)));
      shine(c, s, 1.5, 4, 8, AMBER, 8, active ? 0.3 : 0.18);
      if (active) shine(c, s, 5.5, 7, DESK + 1.5, GREEN, 8, 0.3);
    },
  };
}

// read: steel shelving of binders and manuals, more stacked on the floor
// and a clip lamp over it all. Reading lifts green glyphs off the spines
// and turns the pages of the open manual.
function manuals(): Prop {
  const BOARDS = [0, 5, 10, 15];
  const COVERS = [M.DIRT, M.CARPET, M.PLASTIC, M.CLOTH, M.OBSIDIAN, M.PAPER, M.METAL, M.LEAF];
  const OPEN = 2; // the open manual lies on a stack this tall
  return {
    name: 'manual stacks',
    build(v, s, rng) {
      const L = s.len;
      for (const a of [0, L - 1]) fill(v, s, a, 0, 0, a + 1, 2, 17, M.METAL, 3);
      for (const h of BOARDS) fill(v, s, 0, 0, h, L, 2, h + 1, M.METAL, 5);
      for (let k = 0; k < BOARDS.length; k++) {
        const h0 = BOARDS[k] + 1;
        const room = k + 1 < BOARDS.length ? BOARDS[k + 1] - h0 : 2;
        for (let a = 1; a < L - 1; ) {
          const r = rng.next();
          if (r < 0.1) {
            a++;
          } else if ((r < 0.32 || room < 3) && a + 3 <= L - 1) {
            for (let i = rng.int(1, Math.min(3, room)) - 1; i >= 0; i--) fill(v, s, a, 0, h0 + i, a + 3, 2, h0 + i + 1, i & 1 ? M.PAPER : rng.pick(COVERS), rng.int(3, 6));
            a += 3;
          } else if (room >= 3) {
            const col = rng.pick(COVERS);
            const tall = Math.min(room, rng.int(3, 4));
            fill(v, s, a, 0, h0, a + 1, 2, h0 + tall, col, rng.int(2, 6));
            if (rng.chance(0.45)) put(v, s, a, 1, h0 + tall - 2, M.PAPER, 7); // label
            a++;
          } else {
            a++;
          }
        }
      }
      // stacks on the floor: covers and pages
      const stack = (a0: number, w: number, n: number) => {
        for (let i = 0; i < n; i++) fill(v, s, a0, 2, i, a0 + w, 4, i + 1, i & 1 ? M.PAPER : rng.pick(COVERS), i & 1 ? 6 : rng.int(2, 5));
      };
      stack(1, 3, 6);
      stack(5, 4, OPEN);
      fill(v, s, 5, 2, OPEN, 9, 4, OPEN + 1, M.PAPER, 7);
      put(v, s, 7, 2, OPEN, M.PAPER, 4); // the spine's crease
      stack(10, 3, 4);
      // the clip lamp over the top shelf
      fill(v, s, 11, 1, 17, 12, 2, 19, M.METAL, 4);
      put(v, s, 11, 2, 18, M.METAL, 5);
      put(v, s, 11, 3, 18, M.METAL, 6);
      put(v, s, 11, 3, 17, M.LAMP, 6);
    },
    tick(c, s, active) {
      const v = c.v;
      shine(c, s, 11.5, 5, 14, WARM, active ? 22 : 18, active ? 0.55 : 0.36);
      // the open manual's pages turn, one sheet at a time
      const p = active ? Math.floor(c.t * 4) % 6 : -1;
      for (let a = 5; a < 9; a++) {
        const i = at(v, s, a, 3, OPEN + 1);
        const m = v.mat[i];
        if (m !== M.AIR && m !== M.PAPER) continue;
        const want = p === a - 5 ? M.PAPER : M.AIR;
        if (m !== want) v.set(i, want, 7);
      }
      if (!active || !c.rng.chance(c.dt * 6)) return;
      const out = s.wall === 'right' ? [0, 1] : [1, 0];
      const sp = c.rng.range(0.5, 1.4);
      c.spawn({
        kind: 'rune',
        x: wx(s, c.rng.range(1, s.len - 1), 2.5),
        y: wy(s, c.rng.range(1, s.len - 1), 2.5),
        z: s.z0 + c.rng.range(1, 15),
        vx: out[0] * sp + c.rng.range(-0.3, 0.3),
        vy: out[1] * sp + c.rng.range(-0.3, 0.3),
        vz: c.rng.range(1, 2.4),
        life: c.rng.range(1, 2),
        color: GLYPH,
        glow: true,
        gravity: -0.5,
      });
    },
  };
}

// search: a radar scope over a console. The sweep goes round leaving a
// phosphor trail, blips light up as it passes; searching spins it faster
// and turns up more contacts.
function radar(): Prop {
  const CA = 5; // the centre cell, a and h
  const CH = 10;
  const R_SCREEN = 4.6;
  const R_BEZEL = 5.6;
  type Cell = { a: number; h: number; r: number; phi: number };
  const SCREEN_CELLS: Cell[] = [];
  for (let h = CH - 5; h <= CH + 5; h++) {
    for (let a = CA - 5; a <= CA + 5; a++) {
      const r = Math.hypot(a - CA, h - CH);
      if (r <= R_SCREEN) SCREEN_CELLS.push({ a, h, r, phi: Math.atan2(h - CH, a - CA) });
    }
  }
  const base = (q: Cell): [number, number] => {
    if (Math.abs(q.r - 2.5) < 0.5 || q.a === CA || q.h === CH) return [M.FUNGUS, 0];
    return [M.OBSIDIAN, 2];
  };
  return {
    name: 'radar scope',
    build(v, s) {
      fill(v, s, 0, 0, 0, 12, 3, 4, M.METAL, 2);
      fill(v, s, 0, 0, 4, 12, 4, 5, M.METAL, 5);
      for (let a = 1; a < 11; a++) put(v, s, a, 2, 2, a === 1 ? M.LED_AMBER : a === 3 ? M.NEON_GREEN : a >= 6 && a <= 9 ? M.OBSIDIAN : M.METAL, a < 4 ? 6 : 3);
      for (let a = 3; a < 9; a++) put(v, s, a, 3, 5, M.PLASTIC, a & 1 ? 6 : 5);
      fill(v, s, 0, 0, CH - 5, 11, 1, CH + 6, M.METAL, 2);
      for (let h = CH - 5; h <= CH + 5; h++) {
        for (let a = CA - 5; a <= CA + 5; a++) {
          const r = Math.hypot(a - CA, h - CH);
          if (r <= R_SCREEN) {
            const [m, sh] = base({ a, h, r, phi: 0 });
            put(v, s, a, 1, h, m, sh);
          } else if (r <= R_BEZEL) {
            put(v, s, a, 1, h, M.METAL, 6);
            put(v, s, a, 2, h, M.METAL, 5);
          } else {
            put(v, s, a, 1, h, M.METAL, 3);
          }
        }
      }
      // a signal meter beside the scope
      fill(v, s, 11, 0, CH - 5, 12, 2, CH + 3, M.METAL, 3);
      for (let h = CH - 4; h < CH + 2; h++) put(v, s, 11, 2, h, M.OBSIDIAN, 1);
    },
    tick(c, s, active) {
      const v = c.v;
      const k = s.x0 * 5 + s.y0 * 11;
      const w = active ? 4.2 : 1.6;
      const th = c.t * w + k;
      const rev = Math.floor(th / TAU);
      const n = active ? 4 : 2;
      const blips: Array<[number, number]> = [];
      for (let j = 0; j < n; j++) {
        const r = 1.6 + hash3(k, rev, j, 1) * 2.8;
        const phi = hash3(k, rev, j, 2) * TAU;
        blips.push([Math.round(CA + r * Math.cos(phi)), Math.round(CH + r * Math.sin(phi))]);
      }
      for (const q of SCREEN_CELLS) {
        const d = (((th - q.phi) % TAU) + TAU) % TAU;
        let m: number;
        let sh: number;
        if (q.r < 0.5 || d < 0.3) {
          m = M.NEON_GREEN;
          sh = 7;
        } else if (blips.some(([a, h]) => a === q.a && h === q.h) && d < 3.4) {
          m = M.LED_AMBER;
          sh = Math.max(0, 7 - Math.floor(d * 2));
          if (active && d < c.dt * w + 0.3 && c.rng.chance(0.5)) {
            c.spawn({ kind: 'glint', x: wx(s, q.a + 0.5, 2.5), y: wy(s, q.a + 0.5, 2.5), z: s.z0 + q.h + 0.5, vx: 0, vy: 0, vz: 0.4, life: 0.4, color: AMBER, glow: true, gravity: 0 });
          }
        } else if (d < 1.5) {
          m = M.FUNGUS;
          sh = Math.max(0, 7 - Math.floor(d * 4.5));
        } else {
          [m, sh] = base(q);
        }
        px(v, at(v, s, q.a, 1, q.h), m, sh);
      }
      const level = active ? 2 + Math.round(4 * Math.abs(Math.sin(c.t * 7) * Math.sin(c.t * 2.3))) : 1 + Math.round(Math.abs(Math.sin(c.t * 1.3)));
      for (let h = CH - 4; h < CH + 2; h++) {
        const on = h - (CH - 4) < level;
        px(v, at(v, s, 11, 2, h), on ? (h >= CH ? M.LED_AMBER : M.NEON_GREEN) : M.OBSIDIAN, on ? 6 : 1);
      }
      shine(c, s, CA + 0.5, 5, CH - 1, GREEN, active ? 20 : 16, active ? 0.5 : 0.32);
    },
  };
}

// run: two server racks of blinking units standing out on the floor, a
// cable bundle slung between their tops and a box fan blowing at them.
// Under load the lights race, the fan spins up and the racks blow off heat.
function serverRack(): Prop {
  const TALL = 16;
  const UNITS = (TALL - 2) >> 1;
  const RACKS = [0, 6];
  const FAN: [number, number] = [5, 2]; // the fan's hub, a and h, on b = 8
  const BLADES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
    [[0, 1], [0, -1]],
    [[1, 1], [-1, -1]],
    [[1, 0], [-1, 0]],
    [[1, -1], [-1, 1]],
  ];
  type Led = { a: number; h: number; on: number; period: number; phase: number; duty: number };
  const leds = (s: Slot): Led[] => {
    const k = s.x0 * 3 + s.y0 * 17;
    const out: Led[] = [];
    for (const a0 of RACKS) {
      for (let u = 0; u < UNITS; u++) {
        for (const da of [1, 2]) {
          const r = hash3(k, a0 + da, u, 1);
          out.push({ a: a0 + da, h: 1 + 2 * u, on: r < 0.08 ? M.LED_RED : r < 0.28 ? M.LED_AMBER : M.NEON_GREEN, period: 0.6 + hash3(k, a0 + da, u, 2) * 2.2, phase: hash3(k, a0 + da, u, 3) * 3, duty: 0.35 + hash3(k, a0 + da, u, 4) * 0.55 });
        }
      }
    }
    return out;
  };
  return {
    name: 'server rack',
    build(v, s) {
      for (const a0 of RACKS) {
        fill(v, s, a0, 0, 0, a0 + 5, 5, TALL, M.METAL, 1);
        for (let h = 0; h < TALL; h++) {
          for (let a = a0; a < a0 + 5; a++) {
            let m: number = M.METAL;
            let sh = 5;
            if (a === a0 || a === a0 + 4) sh = h % 4 === 1 ? 6 : 3;
            else if (h === 0 || h === TALL - 1) sh = 4;
            else if ((h - 1) & 1) {
              m = (h >> 1) % 3 === 0 ? M.PLASTIC : M.OBSIDIAN;
              sh = 3;
            } else if (a === a0 + 3) {
              sh = 6;
            } else {
              m = M.OBSIDIAN;
              sh = 1;
            }
            put(v, s, a, 4, h, m, sh);
          }
        }
        fill(v, s, a0 + 1, 1, TALL - 1, a0 + 4, 4, TALL, M.OBSIDIAN, 2); // exhaust grille
        // up on casters
        for (let b = 0; b < 5; b++) for (let a = a0; a < a0 + 5; a++) put(v, s, a, b, 0, (a === a0 || a === a0 + 4) && (b === 0 || b === 4) ? M.OBSIDIAN : M.AIR, 2);
      }
      // the cable bundle slung between the tops, sagging over the gap
      for (let b = 1; b < 4; b++) {
        put(v, s, 4, b, TALL, M.OBSIDIAN, 3);
        put(v, s, 5, b, TALL - 1, M.CARPET, 6);
        put(v, s, 6, b, TALL, M.OBSIDIAN, 3);
      }
      // the box fan, on its feet, facing the racks
      for (let h = 0; h <= 4; h++) {
        for (let a = 3; a <= 7; a++) {
          const rim = a === 3 || a === 7 || h === 0 || h === 4;
          put(v, s, a, 8, h, rim ? M.METAL : M.OBSIDIAN, rim ? 3 : 2);
        }
      }
      put(v, s, FAN[0], 8, FAN[1], M.METAL, 6);
      for (const a of [3, 7]) fill(v, s, a, 7, 0, a + 1, 10, 1, M.METAL, 2);
      // cables off the racks
      fill(v, s, 1, 5, 0, 3, 6, 1, M.OBSIDIAN, 3);
      fill(v, s, 2, 6, 0, 3, 11, 1, M.OBSIDIAN, 3);
      fill(v, s, 8, 5, 0, 10, 6, 1, M.CARPET, 6);
      fill(v, s, 9, 6, 0, 10, 10, 1, M.CARPET, 6);
    },
    tick(c, s, active) {
      const v = c.v;
      for (const l of leds(s)) {
        const period = active ? l.period * 0.22 : l.period;
        const on = (c.t + l.phase) % period < period * l.duty;
        px(v, at(v, s, l.a, 4, l.h), on ? l.on : M.OBSIDIAN, on ? 7 : 1);
      }
      // a red warning light on top flashes under load
      const warn = active && Math.floor(c.t * 3) % 2 === 0;
      px(v, at(v, s, 9, 4, TALL - 2), warn ? M.LED_RED : M.OBSIDIAN, warn ? 7 : 1);
      // the fan turns
      const turn = Math.floor(c.t * (active ? 16 : 5)) % 4;
      for (let da = -1; da <= 1; da++) {
        for (let dh = -1; dh <= 1; dh++) {
          if (!da && !dh) continue;
          const blade = BLADES[turn].some(([x, y]) => x === da && y === dh);
          const i = at(v, s, FAN[0] + da, 8, FAN[1] + dh);
          const m = v.mat[i];
          if (m === M.METAL || m === M.OBSIDIAN) v.set(i, blade ? M.METAL : M.OBSIDIAN, blade ? 7 : 2);
        }
      }
      for (const a0 of RACKS) {
        if (c.rng.chance(c.dt * (active ? 9 : 1.2))) puff(c, wx(s, a0 + c.rng.int(1, 3), 3), wy(s, a0 + c.rng.int(1, 3), 3), s.z0 + TALL, M.STEAM, c.rng.int(30, 60));
      }
      if (active) shine(c, s, 5.5, 7, 10, warn ? RED : AMBER, 16, 0.45 * flicker(c.t, 4));
      else shine(c, s, 5.5, 7, 8, GREEN, 16, 0.3);
    },
  };
}

// web: a white satellite dish on a mast braced by a tripod, tilted up and
// out, with a blinking beacon on its feed and the receiver at its foot.
// Browsing streams signal sparkles off it.
function dish(): Prop {
  const N: readonly [number, number, number] = [0, 0.62, 0.78];
  const C: readonly [number, number, number] = [4.5, 3.6, 9.6];
  const R = 4.2;
  const K = 0.085;
  const F = 1 / (4 * K);
  const focus: [number, number, number] = [C[0] + N[0] * F, C[1] + N[1] * F, C[2] + N[2] * F];
  const cell = (p: readonly number[]) => p.map(Math.floor) as [number, number, number];
  const beacon = cell([focus[0] + N[0], focus[1] + N[1], focus[2] + N[2]]);
  return {
    name: 'satellite dish',
    build(v, s) {
      fill(v, s, 2, 2, 0, 7, 7, 1, M.METAL, 2);
      for (const [a, b] of [[2, 2], [6, 2], [2, 6], [6, 6]]) put(v, s, a, b, 0, M.AIR);
      fill(v, s, 4, 3, 1, 5, 4, 9, M.METAL, 4);
      // the tripod: three legs splayed from the mast to feet on the floor
      for (const [fa, fb] of [[0, 0], [8, 0], [4, 8]]) {
        for (let i = 0; i <= 6; i++) {
          const t = i / 6;
          const [a, b, h] = cell([4.5 + (fa + 0.5 - 4.5) * t, 3.5 + (fb + 0.5 - 3.5) * t, 6 - 6 * t]);
          if (get(v, s, a, b, h) === M.AIR) put(v, s, a, b, h, M.METAL, i === 6 ? 2 : 3);
        }
      }
      for (let h = 3; h < 17; h++) {
        for (let b = 0; b < 9; b++) {
          for (let a = 0; a < 9; a++) {
            const d = [a + 0.5 - C[0], b + 0.5 - C[1], h + 0.5 - C[2]];
            const u = d[0] * N[0] + d[1] * N[1] + d[2] * N[2];
            const w2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] - u * u;
            if (w2 > R * R || Math.abs(u - K * w2) > 0.6) continue;
            put(v, s, a, b, h, M.TILE, w2 > (R - 0.9) ** 2 ? 3 : w2 < 2 ? 7 : 5);
          }
        }
      }
      // a strut from the rim's foot up to the feed
      const foot = [C[0], C[1] + R * 0.78 + N[1] * K * R * R, C[2] - R * 0.62 + N[2] * K * R * R];
      for (let i = 0; i <= 12; i++) {
        const t = i / 12;
        const [a, b, h] = cell([foot[0] + (focus[0] - foot[0]) * t, foot[1] + (focus[1] - foot[1]) * t, foot[2] + (focus[2] - foot[2]) * t]);
        if (get(v, s, a, b, h) === M.AIR) put(v, s, a, b, h, M.METAL, 5);
      }
      const [fa, fb, fh] = cell(focus);
      put(v, s, fa, fb, fh, M.METAL, 7);
      put(v, s, beacon[0], beacon[1], beacon[2], M.LED_RED, 7);
      // the receiver on the floor
      fill(v, s, 6, 6, 0, 8, 8, 2, M.METAL, 3);
      put(v, s, 7, 7, 1, M.SCREEN, 5);
      put(v, s, 6, 7, 1, M.LED_AMBER, 6);
    },
    tick(c, s, active) {
      const v = c.v;
      const on = active ? c.t % 0.3 < 0.15 : c.t % 1.4 < 0.25;
      const bi = at(v, s, beacon[0], beacon[1], beacon[2]);
      px(v, bi, on ? M.LED_RED : M.OBSIDIAN, on ? 7 : 1);
      if (on && v.mat[bi] === M.LED_RED) shine(c, s, beacon[0] + 0.5, beacon[1] + 0.5, beacon[2] + 0.5, RED, 8, 0.35);
      const rx = at(v, s, 6, 7, 1);
      const blink = active ? Math.floor(c.t * 9) % 2 === 0 : c.t % 2 < 1.6;
      px(v, rx, blink ? M.LED_AMBER : M.OBSIDIAN, blink ? 6 : 1);
      shine(c, s, focus[0], focus[1] + 2, focus[2] - 3, CYAN, active ? 18 : 14, active ? 0.38 + 0.12 * Math.sin(c.t * 9) : 0.22);
      if (!c.rng.chance(c.dt * (active ? 16 : 0.6))) return;
      const sp = c.rng.range(4, 8);
      const ja = c.rng.range(-1.2, 1.2);
      const jb = c.rng.range(-0.8, 0.8);
      const va = N[0] * sp + ja;
      const vb = N[1] * sp + jb;
      c.spawn({
        kind: 'glint',
        x: wx(s, focus[0], focus[1]),
        y: wy(s, focus[0], focus[1]),
        z: s.z0 + focus[2],
        vx: s.wall === 'right' ? va : vb,
        vy: s.wall === 'right' ? vb : va,
        vz: N[2] * sp + c.rng.range(-0.5, 0.5),
        life: c.rng.range(0.5, 1.1),
        color: c.rng.chance(0.3) ? GLYPH : CYAN,
        glow: true,
        gravity: -0.4,
      });
    },
  };
}

// think: a cork board of clippings, photos and sticky notes, pinned and
// strung together with red string, standing on legs of its own with a
// picture light clipped over it, a filing cabinet and an overflowing bin
// beneath. Thinking runs a spark along the strings.
function board(): Prop {
  const B0 = 4; // the board's bottom and top rows
  const B1 = 15;
  return {
    name: 'conspiracy board',
    build(v, s, rng) {
      const L = s.len;
      // the stand: a leg at each end, down to feet splayed out front
      for (const a of [0, L - 1]) {
        fill(v, s, a, 0, 0, a + 1, 1, B0, M.WOOD, 2);
        fill(v, s, a, 1, 0, a + 1, 3, 1, M.WOOD, 4);
      }
      for (let h = B0; h <= B1; h++) {
        for (let a = 0; a < L; a++) {
          const edge = a === 0 || a === L - 1 || h === B0 || h === B1;
          put(v, s, a, 0, h, edge ? M.WOOD : M.BRICK, edge ? 2 : 2 + Math.floor(hash3(s.x0, a, h, s.y0) * 5));
        }
      }
      // clippings, photos and notes, each with a pin through its top
      const used = new Uint8Array(L * (B1 + 1));
      const pins: Array<[number, number]> = [];
      for (let tries = 0; tries < 40 && pins.length < 7; tries++) {
        const w = rng.int(2, 3);
        const t = rng.int(2, 3);
        const a0 = rng.int(1, L - 1 - w);
        const h0 = rng.int(B0 + 1, B1 - t);
        let free = true;
        for (let h = h0 - 1; h <= h0 + t && free; h++) for (let a = a0 - 1; a <= a0 + w && free; a++) if (used[a + L * h]) free = false;
        if (!free) continue;
        const kind = rng.int(0, 3);
        for (let h = h0; h < h0 + t; h++) {
          for (let a = a0; a < a0 + w; a++) {
            used[a + L * h] = 1;
            const rim = a === a0 || a === a0 + w - 1 || h === h0 || h === h0 + t - 1;
            const [m, sh] = kind === 0 ? [M.PAPER, 6] : kind === 1 ? (rim ? [M.BONE, 7] : [M.OBSIDIAN, 4]) : kind === 2 ? [M.GOLD_ORE, 5] : [rng.chance(0.3) ? M.PAPER : M.CARPET, 6];
            put(v, s, a, 1, h, m, sh);
          }
        }
        const pin: [number, number] = [a0 + (w >> 1), h0 + t - 1];
        put(v, s, pin[0], 2, pin[1], pins.length ? M.METAL : M.LED_RED, 7);
        pins.push(pin);
      }
      // red string, pin to pin
      const strings: number[][] = [];
      const order = pins.map((p) => [p, rng.next()] as const).sort((x, y) => x[1] - y[1]).map((p) => p[0]);
      const links: Array<[number, number]> = [];
      for (let i = 1; i < order.length; i++) links.push([i - 1, i]);
      if (order.length > 3) links.push([0, rng.int(2, order.length - 1)]);
      for (const [i, j] of links) {
        const [a0, h0] = order[i];
        const [a1, h1] = order[j];
        const n = Math.max(Math.abs(a1 - a0), Math.abs(h1 - h0));
        const cells: number[] = [];
        for (let q = 1; q < n; q++) {
          const a = Math.round(a0 + ((a1 - a0) * q) / n);
          const h = Math.round(h0 + ((h1 - h0) * q) / n);
          const m = get(v, s, a, 2, h);
          if (m !== M.AIR && m !== M.DIRT) continue;
          put(v, s, a, 2, h, M.DIRT, 5);
          cells.push(at(v, s, a, 2, h));
        }
        if (cells.length) strings.push(cells);
      }
      const all = STRINGS.get(v) ?? [];
      all.push(...strings);
      STRINGS.set(v, all);
      // the picture light
      fill(v, s, 5, 0, B1 + 1, 7, 3, B1 + 2, M.METAL, 4);
      fill(v, s, 5, 3, B1, 7, 4, B1 + 1, M.LAMP, 6);
      fill(v, s, 5, 3, B1 + 1, 7, 4, B1 + 2, M.METAL, 6);
      // filing cabinet under the board, a bin and papers on the floor
      fill(v, s, 1, 0, 0, 4, 3, B0, M.METAL, 3);
      for (let h = 0; h < B0; h++) for (let a = 1; a < 4; a++) put(v, s, a, 2, h, M.METAL, h & 1 ? 6 : 4);
      for (let b = 3; b <= 5; b++) for (let a = 8; a <= 10; a++) for (let h = 0; h < 3; h++) put(v, s, a, b, h, a === 9 && b === 4 ? M.PAPER : M.METAL, a === 9 && b === 4 ? 6 : 2 + (h & 1) * 3);
      put(v, s, 9, 4, 3, M.PAPER, 7);
      put(v, s, 7, 4, 0, M.PAPER, 7);
      for (let k = 0; k < 5; k++) {
        const a = rng.int(3, 8);
        const b = rng.int(3, 6);
        if (get(v, s, a, b, 0) === M.AIR) put(v, s, a, b, 0, M.PAPER, rng.int(5, 7));
      }
    },
    tick(c, s, active) {
      const v = c.v;
      shine(c, s, 6, 6, B1 - 4, WARM, active ? 22 : 18, active ? 0.6 : 0.4);
      const strings = STRINGS.get(v);
      if (!strings?.length) return;
      // the spark runs along one string, then the next
      const k = Math.floor(c.t / 0.9);
      const which = k % strings.length;
      for (let j = 0; j < strings.length; j++) {
        const cells: number[] = strings[j];
        const hot = active && j === which ? Math.floor(((c.t / 0.9) % 1) * cells.length) : -9;
        for (let q = 0; q < cells.length; q++) {
          const i = cells[q];
          if (v.mat[i] !== M.DIRT && v.mat[i] !== M.LED_RED) continue;
          const on = Math.abs(q - hot) <= 1;
          v.set(i, on ? M.LED_RED : M.DIRT, on ? 7 : 5);
        }
      }
    },
  };
}

// idle: a beanbag under an arc lamp on a circuit-board rug, an open pizza
// box with a slice gone, a can of soda, a pile of energy drinks and a
// controller. Low, as it sits out in front of the room.
function chillCorner(): Prop {
  const LAMP = 11; // the arc lamp's head
  return {
    name: 'beanbag',
    build(v, s, rng) {
      // the rug, set into the floor: traces and pads on dark green
      for (let b = 0; b < s.dep; b++) {
        for (let a = 0; a < s.len; a++) {
          const edge = a === 0 || a === s.len - 1 || b === 0 || b === s.dep - 1;
          const trace = !edge && (b === 2 || b === 8) && a > 1 && a < s.len - 2 && hash3(s.x0 + s.y0, a >> 2, b, 63) < 0.6;
          put(v, s, a, b, -1, trace ? M.GOLD_ORE : M.CARPET, edge ? 7 : trace ? 3 : rng.int(2, 3));
        }
      }
      const [fx, fy] = s.wall === 'right' ? [0, 1] : [1, 0];
      beanbag(v, wx(s, 4.5, 4.6), wy(s, 4.5, 4.6), s.z0, fx, fy, 3.5, M.CLOTH);
      // the pizza: box, lid standing open, crust, cheese, pepperoni
      fill(v, s, 9, 1, 0, 15, 7, 1, M.PLASTIC, 5);
      for (let b = 1; b < 7; b++) for (let a = 9; a < 15; a++) if (a === 9 || a === 14 || b === 1 || b === 6) put(v, s, a, b, 1, M.PLASTIC, 6);
      fill(v, s, 9, 0, 1, 15, 1, 7, M.PLASTIC, 6);
      put(v, s, 11, 0, 4, M.DIRT, 5);
      put(v, s, 12, 0, 4, M.DIRT, 5);
      for (let b = 2; b < 6; b++) {
        for (let a = 10; a < 14; a++) {
          if (a >= 12 && b >= 4) continue; // the slice someone took
          const rim = a === 10 || a === 13 || b === 2 || b === 5;
          put(v, s, a, b, 1, rim ? M.CANDLE : M.GOLD_ORE, rim ? 4 : 6);
        }
      }
      put(v, s, 11, 3, 1, M.DIRT, 4);
      put(v, s, 12, 2, 1, M.DIRT, 4);
      put(v, s, 11, 4, 1, M.DIRT, 4);
      // soda, energy drinks, controller
      put(v, s, 8, 8, 0, M.DIRT, 5);
      put(v, s, 8, 8, 1, M.METAL, 7);
      for (const a of [12, 13, 14]) put(v, s, a, 9, 0, M.LEAF, 5);
      put(v, s, 13, 9, 1, M.LEAF, 6);
      fill(v, s, 5, 9, 0, 7, 10, 1, M.OBSIDIAN, 4);
      // the arc lamp over the beanbag
      fill(v, s, 0, 0, 0, 2, 2, 1, M.METAL, 2);
      fill(v, s, 0, 0, 1, 1, 1, LAMP + 1, M.METAL, 4);
      for (let i = 1; i <= 3; i++) put(v, s, i, i, LAMP + 1, M.METAL, 5);
      put(v, s, 3, 3, LAMP, M.LAMP, 6);
    },
    tick(c, s, active) {
      shine(c, s, 3.5, 5, LAMP - 2, WARM, 22, 0.5 * (0.98 + 0.02 * Math.sin(c.t * 3)));
      if (!active) return;
      if (c.rng.chance(c.dt * 1.2)) puff(c, wx(s, c.rng.int(10, 13), c.rng.int(2, 5)), wy(s, c.rng.int(10, 13), c.rng.int(2, 5)), s.z0 + 2, M.STEAM, 26);
      if (c.rng.chance(c.dt * 1.5)) c.spawn({ kind: 'glint', x: wx(s, 8.5, 8.5), y: wy(s, 8.5, 8.5), z: s.z0 + 2.2, vx: 0, vy: 0, vz: 1.2, life: 0.4, color: FIZZ, glow: true, gravity: 0 });
    },
  };
}

// entrance: a steel hatch swung back against the wall, steps climbing
// through the slab to a lit doorway, a keypad and a caged green lamp over
// the frame that flashes while someone comes or goes.
function hatch(): Prop {
  const A0 = 3; // the opening, centred on the spot (a = 6)
  const A1 = 9;
  const TALL = 13;
  const LAMP_H = TALL + 3;
  const deepOf = (s: Slot) => -(wallOf(s) - 2);
  const stepOf = (b: number) => 2 * (-b - 1);
  return {
    name: 'steel hatch',
    build(v, s) {
      const deep = deepOf(s);
      for (let b = -1; b >= deep; b--) {
        const step = stepOf(b);
        for (let a = A0; a <= A1; a++) {
          for (let h = step; h < TALL; h++) {
            if (h === TALL - 1 && (a === A0 || a === A1)) continue;
            put(v, s, a, b, h, M.AIR);
          }
          if (step > 0) put(v, s, a, b, step - 1, M.METAL, 5);
        }
      }
      // the stairwell's walls in shadow, light from upstairs at the top
      for (let b = -1; b >= deep - 1; b--) {
        for (let h = 0; h < TALL; h++) {
          for (const a of [A0 - 1, A1 + 1]) if (get(v, s, a, b, h) !== M.AIR) put(v, s, a, b, h, M.ROCK_DARK, 1);
          if (b === deep - 1) for (let a = A0; a <= A1; a++) put(v, s, a, b, h, M.ROCK_DARK, 2);
        }
      }
      const top = Math.min(TALL - 3, stepOf(deep) + 1);
      fill(v, s, 5, deep - 1, top, 8, deep, top + 3, M.LAMP, 5);
      // the frame, rivets and a hazard-striped lintel
      for (const a of [A0 - 1, A1 + 1]) {
        for (let h = 0; h <= TALL; h++) {
          put(v, s, a, -1, h, M.METAL, 2);
          put(v, s, a, 0, h, M.METAL, h % 3 === 1 ? 7 : 3);
        }
      }
      for (const a of [A0, A1]) for (const b of [-1, 0]) put(v, s, a, b, TALL - 1, M.METAL, 4);
      for (let a = A0 - 1; a <= A1 + 1; a++) {
        for (let h = TALL; h <= TALL + 1; h++) {
          put(v, s, a, -1, h, M.METAL, 2);
          put(v, s, a, 0, h, ((a + h) >> 1) & 1 ? M.GOLD_ORE : M.OBSIDIAN, 4);
        }
      }
      // the door, back against the wall, its wheel
      for (let h = 0; h < TALL; h++) for (let a = 11; a <= 14; a++) put(v, s, a, 0, h, M.METAL, a === 11 || a === 14 || h === 0 || h === TALL - 1 ? 2 : 5);
      for (const [a, h] of [[12, 6], [13, 6], [12, 7], [13, 7]]) put(v, s, a, 1, h, M.METAL, 7);
      // the lamp in its cage, the keypad, a mat
      fill(v, s, 6, 0, TALL + 2, 7, 1, LAMP_H + 1, M.METAL, 4);
      put(v, s, 6, 1, LAMP_H, M.NEON_GREEN, 7);
      for (const [a, h] of [[5, LAMP_H], [7, LAMP_H], [6, LAMP_H + 1], [6, LAMP_H - 1]]) put(v, s, a, 1, h, M.METAL, 6);
      fill(v, s, 0, 0, 5, 1, 1, 9, M.METAL, 3);
      put(v, s, 0, 0, 7, M.LED_RED, 7);
      put(v, s, 0, 0, 6, M.OBSIDIAN, 4);
      fill(v, s, A0, 0, 0, A1 + 1, 3, 1, M.CARPET, 2);
    },
    tick(c, s, active) {
      const v = c.v;
      const on = !active || Math.floor(c.t * 5) % 2 === 0;
      const li = at(v, s, 6, 1, LAMP_H);
      px(v, li, on ? M.NEON_GREEN : M.OBSIDIAN, on ? 7 : 2);
      if (on && v.mat[li] === M.NEON_GREEN) shine(c, s, 6.5, 3, LAMP_H - 1, GREEN, active ? 22 : 15, active ? 0.9 : 0.4);
      px(v, at(v, s, 0, 0, 7), active ? M.NEON_GREEN : M.LED_RED, 7);
      const deep = deepOf(s);
      shine(c, s, 6.5, deep + 0.5, Math.min(TALL - 2, stepOf(deep) + 2), WARM, 10, active ? 0.65 : 0.3);
    },
  };
}

const PROPS: Record<SlotKind, Prop> = {
  write: battlestation(),
  read: manuals(),
  search: radar(),
  run: serverRack(),
  web: dish(),
  think: board(),
  idle: chillCorner(),
  entrance: hatch(),
};

// ── the floor plan ───────────────────────────────────────────────────────
// Heights above the floor: the cable tray, the band of dark panels where
// the rain falls (rails at band0 - 1 and band1), the pipe run near the top.
type Plan = { top: number; tray: number; band0: number; band1: number; pipe: number };

function plan(L: Layout): Plan {
  const top = L.H - L.floor;
  const tray = clamp(top - 19, 12, 22);
  const pipe = top - 3;
  return { top, tray, band0: tray + 3, band1: pipe - 1, pipe };
}

// The floor plan: the lounge, the kitchenette, the arcade and the bench
// first, then the core (a server pillar) behind the hub, where it hides
// none of the props out in front, then zones over a grid of anchors (desk
// pods, server cages, couch corners, junk piles, grow boxes, whiteboards),
// so the floor fills with the room.
// All clear of everything keepClear reserves, and placed from the layout
// alone so pois() agrees with generate().
type Isle = { x0: number; y0: number; w: number; d: number };
const LOUNGE = { w: 23, d: 16 };
const KITCHEN = { w: 17, d: 8 };
const ARCADE = { w: 9, d: 7 };
const BENCH = { w: 11, d: 7 };
const FRIDGE_ONLY = { w: 7, d: 8 }; // when the kitchenette will not fit
const CORE = 16; // the server pillar's plot, square
const GRID = 24; // spacing of the zone anchors
type ZoneKind = 'pod' | 'cage' | 'couch' | 'junk' | 'grow' | 'board';
// Zone plots, unturned: a along their front, b out of it (turned zones
// face +x instead of +y).
const ZONE: Record<ZoneKind, { w: number; d: number }> = {
  pod: { w: 17, d: 9 },
  cage: { w: 14, d: 10 },
  couch: { w: 14, d: 12 },
  junk: { w: 8, d: 6 },
  grow: { w: 7, d: 6 },
  board: { w: 9, d: 6 },
};
// Odds of each kind at an anchor: the back half of the room, behind the
// hub, runs to smaller things so the front stays the fuller.
const ZONE_ODDS: ReadonlyArray<readonly [ZoneKind, number]> = [['pod', 3], ['cage', 1.6], ['couch', 1.4], ['junk', 1.8], ['grow', 0.5], ['board', 1]];
const BACK_ODDS: ReadonlyArray<readonly [ZoneKind, number]> = [['pod', 1.5], ['cage', 0.8], ['couch', 0.5], ['junk', 2.4], ['grow', 0.6], ['board', 1.6]];
type Zone = { kind: ZoneKind; I: Isle; flip: boolean; k: number };
type Isles = { lounge: Isle | null; kitchen: Isle | null; arcade: Isle | null; bench: Isle | null; core: Isle | null; zones: Zone[] };

function islands(L: Layout): Isles {
  const { W, D, T } = L;
  const keep = keepClear(L);
  const block = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) block[x + W * y] = keep[x + W * y] || x < T + 3 || y < T + 3 || x >= W - 3 || y >= D - 3 ? 1 : 0;
  }
  const W1 = W + 1;
  const sat = new Int32Array(W1 * (D + 1));
  const sum = () => {
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) sat[x + 1 + W1 * (y + 1)] = block[x + W * y] + sat[x + W1 * (y + 1)] + sat[x + 1 + W1 * y] - sat[x + W1 * y];
    }
  };
  const busy = (x0: number, y0: number, x1: number, y1: number) => sat[x1 + W1 * y1] - sat[x0 + W1 * y1] - sat[x1 + W1 * y0] + sat[x0 + W1 * y0];
  sum();
  // The free plot w x d nearest (px0, py0), searching out to maxR.
  const near = (w: number, d: number, px0: number, py0: number, maxR: number): Isle | null => {
    for (let r = 0; r <= maxR; r++) {
      let best: Isle | null = null;
      let far = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x0 = px0 + dx;
          const y0 = py0 + dy;
          if (x0 < 1 || y0 < 1 || x0 + w + 1 > W || y0 + d + 1 > D) continue;
          if (busy(x0 - 1, y0 - 1, x0 + w + 1, y0 + d + 1)) continue;
          const e = dx * dx + dy * dy;
          if (e < far) {
            far = e;
            best = { x0, y0, w, d };
          }
        }
      }
      if (best) return best;
    }
    return null;
  };
  const place = (w: number, d: number, fx: number, fy: number): Isle | null =>
    near(w, d, Math.round(T + (W - T) * fx - w / 2), Math.round(T + (D - T) * fy - d / 2), Math.max(W, D));
  const claim = <X extends Isle | null>(I: X): X => {
    if (!I) return I;
    for (let y = Math.max(0, I.y0 - 2); y < Math.min(D, I.y0 + I.d + 2); y++) {
      for (let x = Math.max(0, I.x0 - 2); x < Math.min(W, I.x0 + I.w + 2); x++) block[x + W * y] = 1;
    }
    sum();
    return I;
  };
  const lounge = claim(place(LOUNGE.w, LOUNGE.d, 0.8, 0.6));
  const kitchen = claim(place(KITCHEN.w, KITCHEN.d, 0.55, 0.9) ?? place(FRIDGE_ONLY.w, FRIDGE_ONLY.d, 0.55, 0.9));
  const core = W >= 140 ? claim(near(CORE, CORE, Math.round(T + (W - T) * 0.38 - CORE / 2), Math.round(T + (D - T) * 0.38 - CORE / 2), 30)) : null;
  const arcade = claim(place(ARCADE.w, ARCADE.d, 0.9, 0.86));
  const bench = claim(place(BENCH.w, BENCH.d, 0.66, 0.72));
  // Zones: anchors on a grid, visited in a scrambled order, each trying its
  // own kind and then the small ones.
  const anchors: Array<[number, number, number]> = [];
  for (let gy = T + GRID / 2; gy < D - 6; gy += GRID) {
    for (let gx = T + GRID / 2; gx < W - 6; gx += GRID) anchors.push([gx, gy, hash3(W, gx, gy, 90)]);
  }
  anchors.sort((p, q) => p[2] - q[2]);
  const zones: Zone[] = [];
  for (const [gx, gy, r] of anchors) {
    const odds = gx - T + (gy - T) > W - T ? ZONE_ODDS : BACK_ODDS;
    let pick = r * odds.reduce((n, [, w]) => n + w, 0);
    let first: ZoneKind = 'junk';
    for (const [kind, w] of odds) {
      if (pick < w) {
        first = kind;
        break;
      }
      pick -= w;
    }
    const flip = hash3(W, gx, gy, 91) < 0.5;
    for (const kind of [...new Set<ZoneKind>([first, 'junk', 'board'])]) {
      const { w, d } = ZONE[kind];
      const [iw, id] = flip ? [d, w] : [w, d];
      const I = claim(near(iw, id, Math.round(gx - iw / 2), Math.round(gy - id / 2), GRID >> 1));
      if (I) {
        zones.push({ kind, I, flip, k: zones.length });
        break;
      }
    }
  }
  return { lounge, kitchen, arcade, bench, core, zones };
}

// A zone's frame: a along its front, b out of it, h up from the floor.
function zoneXY(Z: Zone, a: number, b: number): [number, number] {
  return Z.flip ? [Z.I.x0 + b, Z.I.y0 + a] : [Z.I.x0 + a, Z.I.y0 + b];
}

function zoneFrame(v: Voxels, L: Layout, Z: Zone) {
  const z0 = L.floor;
  return {
    p: (a: number, b: number, h: number, m: number, s?: number) => {
      const [x, y] = zoneXY(Z, a, b);
      v.put(x, y, z0 + h, m, s);
    },
    i: (a: number, b: number, h: number) => {
      const [x, y] = zoneXY(Z, a, b);
      return v.idx(x, y, z0 + h);
    },
    at: (a: number, b: number, h: number): [number, number, number] => [...zoneXY(Z, a, b), z0 + h],
  };
}

// Where someone uses a zone (a, b in its frame), and what they look at.
const ZONE_POI: Partial<Record<ZoneKind, { kind: Poi['kind']; at: readonly [number, number]; face: readonly [number, number] }>> = {
  pod: { kind: 'seat', at: [7, 4], face: [7.5, 0] },
  couch: { kind: 'seat', at: [6, 9], face: [6, 5] },
  grow: { kind: 'view', at: [3, 4], face: [3, 1] },
  board: { kind: 'view', at: [4, 4], face: [4, 1] },
};

// In the lounge's frame: the beanbags' centres, the lava lamp's, the cat's
// bed (where the stage's critter lives).
const BEANS: ReadonlyArray<readonly [number, number]> = [[4.5, 12.6], [17.5, 12.6]];
const LAVA: readonly [number, number] = [20, 5];
const SOFA: readonly number[] = [9, 12]; // its two seats (x; y = 12)
const CAT: readonly [number, number] = [3, 6];
// In the kitchenette's frame: the fridge's front-left corner.
const fridgeAt = (I: Isle): readonly [number, number] => (I.w === KITCHEN.w ? [9, 0] : [0, 0]);
// In the arcade's frame: each cabinet's left edge.
const CABINETS: readonly number[] = [0, 5];

function pois(L: Layout): Poi[] {
  const out: Poi[] = [];
  const { lounge, kitchen, arcade, bench, core, zones } = islands(L);
  if (lounge) {
    const { x0, y0 } = lounge;
    const tv = { x: x0 + 10.5, y: y0 + 1 };
    out.push({ x: x0 + 10, y: y0 + 5, kind: 'view', face: tv });
    for (const [bx, by] of BEANS) {
      const s = seatOf(x0 + bx, y0 + by, 0, -1);
      out.push({ x: s.x, y: s.y, kind: 'seat', face: tv });
    }
    for (const sx of SOFA) out.push({ x: x0 + sx, y: y0 + 12, kind: 'seat', face: tv });
    out.push({ x: x0 + 16, y: y0 + 5, kind: 'view', face: { x: x0 + LAVA[0] + 0.5, y: y0 + LAVA[1] + 0.5 } });
    out.push({ x: x0 + CAT[0], y: y0 + CAT[1], kind: 'pet' });
  }
  if (kitchen) {
    const fx = kitchen.x0 + fridgeAt(kitchen)[0];
    const fy = kitchen.y0 + fridgeAt(kitchen)[1];
    out.push({ x: fx + 1, y: fy + 6, kind: 'drink', face: { x: fx + 1.5, y: fy + 3 } });
  }
  if (arcade) {
    for (const dx of CABINETS) out.push({ x: arcade.x0 + dx + 2, y: arcade.y0 + 6, kind: 'view', face: { x: arcade.x0 + dx + 2, y: arcade.y0 + 2 } });
  }
  if (bench) out.push({ x: bench.x0 + 3, y: bench.y0 + 6, kind: 'view', face: { x: bench.x0 + 3, y: bench.y0 + 2 } });
  if (core) out.push({ x: core.x0 + 12, y: core.y0 + 14, kind: 'view', face: { x: core.x0 + 8, y: core.y0 + 8 } });
  for (const Z of zones) {
    const q = ZONE_POI[Z.kind];
    if (!q) continue;
    const [x, y] = zoneXY(Z, q.at[0], q.at[1]);
    const [fx, fy] = zoneXY(Z, q.face[0], q.face[1]);
    out.push({ x, y, kind: q.kind, face: { x: fx, y: fy } });
  }
  return out;
}

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  clear(v);
  const P = plan(L);
  const seed = rng.int(0, 0x3fffffff);
  const keep = keepClear(L);
  const fx: Fixtures = { rain: [], sign: null, clock: null, blinkers: [], leak: null, tv: null, lava: null, fridge: null, brew: null, oven: null, lamps: [], arcade: null, bench: null, junk: null, screens: [], pools: [] };
  STRINGS.delete(v);

  shell(v, L, seed);
  for (const wall of SIDES) face(v, L, P, wall, seed);
  deck(v, L, seed, keep);

  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);

  for (const wall of SIDES) {
    tray(v, L, P, wall, seed);
    pipes(v, L, P, wall, seed);
    gapDecor(v, L, P, wall, rng, keep, fx);
    baseCables(v, L, wall, keep);
  }
  if (fx.lamps.length > 1) fx.lamps[rng.int(0, fx.lamps.length - 1)].broken = true;
  rainColumns(v, L, P, seed, fx);
  sign(v, L, P, fx);
  clock(v, L, P, fx);

  const { lounge, kitchen, arcade, bench, core, zones } = islands(L);
  if (lounge) buildLounge(v, L, lounge, seed, fx);
  if (kitchen) buildKitchen(v, L, kitchen, fx);
  if (arcade) buildArcade(v, L, arcade, fx);
  if (bench) buildBench(v, L, bench, fx);
  if (core) buildCore(v, L, P, core, seed, fx);
  for (const Z of zones) ZONE_BUILD[Z.kind](v, L, Z, seed, fx);
  const isles = [core, lounge, arcade, bench, kitchen, ...zones.map((Z) => Z.I)].filter((I): I is Isle => I !== null);
  trays(v, L, keep, isles);
  scatter(v, L, keep, isles, seed, fx);
  fx.leak = leakSpot(v, L, P, keep, rng);
  litter(v, L, rng, keep, isles);
  FIXTURES.set(v, fx);
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Poured concrete: the two wall slabs full height, the floor slab with a
// polished top.
function shell(v: Voxels, L: Layout, seed: number): void {
  const { W, D, H, T, floor } = L;
  for (let z = 0; z < H; z++) {
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        const i = v.idx(x, y, z);
        if (x < T || y < T) v.set(i, M.CONCRETE, 1 + Math.floor(hash3(seed, x >> 1, y >> 1, z) * 4 + hash3(seed, x, y, z) * 2));
        else if (z < floor - 1) v.set(i, M.ROCK_DARK, Math.floor(hash3(seed, x, y, z) * 6));
        else if (z === floor - 1) v.set(i, M.ROCK, 3);
      }
    }
  }
}

// The inner wall faces, bottom to top: a dark skirting, cinder block in
// running bond with damp patches, the panel band (rails, bezels, dark
// glass) and a last course of block above it.
function face(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number): void {
  const { T, floor } = L;
  const end = alongEnd(L, wall);
  const k = wall === 'left' ? 1 : 2;
  for (let a = T; a < end; a++) {
    const [x, y] = onWall(L, wall, a, -1);
    for (let h = 0; h < P.top; h++) {
      let m: number = M.CONCRETE;
      let s = 4;
      if (h < 2) {
        m = M.ROCK_DARK;
        s = h ? 6 : 4;
      } else if (h >= P.band0 - 1 && h <= P.band1) {
        if (h === P.band0 - 1 || h === P.band1) {
          m = M.METAL;
          s = 2;
        } else if ((a - T) % PW === 0) {
          m = M.METAL;
          s = 3;
        } else {
          m = M.OBSIDIAN;
          s = 1 + (hash3(seed, a, h, k) < 0.5 ? 1 : 0);
        }
      } else {
        const hh = h - 2;
        const course = hh >> 2;
        const off = (course & 1) * 4;
        if ((hh & 3) === 3 || (a + off) % 8 === 0) {
          m = M.ROCK_DARK;
          s = 5;
        } else {
          s = 3 + Math.floor(hash3(seed, (a + off) >> 3, course, k) * 3) + (hash3(seed, a, h, 9) < 0.2 ? 1 : 0);
          if (noise2(seed + k, a * 0.07, h * 0.12) > 0.68) s = Math.max(0, s - 3);
        }
      }
      v.put(x, y, floor + h, m, s);
    }
  }
}

// The floor's top: polished concrete in 16-voxel bays cut by dark joints,
// smooth but for broad stains, worn lighter along the ways people walk.
function deck(v: Voxels, L: Layout, seed: number, keep: Uint8Array): void {
  const { W, D, T, floor } = L;
  for (let y = T; y < D; y++) {
    for (let x = T; x < W; x++) {
      const joint = (x - T) % 16 === 15 || (y - T) % 16 === 15;
      const n = noise2(seed + 30, x * 0.06, y * 0.06);
      const s = (n < 0.3 ? 2 : n > 0.7 ? 4 : 3) + (keep[x + W * y] ? 2 : 0);
      v.put(x, y, floor - 1, M.ROCK, joint ? 0 : s);
    }
  }
}

// The cable tray along a wall, under the panel band: steel channel full of
// cables on brackets, and a cable sagging out of it here and there. Only
// into air, so it stops short at the props.
function tray(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number): void {
  const { T, floor } = L;
  const end = alongEnd(L, wall);
  const k = wall === 'left' ? 1 : 2;
  const CABLE = [M.OBSIDIAN, M.CLOTH, M.CARPET, M.OBSIDIAN, M.METAL];
  const set = (a: number, o: number, h: number, m: number, s: number) => {
    const [x, y] = onWall(L, wall, a, o);
    if (v.get(x, y, floor + h) === M.AIR) v.put(x, y, floor + h, m, s);
  };
  for (let a = T; a < end; a++) {
    set(a, 0, P.tray, M.METAL, 3);
    set(a, 1, P.tray, M.METAL, 3);
    set(a, 1, P.tray + 1, M.METAL, 5);
    set(a, 0, P.tray + 1, CABLE[Math.floor(hash3(seed, a >> 2, k, 40) * CABLE.length)], 4);
    if ((a - T) % 10 === 4) set(a, 0, P.tray - 1, M.METAL, 2);
    // the odd rail on the band
    set(a, 0, P.band0 - 1, M.METAL, 4);
  }
  for (let a0 = T + 4; a0 + 10 < end; a0 += 10) {
    if (hash3(seed, a0, k, 41) < 0.45) continue;
    const sag = 1 + hash3(seed, a0, k, 42) * 3.5;
    const m = CABLE[Math.floor(hash3(seed, a0, k, 43) * CABLE.length)];
    for (let i = 1; i < 10; i++) {
      const f = i / 10;
      set(a0 + i, 0, P.tray - 1 - Math.round(sag * 4 * f * (1 - f)), m, 4);
    }
  }
}

// Two pipes along the top of each wall, collared, under the last course.
function pipes(v: Voxels, L: Layout, P: Plan, wall: Side, seed: number): void {
  const { T, floor } = L;
  const end = alongEnd(L, wall);
  const z0 = floor + P.pipe;
  const off = T + 2 + Math.floor(hash3(seed, wall === 'left' ? 1 : 2, 0, 44) * 13);
  for (let a = T; a < end; a++) {
    const collar = (a - off) % 13 === 0;
    for (let o = 0; o < 2; o++) {
      const [x, y] = onWall(L, wall, a, o);
      v.put(x, y, z0, M.METAL, collar ? 6 : o ? 3 : 2);
      v.put(x, y, z0 + 1, M.METAL, collar ? 7 : o ? 6 : 5);
    }
    if (collar) {
      const [x, y] = onWall(L, wall, a, 2);
      if (v.get(x, y, z0) === M.AIR) v.put(x, y, z0, M.METAL, 6);
      if (v.get(x, y, z0 + 1) === M.AIR) v.put(x, y, z0 + 1, M.METAL, 7);
    }
  }
}

// Something on the wall in each gap between props: a poster, a fuse box of
// blinking lights, or a drain pipe down from the pipe run. Only where the
// floor in front is free.
function gapDecor(v: Voxels, L: Layout, P: Plan, wall: Side, rng: Rng, keep: Uint8Array, fx: Fixtures): void {
  const { T, floor, W } = L;
  let n = wall === 'left' ? 1 : 0;
  const clearAt = (a: number) => {
    for (const o of [0, 1]) {
      const [x, y] = onWall(L, wall, a, o);
      if (keep[x + W * y]) return false;
    }
    return true;
  };
  for (const [g0, g1] of wallGaps(L, wall)) {
    if (g0 === T) continue;
    const a0 = g0 + 2;
    const w = g1 - 2 - a0;
    if (w < 3) continue;
    let ok = true;
    for (let a = a0; a < a0 + w && ok; a++) ok = clearAt(a);
    const kind = w >= 6 ? n++ % 3 : w >= 4 ? 1 : 2;
    const mid = a0 + (w >> 1);
    const set = (a: number, o: number, h: number, m: number, s: number) => {
      const [x, y] = onWall(L, wall, a, o);
      if (v.get(x, y, floor + h) === M.AIR) v.put(x, y, floor + h, m, s);
    };
    if (kind < 2 && P.tray >= 18) {
      // a caged bulkhead lamp over it
      const h = P.tray - 4;
      const [x, y] = onWall(L, wall, mid, 0);
      if (v.get(x, y, floor + h) === M.AIR) {
        v.put(x, y, floor + h, M.LAMP, 7);
        set(mid, 0, h + 1, M.METAL, 5);
        set(mid, 0, h - 1, M.METAL, 3);
        set(mid, 1, h + 1, M.METAL, 6);
        const [lx, ly] = onWall(L, wall, mid + 0.5, 2.5);
        fx.lamps.push({ i: v.idx(x, y, floor + h), x: lx, y: ly, z: floor + h, color: BULB, radius: 20, intensity: 0.45, broken: false });
      }
    }
    if (kind === 0) {
      // a poster: a wireframe globe under a title bar, or a skull
      const skull = rng.chance(0.4);
      for (let i = 0; i < 6; i++) {
        for (let h = 6; h < 14; h++) {
          const a = textAlong(wall, mid, 6, i);
          const rim = i === 0 || i === 5 || h === 6 || h === 13;
          let m: number = M.OBSIDIAN;
          let s = 3;
          if (rim) [m, s] = [M.PAPER, 4];
          else if (h === 12) [m, s] = [skull ? M.PAPER : M.CLOTH, 6];
          else if (skull) {
            const face = (h >= 8 && h <= 10 && i >= 1 && i <= 4) || (h === 7 && (i === 2 || i === 3));
            if (face && !(h === 9 && (i === 2 || i === 3))) [m, s] = [M.BONE, 7];
          } else if (Math.abs(Math.hypot(i - 2.5, h - 9) - 1.9) < 0.6 || i === 2 || h === 9) [m, s] = [M.CARPET, 7];
          set(a, 0, h, m, s);
        }
      }
    } else if (kind === 1) {
      // a fuse box with status lights
      for (let i = 0; i < 4; i++) {
        for (let h = 7; h < 12; h++) {
          const a = textAlong(wall, mid, 4, i);
          const rim = i === 0 || i === 3 || h === 7 || h === 11;
          set(a, 0, h, rim ? M.METAL : M.OBSIDIAN, rim ? 5 : 2);
          if (!rim && (h === 8 || h === 10)) {
            const [x, y] = onWall(L, wall, a, 0);
            const on = rng.pick([M.NEON_GREEN, M.NEON_GREEN, M.LED_AMBER, M.LED_RED]);
            v.put(x, y, floor + h, on, 7);
            fx.blinkers.push({ i: v.idx(x, y, floor + h), on, period: rng.range(0.4, 2.6), phase: rng.range(0, 3), duty: rng.range(0.3, 0.85) });
          }
        }
      }
      for (let h = 0; h < 7; h++) set(textAlong(wall, mid, 4, 1), 0, h, M.OBSIDIAN, 4);
    } else if (ok) {
      // a drain pipe from the pipe run to the floor
      for (let h = 0; h < P.pipe; h++) {
        for (let i = 0; i < 2; i++) for (let o = 0; o < 2; o++) set(mid + i, o, h, M.METAL, (h - 3) % 9 === 0 ? 7 : i ? 3 : 5);
      }
    }
  }
}

// Cables along the foot of a wall, where nothing else needs the floor.
function baseCables(v: Voxels, L: Layout, wall: Side, keep: Uint8Array): void {
  const { T, W, floor } = L;
  const end = alongEnd(L, wall);
  for (const [o, m] of [[0, M.OBSIDIAN], [1, M.CARPET]] as const) {
    let run: Array<[number, number]> = [];
    const flush = () => {
      if (run.length >= 4) for (const [x, y] of run) v.put(x, y, floor, m, o ? 6 : 3);
      run = [];
    };
    for (let a = T + 1; a < end - 1; a++) {
      const [x, y] = onWall(L, wall, a, o);
      if (keep[x + W * y] || v.get(x, y, floor) !== M.AIR || v.get(x, y, floor + 1) !== M.AIR) flush();
      else run.push([x, y]);
    }
    flush();
  }
}

// Matrix rain: every other column of each dark panel gets a stream of
// glyphs with its own speed, length and pause.
function rainColumns(v: Voxels, L: Layout, P: Plan, seed: number, fx: Fixtures): void {
  const { T, floor } = L;
  const n = P.band1 - P.band0;
  if (n < 4) return;
  for (const wall of SIDES) {
    const end = alongEnd(L, wall);
    for (let a = T; a < end; a++) {
      const ia = (a - T) % PW;
      if (ia === 0 || ia & 1) continue;
      const [x, y] = onWall(L, wall, a, -1);
      const k = (wall === 'left' ? 1000 : 2000) + a;
      const speed = 4 + hash3(seed, k, 1, 50) * 9;
      const tail = 4 + Math.floor(hash3(seed, k, 2, 50) * Math.min(12, n * 0.8));
      const cycle = n + tail + n * (0.2 + hash3(seed, k, 3, 50) * 1.4);
      fx.rain.push({ i0: v.idx(x, y, floor + P.band0), n, speed, tail, cycle, phase: hash3(seed, k, 4, 50) * cycle, k });
    }
  }
}

// HACK_ in pink neon over the right wall's panels, centred on its widest
// stretch between props, the cursor in green.
function sign(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const n = P.band1 - P.band0;
  if (n < 7) return;
  const gaps = wallGaps(L, 'right');
  if (!gaps.length) return;
  const [g0, g1] = gaps.reduce((p, q) => (q[1] - q[0] > p[1] - p[0] ? q : p));
  const mid = (g0 + g1) / 2;
  const top = P.band0 + Math.floor((n + 5) / 2) - 1;
  const cells: Array<[number, number]> = [];
  const cursor: number[] = [];
  const text = 'HACK_';
  for (let g = 0; g < text.length; g++) {
    const rows = FONT[text[g]];
    for (let col = 0; col < 3; col++) {
      for (let row = 0; row < 5; row++) {
        if (!lit(rows, col, row)) continue;
        const a = textAlong('right', mid, 19, g * 4 + col);
        const [x, y] = onWall(L, 'right', a, 0);
        const z = L.floor + top - row;
        if (v.get(x, y, z) !== M.AIR) continue;
        const cur = g === text.length - 1;
        v.put(x, y, z, cur ? M.NEON_GREEN : M.NEON_PINK, 7);
        if (cur) cursor.push(v.idx(x, y, z));
        else cells.push([v.idx(x, y, z), g]);
      }
    }
  }
  const [lx, ly] = onWall(L, 'right', mid, 3);
  fx.sign = { cells, cursor, light: [lx, ly, L.floor + top - 2] };
}

// An amber LED clock over the hatch: HH:MM in a dark case.
function clock(v: Voxels, L: Layout, P: Plan, fx: Fixtures): void {
  const n = P.band1 - P.band0;
  if (n < 7) return;
  const s = slotsOn(L, 'left').find((k) => k.kind === 'entrance') ?? slotsOn(L, 'left')[0];
  if (!s) return;
  const mid = s.y0 + 6.5;
  const top = P.band0 + Math.floor((n + 5) / 2) - 1;
  const cells: number[] = [];
  for (let col = -1; col <= 17; col++) {
    for (let row = -1; row <= 5; row++) {
      const a = textAlong('left', mid, 17, col);
      const [x, y] = onWall(L, 'left', a, 0);
      const z = L.floor + top - row;
      v.put(x, y, z, M.OBSIDIAN, col < 0 || col > 16 || row < 0 || row > 4 ? 4 : 2);
      if (col >= 0 && col <= 16 && row >= 0 && row <= 4) cells.push(v.idx(x, y, z));
    }
  }
  const [lx, ly] = onWall(L, 'left', mid, 3);
  fx.clock = { cells, light: [lx, ly, L.floor + top - 2] };
}

// The lounge: a TV on a stand playing pong, a circuit-board rug, a low
// table of pizza boxes and a laptop, two beanbags and a sofa, a lava lamp,
// a floor lamp and the cat's bed.
function buildLounge(v: Voxels, L: Layout, I: Isle, seed: number, fx: Fixtures): void {
  const { x0, y0 } = I;
  const z0 = L.floor;
  const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + x, y0 + y, z0 + h, m, s);
  // rug, set into the floor
  for (let y = 3; y <= 15; y++) {
    for (let x = 1; x <= 21; x++) {
      const edge = x === 1 || x === 21 || y === 3 || y === 15;
      let m: number = M.CARPET;
      let s = edge ? 7 : 2 + Math.floor(hash3(seed, x0 + x, y0 + y, 60) * 2);
      if (!edge && (y - 5) % 3 === 0 && x > 2 && x < 20) {
        const r0 = 3 + Math.floor(hash3(seed, y, x0, 61) * 6);
        const r1 = r0 + 3 + Math.floor(hash3(seed, y, x0, 62) * 8);
        if (x >= r0 && x <= r1) [m, s] = x === r0 || x === r1 ? [M.GOLD_ORE, 3] : [M.CARPET, 6];
      }
      p(x, y, -1, m, s);
    }
  }
  // the TV: feet, legs, panel, screen facing the rug
  for (const x of [5, 16]) {
    for (let h = 0; h < 3; h++) p(x, 0, h, M.METAL, 3);
    for (let dx = -1; dx <= 1; dx++) p(x + dx, 1, 0, M.METAL, 4);
  }
  const cells: number[] = [];
  for (let h = 3; h <= 11; h++) {
    for (let x = 4; x <= 17; x++) {
      p(x, 0, h, M.OBSIDIAN, 3);
      const bezel = x === 4 || x === 17 || h === 3 || h === 11;
      p(x, 1, h, M.OBSIDIAN, bezel ? 5 : 1);
    }
  }
  for (let h = 4; h <= 10; h++) for (let x = 5; x <= 16; x++) cells.push(v.idx(x0 + x, y0 + 1, z0 + h));
  p(16, 1, 3, M.LED_RED, 5);
  fx.tv = { cells, light: [x0 + 10.5, y0 + 4, z0 + 7] };
  // the low table and what is on it
  for (const [x, y] of [[8, 7], [14, 7], [8, 9], [14, 9]]) p(x, y, 0, M.WOOD, 2);
  for (let y = 7; y <= 9; y++) for (let x = 8; x <= 14; x++) p(x, y, 1, M.WOOD, 4);
  for (let y = 7; y <= 9; y++) for (let x = 8; x <= 10; x++) for (const h of [2, 3]) p(x, y, h, M.PLASTIC, h === 3 ? 6 : 4);
  p(9, 8, 3, M.DIRT, 5);
  for (let x = 12; x <= 14; x++) {
    for (const y of [8, 9]) p(x, y, 2, M.METAL, 3);
    for (const h of [3, 4]) p(x, 8, h, M.SCREEN, 4);
  }
  p(11, 9, 2, M.DIRT, 5);
  p(11, 9, 3, M.METAL, 7);
  // beanbags facing the TV
  for (const [bx, by] of BEANS) beanbag(v, x0 + bx, y0 + by, z0, 0, -1, 3.2, M.CLOTH);
  // a two-seat sofa between them
  for (let x = 8; x <= 13; x++) {
    for (let y = 12; y <= 14; y++) {
      const top = y === 14 ? 4 : x === 8 || x === 13 ? 3 : 2;
      for (let h = 0; h < top; h++) p(x, y, h, M.CLOTH, h === top - 1 ? 6 : h ? 3 : 1);
    }
  }
  // a floor lamp in the corner
  p(22, 15, 0, M.METAL, 3);
  for (let h = 1; h <= 11; h++) p(22, 15, h, M.METAL, 4);
  p(22, 15, 12, M.LAMP, 6);
  p(22, 15, 13, M.METAL, 6);
  fx.lamps.push({ i: v.idx(x0 + 22, y0 + 15, z0 + 12), x: x0 + 21.5, y: y0 + 14, z: z0 + 11, color: WARM, radius: 24, intensity: 0.55, broken: false });
  // the lava lamp: a lit base, a glass body of water with wax in it, a cap
  const [lx, ly] = [x0 + LAVA[0], y0 + LAVA[1]];
  const round = (dx: number, dy: number) => !(Math.abs(dx) === 2 && Math.abs(dy) === 2);
  const lava: Array<[number, number, number, number]> = [];
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      if (!round(dx, dy)) continue;
      const x = lx + dx;
      const y = ly + dy;
      v.put(x, y, z0, M.METAL, 2);
      v.put(x, y, z0 + 1, M.METAL, 4);
      for (let h = 2; h < 12; h++) {
        const inner = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
        v.put(x, y, z0 + h, inner ? (h === 2 ? M.POTION : M.WATER) : M.GLASS, inner ? 4 : 5);
        if (inner) lava.push([v.idx(x, y, z0 + h), dx, dy, h - 2]);
      }
      if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) v.put(x, y, z0 + 12, M.METAL, 5);
    }
  }
  v.put(lx, ly, z0 + 1, M.LAMP, 7);
  v.put(lx, ly, z0 + 13, M.METAL, 6);
  fx.lava = { cells: lava, x: lx + 0.5, y: ly + 0.5, z: z0 + 2 };
  // the cat's bed (the cat itself is the stage's critter, at home here)
  const [cx, cy] = [x0 + CAT[0], y0 + CAT[1]];
  for (let y = cy - 3; y <= cy + 3; y++) {
    for (let x = cx - 3; x <= cx + 3; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= 1.3) v.put(x, y, z0, M.CARPET, 6);
      else if (d <= 2.5) for (let h = 0; h < 2; h++) v.put(x, y, z0 + h, M.CLOTH, h ? 5 : 2);
    }
  }
  // a toy mouse, left by the bed
  v.put(cx + 3, cy - 2, z0, M.METAL, 6);
}

// The kitchenette: a counter with a coffee maker (a glass carafe of coffee)
// and a microwave, a mini fridge with a plant on top whose door swings open
// now and then, and an overflowing bin; where all that will not fit, just
// the fridge.
function buildKitchen(v: Voxels, L: Layout, I: Isle, fx: Fixtures): void {
  const { x0, y0 } = I;
  const z0 = L.floor;
  const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + x, y0 + y, z0 + h, m, s);
  if (I.w === KITCHEN.w) counter(v, I, z0, fx);
  fridge(v, x0 + fridgeAt(I)[0], y0 + fridgeAt(I)[1], z0, fx);
  if (I.w !== KITCHEN.w) return;
  // the bin, overflowing
  for (let h = 0; h <= 3; h++) {
    for (let y = 0; y <= 2; y++) {
      for (let x = 14; x <= 16; x++) {
        const inner = x === 15 && y === 1;
        p(x, y, h, inner ? M.PAPER : M.METAL, inner ? 6 : h === 3 ? 6 : 3);
      }
    }
  }
  p(15, 1, 4, M.PAPER, 7);
  p(14, 1, 4, M.PLASTIC, 6);
  p(16, 3, 0, M.DIRT, 5);
}

// The counter: coffee maker (a glass carafe of coffee), microwave, and a
// lit shelf of groceries over them.
function counter(v: Voxels, I: Isle, z0: number, fx: Fixtures): void {
  const { x0, y0 } = I;
  const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + x, y0 + y, z0 + h, m, s);
  for (let h = 0; h < 4; h++) for (let y = 0; y <= 2; y++) for (let x = 0; x <= 7; x++) p(x, y, h, M.PLASTIC, y === 2 ? (x === 3 || x === 4 ? 1 : h === 2 && (x === 2 || x === 5) ? 6 : 3) : 2);
  for (let y = 0; y <= 2; y++) for (let x = 0; x <= 7; x++) p(x, y, 4, M.METAL, 6);
  // coffee maker: a tower at the back, the carafe in front of it
  for (let h = 5; h <= 9; h++) for (let x = 1; x <= 3; x++) p(x, 0, h, M.METAL, h === 9 ? 5 : 2);
  p(3, 0, 8, M.LED_RED, 7);
  for (let y = 1; y <= 2; y++) for (let x = 1; x <= 3; x++) p(x, y, 5, M.GLASS, 5);
  for (const h of [6, 7]) {
    for (let y = 1; y <= 2; y++) for (let x = 1; x <= 3; x++) p(x, y, h, x === 2 && y === 1 ? M.COFFEE : M.GLASS, 5);
  }
  fx.brew = [x0 + 2.5, y0 + 1.5, z0 + 8];
  // microwave, its clock blinking 12:00
  for (let h = 5; h <= 7; h++) for (let y = 0; y <= 2; y++) for (let x = 4; x <= 7; x++) p(x, y, h, M.METAL, 5);
  for (let h = 5; h <= 6; h++) for (let x = 4; x <= 6; x++) p(x, 2, h, M.OBSIDIAN, 3);
  p(7, 2, 6, M.LED_AMBER, 7);
  fx.oven = v.idx(x0 + 7, y0 + 2, z0 + 6);
  // a shelf over the counter, a light strip under it, groceries on it
  for (let h = 5; h <= 11; h++) p(0, 0, h, M.METAL, 3);
  for (let h = 8; h <= 11; h++) p(7, 0, h, M.METAL, 3);
  for (let x = 0; x <= 7; x++) p(x, 0, 12, M.METAL, 5);
  for (let x = 1; x <= 6; x++) p(x, 0, 11, M.LAMP, 6);
  p(1, 0, 13, M.DIRT, 5);
  p(1, 0, 14, M.DIRT, 6);
  p(2, 0, 13, M.GOLD_ORE, 4);
  p(4, 0, 13, M.TILE, 6);
  p(5, 0, 13, M.PLASTIC, 6);
  p(6, 0, 13, M.CARPET, 6);
  fx.lamps.push({ i: v.idx(x0 + 3, y0, z0 + 11), x: x0 + 3.5, y: y0 + 2.5, z: z0 + 9, color: WARM, radius: 16, intensity: 0.45, broken: false });
}

// The mini fridge with its front-left corner at (x0, y0): a white box,
// shelves of cans and leftovers, a lamp, a door that swings out to the
// right, and a pot plant on top.
function fridge(v: Voxels, x0: number, y0: number, z0: number, fx: Fixtures): void {
  const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + x, y0 + y, z0 + h, m, s);
  for (let h = 0; h <= 6; h++) {
    for (let y = 0; y <= 2; y++) {
      for (let x = 0; x <= 3; x++) {
        const cavity = x >= 1 && x <= 2 && y >= 1 && h >= 1 && h <= 5;
        p(x, y, h, cavity ? M.AIR : M.TILE, h === 6 ? 7 : 5);
      }
    }
  }
  p(1, 2, 1, M.DIRT, 5);
  p(2, 2, 1, M.LEAF, 5);
  p(1, 2, 2, M.DIRT, 6);
  for (let x = 1; x <= 2; x++) for (let y = 1; y <= 2; y++) p(x, y, 3, M.METAL, 6);
  p(1, 2, 4, M.PAPER, 6);
  p(2, 2, 4, M.GOLD_ORE, 4);
  p(1, 1, 5, M.LAMP, 6);
  // a note held by a magnet on its side
  p(3, 1, 4, M.GOLD_ORE, 5);
  p(3, 1, 5, M.CLOTH, 6);
  const shut: number[] = [];
  const open: number[] = [];
  for (let h = 0; h <= 6; h++) {
    for (let x = 0; x <= 3; x++) {
      shut.push(v.idx(x0 + x, y0 + 3, z0 + h));
      p(x, 3, h, M.TILE, h === 6 ? 7 : x === 0 || x === 3 ? 5 : 6);
    }
    for (let y = 4; y <= 7; y++) open.push(v.idx(x0 + 4, y0 + y, z0 + h));
  }
  const handleShut = [3, 4].map((h) => v.idx(x0, y0 + 4, z0 + h));
  const handleOpen = [3, 4].map((h) => v.idx(x0 + 5, y0 + 7, z0 + h));
  for (const i of handleShut) v.set(i, M.METAL, 7);
  fx.fridge = { shut, open, handleShut, handleOpen, light: [x0 + 2, y0 + 5, z0 + 4] };
  // a pot plant on top
  for (let x = 1; x <= 2; x++) for (let y = 1; y <= 2; y++) p(x, y, 7, M.BRICK, 3);
  for (let x = 0; x <= 3; x++) {
    for (let y = 0; y <= 3; y++) {
      const d = Math.hypot(x - 1.5, y - 1.5);
      if (d < 2.2) p(x, y, 8, M.LEAF, (x * 3 + y) % 4 ? 4 : 1);
      if (d < 1.2) p(x, y, 9, M.LEAF, 6);
    }
  }
}

// The arcade: two cabinets side by side, marquees lit, attract mode on.
function buildArcade(v: Voxels, L: Layout, I: Isle, fx: Fixtures): void {
  const { x0, y0 } = I;
  const z0 = L.floor;
  const screens: number[][] = [];
  const lights: Array<[number, number, number]> = [];
  CABINETS.forEach((cx, k) => {
    const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + cx + x, y0 + y, z0 + h, m, s);
    for (let h = 0; h <= 12; h++) {
      for (let y = 0; y <= 2; y++) {
        for (let x = 0; x <= 3; x++) {
          const art = x === 3 && y < 2 && h > 0 && h < 12 && (h + y + k) % 4 < 2;
          p(x, y, h, art ? (k ? M.CARPET : M.CLOTH) : M.OBSIDIAN, art ? 7 : h === 12 || h === 10 ? 5 : 3);
        }
      }
    }
    for (let x = 0; x <= 3; x++) p(x, 3, 4, M.METAL, 5);
    p(0, 3, 5, M.METAL, 7);
    p(1, 3, 5, M.LED_RED, 7);
    p(2, 3, 5, k ? M.LED_AMBER : M.NEON_GREEN, 7);
    for (const h of [1, 2]) for (const x of [1, 2]) p(x, 2, h, M.METAL, 4);
    p(2, 2, 2, M.LED_AMBER, 5);
    for (let x = 0; x <= 3; x++) p(x, 2, 11, k ? M.NEON_CYAN : M.NEON_PINK, 7);
    const cells: number[] = [];
    for (let h = 9; h >= 6; h--) {
      for (let x = 0; x <= 3; x++) {
        p(x, 2, h, M.OBSIDIAN, 1);
        cells.push(v.idx(x0 + cx + x, y0 + 2, z0 + h));
      }
    }
    screens.push(cells);
    lights.push([x0 + cx + 2, y0 + 4, z0 + 8]);
  });
  fx.arcade = { screens, lights };
}

// The workbench: a pegboard of tools, an oscilloscope tracing a wave, a
// soldering iron smoking on its stand by a circuit board, a lamp.
function buildBench(v: Voxels, L: Layout, I: Isle, fx: Fixtures): void {
  const { x0, y0 } = I;
  const z0 = L.floor;
  const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + x, y0 + y, z0 + h, m, s);
  for (let h = 0; h <= 12; h++) for (let x = 0; x <= 9; x++) p(x, 0, h, M.WOOD, h > 0 && h % 2 === 0 && x % 2 === 1 ? 1 : 5);
  for (const [x, y] of [[0, 1], [9, 1], [0, 3], [9, 3]]) for (let h = 0; h < 4; h++) p(x, y, h, M.METAL, 2);
  for (let y = 1; y <= 3; y++) for (let x = 0; x <= 9; x++) p(x, y, 4, M.WOOD, 3);
  for (const [x, h, m] of [[2, 9, M.METAL], [2, 10, M.METAL], [4, 11, M.METAL], [5, 10, M.METAL], [6, 11, M.METAL], [7, 9, M.DIRT], [7, 10, M.DIRT]] as const) p(x, 1, h, m, 7);
  for (let h = 5; h <= 8; h++) for (let y = 1; y <= 2; y++) for (let x = 1; x <= 5; x++) p(x, y, h, M.METAL, 3);
  const scope: number[] = [];
  for (let h = 8; h >= 6; h--) {
    for (let x = 1; x <= 4; x++) {
      p(x, 2, h, M.OBSIDIAN, 1);
      scope.push(v.idx(x0 + x, y0 + 2, z0 + h));
    }
  }
  p(5, 2, 6, M.METAL, 7);
  p(5, 2, 7, M.LED_AMBER, 6);
  p(5, 2, 8, M.METAL, 7);
  p(6, 3, 5, M.CARPET, 7);
  p(7, 3, 5, M.CARPET, 6);
  p(8, 2, 5, M.METAL, 4);
  p(8, 3, 5, M.LED_AMBER, 7);
  for (let h = 5; h <= 10; h++) p(9, 1, h, M.METAL, 4);
  p(8, 1, 11, M.METAL, 5);
  p(8, 2, 11, M.METAL, 6);
  p(8, 2, 10, M.LAMP, 6);
  fx.lamps.push({ i: v.idx(x0 + 8, y0 + 2, z0 + 10), x: x0 + 8.5, y: y0 + 4, z: z0 + 8, color: WARM, radius: 14, intensity: 0.42, broken: false });
  fx.bench = { scope, tip: [x0 + 8, y0 + 3, z0 + 6] };
}

// The core: a server pillar out in front of the hub, LEDs racing up two
// faces, a glowing band and a beacon on top, monitors round its foot and a
// ring of lights set into the floor.
function buildCore(v: Voxels, L: Layout, P: Plan, I: Isle, seed: number, fx: Fixtures): void {
  const { x0, y0 } = I;
  const z0 = L.floor;
  const p = (x: number, y: number, h: number, m: number, s?: number) => v.put(x0 + x, y0 + y, z0 + h, m, s);
  const PH = clamp(P.top - 10, 16, 32);
  for (let y = 4; y <= 11; y++) for (let x = 4; x <= 11; x++) p(x, y, 0, M.METAL, 5);
  for (let h = 1; h < PH; h++) {
    for (let y = 5; y <= 10; y++) {
      for (let x = 5; x <= 10; x++) {
        const corner = (x === 5 || x === 10) && (y === 5 || y === 10);
        p(x, y, h, h === PH - 3 ? M.NEON_GREEN : M.METAL, h === PH - 3 ? 6 : corner ? 6 : 2);
      }
    }
  }
  // LEDs up the two faces the room sees
  for (let h = 2; h < PH - 4; h += 2) {
    for (let k = 6; k <= 9; k++) {
      for (const [x, y] of [[10, k], [k, 10]]) {
        const r = hash3(seed, x * 31 + y, h, 92);
        const on = r < 0.06 ? M.LED_RED : r < 0.22 ? M.LED_AMBER : M.NEON_GREEN;
        p(x, y, h, on, 7);
        fx.blinkers.push({ i: v.idx(x0 + x, y0 + y, z0 + h), on, period: 0.4 + hash3(seed, x, y + h, 93) * 1.8, phase: hash3(seed, h, x + y, 94) * 3, duty: 0.4 + hash3(seed, y, h, 95) * 0.5 });
      }
    }
  }
  for (let y = 6; y <= 9; y++) for (let x = 6; x <= 9; x++) p(x, y, PH, M.OBSIDIAN, 2);
  p(7, 7, PH + 1, M.METAL, 5);
  p(7, 7, PH + 2, M.LED_RED, 7);
  fx.blinkers.push({ i: v.idx(x0 + 7, y0 + 7, z0 + PH + 2), on: M.LED_RED, period: 1.6, phase: 0, duty: 0.3 });
  // monitors on stands, facing out
  const screen = (cells: Array<[number, number, number]>, ink: number) => {
    const out: number[] = [];
    for (const [x, y, h] of cells) {
      p(x, y, h, ink, 5);
      out.push(v.idx(x0 + x, y0 + y, z0 + h));
    }
    fx.screens.push({ cells: out, ink });
  };
  for (let h = 0; h < 4; h++) {
    p(13, 8, h, M.METAL, 4);
    p(8, 13, h, M.METAL, 4);
  }
  const right: Array<[number, number, number]> = [];
  const front: Array<[number, number, number]> = [];
  for (let h = 4; h <= 7; h++) {
    for (let k = 6; k <= 10; k++) {
      const rim = h === 4 || h === 7 || k === 6 || k === 10;
      if (rim) {
        p(13, k, h, M.OBSIDIAN, 4);
        p(k, 13, h, M.OBSIDIAN, 4);
      } else {
        right.push([13, k, h]);
        front.push([k, 13, h]);
      }
    }
  }
  screen(right, M.SCREEN);
  screen(front, M.NEON_GREEN);
  // the ring of floor lights
  for (let y = 0; y < CORE; y++) {
    for (let x = 0; x < CORE; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      if (d > 6.4 && d < 7.6 && (x + y) % 4 < 2) p(x, y, -1, M.NEON_GREEN, 4);
    }
  }
  fx.pools.push({ x: x0 + 8, y: y0 + 8, z: z0 + PH * 0.5, color: GREEN, radius: 30, intensity: 0.45 });
  fx.pools.push({ x: x0 + 12, y: y0 + 12, z: z0 + 5, color: CYAN, radius: 14, intensity: 0.3 });
}

// A desk pod: three desks side by side, each with a monitor, keyboard and
// office chair, a tower under the end desk.
function buildPod(v: Voxels, L: Layout, Z: Zone, seed: number, fx: Fixtures): void {
  const { p, i, at } = zoneFrame(v, L, Z);
  const inks = [M.NEON_GREEN, M.SCREEN, M.LED_AMBER];
  for (let k = 0; k < 3; k++) {
    const a0 = 6 * k;
    for (const [da, db] of [[0, 0], [4, 0], [0, 2], [4, 2]]) for (let h = 0; h < 4; h++) p(a0 + da, db, h, M.METAL, 2);
    for (let b = 0; b <= 2; b++) for (let a = a0; a <= a0 + 4; a++) p(a, b, 4, M.WOOD, b === 2 ? 6 : 4);
    for (let h = 5; h <= 8; h++) for (let a = a0; a <= a0 + 4; a++) p(a, 0, h, M.OBSIDIAN, 4);
    const ink = inks[(k + Z.k) % 3];
    const cells: number[] = [];
    for (let h = 6; h <= 7; h++) {
      for (let a = a0 + 1; a <= a0 + 3; a++) {
        p(a, 0, h, ink, 5);
        cells.push(i(a, 0, h));
      }
    }
    fx.screens.push({ cells, ink });
    for (let a = a0 + 1; a <= a0 + 3; a++) p(a, 1, 5, M.PLASTIC, 6);
    for (let a = a0 + 1; a <= a0 + 2; a++) {
      for (const b of [3, 4]) {
        p(a, b, 0, M.METAL, 2);
        p(a, b, 1, M.OBSIDIAN, 5);
      }
      for (let h = 0; h <= 3; h++) p(a, 5, h, M.OBSIDIAN, h === 3 ? 6 : 3);
    }
  }
  for (let h = 0; h <= 2; h++) for (const b of [0, 1]) p(15, b, h, M.PLASTIC, 2);
  p(15, 1, 2, M.NEON_GREEN, 6);
  fx.blinkers.push({ i: i(15, 1, 2), on: M.NEON_GREEN, period: 0.5 + hash3(seed, Z.k, 1, 96), phase: hash3(seed, Z.k, 2, 96) * 2, duty: 0.5 });
  const [x, y, z] = at(8.5, 3.5, 7);
  fx.pools.push({ x, y, z, color: [GREEN, CYAN, AMBER][Z.k % 3], radius: 16, intensity: 0.26 });
}

// A server cage: a wire-mesh fence round a steel floor, racks of blinking
// units and a UPS inside, the gate open.
function buildCage(v: Voxels, L: Layout, Z: Zone, seed: number, fx: Fixtures): void {
  const { p, i } = zoneFrame(v, L, Z);
  const TALL = 10;
  for (let b = 0; b <= 9; b++) {
    for (let a = 0; a <= 13; a++) {
      const edge = a === 0 || a === 13 || b === 0 || b === 9;
      if (!edge) {
        p(a, b, -1, M.METAL, 4);
        continue;
      }
      if (b === 9 && a >= 5 && a <= 7) continue; // the gate
      const post = (a % 4 === 0 && (b === 0 || b === 9)) || (b % 3 === 0 && (a === 0 || a === 13)) || ((a === 0 || a === 13) && (b === 0 || b === 9));
      for (let h = 0; h < TALL; h++) {
        if (post || h === 0 || h === TALL - 1) p(a, b, h, M.METAL, post ? 5 : 4);
        else if (h % 3 === 0 || (a + b) % 3 === 0) p(a, b, h, M.METAL, 2);
      }
    }
  }
  for (const a0 of [2, 6]) {
    for (let h = 0; h < 8; h++) for (let b = 2; b <= 4; b++) for (let a = a0; a <= a0 + 2; a++) p(a, b, h, M.METAL, b === 4 ? (h & 1 ? 5 : 3) : 1);
    for (let h = 1; h < 8; h += 2) {
      for (const a of [a0 + ((h >> 1) & 1)]) {
        const r = hash3(seed, Z.k * 13 + a, h, 97);
        const on = r < 0.08 ? M.LED_RED : r < 0.3 ? M.LED_AMBER : M.NEON_GREEN;
        p(a, 4, h, on, 7);
        fx.blinkers.push({ i: i(a, 4, h), on, period: 0.5 + hash3(seed, a, h, 98) * 2, phase: hash3(seed, h, a, 99) * 3, duty: 0.35 + hash3(seed, a + h, Z.k, 100) * 0.5 });
      }
    }
  }
  for (let h = 0; h < 4; h++) for (let b = 2; b <= 3; b++) for (let a = 10; a <= 11; a++) p(a, b, h, M.OBSIDIAN, h === 3 ? 5 : 3);
  p(10, 3, 2, M.LED_AMBER, 6);
}

// A couch corner: a rug, a sofa facing a low table of snacks and a laptop,
// a beanbag at the side, a floor lamp.
function buildCouch(v: Voxels, L: Layout, Z: Zone, seed: number, fx: Fixtures): void {
  const { p, at } = zoneFrame(v, L, Z);
  const cloth = Z.k & 1 ? M.CARPET : M.CLOTH;
  const rug = Z.k & 1 ? M.BRICK : M.CARPET;
  for (let b = 1; b <= 10; b++) for (let a = 1; a <= 12; a++) p(a, b, -1, rug, a === 1 || a === 12 || b === 1 || b === 10 ? 6 : 2);
  for (let a = 1; a <= 12; a++) {
    for (let b = 9; b <= 11; b++) {
      const top = b === 11 ? 4 : a === 1 || a === 12 ? 3 : 2;
      for (let h = 0; h < top; h++) p(a, b, h, cloth, h === top - 1 ? 6 : h ? 3 : 1);
    }
  }
  for (const [a, b] of [[5, 4], [9, 4], [5, 6], [9, 6]]) p(a, b, 0, M.WOOD, 2);
  for (let b = 4; b <= 6; b++) for (let a = 5; a <= 9; a++) p(a, b, 1, M.WOOD, 4);
  p(6, 5, 2, M.DIRT, 5);
  p(6, 5, 3, M.METAL, 7);
  for (let a = 7; a <= 9; a++) p(a, 5, 2, M.METAL, 3);
  p(8, 4, 2, M.PLASTIC, 6);
  for (let a = 7; a <= 9; a++) p(a, 5, 3, M.SCREEN, 4);
  const [bx, by] = zoneXY(Z, 2.5, 4.5);
  const [fa, fb] = Z.flip ? [0, 1] : [1, 0];
  beanbag(v, bx, by, L.floor, fa, fb, 2.3, cloth === M.CLOTH ? M.CARPET : M.CLOTH);
  p(13, 0, 0, M.METAL, 3);
  for (let h = 1; h <= 10; h++) p(13, 0, h, M.METAL, 4);
  p(13, 0, 11, M.LAMP, 6);
  p(13, 0, 12, M.METAL, 6);
  const [x, y, z] = at(12, 2, 9);
  fx.pools.push({ x, y, z, color: WARM, radius: 18, intensity: 0.32 });
}

// A heap of dead hardware: cardboard boxes, old monitors, a tower on its
// side, a keyboard; the first heap has one CRT that still flickers.
function buildJunk(v: Voxels, L: Layout, Z: Zone, seed: number, fx: Fixtures): void {
  const { p, i, at } = zoneFrame(v, L, Z);
  const box = (ba: number, bb: number, bh: number, w: number, d: number, t: number, m: number, s: number) => {
    for (let h = bh; h < bh + t; h++) {
      for (let b = bb; b < bb + d; b++) {
        for (let a = ba; a < ba + w; a++) {
          const edge = +(a === ba || a === ba + w - 1) + +(b === bb || b === bb + d - 1) + +(h === bh || h === bh + t - 1) >= 2;
          p(a, b, h, m, edge ? s - 2 : s);
        }
      }
    }
  };
  const crates = hash3(seed, Z.k, 3, 101) < 0.4;
  box(0, 0, 0, 3, 3, 3, M.WOOD, crates ? 4 : 7);
  box(0, 1, 3, 3, 2, 2, M.WOOD, crates ? 3 : 6);
  p(1, 1, 5, M.PAPER, 6);
  if (crates) {
    box(4, 0, 0, 4, 3, 3, M.WOOD, 4);
    box(4, 3, 0, 3, 3, 2, M.WOOD, 5);
    return;
  }
  box(3, 0, 0, 4, 3, 4, M.PLASTIC, 4);
  const screen: number[] = [];
  for (let h = 1; h <= 2; h++) {
    for (let a = 4; a <= 5; a++) {
      p(a, 2, h, M.OBSIDIAN, 2);
      screen.push(i(a, 2, h));
    }
  }
  box(4, 0, 4, 3, 2, 2, M.PLASTIC, 3);
  for (let a = 3; a <= 6; a++) p(a, 4, 0, M.METAL, a === 6 ? 6 : 3);
  for (let a = 4; a <= 6; a++) p(a, 3, 0, M.METAL, 2);
  for (let b = 3; b <= 5; b++) p(7, b, 0, M.PLASTIC, 6);
  p(1, 4, 0, M.CARPET, 6);
  p(2, 4, 0, M.CARPET, 6);
  p(1, 5, 0, M.CARPET, 6);
  if (!fx.junk) {
    fx.junk = { screen, light: at(5, 4, 2) };
    p(4, 2, 1, M.NEON_GREEN, 5);
  } else {
    fx.screens.push({ cells: screen, ink: M.LED_AMBER });
  }
}

// Plants under a purple grow light on a low table.
function buildGrow(v: Voxels, L: Layout, Z: Zone, seed: number): void {
  const { p } = zoneFrame(v, L, Z);
  for (const [a, b] of [[0, 0], [6, 0], [0, 2], [6, 2]]) for (let h = 0; h < 2; h++) p(a, b, h, M.METAL, 2);
  for (let b = 0; b <= 2; b++) for (let a = 0; a <= 6; a++) p(a, b, 2, M.WOOD, 4);
  for (const a of [1, 3, 5]) {
    p(a, 1, 3, M.BRICK, 3);
    for (let h = 4; h <= 5 + (hash3(seed, Z.k, a, 102) < 0.5 ? 1 : 0); h++) p(a, 1, h, M.LEAF, h & 1 ? 4 : 6);
    for (const [da, db] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) if (hash3(seed, a + da, db, Z.k) < 0.7) p(a + da, 1 + db, 5, M.LEAF, 3);
  }
  for (const a of [0, 6]) for (let h = 3; h <= 9; h++) p(a, 1, h, M.METAL, 4);
  for (let a = 2; a <= 4; a++) p(a, 1, 9, M.NEON_PURPLE, 4);
  for (const a of [1, 5]) p(a, 1, 9, M.METAL, 5);
}

// A whiteboard on wheels, scrawled with diagrams.
function buildBoard(v: Voxels, L: Layout, Z: Zone, seed: number): void {
  const { p } = zoneFrame(v, L, Z);
  for (const a of [0, 8]) {
    for (let b = 0; b <= 2; b++) p(a, b, 0, M.METAL, 3);
    for (let h = 1; h <= 10; h++) p(a, 1, h, M.METAL, 4);
  }
  for (let h = 3; h <= 9; h++) for (let a = 1; a <= 7; a++) p(a, 1, h, M.TILE, 7);
  const INK = [M.OBSIDIAN, M.DIRT, M.CARPET];
  for (const h of [8, 6, 4]) {
    const a0 = 1 + Math.floor(hash3(seed, Z.k, h, 103) * 3);
    const a1 = Math.min(7, a0 + 2 + Math.floor(hash3(seed, Z.k, h, 104) * 4));
    const ink = INK[Math.floor(hash3(seed, Z.k, h, 105) * 3)];
    for (let a = a0; a <= a1; a++) p(a, 1, h, ink, 3);
  }
  p(6, 1, 7, M.DIRT, 3); // a circled word
  p(7, 1, 2, M.METAL, 6); // the marker tray
  for (let a = 1; a <= 7; a++) p(a, 1, 2, M.METAL, 5);
}

const ZONE_BUILD: Record<ZoneKind, (v: Voxels, L: Layout, Z: Zone, seed: number, fx: Fixtures) => void> = {
  pod: buildPod,
  cage: buildCage,
  couch: buildCouch,
  junk: buildJunk,
  grow: buildGrow,
  board: buildBoard,
};

// Cable trays across the open floor, island to island in a chain: a steel
// channel round a bundle of cables, each leg an L over floor nothing else
// needs, ducking under whatever stands at either end.
function trays(v: Voxels, L: Layout, keep: Uint8Array, isles: readonly Isle[]): void {
  const { W, floor } = L;
  const inside = (I: Isle, x: number, y: number) => x >= I.x0 && x < I.x0 + I.w && y >= I.y0 && y < I.y0 + I.d;
  const free = (x: number, y: number) => !keep[x + W * y] && v.get(x, y, floor) === M.AIR && v.get(x, y, floor + 1) === M.AIR && v.get(x, y, floor - 1) !== M.AIR;
  const mid = (I: Isle) => ({ x: I.x0 + (I.w >> 1), y: I.y0 + (I.d >> 1) });
  // a chain: from the first island, always on to the nearest one not yet joined
  const left = isles.slice(1);
  const order = isles.length ? [isles[0]] : [];
  while (left.length) {
    const at = mid(order[order.length - 1]);
    let k = 0;
    for (let j = 1; j < left.length; j++) if (Math.hypot(mid(left[j]).x - at.x, mid(left[j]).y - at.y) < Math.hypot(mid(left[k]).x - at.x, mid(left[k]).y - at.y)) k = j;
    order.push(left.splice(k, 1)[0]);
  }
  const BUNDLE = [M.OBSIDIAN, M.CARPET, M.CLOTH];
  for (let n = 0; n + 1 < order.length; n++) {
    const A = order[n];
    const B = order[n + 1];
    const a = mid(A);
    const b = mid(B);
    if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 70) continue;
    for (const corner of [{ x: b.x, y: a.y }, { x: a.x, y: b.y }]) {
      // the tray's centre line and, either side of it, its walls
      const cells: Array<[number, number, boolean]> = [];
      let ok = true;
      for (const [p, q] of [[a, corner], [corner, b]]) {
        const sx = Math.sign(q.x - p.x);
        const sy = Math.sign(q.y - p.y);
        const n2 = Math.abs(q.x - p.x) + Math.abs(q.y - p.y);
        for (let k = 0; k <= n2 && ok; k++) {
          const x = p.x + sx * k;
          const y = p.y + sy * k;
          for (const o of [-1, 0, 1]) {
            const cx = sy ? x + o : x;
            const cy = sx ? y + o : y;
            if (inside(A, cx, cy) || inside(B, cx, cy)) continue;
            if (!free(cx, cy)) ok = false;
            cells.push([cx, cy, o === 0]);
          }
        }
      }
      if (!ok || !cells.length) continue;
      for (const [x, y, core] of cells) if (v.get(x, y, floor) === M.AIR) v.put(x, y, floor, core ? BUNDLE[(x + y) % 3 === 0 ? 1 + (n & 1) : 0] : M.METAL, core ? 4 : 5);
      break;
    }
  }
}

// Odds and ends for the floor between the zones: every 16-voxel bay that
// still stands bare gets one small thing where the floor round it is free,
// a router or UPS blinking on the floor, a standing lamp, a pot plant, a
// bin or a pile of pizza boxes.
function scatter(v: Voxels, L: Layout, keep: Uint8Array, isles: readonly Isle[], seed: number, fx: Fixtures): void {
  const { W, D, T, floor } = L;
  const near = (x: number, y: number) => isles.some((I) => x >= I.x0 - 2 && y >= I.y0 - 2 && x < I.x0 + I.w + 2 && y < I.y0 + I.d + 2);
  const free = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < T + 2 || yy < T + 2 || xx >= W - 2 || yy >= D - 2 || keep[xx + W * yy]) return false;
        if (v.get(xx, yy, floor) !== M.AIR || v.get(xx, yy, floor + 1) !== M.AIR) return false;
      }
    }
    return !near(x, y);
  };
  const bare = (x0: number, y0: number) => {
    for (let y = y0; y < Math.min(D, y0 + 16); y++) {
      for (let x = x0; x < Math.min(W, x0 + 16); x++) if (v.get(x, y, floor + 2) !== M.AIR) return false;
    }
    return true;
  };
  for (let y0 = T; y0 < D - 8; y0 += 16) {
    for (let x0 = T; x0 < W - 8; x0 += 16) {
      if (!bare(x0, y0)) continue;
      let spot: [number, number] | null = null;
      for (let k = 0; k < 40 && !spot; k++) {
        const x = x0 + 2 + Math.floor(hash3(seed, x0, y0, 110 + k) * 12);
        const y = y0 + 2 + Math.floor(hash3(seed, y0, x0, 160 + k) * 12);
        if (free(x, y)) spot = [x, y];
      }
      if (!spot) continue;
      const [x, y] = spot;
      const p = (dx: number, dy: number, h: number, m: number, s?: number) => v.put(x + dx, y + dy, floor + h, m, s);
      const r = hash3(seed, x, y, 111);
      if (r < 0.45) {
        // a router or a UPS on the floor, its lights blinking
        const ups = r < 0.2;
        for (let h = 0; h <= 1; h++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p(dx, dy, h, ups ? M.OBSIDIAN : M.PLASTIC, h ? 4 : 2);
        for (const [dx, dy, k] of [[1, 1, 0], [0, 1, 1]] as const) {
          const on = ups ? M.LED_AMBER : M.NEON_GREEN;
          p(dx, dy, 1, on, 7);
          fx.blinkers.push({ i: v.idx(x + dx, y + dy, floor + 1), on, period: 0.3 + hash3(seed, x, k, 113) * 1.5, phase: hash3(seed, y, k, 114) * 2, duty: 0.5 });
        }
      } else if (r < 0.6) {
        // a standing lamp
        p(0, 0, 0, M.METAL, 3);
        for (let h = 1; h <= 8; h++) p(0, 0, h, M.METAL, 4);
        p(0, 0, 9, M.LAMP, 6);
        p(0, 0, 10, M.METAL, 6);
        fx.pools.push({ x: x + 0.5, y: y + 0.5, z: floor + 8, color: WARM, radius: 14, intensity: 0.26 });
      } else if (r < 0.8) {
        p(0, 0, 0, M.BRICK, 3);
        p(0, 0, 1, M.BRICK, 5);
        for (let h = 2; h <= 4; h++) p(0, 0, h, M.LEAF, h & 1 ? 3 : 5);
        for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0]]) if (hash3(seed, x + dx, y + dy, 112) < 0.7) p(dx, dy, 3, M.LEAF, 4);
      } else if (r < 0.92) {
        for (let h = 0; h <= 2; h++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p(dx, dy, h, M.METAL, h === 2 ? 6 : 3);
        p(0, 0, 3, M.PAPER, 7);
      } else {
        for (let h = 0; h <= 3; h++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) p(dx, dy, h, M.PLASTIC, h & 1 ? 5 : 6);
        p(1, 1, 3, M.DIRT, 5);
      }
    }
  }
}

// Where the pipe run drips: under the pipes, over open floor nothing needs.
function leakSpot(v: Voxels, L: Layout, P: Plan, keep: Uint8Array, rng: Rng): [number, number, number] | null {
  const spots: Array<[number, number, number]> = [];
  for (const wall of SIDES) {
    for (const [g0, g1] of wallGaps(L, wall)) {
      if (g0 === L.T) continue;
      for (let a = g0; a < g1; a++) {
        const [x, y] = onWall(L, wall, a, 2);
        if (keep[x + L.W * y]) continue;
        let free = true;
        for (let h = 0; h < P.pipe && free; h++) free = v.get(x, y, L.floor + h) === M.AIR;
        if (free) spots.push([x + 0.5, y + 0.5, L.floor + P.pipe - 0.3]);
      }
    }
  }
  return spots.length ? rng.pick(spots) : null;
}

// Paper everywhere nothing else needs the floor: loose sheets, crumpled
// balls.
function litter(v: Voxels, L: Layout, rng: Rng, keep: Uint8Array, isles: ReadonlyArray<Isle | null>): void {
  const { W, D, T, floor } = L;
  const inIsle = (x: number, y: number) => isles.some((I) => I && x >= I.x0 - 1 && y >= I.y0 - 1 && x <= I.x0 + I.w && y <= I.y0 + I.d);
  const open = (x: number, y: number) => x >= T + 1 && y >= T + 1 && x < W - 1 && y < D - 1 && !keep[x + W * y] && !inIsle(x, y) && v.get(x, y, floor) === M.AIR;
  for (let k = Math.round((W * D) / 700); k > 0; k--) {
    const x = rng.int(T + 1, W - 2);
    const y = rng.int(T + 1, D - 2);
    if (!open(x, y)) continue;
    v.put(x, y, floor, M.PAPER, rng.int(4, 7));
    if (rng.chance(0.5)) {
      const [dx, dy] = rng.pick([[1, 0], [0, 1], [-1, 0], [0, -1]] as const);
      if (open(x + dx, y + dy)) v.put(x + dx, y + dy, floor, M.PAPER, rng.int(3, 6));
    }
  }
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const fx = FIXTURES.get(c.v);
  if (!fx) return;
  const v = c.v;
  const WD = L.W * L.D;

  // Matrix rain down the panels.
  for (const col of fx.rain) {
    const headAt = (t: number) => col.n - 1 - Math.floor((((t * col.speed + col.phase) % col.cycle) + col.cycle) % col.cycle);
    const head = headAt(c.t);
    const prev = headAt(c.t - c.dt);
    const lo = Math.max(0, head - 1);
    const hi = Math.min(col.n - 1, Math.max(prev, head) + col.tail + 1);
    const epoch = Math.floor(c.t * 2 + col.k * 0.37);
    for (let r = lo; r <= hi; r++) {
      const i = col.i0 + r * WD;
      if (!PIXEL[v.mat[i]]) continue;
      const d = r - head;
      let m: number = M.OBSIDIAN;
      let s = 1;
      if (d === 0) {
        m = M.NEON_GREEN;
        s = 7;
      } else if (d > 0 && d < col.tail && hash3(col.k, r, epoch, 3) >= 0.15 + (0.45 * d) / col.tail) {
        if (d < 3 || d < col.tail * 0.35) {
          m = M.NEON_GREEN;
          s = d < 2 ? 4 : 1;
        } else {
          m = M.FUNGUS;
          s = Math.max(0, 7 - Math.floor((8 * d) / col.tail));
        }
      }
      v.set(i, m, s);
    }
  }

  // The neon stutters; the cursor blinks.
  if (fx.sign) {
    const stutter = Math.floor(c.t * 9);
    const dead = hash3(stutter, 66, 0, 1) > 0.97 ? Math.floor(hash3(stutter, 67, 0, 1) * 4) : hash3(Math.floor(c.t * 3), 68, 0, 1) > 0.93 ? 2 : -1;
    for (const [i, g] of fx.sign.cells) px(v, i, g === dead ? M.OBSIDIAN : M.NEON_PINK, g === dead ? 3 : 7);
    const on = Math.floor(c.t * 2) % 2 === 0;
    for (const i of fx.sign.cursor) px(v, i, on ? M.NEON_GREEN : M.OBSIDIAN, on ? 7 : 3);
    const [x, y, z] = fx.sign.light;
    c.light({ x, y, z, color: PINK, radius: 22, intensity: dead >= 0 ? 0.32 : 0.45 });
  }

  // The clock keeps the time, its colon blinking.
  if (fx.clock) {
    const now = new Date();
    const hh = now.getHours();
    const mm = now.getMinutes();
    const digits = [Math.floor(hh / 10), hh % 10, Math.floor(mm / 10), mm % 10];
    const colon = Math.floor(c.t) % 2 === 0;
    for (let col = 0; col < 17; col++) {
      for (let row = 0; row < 5; row++) {
        const i = fx.clock.cells[col * 5 + row];
        let on = false;
        let ghost = false;
        if (col === 8) on = colon && (row === 1 || row === 3);
        else if (col < 8 || col >= 10) {
          const slot = col < 8 ? Math.floor(col / 4) : 2 + Math.floor((col - 10) / 4);
          const cc = col < 8 ? col % 4 : (col - 10) % 4;
          if (cc < 3) {
            on = lit(DIGITS[digits[slot]], cc, row);
            ghost = lit(DIGITS[8], cc, row);
          }
        }
        px(v, i, on ? M.LED_AMBER : M.OBSIDIAN, on ? 7 : ghost ? 5 : 2);
      }
    }
    const [x, y, z] = fx.clock.light;
    c.light({ x, y, z, color: AMBER, radius: 10, intensity: 0.3 });
  }

  // Fuse-box lights blink, each to its own beat.
  for (const b of fx.blinkers) {
    const on = (c.t + b.phase) % b.period < b.period * b.duty;
    px(v, b.i, on ? b.on : M.OBSIDIAN, on ? 7 : 1);
  }

  // Pong on the TV.
  if (fx.tv) {
    const bx = 1 + Math.round(tri(c.t * 7, 9));
    const by = Math.round(tri(c.t * 4.3, 6));
    const pl = clamp(Math.round(tri((c.t - 0.25) * 4.3, 6)), 1, 5);
    const pr = clamp(Math.round(tri((c.t - 0.4) * 4.3, 6)), 1, 5);
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 12; col++) {
        const i = fx.tv.cells[row * 12 + col];
        let m: number = M.OBSIDIAN;
        let s = 1;
        if (col === bx && row === by) [m, s] = [M.NEON_GREEN, 7];
        else if ((col === 0 && Math.abs(row - pl) <= 1) || (col === 11 && Math.abs(row - pr) <= 1)) [m, s] = [M.SCREEN, 6];
        else if (col === 6 && row % 2 === 0) [m, s] = [M.FUNGUS, 2];
        px(v, i, m, s);
      }
    }
    const [x, y, z] = fx.tv.light;
    c.light({ x, y, z, color: CYAN, radius: 18, intensity: 0.42 + 0.04 * Math.sin(c.t * 13) });
  }

  // Wax blobs rise and fall in the lava lamp (sealed in glass, so only its
  // own cells change).
  if (fx.lava) {
    const blobs = [0, 1, 2].map((k) => ({
      h: 8.6 * (0.5 - 0.5 * Math.cos(c.t * (0.42 + k * 0.17) + k * 2.1)) + 0.3,
      dx: 0.6 * Math.sin(c.t * 0.3 + k * 1.7),
      dy: 0.6 * Math.cos(c.t * 0.23 + k * 2.3),
      r: 1.15 + 0.35 * Math.sin(c.t * 0.5 + k),
    }));
    let top = 0;
    for (const [i, dx, dy, h] of fx.lava.cells) {
      const m = v.mat[i];
      if (m !== M.WATER && m !== M.POTION && m !== M.AIR) continue;
      let wax = h === 0;
      for (const b of blobs) if ((dx - b.dx) ** 2 + (dy - b.dy) ** 2 + ((h - b.h) * 0.8) ** 2 <= b.r * b.r) wax = true;
      if (wax) top = Math.max(top, h);
      v.set(i, wax ? M.POTION : M.WATER, wax ? 6 : 3);
    }
    c.light({ x: fx.lava.x, y: fx.lava.y, z: fx.lava.z + top + 0.5, color: PURPLE, radius: 16, intensity: 0.5 });
    c.light({ x: fx.lava.x, y: fx.lava.y, z: fx.lava.z, color: WARM, radius: 8, intensity: 0.3 });
  }

  // Lamps burn steady, but one stutters.
  for (const l of fx.lamps) {
    const m = v.mat[l.i];
    if (m !== M.LAMP && m !== M.OBSIDIAN) continue;
    const on = !l.broken || (c.t + l.x) % 6 > 1.3 || Math.sin(c.t * 37) * Math.sin(c.t * 13 + l.y) > 0.2;
    if (l.broken) v.set(l.i, on ? M.LAMP : M.OBSIDIAN, on ? 7 : 2);
    if (on) c.light({ x: l.x, y: l.y, z: l.z, color: l.color, radius: l.radius, intensity: l.intensity });
  }

  // Attract mode on the arcade: invaders marching, blocks falling.
  if (fx.arcade) {
    const [inv, blk] = fx.arcade.screens;
    const march = Math.floor(c.t * 2) % 2;
    const ship = Math.round(tri(c.t * 1.6, 3));
    const shot = 1 + (Math.floor(c.t * 6) % 2);
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let m: number = M.OBSIDIAN;
        let sh = 1;
        if (row === 0 && (col + march) % 2 === 0) [m, sh] = [M.NEON_GREEN, 6];
        else if (row === 3 && col === ship) [m, sh] = [M.SCREEN, 7];
        else if (row === shot && col === ship) [m, sh] = [M.LED_AMBER, 7];
        px(v, inv[row * 4 + col], m, sh);
      }
    }
    const drop = Math.floor(c.t / 1.5);
    const fall = Math.floor(((c.t / 1.5) % 1) * 3);
    const at0 = Math.floor(hash3(drop, 71, 0, 1) * 3);
    const gap = drop % 4;
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 4; col++) {
        let m: number = M.OBSIDIAN;
        let sh = 1;
        if (row === 3 && col !== gap) [m, sh] = [M.LED_AMBER, 5];
        else if (row === fall && (col === at0 || col === at0 + 1)) [m, sh] = [M.NEON_PINK, 7];
        px(v, blk[row * 4 + col], m, sh);
      }
    }
    const [a, b] = fx.arcade.lights;
    c.light({ x: a[0], y: a[1], z: a[2], color: GREEN, radius: 12, intensity: 0.4 });
    c.light({ x: b[0], y: b[1], z: b[2], color: AMBER, radius: 12, intensity: 0.4 });
    c.light({ x: a[0], y: a[1] - 1, z: a[2] + 3, color: PINK, radius: 10, intensity: 0.3 });
    c.light({ x: b[0], y: b[1] - 1, z: b[2] + 3, color: CYAN, radius: 10, intensity: 0.3 });
  }

  // The scope traces a wave; the soldering iron smokes.
  if (fx.bench) {
    for (let col = 0; col < 4; col++) {
      const want = Math.round(1 - Math.sin(c.t * 5 + col * 1.4));
      for (let row = 0; row < 3; row++) px(v, fx.bench.scope[row * 4 + col], row === want ? M.NEON_GREEN : M.OBSIDIAN, row === want ? 7 : 1);
    }
    const [x, y, z] = fx.bench.tip;
    if (c.rng.chance(c.dt * 0.8)) puff(c, x, y, z, M.SMOKE, 24);
    c.light({ x: x - 4.5, y: y + 0.5, z: z + 1, color: GREEN, radius: 8, intensity: 0.3 });
  }

  // Screens out on the floor flicker; the zones' lights.
  for (const sc of fx.screens) {
    if (!c.rng.chance(c.dt * 5)) continue;
    const i = sc.cells[c.rng.int(0, sc.cells.length - 1)];
    const on = c.rng.chance(0.6);
    px(v, i, on ? sc.ink : M.OBSIDIAN, on ? c.rng.int(4, 7) : 2);
  }
  for (const l of fx.pools) c.light(l);

  // The dead CRT on the junk heap still flickers.
  if (fx.junk) {
    const live = hash3(Math.floor(c.t * 4), 81, 0, 1) > 0.3;
    for (const i of fx.junk.screen) {
      const on = live && hash3(i, Math.floor(c.t * 8), 82, 1) < 0.6;
      px(v, i, on ? M.NEON_GREEN : M.OBSIDIAN, on ? 5 : 2);
    }
    const [x, y, z] = fx.junk.light;
    if (live) c.light({ x, y, z, color: GREEN, radius: 10, intensity: 0.3 });
  }

  // The fridge door swings open now and then: its light comes on.
  if (fx.fridge) {
    const f = fx.fridge;
    const want = (c.t + 7) % 23 < 2.6;
    const isOpen = v.mat[f.open[0]] === M.TILE;
    if (want !== isOpen) {
      const from = want ? f.shut : f.open;
      const to = want ? f.open : f.shut;
      const hFrom = want ? f.handleShut : f.handleOpen;
      const hTo = want ? f.handleOpen : f.handleShut;
      if (to.every((i) => v.mat[i] === M.AIR || v.mat[i] === M.TILE) && hTo.every((i) => v.mat[i] === M.AIR || v.mat[i] === M.METAL)) {
        for (const i of from) if (v.mat[i] === M.TILE) v.set(i, M.AIR, 0, 0);
        for (const i of hFrom) if (v.mat[i] === M.METAL) v.set(i, M.AIR, 0, 0);
        for (const i of to) v.set(i, M.TILE, 6);
        for (const i of hTo) v.set(i, M.METAL, 7);
      }
    }
    if (v.mat[f.open[0]] === M.TILE) {
      const [x, y, z] = f.light;
      c.light({ x, y, z, color: COLD, radius: 14, intensity: 0.6 });
    }
  }

  // Coffee steams; the microwave blinks 12:00.
  if (fx.brew && c.rng.chance(c.dt * 0.9)) {
    const [x, y, z] = fx.brew;
    puff(c, Math.floor(x), Math.floor(y), Math.floor(z), M.STEAM, 26);
  }
  if (fx.oven !== null) {
    const on = c.t % 1 < 0.5;
    px(v, fx.oven, on ? M.LED_AMBER : M.OBSIDIAN, on ? 7 : 2);
  }

  // A joint in the pipe run drips.
  if (fx.leak && c.rng.chance(c.dt * 0.4)) {
    const [x, y, z] = fx.leak;
    c.spawn({ kind: 'drop', x, y, z, vx: 0, vy: 0, vz: 0, life: 4, color: [90, 140, 190], glow: false, gravity: 30, mat: M.WATER });
  }
}

const BUILD: BuildStyle = { mats: [M.METAL, M.SCREEN, M.PLASTIC, M.LED_RED], shape: 'tower' };

export const den: Biome = {
  id: 'den',
  name: "Hacker's Den",
  tagline: 'Green rain on the walls, servers humming, pizza going cold',
  palette: PALETTE,
  backdrop: hex('#020403'),
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  costume: 'hacker',
  finale: { colors: [[90, 255, 130], [40, 200, 90], [200, 255, 210]], glow: true, gravity: 16 }, // green bits, gone where it lands
  build: BUILD,
  pois,
};

export default den;
