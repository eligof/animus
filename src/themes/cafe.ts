import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import type { Box, Face } from '../iso/box.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import type { Placed, Room } from '../iso/room.ts';
import { localToScreen, wallToScreen } from '../iso/room.ts';
import type { IsoStation, IsoTheme, Palette, RoomLight } from './types.ts';
import { frac, inside, noise } from './art.ts';

const P: Palette = {
  bg: hex('#1c130e'),
  wall: hex('#ecdcc0'),
  wall2: hex('#e2cdab'),
  floor: hex('#a36b40'),
  floor2: hex('#8d5a35'),
  text: hex('#3b2a1e'),
  dim: hex('#8b7360'),
  accent: hex('#8fae8b'),
  accent2: hex('#d0784f'),
  panel: hex('#2a1d15'),
  panelText: hex('#f5e9d6'),
  border: hex('#b9875a'),
  bubble: hex('#fff8ec'),
  bubbleText: hex('#3b2a1e'),
  good: hex('#8fbf7a'),
  warn: hex('#e8a94e'),
  bad: hex('#c8553d'),
};

// Every colour a painter can return is built once, here. One pixel is about
// 0.17 units at the largest tile size, so details are sized in those steps.
const C = {
  plaster: hex('#efdcbd'),
  plaster2: hex('#ead6b5'),
  plasterTop: hex('#e2cba5'),
  crown: hex('#f0e1c3'),
  crownLo: hex('#d8c29c'),
  sage: hex('#94b18f'),
  sageHi: hex('#aac4a4'),
  sageLo: hex('#76947a'),
  sagePanel: hex('#8aa886'),
  rail: hex('#6b4429'),
  railHi: hex('#93613a'),
  base: hex('#4a2f1d'),
  walnut: hex('#5d3b24'),
  walnutHi: hex('#80553a'),
  walnutDark: hex('#3e2718'),
  oak: hex('#b07a45'),
  oakSeam: hex('#8a5c32'),
  cream: hex('#f4e9d5'),
  creamDark: hex('#d9c8a8'),
  terra: hex('#c4663f'),
  terraDark: hex('#94472b'),
  terraHi: hex('#da8058'),
  mustard: hex('#d9a441'),
  mustardDark: hex('#a97a26'),
  leaf: hex('#5f8f4e'),
  leafHi: hex('#86b46b'),
  leafDark: hex('#41693a'),
  rope: hex('#e9d9b8'),
  brass: hex('#d4a94a'),
  brassHi: hex('#f1d27c'),
  brassDark: hex('#94712a'),
  ink: hex('#2b1d14'),
  frame: hex('#f6eedc'),
  frameLo: hex('#cdbd9f'),
  sill: hex('#e9dec8'),
  sillLo: hex('#b9a888'),
  // glass
  rain: hex('#dce7f0'),
  rainCity: hex('#8795a6'),
  drop: hex('#f7fbff'),
  cityFar: hex('#71819a'),
  cityNear: hex('#4c596a'),
  lit: hex('#f3c879'),
  street: hex('#3a4452'),
  // chalk & clock
  board: hex('#2f3a33'),
  chalk: hex('#ece6d6'),
  chalkY: hex('#ecd28a'),
  chalkP: hex('#e9a9a0'),
  clockFace: hex('#fffaf0'),
  // lights
  wire: hex('#8c6c52'),
  bulb: [hex('#b98a52'), hex('#ffcf7a'), hex('#fff1c6')],
  // floor
  seam: hex('#7a4e2f'),
  wood: [hex('#a8703f'), hex('#a26b3c'), hex('#ad7443'), hex('#a46d3e')],
  // rug
  rugField: hex('#b85e3c'),
  rugBorder: hex('#6e3a26'),
  rugCream: hex('#efdfc0'),
  rugSage: hex('#8fae8b'),
  rugMustard: hex('#d9a441'),
  // pictures
  printSky: hex('#f2c39a'),
  printSage: hex('#b7cdb1'),
  printMustard: hex('#efd59a'),
  hill: hex('#8fae8b'),
  hillDark: hex('#6f8f6b'),
  sun: hex('#fff1d6'),
  // things
  laptop: hex('#c9c4bb'),
  laptopDark: hex('#77726a'),
  screenOff: hex('#22303a'),
  doc: hex('#fbf3e4'),
  docInk: hex('#8a7563'),
  keyLit: hex('#fff1c6'),
  coffee: hex('#4a2c1a'),
  crema: hex('#c08a50'),
  cup: hex('#f6f0e6'),
  chrome: hex('#c3c9cd'),
  chromeHi: hex('#eef2f3'),
  chromeDark: hex('#7f878d'),
  enamel: hex('#b5452f'),
  enamelHi: hex('#cf5d44'),
  bean: hex('#4e2f1c'),
  beanHi: hex('#7a4a2a'),
  glass: hex('#d4e0e5'),
  croissant: hex('#d9963f'),
  croissantHi: hex('#f0bb63'),
  counter: hex('#6f8f6b'),
  counterLo: hex('#5a7857'),
  counterHi: hex('#89a885'),
  paper: hex('#ece6d8'),
  paperHi: hex('#fbf8f0'),
  headline: hex('#3d342c'),
  newsText: hex('#a39b8f'),
  photo: hex('#8d867b'),
  black: hex('#2a2420'),
  shadeOff: hex('#d8c7a4'),
  shadeOn: hex('#ffe3a3'),
  shadeOnHi: hex('#fff6dc'),
  armchair: hex('#d9a441'),
  armchairHi: hex('#e8b95c'),
  sofa: hex('#b65d3d'),
  sofaHi: hex('#c96f4c'),
  sofaDark: hex('#8f4529'),
  knit: hex('#efe3cc'),
  knitLo: hex('#d3c2a3'),
  cat: hex('#e3994f'),
  catStripe: hex('#b86f2f'),
  catPale: hex('#f7e1c0'),
  catEye: hex('#5f8f4e'),
  door: hex('#3f5e4c'),
  doorHi: hex('#557a63'),
  doorLo: hex('#2c4437'),
  sign: hex('#f4e9d5'),
  signRed: hex('#c8553d'),
  umbrellaA: hex('#d9a441'),
  umbrellaB: hex('#5c7f8f'),
  phoneBook: hex('#e2c25a'),
};

const BOOKS = ['#c4663f', '#8fae8b', '#d9a441', '#6f8fa6', '#8c5a7a', '#efdfc0', '#5f7f5a', '#a8543a'].map(hex);
const JARS = [C.bean, C.leaf, C.cream, C.croissant];
const SKY: RGB[] = Array.from({ length: 10 }, (_, i) => mix(hex('#b6c2cc'), hex('#5f6f83'), i / 9));
const RAIN_SKY: RGB[] = SKY.map((s) => mix(s, C.rain, 0.5));
const FOGGED: RGB[] = SKY.map((s) => mix(s, hex('#e6ebee'), 0.5));
const STREET: RGB[] = SKY.map((s) => scale(s, 0.72));
const WOOD_HI = C.wood.map((w) => scale(w, 1.05));
const COUNTER_PANEL = scale(C.counter, 0.93);
const GLOW = hex('#ffcf7a');
const STEAM = hex('#fbf6ee');
const LAMP = hex('#ffd98c');
const SPARK = hex('#fff1c6');

