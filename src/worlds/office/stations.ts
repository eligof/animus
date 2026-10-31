import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { beanbag, bookRow, caster, frustum, glass, mug, ring, stool, succulent } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, circle, due, hash, kitOf, still, wisp, withAlpha } from './kit.ts';

// The Startup's stations, each a PropArt in its own frame (u along the
// wall, v out toward the agent, z up; the viewer always sees the top, the
// +v front and the +u end). Animated ones paint their still parts through
// the sprite cache (see still) and only the moving bits each frame; they
// move only while worked. Screens, boards and charts show bars, lines and
// shapes, never words or digits.

type Spawn = (p: Particle) => void;

// A flat rectangle on the plane v = n, from (u0, z0) to (u1, z1).
const quad = (u0: number, z0: number, u1: number, z1: number, n: number): P3[] => [[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]];

// Clips to a rectangle on the plane v = n while `paint` runs.
function clipped(k: Kit, u0: number, z0: number, u1: number, z1: number, n: number, paint: () => void): void {
  k.pen.save();
  k.pen.beginPath();
  k.trace(quad(u0, z0, u1, z1, n));
  k.pen.clip();
  paint();
  k.pen.restore();
}

// Lines of abstract code on a screen (bars of the chart colours, indented,
// no letters), scrolled up by `scroll` units.
const CODE: readonly Color[] = [C.chart, C.chartWarm, C.chartHot, C.screenGlow, C.noteLilac];

function code(k: Kit, u0: number, z0: number, u1: number, z1: number, n: number, scroll: number, seed: number): void {
  const lh = 0.46;
  const first = Math.floor(scroll / lh);
  const off = scroll - first * lh;
  const rows = Math.ceil((z1 - z0) / lh) + 2;
  const by: Array<Array<[P3, P3]>> = CODE.map(() => []);
  for (let r = 0; r < rows; r++) {
    const line = first + r;
    const z = z1 - 0.3 - r * lh + off;
    if (z < z0 + 0.2 || z > z1 - 0.2 || hash(seed, line, 1) < 0.14) continue;
    let u = u0 + 0.3 + Math.floor(hash(seed, line, 2) * 3) * 0.4;
    const n0 = 1 + Math.floor(hash(seed, line, 3) * 3);
    for (let j = 0; j < n0; j++) {
      const len = 0.3 + hash(seed, line, 4 + j) * 1.1;
      if (u + len > u1 - 0.25) break;
      by[Math.floor(hash(seed, line, 10 + j) * CODE.length)].push([[u, n, z], [u + len, n, z]]);
      u += len + 0.25;
    }
  }
  by.forEach((l, i) => k.segs(l, CODE[i], Math.max(0.8, 0.17 * k.s), 'round'));
}

// ── write: the standing desk ────────────────────────────────────────────────
// A white top on a black steel frame, its two legs telescoped up to
// standing height, two monitors on one arm, a plain keyboard and mouse, a
// little succulent and a mug; a balance board on the floor in front. At
// work the screens glow and lines of abstract code scroll up them; idle,
// they are dark with a still sheen.

const DESK = 9.5;
const MON = { z0: 10.9, z1: 14.4, v: 1.75 };
const SCREENS: ReadonlyArray<readonly [number, number]> = [[1.2, 5.25], [5.75, 9.8]];

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 15, (k) => {
      k.shadow(5.5, 3.4, 6.0, 3.6, 0.3);
      // the frame: a foot along v under each leg, the legs in two stages,
      // a beam under the top
      for (const u of [1.6, 9.4]) {
        k.box(u - 0.4, 0.9, 0, 0.8, 4.4, 0.4, C.steel, { line: k.thin });
        k.box(u - 0.42, 2.55, 0.4, 0.84, 0.8, 4.3, C.steel, { line: k.thin });
        k.box(u - 0.3, 2.65, 4.7, 0.6, 0.6, DESK - 5.15, C.steelLight, { line: k.thin });
      }
      k.box(1.9, 2.7, DESK - 1.25, 7.2, 0.5, 0.8, C.steel, { line: k.thin, stripe: false });
      // the top, and its control pad on the front edge
      k.box(0.4, 0.8, DESK - 0.45, 10.2, 4.5, 0.45, C.white);
      k.box(8.6, 5.3, DESK - 0.75, 1.1, 0.25, 0.3, C.steel, { line: k.thin * 0.8 });
      // the monitor arm: a clamp, a pole, a bar out to both screens
      k.box(5.2, 0.85, DESK, 0.6, 0.6, 0.6, C.steel, { line: k.thin });
      k.rod([[5.5, 1.15, DESK + 0.5], [5.5, 1.15, MON.z0 + 1.4]], C.steel, 0.24);
      k.rod([[3.2, 1.25, MON.z0 + 1.5], [7.8, 1.25, MON.z0 + 1.5]], C.steel, 0.2);
      // the monitors: thin black panels, their screens to the front
      for (const [u0, u1] of SCREENS) {
        k.box(u0, MON.v - 0.4, MON.z0, u1 - u0, 0.4, MON.z1 - MON.z0, '#25272c', { line: k.lw, round: 0.12 });
      }
      // the keyboard and mouse, the succulent and the mug
      k.box(3.3, 3.25, DESK, 4.1, 1.15, 0.18, '#e3e6ea', { line: k.thin });
      if (k.fine) {
        const keys: Array<[P3, P3]> = [];
        for (const w of [3.5, 3.8, 4.1]) keys.push([[3.5, w, DESK + 0.19], [7.2, w, DESK + 0.19]]);
        k.segs(keys, withAlpha('#9aa0a8', 0.9), 0.1 * k.s);
      }
      k.box(8.0, 3.5, DESK, 0.5, 0.75, 0.2, '#e3e6ea', { line: k.thin, round: 0.2 });
      succulent(k, 1.1, 4.3, DESK, 0.5);
      mug(k, 9.9, 4.4, DESK, C.chartWarm);
      // a balance board on the floor in front: a deck on a roller
      k.shadow(5.5, 6.2, 2.2, 0.9, 0.25);
      k.box(5.05, 5.65, 0, 0.9, 1.1, 0.5, C.fabricA, { round: 0.25, line: k.thin });
      k.box(3.8, 5.55, 0.5, 3.4, 1.3, 0.25, C.birch, { line: k.thin });
      k.poly([[4.1, 5.75, 0.76], [6.9, 5.75, 0.76], [6.9, 6.65, 0.76], [4.1, 6.65, 0.76]], '#3a3c42', 0);
    });
    // the screens: lit with scrolling code while worked, dark otherwise
    const n = MON.v + 0.01;
    for (const [i, [u0, u1]] of SCREENS.entries()) {
      const [a0, a1, b0, b1] = [u0 + 0.18, u1 - 0.18, MON.z0 + 0.18, MON.z1 - 0.18];
      if (v.active) {
        glass(k, a0, b0, a1, b1, n, '#203650', '#18283c');
        clipped(k, a0, b0, a1, b1, n, () => code(k, a0, b0, a1, b1, n, v.t * (0.9 + i * 0.35), 7 + i * 13));
        k.halo((u0 + u1) / 2, n + 0.4, (MON.z0 + MON.z1) / 2, 2.6, C.screenGlow, 0.18);
      } else {
        glass(k, a0, b0, a1, b1, n, '#26364a', C.screen);
        k.poly([[a0 + 0.3, n, b0], [a0 + 1.0, n, b0], [a0 + 2.2, n, b1], [a0 + 1.5, n, b1]], withAlpha('#ffffff', 0.08), 0);
      }
    }
  },
};

// ── read: the bookshelf and its beanbag ─────────────────────────────────────
// A tall birch bookshelf of open cubbies: books with plain spines, a plant,
// a vase, a box, a stack lying flat; a big slumped beanbag in front of its
// right end.

