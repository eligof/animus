import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { bench, candle, candleDish, fillPts, flame, furry, horn, hull, log, pebble, ring, stoneBlock, stool, zigzag } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, circle, due, hash, kitOf, still, wisp } from './kit.ts';

// The Longhall's stations, each a PropArt in its own frame (u along the
// wall, v out toward the agent, z up; the viewer always sees the top, the
// +v front and the +u end). Animated ones paint their still parts through
// the sprite cache (see still) and only the moving bits each frame, and
// hold still while nobody works them.

type Spawn = (p: Particle) => void;

// Bindings for the tomes: leathers and dyed hides.
const HIDES: readonly Color[] = [C.leather, C.leatherDark, C.red, C.green, C.blue, '#8a5a32', '#4a3a2a', '#6b3a2e'];

// ── write: the scribe's lectern ─────────────────────────────────────────────
// A slanted desk on a carved pedestal, a great book open on it, a quill in
// an ink horn and a candle on an arm; a stool and a chest of scrolls by it.
// Working moves the quill across the page, lines of writing (never
// letters) appearing behind it, and the candle flickers.

// The desk's slanted face: f = 0 at its high back edge, 1 at its front lip.
const DESK = { u0: 2.6, u1: 9.4, v0: 1.4, v1: 4.5, z0: 10.5, z1: 8.6 };
const deskAt = (u: number, f: number): P3 => [u, DESK.v0 + (DESK.v1 - DESK.v0) * f, DESK.z0 + (DESK.z1 - DESK.z0) * f + 0.06];
// the open book's pages: left u 3.4..6, right 6..8.6, between f 0.12 and 0.86
const PAGE = { l0: 3.5, mid: 6.0, r1: 8.5, f0: 0.13, f1: 0.86 };
const LINES = 7;
const lineF = (i: number) => PAGE.f0 + 0.07 + (i / LINES) * (PAGE.f1 - PAGE.f0 - 0.1);

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 14, (k) => {
      k.shadow(5.8, 3.4, 5.6, 3.3, 0.3);
      // a chest of scrolls by the wall, the stool before the desk
      k.box(7.6, 0.4, 0, 3.0, 2.0, 2.0, C.leatherDark, { round: 0.1 });
      for (const z of [0.5, 1.5]) k.line([[7.6, 2.41, z], [10.6, 2.41, z], [10.61, 0.4, z]], C.ironDark, Math.max(0.8, 0.14 * k.s));
      for (let i = 0; i < 3; i++) scrollRoll(k, 7.9 + i * 0.85, 1.4, 2.15, 0.34, 2.2 - i * 0.2);
      // the pedestal on its crossed feet
      k.box(3.9, 2.25, 0, 4.2, 0.9, 0.6, C.timberDark, { line: k.thin });
      k.box(5.55, 0.9, 0, 0.9, 3.6, 0.6, C.timberDark, { line: k.thin });
      k.box(5.3, 2.0, 0.6, 1.4, 1.4, 7.2, C.timber, { stripe: false });
      for (const z of [1.4, 6.2]) {
        k.box(5.2, 1.9, z, 1.6, 1.6, 0.9, C.timberDark, { line: k.thin, stripe: false });
        if (k.fine) zigzag(k, 5.25, 6.75, 3.51, z + 0.45, 0.5, C.timberLight, 0.1 * k.s);
      }
      k.box(4.6, 1.6, 7.8, 2.8, 2.2, 0.8, C.timberDark, { line: k.thin });
      // the desk: its slanted face, edges and the lip that holds the book
      const top: P3[] = [deskAt(DESK.u0, 0), deskAt(DESK.u1, 0), deskAt(DESK.u1, 1), deskAt(DESK.u0, 1)];
      const under = (p: P3): P3 => [p[0], p[1], p[2] - 0.55];
      k.poly([top[1], top[2], under(top[2]), under(top[1])], k.side(C.timber, 1, 0), k.thin);
      k.poly([top[3], top[2], under(top[2]), under(top[3])], k.side(C.timberDark, 0, 1), k.thin);
      k.poly(top, k.grad(top[0], top[3], [[0, shade(C.timber, 0.14)], [1, C.timber]]), k.lw);
      k.box(DESK.u0, DESK.v1 - 0.1, DESK.z1 - 0.2, DESK.u1 - DESK.u0, 0.4, 0.55, C.timberDark, { line: k.thin });
      // the book: boards a shade bigger than its pages, a ribbon
      const cover: P3[] = [deskAt(PAGE.l0 - 0.25, PAGE.f0 - 0.05), deskAt(PAGE.r1 + 0.25, PAGE.f0 - 0.05), deskAt(PAGE.r1 + 0.25, PAGE.f1 + 0.04), deskAt(PAGE.l0 - 0.25, PAGE.f1 + 0.04)];
      k.poly(cover, C.red, k.thin);
      for (const [a, b] of [[PAGE.l0, PAGE.mid], [PAGE.mid, PAGE.r1]] as const) {
        const lift = (p: P3, up: number): P3 => [p[0], p[1], p[2] + up];
        k.poly([lift(deskAt(a, PAGE.f0), a === PAGE.l0 ? 0.12 : 0.04), lift(deskAt(b, PAGE.f0), b === PAGE.r1 ? 0.12 : 0.04), lift(deskAt(b, PAGE.f1), b === PAGE.r1 ? 0.12 : 0.04), lift(deskAt(a, PAGE.f1), a === PAGE.l0 ? 0.12 : 0.04)], a === PAGE.l0 ? C.parchment : shade(C.parchment, 0.06), k.thin);
      }
      k.line([deskAt(PAGE.mid, PAGE.f0), deskAt(PAGE.mid, PAGE.f1)], shade(C.parchment, -0.3), Math.max(0.8, 0.12 * k.s));
      k.line([deskAt(PAGE.mid + 0.2, PAGE.f1), deskAt(PAGE.mid + 0.3, 1.02), [PAGE.mid + 0.25, DESK.v1 + 0.3, DESK.z1 - 1.2]], C.red, Math.max(0.8, 0.16 * k.s));
      // the left page already written: lines and a coloured initial block
      pageLines(k, PAGE.l0 + 0.35, PAGE.mid - 0.3, LINES, 0.04, 1);
      k.poly([deskAt(PAGE.l0 + 0.35, lineF(0) - 0.02), deskAt(PAGE.l0 + 0.95, lineF(0) - 0.02), deskAt(PAGE.l0 + 0.95, lineF(1) + 0.02), deskAt(PAGE.l0 + 0.35, lineF(1) + 0.02)], C.blue, 0);
      // the ink horn on its bracket at the desk's right
      k.rod([[9.4, 2.8, 8.9], [9.9, 2.8, 8.9]], C.ironDark, 0.14);
      horn(k, [[9.95, 2.8, 9.9], [10.0, 2.75, 9.3], [10.15, 2.7, 8.7], [10.45, 2.65, 8.3]], 0.42);
      k.disc(9.95, 2.8, 9.92, 0.28, '#120c10', 0);
      // the candle's arm on the desk's left
      k.rod([[2.7, 2.4, 9.5], [1.6, 2.4, 9.6], [1.6, 2.4, 10.0]], C.ironDark, 0.14);
      candleDish(k, 1.6, 2.4, 10.0);
      candle(k, 1.6, 2.4, 10.1, 1.5, false);
      stool(k, 2.2, 5.6, 3.8);
    });
    // the candle: still while nobody works here
    const f = v.active ? 0.5 + 0.5 * Math.sin(v.t * 11) * Math.sin(v.t * 4.3 + 1) : 0.5;
    flame(k, 1.6, 2.4, 12.0, 1, f, v.active ? 0.5 : 0.42);
    // the right page: lines appear behind the quill while working
    const prog = v.active ? (v.t * 0.22) % 1 : 0.42;
    const done = prog * LINES;
    const row = Math.floor(done);
    pageLines(k, PAGE.mid + 0.3, PAGE.r1 - 0.35, row, 0.04, 1);
    const frac = done - row;
    const ua = PAGE.mid + 0.3;
    const ub = PAGE.r1 - 0.35;
    if (row < LINES && frac > 0.02) pageLines(k, ua, ua + (ub - ua) * frac, 1, 0.04, 1, row);
    // the quill: writing, or stood in the ink horn
    if (v.active && row < LINES) {
      const tip = deskAt(ua + (ub - ua) * frac, lineF(row));
      quill(k, [tip[0], tip[1], tip[2] + 0.05], [tip[0] + 1.3, tip[1] - 0.9, tip[2] + 2.4], v.t);
    } else quill(k, [10.0, 2.8, 9.6], [10.6, 2.0, 12.6], 0);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    if (due(v.t, dt, 0.5, v.seed)) spawn({ ...wisp(1.6, 2.4, 12.8, Math.floor(v.t * 10), 0, [150, 140, 130], 0.2), kind: 'smoke', vz: 1.4 });
  },
};

