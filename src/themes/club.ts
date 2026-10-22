import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import type { Box } from '../iso/box.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import { CLEAR } from '../iso/canvas.ts';
import type { Room } from '../iso/room.ts';
import { localToScreen, wallToScreen } from '../iso/room.ts';
import type { IsoStation, IsoTheme, Palette, RoomLight } from './types.ts';
import { frac, noise, pulse } from './art.ts';

const P: Palette = {
  bg: hex('#06030a'),
  wall: hex('#2a1538'),
  wall2: hex('#21102e'),
  floor: hex('#1d1029'),
  floor2: hex('#150b1f'),
  text: hex('#f3e8ff'),
  dim: hex('#8b78a8'),
  accent: hex('#ff3cac'),
  accent2: hex('#21e6ff'),
  panel: hex('#120a1c'),
  panelText: hex('#f5e9ff'),
  border: hex('#a45bff'),
  bubble: hex('#fde9ff'),
  bubbleText: hex('#1b0b26'),
  good: hex('#b6ff3b'),
  warn: hex('#ffb547'),
  bad: hex('#ff3b5c'),
};

type Paint = NonNullable<Box['paint']>;

// ── the beat: 128 BPM, everything pulses on it ───────────────────────────
const BEAT = 60 / 128;
const KL = 6; // brightness steps of the kick envelope
const beatOf = (t: number): number => Math.floor(t / BEAT);
const kick = (t: number): number => {
  const p = frac(t / BEAT);
  return (1 - p) * (1 - p) * (1 - p);
};
const kickLevel = (t: number): number => Math.min(KL - 1, Math.floor(kick(t) * KL));
const ramp = (a: RGB, b: RGB, n: number): RGB[] => Array.from({ length: n }, (_, i) => mix(a, b, i / (n - 1)));
const wrap5 = (n: number): number => ((n % 5) + 5) % 5;

const BLACK = hex('#000000');
const WHITE = hex('#ffffff');
const PINK = hex('#ff3cac');
const CYAN = hex('#21e6ff');
const LIME = hex('#b6ff3b');
const AMBER = hex('#ffb547');
const VIOLET = hex('#a45bff');
const RED = hex('#ff2a5f');
const NEON: readonly RGB[] = [PINK, CYAN, LIME, VIOLET, AMBER];
const NEON_DIM = NEON.map((n) => mix(hex('#140a1c'), n, 0.42));

const C = {
  // floor
  tile: hex('#1d1128'),
  tileRim: hex('#160c20'),
  grout: hex('#0a0510'),
  seam: hex('#0b0612'),
  // walls
  mortar: hex('#120918'),
  base: hex('#0d0814'),
  trim: hex('#0b0611'),
  trimHi: hex('#2c1a3a'),
  shadow: hex('#100817'),
  // speakers
  cab: hex('#16121c'),
  cabEdge: hex('#3a3049'),
  tower: hex('#3d3350'),
  cone: hex('#241e2e'),
  surround: hex('#0b0910'),
  cap: hex('#b4a8c8'),
  // DJ booth
  booth: hex('#2e2140'),
  ledOff: hex('#1a1024'),
  deck: hex('#a8a2b8'),
  vinyl: hex('#0f0c14'),
  vinylHi: hex('#5d5470'),
  mixer: hex('#2a2235'),
  chrome: hex('#d4cfe0'),
  chromeDark: hex('#7a7490'),
  screen: hex('#0b0a1a'),
  // VIP booth
  velvet: hex('#a01e5c'),
  velvetDark: hex('#62113a'),
  velvetHi: hex('#c8417f'),
  button: hex('#4d0b2b'),
  gold: hex('#e7b552'),
  table: hex('#2a1f35'),
  card: hex('#ffe6a8'),
  cardDim: hex('#cf9f50'),
  ink: hex('#7a4512'),
  silver: hex('#b8b2c8'),
  bottle: hex('#2f9d5a'),
  bottleHi: hex('#8fe0a8'),
  // crates
  crateA: hex('#d0386a'),
  crateB: hex('#2a9ec8'),
  crateC: hex('#8a4fd8'),
  crateIn: hex('#0e0914'),
  // phone booth
  boothFrame: hex('#4a2a66'),
  glass: hex('#123a4a'),
  glassLit: hex('#2a7f96'),
  glassHi: hex('#6fc7d8'),
  phone: hex('#0e0a14'),
  roof: hex('#2a1838'),
  // lighting desk
  steel: hex('#5d5775'),
  consoleDark: hex('#16121d'),
  fixture: hex('#2f2a38'),
  // stage
  curtain: hex('#b3194a'),
  curtainDark: hex('#6e0d2c'),
  stage: hex('#6b4a30'),
  board: hex('#3a281b'),
  stageLit: hex('#ffe3ad'),
  mic: hex('#3b3646'),
  spot: hex('#ffe9c0'),
  // bar
  shelf: hex('#2c1b14'),
  shelfBoard: hex('#5a3a26'),
  counter: hex('#6a3f28'),
  counterTop: hex('#24161c'),
  rail: hex('#e0ad4a'),
  glassPink: hex('#ff5fa8'),
  glassLime: hex('#c6ff6b'),
  // door
  doorFrame: hex('#4a4258'),
  doorFrameHi: hex('#6d6383'),
  doorLeaf: hex('#5a1846'),
  doorLeafDark: hex('#3c0f2f'),
  // disco ball
  wire: hex('#3a3346'),
  ballHi: hex('#f4f0ff'),
  ballLight: hex('#c9c2dc'),
  ballMid: hex('#8a829e'),
  ballDark: hex('#4a4358'),
};

const BRICKS = ['#2e1844', '#29153d', '#331b4a', '#2b1640'].map(hex);
const BRICK_DARK = hex('#211031');
const SLABS = ['#150c1e', '#130a1b', '#170d20', '#120919'].map(hex);
const SLEEVES = ['#ff3cac', '#21e6ff', '#ffb547', '#b6ff3b', '#f3e8ff', '#ff6b4a', '#a45bff', '#3c8dff', '#ffd23c', '#ff3b5c'].map(hex);
const BOTTLES = ['#38c46e', '#e08a2e', '#8ad4f0', '#d8304f', '#9a66f0', '#f0dc84'].map(hex);
const BOTTLES_HI = BOTTLES.map((b) => mix(b, WHITE, 0.5));
const BOTTLES_NECK = BOTTLES.map((b) => scale(b, 0.7));

