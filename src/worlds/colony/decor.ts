import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { ball, barrel, bookRow, crate, frustum, leaf, logU, sack, sprout } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf, withAlpha } from './kit.ts';

// The colony's furniture between the stations, the way a frontier colony
// fills its rooms: a sick bay's bed under a blue blanket with a monitor at
// its head, a colonist's bed and its chest, a shelf of stores, a workbench
// with its tools laid flat, a cooking stove, hydroponic racks under grow
// lights, neat stacks of logs and steel, supply crates, standing lamps
// with round glowing bulbs, a long plank table to eat at, potted plants, a
// bank of batteries, a sculpture on a plinth for the room's art, and a
// little turret. All still
// (drawn once into the scene's static layer), each on its own soft shadow,
// varied by seed. The shell draws the floor each stands on: white tile
// under the sick bay, a stockpile's dashed outline under the stacks.

// ── the sick bay ────────────────────────────────────────────────────────────
// A steel-framed hospital bed along the wall, white sheets and a pillow, a
// blue blanket, grey rails, and at its head a vitals monitor on a wheeled
// stand, a pulse running across its screen.

const BED0 = 2.8; // the hospital bed's head end (u)
const BED1 = 11.6; // its foot end
const RAIL = '#b4bcc2';

const hospital: PropArt = {
  len: 12,
  dep: 5,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6.4, 2.6, 6.2, 2.6, 0.26);
    monitor(k, 1.3, 2.0);
    const [w0, w1] = [0.6, 4.3];
    // the head frame (tubes) behind the pillow
    for (const w of [w0, w1]) k.rod([[BED0, w, 0.2], [BED0, w, 4.6]], RAIL, 0.22);
    k.rod([[BED0, w0, 4.6], [BED0, w1, 4.6]], RAIL, 0.22);
    for (const w of [1.5, 2.45, 3.4]) k.rod([[BED0, w, 2.9], [BED0, w, 4.5]], RAIL, 0.12);
    // legs on casters, the frame under the mattress
    for (const [u, w] of [[BED0 + 0.3, w1], [BED1 - 0.3, w1], [BED1 - 0.3, w0]] as const) {
      k.rod([[u, w, 0.35], [u, w, 1.9]], RAIL, 0.18);
      k.disc(u, w, 0.22, 0.24, C.iron, k.thin);
    }
    k.box(BED0, w0, 1.8, BED1 - BED0, w1 - w0, 0.3, RAIL, { line: k.thin, stripe: false });
    // the mattress in its sheet, the pillow, the blanket and its turned-down sheet
    k.box(BED0 + 0.1, w0, 2.1, BED1 - BED0 - 0.2, w1 - w0, 0.85, C.white, { round: 0.25 });
    k.box(BED0 + 0.35, w0 + 0.3, 2.95, 2.0, w1 - w0 - 0.6, 0.6, C.pillow, { round: 0.3 });
    const b0 = BED0 + 2.7;
    k.box(b0, w0 - 0.1, 2.6, BED1 - 0.15 - b0, w1 - w0 + 0.2, 0.55, C.blanketSick, { round: 0.2 });
    k.box(b0, w0 - 0.1, 3.05, 0.8, w1 - w0 + 0.2, 0.18, C.white, { round: 0.08, line: k.thin });
    if (k.fine) for (let u = b0 + 1.4; u < BED1 - 0.4; u += 1.2) k.line([[u, w1 + 0.12, 2.7], [u, w1 + 0.12, 3.1]], shade(C.blanketSick, -0.25), 0.06 * k.s);
    // a grey guard rail along the front by the pillow
    for (const u of [BED0 + 0.7, BED0 + 3.6]) k.rod([[u, w1 + 0.2, 2.0], [u, w1 + 0.2, 3.7]], RAIL, 0.14);
    k.rod([[BED0 + 0.5, w1 + 0.2, 3.7], [BED0 + 3.8, w1 + 0.2, 3.7]], RAIL, 0.18);
    // the foot rail
    k.rod([[BED1, w0, 0.3], [BED1, w0, 3.5], [BED1, w1, 3.5], [BED1, w1, 0.3]], RAIL, 0.22);
    k.rod([[BED1, w0, 2.7], [BED1, w1, 2.7]], RAIL, 0.12);
  },
};

