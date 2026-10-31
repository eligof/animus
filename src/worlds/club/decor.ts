import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { bottle, cone, frond, martini, stool, tumbler } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, NEONS, beatOf, due, hash, kick, kitOf, still, withAlpha } from './kit.ts';

// The club's furniture between the stations: high tables with stools,
// speaker stacks thumping on the beat, palms in black pots, LED totems, a
// fog machine, a jukebox and crates of empties. Still pieces are drawn
// once into the scene's static layer; the speakers and totems move.

// ── a high table ────────────────────────────────────────────────────────────
// A round black top on a chrome pedestal between two velvet stools, with
// what was left on it: cocktails, a beer, a candle.
const hightable: PropArt = {
  len: 6,
  dep: 6,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 3;
    k.shadow(c, c, 2.8, 2.8, 0.2);
    const tops: Color[] = [C.velvet, C.plum, '#2a6a8a'];
    const seat = tops[Math.floor(hash(v.seed, 1) * tops.length)];
    stool(k, 0.9, 4.7, seat);
    stool(k, 4.7, 0.9, seat);
    k.shadow(c, c, 1.4, 1.4, 0.28);
    k.cyl(c, c, 0, 1.0, 0.2, C.steelDark);
    k.cyl(c, c, 0.2, 0.2, 7.0, C.chrome, { line: k.thin });
    k.cyl(c, c, 7.2, 1.85, 0.32, '#1d1824', { top: '#2e2838' });
    k.line([[c - 1.6, c + 0.9, 7.53], [c - 0.4, c + 1.75, 7.53]], '#ffffff30', Math.max(0.8, 0.12 * k.s));
    const z = 7.52;
    const kind = Math.floor(hash(v.seed, 2) * 3);
    martini(k, c - 0.6, c - 0.5, z, kind === 0 ? C.lime : C.pink, 0.36);
    if (kind === 1) bottle(k, c + 0.7, c - 0.2, z, '#3a8a4a', 1.6, 0.26, C.amber);
    else tumbler(k, c + 0.6, c - 0.1, z, C.amber, 0.9, 0.3, kind === 2 ? C.cyan : undefined);
    k.cyl(c + 0.1, c + 0.8, z, 0.28, 0.5, '#d0e0f0aa', { line: k.thin });
    const [fx, fy] = k.p(c + 0.1, c + 0.8, z + 0.72);
    k.pen.beginPath();
    k.pen.ellipse(fx, fy, 0.1 * k.s, 0.2 * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = '#ffc04a';
    k.pen.fill();
    k.halo(c + 0.1, c + 0.8, z + 0.7, 1.6, '#ffb050', 0.45);
  },
};

// ── a speaker stack ─────────────────────────────────────────────────────────
// A sub on rubber feet with a cabinet of two woofers and a horn on top,
// grilles off; the cones pump on every kick.
const speakers: PropArt = {
  len: 5,
  dep: 5,
  height: 12,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const k = still(v, 'speakers', 12, (k) => {
      k.shadow(2.5, 2.5, 2.6, 2.4, 0.34);
      for (const [u, w] of [[0.8, 1.0], [4.2, 1.0], [0.8, 4.0], [4.2, 4.0]] as const) k.box(u - 0.25, w - 0.25, 0, 0.5, 0.5, 0.3, '#121016', { line: k.thin });
      k.box(0.4, 0.6, 0.3, 4.2, 3.8, 3.6, '#363140', { round: 0.12 });
      k.rect(0.7, 4.41, 0.6, 4.3, 3.6, '#1d1924', k.thin);
      k.box(0.7, 0.9, 3.9, 3.6, 3.2, 7.4, '#3c3647', { round: 0.12 });
      k.rect(0.95, 4.11, 4.2, 4.05, 11.0, '#1d1924', k.thin);
      // a strip of light along the sub's foot
      k.neon([[0.6, 4.45, 0.55], [4.4, 4.45, 0.55]], NEONS[Math.floor(hash(v.seed, 3) * NEONS.length)], 0.18);
      // the horn
      k.poly([[1.3, 4.12, 9.4], [3.7, 4.12, 9.4], [3.2, 4.12, 10.7], [1.8, 4.12, 10.7]], '#2e2938', k.thin);
      k.poly([[2.1, 4.13, 9.8], [2.9, 4.13, 9.8], [2.75, 4.13, 10.3], [2.25, 4.13, 10.3]], '#0e0b12', 0);
      // handles and the power light
      k.line([[0.75, 2.0, 6.2], [0.75, 3.2, 6.2]], C.steelDark, Math.max(1, 0.18 * k.s));
      k.ring(3.75, 4.13, 4.5, 0.12, C.cyan, 0);
    });
    const kk = kick(v.t);
    cone(k, 2.5, 4.42, 2.1, 1.35, kk);
    cone(k, 2.5, 4.12, 5.7, 1.0, kk);
    cone(k, 2.5, 4.12, 7.85, 1.0, kk * 0.8);
  },
};

