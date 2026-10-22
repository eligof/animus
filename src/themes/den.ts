import { hex, mix } from '../term/color.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Art, Palette, StationDef, Theme } from './types.ts';
import { art, drawFloors, noise, pulse, textIn, wallBands } from './art.ts';

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

const GREEN = hex('#39ff6e');
const MAGENTA = hex('#ff2a8a');
const AMBER = hex('#ffb000');
const BLACK: RGB = [0, 0, 0];

// Mutable key grid so stations can be composed procedurally, then frozen
// into Art with toArt().
type Cell = { ch: string; f: string; b: string };
type Grid = Cell[][];

function grid(rows: string[], fg: string[], bg: string[] = []): Grid {
  const w = Math.max(...rows.map((r) => [...r].length));
  return rows.map((row, y) => {
    const ch = [...row];
    const f = [...(fg[y] ?? '')];
    const b = [...(bg[y] ?? '')];
    return Array.from({ length: w }, (_, x) => ({ ch: ch[x] ?? ' ', f: f[x] ?? ' ', b: b[x] ?? ' ' }));
  });
}

function set(g: Grid, x: number, y: number, ch: string, f: string, b?: string): void {
  const row = g[y];
  if (!row || x < 0 || x >= row.length) return;
  row[x] = { ch, f, b: b ?? row[x].b };
}

function toArt(g: Grid): Art {
  return art(
    g.map((r) => r.map((c) => c.ch).join('')),
    g.map((r) => r.map((c) => c.f).join('')),
    g.map((r) => r.map((c) => c.b).join('')),
  );
}

const keys = (line: string, k: string) => [...line].map((c) => (c === ' ' ? ' ' : k)).join('');
const frames = (n: number, fn: (i: number) => Art) => Array.from({ length: n }, (_, i) => fn(i));

// ── write: triple-CRT rig ────────────────────────────────────────────────
const RIG = {
  f: hex('#66726b'), s: hex('#032412'), g: hex('#7dffa0'), h: hex('#2fae58'), a: hex('#ffb000'),
  d: hex('#3a2e24'), k: hex('#1f6b3a'), K: hex('#9dffb6'),
};

const RIG_ROWS = ['   ┌───┐   ', '┌──┤   ├──┐', '│  │   │  │', '│  │   │  │', '└──┴┬─┬┴──┘', '▀▀▀▀▀▀▀▀▀▀▀'];

// Fills a screen with pseudo-code starting at `line`, so bumping `line`
// scrolls it up.
function code(g: Grid, x0: number, y0: number, w: number, h: number, line: number, seed: number, hot: string): void {
  for (let y = 0; y < h; y++) {
    const ln = line + y;
    const indent = noise(ln, seed + 3) < 0.3 ? 1 : 0;
    for (let x = indent; x < w; x++) {
      const n = noise(ln * 17 + x * 5, seed);
      if (n > 0.74) continue;
      const k = noise(ln * 3 + x, seed + 7) < 0.14 ? hot : n < 0.45 ? 'g' : 'h';
      set(g, x0 + x, y0 + y, n < 0.08 ? '▪' : '▬', k);
    }
  }
}

function rig(frame: number, active: boolean): Art {
  const g = grid(
    RIG_ROWS,
    [...RIG_ROWS.slice(0, 5).map((r) => keys(r, 'f')), 'dddkkkkkddd'],
    ['           ', '    sss    ', ' ss sss ss ', ' ss sss ss ', '           ', '           '],
  );
  if (active) {
    code(g, 4, 1, 3, 3, frame, 1, 'a');
    code(g, 1, 2, 2, 2, frame * 2, 2, 'g');
    code(g, 8, 2, 2, 2, frame + 7, 3, 'a');
    for (let x = 3; x <= 7; x++) if (noise(frame * 11 + x, 4) < 0.35) set(g, x, 5, '▀', 'K');
  } else {
    const slow = Math.floor(frame / 4);
    code(g, 4, 1, 3, 2, 0, 1, 'a');
    set(g, 4, 3, '$', 'a');
    if (frame % 6 < 3) set(g, 5, 3, '▌', 'g');
    code(g, 1, 2, 2, 2, slow, 2, 'g');
    code(g, 8, 2, 2, 2, slow + 7, 3, 'a');
  }
  return toArt(g);
}

const write: StationDef = {
  kind: 'write',
  name: 'triple-CRT rig',
  fps: 6,
  colors: RIG,
  frames: frames(12, (i) => rig(i, false)),
  active: frames(12, (i) => rig(i, true)),
};

