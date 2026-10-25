import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import type { Quad } from './bits.ts';
import { arc3, band, bookRow, codeRows, crate, crown, fillPts, glass, hazard, hull, leaf, mug, on, ring, rivets, sprouts, stool, sub, wallRing } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, due, hash, kitOf, still, wisp, withAlpha } from './kit.ts';

// The station's stations, each a PropArt in its own frame (u along the
// wall, v out toward the agent, z up; the viewer always sees the top, the
// +v front and the +u end). Animated ones paint their still parts through
// the sprite cache (see still) and only the moving bits each frame; idle,
// they hold still, so their pictures are not sent again.

type Spawn = (p: Particle) => void;

// ── write: the helm ─────────────────────────────────────────────────────────
// A white helm console against the wall: a sloped deck of buttons, toggles
// and a trackball, a canted main screen with two side screens on arms; the
// captain's chair turned out to one side. Working it wakes the screens
// (code scrolling up the main one) and sets the buttons blinking.

const MAIN: Quad = [[3.0, 1.3, 7.9], [8.0, 1.3, 7.9], [8.0, 0.8, 11.6], [3.0, 0.8, 11.6]];
const DECK: Quad = [[0.9, 3.9, 5.0], [10.1, 3.9, 5.0], [10.1, 1.7, 6.6], [0.9, 1.7, 6.6]];
const SIDES: readonly Quad[] = [
  [[0.7, 1.2, 7.3], [2.6, 1.6, 7.3], [2.6, 1.6, 9.9], [0.7, 1.2, 9.9]],
  [[8.4, 1.6, 7.3], [10.3, 1.2, 7.3], [10.3, 1.2, 9.9], [8.4, 1.6, 9.9]],
];
// buttons on the deck: (fu, fz, colour)
const KEYS: ReadonlyArray<readonly [number, number, Color]> = (() => {
  const out: Array<[number, number, Color]> = [];
  const cs: Color[] = [C.red, C.amber, C.green, C.cyan, C.orange, '#c77dff'];
  for (let r = 0; r < 3; r++) for (let i = 0; i < 7; i++) {
    const fu = 0.07 + i * 0.055 + (i > 3 ? 0.3 : 0);
    if (fu > 0.93) continue;
    out.push([fu, 0.22 + r * 0.25, cs[Math.floor(hash(r, i, 5) * cs.length)]]);
  }
  return out;
})();

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 12, (k) => {
      k.shadow(5.5, 3.3, 6.2, 3.8, 0.3);
      // the console: a kick plinth, a white body, the sloped deck
      k.box(0.8, 0.5, 0, 9.4, 3.2, 0.7, C.hullDark, { stripe: false });
      k.box(0.5, 0.3, 0.7, 10, 3.6, 4.3, C.white, { round: 0.2, stripe: false });
      k.line([[0.6, 3.92, 2.4], [10.4, 3.92, 2.4], [10.4, 0.4, 2.4]], C.orange, Math.max(1, 0.35 * k.s));
      // a hatch with a vent in the front
      k.rect(1.6, 0.9, 4.6, 1.9, 3.92, shade(C.white, -0.08), k.thin, 0.2);
      for (let z = 1.15; z < 1.8; z += 0.3) k.line([[1.9, 3.94, z], [4.3, 3.94, z]], C.steelDark, Math.max(0.6, 0.08 * k.s));
      k.poly([[0.5, 0.3, 5.0], [10.5, 0.3, 5.0], [10.5, 3.9, 5.0], [0.5, 3.9, 5.0]], C.shell, k.thin);
      k.poly([...DECK], k.lgrad(DECK[0], DECK[3], [1, 0, 0], [[0, '#3a4766'], [1, '#2b3754']]), k.lw);
      k.poly([[10.1, 3.9, 5.0], [10.5, 3.9, 5.0], [10.5, 1.7, 6.6], [10.1, 1.7, 6.6]], shade(C.white, -0.18), k.thin);
      k.box(0.5, 0.3, 6.6, 10, 1.4, 0.5, C.white, { stripe: false });
      // the trackball, toggles and a big round button
      const [tx, ty] = k.p(...on(DECK, 0.52, 0.45));
      k.pen.beginPath();
      k.pen.arc(tx, ty, Math.max(1.5, 0.45 * k.s), 0, Math.PI * 2);
      k.paint('#9fb3c8', k.thin);
      for (let i = 0; i < 5; i++) {
        const p = on(DECK, 0.66 + i * 0.05, 0.78);
        k.rod([p, [p[0], p[1] - 0.2, p[2] + 0.45]], C.chrome, 0.08);
      }
      k.dot(...on(DECK, 0.86, 0.3), 0.32, C.red, k.thin);
      // the screens' backs and arms
      k.box(5.1, 0.35, 6.6, 0.8, 0.5, 1.4, C.steelDark, { line: k.thin, stripe: false });
      k.poly([MAIN[0], MAIN[1], MAIN[2], MAIN[3]], C.navy, k.lw, 0.15);
      k.poly([[MAIN[1][0], MAIN[1][1], MAIN[1][2]], [MAIN[1][0], MAIN[1][1] - 0.35, MAIN[1][2]], [MAIN[2][0], MAIN[2][1] - 0.35, MAIN[2][2]], [MAIN[2][0], MAIN[2][1], MAIN[2][2]]], shade(C.navy, -0.15), k.thin);
      for (const q of SIDES) {
        const m = on(q, 0.5, 0);
        k.rod([[m[0], 0.5, 6.9], [m[0], m[1] - 0.2, m[2] + 0.2]], C.steel, 0.12);
        k.poly([...q], C.navy, k.lw, 0.1);
      }
      // a mug and a small plant on the console's end
      mug(k, 9.6, 0.95, 7.1, C.orange, 0.38);
      k.cyl(1.4, 0.95, 7.1, 0.45, 0.65, C.white, { line: k.thin });
      sprouts(k, 1.4, 0.95, 7.7, 5, 1.1, 3);
      // the captain's chair, swung out to the left
      chair(k, 2.0, 5.4);
    });
    const lit = v.active;
    const scr = sub(MAIN, 0.06, 0.07, 0.94, 0.93);
    glass(k, scr, lit);
    for (const [i, q] of SIDES.entries()) glass(k, sub(q, 0.12, 0.1, 0.88, 0.9), lit, i ? '#9effc4' : '#ffd08a');
    if (lit) {
      codeRows(k, scr, v.t * 2.2);
      // a radar arc on the left screen, a level meter on the right
      const ls = sub(SIDES[0], 0.12, 0.1, 0.88, 0.9);
      const sw = (v.t * 1.6) % 1;
      k.line([on(ls, 0.5, 0.15), on(ls, 0.5 + 0.35 * Math.cos(sw * Math.PI * 2), 0.5 + 0.35 * Math.sin(sw * Math.PI * 2))], '#b35a1e', Math.max(0.8, 0.12 * k.s));
      const rs = sub(SIDES[1], 0.12, 0.1, 0.88, 0.9);
      for (let i = 0; i < 4; i++) {
        const hgt = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(v.t * (3 + i) + i * 1.7));
        k.poly([on(rs, 0.12 + i * 0.2, 0.1), on(rs, 0.26 + i * 0.2, 0.1), on(rs, 0.26 + i * 0.2, 0.1 + hgt * 0.8), on(rs, 0.12 + i * 0.2, 0.1 + hgt * 0.8)], '#1f7a4a', 0);
      }
      const [cu, cv, cz] = on(MAIN, 0.5, 0.5);
      k.halo(cu, cv + 0.8, cz, 5, '#8fe6ff', 0.32);
    } else {
      // a still star map on the main screen
      for (let i = 0; i < 6; i++) k.dot(...on(scr, 0.15 + hash(i, 1) * 0.7, 0.15 + hash(i, 2) * 0.7), 0.07, '#8fe6ff88');
    }
    // the buttons: a steady few, or blinking while worked
    const pen = k.pen;
    const tick = Math.floor(v.t * 3);
    for (const c of new Set(KEYS.map((q) => q[2]))) {
      pen.beginPath();
      let any = false;
      for (const [i, [fu, fz, kc]] of KEYS.entries()) {
        if (kc !== c) continue;
        const on_ = lit ? hash(i, tick, 7) < 0.6 : hash(i, 9) < 0.3;
        if (!on_) continue;
        const [x, y] = k.p(...on(DECK, fu, fz));
        const r = Math.max(0.9, 0.17 * k.s);
        pen.moveTo(x + r, y);
        pen.ellipse(x, y, r, r * 0.7, 0, 0, Math.PI * 2);
        any = true;
      }
      if (!any) continue;
      pen.fillStyle = c;
      pen.fill();
    }
    if (lit) k.halo(5.5, 2.8, 6.0, 3.2, '#8fe6ff', 0.2);
  },
};