const SHELF = { u0: 0.3, u1: 13.7, v0: 0.2, v1: 2.2, top: 21.6 };
const BOARD = 0.35;

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 22,
  draw(v: PropView): void {
    const k = kitOf(v);
    const { u0, u1, v0, v1, top } = SHELF;
    k.shadow(7, 1.8, 7.2, 1.8, 0.3);
    k.box(u0, v0, 0, u1 - u0, v1 - v0, top, C.birch, { stripe: false });
    const cols = 4;
    const rows = 4;
    const plinth = 0.8;
    const cw = (u1 - u0 - BOARD * (cols + 1)) / cols;
    const rh = (top - plinth - BOARD * (rows + 1)) / rows;
    const back = v0 + 0.25;
    const n = v1 + 0.01;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const a0 = u0 + BOARD + c * (cw + BOARD);
        const a1 = a0 + cw;
        const z0 = plinth + BOARD + r * (rh + BOARD);
        const z1 = z0 + rh;
        k.pen.save();
        k.pen.beginPath();
        k.trace(quad(a0, z0, a1, z1, n));
        k.pen.clip();
        // the cubby: its back, its floor, its lit side, the shade under the board above
        k.poly(quad(a0 - 1, z0 - 1, a1 + 1, z1 + 1, back), k.side(C.birchDark, 0, 1, 0.1), 0);
        k.poly([[a0, back, z0], [a1, back, z0], [a1, n, z0], [a0, n, z0]], shade(C.birch, 0.06), 0);
        k.poly([[a0, back, z0], [a0, n, z0], [a0, n, z1], [a0, back, z1]], k.side(C.birch, 1, 0, 0.12), 0);
        k.poly([[a0, back, z1 - 0.9], [a1, back, z1 - 0.9], [a1, n, z1], [a0, n, z1]], withAlpha('#3a2414', 0.25), 0);
        cubby(k, a0, a1, z0, rh, (back + n) / 2 + 0.2, v.seed + r * 7 + c * 3, r * cols + c);
        k.pen.restore();
        k.pen.beginPath();
        k.trace(quad(a0, z0, a1, z1, n));
        k.paint(null, k.thin);
      }
    }
    // the boards' front edges catch the light
    const edges: Array<[P3, P3]> = [];
    for (let r = 0; r <= rows; r++) edges.push([[u0 + 0.1, n, plinth + r * (rh + BOARD) + BOARD - 0.08], [u1 - 0.1, n, plinth + r * (rh + BOARD) + BOARD - 0.08]]);
    k.segs(edges, withAlpha('#fff3dc', 0.6), Math.max(0.6, 0.1 * k.s));
    // the beanbag slumped against its right end
    beanbag(k, 11.75, 2.1, 1.9, 3.5, C.fabricB);
  },
};

// What a cubby holds, by its seed: a row of books, books and a plant, a
// vase and a lying stack, or a fabric box.
function cubby(k: Kit, a0: number, a1: number, z0: number, rh: number, n: number, seed: number, i: number): void {
  const pick = hash(seed, i, 5);
  const mid = (a0 + a1) / 2;
  if (pick < 0.45) {
    bookRow(k, a0 + 0.1, a1 - 0.1, n, z0, rh - 0.8, seed);
  } else if (pick < 0.65) {
    bookRow(k, a0 + 0.1, a1 - 1.2, n, z0, rh - 1.0, seed);
    succulent(k, a1 - 0.65, n - 0.4, z0, 0.42);
  } else if (pick < 0.82) {
    // a stack lying flat, and a vase
    for (let j = 0; j < 3; j++) k.box(a0 + 0.2 + j * 0.05, n - 1.0, z0 + j * 0.3, 1.5 - j * 0.1, 1.0, 0.3, ['#4f7fae', '#e2b44a', '#c9714b'][(seed + j) % 3], { line: k.thin * 0.8 });
    frustum(k, a1 - 0.7, n - 0.5, z0, 0.35, z0 + 1.6, 0.25, hash(seed, 6) < 0.5 ? C.pot : C.terracotta, '#4a3428');
  } else {
    // a fabric box with a handle slot
    const c = [C.fabricA, C.felt, C.noteLilac][seed % 3];
    k.box(mid - 1.1, n - 1.4, z0, 2.2, 1.4, Math.min(1.8, rh - 1.2), c, { line: k.thin, round: 0.1 });
    k.poly(quad(mid - 0.35, z0 + 1.0, mid + 0.35, z0 + 1.3, n + 0.01), shade(c, -0.35), 0, 0.1);
  }
}

// ── search: the kanban board ────────────────────────────────────────────────
// A white board in a black frame on two legs: four columns ruled in thin
// ink under coloured header tabs, sticky notes in each, markers on the
// tray. At work a note lifts and moves to the next column, then another,
// a second or so apart; the rest hold still.

const KB = { u0: 0.6, u1: 11.4, z0: 4.6, z1: 16.4, n: 1.12 };
const NOTE = 1.12;
const NOTES: readonly Color[] = [C.noteYellow, C.notePink, C.noteTeal, C.noteLilac];
const HEAD = 15.0; // the header's foot

// Where a note sits: column c, row r (from the top), side j of two.
function noteAt(c: number, r: number, j: number): [number, number] {
  const cw = (KB.u1 - KB.u0) / 4;
  return [KB.u0 + c * cw + 0.22 + j * (NOTE + 0.18), HEAD - 0.35 - NOTE - r * (NOTE + 0.42)];
}

// A sticky note at (u, z) on the board, tilted by its seed, lifted off it by
// `lift`.
function note(k: Kit, u: number, z: number, color: Color, seed: number, lift = 0): void {
  const j = (i: number) => (hash(seed, i, 7) - 0.5) * 0.14;
  const n = KB.n + 0.02 + lift;
  const s = 1 + lift * 0.2;
  const w = NOTE * s;
  if (lift > 0) k.poly([[u + 0.12, KB.n + 0.02, z - 0.12], [u + w + 0.12, KB.n + 0.02, z - 0.12], [u + w + 0.12, KB.n + 0.02, z + w - 0.12], [u + 0.12, KB.n + 0.02, z + w - 0.12]], withAlpha(INK, 0.18), 0);
  k.poly([[u + j(1), n, z + j(2)], [u + w + j(3), n, z + j(4)], [u + w + j(5), n, z + w + j(6)], [u + j(7), n, z + w + j(8)]], color, k.thin * 0.8);
  if (k.fine) k.segs([[[u + 0.2, n + 0.01, z + w * 0.62], [u + w - 0.25, n + 0.01, z + w * 0.62]], [[u + 0.2, n + 0.01, z + w * 0.38], [u + w * 0.6, n + 0.01, z + w * 0.38]]], withAlpha('#4a4060', 0.45), 0.07 * k.s);
}