// ── read: stack of manuals + desk lamp ───────────────────────────────────
const LAMP = {
  m: hex('#5b6660'), v: hex('#1f7a3d'), c: hex('#4a3a14'), o: hex('#b58a2e'), C: hex('#ffd98a'),
  r: hex('#4a1820'), R: hex('#a8323e'), b: hex('#18234a'), B: hex('#2f4fa8'), y: hex('#4a3a10'), Y: hex('#b0821f'),
  p: hex('#8f8672'), P: hex('#f2e8cf'), w: hex('#efe6cc'),
};

const PAGE: Array<[number, string] | null> = [[4, '▁'], [4, '╱'], [5, '│'], [6, '╲'], [6, '▁'], null];

function manuals(lit: boolean, page: number, flick: number): Art {
  const t = lit ? 'P' : 'p';
  const [r, b, y] = lit ? ['R', 'B', 'Y'] : ['r', 'b', 'y'];
  const g = grid(
    ['  ╭──────╮ ', ' ▟█▙     │ ', '         │ ', '  K&R C  │ ', ' RFC 791 │ ', ' TCP/IP ▄█▄'],
    ['  mmmmmmmm ', ' vvv     m ', '         m ', `  ${keys('K&R C', t)}  m `, ` ${keys('RFC 791', t)} m `, ` ${keys('TCP/IP', t)} mmm`],
    ['           ', '           ', '           ', ` ${r.repeat(7)}   `, `${b.repeat(9)}  `, `${y.repeat(8)}   `],
  );
  if (lit) {
    set(g, 1, 2, '░', 'o');
    set(g, 2, 2, flick ? '▓' : '▒', 'C');
    set(g, 3, 2, '░', 'o');
  } else {
    for (let x = 1; x <= 3; x++) set(g, x, 2, '░', 'c');
  }
  const p = page >= 0 ? PAGE[page % PAGE.length] : null;
  if (p) set(g, p[0], 2, p[1], 'w');
  return toArt(g);
}

const read: StationDef = {
  kind: 'read',
  name: 'manual stack',
  fps: 5,
  colors: LAMP,
  frames: [manuals(false, -1, 0)],
  active: frames(6, (i) => manuals(true, i, i % 2)),
};

// ── search: radar scope ──────────────────────────────────────────────────
const RADAR = {
  f: hex('#4a524c'), s: hex('#021a0a'), g: hex('#b8ffc8'), h: hex('#2fbf5a'), H: hex('#16602f'),
  c: hex('#1a5c30'), b: hex('#d8ffe0'), a: hex('#ffb000'), m: hex('#ff2a8a'), d: hex('#140d00'),
};

// Sweep cells per bearing (N, NE, E, SE, S, SW, W, NW) around the hub at 5,2.
const SWEEP: Array<Array<[number, number, string]>> = [
  [[5, 1, '│']],
  [[6, 1, '╱'], [7, 1, '╱']],
  [[6, 2, '─'], [7, 2, '─'], [8, 2, '─']],
  [[6, 3, '╲'], [7, 3, '╲']],
  [[5, 3, '│']],
  [[4, 3, '╱'], [3, 3, '╱']],
  [[4, 2, '─'], [3, 2, '─'], [2, 2, '─']],
  [[4, 1, '╲'], [3, 1, '╲']],
];

type Blip = { x: number; y: number; dir: number; k: string };
const BLIPS: Blip[] = [{ x: 8, y: 1, dir: 1, k: 'b' }, { x: 2, y: 3, dir: 5, k: 'b' }];
const BLIPS_HOT: Blip[] = [...BLIPS, { x: 9, y: 2, dir: 2, k: 'a' }, { x: 2, y: 1, dir: 7, k: 'b' }, { x: 8, y: 3, dir: 3, k: 'm' }];

function radar(dir: number, blips: Blip[]): Art {
  const g = grid(
    ['  ╭─────╮  ', ' ╱       ╲ ', '│    +    │', ' ╲       ╱ ', '  ╰──┬──╯  ', '  ▐000°▌   '],
    ['  fffffff  ', ' f       f ', 'f    c    f', ' f       f ', '  fffffff  ', '  daaaad   '],
    ['           ', '  sssssss  ', ' sssssssss ', '  sssssss  ', '           ', '   dddd    '],
  );
  for (const [x, y, ch] of SWEEP[(dir + 6) % 8]) set(g, x, y, ch, 'H');
  for (const [x, y, ch] of SWEEP[(dir + 7) % 8]) set(g, x, y, ch, 'h');
  for (const [x, y, ch] of SWEEP[dir]) set(g, x, y, ch, 'g');
  for (const b of blips) {
    const age = (dir - b.dir + 8) % 8;
    const fade = b.k === 'b' ? (age <= 2 ? 'h' : 'H') : b.k;
    if (age === 0) set(g, b.x, b.y, '●', b.k);
    else if (age <= 2) set(g, b.x, b.y, '●', fade);
    else if (age <= 4) set(g, b.x, b.y, '·', fade);
  }
  [...String(dir * 45).padStart(3, '0')].forEach((c, i) => set(g, 3 + i, 5, c, 'a'));
  return toArt(g);
}

