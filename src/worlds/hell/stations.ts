import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { BINDINGS, bone, bookRow, candle, chain, coals, crystal, fire, flame, frustum, hull, padlock, rock, skull, spike, swag, tome } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, due, ember, hash, kitOf, mote, puff, sparkAt, still } from './kit.ts';

// Hell's stations, each a PropArt in its own frame (u along the wall, v out
// toward the agent, z up; the viewer always sees the top, the +v front and
// the +u end). Animated ones paint their still parts through the sprite
// cache (see still) and only the moving bits each frame; worked or not,
// they hold still when nobody is at them, so they cost nothing to show.

type Spawn = (p: Particle) => void;
const TAU = Math.PI * 2;
const SOUL: readonly [number, number, number] = [143, 242, 208];
const HOT: readonly [number, number, number] = [255, 150, 60];

// ── write: the contract desk ─────────────────────────────────────────────────
// An ebony desk on gilt claws, turned to the room, the clerk's spiky iron
// chair behind it (see npcs.ts): an infernal contract unrolled across it
// toward whoever signs, spilling over the front to a red wax seal; a skull
// with a candle on it, an hourglass and an inkwell of red ink down its far
// end, tomes at its near end, all clear of him. Worked, the clerk writes
// (the quill is in his hand): the fresh clause at the top of the sheet
// glows like embers and sparks rise off it. `top`: the desk top; `back`:
// its back edge, a step out from the wall; `seat`: the chair.

const DESK_Z = 7.1;
export const BUREAU = { top: DESK_Z, back: 2.0, seat: [5.5, 1.2, 4.35] as const };
const SHEET = { u0: 3.6, u1: 7.4, v0: 2.45, v1: 6.35 };
const LINES = 6;

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const z = DESK_Z;
    const b = BUREAU.back;
    const { u0, u1, v0, v1 } = SHEET;
    const k = still(v, 'write', 12, (k) => {
      k.shadow(5.5, 4.2, 6.4, 3.6, 0.32);
      // the clerk's chair, behind the desk, facing the room
      chairIron(k, BUREAU.seat[0], BUREAU.seat[1], Math.PI / 2, BUREAU.seat[2], 2.4);
      // legs on gilt claws, the apron with a drawer, the top
      for (const [u, w] of [[0.9, b + 0.4], [9.5, b + 0.4], [0.9, b + 3.6], [9.5, b + 3.6]] as const) {
        k.box(u, w, 0.35, 0.6, 0.6, 6.1, C.ebony);
        k.cyl(u + 0.3, w + 0.3, 0, 0.5, 0.4, C.gold, { line: k.thin });
      }
      k.box(0.9, b + 0.4, 5.5, 9.2, 3.8, 0.9, C.ebonyLight, { stripe: false });
      k.poly([[3.2, b + 4.21, 5.65], [7.8, b + 4.21, 5.65], [7.8, b + 4.21, 6.25], [3.2, b + 4.21, 6.25]], shade(C.ebonyLight, -0.1), k.thin);
      k.dot(5.5, b + 4.25, 5.95, 0.22 * k.s, 0.22 * k.s, C.gold, k.thin * 0.7);
      k.box(0.4, b, 6.4, 10.2, 4.6, 0.7, '#4c2c30');
      // a skull with a candle stuck on it, two more candles, an hourglass,
      // all down the far end
      candle(k, 0.95, b + 0.5, z, 2.6, 0.3);
      candle(k, 1.0, b + 3.9, z, 1.5, 0.28);
      skull(k, 1.7, b + 1.9, z, 0.72);
      candle(k, 1.7, b + 1.9, z + 1.45, 1.0, 0.26, '#d8c9a4');
      hourglass(k, 2.4, b + 3.85, z);
      // the contract: flat across the top, over the front edge, rolled up
      // below
      k.poly([[u0, v0, z + 0.02], [u1, v0, z + 0.02], [u1, v1, z + 0.02], [u0, v1, z + 0.02]], C.parchment, k.thin);
      k.poly([[u0, v1 + 0.02, z], [u1, v1 + 0.02, z], [u1 + 0.1, v1 + 0.06, 2.7], [u0 - 0.1, v1 + 0.06, 2.7]], k.vgrad(u0, v1, 2.7, z, [[0, C.parchmentDark], [1, C.parchment]]), k.thin);
      k.rod([[u0 - 0.4, v1 + 0.3, 2.5], [u1 + 0.4, v1 + 0.3, 2.5]], C.parchment, 0.6);
      // the old clauses down the hanging part, and the seal
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 6; i++) {
        const zz = z - 0.7 - i * 0.62;
        const l = i === 5 ? 0.45 : 0.75 + hash(i, 3) * 0.2;
        const [x0, y0] = k.p(u0 + 0.35, v1 + 0.05, zz);
        const [x1, y1] = k.p(u0 + 0.35 + (u1 - u0 - 0.7) * l, v1 + 0.05, zz);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      // and the clauses on the sheet, long dry
      for (let i = 1; i < LINES; i++) {
        const w = v0 + 0.5 + i * 0.55;
        const l = 0.55 + hash(i, 7) * 0.4;
        const [x0, y0] = k.p(u0 + 0.35, w, z + 0.03);
        const [x1, y1] = k.p(u0 + 0.35 + (u1 - u0 - 0.7) * l, w, z + 0.03);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#5a2a2a';
      pen.lineWidth = Math.max(0.7, 0.1 * k.s);
      pen.stroke();
      k.dot(u1 - 0.9, v1 + 0.08, 3.4, 0.55 * k.s, 0.55 * k.s, C.velvet, k.thin);
      k.dot(u1 - 0.9, v1 + 0.1, 3.4, 0.3 * k.s, 0.3 * k.s, '#c8303a', 0);
      k.line([[u1 - 1.2, v1 + 0.09, 3.0], [u1 - 1.4, v1 + 0.1, 2.0]], C.velvetDark, Math.max(0.8, 0.14 * k.s));
      // the inkwell of red ink at the front of the far end; tomes, low,
      // at the near end
      k.cyl(2.2, b + 4.15, z, 0.45, 0.65, '#2c1c2c');
      k.disc(2.2, b + 4.15, z + 0.65, 0.27, '#8c1a1a', 0);
      tome(k, 8.3, b + 1.4, z, 1.9, 1.5, 0.45, '#5a2d6c');
      tome(k, 8.5, b + 1.5, z + 0.45, 1.6, 1.3, 0.4, C.velvetDark);
      tome(k, 8.6, b + 3.2, z, 1.5, 1.1, 0.35, C.leather);
    });
    // the newest clause at the top of the sheet: dull when he is away;
    // glowing like embers, the glow breathing once in two seconds, while
    // he writes
    const w = v0 + 0.5;
    const l = 0.55 + hash(0, 7) * 0.4;
    const pts: P3[] = [];
    for (let q = 0; q <= 8; q++) {
      const uu = u0 + 0.35 + (u1 - u0 - 0.7) * l * (q / 8);
      pts.push([uu, w + Math.sin(uu * 9) * 0.05, z + 0.03]);
    }
    if (!v.active) {
      k.line(pts, '#5a2a2a', Math.max(0.7, 0.1 * k.s));
      quill(k, [2.2, b + 4.15, z + 0.55], [1.8, b + 3.45, z + 4.3]);
      return;
    }
    const glow = 0.5 + 0.5 * Math.sin(v.t * Math.PI);
    k.line(pts, glow > 0.5 ? '#ff8a3a' : '#ff6a2a', Math.max(0.8, 0.12 * k.s));
    k.halo(pts[4][0], w, z + 0.3, 1.6 + 0.4 * glow, '#ff6a2a', 0.35 + 0.2 * glow);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) {
      if (due(v.t, dt, 0.4, v.seed)) spawn(puff(0.95, BUREAU.back + 0.5, DESK_Z + 3.4, Math.floor(v.t * 10), 0, [70, 56, 60]));
      return;
    }
    const n = due(v.t, dt, 3, v.seed);
    for (let i = 0; i < n; i++) spawn(sparkAt(SHEET.u0 + 0.6 + hash(Math.floor(v.t * 20), i) * 2.0, SHEET.v0 + 0.5, DESK_Z + 0.2, Math.floor(v.t * 20), i, 3, HOT));
  },
};

