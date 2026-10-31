import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { bookRow, chair, crate, dusk, fillPts, flames, hull, logU, logV, ring, rock, sack, sprout, wheel } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, due, hash, kitOf, still, withAlpha } from './kit.ts';

// The colony's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame; they move
// only while worked, except the campfire, which always burns.

type Spawn = (p: Particle) => void;
type RGB3 = readonly [number, number, number];

// A hot bit flung off (u, v, z): sparks off the anvil, embers off a fire.
function fling(kind: 'spark' | 'ember', u: number, v: number, z: number, n: number, k: number, color: RGB3, spread = 1, up = 3, gravity = 9): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  return { kind, x: u + j(1) * 0.3, y: v + j(2) * 0.3, z, vx: j(3) * 4 * spread, vy: (0.3 + j(4)) * 3 * spread, vz: up + j(5) * up, life: 0.5 + hash(n, k, 6) * 0.5, color, glow: true, gravity };
}

// A puff rising off (u, v, z): steam or smoke.
function puff(kind: 'steam' | 'smoke', u: number, v: number, z: number, n: number, k: number, color: RGB3 = kind === 'steam' ? [240, 236, 228] : [120, 110, 100]): Particle {
  const j = (i: number) => hash(n, k, i) - 0.5;
  return { kind, x: u + j(1) * 0.4, y: v + j(2) * 0.4, z, vx: j(3) * 0.5, vy: j(4) * 0.5, vz: (kind === 'steam' ? 2.4 : 1.8) + j(5), life: 1.6 + j(6), color, glow: false, gravity: 0 };
}

// ── write: the tailoring bench ──────────────────────────────────────────────
// An L of plank benches: along the front a cutting table, bolts of cloth
// folded on its left end, a length of cloth chalked with a pattern laid
// flat with open scissors on it, a tray of spools on its right; on the
// bench's back leg, on the right, the sewing machine, its needle end
// toward the room behind the table where the tailor stands to sew (see
// npcs.ts). Sewing bobs the needle and feeds the cloth on; the tailor's
// hands guide it.

// The bench's top (`z`), the cutting table's back and front edges (`v0`,
// `v1`), the machine's leg's -u end (`u0`) and where the tailor stands
// behind the table (`at`, `stand`).
export const BENCH = { z: 5.0, v0: 2.4, v1: 6.6, u0: 6.0, at: 3.6, stand: 1.3 };
const ZT = BENCH.z;
const NEEDLE = { u: 7.0, v: 1.4 };

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 9,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 9, (k) => {
      const { v0, v1, u0 } = BENCH;
      k.shadow(5.5, 3.6, 6.0, 3.6, 0.3);
      // the machine's leg of the L, against the wall
      for (const [u, w] of [[u0 + 0.3, 0.6], [9.9, 0.6]] as const) k.box(u, w, 0, 0.5, 0.5, ZT - 0.5, C.plankDark, { line: k.thin });
      k.box(u0, 0.3, ZT - 0.5, 10.7 - u0, v0 - 0.3, 0.5, C.plank);
      // the cutting table: a basket of scraps under it, legs, a stretcher,
      // three wide planks
      k.box(2.2, 4.0, 0, 2.4, 2.2, 1.4, '#c8a060', { round: 0.3 });
      for (const [i, c] of [C.cloth, C.clothBlue, '#e8c040'].entries()) k.disc(2.9 + i * 0.6, 5.0 + (i & 1) * 0.4, 1.42, 0.38, c, k.thin * 0.8);
      for (const [u, w] of [[0.6, v0 + 0.3], [9.9, v0 + 0.3], [0.6, v1 - 0.8], [9.9, v1 - 0.8]] as const) k.box(u, w, 0, 0.5, 0.5, ZT - 0.5, C.plankDark, { line: k.thin });
      k.box(0.6, v1 - 0.75, 1.0, 9.8, 0.4, 0.4, C.plankDark, { line: k.thin, stripe: false });
      k.box(0.3, v0, ZT - 0.5, 10.4, v1 - v0, 0.5, C.plank);
      k.segs([[[0.35, v0 + 1.4, ZT + 0.01], [10.65, v0 + 1.4, ZT + 0.01]], [[0.35, v0 + 2.8, ZT + 0.01], [10.65, v0 + 2.8, ZT + 0.01]], [[u0, 0.35, ZT + 0.01], [u0, v0, ZT + 0.01]]], withAlpha(INK, 0.45), Math.max(0.6, 0.08 * k.s));
      // the machine: bed plate, a length of cloth over it hanging off the
      // -u end, the pillar and arm, the head over the needle, the hand
      // wheel at the far end
      const M = '#2f3a34';
      k.box(6.2, 0.35, ZT, 4.0, 1.95, 0.35, M, { round: 0.1 });
      k.poly([[5.5, 0.75, ZT + 0.37], [8.3, 0.75, ZT + 0.37], [8.3, 2.15, ZT + 0.37], [5.5, 2.15, ZT + 0.37]], '#c9d8e8', k.thin);
      k.poly([[5.5, 0.75, ZT + 0.37], [5.5, 2.15, ZT + 0.37], [5.75, 2.25, ZT - 0.6], [5.75, 0.85, ZT - 0.6]], k.side('#c9d8e8', -1, 0, 0.12), k.thin);
      k.box(9.1, 0.65, ZT + 0.35, 0.95, 1.3, 2.4, M, { round: 0.3 });
      k.box(6.5, 0.7, ZT + 2.2, 3.5, 1.2, 0.85, M, { round: 0.35 });
      k.box(6.45, 0.7, ZT + 1.0, 1.05, 1.3, 1.9, M, { round: 0.25 });
      k.line([[6.7, 1.91, ZT + 2.62], [9.8, 1.91, ZT + 2.62]], '#c9a450', Math.max(0.7, 0.09 * k.s));
      k.rod([[8.5, 1.3, ZT + 3.05], [8.5, 1.3, ZT + 3.5]], C.steel, 0.07);
      k.cyl(8.5, 1.3, ZT + 3.05, 0.28, 0.5, C.cloth, { line: k.thin });
      wheel(k, [10.1, 1.3, ZT + 2.2], [1, 0, 0], 0.8, 4, 0.5, '#b8b8b0', '#8a8a82', 0.25);
      k.box(6.8, 1.15, ZT + 0.4, 0.4, 0.5, 0.2, C.steel, { line: k.thin });
      // on the cutting table: bolts of cloth folded on the left end
      const bolts: Color[] = [C.canvas, C.clothBlue, C.cloth];
      bolts.forEach((c, i) => {
        k.box(0.6 + i * 0.1, v0 + 1.0 + i * 0.08, ZT + i * 0.55, 2.6 - i * 0.2, 1.9 - i * 0.16, 0.55, c, { line: k.thin, round: 0.15 });
        if (k.fine) k.line([[0.8 + i * 0.1, v0 + 2.82 - i * 0.08, ZT + i * 0.55 + 0.28], [3.0 - i * 0.1, v0 + 2.82 - i * 0.08, ZT + i * 0.55 + 0.28]], shade(c, -0.22), 0.06 * k.s);
      });
      // a length of cloth chalked with a pattern, a paper piece on it
      k.poly([[3.7, v0 + 0.9, ZT + 0.02], [8.5, v0 + 0.8, ZT + 0.02], [8.6, v1 - 0.4, ZT + 0.02], [3.8, v1 - 0.3, ZT + 0.02]], '#e8d0c0', k.thin);
      k.line([[4.2, v0 + 1.3, ZT + 0.03], [5.5, v0 + 1.2, ZT + 0.03], [5.9, v0 + 1.8, ZT + 0.03], [7.0, v0 + 1.7, ZT + 0.03], [7.3, v0 + 2.9, ZT + 0.03], [4.4, v0 + 3.0, ZT + 0.03], [4.2, v0 + 1.3, ZT + 0.03]], '#f8f8f0', Math.max(0.7, 0.09 * k.s));
      k.poly([[6.6, v0 + 1.1, ZT + 0.04], [8.1, v0 + 1.1, ZT + 0.04], [8.2, v0 + 2.1, ZT + 0.04], [6.9, v0 + 2.2, ZT + 0.04]], C.paper, k.thin * 0.8);
      // the scissors lying open on the cloth
      const so: P3 = [5.0, v1 - 0.9, ZT + 0.06];
      const sc = (a: number) => k.rod([so, [so[0] + Math.cos(a) * 1.4, so[1] + Math.sin(a) * 1.4, so[2]]], C.steel, 0.12);
      sc(-0.25);
      sc(-0.7);
      for (const a of [2.6, 2.2]) {
        const [x, y] = k.p(so[0] + Math.cos(a) * 0.45, so[1] + Math.sin(a) * 0.45, so[2] + 0.01);
        k.pen.beginPath();
        k.pen.ellipse(x, y, 0.3 * k.s, 0.18 * k.s, 0, 0, Math.PI * 2);
        k.pen.strokeStyle = C.cloth;
        k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
        k.pen.stroke();
      }
      // a tray of spools on the right
      k.box(8.8, v0 + 0.5, ZT, 1.7, 1.0, 0.3, C.plankLight, { line: k.thin });
      const threads: Color[] = [C.cloth, C.clothBlue, '#e8c040', C.green, '#7a4a6a'];
      for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) k.cyl(9.2 + j * 0.8, v0 + 0.75 + i * 0.5, ZT + 0.3, 0.22, 0.5, threads[(i * 2 + j + v.seed) % threads.length], { line: k.thin });
    });
    // the cloth's stripes, fed on under the needle while sewing; the needle
    // bobbing
    const feed = v.active ? (v.t % 1) * 0.6 : 0;
    const seam: Array<[P3, P3]> = [];
    for (let u = 5.35 + feed; u < 8.25; u += 0.6) seam.push([[Math.max(5.55, u), 1.45, ZT + 0.38], [Math.min(8.25, u + 0.3), 1.45, ZT + 0.38]]);
    k.segs(seam, C.cloth, Math.max(0.8, 0.14 * k.s));
    const stripes: Array<[P3, P3]> = [];
    for (let u = 5.6 + feed * 1.5; u < 8.2; u += 0.9) stripes.push([[u, 0.8, ZT + 0.38], [u, 2.1, ZT + 0.38]]);
    k.segs(stripes, '#7aa0c8', Math.max(0.7, 0.12 * k.s));
    const bob = v.active ? 0.35 + 0.35 * Math.sin(v.t * Math.PI * 6) : 0.7;
    k.rod([[NEEDLE.u, NEEDLE.v, ZT + 1.2], [NEEDLE.u, NEEDLE.v, ZT + 0.4 + bob]], C.steel, 0.1);
    k.box(NEEDLE.u - 0.25, NEEDLE.v - 0.25, ZT + 0.95 + bob * 0.3, 0.5, 0.45, 0.35, C.steel, { line: k.thin });
  },
};

