import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import type { Quad } from './bits.ts';
import { crate, crown, leaf, mug, on, pouch, sprouts, stool } from './bits.ts';
import type { Kit } from './kit.ts';
import { C, INK, due, hash, kitOf, wisp } from './kit.ts';

// The station's furniture between the stations: mess tables, hydroponic
// racks under grow lights, stacks of cargo crates, planters, light
// columns, the galley pod, a telescope and the drone's charging dock. All
// still (drawn once into the scene's static layer), each on its own soft
// shadow, varied by the placement's seed.

type Spawn = (p: Particle) => void;

// ── a mess table ────────────────────────────────────────────────────────────
// A round white table on a steel pedestal between two swivel stools, with
// what the crew left on it: mugs, food pouches, a tray, a slate.
const mess: PropArt = {
  len: 9,
  dep: 9,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 4.5;
    k.shadow(c, c, 4.2, 4.2, 0.18);
    const seat = hash(v.seed, 1) < 0.5 ? C.orange : C.blanket;
    stool(k, 1.6, 7.0, seat);
    stool(k, 7.2, 1.9, seat);
    k.shadow(c, c, 1.6, 1.6, 0.25);
    k.cyl(c, c, 0, 1.2, 0.3, C.steelDark);
    k.cyl(c, c, 0.3, 0.3, 4.9, C.steel);
    k.cyl(c, c, 5.2, 2.4, 0.45, C.white, { top: '#f4f7fb' });
    k.disc(c, c, 5.66, 1.9, '#e6ebf2', 0);
    const z = 5.65;
    const kind = Math.floor(hash(v.seed, 3) * 3);
    mug(k, c - 1.0, c + 0.6, z, hash(v.seed, 4) < 0.5 ? C.orange : '#3f6096', 0.36);
    mug(k, c + 0.8, c - 1.0, z, hash(v.seed, 5) < 0.5 ? C.white : '#2f8f7a', 0.36);
    if (kind === 0) {
      // a tray with pouches
      k.box(c - 0.2, c - 0.1, z, 1.8, 1.4, 0.12, C.steel, { line: k.thin, stripe: false });
      pouch(k, c + 0.3, c + 0.5, z + 0.12, '#e8505f');
      pouch(k, c + 1.1, c + 0.4, z + 0.12, '#5ee08f');
    } else if (kind === 1) {
      // a slate and a squeeze bottle
      k.box(c - 0.3, c + 0.2, z, 1.5, 1.0, 0.1, '#2b3754', { line: k.thin, stripe: false });
      k.cyl(c + 0.9, c - 0.1, z, 0.3, 1.1, C.yellow);
      k.cyl(c + 0.9, c - 0.1, z + 1.1, 0.12, 0.35, C.red, { line: k.thin * 0.8 });
    } else {
      // a bowl of fruit
      k.cyl(c + 0.2, c + 0.3, z, 0.85, 0.45, C.white);
      for (const [du, dv, col] of [[-0.2, 0.1, '#e8505f'], [0.4, 0.4, '#f2c230'], [0.1, 0.6, '#7fd07a']] as const) k.dot(c + 0.2 + du, c + 0.3 + dv, z + 0.65, 0.32, col, k.thin * 0.8);
    }
  },
};

