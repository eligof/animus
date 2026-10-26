import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { awning, band, barrelSide, bookRow, bottle, claypot, crate, cushion, dunesView, fillPts, frontArc, gear, glass, jar, jug, keg, lantern, lathe, leaf, pipe, ring, rivets, ropeCoil, seams, stool, tube, tubeLamp } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, due, hash, kitOf, still, wisp, withAlpha } from './kit.ts';

// The outpost's stations, each a PropArt in its own frame (u along the
// wall, v out toward the agent, z up; the viewer always sees the top, the
// +v front and the +u end). Animated ones paint their still parts through
// the sprite cache (see still) and only the moving bits each frame, and
// hold still while nobody works them.

type Spawn = (p: Particle) => void;

const INKY = '#2b1d1a'; // ink in a ledger

// ── write: the scrap-wood desk ───────────────────────────────────────────────
// Planks laid across two crates: an open ledger, an ink pot, rolled
// charts, a cold tube lamp on a pole at the far end; a stool before it. Working takes the quill out of
// the pot and scratches short lines across the page, row after row.

const PAGE = { u0: 5.45, u1: 7.55, v0: 1.55, v1: 4.25, z: 5.95 };
const ROWS = 6;

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 16, (k) => {
      k.shadow(5.5, 3.2, 6.2, 3.6, 0.3);
      // a cold tube lamp on a pole behind the desk's far end
      k.cyl(10.3, 0.7, 0, 0.5, 0.3, C.steelDark, { line: k.thin });
      k.rod([[10.3, 0.7, 0.3], [10.3, 0.7, 10.5]], C.rustDark, 0.18);
      tubeLamp(k, 10.3, 0.7, 10.7, 4.6, 0.3);
      // the crates under it: the left open on a stash of scrolls
      crate(k, 0.5, 0.6, 0, 3.2, 4.2, 5.2, C.woodLight, true);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3 - i; j++) scrollEnd(k, 1.3 + j * 0.85 + i * 0.42, 4.75, 0.75 + i * 0.75, 0.4);
      crate(k, 7.3, 0.6, 0, 3.2, 4.2, 5.2, mix(C.woodLight, C.hide, 0.4));
      // three planks across, no two alike, a tin patch nailed on one
      const tops: Array<[number, number, Color]> = [[0.3, 1.9, C.woodLight], [1.9, 3.6, mix(C.wood, C.woodLight, 0.5)], [3.6, 5.3, C.woodLight]];
      for (const [v0, v1, c] of tops) k.box(0.15, v0, 5.2, 10.7, v1 - v0, 0.6, c, { line: k.thin });
      k.poly([[8.2, 3.75, 5.81], [9.9, 3.8, 5.81], [9.85, 5.1, 5.81], [8.25, 5.05, 5.81]], shade(C.scrap, 0.12), k.thin);
      rivets(k, [[8.4, 3.95, 5.82], [9.7, 3.98, 5.82], [9.65, 4.9, 5.82], [8.45, 4.85, 5.82]], C.scrapDark, 0.1);
      const zt = 5.8;
      // rolled charts tied with string
      tube(k, [0.7, 2.3, zt + 0.35], [3.6, 2.0, zt + 0.35], 0.35, 0.35, C.cream, '#e8d6b0', k.thin);
      tube(k, [0.9, 3.1, zt + 0.32], [3.3, 3.5, zt + 0.32], 0.32, 0.32, '#e2cfa4', '#dcc69a', k.thin);
      k.line([[2.1, 2.15, zt + 0.72], [2.1, 2.15, zt + 0.02]], C.cloth, Math.max(0.8, 0.1 * k.s));
      // the ledger: leather boards, the pages bowed toward the spine
      k.box(PAGE.u0 - 2.3, PAGE.v0 - 0.2, zt, 4.6 + 0.2, PAGE.v1 - PAGE.v0 + 0.4, 0.18, '#7a3a24', { line: k.thin, stripe: false });
      ledgerPage(k, PAGE.u0 - 2.1, PAGE.u0 - 0.05, zt + 0.18, -1);
      ledgerPage(k, PAGE.u0 + 0.05, PAGE.u1 - 0.05, zt + 0.18, 1);
      // last week's lines on the left page
      const old: Array<[P3, P3]> = [];
      for (let r = 0; r < ROWS; r++) {
        const w = PAGE.v0 + 0.35 + r * 0.42;
        let u = PAGE.u0 - 1.85;
        while (u < PAGE.u0 - 0.5) {
          const l = 0.25 + hash(r, Math.floor(u * 10), 7) * 0.55;
          old.push([[u, w, zt + 0.37], [Math.min(PAGE.u0 - 0.35, u + l), w, zt + 0.37]]);
          u += l + 0.18;
        }
      }
      k.segs(old, withAlpha(INKY, 0.55), Math.max(0.6, 0.07 * k.s));
      // the ink pot
      lathe(k, 8.7, 2.1, zt, [[0, 0.5], [0.45, 0.52], [0.62, 0.3], [0.8, 0.32]], C.inkPot, { mouth: '#0e0c14' });
      if (k.fine) k.line([[8.45, 2.5, zt + 0.15], [8.45, 2.5, zt + 0.42]], withAlpha('#ffffff', 0.5), 0.08 * k.s);
      // the tube lamp's cold light on the desk
      k.pool(8.6, 2.8, 3.2, 2.2, C.tubeGlow, 0.2, zt + 0.02);
      // the stool pulled up
      stool(k, 5.4, 6.1, 3.6, C.hide);
    });
    const zp = PAGE.z + 0.2;
    if (!v.active) {
      // two lines from before, and the quill back in its pot
      inkRows(k, 2, 0, zp);
      quill(k, [8.75, 2.15, 6.4], [9.6, 1.0, 9.3]);
      return;
    }
    // Row after row: each line scratched out in a second, then a pause and
    // a fresh page.
    const period = ROWS + 1.6;
    const c = v.t % period;
    const done = Math.min(ROWS, Math.floor(c));
    const part = c >= ROWS ? 0 : c - done;
    const tip = inkRows(k, done, part, zp);
    const jig = Math.sin(v.t * 31) * 0.06;
    quill(k, [tip[0] + jig, tip[1], zp + 0.05], [tip[0] + 1.0 + jig, tip[1] - 1.5, zp + 2.6]);
  },
};

// A page of the ledger from u0 to u1 bowed up toward the spine.
function ledgerPage(k: Kit, u0: number, u1: number, z: number, side: number): void {
  const pts: P3[] = [];
  const m = 6;
  const { v0, v1 } = PAGE;
  for (let i = 0; i <= m; i++) {
    const f = i / m;
    const u = u0 + (u1 - u0) * f;
    const bow = side < 0 ? f * f * 0.3 : (1 - f) * (1 - f) * 0.3;
    pts.push([u, v0, z + bow]);
  }
  for (let i = m; i >= 0; i--) {
    const f = i / m;
    const u = u0 + (u1 - u0) * f;
    const bow = side < 0 ? f * f * 0.3 : (1 - f) * (1 - f) * 0.3;
    pts.push([u, v1, z + bow]);
  }
  k.poly(pts, side < 0 ? '#f1e4c4' : '#f7ecd2', k.thin);
}

// The rows on the right page: `done` whole rows, then `part` of the next;
// returns where the quill's nib is.
function inkRows(k: Kit, done: number, part: number, z: number): P3 {
  const seg: Array<[P3, P3]> = [];
  let tip: P3 = [PAGE.u0 + 0.3, PAGE.v0 + 0.35, z];
  for (let r = 0; r < Math.min(ROWS, done + (part > 0 ? 1 : 0)); r++) {
    const w = PAGE.v0 + 0.35 + r * 0.42;
    const u0 = PAGE.u0 + 0.3;
    const u1 = PAGE.u1 - 0.35 - hash(r, 3) * 0.5;
    const end = r < done ? u1 : u0 + (u1 - u0) * part;
    let u = u0;
    let i = 0;
    while (u < end) {
      const l = 0.25 + hash(r, i, 5) * 0.5;
      seg.push([[u, w, z], [Math.min(end, u + l), w, z]]);
      u += l + 0.17;
      i++;
    }
    tip = [end, w, z];
  }
  k.segs(seg, INKY, Math.max(0.7, 0.08 * k.s));
  return tip;
}

