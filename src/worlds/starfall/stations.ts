import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import type { Quad } from './bits.ts';
import { across, band, bulbPlant, crateBox, fillPts, frustum, glassQuad, holoGlobe, hull, mug, on, pips, rflat, ring, rivets, rrect, stool, sub } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, due, hash, kitOf, still, withAlpha, wisp } from './kit.ts';

// The base's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame; idle, they
// hold still, so their pictures are not sent again.

type Spawn = (p: Particle) => void;

// A curved edge as a ribbon: the face under the edge v = f(u) from z0 to
// z1, shaded across (lit left, dark right).
function ribbon(k: Kit, us: ReadonlyArray<number>, f: (u: number) => number, z0: number, z1: number, base: Color, line = k.lw): void {
  const top: P3[] = us.map((u) => [u, f(u), z1]);
  const bot: P3[] = us.map((u) => [u, f(u), z0]).reverse() as P3[];
  const pts = [...top, ...bot];
  const scr = pts.map((p) => k.p(...p));
  fillPts(k, scr, across(k, scr, base, 0.1, 0.2), line);
}

const range = (a: number, b: number, n: number) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);

// A translucent hologram panel on a quad, at strength a.
function holoPanel(k: Kit, q: Quad, a: number): void {
  k.poly([...q], withAlpha(C.holo, 0.16 * a), 0);
  const pen = k.pen;
  pen.beginPath();
  k.trace([...q]);
  pen.strokeStyle = withAlpha(C.holo, 0.85 * a);
  pen.lineWidth = Math.max(0.8, 0.1 * k.s);
  pen.lineJoin = 'round';
  pen.stroke();
}

// ── write: the holo desk ───────────────────────────────────────────────────
// A curved white desk on two pedestals, its front edge lit with a cyan
// strip, a projector bar along its back, a data slate, a mug and a little
// glowing sprout; a hover stool pulled out. Working it throws up the
// projection: translucent panels with a chart and bars, a wire globe, a
// scan line running down; it flickers. Idle, a faint still projection
// stands over it on standby: the panels' outlines and the globe.

const deskFront = (u: number) => 3.7 + 1.3 * ((u - 5.5) / 4.9) ** 2;
const MAIN: Quad = [[2.7, 1.95, 7.1], [8.3, 1.95, 7.1], [8.3, 1.45, 12.7], [2.7, 1.45, 12.7]];
const SIDE: Quad = [[8.8, 2.3, 7.6], [10.3, 3.6, 7.6], [10.3, 3.35, 11.2], [8.8, 2.05, 11.2]];
const LENSES: P3[] = [[3.2, 1.72, 6.32], [4.6, 1.72, 6.32], [6.0, 1.72, 6.32], [7.4, 1.72, 6.32], [8.6, 1.72, 6.32]];

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 14, (k) => {
      k.shadow(5.5, 3.6, 6.2, 3.6, 0.3);
      // pedestals and a modesty panel
      k.box(1.0, 0.9, 0, 0.6, 3.8, 5.4, C.panelDark, { stripe: false });
      k.box(0.9, 1.0, 0, 2.2, 3.4, 5.4, C.panel, { round: 0.3 });
      k.box(1.9, 0.9, 0.5, 7.2, 0.5, 4.9, shade(C.panelDark, -0.05), { stripe: false });
      k.box(7.9, 1.0, 0, 2.2, 3.4, 5.4, C.panel, { round: 0.3 });
      // drawer lines on the pedestals' fronts
      for (const u0 of [0.9, 7.9]) {
        k.line([[u0 + 0.3, 4.41, 3.6], [u0 + 1.9, 4.41, 3.6]], withAlpha(INK, 0.55), k.thin);
        k.line([[u0 + 0.3, 4.41, 1.8], [u0 + 1.9, 4.41, 1.8]], withAlpha(INK, 0.55), k.thin);
        k.line([[u0 + 0.8, 4.42, 4.5], [u0 + 1.4, 4.42, 4.5]], C.trim, Math.max(0.8, 0.14 * k.s));
      }
      // the curved top: its face, then the lit front edge
      const us = range(0.6, 10.4, 16);
      const topPts: P3[] = [...us.map((u): P3 => [u, 0.7, 6.0]), ...us.map((u): P3 => [u, deskFront(u), 6.0]).reverse()];
      k.poly(topPts, k.grad([0.6, 0.7, 6], [10.4, deskFront(10.4), 6], [[0, '#ffffff'], [1, C.panelLight]]), k.lw);
      ribbon(k, us, deskFront, 5.4, 6.0, C.panel);
      k.poly([[10.4, 0.7, 5.4], [10.4, deskFront(10.4), 5.4], [10.4, deskFront(10.4), 6.0], [10.4, 0.7, 6.0]], k.side(C.panel, 1, 0), k.thin);
      k.line(us.map((u): P3 => [u, deskFront(u) + 0.02, 5.68]), C.cyan, Math.max(0.9, 0.16 * k.s));
      // the projector bar
      k.box(2.6, 0.9, 6.0, 6.8, 0.8, 0.6, C.dark, { round: 0.2 });
      k.poly([[2.8, 1.71, 6.1], [9.2, 1.71, 6.1], [9.2, 1.71, 6.5], [2.8, 1.71, 6.5]], '#1a1630', 0);
      // a data slate, a mug, a sprout in a pod
      k.poly(rflat(1.3, 2.4, 3.3, 3.7, 6.02, 0.25), '#1f2440', k.thin);
      k.poly(rflat(1.45, 2.55, 3.15, 3.55, 6.03, 0.18), k.grad([1.45, 2.55, 6.03], [3.15, 3.55, 6.03], [[0, '#3a4a8a'], [1, '#2a2a5a']]), 0);
      k.line([[1.7, 2.9, 6.04], [2.7, 2.9, 6.04]], withAlpha(C.cyan, 0.8), Math.max(0.6, 0.08 * k.s));
      k.line([[1.7, 3.2, 6.04], [2.4, 3.2, 6.04]], withAlpha(C.magenta, 0.8), Math.max(0.6, 0.08 * k.s));
      mug(k, 9.7, 2.6, 6.0, C.white, 0.42, C.cyan);
      k.cyl(1.4, 1.35, 6.0, 0.45, 0.6, C.white);
      bulbPlant(k, 1.4, 1.35, 6.5, 1.5, 0.3, 0.38, C.flora, k.thin, 0.25);
      // the stool, pulled out to the right
      stool(k, 8.7, 5.75, C.magenta);
    });
    // the projector's lenses: soft at rest, bright while it projects
    pips(k, LENSES, v.active ? '#dffcff' : '#7fd4e0', 0.16, 0.9);
    if (!v.active) {
      // on standby: the panels faint, a flat line on the main one, the globe still
      k.poly([[3.0, 1.7, 6.4], [8.4, 1.7, 6.4], on(MAIN, 1, 0), on(MAIN, 0, 0)], withAlpha(C.holo, 0.06), 0);
      holoPanel(k, MAIN, 0.6);
      holoPanel(k, SIDE, 0.45);
      k.line([on(MAIN, 0.1, 0.5), on(MAIN, 0.9, 0.5)], withAlpha('#ffffff', 0.45), Math.max(0.7, 0.1 * k.s));
      holoGlobe(k, 2.1, 3.1, 9.4, 1.25, 0.55, 0.4);
      return;
    }
    // a flicker: mostly steady, now and then a dip
    const tick = Math.floor(v.t * 9);
    const a = (hash(tick, 11) < 0.12 ? 0.55 : 0.9) + 0.1 * Math.sin(v.t * 17);
    for (const p of LENSES) k.halo(p[0], p[1], p[2], 0.8, C.holo, 0.5 * a);
    // the beam fanning up from the bar to the panel
    k.poly([[3.0, 1.7, 6.4], [8.4, 1.7, 6.4], on(MAIN, 1, 0), on(MAIN, 0, 0)], withAlpha(C.holo, 0.1 * a), 0);
    holoPanel(k, MAIN, a);
    holoPanel(k, SIDE, a * 0.85);
    // on the main panel: a chart line, bars, a few small panes
    const pts: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const fu = 0.08 + (i / 12) * 0.5;
      pts.push(on(MAIN, fu, 0.55 + 0.18 * Math.sin(i * 1.3 + 0.6) + 0.08 * Math.sin(i * 3.1)));
    }
    k.line(pts, withAlpha('#ffffff', 0.9 * a), Math.max(0.8, 0.12 * k.s));
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const fu = 0.12 + i * 0.09;
      const h = 0.12 + hash(i, 13) * 0.2;
      k.trace([on(MAIN, fu, 0.1), on(MAIN, fu + 0.05, 0.1), on(MAIN, fu + 0.05, 0.1 + h), on(MAIN, fu, 0.1 + h)]);
    }
    pen.fillStyle = withAlpha(C.magenta, 0.7 * a);
    pen.fill();
    for (const [f0, z0] of [[0.66, 0.6], [0.66, 0.32], [0.66, 0.08]] as const) {
      k.poly([...sub(MAIN, f0, z0, 0.93, z0 + 0.2)], withAlpha(C.holo, 0.18 * a), 0);
      k.line([on(MAIN, f0 + 0.03, z0 + 0.13), on(MAIN, f0 + 0.03 + 0.12 + hash(f0 * 10, z0 * 10) * 0.1, z0 + 0.13)], withAlpha('#ffffff', 0.8 * a), Math.max(0.6, 0.07 * k.s));
    }
    // rows on the side panel
    const rows: Array<[P3, P3]> = [];
    for (let i = 0; i < 5; i++) rows.push([on(SIDE, 0.12, 0.15 + i * 0.16), on(SIDE, 0.25 + hash(i, 17) * 0.6, 0.15 + i * 0.16)]);
    k.segs(rows, withAlpha(C.gold, 0.85 * a), Math.max(0.7, 0.09 * k.s));
    // the scan line, running down the main panel
    const fz = 1 - ((v.t * 0.55) % 1);
    k.line([on(MAIN, 0, fz), on(MAIN, 1, fz)], withAlpha('#ffffff', 0.75 * a), Math.max(0.8, 0.12 * k.s));
    // a wire globe turning over the slate
    holoGlobe(k, 2.1, 3.1, 9.4, 1.25, a, v.t * 0.9);
    k.halo(5.5, 2.0, 9.8, 4, C.holo, 0.16 * a);
  },
};

