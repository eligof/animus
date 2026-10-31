import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { bottle, cone, fillPts, hull, martini, platter, plush, ring, sleeve, spines, stool, tumbler, frond } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { BEAT, C, INK, NEONS, beatOf, due, hash, kick, kitOf, rgb, still, withAlpha } from './kit.ts';

// The club's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame; worked,
// they move on the beat.

type Spawn = (p: Particle) => void;

// A note of music (a glint) rising off (u, v, z) in the prop's frame.
function note(u: number, v: number, z: number, n: number, i: number): Particle {
  const j = (q: number) => hash(n, i, q) - 0.5;
  const c = NEONS[Math.floor(hash(n, i, 9) * NEONS.length)];
  return { kind: 'glint', x: u + j(1) * 2, y: v + j(2), z, vx: j(3) * 0.8, vy: 0.4 + j(4) * 0.6, vz: 2.2 + j(5), life: 1.5, color: rgb(c), glow: true, gravity: -0.2 };
}

// ── write: the DJ booth ─────────────────────────────────────────────────────
// A black booth with an LED front and a pink neon lip: two turntables and a
// mixer on it and a drink on the corner; tall monitor speakers on the floor
// at its back corners, and between them, behind the booth, room for the DJ
// (see npcs.ts); a video wall on the brick behind. Playing, the records
// spin, the meters and the front jump to the beat and the wall shows the
// music. `back`: where the booth's body begins, out from the wall.

export const DJ = { z: 5.6, back: 2.4, front: 6.6, decks: [2.4, 8.6] as const, dv: 4.25, scr: { u0: 1.8, u1: 9.2, z0: 9.6, z1: 16.0, n: 0.4 } };

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 17,
  animated: true,
  draw(v: PropView): void {
    const { z, back, front, decks, dv, scr } = DJ;
    const k = still(v, 'write', 17, (k) => {
      k.shadow(5.5, 4, 6.4, 4, 0.34);
      // the video wall on the brick
      k.box(scr.u0 - 0.5, 0, scr.z0 - 0.5, scr.u1 - scr.u0 + 1, 0.35, scr.z1 - scr.z0 + 1, '#1d1824', { stripe: false });
      k.rect(scr.u0, scr.n, scr.z0, scr.u1, scr.z1, k.vgrad(scr.u0, scr.n, scr.z0, scr.z1, [[0, '#120c20'], [1, '#221a38']]), k.thin);
      k.ring((scr.u0 + scr.u1) / 2, scr.n + 0.01, (scr.z0 + scr.z1) / 2, 1.8, null, Math.max(1, 0.12 * k.s), '#3a2a5a');
      // tall monitor speakers on the floor at the back corners, the DJ
      // between them: behind the booth, so drawn before it
      for (const u0 of [0.45, 8.85]) {
        k.box(u0, 0.6, 0, 1.7, 1.6, z + 3.4, '#211d28', { round: 0.15 });
        cone(k, u0 + 0.85, 2.21, z + 1.1, 0.62);
        cone(k, u0 + 0.85, 2.21, z + 2.55, 0.3);
      }
      // the booth, its back a step out from the wall
      k.box(0.3, back, 0, 10.4, front - back, z, C.black, { stripe: false, top: C.gear });
      k.rect(0.8, front + 0.01, 0.7, 10.2, 5.0, '#120e18', k.thin);
      // a dim grid of LEDs on the front
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
        const [x, y] = k.p(1.2 + i * 0.78, front + 0.02, 1.1 + j * 0.62);
        pen.moveTo(x + Math.max(0.6, 0.12 * k.s), y);
        pen.arc(x, y, Math.max(0.6, 0.12 * k.s), 0, Math.PI * 2);
      }
      pen.fillStyle = '#2e2440';
      pen.fill();
      k.neon([[0.35, front, z], [10.65, front, z]], C.pink, 0.24);
      // the decks: plinths, platters, pitch faders; the mixer between
      for (const u of decks) {
        k.box(u - 1.5, 2.65, z, 3.0, 3.2, 0.45, '#3a3446', { round: 0.15 });
        platter(k, u, dv, z + 0.45, 1.22, u < 5 ? C.pink : C.cyan);
        k.line([[u + 1.15, dv + 0.5, z + 0.47], [u + 1.15, dv + 1.4, z + 0.47]], '#15121a', Math.max(0.8, 0.12 * k.s));
        k.disc(u + 1.15, 3.1, z + 0.5, 0.25, C.steel, k.thin);
      }
      k.box(4.3, 2.85, z, 2.4, 3.1, 0.5, '#2e2938', { round: 0.1 });
      for (let i = 0; i < 3; i++) for (const u of [4.75, 5.5, 6.25]) k.disc(u, 3.25 + i * 0.55, z + 0.52, 0.17, i === 0 ? C.hot : '#c9c6d6', 0);
      for (const u of [4.85, 6.15]) {
        k.line([[u, 4.85, z + 0.52], [u, 5.65, z + 0.52]], '#121016', Math.max(0.8, 0.1 * k.s));
        k.box(u - 0.15, 5.05, z + 0.5, 0.3, 0.25, 0.14, '#e6e2ee', { line: k.thin * 0.7, stripe: false });
      }
      // a drink on the corner
      tumbler(k, 10.3, 6.0, z, C.amber, 0.8, 0.28, C.cyan);
    });
    const t = v.t;
    const act = v.active;
    const b = beatOf(t);
    const kk = act ? kick(t) : 0;
    // the records: a sheen turning while they play, the tone arms
    for (const [i, u] of decks.entries()) {
      const spin = act ? t * 3.4 + i : 0.8 + i;
      const sh: P3[] = [[u, dv, z + 0.67]];
      for (let j = 0; j <= 5; j++) {
        const a = spin + (j / 5) * 0.8;
        sh.push([u + Math.cos(a) * 1.1, dv + Math.sin(a) * 1.1, z + 0.67]);
      }
      k.poly(sh, '#ffffff22', 0);
      const piv: P3 = [u + 1.0, 2.95, z + 0.75];
      const tip: P3 = act ? [u + 0.15, dv + 0.55, z + 0.72] : [u + 1.05, dv + 0.55, z + 0.72];
      k.rod([piv, [(piv[0] + tip[0]) / 2 + 0.15, (piv[1] + tip[1]) / 2, z + 0.85], tip], C.chrome, 0.1);
    }
    // the mixer's meters
    const lit = act ? Math.round(2 + 3 * kk) : 0;
    for (const [m, u] of [4.55, 6.45].entries()) {
      for (let j = 0; j < 5; j++) {
        const c = j < 3 ? C.lime : j < 4 ? C.amber : C.hot;
        const w = 4.95 - j * 0.32;
        k.poly([[u - 0.1, w, z + 0.52], [u + 0.1, w, z + 0.52], [u + 0.1, w - 0.22, z + 0.52], [u - 0.1, w - 0.22, z + 0.52]], j < lit - m ? c : '#3a3446', 0);
      }
    }
    // the front: bars of the music, or a slow standby glow
    const pen = k.pen;
    if (act) {
      for (const [ci, c] of [C.pink, C.violet, C.cyan].entries()) {
        pen.beginPath();
        for (let i = ci * 4; i < ci * 4 + 4; i++) {
          const h = Math.max(1, Math.round((0.25 + 0.75 * hash(b, i, 5)) * (0.55 + 0.45 * kk) * 6));
          for (let j = 0; j < h; j++) {
            const [x, y] = k.p(1.2 + i * 0.78, front + 0.03, 1.1 + j * 0.62);
            const r = Math.max(0.7, 0.16 * k.s);
            pen.moveTo(x + r, y);
            pen.arc(x, y, r, 0, Math.PI * 2);
          }
        }
        pen.fillStyle = c;
        pen.fill();
      }
      // the wall: rings out from the middle, bars along the foot
      const cu = (scr.u0 + scr.u1) / 2;
      const cz = (scr.z0 + scr.z1) / 2;
      const ph = (t / BEAT) % 1;
      k.ring(cu, scr.n + 0.02, cz, 0.6 + ph * 2.6, null, Math.max(1, 0.22 * k.s * (1 - ph)), withAlpha(C.cyan, 1 - ph * 0.7));
      k.ring(cu, scr.n + 0.02, cz, 0.9 + kk * 0.5, C.pink, 0);
      for (let i = 0; i < 10; i++) {
        const u0 = scr.u0 + 0.35 + i * 0.7;
        const h = 0.4 + 2.2 * hash(b, i, 6) * (0.5 + 0.5 * kk);
        k.rect(u0, scr.n + 0.02, scr.z0 + 0.3, u0 + 0.5, scr.z0 + 0.3 + h, NEONS[i % NEONS.length], 0);
      }
      k.halo(cu, scr.n + 0.5, cz, 4.2, C.violet, 0.3);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 2.2, v.seed);
    for (let i = 0; i < n; i++) spawn(note(5.5, 4.5, 7.5, Math.floor(v.t * 10), i));
  },
};

