import { hex, mix } from '../term/color.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Art, Palette, StationDef, Theme } from './types.ts';
import { art, drawFloors, noise, textIn, wallBands } from './art.ts';

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

const AMBER = hex('#ffb238');
const CYAN = hex('#3fd8f2');
const STEEL = hex('#8796ab');
const STEEL_DK = hex('#3a4658');
const BASE = hex('#1a212c'); // feet/pedestals standing on the deck

const keys = (line: string, k: string) => [...line].map((c) => (c === ' ' ? ' ' : k)).join('');
const clampi = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ── write: nav console ───────────────────────────────────────────────────
const NAV = {
  f: STEEL, s: hex('#04131c'), g: CYAN, a: AMBER, t: hex('#9fe9ff'),
  k: hex('#2a3446'), w: hex('#e6f2ff'), c: hex('#2a9fbf'), p: STEEL_DK, o: hex('#5a3d12'), q: BASE,
};
const BARS = '▁▂▃▄▅▆▇';
const TICKER = 'HDG 271° ▸ ALT 412km ▸ Δv +0.42 ▸ ETA 03:12 ▸ ';

function navConsole(phase: number, data: string, cursor: number, lit: number, button: boolean): Art {
  let graph = '';
  let graphK = '';
  for (let x = 0; x < 9; x++) {
    const v = Math.sin((x + phase) * 0.8) * 0.5 + 0.5;
    graph += BARS[Math.floor(v * 6.99)];
    graphK += x === cursor ? 'a' : 'g';
  }
  const d = [...data.padEnd(9, ' ')].slice(0, 9).join('');
  const dataK = [...d].map((c) => (c === ' ' ? ' ' : /[A-Za-z▸▌]/.test(c) ? 'a' : 't')).join('');
  const keyRow = '▪▫▪▪●▪▪▫▪';
  const keyK = [...keyRow].map((c, i) => (i === 4 ? (button ? 'a' : 'o') : i === lit ? 'w' : i % 3 === 1 ? 'c' : 'p')).join('');
  return art(
    ['┏━━━━━━━━━┓', `┃${graph}┃`, `┃${d}┃`, '┗━━┳━━━┳━━┛', `▟${keyRow}▙`, '  ▐█▘ ▝█▌  '],
    ['fffffffffff', `f${graphK}f`, `f${dataK}f`, 'fffffffffff', `k${keyK}k`, '  qqq qqq  '],
    ['           ', ' sssssssss ', ' sssssssss ', '           ', ' kkkkkkkkk ', '           '],
  );
}

const tickerAt = (i: number) => {
  const chars = [...TICKER];
  return Array.from({ length: 9 }, (_, k) => chars[(i + k) % chars.length]).join('');
};

const write: StationDef = {
  kind: 'write',
  name: 'nav console',
  fps: 4,
  colors: NAV,
  frames: Array.from({ length: 8 }, (_, i) => navConsole(i * 0.5, i % 4 < 2 ? 'STANDBY ▌' : 'STANDBY', -1, -1, false)),
  active: Array.from({ length: 16 }, (_, i) => navConsole(i, tickerAt(i), i % 9, [0, 6, 2, 8, 3, 7, 1, 5][i % 8], i % 2 === 0)),
};

// ── read: data-crystal archive ───────────────────────────────────────────
const ARCHIVE = {
  f: hex('#6f7f96'), k: hex('#070d18'), h: hex('#12384a'),
  c: hex('#2fb8d8'), C: hex('#b8f6ff'), m: hex('#a86bea'), M: hex('#ecd4ff'), a: hex('#e09a2a'), A: hex('#ffe2a6'),
};
const CRYSTALS = ['◆ ◆◆ ◆ ◆◆', '◆◆ ◆ ◆◆ ◆', ' ◆◆◆ ◆ ◆◆'];

function archive(twinkle: number, scanRow: number, pulled: number): Art {
  const rows = ['┌─────────┐'];
  const fg = ['fffffffffff'];
  const bg = ['           '];
  CRYSTALS.forEach((line, row) => {
    const chars = [...line];
    if (row === scanRow && pulled >= 0 && chars[pulled] !== ' ') chars[pulled] = ' ';
    let n = 0;
    const k = chars
      .map((ch, x) => {
        if (ch === ' ') return ' ';
        const base = 'cma'[(x + row * 2) % 3];
        const bright = (n++ + row * 7) % 11 === twinkle % 11 || row === scanRow;
        return bright ? base.toUpperCase() : base;
      })
      .join('');
    rows.push(`│${chars.join('')}│`);
    fg.push(`f${k}f`);
    bg.push(` ${(row === scanRow ? 'h' : 'k').repeat(9)} `);
    if (row < 2) {
      rows.push('├─────────┤');
      fg.push('fffffffffff');
      bg.push('           ');
    }
  });
  return art(rows, fg, bg);
}

const read: StationDef = {
  kind: 'read',
  name: 'data archive',
  fps: 3,
  colors: ARCHIVE,
  frames: Array.from({ length: 11 }, (_, i) => archive(i, -1, -1)),
  active: [
    archive(0, 0, -1), archive(3, 0, 3), archive(5, 0, 3),
    archive(1, 1, -1), archive(4, 1, 5), archive(8, 1, 5),
    archive(2, 2, -1), archive(6, 2, 2), archive(9, 2, 2),
  ],
};

