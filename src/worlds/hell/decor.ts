import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { bonePile, candle, coals, crystal, fire, frustum, rock, skull } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, due, ember, hash, kitOf, puff, still } from './kit.ts';

// Hell's furniture between the stations: pools of lava (the one thing out
// here that moves), heaps of bones, braziers, spires of obsidian, a cage
// with a lost soul in it, steaming brimstone, skulls stacked with candles
// and a spilled hoard of gold. Varied by the placement's seed.

type Spawn = (p: Particle) => void;

// ── a pool of lava ───────────────────────────────────────────────────────────
// Lava welling up in a ring of black rock, crusted plates drifting on it,
// bubbles swelling and bursting, embers rising. The crust and the bubbles
// move a little every picture.
const LAVA = { u: 6, v: 4.5, ru: 4.6, rv: 3.3 };

// The pool's edge (a lumpy ellipse), n points.
function edge(seed: number, f = 1, n = 18): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const j = (0.9 + hash(seed, i, 51) * 0.18) * f;
    out.push([LAVA.u + Math.cos(a) * LAVA.ru * j, LAVA.v + Math.sin(a) * LAVA.rv * j]);
  }
  return out;
}

const lavaPool: PropArt = {
  len: 12,
  dep: 9,
  height: 2,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const { u, v: w, ru, rv } = LAVA;
    const k = still(v, 'lava', 3, (k) => {
      k.pool(u, w, ru + 3, rv + 3, '#ff6a20', 0.4);
      const rim = edge(v.seed, 1.16);
      // the rocks round it, back ones first (the front ones go over the lava)
      k.poly(rim.map(([a, b]) => [a, b, 0.5] as P3), C.basaltDark, k.lw, 0.6);
      k.poly(edge(v.seed, 1.02).map(([a, b]) => [a, b, 0.5] as P3), '#1a0808', 0, 0.4);
      k.poly(edge(v.seed, 0.98).map(([a, b]) => [a, b, 0.52] as P3), k.rgrad(u, w, 0.52, ru * 1.1, [[0, '#ffe890'], [0.3, C.lavaHot], [0.7, C.lava], [1, C.lavaDeep]]), 0, 0.4);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + hash(v.seed, i, 52) * 0.2;
        if (Math.sin(a) + Math.cos(a) > 0.3) continue; // the front rocks are drawn after
        rock(k, u + Math.cos(a) * ru * 1.08, w + Math.sin(a) * rv * 1.08, 0, 0.75 + hash(v.seed, i, 53) * 0.4, 0.9 + hash(v.seed, i, 54) * 0.6, i & 1 ? C.basalt : C.basaltDark, i + v.seed);
      }
    });
    // the moving surface: drifting crust, bubbles
    const t = v.t;
    const pen = k.pen;
    const z = 0.54;
    for (let i = 0; i < 5; i++) {
      const a0 = hash(v.seed, i, 55) * Math.PI * 2 + t * 0.12 * (i & 1 ? 1 : -1);
      const rr = 0.35 + hash(v.seed, i, 56) * 0.4;
      const cu = u + Math.cos(a0) * ru * rr;
      const cv = w + Math.sin(a0) * rv * rr;
      const sz = 0.7 + hash(v.seed, i, 57) * 0.6;
      const pts: P3[] = [];
      for (let j = 0; j < 6; j++) {
        const b = (j / 6) * Math.PI * 2 + i;
        const q = sz * (0.7 + hash(v.seed, i, j) * 0.5);
        pts.push([cu + Math.cos(b) * q, cv + Math.sin(b) * q * 0.8, z]);
      }
      k.poly(pts, C.crustLight, 0, 0.25);
      k.poly(pts.map(([a, b]) => [cu + (a - cu) * 0.6, cv + (b - cv) * 0.6, z + 0.01] as P3), C.crust, 0, 0.15);
    }
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + hash(v.seed, i, 58)) % 1;
      const a = hash(v.seed, i, 59) * Math.PI * 2 + Math.floor(t * 0.7 + hash(v.seed, i, 58));
      const rr = 0.2 + hash(v.seed, i, 60) * 0.5;
      const R = (0.2 + ph * 0.5) * k.s;
      const [x, y] = k.p(u + Math.cos(a) * ru * rr, w + Math.sin(a) * rv * rr, z);
      pen.beginPath();
      pen.ellipse(x, y, R, R * 0.6, 0, 0, Math.PI * 2);
      k.paint(ph > 0.85 ? '#fff4c0' : C.lavaHot, Math.max(0.7, k.thin * 0.6), C.lavaDeep);
    }
    // the front rocks over it
    // (redrawn live: cheap, and they must cover the crust drifting under them)
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + hash(v.seed, i, 52) * 0.2;
      if (Math.sin(a) + Math.cos(a) <= 0.3) continue;
      rock(k, u + Math.cos(a) * ru * 1.08, w + Math.sin(a) * rv * 1.08, 0, 0.75 + hash(v.seed, i, 53) * 0.4, 0.9 + hash(v.seed, i, 54) * 0.6, i & 1 ? C.basalt : C.basaltDark, i + v.seed);
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 1.6, v.seed);
    for (let i = 0; i < n; i++) spawn(ember(LAVA.u, LAVA.v, 0.8, Math.floor(v.t * 10), i, 5));
    if (due(v.t, dt, 0.4, v.seed + 1)) spawn(puff(LAVA.u + (hash(Math.floor(v.t), 3) - 0.5) * 4, LAVA.v, 1, Math.floor(v.t * 10), 1, [90, 60, 56]));
  },
};

