import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { ball, barrel, blaze, bookRow, crate, fillPts, fir, heap, hem, icicles, kettle, lantern, log, lump, mug, ring3, rock } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, SPOT, chip, due, ember, flake, hash, kitOf, still, wisp, withAlpha } from './kit.ts';

// Snowy Depths' stations, each a PropArt in its own frame (u along the
// wall, v out toward the agent, z up; the viewer always sees the top, the
// +v front and the +u end). Animated ones paint their still parts through
// the sprite cache (see still) and only the moving bits each frame; idle,
// they draw the same pixels every frame, so nothing has to be sent again.
//
//   write     the expedition desk: a ledger written up by quill and candle
//   read      the bookcase, snowed on, a lamp lit to read by
//   search    the ice face: relics frozen in a slab of clear ice, a pick
//   run       the iron stove: fire in its belly, a kettle on top
//   web       the radio: a valve set on a crate, an aerial on a mast
//   think     the fishing hole cut in the frozen pond, a stool and a rod
//   idle      the fire pit: fur-draped log benches, a kettle on a tripod
//   entrance  the ice gate: an igloo arch onto the snowy night

type Spawn = (p: Particle) => void;

// ── write: the expedition desk ──────────────────────────────────────────────
// A plank desk on log legs against the ice, a chart of the caves pinned up
// behind it: a big ledger open on it, ink and a quill, a candle lantern,
// books, a rolled chart and a mug of cocoa; a log stool with a fur on it.
// Working writes the ledger up, line by line.

const ZT = 6.9; // the desk top
const PAGE = { u0: 5.65, v0: 1.95, z: ZT + 0.27 };

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 16, (k) => {
      k.shadow(5.5, 3.4, 6.4, 3.8, 0.3);
      if (v.island) for (const u of [2.6, 8.2]) k.rod([[u, 0.1, 6.9], [u, 0.1, 14.6]], C.woodDark, 0.2);
      chart(k, 5.4, 0.15, 9.6, v.seed);
      for (const w of [1.1, 4.9]) for (const u of [1.1, 9.9]) if (w < 2) k.cyl(u, w, 0, 0.42, 6.2, C.bark);
      k.box(1.1, 1.0, 1.4, 8.8, 0.3, 0.4, C.woodDark, { line: k.thin, stripe: false });
      for (const u of [1.1, 9.9]) k.cyl(u, 4.9, 0, 0.42, 6.2, C.bark);
      k.box(0.4, 0.4, 6.2, 10.2, 5.4, 0.7, C.wood);
      k.line([[0.6, 2.2, ZT + 0.01], [10.5, 2.2, ZT + 0.01]], shade(C.wood, -0.3), Math.max(0.7, 0.07 * k.s));
      k.line([[0.6, 3.95, ZT + 0.01], [10.5, 3.95, ZT + 0.01]], shade(C.wood, -0.3), Math.max(0.7, 0.07 * k.s));
      // books, a rolled chart
      k.box(0.9, 0.9, ZT, 2.2, 1.6, 0.45, C.navy, { line: k.thin, stripe: false });
      k.box(1.05, 1.0, ZT + 0.45, 1.9, 1.4, 0.4, C.wool, { line: k.thin, stripe: false });
      log(k, [0.9, 4.5, ZT + 0.35], [3.2, 4.8, ZT + 0.35], 0.35, C.parchment, '#f6ead0');
      k.line([[2.0, 4.65, ZT + 0.05], [2.0, 4.65, ZT + 0.72]], C.woolDark, Math.max(0.8, 0.1 * k.s));
      // the ledger: its cover, the page written, the page being written
      k.box(3.3, 1.5, ZT, 4.6, 3.3, 0.2, C.woolDark, { line: k.thin, stripe: false });
      k.poly([[3.45, 1.65, ZT + 0.2], [5.6, 1.7, ZT + 0.3], [5.6, 4.6, ZT + 0.3], [3.45, 4.65, ZT + 0.2]], C.paper, k.thin);
      k.poly([[5.6, 1.7, ZT + 0.3], [7.75, 1.65, ZT + 0.2], [7.75, 4.65, ZT + 0.2], [5.6, 4.6, ZT + 0.3]], shade(C.paper, -0.04), k.thin);
      for (let i = 0; i < 6; i++) k.line([[3.75, 1.95 + i * 0.42, ZT + 0.27], [3.75 + 1.1 + hash(v.seed, i) * 0.6, 1.95 + i * 0.42, ZT + 0.27]], '#6a7488', Math.max(0.7, 0.08 * k.s));
      // ink, the candle lantern, a mug
      k.cyl(8.6, 2.2, ZT, 0.42, 0.55, '#2b3346');
      k.disc(8.6, 2.2, ZT + 0.56, 0.2, '#10131c', 0);
      lantern(k, 9.5, 1.3, ZT, true, 0.8);
      mug(k, 9.6, 4.3, ZT, C.teal, 0.42);
      // the stool, a pelt on it
      k.shadow(4.6, 6.0, 1.3, 0.95, 0.22);
      k.cyl(4.6, 5.9, 0, 0.95, 3.3, C.bark, { top: '#d9ad78' });
      k.disc(4.6, 5.9, 3.32, 0.95, C.furLight, k.thin);
      k.disc(4.5, 5.8, 3.34, 0.5, shade(C.furLight, 0.2), 0);
    });
    // the candle's glow, breathing while someone writes
    const glow = v.active ? 0.5 + 0.08 * Math.sin(v.t * 9) + 0.05 * Math.sin(v.t * 23) : 0.42;
    k.halo(9.5, 1.3, ZT + 1.1, 3.4, '#ffd890', glow);
    // the page: lines written so far, the one being written, the quill
    const rate = 0.7;
    const done = v.active ? Math.floor(v.t * rate) % 6 : 3;
    const frac = v.active ? (v.t * rate) % 1 : 0;
    const L = (i: number) => 1.1 + hash(v.seed, i, 5) * 0.75;
    const at = (i: number): P3 => [PAGE.u0 + 0.25, PAGE.v0 + i * 0.42, PAGE.z];
    k.pen.beginPath();
    for (let i = 0; i <= done; i++) {
      const [u, w, z] = at(i);
      const len = i < done ? L(i) : L(i) * frac;
      if (len > 0.05) k.run([[u, w, z], [u + len, w + (hash(v.seed, i, 6) - 0.5) * 0.06, z]]);
    }
    k.pen.strokeStyle = '#3c4660';
    k.pen.lineWidth = Math.max(0.7, 0.08 * k.s);
    k.pen.lineCap = 'round';
    k.pen.stroke();
    if (v.active) {
      const [u, w, z] = at(done);
      const tipU = u + L(done) * frac;
      quill(k, [tipU, w + Math.sin(v.t * 30) * 0.05, z + 0.02], [tipU + 0.9, w - 0.7, z + 2.4]);
    } else quill(k, [8.6, 2.2, ZT + 0.5], [9.0, 1.7, ZT + 3.0]);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 1.2 : 0.4, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(9.6, 4.3, ZT + 1.1, Math.floor(v.t * 10), i));
  },
};

// A quill from its nib to the top of its feather.
function quill(k: Kit, nib: P3, top: P3): void {
  k.line([nib, top], '#d9cfbf', Math.max(0.8, 0.08 * k.s));
  const [x0, y0] = k.p(...nib);
  const [x1, y1] = k.p(...top);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const w = 0.32 * k.s;
  const at = (f: number, o: number): [number, number] => [x0 + dx * f + nx * o, y0 + dy * f + ny * o];
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(...at(0.35, 0));
  pen.quadraticCurveTo(...at(0.6, w * 1.2), ...at(1, 0));
  pen.quadraticCurveTo(...at(0.65, -w * 0.9), ...at(0.35, 0));
  pen.closePath();
  k.paint('#f6f2ea', k.thin * 0.8);
}