const box = (a: number, b: number, z: number, len: number, dep: number, h: number, color: RGB, paint?: Box['paint']): Box => ({ a, b, z, len, dep, h, color, paint });
const front = (f: Face) => f === 'front';
const sq = (x: number) => x * x;
const PX = 1 / 6; // one pixel at the largest tiles

// ── glass: a rainy grey-blue afternoon over a soft city skyline ──────────
// (x, y) inside the glass, y = 0 at the bottom, h its height.
function glass(x: number, y: number, h: number, t: number, seed: number, mode: number): RGB {
  const fy = y / h;
  const col = Math.floor(x * 6) + seed * 37;
  let rain = false;
  if (noise(col, 41) < 0.45) {
    const len = 0.25 + noise(col, 47) * 0.4;
    const span = h + len;
    const head = h - frac(noise(col, 53) + (t * (0.5 + noise(col, 43) * 0.6)) / span) * span;
    if (y >= head && y < head + len) {
      if (y < head + PX) return C.drop;
      rain = true;
    }
  }
  if (mode === 2) {
    // The street seen through an open door.
    if (fy < 0.12) return rain ? C.rainCity : noise(Math.floor(x * 6), Math.floor(t * 2)) > 0.8 ? C.lit : C.street;
    if (fy < 0.3 + noise(Math.floor((x + seed) * 2.5), 67) * 0.25) return rain ? C.rainCity : C.cityNear;
    return rain ? RAIN_SKY[Math.min(9, Math.floor(fy * 10))] : STREET[Math.min(9, Math.floor(fy * 10))];
  }
  const near = Math.floor((x + seed * 1.37) * 3);
  if (fy < 0.06 + noise(near, 61) * 0.2) {
    if (rain) return C.rainCity;
    return noise(Math.floor(x * 6) * 31 + Math.floor(y * 6), seed + 71) > 0.82 ? C.lit : C.cityNear;
  }
  const far = Math.floor((x + seed * 2.11) * 1.8);
  if (fy < 0.2 + noise(far, 67) * 0.26) return rain ? C.rainCity : C.cityFar;
  const k = Math.min(9, Math.floor(fy * 10));
  if (mode === 1) return rain ? C.rain : FOGGED[k];
  return rain ? RAIN_SKY[k] : SKY[k];
}

// A window in its own frame: x in [0, w), y in [0, h). `transom` adds the
// horizontal bar for tall windows.
function pane(x: number, y: number, w: number, h: number, t: number, seed: number, mode: number, transom: boolean): RGB {
  if (x < PX || x >= w - PX || y < PX || y >= h - PX) return C.frame;
  if (Math.abs(x - w / 2) < PX / 2 + 0.01) return C.frame;
  if (transom && Math.abs(y - h * 0.68) < PX / 2 + 0.01) return C.frame;
  if (y >= h - 2 * PX) return C.frameLo; // shadow under the head of the frame
  return glass(x - PX, y - PX, h - 2 * PX, t, seed, mode);
}

const WIN_V0 = 1.62;
const WIN_V1 = 3.3;

function windowAt(u: number, v: number, t: number, u0: number, u1: number, seed: number): RGB | null {
  if (v >= WIN_V0 - 0.2 && v < WIN_V0 && u >= u0 - 0.17 && u < u1 + 0.17) return v > WIN_V0 - 0.08 ? C.sill : C.sillLo;
  if (u < u0 || u >= u1 || v < WIN_V0 || v >= WIN_V1) return null;
  return pane(u - u0, v - WIN_V0, u1 - u0, WIN_V1 - WIN_V0, t, seed, 0, true);
}

// ── wall decor (kept above ~2.4 units, clear of the furniture) ───────────
const CLOCK_U = 5.25;
const CLOCK_V = 2.92;
const CLOCK_R = 0.48;

// True when (du, dv) lies on a clock hand pointing at `turn` (0..1 of a revolution).
function onHand(du: number, dv: number, turn: number, len: number): boolean {
  const a = turn * Math.PI * 2;
  const dx = Math.sin(a);
  const dy = Math.cos(a);
  const proj = du * dx + dv * dy;
  return proj > -0.04 && proj < len && Math.abs(du * dy - dv * dx) < 0.07;
}

function clock(u: number, v: number, now: number): RGB | null {
  const du = u - CLOCK_U;
  const dv = v - CLOCK_V;
  const d2 = du * du + dv * dv;
  if (d2 > CLOCK_R * CLOCK_R) return null;
  if (d2 > sq(CLOCK_R - 0.15)) return C.walnut;
  const date = new Date(now); // local time; only the few face pixels get here
  const min = date.getMinutes() / 60;
  if (onHand(du, dv, min, 0.3)) return C.ink;
  if (onHand(du, dv, ((date.getHours() % 12) + min) / 12, 0.19)) return C.terraDark;
  return C.clockFace;
}

function menuBoard(u: number, v: number): RGB | null {
  if (!inside(u, v, 2.8, 2.38, 4.7, 3.42)) return null;
  if (!inside(u, v, 2.8 + PX, 2.38 + PX, 4.7 - PX, 3.42 - PX)) return C.walnut;
  const x = u - 2.8 - PX;
  if (v >= 3.42 - 2.2 * PX && v < 3.42 - 1.2 * PX) {
    // "MENU" and a little heart.
    const k = (x - 0.45) / 0.22;
    if (k >= 0 && k < 4 && frac(k) < 0.7) return C.chalk;
    if (x > 1.35 && x < 1.5) return C.chalkP;
    return C.board;
  }
  const r = (3.42 - 3.2 * PX - v) / (2 * PX);
  const row = Math.floor(r);
  if (row >= 0 && row < 3 && frac(r) < 0.5) {
    if (x > 0.15 && x < 0.65 + noise(row, 5) * 0.45 && noise(Math.floor(x * 6), row + 11) > 0.15) return C.chalk;
    if (x > 1.25 && x < 1.5) return C.chalkY;
  }
  return C.board;
}

// Two framed prints, x local to the group.
function prints(x: number, v: number, k: number): RGB | null {
  if (inside(x, v, 0.1, 2.48, 1.1, 3.3)) {
    if (!inside(x, v, 0.1 + PX, 2.48 + PX, 1.1 - PX, 3.3 - PX)) return k % 2 ? C.walnutHi : C.brass;
    const hx = x - 0.1 - PX;
    const hv = v - 2.48 - PX;
    const hill = 0.22 + 0.1 * Math.sin(hx * 5 + k * 2);
    if (hv < hill) return hv < hill - 0.17 ? C.hillDark : C.hill;
    if (sq(hx - 0.42) + sq(hv - 0.34) < 0.016) return C.sun;
    return C.printSky;
  }
  if (inside(x, v, 1.35, 2.6, 2.0, 3.34)) {
    if (!inside(x, v, 1.35 + PX, 2.6 + PX, 2.0 - PX, 3.34 - PX)) return C.walnut;
    const cx = x - 1.675;
    const cv = v - 2.6 - PX;
    if (k % 2 === 0) {
      // A coffee cup print.
      if (cv > 0.1 && cv < 0.3 && Math.abs(cx) < 0.14) return cv > 0.24 ? C.coffee : C.terra;
      if (cv > 0.36 && cv < 0.52 && Math.abs(cx - 0.06 * Math.sin(cv * 18)) < 0.06) return C.cream;
      return C.printSage;
    }
    // A pressed leaf.
    if (cv > 0.06 && cv < 0.5 && Math.abs(cx) < 0.15 * Math.sin(((cv - 0.06) / 0.44) * Math.PI)) return Math.abs(cx) < 0.05 ? C.leafDark : C.leaf;
    return C.printMustard;
  }
  return null;
}