// ── a heap of bones ──────────────────────────────────────────────────────────
// Bones and skulls in a heap, with a rusted sword stuck in it or a helm
// lying by it.
const bones: PropArt = {
  len: 6,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    if (hash(v.seed, 61) < 0.5) {
      bonePile(k, 3, 2.5, 0, 2.3, v.seed, 2);
      // a sword stuck in at a slant
      k.rod([[3.6, 2.2, 1.0], [4.2, 1.8, 3.8]], '#9a9aa6', 0.24);
      k.rod([[3.75, 2.4, 3.2], [4.4, 1.6, 3.5]], C.goldDark, 0.18);
      k.rod([[4.3, 1.75, 3.55], [4.5, 1.6, 4.4]], C.leather, 0.2);
    } else {
      bonePile(k, 2.6, 2.4, 0, 2.0, v.seed, 1);
      // an iron helm with horns
      k.shadow(4.8, 3.4, 1.1, 0.9, 0.25);
      const [x, y] = k.p(4.8, 3.4, 0.1);
      const R = 0.85 * k.s;
      k.pen.beginPath();
      k.pen.arc(x, y - R * 0.2, R, Math.PI, 0);
      k.pen.lineTo(x + R, y + R * 0.15);
      k.pen.lineTo(x - R, y + R * 0.15);
      k.pen.closePath();
      const hg = k.pen.createLinearGradient(x - R, 0, x + R, 0);
      hg.addColorStop(0, shade(C.ironLight, 0.2));
      hg.addColorStop(1, C.iron);
      k.paint(hg, k.lw);
      for (const d of [-1, 1]) k.fill([[x + d * R * 0.8, y - R * 0.5], [x + d * R * 1.5, y - R * 1.4], [x + d * R * 0.95, y - R * 0.1]], C.bone, k.thin);
      k.line([[4.3, 3.4, 0.5], [5.3, 3.4, 0.5]], INK, Math.max(1, 0.2 * k.s));
    }
  },
};

// ── a brazier ───────────────────────────────────────────────────────────────
// A tall iron bowl of fire on three clawed legs, its light round its foot.
const brazier: PropArt = {
  len: 4,
  dep: 4,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.pool(c, c, 5, 5, '#ff8a3a', 0.32);
    k.shadow(c, c, 1.5, 1.5, 0.28);
    for (const a of [0.5, 2.6, 4.7]) {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      k.rod([[c + ca * 1.2, c + sa * 1.2, 0.1], [c + ca * 0.9, c + sa * 0.9, 2.2], [c + ca * 0.35, c + sa * 0.35, 5.6]], C.iron, 0.18);
      k.dot(c + ca * 1.25, c + sa * 1.25, 0.1, 0.3 * k.s, 0.18 * k.s, C.ironLight, k.thin);
    }
    k.rod([[c, c, 2.4], [c, c, 5.6]], C.iron, 0.2);
    frustum(k, c, c, 5.4, 0.7, 6.7, 1.4, C.iron, '#1a0a0a');
    // a ring of little horns round the rim
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const [x, y] = k.p(c + Math.cos(a) * 1.42, c + Math.sin(a) * 1.42, 6.7);
      const S = 0.22 * k.s;
      if (Math.sin(a) + Math.cos(a) < -0.4) continue;
      k.fill([[x - S, y], [x + S * 0.3, y - S * 2.4], [x + S, y]], C.ironLight, k.thin * 0.8);
    }
    coals(k, c, c, 6.6, 1.2, v.seed, 0.7);
    fire(k, c, c, 6.6, 1.2, 2.4, 0, v.seed);
    k.halo(c, c, 7.6, 3.8, '#ff9a4a', 0.45);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 1.4, v.seed);
    for (let i = 0; i < n; i++) spawn(ember(2, 2, 8.4, Math.floor(v.t * 10), i, 1.2));
  },
};