// ── read: the record wall ───────────────────────────────────────────────────
// Black cube shelving packed with vinyl, a few sleeves turned face-out; a
// lava lamp and a plant on top; a listening post at the end with a deck
// and headphones on a hook. Reading there spins the deck, slides a sleeve
// out and sets the lava lamp going.

const SHELF = { u0: 0.3, u1: 10.3, f: 3.4, rows: [0.6, 4.75, 8.9, 13.05], top: 17.4, cols: 4 };

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 20,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, f, rows, top, cols } = SHELF;
    const cw = (u1 - u0 - 0.5) / cols;
    const k = still(v, 'read', 20, (k) => {
      k.shadow(6.5, 2.2, 7.4, 2.6, 0.32);
      k.box(u0, 0.1, 0, u1 - u0, f - 0.1, top, '#1f1b26', { stripe: false });
      rows.forEach((z0, r) => {
        for (let c = 0; c < cols; c++) {
          const a0 = u0 + 0.35 + c * cw + 0.05;
          const a1 = a0 + cw - 0.4;
          const z1 = z0 + 3.75;
          k.rect(a0, f + 0.01, z0, a1, z1, k.vgrad(a0, f, z0, z1, [[0, '#0e0b12'], [1, '#1a1522']]), k.thin);
          const sd = v.seed + r * 7 + c * 3;
          if (r === 1 && c === 2) continue; // the sleeve pulled out lives here
          if (hash(sd, 1) < 0.28) {
            spines(k, a0 + 0.1, a1 - cw * 0.45, f - 0.4, z0, 3.4, sd);
            sleeve(k, a1 - cw * 0.45 + 0.05, f + 0.03, z0 + 0.2, Math.min(cw * 0.42, 3.2), sd);
          } else spines(k, a0 + 0.1, a1 - 0.1, f - 0.4, z0, 3.4, sd);
        }
      });
      // what stands on top
      k.cyl(1.7, 1.8, top, 0.75, 1.2, '#2a2532');
      for (let i = 0; i < 6; i++) {
        const [x, y] = k.p(1.7, 1.8, top + 1.2);
        frondLeaf(k, x, y, -Math.PI / 2 + (i - 2.5) * 0.45, (2.2 + hash(v.seed, i, 2)) * k.s, i);
      }
      k.box(4.2, 0.8, top, 2.6, 2.0, 1.4, '#2e2938', { round: 0.15 });
      cone(k, 5.5, 2.81, top + 0.7, 0.45);
      // the lava lamp's base and cap
      frustumUp(k, 8.6, 1.8, top, 0.75, top + 0.9, 0.45, '#c0c4d4');
      frustumUp(k, 8.6, 1.8, top + 3.6, 0.35, top + 4.2, 0.2, '#c0c4d4');
      // the listening post
      k.shadow(12.2, 2.1, 2, 1.8, 0.28);
      k.box(10.8, 0.6, 0, 2.9, 2.9, 6.2, '#2a2532', { round: 0.1 });
      k.rect(11.1, 3.51, 1.2, 13.4, 5.6, '#221e2a', k.thin);
      sleeve(k, 11.5, 3.53, 1.6, 1.6, v.seed + 99);
      k.box(11.0, 0.8, 6.2, 2.5, 2.5, 0.35, '#3a3446', { round: 0.1 });
      platter(k, 12.1, 2.05, 6.55, 0.95, C.lime);
      // headphones on a hook on its end
      k.rod([[13.7, 2.0, 5.4], [14.0, 2.0, 5.4], [14.0, 2.0, 5.1]], C.steel, 0.08);
      k.rod([[13.85, 1.6, 4.0], [14.0, 2.0, 5.15], [13.85, 2.4, 4.0]], '#2a2532', 0.13);
      for (const w of [1.55, 2.45]) k.disc(13.9, w, 3.9, 0.36, C.cyan, k.thin);
    });
    const t = v.t;
    // the listening deck: a sheen, the arm
    const spin = v.active ? t * 3.4 : 0.5;
    const sh: P3[] = [[12.1, 2.05, 6.76]];
    for (let j = 0; j <= 5; j++) sh.push([12.1 + Math.cos(spin + j * 0.16) * 0.85, 2.05 + Math.sin(spin + j * 0.16) * 0.85, 6.76]);
    k.poly(sh, '#ffffff26', 0);
    k.rod([[13.2, 1.1, 6.95], v.active ? [12.4, 2.4, 6.95] : [13.25, 2.5, 6.95]], C.chrome, 0.08);
    // a sleeve sliding out of its cubby
    const c = 2;
    const a0 = u0 + 0.35 + c * cw + 0.05;
    const z0 = rows[1];
    const pull = v.active ? 0.5 + 0.5 * Math.sin(t * 1.3) : 0;
    spines(k, a0 + 0.1, a0 + cw - 0.5 - cw * 0.45, f - 0.4, z0, 3.4, v.seed + 13);
    sleeve(k, a0 + cw * 0.5 - 1.3 + pull * 0.4, f + 0.05 + pull * 0.6, z0 + 0.3 + pull * 0.9, 2.6, v.seed + 14);
    // the lava lamp: blobs rising in its glass while someone reads
    const lu = 8.6;
    const lv = 1.8;
    const lz = SHELF.top + 0.9;
    const e0 = k.ell(lu, lv, lz, 0.45);
    const e1 = k.ell(lu, lv, lz + 2.7, 0.35);
    fillPts(k, [[e0.cx - e0.rx * 1.05, e0.cy], [e0.cx + e0.rx * 1.05, e0.cy], [e1.cx + e1.rx, e1.cy], [e1.cx - e1.rx, e1.cy]], k.grad([lu, lv, lz], [lu, lv, lz + 2.7], [[0, '#ff5aa8'], [1, '#ffb0d8']]), k.thin);
    for (let i = 0; i < 3; i++) {
      const ph = v.active ? (t * 0.25 + i / 3) % 1 : [0.1, 0.45, 0.8][i];
      const [x, y] = k.p(lu + Math.sin(i * 2 + ph * 6) * 0.12, lv, lz + 0.3 + ph * 2.1);
      k.pen.beginPath();
      k.pen.ellipse(x, y, (0.2 + 0.08 * Math.sin(ph * 9 + i)) * k.s, (0.28 - 0.06 * Math.sin(ph * 9 + i)) * k.s, 0, 0, Math.PI * 2);
      k.pen.fillStyle = '#ffe14a';
      k.pen.fill();
    }
    k.halo(lu, lv + 0.3, lz + 1.4, 2.4, '#ff6ab8', v.active ? 0.5 : 0.3);
  },
};