// A quill from its nib up to its top: a quill shaft and a barred vane.
function quill(k: Kit, nib: P3, top: P3): void {
  const [x0, y0] = k.p(...nib);
  const [x1, y1] = k.p(...top);
  const a = Math.atan2(y0 - y1, x0 - x1);
  const L = Math.hypot(x1 - x0, y1 - y0);
  const mid: P3 = [nib[0] + (top[0] - nib[0]) * 0.28, nib[1] + (top[1] - nib[1]) * 0.28, nib[2] + (top[2] - nib[2]) * 0.28];
  const [mx, my] = k.p(...mid);
  leaf(k, x1, y1, a, L * 0.78, Math.max(1.2, 0.42 * k.s), '#f3e8d2', withAlpha('#a08868', 0.9));
  if (k.s >= 5) {
    // bars across the vane
    const pen = k.pen;
    pen.beginPath();
    for (const f of [0.3, 0.45]) {
      const cx = x1 + (mx - x1) * f;
      const cy = y1 + (my - y1) * f;
      const nx = -Math.sin(a) * 0.38 * k.s;
      const ny = Math.cos(a) * 0.38 * k.s;
      pen.moveTo(cx - nx, cy - ny);
      pen.lineTo(cx + nx, cy + ny);
    }
    pen.strokeStyle = withAlpha(C.rust, 0.7);
    pen.lineWidth = Math.max(0.8, 0.12 * k.s);
    pen.stroke();
  }
  k.line([nib, mid], INK, Math.max(1, 0.12 * k.s));
}

// The round end of a scroll lying with its axis along v, on the plane n.
function scrollEnd(k: Kit, u: number, n: number, z: number, r: number): void {
  k.face(u, n, z, r, '#efe0bc', k.thin, 14);
  if (k.s * r >= 2.2) {
    k.pen.beginPath();
    k.trace([[u - r * 0.5, n + 0.01, z], [u, n + 0.01, z + r * 0.55], [u + r * 0.5, n + 0.01, z]]);
    k.pen.strokeStyle = withAlpha('#a8875a', 0.8);
    k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    k.pen.stroke();
  }
}

// ── read: the crate shelves ──────────────────────────────────────────────────
// Open crates stacked into shelves: salvaged books standing and lying,
// scrolls tied with string, clay pots; a folded map and a jug on top.

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 18,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7, 2.2, 7.6, 2.6, 0.3);
    const V0 = 0.25;
    const DV = 3.45;
    const F = V0 + DV; // the crates' open fronts
    const woods: readonly Color[] = [C.woodLight, mix(C.woodLight, C.hide, 0.45), mix(C.wood, C.woodLight, 0.5), '#b4895a'];
    const box = (u0: number, u1: number, z0: number, z1: number, i: number) => crate(k, u0, V0, z0, u1 - u0, DV, z1 - z0, woods[(i + v.seed) % woods.length], true);
    const inner = (u0: number, u1: number, z0: number) => ({ a: u0 + 0.45, b: u1 - 0.45, z: z0 + 0.35, n: F - 0.04 });
    // bottom row
    const r0 = 5.4;
    box(0.2, 4.9, 0, r0, 0);
    box(5.0, 9.3, 0, r0, 1);
    box(9.4, 13.8, 0, r0, 2);
    let q = inner(0.2, 4.9, 0);
    bookRow(k, q.a, q.b, q.n, q.z, 4.3, v.seed + 1);
    q = inner(5.0, 9.3, 0);
    scrollPile(k, q.a + 0.1, q.b, q.n, q.z, 3);
    q = inner(9.4, 13.8, 0);
    claypot(k, q.b - 1.0, F - 1.4, q.z, 0.9, 2.6, C.clay, C.cream);
    bookRow(k, q.a, q.b - 2.1, q.n, q.z, 4.0, v.seed + 2);
    // middle row
    const r1 = r0 + 5.1;
    box(0.6, 6.4, r0, r1, 3);
    box(6.5, 10.9, r0, r1, 4);
    q = inner(0.6, 6.4, r0);
    for (let j = 0; j < 4; j++) k.box(q.a + 0.2, F - 2.4, q.z + j * 0.5, 2.4 - j * 0.12, 2.0, 0.5, ['#8a4a32', '#4f7f86', '#c9a46a', '#6f8f7a'][(j + v.seed) % 4], { line: k.thin, stripe: false });
    bookRow(k, q.a + 2.9, q.b, q.n, q.z, 4.0, v.seed + 3);
    q = inner(6.5, 10.9, r0);
    bookRow(k, q.a, q.b - 1.6, q.n, q.z, 4.1, v.seed + 4);
    jug(k, q.b - 0.8, F - 1.3, q.z, 0.6, 1.9, '#c88a56');
    // on the bottom right crate: a squat pot and a bundle of scrolls
    claypot(k, 12.4, 1.9, r0, 0.95, 1.9, '#b8784a', C.turquoise);
    // top row: one crate of scrolls, books lying on the middle crate
    const r2 = r1 + 4.7;
    box(1.4, 6.0, r1, r2, 5);
    q = inner(1.4, 6.0, r1);
    scrollPile(k, q.a, q.b, q.n, q.z, 3);
    for (let j = 0; j < 3; j++) k.box(7.0 + j * 0.1, 0.9, r1 + j * 0.5, 3.0 - j * 0.3, 2.3, 0.5, ['#a8603f', '#d9c4a0', '#4f7f86'][j], { line: k.thin, stripe: false });
    lathe(k, 9.8, 2.0, r1, [[0, 0.5], [0.8, 0.55], [1.1, 0.3]], C.clay, { mouth: '#4a2614', line: k.thin });
    // the folded map on top, a jug beside it
    foldedMap(k, 1.7, 0.6, r2, 3.6, 2.7, v.seed);
    jug(k, 5.3, 2.0, r2, 0.55, 1.7, C.clay);
  },
};

// A pile of scrolls on the plane n: rows of round ends, a cord round them.
function scrollPile(k: Kit, u0: number, u1: number, n: number, z: number, rows: number): void {
  const r = 0.46;
  const per = Math.max(1, Math.floor((u1 - u0) / (2 * r + 0.06)));
  for (let i = 0; i < rows; i++) {
    const cnt = per - i;
    if (cnt <= 0) break;
    for (let j = 0; j < cnt; j++) scrollEnd(k, u0 + r + 0.03 + j * (2 * r + 0.06) + i * (r + 0.03), n, z + r + i * (2 * r - 0.1), r);
  }
  const mid = u0 + (per * (2 * r + 0.06)) / 2;
  k.line([[mid - 0.15, n + 0.03, z + 0.05], [mid + 0.15, n + 0.03, z + rows * 0.8]], C.cloth, Math.max(0.8, 0.12 * k.s));
}

// A map folded in four lying on z: creases, coastlines of nothing in
// particular, a dotted route.
function foldedMap(k: Kit, u0: number, v0: number, z: number, du: number, dv: number, seed: number): void {
  const zz = z + 0.06;
  k.poly([[u0, v0, zz], [u0 + du, v0, zz], [u0 + du, v0 + dv, zz], [u0, v0 + dv, zz]], '#ecdcb4', k.thin);
  k.poly([[u0, v0 + dv * 0.5, zz], [u0 + du * 0.5, v0 + dv * 0.5, zz], [u0 + du * 0.5, v0 + dv, zz], [u0, v0 + dv, zz]], '#e2cf9e', 0);
  k.segs([[[u0 + du * 0.5, v0, zz], [u0 + du * 0.5, v0 + dv, zz]], [[u0, v0 + dv * 0.5, zz], [u0 + du, v0 + dv * 0.5, zz]]], withAlpha('#9a7a4a', 0.7), Math.max(0.6, 0.06 * k.s));
  if (k.s >= 4) {
    const coast: P3[] = [];
    for (let i = 0; i <= 8; i++) coast.push([u0 + 0.3 + i * (du - 0.6) / 8, v0 + 0.6 + Math.sin(i * 1.3 + seed) * 0.35 + i * 0.12, zz]);
    k.line(coast, withAlpha('#5f8a8a', 0.8), Math.max(0.6, 0.08 * k.s));
    const dots: P3[] = [];
    for (let i = 0; i < 6; i++) dots.push([u0 + 0.6 + i * 0.45, v0 + dv - 0.6 - Math.sin(i * 0.8) * 0.5, zz]);
    rivets(k, dots, withAlpha(C.cloth, 0.9), 0.07);
  }
}

// ── search: the spyglass ─────────────────────────────────────────────────────
// A brass spyglass on a wooden tripod, trained on a small window with the
// dunes in it, its hide blind rolled up; a chart pinned up beside it and a
// crate of rolled maps. Looking pans the glass along the horizon, its rim
// glinting.