// ── spires of obsidian ───────────────────────────────────────────────────────
// Black glass breaking out of the floor in a cluster of tall shards, a red
// glow caught in their faces.
const spires: PropArt = {
  len: 6,
  dep: 5,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2.5, 3.0, 2.4, 0.3);
    const shards: Array<{ u: number; v: number; h: number; w: number; l: number }> = [];
    for (let i = 0; i < 6; i++) {
      const a = hash(v.seed, i, 71) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.8 + hash(v.seed, i, 72) * 1.2;
      shards.push({ u: 3 + Math.cos(a) * r, v: 2.4 + Math.sin(a) * r * 0.8, h: i === 0 ? 9.5 : 3 + hash(v.seed, i, 73) * 4.5, w: i === 0 ? 1.6 : 0.8 + hash(v.seed, i, 74) * 0.6, l: (hash(v.seed, i, 75) - 0.5) * 1.2 });
    }
    shards.sort((p, q) => p.u + p.v - (q.u + q.v));
    for (const s of shards) crystal(k, s.u, s.v - s.w * 0.3, 0, s.h, s.w, s.l, C.obsidianLight);
    // a red gleam at their feet
    k.pool(3, 3, 3, 2.2, '#ff4a2a', 0.18);
  },
};

// ── a lost soul in a cage ────────────────────────────────────────────────────
// A tall iron birdcage on a stone block, a pale green ghost floating in it,
// sad-eyed, glowing.
const cage: PropArt = {
  len: 5,
  dep: 5,
  height: 13,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    const r = 1.75;
    k.shadow(c, c, 2.2, 2.2, 0.3);
    k.pool(c, c, 3.4, 3.4, '#5fe0b0', 0.22);
    k.box(0.6, 0.6, 0, 3.8, 3.8, 1.4, C.basalt, { round: 0.2 });
    const z0 = 1.4;
    const z1 = 9.6;
    const bar = (a: number) => {
      const du = Math.cos(a) * r;
      const dv = Math.sin(a) * r;
      const pts: P3[] = [[c + du, c + dv, z0], [c + du, c + dv, z1]];
      for (let i = 1; i <= 4; i++) {
        const f = i / 4;
        pts.push([c + du * Math.cos(f * Math.PI / 2), c + dv * Math.cos(f * Math.PI / 2), z1 + Math.sin(f * Math.PI / 2) * 1.6]);
      }
      return pts;
    };
    const n = 8;
    const front = (a: number) => Math.cos(a) + Math.sin(a) > 0;
    const draw = (pts: P3[]) => {
      k.line(pts, INK, Math.max(1.3, 0.16 * k.s + k.thin));
      k.line(pts, C.ironLight, Math.max(0.7, 0.16 * k.s));
    };
    for (let i = 0; i < n; i++) if (!front((i / n) * Math.PI * 2)) draw(bar((i / n) * Math.PI * 2));
    k.disc(c, c, z0, r, C.iron, k.thin);
    // the ghost
    const [x, y] = k.p(c, c, 5.4);
    const R = 1.35 * k.s;
    k.halo(c, c, 5.6, 3.4, '#8ff2d0', 0.6);
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(x - R, y);
    pen.arc(x, y, R, Math.PI, 0);
    pen.lineTo(x + R, y + R * 1.5);
    for (let i = 0; i < 4; i++) {
      const xx = x + R - ((i + 0.5) * 2 * R) / 4;
      pen.quadraticCurveTo(xx + R * 0.25, y + R * (i & 1 ? 1.2 : 1.9), xx - R * 0.25, y + R * 1.5);
    }
    pen.lineTo(x - R, y);
    pen.closePath();
    const g = pen.createRadialGradient(x - R * 0.3, y - R * 0.4, 0, x, y, R * 2);
    g.addColorStop(0, '#f0fff8');
    g.addColorStop(0.5, '#a8f4dc');
    g.addColorStop(1, '#5fc8a8');
    k.paint(g, k.thin, C.soulDark);
    for (const d of [-1, 1]) {
      pen.beginPath();
      pen.ellipse(x + d * R * 0.38, y + R * 0.05, R * 0.16, R * 0.24, 0, 0, Math.PI * 2);
      pen.fillStyle = C.soulDark;
      pen.fill();
    }
    pen.beginPath();
    pen.arc(x, y + R * 0.6, R * 0.18, Math.PI * 1.1, Math.PI * 1.9);
    pen.strokeStyle = C.soulDark;
    pen.lineWidth = Math.max(0.8, R * 0.08);
    pen.stroke();
    for (let i = 0; i < n; i++) if (front((i / n) * Math.PI * 2)) draw(bar((i / n) * Math.PI * 2));
    for (const zz of [z0 + 0.1, z1, (z0 + z1) / 2]) {
      const e = k.ell(c, c, zz, r);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      pen.strokeStyle = INK;
      pen.lineWidth = Math.max(1.5, 0.2 * k.s + k.thin);
      pen.stroke();
      pen.strokeStyle = C.ironLight;
      pen.lineWidth = Math.max(0.8, 0.2 * k.s);
      pen.stroke();
    }
    k.dot(c, c, z1 + 1.7, 0.4 * k.s, 0.4 * k.s, C.iron, k.thin);
    k.line([[c, c, z1 + 2.0], [c, c, z1 + 2.8]], INK, Math.max(1, 0.2 * k.s));
    const [rx, ry] = k.p(c, c, z1 + 3.1);
    pen.beginPath();
    pen.arc(rx, ry, 0.45 * k.s, 0, Math.PI * 2);
    pen.strokeStyle = C.ironLight;
    pen.lineWidth = Math.max(1, 0.16 * k.s);
    pen.stroke();
  },
};

