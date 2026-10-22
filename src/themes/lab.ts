import { hex, mix } from '../term/color.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Art, Palette, StationDef, Theme } from './types.ts';
import { art, drawFloors, noise, textIn, wallBands } from './art.ts';

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

const keys = (line: string, k: string) => [...line].map((c) => (c === ' ' ? ' ' : k)).join('');

// ── write: workbench computer ────────────────────────────────────────────
const PC = { f: hex('#5c6b73'), s: hex('#062a2f'), g: hex('#3ddc97'), c: hex('#4cc9f0'), d: hex('#eef3f5'), l: hex('#8a9ba3') };

function workbench(l1: string, l2: string): Art {
  return art(
    [' ┌───────┐ ', ` │${l1}│ `, ` │${l2}│ `, ' └──┬─┬──┘ ', '▄▄▄▄▄▄▄▄▄▄▄', ' █       █ '],
    [' fffffffff ', ` f${keys(l1, 'g')}f `, ` f${keys(l2, 'c')}f `, ' fffffffff ', 'ddddddddddd', ' l       l '],
    ['           ', '  sssssss  ', '  sssssss  ', '           ', '           ', '           '],
  );
}

const write: StationDef = {
  kind: 'write',
  name: 'workbench',
  fps: 6,
  colors: PC,
  frames: [workbench('▌      ', '       '), workbench('       ', '       ')],
  active: [
    workbench('▬▬ ▬▬▬ ', '  ▬▬▬  '),
    workbench('  ▬▬▬  ', '▬▬▬ ▬▬ '),
    workbench('▬▬▬ ▬▬ ', '  ▬ ▬▬▬'),
    workbench('  ▬ ▬▬▬', '▬▬ ▬▬▬▌'),
  ],
};

// ── read: bookshelf ──────────────────────────────────────────────────────
const SHELF = {
  w: hex('#8d6e63'), k: hex('#3e2723'),
  a: hex('#e63946'), b: hex('#457b9d'), c: hex('#2a9d8f'), d: hex('#e9c46a'), e: hex('#9b5de5'),
};

function shelf(gap: number): Art {
  const books = ['▌▐█▌▐▌█▐▌', '█▐▌▌█▐▌▐█', '▐▌█▐▌▌█▐▌'];
  const rows: string[] = ['┌─────────┐'];
  const fg: string[] = ['wwwwwwwwwww'];
  const bg: string[] = ['           '];
  books.forEach((b, i) => {
    const chars = [...b];
    if (gap === i) chars[(i * 3 + 4) % 9] = ' ';
    rows.push(`│${chars.join('')}│`);
    fg.push(`w${chars.map((c, x) => (c === ' ' ? ' ' : 'abcde'[(x + i * 2) % 5])).join('')}w`);
    bg.push(' kkkkkkkkk ');
    if (i < 2) {
      rows.push('├─────────┤');
      fg.push('wwwwwwwwwww');
      bg.push('           ');
    }
  });
  return art(rows, fg, bg);
}

const read: StationDef = {
  kind: 'read',
  name: 'bookshelf',
  fps: 1,
  colors: SHELF,
  frames: [shelf(-1)],
  active: [shelf(0), shelf(1), shelf(2), shelf(1)],
};

// ── search: DNA scanner ──────────────────────────────────────────────────
const DNA = { f: hex('#5c6b73'), s: hex('#0a1f2b'), a: hex('#ff4d8d'), b: hex('#4cc9f0'), r: hex('#e63946'), g: hex('#2ecc71'), y: hex('#ffd166'), o: hex('#6b4f00') };

function scanner(shift: number, lit: boolean): Art {
  const helix = (row: number) =>
    Array.from({ length: 8 }, (_, x) => ((x + shift + row) % 2 === 0 ? '╲' : '╱')).join('');
  const colors = (row: number) => Array.from({ length: 8 }, (_, x) => ((x + shift + row) % 4 < 2 ? 'a' : 'b')).join('');
  return art(
    ['┌────────┐', `│${helix(0)}│`, `│${helix(1)}│`, '├────────┤', '│ ▪▪ ◉ ▪ │', '└────────┘'],
    ['ffffffffff', `f${colors(0)}f`, `f${colors(1)}f`, 'ffffffffff', `f rg ${lit ? 'y' : 'o'} g f`, 'ffffffffff'],
    ['          ', ' ssssssss ', ' ssssssss ', '          ', ' ssssssss ', '          '],
  );
}