// A chart of the caves pinned to the ice: a coast of ice shelves, a dotted
// route and its cross, a compass rose, and pins at the corners.
function chart(k: Kit, a: number, n: number, z0: number, seed: number): void {
  const w = 6.2;
  const h = 4.8;
  const P = (u: number, z: number): P3 => [a - w / 2 + u, n, z0 + z];
  k.poly([P(0, 0), P(w, 0.15), P(w - 0.1, h), P(0.1, h - 0.1)], k.vgrad(a, n, z0, z0 + h, [[0, '#d9c493'], [1, C.parchment]]), k.lw);
  const coast: P3[] = [];
  for (let i = 0; i <= 10; i++) coast.push(P(0.5 + i * 0.5, 1.2 + Math.sin(i * 1.3 + seed) * 0.6 + i * 0.15));
  k.line(coast, '#4f7fb0', Math.max(0.9, 0.12 * k.s));
  const route: P3[] = [];
  for (let i = 0; i <= 8; i++) route.push(P(1.2 + i * 0.45, 3.4 - Math.sin(i * 0.8) * 0.8 - i * 0.05));
  k.pen.beginPath();
  for (const [u, vv, z] of route) {
    const [x, y] = k.p(u, vv, z);
    k.pen.moveTo(x + 0.12 * k.s, y);
    k.pen.arc(x, y, Math.max(0.6, 0.11 * k.s), 0, Math.PI * 2);
  }
  k.pen.fillStyle = C.woolDark;
  k.pen.fill();
  const [cx, cz] = [4.9, 3.0];
  k.line([P(cx - 0.35, cz - 0.35), P(cx + 0.35, cz + 0.35)], C.woolDark, Math.max(1, 0.16 * k.s));
  k.line([P(cx - 0.35, cz + 0.35), P(cx + 0.35, cz - 0.35)], C.woolDark, Math.max(1, 0.16 * k.s));
  k.line([P(1.0, 0.5), P(1.0, 1.6)], '#5a4a38', Math.max(0.7, 0.07 * k.s));
  k.line([P(0.45, 1.05), P(1.55, 1.05)], '#5a4a38', Math.max(0.7, 0.07 * k.s));
  for (const [u, z] of [[0.3, h - 0.35], [w - 0.3, h - 0.3], [0.35, 0.3], [w - 0.35, 0.4]] as const) {
    const [x, y] = k.p(...P(u, z));
    k.pen.beginPath();
    k.pen.arc(x, y, Math.max(1, 0.2 * k.s), 0, Math.PI * 2);
    k.paint(C.wool, k.thin * 0.7);
  }
}

// ── read: the bookcase ──────────────────────────────────────────────────────
// A rough timber bookcase of every colour of binding, snow drifted on its
// top and icicles off it, a snowy owl carved in wood on watch up there; a
// barrel of rolled charts beside it under an iron lamp, lit to read by.

const SHELVES = [0.9, 5.3, 9.7, 14.1, 18.0];
const BAYS: ReadonlyArray<readonly [number, number]> = [[0.95, 5.05], [5.55, 9.65]];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 22,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 22, (k) => {
      const F = 3.4;
      k.shadow(6, 2.4, 7, 2.8, 0.3);
      k.box(0.3, 0.05, 0, 10, F - 0.05, 18.4, C.wood, { stripe: false });
      k.box(0.1, 0, 18.4, 10.4, F + 0.25, 0.6, C.woodLight);
      SHELVES.slice(0, -1).forEach((z0, r) => {
        const z1 = SHELVES[r + 1] - 0.45;
        for (const [bi, [u0, u1]] of BAYS.entries()) {
          k.poly([[u0, F, z0], [u1, F, z0], [u1, F, z1], [u0, F, z1]], k.vgrad(u0, F, z0, z1, [[0, '#3c2a1f'], [1, '#21160f']]), k.thin);
          const sd = v.seed + r * 7 + bi * 3;
          const kind = hash(sd, 5);
          if (kind < 0.2) {
            // a jar of cloudberry jam and books lying flat
            for (let j = 0; j < 3; j++) k.box(u0 + 0.3, F - 2.2, z0 + j * 0.42, 2.3 - j * 0.15, 2.0, 0.42, ['#36507a', '#b9443a', '#dba642'][(sd + j) % 3], { line: k.thin, stripe: false });
            k.cyl(u1 - 1.0, F - 1.2, z0, 0.55, 1.5, '#d6e6ea');
            k.cyl(u1 - 1.0, F - 1.2, z0 + 0.1, 0.45, 1.0, '#e08a3a', { line: 0 });
            bookRow(k, u0 + 2.8, u1 - 1.7, F - 0.05, z0, z1 - z0 - 0.3, sd);
          } else if (kind < 0.34) {
            // a candle stub and books
            bookRow(k, u0 + 0.1, u1 - 1.5, F - 0.05, z0, z1 - z0 - 0.3, sd);
            k.cyl(u1 - 0.8, F - 1.0, z0, 0.32, 1.0, '#f3ead6');
            k.halo(u1 - 0.8, F - 1.0, z0 + 1.4, 1.4, '#ffc070', 0.4);
            const [x, y] = k.p(u1 - 0.8, F - 1.0, z0 + 1.35);
            k.pen.beginPath();
            k.pen.ellipse(x, y, 0.14 * k.s, 0.28 * k.s, 0, 0, Math.PI * 2);
            k.pen.fillStyle = C.flame;
            k.pen.fill();
          } else bookRow(k, u0 + 0.1, u1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
        }
      });
      // snow on the top, icicles off its edge, and the owl
      k.box(0.25, 0.25, 19.0, 10.0, F - 0.2, 0.75, C.snow, { round: 0.6, stripe: false });
      icicles(k, 0.5, 10.2, F + 0.27, 18.45, 1.5, v.seed, 0.75);
      owl(k, 8.3, 1.6, 19.5);
      // the barrel of rolled charts
      k.shadow(12.2, 2.1, 1.6, 1.4, 0.24);
      barrel(k, 12.2, 2.0, 0, 1.25, 3.3, C.wood);
      k.disc(12.2, 2.0, 3.3, 1.05, '#2a1c14', 0);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + v.seed;
        const b: P3 = [12.2 + Math.cos(a) * 0.5, 2.0 + Math.sin(a) * 0.5, 1.2];
        const t: P3 = [12.2 + Math.cos(a) * 1.1, 2.0 + Math.sin(a) * 1.0, 4.4 + hash(v.seed, i) * 1.2];
        log(k, b, t, 0.22, i & 1 ? C.parchment : '#d8c08a', '#f6ead0');
      }
      // the lamp's bracket off the bookcase
      k.rod([[10.3, 1.7, 17.2], [12.0, 1.7, 17.2]], C.iron, 0.14);
      k.line([[12.0, 1.7, 17.2], [12.0, 1.7, 15.9]], INK, Math.max(0.8, 0.08 * k.s));
    });
    // the lamp: lit while someone reads, its flame breathing
    lantern(k, 12.0, 1.7, 13.4, v.active, 0.9);
    if (v.active) {
      k.halo(12.0, 1.9, 14.3, 4.6, '#ffd890', 0.42 + 0.07 * Math.sin(v.t * 8.3) + 0.04 * Math.sin(v.t * 19));
      k.pool(12.2, 2.0, 1.6, 1.4, '#ffd890', 0.3, 3.31);
    }
  },
};

// A snowy owl carved in pale wood, perched: a round body, a face disc, two
// amber eyes and ear tufts.
function owl(k: Kit, u: number, v: number, z: number): void {
  const [x, y] = k.p(u, v, z + 1.2);
  const s = k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, 0.95 * s, 1.25 * s, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - 0.3 * s, y - 0.5 * s, 0, x, y, 1.3 * s);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, '#e9eef5');
  g.addColorStop(1, '#b9c6d6');
  k.paint(g, k.lw);
  // tufts
  for (const d of [-1, 1]) {
    pen.beginPath();
    pen.moveTo(x + d * 0.35 * s, y - 1.05 * s);
    pen.lineTo(x + d * 0.75 * s, y - 1.55 * s);
    pen.lineTo(x + d * 0.7 * s, y - 0.85 * s);
    pen.closePath();
    k.paint('#e9eef5', k.thin);
  }
  // speckles, eyes and beak
  pen.beginPath();
  for (let i = 0; i < 6; i++) {
    const px = x + (hash(i, 7) - 0.5) * 1.1 * s;
    const py = y + (0.15 + hash(i, 8) * 0.8) * s;
    pen.moveTo(px + 0.1 * s, py);
    pen.arc(px, py, 0.09 * s, 0, Math.PI * 2);
  }
  pen.fillStyle = '#5d6b80';
  pen.fill();
  for (const d of [-1, 1]) {
    pen.beginPath();
    pen.arc(x + d * 0.36 * s, y - 0.4 * s, 0.26 * s, 0, Math.PI * 2);
    k.paint('#f2b53c', k.thin * 0.7);
    pen.beginPath();
    pen.arc(x + d * 0.36 * s, y - 0.4 * s, 0.11 * s, 0, Math.PI * 2);
    pen.fillStyle = INK;
    pen.fill();
  }
  pen.beginPath();
  pen.moveTo(x - 0.12 * s, y - 0.2 * s);
  pen.lineTo(x + 0.12 * s, y - 0.2 * s);
  pen.lineTo(x, y + 0.08 * s);
  pen.closePath();
  pen.fillStyle = '#6b5a48';
  pen.fill();
}

// ── search: the ice face ────────────────────────────────────────────────────
// A slab of clear glacier ice with old things frozen in it (a sea chest, a
// tusk, a fish's bones, a round shield), chipped at the foot, a pick leant
// on it and a lantern on a pole. Searching sweeps a glint across the ice
// and sends chips flying.