const SLIT = { u0: 6.4, u1: 10.8, z0: 8.6, z1: 13.0 };
const HEAD: P3 = [3.6, 2.4, 8.0];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 16, (k) => {
      k.shadow(4.2, 2.3, 4.6, 2.2, 0.24);
      // the window: a plank frame set in a patch of stone, the view, the
      // reveal, a sill; its hide blind rolled up over it
      const { u0, u1, z0, z1 } = SLIT;
      k.box(u0 - 1.1, 0, z0 - 1.3, u1 - u0 + 2.2, 0.25, z1 - z0 + 2.6, C.adobeLight, { line: k.lw, stripe: false });
      k.segs([[[u0 - 1.1, 0.26, z0 - 0.2], [u1 + 1.1, 0.26, z0 - 0.2]], [[u0 - 1.1, 0.26, z1 + 0.5], [u1 + 1.1, 0.26, z1 + 0.5]], [[u0 - 0.5, 0.26, z0 - 1.3], [u0 - 0.5, 0.26, z0 - 0.2]], [[u1 + 0.4, 0.26, z1 + 0.5], [u1 + 0.4, 0.26, z1 + 1.3]]], withAlpha('#7a5230', 0.55), k.thin * 0.8);
      dunesView(k, u0, u1, z0, z1, -0.5, z0 + 1.6, v.seed + 3, false);
      k.poly([[u0, 0.25, z0], [u0, -0.5, z0], [u0, -0.5, z1], [u0, 0.25, z1]], C.adobeDark, 0);
      k.poly([[u1, 0.25, z0], [u1, -0.5, z0], [u1, -0.5, z1], [u1, 0.25, z1]], C.adobeDark, 0);
      k.poly([[u0, 0.25, z0], [u1, 0.25, z0], [u1, -0.5, z0], [u0, -0.5, z0]], C.adobeLight, 0);
      k.box(u0 - 0.5, 0.25, z0, 0.5, 0.3, z1 - z0, C.wood, { line: k.thin, stripe: false });
      k.box(u1, 0.25, z0, 0.5, 0.3, z1 - z0, C.wood, { line: k.thin, stripe: false });
      k.box(u0 - 0.7, 0.25, z0 - 0.6, u1 - u0 + 1.4, 0.9, 0.6, C.woodLight, { line: k.thin });
      k.pen.beginPath();
      k.trace([[u0, 0.26, z0], [u1, 0.26, z0], [u1, 0.26, z1], [u0, 0.26, z1]]);
      k.paint(null, k.thin);
      // the rolled blind and its ties
      tube(k, [u0 - 0.6, 0.75, z1 + 0.45], [u1 + 0.6, 0.75, z1 + 0.45], 0.5, 0.5, C.hide, shade(C.hide, -0.15), k.lw);
      for (const u of [u0 + 0.6, u1 - 0.6]) k.line([[u, 0.3, z1 + 1.0], [u, 1.3, z1 + 0.6], [u, 1.25, z1 - 0.1]], '#5a3a22', Math.max(0.8, 0.1 * k.s));
      // a chart pinned up on the left
      chart(k, 0.8, 0.06, 8.6, 2.8, 3.4, v.seed);
      // the crate of rolled maps
      crate(k, 0.3, 0.7, 0, 2.6, 2.9, 2.9, mix(C.woodLight, C.hide, 0.3));
      for (const [du, dv, c] of [[0.6, 1.3, C.cream], [1.3, 1.9, '#e2cfa4'], [1.9, 1.1, '#ecdcb4'], [1.0, 2.4, '#d8c294']] as const) tube(k, [0.3 + du, 0.7 + dv, 2.6], [0.3 + du + 0.25, 0.7 + dv - 0.3, 5.0], 0.28, 0.28, c, '#cdb68a', k.thin);
      // the tripod: three legs, a brass collar
      for (const a of [Math.PI * 0.55, Math.PI * 1.2, Math.PI * 1.85]) k.rod([[HEAD[0] + Math.cos(a) * 0.25, HEAD[1] + Math.sin(a) * 0.2, HEAD[2] - 0.4], [HEAD[0] + Math.cos(a) * 1.9, HEAD[1] + Math.sin(a) * 1.35, 0]], C.wood, 0.22);
      k.cyl(HEAD[0], HEAD[1], HEAD[2] - 0.7, 0.42, 0.7, C.brassDark, { line: k.thin });
      // a canteen on a cord, slung over a leg
      lathe(k, 2.4, 3.2, 2.4, [[0, 0.2], [0.2, 0.55], [0.85, 0.55], [1.05, 0.2]], C.hideDark, { line: k.thin });
      k.line([[2.4, 3.2, 3.45], [2.9, 3.0, 4.6], [3.2, 2.9, 5.2]], '#5a3a22', Math.max(0.7, 0.08 * k.s));
    });
    // the glass: pans along the horizon while someone looks
    const pan = v.active ? Math.sin(v.t * 0.8) * 1.3 : 0.3;
    const aim: P3 = [(SLIT.u0 + SLIT.u1) / 2 + pan, -0.5, SLIT.z0 + 2.2];
    const d: P3 = [aim[0] - HEAD[0], aim[1] - HEAD[1], aim[2] - HEAD[2]];
    const L = Math.hypot(...d);
    const at = (s: number): P3 => [HEAD[0] + (d[0] / L) * s, HEAD[1] + (d[1] / L) * s, HEAD[2] + 0.35 + (d[2] / L) * s];
    // the far end first: the hood, the big barrel, the draw tubes, the eyepiece
    tube(k, at(2.9), at(3.4), 0.66, 0.7, C.brassDark, null);
    tube(k, at(0.5), at(2.9), 0.55, 0.6, C.brass, null);
    const rim = ring(k, at(3.4), d, 0.7, 18);
    tube(k, at(-0.7), at(0.5), 0.42, 0.44, mix(C.brass, C.hide, 0.3), null);
    tube(k, at(-1.7), at(-0.7), 0.3, 0.32, C.brass, '#2b1d16');
    for (const [s0, r] of [[0.5, 0.56], [-0.7, 0.43], [1.7, 0.6]] as const) fillPts(k, ring(k, at(s0), d, r, 16), null, k.thin);
    // a band of leather round the barrel
    fillPts(k, ring(k, at(1.4), d, 0.62, 16), null, Math.max(1, 0.2 * k.s));
    if (!v.active) return;
    // a glint running round the rim now and then
    const ph = (v.t * 0.6) % 1;
    if (ph < 0.35) {
      const [gx, gy] = rim[Math.floor((ph / 0.35) * rim.length) % rim.length];
      sparkle(k, gx, gy, (0.5 + Math.sin((ph / 0.35) * Math.PI) * 0.6) * k.s);
    }
  },
};

// A four-pointed glint at (x, y), r px.
function sparkle(k: Kit, x: number, y: number, r: number): void {
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x, y - r);
  pen.quadraticCurveTo(x, y, x + r, y);
  pen.quadraticCurveTo(x, y, x, y + r);
  pen.quadraticCurveTo(x, y, x - r, y);
  pen.quadraticCurveTo(x, y, x, y - r);
  pen.fillStyle = '#fffbea';
  pen.fill();
  const g = pen.createRadialGradient(x, y, 0, x, y, r * 1.6);
  g.addColorStop(0, withAlpha('#fff2c0', 0.6));
  g.addColorStop(1, withAlpha('#fff2c0', 0));
  pen.save();
  pen.globalCompositeOperation = 'screen';
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(x, y, r * 1.6, 0, Math.PI * 2);
  pen.fill();
  pen.restore();
}

// A chart pinned to the wall: a sheet with a coast, hills and a dotted
// route to a cross.
function chart(k: Kit, u0: number, n: number, z0: number, w: number, h: number, seed: number): void {
  const q: P3[] = [[u0, n, z0], [u0 + w, n, z0 + 0.1], [u0 + w + 0.05, n, z0 + h], [u0 - 0.05, n, z0 + h - 0.1]];
  k.poly(q.map(([u, w2, z]): P3 => [u + 0.15, w2 - 0.01, z - 0.15]), withAlpha('#2a140a', 0.25), 0);
  k.poly(q, '#efe0b8', k.thin);
  if (k.s >= 4) {
    const coast: P3[] = [];
    for (let i = 0; i <= 6; i++) coast.push([u0 + 0.2 + (i * (w - 0.4)) / 6, n + 0.01, z0 + h * 0.62 + Math.sin(i * 1.4 + seed) * 0.3]);
    k.line(coast, withAlpha('#5f8a8a', 0.9), Math.max(0.6, 0.08 * k.s));
    const route: P3[] = [];
    for (let i = 0; i < 5; i++) route.push([u0 + 0.4 + i * 0.32, n + 0.01, z0 + 0.5 + i * 0.25 + Math.sin(i) * 0.15]);
    rivets(k, route, C.cloth, 0.07);
    const [cu, , cz] = route[route.length - 1];
    k.segs([[[cu + 0.15, n + 0.01, cz + 0.2], [cu + 0.45, n + 0.01, cz + 0.5]], [[cu + 0.45, n + 0.01, cz + 0.2], [cu + 0.15, n + 0.01, cz + 0.5]]], C.cloth, Math.max(0.7, 0.08 * k.s), 'round');
  }
  rivets(k, [[u0 + 0.2, n + 0.02, z0 + h - 0.25]], C.brassDark, 0.13);
}

// ── run: the crank generator ─────────────────────────────────────────────────
// A workbench under a plank shelf on pipe brackets (jars, cogs, a tin), a
// jointed machine arm bolted to it, a vise, copper wire and a bare bulb;
// in front, on a sled of planks, a spoked flywheel with a crank belted to
// a dynamo wound in copper. Working turns the crank and the wheel, the arm
// reaches, sparks jump at the dynamo and the bulb lights.

