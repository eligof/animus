import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './mines/decor.ts';
import { INK } from './mines/kit.ts';
import { minesPois, room } from './mines/room.ts';
import { STATIONS } from './mines/stations.ts';
import { WORKSTATION } from './mines/workstation.ts';

// The Mines: timbered shafts, coal seams and the glint of gold. A gallery
// cut from layered rock in outlined cartoon (coal-dust umber ink): the
// shell in mines/room.ts, the stations in mines/stations.ts, the gear on
// the floor in mines/decor.ts, all drawn with the kit in mines/kit.ts and
// mines/bits.ts.

const PALETTE: Palette = {
  bg: hex('#0a0705'),
  wall: hex('#1b140f'),
  wall2: hex('#211811'),
  floor: hex('#2b2118'),
  floor2: hex('#241b13'),
  text: hex('#ecd9b4'),
  dim: hex('#8c7556'),
  accent: hex('#f2b33d'),
  accent2: hex('#ff7b2e'),
  panel: hex('#120c08'),
  panelText: hex('#ecd9b4'),
  border: hex('#6e4b2a'),
  bubble: hex('#f4e7c9'),
  bubbleText: hex('#1c130b'),
  good: hex('#9ad46a'),
  warn: hex('#ffb13b'),
  bad: hex('#ff4f3a'),
};

export const mines: WorldDef = {
  id: 'mines',
  name: 'The Mines',
  tagline: 'Timbered shafts, coal seams and the glint of gold',
  palette: PALETTE,
  backdrop: hex('#060403'),
  ink: INK,
  room,
  pois: minesPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  costume: 'miner',
  critter: { kind: 'rat', body: hex('#8a7462') }, // a mine rat
  finale: { colors: [[255, 211, 74]] }, // gold dust
  build: { colors: [hex('#7a5230'), hex('#7d4a3a'), hex('#5b4a3c'), hex('#fff2c8')], shape: 'tower' }, // wood, brick and rock, crowned by a lamp
};
