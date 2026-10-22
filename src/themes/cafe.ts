import { hex, mix } from '../term/color.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Art, Palette, StationDef, Theme } from './types.ts';
import { art, drawFloors, noise, textIn, wallBands } from './art.ts';

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

// Shared materials.
const WALNUT = hex('#5a3a24');
const WALNUT_D = hex('#3e2718');
const OAK = hex('#a5713f');
const SAGE = hex('#9db494');
const SAGE2 = hex('#93ab8a');
const LEAF = hex('#6f9a5e');
const LEAF2 = hex('#4f7a46');
const TERRA = hex('#c9694a');
const MUSTARD = hex('#d9a441');
const CREAM = hex('#f4e8d4');
const SKY_TOP = hex('#7d91a5');
const SKY_BOT = hex('#a9b7c3');
const RAIN = hex('#dde8f0');
const CITY = hex('#5f6f80');
const WARM = hex('#ffc46b');

const keys = (line: string, k: string) => [...line].map((c) => (c === ' ' ? ' ' : k)).join('');
const cyc = <T>(list: readonly T[], i: number): T => list[((i % list.length) + list.length) % list.length];

// ── write: laptop table ──────────────────────────────────────────────────
const LAPTOP = {
  f: hex('#b8b2a7'), s: hex('#23313a'), g: hex('#9fe0b8'), c: hex('#f6c98a'), e: hex('#f2a7b8'),
  k: hex('#8d877d'), m: TERRA, h: hex('#fff6e8'), w: hex('#7a4a2a'), l: WALNUT,
};

// Steam above the mug, three rows by two columns.
const MUG_STEAM = [
  ['  ', ' )', '( '],
  [' (', ') ', ' )'],
  ['  ', ' (', ') '],
  [' ·', '  ', ' )'],
];

function laptop(l1: string, k1: string, l2: string, k2: string, steam: string[]): Art {
  return art(
    [` ┌──────┐${steam[0]}`, ` │${l1}│${steam[1]}`, ` │${l2}│${steam[2]}`, '▗▙▄▄▄▄▄▄▟▖▆', '▀▀▀▀▀▀▀▀▀▀▀', ' ▐       ▌ '],
    [` ffffffff${keys(steam[0], 'h')}`, ` f${k1}f${keys(steam[1], 'h')}`, ` f${k2}f${keys(steam[2], 'h')}`, 'kffkkkkffkm', 'wwwwwwwwwww', ' l       l '],
    ['           ', '  ssssss   ', '  ssssss   ', '           ', '           ', '           '],
  );
}

// Idle: the laptop plays lo-fi beats with a tiny equalizer.
const EQ = '▁▂▃▄▅▆▇';
function lofi(i: number): Art {
  const bars = Array.from({ length: 6 }, (_, x) => EQ[Math.floor(noise(i * 7 + x, 31) * 4 + (x % 2 ? 2 : 0))]).join('');
  const note = i % 2 ? ' ♪lofi' : '♫ lofi';
  return laptop(note, note[0] === ' ' ? ' egggg' : 'e gggg', bars, 'cccccc', MUG_STEAM[i % 4]);
}

const TYPED = ['▬▬ ▬▬▬', '▬▬▬ ▬ ', ' ▬▬ ▬▬', '▬ ▬▬▬ ', '▬▬▬▬ ▬', '▬▬ ▬  '];
function typing(i: number): Art {
  const l1 = TYPED[i % TYPED.length];
  const l2 = TYPED[(i + 3) % TYPED.length].slice(0, 2 + (i % 4)).padEnd(5, ' ') + (i % 2 ? '▌' : ' ');
  return laptop(l1, keys(l1, 'g'), l2, keys(l2, 'c'), MUG_STEAM[i % 4]);
}

const write: StationDef = {
  kind: 'write',
  name: 'laptop table',
  fps: 4,
  colors: LAPTOP,
  frames: [0, 1, 2, 3, 4, 5, 6, 7].map(lofi),
  active: [0, 1, 2, 3, 4, 5, 6, 7].map(typing),
};

// ── read: reading nook (bookcase + armchair + floor lamp) ────────────────
const NOOK = {
  w: hex('#6b4329'), k: hex('#3a2417'),
  a: TERRA, b: hex('#7d9a78'), c: MUSTARD, d: hex('#6d8fb0'), e: hex('#b5838d'),
  q: hex('#c46a4a'), u: hex('#e8b48f'), n: WALNUT_D,
  L: hex('#cdbb9f'), Y: hex('#ffd27a'), p: hex('#4a3a2e'), r: hex('#ffe6a8'), v: CREAM,
};