// The vitals monitor on its stand at (cu, cv): a star of casters, a pole,
// a pale case with a dark screen facing the room, a green pulse across it.
function monitor(k: Kit, cu: number, cv: number): void {
  k.shadow(cu, cv, 1.1, 0.9, 0.24);
  for (const a of [0.4, 2.0, 3.6, 5.2]) {
    const [eu, ev] = [cu + Math.cos(a) * 0.9, cv + Math.sin(a) * 0.8];
    k.rod([[cu, cv, 0.4], [eu, ev, 0.3]], C.steelDark, 0.14);
    k.disc(eu, ev, 0.12, 0.18, C.iron, k.thin * 0.8);
  }
  k.rod([[cu, cv, 0.3], [cu, cv, 5.6]], RAIL, 0.2);
  // the case: a rounded box, the screen on its front
  const [u0, u1, f] = [cu - 1.05, cu + 1.05, cv + 0.7];
  k.box(u0, cv - 0.6, 5.5, u1 - u0, 1.3, 1.95, '#dfe3df', { round: 0.2 });
  k.poly([[u0 + 0.22, f + 0.01, 5.75], [u1 - 0.22, f + 0.01, 5.75], [u1 - 0.22, f + 0.01, 7.2], [u0 + 0.22, f + 0.01, 7.2]], '#163020', k.thin);
  const pulse: P3[] = [];
  for (const [du, dz] of [[0, 0.65], [0.55, 0.65], [0.7, 1.05], [0.85, 0.25], [1.0, 0.8], [1.12, 0.65], [1.7, 0.65]] as const) pulse.push([u0 + 0.3 + du, f + 0.02, 5.75 + dz]);
  k.line(pulse, '#7cf09a', Math.max(0.9, 0.12 * k.s));
  k.halo(cu, f + 0.2, 6.45, 1.0, '#7cf09a', 0.2);
  // a light and a knob on the case's end
  k.disc(u1 + 0.01, cv - 0.1, 6.9, 0.14, '#f06a4a', 0);
}

// ── a colonist's bed and chest ───────────────────────────────────────────────
// A plank bed against the wall: a headboard, a white pillow, a green
// blanket with its sheet turned down, and at its foot a wooden chest with
// iron bands.

const bed: PropArt = {
  len: 12,
  dep: 5,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 2.5, 6.2, 2.6, 0.26);
    const wood = C.plankLight;
    const [w0, w1] = [0.4, 4.4];
    // the headboard, the rails and the legs
    k.box(0.3, w0, 0, 0.6, w1 - w0, 4.0, wood, { round: 0.15 });
    k.box(0.9, w0, 0.6, 8.3, w1 - w0, 1.0, shade(wood, -0.08), { stripe: false });
    for (const w of [w0, w1 - 0.5]) k.box(8.7, w, 0, 0.5, 0.5, 0.7, C.plankDark, { line: k.thin });
    // the mattress, the pillow, the blanket and its turned-down sheet
    k.box(0.9, w0 + 0.15, 1.6, 8.2, w1 - w0 - 0.3, 0.85, C.white, { round: 0.25 });
    k.box(1.15, w0 + 0.45, 2.45, 1.9, w1 - w0 - 0.9, 0.55, C.pillow, { round: 0.3 });
    const blanket = hash(v.seed, 1) < 0.6 ? C.blanket : '#8a4a3a';
    k.box(3.3, w0 + 0.05, 2.1, 5.9, w1 - w0 - 0.1, 0.55, blanket, { round: 0.2 });
    k.box(3.3, w0 + 0.05, 2.55, 0.8, w1 - w0 - 0.1, 0.18, C.white, { round: 0.08, line: k.thin });
    // the footboard
    k.box(9.1, w0, 0, 0.5, w1 - w0, 2.9, wood, { round: 0.12 });
    // the chest: a box with iron bands and a lock
    const [c0, c1] = [10.0, 11.8];
    k.box(c0, 0.8, 0, c1 - c0, 3.0, 2.2, '#9a6a3e', { stripe: false });
    k.box(c0 - 0.05, 0.75, 2.2, c1 - c0 + 0.1, 3.1, 0.5, '#a8784a', { round: 0.2 });
    const bands: Array<[P3, P3]> = [];
    for (const w of [1.4, 3.2]) bands.push([[c1 + 0.02, w, 0.1], [c1 + 0.02, w, 2.65]]);
    bands.push([[c0 + 0.1, 3.82, 2.25], [c1 - 0.1, 3.82, 2.25]]);
    k.segs(bands, INK, Math.max(1.2, 0.2 * k.s + k.thin));
    k.segs(bands, C.iron, Math.max(0.7, 0.2 * k.s));
    k.poly([[c0 + 0.65, 3.82, 1.55], [c0 + 1.15, 3.82, 1.55], [c0 + 1.15, 3.82, 2.15], [c0 + 0.65, 3.82, 2.15]], '#c9a450', k.thin);
  },
};

// ── a shelf of stores ───────────────────────────────────────────────────────
// A plank shelving unit against the wall: crates and a sack below, jars
// and folded cloth in the middle, books and a basket on top.