// Writing on a page of the lectern: n lines from row `first`, each a run
// of short dashes (words, never letters) from u0 to u1.
function pageLines(k: Kit, u0: number, u1: number, n: number, up: number, seed: number, first = 0): void {
  if (n <= 0) return;
  const pen = k.pen;
  pen.beginPath();
  for (let i = first; i < first + n; i++) {
    const f = lineF(i);
    let u = u0;
    let j = 0;
    while (u < u1 - 0.1) {
      const w = Math.min(u1 - u, 0.35 + hash(seed, i * 31 + j, 2) * 0.6);
      const [x0, y0] = k.p(...deskAt(u, f));
      const [x1, y1] = k.p(...deskAt(u + w, f));
      pen.moveTo(x0, y0 - up * k.s);
      pen.lineTo(x1, y1 - up * k.s);
      u += w + 0.18;
      j++;
    }
  }
  pen.strokeStyle = '#3a2a22';
  pen.lineWidth = Math.max(0.8, 0.09 * k.s);
  pen.lineCap = 'round';
  pen.stroke();
}

// A quill from its nib to the end of its feather.
function quill(k: Kit, nib: P3, end: P3, t: number): void {
  const wob = Math.sin(t * 9) * 0.12;
  const e: P3 = [end[0] + wob, end[1], end[2]];
  k.line([nib, e], INK, Math.max(1, 0.12 * k.s));
  const pts: Pt[] = [];
  const d: P3 = [e[0] - nib[0], e[1] - nib[1], e[2] - nib[2]];
  const at = (f: number): P3 => [nib[0] + d[0] * f, nib[1] + d[1] * f, nib[2] + d[2] * f];
  const [ax, ay] = k.p(...at(0.35));
  const [bx, by] = k.p(...at(1.05));
  const nx = -(by - ay);
  const ny = bx - ax;
  const l = Math.hypot(nx, ny) || 1;
  const w = 0.34 * k.s;
  pts.push([ax, ay], [ax + (bx - ax) * 0.5 + (nx / l) * w, ay + (by - ay) * 0.5 + (ny / l) * w], [bx, by], [ax + (bx - ax) * 0.55 - (nx / l) * w * 0.6, ay + (by - ay) * 0.55 - (ny / l) * w * 0.6]);
  fillPts(k, pts, '#f4eee2', k.thin);
  k.line([at(0.3), at(1.0)], '#b8ac98', Math.max(0.6, 0.06 * k.s));
}

// A rolled scroll lying along v at (u, v, z), radius r.
function scrollRoll(k: Kit, u: number, v: number, z: number, r: number, len: number): void {
  const a: P3 = [u, v - len / 2, z + r];
  const b: P3 = [u, v + len / 2, z + r];
  fillPts(k, hull([...ring(k, a, [0, 1, 0], r, 12), ...ring(k, b, [0, 1, 0], r, 12)]), C.parchment, k.thin);
  fillPts(k, ring(k, b, [0, 1, 0], r, 12), shade(C.parchment, -0.08), k.thin);
  fillPts(k, ring(k, [b[0], b[1] + 0.01, b[2]], [0, 1, 0], r * 0.35, 8), '#b89a6a', 0);
}

// ── read: the shelves of tomes and scrolls ──────────────────────────────────
// Timber shelves with carved posts: leather tomes on the left, a lattice of
// scrolls on the right, a drinking horn in its cradle and a candle on top.

const SHELF_Z = [0.5, 4.0, 7.4, 10.8, 14.2];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 18,
  draw(v: PropView): void {
    const k = kitOf(v);
    const F = 3.5; // the shelves' front
    k.shadow(7, 2.2, 7.4, 2.4, 0.32);
    // the carcass, then the bays on its front: tomes on the left of the
    // middle post, scrolls in cubbies on the right
    k.box(0.3, 0.2, 0, 13.4, F - 0.2, SHELF_Z[4] + 0.5, C.timber, { stripe: false });
    for (const [i, z] of SHELF_Z.entries()) {
      if (i === SHELF_Z.length - 1) break;
      const z1 = SHELF_Z[i + 1];
      for (const [a, b] of [[1.2, 8.2], [9.0, 12.8]] as const) k.poly([[a, F, z + 0.45], [b, F, z + 0.45], [b, F, z1], [a, F, z1]], k.vgrad(a, F, z, z1, [[0, '#2e1c12'], [1, '#170e09']]), k.thin);
      tomes(k, 1.3, 8.1, F + 0.01, z + 0.45, z1 - z - 0.75, v.seed + i * 7);
      scrollCubbies(k, 9.0, 12.8, F + 0.01, z + 0.45, z1, v.seed + i * 5);
      k.box(0.9, F - 0.1, z, 12.2, 0.35, 0.45, C.timberLight, { line: k.thin });
    }
    // the posts' faces, carved at the top
    for (const [u0, w] of [[0.3, 0.9], [8.2, 0.8], [12.8, 0.9]] as const) {
      k.box(u0, F - 0.15, 0, w, 0.3, SHELF_Z[4] + 0.5, C.timber, { stripe: false, line: k.thin });
      if (k.fine) zigzag(k, u0 + 0.1, u0 + w - 0.1, F + 0.16, SHELF_Z[4] - 0.3, 0.45, C.timberLight, 0.1 * k.s);
    }
    k.box(0.1, 0.1, SHELF_Z[4] + 0.5, 13.8, F, 0.5, C.timberDark, { line: k.lw });
    for (const u of [0.75, 13.25]) {
      k.cyl(u, 1.8, SHELF_Z[4] + 1.0, 0.45, 0.35, C.timberDark);
      pebble(k, u, 1.8, SHELF_Z[4] + 1.35, 0.46, 0.85, C.timberLight, k.thin);
    }
    // on top: the horn in its cradle, a small chest, the candle
    const zt = SHELF_Z[4] + 1.0;
    for (const u of [2.4, 4.4]) k.box(u, 1.2, zt, 0.35, 1.3, 0.7, C.timberDark, { line: k.thin });
    horn(k, [[1.7, 1.85, zt + 1.3], [3.0, 1.85, zt + 0.95], [4.4, 1.85, zt + 0.9], [5.6, 1.85, zt + 1.35], [6.2, 1.85, zt + 1.85]], 0.48);
    k.box(7.6, 0.9, zt, 2.6, 1.7, 1.15, C.red, { round: 0.12 });
    k.line([[7.6, 2.61, zt + 0.6], [10.2, 2.61, zt + 0.6]], C.gold, Math.max(0.8, 0.12 * k.s));
    candleDish(k, 11.6, 1.9, zt);
    candle(k, 11.6, 1.9, zt + 0.1, 0.9);
  },
};

