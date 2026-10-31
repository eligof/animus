import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { beaker, bolt, bubbles, bulb, crate, erlenmeyer, fillPts, gauge, hazard, jar, needle, pilot, ring, scrawl, stool, tube, zigzag } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, Kit as KitClass, due, hash, kitOf, spark, still, wisp, withAlpha } from './kit.ts';

// The lab's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame, and look
// the same at any time while nobody works them (so nothing is sent).

type Spawn = (p: Particle) => void;

// A point on the quad a (u0, z0) - (u1, z1) of a plane.
const on = (q: readonly [P3, P3, P3, P3], fu: number, fz: number): P3 => {
  const [a, b, , d] = q;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

const quad = (u0: number, u1: number, n: number, z0: number, z1: number): readonly [P3, P3, P3, P3] => [[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]];

// Lines of text that scroll up a screen quad: rows of coloured dashes.
function codeRows(k: Kit, scr: readonly [P3, P3, P3, P3], t: number, colors: readonly Color[], rows = 7, speed = 2.4): void {
  const pen = k.pen;
  const roll = t * speed;
  const base = Math.floor(roll);
  for (const [ci, c] of colors.entries()) {
    pen.beginPath();
    for (let i = 0; i < rows + 1; i++) {
      const row = base - i;
      if (Math.floor(hash(row, 3) * colors.length) !== ci) continue;
      const fz = 0.1 + (i + roll - base) * (0.82 / rows);
      if (fz > 0.88) continue;
      const ind = Math.floor(hash(row, 1) * 3) * 0.08;
      const len = 0.2 + hash(row, 2) * 0.5;
      const f0 = 0.1 + ind;
      const f1 = Math.min(0.9, f0 + len);
      k.trace([on(scr, f0, fz), on(scr, f1, fz), on(scr, f1, fz + 0.06), on(scr, f0, fz + 0.06)]);
    }
    pen.fillStyle = c;
    pen.fill();
  }
}

// ── write: the chemistry bench ──────────────────────────────────────────────
// Teal cupboards under a black resin top, brought out from a pegboard of
// tools so the chemist stands between them (CHEMIST, see npcs.ts): an old
// green-screen terminal at one end, facing out, its keyboard by it; at the
// other a round flask on a ring stand over a Bunsen burner piped through a
// glass coil into a conical flask; a rack of test tubes, a beaker and an
// open notebook in front. The chemist's own flask is in her hand. Worked,
// the burner lights, the flask boils, the distillate drips and the
// terminal writes.

const ZT = 6.2; // the bench top
const BENCH = { back: 2.3, front: 6.9 };
// Where the chemist stands: behind the bench, toward its terminal end.
export const CHEMIST = { u: 3.2, v: 1.85, top: ZT, edge: BENCH.back };
const CRT = quad(0.75, 2.45, 6.53, ZT + 0.45, ZT + 2.05);
const FLASK = { u: 7.9, v: 3.2, z: ZT + 2.3, R: 0.95 };
const COIL = { u: 9.75, v: 3.2, z0: ZT + 3.3, z1: ZT + 5.3, r: 0.45 };
const BEAKER: P3 = [10.1, 5.6, ZT];

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 13, (k) => {
      const { back, front } = BENCH;
      k.shadow(5.5, 4.4, 6.4, 3.2, 0.3);
      // the pegboard and what hangs on it, behind the chemist
      k.face(0.5, 10.5, 0.06, ZT + 0.4, ZT + 5.4, '#d8c7a2', k.thin, 0.15);
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (let u = 0.9; u < 10.3; u += 0.6) {
          for (let z = ZT + 0.8; z < ZT + 5.1; z += 0.6) {
            const [x, y] = k.p(u, 0.07, z);
            pen.moveTo(x + 0.06 * k.s, y);
            pen.arc(x, y, 0.06 * k.s, 0, Math.PI * 2);
          }
        }
        pen.fillStyle = '#8a7a5c';
        pen.fill();
      }
      // goggles, tongs, a funnel and a thermometer on hooks
      k.rod([[0.8, 0.2, ZT + 4.7], [2.2, 0.2, ZT + 4.7]], '#3a4449', 0.12);
      for (const du of [1.05, 1.9]) fillPts(k, ring(k, [du, 0.25, ZT + 4.4], [0, 1, 0], 0.42, 14), '#bfe8f0', k.thin);
      k.rod([[5.4, 0.2, ZT + 4.8], [5.1, 0.25, ZT + 2.8]], C.steel, 0.12);
      k.rod([[5.4, 0.2, ZT + 4.8], [5.7, 0.25, ZT + 2.8]], C.steel, 0.12);
      k.poly([[8.8, 0.2, ZT + 4.9], [10.0, 0.2, ZT + 4.9], [9.5, 0.25, ZT + 4.0], [9.5, 0.25, ZT + 3.1], [9.3, 0.25, ZT + 3.1], [9.3, 0.25, ZT + 4.0]], '#cfe9ef', k.thin);
      k.rod([[6.9, 0.2, ZT + 5.1], [6.9, 0.2, ZT + 2.2]], '#f2f6f6', 0.18);
      k.dot(6.9, 0.3, ZT + 2.25, Math.max(1, 0.16 * k.s), C.red);
      // the bench: a toe kick, the cupboards, doors and a drawer row
      k.box(0.8, back + 0.5, 0, 9.4, front - back - 1.1, 0.6, C.iron, { stripe: false });
      k.box(0.6, back + 0.3, 0.6, 9.8, front - back - 0.8, ZT - 1.15, C.cabinet, { stripe: false });
      const F = front - 0.48;
      for (const [u0, u1] of [[1.0, 3.9], [4.1, 7.0], [7.2, 10.1]] as const) {
        k.face(u0, u1, F, 0.95, ZT - 2.35, k.side(shade(C.cabinet, 0.04), 0, 1), k.thin, 0.1);
        k.face(u0, u1, F, ZT - 2.05, ZT - 0.85, k.side(shade(C.cabinet, 0.04), 0, 1), k.thin, 0.1);
        k.rod([[(u0 + u1) / 2 - 0.5, F + 0.1, ZT - 1.45], [(u0 + u1) / 2 + 0.5, F + 0.1, ZT - 1.45]], C.chrome, 0.12);
        k.rod([[u1 - 0.4, F + 0.1, ZT - 3.05], [u1 - 0.4, F + 0.1, ZT - 3.95]], C.chrome, 0.12);
      }
      k.box(0.3, back, ZT - 0.55, 10.4, front - back, 0.55, C.resin);
      // the terminal at the end, facing out: a beige box, its bezel, the keyboard
      k.box(0.5, 4.3, ZT, 2.2, 2.2, 2.5, '#ddd5bd', { round: 0.25 });
      k.box(0.8, 3.9, ZT + 0.3, 1.6, 0.6, 1.8, '#c9c0a6', { line: k.thin, stripe: false });
      k.face(0.6, 2.6, 6.52, ZT + 0.35, ZT + 2.15, '#bdb49a', k.thin, 0.25);
      k.box(2.9, 5.7, ZT, 1.7, 0.9, 0.3, '#ddd5bd', { line: k.thin });
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (let i = 0; i < 3; i++) for (let j = 0; j < 5; j++) {
          const [x, y] = k.p(3.05 + j * 0.3, 5.82 + i * 0.25, ZT + 0.31);
          pen.moveTo(x, y);
          pen.lineTo(x + 0.15 * k.s, y + 0.075 * k.s);
        }
        pen.strokeStyle = '#9a917a';
        pen.lineWidth = 0.1 * k.s;
        pen.stroke();
      }
      // the notebook, the tube rack
      notebook(k, 4.4, 4.3, ZT + 0.02, v.seed);
      k.box(6.4, 5.3, ZT, 2.0, 1.0, 0.25, C.wood, { line: k.thin });
      for (const [i, c] of ([C.green, C.magenta, C.blue, C.amber] as const).entries()) tube(k, 6.75 + i * 0.45, 5.8, ZT + 0.15, 1.7, c, 0.5 + 0.1 * (i % 2));
      k.box(6.4, 5.3, ZT + 1.0, 2.0, 1.0, 0.18, C.wood, { line: k.thin, stripe: false });
      // the ring stand: plate, rod, a clamp on the flask's neck
      k.box(FLASK.u - 1.3, FLASK.v - 0.7, ZT, 2.3, 1.5, 0.18, C.iron, { line: k.thin, stripe: false });
      k.rod([[FLASK.u - 0.9, FLASK.v - 0.6, ZT], [FLASK.u - 0.9, FLASK.v - 0.6, ZT + 6.0]], C.steel, 0.16);
      // the burner under the flask, its hose off along the bench
      k.cyl(FLASK.u, FLASK.v, ZT, 0.5, 0.22, C.iron, { line: k.thin });
      k.cyl(FLASK.u, FLASK.v, ZT + 0.22, 0.17, 1.35, C.brass, { line: k.thin });
      k.cyl(FLASK.u, FLASK.v, ZT + 0.6, 0.24, 0.25, C.brass, { line: k.thin });
      k.rod([[FLASK.u - 0.4, FLASK.v, ZT + 0.12], [FLASK.u - 1.0, FLASK.v + 0.9, ZT + 0.05], [FLASK.u - 0.9, FLASK.v + 1.8, ZT + 0.05]], '#c0504a', 0.14);
      // the round flask and its neck, clamped
      bulb(k, FLASK.u, FLASK.v, FLASK.z, FLASK.R, 0.9, C.green, 0.48);
      k.rod([[FLASK.u - 0.9, FLASK.v - 0.6, ZT + 4.6], [FLASK.u, FLASK.v, ZT + 4.6]], C.steelDark, 0.14);
      k.box(FLASK.u - 0.3, FLASK.v - 0.3, ZT + 4.4, 0.6, 0.6, 0.4, C.steelDark, { line: k.thin, stripe: false });
      // over the top and down the coil into the conical flask
      const neckTop: P3 = [FLASK.u, FLASK.v, ZT + 5.2];
      glassTube(k, [neckTop, [FLASK.u, FLASK.v, ZT + 5.8], [COIL.u, COIL.v, ZT + 5.8], [COIL.u, COIL.v, COIL.z1]]);
      coil(k);
      glassTube(k, [[COIL.u, COIL.v, COIL.z0], [COIL.u, COIL.v, ZT + 2.75]]);
      k.rod([[COIL.u + 0.6, COIL.v - 0.75, ZT], [COIL.u + 0.6, COIL.v - 0.75, ZT + 6.0]], C.steel, 0.16);
      k.box(COIL.u + 0.2, COIL.v - 1.05, ZT, 0.75, 0.75, 0.16, C.iron, { line: k.thin, stripe: false });
      k.rod([[COIL.u + 0.6, COIL.v - 0.75, ZT + 4.3], [COIL.u + 0.3, COIL.v, ZT + 4.3]], C.steelDark, 0.12);
      erlenmeyer(k, COIL.u, COIL.v, ZT, 2.4, C.greenGlow, 0.32);
      // a beaker with a stirring rod at the front corner
      beaker(k, BEAKER[0], BEAKER[1], ZT, 0.55, 1.35, C.magenta, 0.55);
      k.rod([[BEAKER[0] - 0.1, BEAKER[1] - 0.1, ZT + 0.4], [BEAKER[0] + 0.25, BEAKER[1] - 0.25, ZT + 2.1]], '#e6f6f8', 0.08);
    });
    // the terminal's screen
    if (!v.active) {
      k.poly([...CRT], k.grad(CRT[3], CRT[1], [[0, '#22322e'], [1, '#121c1a']]), 0, 0.2);
      k.poly([on(CRT, 0.55, 0.1), on(CRT, 0.7, 0.1), on(CRT, 0.4, 0.9), on(CRT, 0.25, 0.9)], '#ffffff14', 0);
      return;
    }
    k.poly([...CRT], k.grad(CRT[3], CRT[1], [[0, '#14382b'], [1, '#0c241c']]), 0, 0.2);
    codeRows(k, CRT, v.t, ['#7dffb0', '#c8ffd8', '#4fd88a']);
    k.halo(1.6, 6.9, ZT + 1.3, 2.6, C.screen, 0.3);
    // the burner lit, the flask boiling, the distillate dripping
    const fl = 0.85 + 0.15 * Math.sin(v.t * 21);
    flame(k, FLASK.u, FLASK.v, ZT + 1.55, 0.75 * fl);
    k.halo(FLASK.u, FLASK.v, FLASK.z + 0.8, 2.6, C.greenGlow, 0.3);
    bubbles(k, FLASK.u, FLASK.v + 0.6, FLASK.z + 0.25, FLASK.z + 0.95, 1.1, v.t, 7, 17, '#eaffd8e0', 1.6);
    const ph = (v.t * 1.5) % 1;
    const dz = ZT + 2.7 - ph * ph * 0.6;
    k.dot(COIL.u, COIL.v, dz, Math.max(1, 0.12 * k.s), C.greenGlow);
    bubbles(k, COIL.u, COIL.v + 0.3, ZT + 0.2, ZT + 0.75, 0.9, v.t, 4, 23, '#ffffffc0', 1.1);
    k.halo(COIL.u, COIL.v, ZT + 0.7, 2.0, C.greenGlow, 0.35);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 1.8 : 0.3, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(BEAKER[0], BEAKER[1], ZT + 1.6, Math.floor(v.t * 10), i, [236, 200, 240]));
    if (!v.active) return;
    const m = due(v.t, dt, 1.2, v.seed + 1);
    for (let i = 0; i < m; i++) spawn(wisp(COIL.u, COIL.v, ZT + 2.6, Math.floor(v.t * 10) + 5, i, [200, 255, 180]));
  },
};