const ICE = { u0: 0.4, u1: 9.2, F: 3.2 };
const TOP: ReadonlyArray<readonly [number, number]> = [[0.4, 8.8], [1.8, 10.0], [3.4, 9.4], [5.2, 10.6], [6.6, 9.0], [8.0, 9.6], [9.2, 8.5]];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, F } = ICE;
    const k = still(v, 'search', 12, (k) => {
      k.shadow(5.5, 2.2, 6.6, 2.6, 0.3);
      // the slab: its end, its broken top, its face
      k.poly([[u1, 0, 0], [u1, F, 0], [u1, F, 8.5], [u1, 0, 9.1]], k.side('#5b9fd4', 1, 0, 0.12), k.lw);
      for (let i = 0; i + 1 < TOP.length; i++) {
        const [a, za] = TOP[i];
        const [b, zb] = TOP[i + 1];
        k.poly([[a, F, za], [b, F, zb], [b, 0, zb + 0.6], [a, 0, za + 0.6]], i & 1 ? '#a9dcf3' : C.iceHi, k.thin);
      }
      const face: P3[] = [[u0, F, 0], [u1, F, 0], ...[...TOP].reverse().map(([u, z]) => [u, F, z] as P3)];
      k.poly(face, k.vgrad(5, F, 0, 10.6, [[0, '#3d7dbd'], [0.55, '#6db1df'], [1, '#b8e4f7']]), k.lw);
      const pen = k.pen;
      pen.save();
      pen.beginPath();
      k.trace(face);
      pen.clip();
      relics(k, F - 0.02);
      // fractures in the ice, and its gloss
      pen.beginPath();
      k.run([[1.0, F, 9.6], [2.6, F, 6.0], [2.2, F, 3.4]]);
      k.run([[6.0, F, 10.2], [7.2, F, 5.4], [8.8, F, 4.0]]);
      k.run([[4.0, F, 0.4], [4.6, F, 2.6]]);
      pen.strokeStyle = '#e6f7fd90';
      pen.lineWidth = Math.max(0.7, 0.09 * k.s);
      pen.stroke();
      pen.restore();
      // chips at its foot
      for (let i = 0; i < 9; i++) {
        const u = 0.8 + hash(v.seed, i, 1) * 8.2;
        const w = F + 0.2 + hash(v.seed, i, 2) * 0.7;
        const r = 0.3 + hash(v.seed, i, 3) * 0.3;
        k.poly([[u - r, w, 0.02], [u + r * 0.4, w - r * 0.6, 0.02], [u + r, w + r * 0.2, 0.35], [u, w + r * 0.5, 0.02]], i & 1 ? C.iceHi : '#a9dcf3', Math.max(0.6, k.thin * 0.5));
      }
      // the pick, leant on the slab
      k.rod([[10.0, 3.8, 0], [9.45, 3.35, 6.0]], C.woodLight, 0.2);
      k.poly([[8.6, 3.4, 6.4], [9.4, 3.35, 6.25], [10.3, 3.3, 5.6], [9.5, 3.35, 5.95]], C.ironLight, k.thin);
      k.poly([[9.4, 3.35, 6.25], [9.6, 3.35, 6.6], [9.45, 3.35, 6.0]], C.iron, k.thin);
      // the lantern on its pole
      heap(k, 11.2, 2.4, 0, 1.0, 0.7, 1, C.snow, k.thin);
      k.rod([[11.2, 2.4, 0], [11.2, 2.4, 8.4]], C.wood, 0.2);
      k.rod([[11.2, 2.4, 8.2], [11.2, 3.4, 8.2]], C.wood, 0.14);
      k.line([[11.2, 3.4, 8.2], [11.2, 3.4, 7.6]], INK, Math.max(0.8, 0.08 * k.s));
      lantern(k, 11.2, 3.4, 5.5, true, 0.8);
      k.halo(11.2, 3.4, 6.3, 3.0, '#ffc870', 0.42);
    });
    // the gloss on the ice's face (live, over the sprite)
    k.poly([[u0 + 0.6, F + 0.01, 0.3], [u0 + 1.3, F + 0.01, 0.3], [u0 + 2.6, F + 0.01, 9.0], [u0 + 1.9, F + 0.01, 9.2]], '#ffffff28', 0);
    k.poly([[u0 + 1.9, F + 0.01, 0.3], [u0 + 2.2, F + 0.01, 0.3], [u0 + 3.5, F + 0.01, 9.0], [u0 + 3.2, F + 0.01, 9.2]], '#ffffff1c', 0);
    if (!v.active) return;
    // the cold light in the ice, and a glint sweeping along its face
    k.halo(4.8, F, 5, 4.5, '#cff3ff', 0.28);
    const f = (v.t * 0.5) % 1.4;
    if (f < 1) {
      const u = u0 + 0.2 + (u1 - u0 - 2) * f;
      k.poly([[u, F + 0.02, 0.4], [u + 0.6, F + 0.02, 0.4], [u + 1.6, F + 0.02, 8.4], [u + 1.0, F + 0.02, 8.4]], '#ffffff70', 0);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      spawn(chip(1.5 + hash(tick, 1) * 6.5, ICE.F + 0.2, 2 + hash(tick, 2) * 5, tick, i));
    }
  },
};

// What the ice holds, seen through it (muted toward its blue).
function relics(k: Kit, n: number): void {
  const thru = (c: Color, t = 0.45) => mix(c, '#5ea5d8', t);
  const P = (u: number, z: number): P3 => [u, n, z];
  // a sea chest, lid ajar
  k.poly([P(1.1, 1.0), P(3.9, 1.0), P(3.9, 2.9), P(1.1, 2.9)], thru(C.wood), k.thin);
  k.poly([P(1.0, 2.9), P(4.0, 2.9), P(3.7, 3.9), P(1.3, 3.9)], thru(C.woodDark), k.thin);
  for (const u of [1.6, 3.4]) k.line([P(u, 1.0), P(u, 3.85)], thru(C.iron, 0.35), Math.max(0.8, 0.14 * k.s));
  k.disc(2.5, n, 2.4, 0.2, thru(C.brass, 0.3), 0);
  // a tusk, curling up
  const tusk: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    tusk.push(P(4.6 + t * 3.2, 1.6 + Math.sin(t * 2.4) * 4.0));
  }
  k.line(tusk, thru(INK, 0.5), Math.max(2, 0.75 * k.s));
  k.line(tusk, thru('#efe6cf', 0.3), Math.max(1.2, 0.5 * k.s));
  // a fish's bones
  k.line([P(5.4, 8.0), P(7.9, 8.2)], thru('#f2f6fa', 0.3), Math.max(0.8, 0.12 * k.s));
  for (let i = 0; i < 5; i++) {
    const u = 5.9 + i * 0.38;
    k.line([P(u, 7.55), P(u + 0.15, 8.65)], thru('#f2f6fa', 0.35), Math.max(0.7, 0.08 * k.s));
  }
  k.poly([P(7.9, 8.2), P(8.5, 8.75), P(8.5, 7.7)], thru('#f2f6fa', 0.35), 0);
  k.disc(5.25, n, 8.05, 0.3, thru('#f2f6fa', 0.3), 0);
  // a round shield
  const sh = ring3([2.3, n, 6.6], [0, 1, 0], 1.25, 20).map((q) => k.p(...q));
  fillPts(k, sh, thru(C.wool), k.thin);
  const boss = ring3([2.3, n, 6.6], [0, 1, 0], 0.35, 12).map((q) => k.p(...q));
  fillPts(k, boss, thru(C.brass, 0.35), k.thin * 0.8);
  k.line([P(1.1, 6.6), P(3.5, 6.6)], thru(C.mustard, 0.4), Math.max(0.8, 0.14 * k.s));
  // bubbles
  k.pen.beginPath();
  for (let i = 0; i < 8; i++) {
    const [x, y] = k.p(0.8 + hash(i, 91) * 7.8, n, 4.4 + hash(i, 92) * 5);
    const r = (0.1 + hash(i, 93) * 0.15) * k.s;
    k.pen.moveTo(x + r, y);
    k.pen.arc(x, y, r, 0, Math.PI * 2);
  }
  k.pen.strokeStyle = '#e6f7fdb0';
  k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
  k.pen.stroke();
}

// ── run: the stove ──────────────────────────────────────────────────────────
// A pot-bellied iron stove on a hearth stone, its pipe going up into the
// dark, a copper kettle on top and socks drying on a line from the pipe;
// a wood box and a coal bucket by it. Running it stokes the fire behind
// the door, rattles the kettle's lid and puffs smoke from the pipe.