// Kick-driven LUTs (index = kick level).
const LED = ramp(scale(PINK, 0.35), PINK, KL);
const RING_PINK = ramp(hex('#8a2468'), PINK, KL);
const RING_CYAN = ramp(hex('#185060'), CYAN, KL);
const CONE_HI = ramp(hex('#3a3148'), hex('#8a7aa4'), KL);
const UNDERGLOW = ramp(hex('#0e3a44'), CYAN, KL);
const TUBE_PINK = ramp(mix(PINK, BLACK, 0.1), mix(PINK, WHITE, 0.4), KL);
const HALO_PINK = ramp(mix(BRICKS[0], PINK, 0.05), mix(BRICKS[0], PINK, 0.13), KL);
const TUBE_OFF = hex('#4a1a3c');
const TUBE_AMBER = ramp(mix(AMBER, BLACK, 0.1), mix(AMBER, WHITE, 0.35), KL);
const HALO_AMBER = mix(BRICKS[0], AMBER, 0.16);
const TUBE_RED = ramp(mix(RED, BLACK, 0.1), mix(RED, WHITE, 0.35), KL);
const HALO_RED = mix(BRICKS[0], RED, 0.16);
const HEART_IN = mix(BRICKS[0], RED, 0.14);
const TUBE_CYAN = ramp(mix(CYAN, BLACK, 0.15), mix(CYAN, WHITE, 0.3), KL);
const HALO_CYAN = mix(BRICKS[0], CYAN, 0.14);
const DRINK = mix(BRICKS[0], PINK, 0.5);
const STRIP = NEON.map((n) => ramp(mix(C.base, n, 0.4), n, KL));
const EDGE = ramp(hex('#123844'), CYAN, KL);
const BULBS = ramp(hex('#5a3a1a'), hex('#ffd27a'), 3);
const BACKLIGHT = ramp(hex('#3a2010'), hex('#d08a32'), 4);
const STAIRS = ramp(hex('#0d0a14'), mix(CYAN, PINK, 0.45), 9);
const GLASS_RING = ramp(C.glass, hex('#bfffe0'), 3);
const AMBER_STRIP = ramp(mix(AMBER, BLACK, 0.55), AMBER, KL);
const CURTAIN_HI = mix(C.curtain, WHITE, 0.18);
const GOLD_DARK = scale(C.gold, 0.7);
const PORTHOLE = mix(PINK, WHITE, 0.3);

// Dance floor: tile colours per neon and brightness step.
const LV = 8;
const LIT = NEON.map((n) => ramp(mix(C.tile, n, 0.1), mix(C.tile, n, 0.78), LV));
const LIT_CORE = NEON.map((n) => mix(n, WHITE, 0.25));

// ── neon lettering ───────────────────────────────────────────────────────
const GLYPHS: Record<string, string[]> = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  I: ['X', 'X', 'X', 'X', 'X'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
  V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
};

// A sign as a cell grid with a margin of `mx` columns and one row each side:
// 2 = tube, 1 = glow halo, 0 = nothing. `letter` says which letter a tube
// cell belongs to.
type Sign = { gw: number; gh: number; cells: Uint8Array; letter: Int8Array };

function makeSign(text: string, mx: number): Sign {
  const cols: Array<{ bits: boolean[]; letter: number }> = [];
  [...text].forEach((ch, li) => {
    const g = GLYPHS[ch];
    if (li > 0) cols.push({ bits: [false, false, false, false, false], letter: -1 });
    for (let x = 0; x < g[0].length; x++) cols.push({ bits: g.map((row) => row[x] === 'X'), letter: li });
  });
  const gw = cols.length + 2 * mx;
  const gh = 7;
  const cells = new Uint8Array(gw * gh);
  const letter = new Int8Array(gw * gh).fill(-1);
  cols.forEach((col, x) => {
    col.bits.forEach((on, y) => {
      if (!on) return;
      cells[(y + 1) * gw + x + mx] = 2;
      letter[(y + 1) * gw + x + mx] = col.letter;
    });
  });
  for (let y = 0; y < gh; y++) {
    for (let x = 0; x < gw; x++) {
      if (cells[y * gw + x]) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = y + dy;
          const xx = x + dx;
          if (yy >= 0 && yy < gh && xx >= 0 && xx < gw && cells[yy * gw + xx] === 2) near = true;
        }
      }
      if (near) cells[y * gw + x] = 1;
    }
  }
  return { gw, gh, cells, letter };
}

const ANIMUS = makeSign('ANIMUS', 1);
const VIP = makeSign('VIP', 0);

// ── floor ────────────────────────────────────────────────────────────────
// Two tiles of dark rubber along the back walls, then a light-up dance
// floor whose pattern changes every couple of bars and steps on the beat.
const DANCE = 2;

function floor(gx: number, gy: number, t: number): RGB {
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  if (ix < DANCE || iy < DANCE) {
    if ((ix === DANCE - 1 && iy >= DANCE - 1 && fx > 0.84) || (iy === DANCE - 1 && ix >= DANCE - 1 && fy > 0.84)) return EDGE[kickLevel(t)];
    if (fx < 0.06 || fy < 0.06) return C.seam;
    return SLABS[(ix * 3 + iy * 5) & 3];
  }
  if (fx < 0.08 || fy < 0.08) return C.grout;
  const beat = beatOf(t);
  const bar = beat >> 2;
  let on = false;
  let ci = 0;
  switch ((bar >> 1) & 3) {
    case 0: {
      on = ((ix + iy + beat) & 1) === 0;
      ci = wrap5((ix >> 1) + (iy >> 1) + bar);
      break;
    }
    case 1: {
      const d = ix + iy - beat;
      on = ((d % 4) + 4) % 4 === 0;
      ci = wrap5(Math.floor(d / 4) + bar);
      break;
    }
    case 2: {
      on = noise(ix * 97 + iy * 31, beat) > 0.6;
      ci = Math.floor(noise(ix * 13 + iy * 7, beat + 7) * 5);
      break;
    }
    default: {
      const d = Math.max(Math.abs(ix - 5), Math.abs(iy - 5)) - beat;
      on = ((d % 3) + 3) % 3 === 0;
      ci = wrap5(Math.floor(d / 3) + bar);
    }
  }
  const rim = fx < 0.22 || fy < 0.22 || fx > 0.86 || fy > 0.86;
  if (!on) return rim ? C.tileRim : C.tile;
  const lvl = Math.round((0.4 + 0.6 * kick(t)) * (LV - 1));
  if (rim) return LIT[ci][Math.max(0, lvl - 3)];
  return lvl === LV - 1 && fx > 0.4 && fx < 0.68 && fy > 0.4 && fy < 0.68 ? LIT_CORE[ci] : LIT[ci][lvl];
}

// ── walls ────────────────────────────────────────────────────────────────
const WALL_H = 3.8;
const SIGN_U0 = 0.5;
const SIGN_CELL = 1 / 3;
const SIGN_TOP = 3.78;
const SIGN_END = SIGN_U0 + ANIMUS.gw * SIGN_CELL;

// Brick courses half a unit tall, bricks a unit long, one-pixel mortar at
// six pixels per unit.
function brick(u: number, v: number): RGB {
  const course = Math.floor(v * 2);
  const fv = v * 2 - course;
  const bu = u + (course & 1) * 0.5;
  const bi = Math.floor(bu);
  if (fv < 0.33 || bu - bi < 0.166) return C.mortar;
  const n = noise(bi * 7 + course * 131);
  return n > 0.93 ? BRICK_DARK : BRICKS[Math.floor(n * 4.3) & 3];
}