// The captain's chair: a swivel seat turned side-on to the room, a tall
// white back with an orange cushion and headrest, armrests, five feet.
function chair(k: Kit, cu: number, cv: number): void {
  k.shadow(cu, cv, 1.9, 1.7, 0.25);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.5;
    k.rod([[cu, cv, 0.4], [cu + Math.cos(a) * 1.3, cv + Math.sin(a) * 1.3, 0.2]], C.steelDark, 0.18);
  }
  k.rod([[cu, cv, 0.4], [cu, cv, 2.7]], C.steel, 0.3);
  // the back, on the chair's -u side
  k.box(cu - 1.7, cv - 1.25, 2.6, 0.75, 2.5, 5.0, C.white, { round: 0.3 });
  k.box(cu - 0.95, cv - 1.0, 3.6, 0.32, 2.0, 3.4, C.orange, { round: 0.12, line: k.thin });
  k.box(cu - 1.6, cv - 0.75, 7.6, 0.6, 1.5, 1.0, C.white, { round: 0.25 });
  // the seat and its cushion
  k.box(cu - 1.0, cv - 1.3, 2.6, 2.6, 2.6, 0.75, C.white, { round: 0.3 });
  k.box(cu - 0.9, cv - 1.1, 3.35, 2.3, 2.2, 0.4, C.orange, { round: 0.25, line: k.thin });
  // armrests
  for (const dv of [-1.35, 1.0]) {
    k.rod([[cu - 0.3, cv + dv + 0.17, 3.4], [cu - 0.3, cv + dv + 0.17, 4.4]], C.steelDark, 0.14);
    k.box(cu - 1.0, cv + dv, 4.4, 2.2, 0.35, 0.35, C.steelDark, { line: k.thin, stripe: false });
  }
}

// ── read: the archive ───────────────────────────────────────────────────────
// A white wall cabinet of books and data slates held in by orange straps
// (things float up here), bins on the bottom shelf, a toy rocket on top; a
// reading nook beside it: a gooseneck lamp over a little table with a
// tablet. Reading lights the lamp and the tablet, and a book drifts up off
// the table and turns in the low gravity.

const SHELF_Z = [1.2, 5.6, 10.0, 14.4, 18.4];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 21, (k) => {
      const F = 3.4;
      k.shadow(5.3, 2.3, 6.3, 2.5, 0.3);
      k.box(0.3, 0.05, 0, 10, F - 0.05, 19.2, C.white, { stripe: false, round: 0.3 });
      k.box(0.6, 0.6, 0, 9.4, F - 0.6, 1.2, C.hullDark, { line: k.thin, stripe: false });
      k.box(0.1, 0, 19.2, 10.4, F + 0.2, 0.6, C.shell);
      SHELF_Z.slice(0, -1).forEach((z0, r) => {
        const z1 = SHELF_Z[r + 1] - 0.4;
        const [u0, u1] = [0.9, 9.7];
        k.poly([[u0, F, z0], [u1, F, z0], [u1, F, z1], [u0, F, z1]], k.vgrad(u0, F, z0, z1, [[0, '#3a4766'], [1, '#232c44']]), k.thin, 0.25);
        const sd = v.seed + r * 7;
        if (r === 0) {
          // bins with coloured lids
          for (let i = 0; i < 3; i++) {
            const bu = u0 + 0.3 + i * 2.95;
            k.box(bu, 0.6, z0, 2.6, F - 0.8, z1 - z0 - 0.5, [C.orange, '#3f6096', '#2f8f7a'][i], { line: k.thin, round: 0.2 });
            k.rect(bu + 0.8, z0 + 1.6, bu + 1.8, z0 + 2.2, F - 0.18, '#f3f6fa', 0);
          }
        } else if (r === 2) {
          bookRow(k, u0 + 0.1, u0 + 5.4, F - 0.05, z0, z1 - z0 - 0.3, sd);
          // data slates on a stand and a jar with a plant
          for (let i = 0; i < 3; i++) k.box(u0 + 5.7 + i * 0.5, 1.2, z0, 0.25, 1.6, 2.5 - i * 0.3, ['#2b3754', '#3f6096', '#1d4258'][i], { line: k.thin * 0.8, stripe: false });
          k.cyl(u1 - 1.0, 1.6, z0, 0.75, 1.9, '#d6eef4');
          sprouts(k, u1 - 1.0, 1.6, z0 + 0.5, 6, 1.4, sd);
        } else bookRow(k, u0 + 0.1, u1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
        // the strap across, and its buckle
        if (r > 0) {
          const zs = z0 + (z1 - z0) * 0.45;
          k.line([[u0, F + 0.05, zs], [u1, F + 0.05, zs]], INK, Math.max(1.6, 0.42 * k.s + k.lw));
          k.line([[u0, F + 0.05, zs], [u1, F + 0.05, zs]], C.orange, Math.max(1, 0.42 * k.s));
          k.rect(u0 + 4.2, zs - 0.3, u0 + 4.9, zs + 0.3, F + 0.08, C.chrome, k.thin * 0.8);
        }
      });
      // on top: a toy rocket and a rolled chart
      k.cyl(2.0, 1.8, 19.8, 0.45, 2.4, C.white);
      k.poly([[1.55, 1.8, 22.0], [2.45, 1.8, 22.0], [2.0, 1.8, 23.0]], C.red, k.thin);
      k.cyl(7.0, 1.6, 19.8, 0.4, 0.6, '#3f6096');
      k.rod([[5.6, 1.4, 20.2], [8.9, 1.6, 20.2]], '#e8e2cf', 0.35);
      // the reading nook: a little table, the lamp's stand, a stool
      k.shadow(12.0, 2.0, 1.9, 1.6, 0.25);
      k.cyl(12.0, 2.0, 0, 0.9, 0.25, C.steelDark);
      k.cyl(12.0, 2.0, 0.25, 0.2, 4.6, C.steel);
      k.cyl(12.0, 2.0, 4.85, 1.55, 0.3, C.white);
      k.box(11.0, 1.6, 5.15, 1.4, 1.0, 0.12, '#2b3754', { line: k.thin, stripe: false });
      k.disc(13.0, 1.0, 5.17, 0.45, C.steelDark, k.thin);
      k.rod([[13.0, 1.0, 5.2], [13.0, 1.0, 7.6], [12.6, 1.4, 8.4]], C.steelDark, 0.14);
    });
    // the lamp's head, lit or not, and the tablet
    const on_ = v.active;
    const [hx, hy] = k.p(12.4, 1.6, 8.2);
    k.pen.beginPath();
    k.pen.ellipse(hx, hy, 0.75 * k.s, 0.45 * k.s, -0.3, 0, Math.PI * 2);
    k.paint(on_ ? '#fff1cf' : C.orange, k.thin);
    k.poly([[11.1, 1.65, 5.3], [12.3, 1.65, 5.3], [12.3, 2.55, 5.3], [11.1, 2.55, 5.3]], on_ ? '#bff3ff' : C.screenDark, 0);
    if (!on_) {
      // the book lies on the table
      k.box(12.2, 2.4, 5.15, 1.3, 0.95, 0.3, '#c0507a', { line: k.thin, stripe: false });
      return;
    }
    k.pool(12.0, 2.0, 1.8, 1.4, '#ffe2a0', 0.5, 5.15);
    k.halo(12.4, 1.7, 7.9, 3, '#ffd890', 0.45);
    // the book drifting up and turning, pages fanned
    const t = v.t;
    const bz = 8.4 + Math.sin(t * 1.3) * 0.6;
    const bu = 12.0 + Math.sin(t * 0.7) * 0.3;
    const a = Math.sin(t * 0.9) * 0.35;
    const P = (du: number, dz: number): P3 => [bu + du * Math.cos(a), 3.0, bz + dz + du * Math.sin(a) * 0.4];
    k.poly([P(-1.2, 0), P(0, 0.25), P(0, 1.6), P(-1.2, 1.3)], '#f6f1e4', k.thin);
    k.poly([P(0, 0.25), P(1.2, 0), P(1.2, 1.3), P(0, 1.6)], '#fbf6ea', k.thin);
    for (const f of [0.45, 0.75, 1.05]) {
      k.line([P(-1.0, f), P(-0.2, f + 0.18)], '#b8a888', Math.max(0.6, 0.06 * k.s));
      k.line([P(0.2, f + 0.18), P(1.0, f)], '#b8a888', Math.max(0.6, 0.06 * k.s));
    }
    k.line([P(-1.25, -0.08), P(0, 0.17), P(1.25, -0.08)], '#c0507a', Math.max(1, 0.28 * k.s));
  },
};