// A glass tube along frame points: ink, a pale body and a glint.
function glassTube(k: Kit, pts: ReadonlyArray<P3>, w = 0.24): void {
  k.line(pts, INK, w * k.s + k.lw * 1.2);
  k.line(pts, '#d6f0f2', w * k.s);
  k.line(pts.map(([u, n, z]) => [u - 0.05, n, z + 0.05] as P3), '#ffffffb0', Math.max(0.6, w * 0.3 * k.s));
}

// The condenser coil: a glass helix, its back turns first, then the front.
function coil(k: Kit): void {
  const { u, v, z0, z1, r } = COIL;
  const turns = 4.5;
  const n = 72;
  const seg = (front: boolean) => {
    let run: P3[] = [];
    const flush = () => {
      if (run.length > 1) glassTube(k, run, 0.2);
      run = [];
    };
    for (let i = 0; i <= n; i++) {
      const th = (i / n) * turns * Math.PI * 2;
      const isFront = Math.cos(th) + Math.sin(th) > 0;
      const p: P3 = [u + Math.cos(th) * r, v + Math.sin(th) * r, z1 - ((z1 - z0) * i) / n];
      if (isFront === front) run.push(p);
      else {
        if (run.length) run.push(p);
        flush();
      }
    }
    flush();
  };
  seg(false);
  // a jacket of glass round it
  k.glass(u, v, [[z0 - 0.2, r + 0.35], [z1 + 0.2, r + 0.35]], null);
  seg(true);
}

// A Bunsen flame: an outer pale blue tongue round a bright inner cone.
function flame(k: Kit, u: number, v: number, z: number, h: number): void {
  const [x, y] = k.p(u, v, z);
  const pen = k.pen;
  const H = h * k.s;
  const tongue = (hh: number, w: number, c: Color) => {
    pen.beginPath();
    pen.moveTo(x - w, y);
    pen.quadraticCurveTo(x - w, y - hh * 0.6, x, y - hh);
    pen.quadraticCurveTo(x + w, y - hh * 0.6, x + w, y);
    pen.closePath();
    pen.fillStyle = c;
    pen.fill();
  };
  tongue(H, 0.24 * k.s, '#8fd0ffc0');
  tongue(H * 0.55, 0.14 * k.s, '#3f6fff');
  k.halo(u, v, z + h * 0.4, 1.2, '#7fb8ff', 0.5);
}

// An open lab notebook with a pencil, writing on both pages.
function notebook(k: Kit, u0: number, v0: number, z: number, seed: number): void {
  k.poly([[u0, v0, z], [u0 + 2.0, v0, z], [u0 + 2.0, v0 + 1.3, z], [u0, v0 + 1.3, z]], '#2f4f6a', k.thin);
  k.poly([[u0 + 0.1, v0 + 0.08, z + 0.06], [u0 + 1.0, v0 + 0.05, z + 0.08], [u0 + 1.0, v0 + 1.25, z + 0.08], [u0 + 0.1, v0 + 1.22, z + 0.06]], '#f6f2e6', k.thin * 0.7);
  k.poly([[u0 + 1.0, v0 + 0.05, z + 0.08], [u0 + 1.9, v0 + 0.08, z + 0.06], [u0 + 1.9, v0 + 1.22, z + 0.06], [u0 + 1.0, v0 + 1.25, z + 0.08]], '#fbf8ee', k.thin * 0.7);
  if (k.fine) {
    for (let i = 0; i < 4; i++) {
      for (const a of [u0 + 0.2, u0 + 1.1]) {
        const pts: P3[] = [];
        const l = 0.5 + hash(seed, i, a > u0 + 1 ? 2 : 1) * 0.25;
        for (let f = 0; f <= 1; f += 0.1) pts.push([a + l * f, v0 + 0.25 + i * 0.24, z + 0.1 + Math.sin(f * 30 + i) * 0.02]);
        k.line(pts, '#5a6a7a', Math.max(0.6, 0.05 * k.s));
      }
    }
  }
  k.rod([[u0 + 1.5, v0 + 0.5, z + 0.15], [u0 + 2.3, v0 + 1.1, z + 0.15]], C.hazard, 0.1);
}

// ── read: the specimen cabinet ─────────────────────────────────────────────
// A tall teal cabinet of specimens: jars of an eye, a brain, a frog, a fish
// and a tentacle in yellow-green fluid, ring binders and a stack of petri
// dishes, a skull and a big jar on top; beside it a specimen tank on its
// stand, a brain floating in it. Reading lights the tank: the brain glows,
// bubbles rise and the eye in its jar looks about.

const SHELVES = [0.9, 5.65, 10.4, 15.15, 19.0];
const BAYS: ReadonlyArray<readonly [number, number]> = [[0.95, 5.05], [5.55, 9.65]];
const TANK = { u: 12.2, v: 2.0, z0: 2.2, z1: 10.8, r: 1.15 };
const EYE = { u: 2.3, v: 2.2, z: 15.15 + 1.2 }; // the eye's jar, top shelf, left bay

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const body = '#3d6b66';
    const k = still(v, 'read', 21, (k) => {
      const F = 3.4;
      k.shadow(5.3, 2.4, 6.2, 2.6, 0.3);
      k.box(0.3, 0.05, 0, 10, F - 0.05, 19.7, body, { stripe: false });
      k.box(0.1, 0, 19.7, 10.4, F + 0.25, 0.6, shade(body, 0.06));
      k.box(0.1, 0, 0, 10.4, F + 0.2, 0.9, shade(body, -0.12), { stripe: false });
      SHELVES.slice(0, -1).forEach((z0, r) => {
        const z1 = SHELVES[r + 1] - 0.45;
        for (const [bi, [u0, u1]] of BAYS.entries()) {
          k.poly([[u0, F, z0], [u1, F, z0], [u1, F, z1], [u0, F, z1]], k.vgrad(u0, F, z0, z1, [[0, '#1d3532'], [1, '#132624']]), k.thin);
          shelfRow(k, u0, u1, F, z0, z1 - z0, v.seed + r * 7 + bi * 3, r * 2 + bi);
        }
      });
      // a skull and a big jar on top
      skull(k, 2.6, 1.7, 20.3, 0.9);
      jar(k, 7.6, 1.6, 20.3, 0.95, 2.4, C.fluid, C.iron, (x, y, sz) => tentacle(k, x, y, sz));
      // the tank's stand, its lid and hoses up into the cabinet's side
      k.shadow(TANK.u, TANK.v, 2.0, 1.7, 0.28);
      k.cyl(TANK.u, TANK.v, 0, 1.45, 1.4, C.steelDark);
      k.cyl(TANK.u, TANK.v, 1.4, 1.35, 0.8, C.iron);
      pilotBox(k, TANK.u + 1.05, TANK.v + 1.0, 0.4);
      k.glass(TANK.u, TANK.v, [[TANK.z0, TANK.r], [TANK.z1, TANK.r]], C.fluid, 0.9);
      brain(k, TANK.u, TANK.v, (TANK.z0 + TANK.z1) / 2 + 0.6, 0.85);
      k.cyl(TANK.u, TANK.v, TANK.z1, TANK.r + 0.1, 0.6, C.steelDark);
      k.box(10.3, 0.6, TANK.z1 + 2.2, 0.5, 1.6, 1.4, C.steelDark, { line: k.thin, stripe: false });
      k.rod([[TANK.u - 0.4, TANK.v, TANK.z1 + 0.6], [TANK.u - 0.7, TANK.v, TANK.z1 + 1.9], [11.2, 1.7, TANK.z1 + 2.6], [10.8, 1.6, TANK.z1 + 2.7]], '#2a3034', 0.22);
      k.rod([[TANK.u + 0.3, TANK.v - 0.3, TANK.z1 + 0.6], [TANK.u + 0.1, TANK.v - 0.6, TANK.z1 + 2.6], [11.2, 0.9, TANK.z1 + 3.2], [10.8, 0.9, TANK.z1 + 3.2]], '#c0504a', 0.16);
      k.dot(10.82, 1.3, TANK.z1 + 2.4, Math.max(1, 0.12 * k.s), C.amber);
    });
    // the eye in its jar: where it looks
    const look = v.active ? Math.sin(v.t * 1.7) * 0.9 + Math.sin(v.t * 4.3) * 0.3 : 0.3;
    const [ex, ey] = k.p(EYE.u, EYE.v, EYE.z);
    const R = 0.55 * k.s;
    k.pen.beginPath();
    k.pen.arc(ex, ey, R, 0, Math.PI * 2);
    k.paint('#fbf6ee', k.thin);
    const px = ex + look * R * 0.42;
    const py = ey + (v.active ? Math.sin(v.t * 2.9) * R * 0.2 : 0.1 * R);
    k.pen.beginPath();
    k.pen.arc(px, py, R * 0.46, 0, Math.PI * 2);
    k.pen.fillStyle = '#3f9f7a';
    k.pen.fill();
    k.pen.beginPath();
    k.pen.arc(px, py, R * 0.22, 0, Math.PI * 2);
    k.pen.fillStyle = INK;
    k.pen.fill();
    k.pen.beginPath();
    k.pen.arc(px - R * 0.12, py - R * 0.14, R * 0.09, 0, Math.PI * 2);
    k.pen.fillStyle = '#ffffff';
    k.pen.fill();
    pilot(k, TANK.u + 1.05, TANK.v + 1.42, 1.0, 0.15, C.green, v.active);
    if (!v.active) return;
    const pulse = 0.4 + 0.12 * Math.sin(v.t * 3.1);
    k.halo(TANK.u, TANK.v + 0.5, (TANK.z0 + TANK.z1) / 2 + 0.6, 3.2, C.greenGlow, pulse);
    bubbles(k, TANK.u, TANK.v + 0.6, TANK.z0 + 0.3, TANK.z1 - 1.0, 1.6, v.t, 9, 31, '#ffffffc8', 0.6);
  },
};

// What stands on one shelf of the cabinet: jars of specimens, ring binders,
// stacked dishes, a bottle or two. `slot` picks a mix.
function shelfRow(k: Kit, u0: number, u1: number, F: number, z: number, h: number, seed: number, slot: number): void {
  const v = F - 1.2;
  if (slot === 6) {
    // the eye's shelf: its jar (the eye is drawn live), a frog, binders
    jar(k, EYE.u, EYE.v, z, 0.8, 2.3, C.fluid, C.iron);
    jar(k, 3.9, 2.0, z, 0.7, 1.8, '#c9e48a', C.copper, (x, y, s) => frog(k, x, y, s));
    return;
  }
  const kind = (slot * 3 + Math.floor(hash(seed, 5) * 3)) % 5;
  if (kind === 0) {
    binders(k, u0 + 0.15, u0 + 2.6, F - 0.05, z, h * 0.85, seed);
    jar(k, u1 - 0.95, v, z, 0.7, 2.0, C.fluid, C.iron, (x, y, s) => fish(k, x, y, s));
  } else if (kind === 1) {
    jar(k, u0 + 1.0, v, z, 0.78, 2.4, C.fluid, '#7a5a3a', (x, y, s) => brain2d(k, x, y, s));
    for (let j = 0; j < 4; j++) k.cyl(u1 - 1.3, v + 0.2, z + j * 0.2, 0.75, 0.2, '#e6f4f6', { line: k.thin * 0.8 });
    k.cyl(u1 - 1.3, v + 0.2, z + 0.81, 0.6, 0.06, '#d9a3c8', { line: 0 });
  } else if (kind === 2) {
    binders(k, u0 + 0.15, u1 - 0.15, F - 0.05, z, h * 0.85, seed);
  } else if (kind === 3) {
    jar(k, u0 + 0.9, v, z, 0.7, 1.9, '#d6e88a', C.iron, (x, y, s) => tentacle(k, x, y, s * 0.8));
    jar(k, u0 + 2.4, v + 0.2, z, 0.55, 1.4, '#e8d08a', C.copper, (x, y, s) => mushroom(k, x, y, s));
    k.cyl(u1 - 0.8, v, z, 0.42, 1.5, '#8a4a22', { line: k.thin });
  } else {
    erlenmeyer(k, u0 + 0.9, v, z, 1.8, C.magenta, 0.4);
    binders(k, u0 + 1.9, u1 - 0.15, F - 0.05, z, h * 0.85, seed);
  }
}