// ── a hydroponic rack ───────────────────────────────────────────────────────
// A steel rack of three tiers of plant trays, a violet grow light under
// each shelf: lettuces, tomatoes with red fruit, herbs.
const hydro: PropArt = {
  len: 8,
  dep: 4,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 2, 4.4, 2.4, 0.26);
    k.pool(4, 2.4, 5, 3.4, C.grow, 0.18);
    const posts: Array<[number, number]> = [[0.4, 0.4], [7.3, 0.4], [0.4, 3.3], [7.3, 3.3]];
    for (const [u, w] of posts.slice(0, 2)) k.box(u, w, 0, 0.35, 0.35, 10.6, C.steelDark, { line: k.thin, stripe: false });
    const tiers = [0.6, 4.0, 7.4];
    tiers.forEach((z, i) => {
      // the grow light over this tier
      k.box(0.6, 0.8, z + 3.0, 6.8, 2.4, 0.3, C.steelDark, { line: k.thin, stripe: false });
      k.line([[0.9, 3.21, z + 3.0], [7.1, 3.21, z + 3.0]], '#f2c9ff', Math.max(1, 0.25 * k.s));
      k.halo(4, 2.2, z + 2.4, 3.6, C.grow, 0.3);
      // the tray, and what grows in it
      k.box(0.6, 0.8, z, 6.8, 2.4, 0.7, C.white, { round: 0.2 });
      k.line([[0.8, 3.21, z + 0.35], [7.2, 3.21, z + 0.35]], C.green, Math.max(0.8, 0.18 * k.s));
      const kind = Math.floor(hash(v.seed, i, 3) * 3);
      for (let j = 0; j < 4; j++) {
        const u = 1.4 + j * 1.75;
        if (kind === 0) crown(k, u, 2.0, z + 1.35, 0.85, 0.5, 8, v.seed + i * 9 + j, ['#5c9a4f', '#8cc06a', '#a8d88a']);
        else if (kind === 1) {
          sprouts(k, u, 2.0, z + 0.7, 6, 1.7, v.seed + j);
          for (let f = 0; f < 2; f++) k.dot(u - 0.3 + f * 0.6, 2.4, z + 1.25 + f * 0.45, 0.28, '#e8505f', k.thin * 0.7);
        } else sprouts(k, u, 2.0, z + 0.7, 7, 2.0, v.seed + j * 3, ['#3d7440', '#5c9a4f', '#8cc06a']);
      }
    });
    for (const [u, w] of posts.slice(2)) k.box(u, w, 0, 0.35, 0.35, 10.6, C.steel, { line: k.thin, stripe: false });
    // a water tank at its foot
    k.cyl(6.6, 3.3, 0, 0.55, 0.5, '#9fd8f0', { line: k.thin });
  },
};

// ── cargo ───────────────────────────────────────────────────────────────────
// A pallet of stencilled crates under a cargo net, a canister beside it.
const cargo: PropArt = {
  len: 7,
  dep: 6,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.5, 3, 3.8, 3.2, 0.28);
    const bodies: Color[] = ['#d9dfe8', '#3f6096', '#5a6a8a', '#e8e2cf'];
    const stripes: Color[] = [C.orange, C.yellow, C.white, '#e8505f'];
    const b = (i: number) => bodies[Math.floor(hash(v.seed, i, 1) * bodies.length)];
    const s = (i: number) => stripes[Math.floor(hash(v.seed, i, 2) * stripes.length)];
    k.box(0.3, 0.3, 0, 5.4, 4.6, 0.45, '#8a6a4a', { stripe: false });
    crate(k, 0.5, 0.5, 0.45, 2.6, 2.2, 2.2, b(0), s(0), v.seed);
    crate(k, 3.2, 0.5, 0.45, 2.3, 2.0, 1.8, b(1), s(1), v.seed + 1);
    crate(k, 0.5, 2.8, 0.45, 2.4, 1.9, 1.6, b(2), s(2), v.seed + 2);
    crate(k, 1.0, 0.8, 2.65, 2.0, 1.8, 1.6, b(3), s(3), v.seed + 3);
    // a strap over the top crates
    k.line([[2.0, 0.8, 4.27], [2.0, 2.6, 4.27], [2.0, 2.6, 2.65]], C.orange, Math.max(1, 0.25 * k.s));
    // the canister
    k.shadow(5.8, 4.4, 1.0, 0.9, 0.25);
    k.cyl(5.8, 4.4, 0, 0.8, 2.8, hash(v.seed, 7) < 0.5 ? C.red : '#2f8f7a');
    k.cyl(5.8, 4.4, 2.8, 0.35, 0.4, C.steel, { line: k.thin });
    k.line([[5.0, 5.2, 1.6], [6.6, 5.2, 1.6]], C.white, Math.max(0.8, 0.2 * k.s));
  },
};

// ── a planter ───────────────────────────────────────────────────────────────
// One of three, by seed: a round little tree, a fern, or a tall leafy
// plant, in a white cylinder with an orange band.
const plant: PropArt = {
  len: 5,
  dep: 5,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    const kind = Math.floor(hash(v.seed, 11) * 3);
    k.shadow(c, c, 2.0, 2.0, 0.28);
    k.cyl(c, c, 0, 1.6, 2.6, C.white);
    k.cyl(c, c, 1.5, 1.63, 0.5, C.orange, { line: k.thin });
    k.disc(c, c, 2.6, 1.3, C.soil, 0);
    const S = k.s;
    const [bx, by] = k.p(c, c, 2.5);
    if (kind === 0) {
      // a little round tree
      k.rod([[c, c, 2.5], [c + 0.2, c, 6.5]], '#7a5232', 0.3);
      crown(k, c + 0.2, c, 8.0, 2.2, 1.8, 26, v.seed);
    } else if (kind === 1) {
      // a fern
      for (let i = 0; i < 14; i++) {
        const a = -Math.PI / 2 + (i - 6.5) * 0.23;
        leaf(k, bx, by - 0.3 * S, a, (3.6 + hash(v.seed, i, 19) * 1.6) * S, 0.5 * S, i & 1 ? C.leaf : C.leafLight);
      }
    } else {
      // tall leaves
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.13 + (hash(v.seed, i, 17) - 0.5) * 0.1;
        leaf(k, bx + (i - 4) * 0.2 * S, by, a, (5.5 + hash(v.seed, i, 18) * 3.5) * S, 0.6 * S, i & 1 ? '#4f8a4a' : '#6fa35a');
      }
    }
  },
};