const VINE_X = [-0.2, 0.02, 0.21];
const VINE_LEN = [0.55, 0.9, 0.4];

// Macramé hanging planter, x centred on the hanger.
function hangingPlant(x: number, v: number, t: number, k: number): RGB | null {
  if (x < -0.5 || x > 0.5 || v < 1.7) return null;
  if (v >= 2.95) {
    if (v < 3.25 && Math.abs(x) < 0.42 - (v - 2.95) * 1.1) {
      const n = noise(Math.floor(x * 6) + 40, Math.floor(v * 6) + k * 7);
      if (n > 0.2) return n > 0.65 ? C.leafHi : C.leaf;
    }
    if (Math.abs(Math.abs(x) - 0.22 * (1 - (v - 2.95) / 0.7)) < 0.09) return C.rope;
    return null;
  }
  if (v >= 2.62) {
    if (Math.abs(x) < 0.27 - (2.95 - v) * 0.2) return v > 2.84 ? C.terraHi : C.terra;
    return null;
  }
  for (let i = 0; i < 3; i++) {
    const end = 2.62 - VINE_LEN[i] - ((k * 0.13 + i * 0.3) % 0.2);
    if (v < end) continue;
    const vx = VINE_X[i] + 0.06 * Math.sin(v * 5 + t * 0.6 + i + k);
    const dx = Math.abs(x - vx);
    if (dx < 0.09) return frac(v * 3 + i * 0.4) < 0.5 ? C.leafDark : C.leaf;
    if (dx < 0.2 && frac(v * 3 + i * 0.4) < 0.3) return C.leafHi;
  }
  return null;
}

// Floating shelf with jars of beans, tea and sugar and a little plant, x local.
function jarShelf(x: number, v: number): RGB | null {
  if (x < 0 || x > 1.7 || v < 2.55 || v > 3.25) return null;
  if (v < 2.55 + 2 * PX) return v < 2.55 + PX ? C.walnutDark : C.walnutHi;
  const i = Math.floor(x / 0.42);
  const jx = x - i * 0.42;
  if (jx < 0.06 || jx > 0.38) return null;
  const y = v - 2.55 - 2 * PX;
  if (i === 3) {
    if (y < 0.24) return jx > 0.1 && jx < 0.34 ? (y > 0.24 - PX ? C.terraHi : C.terra) : null;
    return y < 0.5 && noise(Math.floor(jx * 6), Math.floor(y * 6)) > 0.3 ? (y > 0.36 ? C.leafHi : C.leaf) : null;
  }
  const top = 0.4 + (i % 2) * PX;
  if (y >= top) return y < top + PX && jx > 0.09 && jx < 0.35 ? C.brass : null;
  if (jx < 0.06 + PX) return C.glass;
  return y < top - PX ? JARS[i] : C.glass;
}

// A string of warm bulbs swagged along the top of each wall.
const BULB_V = 3.24;
function bulbLevel(k: number, side: number, t: number): number {
  const n = noise(k * 2 + side, Math.floor(t * 1.6 + noise(k, side + 5) * 4));
  return n < 0.55 ? 2 : n < 0.88 ? 1 : 0;
}

function lights(side: number, u: number, v: number, t: number): RGB | null {
  const p = frac(u / 1.8) * 2 - 1;
  const wv = 3.5 - 0.2 * (1 - p * p);
  if (v >= wv - PX / 2 && v < wv + PX / 2) return C.wire;
  const k = Math.round((u - 0.45) / 0.9);
  if (k < 0 || Math.abs(u - (0.45 + k * 0.9)) > 0.1 || v > 3.36 || v < 3.12) return null;
  return C.bulb[bulbLevel(k, side, t)];
}

function rightDecor(u: number, v: number, t: number, now: number): RGB | null {
  if (u < 2.7) return windowAt(u, v, t, 0.45, 2.55, 1);
  if (u < 4.75) return menuBoard(u, v);
  if (u < 5.8) return clock(u, v, now);
  const k = Math.floor((u - 5.8) / 6.2);
  const x = u - 5.8 - k * 6.2;
  if (x < 2.15) return prints(x, v, k);
  if (x < 4.7) return windowAt(x, v, t, 2.45, 4.55, k + 3);
  return hangingPlant(x - 5.45, v, t, k + 1);
}

function leftDecor(u: number, v: number, t: number): RGB | null {
  if (u < 1.25) return hangingPlant(u - 0.72, v, t, 0);
  if (u < 3.4) return prints(u - 1.3, v, 1);
  if (u < 5.85) return windowAt(u, v, t, 3.6, 5.65, 2);
  if (u < 7.7) return jarShelf(u - 5.95, v);
  const k = Math.floor((u - 7.7) / 6.4);
  const x = u - 7.7 - k * 6.4;
  if (x < 2.6) return windowAt(x, v, t, 0.35, 2.45, k + 5);
  if (x < 4.8) return prints(x - 2.6, v, k);
  return hangingPlant(x - 5.6, v, t, k + 2);
}

function wainscot(u: number, v: number): RGB {
  if (v > 1.2 - PX) return C.sageHi;
  const pu = frac(u / 0.9) * 0.9;
  if (pu < PX || v < 0.2 + PX || v > 1.2 - 2 * PX) return C.sage;
  if (v > 1.2 - 3 * PX || pu < 2 * PX) return C.sageLo;
  if (v < 0.2 + 2 * PX || pu > 0.9 - PX) return C.sageHi;
  return C.sagePanel;
}

function wall(side: 'left' | 'right', u: number, v: number, t: number, now: number): RGB {
  if (v < 0.2) return C.base;
  if (v < 1.2) return wainscot(u, v);
  if (v < 1.4) return v > 1.4 - PX ? C.railHi : C.rail;
  if (v >= 3.62) return v < 3.62 + PX ? C.crownLo : C.crown;
  if (v > 3.1) {
    const l = lights(side === 'left' ? 1 : 0, u, v, t);
    if (l) return l;
  }
  const d = side === 'right' ? rightDecor(u, v, t, now) : leftDecor(u, v, t);
  if (d) return d;
  if (v > 3.62 - PX) return C.plasterTop;
  return noise(Math.floor(u * 1.5), Math.floor(v * 2) + 300) > 0.7 ? C.plaster2 : C.plaster;
}