function nook(gap: number, lit: boolean, rays: boolean, book: boolean): Art {
  const shelves = ['▌█▐▌', '█▐▌█', '▐▌█▐'];
  const rows: string[] = [];
  const fg: string[] = [];
  const bg: string[] = [];
  const shelfRow = (i: number) => {
    const chars = [...shelves[i]];
    if (gap === i) chars[(i * 2 + 1) % 4] = ' ';
    return { g: `│${chars.join('')}│`, f: `w${chars.map((c, x) => (c === ' ' ? ' ' : 'abcde'[(x + i * 2) % 5])).join('')}w` };
  };
  const right = [
    { g: lit ? '▟█▙  ' : '▗▄▖  ', f: lit ? 'YYY  ' : 'LLL  ' },
    { g: rays ? '╱│╲  ' : ' │   ', f: rays ? 'rpr  ' : ' p   ' },
    { g: ' ▄▄▄ ', f: ' qqq ' },
    { g: '▐███▌', f: 'qqqqq' },
    { g: book ? '█▞▚▄█' : '█▄▄▄█', f: book ? 'qvvuq' : 'quuuq' },
    { g: '▘   ▝', f: 'n   n' },
  ];
  // The seat row's half blocks sit on the chair colour.
  const left = [
    { g: '┌────┐', f: 'wwwwww', b: '      ' },
    { ...shelfRow(0), b: ' kkkk ' },
    { g: '├────┤', f: 'wwwwww', b: '      ' },
    { ...shelfRow(1), b: ' kkkk ' },
    { g: '├────┤', f: 'wwwwww', b: '      ' },
    { ...shelfRow(2), b: ' kkkk ' },
  ];
  for (let y = 0; y < 6; y++) {
    rows.push(left[y].g + right[y].g);
    fg.push(left[y].f + right[y].f);
    bg.push(left[y].b + (y === 4 ? ' qqq ' : '     '));
  }
  return art(rows, fg, bg);
}

const read: StationDef = {
  kind: 'read',
  name: 'reading nook',
  fps: 1.5,
  colors: NOOK,
  frames: [nook(-1, false, false, false)],
  active: [nook(0, true, true, true), nook(0, true, false, true), nook(1, true, true, true), nook(1, true, false, true), nook(2, true, true, true), nook(2, true, false, true)],
};

// ── search: newspaper rack ───────────────────────────────────────────────
const RACK = { w: hex('#6b4329'), n: WALNUT_D, p: hex('#efe6d2'), i: hex('#4a4038'), r: hex('#b5473a'), t: hex('#8c8478'), x: hex('#ffffff') };

// Paper 2 pages: [masthead, line, line].
const PAGES = [
  ['POST', '▀▀▀▀', '≡≡ ≡'],
  ['≡▓▓≡', '≡▓▓≡', '≡≡≡≡'],
  ['SPRT', '≡ ≡≡', '▀▀▀▀'],
  ['≡≡≡≡', '▓▓ ≡', '▓▓ ≡'],
];

function rack(page: number, edge: number): Art {
  const pg = PAGES[page % PAGES.length];
  const next = PAGES[(page + 1) % PAGES.length];
  // While flipping, columns left of `edge` show the old page and columns right of it the new one.
  const show = (row: number) =>
    edge < 0 ? pg[row] : [...pg[row]].map((c, x) => (x < edge ? c : x === edge ? '▐' : [...next[row]][x])).join('');
  const ink = (s: string, row: number) =>
    [...s].map((c, x) => (c === ' ' ? ' ' : edge >= 0 && x === edge ? 'x' : /[A-Z]/.test(c) && row === 0 ? 'r' : c === '▓' ? 't' : 'i')).join('');
  const p1 = ['NEWS', '▀▀▀▀', '≡ ≡≡'];
  const r = (row: number) => `▐${p1[row]}▕${show(row)}▌`;
  const f = (row: number) => `w${ink(p1[row], row)}w${ink(show(row), row)}w`;
  return art(
    ['▗▄▄▄▄▄▄▄▄▄▖', r(0), r(1), r(2), '▐▄▄▄▄▄▄▄▄▄▌', '▐▌       ▐▌'],
    ['wwwwwwwwwww', f(0), f(1), f(2), 'wwwwwwwwwww', 'nn       nn'],
    ['           ', ' pppp pppp ', ' pppp pppp ', ' pppp pppp ', '           ', '           '],
  );
}

const search: StationDef = {
  kind: 'search',
  name: 'newspaper rack',
  fps: 5,
  colors: RACK,
  frames: [rack(0, -1)],
  active: [0, 1, 2, 3].flatMap((pg) => [rack(pg, -1), rack(pg, -1), rack(pg, 3), rack(pg, 2), rack(pg, 1), rack(pg, 0)]),
};

// ── run: espresso machine ────────────────────────────────────────────────
const ESPRESSO = {
  c: hex('#cfd2d6'), r: hex('#b5473a'), g: hex('#f0c66e'), k: hex('#3a2a22'), u: CREAM,
  h: hex('#ffffff'), v: hex('#e6e1d8'), d: hex('#6b3e26'), t: hex('#8a8f96'),
};

function espresso(puff: string[], drip: string, fill: boolean): Art {
  return art(
    [` ▗▄▟██▙▄▖${puff[0]}`, ` █◉ ▀▀ ◉█${puff[1]}`, ` █▀┳▀▀┳▀█${puff[2]}`, ` █ ${drip}  ${drip} █${puff[3]}`, ` █ ▆  ▆ █${puff[4]}`, '▀▀▀▀▀▀▀▀▀▀▀'],
    [` ccgccgcc${keys(puff[0], 'v')}`, ' cg gg gc' + keys(puff[1], 'h'), ` crcrrcrc${keys(puff[2], 'h')}`, ` c ${keys(drip, 'd')}  ${keys(drip, 'd')} c${keys(puff[3], 'v')}`, ` c ${fill ? 'd' : 'u'}  u c${keys(puff[4], 'v')}`, 'ttttttttttt'],
    ['           ', '  rrrrrr   ', '  r rr r   ', '           ', '           ', '           '],
  );
}

