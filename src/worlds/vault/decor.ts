import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle } from '../../world/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { barStack, cageLamp, coins, frustum, gem, goldBar, rivets } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, due, hash, kitOf, still, withAlpha, wisp } from './kit.ts';

// The vault's furniture between the stations: pallets of bars, a jewel on
// a plinth inside a cage of red beams, the acid pit behind its railing (the
// one thing that moves), a teller's window, lamp posts, trolleys of money
// and iron strongboxes. Each on its own soft shadow, varied by its seed.

type Spawn = (p: Particle) => void;

// ── a pallet of bars ────────────────────────────────────────────────────────
const pallet: PropArt = {
  len: 6,
  dep: 5,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2.5, 3.2, 2.7, 0.3);
    // the pallet: slats on three runners
    for (const w of [0.6, 2.3, 4.0]) k.box(0.5, w, 0, 5.0, 0.5, 0.35, C.walnut, { line: k.thin, stripe: false });
    for (let i = 0; i < 5; i++) k.box(0.5 + i * 1.02, 0.4, 0.35, 0.9, 4.3, 0.2, shade(C.walnut, 0.1), { line: k.thin, stripe: false });
    const rows = 2 + Math.floor(hash(v.seed, 1) * 2);
    barStack(k, 0.75, 0.6, 0.55, 3, 4, rows, 1.5, 0.95, 0.5);
    if (hash(v.seed, 2) < 0.5) coins(k, 5.0, 4.3, 0.55, 5, 0.38);
  },
};

// ── the jewel in the beams ──────────────────────────────────────────────────
// A marble plinth with a jewel on a velvet cushion under a glass case, four
// brass posts round it crossing red beams between them.
const POSTS: ReadonlyArray<readonly [number, number]> = [[0.8, 0.8], [7.2, 0.8], [0.8, 7.2], [7.2, 7.2]];
const BEAMS = [1.1, 2.3, 3.5];

const laser: PropArt = {
  len: 8,
  dep: 8,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 4, 4.2, 4.2, 0.24);
    k.pool(4, 4, 3.6, 3.6, '#ff3b3b', 0.12);
    const beams = (pairs: ReadonlyArray<readonly [number, number]>) => {
      for (const z of BEAMS) {
        for (const [i, j] of pairs) {
          const a = POSTS[i];
          const b = POSTS[j];
          k.line([[a[0], a[1], z], [b[0], b[1], z]], withAlpha('#ff3b3b', 0.28), Math.max(1.6, 0.4 * k.s));
          k.line([[a[0], a[1], z], [b[0], b[1], z]], '#ff7a6a', Math.max(0.7, 0.08 * k.s));
        }
      }
    };
    // the far posts and beams, the plinth, then the near ones
    for (const i of [0, 1, 2]) post(k, POSTS[i]);
    beams([[0, 1], [0, 2]]);
    k.box(2.7, 2.7, 0, 2.6, 2.6, 0.5, '#cfc6b4', { line: k.thin });
    k.box(2.9, 2.9, 0.5, 2.2, 2.2, 2.8, C.marble);
    k.box(2.7, 2.7, 3.3, 2.6, 2.6, 0.35, C.brass);
    k.box(3.3, 3.3, 3.65, 1.4, 1.4, 0.45, C.velvet, { round: 0.2 });
    const [gx, gy] = k.p(4, 4, 4.6);
    gem(k, gx, gy, 0.75 * k.s, hash(v.seed, 1) < 0.5 ? '#9fe8ff' : '#ff6a8a');
    k.halo(4, 4, 4.8, 2.0, '#d8f6ff', 0.4);
    // the glass case
    const g = (u: number, w: number, z: number): P3 => [u, w, z];
    k.poly([g(3.0, 5.0, 3.65), g(5.0, 5.0, 3.65), g(5.0, 5.0, 6.0), g(3.0, 5.0, 6.0)], withAlpha('#dff4ff', 0.14), 0);
    k.poly([g(5.0, 3.0, 3.65), g(5.0, 5.0, 3.65), g(5.0, 5.0, 6.0), g(5.0, 3.0, 6.0)], withAlpha('#dff4ff', 0.1), 0);
    k.poly([g(3.0, 3.0, 6.0), g(5.0, 3.0, 6.0), g(5.0, 5.0, 6.0), g(3.0, 5.0, 6.0)], withAlpha('#dff4ff', 0.22), 0);
    k.line([g(3.0, 5.0, 3.65), g(3.0, 5.0, 6.0), g(3.0, 3.0, 6.0), g(5.0, 3.0, 6.0), g(5.0, 5.0, 6.0), g(3.0, 5.0, 6.0)], withAlpha(INK, 0.8), k.thin);
    k.line([g(5.0, 5.0, 3.65), g(5.0, 5.0, 6.0)], withAlpha(INK, 0.8), k.thin);
    k.line([g(5.0, 3.0, 3.65), g(5.0, 3.0, 6.0)], withAlpha(INK, 0.8), k.thin);
    k.line([g(3.3, 5.01, 4.0), g(3.9, 5.01, 5.6)], withAlpha('#ffffff', 0.5), Math.max(0.7, 0.08 * k.s));
    beams([[1, 3], [2, 3]]);
    post(k, POSTS[3]);
  },
};