// ── floor: staggered oak planks and a rug in the middle ──────────────────
const RUG_X0 = 3;
const RUG_X1 = 7.4;
const RUG_Y0 = 3;
const RUG_Y1 = 6;

function rug(x: number, y: number): RGB {
  const w = RUG_X1 - RUG_X0;
  const d = RUG_Y1 - RUG_Y0;
  const e = Math.min(x, w - x, y, d - y);
  if (e < PX) return C.rugCream;
  if (e < 3 * PX) return C.rugBorder;
  if (e < 4 * PX) return C.rugMustard;
  const dd = Math.abs(x - w / 2) / (w / 2) + Math.abs(y - d / 2) / (d / 2);
  if (dd < 0.22) return C.rugCream;
  if (dd < 0.32) return C.rugMustard;
  if (dd > 0.5 && dd < 0.58) return C.rugSage;
  return C.rugField;
}

function floor(gx: number, gy: number): RGB {
  if (gx >= RUG_X0 && gx < RUG_X1 && gy >= RUG_Y0 && gy < RUG_Y1) return rug(gx - RUG_X0, gy - RUG_Y0);
  const s = gy * 2;
  const row = Math.floor(s);
  const fs = (s - row) / 2; // across the plank, in tiles
  if (fs < PX) return C.seam;
  const g = gx + noise(row, 3) * 3.5;
  const plank = Math.floor(g / 3.5);
  if (g - plank * 3.5 < PX) return C.seam;
  const tone = Math.floor(noise(plank, row * 7 + 1) * C.wood.length);
  return fs > 0.5 - PX ? WOOD_HI[tone] : C.wood[tone];
}

// ── stations ─────────────────────────────────────────────────────────────
const leaves: Box['paint'] = (f, u, v) => (noise(Math.floor(u * 6) + 7, Math.floor(v * 6) + (f === 'top' ? 50 : 0)) > 0.55 ? C.leafHi : undefined);
const cupTop = (rim: number, fill: RGB): Box['paint'] => (f, u, v) => (f === 'top' && u > rim && v > rim && u < 0.2 - rim && v < 0.2 - rim ? fill : undefined);

const write: IsoStation = {
  name: 'laptop table',
  size: { len: 1.6, dep: 1, h: 1.8 },
  light: (_t, active) => ({ a: 0.8, b: 0.9, z: 1.2, color: hex('#bfe6ff'), radius: 0.9, intensity: active ? 0.35 : 0.15 }),
  model: (t, active) => {
    const typed = Math.floor(t * 4) % 18;
    const keyTick = Math.floor(t * 8);
    return [
      box(0.08, 0.08, 0, 0.14, 0.14, 0.95, C.walnutDark),
      box(1.38, 0.08, 0, 0.14, 0.14, 0.95, C.walnutDark),
      box(0.08, 0.78, 0, 0.14, 0.14, 0.95, C.walnutDark),
      box(1.38, 0.78, 0, 0.14, 0.14, 0.95, C.walnutDark),
      box(0, 0, 0.95, 1.6, 1, 0.12, C.oak),
      box(0.08, 0.12, 1.07, 0.22, 0.22, 0.2, C.terra),
      box(0.04, 0.08, 1.27, 0.3, 0.3, 0.22, C.leaf, leaves),
      box(0.4, 0.26, 1.07, 0.95, 0.08, 0.72, C.laptopDark, (f, u, v) => {
        if (!front(f) || !inside(u, v, PX * 0.7, PX * 0.7, 0.95 - PX * 0.7, 0.72 - PX * 0.7)) return undefined;
        const col = Math.floor((u - PX * 0.7) / PX);
        const row = Math.floor((0.72 - PX * 0.7 - v) / PX);
        if (!active) {
          // A lo-fi visualiser while nobody types.
          const lvl = 1 + Math.floor((Math.sin(t * 3.1 + col * 1.9) * 0.5 + 0.5) * 2.6);
          if (3 - row <= lvl && row > 0) return col % 3 === 0 ? C.terra : col % 3 === 1 ? C.sage : C.mustard;
          return C.screenOff;
        }
        if (row % 2 === 1) return C.doc;
        const line = row / 2;
        const cur = Math.floor(typed / 6);
        const len = line < cur ? 3 + Math.floor(noise(line, Math.floor(t / 4.5)) * 2) : line === cur ? typed % 6 : 0;
        if (line === cur && col === len) return Math.floor(t * 3) % 2 ? C.terra : C.doc;
        return col < len ? C.docInk : C.doc;
      }),
      box(0.4, 0.34, 1.07, 0.95, 0.45, 0.05, C.laptop, (f, u, v) => {
        if (f !== 'top' || !inside(u, v, 0.1, 0.06, 0.85, 0.3)) return undefined;
        if (active && noise(Math.floor(u * 6) + Math.floor(v * 6) * 13, keyTick) > 0.75) return C.keyLit;
        return C.laptopDark;
      }),
      box(1.28, 0.46, 1.07, 0.2, 0.2, 0.24, C.terra, cupTop(0.04, C.coffee)),
      box(1.48, 0.52, 1.12, 0.06, 0.08, 0.12, C.terraDark),
    ];
  },
};

const read: IsoStation = {
  name: 'reading nook',
  size: { len: 2.1, dep: 1.05, h: 2.6 },
  light: () => ({ a: 1.8, b: 0.6, z: 2.2, color: LAMP, radius: 1.6, intensity: 0.55 }),
  model: (t, active) => {
    const missing = active ? Math.floor(t * 0.7) % 20 : -1;
    const out: Box[] = [
      box(0, 0, 0, 1.1, 0.42, 2.3, C.walnut, (f, u, v) => {
        if (!front(f) || u < PX || u > 1.1 - PX || v < 0.15 || v > 2.3 - PX) return undefined;
        const band = (v - 0.15) / 0.52;
        const row = Math.floor(band);
        if (frac(band) * 0.52 < PX) return C.walnutHi;
        const col = Math.floor((u - PX) / PX);
        const idx = col + row * 6;
        if (row === 2 && col >= 3) return frac(band) < 0.55 ? (col === 4 ? C.terra : C.walnutDark) : noise(col, Math.floor(v * 6)) > 0.35 ? C.leaf : C.walnutDark;
        if (idx === missing || frac(band) > 0.75 - (noise(idx, 3) > 0.6 ? 0.3 : 0)) return C.walnutDark;
        return BOOKS[Math.floor(noise(idx, 1) * BOOKS.length)];
      }),
      box(0.42, 0.1, 2.3, 0.24, 0.24, 0.14, C.terra),
      box(0.38, 0.06, 2.44, 0.32, 0.32, 0.16, C.leaf, leaves),
      box(1.12, 0.06, 0, 0.28, 0.28, 0.06, C.brassDark),
      box(1.2, 0.14, 0.06, 0.12, 0.12, 1.5, C.brassDark),
      box(1.04, 0, 1.56, 0.44, 0.42, 0.38, active ? C.shadeOn : C.shadeOff, (f, _u, v) => {
        if (f === 'top') return active ? C.shadeOnHi : C.creamDark;
        return active && v < PX ? C.shadeOnHi : undefined;
      }),
      box(1.18, 0.38, 0, 0.12, 0.12, 0.1, C.walnutDark),
      box(1.94, 0.38, 0, 0.12, 0.12, 0.1, C.walnutDark),
      box(1.15, 0.36, 0.1, 0.95, 0.26, 1.2, C.armchair),
      box(1.15, 0.62, 0.1, 0.22, 0.43, 0.66, C.armchair),
      box(1.37, 0.62, 0.1, 0.51, 0.43, 0.4, C.mustardDark),
      box(1.37, 0.62, 0.5, 0.51, 0.41, 0.14, C.armchairHi),
    ];
    if (!active) out.push(box(1.45, 0.7, 0.64, 0.34, 0.24, 0.05, C.terra, (f, u) => (f === 'top' ? (Math.abs(u - 0.17) < 0.04 ? C.creamDark : C.paperHi) : undefined)));
    out.push(box(1.88, 0.62, 0.1, 0.22, 0.43, 0.66, C.armchair), box(1.94, 0.92, 0, 0.12, 0.12, 0.1, C.walnutDark));
    return out;
  },
};