const shelf: PropArt = {
  len: 8,
  dep: 3,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 1.6, 4.4, 1.8, 0.28);
    const wood = C.plank;
    // the back boards
    k.box(0.3, 0, 0, 7.4, 0.3, 9.6, shade(wood, -0.12), { stripe: false });
    // bottom: two crates and a sack
    k.box(0.6, 0.3, 0, 6.8, 2.5, 0.4, wood, { line: k.thin });
    crate(k, 0.9, 0.6, 0.4, 2.3, 2.0, 2.1, C.plankLight);
    crate(k, 3.4, 0.7, 0.4, 1.9, 1.9, 1.7, shade(C.plankLight, 0.06));
    sack(k, 6.1, 1.6, 0.4, 0.8, 1.9, v.seed);
    // middle: jars of preserves and folded cloth
    k.box(0.6, 0.3, 3.3, 6.8, 2.5, 0.35, wood, { line: k.thin });
    const jars: Color[] = ['#c0503a', '#d9a440', '#6a9a4a'];
    jars.forEach((c, i) => {
      const u = 1.3 + i * 1.15;
      k.cyl(u, 1.5, 3.65, 0.48, 1.5, '#dce8e0', { line: k.thin });
      k.cyl(u, 1.5, 3.7, 0.4, 1.0, c, { line: 0 });
      k.cyl(u, 1.5, 5.12, 0.5, 0.25, C.plankDark, { line: k.thin });
    });
    const cloth: Color[] = [C.clothBlue, C.canvas, C.cloth];
    cloth.forEach((c, i) => k.box(4.9 + i * 0.06, 0.8, 3.65 + i * 0.5, 2.2 - i * 0.1, 1.7, 0.5, c, { line: k.thin, round: 0.12 }));
    // top: books and a basket
    k.box(0.6, 0.3, 6.3, 6.8, 2.5, 0.35, wood, { line: k.thin });
    bookRow(k, 0.9, 4.6, 1.9, 6.65, 2.5, v.seed);
    k.box(4.9, 0.8, 6.65, 2.2, 1.8, 1.2, '#c8a060', { round: 0.3 });
    if (k.fine) for (let u = 5.2; u < 7.0; u += 0.4) k.line([[u, 2.62, 6.75], [u, 2.62, 7.75]], '#8a6a3a', 0.05 * k.s);
    k.box(0.6, 0.3, 9.3, 6.8, 2.5, 0.35, wood, { line: k.thin });
    // the uprights at either end
    for (const u of [0.3, 7.2]) k.box(u, 0.3, 0, 0.5, 2.6, 9.7, shade(wood, 0.04), { round: 0.08 });
  },
};

// ── hydroponics ─────────────────────────────────────────────────────────────
// A steel rack of two trays of seedlings, each under a violet grow-light
// strip.
const hydro: PropArt = {
  len: 9,
  dep: 4,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4.5, 2.1, 4.8, 2.2, 0.26);
    // the back legs, the trays and their lights, then the front legs
    for (const u of [0.6, 8.2]) k.box(u, 0.5, 0, 0.3, 0.3, 6.7, C.steelDark, { line: k.thin });
    for (const z of [1.4, 4.1]) tray(k, z, v.seed + z);
    lightStrip(k, 3.55);
    lightStrip(k, 6.45);
    for (const u of [0.6, 8.2]) k.box(u, 3.2, 0, 0.3, 0.3, 6.7, C.steelDark, { line: k.thin });
    // a hose and a can of water on the floor
    k.cyl(7.6, 3.6, 0, 0.45, 0.9, '#5f8a4a', { line: k.thin });
    k.rod([[7.9, 3.6, 0.7], [8.3, 3.6, 1.1]], '#5f8a4a', 0.1);
  },
};

// A tray of soil on the rack at z, rows of seedlings in it.
function tray(k: Kit, z: number, seed: number): void {
  k.box(0.7, 0.6, z, 7.8, 2.9, 0.55, '#c8ccd0', { line: k.lw });
  k.poly([[0.95, 0.85, z + 0.56], [8.25, 0.85, z + 0.56], [8.25, 3.25, z + 0.56], [0.95, 3.25, z + 0.56]], '#4a3424', k.thin);
  for (let r = 0; r < 2; r++) {
    for (let i = 0; i < 6; i++) {
      sprout(k, 1.55 + i * 1.2, 1.5 + r * 1.1, z + 0.58, 0.75 + hash(seed, r * 6 + i, 3) * 0.45, seed * 31 + r * 6 + i, i & 1 ? [C.green, C.leaf] : [C.leaf, '#9ad86a']);
    }
  }
}

