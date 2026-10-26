import type { WorldDef } from './types.ts';
import { mines } from './mines.ts';
import { lab } from './lab.ts';
import { club } from './club.ts';
import { den } from './den.ts';
import { station } from './station.ts';
import { cafe } from './cafe.ts';
import { fungal } from './fungal.ts';
import { snowy } from './snowy.ts';
import { vault } from './vault.ts';
import { hell } from './hell.ts';
import { dunes } from './dunes.ts';
import { meadhall } from './meadhall.ts';
import { starfall } from './starfall.ts';
import { shelter } from './shelter.ts';
import { colony } from './colony.ts';
import { office } from './office.ts';

// Every world, in picker order; the first is the default. The digit keys
// reach the first ten; the rest only `t` / `T` and the picker.
export const WORLDS: readonly WorldDef[] = [mines, lab, club, den, station, cafe, fungal, snowy, vault, hell, dunes, meadhall, starfall, shelter, colony, office];