// ── brimstone ────────────────────────────────────────────────────────────────
// A crust of yellow brimstone crystals round a crack that steams sulphur.
const brimstone: PropArt = {
  len: 5,
  dep: 4,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2, 2.6, 2, 0.26);
    k.poly(blob(2.5, 2, 2.3, 1.7, v.seed, 0.05), '#a8862a', k.thin, 0.3);
    k.poly(blob(2.5, 2, 1.7, 1.2, v.seed + 1, 0.06), '#d8b03a', 0, 0.3);
    k.line([[1.6, 1.6, 0.07], [2.4, 2.1, 0.07], [3.2, 1.9, 0.07]], '#3a2a10', Math.max(1.2, 0.3 * k.s));
    k.halo(2.4, 2, 0.4, 2.2, '#fff080', 0.25);
    const cl: Array<[number, number, number, number]> = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + hash(v.seed, i, 81);
      cl.push([2.5 + Math.cos(a) * 1.4, 2 + Math.sin(a) * 1.0, 0.8 + hash(v.seed, i, 82) * 1.8, 0.4 + hash(v.seed, i, 83) * 0.3]);
    }
    cl.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    for (const [u, w, h, r] of cl) crystal(k, u, w, 0, h, r, (hash(u * 10, 84) - 0.5) * 0.6, i2c(u + w));
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (due(v.t, dt, 1.1, v.seed)) spawn(puff(2.4, 2, 0.6, Math.floor(v.t * 10), 0, [214, 196, 96], 'steam'));
  },
};

const i2c = (n: number): Color => (Math.floor(n * 3) % 2 ? C.brimstone : C.brimstoneLight);

// A lumpy level patch round (cu, cv) at z, ru x rv.
function blob(cu: number, cv: number, ru: number, rv: number, seed: number, z: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const j = 0.85 + hash(seed, i, 85) * 0.3;
    out.push([cu + Math.cos(a) * ru * j, cv + Math.sin(a) * rv * j, z]);
  }
  return out;
}

// ── skulls and candles ───────────────────────────────────────────────────────
// Skulls stacked in a little pyramid, black candles melted onto them, wax
// pooled round their feet.
const skullCandles: PropArt = {
  len: 4,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2, 2, 1.9, 1.9, 0.28);
    k.pool(2, 2, 3.4, 3.4, '#ffb060', 0.24);
    k.poly(blob(2, 2, 1.9, 1.9, v.seed, 0.03), '#2e1a24', 0, 0.3);
    const r = 0.72;
    skull(k, 1.2, 1.4, 0, r);
    skull(k, 2.8, 1.4, 0, r);
    skull(k, 2.0, 1.4, 1.35, r);
    skull(k, 1.4, 2.8, 0, r, { tilt: -0.15 });
    skull(k, 2.7, 2.9, 0, r, { tilt: 0.1 });
    candle(k, 2.0, 1.4, 2.85, 1.4, 0.26);
    candle(k, 0.6, 2.5, 0, 1.8, 0.3);
    candle(k, 3.4, 2.2, 0, 1.1, 0.28);
    candle(k, 2.1, 3.6, 0, 0.8, 0.26);
  },
};

