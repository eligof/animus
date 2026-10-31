import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, Quad, WorkstationArt } from '../types.ts';
import { bone, bonePile, flame, frustum, rock, skull, spike, tome } from './bits.ts';
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
// its glass in a frame of bones on an ebony board. While the screen is on
// a red glow rings the mirror. Looks, on the floor under the desk: bare, a
// little heap of bones, or a stack of grimoires. The right end of the top
// is kept clear for a desk upgrade, beside the agent rather than behind it.
//
// Its clutter (a few a desk, see clutterOf): a skull with a devil's horns,
// a gilt goblet of wine, crossed bones, a round potion of soul-brew (it
// glows while the screen is on), an hourglass of red sand, two grimoires,
// an inkwell with its red quill, brimstone crystals on a lump of basalt, a
// jar with a little soul in it (glowing while on), a black mug of lava
// coffee with horns on its rim, a rubber duck with a devil's horns.
// Its loop: a black candle stuck on a skull at the top's front right, its
// flame swaying while the desk is worked, out while it is not.

const TOP = 5.6; // the desk's top
const BOARD = { u0: 2.2, u1: 5.9, v0: 0.2, v1: 0.75, z0: 6.0, z1: 9.95 }; // the mirror's board
const GLASS = { u0: 2.75, u1: 5.35, z0: 6.75, z1: 9.3 }; // the mirror, inside its frame
const N = BOARD.v1 + 0.2; // the front of the frame

const SCREEN: Quad = [
  [GLASS.u0, N + 0.02, GLASS.z0],
  [GLASS.u1, N + 0.02, GLASS.z0],
  [GLASS.u1, N + 0.02, GLASS.z1],
  [GLASS.u0, N + 0.02, GLASS.z1],
];

const LEGS: ReadonlyArray<readonly [number, number]> = [[0.35, 0.3], [6.1, 0.3], [0.35, 2.15], [6.1, 2.15]];

function draw(v: PropView): void {
  const k = kitOf(v);
  const look = v.seed % 3;
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.32);
  // the back legs, the look's own on the floor under the desk, the front
  // legs, the apron with a drawer, the top
  for (const [u, w] of LEGS.slice(0, 2)) leg(k, u, w);
  if (look === 1) bonePile(k, 4.6, 1.3, 0, 0.7, 7, 1);
  else if (look === 2) {
    tome(k, 4.0, 0.9, 0, 1.3, 1.0, 0.36, C.purple);
    tome(k, 4.1, 0.95, 0.36, 1.15, 0.9, 0.34, C.velvetDark);
    tome(k, 4.05, 1.0, 0.7, 1.05, 0.8, 0.3, '#1f4a44');
  }
  for (const [u, w] of LEGS.slice(2)) leg(k, u, w);
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
}

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

// ── what may stand on the top ──────────────────────────────────────────────
// Each stands at `at` (u, v on the top, z its surface), inside `r` round
// it and `h` over it, outlined finer than the furniture so a small thing
// keeps its colour.

const edge = (k: Kit): number => Math.max(1, k.lw * 0.45);

// A devil's horn out of a skull's crown (d: -1 left, 1 right), in the
// skull's screen frame (its cranium centred on cx, cy, R across): broad at
// its root, sweeping out and up to a point, lit along its upper edge.
function devilHorn(k: Kit, cx: number, cy: number, R: number, d: number): void {
  const root0: Pt = [cx + d * R * 0.15, cy - R * 0.95];
  const root1: Pt = [cx + d * R * 0.8, cy - R * 0.55];
  const tip: Pt = [cx + d * R * 1.1, cy - R * 1.95];
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(root0[0], root0[1]);
  pen.quadraticCurveTo(cx + d * R * 0.35, cy - R * 1.7, tip[0], tip[1]);
  pen.quadraticCurveTo(cx + d * R * 1.2, cy - R * 1.05, root1[0], root1[1]);
  pen.closePath();
  const g = pen.createLinearGradient(root0[0], root0[1], tip[0], tip[1]);
  g.addColorStop(0, C.velvetDark);
  g.addColorStop(0.55, C.velvet);
  g.addColorStop(1, '#e0483a');
  k.paint(g, edge(k));
}

