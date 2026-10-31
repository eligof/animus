import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { ball, crystal, fillPts, fir, hem, hull, lantern, log, lump, mug, ring3 } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, Kit, kitOf, smallKitOf, withAlpha } from './kit.ts';

// Snowy Depths's workstation (see WorkstationArt in ../types.ts): an expedition table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Three rough planks on log bearers and log legs, a fur thrown over the
// left end and hanging down its front. Right of the agent a pane of clear
// ice, frosted at its rim, stands in a timber frame with snow on its
// lintel: the screen is the ice. The back of the right end is kept clear
// for a desk upgrade, so it shows beside the agent. Looks: the fur is
// brown, grey or white.
//
// Its clutter is what a snowbound research hut keeps on its table: a
// thermos, a pair of mittens, a compass with its lid up, a chunk of ice, a
// tin of beans with a spoon in it, a pine cone, binoculars, sample vials
// in a rack, a bobble hat, a little snowman and a candle lantern (lit
// while the desk is worked). Its spots: one on the fur at the back left,
// one at the frame's foot, two along the front, between the agent and the
// ice and apart across the picture. Its loops, at the front of the right
// end: a snow globe whose snow swirls while the desk is worked (lying at
// its foot while it is not), and a mug of cocoa that steams while it is
// worked.

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

// ── what stands on the top ───────────────────────────────────────────────
// Each drawn standing at `at` on the top with the small things' kit (a
// thinner outline), never reading v.t.

// The kit for the smallest parts of a small thing (a vial, a tree in a
// globe): its outline the small kit's inner line.
const fineKit = (k: Kit): Kit => new Kit(k.pen, k.at, k.s, k.thin);

// The screen outline of a solid of revolution up from (u, w, z): rings of
// radius r at heights dz.
function lathe(k: Kit, u: number, w: number, z: number, rings: ReadonlyArray<readonly [number, number]>): Pt[] {
  return hull(rings.flatMap(([dz, r]) => ring3([u, w, z + dz], [0, 0, 1], r, 18).map((p) => k.p(...p))));
}

// The screen outline of a round thing lying along u from u0 to u1 at (w,
// z): rings of radius r(t), t 0 at u0 and 1 at u1.
function lying(k: Kit, u0: number, u1: number, w: number, z: number, r: (t: number) => number, n = 8): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(...ring3([u0 + (u1 - u0) * t, w, z], [1, 0, 0], Math.max(0.01, r(t)), 14).map((p) => k.p(...p)));
  }
  return hull(pts);
}

// A screen shape filled lit from the left, inked.
function solid(k: Kit, pts: ReadonlyArray<Pt>, base: Color, line = k.lw): void {
  const xs = pts.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, 0.1));
  g.addColorStop(0.3, shade(base, 0.2));
  g.addColorStop(0.62, base);
  g.addColorStop(1, shade(base, -0.28));
  fillPts(k, pts, g, line);
}

// A flat thing lying on the top: its outline (frame points at the top)
// as a dark underside, then raised `h` as its face.
function flat(k: Kit, pts: ReadonlyArray<P3>, h: number, face: Color, line = k.lw): void {
  k.poly(pts, shade(face, -0.18), line);
  k.poly(
    pts.map(([a, b, c]): P3 => [a, b, c + h]),
    k.grad(pts[0], pts[Math.floor(pts.length / 2)], [
      [0, shade(face, 0.16)],
      [1, shade(face, -0.08)],
    ]),
    line,
  );
}

// A point in the top plane, (x, y) along and across a thing turned `a`
// round (u, w).
const turned = (u: number, w: number, z: number, a: number) => ([x, y]: readonly [number, number]): P3 => [u + x * Math.cos(a) - y * Math.sin(a), w + x * Math.sin(a) + y * Math.cos(a), z];

// A dot on screen at a frame point, r units round.
function dot(k: Kit, p: P3, r: number, fill: Color): void {
  const [x, y] = k.p(...p);
  k.pen.beginPath();
  k.pen.arc(x, y, Math.max(0.5, r * k.s), 0, Math.PI * 2);
  k.pen.fillStyle = fill;
  k.pen.fill();
}