const newspaper = (seed: number): Box['paint'] => (f, u, v) => {
  if (!front(f)) return f === 'top' ? C.paperHi : undefined;
  if (v > 0.44 - 1.6 * PX) return u > 0.08 && u < 0.6 ? C.headline : C.paper;
  if (v > 0.44 - 2.6 * PX) return C.paper;
  if (u < 0.36) return v > 0.08 ? (noise(seed, 9) > 0.5 ? C.photo : C.terraDark) : C.paper;
  return frac(v * 3) < 0.5 ? C.newsText : C.paper;
};

const search: IsoStation = {
  name: 'newspaper rack',
  size: { len: 1, dep: 0.7, h: 1.85 },
  model: (t, active) => {
    const flip = Math.floor(t * 0.8);
    const ph = frac(t * 0.8);
    const out: Box[] = [
      box(0, 0, 0, 0.12, 0.12, 1.7, C.walnut),
      box(0.88, 0, 0, 0.12, 0.12, 1.7, C.walnut),
      box(0.12, 0, 0.1, 0.76, 0.1, 1.5, C.walnutDark),
      box(0.04, 0.02, 1.6, 0.92, 0.1, 0.25, C.terra, (f, u, v) => (front(f) && v > 0.08 && v < 0.08 + PX && u > 0.2 && u < 0.72 && frac(u * 5) < 0.7 ? C.cream : undefined)),
      box(0, 0, 0, 0.12, 0.68, 0.12, C.walnut),
      box(0.88, 0, 0, 0.12, 0.68, 0.12, C.walnut),
    ];
    for (let i = 2; i >= 0; i--) {
      const z = 0.15 + i * 0.55;
      const fb = 0.68 - i * 0.16;
      out.push(box(0.12, 0.1, z, 0.76, fb - 0.1, 0.08, C.oak));
      out.push(box(0.16, fb - 0.26, z + 0.08, 0.68, 0.12, 0.44, C.paper, newspaper(i * 5 + (active ? flip : 0))));
      if (active && i === 2) {
        // A page turning over on the top paper.
        const w = Math.max(0.04, 0.34 * Math.abs(Math.cos(ph * Math.PI)));
        out.push(box(ph < 0.5 ? 0.5 : 0.5 - w, fb - 0.14, z + 0.1, w, 0.04, 0.4, C.paperHi, (ff, _u, v) => (front(ff) && frac(v * 3) < 0.5 ? C.newsText : undefined)));
      }
      out.push(box(0.12, fb - 0.08, z + 0.08, 0.76, 0.08, 0.14, C.walnutHi));
    }
    out.push(box(0, 0.56, 0, 0.12, 0.12, 0.95, C.walnut), box(0.88, 0.56, 0, 0.12, 0.12, 0.95, C.walnut));
    return out;
  },
};

const run: IsoStation = {
  name: 'espresso bar',
  size: { len: 2.1, dep: 1, h: 2.1 },
  light: (_t, active) => ({ a: 1.05, b: 1.4, z: 1.6, color: GLOW, radius: 1.7, intensity: active ? 0.5 : 0.35 }),
  model: (t, active) => {
    const pour = active && frac(t / 3) < 0.75;
    const beans = active ? 0.1 + 0.2 * (1 - frac(t / 6)) : 0.28;
    const out: Box[] = [
      box(0, 0, 0, 2.1, 0.95, 1, C.counter, (f, u, v) => {
        if (f === 'top') return undefined;
        if (v < 0.15) return C.walnutDark;
        const pu = frac(u / 0.7) * 0.7;
        if (pu < PX || v < 0.15 + PX || v > 1 - 2 * PX) return undefined;
        if (pu < 2 * PX || v > 1 - 3 * PX) return C.counterLo;
        if (pu > 0.7 - PX || v < 0.15 + 2 * PX) return C.counterHi;
        return f === 'front' ? COUNTER_PANEL : undefined;
      }),
      box(0, 0, 1, 2.1, 1, 0.1, C.oak, (f, _u, v) => (f === 'top' && frac(v * 3) < 0.17 ? C.oakSeam : undefined)),
      box(0.14, 0.1, 1.1, 1.06, 0.52, 0.8, C.enamel, (f, u, v) => {
        if (f === 'top') return C.enamelHi;
        if (v > 0.8 - PX) return C.chromeHi;
        if (f !== 'front') return undefined;
        if (v < PX) return C.chromeDark;
        const d2 = sq(u - 0.53) + sq(v - 0.5);
        if (d2 < 0.035) {
          if (active && d2 < 0.012 && Math.floor(t * 6) % 2) return C.signRed;
          return d2 > 0.02 ? C.chrome : C.cup;
        }
        return undefined;
      }),
      box(0.2, 0.62, 1.1, 0.94, 0.2, 0.06, C.black),
      box(0.27, 0.62, 1.42, 0.24, 0.16, 0.16, C.chrome),
      box(0.79, 0.62, 1.42, 0.24, 0.16, 0.16, C.chrome),
      box(0.3, 0.66, 1.16, 0.18, 0.16, 0.16, C.cup, cupTop(0.03, active ? C.crema : C.cup)),
    ];
    if (active) out.push(box(0.82, 0.66, 1.16, 0.18, 0.16, 0.16, C.cup, cupTop(0.03, C.crema)));
    if (pour) {
      out.push(box(0.36, 0.71, 1.32, 0.07, 0.07, 0.1, Math.floor(t * 10) % 2 ? C.coffee : C.crema));
      if (frac(t / 3) > 0.25) out.push(box(0.88, 0.71, 1.32, 0.07, 0.07, 0.1, Math.floor(t * 10 + 1) % 2 ? C.coffee : C.crema));
    }
    out.push(
      box(0.34, 0.78, 1.47, 0.1, 0.2, 0.08, C.black),
      box(0.86, 0.78, 1.47, 0.1, 0.2, 0.08, C.black),
      box(0.5, 0.2, 1.9, 0.2, 0.2, 0.16, C.cup),
      box(1.2, 0.46, 1.3, 0.08, 0.08, 0.5, C.chrome),
      box(1.38, 0.14, 1.1, 0.36, 0.36, 0.42, C.walnut, (f, _u, v) => (f !== 'top' && v > 0.2 && v < 0.2 + PX ? C.chrome : undefined)),
      box(1.42 + (active ? Math.sin(t * 40) * 0.015 : 0), 0.18, 1.52, 0.28, 0.28, 0.4, C.glass, (f, u, v) => {
        if (f === 'top') return C.bean;
        if (v >= beans) return u < PX ? C.drop : undefined;
        return noise(Math.floor(u * 6), Math.floor(v * 6)) > 0.6 ? C.beanHi : C.bean;
      }),
      box(1.4, 0.16, 1.92, 0.32, 0.32, 0.08, C.chromeDark),
      box(1.78, 0.5, 1.1, 0.3, 0.36, 0.04, C.cup),
      box(1.81, 0.54, 1.14, 0.24, 0.13, 0.1, C.croissant, (_f, u) => (frac(u * 5) < 0.4 ? C.croissantHi : undefined)),
      box(1.82, 0.7, 1.14, 0.24, 0.13, 0.1, C.croissant, (_f, u) => (frac(u * 5 + 0.5) < 0.4 ? C.croissantHi : undefined)),
    );
    return out;
  },
};