const search: StationDef = {
  kind: 'search',
  name: 'DNA scanner',
  fps: 4,
  colors: DNA,
  frames: [scanner(0, false), scanner(0, false), scanner(1, false), scanner(1, false)],
  active: [scanner(0, true), scanner(1, false), scanner(2, true), scanner(3, false)],
};

// ── run: tesla coil ──────────────────────────────────────────────────────
const COIL = { z: hex('#bdf4ff'), v: hex('#c77dff'), m: hex('#7d8b93'), o: hex('#d08c60'), p: hex('#a0522d') };
const coilBody = ['  ▄█▄  ', '  ▐▒▌  ', '  ▐▒▌  ', '  ▐▒▌  ', ' ▄███▄ '];
const coilFg = ['  mmm  ', '  opo  ', '  opo  ', '  opo  ', ' mmmmm '];

function coil(spark: string, key: string): Art {
  return art([spark, ...coilBody], [keys(spark, key), ...coilFg]);
}

const run: StationDef = {
  kind: 'run',
  name: 'tesla coil',
  fps: 8,
  colors: COIL,
  frames: [coil('       ', 'z'), coil('       ', 'z'), coil('   ·   ', 'v'), coil('       ', 'z')],
  active: [coil(' ╲ ╱ ╱ ', 'z'), coil('╱ ─ ╲  ', 'v'), coil(' ┘╲ ╱└ ', 'z'), coil('─╱ ╲ ─ ', 'v'), coil('  ╲│╱  ', 'z')],
};

// ── web: radio mast ──────────────────────────────────────────────────────
const RADIO = { b: hex('#e63946'), d: hex('#5c1f26'), m: hex('#7d8b93'), w: hex('#4cc9f0'), f: hex('#5c6b73'), s: hex('#1d3557'), k: hex('#ffd166') };

function radio(beacon: string, waves: number): Art {
  const w1 = waves === 0 ? '   ╱┃╲   ' : waves === 1 ? '  (╱┃╲)  ' : ' ( ╱┃╲ ) ';
  const w2 = waves === 0 ? '  ╱ ┃ ╲  ' : waves === 1 ? ' (╱ ┃ ╲) ' : '( ╱ ┃ ╲ )';
  const wk = (s: string) => [...s].map((c) => (c === '(' || c === ')' ? 'w' : c === ' ' ? ' ' : 'm')).join('');
  return art(
    ['    ●    ', w1, w2, ' ┌──┸──┐ ', ' │◉ ▤▤▤│ ', ' └─────┘ '],
    [`    ${beacon}    `, wk(w1), wk(w2), ' fffffff ', ' fk ffff ', ' fffffff '],
    ['         ', '         ', '         ', '         ', '  sssss  ', '         '],
  );
}

const web: StationDef = {
  kind: 'web',
  name: 'radio mast',
  fps: 4,
  colors: RADIO,
  frames: [radio('b', 0), radio('d', 0), radio('d', 0), radio('d', 0)],
  active: [radio('b', 0), radio('b', 1), radio('d', 2), radio('d', 1)],
};

// ── think: chalkboard ────────────────────────────────────────────────────
const BOARD = { f: hex('#8d6e63'), k: hex('#1f3d2b'), w: hex('#f1faee'), y: hex('#ffd166') };

function board(l1: string, l2: string, l3: string, tick = false): Art {
  const line = (s: string) => s.padEnd(9, ' ');
  const ink = (s: string) => [...line(s)].map((c) => (c === ' ' ? ' ' : c === '✓' || c === '?' ? 'y' : 'w')).join('');
  const r3 = tick ? l3 + ' ✓' : l3;
  return art(
    ['┌─────────┐', `│${line(l1)}│`, `│${line(l2)}│`, `│${line(r3)}│`, '└┬───────┬┘', ' ╵       ╵ '],
    ['fffffffffff', `f${ink(l1)}f`, `f${ink(l2)}f`, `f${ink(r3)}f`, 'fffffffffff', ' f       f '],
    ['           ', ' kkkkkkkkk ', ' kkkkkkkkk ', ' kkkkkkkkk ', '           ', '           '],
  );
}

