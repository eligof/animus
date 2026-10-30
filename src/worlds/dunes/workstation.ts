import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, Quad, WorkstationArt } from '../types.ts';
import { fillPts, hull, jar, lathe, ring, rivets, tube } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf, withAlpha } from './kit.ts';

// Dust Outpost's workstation (see WorkstationArt in ../types.ts): a scrap-wood desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Three odd planks laid across two dented steel crates; a salvaged tube
// monitor in a dented, rust-patched housing at the back, right of the
// agent; a lamp on a bent pole clamped at the left, its bulb lit while
// the screen is on; a rolled chart tied with a cord. Looks: a canteen, a
// little cactus in a tin, or a jar of bolts. The right end of the planks
// is kept clear for a desk upgrade, beside the agent rather than behind
// it.

const TOP = 5.5; // the planks' top
const BOX = { u0: 2.2, u1: 5.9, v0: 0.45, v1: 1.0, z0: TOP + 0.05, z1: 9.9 }; // the monitor's housing
const GLASS = { u0: 2.7, u1: 5.4, z0: 6.4, z1: 9.3 }; // the tube's face
const HEAD = { u: 1.35, v: 0.7, z: 8.55 }; // the lamp's shade, its mouth

const SCREEN: Quad = [
  [GLASS.u0, BOX.v1 + 0.03, GLASS.z0],
  [GLASS.u1, BOX.v1 + 0.03, GLASS.z0],
  [GLASS.u1, BOX.v1 + 0.03, GLASS.z1],
  [GLASS.u0, BOX.v1 + 0.03, GLASS.z1],
];

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = v.seed % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the crates, then the planks across them, nailed down
    steelCrate(k, 0.45, 0);
    steelCrate(k, 4.45, 1);
    const planks: Array<[number, number, number, number, Color]> = [
      [0.05, 6.9, 0.0, 1.0, C.wood],
      [0.0, 6.85, 1.0, 2.05, mix(C.wood, C.woodLight, 0.55)],
      [0.15, 7.0, 2.05, 3.0, shade(C.wood, -0.06)],
    ];
    for (const [u0, u1, v0, v1, c] of planks) k.box(u0, v0, TOP - 0.7, u1 - u0, v1 - v0, 0.7, c, { line: k.thin });
    if (k.fine) {
      const grain: Array<[P3, P3]> = [];
      for (const [u0, u1, v0, v1] of planks) {
        const w = (v0 + v1) / 2 + (hash(Math.round(v0 * 10), 1) - 0.5) * 0.3;
        grain.push([[u0 + 0.6, w, TOP + 0.01], [u0 + 2.2, w + 0.06, TOP + 0.01]], [[u1 - 2.6, w - 0.15, TOP + 0.01], [u1 - 0.8, w - 0.1, TOP + 0.01]]);
      }
      k.segs(grain, withAlpha(C.woodDark, 0.55), Math.max(0.6, 0.06 * k.s));
      const nails: P3[] = [];
      for (const u of [1.35, 5.6]) for (const [, , v0, v1] of planks) nails.push([u, (v0 + v1) / 2, TOP + 0.02]);
      rivets(k, nails, C.scrapDark, 0.09);
    }
    // the lamp on its bent pole, clamped to the back of the planks
    k.box(0.25, 0.2, TOP, 0.5, 0.4, 0.35, C.scrapDark, { line: k.thin, stripe: false });
    k.rod([[0.5, 0.4, TOP + 0.3], [0.5, 0.4, 9.2], [0.75, 0.48, 9.75], [1.05, 0.6, 9.75], [HEAD.u, HEAD.v, HEAD.z + 0.75]], C.rustDark, 0.13);
    if (v.active) {
      k.pool(HEAD.u + 0.4, HEAD.v + 1.2, 2.0, 1.2, C.lamp, 0.5, TOP + 0.02);
      k.halo(HEAD.u, HEAD.v, HEAD.z - 0.2, 1.8, C.lamp, 0.5);
    }
    lathe(k, HEAD.u, HEAD.v, HEAD.z, [[0, 0.62], [0.45, 0.42], [0.75, 0.22], [0.85, 0.14]], C.rust, { lid: C.rustDark });
    const bulb = k.ell(HEAD.u, HEAD.v, HEAD.z - 0.12, 0.28);
    k.pen.beginPath();
    k.pen.ellipse(bulb.cx, bulb.cy, bulb.rx, bulb.rx * 0.9, 0, 0, Math.PI * 2);
    k.paint(v.active ? '#fff3c8' : '#b8ab92', k.thin);
    // the tube monitor: its bulging back, the dented housing, the face
    k.box(BOX.u0 + 0.55, 0.05, TOP + 0.35, BOX.u1 - BOX.u0 - 1.1, 0.5, 3.5, C.scrapDark, { round: 0.5 });
    k.box(BOX.u0, BOX.v0, BOX.z0, BOX.u1 - BOX.u0, BOX.v1 - BOX.v0, BOX.z1 - BOX.z0, C.scrap, { round: 0.35 });
    const n = BOX.v1 + 0.01;
    k.poly([[GLASS.u0 - 0.2, n, GLASS.z0 - 0.2], [GLASS.u1 + 0.2, n, GLASS.z0 - 0.2], [GLASS.u1 + 0.2, n, GLASS.z1 + 0.2], [GLASS.u0 - 0.2, n, GLASS.z1 + 0.2]], C.scrapDark, k.thin, 0.25);
    k.poly([[GLASS.u0 - 0.04, n + 0.01, GLASS.z0 - 0.04], [GLASS.u1 + 0.04, n + 0.01, GLASS.z0 - 0.04], [GLASS.u1 + 0.04, n + 0.01, GLASS.z1 + 0.04], [GLASS.u0 - 0.04, n + 0.01, GLASS.z1 + 0.04]], '#1d2622', 0);
    // rust eating its corners and top, a dent in its side
    rust(k, [[BOX.u1 - 0.25, n, BOX.z0 + 0.15], [BOX.u1 - 1.05, n, BOX.z0 + 0.15], [BOX.u1 - 0.75, n, BOX.z0 + 0.42], [BOX.u1 - 0.25, n, BOX.z0 + 0.62]]);
    rust(k, [[BOX.u0 + 0.12, n, BOX.z1 - 1.3], [BOX.u0 + 0.12, n, BOX.z1 - 0.4], [BOX.u0 + 0.45, n, BOX.z1 - 0.6], [BOX.u0 + 0.38, n, BOX.z1 - 1.0]]);
    rust(k, [[3.6, 0.6, BOX.z1 + 0.01], [4.7, 0.55, BOX.z1 + 0.01], [4.4, 0.85, BOX.z1 + 0.01], [3.8, 0.9, BOX.z1 + 0.01]]);
    if (k.fine) k.line([[BOX.u1 - 0.32, n, 8.6], [BOX.u1 - 0.22, n, 8.2], [BOX.u1 - 0.3, n, 7.75]], withAlpha(INK, 0.55), Math.max(0.6, 0.07 * k.s));
    // two knobs under the glass
    for (const a of [GLASS.u1 - 1.0, GLASS.u1 - 0.35]) k.face(a, n + 0.02, (BOX.z0 + GLASS.z0) / 2 - 0.05, 0.2, C.steelLight, k.thin, 14);
    // a chart rolled up and tied, before the screen
    tube(k, [2.55, 2.45, TOP + 0.3], [4.4, 2.6, TOP + 0.3], 0.3, 0.3, C.cream, '#e2cfa4', k.thin);
    k.line([[3.55, 2.52, TOP + 0.62], [3.55, 2.52, TOP + 0.02]], C.cloth, Math.max(0.8, 0.1 * k.s));
    // the look's own, before the monitor
    if (look === 0) canteen(k, 5.3, 2.5, TOP);
    else if (look === 1) cactus(k, 5.2, 2.4, TOP);
    else bolts(k, 5.2, 2.35, TOP);
  },
  screen: SCREEN,
  top: [6.4, 0.6, TOP],
};

