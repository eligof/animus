import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import type { Quad } from './bits.ts';
import { fillPts, hull, mug, on, sprouts } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, kitOf } from './kit.ts';

// Orbital Station's workstation (see WorkstationArt in ../types.ts): a console pod.
// A white console on a single navy pedestal, its deck sloping down toward
// the agent with a row of round buttons and a trackball, a flat shelf
// behind it; its screen canted back on a short steel arm over the right
// of the deck, and a chrome handrail round the left end. On the right end
// a little bracket holds one of its looks: a mug in a clip, a tablet in a
// sleeve, or a potted sprout under a dome. Drawn once a scale, frame, look
// and screen, and kept: it never looks at v.t; v.active (its screen on)
// lights the buttons; v.seed (0, 1 or 2) picks the look. The shared
// activity layer paints over `screen`; a desk upgrade stands at `top`, on
// the shelf at its right end (nothing of its own there).

// The console's body, end to end along u (the profile below, the same at
// every u): the shelf at the back, the deck sloping to the front lip.
const U0 = 0.7;
const U1 = 6.2;
const BODY = { back: 0.3, front: 2.8, bottom: 3.9, lip: 5.2, shelf: 6.0, edge: 1.3 };
// The screen, canted back.
const SCREEN: Quad = [
  [2.8, 1.2, 6.75],
  [4.95, 1.2, 6.75],
  [4.95, 0.95, 9.45],
  [2.8, 0.95, 9.45],
];
const BUTTONS: readonly Color[] = [C.orange, C.cyan, C.green, C.orange, C.cyan];

// A point on the deck: g = 0 at its front lip, 1 at the shelf's edge.
const deck = (u: number, g: number): P3 => [u, BODY.front - (BODY.front - BODY.edge) * g, BODY.lip + (BODY.shelf - BODY.lip) * g];

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the pedestal: a rounded foot, one navy column with an orange band
    k.box(2.3, 0.45, 0, 2.6, 2.1, 0.35, C.hullDark, { round: 0.3, line: k.thin });
    k.box(2.95, 0.85, 0.35, 1.3, 1.3, BODY.bottom - 0.35, C.hull, { stripe: false });
    k.line([[2.97, 2.16, 3.0], [4.26, 2.16, 3.0], [4.26, 0.87, 3.0]], C.orange, Math.max(1, 0.22 * k.s));
    // the handrail round the left end, behind the body
    rail(k);
    // the body
    body(k);
    // the screen's short arm off the shelf, then its canted housing
    k.box(3.58, 0.5, BODY.shelf, 0.6, 0.45, 0.5, C.steelDark, { line: k.thin, stripe: false });
    k.rod([[3.88, 0.72, BODY.shelf + 0.4], [3.88, 0.72, 7.4]], C.steel, 0.22);
    housing(k);
    // the trackball and the row of buttons on the deck, right of the agent
    const [tx, ty] = k.p(...deck(5.75, 0.5));
    k.pen.beginPath();
    k.pen.ellipse(tx, ty, 0.5 * k.s, 0.36 * k.s, 0, 0, Math.PI * 2);
    k.paint(C.steelDark, k.thin);
    k.pen.beginPath();
    k.pen.arc(tx, ty - 0.12 * k.s, Math.max(1.2, 0.34 * k.s), 0, Math.PI * 2);
    k.paint('#9fb3c8', k.thin);
    BUTTONS.forEach((c, i) => {
      const [x, y] = k.p(...deck(3.1 + i * 0.5, 0.5));
      const r = Math.max(1, 0.21 * k.s);
      k.pen.beginPath();
      k.pen.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
      k.paint(v.active ? mix(c, '#ffffff', 0.2) : shade(c, -0.5), k.thin * 0.7);
      if (v.active) {
        k.halo(...deck(3.1 + i * 0.5, 0.5), 0.45, c, 0.35);
        if (k.fine) {
          k.pen.beginPath();
          k.pen.arc(x - r * 0.3, y - r * 0.25, Math.max(0.6, r * 0.3), 0, Math.PI * 2);
          k.pen.fillStyle = '#ffffff';
          k.pen.fill();
        }
      }
    });
    // the right end's bracket and the look it holds
    bracket(k, look);
  },
  screen: SCREEN,
  // the shelf's right end, clear of the agent and the screen
  top: [6.5, 0.5, BODY.shelf],
};

