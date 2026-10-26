import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { beanbag as bag, dome, frustum, monstera, mug, paddle, pot, snake, stool } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, circle, hash, kitOf, withAlpha } from './kit.ts';

// The Startup's furniture between the stations: a bench of standing desks
// backed onto a wall, a ping-pong table, beanbags, potted plants and
// fiddle-leaf figs, a snack shelf, a phone booth, standing lamps, a drinks
// fridge and a sofa (the bike hangs on the wall, the shell's: see room.ts).
// All still (drawn once into the scene's static layer), each on its own
// soft shadow, varied by seed. No maker's name or label on any of it.

const quad = (u0: number, z0: number, u1: number, z1: number, n: number): P3[] => [[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]];

// ── the ping-pong table ─────────────────────────────────────────────────────
// A blue top with white edge lines and a centre line on black legs, a net
// across the middle, two paddles and a ball lying on it.

const PP = { u0: 0.5, u1: 13.5, v0: 0.6, v1: 7.4, z: 4.2 };

const pingpong: PropArt = {
  len: 14,
  dep: 8,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    const { u0, u1, v0, v1, z } = PP;
    const top = z + 0.35;
    k.shadow(7, 4, 7.4, 4.2, 0.28);
    // the legs and their frame
    for (const [u, w] of [[1.6, 1.4], [12.4, 1.4], [6.7, 1.4], [1.6, 6.6], [12.4, 6.6], [6.7, 6.6]] as const) k.box(u - 0.22, w - 0.22, 0, 0.44, 0.44, z, C.steel, { line: k.thin });
    k.rod([[1.6, 4, 1.2], [12.4, 4, 1.2]], C.steel, 0.16);
    for (const u of [1.6, 12.4]) k.rod([[u, 1.4, 1.2], [u, 6.6, 1.2]], C.steel, 0.16);
    // the top, its lines
    k.box(u0, v0, z, u1 - u0, v1 - v0, 0.35, C.table);
    const e = 0.18;
    const lines: Array<[P3, P3]> = [
      [[u0 + e, v0 + e, top + 0.01], [u1 - e, v0 + e, top + 0.01]],
      [[u0 + e, v1 - e, top + 0.01], [u1 - e, v1 - e, top + 0.01]],
      [[u0 + e, v0 + e, top + 0.01], [u0 + e, v1 - e, top + 0.01]],
      [[u1 - e, v0 + e, top + 0.01], [u1 - e, v1 - e, top + 0.01]],
      [[u0 + e, (v0 + v1) / 2, top + 0.01], [u1 - e, (v0 + v1) / 2, top + 0.01]],
    ];
    k.segs(lines, C.net, Math.max(0.8, 0.13 * k.s));
    // a paddle on this side of the net
    bat(k, 3.2, 2.6, top, C.chartHot, 0.6);
    // the net across the middle: its posts, the mesh, a white tape
    const nu = 7;
    for (const w of [v0 - 0.15, v1 + 0.15]) k.box(nu - 0.15, w - 0.15, top - 0.5, 0.3, 0.3, 1.3, C.steel, { line: k.thin });
    k.poly([[nu, v0 - 0.1, top], [nu, v1 + 0.1, top], [nu, v1 + 0.1, top + 0.8], [nu, v0 - 0.1, top + 0.8]], withAlpha('#f2f2f2', 0.35), k.thin * 0.7);
    if (k.fine) {
      const mesh: Array<[P3, P3]> = [];
      for (let w = v0 + 0.3; w < v1; w += 0.35) mesh.push([[nu, w, top], [nu, w, top + 0.8]]);
      for (let zz = top + 0.2; zz < top + 0.8; zz += 0.2) mesh.push([[nu, v0, zz], [nu, v1, zz]]);
      k.segs(mesh, withAlpha(INK, 0.3), 0.04 * k.s);
    }
    k.line([[nu, v0 - 0.1, top + 0.8], [nu, v1 + 0.1, top + 0.8]], C.net, Math.max(1, 0.18 * k.s));
    // the other paddle, the ball
    bat(k, 10.4, 5.2, top, C.chart, -2.2);
    const [x, y] = k.p(9.0, 3.0, top + 0.22);
    k.pen.beginPath();
    k.pen.arc(x, y, Math.max(1.2, 0.22 * k.s), 0, Math.PI * 2);
    k.paint('#ffffff', k.thin);
  },
};