const PUFFS = [
  ['  ', '  ', '┐ ', '│ ', '╵ '],
  ['  ', '  ', '┐ ', '│ ', '╵░'],
  ['  ', ' ░', '┐▒', '│░', '╵ '],
  [' ░', '░▒', '┐░', '│ ', '╵▒'],
  ['▒ ', ' ░', '┐ ', '│░', '╵ '],
  ['░ ', '  ', '┐ ', '│ ', '╵ '],
];

const run: StationDef = {
  kind: 'run',
  name: 'espresso machine',
  fps: 6,
  colors: ESPRESSO,
  frames: [espresso(PUFFS[0], ' ', false), espresso(PUFFS[0], ' ', false), espresso(PUFFS[0], ' ', false), espresso(['  ', ' ·', '┐ ', '│ ', '╵ '], ' ', false)],
  active: [
    espresso(PUFFS[1], '╎', false),
    espresso(PUFFS[2], '│', false),
    espresso(PUFFS[3], '╎', true),
    espresso(PUFFS[4], '│', true),
    espresso(PUFFS[5], '·', true),
    espresso(PUFFS[0], ' ', true),
  ],
};

// ── web: vintage wall phone ──────────────────────────────────────────────
const PHONE = {
  o: hex('#a86f3c'), b: hex('#e0b04a'), k: hex('#2a2220'), r: hex('#f08a5d'), n: hex('#c9694a'),
  w: hex('#6b4329'), p: hex('#d9a441'), z: hex('#f7efe0'),
};

function phone(ring: number): Art {
  // Ringing alternates two shakes of the bells; the earpiece hops on its hook.
  const bells = ring === 0 ? '   ●─┬─●   ' : ring === 1 ? ' ((●─┬─●)) ' : '  (●─┬─●)  ';
  const bellsFg = ring === 0 ? '   bkkkb   ' : ring === 1 ? ' rrbkkkbrr ' : '  rbkkkbr  ';
  const ear = ring === 2 ? '▝' : '▌';
  const n1 = ring === 1 ? '♪' : ' ';
  const n2 = ring === 2 ? '♫' : ' ';
  return art(
    [bells, ` ${ear}▐ ▬▬▬ ▌╕${n1}`, ` ┃▐  ◘  ▌┘${n2}`, ' ╰▐  ▼  ▌  ', '  ▀▀▀▀▀▀▀  ', '  ▐ ▄▄▄ ▌  '],
    [bellsFg, ` ko bbb ob${keys(n1, 'z')}`, ` ko  k  ob${keys(n2, 'z')}`, ' ko  k  o  ', '  wwwwwww  ', '  w pnp w  '],
    ['           ', '   ooooo   ', '   ooooo   ', '   ooooo   ', '           ', '           '],
  );
}

const web: StationDef = {
  kind: 'web',
  name: 'wall phone',
  fps: 6,
  colors: PHONE,
  frames: [phone(0)],
  active: [phone(1), phone(2), phone(1), phone(2), phone(0), phone(0)],
};

// ── think: window seat with rain beyond ──────────────────────────────────
const SEAT = {
  f: hex('#6b4329'), s: SKY_TOP, S: SKY_BOT, r: RAIN, y: hex('#ffe08a'), c: hex('#e3a990'),
  a: TERRA, b: MUSTARD, w: WALNUT, n: WALNUT_D,
};

function windowSeat(phase: number, spark: number): Art {
  // Two panes of five cells each, two rows tall; rain falls column by column.
  const pane = (row: number) =>
    Array.from({ length: 4 }, (_, x) => ((x * 3 + row + phase) % 4 === 0 ? '╎' : ' ')).join('');
  const SPARK = ['·', '+', '*', '+', '·'];
  const spots: Array<[number, number]> = [[2, 1], [7, 2], [3, 2], [8, 1]];
  const rows = [`│${pane(0)}│${pane(2)}│`, `│${pane(1)}│${pane(3)}│`];
  const fgr = rows.map((rw) => [...rw].map((c) => (c === '│' ? 'f' : c === ' ' ? ' ' : 'r')).join(''));
  if (spark >= 0) {
    const [sx, sy] = spots[Math.floor(spark / SPARK.length) % spots.length];
    const g = SPARK[spark % SPARK.length];
    const row = [...rows[sy - 1]];
    const frow = [...fgr[sy - 1]];
    row[sx] = g;
    frow[sx] = 'y';
    rows[sy - 1] = row.join('');
    fgr[sy - 1] = frow.join('');
  }
  return art(
    ['┌────┬────┐', rows[0], rows[1], '╘════╧════╛', '█▆▄▄▄▄▄▄▄▆█', '█▀▀▀▀▀▀▀▀▀█'],
    ['fffffffffff', fgr[0], fgr[1], 'fffffffffff', 'wacccccccbw', 'wnnnnnnnnnw'],
    ['           ', ' ssss SSSS ', ' SSSS ssss ', '           ', '           ', '           '],
  );
}