const STOVE = { u: SPOT.stove[0], v: SPOT.stove[1], r: 2.3 };
const PIPE: P3 = [STOVE.u + 0.6, STOVE.v - 1.1, 21.6]; // the pipe's top
const KETTLE: P3 = [STOVE.u - 0.6, STOVE.v + 0.5, 6.6];

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 23,
  animated: true,
  draw(v: PropView): void {
    const { u: cu, v: cv, r } = STOVE;
    const k = still(v, 'run', 23, (k) => {
      k.shadow(5.5, 5.4, 6.3, 6.0, 0.28);
      // the hearth stone
      k.box(1.4, 0.9, 0, 7.8, 7.6, 0.4, '#9aa5b6');
      k.pen.beginPath();
      for (const u of [4.0, 6.6]) k.run([[u, 0.9, 0.41], [u, 8.5, 0.41]]);
      for (const w of [3.4, 6.0]) k.run([[1.4, w, 0.41], [9.2, w, 0.41]]);
      k.pen.strokeStyle = '#6f7a8c';
      k.pen.lineWidth = Math.max(0.7, 0.08 * k.s);
      k.pen.stroke();
      // the drying line's pole
      k.rod([[9.9, 1.0, 0], [9.9, 1.0, 12.4]], C.wood, 0.22);
      // legs, the belly and its bands, the top plate
      for (const a of [0.8, 2.35, 3.9, 5.5]) k.rod([[cu + Math.cos(a) * 1.7, cv + Math.sin(a) * 1.7, 1.4], [cu + Math.cos(a) * 2.2, cv + Math.sin(a) * 2.2, 0.4]], C.iron, 0.32);
      k.cyl(cu, cv, 1.1, r, 5.2, C.iron);
      k.cyl(cu, cv, 1.0, r + 0.15, 0.45, C.ironLight);
      k.cyl(cu, cv, 5.85, r + 0.15, 0.4, C.ironLight);
      k.cyl(cu, cv, 6.25, r + 0.4, 0.35, '#4a5162');
      // the pipe, its damper and its cap with snow on it
      k.cyl(PIPE[0], PIPE[1], 6.6, 0.62, PIPE[2] - 6.6, C.iron);
      k.cyl(PIPE[0], PIPE[1], 10.6, 0.74, 0.3, C.ironLight);
      k.cyl(PIPE[0], PIPE[1], 16.6, 0.74, 0.3, C.ironLight);
      lump(k, PIPE[0], PIPE[1], PIPE[2], 1.15, 0.9, C.iron);
      lump(k, PIPE[0] - 0.15, PIPE[1] - 0.1, PIPE[2] + 0.55, 0.8, 0.45, C.snow, k.thin);
      // the door's frame (the fire behind it is live)
      const F = cv + r + 0.02;
      k.poly([[cu - 1.25, F, 2.0], [cu + 1.25, F, 2.0], [cu + 1.25, F, 4.75], [cu - 1.25, F, 4.75]], C.ironLight, k.lw, 0.3);
      k.rod([[cu + 1.0, F + 0.1, 3.4], [cu + 1.7, F + 0.3, 3.4]], C.brass, 0.14);
      // the drying line: socks and a mitten
      const a: P3 = [PIPE[0] + 0.5, PIPE[1] - 0.2, 12.2];
      const b: P3 = [9.9, 1.0, 12.0];
      const on = (t: number): P3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t - Math.sin(t * Math.PI) * 0.6];
      const pts: P3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(on(i / 8));
      k.line(pts, '#d8cdb8', Math.max(0.8, 0.08 * k.s));
      sock(k, on(0.3), C.wool);
      sock(k, on(0.55), C.mustard);
      mitten(k, on(0.8), C.teal);
      // the wood box, split logs in it; the coal bucket and the poker
      crate(k, 7.6, 7.2, 0, 2.8, 2.6, 1.8, C.woodLight, v.seed);
      log(k, [7.8, 7.8, 2.1], [10.2, 7.8, 2.2], 0.38);
      log(k, [7.8, 8.6, 2.1], [10.2, 8.6, 2.1], 0.36);
      log(k, [7.9, 9.4, 2.0], [10.1, 9.3, 2.2], 0.34);
      k.shadow(1.9, 9.4, 1.2, 1.0, 0.2);
      k.cyl(1.9, 9.4, 0, 0.9, 1.4, C.iron);
      lump(k, 1.9, 9.4, 1.35, 0.75, 0.45, C.coal, k.thin);
      k.rod([[2.8, 10.2, 0], [2.6, 9.6, 3.6]], C.iron, 0.12);
    });
    // the fire behind the door: stoked while running, banked otherwise
    const F = cv + r + 0.04;
    const n = v.active ? 0.5 + 0.5 * (0.6 * Math.sin(v.t * 11) + 0.4 * Math.sin(v.t * 17.3 + 1)) : 0.3;
    const win: P3[] = [[cu - 0.95, F, 2.3], [cu + 0.95, F, 2.3], [cu + 0.95, F, 4.45], [cu - 0.95, F, 4.45]];
    k.poly(win, k.vgrad(cu, F, 2.3, 4.45, [[0, mix('#ffd060', '#ffefb0', n)], [0.6, mix('#e8641e', '#ff9a30', n)], [1, mix('#5a1e10', '#a8401a', n)]]), k.thin, 0.2);
    k.pen.beginPath();
    for (const du of [-0.45, 0, 0.45]) k.run([[cu + du, F + 0.01, 2.3], [cu + du, F + 0.01, 4.45]]);
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = Math.max(1, 0.16 * k.s);
    k.pen.stroke();
    k.halo(cu, F + 0.6, 3.3, v.active ? 4.6 : 3.4, '#ff9a48', 0.28 + 0.2 * n);
    // the kettle, its lid rattling on the boil
    kettle(k, KETTLE[0], KETTLE[1], KETTLE[2], 1.0, v.active ? Math.max(0, Math.sin(v.t * 15)) * 0.16 : 0);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const tick = Math.floor(v.t * 10);
    const n = due(v.t, dt, v.active ? 3 : 0.5, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(KETTLE[0] - 1.45, KETTLE[1], KETTLE[2] + 1.4, tick, i));
    if (!v.active) return;
    const m = due(v.t, dt, 1.4, v.seed + 1);
    for (let i = 0; i < m; i++) {
      const p = wisp(PIPE[0], PIPE[1], PIPE[2] + 1.2, tick, i + 5, [150, 158, 172]);
      spawn({ ...p, kind: 'smoke', vz: 2 + hash(tick, i) });
    }
  },
};

// A sock hung from a point on the line.
function sock(k: Kit, at: P3, color: Color): void {
  const [u, w, z] = at;
  k.poly([[u - 0.3, w, z], [u + 0.3, w, z], [u + 0.32, w, z - 1.5], [u + 0.9, w, z - 1.9], [u + 0.85, w, z - 2.4], [u - 0.2, w, z - 2.2], [u - 0.3, w, z - 1.6]], color, k.thin, 0.15);
  k.line([[u - 0.3, w, z - 0.4], [u + 0.3, w, z - 0.4]], C.furWhite, Math.max(0.8, 0.2 * k.s));
}

// A mitten hung by its cuff.
function mitten(k: Kit, at: P3, color: Color): void {
  const [u, w, z] = at;
  k.poly([[u - 0.45, w, z], [u + 0.45, w, z], [u + 0.55, w, z - 1.6], [u + 0.1, w, z - 2.2], [u - 0.5, w, z - 1.8]], color, k.thin, 0.25);
  k.poly([[u - 0.5, w, z - 0.9], [u - 0.85, w, z - 1.2], [u - 0.55, w, z - 1.55]], color, k.thin, 0.1);
  k.line([[u - 0.45, w, z - 0.4], [u + 0.45, w, z - 0.4]], C.furWhite, Math.max(0.8, 0.22 * k.s));
}

// ── web: the radio ──────────────────────────────────────────────────────────
// A valve radio set in a walnut case on a supply crate, headphones on it,
// its aerial strung from a lashed mast with icicles off the crossbar; a log
// stool before it. Listening in lights the dial, sweeps the needle along
// it, blinks the mast's lamp and sends signals off the aerial.