// A paddle lying flat at (u, v) on z, its handle toward angle a.
function bat(k: Kit, u: number, v: number, z: number, c: Color, a: number): void {
  k.rod([[u + Math.cos(a) * 0.5, v + Math.sin(a) * 0.5, z + 0.08], [u + Math.cos(a) * 1.25, v + Math.sin(a) * 1.25, z + 0.08]], C.birch, 0.2);
  k.cyl(u, v, z, 0.62, 0.1, c, { line: k.thin });
}

// ── beanbags ────────────────────────────────────────────────────────────────

// A big pear-shaped beanbag in coral, blue or sunflower by seed, its seat
// dented in.

const beanbag: PropArt = {
  len: 6,
  dep: 6,
  height: 4.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    bag(k, 3, 3.05, 2.45, 4.4, [C.fabricA, C.fabricB, C.fabricC][v.seed % 3]);
  },
};

// ── plants ──────────────────────────────────────────────────────────────────
// A snake plant or a monstera by seed, in a white or a terracotta pot; a
// big fiddle-leaf fig in a white pot.

const plant: PropArt = {
  len: 3,
  dep: 3,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    pot(k, 1.5, 1.5, 0, 1.0, 2.0, hash(v.seed, 1) < 0.5 ? C.pot : C.terracotta);
    if (hash(v.seed, 2) < 0.5) snake(k, 1.5, 1.5, 1.95, 3.7, v.seed);
    else monstera(k, 1.5, 1.5, 1.95, 3.6, v.seed);
  },
};

const fig: PropArt = {
  len: 4,
  dep: 4,
  height: 14,
  draw(v: PropView): void {
    const k = kitOf(v);
    pot(k, 2, 2, 0, 1.25, 3.0, C.pot);
    // the trunk, a little crooked
    k.line([[2, 2, 2.9], [1.9, 2.05, 6], [2.15, 1.95, 8.5], [2.05, 2.0, 10.6]], '#6a4a2e', Math.max(1, 0.24 * k.s));
    // big leaves crowding the top of the trunk, a few lower down, far ones
    // first
    const leaves: Array<{ u: number; v: number; z: number; a: number; d: number; l: number }> = [];
    const n = 17;
    for (let i = 0; i < n; i++) {
      const th = hash(v.seed, i, 3) * Math.PI * 2;
      const f = Math.sqrt(i / (n - 1));
      const z = 5.4 + f * 5.4 + hash(v.seed, i, 4) * 0.5;
      const rr = 0.3 + hash(v.seed, i, 5) * 0.55;
      const u = 2 + Math.cos(th) * rr;
      const w = 2 + Math.sin(th) * rr;
      leaves.push({ u, v: w, z, a: th, d: u + w + (z - 8) * 0.15, l: 2.0 + hash(v.seed, i, 6) * 0.7 });
    }
    leaves.sort((p, q) => p.d - q.d);
    const [cx] = k.p(2, 2, 0);
    for (const [i, lf] of leaves.entries()) {
      const [x, y] = k.p(lf.u, lf.v, lf.z);
      // out from the trunk on screen, drooping a little
      const side = x >= cx ? 1 : -1;
      const ang = side > 0 ? -0.75 + hash(v.seed, i, 7) * 0.95 : Math.PI + 0.75 - hash(v.seed, i, 7) * 0.95;
      const c = lf.d < 3.7 ? '#3e7d4a' : i & 1 ? C.leaf : C.leafLight;
      paddle(k, x, y, ang, lf.l * k.s, c, false, true);
    }
  },
};

