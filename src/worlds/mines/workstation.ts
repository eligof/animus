import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { hangLantern, nugget, pickaxe, rock, ropeCoil, sparkle } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, kitOf } from './kit.ts';

// The Mines's workstation (see WorkstationArt in ../types.ts): a miner's
// lantern-lit workbench. Heavy planks edged in timber on two pine
// trestles, braced with an iron strap; a hurricane lantern hung from a
// bent pole at its left end; at the back, right of the agent, a slate in
// a timber frame propped upright as a foreman chalks up the shift (the
// screen); a tin cup and a lump of ore in front of the agent; the right
// end kept clear for a desk upgrade. Looks: 0 a pick leaning on the left
// trestle, 1 a coil of rope under the top, 2 a gold pan with three
// nuggets before the slate. On: the lantern lit.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const TOP = 6.0; // the top's surface
const UNDER = 5.4; // the planks' underside
const BEAM = 4.8; // the trestles' cross beams' underside
const TRESTLES = [0.75, 6.25];
// The slate's frame: u0..u1 along, v0..v1 deep, up from the top to z1.
const SLATE = { u0: 2.3, u1: 5.5, v0: 0.45, v1: 0.9, z1: 9.85 };

// A trestle at u: two pine legs splayed front and back under a cross beam.
function trestle(k: Kit, u: number): void {
  k.rod([[u, 0.25, 0], [u, 0.85, BEAM]], C.pine, 0.42);
  k.rod([[u, 2.75, 0], [u, 2.15, BEAM]], C.pine, 0.42);
  k.box(u - 0.35, 0.3, BEAM, 0.7, 2.4, UNDER - BEAM, C.pine, { line: k.thin });
}

// The planks of the top, the timber edge along its front, and (close up)
// a candle-blackened knot or two.
function bench(k: Kit): void {
  // three planks, their ends not quite flush, the seams inked between them
  k.box(0.1, 0, UNDER, DESK.len - 0.1, 0.9, TOP - UNDER, C.plank, { stripe: false });
  k.box(0, 0.9, UNDER, DESK.len - 0.05, 0.85, TOP - UNDER, shade(C.plank, -0.05), { stripe: false });
  k.box(0.05, 1.75, UNDER, DESK.len - 0.05, 0.85, TOP - UNDER, C.plank, { stripe: false });
  k.box(0, 2.6, UNDER - 0.35, DESK.len, 0.4, TOP - UNDER + 0.35, C.timber);
  if (k.fine) {
    for (const [u, v, r] of [[1.9, 0.55, 0.16], [4.3, 1.95, 0.13], [6.3, 2.25, 0.11]] as const) {
      k.disc(u, v, TOP + 0.01, r * 1.8, shade(C.plank, -0.2), 0);
      k.disc(u, v, TOP + 0.01, r, C.timberDark, 0);
    }
    // a grain line or two
    k.line([[0.4, 0.95, TOP + 0.01], [1.5, 0.9, TOP + 0.01]], shade(C.plank, -0.22), Math.max(0.7, 0.06 * k.s));
    k.line([[3.1, 2.1, TOP + 0.01], [5.0, 2.15, TOP + 0.01]], shade(C.plank, -0.22), Math.max(0.7, 0.06 * k.s));
  }
}

// The slate in its timber frame, a chalk ledge at its foot and a strut
// propping it at the +u end. The screen is its face (see WORKSTATION.screen).
function slate(k: Kit): void {
  const { u0, u1, v0, v1, z1 } = SLATE;
  k.rod([[u1 + 0.3, 0.1, TOP], [u1 - 0.1, v0 + 0.1, 8.9]], C.timber, 0.26);
  k.box(u0, v0, TOP, u1 - u0, v1 - v0, z1 - TOP, C.timberDark);
  // the slate's face inside the frame (the layer paints over it)
  k.poly([[2.6, v1, 6.6], [5.2, v1, 6.6], [5.2, v1, 9.4], [2.6, v1, 9.4]], '#3b4046', k.thin);
  // pegs at the frame's corners
  if (k.fine) for (const [u, z] of [[u0 + 0.15, 6.3], [u1 - 0.15, 6.3], [u0 + 0.15, z1 - 0.22], [u1 - 0.15, z1 - 0.22]] as const) k.disc(u, v1 + 0.01, z, 0.07, C.timberOld, 0);
  // the chalk ledge, a stub of chalk and a rag on it
  k.box(u0, v1, TOP, u1 - u0, 0.3, 0.28, C.timber, { line: k.thin });
  k.rod([[3.0, v1 + 0.15, TOP + 0.36], [3.55, v1 + 0.15, TOP + 0.36]], '#f2ece0', 0.16);
  if (k.fine) k.poly([[4.3, v1 + 0.02, TOP + 0.28], [5.0, v1 + 0.02, TOP + 0.28], [4.95, v1 + 0.3, TOP + 0.42], [4.35, v1 + 0.3, TOP + 0.4]], C.canvas, k.thin);
}