function post(k: Kit, [u, w]: readonly [number, number]): void {
  k.shadow(u, w, 0.7, 0.7, 0.25);
  k.cyl(u, w, 0, 0.45, 0.2, C.brassDark);
  k.cyl(u, w, 0.2, 0.2, 3.9, C.brass, { line: k.thin });
  k.cyl(u, w, 4.1, 0.3, 0.3, C.brassDark, { line: k.thin });
  const pts: P3[] = BEAMS.map((z) => [u + 0.15, w + 0.15, z]);
  rivets(k, pts, '#ff5a4a', 0.15);
}

// ── the acid pit ────────────────────────────────────────────────────────────
// A round pit sunk in the floor behind a yellow railing, a curb painted in
// hazard stripes; green acid bubbling far down it, glowing, fuming. The
// rails in front are drawn over the bubbles.
const PIT = { c: 5, r: 4.0, curb: 4.65, sink: 1.4, rail: 4.75 };

const pit: PropArt = {
  len: 10,
  dep: 10,
  height: 4.5,
  animated: true,
  draw(v: PropView): void {
    const { c, r, curb, sink } = PIT;
    still(v, 'pit-back', 4.5, (k) => {
      k.shadow(c, c, curb + 0.6, curb + 0.6, 0.3);
      // the back of the railing
      railing(k, Math.PI * 0.75, Math.PI * 1.75 + 0.01);
      // the curb, its stripes, the shaft going down
      k.cyl(c, c, 0, curb, 0.35, '#3a414b', { top: '#4a525d' });
      stripes(k);
      k.disc(c, c, 0.36, r + 0.05, '#0d1112', k.thin);
      // the far wall of the shaft, lit green from below
      const e0 = k.ell(c, c, 0.36, r);
      const e1 = k.ell(c, c, -sink, r);
      const pen = k.pen;
      pen.save();
      pen.beginPath();
      pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, e0.rot, 0, Math.PI * 2);
      pen.clip();
      const g = pen.createLinearGradient(0, e0.cy - e0.ry, 0, e1.cy + e1.ry);
      g.addColorStop(0, '#1a2420');
      g.addColorStop(0.7, '#2f5a2a');
      g.addColorStop(1, '#5aa83a');
      pen.beginPath();
      pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, e0.rot, Math.PI, Math.PI * 2);
      pen.lineTo(e1.cx + e1.rx, e1.cy);
      pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, e1.rot, 0, Math.PI, false);
      pen.closePath();
      pen.fillStyle = g;
      pen.fill();
      // the acid
      const ag = pen.createRadialGradient(e1.cx, e1.cy, 0, e1.cx, e1.cy, e1.rx);
      ag.addColorStop(0, '#d8ff9a');
      ag.addColorStop(0.35, C.acid);
      ag.addColorStop(1, C.acidDeep);
      pen.beginPath();
      pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, e1.rot, 0, Math.PI * 2);
      pen.fillStyle = ag;
      pen.fill();
      pen.restore();
      pen.beginPath();
      pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, e0.rot, 0, Math.PI * 2);
      k.paint(null, k.thin);
    });
    const k = kitOf(v);
    // bubbles rising and bursting on the acid
    const t = v.t;
    const e1 = k.ell(c, c, -sink, r);
    const pen = k.pen;
    const pops: Array<[number, number, number]> = [];
    for (let i = 0; i < 7; i++) {
      const per = 1.1 + hash(v.seed, i, 1) * 0.9;
      const ph = (t / per + hash(v.seed, i, 2)) % 1;
      const n = Math.floor(t / per + hash(v.seed, i, 2));
      const a = hash(v.seed, i, n) * Math.PI * 2;
      const d = Math.sqrt(hash(v.seed, i, n + 7)) * 0.75;
      const x = e1.cx + Math.cos(a) * e1.rx * d;
      const y = e1.cy + Math.sin(a) * e1.ry * d;
      pops.push([x, y, ph]);
    }
    for (const [x, y, ph] of pops) {
      const R = (0.18 + ph * 0.42) * k.s;
      pen.beginPath();
      if (ph < 0.85) {
        pen.ellipse(x, y - R * 0.4, R, R * 0.8, 0, 0, Math.PI * 2);
        pen.fillStyle = withAlpha('#c8ff8a', 0.85);
        pen.fill();
        pen.strokeStyle = withAlpha(C.acidDeep, 0.9);
        pen.lineWidth = Math.max(0.6, 0.06 * k.s);
        pen.stroke();
      } else {
        pen.ellipse(x, y, R * 1.6, R * 0.6, 0, 0, Math.PI * 2);
        pen.strokeStyle = withAlpha('#e8ffc0', 0.8);
        pen.lineWidth = Math.max(0.6, 0.07 * k.s);
        pen.stroke();
      }
    }
    const pulse = 0.32 + 0.08 * Math.sin(t * 2.3);
    k.halo(c, c, 0.4, r * 1.2, '#7cff4a', pulse);
    // the railing in front, over all that
    still(v, 'pit-front', 4.5, (k2) => railing(k2, -Math.PI * 0.25, Math.PI * 0.75 + 0.01, true));
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const n = due(v.t, dt, 1.2, v.seed);
    for (let i = 0; i < n; i++) spawn({ ...wisp(PIT.c, PIT.c, 0.2, Math.floor(v.t * 10), i, [170, 255, 130], 4), life: 1.6 });
  },
};