// ── a light column ──────────────────────────────────────────────────────────
// A slim white column with a warm glowing capsule at its top; its light
// pools on the deck.
const column: PropArt = {
  len: 4,
  dep: 4,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.pool(c, c, 3, 3, C.lamp, 0.5);
    k.shadow(c, c, 1.2, 1.2, 0.3);
    k.cyl(c, c, 0, 1.0, 0.4, C.steelDark);
    k.cyl(c, c, 0.4, 0.35, 8.0, C.white);
    k.cyl(c, c, 8.4, 0.75, 0.4, C.steel);
    k.cyl(c, c, 8.8, 0.65, 2.0, '#fff1cf', { top: '#fff8e4' });
    k.cyl(c, c, 10.8, 0.75, 0.4, C.steel);
    k.halo(c, c, 9.8, 3.4, C.warm, 0.5);
    k.halo(c, c, 9.8, 1.4, '#fff4d8', 0.5);
  },
};

// ── the galley pod ──────────────────────────────────────────────────────────
// A white kitchen island: a food printer with a glowing window, a kettle,
// a rack of mugs, a net of fruit and a hood light over the counter. The
// kettle steams.
const galley: PropArt = {
  len: 10,
  dep: 6,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(5, 3, 5.4, 3.4, 0.28);
    k.box(0.6, 0.6, 0, 8.8, 4.8, 0.6, C.hullDark, { stripe: false });
    k.box(0.4, 0.4, 0.6, 9.2, 5.2, 4.0, C.white, { round: 0.25, stripe: false });
    // cupboard doors and handles on the front
    for (let i = 0; i < 3; i++) {
      const u0 = 0.9 + i * 2.9;
      k.rect(u0, 1.1, u0 + 2.6, 4.1, 5.62, shade(C.white, -0.05), k.thin, 0.2);
      k.line([[u0 + 0.4, 5.64, 3.6], [u0 + 2.2, 5.64, 3.6]], C.steelDark, Math.max(0.8, 0.16 * k.s));
    }
    k.line([[0.5, 5.62, 0.9], [9.5, 5.62, 0.9], [9.6, 0.5, 0.9]], C.orange, Math.max(1, 0.3 * k.s));
    k.box(0.2, 0.2, 4.6, 9.6, 5.6, 0.4, '#d3dae5');
    const z = 5.0;
    // the food printer
    k.box(0.9, 0.8, z, 3.2, 2.6, 2.6, C.navy, { round: 0.3 });
    k.rect(1.3, z + 0.5, 3.0, z + 2.0, 3.42, '#ffcf8a', k.thin, 0.2);
    k.halo(2.2, 3.5, z + 1.2, 1.8, C.warm, 0.4);
    k.dot(3.5, 3.43, z + 1.9, 0.14, C.green);
    k.dot(3.5, 3.43, z + 1.4, 0.14, C.amber);
    // the kettle and two mugs
    k.cyl(5.2, 2.2, z, 0.7, 1.4, C.chrome);
    k.cyl(5.2, 2.2, z + 1.4, 0.3, 0.25, C.rubber, { line: k.thin });
    k.rod([[5.85, 2.2, z + 1.2], [6.2, 2.2, z + 0.9], [5.85, 2.2, z + 0.4]], C.rubber, 0.14);
    mug(k, 6.6, 4.0, z, C.orange, 0.38);
    mug(k, 7.5, 3.6, z, C.white, 0.38);
    // a net of fruit on the end
    for (const [du, dv, col] of [[8.4, 1.5, '#e8505f'], [8.9, 2.0, '#f2c230'], [8.2, 2.2, '#7fd07a'], [8.7, 1.4, '#ffb04a']] as const) k.dot(du, dv, z + 0.45, 0.4, col, k.thin * 0.8);
    // the hood light over it, on a post
    k.box(9.2, 0.6, 0, 0.5, 0.5, 9.6, C.steel, { line: k.thin, stripe: false });
    k.box(0.8, 0.6, 9.2, 8.9, 2.0, 0.5, C.white, { round: 0.2 });
    k.line([[1.1, 2.62, 9.2], [9.3, 2.62, 9.2]], '#fff1cf', Math.max(1, 0.3 * k.s));
    k.pool(5, 3, 4.5, 3, C.lamp, 0.35, z);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 0.5, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(5.2, 2.2, 6.8, Math.floor(v.t * 10), i));
  },
};