// Tomes standing (some lying) from u0 to u1 on a shelf at z, spines on the
// plane v, no taller than hmax; one path a colour.
function tomes(k: Kit, u0: number, u1: number, v: number, z: number, hmax: number, seed: number): void {
  const pen = k.pen;
  const by = new Map<Color, P3[][]>();
  const all: P3[][] = [];
  let u = u0;
  let i = 0;
  // now and then a short stack lying flat
  if (hash(seed, 1) < 0.35) {
    for (let j = 0; j < 3; j++) k.box(u0 + 0.1, v - 2.2, z + j * 0.5, 2.3 - j * 0.2, 2.1, 0.5, HIDES[(seed + j) % HIDES.length], { line: k.thin, stripe: false });
    u += 2.7;
  }
  while (u < u1 - 0.4) {
    const w = 0.55 + hash(seed, i, 2) * 0.45;
    if (u + w > u1) break;
    const h = hmax * (0.72 + hash(seed, i, 3) * 0.28);
    const c = HIDES[Math.floor(hash(seed, i, 4) * HIDES.length)];
    const lean = hash(seed, i, 5) < 0.08 && i > 0 ? 0.4 : 0;
    const q: P3[] = [[u, v, z], [u + w, v, z], [u + w + lean, v, z + h], [u + lean, v, z + h]];
    (by.get(c) ?? by.set(c, []).get(c)!).push(q);
    all.push(q);
    u += w + (lean ? 0.35 : 0.03);
    i++;
  }
  for (const [c, qs] of by) {
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = k.side(c, 0, 1, 0.12);
    pen.fill();
  }
  // gilt bands across the spines
  pen.beginPath();
  for (const q of all) {
    const hh = q[3][2] - q[0][2];
    for (const f of k.fine ? [0.15, 0.22, 0.8] : [0.2]) {
      const [x0, y0] = k.p(q[0][0] + (q[3][0] - q[0][0]) * f, v, q[0][2] + hh * f);
      const [x1, y1] = k.p(q[1][0] + (q[2][0] - q[1][0]) * f, v, q[1][2] + hh * f);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = '#d9a441bb';
  pen.lineWidth = Math.max(0.7, 0.09 * k.s);
  pen.stroke();
  pen.beginPath();
  for (const q of all) k.trace(q);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, k.thin * 0.75);
  pen.lineJoin = 'round';
  pen.stroke();
}

// Cubbies of rolled scrolls seen end on, a red tie on some.
function scrollCubbies(k: Kit, u0: number, u1: number, v: number, z0: number, z1: number, seed: number): void {
  const cols = 2;
  const cw = (u1 - u0) / cols;
  for (let c = 0; c < cols; c++) {
    const a = u0 + c * cw;
    if (c) k.poly([[a - 0.12, v, z0], [a + 0.12, v, z0], [a + 0.12, v, z1], [a - 0.12, v, z1]], C.timber, k.thin * 0.8);
    const n = 2 + Math.floor(hash(seed, c, 6) * 3);
    for (let i = 0; i < n; i++) {
      const r = 0.42 + hash(seed, c, i) * 0.12;
      const cu = a + 0.6 + (i % 3) * 0.9 + (hash(seed, c, i + 9) - 0.5) * 0.15;
      const cz = z0 + r + Math.floor(i / 3) * (r * 1.8);
      if (cu + r > a + cw - 0.1 || cz + r > z1) continue;
      fillPts(k, ring(k, [cu, v, cz], [0, 1, 0], r, 12), C.parchment, k.thin);
      fillPts(k, ring(k, [cu, v + 0.01, cz], [0, 1, 0], r * 0.32, 8), '#a88a5a', 0);
      if (hash(seed, c, i + 20) < 0.35) k.line([[cu - r * 0.9, v + 0.02, cz - r * 0.2], [cu + r * 0.9, v + 0.02, cz + r * 0.1]], C.red, Math.max(0.8, 0.14 * k.s));
    }
  }
}

// ── search: the map table ───────────────────────────────────────────────────
// A plank table on trestles against the wall, a map spread on it (coasts,
// a river and a route as plain shapes and lines), carved markers and a
// candle; a chest under it. Searching makes the candle flicker and slides
// a marker along the route.

const MAP = { u0: 1.1, u1: 9.4, v0: 0.75, v1: 3.45, z: 6.95 };
// the route across the map, (u, v) on it
const ROUTE: ReadonlyArray<readonly [number, number]> = [[2.4, 2.9], [3.6, 2.3], [5.0, 2.6], [6.3, 1.7], [7.8, 1.6], [8.6, 2.4]];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 9,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 9, (k) => {
      k.shadow(6, 2.2, 6.5, 2.5, 0.3);
      // a chest under the table, then the trestles
      k.box(3.2, 0.9, 0, 3.4, 2.1, 2.3, C.leather, { round: 0.1 });
      for (const u of [3.5, 6.3]) k.line([[u, 3.01, 0.1], [u, 3.01, 2.3], [u, 0.9, 2.31]], C.ironDark, Math.max(0.8, 0.16 * k.s));
      k.disc(4.9, 3.02, 1.5, 0.22, C.gold, k.thin);
      for (const u of [1.0, 10.2]) {
        k.box(u, 0.6, 0, 0.8, 3.0, 0.5, C.timberDark, { line: k.thin });
        k.box(u + 0.15, 1.6, 0.5, 0.5, 1.0, 5.9, C.timber, { stripe: false });
      }
      k.box(1.2, 1.85, 3.0, 9.6, 0.5, 0.5, C.timberDark, { line: k.thin, stripe: false });
      // the top
      k.box(0.4, 0.35, 6.4, 11.2, 3.5, 0.55, C.timber);
      if (k.fine) for (const w of [1.5, 2.65]) k.line([[0.5, w, 6.96], [11.5, w, 6.96]], shade(C.timber, -0.25), 0.06 * k.s);
      mapSheet(k, v.seed);
      // carved markers: pegs with round heads, a little boat
      for (const [i, [u, w]] of [[3.6, 2.3], [7.8, 1.6], [2.0, 1.4]].entries()) marker(k, u, w, i === 2 ? C.red : C.timberLight);
      boat(k, 6.9, 3.0, MAP.z);
      // the candle on its dish, and a horn of ink and a cup
      candleDish(k, 10.6, 2.0, MAP.z - 0.5);
      candle(k, 10.6, 2.0, MAP.z - 0.4, 1.3, false);
      k.cyl(10.4, 3.2, MAP.z - 0.5, 0.42, 0.9, '#8a6a4a');
    });
    const f = v.active ? 0.5 + 0.5 * Math.sin(v.t * 10.3) * Math.sin(v.t * 3.7) : 0.5;
    flame(k, 10.6, 2.0, MAP.z + 1.3, 1, f, v.active ? 0.5 : 0.42);
    // the marker on the move along the route
    const ph = v.active ? (v.t * 0.18) % 1 : 0.62;
    const pos = ph * (ROUTE.length - 1);
    const i = Math.min(ROUTE.length - 2, Math.floor(pos));
    const fr = pos - i;
    const u = ROUTE[i][0] + (ROUTE[i + 1][0] - ROUTE[i][0]) * fr;
    const w = ROUTE[i][1] + (ROUTE[i + 1][1] - ROUTE[i][1]) * fr;
    marker(k, u, w, C.gold);
    if (v.active) k.pool(u, w, 1.4, 1.0, '#ffd890', 0.35, MAP.z + 0.02);
  },
};