const think: StationDef = {
  kind: 'think',
  name: 'chalkboard',
  fps: 1.5,
  colors: BOARD,
  frames: [board('E=mc²', ' ∫ψ dx', '  Σ≈?')],
  active: [board('E=', '', ''), board('E=mc²', '', ''), board('E=mc²', ' ∫ψ dx', ''), board('E=mc²', ' ∫ψ dx', '  Σ≈?'), board('E=mc²', ' ∫ψ dx', '  Σ≈?', true)],
};

// ── idle: coffee machine ─────────────────────────────────────────────────
const COFFEE = { s: hex('#ffffff'), m: hex('#495057'), r: hex('#e63946'), c: hex('#6f4518'), u: hex('#f8f9fa'), t: hex('#adb5bd') };

function coffee(steam: string): Art {
  return art(
    [steam, ' ▄▄▄▄▄▄  ', ' █▒▒▒▒█  ', ' █ ▐▌ █  ', ' █ ▀▀ █▗▖', '▄▄▄▄▄▄▄▄▄'],
    [keys(steam, 's'), ' mmmmmm  ', ' mrrrrm  ', ' m mm m  ', ' m uu muu', 'ttttttttt'],
  );
}

const idle: StationDef = {
  kind: 'idle',
  name: 'coffee machine',
  fps: 3,
  colors: COFFEE,
  frames: [coffee('   ~  ~  '), coffee('  ~  ~   '), coffee('   ~   ~ ')],
};

// ── entrance: airlock ────────────────────────────────────────────────────
const LOCK = { m: hex('#6c7a82'), d: hex('#a3b1b8'), r: hex('#e63946'), o: hex('#4a1a1e'), x: hex('#06141a'), y: hex('#ffd166') };

function airlock(open: boolean, light: string): Art {
  const inner = open ? '   ' : '▒▒▒';
  const innerFg = open ? '   ' : 'ddd';
  return art(
    ['▄▄▄●▄▄▄', '█┌───┐█', `█│${inner}│█`, `█│${inner}│█`, `█│${inner}│█`, '█└───┘█'],
    [`mmm${light}mmm`, 'mdddddm', `md${innerFg}dm`, `md${innerFg}dm`, `md${innerFg}dm`, 'mdddddm'],
    ['       ', '       ', open ? '  xxx  ' : '       ', open ? '  xxx  ' : '       ', open ? '  xxx  ' : '       ', '       '],
  );
}

const entrance: StationDef = {
  kind: 'entrance',
  name: 'airlock',
  fps: 3,
  colors: LOCK,
  frames: [airlock(false, 'o')],
  active: [airlock(true, 'r'), airlock(true, 'o')],
};

// ── backdrop decor ───────────────────────────────────────────────────────
type Decor = { kind: 'periodic' | 'flasks' | 'panel' | 'clock' | 'hazard'; x: number; y: number; w: number; h: number };

const DECOR_SIZE: Record<Decor['kind'], [number, number]> = {
  periodic: [20, 5],
  flasks: [15, 4],
  panel: [12, 4],
  clock: [7, 3],
  hazard: [3, 2],
};

const ORDER: Decor['kind'][] = ['flasks', 'periodic', 'panel', 'hazard', 'clock'];

// Places wall decor in the free space above each level's stations. Shared by
// backdrop and ambient so bubbles rise from the flasks that were drawn.
function layout(r: Rect, floors: number[]): Decor[] {
  const out: Decor[] = [];
  wallBands(r, floors).forEach((band, level) => {
    const top = band.y + (level === 0 ? 2 : 1);
    const free = band.y + band.h - 7 - top;
    if (free < 2) return;
    let x = band.x + 6; // clear of the ladders at both edges
    for (let i = 0; i < ORDER.length; i++) {
      const kind = ORDER[(i + level * 2) % ORDER.length];
      const [w, h] = DECOR_SIZE[kind];
      if (h > free) continue;
      if (x + w > band.x + band.w - 7) break;
      out.push({ kind, x, y: top, w, h });
      x += w + Math.max(4, Math.floor((band.w - 70) / 5));
    }
  });
  return out;
}