// ── a palm ──────────────────────────────────────────────────────────────────
// A kentia palm in a glossy black pot ringed with a strip of light.
const palm: PropArt = {
  len: 6,
  dep: 6,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 3;
    const glow = NEONS[Math.floor(hash(v.seed, 11) * NEONS.length)];
    k.pool(c, c, 2.4, 2.4, glow, 0.35);
    k.shadow(c, c, 1.6, 1.6, 0.3);
    k.cyl(c, c, 0, 1.25, 2.6, '#1d1824', { top: '#2a2432' });
    k.disc(c, c, 2.58, 1.05, '#2a1c18', 0);
    const e = k.ell(c, c, 0.35, 1.27);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
    k.pen.strokeStyle = glow;
    k.pen.lineWidth = Math.max(1, 0.2 * k.s);
    k.pen.stroke();
    // three stems up, fronds arching out from their tops, the far ones first
    const stems: P3[] = [[c - 0.5, c - 0.3, 6.2], [c + 0.6, c - 0.2, 7.4], [c, c + 0.5, 5.4]];
    stems.forEach(([u, w, z], j) => {
      k.rod([[c + (u - c) * 0.3, c + (w - c) * 0.3, 2.5], [u, w, z]], '#5a7a3a', 0.13);
      const [bx, by] = k.p(u, w, z);
      for (let i = 0; i < 4; i++) {
        const a = -Math.PI / 2 + (i - 1.5) * 0.62 + (hash(v.seed, j * 4 + i, 12) - 0.5) * 0.3;
        const L = (3.4 + hash(v.seed, j * 4 + i, 13) * 1.4) * k.s;
        frond(k, bx, by, a, L, 0.55, (i + j) % 3 === 0 ? C.leafDark : (i + j) % 3 === 1 ? C.leaf : C.leafLight);
      }
    });
  },
};

// ── an LED totem ────────────────────────────────────────────────────────────
// A slim pillar of frosted segments on a black base; a chase of colour runs
// up it on the beat.
const totem: PropArt = {
  len: 3,
  dep: 3,
  height: 11,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const N = 8;
    const k = still(v, 'totem', 11, (k) => {
      k.shadow(1.5, 1.5, 1.4, 1.4, 0.3);
      k.box(0.6, 0.6, 0, 1.8, 1.8, 0.7, '#1d1824');
      k.box(0.8, 0.8, 9.5, 1.4, 1.4, 0.5, '#1d1824');
    });
    const b = beatOf(v.t);
    const kk = kick(v.t);
    const hue = NEONS[Math.floor(b / 4) % NEONS.length];
    for (let i = 0; i < N; i++) {
      const z0 = 0.7 + i * 1.1;
      const lit = (i + b) % 4 === 0 || i === b % N;
      k.box(0.85, 0.85, z0, 1.3, 1.3, 1.05, lit ? shade(hue, 0.25 * kk) : withAlpha(hue, 0.35), { line: k.thin, stripe: false });
    }
    k.halo(1.5, 1.6, 0.7 + ((b % N) + 0.5) * 1.1, 2.4, hue, 0.35 + 0.3 * kk);
  },
};