// ── read: the data-cube rack ───────────────────────────────────────────────
// A white rack with two columns of four glowing cubbies, each holding small
// cubes in cyan, magenta and gold that light it from inside; a drawer
// plinth below and a status light strip along the top. Reading sends a
// highlight travelling along the cubes; idle, they hold a steady glow.

type Cube = { u: number; v: number; z: number; d: number; c: Color; bay: number };
const CUBE_COLORS: readonly Color[] = [C.cyan, C.magenta, C.gold];
const RACK_F = 3.4; // the rack's front
const RACK_COLS: ReadonlyArray<readonly [number, number]> = [[1.15, 6.6], [7.4, 12.85]];
const RACK_ROWS: ReadonlyArray<readonly [number, number]> = [[1.4, 4.4], [4.9, 7.9], [8.4, 11.4], [11.9, 14.6]];
// The cubbies, each an opening on the rack's front (u0, z0, u1, z1).
const CUBBIES = RACK_ROWS.flatMap(([z0, z1]) => RACK_COLS.map(([u0, u1]) => ({ u0, u1, z0, z1 })));
const cubby = (i: number, n = RACK_F + 0.01) => {
  const q = CUBBIES[i];
  return rrect(q.u0, q.z0, q.u1, q.z1, n, 0.45, 0.45, 4);
};

function cubes(): Cube[] {
  const out: Cube[] = [];
  CUBBIES.forEach((q, bay) => {
    let u = q.u0 + 0.3 + hash(bay, 20) * 0.4;
    let i = 0;
    while (u < q.u1 - 1.0) {
      const d = 0.95 + hash(bay, i, 21) * 0.3;
      if (u + d > q.u1 - 0.2) break;
      const c = CUBE_COLORS[Math.floor(hash(bay, i, 22) * CUBE_COLORS.length)];
      const v = RACK_F - d - 0.25 - hash(bay, i, 23) * 0.35;
      out.push({ u, v, z: q.z0, d, c, bay });
      // now and then a second cube stacked on the first
      if (hash(bay, i, 24) < 0.35 && q.z1 - q.z0 > 2 * d + 0.3) out.push({ u: u + 0.12, v: v + 0.1, z: q.z0 + d, d: d * 0.78, c: CUBE_COLORS[(CUBE_COLORS.indexOf(c) + 1) % 3], bay });
      u += d + 0.22 + hash(bay, i, 25) * 0.3;
      i++;
    }
  });
  return out;
}
const CUBES = cubes();

function cube(k: Kit, q: Cube, bright = false): void {
  const c = bright ? shade(q.c, 0.6) : q.c;
  k.box(q.u, q.v, q.z, q.d, q.d, q.d, c, { line: k.thin, round: 0.08, top: shade(c, 0.3), right: shade(c, -0.12) });
  // a lit core on the front face
  const f = q.v + q.d + 0.01;
  k.poly([[q.u + q.d * 0.28, f, q.z + q.d * 0.28], [q.u + q.d * 0.72, f, q.z + q.d * 0.28], [q.u + q.d * 0.72, f, q.z + q.d * 0.72], [q.u + q.d * 0.28, f, q.z + q.d * 0.72]], bright ? '#ffffff' : shade(q.c, 0.5), 0);
}

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const F = RACK_F;
    const k = still(v, 'read', 16, (k) => {
      const pen = k.pen;
      k.shadow(7, 2.2, 7.4, 2.4, 0.3);
      // the body and its cap
      k.box(0.4, 0.3, 0, 13.2, F - 0.3, 15.1, C.panel, { round: 0.3, stripe: false });
      k.box(0.2, 0.15, 15.1, 13.6, F + 0.05, 0.75, C.white);
      k.line([[0.6, F + 0.21, 15.47], [13.4, F + 0.21, 15.47]], C.trim, Math.max(0.9, 0.18 * k.s));
      // a drawer along the plinth
      k.line([[1.2, F + 0.01, 0.75], [12.8, F + 0.01, 0.75]], withAlpha(INK, 0.45), k.thin * 0.8);
      k.line([[6.3, F + 0.02, 0.45], [7.7, F + 0.02, 0.45]], C.trim, Math.max(0.8, 0.16 * k.s));
      // each cubby: a deep violet hollow, the shelf inside, its cubes
      CUBBIES.forEach((q, i) => {
        const hole = cubby(i);
        k.poly(hole, k.vgrad(q.u0, F, q.z0, q.z1, [[0, '#3a2f63'], [1, '#231c3c']]), 0);
        pen.save();
        pen.beginPath();
        k.trace(hole);
        pen.clip();
        // the cubby's floor and its lit back wall
        k.poly([[q.u0 - 1, F - 2.2, q.z0], [q.u1 + 1, F - 2.2, q.z0], [q.u1 + 1, F, q.z0], [q.u0 - 1, F, q.z0]], '#4a3f78', 0);
        const mine = CUBES.filter((c) => c.bay === i).sort((p, r) => p.z - r.z || p.u - r.u);
        for (const c of mine) k.halo(c.u + c.d / 2, c.v, c.z + c.d / 2, 1.5, c.c, 0.35);
        for (const c of mine) cube(k, c);
        // shade under the cubby's top lip
        k.poly([[q.u0, F, q.z1 - 0.7], [q.u1, F, q.z1 - 0.7], [q.u1, F, q.z1], [q.u0, F, q.z1]], k.vgrad(q.u0, F, q.z1 - 0.7, q.z1, [[0, '#2a1f3d00'], [1, '#2a1f3d70']]), 0);
        pen.restore();
        pen.beginPath();
        k.trace(hole);
        k.paint(null, k.thin);
        // a lit lip along the cubby's bottom edge
        k.line([[q.u0 + 0.3, F + 0.02, q.z0 - 0.12], [q.u1 - 0.3, F + 0.02, q.z0 - 0.12]], '#ffffff', Math.max(0.7, 0.1 * k.s));
      });
    });
    // the status lights on the cap: steady at rest, one blinking while read
    const blink = v.active && Math.floor(v.t * 3) % 2 === 0;
    pips(k, [[1.6, F + 0.22, 15.47], [2.6, F + 0.22, 15.47]], '#e6fbff', 0.13, 0.8);
    pips(k, [[12.3, F + 0.22, 15.47]], blink ? '#ffffff' : C.magenta, 0.13, 0.8);
    if (!v.active) return;
    // a highlight running along the cubes, one after another
    const n = CUBES.length;
    const i = Math.floor(v.t * 7) % n;
    const pen = k.pen;
    for (const j of [(i + n - 1) % n, i]) {
      const q = CUBES[j];
      pen.save();
      pen.beginPath();
      k.trace(cubby(q.bay));
      pen.clip();
      k.halo(q.u + q.d / 2, q.v + q.d, q.z + q.d / 2, 1.8, '#ffffff', j === i ? 0.5 : 0.22);
      cube(k, q, j === i);
      pen.restore();
    }
  },
};

// ── search: the scanner on its stand ───────────────────────────────────────
// A tripod with a dish-like scanner head and a little screen on its mast,
// a cable running to a white sample case of glowing vials with a crystal
// on top. Searching sweeps a fan of light from the head across the floor
// and a blip goes round the screen.