// ── the snack shelf ─────────────────────────────────────────────────────────
// Open birch shelves: a basket of bottled water, jars of snacks, two cereal
// dispensers, a stack of paper cups and a bowl of fruit.

const snacks: PropArt = {
  len: 7,
  dep: 3,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    const [v0, v1] = [0.3, 2.7];
    k.shadow(3.5, 1.6, 3.6, 1.6, 0.28);
    k.box(0.2, v0, 0, 0.35, v1 - v0, 11.8, C.birch, { line: k.thin });
    k.poly(quad(0.55, 0.3, 6.45, 11.5, v0 + 0.05), k.side(C.birchDark, 0, 1, 0.1), k.thin);
    const levels = [0.3, 4.0, 7.7];
    for (const z of levels) k.box(0.55, v0, z, 5.9, v1 - v0, 0.3, C.birch, { line: k.thin });
    // the bottom: a basket of water bottles
    const z0 = levels[0] + 0.3;
    for (let i = 0; i < 4; i++) {
      const u = 1.4 + i * 0.75;
      k.cyl(u, 1.2, z0, 0.3, 2.1, '#cfe7f2', { line: k.thin * 0.8 });
      k.cyl(u, 1.2, z0 + 2.1, 0.14, 0.35, C.chart, { line: k.thin * 0.7 });
    }
    k.box(0.9, 1.4, z0, 3.4, 1.1, 1.2, '#c8a06a', { line: k.thin });
    if (k.fine) k.segs([[[0.95, 2.51, z0 + 0.4], [4.25, 2.51, z0 + 0.4]], [[0.95, 2.51, z0 + 0.8], [4.25, 2.51, z0 + 0.8]]], withAlpha('#8a6a3a', 0.8), 0.07 * k.s);
    k.cyl(5.4, 1.5, z0, 0.42, 2.4, C.white, { line: k.thin });
    // the middle: jars of snacks
    const z1 = levels[1] + 0.3;
    for (const [i, c] of (['#d9a35a', '#ff8f6b', '#b98c5a', '#79bf6c', '#c3b1ff'] as const).entries()) {
      const u = 1.2 + i * 1.12;
      k.cyl(u, 1.5, z1, 0.45, 1.7, '#dce9ee', { line: k.thin });
      k.cyl(u, 1.5, z1 + 0.08, 0.38, 1.1, c, { line: 0 });
      k.cyl(u, 1.5, z1 + 1.7, 0.48, 0.3, C.birchDark, { line: k.thin });
    }
    // the top: two cereal dispensers, a stack of cups, a bowl of fruit
    const z2 = levels[2] + 0.3;
    for (const [i, c] of (['#e8b44a', '#a8643a'] as const).entries()) {
      const u = 1.3 + i * 1.25;
      k.box(u - 0.5, 1.0, z2, 1.0, 1.0, 0.7, '#2c2e33', { line: k.thin });
      k.cyl(u, 1.5, z2 + 0.7, 0.48, 2.5, '#dce9ee', { line: k.thin });
      k.cyl(u, 1.5, z2 + 0.75, 0.41, 1.6, c, { line: 0 });
      k.cyl(u, 1.5, z2 + 3.2, 0.5, 0.25, '#2c2e33', { line: k.thin });
      k.box(u - 0.15, 1.9, z2 + 0.3, 0.3, 0.3, 0.3, C.chrome, { line: k.thin * 0.7 });
    }
    k.cyl(4.1, 1.5, z2, 0.38, 2.2, C.white, { line: k.thin });
    if (k.fine) k.segs([0.5, 1.0, 1.5].map((dz): [P3, P3] => [[3.75, 1.88, z2 + dz], [4.45, 1.88, z2 + dz]]), withAlpha(INK, 0.3), 0.05 * k.s);
    frustum(k, 5.5, 1.5, z2, 0.4, z2 + 0.5, 0.7, C.white, '#e8e2d6');
    for (const [du, dv, c] of [[-0.25, -0.15, '#ff9f43'], [0.25, -0.1, '#e53935'], [0, 0.2, '#8bc34a']] as const) {
      const [x, y] = k.p(5.5 + du, 1.5 + dv, z2 + 0.6);
      k.pen.beginPath();
      k.pen.arc(x, y, 0.3 * k.s, 0, Math.PI * 2);
      k.paint(c, k.thin);
    }
    // the near side and the top board
    k.box(6.45, v0, 0, 0.35, v1 - v0, 11.8, C.birch, { line: k.thin });
    k.box(0.2, v0, 11.5, 6.6, v1 - v0, 0.3, C.birch, { line: k.thin });
  },
};

