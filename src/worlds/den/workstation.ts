import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { cable, can, droop, duck, fillPts, ring } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, CANS, kitOf, withAlpha } from './kit.ts';

// Hacker's Den's workstation (see WorkstationArt in ../types.ts): a compact battlestation.
// A dark wood desk on black steel legs, one monitor on a short stand
// right of where the agent stands, a keyboard with a glowing underside and
// a mouse on a mat in front of the agent, an energy drink at the right end
// and a rubber duck at the left; under the right end a tower with two fans
// in its front. Drawn once a scale, frame, look and screen, and kept: it
// never looks at v.t; v.active (its screen on) lights the keyboard and the
// fans; v.seed (0, 1 or 2) picks their colour: green, magenta or cyan.
// The shared activity layer paints over `screen`; a desk upgrade stands at
// `top`, at the back of its right end (nothing of its own there).

// The desk's top surface; the monitor's body round its screen.
const TOP = 5.6;
const MON = { u0: 2.48, u1: 5.07, v0: 0.55, v1: 0.9, z0: 6.42, z1: 9.65 };
const GLOW: readonly Color[] = [C.green, C.magenta, C.cyan];

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const glow = GLOW[((v.seed % 3) + 3) % 3];
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the monitor's cable down the back leg to the floor
    cable(k, droop([3.65, 0.25, TOP - 0.4], [5.0, 0.25, 0.3], 0.8, 6), '#1c2226', 0.14);
    // black steel legs, a rail between each end's pair and one along the back
    const legs: ReadonlyArray<readonly [number, number]> = [[0.3, 0.3], [6.3, 0.3], [0.3, 2.3], [6.3, 2.3]];
    const leg = (u: number, w: number) => k.box(u, w, 0, 0.42, 0.42, TOP - 0.5, C.black, { line: k.thin, stripe: false });
    for (const [u, w] of legs.slice(0, 2)) leg(u, w);
    k.box(0.72, 0.38, TOP - 1.3, 5.58, 0.28, 0.5, C.charcoal, { line: k.thin, stripe: false });
    // the tower under the right end, its glass side to the room and two
    // fans in its front that glow the look's colour while the screen is on
    k.box(4.75, 0.7, 0, 1.4, 1.85, 3.3, C.graphite);
    k.poly([[6.16, 0.9, 0.35], [6.16, 2.35, 0.35], [6.16, 2.35, 3.0], [6.16, 0.9, 3.0]], '#0e1416', k.thin);
    for (const z of [1.05, 2.3]) {
      const fan: P3 = [5.45, 2.56, z];
      const rim = ring(k, fan, [0, 1, 0], 0.46, 16);
      fillPts(k, rim, v.active ? shade(glow, -0.55) : '#151c1e', k.thin * 0.7);
      // its hub's ring of light
      fillPts(k, ring(k, fan, [0, 1, 0], 0.3, 12), null, 0);
      k.pen.strokeStyle = v.active ? glow : shade(glow, -0.62);
      k.pen.lineWidth = Math.max(1, 0.1 * k.s);
      k.pen.stroke();
      k.dot(...fan, 0.1, v.active ? glow : shade(glow, -0.6));
      if (v.active) k.halo(...fan, 0.8, glow, 0.25);
    }
    for (const u of [0.38, 6.38]) k.box(u, 0.72, 0.5, 0.26, 1.58, 0.32, C.charcoal, { line: k.thin, stripe: false });
    for (const [u, w] of legs.slice(2)) leg(u, w);
    // the top: dark wood, its edge a shade darker
    k.box(0, 0, TOP - 0.5, DESK.len, DESK.dep, 0.5, C.desk, { top: C.deskTop });
    // a dark mat under the keyboard and the mouse, its front edge picked
    // out in the look's colour
    const zm = TOP + 0.01;
    k.poly([[0.5, 1.45, zm], [4.8, 1.45, zm], [4.8, 2.8, zm], [0.5, 2.8, zm]], '#1a1f22', k.thin * 0.7, 0.25);
    k.line([[0.65, 2.68, zm + 0.01], [4.65, 2.68, zm + 0.01]], withAlpha(glow, v.active ? 0.7 : 0.3), Math.max(0.6, 0.07 * k.s));
    // the monitor: a short neck on a flat foot, one wide black panel
    k.box(3.07, 0.25, TOP, 1.4, 1.05, 0.14, C.black, { line: k.thin, round: 0.2 });
    k.box(3.57, 0.3, TOP + 0.1, 0.4, 0.3, 1.1, C.charcoal, { line: k.thin, stripe: false });
    k.box(MON.u0, MON.v0, MON.z0, MON.u1 - MON.u0, MON.v1 - MON.v0, MON.z1 - MON.z0, C.black, { round: 0.12, stripe: false });
    // a thin chin under the glass, darker
    k.rect(MON.u0 + 0.15, MON.z0 + 0.06, MON.u1 - 0.15, MON.z0 + 0.2, MON.v1 + 0.005, C.graphite);
    // the keyboard, lit from under its front edge while the screen is on
    const kb = { u0: 0.8, u1: 3.5, v0: 1.7, v1: 2.55, h: 0.24 };
    if (v.active) {
      k.pool((kb.u0 + kb.u1) / 2, kb.v1, 1.7, 0.5, glow, 0.55, zm);
      k.halo((kb.u0 + kb.u1) / 2, kb.v1 + 0.1, zm + 0.2, 1.3, glow, 0.22);
    }
    k.box(kb.u0, kb.v0, zm, kb.u1 - kb.u0, kb.v1 - kb.v0, kb.h, C.graphite, { line: k.thin, round: 0.08 });
    const under: P3[] = [[kb.u0 + 0.1, kb.v1 + 0.02, zm + 0.04], [kb.u1 - 0.1, kb.v1 + 0.02, zm + 0.04]];
    k.line(under, v.active ? glow : shade(glow, -0.6), Math.max(1, 0.12 * k.s));
    if (k.fine) {
      // the keys: three rows of caps, a space bar
      const pen = k.pen;
      const zk = zm + kb.h + 0.005;
      pen.beginPath();
      for (let r = 0; r < 3; r++) {
        for (let i = 0; i < 10; i++) {
          const u = kb.u0 + 0.14 + i * 0.25;
          const w = kb.v0 + 0.1 + r * 0.2;
          k.trace([[u, w, zk], [u + 0.18, w, zk], [u + 0.18, w + 0.14, zk], [u, w + 0.14, zk]]);
        }
      }
      k.trace([[kb.u0 + 0.8, kb.v0 + 0.68, zk], [kb.u1 - 0.9, kb.v0 + 0.68, zk], [kb.u1 - 0.9, kb.v0 + 0.8, zk], [kb.u0 + 0.8, kb.v0 + 0.8, zk]]);
      pen.fillStyle = v.active ? shade(glow, -0.25) : '#3d454b';
      pen.fill();
    }
    // the mouse, a dot of the glow on its back
    k.box(3.95, 1.95, zm, 0.48, 0.7, 0.22, C.graphite, { line: k.thin, round: 0.22 });
    k.dot(4.19, 2.15, zm + 0.23, 0.07, v.active ? glow : shade(glow, -0.55));
    // an energy drink at the right end, a rubber duck at the left
    can(k, 6.35, 2.4, TOP, CANS[3], 0.3);
    duck(k, 0.75, 2.35, TOP, 0.42);
  },
  // the monitor's glass, inside its bezel
  screen: [
    [2.65, MON.v1, 6.65],
    [4.9, MON.v1, 6.65],
    [4.9, MON.v1, 9.45],
    [2.65, MON.v1, 9.45],
  ],
  // the right end's back corner, clear of the agent and the screen
  top: [6.5, 0.5, TOP],
};