// ── search: the sensor bay ──────────────────────────────────────────────────
// A wall console with a round radar scope set in the wall over it, a
// sample scanner (a glass dome over a crystal) and a rack of specimen
// drawers, one pulled out. Searching sweeps the scope, blips appear, and a
// scan line runs up the crystal.

const SCOPE = { a: 3.4, z: 9.2, r: 2.5, n: 0.55 };

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const { a, z, r, n } = SCOPE;
    const k = still(v, 'search', 13, (k) => {
      k.shadow(6, 2.2, 6.6, 2.5, 0.3);
      // the scope's housing on the wall
      fillPts(k, wallRing(k, a, 0.05, z, r + 1.0, 28), C.navy, k.lw);
      fillPts(k, wallRing(k, a, 0.45, z, r + 0.55, 28), C.white, k.lw);
      fillPts(k, wallRing(k, a, n, z, r, 28), '#0a2a1e', k.thin);
      rivets(k, [0, 1, 2, 3, 4, 5].map((i) => [a + Math.cos(i * 1.05) * (r + 0.28), 0.47, z + Math.sin(i * 1.05) * (r + 0.28)] as P3));
      // the console under it
      k.box(0.6, 0.5, 0, 10.8, 2.9, 0.6, C.hullDark, { stripe: false });
      k.box(0.3, 0.3, 0.6, 11.4, 3.3, 4.2, C.white, { round: 0.2, stripe: false });
      k.line([[0.4, 3.62, 1.2], [11.6, 3.62, 1.2], [11.6, 0.4, 1.2]], C.orange, Math.max(1, 0.3 * k.s));
      // drawers in the console's front, one pulled out with a rock in it
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
        const u0 = 6.0 + i * 1.8;
        const z0 = 1.6 + j * 1.5;
        k.rect(u0, z0, u0 + 1.6, z0 + 1.3, 3.62, shade(C.white, -0.06), k.thin, 0.15);
        k.line([[u0 + 0.5, 3.64, z0 + 0.9], [u0 + 1.1, 3.64, z0 + 0.9]], C.steelDark, Math.max(0.8, 0.14 * k.s));
      }
      k.rect(1.0, 1.6, 5.4, 4.2, 3.62, '#2b3754', k.thin, 0.2);
      for (let i = 0; i < 6; i++) k.dot(1.5 + i * 0.7, 3.66, 3.6, 0.13, [C.green, C.amber, C.cyan, C.green, C.red, C.green][i]);
      k.box(0.2, 0.2, 4.8, 11.6, 3.6, 0.4, C.shell);
      // the pulled-out drawer on top: a tray with a rock in it
      k.box(7.6, 1.6, 5.2, 2.8, 2.4, 0.6, C.steel, { line: k.thin, round: 0.1 });
      k.disc(8.7, 2.7, 5.82, 0.9, '#4a3f3a', 0);
      fillPts(k, hull([k.p(8.2, 2.5, 5.8), k.p(9.4, 2.6, 5.8), k.p(8.9, 2.9, 6.6), k.p(8.4, 2.7, 6.4), k.p(9.2, 2.3, 6.4)]), '#8a7a6e', k.thin);
      k.dot(10.4, 3.2, 5.9, 0.2, C.amber);
      // the scanner: a base, a glass dome, a violet crystal inside
      k.cyl(5.2, 2.0, 5.2, 1.1, 0.5, C.navy);
      k.cyl(5.2, 2.0, 5.7, 0.9, 0.15, C.steel, { line: k.thin });
      fillPts(k, hull([k.p(4.75, 2.0, 5.85), k.p(5.65, 2.0, 5.85), k.p(5.2, 2.0, 8.0), k.p(4.95, 2.0, 7.0), k.p(5.45, 2.0, 7.0)]), '#b07ae8', k.thin);
      fillPts(k, hull([...ring(k, [5.2, 2.0, 5.85], [0, 0, 1], 0.95, 20), ...ring(k, [5.2, 2.0, 8.6], [0, 0, 1], 0.4, 12)]), '#d8f0ff22', k.thin);
      // a stack of sample crates at the end
      crate(k, 10.2, 0.4, 5.2, 1.5, 1.5, 1.3, '#d9dfe8', C.orange, v.seed);
      crate(k, 10.4, 0.6, 6.5, 1.1, 1.1, 1.0, '#3f6096', C.white, v.seed + 1);
      // a headset hung on a hook
      k.rod([[1.4, 0.2, 7.2], [1.4, 0.7, 7.2]], C.steel, 0.08);
      const hs = arc3([1.4, 0.75, 6.4], [1, 0, 0], 0.7, Math.PI * 0.05, Math.PI * 0.95, 10);
      k.rod(hs, '#2a2f3d', 0.16);
      k.dot(1.4, 0.75 + 0.7 * Math.cos(Math.PI * 0.95), 6.4 + 0.7 * Math.sin(Math.PI * 0.95) - 0.1, 0.3, '#2a2f3d');
    });
    // the scope: dim green grid, or the sweep with its blips
    const pen = k.pen;
    const grid = (c: Color) => {
      for (const rr of [r * 0.35, r * 0.7]) {
        fillPts(k, wallRing(k, a, n + 0.01, z, rr, 24), null, 0);
        pen.strokeStyle = c;
        pen.lineWidth = Math.max(0.6, 0.07 * k.s);
        pen.stroke();
      }
      k.line([[a - r, n + 0.01, z], [a + r, n + 0.01, z]], c, Math.max(0.6, 0.07 * k.s));
      k.line([[a, n + 0.01, z - r], [a, n + 0.01, z + r]], c, Math.max(0.6, 0.07 * k.s));
    };
    if (!v.active) {
      grid('#2f8f5a66');
      return;
    }
    grid('#5ee08f88');
    const sw = (v.t * 2.2) % (Math.PI * 2);
    const wedge: P3[] = [[a, n + 0.02, z]];
    for (let i = 0; i <= 8; i++) {
      const th = sw - (i / 8) * 1.1;
      wedge.push([a + Math.cos(th) * r * 0.97, n + 0.02, z + Math.sin(th) * r * 0.97]);
    }
    k.poly(wedge, k.grad(wedge[1], wedge[wedge.length - 1], [[0, '#7dff7a99'], [1, '#7dff7a00']]), 0);
    k.line([wedge[0], wedge[1]], '#c8ffc0', Math.max(0.8, 0.12 * k.s));
    for (let i = 0; i < 4; i++) {
      const th = hash(i, 21) * Math.PI * 2;
      const age = (sw - th + Math.PI * 4) % (Math.PI * 2);
      if (age > 3.5) continue;
      const rr = r * (0.3 + hash(i, 22) * 0.6);
      k.dot(a + Math.cos(th) * rr, n + 0.03, z + Math.sin(th) * rr, 0.2, withAlpha('#c8ffc0', 1 - age / 3.5));
    }
    k.halo(a, n + 0.3, z, r * 1.6, '#5ee08f', 0.18);
    // the scan line climbing the crystal
    const f = (v.t * 0.8) % 1;
    const zs = 5.9 + f * 2.4;
    k.line([[4.3, 2.0, zs], [6.1, 2.0, zs]], '#ffb0ffcc', Math.max(1, 0.18 * k.s));
    k.halo(5.2, 2.0, zs, 1.6, '#d68cff', 0.4);
  },
};