// ── read: the research bench ────────────────────────────────────────────────
// A pale lab bench on steel legs, a cabinet of drawers at one end: books
// standing between bookends, an open notebook laid flat, a microscope, a
// rack of test tubes and a round flask over a little burner. Studying
// lights the microscope's lamp and sets the flask bubbling.

const BZ = 5.5; // the bench top
const FLASK = { u: 12.2, v: 2.0, z: BZ + 2.3, r: 0.85 };
const LAB = '#dfe3e0';

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 11,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 11, (k) => {
      k.shadow(7, 2.2, 7.4, 2.4, 0.3);
      // the legs, a crate under the left end, the drawers on the right
      for (const w of [0.5, 3.1]) k.box(0.6, w, 0, 0.4, 0.4, BZ - 0.45, C.steelDark, { line: k.thin });
      crate(k, 1.4, 0.6, 0, 3.0, 2.6, 2.5, C.plankLight);
      k.box(9.0, 0.4, 0, 4.6, 3.2, BZ - 0.45, '#e8ece8', { stripe: false });
      for (const [z0, z1] of [[0.4, 2.4], [2.7, 4.7]] as const) {
        k.poly([[9.3, 3.61, z0], [13.3, 3.61, z0], [13.3, 3.61, z1], [9.3, 3.61, z1]], k.side('#d6dcd8', 0, 1), k.thin);
        k.rod([[10.9, 3.72, (z0 + z1) / 2], [11.7, 3.72, (z0 + z1) / 2]], C.steelDark, 0.12);
      }
      k.box(0.3, 0.2, BZ - 0.45, 13.4, 3.6, 0.45, LAB);
      k.line([[0.35, 3.82, BZ - 0.08], [13.65, 3.82, BZ - 0.08]], '#9aa3ab', Math.max(0.8, 0.14 * k.s));
      // books between bookends at the back
      for (const u of [0.7, 3.95]) k.box(u, 0.5, BZ, 0.2, 1.0, 1.6, C.steelDark, { line: k.thin });
      bookRow(k, 0.95, 3.9, 1.35, BZ, 2.3, v.seed);
      // an open notebook laid flat, lines of notes on both pages (no words)
      const nb: P3[] = [[0.9, 2.0, BZ + 0.02], [3.7, 2.0, BZ + 0.02], [3.7, 3.6, BZ + 0.02], [0.9, 3.6, BZ + 0.02]];
      k.poly(nb, '#a8443a', k.thin);
      k.poly([[1.0, 2.1, BZ + 0.08], [2.28, 2.05, BZ + 0.1], [2.28, 3.5, BZ + 0.1], [1.0, 3.5, BZ + 0.08]], C.paper, k.thin * 0.8);
      k.poly([[2.32, 2.05, BZ + 0.1], [3.6, 2.1, BZ + 0.08], [3.6, 3.5, BZ + 0.08], [2.32, 3.5, BZ + 0.1]], C.paper, k.thin * 0.8);
      const notes: Array<[P3, P3]> = [];
      for (let i = 0; i < 4; i++) {
        for (const u0 of [1.15, 2.47]) notes.push([[u0, 2.4 + i * 0.28, BZ + 0.11], [u0 + 0.5 + hash(v.seed, i, u0 * 10) * 0.55, 2.4 + i * 0.28, BZ + 0.11]]);
      }
      k.segs(notes, '#7a8aa0', Math.max(0.6, 0.07 * k.s));
      k.rod([[3.2, 3.75, BZ + 0.1], [4.1, 3.0, BZ + 0.1]], '#c9a450', 0.08);
      // the microscope: a foot, a curved arm, the stage and the tube
      k.box(4.6, 1.0, BZ, 1.8, 1.6, 0.35, C.iron, { round: 0.12 });
      k.rod([[5.9, 1.4, BZ + 0.35], [6.1, 1.4, BZ + 2.2], [5.8, 1.5, BZ + 3.6]], C.iron, 0.36);
      k.box(4.7, 1.3, BZ + 1.6, 1.4, 1.3, 0.22, '#3a3a42', { line: k.thin });
      k.rod([[5.3, 1.9, BZ + 2.0], [5.45, 1.8, BZ + 4.4]], '#e0e2e4', 0.42);
      k.rod([[5.45, 1.8, BZ + 4.3], [5.5, 1.78, BZ + 4.9]], C.iron, 0.3);
      k.cyl(5.5, 1.78, BZ + 4.85, 0.24, 0.22, C.iron, { line: k.thin });
      // slides laid by it, a tall flask of green, a rack of test tubes
      for (let i = 0; i < 3; i++) k.poly([[6.9 + i * 0.5, 2.6, BZ + 0.02], [7.25 + i * 0.5, 2.6, BZ + 0.02], [7.25 + i * 0.5, 3.6, BZ + 0.02], [6.9 + i * 0.5, 3.6, BZ + 0.02]], '#e8f4f8', k.thin * 0.7);
      const e0 = k.ell(9.6, 1.4, BZ, 0.75);
      const top = k.p(9.6, 1.4, BZ + 2.0);
      const pts: Array<[number, number]> = [[e0.cx - e0.rx, e0.cy], [top[0] - 0.22 * k.s, top[1] + 0.6 * k.s], [top[0] - 0.22 * k.s, top[1]], [top[0] + 0.22 * k.s, top[1]], [top[0] + 0.22 * k.s, top[1] + 0.6 * k.s], [e0.cx + e0.rx, e0.cy]];
      fillPts(k, pts, '#d8ece6aa', k.thin);
      fillPts(k, [[e0.cx - e0.rx * 0.92, e0.cy - 0.05 * k.s], [e0.cx - e0.rx * 0.5, e0.cy - 0.75 * k.s], [e0.cx + e0.rx * 0.5, e0.cy - 0.75 * k.s], [e0.cx + e0.rx * 0.92, e0.cy - 0.05 * k.s]], C.green, 0);
      k.box(10.4, 2.4, BZ, 1.0, 0.7, 0.5, C.plank, { line: k.thin });
      for (let i = 0; i < 3; i++) k.rod([[10.6 + i * 0.3, 2.75, BZ + 0.3], [10.6 + i * 0.3, 2.75, BZ + 1.5]], ['#d9a440', '#a8443a', '#7aa0c8'][i], 0.16);
      // the round flask on its ring stand over the burner
      k.disc(FLASK.u, FLASK.v, BZ + 0.02, 0.7, C.iron, k.thin);
      k.rod([[FLASK.u + 0.8, FLASK.v - 0.4, BZ], [FLASK.u + 0.8, FLASK.v - 0.4, BZ + 3.8]], C.iron, 0.1);
      k.cyl(FLASK.u, FLASK.v, BZ, 0.3, 0.9, '#c9a450', { line: k.thin });
      const ring0 = k.ell(FLASK.u, FLASK.v, FLASK.z - 0.6, 0.7);
      k.pen.beginPath();
      k.pen.ellipse(ring0.cx, ring0.cy, ring0.rx, ring0.ry, ring0.rot, 0, Math.PI * 2);
      k.pen.strokeStyle = INK;
      k.pen.lineWidth = Math.max(1, 0.12 * k.s);
      k.pen.stroke();
      flaskBody(k);
    });
    // the microscope's lamp, and the burner and bubbles while studying
    const on = v.active;
    k.disc(5.5, 2.3, BZ + 0.37, 0.32, on ? '#fff4c0' : '#8a8a80', k.thin);
    if (!on) return;
    k.halo(5.5, 2.3, BZ + 1.2, 2.4, '#ffe8a0', 0.5);
    k.halo(5.3, 1.9, BZ + 1.8, 1.2, '#fff8d8', 0.4);
    // the burner's flame
    const [fx, fy] = k.p(FLASK.u, FLASK.v, BZ + 1.15);
    const fh = (0.55 + 0.1 * Math.sin(v.t * 13)) * k.s;
    k.pen.beginPath();
    k.pen.ellipse(fx, fy, 0.18 * k.s, fh, 0, 0, Math.PI * 2);
    k.pen.fillStyle = '#7ab8ff';
    k.pen.fill();
    // bubbles rising in the flask
    const [cx, cy] = k.p(FLASK.u, FLASK.v, FLASK.z);
    const R = FLASK.r * k.s;
    k.pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const ph = (v.t * (0.9 + hash(i, 5) * 0.6) + hash(i, 6)) % 1;
      const x = cx + (hash(i, 7) - 0.5) * R * 1.0;
      const y = cy + R * 0.6 - ph * R * 1.2;
      const r = Math.max(0.8, (0.08 + ph * 0.1) * k.s);
      k.pen.moveTo(x + r, y);
      k.pen.arc(x, y, r, 0, Math.PI * 2);
    }
    k.pen.fillStyle = '#e8ffe0';
    k.pen.fill();
    k.halo(FLASK.u, FLASK.v, FLASK.z, 1.6, '#a8ff90', 0.3);
  },
};

