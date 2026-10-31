import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { Color } from '../../art/types.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { across, dot, fillPts, frustum, hull, ring, rivets, sleeve } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Atomic Shelter's workstation (see WorkstationArt in ../types.ts): a steel desk with a terminal.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A riveted steel desk on a drawer pedestal (its left end) and a plain
// side panel (its right end), a teal trim along its front edge. On it, at
// the right, a chunky teal terminal in a riveted case (its right back
// corner kept clear for a desk upgrade), the glass set in a
// dark bezel with a rim of green phosphor; before the agent a keyboard,
// and at the front left a gooseneck lamp, its shade mint, pink or aqua by
// look, lit while the screen is on.
//
// Its clutter (a few a desk, see clutterOf), what a fallout shelter's
// desks gather, on spots beside the terminal and along the front: a
// stack of punch cards, two tins of food, a bottle of pop, a first-aid
// tin, a pair of dice, a tin toy robot, a gas mask, a jar of bottle
// caps, a lunchbox, a twin-bell alarm clock and a tin toy rocket (plain
// shapes and colours: no names, no marks but a first-aid cross). Its
// loops, while the desk is worked (still and dark while not): a desk fan
// at the front of the right end, its head swinging and its blades
// turning, and an amber work light on the terminal's roof, its beam going
// round.

const ZT = 6.0; // the desk's top
const GLASS = { u0: 2.95, u1: 5.55, n: 1.35, z0: 6.7, z1: 9.45 };
// The keyboard, before the agent (the front of the top right of it is for
// the clutter).
const KB = { u0: 0.85, v0: 1.85, du: 1.3, dv: 0.9 };
const SHADES = [C.mint, C.pink, C.aqua] as const;

// ── on the top: the clutter and the loops ───────────────────────────────────

// Where a thing may stand: one by the terminal's front left corner, past
// the keyboard, and three along the front of the top, before the glass.
const SPOTS: readonly P3[] = [
  [2.45, 1.7, ZT],
  [3.35, 2.25, ZT],
  [4.37, 2.25, ZT],
  [5.39, 2.25, ZT],
];

// The ink of a small thing: its outline (`edge`, two thirds of the kit's
// thin line) and its inner lines (`hair`), so a thing under a unit across
// does not drown in ink.
const edge = (k: Kit) => Math.max(0.8, k.thin * 0.65);
const hair = (k: Kit) => Math.max(0.6, k.thin * 0.4);

// A thin rod for a small thing (a handle, an arm): ink under colour, w units.
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + hair(k) * 2);
  k.line(pts, color, w * k.s);
}

// A ball round (u, w, z), r round, shaded from the upper left.
function ball(k: Kit, u: number, w: number, z: number, r: number, base: Color, line = hair(k)): void {
  const [x, y] = k.p(u, w, z);
  const rx = r * Math.SQRT2 * k.s;
  const ry = r * 1.22 * k.s;
  const pen = k.pen;
  const g = pen.createRadialGradient(x - rx * 0.35, y - ry * 0.4, 0, x, y, rx * 1.05);
  g.addColorStop(0, shade(base, 0.4));
  g.addColorStop(0.5, base);
  g.addColorStop(1, shade(base, -0.28));
  pen.beginPath();
  pen.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  k.paint(g, line);
}

// An upright round body turned on a lathe: rings of radius r at heights z
// over (u, w), filled as one silhouette, shaded across.
function turned(k: Kit, u: number, w: number, prof: ReadonlyArray<readonly [number, number]>, base: Color, line = edge(k)): void {
  const pts = prof.flatMap(([z, r]) => ring(k, [u, w, z], [0, 0, 1], Math.max(r, 0.001), 18));
  const sil = hull(pts);
  fillPts(k, sil, across(k, sil, base), line);
}