const think: StationDef = {
  kind: 'think',
  name: 'window seat',
  fps: 3,
  colors: SEAT,
  frames: [0, 1, 2, 3].map((p) => windowSeat(p, -1)),
  active: Array.from({ length: 20 }, (_, i) => windowSeat(i % 4, i)),
};

// ── idle: sofa with a sleeping cat ───────────────────────────────────────
const SOFA = {
  s: hex('#9a5b36'), t: hex('#7c4528'), q: hex('#e9c9a8'), a: TERRA, b: MUSTARD, n: WALNUT_D, k: hex('#3b3330'), z: hex('#8b7360'),
};

function sofa(breath: boolean, z: number, purr = false): Art {
  // Z's (or purring hearts) drift up and away from the cat's head.
  const zz = (purr ? ['   ', '♥  ', ' ♥ ', '  ♥', ' ♥ ', '♥  '] : ['   ', 'z  ', ' z ', '  Z', '   ', '   '])[z % 6];
  const body = breath ? '▅▅▅' : '▄▄▄';
  return art(
    [`        ${zz}`, `    ${body}▙▟  `, ' ▗█▆▆██▆▆█▖', '▐█▙▄▄▄▄▄▟█▌', '▐█████████▌', ' ▘       ▝ '],
    [`        ${keys(zz, purr ? 'a' : 'z')}`, '    kkkkk  ', ' sssaasbbss', 'tstqqqqqtst', 'ttttttttttt', ' n       n '],
    ['           ', '           ', '           ', '   sssss   ', '           ', '           '],
  );
}

const idle: StationDef = {
  kind: 'idle',
  name: 'comfy sofa',
  fps: 2,
  colors: SOFA,
  frames: Array.from({ length: 12 }, (_, i) => sofa(Math.floor(i / 3) % 2 === 0, Math.floor(i / 2))),
  active: Array.from({ length: 12 }, (_, i) => sofa(Math.floor(i / 2) % 2 === 0, i, true)),
};

// ── entrance: front door with a shop bell ────────────────────────────────
const DOOR = {
  f: WALNUT_D, k: WALNUT, d: hex('#b07a45'), g: SKY_TOP, G: SKY_BOT, r: RAIN, b: hex('#e0b04a'),
  s: CREAM, a: TERRA, x: hex('#4b5a68'), p: hex('#7b8794'), n: hex('#f4d27a'),
};

// `swing` -1/0/1 tilts the bell on its bracket; `note` 1/2 shows a chime.
function door(open: boolean, swing: number, note: number, phase: number): Art {
  const drops = (n: number, row: number) =>
    Array.from({ length: n }, (_, x) => ((x * 3 + row * 3 + phase) % 4 === 0 ? '╎' : ' ')).join('');
  // Columns 8-10: brass bracket, swinging bell and its chimes.
  const hang = swing === 0 ? '│' : swing < 0 ? '╱' : '╲';
  const bell = swing < 0 ? '▲  ' : swing > 0 ? '  ▲' : ' ▲ ';
  const strip: Array<[string, string]> = [
    ['─┐ ', 'bb '],
    [` ${hang}${note === 1 ? '♪' : ' '}`, ` b${note === 1 ? 'n' : ' '}`],
    [bell, keys(bell, 'b')],
    [note === 2 ? ' ♫ ' : '   ', note === 2 ? ' n ' : '   '],
    ['   ', '   '],
    ['   ', '   '],
  ];
  const body: Array<[string, string, string]> = [['▄▄▄▄▄▄▄▄', 'kkkkkkkk', '        ']];
  if (open) {
    // Swung inward: the slab shows edge-on and the rainy street is outside.
    for (let row = 0; row < 4; row++) {
      const d = drops(5, row);
      body.push([`█▌${d}█`, `fd${keys(d, 'r')}f`, '  xxxxx ']);
    }
    body.push(['█▌▄▄▄▄▄█', 'fdpppppf', '  xxxxx ']);
  } else {
    const g0 = drops(4, 0);
    const g1 = drops(4, 1);
    body.push(
      [`█ ${g0} █`, `f ${keys(g0, 'r')} f`, ' dggggd '],
      [`█ ${g1} █`, `f ${keys(g1, 'r')} f`, ' dGGGGd '],
      ['█ OPEN █', 'f aaaa f', ' dssssd '],
      ['█     ●█', 'f     bf', ' dddddd '],
      ['█▁▁▁▁▁▁█', 'fbbbbbbf', ' dddddd '],
    );
  }
  return art(
    body.map((b, i) => b[0] + strip[i][0]),
    body.map((b, i) => b[1] + strip[i][1]),
    body.map((b) => `${b[2]}   `),
  );
}

const SWING = [-1, 0, 1, 0];
const CHIME = [1, 0, 2, 0];

const entrance: StationDef = {
  kind: 'entrance',
  name: 'front door',
  fps: 5,
  colors: DOOR,
  frames: [0, 1, 2, 3].map((p) => door(false, 0, 0, p)),
  active: Array.from({ length: 8 }, (_, i) => door(true, SWING[i % 4], CHIME[i % 4], i % 4)),
};

