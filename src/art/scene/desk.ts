// Workstations as pictures (see world/desks.ts and Stage): the world's own
// (or the plain one, see worlds/workstation.ts) drawn in its frame at a
// scale, its screen showing what its agent is doing (the shared layer, see
// art/screen.ts), grown out of the floor to a step of its pop. Each is
// drawn once and kept, keyed by everything it shows, so a workstation
// standing still costs only a placement, and one that goes up or down
// costs POP_STEPS small pictures, shared by every workstation in the room.

import type { DeskFrame } from '../../world/frame.ts';
import { toWorld } from '../../world/room.ts';
import type { WorldDef } from '../../worlds/types.ts';
import { workstationOf } from '../../worlds/workstation.ts';
import { Canvas } from '../canvas.ts';
import { drawScreen } from '../screen.ts';
import { cropped } from './pixels.ts';

// A picture and its anchor: where the workstation's back corner on the
// floor falls in it.
export type DeskSprite = { img: Canvas; ax: number; ay: number };

// A pop in this many steps (each its own picture), and how much a step
// grows it: out of the floor, a little past its size, and back.
export const POP_STEPS = 5;
export function growth(grow: number): number {
  const t = Math.max(0, Math.min(1, Math.round(grow * POP_STEPS) / POP_STEPS)) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
}

// Room round the box for its shadow and its ink, in units.
const PAD = 2;
const MAX = 256;
const cache = new Map<string, DeskSprite>();
export const deskStats = { hits: 0, misses: 0 };

// Workstation `d` of `world` at scale s in ink `ink`.
export function deskSprite(world: WorldDef, d: Pick<DeskFrame, 'wall' | 'screen' | 'grow' | 'seed'>, s: number, ink: string): DeskSprite {
  const step = Math.max(0, Math.min(POP_STEPS, Math.round(d.grow * POP_STEPS)));
  const key = `${world.id}|${ink}|${d.wall}|${d.seed}|${d.screen}|${step}|${s}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    deskStats.hits++;
    return hit;
  }
  deskStats.misses++;
  const art = workstationOf(world);
  const g = growth(d.grow);
  const cu = art.len / 2;
  const cv = art.dep / 2;
  // Its frame grown by g about the middle of its footprint, projected with
  // its back corner at the origin.
  const place = { wall: d.wall, x0: 0, y0: 0 };
  const rel = (u: number, v: number, z: number): [number, number] => {
    const [x, y, zz] = toWorld(place, cu + (u - cu) * g, cv + (v - cv) * g, z * g);
    return [(x - y) * s, ((x + y) * s) / 2 - zz * s];
  };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const u of [-PAD, art.len + PAD]) {
    for (const v of [-PAD, art.dep + PAD]) {
      for (const z of [0, art.height + PAD]) {
        const [x, y] = rel(u, v, z);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const ox = Math.ceil(-x0);
  const oy = Math.ceil(-y0);
  const c = new Canvas(Math.max(1, Math.ceil(x1 + ox) + 1), Math.max(1, Math.ceil(y1 + oy) + 1));
  const at = (u: number, v: number, z: number): [number, number] => {
    const [x, y] = rel(u, v, z);
    return [x + ox, y + oy];
  };
  if (step > 0) {
    c.save();
    art.draw({ pen: c, s: s * g, at, len: art.len, dep: art.dep, wall: d.wall, island: true, t: 0, active: d.screen !== 'off', seed: d.seed });
    c.restore();
    drawScreen(c, at, art.screen, d.screen, ink);
  }
  const crop = cropped(c);
  const sp: DeskSprite = crop ? { img: crop.img, ax: ox - crop.x, ay: oy - crop.y } : { img: new Canvas(1, 1), ax: 0, ay: 0 };
  cache.set(key, sp);
  if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
  return sp;
}
