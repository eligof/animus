import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import type { Quad } from './bits.ts';
import { beanbag, bookRow, cable, can, code, crate, crt, droop, duck, fanBlades, flat, gamingChair, glass, lyingCan, mug, pizzaBox, prompt, rain, ring, fillPts, hullPts, sheen, snakePlant, sticker, STICKERS } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, CANS, INK, due, hash, inset, kitOf, on, pace, still, wisp, withAlpha } from './kit.ts';

// The den's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame; idle, they
// step slowly (see pace), so their pictures seldom change.

type Spawn = (p: Particle) => void;

// ── write: the battlestation ────────────────────────────────────────────────
// A long desk against the wall with three monitors (the middle one wide,
// the right one turned on end), a keyboard with a glowing underside, a
// mouse on a big mat, cans, a mug, a headphone stand; a tower with a glass
// side under the end, and a gaming chair pulled out. Working fills the
// screens with scrolling code and lights the keyboard and the fans.

const W_TOP = 6.6;

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 14, (k) => {
      k.shadow(5.5, 3.2, 6.6, 3.8, 0.32);
      // cables behind, down to the floor
      cable(k, droop([3.6, 0.6, W_TOP], [5.6, 0.4, 0.2], 1, 5), '#1c2226', 0.16);
      cable(k, droop([7.2, 0.6, W_TOP], [8.2, 0.5, 0.2], 1, 5), '#2b3a6a', 0.16);
      // the desk: black steel legs and frame, a dark wood top
      for (const [u, w] of [[0.8, 0.8], [0.8, 4.3], [9.4, 0.8]] as const) k.box(u, w, 0, 0.5, 0.5, W_TOP, '#2a2f33', { line: k.thin });
      k.box(0.8, 0.8, 1.0, 9.1, 0.4, 0.4, '#2a2f33', { line: k.thin, stripe: false });
      // the tower under the far end, its glass side to the room
      k.box(7.9, 1.2, 0, 2.6, 3.8, 5.6, '#23272b', { line: k.lw });
      k.poly([[10.52, 1.6, 0.6], [10.52, 4.6, 0.6], [10.52, 4.6, 5.0], [10.52, 1.6, 5.0]], '#0e1416', k.thin);
      k.poly([[8.3, 5.02, 0.5], [10.1, 5.02, 0.5], [10.1, 5.02, 5.1], [8.3, 5.02, 5.1]], shade('#23272b', 0.06), k.thin * 0.7);
      for (const z of [3.6, 3.9, 4.2]) k.line([[8.6, 5.03, z], [9.8, 5.03, z]], '#11161a', Math.max(0.7, 0.1 * k.s));
      k.box(9.4, 4.3, 0, 0.5, 0.5, W_TOP, '#2a2f33', { line: k.thin });
      k.box(0.3, 0.3, W_TOP, 10.4, 4.8, 0.5, C.desk);
      const zt = W_TOP + 0.5;
      // the desk mat, the keyboard, the mouse
      k.poly([[2.6, 2.6, zt + 0.01], [9.2, 2.6, zt + 0.01], [9.2, 4.8, zt + 0.01], [2.6, 4.8, zt + 0.01]], '#1a1f22', k.thin * 0.7, 0.3);
      k.line([[2.75, 4.65, zt + 0.02], [9.05, 4.65, zt + 0.02]], withAlpha(C.green, 0.5), Math.max(0.6, 0.06 * k.s));
      k.box(3.4, 3.0, zt, 4.2, 1.4, 0.32, '#2a2f33', { line: k.thin });
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (let r = 0; r < 4; r++) for (let i = 0; i < 12; i++) k.trace([[3.6 + i * 0.32, 3.15 + r * 0.3, zt + 0.33], [3.84 + i * 0.32, 3.15 + r * 0.3, zt + 0.33], [3.84 + i * 0.32, 3.38 + r * 0.3, zt + 0.33], [3.6 + i * 0.32, 3.38 + r * 0.3, zt + 0.33]]);
        pen.fillStyle = '#4a5258';
        pen.fill();
      }
      k.box(8.1, 3.4, zt, 0.6, 0.9, 0.3, '#2a2f33', { line: k.thin, round: 0.2 });
      // the monitors: left, turned in; the wide one; the right on end
      flat(k, 1.9, 1.5, zt, 2.9, 2.0, -0.5);
      flat(k, 5.3, 1.25, zt, 4.6, 2.6, 0);
      flat(k, 8.75, 1.5, zt, 1.9, 3.1, 0.45);
      // sticky notes on the wide one's bezel
      for (const [du, c] of [[-2.15, '#ffe066'], [2.1, '#ff8ac8']] as const) k.poly([[5.3 + du - 0.25, 1.43, zt + 1.1], [5.3 + du + 0.25, 1.43, zt + 1.1], [5.3 + du + 0.25, 1.43, zt + 1.6], [5.3 + du - 0.25, 1.43, zt + 1.6]], c, 0);
      // cans and a mug, a headphone stand
      can(k, 1.4, 3.6, zt, CANS[0]);
      can(k, 2.1, 4.2, zt, CANS[2]);
      lyingCan(k, 0.8, 4.4, 1.6, 4.9, zt, CANS[1]);
      mug(k, 9.9, 3.6, zt, '#e9ecea');
      k.cyl(10.1, 1.6, zt, 0.45, 0.12, '#2a2f33', { line: k.thin });
      k.rod([[10.1, 1.6, zt], [10.1, 1.6, zt + 2.4]], '#3a4045', 0.12);
      k.rod([[9.6, 1.6, zt + 1.2], [9.65, 1.6, zt + 2.3], [10.1, 1.6, zt + 2.7], [10.55, 1.6, zt + 2.3], [10.6, 1.6, zt + 1.2]], '#2a2f33', 0.22);
      for (const du of [-0.5, 0.5]) k.box(10.1 + du - 0.22, 1.3, zt + 0.9, 0.44, 0.6, 0.8, '#3a4045', { line: k.thin, round: 0.15 });
      // the chair, pulled out to the side
      gamingChair(k, 2.3, 6.0, Math.PI / 2 + 0.75, C.green);
    });
    const t = pace(v);
    // screens: code while worked; idle a dim prompt and a sleeping one
    screensOf().forEach((q, i) => {
      if (v.active) {
        glass(k, q, '#0b1a14', 0.1, 0);
        code(k, inset(q, 0.04), t + i * 3.1, v.seed + i * 17, i === 2 ? 12 : 8, i === 1 ? 2.2 : 1.4);
      } else {
        glass(k, q, i === 1 ? '#07160e' : C.screenOff, 0.1, 0);
        if (i === 1) prompt(k, inset(q, 0.06), Math.floor(v.t * 1.5) % 2 === 0, v.seed);
      }
      sheen(k, q, 0.08);
    });
    // the keyboard's glow and the tower's fans
    if (v.active) {
      const ph = t * 3;
      for (let i = 0; i < 6; i++) {
        const c = mix(C.green, C.cyan, 0.5 + 0.5 * Math.sin(ph + i * 0.8));
        k.line([[3.5 + i * 0.68, 4.42, W_TOP + 0.52], [3.5 + (i + 1) * 0.68, 4.42, W_TOP + 0.52]], c, Math.max(1, 0.16 * k.s));
      }
      k.halo(5.3, 3.0, 9.5, 5.5, C.green, 0.2);
      k.pool(5.5, 3.6, 3.6, 1.5, C.green, 0.25, W_TOP + 0.52);
    }
    // the tower's glass side: two fans and its glow
    const spin = v.active ? t * 9 : 0.4;
    for (const fz of [1.7, 3.9]) {
      const fc: P3 = [10.53, 3.1, fz];
      fillPts(k, ring(k, fc, [1, 0, 0], 0.95, 16), v.active ? '#1f3a2a' : '#151c1e', k.thin * 0.7);
      bladesU(k, fc, 0.85, spin + fz, v.active ? '#5dff8f' : '#3a4a46');
    }
    if (v.active) k.halo(10.6, 3.1, 2.8, 2.6, C.green, 0.25);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 0.9, v.seed);
    for (let i = 0; i < n; i++) spawn(wisp(9.9, 3.6, 8.2, Math.floor(v.t * 10), i));
  },
};

// The write screens' quads (as flat() returns them), for frames where the
// still sprite came from the cache.
function screensOf(): Quad[] {
  const zt = W_TOP + 0.5;
  const q = (cu: number, cv: number, w: number, h: number, ang: number): Quad => {
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const c = (a: number, b: number, z: number): P3 => [cu + ca * a - sa * b, cv + sa * a + ca * b, z];
    const zb = zt + 1.3;
    return [c(-w / 2 + 0.2, 0.17, zb + 0.2), c(w / 2 - 0.2, 0.17, zb + 0.2), c(w / 2 - 0.2, 0.17, zb + h - 0.2), c(-w / 2 + 0.2, 0.17, zb + h - 0.2)];
  };
  return [q(1.9, 1.5, 2.9, 2.0, -0.5), q(5.3, 1.25, 4.6, 2.6, 0), q(8.75, 1.5, 1.9, 3.1, 0.45)];
}