// A speaker cone (woofer or tweeter) with an LED ring that pumps on the kick.
function cone(dx: number, dy: number, r: number, kl: number, ring: readonly RGB[]): RGB | null {
  const d2 = dx * dx + dy * dy;
  const outer = r + 0.1;
  if (d2 >= outer * outer) return null;
  const r2 = r * r;
  if (d2 >= r2) return ring[kl];
  const q = d2 / r2;
  if (q > 0.62) return C.surround;
  if (q < 0.12) return C.cap;
  if (q > 0.3 && q < 0.46) return CONE_HI[kl];
  return C.cone;
}

// Wall-mounted cabinet, 1.2 x 1.4 units, with a drop shadow below.
function speakerWall(x: number, y: number, t: number): RGB | null {
  if (y < 0) return x > 0.17 ? C.shadow : null;
  if (x < 0.17 || x > 1.03 || y < 0.17 || y > 1.23) return C.cabEdge;
  const kl = kickLevel(t);
  return cone(x - 0.6, y - 0.5, 0.3, kl, RING_PINK) ?? cone(x - 0.6, y - 1.0, 0.13, kl, RING_CYAN) ?? C.cab;
}

function eqLevel(n: number, t: number): number {
  const wave = (0.5 + 0.5 * Math.sin(t * 2.3 + n * 1.1)) * (0.55 + 0.45 * Math.sin(t * 1.3 + n * 0.47));
  return Math.min(1, 0.12 + 0.6 * wave + kick(t) * (n < 2 ? 0.45 : 0.15));
}

// Segmented LED spectrum display, w x h units: lime low, amber mid, pink top.
function eq(x: number, y: number, w: number, h: number, t: number): RGB {
  if (x < 0.17 || x > w - 0.17 || y < 0.17 || y > h - 0.17) return C.cabEdge;
  const fx = (x - 0.17) * 2;
  if (fx - Math.floor(fx) > 0.66) return C.cab;
  const fy = (y - 0.17) * 2;
  if (fy - Math.floor(fy) > 0.66) return C.cab;
  const yy = (y - 0.17) / (h - 0.34);
  const level = eqLevel(Math.floor(fx), t);
  if (yy > level) return C.ledOff;
  if (yy > level - 0.2) return WHITE;
  return yy < 0.45 ? LIME : yy < 0.75 ? AMBER : PINK;
}

const heartF = (x: number, y: number): number => {
  const a = x * x + y * y - 1;
  return a * a * a - x * x * y * y * y;
};

// A neon heart that beats on the kick.
function heart(x: number, y: number, t: number): RGB | null {
  const s = 0.55 + kick(t) * 0.06;
  const hx = x / s;
  const hy = y / s;
  if (heartF(hx, hy) <= 0) return heartF(hx / 0.68, hy / 0.68 + 0.1) <= 0 ? HEART_IN : TUBE_RED[kickLevel(t)];
  return heartF(hx / 1.3, hy / 1.3) <= 0 ? HALO_RED : null;
}

// Neon cocktail glass, 1.2 x 1.3 units (y up).
function cocktail(x: number, y: number, t: number): RGB | null {
  const kl = kickLevel(t) >> 1;
  const dx = Math.abs(x - 0.6);
  const ox = x - 0.78;
  const oy = y - 0.98;
  if (ox * ox + oy * oy < 0.012) return LIME;
  if (y >= 0.58 && y < 1.24) {
    const half = ((y - 0.58) / 0.66) * 0.52;
    if (y >= 1.1 && dx < half + 0.04) return TUBE_CYAN[kl];
    if (dx >= half - 0.12 && dx < half + 0.04) return TUBE_CYAN[kl];
    if (dx < half - 0.12 && y < 1.0) return DRINK;
    if (dx < half + 0.2) return HALO_CYAN;
  }
  if (y >= 0.2 && y < 0.58 && dx < 0.09) return TUBE_CYAN[kl];
  if (y >= 0.08 && y < 0.2 && dx < 0.3) return TUBE_CYAN[kl];
  if ((y >= 0 && y < 0.36 && dx < 0.42) || (y >= 0.2 && y < 0.62 && dx < 0.22)) return HALO_CYAN;
  return null;
}

function animus(u: number, v: number, t: number): RGB | null {
  const col = Math.floor((u - SIGN_U0) / SIGN_CELL);
  const row = Math.floor((SIGN_TOP - v) / SIGN_CELL);
  if (col < 0 || col >= ANIMUS.gw || row < 0 || row >= ANIMUS.gh) return null;
  const i = row * ANIMUS.gw + col;
  const cell = ANIMUS.cells[i];
  if (cell === 0) return null;
  const kl = kickLevel(t);
  if (cell === 1) return HALO_PINK[kl];
  // The 'I' is a little broken: it stutters every few seconds.
  if (ANIMUS.letter[i] === 2 && frac(t / 6.3) < 0.12 && noise(Math.floor(t * 14), 9) > 0.45) return TUBE_OFF;
  return TUBE_PINK[kl];
}

// Right wall: the big ANIMUS sign, then speakers and cocktail signs repeat.
function rightDecor(u: number, v: number, t: number): RGB | null {
  if (v < 1.75) return null;
  if (u < SIGN_END) return animus(u, v, t);
  const s = u - SIGN_END;
  const x = s - Math.floor(s / 3.4) * 3.4;
  if (x >= 0.3 && x < 1.5 && v >= 1.85 && v < 3.4) return speakerWall(x - 0.3, v - 2.0, t);
  if (x >= 1.9 && x < 3.1 && v >= 2.05 && v < 3.35) return cocktail(x - 1.9, v - 2.05, t);
  return null;
}

// Left wall: speaker, spectrum display, beating heart, then speakers and
// smaller displays repeat towards the door.
function leftDecor(u: number, v: number, t: number): RGB | null {
  if (v < 1.75) return null;
  if (u >= 0.6 && u < 1.8 && v >= 1.85 && v < 3.4) return speakerWall(u - 0.6, v - 2.0, t);
  if (u >= 2.0 && u < 4.4 && v >= 2.2 && v < 3.4) return eq(u - 2.0, v - 2.2, 2.4, 1.2, t);
  if (u >= 4.55 && u < 5.95 && v >= 1.75 && v < 3.5) return heart(u - 5.25, v - 2.6, t);
  if (u >= 6.9) {
    const s = u - 6.9;
    const x = s - Math.floor(s / 3.4) * 3.4;
    if (x >= 0.3 && x < 1.5 && v >= 1.85 && v < 3.4) return speakerWall(x - 0.3, v - 2.0, t);
    if (x >= 1.8 && x < 3.2 && v >= 2.3 && v < 3.3) return eq(x - 1.8, v - 2.3, 1.4, 1.0, t + 1.3);
  }
  return null;
}

function wall(side: 'left' | 'right', u: number, v: number, t: number): RGB {
  if (v >= WALL_H - 0.12) return v >= WALL_H - 0.04 ? C.trimHi : C.trim;
  if (v < 0.17) return C.base;
  if (v < 0.34) return STRIP[wrap5(beatOf(t) >> 3)][kickLevel(t)];
  if (v >= WALL_H - 0.3 && v < WALL_H - 0.13) {
    // Festoon bulbs along the top of the wall, twinkling.
    const b = Math.floor(u * 2);
    const f = u * 2 - b;
    if (f > 0.34 && f < 0.68) return BULBS[noise(b + (side === 'left' ? 500 : 0), Math.floor(t * 3)) > 0.3 ? 2 : 0];
  }
  return (side === 'right' ? rightDecor(u, v, t) : leftDecor(u, v, t)) ?? brick(u, v);
}

