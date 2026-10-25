import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './station/decor.ts';
import { INK } from './station/kit.ts';
import { room, stationPois } from './station/room.ts';
import { STATIONS } from './station/stations.ts';

// Orbital Station: a cosy deck in orbit, a planet turning past the glass.
// A crew deck in outlined cartoon (deep navy ink): the shell in
// station/room.ts (the planet turning in the viewport is its overlay), the
// stations in station/stations.ts, the furniture in station/decor.ts, all
// drawn with the kit in station/kit.ts and station/bits.ts.

const PALETTE: Palette = {
  bg: hex('#05070d'),
  wall: hex('#1b2436'),
  wall2: hex('#212b3f'),
  floor: hex('#36435a'),
  floor2: hex('#252f42'),
  text: hex('#e6eef9'),
  dim: hex('#7686a0'),
  accent: hex('#ff9a3c'),
  accent2: hex('#4cc6ff'),
  panel: hex('#0a101c'),
  panelText: hex('#d8e5f4'),
  border: hex('#3d6fa8'),
  bubble: hex('#edf4ff'),
  bubbleText: hex('#0d1726'),
  good: hex('#5ee08f'),
  warn: hex('#ffb238'),
  bad: hex('#ff5468'),
};

export const station: WorldDef = {
  id: 'station',
  name: 'Orbital Station',
  tagline: 'A cosy deck in orbit, a planet turning past the glass',
  palette: PALETTE,
  backdrop: hex('#03050b'),
  ink: INK,
  room,
  pois: stationPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'astronaut',
  critter: { kind: 'drone', body: hex('#d8dee6') }, // a maintenance drone
  finale: { colors: [[160, 230, 255], [240, 250, 255], [255, 210, 140]] }, // sparks drifting in low gravity
  build: { colors: [hex('#8f9bb0'), hex('#e2e8f0'), hex('#f08a3a'), hex('#7fe0ff')], shape: 'machine' }, // hull metal, white panels and orange trim, crowned by a screen
};