const WHEEL = { u: 3.2, n: 8.4, z: 4.5, r: 2.9 };
const DYN = { u: 8.2, z: 2.5, r: 1.25, v0: 5.9, v1: 8.1 };
const PULLEY = { u: 8.2, n: 8.4, z: 2.5, r: 0.62 };
const BULB: P3 = [9.2, 2.4, 7.4];
const SHELF = 11; // the pipe-bracket shelf over the bench
const ARM: P3 = [2.0, 2.1, 5.1]; // the jointed arm's turret

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 13, (k) => {
      k.shadow(5.5, 5.4, 6.4, 6.0, 0.3);
      // the bench: legs, a shelf with a crate of parts, the top
      for (const [u, w] of [[0.7, 0.8], [9.6, 0.8], [0.7, 3.9], [9.6, 3.9]] as const) k.box(u, w, 0, 0.6, 0.6, 4.5, C.woodDark, { line: k.thin });
      k.box(0.7, 0.8, 1.3, 9.5, 3.7, 0.3, C.wood, { line: k.thin, stripe: false });
      crate(k, 1.4, 1.2, 1.6, 2.6, 2.6, 1.9, C.woodLight);
      k.box(0.4, 0.5, 4.5, 10.2, 4.4, 0.6, C.woodLight, { line: k.lw });
      const zt = 5.1;
      // the shelf over it on pipe brackets: jars of bolts and grease, cogs
      for (const u of [1.0, 10.0]) {
        pipe(k, [[u, 0.8, zt], [u, 0.8, SHELF - 0.3], [u, 1.6, SHELF - 0.3]], 0.28);
        k.cyl(u, 0.8, zt, 0.35, 0.15, C.steelDark, { line: k.thin });
      }
      k.shadow(5.3, 1.2, 4.8, 0.9, 0.16, zt + 0.02);
      k.box(0.6, 0.3, SHELF, 10.0, 1.7, 0.45, C.plankLight, { line: k.lw });
      const zs = SHELF + 0.45;
      jar(k, 1.4, 1.1, zs, 0.45, 1.3, '#c98a3a');
      jar(k, 2.5, 1.15, zs, 0.4, 1.1, '#6f6a5e');
      gear(k, 4.1, 0.75, zs + 0.8, 0.75, 8, C.brassDark);
      gear(k, 5.3, 0.95, zs + 0.5, 0.45, 7, C.scrap);
      jar(k, 7.0, 1.1, zs, 0.5, 1.4, '#7aa86a');
      k.cyl(8.6, 1.1, zs, 0.45, 0.8, shade(C.scrap, 0.1), { line: k.thin });
      k.disc(8.6, 1.1, zs + 0.8, 0.36, '#5a5048', 0);
      // the vise on the left end
      k.box(0.7, 3.4, zt, 1.4, 1.3, 0.9, C.scrapDark, { line: k.thin });
      k.box(0.8, 4.7, zt + 0.2, 1.2, 0.35, 0.7, C.scrap, { line: k.thin });
      k.rod([[1.4, 5.05, zt + 0.55], [1.4, 5.7, zt + 0.55]], C.scrap, 0.12);
      k.rod([[1.0, 5.7, zt + 0.55], [1.8, 5.7, zt + 0.55]], C.scrap, 0.1);
      // copper wire, a tin of bolts
      ropeCoil(k, 4.3, 2.6, zt, 0.95);
      k.cyl(6.4, 3.6, zt, 0.55, 0.8, C.scrap, { line: k.thin });
      k.disc(6.4, 3.6, zt + 0.8, 0.45, '#6e665a', 0);
      // the bulb on its stand, wired to the dynamo
      k.rod([[BULB[0], BULB[1], zt], [BULB[0], BULB[1], BULB[2] - 0.6]], C.scrapDark, 0.12);
      k.cyl(BULB[0], BULB[1], zt, 0.5, 0.2, C.scrapDark, { line: k.thin });
      k.line([[BULB[0], BULB[1] + 0.2, zt + 0.1], [9.6, 4.8, zt + 0.02], [9.4, 5.4, 4.2], [DYN.u + 0.3, DYN.v0 + 0.8, DYN.z + DYN.r + 0.5]], '#3a2a1a', Math.max(0.8, 0.09 * k.s));
      // the sled the machine is bolted to
      k.box(0.7, 5.3, 0, 9.6, 4.6, 0.9, C.wood, { line: k.lw });
      seams(k, 0.7, 5.3, 0, 9.6, 4.6, 0.9, 1, 3);
      // the dynamo: iron ends, copper windings, terminals on top
      const dk = DYN;
      const seg = (v0: number, v1: number, c: Color) => tube(k, [dk.u, v0, dk.z], [dk.u, v1, dk.z], dk.r, dk.r, c, null);
      k.box(dk.u - 1.0, dk.v0 + 0.2, 0.9, 2.0, dk.v1 - dk.v0 - 0.4, 0.5, C.scrapDark, { line: k.thin });
      seg(dk.v0, dk.v0 + 0.5, C.scrapDark);
      seg(dk.v0 + 0.5, dk.v1 - 0.5, '#c8783a');
      const pen = k.pen;
      if (k.s >= 3) {
        pen.beginPath();
        for (let w = dk.v0 + 0.7; w < dk.v1 - 0.55; w += 0.22) {
          const arc = frontArc(k, dk.u, w, dk.z, dk.r * 1.005, 8);
          arc.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
        }
        pen.strokeStyle = withAlpha('#7a3e18', 0.7);
        pen.lineWidth = Math.max(0.6, 0.06 * k.s);
        pen.stroke();
      }
      seg(dk.v1 - 0.5, dk.v1, C.scrapDark);
      fillPts(k, ring(k, [dk.u, dk.v1, dk.z], [0, 1, 0], dk.r, 22), shade(C.scrap, 0.05), k.lw);
      rivets(k, [0, 1, 2, 3, 4, 5].map((i): P3 => [dk.u + Math.cos(i * 1.05) * dk.r * 0.75, dk.v1 + 0.01, dk.z + Math.sin(i * 1.05) * dk.r * 0.75]), C.scrapDark, 0.12);
      for (const du of [-0.45, 0.45]) {
        k.cyl(dk.u + du, dk.v0 + 1.1, dk.z + dk.r - 0.1, 0.18, 0.6, C.brass, { line: k.thin });
      }
      // the belt from the wheel's rim to the pulley
      const W = WHEEL;
      const P = PULLEY;
      k.line([[W.u + 0.3, W.n, W.z + W.r - 0.05], [P.u, P.n, P.z + P.r]], INK, Math.max(1.6, 0.3 * k.s + k.lw));
      k.line([[W.u + 0.3, W.n, W.z - W.r + 0.05], [P.u, P.n, P.z - P.r]], INK, Math.max(1.6, 0.3 * k.s + k.lw));
      k.line([[W.u + 0.3, W.n, W.z + W.r - 0.05], [P.u, P.n, P.z + P.r]], '#5a3a22', Math.max(1, 0.3 * k.s));
      k.line([[W.u + 0.3, W.n, W.z - W.r + 0.05], [P.u, P.n, P.z - P.r]], '#5a3a22', Math.max(1, 0.3 * k.s));
      // the wheel's A-frame and its rim
      for (const du of [-1.8, 1.8]) k.rod([[W.u + du, W.n - 0.5, 0.9], [W.u, W.n - 0.5, W.z]], C.woodDark, 0.3);
      k.rod([[W.u - 1.2, W.n - 0.5, 2.0], [W.u + 1.2, W.n - 0.5, 2.0]], C.woodDark, 0.2);
      const outer = ring(k, [W.u, W.n, W.z], [0, 1, 0], W.r, 40);
      const inn = ring(k, [W.u, W.n + 0.02, W.z], [0, 1, 0], W.r - 0.42, 40);
      pen.beginPath();
      outer.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
      pen.closePath();
      inn.slice().reverse().forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
      pen.closePath();
      pen.fillStyle = '#5a5650';
      pen.fill('evenodd');
      pen.strokeStyle = INK;
      pen.lineWidth = k.lw;
      pen.lineJoin = 'round';
      pen.stroke();
      // a lit edge round the rim's upper left
      pen.beginPath();
      ring(k, [W.u, W.n + 0.03, W.z], [0, 1, 0], W.r - 0.18, 40).slice(14, 26).forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
      pen.strokeStyle = withAlpha('#c8c0b0', 0.7);
      pen.lineWidth = Math.max(0.7, 0.1 * k.s);
      pen.stroke();
    });
    // the jointed arm on the bench: reaching for the tin while worked
    const sh = v.active ? 1.1 + 0.22 * Math.sin(v.t * 1.3) : 1.25;
    const el = v.active ? -1.6 + 0.3 * Math.sin(v.t * 1.7 + 1) : -1.9;
    arm(k, sh, el);
    const W = WHEEL;
    const P = PULLEY;
    const turn = v.active ? -v.t * 3.2 : 0.4;
    // spokes, hub and crank
    const spokes: Array<[P3, P3]> = [];
    for (let i = 0; i < 6; i++) {
      const a = turn + (i * Math.PI) / 3;
      spokes.push([[W.u + Math.cos(a) * 0.45, W.n + 0.01, W.z + Math.sin(a) * 0.45], [W.u + Math.cos(a) * (W.r - 0.38), W.n + 0.01, W.z + Math.sin(a) * (W.r - 0.38)]]);
    }
    k.segs(spokes, INK, Math.max(1.6, 0.28 * k.s + k.lw), 'round');
    k.segs(spokes, '#6e6a62', Math.max(1, 0.28 * k.s), 'round');
    k.face(W.u, W.n + 0.05, W.z, 0.6, C.brass, k.thin, 16);
    const ca = turn + 0.5;
    const hu = W.u + Math.cos(ca) * 1.8;
    const hz = W.z + Math.sin(ca) * 1.8;
    k.rod([[W.u, W.n + 0.2, W.z], [hu, W.n + 0.2, hz]], C.scrapDark, 0.26);
    k.rod([[hu, W.n + 0.2, hz], [hu, W.n + 1.3, hz]], C.woodLight, 0.3);
    // the pulley turning fast
    k.face(P.u, P.n, P.z, P.r, C.scrap, k.thin, 14);
    const pa = turn * 4.7;
    k.line([[P.u - Math.cos(pa) * P.r * 0.8, P.n + 0.02, P.z - Math.sin(pa) * P.r * 0.8], [P.u + Math.cos(pa) * P.r * 0.8, P.n + 0.02, P.z + Math.sin(pa) * P.r * 0.8]], INK, Math.max(0.8, 0.1 * k.s));
    k.face(P.u, P.n + 0.03, P.z, 0.18, C.brass, 0, 8);
    // the bulb, dark or lit
    const flick = v.active ? 0.75 + 0.25 * Math.sin(v.t * 23) * Math.sin(v.t * 7.3) : 0;
    if (v.active) k.halo(BULB[0], BULB[1], BULB[2], 4.5, C.lamp, 0.5 * flick);
    lathe(k, BULB[0], BULB[1], BULB[2] - 0.6, [[0, 0.25], [0.15, 0.3], [0.45, 0.5], [0.85, 0.45], [1.05, 0.15]], v.active ? '#fff2c0' : '#c9c2a8', { line: k.thin });
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 9, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      const side = hash(tick, 9) < 0.5 ? -0.45 : 0.45;
      spawn({ kind: 'spark', x: DYN.u + side + j(1) * 0.3, y: DYN.v0 + 1.1 + j(2) * 0.3, z: DYN.z + DYN.r + 0.55, vx: j(3) * 3, vy: j(4) * 3, vz: 1.5 + j(5) * 2, life: 0.3 + hash(tick, 6) * 0.3, color: [255, 214, 120], glow: true, gravity: 9 });
    }
  },
};