// The board's resting notes: each column's slots filled from the top (two
// to a row), skipping the slots the three travelling notes move through
// (a gap where a card has left is a kanban's own look).
const TRAVEL: ReadonlyArray<{ r: number; j: number; color: Color; from: number }> = [
  { r: 1, j: 1, color: C.noteYellow, from: 0 },
  { r: 2, j: 0, color: C.noteTeal, from: 1 },
  { r: 3, j: 1, color: C.notePink, from: 2 },
];
function resting(seed: number): Array<{ c: number; r: number; j: number; color: Color }> {
  const out: Array<{ c: number; r: number; j: number; color: Color }> = [];
  const counts = [7, 3, 3, 5];
  for (let c = 0; c < 4; c++) {
    for (let i = 0, slot = 0; i < counts[c]; slot++) {
      const r = Math.floor(slot / 2);
      const j = slot % 2;
      if (TRAVEL.some((t) => t.r === r && t.j === j)) continue;
      out.push({ c, r, j, color: NOTES[Math.floor(hash(seed, c * 9 + i, 3) * NOTES.length)] });
      i++;
    }
  }
  return out;
}
const STEP = 1.3; // a move every STEP seconds, the travellers taking turns

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 17,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, z0, z1, n } = KB;
    const k = still(v, 'search', 17, (k) => {
      k.shadow(6, 1.6, 6.4, 1.6, 0.28);
      // the legs and their feet
      for (const u of [0.3, 11.7]) {
        k.box(u - 0.25, 0.4, 0, 0.5, 3.3, 0.4, C.frame, { line: k.thin });
        k.box(u - 0.2, 0.8, 0.4, 0.4, 0.4, z1 - 0.2, C.frame, { line: k.thin });
      }
      // the board in its frame
      k.box(u0 - 0.25, 0.75, z0 - 0.25, u1 - u0 + 0.5, n - 0.75, z1 - z0 + 0.5, C.frame, { line: k.lw });
      k.poly(quad(u0, z0, u1, z1, n), C.board, k.thin);
      // the header tabs, the rules
      const cw = (u1 - u0) / 4;
      for (let c = 0; c < 4; c++) {
        const a = u0 + c * cw;
        k.poly(quad(a + 0.3, HEAD + 0.35, a + 0.3 + cw * 0.55, HEAD + 0.95, n + 0.01), NOTES[(c + 3) % 4], 0, 0.15);
        if (k.fine) k.line([[a + 0.3 + cw * 0.62, n + 0.01, HEAD + 0.65], [a + cw - 0.4, n + 0.01, HEAD + 0.65]], withAlpha('#5a5f7a', 0.5), 0.09 * k.s);
      }
      const rules: Array<[P3, P3]> = [[[u0 + 0.15, n + 0.01, HEAD], [u1 - 0.15, n + 0.01, HEAD]]];
      for (let c = 1; c < 4; c++) rules.push([[u0 + c * cw, n + 0.01, z0 + 0.2], [u0 + c * cw, n + 0.01, z1 - 0.2]]);
      k.segs(rules, withAlpha(INK, 0.55), Math.max(0.7, 0.08 * k.s));
      for (const [i, q] of resting(v.seed).entries()) {
        const [a, z] = noteAt(q.c, q.r, q.j);
        note(k, a, z, q.color, v.seed + i);
      }
      // the tray and what lies on it
      k.box(u0 + 0.6, n, z0 - 0.45, u1 - u0 - 1.2, 0.55, 0.25, C.frame, { line: k.thin });
      k.rod([[2.2, n + 0.3, z0 - 0.08], [3.6, n + 0.3, z0 - 0.08]], C.penBlue, 0.16);
      k.rod([[4.0, n + 0.3, z0 - 0.08], [5.4, n + 0.3, z0 - 0.08]], C.penRed, 0.16);
      k.box(8.4, n + 0.08, z0 - 0.2, 1.3, 0.4, 0.4, '#3a3c42', { line: k.thin });
      k.box(8.4, n + 0.08, z0 + 0.2, 1.3, 0.4, 0.12, C.fabricC, { line: k.thin * 0.7 });
    });
    // the travelling notes: where each is, and the one on the move
    const step = v.active ? Math.floor(v.t / STEP) : 0;
    const ph = v.active ? (v.t / STEP) % 1 : 0;
    const ease = (x: number) => x * x * (3 - 2 * x);
    for (const [i, tr] of TRAVEL.entries()) {
      const moves = Math.max(0, Math.floor((step - i + 2) / 3));
      const c = (tr.from + moves) % 4;
      const [ua, za] = noteAt(c, tr.r, tr.j);
      const moving = v.active && step % 3 === i;
      if (!moving) {
        note(k, ua, za, tr.color, 900 + i);
        continue;
      }
      const p = ease(Math.min(1, ph / 0.6));
      const [ub, zb] = noteAt((c + 1) % 4, tr.r, tr.j);
      const lift = Math.sin(Math.PI * Math.min(1, ph / 0.6)) * 0.45;
      note(k, ua + (ub - ua) * p, za + (zb - za) * p + lift * 0.8, tr.color, 900 + i, lift);
    }
  },
};

// ── run: the server rack and the 3D printer ─────────────────────────────────
// A free-standing server rack toward the open +u side, where the IT admin
// stands beside it (see npcs.ts): black steel, a smoked glass door, rows
// of units with small status lights in green and amber, patch cables in
// one. Beside it a 3D printer on a little cart: an open black frame, a bed
// with a half-printed shape on it, the print head on its gantry, spools of
// filament on the shelf below. At work the lights blink fast and the head
// runs back and forth over the print, laying it down; idle, the lights
// hold steady and the head is parked.

