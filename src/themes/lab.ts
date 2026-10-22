import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import type { Box, Face } from '../iso/box.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import type { Room } from '../iso/room.ts';
import { localToScreen, wallToScreen } from '../iso/room.ts';
import type { IsoStation, IsoTheme, Palette } from './types.ts';
import { checker, frac, inside, noise } from './art.ts';

const P: Palette = {
  bg: hex('#0b1c22'),
  wall: hex('#d9e4e8'),
  wall2: hex('#cfdce1'),
  floor: hex('#8fa3ad'),
  floor2: hex('#7f939d'),
  text: hex('#1b2b33'),
  dim: hex('#6b7f88'),
  accent: hex('#00b3a4'),
  accent2: hex('#ff6b6b'),
  panel: hex('#12343b'),
  panelText: hex('#e8f6f3'),
  border: hex('#2a9d8f'),
  bubble: hex('#ffffff'),
  bubbleText: hex('#12343b'),
  good: hex('#2ecc71'),
  warn: hex('#f4a261'),
  bad: hex('#e63946'),
};

const C = {
  tileA: hex('#e6edf0'),
  tileB: hex('#d2dce0'),
  grout: hex('#b7c4c9'),
  wall: hex('#eef3f4'),
  wallGrout: hex('#d7e1e4'),
  base: hex('#2a9d8f'),
  wood: hex('#a1887f'),
  woodDark: hex('#6d4c41'),
  metal: hex('#90a4ae'),
  metalDark: hex('#546e7a'),
  steel: hex('#cfd8dc'),
  screen: hex('#062a2f'),
  code1: hex('#3ddc97'),
  code2: hex('#4cc9f0'),
  paper: hex('#f7fbfc'),
  chalk: hex('#f1faee'),
  board: hex('#1f3d2b'),
  copper: hex('#d08c60'),
  copperDark: hex('#a0522d'),
  red: hex('#e63946'),
  redDark: hex('#5c1f26'),
  amber: hex('#ffd166'),
  amberDark: hex('#6b4f00'),
  magenta: hex('#ff4d8d'),
  cyan: hex('#4cc9f0'),
  dark: hex('#1d2b30'),
};

const BOOKS = ['#e63946', '#457b9d', '#2a9d8f', '#e9c46a', '#9b5de5', '#f4a261'].map(hex);
const LIQUIDS = ['#3ddc97', '#ff4d8d', '#4cc9f0', '#ffb703'].map(hex);
const ELEMENTS = ['#e76f51', '#4895ef', '#2a9d8f', '#e9c46a', '#9b5de5'].map(hex);

const box = (a: number, b: number, z: number, len: number, dep: number, h: number, color: RGB, paint?: Box['paint']): Box => ({ a, b, z, len, dep, h, color, paint });
const front = (f: Face) => f === 'front';

// ── floor and walls ──────────────────────────────────────────────────────
function floor(gx: number, gy: number): RGB {
  if (frac(gx) < 0.1 || frac(gy) < 0.1) return C.grout;
  return checker(gx, gy, 1, C.tileA, C.tileB);
}

function periodic(u: number, v: number, t: number): RGB | null {
  if (!inside(u, v, 0.7, 2.3, 3.9, 3.6)) return null;
  if (!inside(u, v, 0.82, 2.42, 3.78, 3.48)) return C.paper;
  const col = Math.floor((u - 0.82) / (2.96 / 9));
  const row = Math.floor((3.48 - v) / (1.06 / 3));
  const shaped = row === 0 ? col === 0 || col === 8 : row === 1 ? col < 2 || col > 5 : true;
  if (!shaped || frac((u - 0.82) / (2.96 / 9)) > 0.78 || frac((3.48 - v) / (1.06 / 3)) > 0.75) return C.paper;
  const hot = Math.floor(noise(Math.floor(t * 1.5)) * 9);
  if (row === 2 && col === hot) return hex('#ffffff');
  return ELEMENTS[col < 2 ? 0 : col < 6 ? 1 + (row % 2) : col < 8 ? 3 : 4];
}