function frondLeaf(k: Kit, x: number, y: number, a: number, L: number, i: number): void {
  frond(k, x, y, a, L, 0.35, i & 1 ? C.leaf : C.leafLight);
}

// An upright cone frustum (lamp bases, caps): radius r0 at z0, r1 at z1.
function frustumUp(k: Kit, cu: number, cv: number, z0: number, r0: number, z1: number, r1: number, base: Color): void {
  const sil = hull([...ring(k, [cu, cv, z0], [0, 0, 1], r0, 20), ...ring(k, [cu, cv, z1], [0, 0, 1], r1, 20)]);
  const xs = sil.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, 0.12));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.25));
  fillPts(k, sil, g, k.lw);
  k.disc(cu, cv, z1, r1, shade(base, 0.15), k.thin);
}

// ── search: the coat check ──────────────────────────────────────────────────
// A hatch with a counter: coats of every colour on a rail behind it, hats
// on a shelf over them, a bell, tickets and a tip jar, a lamp over the
// hatch; between the rail and the counter, room for the attendant (see
// npcs.ts: it fetches the coats). Worked, the lamp glows brighter and a
// coat just hung back swings on the rail. `z`: the counter's height (`top`
// with its top on), `edge` the top's back edge, `at` where along it the
// attendant stands, `bell` where its bell stands, `lamp` where the lamp
// hangs, clear of the attendant's head.

const COATS: readonly Color[] = ['#c23a5a', '#2f6e8a', '#d9a03a', '#5a4a8a', '#e8e0d0', '#3a8a5a', '#8a3a7a', '#2a2a34'];
const RAIL = 12.2;
export const HATCH = { z: 5.2, top: 5.65, edge: 2.1, at: 5.0, bell: [1.95, 2.65] as const, lamp: 9.0 };
const SWUNG = 6;

function coat(k: Kit, u: number, v: number, color: Color, sway = 0, z1 = 6.4): void {
  const top = RAIL - 0.2;
  const sx = Math.sin(sway) * 0.6;
  // the hanger's hook, shoulders, then the coat hanging off it
  k.line([[u, v, RAIL + 0.15], [u, v, top - 0.35]], C.steel, Math.max(0.8, 0.08 * k.s));
  k.poly(
    [
      [u - 0.25, v, top - 0.3],
      [u + 0.25, v, top - 0.3],
      [u + 0.95, v, top - 0.9],
      [u + 0.95 + sx * 0.6, v, z1 + 1.2],
      [u + 0.8 + sx, v, z1],
      [u - 0.8 + sx, v, z1],
      [u - 0.95 + sx * 0.6, v, z1 + 1.2],
      [u - 0.95, v, top - 0.9],
    ],
    k.side(color, 0, 1, 0.1),
    k.thin,
    0.2,
  );
  k.line([[u, v + 0.01, top - 0.4], [u - 0.25, v + 0.01, top - 1.5], [u + sx * 0.6, v + 0.01, z1 + 0.2]], shade(color, -0.3), Math.max(0.7, 0.08 * k.s));
  k.line([[u - 0.25, v + 0.01, top - 0.35], [u, v + 0.01, top - 1.1], [u + 0.25, v + 0.01, top - 0.35]], shade(color, 0.25), Math.max(0.7, 0.1 * k.s));
}

const coatAt = (i: number): [number, number] => [1.6 + i * 1.25, 1.2 + (i & 1) * 0.15];

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 16,
  animated: true,
  draw(v: PropView): void {
    const { z, top, bell, lamp } = HATCH;
    const k = still(v, 'search', 16, (k) => {
      k.shadow(6, 2.4, 6.6, 2.4, 0.3);
      // the cloakroom behind: dark walls of the alcove, the rail, the coats
      k.box(0.2, 0, 0, 0.4, 3.5, 14.8, '#3a2a40', { stripe: false });
      k.box(11.4, 0, 0, 0.4, 3.5, 14.8, '#3a2a40', { stripe: false });
      k.rect(0.6, 0.05, 0, 11.4, 14.8, k.vgrad(6, 0.05, 0, 14.8, [[0, '#1a1420'], [1, '#2a2032']]));
      for (const u of [1.0, 11.0]) k.rod([[u, 0.05, RAIL], [u, 1.2, RAIL]], C.steelDark, 0.12);
      k.rod([[0.7, 1.2, RAIL], [11.3, 1.2, RAIL]], C.chrome, 0.16);
      COATS.forEach((c, i) => {
        if (i === SWUNG) return; // the one drawn live
        coat(k, ...coatAt(i), c, (hash(v.seed, i) - 0.5) * 0.3, 5.6);
      });
      // the hat shelf, its hats either side of the attendant's head
      k.box(0.6, 0.05, 13.6, 10.8, 1.6, 0.3, '#5a3a2e', { line: k.thin });
      k.cyl(2.6, 0.9, 13.9, 0.75, 0.25, '#2a2430');
      k.cyl(2.6, 0.9, 14.15, 0.48, 0.65, '#2a2430');
      k.cyl(7.0, 0.9, 13.9, 0.62, 0.7, C.red, { top: shade(C.red, 0.15) });
      k.disc(7.0, 0.9, 14.65, 0.22, '#f2e6f0', k.thin);
      k.cyl(10.3, 0.9, 13.9, 0.66, 0.6, '#d9c08a');
      k.box(10.0, 1.2, 13.9, 1.2, 0.6, 0.12, '#d9c08a', { line: k.thin, stripe: false });
      // the counter in the hatch
      k.box(0.3, 2.3, 0, 11.4, 1.6, z, C.woodDark, { stripe: false });
      for (const [a0, a1] of [[0.8, 3.9], [4.4, 7.6], [8.1, 11.2]] as const) {
        k.rect(a0, 3.91, 0.9, a1, z - 0.7, k.side(shade(C.woodDark, 0.06), 0, 1), k.thin);
        k.line([[a0 + 0.15, 3.92, 1.05], [a0 + 0.15, 3.92, z - 0.85], [a1 - 0.15, 3.92, z - 0.85]], shade(C.woodDark, 0.3), Math.max(0.7, 0.1 * k.s));
      }
      k.box(0.1, 2.1, z, 11.8, 2.0, top - z, '#2a2430', { top: '#3e3646' });
      k.line([[0.1, 4.1, z], [11.9, 4.1, z]], C.brass, Math.max(1, 0.14 * k.s));
      // on it: tickets, the bell (within the attendant's reach), a tip jar
      k.box(8.4, 2.6, top, 1.6, 1.0, 0.25, '#f2e6c8', { line: k.thin, stripe: false });
      k.box(8.5, 2.65, top + 0.25, 1.4, 0.9, 0.08, C.pink, { line: 0, stripe: false });
      k.disc(bell[0], bell[1], top + 0.05, 0.5, '#2a2430', k.thin);
      const e = k.ell(bell[0], bell[1], top + 0.1, 0.42);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.rx * 0.9, 0, Math.PI, 0);
      k.pen.closePath();
      k.paint(k.grad([bell[0] - 0.4, bell[1], top + 0.55], [bell[0] + 0.4, bell[1], top + 0.15], [[0, '#fff0b8'], [1, C.brass]]), k.thin);
      k.cyl(10.8, 3.0, top, 0.42, 0.95, '#cfe0eecc', { line: k.thin });
      k.disc(10.8, 3.0, top + 0.15, 0.32, C.brass, 0);
      // the lamp over the hatch
      k.rod([[lamp, 0.6, 14.8], [lamp, 1.6, 14.6], [lamp, 1.6, 13.8]], '#2a2430', 0.1);
    });
    // a coat swinging on the rail, just hung back while the hatch is busy
    const [cu, cv] = coatAt(SWUNG);
    coat(k, cu, cv, COATS[SWUNG], v.active ? 0.3 * Math.sin(v.t * Math.PI) : (hash(v.seed, SWUNG) - 0.5) * 0.3, 5.6);
    // the lamp's shade, glowing brighter while someone looks
    frustumUp(k, lamp, 1.6, 13.0, 0.8, 13.8, 0.3, v.active ? '#ffe6a8' : '#d8b878');
    k.halo(lamp, 1.8, 12.8, v.active ? 3.4 : 2.2, '#ffd890', v.active ? 0.55 : 0.32);
  },
};