// A quill from its nib to the top of its feather: a crimson vane on a pale
// shaft.
function quill(k: Kit, tip: P3, top: P3): void {
  const a = k.p(...tip);
  const b = k.p(...top);
  const pen = k.pen;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const at = (f: number, side: number): Pt => [a[0] + dx * f + nx * side, a[1] + dy * f + ny * side];
  const w = l * 0.17;
  pen.beginPath();
  const p0 = at(0.28, 0);
  pen.moveTo(p0[0], p0[1]);
  const c1 = at(0.5, w * 1.1);
  const e = at(1.04, 0);
  const c2 = at(0.85, -w * 0.9);
  const p1 = at(0.5, -w * 0.6);
  pen.quadraticCurveTo(c1[0], c1[1], e[0], e[1]);
  pen.quadraticCurveTo(c2[0], c2[1], p1[0], p1[1]);
  pen.lineTo(p0[0], p0[1]);
  pen.closePath();
  const g = pen.createLinearGradient(p0[0], p0[1], e[0], e[1]);
  g.addColorStop(0, C.velvetDark);
  g.addColorStop(0.5, C.velvet);
  g.addColorStop(1, '#1a0a0e');
  k.paint(g, k.thin);
  pen.beginPath();
  pen.moveTo(a[0], a[1]);
  pen.lineTo(e[0], e[1]);
  pen.strokeStyle = '#f2e6c8';
  pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  pen.stroke();
  // barbs
  if (k.s >= 6) {
    pen.beginPath();
    for (const f of [0.45, 0.6, 0.75]) {
      const p = at(f, 0);
      const q = at(f + 0.08, w * 0.8);
      pen.moveTo(p[0], p[1]);
      pen.lineTo(q[0], q[1]);
    }
    pen.strokeStyle = C.velvetDark;
    pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    pen.stroke();
  }
}

// An hourglass in a gilt frame, red sand running.
function hourglass(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.55, 0.22, C.gold, { line: k.thin });
  frustum(k, u, v, z + 0.22, 0.45, z + 1.0, 0.1, '#e8d8d0', null);
  frustum(k, u, v, z + 1.0, 0.1, z + 1.78, 0.45, '#e8d8d0', null);
  k.disc(u, v, z + 0.4, 0.32, '#c0301e', 0);
  k.dot(u, v, z + 1.35, 0.18 * k.s, 0.12 * k.s, '#c0301e');
  k.cyl(u, v, z + 1.78, 0.55, 0.22, C.gold, { line: k.thin });
  for (const d of [-1, 1]) k.line([[u + d * 0.5, v + 0.1, z + 0.2], [u + d * 0.5, v + 0.1, z + 1.8]], C.goldDark, Math.max(0.8, 0.1 * k.s));
}

// A spiky iron chair at (cu, cv), its sitter facing `face` (u-v plane),
// its seat `zs` up: a velvet seat, a back of bars `wide` across topped
// with spikes, its outer posts the tallest.
function chairIron(k: Kit, cu: number, cv: number, face: number, zs = 3.5, wide = 1.7): void {
  const du = Math.cos(face);
  const dv = Math.sin(face);
  const pu = -dv;
  const pv = du;
  const r = 1.15;
  const bu = cu - du * r * 0.85;
  const bv = cv - dv * r * 0.85;
  const behind = du + dv > 0;
  const back = () => {
    const top = zs + 4.2;
    const half = wide / 2;
    for (const sd of [-1, -0.33, 0.33, 1]) {
      const uu = bu + pu * sd * half;
      const vv = bv + pv * sd * half;
      const tz = top - (Math.abs(sd) < 0.5 ? 0.5 : 0);
      k.rod([[uu, vv, zs], [uu, vv, tz]], C.iron, 0.16);
      const [x, y] = k.p(uu, vv, tz);
      const S = 0.3 * k.s;
      k.fill([[x - S, y], [x, y - S * 3], [x + S, y]], C.ironLight, k.thin);
    }
    k.rod([[bu - pu * half * 1.1, bv - pv * half * 1.1, zs + 2.6], [bu + pu * half * 1.1, bv + pv * half * 1.1, zs + 2.6]], C.iron, 0.18);
  };
  k.shadow(cu, cv, r * 1.3, r * 1.3, 0.24);
  if (behind) back();
  for (const a of [0.8, 2.35, 3.9, 5.5]) {
    const ca = Math.cos(a + face);
    const sa = Math.sin(a + face);
    k.rod([[cu + ca * r * 0.7, cv + sa * r * 0.7, zs], [cu + ca * r * 0.9, cv + sa * r * 0.9, 0]], C.iron, 0.18);
  }
  k.cyl(cu, cv, zs - 0.3, r, 0.35, C.iron);
  k.disc(cu, cv, zs + 0.06, r * 0.82, C.velvet, k.thin);
  if (!behind) back();
}

// ── read: the chained library ────────────────────────────────────────────────
// A tall case of black iron and ebony crowned with skulls: grimoires of
// every dark binding, chained shut along each shelf, skulls, candles and a
// jar with an eye in it; beside it an iron lectern with a great book
// chained open on it. Reading wakes the book: its runes burn and its
// pages turn, and motes of soul-light rise off it.