// ── run: the reactor core ───────────────────────────────────────────────────
// A glowing column of plasma in a glass sleeve, held in three steel
// collars over a round plinth striped in hazard paint, fed by thick pipes;
// a capped head with vents on top and a little control post in front.
// Running it sets bands of light climbing the core and throws sparks.

const CORE = { c: 5.5, r: 1.9, z0: 2.7, z1: 15.0, mids: [6.8, 10.9] };

// A coolant loop out of the head, arching down to the plinth at angle a.
function loop(k: Kit, a: number, col: Color): void {
  const { c, z1 } = CORE;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const pts: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const rr = 2.2 + Math.sin(t * Math.PI * 0.5) * 2.6;
    const zz = z1 + 0.8 - (z1 - 1.0) * t * t;
    pts.push([c + ca * rr, c + sa * rr, zz]);
  }
  k.rod(pts, col, 0.6);
  const end = pts[pts.length - 1];
  k.cyl(end[0], end[1], 1.2, 0.6, 0.5, C.steelDark, { line: k.thin });
}

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { c, r, z0, z1 } = CORE;
    const k = still(v, 'run', 20, (k) => {
      k.shadow(c, c, 5.6, 5.6, 0.32);
      // the plinth: two steps, hazard paint round the top
      k.cyl(c, c, 0, 5.0, 0.7, C.hullDark);
      k.cyl(c, c, 0.7, 4.3, 0.9, C.steelDark);
      const e = k.ell(c, c, 1.6, 4.3);
      const pen = k.pen;
      pen.save();
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      pen.clip();
      const n = 24;
      pen.beginPath();
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = a0 + (Math.PI / n) * 1.1;
        k.trace([[c + Math.cos(a0) * 3.5, c + Math.sin(a0) * 3.5, 1.6], [c + Math.cos(a1) * 3.5, c + Math.sin(a1) * 3.5, 1.6], [c + Math.cos(a1 + 0.12) * 4.4, c + Math.sin(a1 + 0.12) * 4.4, 1.6], [c + Math.cos(a0 + 0.12) * 4.4, c + Math.sin(a0 + 0.12) * 4.4, 1.6]]);
      }
      pen.fillStyle = C.yellow;
      pen.fill();
      pen.restore();
      k.disc(c, c, 1.6, 3.4, C.hull, k.thin);
      // coolant loops out of the head, behind the core
      loop(k, Math.PI, C.orange);
      loop(k, -Math.PI / 2, C.steel);
      // the core's foot collar and the back of its sleeve
      k.cyl(c, c, 1.6, r + 0.8, z0 - 1.6, C.steel);
      k.cyl(c, c, z0, r, z1 - z0, '#2b4660', { line: 0 });
      // the head: a collar, a white drum with vents, an orange cap, a mast
      k.cyl(c, c, z1, r + 0.8, 0.9, C.steel);
      k.cyl(c, c, z1 + 0.9, r + 0.3, 1.5, C.white);
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.12 + i * 0.12);
        k.line([[c + Math.cos(a) * (r + 0.32), c + Math.sin(a) * (r + 0.32), z1 + 1.15], [c + Math.cos(a) * (r + 0.32), c + Math.sin(a) * (r + 0.32), z1 + 2.15]], C.steelDark, Math.max(0.7, 0.1 * k.s));
      }
      k.cyl(c, c, z1 + 2.4, r - 0.3, 0.5, C.orange);
      k.rod([[c, c, z1 + 2.9], [c, c, z1 + 4.0]], C.steel, 0.14);
      k.dot(c, c, z1 + 4.1, 0.25, C.red, k.thin * 0.7);
      // two short pipes on the near side, into the plinth
      for (const a of [Math.PI / 4 - 0.7, Math.PI / 4 + 0.7]) {
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        k.rod([[c + ca * (r + 0.6), c + sa * (r + 0.6), 2.2], [c + ca * 3.0, c + sa * 3.0, 2.0], [c + ca * 3.3, c + sa * 3.3, 1.6]], C.orange, 0.42);
      }
      // the control post in front, to one side
      k.shadow(1.6, 9.0, 1.0, 0.8, 0.25);
      k.box(1.0, 8.4, 0, 1.2, 1.2, 3.2, C.white, { round: 0.2 });
      k.poly([[0.9, 8.3, 3.2], [2.3, 8.3, 3.2], [2.3, 9.7, 3.6], [0.9, 9.7, 3.6]], '#2b3754', k.thin);
    });
    // the plasma: a column of light, bands climbing it while worked
    const pen = k.pen;
    const lit = v.active;
    band(k, c, c, r, z0, z1);
    pen.fillStyle = k.hgrad([c - r, c + r, 0], [c + r, c - r, 0], lit ? [[0, '#7ff6ff'], [0.4, '#effeff'], [0.75, '#8fecff'], [1, '#2fb8e0']] : [[0, '#48c4e0'], [0.4, '#a6eef8'], [0.75, '#56c4e0'], [1, '#2a86b0']]);
    pen.fill();
    pen.save();
    band(k, c, c, r, z0, z1);
    pen.clip();
    for (let i = 0; i < 4; i++) {
      const zz = z0 + (((i / 4) * (z1 - z0) + (lit ? v.t * 3.2 : 0.6)) % (z1 - z0));
      const e = k.ell(c, c, zz, r);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry * 1.4 + 0.3 * k.s, 0, 0, Math.PI);
      pen.strokeStyle = lit ? '#ffffffcc' : '#e8fcff55';
      pen.lineWidth = Math.max(1, 0.3 * k.s);
      pen.stroke();
    }
    // the glass's sheen down its lit side
    k.line([[c - r * 0.6, c + r * 0.6, z0 + 0.3], [c - r * 0.6, c + r * 0.6, z1 - 0.3]], '#ffffffaa', Math.max(1, 0.3 * k.s));
    pen.restore();
    band(k, c, c, r, z0, z1);
    k.paint(null, k.lw);
    // thin steel rings round the sleeve
    for (const m of CORE.mids) {
      band(k, c, c, r + 0.22, m, m + 0.55);
      k.paint(C.steel, k.thin);
    }
    // the post's screen, and the glow
    k.poly([[1.05, 8.45, 3.25], [2.15, 8.45, 3.25], [2.15, 9.55, 3.55], [1.05, 9.55, 3.55]], lit ? '#8fe6ff' : C.screenMid, 0);
    k.halo(c, c, (z0 + z1) / 2, lit ? 7.5 + Math.sin(v.t * 5) * 0.6 : 6.5, '#5ce8ff', lit ? 0.45 : 0.3);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      const a = j(1) * Math.PI * 2;
      spawn({ kind: 'spark', x: CORE.c + Math.cos(a) * 2, y: CORE.c + Math.sin(a) * 2, z: CORE.z0 + (0.5 + j(2)) * (CORE.z1 - CORE.z0), vx: Math.cos(a) * (1.5 + j(3)), vy: Math.sin(a) * (1.5 + j(3)), vz: 1 + j(4) * 2, life: 0.8 + j(5) * 0.4, color: [160, 240, 255], glow: true, gravity: 2 });
    }
  },
};

// ── web: the comms station ──────────────────────────────────────────────────
// A comms console on a pedestal, a round screen showing the planet laced
// with links, a mast with a dish on top and an antenna whip. Browsing turns
// the dish to and fro, sends rings of signal off it and sets the level
// lights dancing; signals glint up off the dish.