// The round flask: a glass ball half full of green, its neck up.
function flaskBody(k: Kit): void {
  const { u, v, z, r } = FLASK;
  const [cx, cy] = k.p(u, v, z);
  const R = r * k.s;
  const pen = k.pen;
  k.rod([[u, v, z + r * 0.7], [u, v, z + r + 1.1]], '#d8ece6', 0.32);
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  k.paint('#d8ece6cc', k.thin);
  pen.beginPath();
  pen.arc(cx, cy, R * 0.86, 0.15, Math.PI - 0.15);
  pen.closePath();
  pen.fillStyle = '#6cc04a';
  pen.fill();
  pen.beginPath();
  pen.ellipse(cx - R * 0.4, cy - R * 0.35, R * 0.18, R * 0.28, 0.5, 0, Math.PI * 2);
  pen.fillStyle = '#ffffffaa';
  pen.fill();
}

// ── search: the stockpile ───────────────────────────────────────────────────
// The colony's stores laid out neatly against the wall, one pile to a
// square (the shell draws the stockpile's dashed outline round them): a
// bundle of logs, a stack of steel ingots, folded bolts of cloth and a
// heap of sacks.

const CELL = 2.85; // a pile's square along the wall
const PILE = 2.55; // the pile in it

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 2.1, 6.4, 2.3, 0.28);
    const at = (i: number) => 0.35 + i * CELL;
    // logs, their sawn ends to the room, strapped
    const l0 = at(0);
    for (const [du, cz, r] of [[0.45, 0.45, 0.45], [1.28, 0.45, 0.45], [2.1, 0.45, 0.45], [0.86, 1.25, 0.44], [1.69, 1.25, 0.44], [1.28, 2.03, 0.43]] as const) {
      logV(k, 0.4, 3.5, l0 + du, cz, r, hash(v.seed, du * 10, cz * 10) < 0.5 ? C.log : '#6a4a2e');
    }
    k.line([[l0 + 0.05, 2.6, 0.5], [l0 + 0.4, 2.6, 1.6], [l0 + 1.28, 2.6, 2.48], [l0 + 2.15, 2.6, 1.6], [l0 + 2.5, 2.6, 0.5]], '#d8c08a', Math.max(0.8, 0.12 * k.s));
    // steel ingots in crossed layers
    const s0 = at(1);
    let z = 0;
    for (let layer = 0; layer < 4; layer++) {
      for (let i = 0; i < 3; i++) {
        const t = hash(v.seed, layer, i) < 0.5 ? C.ingot : shade(C.ingot, 0.08);
        if (layer % 2 === 0) k.box(s0 + 0.1, 0.5 + i * 0.95, z, PILE - 0.2, 0.8, 0.45, t, { line: k.thin });
        else k.box(s0 + 0.15 + i * 0.8, 0.5, z, 0.7, 2.75, 0.45, t, { line: k.thin });
      }
      z += 0.45;
    }
    // folded bolts of cloth
    const c0 = at(2);
    const cloth: Color[] = [C.clothBlue, C.canvas, C.cloth, '#5f8a4a', C.canvas];
    cloth.forEach((c, i) => {
      const d = (hash(v.seed, i, 7) - 0.5) * 0.2;
      k.box(c0 + 0.1 + d, 0.6, i * 0.5, PILE - 0.2, 2.6, 0.5, c, { line: k.thin, round: 0.14 });
      if (k.fine) k.line([[c0 + 0.3 + d, 3.21, i * 0.5 + 0.25], [c0 + PILE - 0.3 + d, 3.21, i * 0.5 + 0.25]], shade(c, -0.22), 0.06 * k.s);
    });
    // a heap of sacks
    const k0 = at(3);
    sack(k, k0 + 0.8, 1.2, 0, 0.8, 1.9, v.seed);
    sack(k, k0 + 1.85, 1.3, 0, 0.75, 1.8, v.seed + 1);
    sack(k, k0 + 1.25, 2.6, 0, 0.8, 1.9, v.seed + 2);
  },
};

