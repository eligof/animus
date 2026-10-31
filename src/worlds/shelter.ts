import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './shelter/decor.ts';
import { INK } from './shelter/kit.ts';
import { NPCS } from './shelter/npcs.ts';
import { shelterPois, room } from './shelter/room.ts';
import { STATIONS } from './shelter/stations.ts';
import { WORKSTATION } from './shelter/workstation.ts';

// Atomic Shelter: a retro-atomic bunker under the wasteland in 1950s paint,
// teal and orange and cream over riveted steel and an ochre deck: a diner's
// corner, capsule lights, steam off the pipes and a jukebox, in outlined
// cartoon (dark green-grey ink): the shell in shelter/room.ts, the stations
// in shelter/stations.ts, the furniture in shelter/decor.ts, the locals in
// shelter/npcs.ts, all drawn with the kit in shelter/kit.ts and
// shelter/bits.ts.

const PALETTE: Palette = {
  bg: hex('#0b0f0e'),
  wall: hex('#8e9c9a'),
  wall2: hex('#6a7875'),
  floor: hex('#b08445'),
  floor2: hex('#8a6634'),
  text: hex('#eef2e4'),
  dim: hex('#8f9e98'),
  accent: hex('#f0892e'),
  accent2: hex('#3fb0a8'),
  panel: hex('#111816'),
  panelText: hex('#eef2e4'),
  border: hex('#3f7f78'),
  bubble: hex('#f6f4ea'),
  bubbleText: hex('#22302c'),
  good: hex('#7fe07a'),
  warn: hex('#f0b030'),
  bad: hex('#e05040'),
};

export const shelter: WorldDef = {
  id: 'shelter',
  name: 'Atomic Shelter',
  tagline: 'Riveted steel and a jukebox, deep under the wasteland',
  palette: PALETTE,
  backdrop: hex('#090c0a'),
  ink: INK,
  room,
  pois: shelterPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  npcs: NPCS,
  costume: 'jumpsuit',
  critter: { kind: 'rat', body: hex('#8f857a') }, // a shelter rat
  finale: { colors: [[63, 176, 168], [240, 137, 46], [239, 230, 204]] }, // teal, orange and cream confetti
  build: { colors: [hex('#8e9c9a'), hex('#3f9e9a'), hex('#e8833a'), hex('#7fe07a')], shape: 'machine' }, // a small reactor, steel and teal with orange and a green glow
};
