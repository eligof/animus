import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import { DECOR } from './hell/decor.ts';
import { INK } from './hell/kit.ts';
import { hellPois, room } from './hell/room.ts';
import { STATIONS } from './hell/stations.ts';
import type { WorldDef } from './types.ts';

// Hell: lava lakes, brimstone and the bones of the damned.

const PALETTE: Palette = {
  bg: hex('#0c0404'),
  wall: hex('#1f0a09'),
  wall2: hex('#280d0b'),
  floor: hex('#30110e'),
  floor2: hex('#270e0c'),
  text: hex('#f0e4cc'),
  dim: hex('#9a6a58'),
  accent: hex('#ff7a1f'),
  accent2: hex('#d0201c'),
  panel: hex('#140505'),
  panelText: hex('#f0e4cc'),
  border: hex('#7c1c16'),
  bubble: hex('#f2e8d2'),
  bubbleText: hex('#1e0806'),
  good: hex('#b5d45a'),
  warn: hex('#ffb02e'),
  bad: hex('#ff3a2a'),
};

export const hell: WorldDef = {
  id: 'hell',
  name: 'Hell',
  tagline: 'Lava lakes, brimstone and the bones of the damned',
  palette: PALETTE,
  backdrop: hex('#080202'),
  ink: INK,
  room,
  pois: hellPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'wizard',
  critter: { kind: 'imp', body: hex('#d2402a') }, // an imp
  finale: { colors: [[255, 211, 74]] }, // gold dust
  build: { colors: [hex('#241c2e'), hex('#4c2622'), hex('#d8d0b8'), hex('#e2b03a')], shape: 'statue' }, // obsidian, scorched rock and bone, crowned with gold
};