// Notes and postcards pinned to the corkboard above the phone.
const NOTES = [C.cream, C.mustard, C.sage, C.chalkP, C.paperHi, C.terraHi];

const web: IsoStation = {
  name: 'phone corner',
  size: { len: 1.05, dep: 0.62, h: 2.0 },
  model: (t, active) => {
    const ring = active && frac(t / 1.8) < 0.55;
    const hop = ring && Math.floor(t * 12) % 2 ? 0.12 : 0;
    const shuffle = active ? Math.floor(t / 2.5) : 0;
    return [
      box(0.12, 0, 1.16, 0.82, 0.07, 0.72, C.walnut, (f, u, v) => {
        if (!front(f)) return undefined;
        if (u < PX || u > 0.82 - PX || v < PX || v > 0.72 - PX) return undefined;
        const cell = Math.floor((u - PX) / 0.17) + Math.floor((v - PX) / 0.17) * 5;
        const n = noise(cell, 13 + shuffle);
        if (n < 0.45) return C.croissant;
        return NOTES[Math.floor(noise(cell, 17 + shuffle) * NOTES.length)];
      }),
      box(0.1, 0.08, 0, 0.1, 0.1, 0.78, C.walnutDark),
      box(0.85, 0.08, 0, 0.1, 0.1, 0.78, C.walnutDark),
      box(0.12, 0.1, 0.24, 0.8, 0.42, 0.06, C.oak),
      box(0.18, 0.14, 0.3, 0.44, 0.34, 0.14, C.phoneBook, (f) => (f === 'top' ? undefined : C.paper)),
      box(0.21, 0.17, 0.44, 0.38, 0.28, 0.1, C.terra, (f) => (f === 'top' ? undefined : C.paper)),
      box(0.1, 0.46, 0, 0.1, 0.1, 0.78, C.walnutDark),
      box(0.85, 0.46, 0, 0.1, 0.1, 0.78, C.walnutDark),
      box(0.04, 0.04, 0.78, 0.97, 0.56, 0.1, C.oak),
      box(0.66, 0.2, 0.88, 0.28, 0.24, 0.04, C.paperHi, (f, _u, v) => (f === 'top' && frac(v * 6) < 0.5 ? C.newsText : undefined)),
      box(0.18, 0.16, 0.88, 0.44, 0.36, 0.16, C.signRed, (f, u, v) => {
        if (f === 'top') return sq(u - 0.22) + sq(v - 0.22) < 0.018 ? C.cup : undefined;
        return v > 0.16 - PX ? C.terraHi : undefined;
      }),
      box(0.14, 0.16, 1.04 + hop, 0.52, 0.12, 0.08, C.black),
      box(0.14, 0.16, 1.12 + hop, 0.1, 0.12, 0.06, C.black),
      box(0.56, 0.16, 1.12 + hop, 0.1, 0.12, 0.06, C.black),
    ];
  },
};

const think: IsoStation = {
  name: 'window seat',
  size: { len: 2.2, dep: 0.85, h: 2.4 },
  light: () => ({ a: 1.1, b: 0.8, z: 2, color: hex('#a9cfff'), radius: 1.6, intensity: 0.3 }),
  model: (t, active) => {
    const out: Box[] = [
      box(0.15, 0, 0.95, 1.9, 0.06, 1.38, C.frame, (f, u, v) => {
        if (!front(f)) return undefined;
        // When someone sits here the glass fogs up and a heart gets drawn in it.
        if (active && v > 0.2 && v < 1.2) {
          const hx = (u - 1.4) / 0.3;
          const hy = (v - 0.62) / 0.3;
          const r = hx * hx + hy * hy - 1;
          if (r * r * r - hx * hx * hy * hy * hy < 0) return SKY[Math.min(9, Math.floor((v / 1.38) * 10))];
        }
        return pane(u, v, 1.9, 1.38, t, 7, active ? 1 : 0, false);
      }),
      box(0.08, 0, 0.88, 2.04, 0.2, 0.07, C.sill),
      box(0.02, 0.06, 0.95, 0.22, 0.1, 1.36, C.cream, (f, u) => (front(f) && frac(u / 0.11) < 0.5 ? C.creamDark : undefined)),
      box(1.96, 0.06, 0.95, 0.22, 0.1, 1.36, C.cream, (f, u) => (front(f) && frac(u / 0.11) < 0.5 ? C.creamDark : undefined)),
      box(0, 0.08, 2.3, 2.2, 0.08, 0.08, C.walnut),
      box(0, 0, 0, 2.2, 0.84, 0.5, C.walnut, (f, u, v) => {
        if (!front(f)) return undefined;
        const pu = frac(u / 0.55) * 0.55;
        if (v < PX || v > 0.5 - PX || pu < PX) return undefined;
        if (v > 0.5 - 2 * PX || pu < 2 * PX) return C.walnutDark;
        return C.walnutHi;
      }),
      box(0.04, 0.04, 0.5, 2.12, 0.78, 0.14, C.sage, (f, u) => (f === 'top' && frac(u / 0.53) * 0.53 < PX ? C.sageLo : undefined)),
      box(1.74, 0.03, 0.95, 0.22, 0.16, 0.2, C.terra),
      box(1.7, 0.01, 1.15, 0.3, 0.2, 0.22, C.leaf, leaves),
      box(0.14, 0.06, 0.64, 0.44, 0.2, 0.4, C.terra, (f, u, v) => (front(f) && Math.abs(u - 0.22) < 0.08 && Math.abs(v - 0.2) < 0.08 ? C.terraDark : undefined)),
    ];
    if (active) {
      out.push(
        box(0.68, 0.36, 0.64, 0.4, 0.26, 0.05, C.sage, (f, u) => (f === 'top' ? (Math.abs(u - 0.2) < 0.05 ? C.creamDark : C.paperHi) : undefined)),
        box(1.18, 0.42, 0.64, 0.2, 0.2, 0.22, C.cup, cupTop(0.04, C.coffee)),
      );
    } else {
      out.push(box(0.7, 0.24, 0.64, 0.75, 0.48, 0.1, C.knit, (f, u, v) => ((f === 'top' ? frac(u * 3) : frac(v * 6)) < 0.5 ? C.knitLo : undefined)));
    }
    out.push(box(1.64, 0.06, 0.64, 0.44, 0.2, 0.4, C.mustard, (f, u, v) => (front(f) && Math.abs(u - 0.22) < 0.08 && Math.abs(v - 0.2) < 0.08 ? C.mustardDark : undefined)));
    return out;
  },
};

