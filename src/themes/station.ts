import type { RGB } from '../term/color.ts';
import { hex, mix } from '../term/color.ts';
import type { Box, Face } from '../iso/box.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import type { Placed, Room } from '../iso/room.ts';
import { localToScreen, wallToScreen } from '../iso/room.ts';
import type { IsoStation, IsoTheme, Palette } from './types.ts';
import { frac, noise } from './art.ts';

// Orbital Station: a cosy deck in orbit. Navy hull plates, a big viewport
// with a turning planet, light consoles with amber and cyan lights.

const WALL_H = 3.6;
const TAU = Math.PI * 2;

const P: Palette = {
  bg: hex('#05070d'),
  wall: hex('#1d2634'),
  wall2: hex('#222c3b'),
  floor: hex('#394559'),
  floor2: hex('#262f3e'),
  text: hex('#e3ecf7'),
  dim: hex('#6f7f96'),
  accent: hex('#ffb238'),
  accent2: hex('#3fd8f2'),
  panel: hex('#0b111c'),
  panelText: hex('#d6e4f2'),
  border: hex('#3a7ca5'),
  bubble: hex('#e9f4ff'),
  bubbleText: hex('#0d1726'),
  good: hex('#4fe08a'),
  warn: hex('#ffb238'),
  bad: hex('#ff5468'),
};

const C = {
  // hull
  plateA: hex('#34405a'),
  plateB: hex('#313c55'),
  plateC: hex('#374461'),
  plateHi: hex('#4b5a79'),
  seam: hex('#1e2638'),
  rivet: hex('#56658a'),
  corner: hex('#262e40'),
  cornerHi: hex('#3a4560'),
  trim: hex('#151a25'),
  trimHi: hex('#46536d'),
  kick: hex('#1b212c'),
  hazY: hex('#f2b233'),
  hazK: hex('#1f2026'),
  // furniture: light "station white" bodies with dark trim
  body: hex('#a3afc3'),
  bodyHi: hex('#d3dbe7'),
  bodyMid: hex('#7a879e'),
  dark: hex('#2b3343'),
  darker: hex('#1a202c'),
  frame: hex('#7c8aa3'),
  frameHi: hex('#a9b6c9'),
  bolt: hex('#d0d9e5'),
  screen: hex('#071422'),
  grid: hex('#123447'),
  cyan: hex('#3fd8f2'),
  cyanDk: hex('#15586a'),
  cyanLt: hex('#b8f6ff'),
  amber: hex('#ffb238'),
  amberDk: hex('#6b4510'),
  amberLt: hex('#ffe2a6'),
  red: hex('#ff5468'),
  redDk: hex('#5a1b26'),
  green: hex('#4fe08a'),
  greenDk: hex('#17462e'),
  purple: hex('#b07cff'),
  white: hex('#f4f9ff'),
  glass: hex('#143140'),
  glassHi: hex('#79b4cc'),
  corridor: hex('#08101a'),
  // space
  space: hex('#03060e'),
  neb1: hex('#090e24'),
  neb2: hex('#150e31'),
  atmo: hex('#6fd0ff'),
  moon: hex('#6c7488'),
  moonHi: hex('#c3c9d6'),
  night: hex('#061020'),
  city: hex('#ffc76a'),
  glintHi: hex('#d6f2ff'),
  glintLo: hex('#3e6382'),
  // deck
  deckA: hex('#2b3240'),
  deckB: hex('#2d3440'),
  deckHi: hex('#3a4251'),
  deckLo: hex('#20252f'),
  deckSeam: hex('#14181f'),
  grateBar: hex('#2a303c'),
  grateHole: hex('#1c2029'),
  guideOff: hex('#2a2418'),
  guideDim: hex('#5a4318'),
};

const BACKDROP = hex('#03050b');
const BACKDROP_PACKED = (BACKDROP[0] << 16) | (BACKDROP[1] << 8) | BACKDROP[2];

// Precomputed ramps: painters index these instead of mixing colours.
function ramp(stops: RGB[], n = 16): RGB[] {
  const out: RGB[] = [];
  for (let i = 0; i < n; i++) {
    const p = (i / (n - 1)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(p));
    out.push(mix(stops[k], stops[k + 1], p - k));
  }
  return out;
}
const lvl = (r: readonly RGB[], k: number): RGB => r[k <= 0 ? 0 : k >= 1 ? r.length - 1 : Math.floor(k * r.length)];

const STAR_FAR = ramp([hex('#1c2442'), hex('#7d8cc0'), hex('#d7e2ff')], 8);
const STAR_NEAR = ramp([hex('#3a4670'), hex('#ffffff')], 8);
const STAR_TINT = [hex('#ffd9a0'), hex('#a8e8ff'), hex('#ffffff')];
const OCEAN = [hex('#0d2547'), hex('#153f72'), hex('#1d5fa3'), hex('#3489d0')];
const LAND = [hex('#22331d'), hex('#365a2a'), hex('#4f863c'), hex('#7db35a')];
const CLOUD = [hex('#323c52'), hex('#7d8ba6'), hex('#c9d4e6'), hex('#ffffff')];
const ICE = [hex('#3c4a60'), hex('#8597b2'), hex('#c4d4e8'), hex('#eef5ff')];
const CORE = ramp([C.glass, C.cyanDk, C.cyan, C.cyanLt]);
const CORE_HOT = ramp([C.cyanDk, C.cyan, C.cyanLt, C.white]);
const RING = ramp([C.cyanDk, C.cyan, C.cyanLt]);
const RING_HOT = ramp([C.amberDk, C.amber, C.amberLt, C.white]);
const RADAR = ramp([hex('#05201a'), hex('#14603f'), C.green, hex('#d0ffe4')]);
const POD_COOL = ramp([C.glass, hex('#1f5a6c'), hex('#6fdaf0')]);
const POD_WARM = ramp([hex('#2a2018'), hex('#8a561c'), C.amber, C.amberLt]);
const CRYSTAL = [
  ramp([hex('#0d2a33'), C.cyan, C.cyanLt], 8),
  ramp([hex('#24173f'), C.purple, hex('#ecd4ff')], 8),
  ramp([hex('#3a2508'), C.amber, C.amberLt], 8),
];
const GUIDE = ramp([C.guideOff, C.amber, C.amberLt], 8);
const DISH = ramp([hex('#6d7a92'), hex('#b4c0d2'), hex('#eef3f9')], 8);
const LEDS = [C.green, C.amber, C.cyan, C.red];
const LEDS_DK = [C.greenDk, C.amberDk, C.cyanDk, C.redDk];
const PLATES = [C.plateA, C.plateB, C.plateC];

