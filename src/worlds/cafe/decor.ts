import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { chair, crown, cup, frustum, jarCandle, leaf, pot } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, hash, kitOf } from './kit.ts';

// The café's furniture between the stations: bistro tables for two, big
// potted plants, floor lamps, a chalk A-board and sacks of beans. All
// still (drawn once into the scene's static layer), each on its own soft
// shadow, varied by the placement's seed.

// ── a bistro table for two ──────────────────────────────────────────────────
// A round marble top on a cast-iron stand between two bentwood chairs (to
// either side as seen, so neither hides the table), with what two people
// left on it: cups, a croissant, a vase, a book.
const bistro: PropArt = {
  len: 9,
  dep: 9,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 4.5;
    k.shadow(c, c, 4.2, 4.2, 0.18);
    chair(k, 1.6, 7.0, Math.atan2(c - 7.0, c - 1.6), C.walnut, hash(v.seed, 1) < 0.5 ? '#d9b77c' : '#c86a48');
    chair(k, 7.2, 1.9, Math.atan2(c - 1.9, c - 7.2), C.walnut, hash(v.seed, 2) < 0.5 ? '#d9b77c' : '#c86a48');
    k.shadow(c, c, 1.6, 1.6, 0.25);
    // the cast-iron stand: a ribbed foot, a column
    k.cyl(c, c, 0, 1.15, 0.25, C.iron);
    k.cyl(c, c, 0.25, 0.55, 0.35, C.iron);
    k.cyl(c, c, 0.6, 0.22, 5.3, C.iron);
    k.cyl(c, c, 5.5, 0.6, 0.35, C.iron);
    // the top: white marble with a brass band
    k.cyl(c, c, 5.85, 2.3, 0.4, '#efe9df', { top: '#f6f2ea' });
    if (k.fine) {
      k.line([[c - 1.6, c - 0.4, 6.26], [c - 0.6, c + 0.3, 6.26], [c + 0.2, c + 0.1, 6.26], [c + 1.2, c + 1.1, 6.26]], '#d5ccc0', 0.05 * k.s);
    }
    const z = 6.25;
    const kind = Math.floor(hash(v.seed, 3) * 3);
    cup(k, c - 0.9, c + 0.7, z, hash(v.seed, 4) < 0.5 ? C.china : '#e3b25e', true, 0.42);
    cup(k, c + 0.8, c - 0.9, z, hash(v.seed, 5) < 0.5 ? C.china : '#5f8b7d', true, 0.42);
    if (kind === 0) {
      // a croissant on a plate
      k.disc(c + 0.5, c + 0.9, z + 0.04, 0.75, '#f6f1e6', k.thin);
      const pts: P3[] = [];
      for (let i = 0; i <= 8; i++) {
        const a = Math.PI * (0.15 + (0.7 * i) / 8);
        pts.push([c + 0.5 + Math.cos(a) * 0.55, c + 0.9 - Math.sin(a) * 0.3 + 0.15, z + 0.1 + Math.sin(a) * 0.32]);
      }
      for (let i = 8; i >= 0; i--) {
        const a = Math.PI * (0.15 + (0.7 * i) / 8);
        pts.push([c + 0.5 + Math.cos(a) * 0.4, c + 0.9 - Math.sin(a) * 0.12 + 0.15, z + 0.08]);
      }
      k.poly(pts, '#d9944a', k.thin, 0.08);
    } else if (kind === 1) {
      // a bud vase with a flower
      k.cyl(c - 0.2, c - 0.3, z, 0.25, 0.9, '#cfe0dc');
      k.line([[c - 0.2, c - 0.3, z + 0.9], [c - 0.1, c - 0.3, z + 2.0]], C.leafDark, Math.max(0.8, 0.08 * k.s));
      const [x, y] = k.p(c - 0.1, c - 0.3, z + 2.1);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        k.pen.beginPath();
        k.pen.ellipse(x + Math.cos(a) * 0.22 * k.s, y + Math.sin(a) * 0.16 * k.s, 0.2 * k.s, 0.15 * k.s, a, 0, Math.PI * 2);
        k.paint(hash(v.seed, 6) < 0.5 ? '#e86a5a' : '#f2c14e', k.thin * 0.7);
      }
      k.disc(c - 0.1, c - 0.3, z + 2.1, 0.1, '#7a3a20', 0);
    } else {
      // a candle and a closed book
      jarCandle(k, c - 0.1, c - 0.2, z);
      k.box(c + 0.1, c + 0.5, z, 1.3, 0.9, 0.3, '#34476b', { line: k.thin, stripe: false });
    }
  },
};