// A skull with a devil's horns.
const hornedSkull: Clutter = {
  name: 'hornedSkull',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.4;
    k.shadow(u, w, 0.42, 0.34, 0.32, z);
    const [x, y] = k.p(u, w, z);
    const R = r * k.s;
    for (const d of [-1, 1]) devilHorn(k, x, y - R * 1.05, R, d);
    skull(k, u, w, z, r, { line: edge(k) });
  },
};

// A gilt goblet, dark wine in it, a red stone set in its bowl.
const goblet: Clutter = {
  name: 'goblet',
  r: 0.4,
  h: 1.1,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.36, 0.3, 0.3, z);
    frustum(k, u, w, z, 0.32, z + 0.14, 0.2, C.gold, null, e);
    k.cyl(u, w, z + 0.12, 0.08, 0.42, C.goldDark, { line: e });
    k.dot(u, w, z + 0.34, 0.14 * k.s, 0.1 * k.s, C.gold, e);
    frustum(k, u, w, z + 0.5, 0.13, z + 1.05, 0.36, C.gold, k.rgrad(u, w, z + 1.05, 0.34, [[0, '#b8303a'], [1, '#4a0a14']], -0.1), e);
    k.dot(u - 0.04, w + 0.33, z + 0.8, 0.11 * k.s, 0.11 * k.s, C.velvet, e * 0.8);
  },
};

// Two bones crossed on the top.
const bones: Clutter = {
  name: 'bones',
  r: 0.4,
  h: 0.35,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.shadow(u, w, 0.42, 0.34, 0.28, z);
    bone(k, [u - 0.36, w - 0.2, z + 0.1], [u + 0.36, w + 0.2, z + 0.1], 0.22, C.boneShade);
    bone(k, [u - 0.3, w + 0.28, z + 0.12], [u + 0.3, w - 0.28, z + 0.2], 0.22);
  },
};

// A round flask of soul-brew, corked: it glows while the screen is on.
const potion: Clutter = {
  name: 'potion',
  r: 0.4,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const R = 0.36;
    const zc = z + R + 0.02;
    k.shadow(u, w, 0.38, 0.3, 0.3, z);
    if (v.active) k.halo(u, w, zc, 0.9, C.soul, 0.5);
    // the neck and its cork, then the round body over its foot
    k.cyl(u, w, zc + R * 0.7, 0.12, 0.34, '#cfe8e0', { line: e });
    k.cyl(u, w, zc + R * 0.7 + 0.32, 0.14, 0.16, '#b0804e', { line: e });
    const [x, y] = k.p(u, w, zc);
    const P = R * k.s;
    const pen = k.pen;
    pen.save();
    pen.beginPath();
    pen.arc(x, y, P, 0, Math.PI * 2);
    pen.clip();
    pen.fillStyle = '#d8eee8';
    pen.fillRect(x - P - 1, y - P - 1, 2 * P + 2, 2 * P + 2);
    const g = pen.createLinearGradient(x - P, 0, x + P, 0);
    g.addColorStop(0, v.active ? '#b8fff0' : '#6fd8b8');
    g.addColorStop(0.45, v.active ? C.soul : '#4fb898');
    g.addColorStop(1, C.soulDeep);
    pen.fillStyle = g;
    pen.beginPath();
    pen.moveTo(x - P - 1, y - P * 0.2);
    pen.quadraticCurveTo(x, y - P * 0.4, x + P + 1, y - P * 0.2);
    pen.lineTo(x + P + 1, y + P + 1);
    pen.lineTo(x - P - 1, y + P + 1);
    pen.closePath();
    pen.fill();
    pen.restore();
    pen.beginPath();
    pen.arc(x, y, P, 0, Math.PI * 2);
    k.paint(null, e);
    // a shine on the glass, a bubble in the brew
    pen.beginPath();
    pen.arc(x, y, P * 0.6, Math.PI * 1.1, Math.PI * 1.45);
    pen.strokeStyle = withAlpha('#ffffff', 0.85);
    pen.lineWidth = Math.max(0.8, P * 0.16);
    pen.stroke();
    k.dot(u + 0.1, w, zc - 0.12, P * 0.12, P * 0.12, withAlpha('#ffffff', 0.8));
  },
};