// A hoop round an upright round thing: the front half of a level circle.
function hoop(k: Kit, u: number, w: number, z: number, r: number, color: Color, width: number): void {
  const pts: P3[] = ring3([u, w, z], [0, 0, 1], r, 24).filter(([a, b]) => a - u + (b - w) > -0.02);
  pts.sort((p, q) => k.p(...p)[0] - k.p(...q)[0]);
  k.line(pts, INK, width + 2 * Math.max(1, k.thin * 0.6));
  k.line(pts, color, width);
}

// A steel thermos, a red cup screwed on over its stopper.
const thermos: Clutter = {
  name: 'thermos',
  r: 0.3,
  h: 1.25,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.cyl(u, w, z, 0.27, 0.94, C.teal);
    for (const zz of [0.12, 0.78]) hoop(k, u, w, z + zz, 0.27, C.tin, Math.max(1, 0.08 * k.s));
    k.cyl(u, w, z + 0.94, 0.27, 0.28, C.wool, { top: shade(C.wool, 0.2) });
    k.line([[u - 0.15, w + 0.22, z + 0.24], [u - 0.15, w + 0.22, z + 0.66]], withAlpha('#ffffff', 0.5), Math.max(0.8, 0.07 * k.s));
  },
};

// A mitten lying flat, its thumb out to one side: (x, y) along it from the
// cuff and across it.
const MITTEN: ReadonlyArray<readonly [number, number]> = [
  [-0.38, -0.17],
  [0.08, -0.2],
  [0.26, -0.16],
  [0.36, -0.06],
  [0.36, 0.06],
  [0.26, 0.16],
  [0.08, 0.19],
  [0.08, 0.28],
  [0.0, 0.34],
  [-0.09, 0.3],
  [-0.13, 0.18],
  [-0.38, 0.17],
];
const CUFF: ReadonlyArray<readonly [number, number]> = [
  [-0.38, -0.17],
  [-0.2, -0.18],
  [-0.2, 0.18],
  [-0.38, 0.17],
];

// A pair of red knit mittens, one over the other, white cuffs.
const mittens: Clutter = {
  name: 'mittens',
  r: 0.42,
  h: 0.32,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const zig: ReadonlyArray<readonly [number, number]> = [[0.02, -0.14], [0.1, -0.07], [0.02, 0.0], [0.1, 0.07], [0.02, 0.14]];
    for (const [du, dv, dz, a] of [[-0.03, -0.06, 0, -2.75], [0.03, 0.06, 0.13, 0.35]] as const) {
      const at = (p: readonly [number, number]): P3 => turned(u + du, w + dv, z + dz, a)([p[0] * 0.9, p[1] * 0.9]);
      const up = (p: readonly [number, number]): P3 => {
        const [a1, b1, c1] = at(p);
        return [a1, b1, c1 + 0.13];
      };
      flat(k, MITTEN.map(at), 0.13, C.wool);
      k.poly(CUFF.map(up), C.furWhite, k.thin);
      k.line(zig.map(up), C.furWhite, Math.max(0.8, 0.06 * k.s));
    }
  },
};

// A brass compass, its lid up at the back, its needle red to the north.
const compass: Clutter = {
  name: 'compass',
  r: 0.36,
  h: 0.75,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    // the lid, tipped back on its hinge, a mirror inside
    const lid = ring3([u, w - 0.36, z + 0.42], [0, 1, 0.25], 0.3, 20);
    k.poly(lid, C.brass);
    k.poly(ring3([u, w - 0.34, z + 0.42], [0, 1, 0.25], 0.19, 20), k.grad([u - 0.2, w, z + 0.6], [u + 0.2, w, z + 0.25], [[0, C.frost], [1, C.ice]]), k.thin);
    // the case and its face
    k.cyl(u, w, z, 0.32, 0.14, C.brass, { top: shade(C.brass, 0.2) });
    k.disc(u, w, z + 0.141, 0.25, C.paper, k.thin);
    if (k.fine) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.line([[u + Math.cos(a) * 0.2, w + Math.sin(a) * 0.2, z + 0.142], [u + Math.cos(a) * 0.24, w + Math.sin(a) * 0.24, z + 0.142]], INK, Math.max(0.6, 0.03 * k.s));
      }
    }
    const zz = z + 0.15;
    k.poly([[u - 0.05, w, zz], [u, w - 0.2, zz], [u + 0.05, w, zz]], C.wool, 0);
    k.poly([[u - 0.05, w, zz], [u, w + 0.2, zz], [u + 0.05, w, zz]], C.iron, 0);
    dot(k, [u, w, zz], 0.035, C.brass);
  },
};