const box = (a: number, b: number, z: number, len: number, dep: number, h: number, color: RGB, paint?: Box['paint']): Box => ({ a, b, z, len, dep, h, color, paint });
const isFront = (f: Face) => f === 'front';
const hazard = (u: number, v: number): RGB => (frac((u + v) * 2) < 0.5 ? C.hazY : C.hazK);

// ── space (viewport and portholes) ───────────────────────────────────────
// `w` is the screen-vertical coordinate on a wall (v - u/2), so discs and
// star drift come out round and level on screen.
function space(u: number, w: number, t: number): RGB {
  const nj = Math.floor(w * 5);
  const ni = Math.floor((u + t * 0.11) * 5);
  const n2 = noise(ni, nj * 31 + 7);
  if (n2 > 0.982) {
    const tw = 0.6 + 0.4 * Math.sin(t * 2.3 + n2 * 400);
    return tw > 0.9 ? STAR_TINT[Math.floor(noise(ni, nj + 3) * 3)] : lvl(STAR_NEAR, tw);
  }
  const fi = Math.floor((u + t * 0.035) * 5);
  const n1 = noise(fi, nj * 17 + 101);
  if (n1 > 0.955) return lvl(STAR_FAR, 0.45 + 0.55 * Math.sin(t * (1.2 + n1 * 3) + n1 * 900));
  const neb = Math.sin(u * 1.1 + w * 1.9) * Math.sin(u * 0.6 - w * 1.4 + 1.3);
  return neb > 0.55 ? C.neb2 : neb > 0.25 ? C.neb1 : C.space;
}

const PL_U = 1.75;
const PL_R = 0.7;
const PL_W = 2.36 - PL_U / 2;

function planet(u: number, w: number, t: number): RGB | null {
  const du = u - PL_U;
  const dw = w - PL_W;
  const d2 = du * du + dw * dw;
  const ra = PL_R + 0.14;
  if (d2 >= ra * ra) return null;
  if (d2 >= PL_R * PL_R) return -du * 0.8 + dw * 0.6 > 0.15 ? C.atmo : null;
  const x = du / PL_R;
  const y = dw / PL_R;
  const z = Math.sqrt(Math.max(0, 1 - x * x - y * y));
  const light = -0.62 * x + 0.45 * y + 0.64 * z;
  const lon = Math.atan2(x, z) + t * 0.09;
  const cloud = Math.sin(y * 8 + Math.sin(lon * 3 + t * 0.05) * 1.7) > 0.74;
  const ice = y > 0.8 || y < -0.84;
  const land = !ice && Math.sin(lon * 2.3 + Math.sin(y * 3.1) * 1.4) + 0.6 * Math.sin(lon * 5.7 - y * 4.3 + 1.1) > 0.45;
  if (light < 0.04) {
    if (land && !cloud && noise(Math.floor(lon * 12), Math.floor(y * 8) + 50) > 0.72) return C.city;
    return C.night;
  }
  const k = light > 0.75 ? 3 : light > 0.45 ? 2 : light > 0.18 ? 1 : 0;
  return (cloud ? CLOUD : ice ? ICE : land ? LAND : OCEAN)[k];
}

// ── walls ────────────────────────────────────────────────────────────────
// Right wall: viewport, status panel, vent, repeating every R_PERIOD.
// Left wall: deck sign, porthole, status panel, vent, every L_PERIOD.
const VU0 = 0.6;
const VU1 = 5.4;
const VV0 = 1.2;
const VV1 = 3.25;
const VF = 0.2;
const R_PERIOD = 9.6;
const L_PERIOD = 7.4;

function viewport(uu: number, v: number, t: number, k: number): RGB {
  const eu = Math.min(uu - VU0, VU1 - uu);
  const ev = Math.min(v - VV0, VV1 - v);
  if (eu < VF || ev < VF) {
    if (eu >= VF && frac((uu - VU0) * 1.25) < 0.16) return C.bolt;
    return C.frame;
  }
  if (Math.abs(uu - 3.3) < 0.1) return C.frame;
  const w = v - uu * 0.5;
  const g = frac(t / 9.5) * 9.5;
  if (g < 1.3) {
    const d = uu - 0.6 * w - (-1.6 + (g / 1.3) * 8.5);
    if (d > -0.1 && d < 0.1) return C.glintHi;
    if (d > 0.3 && d < 0.42) return C.glintLo;
  }
  if (k === 0) {
    const pl = planet(uu, w, t);
    if (pl) return pl;
    const mu = uu - 4.3 - 0.45 * Math.sin(t * 0.06);
    const mw = w - 2.75 + 2.15 + 0.1 * Math.cos(t * 0.06);
    if (mu * mu + mw * mw < 0.2 * 0.2) return mu - mw < -0.05 ? C.moonHi : C.moon;
  }
  return space(uu + k * 37.3, w, t);
}