// ── run: the smithy ─────────────────────────────────────────────────────────
// A forge of cut stone with a stone chimney, its mouth glowing orange; a
// pair of leather bellows on a trestle piped into its side; a box of coal
// before the mouth, a water trough on the left, and an anvil on a stump
// toward the open +u side, where the blacksmith stands to work it (see
// npcs.ts: the hammer and tongs are in its hands). Smithing makes the
// mouth white-hot and pulsing and throws sparks off the anvil.

const FORGE = '#9a9286';
const MOUTH = { u0: 2.0, u1: 5.0, z0: 1.0, z1: 3.6, v: 5.6 };
export const ANVIL = { u: 8.1, v: 9.25, z: 3.4 };
const CHIMNEY = 14.5;
const BELLOWS: ReadonlyArray<readonly [number, number]> = [[7.0, 3.0], [7.6, 2.35], [8.8, 1.9], [9.8, 2.1], [10.3, 3.0], [9.8, 3.9], [8.8, 4.1], [7.6, 3.65]];
const BZ0 = 2.3; // the bellows' bottom board

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 16, (k) => {
      k.shadow(5.5, 5.5, 6.2, 6.0, 0.3);
      // the chimney up the back of the forge, its courses and cap
      k.box(2.0, 0.9, 5.4, 3.0, 2.6, CHIMNEY - 5.4, FORGE, { stripe: false });
      courses(k, 2.0, 5.0, 3.5, 5.4, CHIMNEY, 'v');
      courses(k, 0.9, 3.5, 5.0, 5.4, CHIMNEY, 'u');
      k.box(1.8, 0.7, CHIMNEY, 3.4, 3.0, 0.5, '#7a746a', { line: k.lw });
      // the forge: a block of cut stone, a slab on top with the fire pot
      k.box(0.6, 0.6, 0, 6.0, 5.0, 5.0, FORGE, { stripe: false });
      courses(k, 0.6, 6.6, MOUTH.v, 0, 5.0, 'v', [MOUTH.u0 - 0.4, MOUTH.u1 + 0.4, MOUTH.z1 + 0.6]);
      courses(k, 0.6, 5.6, 6.6, 0, 5.0, 'u');
      k.box(0.4, 0.4, 5.0, 6.4, 5.4, 0.5, '#b0a898', { line: k.lw });
      k.disc(3.6, 4.0, 5.52, 1.25, '#3a2a22', k.thin);
      // a lintel stone over the mouth
      k.poly(arch(MOUTH.u0 - 0.5, MOUTH.u1 + 0.5, MOUTH.z0 - 0.2, MOUTH.z1 + 0.6, MOUTH.v + 0.01), k.side('#b8b0a2', 0, 1, 0.12), k.thin);
      // the bellows' trestle and bottom board, the nozzle into the forge
      for (const u of [7.9, 9.6]) {
        k.box(u - 0.25, 2.0, 0, 0.5, 2.0, BZ0 - 0.2, C.plankDark, { line: k.thin });
      }
      k.rod([[7.1, 3.0, BZ0 + 0.25], [6.6, 3.0, BZ0 + 0.25]], '#c9a450', 0.3);
      k.poly(BELLOWS.map(([u, w]) => [u, w, BZ0] as P3), C.plankLight, k.thin);
      // a box of coal before the mouth
      k.box(3.7, 6.9, 0, 2.3, 1.9, 1.1, C.plankDark, { stripe: false });
      for (let i = 0; i < 6; i++) rock(k, 4.1 + (i % 3) * 0.75, 7.35 + Math.floor(i / 3) * 0.75, 0.9, 0.42, 0.45, '#3a3836', i, k.thin);
      // the water trough on the left, a spare pair of tongs leaning on it
      k.box(0.4, 7.0, 0, 2.8, 3.6, 2.3, C.plankDark, { stripe: false });
      k.poly([[0.7, 7.3, 2.0], [2.9, 7.3, 2.0], [2.9, 10.3, 2.0], [0.7, 10.3, 2.0]], k.vgrad(1.8, 8.8, 1.5, 2.0, [[0, '#3f6a8a'], [1, '#6a9ac0']]), k.thin);
      k.line([[1.1, 8.0, 2.01], [1.1, 9.4, 2.01]], '#d8ecf8aa', Math.max(0.7, 0.1 * k.s));
      for (const du of [-0.2, 0.2]) k.rod([[2.6 + du, 10.1, 0.4], [3.0 + du * 2, 10.5, 4.2]], C.iron, 0.12);
      // the stump and the anvil on it
      k.cyl(ANVIL.u, ANVIL.v, 0, 1.15, 2.4, C.log);
      k.disc(ANVIL.u, ANVIL.v, 2.4, 1.0, '#d9b07a', k.thin);
      anvil(k);
    });
    // the fire: glowing orange while idle, white-hot and pulsing while worked
    const t = v.t;
    const n = v.active ? 0.5 + 0.5 * Math.sin(t * Math.PI * 2 + 0.5) * Math.sin(t * Math.PI + 1) : 0;
    const open = arch(MOUTH.u0, MOUTH.u1, MOUTH.z0, MOUTH.z1, MOUTH.v + 0.02);
    const hot = v.active ? [[0, '#fff2b0'], [0.45, n > 0.5 ? '#ffd060' : '#ffb040'], [1, '#e85a1a']] as const : [[0, '#ffb040'], [0.5, '#e8702a'], [1, '#8a2a12']] as const;
    k.poly(open, k.vgrad(3.5, MOUTH.v, MOUTH.z0, MOUTH.z1, hot), k.lw);
    const [cx, cy] = k.p(3.5, MOUTH.v + 0.03, MOUTH.z0 + 0.35);
    k.pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const x = cx + (i - 2) * 0.55 * k.s;
      k.pen.moveTo(x + 0.32 * k.s, cy);
      k.pen.ellipse(x, cy - (i & 1) * 0.15 * k.s, 0.32 * k.s, 0.24 * k.s, 0, 0, Math.PI * 2);
    }
    k.pen.fillStyle = v.active ? '#fff0a0' : '#ff7a2a';
    k.pen.fill();
    k.disc(3.6, 4.0, 5.54, 0.95, v.active ? '#ffb040' : '#c8481a', 0);
    k.halo(3.5, MOUTH.v + 0.6, 2.4, 3.2 + n, '#ff9a48', v.active ? 0.42 + 0.2 * n : 0.3);
    if (v.active) k.halo(ANVIL.u, ANVIL.v, ANVIL.z + 0.5, 1.6, '#ffb060', 0.35);
    // the bellows: the leather between the boards, the top board
    bellows(k, 0.8);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const t = v.t;
    const n = due(t, dt, 6, v.seed);
    for (let i = 0; i < n; i++) spawn(fling('spark', ANVIL.u, ANVIL.v, ANVIL.z + 0.6, Math.floor(t * 30), i, [255, 200, 110], 0.6, 2.6));
    if (due(t, dt, 1.2, v.seed + 1)) spawn(fling('ember', 3.5, MOUTH.v + 0.3, MOUTH.z1, Math.floor(t * 20), 9, [255, 130, 60], 0.3, 1.6, -0.5));
    if (due(t, dt, 0.8, v.seed + 2)) spawn(puff('smoke', 3.5, 2.2, CHIMNEY + 0.6, Math.floor(t * 10), 3));
  },
};