// A grow-light bar along the rack at z: a steel case, a violet underside,
// the violet light falling on the tray below.
function lightStrip(k: Kit, z: number): void {
  k.box(0.9, 1.6, z, 7.4, 0.9, 0.35, C.steel, { line: k.thin });
  k.poly([[1.0, 1.65, z - 0.01], [8.2, 1.65, z - 0.01], [8.2, 2.45, z - 0.01], [1.0, 2.45, z - 0.01]], C.grow, 0);
  k.line([[1.0, 2.52, z + 0.05], [8.2, 2.52, z + 0.05]], '#e0c8ff', Math.max(0.8, 0.12 * k.s));
  k.pool(4.6, 2.0, 3.6, 1.4, C.grow, 0.3, z - 1.9);
  k.halo(4.6, 2.4, z - 0.2, 2.2, C.grow, 0.22);
}

// ── a stack of logs, or of steel bars ───────────────────────────────────────
// Which by the piece's place in DECOR, so the room's two stacks are one of
// each: the stage seeds each piece of decor from its index
// (hashString(`colony:decor:${n}`)), and that hash keeps the parity of the
// index's last digit in its lowest bit, so two pieces one after the other
// never match.
const stack: PropArt = {
  len: 6,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2, 3.2, 2.2, 0.28);
    if (v.seed & 1) {
      // logs in a pyramid, their sawn ends to the +u side
      for (const [cv, cz, r] of [[0.85, 0.6, 0.6], [2.05, 0.6, 0.6], [3.2, 0.6, 0.58], [1.45, 1.62, 0.58], [2.65, 1.62, 0.58], [2.05, 2.6, 0.56]] as const) {
        logU(k, 0.4 + hash(v.seed, cv * 10, 2) * 0.3, 5.4 + hash(v.seed, cz * 10 + cv, 3) * 0.3, cv, cz, r, hash(v.seed, cv, cz) < 0.5 ? C.log : '#6a4a2e');
      }
      // a hatchet in the top
      k.rod([[3.6, 2.2, 3.1], [4.6, 2.9, 4.3]], '#b07a44', 0.16);
      k.poly([[3.2, 1.8, 2.9], [3.9, 2.2, 3.4], [3.8, 2.5, 2.9], [3.3, 2.2, 2.7]], C.steel, k.thin);
    } else {
      // steel bars in crossed layers on two timber skids
      for (const w of [0.6, 3.0]) k.box(0.4, w, 0, 5.2, 0.6, 0.45, C.plankDark, { line: k.thin });
      let z = 0.45;
      for (let layer = 0; layer < 4; layer++) {
        if (layer % 2 === 0) {
          for (let i = 0; i < 4; i++) bar(k, 0.5, 0.5 + i * 0.85, z, 5.0, 0.7, 0.5, i);
        } else {
          for (let i = 0; i < 5; i++) bar(k, 0.7 + i * 1.0, 0.5, z, 0.75, 3.3, 0.5, i + 7);
        }
        z += 0.5;
      }
      // a strap round the stack
      k.line([[3.3, 3.9, 0.45], [3.3, 3.9, z], [3.3, 0.5, z]], '#3f6a9a', Math.max(0.9, 0.16 * k.s));
    }
  },
};

// One steel bar: a long box, its colour stepped by seed.
function bar(k: Kit, u: number, v: number, z: number, du: number, dv: number, dz: number, n: number): void {
  k.box(u, v, z, du, dv, dz, n % 3 === 0 ? '#aab2b8' : n % 3 === 1 ? C.ingot : '#8e979e', { line: k.thin, stripe: true });
}

// ── a workbench ─────────────────────────────────────────────────────────────
// A wide plank table with its tools laid flat on it: a board being worked,
// a saw, a hammer, a plane and a square, curls of shavings, a vice at the
// end; offcuts leaning underneath.

const WZ = 4.0; // the bench top

