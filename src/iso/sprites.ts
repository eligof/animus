import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import type { Pose, Traits } from '../world/character.ts';
import type { PixelSprite } from './canvas.ts';
import { XL_H, XL_W, xlKeys } from './rig-xl.ts';

// Sprite frame: the body is 7 px wide and 12 tall (columns 2..8, rows
// 2..13); the margins hold props (magnifier, pointing arm, raised arms).
export const SPRITE_W = 11;
export const SPRITE_H = 14;
// Large rig: body 9x16 centred in a 17x18 frame (room for props on either side).
export const SPRITE_L_W = 17;
export const SPRITE_L_H = 18;
const OX_L = 4;
// XL rig: drawn natively for 2x3 sextant cells (see rig-xl.ts).
export const SPRITE_XL_W = XL_W;
export const SPRITE_XL_H = XL_H;
export type Rig = 'S' | 'L' | 'XL';
const OX = 2;
const OY = 2;

export type Facing = { back: boolean; flip: boolean };
export type CharacterSprite = PixelSprite & { dx: number; dy: number };

// Key grid; `ox` is the column of the body's left edge in this frame.
type Grid = string[][] & { ox?: number };

const FIXED: Record<string, RGB> = {
  G: hex('#1b1b1f'), // glasses frame
  L: hex('#a8e6ff'), // lens / lamp glow
  Y: hex('#f1c40f'), // miner helmet
  R: hex('#c0392b'), // beret
  O: hex('#7f5539'), // book cover
  N: hex('#f8f0e3'), // book pages
  Q: hex('#263238'), // phone, magnifier handle
  F: hex('#3d3d46'), // headset band
  U: hex('#ffb703'), // goggle lenses
  V: hex('#ff6b9d'), // bow
  W: hex('#eef1f8'), // ghost
  w: hex('#f6f8ff'), // eye white
  Z: hex('#2e2635'), // shoes
  z: hex('#9b918a'), // soles
  m: hex('#e8667a'), // tongue
};

function palette(tr: Traits, t: number): Record<string, RGB> {
  return {
    ...FIXED,
    H: tr.hair,
    S: tr.skin,
    E: tr.eye,
    M: scale(tr.skin, 0.72),
    B: tr.shirt,
    T: tr.trim,
    A: tr.skin,
    P: tr.pants,
    K: scale(tr.pants, 0.55),
    D: scale(tr.shirt, 0.45),
    X: tr.color,
    I: Math.floor(t * 2) % 2 ? hex('#ff4757') : hex('#5c1f26'),
    C: mix(tr.skin, hex('#ff7a9a'), 0.35), // cheeks
    J: scale(tr.pants, 0.5), // belt
    h: mix(tr.hair, hex('#ffffff'), 0.38), // hair shine
    n: scale(tr.skin, 0.86), // nose, neck
  };
}

function put(g: Grid, r: number, c: number, k: string): void {
  const y = r + OY;
  const x = c + (g.ox ?? OX);
  if (y >= 0 && y < g.length && x >= 0 && x < g[0].length) g[y][x] = k;
}

function row(g: Grid, r: number, c0: number, c1: number, k: string): void {
  for (let c = c0; c <= c1; c++) put(g, r, c, k);
}

