import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { across, barStack, chair, coin, coinHeap, coins, dial, fillPts, frustum, gem, goldBar, hull, ledgerRow, ring, rivets, rope, stanchion } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, circle, due, hash, kitOf, still, withAlpha, wisp } from './kit.ts';

// The vault's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame.
//
//   write     the counting desk: the teller's, a ledger, a balance and coins
//   read      the ledger archive: steel shelving, card drawers, a lectern
//   search    the safe being cracked: its dial turning under a clamp lamp
//   run       the foundry: a furnace, a ladle pouring gold into moulds
//   web       the watch desk: a bank of camera monitors
//   think     the planning table: blueprints of the vault, a pin board
//   idle      the hoard: a heap of gold behind velvet ropes
//   entrance  the round vault doorway, the lobby light beyond

type Spawn = (p: Particle) => void;

// A point on the quad a (u0, z0) - (u1, z1) of a plane.
const on = (q: readonly [P3, P3, P3, P3], fu: number, fz: number): P3 => {
  const [a, b, , d] = q;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

// A row of handwriting: a tight wobble along u at (v, z), u0 to u1.
function script(u0: number, u1: number, v: number, z: number, seed: number): P3[] {
  const pts: P3[] = [];
  for (let u = u0, i = 0; u <= u1 + 1e-6; u += 0.11, i++) pts.push([u, v + (i & 1 ? 0.035 : -0.035) + (hash(seed, i) - 0.5) * 0.03, z]);
  return pts;
}

// ── write: the counting desk ───────────────────────────────────────────────
// A mahogany pedestal desk with a green leather top, turned to the room:
// the teller's leather chair behind it (see npcs.ts), her open ledger, a
// red ink pad, coins and bundles of notes; the inkwell and quill, a
// banker's lamp and a brass balance with coins in its pans at its far end,
// clear of her. Worked, the lamp burns brighter and the balance sways (her
// hands count and stamp). `top`: the desk top; `back`: its back edge, a
// step out from the wall; `seat`: the chair, where she sits.

export const COUNTER = { top: 6.3, back: 2.2, seat: [5.5, 1.4] as const };
const DESK = COUNTER.top;
const PAGE = { u0: 5.25, u1: 6.95, v0: 3.35, dv: 0.3, rows: 6 };
const SCALE = { u: 1.9, v: 5.4, z: DESK + 3.3, arm: 1.3 };

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const b = COUNTER.back;
    const k = still(v, 'write', 12, (k) => {
      k.shadow(5.5, 4.2, 6.2, 3.6, 0.32);
      // the teller's chair, behind the desk, facing the room
      chair(k, COUNTER.seat[0], COUNTER.seat[1], Math.PI / 2, C.oxblood);
      // the pedestals, the modesty panel between them, the top
      for (const u0 of [0.9, 7.3]) {
        k.box(u0, b + 0.4, 0, 2.8, 4.2, 5.6, C.mahogany, { stripe: false });
        for (const [z0, z1] of [[0.4, 2.0], [2.2, 3.8], [4.0, 5.3]] as const) {
          k.rect(u0 + 0.25, z0, u0 + 2.55, z1, b + 4.61, k.side(shade(C.mahogany, 0.06), 0, 1), k.thin);
          k.rod([[u0 + 1.0, b + 4.7, (z0 + z1) / 2 + 0.1], [u0 + 1.8, b + 4.7, (z0 + z1) / 2 + 0.1]], C.brass, 0.12);
        }
      }
      k.box(3.7, b + 3.7, 0.8, 3.6, 0.5, 4.8, C.mahoganyDark, { stripe: false });
      k.box(0.4, b, 5.6, 10.2, 4.6, 0.7, C.mahogany);
      const [l0, l1] = [b + 0.45, b + 4.15];
      k.poly([[1.0, l0, DESK + 0.01], [9.6, l0, DESK + 0.01], [9.6, l1, DESK + 0.01], [1.0, l1, DESK + 0.01]], C.leather, k.thin);
      k.line([[1.25, l0 + 0.25, DESK + 0.02], [9.35, l0 + 0.25, DESK + 0.02], [9.35, l1 - 0.25, DESK + 0.02], [1.25, l1 - 0.25, DESK + 0.02], [1.25, l0 + 0.25, DESK + 0.02]], withAlpha(C.brassLight, 0.6), Math.max(0.6, 0.06 * k.s));
      // the ledger before her: its covers, then the pages, written full
      k.poly([[3.3, 3.1, DESK + 0.03], [7.1, 3.1, DESK + 0.03], [7.1, 5.45, DESK + 0.03], [3.3, 5.45, DESK + 0.03]], C.oxblood, k.thin);
      const z = DESK + 0.18;
      k.poly([[3.45, 3.2, z], [5.2, 3.2, z], [5.2, 5.35, z], [3.45, 5.35, z]], '#f3ead2', k.thin);
      k.poly([[5.2, 3.2, z], [6.95, 3.2, z], [6.95, 5.35, z], [5.2, 5.35, z]], '#f8f0dc', k.thin);
      k.line([[5.2, 3.2, z + 0.01], [5.2, 5.35, z + 0.01]], withAlpha(INK, 0.45), Math.max(0.6, 0.06 * k.s));
      if (k.s >= 5) {
        const ink = withAlpha('#2a3550', 0.7);
        const w = Math.max(0.6, 0.05 * k.s);
        for (let r = 0; r < PAGE.rows; r++) k.line(script(3.65, 4.2 + hash(r, 41) * 0.8, PAGE.v0 + r * PAGE.dv, z + 0.01, r), ink, w);
        for (let r = 0; r < 4; r++) k.line(script(PAGE.u0 + 0.2, PAGE.u0 + 0.8 + hash(r, 42) * 0.7, PAGE.v0 + r * PAGE.dv, z + 0.01, r + 9), ink, w);
        k.line([[4.95, 3.2, z + 0.01], [4.95, 5.35, z + 0.01]], withAlpha('#c0392f', 0.5), w);
        // her stamp's marks down the right-hand page
        for (const [u, w2] of [[6.45, 4.55], [6.2, 5.0]] as const) {
          const e = k.ell(u, w2, z + 0.01, 0.28);
          k.pen.beginPath();
          k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
          k.paint(withAlpha(C.red, 0.2), Math.max(0.6, 0.06 * k.s), withAlpha(C.red, 0.75));
        }
      }
      k.line([[6.2, 5.35, z], [6.25, 5.9, DESK - 0.2]], '#c0392f', Math.max(0.8, 0.12 * k.s));
      // the red ink pad at her elbow
      k.box(7.4, 3.0, DESK, 1.3, 0.9, 0.16, C.iron, { line: k.thin, stripe: false });
      k.poly([[7.55, 3.12, DESK + 0.17], [8.55, 3.12, DESK + 0.17], [8.55, 3.78, DESK + 0.17], [7.55, 3.78, DESK + 0.17]], C.red, 0);
      // the inkwell at the far end, the balance's foot and pillar
      k.cyl(3.4, 6.05, DESK, 0.42, 0.5, '#2a3550', { top: '#3a4a70' });
      k.cyl(3.4, 6.05, DESK + 0.5, 0.2, 0.18, C.brass);
      k.cyl(SCALE.u, SCALE.v, DESK, 0.75, 0.3, C.mahoganyDark, { top: shade(C.mahoganyDark, 0.15) });
      k.cyl(SCALE.u, SCALE.v, DESK + 0.3, 0.12, SCALE.z - DESK - 0.3, C.brass, { line: k.thin });
      // coins and bundles of notes down the near end, low
      coins(k, 8.1, 4.5, DESK, 5);
      coins(k, 8.9, 4.9, DESK, 3);
      coins(k, 7.8, 5.6, DESK, 3);
      for (const [u, w2, n] of [[8.6, 5.7, 0], [8.7, 5.75, 1]] as const) {
        k.box(u, w2, DESK + n * 0.4, 1.2, 0.75, 0.4, '#7fa070', { line: k.thin, stripe: false });
        k.box(u + 0.4, w2 - 0.02, DESK + n * 0.4, 0.3, 0.79, 0.42, '#f3ead2', { line: 0, stripe: false });
      }
      // the banker's lamp at the far back corner
      k.disc(1.3, 2.95, DESK + 0.02, 0.6, C.brass, k.thin);
      k.rod([[1.3, 2.95, DESK], [1.3, 2.95, DESK + 2.3]], C.brass, 0.15);
      // the quill, stood in its well
      quill(k, [3.4, 6.05, DESK + 0.55], [0.5, -0.35, 1]);
    });
    // the lamp's green shade, lit
    const [s0, s1, sv, sz, sr] = [0.5, 2.0, 3.0, DESK + 2.2, 0.58];
    const lamp = '#2f7a54';
    const arcAt = (u: number): P3[] => Array.from({ length: 9 }, (_, i) => [u, sv + Math.cos((i / 8) * Math.PI) * sr, sz + Math.sin((i / 8) * Math.PI) * sr * 0.9] as P3);
    const shell = hull([...arcAt(s0), ...arcAt(s1)].map((p) => k.p(...p)));
    fillPts(k, shell, k.grad([s0, sv, sz + sr], [s0, sv + sr, sz], [[0, '#5fb88a'], [0.5, lamp], [1, shade(lamp, -0.3)]]), k.lw);
    k.line(arcAt(s1), withAlpha(INK, 0.7), k.thin);
    k.line([[s0 + 0.1, sv - sr * 0.3, sz + sr * 0.85], [s1 - 0.2, sv - sr * 0.3, sz + sr * 0.85]], withAlpha('#d8ffe8', 0.6), Math.max(0.7, 0.08 * k.s));
    k.line([[s0 + 0.1, sv + sr, sz], [s1 - 0.1, sv + sr, sz]], '#fff0c0', Math.max(0.8, 0.12 * k.s));
    k.pool(2.2, 4.0, 2.4, 1.6, '#ffe2a0', v.active ? 0.5 : 0.3, DESK + 0.05);
    k.halo(1.3, 3.2, sz - 0.1, 2.6, '#ffd890', v.active ? 0.45 : 0.3);
    // the balance's beam and pans, swaying while the teller counts (once
    // in two seconds, so a worked desk loops cleanly)
    const tilt = v.active ? Math.sin(v.t * Math.PI) * 0.16 : 0.04;
    const ends: P3[] = [-1, 1].map((sd) => [SCALE.u + sd * Math.cos(tilt) * SCALE.arm, SCALE.v, SCALE.z + sd * Math.sin(tilt) * SCALE.arm] as P3);
    k.rod([ends[0], ends[1]], C.brass, 0.14);
    k.disc(SCALE.u, SCALE.v, SCALE.z + 0.05, 0.16, C.brassLight, k.thin);
    for (const [i, e] of ends.entries()) {
      const pz = e[2] - 1.7;
      const strings: Array<[P3, P3]> = [];
      for (const a of [0.6, 2.7, 4.8]) strings.push([e, [e[0] + Math.cos(a) * 0.55, e[1] + Math.sin(a) * 0.55, pz]]);
      k.segs(strings, withAlpha(INK, 0.8), Math.max(0.6, 0.05 * k.s));
      k.disc(e[0], e[1], pz, 0.62, C.brass, k.thin);
      k.disc(e[0], e[1], pz + 0.02, 0.44, shade(C.brass, 0.15), 0);
      if (i === 0) coins(k, e[0], e[1], pz, 3, 0.32);
      else goldBar(k, e[0] - 0.45, e[1] - 0.22, pz, 0.9, 0.45, 0.28);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 0.5, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      spawn({ kind: 'glint', x: 7.8 + hash(tick, 1) * 1.2, y: 4.5 + hash(tick, 2) * 1.0, z: DESK + 1.2, vx: 0, vy: 0, vz: 0.6, life: 0.7, color: [255, 226, 140], glow: true, gravity: 0 });
    }
  },
};

