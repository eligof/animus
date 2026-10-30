import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { fillPts, hem, hull, lantern, log, mug } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf } from './kit.ts';

// Snowy Depths's workstation (see WorkstationArt in ../types.ts): an expedition table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Three rough planks on log bearers and log legs, a fur thrown over the
// left end and hanging down its front. Right of the agent a pane of clear
// ice, frosted at its rim, stands in a timber frame with snow on its
// lintel: the screen is the ice. A candle lantern on the fur, a mug of
// cocoa at the front of the right end; the back of the right end is kept
// clear for a desk upgrade, so it shows beside the agent. Looks: the fur
// is brown, grey or white. On, the lantern is lit.

const ZT = 5.7; // the planks' top
const FUR = 0.08; // the fur over them
const PANE = 0.7; // the ice's face
const LOOKS: ReadonlyArray<readonly [Color, Color]> = [
  [C.fur, C.furLight],
  [C.furGrey, '#c9c4bb'],
  [C.furWhite, '#ffffff'],
];

function draw(v: PropView): void {
  const k = kitOf(v);
  const [fur, furHi] = LOOKS[((v.seed % 3) + 3) % 3];
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.45, 0.32);
  // log legs, a stretcher between the back two, log bearers across the
  // ends, their cut ends toward the room
  const leg = (u: number, w: number) => k.cyl(u, w, 0, 0.42, ZT - 1.25, C.bark, { top: '#ddb27a' });
  leg(0.8, 0.6);
  log(k, [0.8, 0.6, 1.5], [6.2, 0.6, 1.5], 0.25);
  leg(6.2, 0.6);
  leg(0.8, 2.4);
  leg(6.2, 2.4);
  for (const u of [0.8, 6.2]) log(k, [u, 0.2, ZT - 0.92], [u, 2.8, ZT - 0.92], 0.34);
  // the planks, back to front, a nail in each
  const planks: ReadonlyArray<readonly [number, number, number, Color]> = [
    [0.05, 6.95, 0, C.wood],
    [0.0, 6.85, 1.0, shade(C.wood, 0.05)],
    [0.12, 7.0, 2.0, shade(C.wood, -0.03)],
  ];
  for (const [u0, u1, w, c] of planks) k.box(u0, w, ZT - 0.6, u1 - u0, 1.0, 0.6, c, { stripe: false });
  if (k.fine) {
    k.pen.beginPath();
    for (const [, u1, w] of planks) {
      const [x, y] = k.p(u1 - 0.8, w + 0.5, ZT);
      k.pen.moveTo(x + 0.07 * k.s, y);
      k.pen.arc(x, y, 0.07 * k.s, 0, Math.PI * 2);
    }
    k.pen.fillStyle = C.iron;
    k.pen.fill();
  }
  // the fur over the left end, hanging down its front; the frame standing
  // just past it
  pelt(k, fur, furHi);
  frame(k);
  lantern(k, 0.85, 2.1, ZT + FUR, v.active, 0.72);
  if (v.active) k.halo(0.85, 2.1, ZT + FUR + 0.9, 2.2, C.glow, 0.45);
  mug(k, 6.3, 2.2, ZT, C.wool, 0.4);
}