function head(g: Grid, tr: Traits, back: boolean, eyesOpen: boolean): void {
  const face = (r: number, c0: number, c1: number) => row(g, r, c0, c1, back ? 'H' : 'S');
  // Hair / skull.
  switch (tr.species === 'human' ? tr.hairStyle : -1) {
    case 1: // spiky
      put(g, 0, 1, 'H'); put(g, 0, 3, 'H'); put(g, 0, 5, 'H');
      row(g, 1, 1, 5, 'H');
      break;
    case 2: // long
      row(g, 0, 2, 4, 'H'); row(g, 1, 1, 5, 'H');
      for (let r = 2; r <= 5; r++) { put(g, r, 1, 'H'); put(g, r, 5, 'H'); }
      break;
    case 3: // bun
      put(g, 0, 3, 'H'); row(g, 1, 1, 5, 'H');
      break;
    case 4: // curly
      row(g, 0, 1, 5, 'H'); row(g, 1, 0, 6, 'H'); put(g, 2, 0, 'H'); put(g, 2, 6, 'H');
      break;
    case 5: // mohawk
      put(g, 0, 3, 'H'); row(g, 1, 1, 5, 'S'); put(g, 1, 3, 'H');
      break;
    case 6: // cap
      row(g, 0, 1, 5, 'T'); row(g, 1, back ? 1 : 0, back ? 5 : 6, 'T');
      break;
    case 7: // bald
      row(g, 1, 2, 4, 'S');
      break;
    default: // short
      row(g, 0, 2, 4, 'H'); row(g, 1, 1, 5, 'H');
  }
  // Face (or the back of the head).
  if (g[OY + 2][OX + 1] === '.') put(g, 2, 1, 'H');
  if (g[OY + 2][OX + 5] === '.') put(g, 2, 5, 'H');
  face(2, 2, 4);
  for (const r of [3, 4]) {
    if (g[OY + r][OX + 1] === '.') put(g, r, 1, back ? 'H' : 'S');
    if (g[OY + r][OX + 5] === '.') put(g, r, 5, back ? 'H' : 'S');
    face(r, 2, 4);
  }
  row(g, 5, 2, 4, 'S');
  if (!back) {
    put(g, 3, 2, eyesOpen ? 'E' : 'M');
    put(g, 3, 4, eyesOpen ? 'E' : 'M');
    put(g, 4, 3, 'M');
  }
  // Species.
  if (tr.species === 'robot') {
    row(g, 0, 1, 5, '.'); put(g, 0, 3, 'I'); row(g, 1, 1, 5, 'H');
    if (!back) row(g, 4, 2, 4, 'H');
  } else if (tr.species === 'cat') {
    row(g, 0, 1, 5, '.'); put(g, 0, 1, 'H'); put(g, 0, 5, 'H'); row(g, 1, 1, 5, 'H');
  } else if (tr.species === 'alien') {
    row(g, 0, 1, 5, '.'); put(g, 0, 1, 'S'); put(g, 0, 5, 'S'); row(g, 1, 1, 5, 'S');
    if (!back && eyesOpen) { put(g, 2, 2, 'E'); put(g, 2, 4, 'E'); }
  } else if (tr.species === 'ghost') {
    row(g, 0, 2, 4, 'W'); row(g, 1, 1, 5, 'W');
  }
}

function accessory(g: Grid, tr: Traits, back: boolean, pose: Pose): void {
  const expressive = pose === 'done' || pose === 'error' || pose === 'sleep';
  switch (tr.accessory) {
    case 'headset':
      row(g, 0, 2, 4, 'F'); put(g, 2, 0, 'X'); put(g, 3, 0, 'X'); put(g, 2, 6, 'X'); put(g, 3, 6, 'X');
      break;
    case 'glasses':
      if (!back && !expressive) { row(g, 3, 1, 5, 'G'); put(g, 3, 2, 'L'); put(g, 3, 4, 'L'); }
      break;
    case 'lamp':
      row(g, 0, 1, 5, 'Y'); row(g, 1, 1, 5, 'Y'); if (!back) put(g, 1, 3, 'L');
      break;
    case 'beret':
      row(g, 0, 2, 6, 'R'); row(g, 1, 1, 5, 'R');
      break;
    case 'goggles':
      if (!back && !expressive) { row(g, 3, 1, 5, 'G'); put(g, 3, 2, 'U'); put(g, 3, 4, 'U'); }
      else if (back) row(g, 3, 1, 5, 'G');
      break;
    case 'hood':
      row(g, 0, 1, 5, 'D'); row(g, 1, 0, 6, 'D');
      for (let r = 2; r <= 5; r++) { put(g, r, 0, 'D'); put(g, r, 6, 'D'); if (back) row(g, r, 1, 5, 'D'); }
      if (!back && !expressive) { put(g, 3, 2, 'Y'); put(g, 3, 4, 'Y'); }
      break;
    case 'bow':
      put(g, 0, 5, 'V'); put(g, 1, 6, 'V');
      break;
  }
}