// The bellows' leather and top board, the top `gap` over the bottom at
// its wide end (hinged at the nozzle).
function bellows(k: Kit, gap: number): void {
  const zAt = (u: number, f: number) => BZ0 + 0.12 + f * (0.15 + gap * (u - 7.0) / 3.3);
  const at = (f: number): P3[] => BELLOWS.map(([u, w]) => [u, w, zAt(u, f)] as P3);
  fillPts(k, hull([...at(0), ...at(1)].map((p) => k.p(...p))), '#7a4a30', k.lw);
  if (k.s >= 4) for (const f of [0.33, 0.66]) k.line([...at(f).slice(3), ...at(f).slice(0, 1)], '#4a2a1a', Math.max(0.6, 0.08 * k.s));
  k.poly(at(1), C.plankLight, k.lw);
  k.rod([[10.3, 3.0, zAt(10.3, 1)], [10.9, 3.0, zAt(10.9, 1)]], C.plankDark, 0.18);
}

// An arched opening in the plane v from u0 to u1, its sides z0 to z1.
function arch(u0: number, u1: number, z0: number, z1: number, v: number): P3[] {
  const r = (u1 - u0) / 2;
  const c = (u0 + u1) / 2;
  const spring = z1 - r * 0.7;
  const pts: P3[] = [[u0, v, z0], [u1, v, z0], [u1, v, spring]];
  for (let i = 1; i < 10; i++) {
    const th = (i / 10) * Math.PI;
    pts.push([c + r * Math.cos(th), v, spring + r * 0.7 * Math.sin(th)]);
  }
  pts.push([u0, v, spring]);
  return pts;
}

// Courses of cut stone across a face: on the plane v = at (axis 'v'), from
// a0 to a1 along u; or on the plane u = at (axis 'u'), a0 to a1 along v. A
// hole [h0, h1, top] is left for an opening.
function courses(k: Kit, a0: number, a1: number, at: number, z0: number, z1: number, axis: 'u' | 'v', hole?: readonly [number, number, number]): void {
  const P = (a: number, z: number): P3 => (axis === 'v' ? [a, at + 0.01, z] : [at + 0.01, a, z]);
  const seg: Array<[P3, P3]> = [];
  const H = 1.25;
  for (let z = z0 + H, r = 0; z < z1 + H - 0.1; z += H, r++) {
    const zt = Math.min(z, z1);
    const inHole = (a: number) => !!hole && a > hole[0] && a < hole[1] && z - H < hole[2];
    if (z < z1 - 0.1) {
      if (hole && z < hole[2]) seg.push([P(a0, z), P(Math.max(a0, hole[0]), z)], [P(Math.min(a1, hole[1]), z), P(a1, z)]);
      else seg.push([P(a0, z), P(a1, z)]);
    }
    for (let a = a0 + (r & 1 ? 1.25 : 0.1); a < a1 - 0.2; a += 2.5) if (a > a0 + 0.2 && !inHole(a)) seg.push([P(a, z - H), P(a, zt)]);
  }
  k.segs(seg, withAlpha(INK, 0.5), Math.max(0.7, 0.1 * k.s));
}

// The anvil: a waisted iron block with a horn toward -u.
function anvil(k: Kit): void {
  const { u, v, z } = ANVIL;
  const I = '#55555e';
  k.box(u - 0.7, v - 0.5, 2.4, 1.4, 1.0, 0.35, I, { line: k.thin });
  k.box(u - 0.4, v - 0.35, 2.75, 0.8, 0.7, 0.4, I, { line: k.thin });
  k.box(u - 0.9, v - 0.5, 3.15, 1.9, 1.0, 0.65, I);
  k.poly([[u - 0.9, v - 0.4, z + 0.4], [u - 2.0, v, z + 0.3], [u - 0.9, v + 0.4, z + 0.4], [u - 0.9, v + 0.4, z - 0.15], [u - 0.9, v - 0.4, z - 0.15]], shade(I, 0.08), k.lw);
  k.line([[u - 0.85, v + 0.52, z + 0.42], [u + 0.95, v + 0.52, z + 0.42]], '#9a9aa4', Math.max(0.7, 0.1 * k.s));
}

// ── web: the radio set ──────────────────────────────────────────────────────
// A steel cabinet with a screen, knobs and a speaker grille, a desk shelf
// before it with a microphone on a stand, an antenna on top. Talking to the
// world sets a waveform running across the screen and blinks the antenna's
// light.

const SCREEN = { u0: 2.2, u1: 6.8, z0: 6.0, z1: 9.4, v: 4.62 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 15, (k) => {
      k.shadow(4.5, 4.4, 4.6, 4.4, 0.3);
      // the cabinet
      k.box(1.2, 0.8, 0, 6.6, 3.8, 10.4, C.steelDark, { round: 0.2 });
      k.box(1.0, 0.6, 10.4, 7.0, 4.2, 0.4, C.steel);
      // the screen's bezel
      k.poly([[SCREEN.u0 - 0.35, SCREEN.v, SCREEN.z0 - 0.35], [SCREEN.u1 + 0.35, SCREEN.v, SCREEN.z0 - 0.35], [SCREEN.u1 + 0.35, SCREEN.v, SCREEN.z1 + 0.35], [SCREEN.u0 - 0.35, SCREEN.v, SCREEN.z1 + 0.35]], '#3a4048', k.thin, 0.3);
      // the speaker grille and the vents
      for (let i = 0; i < 5; i++) k.line([[2.0, 4.62, 1.2 + i * 0.5], [4.4, 4.62, 1.2 + i * 0.5]], '#3a4048', Math.max(0.7, 0.14 * k.s));
      k.poly([[5.0, 4.61, 0.9], [7.2, 4.61, 0.9], [7.2, 4.61, 3.6], [5.0, 4.61, 3.6]], k.side(shade(C.steelDark, 0.06), 0, 1), k.thin);
      k.disc(6.1, 4.65, 2.25, 0.2, C.iron, 0);
      // the desk shelf with its knobs
      k.box(1.4, 4.6, 4.3, 6.2, 2.3, 0.5, C.plank);
      for (const [u, c] of [[2.4, '#d0d0c8'], [3.4, '#d0d0c8'], [4.4, '#c9a450']] as const) k.cyl(u, 5.9, 4.8, 0.32, 0.3, c, { line: k.thin });
      for (let i = 0; i < 3; i++) k.rod([[5.0 + i * 0.45, 4.9, 5.4], [5.0 + i * 0.45, 4.6, 4.95]], '#e0e0d8', 0.08);
      // knobs and switches under the screen
      for (const u of [2.6, 3.6, 4.6, 5.6, 6.4]) {
        const [x, y] = k.p(u, 4.64, 5.1);
        k.pen.beginPath();
        k.pen.arc(x, y, Math.max(1, 0.22 * k.s), 0, Math.PI * 2);
        k.paint(u > 6 ? C.cloth : '#d8d8d0', k.thin * 0.8);
      }
      // the microphone on its stand, its cord lying across the desk to a
      // socket under the screen
      k.face(7.05, 4.63, 5.15, 0.2, C.iron, k.thin);
      k.rod([[6.75, 5.65, 4.86], [7.25, 5.45, 4.86], [7.3, 4.95, 4.86], [7.05, 4.7, 5.0], [7.05, 4.68, 5.1]], '#3a3a42', 0.16);
      k.disc(6.6, 5.8, 4.82, 0.5, C.iron, k.thin);
      k.rod([[6.6, 5.8, 4.8], [6.6, 5.9, 6.6]], C.iron, 0.12);
      k.box(6.25, 5.6, 6.55, 0.7, 0.6, 1.0, '#3a3a42', { round: 0.3, line: k.lw });
      if (k.fine) for (let i = 0; i < 3; i++) k.line([[6.3, 6.21, 6.8 + i * 0.25], [6.9, 6.21, 6.8 + i * 0.25]], '#8a8a92', 0.05 * k.s);
      // the antenna: a mast with crossbars on the cabinet's top
      k.rod([[2.2, 2.0, 10.8], [2.2, 2.0, 14.2]], C.steel, 0.14);
      for (const [z, w] of [[12.0, 1.0], [13.1, 0.7]] as const) k.rod([[2.2 - w, 2.0, z], [2.2 + w, 2.0, z]], C.steel, 0.1);
      k.box(1.7, 1.5, 10.8, 1.0, 1.0, 0.5, C.iron, { line: k.thin });
      // a crate of trade goods beside it
      crate(k, 7.9, 1.0, 0, 1.0, 3.0, 1.8, C.plankLight);
    });
    // the screen: a flat line idle, a running waveform while worked
    const { u0, u1, z0, z1 } = SCREEN;
    const sv = SCREEN.v + 0.01;
    k.poly([[u0, sv, z0], [u1, sv, z0], [u1, sv, z1], [u0, sv, z1]], k.vgrad(u0, sv, z0, z1, [[0, '#14281c'], [1, '#1e3a28']]), 0);
    const mid = (z0 + z1) / 2;
    const grid: Array<[P3, P3]> = [[[u0 + 0.2, sv, mid], [u1 - 0.2, sv, mid]]];
    for (let u = u0 + 1.15; u < u1 - 0.2; u += 1.15) grid.push([[u, sv, z0 + 0.2], [u, sv, z1 - 0.2]]);
    k.segs(grid, '#3a6a4a', Math.max(0.6, 0.06 * k.s));
    const pts: P3[] = [];
    for (let u = u0 + 0.2; u <= u1 - 0.2; u += 0.15) {
      const x = u - u0;
      const amp = v.active ? Math.sin(x * 3.1 - v.t * 7) * 0.9 * (0.6 + 0.4 * Math.sin(x * 0.9 + v.t * 2.3)) + Math.sin(x * 7.3 + v.t * 11) * 0.25 : 0;
      pts.push([u, sv, mid + amp]);
    }
    k.line(pts, v.active ? '#a6ffb8' : '#5aa06a', Math.max(0.9, 0.14 * k.s));
    // the antenna's light
    const blink = v.active && Math.sin(v.t * 5) > 0;
    k.disc(2.2, 2.0, 14.35, 0.25, blink ? '#ff6a4a' : '#7a3a30', k.thin);
    if (!v.active) return;
    k.halo((u0 + u1) / 2, sv + 0.4, mid, 3.4, '#8affa0', 0.22);
    if (blink) k.halo(2.2, 2.0, 14.4, 1.2, '#ff8a6a', 0.55);
  },
};