// A chunk of glacier ice: three crystals out of a drift.
const ice: Clutter = {
  name: 'ice',
  r: 0.4,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    lump(k, u, w, z, 0.38, 0.16, C.snow);
    crystal(k, u - 0.12, w - 0.08, z + 0.05, 0.16, 0.5, -0.4, -0.1, 0.3);
    crystal(k, u + 0.04, w - 0.02, z + 0.05, 0.21, 0.62, 0.05, 0, 0.1);
    crystal(k, u + 0.16, w + 0.14, z + 0.04, 0.13, 0.3, 0.45, 0.35, 0.5);
  },
};

// A tin of beans, its lid peeled back, a spoon in it; a plain band round
// it, no label.
const tinCan: Clutter = {
  name: 'tinCan',
  r: 0.34,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.cyl(u, w, z, 0.25, 0.52, C.tin);
    k.cyl(u, w, z + 0.12, 0.255, 0.28, C.navy, { line: k.thin });
    k.disc(u, w, z + 0.52, 0.2, '#c8603c', k.thin);
    // the lid, bent up at the back
    k.poly(ring3([u - 0.08, w - 0.3, z + 0.64], [0.1, 0.75, 0.66], 0.19, 18), k.grad([u - 0.2, w, z + 0.8], [u + 0.2, w, z + 0.5], [[0, '#e6ecf2'], [1, C.tin]]));
    // the spoon, its bowl down in the beans, its handle leaning out to the
    // front (clear of a screen beside it)
    const handle: P3[] = [[u + 0.04, w + 0.02, z + 0.5], [u + 0.02, w + 0.3, z + 0.88]];
    k.line(handle, INK, Math.max(1.2, 0.13 * k.s));
    k.line(handle, '#d9e1ea', Math.max(0.6, 0.06 * k.s));
  },
};

// A pine cone on its side, scale on scale.
const pineCone: Clutter = {
  name: 'pineCone',
  r: 0.4,
  h: 0.38,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const zc = z + 0.17;
    const r = (t: number) => 0.17 * Math.sin(Math.PI * (0.18 + 0.78 * t)) * (1 - 0.35 * t);
    solid(k, lying(k, u - 0.34, u + 0.36, w, zc, r), '#8a5a34');
    // its scales: little ridges in rows toward its tip
    const pen = k.pen;
    pen.beginPath();
    for (let i = 1; i < 7; i++) {
      const t = i / 7;
      const uu = u - 0.34 + 0.7 * t;
      for (const a of [-0.9, -0.2, 0.5, 1.2]) {
        const rr = r(t) * 0.95;
        const p = k.p(uu, w + Math.cos(a + i * 0.4) * rr, zc + Math.sin(a + i * 0.4) * rr);
        pen.moveTo(p[0] - 0.05 * k.s, p[1]);
        pen.quadraticCurveTo(p[0], p[1] + 0.06 * k.s, p[0] + 0.05 * k.s, p[1]);
      }
    }
    pen.strokeStyle = '#4e2f1a';
    pen.lineWidth = Math.max(0.6, 0.04 * k.s);
    pen.stroke();
    k.line([[u - 0.34, w, zc], [u - 0.44, w + 0.02, zc - 0.04]], INK, Math.max(1, 0.08 * k.s));
  },
};

// A pair of binoculars on its side, its big lenses toward the room.
const binoculars: Clutter = {
  name: 'binoculars',
  r: 0.42,
  h: 0.36,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    for (const dv of [-0.14, 0.14]) {
      const ww = w + dv;
      const zc = z + 0.15;
      solid(k, lying(k, u - 0.32, u + 0.32, ww, zc, (t) => (t < 0.25 ? 0.1 : 0.15), 6), C.ironLight);
      k.poly(ring3([u + 0.32, ww, zc], [1, 0, 0], 0.15, 16), C.iron, k.thin);
      k.poly(ring3([u + 0.33, ww, zc], [1, 0, 0], 0.1, 16), k.grad([u, ww - 0.1, zc + 0.1], [u, ww + 0.1, zc - 0.1], [[0, C.iceHi], [1, C.iceDeep]]), 0);
      k.line([[u - 0.05, ww - 0.15, zc + 0.02], [u - 0.05, ww - 0.12, zc + 0.12]], withAlpha(INK, 0.6), Math.max(0.6, 0.04 * k.s));
    }
    k.box(u - 0.12, w - 0.04, z + 0.12, 0.2, 0.08, 0.14, C.iron, { line: k.thin, stripe: false });
  },
};

