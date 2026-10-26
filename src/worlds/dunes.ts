import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './dunes/decor.ts';
import { INK } from './dunes/kit.ts';
import { dunesPois, room } from './dunes/room.ts';
import { STATIONS } from './dunes/stations.ts';

// Dust Outpost: a drifters' bar and workshop in a drum of poured adobe
// under a ribbed steel dome, on a deck of sun-bleached planks; hard white
// daylight through slatted shutters, cold tube lamps, one warm lantern;
// barrels racked behind the bar, crates and scrap stacked two high, sand
// on the wind outside. In outlined cartoon (dark leather-brown ink): the
// shell in dunes/room.ts, the stations in dunes/stations.ts, the furniture
// in dunes/decor.ts, all drawn with the kit in dunes/kit.ts and
// dunes/bits.ts.

const PALETTE: Palette = {
  bg: hex('#1c140c'),
  wall: hex('#b29270'),
  wall2: hex('#8e7052'),
  floor: hex('#e6d3ae'),
  floor2: hex('#c2a57a'),
  text: hex('#f6e8cf'),
  dim: hex('#a8916f'),
  accent: hex('#3fb8a8'),
  accent2: hex('#c0582e'),
  panel: hex('#241a10'),
  panelText: hex('#f6e8cf'),
  border: hex('#9a6a3a'),
  bubble: hex('#fff6e6'),
  bubbleText: hex('#3a2a1a'),
  good: hex('#8fbf6a'),
  warn: hex('#e8b04a'),
  bad: hex('#d0583e'),
};

export const dunes: WorldDef = {
  id: 'dunes',
  name: 'Dust Outpost',
  tagline: 'Scrap walls, hide awnings and sand on the wind',
  palette: PALETTE,
  backdrop: hex('#170f08'),
  ink: INK,
  room,
  pois: dunesPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'drifter',
  critter: { kind: 'beetle', body: hex('#b4682c') }, // a sand beetle
  finale: { colors: [[226, 196, 140], [192, 88, 46], [63, 184, 168]] }, // sand, rust and turquoise confetti
  build: { colors: [hex('#c9a46c'), hex('#a8845a'), hex('#d9bf8f'), hex('#3fb8a8')], shape: 'pyramid' }, // a stone cairn of sandstone, crowned in turquoise
};
