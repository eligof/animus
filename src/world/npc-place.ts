import type { NpcLook, NpcPlace } from '../worlds/types.ts';
import type { Facing } from './types.ts';

// Where a local stands, from its art (see NpcPlace): how far a standing
// one keeps everything off, where one behind its counter is cut, and which
// way it faces on screen.

// A standing local keeps this far from every footprint (units round its
// feet); the room planner keeps the floor that far round it clear.
export const NPC_R = 1.5;

// Where a local's picture is cut, units over its feet (none with nothing
// in front of it): where its counter's top, `top` high from its back edge
// at v = `edge`, crosses it on screen. The point of that edge in the
// local's own column of the screen stands `edge - v` along it as well as
// `edge - v` nearer, and the view drops half a unit down the screen for
// each (see worlds/types.ts): it shows `edge - v` lower in all.
export function cutOf(pl: NpcPlace): number | undefined {
  if (pl.mode === 'standing' || pl.top === undefined || pl.edge === undefined) return undefined;
  return pl.top - (pl.mode === 'seated' ? pl.z : 0) - (pl.edge - pl.v);
}

// Which way a local with look `look` faces on screen at a station backed
// onto (or built facing) `wall`: out (+v) and along (+u) are toward the
// viewer, its front to us, turned screen left or right by the wall's frame
// (+v is +y on the right wall, down the screen to the left; +x on the left
// wall, down to the right); back (-v) shows its back.
export function facingOf(wall: 'left' | 'right', look: NpcLook = 'out'): Facing {
  if (look === 'back') return { back: true, flip: wall === 'left' };
  return { back: false, flip: (look === 'out') === (wall === 'right') };
}
