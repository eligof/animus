import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, Quad, WorkstationArt } from '../types.ts';
import { band, crate, fillPts, gear, glass, hull, jar, lathe, ring, rivets, ropeCoil, sack, tube } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
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
// the screen is on. Looks, on the floor between the crates: a coil of
// rope, a sack, or an open crate of scrap. The right end of the planks is
// kept clear for a desk upgrade, beside the agent rather than behind it.
//
// Its clutter (a few a desk, see clutterOf): a turquoise canteen, a little
// cactus in a tin, a jar of bolts, a bleached cow skull, a brass compass
// with its lid up, a pair of goggles, a clay water jug, a brass teapot and
// a tea glass, a rolled chart tied with a cord, a small fuel can, a little
// salvaged radio. Its loop: a salvaged desk fan at the planks' front
// right, its rusty blades turning while the desk is worked, still while it
// is not.

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

// ── what may stand on the planks ───────────────────────────────────────────
// Each stands at `at` (u, v on the planks, z their top), inside `r` round
// it and `h` over it, outlined finer than the furniture so a small thing
// keeps its colour.

const edge = (k: Kit): number => Math.max(1, k.lw * 0.45);

// A round blob in screen space at a frame point, rx x ry px.
function dot(k: Kit, p: P3, rx: number, ry: number, fill: Color): void {
  const [x, y] = k.p(...p);
  k.pen.beginPath();
  k.pen.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  k.paint(fill, 0);
}

// A thick line with ink round it (a strap, a handle, a cactus's arm).
function inked(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + 2 * edge(k));
  k.line(pts, color, w * k.s);
}

// A round canteen standing on its edge: turquoise, a steel cap, a strap.
const canteen: Clutter = {
  name: 'canteen',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const r = 0.38;
    const zc = z + r + 0.02;
    k.shadow(u, w, 0.4, 0.3, 0.3, z);
    inked(k, [[u - r * 0.9, w - 0.05, zc + 0.1], [u - r * 0.6, w - 0.1, zc + r + 0.25], [u + r * 0.6, w - 0.1, zc + r + 0.25], [u + r * 0.9, w - 0.05, zc + 0.1]], '#6a4428', 0.07);
    const side = hull([...ring(k, [u, w - 0.15, zc], [0, 1, 0], r, 22), ...ring(k, [u, w + 0.15, zc], [0, 1, 0], r, 22)]);
    fillPts(k, side, C.turquoiseDark, e);
    k.face(u, w + 0.15, zc, r, C.turquoise, e, 22);
    k.face(u, w + 0.16, zc, r * 0.62, withAlpha('#ffffff', 0.12), Math.max(0.7, e * 0.6), 18);
    k.face(u - 0.12, w + 0.17, zc + 0.13, r * 0.28, withAlpha('#ffffff', 0.3), 0, 12);
    k.cyl(u, w, zc + r - 0.06, 0.13, 0.22, C.steelDark, { line: e, top: C.steelLight });
  },
};

// A little ribbed cactus with one arm and a pink flower, in a tin can.
const cactus: Clutter = {
  name: 'cactus',
  r: 0.4,
  h: 1.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.38, 0.3, 0.3, z);
    k.cyl(u, w, z, 0.34, 0.5, C.scrap, { line: e, top: '#a88a5a' });
    k.line([[u - 0.34, w + 0.05, z + 0.24], [u + 0.25, w + 0.26, z + 0.24]], withAlpha(INK, 0.3), Math.max(0.6, 0.06 * k.s));
    inked(k, [[u + 0.08, w, z + 0.85], [u + 0.36, w, z + 0.9], [u + 0.38, w, z + 1.2]], C.cactusDark, 0.2);
    lathe(k, u, w, z + 0.46, [[0, 0.24], [0.52, 0.25], [0.72, 0.18], [0.81, 0.05]], C.cactus, { line: e });
    k.line([[u - 0.06, w + 0.2, z + 0.55], [u - 0.06, w + 0.2, z + 1.08]], withAlpha('#2a5a2a', 0.6), Math.max(0.6, 0.05 * k.s));
    // its flower on the crown, set a touch forward (clear of a screen behind)
    const [x, y] = k.p(u, w + 0.06, z + 1.3);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.15 * k.s, 0.11 * k.s, 0, 0, Math.PI * 2);
    k.paint('#ec6a86', e * 0.8);
  },
};

