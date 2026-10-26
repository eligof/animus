import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './meadhall/decor.ts';
import { INK } from './meadhall/kit.ts';
import { meadhallPois, room } from './meadhall/room.ts';
import { STATIONS } from './meadhall/stations.ts';
import { WORKSTATION } from './meadhall/workstation.ts';

// Longhall: a great timber hall at night, carved posts and crimson swags on
// plank walls over a fieldstone footing, long banners and small lattice
// windows onto falling snow high above, a stone-rimmed hearth against a
// wall and runners on dark flagstones, in outlined cartoon (smoky brown
// ink): the shell in meadhall/room.ts, the stations in meadhall/stations.ts,
// the furniture in meadhall/decor.ts, all drawn with the kit in
// meadhall/kit.ts and meadhall/bits.ts.

const PALETTE: Palette = {
  bg: hex('#120c08'),
  wall: hex('#7a5634'),
  wall2: hex('#553a22'),
  floor: hex('#4d473c'),
  floor2: hex('#3e3a31'),
  text: hex('#f1e4cc'),
  dim: hex('#a08c74'),
  accent: hex('#f0a040'),
  accent2: hex('#bfd8e8'),
  panel: hex('#1a120c'),
  panelText: hex('#f1e4cc'),
  border: hex('#a9814f'),
  bubble: hex('#fff4e2'),
  bubbleText: hex('#3a2618'),
  good: hex('#8fbf7a'),
  warn: hex('#e8a94e'),
  bad: hex('#c8503a'),
};

export const meadhall: WorldDef = {
  id: 'meadhall',
  name: 'Longhall',
  tagline: 'Firelight on carved timber, snow at the high windows, mead on the long table',
  palette: PALETTE,
  backdrop: hex('#0e0907'),
  ink: INK,
  room,
  pois: meadhallPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  costume: 'nord',
  critter: { kind: 'fox', body: hex('#d9772e') }, // a fox
  finale: { colors: [[240, 120, 40], [245, 197, 66], [150, 200, 235]] }, // ember, gold and frost-blue confetti
  build: { colors: [hex('#8a8f96'), hex('#6b7077'), hex('#a8adb3'), hex('#f0a040')], shape: 'statue' }, // a carved stone warrior, an ember at its heart
};
