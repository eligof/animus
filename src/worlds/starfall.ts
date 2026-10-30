import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './starfall/decor.ts';
import { INK } from './starfall/kit.ts';
import { starfallPois, room } from './starfall/room.ts';
import { STATIONS } from './starfall/stations.ts';
import { WORKSTATION } from './starfall/workstation.ts';

// Starfall Base: a prefab base on a bright strange planet, grey modules
// with orange trim and blue lights, one wall glass onto a pink sky with two
// moons and the other its working side, in outlined cartoon (deep violet
// ink): the shell in starfall/room.ts, the stations in
// starfall/stations.ts, the furniture in starfall/decor.ts, all drawn with
// the kit in starfall/kit.ts and starfall/bits.ts.

const PALETTE: Palette = {
  bg: hex('#140a1c'),
  wall: hex('#d9e2ec'),
  wall2: hex('#aebccc'),
  floor: hex('#8a96a8'),
  floor2: hex('#6f7b8e'),
  text: hex('#f2ecff'),
  dim: hex('#9a8fb4'),
  accent: hex('#ff4fa3'),
  accent2: hex('#38d9e8'),
  panel: hex('#1c1028'),
  panelText: hex('#f2ecff'),
  border: hex('#7a54b8'),
  bubble: hex('#fbf6ff'),
  bubbleText: hex('#2a1a3a'),
  good: hex('#5fe0a0'),
  warn: hex('#ffc04a'),
  bad: hex('#ff5d6c'),
};

export const starfall: WorldDef = {
  id: 'starfall',
  name: 'Starfall Base',
  tagline: 'Two moons over a pink sky, strange flora past the glass',
  palette: PALETTE,
  backdrop: hex('#12081a'),
  ink: INK,
  room,
  pois: starfallPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  costume: 'exosuit',
  critter: { kind: 'hopper', body: hex('#b07ef0') }, // a fluffy hopper
  finale: { colors: [[255, 79, 163], [56, 217, 232], [255, 200, 74]] }, // magenta, cyan and gold confetti
  build: { colors: [hex('#d9e2ec'), hex('#aebccc'), hex('#ff4fa3'), hex('#38d9e8')], shape: 'tower' }, // a signal beacon, white with magenta and cyan lights
};