// A machine arm bolted to the bench at ARM: a turret, two jointed
// segments in the plane v = ARM[1] (the shoulder `sh` and the elbow `el`
// in radians from level), a two-fingered claw.
function arm(k: Kit, sh: number, el: number): void {
  const [u0, n, z0] = ARM;
  k.cyl(u0, n, z0, 0.6, 0.55, C.steelDark, { line: k.thin });
  const s0: P3 = [u0, n, z0 + 0.75];
  const e: P3 = [s0[0] + Math.cos(sh) * 3, n, s0[2] + Math.sin(sh) * 3];
  const w: P3 = [e[0] + Math.cos(sh + el) * 2.6, n, e[2] + Math.sin(sh + el) * 2.6];
  k.rod([s0, e], C.steelLight, 0.42);
  k.face(s0[0], n + 0.25, s0[2], 0.4, '#d9a441', k.thin, 12);
  k.rod([e, w], C.steelLight, 0.34);
  k.face(e[0], n + 0.25, e[2], 0.34, '#d9a441', k.thin, 12);
  // the claw, pointing on down the forearm
  const a = sh + el;
  for (const d of [-0.45, 0.45]) {
    const f: P3 = [w[0] + Math.cos(a + d) * 0.7, n, w[2] + Math.sin(a + d) * 0.7];
    k.rod([w, f, [f[0] + Math.cos(a) * 0.35, n, f[2] + Math.sin(a) * 0.35]], C.steelDark, 0.13);
  }
  k.line([[u0 + 0.3, n - 0.3, z0 + 0.3], [e[0] - 0.2, n - 0.3, e[2] - 0.3]], '#2e2620', Math.max(0.7, 0.08 * k.s));
}

// ── web: the signal mast ─────────────────────────────────────────────────────
// A wooden cabinet radio on a crate, a lead running up a tall thin mast
// held by guy wires, a pennant at its top. Listening lights the dial
// amber and sweeps its needle; the pennant flies and the tip glints.

const MAST = { u: 7.3, v: 1.9, top: 23.2 };
const DIAL = { u: 4.45, z: 6.35, r: 0.78 };
const FRONT = 6.6;

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 24,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 24, (k) => {
      k.shadow(4.4, 4.6, 4.6, 4.2, 0.28);
      const M = MAST;
      // guy wires behind, the mast's foot in a tub of stones
      const wire = (a: P3) => {
        k.line([[M.u, M.v, M.top - 1.2], a], withAlpha(INK, 0.85), Math.max(0.8, 0.07 * k.s));
        k.rod([a, [a[0], a[1], a[2] + 0.5]], C.woodDark, 0.1);
      };
      wire([0.5, 0.4, 0]);
      wire([8.6, 0.4, 0]);
      k.cyl(M.u, M.v, 0, 0.95, 1.3, C.scrap, { line: k.lw });
      k.disc(M.u, M.v, 1.3, 0.8, '#8a7a62', 0);
      for (const [du, dv] of [[-0.4, -0.2], [0.3, 0.3], [0.35, -0.35]] as const) k.disc(M.u + du, M.v + dv, 1.35, 0.25, '#b8a080', k.thin * 0.7);
      // the mast: a thin pole, two crossbars with insulators, a cap
      k.rod([[M.u, M.v, 1.2], [M.u, M.v, M.top]], C.woodLight, 0.24);
      for (const z of [M.top - 7, M.top - 3]) {
        k.rod([[M.u - 1.0, M.v, z], [M.u + 1.0, M.v, z]], C.wood, 0.16);
        for (const du of [-0.9, 0.9]) k.cyl(M.u + du, M.v, z + 0.05, 0.14, 0.35, C.turquoise, { line: k.thin * 0.8 });
      }
      k.cyl(M.u, M.v, M.top, 0.3, 0.35, C.brass, { line: k.thin });
      // the front guy wire, over everything at the back
      wire([8.6, 8.6, 0]);
      // the crate and the radio on it
      crate(k, 0.5, 2.5, 0, 5.3, 4.4, 3.4, mix(C.woodLight, C.hide, 0.3));
      k.box(0.8, 2.9, 3.4, 4.8, FRONT - 2.9, 4.4, C.wood, { round: 0.7, stripe: false });
      // the cabinet's arched front: grille cloth, the dial's bezel, knobs
      const grille: P3[] = [];
      for (let i = 0; i <= 10; i++) {
        const a = Math.PI * (i / 10);
        grille.push([2.25 + Math.cos(a) * 1.05, FRONT + 0.01, 6.2 + Math.sin(a) * 1.05]);
      }
      grille.push([1.2, FRONT + 0.01, 4.1], [3.3, FRONT + 0.01, 4.1]);
      k.poly(grille, k.side('#d8bf8a', 0, 1, 0.14), k.thin);
      if (k.s >= 3) {
        const slats: Array<[P3, P3]> = [];
        for (let u = 1.5; u < 3.1; u += 0.4) slats.push([[u, FRONT + 0.02, 4.3], [u, FRONT + 0.02, 6.2 + Math.sqrt(Math.max(0, 1.05 ** 2 - (u - 2.25) ** 2)) - 0.2]]);
        k.segs(slats, withAlpha(C.woodDark, 0.7), Math.max(0.6, 0.12 * k.s));
      }
      k.face(DIAL.u, FRONT + 0.01, DIAL.z, DIAL.r + 0.2, C.brass, k.lw, 22);
      for (const du of [-0.45, 0.45]) {
        k.face(DIAL.u + du, FRONT + 0.03, 4.5, 0.32, C.woodDark, k.thin, 12);
        k.face(DIAL.u + du - 0.06, FRONT + 0.05, 4.56, 0.12, C.brass, 0, 8);
      }
      // the lead from the radio's back up to the mast
      k.line([[2.0, 3.4, 7.6], [3.5, 2.6, 9.2], [5.6, 2.2, 10.6], [M.u - 0.1, M.v, 12.0]], '#3a2a1a', Math.max(0.8, 0.09 * k.s));
      // a tin mug and a coil of spare wire
      glass(k, 1.3, 6.4, 3.4, 0.3, 0.6, false);
      ropeCoil(k, 7.6, 6.6, 0, 0.8);
    });
    // the dial: dark, or lit amber with its needle sweeping
    const on = v.active;
    const [dx, dy] = k.p(DIAL.u, FRONT + 0.03, DIAL.z);
    if (on) k.halo(DIAL.u, FRONT + 0.4, DIAL.z, 2.6, '#ffb84a', 0.55);
    const face = ring(k, [DIAL.u, FRONT + 0.03, DIAL.z], [0, 1, 0], DIAL.r, 20);
    const g = k.pen.createRadialGradient(dx - DIAL.r * 0.3 * k.s, dy - DIAL.r * 0.3 * k.s, 0, dx, dy, DIAL.r * k.s * 1.2);
    g.addColorStop(0, on ? '#fff4c8' : '#a89a78');
    g.addColorStop(1, on ? '#ffb447' : '#6e6250');
    fillPts(k, face, g, k.thin);
    if (k.s >= 4) {
      const ticks: Array<[P3, P3]> = [];
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.15 + (i / 6) * 0.7);
        ticks.push([[DIAL.u + Math.cos(a) * DIAL.r * 0.6, FRONT + 0.04, DIAL.z + Math.sin(a) * DIAL.r * 0.6], [DIAL.u + Math.cos(a) * DIAL.r * 0.85, FRONT + 0.04, DIAL.z + Math.sin(a) * DIAL.r * 0.85]]);
      }
      k.segs(ticks, withAlpha(INK, 0.7), Math.max(0.6, 0.06 * k.s));
    }
    const na = on ? Math.PI * 0.5 + Math.sin(v.t * 1.3) * 0.9 : Math.PI * 0.72;
    k.line([[DIAL.u, FRONT + 0.05, DIAL.z - DIAL.r * 0.2], [DIAL.u + Math.cos(na) * DIAL.r * 0.85, FRONT + 0.05, DIAL.z - DIAL.r * 0.2 + Math.sin(na) * DIAL.r * 0.9]], '#b8321e', Math.max(0.8, 0.09 * k.s));
    // the pennant: flying while someone listens, hanging limp otherwise
    const M = MAST;
    const z = M.top - 0.4;
    const L = 3.4;
    const pts: P3[] = [[M.u, M.v, z]];
    const m = 6;
    for (let i = 1; i <= m; i++) {
      const f = i / m;
      const flap = on ? Math.sin(v.t * 7 - f * 3.5) * 0.35 * f : 0;
      const droop = on ? f * 0.3 : f * f * 1.6;
      pts.push([M.u - L * f * (on ? 1 : 0.55), M.v + flap, z - 0.05 - droop]);
    }
    const back: P3[] = [];
    for (let i = m - 1; i >= 1; i--) {
      const [u, w, zz] = pts[i];
      back.push([u, w, zz - 1.3 * (1 - i / m)]);
    }
    k.poly([...pts, ...back, [M.u, M.v, z - 1.3]], k.side(C.cloth, 0, 1, 0.12), k.thin);
    k.poly([pts[0], pts[2], back[back.length - 2] ?? pts[2], [M.u, M.v, z - 1.3]], k.side(C.turquoise, 0, 1, 0.12), 0);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 0.8, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: MAST.u + j(1) * 0.4, y: MAST.v + j(2) * 0.4, z: MAST.top + 0.5, vx: j(3) * 0.4, vy: j(4) * 0.4, vz: 0.8 + j(5) * 0.4, life: 1.0, color: [255, 236, 170], glow: true, gravity: 0 });
    }
  },
};