// ── run: the neon bar ───────────────────────────────────────────────────────
// A zinc-topped bar with a pink neon lip and a glow at its foot; behind it
// a mirrored back-bar of lit bottles under a neon crown, and between them
// room for the bartender (see npcs.ts: it does the shaking and pouring);
// taps, glasses, a shaker and limes on the counter, kept low in front of
// it; velvet stools in front. Running it pumps the back-bar's light and
// sends up sparkles. `at`: where along it the bartender stands; `glass`:
// the glass it pours into.

export const BAR = { v0: 4.4, v1: 7.4, z: 5.8, at: 6.0, glass: [1.6, 4.6] as const };

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 13,
  animated: true,
  draw(v: PropView): void {
    const { v0, v1, z } = BAR;
    const k = still(v, 'run', 13, (k) => {
      k.shadow(5.5, 5.0, 6.6, 6.0, 0.32);
      // the back-bar: a cabinet, a mirror, two glass shelves of bottles
      k.box(0.6, 0.6, 0, 9.8, 2.0, 5.0, '#2a2232', { stripe: false });
      k.box(0.6, 0.6, 5.0, 9.8, 0.4, 6.6, '#1d1824', { stripe: false });
      k.rect(1.0, 1.01, 5.4, 10.0, 11.2, k.vgrad(5.5, 1.01, 5.4, 11.2, [[0, '#3a3050'], [0.5, '#5a4a78'], [1, '#2a2238']]), k.thin);
      k.poly([[2.0, 1.02, 5.6], [3.0, 1.02, 5.6], [4.6, 1.02, 11.0], [3.6, 1.02, 11.0]], '#ffffff14', 0);
      for (const sz of [7.4, 9.4]) k.box(1.0, 1.0, sz - 0.12, 9.0, 1.4, 0.12, '#cfe0ee88', { line: k.thin * 0.7, stripe: false });
      const glass: Color[] = ['#3aa05a', '#d8902a', '#7ab8e8', '#c02a4a', '#2a5ab0', '#e0c040', '#8a4ac0'];
      const labels: Color[] = [C.pink, '#f2e6c8', C.cyan, '#1d1824'];
      for (const [r, sz] of [[0, 5.0], [1, 7.4], [2, 9.4]] as const) {
        if (r) {
          k.pen.save();
          k.pen.globalCompositeOperation = 'screen';
          k.rect(1.0, 1.03, sz, 10.0, sz + 1.9, k.vgrad(5.5, 1.03, sz, sz + 1.9, [[0, withAlpha(r === 1 ? C.violet : C.cyan, 0.45)], [1, withAlpha(C.violet, 0)]]));
          k.pen.restore();
        }
        for (let i = 0; i < 6; i++) {
          const u = 1.9 + i * 1.45 + (r & 1) * 0.5;
          const c = glass[Math.floor(hash(v.seed, r * 9 + i, 3) * glass.length)];
          bottle(k, u, 1.8, sz, c, 1.6 + hash(v.seed, r * 9 + i, 4) * 0.6, 0.36, hash(v.seed, r * 9 + i, 5) < 0.6 ? labels[(r + i) % labels.length] : undefined);
        }
      }
      // the neon crown along the back-bar's top
      k.box(0.4, 0.5, 11.6, 10.2, 1.0, 0.4, '#1d1824', { line: k.thin });
      k.neon([[0.6, 1.5, 12.2], [10.4, 1.5, 12.2]], C.cyan, 0.26);
      // the counter: dark slats, a zinc top, the lip and the glow at its foot
      k.box(0.3, v0, 0, 10.4, v1 - v0, z, '#2e2230', { stripe: false });
      const pen = k.pen;
      pen.beginPath();
      for (let u = 0.9; u < 10.6; u += 0.7) {
        const [x0, y0] = k.p(u, v1, 0.6);
        const [x1, y1] = k.p(u, v1, z - 0.4);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      for (let w = v0 + 0.6; w < v1; w += 0.7) {
        const [x0, y0] = k.p(10.7, w, 0.6);
        const [x1, y1] = k.p(10.7, w, z - 0.4);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#1a1220';
      pen.lineWidth = Math.max(0.8, 0.1 * k.s);
      pen.stroke();
      k.neon([[0.4, v1 + 0.05, 0.25], [10.6, v1 + 0.05, 0.25], [10.75, v0, 0.25]], C.cyan, 0.2);
      k.box(0.1, v0 - 0.2, z, 10.8, v1 - v0 + 0.4, 0.4, '#a9a8bc', { top: '#c8c7d8' });
      k.neon([[0.15, v1 + 0.2, z + 0.15], [10.85, v1 + 0.2, z + 0.15]], C.pink, 0.22);
      // on the counter: taps, limes, glasses
      const zt = z + 0.4;
      k.cyl(0.8, 5.9, zt, 0.4, 2.3, C.chrome);
      for (const [i, c] of [C.pink, C.amber, C.cyan].entries()) k.rod([[0.5 + i * 0.3, 6.35, zt + 1.9], [0.5 + i * 0.3, 6.5, zt + 2.9]], c, 0.16);
      k.disc(3.4, 6.0, zt, 0.75, '#e8e4ee', k.thin);
      for (const [du, dv] of [[-0.25, -0.15], [0.25, 0.05], [0, 0.3]] as const) k.disc(3.4 + du, 6.0 + dv, zt + 0.25, 0.28, C.lime, k.thin * 0.7);
      // the glass the bartender pours into, on the counter's back edge
      martini(k, BAR.glass[0], BAR.glass[1], zt, C.pink, 0.42);
      tumbler(k, 9.6, 6.6, zt, C.amber, 1.1, 0.38, C.pink);
      martini(k, 8.6, 5.8, zt, C.cyan, 0.42);
      // a spare shaker, standing well out in front of the bartender
      k.cyl(7.6, 6.5, zt, 0.4, 1.5, C.chrome);
      k.cyl(7.6, 6.5, zt + 1.5, 0.3, 0.45, '#b8b8c8');
      // stools in front
      for (const u of [2.2, 5.5, 8.8]) stool(k, u, 9.4, C.velvet);
    });
    // the back-bar's light: brighter on the beat while the bar is busy
    k.halo(5.5, 1.4, 8.2, 4.4, C.violet, v.active ? 0.2 + 0.25 * kick(v.t) : 0.16);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    // sparkles off the bartender's shaker, up by its head
    const n = due(v.t, dt, 2.4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      const j = (q: number) => hash(tick, q) - 0.5;
      spawn({ kind: 'glint', x: BAR.at - 2.9 + j(1), y: 4.5 + j(2) * 0.5, z: 10.8, vx: j(3), vy: j(4), vz: 1.6 + j(5), life: 0.9, color: rgb(NEONS[tick % NEONS.length]), glow: true, gravity: 1.5 });
    }
  },
};

// ── web: the phone booth ────────────────────────────────────────────────────
// A glass phone booth edged in neon with a glowing phone over its roof, a
// payphone inside; a rack of flyers and a little palm beside it. A call
// flips the neon pink and blue on the half beat and the handset comes up.

const BOOTH = { u0: 2.4, u1: 6.4, v0: 1.4, v1: 5.4, z1: 14.0 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 18,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, v0, v1, z1 } = BOOTH;
    const k = still(v, 'web', 18, (k) => {
      k.shadow(4.4, 3.8, 3.8, 3.4, 0.32);
      // the floor plate, the back and the -u side seen through the glass
      k.box(u0 - 0.1, v0 - 0.1, 0, u1 - u0 + 0.2, v1 - v0 + 0.2, 0.35, '#2a2532', { line: k.thin });
      k.rect(u0, v0, 0.35, u1, z1, k.vgrad(u0, v0, 0, z1, [[0, '#1a2a3a'], [1, '#2a3a5a']]));
      k.poly([[u0, v0, 0.35], [u0, v1, 0.35], [u0, v1, z1], [u0, v0, z1]], '#22324a', 0);
      // the payphone on the back
      const pz = 7.2;
      k.box(3.6, v0, pz, 1.6, 0.7, 2.8, '#9a98ae', { line: k.lw, round: 0.12 });
      k.rect(3.85, v0 + 0.71, pz + 1.7, 4.95, pz + 2.45, '#a8f0d8', k.thin);
      const pen = k.pen;
      pen.beginPath();
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
        const [x, y] = k.p(4.0 + c * 0.38, v0 + 0.72, pz + 0.45 + r * 0.38);
        pen.moveTo(x + Math.max(0.5, 0.1 * k.s), y);
        pen.arc(x, y, Math.max(0.5, 0.1 * k.s), 0, Math.PI * 2);
      }
      pen.fillStyle = '#2a2532';
      pen.fill();
      k.box(4.6, v0 + 1.3, pz - 1.6, 1.1, 1.2, 0.25, '#e8e0d0', { line: k.thin });
      // the posts, the roof and the sign box on it
      for (const [u, w] of [[u0, v0], [u1, v0], [u0, v1], [u1, v1]] as const) k.box(u - 0.2, w - 0.2, 0, 0.4, 0.4, z1, '#2a2532', { line: k.thin, stripe: false });
      k.box(u0 - 0.4, v0 - 0.4, z1, u1 - u0 + 0.8, v1 - v0 + 0.8, 0.9, '#2a2532', { top: '#3a3446' });
      k.box(u0 + 0.6, (v0 + v1) / 2 - 0.5, z1 + 0.9, u1 - u0 - 1.2, 1.0, 1.9, '#2a2532', { stripe: false });
      // the flyer rack and a little palm
      k.shadow(7.8, 6.6, 1.2, 1.0, 0.25);
      k.box(7.0, 6.0, 0, 1.6, 1.2, 3.8, '#2a2532', { stripe: false });
      for (let i = 0; i < 3; i++) {
        const zz = 1.0 + i * 1.0;
        for (let j = 0; j < 2; j++) k.rect(7.15 + j * 0.72, 7.22, zz, 7.75 + j * 0.72, zz + 0.85, [C.pink, C.lime, C.cyan, C.amber, '#f3eadf', C.violet][(i * 2 + j) % 6], k.thin * 0.7);
      }
      k.shadow(1.0, 7.4, 1.0, 0.9, 0.25);
      k.cyl(1.0, 7.4, 0, 0.7, 1.4, '#1f1b26');
      for (let i = 0; i < 6; i++) {
        const [x, y] = k.p(1.0, 7.4, 1.4);
        frond(k, x, y, -Math.PI / 2 + (i - 2.5) * 0.5, (2.4 + hash(v.seed, i) * 0.8) * k.s, 0.4, i & 1 ? C.leaf : C.leafLight);
      }
    });
    const t = v.t;
    const pz = 7.2;
    // the handset on its hook, or up and swinging on its cord
    const up = v.active;
    const hs: P3 = up ? [4.4 + Math.sin(t * 2) * 0.3, v0 + 1.6, pz - 0.4] : [5.35, v0 + 0.85, pz + 1.0];
    k.line([[5.25, v0 + 0.72, pz + 0.3], [(5.25 + hs[0]) / 2, (v0 + 0.7 + hs[1]) / 2, Math.min(pz, hs[2]) - 0.6], hs], '#1d1a24', Math.max(0.8, 0.09 * k.s));
    k.rod(up ? [[hs[0] - 0.2, hs[1], hs[2] - 0.5], [hs[0] + 0.2, hs[1], hs[2] + 0.5]] : [[hs[0], hs[1], hs[2] - 0.6], [hs[0], hs[1], hs[2] + 0.6]], '#2a2532', 0.24);
    // the glass the viewer looks through
    k.rect(u0, v1, 0.35, u1, z1, '#bfe6ff1c', 0);
    k.poly([[u1, v0, 0.35], [u1, v1, 0.35], [u1, v1, z1], [u1, v0, z1]], '#bfe6ff14', 0);
    k.poly([[u0 + 0.5, v1, 2], [u0 + 1.1, v1, 2], [u0 + 2.2, v1, z1 - 1.5], [u0 + 1.6, v1, z1 - 1.5]], '#ffffff22', 0);
    k.line([[u0, v1, 0.4], [u0, v1, z1]], INK, k.thin);
    // the neon: up the front edges and round the roof; on a call it flips
    // pink and blue on the half beat
    const half = Math.floor(t / (BEAT / 2));
    const a = up && half % 2 ? C.cyan : C.pink;
    const b = up && half % 2 ? C.pink : C.cyan;
    k.neon([[u0 - 0.25, v1 + 0.25, 0.6], [u0 - 0.25, v1 + 0.25, z1 - 0.2]], a, 0.22);
    k.neon([[u1 + 0.25, v1 + 0.25, 0.6], [u1 + 0.25, v1 + 0.25, z1 - 0.2]], a, 0.22);
    k.neon([[u0 - 0.45, v1 + 0.45, z1 + 0.45], [u1 + 0.45, v1 + 0.45, z1 + 0.45], [u1 + 0.45, v0 - 0.45, z1 + 0.45]], b, 0.22);
    // the sign box's face: a phone, glowing
    const sv = (v0 + v1) / 2 + 0.52;
    const sc = up && half % 2 ? '#fff0fa' : '#f6fbff';
    k.rect(u0 + 0.8, sv, z1 + 1.05, u1 - 0.8, z1 + 2.65, sc, k.thin);
    const cu = (u0 + u1) / 2;
    k.poly([[cu - 0.9, sv + 0.01, z1 + 1.5], [cu - 0.6, sv + 0.01, z1 + 2.2], [cu + 0.6, sv + 0.01, z1 + 2.2], [cu + 0.9, sv + 0.01, z1 + 1.5], [cu + 0.5, sv + 0.01, z1 + 1.5], [cu + 0.3, sv + 0.01, z1 + 1.8], [cu - 0.3, sv + 0.01, z1 + 1.8], [cu - 0.5, sv + 0.01, z1 + 1.5]], up && half % 2 ? C.pink : C.cyan, 0);
    k.halo(cu, sv + 0.3, z1 + 1.8, 3.2, b, 0.32);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 1.8, v.seed);
    for (let i = 0; i < n; i++) spawn(note(4.4, 5.6, 9, Math.floor(v.t * 10), i));
  },
};

