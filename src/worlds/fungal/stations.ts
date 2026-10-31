import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { across, bookRow, boulder, bottle, bracket, candle, clump, curve, fillPts, flask, hull, ribbon, ring, root, shape, shroom, toadstool, tuft } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, due, hash, kitOf, puff, spore, still, withAlpha } from './kit.ts';

// The caverns' stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame.
//
//   write     a desk grown from a great shelf fungus: an open grimoire, a
//             quill that writes glowing runes while worked
//   read      a bookcase framed in roots, a reading stump and a glow pod;
//             reading floats a book out, its pages turning
//   search    an apothecary chest of little drawers, jars on top; searching
//             pulls the drawers out one by one, their spores aglow
//   run       the cauldron over a fire in a ring of stones, toward its far
//             end, where the witch stands to stir it; it boils over with
//             green fumes while run
//   web       a scrying orb on a twisted stalk, threads of glowing mycelium
//             running out to little mushrooms (the wood wide web); pulses
//             run in along them while browsed
//   think     a fairy ring round a moss cushion, a rune stone and a glowing
//             mushroom; thinking lights the ring and the runes
//   idle      a mushroom-cap table with tea, toadstool stools and a mossy
//             log bench
//   entrance  a tunnel mouth framed in roots with an arched door that swings
//             open while someone comes or goes

type Spawn = (p: Particle) => void;

// A point on the quad a (u0, z0) - (u1, z1) of a plane.
const on = (q: readonly [P3, P3, P3, P3], fu: number, fz: number): P3 => {
  const [a, b, , d] = q;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

const ease = (t: number) => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

// A half-ellipse shelf jutting from the plane v = n: ru along u, rv out,
// th thick, its top at z, ringed like a bracket fungus.
function shelfTop(k: Kit, cu: number, n: number, z: number, ru: number, rv: number, th: number, color: Color): void {
  const steps = 20;
  const top: P3[] = [];
  const bot: P3[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI;
    top.push([cu + ru * Math.cos(a), n + rv * Math.sin(a), z]);
    bot.push([cu + ru * 0.94 * Math.cos(a), n + rv * 0.9 * Math.sin(a), z - th]);
  }
  k.poly([...top, ...bot.reverse()], shade(color, -0.24), k.lw);
  const [x0] = k.p(cu - ru, n, z);
  const [x1] = k.p(cu + ru, n, z);
  k.poly(top, across(k, Math.min(x0, x1), Math.max(x0, x1), color, 0.14, -0.1), k.lw);
  for (const f of [0.82, 0.62]) {
    const pts: P3[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI;
      pts.push([cu + ru * f * Math.cos(a), n + rv * f * Math.sin(a), z]);
    }
    k.line(pts, shade(color, 0.22), Math.max(0.8, 0.09 * k.s));
  }
}

// ── write: the shelf-fungus desk ─────────────────────────────────────────────

const DESK = 6.8; // the desk's top
const PAGE: readonly [P3, P3, P3, P3] = [[5.75, 1.7, DESK + 0.12], [7.75, 1.7, DESK + 0.3], [7.75, 4.1, DESK + 0.3], [5.75, 4.1, DESK + 0.12]];

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 12, (k) => {
      k.shadow(5.5, 3.0, 5.8, 3.4, 0.3);
      // the root it grows on, flaring at the foot
      ribbon(k, curve([[5.6, 1.2, 0], [5.2, 1.4, 2.5], [5.8, 1.6, 4.8], [5.5, 1.6, DESK - 0.6]], 10), 2.0, 1.1, C.root);
      root(k, [5.0, 1.4, 0.4], [4.0, 2.2, 0.15], [3.0, 2.6, 0.05], 0.5);
      root(k, [6.2, 1.5, 0.4], [7.2, 2.3, 0.15], [8.2, 2.5, 0.05], 0.45);
      bracket(k, 4.5, 1.5, 3.4, 0.8, '#d8a66a', false, 0.35);
      // the desk
      shelfTop(k, 5.5, 0.05, DESK, 5.3, 5.2, 0.9, '#c99a62');
      // a candle on a mushroom-cap dish, a scroll, the inkpot, a jar of glowing ink
      k.disc(1.7, 1.4, DESK + 0.05, 0.75, C.capRed, k.thin);
      candle(k, 1.7, 1.4, DESK + 0.1, 1.5, 0.32);
      k.cyl(9.4, 1.3, DESK, 0.6, 1.5, withAlpha(C.glass, 0.55), { line: k.thin });
      k.cyl(9.4, 1.3, DESK + 0.05, 0.48, 1.0, C.glow, { line: 0 });
      k.cyl(9.4, 1.3, DESK + 1.5, 0.62, 0.25, C.wood, { line: k.thin });
      k.halo(9.4, 1.4, DESK + 0.6, 1.4, C.glow, 0.4);
      k.cyl(8.6, 2.9, DESK, 0.42, 0.6, '#2a2238', { line: k.thin });
      k.disc(8.6, 2.9, DESK + 0.6, 0.22, '#5fe3c0', 0);
      // a scroll lying across the front
      k.rod([[2.4, 3.6, DESK + 0.25], [4.4, 4.1, DESK + 0.25]], C.parchment, 0.42);
      k.disc(2.4, 3.6, DESK + 0.25, 0.22, shade(C.parchment, -0.2), k.thin);
      // the grimoire: its cover, then the two pages bowing up from the spine
      k.poly([[3.4, 1.4, DESK + 0.05], [8.1, 1.4, DESK + 0.05], [8.1, 4.4, DESK + 0.05], [3.4, 4.4, DESK + 0.05]], '#6b2f4a', k.lw, 0.15);
      k.poly([[5.75, 1.7, DESK + 0.12], [3.75, 1.7, DESK + 0.3], [3.75, 4.1, DESK + 0.3], [5.75, 4.1, DESK + 0.12]], '#efe2bf', k.thin);
      k.poly([...PAGE], '#f6ecd0', k.thin);
      k.line([[5.75, 1.7, DESK + 0.13], [5.75, 4.1, DESK + 0.13]], shade(C.parchment, -0.35), Math.max(0.8, 0.1 * k.s));
      // writing on the left page, a drawing of a mushroom
      for (let i = 0; i < 5; i++) {
        const fz = 0.15 + i * 0.16;
        const l = 0.55 + hash(i, 3) * 0.3;
        k.line([[5.55, 1.85 + fz * 2.4, DESK + 0.16], [5.55 - 1.8 * l, 1.85 + fz * 2.4, DESK + 0.28]], '#8a7a6a', Math.max(0.6, 0.06 * k.s));
      }
      // the stool pulled out to the side
      toadstool(k, 1.6, 5.6, 3.2, 1.25, C.capViolet, v.seed + 1);
    });
    const pen = k.pen;
    if (!v.active) {
      // the quill stands in its pot
      quill(k, [8.6, 2.9, DESK + 0.5], [9.3, 2.6, DESK + 3.6]);
      return;
    }
    // runes written so far on the right page, glowing; the quill writing on
    const per = 2.2; // seconds a line
    const lines = 5;
    const ph = (v.t / per) % lines;
    const line = Math.floor(ph);
    const f = ph - line;
    pen.beginPath();
    const glyphs = (row: number, upto: number) => {
      const fz = 0.14 + row * 0.16;
      const n = 6;
      for (let i = 0; i < n * upto; i++) {
        const g = hash(row, i, 7);
        const fu = 0.12 + (i / n) * 0.74;
        const a = on(PAGE, fu, fz);
        const b = on(PAGE, fu + 0.08, fz + (g - 0.5) * 0.08);
        const c = on(PAGE, fu + 0.03, fz + 0.06);
        const [x0, y0] = k.p(...a);
        pen.moveTo(x0, y0);
        const [x1, y1] = k.p(...c);
        const [x2, y2] = k.p(...b);
        pen.quadraticCurveTo(x1, y1, x2, y2);
      }
    };
    for (let r = 0; r < line; r++) glyphs(r, 1);
    glyphs(line, f);
    pen.strokeStyle = '#2fa88a';
    pen.lineWidth = Math.max(0.8, 0.1 * k.s);
    pen.lineCap = 'round';
    pen.stroke();
    const tip = on(PAGE, 0.12 + f * 0.74, 0.14 + line * 0.16 + 0.03);
    k.halo(tip[0], tip[1], tip[2] + 0.1, 1.2, C.glow, 0.55);
    const wob = Math.sin(v.t * 14) * 0.15;
    quill(k, tip, [tip[0] + 0.9 + wob, tip[1] - 0.6, tip[2] + 3.0]);
    k.halo(6.8, 2.9, DESK + 0.4, 2.6, C.glow, 0.22);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, v.active ? 1.4 : 0.3, v.seed);
    for (let i = 0; i < n; i++) spawn(spore(9.4, 1.3, DESK + 2, Math.floor(v.t * 10), i, [150, 255, 220], 0.4));
  },
};