export const RACK = { u0: 5.4, u1: 10.4, v0: 0.8, v1: 6.3, h: 19.2 };
const UNITS: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  let z = 1.6;
  for (const h of [1.2, 0.8, 0.8, 1.6, 0.8, 1.2, 0.8, 0.8, 2.0, 0.8, 1.2, 0.8, 1.2]) {
    out.push([z, h]);
    z += h + 0.12;
  }
  return out;
})();
const CART = { u0: 0.6, u1: 4.4, v0: 4.2, v1: 8.8, top: 5.4 };
const PR = { u0: 0.9, u1: 4.1, v0: 4.5, v1: 8.2, z0: 5.4, z1: 10.6, bed: 6.4 };

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, v0, v1, h } = RACK;
    const k = still(v, 'run', 20, (k) => {
      k.shadow(5.2, 5.4, 5.6, 5.4, 0.3);
      // the cart: four posts on casters, a shelf of filament spools, its top
      const { u0: c0, u1: c1, v0: w0, v1: w1, top } = CART;
      for (const [u, w] of [[c0 + 0.3, w0 + 0.3], [c1 - 0.3, w0 + 0.3]] as const) {
        caster(k, u, w);
        k.box(u - 0.15, w - 0.15, 0.55, 0.3, 0.3, top - 0.55, C.steel, { line: k.thin });
      }
      k.box(c0, w0, 1.3, c1 - c0, w1 - w0, 0.25, C.steel, { line: k.thin });
      for (const [j, c] of ([C.noteTeal, C.chartWarm, C.white] as const).entries()) {
        const su = c0 + 0.9 + j * 1.15;
        k.cyl(su, (w0 + w1) / 2, 1.55, 0.5, 0.9, c, { line: k.thin });
        k.disc(su, (w0 + w1) / 2, 2.46, 0.18, '#2c2e33', 0);
      }
      for (const [u, w] of [[c0 + 0.3, w1 - 0.3], [c1 - 0.3, w1 - 0.3]] as const) {
        caster(k, u, w);
        k.box(u - 0.15, w - 0.15, 0.55, 0.3, 0.3, top - 0.55, C.steel, { line: k.thin });
      }
      k.box(c0, w0, top - 0.3, c1 - c0, w1 - w0, 0.3, C.birch);
      // the printer: its back posts and top, the bed, a spool on top
      const { u0: p0, u1: p1, v0: q0, v1: q1, z0: pz0, z1: pz1, bed } = PR;
      k.box(p0, q0, pz0, p1 - p0, q1 - q0, 0.5, '#2c2e33', { line: k.thin });
      for (const [u, w] of [[p0, q0], [p1 - 0.3, q0], [p0, q1 - 0.3]] as const) k.box(u, w, pz0 + 0.5, 0.3, 0.3, pz1 - pz0 - 0.5, '#2c2e33', { line: k.thin });
      k.box(p0 + 0.3, q0 + 0.4, bed - 0.2, p1 - p0 - 0.6, q1 - q0 - 0.8, 0.2, C.steelLight, { line: k.thin });
      if (k.fine) {
        const grid: Array<[P3, P3]> = [];
        for (let u = p0 + 0.8; u < p1 - 0.4; u += 0.5) grid.push([[u, q0 + 0.45, bed + 0.01], [u, q1 - 0.45, bed + 0.01]]);
        k.segs(grid, withAlpha('#ffffff', 0.25), 0.05 * k.s);
      }
      k.disc(p0 + 1.6, q0 + 0.3, pz1 + 0.45, 0.6, C.chartHot, k.thin);
      // the rack on its feet
      for (const [u, w] of [[u0 + 0.4, v0 + 0.4], [u1 - 0.4, v0 + 0.4], [u0 + 0.4, v1 - 0.4], [u1 - 0.4, v1 - 0.4]] as const) k.box(u - 0.3, w - 0.3, 0, 0.6, 0.6, 0.5, C.steel, { line: k.thin });
      k.box(u0, v0, 0.5, u1 - u0, v1 - v0, h - 0.5, '#2c2e33');
      // vents on its top
      const vents: Array<[P3, P3]> = [];
      for (let w = v0 + 0.8; w < v1 - 0.6; w += 0.6) vents.push([[u0 + 0.8, w, h + 0.01], [u1 - 0.8, w, h + 0.01]]);
      k.segs(vents, withAlpha('#0e0d10', 0.7), Math.max(0.6, 0.12 * k.s));
      // inside the door: the units, a patch panel with its cables
      const n = v1 + 0.01;
      k.poly(quad(u0 + 0.35, 0.9, u1 - 0.35, h - 0.4, n), '#16171b', 0);
      for (const [i, [z, uh]] of UNITS.entries()) {
        k.poly(quad(u0 + 0.55, z, u1 - 0.55, z + uh, n + 0.01), i & 1 ? '#3a3d44' : '#474b54', k.thin * 0.7);
        if (k.fine) {
          const slots: Array<[P3, P3]> = [];
          for (let u = u0 + 2.0; u < u1 - 0.9; u += 0.3) slots.push([[u, n + 0.02, z + uh * 0.3], [u, n + 0.02, z + uh * 0.7]]);
          k.segs(slots, withAlpha('#1c1d22', 0.8), 0.07 * k.s);
        }
        if (uh >= 2) {
          // the patch panel: loops of coloured cable
          const cols: Color[] = [C.chart, C.chartWarm, C.chartHot, C.noteLilac, C.screenGlow];
          for (let j = 0; j < 7; j++) {
            const u = u0 + 0.9 + j * 0.52;
            k.line([[u, n + 0.03, z + uh - 0.4], [u + 0.15, n + 0.25, z + 0.6], [u + 0.6, n + 0.2, z + 0.5]], cols[j % cols.length], Math.max(0.8, 0.12 * k.s));
          }
        }
      }
      // the smoked glass door, its frame and handle
      k.poly(quad(u0 + 0.35, 0.9, u1 - 0.35, h - 0.4, n + 0.05), withAlpha('#1a1d24', 0.32), 0);
      k.poly([[u0 + 0.8, n + 0.06, h - 0.6], [u0 + 1.6, n + 0.06, h - 0.6], [u0 + 3.6, n + 0.06, 6], [u0 + 2.8, n + 0.06, 6]], withAlpha('#ffffff', 0.07), 0);
      const fr: P3[] = quad(u0 + 0.35, 0.9, u1 - 0.35, h - 0.4, n + 0.06);
      k.pen.beginPath();
      k.trace(fr);
      k.paint(null, Math.max(1, 0.25 * k.s), C.steel);
      k.rod([[u1 - 0.7, n + 0.25, 8], [u1 - 0.7, n + 0.25, 12]], C.chrome, 0.16);
    });
    // the status lights
    const n = v1 + 0.08;
    const on: P3[][] = [];
    const amber: P3[][] = [];
    for (const [i, [z, uh]] of UNITS.entries()) {
      if (uh >= 2) continue;
      for (let j = 0; j < 3; j++) {
        const lit = v.active ? hash(i, j, Math.floor(v.t * 9 + hash(i, j) * 9) % 18) < 0.6 : hash(i, j, 3) < 0.75;
        if (!lit) continue;
        const u = u0 + 0.85 + j * 0.42;
        const dot: P3[] = quad(u, z + uh / 2 - 0.13, u + 0.24, z + uh / 2 + 0.13, n);
        (hash(i, j, 4) < 0.25 ? amber : on).push(dot);
      }
    }
    for (const [list, c] of [[on, '#7ad97a'], [amber, C.chartWarm]] as const) {
      k.pen.beginPath();
      for (const q of list) k.trace(q);
      k.pen.fillStyle = c;
      k.pen.fill();
    }
    if (v.active) k.halo((u0 + u1) / 2, n + 0.4, h / 2, 3.6, '#7ad97a', 0.1);
    // the print: a stepped teal shape on the bed, half done
    const { u0: p0, u1: p1, v0: q0, v1: q1, z1: pz1, bed } = PR;
    const cu = (p0 + p1) / 2;
    const cw = (q0 + q1) / 2;
    k.cyl(cu, cw, bed, 0.75, 0.9, C.noteTeal, { line: k.thin });
    k.cyl(cu, cw, bed + 0.9, 0.5, 0.1, C.noteTeal, { line: k.thin });
    // the gantry and the head
    const hu = v.active ? cu + Math.sin(v.t * Math.PI) * 1.1 : p0 + 0.7;
    const gz = pz1 - 0.9;
    k.rod([[p0 + 0.15, cw, gz], [p1 - 0.15, cw, gz]], C.chrome, 0.14);
    k.box(hu - 0.35, cw - 0.35, gz - 0.5, 0.7, 0.7, 0.9, C.chartHot, { line: k.thin });
    k.rod([[hu, cw, gz - 0.5], [hu, cw, gz - 0.75]], C.chrome, 0.08);
    if (v.active) k.line([[hu, cw, gz + 0.4], [p0 + 1.6, q0 + 0.3, pz1 + 0.45]], withAlpha(C.chartHot, 0.8), Math.max(0.6, 0.05 * k.s));
    // its front posts and top rails, over the print
    still(v, 'run-front', 20, (k) => {
      const { u0: a0, u1: a1, v0: b0, v1: b1, z0: zz0, z1: zz1 } = PR;
      k.box(a1 - 0.3, b1 - 0.3, zz0 + 0.5, 0.3, 0.3, zz1 - zz0 - 0.5, '#2c2e33', { line: k.thin });
      k.box(a0, b1 - 0.3, zz1 - 0.3, a1 - a0, 0.3, 0.3, '#2c2e33', { line: k.thin });
      k.box(a1 - 0.3, b0, zz1 - 0.3, 0.3, b1 - b0, 0.3, '#2c2e33', { line: k.thin });
      k.box(a0, b0, zz1 - 0.3, a1 - a0, 0.3, 0.3, '#2c2e33', { line: k.thin });
    });
  },
};

// ── web: the dashboard on its rolling stand ─────────────────────────────────
// A big TV on a black stand (two legs on castors, a shelf between them),
// its screen a dashboard: two bar charts, a line chart and a donut, in the
// chart colours on dark panels; no text, no digits. At work the bars rise
// and fall and the line draws itself on.