const GLASS: RGB = hex('#9fb8c2');
const LIQUIDS: RGB[] = ['#3ddc97', '#ff4d8d', '#4cc9f0', '#ffb703'].map(hex);
const ELEMENT: RGB[] = ['#e76f51', '#4895ef', '#2a9d8f', '#e9c46a', '#9b5de5'].map(hex);

function drawPeriodic(s: Screen, r: Rect, d: Decor, t: number): void {
  const paper = hex('#f7fbfc');
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) s.put(d.x + x, d.y + y, ' ', undefined, paper);
  textIn(s, r, d.x + 6, d.y, 'ELEMENTS', P.dim, paper);
  const shape = ['▪                ▪', '▪▪          ▪▪▪▪▪▪', '▪▪          ▪▪▪▪▪▪', '▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪▪'];
  const hot = Math.floor(noise(Math.floor(t * 1.5)) * 18);
  shape.forEach((row, y) => {
    [...row].forEach((ch, x) => {
      if (ch === ' ') return;
      const group = x < 2 ? 0 : x < 12 ? 1 : x < 14 ? 2 : x < 17 ? 3 : 4;
      const color = x === hot && y === 3 ? hex('#ffffff') : ELEMENT[group];
      s.put(d.x + 1 + x, d.y + 1 + y, '▪', color, x === hot && y === 3 ? ELEMENT[group] : paper);
    });
  });
}

function drawFlasks(s: Screen, d: Decor, t: number): void {
  const shelfC = hex('#8a9ba3');
  const bodies = ['▟█▙', '▐█▌', '(█)', '▟█▙'];
  bodies.forEach((body, i) => {
    const x = d.x + 1 + i * 4;
    const liquid = mix(LIQUIDS[i], hex('#ffffff'), 0.25 * (0.5 + 0.5 * Math.sin(t * 2 + i)));
    s.put(x + 1, d.y + 1, '┃', GLASS);
    [...body].forEach((ch, k) => s.put(x + k, d.y + 2, ch, ch === '(' || ch === ')' ? GLASS : liquid));
  });
  for (let x = 0; x < d.w; x++) s.put(d.x + x, d.y + 3, '▀', shelfC);
}

function drawPanel(s: Screen, d: Decor, t: number): void {
  const frame = hex('#5c6b73');
  const face = hex('#1d2b30');
  s.text(d.x, d.y, '┌──────────┐', frame);
  s.text(d.x, d.y + 3, '└──────────┘', frame);
  for (let row = 1; row <= 2; row++) {
    s.put(d.x, d.y + row, '│', frame);
    s.put(d.x + 11, d.y + row, '│', frame);
    for (let x = 1; x <= 10; x++) s.put(d.x + x, d.y + row, ' ', undefined, face);
  }
  const leds = [P.good, P.warn, P.bad, hex('#4cc9f0'), P.good];
  for (let i = 0; i < 5; i++) {
    const on = noise(Math.floor(t * 3) * 7 + i) > 0.4;
    s.put(d.x + 1 + i * 2, d.y + 1, '●', on ? leds[i] : mix(leds[i], face, 0.75), face);
  }
  const bars = '▁▂▃▄▅▆▇█';
  for (let i = 0; i < 10; i++) {
    const v = Math.floor((Math.sin(t * 3 + i * 0.7) * 0.5 + 0.5) * 7.99);
    s.put(d.x + 1 + i, d.y + 2, bars[v], hex('#3ddc97'), face);
  }
}

function drawClock(s: Screen, d: Decor, t: number, nowMs?: number): void {
  const frame = hex('#5c6b73');
  const face = hex('#0f1f24');
  const now = new Date(nowMs ?? Date.now());
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  s.text(d.x, d.y, '┌─────┐', frame);
  s.text(d.x, d.y + 1, '│', frame);
  s.text(d.x + 1, d.y + 1, `${hh}${Math.floor(t * 2) % 2 ? ':' : ' '}${mm}`, hex('#ff6b6b'), face);
  s.text(d.x + 6, d.y + 1, '│', frame);
  s.text(d.x, d.y + 2, '└─────┘', frame);
}

function drawHazard(s: Screen, d: Decor): void {
  const y = hex('#ffd166');
  s.text(d.x, d.y, ' ▄ ', y);
  s.put(d.x, d.y + 1, '▟', y);
  s.put(d.x + 1, d.y + 1, '!', hex('#1b1b1f'), y);
  s.put(d.x + 2, d.y + 1, '▙', y);
}