const HEAD: P3 = [4.0, 1.9, 9.7];
const HEAD_N: P3 = [0.25, 0.75, 0.6];
const EMIT: P3 = [4.3, 2.75, 10.35];
const SCR: Quad = [[4.85, 2.45, 6.2], [6.45, 2.45, 6.2], [6.45, 2.45, 7.8], [4.85, 2.45, 7.8]];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 14,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 14, (k) => {
      k.shadow(6, 2.1, 6.4, 2.3, 0.28);
      // the cable to the case
      k.line([[4.0, 1.9, 0.1], [5.6, 3.3, 0.1], [7.4, 3.3, 0.1], [8.2, 2.6, 0.6]], INK, Math.max(1.4, 0.22 * k.s + k.lw));
      k.line([[4.0, 1.9, 0.1], [5.6, 3.3, 0.1], [7.4, 3.3, 0.1], [8.2, 2.6, 0.6]], C.trim, Math.max(0.8, 0.22 * k.s));
      // the tripod: three legs out from a hub
      const hubZ = 5.2;
      for (const th of [2.2, 4.0, 0.55]) {
        const fu = HEAD[0] + Math.cos(th) * 1.75;
        const fv = HEAD[1] + Math.sin(th) * 1.6;
        k.rod([[HEAD[0], HEAD[1], hubZ], [fu, fv, 0.15]], C.panel, 0.2);
        k.disc(fu, fv, 0.1, 0.32, C.dark, k.thin);
      }
      k.cyl(HEAD[0], HEAD[1], hubZ - 0.4, 0.45, 0.8, C.dark);
      k.cyl(HEAD[0], HEAD[1], hubZ + 0.4, 0.2, 3.4, C.panel);
      // the little screen on an arm off the mast
      k.rod([[HEAD[0], HEAD[1], 7.0], [4.9, 2.35, 7.0]], C.panelDark, 0.14);
      k.box(4.7, 2.0, 6.0, 1.95, 0.45, 2.0, C.white, { round: 0.2 });
      glassQuad(k, SCR);
      // the head: a yoke, then the dish facing out and up
      k.box(HEAD[0] - 0.55, HEAD[1] - 0.3, 8.6, 1.1, 0.6, 0.6, C.dark, { round: 0.15 });
      const rim = ring(k, HEAD, HEAD_N, 1.85, 28);
      const back = ring(k, [HEAD[0] - HEAD_N[0] * 0.5, HEAD[1] - HEAD_N[1] * 0.5, HEAD[2] - HEAD_N[2] * 0.5], HEAD_N, 1.2, 20);
      fillPts(k, hull([...rim, ...back]), across(k, rim, C.panel), k.lw);
      fillPts(k, rim, C.white, k.lw);
      const inner = ring(k, [HEAD[0] + HEAD_N[0] * 0.05, HEAD[1] + HEAD_N[1] * 0.05, HEAD[2] + HEAD_N[2] * 0.05], HEAD_N, 1.45, 24);
      const [cx, cy] = k.p(...HEAD);
      const g = k.pen.createRadialGradient(cx, cy, 0, cx, cy, 1.6 * k.s);
      g.addColorStop(0, '#2b2f55');
      g.addColorStop(0.7, '#4a4f7c');
      g.addColorStop(1, '#8a90b8');
      fillPts(k, inner, g, k.thin);
      // the emitter on its three struts
      for (const th of [0.4, 2.5, 4.6]) {
        const p = ring(k, [HEAD[0] + HEAD_N[0] * 0.05, HEAD[1] + HEAD_N[1] * 0.05, HEAD[2] + HEAD_N[2] * 0.05], HEAD_N, 1.4, 6)[Math.floor((th / 6.28) * 6) % 6];
        const e = k.p(...EMIT);
        k.pen.beginPath();
        k.pen.moveTo(p[0], p[1]);
        k.pen.lineTo(e[0], e[1]);
        k.pen.strokeStyle = C.panelDark;
        k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
        k.pen.stroke();
      }
      k.disc(EMIT[0], EMIT[1], EMIT[2], 0.32, C.dark, k.thin);
      // the sample case: white, lid up, vials glowing in a rack
      crateBox(k, 7.6, 0.7, 0, 3.8, 2.6, 2.4, C.white, C.magenta, 3);
      k.poly([[7.6, 0.7, 2.4], [11.4, 0.7, 2.4], [11.4, 0.4, 5.0], [7.6, 0.4, 5.0]], k.side(C.panel, 0, 1), k.lw, 0.2);
      k.poly([[7.9, 0.66, 2.6], [11.1, 0.66, 2.6], [11.1, 0.43, 4.8], [7.9, 0.43, 4.8]], '#2b2547', 0);
      for (let i = 0; i < 4; i++) {
        const u = 8.2 + i * 0.8;
        const c = [C.cyan, C.gold, C.magenta, C.flora3][i];
        k.halo(u + 0.2, 1.7, 2.9, 0.8, c, 0.35);
        k.cyl(u + 0.2, 1.7, 2.4, 0.26, 1.2, c);
        k.disc(u + 0.2, 1.7, 3.62, 0.27, C.white, k.thin);
      }
      // a crystal sample on a little plinth at the case's end
      k.cyl(11.0, 2.6, 2.4, 0.55, 0.35, C.dark);
      crystal(k, 11.0, 2.6, 2.75);
    });
    // the screen: a ring and a blip, the blip only while it searches
    const scr = SCR;
    const [mu, mv, mz] = on(scr, 0.5, 0.5);
    k.disc(mu, mv + 0.01, mz, 0.01, C.cyan, 0);
    const ringPts: P3[] = [];
    for (let i = 0; i <= 20; i++) {
      const th = (i / 20) * Math.PI * 2;
      ringPts.push(on(scr, 0.5 + Math.cos(th) * 0.32, 0.5 + Math.sin(th) * 0.32));
    }
    k.line(ringPts, withAlpha(C.cyan, v.active ? 0.9 : 0.4), Math.max(0.7, 0.08 * k.s));
    k.pen.beginPath();
    const e = k.p(...EMIT);
    k.pen.arc(e[0], e[1], Math.max(1, 0.2 * k.s), 0, Math.PI * 2);
    k.pen.fillStyle = v.active ? '#dffcff' : '#4a6a86';
    k.pen.fill();
    if (!v.active) return;
    const th = v.t * 2.6;
    const [bx, by] = k.p(...on(scr, 0.5 + Math.cos(th) * 0.32, 0.5 + Math.sin(th) * 0.32));
    k.pen.beginPath();
    k.pen.arc(bx, by, Math.max(1, 0.16 * k.s), 0, Math.PI * 2);
    k.pen.fillStyle = C.magenta;
    k.pen.fill();
    // the fan of light, sweeping to and fro across the floor before it
    const sw = Math.sin(v.t * 1.4);
    const cu = 5.6 + sw * 3.6;
    const fan: P3[] = [EMIT, [cu - 1.5, 3.85, 0.1], [cu + 1.5, 3.85, 0.1]];
    const [fx0, fy0] = k.p(...EMIT);
    const [fx1, fy1] = k.p(cu, 3.85, 0.1);
    const g = k.pen.createLinearGradient(fx0, fy0, fx1, fy1);
    g.addColorStop(0, withAlpha(C.holo, 0.5));
    g.addColorStop(1, withAlpha(C.holo, 0.12));
    k.poly(fan, g, 0);
    k.line([[cu - 1.5, 3.85, 0.1], [cu + 1.5, 3.85, 0.1]], withAlpha('#ffffff', 0.7), Math.max(0.8, 0.12 * k.s));
    k.halo(EMIT[0], EMIT[1], EMIT[2], 1.4, C.holo, 0.6);
  },
};

// A cluster of cyan crystal points standing on z.
function crystal(k: Kit, cu: number, cv: number, z: number): void {
  const pts: Array<[number, number, number, number]> = [[-0.25, 0, 1.7, -0.2], [0.2, 0.1, 1.2, 0.35], [0, -0.15, 2.2, 0.05]];
  k.halo(cu, cv, z + 1, 1.3, C.cyan, 0.35);
  for (const [du, dv, h, lean] of pts) {
    const b = 0.28;
    const base: P3[] = [[cu + du - b, cv + dv, z], [cu + du, cv + dv + b, z], [cu + du + b, cv + dv, z]];
    const tip: P3 = [cu + du + lean, cv + dv, z + h];
    k.poly([base[0], base[1], tip], shade(C.cyan, 0.25), k.thin);
    k.poly([base[1], base[2], tip], shade(C.cyan, -0.15), k.thin);
  }
}