// ── search: radar scope ──────────────────────────────────────────────────
const RADAR = {
  f: STEEL, p: BASE, k: hex('#03140c'), d: hex('#0a3a22'), g: hex('#16703f'), G: hex('#3fe08a'),
  n: hex('#2f8a5a'), b: AMBER, w: hex('#d8ffe8'),
};
const SCOPE_ROWS = [
  [2, 8],
  [1, 9],
  [2, 8],
];
const BLIPS: Array<[number, number]> = [[3, 1], [8, 2], [6, 3]];

function radar(theta: number, blips: boolean): Art {
  const rows = ['  ╭─────╮  '];
  const fg = ['  fffffff  '];
  const bg = ['           '];
  SCOPE_ROWS.forEach(([x0, x1], i) => {
    const y = i + 1;
    let line = '';
    let lk = '';
    let lb = '';
    for (let x = 0; x < 11; x++) {
      if (x < x0 - 1 || x > x1 + 1) {
        line += ' ';
        lk += ' ';
        lb += ' ';
        continue;
      }
      if (x === x0 - 1 || x === x1 + 1) {
        line += y === 2 ? '│' : (y === 1) === (x < 5) ? '╱' : '╲';
        lk += 'f';
        lb += ' ';
        continue;
      }
      const a = Math.atan2(-(y - 2) * 2.2, x - 5);
      const behind = (((a - theta) % (Math.PI * 2)) + Math.PI * 4) % (Math.PI * 2);
      const shade = x === 5 && y === 2 ? 'G' : behind < 0.45 ? 'G' : behind < 1.2 ? 'g' : behind < 2.1 ? 'd' : 'k';
      const blip = BLIPS.find(([bx, by]) => bx === x && by === y);
      if (x === 5 && y === 2) {
        line += '+';
        lk += 'w';
      } else if (blip && blips && behind < 2.4) {
        line += '●';
        lk += 'b';
      } else if (blip || (x + y) % 4 === 0) {
        line += '·';
        lk += 'n';
      } else {
        line += ' ';
        lk += ' ';
      }
      lb += shade;
    }
    rows.push(line);
    fg.push(lk);
    bg.push(lb);
  });
  rows.push('  ╰─────╯  ', '   ▟███▙   ');
  fg.push('  fffffff  ', '   ppppp   ');
  bg.push('           ', '           ');
  return art(rows, fg, bg);
}

// Clockwise sweep: the beam angle decreases over time.
const search: StationDef = {
  kind: 'search',
  name: 'radar scope',
  fps: 6,
  colors: RADAR,
  frames: Array.from({ length: 16 }, (_, i) => radar(-(i * Math.PI * 2) / 16, false)),
  active: Array.from({ length: 8 }, (_, i) => radar(-(i * Math.PI * 2) / 8, true)),
};

// ── run: fusion reactor ──────────────────────────────────────────────────
const REACTOR = {
  s: STEEL_DK, q: BASE, f: STEEL, '0': hex('#061820'),
  '1': hex('#0f4d61'), '2': hex('#1a93b8'), '3': hex('#6fe3ff'), '4': hex('#effdff'),
  r: hex('#24414f'), R: CYAN, A: AMBER, y: hex('#fff1b8'),
};

function reactor(level: number, ringTop: string, ringBot: string, spark: number): Art {
  const lv = (n: number) => String(clampi(n, 1, 4));
  const core = `  f${lv(level - 2)}${lv(level - 1)}${lv(level)}${lv(level - 1)}${lv(level - 2)}f  `;
  const sp = ['           ', '·         *', '*   ·   · ·', ' ·       · '][spark];
  const cap = [...'  ▗▄▄▄▄▄▖  '];
  const capK = [...'  fffffff  '];
  [...sp].forEach((c, i) => {
    if (c !== ' ' && cap[i] === ' ') {
      cap[i] = c;
      capK[i] = 'y';
    }
  });
  return art(
    [cap.join(''), ' ╞═══════╡ ', '  ▐▒▓█▓▒▌  ', ' ╞═══════╡ ', '  ▐▒▓█▓▒▌  ', ' ▟███████▙ '],
    [capK.join(''), ` f${ringTop.repeat(7)}f `, core, ` f${ringBot.repeat(7)}f `, core, ' qqqqqqqqq '],
    ['           ', '           ', '   00000   ', '           ', '   00000   ', '           '],
  );
}

const run: StationDef = {
  kind: 'run',
  name: 'reactor',
  fps: 4,
  colors: REACTOR,
  frames: [
    reactor(2, 'r', 'r', 0), reactor(2, 'r', 'r', 0), reactor(3, 'r', 'R', 0),
    reactor(3, 'R', 'r', 0), reactor(2, 'r', 'r', 0), reactor(1, 'r', 'r', 0),
  ],
  active: [
    reactor(4, 'R', 'A', 1), reactor(3, 'A', 'R', 2), reactor(4, 'R', 'A', 3),
    reactor(4, 'A', 'R', 0), reactor(3, 'R', 'A', 2), reactor(4, 'A', 'R', 1),
  ],
};

// ── web: comms dish ──────────────────────────────────────────────────────
const COMMS = {
  f: STEEL, s: STEEL_DK, d: hex('#c9d6e6'), w: CYAN, v: hex('#1d6f85'), a: AMBER, o: hex('#5a3d12'), g: P.good, k: hex('#1f4d2f'), q: BASE,
};
const WAVES = ['           ', '    ╭─╮    ', '   ╭───╮   ', '  ╭─────╮  ', ' ╭───────╮ '];