function body(g: Grid, tr: Traits, pose: Pose, tp: number, back: boolean): number {
  const ghost = tr.species === 'ghost';
  const shirt = ghost ? 'W' : 'B';
  for (let r = 6; r <= 9; r++) row(g, r, 1, 5, shirt);
  if (!ghost) {
    put(g, 7, 3, back ? 'B' : 'T');
    row(g, 9, 1, 5, 'P');
  }
  // Legs.
  const walkF = Math.floor(tp * 8) % 4;
  let dy = 0;
  if (ghost) {
    const f = Math.floor(tp * (pose === 'walk' ? 8 : 3)) % 2;
    for (const c of f ? [1, 3, 5] : [2, 4]) put(g, 10, c, 'W');
  } else if (pose === 'walk' && walkF % 2 === 1) {
    dy = -1;
    const lift = walkF === 1 ? [1, 2] : [4, 5];
    const plant = walkF === 1 ? [4, 5] : [1, 2];
    for (const c of plant) { put(g, 10, c, 'P'); put(g, 11, c, 'K'); }
    for (const c of lift) put(g, 10, c, 'K');
  } else {
    for (const c of [1, 2, 4, 5]) { put(g, 10, c, 'P'); put(g, 11, c, 'K'); }
  }
  // Arms.
  const arm = ghost ? 'W' : 'A';
  const sleeve = ghost ? 'W' : 'B';
  const armsDown = () => {
    for (const c of [0, 6]) { put(g, 6, c, sleeve); put(g, 7, c, arm); put(g, 8, c, arm); }
  };
  const f2 = Math.floor(tp * 2) % 2;
  const f6 = Math.floor(tp * 6) % 2;
  const f8 = Math.floor(tp * 8) % 2;
  switch (pose) {
    case 'walk': {
      const swing = walkF === 1 ? 1 : walkF === 3 ? -1 : 0;
      put(g, 6, 0, sleeve); put(g, 6, 6, sleeve);
      put(g, 7 - Math.max(0, swing), 0, arm); put(g, 8 - Math.max(0, swing), 0, arm);
      put(g, 7 - Math.max(0, -swing), 6, arm); put(g, 8 - Math.max(0, -swing), 6, arm);
      break;
    }
    case 'write':
      put(g, 6, 0, sleeve); put(g, 6, 6, sleeve); put(g, 7, 0, arm); put(g, 7, 6, arm);
      if (!back) { put(g, f8 ? 7 : 8, 1, arm); put(g, f8 ? 8 : 7, 5, arm); }
      break;
    case 'read':
      armsDown();
      if (!back) { row(g, 7, 1, 5, 'N'); row(g, 8, 1, 5, 'O'); put(g, 7, 3, 'O'); }
      break;
    case 'think':
      put(g, 6, 0, sleeve); put(g, 7, 0, arm); put(g, 8, 0, arm);
      put(g, 6, 6, sleeve); put(g, 5, 6, arm); if (!back) put(g, 5, 5, arm);
      break;
    case 'run':
      put(g, 6, 0, sleeve); put(g, 6, 6, sleeve);
      put(g, f6 ? 7 : 9, 0, arm); put(g, 8, 0, arm);
      put(g, f6 ? 9 : 7, 6, arm); put(g, 8, 6, arm);
      break;
    case 'search':
      put(g, 6, 0, sleeve); put(g, 7, 0, arm); put(g, 8, 0, arm);
      put(g, 6, 6, sleeve); put(g, 5, 6, arm); put(g, 4, 7, 'Q');
      put(g, 2, 7, 'L'); put(g, 2, 8, 'L'); put(g, 3, 7, 'L'); put(g, 3, 8, 'L');
      break;
    case 'web':
      put(g, 6, 0, sleeve); put(g, 7, 0, arm); put(g, 8, 0, arm);
      put(g, 6, 6, sleeve); put(g, 5, 6, arm); put(g, 4, 6, arm); put(g, 3, 6, 'Q');
      break;
    case 'delegate':
      put(g, 6, 0, sleeve); put(g, 7, 0, arm); put(g, 8, 0, arm);
      put(g, 6, 6, sleeve); put(g, f2 ? 6 : 7, 7, arm); put(g, f2 ? 6 : 7, 8, arm);
      break;
    case 'talk':
      put(g, 6, 0, sleeve); put(g, 6, 6, sleeve);
      if (f2) { put(g, 5, 0, arm); put(g, 4, 0, arm); put(g, 7, 6, arm); put(g, 8, 6, arm); }
      else { put(g, 5, 6, arm); put(g, 4, 6, arm); put(g, 7, 0, arm); put(g, 8, 0, arm); }
      break;
    case 'done':
      for (const c of [0, 6]) { put(g, 6, c, sleeve); put(g, 5, c, arm); put(g, 4, c, arm); put(g, 3, c, arm); }
      dy = Math.sin(tp * Math.PI * 3) > 0.2 ? -2 : 0;
      break;
    default:
      armsDown();
  }
  return dy;
}