// The map: sea, two lands with wobbly coasts, a river, hills as little
// peaks, a dotted route; its ends curling.
function mapSheet(k: Kit, seed: number): void {
  const { u0, u1, v0, v1, z } = MAP;
  const pen = k.pen;
  k.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], '#d9c9a0', k.thin);
  pen.save();
  pen.beginPath();
  k.trace([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]]);
  pen.clip();
  k.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], '#a9b9b4', 0);
  const land = (cu: number, cw: number, ru: number, rw: number, sd: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = 0.75 + hash(seed + sd, i, 7) * 0.35;
      pts.push([cu + Math.cos(a) * ru * r, cw + Math.sin(a) * rw * r, z + 0.01]);
    }
    return pts;
  };
  const lands = [land(3.4, 2.4, 2.6, 1.3, 1), land(8.0, 1.6, 2.2, 1.3, 2)];
  for (const l of lands) k.poly(l, C.parchment, k.thin * 0.8, 0.15);
  // a river, hills, the route
  k.line([[2.2, 1.6, z + 0.02], [2.9, 2.0, z + 0.02], [3.3, 2.5, z + 0.02], [4.2, 2.7, z + 0.02]], '#6f8fa0', Math.max(0.7, 0.1 * k.s));
  pen.beginPath();
  for (const [u, w] of [[3.0, 2.8], [3.6, 3.0], [7.6, 1.2], [8.3, 1.4], [8.7, 1.1]] as const) {
    const [ax, ay] = k.p(u - 0.25, w, z + 0.02);
    const [bx, by] = k.p(u, w, z + 0.02);
    const [cx, cy] = k.p(u + 0.25, w, z + 0.02);
    pen.moveTo(ax, ay);
    pen.lineTo(bx, by - 0.35 * k.s);
    pen.lineTo(cx, cy);
  }
  pen.strokeStyle = '#6a5038';
  pen.lineWidth = Math.max(0.7, 0.08 * k.s);
  pen.stroke();
  pen.beginPath();
  for (let i = 0; i + 1 < ROUTE.length; i++) {
    const [a0, b0] = ROUTE[i];
    const [a1, b1] = ROUTE[i + 1];
    for (let f = 0; f < 1; f += 0.34) {
      const [x0, y0] = k.p(a0 + (a1 - a0) * f, b0 + (b1 - b0) * f, z + 0.02);
      const [x1, y1] = k.p(a0 + (a1 - a0) * (f + 0.17), b0 + (b1 - b0) * (f + 0.17), z + 0.02);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = C.red;
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.stroke();
  pen.restore();
  // the curled ends
  for (const u of [u0, u1]) {
    const a: P3 = [u, v0, z + 0.3];
    const b: P3 = [u, v1, z + 0.3];
    fillPts(k, hull([...ring(k, a, [0, 1, 0], 0.32, 10), ...ring(k, b, [0, 1, 0], 0.32, 10)]), C.parchment, k.thin);
    fillPts(k, ring(k, b, [0, 1, 0], 0.32, 10), shade(C.parchment, -0.1), k.thin);
  }
}

// A carved marker: a short peg with a round head.
function marker(k: Kit, u: number, w: number, c: Color): void {
  k.shadow(u, w, 0.45, 0.4, 0.3, MAP.z);
  k.cyl(u, w, MAP.z, 0.24, 0.8, shade(c, -0.08), { line: k.thin });
  const [x, y] = k.p(u, w, MAP.z + 1.05);
  k.pen.beginPath();
  k.pen.arc(x, y, 0.34 * k.s, 0, Math.PI * 2);
  k.paint(c, k.thin);
}

// A little carved boat token lying on the map, its prow curling up.
function boat(k: Kit, u: number, w: number, z: number): void {
  k.shadow(u, w, 1.0, 0.4, 0.3, z);
  const hullPts: P3[] = [[u - 1.0, w, z + 0.55], [u - 0.7, w, z + 0.1], [u + 0.7, w, z + 0.1], [u + 1.0, w, z + 0.55], [u + 1.15, w, z + 0.9], [u + 0.85, w, z + 0.45], [u - 0.85, w, z + 0.45], [u - 1.15, w, z + 0.9]];
  k.poly(hullPts, C.timberLight, k.thin, 0.08);
  k.line([[u, w, z + 0.45], [u, w, z + 1.3]], C.timberDark, Math.max(0.8, 0.1 * k.s));
  k.poly([[u - 0.02, w, z + 1.25], [u + 0.5, w, z + 1.05], [u - 0.02, w, z + 0.7]], C.cream, k.thin * 0.7);
}

// ── run: the forge ──────────────────────────────────────────────────────────
// A stone hearth of glowing coals under a hood and chimney, leather bellows
// by it, an anvil on a stump at the front with a hammer, a quench barrel
// and tongs. Worked, the coals pulse and throw embers and a bar glows on
// the anvil: the smith stands before it with the hammer and tongs (see
// npcs.ts: it strikes, and its sparks fly with each blow).

export const ANVIL = { u: 8.7, v: 9.5, z: 4.0 };
// The glowing bar on the anvil, end to end.
export const BAR: [P3, P3] = [[ANVIL.u - 0.7, ANVIL.v + 0.1, ANVIL.z + 0.12], [ANVIL.u + 0.9, ANVIL.v + 0.3, ANVIL.z + 0.12]];

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 16, (k) => {
      k.shadow(5.5, 5.5, 6.2, 6.2, 0.3);
      // the hearth of fieldstones
      stoneBlock(k, 0.8, 0.6, 0, 6.6, 4.6, 4.2, v.seed);
      k.poly([[1.7, 1.4, 4.21], [6.5, 1.4, 4.21], [6.5, 4.4, 4.21], [1.7, 4.4, 4.21]], '#2a1812', k.thin, 0.3);
      // the hood on its iron posts, the chimney up through the roof
      for (const [u, w] of [[1.2, 4.7], [6.8, 4.7]] as const) k.rod([[u, w, 4.2], [u, w, 8.4]], C.ironDark, 0.22);
      const hood: P3[][] = [
        [[0.9, 5.0, 8.25], [7.1, 5.0, 8.25], [5.2, 3.6, 11.4], [2.8, 3.6, 11.4]],
        [[7.1, 0.7, 8.25], [7.1, 5.0, 8.25], [5.2, 3.6, 11.4], [5.2, 1.6, 11.4]],
      ];
      k.box(0.7, 0.5, 7.75, 6.6, 4.8, 0.5, C.timberDark, { line: k.lw, stripe: false });
      k.poly(hood[1], k.side(C.stoneDark, 1, 0.4, 0.2), k.lw);
      k.poly(hood[0], k.vgrad(4, 5, 8.2, 11.4, [[0, '#3a2c26'], [0.3, C.stoneDark], [1, C.stone]]), k.lw);
      if (k.s >= 4) for (const f of [0.35, 0.68]) k.line([[0.9 + 1.9 * f, 5.0 - 1.4 * f, 8.2 + 3.2 * f], [7.1 - 1.9 * f, 5.0 - 1.4 * f, 8.2 + 3.2 * f], [7.1 - 1.9 * f, 0.7 + 0.9 * f, 8.2 + 3.2 * f]], withInk(0.45), k.thin * 0.8);
      stoneBlock(k, 2.9, 1.7, 11.4, 2.3, 1.9, 4.6, v.seed + 3);
      k.box(2.7, 1.5, 15.4, 2.7, 2.3, 0.6, C.stoneDark, { line: k.thin });
      // the bellows by the hearth
      k.box(7.6, 1.0, 0, 0.5, 2.6, 2.4, C.timberDark, { line: k.thin });
      const bz = 2.4;
      k.poly([[7.4, 1.0, bz], [10.4, 1.7, bz + 0.2], [10.4, 3.0, bz + 0.2], [7.4, 3.6, bz]], C.timber, k.thin);
      k.poly([[7.4, 3.6, bz], [10.4, 3.0, bz + 0.2], [10.4, 3.0, bz + 1.0], [7.4, 3.6, bz + 1.6]], C.leather, k.thin);
      if (k.fine) for (const f of [0.3, 0.55, 0.8]) k.line([[7.4 + 3 * f, 3.6 - 0.6 * f, bz + 0.1], [7.4 + 3 * f, 3.6 - 0.6 * f, bz + 1.6 - 0.6 * f]], C.leatherDark, 0.08 * k.s);
      k.poly([[7.4, 1.0, bz + 1.7], [10.4, 1.7, bz + 1.2], [10.4, 3.0, bz + 1.2], [7.4, 3.6, bz + 1.7]], shade(C.timber, 0.1), k.thin);
      k.rod([[7.5, 2.3, bz + 0.6], [6.6, 2.3, 3.9]], C.ironDark, 0.2);
      // the quench barrel
      k.shadow(2.2, 8.4, 1.6, 1.4, 0.24);
      k.cyl(2.2, 8.4, 0, 1.35, 2.9, C.timber);
      for (const z of [0.5, 2.3]) {
        const e = k.ell(2.2, 8.4, z, 1.37);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
        k.pen.strokeStyle = C.ironDark;
        k.pen.lineWidth = Math.max(1, 0.2 * k.s);
        k.pen.stroke();
      }
      k.disc(2.2, 8.4, 2.75, 1.1, '#2a3e52', 0);
      k.line([[1.7, 8.1, 2.76], [2.6, 8.6, 2.76]], '#7fa8c8', Math.max(0.7, 0.1 * k.s));
      // tongs leaning on the barrel
      k.rod([[3.4, 9.4, 0], [3.1, 8.9, 3.8]], C.ironDark, 0.12);
      k.rod([[3.7, 9.3, 0], [3.2, 8.95, 3.8]], C.ironDark, 0.12);
      // the anvil on its stump
      k.shadow(ANVIL.u, ANVIL.v, 1.8, 1.6, 0.26);
      k.cyl(ANVIL.u, ANVIL.v, 0, 1.25, 2.6, '#7a5232', { top: '#c89a68' });
      if (k.fine) for (const r of [0.8, 0.45]) {
        const e = k.ell(ANVIL.u, ANVIL.v, 2.6, r);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
        k.pen.strokeStyle = '#9a7048';
        k.pen.lineWidth = 0.06 * k.s;
        k.pen.stroke();
      }
      k.box(ANVIL.u - 0.9, ANVIL.v - 0.75, 2.6, 1.8, 1.5, 0.35, C.ironDark, { line: k.thin });
      k.box(ANVIL.u - 0.55, ANVIL.v - 0.45, 2.95, 1.1, 0.9, 0.45, C.ironDark, { line: k.thin });
      fillPts(k, hull([...ring(k, [ANVIL.u - 1.1, ANVIL.v, 3.62], [1, 0, 0], 0.4, 10), k.p(ANVIL.u - 2.6, ANVIL.v, 3.85)]), '#6a6f78', k.lw);
      k.box(ANVIL.u - 1.1, ANVIL.v - 0.65, 3.4, 2.4, 1.3, 0.6, '#6a6f78');
    });
    // the coals: a glowing bed, dark lumps on it, white-hot between them;
    // pulsing while worked
    const pulse = v.active ? 0.5 + 0.5 * Math.sin(v.t * Math.PI * 2) : 0.3;
    const pen = k.pen;
    const [bx, by] = k.p(4.1, 2.9, 4.22);
    const bed = pen.createRadialGradient(bx, by, 0, bx, by, 2.8 * k.s);
    bed.addColorStop(0, pulse > 0.55 ? C.flameHot : C.flame);
    bed.addColorStop(0.45, C.ember);
    bed.addColorStop(1, '#8a2a12');
    k.poly([[1.8, 1.5, 4.22], [6.4, 1.5, 4.22], [6.4, 4.3, 4.22], [1.8, 4.3, 4.22]], bed, 0, 0.3);
    pen.beginPath();
    for (let i = 0; i < 15; i++) {
      if (hash(i, 4) < 0.25) continue;
      const e = k.ell(2.3 + (i % 5) * 0.95 + (hash(i, 1) - 0.5) * 0.45, 1.95 + Math.floor(i / 5) * 0.95 + (hash(i, 2) - 0.5) * 0.4, 4.3, 0.28 + hash(i, 3) * 0.16);
      pen.moveTo(e.cx + e.rx, e.cy - e.ry * 0.3);
      pen.ellipse(e.cx, e.cy - e.ry * 0.3, e.rx, e.ry * 1.3, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = pulse > 0.55 ? '#5a2a18' : C.coal;
    pen.fill();
    k.halo(4.1, 2.9, 4.6, 3.6, '#ff8a3a', 0.35 + 0.3 * pulse);
    if (!v.active) {
      hammer(k, ANVIL.u - 0.4, ANVIL.v - 0.1, ANVIL.z + 0.05);
      return;
    }
    // the bar glowing on the anvil (the smith has the hammer)
    k.rod(BAR, '#ff9a3a', 0.2);
    k.halo(ANVIL.u, ANVIL.v + 0.2, ANVIL.z + 0.2, 1.6, '#ffb050', 0.4 + 0.15 * pulse);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) {
      if (due(v.t, dt, 0.3, v.seed)) spawn({ ...wisp(4, 2.6, 16, Math.floor(v.t * 10), 0, [130, 120, 112], 0.5), kind: 'smoke', vz: 2 });
      return;
    }
    // embers off the coals (the sparks off each blow are the smith's)
    const n = due(v.t, dt, 2.5, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const j = (q: number) => hash(tick, q, 3) - 0.5;
      spawn({ kind: 'ember', x: 4 + j(1) * 3.6, y: 2.9 + j(2) * 2.4, z: 4.6, vx: j(3) * 0.6, vy: j(4) * 0.6, vz: 1.8 + j(5), life: 1.0, color: [255, 150, 60], glow: true, gravity: -0.2 });
    }
  },
};