// A 1.4 x 0.9 status panel: a row of blinking LEDs over a bar meter.
function statusPanel(x: number, y: number, t: number, seed: number): RGB {
  if (x < 0.2 || x > 1.2 || y < 0.2 || y > 0.7) return C.frame;
  if (y >= 0.5) {
    const i = Math.floor((x - 0.2) / 0.25);
    if (frac((x - 0.2) / 0.25) > 0.8) return C.screen;
    const id = i + seed * 8;
    const on = noise(id, Math.floor(t * (1 + noise(id, 3) * 3))) > 0.42;
    const c = Math.floor(noise(id, 9) * 4);
    return on ? LEDS[c] : LEDS_DK[c];
  }
  const level = 0.2 + (0.5 + 0.5 * Math.sin(t * 1.7 + Math.floor((x - 0.2) / 0.2) * 1.3 + seed)) * 0.28;
  return y < level && frac((x - 0.2) / 0.2) < 0.6 ? C.cyan : C.screen;
}

// Wall-mounted vent grille.
function vent(x: number, y: number): RGB {
  if (x < 0.2 || x > 0.8 || y < 0.1 || y > 0.6) return C.frame;
  return frac(y * 5) < 0.5 ? C.trim : C.dark;
}

const DIGITS: Record<string, number[]> = { '0': [7, 5, 5, 5, 7], '7': [7, 1, 1, 2, 2] };
const SIGN = ['0', '7'];
const SIGN_W = 1.7;
const SIGN_H = 1.6;

// Deck number plate ("07"), painted dark on a light plate with an amber
// band. `x` runs left to right on screen.
function sign(x: number, y: number): RGB {
  if (x < 0.1 || x > SIGN_W - 0.1 || y < 0.1 || y > SIGN_H - 0.1) return C.frame;
  if (y < 0.3) return C.amber;
  const col = Math.floor((x - 0.25) / 0.2);
  const row = Math.floor((SIGN_H - 0.2 - y) / 0.2);
  if (x >= 0.25 && col < 7 && row >= 0 && row < 5) {
    const cc = col & 3;
    if (cc < 3 && (DIGITS[SIGN[col >> 2]][row] >> (2 - cc)) & 1) return C.trim;
  }
  return C.bodyHi;
}

const PH_U = 2.9;
const PH_V = 2.78;
const PH_R = 0.36;
const PH_RING = 0.5;

function porthole(uu: number, v: number, t: number, k: number): RGB | null {
  const du = uu - PH_U;
  const dw = v - PH_V - du * 0.5;
  const d2 = du * du + dw * dw;
  if (d2 >= PH_RING * PH_RING) return null;
  if (d2 >= PH_R * PH_R) return Math.abs(Math.abs(du) - Math.abs(dw)) < 0.1 ? C.bolt : C.frame;
  if (du < -0.05 && dw > 0.05 && d2 > 0.24 * 0.24) return C.glintLo;
  return space(uu + 11.7 + k * 23.1, dw, t);
}

// Hull plates, 2 x 1.4 units: dark seams, a lit top bevel and a rivet in
// each lower corner.
function hull(u: number, v: number): RGB {
  const pu = u / 2;
  const pv = (v - 0.5) / 1.4;
  const iu = Math.floor(pu);
  const iv = Math.floor(pv);
  const x = (pu - iu) * 2;
  const y = (pv - iv) * 1.4;
  if (x < 0.2 || y < 0.2) return C.seam;
  if (y >= 1.2) return C.plateHi;
  if (y >= 0.3 && y < 0.5 && ((x >= 0.3 && x < 0.5) || (x >= 1.7 && x < 1.9))) return C.rivet;
  return PLATES[Math.floor(noise(iu, iv + 40) * 3)];
}

function wall(side: 'left' | 'right', u: number, v: number, t: number, _now: number): RGB {
  if (v >= WALL_H - 0.3) {
    if (v >= WALL_H - 0.1) return C.trimHi;
    return frac(u / 2) > 0.45 && frac(u / 2) < 0.55 ? C.cyan : C.trim;
  }
  if (v < 0.5) return v < 0.2 ? C.kick : v >= 0.4 ? C.trim : hazard(u, v);
  if (u < 0.2) return u < 0.1 ? C.cornerHi : C.corner;
  if (side === 'right') {
    const k = Math.floor(u / R_PERIOD);
    const uu = u - k * R_PERIOD;
    if (uu >= VU0 && uu < VU1 && v >= VV0 && v < VV1) return viewport(uu, v, t, k);
    if (uu >= 5.9 && uu < 7.3 && v >= 2.3 && v < 3.2) return statusPanel(uu - 5.9, v - 2.3, t, k);
    if (uu >= 7.9 && uu < 8.9 && v >= 2.4 && v < 3.1) return vent(uu - 7.9, v - 2.4);
  } else {
    const k = Math.floor(u / L_PERIOD);
    const uu = u - k * L_PERIOD;
    if (k === 0 && uu >= 0.3 && uu < 0.3 + SIGN_W && v >= 1.45 && v < 1.45 + SIGN_H) return sign(SIGN_W - (uu - 0.3), v - 1.45);
    if (uu >= PH_U - PH_RING && uu < PH_U + PH_RING) {
      const ph = porthole(uu, v, t, k);
      if (ph) return ph;
    }
    if (uu >= 4.0 && uu < 5.4 && v >= 2.3 && v < 3.2) return statusPanel(5.4 - uu, v - 2.3, t, k + 5);
    if (uu >= 5.9 && uu < 6.9 && v >= 2.4 && v < 3.1) return vent(uu - 5.9, v - 2.4);
  }
  return hull(u, v);
}

