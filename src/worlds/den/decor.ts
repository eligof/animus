import { shade } from '../../art/iso.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import type { Quad } from './bits.ts';
import { beanbag, cable, can, crate, crt, droop, glass, lyingCan, mug, pizzaBox, sheen, snakePlant } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, CANS, hash, kitOf, on, pace, still } from './kit.ts';

// The den's clutter between the stations: stacks of pizza boxes, an arcade
// cabinet, a heap of old computers, a beanbag with a laptop, a 3D printer
// on a cart, crates of parts and a snake plant under a grow light. All
// still but the arcade's screen, each on its own soft shadow, varied by
// the placement's seed.

// ── pizza boxes ─────────────────────────────────────────────────────────────
// A leaning stack of boxes, the top one open on what is left, cans round
// its foot.
const pizza: PropArt = {
  len: 5,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.6, 2.5, 0.28);
    const n = 3 + Math.floor(hash(v.seed, 1) * 3);
    for (let i = 0; i < n; i++) pizzaBox(k, 0.8 + (hash(v.seed, i, 2) - 0.5) * 0.4, 0.8 + (hash(v.seed, i, 3) - 0.5) * 0.4, i * 0.42, 3.2, 3.2, i === n - 1 && hash(v.seed, 4) < 0.7, v.seed + i, 2 + Math.floor(hash(v.seed, 5) * 4));
    can(k, 4.4, 1.2, 0, CANS[Math.floor(hash(v.seed, 6) * CANS.length)]);
    lyingCan(k, 1.0, 4.4, 2.0, 4.7, 0, CANS[Math.floor(hash(v.seed, 7) * CANS.length)]);
    can(k, 4.3, 4.2, 0, CANS[Math.floor(hash(v.seed, 8) * CANS.length)]);
  },
};