// ── stations ─────────────────────────────────────────────────────────────
const box = (a: number, b: number, z: number, len: number, dep: number, h: number, color: RGB, paint?: Paint): Box => ({ a, b, z, len, dep, h, color, paint });

// Paints a sign grid onto a face (len x h), mirrored on the left wall so it
// reads left to right.
function signPaint(s: Sign, len: number, h: number, mirror: boolean, tube: RGB, halo: RGB): Paint {
  const cw = len / s.gw;
  const ch = h / s.gh;
  return (f, u, v) => {
    if (f !== 'front') return null;
    const col = Math.floor((mirror ? len - u : u) / cw);
    const row = Math.floor((h - v) / ch);
    if (col < 0 || col >= s.gw || row < 0 || row >= s.gh) return null;
    const cell = s.cells[row * s.gw + col];
    return cell === 2 ? tube : cell === 1 ? halo : null;
  };
}

// Speaker stack: two big cones whose LED rings pump on the kick.
function speakerTower(kl: number): Paint {
  return (f, u, v) => {
    if (f === 'top') return u > 0.21 && u < 0.41 && v > 0.21 && v < 0.41 ? LED[kl] : undefined;
    if (f === 'side') return v > 0.25 && v < 1.4 && frac(v * 3) < 0.5 && u > 0.17 && u < 0.45 ? C.cab : undefined;
    if (u < 0.05 || u > 0.57 || v < 0.08 || v > 1.52) return undefined;
    return cone(u - 0.31, v - 0.42, 0.18, kl, RING_PINK) ?? cone(u - 0.31, v - 1.08, 0.18, kl, RING_PINK) ?? C.cab;
  };
}

// The booth front is an LED wall showing the spectrum: low and lazy in
// cool colours when nobody is mixing, jumping in hot colours when someone
// is. A pink neon lip runs along the top.
function ledWall(t: number, active: boolean, kl: number, len: number): Paint {
  return (f, u, v) => {
    if (f === 'top') return undefined;
    if (v > 0.8) return LED[kl];
    if (v < 0.15) return UNDERGLOW[kl];
    if (f !== 'front' || u < 0.1 || u > len - 0.1) return undefined;
    const col = Math.floor((u - 0.1) * 6);
    const row = Math.floor((v - 0.15) * 6);
    if (active) {
      const lvl = 1 + Math.floor(eqLevel(col, t) * 3.5);
      return row < lvl ? (row < 2 ? LIME : row < 3 ? AMBER : PINK) : C.ledOff;
    }
    const lvl = 1 + Math.floor(eqLevel(col, t * 0.4) * 2.5);
    return row < lvl ? (row < 1 ? CYAN : VIOLET) : C.ledOff;
  };
}

// A turntable seen from above: silver plinth, black platter, coloured
// label, and a glint going round as it spins.
function platter(spin: number, label: RGB): Paint {
  return (f, u, v) => {
    if (f !== 'top') return undefined;
    const du = u - 0.24;
    const dv = v - 0.24;
    const d2 = du * du + dv * dv;
    if (d2 < 0.005) return label;
    if (d2 < 0.036) return frac(Math.atan2(dv, du) / (Math.PI * 2) - spin) < 0.2 ? C.vinylHi : C.vinyl;
    return undefined;
  };
}

function mixerTop(t: number, active: boolean): Paint {
  const step = Math.floor(t * (active ? 10 : 2));
  return (f, u, v) => {
    if (f !== 'top') return undefined;
    const cv = Math.floor(v * 6);
    const on = active ? noise(cv + Math.floor(u * 6) * 7, step) > 0.4 : cv === step % 3;
    return on ? NEON[wrap5(cv + Math.floor(u * 6))] : undefined;
  };
}

const write: IsoStation = {
  name: 'DJ booth',
  size: { len: 2.4, dep: 1, h: 1.7 },
  light: (t, active) => ({ a: 1.2, b: 1.5, z: 1.2, color: PINK, radius: 1.8, intensity: active ? 0.6 + 0.3 * kick(t) : 0.35 }),
  model: (t, active) => {
    const kl = kickLevel(t);
    const spin = t * (active ? 1.6 : 0.55);
    const tower = speakerTower(kl);
    return [
      box(0, 0.25, 0, 0.62, 0.62, 1.6, C.tower, tower),
      box(0.62, 0.3, 0, 1.16, 0.7, 0.95, C.booth, ledWall(t, active, kl, 1.16)),
      box(0.65, 0.42, 0.95, 0.5, 0.5, 0.08, C.deck, platter(spin, PINK)),
      box(1.15, 0.46, 0.95, 0.12, 0.42, 0.13, C.mixer, mixerTop(t, active)),
      box(1.27, 0.42, 0.95, 0.5, 0.5, 0.08, C.deck, platter(spin + 0.37, CYAN)),
      box(1.78, 0.25, 0, 0.62, 0.62, 1.6, C.tower, tower),
    ];
  },
};

const vipTube = TUBE_AMBER[KL - 2];
const vipTubeHot = TUBE_AMBER[KL - 1];
const vipTubeOff = TUBE_OFF;

const read: IsoStation = {
  name: 'VIP booth',
  size: { len: 1.8, dep: 1.3, h: 2.5 },
  light: () => ({ a: 0.9, b: 1.3, z: 2, color: VIOLET, radius: 1.5, intensity: 0.45 }),
  model: (t, active) => {
    const scroll = active ? t * 0.3 : 0;
    const flicker = !active && frac(t / 5.1) < 0.05;
    const tube = flicker ? vipTubeOff : active && kick(t) > 0.5 ? vipTubeHot : vipTube;
    const roll: Paint = (f, _u, v) => (f === 'top' || v > 0.3 ? C.velvetHi : undefined);
    return [
      box(0, 0, 1.25, 1.8, 0.04, 1.2, C.cab, signPaint(VIP, 1.8, 1.2, true, tube, HALO_AMBER)),
      box(0, 0.05, 0, 1.8, 0.85, 0.35, C.velvetDark, (f, _u, v) => (f !== 'top' && v > 0.25 ? C.gold : undefined)),
      box(0, 0.05, 0.35, 1.8, 0.32, 0.85, C.velvet, (f, u, v) => {
        if (f === 'top' || v > 0.74) return C.velvetHi;
        if (f !== 'front') return undefined;
        const gu = frac(u * 3);
        const gv = frac(v * 3 + (Math.floor(u * 3) & 1) * 0.5);
        return gu > 0.33 && gu < 0.67 && gv > 0.33 && gv < 0.67 ? C.button : undefined;
      }),
      box(0, 0.37, 0.35, 0.22, 0.53, 0.42, C.velvet, roll),
      box(0.22, 0.37, 0.35, 1.36, 0.53, 0.15, C.velvetHi, (f, u) => (f === 'top' && Math.abs(u - 0.68) < 0.08 ? C.velvet : undefined)),
      box(1.58, 0.37, 0.35, 0.22, 0.53, 0.42, C.velvet, roll),
      box(0.8, 1.06, 0, 0.2, 0.17, 0.32, C.chromeDark),
      box(0.52, 0.95, 0.32, 0.76, 0.35, 0.07, C.table, (f) => (f === 'top' ? undefined : C.gold)),
      box(0.6, 1.05, 0.39, 0.34, 0.07, 0.36, C.cardDim, (f, u, v) => {
        if (f !== 'front') return undefined;
        if (u < 0.05 || u > 0.29 || v < 0.05 || v > 0.31) return C.gold;
        const lit = active ? C.card : C.cardDim;
        if (v > 0.24) return lit;
        return frac((v + scroll) / 0.1) < 0.5 && u > 0.09 && u < 0.25 ? C.ink : lit;
      }),
      box(1.0, 1.0, 0.39, 0.17, 0.17, 0.17, C.silver),
      box(1.04, 1.04, 0.56, 0.09, 0.09, 0.2, C.bottle, (f) => (f === 'front' ? C.bottleHi : undefined)),
    ];
  },
};