// A stack of punch cards squared off, an orange band round them and rows
// of holes in the top one.
const punchCards: Clutter = {
  name: 'punchCards',
  r: 0.4,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    for (let i = 0; i < 4; i++) {
      const d = (i & 1) * 0.05 - 0.025;
      k.box(u - 0.36 + d, w - 0.22 - d, z + i * 0.13, 0.72, 0.44, 0.13, i & 1 ? '#f2e9cf' : C.cream, { line: hair(k), stripe: false });
    }
    const zc = z + 0.53;
    k.poly([[u - 0.14, w - 0.24, zc], [u + 0.04, w - 0.24, zc], [u + 0.04, w + 0.22, zc], [u - 0.14, w + 0.22, zc]], C.orange, 0);
    k.rect(u - 0.14, z + 0.02, u + 0.04, zc, w + 0.225, shade(C.orange, -0.1), 0);
    const holes: Array<[P3, P3]> = [];
    for (let r = 0; r < 3; r++) for (const du of [-0.3, -0.24, 0.12, 0.2, 0.27]) {
      const ww = w - 0.12 + r * 0.12;
      holes.push([[u + du, ww, zc], [u + du + 0.04, ww, zc]]);
    }
    k.segs(holes, withAlpha('#4a4a40', 0.8), Math.max(0.6, 0.05 * k.s));
  },
};

// Two tins of food, a small one on a big one, plain bands round them.
const tins: Clutter = {
  name: 'tins',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    tinCan(k, u, w, z, 0.3, 0.52, C.red);
    tinCan(k, u + 0.03, w + 0.02, z + 0.52, 0.22, 0.38, C.teal);
  },
};

// A tin can as tin(), but inked round for a thing on a desk.
function tinCan(k: Kit, u: number, w: number, z: number, r: number, h: number, band: Color): void {
  k.cyl(u, w, z, r, h, '#b9c0c2', { line: edge(k), top: '#d8dee0' });
  sleeve(k, u, w, r, z + h * 0.2, z + h * 0.8, band);
  const e = k.ell(u, w, z + h, r * 0.72);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  k.pen.strokeStyle = withAlpha(INK, 0.35);
  k.pen.lineWidth = Math.max(0.5, 0.05 * k.s);
  k.pen.stroke();
}

// A bottle of pop: plain green glass, a cream label, a red crown cap.
const popBottle: Clutter = {
  name: 'popBottle',
  r: 0.4,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const glass = '#6fbf9a';
    turned(k, u, w, [[z, 0.17], [z + 0.55, 0.17], [z + 0.72, 0.13], [z + 0.86, 0.07], [z + 1.05, 0.065]], glass);
    sleeve(k, u, w, 0.172, z + 0.18, z + 0.45, C.cream);
    // a shine down the glass, the cap
    k.line([[u - 0.1, w + 0.1, z + 0.12], [u - 0.1, w + 0.1, z + 0.55]], withAlpha('#ffffff', 0.55), Math.max(0.7, 0.05 * k.s));
    k.cyl(u, w, z + 1.03, 0.085, 0.09, C.red, { line: hair(k) });
  },
};

// A first-aid tin: a green box with a white cross on its front and a
// handle on its lid.
const firstAid: Clutter = {
  name: 'firstAid',
  r: 0.4,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const g = '#3f8a52';
    k.box(u - 0.35, w - 0.2, z, 0.7, 0.4, 0.42, g, { line: edge(k), round: 0.05 });
    k.line([[u - 0.35, w + 0.205, z + 0.32], [u + 0.35, w + 0.205, z + 0.32]], withAlpha(INK, 0.5), hair(k));
    const n = w + 0.21;
    const zc = z + 0.17;
    k.rect(u - 0.06, zc - 0.11, u + 0.06, zc + 0.11, n, C.cream, 0);
    k.rect(u - 0.15, zc - 0.045, u + 0.15, zc + 0.045, n, C.cream, 0);
    stick(k, [[u - 0.14, w, z + 0.42], [u - 0.12, w, z + 0.55], [u + 0.12, w, z + 0.55], [u + 0.14, w, z + 0.42]], C.chrome, 0.05);
  },
};

// A pair of red dice, one tipped against the other, white pips.
const dice: Clutter = {
  name: 'dice',
  r: 0.4,
  h: 0.45,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const d = 0.32;
    for (const [du, dv, pips] of [[-0.34, -0.3, 3], [0.02, 0.0, 5]] as const) {
      const u0 = u + du;
      const v0 = w + dv;
      k.box(u0, v0, z, d, d, d, C.red, { line: hair(k) * 1.4, round: 0.04, stripe: false });
      const zt = z + d + 0.005;
      const at: Array<readonly [number, number]> = pips === 3 ? [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]] : [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]];
      for (const [a, b] of at) dot(k, u0 + a * d, v0 + b * d, zt, 0.035, C.cream);
      dot(k, u0 + d * 0.5, v0 + d + 0.005, z + d * 0.5, 0.035, C.cream);
    }
  },
};