// ── backdrop decor ───────────────────────────────────────────────────────
type DecorKind = 'window' | 'menu' | 'plant' | 'picture' | 'clock' | 'shelf';
type Decor = { kind: DecorKind; x: number; y: number; w: number; h: number; ceil: number; seed: number };

const MENU = ['ESPRESSO 3', 'LATTE    4', 'CORTADO  4', 'MOCHA    5', 'CHAI     4', 'SCONE    3', 'PIE      5'];

const ORDER: DecorKind[][] = [
  ['window', 'menu', 'plant', 'picture', 'window', 'clock', 'shelf', 'plant', 'picture', 'window'],
  ['shelf', 'window', 'clock', 'plant', 'picture', 'window', 'menu', 'plant', 'picture', 'shelf'],
];

function decorSize(kind: DecorKind, free: number): [number, number] | null {
  if (kind === 'shelf') return free >= 2 ? [11, 2] : null;
  if (free < 3) return null;
  if (kind === 'window') return [15, Math.min(free, 7)];
  if (kind === 'menu') return [14, Math.min(free, 3 + MENU.length)];
  if (kind === 'plant') return [7, Math.min(free, 6)];
  if (kind === 'picture') return [7, free >= 5 ? 4 : 3];
  return [5, 3];
}

// Places wall decor in the free space above each level's stations. Shared by
// backdrop and ambient so steam and raindrops line up with what was drawn.
function layout(r: Rect, floors: number[]): Decor[] {
  const out: Decor[] = [];
  wallBands(r, floors).forEach((band, level) => {
    const top = band.y + 2;
    const free = band.y + band.h - 7 - top;
    if (free < 2) return;
    const avail = band.w - 6;
    const picked: Array<{ kind: DecorKind; w: number; h: number }> = [];
    let used = 0;
    for (const kind of ORDER[level % ORDER.length]) {
      const size = decorSize(kind, free);
      if (!size) continue;
      const need = used + (picked.length ? 4 : 0) + size[0];
      if (need > avail) continue;
      picked.push({ kind, w: size[0], h: size[1] });
      used = need;
    }
    if (!picked.length) return;
    const widths = picked.reduce((sum, p) => sum + p.w, 0);
    const gap = picked.length > 1 ? Math.min(14, Math.floor((avail - widths) / (picked.length - 1))) : 0;
    let x = band.x + Math.floor((band.w - (widths + gap * (picked.length - 1))) / 2);
    picked.forEach((p, i) => {
      const y =
        p.kind === 'shelf' ? top + free - 2 : p.kind === 'picture' || p.kind === 'clock' ? top + Math.floor((free - p.h) / 2) : top;
      out.push({ kind: p.kind, x, y, w: p.w, h: p.h, ceil: band.y, seed: level * 16 + i });
      x += p.w + gap;
    });
  });
  return out;
}

// Puts a glyph only when it lands inside the scene rect.
function putIn(s: Screen, r: Rect, x: number, y: number, ch: string, fg?: RGB, bg?: RGB): void {
  if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) s.put(x, y, ch, fg, bg);
}

function paneSky(row: number, rows: number): RGB {
  return mix(SKY_TOP, SKY_BOT, rows > 1 ? row / (rows - 1) : 0.5);
}

function drawWindow(s: Screen, r: Rect, d: Decor, t: number): void {
  const paneRows = d.h - 2;
  const mid = Math.floor(d.w / 2);
  for (let x = 0; x < d.w; x++) {
    const top = x === 0 ? '┌' : x === d.w - 1 ? '┐' : x === mid ? '┬' : '─';
    putIn(s, r, d.x + x, d.y, top, WALNUT);
  }
  for (let row = 0; row < paneRows; row++) {
    const y = d.y + 1 + row;
    const sky = paneSky(row, paneRows);
    for (let x = 0; x < d.w; x++) {
      if (x === 0 || x === d.w - 1 || x === mid) {
        putIn(s, r, d.x + x, y, '│', WALNUT, sky);
        continue;
      }
      // Rooftops on the bottom pane row once there is room.
      if (paneRows >= 2 && row === paneRows - 1) {
        const roof = '▁▂▃▅▂▄▆▃'[Math.floor(noise(d.x + x, 17) * 8)];
        const lit = noise(d.x + x, 18) > 0.8 && roof !== '▁' && roof !== '▂';
        putIn(s, r, d.x + x, y, roof, lit ? mix(CITY, WARM, 0.35) : CITY, sky);
        continue;
      }
      // Rain streaks falling outside.
      const speed = 7 + noise(x, d.seed + 22) * 5;
      const pos = Math.floor(t * speed + noise(x, d.seed + 21) * 40) % (paneRows + 3);
      const streak = pos === row || (pos - 1 === row && noise(x, 23) > 0.5);
      putIn(s, r, d.x + x, y, streak ? '╎' : ' ', mix(RAIN, sky, pos === row ? 0 : 0.45), sky);
    }
  }
  // Sill, a little wider than the frame.
  for (let x = -1; x <= d.w; x++) putIn(s, r, d.x + x, d.y + d.h - 1, '▀', OAK);
}