function clock(u: number, v: number, now: number): RGB | null {
  const cu = 4.8;
  const cv = 2.95;
  const d = Math.hypot(u - cu, v - cv);
  if (d > 0.5) return null;
  if (d > 0.42) return C.metalDark;
  const date = new Date(now);
  const hand = (turn: number, len: number) => {
    const a = turn * Math.PI * 2;
    const dx = Math.sin(a);
    const dy = Math.cos(a);
    const proj = (u - cu) * dx + (v - cv) * dy;
    const perp = Math.abs((u - cu) * dy - (v - cv) * dx);
    return proj > 0 && proj < len && perp < 0.05;
  };
  if (hand(date.getMinutes() / 60, 0.36)) return C.dark;
  if (hand(((date.getHours() % 12) + date.getMinutes() / 60) / 12, 0.24)) return C.red;
  return C.paper;
}

function flasks(u: number, v: number, t: number): RGB | null {
  if (inside(u, v, 0.5, 2.5, 3.1, 2.6)) return C.woodDark;
  for (let i = 0; i < 4; i++) {
    const cu = 0.85 + i * 0.62;
    if (inside(u, v, cu - 0.07, 2.98, cu + 0.07, 3.3)) return hex('#b8d8e0');
    const w = 0.24 - (v - 2.6) * 0.38;
    if (v >= 2.6 && v < 2.98 && Math.abs(u - cu) < w) {
      const level = 2.86 + Math.sin(t * 2 + i) * 0.04;
      return v < level ? mix(LIQUIDS[i], hex('#ffffff'), 0.15 + 0.15 * Math.sin(t * 3 + i * 2)) : hex('#d6eaf0');
    }
  }
  return null;
}

function panel(u: number, v: number, t: number): RGB | null {
  if (!inside(u, v, 3.4, 2.45, 4.8, 3.5)) return null;
  if (!inside(u, v, 3.48, 2.53, 4.72, 3.42)) return C.metalDark;
  if (inside(u, v, 3.55, 3.12, 4.65, 3.3)) {
    const i = Math.floor((u - 3.55) / 0.22);
    const on = noise(Math.floor(t * 3) * 7 + i) > 0.4;
    const led = [C.code1, C.amber, C.red, C.cyan, C.code1][Math.min(4, i)];
    return frac((u - 3.55) / 0.22) < 0.6 ? (on ? led : scale(led, 0.3)) : C.dark;
  }
  if (inside(u, v, 3.55, 2.6, 4.65, 3.02)) {
    const i = Math.floor((u - 3.55) / 0.11);
    const level = 2.6 + (Math.sin(t * 3 + i * 0.7) * 0.5 + 0.5) * 0.4;
    return v < level && frac((u - 3.55) / 0.11) < 0.7 ? C.code1 : C.dark;
  }
  return C.dark;
}

function hazard(u: number, v: number): RGB | null {
  const cu = 5.5;
  if (v < 2.6 || v > 3.35) return null;
  if (Math.abs(u - cu) > (3.35 - v) * 0.6) return null;
  if (Math.abs(u - cu) < 0.05 && ((v > 2.85 && v < 3.15) || (v > 2.7 && v < 2.78))) return C.dark;
  return C.amber;
}

function wall(side: 'left' | 'right', u: number, v: number, t: number, now: number): RGB {
  if (v > 3.65) return hex('#a7b8be');
  if (v < 0.3) return C.base;
  const deco = side === 'right' ? (periodic(u, v, t) ?? clock(u, v, now)) : (flasks(u, v, t) ?? panel(u, v, t) ?? hazard(u, v));
  if (deco) return deco;
  return frac(u * 2) < 0.06 || frac(v * 2) < 0.08 ? C.wallGrout : C.wall;
}