// ── think: the chess table ──────────────────────────────────────────────────
// A small square table on a turned post with a board of squares and a game
// half played, a chair at either side and a mug of tea.

const THINK_Z = 4.4;

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 3.5, 6.2, 3.2, 0.26);
    chair(k, 1.9, 3.5, 0, C.plank);
    // the table: a cross foot, a turned post, the top
    k.box(4.4, 3.2, 0, 3.2, 0.6, 0.4, C.plankDark, { line: k.thin });
    k.box(5.7, 1.9, 0, 0.6, 3.2, 0.4, C.plankDark, { line: k.thin });
    k.cyl(6.0, 3.5, 0.4, 0.38, THINK_Z - 0.9, C.plankDark);
    k.cyl(6.0, 3.5, 1.4, 0.55, 0.6, C.plank, { line: k.thin });
    k.box(3.9, 1.4, THINK_Z - 0.5, 4.2, 4.2, 0.5, C.plank);
    // the board
    const b0 = [4.25, 1.75] as const;
    const sq = 3.5 / 8;
    k.poly([[b0[0], b0[1], THINK_Z + 0.01], [b0[0] + 3.5, b0[1], THINK_Z + 0.01], [b0[0] + 3.5, b0[1] + 3.5, THINK_Z + 0.01], [b0[0], b0[1] + 3.5, THINK_Z + 0.01]], C.chessLight, k.thin);
    k.pen.beginPath();
    for (let i = 0; i < 8; i++) {
      for (let j = 0; j < 8; j++) {
        if ((i + j) & 1) continue;
        const u = b0[0] + i * sq;
        const w = b0[1] + j * sq;
        k.trace([[u, w, THINK_Z + 0.02], [u + sq, w, THINK_Z + 0.02], [u + sq, w + sq, THINK_Z + 0.02], [u, w + sq, THINK_Z + 0.02]]);
      }
    }
    k.pen.fillStyle = C.chessDark;
    k.pen.fill();
    // the pieces: simple turned shapes, the game half played (far ones first)
    const pieces: Array<[number, number, boolean, number]> = [];
    for (let i = 0; i < 14; i++) {
      const col = Math.floor(hash(v.seed, i, 1) * 8);
      const row = Math.floor(hash(v.seed, i, 2) * 8);
      if (pieces.some(([c, r]) => c === col && r === row)) continue;
      pieces.push([col, row, i < 7, hash(v.seed, i, 3) < 0.6 ? 0 : hash(v.seed, i, 4) < 0.5 ? 1 : 2]);
    }
    pieces.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    for (const [col, row, light, kind] of pieces) piece(k, b0[0] + (col + 0.5) * sq, b0[1] + (row + 0.5) * sq, THINK_Z + 0.02, light ? '#f6eedc' : '#3a2c22', kind);
    // a mug of tea at the corner
    k.cyl(7.75, 5.25, THINK_Z, 0.32, 0.6, '#c06a3a', { line: k.thin });
    k.disc(7.75, 5.25, THINK_Z + 0.58, 0.24, '#6a3a1a', 0);
    chair(k, 10.1, 3.5, Math.PI, C.plank);
  },
};

// A chess piece at (u, v) on z: a pawn (0), a tall one with a ball (1) or
// a tall one with a notched crown (2). Plain shapes, nothing more.
function piece(k: Kit, u: number, v: number, z: number, c: Color, kind: number): void {
  const h = kind === 0 ? 0.42 : 0.72;
  k.cyl(u, v, z, 0.14, 0.08, c, { line: k.thin * 0.6 });
  k.cyl(u, v, z + 0.06, 0.09, h * 0.7, c, { line: k.thin * 0.6 });
  const [x, y] = k.p(u, v, z + h * 0.75);
  k.pen.beginPath();
  k.pen.arc(x, y, (kind === 0 ? 0.11 : 0.13) * k.s + 0.4, 0, Math.PI * 2);
  k.paint(c, k.thin * 0.6);
  if (kind === 2 && k.fine) k.line([[u - 0.08, v, z + h * 0.92], [u + 0.08, v, z + h * 0.92]], c === '#f6eedc' ? '#3a2c22' : '#f6eedc', 0.04 * k.s);
}

// ── idle: the campfire ──────────────────────────────────────────────────────
// A fire of crossed logs in a ring of stones on trodden earth, a pot hung
// over it from a tripod, three log seats round it (the front left open to
// the room; the left one drawn up close, where the camp cook sits to stir
// the pot: see npcs.ts), a stack of firewood, a tin mug left on a seat and
// a torch on a pole in the back corner. It always burns, whoever sits by
// it, throwing embers and a thread of smoke.