const WHITE: RGB = hex('#ffffff');
const INK: RGB = hex('#120c18');
const ERROR_RED: RGB = hex('#ff3b3b');
// Tiny details that keep their exact colour (eyes, lenses, props).
const FLAT = new Set(['E', 'M', 'G', 'L', 'Q', 'U', 'V', 'I', 'w', 'h', 'n', 'm', 'z']);

// Light from above and the right: each material gets a highlight where its
// top edge meets something else, a shadow along its left edge and a darker
// lower edge — three or four tones per material instead of one flat colour.
// `soft` (XL) adds a second, lighter shadow step and a lit right edge, so
// wide areas read as rounded.
function shade(g: Grid, pal: Record<string, RGB>, soft = false): Array<Array<RGB | null>> {
  return g.map((r, y) =>
    r.map((k, x) => {
      if (k === '.') return null;
      const base = pal[k] ?? FIXED.Q;
      if (FLAT.has(k)) return base;
      const up = y > 0 ? g[y - 1][x] : '.';
      const left = x > 0 ? r[x - 1] : '.';
      const down = y < g.length - 1 ? g[y + 1][x] : '.';
      let c = base;
      if (up !== k) c = mix(c, WHITE, soft ? 0.2 : 0.24);
      if (left !== k) c = scale(c, 0.76);
      else if (soft && r[x - 2] !== k) c = scale(c, 0.9);
      else if (down !== k && up === k) c = scale(c, 0.88);
      else if (soft && r[x + 1] !== k) c = mix(c, WHITE, 0.12);
      return c;
    }),
  );
}

// Selective outline: every empty pixel touching the silhouette (4-way) takes
// a dark tint of the colour it touches, which keeps edges crisp on any floor.
function outline(px: Array<Array<RGB | null>>): Array<Array<RGB | null>> {
  return px.map((r, y) =>
    r.map((c, x) => {
      if (c) return c;
      const n = r[x - 1] ?? r[x + 1] ?? px[y - 1]?.[x] ?? px[y + 1]?.[x];
      return n ? mix(n, INK, 0.72) : null;
    }),
  );
}

// Pixel sprite for a character in a pose at time t (seconds). `phase`
// desynchronises blinking and gestures between characters.
export function characterSprite(tr: Traits, pose: Pose, t: number, facing: Facing, phase = 0, rig: Rig = 'S'): CharacterSprite {
  const tp = t + (phase % 97) * 0.37;
  const large = rig === 'L';
  const g: Grid = Object.assign(
    Array.from({ length: large ? SPRITE_L_H : SPRITE_H }, () => Array<string>(large ? SPRITE_L_W : SPRITE_W).fill('.')),
    { ox: large ? OX_L : OX },
  );
  const blink = tp % 3.3 < 0.15;
  const eyesOpen = !(blink || pose === 'sleep');
  let dy: number;
  let keys: Grid = g;
  if (rig === 'XL') {
    ({ keys, dy } = xlKeys(tr, pose, tp, facing.back, eyesOpen));
  } else if (large) {
    dy = bodyL(g, tr, pose, tp, facing.back);
    headL(g, tr, facing.back, eyesOpen, pose);
    accessoryL(g, tr, facing.back, pose);
  } else {
    dy = body(g, tr, pose, tp, facing.back);
    head(g, tr, facing.back, eyesOpen);
    accessory(g, tr, facing.back, pose);
  }
  let dx = pose === 'error' && tp % 1 < 0.4 ? (Math.floor(tp * 12) % 2 ? 1 : -1) : 0;
  if (rig === 'XL') dx *= 2;
  const pal = palette(tr, tp);
  const errFlash = pose === 'error' && Math.floor(tp * 4) % 2 === 0;
  const px = outline(shade(keys, pal, rig === 'XL')).map((r) => r.map((c) => (c && errFlash ? mix(c, ERROR_RED, 0.45) : c)));
  if (facing.flip) for (const r of px) r.reverse();
  const W = keys[0].length;
  const H = keys.length;
  return { w: W, h: H, px, ax: Math.floor(W / 2), ay: H - 1, dx, dy };
}