const TV = { u0: 0.3, u1: 8.7, z0: 9.4, z1: 15.6, v: 5.15 };
const BARS = [0.55, 0.8, 0.45, 0.95, 0.7, 0.6];
const LINE = [0.3, 0.42, 0.35, 0.55, 0.5, 0.68, 0.62, 0.85, 0.78, 0.92];

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, z0, z1 } = TV;
    const n = TV.v + 0.01;
    const k = still(v, 'web', 16, (k) => {
      k.shadow(4.5, 4.6, 4.6, 3.4, 0.3);
      for (const u of [1.3, 7.7]) {
        caster(k, u, 1.9);
        k.box(u - 0.3, 1.6, 0.6, 0.6, 5.8, 0.4, C.frame, { line: k.thin });
        k.box(u - 0.28, 4.35, 1.0, 0.56, 0.56, TV.z0 - 0.6, C.frame, { line: k.thin });
      }
      // the shelf, a plain box on it and a coil of cable
      k.box(1.6, 3.6, 3.0, 5.8, 2.2, 0.25, C.frame, { line: k.thin });
      k.box(2.4, 3.9, 3.25, 2.4, 1.4, 0.6, '#3a3c42', { line: k.thin, round: 0.1 });
      k.disc(2.9, 4.95, 3.86, 0.12, C.chart, 0);
      const coil = ring(k, [6.0, 4.6, 3.3], [0, 0, 1], 0.6, 16);
      k.pen.beginPath();
      coil.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
      k.pen.closePath();
      k.paint(null, Math.max(1, 0.18 * k.s), '#26272c');
      // the TV
      k.box(u0, TV.v - 0.5, z0, u1 - u0, 0.5, z1 - z0, '#202227', { round: 0.1 });
      k.poly(quad(u0 + 0.2, z0 + 0.2, u1 - 0.2, z1 - 0.2, n), k.vgrad(4.5, n, z0, z1, [[0, '#141d2a'], [1, C.screen]]), k.thin);
      // the panels
      for (const [a0, b0, a1, b1] of PANELS) k.poly(quad(a0, b0, a1, b1, n + 0.01), '#25374d', 0, 0.12);
      // the header: a row of pills
      for (const [j, c] of ([C.chart, C.chartWarm, C.noteLilac] as const).entries()) k.poly(quad(u0 + 0.6 + j * 0.9, z1 - 0.75, u0 + 1.3 + j * 0.9, z1 - 0.48, n + 0.01), c, 0, 0.1);
      k.poly(quad(u1 - 2.2, z1 - 0.72, u1 - 0.6, z1 - 0.5, n + 0.01), withAlpha('#ffffff', 0.25), 0, 0.1);
      // the donut
      const [dc, dz, dr] = [6.45, 11.05, 0.85];
      let a = -Math.PI / 2;
      for (const [frac, c] of [[0.42, C.chart], [0.26, C.chartWarm], [0.18, C.chartHot], [0.14, C.noteLilac]] as const) {
        k.line(circle(dc, n + 0.02, dz, dr, 24, a, a + frac * Math.PI * 2 - 0.08), c, 0.42 * k.s);
        a += frac * Math.PI * 2;
      }
      // two lines of key beside it
      const key: Array<[P3, P3]> = [[[4.85, n + 0.02, 11.5], [5.35, n + 0.02, 11.5]], [[4.85, n + 0.02, 10.9], [5.25, n + 0.02, 10.9]], [[4.85, n + 0.02, 10.3], [5.4, n + 0.02, 10.3]]];
      k.segs(key, withAlpha('#ffffff', 0.35), Math.max(0.7, 0.12 * k.s));
    });
    // the bars and the line
    const t = v.t;
    const live = v.active;
    const bars = (b0: number, b1: number, base: number, c: Color, salt: number) => {
      const list: P3[][] = [];
      BARS.forEach((hgt, i) => {
        const f = live ? hgt * (0.7 + 0.3 * Math.sin(t * 2.2 + i * 1.3 + salt)) : hgt;
        const u = 0.95 + i * 0.52;
        list.push(quad(u, base, u + 0.34, base + (b1 - b0) * f, n + 0.02));
      });
      k.pen.beginPath();
      for (const q of list) k.trace(q);
      k.pen.fillStyle = c;
      k.pen.fill();
    };
    bars(12.25, 14.2, 12.25, C.chart, 0);
    bars(9.85, 11.8, 9.85, C.chartWarm, 2);
    const p = live ? Math.min(1, ((t / 3.2) % 1) * 1.25) : 1;
    const pts: P3[] = [];
    const [la, lb, lz0, lz1] = [4.75, 8.15, 12.3, 14.3];
    const m = (LINE.length - 1) * p;
    for (let i = 0; i <= Math.floor(m); i++) pts.push([la + ((lb - la) * i) / (LINE.length - 1), n + 0.02, lz0 + (lz1 - lz0) * LINE[i]]);
    if (m % 1 > 0) {
      const i = Math.floor(m);
      const f = m - i;
      pts.push([la + ((lb - la) * (i + f)) / (LINE.length - 1), n + 0.02, lz0 + (lz1 - lz0) * (LINE[i] + (LINE[i + 1] - LINE[i]) * f)]);
    }
    if (pts.length > 1) {
      k.poly([...pts, [pts[pts.length - 1][0], n + 0.02, lz0], [la, n + 0.02, lz0]], withAlpha(C.chart, 0.22), 0);
      k.line(pts, C.screenGlow, Math.max(0.8, 0.16 * k.s));
      const e = pts[pts.length - 1];
      k.face(e[0], n + 0.03, e[2], 0.14, C.white, 0, 10);
    }
    if (live) k.halo(4.5, n + 0.5, 12.5, 3.6, C.screenGlow, 0.14);
  },
};
// The dashboard's dark panels: left top, left bottom, right top, right bottom.
const PANELS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.7, 12.05, 4.35, 14.45],
  [0.7, 9.65, 4.35, 11.95],
  [4.55, 12.05, 8.3, 14.45],
  [4.55, 9.65, 8.3, 11.95],
];

// ── think: the rolling whiteboard ───────────────────────────────────────────
// A big double-sided whiteboard in a light frame on two legs with castors:
// boxes joined by arrows in blue and red, a sticky note or two, markers on
// the tray; a stool in front. At work a new arrow draws itself from one
// box to another, then the next, and over again.

const WB = { u0: 1.2, u1: 10.8, z0: 5.6, z1: 17.0, n: 3.47 };
// Boxes on the board: (u0, z0, u1, z1).
const BOXES: ReadonlyArray<readonly [number, number, number, number]> = [
  [2.0, 13.6, 4.3, 15.7],
  [6.2, 14.0, 8.8, 16.0],
  [2.3, 8.2, 4.9, 10.2],
  [7.0, 9.0, 9.8, 11.0],
  [5.0, 11.3, 6.6, 12.5],
];
// Arrows from box to box: the drawn ones, then the three drawn at work.
const ARROWS: ReadonlyArray<readonly [number, number, Color]> = [
  [0, 1, C.penBlue],
  [0, 2, C.penRed],
];
const NEW: ReadonlyArray<readonly [number, number, Color]> = [
  [1, 4, C.penBlue],
  [2, 3, C.penRed],
  [4, 3, C.penBlue],
];

// The arrow from box a to box b, drawn `p` of the way (0..1).
function arrow(k: Kit, a: number, b: number, c: Color, p: number): void {
  if (p <= 0) return;
  const A = BOXES[a];
  const B = BOXES[b];
  const ca: [number, number] = [(A[0] + A[2]) / 2, (A[1] + A[3]) / 2];
  const cb: [number, number] = [(B[0] + B[2]) / 2, (B[1] + B[3]) / 2];
  // from the edge of one box to the edge of the other
  const edge = (r: readonly [number, number, number, number], from: [number, number], to: [number, number]): [number, number] => {
    const [du, dz] = [to[0] - from[0], to[1] - from[1]];
    const tu = du ? ((du > 0 ? r[2] : r[0]) - from[0]) / du : Infinity;
    const tz = dz ? ((dz > 0 ? r[3] : r[1]) - from[1]) / dz : Infinity;
    const t = Math.min(tu, tz) + 0.08;
    return [from[0] + du * t, from[1] + dz * t];
  };
  const s0 = edge(A, ca, cb);
  const s1 = edge(B, cb, ca);
  const e: [number, number] = [s0[0] + (s1[0] - s0[0]) * p, s0[1] + (s1[1] - s0[1]) * p];
  const n = WB.n + 0.02;
  const w = Math.max(0.8, 0.13 * k.s);
  k.line([[s0[0], n, s0[1]], [e[0], n, e[1]]], c, w);
  if (p < 1) return;
  const ang = Math.atan2(s1[1] - s0[1], s1[0] - s0[0]);
  const head = (da: number): P3 => [e[0] - Math.cos(ang + da) * 0.5, n, e[1] - Math.sin(ang + da) * 0.5];
  k.line([head(0.5), [e[0], n, e[1]], head(-0.5)], c, w);
}