// Ring binders standing on a shelf at z: their spines on the plane v.
function binders(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const colors: Color[] = ['#2f6fb0', '#d0453f', '#f2c230', '#3aa597', '#6a4fa0', '#e8e2d0', '#e07a3a'];
  let u = u0;
  let i = 0;
  while (u < u1 - 0.5) {
    const w = 0.55 + hash(seed, i, 1) * 0.25;
    if (u + w > u1) break;
    const h = hmax * (0.8 + hash(seed, i, 2) * 0.15);
    const c = colors[Math.floor(hash(seed, i, 3) * colors.length)];
    k.poly([[u, v, z], [u + w, v, z], [u + w, v, z + h], [u, v, z + h]], k.side(c, 0, 1, 0.1), k.thin * 0.8);
    k.poly([[u + 0.1, v + 0.01, z + h * 0.62], [u + w - 0.1, v + 0.01, z + h * 0.62], [u + w - 0.1, v + 0.01, z + h * 0.82], [u + 0.1, v + 0.01, z + h * 0.82]], C.paper, 0);
    k.dot(u + w / 2, v + 0.02, z + h * 0.3, Math.max(0.7, 0.1 * k.s), '#f6f2e6');
    u += w + 0.03;
    i++;
  }
}

// Things floating in jars, drawn at screen point (x, y) for a jar r px across.
function frog(k: Kit, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y + r * 0.1, r * 0.55, r * 0.4, 0, 0, Math.PI * 2);
  k.paint('#5fa84a', k.thin * 0.7);
  for (const sx of [-1, 1]) {
    pen.beginPath();
    pen.ellipse(x + sx * r * 0.28, y - r * 0.28, r * 0.16, r * 0.16, 0, 0, Math.PI * 2);
    k.paint('#f6f2e6', k.thin * 0.6);
    pen.beginPath();
    pen.moveTo(x + sx * r * 0.4, y + r * 0.3);
    pen.lineTo(x + sx * r * 0.75, y + r * 0.6);
    pen.strokeStyle = '#3f7a35';
    pen.lineWidth = Math.max(0.8, r * 0.12);
    pen.stroke();
  }
}

function fish(k: Kit, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x - r * 0.6, y);
  pen.quadraticCurveTo(x - r * 0.1, y - r * 0.38, x + r * 0.35, y);
  pen.quadraticCurveTo(x - r * 0.1, y + r * 0.38, x - r * 0.6, y);
  pen.moveTo(x + r * 0.3, y);
  pen.lineTo(x + r * 0.65, y - r * 0.28);
  pen.lineTo(x + r * 0.65, y + r * 0.28);
  pen.closePath();
  k.paint('#e8b44a', k.thin * 0.7);
  pen.beginPath();
  pen.arc(x - r * 0.35, y - r * 0.05, Math.max(0.6, r * 0.07), 0, Math.PI * 2);
  pen.fillStyle = INK;
  pen.fill();
}

function tentacle(k: Kit, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x - r * 0.2, y + r * 0.9);
  pen.bezierCurveTo(x - r * 0.5, y + r * 0.2, x + r * 0.5, y - r * 0.1, x - r * 0.1, y - r * 0.8);
  pen.strokeStyle = INK;
  pen.lineWidth = r * 0.42 + k.thin;
  pen.lineCap = 'round';
  pen.stroke();
  pen.strokeStyle = '#d97aa8';
  pen.lineWidth = r * 0.42;
  pen.stroke();
  if (r >= 6) {
    pen.beginPath();
    for (let i = 0; i < 4; i++) {
      const t = 0.2 + i * 0.18;
      const px = x - r * 0.1 + Math.sin(t * 5) * r * 0.25;
      const py = y + r * 0.9 - t * r * 1.6;
      pen.moveTo(px + r * 0.07, py);
      pen.arc(px, py, r * 0.07, 0, Math.PI * 2);
    }
    pen.fillStyle = '#f6c2d8';
    pen.fill();
  }
}

function mushroom(k: Kit, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  pen.rect(x - r * 0.12, y - r * 0.1, r * 0.24, r * 0.7);
  k.paint('#f2ead6', k.thin * 0.6);
  pen.beginPath();
  pen.ellipse(x, y - r * 0.12, r * 0.55, r * 0.35, 0, Math.PI, Math.PI * 2);
  pen.closePath();
  k.paint('#d0453f', k.thin * 0.7);
}

// A brain seen side on, in screen space (in a small jar).
function brain2d(k: Kit, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, r * 0.6, r * 0.45, 0, 0, Math.PI * 2);
  k.paint('#f2a7b8', k.thin * 0.7);
  if (r >= 5) {
    pen.beginPath();
    pen.moveTo(x - r * 0.4, y - r * 0.05);
    pen.bezierCurveTo(x - r * 0.2, y - r * 0.35, x, y + r * 0.2, x + r * 0.2, y - r * 0.2);
    pen.moveTo(x - r * 0.2, y + r * 0.25);
    pen.quadraticCurveTo(x + r * 0.1, y + r * 0.05, x + r * 0.4, y + r * 0.2);
    pen.strokeStyle = '#c0607a';
    pen.lineWidth = Math.max(0.6, r * 0.07);
    pen.stroke();
  }
}

// The brain in the tank: a bigger one, lobed, its stem trailing.
function brain(k: Kit, u: number, v: number, z: number, r: number): void {
  const [x, y] = k.p(u, v, z);
  const R = r * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x + R * 0.1, y + R * 0.5);
  pen.quadraticCurveTo(x + R * 0.2, y + R * 1.1, x - R * 0.05, y + R * 1.6);
  pen.strokeStyle = INK;
  pen.lineWidth = R * 0.25 + k.thin;
  pen.stroke();
  pen.strokeStyle = '#e88aa0';
  pen.lineWidth = R * 0.25;
  pen.stroke();
  pen.beginPath();
  pen.ellipse(x, y, R * 1.15, R * 0.8, -0.1, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - R * 0.4, y - R * 0.4, 0, x, y, R * 1.2);
  g.addColorStop(0, '#ffd0dc');
  g.addColorStop(0.6, '#f2a0b4');
  g.addColorStop(1, '#d07890');
  k.paint(g, k.thin);
  pen.beginPath();
  pen.moveTo(x - R * 0.05, y - R * 0.75);
  pen.quadraticCurveTo(x + R * 0.15, y, x - R * 0.05, y + R * 0.7);
  for (let i = 0; i < 4; i++) {
    const sx = i < 2 ? -1 : 1;
    const yy = y - R * 0.35 + (i % 2) * R * 0.45;
    pen.moveTo(x + sx * R * 0.25, yy);
    pen.bezierCurveTo(x + sx * R * 0.5, yy - R * 0.25, x + sx * R * 0.7, yy + R * 0.2, x + sx * R * 0.95, yy - R * 0.05);
  }
  pen.strokeStyle = '#b8607a';
  pen.lineWidth = Math.max(0.7, R * 0.08);
  pen.stroke();
}

// A cartoon skull on z, facing +v.
function skull(k: Kit, u: number, v: number, z: number, r: number): void {
  const [x, y] = k.p(u, v, z + r);
  const R = r * k.s;
  const pen = k.pen;
  k.shadow(u, v, r * 1.1, r * 0.9, 0.25, z);
  pen.beginPath();
  pen.ellipse(x, y - R * 0.15, R * 0.95, R * 0.85, 0, Math.PI * 0.95, Math.PI * 2.05);
  pen.lineTo(x + R * 0.6, y + R * 0.75);
  pen.lineTo(x - R * 0.6, y + R * 0.75);
  pen.closePath();
  const g = pen.createLinearGradient(x - R, 0, x + R, 0);
  g.addColorStop(0, '#fbf6e8');
  g.addColorStop(1, '#d8cfb6');
  k.paint(g, k.lw);
  for (const sx of [-1, 1]) {
    pen.beginPath();
    pen.ellipse(x + sx * R * 0.38, y + R * 0.05, R * 0.24, R * 0.28, 0, 0, Math.PI * 2);
    pen.fillStyle = INK;
    pen.fill();
  }
  pen.beginPath();
  pen.moveTo(x, y + R * 0.32);
  pen.lineTo(x - R * 0.1, y + R * 0.5);
  pen.lineTo(x + R * 0.1, y + R * 0.5);
  pen.closePath();
  pen.fillStyle = INK;
  pen.fill();
  pen.beginPath();
  for (let i = -2; i <= 2; i++) {
    pen.moveTo(x + i * R * 0.15, y + R * 0.6);
    pen.lineTo(x + i * R * 0.15, y + R * 0.75);
  }
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.6, R * 0.06);
  pen.stroke();
}

// A little control box with a pilot light's bezel (the light is live).
function pilotBox(k: Kit, u: number, v: number, z: number): void {
  k.box(u - 0.45, v - 0.4, z, 0.9, 0.4, 1.2, C.steel, { line: k.thin, stripe: false });
}

// ── search: the specimen drawers and the microscope ───────────────────────
// A counter of little specimen drawers with brass pulls under a resin top:
// a big microscope, a monitor with a double helix on it, a rack of petri
// dishes, a slide box and a magnifier on a stand. Searching lights the
// microscope's lamp, turns the helix with a scan line down it, and pulls
// a drawer out and in.

const MON = quad(7.15, 10.25, 2.36, 7.65, 10.25);
const HELIX = 0.5;

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const zt = 6.3;
    const k = still(v, 'search', 12, (k) => {
      k.shadow(6, 2.2, 6.6, 2.6, 0.3);
      k.box(0.5, 0.45, 0, 11, 3.2, 0.6, C.iron, { stripe: false });
      k.box(0.3, 0.3, 0.6, 11.4, 3.5, 5.2, '#d9e4e0', { stripe: false });
      // the drawers: four rows of five, brass pulls and label frames
      const F = 3.8;
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 6; c++) {
          const u0 = 0.65 + c * 1.83;
          const z0 = 0.9 + r * 1.2;
          if (r === 1 && c === 2) continue; // the drawer that pulls out (live)
          drawerFace(k, u0, F, z0);
        }
      }
      k.box(0.1, 0.1, 5.8, 11.8, 3.9, 0.5, C.resin);
      // the microscope
      microscope(k, 3.0, 1.7, zt, 1.3);
      // petri dishes in a stack, a slide box, the magnifier
      for (let j = 0; j < 4; j++) k.cyl(5.3, 2.8, zt + j * 0.22, 0.7, 0.22, '#e6f4f6', { line: k.thin * 0.8 });
      k.disc(5.3, 2.8, zt + 0.89, 0.55, '#f2c6d8', 0);
      k.box(0.6, 2.6, zt, 1.6, 1.0, 0.45, '#3a6fa0', { line: k.thin });
      k.box(0.65, 2.65, zt + 0.45, 1.5, 0.9, 0.08, '#e6f2f4', { line: k.thin * 0.7, stripe: false });
      // the monitor on its stand, its screen live
      k.box(8.2, 1.1, zt, 1.0, 0.8, 0.2, C.iron, { line: k.thin });
      k.rod([[8.7, 1.4, zt + 0.2], [8.7, 1.5, zt + 1.4]], C.steelDark, 0.25);
      k.box(6.9, 1.6, zt + 1.15, 3.6, 0.75, 3.05, '#2d363b', { round: 0.15 });
      k.dot(10.15, 2.37, zt + 1.3, Math.max(1, 0.1 * k.s), C.green);
      // a magnifier on a stand at the end
      k.cyl(11.0, 2.9, zt, 0.45, 0.2, C.iron, { line: k.thin });
      k.rod([[11.0, 2.9, zt + 0.2], [11.0, 2.9, zt + 1.6], [10.9, 3.3, zt + 2.2]], C.chrome, 0.1);
      fillPts(k, ring(k, [10.9, 3.4, zt + 2.6], [0.3, 1, 0.2], 0.55, 18), '#cfeef4a0', k.lw);
    });
    // the drawer: in, or out and back while someone searches
    const out = v.active ? Math.max(0, Math.sin(v.t * 1.3)) * 1.4 : 0;
    const F = 3.8;
    if (out > 0.05) {
      const u0 = 0.65 + 2 * 1.83;
      const z0 = 0.9 + 1.2;
      k.box(u0 + 0.12, F - 0.4, z0 + 0.1, 1.6, out + 0.4, 0.95, '#c9d6d2', { line: k.thin, stripe: false });
      k.poly([[u0 + 0.3, F, z0 + 1.0], [u0 + 1.55, F, z0 + 1.0], [u0 + 1.55, F + out - 0.15, z0 + 1.0], [u0 + 0.3, F + out - 0.15, z0 + 1.0]], '#3a4a50', 0);
      for (let i = 0; i < 3; i++) k.box(u0 + 0.35 + i * 0.4, F + 0.1, z0 + 1.0, 0.3, Math.max(0.1, out - 0.4), 0.12, ['#f2c6d8', '#bfe8f0', '#f6e08a'][i], { line: k.thin * 0.6, stripe: false });
      drawerFace(k, u0, F + out, z0);
    } else drawerFace(k, 0.65 + 2 * 1.83, F, 0.9 + 1.2);
    // the screen: the helix, still or turning with a scan line
    const ph = v.active ? v.t * 2.2 : HELIX;
    k.poly([...MON], k.grad(MON[3], MON[1], [[0, '#0f2a33'], [1, '#08181e']]), 0, 0.15);
    helix(k, MON, ph, v.active);
    if (v.active) {
      const f = (v.t * 0.5) % 1;
      k.poly([on(MON, 0.03, 1 - f - 0.02), on(MON, 0.97, 1 - f - 0.02), on(MON, 0.97, 1 - f + 0.02), on(MON, 0.03, 1 - f + 0.02)], '#7fffe080', 0);
      k.halo(8.7, 2.8, zt + 2.7, 3, '#7fe8ff', 0.25);
      // the microscope's lamp lit under the stage
      k.halo(3.0, 2.1, zt + 2.0, 1.8, '#fff4c0', 0.7);
      k.dot(3.0, 2.1, zt + 1.95, Math.max(1, 0.24 * k.s), '#fff8d8');
    }
  },
};