// ── floor ────────────────────────────────────────────────────────────────
// Grated deck plates and a line of guide lights in front of the furniture
// along both walls, chasing out from the back corner.
const GUIDE_AT = 1.7;

function floor(gx: number, gy: number, t: number): RGB {
  const onX = gy >= GUIDE_AT - 0.08 && gy < GUIDE_AT + 0.08 && gx >= GUIDE_AT - 0.08;
  const onY = gx >= GUIDE_AT - 0.08 && gx < GUIDE_AT + 0.08 && gy >= GUIDE_AT - 0.08;
  if (onX || onY) {
    const s = onX ? gx - GUIDE_AT : gy - GUIDE_AT;
    if (frac(s * 2) > 0.5) return C.guideOff;
    const q = frac((Math.floor(s * 2) - t * 5) / 10);
    return q < 0.3 ? lvl(GUIDE, 1 - q / 0.3) : C.guideDim;
  }
  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const fx = gx - ix;
  const fy = gy - iy;
  if (fx < 0.08 || fy < 0.08) return C.deckSeam;
  if (fx < 0.16 || fy < 0.16) return C.deckHi;
  if (fx > 0.92 || fy > 0.92) return C.deckLo;
  if (ix % 4 === 3 && iy % 4 === 3) {
    const d = Math.abs(fx - 0.54) + Math.abs(fy - 0.54);
    if (d < 0.2) return d < 0.1 ? C.cyan : C.cyanDk;
  }
  const n = noise(ix, iy + 9);
  if (n > 0.8 && fx > 0.26 && fx < 0.74 && fy > 0.26 && fy < 0.74) return frac(gx * 5) < 0.5 ? C.grateHole : C.grateBar;
  return n < 0.15 ? C.deckB : C.deckA;
}

// ── stations ─────────────────────────────────────────────────────────────
// Button row on a console top (u along the console, v toward the room).
function keys(u: number, v: number, tick: number, active: boolean): RGB | undefined {
  if (v < 0.3 || v > 0.5 || frac(u / 0.4) < 0.45) return undefined;
  const id = Math.floor(u / 0.4);
  const c = Math.floor(noise(id, 11) * 3);
  const on = active ? noise(id, tick) > 0.45 : noise(id, 5) > 0.7;
  return on ? LEDS[c] : C.bodyMid;
}

// Desk with a big screen plotting the course; the ship marker blinks.
const write: IsoStation = {
  name: 'nav console',
  size: { len: 1.8, dep: 1, h: 1.8 },
  light: (_t, active) => ({ a: 0.9, b: 1.5, z: 1.4, color: hex('#5ff0ff'), radius: 1.6, intensity: active ? 0.6 : 0.35 }),
  model: (t, active) => {
    const s = t * (active ? 1.5 : 0.25);
    const tick = Math.floor(t * (active ? 7 : 1.5));
    const shipAt = 0.7;
    const course = (x: number) => 0.36 + 0.17 * Math.sin(x * 3.1 + s) + 0.07 * Math.sin(x * 7.3 - s * 1.7);
    const shipY = course(shipAt);
    return [
      box(0.1, 0.05, 0, 1.6, 0.3, 0.85, C.dark),
      box(0.1, 0.06, 0.85, 1.6, 0.2, 0.9, C.body, (f, u, v) => {
        if (!isFront(f)) return undefined;
        if (u < 0.1 || u > 1.5 || v < 0.1 || v > 0.8) return undefined;
        const x = u - 0.1;
        const y = v - 0.1;
        if (Math.abs(x - shipAt) < 0.11 && Math.abs(y - shipY) < 0.11) return tick % 2 ? C.amberLt : C.amber;
        if (Math.abs(y - course(x)) < 0.1) return x < shipAt ? (active ? C.cyanLt : C.cyan) : frac(x * 4) < 0.5 ? C.amber : C.screen;
        if (active && x > 1.1 && frac(y * 4) < 0.5 && noise(Math.floor(y * 4), tick) > 0.4) return C.cyanDk;
        if (frac(x * 2.5) < 0.12 || frac(y * 2.5) < 0.16) return C.grid;
        return C.screen;
      }),
      box(0, 0.35, 0, 1.8, 0.62, 0.72, C.body, (f, u, v) => {
        if (f === 'top') return undefined;
        if (v < 0.12) return C.dark;
        if (isFront(f) && v > 0.44 && v < 0.56) return active ? C.amber : C.dark;
        if (isFront(f) && frac(u / 0.6) < 0.1) return C.bodyMid;
        return undefined;
      }),
      box(0, 0.33, 0.72, 1.8, 0.66, 0.1, C.bodyHi, (f, u, v) => (f === 'top' ? keys(u, v, tick, active) : undefined)),
      box(1.45, 0.6, 0.82, 0.1, 0.1, 0.2, C.dark),
      box(1.42, 0.57, 1.02, 0.16, 0.16, 0.1, active ? C.red : C.redDk),
    ];
  },
};