// Fan blades on the plane u = const round c (a case's glass side).
function bladesU(k: Kit, c: P3, r: number, spin: number, color: Color): void {
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * Math.PI * 2;
    const p = (rr: number, da: number): P3 => [c[0], c[1] + Math.cos(a + da) * rr * r, c[2] + Math.sin(a + da) * rr * r];
    k.trace([p(0.25, -0.3), p(0.95, -0.05), p(0.9, 0.4), p(0.25, 0.3)]);
  }
  pen.fillStyle = color;
  pen.fill();
}

// ── read: the reference shelves ─────────────────────────────────────────────
// Steel shelving stacked with manuals, binders, boxed hardware, floppies,
// an old console and a little TV on top; a crate stool with an open book
// and a clip lamp on the upright. Reading lights the lamp and turns pages.

const R_SHELVES = [0.6, 4.9, 9.2, 13.5, 17.8];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 22,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 22, (k) => {
      const F = 3.3;
      k.shadow(5.2, 2.2, 6.2, 2.6, 0.3);
      const posts = [0.3, 5.0, 9.7];
      const steel = '#7f8a86';
      // back posts first, the shelves and what is on them, front posts
      for (const u of posts) k.box(u, 0.1, 0, 0.3, 0.3, 19.4, shade(steel, -0.1), { line: k.thin, stripe: false });
      R_SHELVES.forEach((z, r) => {
        k.box(0.3, 0.1, z, 9.7, F, 0.32, steel, { line: k.thin });
        if (r === R_SHELVES.length - 1) return;
        const zt = z + 0.32;
        const room = R_SHELVES[r + 1] - zt - 0.2;
        const sd = v.seed + r * 13;
        // two bays a shelf, each its own mix
        for (const [bi, [u0, u1]] of ([[0.5, 4.9], [5.2, 9.6]] as const).entries()) {
          const kind = Math.floor(hash(sd, bi, 1) * 5);
          if (kind === 0) {
            bookRow(k, u0, u1, F - 0.3, zt, Math.min(room, 3.2), sd + bi, true);
          } else if (kind === 1) {
            // boxed hardware
            k.box(u0 + 0.1, 0.5, zt, 2.2, 2.6, Math.min(room, 2.4), C.cardboard, { line: k.thin });
            k.box(u0 + 2.4, 0.8, zt, 1.8, 2.3, Math.min(room, 1.6), '#e9ecea', { line: k.thin });
            k.rect(u0 + 2.6, zt + 0.3, u0 + 4.0, zt + 1.2, 3.11, '#2b5fb8', 0);
          } else if (kind === 2) {
            // floppies in a box, a stack of CDs, a few books
            k.box(u0 + 0.1, 0.8, zt, 1.8, 2.2, 1.1, '#2a2f33', { line: k.thin });
            for (let i = 0; i < 5; i++) k.poly([[u0 + 0.25 + i * 0.32, 2.2, zt + 1.1], [u0 + 0.5 + i * 0.32, 2.2, zt + 1.1], [u0 + 0.5 + i * 0.32, 2.2, zt + 1.7], [u0 + 0.25 + i * 0.32, 2.2, zt + 1.7]], ['#2b5fb8', '#c0392f', '#e8b030', '#39a85a', '#2a2f33'][i], k.thin * 0.5);
            for (let i = 0; i < 6; i++) k.cyl(u0 + 2.8, 1.8, zt + i * 0.14, 0.75, 0.14, i & 1 ? '#c3ccc8' : '#9aa5a1', { line: k.thin * 0.6 });
            bookRow(k, u0 + 3.7, u1, F - 0.3, zt, Math.min(room, 2.8), sd + 5);
          } else bookRow(k, u0, u1, F - 0.3, zt, Math.min(room, 3.4), sd + bi * 3);
        }
      });
      for (const u of posts) k.box(u, F - 0.2, 0, 0.3, 0.3, 19.4, steel, { line: k.thin, stripe: false });
      // the holes up the front posts
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (const u of posts) for (let z = 0.8; z < 19; z += 0.6) k.trace([[u + 0.1, F + 0.11, z], [u + 0.2, F + 0.11, z], [u + 0.2, F + 0.11, z + 0.25], [u + 0.1, F + 0.11, z + 0.25]]);
        pen.fillStyle = '#3a4245';
        pen.fill();
      }
      // on top: a little TV with rabbit ears, a console, a cactus
      const top = 18.12;
      const q = crt(k, 0.8, 0.5, top, 3.2, 2.6, 2.6, '#2a2f33');
      glass(k, q, C.screenOff);
      sheen(k, q, 0.1);
      k.rod([[2.0, 1.2, top + 2.5], [1.0, 0.9, top + 3.6]], '#c3ccc8', 0.07);
      k.rod([[2.6, 1.2, top + 2.5], [3.8, 1.0, top + 3.4]], '#c3ccc8', 0.07);
      k.box(4.6, 0.8, top, 2.6, 1.9, 0.7, '#c9c4b8', { line: k.thin });
      k.rect(4.9, top + 0.15, 6.0, top + 0.45, 2.71, '#2a2f33', 0);
      k.cyl(8.6, 1.6, top, 0.6, 0.9, '#c66a42', { line: k.thin });
      k.cyl(8.6, 1.6, top + 0.9, 0.42, 1.5, C.leaf, { line: k.thin });
      // the crate stool, the book on it, a stack of manuals on the floor
      crate(k, 10.8, 1.0, 0, 2.6, 2.6, 2.5, C.milk);
      k.poly([[10.95, 1.15, 2.51], [13.25, 1.15, 2.51], [13.25, 3.45, 2.51], [10.95, 3.45, 2.51]], '#24303a', 0);
      k.poly([[11.2, 1.7, 2.52], [12.1, 1.7, 2.52], [12.1, 3.0, 2.52], [11.2, 3.0, 2.52]], '#ece8dc', k.thin);
      k.poly([[12.1, 1.7, 2.52], [13.0, 1.7, 2.52], [13.0, 3.0, 2.52], [12.1, 3.0, 2.52]], '#f4f1e8', k.thin);
      if (k.fine) for (const u0 of [11.35, 12.25]) for (let i = 0; i < 4; i++) k.line([[u0, 1.95 + i * 0.25, 2.53], [u0 + 0.6, 1.95 + i * 0.25, 2.53]], '#8a8e90', Math.max(0.6, 0.05 * k.s));
      for (let i = 0; i < 4; i++) k.box(10.6 + (hash(v.seed, i, 4) - 0.5) * 0.3, 3.0 - i * 0.05, i * 0.42, 2.2, 1.0, 0.42, ['#2b5fb8', '#c0392f', '#ece8dc', '#e8b030'][i], { line: k.thin * 0.7, stripe: false });
      // the clip lamp's arm off the front post (the shade is drawn live)
      k.rod([[9.85, F + 0.1, 12.0], [10.6, F + 0.6, 13.2], [11.4, F + 0.5, 12.6]], '#2a2f33', 0.14);
    });
    // the lamp: shade toward the book, lit when someone reads
    const on2 = v.active;
    const [cu, cv, cz] = [11.6, 3.7, 12.1];
    const pen = k.pen;
    const tip = k.p(cu, cv, cz);
    const r = 0.75 * k.s;
    pen.beginPath();
    pen.moveTo(tip[0] - r * 0.4, tip[1] - r * 0.6);
    pen.lineTo(tip[0] + r * 0.4, tip[1] - r * 0.6);
    pen.lineTo(tip[0] + r, tip[1] + r * 0.5);
    pen.lineTo(tip[0] - r, tip[1] + r * 0.5);
    pen.closePath();
    k.paint(on2 ? '#d0583e' : '#8a3a2a', k.thin);
    const [bx, by] = [tip[0], tip[1] + r * 0.5];
    pen.beginPath();
    pen.ellipse(bx, by, r, r * 0.35, 0, 0, Math.PI * 2);
    k.paint(on2 ? '#fff3cf' : '#5a4038', k.thin * 0.7);
    if (on2) {
      k.pool(12.1, 2.35, 1.8, 1.5, '#ffe2a0', 0.6, 2.53);
      k.halo(cu, cv, cz - 0.3, 3.2, '#ffd890', 0.45);
      // a page turning
      const ph = (v.t * 0.8) % 1;
      if (ph < 0.45) {
        const a = (ph / 0.45) * Math.PI;
        const tp = (dv: number): P3 => [12.1 + Math.cos(a) * 0.85, dv, 2.55 + Math.sin(a) * 0.85];
        k.poly([[12.1, 1.72, 2.55], tp(1.72), tp(2.98), [12.1, 2.98, 2.55]], '#fbf8ee', k.thin);
      }
    }
  },
};

// ── search: the server racks ────────────────────────────────────────────────
// Two black racks: servers with blinking lights, a switch and a patch panel
// with cables spilling down, a UPS at the foot; a pull-out console with a
// little screen, low enough for the sysadmin standing at the racks' end to
// type at (see npcs.ts); a router and the cat's towel on top. Searching
// runs the lights fast and sweeps the console's screen (once round every
// two seconds); idle they blink slowly.

const RACKS = [[0.4, 5.6], [6.0, 11.2]] as const;
const RF = 3.75; // the racks' front