// An hourglass in gilt ends, red sand run half through.
const hourglass: Clutter = {
  name: 'hourglass',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.4, 0.32, 0.3, z);
    k.cyl(u, w, z, 0.38, 0.16, C.gold, { line: e });
    frustum(k, u, w, z + 0.16, 0.3, z + 0.66, 0.07, '#f0e4dc', null, e);
    frustum(k, u, w, z + 0.66, 0.07, z + 1.14, 0.3, '#f0e4dc', null, e);
    k.poly([[u - 0.25, w + 0.05, z + 0.2], [u + 0.25, w + 0.05, z + 0.2], [u, w + 0.05, z + 0.46]], '#c0301e', 0);
    k.dot(u, w, z + 0.86, 0.14 * k.s, 0.09 * k.s, '#c0301e');
    k.line([[u, w + 0.05, z + 0.66], [u, w + 0.05, z + 0.24]], '#c0301e', Math.max(0.6, 0.05 * k.s));
    k.cyl(u, w, z + 1.14, 0.38, 0.16, C.gold, { line: e });
    for (const d of [-1, 1]) k.line([[u + d * 0.33, w + 0.12, z + 0.16], [u + d * 0.33, w + 0.12, z + 1.14]], C.goldDark, Math.max(0.8, 0.08 * k.s));
  },
};

// A little book lying on z, u0..u0+du by v0..v0+dv, h thick: its cover,
// the pages showing at its fore-edge and foot, a gilt clasp.
function book(k: Kit, u0: number, v0: number, z: number, du: number, dv: number, h: number, cover: string): void {
  const e = edge(k);
  k.box(u0, v0, z, du, dv, h, cover, { line: e, stripe: false });
  const [a, b] = [z + 0.045, z + h - 0.045];
  k.poly([[u0 + du + 0.01, v0 + 0.05, a], [u0 + du + 0.01, v0 + dv - 0.05, a], [u0 + du + 0.01, v0 + dv - 0.05, b], [u0 + du + 0.01, v0 + 0.05, b]], '#efe2c0', 0);
  k.poly([[u0 + 0.05, v0 + dv + 0.01, a], [u0 + du - 0.05, v0 + dv + 0.01, a], [u0 + du - 0.05, v0 + dv + 0.01, b], [u0 + 0.05, v0 + dv + 0.01, b]], '#ddcba2', 0);
  const m = u0 + du * 0.5;
  k.poly([[m - 0.07, v0 + dv + 0.02, z + 0.02], [m + 0.07, v0 + dv + 0.02, z + 0.02], [m + 0.07, v0 + dv + 0.02, z + h - 0.02], [m - 0.07, v0 + dv + 0.02, z + h - 0.02]], C.gold, e * 0.7);
}