// ── a fog machine ───────────────────────────────────────────────────────────
// A black box on the floor with its nozzle toward the room and a coil of
// cable; now and then it breathes out a cloud.
const fogger: PropArt = {
  len: 5,
  dep: 4,
  height: 3,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2, 2.4, 1.8, 0.3);
    k.box(0.6, 0.8, 0, 3.0, 2.2, 1.7, '#25212c', { round: 0.12 });
    k.cyl(3.9, 1.9, 0.6, 0.35, 0.5, C.steelDark);
    k.box(3.5, 1.65, 0.75, 0.8, 0.5, 0.45, C.steel, { line: k.thin });
    k.ring(1.4, 3.01, 1.0, 0.12, C.hot, 0);
    k.line([[0.9, 3.02, 0.6], [2.6, 3.02, 0.6]], '#3a3446', Math.max(0.8, 0.12 * k.s));
    // the cable, coiled
    for (let i = 0; i < 3; i++) {
      const pts: P3[] = [];
      for (let j = 0; j <= 16; j++) {
        const a = (j / 16) * Math.PI * 2;
        pts.push([1.6 + Math.cos(a) * (0.7 + i * 0.12), 3.4 + Math.sin(a) * (0.45 + i * 0.08), 0.06 + i * 0.05]);
      }
      k.line(pts, '#121016', Math.max(0.8, 0.14 * k.s));
    }
  },
  emit(v: PropView, dt: number, spawn: (p: Particle) => void): void {
    // a burst every few seconds
    const cycle = 4.5 + hash(v.seed, 1) * 2;
    const ph = (v.t + hash(v.seed, 2) * cycle) % cycle;
    if (ph > 1.2) return;
    const n = due(v.t, dt, 5, v.seed);
    for (let i = 0; i < n; i++) {
      const j = (q: number) => hash(Math.floor(v.t * 20), i, q) - 0.5;
      spawn({ kind: 'smoke', x: 4.3, y: 1.9 + j(1) * 0.4, z: 1.0, vx: 1.6 + j(2), vy: 0.8 + j(3), vz: 0.25 + j(4) * 0.2, life: 2.2 + j(5), color: [196, 180, 232], glow: false, gravity: -0.2 });
    }
  },
};