const SHELVES = [0.9, 5.4, 9.9, 14.4, 18.6];
const BAYS: ReadonlyArray<readonly [number, number]> = [[0.95, 4.95], [5.35, 9.35]];
const LECTERN = { u: 11.9, v: 2.1, z: 6.4 };

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const L = LECTERN;
    const k = still(v, 'read', 21, (k) => {
      const F = 3.3; // the case's front
      k.shadow(5.3, 2.3, 6.2, 2.5, 0.32);
      k.box(0.3, 0.05, 0, 9.7, F - 0.05, 18.9, C.ebony, { stripe: false });
      // the bays, dark inside, then what is on each shelf
      SHELVES.slice(0, -1).forEach((z0, r) => {
        const z1 = SHELVES[r + 1] - 0.45;
        for (const [bi, [a0, a1]] of BAYS.entries()) {
          k.poly([[a0, F, z0], [a1, F, z0], [a1, F, z1], [a0, F, z1]], k.vgrad(a0, F, z0, z1, [[0, '#2a1416'], [1, '#160a0c']]), k.thin);
          const sd = v.seed + r * 7 + bi * 3;
          const kind = hash(sd, 5);
          if (kind < 0.22) {
            // a skull and a candle, books leaning
            skull(k, a0 + 0.95, F - 1.0, z0, 0.78);
            candle(k, a0 + 2.0, F - 1.2, z0, 1.4, 0.26);
            bookRow(k, a0 + 2.6, a1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
          } else if (kind < 0.36) {
            bookRow(k, a0 + 0.1, a1 - 1.5, F - 0.05, z0, z1 - z0 - 0.3, sd);
            eyeJar(k, a1 - 0.75, F - 1.0, z0);
          } else if (kind < 0.5) {
            // a few lying flat, a candle on them
            for (let j = 0; j < 3; j++) tome(k, a0 + 0.3, F - 2.2, z0 + j * 0.42, 2.4 - j * 0.2, 1.9, 0.42, BINDINGS[(sd + j) % BINDINGS.length]);
            candle(k, a0 + 1.3, F - 1.3, z0 + 1.26, 1.1, 0.24);
            bookRow(k, a0 + 2.9, a1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
          } else bookRow(k, a0 + 0.1, a1 - 0.1, F - 0.05, z0, z1 - z0 - 0.3, sd);
          // the chain across the shelf
          chain(k, swag([a0 + 0.15, F + 0.12, z0 + (z1 - z0) * 0.62], [a1 - 0.15, F + 0.12, z0 + (z1 - z0) * 0.62], 0.7, 8), 0.42);
          if ((r + bi) % 3 === 1) padlock(k, (a0 + a1) / 2, F + 0.2, z0 + (z1 - z0) * 0.62 - 0.9, 0.42);
        }
      });
      // the uprights' gilt studs, the crown and its skulls
      for (const u of [0.3, 4.95, 9.55]) k.box(u, F - 0.05, 0, 0.5, 0.25, 18.9, C.ebonyLight, { line: k.thin, stripe: false });
      k.box(0.1, 0, 18.9, 10.1, F + 0.2, 0.7, shade(C.ebony, 0.08));
      for (const u of [0.8, 9.6]) {
        k.box(u - 0.45, 0.6, 19.6, 0.9, 0.9, 0.4, C.gold, { line: k.thin });
        skull(k, u, 1.4, 20.0, 0.62);
      }
      // a row of iron spikes along the crown
      for (let u = 2.1; u < 8.8; u += 0.95) spike(k, u, 1.6, 19.6, 1.1, 0.32, C.ironLight);
      // the lectern: a twisted iron post on a base, its top slanted to the agent
      k.shadow(L.u, L.v + 0.2, 1.8, 1.5, 0.28);
      k.cyl(L.u, L.v, 0, 1.0, 0.35, C.iron);
      for (let i = 0; i < 6; i++) k.rod([[L.u + (i & 1 ? 0.15 : -0.15), L.v, 0.35 + i], [L.u + (i & 1 ? -0.15 : 0.15), L.v, 1.35 + i]], C.iron, 0.28);
      bone(k, [L.u - 0.9, L.v + 0.4, 0.4], [L.u - 0.3, L.v + 0.2, 1.5], 0.25);
      k.poly([[L.u - 1.6, L.v - 0.9, L.z + 0.6], [L.u + 1.6, L.v - 0.9, L.z + 0.6], [L.u + 1.6, L.v + 1.0, L.z - 0.4], [L.u - 1.6, L.v + 1.0, L.z - 0.4]], C.ebonyLight, k.lw);
      k.poly([[L.u - 1.6, L.v + 1.0, L.z - 0.4], [L.u + 1.6, L.v + 1.0, L.z - 0.4], [L.u + 1.6, L.v + 1.0, L.z - 0.8], [L.u - 1.6, L.v + 1.0, L.z - 0.8]], shade(C.ebonyLight, -0.15), k.thin);
      // the open book on it, chained to the post
      const pg = (fu: number, fv: number, lift = 0): P3 => [L.u - 1.4 + fu * 2.8, L.v - 0.75 + fv * 1.6, L.z + 0.55 - fv * 0.9 + lift];
      k.poly([pg(0, 0, 0.05), pg(1, 0, 0.05), pg(1, 1, 0.05), pg(0, 1, 0.05)], C.velvetDark, k.thin);
      k.poly([pg(0.04, 0.05, 0.12), pg(0.5, 0.05, 0.08), pg(0.5, 0.95, 0.08), pg(0.04, 0.95, 0.12)], '#ead8b0', k.thin);
      k.poly([pg(0.5, 0.05, 0.08), pg(0.96, 0.05, 0.12), pg(0.96, 0.95, 0.12), pg(0.5, 0.95, 0.08)], '#f2e4c2', k.thin);
      chain(k, [pg(0.1, 1, 0), [L.u - 0.4, L.v + 0.6, 3.0], [L.u - 0.1, L.v + 0.3, 1.6]], 0.36);
      candle(k, L.u + 1.25, L.v - 0.6, L.z + 0.5, 1.2, 0.24);
    });
    const pg = (fu: number, fv: number, lift = 0): P3 => [L.u - 1.4 + fu * 2.8, L.v - 0.75 + fv * 1.6, L.z + 0.55 - fv * 0.9 + lift];
    // the runes on the pages: dark, or burning while read
    const on = v.active;
    const pen = k.pen;
    pen.beginPath();
    for (const side of [0, 1]) {
      for (let i = 0; i < 5; i++) {
        const fv = 0.18 + i * 0.16;
        const f0 = side ? 0.56 : 0.1;
        const l = 0.3 * (0.6 + hash(i, side, 9) * 0.4);
        const a = k.p(...pg(f0, fv, 0.13));
        const b = k.p(...pg(f0 + l, fv, 0.13));
        pen.moveTo(a[0], a[1]);
        pen.lineTo(b[0], b[1]);
      }
    }
    pen.strokeStyle = on ? (Math.sin(v.t * 4) > -0.3 ? '#ff8a3a' : '#ffb85a') : '#5a3a2a';
    pen.lineWidth = Math.max(0.7, 0.1 * k.s);
    pen.stroke();
    if (!on) return;
    k.halo(L.u, L.v + 0.2, L.z + 0.8, 3.6, '#ff8a3a', 0.4 + 0.08 * Math.sin(v.t * 3));
    // a page turning over, right to left
    const ph = (v.t * 0.7) % 1;
    if (ph < 0.5) {
      const a = (ph / 0.5) * Math.PI;
      const hinge = (fv: number): P3 => pg(0.5, fv, 0.1);
      const tip = (fv: number): P3 => {
        const h = hinge(fv);
        return [h[0] + Math.cos(a) * 1.3, h[1], h[2] + Math.sin(a) * 1.3];
      };
      k.poly([hinge(0.05), tip(0.05), tip(0.95), hinge(0.95)], '#fbf0d8', k.thin);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 2.2, v.seed);
    for (let i = 0; i < n; i++) spawn(mote(LECTERN.u, LECTERN.v + 0.3, LECTERN.z + 1, Math.floor(v.t * 10), i, hash(Math.floor(v.t * 10), i) < 0.5 ? SOUL : HOT, 1.6));
  },
};

// A glass jar of green liquor with an eye floating in it.
function eyeJar(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.6, 1.7, '#9ad8b8');
  k.cyl(u, v, z + 0.1, 0.5, 1.2, '#3a9a70', { line: 0 });
  const [x, y] = k.p(u, v + 0.3, z + 0.75);
  const R = 0.3 * k.s;
  k.pen.beginPath();
  k.pen.arc(x, y, R, 0, Math.PI * 2);
  k.paint('#f4ecdc', k.thin * 0.7);
  k.pen.beginPath();
  k.pen.arc(x + R * 0.25, y, R * 0.45, 0, Math.PI * 2);
  k.paint('#c0301e', 0);
  k.pen.beginPath();
  k.pen.arc(x + R * 0.3, y, R * 0.2, 0, Math.PI * 2);
  k.paint(INK, 0);
  k.cyl(u, v, z + 1.7, 0.66, 0.3, C.iron, { line: k.thin });
}

// ── search: the brimstone seam ───────────────────────────────────────────────
// A face of red rock bulging out of the wall, shot through with yellow
// brimstone, framed in iron-banded timbers; a cart of sulphur on its rails,
// a pick leaning, a lantern on the beam. Digging lights the crystals and
// knocks sparks and yellow dust off the face.