function drawMenu(s: Screen, r: Rect, d: Decor, t: number): void {
  const board = hex('#2f3b34');
  const chalk = hex('#ecebe4');
  const pink = hex('#f2b5b5');
  const yellow = hex('#f3d98b');
  const inner = d.h - 2;
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const edge = y === 0 || y === d.h - 1 || x === 0 || x === d.w - 1;
      const ch = !edge ? ' ' : y === 0 ? (x === 0 ? '╔' : x === d.w - 1 ? '╗' : '═') : y === d.h - 1 ? (x === 0 ? '╚' : x === d.w - 1 ? '╝' : '═') : '║';
      putIn(s, r, d.x + x, d.y + y, ch, OAK, edge ? undefined : board);
    }
  }
  const lines = inner >= 3 ? ['~ MENU ~', ...MENU] : MENU;
  const special = Math.floor(t / 4) % MENU.length;
  for (let i = 0; i < Math.min(inner, lines.length); i++) {
    const line = lines[i];
    const y = d.y + 1 + i;
    if (inner >= 3 && i === 0) {
      textIn(s, r, d.x + 3, y, line, pink, board);
      continue;
    }
    const item = line.slice(0, -1);
    textIn(s, r, d.x + 2, y, item, chalk, board);
    textIn(s, r, d.x + 2 + item.length, y, line.slice(-1), yellow, board);
    if (MENU.indexOf(line) === special) putIn(s, r, d.x + 1, y, '♥', mix(pink, board, 0.5 - 0.5 * Math.sin(t * 3)), board);
  }
}

function drawPlant(s: Screen, r: Rect, d: Decor, t: number): void {
  const rope = hex('#b89a74');
  const cx = d.x + 3;
  const hanger = d.h >= 5;
  let y = d.y;
  // Rope runs up through the string lights to the ceiling.
  for (let ry = d.ceil + 1; ry < y + (hanger ? 1 : 0); ry++) putIn(s, r, cx, ry, '│', rope);
  if (hanger) {
    putIn(s, r, cx - 1, y, '╱', rope);
    putIn(s, r, cx + 1, y, '╲', rope);
    y++;
  }
  // Foliage rustles between two poses.
  const leaves = Math.sin(t * 0.9 + d.seed) > 0 ? '▗▞▟▙▚▙▖' : '▖▚▟▙▞▟▗';
  [...leaves].forEach((ch, i) => putIn(s, r, d.x + i, y, ch, i % 2 ? LEAF : LEAF2));
  y++;
  putIn(s, r, cx - 1, y, '▜', TERRA);
  putIn(s, r, cx, y, '█', TERRA);
  putIn(s, r, cx + 1, y, '▛', TERRA);
  y++;
  // Trailing vines below the pot, swinging more toward the tips.
  const vines: Array<[number, number]> = [[cx - 2, d.h], [cx + 2, d.h], [cx + 1, 1]];
  for (let k = 0; y + k < d.y + d.h; k++) {
    vines.forEach(([vx, len], i) => {
      if (k >= len) return;
      const off = Math.round(Math.sin(t * 0.8 + i * 1.7 + d.seed) * 0.45 * (k + 1));
      putIn(s, r, vx + off, y + k, (k + i) % 2 ? '▘' : '▝', k % 2 ? LEAF2 : LEAF);
    });
  }
}

function drawPicture(s: Screen, r: Rect, d: Decor, t: number): void {
  const frame = hex('#b9875a');
  const canvas = hex('#f3ead8');
  for (let y = 0; y < d.h; y++) {
    for (let x = 0; x < d.w; x++) {
      const edge = y === 0 || y === d.h - 1 || x === 0 || x === d.w - 1;
      const ch = !edge ? ' ' : y === 0 ? (x === 0 ? '┌' : x === d.w - 1 ? '┐' : '─') : y === d.h - 1 ? (x === 0 ? '└' : x === d.w - 1 ? '┘' : '─') : '│';
      putIn(s, r, d.x + x, d.y + y, ch, frame, edge ? undefined : canvas);
    }
  }
  const variant = d.seed % 3;
  const rows = d.h - 2;
  const at = (x: number, y: number, ch: string, fg: RGB) => putIn(s, r, d.x + 1 + x, d.y + 1 + y, ch, fg, canvas);
  if (variant === 0) {
    // Hills under a sun.
    at(3, 0, '●', MUSTARD);
    const hills = '▂▄▆▄▂';
    for (let x = 0; x < 5; x++) at(x, rows - 1, hills[x], x % 2 ? LEAF : SAGE);
  } else if (variant === 1) {
    // Latte art.
    at(1, rows - 1, '▐', CREAM);
    at(2, rows - 1, '♥', mix(TERRA, CREAM, 0.15 + 0.15 * Math.sin(t)));
    at(3, rows - 1, '▌', CREAM);
    at(2, 0, rows > 1 ? '~' : ' ', P.dim);
  } else {
    // A cat portrait.
    at(1, rows - 1, '▙', hex('#3b3330'));
    at(2, rows - 1, '▄', hex('#3b3330'));
    at(3, rows - 1, '▟', hex('#3b3330'));
    if (rows > 1) at(2, 0, '♥', TERRA);
  }
}