const stripes: Box['paint'] = (f, u) => (f !== 'side' && frac(u * 3) < 0.5 ? C.catStripe : undefined);

const idle: IsoStation = {
  name: 'sofa',
  size: { len: 2.4, dep: 1.05, h: 1.4 },
  model: (t, active) => {
    const breath = 0.5 + 0.5 * Math.sin(t * 1.9);
    const out: Box[] = [
      box(0.08, 0.08, 0, 0.14, 0.14, 0.12, C.walnutDark),
      box(2.18, 0.08, 0, 0.14, 0.14, 0.12, C.walnutDark),
      box(0, 0.04, 0.12, 2.4, 0.34, 1.22, C.sofa, (f, u, v) => {
        if (!front(f)) return f === 'top' ? C.sofaHi : undefined;
        if (v > 1.22 - PX) return C.sofaHi;
        if (v > 0.4 && Math.abs(u - 1.2) < PX / 2 + 0.01) return C.sofaDark;
        if (v > 0.78 && v < 0.78 + PX && (Math.abs(u - 0.62) < 0.09 || Math.abs(u - 1.78) < 0.09)) return C.sofaDark;
        return undefined;
      }),
      box(0, 0.38, 0.12, 2.4, 0.66, 0.32, C.sofaDark),
      box(0.08, 0.88, 0, 0.14, 0.14, 0.12, C.walnutDark),
      box(0, 0.38, 0.44, 0.32, 0.66, 0.38, C.sofa),
      box(0.32, 0.38, 0.44, 0.88, 0.64, 0.17, C.sofaHi, (f, u) => (front(f) && u > 0.88 - PX ? C.sofaDark : undefined)),
      box(1.2, 0.38, 0.44, 0.88, 0.64, 0.17, C.sofaHi),
      box(0.36, 0.4, 0.61, 0.4, 0.2, 0.4, C.cream, (f, u, v) => (front(f) && frac((u + v) * 3) < 0.3 ? C.creamDark : undefined)),
      box(1.26, 0.42, 0.61, 0.8, 0.58, 0.05, C.knit, (f, u, v) => ((f === 'top' ? frac(u * 3) : frac(v * 6)) < 0.5 ? C.knitLo : undefined)),
    ];
    if (active) {
      // Awake: sitting up, eyes open, tail swishing.
      const tail = Math.sin(t * 3) * 0.12;
      out.push(
        box(1.78, 0.62 + tail, 0.66, 0.34, 0.12, 0.1, C.catStripe),
        box(1.5, 0.56, 0.66, 0.34, 0.32, 0.42, C.cat, stripes),
        box(1.52, 0.6, 1.08, 0.3, 0.3, 0.26, C.cat, (f, u, v) => {
          if (f === 'front' && v > 0.1 && v < 0.1 + PX && (Math.abs(u - 0.08) < 0.05 || Math.abs(u - 0.22) < 0.05)) return C.catEye;
          if (f === 'front' && v < 0.08) return C.catPale;
          return undefined;
        }),
        box(1.53, 0.66, 1.34, 0.1, 0.08, 0.06, C.catStripe),
        box(1.72, 0.66, 1.34, 0.1, 0.08, 0.06, C.catStripe),
      );
    } else {
      // Asleep: a curled ginger loaf that breathes.
      out.push(
        box(1.34, 0.56, 0.66, 0.22, 0.3, 0.24, C.cat, (f, u, v) => (f === 'front' && v < 0.1 && u > 0.04 && u < 0.18 ? C.catPale : undefined)),
        box(1.35, 0.58, 0.9, 0.08, 0.08, 0.08, C.catStripe),
        box(1.35, 0.76, 0.9, 0.08, 0.08, 0.08, C.catStripe),
        box(1.54, 0.52, 0.66, 0.5, 0.38, 0.19 + breath * 0.1, C.cat, stripes),
        box(1.5, 0.9, 0.66, 0.52, 0.1, 0.09, C.catStripe),
      );
    }
    out.push(box(2.08, 0.38, 0.44, 0.32, 0.66, 0.38, C.sofa), box(2.18, 0.88, 0, 0.14, 0.14, 0.12, C.walnutDark));
    return out;
  },
};

const entrance: IsoStation = {
  name: 'front door',
  size: { len: 1.5, dep: 0.22, h: 2.7 },
  light: (_t, active) => ({ a: 0.75, b: 0.6, z: 2.4, color: LAMP, radius: 1.2, intensity: active ? 0.6 : 0.2 }),
  model: (t, active) => {
    const ding = active && Math.floor(t * 9) % 2 === 1;
    const jingle = active ? (ding ? 0.1 : -0.06) : 0;
    return [
      box(0.02, 0.02, 0, 0.28, 0.18, 0.45, C.terra, (f, _u, v) => (f !== 'top' && v > 0.3 && v < 0.3 + PX ? C.terraDark : f === 'top' ? C.terraDark : undefined)),
      box(0.06, 0.06, 0.45, 0.1, 0.08, 0.6, C.umbrellaA),
      box(0.04, 0.06, 1.05, 0.14, 0.08, 0.08, C.walnut),
      box(0.17, 0.1, 0.45, 0.1, 0.08, 0.48, C.umbrellaB),
      box(0.15, 0.1, 0.93, 0.14, 0.08, 0.08, C.walnut),
      box(0.34, 0, 0, 1.14, 0.1, 2.5, C.walnut, (f, u, v) => {
        if (!front(f) || u < PX || u > 1.14 - PX || v > 2.5 - PX) return undefined;
        const x = u - PX;
        if (active) {
          // Swung open onto the rainy street; the slab shows edge-on at the hinge.
          if (x < 0.2) return x < PX ? C.doorLo : C.door;
          return glass(x - 0.2, v, 2.5 - PX, t, 9, 2);
        }
        if (inside(x, v, 0.17, 1.45, 0.65, 2.2)) {
          if (!inside(x, v, 0.17 + PX, 1.45 + PX, 0.65 - PX, 2.2 - PX)) return C.doorLo;
          return glass(x - 0.17 - PX, v - 1.45 - PX, 0.75 - 2 * PX, t, 4, 0);
        }
        // The OPEN sign hanging under the little window.
        if (inside(x, v, 0.12, 1.02, 0.7, 1.36)) return v > 1.02 + PX && v < 1.36 - PX && x > 0.12 + PX && x < 0.7 - PX ? C.signRed : C.sign;
        if (v < PX) return C.brass;
        if (inside(x, v, 0.68, 1.15, 0.8, 1.32)) return C.brassHi;
        for (let i = 0; i < 2; i++) {
          const pv = 0.25 + i * 0.6;
          if (inside(x, v, 0.12, pv, 0.7, pv + 0.42)) {
            if (v > pv + 0.42 - PX || x < 0.12 + PX) return C.doorLo;
            if (v < pv + PX || x > 0.7 - PX) return C.doorHi;
            return C.door;
          }
        }
        return C.door;
      }),
      box(0.84, 0.1, 2.58, 0.24, 0.06, 0.07, C.brassDark),
      box(0.9 + jingle, 0.1, 2.4, 0.14, 0.1, 0.18, ding ? C.brassHi : C.brass, (f, _u, v) => (f === 'top' || v > 0.18 - PX ? C.brassHi : undefined)),
    ];
  },
};

