import type { RGB } from '../term/color.ts';
import { hex, hsl, scale } from '../term/color.ts';
import type { Activity } from '../agents.ts';
import { hashString, Rng } from './rng.ts';

export const SPRITE_W = 5;
export const SPRITE_H = 4;

// Work poses follow the agent's activity; the rest are the little life in
// between: sitting, carrying a block (and placing it on a build), cheering,
// waving, sipping a drink, stretching, chatting face to face, flinching at a
// bang, dancing, petting a critter.
export type Pose =
  | 'idle' | 'walk' | 'write' | 'read' | 'think' | 'run' | 'search' | 'web' | 'delegate' | 'talk' | 'done' | 'error' | 'sleep'
  | 'sit' | 'carry' | 'place' | 'cheer' | 'wave' | 'drink' | 'stretch' | 'chat' | 'flinch' | 'dance' | 'pet';
// Little pictures that pop up over a character's head.
export type Emote = 'excl' | 'question' | 'heart' | 'note' | 'idea' | 'sweat' | 'zzz' | 'anger' | 'star' | 'cup';
// How characters dress in a scene: wizards in the mines and the caverns,
// lab coats in the lab, party outfits in the club, hoodies in the den,
// space suits on the station, everyday clothes in the café.
export type Costume = 'wizard' | 'scientist' | 'raver' | 'hacker' | 'astronaut' | 'casual';
export type Species = 'human' | 'robot' | 'cat' | 'alien' | 'ghost';
export type Accessory = 'none' | 'headset' | 'glasses' | 'lamp' | 'beret' | 'goggles' | 'hood' | 'bow';

// How an agent feels, from its meters (see pet/meters.ts), as its figure
// shows it: drowsy eyes when its energy is critical, a bandage when its
// health is, a grin (and a bigger bounce, see FigureFrame.hop) when its
// mood is high.
export type Feel = { drowsy: boolean; bandaged: boolean; bouncy: boolean };
// What its level lets it wear (see pet/crew.ts): a hat from the world's
// costume set, a badge on the shirt, its outfit in other colours, a soft
// aura.
export type Wear = { hat: boolean; badge: boolean; outfit: boolean; aura: boolean };

export type Traits = {
  species: Species;
  skin: RGB;
  hair: RGB;
  hairStyle: number;
  shirt: RGB;
  trim: RGB;
  pants: RGB;
  pattern: string;
  accessory: Accessory;
  eye: RGB;
  color: RGB;
};

export type Cell = { ch: string; fg?: RGB; bg?: RGB } | null;
export type Sprite = { cells: Cell[][]; dx: number; dy: number };

const SKINS = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a21'].map(hex);
const HAIRS = ['#2c1b10', '#5a3825', '#a0522d', '#d6a756', '#f2e2b1', '#c0392b', '#7d3c98', '#2e86c1', '#1abc9c', '#e84393', '#dfe6e9', '#141414'].map(hex);
const FURS = ['#f39c12', '#95a5a6', '#3d3d4e', '#ecf0f1', '#d35400'].map(hex);
const PANTS = ['#2d3436', '#34495e', '#3d5a80', '#6c5b7b', '#5d4037', '#273c75', '#1e272e'].map(hex);
const PATTERNS = ['█', '▓', '▒', '▼', '◆', '║', '╋', '♥'];
const DARK: RGB = hex('#1b1b1f');
const METAL: RGB = hex('#9aa5b1');
const LENS: RGB = hex('#a8e6ff');
const PAGES: RGB = hex('#f8f0e3');
const COVER: RGB = hex('#7f5539');
const GHOST: RGB = hex('#eef1f8');
const HAIR_STYLES = 8;

export function traitsFor(id: string, role: 'lead' | 'sub', agentType?: string): Traits {
  const rng = new Rng(hashString(id));
  const species = rng.weighted<Species>([['human', 55], ['robot', 12], ['cat', 12], ['alien', 11], ['ghost', 10]]);
  const hue = rng.int(0, 359);
  const shirt = hsl(hue, 0.6, 0.48);
  let skin = rng.pick(SKINS);
  let hair = rng.pick(HAIRS);
  let eye = DARK;
  let pants = rng.pick(PANTS);
  if (species === 'robot') {
    skin = METAL;
    hair = scale(METAL, 0.7);
    eye = hex('#00e5ff');
  } else if (species === 'cat') {
    skin = rng.pick(FURS);
    hair = skin;
  } else if (species === 'alien') {
    skin = rng.pick([hex('#7bed9f'), hex('#a29bfe'), hex('#81ecec')]);
    hair = skin;
    eye = hex('#000000');
  } else if (species === 'ghost') {
    skin = GHOST;
    hair = GHOST;
    eye = hex('#2f3640');
    pants = GHOST;
  }
  const hairStyle = rng.int(0, HAIR_STYLES - 1);
  const pattern = species === 'ghost' ? '█' : rng.pick(PATTERNS);
  const seeded = rng.pick<Accessory>(['none', 'none', 'bow', 'glasses', 'none']);
  return {
    species,
    skin,
    hair,
    hairStyle,
    shirt: species === 'ghost' ? GHOST : shirt,
    trim: hsl(hue + 180, 0.7, 0.75),
    pants,
    pattern,
    accessory: role === 'lead' ? 'headset' : accessoryFor(agentType) ?? seeded,
    eye,
    color: hsl(hue, 0.85, 0.68),
  };
}