function comms(wave: number, bright: boolean, feed: boolean, led: boolean): Art {
  const wv = WAVES[wave];
  const wk = bright && wave < 4 ? 'w' : 'v';
  return art(
    [wv, '     ●     ', '▙   ╱ ╲   ▟', '▝▀▄▄▄█▄▄▄▀▘', '    ▐█▌    ', '  ▗▟█▪█▙▖  '],
    [keys(wv, wk), `     ${feed ? 'a' : 'o'}     `, 'd   f f   d', 'ddddddddddd', '    sss    ', `  qqq${led ? 'g' : 'k'}qqq  `],
    ['           ', '           ', '           ', '           ', '           ', '     q     '],
  );
}

const web: StationDef = {
  kind: 'web',
  name: 'comms dish',
  fps: 5,
  colors: COMMS,
  frames: [
    comms(1, false, true, true), comms(2, false, false, true), comms(3, false, false, false), comms(4, false, false, false),
    comms(0, false, false, false), comms(0, false, false, false), comms(0, false, false, false), comms(0, false, false, false),
    comms(0, false, false, false), comms(0, false, false, false),
  ],
  active: [comms(1, true, true, true), comms(2, true, false, true), comms(3, true, true, false), comms(4, true, false, false)],
};

// ── think: holo-table ────────────────────────────────────────────────────
const HOLO = {
  d: hex('#1f7d9c'), c: hex('#59d8f5'), C: hex('#d0f8ff'), b: hex('#1a5f78'), B: hex('#5fe3fa'),
  e: CYAN, t: STEEL, q: BASE, y: hex('#ffe08a'), a: AMBER,
};
// Orbit ring cells (x, y) clockwise from the top-left of a 9x3 ellipse.
const ORBIT: Array<[number, number]> = [
  [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 1],
  [8, 2], [7, 2], [6, 2], [5, 2], [4, 2], [3, 2], [2, 2], [1, 1],
];
const PLANET_SPIN = ['◐', '◓', '◑', '◒'];

// Holographic orbit map: a dashed orbit with a satellite circling a spinning
// planet, projected from the table's emitter.
function holo(step: number, sats: number, beam: boolean, sparkle: number): Art {
  const rows = [[...' ╭┄┄┄┄┄┄┄╮ '], [...' ┊       ┊ '], [...' ╰┄┄┄┄┄┄┄╯ ']];
  const fg = [[...' ddddddddd '], [...' d       d '], [...' ddddddddd ']];
  rows[1][5] = PLANET_SPIN[Math.floor(step / 2) % 4];
  fg[1][5] = 'c';
  for (let k = 0; k < sats; k++) {
    const at = (step + k * 8) % 16;
    for (let tail = 1; tail <= 2; tail++) {
      const [tx, ty] = ORBIT[(at - tail + 16) % 16];
      fg[ty][tx] = tail === 1 ? 'C' : 'c';
    }
    const [x, y] = ORBIT[at];
    rows[y][x] = '◆';
    fg[y][x] = k === 0 ? 'a' : 'C';
  }
  if (sparkle >= 0) {
    const [x, y] = [[0, 0], [10, 0], [0, 2], [10, 2]][sparkle];
    rows[y][x] = '·';
    fg[y][x] = 'y';
  }
  return art(
    [...rows.map((r) => r.join('')), '    ╱┊╲    ', '▗▄▄▄▟█▙▄▄▄▖', '  ▐█▀▀▀█▌  '],
    [...fg.map((r) => r.join('')), beam ? '    BBB    ' : '    bbb    ', 'ttttbebtttt', '  qqqqqqq  '],
  );
}

const think: StationDef = {
  kind: 'think',
  name: 'holo-table',
  fps: 4,
  colors: HOLO,
  frames: Array.from({ length: 16 }, (_, i) => holo(i, 1, false, -1)),
  active: Array.from({ length: 16 }, (_, i) => holo(i * 2, 2, i % 2 === 0, [0, -1, 3, -1, 1, -1, 2, -1][i % 8])),
};

// ── idle: sleep pod ──────────────────────────────────────────────────────
const POD = {
  f: hex('#9fb2c8'), s: STEEL_DK, g: hex('#0f2c3a'), G: hex('#16404f'), p: hex('#e6eef7'), b: hex('#5b7fc0'),
  l: hex('#174a5c'), m: hex('#2590ad'), L: CYAN, z: hex('#9fb0ef'), Z: hex('#e6ecff'), q: BASE,
};
const ZZ = ['           ', '   z       ', '   z  Z    ', '      Z  z ', '         z '];

function pod(zz: number, light: number, glow: boolean): Art {
  const z0 = ZZ[zz];
  const lk = 'lmL'[light];
  return art(
    [z0, ' ╭───────╮ ', '▐│▄▄▄▄▄▄▄│▌', '▐╞═══════╡▌', '▐█ ▬▬▬▬▬ █▌', ' ▀▘     ▝▀ '],
    [z0, ' fffffffff ', 'sfppbbbbbfs', 'sfffffffffs', `ss ${lk.repeat(5)} ss`, ' qq     qq '],
    ['           ', '           ', `  ${(glow ? 'G' : 'g').repeat(7)}  `, '           ', '  sssssss  ', '           '],
  );
}