// A tin toy robot: a boxy silver body with a red chest plate and two
// dials, a square head with yellow eyes and an aerial, arms at its sides.
const tinRobot: Clutter = {
  name: 'tinRobot',
  r: 0.4,
  h: 1.25,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const tinC = '#c9d1d4';
    // feet, then the arms behind, the body, the head
    for (const du of [-0.2, 0.04]) k.box(u + du, w - 0.12, z, 0.16, 0.26, 0.12, C.black, { line: hair(k), stripe: false });
    for (const d of [-1, 1]) stick(k, [[u + d * 0.27, w, z + 0.68], [u + d * 0.33, w + 0.05, z + 0.38]], tinC, 0.1);
    k.box(u - 0.23, w - 0.16, z + 0.12, 0.46, 0.32, 0.52, tinC, { line: edge(k), round: 0.04 });
    k.rect(u - 0.15, z + 0.22, u + 0.15, z + 0.52, w + 0.165, C.red, hair(k));
    for (const du of [-0.07, 0.07]) dot(k, u + du, w + 0.17, z + 0.44, 0.04, C.mustard);
    k.rect(u - 0.1, z + 0.27, u + 0.1, z + 0.31, w + 0.17, C.cream, 0);
    k.box(u - 0.18, w - 0.13, z + 0.64, 0.36, 0.26, 0.3, tinC, { line: edge(k), round: 0.04 });
    for (const du of [-0.08, 0.08]) dot(k, u + du, w + 0.135, z + 0.81, 0.055, v.active ? '#fff3a0' : C.mustard, hair(k));
    k.rect(u - 0.09, z + 0.69, u + 0.09, z + 0.72, w + 0.135, C.black, 0);
    stick(k, [[u, w, z + 0.94], [u, w, z + 1.1]], C.chrome, 0.035);
    dot(k, u, w, z + 1.13, 0.065, C.red, hair(k));
  },
};

// A gas mask set upright: an olive rubber face, two big round eyepieces
// rimmed in steel and the round filter at its snout.
const gasMask: Clutter = {
  name: 'gasMask',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const rubber = '#7d8c6a';
    const n = w;
    // the strap round the back
    k.line([[u - 0.3, n - 0.1, z + 0.6], [u, n - 0.24, z + 0.7], [u + 0.3, n - 0.1, z + 0.6]], C.black, Math.max(1, 0.08 * k.s));
    // the face: a rounded shield, broad at the brow
    const face: P3[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const rx = 0.34 * (1 - 0.22 * Math.max(0, -Math.sin(a)));
      face.push([u + Math.cos(a) * rx, n, z + 0.5 + Math.sin(a) * 0.42]);
    }
    k.poly(face, k.lgrad([u - 0.34, n, z], [u + 0.34, n, z], [0, 0, 1], [[0, shade(rubber, 0.2)], [0.6, rubber], [1, shade(rubber, -0.25)]]), edge(k));
    for (const du of [-0.15, 0.15]) {
      k.face(u + du, n + 0.01, z + 0.62, 0.13, C.chrome, hair(k), 16);
      k.face(u + du, n + 0.02, z + 0.62, 0.09, '#bfe2dc', 0, 16);
      k.face(u + du - 0.03, n + 0.03, z + 0.65, 0.03, '#ffffff', 0, 8);
    }
    k.face(u, n + 0.04, z + 0.28, 0.15, C.steelDark, hair(k), 16);
    k.face(u, n + 0.05, z + 0.28, 0.1, C.steel, hair(k), 14);
  },
};

