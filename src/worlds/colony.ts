import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './colony/decor.ts';
import { INK } from './colony/kit.ts';
import { colonyPois, room } from './colony/room.ts';
import { STATIONS } from './colony/stations.ts';
import { WORKSTATION } from './colony/workstation.ts';

// Frontier Colony: stone and planks under a big sky, a campfire and a husky,
// in outlined cartoon (dark earth-brown ink), after the frontier colony
// games: plain cut stone walls, a floor zoned plank, tile and stone, neat
// stockpiles and a room full of the colony's things. The shell in
// colony/room.ts, the stations in colony/stations.ts, the furniture in
// colony/decor.ts, all drawn with the kit in colony/kit.ts and
// colony/bits.ts.

const PALETTE: Palette = {
  bg: hex('#11130c'),
  wall: hex('#8e7f6a'),
  wall2: hex('#776a57'),
  floor: hex('#a2623a'),
  floor2: hex('#7e4526'),
  text: hex('#f2ead8'),
  dim: hex('#a39a80'),
  accent: hex('#7cc04a'),
  accent2: hex('#6aaee0'),
  panel: hex('#1a1a10'),
  panelText: hex('#f2ead8'),
  border: hex('#7a6a44'),
  bubble: hex('#fbf7ec'),
  bubbleText: hex('#2f2a1c'),
  good: hex('#7cc04a'),
  warn: hex('#e8b04a'),
  bad: hex('#d0583e'),
};

export const colony: WorldDef = {
  id: 'colony',
  name: 'Frontier Colony',
  tagline: 'Stone and planks under a big sky, a campfire and a husky',
  palette: PALETTE,
  backdrop: hex('#0e100a'),
  ink: INK,
  room,
  pois: colonyPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  costume: 'colonist',
  critter: { kind: 'husky', body: hex('#8a929e') }, // a husky
  finale: { colors: [[124, 192, 74], [140, 98, 58], [106, 174, 224]] }, // grass green, wood brown and sky blue confetti
  build: { colors: [hex('#8c623a'), hex('#6e4a2a'), hex('#a8a090'), hex('#7cc04a')], shape: 'house' }, // a log cabin with a stone chimney and a green roof
};