// ── stations ─────────────────────────────────────────────────────────────
const write: IsoStation = {
  name: 'workbench',
  size: { len: 2, dep: 1, h: 2 },
  light: (_t, active) => ({ a: 1, b: 1.5, z: 1.6, color: hex('#8fe9ff'), radius: 1.3, intensity: active ? 0.45 : 0.2 }),
  model: (t, active) => {
    const scroll = active ? Math.floor(t * 6) : 0;
    return [
      box(0.1, 0.1, 0, 0.1, 0.1, 0.95, C.metalDark),
      box(1.8, 0.1, 0, 0.1, 0.1, 0.95, C.metalDark),
      box(0.1, 0.8, 0, 0.1, 0.1, 0.95, C.metalDark),
      box(1.8, 0.8, 0, 0.1, 0.1, 0.95, C.metalDark),
      box(0, 0, 0.95, 2, 1, 0.12, C.steel),
      box(0.95, 0.2, 1.07, 0.1, 0.1, 0.15, C.metalDark),
      box(0.45, 0.12, 1.2, 1.1, 0.12, 0.75, hex('#37474f'), (f, u, v) => {
        if (!front(f) || !inside(u, v, 0.08, 0.08, 1.02, 0.68)) return undefined;
        const row = Math.floor((0.68 - v) / 0.12);
        if (frac((0.68 - v) / 0.12) > 0.55) return C.screen;
        if (!active) return row === 0 && u < 0.18 && Math.floor(t * 2) % 2 === 0 ? C.code1 : C.screen;
        const len = 0.2 + noise(row + scroll, 5) * 0.7;
        return u - 0.08 < len ? (row % 2 ? C.code2 : C.code1) : C.screen;
      }),
      box(0.55, 0.55, 1.07, 0.9, 0.25, 0.05, hex('#b0bec5'), (f, u, v) => {
        if (f !== 'top') return undefined;
        const key = Math.floor(u * 8) + Math.floor(v * 4) * 8;
        if (active && noise(key, Math.floor(t * 10)) > 0.8) return C.code1;
        return frac(u * 8) < 0.2 ? hex('#90a4ae') : undefined;
      }),
      box(1.65, 0.6, 1.07, 0.15, 0.15, 0.2, hex('#ff7043')),
    ];
  },
};

const read: IsoStation = {
  name: 'bookshelf',
  size: { len: 1.6, dep: 0.5, h: 2.3 },
  model: (t, active) => {
    const missing = active ? Math.floor(t * 1.2) % 33 : -1;
    return [
      box(0, 0, 0, 1.6, 0.5, 2.3, C.wood, (f, u, v) => {
        if (!front(f) || u < 0.08 || u > 1.52 || v < 0.1 || v > 2.2) return undefined;
        const band = (v - 0.1) / 0.7;
        const row = Math.floor(band);
        if (frac(band) < 0.1) return C.woodDark;
        const idx = Math.floor((u - 0.08) / 0.13) + row * 11;
        if (idx === missing || frac(band) > 0.55 + noise(idx, 3) * 0.35) return hex('#3e2723');
        const book = BOOKS[Math.floor(noise(idx) * BOOKS.length)];
        return frac((u - 0.08) / 0.13) < 0.15 ? scale(book, 0.7) : book;
      }),
    ];
  },
};

const search: IsoStation = {
  name: 'DNA scanner',
  size: { len: 1.2, dep: 0.8, h: 2 },
  light: (t, active) => [
    { a: 0.6, b: 1.4, z: 1.5, color: hex('#7ff7ff'), radius: 1.2, intensity: active ? 0.5 : 0.25 },
    ...(active && Math.floor(t * 4) % 2 ? [{ a: 0.6, b: 0.4, z: 1.9, color: hex('#ffb547'), radius: 0.8, intensity: 0.4 }] : []),
  ],
  model: (t, active) => {
    const speed = active ? 6 : 1.5;
    return [
      box(0, 0, 0, 1.2, 0.8, 1, C.steel, (f, u, v) => {
        if (!front(f)) return undefined;
        if (inside(u, v, 0.15, 0.7, 1.05, 0.85)) {
          const i = Math.floor((u - 0.15) / 0.18);
          return frac((u - 0.15) / 0.18) < 0.6 ? [C.red, C.code1, C.amber, C.cyan, C.code1][i % 5] : C.dark;
        }
        return frac(v * 6) < 0.12 && v < 0.55 ? hex('#b0bec5') : undefined;
      }),
      box(0.1, 0.15, 1, 1, 0.15, 0.85, hex('#263238'), (f, u, v) => {
        if (!front(f) || !inside(u, v, 0.06, 0.07, 0.94, 0.78)) return undefined;
        for (let k = 0; k < 2; k++) {
          const x = 0.5 + 0.3 * Math.sin(v * 8 + t * speed + k * Math.PI);
          if (Math.abs(u - x) < 0.06) return k ? C.magenta : C.cyan;
        }
        const lo = 0.5 - 0.3 * Math.abs(Math.sin(v * 8 + t * speed));
        return frac(v * 5) < 0.18 && u > lo && u < 1 - lo ? hex('#35546a') : hex('#0a1f2b');
      }),
      box(0.5, 0.3, 1.85, 0.2, 0.2, 0.08, active && Math.floor(t * 4) % 2 ? C.amber : C.amberDark),
    ];
  },
};

