import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, Quad, WorkstationArt } from '../types.ts';
import { bone, candle, coals, frustum, skull } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Hell's workstation (see WorkstationArt in ../types.ts): an ebony writing desk on gilt claws.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Four ebony legs on gilt claws, an apron with a drawer, a contract laid
// out before the agent; a scrying mirror at the back, right of the agent,
// its glass in a frame of bones on an ebony board; a skull with a candle
// stuck on it at the left, a red quill in an inkwell before the mirror.
// While the screen is on the candle burns and a red glow rings the mirror.
// Looks: the candle as it is, an hourglass, or a little brazier of embers.
// The right end of the top is kept clear for a desk upgrade, beside the
// agent rather than behind it.

const TOP = 5.6; // the desk's top
const BOARD = { u0: 2.2, u1: 5.9, v0: 0.2, v1: 0.75, z0: 6.0, z1: 9.95 }; // the mirror's board
const GLASS = { u0: 2.75, u1: 5.35, z0: 6.75, z1: 9.3 }; // the mirror, inside its frame
const N = BOARD.v1 + 0.2; // the front of the frame
const SKULL = { u: 1.0, v: 0.6, r: 0.55 };

const SCREEN: Quad = [
  [GLASS.u0, N + 0.02, GLASS.z0],
  [GLASS.u1, N + 0.02, GLASS.z0],
  [GLASS.u1, N + 0.02, GLASS.z1],
  [GLASS.u0, N + 0.02, GLASS.z1],
];

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = v.seed % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.32);
    // the legs on their claws, the apron with a drawer, the top
    for (const [u, w] of [[0.35, 0.3], [6.1, 0.3], [0.35, 2.15], [6.1, 2.15]] as const) leg(k, u, w);
    k.box(0.4, 0.35, TOP - 1.7, 6.2, 2.3, 1.15, C.ebonyLight, { stripe: false });
    const f = 2.66;
    k.poly([[2.6, f, TOP - 1.5], [4.4, f, TOP - 1.5], [4.4, f, TOP - 0.75], [2.6, f, TOP - 0.75]], k.side(shade(C.ebonyLight, -0.12), 0, 1), k.thin);
    k.dot(3.5, f + 0.03, TOP - 1.12, 0.2 * k.s, 0.2 * k.s, C.gold, k.thin * 0.7);
    k.box(0, 0, TOP - 0.6, DESK.len, DESK.dep, 0.6, '#4c2c30');
    if (k.fine) k.line([[0.25, DESK.dep + 0.01, TOP - 0.3], [DESK.len - 0.25, DESK.dep + 0.01, TOP - 0.3]], withAlpha(C.gold, 0.7), Math.max(0.6, 0.07 * k.s));
    // the contract before the agent, its clauses in red
    const z = TOP + 0.02;
    k.poly([[1.2, 1.35, z], [3.9, 1.3, z], [3.95, 2.75, z], [1.15, 2.8, z]], C.parchment, k.thin);
    if (k.s >= 5) {
      const rows: Array<[P3, P3]> = [];
      for (let i = 0; i < 4; i++) rows.push([[1.45, 1.6 + i * 0.3, z + 0.01], [1.45 + (i === 3 ? 1.1 : 2.1), 1.6 + i * 0.3, z + 0.01]]);
      for (const [a, b] of rows) k.line([a, b], '#7a2a2a', Math.max(0.6, 0.07 * k.s));
      k.dot(3.4, 2.5, z + 0.02, 0.28 * k.s, 0.16 * k.s, C.velvet, k.thin * 0.7);
    }
    // the skull at the left, a candle stuck on its crown
    skull(k, SKULL.u, SKULL.v, TOP, SKULL.r);
    candle(k, SKULL.u, SKULL.v, TOP + SKULL.r * 1.95, 1.05, 0.24, C.wax, v.active);
    if (!v.active && k.fine) k.line([[SKULL.u, SKULL.v, TOP + SKULL.r * 1.95 + 1.05], [SKULL.u, SKULL.v, TOP + SKULL.r * 1.95 + 1.3]], INK, Math.max(0.7, 0.08 * k.s));
    // the scrying mirror: a red glow round it while it is on, its board on
    // two gilt feet, the frame of bones
    const mid: P3 = [(BOARD.u0 + BOARD.u1) / 2, N, (BOARD.z0 + BOARD.z1) / 2];
    if (v.active) k.halo(...mid, 4.6, '#ff3a1e', 0.75);
    for (const u of [BOARD.u0 + 0.6, BOARD.u1 - 0.6]) k.box(u - 0.3, BOARD.v0 + 0.05, TOP, 0.6, 0.6, BOARD.z0 - TOP + 0.2, C.gold, { line: k.thin, stripe: false });
    k.box(BOARD.u0, BOARD.v0, BOARD.z0, BOARD.u1 - BOARD.u0, BOARD.v1 - BOARD.v0, BOARD.z1 - BOARD.z0, C.ebony, { round: 0.2 });
    if (v.active) k.halo(...mid, 3.0, '#ff4a22', 0.55, 'lighter');
    const rim = (d: number): P3[] => [[GLASS.u0 - d, N, GLASS.z0 - d], [GLASS.u1 + d, N, GLASS.z0 - d], [GLASS.u1 + d, N, GLASS.z1 + d], [GLASS.u0 - d, N, GLASS.z1 + d]];
    k.poly(rim(0.12), C.obsidian, k.thin);
    frame(k);
    if (v.active) k.line([...rim(0.06), rim(0.06)[0]], withAlpha('#ff6a3a', 0.85), Math.max(0.8, 0.1 * k.s));
    // the inkwell and its red quill at the right
    k.cyl(5.1, 2.45, TOP, 0.42, 0.55, '#2c1c2c', { top: shade('#2c1c2c', 0.2) });
    k.disc(5.1, 2.45, TOP + 0.55, 0.24, C.blood, 0);
    quill(k, [5.1, 2.45, TOP + 0.45], [5.95, 2.45, TOP + 1.95]);
    // the look's own, beside the contract
    if (look === 1) hourglass(k, 4.25, 2.3, TOP);
    else if (look === 2) brazier(k, 4.25, 2.3, TOP);
  },
  screen: SCREEN,
  top: [6.4, 0.6, TOP],
};