// ── a jukebox ───────────────────────────────────────────────────────────────
// An arched jukebox with bubbling tubes of light round its window, a
// carousel of records behind the glass and a chrome grille below.
const jukebox: PropArt = {
  len: 5,
  dep: 4,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    const [u0, u1, v0, v1] = [0.5, 4.5, 0.8, 3.4];
    const cu = (u0 + u1) / 2;
    k.pool(cu, v1 + 0.6, 2.8, 1.8, C.amber, 0.3);
    k.shadow(cu, 2.1, 2.4, 1.6, 0.32);
    k.box(u0, v0, 0, u1 - u0, v1 - v0, 7.6, '#6a2a3a', { round: 0.2 });
    // the arch on the front, its tubes of light
    const arch = (r: number, z: number, n: number): P3[] => {
      const out: P3[] = [];
      for (let i = 0; i <= 16; i++) {
        const a = (i / 16) * Math.PI;
        out.push([cu + Math.cos(a) * r, n, z + Math.sin(a) * r * 1.4]);
      }
      return out;
    };
    k.poly([[u0, v1, 7.6], ...arch(2.0, 7.6, v1).reverse(), [u1, v1, 7.6]], '#6a2a3a', k.lw);
    k.poly([[u0, v1, 7.6], [u0, v0, 7.6], ...arch(2.0, 7.6, v0).reverse().map(([a, , z]) => [a, v0, z] as P3), [u1, v0, 7.6], [u1, v1, 7.6]], shade('#6a2a3a', 0.1), 0);
    k.poly(arch(2.0, 7.6, v1), '#7a3242', k.lw);
    k.neon(arch(1.7, 7.6, v1 + 0.05), C.amber, 0.24);
    k.neon(arch(1.25, 7.6, v1 + 0.05), C.pink, 0.2);
    for (const u of [u0 + 0.45, u1 - 0.45]) k.neon([[u, v1 + 0.05, 0.8], [u, v1 + 0.05, 7.4]], C.cyan, 0.24);
    // the window onto the records
    k.rect(cu - 1.2, v1 + 0.02, 4.4, cu + 1.2, 7.0, k.vgrad(cu, v1, 4.4, 7, [[0, '#2a1a2a'], [1, '#4a2a3a']]), k.thin);
    for (let i = 0; i < 4; i++) k.ring(cu - 0.75 + i * 0.5, v1 + 0.03, 5.6, 0.85, i & 1 ? '#1a1418' : '#2a2228', k.thin * 0.6);
    k.ring(cu, v1 + 0.04, 5.6, 0.25, C.amber, 0);
    // the buttons and the grille
    for (let i = 0; i < 6; i++) k.rect(cu - 1.3 + i * 0.45, v1 + 0.03, 3.6, cu - 1.0 + i * 0.45, 3.95, '#f2e6c8', 0);
    k.rect(cu - 1.4, v1 + 0.02, 0.6, cu + 1.4, 3.1, '#3a1a2a', k.thin);
    k.line([[cu, v1 + 0.03, 0.6], [cu, v1 + 0.03, 3.1]], C.chrome, Math.max(1, 0.2 * k.s));
    k.line([[cu - 1.4, v1 + 0.03, 1.85], [cu + 1.4, v1 + 0.03, 1.85]], C.chrome, Math.max(1, 0.2 * k.s));
    k.halo(cu, v1 + 0.5, 7.6, 3.4, C.amber, 0.3);
  },
};

// ── crates of empties and a keg ─────────────────────────────────────────────
const crates: PropArt = {
  len: 6,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2, 3.2, 2.2, 0.3);
    const crate = (u: number, w: number, z: number, c: Color) => {
      k.box(u, w, z, 2.4, 1.8, 1.3, c, { round: 0.08 });
      k.rect(u + 0.4, w + 1.81, z + 0.75, u + 2.0, w + 1.81, shade(c, -0.35), 0);
      if (z + 1.3 < 4) for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) k.disc(u + 0.45 + i * 0.5, w + 0.5 + j * 0.8, z + 1.31, 0.17, j ? '#3a8a4a' : '#5a3a1a', 0);
    };
    crate(0.4, 0.6, 0, '#e0a020');
    crate(0.5, 0.7, 1.3, '#c03040');
    // the keg
    k.cyl(4.6, 2.2, 0, 1.0, 2.8, C.steel);
    for (const z of [0.3, 1.4, 2.5]) {
      const e = k.ell(4.6, 2.2, z, 1.02);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
      k.pen.strokeStyle = shade(C.steel, -0.3);
      k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
      k.pen.stroke();
    }
    k.disc(4.6, 2.2, 2.82, 0.35, '#2a2532', k.thin);
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: hightable, count: 2, place: 'floor' },
  { art: speakers, count: 1, place: 'floor' },
  { art: palm, count: 1, place: 'floor' },
  { art: totem, count: 1, place: 'floor' },
  { art: hightable, count: 1, place: 'floor' },
  { art: fogger, count: 1, place: 'floor' },
  { art: jukebox, count: 1, place: 'floor' },
  { art: speakers, count: 1, place: 'floor' },
  { art: palm, count: 1, place: 'floor' },
  { art: hightable, count: 2, place: 'floor' },
  { art: crates, count: 1, place: 'floor' },
  { art: totem, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: hightable, count: 2, place: 'floor' },
  { art: palm, count: 2, place: 'floor' },
  { art: crates, count: 1, place: 'floor' },
];

export const DECOR_ART = { hightable, speakers, palm, totem, fogger, jukebox, crates };