// Each rack's units from the floor up: kind and height.
type Unit = { z: number; h: number; kind: 'ups' | 'server' | 'disk' | 'switch' | 'patch' | 'blank' | 'console' };
function unitsOf(r: number): Unit[] {
  const plan: Array<[Unit['kind'], number]> = r === 0
    ? [['ups', 2.6], ['server', 1.4], ['console', 1.0], ['blank', 0.5], ['server', 0.9], ['server', 0.9], ['disk', 2.2], ['server', 1.4], ['switch', 0.9], ['patch', 1.0], ['blank', 0.7], ['server', 1.4]]
    : [['ups', 2.6], ['disk', 2.2], ['disk', 2.2], ['server', 1.4], ['blank', 0.5], ['server', 0.9], ['server', 0.9], ['server', 0.9], ['switch', 0.9], ['patch', 1.0], ['server', 1.4], ['blank', 0.8]];
  const out: Unit[] = [];
  let z = 0.6;
  for (const [kind, h] of plan) {
    out.push({ z, h, kind });
    z += h + 0.08;
  }
  return out;
}

// The lights on a rack's front: where they are and their colour.
type Led = { u: number; z: number; c: Color; i: number };
const LEDS = new Map<number, Led[]>();
function ledsOf(): Led[] {
  const hit = LEDS.get(0);
  if (hit) return hit;
  const out: Led[] = [];
  let i = 0;
  RACKS.forEach(([u0, u1], r) => {
    for (const un of unitsOf(r)) {
      if (un.kind === 'server') for (let j = 0; j < 3; j++) out.push({ u: u0 + 0.8 + j * 0.35, z: un.z + un.h * 0.5, c: j === 2 ? C.amber : C.green, i: i++ });
      else if (un.kind === 'disk') for (let j = 0; j < 6; j++) out.push({ u: u0 + 0.9 + j * 0.62, z: un.z + 0.35, c: j % 3 === 2 ? C.cyan : C.green, i: i++ });
      else if (un.kind === 'switch') for (let j = 0; j < 10; j++) out.push({ u: u0 + 0.8 + j * 0.36, z: un.z + un.h - 0.2, c: j % 4 === 0 ? C.amber : C.green, i: i++ });
      else if (un.kind === 'ups') out.push({ u: u1 - 1.0, z: un.z + 1.8, c: C.green, i: i++ });
    }
  });
  LEDS.set(0, out);
  return out;
}

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 20, (k) => {
      k.shadow(5.8, 2.2, 6.8, 2.6, 0.32);
      // cables up the back to the tray
      for (const u of [2.0, 3.0, 8.0, 9.2]) cable(k, [[u, 0.3, 18.5], [u + 0.2, 0.2, 20.5]], '#1c2226', 0.2);
      RACKS.forEach(([u0, u1], r) => {
        k.box(u0, 0.2, 0, u1 - u0, RF - 0.2, 18.6, '#1f2427', { line: k.lw });
        // the rails, then the units in them
        k.rect(u0 + 0.25, 0.4, u1 - 0.25, 18.2, RF + 0.01, '#0d1113', k.thin * 0.7);
        for (const un of unitsOf(r)) unitArt(k, u0 + 0.4, u1 - 0.4, un);
        // vented top
        if (k.fine) for (let i = 0; i < 6; i++) k.line([[u0 + 0.6 + i * 0.75, 0.8, 18.61], [u0 + 0.6 + i * 0.75, RF - 0.6, 18.61]], '#11161a', 0.18 * k.s);
      });
      // cable spaghetti out of the patch panels, looping down the side
      const pz = unitsOf(0).find((u) => u.kind === 'patch')!.z + 0.5;
      const colors = ['#2b5fb8', '#ffd23e', '#c0392f', '#39a85a', '#9a5ad8', '#e9ecea'];
      for (let i = 0; i < 6; i++) {
        const a: P3 = [0.9 + i * 0.6, RF + 0.1, pz];
        const b: P3 = [6.5 + i * 0.55, RF + 0.1, pz + 0.1 + (i % 2) * 0.3];
        cable(k, droop(a, b, 1.6 + hash(v.seed, i, 3) * 2.2, 10).map(([u, w, z], j) => [u, w + Math.sin((j / 10) * Math.PI) * 0.5, z] as P3), colors[i], 0.11);
      }
      for (let i = 0; i < 3; i++) {
        const a: P3 = [11.0 - i * 0.4, RF + 0.1, pz + 0.3];
        cable(k, [a, [11.4 + i * 0.15, RF + 0.3, pz - 1.5], [11.5 + i * 0.1, RF + 0.2, 4.5 + i], [11.3 + i * 0.2, RF + 0.5, 0.1]], colors[(i + 3) % colors.length], 0.11);
      }
      // the pull-out console: a keyboard tray and a little lid screen
      const cz = unitsOf(0).find((u) => u.kind === 'console')!.z;
      k.box(0.9, RF - 0.5, cz + 0.2, 4.2, 1.9, 0.25, '#2a2f33', { line: k.thin });
      k.poly([[1.0, RF + 1.2, cz + 0.46], [5.0, RF + 1.2, cz + 0.46], [5.0, RF + 0.2, cz + 0.46], [1.0, RF + 0.2, cz + 0.46]], '#3a4045', 0);
      k.poly([[1.2, RF - 0.4, cz + 0.45], [4.8, RF - 0.4, cz + 0.45], [4.8, RF - 0.6, cz + 3.0], [1.2, RF - 0.6, cz + 3.0]], '#2a2f33', k.lw);
      // on top: a router, the cat's towel, a fan
      k.box(6.6, 0.8, 18.6, 3.0, 2.0, 0.55, '#e9ecea', { line: k.thin });
      for (const du of [0.3, 2.7]) k.rod([[6.6 + du, 1.0, 19.1], [6.6 + du + (du < 1 ? -0.3 : 0.3), 0.9, 21.0]], '#2a2f33', 0.1);
      k.poly([[0.8, 0.6, 18.62], [4.9, 0.6, 18.62], [5.0, RF - 0.3, 18.62], [0.7, RF - 0.2, 18.62]], '#c96a5a', k.thin, 0.4);
      k.poly([[0.7, RF - 0.2, 18.62], [5.0, RF - 0.3, 18.62], [5.0, RF + 0.05, 17.4], [0.7, RF + 0.05, 17.5]], k.side('#c96a5a', 0, 1, 0.16), k.thin, 0.2);
      for (const z of [17.8, 18.2]) k.line([[0.75, RF + 0.08, z], [4.95, RF + 0.08, z]], '#e9ecea', Math.max(0.7, 0.1 * k.s));
      // glass door's sheen on the second rack's edge
      k.poly([[6.3, RF + 0.02, 1.0], [6.9, RF + 0.02, 1.0], [8.6, RF + 0.02, 17.8], [8.0, RF + 0.02, 17.8]], '#ffffff0a', 0);
    });
    // the lights: idle in slow steps, searching fast
    const t = v.active ? Math.floor(v.t * 8) : Math.floor(v.t * 0.8);
    const leds = ledsOf();
    const groups = new Map<Color, P3[]>();
    for (const l of leds) {
      const onP = hash(l.i, t, 5) < (v.active ? 0.55 : 0.75);
      const c = onP ? l.c : shade(l.c, -0.7);
      (groups.get(c) ?? groups.set(c, []).get(c)!).push([l.u, RF + 0.03, l.z]);
    }
    const pen = k.pen;
    const r = Math.max(0.7, 0.11 * k.s);
    for (const [c, pts] of groups) {
      pen.beginPath();
      for (const p of pts) {
        const [x, y] = k.p(...p);
        pen.moveTo(x + r, y);
        pen.arc(x, y, r, 0, Math.PI * 2);
      }
      pen.fillStyle = c;
      pen.fill();
    }
    // the console's screen
    const cz = unitsOf(0).find((u) => u.kind === 'console')!.z;
    const q: Quad = [[1.45, RF - 0.42, cz + 0.75], [4.55, RF - 0.42, cz + 0.75], [4.55, RF - 0.58, cz + 2.75], [1.45, RF - 0.58, cz + 2.75]];
    glass(k, q, v.active ? '#06180e' : C.screenOff, 0.05, 0);
    if (v.active) {
      // rows scanned, one highlighted, a bar sweeping
      const scan = (v.t * 0.5) % 1;
      code(k, inset(q, 0.05), Math.floor(v.t * 3) / 3, v.seed + 3, 7, 0);
      k.poly([on(q, 0.03, 0.85 - scan * 0.75), on(q, 0.97, 0.85 - scan * 0.75), on(q, 0.97, 0.95 - scan * 0.75), on(q, 0.03, 0.95 - scan * 0.75)], withAlpha(C.green, 0.35), 0);
      k.halo(3.0, RF, cz + 1.8, 3, C.green, 0.25);
      k.halo(5.8, RF + 0.3, 9, 7, C.cyan, 0.08);
    } else prompt(k, inset(q, 0.08), Math.floor(v.t * 1.5) % 2 === 0, v.seed + 1);
    sheen(k, q, 0.08);
  },
};