// A quill pen, its nib at `tip`, leaning along `dir` (frame units).
function quill(k: Kit, tip: P3, dir: P3): void {
  const l = Math.hypot(...dir);
  const d: P3 = [dir[0] / l, dir[1] / l, dir[2] / l];
  const at = (t: number): Pt => k.p(tip[0] + d[0] * t, tip[1] + d[1] * t, tip[2] + d[2] * t);
  const [x0, y0] = at(0);
  const [x1, y1] = at(3.0);
  const [xm, ym] = at(1.9);
  const nx = -(y1 - y0);
  const ny = x1 - x0;
  const nl = Math.hypot(nx, ny) || 1;
  const w = 0.42 * k.s;
  const pen = k.pen;
  pen.beginPath();
  const [xa, ya] = at(0.7);
  pen.moveTo(xa, ya);
  pen.quadraticCurveTo(xm + (nx / nl) * w, ym + (ny / nl) * w, x1, y1);
  pen.quadraticCurveTo(xm - (nx / nl) * w * 0.6, ym - (ny / nl) * w * 0.6, xa, ya);
  pen.closePath();
  k.paint('#f4efe2', k.thin);
  pen.beginPath();
  pen.moveTo(x0, y0);
  pen.lineTo(x1, y1);
  pen.strokeStyle = withAlpha('#8a8070', 0.9);
  pen.lineWidth = Math.max(0.6, 0.06 * k.s);
  pen.stroke();
  k.line([tip, [tip[0] + d[0] * 0.7, tip[1] + d[1] * 0.7, tip[2] + d[2] * 0.7]], '#2a2a35', Math.max(0.9, 0.12 * k.s));
}

// ── read: the ledger archive ───────────────────────────────────────────────
// Steel shelving: card drawers below, ledgers bound in leather above, deed
// boxes on top and a brass ladder against it; a lectern beside it with a
// great ledger open under a little lamp. Reading lights the lamp and turns
// the pages.

const SHELF = { u0: 0.3, u1: 10.3, F: 3.4, top: 19.4 };
const TIERS = [6.6, 10.9, 15.2, 19.0];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 21, (k) => {
      const { u0, u1, F, top } = SHELF;
      k.shadow(6.5, 2.4, 7.4, 2.6, 0.32);
      // the carcass and its top
      k.box(u0, 0.05, 0, u1 - u0, F - 0.05, top, C.steelDark, { stripe: false });
      k.box(u0 - 0.2, 0, top, u1 - u0 + 0.4, F + 0.25, 0.5, shade(C.steelDark, 0.08));
      // card drawers: four rows of five, brass label frames and pulls
      const dz = (6.2 - 0.5) / 4;
      const dw = (u1 - u0 - 0.6) / 5;
      const plates: P3[][] = [];
      const pulls: P3[] = [];
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 5; c++) {
          const a = u0 + 0.3 + c * dw;
          const z = 0.5 + r * dz;
          k.rect(a + 0.06, z + 0.06, a + dw - 0.06, z + dz - 0.06, F + 0.01, k.side(C.steel, 0, 1, 0.12), k.thin);
          const m = a + dw / 2;
          plates.push([[m - 0.45, F + 0.02, z + dz * 0.55], [m + 0.45, F + 0.02, z + dz * 0.55], [m + 0.45, F + 0.02, z + dz * 0.85], [m - 0.45, F + 0.02, z + dz * 0.85]]);
          pulls.push([m, F + 0.03, z + dz * 0.3]);
        }
      }
      k.pen.beginPath();
      for (const q of plates) k.trace(q);
      k.paint('#f1e3b8', Math.max(0.6, k.thin * 0.6));
      rivets(k, pulls, C.brass, 0.17);
      // the shelves, dark inside, ledgers on them
      for (let r = 0; r + 1 < TIERS.length; r++) {
        const z0 = TIERS[r];
        const z1 = TIERS[r + 1] - 0.35;
        for (const [bi, [a0, a1]] of [[u0 + 0.3, 5.2], [5.4, u1 - 0.3]].entries()) {
          k.rect(a0, z0, a1, z1, F, k.vgrad(a0, F, z0, z1, [[0, '#1f242c'], [1, '#13161c']]), k.thin);
          const sd = v.seed + r * 7 + bi * 3;
          if (hash(sd, 5) < 0.3) {
            // deed boxes, a lying ledger
            for (let j = 0; j < 2; j++) k.box(a0 + 0.2 + j * 1.75, F - 2.4, z0, 1.6, 2.2, z1 - z0 - 1.2, '#5c6a78', { line: k.thin, stripe: false });
            k.box(a0 + 3.8, F - 2.2, z0, 0.9, 2.0, 0.35, BIND[sd % BIND.length], { line: k.thin, stripe: false });
          } else ledgerRow(k, a0 + 0.1, a1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
          k.line([[a0, F + 0.02, z0], [a1, F + 0.02, z0]], withAlpha(C.steelLight, 0.7), Math.max(0.7, 0.1 * k.s));
        }
      }
      // on top: deed boxes and a rolled plan
      k.box(1.0, 0.7, top + 0.5, 2.4, 2.2, 1.3, '#5c6a78', { line: k.thin });
      k.box(3.6, 0.9, top + 0.5, 2.0, 2.0, 0.9, '#7d2a2e', { line: k.thin });
      k.cyl(7.4, 1.8, top + 0.5, 0.45, 0.9, '#e8dfc8');
      // the ladder against the shelves
      for (const u of [7.6, 9.0]) k.rod([[u, 3.95, 0], [u, 3.55, top - 0.6]], C.brass, 0.2);
      const rungs: Array<[P3, P3]> = [];
      for (let z = 1.6; z < top - 1; z += 1.9) rungs.push([[7.6, 3.95 - z * 0.021, z], [9.0, 3.95 - z * 0.021, z]]);
      k.segs(rungs, INK, Math.max(1.3, 0.14 * k.s + k.lw), 'round');
      k.segs(rungs, C.brass, Math.max(0.8, 0.14 * k.s), 'round');
      // the lectern: a pedestal and a sloped desk with the great ledger
      k.shadow(12.3, 2.2, 1.6, 1.5, 0.28);
      k.cyl(12.3, 2.2, 0, 1.0, 0.3, C.walnut);
      k.box(11.95, 1.85, 0.3, 0.7, 0.7, 5.6, C.walnut);
      const desk: P3[] = [[10.9, 1.0, 6.6], [13.7, 1.0, 6.6], [13.7, 3.4, 5.7], [10.9, 3.4, 5.7]];
      k.poly([[10.9, 3.4, 5.4], [13.7, 3.4, 5.4], [13.7, 3.4, 5.7], [10.9, 3.4, 5.7]], shade(C.walnut, -0.1), k.thin);
      k.poly(desk, C.walnut, k.lw);
      k.poly([on(LEDGER, 0, 0), on(LEDGER, 1, 0), on(LEDGER, 1, 1), on(LEDGER, 0, 1)], C.oxblood, k.thin);
      k.poly([on(LEDGER, 0.04, 0.05), on(LEDGER, 0.5, 0.05), on(LEDGER, 0.5, 0.95), on(LEDGER, 0.04, 0.95)], '#f3ead2', k.thin);
      k.poly([on(LEDGER, 0.5, 0.05), on(LEDGER, 0.96, 0.05), on(LEDGER, 0.96, 0.95), on(LEDGER, 0.5, 0.95)], '#f8f0dc', k.thin);
      if (k.s >= 5) {
        for (let r = 0; r < 6; r++) {
          for (const f0 of [0.1, 0.56]) k.line([on(LEDGER, f0, 0.15 + r * 0.13), on(LEDGER, f0 + 0.3, 0.15 + r * 0.13)], withAlpha('#2a3550', 0.6), Math.max(0.6, 0.05 * k.s));
        }
      }
      // the lamp's arm
      k.rod([[13.4, 1.15, 6.6], [13.4, 1.15, 8.2], [12.9, 1.6, 8.8]], C.brass, 0.12);
    });
    // the lamp: an amber glass cup, lit while someone reads
    const on2 = v.active;
    frustum(k, 12.7, 1.75, 8.1, 0.45, 8.9, 0.75, on2 ? '#ffcf70' : '#a8742e', on2 ? '#fff4cc' : '#7a5422');
    if (on2) {
      k.pool(12.3, 2.2, 1.8, 1.4, '#ffe2a0', 0.55, 6.2);
      k.halo(12.7, 1.8, 8.3, 3.2, '#ffd890', 0.5);
      // a page turning over, right to left
      const ph = (v.t * 0.7) % 1;
      if (ph < 0.5) {
        const a = (ph / 0.5) * Math.PI;
        const spine = (fz: number) => on(LEDGER, 0.5, fz);
        const tip = (fz: number): P3 => {
          const s0 = spine(fz);
          return [s0[0] + Math.cos(a) * 1.25, s0[1], s0[2] + Math.sin(a) * 1.1];
        };
        k.poly([spine(0.07), tip(0.07), tip(0.93), spine(0.93)], '#fbf4e4', k.thin);
      }
    }
  },
};