const SEAM: ReadonlyArray<readonly [number, number, number, number]> = [
  // u, v, z, size of each cluster of crystals
  [2.4, 2.4, 2.8, 1.35],
  [5.2, 2.5, 6.0, 1.1],
  [7.6, 2.3, 2.2, 1.2],
  [9.6, 2.1, 5.0, 1.0],
  [3.6, 2.4, 7.4, 0.85],
];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 11,
  animated: true,
  draw(v: PropView): void {
    const on = v.active;
    // (the crystals are in the sprite, dull or lit: one sprite each)
    const k = still(v, on ? 'search:lit' : 'search', 11, (k) => {
      k.shadow(6, 2.0, 6.6, 2.4, 0.32);
      // the rock, back lumps first
      const lumps: ReadonlyArray<readonly [number, number, number, number]> = [
        [2.0, 0.9, 1.9, 9.2], [5.4, 0.9, 2.3, 10.0], [8.8, 0.9, 2.0, 8.6], [10.8, 1.0, 1.2, 6.0],
        [1.3, 1.9, 1.3, 5.2], [3.8, 1.9, 1.8, 7.0], [6.6, 1.8, 2.0, 6.4], [9.4, 2.0, 1.6, 4.6],
        [2.6, 2.7, 1.4, 3.2], [5.2, 2.8, 1.5, 3.8], [8.0, 2.8, 1.3, 2.8],
      ];
      lumps.forEach(([u, w, r, h], i) => rock(k, u, w, 0, r, h, i < 4 ? C.rockDark : i < 8 ? C.rock : C.rockLight, i + 3));
      // veins of brimstone running through it
      for (const pts of [[[1.6, 2.9, 1.0], [3.0, 2.8, 2.6], [4.4, 2.9, 3.4], [5.6, 2.9, 5.6]], [[6.4, 2.8, 1.2], [7.6, 2.9, 2.2], [8.8, 2.7, 4.0], [9.8, 2.5, 5.2]]] as P3[][]) {
        k.line(pts, '#5a3a10', Math.max(1.4, 0.36 * k.s));
        k.line(pts, C.brimstone, Math.max(0.8, 0.2 * k.s));
      }
      // the timbers and the beam
      for (const u of [0.55, 11.2]) {
        k.box(u, 2.4, 0, 0.75, 0.75, 9.6, C.ebonyLight, { stripe: false });
        for (const zz of [1.6, 7.4]) k.box(u - 0.05, 2.35, zz, 0.85, 0.85, 0.4, C.iron, { line: k.thin, stripe: false });
      }
      k.box(0.2, 2.3, 9.6, 11.8, 0.95, 0.85, C.ebonyLight);
      for (const u of [1.0, 6.0, 11.0]) k.dot(u, 3.26, 10.0, 0.16 * k.s, 0.16 * k.s, C.ironLight, k.thin * 0.6);
      // the lantern's hook (the lantern itself sways live)
      k.line([[4.0, 2.9, 9.6], [4.0, 3.0, 9.0]], INK, Math.max(1, 0.14 * k.s));
      // the cart of sulphur on its rails
      for (const w of [3.3, 3.95]) k.line([[5.8, w, 0.05], [11.6, w, 0.05]], C.ironLight, Math.max(0.8, 0.14 * k.s));
      k.box(7.0, 2.7, 0.7, 3.8, 1.25, 1.9, '#5a3226', { stripe: false });
      for (const u of [7.6, 10.2]) k.dot(u, 3.98, 0.65, 0.48 * k.s, 0.48 * k.s, C.iron, k.thin);
      for (let i = 0; i < 7; i++) {
        const [x, y] = k.p(7.4 + hash(i, 1) * 3.0, 3.0 + hash(i, 2) * 0.8, 2.6 + hash(i, 3) * 0.6);
        k.pen.beginPath();
        k.pen.ellipse(x, y, (0.38 + hash(i, 4) * 0.2) * k.s, 0.3 * k.s, hash(i, 5), 0, Math.PI * 2);
        k.paint(i & 1 ? C.brimstone : C.brimstoneLight, k.thin);
      }
      k.box(7.0, 3.95, 0.7, 3.8, 0.05, 1.9, '#6a3a2a', { stripe: false, line: 0 });
      k.line([[7.0, 3.97, 1.6], [10.8, 3.97, 1.6]], C.iron, Math.max(0.8, 0.16 * k.s));
      // a pick leaning on the rock
      k.rod([[2.0, 3.6, 0.1], [2.9, 3.1, 4.6]], C.ebonyLight, 0.2);
      k.rod([[2.0, 3.0, 4.9], [2.9, 3.1, 4.6], [3.9, 3.3, 4.2]], C.ironLight, 0.24);
      // the crystals: dull, or burning bright while worked
      for (const [u, w, z, r] of SEAM) {
        const base = on ? C.brimstoneLight : C.brimstone;
        crystal(k, u - 0.5 * r, w, z, 1.6 * r, 0.8 * r, -0.3 * r, shade(base, -0.1));
        crystal(k, u + 0.4 * r, w, z, 1.3 * r, 0.7 * r, 0.35 * r, base);
        crystal(k, u, w + 0.3, z, 2.1 * r, 0.9 * r, 0.05, base);
      }
    });
    // their glow, pulsing while someone digs
    if (on) for (const [i, [u, w, z, r]] of SEAM.entries()) k.halo(u, w + 0.5, z + r, 2.2 + r, '#ffe060', 0.25 + 0.125 * (1 + Math.sin(v.t * 4 + i * 1.3)));
    // the lantern on the beam, swaying while someone digs
    const sw = on ? Math.sin(v.t * 3.2) * 0.25 : 0;
    const top: P3 = [4.0, 3.0, 9.0];
    const lu = 4.0 + Math.sin(sw) * 1.1;
    const lz = 9.0 - Math.cos(sw) * 1.1;
    k.line([top, [lu, 3.0, lz]], INK, Math.max(1, 0.12 * k.s));
    k.halo(lu, 3.1, lz - 0.9, on ? 3.2 : 2.4, '#ffc060', 0.45);
    k.box(lu - 0.45, 2.6, lz - 1.7, 0.9, 0.9, 1.5, C.iron, { line: k.thin, stripe: false });
    k.poly([[lu - 0.3, 3.52, lz - 1.55], [lu + 0.3, 3.52, lz - 1.55], [lu + 0.3, 3.52, lz - 0.35], [lu - 0.3, 3.52, lz - 0.35]], '#ffd070', 0);
    k.poly([[lu - 0.55, 2.5, lz - 0.2], [lu + 0.55, 2.5, lz - 0.2], [lu, 3.0, lz + 0.3]], C.iron, k.thin);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const [u, w, z] = SEAM[tick % SEAM.length];
      if (hash(tick, 3) < 0.7) spawn(sparkAt(u, w + 0.8, z + 0.6, tick, i, 7, [255, 236, 120]));
      else spawn(puff(u, w + 0.8, z + 0.5, tick, i, [214, 190, 90], 'smoke'));
    }
  },
};

// ── run: the hellforge ───────────────────────────────────────────────────────
// A squat forge of black brick with a chimney at its back and a bed of coals,
// a great leather bellows at its side; an anvil on a stump at its front
// edge with an ingot on it, the forge demon's place beside it out on the
// floor (see npcs.ts: the hammer is in his hand), a quench tub with tongs
// in it. Running it pumps the bellows: the coals roar into flame, the
// ingot glows and sparks fly; each goes round once in two seconds, so a
// worked forge loops cleanly.

const COALS = { u: 3.8, v: 3.6, z: 4.5, r: 1.9 };
export const ANVIL = { u: 4.6, v: 9.8, z: 3.9 };

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 15, (k) => {
      k.shadow(5.4, 5.6, 6.4, 6.0, 0.32);
      // the chimney stack at the back, the hearth in front of it
      k.box(1.4, 0.5, 4.0, 4.8, 2.2, 10.6, '#4a2a2c', { stripe: false });
      brickLines(k, 1.4, 6.2, 2.71, 4.4, 14.4);
      k.box(1.1, 0.3, 14.3, 5.4, 2.6, 0.7, '#3a2024');
      k.box(0.8, 0.8, 0, 6.2, 5.6, 4.0, '#4a2a2c', { stripe: false });
      brickLines(k, 0.8, 7.0, 6.41, 0.5, 3.6);
      k.box(0.6, 0.6, 4.0, 6.6, 6.0, 0.5, '#2f1e24');
      // the fire bed, sunk into the top
      k.poly([[1.6, 1.6, 4.51], [6.0, 1.6, 4.51], [6.0, 5.6, 4.51], [1.6, 5.6, 4.51]], '#1a0a0a', k.thin, 0.3);
      // the firebox mouth on the front
      k.poly([[2.4, 6.42, 1.0], [5.4, 6.42, 1.0], [5.4, 6.42, 2.6], [4.9, 6.42, 3.2], [2.9, 6.42, 3.2], [2.4, 6.42, 2.6]], k.vgrad(3.9, 6.42, 1.0, 3.2, [[0, '#ffb040'], [0.4, '#d0401a'], [1, '#3a0a0a']]), k.lw);
      // the bellows' nozzle into the hearth's side
      k.rod([[7.0, 3.3, 3.0], [8.0, 3.3, 3.0]], C.iron, 0.4);
      // the quench tub, tongs in it
      k.shadow(9.4, 8.8, 1.6, 1.4, 0.25);
      k.cyl(9.4, 8.8, 0, 1.3, 2.1, '#5a3a2e');
      for (const zz of [0.4, 1.6]) {
        const e = k.ell(9.4, 8.8, zz, 1.31);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
        k.pen.strokeStyle = C.iron;
        k.pen.lineWidth = Math.max(1, 0.2 * k.s);
        k.pen.stroke();
      }
      k.disc(9.4, 8.8, 2.05, 1.1, '#2a1a2a', 0);
      k.rod([[9.0, 8.6, 1.4], [8.4, 8.2, 4.2]], C.iron, 0.12);
      k.rod([[9.3, 8.7, 1.4], [8.9, 8.1, 4.3]], C.iron, 0.12);
      // the anvil on its stump at the front edge (its hammer is in the
      // forge demon's hand)
      const { u, v: w } = ANVIL;
      k.shadow(u, w, 2.6, 1.7, 0.3);
      k.cyl(u, w, 0, 1.2, 2.2, '#5a3424');
      k.disc(u, w, 2.2, 1.0, '#8a5a3a', 0);
      k.box(u - 1.1, w - 0.7, 2.2, 2.2, 1.4, 0.45, C.iron);
      k.box(u - 0.6, w - 0.45, 2.65, 1.2, 0.9, 0.6, C.iron, { stripe: false });
      k.box(u - 1.5, w - 0.65, 3.25, 3.0, 1.3, 0.65, C.ironLight);
      // the horn
      const horn: P3[] = [[u + 1.5, w - 0.55, 3.9], [u + 3.0, w, 3.75], [u + 1.5, w + 0.55, 3.9], [u + 1.5, w + 0.55, 3.25], [u + 1.5, w - 0.55, 3.25]];
      k.poly(horn, k.side(C.ironLight, 1, 0), k.lw);
    });
    const on = v.active;
    const t = v.t;
    // the coals, and fire over them when the bellows blow
    const { u, v: w, z, r } = COALS;
    const breath = on ? 0.5 + 0.5 * Math.sin(t * Math.PI) : 0;
    coals(k, u, w, z + 0.02, r, 7, on ? 0.7 + 0.3 * breath : 0.2);
    k.halo(u, w, z + 0.6, on ? 4 + breath : 3, '#ff7a2a', on ? 0.45 : 0.25);
    if (on) fire(k, u, w, z, r * 0.9, 1.6 + breath * 1.4, t, 3);
    // the bellows: two boards hinged at the nozzle, the top one pumping
    bellows(k, on ? 0.18 + 0.2 * Math.sin(t * Math.PI) : 0.18);
    // the ingot on the anvil: cold iron, or glowing
    const { u: au, v: av, z: az } = ANVIL;
    const glow = on ? 0.6 + 0.4 * Math.sin(t * Math.PI) : 0;
    k.box(au - 0.7, av - 0.25, az, 1.4, 0.5, 0.3, on ? (glow > 0.5 ? '#ffd060' : '#ff9a30') : '#5a4a4a', { line: k.thin, stripe: false });
    if (on) k.halo(au, av, az + 0.3, 2.2, '#ffb040', 0.4 * glow + 0.2);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const { u, v: w, z } = COALS;
    if (!v.active) {
      if (due(v.t, dt, 0.5, v.seed)) spawn(puff(3.8, 1.6, 15.2, Math.floor(v.t * 10), 0, [60, 48, 52]));
      return;
    }
    const n = due(v.t, dt, 3, v.seed);
    for (let i = 0; i < n; i++) spawn(ember(u, w, z + 1.5, Math.floor(v.t * 10), i, 2.4));
    // a shower off the anvil every so often
    if (Math.floor(v.t * 1.4) !== Math.floor((v.t - dt) * 1.4)) {
      for (let i = 0; i < 7; i++) spawn(sparkAt(ANVIL.u, ANVIL.v, ANVIL.z + 0.4, Math.floor(v.t * 10), i, 9));
    }
    if (due(v.t, dt, 1.2, v.seed + 1)) spawn(puff(3.8, 1.6, 15.2, Math.floor(v.t * 10), 1, [70, 54, 56]));
  },
};

