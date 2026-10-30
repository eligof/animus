import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import type { Quad } from './bits.ts';
import { across, band, bulbPlant, fillPts, pips, rflat, rivets, rrect } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf, withAlpha } from './kit.ts';

// Starfall Base's workstation (see WorkstationArt in ../types.ts): a holo
// console. A curved white desk on one pedestal, a light strip along its
// front edge, a projector bar along its back throwing up a holo pane right
// of the agent (the screen: a thin holo frame, the shared activity layer
// paints its face); a data slate in front of the agent and a little
// glowing sprout in a pod at the front of its right end. The back of its
// right end is kept clear for a desk upgrade, beside the pane and away
// from the agent. Looks: the strip (and the ring of
// light at the pedestal's foot) 0 cyan, 1 magenta, 2 gold. On: the strip,
// the ring and the projector bar glow and the bar's beam reaches the pane.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) lights it; v.seed (0, 1 or 2) picks
// one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const TOP = 6.0; // the desk's top
const STRIPS: readonly Color[] = [C.cyan, C.magenta, C.gold];
// The desk's front edge, bowed in toward its back in the middle.
const front = (u: number) => 2.25 + 0.7 * ((u - 3.5) / 3.5) ** 2;
const BACK = 0.15;
const SCREEN: Quad = [
  [2.5, 0.75, 6.95],
  [5.0, 0.75, 6.95],
  [5.0, 0.75, 9.55],
  [2.5, 0.75, 9.55],
];
const BAR = { u0: 2.2, u1: 5.35, v0: 0.35, v1: 1.15, h: 0.45 };
// The sprout's pod.
const POD = { u: 6.0, v: 2.4 };
// The pedestal's footprint.
const PED = { u0: 2.4, v0: 0.45, u1: 4.6, v1: 2.05 };

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const strip = STRIPS[((v.seed % 3) + 3) % 3];
    const on = v.active;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    pedestal(k, strip, on);
    desk(k, strip, on);
    bar(k, on);
    pane(k, on);
    // in front of the agent, a data slate; at the right, a sprout in a pod
    k.poly(rflat(0.45, 1.6, 2.3, 2.65, TOP + 0.02, 0.22), '#1f2440', k.thin);
    k.poly(rflat(0.6, 1.72, 2.15, 2.53, TOP + 0.03, 0.15), k.grad([0.6, 1.72, TOP], [2.15, 2.53, TOP], [[0, '#3a4a8a'], [1, '#2a2a5a']]), 0);
    const w = Math.max(0.7, 0.09 * k.s);
    k.segs([[[0.9, 1.95, TOP + 0.04], [1.9, 1.95, TOP + 0.04]]], withAlpha(strip, on ? 0.95 : 0.6), w, 'round');
    k.segs([[[0.9, 2.18, TOP + 0.04], [1.55, 2.18, TOP + 0.04]], [[0.9, 2.38, TOP + 0.04], [1.75, 2.38, TOP + 0.04]]], withAlpha('#ffffff', on ? 0.7 : 0.4), w, 'round');
    k.cyl(POD.u, POD.v, TOP, 0.38, 0.5, C.white);
    band(k, POD.u, POD.v, 0.38, TOP + 0.12, TOP + 0.24);
    k.paint(C.trim, 0);
    k.disc(POD.u, POD.v, TOP + 0.48, 0.28, '#4a3a5a', 0);
    bulbPlant(k, POD.u, POD.v, TOP + 0.5, 0.85, 0.2, 0.3, C.flora, k.thin, on ? 0.45 : 0.3);
  },
  screen: SCREEN,
  top: [6.5, 0.55, TOP],
};

// One pedestal under the desk: a broad rounded block on a base plate
// ringed with light, an orange band round its foot, a lit seam up its
// front and a vent near its top.
function pedestal(k: Kit, strip: Color, on: boolean): void {
  const { u0, v0, u1, v1 } = PED;
  k.box(u0 - 0.3, v0 - 0.25, 0, u1 - u0 + 0.6, v1 - v0 + 0.5, 0.35, C.panelDark, { round: 0.35 });
  k.line([[u0 - 0.15, v1 + 0.26, 0.2], [u1 + 0.15, v1 + 0.26, 0.2], [u1 + 0.31, v1 + 0.1, 0.2], [u1 + 0.31, v0 - 0.1, 0.2]], withAlpha(strip, on ? 1 : 0.55), Math.max(1, 0.16 * k.s));
  if (on) k.pool((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) * 0.75 + 0.6, (v1 - v0) * 0.75 + 0.5, strip, 0.28, 0.02);
  k.box(u0, v0, 0.35, u1 - u0, v1 - v0, 0.35, C.trim, { round: 0.3, line: k.thin, stripe: false });
  k.box(u0, v0, 0.7, u1 - u0, v1 - v0, TOP - 1.4, C.panel, { round: 0.3 });
  const mid = (u0 + u1) / 2;
  k.line([[mid, v1 + 0.01, 1.2], [mid, v1 + 0.01, TOP - 1.3]], on ? shade(strip, 0.3) : withAlpha(C.seam, 0.9), Math.max(1, 0.14 * k.s));
  if (k.fine) {
    k.segs([0, 1, 2].map((i): readonly [P3, P3] => [[u0 + 0.3, v1 + 0.01, TOP - 1.4 - i * 0.28], [mid - 0.3, v1 + 0.01, TOP - 1.4 - i * 0.28]]), withAlpha(C.seam, 0.9), Math.max(0.6, 0.07 * k.s), 'round');
  }
}