const search: StationDef = {
  kind: 'search',
  name: 'radar scope',
  fps: 6,
  colors: RADAR,
  frames: frames(16, (i) => radar(Math.floor(i / 2), BLIPS)),
  active: frames(8, (i) => radar(i, BLIPS_HOT)),
};

// ── run: server rack ─────────────────────────────────────────────────────
const RACK = {
  f: hex('#4a524c'), k: hex('#0b0f0c'), K: hex('#121814'), g: hex('#39ff6e'), o: hex('#123d20'),
  a: hex('#ffb000'), m: hex('#ff2a8a'), d: hex('#5b6660'), D: hex('#ffd27a'), c: hex('#2fbf5a'),
};

function rack(frame: number, active: boolean): Art {
  const g = grid(
    [' ┌───────┐ ', ' │       ├╮', ' │       ││', ' │       ││', ' │       ││', ' └┴─────┴┘╰'],
    [' fffffffff ', ' f       fc', ' f       fc', ' f       fc', ' f       fc', ' fffffffffc'],
    ['           ', '  kkkkkkk  ', '  KKKKKKK  ', '  kkkkkkk  ', '  KKKKKKK  ', '           '],
  );
  for (let row = 0; row < 4; row++) {
    for (let i = 0; i < 4; i++) {
      const id = row * 4 + i;
      let on: boolean;
      let key: string;
      if (active) {
        const n = noise(frame * 37 + id, 5);
        on = n < 0.55;
        key = n < 0.04 ? 'm' : n < 0.14 ? 'a' : 'g';
      } else {
        on = noise(id, 6) < 0.6;
        if (noise(id, 7) < 0.25) on = (frame + id) % 4 < 2;
        key = noise(id, 8) < 0.15 ? 'a' : 'g';
      }
      set(g, 2 + i, 1 + row, '▪', on ? key : 'o');
    }
    const busy = active && noise(frame * 13 + row, 9) < 0.5;
    set(g, 7, 1 + row, '═', busy ? 'D' : 'd');
    set(g, 8, 1 + row, '═', 'd');
  }
  return toArt(g);
}

const run: StationDef = {
  kind: 'run',
  name: 'server rack',
  fps: 8,
  colors: RACK,
  frames: frames(8, (i) => rack(i, false)),
  active: frames(10, (i) => rack(i, true)),
};

// ── web: satellite dish ──────────────────────────────────────────────────
const DISH = {
  w: hex('#aab3ad'), m: hex('#4a524c'), l: hex('#3d2a00'), L: hex('#ffb000'), g: hex('#39ff6e'),
  s: hex('#7dffa0'), S: hex('#1f8a44'),
};

function dish(led: string, waves: number[]): Art {
  const g = grid(
    ['           ', '     ●     ', '▙  ╲ │ ╱  ▟', '▝█▄  │  ▄█▘', '  ▀▀▀█▀▀▀  ', '   ▄███▄   '],
    ['           ', `     ${led}     `, 'w  m m m  w', 'www  m  www', '  wwwwwww  ', '   mmmmm   '],
  );
  for (const r of waves) {
    const k = r <= 2 ? 's' : 'S';
    set(g, 5 - r, 1, '(', k);
    set(g, 5 + r, 1, ')', k);
    if (r >= 2) {
      set(g, 5 - r + 1, 0, '╭', k);
      for (let x = 5 - r + 2; x <= 5 + r - 2; x++) set(g, x, 0, '─', k);
      set(g, 5 + r - 1, 0, '╮', k);
    }
  }
  return toArt(g);
}

const web: StationDef = {
  kind: 'web',
  name: 'satellite dish',
  fps: 4,
  colors: DISH,
  frames: [dish('L', []), dish('l', []), dish('l', []), dish('l', [])],
  active: frames(4, (i) => dish(i % 2 ? 'g' : 'L', [i + 1, ((i + 2) % 4) + 1])),
};

// ── think: conspiracy board ──────────────────────────────────────────────
const BOARD = {
  w: hex('#5a3b24'), c: hex('#6e4c2d'), p: hex('#e6dfc8'), y: hex('#f2c94c'), r: hex('#8a2028'),
  R: hex('#ff3b4a'), n: hex('#ff2a8a'), g: hex('#39ff6e'), a: hex('#ffb000'),
};

const STRINGS: Array<Array<[number, number, string]>> = [
  [[2, 2, '╲'], [3, 2, '─'], [4, 2, '─']],
  [[8, 2, '╱'], [7, 2, '─'], [6, 2, '─']],
  [[3, 3, '─'], [4, 3, '─'], [6, 3, '─'], [7, 3, '─']],
];

