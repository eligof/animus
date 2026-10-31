import { shade } from '../../art/iso.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { barrel, bench, blot, fillPts, flames, furry, hull, log, pebble, ring, sack, shieldFace, stoneBlock } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, due, hash, kitOf, still, wisp } from './kit.ts';

// The hall's furniture between the stations, all of it standing by the
// walls or the stations: a long raised hearth of fieldstones against a
// wall with a cauldron on a tripod and a stack of firewood; wall benches
// under round shields, mead casks on a cradle, weapon racks and a bound
// chest along the walls; barrels and sacks of stores, a woodpile with its
// chopping block, a tanning frame with a hide stretched in it, a wolf-pelt
// rug and iron braziers on the floor by them. The hearth and the braziers
// are lit (their flames always moving, their still parts drawn once
// through the sprite cache); the rest is drawn once into the scene's
// static layer.

type Spawn = (p: Particle) => void;

// ── the hearth ──────────────────────────────────────────────────────────────
// A long raised pit of fieldstones against the wall, soot on the planks
// behind it: a bed of coals, split logs along it and flames licking along
// them; a cauldron hung from an iron tripod over its near end and a stack
// of firewood beside it. Embers and smoke rise off it, steam off the pot.

const PIT = { u0: 1.0, u1: 16.0, v0: 1.2, v1: 7.4, rim: 1.1, h: 2.0, bed: 1.1 };
const POT = { u: 13.2, v: 4.3, z: 2.9, r: 1.35, h: 2.2 };
const APEX: P3 = [13.2, 4.3, 11.2];
// the tripod's feet: the far one behind the pot, two in front
const FEET: P3[] = [[11.0, 0.5, 0], [16.9, 3.0, 0], [12.4, 8.6, 0]];
// where the flames stand along the logs
const FIRE = [3.4, 5.6, 7.8, 10.0];