function drawerFace(k: Kit, u0: number, F: number, z0: number): void {
  k.poly([[u0 + 0.1, F, z0], [u0 + 1.73, F, z0], [u0 + 1.73, F, z0 + 1.08], [u0 + 0.1, F, z0 + 1.08]], k.side('#e6eeeb', 0, 1, 0.12), k.thin * 0.8);
  k.poly([[u0 + 0.55, F + 0.01, z0 + 0.62], [u0 + 1.28, F + 0.01, z0 + 0.62], [u0 + 1.28, F + 0.01, z0 + 0.92], [u0 + 0.55, F + 0.01, z0 + 0.92]], '#f6f2e6', k.thin * 0.5);
  k.rod([[u0 + 0.7, F + 0.08, z0 + 0.35], [u0 + 1.13, F + 0.08, z0 + 0.35]], C.brass, 0.1);
}

// A double helix across a screen quad: two strands as sine waves out of
// phase, rungs between them; the front strand brighter.
function helix(k: Kit, scr: readonly [P3, P3, P3, P3], ph: number, lit: boolean): void {
  const n = 22;
  const a: P3[] = [];
  const b: P3[] = [];
  const rungs: P3[][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const th = f * Math.PI * 3 + ph;
    const fa = 0.5 + Math.sin(th) * 0.28;
    const fb = 0.5 - Math.sin(th) * 0.28;
    const fz = 0.1 + f * 0.8;
    a.push(on(scr, fa, fz));
    b.push(on(scr, fb, fz));
    if (i % 2 === 1) rungs.push([on(scr, fa, fz), on(scr, fb, fz)]);
  }
  const dim = lit ? 1 : 0.55;
  const w = Math.max(0.8, 0.12 * k.s);
  for (const r of rungs) k.line(r, withAlpha('#7fe8ff', 0.5 * dim), Math.max(0.6, 0.06 * k.s));
  k.line(b, withAlpha('#ff7ad0', dim), w);
  k.line(a, withAlpha('#7fffd0', dim), w);
}

// A cartoon microscope at (u, v) on z, its eyepiece toward the viewer.
function microscope(k0: Kit, u: number, v: number, z: number, sc = 1): void {
  const body = '#2f3a40';
  const cream = '#efe8d6';
  const k = scaled(k0, u, v, z, sc);
  k.shadow(u, v, 1.6, 1.3, 0.25, z);
  // the horseshoe foot and the pillar
  k.box(u - 1.0, v - 0.9, z, 2.0, 1.9, 0.45, body, { round: 0.3 });
  k.box(u - 0.35, v - 0.85, z + 0.45, 0.7, 0.6, 1.9, body, { line: k.lw });
  // the stage with its clips
  k.box(u - 0.95, v - 0.45, z + 1.6, 1.9, 1.4, 0.18, body, { line: k.thin });
  k.poly([[u - 0.6, v + 0.1, z + 1.79], [u + 0.6, v + 0.1, z + 1.79], [u + 0.6, v + 0.45, z + 1.79], [u - 0.6, v + 0.45, z + 1.79]], '#dff2f6', k.thin * 0.6);
  // the arm, curving up and forward
  k.rod([[u, v - 0.6, z + 1.4], [u, v - 0.75, z + 2.6], [u, v - 0.3, z + 3.6], [u, v + 0.15, z + 3.9]], cream, 0.42);
  // the tube with its turret and objectives, the eyepiece angled forward
  k.cyl(u, v + 0.3, z + 2.3, 0.32, 1.5, cream, { line: k.lw });
  k.cyl(u, v + 0.3, z + 2.05, 0.42, 0.28, C.chrome, { line: k.thin });
  for (const du of [-0.18, 0.18]) k.rod([[u + du, v + 0.3, z + 2.05], [u + du * 1.3, v + 0.35, z + 1.88]], C.chrome, 0.13);
  k.rod([[u, v + 0.3, z + 3.75], [u, v + 0.75, z + 4.5]], cream, 0.36);
  k.rod([[u, v + 0.75, z + 4.5], [u, v + 0.9, z + 4.75]], body, 0.4);
  // the focus knobs
  for (const du of [-0.45, 0.45]) {
    k.pen.beginPath();
    const [x, y] = k.p(u + du, v - 0.6, z + 2.0);
    k.pen.ellipse(x, y, 0.2 * k.s, 0.32 * k.s, 0, 0, Math.PI * 2);
    k.paint(C.chrome, k.thin);
  }
}

// A kit drawing about (u, v, z) scaled up by sc (for a prop drawn a size
// bigger than its coordinates say).
function scaled(k: Kit, u: number, v: number, z: number, sc: number): Kit {
  if (sc === 1) return k;
  const at = (a: number, b: number, c: number) => k.p(u + (a - u) * sc, v + (b - v) * sc, z + (c - z) * sc);
  return new KitClass(k.pen, at, k.s * sc, k.s);
}

// ── run: the tesla coil ─────────────────────────────────────────────────────
// A tesla coil on a hazard-striped square: a steel base, a primary of fat
// copper turns round the tall wound secondary, a chrome toroid on top; a
// grounding ball on a post and, at the front corner, a console with a big
// lever at its end, where the assistant stands (ASSISTANT, see npcs.ts).
// Running it, the lever is pulled back toward him and arcs crack off the
// toroid to the ball and the air.

const TC = { u: 4.6, v: 4.4, top: 13.2, R: 2.0, r: 0.7 };
const BALL: P3 = [9.0, 2.2, 8.2];
// The console (u0 to u1, v0 to v1, its top sloping from z0 at the back to
// z1 at the front) and its lever's pivot.
const CONSOLE = { u0: 0.3, u1: 3.7, v0: 7.7, v1: 9.7, z0: 3.45, z1: 2.9 };
const LEVER = { u: 1.2, v: 8.7, z: 3.2 };
const consoleTop = (v: number) => CONSOLE.z0 + ((CONSOLE.z1 - CONSOLE.z0) * (v - CONSOLE.v0)) / (CONSOLE.v1 - CONSOLE.v0);
// Where the assistant stands: on the floor past the console's end, the
// lever's knob a step ahead of him.
export const ASSISTANT = { u: -1.5, v: LEVER.v };

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 18,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 18, (k) => {
      // the floor: hazard stripes round a rubber square
      hazard(k, [[0.3, 0.3, 0.03], [10.7, 0.3, 0.03], [10.7, 10.7, 0.03], [0.3, 10.7, 0.03]], 0.6);
      k.poly([[1.3, 1.3, 0.05], [9.7, 1.3, 0.05], [9.7, 9.7, 0.05], [1.3, 9.7, 0.05]], '#33424a', k.thin);
      k.shadow(TC.u, TC.v, 3.2, 3.2, 0.32, 0.05);
      // the cable from the console to the base
      k.rod([[2.6, CONSOLE.v0 + 0.1, 0.12], [3.4, 7.2, 0.12], [TC.u - 0.6, TC.v + 1.6, 0.12]], '#22292c', 0.32);
      // the base
      k.box(TC.u - 2.1, TC.v - 2.1, 0.05, 4.2, 4.2, 2.0, '#4f6f78', { round: 0.15 });
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (let z = 0.5; z < 1.7; z += 0.35) {
          for (const [a, b] of [[[TC.u - 1.5, TC.v + 2.1], [TC.u + 1.5, TC.v + 2.1]], [[TC.u + 2.1, TC.v - 1.5], [TC.u + 2.1, TC.v + 1.5]]] as const) {
            const [x0, y0] = k.p(a[0], a[1], z);
            const [x1, y1] = k.p(b[0], b[1], z);
            pen.moveTo(x0, y0);
            pen.lineTo(x1, y1);
          }
        }
        pen.strokeStyle = '#2a3c42';
        pen.lineWidth = 0.1 * k.s;
        pen.stroke();
      }
      // the secondary: a tall wound column
      const zs0 = 2.05;
      const zs1 = TC.top - 0.4;
      k.cyl(TC.u, TC.v, zs0, 0.82, zs1 - zs0, '#d98e4a');
      const pen = k.pen;
      const e = k.ell(TC.u, TC.v, 0, 0.82);
      pen.beginPath();
      for (let z = zs0 + 0.25; z < zs1 - 0.1; z += 0.22) {
        const [x, y] = k.p(TC.u, TC.v, z);
        pen.moveTo(x + e.rx, y);
        pen.ellipse(x, y, e.rx, e.ry, 0, 0, Math.PI);
      }
      pen.strokeStyle = '#9a5a26a0';
      pen.lineWidth = Math.max(0.6, 0.05 * k.s);
      pen.stroke();
      // the primary: three fat copper turns on standoffs
      for (const [i, r] of [2.1, 1.75, 1.42].entries()) {
        const z = 2.25 + i * 0.12;
        const ee = k.ell(TC.u, TC.v, z, r);
        pen.beginPath();
        pen.ellipse(ee.cx, ee.cy, ee.rx, ee.ry, 0, 0, Math.PI * 2);
        pen.strokeStyle = INK;
        pen.lineWidth = 0.3 * k.s + k.lw * 1.2;
        pen.stroke();
        pen.strokeStyle = C.copper;
        pen.lineWidth = 0.3 * k.s;
        pen.stroke();
      }
      // the toroid
      toroid(k, TC.u, TC.v, TC.top, TC.R, TC.r);
      // the grounding ball on its post
      k.shadow(BALL[0], BALL[1], 1.2, 1.1, 0.28, 0.05);
      k.cyl(BALL[0], BALL[1], 0.05, 0.85, 0.35, C.iron, { line: k.thin });
      k.rod([[BALL[0], BALL[1], 0.4], [BALL[0], BALL[1], BALL[2] - 0.6]], C.steel, 0.2);
      sphere(k, BALL[0], BALL[1], BALL[2], 0.7, C.chrome);
      k.rod([[BALL[0], BALL[1] + 0.2, 0.2], [BALL[0] - 0.8, BALL[1] + 2.4, 0.1], [TC.u + 2.1, TC.v, 0.1]], '#3a7a3a', 0.14);
      // the console: a slanted desk of dials, the lever's slot
      const { u0, u1, v0, v1, z0, z1 } = CONSOLE;
      k.box(u0, v0, 0.05, u1 - u0, v1 - v0, z0 - 0.05, '#4f6f78', { stripe: false });
      k.poly([[u0, v0, z0], [u1, v0, z0], [u1, v1, z1], [u0, v1, z1]], shade('#4f6f78', 0.12), k.lw);
      gauge(k, 2.75, v1 + 0.02, 1.9, 0.55, null);
      // the lever's slot, along the console from its end
      const a = LEVER.v - 0.28;
      const b = LEVER.v + 0.28;
      k.poly([[LEVER.u - 0.85, a, consoleTop(a) - 0.04], [LEVER.u + 0.85, a, consoleTop(a) - 0.04], [LEVER.u + 0.85, b, consoleTop(b) - 0.04], [LEVER.u - 0.85, b, consoleTop(b) - 0.04]], '#1e2629', 0);
      k.face(0.5, 1.95, v1 + 0.02, 1.0, 2.5, '#20292d', k.thin, 0.1);
    });
    // the console's needle and lights, the lever up or thrown
    needle(k, 2.75, CONSOLE.v1 + 0.05, 1.9, 0.55, v.active ? 1.0 + Math.sin(v.t * 17) * 0.25 : -1.6);
    for (let i = 0; i < 3; i++) pilot(k, 0.75 + i * 0.47, CONSOLE.v1 + 0.04, 1.75, 0.13, [C.red, C.amber, C.green][i], v.active ? i === 2 || (Math.floor(v.t * 6) + i) % 3 === 0 : i === 0);
    // the lever: pushed away, or pulled back toward the assistant (-u)
    const th = v.active ? 0.72 : -0.65;
    const top: P3 = [LEVER.u - Math.sin(th) * 1.6, LEVER.v, LEVER.z + Math.cos(th) * 1.6];
    k.rod([[LEVER.u, LEVER.v, LEVER.z], top], C.chrome, 0.16);
    k.dot(top[0], top[1], top[2], Math.max(1.5, 0.32 * k.s), C.red, k.thin);
    if (!v.active) return;
    // the arcs, re-struck several times a second
    const tick = Math.floor(v.t * 12);
    const rim = (a: number): P3 => [TC.u + Math.cos(a) * (TC.R + TC.r * 0.8), TC.v + Math.sin(a) * (TC.R + TC.r * 0.8), TC.top + 0.1];
    k.halo(TC.u, TC.v, TC.top + 0.4, 4.2, C.violet, 0.5);
    const toBall = zigzag(rim(-0.55), [BALL[0] - 0.4, BALL[1], BALL[2] + 0.3], 8, 0.7, tick);
    bolt(k, toBall, 1);
    k.halo(BALL[0], BALL[1], BALL[2], 1.8, '#dfe8ff', 0.6);
    for (let j = 0; j < 2; j++) {
      const a = hash(tick, j, 5) * Math.PI * 2;
      const from = rim(a);
      const reach = 1.6 + hash(tick, j, 6) * 1.4;
      const to: P3 = [from[0] + Math.cos(a) * reach, from[1] + Math.sin(a) * reach, from[2] + 0.5 + hash(tick, j, 7) * 2.5];
      bolt(k, zigzag(from, to, 5, 0.5, tick * 7 + j), 0.75);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 14, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const at: P3 = hash(tick, 3) < 0.5 ? [BALL[0], BALL[1], BALL[2]] : [TC.u + (hash(tick, 4) - 0.5) * 4, TC.v + (hash(tick, 5) - 0.5) * 4, TC.top + 0.3];
      spawn(spark(at[0], at[1], at[2], tick, i, 7, hash(tick, 6) < 0.5 ? [214, 236, 255] : [190, 170, 255]));
    }
  },
};