function corkboard(stage: number, hot: boolean, mark: string, markKey: string): Art {
  const g = grid(
    ['┌─────────┐', '│●▀  ?  ▀●│', '│    ●    │', '│●▄  ▪  ▄●│', '└┬───────┬┘', ' ┸       ┸ '],
    ['wwwwwwwwwww', 'wnp  a  ygw', 'w    n    w', 'way  p  pnw', 'wwwwwwwwwww', ' w       w '],
    ['           ', ' ccccccccc ', ' ccccccccc ', ' ccccccccc ', '           ', '           '],
  );
  for (let i = 0; i < stage; i++) for (const [x, y, ch] of STRINGS[i]) set(g, x, y, ch, hot ? 'R' : 'r');
  set(g, 5, 1, mark, markKey);
  return toArt(g);
}

const think: StationDef = {
  kind: 'think',
  name: 'conspiracy board',
  fps: 2,
  colors: BOARD,
  frames: [corkboard(2, false, '?', 'a'), corkboard(2, false, '?', 'p')],
  active: [
    corkboard(0, false, '?', 'a'),
    corkboard(1, false, '?', 'a'),
    corkboard(2, false, '?', 'a'),
    corkboard(3, false, '?', 'a'),
    corkboard(3, true, '!', 'n'),
    corkboard(3, false, '!', 'a'),
    corkboard(3, true, '!', 'n'),
    corkboard(3, false, '!', 'a'),
  ],
};

// ── idle: beanbag + pizza box ────────────────────────────────────────────
const CHILL = {
  b: hex('#5a1846'), h: hex('#8a2a6a'), s: hex('#3a0f2e'), k: hex('#8a6a3a'), t: hex('#c0392b'), z: hex('#e0a030'),
  p: hex('#a31f1f'), c: hex('#c08a3a'), m: hex('#8fa39a'), M: hex('#4d5c55'), n: hex('#ffb000'), N: hex('#39ff6e'),
};

const STEAM: Array<[string, string]> = [
  ['        ~  ', '         ~ '],
  ['         ~ ', '        ~  '],
  ['        · ~', '        ~  '],
  ['       ~ · ', '         ~ '],
];

function chill(steam: number, slices: number, note: number): Art {
  const [s0, s1] = STEAM[steam % STEAM.length];
  const g = grid(
    [s0, s1, '       ▗▄▄▖', '▗██▖   ▐ZA▌', '█████▙▖▐  ▌', '███████▝▀▀▘'],
    [keys(s0, 'M'), keys(s1, 'm'), '       kkkk', 'bhhb   kttk', 'bbbbbbbc  c', 'ssssssskkkk'],
    ['           ', '           ', '           ', '        kk ', '        zz ', '           '],
  );
  for (let i = 0; i < 2; i++) set(g, 8 + i, 4, i < slices ? '●' : '·', i < slices ? 'p' : 'c', i < slices ? 'z' : 'k');
  if (note >= 0) set(g, 2 + (note % 2), note % 2, note % 2 ? '♫' : '♪', note % 4 < 2 ? 'n' : 'N');
  return toArt(g);
}

const idle: StationDef = {
  kind: 'idle',
  name: 'beanbag & pizza',
  fps: 3,
  colors: CHILL,
  frames: frames(4, (i) => chill(i, 2, -1)),
  active: frames(12, (i) => chill(i, 2 - Math.min(2, Math.floor(i / 4)), i)),
};

// ── entrance: steel hatch ────────────────────────────────────────────────
const HATCH = {
  m: hex('#2e3430'), d: hex('#6b746f'), e: hex('#2a302c'), r: hex('#a3aca6'), y: hex('#ffb000'), z: hex('#14140f'),
  x: hex('#010302'), l: hex('#1f6b3a'), k: hex('#1c211e'), K: hex('#8a948e'), g: hex('#39ff6e'), G: hex('#145c2d'), n: hex('#ff2a8a'),
};

function hatch(open: boolean, led: string, keysLit: boolean): Art {
  const inner = open ? '   ' : '▒▒▒';
  const mid = open ? '   ' : '▒◙▒';
  const g = grid(
    ['▞▞▞▞▞▞▞   ', '█┌───┐█▗▄▖', `█│${inner}│█▐●▌`, `█│${mid}│█▐▪▌`, `█│${inner}│█▝▀▘`, '█└───┘█   '],
    ['yyyyyyy   ', 'mdddddmkkk', `md${keys(inner, 'd')}dmk${led}k`, `md${open ? '   ' : 'drd'}dmk${keysLit ? 'g' : 'K'}k`, `md${keys(inner, 'd')}dmkkk`, 'mdddddm   '],
    ['zzzzzzz   ', '          ', `  ${open ? 'xxx' : 'eee'}   k `, `  ${open ? 'xxx' : 'eee'}   k `, `  ${open ? 'xxx' : 'eee'}     `, '          '],
  );
  if (open) for (let x = 2; x <= 4; x++) set(g, x, 4, '▄', 'l');
  return toArt(g);
}