const hearth: PropArt = {
  len: 22,
  dep: 9,
  height: 12,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const { u0, u1, v0, v1, rim, h, bed } = PIT;
    const cv = (v0 + v1) / 2;
    const k = still(v, 'hearth-back', 12, (k) => {
      // soot and the fire's warmth on the planks behind it
      if (!v.island) {
        blot(k, 8.6, 0.05, 4.6, 8.2, 6.6, '#120804', 0.5);
        blot(k, 8.6, 0.06, 3.6, 7.4, 5.4, '#ff8a3d', 0.22, 'screen');
      }
      k.shadow(10.8, 4.4, 10.8, 4.3, 0.32);
      // the far rims: along the wall and at the far end
      rimBlock(k, u0, v0, u1 - u0, rim, h, v.seed);
      rimBlock(k, u0, v0 + rim, rim, v1 - v0 - 2 * rim, h, v.seed + 1);
      // the bed: ash going to glowing coals in the middle
      const [i0, i1, j0, j1] = [u0 + rim, u1 - rim, v0 + rim, v1 - rim];
      k.poly([[i0, j0, bed], [i1, j0, bed], [i1, j1, bed], [i0, j1, bed]], k.grad([i0, cv, bed], [i1, cv, bed], [[0, '#4a3026'], [0.25, '#6a2c16'], [0.6, '#7a3214'], [1, '#3a2620']]), k.thin);
      const pen = k.pen;
      pen.beginPath();
      for (let i = 0; i < 30; i++) {
        const e = k.ell(i0 + 0.5 + hash(v.seed, i, 1) * (i1 - i0 - 1), j0 + 0.4 + hash(v.seed, i, 2) * (j1 - j0 - 0.8), bed + 0.02, 0.28 + hash(v.seed, i, 3) * 0.22);
        pen.moveTo(e.cx + e.rx, e.cy);
        pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      }
      pen.fillStyle = C.ember;
      pen.fill();
      k.pool(7.2, cv, 6.4, 2.2, '#ffb050', 0.5, bed);
      // split logs laid along the pit, one across them
      log(k, 2.6, 11.6, 3.5, bed + 0.5, 0.5, '#6a4428');
      log(k, 3.2, 12.4, 5.0, bed + 0.5, 0.5, '#5e3c24');
      log(k, 6.0, 9.6, 4.3, bed + 1.2, 0.42, '#734a2c');
      // the tripod's far leg, behind the pot
      k.rod([APEX, FEET[0]], C.ironDark, 0.22);
    });
    // the flames along the logs and under the pot, always moving
    const t = v.t;
    for (const [i, u] of FIRE.entries()) {
      const sc = 0.62 + 0.18 * Math.sin(i * 2.1 + 0.5) ** 2;
      flames(k, u + Math.sin(t * 1.7 + i) * 0.15, cv, bed + 0.6, sc, t * 2.2 + i * 1.9, 0.9);
    }
    flames(k, POT.u - 0.3, cv, bed + 0.4, 0.42, t * 2.6 + 4, 0.8);
    k.halo(7.4, cv, 3.6, 6.4, '#ffb050', 0.24 + 0.06 * Math.sin(t * 6.1));
    still(v, 'hearth-front', 12, (k) => {
      // the near rims
      rimBlock(k, u1 - rim, v0 + rim, rim, v1 - v0 - 2 * rim, h, v.seed + 2);
      rimBlock(k, u0, v1 - rim, u1 - u0, rim, h, v.seed + 3);
      // the cauldron on its chain
      const top = POT.z + POT.h;
      k.line([APEX, [POT.u, POT.v, top + 1.4]], C.ironDark, Math.max(1, 0.14 * k.s));
      k.line([[POT.u - POT.r * 0.85, POT.v, top + 0.1], [POT.u, POT.v, top + 1.4], [POT.u + POT.r * 0.85, POT.v, top + 0.1]], C.ironDark, Math.max(1, 0.12 * k.s));
      cauldron(k, POT.u, POT.v, POT.z, POT.r, POT.h);
      // the near legs of the tripod
      for (const f of FEET.slice(1)) k.rod([APEX, f], C.ironDark, 0.22);
      k.disc(APEX[0], APEX[1], APEX[2], 0.32, C.ironDark, k.thin);
      // the firewood stacked by it, cut ends to the room
      const rows: Array<[number, number]> = [[1.6, 0.68], [2.95, 0.68], [4.3, 0.68], [5.65, 0.68], [2.27, 1.85], [3.62, 1.85], [4.97, 1.85], [2.95, 3.0], [4.3, 3.0]];
      k.shadow(19.4, 3.8, 2.8, 3.2, 0.26);
      for (const [i, [w, z]] of rows.entries()) log(k, 17.6 + hash(v.seed, i, 5) * 0.4, 21.4 + hash(v.seed, i, 6) * 0.3, w, z, 0.66, ['#7a5232', '#6a4428', '#86593a'][i % 3]);
    });
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const cv = (PIT.v0 + PIT.v1) / 2;
    const n = due(v.t, dt, 4, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 20) + i;
      const j = (q: number) => hash(tick, q, 7) - 0.5;
      spawn({ kind: 'ember', x: 7 + j(1) * 9, y: cv + j(2) * 2.4, z: 3 + j(3), vx: j(4) * 0.8, vy: j(5) * 0.8, vz: 2.2 + j(6) * 1.4, life: 1.1 + j(7) * 0.6, color: [255, 150, 60], glow: true, gravity: -0.3 });
    }
    if (due(v.t, dt, 0.8, v.seed + 1)) {
      const tick = Math.floor(v.t * 10);
      const j = (q: number) => hash(tick, q, 8) - 0.5;
      spawn({ kind: 'smoke', x: 7 + j(1) * 7, y: cv + j(2), z: 5, vx: j(3) * 0.4, vy: j(4) * 0.4, vz: 1.8 + j(5) * 0.6, life: 2.4, color: [120, 108, 100], glow: false, gravity: 0 });
    }
    if (due(v.t, dt, 0.6, v.seed + 2)) spawn(wisp(POT.u, POT.v, POT.z + POT.h + 0.3, Math.floor(v.t * 10), 3));
  },
};

// A stretch of the pit's rim: fieldstones in the sides, dressed cap stones
// along its top with soot on them.
function rimBlock(k: Kit, u0: number, v0: number, du: number, dv: number, h: number, seed: number): void {
  stoneBlock(k, u0, v0, 0, du, dv, h, seed, '#7a7870');
  const long = du >= dv;
  const n = Math.max(1, Math.round((long ? du : dv) / 1.7));
  const seams: Array<[P3, P3]> = [];
  for (let i = 1; i < n; i++) {
    const f = i / n + (hash(seed, i, 9) - 0.5) * 0.06;
    seams.push(long ? [[u0 + du * f, v0, h + 0.01], [u0 + du * f, v0 + dv, h + 0.01]] : [[u0, v0 + dv * f, h + 0.01], [u0 + du, v0 + dv * f, h + 0.01]]);
  }
  k.segs(seams, '#2a1a1099', Math.max(0.8, k.thin * 0.8));
  k.line(long ? [[u0 + 0.2, v0 + dv - 0.2, h + 0.01], [u0 + du - 0.2, v0 + dv - 0.2, h + 0.01]] : [[u0 + du - 0.2, v0 + 0.2, h + 0.01], [u0 + du - 0.2, v0 + dv - 0.2, h + 0.01]], '#b8b4a855', Math.max(0.8, 0.14 * k.s));
}