// Rack of glowing data crystals; when read, a scan line runs down it and
// one crystal sits out on a tray.
const read: IsoStation = {
  name: 'data archive',
  size: { len: 1.3, dep: 0.65, h: 2.05 },
  light: () => ({ a: 0.65, b: 1.1, z: 1.6, color: hex('#6fb6ff'), radius: 1.1, intensity: 0.3 }),
  model: (t, active) => {
    const scan = active ? 1.75 - frac(t * 0.6) * 1.6 : -9;
    const out: Box[] = [
      box(0, 0, 0, 1.3, 0.48, 1.95, C.dark, (f, u, v) => {
        if (f === 'top') return C.body;
        if (f === 'side') return v > 1.5 && v < 1.75 && frac(u * 5) < 0.5 ? C.darker : C.body;
        if (u < 0.12 || u > 1.18 || v < 0.15 || v > 1.8) return C.body;
        const ry = (v - 0.15) / 0.38;
        if (frac(ry) < 0.3) return C.darker;
        if (Math.abs(v - scan) < 0.1) return C.white;
        const cx = (u - 0.12) / 0.4;
        if (frac(cx) > 0.5) return C.darker;
        const id = Math.floor(cx) + Math.floor(ry) * 3;
        if (active && id === 7) return C.darker;
        const hue = Math.floor(noise(id, 4) * 3);
        return lvl(CRYSTAL[hue], 0.55 + 0.45 * Math.sin(t * (active ? 4 : 1.2) + id * 1.7));
      }),
      box(0.08, 0.06, 1.95, 1.14, 0.36, 0.1, active ? C.cyan : C.cyanDk),
    ];
    if (active) {
      const glow = lvl(CRYSTAL[1], 0.75 + 0.25 * Math.sin(t * 6));
      out.push(box(0.4, 0.48, 1.1, 0.42, 0.15, 0.07, C.bodyHi));
      out.push(box(0.55, 0.5, 1.17, 0.12, 0.1, 0.26, glow, () => glow));
    }
    return out;
  },
};

const BLIPS = [
  [0.7, 0.55],
  [2.4, 0.3],
  [4.1, 0.7],
  [5.3, 0.45],
];

// Upright radar scope with a sweeping beam, a small dome on top, and a
// desk of buttons in front.
const search: IsoStation = {
  name: 'scanner',
  size: { len: 1.2, dep: 0.95, h: 2.3 },
  light: (_t, active) => ({ a: 0.6, b: 1.4, z: 1.6, color: hex('#b58cff'), radius: 1.2, intensity: active ? 0.55 : 0.25 }),
  model: (t, active) => {
    const sweep = t * (active ? 3.2 : 1.1);
    const tick = Math.floor(t * (active ? 6 : 1.5));
    const R = 0.5;
    return [
      box(0.05, 0.05, 0, 1.1, 0.3, 2.08, C.body, (f, u, v) => {
        if (!isFront(f)) return undefined;
        const du = u - 0.55;
        const dw = v - 1.42 - du * 0.5;
        const d2 = du * du + dw * dw;
        if (d2 >= (R + 0.12) * (R + 0.12)) return undefined;
        if (d2 >= R * R) return C.dark;
        const ang = Math.atan2(dw, du);
        const diff = (((sweep - ang) % TAU) + TAU) % TAU;
        let k = diff < 1.8 ? (1 - diff / 1.8) * 0.78 : 0;
        for (let i = 0; i < (active ? 4 : 2); i++) {
          const ba = BLIPS[i][0];
          const br = BLIPS[i][1] * R;
          if (Math.abs(du - Math.cos(ba) * br) < 0.1 && Math.abs(dw - Math.sin(ba) * br) < 0.1) {
            const bd = (((sweep - ba) % TAU) + TAU) % TAU;
            k = Math.max(k, 1 - bd / TAU);
          }
        }
        if (k < 0.2 && (Math.abs(Math.sqrt(d2) - R * 0.55) < 0.06 || Math.abs(du) < 0.05)) k = 0.22;
        return lvl(RADAR, k);
      }),
      box(0.3, 0.08, 2.08, 0.6, 0.24, 0.1, C.bodyMid),
      box(0.45, 0.12, 2.18, 0.3, 0.16, 0.12, tick % 2 ? C.amber : C.amberDk),
      box(0, 0.35, 0, 1.2, 0.55, 0.78, C.body, (f, u, v) => {
        if (f === 'top') return undefined;
        if (v < 0.12) return C.dark;
        if (isFront(f) && v > 0.48 && v < 0.62 && frac(u * 2.5) < 0.5) return active && (Math.floor(u * 2.5) + tick) % 3 === 0 ? C.green : C.greenDk;
        return undefined;
      }),
      box(0, 0.33, 0.78, 1.2, 0.6, 0.08, C.bodyHi, (f, u, v) => (f === 'top' ? keys(u, v, tick, active) : undefined)),
    ];
  },
};