// One rack unit's front, between u0 and u1.
function unitArt(k: Kit, u0: number, u1: number, un: Unit): void {
  const F = RF + 0.02;
  const { z, h, kind } = un;
  if (kind === 'blank') {
    k.rect(u0, z, u1, z + h, F, '#161b1d', k.thin * 0.6);
    return;
  }
  if (kind === 'console') return;
  const base = kind === 'ups' ? '#2a2f33' : kind === 'switch' ? '#3a4a5a' : kind === 'patch' ? '#2a2f33' : '#4a5258';
  k.rect(u0, z, u1, z + h, F, k.side(base, 0, 1, 0.1), k.thin * 0.7);
  const pen = k.pen;
  if (kind === 'server' || kind === 'disk') {
    // a grille, the drive bays
    pen.beginPath();
    if (kind === 'disk') {
      for (let i = 0; i < 6; i++) k.trace([[u0 + 0.25 + i * 0.62, F + 0.01, z + 0.6], [u0 + 0.75 + i * 0.62, F + 0.01, z + 0.6], [u0 + 0.75 + i * 0.62, F + 0.01, z + h - 0.2], [u0 + 0.25 + i * 0.62, F + 0.01, z + h - 0.2]]);
      pen.fillStyle = '#2e3438';
    } else {
      for (let u = u0 + 1.9; u < u1 - 0.3; u += 0.28) k.trace([[u, F + 0.01, z + 0.2], [u + 0.14, F + 0.01, z + 0.2], [u + 0.14, F + 0.01, z + h - 0.2], [u, F + 0.01, z + h - 0.2]]);
      pen.fillStyle = '#2e3438';
    }
    pen.fill();
    k.line([[u0 + 0.1, F + 0.01, z + h - 0.08], [u1 - 0.1, F + 0.01, z + h - 0.08]], '#6a767a', Math.max(0.6, 0.06 * k.s));
  } else if (kind === 'switch') {
    pen.beginPath();
    for (let i = 0; i < 10; i++) k.trace([[u0 + 0.3 + i * 0.36, F + 0.01, z + 0.15], [u0 + 0.58 + i * 0.36, F + 0.01, z + 0.15], [u0 + 0.58 + i * 0.36, F + 0.01, z + 0.5], [u0 + 0.3 + i * 0.36, F + 0.01, z + 0.5]]);
    pen.fillStyle = '#11161a';
    pen.fill();
  } else if (kind === 'patch') {
    pen.beginPath();
    for (let i = 0; i < 12; i++) k.trace([[u0 + 0.25 + i * 0.32, F + 0.01, z + 0.3], [u0 + 0.47 + i * 0.32, F + 0.01, z + 0.3], [u0 + 0.47 + i * 0.32, F + 0.01, z + 0.65], [u0 + 0.25 + i * 0.32, F + 0.01, z + 0.65]]);
    pen.fillStyle = '#0b0f11';
    pen.fill();
  } else if (kind === 'ups') {
    k.rect(u1 - 2.4, z + 1.2, u1 - 1.4, z + 2.1, F + 0.01, '#1a3a2a', 0);
    if (k.fine) k.line([[u1 - 2.3, F + 0.02, z + 1.5], [u1 - 1.5, F + 0.02, z + 1.5]], '#5dff8f', 0.06 * k.s);
    pen.beginPath();
    for (let u = u0 + 0.4; u < u1 - 2.8; u += 0.3) {
      const [x0, y0] = k.p(u, F + 0.01, z + 0.3);
      const [x1, y1] = k.p(u, F + 0.01, z + h - 0.3);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#1b2023';
    pen.lineWidth = Math.max(0.6, 0.08 * k.s);
    pen.stroke();
  }
}

// ── run: the overclocking rig ───────────────────────────────────────────────
// A steel bench with an open test rig on it: a board on a stand, a card
// with three fans, a reservoir of glowing coolant, tubes, a fan controller
// with a big knob on the stand's end; a box fan, a power strip, a
// multimeter, a fire extinguisher handy. The bench stands out from its
// back, leaving room behind its far end for the overclocker (see
// npcs.ts), whose glove turns the knob; the rig keeps to the near end,
// clear of it. Running spins the fans, bubbles the coolant, runs the
// controller's lights up and down and sends up heat, all round every two
// seconds.

// The bench's top (its height, its back edge out from the station's back)
// and the rig's stand on it (its posts at u0 and u1, the board at back).
export const BENCH = { z: 6.6, back: 2.4, front: 8.0 };
const RIG = { u0: 1.0, u1: 6.6, back: 3.0, z0: BENCH.z };
// The fan controller on the stand's far post: the middle of its face to
// the bench's end, where its knob and lights are.
const KNOB: P3 = [RIG.u1 + 0.67, RIG.back, RIG.z0 + 1.75];

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, back, z0 } = RIG;
    const k = still(v, 'run', 15, (k) => {
      k.shadow(5.5, 5.4, 6.4, 5.4, 0.3);
      // the bench: steel legs, a shelf under with crates, the top
      for (const [u, w] of [[0.6, BENCH.back + 0.4], [9.9, BENCH.back + 0.4], [0.6, 7.3], [9.9, 7.3]] as const) k.box(u, w, 0, 0.5, 0.5, z0 - 0.6, '#5d6864', { line: k.thin });
      k.box(0.6, BENCH.back + 0.4, 1.0, 9.8, 7.4 - BENCH.back, 0.3, '#5d6864', { line: k.thin, stripe: false });
      crate(k, 1.4, 3.1, 1.3, 3.0, 3.6, 2.6, '#c0392f');
      k.box(5.2, 3.3, 1.3, 2.8, 3.2, 2.2, C.cardboard, { line: k.thin });
      k.box(0.2, BENCH.back, z0 - 0.6, 10.6, BENCH.front - BENCH.back, 0.6, '#8a9692');
      // the rig: an aluminium frame, the board standing up in it
      for (const u of [u0, u1]) k.box(u - 0.2, back - 0.2, z0, 0.4, 0.4, 6.4, '#c3ccc8', { line: k.thin });
      k.box(u0 - 0.2, back - 0.2, z0 + 6.2, u1 - u0 + 0.4, 0.4, 0.3, '#c3ccc8', { line: k.thin, stripe: false });
      k.rect(u0 + 0.3, z0 + 0.6, u1 - 0.3, z0 + 6.0, back + 0.05, k.side('#1f3a2a', 0, 1, 0.1), k.thin);
      if (k.fine) {
        // traces on the board
        const pen = k.pen;
        pen.beginPath();
        for (let i = 0; i < 8; i++) {
          const zz = z0 + 1 + hash(v.seed, i, 1) * 4.5;
          const a = u0 + 0.5 + hash(v.seed, i, 2) * 2.4;
          const [x0, y0] = k.p(a, back + 0.06, zz);
          const [x1, y1] = k.p(Math.min(u1 - 0.5, a + 0.8 + hash(v.seed, i, 3) * 2.4), back + 0.06, zz);
          pen.moveTo(x0, y0);
          pen.lineTo(x1, y1);
        }
        pen.strokeStyle = '#3f7a52';
        pen.lineWidth = 0.06 * k.s;
        pen.stroke();
      }
      // the CPU block, RAM sticks (their lights are live)
      k.box(u0 + 2.0, back + 0.05, z0 + 3.4, 1.6, 0.6, 1.6, '#c3ccc8', { line: k.thin });
      for (let i = 0; i < 4; i++) k.box(u0 + 3.9 + i * 0.36, back + 0.05, z0 + 3.0, 0.22, 0.6, 2.6, '#2a2f33', { line: k.thin * 0.6, stripe: false });
      // the reservoir's mounts (its coolant is live), the tubes
      for (const z of [3.0, 6.0]) k.box(u0 + 0.4, back + 0.05, z0 + z, 1.2, 0.5, 0.25, '#c3ccc8', { line: k.thin, stripe: false });
      k.rod([[u0 + 1.0, back + 0.6, z0 + 6.2], [u0 + 1.9, back + 1.0, z0 + 6.4], [u0 + 2.8, back + 0.8, z0 + 5.0]], '#c3ffd8', 0.2);
      k.rod([[u0 + 3.6, back + 0.8, z0 + 4.0], [u0 + 4.0, back + 1.1, z0 + 3.2], [u0 + 4.3, back + 1.0, z0 + 2.9]], '#c3ffd8', 0.2);
      // the card: a long shroud with fans on its front
      k.box(u0 + 0.3, back + 0.6, z0 + 1.0, u1 - u0 - 0.6, 1.0, 1.9, '#2a2f33', { line: k.lw });
      k.line([[u0 + 0.35, back + 1.62, z0 + 2.85], [u1 - 0.35, back + 1.62, z0 + 2.85]], C.magenta, Math.max(0.8, 0.12 * k.s));
      // the fan controller on the far post, its knob to the bench's end
      k.box(u1 + 0.2, back - 0.3, KNOB[2] - 0.75, 0.45, 0.6, 1.5, '#2a2f33', { line: k.thin });
      fillPts(k, ring(k, [KNOB[0] + 0.02, KNOB[1], KNOB[2] - 0.15], [1, 0, 0], 0.27, 14), '#c0392f', k.thin);
      k.line([[KNOB[0] + 0.03, KNOB[1], KNOB[2] - 0.15], [KNOB[0] + 0.03, KNOB[1] - 0.12, KNOB[2] + 0.05]], '#f0e6dc', Math.max(0.7, 0.07 * k.s));
      // a box fan on the bench, a power strip, a multimeter, a can, a
      // screwdriver
      k.box(7.4, 5.6, z0, 2.2, 0.6, 2.4, '#e9ecea', { line: k.lw, round: 0.2 });
      k.box(7.8, 5.7, z0, 1.4, 0.6, 0.15, '#e9ecea', { line: k.thin });
      k.box(1.6, 5.4, z0, 3.2, 0.8, 0.35, '#e9ecea', { line: k.thin });
      for (let i = 0; i < 4; i++) k.dot(2.0 + i * 0.75, 5.8, z0 + 0.36, 0.12, '#2a2f33');
      k.dot(4.5, 5.8, z0 + 0.36, 0.12, '#ff5a4a');
      cable(k, [[1.6, 5.8, z0 + 0.2], [0.6, 6.6, z0 + 0.02], [0.15, 7.6, z0 - 0.3], [0.1, 8.3, z0 - 2.2], [0.5, 9.0, 0.1], [1.6, 9.6, 0.1]], '#1c2226', 0.16);
      k.box(5.4, 6.4, z0, 1.0, 1.4, 0.3, '#e8b030', { line: k.thin });
      k.rect(5.55, z0 + 0.02, 6.25, z0 + 0.3, 7.81, '#2a2f33', 0);
      can(k, 9.6, 7.0, z0, CANS[2]);
      k.rod([[2.0, 7.3, z0 + 0.15], [3.6, 6.7, z0 + 0.15]], '#c0392f', 0.2);
      // the extinguisher on the floor at the front corner
      k.shadow(10.0, 9.8, 0.9, 0.9, 0.25);
      k.cyl(10.0, 9.8, 0, 0.62, 3.0, '#c0392f');
      k.cyl(10.0, 9.8, 3.0, 0.25, 0.5, '#2a2f33', { line: k.thin });
      k.rod([[10.0, 9.8, 3.45], [10.6, 9.6, 3.6], [10.9, 9.3, 2.0]], '#2a2f33', 0.12);
    });
    const t = pace(v, 1);
    // the card's fans turn a fifth of a blade a step, the box fan's a sixth
    // (see CYCLE in art/scene.ts: round in two seconds)
    const spin = v.active ? v.t * 0.8 * Math.PI : 0.3;
    // the reservoir: coolant glowing, bubbles rising while it runs
    const rc: P3 = [u0 + 1.0, back + 0.6, z0 + 3.0];
    const glow = v.active ? 0.85 + 0.15 * Math.sin(v.t * Math.PI) : 0.5;
    k.cyl(rc[0], rc[1], rc[2], 0.5, 3.2, mix('#1a6a3a', C.green, glow * 0.7), { top: mix('#2a8a4a', '#c3ffd8', glow * 0.6) });
    if (v.active) {
      for (let i = 0; i < 3; i++) {
        const ph = (v.t * 0.5 * (i + 1) + hash(i, 5)) % 1;
        k.dot(rc[0] + (hash(i, 6) - 0.5) * 0.4, rc[1] + 0.45, rc[2] + 0.3 + ph * 2.7, 0.1, '#e2ffe8');
      }
      k.halo(rc[0], rc[1] + 0.6, rc[2] + 1.6, 2.6, C.green, 0.3);
    }
    // the card's fans
    for (let i = 0; i < 3; i++) {
      const fc: P3 = [u0 + 1.15 + i * 1.65, back + 1.62, z0 + 1.95];
      fillPts(k, ring(k, fc, [0, 1, 0], 0.74, 16), '#151a1d', k.thin * 0.7);
      fanBlades(k, fc[0], fc[1], fc[2], 0.66, spin + i, v.active ? '#5a6a70' : '#3a4448');
      k.dot(fc[0], fc[1], fc[2], 0.16, '#2a2f33');
    }
    // the RAM's lights, cycling while it runs
    for (let i = 0; i < 4; i++) {
      const hue = v.active ? [C.magenta, C.cyan, C.green, C.amber][(i + Math.floor(t * 4)) % 4] : '#3a4448';
      k.line([[u0 + 4.01 + i * 0.36, back + 0.66, z0 + 5.4], [u0 + 4.01 + i * 0.36, back + 0.66, z0 + 5.6]], hue, Math.max(1, 0.16 * k.s));
    }
    // the fan controller's lights, up and down with the knob
    const lvl = v.active ? Math.round(2.5 + 1.5 * Math.sin(v.t * Math.PI)) : 1;
    for (let i = 0; i < 4; i++) k.dot(KNOB[0], KNOB[1] + (i - 1.5) * 0.14, KNOB[2] + 0.45, 0.06, i < lvl ? [C.green, C.green, C.amber, C.magenta][i] : '#1a2a22');
    // the box fan's blades
    const bc: P3 = [8.5, 6.22, z0 + 1.2];
    fillPts(k, ring(k, bc, [0, 1, 0], 0.95, 16), '#c3ccc8', k.thin * 0.7);
    fanBlades(k, bc[0], bc[1], bc[2], 0.85, v.active ? v.t * (2 / 3) * Math.PI : 0.2, '#7a8a90', 3);
    if (v.active) {
      k.halo((u0 + u1) / 2, back + 1.8, z0 + 2, 4.5, C.magenta, 0.16);
      k.pool((u0 + u1) / 2, back + 2.8, 3.5, 2.2, C.magenta, 0.18, z0 + 0.01);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // heat off the rig
    const n = due(v.t, dt, 3, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      spawn(wisp(RIG.u0 + 0.6 + hash(tick, 1) * (RIG.u1 - RIG.u0 - 1.2), RIG.back + 1, RIG.z0 + 6.8, tick, i, [200, 214, 210]));
    }
    // now and then a spark off the board
    if (due(v.t, dt, 0.6, v.seed + 1)) {
      const j = (q: number) => hash(Math.floor(v.t * 10), q) - 0.5;
      spawn({ kind: 'spark', x: (RIG.u0 + RIG.u1) / 2 + j(1) * 3, y: RIG.back + 1.2, z: RIG.z0 + 3, vx: j(2) * 3, vy: 1 + j(3), vz: 2 + j(4) * 2, life: 0.5, color: [255, 220, 120], glow: true, gravity: 12 });
    }
  },
};