// An iron cauldron at (cu, cv) from z up h, radius r: a round belly, a
// rolled rim, a stew of broth inside.
function cauldron(k: Kit, cu: number, cv: number, z: number, r: number, h: number): void {
  const body = hull([...ring(k, [cu, cv, z + 0.15], [0, 0, 1], r * 0.55, 16), ...ring(k, [cu, cv, z + h * 0.45], [0, 0, 1], r * 1.08, 22), ...ring(k, [cu, cv, z + h], [0, 0, 1], r * 0.92, 22)]);
  const xs = body.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, '#5a5550');
  g.addColorStop(0.35, '#3a3530');
  g.addColorStop(1, '#221e1a');
  fillPts(k, body, g, k.lw);
  k.disc(cu, cv, z + h, r * 0.95, '#2a2420', k.lw);
  k.disc(cu, cv, z + h - 0.05, r * 0.72, '#8a6a3a', 0);
  if (k.fine) for (const [du, dv] of [[-0.3, -0.2], [0.35, 0.15]] as const) k.disc(cu + du, cv + dv, z + h - 0.03, 0.18, '#b0905a', 0);
  k.line([[cu - r * 0.7, cv + r * 0.45, z + h * 0.75], [cu - r * 0.3, cv + r * 0.7, z + h * 0.6]], '#8a8580', Math.max(0.8, 0.12 * k.s));
}

// ── a wall bench ────────────────────────────────────────────────────────────
// A plank bench along the wall under three round shields hung on pegs (each
// a plain colour, split or ringed), a fur thrown over one end and a
// tankard left on it.

const wallBench: PropArt = {
  len: 14,
  dep: 4,
  height: 15,
  draw(v: PropView): void {
    const k = kitOf(v);
    for (const [i, a] of [3.0, 7.0, 11.0].entries()) {
      const z = 11.7 + (hash(v.seed, i, 3) - 0.5) * 0.7;
      k.rod([[a, 0.02, z + 1.6], [a, 0.35, z + 1.6]], C.timberDark, 0.2);
      shieldFace(k, a, 0.3, z, 1.85, v.seed * 7 + i * 13);
    }
    bench(k, 0.6, 13.4, 0.6, 3.2, 3.4);
    // a fur over the near end, hanging off the front
    const zs = 3.42;
    furry(k, [[9.2, 0.7, zs], [13.3, 0.6, zs], [13.4, 3.25, zs], [13.2, 3.4, 2.0], [11.4, 3.5, 1.5], [9.5, 3.4, 2.2], [9.25, 3.25, zs]], k.grad([9.2, 0.7, zs], [13.3, 3.4, 1.6], [[0, '#c0a682'], [0.5, C.fur], [1, C.furDark]]), v.seed, 0.24, k.lw);
    if (k.fine) k.line([[10.0, 3.3, 2.6], [12.6, 3.3, 2.5]], C.furDark, 0.07 * k.s);
    // a tankard
    tankard(k, 3.6, 1.9, 3.4);
  },
};

// A wooden tankard with an iron hoop and a handle, mead in it.
function tankard(k: Kit, u: number, w: number, z: number): void {
  k.rod([[u + 0.48, w, z + 0.85], [u + 0.85, w, z + 0.65], [u + 0.48, w, z + 0.25]], '#6a4a2e', 0.13);
  k.cyl(u, w, z, 0.48, 1.0, '#8a6038', { top: '#9a7048' });
  k.disc(u, w, z + 0.98, 0.36, '#e8c060', 0);
  k.line([[u - 0.47, w + 0.1, z + 0.3], [u + 0.1, w + 0.48, z + 0.3]], C.ironDark, Math.max(0.7, 0.1 * k.s));
}

// ── mead casks ──────────────────────────────────────────────────────────────
// Three casks on a timber cradle against the wall, two below and one in
// the saddle between them, their heads to the room with a wooden tap in
// each of the lower ones; a tankard on the cradle's end.

const casks: PropArt = {
  len: 12,
  dep: 5,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 2.6, 6.2, 2.6, 0.3);
    k.box(0.4, 1.0, 0, 11.2, 0.8, 1.1, C.timberDark, { line: k.thin });
    const low = [[3.0, 2.0], [8.7, 2.0]] as const;
    for (const [u, r] of low) caskBody(k, u, 0.6, 4.4, 2.6, r, v.seed + u);
    caskBody(k, 5.85, 1.0, 4.0, 6.05, 1.75, v.seed + 3);
    caskHead(k, 5.85, 4.0, 6.05, 1.75, false);
    k.box(0.4, 3.3, 0, 11.2, 0.8, 1.1, C.timberDark, { line: k.thin });
    for (const [u, r] of low) caskHead(k, u, 4.4, 2.6, r, true);
    tankard(k, 11.1, 2.3, 1.1);
  },
};