// Hazard stripes round the curb's top.
function stripes(k: Kit): void {
  const { c, r, curb } = PIT;
  const pen = k.pen;
  pen.beginPath();
  const n = 20;
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 0.5) / n) * Math.PI * 2;
    k.trace([[c + Math.cos(a0) * (r + 0.1), c + Math.sin(a0) * (r + 0.1), 0.36], [c + Math.cos(a0 + 0.12) * (curb - 0.1), c + Math.sin(a0 + 0.12) * (curb - 0.1), 0.36], [c + Math.cos(a1 + 0.12) * (curb - 0.1), c + Math.sin(a1 + 0.12) * (curb - 0.1), 0.36], [c + Math.cos(a1) * (r + 0.1), c + Math.sin(a1) * (r + 0.1), 0.36]]);
  }
  pen.fillStyle = C.hazard;
  pen.fill();
}

// The railing between angles a0 and a1 (posts and two rails); `sign` hangs
// a warning sign on the front.
function railing(k: Kit, a0: number, a1: number, sign = false): void {
  const { c, rail } = PIT;
  const at = (a: number, z: number): P3 => [c + Math.cos(a) * rail, c + Math.sin(a) * rail, z];
  const posts: number[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.13;
    const aa = a > a1 ? a - Math.PI * 2 : a;
    if (aa >= a0 && aa <= a1) posts.push(aa);
  }
  for (const z of [1.9, 3.3]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 16; i++) pts.push(at(a0 + ((a1 - a0) * i) / 16, z));
    k.rod(pts, C.hazard, 0.16);
  }
  for (const a of posts) {
    k.rod([at(a, 0.3), at(a, 3.45)], C.hazard, 0.2);
    k.disc(...at(a, 3.45), 0.16, shade(C.hazard, 0.2), k.thin);
  }
  if (sign) {
    const a = Math.PI * 0.25;
    const p = at(a, 2.6);
    const [x, y] = k.p(p[0] + 0.1, p[1] + 0.1, p[2]);
    const R = 0.9 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(x, y - R);
    k.pen.lineTo(x + R, y);
    k.pen.lineTo(x, y + R);
    k.pen.lineTo(x - R, y);
    k.pen.closePath();
    k.paint(C.hazard, k.thin);
    // a drip
    k.pen.beginPath();
    k.pen.moveTo(x, y - R * 0.5);
    k.pen.quadraticCurveTo(x + R * 0.35, y + R * 0.1, x, y + R * 0.4);
    k.pen.quadraticCurveTo(x - R * 0.35, y + R * 0.1, x, y - R * 0.5);
    k.pen.fillStyle = INK;
    k.pen.fill();
  }
}