// ── large rig (body 9x16: columns 0..8, rows 0..15) ───────────────────────
function headL(g: Grid, tr: Traits, back: boolean, eyesOpen: boolean, pose: Pose): void {
  const skin = (r: number, c0: number, c1: number) => row(g, r, c0, c1, 'S');
  // Skull and face.
  row(g, 2, 2, 6, 'S');
  for (const r of [3, 4, 5]) skin(r, 1, 7);
  skin(6, 2, 6);
  skin(7, 3, 5);
  // Hair.
  const human = tr.species === 'human';
  switch (human ? tr.hairStyle : -1) {
    case 1: // spiky
      for (const c of [2, 4, 6]) put(g, 0, c, 'H');
      row(g, 1, 1, 7, 'H'); row(g, 2, 1, 7, 'H'); put(g, 3, 1, 'H'); put(g, 3, 7, 'H');
      break;
    case 2: // long
      row(g, 0, 3, 5, 'H'); row(g, 1, 2, 6, 'H'); row(g, 2, 1, 7, 'H');
      for (let r = 3; r <= 9; r++) { put(g, r, 1, 'H'); put(g, r, 7, 'H'); }
      break;
    case 3: // bun
      row(g, 0, 3, 5, 'H'); put(g, -1, 4, 'H'); row(g, 1, 2, 6, 'H'); row(g, 2, 1, 7, 'H'); put(g, 3, 1, 'H'); put(g, 3, 7, 'H');
      break;
    case 4: // curly
      row(g, 0, 2, 6, 'H'); row(g, 1, 1, 7, 'H'); row(g, 2, 0, 8, 'H'); put(g, 3, 0, 'H'); put(g, 3, 1, 'H'); put(g, 3, 7, 'H'); put(g, 3, 8, 'H'); put(g, 4, 0, 'H'); put(g, 4, 8, 'H');
      break;
    case 5: // mohawk
      row(g, 1, 2, 6, 'S'); put(g, 0, 4, 'H'); put(g, 1, 4, 'H'); put(g, 2, 4, 'H'); put(g, -1, 4, 'H');
      break;
    case 6: // cap
      row(g, 0, 2, 6, 'T'); row(g, 1, 1, 7, 'T'); row(g, 2, back ? 1 : 0, back ? 7 : 8, 'D');
      break;
    case 7: // bald
      row(g, 1, 3, 5, 'S');
      break;
    default: // short
      row(g, 0, 3, 5, 'H'); row(g, 1, 2, 6, 'H'); row(g, 2, 1, 7, 'H'); put(g, 3, 1, 'H'); put(g, 3, 7, 'H');
  }
  if (back) {
    for (const r of [3, 4, 5, 6]) row(g, r, r === 6 ? 2 : 1, r === 6 ? 6 : 7, 'H');
    if (tr.species !== 'human') for (const r of [3, 4, 5, 6]) row(g, r, r === 6 ? 2 : 1, r === 6 ? 6 : 7, tr.species === 'ghost' ? 'W' : 'S');
  } else {
    // Eyes: white + pupil (looking slightly right), blinking shut.
    if (eyesOpen) {
      put(g, 4, 2, 'w'); put(g, 4, 3, 'E'); put(g, 4, 5, 'w'); put(g, 4, 6, 'E');
    } else {
      put(g, 4, 2, 'M'); put(g, 4, 3, 'M'); put(g, 4, 5, 'M'); put(g, 4, 6, 'M');
    }
    put(g, 5, 2, 'C'); put(g, 5, 6, 'C');
    if (pose === 'done' || pose === 'talk') { put(g, 6, 3, 'M'); put(g, 6, 4, 'M'); put(g, 6, 5, 'M'); }
    else put(g, 6, 4, 'M');
  }
  // Species.
  if (tr.species === 'robot') {
    row(g, 0, 2, 6, '.'); row(g, -1, 0, 8, '.'); put(g, -1, 4, 'I'); put(g, 0, 4, 'H'); row(g, 1, 2, 6, 'H'); row(g, 2, 1, 7, 'H');
    if (!back) { row(g, 4, 2, 3, eyesOpen ? 'E' : 'H'); row(g, 4, 5, 6, eyesOpen ? 'E' : 'H'); put(g, 5, 2, 'S'); put(g, 5, 6, 'S'); row(g, 6, 3, 5, 'H'); }
  } else if (tr.species === 'cat') {
    row(g, 0, 2, 6, '.'); put(g, 0, 1, 'H'); put(g, 0, 2, 'H'); put(g, 0, 6, 'H'); put(g, 0, 7, 'H');
    put(g, 1, 1, 'H'); put(g, 1, 2, 'C'); put(g, 1, 6, 'C'); put(g, 1, 7, 'H'); row(g, 1, 3, 5, 'H'); row(g, 2, 1, 7, 'H');
    if (!back) { row(g, 6, 2, 6, 'S'); put(g, 6, 3, 'M'); put(g, 6, 5, 'M'); }
  } else if (tr.species === 'alien') {
    row(g, 0, 2, 6, '.'); put(g, -1, 1, 'S'); put(g, 0, 2, 'S'); put(g, -1, 7, 'S'); put(g, 0, 6, 'S'); row(g, 1, 2, 6, 'S'); row(g, 2, 1, 7, 'S'); put(g, 3, 1, 'S'); put(g, 3, 7, 'S');
    if (!back && eyesOpen) { for (const c of [2, 3, 5, 6]) { put(g, 3, c, 'E'); put(g, 4, c, 'E'); } }
  } else if (tr.species === 'ghost') {
    row(g, 0, 3, 5, 'W'); row(g, 1, 2, 6, 'W'); row(g, 2, 1, 7, 'W'); put(g, 3, 1, 'W'); put(g, 3, 7, 'W');
  }
}