const BIND: readonly Color[] = ['#7d2a2e', '#2f5a45', '#2c3a5c', '#8a5a32'];
// the open ledger on the lectern's slope
const LEDGER: readonly [P3, P3, P3, P3] = [[11.1, 1.25, 6.62], [13.5, 1.25, 6.62], [13.5, 3.15, 5.83], [11.1, 3.15, 5.83]];

// ── search: the safe being cracked ─────────────────────────────────────────
// A great old safe in bottle green with gold lines, ball feet, a brass
// dial and a spoked handle; beside it a tool trolley: a clamp lamp turned
// on the dial, a crowbar, a drill and a toolbox. Worked, the dial spins
// back and forth under the lamp, the safecracker's hand on it (see
// npcs.ts: he stands before the door's hinge side). `SAFE`: its body;
// `DIAL`: the dial's middle on the door.

export const SAFE = { u0: 0.6, u1: 7.0, v0: 0.4, v1: 3.7, z0: 0.7, z1: 10.2 };
export const DIAL: P3 = [3.8, SAFE.v1 + 0.02, 6.2];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, v0, v1, z0, z1 } = SAFE;
    const green = '#2f4c42';
    const k = still(v, 'search', 13, (k) => {
      k.shadow(5.8, 2.2, 6.6, 2.6, 0.32);
      // ball feet, the plinth, the body, the cap
      for (const [u, w] of [[u0 + 0.6, v0 + 0.5], [u1 - 0.6, v0 + 0.5], [u0 + 0.6, v1 - 0.5], [u1 - 0.6, v1 - 0.5]] as const) k.cyl(u, w, 0, 0.42, 0.75, C.brassDark, { top: C.brass });
      k.box(u0 - 0.15, v0 - 0.15, z0, u1 - u0 + 0.3, v1 - v0 + 0.3, 0.8, shade(green, -0.2), { stripe: false });
      k.box(u0, v0, z0 + 0.8, u1 - u0, v1 - v0, z1 - z0 - 1.4, green, { round: 0.12 });
      k.box(u0 - 0.15, v0 - 0.15, z1 - 0.6, u1 - u0 + 0.3, v1 - v0 + 0.3, 0.7, shade(green, -0.2));
      // the door: an inset panel with gold lines and corner flourishes
      const F = v1 + 0.01;
      const [d0, d1, e0, e1] = [u0 + 0.55, u1 - 0.55, z0 + 1.4, z1 - 1.2];
      k.rect(d0, e0, d1, e1, F, k.side(shade(green, 0.05), 0, 1, 0.12), k.thin);
      const g = (i: number) => 0.28 + i * 0.22;
      for (const i of [0, 1]) k.line([[d0 + g(i), F + 0.01, e0 + g(i)], [d1 - g(i), F + 0.01, e0 + g(i)], [d1 - g(i), F + 0.01, e1 - g(i)], [d0 + g(i), F + 0.01, e1 - g(i)], [d0 + g(i), F + 0.01, e0 + g(i)]], i ? withAlpha(C.gold, 0.55) : C.gold, Math.max(0.7, (i ? 0.05 : 0.08) * k.s));
      if (k.s >= 5) {
        for (const [a, z] of [[d0 + 0.75, e0 + 0.75], [d1 - 0.75, e0 + 0.75], [d0 + 0.75, e1 - 0.75], [d1 - 0.75, e1 - 0.75]] as const) {
          k.face(a, F + 0.02, z, 0.22, C.gold, 0, 10);
        }
      }
      // a painted vignette at the top: a sky over green hills
      const vz = e1 - 1.5;
      const vig = circle(3.8, F + 0.02, vz, 1, 20).map(([a, n, z]): P3 => [3.8 + (a - 3.8) * 1.5, n, vz + (z - vz) * 0.75]);
      k.poly(vig, k.vgrad(3.8, F, vz - 0.8, vz + 0.8, [[0, '#6f9a5a'], [0.45, '#9ab88a'], [0.5, '#e8d9b0'], [1, '#c8d8e0']]), k.thin);
      k.pen.save();
      k.pen.beginPath();
      k.trace(vig);
      k.pen.clip();
      k.poly([[2.0, F + 0.03, vz - 1], [2.6, F + 0.03, vz - 0.1], [3.4, F + 0.03, vz - 0.35], [4.4, F + 0.03, vz + 0.15], [5.6, F + 0.03, vz - 0.3], [5.6, F + 0.03, vz - 1]], '#4f7a48', 0);
      k.pen.restore();
      k.pen.beginPath();
      k.trace(vig);
      k.paint(null, k.thin);
      k.pen.beginPath();
      k.trace(vig.map(([a, n, z]): P3 => [3.8 + (a - 3.8) * 1.12, n, vz + (z - vz) * 1.12]));
      k.paint(null, Math.max(0.7, 0.08 * k.s), C.gold);
      // hinges on the door's left, a keyhole escutcheon, a name plate
      for (const z of [e0 + 1.0, e1 - 1.4]) k.cyl(d0 - 0.05, F, z, 0.24, 1.0, C.brass, { line: k.thin });
      k.poly([[5.5, F + 0.02, 3.6], [6.0, F + 0.02, 3.6], [6.0, F + 0.02, 4.6], [5.5, F + 0.02, 4.6]], C.brass, k.thin, 0.1);
      k.face(5.75, F + 0.03, 4.25, 0.1, INK, 0, 8);
      k.box(2.6, v1 - 0.1, z1 - 0.45, 2.4, 0.3, 0.42, C.brass, { line: k.thin, stripe: false });
      // the handle: a hub and three spokes with ball ends
      const hz = 3.4;
      for (let i = 0; i < 3; i++) {
        const th = (i / 3) * Math.PI * 2 + 0.4;
        const e: P3 = [3.8 + Math.cos(th) * 1.0, F + 0.3, hz + Math.sin(th) * 1.0];
        k.rod([[3.8, F + 0.3, hz], e], C.brass, 0.18);
        const [x, y] = k.p(...e);
        k.pen.beginPath();
        k.pen.arc(x, y, Math.max(1.2, 0.22 * k.s), 0, Math.PI * 2);
        k.paint(C.brassLight, k.thin);
      }
      k.face(3.8, F + 0.32, hz, 0.38, C.brass, k.thin, 14);
      // the trolley: casters, legs, two shelves
      const [t0, t1, w0, w1] = [7.9, 11.6, 0.7, 3.5];
      for (const [u, w] of [[t0 + 0.2, w0 + 0.2], [t1 - 0.2, w0 + 0.2], [t0 + 0.2, w1 - 0.2], [t1 - 0.2, w1 - 0.2]] as const) {
        k.disc(u, w, 0.25, 0.25, INK, 0);
        k.rod([[u, w, 0.4], [u, w, 5.0]], C.steelLight, 0.12);
      }
      k.box(t0, w0, 1.1, t1 - t0, w1 - w0, 0.25, C.steel, { line: k.thin });
      // the toolbox and the drill below
      k.box(t0 + 0.3, w0 + 0.5, 1.35, 1.9, 1.5, 1.1, C.red, { line: k.thin });
      k.rod([[t0 + 0.8, w0 + 1.25, 2.45], [t0 + 0.8, w0 + 1.25, 2.85], [t0 + 1.7, w0 + 1.25, 2.85], [t0 + 1.7, w0 + 1.25, 2.45]], C.iron, 0.1);
      k.box(t0 + 2.4, w0 + 0.9, 1.35, 1.0, 1.4, 0.7, '#e09a2a', { line: k.thin, round: 0.15 });
      k.rod([[t0 + 2.9, w0 + 2.3, 1.75], [t0 + 2.9, w0 + 2.8, 1.75]], C.chrome, 0.1);
      k.box(t0, w0, 4.75, t1 - t0, w1 - w0, 0.25, C.steel, { line: k.thin });
      // on top: a crowbar, a pad of figures and a torch (the stethoscope
      // is round the safecracker's neck: see npcs.ts)
      const tz = 5.0;
      k.rod([[t0 + 0.6, w0 + 0.7, tz + 0.1], [t1 - 0.6, w1 - 0.6, tz + 0.1]], C.red, 0.16);
      k.poly([[t0 + 1.6, w0 + 0.3, tz + 0.02], [t0 + 2.9, w0 + 0.3, tz + 0.02], [t0 + 2.9, w0 + 1.4, tz + 0.02], [t0 + 1.6, w0 + 1.4, tz + 0.02]], C.paper, k.thin);
      if (k.s >= 5) for (let r = 0; r < 3; r++) k.line(script(t0 + 1.8, t0 + 2.6, w0 + 0.55 + r * 0.3, tz + 0.03, r + 50), withAlpha('#2a3550', 0.7), Math.max(0.6, 0.05 * k.s));
      k.rod([[t0 + 1.0, w1 - 0.7, tz + 0.2], [t0 + 2.2, w1 - 0.9, tz + 0.2]], '#2a2a30', 0.3);
      k.rod([[t0 + 2.2, w1 - 0.9, tz + 0.2], [t0 + 2.6, w1 - 0.95, tz + 0.2]], C.chrome, 0.42);
      // the clamp lamp's post on the trolley's corner
      k.rod([[t0 + 0.4, w0 + 0.4, tz], [t0 + 0.4, w0 + 0.4, 8.6], [t0 - 0.2, w0 + 1.4, 9.0]], C.steelDark, 0.12);
    });
    // the clamp lamp's shade, turned on the dial
    const lc: P3 = [7.3, 2.3, 9.0];
    const dir: P3 = [-0.75, 0.35, -0.45];
    const lit = v.active;
    const rim = ring(k, [lc[0] + dir[0] * 0.9, lc[1] + dir[1] * 0.9, lc[2] + dir[2] * 0.9], dir, 0.75, 16);
    const back = ring(k, lc, dir, 0.3, 12);
    fillPts(k, hull([...rim, ...back]), across(k, hull([...rim, ...back]), '#3f6b55'), k.lw);
    fillPts(k, rim, lit ? '#fff4cc' : '#2a2f28', k.thin);
    if (lit) {
      k.wash(4.6, v1 + 0.05, 6.4, 2.8, 2.6, '#ffe7b0', 0.42);
      k.halo(lc[0] + dir[0] * 1.0, lc[1] + dir[1] * 1.0, lc[2] + dir[2] * 1.0, 2.2, '#ffe2a0', 0.5);
    }
    // the dial: worked back and forth, a pause at each number
    const t = v.t;
    const step = Math.floor(t * 1.3);
    const turn = lit ? hash(step, 3) * 6.28 + (hash(step, 4) - 0.5) * 1.6 * Math.min(1, (t * 1.3 - step) * 3) : 0.7;
    dial(k, DIAL[0], DIAL[1], DIAL[2], 1.25, turn, '#efe6cf', C.brass);
    // the pointer mark over the dial
    k.poly([[DIAL[0] - 0.15, DIAL[1] + 0.02, DIAL[2] + 1.4], [DIAL[0] + 0.15, DIAL[1] + 0.02, DIAL[2] + 1.4], [DIAL[0], DIAL[1] + 0.02, DIAL[2] + 1.15]], C.gold, Math.max(0.6, k.thin * 0.6));
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // a click found now and then: a glint off the dial
    const n = due(v.t, dt, 0.7, v.seed);
    for (let i = 0; i < n; i++) spawn({ kind: 'glint', x: DIAL[0] + 0.9, y: DIAL[1] + 0.3, z: DIAL[2] + 0.9, vx: 0.2, vy: 0.3, vz: 0.8, life: 0.6, color: [255, 236, 170], glow: true, gravity: 0 });
  },
};