// A tin cup with its handle on the +u side.
function cup(k: Kit, u: number, v: number): void {
  k.cyl(u, v, TOP, 0.3, 0.55, C.steel, { line: k.thin });
  k.disc(u, v, TOP + 0.55, 0.22, shade(C.steel, -0.35), 0);
  const handle: P3[] = [[u + 0.3, v, TOP + 0.45], [u + 0.52, v, TOP + 0.38], [u + 0.5, v, TOP + 0.17], [u + 0.3, v, TOP + 0.12]];
  k.line(handle, INK, Math.max(1, 0.16 * k.s));
  k.line(handle, C.steel, Math.max(0.6, 0.08 * k.s));
}

// A lump of ore: grey rock with gold showing in it, and a glint.
function ore(k: Kit, u: number, v: number): void {
  rock(k, u, v, TOP, 0.5, 0.55, C.rock, 17, k.thin);
  k.disc(u - 0.12, v + 0.15, TOP + 0.38, 0.13, C.gold, 0);
  k.disc(u + 0.18, v + 0.05, TOP + 0.22, 0.09, C.goldHi, 0);
  if (k.s >= 5) sparkle(k, u - 0.15, v + 0.1, TOP + 0.55, 0.32, 0.9);
}

// A gold pan with three nuggets in it.
function pan(k: Kit, u: number, v: number): void {
  k.cyl(u, v, TOP, 0.78, 0.2, C.ironLight, { line: k.thin });
  k.disc(u, v, TOP + 0.2, 0.62, shade(C.iron, 0.1), 0);
  k.disc(u, v, TOP + 0.21, 0.4, shade(C.iron, 0.2), 0);
  nugget(k, u - 0.22, v - 0.12, TOP + 0.21, 0.17, 3, false);
  nugget(k, u + 0.2, v - 0.05, TOP + 0.21, 0.14, 5, false);
  nugget(k, u, v + 0.22, TOP + 0.21, 0.19, 8, true);
}

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = v.seed % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the lantern's pole, behind the top's left end, fixed to the trestle
    const pole: P3[] = [[0.3, 0.12, BEAM], [0.3, 0.12, 9.5], [0.32, 0.4, 9.88], [0.34, 0.85, 9.85]];
    k.rod(pole, C.timberOld, 0.24);
    // the trestles, the stretcher between them and its iron strap
    trestle(k, TRESTLES[0]);
    trestle(k, TRESTLES[1]);
    k.box(TRESTLES[0] + 0.2, 1.25, 1.7, TRESTLES[1] - TRESTLES[0] - 0.4, 0.5, 0.5, C.pine, { line: k.thin, stripe: false });
    const strap: P3[] = [[TRESTLES[0] + 0.25, 1.78, BEAM - 0.05], [TRESTLES[1] - 0.25, 1.78, 2.15]];
    k.rod(strap, C.iron, 0.2);
    if (k.fine) for (const p of strap) k.disc(p[0], p[1] + 0.02, p[2], 0.09, C.ironLight, 0);
    if (look === 1) ropeCoil(k, 3.6, 2.05, 0, 0.85);
    if (look === 0) pickaxe(k, [1.2, 2.85, 4.5], [2.35, 2.9, 0.5], [0.96, 0, 0.28], 0.85);
    bench(k);
    slate(k);
    // the lantern on its short chain from the pole's crook
    hangLantern(k, 0.34, 0.85, 9.75, 0.3, v.active ? 1 : 0, 0.82);
    cup(k, 1.95, 2.2);
    ore(k, 2.75, 2.25);
    if (look === 2) pan(k, 4.3, 2.15);
  },
  // the slate's face, inside its timber frame
  screen: [
    [2.6, 0.9, 6.6],
    [5.2, 0.9, 6.6],
    [5.2, 0.9, 9.4],
    [2.6, 0.9, 9.4],
  ],
  // the top's right end, beside the slate, clear of the agent
  top: [6.3, 0.7, TOP],
};