// A chrome sphere of radius r centred at z.
function sphere(k: Kit, u: number, v: number, z: number, r: number, base: Color): void {
  const [x, y] = k.p(u, v, z);
  const rx = Math.SQRT2 * r * k.s;
  const ry = Math.sqrt(1.5) * r * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - rx * 0.35, y - ry * 0.4, 0, x, y, rx * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.35, base);
  g.addColorStop(1, shade(base, -0.45));
  k.paint(g, k.lw);
}

// A toroid lying level at z: R round its ring, r its tube.
function toroid(k: Kit, u: number, v: number, z: number, R: number, r: number): void {
  const pen = k.pen;
  const out = k.ell(u, v, z, R + r);
  const inn = k.ell(u, v, z + r * 0.55, Math.max(0.1, R - r * 0.9));
  const H = r * k.s;
  // the silhouette: the top ellipse's back, down the sides, the bottom's front
  pen.beginPath();
  pen.ellipse(out.cx, out.cy - H * 0.55, out.rx, out.ry, 0, Math.PI, Math.PI * 2);
  pen.ellipse(out.cx, out.cy + H * 0.45, out.rx, out.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(out.cx - out.rx, 0, out.cx + out.rx, 0);
  g.addColorStop(0, '#e9f1f4');
  g.addColorStop(0.3, '#ffffff');
  g.addColorStop(0.65, '#b9c6cb');
  g.addColorStop(1, '#6f7e86');
  k.paint(g, k.lw);
  // a lit crown along the top
  pen.beginPath();
  pen.ellipse(out.cx, out.cy - H * 0.55, out.rx * 0.98, out.ry * 0.98, 0, 0, Math.PI * 2);
  pen.fillStyle = '#eef5f7';
  pen.fill();
  // the hole, and its inner wall in shade
  pen.beginPath();
  pen.ellipse(inn.cx, inn.cy, inn.rx, inn.ry, 0, 0, Math.PI * 2);
  k.paint('#5d6c74', k.thin);
  pen.beginPath();
  pen.ellipse(inn.cx, inn.cy, inn.rx, inn.ry, 0, Math.PI, Math.PI * 2);
  pen.ellipse(inn.cx, inn.cy + inn.ry * 0.5, inn.rx * 0.92, inn.ry * 0.7, 0, Math.PI * 2, Math.PI, true);
  pen.closePath();
  pen.fillStyle = '#3a454b';
  pen.fill();
  // a highlight on the front of the tube
  pen.beginPath();
  pen.ellipse(out.cx, out.cy - H * 0.05, out.rx * 0.85, out.ry * 0.85, 0, Math.PI * 0.62, Math.PI * 0.92);
  pen.strokeStyle = '#ffffffc0';
  pen.lineWidth = Math.max(0.8, 0.14 * k.s);
  pen.stroke();
  pen.beginPath();
  pen.ellipse(out.cx, out.cy - H * 0.55, out.rx, out.ry, 0, 0, Math.PI);
  pen.strokeStyle = withAlpha(INK, 0.35);
  pen.lineWidth = k.thin * 0.7;
  pen.stroke();
}

// ── web: the radio rig ──────────────────────────────────────────────────────
// A steel desk with a big shortwave receiver (a tuning dial, VU meters,
// knobs), an oscilloscope on it, a desk microphone and headphones; behind,
// a lattice mast with a little dish and a red beacon. Browsing sweeps the
// tuning needle, runs a wave across the scope, kicks the meters and
// blinks the beacon, sending signal out from the dish.

const SCOPE = { u: 6.9, v: 3.32, z: 9.0, r: 0.95 };
const DIAL = quad(1.6, 4.0, 3.42, 8.9, 9.8);
const MAST = { u: 1.4, v: 1.2, top: 18.2 };
const DISH: P3 = [MAST.u + 0.4, MAST.v + 0.5, MAST.top - 1.2];
const DISH_N: P3 = [0.62, -0.12, 0.78]; // where the dish points: up, and along the wall

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const zt = 6.2;
    const k = still(v, 'web', 20, (k) => {
      k.shadow(4.6, 4.2, 4.8, 4.4, 0.3);
      // the mast: two rails with a zigzag lattice, guyed to the desk
      mast(k);
      // the desk
      for (const [u, w] of [[0.9, 0.9], [7.6, 0.9], [0.9, 4.3], [7.6, 4.3]] as const) k.box(u, w, 0, 0.5, 0.5, zt - 0.35, C.steelDark, { line: k.thin });
      k.box(5.4, 0.9, 0.6, 2.7, 3.9, 3.6, C.steel, { stripe: false });
      for (const z of [1.4, 2.8]) k.rod([[6.2, 4.85, z], [7.3, 4.85, z]], C.chrome, 0.12);
      k.box(0.6, 0.6, zt - 0.35, 7.9, 4.5, 0.4, '#8fa6ab');
      // the receiver: a big box of dials
      const R0 = '#4a5a4f';
      k.box(1.1, 1.1, zt + 0.05, 4.6, 2.3, 3.9, R0, { round: 0.12 });
      k.face(1.4, 4.2, 3.41, zt + 2.55, zt + 3.75, '#1f2a24', k.thin, 0.1);
      k.poly([...DIAL], k.vgrad(2.8, 3.42, DIAL[0][2], DIAL[3][2], [[0, '#f2e2a8'], [1, '#ffeec0']]), k.thin * 0.8);
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (let i = 0; i <= 16; i++) {
          const [x0, y0] = k.p(DIAL[0][0] + 0.1 + i * 0.14, 3.43, DIAL[0][2] + 0.1);
          const [x1, y1] = k.p(DIAL[0][0] + 0.1 + i * 0.14, 3.43, DIAL[0][2] + (i % 4 ? 0.3 : 0.5));
          pen.moveTo(x0, y0);
          pen.lineTo(x1, y1);
        }
        pen.strokeStyle = '#6a5a3a';
        pen.lineWidth = 0.05 * k.s;
        pen.stroke();
      }
      for (const [du, r] of [[1.9, 0.45], [3.1, 0.45], [4.3, 0.6]] as const) {
        fillPts(k, ring(k, [du, 3.42, zt + 1.15], [0, 1, 0], r, 16), C.iron, k.thin);
        fillPts(k, ring(k, [du, 3.44, zt + 1.15], [0, 1, 0], r * 0.55, 12), '#6a7a70', 0);
      }
      // VU meter windows (needles live)
      for (const du of [4.6, 5.2]) k.face(du - 0.25, du + 0.25, 3.41, zt + 2.6, zt + 3.4, '#f6efd2', k.thin * 0.7);
      // the oscilloscope: a squat box, a round screen (trace live)
      k.box(5.8, 1.2, zt + 0.05, 2.2, 2.1, 2.9, '#c9cfc4', { round: 0.15 });
      fillPts(k, ring(k, [SCOPE.u, SCOPE.v + 0.0, SCOPE.z], [0, 1, 0], SCOPE.r + 0.15, 22), '#2d363b', k.thin);
      for (const du of [6.4, 7.4]) k.dot(du, 3.32, zt + 0.55, Math.max(1, 0.14 * k.s), C.iron);
      // the desk mic and the headphones
      k.disc(3.6, 4.3, zt + 0.06, 0.5, C.iron, k.thin);
      k.rod([[3.6, 4.3, zt + 0.1], [3.7, 4.2, zt + 1.4]], C.chrome, 0.1);
      k.pen.beginPath();
      const [mx, my] = k.p(3.7, 4.2, zt + 1.75);
      k.pen.ellipse(mx, my, 0.3 * k.s, 0.42 * k.s, 0, 0, Math.PI * 2);
      k.paint(C.chrome, k.thin);
      k.rod([[1.4, 4.2, zt + 0.15], [1.5, 4.3, zt + 0.7], [2.5, 4.4, zt + 0.7], [2.6, 4.3, zt + 0.15]], C.iron, 0.12);
      for (const du of [1.4, 2.6]) k.cyl(du, 4.25, zt + 0.05, 0.38, 0.25, '#2a3034', { line: k.thin });
      // the cable from the mast down into the receiver
      k.rod([[MAST.u + 0.3, MAST.v + 0.3, zt + 4.5], [1.4, 1.2, zt + 4.2], [1.6, 1.4, zt + 3.9]], '#22292c', 0.14);
      // a stool for the operator
      stool(k, 4.6, 7.0, 4.4, '#2f3a40');
    });
    const t = v.t;
    const on = v.active;
    // the tuning needle
    const f = on ? 0.5 + Math.sin(t * 0.9) * 0.35 + Math.sin(t * 3.3) * 0.05 : 0.38;
    const nu = DIAL[0][0] + 0.15 + f * (DIAL[1][0] - DIAL[0][0] - 0.3);
    k.line([[nu, 3.45, DIAL[0][2] + 0.05], [nu, 3.45, DIAL[3][2] - 0.05]], C.red, Math.max(0.8, 0.09 * k.s));
    // VU needles
    for (const [i, du] of [4.6, 5.2].entries()) {
      const a = on ? -0.6 + Math.abs(Math.sin(t * (5 + i * 2.3) + i)) * 1.2 : -0.6;
      k.line([[du, 3.44, 6.2 + 2.65], [du + Math.sin(a) * 0.4, 3.44, 6.2 + 2.65 + Math.cos(a) * 0.55]], INK, Math.max(0.6, 0.06 * k.s));
    }
    // the scope's screen and trace
    fillPts(k, ring(k, [SCOPE.u, SCOPE.v + 0.02, SCOPE.z], [0, 1, 0], SCOPE.r, 22), on ? '#0e3a26' : '#14261f', 0);
    const pts: P3[] = [];
    for (let i = 0; i <= 16; i++) {
      const fx = i / 16;
      const du = (fx - 0.5) * SCOPE.r * 1.6;
      const amp = on ? Math.sin(fx * 12 + t * 9) * 0.35 * Math.sin(fx * Math.PI) + Math.sin(fx * 31 - t * 17) * 0.08 : 0;
      pts.push([SCOPE.u + du, SCOPE.v + 0.04, SCOPE.z + amp]);
    }
    k.line(pts, on ? '#8cffb8' : '#3f6a52', Math.max(0.8, 0.1 * k.s));
    // the beacon on the mast
    const blink = on && (t * 2) % 1 < 0.5;
    k.dot(MAST.u, MAST.v, MAST.top + 0.35, Math.max(1.5, 0.3 * k.s), blink ? '#ff5a4a' : '#8a2a2a', k.thin);
    if (!on) return;
    if (blink) k.halo(MAST.u, MAST.v, MAST.top + 0.35, 2.2, '#ff5a4a', 0.6);
    k.halo(SCOPE.u, SCOPE.v + 0.3, SCOPE.z, 1.8, '#8cffb8', 0.3);
    // rings of signal off the dish
    for (let j = 0; j < 2; j++) {
      const ph = (t * 0.8 + j * 0.5) % 1;
      const d = 1.2 + ph * 2.4;
      const c: P3 = [DISH[0] + DISH_N[0] * d, DISH[1] + DISH_N[1] * d, DISH[2] + DISH_N[2] * d];
      const pts2 = ring(k, c, DISH_N, 0.5 + ph * 1.0, 20);
      k.pen.beginPath();
      pts2.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
      k.pen.closePath();
      k.pen.strokeStyle = withAlpha('#9cffe0', 0.85 * (1 - ph));
      k.pen.lineWidth = Math.max(0.9, 0.12 * k.s);
      k.pen.stroke();
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: DISH[0] + DISH_N[0] * 1.5 + j(1), y: DISH[1] + DISH_N[1] * 1.5 + j(2), z: DISH[2] + DISH_N[2] * 1.5, vx: DISH_N[0] * 2 + j(3) * 0.6, vy: DISH_N[1] * 2 + j(4) * 0.6, vz: DISH_N[2] * 2 + j(5) * 0.5, life: 1.4, color: [150, 255, 220], glow: true, gravity: -0.2 });
    }
  },
};