// ── run: the foundry ────────────────────────────────────────────────────────
// A brick furnace with its fire showing and a chimney, a ladle hung on a
// frame over a table of ingot moulds, finished bars stacked on a pallet.
// Running tips the ladle and pours molten gold into the moulds, the fire
// roars and embers fly.

const LADLE = { u: 7.6, v: 4.4, z: 6.4 }; // the pivot
const MOULDS = [6.0, 7.6, 9.2];
const TABLE = { u0: 4.8, u1: 10.4, v0: 5.5, v1: 8.1, z: 2.3 };

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 15, (k) => {
      k.shadow(5.5, 5.2, 6.4, 6.0, 0.32);
      // the furnace: brick in an iron frame, the fire mouth on its front
      const brick = '#8f4a35';
      k.box(0.6, 0.6, 0, 4.6, 4.0, 5.4, brick);
      const F = 4.61;
      bricks(k, 0.6, 5.2, F, 0, 5.4);
      for (const u of [0.6, 5.2]) k.box(u - 0.2, 4.4, 0, 0.4, 0.4, 5.6, C.iron, { line: k.thin });
      k.box(0.4, 0.4, 5.4, 5.0, 4.4, 0.5, C.iron);
      const mouth = arch(2.9, F + 0.02, 0.6, 3.6, 1.2);
      k.poly(mouth, k.vgrad(2.9, F, 0.6, 3.6, [[0, '#ffd27a'], [0.5, '#ff8a2a'], [1, '#a8361c']]), k.thin);
      // the chimney with a cap
      k.cyl(2.2, 2.0, 5.9, 0.8, 8.4, C.gunmetal);
      k.cyl(2.2, 2.0, 14.0, 1.05, 0.4, C.iron);
      for (const z of [8.0, 11.0]) k.cyl(2.2, 2.0, z, 0.85, 0.3, C.iron, { line: k.thin });
      // the ladle's frame: two posts and a crossbar at the back
      for (const u of [5.6, 9.6]) {
        k.box(u - 0.25, LADLE.v - 0.25, 0, 0.5, 0.5, LADLE.z + 0.6, C.steelDark, { line: k.thin });
      }
      k.box(5.35, LADLE.v - 0.25, LADLE.z + 0.6, 4.5, 0.5, 0.45, C.steelDark, { line: k.thin });
      // the mould table, its moulds
      const { u0, u1, v0, v1, z } = TABLE;
      for (const [u, w] of [[u0 + 0.3, v0 + 0.3], [u1 - 0.6, v0 + 0.3], [u0 + 0.3, v1 - 0.6], [u1 - 0.6, v1 - 0.6]] as const) k.box(u, w, 0, 0.3, 0.3, z - 0.4, C.iron, { line: k.thin });
      k.box(u0, v0, z - 0.4, u1 - u0, v1 - v0, 0.4, C.gunmetal);
      for (const m of MOULDS) {
        k.box(m - 0.75, v0 + 0.6, z, 1.5, 1.6, 0.35, C.iron, { line: k.thin });
        k.poly([[m - 0.55, v0 + 0.8, z + 0.36], [m + 0.55, v0 + 0.8, z + 0.36], [m + 0.45, v0 + 2.0, z + 0.36], [m - 0.45, v0 + 2.0, z + 0.36]], '#15181d', 0);
      }
      // the pallet of bars at the front, a quench bucket by the table
      k.cyl(u1 - 0.2, v1 + 1.3, 0, 0.75, 1.3, C.steel);
      k.disc(u1 - 0.2, v1 + 1.3, 1.2, 0.6, '#3a5a6a', 0);
      k.box(0.8, 6.1, 0, 3.6, 3.4, 0.45, C.walnut, { line: k.thin, stripe: false });
      barStack(k, 0.95, 6.25, 0.45, 2, 3, 3, 1.6, 0.95, 0.5);
    });
    const act = v.active;
    const t = v.t;
    // the fire in the mouth
    const roar = act ? 0.55 + 0.25 * Math.sin(t * 9.3) * Math.sin(t * 5.1 + 1) : 0.25;
    k.halo(2.9, 4.8, 1.6, act ? 3.6 : 2.6, '#ff8a2a', roar + 0.1);
    flamelets(k, 2.9, 4.64, 0.7, act ? 1 : 0.6, act ? t : 0.4);
    // the moulds: cooled gold, or filling with molten
    const { v0, z } = TABLE;
    const pour = act ? Math.floor(t * 0.5) % MOULDS.length : -1;
    for (const [i, m] of MOULDS.entries()) {
      const pts: P3[] = [[m - 0.5, v0 + 0.85, z + 0.37], [m + 0.5, v0 + 0.85, z + 0.37], [m + 0.42, v0 + 1.95, z + 0.37], [m - 0.42, v0 + 1.95, z + 0.37]];
      if (i === pour) {
        k.poly(pts, k.grad(pts[0], pts[2], [[0, '#fff6c0'], [0.5, '#ffc040'], [1, '#ff8a20']]), 0);
        k.halo(m, v0 + 1.4, z + 0.5, 2.2, '#ffb040', 0.55);
      } else if (act && (i + MOULDS.length - pour) % MOULDS.length === 1) k.poly(pts, k.grad(pts[0], pts[2], [[0, '#ffd27a'], [1, '#d8781e']]), 0);
      else k.poly(pts, k.grad(pts[0], pts[2], [[0, C.goldLight], [1, C.goldDeep]]), 0);
    }
    // the ladle: upright, or tipped to pour over the mould
    const tip = act ? 0.8 + 0.06 * Math.sin(t * 3.1) : 0;
    const mu = act ? MOULDS[pour] : LADLE.u;
    ladle(k, act ? mu : LADLE.u, tip);
    if (act) {
      // the stream from the lip down into the mould
      const lip = rot(0, 1.25, 1.15, tip);
      const top: P3 = [mu, LADLE.v + lip[1], LADLE.z + lip[2]];
      const pts: P3[] = [];
      for (let i = 0; i <= 6; i++) {
        const f = i / 6;
        pts.push([mu + Math.sin(t * 17 + i) * 0.04, top[1] + (v0 + 1.3 - top[1]) * Math.sqrt(f), top[2] + (z + 0.4 - top[2]) * f]);
      }
      k.line(pts, '#ff8a20', Math.max(1.6, 0.42 * k.s));
      k.line(pts, '#fff2b0', Math.max(0.8, 0.18 * k.s));
      k.halo(mu, (top[1] + v0 + 1.3) / 2, (top[2] + z) / 2, 2.4, '#ffb040', 0.35);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    // smoke from the chimney, embers while pouring
    if (due(v.t, dt, v.active ? 1.6 : 0.5, v.seed)) spawn({ ...wisp(2.2, 2.0, 14.6, Math.floor(v.t * 10), 0, [150, 150, 156], 0.6), kind: 'smoke', vz: 2.6 });
    if (!v.active) return;
    const n = due(v.t, dt, 7, v.seed + 1);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      const m = MOULDS[Math.floor(v.t * 0.5) % MOULDS.length];
      spawn({ kind: 'ember', x: m + j(1), y: TABLE.v0 + 1.4 + j(2), z: TABLE.z + 0.6, vx: j(3) * 2, vy: j(4) * 2, vz: 3 + j(5) * 3, life: 0.8 + j(6) * 0.4, color: [255, 176, 64], glow: true, gravity: 2 });
    }
  },
};

// A point (x across, y out, h up) of the ladle's frame tipped by `a` about
// its pivot's axis (along u): the mouth turns toward +v.
function rot(x: number, y: number, h: number, a: number): P3 {
  return [x, y * Math.cos(a) + h * Math.sin(a), -y * Math.sin(a) + h * Math.cos(a)];
}