// ── the phone booth ─────────────────────────────────────────────────────────
// A tall acoustic pod: a birch shell with teal felt panels, a glass door
// on its front with a bar handle, and inside a stool, a shelf to lean on
// and a little lamp, lit.

const booth: PropArt = {
  len: 6,
  dep: 6,
  height: 19,
  draw(v: PropView): void {
    const k = kitOf(v);
    const [a, b] = [0.3, 5.7];
    const H = 18.4;
    k.shadow(3, 3.1, 3.3, 3.3, 0.3);
    k.box(a + 0.2, a + 0.2, 0, b - a - 0.4, b - a - 0.4, 0.25, C.base, { line: k.thin, stripe: false });
    k.box(a, a, 0.25, b - a, b - a, H - 0.25, C.birch);
    k.box(a - 0.1, a - 0.1, H, b - a + 0.2, b - a + 0.2, 0.45, C.birchDark);
    // through the glass: the felt inside, the shelf, the stool, the lamp
    const n = b + 0.01;
    const [g0, g1, gz0, gz1] = [a + 0.55, b - 0.55, 0.6, H - 0.6];
    const pen = k.pen;
    pen.save();
    pen.beginPath();
    k.trace(quad(g0, gz0, g1, gz1, n));
    pen.clip();
    const back = a + 0.5;
    k.poly(quad(a, 0, b, H, back), shade(C.felt, -0.12), 0);
    if (k.fine) k.segs([1.4, 2.4, 3.4, 4.4].map((u): [P3, P3] => [[u, back + 0.01, 1], [u, back + 0.01, H - 1]]), withAlpha('#1f4a46', 0.5), 0.08 * k.s);
    k.poly([[g0, back, gz0], [g1, back, gz0], [g1, n, gz0], [g0, n, gz0]], '#4a4c52', 0);
    k.poly([[g0, back, gz0], [g0, n, gz0], [g0, n, gz1], [g0, back, gz1]], k.side(C.felt, 1, 0, 0.12), 0);
    k.wash(3, back + 0.05, 13, 2.6, 4.5, C.lamp, 0.35);
    k.box(g0, back, 8.6, g1 - g0, 1.5, 0.3, C.birch, { line: k.thin });
    k.box(2.0, back + 0.3, 8.9, 1.6, 1.0, 0.12, '#c9ccd2', { line: k.thin * 0.8 });
    stool(k, 3.2, 3.6, 5.6, C.chartWarm, 0.75);
    dome(k, 3, 2.6, 15.6, 0.7, C.white, C.lamp);
    k.halo(3, 2.6, 15.3, 2.0, C.lamp, 0.45);
    pen.restore();
    // the glass over it, a streak of reflection, the frame and the handle
    k.poly(quad(g0, gz0, g1, gz1, n), withAlpha(C.glass, 0.25), 0);
    k.poly([[g0 + 0.3, n + 0.01, gz1 - 0.6], [g0 + 0.9, n + 0.01, gz1 - 0.6], [g0 + 0.6, n + 0.01, gz1 - 5], [g0 + 0.25, n + 0.01, gz1 - 5]], withAlpha('#ffffff', 0.25), 0);
    k.pen.beginPath();
    k.trace(quad(g0, gz0, g1, gz1, n));
    k.paint(null, k.thin);
    k.rod([[g1 - 0.45, n + 0.3, 7.5], [g1 - 0.45, n + 0.3, 11.5]], C.frame, 0.16);
    // the felt panels on its side
    const m = b + 0.01;
    k.poly([[m, a + 0.5, 0.8], [m, b - 0.5, 0.8], [m, b - 0.5, 8.9], [m, a + 0.5, 8.9]], k.side(C.felt, 1, 0, 0.14), k.thin);
    k.poly([[m, a + 0.5, 9.3], [m, b - 0.5, 9.3], [m, b - 0.5, H - 0.6], [m, a + 0.5, H - 0.6]], k.side(C.felt, 1, 0, 0.14), k.thin);
    if (k.fine) k.segs([1.6, 2.6, 3.6, 4.6].map((w): [P3, P3] => [[m + 0.01, w, 1.2], [m + 0.01, w, H - 1]]), withAlpha('#1f4a46', 0.4), 0.07 * k.s);
    // a vent on top
    k.poly([[2.0, 2.0, H + 0.46], [4.0, 2.0, H + 0.46], [4.0, 4.0, H + 0.46], [2.0, 4.0, H + 0.46]], '#3a3c42', k.thin);
  },
};