// ── a potted plant ──────────────────────────────────────────────────────────
// One of four, by seed: a monstera, a fiddle-leaf fig, a snake plant or a
// round bushy fern, in terracotta, cream glaze or a woven basket.
const plant: PropArt = {
  len: 4,
  dep: 4,
  height: 13,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    const kind = Math.floor(hash(v.seed, 11) * 4);
    const potC: Color = ['#c66a42', '#e3d6bd', '#c8995a', '#5f8b7d'][Math.floor(hash(v.seed, 12) * 4)];
    k.shadow(c, c, 1.7, 1.7, 0.28);
    pot(k, c, c, 0, 1.3, 2.4, potC);
    if (potC === '#c8995a' && k.fine) {
      for (let z = 0.4; z < 2.2; z += 0.45) k.line(arc(c, c, z, 1.1), shade(potC, -0.25), 0.05 * k.s);
    }
    const [bx, by] = k.p(c, c, 2.3);
    const S = k.s;
    if (kind === 0) {
      // monstera: big heart-shaped leaves on long stems
      for (let i = 0; i < 7; i++) {
        const a = -Math.PI / 2 + (i - 3) * 0.42 + (hash(v.seed, i, 13) - 0.5) * 0.2;
        const L = (5 + hash(v.seed, i, 14) * 3.5) * S;
        const ex = bx + Math.cos(a) * L * 0.55;
        const ey = by + Math.sin(a) * L * 0.55;
        k.pen.beginPath();
        k.pen.moveTo(bx, by);
        k.pen.quadraticCurveTo(bx + Math.cos(a) * L * 0.2, by - L * 0.3, ex, ey);
        k.pen.strokeStyle = C.leafDark;
        k.pen.lineWidth = Math.max(0.8, 0.12 * S);
        k.pen.stroke();
        leaf(k, ex, ey, a + (i < 3 ? -0.5 : i > 3 ? 0.5 : 0), L * 0.5, L * 0.28, i % 3 === 0 ? C.leafDark : i % 3 === 1 ? C.leaf : '#6fae5c');
      }
    } else if (kind === 1) {
      // fiddle-leaf fig: a trunk with broad leaves up it
      const top = 12;
      k.rod([[c, c, 2.2], [c + 0.2, c, top - 1]], '#7a5232', 0.22);
      for (let i = 0; i < 12; i++) {
        const z = 4.5 + (i / 12) * (top - 4.5);
        const [x, y] = k.p(c + 0.15, c, z);
        const a = (i & 1 ? -0.4 : -Math.PI + 0.4) + (hash(v.seed, i, 15) - 0.5) * 0.5;
        leaf(k, x, y, a, (1.9 + hash(v.seed, i, 16) * 0.6) * S, 0.75 * S, i % 3 ? C.leaf : '#4f8a46');
      }
      const [tx, ty] = k.p(c + 0.2, c, top);
      leaf(k, tx, ty, -Math.PI / 2, 1.8 * S, 0.7 * S, C.leafLight);
    } else if (kind === 2) {
      // snake plant: tall striped blades
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.11 + (hash(v.seed, i, 17) - 0.5) * 0.08;
        const L = (6.5 + hash(v.seed, i, 18) * 4) * S;
        leaf(k, bx + (i - 4) * 0.22 * S, by, a, L, 0.55 * S, i & 1 ? '#4f8a4a' : '#6fa35a');
      }
    } else {
      // a round bushy fern
      for (let i = 0; i < 16; i++) {
        const a = -Math.PI / 2 + (i - 7.5) * 0.21;
        leaf(k, bx, by - 0.4 * S, a, (4.6 + hash(v.seed, i, 19) * 2) * S, 0.55 * S, i & 1 ? C.leaf : C.leafLight);
      }
      crown(k, c, c, 3.9, 1.1, 0.8, 10, v.seed);
    }
  },
};

// The front half of a level circle (where basket weave shows).
function arc(cu: number, cv: number, z: number, r: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.25 + (i / 10) * 1.0);
    out.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r, z]);
  }
  return out;
}