// The ladle: a steel pot on trunnions at the pivot, tipped by `a`, molten
// gold in its mouth.
function ladle(k: Kit, u: number, a: number): void {
  const P = (x: number, y: number, h: number): P3 => {
    const q = rot(x, y, h, a);
    return [u + q[0], LADLE.v + q[1], LADLE.z + q[2]];
  };
  const axis = rot(0, 0, 1, a);
  const n: P3 = [axis[0], axis[1], axis[2]];
  const bot = ring(k, P(0, 0, -1.6), n, 0.95, 20);
  const top = ring(k, P(0, 0, 0.6), n, 1.3, 24);
  const sil = hull([...bot, ...top]);
  // the trunnions and the hanger arms to the frame
  for (const sd of [-1, 1]) k.rod([[u + sd * 1.25, LADLE.v, LADLE.z], [u + sd * 1.6, LADLE.v, LADLE.z], [u + sd * 1.6, LADLE.v, LADLE.z + 0.7]], C.steelDark, 0.22);
  fillPts(k, sil, across(k, sil, '#5d6672'), k.lw);
  const mouth = ring(k, P(0, 0, 0.6), n, 1.3, 24);
  fillPts(k, mouth, '#2a2420', k.thin);
  const melt = ring(k, P(0, 0, 0.45), n, 1.12, 20);
  fillPts(k, melt, '#ffc040', 0);
  const hot = ring(k, P(-0.25, -0.2, 0.47), n, 0.6, 14);
  fillPts(k, hot, '#fff2b0', 0);
  // the rim band
  const rim = ring(k, P(0, 0, 0.15), n, 1.24, 24);
  k.pen.beginPath();
  rim.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.pen.strokeStyle = withAlpha(INK, 0.6);
  k.pen.lineWidth = Math.max(0.7, k.thin * 0.7);
  k.pen.stroke();
  // the pouring lip
  const [lx, ly] = k.p(...P(0, 1.35, 0.62));
  k.pen.beginPath();
  k.pen.arc(lx, ly, Math.max(1, 0.25 * k.s), 0, Math.PI * 2);
  k.paint('#5d6672', k.thin);
  k.halo(u, LADLE.v + rot(0, 0, 0.5, a)[1], LADLE.z + 0.8, 2.0, '#ffb040', 0.35);
}

// Courses of brick across a face (mortar lines).
function bricks(k: Kit, a0: number, a1: number, n: number, z0: number, z1: number): void {
  const seg: Array<[P3, P3]> = [];
  for (let z = z0 + 0.7, r = 0; z < z1 - 0.1; z += 0.7, r++) {
    seg.push([[a0, n, z], [a1, n, z]]);
    for (let a = a0 + (r & 1 ? 0.8 : 0.1); a < a1; a += 1.5) seg.push([[a, n, z], [a, n, z + 0.7]]);
  }
  k.segs(seg, withAlpha('#d8b8a0', 0.45), Math.max(0.6, 0.08 * k.s));
}

// An arch on the plane v = n: a0 centre, z0 sill, z1 crown, w half width.
function arch(a: number, n: number, z0: number, z1: number, w: number): P3[] {
  const spring = z1 - w;
  const pts: P3[] = [[a - w, n, z0], [a + w, n, z0], [a + w, n, spring]];
  for (let i = 1; i < 10; i++) {
    const th = (i / 10) * Math.PI;
    pts.push([a + Math.cos(th) * w, n, spring + Math.sin(th) * w]);
  }
  pts.push([a - w, n, spring]);
  return pts;
}

// Flames in an arched mouth on the plane v = n.
function flamelets(k: Kit, a: number, n: number, z: number, scale: number, phase: number): void {
  const tongue = (du: number, w: number, h: number, sway: number, c: Color) => {
    k.poly([[a + du - w, n, z], [a + du - w * 0.7, n, z + h * 0.5], [a + du + sway, n, z + h], [a + du + w * 0.7, n, z + h * 0.5], [a + du + w, n, z]], c, 0, 0.3);
  };
  const sw = (i: number) => Math.sin(phase * 7.1 + i * 1.9) * 0.2 * scale;
  tongue(-0.5, 0.45, 1.6 * scale, sw(0), '#ff7a24');
  tongue(0.5, 0.45, 1.4 * scale, sw(1), '#ff7a24');
  tongue(0, 0.6, 2.1 * scale, sw(2), '#ffb83a');
  tongue(0, 0.3, 1.2 * scale, sw(3), '#fff0b0');
}

// ── web: the watch desk ─────────────────────────────────────────────────────
// A steel console with a bank of four camera monitors in a frame, a panel
// of switches and lamps, a red telephone and a mug, a chair before it.
// Watching wakes the screens: the feeds change and a roll runs down them.

const SCREENS: ReadonlyArray<readonly [number, number]> = [[1.0, 6.4], [4.6, 6.4], [1.0, 9.4], [4.6, 9.4]]; // u0, z0 of each monitor
const MON = { w: 3.4, h: 2.9, v0: 1.0, d: 2.6 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 13, (k) => {
      k.shadow(4.5, 4.4, 4.8, 4.6, 0.32);
      // the console: a cabinet, a sloped panel, the monitors' frame
      k.box(0.6, 0.6, 0, 7.8, 4.8, 4.0, C.steelDark, { stripe: false });
      for (const u of [0.9, 4.6]) k.rect(u, 0.5, u + 3.4, 3.6, 5.41, k.side(shade(C.steelDark, 0.06), 0, 1, 0.12), k.thin);
      k.rod([[2.2, 5.5, 2.4], [3.0, 5.5, 2.4]], C.chrome, 0.1);
      k.rod([[5.9, 5.5, 2.4], [6.7, 5.5, 2.4]], C.chrome, 0.1);
      k.box(0.5, 0.5, 4.0, 8.0, 5.0, 0.4, C.gunmetal);
      const panel: readonly [P3, P3, P3, P3] = [[1.0, 3.6, 4.41], [8.0, 3.6, 4.41], [8.0, 5.3, 4.41], [1.0, 5.3, 4.41]];
      k.poly([...panel], '#2c323b', k.thin);
      const lamps: Array<[Color, P3[]]> = [['#ff6a50', []], ['#7fe08a', []], ['#ffd060', []]];
      for (let i = 0; i < 12; i++) lamps[i % 3][1].push(on(panel, 0.06 + (i % 6) * 0.08, i < 6 ? 0.25 : 0.55));
      for (const [c, pts] of lamps) rivets(k, pts, c, 0.13);
      const sw: Array<[P3, P3]> = [];
      for (let i = 0; i < 6; i++) {
        const p = on(panel, 0.6 + i * 0.065, 0.45);
        sw.push([p, [p[0], p[1] - 0.15, p[2] + 0.35]]);
      }
      k.segs(sw, C.chrome, Math.max(0.8, 0.1 * k.s), 'round');
      // the red telephone and a mug
      k.box(6.6, 1.5, 4.4, 1.4, 1.3, 0.5, C.red, { round: 0.2, line: k.thin });
      k.rod([[6.5, 1.6, 5.0], [6.7, 2.2, 5.3], [8.0, 2.2, 5.3], [8.1, 1.6, 5.0]], C.red, 0.28);
      k.cyl(1.6, 2.0, 4.4, 0.4, 0.75, '#e8e2d2');
      // the monitors' frame
      k.box(0.6, 0.6, 4.4, 7.8, 0.5, 8.4, C.iron, { stripe: false, line: k.thin });
      for (const [u0, z0] of SCREENS) {
        k.box(u0, MON.v0, z0 - 0.2, MON.w, MON.d, MON.h, '#454c56', { round: 0.2 });
        k.rect(u0 + 0.22, z0, u0 + MON.w - 0.22, z0 + MON.h - 0.42, MON.v0 + MON.d + 0.01, '#1a1f22', k.thin);
      }
      // the chair before the desk
      chair(k, 4.5, 7.4, -Math.PI / 2 + 0.2, '#2f3a4a');
    });
    // the feeds
    const act = v.active;
    const t = v.t;
    const flip = act ? Math.floor(t / 1.8) : 0;
    SCREENS.forEach(([u0, z0], i) => {
      const n = MON.v0 + MON.d + 0.02;
      const q: readonly [P3, P3, P3, P3] = [[u0 + 0.32, n, z0 + 0.1], [u0 + MON.w - 0.32, n, z0 + 0.1], [u0 + MON.w - 0.32, n, z0 + MON.h - 0.52], [u0 + 0.32, n, z0 + MON.h - 0.52]];
      feed(k, q, (i + flip * (i === (flip & 3) ? 1 : 0) + (act ? flip : 0)) % 4, act);
      if (act) {
        const r = (t * 0.6 + i * 0.27) % 1;
        k.poly([on(q, 0, r), on(q, 1, r), on(q, 1, Math.min(1, r + 0.08)), on(q, 0, Math.min(1, r + 0.08))], '#ffffff1c', 0);
      }
    });
    // the recording light
    if (act && Math.floor(t * 1.5) % 2 === 0) {
      const p: P3 = [8.0, MON.v0 + MON.d + 0.05, 12.0];
      k.halo(...p, 1.0, '#ff4a3a', 0.6);
      const [x, y] = k.p(...p);
      k.pen.beginPath();
      k.pen.arc(x, y, Math.max(1, 0.18 * k.s), 0, Math.PI * 2);
      k.pen.fillStyle = '#ffb0a0';
      k.pen.fill();
    }
    if (act) k.halo(4.5, 4.0, 9.4, 5, '#a6e8c8', 0.18);
  },
};