// ── web: the uplink ─────────────────────────────────────────────────────────
// A dish on a tripod aimed at the sky through the wall, a radio cart with a
// glowing waterfall display, a desk mic and headphones, a modem blinking.
// Browsing sweeps the dish, runs the waterfall and sends signal up.

const DISH = { c: [2.8, 2.6, 10.0] as P3, r: 2.5 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 14, (k) => {
      k.shadow(4.6, 4.6, 4.6, 4.4, 0.3);
      // the tripod
      const [dc, dv] = [DISH.c[0], DISH.c[1]];
      for (const a of [0.5, 2.6, 4.7]) k.rod([[dc, dv, 7.4], [dc + Math.cos(a) * 1.9, dv + Math.sin(a) * 1.9, 0]], '#5d6864', 0.16);
      k.rod([[dc, dv, 0.8], [dc, dv, 8.2]], '#8a9692', 0.22);
      // the cart: two shelves on casters
      for (const [u, w] of [[3.4, 4.6], [8.2, 4.6], [3.4, 8.2], [8.2, 8.2]] as const) {
        k.rod([[u, w, 0.4], [u, w, 6.2]], '#3a4045', 0.18);
        k.dot(u, w, 0.2, 0.2, '#1b1f22');
      }
      k.box(3.2, 4.4, 1.6, 5.2, 4.0, 0.3, '#3a4045', { line: k.thin, stripe: false });
      k.box(4.0, 5.0, 1.9, 1.8, 2.6, 1.6, '#2a2f33', { line: k.thin });
      crate(k, 6.1, 5.0, 1.9, 2.0, 2.4, 1.8, '#39a85a');
      k.box(3.0, 4.2, 6.2, 5.6, 4.4, 0.35, '#3a4045', { line: k.lw });
      const zt = 6.55;
      // the radio: a black box, a big dial, a display (live), knobs
      k.box(3.6, 4.6, zt, 3.8, 2.4, 1.9, '#23272b', { line: k.lw });
      fillPts(k, ring(k, [6.4, 7.02, zt + 0.95], [0, 1, 0], 0.6, 16), '#5d6864', k.thin);
      fillPts(k, ring(k, [6.4, 7.04, zt + 0.95], [0, 1, 0], 0.42, 16), '#3a4045', 0);
      for (let i = 0; i < 3; i++) k.dot(4.0 + i * 0.5, 7.02, zt + 0.35, 0.13, '#8a9692');
      // the modem with its lights, headphones, the desk mic
      k.box(3.5, 7.4, zt, 2.0, 1.1, 0.5, '#d4ccb0', { line: k.thin });
      k.rod([[7.9, 5.4, zt], [7.9, 5.6, zt + 1.8], [7.5, 5.9, zt + 2.3]], '#2a2f33', 0.1);
      k.cyl(7.9, 5.4, zt, 0.5, 0.15, '#2a2f33', { line: k.thin });
      k.cyl(7.45, 5.95, zt + 2.1, 0.28, 0.75, '#5d6864', { line: k.thin });
      k.rod([[6.5, 8.0, zt + 0.25], [7.0, 7.4, zt + 1.0], [7.6, 7.8, zt + 0.3]], '#2a2f33', 0.18);
      for (const [u, w] of [[6.5, 8.0], [7.6, 7.8]] as const) k.disc(u, w, zt + 0.25, 0.42, '#3a4045', k.thin);
      // a cable from the dish to the radio
      cable(k, droop([dc + 0.3, dv + 0.3, 7.8], [3.7, 5.5, zt + 1.2], 1.4, 6), '#1c2226', 0.12);
    });
    // the dish: parked, or sweeping the sky while browsing
    const t = pace(v, 1);
    const sw = v.active ? Math.sin(t * 0.9) * 0.5 : 0;
    const el = v.active ? 0.95 + Math.sin(t * 0.6) * 0.12 : 1.0;
    const az = Math.PI / 4 + sw; // up, and turned toward the room
    const n: P3 = [Math.cos(az) * Math.cos(el), Math.sin(az) * Math.cos(el), Math.sin(el)];
    const c = DISH.c;
    const rim = ring(k, c, n, DISH.r, 28);
    const back = ring(k, [c[0] - n[0] * 0.7, c[1] - n[1] * 0.7, c[2] - n[2] * 0.7], n, DISH.r * 0.35, 14);
    fillPts(k, hullPts([...rim, ...back]), '#c3ccc8', k.lw);
    // the bowl: shaded inside away from the light (it is hollow)
    const [bx, by] = k.p(...c);
    const g = k.pen.createLinearGradient(bx - DISH.r * k.s, by - DISH.r * k.s * 0.5, bx + DISH.r * k.s, by + DISH.r * k.s * 0.5);
    g.addColorStop(0, '#8f9a96');
    g.addColorStop(0.55, '#d4dbd8');
    g.addColorStop(1, '#f2f5f4');
    fillPts(k, rim, g, k.thin);
    // the feed on its arm from the bowl's near rim, the LNB box
    const feed: P3 = [c[0] + n[0] * 1.9, c[1] + n[1] * 1.9, c[2] + n[2] * 1.9];
    const lip: P3 = [c[0] + Math.cos(az) * DISH.r * 0.9 * Math.sin(el), c[1] + Math.sin(az) * DISH.r * 0.9 * Math.sin(el), c[2] - DISH.r * 0.9 * Math.cos(el)];
    k.rod([lip, feed], '#5d6864', 0.1);
    k.dot(feed[0], feed[1], feed[2], 0.3, '#3a4045');
    const blink = v.active ? Math.floor(v.t * 3) % 2 === 0 : Math.floor(v.t * 0.5) % 2 === 0;
    k.dot(feed[0], feed[1], feed[2] + 0.3, 0.13, blink ? '#ff5a4a' : '#5a2a2a');
    if (blink) k.halo(feed[0], feed[1], feed[2] + 0.3, 1.0, '#ff5a4a', 0.4);
    // the waterfall display
    const zt = 6.55;
    const q: Quad = [[3.9, 7.02, zt + 0.7], [5.5, 7.02, zt + 0.7], [5.5, 7.02, zt + 1.6], [3.9, 7.02, zt + 1.6]];
    glass(k, q, '#0a1410', 0.05, 0);
    const pen = k.pen;
    const rows = 5;
    for (let r = 0; r < rows; r++) {
      const row = Math.floor(t * (v.active ? 4 : 1)) - r;
      pen.beginPath();
      for (let i = 0; i < 8; i++) {
        const lv = hash(row, i, 9) * (v.active ? 1 : 0.4) + (Math.abs(i - 3.5) < 1.2 ? 0.35 : 0);
        if (lv < 0.45) continue;
        const f0 = 0.05 + i * 0.112;
        k.trace([on(q, f0, 0.85 - r * 0.17), on(q, f0 + 0.1, 0.85 - r * 0.17), on(q, f0 + 0.1, 0.95 - r * 0.17), on(q, f0, 0.95 - r * 0.17)]);
      }
      pen.fillStyle = r === 0 ? '#ffe066' : r < 3 ? C.amber : '#a85a1a';
      pen.fill();
    }
    k.halo(4.7, 7.2, zt + 1.15, 1.8, C.amber, v.active ? 0.35 : 0.15);
    // the modem's lights
    for (let i = 0; i < 4; i++) k.dot(3.8 + i * 0.4, 8.51, zt + 0.25, 0.09, hash(i, Math.floor(t * (v.active ? 6 : 1)), 3) < 0.6 ? C.green : '#1a3a22');
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.8, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: DISH.c[0] + j(1), y: DISH.c[1] + j(2), z: DISH.c[2] + 1.5, vx: -0.4 + j(3) * 0.4, vy: -0.4 + j(4) * 0.4, vz: 2.2 + j(5), life: 1.4, color: [120, 255, 160], glow: true, gravity: -0.3 });
    }
  },
};