const DIAL: P3 = [5.35, 5.42, 6.3];
const MAST: P3 = [7.3, 1.6, 20.3];

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 22,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 22, (k) => {
      k.shadow(4.5, 4.4, 4.6, 4.4, 0.28);
      // the mast, lashed, and its aerial
      heap(k, MAST[0], MAST[1], 0, 1.5, 1.1, 2, C.snow, k.thin);
      k.rod([[MAST[0], MAST[1], 0], [MAST[0], MAST[1], MAST[2]]], C.wood, 0.3);
      for (const z of [4, 9.5, 15]) k.line([[MAST[0] - 0.3, MAST[1], z], [MAST[0] + 0.3, MAST[1], z + 0.35]], C.rope, Math.max(1, 0.2 * k.s));
      k.rod([[5.0, MAST[1], 19.4], [8.8, MAST[1], 19.4]], C.woodDark, 0.18);
      icicles(k, 5.2, 8.6, MAST[1] + 0.12, 19.3, 1.3, v.seed, 0.55);
      for (const u of [5.2, 8.6]) k.disc(u, MAST[1], 19.15, 0.22, '#e6eef5', k.thin);
      const wire: P3[] = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        wire.push([5.2 + (3.4 - 5.2) * t, MAST[1] + (3.0 - MAST[1]) * t, 19.15 + (7.5 - 19.15) * t - Math.sin(t * Math.PI) * 1.2]);
      }
      k.line(wire, INK, Math.max(0.8, 0.08 * k.s));
      // the crate it stands on
      crate(k, 1.2, 2.2, 0, 6.2, 4.4, 4.4, C.woodLight, 3);
      // the set: a walnut case, the grille, the dial's bezel, knobs
      k.box(1.8, 2.6, 4.4, 4.8, 2.8, 3.1, C.woodDark, { round: 0.25 });
      const F = 5.4;
      k.poly([[2.2, F, 4.9], [4.1, F, 4.9], [4.1, F, 7.0], [2.2, F, 7.0]], k.side('#c9b48a', 0, 1, 0.12), k.thin, 0.2);
      k.pen.beginPath();
      for (let u = 2.45; u < 4.0; u += 0.32) k.run([[u, F, 5.05], [u, F, 6.85]]);
      k.pen.strokeStyle = '#8f7a55';
      k.pen.lineWidth = Math.max(0.7, 0.08 * k.s);
      k.pen.stroke();
      fillPts(k, ring3([DIAL[0], F, DIAL[2]], [0, 1, 0], 0.82, 20).map((q) => k.p(...q)), C.brass, k.thin);
      for (const u of [4.75, 5.95]) {
        const [x, y] = k.p(u, F + 0.05, 5.0);
        k.pen.beginPath();
        k.pen.arc(x, y, Math.max(1, 0.26 * k.s), 0, Math.PI * 2);
        k.paint('#e9dcc0', k.thin * 0.8);
      }
      // headphones on the case
      k.rod([[2.6, 3.4, 7.55], [2.9, 3.6, 8.5], [3.6, 3.7, 8.6], [3.9, 3.5, 7.55]], C.iron, 0.12);
      k.disc(2.6, 3.4, 7.55, 0.45, C.woolDark, k.thin);
      k.disc(3.9, 3.5, 7.55, 0.45, C.woolDark, k.thin);
      // a log stool
      k.shadow(4.6, 7.7, 1.2, 0.9, 0.2);
      k.cyl(4.6, 7.6, 0, 0.85, 2.6, C.bark, { top: '#d9ad78' });
    });
    // the dial and its needle, the mast's lamp
    const face = ring3([DIAL[0], DIAL[1], DIAL[2]], [0, 1, 0], 0.62, 18).map((q) => k.p(...q));
    fillPts(k, face, v.active ? '#ffe39a' : '#4a4637', k.thin * 0.7);
    const a = v.active ? 0.6 + Math.sin(v.t * 1.7) * 0.9 : -0.6;
    k.line([[DIAL[0], DIAL[1] + 0.02, DIAL[2] - 0.3], [DIAL[0] + Math.cos(Math.PI / 2 - a) * 0.5, DIAL[1] + 0.02, DIAL[2] - 0.3 + Math.sin(Math.PI / 2 - a) * 0.6]], C.woolDark, Math.max(0.8, 0.1 * k.s));
    const blink = v.active && (v.t * 1.5) % 1 < 0.5;
    const [lx, ly] = k.p(MAST[0], MAST[1], MAST[2] + 0.35);
    k.pen.beginPath();
    k.pen.arc(lx, ly, Math.max(1.2, 0.34 * k.s), 0, Math.PI * 2);
    k.paint(blink ? '#ff8a7a' : '#7a2a2a', k.thin);
    if (blink) k.halo(MAST[0], MAST[1], MAST[2] + 0.35, 2.4, '#ff6a5a', 0.55);
    if (v.active) k.halo(DIAL[0], DIAL[1] + 0.3, DIAL[2], 2.2, '#ffd27a', 0.5);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: 5.2 + (j(1) + 0.5) * 3.4, y: MAST[1] + j(2) * 0.6, z: 19.6, vx: j(3) * 0.8, vy: 0.5 + j(4) * 0.4, vz: 1.2 + j(5) * 0.6, life: 1.4, color: [190, 255, 225], glow: true, gravity: -0.2 });
    }
  },
};

// ── think: the fishing hole ─────────────────────────────────────────────────
// A hole cut in the frozen pond (the shell paints the pond), slush round
// its rim, the cut blocks set by; a rod propped on a forked stick over it,
// a three-legged stool with a fur, a bucket with tails sticking out, a
// tackle box and a lantern on the ice, and behind it all a little red
// fishing shanty, snow on its roof and a lamp in its window, the auger
// stood in the snow by it. Pondering plays a bite: the rod's tip nods,
// the float dips, rings spread.

const ROD = { butt: [1.0, 2.6, 0.5] as P3, rest: [2.4, 3.4, 2.0] as P3 };

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 9,
  animated: true,
  draw(v: PropView): void {
    const [hu, hv] = SPOT.hole;
    const k = still(v, 'think', 9, (k) => {
      shanty(k);
      // the hole: slush round it, black water
      k.disc(hu, hv, 0.06, 1.85, '#e3f3fb', k.thin);
      const e = k.ell(hu, hv, 0.08, 1.3);
      const g = k.pen.createRadialGradient(e.cx, e.cy + e.ry * 0.3, 0, e.cx, e.cy, e.rx);
      g.addColorStop(0, C.waterDeep);
      g.addColorStop(0.7, C.water);
      g.addColorStop(1, '#2f5f8f');
      k.disc(hu, hv, 0.08, 1.3, g, k.thin);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        lump(k, hu + Math.cos(a) * 1.9, hv + Math.sin(a) * 1.7, 0, 0.42, 0.3, C.iceHi, k.thin);
      }
      // the cut blocks, set aside
      k.box(3.0, 0.4, 0, 1.6, 1.2, 0.9, '#bfe6f8');
      k.box(3.5, 1.7, 0, 1.3, 1.0, 0.75, '#a9dcf3');
      // tackle box
      k.box(0.4, 0.5, 0, 1.9, 1.2, 0.9, C.wool);
      k.rod([[0.9, 1.1, 0.95], [1.1, 1.1, 1.3], [1.6, 1.1, 1.3], [1.8, 1.1, 0.95]], C.iron, 0.08);
      // the bucket, tails out of it
      k.shadow(6.0, 1.7, 1.1, 0.9, 0.2);
      for (const [du, dv, a] of [[-0.2, 0, -0.3], [0.25, 0.1, 0.4]] as const) {
        const b: P3 = [6.0 + du, 1.6 + dv, 1.2];
        k.poly([b, [b[0] + Math.sin(a) * 0.5 - 0.4, b[1], b[2] + 1.1], [b[0] + Math.sin(a) * 0.5, b[1], b[2] + 0.75], [b[0] + Math.sin(a) * 0.5 + 0.4, b[1], b[2] + 1.1]], C.fish, k.thin, 0.1);
      }
      k.cyl(6.0, 1.6, 0, 0.85, 1.5, C.tin);
      k.disc(6.0, 1.6, 1.5, 0.7, '#3a4a5c', 0);
      k.rod([[5.2, 1.6, 1.4], [6.0, 1.6, 2.3], [6.8, 1.6, 1.4]], C.iron, 0.06);
      // the forked stick the rod rests on
      heap(k, ROD.rest[0], ROD.rest[1], 0, 0.7, 0.45, 3, C.snow, k.thin);
      k.rod([[ROD.rest[0], ROD.rest[1], 0], [ROD.rest[0], ROD.rest[1], ROD.rest[2] - 0.3]], C.woodDark, 0.16);
      k.rod([[ROD.rest[0], ROD.rest[1], ROD.rest[2] - 0.3], [ROD.rest[0] - 0.3, ROD.rest[1], ROD.rest[2] + 0.3]], C.woodDark, 0.12);
      // the lantern on the ice
      lantern(k, 1.2, 5.6, 0, true, 0.9);
      k.halo(1.2, 5.6, 1.0, 2.6, '#ffc870', 0.45);
      // a fish on the ice
      const fu = 2.9;
      const fv = 6.2;
      k.poly([[fu - 1.0, fv, 0.05], [fu - 0.4, fv - 0.35, 0.12], [fu + 0.5, fv - 0.3, 0.12], [fu + 0.9, fv, 0.05], [fu + 0.5, fv + 0.32, 0.1], [fu - 0.4, fv + 0.35, 0.1]], C.fish, k.thin, 0.1);
      k.poly([[fu + 0.85, fv, 0.05], [fu + 1.4, fv - 0.45, 0.05], [fu + 1.4, fv + 0.45, 0.05]], shade(C.fish, -0.15), k.thin);
      // the stool, a fur on it
      stool(k, 6.6, 5.6);
      // the auger, stood in the snow by the shanty
      heap(k, 11.5, 5.7, 0, 0.8, 0.5, 4, C.snow, k.thin);
      k.rod([[11.5, 5.7, 0.2], [11.5, 5.7, 5.0]], C.ironLight, 0.12);
      k.rod([[11.0, 5.7, 5.0], [12.0, 5.7, 5.0]], C.woodDark, 0.18);
      k.pen.beginPath();
      for (let z = 0.6; z < 2.8; z += 0.45) k.run([[11.15, 5.7, z], [11.85, 5.7, z + 0.3]]);
      k.pen.strokeStyle = INK;
      k.pen.lineWidth = Math.max(0.9, 0.14 * k.s);
      k.pen.stroke();
    });
    // the rod (its tip nodding while a bite is played), its line and float
    const t = v.t;
    const nod = v.active ? Math.sin(t * 5.2) * 0.3 + Math.sin(t * 13) * 0.08 : 0;
    const { butt, rest } = ROD;
    const d: P3 = [rest[0] - butt[0], rest[1] - butt[1], rest[2] - butt[2]];
    const tip: P3 = [rest[0] + d[0] * 1.15, rest[1] + d[1] * 1.15, rest[2] + d[2] * 1.15 - 0.6 + nod];
    const mid: P3 = [rest[0] + d[0] * 0.6, rest[1] + d[1] * 0.6, rest[2] + d[2] * 0.6 - 0.05 + nod * 0.3];
    k.rod([butt, rest, mid, tip], C.woodDark, 0.1);
    k.disc(butt[0] + d[0] * 0.25, butt[1] + d[1] * 0.25, butt[2] + d[2] * 0.25, 0.3, C.ironLight, k.thin);
    const dip = v.active ? Math.max(0, Math.sin(t * 5.2 - 0.6)) * 0.12 : 0;
    const fl: P3 = [hu + 0.25, hv + 0.15, 0.2 - dip];
    k.line([tip, fl], '#e6eef5', Math.max(0.7, 0.05 * k.s));
    if (v.active) {
      // rings spreading from the float
      k.pen.beginPath();
      for (let i = 0; i < 2; i++) {
        const f = (t * 0.7 + i * 0.5) % 1;
        const e = k.ell(fl[0], fl[1], 0.1, 0.25 + f * 0.8);
        k.pen.moveTo(e.cx + e.rx, e.cy);
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      }
      k.pen.strokeStyle = '#cfe9f8a0';
      k.pen.lineWidth = Math.max(0.7, 0.07 * k.s);
      k.pen.stroke();
    }
    ball(k, fl[0], fl[1], fl[2] + 0.18, 0.22, '#e8473a', k.thin * 0.8);
    const [x, y] = k.p(fl[0], fl[1], fl[2] + 0.18);
    k.pen.beginPath();
    k.pen.arc(x, y - 0.06 * k.s, 0.12 * k.s, Math.PI, 0);
    k.pen.fillStyle = '#ffffff';
    k.pen.fill();
  },
};