// A camera's view in green phosphor on a screen quad: a corridor, the
// door, the gold, a stair.
function feed(k: Kit, q: readonly [P3, P3, P3, P3], kind: number, on2: boolean): void {
  const bg = on2 ? '#20403a' : '#18302c';
  const fg = on2 ? '#a6e8c8' : '#6fa898';
  const mid = on2 ? '#5f9c88' : '#3f6c60';
  k.poly([...q], bg, 0);
  const P = (fu: number, fz: number) => on(q, fu, fz);
  if (kind === 0) {
    // a corridor: floor, walls running to a lit far door
    k.poly([P(0, 0), P(1, 0), P(0.62, 0.42), P(0.38, 0.42)], mid, 0);
    k.poly([P(0.4, 0.42), P(0.6, 0.42), P(0.6, 0.78), P(0.4, 0.78)], fg, 0);
    k.line([P(0, 1), P(0.38, 0.8), P(0.38, 0.42), P(0, 0)], fg, Math.max(0.6, 0.05 * k.s));
    k.line([P(1, 1), P(0.62, 0.8), P(0.62, 0.42), P(1, 0)], fg, Math.max(0.6, 0.05 * k.s));
  } else if (kind === 1) {
    // the round door
    k.poly([P(0, 0), P(1, 0), P(1, 0.25), P(0, 0.25)], mid, 0);
    const c = P(0.5, 0.52);
    const pts: P3[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      pts.push(P(0.5 + Math.cos(a) * 0.22, 0.52 + Math.sin(a) * 0.38));
    }
    k.poly(pts, fg, 0);
    k.poly(pts.map(([u, n, z]): P3 => [c[0] + (u - c[0]) * 0.55, n, c[2] + (z - c[2]) * 0.55]), bg, 0);
  } else if (kind === 2) {
    // stacked gold in a cage
    k.poly([P(0, 0), P(1, 0), P(1, 0.2), P(0, 0.2)], mid, 0);
    for (let r = 0; r < 3; r++) for (let i = 0; i < 3 - r; i++) {
      const u = 0.25 + r * 0.08 + i * 0.17;
      const zz = 0.2 + r * 0.14;
      k.poly([P(u, zz), P(u + 0.15, zz), P(u + 0.13, zz + 0.12), P(u + 0.02, zz + 0.12)], fg, 0);
    }
    const bars: Array<[P3, P3]> = [];
    for (let i = 1; i < 8; i++) bars.push([P(i / 8, 0), P(i / 8, 1)]);
    k.segs(bars, withAlpha(fg, 0.7), Math.max(0.6, 0.05 * k.s));
  } else {
    // a stair going down, a figure on it
    for (let i = 0; i < 5; i++) k.poly([P(0.1 + i * 0.16, 0), P(1, 0), P(1, 0.15 + i * 0.15), P(0.1 + i * 0.16, 0.15 + i * 0.15)], i & 1 ? mid : shade(mid, -0.15), 0);
    k.poly([P(0.3, 0.42), P(0.38, 0.42), P(0.38, 0.62), P(0.3, 0.62)], fg, 0);
    k.poly([P(0.31, 0.64), P(0.37, 0.64), P(0.37, 0.72), P(0.31, 0.72)], fg, 0);
  }
  // scanlines
  if (k.s >= 6) {
    const lines: Array<[P3, P3]> = [];
    for (let i = 1; i < 10; i++) lines.push([P(0, i / 10), P(1, i / 10)]);
    k.segs(lines, '#00000030', Math.max(0.5, 0.04 * k.s));
  }
  k.poly([P(0.06, 0.94), P(0.3, 0.94), P(0.18, 0.62)], '#ffffff12', 0);
}

// ── think: the planning table ───────────────────────────────────────────────
// A big table spread with blueprints of the vault (a round door, the rooms,
// a dotted way through), weighted with a mug, a gold bar and dividers; an
// architect's lamp over it and a pin board of photographs tied with red
// string on an easel. Thinking draws a red line along the plan under the
// lamp.

const PLAN: readonly [P3, P3, P3, P3] = [[1.6, 1.5, 5.62], [7.6, 1.5, 5.62], [7.6, 5.3, 5.62], [1.6, 5.3, 5.62]];

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'think', 14, (k) => {
      k.shadow(5.8, 3.5, 6.2, 3.7, 0.32);
      // the pin board on its easel, at the end
      const ez = 3.0;
      k.rod([[10.0, 0.9, 0], [10.4, 1.6, 12.4]], C.walnut, 0.22);
      k.rod([[11.9, 0.9, 0], [11.5, 1.6, 12.4]], C.walnut, 0.22);
      k.rod([[11.0, 0.2, 0], [11.0, 1.4, 11.0]], C.walnut, 0.2);
      const board: readonly [P3, P3, P3, P3] = [[9.3, 1.9, ez + 4.0], [12.4, 1.9, ez + 4.0], [12.4, 1.55, ez + 9.0], [9.3, 1.55, ez + 9.0]];
      k.poly([[9.3, 1.9, ez + 3.6], [12.4, 1.9, ez + 3.6], [12.4, 2.2, ez + 3.6], [9.3, 2.2, ez + 3.6]], C.walnut, k.thin);
      k.poly([...board], C.walnut, k.lw);
      const cork: readonly [P3, P3, P3, P3] = [on(board, 0.06, 0.05), on(board, 0.94, 0.05), on(board, 0.94, 0.95), on(board, 0.06, 0.95)];
      k.poly([...cork], '#c89a62', k.thin);
      const pins: P3[] = [];
      const cards: Array<[number, number, Color]> = [[0.12, 0.6, '#f3ead6'], [0.5, 0.68, '#e8e2d2'], [0.2, 0.18, '#f3ead6'], [0.6, 0.22, '#f6e6a0'], [0.72, 0.5, '#f3ead6']];
      for (const [fu, fz, c] of cards) {
        k.poly([on(cork, fu, fz), on(cork, fu + 0.26, fz), on(cork, fu + 0.26, fz + 0.26), on(cork, fu, fz + 0.26)], c, Math.max(0.7, k.thin * 0.7));
        if (c !== '#f6e6a0') k.poly([on(cork, fu + 0.04, fz + 0.04), on(cork, fu + 0.22, fz + 0.04), on(cork, fu + 0.22, fz + 0.2), on(cork, fu + 0.04, fz + 0.2)], '#5c6a78', 0);
        pins.push(on(cork, fu + 0.13, fz + 0.24));
      }
      k.line([pins[0], pins[1], pins[4], pins[3], pins[2], pins[0]], '#d23a32', Math.max(0.7, 0.07 * k.s));
      rivets(k, pins, '#ff4a3a', 0.12);
      // the table
      for (const [u, w] of [[1.1, 1.1], [8.3, 1.1], [1.1, 5.4], [8.3, 5.4]] as const) k.box(u, w, 0, 0.5, 0.5, 5.0, C.walnut, { line: k.thin });
      for (const w of [1.25, 5.55]) k.box(1.6, w, 1.2, 6.7, 0.2, 0.3, shade(C.walnut, -0.1), { line: k.thin, stripe: false });
      k.box(1.25, 1.6, 1.2, 0.2, 3.9, 0.3, shade(C.walnut, -0.1), { line: k.thin, stripe: false });
      k.box(0.8, 0.8, 5.0, 8.4, 5.4, 0.6, C.walnut);
      // the plans: one under, one on top, a roll
      k.poly([[2.4, 1.1, 5.61], [8.6, 1.4, 5.61], [8.4, 4.4, 5.61], [2.2, 4.1, 5.61]], '#3a6aa8', k.thin);
      k.poly([...PLAN], C.blueprint, k.thin);
      blueprint(k);
      k.rod([[1.2, 5.7, 5.85], [4.6, 5.9, 5.85]], '#e8dfc8', 0.4);
      k.disc(1.2, 5.7, 5.85, 0.2, '#d8cdb0', k.thin);
      // weights: a mug, a gold bar, the dividers
      k.cyl(7.9, 4.8, 5.6, 0.45, 0.8, '#e8e2d2');
      k.disc(7.9, 4.8, 6.39, 0.35, '#5a3a22', 0);
      goldBar(k, 1.9, 1.7, 5.62, 1.4, 0.7, 0.4);
      k.rod([[5.2, 4.2, 5.7], [5.6, 3.6, 6.4], [6.3, 4.0, 5.7]], C.chrome, 0.08);
      // the lamp's clamp and arm
      k.box(0.9, 2.6, 5.3, 0.6, 0.6, 0.8, C.steelDark, { line: k.thin });
      k.rod([[1.2, 2.9, 6.1], [1.5, 2.9, 9.6], [3.6, 3.2, 10.6]], C.steelDark, 0.14);
    });
    // the lamp's shade over the plan
    const act = v.active;
    const head: P3 = [3.6, 3.2, 10.6];
    const dir: P3 = [0.35, 0.1, -1];
    const rim = ring(k, [head[0] + dir[0] * 1.2, head[1] + dir[1] * 1.2, head[2] + dir[2] * 1.2], dir, 0.95, 18);
    const back = ring(k, head, dir, 0.35, 12);
    const sil = hull([...rim, ...back]);
    fillPts(k, sil, across(k, sil, C.steelLight), k.lw);
    fillPts(k, rim, act ? '#fff4cc' : '#e6d6a8', k.thin);
    k.pool(4.4, 3.4, 2.8, 2.0, '#ffe2a0', act ? 0.45 : 0.22, 5.65);
    k.halo(head[0] + 0.4, head[1], head[2] - 1.4, 2.6, '#ffe2a0', act ? 0.45 : 0.25);
    if (!act) return;
    // the red route being drawn across the plan, the pencil at its end
    const f = (v.t * 0.25) % 1;
    const route: Array<[number, number]> = [[0.1, 0.85], [0.3, 0.85], [0.3, 0.55], [0.55, 0.55], [0.55, 0.25], [0.85, 0.25]];
    const pts: P3[] = [];
    const total = route.length - 1;
    const upto = f * total;
    for (let i = 0; i <= Math.floor(upto); i++) pts.push(on(PLAN, route[i][0], route[i][1]));
    const i = Math.min(total - 1, Math.floor(upto));
    const g = upto - i;
    const end = on(PLAN, route[i][0] + (route[i + 1][0] - route[i][0]) * g, route[i][1] + (route[i + 1][1] - route[i][1]) * g);
    pts.push(end);
    k.line(pts.map(([a, b, c]): P3 => [a, b, c + 0.02]), '#ff5a4a', Math.max(1, 0.14 * k.s));
    k.rod([[end[0], end[1], end[2] + 0.05], [end[0] + 0.5, end[1] + 0.6, end[2] + 1.6]], '#e0a020', 0.12);
  },
};