// ── the teller's window ─────────────────────────────────────────────────────
// A mahogany counter with a marble top, a brass grille over it with an
// arched window, a bell, a stamp and a stack of forms; a lamp inside.
const teller: PropArt = {
  len: 9,
  dep: 5,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4.5, 2.6, 4.8, 2.8, 0.3);
    // the stool and a shelf behind the window
    k.cyl(3.0, 1.2, 0, 0.18, 3.2, C.iron, { line: k.thin });
    k.cyl(3.0, 1.2, 3.2, 0.8, 0.35, C.oxblood);
    // the counter
    k.box(0.4, 1.4, 0, 8.2, 3.2, 4.0, C.mahogany);
    for (const [a0, a1] of [[0.9, 3.4], [3.8, 5.2], [5.6, 8.1]] as const) {
      k.rect(a0, 0.6, a1, 3.4, 4.61, k.side(shade(C.mahogany, 0.08), 0, 1), k.thin);
      k.line([[a0 + 0.15, 4.62, 0.75], [a0 + 0.15, 4.62, 3.25], [a1 - 0.15, 4.62, 3.25]], withAlpha('#c87a5a', 0.6), Math.max(0.6, 0.07 * k.s));
    }
    k.box(0.2, 1.2, 4.0, 8.6, 3.7, 0.45, C.marble);
    // the grille: a frame, bars, the arched window in the middle
    const n = 2.6;
    const z0 = 4.45;
    const z1 = 9.2;
    const [w0, w1] = [3.4, 5.6];
    const bars: Array<[P3, P3]> = [];
    for (let a = 0.6; a < 8.5; a += 0.42) {
      if (a > w0 && a < w1) continue;
      bars.push([[a, n, z0], [a, n, z1]]);
    }
    k.segs(bars, INK, Math.max(1.2, 0.12 * k.s + k.lw), 'round');
    k.segs(bars, C.brass, Math.max(0.8, 0.12 * k.s), 'round');
    const archTop = z0 + 3.2;
    const ar: P3[] = [[w0, n, z0], [w0, n, archTop - 1.1]];
    for (let i = 0; i <= 10; i++) {
      const th = Math.PI - (i / 10) * Math.PI;
      ar.push([(w0 + w1) / 2 + Math.cos(th) * 1.1, n, archTop - 1.1 + Math.sin(th) * 1.1]);
    }
    ar.push([w1, n, z0]);
    k.rod(ar, C.brass, 0.18);
    k.rod([[0.4, n, z1], [8.6, n, z1]], C.brass, 0.3);
    k.rod([[0.4, n, z0 + 0.1], [8.6, n, z0 + 0.1]], C.brass, 0.18);
    for (const a of [0.4, 8.6]) k.rod([[a, n, z0], [a, n, z1 + 0.4]], C.brass, 0.28);
    // a crest on top
    const crest: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const th = (i / 12) * Math.PI;
      crest.push([4.5 + Math.cos(th) * 1.6, n, z1 + Math.sin(th) * 1.1]);
    }
    k.poly(crest, C.brass, k.lw);
    k.face(4.5, n + 0.02, z1 + 0.45, 0.4, C.brassLight, k.thin, 12);
    // on the counter: the bell, a stamp on its pad, forms
    const tz = 4.45;
    k.cyl(6.6, 3.9, tz, 0.5, 0.12, C.iron);
    const [bx, by] = k.p(6.6, 3.9, tz + 0.1);
    const R = 0.45 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(bx - R, by);
    k.pen.quadraticCurveTo(bx - R, by - R * 1.2, bx, by - R * 1.2);
    k.pen.quadraticCurveTo(bx + R, by - R * 1.2, bx + R, by);
    k.pen.closePath();
    k.paint(C.brass, k.thin);
    k.box(1.2, 3.4, tz, 1.4, 1.0, 0.12, '#3a3550', { line: k.thin, stripe: false });
    k.cyl(1.9, 3.9, tz + 0.12, 0.3, 0.3, '#6a3a22');
    k.cyl(1.9, 3.9, tz + 0.42, 0.12, 0.6, '#6a3a22');
    for (let i = 0; i < 3; i++) k.box(3.0 + i * 0.05, 3.3, tz + i * 0.08, 1.6, 1.2, 0.08, '#f3ead6', { line: Math.max(0.6, k.thin * 0.6), stripe: false });
    // the lamp inside, glowing through the bars
    k.halo(6.2, 1.8, 6.4, 2.6, C.glow, 0.4);
    cageLamp(k, 6.2, 1.8, 6.4, 0.45, true, 0.3);
  },
};