// ── think: the rain wall ────────────────────────────────────────────────────
// Old monitors and TVs stacked on milk crates, every one of them pouring
// green rain; a rubber duck on a stool for talking things through, a
// beanbag. Thinking makes the rain pour faster and brighter; idle it
// trickles in slow steps.

type Tube = { q: Quad; cols: number; rows: number; seed: number };
const TUBES: Array<[number, number, number, number, number, number, Color]> = [
  // u0, v0, z0, w, d, h, body
  [0.4, 0.4, 3.0, 3.6, 3.0, 3.1, C.beige],
  [4.2, 0.2, 3.0, 4.2, 3.2, 3.5, '#2a2f33'],
  [8.6, 0.4, 3.0, 3.0, 2.8, 2.7, C.beigeDark],
  [1.0, 0.5, 6.25, 3.0, 2.7, 2.6, '#3a4045'],
  [4.5, 0.4, 6.65, 3.6, 2.9, 3.0, C.beige],
  [8.5, 0.6, 5.85, 2.6, 2.4, 2.3, '#2a2f33'],
];

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'think', 16, (k) => {
      k.shadow(6, 2.4, 6.6, 3.0, 0.32);
      // the crates and a plank they stand on
      for (const u of [0.4, 4.4, 8.4]) crate(k, u, 0.3, 0, 3.4, 3.2, 2.8, ['#3c78c8', '#c0392f', '#39a85a'][Math.round(u) % 3]);
      k.box(0.2, 0.2, 2.8, 11.6, 3.4, 0.25, C.plywood, { line: k.thin });
      TUBES.forEach(([u0, v0, z0, w, d, h, body], i) => {
        if (i === 3) k.box(0.8, 0.6, 6.1, 3.4, 2.6, 0.15, C.plywood, { line: k.thin, stripe: false });
        glass(k, crt(k, u0, v0, z0, w, d, h, body), C.screenDark, 0.3);
      });
      // rabbit ears on the little one, a VHS player, cables
      k.rod([[9.8, 1.6, 8.15], [9.0, 1.2, 10.4]], '#c3ccc8', 0.07);
      k.rod([[10.2, 1.6, 8.15], [11.2, 1.3, 10.2]], '#c3ccc8', 0.07);
      cable(k, droop([2.5, 0.5, 3.0], [3.2, 0.3, 0.1], 0.5, 4), '#1c2226', 0.13);
      cable(k, droop([9.5, 0.5, 3.0], [10.5, 0.3, 0.1], 0.5, 4), '#1c2226', 0.13);
      // the duck on its stool
      k.shadow(1.6, 5.6, 0.9, 0.9, 0.25);
      for (const a of [0.6, 2.7, 4.8]) k.rod([[1.6, 5.6, 2.4], [1.6 + Math.cos(a) * 0.75, 5.6 + Math.sin(a) * 0.75, 0]], '#8a9692', 0.14);
      k.cyl(1.6, 5.6, 2.4, 0.85, 0.3, '#c0392f');
      duck(k, 1.6, 5.6, 2.7, 0.55);
      // the beanbag
      beanbag(k, 9.9, 5.2, 1.9, 2.6, '#5e3d6e');
      can(k, 7.8, 6.1, 0, CANS[3]);
    });
    const tubes = TUBES.map(([u0, v0, z0, w, d, h], i) => tubeOf(u0, v0, z0, w, d, h, v.seed + i * 11));
    const t = pace(v);
    for (const tb of tubes) {
      glass(k, tb.q, C.screenDark, 0.3, 0);
      rain(k, inset(tb.q, 0.02), t, tb.seed, tb.cols, tb.rows, v.active ? 1 : 0.7);
      // scanlines
      if (k.fine) {
        const pen = k.pen;
        pen.beginPath();
        for (let r = 1; r < tb.rows * 2; r++) {
          const [x0, y0] = k.p(...on(tb.q, 0, r / (tb.rows * 2)));
          const [x1, y1] = k.p(...on(tb.q, 1, r / (tb.rows * 2)));
          pen.moveTo(x0, y0);
          pen.lineTo(x1, y1);
        }
        pen.strokeStyle = '#00000038';
        pen.lineWidth = 0.05 * k.s;
        pen.stroke();
      }
      sheen(k, tb.q, 0.07);
    }
    if (v.active) {
      // a glitch: a bright bar across one screen now and then
      const g = Math.floor(v.t * 3);
      if (hash(g, 7) < 0.4) {
        const tb = tubes[Math.floor(hash(g, 8) * tubes.length)];
        const fz = hash(g, 9) * 0.8;
        k.poly([on(tb.q, 0, fz), on(tb.q, 1, fz), on(tb.q, 1, fz + 0.08), on(tb.q, 0, fz + 0.08)], withAlpha('#d8ffe0', 0.6), 0);
      }
      k.halo(6, 3.4, 7, 8, C.green, 0.22);
    } else k.halo(6, 3.4, 7, 7, C.green, 0.1);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // green glyph-bits drifting up off the screens
    const n = due(v.t, dt, 2.2, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: 6 + j(1) * 10, y: 3.6 + j(2), z: 5 + j(3) * 4, vx: j(4) * 0.4, vy: 0.5 + j(5) * 0.4, vz: 1.4 + j(6), life: 1.5, color: [93, 255, 143], glow: true, gravity: -0.2 });
    }
  },
};

