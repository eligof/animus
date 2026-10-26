import { contactShadow, hexOf, ink as inkFrom, inkWidth, isoBox, mix, shade } from '../art/iso.ts';
import { DESK } from '../world/desks.ts';
import type { PropView, WorkstationArt, WorldDef } from './types.ts';

// The plain workstation, for a world that has not drawn its own (see
// WorldDef.workstation): a desk on four legs with a monitor and a
// keyboard, in the world's colours and ink. Its screen faces the agent,
// right of where it stands; a desk upgrade stands at the desk's left end,
// behind the keyboard.

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
    box(4.15, 0.75, 6.1, 0.6, 0.45, 0.9, case_, false);
    box(2.75, 0.5, 6.8, 3.4, 0.4, 3.1, case_);
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
      [2.95, 0.9, 7.0],
      [5.95, 0.9, 7.0],
      [5.95, 0.9, 9.7],
      [2.95, 0.9, 9.7],
    ],
    top: [1.1, 0.9, 6.1],
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