// ── the arcade cabinet ──────────────────────────────────────────────────────
// A black upright with purple side art, a lit marquee, a joystick and
// buttons, its screen running its attract loop (a little ship and falling
// blocks), in slow steps.
const ARC = { u0: 0.5, u1: 4.5, v0: 0.4, v1: 3.4 };
const arcade: PropArt = {
  len: 5,
  dep: 4,
  height: 13,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const { u0, u1, v0, v1 } = ARC;
    const k = still(v, 'arcade', 13, (k) => {
      k.shadow(2.5, 2.0, 2.6, 2.1, 0.32);
      const body = '#23272b';
      // the cabinet: base, the control panel jutting out, the screen's
      // hood, the marquee
      k.box(u0, v0, 0, u1 - u0, v1 - v0, 6.2, body);
      k.poly([[u0, v1, 6.2], [u1, v1, 6.2], [u1, v1 + 0.5, 6.9], [u0, v1 + 0.5, 6.9]], shade(body, 0.1), k.thin);
      k.box(u0, v0, 6.2, u1 - u0, 1.6, 6.4, body);
      k.poly([[u0, v0 + 1.6, 6.9], [u1, v0 + 1.6, 6.9], [u1, v0 + 1.6, 11.0], [u0, v0 + 1.6, 11.0]], '#14181a', k.thin);
      k.box(u0 - 0.05, v0, 11.0, u1 - u0 + 0.1, 2.1, 1.6, body);
      // the marquee: a glowing band with a shape on it
      k.poly([[u0 + 0.2, v0 + 2.11, 11.2], [u1 - 0.2, v0 + 2.11, 11.2], [u1 - 0.2, v0 + 2.11, 12.4], [u0 + 0.2, v0 + 2.11, 12.4]], k.vgrad(2.5, v0 + 2.1, 11.2, 12.4, [[0, '#ff4fb0'], [1, '#9a5ad8']]), k.thin);
      k.poly([[2.1, v0 + 2.12, 11.4], [2.9, v0 + 2.12, 11.4], [2.5, v0 + 2.12, 12.2]], '#ffe066', 0);
      k.halo(2.5, v0 + 2.3, 11.8, 2.4, '#ff4fb0', 0.35);
      // side art on the +u end: a purple sweep and stars
      k.poly([[u1 + 0.01, v0 + 0.3, 0.6], [u1 + 0.01, v1 - 0.2, 0.6], [u1 + 0.01, v1 - 0.2, 4.0], [u1 + 0.01, v0 + 1.3, 9.5], [u1 + 0.01, v0 + 0.3, 11.5]], k.side('#5e3d8a', 1, 0, 0.16), 0);
      for (let i = 0; i < 4; i++) k.dot(u1 + 0.02, v0 + 0.5 + hash(v.seed, i, 1) * 2, 2 + hash(v.seed, i, 2) * 7, 0.12, '#ffe066');
      // the control panel: a joystick and buttons
      k.rod([[1.4, v1 + 0.1, 6.55], [1.4, v1 + 0.1, 7.6]], '#2a2f33', 0.12);
      k.dot(1.4, v1 + 0.1, 7.7, 0.32, '#c0392f');
      for (let i = 0; i < 3; i++) k.disc(2.5 + i * 0.6, v1 + 0.15 + (i & 1) * 0.1, 6.62, 0.22, ['#ffe066', '#39a85a', '#2b5fb8'][i], k.thin * 0.6);
      // the coin door
      k.rect(2.0, 2.4, 3.0, 4.2, v1 + 0.01, '#3a4045', k.thin);
      k.rect(2.35, 3.4, 2.65, 3.8, v1 + 0.02, '#ff5a4a', 0);
    });
    // the screen
    const q: Quad = [[u0 + 0.35, v0 + 1.62, 7.2], [u1 - 0.35, v0 + 1.62, 7.2], [u1 - 0.35, v0 + 1.62, 10.7], [u0 + 0.35, v0 + 1.62, 10.7]];
    glass(k, q, '#06080e', 0.15, 0);
    const t = pace(v, 2);
    const pen = k.pen;
    // falling blocks
    pen.beginPath();
    for (let i = 0; i < 6; i++) {
      const fu = 0.1 + hash(v.seed, i, 3) * 0.75;
      const fz = 1 - (((t * (0.25 + hash(v.seed, i, 4) * 0.3) + hash(v.seed, i, 5)) % 1) * 0.9 + 0.05);
      k.trace([on(q, fu, fz), on(q, fu + 0.12, fz), on(q, fu + 0.12, fz + 0.08), on(q, fu, fz + 0.08)]);
    }
    pen.fillStyle = '#5fe0ff';
    pen.fill();
    // the ship along the bottom
    const sx = 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.3));
    k.poly([on(q, sx - 0.09, 0.08), on(q, sx + 0.09, 0.08), on(q, sx, 0.2)], '#39ff6e', 0);
    k.poly([on(q, sx - 0.01, 0.22), on(q, sx + 0.01, 0.22), on(q, sx + 0.01, 0.4), on(q, sx - 0.01, 0.4)], Math.floor(t * 2) % 2 ? '#ffe066' : '#06080e', 0);
    sheen(k, q, 0.1);
    k.halo(2.5, v0 + 2.6, 9.0, 2.6, '#5fe0ff', 0.18);
  },
};

// ── a heap of old computers ─────────────────────────────────────────────────
// A beige tower on its side, a CRT on it, keyboards stacked, a crate of
// cables, a floppy or two on the floor.
const junk: PropArt = {
  len: 7,
  dep: 5,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.5, 2.5, 3.6, 2.6, 0.28);
    k.box(0.5, 0.6, 0, 4.2, 2.2, 1.8, C.beige, { line: k.lw });
    k.rect(0.9, 0.5, 2.6, 1.5, 2.81, shade(C.beige, -0.15), k.thin * 0.6);
    const q = crt(k, 0.8, 0.5, 1.8, 3.2, 2.2, 2.8, C.beigeDark);
    glass(k, q, '#1a2420');
    k.poly([on(q, 0.2, 0.2), on(q, 0.45, 0.65), on(q, 0.55, 0.3)], '#2a3634', 0);
    sheen(k, q, 0.1);
    crate(k, 4.9, 0.5, 0, 2.0, 2.2, 1.8, '#c0392f');
    for (let i = 0; i < 4; i++) {
      const a: P3 = [5.2 + i * 0.4, 1.2 + i * 0.25, 1.8];
      cable(k, droop(a, [a[0] + 0.6, a[1] + 1.4, 0.2], -0.6, 5), ['#1c2226', '#2b5fb8', '#ffd23e', '#1c2226'][i], 0.12);
    }
    for (let i = 0; i < 3; i++) k.box(1.0 + i * 0.2, 3.1 + i * 0.05, i * 0.32, 4.4, 1.5, 0.32, i === 1 ? '#2a2f33' : C.beige, { line: k.thin, stripe: false });
    for (let i = 0; i < 2; i++) k.poly([[5.0 + i * 0.9, 3.6 + i * 0.3, 0.03], [5.8 + i * 0.9, 3.5 + i * 0.3, 0.03], [5.9 + i * 0.9, 4.3 + i * 0.3, 0.03], [5.1 + i * 0.9, 4.4 + i * 0.3, 0.03]], ['#2b5fb8', '#2a2f33'][i], k.thin * 0.6);
  },
};