function accessoryL(g: Grid, tr: Traits, back: boolean, pose: Pose): void {
  const expressive = pose === 'done' || pose === 'error' || pose === 'sleep';
  switch (tr.accessory) {
    case 'headset':
      row(g, 0, 3, 5, 'F'); put(g, 1, 2, 'F'); put(g, 1, 6, 'F');
      for (const r of [3, 4, 5]) { put(g, r, 0, 'X'); put(g, r, 8, 'X'); }
      if (!back) { put(g, 6, 7, 'Q'); put(g, 6, 6, 'Q'); }
      break;
    case 'glasses':
      if (!back && !expressive) { row(g, 4, 1, 7, 'G'); put(g, 4, 2, 'L'); put(g, 4, 3, 'E'); put(g, 4, 5, 'L'); put(g, 4, 6, 'E'); }
      break;
    case 'lamp':
      row(g, 0, 2, 6, 'Y'); row(g, 1, 1, 7, 'Y'); row(g, 2, 1, 7, 'Y'); if (!back) { put(g, 1, 4, 'L'); put(g, 1, 3, 'L'); }
      break;
    case 'beret':
      row(g, 0, 2, 8, 'R'); row(g, 1, 1, 7, 'R'); put(g, -1, 4, 'R');
      break;
    case 'goggles':
      row(g, 3, 1, 7, 'G');
      if (!back && !expressive) { put(g, 4, 2, 'U'); put(g, 4, 3, 'U'); put(g, 4, 5, 'U'); put(g, 4, 6, 'U'); row(g, 4, 1, 1, 'G'); put(g, 4, 4, 'G'); put(g, 4, 7, 'G'); }
      break;
    case 'hood':
      row(g, 0, 2, 6, 'D'); row(g, 1, 1, 7, 'D'); row(g, 2, 0, 8, 'D');
      for (let r = 3; r <= 7; r++) { put(g, r, 0, 'D'); put(g, r, 8, 'D'); if (back) row(g, r, 1, 7, 'D'); }
      if (!back) { row(g, 3, 1, 7, 'D'); if (!expressive) { put(g, 4, 2, 'Y'); put(g, 4, 3, 'Y'); put(g, 4, 5, 'Y'); put(g, 4, 6, 'Y'); } }
      break;
    case 'bow':
      put(g, 0, 6, 'V'); put(g, 0, 7, 'V'); put(g, 1, 7, 'V'); put(g, -1, 6, 'V');
      break;
  }
}

