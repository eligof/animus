import type { RGB } from '../term/color.ts';
import { hex, mix } from '../term/color.ts';
import type { Box, Face } from '../iso/box.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import { CLEAR } from '../iso/canvas.ts';
import type { Placed, Room } from '../iso/room.ts';
import { localToScreen } from '../iso/room.ts';
import type { IsoStation, IsoTheme, Palette } from './types.ts';
import { frac, inside, noise } from './art.ts';

// Hacker's Den: a basement hideout lit by CRTs. Near-black panels with
// matrix rain, phosphor greens, amber accents and a little hot magenta.

const P: Palette = {
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

const C = {
  // phosphor greens, darkest to brightest
  g0: hex('#04140a'),
  g1: hex('#0b3a1b'),
  g2: hex('#15692f'),
  g3: hex('#22a447'),
  g4: hex('#39ff6e'),
  g5: hex('#c8ffd6'),
  amber: hex('#ffb000'),
  amberMid: hex('#b87a00'),
  amberDim: hex('#5a3d00'),
  magenta: hex('#ff2a8a'),
  magentaPale: hex('#ff9ccb'),
  magentaDim: hex('#5c0f35'),
  red: hex('#e8283c'),
  redDim: hex('#5a0c16'),
  black: hex('#000000'),
  // room shell
  wall: hex('#0e1813'),
  seam: hex('#070c09'),
  rail: hex('#18241d'),
  base: hex('#050806'),
  baseHi: hex('#18211c'),
  tray: hex('#2a3530'),
  trayHi: hex('#46554d'),
  trayLo: hex('#151c18'),
  cap: hex('#030504'),
  // floor
  tileA: hex('#22282b'),
  tileB: hex('#1e2427'),
  tileHi: hex('#2b3236'),
  grout: hex('#0e1214'),
  speckHi: hex('#2a3134'),
  speckLo: hex('#171c1e'),
  glint: hex('#7fa08c'),
  cable: hex('#08090a'),
  cableMid: hex('#2f3538'),
  cableHi: hex('#4a5358'),
  cableG: hex('#145a2c'),
  cableGHi: hex('#2a8c4a'),
  rug: hex('#0f2318'),
  rugEdge: hex('#1b3d29'),
  rugHem: hex('#08140d'),
  trace: hex('#22703f'),
  pad: hex('#b8862a'),
  // materials
  steel: hex('#4b5751'),
  steelHi: hex('#6d7c74'),
  steelLo: hex('#2c3430'),
  graphite: hex('#262c29'),
  desk: hex('#2e2823'),
  deskTop: hex('#4a4038'),
  putty: hex('#4d4c45'),
  puttyLo: hex('#2e2e2a'),
  keyboard: hex('#6a675c'),
  rack: hex('#2b363e'),
  rackHi: hex('#5a6a74'),
  server: hex('#3c4a53'),
  serverHi: hex('#687a85'),
  ledOff: hex('#0c2414'),
  paper: hex('#e8e4d4'),
  paperLo: hex('#b9b3a0'),
  cork: hex('#7c512a'),
  corkHi: hex('#946338'),
  corkLo: hex('#5c3a1c'),
  frame: hex('#3a2615'),
  bean: hex('#5e1a52'),
  beanHi: hex('#7d2a6e'),
  beanLo: hex('#3e0f36'),
  card: hex('#a07a4a'),
  cardHi: hex('#bf9660'),
  cardLo: hex('#6e5030'),
  cheese: hex('#f2c14e'),
  crust: hex('#c98a3e'),
  pepperoni: hex('#b02a24'),
  dish: hex('#aab5af'),
  dishHi: hex('#dfe7e2'),
  dishLo: hex('#6f7a74'),
  scopeBg: hex('#031208'),
  sky: hex('#0e1640'),
  skyLow: hex('#2c1d5c'),
  city: hex('#05060e'),
  cityWin: hex('#ffcf5a'),
  cityWin2: hex('#7ee8ff'),
  cityWinDim: hex('#4a3c18'),
  moon: hex('#f1f0d8'),
  bulb: hex('#ffd27a'),
  clockCase: hex('#0a0705'),
  clockOff: hex('#2e1e00'),
  lampOn: hex('#2bff88'), // the door lamp: also read back by ambient (exact match)
  lampOff: hex('#a8182a'),
};

const BINDERS = ['#2e7d4f', '#d8d2bf', '#b87a00', '#5a6b73', '#8e2a5a', '#2e7d4f', '#1f4f7a'].map(hex);
const MANUALS = ['#a03030', '#1f6f43', '#d8d2bf', '#2a4f7a'].map(hex);
const RACK_LED = [C.g4, C.g4, C.g3, C.amber, C.g4];
const CONSOLE_LED = [C.g4, C.amber, C.magenta];
const CABLES = [hex('#252d29'), hex('#17602f'), hex('#6a1a46')];
const LOOM = [hex('#1c6e38'), hex('#2a3f55'), hex('#8a5c00'), hex('#121614'), hex('#7a1a4e'), hex('#1c6e38')];

// Matrix rain: index 0 is barely-there, 7 is the bright end of a tail.
const RAIN: RGB[] = Array.from({ length: 8 }, (_, i) => mix(C.wall, i < 4 ? C.g2 : C.g3, 0.25 + (i / 7) * 0.75));
const SCOPE: RGB[] = Array.from({ length: 8 }, (_, i) => mix(C.scopeBg, C.g4, i / 7));
const SCREEN_G = { bg: hex('#0f4d25'), bgOn: hex('#156a33'), ink: hex('#5cff8c'), inkHi: C.g5 };
const SCREEN_A = { bg: hex('#5a3a00'), bgOn: hex('#6e4800'), ink: hex('#ffc23a'), inkHi: hex('#ffe9a8') };
const NEON_GLOW = mix(C.wall, C.magenta, 0.28);
const NEON_GLOW_FAR = mix(C.wall, C.magenta, 0.12);
const NEON_OFF = mix(C.wall, C.magenta, 0.35);
const DOOR_LIGHT: RGB[] = Array.from({ length: 8 }, (_, i) => mix(C.black, C.g3, (i / 7) ** 1.6 * 0.75));

const box = (a: number, b: number, z: number, len: number, dep: number, h: number, color: RGB, paint?: Box['paint']): Box => ({ a, b, z, len, dep, h, color, paint });
const front = (f: Face) => f === 'front';

// ── floor ────────────────────────────────────────────────────────────────
// Dark rubber tiles with speckle, a circuit-board rug, a cable run hugging
// the furniture along both walls, and the odd glint. Lines are ~0.2+ tiles
// thick so they stay solid at 5-6 px tiles.
const RUG_X0 = 2.9;
const RUG_Y0 = 2.9;
const RUG_X1 = 6.1;
const RUG_Y1 = 5.3;

function rug(gx: number, gy: number): RGB {
  const ex = Math.min(gx - RUG_X0, RUG_X1 - gx);
  const ey = Math.min(gy - RUG_Y0, RUG_Y1 - gy);
  const e = ex < ey ? ex : ey;
  if (e < 0.12) return C.rugHem;
  if (e < 0.34) return e > 0.2 && e < 0.28 ? C.trace : C.rugEdge;
  // Circuit traces: rows of runs with gold pads at their ends.
  const row = Math.floor((gy - RUG_Y0 - 0.34) / 0.4);
  const fy = frac((gy - RUG_Y0 - 0.34) / 0.4);
  const x = gx - RUG_X0 - 0.34;
  const s0 = noise(row, 51) * 1.2;
  const s1 = s0 + 0.5 + noise(row, 52) * 1.6;
  if (fy > 0.25 && fy < 0.75 && x > s0 && x < s1) return x - s0 < 0.22 || s1 - x < 0.22 ? C.pad : C.trace;
  // A vertical via between rows here and there.
  const vx = 0.4 + noise(row, 53) * 2.0;
  if (fy <= 0.25 && x > vx && x < vx + 0.2 && noise(row, 54) > 0.4) return C.trace;
  return C.rug;
}

function floor(gx: number, gy: number, t: number): RGB {
  // Cable runs hugging the furniture: along the right wall and the left wall.
  if (gy > 1.4 && gy < 1.9 && gx > 1.45) {
    const d = gy - 1.64 - 0.06 * Math.sin(gx * 1.9);
    if (d > -0.16 && d < 0.16) return d > 0.08 ? C.cable : d < -0.08 ? C.cableHi : C.cableMid;
  }
  if (gx > 1.3 && gx < 1.8 && gy > 1.45) {
    const d = gx - 1.54 - 0.06 * Math.sin(gy * 2.1);
    if (d > -0.16 && d < 0.16) return d > 0.08 ? C.cable : d < -0.08 ? C.cableHi : C.cableMid;
  }
  if (gx > RUG_X0 && gx < RUG_X1 && gy > RUG_Y0 && gy < RUG_Y1) return rug(gx, gy);
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  if (fx < 0.09 || fy < 0.09) return C.grout;
  if (fx < 0.2 || fy < 0.2) return C.tileHi;
  const n = noise(Math.floor(gx * 6) + Math.floor(gy * 6) * 4099, 3);
  if (n > 0.93) return C.speckHi;
  if (n < 0.07) return C.speckLo;
  // A glint now and then (scuffed rubber catching the CRT light).
  const tile = ix * 131 + iy * 7919;
  if (noise(tile, 17) > 0.75) {
    const dx = fx - 0.3 - noise(tile, 18) * 0.4;
    const dy = fy - 0.3 - noise(tile, 19) * 0.4;
    if (dx * dx + dy * dy < 0.018 && frac(t * 0.23 + noise(tile, 20)) < 0.1) return C.glint;
  }
  return ((ix + iy) & 1) === 1 ? C.tileA : C.tileB;
}

// ── walls ────────────────────────────────────────────────────────────────
const BASE_TOP = 0.25;
const TRAY_BOT = 3.62;
const TRAY_TOP = 3.8;
const RAIN_TOP = 3.62;

// Columns of falling glyphs: each 0.5-unit column has its own speed, tail
// length and pause, all hashed from the column index.
function rain(side: 'left' | 'right', u: number, v: number, t: number): RGB {
  const cu = u * 2;
  const col = Math.floor(cu);
  if (cu - col >= 0.5) return panel(u, v);
  const id = side === 'left' ? col + 977 : col;
  const h = noise(id, 7);
  const speed = 0.8 + h * 1.4;
  const tail = 0.9 + frac(h * 7.31) * 1.5;
  const cycle = RAIN_TOP + tail + 0.8 + frac(h * 13.7) * 3.5;
  const head = RAIN_TOP - frac((t * speed) / cycle + frac(h * 29.3)) * cycle;
  const d = v - head;
  if (d < 0 || d >= tail) return panel(u, v);
  const cell = Math.floor(v * 5);
  const mutate = noise(cell * 31 + id, 4) > 0.75 ? Math.floor(t * 5) : 0;
  if (d >= 0.2 && noise(id * 131 + cell, 3 + mutate) < 0.3) return panel(u, v);
  if (d < 0.2) return C.g5;
  return RAIN[Math.min(7, Math.floor((1 - d / tail) * 8))];
}

function panel(u: number, v: number): RGB {
  if (frac(u / 2.4) < 0.08) return C.seam;
  if (v >= 1.1 && v < 1.3) return v < 1.2 ? C.seam : C.rail;
  return C.wall;
}

// Cables sagging from the tray (two runs with different spans; some spans
// stay tucked in the tray).
function droop(u: number, v: number, off: number): RGB | null {
  for (let k = 0; k < 2; k++) {
    const span = 1.9 + k * 0.7;
    const x = (u + off + k * 0.9) / span;
    const seg = Math.floor(x);
    const n = noise(seg, k + 40);
    if (n < 0.35) continue;
    const f = x - seg;
    const cv = TRAY_BOT - (0.1 + 0.22 * n) * 4 * f * (1 - f);
    if (v > cv - 0.11 && v < cv + 0.11) return CABLES[n > 0.93 ? 1 + k : 0];
  }
  return null;
}

function tray(u: number, v: number): RGB {
  if (v >= TRAY_TOP) return C.cap;
  if (v >= TRAY_TOP - 0.06) return C.trayHi;
  if (frac(u / 1.6) < 0.12) return C.trayLo;
  return v < TRAY_BOT + 0.05 ? C.trayLo : C.tray;
}

// "HACK_" in a 3x5 pixel font, magenta neon with a blinking green cursor.
const NEON_GLYPHS = [
  [5, 5, 7, 5, 5],
  [2, 5, 7, 5, 5],
  [7, 4, 4, 4, 7],
  [5, 5, 6, 5, 5],
  [0, 0, 0, 0, 7],
];
const NEON_U = 0.6;
const NEON_V = 2.6;
const FPX = 0.2;
const NEON_COLS = 19;

function neonLit(cx: number, cy: number): boolean {
  if (cx < 0 || cy < 0 || cx >= NEON_COLS || cy >= 5) return false;
  const col = cx % 4;
  if (col === 3) return false;
  return ((NEON_GLYPHS[(cx / 4) | 0][cy] >> (2 - col)) & 1) === 1;
}

function neon(u: number, v: number, t: number): RGB | null {
  if (u < NEON_U - 2 * FPX || u >= NEON_U + (NEON_COLS + 2) * FPX || v < NEON_V - 2 * FPX || v >= NEON_V + 7 * FPX) return null;
  const cx = Math.floor((u - NEON_U) / FPX);
  const cy = 4 - Math.floor((v - NEON_V) / FPX);
  if (neonLit(cx, cy)) {
    const g = (cx / 4) | 0;
    if (g === 4) return Math.floor(t * 2) % 2 === 0 ? C.g4 : null;
    // A letter stutters every so often.
    if (noise(g, Math.floor(t * 9)) > 0.985 || (g === 2 && noise(Math.floor(t * 3), 66) > 0.93)) return NEON_OFF;
    return (cy === 0 || cy === 4) && (cx & 1) === 0 ? C.magentaPale : C.magenta;
  }
  let near = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (neonLit(cx + dx, cy + dy) && ((cx + dx) / 4 | 0) < 4) near++;
  if (near >= 2) return NEON_GLOW;
  if (near === 1) return NEON_GLOW_FAR;
  return null;
}

// Wall router: box, two antennas, blinking LEDs, a cable up to the tray.
function router(u: number, v: number, t: number, k: number): RGB | null {
  if (u >= 0.2 && u < 0.4 && v >= 3.1 && v < 3.5) return C.steelLo;
  if (u >= 1.2 && u < 1.4 && v >= 3.1 && v < 3.56) return C.steelLo;
  if (u >= 0.8 && u < 1.0 && v >= 3.1 && v < TRAY_BOT) return C.cable;
  if (!inside(u, v, 0, 2.7, 1.6, 3.1)) return null;
  if (v >= 3.0) return C.steel;
  if (v >= 2.8 && v < 2.9 && u >= 0.2 && u < 1.4) {
    const i = Math.floor((u - 0.2) / 0.2);
    if ((i & 1) === 1) return C.graphite;
    const on = noise(i + k * 9, Math.floor(t * (4 + i)) + k) > 0.35;
    return on ? (i === 4 ? C.amber : C.g4) : C.ledOff;
  }
  return C.graphite;
}

// Basement window high on the left wall: bars, night sky, twinkling city.
function cityWindow(u: number, v: number, t: number): RGB | null {
  if (!inside(u, v, 0.2, 2.4, 2.8, 3.5)) return null;
  if (u < 0.4 || u >= 2.6 || v < 2.5 || v >= 3.4) return v < 2.5 ? C.steelHi : C.steel;
  if ((u >= 1.0 && u < 1.2) || (u >= 1.8 && u < 2.0)) return C.steelLo;
  const b = Math.floor((u - 0.4) / 0.4);
  const top = 2.66 + noise(b, 21) * 0.46;
  if (v < top) {
    const wx = Math.floor((u - 0.4) / 0.2);
    const wy = Math.floor(v * 10);
    if ((wx & 1) === 0 && (wy & 1) === 0 && v < top - 0.08) {
      const id = wx * 17 + wy * 131;
      const n = noise(id, Math.floor(t / 3 + noise(id, 5) * 9));
      if (n > 0.6) return n > 0.93 ? C.cityWin2 : C.cityWin;
      if (n > 0.45) return C.cityWinDim;
    }
    return C.city;
  }
  const mu = u - 2.3;
  const mv = v - 3.22;
  if (mu * mu + mv * mv < 0.014) return C.moon;
  if (noise(Math.floor(u * 10) * 57 + Math.floor(v * 10), 9) > 0.93 && noise(Math.floor(u * 10), Math.floor(t * 1.3)) > 0.3) return C.g5;
  return v > 3.2 ? C.sky : C.skyLow;
}

// Poster: a wireframe planet under a magenta title strip ("hack the
// planet", as far as 5 px of text allows). Bigger rooms only.
const POSTER_U = 7.2;

function poster(u: number, v: number, t: number): RGB | null {
  const x = u - POSTER_U;
  if (!inside(x, v, 0, 2.3, 1.4, 3.5)) return null;
  if (x < 0.1 || x >= 1.3 || v < 2.4 || v >= 3.4) return C.paperLo;
  if (v >= 3.1) {
    const ch = Math.floor((x - 0.2) / 0.2);
    if (x >= 0.2 && x < 1.2 && v < 3.3 && v >= 3.2 && noise(ch, 61) > 0.15) return C.magenta;
    return C.black;
  }
  const du = x - 0.7;
  const dv = v - 2.75;
  const r2 = du * du + dv * dv;
  if (r2 < 0.105) {
    if (r2 > 0.07) return C.g4;
    if (frac((du + t * 0.1) / 0.2) < 0.35 || frac(dv / 0.2) < 0.4) return C.g3;
    return C.g1;
  }
  return C.black;
}

// Amber LED clock on the left wall. The left wall's `u` runs right-to-left
// on screen, so columns are read from the far end. Unlit segments glow
// faintly like a real 7-segment display.
const DIGITS = [
  [7, 5, 5, 5, 7], [2, 6, 2, 2, 7], [7, 1, 7, 4, 7], [7, 1, 7, 1, 7], [5, 5, 7, 1, 1],
  [7, 4, 7, 1, 7], [7, 4, 7, 5, 7], [7, 1, 1, 1, 1], [7, 5, 7, 5, 7], [7, 5, 7, 1, 7],
];
// Local-time offset, looked up once per scene minute rather than per pixel
// (so a DST switch shows up within a minute).
let tzAt = NaN;
let tzMin = 0;
function tzOffset(now: number): number {
  const m = Math.floor(now / 60000);
  if (m !== tzAt) {
    tzAt = m;
    tzMin = new Date(now).getTimezoneOffset();
  }
  return tzMin;
}
const CLOCK_U = 3.2;
const CLOCK_V = 2.4;

function ledClock(u: number, v: number, now: number): RGB | null {
  if (!inside(u, v, CLOCK_U - 0.2, CLOCK_V - 0.2, CLOCK_U + 3.6, CLOCK_V + 1.2)) return null;
  const cx = 16 - Math.floor((u - CLOCK_U) / FPX);
  const cy = 4 - Math.floor((v - CLOCK_V) / FPX);
  if (cx < 0 || cx > 16 || cy < 0 || cy > 4) return C.clockCase;
  const mins = Math.floor(now / 60000 - tzOffset(now));
  const day = ((mins % 1440) + 1440) % 1440;
  if (cx === 8) return (cy === 1 || cy === 3) && Math.floor(now / 1000) % 2 === 0 ? C.amber : C.clockCase;
  const slot = cx < 8 ? (cx / 4) | 0 : 2 + (((cx - 10) / 4) | 0);
  const col = cx < 8 ? cx % 4 : (cx - 10) % 4;
  if (col === 3 || cx === 9) return C.clockCase;
  const hh = Math.floor(day / 60);
  const mm = day % 60;
  const d = slot === 0 ? Math.floor(hh / 10) : slot === 1 ? hh % 10 : slot === 2 ? Math.floor(mm / 10) : mm % 10;
  if (((DIGITS[d][cy] >> (2 - col)) & 1) === 1) return C.amber;
  return ((DIGITS[8][cy] >> (2 - col)) & 1) === 1 ? C.clockOff : C.clockCase;
}

// A 1U switch with port LEDs (left wall, repeating).
function switchBox(u: number, v: number, t: number, k: number): RGB | null {
  if (u >= 0.6 && u < 0.8 && v >= 3.1 && v < TRAY_BOT) return C.cable;
  if (!inside(u, v, 0, 2.8, 1.4, 3.1)) return null;
  if (v >= 3.0) return C.steel;
  if (u >= 0.2 && u < 1.2 && v < 2.9) {
    const i = Math.floor((u - 0.2) / 0.2);
    if ((i & 1) === 1) return C.graphite;
    return noise(i + k * 7, Math.floor(t * 7) + i) > 0.4 ? C.g4 : C.ledOff;
  }
  return C.graphite;
}

function wall(side: 'left' | 'right', u: number, v: number, t: number, now: number): RGB {
  if (v >= TRAY_BOT) return tray(u, v);
  if (v < BASE_TOP) return v >= BASE_TOP - 0.06 ? C.baseHi : C.base;
  if (v > 2.2) {
    if (side === 'right') {
      if (u < 4.8) {
        const n = neon(u, v, t);
        if (n) return n;
      } else {
        const k = Math.floor((u - 4.8) / 6.4);
        const r = router(u - 4.8 - k * 6.4, v, t, k);
        if (r) return r;
      }
      if (u > 4.6 && v > 3.2) {
        const d = droop(u, v, 0);
        if (d) return d;
      }
    } else {
      const w = cityWindow(u, v, t) ?? ledClock(u, v, now) ?? poster(u, v, t);
      if (w) return w;
      if (u >= 9.2) {
        const k = Math.floor((u - 9.2) / 5.2);
        const s = switchBox(u - 9.2 - k * 5.2, v, t, k);
        if (s) return s;
      }
      if (u > 8.8 && v > 3.2) {
        const d = droop(u, v, 0.35);
        if (d) return d;
      }
    }
  }
  return rain(side, u, v, t);
}

// ── stations ─────────────────────────────────────────────────────────────
// A CRT screen painter for a box front: green code, an amber hex dump, or
// a bar graph, scrolling `s` lines. The glass is lit so it reads as a
// glowing screen even at 5-6 px tiles.
function crt(kind: number, len: number, h: number, s: number, t: number, active: boolean): Box['paint'] {
  const pal = kind === 1 ? SCREEN_A : SCREEN_G;
  const bg = active ? pal.bgOn : pal.bg;
  return (f, u, v) => {
    if (f === 'top') return frac(u * 4) < 0.35 && v > 0.15 && v < 0.4 ? C.puttyLo : undefined;
    if (!front(f)) return undefined;
    if (u < 0.12 || u >= len - 0.12 || v < 0.14 || v >= h - 0.1) {
      if (v < 0.1 && u > len - 0.32 && u < len - 0.14) return active ? C.g4 : C.g2;
      return undefined;
    }
    const x = u - 0.12;
    const y = h - 0.1 - v;
    if (kind === 2) {
      const c = Math.floor(x / 0.12);
      const bar = (0.2 + noise(c + s, 31) * 0.7) * (h - 0.24);
      return v - 0.14 < bar && frac(x / 0.12) < 0.6 ? (c === (s & 7) ? pal.inkHi : pal.ink) : bg;
    }
    const row = Math.floor(y / 0.2);
    if ((row & 1) === 1) return bg;
    const line = (row >> 1) + s;
    const w = len - 0.24;
    if (kind === 1) {
      if (frac(x / 0.3) > 0.66) return bg;
      return noise(Math.floor(x / 0.1) + line * 13, 8) > 0.3 ? pal.ink : bg;
    }
    const indent = noise(line, 2) > 0.6 ? 0.12 : 0;
    const end = 0.15 + noise(line, 1) * (w - 0.15);
    if (x < indent || x > end) return row === 0 && x > end && x < end + 0.12 && Math.floor(t * 3) % 2 === 0 ? pal.inkHi : bg;
    if (noise(Math.floor(x / 0.1) + line * 31, 3) < 0.15) return bg;
    return noise(line, 4) > 0.75 ? pal.inkHi : pal.ink;
  };
}

const write: IsoStation = {
  name: 'CRT battlestation',
  size: { len: 2.2, dep: 1.2, h: 2.45 },
  light: (t, active) => ({ a: 1.1, b: 1.8, z: 1.6, color: hex('#2bff88'), radius: 2, intensity: active ? 0.75 + 0.1 * noise(Math.floor(t * 9)) : 0.45 }),
  model: (t, active) => {
    const s = Math.floor(t * (active ? 9 : 1.2));
    return [
      box(0, 0.1, 0, 0.12, 1.05, 0.9, C.desk),
      box(2.08, 0.1, 0, 0.12, 1.05, 0.9, C.desk),
      box(1.45, 0.2, 0, 0.5, 0.8, 0.8, C.graphite, (f, u, v) => {
        if (!front(f)) return undefined;
        if (inside(u, v, 0.08, 0.56, 0.42, 0.68)) return C.seam;
        if (inside(u, v, 0.08, 0.32, 0.22, 0.46)) return C.g4;
        if (inside(u, v, 0.28, 0.32, 0.42, 0.46)) return active && noise(Math.floor(t * 14), 5) > 0.4 ? C.amber : C.amberDim;
        return undefined;
      }),
      box(0, 0, 0.9, 2.2, 1.2, 0.1, C.deskTop),
      box(0.04, 0.16, 1.0, 1.0, 0.54, 0.9, C.putty, crt(0, 1.0, 0.9, s, t, active)),
      box(1.16, 0.16, 1.0, 1.0, 0.54, 0.9, C.putty, crt(1, 1.0, 0.9, s + 3, t, active)),
      box(0.6, 0.2, 1.9, 1.0, 0.48, 0.55, C.putty, crt(2, 1.0, 0.55, Math.floor(t * (active ? 6 : 1)), t, active)),
      box(0.5, 0.82, 1.0, 1.1, 0.26, 0.05, C.keyboard, (f, u, v) => {
        if (f !== 'top') return undefined;
        const key = Math.floor(u * 9) + Math.floor(v * 5) * 11;
        if (active && noise(key, Math.floor(t * 12)) > 0.86) return C.g4;
        return frac(u * 9) < 0.25 || frac(v * 5) < 0.3 ? C.puttyLo : undefined;
      }),
      box(1.84, 0.86, 1.0, 0.15, 0.15, 0.24, C.g3, (f, _u, v) => (f === 'top' ? C.steelHi : v > 0.08 && v < 0.16 ? C.black : undefined)),
    ];
  },
};

const read: IsoStation = {
  name: 'manual stacks',
  size: { len: 1.4, dep: 0.9, h: 1.9 },
  light: (_t, active) => (active ? { a: 0.7, b: 1.2, z: 1.8, color: hex('#ffcf7a'), radius: 1.1, intensity: 0.55 } : null),
  model: (t, active) => {
    const boxes: Box[] = [
      // Low shelf with two rows of binders.
      box(0, 0.05, 0, 1.4, 0.8, 0.76, C.desk, (f, u, v) => {
        if (!front(f)) return undefined;
        if (u < 0.1 || u >= 1.3 || v < 0.06 || v >= 0.7 || (v >= 0.36 && v < 0.42)) return undefined;
        const shelf = v < 0.36 ? 0 : 1;
        const i = Math.floor((u - 0.1) / 0.2) + shelf * 7;
        if (v - (shelf ? 0.42 : 0.06) > 0.18 + noise(i, 11) * 0.1) return C.seam;
        return BINDERS[i % BINDERS.length];
      }),
    ];
    // A leaning tower of manuals: spines and page edges alternate.
    let z = 0.76;
    for (let i = 0; i < 4; i++) {
      const th = 0.18;
      const pages = (i & 1) === 1;
      boxes.push(box(0.1 + noise(i, 71) * 0.08, 0.14 + noise(i, 72) * 0.08, z, 0.56, 0.5, th, MANUALS[i], (f, _u, v) => {
        if (f === 'top' || !pages) return undefined;
        return v > 0.04 && v < th - 0.04 ? C.paper : undefined;
      }));
      z += th;
    }
    if (active) {
      // Open manual on the stack with a page turning over.
      const turn = frac(t * 0.6);
      boxes.push(box(0.12, 0.16, z, 0.56, 0.44, 0.04, C.paperLo, (f, u, v) => {
        if (f !== 'top') return C.paperLo;
        if (Math.abs(u - 0.28) < 0.04) return C.steel;
        return frac(v * 5) < 0.45 && Math.abs(u - 0.28) > 0.08 && u > 0.06 && u < 0.5 ? C.steel : undefined;
      }));
      boxes.push(box(0.14 + turn * 0.4, 0.18, z + 0.04, 0.08, 0.4, 0.05 + Math.sin(turn * Math.PI) * 0.26, C.paper));
    }
    // Desk lamp: weighted base, post, arm and a green enamel shade.
    const bulb = active ? C.bulb : C.amberMid;
    boxes.push(
      box(0.98, 0.3, 0.76, 0.3, 0.3, 0.06, C.graphite),
      box(1.08, 0.4, 0.82, 0.1, 0.1, 0.72, C.steelHi),
      box(0.86, 0.4, 1.5, 0.32, 0.1, 0.1, C.steelHi),
      box(0.74, 0.32, 1.3, 0.3, 0.3, 0.22, C.g2, (f, _u, v) => (f === 'top' ? C.g3 : v < 0.08 ? bulb : undefined)),
    );
    return boxes;
  },
};

const search: IsoStation = {
  name: 'radar scope',
  size: { len: 1.4, dep: 1.0, h: 1.9 },
  light: (t) => ({ a: 0.7, b: 1.4, z: 1.2, color: hex('#3dff7a'), radius: 1.3, intensity: 0.35 + 0.25 * Math.max(0, Math.sin(t * 2.5)) }),
  model: (t, active) => {
    const sweep = t * (active ? 4.2 : 1.1);
    const epoch = Math.floor(t / 9);
    const blips = active ? 4 : 2;
    return [
      box(0, 0.15, 0, 1.4, 0.85, 0.85, C.steelLo, (f, u, v) => {
        if (!front(f)) return f === 'side' && frac(v * 6) < 0.3 && v > 0.15 && v < 0.7 ? C.seam : undefined;
        for (let k = 0; k < 3; k++) {
          const du = u - 0.3 - k * 0.4;
          const dv = v - 0.55;
          if (du * du + dv * dv < 0.01) return k === 1 ? C.amber : C.steelHi;
        }
        if (v >= 0.2 && v < 0.3 && u >= 0.2 && u < 1.2) {
          const i = Math.floor((u - 0.2) / 0.2);
          if ((i & 1) === 1) return undefined;
          return active && noise(i, Math.floor(t * 5)) > 0.4 ? C.g4 : C.ledOff;
        }
        return undefined;
      }),
      box(0.05, 0.05, 0.85, 1.3, 0.4, 1.05, C.steel, (f, u, v) => {
        if (!front(f)) return undefined;
        const du = 0.65 - u;
        const dv = v - 0.52;
        const r = Math.sqrt(du * du + dv * dv);
        if (r > 0.5) return undefined;
        if (r > 0.44) return C.graphite;
        const ang = Math.atan2(dv, du);
        const diff = (((sweep - ang) % 6.2832) + 6.2832) % 6.2832;
        let lvl = diff < 1.8 ? 1 + (1 - diff / 1.8) * 5 : 1;
        if (diff < 0.2) lvl = 7;
        if (Math.abs(r - 0.24) < 0.04 || Math.abs(du) < 0.04 || Math.abs(dv) < 0.04) lvl = Math.max(lvl, 3);
        for (let k = 0; k < blips; k++) {
          const ba = noise(k, epoch * 3 + 1) * 6.2832;
          const br = 0.1 + noise(k, epoch * 3 + 2) * 0.28;
          const bx = Math.cos(ba) * br - du;
          const by = Math.sin(ba) * br - dv;
          if (bx * bx + by * by < 0.004) {
            const since = (((sweep - ba) % 6.2832) + 6.2832) % 6.2832;
            const b = 7 - since * 1.4;
            if (active && k === 0 && b > 2) return C.amber;
            lvl = Math.max(lvl, b);
          }
        }
        return SCOPE[Math.max(0, Math.min(7, Math.floor(lvl)))];
      }),
      box(0, 0.45, 0.85, 1.4, 0.55, 0.08, C.steelLo, (f, u, v) => {
        if (f !== 'top') return undefined;
        if (v < 0.15 || v > 0.4 || u < 0.15 || u > 1.25) return undefined;
        const i = Math.floor((u - 0.15) / 0.2) + (v > 0.28 ? 7 : 0);
        if (frac((u - 0.15) / 0.2) > 0.6) return undefined;
        const on = noise(i, Math.floor(t * (active ? 6 : 1))) > (active ? 0.4 : 0.75);
        return on ? CONSOLE_LED[i % 3] : C.ledOff;
      }),
    ];
  },
};

const run: IsoStation = {
  name: 'server rack',
  size: { len: 1.2, dep: 1.0, h: 3.62 },
  light: (_t, active) => ({ a: 0.6, b: 1.3, z: 2, color: hex('#4fc3ff'), radius: 1.4, intensity: active ? 0.6 : 0.35 }),
  model: (t, active) => {
    const rate = active ? 11 : 1.6;
    const thr = active ? 0.3 : 0.62;
    return [
      box(0, 0, 0, 1.2, 1.0, 2.3, C.rack, (f, u, v) => {
        if (f === 'top') return frac(u * 5) < 0.4 && v > 0.15 && v < 0.85 ? C.server : C.rackHi;
        if (f === 'side') return frac(v * 5) < 0.4 && u > 0.2 && u < 0.8 && v > 0.3 && v < 2.0 ? C.rack : undefined;
        if (u < 0.1 || u >= 1.1 || v < 0.1 || v >= 2.2) return C.rackHi;
        // 2U servers: two faceplate rows and a dark gap.
        const r = Math.floor((2.2 - v) / 0.2);
        const unit = (r / 3) | 0;
        const slot = r - unit * 3;
        if (slot === 2) return C.seam;
        if (u < 0.5) return slot === 0 && frac((u - 0.1) / 0.2) < 0.5 ? C.serverHi : C.server;
        const k = Math.floor((u - 0.5) / 0.2);
        if ((k & 1) === 1 || k > 4) return C.server;
        const id = r * 7 + k;
        const on = noise(id, Math.floor(t * rate + noise(id, 5) * 10)) > thr;
        return on ? RACK_LED[Math.floor(noise(id, 6) * RACK_LED.length)] : C.ledOff;
      }),
      // Cable loom up to the tray.
      box(0.35, 0.05, 2.3, 0.5, 0.2, 1.32, C.cable, (f, u) => {
        if (f === 'top') return undefined;
        return LOOM[Math.floor((f === 'front' ? u : u * 2) / 0.1) % LOOM.length];
      }),
    ];
  },
};

const web: IsoStation = {
  name: 'satellite dish',
  size: { len: 1.3, dep: 1.1, h: 2.3 },
  light: (t) => (Math.floor(t * 1.5) % 2 ? { a: 0.65, b: 0.55, z: 2.2, color: hex('#ff3b4f'), radius: 0.8, intensity: 0.4 } : null),
  model: (t, active) => {
    const blink = Math.floor(t * (active ? 6 : 1)) % 2 === 0;
    return [
      box(0.05, 0.1, 0, 0.4, 0.45, 0.3, C.graphite, (f, u, v) => {
        if (!front(f) || v < 0.12 || v >= 0.2) return undefined;
        const i = Math.floor((u - 0.05) / 0.1);
        if (u < 0.05 || (i & 1) === 1 || i > 5) return undefined;
        return noise(i, Math.floor(t * (active ? 9 : 1.5))) > 0.4 ? C.g4 : C.ledOff;
      }),
      box(0.5, 0.3, 0, 0.36, 0.36, 0.08, C.steelLo),
      box(0.61, 0.41, 0.08, 0.14, 0.14, 1.27, C.steel),
      box(0.56, 0.4, 1.3, 0.24, 0.18, 0.2, C.steelLo),
      box(0.08, 0.58, 1.0, 1.2, 0.1, 1.2, C.dish, (f, u, v) => {
        const du = u - 0.6;
        const dv = v - 0.6;
        const r2 = (du * du + dv * dv) / 0.3364;
        if (f !== 'front') return f === 'top' && Math.abs(du) < 0.12 ? C.dishHi : null;
        if (r2 > 1) return null;
        if (r2 > 0.8) return C.dishHi;
        // Concave bowl: the rim shades the upper part of the inside.
        const s2 = (du * du + (dv - 0.16) * (dv - 0.16)) / 0.3364;
        if (s2 > 0.62) return C.dishLo;
        return r2 < 0.06 ? C.dishLo : C.dish;
      }),
      // Offset feed: an arm from the lower rim out to the LNB.
      box(0.62, 0.68, 1.08, 0.12, 0.34, 0.1, C.graphite),
      box(0.62, 0.94, 1.18, 0.12, 0.1, 0.34, C.graphite),
      box(0.55, 0.9, 1.5, 0.26, 0.2, 0.22, C.steelLo, (f, _u, v) => (f === 'top' ? C.steel : v > 0.07 && v < 0.15 ? (active && blink ? C.g4 : C.ledOff) : undefined)),
      box(0.64, 0.6, 2.2, 0.08, 0.06, 0.1, blink ? C.red : C.redDim),
    ];
  },
};

// Corkboard notes: [u0, v0, u1, v1, kind] (0 photo, 1 sticky, 2 clipping, 3 pink sticky).
const NOTES: ReadonlyArray<readonly [number, number, number, number, number]> = [
  [0.2, 0.78, 0.62, 1.28, 0],
  [1.22, 0.92, 1.58, 1.28, 1],
  [0.74, 0.18, 1.16, 0.58, 2],
  [1.34, 0.2, 1.62, 0.5, 3],
];
const PINS = NOTES.map(([u0, , u1, v1]) => [(u0 + u1) / 2, v1 - 0.06] as const);
const STRINGS = [
  [0, 1], [0, 2], [1, 2], [2, 3], [0, 3],
].map(([i, j]) => {
  const [ax, ay] = PINS[i];
  const [bx, by] = PINS[j];
  const dx = bx - ax;
  const dy = by - ay;
  return { ax, ay, dx, dy, inv: 1 / (dx * dx + dy * dy) };
});
const NOTE_COL = [hex('#b9c2bb'), hex('#e8d44d'), C.paper, hex('#ff7ab8')];
const NOTE_INK = hex('#a8942a');
const STRING_OFF = hex('#7a1420');
const STRING_ON = hex('#d0203a');
const STRING_HOT = hex('#ff5a72');

function cork(u: number, v: number, t: number, active: boolean): RGB | undefined {
  if (u < 0.08 || u >= 1.72 || v < 0.08 || v >= 1.42) return C.frame;
  for (let i = 0; i < PINS.length; i++) {
    const du = u - PINS[i][0];
    const dv = v - PINS[i][1];
    if (du * du + dv * dv < 0.0036) return i % 3 === 1 ? C.amber : C.red;
  }
  for (let i = 0; i < STRINGS.length; i++) {
    const s = STRINGS[i];
    const px = u - s.ax;
    const py = v - s.ay;
    const k = Math.max(0, Math.min(1, (px * s.dx + py * s.dy) * s.inv));
    const ex = px - k * s.dx;
    const ey = py - k * s.dy;
    if (ex * ex + ey * ey < 0.0081) {
      if (!active) return STRING_OFF;
      return frac(k * 1.5 - t * 1.2 + i * 0.37) < 0.3 ? STRING_HOT : STRING_ON;
    }
  }
  for (let i = 0; i < NOTES.length; i++) {
    const [u0, v0, u1, v1, kind] = NOTES[i];
    if (u < u0 || u >= u1 || v < v0 || v >= v1) continue;
    const x = (u - u0) / (u1 - u0);
    const y = (v - v0) / (v1 - v0);
    if (kind === 0) {
      // Photo: a grey silhouette, circled in red.
      const cx = x - 0.5;
      const cy = y - 0.45;
      const r = cx * cx + cy * cy;
      if (r > 0.1 && r < 0.16) return C.red;
      if ((cx * cx + (y - 0.6) ** 2 < 0.03) || (y < 0.35 && Math.abs(cx) < 0.3)) return C.graphite;
      return NOTE_COL[0];
    }
    if (kind === 2) return frac(y * 4) < 0.4 && x > 0.1 && x < 0.9 ? C.paperLo : C.paper;
    if (kind === 1 && y < 0.7 && y > 0.2 && frac(y * 4) < 0.4) return NOTE_INK;
    return NOTE_COL[kind];
  }
  const n = noise(Math.floor(u * 10) * 37 + Math.floor(v * 10), 13);
  return n > 0.8 ? C.corkHi : n < 0.2 ? C.corkLo : C.cork;
}

const think: IsoStation = {
  name: 'conspiracy board',
  size: { len: 1.8, dep: 0.6, h: 2.45 },
  light: () => ({ a: 0.9, b: 0.9, z: 2.2, color: hex('#ffd27a'), radius: 1.5, intensity: 0.5 }),
  model: (t, active) => [
    box(0, 0, 0.95, 1.8, 0.08, 1.5, C.frame, (f, u, v) => (front(f) ? cork(u, v, t, active) : undefined)),
    box(0.5, 0.05, 0, 0.8, 0.55, 0.85, C.steelLo, (f, u, v) => {
      if (!front(f)) return undefined;
      if (frac(v / 0.42) < 0.1) return C.seam;
      if (Math.abs(u - 0.4) < 0.12 && frac(v / 0.42) > 0.55 && frac(v / 0.42) < 0.7) return C.steelHi;
      if (v > 0.6 && v < 0.7 && u > 0.12 && u < 0.32) return C.amber;
      return undefined;
    }),
  ],
};

// Rounds off the corners of a beanbag lump.
function lump(len: number, dep: number, h: number): Box['paint'] {
  return (f, u, v) => {
    const w = f === 'side' ? dep : len;
    if (f === 'top') {
      const eu = Math.min(u, len - u);
      const ev = Math.min(v, dep - v);
      if (eu < 0.08 && ev < 0.08) return null;
      return eu > 0.2 && ev > 0.15 && noise(Math.floor(u * 6) + Math.floor(v * 6) * 9, 2) > 0.7 ? C.beanHi : undefined;
    }
    const eu = Math.min(u, w - u);
    if (eu < 0.07 && v > h - 0.1) return null;
    return v < 0.08 ? C.beanLo : undefined;
  };
}

function pizza(eaten: number): Box['paint'] {
  return (f, u, v) => {
    if (f !== 'top') return undefined;
    const du = u - 0.36;
    const dv = v - 0.4;
    const r2 = du * du + dv * dv;
    if (r2 > 0.09) return u < 0.03 || u > 0.69 || v > 0.75 ? C.cardHi : undefined;
    const slice = Math.floor(((Math.atan2(dv, du) + Math.PI) / 6.2832) * 8) % 8;
    if (slice < eaten) return noise(Math.floor(u * 14) + Math.floor(v * 14) * 15, 4) > 0.8 ? C.cardLo : undefined;
    if (r2 > 0.06) return C.crust;
    return noise(Math.floor(u * 12) + Math.floor(v * 12) * 13, 6) > 0.8 ? C.pepperoni : C.cheese;
  };
}

const idle: IsoStation = {
  name: 'beanbag and pizza',
  size: { len: 2.0, dep: 1.3, h: 0.95 },
  light: () => ({ a: 1, b: 1.6, z: 0.6, color: hex('#ff9a4a'), radius: 1.1, intensity: 0.3 }),
  model: (t, active) => {
    const eaten = active ? 2 + (Math.floor(t / 4) % 5) : 3;
    return [
      box(0.05, 0.15, 0, 1.05, 1.1, 0.32, C.bean, lump(1.05, 1.1, 0.32)),
      box(0.1, 0.16, 0.32, 0.95, 0.46, 0.5, C.bean, lump(0.95, 0.46, 0.5)),
      box(0.12, 0.62, 0.32, 0.9, 0.58, 0.12, C.bean, lump(0.9, 0.58, 0.12)),
      box(1.2, 0.28, 0, 0.72, 0.06, 0.66, C.card, (f, u, v) => {
        if (!front(f)) return undefined;
        if (u < 0.05 || u > 0.67 || v > 0.6) return C.cardLo;
        return noise(Math.floor(u * 8) + Math.floor(v * 8) * 9, 8) > 0.82 ? C.cardLo : C.cardHi;
      }),
      box(1.2, 0.34, 0, 0.72, 0.8, 0.07, C.card, pizza(eaten)),
      box(1.82, 1.12, 0, 0.13, 0.13, 0.22, C.magenta, (f, _u, v) => (f !== 'top' && v > 0.08 && v < 0.14 ? C.g5 : f === 'top' ? C.steelHi : undefined)),
    ];
  },
};

const entrance: IsoStation = {
  name: 'steel hatch',
  size: { len: 1.3, dep: 0.22, h: 2.45 },
  light: (_t, active) => ({ a: 0.65, b: 0.6, z: 2.3, color: hex('#2bff88'), radius: 1, intensity: active ? 0.7 : 0.15 }),
  model: (_t, active) => [
    box(0.3, 0, 0, 1.0, 0.12, 2.45, C.steel, (f, u, v) => {
      if (!front(f)) return undefined;
      if (v >= 2.12) return frac((u + v) * 3) < 0.5 ? C.amber : C.black;
      if (u < 0.14 || u >= 0.86) return u < 0.06 || u >= 0.94 ? C.steelLo : undefined;
      if (active) {
        if (u < 0.24) return C.steelHi;
        if (frac(v * 4) < 0.18) return DOOR_LIGHT[Math.max(0, Math.min(7, Math.round((1 - v / 2.1) * 7)))];
        return DOOR_LIGHT[Math.max(0, Math.min(7, Math.round((1 - v / 2.1) * 5) - 1))];
      }
      const du = u - 0.5;
      const dv = v - 1.1;
      const r2 = du * du + dv * dv;
      if (r2 < 0.07) {
        if (r2 > 0.045 || r2 < 0.004) return C.steelHi;
        if (Math.abs(du) < 0.035 || Math.abs(dv) < 0.035) return C.steelHi;
        return C.steelLo;
      }
      const pv = v - 1.78;
      if (du * du + pv * pv < 0.012) return C.g1;
      if (u < 0.2 || u >= 0.8 || v < 0.06 || v >= 2.05) return frac(v * 3) < 0.1 || frac(u * 4) < 0.08 ? C.steelHi : C.steelLo;
      return frac(v / 0.7) < 0.05 ? C.steelLo : undefined;
    }),
    box(0.36, 0.12, 0, 0.88, 0.1, 0.03, active ? C.g3 : C.steelLo),
    box(0.04, 0, 1.0, 0.22, 0.2, 0.36, C.graphite, (f, u, v) => {
      if (!front(f)) return undefined;
      if (v > 0.26 && v < 0.32 && u > 0.05 && u < 0.17) return active ? C.g4 : C.red;
      if (u > 0.04 && u < 0.18 && v > 0.04 && v < 0.22) return (Math.floor(u * 14) + Math.floor(v * 14)) % 2 === 0 ? C.steelHi : C.steelLo;
      return undefined;
    }),
    box(0.72, 0.12, 2.24, 0.16, 0.08, 0.14, active ? C.lampOn : C.lampOff, () => (active ? C.lampOn : C.lampOff)),
  ],
};

// ── ambient ──────────────────────────────────────────────────────────────
// Additive light straight into the canvas buffer (no allocations).
function addPx(c: PixelCanvas, x: number, y: number, r: number, g: number, b: number): void {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = y * c.w + x;
  const cur = c.data[i];
  if (cur === CLEAR) return;
  const nr = ((cur >> 16) & 255) + r;
  const ng = ((cur >> 8) & 255) + g;
  const nb = (cur & 255) + b;
  c.data[i] = ((nr > 255 ? 255 : nr) << 16) | ((ng > 255 ? 255 : ng) << 8) | (nb > 255 ? 255 : nb);
}

function blendPx(c: PixelCanvas, x: number, y: number, col: RGB, a: number): void {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  if (xi < 0 || yi < 0 || xi >= c.w || yi >= c.h) return;
  const i = yi * c.w + xi;
  const cur = c.data[i];
  if (cur === CLEAR) return;
  const r = (cur >> 16) & 255;
  const g = (cur >> 8) & 255;
  const b = cur & 255;
  c.data[i] = (Math.round(r + (col[0] - r) * a) << 16) | (Math.round(g + (col[1] - g) * a) << 8) | Math.round(b + (col[2] - b) * a);
}

// A soft point light: every pixel around it is mapped back to the floor or
// the wall behind it and brightened by distance. With `wallAbove < 0` it
// lights the floor only; otherwise only wall pixels above that height (so
// furniture standing in front is not washed out). `scan` adds rolling CRT
// scanlines to lit wall pixels.
function light(c: PixelCanvas, room: Room, lx: number, ly: number, lz: number, rad: number, col: RGB, k: number, t: number, wallAbove = -1, scan = 0): void {
  const floorOnly = wallAbove < 0;
  const iso = room.iso;
  const hh = iso.hh;
  const [cx, cy] = iso.toScreen(lx, ly, 0);
  const ext = rad * 1.42 * hh;
  const x0 = Math.max(0, Math.floor(cx - ext));
  const x1 = Math.min(c.w - 1, Math.ceil(cx + ext));
  const y0 = Math.max(0, Math.floor(cy - ext / 2 - room.wallH * hh));
  const y1 = Math.min(c.h - 1, Math.ceil(cy + ext / 2));
  const r2 = rad * rad;
  const roll = (t * 26) % 40;
  for (let py = y0; py <= y1; py++) {
    const sy = py + 0.5;
    const line = scan > 0 ? ((py & 1) === 0 ? 1 : 1 - scan) * (Math.abs(((py - roll) % 40 + 40) % 40 - 3) < 3 ? 1.3 : 1) : 1;
    for (let px = x0; px <= x1; px++) {
      const a = (px + 0.5 - iso.ox) / hh;
      const bsum = (sy - iso.oy) / (hh / 2);
      let gx = (a + bsum) / 2;
      let gy = (bsum - a) / 2;
      let gz = 0;
      let wallPx = false;
      if (gx >= 0 && gy >= 0) {
        if (gx > room.W || gy > room.D || !floorOnly) continue;
      } else if (floorOnly) {
        continue;
      } else if (a >= 0) {
        gx = a;
        gy = 0;
        gz = ((a * hh) / 2 + iso.oy - sy) / hh;
        wallPx = true;
      } else {
        gx = 0;
        gy = -a;
        gz = ((-a * hh) / 2 + iso.oy - sy) / hh;
        wallPx = true;
      }
      if (gz > room.wallH || (wallPx && gz < wallAbove)) continue;
      const dx = gx - lx;
      const dy = gy - ly;
      const dz = gz - lz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 >= r2) continue;
      const f = 1 - d2 / r2;
      const s = f * f * k * (wallPx ? line : 1);
      addPx(c, px, py, (col[0] * s) | 0, (col[1] * s) | 0, (col[2] * s) | 0);
    }
  }
}