// A glass jar of bolts and nuts, its tin lid screwed on.
const boltJar: Clutter = {
  name: 'boltJar',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.shadow(u, w, 0.38, 0.3, 0.3, z);
    jar(k, u, w, z, 0.36, 0.95, '#8a8e88');
    const r: P3[] = [];
    for (let i = 0; i < 7; i++) r.push([u - 0.22 + hash(i, 3) * 0.42, w + 0.3, z + 0.14 + hash(i, 4) * 0.5]);
    rivets(k, r, C.steelLight, 0.07);
    rivets(k, r.slice(0, 3).map(([a, b, c]): P3 => [a + 0.03, b + 0.01, c - 0.02]), C.brassDark, 0.05);
  },
};

// A bleached cow skull propped on the planks, its horns out wide.
const cowSkull: Clutter = {
  name: 'cowSkull',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.42, 0.3, 0.3, z);
    // leaning back a little: up the face is back and up
    const P = (a: number, up: number): P3 => [u + a, w + 0.12 - up * 0.2, z + 0.03 + up * 0.95];
    for (const d of [-1, 1]) {
      const horn: P3[] = [P(d * 0.16, 0.78), P(d * 0.3, 0.8), P(d * 0.42, 0.86), P(d * 0.45, 1.0)];
      inked(k, horn.slice(0, 3), C.bone, 0.13);
      inked(k, horn.slice(2), '#9a8a70', 0.08);
    }
    const head: P3[] = [P(-0.26, 0.72), P(-0.2, 0.88), P(0, 0.92), P(0.2, 0.88), P(0.26, 0.72), P(0.2, 0.5), P(0.12, 0.16), P(0.07, 0), P(-0.07, 0), P(-0.12, 0.16), P(-0.2, 0.5)];
    k.poly(head, k.lgrad(P(-0.26, 0.6), P(0.26, 0.6), [0, 0, 1], [[0, '#fbf5e6'], [0.55, C.bone], [1, C.boneDark]]), e, 0.12);
    for (const d of [-1, 1]) {
      const [x, y] = k.p(...P(d * 0.12, 0.6));
      k.pen.beginPath();
      k.pen.ellipse(x, y, 0.085 * k.s, 0.075 * k.s, d * 0.5, 0, Math.PI * 2);
      k.pen.fillStyle = INK;
      k.pen.fill();
    }
    k.line([P(0, 0.48), P(0, 0.22)], C.boneDark, Math.max(0.6, 0.05 * k.s));
    for (const d of [-1, 1]) dot(k, P(d * 0.045, 0.08), 0.035 * k.s, 0.03 * k.s, INK);
  },
};

// A brass compass, its lid up behind it, a red needle on its face.
const compass: Clutter = {
  name: 'compass',
  r: 0.4,
  h: 0.7,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.36, 0.3, 0.3, z);
    // the lid on its hinge at the back, its inside a little mirror
    k.face(u, w - 0.3, z + 0.36, 0.3, C.brassDark, e, 20);
    k.face(u, w - 0.29, z + 0.36, 0.2, '#c9d4d0', Math.max(0.7, e * 0.6), 16);
    k.cyl(u, w, z, 0.32, 0.14, C.brass, { line: e, top: C.brassDark });
    k.disc(u, w, z + 0.15, 0.25, C.cream, Math.max(0.7, e * 0.6));
    k.poly([[u - 0.17, w + 0.08, z + 0.16], [u + 0.02, w + 0.05, z + 0.16], [u - 0.02, w - 0.05, z + 0.16]], '#d0402a', 0);
    k.poly([[u + 0.17, w - 0.08, z + 0.16], [u + 0.02, w + 0.05, z + 0.16], [u - 0.02, w - 0.05, z + 0.16]], C.steelDark, 0);
    dot(k, [u, w, z + 0.16], 0.04 * k.s, 0.03 * k.s, C.brassDark);
    k.cyl(u, w + 0.33, z + 0.04, 0.06, 0.08, C.brass, { line: e * 0.8 });
  },
};