// The lattice mast, its dish and the beacon's housing.
function mast(k: Kit): void {
  const { u, v, top } = MAST;
  const a: P3 = [u - 0.35, v, 0];
  const b: P3 = [u + 0.35, v, 0];
  k.rod([a, [u - 0.12, v, top]], C.steelDark, 0.14);
  k.rod([b, [u + 0.12, v, top]], C.steelDark, 0.14);
  const pts: P3[] = [];
  for (let z = 0.2, i = 0; z < top - 0.3; z += 0.9, i++) {
    const w = 0.35 - (z / top) * 0.23;
    pts.push([u + (i & 1 ? w : -w), v, z]);
  }
  k.line(pts, C.steelDark, Math.max(0.8, 0.08 * k.s));
  // the dish, tipped up and out toward the room: a shallow bowl, its
  // rim lit, the hollow shaded, a feed on three struts over it
  const N = DISH_N;
  const rim = ring(k, DISH, N, 1.25, 28);
  fillPts(k, rim, '#e9eff0', k.lw);
  const [hx, hy] = k.p(DISH[0] + 0.1, DISH[1] + 0.1, DISH[2] - 0.05);
  const g = k.pen.createRadialGradient(hx + 0.3 * k.s, hy - 0.4 * k.s, 0, hx, hy, 1.4 * k.s);
  g.addColorStop(0, '#f6fafa');
  g.addColorStop(0.7, '#b9c6cb');
  g.addColorStop(1, '#8a9aa0');
  fillPts(k, ring(k, [DISH[0] + 0.05, DISH[1] + 0.05, DISH[2] + 0.02], N, 1.05, 24), g, 0);
  const feed: P3 = [DISH[0] + N[0] * 1.1, DISH[1] + N[1] * 1.1, DISH[2] + N[2] * 1.1];
  for (const i of [0, 9, 18]) {
    const [x, y] = rim[i];
    const [fx, fy] = k.p(...feed);
    k.pen.beginPath();
    k.pen.moveTo(x, y);
    k.pen.lineTo(fx, fy);
    k.pen.strokeStyle = C.steelDark;
    k.pen.lineWidth = Math.max(0.7, 0.07 * k.s);
    k.pen.stroke();
  }
  k.dot(feed[0], feed[1], feed[2], Math.max(1.2, 0.18 * k.s), C.iron, k.thin * 0.6);
  k.rod([[u, v, DISH[2] - 0.4], [DISH[0] - 0.2, DISH[1] - 0.2, DISH[2] - 0.2]], C.steelDark, 0.12);
  k.cyl(u, v, top - 0.1, 0.32, 0.25, C.iron, { line: k.thin });
}

// ── think: the rolling chalkboard ───────────────────────────────────────────
// A big double-sided chalkboard on an oak frame with castors, rolled out to
// the front of its floor, crammed with working: rows of formulae, a boxed
// result, a graph, an atom and arrows; chalk and an eraser on the tray.
// Behind it a model atom on a stand. Its professor stands out on the floor
// before its near end with a pointer (see npcs.ts); worked, the atom spins
// and glows.

const BOARD = { u0: 0.9, u1: 9.9, v: 4.8, z0: 4.4, z1: 13.4 };
const ATOM: P3 = [11.0, 1.7, 7.4];

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, v: bv, z0, z1 } = BOARD;
    const k = still(v, 'think', 16, (k) => {
      k.shadow(5.6, bv, 6.2, 2.4, 0.28);
      // the far legs (behind the board)
      for (const u of [u0 - 0.35, u1 + 0.35]) k.rod([[u, bv - 0.15, z1 + 0.4], [u, bv - 1.8, 0.5]], C.woodDark, 0.32);
      // the board in its frame
      k.box(u0 - 0.5, bv - 0.18, z0 - 0.5, u1 - u0 + 1.0, 0.36, z1 - z0 + 1.0, C.wood, { stripe: false });
      const F = bv + 0.2;
      k.poly([[u0, F, z0], [u1, F, z0], [u1, F, z1], [u0, F, z1]], k.vgrad(u0, F, z0, z1, [[0, '#2f5246'], [1, '#26443a']]), k.thin);
      // smudges of old rubbed-out working
      k.poly([[u0 + 0.4, F + 0.01, z0 + 4.8], [u0 + 4.2, F + 0.01, z0 + 5.2], [u0 + 4.0, F + 0.01, z0 + 6.4], [u0 + 0.6, F + 0.01, z0 + 6.0]], '#ffffff10', 0, 0.6);
      chalkWork(k, F + 0.02, v.seed);
      const row: P3[] = [];
      for (let u = u0 + 0.6; u <= u0 + 5.2; u += 0.12) row.push([u, F + 0.02, z0 + 0.9 + Math.sin(u * 7.3) * 0.16 + Math.sin(u * 2.1) * 0.06]);
      k.line(row, C.chalk, Math.max(0.8, 0.11 * k.s));
      // the tray, the chalk and the eraser
      k.box(u0 - 0.2, bv + 0.18, z0 - 0.45, u1 - u0 + 0.4, 0.7, 0.25, C.wood, { line: k.thin });
      for (const [du, c] of [[1.4, C.chalk], [1.9, '#f6e08a'], [6.4, '#f2a7b8']] as const) k.rod([[u0 + du, bv + 0.55, z0 - 0.12], [u0 + du + 0.6, bv + 0.6, z0 - 0.12]], c, 0.12);
      k.box(u0 + 3.0, bv + 0.25, z0 - 0.2, 1.4, 0.5, 0.4, '#3a3f45', { line: k.thin });
      k.box(u0 + 3.0, bv + 0.25, z0 - 0.2, 1.4, 0.5, 0.15, '#c9b78a', { line: 0, stripe: false });
      // the near legs and the castors
      for (const u of [u0 - 0.35, u1 + 0.35]) {
        k.rod([[u, bv + 0.15, z1 + 0.4], [u, bv + 1.9, 0.5]], C.wood, 0.32);
        k.rod([[u, bv - 1.8, 0.5], [u, bv + 1.9, 0.5]], C.woodDark, 0.22);
        for (const w of [bv - 1.8, bv + 1.9]) {
          k.dot(u, w, 0.25, Math.max(1.2, 0.26 * k.s), C.iron);
        }
      }
      // the atom's stand
      k.shadow(ATOM[0], ATOM[1], 1.2, 1.0, 0.25);
      k.cyl(ATOM[0], ATOM[1], 0, 0.75, 0.3, C.woodDark, { line: k.thin });
      k.rod([[ATOM[0], ATOM[1], 0.3], [ATOM[0], ATOM[1], ATOM[2] - 0.5]], C.brass, 0.12);
    });
    // the atom: a nucleus, three rings, electrons running round them
    const t = v.active ? v.t : 0.8;
    const rings: P3[] = [[0.2, 0.3, 1], [0.9, -0.3, 0.45], [-0.5, 0.9, 0.35]];
    const R = 1.05;
    for (const [i, n] of rings.entries()) {
      const pr = ring(k, ATOM, n, R, 28);
      k.pen.beginPath();
      pr.forEach(([x, y], j) => (j ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
      k.pen.closePath();
      k.pen.strokeStyle = INK;
      k.pen.lineWidth = Math.max(1.2, 0.1 * k.s + k.thin);
      k.pen.stroke();
      k.pen.strokeStyle = '#c9b0ff';
      k.pen.lineWidth = Math.max(0.6, 0.08 * k.s);
      k.pen.stroke();
      const j = Math.floor((((t * (1.2 + i * 0.4) + i * 0.33) % 1) + 1) % 1 * pr.length);
      const [ex, ey] = pr[j];
      k.pen.beginPath();
      k.pen.arc(ex, ey, Math.max(1.2, 0.2 * k.s), 0, Math.PI * 2);
      k.paint('#7fe0ff', k.thin * 0.7);
    }
    for (const [du, dz, c] of [[-0.12, 0.08, C.red], [0.12, 0.1, '#5fa8ff'], [0, -0.1, C.red], [0.05, 0.22, '#5fa8ff']] as const) {
      k.dot(ATOM[0] + du, ATOM[1], ATOM[2] + dz, Math.max(1, 0.19 * k.s), c, k.thin * 0.6);
    }
    if (v.active) k.halo(ATOM[0], ATOM[1], ATOM[2], 2.2, '#b9a8ff', 0.35);
  },
};