// A cask lying along v from w0 to w1, its axis at (u, z), radius r: bellied
// staves, iron hoops.
function caskBody(k: Kit, u: number, w0: number, w1: number, z: number, r: number, seed: number): void {
  const mid = (w0 + w1) / 2;
  const n: P3 = [0, 1, 0];
  const body = hull([...ring(k, [u, w0, z], n, r * 0.9, 20), ...ring(k, [u, mid, z], n, r, 24), ...ring(k, [u, w1, z], n, r * 0.9, 20)]);
  const ys = body.map((p) => p[1]);
  const wood = ['#8a5e38', '#7e5532', '#946640'][Math.floor(hash(seed, 1) * 3)];
  const g = k.pen.createLinearGradient(0, Math.min(...ys), 0, Math.max(...ys));
  g.addColorStop(0, shade(wood, 0.16));
  g.addColorStop(0.5, wood);
  g.addColorStop(1, shade(wood, -0.28));
  fillPts(k, body, g, k.lw);
  // the hoops: the half of each facing the viewer
  for (const w of [w0 + 0.55, mid - 0.4, mid + 0.4, w1 - 0.55]) {
    const rr = r * (w > w0 + 1 && w < w1 - 1 ? 1.0 : 0.94);
    const arc: P3[] = [];
    for (let i = 0; i <= 14; i++) {
      const ph = -0.69 + (i / 14) * Math.PI;
      arc.push([u + Math.cos(ph) * rr, w, z + Math.sin(ph) * rr]);
    }
    k.line(arc, INK, Math.max(1.6, 0.34 * k.s));
    k.line(arc, C.ironDark, Math.max(1, 0.2 * k.s));
  }
}

// A cask's head at w: boards across, a rim, a tap low on it if `tap`.
function caskHead(k: Kit, u: number, w: number, z: number, r: number, tap: boolean): void {
  const n: P3 = [0, 1, 0];
  fillPts(k, ring(k, [u, w, z], n, r * 0.9, 24), '#b08250', k.lw);
  fillPts(k, ring(k, [u, w + 0.01, z], n, r * 0.74, 20), '#c39260', 0);
  if (k.fine) {
    for (const dz of [-0.5, 0, 0.5]) k.line([[u - r * 0.7 * Math.sqrt(1 - (dz / r) ** 2 * 3), w + 0.02, z + dz * r * 0.9], [u + r * 0.7 * Math.sqrt(1 - (dz / r) ** 2 * 3), w + 0.02, z + dz * r * 0.9]], '#8a6038', 0.06 * k.s);
  }
  if (tap) {
    k.rod([[u, w, z - r * 0.45], [u, w + 0.5, z - r * 0.45], [u, w + 0.55, z - r * 0.62]], '#6a4a2e', 0.2);
    k.disc(u, w + 0.15, z - r * 0.3, 0.16, '#4a3020', 0);
  }
}

// ── a chest ─────────────────────────────────────────────────────────────────
// A plank chest bound in iron with a rounded lid and a hasp, a folded fur
// and a rolled blanket on it.

const chest: PropArt = {
  len: 7,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.5, 2.0, 3.6, 2.0, 0.3);
    k.box(0.6, 0.5, 0, 5.8, 3.0, 2.5, C.timber, { stripe: false });
    k.box(0.5, 0.4, 2.5, 6.0, 3.2, 1.0, shade(C.timber, 0.06), { round: 0.35 });
    // iron straps over the lid and down the front, a hasp
    for (const u of [1.5, 5.3]) {
      k.line([[u, 3.62, 3.4], [u, 3.62, 0.15]], INK, Math.max(1.6, 0.42 * k.s));
      k.line([[u, 3.62, 3.4], [u, 3.62, 0.15]], C.iron, Math.max(1, 0.26 * k.s));
      k.line([[u, 0.4, 3.52], [u, 3.6, 3.52]], C.iron, Math.max(1, 0.26 * k.s));
    }
    k.rect(3.1, 1.9, 3.9, 2.9, 3.61, C.ironDark, k.thin);
    k.disc(3.5, 3.62, 2.2, 0.16, '#c3c7cd', 0);
    // a folded fur on it
    furry(k, [[1.0, 0.8, 3.52], [4.4, 0.7, 3.52], [4.5, 2.8, 3.52], [1.1, 2.9, 3.52]], k.grad([1, 0.8, 3.5], [4.5, 2.9, 3.5], [[0, '#c0a682'], [1, C.furDark]]), v.seed, 0.2, k.lw);
    // a rolled red blanket
    log(k, 4.6, 6.2, 1.9, 4.05, 0.5, C.redDark);
  },
};

// ── stores ──────────────────────────────────────────────────────────────────
// Two barrels and a basket of apples at the back, sacks of grain slumped in
// front of them.