// A quill feather from its nib to the top of its vane.
function quill(k: Kit, nib: P3, top: P3): void {
  const [x0, y0] = k.p(...nib);
  const [x1, y1] = k.p(...top);
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L;
  const ny = dx / L;
  const w = 0.42 * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(x0 + dx * 0.25, y0 + dy * 0.25);
  pen.quadraticCurveTo(x0 + dx * 0.55 + nx * w * 1.6, y0 + dy * 0.55 + ny * w * 1.6, x1, y1);
  pen.quadraticCurveTo(x0 + dx * 0.6 - nx * w, y0 + dy * 0.6 - ny * w, x0 + dx * 0.25, y0 + dy * 0.25);
  pen.closePath();
  k.paint('#f2ecf8', k.thin);
  pen.beginPath();
  pen.moveTo(x0, y0);
  pen.lineTo(x1, y1);
  pen.strokeStyle = '#a99ab8';
  pen.lineWidth = Math.max(0.7, 0.07 * k.s);
  pen.stroke();
}

// ── read: the root-framed bookcase ──────────────────────────────────────────

const SHELVES = [0.7, 5.3, 9.9, 14.5];
const POD: P3 = [13.2, 1.7, 11.2];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 21, (k) => {
      const F = 3.2; // the shelves' front
      k.shadow(6.5, 2.2, 7, 2.4, 0.3);
      // the dark of the bays
      k.poly([[0.9, 0.2, 0.6], [10.1, 0.2, 0.6], [10.1, 0.2, 18.6], [0.9, 0.2, 18.6]], k.vgrad(0, 0.2, 0, 18.6, [[0, '#2c2034'], [1, '#1a1222']]), k.lw);
      // planks and what is on them
      SHELVES.forEach((z, r) => {
        k.box(0.7, 0.2, z - 0.5, 9.6, F, 0.5, C.wood, { line: k.thin });
        const top = r + 1 < SHELVES.length ? SHELVES[r + 1] - 0.6 : 18.4;
        const sd = v.seed + r * 7;
        const kind = hash(sd, 5);
        if (kind < 0.3) {
          bookRow(k, 1.0, 6.2, F - 0.3, z, top - z - 0.4, sd);
          for (const [u, c] of [[7.2, C.glow], [8.4, C.sludge], [9.4, C.crystal]] as const) {
            k.cyl(u, 1.8, z, 0.5, 1.5, withAlpha(C.glass, 0.5), { line: k.thin });
            k.cyl(u, 1.8, z + 0.05, 0.4, 1.0, c, { line: 0 });
            k.cyl(u, 1.8, z + 1.5, 0.52, 0.22, C.wood, { line: k.thin });
          }
        } else if (kind < 0.55) {
          // scrolls in a pile, then books
          for (let i = 0; i < 4; i++) k.rod([[1.2, 0.7 + i * 0.6, z + 0.35 + (i & 1) * 0.6], [3.6, 0.7 + i * 0.6, z + 0.35 + (i & 1) * 0.6]], C.parchment, 0.5);
          bookRow(k, 4.2, 9.9, F - 0.3, z, top - z - 0.4, sd);
        } else bookRow(k, 1.0, 9.9, F - 0.3, z, top - z - 0.4, sd);
      });
      k.box(0.5, 0, 18.4, 10, F + 0.3, 0.6, C.wood, { line: k.lw });
      // the root frame: two twisted posts and an arch of roots over the top
      for (const u of [0.45, 10.55]) ribbon(k, curve([[u, 1.8, 0], [u + 0.3, 2.0, 6], [u - 0.3, 2.0, 12], [u, 1.9, 19.2]], 16), 1.5, 1.0, C.root);
      ribbon(k, curve([[0.45, 1.9, 19], [3, 2.2, 20.4], [5.5, 2.1, 19.6], [8, 2.2, 20.4], [10.55, 1.9, 19]], 20), 1.1, 1.1, C.rootLit);
      bracket(k, 0.45, 2.6, 7.5, 0.7, '#d8a66a', false, 0.3);
      bracket(k, 10.55, 2.6, 12.5, 0.8, C.glowSoft, true, 0.3);
      bracket(k, 10.55, 2.6, 11.4, 0.55, '#c98f55', false, 0.25);
      clump(k, 9.6, 2.0, 19.0, 3, 0.6, 0.55, [C.capRed], v.seed + 3);
      // the reading nook: a pile of books, a mossy stump, the post for the pod
      k.shadow(12.2, 2.4, 1.8, 1.4, 0.28);
      k.box(11.0, 0.6, 0, 1.5, 1.1, 0.4, '#34476b', { line: k.thin, stripe: false });
      k.box(11.1, 0.7, 0.4, 1.3, 1.0, 0.35, '#a0583a', { line: k.thin, stripe: false });
      k.box(11.05, 0.55, 0.75, 1.4, 1.1, 0.35, '#6f8b4a', { line: k.thin, stripe: false });
      k.cyl(12.3, 2.7, 0, 1.15, 2.6, C.wood, { top: '#d9b98a' });
      if (k.fine) for (const r of [0.75, 0.4]) {
        const e = k.ell(12.3, 2.7, 2.6, r);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
        k.pen.strokeStyle = '#a07a52';
        k.pen.lineWidth = 0.05 * k.s;
        k.pen.stroke();
      }
      k.disc(12.0, 2.9, 2.62, 0.7, C.moss, k.thin);
      ribbon(k, curve([[13.5, 0.4, 0], [13.6, 0.5, 6], [13.4, 0.6, 12], [13.6, 1.0, 13.4], [13.3, 1.6, 13.0]], 14), 0.7, 0.45, C.root);
    });
    // the pod: brighter while someone reads
    const a = v.active ? 0.6 + 0.08 * Math.sin(v.t * 2.4) : 0.32;
    pod(k, POD, 0.95, a);
    if (!v.active) return;
    // a book floating out, its pages turning
    const bob = Math.sin(v.t * 1.8) * 0.35;
    const c: P3 = [12.2, 2.9, 7.6 + bob];
    k.halo(c[0], c[1], c[2], 3.2, C.glow, 0.35);
    floatBook(k, c, v.t);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.6, v.seed);
    for (let i = 0; i < n; i++) spawn(spore(12.2, 2.9, 8.2, Math.floor(v.t * 10), i, [190, 255, 230], 1.4));
  },
};

// A glowing pod hanging at p, r units round, lit to strength a.
function pod(k: Kit, p: P3, r: number, a: number): void {
  k.halo(p[0], p[1], p[2], r * 4, C.glow, a * 0.6);
  const [x, y] = k.p(...p);
  const R = r * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, R, R * 1.25, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - R * 0.3, y - R * 0.4, 0, x, y, R * 1.25);
  g.addColorStop(0, C.glowHot);
  g.addColorStop(0.55, a > 0.4 ? '#9ff7da' : C.glow);
  g.addColorStop(1, C.glowSoft);
  k.paint(g, k.thin);
  pen.beginPath();
  pen.ellipse(x, y - R * 0.95, R * 1.1, R * 0.5, 0, Math.PI, Math.PI * 2);
  pen.closePath();
  k.paint(C.capViolet, k.thin);
}