// The working on the board: rows of formula scrawl, a boxed answer, a
// little graph, an atom sketch, arrows, underlines.
function chalkWork(k: Kit, n: number, seed: number): void {
  const { u0, u1, z0, z1 } = BOARD;
  const cw = Math.max(0.8, 0.09 * k.s);
  const chalk = '#e8ecdf';
  // rows down the left two thirds
  for (let r = 0; r < 7; r++) {
    const z = z1 - 0.9 - r * 1.05;
    const indent = hash(seed, r, 1) < 0.3 ? 0.6 : 0;
    const end = u0 + 4.2 + hash(seed, r, 2) * 1.6;
    if (z < z0 + 1.8) break;
    scrawl(k, u0 + 0.4 + indent, end, n, z, 0.32, seed + r * 11, chalk, cw);
  }
  // an equals sign and a boxed result
  const bu = u0 + 3.6;
  const bz = z0 + 2.4;
  k.line([[bu - 0.9, n, bz + 0.25], [bu - 0.4, n, bz + 0.25]], chalk, cw);
  k.line([[bu - 0.9, n, bz - 0.05], [bu - 0.4, n, bz - 0.05]], chalk, cw);
  scrawl(k, bu - 0.1, bu + 1.6, n, bz + 0.1, 0.3, seed + 99, '#f6e08a', cw);
  k.line([[bu - 0.3, n, bz - 0.45], [bu + 1.9, n, bz - 0.45], [bu + 1.9, n, bz + 0.7], [bu - 0.3, n, bz + 0.7], [bu - 0.3, n, bz - 0.45]], '#f6e08a', cw);
  // the graph: axes and a rising curve
  const gu = u0 + 6.2;
  const gz = z1 - 4.2;
  k.line([[gu, n, gz + 3.0], [gu, n, gz], [gu + 2.9, n, gz]], chalk, cw);
  const curve: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const f = i / 12;
    curve.push([gu + 0.15 + f * 2.6, n, gz + 0.2 + f * f * 2.5]);
  }
  k.line(curve, '#f2a7b8', cw);
  // an atom sketch under it
  const au = u0 + 7.4;
  const az = z0 + 2.2;
  for (const rot of [0, 1.05, -1.05]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      const x = Math.cos(a) * 1.2;
      const y = Math.sin(a) * 0.42;
      pts.push([au + x * Math.cos(rot) - y * Math.sin(rot), n, az + x * Math.sin(rot) + y * Math.cos(rot)]);
    }
    k.line(pts, chalk, cw);
  }
  k.dot(au, n, az, Math.max(1, 0.14 * k.s), chalk);
  // an arrow from the working to the graph, underlines
  k.line([[u0 + 5.2, n, z1 - 2.2], [u0 + 5.9, n, z1 - 2.0], [gu - 0.2, n, gz + 1.6]], '#9fd6ff', cw);
  k.line([[gu - 0.55, n, gz + 1.85], [gu - 0.2, n, gz + 1.6], [gu - 0.5, n, gz + 1.35]], '#9fd6ff', cw);
  k.line([[u0 + 0.4, n, z1 - 1.35], [u0 + 3.4, n, z1 - 1.4]], '#f6e08a', cw);
}

// ── idle: the break corner ──────────────────────────────────────────────────
// A battered orange vinyl sofa with cushions and a lab coat flung over it,
// a crate for a coffee table (coffee brewing in a beaker on a hot plate,
// mugs, a box of doughnuts), a little fridge with a lava lamp on it and the
// rat's wheel cage. Where tired agents flop.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.2, 3.6, 7.6, 3.4, 0.3);
    // the sofa
    const R = C.sofa;
    for (const [u, w] of [[1.4, 1.0], [11.7, 1.0], [1.4, 5.0], [11.7, 5.0]] as const) k.box(u, w, 0, 0.45, 0.45, 0.7, C.steelDark, { line: k.thin });
    k.box(1.0, 0.8, 0.6, 11.6, 4.8, 2.0, R, { round: 0.4 });
    k.box(1.0, 0.5, 2.6, 11.6, 1.5, 3.8, R, { round: 0.7 });
    for (let i = 0; i < 3; i++) k.box(2.3 + i * 3.0, 1.95, 2.6, 3.0, 3.4, 0.8, shade(R, 0.06), { round: 0.35 });
    k.box(1.0, 0.8, 2.6, 1.3, 4.6, 2.2, R, { round: 0.6 });
    k.box(11.3, 0.8, 2.6, 1.3, 4.6, 2.2, R, { round: 0.6 });
    // a split in the vinyl, taped over
    k.poly([[6.2, 3.6, 3.42], [7.4, 4.2, 3.42], [7.2, 4.5, 3.42], [6.0, 3.9, 3.42]], '#c9c2a8', k.thin * 0.7);
    // cushions; a lab coat thrown over the left arm
    k.poly([[2.6, 2.1, 3.4], [4.6, 2.1, 3.4], [4.4, 2.35, 5.4], [2.8, 2.35, 5.4]], C.teal, k.lw, 0.5);
    k.poly([[8.9, 2.1, 3.4], [10.9, 2.1, 3.4], [10.7, 2.35, 5.3], [9.1, 2.35, 5.3]], '#f2c230', k.lw, 0.5);
    k.dot(9.9, 2.36, 4.35, Math.max(1.5, 0.35 * k.s), C.hazardInk);
    const coat = '#f4f6f4';
    k.poly([[0.9, 2.6, 4.9], [2.4, 2.6, 4.9], [2.4, 5.7, 4.75], [0.9, 5.7, 4.75]], shade(coat, 0.05), k.lw, 0.15);
    k.poly([[0.9, 5.7, 4.75], [2.4, 5.7, 4.75], [2.55, 5.85, 0.9], [0.75, 5.85, 1.1]], k.side(coat, 0, 1), k.lw, 0.15);
    k.line([[1.65, 5.88, 4.6], [1.6, 5.9, 1.2]], '#c9d2d0', k.thin);
    k.face(1.75, 2.3, 5.9, 2.4, 3.1, shade(coat, -0.08), k.thin * 0.7);
    k.rod([[2.0, 5.95, 3.1], [2.02, 5.97, 3.6]], '#2f6fb0', 0.08);
    k.rod([[0.8, 4.2, 4.6], [0.55, 4.6, 3.2], [0.5, 4.9, 1.6]], coat, 0.42);
    // the fridge and its lava lamp, past the sofa's end
    k.shadow(13.9, 2.0, 1.4, 1.3, 0.24);
    k.box(12.9, 0.8, 0, 2.0, 2.2, 4.4, '#e9eeec', { round: 0.2 });
    k.line([[12.9, 3.02, 3.0], [14.9, 3.02, 3.0]], '#a9b6b4', k.thin);
    k.rod([[14.5, 3.1, 3.4], [14.5, 3.1, 4.0]], C.chrome, 0.12);
    k.rod([[14.5, 3.1, 1.2], [14.5, 3.1, 2.4]], C.chrome, 0.12);
    k.poly([[13.2, 3.02, 1.6], [13.8, 3.02, 2.2], [13.2, 3.02, 2.8]], C.hazard, k.thin * 0.7);
    k.cyl(13.9, 1.9, 4.4, 0.42, 0.45, '#5a6a72', { line: k.thin });
    k.glass(13.9, 1.9, [[4.85, 0.38], [5.6, 0.48], [6.6, 0.28], [6.75, 0.22]], '#e05ac8', 0.85);
    for (const [dz, r] of [[5.4, 0.22], [6.0, 0.14], [5.0, 0.12]] as const) k.dot(13.9 - 0.05, 2.0, dz, Math.max(1, r * k.s), '#ffb04a');
    k.cyl(13.9, 1.9, 6.7, 0.24, 0.3, '#5a6a72', { line: k.thin });
    k.halo(13.9, 1.9, 5.8, 3.0, '#ff7ad0', 0.4);
    // the crate table: coffee brewing, mugs, doughnuts
    k.shadow(6.8, 8.3, 3.8, 1.9, 0.25);
    crate(k, 3.8, 7.0, 0, 6.2, 2.6, 2.3, C.wood, true);
    const zt = 2.3;
    k.box(4.2, 7.4, zt, 1.6, 1.5, 0.4, '#e9eeec', { line: k.thin });
    const e = k.ell(5.0, 8.15, zt + 0.42, 0.55);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    k.pen.strokeStyle = '#ff6a3a';
    k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
    k.pen.stroke();
    k.halo(5.0, 8.15, zt + 0.45, 1.4, '#ff7a4a', 0.4);
    beaker(k, 5.0, 8.15, zt + 0.42, 0.62, 1.6, '#6a3b22', 0.65);
    for (const [u, w, c] of [[6.4, 8.9, '#f2f6f4'], [7.2, 7.8, C.teal]] as const) {
      k.cyl(u, w, zt, 0.42, 0.75, c, { line: k.lw });
      k.disc(u, w, zt + 0.7, 0.32, '#6a3b22', 0);
      k.rod([[u + 0.45, w, zt + 0.55], [u + 0.72, w, zt + 0.4], [u + 0.45, w, zt + 0.2]], c, 0.1);
    }
    // the doughnut box, open
    k.box(7.9, 7.3, zt, 2.0, 1.7, 0.35, '#f2e3c6', { line: k.thin });
    k.poly([[7.9, 7.3, zt + 0.35], [9.9, 7.3, zt + 0.35], [9.9, 7.0, zt + 1.6], [7.9, 7.0, zt + 1.6]], '#efdcb6', k.thin);
    for (const [du, dv, c] of [[0.5, 0.45, '#f2a7b8'], [1.4, 0.45, '#6a3b22'], [0.5, 1.2, '#f6e08a'], [1.4, 1.2, '#f2a7b8']] as const) {
      k.disc(7.9 + du, 7.3 + dv, zt + 0.4, 0.38, '#d9944a', k.thin * 0.7);
      k.disc(7.9 + du, 7.3 + dv, zt + 0.46, 0.3, c, 0);
      k.disc(7.9 + du, 7.3 + dv, zt + 0.48, 0.1, '#d9944a', 0);
    }
    // the rat's cage with its wheel
    ratCage(k, 13.4, 8.2);
  },
};

// A wire cage on a tray with a running wheel, a water bottle and a little
// house; the rat itself is out roaming.
function ratCage(k: Kit, cu: number, cv: number): void {
  const w = 2.6;
  const d = 2.2;
  const h = 2.3;
  const u0 = cu - w / 2;
  const v0 = cv - d / 2;
  k.shadow(cu, cv, w * 0.7, d * 0.7, 0.24);
  k.box(u0, v0, 0, w, d, 0.4, '#3aa597', { line: k.lw });
  k.disc(cu, cv, 0.42, 0.9, '#e8d9a8', 0);
  // the house and the wheel inside
  k.box(u0 + 0.2, v0 + 0.2, 0.4, 0.9, 0.8, 0.7, '#f2c230', { line: k.thin });
  const wheel = ring(k, [cu + 0.4, cv - 0.2, 1.3], [1, -1, 0], 0.75, 18);
  fillPts(k, wheel, '#bfe8f0', k.thin);
  k.pen.beginPath();
  const [wx, wy] = k.p(cu + 0.4, cv - 0.2, 1.3);
  for (let i = 0; i < 6; i++) {
    const [x, y] = wheel[i * 3];
    k.pen.moveTo(wx, wy);
    k.pen.lineTo(x, y);
  }
  k.pen.strokeStyle = '#7a9aa2';
  k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
  k.pen.stroke();
  // the bars: verticals round the sides, a top frame
  const pen = k.pen;
  pen.beginPath();
  const bars = (a: P3, b: P3, n: number) => {
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const p: P3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 0.4];
      const [x0, y0] = k.p(p[0], p[1], 0.4);
      const [x1, y1] = k.p(p[0], p[1], h);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  };
  bars([u0, v0 + d, 0], [u0 + w, v0 + d, 0], 10);
  bars([u0 + w, v0, 0], [u0 + w, v0 + d, 0], 8);
  pen.strokeStyle = '#9fb0b4';
  pen.lineWidth = Math.max(0.6, 0.05 * k.s);
  pen.stroke();
  k.poly([[u0, v0, h], [u0 + w, v0, h], [u0 + w, v0 + d, h], [u0, v0 + d, h]], '#9fb0b420', k.thin);
  k.cyl(u0 + w - 0.4, v0 + d + 0.05, 1.0, 0.18, 1.0, '#bfe8f0', { line: k.thin * 0.8 });
}

// ── entrance: the lab door ──────────────────────────────────────────────────
// A heavy steel door with a porthole in a hazard-striped frame, the cyan
// decontamination corridor beyond, a keypad and a warning beacon over it;
// lab coats and goggles on hooks to one side, the safety shower with its
// floor grate on the other. It swings open while someone comes or goes,
// the beacon turning and mist rolling out.

