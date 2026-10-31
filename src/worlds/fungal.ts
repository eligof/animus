import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import { DECOR } from './fungal/decor.ts';
import { INK } from './fungal/kit.ts';
import { NPCS } from './fungal/npcs.ts';
import { fungalPois, room } from './fungal/room.ts';
import { STATIONS } from './fungal/stations.ts';
import { WORKSTATION } from './fungal/workstation.ts';
import type { WorldDef } from './types.ts';

// Fungal Caverns: giant mushrooms, glowing spores and a pit of toxic sludge.
// The shell in fungal/room.ts, the stations in fungal/stations.ts, the
// things between them in fungal/decor.ts, each agent's desk in
// fungal/workstation.ts and the locals (a herbalist, a witch and a
// myconid) in fungal/npcs.ts, all drawn with the kit in fungal/kit.ts and
// fungal/bits.ts.

const PALETTE: Palette = {
  bg: hex('#07060a'),
  wall: hex('#16111d'),
  wall2: hex('#1b1524'),
  floor: hex('#221a2b'),
  floor2: hex('#1c1524'),
  text: hex('#d6f5e3'),
  dim: hex('#76938a'),
  accent: hex('#57e0b0'),
  accent2: hex('#c27cff'),
  panel: hex('#0d0a12'),
  panelText: hex('#d6f5e3'),
  border: hex('#4a3866'),
  bubble: hex('#e3f7ec'),
  bubbleText: hex('#151019'),
  good: hex('#8ee26a'),
  warn: hex('#e8c95a'),
  bad: hex('#ff5c7c'),
};

export const fungal: WorldDef = {
  id: 'fungal',
  name: 'Fungal Caverns',
  tagline: 'Giant mushrooms, glowing spores and a pit of toxic sludge',
  palette: PALETTE,
  backdrop: hex('#050307'),
  ink: INK,
  room,
  pois: fungalPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  npcs: NPCS,
  costume: 'forager',
  critter: { kind: 'slime', body: hex('#4fd8a8') }, // a glowing slime
  finale: { colors: [[255, 211, 74]] }, // gold dust
  build: { colors: [hex('#d8d0b8'), hex('#8a44a0'), hex('#4fd8a8')], shape: 'house' }, // bone and purple obsidian, crowned by glowing fungus
};
