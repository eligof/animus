import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { can, cable, droop, duck, fillPts, hullPts, ring } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, CANS, INK, hash, kitOf, withAlpha } from './kit.ts';

// Hacker's Den's workstation (see WorkstationArt in ../types.ts): a compact battlestation.
// A dark wood desk on black steel legs, one monitor on a short stand
// right of where the agent stands, a compact keyboard with a glowing
// underside and a mouse on a mat in front of the agent; under the right
// end a tower with two fans in its front. Drawn once a scale, frame, look
// and screen, and kept: it never looks at v.t; v.active (its screen on)
// lights the keyboard and the fans; v.seed (0, 1 or 2) picks their colour:
// green, magenta or cyan. The shared activity layer paints over `screen`;
// a desk upgrade stands at `top`, at the back of its right end (nothing of
// its own there).
//
// What stands on its top (`clutter`, a few a desk; see clutterOf in
// ../workstation.ts): an energy drink, a rubber duck, a cup of instant
// noodles with chopsticks in it, a slice of pizza on a paper plate, a
// little cactus in flower, a game controller, a scrambled puzzle cube, a
// handful of loose keycaps, a mug of coffee and a stack of floppy disks.
// They stand in the strip between the agent and the monitor and on the
// mat right of the mouse. What moves while its agent works (`loops`): a
// lava lamp at the front right corner, its wax rising and sinking (dark
// and settled while the screen is off), and a white router beside it, its
// lights blinking.

// The desk's top surface; the monitor's body round its screen.
const TOP = 5.6;
const MON = { u0: 2.48, u1: 5.07, v0: 0.55, v1: 0.9, z0: 6.42, z1: 9.65 };
const GLOW: readonly Color[] = [C.green, C.magenta, C.cyan];