// A fishing shanty: red planks, a gable over its door, snow on its roof, a
// lamp in its window and a stovepipe.
function shanty(k: Kit): void {
  const [u0, v0, u1, v1, h, ridge] = [7.0, 0.3, 11.4, 4.1, 4.8, 7.0];
  const red = '#b04a3c';
  k.shadow(9.2, 2.4, 3.2, 2.6, 0.28);
  k.box(u0, v0, 0, u1 - u0, v1 - v0, h, red, { stripe: false });
  k.pen.beginPath();
  for (let z = 0.8; z < h; z += 0.8) k.run([[u0, v1, z], [u1, v1, z], [u1, v0, z]]);
  k.pen.strokeStyle = withAlpha(shade(red, -0.45), 0.8);
  k.pen.lineWidth = Math.max(0.7, 0.07 * k.s);
  k.pen.stroke();
  // the gable over the front, the roof's two slopes under snow
  const mu = (u0 + u1) / 2;
  k.poly([[u0, v1, h], [u1, v1, h], [mu, v1, ridge]], k.side(red, 0, 1, 0.18), k.lw);
  const e = 0.35;
  const left: P3[] = [[mu, v0 - e, ridge + 0.1], [mu, v1 + e, ridge + 0.1], [u0 - e, v1 + e, h - 0.25], [u0 - e, v0 - e, h - 0.25]];
  const right: P3[] = [[mu, v0 - e, ridge + 0.1], [mu, v1 + e, ridge + 0.1], [u1 + e, v1 + e, h - 0.25], [u1 + e, v0 - e, h - 0.25]];
  k.poly(left, k.lit(-1, 0) ? C.snowHi : C.snowMid, k.lw, 0.15);
  k.poly(right, k.lit(1, 0) ? C.snowHi : C.snowMid, k.lw, 0.15);
  k.line([[u1 + e, v1 + e, h - 0.25], [u1 + e, v0 - e, h - 0.25]], C.woodDeep, Math.max(1, 0.2 * k.s));
  k.line([[u0 - e, v1 + e, h - 0.25], [mu, v1 + e, ridge + 0.1], [u1 + e, v1 + e, h - 0.25]], C.woodDeep, Math.max(1, 0.2 * k.s));
  // the door and its little round window; the side window, lit
  const F = v1 + 0.02;
  k.poly([[8.5, F, 0], [9.9, F, 0], [9.9, F, 3.7], [8.5, F, 3.7]], k.side(C.woodDark, 0, 1, 0.16), k.thin, 0.15);
  const [dx, dy] = k.p(9.2, F, 2.8);
  k.pen.beginPath();
  k.pen.arc(dx, dy, 0.32 * k.s, 0, Math.PI * 2);
  k.paint(C.lamp, k.thin * 0.8);
  k.disc(9.75, F + 0.05, 1.8, 0.0001, INK, 0);
  const S = u1 + 0.02;
  k.poly([[S, 1.4, 2.4], [S, 2.9, 2.4], [S, 2.9, 3.8], [S, 1.4, 3.8]], C.lamp, k.thin);
  k.line([[S, 2.15, 2.4], [S, 2.15, 3.8]], C.woodDeep, Math.max(0.8, 0.12 * k.s));
  k.line([[S, 1.4, 3.1], [S, 2.9, 3.1]], C.woodDeep, Math.max(0.8, 0.12 * k.s));
  k.halo(S + 0.3, 2.15, 3.1, 2.2, '#ffc870', 0.4);
  // the stovepipe through the roof
  k.cyl(10.2, 1.4, 5.6, 0.32, 3.0, C.iron);
  lump(k, 10.2, 1.4, 8.5, 0.5, 0.35, C.snow, k.thin);
}

// A three-legged stool, a fur on its seat.
function stool(k: Kit, cu: number, cv: number): void {
  k.shadow(cu, cv, 1.2, 1.1, 0.2);
  for (const a of [1.2, 3.3, 5.4]) k.rod([[cu + Math.cos(a) * 0.45, cv + Math.sin(a) * 0.45, 2.5], [cu + Math.cos(a) * 0.95, cv + Math.sin(a) * 0.95, 0]], C.wood, 0.16);
  k.cyl(cu, cv, 2.4, 0.95, 0.3, C.woodLight);
  k.disc(cu, cv, 2.72, 0.9, C.furWhite, k.thin);
  k.disc(cu - 0.1, cv - 0.1, 2.74, 0.45, '#ffffff', 0);
}

// ── idle: the fire pit ──────────────────────────────────────────────────────
// A ring of stones round a log fire, a copper kettle hung from a tripod
// over it; log benches on two sides draped with furs and a wool blanket, a
// stump table with mugs of cocoa, a basket of firewood. Where tired agents
// warm up. (Still: the flames are drawn once; embers and steam drift off.)