const workbench: PropArt = {
  len: 10,
  dep: 4,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(5, 2.1, 5.4, 2.3, 0.28);
    const wood = C.plankLight;
    // offcuts leaning on the wall under it, the legs and a shelf board
    for (const [u, c] of [[1.4, C.plank], [2.1, '#c08a58'], [2.7, C.plankDark]] as const) k.poly([[u, 0.2, 0], [u + 0.5, 0.2, 0], [u + 0.2, 0.15, 3.3], [u - 0.3, 0.15, 3.3]], c, k.thin);
    for (const [u, w] of [[0.6, 0.5], [8.9, 0.5], [0.6, 3.0], [8.9, 3.0]] as const) k.box(u, w, 0, 0.5, 0.5, WZ - 0.45, C.plankDark, { line: k.thin });
    k.box(0.8, 0.6, 0.9, 8.4, 2.9, 0.3, shade(wood, -0.1), { line: k.thin, stripe: false });
    k.box(0.3, 0.3, WZ - 0.45, 9.4, 3.4, 0.45, wood);
    if (k.s >= 4) k.segs([[[0.35, 1.43, WZ + 0.01], [9.65, 1.43, WZ + 0.01]], [[0.35, 2.57, WZ + 0.01], [9.65, 2.57, WZ + 0.01]]], withAlpha(INK, 0.4), Math.max(0.6, 0.08 * k.s));
    // the board being worked, with curls of shavings by it
    k.box(1.0, 0.8, WZ, 5.2, 1.0, 0.3, '#d8a870', { line: k.thin });
    if (k.fine) {
      for (const [u, w] of [[6.6, 1.0], [7.0, 1.5], [6.4, 1.8]] as const) k.disc(u, w, WZ + 0.05, 0.22, '#f0d0a0', k.thin * 0.6);
    }
    // the saw: a blade tapering to its toe, a grip at the heel
    k.poly([[1.2, 2.2, WZ + 0.02], [4.2, 2.0, WZ + 0.02], [4.2, 2.7, WZ + 0.02], [1.2, 2.5, WZ + 0.02]], '#d8dce0', k.thin);
    k.poly([[4.1, 1.85, WZ + 0.05], [5.0, 1.85, WZ + 0.05], [5.0, 2.85, WZ + 0.05], [4.1, 2.85, WZ + 0.05]], C.plank, k.thin);
    // the hammer, the plane and the square
    k.rod([[5.4, 3.2, WZ + 0.12], [7.1, 2.6, WZ + 0.12]], '#b07a44', 0.2);
    k.box(6.9, 2.2, WZ, 0.5, 1.0, 0.35, C.iron, { line: k.thin });
    k.box(7.6, 1.0, WZ, 1.4, 0.6, 0.5, '#8a5a35', { round: 0.12, line: k.thin });
    k.cyl(7.9, 1.3, WZ + 0.5, 0.18, 0.35, '#c08a58', { line: k.thin });
    k.poly([[1.6, 3.0, WZ + 0.02], [3.4, 3.0, WZ + 0.02], [3.4, 3.25, WZ + 0.02], [1.85, 3.25, WZ + 0.02], [1.85, 3.6, WZ + 0.02], [1.6, 3.6, WZ + 0.02]], C.steel, k.thin * 0.8);
    // the vice on the end
    k.box(8.7, 1.0, WZ, 1.0, 1.4, 0.9, C.steelDark, { line: k.thin });
    k.rod([[9.2, 2.4, WZ + 0.45], [9.2, 3.2, WZ + 0.45]], C.iron, 0.12);
    k.rod([[8.9, 3.2, WZ + 0.45], [9.5, 3.2, WZ + 0.45]], C.iron, 0.1);
  },
};

// ── a cooking stove ─────────────────────────────────────────────────────────
// An iron stove on short legs, its firebox glowing through the grate, a
// pot and a kettle on the plate, the stovepipe up into the wall; a box of
// split wood beside it.

const stove: PropArt = {
  len: 7,
  dep: 4,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.6, 2.1, 3.8, 2.2, 0.28);
    const iron = '#45423f';
    // the stovepipe, up from the back and into the wall
    k.rod([[5.9, 1.2, 3.8], [5.9, 1.2, 8.6], [5.9, 0.2, 9.4]], '#55524e', 0.55);
    // the box of split wood
    k.box(0.3, 0.6, 0, 2.0, 2.6, 1.6, C.plankDark, { stripe: false });
    for (const [w, z] of [[1.2, 1.75], [2.2, 1.75], [1.7, 2.35]] as const) logU(k, 0.4, 2.2, w, z, 0.42, '#7a5232');
    // legs, the body, the plate
    for (const [u, w] of [[2.9, 0.9], [6.3, 0.9], [2.9, 3.3], [6.3, 3.3]] as const) k.box(u - 0.15, w - 0.15, 0, 0.3, 0.3, 0.7, iron, { line: k.thin });
    k.box(2.6, 0.6, 0.6, 4.0, 3.0, 3.0, iron, { round: 0.15 });
    k.box(2.45, 0.45, 3.6, 4.3, 3.3, 0.3, '#5a5652', { line: k.lw });
    // the firebox door, glowing through its grate, and the oven door
    k.poly([[3.0, 3.61, 1.1], [4.6, 3.61, 1.1], [4.6, 3.61, 3.0], [3.0, 3.61, 3.0]], '#2e2c2a', k.thin);
    const slits: Array<[P3, P3]> = [];
    for (let z = 1.45; z < 2.8; z += 0.4) slits.push([[3.25, 3.63, z], [4.35, 3.63, z]]);
    k.segs(slits, '#ff9a3a', Math.max(1, 0.18 * k.s));
    k.halo(3.8, 3.8, 2.0, 1.8, '#ff9a48', 0.4);
    k.poly([[4.9, 3.61, 1.0], [6.3, 3.61, 1.0], [6.3, 3.61, 3.1], [4.9, 3.61, 3.1]], shade(iron, 0.06), k.thin);
    k.rod([[5.2, 3.75, 2.7], [6.0, 3.75, 2.7]], '#c9a450', 0.12);
    // the pot and the kettle
    k.cyl(3.7, 1.9, 3.9, 0.85, 1.1, '#8a8f94');
    k.disc(3.7, 1.9, 5.0, 0.7, '#6a6f74', k.thin);
    k.cyl(3.7, 1.9, 5.0, 0.15, 0.2, C.iron, { line: k.thin });
    k.cyl(5.5, 2.4, 3.9, 0.6, 0.85, '#c06a3a');
    k.rod([[5.0, 2.6, 4.4], [4.6, 2.9, 4.9]], '#c06a3a', 0.16);
    k.rod([[5.2, 2.4, 4.9], [5.5, 2.4, 5.35], [5.8, 2.4, 4.9]], INK, 0.08);
  },
};