// ── the standing lamps ──────────────────────────────────────────────────────
// By seed: an arc lamp (a heavy base, a curved steel arm, a dome shade) or
// a tripod lamp (three birch legs, a linen drum); lit, with a soft warm
// pool under it.

const lamp: PropArt = {
  len: 3,
  dep: 3,
  height: 16,
  draw(v: PropView): void {
    const k = kitOf(v);
    if (hash(v.seed, 1) < 0.5) {
      k.pool(2.3, 1.1, 1.4, 1.0, C.lamp, 0.32);
      k.shadow(0.8, 2.1, 0.9, 0.9, 0.3);
      k.cyl(0.8, 2.1, 0, 0.72, 0.45, C.white);
      // the arm: a cubic from the base up and over to the shade
      const B: P3[] = [[0.8, 2.1, 0.45], [0.65, 2.25, 12.5], [1.3, 1.7, 17.4], [2.35, 1.05, 13.7]];
      const arm: P3[] = [];
      for (let i = 0; i <= 16; i++) {
        const t = i / 16;
        const m = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3];
        arm.push([0, 1, 2].map((j) => m.reduce((acc, w, q) => acc + w * B[q][j], 0)) as P3);
      }
      k.rod(arm, C.chrome, 0.15);
      dome(k, 2.35, 1.05, 12.75, 0.95, C.chartWarm, C.lamp);
      k.halo(2.35, 1.05, 12.3, 1.6, C.lamp, 0.5);
      return;
    }
    k.pool(1.5, 1.6, 1.4, 1.2, C.lamp, 0.28);
    k.shadow(1.5, 1.5, 1.3, 1.3, 0.24);
    const apex: P3 = [1.5, 1.5, 9.6];
    const feet: P3[] = [0.6, 2.7, 4.8].map((a) => [1.5 + Math.cos(a) * 1.2, 1.5 + Math.sin(a) * 1.2, 0]);
    feet.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    for (const f of feet.slice(0, 2)) k.rod([f, apex], C.birch, 0.16);
    k.cyl(1.5, 1.5, 9.4, 1.05, 3.0, '#f3ead6', { top: '#ffe9b0' });
    k.halo(1.5, 1.5, 11, 1.4, C.lamp, 0.4);
    k.rod([feet[2], [1.5, 1.5, 9.4]], C.birch, 0.16);
  },
};

// ── the drinks fridge ───────────────────────────────────────────────────────
// A white fridge with a glass door, lit inside: rows of bottles and cans
// in plain colours, no labels.