// A pair of goggles lying lenses up, a leather strap looped behind.
const goggles: Clutter = {
  name: 'goggles',
  r: 0.4,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.42, 0.3, 0.3, z);
    const strap: P3[] = [[u - 0.36, w + 0.05, z + 0.1], [u - 0.3, w - 0.25, z + 0.06], [u, w - 0.36, z + 0.05], [u + 0.3, w - 0.25, z + 0.06], [u + 0.36, w + 0.05, z + 0.1]];
    inked(k, strap, '#6a4428', 0.09);
    inked(k, [[u - 0.06, w + 0.04, z + 0.2], [u + 0.06, w + 0.04, z + 0.2]], C.brassDark, 0.07);
    for (const d of [-1, 1]) {
      const c = u + d * 0.21;
      k.cyl(c, w + 0.04, z, 0.2, 0.18, C.brass, { line: e, top: C.brassDark });
      k.disc(c, w + 0.04, z + 0.19, 0.14, k.grad([c - 0.14, w + 0.04, z + 0.19], [c + 0.14, w + 0.04, z + 0.19], [[0, '#b8f0e6'], [1, '#3f9a90']]), Math.max(0.6, e * 0.6));
      dot(k, [c - 0.04, w + 0.02, z + 0.22], 0.04 * k.s, 0.025 * k.s, withAlpha('#ffffff', 0.85));
    }
  },
};

// A clay water jug, a cream band round its shoulder, its handle on +u.
const waterJug: Clutter = {
  name: 'waterJug',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const [r, h] = [0.3, 0.95];
    k.shadow(u, w, 0.36, 0.3, 0.3, z);
    inked(k, [[u + r * 0.45, w, z + h * 0.88], [u + r * 1.3, w, z + h * 0.8], [u + r * 1.2, w, z + h * 0.42], [u + r * 0.8, w, z + h * 0.36]], C.clay, 0.07);
    lathe(k, u, w, z, [[0, r * 0.62], [h * 0.3, r], [h * 0.6, r * 0.86], [h * 0.8, r * 0.46], [h, r * 0.58]], C.clay, { mouth: shade(C.clay, -0.3), line: e });
    band(k, u, w, z + h * 0.55, r * 0.92, C.cream, Math.max(0.8, 0.09 * k.s));
  },
};

// A brass teapot, its spout curved up on -u, its handle on +u, a tea
// glass beside it.
const teapot: Clutter = {
  name: 'teapot',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const c = u + 0.06;
    k.shadow(u, w, 0.42, 0.32, 0.3, z);
    inked(k, [[c + 0.2, w, z + 0.56], [c + 0.34, w, z + 0.52], [c + 0.32, w, z + 0.22], [c + 0.2, w, z + 0.18]], C.brassDark, 0.06);
    inked(k, [[c - 0.18, w, z + 0.24], [c - 0.3, w, z + 0.36], [c - 0.38, w, z + 0.56], [c - 0.46, w, z + 0.6]], C.brass, 0.07);
    lathe(k, c, w, z, [[0, 0.16], [0.06, 0.22], [0.28, 0.27], [0.48, 0.22], [0.56, 0.13], [0.62, 0.12]], C.brass, { line: e });
    lathe(k, c, w, z + 0.62, [[0, 0.13], [0.14, 0.1], [0.2, 0.04], [0.26, 0.05]], C.brassDark, { line: e });
    k.cyl(c, w, z + 0.86, 0.045, 0.06, C.brass, { line: e * 0.8 });
    band(k, c, w, z + 0.3, 0.26, withAlpha('#fff2c0', 0.7), Math.max(0.7, 0.05 * k.s));
    glass(k, u - 0.22, w + 0.26, z, 0.12, 0.36);
  },
};

// A chart rolled up and tied with a cord.
const chart: Clutter = {
  name: 'chart',
  r: 0.4,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.44, 0.24, 0.28, z);
    tube(k, [u - 0.4, w + 0.06, z + 0.18], [u + 0.4, w - 0.06, z + 0.18], 0.17, 0.17, C.cream, '#e2cfa4', e);
    k.line([[u - 0.02, w + 0.13, z + 0.34], [u - 0.02, w + 0.16, z + 0.02]], C.cloth, Math.max(0.8, 0.08 * k.s));
    k.line([[u + 0.08, w + 0.16, z + 0.05], [u + 0.14, w + 0.3, z + 0.01]], C.cloth, Math.max(0.8, 0.06 * k.s));
  },
};

