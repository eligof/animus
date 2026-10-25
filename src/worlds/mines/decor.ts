import { shade } from '../../art/iso.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { barrel, bucket, crate, dynamite, hangLantern, heap, logU, nugget, pickaxe, rock, ropeCoil, sack, shovel } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, hash, kitOf } from './kit.ts';

// The mine's gear out on the floor between the stations: barrels, crates
// (one of dynamite), sacks of ore, lamp posts with their light round their
// feet, a sluice box, stacked timber, boulders with gold in them, a
// barrow of ore. All still (drawn once into the scene's static layer), each
// on its own soft shadow, varied by the placement's seed.

// ── barrels ─────────────────────────────────────────────────────────────────
// Two or three barrels: one of water, one of ore, a keg; a dipper hung on
// one.
const barrels: PropArt = {
  len: 5,
  dep: 5,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.5, 2.3, 0.3);
    const three = hash(v.seed, 1) < 0.6;
    barrel(k, 1.6, 1.5, 0, 1.05, 3.0, C.timber, hash(v.seed, 2) < 0.5 ? '#2f4a52' : null);
    if (three) barrel(k, 3.7, 1.7, 0, 0.85, 2.2, C.timberOld);
    barrel(k, 2.2, 3.6, 0, 0.95, 2.4, shade(C.timber, 0.06), '#3a2e26');
    // ore heaped in the open one
    heap(k, 2.2, 3.6, 2.35, 0.75, 0.5, v.seed + 3, [C.rockLight, C.gold, C.stone]);
    if (!three) bucket(k, 3.9, 2.0, 0, 0.6, 0.9, C.ironLight, '#2f4a52');
  },
};

// ── crates ──────────────────────────────────────────────────────────────────
// Stacked plank crates, the top one open with dynamite in it (red sticks,
// a fuse, cartoon), a coil of rope against them.
const crates: PropArt = {
  len: 5,
  dep: 4,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.0, 2.7, 2.1, 0.3);
    crate(k, 0.3, 0.3, 0, 2.6, 2.2, 2.2, C.pine);
    crate(k, 2.9, 0.5, 0, 1.9, 1.9, 1.6, C.plank);
    crate(k, 0.6, 0.5, 2.2, 2.0, 1.7, 1.4, shade(C.pine, -0.06));
    // the open box of dynamite on top, its lid leaning
    const red = hash(v.seed, 4) < 0.7;
    if (red) {
      k.poly([[0.8, 0.7, 3.61], [2.4, 0.7, 3.61], [2.4, 2.0, 3.61], [0.8, 2.0, 3.61]], '#3a2a1e', 0);
      dynamite(k, 1.3, 1.3, 3.0, 3, 1.3);
      dynamite(k, 2.0, 1.0, 3.0, 2, 1.1);
      // a red diamond painted on the front (no words)
      const [x, y] = k.p(1.6, 2.21, 2.9);
      const r = 0.45 * k.s;
      k.pen.beginPath();
      k.pen.moveTo(x, y - r);
      k.pen.lineTo(x + r * 0.8, y);
      k.pen.lineTo(x, y + r);
      k.pen.lineTo(x - r * 0.8, y);
      k.pen.closePath();
      k.paint(C.red, Math.max(0.8, k.thin * 0.7));
    } else heap(k, 1.6, 1.35, 3.6, 0.7, 0.5, v.seed + 5, [C.copper, C.verdigris, C.stone]);
    ropeCoil(k, 3.8, 3.2, 0, 0.75);
  },
};

// ── sacks of ore ────────────────────────────────────────────────────────────
const sacks: PropArt = {
  len: 5,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.6, 2.4, 0.28);
    sack(k, 1.5, 1.4, 0, 1.05, 2.6, false, v.seed);
    sack(k, 3.6, 1.8, 0, 1.0, 2.4, true, v.seed + 1, hash(v.seed, 2) < 0.5 ? C.coal : C.rockLight);
    heap(k, 2.0, 3.7, 0, 1.1, 0.7, v.seed + 3, [C.rockLight, C.stone, C.gold, C.rock]);
    shovel(k, [4.4, 3.0, 2.6], [3.3, 4.2, 0.1], [0.7, 0.7, 0], 0.75);
  },
};