// The smith's hammer lying on the anvil while nobody works it, its haft
// out over the anvil's end.
function hammer(k: Kit, u: number, v: number, z: number): void {
  const head: P3 = [u, v, z];
  const grip: P3 = [u + 1.7, v + 1.1, z + 0.3];
  k.rod([head, grip], '#9a7048', 0.2);
  k.box(u - 0.55, v - 0.3, z - 0.3, 1.1, 0.6, 0.6, C.ironDark, { line: k.thin });
}

const withInk = (a: number) => `${INK}${Math.round(a * 255).toString(16).padStart(2, '0')}`;

// ── web: the raven on its perch ─────────────────────────────────────────────
// A raven on the T-perch atop a carved post on a round stone, a little
// dish hung from the bar, feathers dropped on the stone and a stool with a
// basket. Browsing makes it ruffle its feathers and turn its head.

const PERCH = { u: 4.5, v: 4.5, z: 10.2 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const { u, v: w, z } = PERCH;
    const k = still(v, 'web', 14, (k) => {
      k.shadow(4.5, 4.5, 4.2, 4.2, 0.28);
      // the round stone it stands on
      k.cyl(4.5, 4.5, 0, 3.3, 0.8, shade(C.stoneDark, -0.1), { top: C.stoneDark });
      if (k.fine) {
        const e = k.ell(4.5, 4.5, 0.8, 2.6);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
        k.pen.strokeStyle = shade(C.stoneDark, -0.2);
        k.pen.lineWidth = 0.08 * k.s;
        k.pen.stroke();
      }
      // feathers dropped on it
      for (let i = 0; i < 3; i++) {
        const a = hash(v.seed, i, 1) * Math.PI * 2;
        const fu = 4.5 + Math.cos(a) * 2.2;
        const fv = 4.5 + Math.sin(a) * 2.2;
        const [x0, y0] = k.p(fu, fv, 0.82);
        const [x1, y1] = k.p(fu + Math.cos(a + 1.2) * 0.8, fv + Math.sin(a + 1.2) * 0.8, 0.82);
        k.pen.beginPath();
        k.pen.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.hypot(x1 - x0, y1 - y0) / 2, 0.16 * k.s, Math.atan2(y1 - y0, x1 - x0), 0, Math.PI * 2);
        k.paint(C.raven, k.thin * 0.6);
      }
      // the post with its carved bands
      k.box(u - 0.6, w - 0.6, 0.8, 1.2, 1.2, z - 1.0, C.timber, { stripe: false });
      for (const zb of [2.0, 5.4, 8.2]) {
        k.box(u - 0.72, w - 0.72, zb, 1.44, 1.44, 0.8, C.timberDark, { line: k.thin, stripe: false });
        if (k.fine) zigzag(k, u - 0.65, u + 0.65, w + 0.73, zb + 0.4, 0.45, C.timberLight, 0.09 * k.s);
      }
      // the bar, its ends carved round, a dish hung from one end
      k.box(u - 0.45, w - 0.45, z - 0.9, 0.9, 0.9, 0.6, C.timberDark, { line: k.thin });
      k.rod([[u - 2.6, w, z - 0.25], [u + 2.6, w, z - 0.25]], C.timber, 0.36);
      for (const du of [-2.75, 2.75]) {
        const [x, y] = k.p(u + du, w, z - 0.25);
        k.pen.beginPath();
        k.pen.arc(x, y, 0.36 * k.s, 0, Math.PI * 2);
        k.paint(C.timberLight, k.thin);
      }
      k.line([[u + 2.2, w, z - 0.4], [u + 2.0, w, z - 2.6]], C.ironDark, Math.max(0.7, 0.07 * k.s));
      k.line([[u + 2.2, w, z - 0.4], [u + 2.4, w, z - 2.6]], C.ironDark, Math.max(0.7, 0.07 * k.s));
      k.cyl(u + 2.2, w, z - 3.0, 0.55, 0.4, '#8a6a4a');
      // a stool by it with a basket on it
      stool(k, 7.6, 7.4, 3.0);
      k.cyl(7.6, 7.4, 3.0, 0.8, 0.9, '#b58a50');
      k.disc(7.6, 7.4, 3.9, 0.62, '#6a4a2a', 0);
    });
    // the raven: still, or ruffling and looking about while worked
    const look = v.active ? Math.sin(v.t * 1.9) * 1.1 : 1;
    const puff = v.active ? Math.max(0, Math.sin(v.t * 2.7)) ** 2 : 0;
    raven(k, u, w, z, Math.max(-1, Math.min(1, look)), puff);
  },
};

// A raven standing at (u, v, z) in screen space: `look` -1..1 turns its
// head from back to front to forward; `puff` 0..1 ruffles it up.
function raven(k: Kit, u: number, v: number, z: number, look: number, puff: number): void {
  const pen = k.pen;
  const [fx, fy] = k.p(u, v, z);
  const ahead = k.p(u + 1, v, z)[0] - fx;
  const d = ahead >= 0 ? 1 : -1;
  const S = k.s * 1.4 * (1 + 0.1 * puff);
  // feet on the bar
  for (const o of [-0.25, 0.2]) {
    pen.beginPath();
    pen.moveTo(fx + o * S, fy - 0.55 * S);
    pen.lineTo(fx + (o + 0.1 * d) * S, fy - 0.05 * S);
    pen.strokeStyle = '#3a3a42';
    pen.lineWidth = Math.max(1, 0.14 * k.s);
    pen.stroke();
  }
  // the tail, out behind and down
  const bx = fx - 0.1 * d * S;
  const by = fy - 1.2 * S;
  pen.beginPath();
  pen.moveTo(bx - 0.5 * d * S, by + 0.1 * S);
  pen.lineTo(bx - 1.75 * d * S, by + 0.9 * S);
  pen.lineTo(bx - 1.6 * d * S, by + 1.15 * S);
  pen.lineTo(bx - 0.35 * d * S, by + 0.55 * S);
  pen.closePath();
  k.paint(C.raven, k.thin);
  // the body: an egg leaning forward
  pen.beginPath();
  pen.ellipse(bx, by, 1.05 * S, 0.68 * S, -0.45 * d, 0, Math.PI * 2);
  const g = pen.createRadialGradient(bx - 0.3 * S, by - 0.35 * S, 0, bx, by, 1.2 * S);
  g.addColorStop(0, '#4a4a5c');
  g.addColorStop(1, C.raven);
  k.paint(g, k.lw);
  // ruffled feathers standing up round its back
  if (puff > 0.05) {
    pen.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.05 + i * 0.13) + (d < 0 ? 0 : 0);
      const ax = bx + Math.cos(a) * 1.0 * S * (d > 0 ? 1 : -1) * -1;
      const ay = by + Math.sin(a) * 0.62 * S;
      pen.moveTo(ax, ay);
      pen.lineTo(ax + Math.cos(a) * 0.35 * puff * S * -d, ay + Math.sin(a) * 0.35 * puff * S);
    }
    pen.strokeStyle = C.raven;
    pen.lineWidth = Math.max(1, 0.2 * k.s);
    pen.lineCap = 'round';
    pen.stroke();
  }
  // the wing folded along its side, a blue sheen on it
  pen.beginPath();
  pen.ellipse(bx - 0.2 * d * S, by + 0.05 * S, 0.8 * S, 0.42 * S, -0.3 * d, 0, Math.PI * 2);
  k.paint('#33334a', k.thin);
  pen.beginPath();
  pen.ellipse(bx - 0.25 * d * S, by - 0.12 * S, 0.5 * S, 0.14 * S, -0.3 * d, 0, Math.PI * 2);
  pen.fillStyle = C.ravenSheen;
  pen.fill();
  // the head and its beak, turned by `look`
  const hx = bx + (0.75 * d + 0.12 * look * d) * S;
  const hy = by - 0.75 * S;
  const bd = look * d; // the way the beak points on screen
  const bl = (0.45 + 0.4 * Math.abs(look)) * S;
  pen.beginPath();
  pen.moveTo(hx + 0.22 * bd * S, hy - 0.12 * S);
  pen.lineTo(hx + 0.22 * bd * S + bl * Math.sign(bd || 1), hy + 0.12 * S + (1 - Math.abs(look)) * 0.25 * S);
  pen.lineTo(hx + 0.18 * bd * S, hy + 0.22 * S);
  pen.closePath();
  k.paint('#3a3a46', k.thin);
  pen.beginPath();
  pen.arc(hx, hy, 0.5 * S, 0, Math.PI * 2);
  k.paint(C.raven, k.lw);
  // its eye (a bright bead), on the side it is looking
  const ex = hx + 0.2 * bd * S;
  const ey = hy - 0.08 * S;
  pen.beginPath();
  pen.arc(ex, ey, Math.max(1, 0.15 * S), 0, Math.PI * 2);
  pen.fillStyle = '#f2e6c8';
  pen.fill();
  pen.beginPath();
  pen.arc(ex + 0.03 * bd * S, ey, Math.max(0.6, 0.08 * S), 0, Math.PI * 2);
  pen.fillStyle = '#120c10';
  pen.fill();
}