const idle: StationDef = {
  kind: 'idle',
  name: 'sleep pod',
  fps: 2,
  colors: POD,
  frames: [pod(0, 0, false), pod(0, 1, false), pod(0, 2, true), pod(0, 1, false), pod(0, 0, false), pod(0, 0, false)],
  active: [pod(1, 0, false), pod(2, 1, true), pod(3, 2, true), pod(4, 1, false)],
};

// ── entrance: airlock ────────────────────────────────────────────────────
const LOCK = {
  f: STEEL, y: hex('#e8a020'), k: hex('#151b26'), d: hex('#8a99ae'), D: hex('#5f6d82'),
  x: hex('#02040a'), w: hex('#dfe8ff'), o: hex('#5a3d12'), a: AMBER, A: hex('#ffe3a3'), g: P.good, r: P.bad,
};

function hazardRow(n: number, shift: number): { rows: string; fg: string; bg: string } {
  let rows = '';
  let fg = '';
  let bg = '';
  for (let i = 0; i < n; i++) {
    const k = (i + shift) % 4;
    rows += k === 1 ? '◤' : k === 3 ? '◢' : ' ';
    fg += k === 1 || k === 3 ? 'y' : ' ';
    bg += k === 0 ? 'y' : 'k';
  }
  return { rows, fg, bg };
}

function airlock(open: boolean, light: string, ray: number, led: string): Art {
  const hz1 = hazardRow(7, 0);
  const hz2 = hazardRow(7, 2);
  const capK = ['f', 'f', 'f', ray === 0 ? 'a' : 'f', light, ray === 1 ? 'a' : 'f', 'f', 'f', 'f'].join('');
  const door = open ? '▌ · * ▐' : '▒▒▒┃▒▒▒';
  const doorK = open ? 'd w w d' : 'DDDkDDD';
  const doorB = open ? ' xxxxx ' : 'ddddddd';
  const mid = open ? '▌*   ·▐' : '▒▒▪┃▪▒▒';
  const midK = open ? 'dw   wd' : `DD${led}k${led}DD`;
  return art(
    ['▗▄▄▄●▄▄▄▖', `█${hz1.rows}█`, `█${door}█`, `█${mid}█`, `█${open ? '▌  ·  ▐' : door}█`, `█${hz2.rows}█`],
    [capK, `f${hz1.fg}f`, `f${doorK}f`, `f${midK}f`, `f${open ? 'd  w  d' : doorK}f`, `f${hz2.fg}f`],
    ['         ', ` ${hz1.bg} `, ` ${doorB} `, ` ${doorB} `, ` ${doorB} `, ` ${hz2.bg} `],
  );
}

const entrance: StationDef = {
  kind: 'entrance',
  name: 'airlock',
  fps: 4,
  colors: LOCK,
  frames: [airlock(false, 'o', -1, 'r'), airlock(false, 'o', -1, 'r'), airlock(false, 'o', -1, 'r'), airlock(false, 'o', -1, 'D')],
  active: [airlock(true, 'A', 0, 'g'), airlock(true, 'a', -1, 'g'), airlock(true, 'A', 1, 'g'), airlock(true, 'o', -1, 'g')],
};

// ── backdrop decor ───────────────────────────────────────────────────────
type Kind = 'viewport' | 'porthole' | 'status' | 'clock' | 'sign' | 'beacon';
type Decor = { kind: Kind; x: number; y: number; w: number; h: number; level: number };

const SEQ: Kind[][] = [
  ['status', 'viewport', 'beacon', 'clock', 'porthole', 'sign'],
  ['sign', 'porthole', 'clock', 'beacon', 'viewport', 'status'],
];
const PRIORITY: Kind[] = ['viewport', 'beacon', 'status', 'clock', 'sign', 'porthole'];