// ── think: the pinball and the claw ─────────────────────────────────────────
// A pinball machine with a starburst on its backglass, and a claw machine
// full of plush toys under a marquee of bulbs. Thinking there plays them:
// the ball runs and the flippers kick, the bulbs chase, the claw goes
// fishing.

const PIN = { u0: 7.0, u1: 10.6, vf: 6.4, vb: 1.6, zf: 4.1, zb: 4.9 };
const CLAW = { u0: 0.6, u1: 4.8, v0: 1.2, v1: 5.4, zb: 4.6, zg: 10.4 };

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 12,
  animated: true,
  draw(v: PropView): void {
    const P = PIN;
    const W = CLAW;
    const k = still(v, 'think', 12, (k) => {
      k.shadow(6, 3.6, 6.8, 3.8, 0.32);
      // the pinball: legs, cabinet, playfield under glass, backbox
      for (const [u, w] of [[P.u0 + 0.3, P.vb + 0.2], [P.u1 - 0.3, P.vb + 0.2], [P.u0 + 0.3, P.vf - 0.3], [P.u1 - 0.3, P.vf - 0.3]] as const) k.rod([[u, w, 0], [u, w, 2.8]], C.chrome, 0.14);
      k.box(P.u0, P.vb, 2.6, P.u1 - P.u0, P.vf - P.vb, 1.2, '#5a2a8a', { stripe: false });
      const top = (fu: number, fv: number): P3 => [P.u0 + 0.25 + (P.u1 - P.u0 - 0.5) * fu, P.vb + (P.vf - P.vb) * fv, P.zb + (P.zf - P.zb) * fv];
      k.poly([[P.u0, P.vb, 3.8], [P.u1, P.vb, 3.8], [P.u1, P.vf, 3.8], [P.u1, P.vf, P.zf], [P.u0, P.vf, P.zf], [P.u0, P.vb, P.zb]], '#4a2378', k.lw);
      k.poly([top(0, 0), top(1, 0), top(1, 1), top(0, 1)], k.grad(top(0, 0), top(1, 1), [[0, '#2a3a8a'], [1, '#6a2a9a']]), k.thin);
      // bumpers, lanes, slingshots
      for (const [fu, fv, c] of [[0.3, 0.3, C.pink], [0.7, 0.28, C.cyan], [0.5, 0.45, C.amber]] as const) {
        const [u, w, zz] = top(fu, fv);
        k.cyl(u, w, zz, 0.36, 0.3, c, { line: k.thin });
      }
      for (const fu of [0.25, 0.5, 0.75]) k.line([top(fu, 0.05), top(fu, 0.18)], '#e8e4ee', Math.max(0.7, 0.08 * k.s));
      k.poly([top(0.08, 0.68), top(0.25, 0.82), top(0.08, 0.84)], C.lime, k.thin * 0.7);
      k.poly([top(0.92, 0.68), top(0.75, 0.82), top(0.92, 0.84)], C.lime, k.thin * 0.7);
      k.box(P.u0, P.vb - 0.8, 3.8, P.u1 - P.u0, 0.9, 6.4, '#2a2232', { stripe: false });
      k.rect(P.u0 + 0.3, P.vb + 0.11, 5.0, P.u1 - 0.3, 9.8, '#1a1030', k.thin);
      // the backglass: a starburst and a ringed planet
      const bc = (P.u0 + P.u1) / 2;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        k.poly([[bc, P.vb + 0.12, 7.4], [bc + Math.cos(a) * 1.6, P.vb + 0.12, 7.4 + Math.sin(a) * 2.2], [bc + Math.cos(a + 0.3) * 1.6, P.vb + 0.12, 7.4 + Math.sin(a + 0.3) * 2.2]], i & 1 ? C.violet : C.pink, 0);
      }
      k.ring(bc, P.vb + 0.13, 7.4, 0.8, C.amber, k.thin);
      k.line([[bc - 1.2, P.vb + 0.14, 7.0], [bc + 1.2, P.vb + 0.14, 7.8]], C.cyan, Math.max(0.8, 0.14 * k.s));
      // the claw machine: cabinet, control panel, glass, toys, marquee
      k.box(W.u0, W.v0, 0, W.u1 - W.u0, W.v1 - W.v0, W.zb, '#d8345a', { stripe: false });
      k.rect(W.u0 + 0.5, W.v1 + 0.01, 0.6, W.u1 - 0.5, 2.6, '#a82246', k.thin);
      k.box(W.u0 + 0.6, W.v1, 3.4, W.u1 - W.u0 - 1.2, 0.8, 0.5, '#2a2232', { line: k.thin });
      k.rod([[W.u0 + 1.5, W.v1 + 0.4, 3.9], [W.u0 + 1.5, W.v1 + 0.45, 4.7]], '#2a2232', 0.1);
      k.disc(W.u0 + 1.5, W.v1 + 0.45, 4.75, 0.22, C.hot, k.thin);
      k.disc(W.u1 - 1.3, W.v1 + 0.4, 3.92, 0.28, C.lime, k.thin);
      k.rect(W.u0 + 0.3, W.v0 + 0.02, W.zb, W.u1 - 0.3, W.zg, k.vgrad((W.u0 + W.u1) / 2, W.v0, W.zb, W.zg, [[0, '#2a1a3a'], [1, '#4a2a5a']]));
      const toys: Color[] = [C.pink, '#f2d04a', '#7ad0f0', '#b8f080', '#f0a0c0', '#c8a0f0', '#f6efe6'];
      for (let i = 0; i < 9; i++) {
        const u = W.u0 + 0.8 + (i % 4) * 0.85 + (Math.floor(i / 4) & 1) * 0.4;
        const w = W.v0 + 1.0 + Math.floor(i / 4) * 1.2;
        plush(k, u, w, W.zb + 0.1 + (i % 3) * 0.15, 0.42, toys[i % toys.length], i % 3);
      }
      for (const [u, w] of [[W.u0, W.v0], [W.u1, W.v0], [W.u0, W.v1], [W.u1, W.v1]] as const) k.rod([[u, w, W.zb], [u, w, W.zg]], '#d8345a', 0.16);
      k.box(W.u0 - 0.1, W.v0 - 0.1, W.zg, W.u1 - W.u0 + 0.2, W.v1 - W.v0 + 0.2, 1.3, '#d8345a', { top: '#e85a7a' });
      k.rod([[W.u0 + 0.4, W.v0 + 0.5, W.zg - 0.3], [W.u1 - 0.4, W.v0 + 0.5, W.zg - 0.3]], C.steel, 0.1);
    });
    const t = v.t;
    const act = v.active;
    // the pinball's backbox lights and its ball
    const top = (fu: number, fv: number): P3 => [P.u0 + 0.25 + (P.u1 - P.u0 - 0.5) * fu, P.vb + (P.vf - P.vb) * fv, P.zb + (P.zf - P.zb) * fv + 0.15];
    const step = act ? Math.floor(t * 8) : 0;
    for (let i = 0; i < 6; i++) {
      const lit = act ? (i + step) % 3 === 0 : i % 3 === 0;
      k.disc(P.u0 + 0.6 + i * 0.48, P.vb + 0.3, 9.95, 0.16, lit ? C.amber : '#5a4a3a', 0);
    }
    const flip = act && Math.sin(t * 7) > 0.6 ? 0.5 : 0;
    k.line([top(0.32, 0.86), top(0.45, 0.9 - flip * 0.12)], '#f6efe6', Math.max(1, 0.2 * k.s));
    k.line([top(0.68, 0.86), top(0.55, 0.9 - flip * 0.12)], '#f6efe6', Math.max(1, 0.2 * k.s));
    if (act) {
      const ph = (t * 0.6) % 1;
      const [bu, bv, bz] = top(0.5 + 0.35 * Math.sin(ph * Math.PI * 4), 0.15 + 0.65 * Math.abs(Math.sin(ph * Math.PI * 2)));
      k.disc(bu, bv, bz + 0.12, 0.17, '#e8ecf4', k.thin * 0.7);
    }
    k.poly([top(0, 0), top(0.22, 0), top(0.5, 1), top(0.28, 1)], '#ffffff12', 0);
    // the marquee's bulbs, chasing while played
    for (let i = 0; i < 7; i++) {
      const lit = act ? (i + Math.floor(t * 10)) % 2 === 0 : true;
      const [x, y] = k.p(W.u0 + 0.35 + i * 0.66, W.v1 + 0.11, W.zg + 0.65);
      k.pen.beginPath();
      k.pen.arc(x, y, Math.max(1, 0.2 * k.s), 0, Math.PI * 2);
      k.pen.fillStyle = lit ? '#fff2b8' : '#8a6a4a';
      k.pen.fill();
    }
    // the claw on its gantry, down among the toys while played
    const cu = act ? (W.u0 + W.u1) / 2 + Math.sin(t * 0.9) * 1.3 : W.u1 - 1.0;
    const cv = act ? 3.4 + Math.cos(t * 0.7) * 0.9 : W.v0 + 1.0;
    const drop = act ? Math.max(0, Math.sin(t * 1.3)) * 3.2 : 0;
    const cz = W.zg - 0.6 - drop;
    k.line([[cu, cv, W.zg - 0.3], [cu, cv, cz + 0.6]], '#c8c6d6', Math.max(0.7, 0.07 * k.s));
    k.cyl(cu, cv, cz + 0.4, 0.28, 0.35, C.steel, { line: k.thin });
    for (const sx of [-1, 0, 1]) k.line([[cu, cv, cz + 0.4], [cu + sx * 0.4, cv + (sx ? 0 : 0.35), cz], [cu + sx * 0.2, cv + (sx ? 0 : 0.2), cz - 0.3]], '#c8c6d6', Math.max(0.8, 0.09 * k.s));
    // the glass front over the claw and toys
    k.rect(W.u0 + 0.3, W.v1, W.zb, W.u1 - 0.3, W.zg, '#c8e8ff16', 0);
    k.poly([[W.u0 + 0.6, W.v1, W.zb + 0.5], [W.u0 + 1.2, W.v1, W.zb + 0.5], [W.u0 + 2.4, W.v1, W.zg - 0.6], [W.u0 + 1.8, W.v1, W.zg - 0.6]], '#ffffff1c', 0);
    k.halo((W.u0 + W.u1) / 2, W.v1, W.zg + 0.6, 2.6, '#ffe6a0', act ? 0.42 : 0.24);
  },
};