const DOOR = { u0: 3.8, u1: 9.6, h: 14.5, hv: 0.35 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 21, (k) => {
      // the corridor beyond: cyan light, a grated floor, a far door
      const out = -0.6;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]], k.vgrad(u0, out, 0, h, [[0, '#2f8f8c'], [0.5, '#5fd6cf'], [1, '#2a6f72']]), 0);
      k.poly([[u0 + 1.4, out, 0], [u1 - 1.4, out, 0], [u1 - 1.4, out, h - 3.5], [u0 + 1.4, out, h - 3.5]], '#3fb0aa', 0);
      k.poly([[u0 + 1.6, out, 0], [u1 - 1.6, out, 0], [u1 - 1.6, out, h - 3.8], [u0 + 1.6, out, h - 3.8]], '#2a8a86', 0);
      k.halo((u0 + u1) / 2, out, h - 1.5, 3.5, '#bffff8', 0.5);
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, 1.2], [u0, out, 1.4]], '#1f5a5c', 0);
      const pen = k.pen;
      pen.beginPath();
      for (let u = u0 + 0.4; u < u1; u += 0.6) {
        const [x0, y0] = k.p(u, out, 0.1);
        const [x1, y1] = k.p(u, out, 1.25);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#123e40';
      pen.lineWidth = Math.max(0.6, 0.08 * k.s);
      pen.stroke();
      // the reveal, then the hazard-striped frame
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#8fa6ab', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#5a6c70', 0);
      const jamb = (a: number) => {
        k.box(a, 0, 0, 1.1, 0.6, h + 1.2, '#6f8a90', { stripe: false });
        hazard(k, [[a, 0.62, 0.2], [a + 1.1, 0.62, 0.2], [a + 1.1, 0.62, h + 1.0], [a, 0.62, h + 1.0]], 0.45, 0);
      };
      jamb(u0 - 1.1);
      jamb(u1);
      k.box(u0 - 1.4, 0, h, u1 - u0 + 2.8, 0.7, 1.4, '#6f8a90', { stripe: false });
      hazard(k, [[u0 - 1.4, 0.72, h + 0.2], [u1 + 1.4, 0.72, h + 0.2], [u1 + 1.4, 0.72, h + 1.2], [u0 - 1.4, 0.72, h + 1.2]], 0.45);
      // the beacon's base over the door
      const bu = (u0 + u1) / 2;
      k.box(bu - 0.7, 0, h + 1.4, 1.4, 0.9, 0.35, C.iron, { line: k.thin });
      // the keypad on the right jamb's wall side
      k.box(u1 + 1.4, 0, 6.2, 1.2, 0.35, 1.8, '#d9e2e0', { line: k.lw, round: 0.1 });
      if (k.fine) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.dot(u1 + 1.65 + c * 0.35, 0.37, 6.55 + r * 0.35, Math.max(0.8, 0.1 * k.s), '#5a6c70');
      k.face(u1 + 1.55, u1 + 2.45, 0.37, 7.65, 7.85, '#1f2a24', 0);
      // the threshold plate and a grated mat
      k.poly([[u0, 0, 0.03], [u1, 0, 0.03], [u1, 0.5, 0.03], [u0, 0.5, 0.03]], C.steel, k.thin);
      k.shadow((u0 + u1) / 2, 2.2, 3.2, 1.6, 0.12);
      k.poly([[u0 + 0.3, 0.8, 0.05], [u1 - 0.3, 0.8, 0.05], [u1 - 0.3, 3.6, 0.05], [u0 + 0.3, 3.6, 0.05]], '#46565c', k.thin, 0.2);
      pen.beginPath();
      for (let u = u0 + 0.7; u < u1 - 0.4; u += 0.5) {
        const [x0, y0] = k.p(u, 1.0, 0.06);
        const [x1, y1] = k.p(u, 3.4, 0.06);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#2f3b40';
      pen.lineWidth = Math.max(0.6, 0.1 * k.s);
      pen.stroke();
      // left: hooks with two lab coats and goggles
      k.box(0.3, 0, 11.4, 2.8, 0.35, 0.5, C.wood, { line: k.thin });
      for (const u of [0.8, 1.9, 2.8]) k.rod([[u, 0.35, 11.6], [u, 0.7, 11.5], [u, 0.8, 11.8]], C.steelDark, 0.1);
      labCoat(k, 0.8, 11.5, '#f4f6f4');
      labCoat(k, 1.9, 11.4, '#e8f1ef');
      fillPts(k, ring(k, [2.6, 0.82, 10.9], [0, 1, 0], 0.3, 12), '#bfe8f0', k.thin);
      fillPts(k, ring(k, [3.05, 0.82, 10.9], [0, 1, 0], 0.3, 12), '#bfe8f0', k.thin);
      k.line([[2.8, 0.8, 11.6], [2.45, 0.82, 11.0]], '#3a4449', Math.max(0.7, 0.07 * k.s));
      // right: the safety shower and its grate
      const su = 13.2;
      k.shadow(su - 0.4, 2.0, 1.8, 1.4, 0.2);
      k.poly([[su - 1.6, 0.8, 0.05], [su + 0.8, 0.8, 0.05], [su + 0.8, 3.4, 0.05], [su - 1.6, 3.4, 0.05]], '#8fa6ab', k.thin);
      pen.beginPath();
      for (let i = 1; i < 6; i++) {
        const [a, b] = [k.p(su - 1.6 + i * 0.4, 0.8, 0.06), k.p(su - 1.6 + i * 0.4, 3.4, 0.06)];
        pen.moveTo(a[0], a[1]);
        pen.lineTo(b[0], b[1]);
        const [c, d] = [k.p(su - 1.6, 0.8 + i * 0.43, 0.06), k.p(su + 0.8, 0.8 + i * 0.43, 0.06)];
        pen.moveTo(c[0], c[1]);
        pen.lineTo(d[0], d[1]);
      }
      pen.strokeStyle = '#4f6268';
      pen.lineWidth = Math.max(0.6, 0.08 * k.s);
      pen.stroke();
      const green = '#3fae5a';
      k.rod([[su + 0.9, 0.35, 0], [su + 0.9, 0.35, 16.2], [su + 0.9, 1.2, 16.2], [su - 0.4, 2.0, 16.0]], green, 0.32);
      // the head, a wide cone opening down
      k.lathe(su - 0.4, 2.0, [[14.6, 1.25], [15.4, 0.55], [16.0, 0.3]], green, k.lw, false);
      k.disc(su - 0.4, 2.0, 14.6, 1.2, '#2f8a48', k.thin);
      // the pull rod and its triangle handle
      k.rod([[su - 0.4, 2.0, 14.6], [su - 0.4, 2.0, 9.6]], C.steelDark, 0.08);
      k.poly([[su - 0.9, 2.0, 9.6], [su + 0.1, 2.0, 9.6], [su - 0.4, 2.0, 10.4]], '#3fae5a00', k.lw);
      k.line([[su - 0.9, 2.0, 9.6], [su + 0.1, 2.0, 9.6], [su - 0.4, 2.0, 10.4], [su - 0.9, 2.0, 9.6]], green, Math.max(1, 0.14 * k.s));
      // the eyewash bowl on the pipe
      k.rod([[su + 0.9, 0.35, 7.0], [su + 0.4, 1.3, 7.0]], green, 0.2);
      k.lathe(su + 0.4, 1.3, [[6.6, 0.25], [7.0, 0.7], [7.15, 0.75]], '#2f8a48', k.lw, false);
      k.disc(su + 0.4, 1.3, 7.15, 0.62, '#9fd8b0', k.thin);
      // the green shower sign over it all
      k.face(su - 0.2, su + 1.4, 0.05, 17.0, 18.6, green, k.lw, 0.15);
      k.line([[su + 0.1, 0.07, 18.2], [su + 0.6, 0.07, 18.3], [su + 0.6, 0.07, 18.0]], '#ffffff', Math.max(0.8, 0.12 * k.s));
      k.dot(su + 0.6, 0.08, 17.6, Math.max(1, 0.16 * k.s), '#ffffff');
      k.line([[su + 0.6, 0.08, 17.45], [su + 0.6, 0.08, 17.15]], '#ffffff', Math.max(0.8, 0.14 * k.s));
    });
    // the beacon: dark, or lit and turning
    const bu = (u0 + u1) / 2;
    const bz = h + 1.75;
    const lit = v.active;
    k.lathe(bu, 0.45, [[bz, 0.55], [bz + 0.6, 0.5], [bz + 0.9, 0.3], [bz + 1.0, 0.05]], lit ? '#ff6a3a' : '#a8402a', k.thin, false);
    if (lit) {
      const a = v.t * 5;
      const dx = Math.cos(a);
      k.halo(bu, 0.6, bz + 0.5, 2.6, '#ff8a4a', 0.55);
      k.poly([[bu, 0.6, bz + 0.5], [bu + dx * 3.2, 0.6 + Math.abs(Math.sin(a)) * 1.2, bz + 1.4], [bu + dx * 3.2, 0.6 + Math.abs(Math.sin(a)) * 1.2, bz - 0.4]], '#ffb07a40', 0);
    }
    // the keypad's light
    k.dot(u1 + 2.3, 0.37, 7.75, Math.max(1, 0.12 * k.s), lit ? C.green : C.red);
    // the door: shut, or swung in while someone passes
    const th = v.active ? 0.62 + 0.05 * Math.sin(v.t * 2.2) : 0;
    doorLeaf(k, th);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 3, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q);
      spawn({ kind: 'smoke', x: DOOR.u0 + 1 + j(1) * 4, y: 0.4 + j(2) * 0.8, z: 0.6 + j(3) * 3, vx: (j(4) - 0.5) * 0.8, vy: 1.2 + j(5) * 1.2, vz: 0.3 + j(6) * 0.4, life: 1.6, color: [200, 250, 245], glow: false, gravity: 0 });
    }
  },
};

// A white lab coat hanging from a hook at (u, z) on the wall.
function labCoat(k: Kit, u: number, z: number, cloth: Color): void {
  const n = 0.75;
  const top = z;
  const bot = z - 7.2;
  k.poly([[u - 0.5, n, top], [u + 0.5, n, top], [u + 0.95, n + 0.05, top - 1.4], [u + 0.85, n + 0.1, bot], [u - 0.85, n + 0.1, bot], [u - 0.95, n + 0.05, top - 1.4]], k.side(cloth, 0, 1, 0.1), k.lw, 0.2);
  k.line([[u, n + 0.12, top - 0.2], [u - 0.3, n + 0.12, top - 2.4], [u, n + 0.12, bot + 0.2]], '#b9c6c4', k.thin);
  k.line([[u, n + 0.12, top - 0.2], [u + 0.3, n + 0.12, top - 2.4]], '#b9c6c4', k.thin);
  k.face(u + 0.25, u + 0.7, n + 0.12, top - 3.6, top - 3.0, shade(cloth, -0.08), k.thin * 0.6);
  k.rod([[u + 0.4, n + 0.15, top - 3.0], [u + 0.42, n + 0.15, top - 2.7]], '#2f6fb0', 0.06);
}

// The door leaf on its hinge at u0, opened by th radians into the room.
function doorLeaf(k: Kit, th: number): void {
  const { u0, u1, h, hv } = DOOR;
  const w = u1 - u0 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, hv + dv * s + du * n, z];
  const steel = '#8fa9ae';
  const face = k.side(steel, -dv, du, 0.16);
  if (th > 0.05) k.poly([P(w, 0), P(w, 0, -0.45), P(w, h, -0.45), P(w, h)], k.side(steel, du, dv, 0.16), k.thin);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h)], face, k.lw);
  // a raised panel, a hazard band at the foot, a push bar, the porthole
  k.poly([P(0.5, 1.6), P(w - 0.5, 1.6), P(w - 0.5, h - 0.5), P(0.5, h - 0.5)], shade(face, 0.05), k.thin);
  hazard(k, [P(0.2, 0.25), P(w - 0.2, 0.25), P(w - 0.2, 1.3), P(0.2, 1.3)], 0.4, k.thin);
  k.rod([P(0.9, 6.4, 0.25), P(w - 0.6, 6.4, 0.25)], C.chrome, 0.24);
  for (const s of [1.0, w - 0.7]) k.rod([P(s, 6.4, 0), P(s, 6.4, 0.25)], C.steelDark, 0.16);
  const c = P(w / 2, 10.6, 0.02);
  const n: P3 = [-dv, du, 0];
  fillPts(k, ring(k, c, n, 1.65, 28), C.steelDark, k.lw);
  fillPts(k, ring(k, P(w / 2, 10.6, 0.04), n, 1.2, 24), '#7fe0da', k.thin);
  const glint = ring(k, P(w / 2, 10.6, 0.05), n, 0.85, 24);
  k.pen.beginPath();
  glint.slice(9, 14).forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.strokeStyle = '#ffffffc0';
  k.pen.lineWidth = Math.max(0.8, 0.14 * k.s);
  k.pen.stroke();
  if (k.fine) {
    const bolts = ring(k, P(w / 2, 10.6, 0.05), n, 1.45, 12);
    for (const [x, y] of bolts) {
      k.pen.beginPath();
      k.pen.arc(x, y, 0.08 * k.s, 0, Math.PI * 2);
      k.pen.fillStyle = shade(steel, 0.4);
      k.pen.fill();
    }
  }
  // the hinges
  for (const z of [2.0, h - 2.2]) k.box(u0 - 0.15, hv - 0.1, z, 0.35, 0.4, 1.0, C.iron, { line: k.thin, stripe: false });
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };

