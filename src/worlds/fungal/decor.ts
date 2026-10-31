import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import type { Cap } from './bits.ts';
import { boulder, bracket, clump, crystals, fillPts, ring, shroom, tuft } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, due, hash, kitOf, puff, spore, still, withAlpha } from './kit.ts';

// What grows and lies about the caverns' floor between the stations: giant
// mushrooms (spotted, glowing, violet, parasol), clusters of smaller ones,
// the pit of toxic sludge, crystal clusters, stalagmites, a fallen log
// gone over to fungus and puffballs that cough spores. All still but the
// pit (drawn once into the scene's static layer), each on its own soft
// shadow, varied by the placement's seed.

type Spawn = (p: Particle) => void;

// The giant mushrooms' looks: cap colour, shape, glow, spots, skirt.
const GIANTS: ReadonlyArray<readonly [Color, Cap, boolean, Color | null, boolean]> = [
  [C.capRed, 'dome', false, C.spot, true],
  [C.glow, 'dome', true, null, false],
  [C.capViolet, 'bun', false, '#e6d6ff', false],
  [C.capTan, 'flat', false, '#f3e2c0', true],
  [C.capBlue, 'cone', true, null, false],
];

// ── a giant mushroom ─────────────────────────────────────────────────────────
// One tall one, a smaller one or two at its foot, moss round them; glowing
// ones throw their light on the floor.
const giant: PropArt = {
  len: 8,
  dep: 8,
  height: 17,
  draw(v: PropView): void {
    const k = kitOf(v);
    const kind = Math.floor(hash(v.seed, 1) * GIANTS.length);
    const [color, cap, glow, spots, skirt] = GIANTS[kind];
    const c = 4;
    const h = 8.5 + hash(v.seed, 2) * 3.5;
    const r = cap === 'flat' ? 3.8 : 3.5;
    if (glow) k.pool(c, c, 3.8, 3.8, color === C.capBlue ? '#8ab8ff' : C.glow, 0.32);
    k.shadow(c, c, 3.4, 3.4, 0.28);
    k.disc(c, c, 0.03, 2.0, C.mossDark, k.thin);
    tuft(k, c - 1.6, c + 1.2, 0, 1.0, C.mossLight, v.seed);
    const lean: [number, number] = [(hash(v.seed, 3) - 0.5) * 0.6, (hash(v.seed, 4) - 0.5) * 0.6];
    // a little one behind
    const other = GIANTS[(kind + 1 + Math.floor(hash(v.seed, 5) * 3)) % GIANTS.length];
    shroom(k, c - 2.2, c - 1.6, 0, 4.5, 1.2, other[0], { cap: other[1] === 'flat' ? 'dome' : other[1], glow: other[2], spots: other[3], seed: v.seed + 1 });
    shroom(k, c, c, 0, h, r, color, { cap, glow, spots, skirt, lean, seed: v.seed, rb: 1.3 });
    // and one in front
    shroom(k, c + 1.9, c + 1.9, 0, 2.6, 0.95, color, { cap: cap === 'flat' ? 'dome' : cap, glow, spots, seed: v.seed + 2 });
  },
};

// ── a cluster of mushrooms ───────────────────────────────────────────────────
const cluster: PropArt = {
  len: 6,
  dep: 6,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    const glow = hash(v.seed, 1) < 0.35;
    k.shadow(3, 3, 2.8, 2.8, 0.24);
    if (glow) k.pool(3, 3, 2.8, 2.8, C.glow, 0.28);
    k.disc(3, 3, 0.03, 2.2, C.mossDark, k.thin);
    boulder(k, 1.8, 1.6, 0, 1.1, 1.3, '#6f6188', v.seed + 3, true);
    const colors = glow ? [C.glow, C.glowSoft] : hash(v.seed, 2) < 0.5 ? [C.capRed, C.capTan] : [C.capViolet, '#b48cd8', C.capTan];
    const items: Array<{ u: number; w: number; h: number; r: number; c: Color }> = [];
    for (let i = 0; i < 6; i++) {
      const a = hash(v.seed, i, 3) * Math.PI * 2;
      const d = 0.6 + hash(v.seed, i, 4) * 1.6;
      const sz = 0.6 + hash(v.seed, i, 5) * 0.8;
      items.push({ u: 3 + Math.cos(a) * d, w: 3 + Math.sin(a) * d, h: 2 + sz * 4, r: 0.6 + sz * 0.6, c: colors[i % colors.length] });
    }
    items.sort((p, q) => p.u + p.w - (q.u + q.w));
    for (const [i, m] of items.entries()) shroom(k, m.u, m.w, 0, m.h, m.r, m.c, { cap: i % 3 === 2 ? 'cone' : 'dome', glow, spots: !glow && m.c === C.capRed ? C.spot : null, seed: v.seed + i });
    tuft(k, 4.6, 4.4, 0, 1.0, C.mossLight, v.seed + 9);
  },
};

// ── the pit of toxic sludge ─────────────────────────────────────────────────
// A sunken pool of glowing green sludge in a ring of mossy stones, a skull
// of some old creature half sunk in it; it bubbles and sends up fumes.

const PIT = { u: 6, v: 4.5, ru: 4.5, rv: 3.3, sink: 0.7 };

const pit: PropArt = {
  len: 12,
  dep: 9,
  height: 4,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const { u, v: pv, ru, rv, sink } = PIT;
    const k = still(v, 'pit', 4, (k) => {
      k.pool(u, pv, 5.8, 4.4, C.sludge, 0.3);
      k.shadow(u, pv, 5.8, 4.3, 0.22);
      // the hole: its far bank, then the sludge sunk in it
      const rim = (z: number, sc = 1): P3[] => {
        const pts: P3[] = [];
        for (let i = 0; i < 28; i++) {
          const a = (i / 28) * Math.PI * 2;
          const j = 1 + (hash(v.seed, i, 3) - 0.5) * 0.1;
          pts.push([u + Math.cos(a) * ru * j * sc, pv + Math.sin(a) * rv * j * sc, z]);
        }
        return pts;
      };
      k.poly(rim(0.02), k.lgrad([u, pv - rv, 0], [u, pv + rv, 0], [1, 0, 0], [[0, '#3a2c3e'], [1, '#221a28']]), k.lw, 0.6);
      k.pen.save();
      k.pen.beginPath();
      k.trace(rim(0.02), 0.6);
      k.pen.clip();
      const [sx, sy] = k.p(u + 0.15, pv + 0.25, -sink);
      const e1 = k.ell(u, pv, 0, 1);
      const er = { rx: e1.rx * (ru + rv) * 0.5, ry: e1.ry * (ru + rv) * 0.5 };
      k.poly(rim(-sink).map(([a, b, z]): P3 => [a + 0.15, b + 0.25, z]), C.sludgeDark, 0, 0.6);
      k.pen.beginPath();
      k.pen.ellipse(sx, sy, er.rx * 0.92, er.ry * 0.92, 0, 0, Math.PI * 2);
      const g = k.pen.createRadialGradient(sx - er.rx * 0.2, sy - er.ry * 0.2, 0, sx, sy, er.rx);
      g.addColorStop(0, C.sludgeHot);
      g.addColorStop(0.55, C.sludge);
      g.addColorStop(1, withAlpha(C.sludge, 0));
      k.pen.fillStyle = g;
      k.pen.fill();
      // scum swirls on it
      k.pen.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = hash(v.seed, i, 5) * Math.PI * 2;
        const r = 0.3 + hash(v.seed, i, 6) * 0.45;
        k.pen.moveTo(sx + Math.cos(a) * er.rx * r + er.rx * 0.18, sy + Math.sin(a) * er.ry * r);
        k.pen.ellipse(sx + Math.cos(a) * er.rx * r, sy + Math.sin(a) * er.ry * r, er.rx * 0.18, er.ry * 0.12, 0, 0, Math.PI * 1.4);
      }
      k.pen.strokeStyle = withAlpha('#eaff9a', 0.6);
      k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
      k.pen.stroke();
      k.pen.restore();
      // the skull of something, half sunk
      skull(k, u + 1.6, pv - 0.4, -sink + 0.1);
      // stones round the rim (back ones first), moss on some
      const stones: Array<{ a: number; uu: number; vv: number }> = [];
      for (let i = 0; i < 15; i++) {
        const a = (i / 15) * Math.PI * 2 + hash(v.seed, i, 7) * 0.2;
        stones.push({ a, uu: u + Math.cos(a) * (ru + 0.5), vv: pv + Math.sin(a) * (rv + 0.4) });
      }
      stones.sort((p, q) => p.uu + p.vv - (q.uu + q.vv));
      for (const [i, s] of stones.entries()) {
        if (hash(v.seed, i, 8) < 0.2) continue;
        boulder(k, s.uu, s.vv, 0, 0.55 + hash(v.seed, i, 9) * 0.45, 0.5 + hash(v.seed, i, 10) * 0.6, i & 1 ? '#7a6d92' : '#6a5d82', v.seed + i, hash(v.seed, i, 11) < 0.4);
      }
      tuft(k, u - ru - 0.2, pv + 1.5, 0, 1.0, C.mossLight, v.seed + 1);
      clump(k, u + ru + 0.2, pv - 1.4, 0, 3, 0.5, 0.5, [C.capViolet, C.capTan], v.seed + 2);
      k.halo(u, pv, 0.3, 4.4, C.sludge, 0.35);
    });
    // bubbles rising, swelling and popping
    const pen = k.pen;
    const t = v.t;
    const pops: Array<[number, number, number]> = [];
    pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const per = 1.4 + hash(i, 21) * 1.2;
      const cyc = t / per + hash(i, 22);
      const ph = cyc % 1;
      const n = Math.floor(cyc);
      const a = hash(i, n, 23) * Math.PI * 2;
      const d = Math.sqrt(hash(i, n, 24)) * 0.7;
      const [x, y] = k.p(u + 0.2 + Math.cos(a) * ru * d, pv + 0.3 + Math.sin(a) * rv * d, -sink + 0.05);
      const R = (0.15 + ph * 0.4) * k.s;
      if (ph > 0.85) {
        pops.push([x, y, R * 1.4]);
        continue;
      }
      pen.moveTo(x + R, y - R * 0.3);
      pen.ellipse(x, y - R * 0.3, R, R * 0.85, 0, 0, Math.PI * 2);
    }
    k.paint(C.sludgeHot, Math.max(0.7, k.thin * 0.6), C.sludgeDark);
    pen.beginPath();
    for (const [x, y, R] of pops) {
      pen.moveTo(x + R, y);
      pen.ellipse(x, y, R, R * 0.55, 0, 0, Math.PI * 2);
    }
    pen.strokeStyle = '#f4ffc0';
    pen.lineWidth = Math.max(0.8, 0.08 * k.s);
    pen.stroke();
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 0.9, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 10) + i;
      spawn(puff(PIT.u + (hash(tick, 1) - 0.5) * 5, PIT.v + (hash(tick, 2) - 0.5) * 3.5, 0.3, tick, i, [160, 230, 90], 1.2));
    }
  },
};

// An old bleached skull lying in the sludge.
function skull(k: Kit, u: number, v: number, z: number): void {
  const [x, y] = k.p(u, v, z + 0.6);
  const r = 0.75 * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI * 2);
  k.paint('#ece2cc', k.thin);
  pen.beginPath();
  pen.ellipse(x - r * 0.38, y, r * 0.24, r * 0.28, 0, 0, Math.PI * 2);
  pen.ellipse(x + r * 0.38, y, r * 0.24, r * 0.28, 0, 0, Math.PI * 2);
  pen.fillStyle = '#3a2a3a';
  pen.fill();
}

// ── a crystal cluster ─────────────────────────────────────────────────────────
const crystalPatch: PropArt = {
  len: 6,
  dep: 6,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const blue = hash(v.seed, 1) < 0.35;
    const col = blue ? '#6fb0f0' : C.crystal;
    k.pool(3, 3, 3, 3, blue ? '#8ab8ff' : C.crystal, 0.3);
    k.shadow(3, 3, 2.6, 2.6, 0.26);
    boulder(k, 2.2, 2.0, 0, 1.6, 1.3, '#6a5d82', v.seed, true);
    crystals(k, 3, 3, 0.3, 6 + hash(v.seed, 2) * 2, [0.05, 0.1, 1], col, v.seed, 7);
    crystals(k, 4.6, 4.2, 0, 2.2, [0.4, 0.3, 1], col, v.seed + 1, 3);
  },
};

// ── a stalagmite ─────────────────────────────────────────────────────────────
// A spire of rock rising off a mossy foot, ringed in layers, little
// mushrooms round it.
const stalagmite: PropArt = {
  len: 5,
  dep: 5,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    const h = 5.5 + hash(v.seed, 1) * 3;
    k.shadow(c, c, 2.4, 2.4, 0.28);
    spire(k, c, c, h, 2.1, v.seed);
    if (hash(v.seed, 2) < 0.6) spire(k, c + 1.4, c + 1.2, h * 0.45, 1.0, v.seed + 1);
    clump(k, c - 1.5, c + 1.3, 0, 3, 0.5, 0.5, hash(v.seed, 3) < 0.5 ? [C.glow] : [C.capRed, C.capTan], v.seed + 2, hash(v.seed, 3) < 0.5);
  },
};

// A rock spire of radius r at the foot, h tall.
function spire(k: Kit, cu: number, cv: number, h: number, r: number, seed: number): void {
  const pen = k.pen;
  const foot = k.ell(cu, cv, 0, r);
  const [tx, ty] = k.p(cu + (hash(seed, 5) - 0.5) * 0.4, cv, h);
  pen.beginPath();
  pen.moveTo(foot.cx - foot.rx, foot.cy);
  pen.bezierCurveTo(foot.cx - foot.rx * 0.8, foot.cy - (foot.cy - ty) * 0.45, tx - foot.rx * 0.35, ty + (foot.cy - ty) * 0.15, tx, ty);
  pen.bezierCurveTo(tx + foot.rx * 0.35, ty + (foot.cy - ty) * 0.15, foot.cx + foot.rx * 0.8, foot.cy - (foot.cy - ty) * 0.45, foot.cx + foot.rx, foot.cy);
  pen.ellipse(foot.cx, foot.cy, foot.rx, foot.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(foot.cx - foot.rx, 0, foot.cx + foot.rx, 0);
  g.addColorStop(0, '#8a7ca3');
  g.addColorStop(0.35, '#7a6d92');
  g.addColorStop(1, '#4d4263');
  k.paint(g, k.lw);
  // rings of layered rock
  pen.save();
  pen.clip();
  pen.beginPath();
  for (let i = 1; i < 5; i++) {
    const z = (h * i) / 5.5;
    const e = k.ell(cu, cv, z, r * (1 - i / 5.5) * 1.05);
    pen.moveTo(e.cx - e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, Math.PI, 0, true);
  }
  pen.strokeStyle = withAlpha('#2a2038', 0.45);
  pen.lineWidth = Math.max(0.7, 0.08 * k.s);
  pen.stroke();
  pen.restore();
  // moss at the foot
  pen.beginPath();
  pen.ellipse(foot.cx, foot.cy, foot.rx * 1.08, foot.ry * 1.1, 0, -0.1, Math.PI + 0.1);
  pen.strokeStyle = C.moss;
  pen.lineWidth = Math.max(1, 0.35 * k.s);
  pen.stroke();
}

// ── a fallen log ─────────────────────────────────────────────────────────────
// Gone over to fungus: shelf fungi down its side, moss on top, mushrooms
// sprouting from it and a hollow end.
const log: PropArt = {
  len: 10,
  dep: 5,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    const r = 1.5;
    const cv = 2.5;
    const zc = r;
    const u0 = 1.0;
    const u1 = 9.0;
    k.shadow(5, cv, 5, 2.2, 0.28);
    const pen = k.pen;
    const top = [k.p(u0, cv - r * 0.3, zc + r), k.p(u1, cv - r * 0.3, zc + r)];
    const bot = [k.p(u0, cv + r * 0.5, zc - r * 0.85), k.p(u1, cv + r * 0.5, zc - r * 0.85)];
    pen.beginPath();
    pen.moveTo(top[0][0], top[0][1]);
    pen.lineTo(top[1][0], top[1][1]);
    pen.lineTo(bot[1][0], bot[1][1]);
    pen.lineTo(bot[0][0], bot[0][1]);
    pen.closePath();
    k.paint(k.lgrad([u0, cv, zc + r], [u0, cv, zc - r], [1, 0, 0], [[0, shade(C.wood, 0.15)], [0.5, C.wood], [1, shade(C.wood, -0.3)]]), k.lw);
    // bark furrows
    pen.beginPath();
    for (let i = 0; i < 7; i++) {
      const z = zc - r * 0.6 + (i % 3) * 0.4;
      const a = u0 + 0.5 + hash(v.seed, i, 2) * (u1 - u0 - 3);
      const [x0, y0] = k.p(a, cv + r * 0.3, z);
      const [x1, y1] = k.p(a + 1.5 + hash(v.seed, i, 3) * 1.5, cv + r * 0.3, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = shade(C.wood, -0.35);
    pen.lineWidth = Math.max(0.7, 0.09 * k.s);
    pen.stroke();
    // the hollow end toward +u
    const end = ring(k, [u1, cv + 0.1, zc], [1, 0, 0], r * 0.98, 18);
    fillPts(k, end, '#d9b98a', k.lw);
    const hol = ring(k, [u1 + 0.02, cv + 0.1, zc], [1, 0, 0], r * 0.62, 16);
    fillPts(k, hol, '#2a1e2a', k.thin);
    // moss over the top, a run of shelf fungi, mushrooms out of it
    const moss: P3[] = [];
    for (let i = 0; i <= 14; i++) moss.push([u0 + 0.3 + ((u1 - u0 - 0.8) * i) / 14, cv - r * 0.3, zc + r + 0.05 + (i & 1 ? 0.25 : 0.05)]);
    for (let i = 14; i >= 0; i--) moss.push([u0 + 0.3 + ((u1 - u0 - 0.8) * i) / 14, cv + r * 0.2, zc + r * 0.7 - (i % 3) * 0.12]);
    k.poly(moss, C.moss, k.thin);
    for (let i = 0; i < 3; i++) bracket(k, u0 + 1.6 + i * 1.6, cv + r * 0.75, zc - 0.2 + (i & 1) * 0.5, 0.6 + hash(v.seed, i, 4) * 0.3, i === 1 && hash(v.seed, 5) < 0.5 ? C.glowSoft : '#d8a66a', i === 1 && hash(v.seed, 5) < 0.5, 0.25);
    clump(k, u0 + 5.6, cv - 0.2, zc + r, 3, 0.6, 0.6, hash(v.seed, 6) < 0.5 ? [C.capRed] : [C.capTan, '#d9b27a'], v.seed + 3);
  },
};

// ── puffballs ───────────────────────────────────────────────────────────────
// Round pale puffballs in the moss; now and then one coughs up a cloud of
// spores.
const puffballs: PropArt = {
  len: 5,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.3, 2.3, 0.24);
    k.disc(2.5, 2.5, 0.03, 2.0, C.mossDark, k.thin);
    const balls: Array<[number, number, number]> = [[1.6, 1.8, 1.1], [3.3, 2.0, 0.8], [2.4, 3.3, 0.95], [3.6, 3.5, 0.55]];
    for (const [u, w, r] of balls) {
      const [x, y] = k.p(u, w, r * 0.85);
      const R = r * k.s * 1.1;
      const pen = k.pen;
      pen.beginPath();
      pen.ellipse(x, y, R, R * 0.92, 0, 0, Math.PI * 2);
      const g = pen.createRadialGradient(x - R * 0.35, y - R * 0.4, 0, x, y, R * 1.1);
      g.addColorStop(0, '#fbf6ea');
      g.addColorStop(0.6, '#e2d6bc');
      g.addColorStop(1, '#a8987e');
      k.paint(g, k.lw);
      pen.beginPath();
      pen.arc(x, y - R * 0.55, R * 0.16, 0, Math.PI * 2);
      pen.fillStyle = '#8a7a62';
      pen.fill();
    }
    tuft(k, 0.8, 3.6, 0, 0.9, C.mossLight, v.seed);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    // every few seconds one of them puffs
    const n = due(v.t, dt, 0.25, v.seed);
    for (let k = 0; k < n; k++) {
      const tick = Math.floor(v.t * 4);
      for (let i = 0; i < 5; i++) spawn(puff(2.5 + (hash(tick, i) - 0.5) * 1.6, 2.5 + (hash(tick, i, 1) - 0.5) * 1.6, 1.6, tick, i, [214, 206, 170], 1.4));
      spawn(spore(2.5, 2.5, 2, tick, 9, [220, 255, 200]));
    }
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: giant, count: 2, place: 'floor' },
  { art: pit, count: 1, place: 'floor' },
  { art: cluster, count: 2, place: 'floor' },
  { art: crystalPatch, count: 1, place: 'floor' },
  { art: giant, count: 2, place: 'floor' },
  { art: puffballs, count: 1, place: 'floor' },
  { art: stalagmite, count: 2, place: 'floor' },
  { art: log, count: 1, place: 'floor' },
  { art: cluster, count: 2, place: 'floor' },
  // only big rooms have the floor for these
  { art: giant, count: 3, place: 'floor' },
  { art: crystalPatch, count: 1, place: 'floor' },
  { art: pit, count: 1, place: 'floor' },
  { art: stalagmite, count: 2, place: 'floor' },
  { art: puffballs, count: 1, place: 'floor' },
  { art: cluster, count: 2, place: 'floor' },
  { art: giant, count: 2, place: 'floor' },
  { art: log, count: 1, place: 'floor' },
];

export const DECOR_ART = { giant, cluster, pit, crystalPatch, stalagmite, log, puffballs };