const FIRE = { u: SPOT.fire[0], v: SPOT.fire[1] };
const HANG: P3 = [FIRE.u, FIRE.v, 3.6]; // the kettle's foot

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    const { u: fu, v: fv } = FIRE;
    k.shadow(7.5, 5.4, 7.8, 5.6, 0.22);
    // the back bench: a log with a fur thrown over it
    k.shadow(7, 2.0, 6.4, 1.6, 0.25);
    log(k, [0.9, 1.6, 1.0], [12.4, 1.6, 1.0], 1.0);
    const fur: P3[] = [[3.8, 0.9, 1.95], [9.4, 0.9, 1.95], [9.65, 2.6, 1.45], ...hem([9.75, 2.75, 0.3], [3.7, 2.75, 0.3], 14, [0, 0.12, -0.6], 0.6), [3.55, 2.6, 1.45]];
    k.poly(fur, k.vgrad(6.5, 2.7, 0, 2, [[0, '#4e3524'], [0.55, '#6e4b31'], [1, '#93683f']]), k.lw, 0.25);
    k.pen.beginPath();
    for (let u = 4.3; u < 9.4; u += 0.55) k.run([[u, 2.2, 1.7], [u + 0.1, 2.85, 0.9]]);
    k.pen.strokeStyle = '#a77a4c';
    k.pen.lineWidth = Math.max(0.7, 0.07 * k.s);
    k.pen.stroke();
    k.line([[4.0, 1.4, 1.95], [9.2, 1.4, 1.95]], '#b88a58', Math.max(0.8, 0.16 * k.s));
    // the side bench, a striped blanket folded on it
    k.shadow(1.7, 7, 1.4, 3.6, 0.25);
    log(k, [1.7, 3.9, 0.95], [1.7, 10.4, 0.95], 0.95);
    k.box(1.0, 6.2, 1.7, 1.4, 2.2, 0.55, C.wool, { round: 0.15 });
    for (const w of [6.8, 7.7]) k.line([[2.42, w, 1.72], [2.42, w, 2.24], [1.0, w, 2.26]], C.furWhite, Math.max(0.8, 0.14 * k.s));
    // a white fur on the side bench's far end
    k.poly([[1.0, 8.9, 1.85], [2.4, 8.9, 1.85], [2.55, 10.3, 1.4], ...hem([2.7, 10.4, 0.4], [2.7, 8.7, 0.4], 6, [0.12, 0, -0.5], 0.5)], k.vgrad(2, 9.5, 0, 2, [[0, C.furGrey], [1, C.furWhite]]), k.lw, 0.2);
    // the stump table with mugs
    k.shadow(13.5, 3.4, 1.4, 1.2, 0.22);
    k.cyl(13.5, 3.4, 0, 1.05, 2.3, C.bark, { top: '#ddb27a' });
    if (k.fine) for (const r of [0.65, 0.35]) {
      const e = k.ell(13.5, 3.4, 2.31, r);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      k.pen.strokeStyle = '#a8784a';
      k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
      k.pen.stroke();
    }
    mug(k, 13.2, 3.0, 2.3, C.wool, 0.4);
    mug(k, 13.9, 3.8, 2.3, C.mug, 0.4);
    // the basket of firewood
    k.shadow(13.7, 7.0, 1.5, 1.2, 0.22);
    k.cyl(13.7, 7.0, 0, 1.15, 1.4, '#b98a55');
    log(k, [12.9, 6.6, 1.6], [14.6, 7.1, 1.9], 0.32);
    log(k, [12.8, 7.3, 1.5], [14.5, 7.6, 1.6], 0.3);
    // the fire: stones round it, back ones first
    const stones: Array<{ u: number; w: number; r: number; i: number }> = [];
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      stones.push({ u: fu + Math.cos(a) * 2.35, w: fv + Math.sin(a) * 2.15, r: 0.55 + hash(v.seed, i, 4) * 0.2, i });
    }
    stones.sort((p, q) => p.u + p.w - (q.u + q.w));
    const back = stones.filter((p) => p.u + p.w <= fu + fv);
    const front = stones.filter((p) => p.u + p.w > fu + fv);
    const legs: P3[] = [[fu - 2.6, fv - 1.6, 0], [fu + 0.9, fv - 2.9, 0], [fu + 1.5, fv + 2.7, 0]];
    const apex: P3 = [fu, fv, 8.0];
    for (const p of back) rock(k, p.u, p.w, 0, p.r, p.r * 1.2, v.seed + p.i, false, '#7a8496');
    k.rod([legs[0], apex], C.woodDark, 0.2);
    k.rod([legs[1], apex], C.woodDark, 0.2);
    // embers, logs, flames
    const [ex, ey] = k.p(fu, fv, 0.1);
    const e = k.ell(fu, fv, 0.1, 1.7);
    const g = k.pen.createRadialGradient(ex, ey, 0, ex, ey, e.rx);
    g.addColorStop(0, '#ffcf6a');
    g.addColorStop(0.5, '#e8641e');
    g.addColorStop(1, '#5a2414');
    k.disc(fu, fv, 0.1, 1.7, g, k.thin);
    log(k, [fu - 1.4, fv - 0.5, 0.4], [fu + 1.2, fv + 0.6, 0.5], 0.3, '#4a3426', '#d08a4a');
    log(k, [fu - 0.9, fv + 1.1, 0.4], [fu + 1.0, fv - 1.0, 0.45], 0.28, '#4a3426', '#d08a4a');
    k.halo(fu, fv, 1.6, 4.4, '#ff9a48', 0.42);
    blaze(k, fu, fv + 0.2, 0.5, 3.0, 0.7, 2.0);
    // the kettle on its chain
    k.line([apex, [HANG[0], HANG[1], HANG[2] + 1.9]], INK, Math.max(0.9, 0.1 * k.s));
    kettle(k, HANG[0], HANG[1], HANG[2], 0.85, 0, '#4a5163');
    for (const p of front) rock(k, p.u, p.w, 0, p.r, p.r * 1.2, v.seed + p.i, false, '#7a8496');
    k.rod([legs[2], apex], C.woodDark, 0.2);
    k.disc(apex[0], apex[1], apex[2] - 0.3, 0.35, C.rope, k.thin);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const tick = Math.floor(v.t * 10);
    const n = due(v.t, dt, 2.4, v.seed);
    for (let i = 0; i < n; i++) spawn(ember(FIRE.u, FIRE.v, 2.6, tick, i, 0.9));
    const m = due(v.t, dt, 0.7, v.seed + 1);
    for (let i = 0; i < m; i++) spawn(wisp(HANG[0] - 0.85 * 1.45, HANG[1], HANG[2] + 1.25, tick, i + 3));
  },
};

// ── entrance: the ice gate ──────────────────────────────────────────────────
// An arch of packed-snow blocks, igloo-fashion, round a way out into the
// snowy night: a moon over drifts and dark firs, snow falling. A hide
// curtain is tied back on a pole, icicle chimes hang in the arch, a lantern
// on a post and a shovel stand to one side, a fir in a barrel and a pair of
// boots to the other. Someone passing lets the wind in: the curtain
// billows, the chimes swing and snow blows in.

const GATE = { u0: SPOT.gate[0], u1: SPOT.gate[1], top: SPOT.gate[2] };
const GR = (GATE.u1 - GATE.u0) / 2;
const GC = (GATE.u0 + GATE.u1) / 2;
const SPRING = GATE.top - GR;
const OUT = -0.8; // the night beyond, behind the wall's face