const stores: PropArt = {
  len: 10,
  dep: 8,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(5, 4, 5, 3.8, 0.24);
    barrel(k, 2.6, 2.4, 1.7, 4.6);
    barrel(k, 6.1, 1.9, 1.45, 3.8, '#7e5532');
    sack(k, 2.9, 5.9, 1.35, 2.7);
    // a basket of apples
    k.shadow(8.3, 2.6, 1.3, 1.2, 0.26);
    k.cyl(8.3, 2.6, 0, 1.15, 1.3, '#a8844e', { top: '#5a3a20' });
    if (k.fine) for (const z of [0.45, 0.9]) k.line([[7.3, 3.2, z], [8.3, 3.75, z], [9.3, 3.2, z]], '#7a5a32', 0.07 * k.s);
    for (const [du, dv, c] of [[-0.45, -0.25, C.red], [0.35, -0.35, '#b8402e'], [-0.1, 0.35, C.red], [0.5, 0.3, '#c8a040']] as const) pebble(k, 8.3 + du, 2.6 + dv, 1.2, 0.42, 0.62, c, k.thin);
    sack(k, 5.4, 6.4, 1.3, 2.5, '#a88e60');
    sack(k, 8.1, 5.2, 1.3, 2.7);
  },
};

// ── a woodpile ──────────────────────────────────────────────────────────────
// Split logs stacked by a chopping block, an axe bitten into the block and
// chips about it.

const woodpile: PropArt = {
  len: 10,
  dep: 6,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.6, 3, 3.6, 2.8, 0.28);
    const rows: Array<[number, number]> = [[1.2, 0.66], [2.5, 0.66], [3.8, 0.66], [5.1, 0.66], [1.85, 1.8], [3.15, 1.8], [4.45, 1.8], [2.5, 2.94], [3.8, 2.94], [3.15, 4.08]];
    const barks = ['#7a5232', '#6a4428', '#86593a', '#5e3c24'];
    for (const [i, [w, z]] of rows.entries()) log(k, 0.5 + hash(v.seed, i, 1) * 0.5, 6.2 + hash(v.seed, i, 2) * 0.4, w, z, 0.64, barks[i % 4]);
    // the block, the axe in it, chips about it
    k.shadow(8.2, 3.4, 1.6, 1.5, 0.28);
    k.cyl(8.2, 3.4, 0, 1.25, 2.1, '#7a5232', { top: '#c89a68' });
    if (k.fine) for (const r of [0.85, 0.45]) {
      const e = k.ell(8.2, 3.4, 2.1, r);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      k.pen.strokeStyle = '#9a7048';
      k.pen.lineWidth = 0.06 * k.s;
      k.pen.stroke();
    }
    k.rod([[8.0, 3.3, 2.3], [9.3, 4.8, 4.9]], '#9a7048', 0.22);
    const P = (du: number, dz: number): P3 => [8.0 + du * 0.3, 3.3 + du * 0.3, 2.1 + dz];
    k.poly([P(-1.3, 0.2), P(0.9, 0.2), P(1.1, 1.0), P(-0.5, 1.15), P(-1.4, 0.75)], C.ironLight, k.thin, 0.1);
    for (let i = 0; i < 5; i++) {
      const u = 7.0 + hash(v.seed, i, 3) * 2.8;
      const w = 4.7 + hash(v.seed, i, 4) * 1.0;
      k.poly([[u, w, 0.05], [u + 0.5, w + 0.1, 0.05], [u + 0.4, w + 0.35, 0.05]], '#d9b07a', k.thin * 0.6);
    }
  },
};

// ── a tanning frame ─────────────────────────────────────────────────────────
// Two posts braced fore and aft, a bar across the top and one low, a hide
// laced into the frame with cords.

const tanning: PropArt = {
  len: 8,
  dep: 4,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    const w = 2.0;
    k.shadow(4, 2, 4.2, 1.9, 0.26);
    for (const u of [0.8, 7.2]) k.rod([[u, w, 5.8], [u, 0.4, 0]], C.timberDark, 0.24);
    k.rod([[0.5, w, 10.2], [7.5, w, 10.2]], C.timber, 0.34);
    k.rod([[0.8, w, 1.4], [7.2, w, 1.4]], C.timber, 0.3);
    // the hide: a rough skin shape, paler toward the light
    const hide: P3[] = [[1.8, w, 8.9], [3.1, w, 9.4], [4.0, w, 9.0], [4.9, w, 9.4], [6.2, w, 8.8], [6.0, w, 7.2], [6.5, w, 5.4], [6.0, w, 3.6], [6.2, w, 2.6], [4.8, w, 2.9], [4.0, w, 2.4], [3.2, w, 2.9], [1.8, w, 2.6], [2.0, w, 3.8], [1.5, w, 5.6], [2.0, w, 7.2]];
    // the lacing from the hide's edge to the frame
    const lace: Array<[P3, P3]> = [];
    for (const [i, p] of hide.entries()) {
      if (i % 2) continue;
      const to: P3 = p[2] > 8.5 ? [p[0], w, 10.0] : p[2] < 3.2 ? [p[0], w, 1.6] : [p[0] < 4 ? 0.95 : 7.05, w, p[2]];
      lace.push([p, to]);
    }
    k.segs(lace, '#c8b080', Math.max(0.8, 0.1 * k.s), 'round');
    k.poly(hide, k.grad([1.5, w, 9], [6.5, w, 2.5], [[0, '#e0c290'], [0.55, '#c8a070'], [1, '#a07a50']]), k.lw, 0.3);
    if (k.fine) k.poly([[2.6, w, 8.2], [5.4, w, 8.3], [5.6, w, 4.0], [4.0, w, 3.5], [2.5, w, 4.0], [2.4, w, 6.2]], '#d8b88444', 0, 0.4);
    for (const u of [0.8, 7.2]) {
      k.rod([[u, w, 10.6], [u, w, 0]], C.timber, 0.36);
      k.rod([[u, w, 5.8], [u, 3.6, 0]], C.timberDark, 0.24);
    }
  },
};

