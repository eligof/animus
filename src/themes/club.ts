import { hex, hsl, mix, scale } from '../term/color.ts';
import type { RGB } from '../term/color.ts';
import { BOLD } from '../term/screen.ts';
import type { Rect, Screen } from '../term/screen.ts';
import type { Art, Palette, StationDef, Theme } from './types.ts';
import { art, drawFloors, noise, textIn, wallBands } from './art.ts';

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

const PINK = hex('#ff3cac');
const CYAN = hex('#21e6ff');
const LIME = hex('#b6ff3b');
const AMBER = hex('#ffb547');
const VIOLET = hex('#a45bff');
const NEON: RGB[] = [PINK, CYAN, LIME, VIOLET, AMBER];
const STEEL = hex('#4a4258');
const MORTAR = hex('#140a1c');
const CEILING = hex('#0d0812');
const CATWALK = hex('#2e2540');
const CATWALK2 = hex('#221b2e');
const RIVET = hex('#5a5070');
const WHITE = hex('#ffffff');

// ── the beat: 128 BPM, everything pulses on it ──────────────────────────
const BEAT = 60 / 128;
const SIXTEENTHS = 4 / BEAT; // station fps locked to the 16th-note grid
const EIGHTHS = 2 / BEAT;
const beatNo = (t: number) => Math.floor(t / BEAT);
const beatPhase = (t: number) => t / BEAT - Math.floor(t / BEAT);
const kick = (t: number) => (1 - beatPhase(t)) ** 3; // 1 on the downbeat, decays

const keys = (line: string, k: string) => [...line].map((c) => (c === ' ' ? ' ' : k)).join('');

// ── write: DJ decks ──────────────────────────────────────────────────────
const DJ = {
  f: hex('#8a80a0'), u: hex('#211a2b'), v: hex('#08060b'), e: hex('#5a5169'),
  l: PINK, m: CYAN, k: LIME, a: AMBER, p: PINK, o: hex('#3a2c48'),
  t: hex('#5a4a70'), d: hex('#140e1b'),
};
const SPIN = ['◐', '◓', '◑', '◒'];

function decks(a: number, b: number, vu: number, knob: string): Art {
  const L = SPIN[((a % 4) + 4) % 4];
  const R = SPIN[((b % 4) + 4) % 4];
  const led = (i: number) => (i < vu ? 'kap'[i] : 'o');
  return art(
    ['╭───┬─┬───╮', `│(${L})│▪│(${R})│`, '╰───┴─┴───╯', '▀▀▀▀▀▀▀▀▀▀▀', '▬▬▬ D J ▬▬▬'],
    ['fffffffffff', `felef${knob}femef`, 'fffffffffff', 'ttttttttttt', `${led(2)}${led(1)}${led(0)} p p ${led(0)}${led(1)}${led(2)}`],
    ['uuuuuuuuuuu', 'uvvvuuuvvvu', 'uuuuuuuuuuu', 'ddddddddddd', 'ddddddddddd'],
  );
}

const VU_RUN = [3, 2, 1, 1, 3, 2, 2, 1, 3, 1, 2, 1, 3, 3, 2, 1];
const SCRATCH = [8, 9, 10, 11];

const write: StationDef = {
  kind: 'write',
  name: 'DJ decks',
  fps: SIXTEENTHS,
  colors: DJ,
  frames: Array.from({ length: 16 }, (_, f) => decks(Math.floor(f / 4), Math.floor(f / 4) + 2, f % 4 === 0 ? 1 : 0, 'o')),
  active: Array.from({ length: 16 }, (_, f) =>
    decks(SCRATCH.includes(f) ? 8 - (f % 2) : f, f + 2, VU_RUN[f], 'kap'[Math.floor(f / 4) % 3]),
  ),
};

// ── read: VIP booth ──────────────────────────────────────────────────────
const VIP = {
  v: hex('#7d1650'), w: hex('#4c0c31'), h: hex('#a8326f'), g: hex('#ffcf6b'), G: hex('#9c7a3a'),
  m: hex('#ffd98a'), M: hex('#fff3d1'), d: hex('#a8844a'), n: hex('#6b3d0e'),
};

function vip(sign: string, glow: string, lines: string): Art {
  const g5 = glow.repeat(5);
  return art(
    [' ▗▄▄▄▄▄▄▄▖ ', ' ▐· VIP ·▌ ', '▄▐ · · · ▌▄', '█▀▀▗▄▄▄▖▀▀█', `▀▀▀▐${lines}▌▀▀▀`],
    [' vvvvvvvvv ', ` vw ${sign.repeat(3)} wv `, 'hv w w w vh', `hhh${g5}hhh`, `hww${glow}nnn${glow}wwh`],
    ['           ', '  vvvvvvv  ', '  vvvvvvv  ', ' wwwwwwwww ', `    ${glow.repeat(3)}    `],
  );
}

const read: StationDef = {
  kind: 'read',
  name: 'VIP booth',
  fps: 2,
  colors: VIP,
  frames: [vip('G', 'm', '≡≡≡'), vip('G', 'm', '≡≡≡'), vip('G', 'd', '≡≡≡'), vip('G', 'm', '≡≡≡')],
  active: [vip('g', 'M', '≡≡≡'), vip('g', 'M', '═─═'), vip('g', 'm', '─═─'), vip('g', 'M', '≡═≡')],
};