// ── supply crates ───────────────────────────────────────────────────────────
// Crates stacked two high and a barrel or a sack beside them.

const crates: PropArt = {
  len: 5,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.0, 2.7, 2.2, 0.28);
    crate(k, 0.3, 0.3, 0, 2.4, 2.4, 2.2, C.plankLight);
    crate(k, 2.9, 0.3, 0, 1.8, 1.8, 1.8, shade(C.plankLight, 0.06));
    crate(k, 0.55, 0.5, 2.2, 1.9, 1.9, 1.8, shade(C.plankLight, -0.05));
    if (hash(v.seed, 3) < 0.5) barrel(k, 3.7, 3.0, 0, 0.75, 2.3, C.plank);
    else sack(k, 3.6, 3.0, 0, 0.75, 1.8, v.seed);
    sack(k, 1.4, 3.25, 0, 0.6, 1.4, v.seed + 1, '#bfa47a');
  },
};

// ── a bank of batteries ─────────────────────────────────────────────────────
// Two upright power cells, a green bar showing each one's charge, a cable
// between their terminals and off to the wall.

const battery: PropArt = {
  len: 4,
  dep: 3,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2, 1.6, 2.2, 1.6, 0.28);
    k.line([[3.0, 1.2, 4.35], [3.0, 0.1, 4.0], [3.0, 0.1, 0.4]], INK, Math.max(1.2, 0.2 * k.s + k.thin));
    k.line([[3.0, 1.2, 4.35], [3.0, 0.1, 4.0], [3.0, 0.1, 0.4]], '#3a3a42', Math.max(0.8, 0.2 * k.s));
    for (const [i, u0] of [0.35, 2.15].entries()) {
      k.box(u0, 0.5, 0, 1.5, 2.0, 4.0, '#a6acb2', { round: 0.15 });
      const charge = 0.45 + hash(v.seed, i, 5) * 0.5;
      const [a0, a1, z0, z1] = [u0 + 0.45, u0 + 1.05, 0.8, 3.3];
      k.poly([[a0, 2.51, z0], [a1, 2.51, z0], [a1, 2.51, z1], [a0, 2.51, z1]], '#20282a', k.thin);
      k.poly([[a0 + 0.08, 2.52, z0 + 0.08], [a1 - 0.08, 2.52, z0 + 0.08], [a1 - 0.08, 2.52, z0 + (z1 - z0) * charge], [a0 + 0.08, 2.52, z0 + (z1 - z0) * charge]], '#7cf06a', 0);
      for (const [du, c] of [[0.4, '#d0503a'], [1.1, '#3a3a42']] as const) k.cyl(u0 + du, 1.2, 4.0, 0.18, 0.3, c, { line: k.thin });
    }
    k.rod([[1.45, 1.2, 4.35], [2.55, 1.2, 4.35]], '#3a3a42', 0.14);
  },
};

// ── a standing lamp ─────────────────────────────────────────────────────────
// A cone of a foot, a thin pole and a round bulb on top, glowing warm
// (the shell lays its light on the floor round it).

export const BULB_Z = 11.6; // the bulb's centre, over the lamp's middle

const lamp: PropArt = {
  len: 3,
  dep: 3,
  height: 14,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 1.5;
    k.shadow(c, c, 1.3, 1.3, 0.3);
    frustum(k, c, c, 0, 1.0, 1.1, 0.42, '#7a7e84');
    k.rod([[c, c, 0.9], [c, c, BULB_Z - 1.0]], '#8a9096', 0.2);
    // a collar under the bulb, the bulb, its soft glow
    k.cyl(c, c, BULB_Z - 1.25, 0.42, 0.45, '#6a6e74', { line: k.thin });
    k.halo(c, c, BULB_Z, 3.2, '#ffd27a', 0.42);
    ball(k, c, c, BULB_Z, 0.95, C.bulb, k.thin);
    k.halo(c, c, BULB_Z, 1.4, '#fffbe0', 0.55);
    const [x, y] = k.p(c, c, BULB_Z);
    k.pen.beginPath();
    k.pen.ellipse(x - 0.32 * k.s, y - 0.3 * k.s, 0.22 * k.s, 0.16 * k.s, -0.6, 0, Math.PI * 2);
    k.pen.fillStyle = '#ffffffcc';
    k.pen.fill();
  },
};