// ── think: tea on the rug ────────────────────────────────────────────────────
// A woven rug in bands of turquoise and rust, cushions round a low brass
// tray: a curved-spouted teapot and two glasses of tea, a dish of dates, a
// little lantern. Steam rises off the pot, more while someone thinks here.

const POT: P3 = [6.0, 3.5, 1.55];

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    rug(k, 0.3, 0.3, 11.4, 6.4);
    // a little lantern on the rug's far corner
    k.pool(10.9, 1.2, 2.6, 2.0, C.lamp, 0.22, 0.06);
    lanternStanding(k, 10.9, 1.1, 0.05);
    // cushions round it: a bolster at the back, two to the sides
    cushion(k, 2.2, 0.55, 0.05, 7.6, 1.5, 1.9, C.cloth, C.brass);
    cushion(k, 0.7, 2.3, 0.05, 2.4, 2.8, 1.3, C.turquoise, C.cream);
    cushion(k, 8.9, 2.3, 0.05, 2.4, 2.8, 1.3, '#d9a24c', C.cloth);
    // the tray on its folding stand
    k.shadow(POT[0], POT[1], 2.2, 2.0, 0.28, 0.05);
    for (const s of [-1, 1]) {
      k.rod([[POT[0] - 1.2, POT[1] + s * 0.9, 0.05], [POT[0] + 1.2, POT[1] - s * 0.9, 1.3]], C.woodDark, 0.14);
      k.rod([[POT[0] + 1.2, POT[1] + s * 0.9, 0.05], [POT[0] - 1.2, POT[1] - s * 0.9, 1.3]], C.woodDark, 0.14);
    }
    k.cyl(POT[0], POT[1], 1.3, 2.0, 0.2, C.brassDark, { top: C.brass });
    if (k.s >= 4) {
      const e = k.ell(POT[0], POT[1], 1.51, 1.45);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
      k.pen.strokeStyle = withAlpha(C.brassDark, 0.8);
      k.pen.lineWidth = Math.max(0.6, 0.07 * k.s);
      k.pen.stroke();
    }
    // a dish of dates, the glasses, the pot
    lathe(k, 4.8, 2.7, 1.5, [[0, 0.3], [0.25, 0.55]], C.cream, { mouth: '#e6d4b0', line: k.thin });
    if (k.s >= 3) rivets(k, [[4.65, 2.6, 1.8], [4.95, 2.75, 1.8], [4.8, 2.95, 1.82]], '#7a3a20', 0.14);
    teapot(k, POT[0], POT[1], POT[2]);
    glass(k, 4.9, 4.4, 1.5);
    glass(k, 7.3, 4.3, 1.5);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 1.6 : 0.5, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(POT[0] + 1.3, POT[1], POT[2] + 2.2, Math.floor(v.t * 10), i, [240, 236, 228], 0.3));
  },
};

// A woven rug from (u0, v0), du x dv: bands of turquoise and rust across
// a sand field, a row of diamonds, fringe at the ends.
function rug(k: Kit, u0: number, v0: number, du: number, dv: number): void {
  const z = 0.04;
  const pen = k.pen;
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.12);
  const q = (a: number, b: number, c: number, d: number): P3[] => [[a, c, z], [b, c, z], [b, d, z], [a, d, z]];
  k.poly(q(u0, u0 + du, v0, v0 + dv), C.rustDark, k.thin, 0.3);
  k.poly(q(u0 + 0.35, u0 + du - 0.35, v0 + 0.35, v0 + dv - 0.35), '#e8cf9c', 0);
  const bands: Array<[number, number, Color]> = [];
  for (const side of [0, 1]) {
    const at = (f: number) => (side ? u0 + du - f : u0 + f);
    bands.push([at(0.6), at(1.4), C.turquoise], [at(1.7), at(2.1), C.cloth], [at(2.4), at(2.7), C.turquoiseDark]);
  }
  bands.push([u0 + du / 2 - 1.6, u0 + du / 2 + 1.6, C.cloth]);
  for (const [a, b, c] of bands) k.poly(q(Math.min(a, b), Math.max(a, b), v0 + 0.35, v0 + dv - 0.35), c, 0);
  // diamonds down the middle band and along the field
  pen.beginPath();
  const dia = (cu: number, cv: number, r: number) => k.trace([[cu - r, cv, z], [cu, cv - r * 0.8, z], [cu + r, cv, z], [cu, cv + r * 0.8, z]]);
  for (let w = v0 + 1.2; w < v0 + dv - 0.8; w += 1.6) dia(u0 + du / 2, w, 0.7);
  pen.fillStyle = '#f2dcae';
  pen.fill();
  pen.beginPath();
  for (let w = v0 + 1.2; w < v0 + dv - 0.8; w += 1.6) dia(u0 + du / 2, w, 0.3);
  pen.fillStyle = C.turquoiseDark;
  pen.fill();
  pen.beginPath();
  for (const cu of [u0 + du * 0.3, u0 + du * 0.7]) for (let w = v0 + 1.6; w < v0 + dv - 1; w += 2.2) dia(cu, w, 0.45);
  pen.fillStyle = withAlpha(C.cloth, 0.8);
  pen.fill();
  // fringe on the short ends
  const fr: Array<[P3, P3]> = [];
  for (const uu of [u0, u0 + du]) for (let w = v0 + 0.3; w < v0 + dv - 0.2; w += 0.55) fr.push([[uu, w, z], [uu + (uu === u0 ? -0.6 : 0.6), w, z]]);
  k.segs(fr, '#ecd8b0', Math.max(0.8, 0.12 * k.s));
}