// Glass cylinder with a pulsing core and energy rings riding up it; runs
// hot (white core, amber rings) while a command executes.
const run: IsoStation = {
  name: 'reactor',
  size: { len: 1.2, dep: 1.1, h: 2.4 },
  light: (t, active) => ({ a: 0.6, b: 0.55, z: 1.6, color: hex('#7dffea'), radius: 2.2, intensity: 0.45 + 0.15 * Math.sin(t * 3) + (active ? 0.2 : 0) }),
  model: (t, active) => {
    const speed = active ? 1.7 : 0.45;
    const beat = active ? 0.72 + 0.28 * Math.abs(Math.sin(t * 6)) : 0.5 + 0.2 * Math.sin(t * 1.6);
    const core = active ? CORE_HOT : CORE;
    const out: Box[] = [
      box(0.02, 0, 0.3, 0.18, 0.18, 1.74, C.bodyMid),
      box(1, 0, 0.3, 0.18, 0.18, 1.74, C.bodyMid),
      box(0, 0.05, 0, 1.2, 1.05, 0.3, C.dark, (f, u, v) => (f !== 'top' && v > 0.08 && v < 0.24 ? hazard(u, v) : undefined)),
      box(0.25, 0.3, 0.3, 0.7, 0.7, 1.74, C.glass, (f, u, v) => {
        if (f === 'top') return undefined;
        if (u < 0.08) return C.glassHi;
        const edge = Math.abs(u - 0.35) / 0.35;
        const band = frac(v * 1.4 - t * speed) < 0.15 ? 0.3 : 0;
        return lvl(core, beat * (1 - edge * 0.8) + band - (f === 'side' ? 0.12 : 0));
      }),
    ];
    const n = active ? 3 : 2;
    const zs: number[] = [];
    for (let i = 0; i < n; i++) zs.push(0.4 + frac(t * speed * 0.45 + i / n) * 1.5);
    zs.sort((p, q) => p - q);
    const ring = active ? RING_HOT : RING;
    for (const z of zs) {
      const k = 0.55 + 0.45 * Math.sin(z * 3);
      const top = lvl(ring, k);
      const face = lvl(ring, k * 0.8);
      out.push(
        box(0.17, 0.22, z, 0.86, 0.86, 0.08, top, (f, u, v) => {
          if (f === 'top') return u > 0.08 && u < 0.78 && v > 0.08 && v < 0.78 ? null : top;
          return face;
        }),
      );
    }
    out.push(
      box(0.1, 0.12, 2.04, 1, 0.95, 0.2, C.body, (f, u) => (f !== 'top' && frac(u * 5) < 0.4 ? C.bodyMid : undefined)),
      box(0.37, 0.42, 2.24, 0.46, 0.46, 0.14, active ? (Math.floor(t * 5) % 2 ? C.amberLt : C.amber) : C.bodyMid),
    );
    return out;
  },
};

// A big dish facing into the room on a squat pedestal; the transmit rings
// are drawn by `ambient`.
const web: IsoStation = {
  name: 'comms array',
  size: { len: 1.4, dep: 1, h: 2.4 },
  light: (t, active) => (Math.floor(t * (active ? 4 : 1.2)) % 2 ? { a: 0.7, b: 0.5, z: 2.3, color: hex('#59ff8f'), radius: 0.9, intensity: 0.45 } : null),
  model: (t, active) => {
    const tick = Math.floor(t * (active ? 8 : 2));
    const R = 0.68;
    return [
      box(0.3, 0.1, 0, 0.8, 0.6, 0.14, C.dark),
      box(0.55, 0.2, 0.14, 0.3, 0.3, 0.8, C.bodyMid, (f, _u, v) => (f !== 'top' && v > 0.5 && v < 0.62 ? (tick % 2 ? C.amber : C.amberDk) : undefined)),
      box(0, 0.45, 0.75, 1.4, 0.1, 1.65, C.body, (f, u, v) => {
        if (!isFront(f)) return null;
        const du = u - 0.7;
        const dw = v - 0.82 - du * 0.5;
        const d2 = du * du + dw * dw;
        if (d2 > R * R) return null;
        if (d2 > (R - 0.12) * (R - 0.12)) return dw > 0 ? C.bolt : C.frameHi;
        if (d2 < 0.14 * 0.14) return C.dark;
        const d = Math.sqrt(d2);
        return lvl(DISH, 0.55 - (0.45 * dw) / R - (Math.abs(d - R * 0.55) < 0.07 ? 0.25 : 0));
      }),
      box(0.65, 0.55, 1.53, 0.1, 0.3, 0.08, C.dark),
      box(0.62, 0.82, 1.49, 0.16, 0.16, 0.16, tick % 2 ? C.cyanLt : active ? C.cyan : C.cyanDk),
    ];
  },
};

// Table with a glowing grid top; the hologram globe above it is drawn
// translucent by `ambient` (see holoGlobe).
const HOLO_A = 0.7;
const HOLO_B = 0.55;
const HOLO_Z = 1.62;
const HOLO_R = 0.45;

const think: IsoStation = {
  name: 'holo-table',
  size: { len: 1.4, dep: 1.1, h: 2.2 },
  light: (_t, active) => ({ a: 0.7, b: 0.55, z: 1.4, color: hex('#6fd0ff'), radius: 1.8, intensity: active ? 0.7 : 0.4 }),
  model: (t, active) => [
    box(0.45, 0.35, 0, 0.5, 0.4, 0.7, C.dark),
    box(0.05, 0.05, 0.7, 1.3, 1, 0.18, C.body, (f, u, v) => {
      if (f !== 'top') return v > 0.1 ? (active ? C.cyan : C.cyanDk) : undefined;
      if (u < 0.1 || v < 0.1 || u > 1.2 || v > 0.9) return undefined;
      return frac(u * 4) < 0.2 || frac(v * 4) < 0.25 ? (active ? C.cyanDk : C.grid) : C.screen;
    }),
    box(0.55, 0.4, 0.88, 0.3, 0.3, 0.05, active && Math.floor(t * 4) % 2 ? C.cyanLt : C.cyan),
  ],
};

// Upright capsule with a rounded glass front and a breathing light inside.
function pod(a0: number, breath: number, glow: readonly RGB[], status: RGB): Box[] {
  return [
    box(a0, 0.05, 0, 0.95, 0.8, 0.22, C.dark),
    box(a0 + 0.05, 0.1, 0.22, 0.85, 0.7, 1.75, C.body, (f, u, v) => {
      if (f === 'side') return frac(v * 3) < 0.2 ? C.bodyMid : undefined;
      if (f !== 'front') return undefined;
      const inGlass = u > 0.14 && u < 0.71 && v > 0.2 && v < 1.55 - Math.max(0, Math.abs(u - 0.425) - 0.12) * 1.5;
      if (!inGlass) return v > 0.04 && v < 0.14 && u > 0.28 && u < 0.58 ? status : undefined;
      if (Math.abs(u - 0.25 - (v - 0.2) * 0.05) < 0.06 && v > 0.45) return C.glassHi;
      return lvl(glow, breath * (1 - Math.abs(u - 0.425) * 1.4) + (v < 0.5 ? 0.1 : 0));
    }),
    box(a0 + 0.1, 0.15, 1.97, 0.75, 0.6, 0.18, C.bodyHi),
    box(a0 + 0.28, 0.25, 2.15, 0.4, 0.4, 0.1, status),
  ];
}