// Box-drawing glyph for a clock centre with hands pointing in two of the
// four directions (0 up, 1 right, 2 down, 3 left).
const HANDS: Record<string, string> = {
  '0': '╹', '1': '╺', '2': '╻', '3': '╸',
  '01': '└', '02': '│', '03': '┘', '12': '┌', '13': '─', '23': '┐',
};

function drawClock(s: Screen, r: Rect, d: Decor, t: number): void {
  const rim = hex('#6b4329');
  const face = CREAM;
  const minute = Math.floor(t / 15) % 4;
  const hour = Math.floor(t / 60) % 4;
  const k = [minute, hour].sort().filter((v, i, a) => a.indexOf(v) === i).join('');
  textIn(s, r, d.x, d.y, '╭───╮', rim);
  textIn(s, r, d.x, d.y + 1, '│', rim);
  const tick = Math.floor(t) % 2 === 0;
  textIn(s, r, d.x + 1, d.y + 1, '·', tick ? TERRA : P.dim, face);
  textIn(s, r, d.x + 2, d.y + 1, HANDS[k], hex('#3b2a1e'), face);
  textIn(s, r, d.x + 3, d.y + 1, '·', tick ? P.dim : TERRA, face);
  textIn(s, r, d.x + 4, d.y + 1, '│', rim);
  textIn(s, r, d.x, d.y + 2, '╰───╯', rim);
}

// Shelf items: [offset, glyph, color]; mugs (steam sources) are listed first.
const SHELF_ITEMS: Array<[number, string, RGB]> = [
  [1, '▆', TERRA],
  [4, '▆', CREAM],
  [6, '▐', hex('#6b3e26')],
  [7, '▌', hex('#6b3e26')],
  [9, '▟', LEAF],
];

function drawShelf(s: Screen, r: Rect, d: Decor): void {
  for (const [ox, ch, fg] of SHELF_ITEMS) putIn(s, r, d.x + ox, d.y, ch, fg);
  for (let x = 0; x < d.w; x++) putIn(s, r, d.x + x, d.y + 1, '▀', WALNUT);
  putIn(s, r, d.x + 1, d.y + 1, '▛', WALNUT);
  putIn(s, r, d.x + d.w - 2, d.y + 1, '▜', WALNUT);
}

// ── string lights ────────────────────────────────────────────────────────
const SWAG = 12;
const BULBS: RGB[] = ['#ffb33b', '#ff8a5c', '#ffd25e', '#f7776a'].map(hex);
const BULB_OFF = hex('#8a6a4a');

// Occasional brown-out flicker shared by bulbs and their glow.
function flicker(t: number): number {
  const cycle = Math.floor(t / 7);
  return noise(cycle, 41) > 0.62 && t - cycle * 7 < 0.3 ? 0.4 : 1;
}

function bulbLevel(i: number, t: number): number {
  const blink = noise(Math.floor(t * 2) * 131 + i, 7) > 0.93 ? 0.45 : 1;
  return flicker(t) * blink * (0.72 + 0.28 * Math.sin(t * (0.9 + noise(i, 5) * 1.4) + noise(i, 6) * 6.283));
}

const isBulb = (p: number) => p === 2 || p === 5 || p === 8;

function drawLights(s: Screen, r: Rect, y: number, t: number): void {
  if (y < r.y || y >= r.y + r.h) return;
  const wire = hex('#4a3a2e');
  for (let x = r.x; x < r.x + r.w; x++) {
    const p = (x - r.x) % SWAG;
    if (isBulb(p)) {
      const i = Math.floor((x - r.x) / SWAG) * 3 + (p - 2) / 3;
      s.put(x, y, '●', mix(BULB_OFF, cyc(BULBS, i), bulbLevel(i, t)));
    } else s.put(x, y, p === 0 ? '╲' : p === SWAG - 1 ? '╱' : '▁', wire);
  }
}