// Brick courses across the face v = n of a box from u0 to u1, z0 to z1.
function brickLines(k: Kit, u0: number, u1: number, n: number, z0: number, z1: number): void {
  const pen = k.pen;
  pen.beginPath();
  for (let z = z0, r = 0; z < z1; z += 0.9, r++) {
    const [x0, y0] = k.p(u0 + 0.1, n, z);
    const [x1, y1] = k.p(u1 - 0.1, n, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
    for (let u = u0 + (r & 1 ? 0.9 : 0.3); u < u1 - 0.2; u += 1.8) {
      const [p0, q0] = k.p(u, n, z);
      const [p1, q1] = k.p(u, n, Math.min(z1, z + 0.9));
      pen.moveTo(p0, q0);
      pen.lineTo(p1, q1);
    }
  }
  pen.strokeStyle = '#2a1214b0';
  pen.lineWidth = Math.max(0.6, 0.1 * k.s);
  pen.lineCap = 'butt';
  pen.stroke();
}

// The bellows on the forge's +u side: a lower board, leather pleats and an
// upper board hinged at the nozzle, open by `open` radians.
function bellows(k: Kit, open: number): void {
  const hu = 8.0;
  const hz = 3.0;
  const L = 2.6;
  const W = 1.3;
  const cv = 3.3;
  const board = (a: number, z0: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const th = -Math.PI / 2 + (i / 8) * Math.PI;
      const along = L * 0.55 + Math.cos(th) * L * 0.45;
      const across = Math.sin(th) * W;
      pts.push([hu + along * Math.cos(a), cv + across, z0 + along * Math.sin(a)]);
    }
    pts.push([hu, cv + W * 0.3, z0], [hu, cv - W * 0.3, z0]);
    return pts;
  };
  const lo = board(-0.05, hz - 0.3);
  const hi = board(open, hz + 0.3);
  // the leather between, as the hull of the two boards' outer points
  const scr = [...lo, ...hi].map((p) => k.p(...p));
  k.fill(hull(scr), k.grad(lo[4], hi[4], [[0, '#6e3424'], [1, '#8a4a30']]), k.lw);
  if (k.s >= 5) {
    const pen = k.pen;
    pen.beginPath();
    for (const f of [0.33, 0.66]) {
      for (let i = 0; i <= 8; i++) {
        const p = lo[i];
        const q = hi[i];
        const [x, y] = k.p(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, p[2] + (q[2] - p[2]) * f);
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      }
    }
    pen.strokeStyle = '#3a1a14a0';
    pen.lineWidth = Math.max(0.7, 0.1 * k.s);
    pen.stroke();
  }
  k.poly(hi, C.ebonyLight, k.lw);
  const hc = hi[4];
  k.rod([hc, [hc[0] + 0.9 * Math.cos(open), hc[1], hc[2] + 0.9 * Math.sin(open) + 0.2]], C.ebony, 0.22);
}

// ── web: the scrying cauldron ────────────────────────────────────────────────
// A great black cauldron on clawed feet over a fire of bones, brimming with
// green soulfire, skulls round its foot, its bone ladle leaning in it (in
// the witch's hand while she works it: she stands at its side, see
// npcs.ts). Worked, a vortex turns in the brew, the fire under it roars and
// wisps of soul rise off it; each goes round in two seconds, so a worked
// cauldron loops cleanly.