// ── a weapon rack ───────────────────────────────────────────────────────────
// Two uprights with a slotted rail low and a rail high: plain spears and a
// pair of axes stood in it, a round shield leaning on its front.

const rack: PropArt = {
  len: 8,
  dep: 3,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 1.6, 4.6, 1.8, 0.28);
    // the uprights on their feet
    for (const u of [0.5, 6.9]) {
      k.box(u - 0.2, 0.3, 0, 1.0, 2.4, 0.6, C.timberDark, { line: k.thin });
      k.box(u, 1.0, 0.6, 0.6, 0.6, 10.2, C.timber, { stripe: false });
      k.disc(u + 0.3, 1.3, 10.9, 0.42, C.timberLight, k.thin);
    }
    // the back of the low rail, then what stands in it
    k.box(0.5, 0.9, 2.4, 7.0, 0.35, 0.7, C.timberDark, { line: k.thin, stripe: false });
    const kind = Math.floor(hash(v.seed, 1) * 2);
    // spears: plain ash shafts, leaf-shaped iron heads
    const spears = kind ? [1.7, 3.0] : [1.6, 2.7, 3.8];
    for (const [i, u] of spears.entries()) spear(k, u + (hash(v.seed, i, 2) - 0.5) * 0.2, 1.25, 11.6 - i * 0.25, (hash(v.seed, i, 3) - 0.5) * 0.25);
    // axes: bearded heads high on short hafts
    for (const [i, u] of (kind ? [4.6, 5.9] : [5.1, 6.2]).entries()) axe(k, u, 1.25, 7.6 - i * 0.4, i ? 1 : -1);
    // the rails in front
    k.box(0.5, 1.5, 9.4, 7.0, 0.45, 0.7, C.timber, { line: k.thin });
    k.box(0.5, 1.6, 2.4, 7.0, 0.5, 0.75, C.timber, { line: k.thin });
    // a round shield leaning on it
    const c = [C.red, C.blue, C.green, C.ochre][Math.floor(hash(v.seed, 4) * 4)];
    const c2 = c === C.ochre ? C.cream : hash(v.seed, 5) < 0.5 ? C.cream : C.ochre;
    const sc: P3 = [2.6, 2.6, 2.05];
    const nrm: P3 = [0.05, 1, 0.32];
    k.shadow(2.6, 2.7, 2.0, 0.6, 0.3);
    fillPts(k, ring(k, sc, nrm, 2.0, 28), c, k.lw);
    const halfRing = ring(k, sc, nrm, 1.97, 28);
    fillPts(k, [k.p(...sc), ...halfRing.slice(7, 22)], c2, 0);
    const rimPts = ring(k, sc, nrm, 1.84, 28);
    k.pen.beginPath();
    rimPts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
    k.pen.closePath();
    k.pen.strokeStyle = C.ironLight;
    k.pen.lineWidth = Math.max(1, 0.26 * k.s);
    k.pen.stroke();
    fillPts(k, ring(k, sc, nrm, 2.0, 28), null, k.lw);
    fillPts(k, ring(k, [sc[0] + 0.03, sc[1] + 0.12, sc[2] + 0.04], nrm, 0.55, 14), C.iron, k.thin);
    fillPts(k, ring(k, [sc[0] - 0.12, sc[1] + 0.2, sc[2] + 0.2], nrm, 0.2, 8), '#c3c7cd', 0);
  },
};

function spear(k: Kit, u: number, w: number, top: number, lean: number): void {
  const head = top - 1.7;
  k.rod([[u, w, 2.5], [u + lean, w, head]], '#b08a5a', 0.2);
  const tip = (dz: number, dw: number): P3 => [u + lean + dw, w, dz];
  k.poly([tip(head, 0), tip(head + 0.5, -0.32), tip(top, 0), tip(head + 0.5, 0.32)], C.ironLight, k.thin, 0.1);
  k.line([tip(head + 0.15, 0), tip(top - 0.2, 0)], C.ironDark, Math.max(0.6, 0.06 * k.s));
  k.rod([tip(head - 0.35, 0), tip(head, 0)], C.ironDark, 0.24);
}