// ── run: the refiner ───────────────────────────────────────────────────────
// A fat painted cylinder on a grey plinth: prefab red with a white band and
// orange trim, a round port on its front glowing with the melt inside, a
// grey funnel hopper on top heaped with raw crystal, a stack behind with
// orange bands, a pipe bending down into the deck, a piston at its side and
// a chute dropping refined nuggets into a bin on a stand, at hand height
// for the refinery tech at the refiner's end (see npcs.ts; `v` where it
// stands, the bin in front of it).
// Running it pulses the port, chugs the piston and puffs steam from the
// stack, each round in two seconds or one.

export const CHUTE = { u0: 8.6, u1: 10.9, v0: 7.0, v1: 10.1, z: 3.9, v: 6.5 };
const R0 = { cu: 5.3, cv: 5.0, r: 3.2 };
const STACK: P3 = [7.6, 2.6, 14.3];
const PORT = { th: Math.PI / 4 + 0.42, z: 3.4, r: 1.15 };
const PISTON: P3 = [1.45, 7.6, 0.6];

const coreAt = (th: number, z: number, r = R0.r + 0.02): P3 => [R0.cu + Math.cos(th) * r, R0.cv + Math.sin(th) * r, z];
// The port: a disc of radius rr on the body's surface, facing out at PORT.th.
const portPts = (rr: number, out = 0.06): P3[] => {
  const n: P3 = [Math.cos(PORT.th), Math.sin(PORT.th), 0];
  const c = coreAt(PORT.th, PORT.z, R0.r + out);
  const t: P3 = [-n[1], n[0], 0];
  return Array.from({ length: 24 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [c[0] + t[0] * Math.cos(a) * rr, c[1] + t[1] * Math.cos(a) * rr, c[2] + Math.sin(a) * rr] as P3;
  });
};

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 15, (k) => {
      const { cu, cv, r } = R0;
      k.shadow(5.5, 5.4, 5.8, 5.6, 0.3);
      // the stack behind, first: a tall white chimney with orange bands
      k.cyl(STACK[0], STACK[1], 0, 0.95, 1.0, C.metal);
      k.cyl(STACK[0], STACK[1], 1.0, 0.72, 12.6, C.panel);
      for (const z of [5.0, 9.0, 12.4]) {
        band(k, STACK[0], STACK[1], 0.73, z, z + 0.5);
        k.paint(C.trimOrange, k.thin * 0.8);
      }
      k.cyl(STACK[0], STACK[1], 13.6, 0.95, 0.7, C.white);
      k.disc(STACK[0], STACK[1], STACK[2], 0.62, '#3a3350', 0);
      // the plinth
      k.cyl(cu, cv, 0, r + 0.9, 0.6, C.metal);
      // a pipe from the body bending down into the deck on the left
      k.rod([[cu - r * 0.7, cv + r * 0.7, 3.8], [cu - r - 0.6, cv + r * 0.7 + 0.3, 3.8], [cu - r - 0.6, cv + r * 0.7 + 0.3, 0]], C.metal, 0.42);
      k.cyl(cu - r - 0.6, cv + r * 0.7 + 0.3, 0, 0.62, 0.5, C.trimOrange);
      // the body: prefab red, a white band, orange trim round its top
      k.cyl(cu, cv, 0.6, r, 6.6, C.prefab);
      band(k, cu, cv, r + 0.02, 5.2, 6.0);
      k.paint(C.white, k.thin);
      band(k, cu, cv, r + 0.03, 6.6, 7.2);
      k.paint(C.trimOrange, k.thin);
      band(k, cu, cv, r + 0.02, 0.6, 1.1);
      k.paint(shade(C.prefab, -0.2), k.thin * 0.8);
      k.cyl(cu, cv, 7.2, r - 0.4, 0.8, C.white);
      k.cyl(cu, cv, 8.0, r - 1.1, 0.5, C.metal);
      // the port: a white bezel, the melt glowing behind it
      k.poly(portPts(PORT.r + 0.45, 0.05), C.white, k.lw);
      k.poly(portPts(PORT.r, 0.09), k.vgrad(cu, cv + r, PORT.z - PORT.r, PORT.z + PORT.r, [[0, '#e8602a'], [0.45, C.port], [1, '#ffe7a0']]), k.thin);
      rivets(k, portPts(PORT.r + 0.24, 0.08).filter((_, i) => i % 6 === 0), C.panelLight, 0.1);
      // the hopper on top, a grey funnel with an orange rim, heaped with raw crystal
      const hu = cu - 1.0;
      const hv = cv - 0.9;
      frustum(k, hu, hv, 8.5, 0.8, 10.6, 1.95, C.metal, k.vgrad(hu, hv, 10.6, 10.6, [[0, '#4a2a3a'], [1, '#4a2a3a']]));
      band(k, hu, hv, 1.96, 10.25, 10.6);
      k.paint(C.trimOrange, k.thin * 0.8);
      for (let i = 0; i < 6; i++) {
        const th = (i / 6) * Math.PI * 2 + 0.3;
        const rr = i % 2 ? 1.0 : 0.5;
        const c = i % 3 === 0 ? C.flora : i % 3 === 1 ? C.cyan : C.flora2;
        const [x, y] = k.p(hu + Math.cos(th) * rr, hv + Math.sin(th) * rr, 10.65);
        k.pen.beginPath();
        k.pen.moveTo(x - 0.3 * k.s, y);
        k.pen.lineTo(x, y - 0.55 * k.s);
        k.pen.lineTo(x + 0.3 * k.s, y);
        k.pen.lineTo(x, y + 0.2 * k.s);
        k.pen.closePath();
        k.paint(c, k.thin * 0.8);
      }
      // the bin of refined nuggets on its stand, the chute over it
      const ch = CHUTE;
      const mu = (ch.u0 + ch.u1) / 2;
      const mv = (ch.v0 + ch.v1) / 2;
      k.shadow(mu, mv, 1.4, 1.8, 0.25);
      k.box(ch.u0 + 0.25, ch.v0 + 0.3, 0, ch.u1 - ch.u0 - 0.5, ch.v1 - ch.v0 - 0.6, 0.3, C.metalDark, { round: 0.2 });
      k.cyl(mu, mv, 0.3, 0.32, ch.z - 1.5, C.metal);
      k.box(ch.u0, ch.v0, ch.z - 1.3, ch.u1 - ch.u0, ch.v1 - ch.v0, 1.3, C.metal, { round: 0.2 });
      k.poly([[ch.u0, ch.v1 + 0.01, ch.z - 0.75], [ch.u1, ch.v1 + 0.01, ch.z - 0.75], [ch.u1, ch.v1 + 0.01, ch.z - 0.45], [ch.u0, ch.v1 + 0.01, ch.z - 0.45]], C.trimOrange, 0);
      k.poly([[ch.u1 + 0.01, ch.v0, ch.z - 0.75], [ch.u1 + 0.01, ch.v1, ch.z - 0.75], [ch.u1 + 0.01, ch.v1, ch.z - 0.45], [ch.u1 + 0.01, ch.v0, ch.z - 0.45]], k.side(C.trimOrange, 1, 0, 0.12), 0);
      k.box(ch.u0 + 0.2, ch.v0 + 0.2, ch.z - 0.02, ch.u1 - ch.u0 - 0.4, ch.v1 - ch.v0 - 0.4, 0.1, '#3a3350', { line: 0, stripe: false });
      for (let i = 0; i < 7; i++) {
        const nu = ch.u0 + 0.45 + (i % 3) * 0.55 + (i > 5 ? 0.3 : 0);
        const nv = ch.v0 + 0.5 + Math.floor(i / 3) * 0.85;
        k.box(nu, nv, ch.z, 0.45, 0.5, 0.32 + (i % 2) * 0.1, C.gold, { line: k.thin * 0.8, round: 0.08 });
      }
      k.rod([[cu + r * 0.97, cv + r * 0.22, 6.3], [mu, ch.v0 + 0.5, 6.1], [mu, ch.v0 + 1.0, ch.z + 1.1]], C.panel, 0.42);
      k.disc(mu, ch.v0 + 1.0, ch.z + 1.05, 0.4, '#3a3350', k.thin);
      // the piston's sleeve, piped to the body
      k.cyl(PISTON[0], PISTON[1], 0, 0.85, 0.6, C.metal);
      k.cyl(PISTON[0], PISTON[1], PISTON[2], 0.6, 3.6, C.white);
      band(k, PISTON[0], PISTON[1], 0.61, 3.4, 3.8);
      k.paint(C.trimOrange, k.thin * 0.8);
      k.rod([[PISTON[0] + 0.5, PISTON[1] - 0.4, 3.0], [cu - r * 0.9, cv + r * 0.3, 3.0]], C.metal, 0.2);
    });
    // the port's glow: a steady ember at rest, pulsing while it runs
    const pulse = v.active ? 0.5 + 0.5 * Math.sin(v.t * Math.PI) : 0;
    const [gu, gv, gz] = coreAt(PORT.th, PORT.z, R0.r + 0.3);
    k.halo(gu, gv, gz, 2.4, '#ffb35c', v.active ? 0.35 + 0.3 * pulse : 0.25);
    if (v.active) k.poly(portPts(PORT.r * 0.7, 0.1), withAlpha('#fff3c8', 0.25 + 0.4 * pulse), 0);
    // the piston: its rod rides up and down while running
    const lift = v.active ? 0.9 + 0.8 * Math.sin(v.t * Math.PI * 2) : 0.3;
    const top = PISTON[2] + 3.6 + lift;
    k.cyl(PISTON[0], PISTON[1], PISTON[2] + 3.6, 0.28, lift, C.panelLight);
    k.cyl(PISTON[0], PISTON[1], top, 0.5, 0.45, C.trimOrange);
    // the stack's tip light
    const [sx, sy] = k.p(STACK[0] - 0.7, STACK[1] + 0.5, 13.95);
    k.pen.beginPath();
    k.pen.arc(sx, sy, Math.max(1, 0.18 * k.s), 0, Math.PI * 2);
    k.pen.fillStyle = v.active ? '#ffe28a' : '#8a6a4a';
    k.pen.fill();
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 3.2, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      spawn(wisp(STACK[0], STACK[1], STACK[2] + 0.2, tick, i, [240, 232, 246], 0.5));
    }
  },
};