export const FIRE = { u: 7.5, v: 5.2 };
const RING = { u: 2.6, v: 2.2 }; // the stone ring's radii
export const POT = 4.0; // the pot's bottom
const APEX = 7.6; // the tripod's top
const TORCH = { u: 12.0, v: 0.55, z: 5.9 }; // the torch's cup
// The left log seat, along v at u, its top z high.
export const LEFT_SEAT = { u: 1.7, z: 1.55 };

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 8,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'idle', 8, (k) => {
      k.shadow(7.5, 5.5, 7.4, 5.2, 0.2);
      // trodden earth round the fire
      k.disc(FIRE.u, FIRE.v, 0.02, 4.9, withAlpha('#5a4430', 0.55), 0);
      k.disc(FIRE.u, FIRE.v, 0.03, 3.4, withAlpha('#4a3424', 0.45), 0);
      // the torch's pole and its iron cup in the back corner
      k.shadow(TORCH.u, TORCH.v, 0.7, 0.7, 0.26);
      k.rod([[TORCH.u, TORCH.v, 0], [TORCH.u, TORCH.v, TORCH.z - 0.3]], C.log, 0.26);
      k.cyl(TORCH.u, TORCH.v, TORCH.z - 0.45, 0.38, 0.5, C.iron, { line: k.thin });
      // the back seat and the left one, each on its own shadow
      k.shadow(7.3, 1.3, 4.3, 1.1, 0.28);
      seat(k, 3.4, 11.2, 1.3, 'u');
      k.shadow(LEFT_SEAT.u, 5.8, 1.1, 3.0, 0.28);
      seat(k, 2.8, 8.8, LEFT_SEAT.u, 'v');
      // firewood stacked behind the right seat
      for (const [cv, cz] of [[0.7, 0.45], [1.6, 0.45], [1.15, 1.25]] as const) logU(k, 12.3, 14.7, cv, cz, 0.42, '#6a4a2e');
      // the back stones of the ring, and the logs in the fire
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.2;
        if (Math.sin(a) > 0.15) continue;
        rock(k, FIRE.u + Math.cos(a) * RING.u, FIRE.v + Math.sin(a) * RING.v, 0, 0.72, 0.62, i & 1 ? C.stone : C.stoneDark, i, k.thin);
      }
      k.disc(FIRE.u, FIRE.v, 0.05, 2.0, '#2e2018', 0);
      k.disc(FIRE.u, FIRE.v, 0.06, 1.3, '#7a2a10', 0);
      logU(k, FIRE.u - 1.7, FIRE.u + 1.4, FIRE.v - 0.4, 0.4, 0.38, '#4a3022');
      logV(k, FIRE.v - 1.5, FIRE.v + 1.1, FIRE.u + 0.2, 0.62, 0.36, '#4a3022');
      // the tripod's back legs
      k.rod([[FIRE.u - 2.4, FIRE.v - 1.7, 0], [FIRE.u, FIRE.v, APEX]], C.plankDark, 0.2);
      k.rod([[FIRE.u + 2.4, FIRE.v - 1.5, 0], [FIRE.u, FIRE.v, APEX]], C.plankDark, 0.2);
    });
    // the fire itself, always burning, and the torch's flame
    const t = v.t;
    k.halo(TORCH.u, TORCH.v, TORCH.z + 0.6, 1.7, '#ffb040', 0.5);
    flames(k, TORCH.u, TORCH.v, TORCH.z - 0.05, 0.28, t * Math.PI + 1.1);
    k.halo(FIRE.u, FIRE.v, 1.6, 6.0, '#ff8a3a', 0.5 + 0.1 * Math.sin(t * Math.PI * 2));
    flames(k, FIRE.u, FIRE.v, 0.5, 0.78, t * Math.PI / 2);
    k.halo(FIRE.u, FIRE.v, 1.2, 2.4, '#ffe0a0', 0.45);
    // the pot over it, the front stones, the right seat and the mug
    still(v, 'idle-front', 8, (k) => {
      k.line([[FIRE.u, FIRE.v, APEX], [FIRE.u, FIRE.v, POT + 1.6]], INK, Math.max(0.8, 0.08 * k.s));
      cookPot(k, FIRE.u, FIRE.v, POT);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + 0.2;
        if (Math.sin(a) <= 0.15) continue;
        rock(k, FIRE.u + Math.cos(a) * RING.u, FIRE.v + Math.sin(a) * RING.v, 0, 0.72, 0.62, i & 1 ? C.stone : C.stoneDark, i, k.thin);
      }
      k.rod([[FIRE.u + 0.3, FIRE.v + 2.8, 0], [FIRE.u, FIRE.v, APEX]], C.plankDark, 0.2);
      k.shadow(13.6, 5.8, 1.1, 3.0, 0.28);
      seat(k, 2.8, 8.8, 13.6, 'v');
      k.cyl(13.5, 7.0, 1.62, 0.3, 0.55, '#9aa3ab', { line: k.thin });
      k.rod([[13.8, 7.0, 2.05], [13.98, 7.0, 1.87], [13.8, 7.0, 1.7]], '#9aa3ab', 0.07);
    });
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const t = v.t;
    if (due(t, dt, 1.8, v.seed)) spawn(fling('ember', FIRE.u, FIRE.v, 2.6, Math.floor(t * 20), 0, [255, 140, 60], 0.25, 1.6, -0.6));
    if (due(t, dt, 0.7, v.seed + 1)) spawn(puff('smoke', FIRE.u, FIRE.v, 7.0, Math.floor(t * 10), 1));
    if (due(t, dt, v.active ? 1.2 : 0.5, v.seed + 2)) spawn(puff('steam', FIRE.u + 0.3, FIRE.v, 5.6, Math.floor(t * 10), 2));
  },
};

// A log seat: a fat log split along the top, a pale flat face to sit on,
// along u (at v = c) or along v (at u = c), from a0 to a1.
function seat(k: Kit, a0: number, a1: number, c: number, axis: 'u' | 'v'): void {
  const r = 0.9;
  if (axis === 'u') logU(k, a0, a1, c, r, r, '#6a4428');
  else logV(k, a0, a1, c, r, r, '#6a4428');
  const z = r * 1.72;
  const w = 0.55;
  const P = (a: number, d: number): P3 => (axis === 'u' ? [a, c + d, z] : [c + d, a, z]);
  k.poly([P(a0 + 0.15, -w), P(a1 - 0.1, -w), P(a1 - 0.1, w), P(a0 + 0.15, w)], '#c89a62', k.thin);
  if (k.fine) k.line([P(a0 + 0.6, 0.05), P(a1 - 0.6, -0.05)], '#a87a48', 0.06 * k.s);
}

// A black cooking pot with a bail, hung at z (its bottom).
function cookPot(k: Kit, cu: number, cv: number, z: number): void {
  const body = '#33302e';
  const e0 = k.ell(cu, cv, z + 0.2, 0.6);
  const e1 = k.ell(cu, cv, z + 1.4, 0.85);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e1.cx - e1.rx, e1.cy);
  pen.bezierCurveTo(e1.cx - e1.rx * 1.05, e0.cy, e0.cx - e0.rx * 0.6, e0.cy + e0.ry * 1.3, e0.cx, e0.cy + e0.ry * 1.3);
  pen.bezierCurveTo(e0.cx + e0.rx * 0.6, e0.cy + e0.ry * 1.3, e1.cx + e1.rx * 1.05, e0.cy, e1.cx + e1.rx, e1.cy);
  pen.closePath();
  const g = pen.createLinearGradient(e1.cx - e1.rx, 0, e1.cx + e1.rx, 0);
  g.addColorStop(0, shade(body, 0.25));
  g.addColorStop(0.4, shade(body, 0.1));
  g.addColorStop(1, shade(body, -0.2));
  k.paint(g, k.lw);
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, e1.rot, 0, Math.PI * 2);
  k.paint('#4a4642', k.thin);
  pen.beginPath();
  pen.ellipse(e1.cx, e1.cy + e1.ry * 0.1, e1.rx * 0.8, e1.ry * 0.7, e1.rot, 0, Math.PI * 2);
  pen.fillStyle = '#c08a4a';
  pen.fill();
  // the bail up to the chain
  const [bx, by] = k.p(cu, cv, z + 1.4);
  const [, ty] = k.p(cu, cv, z + 1.6 + 0.1);
  pen.beginPath();
  pen.ellipse(bx, by, e1.rx * 0.95, by - ty + 0.4 * k.s, 0, Math.PI, Math.PI * 2);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, 0.09 * k.s);
  pen.stroke();
}