function bodyL(g: Grid, tr: Traits, pose: Pose, tp: number, back: boolean): number {
  const ghost = tr.species === 'ghost';
  const shirt = ghost ? 'W' : 'B';
  for (let r = 8; r <= 11; r++) row(g, r, 1, 7, shirt);
  if (!ghost) {
    if (!back) { row(g, 8, 3, 5, 'T'); put(g, 10, 4, 'T'); }
    row(g, 12, 1, 7, 'J');
    if (!back) put(g, 12, 4, 'U');
  } else {
    row(g, 12, 1, 7, 'W');
  }
  // Legs.
  const walkF = Math.floor(tp * 8) % 4;
  let dy = 0;
  if (ghost) {
    row(g, 13, 1, 7, 'W');
    const f = Math.floor(tp * (pose === 'walk' ? 8 : 3)) % 2;
    for (const c of f ? [1, 3, 5, 7] : [2, 4, 6]) put(g, 14, c, 'W');
  } else if (pose === 'walk' && walkF % 2 === 1) {
    dy = -1;
    const lift = walkF === 1 ? [1, 2, 3] : [5, 6, 7];
    const plant = walkF === 1 ? [5, 6, 7] : [1, 2, 3];
    for (const c of plant) { put(g, 13, c, 'P'); put(g, 14, c, 'P'); put(g, 15, c, 'K'); }
    for (const c of lift) { put(g, 13, c, 'P'); put(g, 14, c, 'K'); }
  } else {
    for (const c of [1, 2, 3, 5, 6, 7]) { put(g, 13, c, 'P'); put(g, 14, c, 'P'); put(g, 15, c, 'K'); }
  }
  // Arms: sleeves on rows 8-9, forearms and hands below.
  const arm = ghost ? 'W' : 'A';
  const sleeve = ghost ? 'W' : 'B';
  const side = (c: number, top: number, bottom: number) => {
    put(g, 8, c, sleeve);
    for (let r = top; r <= bottom; r++) put(g, r, c, r === 9 ? sleeve : arm);
  };
  const f2 = Math.floor(tp * 2) % 2;
  const f6 = Math.floor(tp * 6) % 2;
  const f8 = Math.floor(tp * 8) % 2;
  switch (pose) {
    case 'walk': {
      const swing = walkF === 1 ? 1 : walkF === 3 ? -1 : 0;
      side(0, 9 - Math.max(0, swing), 11 - Math.max(0, swing));
      side(8, 9 - Math.max(0, -swing), 11 - Math.max(0, -swing));
      break;
    }
    case 'write':
      side(0, 9, 10); side(8, 9, 10);
      if (!back) { put(g, f8 ? 10 : 11, 1, arm); put(g, f8 ? 11 : 10, 7, arm); }
      break;
    case 'read':
      side(0, 9, 11); side(8, 9, 11);
      if (!back) { row(g, 9, 2, 6, 'N'); row(g, 10, 1, 7, 'O'); row(g, 11, 1, 7, 'O'); put(g, 9, 4, 'O'); }
      break;
    case 'think':
      side(0, 9, 11);
      put(g, 8, 8, sleeve); put(g, 7, 8, arm); if (!back) { put(g, 6, 7, arm); put(g, 6, 8, arm); }
      break;
    case 'run':
      side(0, 9, f6 ? 10 : 11); side(8, 9, f6 ? 11 : 10);
      if (f6) put(g, 12, 0, arm); else put(g, 12, 8, arm);
      break;
    case 'search':
      side(0, 9, 11);
      put(g, 8, 8, sleeve); put(g, 7, 8, arm); put(g, 6, 8, 'Q');
      for (const [r, c] of [[3, 9], [4, 9]]) put(g, r, c, 'L');
      for (const [r, c] of [[2, 9], [5, 9], [3, 8], [4, 8], [3, 10], [4, 10]]) put(g, r, c, 'Q');
      break;
    case 'web':
      side(0, 9, 11);
      put(g, 8, 8, sleeve); put(g, 7, 8, arm); put(g, 6, 8, arm); put(g, 5, 8, 'Q'); put(g, 4, 8, 'Q');
      break;
    case 'delegate':
      side(0, 9, 11);
      put(g, 8, 8, sleeve); put(g, f2 ? 8 : 9, 9, arm); put(g, f2 ? 8 : 9, 10, arm);
      break;
    case 'talk':
      if (f2) { side(8, 9, 11); put(g, 8, 0, sleeve); put(g, 7, 0, arm); put(g, 6, 0, arm); }
      else { side(0, 9, 11); put(g, 8, 8, sleeve); put(g, 7, 8, arm); put(g, 6, 8, arm); }
      break;
    case 'done':
      for (const c of [0, 8]) { put(g, 8, c, sleeve); for (let r = 4; r <= 7; r++) put(g, r, c, arm); }
      dy = Math.sin(tp * Math.PI * 3) > 0.2 ? -3 : 0;
      break;
    default:
      side(0, 9, 11); side(8, 9, 11);
  }
  return dy;
}