function accessoryFor(agentType?: string): Accessory | null {
  const t = (agentType ?? '').toLowerCase();
  if (!t) return null;
  if (t.includes('security')) return 'hood';
  if (t.includes('review')) return 'glasses';
  if (t.includes('explore') || t.includes('search') || t.includes('investig')) return 'lamp';
  if (t.includes('plan') || t.includes('architect')) return 'beret';
  if (t.includes('test')) return 'goggles';
  return null;
}

export function poseFor(activity: Activity, idleFor: number, walking: boolean): Pose {
  if (activity === 'done') return 'done';
  if (walking) return 'walk';
  if (activity === 'idle') return idleFor >= 20 ? 'sleep' : 'idle';
  return activity;
}

const MIRROR: Record<string, string> = {
  '▐': '▌', '▌': '▐', '▗': '▖', '▖': '▗', '▝': '▘', '▘': '▝', '▟': '▙', '▙': '▟', '▛': '▜', '▜': '▛',
  '╱': '╲', '╲': '╱', '╯': '╰', '╰': '╯', '╮': '╭', '╭': '╮', '┐': '┌', '┌': '┐', '┘': '└', '└': '┘',
  'ò': 'ó', 'ó': 'ò', '<': '>', '>': '<', '/': '\\', '\\': '/',
};

function mirror(rows: Cell[][]): Cell[][] {
  return rows.map((row) => row.slice().reverse().map((c) => (c ? { ...c, ch: MIRROR[c.ch] ?? c.ch } : c)));
}

const c = (ch: string, fg?: RGB, bg?: RGB): Cell => ({ ch, fg, bg });

function hairRow(tr: Traits, t: number): Cell[] {
  const h = tr.hair;
  switch (tr.species) {
    case 'robot':
      return [null, c('▄', METAL), c('╨', Math.floor(t * 2) % 2 ? hex('#ff4757') : hex('#5c1f26')), c('▄', METAL), null];
    case 'cat':
      return [null, c('▲', h), null, c('▲', h), null];
    case 'alien':
      return [null, c('╲', h), null, c('╱', h), null];
    case 'ghost':
      return [null, c('▄', GHOST), c('▄', GHOST), c('▄', GHOST), null];
  }
  switch (tr.hairStyle) {
    case 0: return [null, c('▄', h), c('▄', h), c('▄', h), null];
    case 1: return [null, c('▟', h), c('█', h), c('▙', h), null];
    case 2: return [null, c('▗', h), c('█', h), c('▖', h), null];
    case 3: return [c('▗', h), c('▄', h), c('▄', h), c('▄', h), c('▖', h)];
    case 4: return [null, c('▓', h), c('▓', h), c('▓', h), null];
    case 5: return [null, c('▄', h), c('●', h), c('▄', h), null];
    case 6: return [null, c('▲', h), c('▲', h), c('▲', h), null];
    default: return [null, c('▁', tr.skin), c('▁', tr.skin), c('▁', tr.skin), null];
  }
}

type Face = [string, string, string];

function faceFor(pose: Pose, t: number, blink: boolean): Face {
  switch (pose) {
    case 'write': return blink ? ['-', '_', '-'] : ['•', '_', '•'];
    case 'read': return ['.', '_', '.'];
    case 'think': return ['°', '~', '°'];
    case 'run': return ['ò', '_', 'ó'];
    case 'search': return ['o', '.', 'o'];
    case 'delegate': return ['•', 'o', '•'];
    case 'talk': return Math.floor(t * 5) % 2 ? ['•', 'o', '•'] : ['•', '-', '•'];
    case 'done': return ['^', 'ᴗ', '^'];
    case 'error': return ['×', '_', '×'];
    case 'sleep': return ['-', '_', '-'];
    default: return blink ? ['-', 'ᴗ', '-'] : ['•', 'ᴗ', '•'];
  }
}