const cooler: PropArt = {
  len: 4,
  dep: 3,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    const [a, b] = [0.3, 3.7];
    const [w0, w1] = [0.3, 2.7];
    const H = 10.8;
    k.shadow(2, 1.6, 2.1, 1.6, 0.3);
    k.box(a, w0, 0, b - a, w1 - w0, H, '#ecebe6');
    const n = w1 + 0.01;
    const [g0, g1, z0, z1] = [a + 0.35, b - 0.35, 1.2, H - 0.4];
    k.poly(quad(a + 0.1, 0.15, b - 0.1, 0.95, n), '#3a3c42', k.thin);
    if (k.fine) k.segs([0.4, 0.65].map((z): [P3, P3] => [[a + 0.4, n + 0.01, z], [b - 0.4, n + 0.01, z]]), withAlpha('#ffffff', 0.25), 0.06 * k.s);
    // inside: a cool light, shelves of drinks
    k.poly(quad(g0, z0, g1, z1, n), k.vgrad(2, n, z0, z1, [[0, '#cfe3ea'], [1, '#f2fafd']]), 0);
    const cols: Color[] = [C.chartHot, C.chart, C.chartWarm, C.noteLilac, C.white, C.fabricA];
    const rows = [z0 + 0.15, z0 + 2.4, z0 + 4.65, z0 + 6.9];
    for (const [r, z] of rows.entries()) {
      k.line([[g0, n, z - 0.05], [g1, n, z - 0.05]], '#9fb3bd', Math.max(0.7, 0.1 * k.s));
      const bottles = r % 2 === 1;
      for (let i = 0; i < 4; i++) {
        const u = g0 + 0.18 + i * 0.68;
        const c = cols[Math.floor(hash(v.seed, r, i) * cols.length)];
        if (bottles) {
          k.poly(quad(u + 0.06, z, u + 0.44, z + 1.3, n), c, k.thin * 0.7, 0.08);
          k.poly(quad(u + 0.17, z + 1.3, u + 0.33, z + 1.8, n), c, k.thin * 0.7);
        } else {
          k.poly(quad(u, z, u + 0.5, z + 0.95, n), c, k.thin * 0.7, 0.06);
          k.line([[u + 0.05, n, z + 0.82], [u + 0.45, n, z + 0.82]], withAlpha('#ffffff', 0.6), Math.max(0.6, 0.06 * k.s));
        }
      }
    }
    // the glass, a streak, the frame and the handle
    k.poly(quad(g0, z0, g1, z1, n), withAlpha(C.glass, 0.2), 0);
    k.poly([[g0 + 0.2, n + 0.01, z1 - 0.3], [g0 + 0.6, n + 0.01, z1 - 0.3], [g0 + 0.35, n + 0.01, z1 - 3.5], [g0 + 0.15, n + 0.01, z1 - 3.5]], withAlpha('#ffffff', 0.35), 0);
    k.pen.beginPath();
    k.trace(quad(g0, z0, g1, z1, n));
    k.paint(null, Math.max(1, 0.2 * k.s), C.steel);
    k.rod([[b - 0.2, n + 0.25, 4.5], [b - 0.2, n + 0.25, 8.5]], C.steel, 0.14);
    k.halo((a + b) / 2, n + 0.3, (z0 + z1) / 2, 1.4, '#e8f6ff', 0.25);
  },
};

// ── more desks ──────────────────────────────────────────────────────────────
// A bench of two standing desks side by side, backed onto a wall (like the
// write desk), white tops on black frames:
// on one a monitor (abstract code on its screen, still), a keyboard and a
// plant; on the other an open laptop, a notebook, headphones and a mug; a
// mat to stand on in front of each.

const DZ = 9.3;

