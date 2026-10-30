// Workstations as pictures (see world/desks.ts and Stage): the world's own
// (or the plain one, see worlds/workstation.ts) drawn in its frame at a
// scale, each picture drawn once and kept, keyed by what it shows, all of
// them anchored at the desk's back corner on the floor:
//
//   body     the desk, the clutter its place picked (see clutterOf), lamps
//            lit while its screen is on: placed again for free while it
//            stands;
//   screen   what the shared activity layer paints on its screen (see
//            art/screen.ts), one per activity, shared by every desk: a
//            change of activity sends only this;
//   loop     a frame of something that moves while its agent works (see
//            WorkstationArt.loops), one per frame, shared by every desk.
//
// Popping up or shrinking away it grows out of the floor in POP_STEPS
// steps, each one picture of all of it (body, screen and its loops' still
// frames), without its clutter (it comes with the full size), so the steps
// are shared by every desk of the world.

import type { DeskFrame } from '../../world/frame.ts';
import { toWorld } from '../../world/room.ts';
import type { DeskLoop, P3, PropView, WorkstationArt, WorldDef } from '../../worlds/types.ts';
import { clutterOf, workstationOf, type OnTop } from '../../worlds/workstation.ts';
import { Canvas } from '../canvas.ts';
import type { At } from '../iso.ts';
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
const stepOf = (grow: number) => Math.max(0, Math.min(POP_STEPS, Math.round(grow * POP_STEPS)));
// Still growing out of the floor (or shrinking into it): all in one picture.
export const popping = (grow: number) => stepOf(grow) < POP_STEPS;

// Room round the box for its shadow and its ink, in units.
const PAD = 2;
// Pictures kept, least recently used out first past either bound. (In
// tinted worlds the scene also keeps a tinted copy of each picture.)
const MAX = 1024;
const MAX_BYTES = 48 << 20;
const cache = new Map<string, DeskSprite>();
let bytes = 0;
export const deskStats = { hits: 0, misses: 0 };

// Each workstation art a number of its own for the keys (a world's art is
// one object; a test may hand in another under the same world id).
const arts = new WeakMap<WorkstationArt, number>();
let serial = 0;
function artKey(a: WorkstationArt): number {
  let n = arts.get(a);
  if (n === undefined) arts.set(a, (n = ++serial));
  return n;
}

// A picture by its key: kept, or drawn by `make` and kept.
function kept(key: string, make: () => DeskSprite): DeskSprite {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    deskStats.hits++;
    return hit;
  }
  deskStats.misses++;
  const sp = make();
  cache.set(key, sp);
  bytes += sp.img.data.length;
  while (cache.size > MAX || bytes > MAX_BYTES) {
    const [k, old] = cache.entries().next().value as [string, DeskSprite];
    cache.delete(k);
    bytes -= old.img.data.length;
  }
  return sp;
}

// A picture of part of workstation `art` in `wall`'s frame at scale s,
// grown by g about the middle of its footprint: `draw` paints it through
// `at` (the frame's units to the canvas). Cropped to what it painted,
// anchored at the back corner.
function picture(art: WorkstationArt, wall: 'left' | 'right', g: number, s: number, draw: (pen: Canvas, at: At) => void): DeskSprite {
  const cu = art.len / 2;
  const cv = art.dep / 2;
  const place = { wall, x0: 0, y0: 0 };
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
  draw(c, (u, v, z) => {
    const [x, y] = rel(u, v, z);
    return [x + ox, y + oy];
  });
  const crop = cropped(c);
  return crop ? { img: crop.img, ax: ox - crop.x, ay: oy - crop.y } : { img: new Canvas(1, 1), ax: 0, ay: 0 };
}

// The clutter a place picked (see clutterOf) and its part of the body's
// key, worked out once a place for each workstation art, not every frame.
// The pick hangs on the world's id too, so that is kept to check (a test
// may hand in one art under two ids). It keeps 256 places an art at most,
// starting again past that.
type Picked = { id: string; pick: OnTop[]; key: string };
const NONE: Picked = { id: '', pick: [], key: '' };
const picks = new WeakMap<WorkstationArt, Map<number, Picked>>();
function pickedAt(world: WorldDef, art: WorkstationArt, place: number): Picked {
  let m = picks.get(art);
  if (!m) picks.set(art, (m = new Map()));
  let p = m.get(place);
  if (!p || p.id !== world.id) {
    const pick = clutterOf(world, place);
    if (m.size >= 256) m.clear();
    m.set(place, (p = { id: world.id, pick, key: pick.map((c) => `${c.item.name}@${c.spot}`).join() }));
  }
  return p;
}