// An open book hovering at c, a page turning over every couple of seconds.
function floatBook(k: Kit, c: P3, t: number): void {
  const [u, v, z] = c;
  const w = 1.3;
  const d = 0.9;
  // the cover, then the pages bowing up from the spine
  k.poly([[u - w - 0.1, v - d - 0.05, z - 0.05], [u + w + 0.1, v - d - 0.05, z - 0.05], [u + w + 0.1, v + d + 0.05, z - 0.05], [u - w - 0.1, v + d + 0.05, z - 0.05]], '#5a3f7a', k.thin, 0.08);
  k.poly([[u, v - d, z + 0.05], [u - w, v - d, z + 0.3], [u - w, v + d, z + 0.3], [u, v + d, z + 0.05]], '#efe2bf', k.thin);
  k.poly([[u, v - d, z + 0.05], [u + w, v - d, z + 0.3], [u + w, v + d, z + 0.3], [u, v + d, z + 0.05]], '#f6ecd0', k.thin);
  const ph = (t * 0.6) % 1;
  if (ph < 0.5) {
    const a = (ph / 0.5) * Math.PI;
    const tip = (dv: number): P3 => [u + Math.cos(a) * w, dv, z + 0.1 + Math.sin(a) * w];
    k.poly([[u, v - d, z + 0.08], tip(v - d), tip(v + d), [u, v + d, z + 0.08]], '#fbf4e4', k.thin);
  }
}

// ── search: the apothecary chest ─────────────────────────────────────────────

const CHEST = { u0: 0.6, u1: 11.4, v0: 0.4, v1: 3.5, z0: 0.8, z1: 7.4 };
const ROWS = 3;
const COLS = 5;

// The front of drawer (r, c): its quad on the chest's face.
function drawer(r: number, c: number, out = 0): [P3, P3, P3, P3] {
  const { u0, u1, v1, z0, z1 } = CHEST;
  const dw = (u1 - u0 - 0.6) / COLS;
  const dh = (z1 - z0 - 0.6) / ROWS;
  const a = u0 + 0.3 + c * dw + 0.12;
  const b = a + dw - 0.24;
  const lo = z0 + 0.3 + r * dh + 0.12;
  const hi = lo + dh - 0.24;
  const n = v1 + out;
  return [[a, n, lo], [b, n, lo], [b, n, hi], [a, n, hi]];
}

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 11,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, v0, v1, z0, z1 } = CHEST;
    const k = still(v, 'search', 11, (k) => {
      k.shadow(6, 2.2, 6.6, 2.4, 0.3);
      // stubby feet like mushroom stalks
      for (const u of [u0 + 0.6, u1 - 0.6]) for (const w of [v0 + 0.5, v1 - 0.5]) k.cyl(u, w, 0, 0.42, z0 + 0.05, C.stalk, { line: k.thin });
      k.box(u0, v0, z0, u1 - u0, v1 - v0, z1 - z0, C.wood, { stripe: false });
      // the drawers, each with a brass pull and a little card frame
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const q = drawer(r, c, 0.01);
          k.poly([...q], k.side(shade(C.wood, 0.1), 0, 1, 0.14), k.thin);
          const card = [on(q, 0.3, 0.55), on(q, 0.7, 0.55), on(q, 0.7, 0.85), on(q, 0.3, 0.85)] as P3[];
          k.poly(card, '#e8dcc0', Math.max(0.7, k.thin * 0.6));
          const [x, y] = k.p(...on(q, 0.5, 0.32));
          k.pen.beginPath();
          k.pen.arc(x, y, Math.max(1, 0.16 * k.s), 0, Math.PI * 2);
          k.paint(C.brass, Math.max(0.7, k.thin * 0.6));
        }
      }
      // the top: a slab with a carved lip
      k.box(u0 - 0.3, v0 - 0.2, z1, u1 - u0 + 0.6, v1 - v0 + 0.45, 0.5, shade(C.wood, 0.06));
      const zt = z1 + 0.5;
      // jars of specimens: mushrooms, glowing spores, roots
      const jar = (u: number, w: number, h: number, fillC: Color, glow: boolean) => {
        k.cyl(u, w, zt, 0.62, h, withAlpha(C.glass, 0.5), { line: k.thin });
        k.cyl(u, w, zt + 0.05, 0.5, h * 0.7, fillC, { line: 0 });
        k.cyl(u, w, zt + h, 0.68, 0.28, C.wood, { line: k.thin });
        if (glow) k.halo(u, w, zt + h * 0.4, 1.6, fillC, 0.4);
      };
      jar(1.3, 1.4, 1.8, C.capRed, false);
      jar(2.7, 1.2, 2.4, C.glow, true);
      jar(4.0, 1.5, 1.5, C.capTan, false);
      // a mortar and pestle
      k.cyl(5.6, 2.0, zt, 0.75, 0.75, '#b0a8bc');
      k.disc(5.6, 2.0, zt + 0.75, 0.55, '#5a4f68', 0);
      k.rod([[5.7, 2.0, zt + 0.6], [6.3, 1.8, zt + 1.7]], '#cfc8d8', 0.2);
      // a magnifying glass on a stand
      k.cyl(8.0, 1.6, zt, 0.6, 0.2, C.brass, { line: k.thin });
      k.rod([[8.0, 1.6, zt + 0.2], [8.0, 1.6, zt + 2.2], [8.6, 2.0, zt + 2.6]], C.brass, 0.12);
      const lens = ring(k, [9.0, 2.2, zt + 2.6], [0.4, 0.8, 0.45], 0.9, 20);
      fillPts(k, lens, withAlpha('#cfeaff', 0.45), k.thin * 1.3);
      // a little lantern at the end
      k.box(10.0, 1.2, zt, 1.0, 1.0, 1.5, C.iron, { line: k.thin, stripe: false });
      k.poly([[10.1, 2.21, zt + 0.2], [10.9, 2.21, zt + 0.2], [10.9, 2.21, zt + 1.3], [10.1, 2.21, zt + 1.3]], '#ffd890', 0);
      k.box(9.9, 1.1, zt + 1.5, 1.2, 1.2, 0.25, C.iron, { line: k.thin });
      k.halo(10.5, 1.7, zt + 0.8, 2.6, C.lantern, 0.4);
    });
    // the lens' glint (round in two seconds, the loop a worked station is
    // drawn round: the herbalist works it whenever it is there)
    const zt = z1 + 0.5;
    const ph = v.active ? (v.t * 0.5) % 1 : 0.3;
    const [lx, ly] = k.p(9.0 - 0.3 + ph * 0.5, 2.2, zt + 2.85 - ph * 0.4);
    k.pen.beginPath();
    k.pen.ellipse(lx, ly, 0.16 * k.s, 0.28 * k.s, -0.6, 0, Math.PI * 2);
    k.pen.fillStyle = '#ffffffb0';
    k.pen.fill();
    if (!v.active) return;
    // a drawer out, its spores aglow: a new one every second
    const per = 1;
    const n = Math.floor(v.t / per);
    const f = (v.t / per) % 1;
    const out = 1.4 * ease(Math.min(1, f * 4) - Math.max(0, f * 4 - 3));
    const idx = Math.floor(hash(n % 2, 9) * ROWS * COLS);
    const r = idx % ROWS;
    const c = Math.floor(idx / ROWS);
    if (out <= 0.02) return;
    const front = drawer(r, c, out);
    const back = drawer(r, c, 0);
    // the open box: its top (the spores inside), the end, the front
    const top: P3[] = [[front[3][0], back[3][1], front[3][2]], [front[2][0], back[2][1], front[2][2]], front[2], front[3]];
    const lid = top.map(([u, w, z]): P3 => [u, w, z - 0.15]);
    k.poly(lid, '#2a1e34', k.thin);
    k.poly(lid.map(([u, w, z]): P3 => [u + (u < (front[0][0] + front[1][0]) / 2 ? 0.15 : -0.15), w, z - 0.05]), C.glow, 0);
    k.poly([front[1], [front[1][0], back[1][1], front[1][2]], [front[2][0], back[2][1], front[2][2]], front[2]], k.side(shade(C.wood, 0.1), 1, 0), k.thin);
    k.poly([...front], k.side(shade(C.wood, 0.1), 0, 1, 0.14), k.thin);
    const [x, y] = k.p(...on(front, 0.5, 0.32));
    k.pen.beginPath();
    k.pen.arc(x, y, Math.max(1, 0.16 * k.s), 0, Math.PI * 2);
    k.paint(C.brass, Math.max(0.7, k.thin * 0.6));
    const m = on(top as unknown as [P3, P3, P3, P3], 0.5, 0.5);
    k.halo(m[0], m[1], m[2] + 0.3, 1.8, C.glow, 0.55);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 2.2, v.seed);
    const per = 1;
    const idx = Math.floor(hash(Math.floor(v.t / per) % 2, 9) * ROWS * COLS);
    const q = drawer(idx % ROWS, Math.floor(idx / ROWS), 0.7);
    const m = on(q, 0.5, 1);
    for (let i = 0; i < n; i++) spawn(spore(m[0], m[1], m[2], Math.floor(v.t * 10), i, [150, 255, 220], 0.5));
  },
};