function draw(v: PropView): void {
  const k = kitOf(v);
  const glow = GLOW[((v.seed % 3) + 3) % 3];
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  // the monitor's cable down the back leg to the floor
  cable(k, droop([3.65, 0.25, TOP - 0.4], [5.0, 0.25, 0.3], 0.8, 6), '#1c2226', 0.14);
  // black steel legs, a rail between each end's pair and one along the back
  const legs: ReadonlyArray<readonly [number, number]> = [[0.3, 0.3], [6.3, 0.3], [0.3, 2.3], [6.3, 2.3]];
  const leg = (u: number, w: number) => k.box(u, w, 0, 0.42, 0.42, TOP - 0.5, C.black, { line: k.thin, stripe: false });
  for (const [u, w] of legs.slice(0, 2)) leg(u, w);
  k.box(0.72, 0.38, TOP - 1.3, 5.58, 0.28, 0.5, C.charcoal, { line: k.thin, stripe: false });
  // the tower under the right end, its glass side to the room and two
  // fans in its front that glow the look's colour while the screen is on
  k.box(4.75, 0.7, 0, 1.4, 1.85, 3.3, C.graphite);
  k.poly([[6.16, 0.9, 0.35], [6.16, 2.35, 0.35], [6.16, 2.35, 3.0], [6.16, 0.9, 3.0]], '#0e1416', k.thin);
  for (const z of [1.05, 2.3]) {
    const fan: P3 = [5.45, 2.56, z];
    const rim = ring(k, fan, [0, 1, 0], 0.46, 16);
    fillPts(k, rim, v.active ? shade(glow, -0.55) : '#151c1e', k.thin * 0.7);
    // its hub's ring of light
    fillPts(k, ring(k, fan, [0, 1, 0], 0.3, 12), null, 0);
    k.pen.strokeStyle = v.active ? glow : shade(glow, -0.62);
    k.pen.lineWidth = Math.max(1, 0.1 * k.s);
    k.pen.stroke();
    k.dot(...fan, 0.1, v.active ? glow : shade(glow, -0.6));
    if (v.active) k.halo(...fan, 0.8, glow, 0.25);
  }
  for (const u of [0.38, 6.38]) k.box(u, 0.72, 0.5, 0.26, 1.58, 0.32, C.charcoal, { line: k.thin, stripe: false });
  for (const [u, w] of legs.slice(2)) leg(u, w);
  // the top: dark wood, its edge a shade darker
  k.box(0, 0, TOP - 0.5, DESK.len, DESK.dep, 0.5, C.desk, { top: C.deskTop });
  // a dark mat under the keyboard and the mouse, its front edge picked
  // out in the look's colour
  const zm = TOP + 0.01;
  k.poly([[0.5, 1.45, zm], [4.8, 1.45, zm], [4.8, 2.8, zm], [0.5, 2.8, zm]], '#1a1f22', k.thin * 0.7, 0.25);
  k.line([[0.65, 2.68, zm + 0.01], [4.65, 2.68, zm + 0.01]], withAlpha(glow, v.active ? 0.7 : 0.3), Math.max(0.6, 0.07 * k.s));
  // the monitor: a short neck on a flat foot, one wide black panel
  k.box(3.07, 0.25, TOP, 1.4, 0.9, 0.14, C.black, { line: k.thin, round: 0.2 });
  k.box(3.57, 0.3, TOP + 0.1, 0.4, 0.3, 1.1, C.charcoal, { line: k.thin, stripe: false });
  k.box(MON.u0, MON.v0, MON.z0, MON.u1 - MON.u0, MON.v1 - MON.v0, MON.z1 - MON.z0, C.black, { round: 0.12, stripe: false });
  // a thin chin under the glass, darker
  k.rect(MON.u0 + 0.15, MON.z0 + 0.06, MON.u1 - 0.15, MON.z0 + 0.2, MON.v1 + 0.005, C.graphite);
  // the keyboard, a compact one, lit from under its front edge while the
  // screen is on
  const kb = { u0: 0.8, u1: 3.0, v0: 1.7, v1: 2.55, h: 0.24 };
  if (v.active) {
    k.pool((kb.u0 + kb.u1) / 2, kb.v1, 1.4, 0.5, glow, 0.55, zm);
    k.halo((kb.u0 + kb.u1) / 2, kb.v1 + 0.1, zm + 0.2, 1.1, glow, 0.22);
  }
  k.box(kb.u0, kb.v0, zm, kb.u1 - kb.u0, kb.v1 - kb.v0, kb.h, C.graphite, { line: k.thin, round: 0.08 });
  const under: P3[] = [[kb.u0 + 0.1, kb.v1 + 0.02, zm + 0.04], [kb.u1 - 0.1, kb.v1 + 0.02, zm + 0.04]];
  k.line(under, v.active ? glow : shade(glow, -0.6), Math.max(1, 0.12 * k.s));
  if (k.fine) {
    // the keys: three rows of caps, a space bar
    const pen = k.pen;
    const zk = zm + kb.h + 0.005;
    pen.beginPath();
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < 8; i++) {
        const u = kb.u0 + 0.14 + i * 0.25;
        const w = kb.v0 + 0.1 + r * 0.2;
        k.trace([[u, w, zk], [u + 0.18, w, zk], [u + 0.18, w + 0.14, zk], [u, w + 0.14, zk]]);
      }
    }
    k.trace([[kb.u0 + 0.6, kb.v0 + 0.68, zk], [kb.u1 - 0.6, kb.v0 + 0.68, zk], [kb.u1 - 0.6, kb.v0 + 0.8, zk], [kb.u0 + 0.6, kb.v0 + 0.8, zk]]);
    pen.fillStyle = v.active ? shade(glow, -0.25) : '#3d454b';
    pen.fill();
  }
  // the mouse, a dot of the glow on its back
  k.box(3.2, 1.95, zm, 0.46, 0.68, 0.22, C.graphite, { line: k.thin, round: 0.22 });
  k.dot(3.43, 2.15, zm + 0.23, 0.07, v.active ? glow : shade(glow, -0.55));
}

// ── what stands on the top ────────────────────────────────────────────────

// An upright round thing narrowing (or widening) from radius r0 at z0 to
// r1 at z1: its side shaded across like a cylinder's, its top in `top`.
function taper(k: Kit, u: number, w: number, z0: number, r0: number, z1: number, r1: number, base: Color, top: Color | null, line = k.thin): Pt[] {
  const sil = hullPts([...ring(k, [u, w, z0], [0, 0, 1], r0, 20), ...ring(k, [u, w, z1], [0, 0, 1], r1, 20)]);
  const xs = sil.map((p) => p[0]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const g = k.pen.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, shade(base, 0.06));
  g.addColorStop(0.3, shade(base, 0.14));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.24));
  fillPts(k, sil, g, line);
  if (top) fillPts(k, ring(k, [u, w, z1], [0, 0, 1], r1, 20), top, line * 0.7);
  return sil;
}