// ── a lamp post ─────────────────────────────────────────────────────────────
// A timber post with an iron arm and a hanging lantern, its light pooled on
// the floor round its foot; a bucket or a pick against it.
const lamppost: PropArt = {
  len: 5,
  dep: 5,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.pool(2.5, 2.6, 3.4, 3.4, C.lamp, 0.7);
    k.shadow(2.0, 2.0, 1.1, 1.0, 0.3);
    k.box(1.55, 1.55, 0, 0.9, 0.9, 11.2, C.timber, { stripe: false });
    k.box(1.3, 1.3, 0, 1.4, 1.4, 0.8, C.timberOld, { line: k.thin });
    k.rod([[2.0, 2.45, 10.4], [2.0, 3.8, 10.4], [2.0, 3.8, 10.1]], C.iron, 0.13);
    k.rod([[2.0, 2.45, 9.3], [2.0, 3.3, 10.4]], C.iron, 0.09);
    hangLantern(k, 2.0, 3.8, 10.1, 0.5, 1);
    if (hash(v.seed, 1) < 0.5) bucket(k, 3.4, 1.4, 0, 0.6, 0.9, C.ironLight, C.coal);
    else pickaxe(k, [3.3, 1.5, 0], [2.6, 2.0, 3.4], [0.7, -0.7, 0], 0.8);
  },
};

// ── the sluice ──────────────────────────────────────────────────────────────
// A long box on trestles, sloping, its riffles catching gold from the water
// running down it into a tub; a gold pan leaning on the trestle.
const sluice: PropArt = {
  len: 10,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(5, 2, 5.4, 2.0, 0.28);
    const z = (u: number) => 3.6 - u * 0.16; // its floor, falling toward +u
    for (const u of [1.4, 7.4]) {
      k.rod([[u, 0.8, 0], [u + 0.15, 1.9, z(u) - 0.2], [u, 3.0, 0]], C.timberOld, 0.28);
    }
    // the trough: floor, the near side, the end
    const w0 = 1.1;
    const w1 = 2.9;
    const pts = (side: number, h: number): P3[] => [[0.4, side, z(0.4) + h], [9.0, side, z(9.0) + h]];
    k.poly([...pts(w0, 0.9), ...pts(w0, 0).reverse()], k.side(C.timber, 0, -1, 0.2), k.thin);
    k.poly([[0.4, w0, z(0.4)], [9.0, w0, z(9.0)], [9.0, w1, z(9.0)], [0.4, w1, z(0.4)]], '#5a4632', k.thin);
    // water running down it, riffles across
    k.poly([[0.6, w0 + 0.2, z(0.6) + 0.12], [8.8, w0 + 0.2, z(8.8) + 0.12], [8.8, w1 - 0.2, z(8.8) + 0.12], [0.6, w1 - 0.2, z(0.6) + 0.12]], '#5f8a96aa', 0);
    for (let u = 1.6; u < 8.8; u += 1.2) k.line([[u, w0 + 0.1, z(u) + 0.2], [u, w1 - 0.1, z(u) + 0.2]], C.timberDark, Math.max(0.8, 0.12 * k.s));
    for (let i = 0; i < 5; i++) {
      const u = 1.8 + i * 1.3 + hash(v.seed, i, 3) * 0.4;
      nugget(k, u, w0 + 0.4 + hash(v.seed, i, 4) * 1.2, z(u) + 0.15, 0.16, v.seed + i, i === 2);
    }
    k.poly([...pts(w1, 0.9), ...pts(w1, 0).reverse()], k.side(C.timber, 0, 1, 0.2), k.lw);
    k.poly([[9.0, w0, z(9) + 0.9], [9.0, w1, z(9) + 0.9], [9.0, w1, z(9)], [9.0, w0, z(9)]], k.side(C.timberOld, 1, 0, 0.2), k.lw);
    // the head box at the top end and the water falling into a tub
    crate(k, 0.0, 0.7, z(0) + 0.2, 1.4, 2.6, 1.2, C.plank);
    k.line([[9.1, 2.0, z(9) + 0.3], [9.25, 2.0, 1.4]], '#9cc4d0', Math.max(1, 0.2 * k.s));
    k.cyl(9.25, 2.0, 0, 0.75, 1.2, C.timberOld, { top: '#2f4a52' });
    // the pan leaning on a trestle
    const [px, py] = k.p(7.0, 3.4, 1.0);
    k.pen.beginPath();
    k.pen.ellipse(px, py, 0.9 * k.s, 1.0 * k.s, 0.3, 0, Math.PI * 2);
    k.paint('#5a5654', k.thin);
    k.pen.beginPath();
    k.pen.ellipse(px, py, 0.55 * k.s, 0.65 * k.s, 0.3, 0, Math.PI * 2);
    k.paint('#3e3a38', 0);
  },
};