// A CRT's screen quad as crt() lays it out.
function tubeOf(u0: number, v0: number, z0: number, w: number, d: number, h: number, seed: number): Tube {
  const F = v0 + d + 0.02;
  const bx = Math.min(0.55, w * 0.11);
  const bz0 = Math.min(0.9, h * 0.17);
  const bz1 = Math.min(0.5, h * 0.1);
  const q: Quad = [[u0 + bx, F, z0 + bz0], [u0 + w - bx, F, z0 + bz0], [u0 + w - bx, F, z0 + h - bz1], [u0 + bx, F, z0 + h - bz1]];
  return { q, cols: Math.max(4, Math.round((q[1][0] - q[0][0]) / 0.5)), rows: Math.max(4, Math.round((q[2][2] - q[1][2]) / 0.48)), seed };
}

// ── idle: the lounge ────────────────────────────────────────────────────────
// A sagging plum couch with mismatched cushions and a blanket, a cable-spool
// table loaded with pizza boxes, cans and a controller, a beanbag, a mini
// fridge with stickers and a lava lamp on a crate, the cat's bed. Where
// tired agents flop.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.2, 4.0, 7.8, 3.8, 0.3);
    // the mini fridge behind the couch's end, the lava lamp's crate
    k.shadow(1.3, 1.6, 1.4, 1.3, 0.25);
    k.box(0.1, 0.3, 0, 2.6, 2.6, 4.4, '#d9dedc', { line: k.lw, round: 0.25 });
    k.line([[0.25, 2.92, 3.0], [2.55, 2.92, 3.0]], '#9aa5a1', k.thin);
    k.rod([[2.3, 2.95, 3.3], [2.3, 2.95, 4.1]], '#8a9692', 0.12);
    for (let i = 0; i < 5; i++) sticker(k, [0.6 + hash(v.seed, i, 1) * 1.6, 2.92, 0.6 + hash(v.seed, i, 2) * 3.4], [1, 0], 0.32, i, STICKERS[(i * 3) % STICKERS.length]);
    can(k, 0.9, 1.2, 4.4, CANS[0]);
    can(k, 1.6, 1.0, 4.4, CANS[4]);
    // the couch
    const P = C.plum;
    for (const [u, w] of [[3.8, 1.0], [12.3, 1.0], [3.8, 4.8], [12.3, 4.8]] as const) k.box(u, w, 0, 0.45, 0.45, 0.7, '#2a2f33', { line: k.thin });
    k.box(3.4, 0.8, 0.6, 9.8, 4.6, 1.9, P, { round: 0.4 });
    k.box(3.4, 0.5, 2.5, 9.8, 1.5, 3.6, P, { round: 0.7 });
    for (let i = 0; i < 2; i++) k.box(4.7 + i * 3.6, 1.95, 2.5, 3.6, 3.3, 0.85, shade(P, 0.06 - i * 0.04), { round: 0.4 });
    k.box(3.4, 0.8, 2.5, 1.3, 4.5, 2.1, P, { round: 0.6 });
    k.box(11.9, 0.8, 2.5, 1.3, 4.5, 2.1, P, { round: 0.6 });
    // a patch on the arm, cushions, a blanket half off
    k.poly([[3.45, 4.3, 3.2], [3.45, 5.0, 3.2], [3.45, 5.0, 3.9], [3.45, 4.3, 3.9]], C.teal, k.thin * 0.6);
    k.poly([[5.0, 2.1, 3.3], [6.9, 2.1, 3.3], [6.7, 2.35, 5.2], [5.2, 2.35, 5.2]], C.mustard, k.lw, 0.5);
    k.poly([[9.6, 2.1, 3.3], [11.5, 2.1, 3.3], [11.3, 2.35, 5.0], [9.8, 2.35, 5.0]], '#2f6e6a', k.lw, 0.5);
    k.poly([[8.0, 3.0, 3.36], [10.6, 2.6, 3.36], [10.9, 5.3, 3.3], [8.3, 5.4, 3.3]], '#3a6a5a', k.lw, 0.3);
    k.poly([[8.3, 5.4, 3.3], [10.9, 5.3, 3.3], [11.0, 5.5, 1.2], [8.6, 5.6, 1.4]], k.side('#3a6a5a', 0, 1), k.lw, 0.2);
    if (k.fine) for (const f of [0.3, 0.6]) k.line([[8.3 + 2.6 * f, 5.42, 3.2], [8.6 + 2.4 * f, 5.58, 1.4]], '#e9ecea88', 0.12 * k.s);
    // the cable-spool table, loaded
    const sc: P3 = [8.0, 8.2, 0];
    k.shadow(sc[0], sc[1], 3.0, 2.6, 0.28);
    k.cyl(sc[0], sc[1], 0, 2.5, 0.35, C.plywood);
    k.cyl(sc[0], sc[1], 0.35, 1.3, 2.1, shade(C.plywood, -0.12));
    k.cyl(sc[0], sc[1], 2.45, 2.7, 0.4, C.plywood, { top: '#c99d68' });
    if (k.fine) k.disc(sc[0], sc[1], 2.86, 1.4, '#00000000', k.thin * 0.5);
    const zt = 2.86;
    pizzaBox(k, 6.4, 7.0, zt, 2.6, 2.6, false, v.seed + 1);
    pizzaBox(k, 6.5, 7.1, zt + 0.42, 2.4, 2.4, true, v.seed + 2, 3);
    can(k, 9.5, 7.6, zt, CANS[1]);
    can(k, 9.9, 8.6, zt, CANS[5]);
    lyingCan(k, 8.8, 9.6, 9.6, 10.0, zt, CANS[0]);
    // a controller
    k.box(8.4, 9.9, zt, 1.2, 0.7, 0.25, '#2a2f33', { line: k.thin, round: 0.25 });
    // the beanbag by the couch's end
    beanbag(k, 14.0, 6.0, 1.6, 2.4, C.mustard);
    // the lava lamp on a crate
    crate(k, 13.0, 0.6, 0, 2.0, 2.0, 1.9, '#9a5ad8');
    const lc = [14.0, 1.6] as const;
    k.cyl(lc[0], lc[1], 1.9, 0.45, 0.5, '#c3ccc8', { line: k.thin });
    k.cyl(lc[0], lc[1], 2.4, 0.38, 2.2, '#ff8a3a', { top: '#ffd08a' });
    k.disc(lc[0] - 0.05, lc[1] + 0.2, 3.3, 0.18, '#ffe0a0', 0);
    k.cyl(lc[0], lc[1], 4.6, 0.25, 0.4, '#c3ccc8', { line: k.thin });
    k.halo(lc[0], lc[1], 3.4, 3.4, '#ff9a48', 0.4);
    // the cat's bed (the cat is out)
    k.shadow(2.0, 8.6, 1.6, 1.5, 0.22);
    k.cyl(2.0, 8.6, 0, 1.45, 0.9, '#3a4045');
    k.disc(2.0, 8.6, 0.9, 1.15, '#6a5a7a', k.thin);
    k.disc(2.05, 8.65, 0.92, 0.65, '#5a4a6a', 0);
    // a sock on the floor
    k.poly([[4.4, 9.4, 0.05], [5.4, 9.0, 0.05], [5.6, 9.4, 0.05], [5.0, 9.8, 0.05], [4.5, 9.9, 0.05]], '#e9ecea', k.thin * 0.7, 0.2);
  },
};

// ── entrance: the steel door ────────────────────────────────────────────────
// A heavy riveted steel door, covered in stickers, at the foot of the
// stairs down; a keypad by it, a coat hook with a hoodie and a backpack, a
// skateboard against the wall, a pile of empty pizza boxes and a bin of
// cans. It swings open while someone comes or goes, the keypad going
// green and cold air rolling in.