// ── a lamp post ─────────────────────────────────────────────────────────────
const lamp: PropArt = {
  len: 5,
  dep: 5,
  height: 16,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    k.pool(c, c, 2.5, 2.5, '#ffd890', 0.5);
    k.shadow(c, c, 1.2, 1.2, 0.3);
    k.cyl(c, c, 0, 0.95, 0.35, C.iron);
    k.cyl(c, c, 0.35, 0.55, 0.6, C.gunmetal);
    k.rod([[c, c, 0.9], [c, c, 13.6]], C.iron, 0.22);
    for (const z of [3.0, 9.0]) k.cyl(c, c, z, 0.3, 0.3, C.brass, { line: k.thin });
    // a bracket out to the lamp
    k.rod([[c, c, 13.4], [c, c, 14.4], [c + 0.4, c + 0.4, 14.6]], C.iron, 0.14);
    k.cyl(c, c, 14.2, 0.75, 0.3, C.gunmetal);
    cageLamp(k, c, c, 13.3, 0.7, true, 0.55);
  },
};

// ── a money trolley ─────────────────────────────────────────────────────────
// A steel trolley with a push bar, sacks of coin and bundles of notes on it.
const cart: PropArt = {
  len: 6,
  dep: 4,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2, 3.2, 2.2, 0.28);
    for (const [u, w] of [[0.9, 0.8], [5.1, 0.8], [0.9, 3.2], [5.1, 3.2]] as const) {
      k.disc(u, w, 0.3, 0.32, INK, 0);
      k.rod([[u, w, 0.4], [u, w, 1.0]], C.steelLight, 0.12);
    }
    k.box(0.5, 0.5, 1.0, 5.0, 3.0, 0.35, C.steel);
    k.rod([[0.5, 0.6, 1.35], [0.5, 0.6, 4.4], [0.5, 3.4, 4.4], [0.5, 3.4, 1.35]], C.steelLight, 0.14);
    // bundles of notes
    const notes = '#7fa070';
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 3 - r; i++) {
        const u = 3.2 + i * 0.75 + r * 0.35;
        k.box(u, 2.3, 1.35 + r * 0.42, 0.7, 1.0, 0.42, notes, { line: Math.max(0.7, k.thin * 0.7), stripe: false });
        k.box(u + 0.25, 2.28, 1.35 + r * 0.42, 0.2, 1.04, 0.43, '#f3ead6', { line: 0, stripe: false });
      }
    }
    // sacks
    bag(k, 1.9, 1.6, 1.35, 0.95, 1.9, v.seed);
    bag(k, 3.6, 1.2, 1.35, 0.8, 1.6, v.seed + 1);
    bag(k, 2.0, 2.9, 1.35, 0.8, 1.5, v.seed + 2);
  },
};