export const POT = { u: 4.5, v: 4.4, z0: 1.6, z1: 6.6, r: 3.2, rim: 2.75 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const { u, v: w, z0, z1, r, rim } = POT;
    const k = still(v, 'web', 15, (k) => {
      k.shadow(u, w, 4.2, 4.0, 0.32);
      // the fire bed of charred logs and bones
      k.pool(u, w, 4.5, 4.5, '#5fe0b0', 0.25);
      for (const [a, b] of [[[1.6, 3.2, 0.3], [6.8, 5.6, 0.3]], [[2.4, 6.6, 0.3], [6.6, 2.4, 0.3]]] as Array<[P3, P3]>) k.rod([a, b], '#3a2220', 0.55);
      coals(k, u, w, 0.35, 1.8, 11, 0.4);
      // the pot: legs, the bulging body, its rim
      for (const a of [0.6, 2.7, 4.8]) {
        const lu = u + Math.cos(a) * r * 0.75;
        const lw = w + Math.sin(a) * r * 0.75;
        k.rod([[lu, lw, z0 + 0.6], [lu + Math.cos(a) * 0.5, lw + Math.sin(a) * 0.5, 0.2]], C.iron, 0.35);
        k.dot(lu + Math.cos(a) * 0.55, lw + Math.sin(a) * 0.55, 0.2, 0.42 * k.s, 0.24 * k.s, C.ironLight, k.thin);
      }
      potBody(k);
      // runes cast round its belly
      if (k.s >= 4) {
        for (let i = 0; i < 5; i++) {
          const a = Math.PI * (0.05 + i * 0.22);
          const ru = u + Math.cos(a + 0.79) * r * 0.99;
          const rv = w + Math.sin(a + 0.79) * r * 0.99;
          k.line([[ru, rv, 3.6], [ru, rv, 4.4], [ru + 0.2, rv - 0.2, 4.0]], '#6a8a7a', Math.max(0.7, 0.1 * k.s));
        }
      }
      k.cyl(u, w, z1 - 0.2, rim + 0.15, 0.45, C.iron);
      k.disc(u, w, z1 + 0.26, rim - 0.1, '#0e2a24', 0);
      // skulls by its foot
      skull(k, u + 3.3, w + 2.2, 0, 0.7, { tilt: 0.2 });
      skull(k, u - 2.4, w + 3.5, 0, 0.6, { tilt: -0.3 });
      // pick a few bones off the fire bed
      for (const [a, b] of [[[6.6, 7.6, 0.2], [7.8, 8.2, 0.25]], [[1.2, 6.2, 0.2], [0.7, 7.6, 0.25]]] as Array<[P3, P3]>) bone(k, a, b, 0.3);
    });
    const on = v.active;
    const t = v.t;
    // the flames licking up round the pot
    const lick = on ? 1 : 0.55;
    for (const [i, a] of [0.2, 1.4, 2.6].entries()) {
      const fu = u + Math.cos(a + 0.6) * r * 0.95;
      const fv = w + Math.sin(a + 0.6) * r * 0.95;
      flame(k, fu, fv, 0.4, 0.6, (1.6 + (on ? 0.5 * Math.sin(t * TAU + i * 2) : 0)) * lick, on ? Math.sin(t * TAU * 1.5 + i) * 0.25 : 0, ['#3fbf8a', '#8ff2d0', '#e8fff4']);
    }
    // the brew: still, or turning into a vortex
    const zb = z1 + 0.27;
    const br = rim - 0.15;
    k.disc(u, w, zb, br, k.rgrad(u, w, zb, br, [[0, on ? '#e8fff0' : '#bff8e0'], [0.45, C.soul], [1, C.soulDeep]]), 0);
    const pen = k.pen;
    if (on) {
      pen.beginPath();
      for (let arm = 0; arm < 3; arm++) {
        for (let i = 0; i <= 14; i++) {
          const f = i / 14;
          const a = t * (TAU / 3) + arm * (TAU / 3) + f * 3.2;
          const rr = br * (0.12 + f * 0.8);
          const [x, y] = k.p(u + Math.cos(a) * rr, w + Math.sin(a) * rr, zb + 0.01);
          if (i) pen.lineTo(x, y);
          else pen.moveTo(x, y);
        }
      }
      pen.strokeStyle = '#1f7a60';
      pen.lineWidth = Math.max(1, 0.24 * k.s);
      pen.lineCap = 'round';
      pen.stroke();
      // an eye opening in the middle of it
      const [ex, ey] = k.p(u, w, zb + 0.02);
      const open = 0.6 + 0.4 * Math.sin(t * Math.PI);
      pen.beginPath();
      pen.ellipse(ex, ey, 0.9 * k.s, 0.42 * k.s * open, 0, 0, Math.PI * 2);
      k.paint('#fff6d8', k.thin);
      pen.beginPath();
      pen.ellipse(ex + Math.sin(t * Math.PI) * 0.25 * k.s, ey, 0.34 * k.s, 0.34 * k.s * open, 0, 0, Math.PI * 2);
      k.paint('#c03a1e', 0);
      pen.beginPath();
      pen.ellipse(ex + Math.sin(t * Math.PI) * 0.25 * k.s, ey, 0.1 * k.s, 0.26 * k.s * open, 0, 0, Math.PI * 2);
      k.paint(INK, 0);
    }
    // bubbles: swelling and bursting while it boils, two resting when not
    for (let i = 0; i < (on ? 5 : 2); i++) {
      const ph = on ? (t * 1.5 + hash(i, 41)) % 1 : 0.4 + i * 0.3;
      const a = hash(i, 42) * Math.PI * 2;
      const rr = br * (0.3 + hash(i, 43) * 0.55);
      const R = (0.15 + ph * 0.3) * k.s;
      k.dot(u + Math.cos(a) * rr, w + Math.sin(a) * rr, zb + 0.05, R, R * 0.7, '#d8fff0', k.thin * 0.6);
    }
    k.halo(u, w, zb + 1.2, on ? 5 : 3.6, '#7ff0c8', on ? 0.42 : 0.26);
    // the ladle leaning in it, while the witch is away
    if (!on) {
      bone(k, [u + 1.2, w - 1.0, zb - 0.4], [u + 2.6, w - 2.0, zb + 3.2], 0.28);
      k.dot(u + 1.1, w - 0.9, zb, 0.5 * k.s, 0.3 * k.s, C.boneShade, k.thin);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 2.4 : 0.5, v.seed);
    for (let i = 0; i < n; i++) spawn(mote(POT.u, POT.v, POT.z1 + 0.6, Math.floor(v.t * 10), i, SOUL, 3.2));
    if (v.active && due(v.t, dt, 1.4, v.seed + 3)) spawn(puff(POT.u, POT.v, POT.z1 + 0.5, Math.floor(v.t * 10), 2, [120, 220, 180], 'steam'));
  },
};

// The cauldron's body: a black iron belly, lit from the upper left, the
// soul-glow catching its rim.
function potBody(k: Kit): void {
  const { u, v: w, z0, z1, r } = POT;
  const mid = k.ell(u, w, (z0 + z1) / 2 + 0.2, r);
  const top = k.ell(u, w, z1, POT.rim + 0.1);
  const bot = k.ell(u, w, z0, r * 0.55);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(top.cx - top.rx, top.cy);
  pen.bezierCurveTo(mid.cx - mid.rx * 1.02, top.cy + (mid.cy - top.cy) * 0.4, mid.cx - mid.rx * 1.05, mid.cy + (bot.cy - mid.cy) * 0.5, bot.cx - bot.rx, bot.cy);
  pen.ellipse(bot.cx, bot.cy, bot.rx, bot.ry, 0, Math.PI, 0, true);
  pen.bezierCurveTo(mid.cx + mid.rx * 1.05, mid.cy + (bot.cy - mid.cy) * 0.5, mid.cx + mid.rx * 1.02, top.cy + (mid.cy - top.cy) * 0.4, top.cx + top.rx, top.cy);
  pen.closePath();
  const g = pen.createRadialGradient(mid.cx - mid.rx * 0.45, mid.cy - (mid.cy - top.cy) * 0.5, 0, mid.cx, mid.cy, mid.rx * 1.25);
  g.addColorStop(0, '#6a6070');
  g.addColorStop(0.35, '#3c3440');
  g.addColorStop(1, '#16101a');
  k.paint(g, k.lw);
  // the green light from the brew catching the rim's underside
  pen.beginPath();
  pen.ellipse(top.cx, top.cy + top.ry * 0.5, top.rx * 0.9, top.ry * 0.8, 0, 0.15 * Math.PI, 0.85 * Math.PI);
  pen.strokeStyle = '#5fe0b040';
  pen.lineWidth = Math.max(1, 0.4 * k.s);
  pen.stroke();
}

// ── think: the bone throne ───────────────────────────────────────────────────
// A throne of bones on an obsidian dais: a crimson cushion, armrests ending
// in skulls, a fan of long bones behind and a great horned skull crowning
// it; iron braziers burning to either side. Brooding on it lights the
// skulls' eyes and the braziers roar.