const ARROW_T = 1.1; // seconds to draw one arrow
const WB_CYCLE = NEW.length * ARROW_T + 1.6;

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 18,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, z0, z1, n } = WB;
    const k = still(v, 'think', 18, (k) => {
      k.shadow(6, 3.4, 6.4, 2.8, 0.28);
      // the legs: a foot on castors, an upright, each end
      for (const u of [0.75, 11.25]) {
        caster(k, u, 1.2, 'v');
        caster(k, u, 5.6, 'v');
        k.box(u - 0.3, 0.9, 0.55, 0.6, 5.0, 0.35, C.steel, { line: k.thin });
        k.box(u - 0.25, 3.0, 0.9, 0.5, 0.5, z1 + 0.2 - 0.9, C.chrome, { line: k.thin });
      }
      // the board in its frame
      k.box(u0 - 0.2, 3.05, z0 - 0.2, u1 - u0 + 0.4, n - 3.05, z1 - z0 + 0.4, C.chrome, { line: k.lw });
      k.poly(quad(u0, z0, u1, z1, n), C.board, k.thin);
      // the boxes, a couple of lines of notes in each, the drawn arrows
      for (const [b0, c0, b1, c1] of BOXES) {
        k.pen.beginPath();
        k.trace(quad(b0, c0, b1, c1, n + 0.01));
        k.paint(null, Math.max(0.8, 0.13 * k.s), C.penBlue);
        if (k.fine) k.segs([[[b0 + 0.3, n + 0.02, (c0 + c1) / 2 + 0.25], [b1 - 0.4, n + 0.02, (c0 + c1) / 2 + 0.25]], [[b0 + 0.3, n + 0.02, (c0 + c1) / 2 - 0.25], [b0 + (b1 - b0) * 0.55, n + 0.02, (c0 + c1) / 2 - 0.25]]], withAlpha('#4a5a7a', 0.6), 0.08 * k.s);
      }
      for (const [a, b, c] of ARROWS) arrow(k, a, b, c, 1);
      // a sticky note or two
      k.poly(quad(9.3, 14.6, 10.4, 15.7, n + 0.02), C.noteYellow, k.thin * 0.8);
      k.poly(quad(1.6, 6.1, 2.6, 7.1, n + 0.02), C.notePink, k.thin * 0.8);
      // the tray, the markers, the eraser
      k.box(u0 + 0.5, n, z0 - 0.5, u1 - u0 - 1, 0.55, 0.25, C.chrome, { line: k.thin });
      k.rod([[2.6, n + 0.3, z0 - 0.13], [3.9, n + 0.3, z0 - 0.13]], C.penRed, 0.15);
      k.rod([[4.3, n + 0.3, z0 - 0.13], [5.6, n + 0.3, z0 - 0.13]], C.penBlue, 0.15);
      k.box(7.6, n + 0.08, z0 - 0.25, 1.3, 0.4, 0.45, '#3a3c42', { line: k.thin });
      // the stool in front
      stool(k, 8.4, 5.8, 4.6, C.noteLilac, 0.85);
    });
    // the new arrows: each drawn in turn while worked, all there idle
    const tc = v.active ? v.t % WB_CYCLE : WB_CYCLE;
    NEW.forEach(([a, b, c], i) => arrow(k, a, b, c, Math.max(0, Math.min(1, (tc - i * ARROW_T) / ARROW_T))));
    if (v.active && tc < NEW.length * ARROW_T) {
      // the pen's tip where it draws
      const i = Math.floor(tc / ARROW_T);
      const [a, b] = NEW[i];
      const A = BOXES[a];
      const B = BOXES[b];
      const p = (tc - i * ARROW_T) / ARROW_T;
      const u = (A[0] + A[2]) / 2 + ((B[0] + B[2]) / 2 - (A[0] + A[2]) / 2) * p;
      const z = (A[1] + A[3]) / 2 + ((B[1] + B[3]) / 2 - (A[1] + A[3]) / 2) * p;
      k.halo(u, n + 0.1, z, 0.6, '#ffffff', 0.5);
    }
  },
};

// ── idle: the kitchen island ────────────────────────────────────────────────
// A birch counter on white cabinets, an L: along the front the counter the
// stools pull up to, a jar of biscotti, a vase of sunflowers and a bowl of
// fruit on it; at the back on the right the espresso machine (a pressure
// gauge, two portafilters, cups stacked on top) and the grinder; between
// them, behind the front counter, the aisle where the office manager
// works (see npcs.ts). It is drawn once; its steam is particles, puffed
// off the machine all the time, worked or not: the machine never sleeps.

const TOP = 5.7; // the counter's underside
const COUNTER = TOP + 0.5;
// The front counter's back edge, the back block's -u end, and where the
// office manager stands in the aisle behind the counter.
export const ISLAND = { z: COUNTER, edge: 3.6, block: 9.0, at: 5.9, stand: 1.9 };
const ESP = { u0: 9.6, u1: 13.4, v0: 0.9, v1: 3.2, z1: COUNTER + 2.9 };

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 13,
  draw(v: PropView): void {
    const k = kitOf(v);
    const { edge, block } = ISLAND;
    k.shadow(7.5, 5.2, 7.6, 5.4, 0.28);
    // the back block under the machine: a dark kick, white doors
    k.box(block + 0.2, 1.0, 0, 13.8 - block, edge - 0.8, 0.45, C.base, { line: k.thin, stripe: false });
    k.box(block, 0.8, 0.45, 14.2 - block, edge - 0.6, TOP - 0.45, C.white, { stripe: false });
    // the front cabinets: a dark kick, white doors, a handle each
    k.box(1.0, edge + 0.2, 0, 13.0, 6.6 - edge, 0.45, C.base, { line: k.thin, stripe: false });
    k.box(0.8, edge, 0.45, 13.4, 7.0 - edge, TOP - 0.45, C.white, { stripe: false });
    const doors: Array<[P3, P3]> = [];
    const pulls: Array<[P3, P3]> = [];
    for (let i = 1; i < 6; i++) doors.push([[0.8 + (13.4 * i) / 6, 7.01, 0.6], [0.8 + (13.4 * i) / 6, 7.01, TOP - 0.2]]);
    for (let i = 0; i < 6; i++) {
      const u = 0.8 + (13.4 * (i + 0.5)) / 6 + (i & 1 ? -0.6 : 0.6);
      pulls.push([[u, 7.05, TOP - 1.6], [u, 7.05, TOP - 0.8]]);
    }
    k.segs(doors, withAlpha(INK, 0.45), Math.max(0.7, 0.09 * k.s));
    k.segs(pulls, INK, Math.max(1.4, 0.28 * k.s));
    k.segs(pulls, C.steelLight, Math.max(0.8, 0.16 * k.s));
    // the counter: the back block's top, then the front's, overhanging the
    // front for knees
    k.box(block - 0.2, 0.5, TOP, 14.6 - block + 0.2, edge - 0.5, 0.5, C.birch);
    k.box(0.4, edge, TOP, 14.2, 8.8 - edge, 0.5, C.birch);
    if (k.fine) k.segs([[[0.6, 6.2, COUNTER + 0.01], [14.4, 6.2, COUNTER + 0.01]]], withAlpha(C.birchDark, 0.5), 0.07 * k.s);
    espresso(k);
    // the grinder by it: a black base, a clear hopper of beans
    k.box(13.75, 1.2, COUNTER, 1.1, 1.2, 1.9, '#2c2e33', { line: k.thin, round: 0.15 });
    k.box(13.95, 2.4, COUNTER + 0.6, 0.7, 0.25, 0.2, C.steelLight, { line: k.thin * 0.7 });
    frustum(k, 14.3, 1.8, COUNTER + 1.9, 0.4, COUNTER + 2.45, 0.55, '#5a3a26', null);
    frustum(k, 14.3, 1.8, COUNTER + 2.45, 0.55, COUNTER + 3.35, 0.66, '#c9dde6', '#e6f0f4');
    k.disc(14.3, 1.8, COUNTER + 3.37, 0.63, '#2c2e33', k.thin);
    // a jar of biscotti and the sunflowers in a glass vase, on the left
    k.cyl(1.6, 4.7, COUNTER, 0.55, 1.4, '#dce9ee', { line: k.thin });
    k.cyl(1.6, 4.7, COUNTER + 0.1, 0.45, 0.9, '#d9a35a', { line: 0 });
    k.cyl(1.6, 4.7, COUNTER + 1.4, 0.6, 0.25, C.birchDark, { line: k.thin });
    sunflowers(k, 1.8, 6.6, COUNTER);
    // the fruit bowl, a milk jug and a couple of cups along the front
    frustum(k, 12.4, 6.9, COUNTER, 0.6, COUNTER + 0.55, 1.0, C.white, '#e8e2d6');
    for (const [du, dv, dz, c] of [[-0.35, -0.2, 0.55, '#ff9f43'], [0.3, -0.25, 0.55, '#ff9f43'], [0, 0.25, 0.55, '#8bc34a'], [0.05, -0.05, 0.95, '#e53935']] as const) {
      const [x, y] = k.p(12.4 + du, 6.9 + dv, COUNTER + dz);
      k.pen.beginPath();
      k.pen.arc(x, y, 0.38 * k.s, 0, Math.PI * 2);
      k.paint(c, k.thin);
    }
    k.cyl(11.6, 4.9, COUNTER, 0.32, 0.8, C.chrome, { line: k.thin });
    mug(k, 8.6, 7.6, COUNTER, C.white, 0.3);
    mug(k, 4.4, 7.9, COUNTER, C.noteTeal, 0.3);
    // the stools along the front
    for (const [u, c] of [[2.6, C.noteTeal], [7.5, C.fabricC], [12.4, C.fabricA]] as const) stool(k, u, 9.9, COUNTER - 1.8, c, 0.9);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const t = v.t;
    const n = due(t, dt, 3.2, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(11.5, 2.0, ESP.z1 + 0.2, Math.floor(t * 30), i, [244, 240, 232], 0.5));
    if (due(t, dt, 0.8, v.seed + 1)) spawn(wisp(4.4, 7.9, COUNTER + 0.7, Math.floor(t * 10), 7, [244, 240, 232], 0.2));
  },
};