// Two grimoires, one on the other, a ribbon hanging out of the top one, a
// gilt eye on its cover.
const grimoire: Clutter = {
  name: 'grimoire',
  r: 0.4,
  h: 0.5,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.shadow(u, w, 0.42, 0.36, 0.3, z);
    book(k, u - 0.38, w - 0.32, z, 0.76, 0.64, 0.2, '#6a3a8c');
    book(k, u - 0.3, w - 0.28, z + 0.2, 0.6, 0.52, 0.2, C.velvet);
    k.line([[u + 0.18, w + 0.24, z + 0.4], [u + 0.2, w + 0.26, z + 0.22], [u + 0.24, w + 0.28, z + 0.06]], C.goldLight, Math.max(0.8, 0.07 * k.s));
    const o = k.ell(u, w, z + 0.41, 0.17);
    k.pen.beginPath();
    k.pen.ellipse(o.cx, o.cy, o.rx, o.ry * 0.7, o.rot, 0, Math.PI * 2);
    k.paint(C.gold, edge(k) * 0.7);
    k.dot(u, w, z + 0.41, Math.max(0.6, 0.05 * k.s), Math.max(0.6, 0.05 * k.s), C.velvetDark);
  },
};

// An inkwell of blood-red ink, its red quill standing in it.
const inkwell: Clutter = {
  name: 'inkwell',
  r: 0.4,
  h: 1.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.shadow(u, w, 0.36, 0.3, 0.3, z);
    k.cyl(u, w, z, 0.32, 0.4, '#3c2638', { line: edge(k), top: '#5a3a52' });
    k.disc(u, w, z + 0.4, 0.18, C.blood, 0);
    quill(k, [u, w, z + 0.3], [u + 0.28, w + 0.05, z + 1.32]);
  },
};

// A shard of crystal standing on (u, v, z), h tall and w across, leaning
// `lean` toward +u: a lit face and a shaded one up to a point.
function shard(k: Kit, u: number, v: number, z: number, h: number, w: number, lean: number, lit: string, dark: string): void {
  const b0 = k.p(u - w / 2, v, z);
  const b1 = k.p(u, v + w / 2, z);
  const b2 = k.p(u + w / 2, v, z);
  const t0 = k.p(u - w / 2 + lean * 0.7, v, z + h * 0.72);
  const t1 = k.p(u + lean * 0.7, v + w / 2, z + h * 0.72);
  const t2 = k.p(u + w / 2 + lean * 0.7, v, z + h * 0.72);
  const tip = k.p(u + lean, v + w * 0.2, z + h);
  k.fill([b0, b1, t1, tip, t0], lit, 0);
  k.fill([b1, b2, t2, tip, t1], dark, 0);
  k.fill([b0, b1, b2, t2, tip, t0], null, edge(k));
}

// Brimstone crystals out of a lump of basalt.
const brimstone: Clutter = {
  name: 'brimstone',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.shadow(u, w, 0.4, 0.32, 0.3, z);
    rock(k, u, w, z, 0.4, 0.3, C.basaltLight, 3, edge(k));
    shard(k, u - 0.2, w - 0.02, z + 0.12, 0.6, 0.3, -0.14, C.brimstoneLight, C.brimstoneDark);
    shard(k, u + 0.2, w + 0.02, z + 0.1, 0.5, 0.28, 0.12, C.brimstoneLight, C.brimstoneDark);
    shard(k, u, w + 0.06, z + 0.14, 0.92, 0.36, 0.02, C.brimstoneLight, C.brimstone);
  },
};

// A little soul in a jar, an iron lid screwed on: it glows while the
// screen is on.
const soulJar: Clutter = {
  name: 'soulJar',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.36, 0.3, 0.3, z);
    if (v.active) k.halo(u, w, z + 0.45, 0.85, C.soul, 0.45);
    k.cyl(u, w, z, 0.33, 0.76, '#9cc8c0', { line: e, top: '#b8dcd4' });
    // the soul: a wisp with two eyes, its tail curled
    const [x, y] = k.p(u, w + 0.08, z + 0.4);
    const S = k.s;
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(x, y - 0.27 * S);
    pen.bezierCurveTo(x + 0.21 * S, y - 0.27 * S, x + 0.23 * S, y + 0.08 * S, x + 0.08 * S, y + 0.19 * S);
    pen.quadraticCurveTo(x - 0.05 * S, y + 0.27 * S, x - 0.17 * S, y + 0.15 * S);
    pen.quadraticCurveTo(x - 0.04 * S, y + 0.11 * S, x - 0.12 * S, y + 0.02 * S);
    pen.bezierCurveTo(x - 0.23 * S, y - 0.08 * S, x - 0.17 * S, y - 0.27 * S, x, y - 0.27 * S);
    k.paint(v.active ? '#c8fff0' : '#e8f4ee', e * 0.8, C.soulDark);
    for (const d of [-1, 1]) k.dot(u + d * 0.065, w + 0.08, z + 0.45, 0.035 * S + 0.3, 0.05 * S + 0.3, C.soulDark);
    // the glass's shine, the lid
    k.line([[u - 0.22, w + 0.2, z + 0.12], [u - 0.22, w + 0.2, z + 0.6]], withAlpha('#ffffff', 0.7), Math.max(0.7, 0.07 * k.s));
    k.cyl(u, w, z + 0.74, 0.29, 0.18, C.iron, { line: e, top: C.ironLight });
  },
};

// A black mug of lava-hot coffee, two little horns on its rim.
const lavaMug: Clutter = {
  name: 'lavaMug',
  r: 0.4,
  h: 0.9,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.4, 0.3, 0.3, z);
    const handle: P3[] = [[u + 0.26, w, z + 0.54], [u + 0.42, w, z + 0.48], [u + 0.4, w, z + 0.18], [u + 0.26, w, z + 0.14]];
    k.line(handle, INK, 0.12 * k.s + 2 * e);
    k.line(handle, C.velvet, 0.12 * k.s);
    k.cyl(u, w, z, 0.3, 0.62, C.obsidianLight, { line: e, top: shade(C.obsidianLight, 0.2) });
    k.disc(u, w, z + 0.62, 0.23, k.rgrad(u, w, z + 0.62, 0.23, [[0, C.lavaHot], [0.6, C.lava], [1, C.lavaDeep]]), 0);
    for (const d of [-1, 1]) spike(k, u + d * 0.2, w + 0.2, z + 0.52, 0.3, 0.09, C.velvet);
  },
};

// A rubber duck with a devil's red horns: the desk's debugging companion.
const devilDuck: Clutter = {
  name: 'devilDuck',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const S = k.s * 1.2;
    const pen = k.pen;
    k.shadow(u, w, 0.44, 0.32, 0.3, z);
    const [x, y] = k.p(u, w, z);
    // the horns, then the body with its tail, the head, the beak, an eye
    for (const d of [-1, 1]) {
      const hx = x - 0.12 * S + d * 0.09 * S;
      k.fill([[hx - 0.05 * S, y - 0.6 * S], [hx + d * 0.06 * S, y - 0.82 * S], [hx + 0.05 * S, y - 0.6 * S]], C.velvet, e * 0.8);
    }
    pen.beginPath();
    pen.moveTo(x - 0.34 * S, y - 0.2 * S);
    pen.quadraticCurveTo(x - 0.34 * S, y, x - 0.05 * S, y);
    pen.lineTo(x + 0.22 * S, y);
    pen.quadraticCurveTo(x + 0.4 * S, y - 0.02 * S, x + 0.38 * S, y - 0.36 * S);
    pen.quadraticCurveTo(x + 0.3 * S, y - 0.3 * S, x + 0.2 * S, y - 0.3 * S);
    pen.quadraticCurveTo(x, y - 0.32 * S, x - 0.34 * S, y - 0.2 * S);
    pen.closePath();
    const g = pen.createLinearGradient(x - 0.4 * S, y - 0.4 * S, x + 0.4 * S, y);
    g.addColorStop(0, C.brimstoneLight);
    g.addColorStop(0.55, '#ffd23a');
    g.addColorStop(1, C.brimstoneDark);
    k.paint(g, e);
    pen.beginPath();
    pen.arc(x - 0.12 * S, y - 0.44 * S, 0.19 * S, 0, Math.PI * 2);
    k.paint('#ffe066', e);
    pen.beginPath();
    pen.moveTo(x - 0.28 * S, y - 0.46 * S);
    pen.quadraticCurveTo(x - 0.47 * S, y - 0.45 * S, x - 0.45 * S, y - 0.37 * S);
    pen.quadraticCurveTo(x - 0.36 * S, y - 0.32 * S, x - 0.26 * S, y - 0.37 * S);
    pen.closePath();
    k.paint(C.fire, e * 0.8);
    pen.beginPath();
    pen.arc(x - 0.15 * S, y - 0.49 * S, Math.max(0.7, 0.04 * S), 0, Math.PI * 2);
    pen.fillStyle = INK;
    pen.fill();
    // its wing
    pen.beginPath();
    pen.moveTo(x - 0.02 * S, y - 0.2 * S);
    pen.quadraticCurveTo(x + 0.12 * S, y - 0.08 * S, x + 0.22 * S, y - 0.18 * S);
    pen.strokeStyle = C.brimstoneDark;
    pen.lineWidth = Math.max(0.7, e * 0.7);
    pen.stroke();
  },
};