const run: IsoStation = {
  name: 'tesla coil',
  size: { len: 1, dep: 1, h: 2.2 },
  light: (t, active) => {
    const zap = active && noise(Math.floor(t * 12)) > 0.45;
    return { a: 0.5, b: 0.5, z: 2, color: hex('#cfe8ff'), radius: 2.2, intensity: zap ? 0.9 : active ? 0.25 : 0.08 };
  },
  model: (t, active) => {
    const zap = active && noise(Math.floor(t * 12)) > 0.45;
    return [
      box(0.15, 0.15, 0, 0.7, 0.7, 0.35, hex('#78909c')),
      box(0.35, 0.35, 0.35, 0.3, 0.3, 1.45, C.copper, (f, _u, v) => (f !== 'top' && frac(v * 7) < 0.45 ? C.copperDark : undefined)),
      box(0.18, 0.18, 1.8, 0.64, 0.64, 0.25, zap ? hex('#e1f5fe') : hex('#b0bec5')),
    ];
  },
};

const web: IsoStation = {
  name: 'radio mast',
  size: { len: 1.2, dep: 0.8, h: 2.6 },
  light: (t, active) => (Math.floor(t * (active ? 5 : 1.5)) % 2 === 0 ? { a: 0.6, b: 0.4, z: 2.4, color: hex('#ff4757'), radius: 0.9, intensity: 0.5 } : null),
  model: (t, active) => {
    const blink = Math.floor(t * (active ? 5 : 1.5)) % 2 === 0;
    return [
      box(0.1, 0.1, 0, 1, 0.6, 0.7, hex('#5d4037'), (f, u, v) => {
        if (!front(f)) return undefined;
        if (inside(u, v, 0.08, 0.1, 0.48, 0.6)) return (Math.floor(u * 20) + Math.floor(v * 20)) % 2 ? hex('#3e2723') : hex('#8d6e63');
        if (inside(u, v, 0.55, 0.3, 0.92, 0.55)) {
          const needle = 0.6 + (active ? (Math.sin(t * 3) * 0.5 + 0.5) * 0.28 : 0.1);
          return Math.abs(u - needle) < 0.025 ? C.red : C.amber;
        }
        return undefined;
      }),
      box(0.55, 0.35, 0.7, 0.1, 0.1, 1.6, C.metal),
      box(0.35, 0.35, 1.7, 0.5, 0.1, 0.06, C.metal),
      box(0.52, 0.32, 2.3, 0.16, 0.16, 0.16, blink ? hex('#ff4757') : C.redDark),
    ];
  },
};

const think: IsoStation = {
  name: 'chalkboard',
  size: { len: 1.8, dep: 0.4, h: 2 },
  model: (t, active) => {
    const rows = active ? 1 + (Math.floor(t * 0.8) % 5) : 5;
    const reveal = active ? frac(t * 0.8) : 1;
    return [
      box(0.15, 0.15, 0, 0.1, 0.1, 0.7, C.woodDark),
      box(1.55, 0.15, 0, 0.1, 0.1, 0.7, C.woodDark),
      box(0, 0.1, 0.6, 1.8, 0.12, 1.3, C.woodDark, (f, u, v) => {
        if (!front(f) || !inside(u, v, 0.08, 0.08, 1.72, 1.22)) return undefined;
        const line = (1.22 - v) / 0.22;
        const row = Math.floor(line);
        if (row >= rows || frac(line) < 0.35 || frac(line) > 0.65) return C.board;
        if (row === rows - 1 && (u - 0.08) / 1.64 > reveal) return C.board;
        return noise(Math.floor(u * 14) + row * 31) > 0.4 ? C.chalk : C.board;
      }),
      box(0.05, 0.22, 0.6, 1.7, 0.1, 0.05, C.wood),
    ];
  },
};