const idle: IsoStation = {
  name: 'sleep pods',
  size: { len: 2, dep: 0.9, h: 2.3 },
  light: () => ({ a: 1, b: 1.2, z: 1.2, color: hex('#8fb8ff'), radius: 1.4, intensity: 0.25 }),
  model: (t, active) => {
    const slow = 0.5 + 0.5 * Math.sin(t * 1.1);
    return [
      ...pod(0.03, active ? 0.35 + 0.6 * slow : 0.3 + 0.25 * slow, active ? POD_WARM : POD_COOL, active ? C.green : C.cyanDk),
      ...pod(1.02, 0.3 + 0.25 * (0.5 + 0.5 * Math.sin(t * 1.1 + 2)), POD_COOL, C.cyanDk),
    ];
  },
};

// Airlock door in a hazard-striped frame; open (with the beacon spinning)
// while someone comes or goes.
const entrance: IsoStation = {
  name: 'airlock',
  size: { len: 1.1, dep: 0.22, h: 2.65 },
  light: (t, active) => ({ a: 0.55, b: 0.6, z: 2.5, color: hex('#ff3b4f'), radius: 1.3, intensity: active ? 0.5 + 0.4 * Math.max(0, Math.sin(t * 6)) : 0.1 }),
  model: (t, active) => {
    const spin = t * 7;
    return [
      box(0, 0, 0, 1.1, 0.2, 2.45, C.dark, (f, u, v) => {
        if (f !== 'front') return undefined;
        if (u < 0.2 || u > 0.9 || v > 2.25) return u < 0.06 || u > 1.04 || v > 2.38 ? C.dark : hazard(u, v);
        if (active) {
          if (u < 0.28 || u > 0.82) return C.body;
          if (v < 0.12) return C.cyanDk;
          if (v > 2.0 && v < 2.12) return C.cyan;
          return C.corridor;
        }
        if (Math.abs(u - 0.55) < 0.05) return C.dark;
        if (v > 0.9 && v < 1.15) return hazard(u, v);
        if (v > 1.5 && v < 1.9 && (Math.abs(u - 0.36) < 0.1 || Math.abs(u - 0.74) < 0.1)) return C.glass;
        return C.body;
      }),
      box(0.35, 0.02, 2.45, 0.4, 0.18, 0.18, C.amberDk, (f, u) => {
        if (!active) return f === 'top' ? undefined : C.amberDk;
        const k = f === 'side' ? Math.sin(spin) : Math.cos(spin - u * 4);
        return k > 0.3 ? (k > 0.8 ? C.amberLt : C.amber) : C.amberDk;
      }),
    ];
  },
};

// ── ambient ──────────────────────────────────────────────────────────────
const find = (room: Room, kind: Placed['kind']): Placed | undefined => room.placed.find((p) => p.kind === kind);

// Soft light pooled on the floor around (gx, gy).
function floorGlow(c: PixelCanvas, room: Room, gx: number, gy: number, rx: number, ry: number, col: RGB, alpha: number): void {
  const iso = room.iso;
  const [x0] = iso.toScreen(gx - rx, gy + ry);
  const [x1] = iso.toScreen(gx + rx, gy - ry);
  const [, y0] = iso.toScreen(gx - rx, gy - ry);
  const [, y1] = iso.toScreen(gx + rx, gy + ry);
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    for (let x = Math.floor(x0); x <= Math.ceil(x1); x++) {
      const [fx, fy] = iso.floorAt(x + 0.5, y + 0.5, 0);
      const q = ((fx - gx) / rx) ** 2 + ((fy - gy) / ry) ** 2;
      if (q < 1) c.blend(x, y, col, alpha * (1 - q));
    }
  }
}

// Translucent wireframe globe over the holo-table: latitude rings plus
// meridians that turn; the far side is fainter.
function holoGlobe(c: PixelCanvas, room: Room, p: Placed, t: number): void {
  const on = p.users > 0;
  const spin = t * (on ? 1.1 : 0.3);
  const hh = room.iso.hh;
  const n = Math.max(12, Math.ceil(HOLO_R * hh * 9));
  const dot = (a: number, b: number, z: number, k: number) => {
    const [x, y] = localToScreen(room, p, HOLO_A + a, HOLO_B + b, HOLO_Z + z);
    const near = (a + b) / (2 * HOLO_R) + 0.5;
    c.blend(x, y, k > 0.5 ? C.cyanLt : C.cyan, (on ? 0.35 : 0.15) + near * (on ? 0.45 : 0.25));
  };
  // Beam from the emitter.
  for (let z = 0.95; z < HOLO_Z - HOLO_R; z += 0.5 / hh) {
    const w = ((z - 0.95) / (HOLO_Z - HOLO_R - 0.95)) * 0.25;
    dot(-w, w, z - HOLO_Z, 0);
    dot(w, -w, z - HOLO_Z, 0);
  }
  for (const s of on ? [-0.6, 0, 0.6] : [0]) {
    const rr = HOLO_R * Math.sqrt(1 - s * s);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU;
      dot(rr * Math.cos(ang), rr * Math.sin(ang), HOLO_R * s, 0);
    }
  }
  for (const m of on ? [0, Math.PI / 2] : [0]) {
    const ca = Math.cos(spin + m);
    const sa = Math.sin(spin + m);
    for (let i = 0; i < n; i++) {
      const lat = (i / n) * TAU;
      const r = HOLO_R * Math.cos(lat);
      dot(r * ca, r * sa, HOLO_R * Math.sin(lat), 1);
    }
  }
  if (on) {
    const ang = -t * 1.9;
    const [x, y] = localToScreen(room, p, HOLO_A + 0.62 * Math.cos(ang), HOLO_B + 0.62 * Math.sin(ang), HOLO_Z + 0.18 * Math.sin(ang));
    c.blend(x, y, C.amberLt, 0.95);
    c.blend(x + 1, y, C.amber, 0.6);
  }
}