// ── run: the cauldron ──────────────────────────────────────────────────────
// The pot sits toward the far end (-u) of its ring of stones, so the witch
// standing past that end (see ./npcs.ts) can reach in with her ladle; the
// stump of bottles and the basket stand at the near end. While she works
// it (it is worked whenever she is there) her ladle is in her hands, not
// in the pot. Its flames and bubbles go round in two seconds, the loop a
// worked station is drawn round.

export const POT = { u: 4.6, v: 5.4, z: 2.2, r: 3.0, h: 3.6 };
const STONES = 3.6; // the fire ring's radius

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const { u: cu, v: cv, z: cz, h } = POT;
    // behind: the back stones, the embers, the stump of bottles, the basket
    const k = still(v, 'run-back', 15, (k) => {
      k.shadow(5.6, 5.4, 4.9, 5.0, 0.3);
      stones(k, false);
      k.disc(cu, cv, 0.05, 3.0, '#2a1a22', 0);
      k.pool(cu, cv, 2.8, 2.8, '#ff8a3a', 0.6, 0.06);
      k.shadow(9.4, 1.6, 1.4, 1.2, 0.25);
      k.cyl(9.4, 1.6, 0, 1.25, 2.4, C.wood, { top: '#d9b98a' });
      bottle(k, 9.0, 1.4, 2.4, 0.38, 1.0, C.red);
      flask(k, 9.8, 1.9, 2.4, 0.45, C.blue);
      bottle(k, 9.2, 2.2, 2.4, 0.3, 0.8, C.gold);
      k.shadow(9.6, 9.6, 1.4, 1.1, 0.25);
      k.cyl(9.6, 9.6, 0, 1.2, 1.3, '#b98a4e');
      clump(k, 9.6, 9.6, 1.15, 5, 0.7, 0.55, [C.capRed, C.capTan, C.capViolet], 31);
    });
    const t = v.t;
    const heat = v.active ? 1 : 0.55;
    // flames behind the pot, the pot, flames licking up its front, the brew
    fire(k, heat, t, false);
    still(v, v.active ? 'run-pot-stirred' : 'run-pot', 15, (k) => cauldron(k, !v.active));
    fire(k, heat, t, true);
    bubbles(k, v.active, t);
    still(v, 'run-front', 15, (k) => stones(k, true));
    if (v.active) k.halo(cu, cv, cz + h + 0.5, 4, C.sludge, 0.3);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const { u, v: w, z, h } = POT;
    const n = due(v.t, dt, v.active ? 4 : 0.6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      spawn(puff(u + (hash(tick, 1) - 0.5) * 2.4, w + (hash(tick, 2) - 0.5) * 2, z + h + 0.4, tick, i, [170, 235, 110], 2.6));
    }
    if (v.active) {
      const m = due(v.t, dt, 1.2, v.seed + 1);
      for (let i = 0; i < m; i++) spawn(spore(u, w, z + h + 1, Math.floor(v.t * 10), i, [210, 255, 120], 1.6));
    }
  },
};

// The stones of the fire ring, the back half or the front.
function stones(k: Kit, front: boolean): void {
  const { u: cu, v: cv } = POT;
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * Math.PI * 2 + 0.3;
    if (Math.sin(a) + Math.cos(a) > 0 !== front) continue;
    boulder(k, cu + Math.cos(a) * STONES, cv + Math.sin(a) * STONES, 0, 0.8 + hash(i, 3) * 0.3, 0.9 + hash(i, 4) * 0.5, i & 1 ? '#7a6d92' : '#6a5d82', i * 7 + 1, i % 3 === 0);
  }
}

// Flames licking up round the pot's belly: the ones behind it or the ones
// in front.
function fire(k: Kit, heat: number, t: number, front: boolean): void {
  const { u: cu, v: cv } = POT;
  const z = 0.1;
  if (!front) k.halo(cu, cv, z + 1.5, 4.5, '#ff9a48', 0.35 * heat + 0.1);
  const pen = k.pen;
  const tongue = (du: number, dv: number, w: number, hh: number, sway: number, c: Color) => {
    const [x, y] = k.p(cu + du, cv + dv, z);
    const H = hh * k.s * heat;
    const W = w * k.s;
    pen.beginPath();
    pen.moveTo(x - W, y);
    pen.quadraticCurveTo(x - W * 0.9, y - H * 0.55, x + sway * k.s, y - H);
    pen.quadraticCurveTo(x + W * 0.9, y - H * 0.55, x + W, y);
    pen.closePath();
    pen.fillStyle = c;
    pen.fill();
  };
  const sw = (i: number) => Math.sin(t * TAU + i * 1.7) * 0.35;
  const at: ReadonlyArray<readonly [number, number]> = [[-2.4, 0.4], [2.3, -0.6], [-0.4, -1.8], [-1.2, 2.2], [1.6, 1.7], [0.3, 2.7]];
  for (const [i, [du, dv]] of at.entries()) {
    if (du + dv > 1 !== front) continue;
    tongue(du, dv, 0.75, 2.6 + Math.sin(t * TAU + i) * 0.4, sw(i), '#ff7a2a');
    tongue(du, dv, 0.45, 1.7 + Math.sin(t * 1.5 * TAU + i) * 0.3, sw(i + 3), C.flame);
    tongue(du, dv, 0.2, 0.9, sw(i + 5), C.flameHot);
  }
}

// The cauldron: an iron belly on three legs, a thick rim, the brew inside,
// a ladle in it unless the witch has it.
function cauldron(k: Kit, ladle: boolean): void {
  const { u: cu, v: cv, z: cz, r, h } = POT;
  const pen = k.pen;
  for (const a of [0.9, 2.9, 4.9]) k.rod([[cu + Math.cos(a) * r * 0.6, cv + Math.sin(a) * r * 0.6, cz + 0.4], [cu + Math.cos(a) * r * 0.75, cv + Math.sin(a) * r * 0.75, 0]], C.iron, 0.4);
  const rim = k.ell(cu, cv, cz + h, r * 0.86);
  const belly = k.ell(cu, cv, cz + h * 0.42, r);
  const [, by] = k.p(cu, cv, cz);
  pen.beginPath();
  pen.moveTo(rim.cx - rim.rx, rim.cy);
  pen.bezierCurveTo(belly.cx - belly.rx * 1.12, rim.cy + (belly.cy - rim.cy) * 0.6, belly.cx - belly.rx * 1.05, by, belly.cx, by + belly.ry * 0.2);
  pen.bezierCurveTo(belly.cx + belly.rx * 1.05, by, belly.cx + belly.rx * 1.12, rim.cy + (belly.cy - rim.cy) * 0.6, rim.cx + rim.rx, rim.cy);
  pen.closePath();
  const g = pen.createRadialGradient(belly.cx - belly.rx * 0.45, belly.cy - belly.ry * 1.2, 0, belly.cx, belly.cy, belly.rx * 1.4);
  g.addColorStop(0, '#6e6880');
  g.addColorStop(0.4, '#3e3a4a');
  g.addColorStop(1, '#1e1a26');
  k.paint(g, k.lw);
  // the fire's glow on its underside
  pen.save();
  pen.clip();
  k.halo(cu, cv, cz - 0.4, 3.4, '#ff8a3a', 0.4);
  pen.restore();
  for (const s of [-1, 1]) {
    const [hx, hy] = k.p(cu + s * r * 0.72, cv - s * r * 0.72, cz + h * 0.75);
    pen.beginPath();
    pen.ellipse(hx, hy, 0.38 * k.s, 0.48 * k.s, 0, 0, Math.PI * 2);
    pen.strokeStyle = INK;
    pen.lineWidth = 0.32 * k.s + k.lw;
    pen.stroke();
    pen.strokeStyle = '#4a4458';
    pen.lineWidth = 0.32 * k.s;
    pen.stroke();
  }
  pen.beginPath();
  pen.ellipse(rim.cx, rim.cy, rim.rx * 1.08, rim.ry * 1.08, 0, 0, Math.PI * 2);
  k.paint('#5a5468', k.lw);
  const brew = k.ell(cu, cv, cz + h - 0.15, r * 0.74);
  pen.beginPath();
  pen.ellipse(brew.cx, brew.cy, brew.rx, brew.ry, 0, 0, Math.PI * 2);
  const bg = pen.createRadialGradient(brew.cx - brew.rx * 0.2, brew.cy - brew.ry * 0.2, 0, brew.cx, brew.cy, brew.rx);
  bg.addColorStop(0, C.sludgeHot);
  bg.addColorStop(0.6, C.sludge);
  bg.addColorStop(1, C.sludgeDark);
  k.paint(bg, k.thin);
  k.halo(cu, cv, cz + h, 2.6, C.sludge, 0.35);
  if (ladle) k.rod([[cu + 0.6, cv - 0.8, cz + h - 0.2], [cu + 1.8, cv - 2.0, cz + h + 2.6]], C.wood, 0.22);
}