// A small fuel can of pressed steel, faded red, a cross stamped in its
// side, a spout on top.
const fuelCan: Clutter = {
  name: 'fuelCan',
  r: 0.4,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const [u0, v0, du, dv, dz] = [u - 0.33, w - 0.2, 0.66, 0.4, 0.8];
    const red = '#b04a32';
    k.shadow(u, w, 0.4, 0.3, 0.3, z);
    k.box(u0, v0, z, du, dv, dz, red, { line: e, stripe: false });
    const f = v0 + dv + 0.01;
    const x: Array<readonly [P3, P3]> = [
      [[u0 + 0.1, f, z + 0.1], [u0 + du - 0.1, f, z + dz - 0.12]],
      [[u0 + 0.1, f, z + dz - 0.12], [u0 + du - 0.1, f, z + 0.1]],
    ];
    k.segs(x, shade(red, 0.22), Math.max(0.8, 0.08 * k.s), 'round');
    k.poly([[u0 + du - 0.02, v0 + 0.05, z + 0.12], [u0 + du - 0.02, v0 + 0.3, z + 0.12], [u0 + du - 0.02, v0 + 0.3, z + 0.32], [u0 + du - 0.02, v0 + 0.05, z + 0.4]], withAlpha(C.rustDark, 0.7), 0);
    // the handle and the spout on top
    inked(k, [[u - 0.22, w, z + dz], [u - 0.18, w, z + dz + 0.14], [u + 0.04, w, z + dz + 0.14], [u + 0.08, w, z + dz]], shade(red, -0.1), 0.06);
    k.cyl(u + 0.2, w + 0.05, z + dz, 0.08, 0.2, C.steelDark, { line: e * 0.8 });
  },
};

// A small salvaged radio: a cream case, a round speaker in its front, a
// dial and a knob, its aerial up and bent.
const radio: Clutter = {
  name: 'radio',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const [u0, v0, du, dv, dz] = [u - 0.34, w - 0.16, 0.68, 0.34, 0.5];
    const f = v0 + dv + 0.01;
    k.shadow(u, w, 0.4, 0.28, 0.3, z);
    k.line([[u + 0.22, w - 0.08, z + dz], [u + 0.26, w - 0.1, z + 1.0], [u + 0.12, w - 0.1, z + 1.25]], INK, Math.max(1, 0.05 * k.s + e));
    k.line([[u + 0.22, w - 0.08, z + dz], [u + 0.26, w - 0.1, z + 1.0], [u + 0.12, w - 0.1, z + 1.25]], C.steelLight, Math.max(0.6, 0.05 * k.s));
    k.box(u0, v0, z, du, dv, dz, C.cream, { line: e, stripe: false });
    k.face(u - 0.12, f, z + 0.25, 0.17, C.turquoiseDark, e * 0.8, 16);
    if (k.s >= 5) {
      const holes: P3[] = [];
      for (const [da, dz2] of [[-0.06, 0.05], [0.06, 0.05], [0, -0.05], [-0.06, -0.08], [0.06, -0.08], [0, 0.11]] as const) holes.push([u - 0.12 + da, f + 0.01, z + 0.25 + dz2]);
      rivets(k, holes, withAlpha(INK, 0.6), 0.025);
    }
    k.rect(u + 0.06, z + 0.3, u + 0.28, z + 0.4, f, '#f6d88a', Math.max(0.6, e * 0.6));
    k.face(u + 0.17, f, z + 0.15, 0.06, C.brassDark, Math.max(0.6, e * 0.6), 10);
    k.poly([[u0 + du + 0.01, v0 + 0.05, z + 0.08], [u0 + du + 0.01, v0 + 0.22, z + 0.08], [u0 + du + 0.01, v0 + 0.22, z + 0.22], [u0 + du + 0.01, v0 + 0.05, z + 0.3]], withAlpha(C.rust, 0.7), 0);
  },
};

const ITEMS: Clutter[] = [canteen, cactus, boltJar, cowSkull, compass, goggles, waterJug, teapot, chart, fuelCan, radio];

// Where they may stand: between the agent and the monitor, and along the
// front of the planks, clear of the upgrade and the fan.
const SPOTS: P3[] = [
  [1.65, 0.75, TOP],
  [2.45, 1.5, TOP],
  [3.2, 2.25, TOP],
  [4.05, 1.65, TOP],
  [4.9, 2.25, TOP],
];

// ── what moves on it ───────────────────────────────────────────────────────