// Three sample vials of meltwater in a little wooden rack.
const vials: Clutter = {
  name: 'vials',
  r: 0.42,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const f = fineKit(k);
    k.box(u - 0.4, w - 0.14, z, 0.8, 0.28, 0.1, C.woodLight, { stripe: false });
    for (const [du, water] of [[-0.24, C.ice], [0, '#9fd8b0'], [0.24, C.mustard]] as const) {
      f.cyl(u + du, w, z + 0.1, 0.11, 0.56, withAlpha(C.frost, 0.65));
      f.cyl(u + du, w, z + 0.12, 0.085, 0.3, water, { line: 0 });
      f.cyl(u + du, w, z + 0.66, 0.1, 0.12, C.woodDark);
    }
    k.box(u - 0.4, w + 0.12, z + 0.26, 0.8, 0.05, 0.1, C.wood, { stripe: false });
    for (const du of [-0.4, 0.35]) k.box(u + du, w - 0.14, z + 0.1, 0.05, 0.3, 0.26, C.wood, { line: k.thin, stripe: false });
  },
};

// A red knit bobble hat, its brim turned up, a white bobble on top.
const bobbleHat: Clutter = {
  name: 'bobbleHat',
  r: 0.36,
  h: 0.9,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.cyl(u, w, z, 0.34, 0.18, shade(C.wool, -0.12));
    hoop(k, u, w, z + 0.09, 0.34, C.furWhite, Math.max(0.8, 0.05 * k.s));
    lump(k, u, w, z + 0.14, 0.31, 0.52, C.wool);
    hoop(k, u, w, z + 0.36, 0.28, C.mustard, Math.max(1, 0.1 * k.s));
    ball(fineKit(k), u, w, z + 0.72, 0.17, C.furWhite);
  },
};

// A little snowman: three snowballs, coal eyes, a carrot nose, a twig
// arm and a knit scarf.
const snowman: Clutter = {
  name: 'snowman',
  r: 0.34,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const f = fineKit(k);
    ball(k, u, w, z + 0.28, 0.3);
    k.line([[u + 0.12, w + 0.1, z + 0.62], [u + 0.32, w + 0.12, z + 0.78], [u + 0.38, w + 0.08, z + 0.86]], INK, Math.max(1, 0.06 * k.s));
    ball(k, u, w, z + 0.68, 0.22);
    hoop(k, u, w, z + 0.86, 0.17, C.wool, Math.max(1, 0.1 * k.s));
    ball(f, u, w, z + 0.98, 0.16);
    dot(k, [u + 0.04, w + 0.14, z + 1.03], 0.03, INK);
    dot(k, [u + 0.14, w + 0.04, z + 1.03], 0.03, INK);
    k.poly([[u + 0.1, w + 0.12, z + 0.99], [u + 0.13, w + 0.15, z + 0.95], [u + 0.3, w + 0.3, z + 0.94]], C.carrot, Math.max(0.6, k.thin * 0.6));
  },
};

// A candle lantern, lit while the desk is worked.
const candleLantern: Clutter = {
  name: 'lantern',
  r: 0.34,
  h: 1.25,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    if (v.active) k.halo(u, w, z + 0.5, 0.9, C.glow, 0.45);
    lantern(k, u, w, z, v.active, 0.42);
  },
};

// The spots, a thing's width apart, in the strip between the agent at
// work and the ice: on the fur at the back left, past the frame's foot,
// along the front.
const SPOTS: readonly P3[] = [
  [1.5, 0.75, ZT + FUR],
  [2.75, 1.25, ZT],
  [3.25, 2.25, ZT],
  [4.5, 2.25, ZT],
];