// Where they may stand: between the agent and the mirror, and along the
// front of the top, clear of the upgrade and the loop.
const SPOTS: P3[] = [
  [1.65, 0.75, TOP],
  [2.45, 1.5, TOP],
  [3.2, 2.25, TOP],
  [3.9, 1.5, TOP],
  [4.6, 2.25, TOP],
];

// ── what moves on it ───────────────────────────────────────────────────────

// A black candle stuck on a skull at the top's front right, wax run down
// the skull's crown: its flame sways while the desk is worked; out, its
// wick smokes no more than a dark tip.
const CANDLE: P3 = [6.3, 2.3, TOP];
const SKULL_R = 0.42;
const blackCandle: DeskLoop = {
  name: 'blackCandle',
  at: CANDLE,
  r: 0.55,
  h: 2.6,
  secs: 1,
  draw(v, phase) {
    const i = Math.floor(phase * 6);
const k = kitOf(v);
    const [u, w, z] = CANDLE;
    const zc = z + SKULL_R * 1.95;
    const ch = 0.8;
    k.shadow(u, w, 0.48, 0.38, 0.32, z);
    skull(k, u, w, z, SKULL_R, { line: edge(k) });
    // the candle on its crown, a drip of black wax down its brow
    k.cyl(u, w, zc, 0.21, ch, C.wax, { line: edge(k) });
    k.line([[u - 0.12, w + 0.18, zc + 0.1], [u - 0.16, w + 0.3, zc - 0.25]], shade(C.wax, 0.12), Math.max(0.9, 0.11 * k.s));
    k.line([[u + 0.1, w + 0.18, zc + 0.15], [u + 0.12, w + 0.28, zc - 0.05]], shade(C.wax, 0.12), Math.max(0.9, 0.1 * k.s));
    const wick: P3 = [u, w, zc + ch];
    if (!v.active) {
      k.line([wick, [u, w, zc + ch + 0.18]], INK, Math.max(0.8, 0.08 * k.s));
      return;
    }
    const sway = [0, 0.04, 0.07, 0.05, 0.01, -0.03][i];
    const tall = [0.62, 0.66, 0.6, 0.57, 0.62, 0.65][i];
    const glow = [0.42, 0.45, 0.4, 0.38, 0.42, 0.44][i];
    k.halo(u, w, zc + ch + 0.3, 1.05, '#ffb060', glow);
    flame(k, u, w, zc + ch + 0.04, 0.17, tall, sway);
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw,
  screen: SCREEN,
  top: [6.4, 0.6, TOP],
  clutter: { items: [hornedSkull, goblet, bones, potion, hourglass, grimoire, inkwell, brimstone, soulJar, lavaMug, devilDuck], spots: SPOTS },
  loops: [blackCandle],
};