const entrance: StationDef = {
  kind: 'entrance',
  name: 'steel hatch',
  fps: 4,
  colors: HATCH,
  frames: [hatch(false, 'n', false)],
  active: [hatch(true, 'g', true), hatch(true, 'G', false), hatch(true, 'g', false), hatch(true, 'G', true)],
};

// ── backdrop decor ───────────────────────────────────────────────────────
type DecorKind = 'window' | 'poster' | 'router' | 'cracker' | 'neon';
type Decor = { kind: DecorKind; x: number; y: number; w: number; h: number };

const DECOR_SIZE: Record<DecorKind, [number, number]> = {
  window: [18, 4],
  poster: [13, 4],
  router: [9, 3],
  cracker: [10, 3],
  neon: [12, 3],
};

const ORDER: DecorKind[] = ['window', 'poster', 'router', 'cracker', 'neon'];

// Places wall decor in the free space above each level's stations (the
// bottom 7 rows of every band are left to stations and characters).
function layout(r: Rect, floors: number[]): Decor[] {
  const out: Decor[] = [];
  wallBands(r, floors).forEach((band, level) => {
    const top = band.y + (level === 0 ? 2 : 1);
    const free = band.y + band.h - 7 - top;
    if (free < 2) return;
    let x = band.x + 3;
    for (let i = 0; i < ORDER.length; i++) {
      const kind = ORDER[(i + level * 2) % ORDER.length];
      const [w, minH] = DECOR_SIZE[kind];
      const h = kind === 'window' ? Math.min(6, free) : minH;
      if (h < minH || h > free) continue;
      if (x + w > band.x + band.w - 2) continue;
      out.push({ kind, x, y: top, w, h });
      x += w + Math.max(4, Math.floor((band.w - 70) / 5));
    }
  });
  return out;
}

function cput(s: Screen, r: Rect, x: number, y: number, ch: string, fg?: RGB, bg?: RGB): void {
  if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) s.put(x, y, ch, fg, bg);
}

const FRAME = hex('#3a403c');
const SKY_TOP = hex('#04071a');
const SKY_LOW = hex('#1a1840');
const TOWERS = [hex('#03050c'), hex('#080b18')];
const LIGHTS = ['#ffcf6a', '#ffe9a8', '#8fd3ff', '#ff9f43'].map(hex);
const MOON = hex('#e8e4c8');
const STAR = hex('#d8e0ff');

function drawWindow(s: Screen, r: Rect, d: Decor, t: number): void {
  const iw = d.w - 2;
  const ih = d.h - 2;
  const mid = Math.floor(iw / 2);
  textIn(s, r, d.x, d.y, `┌${'─'.repeat(mid)}┬${'─'.repeat(iw - mid - 1)}┐`, FRAME);
  textIn(s, r, d.x, d.y + d.h - 1, `└${'─'.repeat(mid)}┴${'─'.repeat(iw - mid - 1)}┘`, FRAME);
  for (let iy = 0; iy < ih; iy++) {
    const y = d.y + 1 + iy;
    const sky = mix(SKY_TOP, SKY_LOW, ih > 1 ? iy / (ih - 1) : 1);
    cput(s, r, d.x, y, '│', FRAME);
    cput(s, r, d.x + d.w - 1, y, '│', FRAME);
    for (let ix = 0; ix < iw; ix++) {
      const x = d.x + 1 + ix;
      if (ix === mid) {
        cput(s, r, x, y, '│', FRAME, sky);
        continue;
      }
      const b = Math.floor(ix / 3);
      const height = 1 + Math.floor(noise(b, 43) * (ih > 2 ? ih - 1 : ih));
      if (iy >= ih - height) {
        const tower = TOWERS[b % 2];
        const cell = ix * 7 + iy * 131;
        const lit = noise(cell, 45) < 0.45;
        const blink = noise(cell, 46 + Math.floor(t * 0.4 + noise(cell, 47) * 7)) < 0.12;
        if (lit !== blink) cput(s, r, x, y, '▪', LIGHTS[Math.floor(noise(cell, 48) * LIGHTS.length)], tower);
        else cput(s, r, x, y, ' ', undefined, tower);
      } else if (iy === 0 && ix === iw - 3) {
        cput(s, r, x, y, '●', MOON, sky);
      } else if (noise(ix * 5 + iy, 49) > 0.86) {
        const tw = 0.3 + 0.7 * pulse(t, 2.5 + noise(ix, 50) * 3, noise(ix, 51) * 5);
        cput(s, r, x, y, '·', mix(sky, STAR, tw), sky);
      } else {
        cput(s, r, x, y, ' ', undefined, sky);
      }
    }
  }
}