// ── idle: the lounge ────────────────────────────────────────────────────────
// A U of tufted velvet banquette round a low black table: champagne on
// ice, coupes, a candle; cushions and a pouf. Where tired agents sink in.

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    const V = C.velvet;
    k.shadow(7.5, 4.8, 7.6, 5.0, 0.3);
    // the back run: plinth, seat, tufted back
    k.box(1.0, 0.6, 0, 13.0, 3.2, 0.5, '#1d1824', { line: k.thin, stripe: false });
    k.box(1.0, 0.6, 0.5, 13.0, 3.2, 1.6, V, { round: 0.4 });
    k.box(1.0, 0.4, 2.1, 13.0, 1.3, 4.0, V, { round: 0.6 });
    if (k.fine) for (let r = 0; r < 2; r++) for (let i = 0; i < 12; i++) k.disc(1.8 + i * 1.05 + (r & 1) * 0.5, 1.72, 3.2 + r * 1.3, 0.11, shade(V, -0.35), 0);
    // the arms of the U coming forward
    for (const [u0, back] of [[1.0, 1.0], [11.6, 12.9]] as const) {
      k.box(u0, 3.8, 0, 2.4, 5.4, 0.5, '#1d1824', { line: k.thin, stripe: false });
      k.box(u0, 3.8, 0.5, 2.4, 5.4, 1.6, V, { round: 0.4 });
      k.box(back, 3.6, 2.1, 1.1, 5.6, 3.4, V, { round: 0.5 });
    }
    // cushions
    k.box(3.0, 1.75, 2.1, 2.2, 0.7, 2.1, C.cyan, { round: 0.6 });
    k.box(9.5, 1.75, 2.1, 2.0, 0.7, 1.9, C.amber, { round: 0.6 });
    k.box(2.1, 4.5, 2.1, 0.7, 2.0, 1.9, C.pink, { round: 0.6 });
    // the table: black lacquer on a gold foot
    const cu = 7.4;
    const cv = 6.2;
    k.shadow(cu, cv, 2.6, 2.6, 0.25);
    k.cyl(cu, cv, 0, 1.0, 0.2, C.brass);
    k.cyl(cu, cv, 0.2, 0.32, 1.7, C.brass);
    k.cyl(cu, cv, 1.9, 2.4, 0.4, '#1d1824', { top: '#2e2838' });
    const e = k.ell(cu, cv, 2.31, 2.25);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, Math.PI * 0.95, Math.PI * 1.45);
    k.pen.strokeStyle = '#ffffff30';
    k.pen.lineWidth = Math.max(0.8, 0.14 * k.s);
    k.pen.stroke();
    const z = 2.3;
    // champagne on ice, coupes, a candle
    k.cyl(cu - 0.6, cv - 0.6, z, 0.75, 1.3, C.chrome);
    k.disc(cu - 0.6, cv - 0.6, z + 1.25, 0.6, '#e8f4ff', 0);
    bottle(k, cu - 0.6, cv - 0.6, z + 0.6, '#2a5a3a', 2.4, 0.32, C.amber);
    martini(k, cu + 0.9, cv - 0.4, z, C.amber, 0.38);
    martini(k, cu + 0.3, cv + 1.0, z, C.pink, 0.38);
    k.cyl(cu - 0.9, cv + 1.0, z, 0.32, 0.6, '#d0e0f0aa', { line: k.thin });
    const [fx, fy] = k.p(cu - 0.9, cv + 1.0, z + 0.85);
    k.pen.beginPath();
    k.pen.ellipse(fx, fy, 0.12 * k.s, 0.24 * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = '#ffc04a';
    k.pen.fill();
    k.halo(cu - 0.9, cv + 1.0, z + 0.8, 2, '#ffb050', 0.5);
    // the pouf in front
    k.shadow(cu, 9.7, 1.3, 1.0, 0.22);
    k.cyl(cu, 9.7, 0, 1.05, 1.5, C.plum, { top: shade(C.plum, 0.2) });
  },
};