// ── a long plank table ──────────────────────────────────────────────────────
// Where the colony eats: a plank table on trestle legs, a bench along
// either side, plates and mugs and a jug laid on it.

const TZ = 3.6; // the table top

const table: PropArt = {
  len: 11,
  dep: 6,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(5.5, 3, 5.8, 3.0, 0.26);
    const wood = C.plank;
    bench(k, 0.35, wood);
    // trestle legs and a stretcher, then the top of three planks
    for (const u of [1.6, 9.4]) {
      k.box(u - 0.3, 1.9, 0, 0.6, 2.2, 0.4, C.plankDark, { line: k.thin });
      k.box(u - 0.25, 2.75, 0.4, 0.5, 0.5, TZ - 0.9, C.plankDark, { line: k.thin });
    }
    k.box(1.6, 2.8, 1.4, 7.8, 0.4, 0.4, C.plankDark, { line: k.thin, stripe: false });
    k.box(0.7, 1.6, TZ - 0.5, 9.6, 2.8, 0.5, wood);
    if (k.fine || k.s >= 4) k.segs([[[0.75, 2.53, TZ + 0.01], [10.25, 2.53, TZ + 0.01]], [[0.75, 3.47, TZ + 0.01], [10.25, 3.47, TZ + 0.01]]], withAlpha(INK, 0.45), Math.max(0.6, 0.08 * k.s));
    // plates, mugs, a jug and a bowl of fruit
    for (const [u, w] of [[2.3, 2.1], [5.0, 3.6], [8.2, 2.2]] as const) {
      k.disc(u, w, TZ + 0.02, 0.62, '#efe9dc', k.thin);
      k.disc(u, w, TZ + 0.04, 0.32, hash(v.seed, u * 3) < 0.5 ? '#c8783a' : '#8ab062', 0);
    }
    for (const [u, w] of [[3.4, 3.7], [7.0, 2.0]] as const) k.cyl(u, w, TZ, 0.26, 0.55, '#9aa3ab', { line: k.thin });
    k.cyl(6.3, 2.5, TZ, 0.45, 1.3, '#c06a3a', { line: k.thin });
    k.disc(6.3, 2.5, TZ + 1.3, 0.3, '#5a3a22', 0);
    k.disc(9.3, 3.5, TZ + 0.02, 0.62, '#b8864a', k.thin);
    for (const [du, dw, c] of [[-0.2, -0.1, '#c0503a'], [0.22, 0.05, '#e8b040'], [0, 0.2, '#7cc04a']] as const) ball(k, 9.3 + du, 3.5 + dw, TZ + 0.32, 0.26, c, k.thin * 0.8);
    bench(k, 4.75, wood);
  },
};

// A plank bench along u at v = w: a seat on two legs.
function bench(k: Kit, w: number, wood: Color): void {
  for (const u of [1.6, 9.4]) k.box(u - 0.25, w + 0.15, 0, 0.5, 0.6, 1.9, C.plankDark, { line: k.thin });
  k.box(1.0, w, 1.9, 9.0, 0.9, 0.4, shade(wood, 0.06));
}

// ── a potted plant ──────────────────────────────────────────────────────────
// A clay pot with a leafy plant in it, flowering on some.

const pot: PropArt = {
  len: 3,
  dep: 3,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 1.5;
    k.shadow(c, c, 1.2, 1.2, 0.28);
    frustum(k, c, c, 0, 1.6, 0.75, 1.0, '#b8643a');
    k.disc(c, c, 1.6, 0.85, '#4a3122', 0);
    const [x, y] = k.p(c, c, 1.65);
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + (hash(v.seed, i, 2) - 0.5) * 0.2;
      const L = (2.4 + hash(v.seed, i, 3) * 1.0) * k.s;
      leaf(k, x, y, a, L, L * 0.24, i % 3 === 0 ? C.leaf : i % 3 === 1 ? C.green : '#4f8a3a', k.fine);
    }
    if (hash(v.seed, 5) < 0.6) {
      const flower = hash(v.seed, 6) < 0.5 ? '#f0d040' : '#e86a8a';
      for (const [du, dz] of [[-0.6, 3.2], [0.5, 3.6], [0.05, 2.7]] as const) ball(k, c + du, c + 0.2, dz, 0.32, flower, k.thin * 0.8);
    }
  },
};