function drawPoster(s: Screen, r: Rect, d: Decor, t: number): void {
  const paper = hex('#1e0716');
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) cput(s, r, d.x + x, d.y + y, ' ', undefined, paper);
  const glow = pulse(t, 3.2);
  const ink = mix(MAGENTA, hex('#ffd0e6'), 0.3 * glow);
  const tape = hex('#8f8c7a');
  cput(s, r, d.x, d.y, '▀', tape, paper);
  cput(s, r, d.x + d.w - 1, d.y, '▀', tape, paper);
  const center = (str: string) => d.x + Math.floor((d.w - str.length) / 2);
  textIn(s, r, center('HACK THE'), d.y + 1, 'HACK THE', ink, paper);
  textIn(s, r, center('PLANET!'), d.y + 2, 'PLANET!', mix(AMBER, hex('#fff0c0'), 0.25 * glow), paper);
  textIn(s, r, d.x + 2, d.y + 3, '~~~~◉~~~~', mix(paper, GREEN, 0.55), paper);
}

function drawRouter(s: Screen, r: Rect, d: Decor, t: number): void {
  const body = hex('#20262a');
  const shelf = hex('#2e2620');
  const ant = hex('#4a524c');
  for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) cput(s, r, x, y, ' ');
  cput(s, r, d.x + 2, d.y, '╻', ant);
  cput(s, r, d.x + 6, d.y, '╻', ant);
  cput(s, r, d.x + 1, d.y + 1, '▐', body);
  cput(s, r, d.x + 7, d.y + 1, '▌', body);
  const states = [
    true,
    Math.floor(t * 1.2) % 2 === 0,
    noise(Math.floor(t * 9), 52) > 0.35,
    noise(Math.floor(t * 6), 53) > 0.45,
    noise(Math.floor(t / 1.5), 54) > 0.8,
  ];
  const colors = [GREEN, AMBER, GREEN, GREEN, MAGENTA];
  for (let i = 0; i < 5; i++) cput(s, r, d.x + 2 + i, d.y + 1, '●', states[i] ? colors[i] : mix(colors[i], body, 0.8), body);
  for (let x = 0; x < d.w; x++) cput(s, r, d.x + x, d.y + 2, '▀', shelf);
}

const HEX = '0123456789ABCDEF';

function drawCracker(s: Screen, r: Rect, d: Decor, t: number): void {
  const face = hex('#0d0900');
  const target = 'DEADBEEF';
  const period = 9;
  const phase = ((t % period) + period) % period;
  const found = Math.min(target.length, Math.floor((phase / (period - 1.5)) * (target.length + 1)));
  const done = found >= target.length;
  textIn(s, r, d.x, d.y, '┌─CRACK──┐', FRAME);
  textIn(s, r, d.x, d.y + 2, '└────────┘', FRAME);
  cput(s, r, d.x, d.y + 1, '│', FRAME);
  cput(s, r, d.x + 9, d.y + 1, '│', FRAME);
  for (let i = 0; i < target.length; i++) {
    const x = d.x + 1 + i;
    if (i < found) {
      const c = done && Math.floor(t * 4) % 2 ? hex('#d8ffe0') : GREEN;
      cput(s, r, x, d.y + 1, target[i], c, face);
    } else {
      const ch = HEX[Math.floor(noise(i, Math.floor(t * 14)) * 16)];
      cput(s, r, x, d.y + 1, ch, mix(AMBER, face, 0.45), face);
    }
  }
}

function drawNeon(s: Screen, r: Rect, d: Decor, t: number): void {
  const wire = hex('#2a302c');
  cput(s, r, d.x + 2, d.y, '╎', wire);
  cput(s, r, d.x + d.w - 3, d.y, '╎', wire);
  const text = 'NO CARRIER';
  const stutter = noise(Math.floor(t * 12), 91) > 0.94;
  const level = stutter ? 0.25 : 0.85 + 0.15 * Math.sin(t * 5);
  for (let x = d.x; x < d.x + d.w; x++) cput(s, r, x, d.y + 1, ' ');
  for (let y = d.y; y < d.y + d.h; y++) {
    for (let x = d.x; x < d.x + d.w; x++) {
      const edge = Math.min(x - d.x, d.x + d.w - 1 - x);
      const a = (y === d.y + 1 ? 0.2 : 0.07) * Math.min(1, (edge + 1) / 3) * level;
      if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) s.blendBg(x, y, MAGENTA, a);
    }
  }
  [...text].forEach((ch, i) => {
    if (ch === ' ') return;
    const broken = i === 3 && noise(Math.floor(t * 7), 92) > 0.6;
    const k = broken ? 0.15 : level;
    cput(s, r, d.x + 1 + i, d.y + 1, ch, mix(hex('#3a0820'), mix(MAGENTA, hex('#ffd6ea'), 0.35), k));
  });
}