// A curved-spouted brass teapot on z: a round belly, a tall lid with a
// pointed knob, the handle round the back.
function teapot(k: Kit, cu: number, cv: number, z: number): void {
  k.rod([[cu - 0.75, cv, z + 1.45], [cu - 1.35, cv, z + 1.25], [cu - 1.3, cv, z + 0.55], [cu - 0.8, cv, z + 0.4]], C.brassDark, 0.14);
  k.rod([[cu + 0.7, cv, z + 0.55], [cu + 1.15, cv, z + 0.95], [cu + 1.35, cv, z + 1.6], [cu + 1.55, cv, z + 1.95]], C.brass, 0.17);
  lathe(k, cu, cv, z, [[0, 0.45], [0.12, 0.7], [0.5, 0.85], [0.9, 0.72], [1.15, 0.45], [1.3, 0.42], [1.6, 0.36], [1.95, 0.12]], C.brass);
  band(k, cu, cv, z + 1.18, 0.46, C.brassDark, Math.max(0.7, 0.1 * k.s));
  k.disc(cu, cv, z + 2.05, 0.09, C.brassDark, k.thin);
  const [x, y] = k.p(cu, cv, z + 2.25);
  k.pen.beginPath();
  k.pen.ellipse(x, y, 0.1 * k.s, 0.22 * k.s, 0, 0, Math.PI * 2);
  k.paint(C.brass, k.thin * 0.8);
}

// A small tin lantern standing on z, lit.
function lanternStanding(k: Kit, u: number, v: number, z: number): void {
  k.shadow(u, v, 0.8, 0.7, 0.25, z);
  lantern(k, u, v, z + 2.75, true, 0.38);
}

// ── idle: the bar ────────────────────────────────────────────────────────────
// A counter of plank strapped with iron on a base of riveted scrap plate;
// behind it the back bar: a plank rack of three barrels on their sides
// and two upright kegs with bent pipe taps. Tin cups, bottles and a
// pitcher on the counter, three hide-topped stools before it, a cold tube
// lamp on a pole at its end.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 16,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.5, 4.8, 8.2, 5.0, 0.3);
    // the barrel rack, shoulder high behind the counter: a plank stand,
    // posts at the back, three barrels on their sides, the posts in front
    const r = 1.45;
    const zp = 4.9;
    const zc = zp + 0.45 + r;
    for (const [u, w] of [[0.4, 0.5], [8.2, 0.5], [0.4, 2.5], [8.2, 2.5]] as const) k.box(u, w, 0, 0.45, 0.45, zp, C.woodDark, { line: k.thin });
    k.box(0.3, 0.4, zp, 8.4, 2.7, 0.45, C.woodLight, { line: k.thin });
    for (const u of [0.3, 8.3]) k.box(u, 0.4, zp + 0.45, 0.4, 0.4, 5.8, C.wood, { line: k.thin });
    barrelSide(k, 2.4, 0.5, zc, r, 2.6, C.stave, true);
    barrelSide(k, 6.2, 0.5, zc, r, 2.6, mix(C.stave, C.woodLight, 0.35), true);
    barrelSide(k, 4.3, 0.6, zc + r * 1.72, r, 2.4, shade(C.stave, 0.06), hash(v.seed, 1) < 0.5);
    for (const u of [0.3, 8.3]) k.box(u, 2.7, zp + 0.45, 0.4, 0.4, 5.8, C.wood, { line: k.thin });
    k.box(0.3, 0.4, zp + 6.25, 8.4, 2.7, 0.35, C.woodLight, { line: k.thin });
    // the kegs on tap
    keg(k, 10.3, 1.7, 0, 1.3, 6.4, C.stave, 1);
    keg(k, 13.0, 1.7, 0, 1.3, 6.0, shade(C.stave, 0.05), 1);
    // the lamp at the counter's end, behind it
    k.cyl(14.5, 3.0, 0, 0.5, 0.3, C.steelDark, { line: k.thin });
    k.rod([[14.5, 3.0, 0.3], [14.5, 3.0, 10.6]], C.rustDark, 0.2);
    tubeLamp(k, 14.5, 3.0, 10.8, 4.6, 0.28);
    // the counter: a base of plate, planks on it strapped with iron
    const cv0 = 3.7;
    const cv1 = 6.3;
    k.box(0.9, cv0, 0, 13.2, cv1 - cv0, 4.9, C.plate, { stripe: false });
    const F = cv1 + 0.01;
    k.poly([[0.9, F, 0], [14.1, F, 0], [14.1, F, 0.5], [9.5, F, 0.75], [5.2, F, 0.45], [0.9, F, 0.7]], withAlpha(k.side(C.rust, 0, 1), 0.65), 0);
    const plateSeams: Array<[P3, P3]> = [];
    for (const u of [4.2, 7.5, 10.8]) plateSeams.push([[u, F, 0.1], [u, F, 4.85]]);
    plateSeams.push([[0.9, F, 2.5], [14.1, F, 2.5]], [[14.11, cv0, 2.5], [14.11, cv1, 2.5]]);
    k.segs(plateSeams, withAlpha(INK, 0.5), Math.max(0.6, k.thin * 0.8));
    if (k.s >= 3) {
      const dots: P3[] = [];
      for (const u of [1.2, 4.0, 4.4, 7.3, 7.7, 10.6, 11.0, 13.8]) for (const z of [0.35, 2.2, 2.8, 4.6]) dots.push([u, F, z]);
      rivets(k, dots, C.plateDark, 0.09);
    }
    k.box(0.6, cv0 - 0.3, 4.9, 13.8, cv1 - cv0 + 0.75, 0.6, C.plankLight, { line: k.lw });
    seams(k, 0.6, cv0 - 0.3, 4.9, 13.8, cv1 - cv0 + 0.75, 0.6, 1, 2);
    const zt = 5.5;
    for (const u of [3.3, 8.6, 12.4]) {
      k.poly([[u, cv0 - 0.3, zt + 0.01], [u + 0.5, cv0 - 0.3, zt + 0.01], [u + 0.5, cv1 + 0.45, zt + 0.01], [u, cv1 + 0.45, zt + 0.01]], C.hoop, 0);
      k.poly([[u, cv1 + 0.46, 4.9], [u + 0.5, cv1 + 0.46, 4.9], [u + 0.5, cv1 + 0.46, zt], [u, cv1 + 0.46, zt]], k.side(C.hoop, 0, 1), 0);
      if (k.s >= 3) rivets(k, [[u + 0.25, cv0 + 0.2, zt + 0.02], [u + 0.25, cv1 - 0.1, zt + 0.02]], '#3e3a36', 0.08);
    }
    // on the counter: tin cups, a pitcher, bottles, a bowl
    for (const [u, w] of [[2.2, 5.2], [5.6, 4.6], [10.0, 5.4]] as const) glass(k, u, w, zt, 0.32, 0.75, hash(u * 10, v.seed) < 0.4);
    lathe(k, 7.2, 4.6, zt, [[0, 0.5], [0.9, 0.5], [1.3, 0.38], [1.55, 0.5]], C.scrap, { mouth: '#4a4238' });
    k.rod([[7.65, 4.6, zt + 1.2], [8.05, 4.6, zt + 1.0], [8.0, 4.6, zt + 0.4], [7.7, 4.6, zt + 0.3]], C.scrap, 0.1);
    bottle(k, 11.3, 4.3, zt, 2.1, '#4f8a5a', 0.32);
    bottle(k, 12.0, 5.1, zt, 1.8, '#c07a2a', 0.3);
    lathe(k, 13.4, 4.6, zt, [[0, 0.3], [0.35, 0.6]], C.cream, { mouth: '#d8c49a', line: k.thin });
    k.pool(12.6, 4.8, 3.0, 2.0, C.tubeGlow, 0.18, zt + 0.02);
    // the stools before it
    for (const u of [3.2, 7.4, 11.4]) stool(k, u, 8.4, 3.9, C.hide);
  },
};

// ── entrance: the way in ─────────────────────────────────────────────────────
// A doorway in a frame of big adobe blocks onto the bright dunes, a
// heavy plank door with iron straps swung back against the wall, a woven
// cloth hung across half the opening, a hide awning over it all, a water
// jar and a cold tube lamp beside it. The cloth sways aside while someone passes
// through, and a little sand blows in.