// The arch's outline at v = n, radius r round its middle, from the floor.
function arch(n: number, r: number, steps = 14): P3[] {
  const pts: P3[] = [[GC - r, n, 0], [GC + r, n, 0], [GC + r, n, SPRING]];
  for (let i = 1; i < steps; i++) {
    const a = (i / steps) * Math.PI;
    pts.push([GC + r * Math.cos(a), n, SPRING + r * Math.sin(a)]);
  }
  pts.push([GC - r, n, SPRING]);
  return pts;
}

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'entrance', 16, (k) => {
      const pen = k.pen;
      // the night outside
      const hole = arch(OUT, GR);
      k.poly(hole, k.vgrad(GC, OUT, 0, GATE.top, [[0, '#55699a'], [0.3, '#30436f'], [1, '#141f3e']]), 0);
      pen.save();
      pen.beginPath();
      k.trace(hole);
      pen.clip();
      k.halo(GC - 1.4, OUT, 10.0, 3.6, '#dfe9ff', 0.45);
      k.disc(GC - 1.4, OUT, 10.2, 0.0001, '#000000', 0);
      const [mx, my] = k.p(GC - 1.4, OUT, 10.2);
      pen.beginPath();
      pen.arc(mx, my, 0.75 * k.s, 0, Math.PI * 2);
      pen.fillStyle = '#f4f7ff';
      pen.fill();
      pen.beginPath();
      for (let i = 0; i < 12; i++) {
        const [x, y] = k.p(GATE.u0 + hash(i, 1) * (GATE.u1 - GATE.u0), OUT, 6 + hash(i, 2) * 6);
        pen.moveTo(x + 0.12 * k.s, y);
        pen.arc(x, y, Math.max(0.6, 0.1 * k.s), 0, Math.PI * 2);
      }
      pen.fillStyle = '#e6eeff';
      pen.fill();
      // firs on the far drifts
      for (const [u, h] of [[GC + 1.8, 4.2], [GC + 2.9, 3.2], [GC - 2.6, 3.0]] as const) {
        k.poly([[u - h * 0.32, OUT, 2.4], [u, OUT, 2.4 + h], [u + h * 0.32, OUT, 2.4]], '#1c2c4a', 0);
      }
      k.poly([[GATE.u0 - 1, OUT, 0], [GATE.u1 + 1, OUT, 0], [GATE.u1 + 1, OUT, 2.6], [GC + 1.5, OUT, 3.3], [GC - 0.5, OUT, 2.5], [GATE.u0 - 1, OUT, 3.0]], k.vgrad(GC, OUT, 0, 3.3, [[0, '#9fb3d2'], [1, '#dfe8f5']]), 0);
      pen.beginPath();
      for (let i = 0; i < 22; i++) {
        const [x, y] = k.p(GATE.u0 + hash(i, 3) * (GATE.u1 - GATE.u0), OUT, 1 + hash(i, 4) * 10.5);
        pen.moveTo(x + 0.2 * k.s, y);
        pen.arc(x, y, Math.max(0.7, 0.16 * k.s), 0, Math.PI * 2);
      }
      pen.fillStyle = '#ffffffd0';
      pen.fill();
      pen.restore();
      // the reveal: the jamb seen inside the opening, the arch's underside
      k.poly([[GATE.u0, OUT, 0], [GATE.u0, 0, 0], [GATE.u0, 0, SPRING], [GATE.u0, OUT, SPRING]], k.side('#a9d6f0', 1, 0, 0.1), 0);
      const soffit: P3[] = [];
      for (let i = 0; i <= 7; i++) {
        const a = Math.PI - (i / 14) * Math.PI;
        soffit.push([GC + GR * Math.cos(a), OUT, SPRING + GR * Math.sin(a)]);
      }
      k.poly([...soffit, ...[...soffit].reverse().map(([u, , z]) => [u, 0, z] as P3)], '#8fc6e8', 0);
      k.poly([[GATE.u0, OUT, 0.02], [GATE.u1, OUT, 0.02], [GATE.u1, 0.6, 0.02], [GATE.u0, 0.6, 0.02]], C.snowMid, 0);
      pen.beginPath();
      k.trace(arch(0, GR));
      k.paint(null, k.thin);
      // the blocks round it, proud of the wall
      igloo(k);
      // the doormat, a hide one
      k.poly([[GATE.u0 + 0.4, 0.9, 0.04], [GATE.u1 - 0.4, 0.9, 0.04], [GATE.u1 - 0.4, 3.6, 0.04], [GATE.u0 + 0.4, 3.6, 0.04]], C.furDark, k.thin, 0.4);
      k.poly([[GATE.u0 + 0.9, 1.3, 0.05], [GATE.u1 - 0.9, 1.3, 0.05], [GATE.u1 - 0.9, 3.2, 0.05], [GATE.u0 + 0.9, 3.2, 0.05]], C.fur, 0, 0.3);
      // the curtain's pole
      k.rod([[GATE.u0 - 0.4, 0.35, SPRING - 0.2], [GATE.u1 + 0.4, 0.35, SPRING - 0.2]], C.woodDark, 0.18);
      // left: the lantern on its post, a shovel in the drift
      heap(k, 1.4, 2.4, 0, 1.4, 0.9, 5, C.snow, k.thin);
      k.rod([[1.4, 2.4, 0], [1.4, 2.4, 9.6]], C.wood, 0.26);
      k.rod([[1.4, 2.4, 9.2], [2.5, 2.4, 9.2]], C.wood, 0.16);
      k.line([[2.5, 2.4, 9.2], [2.5, 2.4, 8.6]], INK, Math.max(0.8, 0.08 * k.s));
      lantern(k, 2.5, 2.4, 6.6, true, 0.85);
      k.halo(2.5, 2.4, 7.5, 3.8, '#ffc870', 0.42);
      heap(k, 0.9, 1.2, 0, 1.1, 1.0, 6, C.snow, k.thin);
      k.rod([[0.9, 1.3, 0.6], [1.1, 0.8, 6.0]], C.woodLight, 0.16);
      k.poly([[0.4, 1.4, 0.2], [1.4, 1.4, 0.2], [1.3, 1.35, 1.7], [0.5, 1.35, 1.7]], C.ironLight, k.thin, 0.15);
      // right: a fir in a barrel, a pair of boots
      barrel(k, 13.4, 2.0, 0, 1.0, 1.5, C.wood);
      k.disc(13.4, 2.0, 1.5, 0.85, C.snow, 0);
      fir(k, 13.4, 2.0, 1.4, 6.6, 1.7, v.seed);
      for (const [u, w] of [[11.3, 3.0], [11.9, 3.3]] as const) {
        k.box(u, w - 0.45, 0, 0.7, 0.55, 1.6, C.furDark, { line: k.thin, round: 0.15 });
        k.box(u - 0.15, w - 0.45, 0, 1.25, 0.6, 0.45, C.woodDeep, { line: k.thin, round: 0.15 });
        k.box(u - 0.05, w - 0.5, 1.45, 0.8, 0.65, 0.35, C.furWhite, { line: k.thin, round: 0.15, stripe: false });
      }
    });
    // the curtain, tied back (billowing in the draught while someone passes)
    const b = v.active ? 0.7 + 0.5 * Math.sin(v.t * 3.1) + 0.2 * Math.sin(v.t * 7.7) : 0;
    curtain(k, b);
    // the chimes in the arch
    const sw = v.active ? Math.sin(v.t * 6.3) * 0.45 : 0;
    const cz = SPRING + Math.sqrt(GR * GR - 1.6 * 1.6) - 0.2;
    k.line([[GC + 0.8, 0.3, cz], [GC + 2.4, 0.3, cz]], C.woodDark, Math.max(1, 0.14 * k.s));
    for (let i = 0; i < 4; i++) {
      const u = GC + 1.0 + i * 0.45;
      const l = 0.9 + (i % 2) * 0.4;
      const a = sw * (1 + i * 0.15);
      const top: P3 = [u, 0.3, cz];
      const end: P3 = [u + Math.sin(a) * l, 0.3 + Math.sin(a) * 0.2, cz - Math.cos(a) * l];
      k.line([top, end], INK, Math.max(0.7, 0.05 * k.s));
      k.poly([[end[0] - 0.13, end[1], end[2]], [end[0] + 0.13, end[1], end[2]], [end[0] + Math.sin(a) * 0.9, end[1], end[2] - 0.9 * Math.cos(a)]], C.iceHi, k.thin * 0.8);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 6 : 0.6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const p = flake(GATE.u0 + 1 + hash(tick, 1) * (GATE.u1 - GATE.u0 - 2), 0.3, 6 + hash(tick, 2) * 4, tick, i, 0.6);
      spawn({ ...p, vy: p.vy + (v.active ? 2.2 : 0.8) });
    }
  },
};

// The ring of snow blocks round the gate and the jambs under it.
function igloo(k: Kit): void {
  const n = 0.7;
  const r0 = GR;
  const r1 = GR + 1.7;
  const tones = ['#e6f3fb', '#d4eaf7', '#c6e2f4'];
  // the jambs' ends (seen at +u), then the jambs' faces
  k.poly([[GATE.u1 + 1.7, 0, 0], [GATE.u1 + 1.7, n, 0], [GATE.u1 + 1.7, n, SPRING], [GATE.u1 + 1.7, 0, SPRING]], k.side('#c6e2f4', 1, 0, 0.16), k.thin);
  const rows = 5;
  for (const [a0, a1] of [[GATE.u0 - 1.7, GATE.u0], [GATE.u1, GATE.u1 + 1.7]] as const) {
    for (let j = 0; j < rows; j++) {
      const z0 = (SPRING * j) / rows;
      const z1 = (SPRING * (j + 1)) / rows;
      k.poly([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]], tones[(j + (a0 > GC ? 1 : 0)) % 3], k.thin);
    }
  }
  // the arch's blocks, and the end of the ring at the springing
  const nb = 9;
  for (let i = 0; i < nb; i++) {
    const t0 = Math.PI - (i / nb) * Math.PI;
    const t1 = Math.PI - ((i + 1) / nb) * Math.PI;
    const P = (r: number, t: number): P3 => [GC + r * Math.cos(t), n, SPRING + r * Math.sin(t)];
    k.poly([P(r0, t0), P(r0, (t0 + t1) / 2), P(r0, t1), P(r1, t1), P(r1, (t0 + t1) / 2), P(r1, t0)], tones[i % 3], k.thin);
  }
  // snow heaped on top, and the outline round it all
  const cap: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI * (0.15 + (0.7 * i) / 12);
    cap.push([GC + (r1 + 0.1) * Math.cos(t), n + 0.05, SPRING + (r1 + 0.1) * Math.sin(t)]);
  }
  for (let i = 12; i >= 0; i--) {
    const t = Math.PI * (0.15 + (0.7 * i) / 12);
    cap.push([GC + (r1 + 0.75 + Math.sin(i * 1.7) * 0.15) * Math.cos(t), n + 0.05, SPRING + (r1 + 0.75 + Math.sin(i * 1.7) * 0.15) * Math.sin(t)]);
  }
  k.poly(cap, C.snowHi, k.thin, 0.2);
  const outer: P3[] = [[GATE.u1 + 1.7, n, 0], [GATE.u1 + 1.7, n, SPRING]];
  for (let i = 1; i < 16; i++) {
    const a = (i / 16) * Math.PI;
    outer.push([GC + r1 * Math.cos(a), n, SPRING + r1 * Math.sin(a)]);
  }
  outer.push([GATE.u0 - 1.7, n, SPRING], [GATE.u0 - 1.7, n, 0]);
  k.line(outer, INK, k.lw);
  icicles(k, GC - 2.6, GC + 2.6, n + 0.05, SPRING + GR - 0.1, 1.2, 5, 0.6);
}

// The hide curtain tied back at the left of the gate; `b` billows it out.
function curtain(k: Kit, b: number): void {
  const n = 0.35;
  const z1 = SPRING - 0.2;
  const u0 = GATE.u0 - 0.2;
  const tie = 4.2;
  const pts: P3[] = [
    [u0, n, z1],
    [u0 + 2.4 + b * 0.3, n, z1],
    [u0 + 1.6 + b * 0.5, n + b * 0.15, tie + 1.4],
    [u0 + 0.9 + b * 0.2, n + b * 0.1, tie],
    [u0 + 1.5 + b * 1.1, n + 0.2 + b * 0.4, 1.4],
    [u0 + 1.8 + b * 1.3, n + 0.3 + b * 0.5, 0.1],
    [u0, n + 0.2, 0.05],
  ];
  k.poly(pts, k.hgrad([u0, n, 0], [u0 + 2.6, n, 0], [[0, C.furLight], [0.6, C.fur], [1, C.furDark]]), k.lw, 0.3);
  k.line([[u0 + 0.6, n + 0.05, z1 - 0.4], [u0 + 0.6 + b * 0.2, n + 0.1, tie + 0.3], [u0 + 0.9 + b * 0.6, n + 0.2, 1.0]], withAlpha(C.furDark, 0.8), Math.max(0.8, 0.12 * k.s));
  k.line([[u0 - 0.1, n + 0.1, tie], [u0 + 1.1 + b * 0.2, n + 0.15, tie]], C.wool, Math.max(1, 0.28 * k.s));
}


export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