// Bubbles on the brew: rising, swelling, popping (a slow simmer when idle).
// Each lives a half, two thirds or a whole second, so every two seconds
// they come round again where they were.
function bubbles(k: Kit, active: boolean, t: number): void {
  const { u: cu, v: cv, z: cz, r, h } = POT;
  const pen = k.pen;
  const n = active ? 7 : 2;
  const rings: Array<[number, number, number]> = [];
  pen.beginPath();
  for (let i = 0; i < n; i++) {
    const per = 2 / (2 + Math.floor(hash(i, 11) * 3));
    const cyc = t / per + hash(i, 12);
    const ph = cyc % 1;
    const life = Math.floor(cyc) % Math.round(2 / per);
    const a = hash(i, 13, life) * Math.PI * 2;
    const d = Math.sqrt(hash(i, 14, life)) * r * 0.55;
    const [x, y] = k.p(cu + Math.cos(a) * d, cv + Math.sin(a) * d, cz + h - 0.1);
    const R = (0.15 + ph * 0.4) * k.s * (active ? 1 : 0.8);
    if (ph > 0.85) {
      rings.push([x, y, R * 1.3]);
      continue;
    }
    pen.moveTo(x + R, y - R * 0.2);
    pen.ellipse(x, y - R * 0.2, R, R * 0.85, 0, 0, Math.PI * 2);
  }
  k.paint(C.sludgeHot, Math.max(0.7, k.thin * 0.6), C.sludgeDark);
  pen.beginPath();
  for (const [x, y, R] of rings) {
    pen.moveTo(x + R, y);
    pen.ellipse(x, y, R, R * 0.55, 0, 0, Math.PI * 2);
  }
  pen.strokeStyle = '#f4ffc0';
  pen.lineWidth = Math.max(0.8, 0.08 * k.s);
  pen.stroke();
}

// ── web: the scrying orb on the mycelium ─────────────────────────────────────

const ORB: P3 = [4.5, 4.5, 9.6];
const ORB_R = 2.3;
const THREADS = 7;

// The thread from the stalk's foot out to its little mushrooms, as points.
function thread(i: number): P3[] {
  const a = (i / THREADS) * Math.PI * 2 + 0.4;
  const R = 3.7;
  const pts: P3[] = [];
  for (let j = 0; j <= 8; j++) {
    const f = j / 8;
    const wob = Math.sin(f * 7 + i * 2) * 0.35 * f;
    pts.push([4.5 + Math.cos(a) * R * f - Math.sin(a) * wob, 4.5 + Math.sin(a) * R * f + Math.cos(a) * wob, 0.06]);
  }
  return pts;
}

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const [ou, ov, oz] = ORB;
    const k = still(v, 'web', 13, (k) => {
      k.shadow(4.5, 4.5, 4.2, 4.2, 0.26);
      // a mossy mound and the threads of glowing mycelium running out of it
      k.disc(4.5, 4.5, 0.04, 2.2, C.mossDark, k.thin);
      for (let i = 0; i < THREADS; i++) k.line(thread(i), withAlpha(C.glow, 0.85), Math.max(1, 0.18 * k.s));
      for (let i = 0; i < THREADS; i++) k.line(thread(i), withAlpha(C.glowHot, 0.9), Math.max(0.6, 0.06 * k.s));
      // little mushrooms at the ends, back ones first
      const ends = Array.from({ length: THREADS }, (_, i) => thread(i)[8]).sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
      for (const [i, e] of ends.entries()) clump(k, e[0], e[1], 0, 2, 0.4, 0.5, [i % 3 ? C.glow : C.capViolet], 40 + i, i % 3 !== 0);
      // the stalk, twisting up into a claw that holds the orb
      ribbon(k, curve([[4.5, 4.5, 0.2], [4.1, 4.6, 2.5], [4.9, 4.4, 5.0], [4.5, 4.5, oz - ORB_R + 0.4]], 14), 1.6, 0.9, C.root);
      root(k, [4.3, 4.5, 0.4], [3.4, 5.2, 0.2], [2.6, 5.8, 0.05], 0.5);
      root(k, [4.8, 4.6, 0.4], [5.8, 4.1, 0.2], [6.6, 3.6, 0.05], 0.45);
      for (const a of [0.6, 2.7, 4.8]) {
        const cx = ou + Math.cos(a) * 0.4;
        const cy = ov + Math.sin(a) * 0.4;
        k.rod([[cx, cy, oz - ORB_R + 0.2], [ou + Math.cos(a) * ORB_R * 0.95, ov + Math.sin(a) * ORB_R * 0.95, oz - ORB_R * 0.35]], C.root, 0.28);
      }
      bracket(k, 4.5, 5.0, 3.6, 0.7, '#d8a66a', false, 0.3);
    });
    // the orb: mist swirling inside, brighter while browsed
    const pen = k.pen;
    const [x, y] = k.p(ou, ov, oz);
    const R = ORB_R * k.s;
    const lit = v.active ? 1 : 0.45;
    k.halo(ou, ov, oz, ORB_R * 1.9, C.glow, 0.25 + 0.25 * lit);
    pen.beginPath();
    pen.arc(x, y, R, 0, Math.PI * 2);
    const g = pen.createRadialGradient(x - R * 0.3, y - R * 0.35, 0, x, y, R);
    g.addColorStop(0, v.active ? '#e8fff8' : '#bfe9e0');
    g.addColorStop(0.5, v.active ? '#7fe9cf' : '#5fae9f');
    g.addColorStop(1, v.active ? '#2f8a86' : '#2a5a62');
    pen.fillStyle = g;
    pen.fill();
    // the swirl
    pen.save();
    pen.beginPath();
    pen.arc(x, y, R * 0.92, 0, Math.PI * 2);
    pen.clip();
    const spin = v.t * (v.active ? 1.6 : 0.4);
    pen.beginPath();
    for (let i = 0; i < 3; i++) {
      const a0 = spin + (i * Math.PI * 2) / 3;
      for (let j = 0; j <= 10; j++) {
        const a = a0 + j * 0.28;
        const rr = R * (0.15 + j * 0.065);
        const px = x + Math.cos(a) * rr;
        const py = y + Math.sin(a) * rr * 0.8;
        if (j) pen.lineTo(px, py);
        else pen.moveTo(px, py);
      }
    }
    pen.strokeStyle = withAlpha('#ffffff', v.active ? 0.75 : 0.4);
    pen.lineWidth = Math.max(1, 0.22 * k.s);
    pen.lineCap = 'round';
    pen.stroke();
    pen.restore();
    pen.beginPath();
    pen.arc(x, y, R, 0, Math.PI * 2);
    k.paint(null, k.lw);
    pen.beginPath();
    pen.ellipse(x - R * 0.38, y - R * 0.42, R * 0.26, R * 0.16, -0.6, 0, Math.PI * 2);
    pen.fillStyle = '#ffffffc0';
    pen.fill();
    if (!v.active) return;
    // pulses running in along the threads
    pen.beginPath();
    for (let i = 0; i < THREADS; i++) {
      const pts = thread(i);
      const f = 1 - ((v.t * 0.7 + hash(i, 3)) % 1);
      const j = Math.min(7, Math.floor(f * 8));
      const q = f * 8 - j;
      const p: P3 = [pts[j][0] + (pts[j + 1][0] - pts[j][0]) * q, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * q, 0.08];
      const [px, py] = k.p(...p);
      const r = Math.max(1.2, 0.3 * k.s);
      pen.moveTo(px + r, py);
      pen.ellipse(px, py, r, r * 0.6, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = '#eafff8';
    pen.fill();
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.5, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: ORB[0] + j(1) * 3, y: ORB[1] + j(2) * 3, z: ORB[2] + j(3) * 2, vx: j(4) * 0.6, vy: j(5) * 0.6, vz: 1 + j(6), life: 1.4, color: [180, 255, 230], glow: true, gravity: -0.2 });
    }
  },
};