// ── web: the comms dish ────────────────────────────────────────────────────
// A white lattice pylon on a plinth, a gimbal on top carrying a big dish
// with a feed horn on three struts and a light at its tip, a whip aerial
// behind. Browsing turns the dish slowly to and fro and blinks the tip.

const DISH: P3 = [4.5, 4.5, 12.4];
const PYLON = { lo: 2.2, hi: 6.8, tlo: 3.85, thi: 5.15, z0: 0.8, z1: 9.6 };

function dishNormal(phi: number): P3 {
  return [Math.cos(phi) * 0.62, Math.sin(phi) * 0.62, 0.78];
}

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 18,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 18, (k) => {
      k.shadow(4.5, 4.5, 4.4, 4.4, 0.3);
      k.box(1.4, 1.4, 0, 6.2, 6.2, 0.8, C.panelDark, { round: 0.4 });
      rivets(k, [[1.9, 7.6, 0.4], [7.1, 7.6, 0.4], [7.6, 1.9, 0.4], [7.6, 7.1, 0.4]], C.panelLight, 0.14);
      // the whip aerial at the back corner
      k.rod([[2.6, 2.6, 0.8], [2.6, 2.6, 17.2]], C.panel, 0.1);
      k.disc(2.6, 2.6, 17.3, 0.22, C.cyan, k.thin);
      // the lattice: four legs, braces across the two faces in view
      const { lo, hi, tlo, thi, z0, z1 } = PYLON;
      const leg = (u0: number, v0: number, u1: number, v1: number) => k.rod([[u0, v0, z0], [u1, v1, z1]], C.white, 0.22);
      leg(lo, lo, tlo, tlo);
      leg(hi, lo, thi, tlo);
      leg(lo, hi, tlo, thi);
      const lerp = (p: number, q: number, f: number) => p + (q - p) * f;
      const braces: Array<[P3, P3]> = [];
      for (let i = 0; i < 3; i++) {
        const f0 = i / 3;
        const f1 = (i + 1) / 3;
        const za = lerp(z0, z1, f0);
        const zb = lerp(z0, z1, f1);
        // the +v face (v from lo..hi at bottom to tlo..thi at top: front edge)
        const fv0 = lerp(hi, thi, f0);
        const fv1 = lerp(hi, thi, f1);
        const ul0 = lerp(lo, tlo, f0);
        const ur0 = lerp(hi, thi, f0);
        const ul1 = lerp(lo, tlo, f1);
        const ur1 = lerp(hi, thi, f1);
        braces.push([[ul0, fv0, za], [ur1, fv1, zb]], [[ur0, fv0, za], [ul1, fv1, zb]]);
        // the +u face
        braces.push([[ur0, ul0, za], [ur1, ur1, zb]], [[ur0, ur0, za], [ur1, ul1, zb]]);
      }
      for (const [a, b] of braces) k.rod([a, b], C.panelLight, 0.1);
      leg(hi, hi, thi, thi);
      for (const f of [1 / 3, 2 / 3]) {
        const z = lerp(z0, z1, f);
        const a0 = lerp(lo, tlo, f);
        const a1 = lerp(hi, thi, f);
        k.rod([[a0, a1, z], [a1, a1, z], [a1, a0, z]], C.trim, 0.14);
      }
      // the gimbal block on top
      k.box(3.6, 3.6, z1, 1.8, 1.8, 0.9, C.panel, { round: 0.25 });
      k.cyl(4.5, 4.5, z1 + 0.9, 0.55, 1.0, C.dark);
      // a cable box on the plinth
      k.box(5.6, 6.4, 0.8, 1.6, 1.0, 1.2, C.white, { round: 0.2 });
      k.line([[5.9, 7.41, 1.6], [6.9, 7.41, 1.6]], C.cyan, Math.max(0.8, 0.14 * k.s));
    });
    // the dish: still at rest, turning slowly while it browses
    const phi = Math.PI / 4 + (v.active ? 0.55 * Math.sin(v.t * 0.7) : 0.25);
    const N = dishNormal(phi);
    const rim = ring(k, DISH, N, 3.3, 32);
    const backC: P3 = [DISH[0] - N[0] * 0.9, DISH[1] - N[1] * 0.9, DISH[2] - N[2] * 0.9];
    const back = ring(k, backC, N, 1.6, 20);
    fillPts(k, hull([...rim, ...back]), across(k, rim, C.panel), k.lw);
    k.rod([[4.5, 4.5, 11.4], [backC[0], backC[1], backC[2]]], C.dark, 0.35);
    const [cx, cy] = k.p(...DISH);
    const g = k.pen.createRadialGradient(cx, cy, 0, cx, cy, 3.4 * k.s);
    g.addColorStop(0, '#c9d2e2');
    g.addColorStop(0.65, '#eef2f8');
    g.addColorStop(1, '#ffffff');
    fillPts(k, rim, g, k.lw);
    const inner = ring(k, [DISH[0] + N[0] * 0.02, DISH[1] + N[1] * 0.02, DISH[2] + N[2] * 0.02], N, 2.2, 28);
    fillPts(k, inner, null, k.thin * 0.8);
    // the rim's orange edge
    k.pen.beginPath();
    rim.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
    k.pen.closePath();
    k.pen.strokeStyle = C.trim;
    k.pen.lineWidth = Math.max(0.8, 0.14 * k.s);
    k.pen.stroke();
    // the feed horn on three struts
    const tip: P3 = [DISH[0] + N[0] * 2.5, DISH[1] + N[1] * 2.5, DISH[2] + N[2] * 2.5];
    for (const i of [0, 11, 22]) {
      const p = rim[i];
      const e = k.p(...tip);
      k.pen.beginPath();
      k.pen.moveTo(p[0], p[1]);
      k.pen.lineTo(e[0], e[1]);
      k.pen.strokeStyle = INK;
      k.pen.lineWidth = Math.max(1.2, 0.12 * k.s + k.thin);
      k.pen.stroke();
      k.pen.strokeStyle = C.panelDark;
      k.pen.lineWidth = Math.max(0.6, 0.12 * k.s);
      k.pen.stroke();
    }
    k.disc(tip[0], tip[1], tip[2], 0.42, C.white, k.thin);
    // the tip light: steady at rest, blinking while it browses
    const blink = v.active ? (Math.sin(v.t * 5) > 0 ? 1 : 0.2) : 0.45;
    const [lx, ly] = k.p(tip[0], tip[1], tip[2] + 0.3);
    k.halo(tip[0], tip[1], tip[2] + 0.3, 1.2, C.magenta, 0.6 * blink);
    k.pen.beginPath();
    k.pen.arc(lx, ly, Math.max(1.1, 0.24 * k.s), 0, Math.PI * 2);
    k.paint(blink > 0.5 ? '#ffd2ea' : C.magenta, k.thin * 0.8);
  },
};

// ── think: the pilot's chair ───────────────────────────────────────────────
// A high-backed pilot's chair on a round dais, turned to face the glass:
// we see its padded shell back, its armrests either side, a small control
// stick on one. Before it, a console arc of screens and buttons with a
// little hologram globe over the middle. The back stops at the pilot's
// shoulders (see npcs.ts), its head over it: `seat` the cushion's top,
// `back` the shell's inner face, `top` its top, (u, v) where the pilot
// sits.

export const CHAIR = { u: 5.6, v: 4.4, seat: 3.5, back: 5.25, top: 8.2 };