function drawBackdrop(s: Screen, r: Rect, t: number, floors: number[]): void {
  // Warm plaster with soft blotches.
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const n = noise(Math.floor((x - r.x) / 5) * 31 + Math.floor((y - r.y) / 2) * 977, 3);
      s.put(x, y, ' ', P.text, mix(P.wall, P.wall2, 0.15 + n * 0.6));
    }
  }
  wallBands(r, floors).forEach((band, level) => {
    if (band.h <= 0) return;
    const fy = band.y + band.h;
    // Sage beadboard wainscoting with a walnut chair rail.
    const rail = fy - 4;
    for (let y = Math.max(rail + 1, band.y + 2); y < fy; y++) {
      if (y < r.y || y >= r.y + r.h) continue;
      for (let x = r.x; x < r.x + r.w; x++) s.put(x, y, ' ', P.text, Math.floor((x - r.x) / 3) % 2 ? SAGE : SAGE2);
    }
    if (rail > band.y + 1 && rail >= r.y && rail < r.y + r.h) {
      for (let x = r.x; x < r.x + r.w; x++) s.put(x, rail, '▄', WALNUT);
    }
    // Ceiling beam on the top level; upper floors get their underside later.
    if (level === 0) for (let x = r.x; x < r.x + r.w; x++) s.put(x, band.y, ' ', P.text, WALNUT_D);
    if (band.h >= 3) drawLights(s, r, band.y + 1, t);
  });
  for (const d of layout(r, floors)) {
    if (d.kind === 'window') drawWindow(s, r, d, t);
    else if (d.kind === 'menu') drawMenu(s, r, d, t);
    else if (d.kind === 'plant') drawPlant(s, r, d, t);
    else if (d.kind === 'picture') drawPicture(s, r, d, t);
    else if (d.kind === 'clock') drawClock(s, r, d, t);
    else drawShelf(s, r, d);
  }
  // Oak planks with staggered seams.
  drawFloors(s, r, floors, (x, row, level) => {
    const off = row ? 7 : 0;
    const plank = Math.floor((x + off) / 14);
    const tone = noise(plank, row + level * 5 + 50);
    const bg = mix(P.floor, P.floor2, tone * 0.85);
    return { ch: (x + off) % 14 === 0 ? '▏' : ' ', fg: WALNUT_D, bg };
  });
  // Underside of upper floors.
  for (const fy of floors.slice(0, -1)) {
    const y = fy + 2;
    if (y < r.y || y >= r.y + r.h) continue;
    for (let x = r.x; x < r.x + r.w; x++) s.put(x, y, '▀', WALNUT_D);
  }
}

const isFree = (s: Screen, x: number, y: number) => s.charAt(x, y) === ' ';

function drawAmbient(s: Screen, r: Rect, t: number, floors: number[]): void {
  const inside = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  // Warm pools of light around the string-light bulbs.
  wallBands(r, floors).forEach((band) => {
    if (band.h < 3) return;
    const y = band.y + 1;
    for (let x = r.x; x < r.x + r.w; x++) {
      const p = (x - r.x) % SWAG;
      if (!isBulb(p)) continue;
      const i = Math.floor((x - r.x) / SWAG) * 3 + (p - 2) / 3;
      const g = bulbLevel(i, t);
      for (let dy = -1; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (!inside(xx, yy) || (dx === 0 && dy === 0)) continue;
          const fall = 1 / (1 + Math.abs(dx) + Math.abs(dy) * 1.5);
          s.blendBg(xx, yy, WARM, 0.3 * g * fall);
        }
      }
    }
  });
  for (const d of layout(r, floors)) {
    if (d.kind === 'window') {
      // Raindrops sliding down the glass.
      const paneRows = d.h - (d.h >= 4 ? 3 : 2);
      const drops = 2;
      for (let k = 0; k < drops; k++) {
        const period = 2.5 + noise(k, d.seed + 60) * 2;
        const tt = t + noise(k, d.seed + 61) * 9;
        const cycle = Math.floor(tt / period);
        const p = (tt - cycle * period) / period;
        let col = 1 + Math.floor(noise(cycle, d.seed * 7 + k) * (d.w - 2));
        if (col === Math.floor(d.w / 2)) col++;
        const x = d.x + col;
        const y = d.y + 1 + Math.min(paneRows - 1, Math.floor(p * paneRows));
        if (inside(x, y) && isFree(s, x, y)) {
          s.put(x, y, p < 0.85 ? '•' : '·', hex('#f6fbff'));
          s.blendBg(x, y, hex('#ffffff'), 0.15);
        }
      }
    } else if (d.kind === 'shelf') {
      // Steam curling up from the mugs.
      for (let m = 0; m < 2; m++) {
        for (let k = 0; k < 2; k++) {
          const p = (t * 0.45 + k * 0.5 + noise(m, d.seed + 70)) % 1;
          const x = d.x + SHELF_ITEMS[m][0] + Math.round(Math.sin(t * 1.7 + p * 6 + m) * 0.6);
          const y = d.y - 1 - Math.floor(p * 3);
          if (!inside(x, y) || !isFree(s, x, y)) continue;
          const ch = p < 0.33 ? (Math.floor(t * 3 + m) % 2 ? '(' : ')') : p < 0.66 ? '~' : '·';
          s.put(x, y, ch, mix(hex('#ffffff'), s.bgAt(x, y), 0.25 + p * 0.55));
        }
      }
    }
  }
  // Dust motes drifting through the lamplight.
  const motes = Math.max(3, Math.floor(r.w / 16));
  for (let i = 0; i < motes; i++) {
    const x = r.x + Math.floor((noise(i, 81) * r.w + t * (0.3 + noise(i, 82) * 0.5)) % r.w);
    const span = Math.max(1, r.h - 3);
    const y = r.y + 2 + Math.floor((noise(i, 83) * span + Math.sin(t * 0.5 + i) * 1.5 + span) % span);
    if (inside(x, y) && isFree(s, x, y)) s.put(x, y, '·', mix(hex('#fff3d6'), s.bgAt(x, y), 0.35));
  }
}

export const cafe: Theme = {
  id: 'cafe',
  name: 'Cozy Café',
  tagline: 'rainy windows, warm lattes and lo-fi beats on loop',
  palette: P,
  stations: [write, read, search, run, web, think, idle],
  entrance,
  drawBackdrop,
  drawAmbient,
};

export default cafe;
