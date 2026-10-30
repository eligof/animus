import { mix } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { platter } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf } from './kit.ts';

// Underground Club's workstation (see WorkstationArt in ../types.ts): a
// small DJ desk. A compact black booth, its front a dim grid of LEDs, a
// neon lip along its top front edge and a thin LED strip under it; right
// of the agent a laptop on a little steel stand, its lid (the screen)
// tilted back a little; on the left a controller with two small platters
// and a fader, headphones lying on it; the right end kept clear for a desk
// upgrade. Looks: the lip pink, cyan or lime. On: the lip and the strip
// glow.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const ZT = 5.65; // the booth's top
const FRONT = 2.8; // the booth's front face (the top overhangs it to the footprint's edge)
const LIPS: readonly Color[] = [C.pink, C.cyan, C.lime];
// The laptop: its base on the stand, the lid hinged at the base's back and
// leaning back (its face at v = lidV(z)).
const BASE = { u0: 2.3, u1: 5.45, v0: 0.75, v1: 2.3, z: 6.15, h: 0.16 };
const HINGE = BASE.z + BASE.h;
const LID_TOP = 9.85;
const lidV = (z: number): number => BASE.v0 + 0.03 - 0.15 * (z - HINGE);
const SCREEN = { u0: 2.6, u1: 5.15, z0: 6.7, z1: 9.5 };

// The booth: its body, the dark LED front, the top slab.
function booth(k: Kit): void {
  k.box(0.15, 0.25, 0, DESK.len - 0.3, FRONT - 0.25, ZT - 0.35, C.black, { stripe: false });
  k.rect(0.45, FRONT + 0.01, 0.5, DESK.len - 0.45, ZT - 1.05, '#120e18', k.thin);
  const pen = k.pen;
  const r = Math.max(0.6, 0.12 * k.s);
  pen.beginPath();
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 5; j++) {
      const [x, y] = k.p(0.85 + i * 0.76, FRONT + 0.02, 0.95 + j * 0.72);
      pen.moveTo(x + r, y);
      pen.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  pen.fillStyle = '#2e2440';
  pen.fill();
  k.box(0, 0.1, ZT - 0.35, DESK.len, DESK.dep - 0.1, 0.35, C.gear);
}

// The neon lip along the top's front edge and the LED strip under it, in
// the look's colour; glowing (kept inside the footprint) while on.
function lights(k: Kit, color: Color, on: boolean): void {
  const lip: P3[] = [[0.3, DESK.dep, ZT - 0.17], [DESK.len - 0.3, DESK.dep, ZT - 0.17]];
  const strip: P3[] = [[0.5, FRONT + 0.02, ZT - 0.62], [DESK.len - 0.5, FRONT + 0.02, ZT - 0.62]];
  if (on) {
    k.wash(DESK.len / 2, FRONT + 0.03, ZT - 1.1, 3.2, 1.0, color, 0.3);
    for (let u = 0.9; u < DESK.len - 0.5; u += 1.3) k.halo(u, DESK.dep, ZT - 0.2, 0.9, color, 0.22);
  }
  k.line(strip, on ? color : mix(color, C.black, 0.45), Math.max(1, 0.1 * k.s));
  k.line(lip, '#120e18', Math.max(1.4, 0.2 * k.s) + k.lw);
  k.line(lip, on ? color : mix(color, C.black, 0.3), Math.max(1.4, 0.2 * k.s));
  if (on) k.line(lip, mix(color, '#ffffff', 0.7), Math.max(0.7, 0.08 * k.s));
}

// The laptop on its little steel stand: the stand's sides and plate, the
// silver base and its keys, the lid leaning back.
function laptop(k: Kit): void {
  const { u0, u1, v0, v1, z, h } = BASE;
  for (const u of [u0 + 0.35, u1 - 0.5]) k.box(u, v0 + 0.15, ZT, 0.15, v1 - v0 - 0.4, z - ZT - 0.12, C.steel, { line: k.thin, stripe: false });
  k.box(u0 + 0.25, v0 + 0.1, z - 0.12, u1 - u0 - 0.5, v1 - v0 - 0.3, 0.12, C.steel, { line: k.thin, stripe: false });
  k.box(u0, v0, z, u1 - u0, v1 - v0, h, '#c4c8d4', { line: k.thin });
  k.poly([[u0 + 0.3, v0 + 0.35, z + h + 0.01], [u1 - 0.3, v0 + 0.35, z + h + 0.01], [u1 - 0.3, v0 + 1.0, z + h + 0.01], [u0 + 0.3, v0 + 1.0, z + h + 0.01]], '#2a2532', 0);
  if (k.fine) k.poly([[u0 + 1.25, v0 + 1.12, z + h + 0.01], [u1 - 1.25, v0 + 1.12, z + h + 0.01], [u1 - 1.25, v0 + 1.4, z + h + 0.01], [u0 + 1.25, v0 + 1.4, z + h + 0.01]], '#a9aebb', 0);
  // the lid: its top edge and its end, then its face
  const t = 0.12;
  const f = (u: number, zz: number): P3 => [u, lidV(zz), zz];
  const b = (u: number, zz: number): P3 => [u, lidV(zz) - t, zz];
  k.poly([b(u0, LID_TOP), b(u1, LID_TOP), f(u1, LID_TOP), f(u0, LID_TOP)], '#d3d6e0', k.thin);
  k.poly([f(u1, HINGE), b(u1, HINGE), b(u1, LID_TOP), f(u1, LID_TOP)], '#9ea3b2', k.thin);
  k.poly([f(u0, HINGE), f(u1, HINGE), f(u1, LID_TOP), f(u0, LID_TOP)], '#b9bec9', k.lw);
}

// The controller on the left: two small platters, a fader between, the
// headphones lying across its front.
function controller(k: Kit, color: Color): void {
  const z = ZT + 0.32;
  k.box(0.2, 1.15, ZT, 2.0, 1.55, 0.32, '#3a3446', { round: 0.12 });
  platter(k, 0.7, 1.75, z, 0.42, C.pink);
  platter(k, 1.7, 1.75, z, 0.42, C.cyan);
  k.line([[1.2, 1.4, z + 0.01], [1.2, 2.15, z + 0.01]], '#121016', Math.max(0.8, 0.1 * k.s));
  k.box(1.07, 1.7, z, 0.26, 0.22, 0.12, '#e6e2ee', { line: k.thin * 0.7, stripe: false });
  // the headphones: the band and its cups
  k.rod([[0.6, 2.45, z + 0.12], [1.2, 2.6, z + 0.6], [1.8, 2.45, z + 0.12]], C.steelDark, 0.14);
  for (const u of [0.6, 1.8]) k.disc(u, 2.45, z + 0.14, 0.3, color, k.thin);
}

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const color = LIPS[v.seed % 3];
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.3);
    booth(k);
    lights(k, color, v.active);
    laptop(k);
    controller(k, color);
  },
  // the lid's screen, inside its silver edge, leaning back with it
  screen: [
    [SCREEN.u0, lidV(SCREEN.z0), SCREEN.z0],
    [SCREEN.u1, lidV(SCREEN.z0), SCREEN.z0],
    [SCREEN.u1, lidV(SCREEN.z1), SCREEN.z1],
    [SCREEN.u0, lidV(SCREEN.z1), SCREEN.z1],
  ],
  // the top's right end, beside the laptop, clear of the agent
  top: [6.3, 0.75, ZT],
};