const DISH = { c: [5.6, 3.2, 15.4] as P3, r: 2.4 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 19,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 19, (k) => {
      k.shadow(4.5, 4.6, 4.4, 4.2, 0.3);
      // the mast behind the console
      k.cyl(5.6, 3.2, 0, 0.9, 0.4, C.steelDark);
      k.rod([[5.6, 3.2, 0.4], [5.6, 3.2, 14.0]], C.steel, 0.36);
      for (let z = 2; z < 13.5; z += 2.2) k.rod([[5.3, 3.2, z], [5.9, 3.2, z + 1.1]], C.steelDark, 0.08);
      k.rod([[6.0, 3.0, 11.8], [7.8, 2.4, 16.8]], C.steelDark, 0.07);
      k.dot(7.8, 2.4, 16.8, 0.2, C.red);
      // the console: a pedestal, a sloped top, the round screen on an arm
      k.box(1.4, 3.4, 0, 5.4, 3.6, 0.6, C.hullDark, { stripe: false });
      k.box(1.2, 3.2, 0.6, 5.8, 4.0, 4.2, C.white, { round: 0.25 });
      k.line([[1.3, 7.22, 3.6], [7.0, 7.22, 3.6], [7.0, 3.3, 3.6]], C.orange, Math.max(1, 0.3 * k.s));
      const top: Quad = [[1.2, 7.2, 4.8], [7.0, 7.2, 4.8], [7.0, 3.2, 6.2], [1.2, 3.2, 6.2]];
      k.poly([...top], k.lgrad(top[0], top[3], [1, 0, 0], [[0, '#3a4766'], [1, '#2b3754']]), k.lw);
      k.poly([[7.0, 7.2, 4.8], [7.0, 7.2, 0.6], [7.0, 3.2, 0.6], [7.0, 3.2, 6.2]], shade(C.white, -0.18), k.thin);
      // dials and a handset in its cradle
      for (const fu of [0.15, 0.3]) {
        const [x, y] = k.p(...on(top, fu, 0.55));
        k.pen.beginPath();
        k.pen.ellipse(x, y, 0.42 * k.s, 0.3 * k.s, 0, 0, Math.PI * 2);
        k.paint(C.chrome, k.thin);
      }
      k.rod([on(top, 0.62, 0.62), on(top, 0.9, 0.62)], '#2a2f3d', 0.35);
      k.box(1.8, 1.9, 6.0, 4.4, 0.35, 3.6, C.navy, { round: 0.3 });
      // a stool and a crate of spares
      stool(k, 2.4, 8.2, C.orange, 3.2);
      crate(k, 7.0, 7.0, 0, 1.8, 1.8, 1.6, '#d9dfe8', '#3f6096', v.seed);
    });
    const pen = k.pen;
    const lit = v.active;
    // the screen: the planet with links over it
    const scr: Quad = [[2.1, 2.27, 6.4], [5.9, 2.27, 6.4], [5.9, 2.27, 9.3], [2.1, 2.27, 9.3]];
    glass(k, scr, lit, '#5fb2e8');
    const [gx, gy] = k.p(...on(scr, 0.5, 0.5));
    const gr = 1.1 * k.s;
    pen.beginPath();
    pen.arc(gx, gy, gr, 0, Math.PI * 2);
    k.paint(lit ? '#2f78c8' : '#1d4258', 0);
    if (lit) {
      const ph = v.t * 0.8;
      pen.beginPath();
      for (let i = 0; i < 5; i++) {
        const a0 = hash(i, 31) * Math.PI * 2 + ph * 0.2;
        const a1 = a0 + 1 + hash(i, 32) * 2;
        pen.moveTo(gx + Math.cos(a0) * gr * 0.8, gy + Math.sin(a0) * gr * 0.6);
        pen.quadraticCurveTo(gx + Math.cos((a0 + a1) / 2) * gr * 1.7, gy + Math.sin((a0 + a1) / 2) * gr * 1.3, gx + Math.cos(a1) * gr * 0.8, gy + Math.sin(a1) * gr * 0.6);
      }
      pen.strokeStyle = '#ffd27a';
      pen.lineWidth = Math.max(0.7, 0.08 * k.s);
      pen.stroke();
      for (let i = 0; i < 5; i++) k.dot(...on(scr, 0.14 + i * 0.06, 0.12), 0.08, (i + Math.floor(v.t * 4)) % 3 ? '#5ee08f' : '#ffb04a');
    }
    // level lights along the console's top
    const top: Quad = [[1.2, 7.2, 4.8], [7.0, 7.2, 4.8], [7.0, 3.2, 6.2], [1.2, 3.2, 6.2]];
    for (let i = 0; i < 6; i++) {
      const lvl = lit ? 0.5 + 0.5 * Math.sin(v.t * (4 + i) + i * 2) : 0.2;
      k.dot(...on(top, 0.45 + i * 0.07, 0.22), 0.15, lvl > 0.5 ? (i > 3 ? C.amber : C.green) : '#2f3a50');
    }
    // the dish: turned by browsing, its feed on a tripod
    const yaw = lit ? -0.6 + Math.sin(v.t * 0.9) * 0.55 : -0.6;
    const pitch = 0.75;
    const nrm: P3 = [Math.cos(yaw) * Math.cos(pitch), Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch)];
    const ctr = DISH.c;
    const rim = ring(k, ctr, nrm, DISH.r, 24);
    const back = ring(k, [ctr[0] - nrm[0] * 0.5, ctr[1] - nrm[1] * 0.5, ctr[2] - nrm[2] * 0.5], nrm, DISH.r * 0.55, 16);
    k.rod([[5.6, 3.2, 13.8], [ctr[0] - nrm[0] * 0.5, ctr[1] - nrm[1] * 0.5, ctr[2] - nrm[2] * 0.5]], C.steelDark, 0.3);
    fillPts(k, hull([...rim, ...back]), C.chrome, k.lw);
    fillPts(k, rim, k.grad([ctr[0] - 1, ctr[1], ctr[2] + 1], [ctr[0] + 1, ctr[1], ctr[2] - 1], [[0, '#ffffff'], [1, '#b9c4d2']]), k.thin);
    const feed: P3 = [ctr[0] + nrm[0] * 1.3, ctr[1] + nrm[1] * 1.3, ctr[2] + nrm[2] * 1.3];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const rp = arc3(ctr, nrm, DISH.r * 0.85, a, a, 1)[0];
      k.line([rp, feed], C.steelDark, Math.max(0.7, 0.08 * k.s));
    }
    k.dot(...feed, 0.22, lit ? C.amber : C.steelDark, k.thin * 0.7);
    if (!lit) return;
    // rings of signal off the dish
    for (let i = 0; i < 3; i++) {
      const f = (v.t * 0.9 + i / 3) % 1;
      const cc: P3 = [feed[0] + nrm[0] * f * 2.4, feed[1] + nrm[1] * f * 2.4, feed[2] + nrm[2] * f * 2.4];
      fillPts(k, ring(k, cc, nrm, 0.5 + f * 1.6, 18), null, 0);
      pen.strokeStyle = withAlpha('#8ff6ff', 0.8 * (1 - f));
      pen.lineWidth = Math.max(0.8, 0.14 * k.s);
      pen.stroke();
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: DISH.c[0] + j(1), y: DISH.c[1] + j(2), z: DISH.c[2] + 1, vx: 0.4 + j(3) * 0.6, vy: -0.3 + j(4) * 0.6, vz: 1.6 + j(5), life: 1.4, color: [160, 240, 255], glow: true, gravity: -0.2 });
    }
  },
};

// ── think: the holo-table ───────────────────────────────────────────────────
// A rounded table of dark glass on a pedestal ringed with light, an
// emitter in its middle throwing up a hologram of a planet with a moon in
// orbit; two stools at its back corners. Thinking spins the hologram up
// and brightens it.