// The espresso machine: a chrome box, a pressure gauge with its needle,
// two group heads with their portafilters out front, a drip tray, a steam
// wand and cups warming on top. No maker's name.
function espresso(k: Kit): void {
  const { u0, u1, v0, v1, z1 } = ESP;
  const z0 = COUNTER;
  k.box(u0, v0, z0, u1 - u0, v1 - v0, z1 - z0, C.espresso, { round: 0.15 });
  k.box(u0 + 0.1, v0 + 0.1, z1 - 0.35, u1 - u0 - 0.2, v1 - v0 - 0.2, 0.35, C.espressoDark, { line: k.thin });
  // the drip tray
  k.box(u0 + 0.3, v1, z0, u1 - u0 - 0.6, 0.7, 0.3, C.espressoDark, { line: k.thin });
  if (k.fine) k.segs([[[u0 + 0.6, v1 + 0.35, z0 + 0.31], [u1 - 0.6, v1 + 0.35, z0 + 0.31]]], withAlpha(INK, 0.4), 0.08 * k.s);
  // the gauge
  const n = v1 + 0.01;
  k.face(u0 + 2.0, n, z0 + 2.2, 0.48, C.chrome, k.thin, 20);
  k.face(u0 + 2.0, n + 0.01, z0 + 2.2, 0.36, C.white, 0, 20);
  k.line([[u0 + 2.0, n + 0.02, z0 + 2.2], [u0 + 2.25, n + 0.02, z0 + 2.4]], C.penRed, Math.max(0.6, 0.07 * k.s));
  // the group heads and portafilters
  for (const u of [u0 + 0.9, u1 - 0.9]) {
    k.cyl(u, v1 + 0.35, z0 + 1.2, 0.38, 0.35, C.chrome, { line: k.thin });
    k.rod([[u, v1 + 0.35, z0 + 1.25], [u, v1 + 1.5, z0 + 1.35]], '#26272c', 0.22);
    k.cyl(u, v1 + 0.35, z0 + 0.32, 0.22, 0.5, C.white, { line: k.thin });
  }
  // the steam wand
  k.rod([[u1 - 0.05, v1 - 0.4, z1 - 0.6], [u1 + 0.25, v1 - 0.2, z0 + 0.9]], C.chrome, 0.1);
  // cups warming on top
  for (const [du, dv] of [[0.8, 0.9], [1.6, 0.8], [2.4, 0.95], [1.2, 1.75]] as const) k.cyl(u0 + du, v0 + dv, z1, 0.3, 0.45, C.white, { line: k.thin * 0.8 });
}

// Three sunflowers in a glass vase standing at (u, v, z).
function sunflowers(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.45, 1.4, '#cfe3ea', { line: k.thin });
  for (const [du, dz, lean] of [[-0.5, 3.2, -0.35], [0.15, 3.6, 0.05], [0.6, 2.9, 0.4]] as const) {
    const top: P3 = [u + du, v, z + dz];
    k.line([[u, v, z + 1.2], top], '#4f9a52', Math.max(0.8, 0.12 * k.s));
    const [x, y] = k.p(...top);
    const r = 0.5 * k.s;
    k.pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + lean;
      k.pen.moveTo(x + Math.cos(a) * r * 1.6, y + Math.sin(a) * r * 1.6);
      k.pen.ellipse(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.62, r * 0.3, a, 0, Math.PI * 2);
    }
    k.paint(C.noteYellow, k.thin * 0.7);
    k.pen.beginPath();
    k.pen.arc(x, y, r * 0.6, 0, Math.PI * 2);
    k.paint('#6a4422', k.thin * 0.7);
  }
}

// ── entrance: the glass door ────────────────────────────────────────────────
// A glass door in a black steel frame with a long bar handle, a glass side
// panel over a kick plate on its hinge side and a transom; through the
// glass the landing outside, lit. A doormat. On the brick past the door's
// latch side, clear of its opening and its swing, the front desk with the
// receptionist behind it (see npcs.ts): a white desk on a birch top, the
// startup's own plain mark on its front (a teal rounded square with a
// sunflower dot at its top right corner), a keyboard, a tray of visitor
// badges, a bell and a little pot of succulents on it. The door swings open
// while someone passes; the desk, nearer, is drawn over its leaf.

