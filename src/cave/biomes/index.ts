import type { Biome } from '../types.ts';
import { mines } from './mines.ts';
import { fungal } from './fungal.ts';
import { snowy } from './snowy.ts';
import { vault } from './vault.ts';
import { hell } from './hell.ts';

// Every scene preset, in picker order; the first is the default.
export const BIOMES: readonly Biome[] = [mines, fungal, snowy, vault, hell];