const BRAZIERS: ReadonlyArray<readonly [number, number]> = [[1.15, 2.6], [10.85, 2.6]];
const CROWN = { u: 6.0, v: 1.9, z: 9.6 };

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'think', 16, (k) => {
      k.shadow(6, 3.5, 6.4, 3.4, 0.32);
      // the dais: two steps
      k.box(2.2, 0.3, 0, 7.6, 6.3, 0.6, C.obsidian, { round: 0.2 });
      k.box(2.8, 0.5, 0.6, 6.4, 4.6, 0.5, C.obsidianLight, { round: 0.15 });
      // the fan of bones behind, then the crown skull
      for (const i of [0, 10, 1, 9, 2, 8, 3, 7, 4, 6, 5]) {
        const a = (i - 5) * 0.17;
        const L = 10.4 - Math.abs(i - 5) * 0.8;
        const bu = 6.0 + (i - 5) * 0.42;
        bone(k, [bu, 1.0, 3.0], [bu + Math.sin(a) * L, 0.9, 3.0 + Math.cos(a) * L], 0.44, i & 1 ? C.boneShade : C.bone);
      }
      // the back: a tall slab padded in velvet, buttoned in gold
      k.box(3.8, 0.9, 1.1, 4.4, 1.3, 9.0, C.velvetDark, { round: 0.4 });
      k.poly([[4.2, 2.21, 2.0], [7.8, 2.21, 2.0], [7.8, 2.21, 9.4], [6.0, 2.21, 10.0], [4.2, 2.21, 9.4]], k.vgrad(6, 2.21, 2, 10, [[0, C.velvetDark], [1, C.velvet]]), k.thin, 0.4);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) k.dot(4.9 + i * 1.1 + (j & 1) * 0.55, 2.25, 4.0 + j * 1.8, 0.14 * k.s, 0.14 * k.s, C.gold);
      // the seat and its cushion
      k.box(3.8, 2.1, 1.1, 4.4, 3.0, 2.2, C.ebony);
      k.box(4.0, 2.2, 3.3, 4.0, 2.8, 0.7, C.velvet, { round: 0.3 });
      // legs and armrests of bone, skulls on their ends
      for (const u of [3.8, 8.2]) {
        bone(k, [u, 5.0, 1.1], [u, 5.0, 5.0], 0.44);
        bone(k, [u, 1.6, 5.0], [u, 5.1, 5.0], 0.52);
      }
      skull(k, 3.8, 5.4, 4.7, 0.7);
      skull(k, 8.2, 5.4, 4.7, 0.7);
      hornSkull(k, CROWN.u, CROWN.v, CROWN.z, 1.35);
      // the brazier stands
      for (const [bu, bv] of BRAZIERS) {
        k.shadow(bu, bv, 1.3, 1.2, 0.26);
        for (const a of [0.4, 2.5, 4.6]) k.rod([[bu + Math.cos(a) * 0.9, bv + Math.sin(a) * 0.9, 0], [bu + Math.cos(a) * 0.35, bv + Math.sin(a) * 0.35, 4.4]], C.iron, 0.16);
        frustum(k, bu, bv, 4.3, 0.55, 5.4, 1.1, C.iron, '#1a0a0a');
        coals(k, bu, bv, 5.25, 0.9, 5, 0.6);
      }
    });
    const on = v.active;
    const t = v.t;
    // the braziers' fire
    for (const [i, [bu, bv]] of BRAZIERS.entries()) {
      const h = on ? 2.6 + 0.5 * Math.sin(t * 6 + i * 2) : 1.6;
      fire(k, bu, bv, 5.3, 0.95, h, on ? t + i / 2 : 0, i);
      k.halo(bu, bv, 6.2, on ? 4.5 : 3.2, '#ff8a3a', on ? 0.42 : 0.3);
    }
    // the crown skull's eyes, burning while someone broods
    if (on) {
      const n = 0.7 + 0.3 * Math.sin(t * 4);
      for (const d of [-1, 1]) {
        const [x, y] = k.p(CROWN.u, CROWN.v + 0.2, CROWN.z);
        const R = 1.35 * k.s;
        k.pen.beginPath();
        k.pen.ellipse(x + d * R * 0.4, y - R * 1.05 + R * 0.18, R * 0.24, R * 0.28, d * 0.25, 0, Math.PI * 2);
        k.paint('#ffb030', 0);
      }
      k.halo(CROWN.u, CROWN.v, CROWN.z + 1.4, 3.4, '#ff6a2a', 0.35 * n);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 4 : 1.2, v.seed);
    for (let i = 0; i < n; i++) {
      const [bu, bv] = BRAZIERS[(Math.floor(v.t * 10) + i) & 1];
      spawn(ember(bu, bv, 6.4, Math.floor(v.t * 10), i, 1.2));
    }
  },
};

// A great horned skull, sitting on (u, v, z): a demon's, crowning a throne.
function hornSkull(k: Kit, u: number, v: number, z: number, r: number): void {
  for (const d of [-1, 1]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const f = i / 8;
      pts.push([u + d * (r * 0.8 + f * r * 1.6 + Math.sin(f * Math.PI) * r * 0.3), v, z + r * 1.6 + f * r * 1.9 + f * f * r * 0.8]);
    }
    const thick = (f: number) => r * 0.45 * (1 - f) + 0.05;
    const top = pts.map((p, i) => [p[0] - d * thick(i / 8) * 0.4, p[1], p[2] + thick(i / 8)] as P3);
    const bot = pts.map((p, i) => [p[0] + d * thick(i / 8) * 0.4, p[1], p[2] - thick(i / 8)] as P3).reverse();
    k.poly([...top, ...bot], k.side('#e6d4ae', d, 0, 0.2), k.lw);
  }
  skull(k, u, v, z, r);
}

// ── idle: the fire pit ───────────────────────────────────────────────────────
// A ring of rough stones round a brimstone fire, two bone skewers of toasting
// marshmallows propped on it, an obsidian bench behind, a pile of velvet
// cushions, a skull goblet and a stack of bones for the fire. Where tired
// agents curl up. Still (its embers rise as particles).

const PIT = { u: 7.4, v: 6.0, r: 2.4 };

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.4, 5.4, 7.6, 5.4, 0.28);
    // the bench behind: an obsidian slab on two skull-carved blocks
    k.shadow(7.5, 1.8, 6, 1.3, 0.25);
    for (const u of [2.6, 11.4]) {
      k.box(u - 0.9, 0.9, 0, 1.8, 1.8, 2.0, C.basaltDark, { round: 0.2 });
      skull(k, u, 2.75, 0.45, 0.55, { base: '#b8a080', line: k.thin });
    }
    k.box(1.2, 0.7, 2.0, 12.6, 2.2, 0.6, C.obsidian, { round: 0.25 });
    k.box(2.0, 0.9, 2.6, 2.4, 1.6, 0.5, C.velvet, { round: 0.3 });
    // cushions piled on the left
    k.shadow(1.8, 6.6, 1.8, 1.6, 0.24);
    k.box(0.6, 5.2, 0, 2.6, 2.6, 0.9, C.velvetDark, { round: 0.45 });
    k.box(0.8, 5.5, 0.9, 2.2, 2.0, 0.8, C.purple, { round: 0.4 });
    k.box(1.4, 6.1, 1.7, 1.3, 1.1, 0.6, C.gold, { round: 0.3 });
    // firewood (and a bone or two) stacked on the right
    k.shadow(13.0, 7.2, 1.6, 1.4, 0.24);
    for (const [z, du] of [[0, 0], [0, 0.9], [0.7, 0.45]] as const) k.rod([[12.2 + du, 6.2, z + 0.35], [12.6 + du, 8.4, z + 0.35]], '#4a2a22', 0.6);
    bone(k, [12.0, 7.0, 1.4], [13.8, 7.6, 1.5], 0.32);
    // a skull goblet on a rock
    rock(k, 12.6, 3.6, 0, 0.9, 1.5, C.basalt, 3);
    goblet(k, 12.6, 3.6, 1.35);
    // the pit: a ring of stones, coals, the fire
    const { u, v: w, r } = PIT;
    k.pool(u, w, 6.5, 5.5, '#ff8a3a', 0.35);
    k.disc(u, w, 0.02, r + 0.3, '#1a0a0a', 0);
    coals(k, u, w, 0.15, r * 0.85, 13, 0.6);
    const stones: Array<{ d: number; f: () => void }> = [];
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2;
      const su = u + Math.cos(a) * (r + 0.2);
      const sv = w + Math.sin(a) * (r + 0.2);
      stones.push({ d: su + sv, f: () => rock(k, su, sv, 0, 0.75 + hash(i, 5) * 0.2, 0.9 + hash(i, 6) * 0.5, i & 1 ? C.basalt : C.basaltLight, i + 20) });
    }
    stones.sort((p, q) => p.d - q.d);
    const back = stones.filter((s) => s.d < u + w);
    const front = stones.filter((s) => s.d >= u + w);
    for (const s of back) s.f();
    fire(k, u, w, 0.3, r * 0.8, 3.8, 0, 7, ['#ff7a1f', '#ffc23a', '#fff1b0']);
    k.halo(u, w, 2.2, 5, '#ff9a3a', 0.45);
    for (const s of front) s.f();
    // the skewers propped on the ring, marshmallows toasting
    for (const [su, sv, eu, ev] of [[4.0, 8.4, 6.4, 6.6], [10.6, 8.8, 8.6, 6.8]] as const) {
      bone(k, [su, sv, 0.4], [eu, ev, 2.6], 0.2, C.boneShade);
      for (let i = 0; i < 2; i++) {
        const f = 0.62 + i * 0.16;
        const mu = su + (eu - su) * f;
        const mv = sv + (ev - sv) * f;
        const mz = 0.4 + 2.2 * f;
        k.dot(mu, mv, mz + 0.15, 0.4 * k.s, 0.34 * k.s, i ? '#f4e2c0' : '#e0a060', k.thin);
      }
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 2.2, v.seed);
    for (let i = 0; i < n; i++) spawn(ember(PIT.u, PIT.v, 2.5, Math.floor(v.t * 10), i, 2.4));
    if (due(v.t, dt, 0.6, v.seed + 2)) spawn(puff(PIT.u, PIT.v, 4.4, Math.floor(v.t * 10), 1, [70, 56, 60]));
  },
};

// A goblet carved from a skull, on a bone stem.
function goblet(k: Kit, u: number, v: number, z: number): void {
  k.cyl(u, v, z, 0.45, 0.15, C.gold, { line: k.thin });
  k.rod([[u, v, z + 0.15], [u, v, z + 0.9]], C.gold, 0.14);
  skull(k, u, v + 0.1, z + 0.75, 0.48, { jaw: false });
  k.disc(u, v, z + 1.65, 0.36, '#8c1a1a', k.thin * 0.7);
}