const consoleBack = (u: number) => 0.5 + 1.3 * ((u - 6) / 5.4) ** 2;

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 3.6, 6.4, 3.6, 0.3);
    // the console arc: a sloped top of screens, a white face below
    const us = range(0.6, 11.4, 14);
    const fb = consoleBack;
    const ff = (u: number) => fb(u) + 1.9;
    // back face (seen only past the ends), then the top and the front
    const topPts: P3[] = [...us.map((u): P3 => [u, fb(u), 4.6]), ...us.map((u): P3 => [u, ff(u), 3.5]).reverse()];
    k.poly(topPts, k.grad([0.6, fb(0.6), 4.6], [11.4, ff(11.4), 3.5], [[0, '#34305a'], [1, '#26223f']]), k.lw);
    ribbon(k, us, ff, 0, 3.5, C.panel);
    k.poly([[11.4, fb(11.4), 0], [11.4, ff(11.4), 0], [11.4, ff(11.4), 3.5], [11.4, fb(11.4), 4.6]], k.side(C.panel, 1, 0), k.thin);
    k.line(us.map((u): P3 => [u, ff(u) + 0.02, 2.7]), C.trim, Math.max(0.9, 0.18 * k.s));
    // screens set in the sloped top, buttons between them
    const slope = (u: number, f: number): P3 => [u, fb(u) + 1.9 * f, 4.6 - 1.1 * f];
    for (const [u0, u1] of [[1.2, 3.4], [3.9, 5.6], [6.4, 8.1], [8.6, 10.8]] as const) {
      const q: Quad = [slope(u0, 0.75), slope(u1, 0.75), slope(u1, 0.15), slope(u0, 0.15)];
      k.poly([...q], k.grad(q[3], q[1], [[0, '#2f6a9a'], [1, '#1e3a6a']]), k.thin);
      const rows: Array<[P3, P3]> = [];
      for (let i = 0; i < 3; i++) {
        const f = 0.25 + i * 0.22;
        rows.push([on(q, 0.12, f), on(q, 0.3 + hash(u0 * 10, i, 3) * 0.55, f)]);
      }
      k.segs(rows, withAlpha(i3(u0), 0.9), Math.max(0.7, 0.1 * k.s));
      k.halo(...on(q, 0.5, 0.5), 1.2, C.cyan, 0.2);
    }
    const btn: P3[] = [];
    for (let i = 0; i < 9; i++) btn.push(slope(1.4 + i * 1.15, 0.9));
    pips(k, btn.filter((_, i) => i % 3 !== 1), C.gold, 0.13, 0.8);
    pips(k, btn.filter((_, i) => i % 3 === 1), C.magenta, 0.13, 0.8);
    // the hologram globe over the middle, on a little emitter
    k.cyl(8.6, 1.0, 4.6, 0.45, 0.3, C.dark);
    k.disc(8.6, 1.0, 4.92, 0.25, C.holo, 0);
    k.poly([[8.25, 1.0, 4.95], [8.95, 1.0, 4.95], [9.6, 1.0, 7.6], [7.6, 1.0, 7.6]], withAlpha(C.holo, 0.12), 0);
    holoGlobe(k, 8.6, 1.0, 8.9, 1.35, 1, 0.5);
    // the dais
    const dc = { u: 5.6, v: 4.3 };
    k.cyl(dc.u, dc.v, 0, 2.6, 0.4, C.panelDark);
    const e = k.ell(dc.u, dc.v, 0.42, 2.25);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    k.pen.strokeStyle = withAlpha(C.cyan, 0.85);
    k.pen.lineWidth = Math.max(0.8, 0.14 * k.s);
    k.pen.stroke();
    // the chair: five-spoke foot, post, seat
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3;
      k.rod([[dc.u, dc.v, 0.75], [dc.u + Math.cos(a) * 1.4, dc.v + Math.sin(a) * 1.4, 0.55]], C.dark, 0.2);
    }
    k.cyl(dc.u, dc.v, 0.45, 0.32, 2.3, C.panelLight);
    k.box(3.8, 2.8, 2.6, 3.6, 3.0, 0.9, C.magenta, { round: 0.35 });
    // armrests, the right one with a stick and a light or two
    k.box(3.3, 3.0, 4.3, 0.65, 2.9, 0.5, C.panel, { round: 0.2 });
    k.box(3.35, 3.4, 2.9, 0.5, 0.5, 1.4, C.panelDark, { line: k.thin });
    k.box(7.45, 3.0, 4.3, 0.65, 2.9, 0.5, C.panel, { round: 0.2 });
    k.box(7.5, 3.4, 2.9, 0.5, 0.5, 1.4, C.panelDark, { line: k.thin });
    k.rod([[7.78, 3.5, 4.8], [7.82, 3.45, 5.8]], C.dark, 0.16);
    k.disc(7.82, 3.45, 5.85, 0.24, C.magenta, k.thin);
    // the high back, its padded shell toward us
    const top = CHAIR.top;
    k.box(3.9, CHAIR.back, 3.2, 3.4, 1.0, top - 3.2, C.white, { round: 0.9 });
    k.poly(rrect(4.35, 3.8, 6.85, top - 0.6, 6.27, 0.7, 0.5), k.vgrad(5.6, 6.27, 3.8, top - 0.6, [[0, shade(C.panel, -0.06)], [1, C.panelLight]]), k.thin);
    // an orange spine and two cyan running lights down it
    k.poly(rrect(5.35, 4.3, 5.85, top - 1.0, 6.28, 0.25), C.trim, 0);
    pips(k, [[5.6, 6.3, top - 1.6], [5.6, 6.3, 4.9]], '#bff6ff', 0.15, 0.9);
    // a magenta cushion edge peeking past the shell at the top
    k.line([[4.0, CHAIR.back - 0.01, top - 0.25], [5.6, CHAIR.back - 0.01, top], [7.2, CHAIR.back - 0.01, top - 0.25]], C.magenta, Math.max(0.9, 0.2 * k.s));
  },
};

// The colour of a console's rows, by where they sit.
const i3 = (u: number): Color => [C.cyan, C.gold, C.flora, C.cyan][Math.floor(u / 3) % 4];

// ── idle: the mess bench ───────────────────────────────────────────────────
// A white table with two benches with magenta cushions, trays of food,
// mugs, a jug and a bowl of glowing fruit; at its end a boxy food
// processor with a little screen and a glowing slot with a cup in it.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(7.3, 5.6, 7.6, 5.6, 0.28);
    // the processor's light on the floor
    k.pool(12.9, 9.4, 3.2, 2.2, C.gold, 0.25);
    // the back bench
    bench(k, 1.8, 1.3);
    // the table: a pedestal pair, the top with an orange edge strip
    for (const u of [3.4, 8.6]) {
      k.box(u - 1.6, 5.1, 0, 3.2, 0.8, 0.35, C.panelDark, { line: k.thin });
      k.box(u - 0.35, 5.15, 0.35, 0.7, 0.7, 3.7, C.panelLight);
    }
    k.box(1.4, 3.5, 4.0, 9.2, 4.0, 0.55, C.white, { round: 0.6 });
    k.line([[1.9, 7.52, 4.25], [10.1, 7.52, 4.25], [10.62, 7.0, 4.25], [10.62, 4.0, 4.25]], C.trim, Math.max(0.8, 0.14 * k.s));
    const z = 4.56;
    // trays with food on them
    tray(k, 2.0, 4.0, z, v.seed);
    tray(k, 5.9, 5.6, z, v.seed + 1);
    mug(k, 4.9, 4.4, z, C.white, 0.38, C.magenta);
    mug(k, 8.7, 6.7, z, C.white, 0.38, C.cyan);
    mug(k, 3.1, 6.9, z, C.white, 0.38, C.gold);
    // a jug of something cyan
    k.cyl(8.0, 4.4, z, 0.55, 1.5, withAlpha('#c8f4ff', 0.95));
    k.cyl(8.0, 4.4, z + 0.05, 0.47, 1.0, C.cyan, { line: 0 });
    k.rod([[8.55, 4.4, z + 1.25], [8.95, 4.4, z + 1.0], [8.55, 4.4, z + 0.5]], C.white, 0.1);
    // a bowl of glowing fruit
    k.cyl(9.6, 4.6, z, 0.85, 0.5, C.panelLight);
    for (const [du, dv, c] of [[-0.3, -0.2, C.flora], [0.3, 0.0, C.flora3], [0, 0.3, C.flora2], [-0.1, -0.05, C.flora3]] as const) {
      const [x, y] = k.p(9.6 + du, 4.6 + dv, z + 0.75);
      k.pen.beginPath();
      k.pen.arc(x, y, 0.38 * k.s, 0, Math.PI * 2);
      k.paint(c, k.thin * 0.8);
    }
    k.halo(9.6, 4.6, z + 0.9, 1.2, C.flora3, 0.3);
    // the food processor at the end
    processor(k);
    // the front bench
    bench(k, 1.8, 8.4);
  },
};