// A canvas money bag on z, tied at the neck, a coin painted on it.
function bag(k: Kit, cu: number, cv: number, z: number, r: number, h: number, seed: number): void {
  const base = hash(seed, 1) < 0.5 ? '#c8b088' : '#b89868';
  const e0 = k.ell(cu, cv, z + 0.15, r);
  const e1 = k.ell(cu, cv, z + h, r * 0.4);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx, e0.cy);
  pen.bezierCurveTo(e0.cx - e0.rx * 1.2, (e0.cy + e1.cy) / 2, e1.cx - e1.rx * 1.1, e1.cy + (e0.cy - e1.cy) * 0.2, e1.cx - e1.rx, e1.cy);
  pen.lineTo(e1.cx + e1.rx, e1.cy);
  pen.bezierCurveTo(e1.cx + e1.rx * 1.1, e1.cy + (e0.cy - e1.cy) * 0.2, e0.cx + e0.rx * 1.2, (e0.cy + e1.cy) / 2, e0.cx + e0.rx, e0.cy);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(e0.cx - e0.rx, 0, e0.cx + e0.rx, 0);
  g.addColorStop(0, shade(base, 0.14));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.25));
  k.paint(g, k.lw);
  const [nx, ny] = k.p(cu, cv, z + h + 0.3);
  pen.beginPath();
  pen.ellipse(nx, ny, e1.rx * 0.9, e1.rx * 0.5, 0, 0, Math.PI * 2);
  k.paint(shade(base, 0.1), k.thin);
  const [mx, my] = k.p(cu, cv + r * 0.9, z + h * 0.42);
  pen.beginPath();
  pen.ellipse(mx, my, r * 0.3 * k.s, r * 0.34 * k.s, 0, 0, Math.PI * 2);
  pen.strokeStyle = '#7d2a2e';
  pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  pen.stroke();
}

// ── a coin counter ──────────────────────────────────────────────────────────
// A cast-iron stand with a brass counting machine on it: a hopper on top,
// a crank wheel at its side, coin running down chutes into stacks.
const counter: PropArt = {
  len: 5,
  dep: 4,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2, 2.6, 2.2, 0.3);
    for (const [u, w] of [[0.7, 0.7], [4.0, 0.7], [0.7, 3.0], [4.0, 3.0]] as const) k.box(u, w, 0, 0.3, 0.3, 3.0, C.iron, { line: k.thin });
    k.box(0.5, 0.5, 3.0, 4.0, 3.0, 0.35, C.gunmetal);
    k.box(1.0, 0.8, 3.35, 2.8, 2.0, 2.0, C.brass, { round: 0.2 });
    // the chutes and the stacks they fill on the stand's front
    for (const u of [1.6, 2.4, 3.2]) {
      k.poly([[u - 0.25, 2.8, 4.4], [u + 0.25, 2.8, 4.4], [u + 0.25, 3.2, 3.5], [u - 0.25, 3.2, 3.5]], C.steelLight, k.thin);
      coins(k, u, 3.1, 3.35, 2 + Math.floor(hash(v.seed, u * 10) * 4), 0.3);
    }
    // the hopper, heaped with coin
    frustum(k, 2.4, 1.8, 5.35, 0.7, 7.0, 1.3, C.brassDark, C.gold);
    const [hx, hy] = k.p(2.3, 1.75, 7.1);
    k.pen.beginPath();
    k.pen.ellipse(hx, hy, 0.8 * k.s, 0.35 * k.s, 0, Math.PI, Math.PI * 2);
    k.paint(C.goldLight, 0);
    // the crank wheel on the +u side
    const a = 3.85;
    k.rod([[a, 1.8, 4.4], [a + 0.5, 1.8, 4.4]], C.iron, 0.12);
    k.pen.beginPath();
    for (let i = 0; i <= 20; i++) {
      const th = (i / 20) * Math.PI * 2;
      const [x, y] = k.p(a + 0.5, 1.8 + Math.cos(th) * 0.9, 4.4 + Math.sin(th) * 0.9);
      if (i) k.pen.lineTo(x, y);
      else k.pen.moveTo(x, y);
    }
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = 0.18 * k.s + k.lw * 1.4;
    k.pen.stroke();
    k.pen.strokeStyle = C.red;
    k.pen.lineWidth = 0.18 * k.s;
    k.pen.stroke();
    k.rod([[a + 0.5, 1.8, 4.4], [a + 0.5, 2.6, 4.95], [a + 0.9, 2.6, 4.95]], C.iron, 0.12);
  },
};