// Ceiling cable bundle: a tray with cables drooping between clamps.
const CABLES = ['#1f8a44', '#b07a00', '#4a524c', '#7a1a4a', '#2fbf5a'].map(hex);

function drawCables(s: Screen, r: Rect): void {
  const tray = hex('#262b28');
  const clamp = hex('#5b6660');
  const span = 13;
  for (let x = r.x; x < r.x + r.w; x++) {
    const u = (x - r.x + 4) % span;
    cput(s, r, x, r.y, '▀', u === 0 ? clamp : tray);
    if (r.h < 4) continue;
    const idx = Math.floor((x - r.x + 4) / span);
    const color = CABLES[Math.floor(noise(idx, 31) * CABLES.length)];
    const ch = u === 1 ? '╰' : u === span - 1 ? '╯' : u === 0 ? ' ' : '─';
    if (noise(idx, 32) < 0.8 && ch !== ' ') cput(s, r, x, r.y + 1, ch, color);
  }
}

// ── matrix rain ──────────────────────────────────────────────────────────
const RAIN_GLYPHS = [...'01$#%&*+<>{}[]=01'];
const RAIN = hex('#2fd862');
const RAIN_HEAD = hex('#c8ffd6');

function drawRain(s: Screen, r: Rect, t: number, band: Rect, rowBg: (y: number) => RGB): void {
  if (band.h < 2) return;
  for (let x = band.x; x < band.x + band.w; x++) {
    const cx = x - r.x;
    if (noise(cx, 11) > 0.3) continue;
    const speed = 3 + noise(cx, 12) * 6;
    const len = 4 + Math.floor(noise(cx, 13) * 7);
    const cycle = band.h + len + 4 + Math.floor(noise(cx, 14) * band.h);
    const head = Math.floor((((t * speed + noise(cx, 15) * 97) % cycle) + cycle) % cycle);
    for (let i = 0; i < len; i++) {
      const yy = head - i;
      if (yy < 0 || yy >= band.h) continue;
      const y = band.y + yy;
      const zone = yy >= band.h - 7 ? 0.4 : 1;
      const bg = rowBg(y);
      const fg = i === 0 ? mix(bg, RAIN_HEAD, 0.8 * zone) : mix(bg, RAIN, (1 - i / len) * 0.55 * zone);
      const bucket = Math.floor(t * 3 + noise(cx * 7 + yy, 16) * 5);
      cput(s, r, x, y, RAIN_GLYPHS[Math.floor(noise(cx * 131 + yy * 7, bucket) * RAIN_GLYPHS.length)], fg);
    }
  }
}

const GLOW = hex('#0f2e1a');
const CONCRETE = [hex('#1a1d1b'), hex('#161917'), hex('#1e211f')];
const CABLE_G = hex('#1d4a2a');
const CABLE_A = hex('#4a3410');
const GLINT = hex('#9dffb6');
const GRIT = hex('#2a2e2b');
const SLAB = hex('#202421');

function drawBackdrop(s: Screen, r: Rect, t: number, floors: number[]): void {
  const bands = wallBands(r, floors);
  // Per-row wall tones: dark at the ceiling, faint CRT-green glow near floors.
  const tones: Array<[RGB, RGB]> = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    const band = bands.find((b) => y >= b.y && y < b.y + b.h);
    const k = band ? ((y - band.y) / Math.max(1, band.h)) ** 2 * 0.55 : 0;
    tones.push([mix(P.wall, GLOW, k), mix(P.wall2, GLOW, k)]);
  }
  const rowBg = (y: number) => tones[Math.max(0, Math.min(tones.length - 1, y - r.y))][0];
  for (let y = r.y; y < r.y + r.h; y++) {
    const [a, b] = tones[y - r.y];
    const row = Math.floor((y - r.y) / 2);
    for (let x = r.x; x < r.x + r.w; x++) {
      const block = (Math.floor((x - r.x + (row % 2) * 4) / 8) + row) % 2;
      s.put(x, y, ' ', P.text, block ? a : b);
    }
  }
  for (const band of bands) drawRain(s, r, t, band, rowBg);
  drawCables(s, r);
  for (const d of layout(r, floors)) {
    if (d.kind === 'window') drawWindow(s, r, d, t);
    else if (d.kind === 'poster') drawPoster(s, r, d, t);
    else if (d.kind === 'router') drawRouter(s, r, d, t);
    else if (d.kind === 'cracker') drawCracker(s, r, d, t);
    else drawNeon(s, r, d, t);
  }
  drawFloors(s, r, floors, (x, row, level) => {
    const bg = CONCRETE[Math.floor(noise(x * 3 + row * 977 + level * 7919, 61) * 3)];
    if (row === 0) {
      const glint = noise(x * 13 + level, 63 + Math.floor(t * 1.5 + noise(x, 64) * 3));
      if (glint > 0.985) return { ch: '·', fg: GLINT, bg };
      return { ch: x % 9 === 4 ? '▔' : ' ', fg: GRIT, bg };
    }
    const kind = noise(Math.floor((x + level * 5) / 11), 62 + level);
    if (kind < 0.4) return { ch: '─', fg: CABLE_G, bg };
    if (kind < 0.6) return { ch: '─', fg: CABLE_A, bg };
    return { ch: noise(x, 65) > 0.93 ? '·' : ' ', fg: GRIT, bg };
  });
  // Underside of the mezzanine.
  for (const fy of floors.slice(0, -1)) {
    const y = fy + 2;
    if (y < r.y || y >= r.y + r.h) continue;
    for (let x = r.x; x < r.x + r.w; x++) s.put(x, y, '▀', SLAB);
  }
}