// ── think: the chief's high seat ────────────────────────────────────────────
// A big carved chair (knotwork bands, round finials) on a low dais, a fur
// thrown over it and a footstool before it; a horn on a stand at its side
// and an iron candle stand at the other. The chieftain sits in it (see
// npcs.ts).

// Where the chieftain sits: on the fur between the arms, its frame a unit
// under the seat (4.25 up), its boots on the footstool.
export const THRONE = { u: 6.0, v: 3.0, z: 3.25 };

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 17,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 3.5, 6.4, 3.6, 0.3);
    // the dais and its step
    k.box(0.4, 0.3, 0, 11.2, 5.7, 1.0, C.timberDark);
    if (k.fine) for (const u of [2.6, 4.8, 7.0, 9.2]) k.line([[u, 0.3, 1.01], [u, 6.0, 1.01]], shade(C.timberDark, -0.2), 0.07 * k.s);
    k.box(3.2, 6.0, 0, 5.6, 0.9, 0.5, C.timber, { line: k.thin });
    // the candle stand on the left
    k.disc(1.6, 2.2, 1.02, 0.7, C.ironDark, k.thin);
    k.rod([[1.6, 2.2, 1.0], [1.6, 2.2, 9.6]], C.ironDark, 0.16);
    candleDish(k, 1.6, 2.2, 9.6);
    candle(k, 1.6, 2.2, 9.7, 1.4);
    // the chair: a tall carved back between two posts with round finials
    const c = C.timber;
    const [cu0, cu1] = [3.0, 9.0];
    for (const u of [cu0, cu1 - 0.85]) {
      k.box(u, 0.6, 1.0, 0.85, 1.2, 14.6, shade(c, -0.05), { stripe: false });
      k.cyl(u + 0.42, 1.2, 15.6, 0.5, 0.3, C.timberDark);
      pebble(k, u + 0.42, 1.2, 15.9, 0.56, 1.05, C.timberLight, k.lw);
    }
    k.box(cu0 + 0.85, 0.8, 4.2, cu1 - cu0 - 1.7, 0.9, 10.2, c, { stripe: false });
    if (k.s >= 3) {
      k.rect(cu0 + 1.1, 12.5, cu1 - 1.1, 13.9, 1.71, shade(c, -0.1), k.thin);
      zigzag(k, cu0 + 1.3, cu1 - 1.3, 1.72, 13.2, 0.85, C.timberLight, Math.max(0.8, 0.14 * k.s));
      // a braided panel down the middle of the back
      k.rect(5.3, 7.6, 6.7, 12.0, 1.71, shade(c, -0.06), k.thin);
      for (const ph of [0, Math.PI]) {
        const pts: P3[] = [];
        for (let z = 7.8; z <= 11.8; z += 0.15) pts.push([6 + Math.sin((z - 7.8) * 2.3 + ph) * 0.42, 1.72, z]);
        k.line(pts, C.timberLight, Math.max(0.8, 0.14 * k.s));
      }
    }
    // a red cushion against the back
    k.box(4.3, 1.75, 4.25, 3.4, 0.7, 2.9, C.red, { round: 0.45 });
    // the arms: solid carved sides, the seat between them under a bear fur
    const side = (u: number) => {
      k.box(u, 1.6, 1.0, 0.85, 3.7, 5.2, c, { stripe: false });
      k.box(u - 0.1, 1.5, 6.2, 1.05, 3.95, 0.55, shade(c, 0.06), { line: k.lw });
    };
    side(cu0);
    k.box(cu0 + 0.85, 1.75, 1.0, cu1 - cu0 - 1.7, 3.4, 3.2, c);
    if (k.s >= 3) zigzag(k, cu0 + 1.0, cu1 - 1.0, 5.16, 2.6, 0.9, C.timberLight, Math.max(0.8, 0.14 * k.s));
    const bear = '#8a6440';
    furry(k, [[3.9, 1.9, 4.25], [8.1, 1.9, 4.25], [8.1, 5.15, 4.25], [8.0, 5.25, 1.9], [6.0, 5.35, 1.5], [4.0, 5.25, 1.9], [3.9, 5.15, 4.25]], k.grad([4, 1.9, 4.3], [8, 5.2, 1.6], [[0, '#b08a5e'], [0.45, bear], [1, '#5e4028']]), v.seed, 0.32, k.lw);
    if (k.fine) {
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 16; i++) {
        const fu = 4.3 + hash(v.seed, i, 31) * 3.4;
        const fv = 2.2 + hash(v.seed, i, 32) * 2.7;
        const [x0, y0] = k.p(fu, fv, 4.27);
        const [x1, y1] = k.p(fu + 0.3, fv + 0.35, 4.27);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#5e4028';
      pen.lineWidth = 0.07 * k.s;
      pen.stroke();
    }
    side(cu1 - 0.85);
    if (k.s >= 3) {
      // a braid along the near arm's outer side
      for (const ph of [0, Math.PI]) {
        const pts: P3[] = [];
        for (let w = 1.8; w <= 5.1; w += 0.12) pts.push([cu1 + 0.01, w, 3.6 + Math.sin((w - 1.8) * 2.6 + ph) * 0.55]);
        k.line(pts, C.timberLight, Math.max(0.8, 0.13 * k.s));
      }
    }
    // the footstool with a cushion
    k.box(5.0, 5.0, 1.0, 2.0, 1.0, 1.0, C.timberDark, { line: k.thin });
    k.box(5.1, 5.05, 2.0, 1.8, 0.9, 0.35, C.red, { round: 0.15, line: k.thin });
    // a horn on a stand at the right
    k.cyl(10.2, 3.2, 1.0, 0.7, 0.3, C.timberDark);
    k.rod([[10.2, 3.2, 1.3], [10.2, 3.2, 5.0]], C.timberDark, 0.18);
    k.rod([[9.6, 3.2, 5.0], [10.8, 3.2, 5.0]], C.timberDark, 0.18);
    horn(k, [[10.7, 3.2, 6.6], [10.65, 3.2, 5.4], [10.3, 3.2, 4.8], [9.7, 3.2, 4.9], [9.3, 3.2, 5.4]], 0.48, true);
  },
};

// ── idle: the long table ────────────────────────────────────────────────────
// Planks on trestles between two benches, set with drinking horns, a mead
// jug, bread, a platter with a roast and apples, cups and two candles. The
// back bench is pulled up under the table's edge: the skald sits on it at
// its end, behind the table (see SKALD and npcs.ts), clear of what stands
// on the table.

