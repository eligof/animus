import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import type { Quad } from './bits.ts';
import { across, band, bulbPlant, capsule, fillPts, holoGlobe, mug, pips, rflat, rivets, rrect } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Starfall Base's workstation (see WorkstationArt in ../types.ts): a holo
// console. A curved white desk on one pedestal, a light strip along its
// front edge, a projector bar along its back throwing up a holo pane right
// of the agent (the screen: a thin holo frame, the shared activity layer
// paints its face) and a data slate in front of the agent. The back of its
// right end is kept clear for a desk upgrade, beside the pane and away
// from the agent. Looks: the strip (and the ring of
// light at the pedestal's foot) 0 cyan, 1 magenta, 2 gold. On: the strip,
// the ring and the projector bar glow and the bar's beam reaches the pane.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) lights it; v.seed (0, 1 or 2) picks
// one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Its clutter (a few a desk, see clutterOf), what a frontier research
// base's desks gather, on a row of spots along the front of the pane: a
// tray of bright food cubes, a rack of two sample tubes, a violet crystal
// on a specimen mount, an energy cell with a charge window, a survey drone
// on its dock, a mug, a reel of cable, a glowing sprout in a pod, a model
// of the ringed planet and a helmet with a gold visor. Some light up while
// the desk is worked. Its loop: at the front of its right end a holo
// emitter whose globe turns while the desk is worked (dark while not).

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
// The pedestal's footprint.
const PED = { u0: 2.4, v0: 0.45, u1: 4.6, v1: 2.05 };

// ── on the top: the clutter and the loop ────────────────────────────────────

// Where a thing may stand: a row along the front of the pane, between the
// agent and the bowed front edge, the last at the front of the right end.
const SPOTS: readonly P3[] = [
  [2.55, 1.65, TOP],
  [3.55, 1.7, TOP],
  [4.55, 1.7, TOP],
  [5.5, 2.05, TOP],
];

// A ball of radius r round (u, w, z), its true outline (a little wider
// than tall), shaded from the upper left.
function orb(k: Kit, u: number, w: number, z: number, r: number, base: Color, line = k.lw): void {
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

// Frame points along the front of an upright cylinder (u, w, r) at height
// z, from angle a0 to a1 round it (the front, toward the viewer in either
// frame, is at a quarter turn's half).
function arcAt(u: number, w: number, r: number, z: number, a0: number, a1: number, steps = 6): P3[] {
  return Array.from({ length: steps + 1 }, (_, i): P3 => {
    const a = a0 + ((a1 - a0) * i) / steps;
    return [u + Math.cos(a) * r, w + Math.sin(a) * r, z];
  });
}
const FRONT = Math.PI / 4;

// The ink of a small thing: its outline (`edge`, two thirds of the kit's
// thin line) and its inner lines (`hair`), so a thing under a unit across
// does not drown in ink.
const edge = (k: Kit) => Math.max(0.8, k.thin * 0.65);
const hair = (k: Kit) => Math.max(0.6, k.thin * 0.4);

// A thin rod for a small thing (a post, a lead): ink under colour, w units.
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + hair(k) * 2);
  k.line(pts, color, w * k.s);
}

// A tray of bright food cubes, four on it and one on top.
const foodCubes: Clutter = {
  name: 'foodCubes',
  r: 0.4,
  h: 0.7,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.box(u - 0.38, w - 0.38, z, 0.76, 0.76, 0.12, C.white, { round: 0.12, line: edge(k) });
    const c = 0.3;
    const cubes: Array<[number, number, number, Color]> = [
      [-0.33, -0.33, 0, C.flora2],
      [0.03, -0.33, 0, C.flora3],
      [-0.33, 0.03, 0, C.grass],
      [0.03, 0.03, 0, C.flora],
      [-0.15, -0.15, c, C.orange],
    ];
    for (const [du, dv, dz, col] of cubes) k.box(u + du, w + dv, z + 0.12 + dz, c, c, c, col, { round: 0.05, line: hair(k), stripe: false });
  },
};

// A rack of two sample tubes standing in it, one glowing teal, one pink,
// capped orange.
const sampleTubes: Clutter = {
  name: 'sampleTubes',
  r: 0.4,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.box(u - 0.38, w - 0.17, z, 0.76, 0.34, 0.3, C.panel, { round: 0.08, line: edge(k) });
    k.rect(u - 0.3, z + 0.1, u + 0.3, z + 0.18, w + 0.18, C.trim, 0);
    for (const [du, liquid] of [[-0.17, C.glow], [0.17, C.flora]] as const) {
      if (v.active) k.halo(u + du, w, z + 0.55, 0.4, liquid, 0.35);
      capsule(k, u + du, w, z + 0.26, 0.13, 0.74, '#e8f8ff', liquid, 0.02, 0.42, hair(k) * 1.4);
      k.cyl(u + du, w, z + 0.92, 0.14, 0.12, C.trim, { line: hair(k) });
    }
  },
};