// Small things are inked lighter than the furniture (a tenth of a unit),
// or their outline would swallow them.
const fine = (k: Kit): number => Math.max(1, 0.1 * k.s);

// A thin stick (an antenna, a chopstick): a line of colour w units wide
// over a slightly wider one of ink.
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + Math.max(1, 0.08 * k.s));
  k.line(pts, color, w * k.s);
}

// An energy drink, green.
const energyCan: Clutter = {
  name: 'energyCan',
  r: 0.3,
  h: 0.85,
  draw(v, [u, w, z]) {
    can(kitOf(v), u, w, z, CANS[0], 0.27);
  },
};

// A rubber duck, for talking a bug through.
const rubberDuck: Clutter = {
  name: 'rubberDuck',
  r: 0.35,
  h: 0.85,
  draw(v, [u, w, z]) {
    duck(kitOf(v), u - 0.08, w, z, 0.34);
  },
};

// A paper cup of instant noodles, its foil lid peeled back and a pair of
// chopsticks stuck in it.
const noodleCup: Clutter = {
  name: 'noodleCup',
  r: 0.3,
  h: 1.25,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const zt = z + 0.58;
    // the lid, folded up at the back
    k.poly([[u - 0.22, w - 0.18, zt], [u + 0.22, w - 0.18, zt], [u + 0.26, w - 0.38, zt + 0.34], [u - 0.18, w - 0.4, zt + 0.36]], '#d9dfdd', fine(k), 0.05);
    taper(k, u, w, z, 0.21, zt, 0.3, '#f4efe4', '#e9c46a', fine(k));
    // a red band round its middle
    fillPts(k, hullPts([...ring(k, [u, w, z + 0.24], [0, 0, 1], 0.252, 20), ...ring(k, [u, w, z + 0.42], [0, 0, 1], 0.272, 20)]), C.red, 0);
    if (k.fine) {
      // noodles in the broth
      for (const [du, dw] of [[-0.1, 0.02], [0.06, -0.06], [0.02, 0.1]] as const) {
        k.line([[u + du - 0.08, w + dw, zt + 0.01], [u + du, w + dw + 0.04, zt + 0.01], [u + du + 0.08, w + dw, zt + 0.01]], '#c99a3a', Math.max(0.6, 0.04 * k.s));
      }
    }
    // the chopsticks
    for (const d of [0, 0.08]) stick(k, [[u - 0.02 + d, w + 0.04, zt - 0.05], [u + 0.26 + d, w - 0.1 + d, z + 1.2]], '#e6c48a', 0.05);
  },
};

// A slice of pepperoni pizza on a paper plate.
const pizzaSlice: Clutter = {
  name: 'pizzaSlice',
  r: 0.35,
  h: 0.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.disc(u, w, z + 0.03, 0.36, '#f4f1e8', fine(k));
    const apex: P3 = [u - 0.24, w + 0.2, z + 0.06];
    const arc: P3[] = [];
    for (let i = 0; i <= 6; i++) {
      const a = -1.3 + (i / 6) * 1.05;
      arc.push([apex[0] + Math.cos(a) * 0.52, apex[1] + Math.sin(a) * 0.52, z + 0.06]);
    }
    k.poly([apex, ...arc], C.pizza, fine(k));
    k.line(arc, C.crust, Math.max(1.5, 0.13 * k.s));
    for (const [du, dw] of [[-0.05, 0.03], [0.1, -0.12], [-0.03, -0.17]] as const) k.disc(u + du, w + dw, z + 0.07, 0.06, C.pepperoni, 0);
  },
};

// A little saguaro in a terracotta pot, an arm up on each side and a pink
// flower on its top.
const cactus: Clutter = {
  name: 'cactus',
  r: 0.3,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const pot = '#c66a42';
    k.cyl(u, w, z, 0.2, 0.3, pot, { line: fine(k) });
    k.cyl(u, w, z + 0.27, 0.24, 0.09, shade(pot, 0.1), { line: fine(k), top: '#3a2a1e' });
    // its arms, behind and beside the column
    const arm = (s: number, z0: number, z1: number) => stick(k, [[u + s * 0.08, w, z0], [u + s * 0.24, w, z0 + 0.02], [u + s * 0.24, w, z1]], C.leaf, 0.13);
    arm(-1, z + 0.55, z + 0.78);
    arm(1, z + 0.68, z + 0.92);
    k.cyl(u, w, z + 0.34, 0.13, 0.62, C.leaf, { line: fine(k), top: C.leafLight });
    k.disc(u, w, z + 0.96, 0.13, C.leafLight, 0);
    k.line([[u - 0.05, w + 0.1, z + 0.4], [u - 0.05, w + 0.1, z + 0.92]], C.leafDark, Math.max(0.6, 0.04 * k.s));
    k.dot(u, w, z + 1.03, 0.08, '#ff4fb0');
  },
};