function axe(k: Kit, u: number, w: number, top: number, side: -1 | 1): void {
  k.rod([[u, w, 2.6], [u, w, top]], '#8c6a44', 0.22);
  const z = top - 1.4;
  const P = (du: number, dz: number): P3 => [u + side * du, w + 0.02, z + dz];
  k.poly([P(0, 1.1), P(0.4, 1.1), P(1.3, 1.55), P(1.45, 0.1), P(0.9, -0.55), P(0.4, 0.2), P(0, 0.2)], C.iron, k.thin, 0.12);
  k.line([P(1.32, 1.4), P(1.42, 0.2)], C.ironLight, Math.max(0.7, 0.14 * k.s));
}

// ── a wolf-pelt rug ─────────────────────────────────────────────────────────
// A grey pelt lying flat, its legs spread to the corners, the tail at one
// end and the head at the other, eyes shut, friendly.

const rug: PropArt = {
  len: 10,
  dep: 7,
  height: 1,
  draw(v: PropView): void {
    const k = kitOf(v);
    const z = 0.06;
    const pen = k.pen;
    k.shadow(5, 3.5, 5.2, 3.6, 0.16);
    // the pelt: tail, flanks, the four legs spread to the corners
    const body: P3[] = [
      [0.15, 3.5, z], [1.4, 3.1, z], [2.1, 2.3, z], [1.5, 1.3, z], [0.8, 0.4, z], [1.7, 0.35, z], [2.6, 1.1, z], [3.6, 1.55, z], [5.0, 1.45, z], [6.5, 1.55, z],
      [7.3, 1.0, z], [8.0, 0.3, z], [8.6, 0.65, z], [8.0, 1.7, z], [8.1, 2.4, z], [8.1, 4.6, z], [8.0, 5.3, z], [8.6, 6.35, z], [8.0, 6.7, z], [7.3, 6.0, z],
      [6.5, 5.45, z], [5.0, 5.55, z], [3.6, 5.45, z], [2.6, 5.9, z], [1.7, 6.65, z], [0.8, 6.6, z], [1.5, 5.7, z], [2.1, 4.7, z], [1.4, 3.9, z],
    ];
    furry(k, body, k.grad([0, 3.5, z], [8.4, 3.5, z], [[0, C.wolfDark], [0.5, C.wolf], [1, shade(C.wolf, 0.08)]]), v.seed, 0.26, k.lw);
    // the darker saddle down the spine, paler flanks
    k.poly([[1.6, 3.2, z], [3.0, 2.7, z], [6.8, 2.8, z], [7.9, 3.1, z], [7.9, 3.9, z], [6.8, 4.2, z], [3.0, 4.3, z], [1.6, 3.8, z]], shade(C.wolf, -0.16), 0, 0.5);
    if (k.fine) {
      pen.beginPath();
      for (let i = 0; i < 14; i++) {
        const u = 2.6 + i * 0.38;
        for (const w of [2.0, 5.0]) {
          const [x0, y0] = k.p(u, w, z);
          const [x1, y1] = k.p(u + 0.3, w + (w < 3 ? 0.45 : -0.45), z);
          pen.moveTo(x0, y0);
          pen.lineTo(x1, y1);
        }
      }
      pen.strokeStyle = shade(C.wolf, -0.3);
      pen.lineWidth = 0.07 * k.s;
      pen.stroke();
    }
    // the head, lying flat and a little raised: ears back, a pale muzzle,
    // eyes shut, a dark nose
    const hz = 0.28;
    k.shadow(9.0, 3.5, 1.3, 1.5, 0.22, 0.06);
    for (const w of [2.45, 4.55]) {
      const out = w < 3.5 ? -1 : 1;
      k.poly([[7.9, w - 0.15 * out, hz], [8.7, w + 0.05 * out, hz], [7.7, w + 0.95 * out, hz]], C.wolfDark, k.lw, 0.1);
      k.poly([[8.05, w + 0.05 * out, hz + 0.01], [8.5, w + 0.12 * out, hz + 0.01], [7.85, w + 0.6 * out, hz + 0.01]], '#c9b8a8', 0);
    }
    const head: P3[] = [[7.8, 2.4, hz], [8.8, 2.2, hz], [9.6, 2.85, hz], [10.0, 3.3, hz], [10.0, 3.7, hz], [9.6, 4.15, hz], [8.8, 4.8, hz], [7.8, 4.6, hz]];
    k.box(7.9, 2.5, z, 1.6, 2.0, hz - z, C.wolfDark, { line: 0 });
    furry(k, head, k.grad([7.8, 3.5, hz], [10, 3.5, hz], [[0, C.wolf], [1, '#9ea3a9']]), v.seed + 3, 0.14, k.lw);
    k.poly([[9.15, 2.95, hz + 0.01], [9.75, 3.15, hz + 0.01], [9.95, 3.5, hz + 0.01], [9.75, 3.85, hz + 0.01], [9.15, 4.05, hz + 0.01], [8.95, 3.5, hz + 0.01]], '#d8d4ce', 0, 0.2);
    for (const w of [2.95, 4.05]) k.line([[8.7, w - 0.28, hz + 0.02], [8.88, w, hz + 0.02], [8.7, w + 0.28, hz + 0.02]], INK, Math.max(0.9, 0.13 * k.s));
    k.disc(9.88, 3.5, hz + 0.02, 0.24, '#2a2226', 0);
    if (k.fine) k.line([[9.5, 3.2, hz + 0.02], [9.62, 3.5, hz + 0.02], [9.5, 3.8, hz + 0.02]], INK, 0.08 * k.s);
  },
};