// ── ambient ──────────────────────────────────────────────────────────────
const isFree = (s: Screen, x: number, y: number) => s.charAt(x, y) === ' ';

function glitch(s: Screen, r: Rect, t: number): void {
  const slot = Math.floor(t / 5.3);
  if (noise(slot, 81) < 0.6) return;
  const start = noise(slot, 82) * 5;
  const local = t - slot * 5.3;
  if (local < start || local >= start + 0.18) return;
  const y0 = r.y + Math.floor(noise(slot, 83) * r.h);
  const h = 1 + Math.floor(noise(slot, 84) * 2);
  const shift = (1 + Math.floor(noise(slot, 85) * 3)) * (noise(slot, 86) < 0.5 ? -1 : 1);
  for (let y = y0; y < Math.min(y0 + h, r.y + r.h); y++) {
    const row: Array<{ ch: string; fg: RGB; bg: RGB }> = [];
    for (let x = r.x; x < r.x + r.w; x++) row.push({ ch: s.charAt(x, y), fg: s.fgAt(x, y), bg: s.bgAt(x, y) });
    for (let x = r.x; x < r.x + r.w; x++) {
      const src = x - shift - r.x;
      if (src >= 0 && src < row.length) s.put(x, y, row[src].ch, row[src].fg, row[src].bg);
      s.blendBg(x, y, MAGENTA, 0.18);
      s.blendFg(x, y, MAGENTA, 0.3);
    }
  }
}

function drawAmbient(s: Screen, r: Rect, t: number): void {
  const inside = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  // Stray bits drifting up through the air.
  const span = Math.max(1, r.h - 4);
  for (let i = 0; i < Math.max(3, Math.floor(r.w / 12)); i++) {
    const period = 6 + noise(i, 71) * 6;
    const p = (((t + noise(i, 72) * period) % period) + period) % period / period;
    const x = r.x + Math.floor(noise(i, 73) * r.w + Math.sin(t * 0.8 + i) * 1.2);
    const y = r.y + r.h - 3 - Math.floor(p * span);
    if (!inside(x, y) || !isFree(s, x, y)) continue;
    const bit = noise(i, 74 + Math.floor(t * 1.5)) < 0.5 ? '0' : '1';
    s.put(x, y, bit, mix(GREEN, P.wall, 0.45 + p * 0.45));
  }
  // CRT scanlines with a faint flicker, plus a slow rolling refresh bar.
  const dark = 0.1 + 0.035 * Math.sin(t * 9.3) + 0.02 * Math.sin(t * 23.7);
  const bar = r.y + Math.floor(((t / 6) % 1) * (r.h + 6)) - 3;
  for (let y = r.y; y < r.y + r.h; y++) {
    const odd = (y - r.y) % 2 === 1;
    const inBar = y >= bar && y < bar + 2;
    if (!odd && !inBar) continue;
    for (let x = r.x; x < r.x + r.w; x++) {
      if (odd) s.blendBg(x, y, BLACK, dark);
      if (inBar) s.blendBg(x, y, GREEN, 0.035);
    }
  }
  glitch(s, r, t);
}

export const den: Theme = {
  id: 'den',
  name: "Hacker's Den",
  tagline: 'green rain, warm pizza and a radar that never sleeps',
  palette: P,
  stations: [write, read, search, run, web, think, idle],
  entrance,
  drawBackdrop,
  drawAmbient,
};

export default den;