// Where the skald sits, and the table's top and back edge before it.
export const SKALD = { u: 12.6, v: 2.95, z: 2.3, top: 5.8, edge: 3.6 };

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.5, 5.5, 8, 5.4, 0.3);
    bench(k, 1.2, 13.8, 1.9, 3.6, 3.3);
    // trestles and the stretcher
    for (const u of [2.6, 11.9]) {
      k.box(u, 3.8, 0, 0.6, 3.4, 0.5, C.timberDark, { line: k.thin });
      k.box(u, 4.9, 0.5, 0.6, 1.2, 4.7, C.timber, { stripe: false, line: k.thin });
    }
    k.box(2.6, 5.25, 2.0, 9.9, 0.5, 0.5, C.timberDark, { line: k.thin, stripe: false });
    // the top: three planks
    const zt = 5.8;
    k.box(0.8, 3.6, zt - 0.6, 13.4, 3.9, 0.6, C.timber);
    for (const w of [4.9, 6.2]) k.line([[0.85, w, zt + 0.01], [14.15, w, zt + 0.01]], withInk(0.5), Math.max(0.7, 0.1 * k.s));
    // a crimson runner down it, gold at its edges, hanging over its ends
    const [r0, r1] = [4.5, 6.6];
    k.poly([[0.8, r0, zt + 0.02], [14.2, r0, zt + 0.02], [14.2, r1, zt + 0.02], [0.8, r1, zt + 0.02]], C.red, k.thin);
    k.poly([[14.2, r0, zt + 0.02], [14.2, r1, zt + 0.02], [14.25, r1, zt - 1.2], [14.25, r0, zt - 1.2]], shade(C.red, -0.18), k.thin);
    for (const w of [r0 + 0.3, r1 - 0.3]) k.line([[0.9, w, zt + 0.03], [14.1, w, zt + 0.03]], C.gold, Math.max(0.7, 0.12 * k.s));
    // what is on it
    const z = zt;
    // a platter with a roast and apples
    k.cyl(7.6, 5.5, z, 1.6, 0.2, '#8a6a4a', { top: '#a8845a' });
    pebble(k, 7.5, 5.4, z + 0.2, 0.95, 0.9, '#9a5a2e', k.thin);
    k.rod([[8.2, 5.7, z + 0.6], [8.8, 5.9, z + 0.9]], C.cream, 0.14);
    for (const [du, dv] of [[-1.0, 0.7], [-0.7, -0.6], [0.9, -0.8]] as const) pebble(k, 7.6 + du, 5.5 + dv, z + 0.2, 0.3, 0.45, C.red, k.thin * 0.8);
    // bread
    for (const [u, w] of [[3.7, 4.6], [4.6, 6.6]] as const) {
      pebble(k, u, w, z, 0.75, 0.8, '#c08a4a', k.thin);
      if (k.fine) k.line([[u - 0.35, w - 0.1, z + 0.75], [u + 0.35, w + 0.1, z + 0.75]], '#8a5a2a', 0.07 * k.s);
    }
    // the mead jug and cups
    k.cyl(10.4, 4.6, z, 0.8, 1.2, '#b8875a');
    k.cyl(10.4, 4.6, z + 1.2, 0.55, 0.5, '#c8976a');
    k.rod([[11.15, 4.6, z + 1.4], [11.6, 4.6, z + 1.1], [11.15, 4.6, z + 0.5]], '#b8875a', 0.14);
    // a wheel of cheese, a wedge cut from it
    k.cyl(12.8, 4.9, z, 0.75, 0.55, '#e0b850', { top: '#f0d070' });
    k.poly([[12.8, 4.9, z + 0.56], [13.55, 4.9, z + 0.56], [13.33, 5.43, z + 0.56]], '#c89a38', k.thin * 0.7);
    for (const [u, w] of [[5.6, 4.4], [12.2, 6.4], [2.2, 6.6]] as const) {
      k.cyl(u, w, z, 0.42, 0.75, C.timberLight);
      k.disc(u, w, z + 0.74, 0.3, '#c98a2a', 0);
    }
    // horns: two lying, one held up in a little stand
    horn(k, [[1.8, 4.3, z + 0.45], [2.8, 4.25, z + 0.35], [3.6, 4.4, z + 0.35], [4.1, 4.7, z + 0.6]], 0.42);
    horn(k, [[12.9, 6.7, z + 0.4], [12.0, 6.95, z + 0.3], [11.2, 6.9, z + 0.32], [10.8, 6.6, z + 0.55]], 0.4);
    k.box(9.1, 6.4, z, 0.9, 0.7, 0.35, C.timberDark, { line: k.thin });
    horn(k, [[9.4, 6.75, z + 1.6], [9.45, 6.75, z + 0.9], [9.7, 6.75, z + 0.45], [10.1, 6.75, z + 0.3]], 0.38, true);
    // two candles down the middle
    for (const u of [6.0, 9.0]) {
      candleDish(k, u, 5.1, z);
      candle(k, u, 5.1, z + 0.1, 1.0);
    }
    // the near bench
    bench(k, 1.2, 13.8, 8.4, 10.1, 3.3);
  },
};

// ── entrance: the great doors ───────────────────────────────────────────────
// Two iron-banded leaves under a round arch of dressed stone, ring handles
// on them, the snowy night beyond; firewood stacked by it, cloaks on pegs
// and snowshoes on the other side, a torch on the jamb. The leaves swing in
// while someone passes, and snow blows in.

