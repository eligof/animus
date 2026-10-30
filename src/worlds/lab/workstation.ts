import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { bulb, pilot, tube } from './bits.ts';
import type { Kit } from './kit.ts';
import { C, kitOf } from './kit.ts';

// Mad Science Lab's workstation (see WorkstationArt in ../types.ts): a lab
// bench with a green-screen terminal. A short bench of teal cupboards
// under a black resin top; right of the agent a chunky terminal, its deep
// beige case round the tube (the screen); at the left back a ring stand
// holding a round flask of fluid over a little burner, a rack of three
// test tubes in front of it; the right end kept clear for a desk upgrade.
// Looks: the flask's fluid green, magenta or blue. On: the fluid glows
// and the burner is lit.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const ZT = 5.85; // the resin top's surface
const FLUIDS: readonly Color[] = [C.green, C.magenta, C.blue];
// The terminal's beige, as the chemistry bench's.
const BEIGE = '#ddd5bd';
const BEIGE_BACK = '#c9c0a6';
// The terminal's case: u0..u1 along, its face at v = F, from the top to z1.
const CRT = { u0: 2.5, u1: 5.6, F: 1.45, z1: 9.8 };
// The flask on its ring stand.
const FLASK = { u: 0.8, v: 0.85, z: 6.9, R: 0.74 };

// The cupboards: a toe kick, the body, a drawer row and three doors with
// chrome pulls, the resin top over them.
function bench(k: Kit): void {
  k.box(0.4, 0.4, 0, DESK.len - 0.8, 2.1, 0.45, C.iron, { line: k.thin, stripe: false });
  k.box(0.15, 0.15, 0.45, DESK.len - 0.3, 2.5, ZT - 0.9, C.tealDark, { stripe: false });
  const F = 2.65;
  const door = k.side(C.cabinet, 0, 1);
  for (const [u0, u1] of [[0.35, 2.3], [2.45, 4.55], [4.7, 6.65]] as const) {
    k.face(u0, u1, F, 0.7, 3.95, door, k.thin, 0.1);
    k.face(u0, u1, F, 4.15, 4.8, door, k.thin, 0.1);
    const m = (u0 + u1) / 2;
    k.rod([[m - 0.35, F + 0.08, 4.48], [m + 0.35, F + 0.08, 4.48]], C.chrome, 0.12);
    const pu = u0 < 2 ? u1 - 0.3 : u0 + 0.3;
    k.rod([[pu, F + 0.08, 3.5], [pu, F + 0.08, 2.75]], C.chrome, 0.12);
  }
  k.box(0, 0, ZT - 0.45, DESK.len, DESK.dep, 0.45, C.resin);
}

// The terminal: a deep beige case, its tapering back, the tube's dark rim
// round the screen, vents, a knob and its pilot light; the keyboard.
function terminal(k: Kit, on: boolean): void {
  const { u0, u1, F, z1 } = CRT;
  k.box(u0 + 0.4, 0.1, ZT + 0.3, u1 - u0 - 0.8, 0.7, z1 - ZT - 1.1, BEIGE_BACK, { stripe: false });
  k.box(u0, 0.8, ZT, u1 - u0, F - 0.8, z1 - ZT, BEIGE, { round: 0.25 });
  // the tube's rim, a little bigger than the screen, its corners rounded
  k.poly([[2.65, F, 6.45], [5.45, F, 6.45], [5.45, F, 9.55], [2.65, F, 9.55]], '#1d2a26', k.thin, 0.45);
  // under the tube: vents, a knob and the pilot light
  if (k.fine) for (let i = 0; i < 4; i++) k.line([[2.9 + i * 0.3, F + 0.01, 6.02], [2.9 + i * 0.3, F + 0.01, 6.28]], shade(BEIGE, -0.3), Math.max(0.7, 0.07 * k.s));
  k.dot(4.6, F + 0.01, 6.15, Math.max(1, 0.13 * k.s), BEIGE_BACK, k.thin * 0.7);
  pilot(k, 5.15, F + 0.01, 6.15, 0.11, C.greenGlow, on);
  // the keyboard in front of it
  k.box(2.7, F + 0.25, ZT, 2.7, 0.6, 0.25, BEIGE, { line: k.thin });
  if (k.fine) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 8; j++) {
        const [x, y] = k.p(2.88 + j * 0.3, F + 0.42 + i * 0.22, ZT + 0.26);
        pen.moveTo(x, y);
        pen.lineTo(x + 0.15 * k.s, y + 0.075 * k.s);
      }
    }
    pen.strokeStyle = '#9a917a';
    pen.lineWidth = Math.max(0.6, 0.1 * k.s);
    pen.stroke();
  }
}

