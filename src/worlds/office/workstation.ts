import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { mug } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf, withAlpha } from './kit.ts';

// The Startup's workstation (see WorkstationArt in ../types.ts): a standing desk with a monitor.
// A white top on a black steel frame, its two legs telescoped up to
// standing height on wide feet, its controller under the front edge; one
// thin monitor on an arm off a pole at the right; a plain keyboard and
// mouse in front of the agent; a balance board pushed under the front.
// Drawn once a scale, frame, look and screen, and kept: it never looks at
// v.t; v.active (its screen on) lights the controller's LED; v.seed (0, 1
// or 2) picks what sits at its right end: a white mug, a closed laptop or
// a few notebooks. The shared activity layer paints over `screen`; a desk
// upgrade stands at `top`, at the back of its right end (nothing of its
// own there).

// The top's surface; the monitor's black panel round its screen.
const TOP = 6.0;
const MON = { u0: 2.5, u1: 5.05, v0: 0.6, v1: 0.9, z0: 6.6, z1: 9.65 };
const PANEL = '#25272c';

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the frame: a wide foot along v under each leg, the legs in two
    // stages, a beam between them under the top
    const leg = (u: number) => {
      k.box(u - 0.35, 0.2, 0, 0.7, 2.6, 0.3, C.steel, { line: k.thin });
      k.box(u - 0.38, 1.1, 0.3, 0.76, 0.76, 2.9, C.steel, { line: k.thin, stripe: false });
      k.box(u - 0.28, 1.2, 3.2, 0.56, 0.56, TOP - 0.4 - 3.2, C.steelLight, { line: k.thin, stripe: false });
    };
    leg(1.0);
    k.box(1.3, 1.28, TOP - 1.0, 4.4, 0.4, 0.6, C.steel, { line: k.thin, stripe: false });
    leg(6.0);
    // a balance board pushed under the front: a birch deck on its roller
    k.shadow(2.2, 2.35, 1.5, 0.6, 0.22);
    k.box(1.85, 2.0, 0, 0.7, 0.7, 0.36, C.fabricA, { round: 0.25, line: k.thin });
    k.box(0.9, 1.9, 0.36, 2.6, 0.95, 0.18, C.birch, { line: k.thin });
    k.poly([[1.1, 2.05, 0.55], [3.3, 2.05, 0.55], [3.3, 2.7, 0.55], [1.1, 2.7, 0.55]], C.steel, 0);
    // the top: white, its edge picked out in birch
    k.box(0, 0, TOP - 0.4, DESK.len, DESK.dep, 0.4, C.white, { left: C.birch, right: shade(C.birch, -0.15) });
    // the monitor's pole, clamped to the back edge at the right, and its arm
    k.box(5.15, 0.1, TOP, 0.55, 0.55, 0.3, C.steel, { line: k.thin, stripe: false });
    k.rod([[5.42, 0.38, TOP + 0.3], [5.42, 0.38, 8.5]], C.steel, 0.24);
    k.rod([[5.42, 0.38, 8.2], [4.6, 0.45, 8.2]], C.steel, 0.2);
    // the controller under the front edge, its LED lit while at work
    k.box(5.0, 2.55, TOP - 0.78, 1.1, 0.42, 0.38, C.steel, { line: k.thin * 0.8, stripe: false });
    const n = 2.98;
    if (k.fine) for (const u of [5.25, 5.5]) k.face(u, n, TOP - 0.59, 0.08, C.steelLight, 0, 10);
    k.face(5.82, n, TOP - 0.59, 0.1, v.active ? '#7dff9a' : '#2f4a37', 0, 10);
    if (v.active) k.halo(5.82, n, TOP - 0.59, 0.5, C.leafLight, 0.55);
    // the monitor: a thin black panel on the arm, its screen to the front
    k.box(MON.u0, MON.v0, MON.z0, MON.u1 - MON.u0, MON.v1 - MON.v0, MON.z1 - MON.z0, PANEL, { round: 0.12, stripe: false });
    // the keyboard and the mouse
    k.box(0.65, 1.7, TOP, 2.8, 0.85, 0.16, '#e3e6ea', { line: k.thin });
    if (k.fine) {
      const keys: Array<[P3, P3]> = [];
      for (const w of [1.9, 2.15, 2.4]) keys.push([[0.85, w, TOP + 0.17], [3.25, w, TOP + 0.17]]);
      k.segs(keys, withAlpha('#9aa0a8', 0.9), 0.09 * k.s);
    }
    k.box(3.85, 1.95, TOP, 0.45, 0.68, 0.18, '#e3e6ea', { line: k.thin, round: 0.2 });
    // at the right end, one of three things
    end(k, look);
  },
  // the monitor's glass, inside its bezel
  screen: [
    [2.65, MON.v1, 6.8],
    [4.9, MON.v1, 6.8],
    [4.9, MON.v1, 9.5],
    [2.65, MON.v1, 9.5],
  ],
  // the right end's back corner, clear of the agent and the screen
  top: [6.5, 0.5, TOP],
};

// What sits at the right end: a white mug (0), a closed laptop, its lid
// plain (1), or a short stack of notebooks (2).
function end(k: Kit, look: number): void {
  if (look === 0) {
    mug(k, 6.1, 2.4, TOP, C.white, 0.34);
  } else if (look === 1) {
    k.box(4.4, 1.65, TOP, 2.1, 1.25, 0.12, C.steelLight, { line: k.thin });
    k.box(4.4, 1.65, TOP + 0.12, 2.1, 1.25, 0.1, C.chrome, { line: k.thin });
  } else {
    const books: ReadonlyArray<readonly [number, number, number, number, string]> = [[4.6, 1.7, 1.7, 1.2, C.table], [4.85, 1.85, 1.45, 1.0, C.fabricA], [4.7, 1.75, 1.4, 1.05, C.chartWarm]];
    books.forEach(([u, w, du, dv, c], i) => k.box(u, w, TOP + i * 0.22, du, dv, 0.22, c, { line: k.thin, top: shade(c, 0.12) }));
  }
}