function drawBackdrop(s: Screen, r: Rect, t: number, floors: number[], now?: number): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const tile = (Math.floor((x - r.x) / 6) + Math.floor((y - r.y) / 3)) % 2;
      s.put(x, y, ' ', P.text, tile ? P.wall : P.wall2);
    }
  }
  // Ceiling pipe.
  const pipe = hex('#7d8b93');
  for (let x = r.x; x < r.x + r.w; x++) s.put(x, r.y, (x - r.x) % 16 === 8 ? '╤' : '═', pipe);
  for (const d of layout(r, floors)) {
    if (d.kind === 'periodic') drawPeriodic(s, r, d, t);
    else if (d.kind === 'flasks') drawFlasks(s, d, t);
    else if (d.kind === 'panel') drawPanel(s, d, t);
    else if (d.kind === 'clock') drawClock(s, d, t, now);
    else drawHazard(s, d);
  }
  drawFloors(s, r, floors, (x, row) => {
    const checker = (Math.floor(x / 2) + row) % 2 === 0;
    return { ch: row === 0 && x % 8 === 0 ? '▔' : ' ', fg: P.dim, bg: checker ? P.floor : P.floor2 };
  });
  // Underside of upper floors.
  for (const fy of floors.slice(0, -1)) {
    const y = fy + 2;
    if (y >= r.y + r.h) continue;
    for (let x = r.x; x < r.x + r.w; x++) s.put(x, y, '▀', hex('#5f717a'));
  }
}

const isFree = (s: Screen, x: number, y: number) => s.charAt(x, y) === ' ';

function drawAmbient(s: Screen, r: Rect, t: number, floors: number[]): void {
  const inside = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  // Bubbles rising from flasks.
  for (const d of layout(r, floors)) {
    if (d.kind !== 'flasks') continue;
    for (let i = 0; i < 4; i++) {
      const period = 1.6 + noise(i, 3);
      const p = ((t + noise(i, 9) * 3) % period) / period;
      const x = d.x + 2 + i * 4 + (p > 0.5 ? 1 : 0) * (i % 2 ? -1 : 1);
      const y = d.y - Math.floor(p * 3);
      if (inside(x, y) && isFree(s, x, y)) s.put(x, y, p < 0.4 ? 'o' : p < 0.75 ? '°' : '·', mix(LIQUIDS[i], P.wall, 0.2 + p * 0.5));
    }
  }
  // Pipe drips.
  for (let j = 0; r.x + 8 + j * 16 < r.x + r.w; j++) {
    const period = 4 + noise(j, 5) * 5;
    const p = ((t + noise(j, 6) * 10) % period) / period;
    if (p > 0.35) continue;
    const x = r.x + 8 + j * 16;
    const y = r.y + 1 + Math.floor((p / 0.35) * 4);
    if (inside(x, y) && isFree(s, x, y)) s.put(x, y, '·', hex('#4cc9f0'));
  }
  // Dust motes drifting through the light.
  for (let i = 0; i < Math.max(3, Math.floor(r.w / 14)); i++) {
    const x = r.x + Math.floor((noise(i, 1) * r.w + t * (0.6 + noise(i, 2))) % r.w);
    const y = r.y + 2 + Math.floor((noise(i, 4) * (r.h - 5) + Math.sin(t * 0.7 + i) * 1.5 + r.h) % Math.max(1, r.h - 4));
    if (inside(x, y) && isFree(s, x, y)) s.put(x, y, '·', mix(P.dim, P.wall, 0.4));
  }
  // Fluorescent flicker every so often.
  const cycle = Math.floor(t / 9);
  if (noise(cycle, 77) > 0.55 && t % 9 < 0.18) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.blendBg(x, y, hex('#000000'), 0.12);
  }
}

export const lab: Theme = {
  id: 'lab',
  name: 'Mad Science Lab',
  tagline: 'bubbling flasks, tesla coils and a very busy chalkboard',
  palette: P,
  stations: [write, read, search, run, web, think, idle],
  entrance,
  drawBackdrop,
  drawAmbient,
};


export default lab;