// A milk crate: vertical slots front and side, dark inside.
function crate(f: string, u: number, v: number): RGB | undefined {
  if (f === 'top') return u > 0.1 && u < 0.64 && v > 0.1 && v < 0.65 ? C.crateIn : undefined;
  if (v < 0.15 || v > 0.5 || u < 0.12 || u > 0.62) return undefined;
  return frac((u - 0.12) * 3) > 0.5 ? C.crateIn : undefined;
}

function sleeve(color: RGB): Paint {
  return (f, u, v) => {
    if (f !== 'front') return undefined;
    const du = u - 0.32;
    const dv = v - 0.2;
    if (du * du + dv * dv < 0.012) return C.vinyl;
    return u < 0.12 ? WHITE : undefined;
  };
}

// Record crates, one stacked on another; sleeves stick out of the top and
// get pulled up one after another while someone is digging.
const search: IsoStation = {
  name: 'record crates',
  size: { len: 1.5, dep: 0.8, h: 1.7 },
  model: (t, active) => {
    const sel = active ? Math.floor(t * 5) % 10 : 2;
    const out: Box[] = [box(0, 0.03, 0, 0.74, 0.75, 0.65, C.crateA, crate)];
    for (let k = 0; k < 5; k++) {
      const lift = k === sel ? (active ? 0.38 : 0.2) : 0.1 + noise(k, 3) * 0.06;
      out.push(box(0.07, 0.1 + k * 0.12, 0.65, 0.6, 0.08, lift, SLEEVES[k], sleeve(SLEEVES[k])));
    }
    out.push(box(0.76, 0.03, 0, 0.74, 0.75, 0.65, C.crateB, crate));
    out.push(box(0.76, 0.03, 0.65, 0.74, 0.75, 0.65, C.crateC, crate));
    for (let k = 5; k < 10; k++) {
      const lift = k === sel ? (active ? 0.34 : 0.2) : 0.1 + noise(k, 3) * 0.06;
      out.push(box(0.83, 0.1 + (k - 5) * 0.12, 1.3, 0.6, 0.08, lift, SLEEVES[k], sleeve(SLEEVES[k])));
    }
    return out;
  },
};

// Lighting desk in two steps: faders and a cue screen at the back, a grid
// of flash buttons at the front, and a little moving head that changes
// colour on the beat.
const run: IsoStation = {
  name: 'lighting desk',
  size: { len: 1.4, dep: 0.95, h: 1.45 },
  light: (_t, active) => ({ a: 0.7, b: 1.2, z: 1.3, color: CYAN, radius: 1.2, intensity: active ? 0.5 : 0.25 }),
  model: (t, active) => {
    const beat = beatOf(t);
    const step = Math.floor(t * (active ? 8 : 2));
    const kl = kickLevel(t);
    return [
      box(0, 0.1, 0, 1.4, 0.4, 1, C.steel, (f, u, v) => {
        if (f === 'top') {
          if (u < 0.08 || u > 0.92 || v < 0.06 || v > 0.34) return undefined;
          const cu = Math.floor((u - 0.08) * 6);
          if (cu & 1) return undefined;
          const level = active ? 0.5 + 0.5 * Math.sin(t * 3 + cu * 1.3) : noise(cu, 11);
          return Math.abs(v - (0.1 + level * 0.2)) < 0.05 ? WHITE : C.consoleDark;
        }
        if (f !== 'front' || v < 0.78 || v > 0.94 || u < 0.1 || u > 1.3) return undefined;
        const i = Math.floor((u - 0.1) * 6);
        return i < 1 + eqLevel(1, t) * 6 ? (i < 4 ? LIME : i < 6 ? AMBER : PINK) : C.consoleDark;
      }),
      box(0, 0.5, 0, 1.4, 0.45, 0.72, C.steel, (f, u, v) => {
        if (f === 'front') return v > 0.6 ? RING_CYAN[kl] : frac(v * 6) < 0.5 && v > 0.15 && v < 0.5 && u > 0.2 && u < 1.2 ? C.consoleDark : undefined;
        if (f !== 'top' || u < 0.1 || u > 1.3 || v < 0.08 || v > 0.38) return undefined;
        const cu = Math.floor((u - 0.1) * 6);
        const cv = Math.floor((v - 0.08) * 6);
        if ((cu | cv) & 1) return C.consoleDark;
        const lit = active ? noise(cu * 5 + cv, step) > 0.4 : (cu + step) % 6 === 0;
        return lit ? NEON[wrap5((cu >> 1) + cv)] : NEON_DIM[wrap5((cu >> 1) + cv)];
      }),
      box(0.12, 0.12, 1, 0.8, 0.07, 0.42, C.consoleDark, (f, u, v) => {
        if (f !== 'front' || u < 0.07 || u > 0.73 || v < 0.07 || v > 0.35) return undefined;
        const cx = Math.floor((u - 0.07) * 6);
        const cy = Math.floor((v - 0.07) * 6);
        if ((cx + cy) & 1) return C.screen;
        const hot = active ? (cx + cy + step) % 3 === 0 : (cx + step) % 4 === 0;
        return hot ? NEON[wrap5(cy + (cx >> 1))] : NEON_DIM[wrap5(cy + (cx >> 1))];
      }),
      box(1.02, 0.14, 1, 0.3, 0.3, 0.1, C.chromeDark),
      box(1.05, 0.17, 1.1, 0.24, 0.24, 0.3, C.fixture, (f, u, v) => {
        if (f !== 'front') return undefined;
        const du = u - 0.12;
        const dv = v - 0.15;
        return du * du + dv * dv < 0.012 ? NEON[wrap5(beat >> (active ? 0 : 2))] : undefined;
      }),
    ];
  },
};