const HOLO = { u: 6, v: 3.5, z: 9.8, r: 2.4 };

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'think', 13, (k) => {
      k.shadow(6, 3.5, 6.2, 3.6, 0.3);
      stool(k, 1.3, 1.3, C.blanket);
      stool(k, 10.7, 1.3, C.blanket);
      // the pedestal, ringed with light
      k.box(3.4, 1.9, 0, 5.2, 3.2, 0.5, C.hullDark, { round: 0.3 });
      k.box(4.0, 2.4, 0.5, 4.0, 2.2, 3.8, C.white, { round: 0.5 });
      k.line([[4.1, 4.62, 1.0], [7.9, 4.62, 1.0], [7.95, 2.5, 1.0]], C.cyan, Math.max(1, 0.3 * k.s));
      k.halo(6, 4.7, 1.0, 2.6, '#5ce8ff', 0.35);
      // the table top: a white rim round dark glass
      k.box(0.8, 0.6, 4.5, 10.4, 5.8, 0.5, C.white, { round: 1.6 });
      k.poly([[1.4, 1.1, 5.01], [10.6, 1.1, 5.01], [10.6, 5.9, 5.01], [1.4, 5.9, 5.01]], k.grad([1.6, 5.7, 5.0], [10.4, 1.3, 5.0], [[0, '#1d3550'], [1, '#13283a']]), k.thin, 1.2);
      // grid lines in the glass, a slate and a mug on the rim
      const pen = k.pen;
      pen.beginPath();
      for (let u = 2.6; u < 10; u += 1.2) {
        const [x0, y0] = k.p(u, 1.5, 5.02);
        const [x1, y1] = k.p(u, 5.5, 5.02);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#5ce8ff30';
      pen.lineWidth = Math.max(0.6, 0.06 * k.s);
      pen.stroke();
      k.box(1.4, 4.6, 5.0, 1.6, 1.0, 0.12, '#2b3754', { line: k.thin, stripe: false });
      mug(k, 10.2, 5.4, 5.0, '#3f6096', 0.36);
      // the emitter
      k.cyl(HOLO.u, HOLO.v, 5.0, 0.9, 0.35, C.steel);
      k.disc(HOLO.u, HOLO.v, 5.36, 0.55, '#bff6ff', 0);
    });
    const lit = v.active;
    const { u, v: hv, z, r } = HOLO;
    const a = lit ? 0.75 : 0.4;
    // the beam up from the emitter
    const e = k.ell(u, hv, 5.35, 0.55);
    const [hx, hy] = k.p(u, hv, z);
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(e.cx - e.rx, e.cy);
    pen.lineTo(hx - r * k.s * 1.15, hy);
    pen.lineTo(hx + r * k.s * 1.15, hy);
    pen.lineTo(e.cx + e.rx, e.cy);
    pen.closePath();
    pen.fillStyle = withAlpha('#8ff6ff', lit ? 0.16 : 0.08);
    pen.fill();
    k.halo(u, hv, z, r * 2.2, '#8ff6ff', lit ? 0.35 : 0.18);
    // the hologram: a wire globe turning, a moon on a tilted orbit
    const spin = lit ? v.t * 0.9 : 0.4;
    const R = r * k.s;
    const holo = withAlpha('#bffcff', a);
    pen.beginPath();
    pen.arc(hx, hy, R, 0, Math.PI * 2);
    pen.fillStyle = withAlpha('#5ce8ff', lit ? 0.18 : 0.1);
    pen.fill();
    pen.strokeStyle = holo;
    pen.lineWidth = Math.max(0.8, 0.12 * k.s);
    pen.stroke();
    pen.beginPath();
    for (let i = 0; i < 4; i++) {
      const ph = spin + (i / 4) * Math.PI;
      const w = Math.cos(ph) * R;
      pen.moveTo(hx + Math.abs(w), hy);
      pen.ellipse(hx, hy, Math.abs(w), R, 0, 0, Math.PI * 2);
    }
    for (const lat of [-0.5, 0, 0.5]) {
      const y = hy - Math.sin(lat) * R;
      const w = Math.cos(lat) * R;
      pen.moveTo(hx + w, y);
      pen.ellipse(hx, y, w, w * 0.25, 0, 0, Math.PI * 2);
    }
    pen.strokeStyle = withAlpha('#8ff6ff', a * 0.7);
    pen.lineWidth = Math.max(0.6, 0.07 * k.s);
    pen.stroke();
    // the orbit and its moon
    const oa = lit ? v.t * 1.4 : 2.2;
    pen.beginPath();
    pen.ellipse(hx, hy, R * 1.75, R * 0.5, -0.25, 0, Math.PI * 2);
    pen.strokeStyle = withAlpha('#ffd27a', a * 0.8);
    pen.lineWidth = Math.max(0.6, 0.08 * k.s);
    pen.stroke();
    const mx = hx + Math.cos(oa) * R * 1.75 * Math.cos(-0.25) - Math.sin(oa) * R * 0.5 * Math.sin(-0.25);
    const my = hy + Math.cos(oa) * R * 1.75 * Math.sin(-0.25) + Math.sin(oa) * R * 0.5 * Math.cos(-0.25);
    pen.beginPath();
    pen.arc(mx, my, Math.max(1.2, R * 0.2), 0, Math.PI * 2);
    pen.fillStyle = withAlpha('#ffe6a8', lit ? 0.95 : 0.6);
    pen.fill();
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: HOLO.u + j(1) * 3, y: HOLO.v + j(2) * 2, z: HOLO.z + j(3) * 2, vx: j(4) * 0.4, vy: j(5) * 0.4, vz: 0.8, life: 1.2, color: [180, 250, 255], glow: true, gravity: -0.3 });
    }
  },
};

// ── idle: the sleep pods ────────────────────────────────────────────────────
// A bunk of two sleeping capsules, white shells with a warm light inside,
// pillows and a blue quilt, a curtain half drawn on the top one and a
// ladder up to it; before it a low cushioned bench with a plush alien, a
// beanbag, and a little table with a mug and a plant. Where tired crew
// curl up.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.5, 4.6, 7.8, 4.8, 0.3);
    // the bunk frame and two capsules
    k.box(0.4, 0.4, 0, 10.0, 4.6, 0.6, C.hullDark, { stripe: false });
    pod(k, 0.6, 0.6, 9.6, 4.2, 0.6, 4.0, v.seed, false);
    pod(k, 0.6, 0.6, 9.6, 4.2, 5.0, 4.0, v.seed + 1, true);
    // the ladder up the end
    for (const w of [1.6, 3.4]) k.rod([[10.6, w, 0], [10.6, w, 9.6]], C.steel, 0.16);
    for (let z = 1.4; z < 9.4; z += 1.6) k.rod([[10.6, 1.6, z], [10.6, 3.4, z]], C.steel, 0.12);
    // a little table, a mug and a plant past the ladder
    k.shadow(13.0, 2.6, 1.6, 1.4, 0.24);
    k.cyl(13.0, 2.6, 0, 0.8, 0.2, C.steelDark);
    k.cyl(13.0, 2.6, 0.2, 0.18, 2.8, C.steel);
    k.cyl(13.0, 2.6, 3.0, 1.4, 0.3, C.white);
    mug(k, 12.5, 3.2, 3.3, C.mustard, 0.36);
    k.cyl(13.5, 2.2, 3.3, 0.45, 0.6, C.orange, { line: k.thin });
    crown(k, 13.5, 2.2, 4.4, 0.55, 0.45, 7, v.seed + 3);
    // the bench before the bunk, a plush alien on it
    k.shadow(5.0, 7.6, 4.6, 1.6, 0.24);
    k.box(1.0, 6.4, 0, 8.2, 2.4, 1.1, C.steelDark, { stripe: false });
    k.box(0.8, 6.2, 1.1, 8.6, 2.8, 1.0, C.blanket, { round: 0.45 });
    k.line([[5.1, 6.2, 2.12], [5.1, 9.0, 2.12]], shade(C.blanket, -0.3), Math.max(0.8, 0.12 * k.s));
    k.box(1.2, 6.5, 2.1, 2.2, 1.0, 1.4, C.mustard, { round: 0.45 });
    plush(k, 7.4, 7.6, 2.1);
    // a beanbag on the rug
    beanbag(k, 12.6, 8.0, C.rust);
  },
};