// A bench along u from (u, v): a white body, a magenta cushion.
function bench(k: Kit, u: number, v: number): void {
  k.box(u, v, 0, 8.4, 1.5, 2.0, C.panel, { round: 0.3 });
  k.box(u + 0.15, v + 0.1, 2.0, 8.1, 1.3, 0.5, C.magenta, { round: 0.25 });
  if (k.fine) for (let i = 1; i < 4; i++) k.line([[u + i * 2.1, v + 1.41, 2.05], [u + i * 2.1, v + 1.41, 2.45]], shade(C.magenta, -0.3), k.thin * 0.7);
}

// A tray with a meal: a pale violet tray, a green mound, an orange slice
// and a pink something in its little hollows.
function tray(k: Kit, u: number, v: number, z: number, seed: number): void {
  k.poly(rflat(u, v, u + 2.6, v + 1.8, z + 0.02, 0.3), '#d9d0f2', k.thin);
  k.poly(rflat(u + 0.2, v + 0.2, u + 2.4, v + 1.6, z + 0.03, 0.22), '#c4b8e8', 0);
  const foods: Array<[number, number, Color]> = [[0.6, 0.6, C.grass], [1.6, 0.55, C.orange], [1.1, 1.2, C.flora]];
  for (const [du, dv, c] of foods) {
    const [x, y] = k.p(u + du, v + dv, z + 0.2);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.42 * k.s, 0.28 * k.s, hash(seed, du * 10, 3) - 0.5, 0, Math.PI * 2);
    k.paint(c, k.thin * 0.7);
  }
}

// The food processor: a boxy white machine at the bench's end, an orange
// band, a little screen of icons, the dispensing slot glowing with a cup.
function processor(k: Kit): void {
  const u0 = 11.6;
  const u1 = 14.6;
  const v0 = 2.4;
  const v1 = 8.4;
  k.shadow(13.1, 5.4, 2.2, 3.6, 0.28);
  k.box(u0, v0, 0, u1 - u0, v1 - v0, 8.4, C.panel, { round: 0.5 });
  k.box(u0 + 0.2, v0 + 0.3, 8.4, u1 - u0 - 0.4, v1 - v0 - 0.6, 0.5, C.white, { round: 0.3 });
  // an orange band round the two faces in view
  k.poly([[u0, v1 + 0.01, 6.4], [u1, v1 + 0.01, 6.4], [u1, v1 + 0.01, 7.0], [u0, v1 + 0.01, 7.0]], k.side(C.trim, 0, 1, 0.1), 0);
  k.poly([[u1 + 0.01, v0, 6.4], [u1 + 0.01, v1, 6.4], [u1 + 0.01, v1, 7.0], [u1 + 0.01, v0, 7.0]], k.side(C.trim, 1, 0, 0.1), 0);
  // the slot on the front: recessed, glowing, a cup standing in it
  const F = v1 + 0.02;
  k.poly(rrect(u0 + 0.5, 2.4, u1 - 0.5, 5.4, F, 0.5), '#2b2547', k.thin);
  k.poly(rrect(u0 + 0.7, 2.6, u1 - 0.7, 5.2, F + 0.01, 0.4), k.vgrad(u0, F, 2.6, 5.2, [[0, C.gold], [1, '#ffe7a8']]), 0);
  k.halo((u0 + u1) / 2, F, 3.9, 2.2, C.gold, 0.4);
  k.box(u0 + 0.6, v1 - 0.6, 2.4, u1 - u0 - 1.2, 0.62, 0.2, C.panelDark, { line: k.thin, stripe: false });
  mug(k, (u0 + u1) / 2, v1 - 0.25, 2.6, C.white, 0.42, C.flora2);
  // the screen of icons above it
  const q: Quad = [[u0 + 0.6, F, 5.7], [u1 - 0.6, F, 5.7], [u1 - 0.6, F, 6.25], [u0 + 0.6, F, 6.25]];
  k.poly([...q], '#1f2440', k.thin * 0.8);
  pips(k, [on(q, 0.2, 0.5), on(q, 0.45, 0.5), on(q, 0.7, 0.5)], C.cyan, 0.12, 0.7);
  // a vent on the end and a hatch on top
  const vents: Array<[P3, P3]> = [];
  for (let z = 1.2; z < 5.6; z += 0.6) vents.push([[u1 + 0.02, v0 + 1.2, z], [u1 + 0.02, v0 + 3.6, z]]);
  k.segs(vents, withAlpha(INK, 0.5), Math.max(0.7, 0.1 * k.s));
  k.cyl(13.1, 4.2, 8.9, 0.75, 0.4, C.orange);
}

// ── entrance: the airlock ──────────────────────────────────────────────────
// A chunky rounded hatch frame in grey with orange corners standing well
// out from the wall, a white rim and a row of cyan lights round its
// opening; through it the deep blue airlock chamber with a porthole onto
// the pink day at its far end. Two white door halves with hazard bands
// slide apart while someone passes and the amber warning light above (lit
// at rest) blinks; a keypad and a locker beside it, a spare tank and a
// helmet on a hook on the other side.