// ── search: vinyl crates ─────────────────────────────────────────────────
const CRATE: Record<string, RGB> = {
  c: hex('#1d5c66'), r: hex('#3a9aa6'), h: hex('#0b2328'), w: hex('#bff6ff'),
  1: PINK, 2: CYAN, 3: LIME, 4: AMBER, 5: VIOLET, 6: hex('#f0e6ff'), 7: hex('#ff5a5a'),
};
const SLEEVES = '▅▇▆█▅ ▆█▄▇▆';
const SLEEVE_KEYS = '12345 67123';
const DIG = [0, 1, 2, 3, 4, 6, 7, 8, 9, 10];

function crates(lift: number, glint: number): Art {
  const top = [...SLEEVES].map((c, x) => (x === lift ? '█' : c)).join('');
  const above = [...SLEEVES].map((_, x) => (x === lift ? '▄' : ' ')).join('');
  const aboveKeys = [...SLEEVE_KEYS].map((k, x) => (x === lift ? k : ' ')).join('');
  const rim = [...'rrrrr rrrrr'].map((k, x) => (x === glint ? 'w' : k)).join('');
  return art(
    [above, top, '▀▀▀▀▀ ▀▀▀▀▀', ' ▬▬▬   ▬▬▬ ', '           '],
    [aboveKeys, SLEEVE_KEYS, rim, ' hhh   hhh ', '           '],
    ['           ', '           ', 'ccccc ccccc', 'ccccc ccccc', 'ccccc ccccc'],
  );
}

const search: StationDef = {
  kind: 'search',
  name: 'vinyl crates',
  fps: 6,
  colors: CRATE,
  frames: [crates(-1, -1), crates(-1, -1), crates(-1, 1), crates(-1, 3), crates(-1, 7), crates(-1, 9), crates(-1, -1), crates(-1, -1)],
  active: [...DIG, ...DIG.slice(1, -1).reverse()].map((x, i) => crates(x, i % 3 === 0 ? x : -1)),
};

// ── run: light console ───────────────────────────────────────────────────
const DESK = {
  f: hex('#6a6080'), b: hex('#18121f'), t: CYAN, o: hex('#3a2c48'),
  p: PINK, c: CYAN, k: LIME, a: AMBER, r: hex('#4a4060'), n: hex('#e6def5'), l: hex('#2c2438'), x: hex('#5a5070'),
};

function lightDesk(cue: number, buttons: string, faders: number[]): Art {
  const c = String(cue).padStart(2, '0');
  const cell = (v: number, row: number) => (row === 0 ? (v >= 3 ? '▀' : v === 2 ? '▄' : '│') : v === 1 ? '▀' : v <= 0 ? '▄' : '│');
  const key = (v: number, row: number) => (row === 0 ? (v >= 2 ? 'n' : 'r') : v <= 1 ? 'n' : 'r');
  const strip = (row: number) => faders.map((v) => `${cell(v, row)} `).join('').slice(0, 9);
  const stripKeys = (row: number) => faders.map((v) => `${key(v, row)} `).join('').slice(0, 9);
  return art(
    [`┌─CUE:${c}──┐`, `│${[...buttons].map(() => '●').join('')}│`, `│${strip(0)}│`, `│${strip(1)}│`, '└─────────┘', ' ▐▀▀▀▀▀▀▀▌ '],
    ['ffttttttfff', `f${buttons}f`, `f${stripKeys(0)}f`, `f${stripKeys(1)}f`, 'fffffffffff', ' xxxxxxxxx '],
    ['           ', ' bbbbbbbbb ', ' bbbbbbbbb ', ' bbbbbbbbb ', '           ', '  lllllll  '],
  );
}

const BTN = 'pckapckap';
const btnRow = (lit: (i: number) => boolean) => [...BTN].map((k, i) => (lit(i) ? k : 'o')).join('');

const run: StationDef = {
  kind: 'run',
  name: 'light console',
  fps: EIGHTHS,
  colors: DESK,
  frames: Array.from({ length: 8 }, (_, f) =>
    lightDesk(7, btnRow((i) => (i === 2 && f < 4) || (i === 6 && f >= 4)), [2, 1, 3, 0, 2]),
  ),
  active: Array.from({ length: 16 }, (_, f) =>
    lightDesk(
      8 + Math.floor(f / 4),
      btnRow((i) => (i + f) % 3 === 0 || noise(f * 9 + i, 4) > 0.75),
      Array.from({ length: 5 }, (_, i) => Math.round(1.5 + 1.5 * Math.sin((f + i * 2) * 0.8))),
    ),
  ),
};

// ── web: neon phone booth ────────────────────────────────────────────────
const PHONE = {
  f: PINK, F: hex('#7a2456'), s: hex('#0d1a24'), t: CYAN, T: hex('#2a6f80'), g: hex('#122030'),
  h: hex('#d8d0e8'), k: hex('#5e5670'), w: CYAN, W: hex('#1f7a8c'), r: hex('#2a1f36'), y: AMBER,
};