// ── a sculpture ─────────────────────────────────────────────────────────────
// The room's art: a ring of green bronze standing on a stone plinth, a
// pale stone ball resting in its curve.

const sculpture: PropArt = {
  len: 3,
  dep: 3,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 1.5;
    k.shadow(c, c, 1.5, 1.5, 0.3);
    k.box(0.45, 0.45, 0, 2.1, 2.1, 3.3, '#cfc8b8', { stripe: false });
    k.box(0.3, 0.3, 3.3, 2.4, 2.4, 0.35, '#ddd6c6');
    const bronze = hash(v.seed, 1) < 0.5 ? '#5f9a86' : '#c08048';
    const zc = 3.65 + 1.95;
    const r = 1.3;
    const loop: P3[] = [];
    for (let i = 0; i <= 28; i++) {
      const th = (i / 28) * Math.PI * 2;
      loop.push([c + Math.cos(th) * r, c, zc + Math.sin(th) * r]);
    }
    k.cyl(c, c, 3.65, 0.35, 0.4, shade(bronze, -0.1), { line: k.thin });
    k.rod(loop, bronze, 0.42);
    k.line(loop.slice(13, 22).map(([u, w, z]) => [u - 0.06, w, z + 0.08] as P3), withAlpha('#ffffff', 0.45), Math.max(0.6, 0.1 * k.s));
    ball(k, c + 0.25, c + 0.1, zc - r + 0.62, 0.5, '#ece6da', k.thin);
  },
};

// ── the turret ──────────────────────────────────────────────────────────────
// A small defence turret on a tripod: squat and boxy with rounded corners
// and a short twin barrel, a sensor eye and a whip aerial, like a toy.
const turret: PropArt = {
  len: 4,
  dep: 4,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 1.9, 1.9, 0.28);
    const paint = hash(v.seed, 1) < 0.5 ? '#7a8a5a' : '#8a929a';
    // the tripod: back legs, the hub, then the front leg
    const foot = (a: number): P3 => [c + Math.cos(a) * 1.7, c + Math.sin(a) * 1.7, 0];
    const legs = [-2.3, -0.2, 1.9];
    for (const a of legs.slice(0, 2)) k.rod([foot(a), [c, c, 2.6]], C.iron, 0.18);
    k.cyl(c, c, 2.4, 0.5, 0.8, C.iron);
    k.rod([foot(legs[2]), [c, c, 2.6]], C.iron, 0.18);
    // the body: a rounded box, the barrels pointing out to the room
    k.box(0.9, 1.0, 3.2, 2.2, 2.1, 2.0, paint, { round: 0.45 });
    k.line([[0.95, 3.12, 4.5], [3.05, 3.12, 4.5]], '#e8c040', Math.max(0.9, 0.2 * k.s));
    for (const du of [-0.38, 0.38]) k.rod([[c + du, 3.0, 3.85], [c + du, 3.95, 3.85]], '#5a5a62', 0.24);
    k.box(1.3, 1.25, 5.2, 1.4, 1.4, 0.5, shade(paint, 0.05), { round: 0.3, line: k.lw });
    // the sensor eye, glowing amber
    const [ex, ey] = k.p(2.7, 3.12, 4.9);
    k.pen.beginPath();
    k.pen.arc(ex, ey, Math.max(1.2, 0.26 * k.s), 0, Math.PI * 2);
    k.paint('#ffb040', k.thin);
    k.halo(2.7, 3.2, 4.9, 1.0, '#ffb040', 0.4);
    // the whip aerial
    k.rod([[1.6, 1.6, 5.7], [1.4, 1.5, 6.9]], C.iron, 0.06);
    k.disc(1.4, 1.5, 6.92, 0.12, C.cloth, k.thin * 0.6);
  },
};

// Wall pieces first (they want the free stretches of wall), then the floor
// pieces, which the planner stands by the back walls and the stations.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: hospital, count: 1, place: 'wall' },
  { art: bed, count: 1, place: 'wall' },
  { art: shelf, count: 1, place: 'wall' },
  { art: workbench, count: 1, place: 'wall' },
  { art: stove, count: 1, place: 'wall' },
  { art: hydro, count: 2, place: 'wall' },
  { art: stack, count: 2, place: 'floor' },
  { art: lamp, count: 3, place: 'floor' },
  { art: crates, count: 2, place: 'floor' },
  { art: table, count: 1, place: 'floor' },
  { art: pot, count: 3, place: 'floor' },
  { art: battery, count: 1, place: 'floor' },
  { art: sculpture, count: 1, place: 'floor' },
  { art: turret, count: 1, place: 'floor' },
];

export const DECOR_ART = { hospital, bed, shelf, workbench, stove, hydro, stack, lamp, crates, table, pot, battery, sculpture, turret };