const viewOf = (art: WorkstationArt, pen: Canvas, at: At, s: number, wall: 'left' | 'right', active: boolean, seed: number): PropView => ({ pen, s, at, len: art.len, dep: art.dep, wall, island: true, t: 0, active, seed });

// The body of workstation d of `world` at scale s in ink `ink` (popping,
// all of it).
export function deskSprite(world: WorldDef, d: Pick<DeskFrame, 'id' | 'wall' | 'screen' | 'grow' | 'seed'>, s: number, ink: string): DeskSprite {
  const art = workstationOf(world);
  const step = stepOf(d.grow);
  const pop = step < POP_STEPS;
  const on = d.screen !== 'off';
  const { pick, key: pk } = pop ? NONE : pickedAt(world, art, d.id);
  const key = `b|${artKey(art)}|${ink}|${d.wall}|${d.seed}|${pop ? d.screen : on ? 'on' : 'off'}|${pk}|${step}|${s}`;
  return kept(key, () => {
    const g = growth(d.grow);
    return picture(art, d.wall, g, s, (pen, at) => {
      if (!step) return;
      const v = viewOf(art, pen, at, s * g, d.wall, on, d.seed);
      pen.save();
      art.draw(v);
      pen.restore();
      for (const c of pick) {
        pen.save();
        c.item.draw(v, c.at);
        pen.restore();
      }
      if (!pop) return;
      for (const lp of art.loops ?? []) {
        pen.save();
        lp.draw({ ...v, seed: 0 }, 0);
        pen.restore();
      }
      drawScreen(pen, at, art.screen, d.screen, ink);
    });
  });
}

// The screen of a workstation of `world` grown to its size: what its agent
// is doing.
export function screenSprite(world: WorldDef, d: Pick<DeskFrame, 'wall' | 'screen'>, s: number, ink: string): DeskSprite {
  const art = workstationOf(world);
  return kept(`s|${artKey(art)}|${ink}|${d.wall}|${d.screen}|${s}`, () => picture(art, d.wall, 1, s, (pen, at) => drawScreen(pen, at, art.screen, d.screen, ink)));
}

// Frame i of loop k of the workstation of `world`, lit or not, grown to
// its size.
export function loopSprite(world: WorldDef, k: number, i: number, on: boolean, wall: 'left' | 'right', s: number, ink: string): DeskSprite {
  const art = workstationOf(world);
  return kept(`l|${artKey(art)}|${ink}|${wall}|${k}|${i}|${on ? 1 : 0}|${s}`, () =>
    picture(art, wall, 1, s, (pen, at) => {
      const lp = art.loops?.[k];
      if (!lp) return;
      pen.save();
      lp.draw(viewOf(art, pen, at, s, wall, on, 0), i);
      pen.restore();
    }),
  );
}

// The frame loop k (`lp`) of desk `id` shows at scene time t: running
// while its screen is on, each desk a step of its own along it (neighbours
// do not flicker in step); the still one, 0, while it is off.
export function loopFrame(lp: DeskLoop, k: number, id: number, on: boolean, t: number): number {
  if (!on) return 0;
  const lag = (((id + 1) * 0.618 + k * 0.29) % 1) * lp.frames;
  return Math.floor(t * lp.fps + lag) % lp.frames;
}

// Workstation d's pictures as the scene places them at time t, back to
// front: the body and the screen share its box, so they are drawn in this
// order (see depth.ts); the loops are points at their anchors (`at`, in the
// desk's frame) and sort among what stands on the desk; `sortAs` says the
// picture is sorted by the body's box and picture. Each with its
// layer's id and whether it was drawn just now.
export type DeskPicture = { id: string; sp: DeskSprite; fresh: boolean; at?: P3; sortAs?: 'body' };
export function deskPictures(world: WorldDef, d: DeskFrame, t: number, s: number, ink: string): DeskPicture[] {
  const out: DeskPicture[] = [];
  const add = (id: string, make: () => DeskSprite, at?: P3, sortAs?: 'body') => {
    const m = deskStats.misses;
    const sp = make();
    out.push({ id, sp, fresh: deskStats.misses > m, at, sortAs });
  };
  add(`desk:${d.id}`, () => deskSprite(world, d, s, ink));
  if (popping(d.grow)) return out;
  const on = d.screen !== 'off';
  add(`screen:${d.id}`, () => screenSprite(world, d, s, ink), undefined, 'body');
  (workstationOf(world).loops ?? []).forEach((lp, k) => add(`loop:${d.id}:${k}`, () => loopSprite(world, k, loopFrame(lp, k, d.id, on, t), on, d.wall, s, ink), lp.at));
  return out;
}