// A sleeping capsule from (u, v, z) du x dv x dh: a white rounded shell, a
// dark opening on its front with the bedding and a warm light inside.
function pod(k: Kit, u: number, v: number, du: number, dv: number, z: number, dh: number, seed: number, upper: boolean): void {
  k.box(u, v, z, du, dv, dh, C.white, { round: 1.2 });
  const F = v + dv + 0.01;
  const o: Quad = [[u + 0.9, F, z + 0.6], [u + du - 0.9, F, z + 0.6], [u + du - 0.9, F, z + dh - 0.6], [u + 0.9, F, z + dh - 0.6]];
  k.poly([...o], '#2b2f45', k.thin, 0.9);
  // inside, warm: the light, pillow and quilt
  k.pen.save();
  k.pen.beginPath();
  k.trace([...o], 0.9);
  k.pen.clip();
  k.poly([...o], k.vgrad(u, F, z, z + dh, [[0, '#5a4038'], [1, '#8a6040']]), 0);
  k.halo(u + 1.8, F, z + dh - 1.0, 3.2, C.warm, 0.6);
  k.box(u + 1.0, F - 1.6, z + 0.6, 1.9, 1.4, 0.8, C.cream, { round: 0.35, line: k.thin });
  const q = hash(seed, 2) < 0.5 ? C.blanket : '#c0507a';
  k.box(u + 2.8, F - 1.8, z + 0.6, du - 3.6, 1.7, 0.95, q, { round: 0.4, line: k.thin });
  k.pen.restore();
  k.pen.beginPath();
  k.trace([...o], 0.9);
  k.paint(null, k.thin);
  // a band of orange trim and a small status light
  k.line([[u + 0.3, F, z + 0.3], [u + du - 0.3, F, z + 0.3]], C.orange, Math.max(1, 0.25 * k.s));
  k.dot(u + du - 0.5, F + 0.01, z + dh - 0.5, 0.15, C.green);
  if (upper) {
    // a curtain half drawn
    const c0 = u + du * 0.58;
    const pts: P3[] = [[c0, F + 0.05, z + dh - 0.55]];
    for (let i = 0; i <= 6; i++) pts.push([c0 + (i / 6) * (du * 0.42 - 0.9), F + 0.05 + (i & 1) * 0.15, z + dh - 0.55]);
    for (let i = 6; i >= 0; i--) pts.push([c0 + (i / 6) * (du * 0.42 - 0.9) + 0.1, F + 0.05 + (i & 1) * 0.15, z + 0.65]);
    k.poly(pts, k.vgrad(c0, F, z, z + dh, [[0, '#4a6aa0'], [1, '#6a8ac0']]), k.thin);
  }
}

// A plush alien toy sitting on z: a green round body, antennae, big eyes.
function plush(k: Kit, u: number, v: number, z: number): void {
  const [x, y] = k.p(u, v, z + 0.9);
  const s = k.s;
  for (const dx of [-0.35, 0.35]) {
    k.pen.beginPath();
    k.pen.moveTo(x + dx * s, y - 0.7 * s);
    k.pen.lineTo(x + dx * 1.6 * s, y - 1.4 * s);
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = Math.max(1, 0.12 * s);
    k.pen.stroke();
    k.pen.beginPath();
    k.pen.arc(x + dx * 1.6 * s, y - 1.4 * s, Math.max(0.8, 0.16 * s), 0, Math.PI * 2);
    k.paint('#ffb04a', k.thin * 0.7);
  }
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.8 * s, 0.9 * s, 0, 0, Math.PI * 2);
  k.paint('#7fd07a', k.thin);
  for (const dx of [-0.3, 0.3]) {
    k.pen.beginPath();
    k.pen.arc(x + dx * s, y - 0.15 * s, Math.max(0.7, 0.16 * s), 0, Math.PI * 2);
    k.pen.fillStyle = INK;
    k.pen.fill();
  }
}

// A beanbag slumped on the floor.
function beanbag(k: Kit, cu: number, cv: number, c: Color): void {
  k.shadow(cu, cv, 2.0, 1.8, 0.26);
  const e0 = k.ell(cu, cv, 0.3, 1.9);
  const [tx, ty] = k.p(cu - 0.3, cv - 0.4, 2.6);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx, e0.cy);
  pen.bezierCurveTo(e0.cx - e0.rx * 1.05, ty + (e0.cy - ty) * 0.2, tx - e0.rx * 0.5, ty, tx, ty);
  pen.bezierCurveTo(tx + e0.rx * 0.6, ty, e0.cx + e0.rx * 1.05, ty + (e0.cy - ty) * 0.3, e0.cx + e0.rx, e0.cy);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(tx - e0.rx * 0.3, ty + (e0.cy - ty) * 0.3, 0, e0.cx, e0.cy, e0.rx * 1.3);
  g.addColorStop(0, shade(c, 0.2));
  g.addColorStop(0.6, c);
  g.addColorStop(1, shade(c, -0.25));
  k.paint(g, k.lw);
  // the dent where someone sat
  pen.beginPath();
  pen.ellipse(e0.cx + e0.rx * 0.1, (e0.cy + ty) / 2, e0.rx * 0.45, e0.ry * 0.5, 0, 0, Math.PI * 2);
  pen.fillStyle = shade(c, -0.12);
  pen.fill();
}

// ── entrance: the airlock ───────────────────────────────────────────────────
// A heavy airlock in a hazard-striped frame: two sliding leaves with round
// windows, the lock chamber and its outer hatch beyond, a beacon over the
// door, a keypad and a lever on one side and a spacesuit on its rack on
// the other. The leaves slide apart while someone comes or goes, the
// beacon turns, and the lock breathes out a puff of cold air.