// A steel crate under the planks: banded and braced, dented, rusting.
function steelCrate(k: Kit, u0: number, i: number): void {
  const [v0, v1, w, h] = [0.35, 2.6, 2.1, TOP - 0.7];
  k.box(u0, v0, 0, w, v1 - v0, h, i ? shade(C.scrap, -0.06) : C.scrap, { stripe: false });
  const f = v1 + 0.01;
  // the bands round it, and a brace across its front
  const band = k.side(C.scrapDark, 0, 1);
  for (const [z0, z1] of [[0.15, 0.55], [h - 0.55, h - 0.15]] as const) {
    k.poly([[u0, f, z0], [u0 + w, f, z0], [u0 + w, f, z1], [u0, f, z1]], band, k.thin);
    k.poly([[u0 + w + 0.01, v0, z0], [u0 + w + 0.01, v1, z0], [u0 + w + 0.01, v1, z1], [u0 + w + 0.01, v0, z1]], k.side(C.scrapDark, 1, 0), k.thin);
  }
  const brace: P3[] = [[u0 + 0.2, f + 0.02, 0.6], [u0 + w - 0.2, f + 0.02, h - 0.6]];
  k.line(brace, INK, Math.max(1.4, 0.32 * k.s + k.thin));
  k.line(brace, band, Math.max(0.9, 0.32 * k.s));
  // the planks' shadow along its top
  k.poly([[u0, f + 0.03, h - 0.4], [u0 + w, f + 0.03, h - 0.4], [u0 + w, f + 0.03, h], [u0, f + 0.03, h]], withAlpha(INK, 0.28), 0);
  rust(k, [[u0 + w - 0.05, f, 0.6], [u0 + w - 0.85, f, 0.6], [u0 + w - 0.6, f, 1.35], [u0 + w - 0.05, f, 1.7]]);
  if (i === 1) rust(k, [[u0 + 0.05, f, h - 0.6], [u0 + 0.75, f, h - 0.6], [u0 + 0.4, f, h - 1.3], [u0 + 0.05, f, h - 1.1]]);
  if (k.fine) {
    // a dent in its front, and the bands' rivets
    k.line([[u0 + 0.35, f + 0.01, 3.2], [u0 + 0.6, f + 0.01, 2.85], [u0 + 0.95, f + 0.01, 2.95]], withAlpha(INK, 0.5), Math.max(0.6, 0.07 * k.s));
    const r: P3[] = [];
    for (const z of [0.35, h - 0.35]) for (const a of [0.25, w / 2, w - 0.25]) r.push([u0 + a, f + 0.02, z]);
    rivets(k, r, C.steelLight, 0.08);
  }
}

// A patch of rust on a face: its points in the frame, filled soft-edged.
function rust(k: Kit, pts: ReadonlyArray<P3>): void {
  k.poly(pts, withAlpha(C.rust, 0.85), 0, 0.25);
  if (k.fine) {
    const [a, b, c] = pts;
    const m: P3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    k.poly([a, [(a[0] + m[0]) / 2, (a[1] + m[1]) / 2, (a[2] + m[2]) / 2], [(c[0] + m[0]) / 2, (c[1] + m[1]) / 2, (c[2] + m[2]) / 2]], withAlpha(C.rustDark, 0.7), 0);
  }
}

// A round canteen standing on its edge: turquoise, a steel cap, a cord.
function canteen(k: Kit, u: number, v: number, z: number): void {
  const r = 0.6;
  const zc = z + r + 0.05;
  const side = hull([...ring(k, [u, v - 0.4, zc], [0, 1, 0], r, 22), ...ring(k, [u, v, zc], [0, 1, 0], r, 22)]);
  fillPts(k, side, C.turquoiseDark, k.lw);
  k.face(u, v, zc, r, C.turquoise, k.thin, 22);
  if (k.fine) k.face(u - 0.15, v + 0.01, zc + 0.15, r * 0.5, withAlpha('#ffffff', 0.18), 0, 16);
  k.cyl(u, v - 0.2, zc + r - 0.05, 0.18, 0.32, C.steelDark, { line: k.thin });
  k.line([[u - r * 0.75, v + 0.02, zc + r * 0.65], [u - 0.12, v - 0.1, zc + r + 0.2]], '#5a3a22', Math.max(0.8, 0.1 * k.s));
}

// A little ribbed cactus with one arm, in a tin can.
function cactus(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.42, 0.62, C.scrap, { line: k.thin, top: '#a88a5a' });
  if (k.fine) k.line([[u - 0.42, v + 0.05, z + 0.3], [u + 0.3, v + 0.32, z + 0.3]], withAlpha(INK, 0.3), Math.max(0.6, 0.06 * k.s));
  k.rod([[u + 0.1, v, z + 0.95], [u + 0.45, v, z + 1.0], [u + 0.48, v, z + 1.35]], C.cactusDark, 0.24);
  lathe(k, u, v, z + 0.55, [[0, 0.27], [0.7, 0.28], [0.95, 0.2], [1.08, 0.06]], C.cactus);
  const [x, y] = k.p(u, v, z + 1.62);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.16 * k.s, 0.12 * k.s, 0, 0, Math.PI * 2);
  k.paint('#e8607a', k.thin * 0.8);
}

// A jar of bolts and nuts, its lid screwed on.
function bolts(k: Kit, u: number, v: number, z: number): void {
  jar(k, u, v, z, 0.45, 1.15, '#7d817c');
  if (k.fine) {
    const r: P3[] = [];
    for (let i = 0; i < 7; i++) r.push([u - 0.28 + hash(i, 3) * 0.5, v + 0.38, z + 0.2 + hash(i, 4) * 0.6]);
    rivets(k, r, C.steelLight, 0.09);
  }
}