// Builds the 5x4 sprite for a pose at time t (seconds). `phase` desyncs
// blinking/gestures between characters.
export function spriteFor(tr: Traits, pose: Pose, t: number, facing: 1 | -1, phase = 0): Sprite {
  const tp = t + (phase % 97) * 0.37;
  const blink = tp % 3.3 < 0.15;
  const arm = tr.skin;
  const rows: Cell[][] = [hairRow(tr, tp), [null, null, null, null, null], [], []];

  // Face.
  let [el, m, er] = faceFor(pose, tp, blink);
  if (tr.species === 'cat' && m === 'ᴗ') m = 'ω';
  if (tr.species === 'robot') {
    if (el === '•' || el === '.' || el === 'o' || el === '°' || el === 'ò') el = er = '▪';
    if (m === 'ᴗ') m = '▿';
  }
  let faceBg = tr.skin;
  let eye = tr.eye;
  const expressive = pose === 'done' || pose === 'error' || pose === 'sleep';
  if (tr.accessory === 'glasses' && !expressive) el = er = '■';
  if (tr.accessory === 'goggles' && !expressive) el = er = '◎';
  if (tr.accessory === 'hood') {
    faceBg = scale(tr.skin, 0.45);
    eye = hex('#ffe066');
  }
  rows[1][1] = c(el, eye, faceBg);
  rows[1][2] = c(m, eye, faceBg);
  rows[1][3] = c(er, eye, faceBg);

  // Accessories around the head.
  switch (tr.accessory) {
    case 'headset':
      rows[0][0] = c('╭', hex('#3d3d46'));
      rows[0][4] = c('╮', hex('#3d3d46'));
      rows[1][0] = c('▐', tr.color);
      rows[1][4] = c('▌', tr.color);
      break;
    case 'lamp':
      rows[0] = [null, c('▟', hex('#f1c40f')), c('●', hex('#fffbe0')), c('▙', hex('#f1c40f')), null];
      break;
    case 'beret':
      rows[0] = [null, c('▄', hex('#c0392b')), c('▄', hex('#c0392b')), c('▄', hex('#c0392b')), c('▖', hex('#c0392b'))];
      break;
    case 'hood': {
      const hood = scale(tr.shirt, 0.55);
      rows[0] = [c('▗', hood), c('▄', hood), c('▄', hood), c('▄', hood), c('▖', hood)];
      rows[1][0] = c('▐', hood);
      rows[1][4] = c('▌', hood);
      break;
    }
    case 'bow':
      rows[0][3] = c('⋈', hex('#ff6b9d'));
      break;
  }
  if (tr.hairStyle === 3 && tr.species === 'human' && tr.accessory !== 'headset' && tr.accessory !== 'hood') {
    rows[1][0] = c('▐', tr.hair);
    rows[1][4] = c('▌', tr.hair);
  }

  // Torso.
  const pat = tr.pattern === '█' ? c('█', tr.shirt) : c(tr.pattern, tr.trim, tr.shirt);
  rows[2] = [null, c('█', tr.shirt), pat, c('█', tr.shirt), null];
  const f2 = Math.floor(tp * 2) % 2;
  const f4 = Math.floor(tp * 4) % 2;
  const f6 = Math.floor(tp * 6) % 2;
  const f8 = Math.floor(tp * 8) % 2;
  let armL = '▐';
  let armR = '▌';
  let dx = 0;
  let dy = 0;
  switch (pose) {
    case 'walk':
      [armL, armR] = f8 ? ['╱', '▌'] : ['▐', '╲'];
      break;
    case 'write':
      [armL, armR] = f6 ? ['▄', '▀'] : ['▀', '▄'];
      break;
    case 'read':
      rows[2][1] = c('▤', COVER, PAGES);
      rows[2][2] = c(Math.floor(tp / 2.5) % 2 ? '│' : '▤', COVER, PAGES);
      rows[2][3] = c('▤', COVER, PAGES);
      break;
    case 'think':
      armR = '╯';
      break;
    case 'run':
      [armL, armR] = f4 ? ['▀', '▀'] : ['▄', '▄'];
      break;
    case 'search':
      rows[1][4] = c('○', LENS);
      armR = '╱';
      break;
    case 'web':
      rows[1][4] = c('▮', DARK);
      armR = '╯';
      break;
    case 'delegate':
      armR = f2 ? '━' : '─';
      break;
    case 'talk':
      [armL, armR] = f2 ? ['╲', '▌'] : ['▐', '╱'];
      break;
    case 'done':
      [armL, armR] = ['╲', '╱'];
      dy = Math.sin(tp * Math.PI * 3) > 0.2 ? -1 : 0;
      break;
    case 'error':
      [armL, armR] = ['╱', '╲'];
      dx = tp % 1 < 0.4 && f6 ? 1 : 0;
      break;
  }
  rows[2][0] = c(armL, arm);
  rows[2][4] = c(armR, arm);

  // Legs.
  if (tr.species === 'ghost') {
    rows[3] = (pose === 'walk' ? f8 : f2) ? [null, c('▀', GHOST), c('▄', GHOST), c('▀', GHOST), null] : [null, c('▄', GHOST), c('▀', GHOST), c('▄', GHOST), null];
  } else if (pose === 'walk' && f8) {
    rows[3] = [null, c('▌', tr.pants), null, c('▐', tr.pants), null];
  } else if (pose === 'done' && dy < 0) {
    rows[3] = [null, c('▝', tr.pants), null, c('▘', tr.pants), null];
  } else {
    rows[3] = [null, c('▐', tr.pants), null, c('▌', tr.pants), null];
  }

  return { cells: facing === -1 ? mirror(rows) : rows, dx, dy };
}