// A violet crystal from the survey on a round specimen mount: three
// shards, the middle one tallest, faceted light and dark.
const crystal: Clutter = {
  name: 'crystal',
  r: 0.4,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.36, 0.18, C.panel, { line: edge(k) });
    band(k, u, w, 0.36, z + 0.05, z + 0.11);
    k.paint(C.trim, 0);
    const zb = z + 0.17;
    if (v.active) k.halo(u, w, zb + 0.5, 0.55, C.flora2, 0.45);
    shard(k, u - 0.17, w, zb, 0.55, -0.16, 0.13);
    shard(k, u + 0.18, w + 0.05, zb, 0.45, 0.15, 0.12);
    shard(k, u, w + 0.04, zb, 0.92, 0.03, 0.16);
  },
};

// One shard of crystal from its foot (u, w, z), h tall, its tip leaning
// by `lean` along u, `r` half as wide: a lit facet and a dark one.
function shard(k: Kit, u: number, w: number, z: number, h: number, lean: number, r: number): void {
  const [bx, by] = k.p(u, w, z);
  const [tx, ty] = k.p(u + lean, w, z + h);
  const W = r * k.s * 1.3;
  const L0: Pt = [bx - W, by];
  const M0: Pt = [bx, by + W * 0.45];
  const R0: Pt = [bx + W, by];
  const R1: Pt = [tx + W * 0.85, ty + W * 0.4];
  const T: Pt = [tx, ty - W * 0.7];
  const L1: Pt = [tx - W * 0.85, ty + W * 0.4];
  const M1: Pt = [tx, ty + W * 0.75];
  fillPts(k, [L0, M0, M1, T, L1], '#c4a8ff', 0);
  fillPts(k, [M0, R0, R1, T, M1], '#6f48cc', 0);
  fillPts(k, [M1, T, L1], '#e6dcff', 0);
  fillPts(k, [L0, M0, R0, R1, T, L1], null, hair(k) * 1.4);
  k.pen.beginPath();
  k.pen.moveTo(...M0);
  k.pen.lineTo(...M1);
  k.pen.lineTo(...T);
  k.pen.strokeStyle = withAlpha(INK, 0.5);
  k.pen.lineWidth = hair(k) * 0.8;
  k.pen.stroke();
}

// An energy cell: a white capsule capped orange, a charge window down its
// front with three bars, lit while the desk is worked.
const energyCell: Clutter = {
  name: 'energyCell',
  r: 0.4,
  h: 1.1,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.32;
    capsule(k, u, w, z, r, 1.02, C.white, C.trim, 0.76, 1.02, edge(k));
    const a0 = FRONT - 0.6;
    const a1 = FRONT + 0.6;
    const win = [...arcAt(u, w, r + 0.01, z + 0.16, a0, a1), ...arcAt(u, w, r + 0.01, z + 0.66, a1, a0)];
    k.poly(win, '#1f2440', 0);
    const bar = Math.max(1, 0.1 * k.s);
    for (let i = 0; i < 3; i++) k.line(arcAt(u, w, r + 0.02, z + 0.25 + i * 0.15, a0 + 0.17, a1 - 0.17, 4), v.active ? C.cyan : '#3f6f80', bar);
    if (v.active) k.halo(u, w, z + 0.42, 0.35, C.cyan, 0.35);
  },
};

// A little survey drone asleep on its dock: a white ball with an orange
// band, a lens on its front and a rotor pod at each side; its lens and the
// dock's ring light up while the desk is worked.
const drone: Clutter = {
  name: 'drone',
  r: 0.4,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.38, 0.12, C.panel, { line: edge(k) });
    k.disc(u, w, z + 0.12, 0.26, v.active ? C.cyan : C.panelDark, 0);
    const zc = z + 0.46;
    const [x, y] = k.p(u, w, zc);
    const R = 0.28;
    const rx = R * Math.SQRT2 * k.s;
    // the rotor pods, either side
    const pen = k.pen;
    for (const d of [-1, 1]) {
      pen.beginPath();
      pen.ellipse(x + d * rx * 1.02, y - 0.04 * k.s, rx * 0.36, rx * 0.16, 0, 0, Math.PI * 2);
      k.paint(C.dark, hair(k));
    }
    orb(k, u, w, zc, R, C.white, edge(k));
    // the band round its middle (its near half)
    const e = k.ell(u, w, zc, R);
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
    pen.strokeStyle = C.trim;
    pen.lineWidth = Math.max(1, 0.1 * k.s);
    pen.stroke();
    // its lens, on the front
    const [lx, ly] = k.p(u + 0.15, w + 0.15, zc + 0.08);
    pen.beginPath();
    pen.arc(lx, ly, Math.max(1.2, 0.12 * k.s), 0, Math.PI * 2);
    k.paint(C.dark, 0);
    pen.beginPath();
    pen.arc(lx, ly, Math.max(0.7, 0.06 * k.s), 0, Math.PI * 2);
    k.paint(v.active ? C.screen : '#3f6f80', 0);
    // an aerial with a pip
    k.line([[u, w, zc + R * 1.15], [u - 0.05, w, zc + R * 1.15 + 0.2]], INK, Math.max(0.8, 0.06 * k.s));
    pips(k, [[u - 0.05, w, zc + R * 1.15 + 0.22]], C.magenta, 0.06, 1);
  },
};