function ambient(c: PixelCanvas, room: Room, t: number): void {
  const hh = room.iso.hh;
  // Stars drifting past outside the hull.
  const n = Math.floor((c.w * c.h) / 90);
  for (let i = 0; i < n; i++) {
    const x = Math.floor(frac(noise(i, 1) - t * 0.004 * (1 + noise(i, 4))) * c.w);
    const y = Math.floor(noise(i, 2) * c.h);
    if (c.data[y * c.w + x] !== BACKDROP_PACKED) continue;
    c.set(x, y, lvl(STAR_FAR, 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(t * (0.8 + noise(i, 3) * 2) + i))));
  }
  // Rotating amber beacon in the ceiling: its beam sweeps along the hull.
  const phi = t * 0.9;
  const dx = Math.cos(phi);
  const dy = Math.sin(phi);
  let side: 'left' | 'right' | null = null;
  let along = 0;
  let dist = 0;
  if (dy < -1e-3) {
    const s = room.D / 2 / -dy;
    const gx = room.W / 2 + s * dx;
    if (gx >= 0 && gx <= room.W) {
      side = 'right';
      along = gx;
      dist = s;
    }
  }
  if (!side && dx < -1e-3) {
    const s = room.W / 2 / -dx;
    const gy = room.D / 2 + s * dy;
    if (gy >= 0 && gy <= room.D) {
      side = 'left';
      along = gy;
      dist = s;
    }
  }
  if (side) {
    const len = side === 'right' ? room.W : room.D;
    const ru = 0.6 + dist * 0.12;
    const rv = 1.1;
    const vc = room.wallH * 0.62;
    for (let u = Math.max(0, along - ru); u < Math.min(len, along + ru); u += 1 / hh) {
      for (let v = vc - rv; v < vc + rv; v += 1 / hh) {
        const q = ((u - along) / ru) ** 2 + ((v - vc) / rv) ** 2;
        if (q >= 1) continue;
        const [x, y] = wallToScreen(room, side, u, v);
        c.blend(x, y, C.amber, 0.3 * (1 - q));
      }
    }
  }
  // Reactor light pooling on the deck.
  const reactor = find(room, 'run');
  if (reactor) {
    const on = reactor.users > 0;
    const k = on ? 0.3 + 0.12 * Math.abs(Math.sin(t * 6)) : 0.14 + 0.05 * Math.sin(t * 1.6);
    const [gx, gy] = reactor.at.wall === 'right' ? [reactor.at.along + 0.6, 1.55] : [1.55, reactor.at.along + 0.6];
    floorGlow(c, room, gx, gy, 0.95, 0.55, on ? C.cyanLt : C.cyan, k);
  }
  // Comms dish transmitting rings into the room.
  const dish = find(room, 'web');
  if (dish) {
    const on = dish.users > 0;
    const [ex, ey] = localToScreen(room, dish, 0.7, 0.9, 1.57);
    const dir = dish.at.wall === 'left' ? Math.atan2(0.5, 1) : Math.atan2(0.5, -1);
    const rings = on ? 3 : 1;
    for (let i = 0; i < rings; i++) {
      const p = frac(t * (on ? 0.9 : 0.35) + i / rings);
      const r = 1 + p * hh * 2.6;
      const steps = Math.ceil(r * 1.8);
      for (let s = -steps; s <= steps; s++) {
        const a = dir + (s / steps) * 0.9;
        c.blend(ex + Math.cos(a) * r, ey + Math.sin(a) * r, C.cyanLt, (on ? 0.7 : 0.35) * (1 - p));
      }
    }
  }
  const table = find(room, 'think');
  if (table) holoGlobe(c, room, table, t);
  // Zero-g dust motes.
  for (let i = 0; i < 14; i++) {
    const gx = frac(noise(i, 11) + Math.sin(t * 0.07 + i) * 0.05) * room.W;
    const gy = frac(noise(i, 12) + Math.cos(t * 0.05 + i * 2) * 0.05) * room.D;
    const gz = 0.5 + noise(i, 13) * (room.wallH - 1) + Math.sin(t * 0.3 + i * 1.7) * 0.25;
    const [x, y] = room.iso.toScreen(gx, gy, gz);
    c.blend(x, y, C.white, 0.18 + 0.14 * Math.sin(t * 1.3 + i));
  }
}

export const station: IsoTheme = {
  id: 'station',
  name: 'Orbital Station',
  tagline: 'a planet out the window, a purring reactor and nap pods',
  palette: P,
  backdrop: BACKDROP,
  wallH: WALL_H,
  floor,
  wall,
  stations: { write, read, search, run, web, think, idle, entrance },
  ambient,
  lighting: { ambient: hex('#94a2c4'), haze: 0.16, bloom: 0.6, vignette: 0.3 },
};

export default station;