// The body: white, a navy control panel let into its deck, its +u end a
// grey panel; an orange stripe of livery along the front; inked round its
// silhouette.
function body(k: Kit): void {
  const { back, front, bottom, lip, shelf, edge } = BODY;
  const end: P3[] = [[U1, back, bottom], [U1, front, bottom], [U1, front, lip], [U1, edge, shelf], [U1, back, shelf]];
  const face: P3[] = [[U0, front, bottom], [U1, front, bottom], [U1, front, lip], [U0, front, lip]];
  const slope: P3[] = [[U0, front, lip], [U1, front, lip], [U1, edge, shelf], [U0, edge, shelf]];
  const top: P3[] = [[U0, edge, shelf], [U1, edge, shelf], [U1, back, shelf], [U0, back, shelf]];
  k.poly(face, k.side(C.white, 0, 1), k.thin);
  k.poly(end, k.side(C.panel, 1, 0), k.thin);
  k.poly(slope, shade(C.white, 0.04), k.thin);
  k.poly(top, C.shell, k.thin);
  // the navy control panel let into the deck
  const panel: P3[] = [deck(U0 + 0.3, 0.18), deck(U1 - 0.2, 0.18), deck(U1 - 0.2, 0.82), deck(U0 + 0.3, 0.82)];
  k.poly(panel, k.lgrad(panel[0], panel[3], [1, 0, 0], [[0, '#2b3754'], [1, '#3a4766']]), k.thin, 0.15);
  // a white lip along the deck's front edge, the livery stripe under it
  k.line([[U0 + 0.05, front, lip - 0.02], [U1 - 0.05, front, lip - 0.02]], '#f6f8fb', Math.max(1, 0.18 * k.s));
  k.line([[U0 + 0.1, front + 0.01, 4.45], [U1, front + 0.01, 4.45], [U1 + 0.01, back + 0.1, 4.45]], C.orange, Math.max(1, 0.3 * k.s));
  if (k.fine) {
    // a vent in the front, a seam across the end
    for (const z of [4.0, 4.15]) k.line([[U0 + 3.2, front + 0.01, z], [U0 + 4.6, front + 0.01, z]], C.steel, Math.max(0.6, 0.07 * k.s));
    k.line([[U1 + 0.01, edge, shelf - 0.05], [U1 + 0.01, edge, bottom + 0.1]], shade(C.panel, -0.15), Math.max(0.6, 0.06 * k.s));
  }
  const pts: Pt[] = [];
  for (const q of [end, face, slope, top]) for (const p of q) pts.push(k.p(...p));
  fillPts(k, hull(pts), null, k.lw);
}

// The chrome handrail: a bar along the left end on two standoffs.
function rail(k: Kit): void {
  const z = 5.45;
  k.rod([[U0, 0.55, z - 0.2], [0.3, 0.55, z], [0.3, 2.55, z], [U0, 2.55, z - 0.35]], C.chrome, 0.2);
}

// The screen's housing: a white slab canted back, its face a white bezel
// round the glass with a thin navy edge.
function housing(k: Kit): void {
  const q = SCREEN;
  const shell: Quad = [on(q, -0.1, -0.1), on(q, 1.1, -0.1), on(q, 1.1, 1.1), on(q, -0.1, 1.1)];
  const bez: Quad = [on(q, -0.015, -0.02), on(q, 1.015, -0.02), on(q, 1.015, 1.02), on(q, -0.015, 1.02)];
  // back along the slab's normal: up the slope, into the console
  const back = shell.map(([u, w, z]) => [u, w - 0.32, z - 0.06] as P3);
  // the +u end and the top edge, then the face
  k.poly([shell[1], back[1], back[2], shell[2]], k.side(C.panel, 1, 0), k.thin);
  k.poly([shell[3], shell[2], back[2], back[3]], C.shell, k.thin);
  k.poly([...shell], k.side(C.white, 0, 1), k.thin, 0.15);
  k.poly([...bez], C.navy, 0, 0.08);
  const pts: Pt[] = [...shell, ...back].map((p) => k.p(...p));
  fillPts(k, hull(pts), null, k.lw);
}

// The bracket on the right end, and on it: a mug in a clip (0), a tablet
// in a sleeve (1), or a potted sprout under a dome (2).
function bracket(k: Kit, look: number): void {
  const z = 4.7;
  if (look === 1) {
    // a tablet standing in a fabric sleeve hung on the end panel, its
    // glass to the room
    k.box(6.25, 1.25, 4.4, 0.22, 1.0, 1.65, '#3a4766', { line: k.thin, round: 0.08, stripe: false });
    k.poly([[6.48, 1.35, 5.0], [6.48, 2.15, 5.0], [6.48, 2.15, 5.92], [6.48, 1.35, 5.92]], C.screenMid, 0);
    k.box(U1, 1.1, 4.2, 0.42, 1.3, 0.9, C.blanket, { line: k.thin, round: 0.08, stripe: false });
    return;
  }
  // a little shelf off the end, on a steel strut
  k.rod([[U1, 1.7, 3.9], [6.65, 1.7, z - 0.05]], C.steel, 0.12);
  k.box(U1, 1.15, z - 0.12, 0.75, 1.1, 0.12, C.steelDark, { line: k.thin, stripe: false });
  if (look === 0) {
    // a mug, clipped in by a steel ring
    mug(k, 6.55, 1.7, z, C.orange, 0.28);
    k.cyl(6.55, 1.7, z, 0.33, 0.16, C.steel, { line: k.thin });
  } else {
    // a pot, a sprout, a glass dome over them
    k.cyl(6.58, 1.7, z, 0.3, 0.35, C.white, { line: k.thin });
    k.disc(6.58, 1.7, z + 0.33, 0.24, C.soil, 0);
    sprouts(k, 6.58, 1.7, z + 0.35, 4, 0.75, 9, [C.leaf, C.leafLight]);
    const [cx, cy] = k.p(6.58, 1.7, z + 0.15);
    const r = 0.36 * Math.SQRT2 * k.s;
    k.pen.beginPath();
    k.pen.ellipse(cx, cy - 0.15 * k.s, r, r * 1.35, 0, Math.PI, Math.PI * 2);
    k.pen.closePath();
    k.paint('#cfe9ff33', k.thin * 0.8);
    k.pen.beginPath();
    k.pen.arc(cx - r * 0.45, cy - r * 0.75, Math.max(0.6, r * 0.14), 0, Math.PI * 2);
    k.pen.fillStyle = '#ffffffaa';
    k.pen.fill();
  }
}