// A glass jar of bottle caps, a tin lid on it: the caps red, cream, teal
// and gold through the glass.
const capJar: Clutter = {
  name: 'capJar',
  r: 0.4,
  h: 0.8,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.27;
    k.cyl(u, w, z, r, 0.62, '#cfe4e0', { line: edge(k), top: '#dceeea' });
    const caps: Array<[number, number, Color]> = [
      [-0.12, 0.1, C.red], [0.02, 0.08, C.cream], [0.14, 0.12, C.teal],
      [-0.06, 0.24, C.mustard], [0.1, 0.25, C.red], [-0.15, 0.36, C.teal],
      [0.0, 0.38, C.orange], [0.14, 0.4, C.cream],
    ];
    for (const [du, dz, c] of caps) {
      const [x, y] = k.p(u + du * 0.8 + 0.1, w + 0.1, z + dz);
      k.pen.beginPath();
      k.pen.ellipse(x, y, 0.08 * k.s, 0.05 * k.s, 0, 0, Math.PI * 2);
      k.paint(c, Math.max(0.5, hair(k) * 0.7));
    }
    k.line([[u - 0.17, w + 0.17, z + 0.1], [u - 0.17, w + 0.17, z + 0.5]], withAlpha('#ffffff', 0.6), Math.max(0.7, 0.05 * k.s));
    k.cyl(u, w, z + 0.6, r + 0.02, 0.12, C.chrome, { line: hair(k) * 1.4 });
  },
};

// A tin lunchbox standing on its end: teal with a cream band and a
// chrome latch, a wire handle over its top.
const lunchbox: Clutter = {
  name: 'lunchbox',
  r: 0.4,
  h: 0.75,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.box(u - 0.36, w - 0.15, z, 0.72, 0.3, 0.52, C.teal, { line: edge(k), round: 0.06 });
    k.rect(u - 0.36, z + 0.2, u + 0.36, z + 0.33, w + 0.155, C.cream, 0);
    k.rect(u - 0.05, z + 0.36, u + 0.05, z + 0.46, w + 0.16, C.chrome, hair(k));
    stick(k, [[u - 0.18, w, z + 0.52], [u - 0.15, w, z + 0.68], [u + 0.15, w, z + 0.68], [u + 0.18, w, z + 0.52]], C.chrome, 0.045);
  },
};

// A twin-bell alarm clock: a round cream face in a red case on little
// feet, two bells on top; plain hands, no numbers.
const alarmClock: Clutter = {
  name: 'alarmClock',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const n = w + 0.1;
    const zc = z + 0.42;
    for (const d of [-1, 1]) stick(k, [[u + d * 0.12, w, z + 0.18], [u + d * 0.2, w + 0.04, z]], C.chrome, 0.05);
    for (const d of [-1, 1]) {
      stick(k, [[u + d * 0.08, w, zc + 0.26], [u + d * 0.17, w, zc + 0.34]], C.chrome, 0.035);
      ball(k, u + d * 0.19, w, zc + 0.38, 0.12, C.brass);
    }
    // the case: its back rim, then the front
    k.face(u, n - 0.2, zc, 0.31, shade(C.red, -0.25), edge(k), 22);
    k.poly([[u - 0.31, n - 0.2, zc], [u - 0.31, n, zc], [u + 0.31, n, zc], [u + 0.31, n - 0.2, zc]], shade(C.red, -0.25), 0);
    k.face(u, n, zc, 0.31, C.red, edge(k), 22);
    k.face(u, n + 0.01, zc, 0.21, C.cream, hair(k), 22);
    k.line([[u, n + 0.02, zc], [u, n + 0.02, zc + 0.14]], C.black, Math.max(0.8, 0.05 * k.s));
    k.line([[u, n + 0.02, zc], [u + 0.1, n + 0.02, zc - 0.04]], C.black, Math.max(0.8, 0.05 * k.s));
  },
};

// A tin toy rocket on three fins: a cream body with a red band, a red
// nose and fins, a round porthole.
const toyRocket: Clutter = {
  name: 'toyRocket',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const n = w;
    const fin = (pts: P3[], c: Color) => k.poly(pts, c, edge(k));
    // the fin behind, the body, its band and nose, then the fins at its
    // sides and the one before it
    fin([[u, n - 0.16, z + 0.45], [u, n - 0.34, z + 0.1], [u, n - 0.34, z], [u, n - 0.14, z + 0.12]], shade(C.red, -0.2));
    turned(k, u, w, [[z + 0.06, 0.13], [z + 0.18, 0.2], [z + 0.6, 0.2], [z + 0.84, 0.15], [z + 1.0, 0.08], [z + 1.08, 0.02]], C.cream, edge(k));
    sleeve(k, u, w, 0.2, z + 0.24, z + 0.34, C.red);
    turned(k, u, w, [[z + 0.84, 0.15], [z + 1.0, 0.08], [z + 1.1, 0.02], [z + 1.16, 0.001]], C.red, edge(k));
    for (const d of [-1, 1]) fin([[u + d * 0.17, n, z + 0.42], [u + d * 0.36, n, z + 0.1], [u + d * 0.36, n, z], [u + d * 0.15, n, z + 0.1]], C.red);
    fin([[u, n + 0.18, z + 0.3], [u, n + 0.3, z + 0.06], [u, n + 0.3, z], [u, n + 0.16, z + 0.04]], C.red);
    k.face(u + 0.08, n + 0.19, z + 0.58, 0.09, C.chrome, hair(k), 12);
    k.face(u + 0.08, n + 0.2, z + 0.58, 0.06, v.active ? '#d8f6ff' : C.aqua, 0, 12);
  },
};