const DOOR = { u0: 3.0, u1: 8.6, h: 16 };
const GLASS = { top: 19.4, kick: 2.6 };
// The frame's ends: from its first jamb to the latch side's.
const FRAME = { u0: 0.3, u1: DOOR.u1 + 0.35 };
// The front desk: from u0 to u1, its back edge at v0 and front at v1, its
// top `z` high; where the receptionist stands behind it (`at`, `stand`):
// close behind its back edge, which runs past her on both sides on screen.
export const FRONT_DESK = { u0: 9.15, u1: 14.85, v0: 1.3, v1: 2.9, z: 5.4, at: 11.8, stand: 0.95 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 21, (k) => {
      const out = -1.2;
      const pen = k.pen;
      const f0 = FRAME.u0;
      const f1 = FRAME.u1;
      // the landing beyond the glass
      pen.save();
      pen.beginPath();
      k.trace(quad(f0 + 0.2, 0, f1 - 0.2, GLASS.top, 0));
      pen.clip();
      k.poly(quad(f0 - 0.3, -0.5, f1 + 0.3, 21, out), k.vgrad(7, out, 0, 21, [[0, '#cbb9a2'], [0.6, '#e2d4bf'], [1, '#b8a68f']]), 0);
      k.poly([[f0 - 0.3, out, 0], [f1 + 0.3, out, 0], [f1 + 0.3, 0, 0], [f0 - 0.3, 0, 0]], '#8a7c6c', 0);
      k.halo((u0 + u1) / 2, out, 17, 5, '#fff1c6', 0.45);
      // a plant out there, in silhouette, by the side panel
      k.poly([[1.0, out, 0], [2.4, out, 0], [2.2, out, 2.2], [1.2, out, 2.2]], '#9a8a78', 0);
      k.pen.beginPath();
      const [px, py] = k.p(1.7, out, 4.2);
      pen.ellipse(px, py, 1.3 * k.s, 2.0 * k.s, 0, 0, Math.PI * 2);
      pen.fillStyle = '#7f9a76';
      pen.fill();
      pen.restore();
      // the frame: jambs, the transom bar, the head; the side panel's kick
      // plate
      const F = C.frame;
      for (const [a, b] of [[f0, f0 + 0.5], [u0 - 0.35, u0], [u1, f1]] as const) k.box(a, 0, 0, b - a, 0.6, GLASS.top, F, { line: k.thin });
      k.box(f0, 0, h, f1 - f0, 0.6, 0.45, F, { line: k.thin });
      k.box(f0 - 0.2, 0, GLASS.top, f1 - f0 + 0.4, 0.8, 0.9, F, { line: k.lw });
      const [a, b] = [f0 + 0.5, u0 - 0.35];
      k.poly(quad(a, 0, b, GLASS.kick, 0.3), k.side('#3a3c42', 0, 1, 0.1), k.thin);
      k.box(a, 0, GLASS.kick, b - a, 0.5, 0.3, F, { line: k.thin });
      // the glass's tint and a streak of reflection on the side panel; the
      // transom's tint
      for (const [a, b, z0, z1] of [[f0 + 0.5, u0 - 0.35, GLASS.kick + 0.3, h], [f0 + 0.5, u1, h + 0.45, GLASS.top]] as const) {
        k.poly(quad(a, z0, b, z1, 0.3), withAlpha(C.glass, 0.28), 0);
        if (z1 - z0 > 4) k.poly([[a + 0.4, 0.31, z1 - 0.5], [a + 1.0, 0.31, z1 - 0.5], [a + 0.6, 0.31, z1 - 4.5], [a + 0.25, 0.31, z1 - 4.5]], withAlpha('#ffffff', 0.22), 0);
      }
      // the threshold and the doormat
      k.poly([[u0, 0, 0.03], [u1, 0, 0.03], [u1, 0.6, 0.03], [u0, 0.6, 0.03]], C.steel, k.thin);
      k.poly([[u0 + 0.2, 0.9, 0.04], [u1 - 0.2, 0.9, 0.04], [u1 - 0.2, 3.6, 0.04], [u0 + 0.2, 3.6, 0.04]], '#34363e', k.thin, 0.2);
      k.poly([[u0 + 0.7, 1.3, 0.05], [u1 - 0.7, 1.3, 0.05], [u1 - 0.7, 3.2, 0.05], [u0 + 0.7, 3.2, 0.05]], '#44474f', 0);
    });
    // the door: shut, or swung in while someone passes
    const th = v.active ? 0.62 + 0.05 * Math.sin(v.t * 2.2) : 0;
    doorLeaf(k, th, h);
    // the front desk, nearer than the leaf wherever the two meet on screen
    still(v, 'entrance-desk', 8, frontDesk);
  },
};

// The front desk past the door's latch side: a white body on a dark kick,
// a birch top, the mark on its front, and on the top only low things (the
// receptionist stands behind it: see npcs.ts).
function frontDesk(k: Kit): void {
  const { u0, u1, v0, v1, z } = FRONT_DESK;
  k.shadow((u0 + u1) / 2, (v0 + v1) / 2 + 0.3, (u1 - u0) / 2 + 0.3, 1.3, 0.24);
  k.box(u0 + 0.25, v0 + 0.15, 0, u1 - u0 - 0.5, v1 - v0 - 0.3, 0.4, C.base, { line: k.thin, stripe: false });
  k.box(u0 + 0.15, v0 + 0.05, 0.4, u1 - u0 - 0.3, v1 - v0 - 0.1, z - 0.75, C.white, { stripe: false });
  // a teal stripe along the front, the mark over it
  k.poly(quad(u0 + 0.15, 1.3, u1 - 0.15, 1.75, v1 - 0.04), C.chart, 0);
  const mu = (u0 + u1) / 2 - 0.65;
  k.poly(quad(mu, 2.4, mu + 1.3, 3.7, v1 - 0.03), C.chart, k.thin, 0.35);
  k.face(mu + 1.3, v1 - 0.02, 3.7, 0.36, C.chartWarm, k.thin, 16);
  // the birch top, a little proud of the body
  k.box(u0, v0, z - 0.35, u1 - u0, v1 - v0, 0.35, C.birch, { line: k.lw });
  // on it: a keyboard, a tray of badges, a bell, a pot of succulents
  k.box(u0 + 1.4, v0 + 0.35, z, 2.1, 0.75, 0.1, '#e8e6e0', { line: k.thin });
  if (k.fine) {
    const keys: Array<[P3, P3]> = [];
    for (const w of [v0 + 0.55, v0 + 0.85]) keys.push([[u0 + 1.55, w, z + 0.11], [u0 + 3.35, w, z + 0.11]]);
    k.segs(keys, withAlpha(INK, 0.35), 0.05 * k.s);
  }
  k.box(u0 + 3.8, v0 + 0.5, z, 1.0, 0.85, 0.18, '#d8dadf', { line: k.thin });
  for (const [i, c] of [C.noteTeal, C.chartWarm].entries()) k.box(u0 + 3.95 + i * 0.4, v0 + 0.6, z + 0.18, 0.3, 0.5, 0.05, c, { line: k.thin * 0.7, stripe: false });
  k.cyl(u0 + 0.55, v1 - 0.45, z, 0.32, 0.12, C.steel, { line: k.thin });
  k.disc(u0 + 0.55, v1 - 0.45, z + 0.24, 0.24, C.chrome, k.thin);
  succulent(k, u0 + 0.6, v0 + 0.55, z, 0.38);
}

// The glass door leaf on its hinge at u0, opened by th radians into the
// room: a slim black frame round the glass, a long bar handle.
function doorLeaf(k: Kit, th: number, h: number): void {
  const { u0, u1 } = DOOR;
  const w = u1 - u0 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, 0.3 + dv * s + du * n, z];
  const fw = 0.45;
  if (th > 0.05) k.poly([P(w, 0), P(w, 0, -0.3), P(w, h, -0.3), P(w, h)], k.side(C.frame, du, dv, 0.16), k.thin);
  // the glass, then the frame round it
  k.poly([P(fw, fw), P(w - fw, fw), P(w - fw, h - fw), P(fw, h - fw)], withAlpha(C.glass, 0.3), 0);
  if (th < 0.05) k.poly([P(fw + 0.4, h - fw - 0.5), P(fw + 1.1, h - fw - 0.5), P(fw + 0.7, h - fw - 4.5), P(fw + 0.3, h - fw - 4.5)], withAlpha('#ffffff', 0.22), 0);
  const face = k.side(C.frame, -dv, du, 0.16);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h), P(0, 0), P(fw, fw), P(fw, h - fw), P(w - fw, h - fw), P(w - fw, fw), P(fw, fw)], face, 0);
  k.pen.beginPath();
  k.trace([P(0, 0), P(w, 0), P(w, h), P(0, h)]);
  k.paint(null, k.lw);
  k.pen.beginPath();
  k.trace([P(fw, fw), P(w - fw, fw), P(w - fw, h - fw), P(fw, h - fw)]);
  k.paint(null, k.thin);
  // the bar handle, standing off the glass
  k.rod([P(w - 0.9, 5.0, 0.35), P(w - 0.9, 12.0, 0.35)], C.chrome, 0.2);
  for (const z of [5.3, 11.7]) k.rod([P(w - 0.9, z, 0.05), P(w - 0.9, z, 0.35)], C.chrome, 0.12);
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