const DOOR = { u0: 3.5, u1: 9.5, top: 16.2, rTop: 2.4, face: 1.3, back: -1.8, rim: 1.9 };
const doorOpening = (n: number) => rrect(DOOR.u0, 0, DOOR.u1, DOOR.top, n, DOOR.rTop, 0, 6);

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, top, face, back } = DOOR;
    const mid = (u0 + u1) / 2;
    const k = still(v, 'entrance', 20, (k) => {
      const pen = k.pen;
      // the frame's thickness first (its outline at the wall and at its
      // face, hulled), so the chamber and the face draw over it
      const R = DOOR.rim;
      const outerAt = (n: number) => rrect(u0 - R, 0, u1 + R, top + R, n, DOOR.rTop + R, 0, 6);
      fillPts(k, hull([...outerAt(0), ...outerAt(face)].map((p) => k.p(...p))), C.metal, k.lw);
      // the chamber beyond, seen only through the opening: deep blue
      // walls, a strip of floor light, the outer hatch with a porthole onto
      // the pink day
      pen.save();
      pen.beginPath();
      k.trace(doorOpening(face));
      pen.clip();
      k.poly([[u0, back, 0], [u1, back, 0], [u1, back, top], [u0, back, top]], k.vgrad(mid, back, 0, top, [[0, '#2c3a6e'], [1, '#1a2244']]), 0);
      // (set left of the middle, so that seen past the jamb it sits centred)
      const hm = mid - 1.5;
      k.poly(rrect(hm - 2, 0.3, hm + 2, 11.5, back + 0.02, 1.6, 0.2), '#3c4c86', k.thin);
      const port: P3[] = [];
      for (let i = 0; i < 24; i++) {
        const th = (i / 24) * Math.PI * 2;
        port.push([hm + Math.cos(th) * 1.3, back + 0.04, 8.2 + Math.sin(th) * 1.3]);
      }
      k.halo(hm, back + 0.5, 8.2, 2.4, '#ffc2e2', 0.35);
      k.poly(port, k.vgrad(hm, back, 6.9, 9.5, [[0, C.grass], [0.35, C.skyLow], [1, C.skyTop]]), k.thin);
      k.line([[u0 - 1, back + 0.3, 0.05], [u1 - 0.3, back + 0.3, 0.05]], C.cyan, Math.max(0.8, 0.16 * k.s));
      // the jamb in view (its +u face) and the floor of the passage
      k.poly([[u0, back, 0], [u0, face, 0], [u0, face, top - DOOR.rTop], [u0, back, top - DOOR.rTop]], k.side('#b9c3d3', 1, 0), 0);
      k.poly([[u0, back, 0.02], [u1, back, 0.02], [u1, face, 0.02], [u0, face, 0.02]], '#5d687a', 0);
      pen.restore();
      // the threshold plate before it: dark, two gold stripes
      k.poly([[u0 - 0.4, face, 0.03], [u1 + 0.4, face, 0.03], [u1 + 0.4, 3.0, 0.03], [u0 - 0.4, 3.0, 0.03]], '#4a5266', k.thin, 0.2);
      for (const w of [1.5, 2.3]) k.poly([[u0, w, 0.04], [u1, w, 0.04], [u1, w + 0.35, 0.04], [u0, w + 0.35, 0.04]], withAlpha(C.gold, 0.85), 0);
      // the frame: chunky, grey, standing well out from the wall, a white
      // rim round the opening, orange trim on its feet and shoulders
      const outerPts = rrect(u0 - R, 0, u1 + R, top + R, face, DOOR.rTop + R, 0, 6);
      pen.beginPath();
      k.trace(outerPts);
      k.trace(doorOpening(face));
      pen.fillStyle = k.hgrad([u0 - R, face, 0], [u1 + R, face, 0], [[0, '#eef0f3'], [0.5, C.frame], [1, '#b3b9c2']]);
      pen.fill('evenodd');
      const rim = rrect(u0 - 0.5, 0, u1 + 0.5, top + 0.5, face + 0.01, DOOR.rTop + 0.5, 0, 6);
      pen.beginPath();
      k.trace(rim);
      k.trace(doorOpening(face + 0.01));
      pen.fillStyle = k.hgrad([u0, face, 0], [u1, face, 0], [[0, '#ffffff'], [1, C.panel]]);
      pen.fill('evenodd');
      pen.beginPath();
      k.trace(rim);
      k.paint(null, k.thin);
      pen.beginPath();
      k.trace(outerPts);
      k.paint(null, k.lw);
      pen.beginPath();
      k.trace(doorOpening(face));
      k.paint(null, k.lw);
      // bolts round the frame and a row of cyan lights down its sides
      const bolts: P3[] = [];
      for (let z = 1.2; z < top; z += 3.2) bolts.push([u0 - R + 0.45, face + 0.02, z], [u1 + R - 0.45, face + 0.02, z]);
      rivets(k, bolts, C.panelLight, 0.14);
      for (const [cu, cz] of [[u0 - R + 0.7, 0.75], [u1 + R - 0.7, 0.75], [u0 - R + 1.2, top - 0.6], [u1 + R - 1.2, top - 0.6]] as const) k.poly(rrect(cu - 0.55, cz - 0.55, cu + 0.55, cz + 0.55, face + 0.02, 0.2), C.trimOrange, k.thin * 0.8);
      const lights: P3[] = [];
      for (let z = 2.8; z < top - 2; z += 3.2) lights.push([u0 - 1.2, face + 0.02, z], [u1 + 1.2, face + 0.02, z]);
      for (const [lu, lv, lz] of lights) k.halo(lu, lv, lz, 0.9, C.cyan, 0.5);
      pips(k, lights, '#e6feff', 0.2, 1);
      // the warning light's housing over the frame
      k.box(mid - 1.2, 0, top + R, 2.4, face + 0.2, 0.6, C.panelDark, { round: 0.2 });
      // right: a keypad over a locker; left: a tank and a helmet on a hook
      k.shadow(13, 1.2, 1.8, 1.0, 0.25);
      k.box(11.6, 0.2, 0, 2.8, 1.5, 5.4, C.white, { round: 0.3 });
      k.poly([[11.6, 1.71, 3.6], [14.4, 1.71, 3.6], [14.4, 1.71, 4.2], [11.6, 1.71, 4.2]], k.side(C.magenta, 0, 1, 0.1), 0);
      k.line([[12.2, 1.72, 2.4], [13.0, 1.72, 2.4]], INK, Math.max(1, 0.2 * k.s));
      k.line([[13.0, 1.72, 0.3], [13.0, 1.72, 5.1]], withAlpha(INK, 0.5), k.thin * 0.8);
      k.box(12.1, 0, 7.6, 1.6, 0.4, 2.6, C.panel, { round: 0.25 });
      k.poly([[12.3, 0.41, 9.3], [13.5, 0.41, 9.3], [13.5, 0.41, 9.95], [12.3, 0.41, 9.95]], '#1f2440', k.thin * 0.8);
      const keys: P3[] = [];
      for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) keys.push([12.5 + c * 0.4, 0.42, 8.0 + r * 0.55]);
      pips(k, keys, C.panelLight, 0.12, 0.7);
      k.shadow(1.3, 1.6, 1.0, 0.9, 0.25);
      k.cyl(1.3, 1.6, 0, 0.75, 6.2, C.orange);
      k.cyl(1.3, 1.6, 6.2, 0.4, 0.6, C.panelDark);
      band(k, 1.3, 1.6, 0.76, 4.6, 5.1);
      k.paint(C.white, k.thin * 0.8);
      k.rod([[1.0, 0.05, 10.2], [1.0, 0.6, 10.2]], C.panelDark, 0.12);
      helmet(k, 1.05, 0.95, 8.4);
    });
    // the doors: shut, or slid apart into the frame while someone passes
    const open = v.active ? 1 : 0;
    const pen = k.pen;
    pen.save();
    pen.beginPath();
    k.trace(doorOpening(face));
    pen.clip();
    const n = -0.3;
    const half = (mid - u0) * open * 0.92;
    door(k, u0 - half, mid - half, n, top, false);
    door(k, mid + half, u1 + half, n, top, true);
    pen.restore();
    // the warning light: a steady amber at rest, blinking while the doors open
    const blink = v.active ? 0.5 + 0.5 * Math.sin(v.t * 7) : 0.35;
    const lz = top + DOOR.rim + 0.6;
    const [lx, ly] = k.p(mid, face * 0.6, lz);
    k.halo(mid, face * 0.6, lz, 1.5, C.amber, 0.3 + 0.4 * blink);
    pen.beginPath();
    pen.ellipse(lx, ly, 0.95 * k.s, 0.65 * k.s, 0, Math.PI, 0);
    pen.closePath();
    k.paint(v.active && blink > 0.5 ? '#ffe2a0' : C.gold, k.thin);
    // the keypad's light: cyan, brighter while it cycles
    pips(k, [[13.2, 0.43, 9.62]], v.active ? '#dffcff' : C.cyan, 0.14, 0.8);
  },
};

// One door half from u = a to b on the plane v = n, `right` the one whose
// meeting edge is on its left.
function door(k: Kit, a: number, b: number, n: number, top: number, right: boolean): void {
  const face = k.side(C.panel, 0, 1);
  k.poly([[a, n, 0], [b, n, 0], [b, n, top + 0.5], [a, n, top + 0.5]], k.vgrad(a, n, 0, top, [[0, shade(face, -0.06)], [1, shade(face, 0.08)]]), k.lw);
  // an orange stripe by the meeting edge, a slot window, panel lines
  const e = right ? a : b;
  const s = right ? 1 : -1;
  k.poly([[e + s * 0.35, n + 0.01, 0.3], [e + s * 0.75, n + 0.01, 0.3], [e + s * 0.75, n + 0.01, top], [e + s * 0.35, n + 0.01, top]], C.trimOrange, 0);
  const wa = e + s * 1.2;
  const wb = e + s * 2.3;
  k.poly(rrect(Math.min(wa, wb), 10.2, Math.max(wa, wb), 13.2, n + 0.02, 0.5), k.vgrad(wa, n, 10.2, 13.2, [[0, '#3c4c86'], [1, '#ff9fcc']]), k.thin);
  k.line([[a + 0.4, n + 0.02, 4.2], [b - 0.4, n + 0.02, 4.2]], withAlpha(INK, 0.4), k.thin * 0.8);
  k.line([[a + 0.4, n + 0.02, 8.6], [b - 0.4, n + 0.02, 8.6]], withAlpha(INK, 0.4), k.thin * 0.8);
  // a hazard band across the foot: gold with dark slants
  k.poly([[a, n + 0.02, 0.7], [b, n + 0.02, 0.7], [b, n + 0.02, 2.1], [a, n + 0.02, 2.1]], C.gold, k.thin);
  const pen = k.pen;
  pen.save();
  pen.beginPath();
  k.trace([[a, n + 0.03, 0.7], [b, n + 0.03, 0.7], [b, n + 0.03, 2.1], [a, n + 0.03, 2.1]]);
  pen.clip();
  pen.beginPath();
  for (let u = Math.floor(a) - 2; u < b + 1; u += 1.1) k.trace([[u, n + 0.03, 0.7], [u + 0.5, n + 0.03, 0.7], [u + 1.9, n + 0.03, 2.1], [u + 1.4, n + 0.03, 2.1]]);
  pen.fillStyle = '#3a2f4f';
  pen.fill();
  pen.restore();
}

// A spare helmet hanging on a hook: a white dome, a pink visor.
function helmet(k: Kit, u: number, v: number, z: number): void {
  const [x, y] = k.p(u, v, z);
  const R = 1.0 * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.arc(x, y, R, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - R * 0.4, y - R * 0.4, 0, x, y, R * 1.1);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(1, C.panel);
  k.paint(g, k.lw);
  pen.beginPath();
  pen.ellipse(x + R * 0.12, y + R * 0.08, R * 0.62, R * 0.42, 0, 0, Math.PI * 2);
  k.paint(mix(C.flora, C.skyTop, 0.5), k.thin);
  pen.beginPath();
  pen.ellipse(x - R * 0.1, y - R * 0.08, R * 0.2, R * 0.1, -0.4, 0, Math.PI * 2);
  pen.fillStyle = '#ffffffc0';
  pen.fill();
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
