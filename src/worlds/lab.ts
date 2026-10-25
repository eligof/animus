import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './lab/decor.ts';
import { INK } from './lab/kit.ts';
import { labPois, room } from './lab/room.ts';
import { STATIONS } from './lab/stations.ts';

// Mad Science Lab: bubbling flasks, a tesla coil and a very busy chalkboard.
// A tiled laboratory on a stormy night in outlined cartoon (deep teal ink):
// the shell in lab/room.ts, the stations in lab/stations.ts, the furniture
// in lab/decor.ts, all drawn with the kit in lab/kit.ts and lab/bits.ts.

const PALETTE: Palette = {
  bg: hex('#0b191e'),
  wall: hex('#d9e4e8'),
  wall2: hex('#c3d3d8'),
  floor: hex('#9fb2b9'),
  floor2: hex('#8a9ea6'),
  text: hex('#e6f3f2'),
  dim: hex('#7d979d'),
  accent: hex('#22c7b8'),
  accent2: hex('#ff8a3d'),
  panel: hex('#0f262c'),
  panelText: hex('#eaf6f4'),
  border: hex('#2a9d8f'),
  bubble: hex('#ffffff'),
  bubbleText: hex('#12343b'),
  good: hex('#3ddc97'),
  warn: hex('#ffa53d'),
  bad: hex('#ff4d5a'),
};

export const lab: WorldDef = {
  id: 'lab',
  name: 'Mad Science Lab',
  tagline: 'Bubbling flasks, a tesla coil and a very busy chalkboard',
  palette: PALETTE,
  backdrop: hex('#0b1a20'),
  ink: INK,
  room,
  pois: labPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'scientist',
  critter: { kind: 'rat', body: hex('#eeeae4') }, // a lab rat
  finale: { colors: [[214, 255, 240], [150, 240, 214], [200, 230, 255]] }, // foam
  build: { colors: [hex('#6f7884'), hex('#bfe8ff'), hex('#24a596'), hex('#7fe0ff')], shape: 'machine' }, // metal, glass and teal plastic, crowned by a screen
};