const DOOR = { u0: 3.4, u1: 9.0, h: 14.4, hv: 0.3 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 20, (k) => {
      // the stairwell beyond: concrete steps up into the dark, a caged bulb
      const out = -0.6;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]], k.vgrad(u0, out, 0, h, [[0, '#4a5654'], [0.4, '#2c3634'], [1, '#141a1a']]), 0);
      const pen = k.pen;
      for (let i = 0; i < 7; i++) {
        const z = 0.8 + i * 1.6;
        k.poly([[u0, out, z], [u1, out, z], [u1, out, z + 0.25], [u0, out, z + 0.25]], i < 3 ? '#6a7470' : '#4a5452', 0);
      }
      k.halo((u0 + u1) / 2 + 1, out, h - 2.4, 3.2, '#cfe0ff', 0.4);
      k.dot((u0 + u1) / 2 + 1, out, h - 2.4, 0.3, '#f4f8ff');
      // the reveal and the steel frame
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#56625e', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#2a3230', 0);
      k.box(u0 - 0.55, 0, 0, 0.55, 0.55, h + 0.6, '#5d6864', { line: k.lw });
      k.box(u1, 0, 0, 0.55, 0.55, h + 0.6, '#5d6864', { line: k.lw });
      k.box(u0 - 0.8, 0, h, u1 - u0 + 1.6, 0.6, 0.6, '#5d6864', { line: k.lw });
      // hazard stripes on the threshold, the doormat
      k.poly([[u0, 0, 0.03], [u1, 0, 0.03], [u1, 0.5, 0.03], [u0, 0.5, 0.03]], '#ffd23e', k.thin);
      pen.beginPath();
      for (let u = u0 + 0.2; u < u1 - 0.3; u += 0.8) k.trace([[u, 0.02, 0.04], [u + 0.35, 0.02, 0.04], [u + 0.15, 0.48, 0.04], [u - 0.2, 0.48, 0.04]]);
      pen.fillStyle = '#2a2f33';
      pen.fill();
      k.shadow((u0 + u1) / 2, 2.2, 3.0, 1.5, 0.12);
      k.poly([[u0 + 0.3, 0.8, 0.06], [u1 - 0.3, 0.8, 0.06], [u1 - 0.3, 3.6, 0.06], [u0 + 0.3, 3.6, 0.06]], '#2a2f33', k.thin, 0.2);
      k.poly([[u0 + 0.8, 1.3, 0.07], [u1 - 0.8, 1.3, 0.07], [u1 - 0.8, 3.1, 0.07], [u0 + 0.8, 3.1, 0.07]], '#1f6a3a', 0);
      // the keypad on the wall by the latch side
      k.box(u1 + 1.0, 0, 7.4, 1.0, 0.35, 1.5, '#3a4045', { line: k.thin });
      if (k.fine) for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.dot(u1 + 1.25 + c * 0.25, 0.36, 7.65 + r * 0.3, 0.06, '#9aa5a1');
      // left of the door: a coat hook with a hoodie and a backpack, the
      // skateboard against the wall
      k.box(0.4, 0, 12.4, 2.6, 0.3, 0.45, '#2a2f33', { line: k.thin });
      for (const u of [0.9, 2.4]) k.rod([[u, 0.3, 12.6], [u, 0.7, 12.5], [u, 0.8, 12.9]], '#8a9692', 0.1);
      const hood = '#3a6a8a';
      k.poly([[0.2, 0.6, 11.6], [1.6, 0.6, 11.6], [2.0, 0.75, 7.0], [-0.2, 0.8, 7.0]], hood, k.lw, 0.3);
      k.poly([[0.0, 0.7, 11.3], [-0.3, 0.85, 7.6], [0.25, 0.9, 7.5], [0.4, 0.75, 10.6]], shade(hood, -0.12), k.thin, 0.2);
      k.poly([[0.35, 0.62, 11.4], [0.9, 0.55, 12.9], [1.45, 0.62, 11.4], [0.9, 0.7, 10.4]], shade(hood, 0.1), k.lw, 0.4);
      k.poly([[-0.2, 0.82, 7.0], [2.0, 0.77, 7.0], [2.0, 0.78, 7.6], [-0.2, 0.83, 7.6]], shade(hood, -0.2), k.thin);
      k.poly([[0.5, 0.82, 8.1], [1.4, 0.8, 8.1], [1.4, 0.8, 9.1], [0.5, 0.82, 9.1]], shade(hood, -0.1), k.thin * 0.6, 0.2);
      for (const du of [0.75, 1.05]) k.line([[du, 0.72, 11.3], [du - 0.05, 0.75, 10.0]], '#e9ecea', Math.max(0.7, 0.07 * k.s));
      k.box(1.9, 0.4, 8.6, 1.4, 1.0, 3.6, '#c0392f', { line: k.lw, round: 0.4 });
      k.box(2.05, 1.38, 9.0, 1.1, 0.25, 1.5, shade('#c0392f', -0.15), { line: k.thin, round: 0.25 });
      // the skateboard leaning by the frame
      k.poly([[2.4, 0.9, 0.3], [3.0, 0.9, 0.3], [2.7, 0.35, 6.0], [2.1, 0.35, 6.0]], '#2a2f33', k.lw, 0.3);
      k.poly([[2.45, 0.92, 1.4], [2.95, 0.92, 1.4], [2.75, 0.5, 5.0], [2.25, 0.5, 5.0]], C.magenta, 0, 0.2);
      for (const z of [1.0, 5.2]) k.dot(2.2 + (z > 3 ? 0 : 0.5), 1.05, z, 0.2, '#e9ecea');
      // right of the door: empty pizza boxes and a bin of cans
      for (let i = 0; i < 5; i++) pizzaBox(k, 10.2 + (hash(v.seed, i, 5) - 0.5) * 0.4, 0.6 + (hash(v.seed, i, 6) - 0.5) * 0.3, i * 0.42, 2.8, 2.8, false, v.seed + i);
      k.shadow(13.6, 2.2, 1.3, 1.1, 0.25);
      k.cyl(13.6, 2.2, 0, 1.05, 2.6, '#2b5fb8');
      for (let i = 0; i < 6; i++) can(k, 13.2 + hash(v.seed, i, 7) * 0.8, 1.8 + hash(v.seed, i, 8) * 0.8, 2.2 + hash(v.seed, i, 9) * 0.5, CANS[i % CANS.length], 0.26);
    });
    // the keypad's light: red, green while the door is in use
    const kc = v.active ? C.green : '#ff3a3a';
    k.dot(DOOR.u1 + 1.5, 0.37, 8.7, 0.13, kc);
    k.halo(DOOR.u1 + 1.5, 0.4, 8.7, 0.9, kc, 0.4);
    // the door: shut, or swung in while someone passes
    const th = v.active ? 0.62 + 0.05 * Math.sin(v.t * 2.2) : 0;
    if (v.active) k.pool((DOOR.u0 + DOOR.u1) / 2, 2.2, 3.2, 2.4, '#cfe0ff', 0.2);
    doorLeaf(k, th, v.seed);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // cold air rolling in at the open door
    const n = due(v.t, dt, 2.5, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const j = (q: number) => hash(tick, q);
      spawn({ kind: 'smoke', x: DOOR.u0 + 1 + j(1) * 4, y: 0.6 + j(2), z: 0.5 + j(3) * 2, vx: (j(4) - 0.5) * 0.6, vy: 1.2 + j(5), vz: 0.3, life: 1.6, color: [200, 214, 230], glow: false, gravity: 0 });
    }
  },
};

// The door leaf on its hinge at u0, opened by th radians into the room:
// steel plate with rivets round its edge, a wired-glass slit, a push bar,
// stickers all over.
function doorLeaf(k: Kit, th: number, seed: number): void {
  const { u0, u1, h, hv } = DOOR;
  const w = u1 - u0 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, hv + dv * s + du * n, z];
  const steel = '#4f6a62';
  const face = k.side(steel, -dv, du, 0.16);
  if (th > 0.05) k.poly([P(w, 0), P(w, 0, -0.4), P(w, h, -0.4), P(w, h)], k.side(steel, du, dv, 0.16), k.thin);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h)], face, k.lw);
  // a raised border, rivets round it
  k.line([P(0.4, 0.4), P(w - 0.4, 0.4), P(w - 0.4, h - 0.4), P(0.4, h - 0.4), P(0.4, 0.4)], shade(face, 0.18), Math.max(0.8, 0.12 * k.s));
  if (k.fine) {
    for (let z = 1; z < h - 0.5; z += 1.6) for (const s of [0.4, w - 0.4]) k.dot(...P(s, z), 0.08, shade(face, 0.3));
  }
  // the wired-glass slit
  k.poly([P(w / 2 - 0.5, h - 5.5), P(w / 2 + 0.5, h - 5.5), P(w / 2 + 0.5, h - 1.5), P(w / 2 - 0.5, h - 1.5)], '#3a4a5a', k.thin);
  k.line([P(w / 2 - 0.5, h - 4), P(w / 2 + 0.5, h - 3), P(w / 2 - 0.5, h - 2)], '#8a9aa088', Math.max(0.6, 0.05 * k.s));
  // the push bar and a kick plate in hazard stripes
  k.rod([P(0.8, 6.6, 0.3), P(w - 0.6, 6.6, 0.3)], '#c3ccc8', 0.22);
  k.poly([P(0.2, 0.2), P(w - 0.2, 0.2), P(w - 0.2, 1.1), P(0.2, 1.1)], '#ffd23e', k.thin);
  const pen = k.pen;
  pen.beginPath();
  for (let s = 0.4; s < w - 0.6; s += 0.8) k.trace([P(s, 0.2), P(s + 0.35, 0.2), P(s + 0.7, 1.1), P(s + 0.35, 1.1)]);
  pen.fillStyle = '#2a2f33';
  pen.fill();
  // stickers
  for (let i = 0; i < 9; i++) {
    const s = 0.9 + hash(seed, i, 21) * (w - 1.8);
    const z = 1.8 + hash(seed, i, 22) * (h - 8.2) + (hash(seed, i, 23) < 0.3 ? 5.5 : 0);
    sticker(k, P(s, Math.min(h - 1, z), 0.02), [du, dv], 0.35 + hash(seed, i, 24) * 0.25, Math.floor(hash(seed, i, 25) * 6), STICKERS[Math.floor(hash(seed, i, 26) * STICKERS.length)]);
  }
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