// A white game controller lying on the desk: two grips, a d-pad, four
// buttons and two thumbsticks.
const gamepad: Clutter = {
  name: 'gamepad',
  r: 0.35,
  h: 0.25,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const body = '#e3e7e5';
    for (const s of [-1, 1]) k.cyl(u + s * 0.24, w + 0.08, z, 0.15, 0.14, body, { line: fine(k) });
    k.box(u - 0.28, w - 0.14, z, 0.56, 0.26, 0.15, body, { line: fine(k), round: 0.09, stripe: false });
    const zt = z + 0.155;
    k.poly([[u - 0.27, w - 0.035, zt], [u - 0.15, w - 0.035, zt], [u - 0.15, w + 0.015, zt], [u - 0.27, w + 0.015, zt]], '#3a4045', 0);
    k.poly([[u - 0.235, w - 0.07, zt], [u - 0.185, w - 0.07, zt], [u - 0.185, w + 0.05, zt], [u - 0.235, w + 0.05, zt]], '#3a4045', 0);
    const btn: ReadonlyArray<readonly [number, number, Color]> = [[0.21, -0.08, '#3fd46a'], [0.27, -0.02, '#ff5a4a'], [0.15, -0.02, '#4aa0e0'], [0.21, 0.04, '#ffb000']];
    for (const [du, dw, c] of btn) k.dot(u + du, w + dw, zt, 0.035, c);
    for (const du of [-0.08, 0.08]) k.disc(u + du, w + 0.07, zt + 0.02, 0.055, '#3a4045', 0);
  },
};

// A scrambled puzzle cube: a black cube, a 3 x 3 of coloured squares on
// each face the viewer sees (its top, its +u and its +v faces, whichever
// wall it stands on).
const STICKERS: readonly Color[] = ['#f2f2f2', '#ffd23e', '#c0392f', '#ff8a2a', '#3c78c8', '#3fd46a'];
const puzzleCube: Clutter = {
  name: 'puzzleCube',
  r: 0.3,
  h: 0.42,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const a = 0.42;
    const u0 = u - a / 2;
    const w0 = w - a / 2;
    k.box(u0, w0, z, a, a, a, C.black, { line: fine(k), stripe: false });
    const cell = a / 3;
    const m = 0.012;
    const pen = k.pen;
    const groups = new Map<Color, P3[][]>();
    const add = (c: Color, q: P3[]) => (groups.get(c) ?? groups.set(c, []).get(c)!).push(q);
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const a0 = i * cell + m * 2;
        const a1 = (i + 1) * cell - m * 2;
        const b0 = j * cell + m * 2;
        const b1 = (j + 1) * cell - m * 2;
        add(STICKERS[Math.floor(hash(i, j, 1) * 6)], [[u0 + a0, w0 + b0, z + a + m], [u0 + a1, w0 + b0, z + a + m], [u0 + a1, w0 + b1, z + a + m], [u0 + a0, w0 + b1, z + a + m]]);
        add(STICKERS[Math.floor(hash(i, j, 2) * 6)], [[u0 + a0, w0 + a + m, z + b0], [u0 + a1, w0 + a + m, z + b0], [u0 + a1, w0 + a + m, z + b1], [u0 + a0, w0 + a + m, z + b1]]);
        add(STICKERS[Math.floor(hash(i, j, 3) * 6)], [[u0 + a + m, w0 + a0, z + b0], [u0 + a + m, w0 + a1, z + b0], [u0 + a + m, w0 + a1, z + b1], [u0 + a + m, w0 + a0, z + b1]]);
      }
    }
    for (const [c, qs] of groups) {
      pen.beginPath();
      for (const q of qs) k.trace(q);
      pen.fillStyle = c;
      pen.fill();
    }
  },
};