// A snow globe at the front of the right end, a little fir in it: shaken
// while the desk is worked, its snow swirls round (a turn in 2 s); still,
// the snow lies at its foot.
const GLOBE: P3 = [5.45, 2.45, ZT];
const FLAKES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 0.2, 0.32, 1],
  [1.3, 0.12, 0.5, -1],
  [2.2, 0.24, 0.2, 1],
  [3.1, 0.16, 0.42, 1],
  [4.0, 0.22, 0.58, -1],
  [4.9, 0.1, 0.26, -1],
  [5.6, 0.18, 0.66, 1],
  [0.7, 0.25, 0.48, -1],
  [2.8, 0.08, 0.7, 1],
  [5.2, 0.26, 0.38, 1],
];
const snowGlobe: DeskLoop = {
  name: 'snowGlobe',
  at: GLOBE,
  r: 0.45,
  h: 1.05,
  secs: 2,
  draw(v, phase) {
    const k = smallKitOf(v);
    const f = fineKit(k);
    const [u, w, z] = GLOBE;
    solid(k, lathe(k, u, w, z, [[0, 0.4], [0.22, 0.33]]), C.woodDark);
    k.disc(u, w, z + 0.22, 0.33, shade(C.woodDark, 0.18), k.thin);
    const R = 0.38;
    const zb = z + 0.2 + R * 0.92;
    const [cx, cy] = k.p(u, w, zb);
    const pen = k.pen;
    pen.save();
    pen.beginPath();
    pen.arc(cx, cy, R * k.s, 0, Math.PI * 2);
    pen.clip();
    const water = pen.createRadialGradient(cx - R * k.s * 0.35, cy - R * k.s * 0.4, 0, cx, cy, R * k.s);
    water.addColorStop(0, C.iceHi);
    water.addColorStop(0.55, C.ice);
    water.addColorStop(1, C.iceMid);
    pen.fillStyle = water;
    pen.fillRect(cx - R * k.s, cy - R * k.s, 2 * R * k.s, 2 * R * k.s);
    fir(f, u, w, z + 0.26, 0.5, 0.22, 5);
    lump(f, u, w, z + 0.22, 0.4, v.active ? 0.1 : 0.17, C.snowHi);
    if (v.active) {
      for (const [a0, rho, zz, turn] of FLAKES) {
        const a = a0 + turn * phase * Math.PI * 2;
        dot(k, [u + Math.cos(a) * rho, w + Math.sin(a) * rho, z + 0.3 + zz + 0.05 * Math.sin(a * 2)], 0.05, '#ffffff');
      }
    }
    pen.restore();
    pen.beginPath();
    pen.arc(cx, cy, R * k.s, 0, Math.PI * 2);
    k.paint(null, k.lw);
    pen.beginPath();
    pen.arc(cx, cy, R * k.s * 0.72, Math.PI * 1.05, Math.PI * 1.45);
    pen.strokeStyle = withAlpha('#ffffff', 0.75);
    pen.lineWidth = Math.max(0.8, 0.06 * k.s);
    pen.stroke();
  },
};

// A mug of cocoa at the front corner of the right end, steaming while the
// desk is worked: three wisps rising and fading, a third of the loop apart.
const MUG: P3 = [6.4, 2.45, ZT];
const cocoa: DeskLoop = {
  name: 'cocoa',
  at: MUG,
  r: 0.45,
  h: 1.65,
  secs: 1.2,
  draw(v, phase) {
    const k = smallKitOf(v);
    const [u, w, z] = MUG;
    mug(k, u, w, z, C.wool, 0.32);
    if (!v.active) return;
    for (let j = 0; j < 3; j++) {
      const t = (phase + j / 3) % 1;
      const zz = z + 0.72 + t * 0.75;
      const du = (j - 1) * 0.09 + Math.sin(t * Math.PI * 2 + j) * 0.04;
      const a = 0.8 * Math.sin(Math.PI * t);
      k.line([[u + du - 0.04, w, zz], [u + du + 0.05, w, zz + 0.13], [u + du - 0.03, w, zz + 0.26]], withAlpha('#ffffff', a), Math.max(1, 0.09 * k.s));
    }
  },
};

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
  clutter: { items: [thermos, mittens, compass, ice, tinCan, pineCone, binoculars, vials, bobbleHat, snowman, candleLantern], spots: SPOTS },
  loops: [snowGlobe, cocoa],
};