// A mug of something hot, a teal band round it.
const mugOf: Clutter = {
  name: 'mug',
  r: 0.4,
  h: 0.7,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    mug(k, u - 0.07, w, z, C.white, 0.3, C.cyan, edge(k));
  },
};

// A reel of cable: orange flanges, the teal cable wound round its core
// and a plug at the end of its lead.
const cableReel: Clutter = {
  name: 'cableReel',
  r: 0.4,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.36, 0.58, C.trim, { line: edge(k), top: shade(C.trim, 0.2) });
    band(k, u, w, 0.36, z + 0.11, z + 0.47);
    k.paint(C.grass, 0);
    const turns: P3[][] = [0.2, 0.29, 0.38].map((dz) => arcAt(u, w, 0.365, z + dz, -0.2, Math.PI / 2 + 0.2, 10));
    for (const t of turns) k.line(t, C.grassDark, hair(k));
    for (const dz of [0.11, 0.47]) k.line(arcAt(u, w, 0.365, z + dz, -Math.PI / 4, (Math.PI * 5) / 4, 16), INK, hair(k));
    k.disc(u, w, z + 0.58, 0.12, C.dark, 0);
    // the lead, down to the top and out to its plug
    stick(k, [[u + 0.2, w + 0.2, z + 0.2], [u + 0.3, w + 0.26, z + 0.06], [u + 0.22, w + 0.34, z + 0.04]], C.grass, 0.07);
    k.box(u + 0.08, w + 0.28, z, 0.16, 0.1, 0.1, C.white, { line: edge(k), stripe: false });
  },
};

// The glowing sprout in its white pod: two bulbs on curling stalks.
const sprout: Clutter = {
  name: 'sprout',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.32, 0.42, C.white, { line: edge(k) });
    band(k, u, w, 0.32, z + 0.1, z + 0.2);
    k.paint(C.trim, 0);
    k.disc(u, w, z + 0.4, 0.24, '#4a3a5a', 0);
    const glow = v.active ? 0.45 : 0.25;
    bulbPlant(k, u - 0.05, w, z + 0.42, 0.42, -0.18, 0.14, C.flora3, hair(k), glow);
    bulbPlant(k, u + 0.03, w, z + 0.42, 0.62, 0.12, 0.18, C.flora, hair(k), glow);
  },
};

// A model of the ringed planet on a little stand: the ring's far half,
// the planet, then its near half.
const planetModel: Clutter = {
  name: 'planetModel',
  r: 0.4,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.32, 0.14, C.white, { line: edge(k) });
    band(k, u, w, 0.32, z + 0.03, z + 0.08);
    k.paint(C.trim, 0);
    stick(k, [[u, w, z + 0.14], [u, w, z + 0.6]], C.panelDark, 0.08);
    const zc = z + 0.84;
    const [x, y] = k.p(u, w, zc);
    const pen = k.pen;
    const rx = 0.5 * k.s;
    const ry = rx * 0.3;
    const tilt = -0.32;
    const ringW = Math.max(1, 0.1 * k.s);
    const ringArc = (a0: number, a1: number) => {
      pen.beginPath();
      pen.ellipse(x, y, rx, ry, tilt, a0, a1);
      pen.strokeStyle = INK;
      pen.lineWidth = ringW + hair(k) * 2;
      pen.stroke();
      pen.strokeStyle = C.ring;
      pen.lineWidth = ringW;
      pen.stroke();
    };
    ringArc(Math.PI, Math.PI * 2);
    orb(k, u, w, zc, 0.24, C.planet, edge(k));
    if (k.fine) k.line([[u - 0.2, w, zc + 0.05], [u + 0.2, w, zc + 0.09]], withAlpha(shade(C.planet, -0.3), 0.7), Math.max(0.6, 0.06 * k.s));
    ringArc(0, Math.PI);
  },
};