// The ring stand: its plate and rod, a burner under the flask, the round
// flask clamped by its neck; fluid of the look's colour, glowing when on.
function flask(k: Kit, fluid: Color, on: boolean): void {
  const { u, v, z, R } = FLASK;
  k.box(0.2, 0.2, ZT, 1.4, 1.2, 0.16, C.iron, { line: k.thin, stripe: false });
  k.rod([[0.4, 0.4, ZT], [0.4, 0.4, 9.75]], C.steel, 0.16);
  // the burner, its flame lit while the screen is on
  k.cyl(u, v, ZT + 0.16, 0.3, 0.2, C.iron, { line: k.thin });
  k.cyl(u, v, ZT + 0.36, 0.12, 0.45, C.brass, { line: k.thin });
  if (on) {
    k.poly([[u - 0.13, v, ZT + 0.82], [u, v, ZT + 1.12], [u + 0.13, v, ZT + 0.82]], C.blue, 0, 0.3);
    k.halo(u, v, ZT + 0.95, 0.5, C.arc, 0.4);
  }
  // the ring under the bulb, on its arm from the rod
  k.rod([[0.4, 0.4, z + 0.25], [u - 0.55, v - 0.1, z + 0.25]], C.steelDark, 0.12);
  if (on) k.halo(u, v, z + R, R * 2.4, fluid, 0.32);
  bulb(k, u, v, z, R, 0.75, fluid, 0.55);
  const e = k.ell(u, v, z + 0.25, R * 0.95);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
  k.paint(null, Math.max(1.2, 0.14 * k.s), C.steelDark);
  // the clamp on its neck
  k.rod([[0.4, 0.4, z + 2 * R + 0.3], [u, v, z + 2 * R + 0.3]], C.steelDark, 0.12);
  k.cyl(u, v, z + 2 * R + 0.2, 0.28, 0.2, C.steelDark, { line: k.thin });
}

// A rack of three test tubes in front of the stand.
function rack(k: Kit, fluid: Color): void {
  const fills: readonly Color[] = [C.amber, fluid, C.violet];
  const [u0, u1, v0] = [0.3, 1.65, 1.8];
  k.box(u0, v0, ZT, u1 - u0, 0.5, 0.16, C.wood, { line: k.thin, stripe: false });
  k.box(u0, v0 + 0.15, ZT + 0.16, 0.12, 0.2, 0.5, C.woodDark, { line: k.thin, stripe: false });
  fills.forEach((c, i) => tube(k, 0.62 + i * 0.36, v0 + 0.25, ZT + 0.12, 1.55, c, 0.72));
  k.box(u0, v0, ZT + 0.66, u1 - u0, 0.5, 0.13, C.wood, { line: k.thin, stripe: false });
  k.box(u1 - 0.12, v0 + 0.15, ZT + 0.16, 0.12, 0.2, 0.5, C.woodDark, { line: k.thin, stripe: false });
}

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const fluid = FLUIDS[v.seed % 3];
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    bench(k);
    flask(k, fluid, v.active);
    rack(k, fluid);
    terminal(k, v.active);
  },
  // the tube's glass, inside its rim
  screen: [
    [2.8, CRT.F, 6.6],
    [5.3, CRT.F, 6.6],
    [5.3, CRT.F, 9.4],
    [2.8, CRT.F, 9.4],
  ],
  // the top's right end, beside the terminal, clear of the agent
  top: [6.3, 0.75, ZT],
};
