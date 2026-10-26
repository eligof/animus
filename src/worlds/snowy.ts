import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import { DECOR } from './snowy/decor.ts';
import { INK } from './snowy/kit.ts';
import { room, snowyPois } from './snowy/room.ts';
import { STATIONS } from './snowy/stations.ts';
import { WORKSTATION } from './snowy/workstation.ts';
import type { WorldDef } from './types.ts';

// Snowy Depths: frozen falls, drifted snow and a pond iced over. A cavern in
// a glacier in outlined cartoon (night-navy ink), cold blues warmed by fire
// and lamplight: the shell in snowy/room.ts, the stations in
// snowy/stations.ts, the things between them in snowy/decor.ts, all drawn
// with the kit in snowy/kit.ts and snowy/bits.ts.

const PALETTE: Palette = {
  bg: hex('#06090e'),
  wall: hex('#16243a'),
  wall2: hex('#1a2a42'),
  floor: hex('#1f2a37'),
  floor2: hex('#19232f'),
  text: hex('#e2edf7'),
  dim: hex('#7b8ea5'),
  accent: hex('#8ed2ff'),
  accent2: hex('#ff9d4d'),
  panel: hex('#0b1018'),
  panelText: hex('#e2edf7'),
  border: hex('#3a5470'),
  bubble: hex('#eef6ff'),
  bubbleText: hex('#0f1722'),
  good: hex('#8fe3c0'),
  warn: hex('#ffc65c'),
  bad: hex('#ff5c4d'),
};

export const snowy: WorldDef = {
  id: 'snowy',
  name: 'Snowy Depths',
  tagline: 'Frozen falls, drifted snow and a pond iced over',
  palette: PALETTE,
  backdrop: hex('#04060a'),
  ink: INK,
  room,
  pois: snowyPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  costume: 'parka',
  critter: { kind: 'fox', body: hex('#eef3f8') }, // a snow fox
  finale: { colors: [[255, 211, 74]] }, // gold dust
  build: { colors: [hex('#c9d7e8'), hex('#74b6e6'), hex('#fff2c8')], shape: 'pyramid' }, // packed snow and ice, crowned by a lamp
};
