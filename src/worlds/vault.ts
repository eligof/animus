import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './vault/decor.ts';
import { INK } from './vault/kit.ts';
import { NPCS } from './vault/npcs.ts';
import { room, vaultPois } from './vault/room.ts';
import { STATIONS } from './vault/stations.ts';
import { WORKSTATION } from './vault/workstation.ts';

// The Vault: deposit boxes, gold under amber lamps and acid in the pit. An
// old bank vault in outlined cartoon (gunmetal ink): gold and amber against
// cool steel, over a floor of warm marble. The shell in vault/room.ts (deposit banks, gold niches, the
// great round door), the stations in vault/stations.ts, the furniture in
// vault/decor.ts, its locals in vault/npcs.ts, all drawn with the kit in
// vault/kit.ts and vault/bits.ts.

const PALETTE: Palette = {
  bg: hex('#08090a'),
  wall: hex('#56606c'), // the riveted steel
  wall2: hex('#3a414b'),
  floor: hex('#5f5951'), // the warm marble
  floor2: hex('#4c4741'),
  text: hex('#e8eaec'),
  dim: hex('#868c92'),
  accent: hex('#ffb347'),
  accent2: hex('#e8c547'),
  panel: hex('#0c0d0f'),
  panelText: hex('#e8eaec'),
  border: hex('#4c5258'),
  bubble: hex('#eef0f2'),
  bubbleText: hex('#121315'),
  good: hex('#9ad46a'),
  warn: hex('#e8c547'),
  bad: hex('#ff5a4a'),
};

export const vault: WorldDef = {
  id: 'vault',
  name: 'The Vault',
  tagline: 'Deposit boxes, gold under amber lamps and acid in the pit',
  palette: PALETTE,
  backdrop: hex('#05070b'),
  ink: INK,
  room,
  pois: vaultPois,
  stations: STATIONS,
  decor: DECOR,
  workstation: WORKSTATION,
  npcs: NPCS,
  // Cold steel in a cool evening, so the amber lamps and the gold warm
  // what they light; at night (after hours) only the gold niches, the acid,
  // the melting pot and the monitors are left on.
  ambient: { tint: [120, 128, 160], strength: 0.15, figures: 0.4 },
  costume: 'guard',
  critter: { kind: 'drone', body: hex('#a9b3bf') }, // a security drone
  finale: { colors: [[255, 211, 74]] }, // gold dust
  build: { colors: [hex('#6f7884'), hex('#1e2023'), hex('#ffb84a')], shape: 'machine' }, // steel and black iron, crowned by an amber light
};
