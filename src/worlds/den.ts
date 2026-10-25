import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './den/decor.ts';
import { INK } from './den/kit.ts';
import { denPois, room } from './den/room.ts';
import { STATIONS } from './den/stations.ts';

// Hacker's Den: green rain on the walls, servers humming, pizza going cold.

const PALETTE: Palette = {
  bg: hex('#020403'),
  wall: hex('#0a110c'),
  wall2: hex('#0c140e'),
  floor: hex('#1a1d1b'),
  floor2: hex('#161917'),
  text: hex('#b8ffc8'),
  dim: hex('#3f7a52'),
  accent: hex('#39ff6e'),
  accent2: hex('#ffb000'),
  panel: hex('#06100a'),
  panelText: hex('#b8ffc8'),
  border: hex('#1f8f45'),
  bubble: hex('#d4ffdc'),
  bubbleText: hex('#04180a'),
  good: hex('#39ff6e'),
  warn: hex('#ffb000'),
  bad: hex('#ff2a8a'),
};

export const den: WorldDef = {
  id: 'den',
  name: "Hacker's Den",
  tagline: 'Green rain on the walls, servers humming, pizza going cold',
  palette: PALETTE,
  backdrop: hex('#020403'),
  ink: INK,
  room,
  pois: denPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'hacker',
  critter: { kind: 'cat', body: hex('#2b2b33') }, // a black cat
  finale: { colors: [[90, 255, 130], [40, 200, 90], [200, 255, 210]] }, // green bits
  build: { colors: [hex('#6a736f'), hex('#8f8a72'), hex('#7fe0ff')], shape: 'tower' }, // gunmetal and beige plastic, crowned by a screen
};