// ── timber ──────────────────────────────────────────────────────────────────
// Props cut for the next sets: logs stacked on chocks, planks across them.
const timber: PropArt = {
  len: 8,
  dep: 4,
  height: 3.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 2, 4.4, 2.0, 0.28);
    for (const u of [1.2, 6.2]) k.box(u, 0.4, 0, 0.6, 3.2, 0.4, C.timberDark, { line: k.thin });
    const r = 0.5;
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < 3 - row; i++) {
        const w = 0.9 + i * 1.02 + row * 0.51;
        logU(k, 0.3 + hash(v.seed, row * 3 + i, 1) * 0.4, 7.3 + hash(v.seed, row * 3 + i, 2) * 0.4, w, 0.4 + r + row * r * 1.7, r, i & 1 ? C.timber : C.timberOld);
      }
    }
    k.box(2.5, 0.6, 3.3, 4.6, 0.9, 0.22, C.plank, { line: k.thin });
  },
};

// ── a boulder ───────────────────────────────────────────────────────────────
// A fallen boulder split open on a pocket of gold, smaller rocks round it,
// a pick left stuck in it.
const boulder: PropArt = {
  len: 5,
  dep: 5,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.6, 2.4, 0.3);
    rock(k, 2.3, 2.2, 0, 2.1, 3.0, '#86705c', v.seed, k.lw);
    // the gold pocket on its face
    const [x, y] = k.p(2.6, 3.9, 1.6);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.9 * k.s, 0.6 * k.s, -0.3, 0, Math.PI * 2);
    k.paint('#3a2a1e', k.thin);
    nugget(k, 2.5, 4.0, 1.3, 0.35, v.seed + 1);
    nugget(k, 2.95, 4.0, 1.55, 0.25, v.seed + 2, false);
    rock(k, 4.2, 3.4, 0, 0.7, 0.8, C.stone, v.seed + 3, k.thin);
    rock(k, 1.0, 4.2, 0, 0.6, 0.6, C.rockLight, v.seed + 4, k.thin);
    if (hash(v.seed, 5) < 0.6) pickaxe(k, [3.9, 1.6, 4.6], [2.9, 1.9, 3.1], [0.6, 0.8, 0], 0.8);
    nugget(k, 3.6, 4.4, 0, 0.22, v.seed + 6);
  },
};