// The timber frame and its pane of ice; snow on the lintel.
function frame(k: Kit): void {
  const T = C.woodDark;
  k.box(2.17, 0.4, ZT, 0.38, 0.5, 3.8, T, { stripe: false });
  k.box(5.05, 0.4, ZT, 0.38, 0.5, 3.8, T, { stripe: false });
  // the ice: a slab a quarter unit thick, its edge showing, clear blue
  // going pale toward the top left
  const at = (u0: number, u1: number, z0: number, z1: number, w: number): P3[] => [
    [u0, w, z0],
    [u1, w, z0],
    [u1, w, z1],
    [u0, w, z1],
  ];
  const face = at(2.55, 5.05, ZT + 0.3, ZT + 3.47, PANE);
  fillPts(k, hull([...face, ...at(2.55, 5.05, ZT + 0.3, ZT + 3.47, PANE - 0.25)].map((p) => k.p(...p))), C.iceMid, k.lw);
  k.poly(face, k.grad(face[3], face[1], [[0, C.frost], [0.4, C.iceHi], [1, C.ice]]), k.thin);
  // the sill and the lintel
  k.box(2.55, 0.45, ZT, 2.5, 0.45, 0.3, T, { stripe: false });
  k.box(2.02, 0.35, ZT + 3.47, 3.56, 0.62, 0.36, shade(T, 0.08));
  // snow along the lintel, its edge drooping over the front
  const zs = ZT + 3.83;
  const crest: P3[] = [];
  for (let i = 0; i <= 6; i++) crest.push([2.27 + (i / 6) * 3.06, 0.66, zs + 0.22 + 0.06 * Math.sin(i * 1.7)]);
  const bed: P3[] = [[2.07, 0.37, zs], [5.53, 0.37, zs], [5.53, 0.95, zs], [2.07, 0.95, zs]];
  fillPts(k, hull([...crest, ...bed].map((p) => k.p(...p))), k.grad([2.1, 0.95, zs], [5.5, 0.37, zs], [[0, C.snowHi], [0.6, C.snow], [1, C.snowMid]]), k.lw);
  k.poly([[2.1, 0.98, zs], [5.5, 0.98, zs], ...hem([5.42, 0.98, zs - 0.1], [2.18, 0.98, zs - 0.1], 9, [0, 0, -1], 0.16)], C.snowHi, k.thin, 0.1);
  if (k.fine) {
    // frost feathers in the pane's corners, on its rim
    k.pen.beginPath();
    for (const [u, z, du, dz] of [[2.62, ZT + 0.38, 1, 1], [4.98, ZT + 0.38, -1, 1], [2.62, ZT + 3.39, 1, -1], [4.98, ZT + 3.39, -1, -1]] as const) {
      k.trace([[u, PANE + 0.01, z], [u + du * 0.5, PANE + 0.01, z + dz * 0.05], [u, PANE + 0.01, z]]);
      k.trace([[u, PANE + 0.01, z], [u + du * 0.05, PANE + 0.01, z + dz * 0.5], [u, PANE + 0.01, z]]);
    }
    k.pen.strokeStyle = '#ffffff';
    k.pen.lineWidth = Math.max(0.7, 0.07 * k.s);
    k.pen.stroke();
  }
}

// A fur thrown over the planks' left end: flat on top, a ragged edge
// toward the middle, hanging down the front to a ragged hem.
function pelt(k: Kit, base: Color, hi: Color): void {
  const z = ZT + FUR;
  const top: P3[] = [[0.0, 0.0, z], ...hem([2.0, 0.0, z], [2.1, 3.05, z], 6, [1, 0, 0], 0.28), [0.0, 3.05, z]];
  k.poly(top, k.lgrad([0, 0, z], [2.4, 3, z], [1, -1, 0], [[0, hi], [1, base]]), k.lw, 0.15);
  const drape: P3[] = [[0.0, 3.05, z], [2.1, 3.05, z], ...hem([2.05, 3.1, ZT - 1.5], [0.0, 3.1, ZT - 1.85], 8, [0, 0.05, -1], 0.4)];
  k.poly(drape, k.vgrad(1.2, 3.1, ZT - 1.9, z, [[0, shade(base, -0.28)], [1, base]]), k.lw, 0.15);
  if (k.fine) {
    // tufts of fur
    k.pen.beginPath();
    for (let u = 0.3; u < 1.95; u += 0.45) {
      k.trace([[u, 3.1, ZT - 0.2], [u + 0.08, 3.12, ZT - 0.9], [u, 3.1, ZT - 0.2]]);
      k.trace([[u + 0.2, 1.0, z], [u + 0.35, 1.5, z], [u + 0.2, 1.0, z]]);
    }
    k.pen.strokeStyle = shade(base, -0.22);
    k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    k.pen.stroke();
  }
}

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 9.9,
  draw,
  screen: [
    [2.75, PANE, ZT + 0.58],
    [4.85, PANE, ZT + 0.58],
    [4.85, PANE, ZT + 3.25],
    [2.75, PANE, ZT + 3.25],
  ],
  top: [6.5, 0.55, ZT],
};