function booth(frame: string, sign: string, signKey: string, ring: number, jiggle: boolean): Art {
  const L1 = ring >= 2 ? '( ' : ring === 1 ? ' (' : '  ';
  const R1 = ring >= 2 ? ' )' : ring === 1 ? ') ' : '  ';
  const L2 = ring >= 1 ? ' (' : '  ';
  const R2 = ring >= 1 ? ') ' : '  ';
  const f = frame;
  const phone = jiggle ? ['╓ ▄▄ ', '║ ▦▦ ', '╙─┘  '] : [' ╓▄▄ ', ' ║▦▦ ', ' ╙┘  '];
  const phoneFg = jiggle ? ['h kk ', 'h hh ', 'hhh  '] : [' hkk ', ' hhh ', ' hh  '];
  return art(
    ['   ▄▄▄▄▄   ', `  ▐${sign}▌  `, `${L1}▐${phone[0]}▌${R1}`, `${L2}▐${phone[1]}▌${R2}`, `  ▐${phone[2]}▌  `, '  ▀▀▀▀▀▀▀  '],
    [
      `   ${f}${f}${f}${f}${f}   `,
      `  ${f}${keys(sign, signKey)}${f}  `,
      `${keys(L1, 'w')}${f}${phoneFg[0]}${f}${keys(R1, 'w')}`,
      `${keys(L2, 'W')}${f}${phoneFg[1]}${f}${keys(R2, 'W')}`,
      `  ${f}${phoneFg[2]}${f}  `,
      '  rrrrrrr  ',
    ],
    ['           ', '   sssss   ', '   ggggg   ', '   ggkkg   ', '   ggggg   ', '           '],
  );
}

const web: StationDef = {
  kind: 'web',
  name: 'phone booth',
  fps: EIGHTHS,
  colors: PHONE,
  frames: [booth('f', 'PHONE', 't', 0, false), booth('f', 'PHONE', 't', 0, false), booth('f', 'PHONE', 't', 0, false), booth('F', 'PHONE', 'T', 0, false), booth('f', 'PHONE', 't', 0, false), booth('f', 'PHONE', 't', 0, false), booth('f', 'PHONE', 't', 0, false), booth('f', 'PHONE', 't', 0, false)],
  active: [booth('f', 'RING!', 'y', 1, true), booth('f', 'RING!', 'y', 2, false), booth('F', 'PHONE', 't', 1, true), booth('f', 'PHONE', 't', 2, false)],
};

// ── think: spotlit podium ────────────────────────────────────────────────
const SPOT = {
  c: hex('#33264a'), C: hex('#56456e'), e: hex('#6e5d88'), E: hex('#fff1c9'), d: hex('#b0a2c8'),
  w: hex('#5a3a2a'), W: hex('#8a5a3a'), g: hex('#ffcf6b'), G: hex('#9c7a3a'), m: hex('#9a92aa'), M: hex('#e8e0f5'),
  s: hex('#2a2236'), q: AMBER,
};

// Free cone cells where dust motes can drift through the light.
const MOTES: Array<[number, number]> = [[1, 4], [3, 8], [4, 2], [1, 6], [4, 9], [3, 2], [4, 1], [4, 8]];

function podium(lit: boolean, mark: string, mote: number): Art {
  const e = lit ? 'E' : 'e';
  const c = lit ? 'C' : 'c';
  const m = lit ? 'M' : 'm';
  const rows = [`    ╱${mark}╲    `, '   ╱ ● ╲   ', '  ╱▄▄╿▄▄╲  ', ' ╱ ▐███▌ ╲ ', '╱  ▐█◆█▌  ╲', '▀▀▀▀▀▀▀▀▀▀▀'];
  const fg = [`    ${e}${mark === ' ' ? ' ' : 'q'}${e}    `, `   ${e} ${m} ${e}   `, `  ${e}WW${m}WW${e}  `, ` ${e} wwwww ${e} `, `${e}  ww${lit ? 'g' : 'G'}ww  ${e}`, keys('▀▀▀▀▀▀▀▀▀▀▀', lit ? 'C' : 's')];
  if (mote >= 0) {
    const [my, mx] = MOTES[mote % MOTES.length];
    const swap = (str: string, ch: string) => [...str].map((v, i) => (i === mx ? ch : v)).join('');
    rows[my] = swap(rows[my], '·');
    fg[my] = swap(fg[my], lit ? 'E' : 'd');
  }
  return art(rows, fg, [
    `     ${c}     `,
    `    ${c}${c}${c}    `,
    `   ${c}${c}${c}${c}${c}   `,
    `  ${c}${c}${c}${c}${c}${c}${c}  `,
    ` ${c}${c}${c}${c}w${c}${c}${c}${c} `,
    '           ',
  ]);
}

const think: StationDef = {
  kind: 'think',
  name: 'spotlit podium',
  fps: 3,
  colors: SPOT,
  frames: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => podium(false, ' ', i)),
  active: [' ', '·', '?', '?', '!', ' '].map((mk, i) => podium(true, mk, i * 3)),
};

// ── idle: bar counter ────────────────────────────────────────────────────
const BAR = {
  T: hex('#c98a4a'), t: hex('#6b3f22'), w: hex('#3a2216'), W: hex('#2a180f'), a: AMBER,
  b: hex('#3ddc97'), c: AMBER, d: PINK, e: CYAN, s: hex('#c9c3d6'), S: WHITE, g: hex('#cfe8ff'), l: PINK,
};