// A few loose keycaps in bright colours, one up on another.
const keycaps: Clutter = {
  name: 'keycaps',
  r: 0.35,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const caps: ReadonlyArray<readonly [number, number, number, Color]> = [
      [-0.12, -0.13, 0, '#ff4fb0'],
      [0.15, -0.06, 0, '#5fe0ff'],
      [-0.06, 0.16, 0, '#ffb000'],
      [-0.1, -0.1, 0.17, '#e9ecea'],
    ];
    for (const [du, dw, dz, c] of caps) {
      const a = 0.27;
      k.box(u + du - a / 2, w + dw - a / 2, z + dz, a, a, 0.17, c, { line: fine(k), round: 0.04, stripe: false });
      k.disc(u + du, w + dw, z + dz + 0.172, 0.08, shade(c, -0.12), 0);
    }
  },
};

// A mustard mug of coffee, its handle on the +u side.
const coffeeMug: Clutter = {
  name: 'coffeeMug',
  r: 0.3,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.27;
    stick(k, [[u + r * 0.8, w, z + 0.46], [u + r + 0.13, w, z + 0.4], [u + r + 0.13, w, z + 0.22], [u + r * 0.8, w, z + 0.16]], C.mustard, 0.06);
    k.cyl(u, w, z, r, 0.58, C.mustard, { line: fine(k) });
    k.disc(u, w, z + 0.56, r * 0.78, '#3a2216', 0);
  },
};

// A stack of three floppy disks, each a little askew; the top one's
// metal shutter and blank label show.
const floppies: Clutter = {
  name: 'floppies',
  r: 0.35,
  h: 0.25,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const disks: ReadonlyArray<readonly [number, Color]> = [[0.2, '#4aa0e0'], [-0.12, '#ffb000'], [0.06, '#c0392f']];
    disks.forEach(([ang, c], i) => {
      const zi = z + i * 0.07;
      k.obox(u, w, zi, 0.48, 0.48, 0.065, ang, c, { line: fine(k) });
      if (i < disks.length - 1) return;
      const ca = Math.cos(ang);
      const sa = Math.sin(ang);
      const P = (a: number, b: number): P3 => [u + ca * a - sa * b, w + sa * a + ca * b, zi + 0.067];
      k.poly([P(-0.1, -0.24), P(0.13, -0.24), P(0.13, -0.06), P(-0.1, -0.06)], '#c3ccc8', 0);
      k.poly([P(-0.18, 0.03), P(0.18, 0.03), P(0.18, 0.22), P(-0.18, 0.22)], '#f4f1e8', 0);
    });
  },
};

// ── what moves ───────────────────────────────────────────────────────────