// A neon phone booth: glass on two sides, a lit roof sign, the phone
// inside. Ringing makes the glass flash.
const web: IsoStation = {
  name: 'neon phone booth',
  size: { len: 0.9, dep: 0.75, h: 2.55 },
  light: () => ({ a: 0.45, b: 0.9, z: 2.2, color: CYAN, radius: 1.3, intensity: 0.55 }),
  model: (t, active) => {
    const ringing = active && frac(t / 1.6) < 0.55;
    const flash = ringing && frac(t * 7) < 0.5;
    const glass = flash ? C.glassLit : C.glass;
    const pane: Paint = (f, u, v) => {
      if (f === 'top') return undefined;
      const len = f === 'front' ? 0.9 : 0.7;
      if (u < 0.17 || u > len - 0.17) return ringing && flash ? WHITE : PINK;
      if (v < 0.2 || v > 2.1) return undefined;
      if (Math.abs(v - 0.85) < 0.08 || Math.abs(v - 1.55) < 0.08) return undefined;
      const s = u * 1.4 + v;
      if (Math.abs(s - 1.5) < 0.09 || Math.abs(s - 1.78) < 0.05) return C.glassHi;
      if (f === 'front' && u > 0.27 && u < 0.63 && v > 1.0 && v < 1.45) {
        if (ringing && u > 0.35 && u < 0.55 && v > 1.08 && v < 1.3) return frac((u - 0.35) * 9) < 0.5 && frac(v * 9) < 0.5 ? LIME : C.phone;
        return C.phone;
      }
      return v > 1.9 ? GLASS_RING[flash ? 2 : 1] : glass;
    };
    return [
      box(0, 0, 0, 0.9, 0.7, 2.3, C.boothFrame, pane),
      box(0, 0, 2.3, 0.9, 0.75, 0.25, C.roof, (f, u, v) => {
        if (f === 'top' || v < 0.06 || v > 0.2) return undefined;
        const lit = frac(u * 3 - t * (ringing ? 4 : 0.5)) < 0.5;
        return flash ? (lit ? LIME : WHITE) : lit ? CYAN : TUBE_CYAN[0];
      }),
    ];
  },
};

// Little stage: velvet curtain, marquee bulbs, a mic stand and a monitor.
const think: IsoStation = {
  name: 'open-mic stage',
  size: { len: 1.3, dep: 1, h: 1.75 },
  light: (_t, active) => ({ a: 0.65, b: 1, z: 2.5, color: hex('#fff1d0'), radius: 1.2, intensity: active ? 1 : 0.15 }),
  model: (t, active) => {
    const chase = Math.floor(t * (active ? 8 : 1.5));
    const kl = kickLevel(t);
    const bulbs = (u: number, v: number): RGB | undefined => {
      if (v < 0.14 || v > 0.3) return undefined;
      const i = Math.floor(u * 3);
      if (u * 3 - i < 0.5) return undefined;
      return BULBS[(i + chase) % 3 === 0 ? 2 : active ? 1 : 0];
    };
    return [
      box(0, 0, 0, 1.3, 0.1, 1.7, C.curtain, (f, u, v) => {
        if (f !== 'front') return undefined;
        if (v > 1.45) return v < 1.55 && frac(u * 3) < 0.5 ? GOLD_DARK : C.gold;
        const fold = frac(u * 3);
        return fold < 0.34 ? C.curtainDark : fold > 0.67 ? CURTAIN_HI : undefined;
      }),
      box(0, 0.1, 0, 1.3, 0.9, 0.35, C.stage, (f, u, v) => {
        if (f !== 'top') return bulbs(u, v);
        if (active) {
          const du = u - 0.65;
          const dv = v - 0.55;
          if (du * du + dv * dv < 0.16) return C.stageLit;
        }
        return frac(v * 3) < 0.34 ? C.board : undefined;
      }),
      box(0.55, 0.6, 0.35, 0.25, 0.25, 0.05, C.chromeDark),
      box(0.6, 0.66, 0.4, 0.17, 0.17, 1.1, C.chrome),
      box(0.56, 0.62, 1.5, 0.25, 0.25, 0.2, C.mic, (f, u, v) => (f === 'top' || frac((u + v) * 6) < 0.5 ? C.chromeDark : undefined)),
      box(0.92, 0.5, 0.35, 0.36, 0.34, 0.22, C.cab, (f, u, v) => {
        if (f !== 'front') return undefined;
        const du = u - 0.18;
        const dv = v - 0.11;
        return du * du + dv * dv < 0.008 ? RING_PINK[kl] : undefined;
      }),
    ];
  },
};

// Back bar with backlit bottles, a counter, taps, drinks and a shaker.
const idle: IsoStation = {
  name: 'bar',
  size: { len: 2, dep: 1, h: 1.8 },
  light: () => ({ a: 1, b: 1.3, z: 1, color: AMBER, radius: 1.6, intensity: 0.45 }),
  model: (t, active) => {
    const lift = active ? Math.abs(Math.sin(t * 16)) * 0.18 : 0;
    const sway = active ? Math.sin(t * 8) * 0.06 : 0;
    const kl = kickLevel(t);
    return [
      box(0, 0, 0, 2, 0.3, 1.75, C.shelf, (f, u, v) => {
        if (f !== 'front') return undefined;
        if (v < 0.5) return frac(u * 2) < 0.08 || v > 0.38 ? C.shelfBoard : undefined;
        if (v > 1.58) return frac(u * 3 - t * 0.7) < 0.5 ? AMBER : AMBER_STRIP[1];
        const rows = (v - 0.5) / 0.54;
        const r = Math.floor(rows);
        const y = (rows - r) * 0.54;
        if (y < 0.17) return C.shelfBoard;
        const slot = Math.floor(u * 3);
        const fu = u * 3 - slot;
        const hb = 0.17 + 0.17 + noise(slot, r) * 0.1;
        const bi = Math.floor(noise(slot + 40, r) * BOTTLES.length);
        if (y < hb && fu > 0.25 && fu < 0.9) return fu < 0.5 ? BOTTLES_HI[bi] : BOTTLES[bi];
        if (y < hb + 0.12 && fu > 0.4 && fu < 0.75) return BOTTLES_NECK[bi];
        return BACKLIGHT[Math.min(3, Math.floor((0.54 - y) * 6))];
      }),
      box(0, 0.6, 0, 2, 0.4, 1, C.counter, (f, u, v) => {
        if (f === 'top') return undefined;
        if (v > 0.82) return AMBER_STRIP[kl];
        if (v > 0.17 && v < 0.33) return C.rail;
        return frac(u * 2) < 0.1 ? C.shelf : undefined;
      }),
      box(0, 0.55, 1, 2, 0.45, 0.1, C.counterTop),
      box(0.25, 0.66, 1.1, 0.17, 0.17, 0.3, C.chrome),
      box(0.25, 0.66, 1.4, 0.17, 0.17, 0.16, PINK),
      box(0.62, 0.72, 1.1, 0.18, 0.18, 0.3, C.bottle, (f, u) => (f === 'front' && u < 0.08 ? C.bottleHi : undefined)),
      box(0.66, 0.76, 1.4, 0.1, 0.1, 0.12, C.bottle),
      box(1.0, 0.76, 1.1, 0.17, 0.17, 0.17, C.glassPink, (_f, _u, v) => (v > 0.12 ? C.chrome : undefined)),
      box(1.35 + sway, 0.72, 1.1 + lift, 0.18, 0.18, 0.32, C.chrome, (f, _u, v) => (f !== 'top' && frac(v * 6) < 0.34 ? C.chromeDark : undefined)),
      box(1.38 + sway, 0.75, 1.42 + lift, 0.12, 0.12, 0.08, C.chromeDark),
      box(1.72, 0.76, 1.1, 0.17, 0.17, 0.17, C.glassLime, (_f, _u, v) => (v > 0.12 ? C.chrome : undefined)),
    ];
  },
};