function bar(up: boolean, glint: number, drops: boolean): Art {
  const g = (i: number, k: string) => (glint === i ? 'S' : k);
  return art(
    [`▗▖ ╻    ${up ? '▄' : ' '}  `, `██ █▄ ▼ ${up ? '█' : '▄'}${drops ? '·' : ' '} `, `██ ██ ┴ ${up ? (drops ? '·' : ' ') : '█'} ▄`, '▀▀▀▀▀▀▀▀▀▀▀', '▔▔▔▔▔▔▔▔▔▔▔', '▐▒▌▐▒▌▐▒▌▐▒'],
    ['bb e    S  ', `${g(0, 'b')}b ${g(1, 'e')}d l ${up ? 's' : 'S'}g `, `bb ${g(2, 'e')}d g ${up ? 'g' : 's'} c`, 'TTTTTTTTTTT', 'aaaaaaaaaaa', 'WWWWWWWWWWW'],
    ['           ', '           ', '           ', 'ttttttttttt', 'wwwwwwwwwww', 'wwwwwwwwwww'],
  );
}

const idle: StationDef = {
  kind: 'idle',
  name: 'bar counter',
  fps: EIGHTHS,
  colors: BAR,
  frames: [bar(false, -1, false), bar(false, -1, false), bar(false, 0, false), bar(false, -1, false), bar(false, -1, false), bar(false, 1, false), bar(false, -1, false), bar(false, 2, false)],
  active: [bar(true, -1, false), bar(false, -1, false), bar(true, -1, true), bar(false, 1, false)],
};

// ── entrance: club door + velvet rope ────────────────────────────────────
const DOOR = {
  n: PINK, N: hex('#5a1a3e'), k: hex('#120a18'), f: hex('#4a3d5c'), d: hex('#3a0f24'), D: hex('#8a3a5a'),
  h: hex('#ffcf6b'), i: hex('#d0469e'), j: hex('#7040d8'), l: hex('#2aa8c8'), p: hex('#ffcf6b'), P: hex('#8a6a2a'), r: hex('#c0164a'),
};

function door(sign: string, open: [string, string, string] | null, note = ' '): Art {
  const [a, b, c] = open ?? ['d', 'd', 'd'];
  const panel = open ? `▌ ${note} ` : '·  ·';
  const panel2 = open ? '▌   ' : '  ▪ ';
  const pk = open ? `d ${a === 'l' ? 'k' : 'l'} ` : 'D  D';
  const pk2 = open ? 'd   ' : '  h ';
  const rope = open ? '┃ ╲      ┃' : '┃ ╲▁▁▁▁╱ ┃';
  const ropeTop = open ? '●╲█    █ ●' : '●╲█·  ·█╱●';
  return art(
    ['  ▐CLUB▌  ', '  █▀▀▀▀█  ', `  █${panel}█  `, `  █${panel2}█  `, ropeTop, rope],
    [
      `  ${sign.repeat(6)}  `,
      '  ffffff  ',
      `  f${pk}f  `,
      `  f${pk2}f  `,
      open ? 'prf    f p' : 'prfD  Dfrp',
      open ? 'P r      P' : 'P rrrrrr P',
    ],
    ['   kkkk   ', `   ${a.repeat(4)}   `, `   ${a.repeat(4)}   `, `   ${b.repeat(4)}   `, `   ${b.repeat(4)}   `, `   ${c.repeat(4)}   `],
  );
}

const entrance: StationDef = {
  kind: 'entrance',
  name: 'club door',
  fps: EIGHTHS,
  colors: DOOR,
  frames: [door('n', null), door('n', null), door('n', null), door('n', null), door('n', null), door('N', null), door('n', null), door('n', null)],
  active: [door('n', ['i', 'j', 'j'], '♪'), door('n', ['j', 'i', 'j']), door('n', ['l', 'j', 'i'], '♫'), door('n', ['j', 'l', 'j'])],
};

// ── backdrop decor ───────────────────────────────────────────────────────
type Kind = 'sign' | 'ball' | 'speaker' | 'eq' | 'clock' | 'poster' | 'neon';
type Decor = { kind: Kind; x: number; y: number; w: number; h: number; top: number };
type Item = { kind: Kind; prio: number };

// Left-to-right order per wall band; lower prio survives narrow scenes.
const BANDS: Item[][] = [
  [{ kind: 'speaker', prio: 2 }, { kind: 'eq', prio: 3 }, { kind: 'sign', prio: 0 }, { kind: 'ball', prio: 1 }, { kind: 'clock', prio: 4 }, { kind: 'speaker', prio: 2 }],
  [{ kind: 'speaker', prio: 2 }, { kind: 'poster', prio: 1 }, { kind: 'neon', prio: 0 }, { kind: 'eq', prio: 3 }, { kind: 'speaker', prio: 2 }],
];

function size(kind: Kind, free: number): [number, number] {
  switch (kind) {
    case 'sign': return [21, free >= 4 ? 4 : 3];
    case 'ball': return [7, 4];
    case 'speaker': return [7, free >= 11 ? 10 : 5];
    case 'eq': return [13, Math.min(5, free)];
    case 'clock': return [9, 3];
    case 'poster': return [11, 5];
    case 'neon': return [13, 1];
  }
}