// ── entrance: the door ──────────────────────────────────────────────────────
// A plank door with iron strap hinges in a timber frame, the hills at dusk
// beyond it; boots on a mat and a shovel on one side, a sun lamp on a
// bracket over a seed tray on the other, shining warm white. The door
// swings open while someone comes or goes.

const DOOR = { u0: 3.6, u1: 9.4, h: 16, hv: 0.35 };
const SUN = { u: 12.6, v: 1.9, z: 15.4 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 20, (k) => {
      // the hills beyond the opening
      const out = -0.6;
      const pen = k.pen;
      pen.save();
      pen.beginPath();
      k.trace([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]]);
      pen.clip();
      dusk(k, u0 - 0.5, u1 + 0.5, 0, h, out, v.seed);
      // a path running out across the grass
      k.poly([[u0 + 1.6, out, 0], [u1 - 1.2, out, 0], [(u0 + u1) / 2 + 0.3, out, 3.0], [(u0 + u1) / 2 - 0.1, out, 3.0]], '#b89a6a', 0);
      pen.restore();
      // the reveal and the frame
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#6e4a2a', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#4a3420', 0);
      k.box(u0 - 0.7, 0, 0, 0.7, 0.7, h + 0.4, C.plank);
      k.box(u1, 0, 0, 0.7, 0.7, h + 0.4, C.plank);
      logU(k, u0 - 1.4, u1 + 1.4, 0.6, h + 0.95, 0.75, C.log);
      k.poly([[u0, 0, 0.03], [u1, 0, 0.03], [u1, 0.5, 0.03], [u0, 0.5, 0.03]], C.plankDark, k.thin);
      // the mat
      k.poly([[u0 + 0.3, 0.9, 0.04], [u1 - 0.3, 0.9, 0.04], [u1 - 0.3, 3.5, 0.04], [u0 + 0.3, 3.5, 0.04]], '#a8844e', k.thin, 0.2);
      k.poly([[u0 + 0.8, 1.3, 0.05], [u1 - 0.8, 1.3, 0.05], [u1 - 0.8, 3.1, 0.05], [u0 + 0.8, 3.1, 0.05]], '#8a3a2e', 0);
      // left: a shovel against the wall and a pair of boots
      k.rod([[1.1, 0.5, 0.5], [0.9, 0.3, 10.5]], '#b07a44', 0.22);
      k.poly([[0.85, 0.75, 0.1], [1.75, 0.75, 0.3], [1.65, 0.6, 2.4], [0.85, 0.55, 2.3]], C.steel, k.lw, 0.15);
      k.rod([[0.7, 0.3, 10.5], [1.2, 0.3, 10.5]], '#b07a44', 0.2);
      for (const du of [0, 1.0]) {
        k.box(1.6 + du, 1.6, 0, 0.8, 1.2, 0.5, '#5a3a22', { round: 0.2, line: k.thin });
        k.box(1.6 + du, 1.6, 0.4, 0.8, 0.7, 1.8, '#6a4628', { round: 0.2, line: k.thin });
      }
      // right: a seed tray under the sun lamp, the lamp's bracket
      k.box(10.9, 0.4, 0, 3.7, 2.3, 2.4, C.plank, { stripe: false });
      k.poly([[11.1, 0.6, 2.41], [14.4, 0.6, 2.41], [14.4, 2.5, 2.41], [11.1, 2.5, 2.41]], '#4a3424', k.thin);
      for (let i = 0; i < 6; i++) sprout(k, 11.6 + (i % 3) * 1.15, 1.1 + Math.floor(i / 3) * 0.9, 2.42, 0.9 + hash(v.seed, i, 5) * 0.4, v.seed + i);
      k.poly([[SUN.u - 0.45, 0.02, SUN.z + 0.2], [SUN.u + 0.45, 0.02, SUN.z + 0.2], [SUN.u + 0.45, 0.02, SUN.z + 2.2], [SUN.u - 0.45, 0.02, SUN.z + 2.2]], C.iron, k.thin, 0.2);
      k.rod([[SUN.u, 0.05, SUN.z + 1.4], [SUN.u, SUN.v - 0.2, SUN.z + 1.4], [SUN.u, SUN.v, SUN.z + 0.9]], C.iron, 0.16);
      // the lamp: a dish turned down, its face burning warm white
      const rim = ring(k, [SUN.u, SUN.v, SUN.z], [0, 0.45, 1], 1.25, 20);
      const back = ring(k, [SUN.u, SUN.v - 0.2, SUN.z + 0.75], [0, 0.45, 1], 0.5, 12);
      fillPts(k, hull([...rim, ...back]), '#7a8288', k.lw);
      fillPts(k, rim, '#fffbe8', k.thin);
      fillPts(k, ring(k, [SUN.u, SUN.v + 0.02, SUN.z - 0.04], [0, 0.45, 1], 0.6, 14), '#fff8c0', 0);
    });
    // the sun lamp's glow
    k.halo(SUN.u, SUN.v + 0.3, SUN.z - 0.3, 3.4, C.sun, 0.55);
    k.halo(SUN.u, SUN.v + 0.3, SUN.z - 1.0, 1.6, '#ffffff', 0.4);
    // the door: shut, or swung in while someone passes
    const th = v.active ? 0.62 + 0.05 * Math.sin(v.t * 2.2) : 0;
    doorLeaf(k, th);
  },
};

// The door leaf on its hinge at u0, opened by th radians into the room:
// upright planks, two ledges and a brace, strap hinges and a ring latch.
function doorLeaf(k: Kit, th: number): void {
  const { u0, u1, h, hv } = DOOR;
  const w = u1 - u0 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, hv + dv * s + du * n, z];
  const wood = '#9a6a3e';
  const face = k.side(wood, -dv, du, 0.16);
  if (th > 0.05) k.poly([P(w, 0), P(w, 0, -0.35), P(w, h, -0.35), P(w, h)], k.side(wood, du, dv, 0.16), k.thin);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h)], face, k.lw);
  // the planks' seams
  const seams: Array<[P3, P3]> = [];
  for (let s = w / 5; s < w - 0.1; s += w / 5) seams.push([P(s, 0.1, 0.01), P(s, h - 0.1, 0.01)]);
  k.segs(seams, withAlpha(INK, 0.6), Math.max(0.7, 0.1 * k.s));
  // the ledges and the brace
  for (const z of [2.2, h - 2.6]) k.poly([P(0.2, z, 0.02), P(w - 0.2, z, 0.02), P(w - 0.2, z + 1.1, 0.02), P(0.2, z + 1.1, 0.02)], shade(face, 0.06), k.thin);
  k.poly([P(0.5, 3.3, 0.02), P(1.5, 3.3, 0.02), P(w - 0.5, h - 2.6, 0.02), P(w - 1.5, h - 2.6, 0.02)], shade(face, 0.04), k.thin);
  // strap hinges, the ring latch
  for (const z of [2.75, h - 2.05]) {
    k.poly([P(-0.05, z - 0.28, 0.04), P(w * 0.62, z - 0.18, 0.04), P(w * 0.66, z, 0.04), P(w * 0.62, z + 0.18, 0.04), P(-0.05, z + 0.28, 0.04)], C.iron, k.thin);
  }
  const [lx, ly] = k.p(...P(w - 0.8, 7.6, 0.05));
  k.pen.beginPath();
  k.pen.arc(lx, ly + 0.35 * k.s, 0.4 * k.s, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(1.2, 0.2 * k.s);
  k.pen.stroke();
  k.pen.strokeStyle = '#8a8a92';
  k.pen.lineWidth = Math.max(0.7, 0.1 * k.s);
  k.pen.stroke();
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