// ── a hoard ──────────────────────────────────────────────────────────────────
// An open chest spilling gold: coins, a goblet, a crown, a necklace of
// rubies trailing out.
const hoard: PropArt = {
  len: 6,
  dep: 4,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2, 3.2, 2.2, 0.28);
    // spilled coins
    k.poly(blob(3.6, 2.6, 2.4, 1.3, v.seed, 0.05), C.goldDark, k.thin, 0.3);
    const pen = k.pen;
    for (let i = 0; i < 16; i++) {
      const [x, y] = k.p(1.6 + hash(v.seed, i, 91) * 4.0, 1.8 + hash(v.seed, i, 92) * 1.8, 0.1);
      pen.beginPath();
      pen.ellipse(x, y, 0.3 * k.s, 0.18 * k.s, 0, 0, Math.PI * 2);
      k.paint(i & 1 ? C.gold : C.goldLight, k.thin * 0.6);
    }
    // the chest
    k.box(0.6, 0.5, 0, 3.6, 2.2, 1.9, C.leather, { stripe: false });
    for (const u of [0.6, 4.1]) k.box(u, 0.45, 0, 0.12, 2.3, 1.95, C.gold, { line: k.thin, stripe: false });
    k.poly([[0.7, 0.6, 1.9], [4.1, 0.6, 1.9], [4.1, 2.6, 1.9], [0.7, 2.6, 1.9]], C.goldDark, 0);
    // the heap of gold in it
    const [hx, hy] = k.p(2.4, 1.6, 2.1);
    pen.beginPath();
    pen.ellipse(hx, hy, 1.8 * k.s, 0.9 * k.s, 0, Math.PI, 0);
    pen.closePath();
    k.paint(k.rgrad(2.2, 1.4, 2.6, 2, [[0, C.goldLight], [1, C.gold]]), k.thin);
    // the lid thrown back
    k.poly([[0.6, 0.5, 1.9], [4.2, 0.5, 1.9], [4.2, 0.1, 3.9], [0.6, 0.1, 3.9]], k.side(shade(C.leather, 0.05), 0, 1), k.lw);
    k.line([[2.4, 0.3, 2.9], [2.4, 0.5, 1.9]], C.gold, Math.max(0.8, 0.2 * k.s));
    // a goblet and a crown on the gold
    frustum(k, 1.6, 1.4, 2.4, 0.15, 3.4, 0.5, C.gold, '#8c1a1a');
    const [cx, cy] = k.p(3.2, 1.8, 2.5);
    const R = 0.75 * k.s;
    pen.beginPath();
    pen.moveTo(cx - R, cy);
    pen.lineTo(cx - R, cy - R * 0.8);
    pen.lineTo(cx - R * 0.5, cy - R * 0.4);
    pen.lineTo(cx, cy - R * 1.1);
    pen.lineTo(cx + R * 0.5, cy - R * 0.4);
    pen.lineTo(cx + R, cy - R * 0.8);
    pen.lineTo(cx + R, cy);
    pen.closePath();
    k.paint(C.gold, k.thin);
    k.dot(3.2, 1.8, 2.75, 0.18 * k.s, 0.18 * k.s, '#c8203a');
    // rubies trailing out over the front
    const beads: Pt[] = [];
    for (let i = 0; i < 6; i++) beads.push(k.p(2.0 + i * 0.5, 2.75 + Math.sin(i) * 0.2, 1.9 - i * 0.32));
    for (const [x, y] of beads) {
      pen.beginPath();
      pen.arc(x, y, Math.max(0.8, 0.16 * k.s), 0, Math.PI * 2);
      k.paint('#d8203a', k.thin * 0.5);
    }
    k.halo(2.4, 1.6, 2.6, 2.6, '#ffe08a', 0.3);
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: lavaPool, count: 1, place: 'floor' },
  { art: bones, count: 1, place: 'floor' },
  { art: brazier, count: 2, place: 'floor' },
  { art: spires, count: 1, place: 'floor' },
  { art: skullCandles, count: 1, place: 'floor' },
  { art: cage, count: 1, place: 'floor' },
  { art: brimstone, count: 1, place: 'floor' },
  { art: bones, count: 1, place: 'floor' },
  { art: hoard, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: lavaPool, count: 1, place: 'floor' },
  { art: brazier, count: 2, place: 'floor' },
  { art: spires, count: 1, place: 'floor' },
  { art: bones, count: 1, place: 'floor' },
  { art: skullCandles, count: 1, place: 'floor' },
  { art: brimstone, count: 1, place: 'floor' },
];

export const DECOR_ART = { lavaPool, bones, brazier, spires, cage, brimstone, skullCandles, hoard };