// ── think: the fairy ring ─────────────────────────────────────────────────────

// The myconid sits on the moss in its middle (see ./npcs.ts), so the ring
// is worked whenever it is there: its light runs round once in two
// seconds, the loop a worked station is drawn round.
const RING_N = 12;
export const RING = { u: 5.4, v: 4.2, ru: 3.9, rv: 2.5 };
const STONE = { u: 9.9, v: 2.1 };

// The ring's mushrooms, back ones first.
function ringShrooms(): Array<{ i: number; u: number; v: number; h: number; r: number }> {
  const out: Array<{ i: number; u: number; v: number; h: number; r: number }> = [];
  for (let i = 0; i < RING_N; i++) {
    const a = (i / RING_N) * Math.PI * 2;
    out.push({ i, u: RING.u + Math.cos(a) * RING.ru, v: RING.v + Math.sin(a) * RING.rv, h: 1.1 + hash(i, 21) * 0.6, r: 0.6 + hash(i, 22) * 0.2 });
  }
  return out.sort((p, q) => p.u + p.v - (q.u + q.v));
}

// The rune stone's marks (spirals and dots, no letters): strokes on its face.
function runes(k: Kit): void {
  const pen = k.pen;
  const { u, v } = STONE;
  const F = v + 1.0;
  pen.beginPath();
  const spiral = (zc: number, uc: number, r: number) => {
    for (let j = 0; j <= 14; j++) {
      const a = j * 0.55;
      const rr = (r * j) / 14;
      const [x, y] = k.p(uc + Math.cos(a) * rr, F, zc + Math.sin(a) * rr);
      if (j) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    }
  };
  spiral(8.2, u, 0.7);
  spiral(4.9, u - 0.2, 0.5);
  for (let i = 0; i < 3; i++) {
    const [x, y] = k.p(u - 0.6 + i * 0.6, F, 6.6);
    pen.moveTo(x + 0.12 * k.s, y);
    pen.arc(x, y, 0.12 * k.s, 0, Math.PI * 2);
  }
  const [x0, y0] = k.p(u - 0.7, F, 3.3);
  const [x1, y1] = k.p(u + 0.7, F, 3.3);
  pen.moveTo(x0, y0);
  pen.lineTo(x1, y1);
}

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'think', 16, (k) => {
      k.shadow(6, 3.6, 6.2, 3.4, 0.26);
      // a glowing mushroom at the back, tall as a lamp, off to the side
      // of the myconid on the moss (not straight behind its head)
      k.shadow(7.0, 1.1, 1.4, 1.2, 0.26);
      shroom(k, 7.0, 1.1, 0, 11.5, 2.3, C.glow, { glow: true, cap: 'dome', skirt: true, lean: [-0.3, 0.3], seed: 5 });
      // the rune stone
      const { u, v: sv } = STONE;
      k.shadow(u, sv + 0.5, 1.8, 1.2, 0.3);
      const face: P3[] = [[u - 1.3, sv + 1.0, 0], [u + 1.3, sv + 1.0, 0], [u + 1.15, sv + 1.0, 8.4], [u + 0.4, sv + 1.0, 9.8], [u - 0.6, sv + 1.0, 9.6], [u - 1.25, sv + 1.0, 8.0]];
      const back = face.map(([a, , z]): P3 => [a, sv - 0.6, z]);
      k.poly([face[1], [face[1][0], sv - 0.6, 0], [back[2][0], sv - 0.6, back[2][2]], face[2]], k.side('#6a5d82', 1, 0), k.lw, 0.2);
      k.poly([face[2], face[3], face[4], face[5], back[5], back[4], back[3], back[2]], '#8a7ca3', k.lw, 0.3);
      k.poly(face, k.side('#7a6d92', 0, 1), k.lw, 0.3);
      runes(k);
      k.pen.strokeStyle = withAlpha(INK, 0.6);
      k.pen.lineWidth = Math.max(0.8, 0.14 * k.s);
      k.pen.lineCap = 'round';
      k.pen.stroke();
      k.poly([[u - 1.2, sv + 1.02, 0], [u + 1.25, sv + 1.02, 0], [u + 1.0, sv + 1.02, 1.6], [u - 1.1, sv + 1.02, 1.9]], withAlpha(C.moss, 0.9), 0, 0.3);
      // the moss cushion inside the ring, and a little stack of stones
      k.shadow(RING.u, RING.v, 2.2, 1.6, 0.2);
      k.disc(RING.u, RING.v, 0.05, 2.0, C.mossDark, k.thin);
      boulder(k, RING.u, RING.v, 0, 1.7, 0.9, C.moss, 77);
      tuft(k, RING.u - 1.2, RING.v + 0.8, 0.5, 0.8, C.mossLight, 3);
      // the fairy ring
      for (const m of ringShrooms()) shroom(k, m.u, m.v, 0, m.h, m.r, '#f0e2c4', { cap: 'dome', seed: m.i, rb: m.r * 0.4 });
    });
    // the ring and the runes waking while someone thinks: a light running
    // round the caps, the marks aglow
    const pen = k.pen;
    const a = v.active ? 0.5 + 0.3 * Math.sin(v.t * TAU) : 0.12;
    runes(k);
    pen.strokeStyle = withAlpha(C.glowHot, v.active ? 0.6 + 0.3 * Math.sin(v.t * Math.PI) : 0.15);
    pen.lineWidth = Math.max(0.8, 0.1 * k.s);
    pen.lineCap = 'round';
    pen.stroke();
    if (v.active) k.halo(STONE.u, STONE.v + 1.1, 6.5, 3.6, C.glow, 0.25 * a + 0.15);
    if (!v.active) return;
    const lead = (v.t * (RING_N / 2)) % RING_N;
    for (const m of ringShrooms()) {
      const d = (m.i - lead + RING_N) % RING_N;
      const f = d < 4 ? 1 - d / 4 : 0;
      if (f <= 0) continue;
      k.halo(m.u, m.v, m.h + 0.3, 1.5, C.glow, 0.7 * f);
      const e = k.ell(m.u, m.v, m.h + m.r * 0.35, m.r * 0.6);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry * 1.2, 0, 0, Math.PI * 2);
      pen.fillStyle = withAlpha(C.glowHot, 0.8 * f);
      pen.fill();
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.8, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const a = hash(tick, 5) * Math.PI * 2;
      spawn(spore(RING.u + Math.cos(a) * RING.ru, RING.v + Math.sin(a) * RING.rv, 1.4, tick, i, [170, 255, 225], 0.3));
    }
  },
};