// A salvaged desk fan at the planks' front right, facing out over the
// front of the desk: a weighted foot, a bent neck, the motor behind, three
// rusty tin blades in a wire cage. While the desk is worked its blades
// turn (a third of a turn round the loop, so it meets itself); still
// while it is not.
const FAN: P3 = [6.25, 2.3, TOP];
const FAN_R = 0.56; // the cage
const fan: DeskLoop = {
  name: 'fan',
  at: FAN,
  r: 0.6,
  h: 1.95,
  secs: 0.75,
  draw(v, phase) {
    const k = kitOf(v);
    const e = edge(k);
    const [u, w, z] = FAN;
    const zc = z + 1.3;
    // its face points out along n, over the front and a little to +u; a
    // (level) and z span it
    const n: P3 = [0.29, 0.96, 0];
    const a: P3 = [0.96, -0.29, 0];
    const at = (r: number, th: number, out = 0): P3 => [u + a[0] * r * Math.cos(th) + n[0] * out, w + a[1] * r * Math.cos(th) + n[1] * out, zc + r * Math.sin(th)];
    const loop = (r: number, out: number, steps = 24): Pt[] => Array.from({ length: steps }, (_, j) => k.p(...at(r, (j / steps) * Math.PI * 2, out)));
    k.shadow(u, w, 0.54, 0.4, 0.3, z);
    // the foot and the neck, the motor behind the cage
    k.cyl(u, w - 0.05, z, 0.4, 0.16, C.scrapDark, { line: e, top: C.scrap });
    inked(k, [[u, w - 0.05, z + 0.16], [u + 0.03, w - 0.14, z + 0.7], [u, w - 0.18, zc - 0.12]], C.steelDark, 0.12);
    tube(k, at(0, 0, -0.5), at(0, 0, -0.12), 0.24, 0.2, C.steelDark, null, e);
    // the cage's back ring, the blades, the hub, the cage's front
    fillPts(k, loop(FAN_R, -0.04), withAlpha('#1e1006', 0.28), 0);
    const turn = phase * ((Math.PI * 2) / 3);
    for (let b = 0; b < 3; b++) {
      const th = turn + (b * Math.PI * 2) / 3 + Math.PI / 2;
      const blade: Pt[] = [];
      for (const [r, d] of [[0.2, -0.4], [0.6, -0.62], [0.9, -0.42], [0.92, 0.12], [0.74, 0.5], [0.2, 0.32]] as const) blade.push(k.p(...at(r * FAN_R, th + d, 0)));
      // lit as it turns toward the light, a little at a time
      fillPts(k, blade, mix(C.rust, C.clothLight, 0.5 - 0.5 * Math.cos(th)), e * 0.8);
    }
    fillPts(k, loop(0.22 * FAN_R, 0.02, 12), C.steelLight, e * 0.8);
    const cage = loop(FAN_R, 0.06);
    fillPts(k, cage, null, Math.max(1, e * 1.4));
    k.pen.beginPath();
    cage.forEach(([x, y], j) => (j ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
    k.pen.closePath();
    k.pen.strokeStyle = C.steelLight;
    k.pen.lineWidth = Math.max(0.7, e * 0.6);
    k.pen.stroke();
    for (const th of [0, Math.PI / 2]) {
      const [p, q] = [k.p(...at(FAN_R, th, 0.06)), k.p(...at(FAN_R, th + Math.PI, 0.06))];
      k.pen.beginPath();
      k.pen.moveTo(p[0], p[1]);
      k.pen.lineTo(q[0], q[1]);
      k.pen.strokeStyle = withAlpha(C.steelLight, 0.8);
      k.pen.lineWidth = Math.max(0.6, e * 0.45);
      k.pen.stroke();
    }
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = v.seed % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the crates with the look's own on the floor between them, then the
    // planks across them, nailed down
    steelCrate(k, 0.45, 0);
    if (look === 0) ropeCoil(k, 3.4, 1.6, 0, 0.62);
    else if (look === 1) sack(k, 3.5, 1.5, 0, 0.62, 1.5);
    else {
      crate(k, 2.85, 0.7, 0, 1.3, 1.2, 1.1, C.woodLight, true);
      gear(k, 3.35, 1.85, 0.75, 0.32, 8, C.scrap);
    }
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
  },
  screen: SCREEN,
  top: [6.4, 0.6, TOP],
  clutter: { items: ITEMS, spots: SPOTS },
  loops: [fan],
};