// ── entrance: the black iron gate ────────────────────────────────────────────
// An arch of dark stone crowned with a horned skull, two leaves of spiked
// iron bars across it, the red glow of the way down beyond; braziers burn
// to either side. The gate swings in while someone comes or goes.

const GATE = { u0: 3.5, u1: 10.5, h: 13.0 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = GATE;
    const k = still(v, 'entrance', 21, (k) => {
      const mid = (u0 + u1) / 2;
      // beyond: steps down into the red glow
      const out = -0.6;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h + 2.5], [u0, out, h + 2.5]], k.vgrad(mid, out, 0, h + 2.5, [[0, '#ffb04a'], [0.25, '#e0501e'], [0.6, '#7a1a16'], [1, '#2a0a0e']]), 0);
      for (let i = 0; i < 4; i++) k.poly([[u0, out, i * 0.9], [u1, out, i * 0.9], [u1, out, i * 0.9 + 0.35], [u0, out, i * 0.9 + 0.35]], '#3a0e0e90', 0);
      k.halo(mid, out, 2.5, 5, '#ffc060', 0.5);
      // the reveal
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h + 2.5], [u0, out, h + 2.5]], k.side('#4a2024', 1, 0), 0);
      // the piers and the arch
      for (const [a, b] of [[u0 - 1.6, u0], [u1, u1 + 1.6]] as const) {
        k.box(a, 0, 0, b - a, 1.4, h, '#4a2a2e', { stripe: false });
        brickLines(k, a, b, 1.41, 0.9, h - 0.2);
        k.box(a - 0.2, 0, h - 0.2, b - a + 0.4, 1.7, 0.6, '#3a1e24');
      }
      const arch: P3[] = [];
      for (let i = 0; i <= 12; i++) {
        const th = Math.PI * (i / 12);
        arch.push([mid + Math.cos(th) * (mid - u0 + 1.6), 1.4, h + 0.4 + Math.sin(th) * 3.8]);
      }
      for (let i = 12; i >= 0; i--) {
        const th = Math.PI * (i / 12);
        arch.push([mid + Math.cos(th) * (mid - u0), 1.4, h + 0.4 + Math.sin(th) * 2.6]);
      }
      k.poly(arch.map(([a, , c]) => [a, 0, c] as P3), '#2e1418', k.lw);
      k.poly(arch, '#4a2a2e', k.lw);
      // voussoir joints
      const pen = k.pen;
      pen.beginPath();
      for (let i = 1; i < 9; i++) {
        const th = Math.PI * (i / 9);
        const [x0, y0] = k.p(mid + Math.cos(th) * (mid - u0), 1.41, h + 0.4 + Math.sin(th) * 2.6);
        const [x1, y1] = k.p(mid + Math.cos(th) * (mid - u0 + 1.6), 1.41, h + 0.4 + Math.sin(th) * 3.8);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#2a1214';
      pen.lineWidth = Math.max(0.7, 0.12 * k.s);
      pen.stroke();
      // the glow showing through over the gate, under the arch
      const lun: P3[] = [];
      for (let i = 0; i <= 12; i++) {
        const th = Math.PI * (i / 12);
        lun.push([mid + Math.cos(th) * (mid - u0), 0.2, h + 0.4 + Math.sin(th) * 2.6]);
      }
      k.poly(lun, k.vgrad(mid, 0.2, h, h + 3, [[0, '#a02818'], [1, '#3a0a0e']]), 0);
      // iron spikes on top of the piers, the horned skull keystone
      for (const u of [u0 - 0.8, u1 + 0.8]) for (const du of [-0.45, 0, 0.45]) spike(k, u + du, 0.7, h + 0.4, du ? 1.2 : 1.8, 0.3, C.ironLight);
      hornSkull(k, mid, 1.6, h + 4.6, 1.0);
      // braziers to either side
      for (const bu of [1.1, 13.9]) {
        k.shadow(bu, 2.4, 1.1, 1.0, 0.25);
        for (const a of [0.4, 2.5, 4.6]) k.rod([[bu + Math.cos(a) * 0.75, 2.4 + Math.sin(a) * 0.75, 0], [bu + Math.cos(a) * 0.3, 2.4 + Math.sin(a) * 0.3, 3.8]], C.iron, 0.14);
        frustum(k, bu, 2.4, 3.7, 0.45, 4.6, 0.9, C.iron, '#1a0a0a');
        coals(k, bu, 2.4, 4.5, 0.75, 9, 0.6);
        fire(k, bu, 2.4, 4.55, 0.8, 2.2, 0, 3);
        k.halo(bu, 2.4, 5.5, 3.4, '#ff8a3a', 0.4);
      }
      // the threshold, worn
      k.poly([[u0, 0, 0.04], [u1, 0, 0.04], [u1, 1.4, 0.04], [u0, 1.4, 0.04]], '#2f2436', k.thin);
    });
    // the gate: shut, or swung in while someone passes
    const th = v.active ? 0.95 + 0.06 * Math.sin(v.t * 2.2) : 0;
    gateLeaf(k, th, false);
    gateLeaf(k, th, true);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) {
      if (due(v.t, dt, 0.8, v.seed)) spawn(ember(hash(Math.floor(v.t), 1) < 0.5 ? 1.1 : 13.9, 2.4, 5.6, Math.floor(v.t * 10), 0, 0.8));
      return;
    }
    // heat and embers blowing in at the open gate
    const n = due(v.t, dt, 6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const j = (q: number) => hash(tick, q);
      spawn({ kind: 'ember', x: GATE.u0 + 1 + j(1) * 5, y: 0.4 + j(2), z: 1 + j(3) * 9, vx: (j(4) - 0.5) * 0.8, vy: 1.6 + j(5) * 1.4, vz: 0.6 + j(6), life: 1.4, color: [255, 120 + Math.round(j(7) * 80), 40], glow: true, gravity: -0.3 });
    }
  },
};

// One leaf of the gate, hinged at its pier, opened th radians into the room.
function gateLeaf(k: Kit, th: number, right: boolean): void {
  const { u0, u1, h } = GATE;
  const w = (u1 - u0) / 2 - 0.05;
  const hu = right ? u1 : u0;
  const dir = right ? -1 : 1;
  const du = Math.cos(th) * dir;
  const dv = Math.sin(th);
  const P = (s: number, z: number): P3 => [hu + du * s, 0.5 + dv * s, z];
  const bars = 5;
  const iron = C.iron;
  const lines: P3[][] = [];
  for (let i = 0; i <= bars; i++) {
    const s = 0.15 + ((w - 0.3) * i) / bars;
    lines.push([P(s, 0.2), P(s, h - 0.6 + (i % 2) * 0.3)]);
  }
  const rails = [0.8, h * 0.5, h - 1.4].map((z) => [P(0, z), P(w, z)]);
  const width = Math.max(1.2, 0.26 * k.s);
  // all the bars and rails in one path, inked then ironed
  const pen = k.pen;
  pen.beginPath();
  for (const [a, b] of [...lines, ...rails]) {
    const [x0, y0] = k.p(...a);
    const [x1, y1] = k.p(...b);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  pen.strokeStyle = INK;
  pen.lineWidth = width + k.thin * 1.4;
  pen.stroke();
  pen.strokeStyle = iron;
  pen.lineWidth = width;
  pen.stroke();
  // spear points on the bars
  for (let i = 0; i <= bars; i++) {
    const s = 0.15 + ((w - 0.3) * i) / bars;
    const zt = h - 0.6 + (i % 2) * 0.3;
    spike(k, ...P(s, zt - 0.15), 0.9, 0.3, C.ironLight);
  }
  // a ring of iron and a skull boss on the middle rail
  const [mx, my] = k.p(...P(w * 0.55, h * 0.5));
  const R = 0.7 * k.s;
  k.pen.beginPath();
  k.pen.arc(mx, my, R, 0, Math.PI * 2);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = width + k.thin;
  k.pen.stroke();
  k.pen.strokeStyle = C.ironLight;
  k.pen.lineWidth = width * 0.8;
  k.pen.stroke();
  const sp = P(w * 0.55, h * 0.5 - 0.6);
  skull(k, sp[0], sp[1] + 0.05, sp[2], 0.42, { base: C.boneShade });
  // hinges
  for (const z of [1.4, h - 2]) k.dot(...P(0.1, z), 0.3 * k.s, 0.3 * k.s, C.ironLight, k.thin);
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