// ── a floor lamp ────────────────────────────────────────────────────────────
// Brass, with a pleated cream shade and a fringe; its light pools on the
// floor round its foot.
const lamp: PropArt = {
  len: 5,
  dep: 5,
  height: 17,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    k.pool(c, c, 2.5, 2.5, '#ffd890', 0.5);
    k.shadow(c, c, 1.3, 1.3, 0.3);
    k.cyl(c, c, 0, 1.0, 0.3, C.brass);
    k.rod([[c, c, 0.3], [c, c, 13.2]], C.brass, 0.17);
    frustum(k, c, c, 13.0, 2.0, 15.6, 1.2, hash(v.seed, 21) < 0.5 ? '#f3e2bd' : '#e8c27a', '#fff3cf');
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i <= 14; i++) {
      const a = Math.PI * (0.05 + (0.9 * i) / 14) + 0.79;
      const [x0, y0] = k.p(c + Math.cos(a) * 2.0, c + Math.sin(a) * 2.0, 13.0);
      pen.moveTo(x0, y0);
      pen.lineTo(x0, y0 + 0.45 * k.s);
    }
    pen.strokeStyle = '#c98a3a';
    pen.lineWidth = Math.max(0.8, 0.1 * k.s);
    pen.stroke();
    k.halo(c, c, 14.2, 2.4, '#ffd890', 0.5);
  },
};

// ── the A-board ─────────────────────────────────────────────────────────────
// A chalkboard sign on the floor, chalked with a cup, a heart and lines
// that read as writing.
const aboard: PropArt = {
  len: 5,
  dep: 3,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 1.5, 2.6, 1.4, 0.25);
    const b = (fu: number, fz: number, back = false): P3 => (back ? [0.6 + fu * 3.8, 0.4 + fz * 1.0, fz * 7.4] : [0.6 + fu * 3.8, 2.7 - fz * 1.1, fz * 7.4]);
    // the back board's legs show past the front
    k.poly([b(0, 0, true), b(1, 0, true), b(1, 1, true), b(0, 1, true)], C.walnutDark, k.lw);
    k.poly([b(0, 0), b(1, 0), b(1, 1), b(0, 1)], k.side(C.walnut, 0, 1), k.lw);
    const ins = (fu: number, fz: number) => b(0.08 + fu * 0.84, 0.06 + fz * 0.88);
    const front = (fu: number, fz: number): P3 => {
      const p = ins(fu, fz);
      return [p[0], p[1] + 0.02, p[2]];
    };
    k.poly([front(0, 0), front(1, 0), front(1, 1), front(0, 1)], '#2f3a36', k.thin);
    const cw = Math.max(0.8, 0.13 * k.s);
    const squig = (f0: number, f1: number, fz: number, color: Color, w = cw) => {
      const pts: P3[] = [];
      for (let f = f0; f <= f1; f += 0.04) pts.push(front(f, fz + Math.sin(f * 40 + fz * 9) * 0.012));
      k.line(pts, color, w);
    };
    squig(0.2, 0.8, 0.86, '#f3d27a', Math.max(1, 0.2 * k.s));
    // a cup with steam
    const cu = 0.5;
    k.line([front(cu - 0.15, 0.62), front(cu - 0.1, 0.48), front(cu + 0.1, 0.48), front(cu + 0.15, 0.62), front(cu - 0.15, 0.62)], '#eae6da', cw);
    k.line([front(cu + 0.15, 0.6), front(cu + 0.22, 0.57), front(cu + 0.14, 0.52)], '#eae6da', cw);
    k.line([front(cu - 0.04, 0.66), front(cu, 0.72), front(cu - 0.04, 0.78)], '#eae6da', cw);
    k.line([front(cu + 0.06, 0.66), front(cu + 0.1, 0.72), front(cu + 0.06, 0.78)], '#eae6da', cw);
    for (let r = 0; r < 3; r++) squig(0.15, 0.45 + hash(v.seed, r, 31) * 0.4, 0.36 - r * 0.1, '#eae6da');
    // a heart
    const [hx, hy] = k.p(...front(0.78, 0.6));
    const hr = 0.35 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(hx, hy + hr);
    k.pen.bezierCurveTo(hx - hr * 1.6, hy, hx - hr * 0.6, hy - hr * 1.2, hx, hy - hr * 0.3);
    k.pen.bezierCurveTo(hx + hr * 0.6, hy - hr * 1.2, hx + hr * 1.6, hy, hx, hy + hr);
    k.pen.fillStyle = '#f2a7a0';
    k.pen.fill();
  },
};

// ── sacks of beans ──────────────────────────────────────────────────────────
// A slatted crate and two burlap sacks with painted stripes, one rolled
// open to show the beans with a scoop in them.
const sacks: PropArt = {
  len: 6,
  dep: 5,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2.5, 3.4, 2.8, 0.28);
    k.box(0.4, 0.4, 0, 2.6, 2.4, 2.3, '#c99a62', { stripe: false });
    for (const z of [0.75, 1.55]) k.line([[0.4, 2.8, z], [3.0, 2.8, z], [3.0, 0.4, z]], shade('#c99a62', -0.35), k.thin);
    sack(k, 1.7, 1.6, 2.3, 1.1, 2.6, false, v.seed);
    sack(k, 4.3, 1.9, 0, 1.45, 3.6, true, v.seed + 1);
    sack(k, 2.4, 3.9, 0, 1.15, 2.8, false, v.seed + 2);
  },
};