const MIN_H: Record<Kind, number> = { sign: 3, ball: 4, speaker: 5, eq: 3, clock: 3, poster: 5, neon: 1 };

// Places wall decor in the free space above each level's stations. Shared by
// backdrop and ambient so notes rise from the speakers that were drawn.
function layout(r: Rect, floors: number[]): Decor[] {
  const out: Decor[] = [];
  wallBands(r, floors).forEach((band, level) => {
    const top = band.y + 1;
    const free = band.y + band.h - 7 - top;
    if (free < 1) return;
    const items = BANDS[Math.min(level, BANDS.length - 1)].filter((it) => MIN_H[it.kind] <= free);
    const avail = r.w - 2;
    const width = (list: Item[]) => list.reduce((n, it) => n + size(it.kind, free)[0], 0) + 2 * (list.length + 1);
    while (items.length && width(items) > avail) {
      let worst = 0;
      items.forEach((it, i) => { if (it.prio >= items[worst].prio) worst = i; });
      items.splice(worst, 1);
    }
    if (!items.length) return;
    const used = items.reduce((n, it) => n + size(it.kind, free)[0], 0);
    const gap = (avail - used) / (items.length + 1);
    let x = r.x + 1 + gap;
    for (const it of items) {
      const [w, h] = size(it.kind, free);
      const y = it.kind === 'ball' ? top : top + Math.floor((free - h) / 3);
      out.push({ kind: it.kind, x: Math.round(x), y, w, h, top: band.y });
      x += w + gap;
    }
  });
  return out;
}