const CLUTTER: readonly Clutter[] = [punchCards, tins, popBottle, firstAid, dice, tinRobot, gasMask, capJar, lunchbox, alarmClock, toyRocket];

// The desk fan at the front of the right end: a teal foot and neck, a
// motor behind a round chrome guard and three brass blades. While the
// desk is worked its head swings slowly side to side and its blades turn
// a third of a turn a loop (three blades: seamless).
const FAN_AT: P3 = [6.35, 2.45, ZT];
const FAN: DeskLoop = {
  name: 'deskFan',
  at: FAN_AT,
  r: 0.5,
  h: 1.35,
  secs: 1,
  draw(v, phase) {
    const k = kitOf(v);
    const [u, w, z] = FAN_AT;
    const t = v.active ? phase : 0;
    const swing = Math.PI / 4 + 0.38 * Math.sin(t * Math.PI * 2);
    const spin = t * ((Math.PI * 2) / 3);
    const d: P3 = [Math.cos(swing), Math.sin(swing), 0];
    const zc = z + 0.88;
    k.cyl(u, w, z, 0.3, 0.1, C.teal, { line: edge(k) });
    stick(k, [[u, w, z + 0.1], [u - d[0] * 0.08, w - d[1] * 0.08, zc - 0.1]], C.teal, 0.09);
    // the motor, behind the guard
    ball(k, u - d[0] * 0.17, w - d[1] * 0.17, zc, 0.17, C.teal, edge(k));
    const c: P3 = [u + d[0] * 0.04, w + d[1] * 0.04, zc];
    const R = 0.38;
    // the guard's plane: across it along a (level), up it along z
    const a: P3 = [-d[1], d[0], 0];
    const at = (rr: number, th: number, off = 0): Pt => k.p(c[0] + a[0] * rr * Math.cos(th) + d[0] * off, c[1] + a[1] * rr * Math.cos(th) + d[1] * off, c[2] + rr * Math.sin(th));
    const guard = Array.from({ length: 24 }, (_, j) => at(R, (j / 24) * Math.PI * 2));
    fillPts(k, guard, withAlpha(C.chrome, 0.28), 0);
    // the blades: three lobes round the hub
    for (let j = 0; j < 3; j++) {
      const th = spin + (j * Math.PI * 2) / 3;
      const lobe = [at(0.06, th - 0.9), at(0.24, th - 0.42), at(0.33, th - 0.05), at(0.3, th + 0.3), at(0.12, th + 0.55)];
      fillPts(k, lobe, C.brass, hair(k));
    }
    fillPts(k, Array.from({ length: 12 }, (_, j) => at(0.07, (j / 12) * Math.PI * 2, 0.02)), C.teal, hair(k));
    // the guard's wires and rim
    const pen = k.pen;
    pen.beginPath();
    for (let j = 0; j < 6; j++) {
      const th = (j / 6) * Math.PI * 2 + 0.26;
      const [x0, y0] = at(0.08, th, 0.03);
      const [x1, y1] = at(R, th);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = withAlpha(shade(C.chrome, -0.3), 0.9);
    pen.lineWidth = Math.max(0.5, hair(k) * 0.7);
    pen.stroke();
    fillPts(k, guard, null, edge(k));
    pen.beginPath();
    guard.forEach(([x, y], j) => (j ? pen.lineTo(x, y) : pen.moveTo(x, y)));
    pen.closePath();
    pen.strokeStyle = C.chrome;
    pen.lineWidth = Math.max(0.6, hair(k) * 0.9);
    pen.stroke();
  },
};

// The work light on the terminal's roof: a chrome cup and an amber glass
// dome. While the desk is worked a lamp turns inside it, its bright side
// coming round to the front and going away again (a smooth swell, never
// a blink); while not, the glass is dull.
const BEACON_AT: P3 = [4.9, 0.75, ZT + 3.95];
const BEACON: DeskLoop = {
  name: 'workLight',
  at: BEACON_AT,
  r: 0.3,
  h: 0.5,
  secs: 1,
  draw(v, phase) {
    const k = kitOf(v);
    const [u, w, z] = BEACON_AT;
    k.cyl(u, w, z, 0.22, 0.1, C.chrome, { line: hair(k) * 1.4 });
    const [x, y] = k.p(u, w, z + 0.1);
    const R = 0.18 * Math.SQRT2 * k.s;
    const H = 0.3 * k.s;
    const pen = k.pen;
    const lit = v.active;
    const th = phase * Math.PI * 2;
    const toward = 0.5 + 0.5 * Math.cos(th); // 1: its bright side to the front
    if (lit) k.halo(u, w, z + 0.25, 0.45, C.valve, 0.25 + 0.4 * toward);
    pen.beginPath();
    pen.moveTo(x - R, y);
    pen.bezierCurveTo(x - R, y - H * 1.25, x + R, y - H * 1.25, x + R, y);
    pen.ellipse(x, y, R, R * 0.4, 0, 0, Math.PI);
    pen.closePath();
    const g = pen.createLinearGradient(x - R, 0, x + R, 0);
    const base = lit ? C.valve : shade(C.hazard, -0.35);
    g.addColorStop(0, shade(base, 0.25));
    g.addColorStop(0.6, base);
    g.addColorStop(1, shade(base, -0.25));
    k.paint(g, hair(k) * 1.4);
    if (!lit) return;
    // the lamp's bright side: a hot patch sliding across the glass
    const sx = x + Math.sin(th) * R * 0.55;
    pen.beginPath();
    pen.ellipse(sx, y - H * 0.45, R * (0.18 + 0.22 * toward), H * 0.32, 0, 0, Math.PI * 2);
    pen.fillStyle = withAlpha('#fff6d0', 0.35 + 0.6 * toward);
    pen.fill();
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the modesty panel at the back, the plain right end, the pedestal
    k.box(2.6, 0.35, 1.6, 3.7, 0.3, ZT - 2.2, shade(C.steel, -0.2), { line: k.thin, stripe: false });
    k.box(6.2, 0.3, 0, 0.5, 2.4, ZT - 0.6, C.steel, { stripe: false });
    k.box(0.3, 0.3, 0, 2.3, 2.4, ZT - 0.6, C.steel, { stripe: false });
    // the pedestal's three drawers, each with a chrome pull
    for (const [z0, z1] of [[0.35, 1.95], [2.15, 3.5], [3.7, 5.05]] as const) {
      k.rect(0.55, z0, 2.35, z1, 2.71, k.side(C.steelLight, 0, 1, 0.12), k.thin);
      k.box(1.1, 2.7, (z0 + z1) / 2 - 0.12, 0.7, 0.18, 0.24, C.chrome, { line: k.thin * 0.8, stripe: false });
    }
    if (k.fine) rivets(k, [[0.45, 2.71, 0.2], [2.45, 2.71, 0.2], [6.35, 2.71, 0.2], [6.55, 2.71, 0.2]]);
    // the top: steel with a teal trim along its front edge
    k.box(0, 0, ZT - 0.6, DESK.len, DESK.dep, 0.6, C.steelLight);
    k.rect(0.05, ZT - 0.55, DESK.len - 0.05, ZT - 0.12, DESK.dep + 0.01, C.teal, k.thin);
    if (k.fine) rivets(k, [[0.35, DESK.dep + 0.02, ZT - 0.38], [3.5, DESK.dep + 0.02, ZT - 0.38], [6.65, DESK.dep + 0.02, ZT - 0.38]]);
    // the terminal: a deep case, its riveted front, the bezel and the
    // phosphor rim round the glass, two orange knobs under it
    const g = GLASS;
    k.box(2.55, 0.15, ZT, 3.4, g.n - 0.15, 3.95, C.teal, { round: 0.3 });
    if (k.fine) {
      // vents along the case's top
      const vents: Array<[P3, P3]> = [];
      for (let i = 0; i < 4; i++) vents.push([[3.3 + i * 0.25, 0.45, ZT + 3.96], [3.3 + i * 0.25, 0.95, ZT + 3.96]]);
      k.segs(vents, C.tealDark, Math.max(0.8, 0.1 * k.s), 'round');
    }
    k.rect(g.u0 - 0.24, g.z0 - 0.22, g.u1 + 0.24, g.z1 + 0.2, g.n + 0.005, C.crtDark, k.thin);
    k.rect(g.u0 - 0.13, g.z0 - 0.12, g.u1 + 0.13, g.z1 + 0.11, g.n + 0.01, v.active ? C.crt : C.crtDim, 0);
    for (const u of [3.2, 3.6]) dot(k, u, g.n + 0.02, ZT + 0.3, 0.15, C.orange, k.thin * 0.7);
    dot(k, 5.3, g.n + 0.02, ZT + 0.3, 0.1, v.active ? C.radar : C.crtDim, 0);
    if (k.fine) {
      const rv: P3[] = [];
      for (const u of [2.72, 5.78]) for (const z of [ZT + 0.22, ZT + 3.75]) rv.push([u, g.n + 0.01, z]);
      rivets(k, rv);
    }
    // the keyboard before the agent: a cream wedge with rows of keys
    const kb = (fu: number, fv: number): P3 => [KB.u0 + fu * KB.du, KB.v0 + fv * KB.dv, ZT + 0.45 - fv * 0.3];
    k.box(KB.u0, KB.v0, ZT, KB.du, KB.dv, 0.15, shade(C.cream, -0.12), { line: k.thin, stripe: false });
    k.poly([kb(0, 0), kb(1, 0), kb(1, 1), kb(0, 1)], C.cream, k.lw);
    k.poly([kb(1, 0), kb(1, 1), [KB.u0 + KB.du, KB.v0 + KB.dv, ZT], [KB.u0 + KB.du, KB.v0, ZT]], shade(C.cream, -0.2), k.thin);
    const keys: Array<[P3, P3]> = [];
    for (let r = 0; r < 3; r++) keys.push([kb(0.1, 0.22 + r * 0.28), kb(0.9, 0.22 + r * 0.28)]);
    k.segs(keys, '#4a4a40', Math.max(0.8, 0.16 * k.s));
    // the gooseneck lamp at the front left: a round foot, a bent neck,
    // a shade in this look's colour
    const on = v.active;
    k.cyl(0.55, 2.35, ZT, 0.42, 0.18, C.steelDark, { line: k.thin });
    k.rod([[0.55, 2.35, ZT + 0.15], [0.5, 2.3, ZT + 1.6], [0.75, 2.1, ZT + 2.7], [1.3, 2.0, ZT + 3.0]], C.steelDark, 0.12);
    if (on) k.pool(1.7, 2.1, 1.2, 0.8, C.lamp, 0.55, ZT);
    // the bulb peeping out under the shade, then the shade over it
    const [bx, by] = k.p(1.55, 2.0, ZT + 2.15);
    const e = k.ell(1.55, 2.0, ZT + 2.15, 0.42);
    k.pen.beginPath();
    k.pen.ellipse(bx, by, e.rx, e.rx * 0.75, 0, 0, Math.PI * 2);
    k.paint(on ? C.lamp : shade(C.lamp, -0.45), k.thin);
    frustum(k, 1.55, 2.0, ZT + 3.1, 0.22, ZT + 2.4, 0.6, SHADES[look], null);
    if (on) k.halo(1.55, 2.0, ZT + 2.2, 1.6, '#ffe2a0', 0.4);
  },
  screen: [
    [GLASS.u0, GLASS.n, GLASS.z0],
    [GLASS.u1, GLASS.n, GLASS.z0],
    [GLASS.u1, GLASS.n, GLASS.z1],
    [GLASS.u0, GLASS.n, GLASS.z1],
  ],
  top: [6.5, 0.6, ZT],
  clutter: { items: CLUTTER, spots: SPOTS },
  loops: [FAN, BEACON],
};