// ── a telescope ─────────────────────────────────────────────────────────────
// A white refractor on a tripod, pointing up at the stars, a stool by it.
const scope: PropArt = {
  len: 6,
  dep: 6,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 3;
    k.shadow(c, c, 2.6, 2.6, 0.22);
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + 0.6;
      k.rod([[c, c, 5.2], [c + Math.cos(a) * 2.2, c + Math.sin(a) * 2.2, 0]], C.steelDark, 0.16);
    }
    k.cyl(c, c, 5.0, 0.5, 0.6, C.steel);
    // the tube: pointing up and back, a dew cap and lens at its top, the
    // eyepiece and a finder at its foot
    const lo: [number, number, number] = [c + 1.4, c + 0.6, 5.6];
    const hi: [number, number, number] = [c - 2.2, c - 0.6, 9.4];
    k.rod([lo, hi], C.white, 0.85);
    k.rod([[lo[0] - 1.5, lo[1] - 0.5, lo[2] + 1.55], [lo[0] - 1.9, lo[1] - 0.63, lo[2] + 1.97]], C.orange, 0.95);
    k.rod([[hi[0] + 0.5, hi[1] + 0.17, hi[2] - 0.53], [hi[0] - 0.15, hi[1] - 0.05, hi[2] + 0.16]], C.navy, 1.15);
    k.rod([[lo[0] - 1.1, lo[1] - 0.6, lo[2] + 1.7], [lo[0] - 2.5, lo[1] - 0.95, lo[2] + 3.1]], C.steel, 0.22);
    k.rod([[lo[0] + 0.2, lo[1], lo[2] - 0.1], [lo[0] + 0.6, lo[1] + 0.1, lo[2] + 0.4]], C.rubber, 0.3);
    k.box(c - 0.55, c - 0.5, 5.5, 1.1, 1.0, 1.0, C.steelDark, { line: k.thin, round: 0.15 });
    stool(k, c + 2.3, c + 2.5, C.blanket, 3.0);
  },
};

// ── the drone's dock ────────────────────────────────────────────────────────
// A round charging pad with a glowing ring, a toolbox beside it.
const dock: PropArt = {
  len: 5,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.3;
    k.shadow(c, c, 2.4, 2.4, 0.24);
    k.cyl(c, c, 0, 2.0, 0.5, C.hullDark);
    k.disc(c, c, 0.5, 1.6, '#3a4766', 0);
    const e = k.ell(c, c, 0.52, 1.25);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    k.pen.strokeStyle = C.cyan;
    k.pen.lineWidth = Math.max(1, 0.3 * k.s);
    k.pen.stroke();
    k.halo(c, c, 0.6, 2.4, C.cyan, 0.35);
    // a cross of landing marks
    k.line([[c - 0.5, c, 0.53], [c + 0.5, c, 0.53]], '#c5cfdd', Math.max(0.8, 0.12 * k.s));
    k.line([[c, c - 0.5, 0.53], [c, c + 0.5, 0.53]], '#c5cfdd', Math.max(0.8, 0.12 * k.s));
    // the toolbox
    k.box(3.4, 3.6, 0, 1.4, 1.1, 0.9, C.red, { round: 0.12 });
    k.rod([[3.7, 4.15, 1.0], [3.7, 4.15, 1.3], [4.5, 4.15, 1.3], [4.5, 4.15, 1.0]], C.rubber, 0.08);
  },
};

// Interleaved so the first few fit in any room: tables and plants first.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: mess, count: 2, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
  { art: hydro, count: 1, place: 'floor' },
  { art: cargo, count: 1, place: 'floor' },
  { art: column, count: 1, place: 'floor' },
  { art: galley, count: 1, place: 'floor' },
  { art: mess, count: 2, place: 'floor' },
  { art: hydro, count: 1, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
  { art: dock, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: cargo, count: 2, place: 'floor' },
  { art: scope, count: 1, place: 'floor' },
  { art: mess, count: 2, place: 'floor' },
  { art: column, count: 1, place: 'floor' },
  { art: hydro, count: 1, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
];

export const DECOR_ART = { mess, hydro, cargo, plant, column, galley, scope, dock };