// A lumpy burlap sack on z, r across and h tall; open ones show beans.
function sack(k: Kit, cu: number, cv: number, z: number, r: number, h: number, open: boolean, seed: number): void {
  const base = '#c8a874';
  k.shadow(cu, cv, r * 1.1, r * 1.1, 0.22, z);
  const e0 = k.ell(cu, cv, z + 0.2, r);
  const e1 = k.ell(cu, cv, z + h, r * (open ? 0.92 : 0.45));
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e0.cx - e0.rx, e0.cy);
  pen.bezierCurveTo(e0.cx - e0.rx * 1.12, (e0.cy + e1.cy) / 2, e1.cx - e1.rx * 1.05, e1.cy + (e0.cy - e1.cy) * 0.2, e1.cx - e1.rx, e1.cy);
  pen.lineTo(e1.cx + e1.rx, e1.cy);
  pen.bezierCurveTo(e1.cx + e1.rx * 1.05, e1.cy + (e0.cy - e1.cy) * 0.2, e0.cx + e0.rx * 1.12, (e0.cy + e1.cy) / 2, e0.cx + e0.rx, e0.cy);
  pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createLinearGradient(e0.cx - e0.rx, 0, e0.cx + e0.rx, 0);
  g.addColorStop(0, shade(base, 0.12));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.25));
  k.paint(g, k.lw);
  // painted bands
  const band = hash(seed, 41) < 0.5 ? '#9c3b32' : '#3f6e5a';
  for (const f of [0.38, 0.5]) {
    const y = e0.cy + (e1.cy - e0.cy) * f;
    const half = e0.rx * (1.05 - f * 0.3);
    pen.beginPath();
    pen.moveTo(e0.cx - half, y);
    pen.quadraticCurveTo(e0.cx, y + e0.ry * 0.8, e0.cx + half, y);
    pen.strokeStyle = band;
    pen.lineWidth = Math.max(0.9, 0.16 * k.s);
    pen.stroke();
  }
  if (open) {
    pen.beginPath();
    pen.ellipse(e1.cx, e1.cy, e1.rx, e1.ry, 0, 0, Math.PI * 2);
    k.paint(shade(base, 0.15), k.lw);
    pen.beginPath();
    pen.ellipse(e1.cx, e1.cy + e1.ry * 0.1, e1.rx * 0.8, e1.ry * 0.7, 0, 0, Math.PI * 2);
    k.paint('#4a2a18', 0);
    if (k.fine) {
      for (let i = 0; i < 14; i++) {
        const x = e1.cx + (hash(seed, i, 42) - 0.5) * e1.rx * 1.4;
        const y = e1.cy + (hash(seed, i, 43) - 0.5) * e1.ry * 1.1;
        pen.beginPath();
        pen.ellipse(x, y, 0.16 * k.s, 0.11 * k.s, hash(seed, i, 44) * 3, 0, Math.PI * 2);
        pen.fillStyle = '#7a4a2a';
        pen.fill();
      }
    }
    k.rod([[cu + 0.2, cv, z + h + 0.1], [cu + 0.9, cv + 0.2, z + h + 1.0]], C.chrome, 0.12);
  } else {
    // the tied neck
    const [nx, ny] = k.p(cu, cv, z + h + 0.35);
    pen.beginPath();
    pen.ellipse(nx, ny, e1.rx * 0.8, e1.rx * 0.5, 0, 0, Math.PI * 2);
    k.paint(shade(base, 0.1), k.thin);
    k.line([[cu - r * 0.4, cv, z + h - 0.05], [cu + r * 0.4, cv, z + h - 0.05]], '#8a5a35', Math.max(0.9, 0.14 * k.s));
  }
}

// Interleaved so the first few fit in any room: tables and plants first.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: bistro, count: 2, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
  { art: lamp, count: 1, place: 'floor' },
  { art: sacks, count: 1, place: 'floor' },
  { art: bistro, count: 2, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
  { art: aboard, count: 1, place: 'floor' },
  { art: lamp, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: bistro, count: 3, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
  { art: sacks, count: 1, place: 'floor' },
];

export const DECOR_ART = { bistro, plant, lamp, aboard, sacks };