const desks: PropArt = {
  len: 12,
  dep: 6,
  height: 15,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 3, 6.4, 3.2, 0.28);
    // the mats
    for (const u0 of [1.4, 7.4]) k.poly([[u0, 4.5, 0.03], [u0 + 3.2, 4.5, 0.03], [u0 + 3.2, 5.6, 0.03], [u0, 5.6, 0.03]], '#5c5f67', k.thin, 0.3);
    // the frame: three legs on feet, a beam under the tops
    for (const u of [0.7, 6.0, 11.3]) {
      k.box(u - 0.35, 0.6, 0, 0.7, 3.8, 0.35, C.steel, { line: k.thin });
      k.box(u - 0.3, 2.2, 0.35, 0.6, 0.6, DZ - 0.75, C.steel, { line: k.thin });
    }
    k.box(0.9, 2.3, DZ - 1.1, 10.2, 0.4, 0.6, C.steel, { line: k.thin, stripe: false });
    k.box(0.2, 0.5, DZ - 0.4, 5.7, 3.9, 0.4, C.white);
    k.box(6.1, 0.5, DZ - 0.4, 5.7, 3.9, 0.4, C.white);
    // the left desk: a monitor on its stand, a keyboard, a plant
    k.box(2.75, 1.0, DZ, 0.9, 0.7, 0.15, '#2c2e33', { line: k.thin });
    k.box(3.0, 1.15, DZ + 0.15, 0.4, 0.3, 1.2, '#2c2e33', { line: k.thin });
    k.box(1.0, 1.4, DZ + 1.2, 4.4, 0.35, 2.9, '#25272c', { line: k.lw, round: 0.12 });
    const n = 1.76;
    k.poly([[1.18, n, DZ + 1.38], [5.22, n, DZ + 1.38], [5.22, n, DZ + 3.92], [1.18, n, DZ + 3.92]], k.vgrad(3.2, n, DZ + 1.4, DZ + 3.9, [[0, '#18283c'], [1, '#22384f']]), 0);
    const code: Array<[P3, P3, Color]> = [];
    for (let r = 0; r < 5; r++) {
      let u = 1.5 + Math.floor(hash(v.seed, r, 1) * 3) * 0.35;
      for (let j = 0; j < 2; j++) {
        const len = 0.4 + hash(v.seed, r, 2 + j) * 0.9;
        if (u + len > 4.9) break;
        code.push([[u, n + 0.01, DZ + 3.55 - r * 0.45], [u + len, n + 0.01, DZ + 3.55 - r * 0.45], [C.chart, C.chartWarm, C.noteLilac, C.screenGlow][Math.floor(hash(v.seed, r, 5 + j) * 4)]]);
        u += len + 0.25;
      }
    }
    for (const c of [C.chart, C.chartWarm, C.noteLilac, C.screenGlow]) k.segs(code.filter((q) => q[2] === c).map(([a, b]) => [a, b] as [P3, P3]), c, Math.max(0.8, 0.16 * k.s), 'round');
    k.box(1.5, 2.6, DZ, 3.2, 0.95, 0.15, '#e3e6ea', { line: k.thin });
    pot(k, 5.2, 3.6, DZ, 0.45, 0.9, C.terracotta);
    const [px, py] = k.p(5.2, 3.6, DZ + 0.9);
    for (let i = 0; i < 4; i++) {
      k.pen.beginPath();
      k.pen.ellipse(px + (i - 1.5) * 0.25 * k.s, py - 0.35 * k.s - (i & 1) * 0.2 * k.s, 0.38 * k.s, 0.24 * k.s, (i - 1.5) * 0.5, 0, Math.PI * 2);
      k.paint(i & 1 ? C.leaf : C.leafLight, k.thin * 0.8);
    }
    // the right desk: an open laptop, a notebook, headphones, a mug
    k.box(7.6, 1.6, DZ, 3.0, 1.9, 0.12, '#c9ccd2', { line: k.thin });
    k.poly([[7.6, 1.6, DZ + 0.12], [10.6, 1.6, DZ + 0.12], [10.6, 1.25, DZ + 2.0], [7.6, 1.25, DZ + 2.0]], '#c9ccd2', k.lw);
    k.poly([[7.8, 1.62, DZ + 0.3], [10.4, 1.62, DZ + 0.3], [10.4, 1.3, DZ + 1.85], [7.8, 1.3, DZ + 1.85]], k.vgrad(9.1, 1.5, DZ + 0.3, DZ + 1.85, [[0, '#2a3f56'], [1, '#3c5a78']]), 0);
    k.segs([[[8.1, 1.55, DZ + 0.75], [9.4, 1.55, DZ + 0.75]], [[8.1, 1.48, DZ + 1.15], [9.9, 1.48, DZ + 1.15]], [[8.1, 1.42, DZ + 1.5], [9.0, 1.42, DZ + 1.5]]], C.chartWarm, Math.max(0.7, 0.13 * k.s), 'round');
    k.poly([[6.6, 2.4, DZ + 0.02], [7.5, 2.3, DZ + 0.02], [7.6, 3.7, DZ + 0.02], [6.7, 3.8, DZ + 0.02]], C.noteLilac, k.thin * 0.8);
    mug(k, 11.1, 3.7, DZ, C.chartHot, 0.32);
    const hp = circle(10.4, 3.9, DZ + 0.55, 0.5, 14, Math.PI, Math.PI * 2);
    k.line(hp.map(([a, , z]) => [a, 3.9, DZ + 0.1 + (z - DZ - 0.55) * -1] as P3), '#26272c', Math.max(0.8, 0.14 * k.s));
  },
};