// A lava lamp at the front right corner: a steel cone of a base, a glass
// widest a third of the way up full of magenta liquid lit from below, a
// steel cap. While its desk is worked three blobs of amber wax bob up and
// down in it, slowly; off, the glass is dark and the wax lies at its foot.
const LAMP: P3 = [6.2, 2.25, TOP];
const lavaLamp: DeskLoop = {
  name: 'lavaLamp',
  at: LAMP,
  r: 0.4,
  h: 2.05,
  frames: 8,
  fps: 3,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = LAMP;
    const on = v.active;
    const g0 = z + 0.5;
    const gm = z + 0.9;
    const g1 = z + 1.62;
    if (on) k.pool(u, w, 0.9, 0.9, C.magenta, 0.35, z);
    taper(k, u, w, z, 0.34, g0, 0.19, C.steel, null);
    // the glass and the liquid in it
    const glass = hullPts([...ring(k, [u, w, g0], [0, 0, 1], 0.19, 20), ...ring(k, [u, w, gm], [0, 0, 1], 0.25, 20), ...ring(k, [u, w, g1], [0, 0, 1], 0.14, 20)]);
    const [, yb] = k.p(u, w, g0);
    const [, yt] = k.p(u, w, g1);
    const liquid = k.pen.createLinearGradient(0, yb, 0, yt);
    liquid.addColorStop(0, on ? '#ff6ab8' : '#3d2836');
    liquid.addColorStop(1, on ? '#a8247a' : '#261a24');
    fillPts(k, glass, liquid, 0);
    // the wax, clipped to the glass: a pool at its foot, and blobs
    const pen = k.pen;
    pen.save();
    fillPts(k, glass, null, 0);
    pen.clip();
    const wax = on ? '#ffb347' : '#6a4a3a';
    k.disc(u, w, g0, 0.2, wax, 0);
    const [px, py] = k.p(u, w, g0 + 0.04);
    pen.beginPath();
    pen.ellipse(px, py, 0.2 * k.s, 0.1 * k.s, 0, Math.PI, Math.PI * 2);
    pen.fillStyle = wax;
    pen.fill();
    if (on) {
      const blobs: ReadonlyArray<readonly [number, number, number, number]> = [
        // height (0 foot, 1 top), how far it bobs, its phase, its size
        [0.3, 0.16, 0, 0.1],
        [0.62, 0.14, 2.6, 0.075],
        [0.85, 0.08, 4.4, 0.055],
      ];
      blobs.forEach(([f, amp, ph, r], j) => {
        const t = (i / 8) * Math.PI * 2 + ph;
        const zb = g0 + (g1 - g0) * (f + amp * Math.sin(t));
        const [bx, by] = k.p(u + (j - 1) * 0.04, w, zb);
        const stretch = 1.25 + 0.2 * Math.cos(t);
        pen.beginPath();
        pen.ellipse(bx, by, r * k.s, r * stretch * k.s, 0, 0, Math.PI * 2);
        pen.fillStyle = wax;
        pen.fill();
      });
    }
    // a sheen down the glass's lit side
    const [sx0, sy0] = k.p(u - 0.12, w, g0 + 0.15);
    const [sx1, sy1] = k.p(u - 0.1, w, g1 - 0.15);
    pen.beginPath();
    pen.moveTo(sx0, sy0);
    pen.lineTo(sx1, sy1);
    pen.strokeStyle = on ? '#ffd6ec88' : '#ffffff22';
    pen.lineWidth = Math.max(0.8, 0.05 * k.s);
    pen.stroke();
    pen.restore();
    fillPts(k, glass, null, k.thin);
    taper(k, u, w, g1, 0.14, g1 + 0.36, 0.07, C.steel, shade(C.steel, 0.12));
    if (on) k.halo(u, w, gm, 1.0, C.magenta, 0.2);
  },
};

// A white router beside the lamp: two antennas at its back, a row of
// lights along its front that blink while its desk is worked (power
// steady), all dark while it is not. Each frame turns one or two of them.
const ROUTER: P3 = [5.3, 2.3, TOP];
const BLINK: ReadonlyArray<ReadonlyArray<0 | 1>> = [
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 1, 1, 0, 1, 1, 0],
  [1, 1, 0, 1, 1, 1, 0, 1],
  [0, 1, 1, 1, 0, 0, 1, 1],
  [1, 1, 1, 0, 1, 1, 1, 1],
];
const router: DeskLoop = {
  name: 'router',
  at: ROUTER,
  r: 0.45,
  h: 1.05,
  frames: 8,
  fps: 4,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = ROUTER;
    for (const s of [-1, 1]) stick(k, [[u + s * 0.3, w - 0.1, z + 0.16], [u + s * 0.4, w - 0.2, z + 0.98]], '#3a4045', 0.07);
    k.box(u - 0.42, w - 0.2, z, 0.84, 0.4, 0.2, '#e9ecea', { line: fine(k), round: 0.06 });
    BLINK.forEach((row, j) => {
      const lit = v.active && row[i] === 1;
      const p: P3 = [u - 0.28 + j * 0.14, w + 0.205, z + 0.1];
      k.dot(...p, 0.035, lit ? (j ? C.green : C.amber) : '#9aa3a0');
      if (lit) k.halo(...p, 0.22, j ? C.green : C.amber, 0.45);
    });
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw,
  // the monitor's glass, inside its bezel
  screen: [
    [2.65, MON.v1, 6.65],
    [4.9, MON.v1, 6.65],
    [4.9, MON.v1, 9.45],
    [2.65, MON.v1, 9.45],
  ],
  // the right end's back corner, clear of the agent and the screen
  top: [6.5, 0.5, TOP],
  clutter: {
    items: [energyCan, rubberDuck, noodleCup, pizzaSlice, cactus, gamepad, puzzleCube, keycaps, coffeeMug, floppies],
    // the strip between the agent and the monitor, and the mat right of
    // the mouse
    spots: [
      [1.45, 0.75, TOP],
      [2.35, 1.05, TOP],
      [3.4, 1.5, TOP],
      [4.2, 2.0, TOP],
      [4.9, 1.35, TOP],
    ],
  },
  loops: [lavaLamp, router],
};