// Padded club door under a chasing neon arrow. Open, it shows the stairs up
// to the street, glowing.
const entrance: IsoStation = {
  name: 'club door',
  size: { len: 1, dep: 0.22, h: 3.05 },
  light: (_t, active) => ({ a: 0.5, b: 0.6, z: 2.6, color: RED, radius: 1.1, intensity: active ? 0.8 : 0.3 }),
  model: (t, active) => {
    const chase = Math.floor(t * (active ? 6 : 1.2)) % 2;
    return [
      box(0, 0, 0, 1, 0.18, 2.4, C.doorFrame, (f, u, v) => {
        if (f !== 'front') return undefined;
        if (u < 0.15 || u > 0.85 || v > 2.23) return u < 0.06 || u > 0.94 || v > 2.32 ? undefined : C.doorFrameHi;
        if (active) {
          if (u > 0.7) return C.doorLeafDark;
          const step = Math.floor(v * 4);
          const lvl = Math.min(8, step);
          return v * 4 - step > 0.6 ? STAIRS[Math.min(8, lvl + 1)] : STAIRS[lvl];
        }
        const du = u - 0.5;
        const dv = v - 1.7;
        const d2 = du * du + dv * dv;
        if (d2 < 0.03) return d2 < 0.012 ? PORTHOLE : PINK;
        if (d2 < 0.05) return C.doorFrameHi;
        if (v > 1.05 && v < 1.22 && u > 0.22 && u < 0.78) return C.chrome;
        if (v < 0.28) return C.doorFrame;
        return u < 0.21 || u > 0.79 ? C.doorLeafDark : C.doorLeaf;
      }),
      box(0.12, 0, 2.45, 0.76, 0.05, 0.6, C.cab, (f, u, v) => {
        if (f !== 'front') return null;
        // Two neon chevrons pointing down at the door, chasing.
        const x = Math.abs(u - 0.38);
        for (let i = 0; i < 2; i++) {
          const d = v - (0.08 + i * 0.25) - x * 0.75;
          if (d >= 0 && d < 0.17 && x < 0.32) return chase === i ? TUBE_CYAN[KL - 1] : TUBE_CYAN[1];
          if (d >= -0.08 && d < 0.25 && x < 0.38) return HALO_CYAN;
        }
        return null;
      }),
    ];
  },
};

// ── ambient ──────────────────────────────────────────────────────────────
// Additive light straight into the canvas buffer (cheap, no allocations).
function light(c: PixelCanvas, x: number, y: number, col: RGB, a: number): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= c.w || yi >= c.h) return;
  const i = yi * c.w + xi;
  const cur = c.data[i];
  if (cur === CLEAR) return;
  const r = Math.min(255, ((cur >> 16) & 255) + col[0] * a) | 0;
  const g = Math.min(255, ((cur >> 8) & 255) + col[1] * a) | 0;
  const b = Math.min(255, (cur & 255) + col[2] * a) | 0;
  c.data[i] = (r << 16) | (g << 8) | b;
}

// A soft cone of light from (sx, sy) down to an elliptical pool at (tx, ty).
function beam(c: PixelCanvas, sx: number, sy: number, tx: number, ty: number, rx: number, col: RGB, a0: number): void {
  const len = ty - sy;
  if (len > 1) {
    for (let y = Math.ceil(sy); y <= ty; y++) {
      const s = (y - sy) / len;
      const cx = sx + (tx - sx) * s;
      const w = 0.6 + (rx * 0.8 - 0.6) * s;
      const a = a0 * (0.2 + 0.6 * s);
      for (let x = Math.ceil(cx - w); x <= cx + w; x++) {
        const e = (x - cx) / w;
        light(c, x, y, col, a * (1 - e * e));
      }
    }
  }
  const ry = rx / 2;
  for (let y = Math.ceil(ty - ry); y <= ty + ry; y++) {
    for (let x = Math.ceil(tx - rx); x <= tx + rx; x++) {
      const ex = (x - tx) / rx;
      const ey = (y - ty) / ry;
      const e = ex * ex + ey * ey;
      if (e < 1) light(c, x, y, col, a0 * 2.4 * (1 - e));
    }
  }
}

const NOTE: ReadonlyArray<readonly [number, number]> = [[1, 0], [2, 0], [1, 1], [2, 1], [1, 2], [0, 3], [1, 3], [0, 4], [1, 4]];
const NOTE_COLOURS: readonly RGB[] = [CYAN, LIME, WHITE, AMBER];
const SIDES = [-1, 1] as const;
const BACKDROP = hex('#06030a');
const BACKDROP_PACKED = (BACKDROP[0] << 16) | (BACKDROP[1] << 8) | BACKDROP[2];