// The curved top: its face, the ribbon under its front edge, its end,
// orange caps at the front corners and the light strip.
function desk(k: Kit, strip: Color, on: boolean): void {
  const us = Array.from({ length: 15 }, (_, i) => (i / 14) * DESK.len);
  const z0 = TOP - 0.7;
  // the face under the front edge, shaded across
  const ribbon = (a: number, b: number, color: Color, line = k.lw) => {
    const part = us.filter((u) => u >= a - 1e-9 && u <= b + 1e-9);
    if (part[0] > a) part.unshift(a);
    if (part[part.length - 1] < b) part.push(b);
    const top: P3[] = part.map((u) => [u, front(u), TOP]);
    const bot: P3[] = part.map((u): P3 => [u, front(u), z0]).reverse();
    const scr = [...top, ...bot].map((p) => k.p(...p));
    fillPts(k, scr, across(k, scr, color, 0.1, 0.2), line);
  };
  ribbon(0, DESK.len, C.panel);
  ribbon(0, 0.45, C.trim, k.thin);
  ribbon(DESK.len - 0.45, DESK.len, C.trim, k.thin);
  k.poly([[DESK.len, BACK, z0], [DESK.len, front(DESK.len), z0], [DESK.len, front(DESK.len), TOP], [DESK.len, BACK, TOP]], k.side(C.panel, 1, 0), k.thin);
  const topPts: P3[] = [...us.map((u): P3 => [u, BACK, TOP]), ...us.map((u): P3 => [u, front(u), TOP]).reverse()];
  k.poly(topPts, k.grad([0, BACK, TOP], [DESK.len, front(DESK.len), TOP], [[0, '#ffffff'], [1, C.panelLight]]), k.lw);
  if (k.fine) k.line(us.map((u): P3 => [u, front(u) - 0.22, TOP + 0.01]), withAlpha(C.seam, 0.7), Math.max(0.6, 0.06 * k.s));
  // the light strip along the front
  const line: P3[] = us.map((u) => [u, front(u) + 0.02, TOP - 0.3]);
  if (on) k.line(line, withAlpha(strip, 0.35), Math.max(2, 0.55 * k.s));
  k.line(line, on ? shade(strip, 0.35) : shade(strip, -0.3), Math.max(1, 0.17 * k.s));
}

// The projector bar along the desk's back: dark, rounded, an orange cap at
// its right end, its lenses along its top under the pane; lit, they glow
// and so does a line along its front.
function bar(k: Kit, on: boolean): void {
  const { u0, u1, v0, v1, h } = BAR;
  k.box(u0, v0, TOP, u1 - u0, v1 - v0, h, C.dark, { round: 0.2 });
  k.box(u1 - 0.35, v0, TOP, 0.35, v1 - v0, h, C.trim, { round: 0.12, line: k.thin });
  k.line([[u0 + 0.3, v1 + 0.01, TOP + h * 0.5], [u1 - 0.55, v1 + 0.01, TOP + h * 0.5]], on ? withAlpha(C.holo, 0.95) : withAlpha(C.seam, 0.6), Math.max(0.8, 0.1 * k.s));
  const lenses: P3[] = [2.7, 3.25, 3.8, 4.35, 4.85].map((u): P3 => [u, (v0 + v1) / 2, TOP + h + 0.01]);
  if (on) for (const p of lenses) k.halo(p[0], p[1], p[2], 0.55, C.holo, 0.5);
  pips(k, lenses, on ? '#dffcff' : '#5f8f9c', 0.15, 0.8);
  rivets(k, [[u0 + 0.25, v1, TOP + h * 0.5]]);
}

// The holo pane over the bar: lit, its beam fanning up from the lenses and
// a glow round it; a thin frame of holo light round the screen, brighter
// at its corners.
function pane(k: Kit, on: boolean): void {
  const [a, b, , d] = SCREEN;
  const n = a[1];
  const m = 0.24;
  const [u0, u1, z0, z1] = [a[0] - m, b[0] + m, a[2] - m, d[2] + m];
  const lit = on ? 1 : 0.5;
  if (on) {
    k.wash((u0 + u1) / 2, n - 0.05, (z0 + z1) / 2, (u1 - u0) * 0.7, (z1 - z0) * 0.75, C.holo, 0.32);
    k.poly([[BAR.u0 + 0.3, n, TOP + BAR.h], [BAR.u1 - 0.4, n, TOP + BAR.h], [u1, n, z0], [u0, n, z0]], withAlpha(C.holo, 0.4), 0);
  }
  const outer = rrect(u0, z0, u1, z1, n, 0.2);
  k.poly(outer, withAlpha(C.holo, 0.42 * lit), 0);
  const pen = k.pen;
  pen.beginPath();
  k.trace(outer);
  pen.strokeStyle = withAlpha(C.holo, 0.95 * lit);
  pen.lineWidth = Math.max(1, 0.12 * k.s);
  pen.lineJoin = 'round';
  pen.stroke();
  // the corners, brighter
  const c = 0.45;
  const corners: Array<readonly [P3, P3]> = [];
  for (const [cu, cz, du, dz] of [[u0, z0, 1, 1], [u1, z0, -1, 1], [u1, z1, -1, -1], [u0, z1, 1, -1]] as const) {
    corners.push([[cu, n, cz + dz * c], [cu, n, cz]], [[cu, n, cz], [cu + du * c, n, cz]]);
  }
  k.segs(corners, withAlpha(on ? '#e8feff' : C.holo, lit), Math.max(1.2, 0.2 * k.s), 'round');
}