// The vault in plan, white on blue: rooms, the round door, a grid.
function blueprint(k: Kit): void {
  const P = (fu: number, fv: number): P3 => {
    const p = on(PLAN, fu, fv);
    return [p[0], p[1], p[2] + 0.01];
  };
  const w = Math.max(0.6, 0.06 * k.s);
  if (k.s >= 6) {
    const grid: Array<[P3, P3]> = [];
    for (let i = 1; i < 10; i++) grid.push([P(i / 10, 0), P(i / 10, 1)], [P(0, i / 10), P(1, i / 10)]);
    k.segs(grid, withAlpha(C.bpLine, 0.18), Math.max(0.5, 0.03 * k.s));
  }
  const ink = withAlpha(C.bpLine, 0.9);
  k.line([P(0.08, 0.1), P(0.92, 0.1), P(0.92, 0.9), P(0.08, 0.9), P(0.08, 0.1)], ink, w * 1.4);
  k.line([P(0.45, 0.1), P(0.45, 0.62), P(0.92, 0.62)], ink, w);
  k.line([P(0.08, 0.42), P(0.3, 0.42)], ink, w);
  const c = P(0.68, 0.36);
  const pts: P3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    pts.push([c[0] + Math.cos(a) * 0.7, c[1] + Math.sin(a) * 0.55, c[2]]);
  }
  k.line(pts, ink, w);
  k.line([P(0.2, 0.7), P(0.32, 0.78)], ink, w);
  k.line([P(0.2, 0.78), P(0.32, 0.7)], withAlpha('#ff8a7a', 0.9), w * 1.2);
}

// ── idle: the hoard ─────────────────────────────────────────────────────────
// A heap of gold coins with bars, a crown and a goblet in it, an open chest
// spilling pearls and coin, sacks of coin at its feet, a velvet cushion on
// its slope for a nap; brass stanchions and velvet ropes in front. Where
// tired agents curl up.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.4, 4.6, 7.6, 4.6, 0.32);
    k.pool(7.4, 4.8, 8.5, 6, C.glow, 0.22);
    // the chest at the back right, open, pearls over its lip
    chest(k, 10.6, 0.8, v.seed);
    sack(k, 1.6, 2.6, 1.25, 2.6, v.seed);
    // the heap, and what lies in it
    coinHeap(k, 6.8, 4.2, 0, 5.6, 3.8, 4.6, v.seed);
    goldBar(k, 2.4, 5.4, 1.2, 1.7, 0.85, 0.45);
    goldBar(k, 3.4, 6.3, 0.4, 1.7, 0.85, 0.45, 'v');
    goldBar(k, 9.4, 5.6, 1.4, 1.7, 0.85, 0.45);
    goldBar(k, 8.2, 2.4, 3.6, 1.7, 0.85, 0.45);
    goblet(k, 4.6, 3.0, 3.1);
    crown(k, 6.6, 3.6, 4.35);
    // coin spilt round the foot
    for (let i = 0; i < 14; i++) {
      const a = Math.PI * (0.1 + 0.9 * hash(v.seed, i, 7));
      const r = 1.05 + hash(v.seed, i, 8) * 0.25;
      coin(k, 6.8 + Math.cos(a) * 5.6 * r, 4.2 + Math.sin(a) * 3.8 * r, 0.02, 0.36);
    }
    // a sack of coin at the front left
    sack(k, 2.5, 7.4, 1.0, 2.1, v.seed + 1);
    coins(k, 12.6, 6.0, 0, 5);
    coins(k, 13.4, 6.6, 0, 3);
    coins(k, 12.9, 7.2, 0, 7);
    // the ropes
    const posts: Array<[number, number]> = [[0.8, 9.8], [7.5, 10.4], [14.2, 9.8]];
    stanchion(k, ...posts[0]);
    rope(k, posts[0], posts[1], 1.0);
    stanchion(k, ...posts[1]);
    rope(k, posts[1], posts[2], 1.0);
    stanchion(k, ...posts[2]);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 0.9, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 7) + i;
      const a = Math.PI * (-0.1 + 1.2 * hash(tick, 1));
      const f = Math.sqrt(hash(tick, 2)) * 0.9;
      spawn({ kind: 'glint', x: 6.8 + Math.cos(a) * 5.6 * f, y: 4.2 + Math.sin(a) * 3.8 * f, z: 4.6 * Math.sin(Math.acos(f)) + 0.2, vx: 0, vy: 0, vz: 0.3, life: 0.6 + hash(tick, 3) * 0.4, color: [255, 236, 160], glow: true, gravity: 0 });
    }
  },
};

// A goblet standing on the heap.
function goblet(k: Kit, u: number, w: number, z: number): void {
  k.cyl(u, w, z, 0.45, 0.12, C.goldDeep);
  k.cyl(u, w, z + 0.12, 0.1, 0.7, C.gold, { line: k.thin });
  frustum(k, u, w, z + 0.8, 0.3, z + 1.8, 0.62, C.gold, '#7a1a2a');
  const [x, y] = k.p(u + 0.1, w + 0.55, z + 1.35);
  gem(k, x, y, Math.max(1.2, 0.2 * k.s), '#e04a6a');
}

// A crown sitting on the heap's top.
function crown(k: Kit, u: number, w: number, z: number): void {
  const r = 0.85;
  const front: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = Math.PI * (-0.1 + (1.2 * i) / 12);
    front.push([u + Math.cos(a) * r, w + Math.sin(a) * r, z]);
  }
  const top: P3[] = [];
  for (let i = 12; i >= 0; i--) {
    const a = Math.PI * (-0.1 + (1.2 * i) / 12);
    top.push([u + Math.cos(a) * r, w + Math.sin(a) * r, z + (i % 3 === 0 ? 1.15 : 0.6)]);
  }
  k.disc(u, w, z + 0.6, r, '#6a1a2a', k.thin);
  k.poly([...front, ...top], k.hgrad(front[12], front[0], [[0, C.goldLight], [0.5, C.gold], [1, C.goldDeep]]), k.thin);
  for (const [i, c] of [[3, '#e04a6a'], [6, '#4a8ae0'], [9, '#3ac06a']] as const) {
    const [x, y] = k.p(...front[i]);
    gem(k, x, y - 0.35 * k.s, Math.max(1, 0.18 * k.s), c);
  }
}

// An iron-bound chest, open, coin and pearls over its lip.
function chest(k: Kit, u0: number, v0: number, seed: number): void {
  const w = 3.6;
  const d = 2.4;
  const h = 2.0;
  k.shadow(u0 + w / 2, v0 + d / 2, w * 0.6, d * 0.7, 0.25);
  // the lid, thrown back against the heap side
  k.poly([[u0, v0, h], [u0 + w, v0, h], [u0 + w, v0 - 0.6, h + 2.0], [u0, v0 - 0.6, h + 2.0]], k.side(C.walnut, 0, 1), k.lw);
  k.line([[u0 + 0.5, v0 - 0.02, h + 0.1], [u0 + 0.5, v0 - 0.6, h + 2.0]], C.iron, Math.max(1, 0.2 * k.s));
  k.line([[u0 + w - 0.5, v0 - 0.02, h + 0.1], [u0 + w - 0.5, v0 - 0.6, h + 2.0]], C.iron, Math.max(1, 0.2 * k.s));
  k.box(u0, v0, 0, w, d, h, C.walnut, { stripe: false });
  for (const a of [u0 + 0.5, u0 + w - 0.5]) k.line([[a, v0 + d + 0.01, 0], [a, v0 + d + 0.01, h], [a, v0, h]], C.iron, Math.max(1, 0.22 * k.s));
  k.disc(u0 + w / 2, v0 + d / 2, h + 0.05, 1.3, C.gold, 0);
  const pts: Pt[] = [];
  for (let i = 0; i < 9; i++) pts.push(k.p(u0 + 0.4 + hash(seed, i, 21) * (w - 0.8), v0 + 0.3 + hash(seed, i, 22) * (d - 0.6), h + 0.2 + hash(seed, i, 23) * 0.5));
  fillPts(k, hull(pts), C.gold, k.thin);
  const pearls: Array<[number, number, number]> = [];
  for (let i = 0; i < 8; i++) {
    const f = i / 7;
    pearls.push([u0 + 0.6 + f * 1.8, v0 + d + 0.05 + Math.sin(f * 3) * 0.1, h - f * 1.6]);
  }
  for (const [a, b, c] of pearls) k.disc(a, b, c, 0.16, '#f6f1e6', Math.max(0.6, k.thin * 0.6));
  k.box(u0 + w / 2 - 0.3, v0 + d - 0.05, h - 0.8, 0.6, 0.12, 0.6, C.brass, { line: k.thin, stripe: false });
}

// A tied sack of coin.
function sack(k: Kit, cu: number, cv: number, r: number, h: number, seed: number): void {
  const base = '#b89868';
  k.shadow(cu, cv, r * 1.1, r * 1.1, 0.24);
  const e0 = k.ell(cu, cv, 0.2, r);
  const e1 = k.ell(cu, cv, h, r * 0.42);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx, e0.cy);
  pen.bezierCurveTo(e0.cx - e0.rx * 1.15, (e0.cy + e1.cy) / 2, e1.cx - e1.rx * 1.1, e1.cy + (e0.cy - e1.cy) * 0.2, e1.cx - e1.rx, e1.cy);
  pen.lineTo(e1.cx + e1.rx, e1.cy);
  pen.bezierCurveTo(e1.cx + e1.rx * 1.1, e1.cy + (e0.cy - e1.cy) * 0.2, e0.cx + e0.rx * 1.15, (e0.cy + e1.cy) / 2, e0.cx + e0.rx, e0.cy);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(e0.cx - e0.rx, 0, e0.cx + e0.rx, 0);
  g.addColorStop(0, shade(base, 0.14));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.25));
  k.paint(g, k.lw);
  const [nx, ny] = k.p(cu, cv, h + 0.35);
  pen.beginPath();
  pen.ellipse(nx, ny, e1.rx * 0.9, e1.rx * 0.5, 0, 0, Math.PI * 2);
  k.paint(shade(base, 0.1), k.thin);
  k.line([[cu - r * 0.4, cv, h - 0.05], [cu + r * 0.4, cv, h - 0.05]], '#8a5a35', Math.max(0.9, 0.14 * k.s));
  // a coin mark painted on it
  const [mx, my] = k.p(cu, cv + r * 0.9, h * 0.45);
  pen.beginPath();
  pen.ellipse(mx, my, r * 0.32 * k.s, r * 0.36 * k.s, 0, 0, Math.PI * 2);
  pen.strokeStyle = hash(seed, 3) < 0.5 ? '#7d2a2e' : '#2f5a45';
  pen.lineWidth = Math.max(0.8, 0.13 * k.s);
  pen.stroke();
}