const LIGHT_G: RGB = [40, 200, 90];
const LIGHT_A: RGB = [220, 150, 40];
const LIGHT_DOOR: RGB = [30, 230, 110];
const STEAM = hex('#d8e0dc');
const BIT = C.g4;
const BIT_HI = C.g5;
const GLITCH = C.magenta;
const BACKDROP = hex('#020403');
const BACKDROP_PX = (BACKDROP[0] << 16) | (BACKDROP[1] << 8) | BACKDROP[2];
const BIT_SOURCES = ['write', 'run', 'search', 'web', 'write', 'run'];

function stationAt(room: Room, kind: string): Placed | undefined {
  for (const p of room.placed) if (p.kind === kind) return p;
  return undefined;
}

// Where a local station point sits in world coordinates.
function world(p: Placed, a: number, b: number): [number, number] {
  return p.at.wall === 'right' ? [p.at.along + a, p.at.out + b] : [p.at.out + b, p.at.along + a];
}

function ambient(c: PixelCanvas, room: Room, t: number): void {
  const flick = 0.9 + 0.1 * noise(Math.floor(t * 15), 3);
  // CRT glow: a pool on the floor in front of the rig and a scanlined halo
  // on the wall above it.
  const rig = stationAt(room, 'write');
  if (rig) {
    const on = rig.users > 0;
    const [fx, fy] = world(rig, 1.1, 1.9);
    light(c, room, fx, fy, 0.2, 2.4, LIGHT_G, (on ? 0.42 : 0.26) * flick, t);
    const [wx, wy] = world(rig, 1.1, 0);
    light(c, room, wx, wy, 2.2, 1.9, LIGHT_G, (on ? 0.7 : 0.4) * flick, t, 2.45, 0.5);
  }
  // Radar scope casts a faint green wash.
  const radar = stationAt(room, 'search');
  if (radar) {
    const [lx, ly] = world(radar, 0.7, 1.5);
    light(c, room, lx, ly, 0.2, 1.5, LIGHT_G, radar.users > 0 ? 0.24 : 0.1, t);
  }
  // Desk lamp: a warm pool in front of the manuals.
  const lamp = stationAt(room, 'read');
  if (lamp) {
    const on = lamp.users > 0;
    const [lx, ly] = world(lamp, 0.85, 1.3);
    light(c, room, lx, ly, 0.2, on ? 1.7 : 1.2, LIGHT_A, on ? 0.34 : 0.12, t);
  }
  // Open hatch: green light from the stairwell spills across the floor.
  const door = stationAt(room, 'entrance');
  if (door) {
    if (door.users > 0) {
      const [lx, ly] = world(door, 0.8, 0.7);
      light(c, room, lx, ly, 0.1, 2.2, LIGHT_DOOR, 0.45 * flick, t);
    }
  }
  // Signal arcs leaving the dish while someone is online: ")))" upward.
  const dish = stationAt(room, 'web');
  if (dish && dish.users > 0) {
    const [sx, sy] = localToScreen(room, dish, 0.68, 0.7, 2.25);
    const hh = room.iso.hh;
    for (let k = 0; k < 3; k++) {
      const p = frac(t * 0.8 + k / 3);
      const r = 2 + p * hh * 2.4;
      const steps = Math.max(3, Math.round(r * 0.9));
      for (let i = 0; i <= steps; i++) {
        const ang = -1.57 - 0.5 + (i / steps) * 1.0;
        blendPx(c, sx + Math.cos(ang) * r, sy + Math.sin(ang) * r, p < 0.3 ? C.g5 : C.g4, 0.85 * (1 - p));
      }
    }
  }
  // Steam off the pizza while someone lounges.
  const bag = stationAt(room, 'idle');
  if (bag && bag.users > 0) {
    for (let i = 0; i < 4; i++) {
      const p = frac(t * 0.5 + i / 4);
      const [x, y] = localToScreen(room, bag, 1.56 + Math.sin(t * 2 + i * 1.7) * 0.1, 0.74, 0.1 + p * 1.1);
      blendPx(c, x, y, STEAM, 0.5 * (1 - p));
    }
  }
  // Bits drifting up off the machines, livelier while they are busy.
  for (let i = 0; i < 14; i++) {
    const src = stationAt(room, BIT_SOURCES[i % BIT_SOURCES.length]);
    if (!src) continue;
    const size = src.station.size;
    const period = 3 + noise(i, 31) * 3;
    const q = t / period + noise(i, 32);
    const p = frac(q);
    const cycle = Math.floor(q);
    const a0 = 0.1 + noise(i * 7 + cycle, 33) * (size.len - 0.2);
    const top = Math.min(size.h, 2.4);
    const [x, y] = localToScreen(room, src, a0, size.dep * 0.6, top * 0.7 + p * 1.6);
    const busy = src.users > 0;
    const a = Math.sin(p * Math.PI) * (busy ? 0.85 : 0.35);
    const hi = busy && noise(i, Math.floor(t * 4)) > 0.7;
    blendPx(c, x, y, hi ? BIT_HI : BIT, a);
    // A "1" is two pixels tall, a "0" stays a dot.
    if (noise(i * 7 + cycle, 35) > 0.5) blendPx(c, x, y - 1, BIT, a * 0.8);
  }
  // Rare glitch: a short band of rows slips sideways, tinted magenta.
  const g = Math.floor(t / 7);
  const start = g * 7 + noise(g, 91) * 6;
  if (noise(g, 92) > 0.3 && t >= start && t < start + 0.16) {
    const rows = 2 + Math.floor(noise(g, 94) * 4);
    const y0 = Math.floor(noise(g, 93) * Math.max(1, c.h - rows));
    const shift = (noise(g, 95) > 0.5 ? 1 : -1) * (2 + Math.floor(noise(g, 96) * 4));
    const xa = Math.floor(noise(g, 97) * c.w * 0.5);
    const xb = Math.min(c.w, xa + Math.floor(c.w * (0.3 + noise(g, 98) * 0.4)));
    for (let y = y0; y < y0 + rows && y < c.h; y++) {
      const row = y * c.w;
      if (shift > 0) c.data.copyWithin(row + xa + shift, row + xa, row + xb - shift);
      else c.data.copyWithin(row + xa, row + xa - shift, row + xb);
      for (let x = xa; x < xb; x++) if (c.data[row + x] !== BACKDROP_PX) blendPx(c, x, y, GLITCH, 0.3);
    }
  }
}

export const den: IsoTheme = {
  id: 'den',
  name: "Hacker's Den",
  tagline: 'green rain on the walls, pizza on the floor, root on the box',
  palette: P,
  backdrop: BACKDROP,
  wallH: 3.9,
  floor,
  wall,
  stations: { write, read, search, run, web, think, idle, entrance },
  ambient,
  lighting: { ambient: hex('#74847c'), haze: 0.2, bloom: 0.65, vignette: 0.3 },
};

export default den;