// ── entrance: the door ──────────────────────────────────────────────────────
// A riveted steel door under a caged lamp and a neon arrow, stairs going up
// to the street behind it; a velvet rope on brass posts, the bouncer's
// stool and clipboard, a camera watching. Someone coming or going swings it
// open and the light from the stairs spills in.

const DOOR = { u0: 3.4, u1: 8.6, h: 12.6, hv: 0.3 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = DOOR;
    const k = still(v, 'entrance', 21, (k) => {
      // the stairwell beyond: steps going up into a warm pink light
      const out = -0.6;
      k.rect(u0, out, 0, u1, h, k.vgrad(u0, out, 0, h, [[0, '#3a1a3a'], [0.6, '#7a2a5a'], [1, '#c84a7a']]));
      for (let i = 0; i < 9; i++) {
        const z0 = i * 1.4;
        k.rect(u0, out, z0, u1, z0 + 0.35, withAlpha('#ffb0d0', 0.12 + i * 0.04), 0);
        k.line([[u0, out, z0 + 0.35], [u1, out, z0 + 0.35]], '#2a1028', Math.max(0.7, 0.08 * k.s));
      }
      k.halo((u0 + u1) / 2, out, h - 1.5, 3, '#ffc0d8', 0.4);
      // the reveal and the frame
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#2a2232', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#1d1824', 0);
      k.box(u0 - 0.6, 0, 0, 0.6, 0.5, h + 0.8, '#3a3446');
      k.box(u1, 0, 0, 0.6, 0.5, h + 0.8, '#3a3446');
      k.box(u0 - 0.9, 0, h, u1 - u0 + 1.8, 0.6, 0.8, '#3a3446');
      // the caged lamp, the neon arrow
      const cu = (u0 + u1) / 2;
      k.wash(cu, 0.05, h + 2.2, 3, 2.4, '#ff6a6a', 0.35);
      k.box(cu - 0.35, 0, h + 1.4, 0.7, 0.5, 0.5, '#2a2232', { line: k.thin });
      k.ring(cu, 0.7, h + 1.25, 0.42, '#ff8a6a', k.thin);
      for (const da of [-0.3, 0, 0.3]) k.line([[cu + da, 0.75, h + 0.85], [cu + da, 0.75, h + 1.65]], '#2a2232', Math.max(0.7, 0.08 * k.s));
      k.halo(cu, 0.8, h + 1.25, 1.8, '#ff8a6a', 0.55);
      k.wash(cu, 0.05, h + 5.6, 2.6, 2.6, C.pink, 0.3);
      k.neon([[cu, 0.45, h + 7.4], [cu, 0.45, h + 4.3]], C.pink, 0.26);
      k.neon([[cu - 1.1, 0.45, h + 5.4], [cu, 0.45, h + 4.2], [cu + 1.1, 0.45, h + 5.4]], C.pink, 0.26);
      // the mat inside the door
      k.poly([[u0 + 0.2, 0.6, 0.05], [u1 - 0.2, 0.6, 0.05], [u1 - 0.2, 3.4, 0.05], [u0 + 0.2, 3.4, 0.05]], '#2a2430', k.thin, 0.2);
      // the camera up in the corner, the intercom
      k.rod([[1.4, 0, 17.6], [1.4, 0.8, 17.6]], '#2a2232', 0.12);
      k.box(1.0, 0.6, 16.6, 0.8, 1.6, 0.8, '#d8d6e2', { line: k.thin, round: 0.15 });
      k.disc(1.4, 2.25, 17.0, 0.18, '#ff3b5c', 0);
      k.box(1.6, 0, 7.6, 0.9, 0.3, 1.4, '#9a98ae', { line: k.thin });
      // the rope on its posts, the stool, the clipboard
      for (const u of [9.9, 13.8]) {
        k.shadow(u, 2.7, 0.8, 0.6, 0.25);
        k.disc(u, 2.7, 0.05, 0.6, C.brass, k.thin);
        k.cyl(u, 2.7, 0.05, 0.14, 3.6, C.brass, { line: k.thin });
        k.disc(u, 2.7, 3.75, 0.26, C.brass, k.thin);
      }
      const rope: P3[] = [];
      for (let i = 0; i <= 10; i++) {
        const f = i / 10;
        rope.push([9.9 + 3.9 * f, 2.7, 3.4 - Math.sin(f * Math.PI) * 1.2]);
      }
      k.rod(rope, '#b01a3a', 0.2);
      stool(k, 12.3, 1.1, '#2a2232', 4.6);
      k.rod([[11.4, 0, 8.4], [11.4, 0.35, 8.4]], C.steel, 0.08);
      k.box(10.9, 0.3, 6.2, 1.0, 0.15, 1.9, '#8a5a3a', { line: k.thin, stripe: false });
      k.rect(11.0, 0.46, 6.35, 11.8, 7.8, '#f3eadf', 0);
      k.line([[11.2, 0.47, 7.0], [11.6, 0.47, 7.0]], '#2a2232', Math.max(0.6, 0.06 * k.s));
    });
    const th = v.active ? 0.62 + 0.05 * Math.sin(v.t * 2.2) : 0;
    if (th > 0) k.pool((u0 + u1) / 2, 2.0, 3.2, 2.0, '#ff8ab8', 0.3);
    doorLeaf(k, th);
  },
};

