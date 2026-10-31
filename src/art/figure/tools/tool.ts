import type { Costume } from '../../../world/character.ts';
import { COSTUMES } from '../../../world/character.ts';
import type { Look } from '../look.ts';
import type { Sketch } from '../paint.ts';

// A tool in hand (see ./index.ts), drawn in its own frame: origin at the
// hand that holds it (or where the rig puts it), +x the way it points, in
// figure units (a figure is 14 tall). `v` is its pose's value for it (a
// page turning over, 0 to 1; a strike landing, 1; a screen's page, 0 or
// 1); `back` is true seen from behind, where its working face still shows
// over the shoulder, so `back` is only for what differs. `name` is the
// design's (see the table in test/tools.test.ts).
export type Tool = { name: string; draw(sk: Sketch, v: number, L: Look, back: boolean): void };

// What a costume holds for each kind of work: the write pose's surface and
// writer, and the read, run, search and web poses' one tool each.
export type Slot = 'surface' | 'writer' | 'read' | 'run' | 'search' | 'web';

// Where each slot's tools stay (units, in their own frame), so the
// figure's box holds every pose with any of them.
export const ENVELOPE: Record<Slot, { x0: number; x1: number; y0: number; y1: number }> = {
  surface: { x0: -1.6, x1: 1.6, y0: -1.7, y1: 1.7 },
  writer: { x0: -0.8, x1: 2.8, y0: -0.7, y1: 0.7 },
  read: { x0: -2.6, x1: 2.6, y0: -1.9, y1: 1.9 },
  run: { x0: -1.0, x1: 4.8, y0: -2.2, y1: 2.2 },
  search: { x0: -1.0, x1: 4.0, y0: -2.6, y1: 2.0 },
  web: { x0: -2.8, x1: 2.8, y0: -2.8, y1: 2.8 },
};

// One tool for every costume (a grip's file puts each world's own over it).
export const everyone = (t: Tool): Record<Costume, Tool> => Object.fromEntries(COSTUMES.map((c) => [c, t])) as Record<Costume, Tool>;

export const TAU = Math.PI * 2;
// Colours the tools share.
export const WHITE = '#ffffff';
export const PAGE = '#fbf4e4';
export const PAGE_D = '#e3d6bd';
export const COVER = '#a3543f';
export const WOOD = '#b07a48';
export const WOOD_D = '#875a33';
export const METAL = '#9aa3b2';
export const METAL_D = '#727b8b';
export const BRASS = '#d4a94c';
export const SCREEN = '#a8e8ff';
export const SLATE = '#2c3140';