// ── ambient ──────────────────────────────────────────────────────────────
const SIDES = ['right', 'left'] as const;

function find(room: Room, kind: Placed['kind']): Placed | undefined {
  for (const p of room.placed) if (p.kind === kind) return p;
  return undefined;
}

function steam(c: PixelCanvas, room: Room, p: Placed, a: number, b: number, z: number, t: number, n: number, rise: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const k = frac(t * 0.5 + i / n + noise(i, 31) * 0.2);
    const [x, y] = localToScreen(room, p, a + Math.sin(t * 2.1 + i * 1.7 + k * 4) * 0.1, b, z + k * rise);
    c.blend(x, y, STEAM, alpha * (1 - k));
  }
}

function glow(c: PixelCanvas, x: number, y: number, r: number, col: RGB, alpha: number): void {
  const cx = Math.round(x);
  const cy = Math.round(y);
  const ri = Math.ceil(r);
  for (let dy = -ri; dy <= ri; dy++) {
    for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.hypot(dx, dy * 1.2);
      if (d > r || (dx === 0 && dy === 0)) continue;
      c.blend(cx + dx, cy + dy, col, alpha * (1 - d / r));
    }
  }
}

function ambient(c: PixelCanvas, room: Room, t: number): void {
  const hh = room.iso.hh;
  // Warm halos around the string-light bulbs.
  for (let s = 0; s < 2; s++) {
    const side = SIDES[s];
    const len = side === 'right' ? room.W : room.D;
    for (let k = 0; 0.45 + k * 0.9 < len - 0.1; k++) {
      const lvl = bulbLevel(k, s, t);
      if (lvl === 0) continue;
      const [x, y] = wallToScreen(room, side, 0.45 + k * 0.9, BULB_V);
      glow(c, x, y, Math.max(1.5, hh * 0.5), GLOW, lvl === 2 ? 0.4 : 0.2);
    }
  }
  // Glints of light catching the raindrops on the big windows.
  for (let i = 0; i < 4; i++) {
    const cyc = Math.floor(t * 0.6 + noise(i, 11));
    const p = frac(t * 0.6 + noise(i, 11));
    const right = i % 2 === 0;
    const u = right ? 0.7 + noise(cyc, i + 20) * 1.6 : 3.85 + noise(cyc, i + 20) * 1.55;
    if (u > (right ? room.W : room.D)) continue;
    const [x, y] = wallToScreen(room, right ? 'right' : 'left', u, 3.05 - p * 1.1);
    c.blend(x, y, SPARK, 0.7 * Math.sin(p * Math.PI));
  }
  // Steam from the cups and the espresso machine.
  const desk = find(room, 'write');
  if (desk) steam(c, room, desk, 1.38, 0.56, 1.32, t, 3, 0.8, 0.5);
  const bar = find(room, 'run');
  if (bar) {
    if (bar.users > 0) {
      const burst = frac(t / 3) < 0.75;
      steam(c, room, bar, 1.19, 0.6, 1.4, t * 2.2, 6, 1.1, burst ? 0.8 : 0.3);
      steam(c, room, bar, 0.4, 0.75, 1.34, t, 2, 0.5, 0.45);
    } else steam(c, room, bar, 0.63, 0.27, 1.95, t * 0.6, 2, 0.6, 0.3);
  }
  const seat = find(room, 'think');
  if (seat && seat.users > 0) steam(c, room, seat, 1.28, 0.52, 0.88, t, 3, 0.7, 0.45);
  // The reading lamp pools warm light when someone reads.
  const nook = find(room, 'read');
  if (nook && nook.users > 0) {
    const [x, y] = localToScreen(room, nook, 1.26, 0.21, 1.45);
    glow(c, x, y, hh * 1.3, LAMP, 0.35);
  }
  // The phone rings in bursts.
  const phone = find(room, 'web');
  if (phone && phone.users > 0 && frac(t / 1.8) < 0.55) {
    for (let i = 0; i < 3; i++) {
      const [x, y] = localToScreen(room, phone, 0.5 + (i - 1) * 0.42, 0.2, 2.1 + (i % 2) * 0.15);
      if (Math.floor(t * 8 + i) % 2) c.blend(x, y, SPARK, 0.85);
    }
  }
  // Dust motes drifting in the lamplight.
  for (let i = 0; i < 7; i++) {
    const gx = frac(noise(i, 1) + t * 0.015 * (0.5 + noise(i, 2))) * room.W;
    const gy = 0.5 + noise(i, 4) * (room.D - 1);
    const [x, y] = room.iso.toScreen(gx, gy, 1.2 + noise(i, 5) * 1.6 + Math.sin(t * 0.6 + i) * 0.2);
    c.blend(x, y, SPARK, 0.22 + 0.12 * Math.sin(t * 1.3 + i * 2));
  }
}

// Each lit bulb of the string lights (see wall) casts a small warm pool.
function roomLights(room: Room, t: number): RoomLight[] {
  const out: RoomLight[] = [];
  for (let s = 0; s < 2; s++) {
    const len = s === 0 ? room.W : room.D;
    for (let k = 0; 0.45 + k * 0.9 < len - 0.1; k++) {
      const lvl = bulbLevel(k, s, t);
      if (lvl === 0) continue;
      const u = 0.45 + k * 0.9;
      out.push({ gx: s === 0 ? u : 0.2, gy: s === 0 ? 0.2 : u, gz: BULB_V, color: GLOW, radius: 1, intensity: lvl === 2 ? 0.3 : 0.15 });
    }
  }
  return out;
}

export const cafe: IsoTheme = {
  id: 'cafe',
  name: 'Cozy Café',
  tagline: 'rain on the glass, beans in the grinder, a cat on the sofa',
  palette: P,
  backdrop: hex('#1c130e'),
  wallH: 3.8,
  floor,
  wall,
  stations: { write, read, search, run, web, think, idle, entrance },
  ambient,
  lighting: { ambient: hex('#d4bca6'), haze: 0.1, bloom: 0.4, vignette: 0.3, lights: roomLights },
};

export default cafe;
