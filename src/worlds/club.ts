import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './club/decor.ts';
import { INK } from './club/kit.ts';
import { clubPois } from './club/plan.ts';
import { room } from './club/room.ts';
import { STATIONS } from './club/stations.ts';
import { NPCS } from './club/npcs.ts';
import { WORKSTATION } from './club/workstation.ts';

// Underground Club: neon on brick, a floor that lights up and 120 BPM till
// dawn. A brick basement in outlined cartoon (aubergine ink): the shell in
// club/room.ts and club/walls.ts (signs in club/signs.ts), what goes where
// in club/plan.ts, the stations in club/stations.ts, the furniture in
// club/decor.ts, all drawn with the kit in club/kit.ts and club/bits.ts.

const PALETTE: Palette = {
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

export const club: WorldDef = {
  id: 'club',
  name: 'Underground Club',
  tagline: 'Neon on brick, a floor that lights up and 120 BPM till dawn',
  palette: PALETTE,
  backdrop: hex('#07040c'),
  ink: INK,
  room,
  pois: clubPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  npcs: NPCS,
  costume: 'raver',
  critter: { kind: 'cat', body: hex('#8a7aa8') }, // a grey cat
  finale: { colors: [[255, 60, 190], [60, 240, 255], [120, 255, 120], [190, 110, 255]] }, // confetti
  build: { colors: [hex('#7d7a92'), hex('#25212e'), hex('#ff5cbc')], shape: 'tower' }, // steel and black plastic, crowned by pink neon
};
