import { contactShadow, hexOf, ink as inkFrom, inkWidth, isoBox, mix, shade } from '../art/iso.ts';
import { DESK } from '../world/desks.ts';
import { hashString, Rng } from '../world/rng.ts';
import type { Clutter, P3, PropView, WorkstationArt, WorldDef } from './types.ts';

// The plain workstation, for a world that has not drawn its own (see
// WorldDef.workstation): a desk on four legs with a monitor and a
// keyboard, in the world's colours and ink. Its screen faces the agent,
// right of where it stands; a desk upgrade stands at the desk's far right
// end, at the back, past the monitor (clear of the agent at work).

export function plainWorkstation(w: Pick<WorldDef, 'palette' | 'ink'>): WorkstationArt {
  const p = w.palette;
  const ink = w.ink ?? inkFrom(hexOf(p.floor));
  const wood = mix(hexOf(p.border), hexOf(p.wall2), 0.35);
  const dark = shade(wood, -0.28);
  const case_ = mix(hexOf(p.panel), '#3b404c', 0.5);
  const draw = (v: PropView) => {
    const { pen, at } = v;
    const box = (u0: number, v0: number, z0: number, du: number, dv: number, dz: number, base: string, stripe = true) => isoBox(pen, at, u0, v0, z0, du, dv, dz, base, { ink, line: inkWidth(v.s), stripe });
    contactShadow(pen, at, DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.6, DESK.dep / 2 + 0.6, 0.28);
    for (const [u, w2] of [[0.35, 0.3], [6.15, 0.3], [0.35, 2.2], [6.15, 2.2]] as const) box(u, w2, 0, 0.5, 0.5, 5.3, dark, false);
    box(0.4, 0.15, 2, 6.2, 0.3, 3.3, dark, false); // the modesty panel
    box(0, 0, 5.3, DESK.len, DESK.dep, 0.8, wood);
    // the monitor on its stand, its screen toward the agent
    box(3.65, 0.75, 6.1, 0.6, 0.45, 0.9, case_, false);
    box(2.6, 0.5, 6.8, 2.7, 0.4, 3.1, case_);
    // the keyboard, in front of the agent
    box(0.9, 1.7, 6.1, 2.6, 0.9, 0.22, shade(case_, 0.25), false);
  };
  return {
    len: DESK.len,
    dep: DESK.dep,
    height: 9.9,
    draw,
    // the monitor's front face, inside its bezel
    screen: [
      [2.8, 0.9, 7.0],
      [5.1, 0.9, 7.0],
      [5.1, 0.9, 9.7],
      [2.8, 0.9, 9.7],
    ],
    top: [6.4, 0.6, 6.1],
  };
}

// A world's workstation: its own, or the plain one in its colours (made
// once a world).
const plain = new WeakMap<WorldDef, WorkstationArt>();
export function workstationOf(w: WorldDef): WorkstationArt {
  if (w.workstation) return w.workstation;
  let art = plain.get(w);
  if (!art) plain.set(w, (art = plainWorkstation(w)));
  return art;
}

// What stands on the top of place `place`'s workstation in world `w`: 2 to
// 4 (fewer if it has fewer) of its clutter on as many of its spots (`spot`: which), picked by the
// world's id and the place, so a desk keeps its things while it stands and
// its neighbours have others; far to near (the order to draw them). None
// where the world has none.
export type OnTop = { item: Clutter; at: P3; spot: number };
export function clutterOf(w: WorldDef, place: number): OnTop[] {
  const c = workstationOf(w).clutter;
  if (!c || !c.items.length || !c.spots.length) return [];
  const rng = new Rng(hashString(`${w.id}#${place}`));
  const n = Math.min(rng.int(2, 4), c.items.length, c.spots.length);
  const items = shuffle(c.items.map((_, k) => k), rng).slice(0, n);
  const spots = shuffle(c.spots.map((_, k) => k), rng).slice(0, n);
  return items.map((k, j) => ({ item: c.items[k], at: c.spots[spots[j]], spot: spots[j] })).sort((a, b) => a.at[0] + a.at[1] - (b.at[0] + b.at[1]));
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