// ── the sofa ────────────────────────────────────────────────────────────────
// A low modern sofa on tapered birch legs, in mustard, teal or coral by
// seed: a deep seat, back cushions, arms, throw cushions in the accents.

const sofa: PropArt = {
  len: 11,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = [C.fabricC, C.felt, C.fabricA][v.seed % 3];
    k.shadow(5.5, 2.2, 5.8, 2.1, 0.3);
    for (const [u, w] of [[1.0, 0.9], [10.0, 0.9], [1.0, 3.3], [10.0, 3.3]] as const) k.rod([[u, w, 1.0], [u, w, 0]], C.birchDark, 0.18);
    k.box(0.4, 0.4, 0.9, 10.2, 3.4, 0.9, shade(c, -0.08), { round: 0.2 });
    // the back
    k.box(0.4, 0.3, 1.8, 10.2, 1.2, 2.9, c, { round: 0.35 });
    // seat cushions
    for (const u0 of [1.5, 4.1, 6.7]) k.box(u0, 1.4, 1.8, 2.5, 2.4, 0.75, shade(c, 0.06), { round: 0.3, line: k.thin });
    // the arms
    for (const u0 of [0.4, 9.4]) k.box(u0, 0.4, 1.8, 1.2, 3.4, 1.6, c, { round: 0.35 });
    // throw cushions, leaning on the back
    const pair: Color[] = [[C.chart, C.notePink], [C.noteYellow, C.notePink], [C.noteTeal, C.noteYellow]][v.seed % 3];
    for (const [u, col] of [[2.6, pair[0]], [8.2, pair[1]]] as const) {
      k.poly([[u - 0.9, 1.55, 2.5], [u + 0.9, 1.55, 2.5], [u + 0.8, 1.35, 4.2], [u - 0.8, 1.35, 4.2]], col, k.thin, 0.35);
    }
  },
};

// The stage places these one after another, each where it fits best then,
// and leaves out what no longer fits: in this order (looked at in rooms
// from 80 x 24 to 200 x 60) no piece stands mostly hidden behind a station
// or squeezed into a gap between two others, and a small room keeps its
// windows rather than its fridge or booth (the shell keeps its windows
// clear of them).
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: sofa, count: 1, place: 'wall' },
  { art: lamp, count: 2, place: 'wall' },
  { art: pingpong, count: 1, place: 'floor' },
  { art: snacks, count: 1, place: 'wall' },
  { art: desks, count: 1, place: 'wall' },
  { art: plant, count: 3, place: 'wall' },
  { art: beanbag, count: 3, place: 'floor' },
  { art: fig, count: 2, place: 'wall' },
  { art: cooler, count: 1, place: 'wall' },
  { art: booth, count: 1, place: 'wall' },
];

export const DECOR_ART = { pingpong, beanbag, plant, fig, snacks, booth, lamp, cooler, desks, sofa };