// The steel door on its hinge at u0, opened by th radians into the room.
function doorLeaf(k: Kit, th: number): void {
  const { u0, u1, h, hv } = DOOR;
  const w = u1 - u0 - 0.1;
  const du = Math.cos(th);
  const dv = Math.sin(th);
  const P = (s: number, z: number, n = 0): P3 => [u0 + 0.05 + du * s - dv * n, hv + dv * s + du * n, z];
  const steel = '#3e3650';
  const face = k.side(steel, -dv, du, 0.16);
  if (th > 0.05) k.poly([P(w, 0), P(w, 0, -0.35), P(w, h, -0.35), P(w, h)], k.side(steel, du, dv, 0.16), k.thin);
  k.poly([P(0, 0), P(w, 0), P(w, h), P(0, h)], face, k.lw);
  // studded edge, the slot hatch, a push plate
  const pen = k.pen;
  pen.beginPath();
  for (const s of [0.35, w - 0.35]) {
    for (let z = 0.8; z < h - 0.3; z += 1.4) {
      const [x, y] = k.p(...P(s, z, 0.02));
      pen.moveTo(x + Math.max(0.6, 0.1 * k.s), y);
      pen.arc(x, y, Math.max(0.6, 0.1 * k.s), 0, Math.PI * 2);
    }
  }
  pen.fillStyle = shade(face, 0.3);
  pen.fill();
  k.poly([P(w / 2 - 0.9, 9.6, 0.03), P(w / 2 + 0.9, 9.6, 0.03), P(w / 2 + 0.9, 10.3, 0.03), P(w / 2 - 0.9, 10.3, 0.03)], '#120e18', k.thin);
  k.poly([P(w - 1.2, 5.2, 0.03), P(w - 0.6, 5.2, 0.03), P(w - 0.6, 7.2, 0.03), P(w - 1.2, 7.2, 0.03)], C.steel, k.thin);
  k.line([P(0.4, 0.5, 0.03), P(w - 0.4, 0.5, 0.03)], shade(face, -0.25), Math.max(1, 0.25 * k.s));
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