// ── a beanbag with a laptop ─────────────────────────────────────────────────
const lounger: PropArt = {
  len: 5,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    const col = ['#2f6e6a', '#c0392f', '#5e3d6e', '#d6a23e'][Math.floor(hash(v.seed, 1) * 4)];
    beanbag(k, 2.4, 2.3, 2.0, 2.7, col);
    // an open laptop leaning in the dent, glowing
    const z = 2.0;
    k.box(1.5, 2.4, z, 2.0, 1.4, 0.15, '#9aa5a1', { line: k.thin });
    k.poly([[1.5, 2.4, z + 0.15], [3.5, 2.4, z + 0.15], [3.5, 2.0, z + 1.5], [1.5, 2.0, z + 1.5]], '#3a4045', k.thin);
    k.poly([[1.65, 2.41, z + 0.25], [3.35, 2.41, z + 0.25], [3.35, 2.06, z + 1.4], [1.65, 2.06, z + 1.4]], '#0b1a14', 0);
    for (let i = 0; i < 4; i++) k.line([[1.8, 2.38 - i * 0.07, z + 0.45 + i * 0.22], [1.8 + 0.4 + hash(v.seed, i, 2) * 1.0, 2.38 - i * 0.07, z + 0.45 + i * 0.22]], i & 1 ? C.cyan : C.glyph, Math.max(0.6, 0.07 * k.s));
    k.halo(2.5, 2.6, z + 0.9, 2.2, C.green, 0.2);
    mug(k, 4.4, 4.2, 0, '#c0392f', 0.4);
  },
};

// ── a 3D printer on a cart ──────────────────────────────────────────────────
// An open frame printer on a steel cart, a half-printed model on its bed,
// spools of filament on the shelf below.
const printer: PropArt = {
  len: 5,
  dep: 5,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.6, 2.6, 0.28);
    for (const [u, w] of [[0.6, 0.6], [4.2, 0.6], [0.6, 4.2], [4.2, 4.2]] as const) {
      k.rod([[u, w, 0.4], [u, w, 4.4]], '#5d6864', 0.18);
      k.dot(u, w, 0.2, 0.2, '#1b1f22');
    }
    k.box(0.4, 0.4, 1.2, 4.2, 4.2, 0.25, '#5d6864', { line: k.thin, stripe: false });
    const spools = ['#39ff6e', '#ff4fb0', '#ffb000'];
    spools.forEach((c, i) => k.cyl(1.4 + i * 1.2, 2.6, 1.45, 0.55, 0.9, c, { top: shade(c, 0.2) }));
    k.box(0.3, 0.3, 4.4, 4.4, 4.4, 0.3, '#5d6864', { line: k.lw });
    // the printer: a frame, the bed, the gantry and its head
    const z = 4.7;
    k.box(0.8, 0.8, z, 3.4, 3.4, 0.5, '#2a2f33', { line: k.thin });
    for (const u of [0.9, 3.9]) k.box(u, 1.0, z, 0.3, 0.3, 4.6, '#c3ccc8', { line: k.thin, stripe: false });
    k.box(1.0, 1.4, z + 0.5, 3.0, 2.6, 0.12, '#3a4045', { line: k.thin, stripe: false });
    // the half-printed model: a little tower
    k.box(2.0, 2.2, z + 0.62, 1.0, 1.0, 1.4, C.green, { line: k.thin });
    k.box(0.9, 1.0, z + 4.4, 3.3, 0.35, 0.3, '#c3ccc8', { line: k.thin, stripe: false });
    k.box(2.2, 0.9, z + 2.1, 0.6, 0.6, 0.6, '#2a2f33', { line: k.thin });
    k.rod([[2.5, 1.2, z + 2.1], [2.5, 1.4, z + 2.05]], '#c3ccc8', 0.06);
    cable(k, droop([0.9, 1.2, z + 4.6], [2.5, 1.1, z + 2.7], -0.4, 5), '#1c2226', 0.08);
    k.dot(4.15, 4.25, z + 0.25, 0.1, '#5fe0ff');
  },
};