const idle: IsoStation = {
  name: 'coffee machine',
  size: { len: 1.4, dep: 0.8, h: 1.7 },
  light: (_t, active) => (active ? { a: 1, b: 1.2, z: 1.1, color: hex('#ffb36b'), radius: 0.9, intensity: 0.3 } : null),
  model: (t, active) => [
    box(0, 0, 0, 1.4, 0.8, 0.9, hex('#90a4ae'), (f, u, v) => (front(f) && (Math.abs(u - 0.7) < 0.02 || v < 0.06) ? hex('#607d8b') : undefined)),
    box(0.15, 0.1, 0.9, 0.6, 0.45, 0.75, hex('#c62828'), (f, u, v) => {
      if (!front(f)) return undefined;
      if (inside(u, v, 0.1, 0.4, 0.5, 0.65)) return C.dark;
      if (active && inside(u, v, 0.27, 0.05, 0.33, 0.4)) return frac(v * 6 - t * 4) < 0.6 ? hex('#6f4518') : C.dark;
      if (inside(u, v, 0.2, 0.32, 0.4, 0.4)) return C.metalDark;
      return undefined;
    }),
    box(0.27, 0.25, 0.9, 0.15, 0.15, 0.12, hex('#fafafa')),
    box(0.95, 0.35, 0.9, 0.15, 0.15, 0.18, C.cyan),
  ],
};

const entrance: IsoStation = {
  name: 'airlock',
  size: { len: 1, dep: 0.2, h: 2.45 },
  light: (t, active) => (active
    ? { a: 0.5, b: 0.6, z: 2.3, color: hex('#ffb547'), radius: 1.2, intensity: 0.4 + 0.3 * (Math.floor(t * 4) % 2) }
    : { a: 0.5, b: 0.4, z: 1.6, color: hex('#7ff7ff'), radius: 0.8, intensity: 0.15 }),
  model: (t, active) => [
    box(0, 0, 0, 1, 0.15, 2.3, hex('#78909c'), (f, u, v) => {
      if (!front(f) || u < 0.1 || u > 0.9 || v > 2.15) return undefined;
      if (active) return v < 0.06 ? C.amber : hex('#06141a');
      if (inside(u, v, 0.25, 1.4, 0.75, 1.8)) return C.cyan;
      if (Math.abs(u - 0.5) < 0.02) return hex('#78909c');
      return hex('#b0bec5');
    }),
    box(0.4, 0, 2.3, 0.2, 0.2, 0.12, active && Math.floor(t * 4) % 2 ? C.red : C.redDark),
  ],
};

// ── ambient ──────────────────────────────────────────────────────────────
function ambient(c: PixelCanvas, room: Room, t: number): void {
  // Bubbles rising from the flasks on the left wall.
  for (let i = 0; i < 4; i++) {
    const period = 1.4 + noise(i, 3);
    const p = frac((t + noise(i, 9) * 3) / period);
    const [x, y] = wallToScreen(room, 'left', 0.85 + i * 0.62 + Math.sin(p * 6 + i) * 0.05, 3.3 + p * 0.4);
    c.blend(x, y, mix(LIQUIDS[i], hex('#ffffff'), 0.5), 0.8 * (1 - p));
  }
  // Steam from the coffee machine.
  const cafe = room.placed.find((p) => p.kind === 'idle');
  if (cafe) {
    for (let i = 0; i < 3; i++) {
      const p = frac(t * 0.6 + i / 3);
      const [x, y] = localToScreen(room, cafe, 0.45 + Math.sin(t * 2 + i) * 0.08, 0.32, 1.7 + p * 0.8);
      c.blend(x, y, hex('#ffffff'), 0.55 * (1 - p));
    }
  }
  // Dust drifting through the light.
  for (let i = 0; i < 10; i++) {
    const gx = frac(noise(i, 1) + t * 0.02 * (0.5 + noise(i, 2))) * room.W;
    const gy = noise(i, 4) * room.D;
    const [x, y] = room.iso.toScreen(gx, gy, 1 + noise(i, 5) * 1.5 + Math.sin(t * 0.7 + i) * 0.2);
    c.blend(x, y, hex('#ffffff'), 0.35);
  }
  // Fluorescent flicker now and then.
  if (noise(Math.floor(t / 9), 77) > 0.55 && t % 9 < 0.15) {
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) c.blend(x, y, [0, 0, 0], 0.12);
  }
}

export const lab: IsoTheme = {
  id: 'lab',
  name: 'Mad Science Lab',
  tagline: 'bubbling flasks, tesla coils and a very busy chalkboard',
  palette: P,
  backdrop: hex('#0b1c22'),
  wallH: 3.8,
  floor,
  wall,
  stations: { write, read, search, run, web, think, idle, entrance },
  ambient,
  lighting: { ambient: hex('#e4eaf2'), haze: 0.05, bloom: 0.4, vignette: 0.25 },
};

export default lab;
