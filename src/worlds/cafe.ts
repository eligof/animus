import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './cafe/decor.ts';
import { INK } from './cafe/kit.ts';
import { NPCS } from './cafe/npcs.ts';
import { cafePois, room } from './cafe/room.ts';
import { STATIONS } from './cafe/stations.ts';
import { WORKSTATION } from './cafe/workstation.ts';

// Cozy Café: rain on the windows, espresso and a cat by the fire. A corner
// café on a wet evening in outlined cartoon (espresso-brown ink): the shell
// in cafe/room.ts, the stations in cafe/stations.ts, the furniture in
// cafe/decor.ts, its locals in cafe/npcs.ts, all drawn with the kit in
// cafe/kit.ts and cafe/bits.ts.

const PALETTE: Palette = {
  bg: hex('#1a120d'),
  wall: hex('#ead9bb'),
  wall2: hex('#d9c3a0'),
  floor: hex('#a36a3c'),
  floor2: hex('#8a5a33'),
  text: hex('#f4e8d4'),
  dim: hex('#a88d74'),
  accent: hex('#e0a84a'),
  accent2: hex('#c8663f'),
  panel: hex('#24180f'),
  panelText: hex('#f4e8d4'),
  border: hex('#9a6a44'),
  bubble: hex('#fff7ea'),
  bubbleText: hex('#3b2a1e'),
  good: hex('#8fbf7a'),
  warn: hex('#e8a94e'),
  bad: hex('#d0583e'),
};

export const cafe: WorldDef = {
  id: 'cafe',
  name: 'Cozy Café',
  tagline: 'Rain on the windows, espresso and a cat by the fire',
  palette: PALETTE,
  backdrop: hex('#140d09'),
  ink: INK,
  room,
  pois: cafePois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  npcs: NPCS,
  costume: 'casual',
  critter: { kind: 'cat', body: hex('#e8913a') }, // a ginger cat
  finale: { colors: [[244, 236, 220], [226, 204, 170], [250, 250, 244]] }, // paper confetti
  build: { colors: [hex('#d98f45'), hex('#efe2c0'), hex('#a5583c'), hex('#fff2c8')], shape: 'house' }, // caramel, cream and brick, crowned by a lamp
};