// ── crates of parts ─────────────────────────────────────────────────────────
const crates: PropArt = {
  len: 5,
  dep: 4,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.0, 2.7, 2.2, 0.28);
    const cols = ['#3c78c8', '#c0392f', '#39a85a', '#e8b030'];
    crate(k, 0.4, 0.4, 0, 2.6, 3.0, 2.2, cols[Math.floor(hash(v.seed, 1) * 4)]);
    crate(k, 0.5, 0.5, 2.2, 2.4, 2.8, 2.2, cols[Math.floor(hash(v.seed, 2) * 4)]);
    crate(k, 2.9, 0.6, 0, 1.9, 2.8, 1.9, cols[Math.floor(hash(v.seed, 3) * 4)]);
    // a coil of cable on top, a board poking out
    for (const r of [0.75, 0.6]) {
      const e = k.ell(1.7, 1.9, 4.45 + (0.75 - r), r);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      k.pen.strokeStyle = '#11161a';
      k.pen.lineWidth = 0.32 * k.s;
      k.pen.stroke();
    }
    k.poly([[3.3, 1.3, 1.9], [4.4, 1.3, 1.9], [4.4, 1.5, 3.0], [3.3, 1.5, 3.0]], '#1f6a3a', k.thin);
    k.dot(3.8, 1.55, 2.4, 0.15, '#2a2f33');
  },
};

// ── a snake plant under a grow light ────────────────────────────────────────
const plant: PropArt = {
  len: 4,
  dep: 4,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2, 2, 1.7, 1.7, 0.28);
    k.pool(2, 2, 2.6, 2.6, '#c06aff', 0.2);
    snakePlant(k, 2, 2, 0, 1.2, 6.5, v.seed, ['#c66a42', '#e9ecea', '#2a2f33'][Math.floor(hash(v.seed, 1) * 3)]);
    // the grow light: a stand bending over it, a purple bar
    k.rod([[3.5, 3.3, 0], [3.5, 3.3, 9.0], [2.4, 2.4, 9.6]], '#2a2f33', 0.14);
    k.cyl(3.5, 3.3, 0, 0.55, 0.15, '#2a2f33', { line: k.thin });
    k.box(1.4, 1.6, 9.4, 1.8, 1.0, 0.35, '#2a2f33', { line: k.thin });
    k.halo(2.3, 2.1, 9.2, 3.2, '#c06aff', 0.4);
    k.poly([[1.5, 1.7, 9.39], [3.1, 1.7, 9.39], [3.1, 2.5, 9.39], [1.5, 2.5, 9.39]], '#f0c8ff', 0);
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: pizza, count: 1, place: 'floor' },
  { art: arcade, count: 1, place: 'floor' },
  { art: plant, count: 1, place: 'floor' },
  { art: junk, count: 1, place: 'floor' },
  { art: lounger, count: 1, place: 'floor' },
  { art: crates, count: 1, place: 'floor' },
  { art: printer, count: 1, place: 'floor' },
  { art: pizza, count: 1, place: 'floor' },
  { art: plant, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: arcade, count: 1, place: 'floor' },
  { art: crates, count: 1, place: 'floor' },
  { art: lounger, count: 1, place: 'floor' },
  { art: junk, count: 1, place: 'floor' },
  { art: pizza, count: 1, place: 'floor' },
];

export const DECOR_ART = { pizza, arcade, junk, lounger, printer, crates, plant };