function ambient(c: PixelCanvas, room: Room, t: number): void {
  const { iso, W, D, wallH } = room;
  const hh = iso.hh;
  const beat = beatOf(t);
  const bar = beat >> 2;
  const k = kick(t);

  // Moving-head beams from rigs on the wall tops, sweeping the dance floor.
  for (let i = 0; i < 3; i++) {
    if (noise(bar >> 1, 40 + i) < 0.2) continue;
    const [sx, sy] = i === 1 ? iso.toScreen(0, D * 0.55, wallH) : iso.toScreen(W * (i === 0 ? 0.3 : 0.72), 0, wallH);
    const gx = DANCE + 0.3 + (W - DANCE - 1.3) * (0.5 + 0.5 * Math.sin(t * 0.43 + i * 2.1));
    const gy = DANCE + 0.3 + (D - DANCE - 1.3) * (0.5 + 0.5 * Math.sin(t * 0.29 + i * 1.7 + 0.6));
    const [tx, ty] = iso.toScreen(gx, gy, 0);
    const col = NEON[wrap5(bar + i * 2)];
    beam(c, sx, sy, tx, ty, 1.2 * hh, col, 0.06 + 0.05 * k);
    c.set(sx - 1, sy - 1, C.fixture);
    c.set(sx, sy - 1, C.fixture);
    c.set(sx + 1, sy - 1, C.fixture);
    c.set(sx, sy, col);
  }

  // Spotlight on the open-mic stage while someone is thinking there.
  const stage = room.placed.find((p) => p.kind === 'think');
  if (stage && stage.users > 0) {
    const [tx, ty] = localToScreen(room, stage, 0.65, 1.6, 0);
    const [sx, sy] = localToScreen(room, stage, 0.65, 1.6, wallH + 0.6);
    beam(c, sx, sy, tx, ty, 1.4 * hh, C.spot, 0.09);
  }

  // The lighting desk's moving head sweeps a beam over the floor in front.
  const desk = room.placed.find((p) => p.kind === 'run');
  if (desk) {
    const busy = desk.users > 0;
    const sweep = t * (busy ? 1.4 : 0.45);
    const [sx, sy] = localToScreen(room, desk, 1.17, 0.41, 1.25);
    const [tx, ty] = localToScreen(room, desk, 0.7 + Math.sin(sweep) * 1.3, 2.4 + Math.sin(sweep * 0.7 + 1) * 0.7, 0);
    beam(c, sx, sy, tx, ty, 0.8 * hh, NEON[wrap5(beat >> (busy ? 0 : 2))], busy ? 0.1 : 0.06);
  }

  // Music notes drifting up from the DJ booth.
  const booth = room.placed.find((p) => p.kind === 'write');
  if (booth) {
    const n = booth.users > 0 ? 7 : 3;
    for (let i = 0; i < n; i++) {
      const q = t / 2.8 + i / n;
      const p = frac(q);
      const a = 0.3 + noise(i + Math.floor(q) * 7, 7) * 1.8 + Math.sin(p * 6 + i) * 0.15;
      const [x, y] = localToScreen(room, booth, a, 0.5, 2 + p * 1.6);
      const alpha = Math.sin(p * Math.PI) * 0.9;
      const col = NOTE_COLOURS[i % NOTE_COLOURS.length];
      for (const [dx, dy] of NOTE) light(c, x + dx, y + dy, col, alpha);
    }
  }

  // The phone rings: little arcs either side of the booth roof.
  const phone = room.placed.find((p) => p.kind === 'web');
  if (phone && phone.users > 0 && frac(t / 1.6) < 0.55 && frac(t * 7) < 0.6) {
    const [x, y] = localToScreen(room, phone, 0.45, 0.75, 2.75);
    for (let j = 0; j < 2; j++) {
      const d = 3 + j * 2;
      for (const s of SIDES) {
        c.blend(x + s * d, y - 1, LIME, 0.85);
        c.blend(x + s * (d + 1), y, LIME, 0.85);
        c.blend(x + s * d, y + 1, LIME, 0.85);
      }
    }
  }

  // Disco ball near the back corner, on a wire, spinning.
  const [bx, by] = iso.toScreen(1.1, 1.1, wallH - 0.75);
  const r = Math.max(1.5, hh * 0.6);
  for (let y = Math.max(0, Math.floor(by - r - hh * 2)); y < by - r; y++) c.set(bx, y, C.wire);
  const ri = Math.ceil(r);
  const spin = t * 4;
  const glintStep = Math.floor(t * 9);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const e = (dx * dx + dy * dy) / (r * r);
      if (e > 1.05) continue;
      let col = (Math.floor(dx + spin) + dy) & 1 ? C.ballLight : C.ballMid;
      if (e > 0.62) col = C.ballDark;
      else if (dx < 0 && dy < 0 && e < 0.35) col = C.ballHi;
      if (noise((dx + 9) * 31 + dy, glintStep) > 0.9) col = WHITE;
      c.set(bx + dx, by + dy, col);
    }
  }
  if (frac(t / BEAT) < 0.3) {
    for (let j = 1; j <= ri + 2; j++) {
      const a = 0.5 * (1 - j / (ri + 3));
      light(c, bx + ri + j, by - j * 0.5, WHITE, a);
      light(c, bx - ri - j, by - j * 0.5, WHITE, a);
      light(c, bx + ri + j, by + j * 0.5, WHITE, a);
      light(c, bx - ri - j, by + j * 0.5, WHITE, a);
    }
  }

  // Mirror-ball sparkles sliding round the walls and the floor.
  for (let i = 0; i < 26; i++) {
    const tw = pulse(t, 0.7 + noise(i, 4) * 0.9, noise(i, 5) * 3);
    if (tw < 0.4) continue;
    const a = (tw - 0.4) / 0.6;
    let x: number;
    let y: number;
    if (i < 16) {
      const s = frac(noise(i, 1) + t * 0.03) * (W + D);
      const v = 0.5 + noise(i, 2) * (wallH - 1);
      [x, y] = s < D ? wallToScreen(room, 'left', D - s, v) : wallToScreen(room, 'right', s - D, v);
    } else {
      const ang = noise(i, 1) * Math.PI * 2 + t * 0.25;
      const rad = 1.5 + noise(i, 3) * (W + D) * 0.45;
      const gx = 1.1 + Math.cos(ang) * rad;
      const gy = 1.1 + Math.sin(ang) * rad;
      if (gx < 0.2 || gy < 0.2 || gx > W - 0.2 || gy > D - 0.2) continue;
      [x, y] = iso.toScreen(gx, gy, 0);
    }
    const col = i % 4 === 0 ? NEON[i % 5] : WHITE;
    light(c, x, y, col, 0.85 * a);
    if (a > 0.6) {
      light(c, x - 1, y, col, 0.35 * a);
      light(c, x + 1, y, col, 0.35 * a);
      light(c, x, y - 1, col, 0.35 * a);
      light(c, x, y + 1, col, 0.35 * a);
    }
  }

  // The drop: one bar in sixteen gets a soft strobe on the offbeats.
  if (bar % 16 === 15 && (beat & 1) === 1 && frac(t / BEAT) < 0.22) {
    const d = c.data;
    for (let i = 0; i < d.length; i++) {
      const v = d[i];
      if (v === CLEAR || v === BACKDROP_PACKED) continue;
      const r = Math.min(255, ((v >> 16) & 255) + 30);
      const g = Math.min(255, ((v >> 8) & 255) + 26);
      const b = Math.min(255, (v & 255) + 36);
      d[i] = (r << 16) | (g << 8) | b;
    }
  }
}

// Pools where the moving-head beams (see ambient) hit the dance floor.
function roomLights(room: Room, t: number): RoomLight[] {
  const { W, D } = room;
  const bar = beatOf(t) >> 2;
  const out: RoomLight[] = [];
  for (let i = 0; i < 3; i++) {
    if (noise(bar >> 1, 40 + i) < 0.2) continue;
    const gx = DANCE + 0.3 + (W - DANCE - 1.3) * (0.5 + 0.5 * Math.sin(t * 0.43 + i * 2.1));
    const gy = DANCE + 0.3 + (D - DANCE - 1.3) * (0.5 + 0.5 * Math.sin(t * 0.29 + i * 1.7 + 0.6));
    out.push({ gx, gy, gz: 0, color: NEON[wrap5(bar + i * 2)], radius: 1.3, intensity: 0.6 + 0.3 * kick(t) });
  }
  return out;
}

export const club: IsoTheme = {
  id: 'club',
  name: 'Underground Club',
  tagline: '128 BPM, neon on the floor and agents in the booth',
  palette: P,
  backdrop: BACKDROP,
  wallH: WALL_H,
  floor,
  wall,
  stations: { write, read, search, run, web, think, idle, entrance },
  ambient,
  lighting: { ambient: hex('#8676a8'), haze: 0.24, bloom: 0.7, vignette: 0.3, lights: roomLights },
};

export default club;