// A leg of ebony, tapering to a gilt claw that grips a ball.
function leg(k: Kit, u: number, w: number): void {
  const [cu, cv] = [u + 0.3, w + 0.3];
  k.box(u, w, 1.2, 0.6, 0.6, TOP - 0.6 - 1.2, C.ebony, { stripe: false });
  k.box(u + 0.08, w + 0.08, 0.75, 0.44, 0.44, 0.5, C.ebony, { stripe: false, line: k.thin });
  // the ball, and the claw closed over it: a gilt cap, its knuckles
  const R = 0.42 * k.s;
  const [x, y] = k.p(cu, cv, 0.42);
  const g = k.pen.createRadialGradient(x - R * 0.4, y - R * 0.45, 0, x, y, R * 1.2);
  g.addColorStop(0, C.goldLight);
  g.addColorStop(0.5, C.gold);
  g.addColorStop(1, C.goldDark);
  k.dot(cu, cv, 0.42, R, R, g, k.thin);
  frustum(k, cu, cv, 0.6, 0.4, 1.0, 0.27, C.gold, null);
  if (k.fine) {
    const kn: P3[] = [[cu - 0.25, cv + 0.3, 0.62], [cu + 0.12, cv + 0.38, 0.6], [cu + 0.38, cv + 0.08, 0.62]];
    for (const p of kn) k.dot(...p, 0.11 * k.s, 0.09 * k.s, C.goldLight, k.thin * 0.6);
  }
}

// The mirror's frame: four bones round the glass, knobbed at the corners.
function frame(k: Kit): void {
  const { u0, u1, z0, z1 } = GLASS;
  const d = 0.32;
  const w = 0.42;
  bone(k, [u0 - d, N, z0 - d], [u1 + d, N, z0 - d], w, C.boneShade);
  bone(k, [u0 - d, N, z1 + d], [u1 + d, N, z1 + d], w);
  bone(k, [u0 - d, N, z0 - d + 0.1], [u0 - d, N, z1 + d - 0.1], w);
  bone(k, [u1 + d, N, z0 - d + 0.1], [u1 + d, N, z1 + d - 0.1], w, C.boneShade);
}

// A quill from its nib to the top of its feather: a crimson vane on a
// pale shaft.
function quill(k: Kit, tip: P3, top: P3): void {
  const a = k.p(...tip);
  const b = k.p(...top);
  const pen = k.pen;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const at = (f: number, side: number): Pt => [a[0] + dx * f + nx * side, a[1] + dy * f + ny * side];
  const w = l * 0.3;
  const p0 = at(0.25, 0);
  const c1 = at(0.6, w * 1.1);
  const e = at(1.04, 0);
  const c2 = at(0.85, -w * 0.9);
  const p1 = at(0.55, -w * 0.6);
  pen.beginPath();
  pen.moveTo(p0[0], p0[1]);
  pen.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
  pen.quadraticCurveTo(c2[0], c2[1], p1[0], p1[1]);
  pen.closePath();
  const g = pen.createLinearGradient(p0[0], p0[1], e[0], e[1]);
  g.addColorStop(0, C.velvetDark);
  g.addColorStop(0.5, C.velvet);
  g.addColorStop(1, '#ff5a4a');
  k.paint(g, k.thin);
  pen.beginPath();
  pen.moveTo(a[0], a[1]);
  pen.lineTo(e[0], e[1]);
  pen.strokeStyle = '#f2e6c8';
  pen.lineWidth = Math.max(0.7, 0.1 * k.s);
  pen.stroke();
}

// An hourglass in gilt ends, red sand run half through.
function hourglass(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.48, 0.2, C.gold, { line: k.thin });
  frustum(k, u, v, z + 0.2, 0.38, z + 0.85, 0.09, '#e8d8d0', null);
  frustum(k, u, v, z + 0.85, 0.09, z + 1.5, 0.38, '#e8d8d0', null);
  k.disc(u, v, z + 0.36, 0.27, '#c0301e', 0);
  k.dot(u, v, z + 1.15, 0.15 * k.s, 0.1 * k.s, '#c0301e');
  k.cyl(u, v, z + 1.5, 0.48, 0.2, C.gold, { line: k.thin });
  for (const d of [-1, 1]) k.line([[u + d * 0.42, v + 0.1, z + 0.2], [u + d * 0.42, v + 0.1, z + 1.5]], C.goldDark, Math.max(0.8, 0.09 * k.s));
}

// A little iron brazier on three feet, heaped with embers.
function brazier(k: Kit, u: number, v: number, z: number): void {
  for (const a of [0.6, 2.7, 4.8]) k.line([[u + Math.cos(a) * 0.5, v + Math.sin(a) * 0.5, z], [u + Math.cos(a) * 0.3, v + Math.sin(a) * 0.3, z + 0.55]], C.iron, Math.max(1, 0.14 * k.s));
  frustum(k, u, v, z + 0.45, 0.35, z + 0.95, 0.62, C.iron, '#1a0a0a');
  coals(k, u, v, z + 0.93, 0.5, 5, 0.75);
  k.halo(u, v, z + 1.1, 1.1, C.ember, 0.4);
}