const DOOR = { u0: 3.5, u1: 9.5, h: 15.4 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 20, (k) => {
      const out = -0.6;
      dunesView(k, u0, u1, 0, h, out, 6.2, v.seed + 9);
      // the ground outside, bright sand
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, 2.4], [u0, out, 1.6]], '#f2d6a2', 0);
      // the reveal, the threshold step
      k.poly([[u0, 0, 0], [u0, out, 0], [u0, out, h], [u0, 0, h]], C.adobeDark, 0);
      k.poly([[u1, 0, 0], [u1, out, 0], [u1, out, h], [u1, 0, h]], C.adobeDark, 0);
      k.box(u0 - 0.2, out, 0, u1 - u0 + 0.4, 1.6 - out, 0.35, C.adobeLight, { line: k.thin });
      k.poly([[u0 + 0.6, 1.0, 0.36], [u0 + 2.6, 1.0, 0.36], [u0 + 2.0, 0.3, 0.36], [u0 + 0.9, 0.4, 0.36]], withAlpha(C.sand, 0.9), 0);
      // the frame of big blocks: jambs and a lintel
      const stone = C.adobe;
      const block = (a0: number, a1: number, z0: number, z1: number, c: Color) => k.box(a0, 0, z0, a1 - a0, 0.9, z1 - z0, c, { line: k.thin, stripe: false });
      const jz = [0, 3.4, 6.6, 9.8, 12.8, h];
      for (let i = 0; i + 1 < jz.length; i++) {
        block(u0 - 1.5 + (i & 1 ? 0.25 : 0), u0, jz[i], jz[i + 1], i & 1 ? C.adobeLight : stone);
        block(u1, u1 + 1.5 - (i & 1 ? 0.25 : 0), jz[i], jz[i + 1], i & 1 ? stone : C.adobeLight);
      }
      k.box(u0 - 1.9, 0, h, u1 - u0 + 3.8, 1.1, 2.1, C.adobeLight, { line: k.lw });
      k.segs([[[u0 + 2, 1.11, h], [u0 + 2, 1.11, h + 2.1]], [[u1 - 2, 1.11, h], [u1 - 2, 1.11, h + 2.1]]], withAlpha('#7a5230', 0.55), k.thin * 0.8);
      k.pen.beginPath();
      k.trace([[u0, 0.01, 0], [u1, 0.01, 0], [u1, 0.01, h], [u0, 0.01, h]]);
      k.paint(null, k.thin);
      // the rod the cloth hangs from
      k.rod([[u0 - 0.2, 0.5, h - 0.8], [u1 + 0.2, 0.5, h - 0.8]], C.woodDark, 0.14);
      // the door, swung back against the wall on the far side
      doorLeaf(k, u1 + 0.05, 0.36);
      // a water jar and a tube lamp by the way in
      k.shadow(1.4, 2.0, 1.4, 1.2, 0.26);
      claypot(k, 1.4, 2.0, 0, 1.1, 3.6, C.clay, C.cream);
      k.disc(1.4, 2.0, 3.62, 0.55, '#3a5a5a', 0);
      k.box(u0 - 2.75, 0, 8.7, 0.6, 0.2, 4.8, C.steelDark, { line: k.thin, stripe: false });
      for (const z of [8.95, 13.25]) k.rod([[u0 - 2.45, 0.15, z], [u0 - 2.45, 0.75, z]], C.steelDark, 0.12);
      tubeLamp(k, u0 - 2.45, 0.75, 9.1, 4.0, 0.25);
    });
    // the cloth: hanging over the left half, or swaying aside
    const open = v.active ? 0.75 + Math.sin(v.t * 2.6) * 0.15 : 0;
    cloth(k, open, v.active ? v.t : 0);
    // the awning over it all, in front of the cloth's top
    still(v, 'entrance-awning', 20, (k) => awning(k, u0 - 2.2, u1 + 2.2, 19.6, 3.4, 18.0, v.seed + 5, 16.0));
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // a little sand blowing in at the way in
    const n = due(v.t, dt, 3, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const j = (q: number) => hash(tick, q);
      spawn({ kind: 'smoke', x: DOOR.u0 + 1 + j(1) * 4, y: 0.4 + j(2), z: 0.3 + j(3) * 1.5, vx: (j(4) - 0.5) * 0.8, vy: 1.2 + j(5) * 1.2, vz: 0.3 + j(6) * 0.4, life: 1.2 + j(7) * 0.6, color: [232, 200, 146], glow: false, gravity: 0 });
    }
  },
};

// The door leaf hinged at u = hinge, swung open by th radians toward +u
// (back against the wall).
function doorLeaf(k: Kit, hinge: number, th: number): void {
  const w = 5.8;
  const h = DOOR.h - 0.2;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [hinge + du * s - dv * n, 0.25 + dv * s + du * n, z];
  // the face we see: its normal toward the viewer
  const [fu, fv] = -dv + du > 0 ? [-dv, du] : [dv, -du];
  const wood = '#9a6a3e';
  const face = k.side(wood, fu, fv, 0.16);
  k.poly([P(w, 0), P(w, 0, -0.45), P(w, h, -0.45), P(w, h)], k.side(wood, du, dv, 0.2), k.thin);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h)], face, k.lw);
  // boards, a few a shade off
  const boards = 5;
  const tones: P3[][] = [];
  for (let i = 0; i < boards; i++) if (hash(i, 77) < 0.4) tones.push([P((i * w) / boards, 0.05), P(((i + 1) * w) / boards, 0.05), P(((i + 1) * w) / boards, h - 0.05), P((i * w) / boards, h - 0.05)]);
  k.pen.beginPath();
  for (const q of tones) k.trace(q);
  k.pen.fillStyle = withAlpha(shade(face, -0.08), 0.8);
  k.pen.fill();
  const seg: Array<[P3, P3]> = [];
  for (let i = 1; i < boards; i++) seg.push([P((i * w) / boards, 0.1), P((i * w) / boards, h - 0.1)]);
  k.segs(seg, withAlpha(INK, 0.55), Math.max(0.6, k.thin * 0.75));
  // iron straps with studs, and a ring for a handle
  const studs: P3[] = [];
  for (const z of [2.2, h / 2, h - 2.2]) {
    k.poly([P(0, z - 0.4), P(w - 0.2, z - 0.4), P(w - 0.2, z + 0.4), P(0, z + 0.4)], shade(C.scrapDark, 0.05), k.thin);
    for (let i = 0; i < 5; i++) studs.push(P(0.5 + i * ((w - 1.2) / 4), z));
  }
  rivets(k, studs, '#a8a090', 0.14);
  const [rx, ry] = k.p(...P(w - 0.8, 7.2));
  k.pen.beginPath();
  k.pen.ellipse(rx, ry + 0.35 * k.s, 0.4 * k.s, 0.5 * k.s, 0, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1.4, 0.16 * k.s + k.thin);
  k.pen.stroke();
  k.pen.strokeStyle = C.scrap;
  k.pen.lineWidth = Math.max(0.8, 0.16 * k.s);
  k.pen.stroke();
}

// The woven cloth across the left of the doorway: `open` 0 hangs straight,
// 1 gathered aside; `t` sways its hem.
function cloth(k: Kit, open: number, t: number): void {
  const { u0, h } = DOOR;
  const top = h - 0.8;
  const n = 0.5;
  const wTop = 3.2 - open * 1.6;
  const m = 8;
  const hem: P3[] = [];
  const crest: P3[] = [];
  for (let i = 0; i <= m; i++) {
    const f = i / m;
    crest.push([u0 + 0.05 + wTop * f, n, top]);
    const sway = open > 0 ? Math.sin(t * 2.6 + f * 2) * 0.3 * open : 0;
    const swing = open * f * 1.4;
    hem.push([u0 + 0.05 + (wTop + open * 0.6) * f + sway, n + swing, 1.0 + open * f * 1.8 + (i & 1 ? 0.2 : 0)]);
  }
  const shape = [...crest, ...hem.slice().reverse()];
  k.poly(shape, k.side('#e9d6ae', 0, 1, 0.12), k.lw);
  // woven bands across it
  const bands: Array<[number, Color]> = [[0.18, C.cloth], [0.24, C.turquoise], [0.55, C.cloth], [0.62, C.turquoiseDark], [0.86, C.cloth]];
  for (const [f, c] of bands) {
    const pts: P3[] = [];
    for (let i = 0; i <= m; i++) {
      const a = crest[i];
      const b = hem[i];
      pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
    }
    k.line(pts, k.side(c, 0, 1, 0.12), Math.max(1, 0.38 * k.s));
  }
  // folds
  const folds: Array<[P3, P3]> = [];
  for (let i = 1; i < m; i += 2) folds.push([crest[i], hem[i]]);
  k.segs(folds, withAlpha(INK, 0.3), Math.max(0.6, k.thin * 0.7));
  k.line(crest, INK, k.thin);
  rivets(k, crest.filter((_, i) => i % 2 === 0).map(([u, w, z]): P3 => [u, w + 0.05, z + 0.05]), C.woodDark, 0.12);
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };

