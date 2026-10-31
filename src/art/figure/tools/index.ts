import type { Costume } from '../../../world/character.ts';
import type { PropKind } from '../rig.ts';
import { READS } from './read.ts';
import { RUNS } from './run.ts';
import { SEARCHES } from './search.ts';
import type { Slot, Tool } from './tool.ts';
import { WEBS } from './web.ts';
import { SURFACES, WRITERS } from './write.ts';

export { ENVELOPE } from './tool.ts';
export type { Slot, Tool } from './tool.ts';

// The work poses' tools, a costume's own (its world's, see each grip's
// file): the rig names the slot a held prop fills (its kind), the costume
// what fills it. The wizard keeps the first five ever drawn.
export const SLOT_OF: Partial<Record<PropKind, Slot>> = { notepad: 'surface', pencil: 'writer', book: 'read', mallet: 'run', magnifier: 'search', tablet: 'web' };
const BY_SLOT: Record<Slot, Record<Costume, Tool>> = { surface: SURFACES, writer: WRITERS, read: READS, run: RUNS, search: SEARCHES, web: WEBS };

export function toolOf(c: Costume, slot: Slot): Tool {
  return BY_SLOT[slot][c];
}