// ── a barrow ────────────────────────────────────────────────────────────────
// A wheelbarrow heaped with ore, its legs down, handles toward -u.
const barrow: PropArt = {
  len: 6,
  dep: 3,
  height: 3.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 1.5, 3.2, 1.4, 0.28);
    // handles and legs
    for (const w of [0.7, 2.3]) {
      k.rod([[0.2, w, 1.5], [3.6, w + (w < 1.5 ? 0.15 : -0.15), 1.1]], C.timber, 0.16);
      k.rod([[1.6, w, 1.3], [1.5, w, 0]], C.timberOld, 0.14);
    }
    // the tray: a tub narrowing to its foot
    const tray: P3[] = [[1.8, 0.4, 2.4], [5.0, 0.6, 2.4], [5.0, 2.4, 2.4], [1.8, 2.6, 2.4]];
    k.poly([[2.3, 0.8, 1.0], [4.4, 0.9, 1.0], [5.0, 0.6, 2.4], [1.8, 0.4, 2.4]], shade('#5a6a6e', -0.15), k.thin);
    k.poly([[2.3, 2.2, 1.0], [4.4, 2.1, 1.0], [5.0, 2.4, 2.4], [1.8, 2.6, 2.4]], k.side('#5a6a6e', 0, 1, 0.2), k.lw);
    k.poly([[4.4, 0.9, 1.0], [4.4, 2.1, 1.0], [5.0, 2.4, 2.4], [5.0, 0.6, 2.4]], k.side('#5a6a6e', 1, 0, 0.2), k.lw);
    k.poly(tray, '#3a2c22', k.thin);
    heap(k, 3.4, 1.5, 2.35, 1.2, 0.7, v.seed + 1, [C.rockLight, C.stone, C.gold, C.rock]);
    // the wheel at the nose
    const [wx, wy] = k.p(5.4, 1.5, 0.75);
    k.pen.beginPath();
    k.pen.ellipse(wx, wy, 0.35 * k.s, 0.75 * k.s, 0, 0, Math.PI * 2);
    k.paint('#3a3432', k.lw);
    k.disc(5.4, 1.5, 0.75, 0.12, C.ironLight, 0);
  },
};

// ── a box of dynamite and its plunger ───────────────────────────────────────
const blasting: PropArt = {
  len: 4,
  dep: 4,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2, 2, 2.2, 2.0, 0.28);
    crate(k, 0.4, 0.4, 0, 1.9, 1.5, 1.1, C.pine);
    k.poly([[0.6, 0.6, 1.11], [2.1, 0.6, 1.11], [2.1, 1.7, 1.11], [0.6, 1.7, 1.11]], '#3a2a1e', 0);
    dynamite(k, 1.0, 1.1, 0.7, 3, 1.2);
    dynamite(k, 1.7, 1.0, 0.7, 2, 1.0);
    // the plunger box, its T handle up, the wire snaking off
    k.box(2.2, 2.2, 0, 1.4, 1.2, 1.1, '#8a3a2a', { line: k.lw });
    k.rod([[2.9, 2.8, 1.1], [2.9, 2.8, 2.6]], C.ironLight, 0.12);
    k.rod([[2.4, 2.8, 2.6], [3.4, 2.8, 2.6]], C.timberDark, 0.18);
    k.line([[2.3, 3.4, 0.2], [1.6, 3.7, 0.05], [0.6, 3.3, 0.05], [0.2, 3.8, 0.05]], INK, Math.max(0.8, 0.08 * k.s));
  },
};

// A second piece drawn like `a`: each entry of the list is its own piece,
// so the room can tell them apart.
const again = (a: PropArt): PropArt => ({ ...a });

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: barrels, count: 1, place: 'floor' },
  { art: lamppost, count: 1, place: 'floor' },
  { art: sacks, count: 1, place: 'floor' },
  { art: crates, count: 1, place: 'floor' },
  { art: boulder, count: 1, place: 'floor' },
  { art: sluice, count: 1, place: 'floor' },
  { art: again(lamppost), count: 1, place: 'floor' },
  { art: timber, count: 1, place: 'floor' },
  { art: barrow, count: 1, place: 'floor' },
  { art: again(barrels), count: 1, place: 'floor' },
  { art: blasting, count: 1, place: 'floor' },
  // only bigger rooms have the floor for these
  { art: again(lamppost), count: 2, place: 'floor' },
  { art: again(sacks), count: 1, place: 'floor' },
  { art: again(boulder), count: 1, place: 'floor' },
  { art: again(crates), count: 1, place: 'floor' },
  { art: again(barrels), count: 1, place: 'floor' },
];

export const DECOR_ART = { barrels, crates, sacks, lamppost, sluice, timber, boulder, barrow, blasting };