// ── entrance: the vault doorway ─────────────────────────────────────────────
// A round doorway through the vault's wall: a massive stepped steel jamb
// ringed with the sockets the bolts shoot into, a tunnel through, and the
// marble lobby beyond in warm light; a brass bridge plate over the sill, a
// stanchion and its rope on the far side, the guard's stool on the near
// one (see npcs.ts), and a beacon over the top that turns while someone
// comes or goes. (The door itself stands open against the wall beside it:
// see room.ts.)

const DOORWAY = { a: 7.5, z: 6.55, r: 6.55, R: 7.45, deep: 2.6 };
export const STOOL = { u: 14.0, v: 2.4, z: 2.4 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 18,
  animated: true,
  draw(v: PropView): void {
    const { a, z: cz, r, R, deep } = DOORWAY;
    const k = still(v, 'entrance', 18, (k) => {
      const n0 = 0.75; // the jamb's face
      const open = (n: number, rr: number) => circle(a, n, cz, rr, 40).map(([u, w, z]): P3 => [u, w, Math.max(0, z)]);
      // the jamb: a steel collar standing proud of the wall
      const face = open(n0, R);
      const back = open(0, R);
      fillPts(k, hull([...face, ...back].map((p) => k.p(...p))), C.steelDark, k.lw);
      const [cx, cy] = k.p(a, n0, cz);
      const jg = k.pen.createRadialGradient(cx - R * 0.4 * k.s, cy - R * 0.5 * k.s, 0, cx, cy, R * 1.2 * k.s);
      jg.addColorStop(0, '#a9b4c0');
      jg.addColorStop(0.6, '#7c8794');
      jg.addColorStop(1, '#5a6470');
      k.poly(face, jg, k.lw);
      // through it: the tunnel, then the lobby beyond its far mouth
      const inner = open(n0 + 0.01, r);
      k.pen.save();
      k.pen.beginPath();
      k.trace(inner);
      k.pen.clip();
      k.poly(inner, k.grad([a - r, n0, cz - r], [a + r, n0, cz + r], [[0, '#3a414b'], [1, '#232830']]), 0);
      const far = open(-deep, r);
      k.pen.save();
      k.pen.beginPath();
      k.trace(far);
      k.pen.clip();
      lobby(k, -deep);
      k.pen.restore();
      // the far mouth's rim catching the lobby light
      k.pen.beginPath();
      k.trace(far);
      k.paint(null, Math.max(1, 0.2 * k.s), withAlpha('#ffe2b0', 0.5));
      // rings turned in the tunnel's wall
      for (const f of [0.35, 0.7]) {
        k.pen.beginPath();
        k.trace(open(n0 - deep * f - 0.01, r));
        k.pen.strokeStyle = withAlpha('#11151b', 0.5);
        k.pen.lineWidth = Math.max(0.7, 0.1 * k.s);
        k.pen.stroke();
      }
      k.pen.restore();
      k.pen.beginPath();
      k.trace(inner);
      k.paint(null, k.lw);
      // steps turned in the jamb's face, the bolt sockets round it
      for (const [rr, c, w] of [[r + 0.3, '#c9d2dc', 0.1], [R - 0.35, '#3a414b', 0.12], [R - 0.45, '#c9d2dc', 0.07]] as const) {
        k.pen.beginPath();
        k.trace(open(n0 + 0.01, rr));
        k.pen.strokeStyle = withAlpha(c, 0.8);
        k.pen.lineWidth = Math.max(0.6, w * k.s);
        k.pen.stroke();
      }
      const holes: P3[] = [];
      for (let i = 0; i < 18; i++) {
        const th = (i / 18) * Math.PI * 2 + 0.17;
        const z = cz + Math.sin(th) * (r + R) * 0.5;
        if (z < 0.5) continue;
        holes.push([a + Math.cos(th) * (r + R) * 0.5, n0 + 0.02, z]);
      }
      rivets(k, holes, '#1a1e25', 0.24);
      rivets(k, holes.map(([u, w, z]): P3 => [u - 0.06, w, z + 0.07]), '#3d4550', 0.12);
      // the bridge plate over the sill
      k.poly([[a - 4.2, -deep, 0.06], [a + 4.2, -deep, 0.06], [a + 4.2, 1.9, 0.06], [a - 4.2, 1.9, 0.06]], '#7c8794', k.thin);
      const tread: Array<[P3, P3]> = [];
      for (let w = -deep + 0.4; w < 1.8; w += 0.45) for (let u = a - 3.9 + (Math.round(w * 9) & 1) * 0.35; u < a + 3.8; u += 0.7) tread.push([[u, w, 0.07], [u + 0.3, w + 0.15, 0.07]]);
      k.segs(tread, withAlpha('#c3ccd6', 0.55), Math.max(0.6, 0.06 * k.s));
      k.line([[a - 4.2, 1.9, 0.08], [a + 4.2, 1.9, 0.08]], C.brass, Math.max(1, 0.22 * k.s));
      // the beacon's bracket over the top
      k.box(a - 0.5, 0, cz + R - 0.1, 1.0, 1.0, 1.2, C.gunmetal, { line: k.thin });
      // a stanchion on the far side, its rope back to the jamb; the
      // guard's stool on the near side: three brass legs, a ring to rest
      // his boots on, an oxblood leather seat
      stanchion(k, 0.7, 3.1);
      rope(k, [0.7, 3.1], [0.7, 0.8], 0.6);
      const { u: su, v: sv, z: sz } = STOOL;
      k.shadow(su, sv, 1.3, 1.3, 0.28);
      for (const a of [0.9, 3.0, 5.1]) k.rod([[su + Math.cos(a) * 0.55, sv + Math.sin(a) * 0.55, sz - 0.3], [su + Math.cos(a) * 1.0, sv + Math.sin(a) * 1.0, 0]], C.brassDark, 0.13);
      const ring: P3[] = Array.from({ length: 25 }, (_, i) => [su + Math.cos((i / 24) * Math.PI * 2) * 0.8, sv + Math.sin((i / 24) * Math.PI * 2) * 0.8, 0.9] as P3);
      k.line(ring, C.brass, Math.max(0.8, 0.1 * k.s));
      k.cyl(su, sv, sz - 0.4, 0.95, 0.4, C.oxblood, { top: shade(C.oxblood, 0.15) });
    });
    // the beacon: dark, or turning amber while someone passes
    const bz = cz + R + 1.6;
    const act = v.active;
    const t = v.t;
    k.cyl(a, 0.5, bz - 0.5, 0.75, 0.35, C.gunmetal);
    const dome = ring(k, [a, 0.5, bz - 0.15], [0, 0, 1], 0.62, 16);
    const [dx, dy] = k.p(a, 0.5, bz + 0.85);
    const pts = [...dome, [dx, dy] as Pt];
    const flash = act ? 0.5 + 0.5 * Math.cos(t * 7) : 0;
    fillPts(k, hull(pts), act ? (flash > 0.5 ? '#ffd27a' : '#ff9a2a') : '#9a5a1a', k.lw);
    if (act) {
      k.halo(a, 0.5, bz + 0.3, 3 + flash * 3, '#ffb347', 0.35 + flash * 0.35);
      const sweep = t * 7;
      k.halo(a + Math.cos(sweep) * 1.2, 0.5 + Math.sin(sweep) * 0.6, bz + 0.3, 2.2, '#fff0c0', 0.5 * flash);
    }
  },
};

// The lobby beyond the doorway, seen through its far mouth: a warm marble
// floor, a panelled wall with a painting, and lamp light.
function lobby(k: Kit, n: number): void {
  const { a, z: cz, r } = DOORWAY;
  const far = n - 5;
  // the far wall, warm; the floor running back to it
  // the far wall: a dark wood dado under warm plaster, a lit painting
  k.rect(a - r - 6, -1, a + r + 6, cz + r + 2, far, k.vgrad(a, far, 0, cz + r, [[0, '#d9a870'], [0.55, '#c08a58'], [1, '#6a4630']]));
  k.rect(a - r - 6, -1, a + r + 6, 4.2, far + 0.01, '#5a3424');
  k.rect(a - r - 6, 4.0, a + r + 6, 4.4, far + 0.02, C.brass);
  k.rect(a + 0.6, 6.4, a + 4.4, 9.4, far + 0.02, C.brass, k.thin);
  k.rect(a + 0.9, 6.7, a + 4.1, 9.1, far + 0.03, k.vgrad(a, far, 6.7, 9.1, [[0, '#4f6a48'], [1, '#c8b890']]));
  // the floor: warm marble in a checker running back to it
  const fl: P3[] = [[a - r - 8, n + 1, 0], [a + r + 8, n + 1, 0], [a + r + 8, far, 0], [a - r - 8, far, 0]];
  k.poly(fl, '#9a7652', 0);
  const pen = k.pen;
  pen.beginPath();
  for (let w = far, j = 0; w < n + 1; w += 2.2, j++) for (let u = a - r - 8 + (j & 1) * 2.2; u < a + r + 8; u += 4.4) k.trace([[u, w, 0.01], [u + 2.2, w, 0.01], [u + 2.2, w + 2.2, 0.01], [u, w + 2.2, 0.01]]);
  pen.fillStyle = '#b8936a';
  pen.fill();
  k.halo(a + 1.5, far + 1, cz + 3, 6, '#ffd890', 0.4);
  k.pool(a, n - 3, 5, 4, '#ffe2a0', 0.3);
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