// ── a brazier ───────────────────────────────────────────────────────────────
// An iron bowl on three legs with a small fire in it, always flickering.

const BOWL = { cu: 2, cv: 2, z0: 3.4, z1: 4.6, r0: 0.9, r1: 1.65 };

const brazier: PropArt = {
  len: 4,
  dep: 4,
  height: 7,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const { cu, cv, z0, z1, r0, r1 } = BOWL;
    const k = still(v, 'brazier', 7, (k) => {
      k.shadow(cu, cv, 1.8, 1.8, 0.3);
      for (const a of [0.9, 3.0, 5.0]) {
        const fu = cu + Math.cos(a) * 1.55;
        const fv = cv + Math.sin(a) * 1.55;
        k.rod([[cu + Math.cos(a) * 0.7, cv + Math.sin(a) * 0.7, z0 + 0.2], [fu, fv, 0.4], [fu + Math.cos(a) * 0.25, fv + Math.sin(a) * 0.25, 0]], C.ironDark, 0.18);
      }
      const body = hull([...ring(k, [cu, cv, z0], [0, 0, 1], r0, 20), ...ring(k, [cu, cv, z1], [0, 0, 1], r1, 24)]);
      const xs = body.map((p) => p[0]);
      const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
      g.addColorStop(0, C.ironLight);
      g.addColorStop(0.4, C.iron);
      g.addColorStop(1, C.ironDark);
      fillPts(k, body, g, k.lw);
      k.disc(cu, cv, z1, r1, '#3a2620', k.lw);
      k.disc(cu, cv, z1 + 0.05, r1 * 0.78, '#7a2e14', 0);
      for (let i = 0; i < 7; i++) {
        const a = hash(v.seed, i, 9) * Math.PI * 2;
        k.disc(cu + Math.cos(a) * 0.6, cv + Math.sin(a) * 0.5, z1 + 0.1, 0.3, i & 1 ? C.ember : '#ffb050', 0);
      }
      // a band of rivets round the rim
      if (k.fine) for (let i = 0; i < 9; i++) {
        const a = Math.PI * (0.1 + i * 0.1);
        k.disc(cu + Math.cos(a + 0.79) * (r1 - 0.08), cv + Math.sin(a + 0.79) * (r1 - 0.08), z1 - 0.3, 0.09, C.ironLight, 0);
      }
    });
    const t = v.t + hash(v.seed, 10) * 5;
    flames(k, cu, cv, z1 + 0.05, 0.4, t * 2.4, 0.8);
    k.halo(cu, cv, z1 + 1.2, 2.6, '#ffb050', 0.3 + 0.06 * Math.sin(t * 7.3));
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!due(v.t, dt, 1.2, v.seed)) return;
    const tick = Math.floor(v.t * 10);
    const j = (q: number) => hash(tick, q, 9) - 0.5;
    spawn({ kind: 'ember', x: BOWL.cu + j(1), y: BOWL.cv + j(2), z: 6, vx: j(3) * 0.6, vy: j(4) * 0.6, vz: 2 + j(5), life: 1.0, color: [255, 160, 70], glow: true, gravity: -0.3 });
  },
};

export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: hearth, count: 1, place: 'wall' },
  { art: wallBench, count: 2, place: 'wall' },
  { art: casks, count: 1, place: 'wall' },
  { art: rack, count: 2, place: 'wall' },
  { art: chest, count: 1, place: 'wall' },
  { art: stores, count: 1, place: 'floor' },
  { art: woodpile, count: 1, place: 'floor' },
  { art: tanning, count: 1, place: 'floor' },
  { art: rug, count: 1, place: 'floor' },
  { art: brazier, count: 2, place: 'floor' },
];

export const DECOR_ART = { hearth, bench: wallBench, casks, rack, chest, stores, woodpile, tanning, rug, brazier };