const DOOR = { u0: 3.6, u1: 10.2, h: 15.6 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 21, (k) => {
      // the chamber beyond the opening: grey walls, red light, the hatch
      const out = -1.4;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]], k.vgrad(u0, out, 0, h, [[0, '#4a3040'], [1, '#2a1c2c']]), 0);
      fillPts(k, wallRing(k, (u0 + u1) / 2, out + 0.02, 6.5, 2.6, 24), '#6d7690', k.thin);
      fillPts(k, wallRing(k, (u0 + u1) / 2, out + 0.04, 6.5, 2.0, 24), '#4a5270', k.thin);
      k.rod([[(u0 + u1) / 2 - 1.2, out + 0.1, 6.5], [(u0 + u1) / 2 + 1.2, out + 0.1, 6.5]], C.yellow, 0.18);
      k.rod([[(u0 + u1) / 2, out + 0.1, 5.3], [(u0 + u1) / 2, out + 0.1, 7.7]], C.yellow, 0.18);
      k.halo((u0 + u1) / 2, out + 0.2, h - 2, 4, '#ff5468', 0.45);
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#3a3048', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#1d1828', 0);
      // the frame: hazard stripes round the opening
      hazard(k, [[u0 - 1.4, 0.4, 0], [u0, 0.4, 0], [u0, 0.4, h], [u0 - 1.4, 0.4, h]], 9);
      hazard(k, [[u1, 0.4, 0], [u1 + 1.4, 0.4, 0], [u1 + 1.4, 0.4, h], [u1, 0.4, h]], 9);
      hazard(k, [[u0 - 1.4, 0.4, h], [u1 + 1.4, 0.4, h], [u1 + 1.4, 0.4, h + 1.4], [u0 - 1.4, 0.4, h + 1.4]], 9);
      k.box(u0 - 1.6, 0, 0, 0.2, 0.4, h + 1.6, C.navy, { line: k.thin, stripe: false });
      k.box(u1 + 1.4, 0, 0, 0.2, 0.4, h + 1.6, C.navy, { line: k.thin, stripe: false });
      k.box(u0 - 1.6, 0, h + 1.4, u1 - u0 + 3.2, 0.5, 0.6, C.navy, { line: k.lw });
      // the beacon's housing over the door
      k.box((u0 + u1) / 2 - 0.9, 0, h + 2.0, 1.8, 0.8, 0.5, C.steelDark, { line: k.thin });
      // the threshold: a steel sill with hazard paint before it
      k.box(u0 - 0.2, 0, 0, u1 - u0 + 0.4, 0.7, 0.25, C.steel, { line: k.thin });
      hazard(k, [[u0 - 0.6, 3.6, 0.03], [u1 + 0.6, 3.6, 0.03], [u1 + 0.6, 0.8, 0.03], [u0 - 0.6, 0.8, 0.03]], 7, 0);
      // left: a keypad and a big lever, an extinguisher
      k.box(0.8, 0, 7.6, 1.8, 0.4, 2.6, C.white, { line: k.lw, round: 0.2 });
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) k.dot(1.25 + i * 0.45, 0.42, 8.2 + j * 0.55, 0.12, j === 2 && i === 2 ? C.green : '#9fb3c8');
      k.rod([[1.7, 0.1, 5.4], [1.7, 0.8, 5.4], [1.7, 0.9, 6.8]], C.red, 0.22);
      k.shadow(1.6, 1.4, 0.8, 0.7, 0.25);
      k.cyl(1.6, 1.3, 0, 0.55, 2.6, C.red);
      k.cyl(1.6, 1.3, 2.6, 0.25, 0.4, C.steelDark, { line: k.thin });
      // right: the spacesuit on its rack
      suit(k, 12.9, 0.5);
    });
    // the leaves: shut, or slid apart while someone passes
    const open = v.active ? 0.72 + 0.08 * Math.sin(v.t * 2.2) : 0;
    const half = (u1 - u0) / 2;
    const slide = half * open;
    leafDoor(k, u0, u0 + half - slide, h, false);
    leafDoor(k, u0 + half + slide, u1, h, true);
    // the beacon: dim, or turning red
    const [bx, by] = k.p((u0 + u1) / 2, 0.4, h + 2.9);
    const br = 0.6 * k.s;
    k.pen.beginPath();
    k.pen.ellipse(bx, by, br, br * 0.8, 0, 0, Math.PI * 2);
    k.paint(v.active ? '#ff6a78' : '#8a3a44', k.thin);
    if (v.active) {
      const a = v.t * 6;
      const pen = k.pen;
      pen.beginPath();
      pen.moveTo(bx, by);
      pen.arc(bx, by, br * 4, a, a + 0.6);
      pen.closePath();
      pen.fillStyle = '#ff6a7844';
      pen.fill();
      k.halo((u0 + u1) / 2, 0.4, h + 2.9, 2.6, '#ff5468', 0.5);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // cold air puffing out of the lock
    const n = due(v.t, dt, 4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'smoke', x: (DOOR.u0 + DOOR.u1) / 2 + j(1) * 3, y: 0.8 + j(2), z: 0.6 + (j(3) + 0.5) * 3, vx: j(4) * 0.8, vy: 1.4 + j(5), vz: 0.3, life: 1.3, color: [214, 228, 244], glow: false, gravity: 0 });
    }
  },
};

// One sliding leaf from a0 to a1: white with an orange stripe, a round
// window, the meeting edge in chevrons.
function leafDoor(k: Kit, a0: number, a1: number, h: number, right: boolean): void {
  if (a1 - a0 < 0.15) return;
  const n = 0.3;
  k.poly([[a0, n, 0.25], [a1, n, 0.25], [a1, n, h], [a0, n, h]], k.vgrad(a0, n, 0, h, [[0, k.side('#d3dae5', 0, 1, 0.1)], [1, k.side('#eef2f7', 0, 1, 0.1)]]), k.lw);
  const w = a1 - a0;
  const mid = right ? a0 + w * 0.42 : a1 - w * 0.42;
  k.poly([[a0, n + 0.01, 5.2], [a1, n + 0.01, 5.2], [a1, n + 0.01, 6.0], [a0, n + 0.01, 6.0]], C.orange, 0);
  if (w > 1.6) {
    fillPts(k, wallRing(k, mid, n + 0.02, 10.6, 1.05, 18), C.steel, k.thin);
    fillPts(k, wallRing(k, mid, n + 0.03, 10.6, 0.75, 18), '#3a2a3c', k.thin);
    k.halo(mid, n, 10.6, 0.9, '#ff5468', 0.35);
  }
  // the meeting edge
  const e = right ? a0 : a1;
  k.line([[e, n + 0.02, 0.4], [e, n + 0.02, h - 0.2]], C.steelDark, Math.max(1, 0.25 * k.s));
  rivets(k, [[a0 + 0.3, n + 0.02, 1.0], [a1 - 0.3, n + 0.02, 1.0], [a0 + 0.3, n + 0.02, h - 0.6], [a1 - 0.3, n + 0.02, h - 0.6]]);
}

// A spacesuit hung flat on the wall by the door: helmet with a gold visor,
// white suit with orange bands, a chest pack, gloves and boots, a soft
// shadow on the wall behind it.
function suit(k: Kit, cu: number, n: number): void {
  const parts = (dn: number, da: number, dz: number): Array<{ pts: P3[]; c: Color; r: number }> => {
    const R = (a0: number, z0: number, a1: number, z1: number, c: Color, r: number) => ({ pts: [[cu + a0 + da, n + dn, z0 + dz], [cu + a1 + da, n + dn, z0 + dz], [cu + a1 + da, n + dn, z1 + dz], [cu + a0 + da, n + dn, z1 + dz]] as P3[], c, r });
    return [
      R(-2.5, 7.0, -1.5, 11.0, C.white, 0.45), // arms
      R(1.5, 7.0, 2.5, 11.0, C.white, 0.45),
      R(-2.55, 6.1, -1.45, 7.1, C.steelDark, 0.4), // gloves
      R(1.45, 6.1, 2.55, 7.1, C.steelDark, 0.4),
      R(-1.3, 2.6, -0.1, 7.6, C.white, 0.4), // legs
      R(0.1, 2.6, 1.3, 7.6, C.white, 0.4),
      R(-1.4, 1.6, -0.05, 2.8, C.steelDark, 0.35), // boots
      R(0.05, 1.6, 1.4, 2.8, C.steelDark, 0.35),
      R(-1.6, 6.8, 1.6, 11.8, C.white, 0.8), // torso
    ];
  };
  // its shadow on the wall, then the suit
  for (const p of parts(0, 0.35, -0.35)) k.poly(p.pts, '#05081830', 0, p.r);
  k.rod([[cu - 1.2, n - 0.4, 13.4], [cu, n - 0.4, 14.2], [cu + 1.2, n - 0.4, 13.4]], C.steel, 0.1);
  for (const p of parts(0, 0, 0)) k.poly(p.pts, k.side(p.c, 0, 1, 0.1), k.lw, p.r);
  // bands, the chest pack and its lights
  for (const [a0, a1, z] of [[-2.5, -1.5, 8.2], [1.5, 2.5, 8.2], [-1.3, -0.1, 4.2], [0.1, 1.3, 4.2]] as const) k.rect(cu + a0 + 0.08, z, cu + a1 - 0.08, z + 0.5, n + 0.02, C.orange, 0);
  k.rect(cu - 0.9, 8.9, cu + 0.9, 10.5, n + 0.03, '#3f6096', k.thin, 0.2);
  k.dot(cu - 0.45, n + 0.04, 9.7, 0.14, C.red);
  k.dot(cu + 0.05, n + 0.04, 9.7, 0.14, C.green);
  k.dot(cu + 0.5, n + 0.04, 9.7, 0.14, C.amber);
  // the helmet: a white dome, a gold visor with a glint
  fillPts(k, wallRing(k, cu, n + 0.05, 12.9, 1.45, 20), C.white, k.lw);
  fillPts(k, wallRing(k, cu, n + 0.07, 12.85, 1.0, 20), k.vgrad(cu, n, 11.8, 13.9, [[0, '#a8742a'], [1, '#f0c060']]), k.thin);
  k.line([[cu - 0.55, n + 0.08, 13.0], [cu - 0.2, n + 0.08, 13.5]], '#fff6d8', Math.max(0.8, 0.18 * k.s));
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