const inRect = (r: Rect, x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;

function put(s: Screen, r: Rect, x: number, y: number, ch: string, fg?: RGB, bg?: RGB): void {
  if (inRect(r, x, y)) s.put(x, y, ch, fg, bg);
}

function glow(s: Screen, r: Rect, x0: number, y0: number, w: number, h: number, c: RGB, a: number): void {
  for (let y = y0 - 1; y <= y0 + h; y++) {
    for (let x = x0 - 2; x < x0 + w + 2; x++) {
      if (!inRect(r, x, y)) continue;
      const edge = y < y0 || y >= y0 + h || x < x0 || x >= x0 + w;
      s.blendBg(x, y, c, edge ? a * 0.5 : a);
    }
  }
}

const BIG: Record<string, string[]> = {
  A: ['╔═╗', '╠═╣', '╩ ╩'],
  N: ['╔╗╔', '║║║', '╝╚╝'],
  I: ['╦', '║', '╩'],
  M: ['╔╦╗', '║║║', '╩ ╩'],
  U: ['╦ ╦', '║ ║', '╚═╝'],
  S: ['╔═╗', '╚═╗', '╚═╝'],
};

function drawSign(s: Screen, r: Rect, d: Decor, t: number): void {
  // One tired letter buzzes off now and then.
  const buzz = t % 9 < 0.9 && noise(Math.floor(t * 14), 43) > 0.5;
  const faulty = Math.floor(noise(Math.floor(t / 9), 41) * 6);
  const hum = 0.85 + 0.15 * Math.sin(t * 3.1);
  glow(s, r, d.x, d.y, d.w, 3, PINK, 0.16 * hum);
  let x = d.x;
  [...'ANIMUS'].forEach((ch, i) => {
    const g = BIG[ch];
    const on = !(buzz && i === faulty);
    const col = on ? mix(scale(PINK, hum), WHITE, 0.15) : scale(PINK, 0.3);
    for (let row = 0; row < 3; row++) {
      [...g[row]].forEach((c, j) => {
        if (c !== ' ' && inRect(r, x + j, d.y + row)) s.put(x + j, d.y + row, c, col, undefined, on ? BOLD : 0);
      });
    }
    x += g[0].length + 1;
  });
  if (d.h >= 4) {
    const sub = '· AFTER HOURS ·';
    const sx = d.x + Math.floor((d.w - sub.length) / 2);
    glow(s, r, sx, d.y + 3, sub.length, 1, CYAN, 0.08);
    textIn(s, r, sx, d.y + 3, sub, mix(CYAN, P.wall, noise(Math.floor(t * 9), 47) > 0.96 ? 0.7 : 0.05));
  }
}

function drawNeon(s: Screen, r: Rect, d: Decor, t: number): void {
  const word = '♥ OPEN LATE ♥';
  const blink = t % 5 < 0.6 && noise(Math.floor(t * 12), 53) > 0.5;
  glow(s, r, d.x, d.y, d.w, 1, CYAN, 0.14);
  [...word].forEach((ch, i) => {
    const heart = ch === '♥';
    const col = heart ? (beatNo(t) % 2 ? PINK : scale(PINK, 0.55)) : blink && i > 6 ? scale(CYAN, 0.3) : CYAN;
    put(s, r, d.x + i, d.y, ch, col);
  });
}

const MIRROR_DARK = hex('#5a5468');
const MIRROR_LIGHT = hex('#e8e4f0');

function drawBall(s: Screen, r: Rect, d: Decor, t: number): void {
  const string = hex('#6a6080');
  const by = d.y + d.h - 3;
  for (let y = d.top + 1; y < by; y++) put(s, r, d.x + 3, y, '│', string);
  const rot = Math.floor(t * 4);
  // 7 x 6 half-rows of mirror tiles.
  const span = [[2, 4], [1, 5], [0, 6], [0, 6], [1, 5], [2, 4]];
  const tile = (cx: number, hr: number): RGB => {
    const id = (cx + rot) * 13 + hr * 7;
    const limb = cx === 0 || cx === 6 || hr === 0 || hr === 5 ? 0.6 : 1;
    if (noise(id + Math.floor(t * 6) * 31, 9) > 0.9) return NEON[(id + beatNo(t)) % NEON.length];
    return scale(mix(MIRROR_DARK, MIRROR_LIGHT, noise(id, 5)), limb);
  };
  for (let row = 0; row < 3; row++) {
    for (let cx = 0; cx < 7; cx++) {
      const hu = 2 * row;
      const hl = hu + 1;
      const up = cx >= span[hu][0] && cx <= span[hu][1];
      const lo = cx >= span[hl][0] && cx <= span[hl][1];
      if (up && lo) put(s, r, d.x + cx, by + row, '▀', tile(cx, hu), tile(cx, hl));
      else if (up) put(s, r, d.x + cx, by + row, '▀', tile(cx, hu));
      else if (lo) put(s, r, d.x + cx, by + row, '▄', tile(cx, hl));
    }
  }
  // Sparkles flash around the ball on the beat.
  const spots = [[-1, 0], [7, 2], [-2, 1], [8, 1], [-1, 2], [7, 0]];
  const [sx, sy] = spots[beatNo(t) % spots.length];
  const ph = beatPhase(t);
  if (ph < 0.6) put(s, r, d.x + sx, by + sy, ph < 0.2 ? '+' : ph < 0.4 ? '*' : '·', ph < 0.3 ? WHITE : hex('#c8c0e0'));
}

function drawSpeaker(s: Screen, r: Rect, d: Decor, t: number): void {
  const cab = hex('#0e0a13');
  const cone = hex('#1d1727');
  const rim = hex('#3a3348');
  const k = kick(t);
  const stacks = d.h >= 10 ? 2 : 1;
  for (let n = 0; n < stacks; n++) {
    const y0 = d.y + n * 5;
    for (let y = 0; y < 5; y++) for (let x = 0; x < d.w; x++) put(s, r, d.x + x, y0 + y, ' ', undefined, cab);
    const ring = mix(rim, n % 2 ? CYAN : PINK, k * 0.95);
    const inner = mix(cone, n % 2 ? CYAN : PINK, k * 0.25);
    put(s, r, d.x + 3, y0, '◉', mix(rim, hex('#c8c0e0'), beatPhase(t * 2) < 0.3 ? 0.7 : 0.3), cab);
    textIn(s, r, d.x + 1, y0 + 1, '▗▄▄▄▖', ring, cab);
    put(s, r, d.x + 1, y0 + 2, '▐', ring, cab);
    put(s, r, d.x + 2, y0 + 2, ' ', undefined, inner);
    put(s, r, d.x + 3, y0 + 2, k > 0.5 ? '◉' : '●', mix(rim, WHITE, 0.2 + k * 0.6), inner);
    put(s, r, d.x + 4, y0 + 2, ' ', undefined, inner);
    put(s, r, d.x + 5, y0 + 2, '▌', ring, cab);
    textIn(s, r, d.x + 1, y0 + 3, '▝▀▀▀▘', ring, cab);
    put(s, r, d.x + 1, y0 + 4, '▪', k > 0.3 ? LIME : hex('#2a3a1a'), cab);
    textIn(s, r, d.x + 3, y0 + 4, '▬▬▬', hex('#1c1624'), cab);
    if (k > 0.7) {
      put(s, r, d.x - 1, y0 + 2, '(', scale(ring, 0.7));
      put(s, r, d.x + d.w, y0 + 2, ')', scale(ring, 0.7));
    }
  }
}

const EQ_COLORS = [LIME, LIME, AMBER, PINK, PINK];

function drawEq(s: Screen, r: Rect, d: Decor, t: number): void {
  const face = hex('#0b0711');
  for (let y = 0; y < d.h; y++) for (let x = 0; x < d.w; x++) put(s, r, d.x + x, d.y + y, ' ', undefined, face);
  const step = t / (BEAT / 4);
  const n0 = Math.floor(step);
  const f = step - n0;
  const k = kick(t);
  const blocks = ' ▁▂▃▄▅▆▇█';
  for (let i = 0; i < 6; i++) {
    const rnd = noise(n0 * 7 + i, 61) * (1 - f) + noise((n0 + 1) * 7 + i, 61) * f;
    const bass = i < 2 ? 0.75 : i < 4 ? 0.35 : 0.15;
    const level = Math.min(1, 0.12 + bass * k + rnd * (0.55 - bass * 0.3)) * d.h;
    for (let y = 0; y < d.h; y++) {
      const fill = level - y;
      if (fill <= 0) continue;
      const ch = fill >= 1 ? '█' : blocks[Math.max(1, Math.round(fill * 8))];
      const col = EQ_COLORS[Math.min(EQ_COLORS.length - 1, Math.floor((y / d.h) * EQ_COLORS.length))];
      put(s, r, d.x + 1 + i * 2, d.y + d.h - 1 - y, ch, col, face);
    }
  }
}

function drawClock(s: Screen, r: Rect, d: Decor, t: number, nowMs?: number): void {
  const frame = hex('#5a4a78');
  const now = new Date(nowMs ?? Date.now());
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  textIn(s, r, d.x, d.y, '╭───────╮', frame);
  textIn(s, r, d.x, d.y + 1, '│       │', frame, hex('#0b0711'));
  textIn(s, r, d.x, d.y + 2, '╰───────╯', frame);
  textIn(s, r, d.x + 2, d.y + 1, `${hh}${beatPhase(t) < 0.5 ? ':' : ' '}${mm}`, AMBER, hex('#0b0711'));
}

function drawPoster(s: Screen, r: Rect, d: Decor, t: number): void {
  const paper = hex('#140a1c');
  const edge = hex('#6a2a58');
  textIn(s, r, d.x, d.y, '┌─────────┐', edge, paper);
  for (let y = 1; y < 4; y++) textIn(s, r, d.x, d.y + y, '│         │', edge, paper);
  textIn(s, r, d.x, d.y + 4, '└─────────┘', edge, paper);
  textIn(s, r, d.x + 1, d.y + 1, ' TONIGHT ', beatNo(t) % 4 === 0 ? WHITE : LIME, paper);
  textIn(s, r, d.x + 1, d.y + 2, 'DJ  OPUS ', PINK, paper);
  textIn(s, r, d.x + 1, d.y + 3, 'b2b HAIKU', CYAN, paper);
}

const FLOOR_A = hex('#1a0e26');
const FLOOR_B = hex('#130a1d');
const FLOOR_NEON: RGB[] = [PINK, CYAN, VIOLET, hex('#7dff5a')];
const BEAMS: RGB[] = [PINK, CYAN, VIOLET, hex('#5a8cff'), hex('#ff6ad5')];

// Ceiling lamps: one every 16 columns, hanging from each band's ceiling row.
const LAMP_SPACING = 16;

function lamps(r: Rect): number[] {
  const xs: number[] = [];
  for (let x = r.x + 6; x < r.x + r.w - 2; x += LAMP_SPACING) xs.push(x);
  return xs;
}

function lampState(k: number, level: number, t: number): { on: boolean; color: RGB; sway: number } {
  const bar = Math.floor(beatNo(t) / 4);
  const on = (k + level + bar) % 3 !== 0;
  const color = BEAMS[(k * 2 + level + bar) % BEAMS.length];
  const sway = 0.9 * Math.sin(t * (0.55 + noise(k, 17) * 0.4) + k * 1.9 + level);
  return { on, color, sway };
}

function brick(rx: number, ry: number): RGB {
  const bx = rx + (ry % 2) * 3;
  if (bx % 6 === 5) return MORTAR;
  const n = noise(Math.floor(bx / 6) * 131 + ry * 977, 11);
  return mix(P.wall2, P.wall, n);
}

function drawBackdrop(s: Screen, r: Rect, t: number, floors: number[], now?: number): void {
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) s.put(x, y, ' ', P.text, brick(x - r.x, y - r.y));
  }
  if (r.h <= 0) return;
  // Lighting truss along the ceiling.
  for (let x = r.x; x < r.x + r.w; x++) s.put(x, r.y, (x - r.x) % 2 ? '╱' : '╲', STEEL, CEILING);
  const lampXs = lamps(r);
  const lampRow = (y: number, level: number) => {
    lampXs.forEach((x, k) => {
      const st = lampState(k, level, t);
      put(s, r, x, y, '▼', st.on ? mix(st.color, WHITE, 0.2 * kick(t)) : scale(st.color, 0.3));
    });
  };
  lampRow(r.y, 0);
  for (const d of layout(r, floors)) {
    if (d.kind === 'sign') drawSign(s, r, d, t);
    else if (d.kind === 'ball') drawBall(s, r, d, t);
    else if (d.kind === 'speaker') drawSpeaker(s, r, d, t);
    else if (d.kind === 'eq') drawEq(s, r, d, t);
    else if (d.kind === 'clock') drawClock(s, r, d, t, now);
    else if (d.kind === 'poster') drawPoster(s, r, d, t);
    else drawNeon(s, r, d, t);
  }
  // Dance floor on the ground level, steel catwalk above.
  const bn = beatNo(t);
  const k = kick(t);
  const mode = Math.floor(bn / 8) % 4;
  const mid = Math.floor(r.w / 4);
  drawFloors(s, r, floors, (x, row, level) => {
    if (level < floors.length - 1) {
      return { ch: row === 0 && x % 4 === 0 ? '·' : ' ', fg: RIVET, bg: row === 0 ? CATWALK : CATWALK2 };
    }
    const tx = Math.floor(x / 2);
    const lit =
      mode === 0 ? noise(tx * 2 + row + bn * 977, 29) > 0.7
        : mode === 1 ? (((tx + row - bn * 2) % 6) + 6) % 6 === 0
          : mode === 2 ? (tx + row + bn) % 2 === 0 && (Math.floor(tx / 2) + bn) % 2 === 0
            : (((Math.abs(tx - mid) - bn - row) % 5) + 5) % 5 === 0;
    const dark = (tx + row) % 2 ? FLOOR_A : FLOOR_B;
    if (!lit) return { ch: ' ', fg: P.dim, bg: dark };
    const neon = FLOOR_NEON[(Math.floor(tx / 3) + bn + mode) % FLOOR_NEON.length];
    return { ch: ' ', fg: P.dim, bg: mix(dark, neon, (0.42 + 0.38 * k) * (row ? 0.8 : 1)) };
  });
  // Underside of upper floors: an LED strip chasing in rainbow + lamps.
  floors.slice(0, -1).forEach((fy, i) => {
    const y = fy + 2;
    if (y >= r.y + r.h) return;
    for (let x = r.x; x < r.x + r.w; x++) s.put(x, y, '▀', mix(CATWALK, hsl((x - r.x) * 8 - t * 120, 1, 0.55), 0.45));
    lampRow(y, i + 1);
  });
}