// Places wall decor in the free space above each level's stations. Shared by
// backdrop and ambient so the beacon glow comes from the beacon that was drawn.
function layout(r: Rect, floors: number[]): Decor[] {
  const out: Decor[] = [];
  wallBands(r, floors).forEach((band, level) => {
    const top = band.y + 1;
    const free = band.y + band.h - 7 - top;
    if (free < 2) return;
    const vh = Math.min(free, 10);
    const lift = Math.floor((free - vh) / 2);
    const size: Record<Kind, [number, number]> = {
      viewport: [clampi(Math.floor(band.w * 0.3), 16, 46), vh],
      porthole: [clampi(Math.floor(band.w * 0.16), 12, 28), vh],
      status: [12, 4],
      clock: [11, 3],
      sign: [10, 3],
      beacon: [3, 2],
    };
    const seq = SEQ[level % 2];
    const avail = band.w - 4;
    const chosen = new Set<Kind>();
    let used = 0;
    for (const k of PRIORITY) {
      const [w, h] = size[k];
      if (h > free || ((k === 'viewport' || k === 'porthole') && h < 3)) continue;
      if (used + w + chosen.size * 3 > avail) continue;
      chosen.add(k);
      used += w;
    }
    const items = seq.filter((k) => chosen.has(k));
    const gap = Math.floor((avail - used) / (items.length + 1));
    let x = band.x + 2 + gap;
    for (const k of items) {
      const [w, h] = size[k];
      out.push({ kind: k, x, y: top + lift + Math.max(0, Math.floor((vh - h) / 2)), w, h, level });
      x += w + gap;
    }
  });
  return out;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function put(s: Screen, r: Rect, x: number, y: number, ch: string, fg?: RGB, bg?: RGB): void {
  if (inRect(r, x, y)) s.put(x, y, ch, fg, bg);
}

// Smooth 2D value noise in [0, 1); x wraps every `wrap` lattice units.
function vnoise(x: number, y: number, seed: number, wrap = 4096): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const h = (ix: number, iy: number) => noise((((ix % wrap) + wrap) % wrap) + iy * 7919, seed);
  const a = h(x0, y0);
  const b = h(x0 + 1, y0);
  const c = h(x0, y0 + 1);
  const d = h(x0 + 1, y0 + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

// ── viewports: starfield, planet, moon, nebula ───────────────────────────
const SPACE = hex('#03050b');
const BEZEL = hex('#2a3446');
const STAR_FAR = hex('#5a6a8e');
const STAR_NEAR = hex('#eef4ff');
const OCEAN = hex('#1f5fa8');
const SHALLOW = hex('#2f86c0');
const LAND = hex('#3e8e5e');
const DESERT = hex('#c2a467');
const ICE = hex('#e3edf7');
const CLOUD = hex('#f4f8ff');
const NIGHT = hex('#050912');
const ATMO = hex('#7fd4ff');
const MOON = hex('#b4b9c4');
const CRATER = hex('#80879a');
const ROCK = hex('#9a8b7c');
const ROCK_DK = hex('#685d54');
const NEB_A = hex('#5a2c8c');
const NEB_B = hex('#147089');
const SOLAR = hex('#4f74c4');

type Body = { cx: number; cy: number; R: number; kind: 'planet' | 'moon' | 'rock' };

// Colour of the body (or its thin atmosphere) at pixel (px, py) in half-cell
// units, or null for open space.
function bodyPixel(b: Body, px: number, py: number, t: number): RGB | null {
  const dx = px + 0.5 - b.cx;
  const dy = py + 0.5 - b.cy;
  const d = Math.sqrt(dx * dx + dy * dy);
  const nx = dx / b.R;
  const ny = dy / b.R;
  // Asteroids are lumpy and tumble.
  if (b.kind === 'rock' && d > b.R * (0.82 + 0.22 * Math.sin(Math.atan2(dy, dx) * 3 + t * 0.9))) return null;
  if (d > b.R) {
    if (b.kind !== 'planet' || d > b.R + 0.85) return null;
    const lit = clampi(-0.8 * nx - 0.4 * ny, 0, 1);
    return lit > 0.05 ? mix(SPACE, ATMO, 0.18 + 0.4 * lit) : null;
  }
  const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
  const light = clampi(-0.55 * nx - 0.25 * ny + 0.8 * nz, 0, 1);
  const lon = Math.atan2(nx, nz) / Math.PI; // -0.5..0.5 across the visible disc
  let c: RGB;
  if (b.kind === 'rock') {
    c = vnoise((lon + t * 0.15 + 1) * 4, ny * 2 + 7, 93, 8) > 0.55 ? ROCK_DK : ROCK;
  } else if (b.kind === 'moon') {
    c = vnoise((lon + 1) * 5, ny * 2.5 + 3, 91, 10) > 0.6 ? CRATER : MOON;
  } else if (Math.abs(ny) > 0.84) {
    c = ICE;
  } else {
    const land = vnoise((lon + t * 0.03) * 6, ny * 2.4 + 5, 61, 12);
    c = land > 0.58 ? (land > 0.78 ? DESERT : LAND) : land > 0.5 ? SHALLOW : OCEAN;
    const cloud = vnoise((lon + t * 0.05) * 8, ny * 4.5 + 9, 67, 16);
    if (cloud > 0.64) c = mix(c, CLOUD, 0.85);
    if (d / b.R > 0.8 && light > 0.1) c = mix(c, ATMO, 0.35);
  }
  return mix(NIGHT, c, Math.min(1, 0.08 + light * 1.15));
}

function starAt(gx: number, gy: number, t: number): { ch: string; fg: RGB } | null {
  const nx = Math.floor(gx + t * 0.9);
  const near = noise(nx * 31 + gy * 977, 5);
  if (near < 0.035) {
    const tw = noise(nx * 7 + gy * 131 + Math.floor(t * 2.5) * 1013, 6);
    return { ch: tw > 0.9 ? '+' : near < 0.006 ? '*' : '·', fg: tw > 0.75 ? STAR_NEAR : mix(STAR_NEAR, STAR_FAR, 0.35) };
  }
  const fx = Math.floor(gx + t * 0.25);
  const far = noise(fx * 53 + gy * 1499, 8);
  if (far < 0.07) {
    const tw = noise(fx * 3 + gy * 71 + Math.floor(t * 1.5) * 389, 9);
    return { ch: '·', fg: tw > 0.8 ? mix(STAR_FAR, STAR_NEAR, 0.5) : STAR_FAR };
  }
  return null;
}

function drawWindow(s: Screen, r: Rect, d: Decor, t: number, idx: number): void {
  const iw = d.w - 2;
  const ih = d.h - 2;
  const panes = Math.max(1, Math.round(iw / 16));
  const mullions = new Set<number>();
  for (let i = 1; i < panes; i++) mullions.add(d.x + Math.round((i * (d.w - 1)) / panes));
  for (let x = d.x; x < d.x + d.w; x++) {
    const left = x === d.x;
    const right = x === d.x + d.w - 1;
    const mul = mullions.has(x);
    put(s, r, x, d.y, left ? '┏' : right ? '┓' : mul ? '┳' : '━', STEEL, BEZEL);
    put(s, r, x, d.y + d.h - 1, left ? '┗' : right ? '┛' : mul ? '┻' : '━', STEEL, BEZEL);
  }
  // What's outside: the planet and its moon from the observation deck; a
  // nebula, a passing satellite and a drifting asteroid from the lower deck.
  const mode = d.kind === 'porthole' ? (d.level === 0 ? 'moon' : 'rock') : d.level === 0 ? 'planet' : 'nebula';
  let body: Body | null = null;
  if (mode === 'planet') {
    const paneW = Math.floor(iw / panes);
    const R = ih >= 2 ? ih - 0.2 : 5;
    const cy = ih >= 2 ? ih : ih * 2 + R - 1.6;
    body = { cx: Math.max(R + 1.5, Math.floor(paneW * 0.5)), cy, R, kind: 'planet' };
  } else if (mode === 'moon' && ih >= 2) {
    const R = Math.min(ih - 0.4, 3.2);
    body = { cx: Math.floor(iw * 0.66), cy: ih, R, kind: 'moon' };
  } else if (mode === 'rock' && ih >= 2) {
    const R = clampi(ih * 0.6, 1.6, 3);
    const travel = iw + R * 4;
    body = { cx: iw + R * 2 - ((t * 0.6 + idx * 7) % travel), cy: ih * 0.9, R, kind: 'rock' };
  }
  // Satellite crossing the nebula window.
  const satX = mode === 'nebula' ? Math.floor(((t * 0.8 + idx * 13) % (iw + 12)) - 6) : -99;
  const satY = Math.floor(ih * 0.35);
  // Rare shooting star, a few seconds apart per window.
  const period = 6 + noise(idx, 40) * 5;
  const tt = t + noise(idx, 41) * 20;
  const cycle = Math.floor(tt / period);
  const phase = tt - cycle * period;
  let shoot: { hx: number; hy: number } | null = null;
  if (noise(cycle, 42 + idx) < 0.45 && phase < 0.9 && iw > 8) {
    const p = phase / 0.9;
    const len = Math.min(iw * 0.7, 24);
    shoot = { hx: Math.floor(noise(cycle, 43 + idx) * iw * 0.4) + p * len, hy: p * Math.min(ih - 1, len * 0.12) };
  }
  for (let iy = 0; iy < ih; iy++) {
    const y = d.y + 1 + iy;
    put(s, r, d.x, y, '┃', STEEL, BEZEL);
    put(s, r, d.x + d.w - 1, y, '┃', STEEL, BEZEL);
    for (let ix = 0; ix < iw; ix++) {
      const x = d.x + 1 + ix;
      if (!inRect(r, x, y)) continue;
      if (mullions.has(x)) {
        s.put(x, y, '┃', STEEL, BEZEL);
        continue;
      }
      const top = body ? bodyPixel(body, ix, iy * 2, t) : null;
      const bot = body ? bodyPixel(body, ix, iy * 2 + 1, t) : null;
      if (top || bot) {
        if (top) s.put(x, y, '▀', top, bot ?? SPACE);
        else s.put(x, y, '▄', bot ?? SPACE, SPACE);
        continue;
      }
      let bg = SPACE;
      let haze: RGB | null = null;
      if (mode === 'nebula') {
        const gx = x - r.x + t * 0.25;
        const hue = mix(NEB_A, NEB_B, vnoise(gx * 0.04, iy * 0.2, 73));
        const neb = (py: number) => mix(SPACE, hue, clampi((vnoise(gx * 0.09, py * 0.16, 71) - 0.38) * 2, 0, 1) * 0.7);
        haze = neb(iy * 2);
        bg = neb(iy * 2 + 1);
        const sx = ix - satX;
        if (iy === satY && sx >= -1 && sx <= 1) {
          const blink = Math.floor(t * 2) % 3 === 0;
          s.put(x, y, sx === 0 ? '▪' : '═', sx === 0 ? (blink ? P.bad : STEEL) : SOLAR, bg);
          continue;
        }
      }
      if (shoot) {
        const k = shoot.hx - ix;
        if (k >= -0.5 && k < 4.5 && Math.round(shoot.hy - k * 0.12) === iy) {
          const head = k < 0.5;
          s.put(x, y, head ? '*' : k < 2.5 ? '─' : '·', mix(STAR_NEAR, STAR_FAR, head ? 0 : k / 5), bg);
          continue;
        }
      }
      const star = starAt(x - r.x, y - r.y, t);
      if (star) s.put(x, y, star.ch, star.fg, haze ? mix(haze, bg, 0.5) : bg);
      else if (haze) s.put(x, y, '▀', haze, bg);
      else s.put(x, y, ' ', undefined, bg);
    }
  }
}

// ── small wall fixtures ──────────────────────────────────────────────────
const SCREEN_BG = hex('#0a121e');

function drawStatus(s: Screen, r: Rect, d: Decor, t: number): void {
  const a = Math.floor(t / 3) % 2;
  const b = Math.floor(t / 4) % 2;
  const lines: Array<[string, string]> = d.level % 2 === 0
    ? [['O2', ` ${97 + Math.floor(noise(Math.floor(t / 4), 3) * 3)}%`], ['PWR', ` ${'▮'.repeat(3 + a)}${'▯'.repeat(1 - a)}`]]
    : [['TEMP', ` ${20 + Math.floor(noise(Math.floor(t / 5), 4) * 3)}°`], ['CO2', ` ${'▮'.repeat(1 + b)}${'▯'.repeat(3 - b)}`]];
  textIn(s, r, d.x, d.y, '╭──────────╮', STEEL);
  textIn(s, r, d.x, d.y + 3, '╰──────────╯', STEEL);
  for (let row = 0; row < 2; row++) {
    const y = d.y + 1 + row;
    put(s, r, d.x, y, '│', STEEL);
    put(s, r, d.x + 11, y, '│', STEEL);
    for (let x = 1; x <= 10; x++) put(s, r, d.x + x, y, ' ', undefined, SCREEN_BG);
    const on = noise(Math.floor(t * 2) * 5 + row + d.level * 3, 12) > 0.3;
    const led = row === 0 ? P.good : AMBER;
    put(s, r, d.x + 1, y, '●', on ? led : mix(led, SCREEN_BG, 0.7), SCREEN_BG);
    const [label, value] = lines[row];
    textIn(s, r, d.x + 3, y, label, P.dim, SCREEN_BG);
    textIn(s, r, d.x + 3 + label.length, y, value, CYAN, SCREEN_BG);
  }
}

function drawClock(s: Screen, r: Rect, d: Decor, t: number): void {
  const secs = Math.floor(t) + 1337;
  const mm = String(Math.floor(secs / 60) % 100).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  textIn(s, r, d.x, d.y, '┌─────────┐', STEEL);
  textIn(s, r, d.x, d.y + 2, '└─────────┘', STEEL);
  put(s, r, d.x, d.y + 1, '│', STEEL);
  put(s, r, d.x + 10, d.y + 1, '│', STEEL);
  textIn(s, r, d.x + 1, d.y + 1, 'MET ', mix(AMBER, SCREEN_BG, 0.25), SCREEN_BG);
  textIn(s, r, d.x + 5, d.y + 1, `${mm}${Math.floor(t * 2) % 2 ? ':' : ' '}${ss}`, CYAN, SCREEN_BG);
}

const STRIPE_Y = hex('#c8891a');
const STRIPE_K = hex('#151b26');

function hazardCell(i: number): { ch: string; fg: RGB; bg: RGB } {
  const k = ((i % 4) + 4) % 4;
  return { ch: k === 1 ? '◤' : k === 3 ? '◢' : ' ', fg: STRIPE_Y, bg: k === 0 ? STRIPE_Y : STRIPE_K };
}

function drawSign(s: Screen, r: Rect, d: Decor): void {
  for (let i = 0; i < d.w; i++) {
    const a = hazardCell(i);
    put(s, r, d.x + i, d.y, a.ch, a.fg, a.bg);
    const b = hazardCell(i + 2);
    put(s, r, d.x + i, d.y + 2, b.ch, b.fg, b.bg);
    put(s, r, d.x + i, d.y + 1, ' ', undefined, STRIPE_K);
  }
  textIn(s, r, d.x + 1, d.y + 1, d.level === 0 ? 'OBS DECK' : 'ENG DECK', P.text, STRIPE_K);
}

const beaconAngle = (t: number, level: number) => (t * Math.PI * 2) / 2.4 + level * 1.3;

function drawBeacon(s: Screen, r: Rect, d: Decor, t: number): void {
  const facing = 0.5 + 0.5 * Math.cos(beaconAngle(t, d.level));
  const lamp = mix(hex('#7a4a0c'), hex('#ffd27a'), facing);
  put(s, r, d.x, d.y, '▗', mix(lamp, AMBER, 0.4));
  put(s, r, d.x + 1, d.y, '█', lamp);
  put(s, r, d.x + 2, d.y, '▖', mix(lamp, AMBER, 0.4));
  textIn(s, r, d.x, d.y + 1, '▀▀▀', STEEL);
}

// ── backdrop ─────────────────────────────────────────────────────────────
const SEAM = hex('#161d29');
const RIVET = hex('#3c495d');
const CEIL = hex('#10161f');
const TRUSS = hex('#36435a');
const LAMP = hex('#bfeaff');
const GRATE = hex('#323d50');
const DECK_EDGE = hex('#64748e');
const GUIDE_DIM = hex('#1d5466');

function drawBackdrop(s: Screen, r: Rect, t: number, floors: number[]): void {
  // Hull plates with seams and rivets.
  for (let y = r.y; y < r.y + r.h; y++) {
    const gy = y - r.y;
    const py = gy % 5;
    for (let x = r.x; x < r.x + r.w; x++) {
      const gx = x - r.x;
      const px = gx % 16;
      let bg = (Math.floor(gx / 16) + Math.floor(gy / 5)) % 2 ? P.wall : P.wall2;
      if (px === 0 || py === 0) bg = mix(bg, SEAM, 0.7);
      const rivet = (px === 2 || px === 14) && (py === 1 || py === 4);
      s.put(x, y, rivet ? '·' : ' ', RIVET, bg);
    }
  }
  // Ceiling truss with light strips.
  for (let x = r.x; x < r.x + r.w; x++) {
    const gx = x - r.x;
    const lamp = gx % 30 >= 14 && gx % 30 <= 16;
    s.put(x, r.y, lamp ? '▄' : gx % 2 ? '╱' : '╲', lamp ? LAMP : TRUSS, CEIL);
  }
  let idx = 0;
  for (const d of layout(r, floors)) {
    if (d.kind === 'viewport' || d.kind === 'porthole') drawWindow(s, r, d, t, idx++);
    else if (d.kind === 'status') drawStatus(s, r, d, t);
    else if (d.kind === 'clock') drawClock(s, r, d, t);
    else if (d.kind === 'sign') drawSign(s, r, d);
    else drawBeacon(s, r, d, t);
  }
  // Grated deck plates with chasing guide lights.
  const chase = Math.floor(t * 5) % 8;
  drawFloors(s, r, floors, (x, row) => {
    const plate = x % 12;
    if (row === 0) {
      if (plate === 6) return { ch: '▪', fg: (Math.floor(x / 12) + 8 - chase) % 8 === 0 ? CYAN : GUIDE_DIM, bg: P.floor };
      return { ch: '▔', fg: DECK_EDGE, bg: P.floor };
    }
    return plate === 0 ? { ch: ' ', fg: GRATE, bg: mix(P.floor2, SEAM, 0.6) } : { ch: '▒', fg: GRATE, bg: P.floor2 };
  });
  // Underside of upper decks: hazard-striped edge girder.
  for (const fy of floors.slice(0, -1)) {
    const y = fy + 2;
    if (y < r.y || y >= r.y + r.h) continue;
    for (let x = r.x; x < r.x + r.w; x++) {
      const c = hazardCell(x - r.x);
      s.put(x, y, c.ch, c.fg, c.bg);
    }
  }
}

// ── ambient ──────────────────────────────────────────────────────────────
const isFree = (s: Screen, x: number, y: number) => s.charAt(x, y) === ' ';
const BEACON_GLOW = hex('#ffb347');
const DUST = hex('#7f93b5');
const GLINT = hex('#cfe8ff');

function drawAmbient(s: Screen, r: Rect, t: number, floors: number[]): void {
  const decor = layout(r, floors);
  // Rotating amber beacons sweep a soft glow across the hull.
  for (const d of decor) {
    if (d.kind !== 'beacon') continue;
    const a = beaconAngle(t, d.level);
    const facing = 0.5 + 0.5 * Math.cos(a);
    const cx = d.x + 1 + Math.sin(a) * 12;
    const cy = d.y + 0.5;
    const rx = 10;
    const ry = 4;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        if (!inRect(r, x, y)) continue;
        const k = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
        if (k < 1) s.blendBg(x, y, BEACON_GLOW, (1 - k) * (0.06 + 0.12 * facing));
      }
    }
  }
  // Ceiling light strips breathe softly.
  for (let lx = r.x + 15, i = 0; lx < r.x + r.w; lx += 30, i++) {
    const glow = 0.06 + 0.04 * Math.sin(t * 1.1 + i * 0.9);
    for (let dy = 1; dy <= 3; dy++) {
      for (let dx = -7; dx <= 7; dx++) {
        const x = lx + dx;
        const y = r.y + dy;
        if (!inRect(r, x, y)) continue;
        const k = (dx / 8) ** 2 + ((dy - 0.5) / 3.2) ** 2;
        if (k < 1) s.blendBg(x, y, LAMP, glow * (1 - k));
      }
    }
  }
  // Zero-g dust drifting through free air.
  const n = Math.max(3, Math.floor((r.w * r.h) / 260));
  const span = Math.max(1, r.h - 3);
  for (let i = 0; i < n; i++) {
    const vx = (noise(i, 2) - 0.5) * 1.2;
    const x = r.x + Math.floor((((noise(i, 1) * r.w + t * vx) % r.w) + r.w) % r.w);
    const fy = noise(i, 4) * span + Math.sin(t * 0.4 + i * 1.7) * 2 + t * 0.15 * (noise(i, 7) - 0.5);
    const y = r.y + 1 + Math.floor(((fy % span) + span) % span);
    if (!inRect(r, x, y) || !isFree(s, x, y)) continue;
    const twinkle = noise(i + Math.floor(t * 0.7) * 97, 13);
    s.put(x, y, twinkle > 0.85 ? '°' : '·', mix(DUST, P.wall, 0.15 + 0.4 * twinkle));
  }
  // Now and then a glint slides across the viewport glass.
  for (const d of decor) {
    if (d.kind !== 'viewport' && d.kind !== 'porthole') continue;
    const p = ((t + d.x * 0.37) % 11) / 1.4;
    if (p > 1) continue;
    const gx = d.x + 1 + p * (d.w + d.h * 2);
    for (let y = d.y + 1; y < d.y + d.h - 1; y++) {
      for (let k = 0; k < 2; k++) {
        const x = Math.floor(gx - (y - d.y) * 2 + k);
        if (x <= d.x || x >= d.x + d.w - 1 || !inRect(r, x, y)) continue;
        s.blendBg(x, y, GLINT, 0.12 - k * 0.05);
        if (s.charAt(x, y) === '▀') s.blendFg(x, y, GLINT, 0.12 - k * 0.05);
      }
    }
  }
}

export const station: Theme = {
  id: 'station',
  name: 'Orbital Station',
  tagline: 'planetrise out the window, a humming reactor and naps in zero-g',
  palette: P,
  stations: [write, read, search, run, web, think, idle],
  entrance,
  drawBackdrop,
  drawAmbient,
};

export default station;