// ── strongboxes ─────────────────────────────────────────────────────────────
// Iron-bound chests: two stacked, a small one open on the floor with gold.
const chests: PropArt = {
  len: 6,
  dep: 5,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2.5, 3.2, 2.7, 0.3);
    const wood: Color = hash(v.seed, 1) < 0.5 ? '#5a3a2a' : '#3f4a52';
    strongbox(k, 0.5, 0.5, 0, 3.4, 2.4, 1.8, wood);
    strongbox(k, 0.8, 0.7, 1.8, 2.8, 2.0, 1.5, shade(wood, 0.08));
    // the open one
    const [u0, w0] = [3.6, 2.6];
    k.box(u0, w0, 0, 2.0, 1.8, 1.1, wood, { stripe: false });
    k.line([[u0 + 0.4, w0 + 1.81, 0], [u0 + 0.4, w0 + 1.81, 1.1]], C.iron, Math.max(1, 0.18 * k.s));
    k.line([[u0 + 1.6, w0 + 1.81, 0], [u0 + 1.6, w0 + 1.81, 1.1]], C.iron, Math.max(1, 0.18 * k.s));
    k.poly([[u0, w0, 1.1], [u0 + 2.0, w0, 1.1], [u0 + 2.0, w0 - 0.4, 2.6], [u0, w0 - 0.4, 2.6]], k.side(wood, 0, 1), k.thin);
    k.disc(u0 + 1.0, w0 + 0.9, 1.12, 0.7, C.gold, 0);
    goldBar(k, u0 + 0.3, w0 + 0.5, 1.1, 1.3, 0.6, 0.35);
    coins(k, u0 + 1.4, w0 + 1.3, 1.1, 3, 0.3);
    if (hash(v.seed, 2) < 0.6) coins(k, 1.0, 4.0, 0, 4, 0.36);
  },
};

function strongbox(k: Kit, u: number, w: number, z: number, du: number, dv: number, h: number, wood: Color): void {
  k.box(u, w, z, du, dv, h, wood, { round: 0.1 });
  const bands: P3[][] = [];
  for (const a of [u + 0.4, u + du - 0.4]) bands.push([[a, w + dv + 0.01, z], [a, w + dv + 0.01, z + h], [a, w, z + h]]);
  for (const b of bands) k.line(b, C.iron, Math.max(1, 0.2 * k.s));
  k.line([[u, w + dv + 0.01, z + h - 0.35], [u + du, w + dv + 0.01, z + h - 0.35], [u + du, w, z + h - 0.35]], C.iron, Math.max(0.8, 0.14 * k.s));
  k.box(u + du / 2 - 0.3, w + dv - 0.05, z + h * 0.35, 0.6, 0.12, 0.6, C.brass, { line: k.thin, stripe: false });
  const studs: P3[] = [];
  for (const a of [u + 0.4, u + du - 0.4]) for (let zz = z + 0.35; zz < z + h - 0.2; zz += 0.5) studs.push([a, w + dv + 0.03, zz]);
  rivets(k, studs, '#8a929c', 0.08);
}

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: pit, count: 1, place: 'floor' },
  { art: pallet, count: 1, place: 'floor' },
  { art: laser, count: 1, place: 'floor' },
  { art: lamp, count: 1, place: 'floor' },
  { art: chests, count: 1, place: 'floor' },
  { art: teller, count: 1, place: 'floor' },
  { art: counter, count: 1, place: 'floor' },
  { art: cart, count: 1, place: 'floor' },
  { art: pallet, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: chests, count: 1, place: 'floor' },
  { art: lamp, count: 1, place: 'floor' },
  { art: pallet, count: 1, place: 'floor' },
  { art: counter, count: 1, place: 'floor' },
  { art: cart, count: 1, place: 'floor' },
  { art: chests, count: 1, place: 'floor' },
];

export const DECOR_ART = { pallet, laser, pit, teller, lamp, cart, chests, counter };
