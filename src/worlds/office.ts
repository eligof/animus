import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './office/decor.ts';
import { INK } from './office/kit.ts';
import { officePois, room } from './office/room.ts';
import { STATIONS } from './office/stations.ts';
import { WORKSTATION } from './office/workstation.ts';

// The Startup: a startup's loft, exposed brick and big black-framed windows
// onto the city, polished concrete with a warm wood-plank corner, standing
// desks, a kanban board and an espresso machine that never sleeps, and an
// office dog, in outlined cartoon (dark warm-brown ink): the shell in
// office/room.ts, the stations in office/stations.ts, the furniture in
// office/decor.ts, all drawn with the kit in office/kit.ts and
// office/bits.ts. No company's logo, product or brand anywhere.

const PALETTE: Palette = {
  bg: hex('#141110'),
  wall: hex('#a85a42'),
  wall2: hex('#80412f'),
  floor: hex('#aaa7a0'),
  floor2: hex('#8a8780'),
  text: hex('#f6f1e8'),
  dim: hex('#a6a096'),
  accent: hex('#ffc857'),
  accent2: hex('#4ecdc4'),
  panel: hex('#1b1715'),
  panelText: hex('#f6f1e8'),
  border: hex('#6e5c4e'),
  bubble: hex('#fbf8f2'),
  bubbleText: hex('#2a2420'),
  good: hex('#7ad97a'),
  warn: hex('#ffb347'),
  bad: hex('#ff6b6b'),
};

export const office: WorldDef = {
  id: 'office',
  name: 'The Startup',
  tagline: 'Exposed brick, standing desks and an espresso machine that never sleeps',
  palette: PALETTE,
  backdrop: hex('#121012'),
  ink: INK,
  room,
  pois: officePois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  costume: 'startup',
  critter: { kind: 'corgi', body: hex('#d98a3c') }, // the office dog, a red corgi
  finale: { colors: [[255, 107, 107], [255, 200, 87], [78, 205, 196], [167, 139, 250]] }, // coral, sunflower, teal and lilac confetti
  build: { colors: [hex('#c9a46c'), hex('#a47a46'), hex('#ffc857'), hex('#4ecdc4')], shape: 'tower' }, // a trophy shelf: pale wood, gold cups, a teal ribbon
};