const DOOR = { u0: 3.5, u1: 9.5, spring: 13.5, hv: 0.3, face: 0.9 }; // face: the jambs' and the arch's front
const R = (DOOR.u1 - DOOR.u0) / 2;
const MID = (DOOR.u0 + DOOR.u1) / 2;
// The arch's top at u.
const archTop = (u: number) => DOOR.spring + Math.sqrt(Math.max(0, R * R - (u - MID) * (u - MID)));

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 22,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, spring } = DOOR;
    const opening: P3[] = [[u0, 0, 0], [u1, 0, 0], ...circle(MID, 0, spring, R, 16, 0, Math.PI).map(([u, , z]): P3 => [u, 0, z])];
    const arch = opening.map(([u, , z]): P3 => [u, DOOR.face, z]); // the opening in the plane of the arch's face
    const k = still(v, 'entrance', 22, (k) => {
      // What shows through the arch (kept to its opening in the plane of
      // the arch's face, so nothing of it shows past the stones): the
      // arch's underside and the threshold in the wall's depth, and past
      // them the night: sky, a slope of snow, a pine.
      const out = -0.7;
      k.pen.save();
      k.pen.beginPath();
      k.trace(arch);
      k.pen.clip();
      k.poly(arch, k.side('#3a281c', 1, 0), 0);
      k.poly([[u0, out, 0.02], [u1, out, 0.02], [u1, DOOR.face, 0.02], [u0, DOOR.face, 0.02]], C.stoneDark, k.thin);
      const back = opening.map(([u, , z]): P3 => [u, out, z]);
      k.poly(back, k.vgrad(MID, out, 0, spring + R, [[0, C.nightLow], [0.6, '#2e3a5c'], [1, C.night]]), 0);
      k.pen.save();
      k.pen.beginPath();
      k.trace(back);
      k.pen.clip();
      k.poly([[u0 - 1, out, 0], [u1 + 1, out, 0], [u1 + 1, out, 5.2], [MID + 1, out, 6.3], [u0 - 1, out, 4.2]], '#c3d0e0', 0);
      for (const [pu, ph] of [[u0 + 1.2, 6.5], [u1 - 1.0, 5.2]] as const) {
        for (let i = 0; i < 3; i++) {
          const zb = 4.2 + i * 1.7;
          const r = 1.2 - i * 0.3;
          k.poly([[pu - r, out, zb], [pu + r, out, zb], [pu, out, zb + ph * 0.42]], C.pine, 0);
          k.poly([[pu - r * 0.8, out, zb + 0.1], [pu, out, zb + 0.5], [pu + r * 0.8, out, zb + 0.1], [pu, out, zb + 0.3]], '#dbe6f0', 0);
        }
      }
      k.poly([[u0 - 1, out, 0], [u1 + 1, out, 0], [u1 + 1, out, 2.2], [u0 - 1, out, 2.6]], '#e6eef6', 0);
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 16; i++) {
        const [x, y] = k.p(u0 + 0.3 + hash(i, 101) * (u1 - u0 - 0.6), out, 3 + hash(i, 102) * (spring + R - 4));
        pen.moveTo(x + Math.max(0.8, 0.14 * k.s), y);
        pen.arc(x, y, Math.max(0.8, 0.14 * k.s), 0, Math.PI * 2);
      }
      pen.fillStyle = '#eef4fa';
      pen.fill();
      pen.restore();
      pen.restore();
      // the reveal: the wall's thickness on the lit side
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, spring], [u0, out, spring]], k.side('#4a3424', 1, 0), 0);
      // firewood stacked on the left
      k.shadow(1.6, 1.9, 1.8, 1.6, 0.26);
      for (const [i, [w, z]] of [[1.0, 0.5], [2.1, 0.5], [3.2, 0.5], [1.5, 1.45], [2.65, 1.45], [2.1, 2.4]].entries()) log(k, 0.2, 2.6, w, z, 0.5, i & 1 ? '#6a4428' : '#7a5030');
      // the jambs and the arch of dressed stone
      k.box(u0 - 0.9, 0, 0, 0.9, 0.9, spring, C.timberDark, { stripe: false });
      k.box(u1, 0, 0, 0.9, 0.9, spring, C.timberDark, { stripe: false });
      for (const u of [u0 - 0.45, u1 + 0.45]) {
        if (k.fine) zigzag(k, u - 0.35, u + 0.35, 0.91, 9.5, 0.5, C.timberLight, 0.1 * k.s);
      }
      const voussoirs = 9;
      for (let i = 0; i < voussoirs; i++) {
        const a0 = (i / voussoirs) * Math.PI;
        const a1 = ((i + 1) / voussoirs) * Math.PI;
        const gap = 0.025;
        const inner = circle(MID, DOOR.face, spring, R, 3, a0 + gap, a1 - gap);
        const outer = circle(MID, DOOR.face, spring, R + 1.4 + (i === 4 ? 0.4 : 0), 3, a0 + gap, a1 - gap);
        k.poly([...inner, ...outer.reverse()], k.side([C.stone, C.stoneLight, '#96918a'][i % 3], 0, 1, 0.1), k.thin);
      }
      // a carved board over the arch
      const zb = spring + R + 2.1;
      k.box(u0 - 1.6, 0, zb, u1 - u0 + 3.2, 0.7, 1.3, C.timber, { line: k.lw });
      zigzag(k, u0 - 1.3, u1 + 1.3, 0.71, zb + 0.65, 0.7, C.timberLight, Math.max(0.8, 0.14 * k.s));
      // the torch on the left jamb, lit
      k.rod([[u0 - 1.4, 0.4, 10.0], [u0 - 1.4, 1.1, 10.4]], C.ironDark, 0.16);
      k.poly([[u0 - 1.7, 1.1, 10.2], [u0 - 1.1, 1.1, 10.2], [u0 - 1.25, 1.1, 12.0], [u0 - 1.55, 1.1, 12.0]], '#5a3a22', k.thin);
      // the right: pegs with a fur cloak and a wool one, snowshoes below
      k.box(10.9, 0, 13.0, 3.8, 0.4, 0.5, C.timberDark, { line: k.thin });
      for (const u of [11.7, 13.6]) k.rod([[u, 0.4, 13.2], [u, 1.0, 13.1]], C.timberDark, 0.18);
      furry(k, [[11.0, 0.7, 13.1], [12.4, 0.7, 13.1], [12.8, 0.9, 7.0], [10.6, 0.9, 7.2]], k.vgrad(11.7, 0.8, 7, 13, [[0, C.furDark], [1, C.fur]]), 7, 0.26, k.lw);
      k.poly([[13.0, 0.75, 13.0], [14.2, 0.75, 13.0], [14.5, 0.95, 8.4], [12.8, 0.95, 8.6]], k.vgrad(13.6, 0.9, 8.4, 13, [[0, shade(C.green, -0.15)], [1, C.green]]), k.lw, 0.3);
      k.line([[13.1, 0.98, 9.2], [14.4, 0.98, 9.0]], C.cream, Math.max(0.8, 0.18 * k.s));
      for (const [i, cu] of [11.4, 13.4].entries()) {
        const top: P3 = [cu, 0.9 + i * 0.25, 4.6];
        const shoe = circle(cu, 0.9 + i * 0.25, 2.4, 1.0, 20).map(([u, w, z]): P3 => [u, w, 2.4 + (z - 2.4) * 2.2]);
        if (k.s >= 4) {
          for (let j = -2; j <= 2; j++) {
            const hw = Math.sqrt(1 - ((j * 0.8) / 2.2) ** 2) * 0.92;
            k.line([[cu - hw, top[1], 2.4 + j * 0.8], [cu + hw, top[1], 2.4 + j * 0.8]], '#c8b080', Math.max(0.6, 0.07 * k.s));
          }
          k.line([[cu, top[1], 0.3], [cu, top[1], 4.5]], '#c8b080', Math.max(0.6, 0.07 * k.s));
        }
        k.rod(shoe.concat([shoe[0]]), '#8c6a44', 0.2);
      }
      // the doormat of plaited straw, snow blown in on it
      k.shadow(MID, 2.2, 3.2, 1.4, 0.12);
      k.poly([[u0 + 0.3, 0.8, 0.05], [u1 - 0.3, 0.8, 0.05], [u1 - 0.3, 3.5, 0.05], [u0 + 0.3, 3.5, 0.05]], '#b8955e', k.thin, 0.3);
      if (k.fine) for (let w = 1.2; w < 3.4; w += 0.5) k.line([[u0 + 0.5, w, 0.06], [u1 - 0.5, w, 0.06]], '#9a7a46', 0.06 * k.s);
      k.poly([[u0 + 0.6, 0.6, 0.07], [u0 + 2.2, 0.5, 0.07], [u0 + 1.8, 1.4, 0.07], [u0 + 0.9, 1.3, 0.07]], C.snow, 0, 0.3);
      k.poly([[u0, 0, 0.04], [u1, 0, 0.04], [u1, 0.5, 0.04], [u0, 0.5, 0.04]], C.stoneDark, k.thin);
    });
    // the leaves: shut, or swung in while someone passes (each a sprite),
    // the night's cold light in at the open doors, the torch flickering
    if (v.active) k.pool(MID, 2.0, 3.0, 1.6, C.frost, 0.2 + 0.04 * Math.sin(v.t * 3.1), 0.08);
    still(v, v.active ? 'entrance-open' : 'entrance-shut', 22, (k) => {
      // shut, they stand back in the wall's depth, behind the arch and the
      // jambs: kept to the opening in the plane of the arch's face
      if (!v.active) {
        k.pen.save();
        k.pen.beginPath();
        k.trace(arch);
        k.pen.clip();
      }
      leaf(k, DOOR.u0, 1, v.active ? 1.05 : 0);
      leaf(k, DOOR.u1, -1, v.active ? 1.05 : 0);
      if (!v.active) k.pen.restore();
    });
    const f = v.active ? 0.5 + 0.5 * Math.sin(v.t * 12.7) * Math.sin(v.t * 5.1 + 0.7) : 0.5;
    flame(k, DOOR.u0 - 1.4, 1.1, 12.6, 1.6, f, 0.55);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // snow blowing in at the open doors
    const n = due(v.t, dt, 6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q, 11);
      spawn({ kind: 'drop', x: DOOR.u0 + 0.8 + j(1) * 4.4, y: 0.4 + j(2) * 1.2, z: 4 + j(3) * 9, vx: (j(4) - 0.5) * 1.2, vy: 1.4 + j(5) * 1.4, vz: -0.6, life: 1.8, color: [236, 242, 250], glow: false, gravity: 1.2 });
    }
  },
};

// One leaf of the doors hinged at u = at, opening toward `dir` along u,
// swung th radians into the room: planks, three iron bands with curled
// ends, a ring handle.
function leaf(k: Kit, at: number, dir: 1 | -1, th: number): void {
  const w = R - 0.05;
  const du = Math.cos(th) * dir;
  const dv = Math.sin(th);
  const P = (s: number, z: number): P3 => [at + du * s, DOOR.hv + dv * s, z];
  const top = (s: number) => archTop(at + dir * s) - 0.05;
  const steps = 8;
  const shape: P3[] = [P(0, 0), P(w, 0)];
  for (let i = steps; i >= 0; i--) shape.push(P((w * i) / steps, top((w * i) / steps)));
  const nrm: [number, number] = [-dv * dir, du * dir];
  const face = k.side('#6b4a2e', nrm[0], nrm[1], 0.18);
  // the free edge's thickness once it swings
  if (th > 0.05) k.poly([P(w, 0), P(w, top(w)), [P(w, 0)[0] + nrm[0] * -0.4, P(w, 0)[1] + nrm[1] * -0.4, top(w)], [P(w, 0)[0] + nrm[0] * -0.4, P(w, 0)[1] + nrm[1] * -0.4, 0]], shade(face, -0.2), k.thin);
  k.poly(shape, face, k.lw);
  // planks
  const pen = k.pen;
  pen.beginPath();
  for (const s of [w * 0.34, w * 0.67]) {
    const [x0, y0] = k.p(...P(s, 0.1));
    const [x1, y1] = k.p(...P(s, top(s) - 0.1));
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = shade(face, -0.35);
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.stroke();
  // iron bands, their ends curled, rivets
  for (const z of [2.0, 7.4, 12.2]) {
    const end = Math.min(w - 0.2, z > 12 ? w * 0.9 : w - 0.2);
    k.line([P(0.1, z), P(end, z)], INK, Math.max(1.6, 0.5 * k.s));
    k.line([P(0.1, z), P(end, z)], C.iron, Math.max(1, 0.34 * k.s));
    const tip = P(end, z);
    const [x, y] = k.p(...tip);
    pen.beginPath();
    pen.arc(x, y, Math.max(1, 0.3 * k.s), 0, Math.PI * 2);
    k.paint(C.iron, k.thin);
    if (k.fine) for (const s of [0.6, w * 0.5]) {
      const [rx, ry] = k.p(...P(s, z));
      pen.beginPath();
      pen.arc(rx, ry, 0.1 * k.s, 0, Math.PI * 2);
      pen.fillStyle = C.ironLight;
      pen.fill();
    }
  }
  // the ring handle near the meeting edge
  const hc = P(w - 0.7, 6.0);
  const nn: P3 = [nrm[0], nrm[1], 0];
  fillPts(k, ring(k, [hc[0] + nrm[0] * 0.05, hc[1] + nrm[1] * 0.05, hc[2]], nn, 0.32, 10), C.ironDark, k.thin);
  const handle = ring(k, [hc[0] + nrm[0] * 0.1, hc[1] + nrm[1] * 0.1, hc[2] - 0.55], nn, 0.55, 18);
  pen.beginPath();
  handle.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(1.6, 0.3 * k.s);
  pen.stroke();
  pen.strokeStyle = C.ironLight;
  pen.lineWidth = Math.max(0.8, 0.16 * k.s);
  pen.stroke();
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