// A helmet set down by its owner: a white shell on an orange collar, a
// big dark visor rimmed in gold with the room shining in it.
const helmet: Clutter = {
  name: 'helmet',
  r: 0.4,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.28, 0.16, C.trim, { line: hair(k) * 1.4 });
    const zc = z + 0.55;
    const R = 0.37;
    orb(k, u, w, zc, R, C.white, edge(k));
    const [x, y] = k.p(u, w, zc);
    const pen = k.pen;
    const rx = R * Math.SQRT2 * k.s * 0.74;
    const ry = R * 1.22 * k.s * 0.56;
    const cy = y + 0.03 * k.s;
    pen.beginPath();
    pen.ellipse(x, cy, rx, ry, 0, 0, Math.PI * 2);
    const g = pen.createLinearGradient(x, cy - ry, x, cy + ry);
    g.addColorStop(0, '#5a4fa0');
    g.addColorStop(0.5, '#2c2650');
    g.addColorStop(1, '#191632');
    pen.fillStyle = g;
    pen.fill();
    pen.strokeStyle = C.gold;
    pen.lineWidth = Math.max(0.8, 0.07 * k.s);
    pen.stroke();
    // the shine: a bright streak and a dot
    pen.beginPath();
    pen.ellipse(x - rx * 0.38, cy - ry * 0.38, rx * 0.26, ry * 0.16, -0.5, 0, Math.PI * 2);
    pen.fillStyle = '#ffffffd0';
    pen.fill();
    pen.beginPath();
    pen.arc(x - rx * 0.02, cy - ry * 0.55, Math.max(0.6, 0.04 * k.s), 0, Math.PI * 2);
    pen.fill();
    if (v.active) pips(k, [[u + 0.3, w - 0.1, zc - 0.05]], C.cyan, 0.06, 0.9);
  },
};

const CLUTTER: readonly Clutter[] = [foodCubes, sampleTubes, crystal, energyCell, drone, mugOf, cableReel, sprout, planetModel, helmet];

// The holo emitter at the front of the right end: a white puck banded
// orange with a lens on top; while the desk is worked its beam throws up
// a wire globe that turns (its three meridians come round to where they
// were every sixth of a turn, so eight steps make it seamless) with a
// little moon going round it.
const HOLO_AT: P3 = [6.35, 2.35, TOP];
const HOLO: DeskLoop = {
  name: 'holoGlobe',
  at: HOLO_AT,
  r: 0.5,
  h: 1.35,
  frames: 8,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = HOLO_AT;
    k.cyl(u, w, z, 0.3, 0.16, C.white, { line: edge(k) });
    band(k, u, w, 0.3, z + 0.04, z + 0.1);
    k.paint(C.trim, 0);
    k.disc(u, w, z + 0.16, 0.15, v.active ? C.holo : '#5f8f9c', hair(k));
    if (!v.active) return;
    const zc = z + 0.86;
    const R = 0.36;
    k.poly([[u - 0.12, w, z + 0.17], [u + 0.12, w, z + 0.17], [u + 0.26, w, zc - 0.2], [u - 0.26, w, zc - 0.2]], withAlpha(C.holo, 0.28), 0);
    holoGlobe(k, u, w, zc, R, 0.95, (i / 8) * (Math.PI / 3));
    // the moon, round the globe once a loop
    const a = (i / 8) * Math.PI * 2;
    const [x, y] = k.p(u, w, zc);
    const pen = k.pen;
    pen.beginPath();
    pen.arc(x + Math.cos(a) * R * 1.12 * k.s, y + Math.sin(a) * R * 0.32 * k.s, Math.max(0.8, 0.06 * k.s), 0, Math.PI * 2);
    pen.fillStyle = '#e8feff';
    pen.fill();
  },
};

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
    // in front of the agent, a data slate
    k.poly(rflat(0.45, 1.6, 2.3, 2.65, TOP + 0.02, 0.22), '#1f2440', k.thin);
    k.poly(rflat(0.6, 1.72, 2.15, 2.53, TOP + 0.03, 0.15), k.grad([0.6, 1.72, TOP], [2.15, 2.53, TOP], [[0, '#3a4a8a'], [1, '#2a2a5a']]), 0);
    const w = Math.max(0.7, 0.09 * k.s);
    k.segs([[[0.9, 1.95, TOP + 0.04], [1.9, 1.95, TOP + 0.04]]], withAlpha(strip, on ? 0.95 : 0.6), w, 'round');
    k.segs([[[0.9, 2.18, TOP + 0.04], [1.55, 2.18, TOP + 0.04]], [[0.9, 2.38, TOP + 0.04], [1.75, 2.38, TOP + 0.04]]], withAlpha('#ffffff', on ? 0.7 : 0.4), w, 'round');
  },
  screen: SCREEN,
  top: [6.5, 0.55, TOP],
  clutter: { items: CLUTTER, spots: SPOTS },
  loops: [HOLO],
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