// ── idle: the mushroom-cap table ──────────────────────────────────────────────
// A big flat spotted cap as a table, set with a teapot, cups and a bowl of
// glowing berries; toadstools to sit on, a mossy log bench with a blanket
// behind, a lamp of glowing caps at one end. Where tired agents rest.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    // a carpet of soft pale moss under it all, ringed with pebbles
    const mat: P3[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const j = 0.94 + hash(v.seed, i, 7) * 0.08;
      mat.push([7.5 + Math.cos(a) * 6.9 * j, 5.6 + Math.sin(a) * 4.9 * j, 0.04]);
    }
    k.shadow(7.5, 5.6, 7.2, 5.2, 0.14);
    k.poly(mat, '#5f8f5e', k.thin, 1.2);
    k.poly(mat.map(([u, w, z]): P3 => [7.5 + (u - 7.5) * 0.84, 5.6 + (w - 5.6) * 0.82, z + 0.01]), '#6c9c66', 0, 1);
    k.pool(7.5, 5.6, 5.5, 4, '#ffd890', 0.16, 0.06);
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * Math.PI * 2 + 0.1;
      const e = k.ell(7.5 + Math.cos(a) * 6.9, 5.6 + Math.sin(a) * 4.9, 0.05, 0.3 + hash(v.seed, i, 8) * 0.2);
      pen.moveTo(e.cx + e.rx, e.cy);
      pen.ellipse(e.cx, e.cy - e.ry * 0.3, e.rx, e.ry * 1.3, 0, 0, Math.PI * 2);
    }
    k.paint('#8d86a0', Math.max(0.7, k.thin * 0.6));
    k.shadow(7.5, 5.2, 7.4, 5.0, 0.18);
    // the log bench along the back, moss on top, a blanket over one end
    k.shadow(6.5, 2.2, 5.6, 1.6, 0.28);
    for (const u of [2.6, 10.4]) k.box(u - 0.5, 1.5, 0, 1.0, 1.4, 1.4, C.woodDark, { line: k.thin });
    logBench(k, 1.2, 11.8, 2.2, 2.4, 1.15);
    k.poly([[2.2, 1.2, 3.55], [4.2, 1.2, 3.55], [4.3, 3.35, 3.2], [4.3, 3.45, 1.4], [2.1, 3.45, 1.4], [2.1, 3.35, 3.2]], '#6c3f80', k.lw, 0.2);
    if (k.fine) for (let u = 2.4; u < 4.2; u += 0.35) k.line([[u, 3.47, 1.6], [u, 3.47, 3.1]], shade('#6c3f80', -0.25), 0.06 * k.s);
    k.line([[2.1, 3.5, 1.45], [4.3, 3.5, 1.45]], C.gold, Math.max(1, 0.16 * k.s));
    // a lamp of glowing caps at the right end
    k.shadow(13.4, 2.2, 1.4, 1.2, 0.26);
    shroom(k, 13.3, 2.0, 0, 7.8, 1.6, C.glow, { glow: true, cap: 'dome', seed: 3 });
    shroom(k, 14.1, 3.0, 0, 4.6, 1.0, C.glow, { glow: true, cap: 'cone', seed: 4 });
    // the table: a stalk, a broad flat red cap
    const tu = 7.6;
    const tv = 6.6;
    k.shadow(tu, tv, 3.6, 2.8, 0.26);
    toadstool(k, 3.4, 7.8, 2.9, 1.5, C.capTan, v.seed + 1);
    shroom(k, tu, tv, 0, 3.8, 3.7, C.capRed, { cap: 'flat', spots: C.spot, rb: 1.1, seed: v.seed });
    const zt = 3.8 + 3.7 * 0.32 * 0.75;
    // set with tea and a bowl of berries
    teapot(k, tu - 0.6, tv - 0.9, zt);
    for (const [du, dv, c] of [[1.4, -0.3, '#f2ecf8'], [0.3, 1.4, '#cfe6ea']] as const) {
      k.cyl(tu + du, tv + dv, zt, 0.42, 0.62, c, { line: k.thin });
      k.disc(tu + du, tv + dv, zt + 0.6, 0.3, '#8a4a2e', 0);
    }
    k.cyl(tu - 1.5, tv + 0.9, zt, 0.75, 0.45, '#b98a4e', { line: k.thin });
    for (let i = 0; i < 6; i++) k.disc(tu - 1.5 + (hash(i, 1) - 0.5) * 0.8, tv + 0.9 + (hash(i, 2) - 0.5) * 0.6, zt + 0.5, 0.2, i & 1 ? C.glow : C.pink, Math.max(0.6, k.thin * 0.5));
    toadstool(k, 12.0, 8.4, 2.7, 1.45, C.capViolet, v.seed + 2);
    // a basket of glowing mushrooms by the bench
    k.shadow(1.4, 5.6, 1.2, 1.0, 0.24);
    k.cyl(1.4, 5.6, 0, 1.0, 1.0, '#b98a4e');
    clump(k, 1.4, 5.6, 0.9, 4, 0.55, 0.45, [C.glow, C.capRed], 51, false);
  },
};

// A mossy log lying along u from u0 to u1, centred at v = cv, radius r, its
// top at z0 + 2r.
function logBench(k: Kit, u0: number, u1: number, cv: number, z0: number, r: number): void {
  const zc = z0 + r - 0.8;
  const pen = k.pen;
  const top = [k.p(u0, cv - r * 0.2, zc + r), k.p(u1, cv - r * 0.2, zc + r)];
  const bot = [k.p(u0, cv + r * 0.4, zc - r * 0.9), k.p(u1, cv + r * 0.4, zc - r * 0.9)];
  pen.beginPath();
  pen.moveTo(top[0][0], top[0][1]);
  pen.lineTo(top[1][0], top[1][1]);
  pen.lineTo(bot[1][0], bot[1][1]);
  pen.lineTo(bot[0][0], bot[0][1]);
  pen.closePath();
  const g = k.lgrad([u0, cv, zc + r], [u0, cv, zc - r], [1, 0, 0], [[0, shade(C.wood, 0.15)], [0.5, C.wood], [1, shade(C.wood, -0.3)]]);
  k.paint(g, k.lw);
  // the cut end facing +u, rings on it
  const end = ring(k, [u1, cv + 0.1, zc + 0.05], [1, 0, 0], r * 0.98, 18);
  fillPts(k, end, '#d9b98a', k.lw);
  const [ex, ey] = k.p(u1, cv + 0.1, zc + 0.05);
  pen.beginPath();
  pen.ellipse(ex, ey, r * 0.45 * k.s, r * 0.7 * k.s, 0.45, 0, Math.PI * 2);
  pen.strokeStyle = '#a07a52';
  pen.lineWidth = Math.max(0.7, 0.07 * k.s);
  pen.stroke();
  // moss along the top and a bracket on its side
  const moss: P3[] = [];
  for (let i = 0; i <= 16; i++) moss.push([u0 + 0.2 + ((u1 - u0 - 0.4) * i) / 16, cv - r * 0.2, zc + r + 0.05 + (i & 1 ? 0.25 : 0.05)]);
  for (let i = 16; i >= 0; i--) moss.push([u0 + 0.2 + ((u1 - u0 - 0.4) * i) / 16, cv + r * 0.15, zc + r * 0.75 - (i % 3) * 0.12]);
  k.poly(moss, C.moss, k.thin);
  bracket(k, (u0 + u1) * 0.62, cv + r * 0.55, zc - 0.1, 0.65, '#d8a66a', false, 0.25);
}

function teapot(k: Kit, cu: number, cv: number, z: number): void {
  const body = '#5f9e8a';
  k.rod([[cu + 0.7, cv, z + 0.8], [cu + 1.3, cv, z + 1.4]], body, 0.22);
  const e = k.ell(cu, cv, z + 0.75, 0.85);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx * 0.95, e.rx * 0.62, 0, 0, Math.PI * 2);
  const g = k.pen.createRadialGradient(e.cx - e.rx * 0.3, e.cy - e.rx * 0.3, 0, e.cx, e.cy, e.rx);
  g.addColorStop(0, shade(body, 0.3));
  g.addColorStop(1, shade(body, -0.15));
  k.paint(g, k.lw);
  k.rod([[cu - 0.75, cv, z + 1.1], [cu - 1.15, cv, z + 0.9], [cu - 0.8, cv, z + 0.4]], body, 0.12);
  // a little mushroom-cap lid
  k.disc(cu, cv, z + 1.3, 0.38, C.capRed, k.thin);
  k.disc(cu, cv, z + 1.45, 0.12, C.spot, k.thin);
}

// ── entrance: the tunnel mouth ───────────────────────────────────────────────

const DOOR = { u0: 3.3, u1: 9.3, spring: 5.6, hv: 0.1 };
const MOUTH = 6.3; // the opening's middle