const isFree = (s: Screen, x: number, y: number) => s.charAt(x, y) === ' ';

function drawAmbient(s: Screen, r: Rect, t: number, floors: number[]): void {
  const k = kick(t);
  const bands = wallBands(r, floors);
  // Sweeping light beams from the ceiling lamps.
  const lampXs = lamps(r);
  bands.forEach((band, level) => {
    const bottom = Math.min(r.y + r.h - 1, (floors[level] ?? band.y + band.h) + 1);
    const len = Math.max(1, bottom - band.y);
    lampXs.forEach((lx, i) => {
      const st = lampState(i, level, t);
      if (!st.on) return;
      for (let y = band.y + 1; y <= bottom; y++) {
        const dy = y - band.y;
        const cx = lx + dy * st.sway;
        const hw = 0.8 + dy * 0.13;
        const a = (0.15 + 0.07 * k) * (1 - (0.45 * dy) / len);
        for (let x = Math.ceil(cx - hw); x <= Math.floor(cx + hw); x++) {
          if (!inRect(r, x, y)) continue;
          s.blendBg(x, y, st.color, a * (1 - Math.abs(x - cx) / hw));
        }
      }
    });
  });
  const decor = layout(r, floors);
  // Mirror-ball reflections drifting across the walls.
  if (decor.some((d) => d.kind === 'ball')) {
    const n = Math.max(3, Math.floor(r.w / 15));
    for (let i = 0; i < n; i++) {
      const band = bands[i % bands.length];
      if (!band || band.h < 3) continue;
      const y = band.y + 1 + Math.floor(noise(i, 19) * (band.h - 1));
      const x = r.x + Math.floor((noise(i, 21) * r.w + t * (4 + noise(i, 27) * 2)) % r.w);
      if (!inRect(r, x, y)) continue;
      const c = noise(i, 31) > 0.6 ? NEON[i % NEON.length] : WHITE;
      s.blendBg(x, y, c, 0.1);
      if (isFree(s, x, y)) s.put(x, y, '•', mix(c, WHITE, 0.4));
    }
  }
  // Music notes floating up from the speakers and the dance floor.
  const note = (seed: number, x0: number, y0: number, rise: number) => {
    const period = 2.2 + noise(seed, 3) * 1.6;
    const tt = t + noise(seed, 9) * 5;
    const p = (tt % period) / period;
    const cyc = Math.floor(tt / period);
    if (noise(cyc * 17 + seed, 13) > 0.7) return;
    const x = x0 + Math.round(Math.sin(p * 6 + seed) * 1.2);
    const y = y0 - Math.floor(p * rise);
    if (!inRect(r, x, y) || !isFree(s, x, y)) return;
    const c = mix(NEON[(seed + cyc) % NEON.length], P.wall, p * 0.8);
    s.put(x, y, noise(cyc, seed) > 0.5 ? '♪' : '♫', c);
  };
  decor.forEach((d, i) => {
    if (d.kind !== 'speaker') return;
    const leftSide = d.x - r.x < r.w / 2;
    note(100 + i, leftSide ? d.x + d.w + 1 : d.x - 2, d.y + 3, 4);
  });
  floors.forEach((fy, level) => {
    const n = Math.max(2, Math.floor(r.w / 24));
    for (let i = 0; i < n; i++) {
      const seed = 200 + level * 50 + i;
      const cyc = Math.floor(t / 3.1 + noise(seed, 2));
      note(seed, r.x + Math.floor(noise(cyc, seed) * r.w), fy - 1, 6);
    }
  });
  // Rare soft strobe on the last bar of some phrases.
  const bn = beatNo(t);
  if (noise(Math.floor(bn / 16), 71) > 0.72 && bn % 16 >= 12 && beatPhase(t) < 0.14) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.blendBg(x, y, WHITE, 0.14);
  }
}

export const club: Theme = {
  id: 'club',
  name: 'Underground Club',
  tagline: 'disco balls, booming bass and a DJ who never logs off',
  palette: P,
  stations: [write, read, search, run, web, think, idle],
  entrance,
  drawBackdrop,
  drawAmbient,
};

export default club;