// The arched opening (or door) of half-width w round MOUTH, its arch
// springing at `spring`, in the plane v = n.
function archPts(w: number, spring: number, n: number, steps = 14): P3[] {
  const pts: P3[] = [[MOUTH - w, n, 0], [MOUTH + w, n, 0], [MOUTH + w, n, spring]];
  for (let i = 1; i < steps; i++) {
    const th = (i / steps) * Math.PI;
    pts.push([MOUTH + w * Math.cos(th), n, spring + w * Math.sin(th)]);
  }
  pts.push([MOUTH - w, n, spring]);
  return pts;
}

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 18,
  animated: true,
  draw(v: PropView): void {
    const { spring } = DOOR;
    const half = (DOOR.u1 - DOOR.u0) / 2;
    const k = still(v, 'entrance', 18, (k) => {
      // the rock bulging round the mouth, moss over it
      const mound = archPts(half + 2.6, spring, 0.05, 16);
      k.poly(mound, k.vgrad(MOUTH, 0, 0, spring + half + 2.6, [[0, '#7a6d92'], [1, '#62567c']]), k.lw, 0.8);
      const lip = archPts(half + 2.6, spring, 0.07, 16).slice(2);
      k.line(lip.slice(3, -3).map(([u, n, z]): P3 => [u, n + 0.05, z - 0.3]), '#a598bf', Math.max(1, 0.3 * k.s));
      // the tunnel beyond: dark, a glow far inside, roots across its roof
      const open = archPts(half, spring, 0.1);
      k.poly(open, k.vgrad(MOUTH, 0, 0, spring + half, [[0, '#1c1428'], [1, '#0e0a16']]), k.thin);
      k.halo(MOUTH, -0.5, 2.6, 2.8, C.glow, 0.35);
      k.poly([[MOUTH - half, 0.1, 0], [MOUTH + half, 0.1, 0], [MOUTH + half * 0.55, 0.1, 1.4], [MOUTH - half * 0.55, 0.1, 1.4]], '#2c2234', 0);
      // a frame of roots round the opening
      const frame = archPts(half + 0.5, spring, 0.6, 16).slice(2);
      const arc: P3[] = [[MOUTH - half - 0.5, 0.6, 0], ...frame.reverse(), [MOUTH + half + 0.5, 0.6, 0]];
      ribbon(k, arc, 1.0, 1.0, C.root);
      root(k, [MOUTH - 1, 0.7, spring + half + 0.4], [MOUTH - 1.6, 1.0, spring + half - 1.6], [MOUTH - 1.2, 1.1, spring + half - 2.6], 0.35);
      root(k, [MOUTH + 2, 0.7, spring + half + 0.1], [MOUTH + 2.6, 1.0, spring + half - 1.2], [MOUTH + 2.2, 1.1, spring + half - 2.2], 0.3);
      // moss on top of the mound with little mushrooms
      clump(k, MOUTH - 2.2, 0.8, spring + half + 2.0, 3, 0.6, 0.6, [C.capRed], 61);
      clump(k, MOUTH + 3.4, 0.8, spring + half + 0.9, 2, 0.5, 0.5, [C.glow], 62, true);
      // stepping stones out of it
      for (const [du, dv, r] of [[-0.6, 1.4, 1.0], [0.8, 2.9, 0.85]] as const) {
        const e = k.ell(MOUTH + du, dv, 0.05, r);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
        k.paint('#8d86a0', k.thin);
      }
      // left: a crooked post with the lantern's hook
      ribbon(k, curve([[1.5, 1.6, 0], [1.3, 1.6, 4], [1.7, 1.6, 8], [1.5, 1.6, 11.5]], 12), 0.8, 0.6, C.wood);
      k.rod([[1.5, 1.6, 11.3], [2.4, 1.8, 11.6], [2.9, 1.9, 11.1]], C.wood, 0.25);
      tuft(k, 1.0, 2.2, 0, 1.0, C.mossLight, 5);
      // right: a signpost pointing in, a barrel, a sack of mushrooms
      k.rod([[12.2, 1.0, 0], [12.2, 1.0, 7.6]], C.wood, 0.3);
      k.poly([[11.0, 1.1, 6.2], [13.4, 1.1, 6.2], [14.2, 1.1, 6.85], [13.4, 1.1, 7.5], [11.0, 1.1, 7.5]], k.side('#a98258', 0, 1), k.lw, 0.1);
      k.shadow(13.4, 2.7, 1.3, 1.0, 0.26);
      k.cyl(13.4, 2.7, 0, 1.0, 2.1, '#8a6040');
      for (const z of [0.4, 1.7]) {
        const e = k.ell(13.4, 2.7, z, 1.02);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
        k.pen.strokeStyle = '#3e3a48';
        k.pen.lineWidth = Math.max(1, 0.16 * k.s);
        k.pen.stroke();
      }
      clump(k, 13.4, 2.7, 2.1, 3, 0.5, 0.5, [C.capTan, C.capRed], 63);
      k.shadow(11.2, 3.1, 0.9, 0.7, 0.22);
      boulder(k, 11.2, 3.1, 0, 0.8, 1.2, '#c8a874', 64);
    });
    // the door: shut, or swung in while someone passes
    const th = v.active ? 1.2 + 0.08 * Math.sin(v.t * 2.2) : 0;
    doorLeaf(k, th, half, spring);
    // the lantern on its hook, swaying while the door is open
    const sw = v.active ? Math.sin(v.t * 3.1) * 0.25 : 0;
    const hook: P3 = [2.9, 1.9, 11.1];
    const lp: P3 = [hook[0] + Math.sin(sw) * 1.2, hook[1], hook[2] - Math.cos(sw) * 1.2];
    k.line([hook, lp], INK, Math.max(1, 0.08 * k.s));
    pod(k, [lp[0], lp[1], lp[2] - 0.6], 0.7, v.active ? 0.55 : 0.4);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.4, v.seed);
    for (let i = 0; i < n; i++) spawn(spore(MOUTH, 0.6, 2 + hash(Math.floor(v.t * 10), i) * 4, Math.floor(v.t * 10), i, [150, 255, 220], 1.6));
  },
};

// The arched door on its hinge at u0, opened by th radians into the room.
function doorLeaf(k: Kit, th: number, half: number, spring: number): void {
  const { u0, hv } = DOOR;
  const w = half * 2 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, hv + dv * s + du * n, z];
  const shapeOf = (n = 0, inset = 0): P3[] => {
    const r = w / 2 - inset;
    const pts: P3[] = [P(inset, inset, n), P(w - inset, inset, n), P(w - inset, spring, n)];
    for (let i = 1; i < 14; i++) {
      const a = (i / 14) * Math.PI;
      pts.push(P(w / 2 + r * Math.cos(a), spring + r * Math.sin(a), n));
    }
    pts.push(P(inset, spring, n));
    return pts;
  };
  const wood = '#8a6040';
  const face = k.side(wood, -dv, du, 0.18);
  if (th > 0.05) {
    // its edge, seen once it swings
    const e = shapeOf(-0.4);
    const f = shapeOf(0);
    const sil = hull([...e, ...f].map((p) => k.p(...p)));
    fillPts(k, sil, k.side(wood, du, dv, 0.25), k.thin);
  }
  k.poly(shapeOf(), face, k.lw);
  // planks, iron bands, a ring for a handle and a little round window
  const pen = k.pen;
  pen.save();
  shape(k, shapeOf().map((p) => k.p(...p)) as Pt[]);
  pen.clip();
  pen.beginPath();
  for (let i = 1; i < 4; i++) {
    const s = (w * i) / 4;
    const [x0, y0] = k.p(...P(s, 0));
    const [x1, y1] = k.p(...P(s, spring + w / 2));
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = shade(face, -0.3);
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.stroke();
  for (const z of [1.2, spring - 0.6]) k.line([P(0, z), P(w, z)], '#3e3a48', Math.max(1, 0.35 * k.s));
  pen.restore();
  const win = ring(k, P(w / 2, spring + 0.6, 0.05), [-dv, du, 0], 0.85, 16);
  fillPts(k, win, '#ffd890', k.thin);
  k.line([P(w / 2, spring - 0.25, 0.06), P(w / 2, spring + 1.45, 0.06)], '#3e3a48', Math.max(0.8, 0.12 * k.s));
  const [rx, ry] = k.p(...P(w - 0.8, 3.0, 0.15));
  pen.beginPath();
  pen.arc(rx, ry, 0.35 * k.s, 0, Math.PI * 2);
  pen.strokeStyle = INK;
  pen.lineWidth = 0.16 * k.s + k.thin;
  pen.stroke();
  pen.strokeStyle = C.brass;
  pen.lineWidth = 0.16 * k.s;
  pen.stroke();
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
