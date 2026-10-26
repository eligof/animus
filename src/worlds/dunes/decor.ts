import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { band, barrelSide, bottle, crate, gear, glass, jug, keg, lathe, rivets, sack, seams, tube, tubeLamp } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf, withAlpha } from './kit.ts';

// The outpost's furniture between the stations, in the clutter a drifters'
// bar and workshop gathers: a plank rack of barrels on their sides with a
// keg on tap, crates and drums stacked two high, bolted scrap boxes and
// leaning sheet, sacks of grain, a strapped chest, a riveted water tank;
// out on the deck, trestle tables with their benches, cold tube lamps on
// poles, a bedroll, a perforated mat with a toolbox on it, steel drums and
// cacti in clay pots. All still (drawn once into the scene's static
// layer), each on its own soft shadow, varied by the placement's seed.

// ── a barrel ─────────────────────────────────────────────────────────────────
// By seed: a steel drum, painted once and rusting through, ribbed, its lid
// with a bung; or a wooden barrel of staves in iron hoops, a tin cup left
// on its lid.
const barrel: PropArt = {
  len: 4,
  dep: 4,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 1.9, 1.9, 0.3);
    if (hash(v.seed, 1) < 0.55) drum(k, c, v.seed);
    else cask(k, c, v.seed);
  },
};

function drum(k: Kit, c: number, seed: number): void {
  const paints: readonly Color[] = ['#a8653f', '#6f9f96', '#8a8f6a', '#b0473a', '#9c958a'];
  const paint = paints[Math.floor(hash(seed, 2) * paints.length)];
  const r = 1.55;
  const h = 5.3;
  lathe(k, c, c, 0, [[0, r - 0.05], [0.15, r], [h - 0.15, r], [h, r - 0.05]], paint, { lid: shade(paint, 0.1) });
  // ribs: a dark line under a lit one
  for (const z of [1.75, 3.55]) {
    band(k, c, c, z, r * 1.01, withAlpha(INK, 0.55), Math.max(0.8, 0.14 * k.s));
    band(k, c, c, z + 0.18, r * 1.01, withAlpha('#fff2d8', 0.35), Math.max(0.6, 0.1 * k.s));
  }
  // rust through the paint, low down and in runs from the rim
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = -Math.PI / 4 + 0.4 + hash(seed, i, 3) * (Math.PI - 0.8);
    const u = c + Math.cos(a) * r;
    const w = c + Math.sin(a) * r;
    const z0 = h - 0.2;
    const len = 1 + hash(seed, i, 4) * 2.2;
    k.trace([[u - 0.18, w, z0], [u + 0.2, w, z0], [u + 0.06, w, z0 - len], [u - 0.1, w, z0 - len * 0.7]]);
  }
  pen.fillStyle = withAlpha(C.rust, 0.5);
  pen.fill();
  // patches rusting through low down, on the side the viewer sees
  pen.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = -Math.PI / 4 + 0.5 + hash(seed, i, 5) * (Math.PI - 1.0);
    const [x, y] = k.p(c + Math.cos(a) * r, c + Math.sin(a) * r, 0.95 + hash(seed, i, 6) * 0.7);
    const rr = (0.3 + hash(seed, i, 7) * 0.25) * k.s;
    pen.moveTo(x + rr, y);
    pen.ellipse(x, y, rr, rr * 0.8, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha(C.rust, 0.55);
  pen.fill();
  // the lid: a rim, a bung and a vent
  const e = k.ell(c, c, h, r * 0.82);
  pen.beginPath();
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
  pen.strokeStyle = withAlpha(INK, 0.45);
  pen.lineWidth = Math.max(0.6, 0.08 * k.s);
  pen.stroke();
  k.cyl(c + 0.6, c - 0.35, h, 0.28, 0.15, shade(C.scrap, 0.1), { line: k.thin });
  k.disc(c - 0.6, c + 0.3, h + 0.01, 0.18, C.scrapDark, 0);
}

function cask(k: Kit, c: number, seed: number): void {
  const wood = mix(C.woodLight, C.hide, hash(seed, 7) * 0.5);
  const r = 1.5;
  const h = 5.0;
  lathe(k, c, c, 0, [[0, r * 0.84], [h * 0.25, r * 0.97], [h * 0.5, r], [h * 0.75, r * 0.97], [h, r * 0.84]], wood, { lid: shade(wood, 0.12) });
  // staves
  if (k.s >= 3) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (0.12 + (i / 6) * 0.76) - Math.PI / 4;
      const col = (z: number, rr: number): [number, number] => k.p(c + Math.cos(a + Math.PI / 4) * rr, c + Math.sin(a + Math.PI / 4) * rr, z);
      const pts = [col(0.05, r * 0.84), col(h * 0.5, r), col(h - 0.05, r * 0.84)];
      pen.moveTo(pts[0][0], pts[0][1]);
      pen.quadraticCurveTo(2 * pts[1][0] - (pts[0][0] + pts[2][0]) / 2, 2 * pts[1][1] - (pts[0][1] + pts[2][1]) / 2, pts[2][0], pts[2][1]);
    }
    pen.strokeStyle = withAlpha(INK, 0.35);
    pen.lineWidth = Math.max(0.6, 0.07 * k.s);
    pen.stroke();
  }
  // hoops
  for (const [z, rr] of [[0.6, r * 0.88], [1.6, r * 0.98], [h - 1.6, r * 0.98], [h - 0.6, r * 0.88]] as const) {
    band(k, c, c, z, rr * 1.015, INK, Math.max(1.4, 0.3 * k.s + k.thin));
    band(k, c, c, z, rr * 1.015, C.scrapDark, Math.max(0.8, 0.3 * k.s));
  }
  // lid boards and a tin cup left on it
  const seg: Array<[P3, P3]> = [];
  for (const d of [-0.45, 0.45]) seg.push([[c + d - 0.6, c - 0.9 - d * 0.2, h + 0.01], [c + d + 0.6, c + 0.9 - d * 0.2, h + 0.01]]);
  k.segs(seg, withAlpha(INK, 0.35), Math.max(0.6, 0.07 * k.s));
  if (hash(seed, 8) < 0.6) glass(k, c + 0.4, c + 0.3, h, 0.32, 0.6, false);
}

// ── the water tank ───────────────────────────────────────────────────────────
// A riveted tank on four iron legs with cross braces, a hatch on its domed
// top; a pipe down to a brass tap, a bucket under it with a little water.
const tank: PropArt = {
  len: 7,
  dep: 5,
  height: 12,
  draw(v: PropView): void {
    const k = kitOf(v);
    const cu = 3.0;
    const cv = 2.4;
    const r = 2.15;
    const z0 = 4.6;
    k.shadow(3.6, 2.6, 3.6, 2.6, 0.3);
    // the legs and braces (the back ones first)
    const legs: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (const [a, b] of legs) k.box(cu + a * 1.55 - 0.2, cv + b * 1.55 - 0.2, 0, 0.4, 0.4, z0 + 0.3, C.scrapDark, { line: k.thin });
    k.rod([[cu - 1.55, cv + 1.55, 0.6], [cu + 1.55, cv + 1.55, z0 - 0.4]], C.scrapDark, 0.1);
    k.rod([[cu + 1.55, cv + 1.55, 0.6], [cu - 1.55, cv + 1.55, z0 - 0.4]], C.scrapDark, 0.1);
    k.rod([[cu + 1.55, cv - 1.55, 0.6], [cu + 1.55, cv + 1.55, z0 - 0.4]], C.scrapDark, 0.1);
    // the pipe down to the tap
    k.rod([[cu + 0.9, cv + 1.2, z0], [cu + 0.9, cv + 1.6, 3.2], [4.9, 3.9, 3.2]], shade(C.scrap, -0.1), 0.2);
    k.cyl(4.9, 3.9, 2.85, 0.24, 0.55, C.brass, { line: k.thin });
    k.rod([[4.9, 3.9, 3.5], [4.9, 3.9, 3.95], [5.3, 3.9, 3.95]], C.brassDark, 0.08);
    // the bucket and its water, a drop on its way
    k.shadow(5.4, 4.1, 0.9, 0.8, 0.25);
    lathe(k, 5.2, 4.0, 0, [[0, 0.55], [1.25, 0.72]], shade(C.scrap, 0.08), { mouth: '#7ab8c0' });
    k.rod([[4.5, 4.0, 1.25], [5.2, 4.0, 2.05], [5.9, 4.0, 1.25]], C.scrapDark, 0.05);
    const [dx, dy] = k.p(4.92, 3.9, 2.3);
    k.pen.beginPath();
    k.pen.ellipse(dx, dy, 0.1 * k.s, 0.16 * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = '#bfe4ea';
    k.pen.fill();
    // the tank: a riveted drum, a band of rust where water has run
    const body = '#8f9a8e';
    lathe(k, cu, cv, z0, [[0, r * 0.94], [0.3, r], [5.6, r], [6.0, r * 0.94], [6.5, r * 0.55], [6.7, 0.5]], body);
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (0.1 + hash(v.seed, i, 3) * 0.8);
      const u = cu + Math.cos(a) * r;
      const w = cv + Math.sin(a) * r;
      const len = 1.2 + hash(v.seed, i, 4) * 2.5;
      k.trace([[u - 0.2, w, z0 + 5.4], [u + 0.22, w, z0 + 5.4], [u + 0.08, w, z0 + 5.4 - len], [u - 0.1, w, z0 + 5.4 - len * 0.6]]);
    }
    pen.fillStyle = withAlpha(C.rust, 0.5);
    pen.fill();
    // seams with rows of rivets
    for (const z of [z0 + 0.35, z0 + 2.9, z0 + 5.6]) {
      band(k, cu, cv, z, r * 1.01, withAlpha(INK, 0.6), Math.max(0.8, 0.1 * k.s));
      if (k.s >= 3) {
        const dots: P3[] = [];
        // round the side that faces the viewer
        for (let i = 0; i <= 10; i++) {
          const a = -Math.PI / 4 + 0.15 + (i / 10) * (Math.PI - 0.3);
          dots.push([cu + Math.cos(a) * r, cv + Math.sin(a) * r, z + 0.28]);
        }
        rivets(k, dots, shade(body, -0.25), 0.1);
      }
    }
    // the hatch on top
    k.cyl(cu, cv, z0 + 6.6, 0.55, 0.3, shade(body, -0.1), { line: k.thin });
    k.rod([[cu - 0.3, cv, z0 + 7.0], [cu, cv, z0 + 7.25], [cu + 0.3, cv, z0 + 7.0]], C.scrapDark, 0.07);
    // a gauge glass up its side
    k.line([[cu + 0.4, cv + r, z0 + 0.8], [cu + 0.4, cv + r, z0 + 4.8]], INK, Math.max(1.4, 0.24 * k.s + k.thin));
    k.line([[cu + 0.4, cv + r, z0 + 0.8], [cu + 0.4, cv + r, z0 + 4.8]], '#bfe0e0', Math.max(0.8, 0.24 * k.s));
    k.line([[cu + 0.4, cv + r, z0 + 0.8], [cu + 0.4, cv + r, z0 + 2.9]], '#4f9aa8', Math.max(0.8, 0.24 * k.s));
  },
};

// ── a cactus in a pot ────────────────────────────────────────────────────────
// By seed: a prickly pear of flat paddles with a flower or two, or a
// ribbed column with an arm, in a clay pot.
const cactus: PropArt = {
  len: 4,
  dep: 4,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 1.5, 1.5, 0.28);
    // a wide planter, a painted band round its rim, sandy soil in it
    const clay = hash(v.seed, 1) < 0.5 ? C.clay : '#b8784a';
    lathe(k, c, c, 0, [[0, 0.8], [0.2, 0.92], [1.35, 1.12], [1.45, 1.22], [1.75, 1.24]], clay, { mouth: '#9a7448' });
    band(k, c, c, 1.6, 1.24, hash(v.seed, 2) < 0.5 ? C.cream : C.turquoise, Math.max(0.8, 0.14 * k.s));
    k.disc(c, c, 1.7, 1.02, '#c9a46a', 0);
    if (hash(v.seed, 3) < 0.5) paddles(k, c, c, 1.65, v.seed);
    else column(k, c, c, 1.65, v.seed);
  },
};

// Flat oval paddles growing out of each other; spines; flowers on top.
function paddles(k: Kit, cu: number, cv: number, z: number, seed: number): void {
  const pen = k.pen;
  const pad = (u: number, w: number, zc: number, rw: number, rh: number, tilt: number, c: Color) => {
    const [x, y] = k.p(u, w, zc);
    pen.beginPath();
    pen.ellipse(x, y, rw * k.s, rh * k.s, tilt, 0, Math.PI * 2);
    const g = pen.createRadialGradient(x - rw * k.s * 0.35, y - rh * k.s * 0.35, 0, x, y, Math.max(rw, rh) * k.s * 1.1);
    g.addColorStop(0, shade(c, 0.18));
    g.addColorStop(1, shade(c, -0.12));
    k.paint(g, k.thin);
    if (k.s >= 4) {
      pen.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = hash(seed, Math.floor(zc * 10), i) * Math.PI * 2;
        const rr = 0.55 * hash(seed, i, Math.floor(u * 7));
        const sx = x + Math.cos(a) * rw * k.s * rr;
        const sy = y + Math.sin(a) * rh * k.s * rr;
        pen.moveTo(sx + 0.7, sy);
        pen.arc(sx, sy, Math.max(0.6, 0.07 * k.s), 0, Math.PI * 2);
      }
      pen.fillStyle = '#f6eccc';
      pen.fill();
    }
  };
  const tip = (u: number, w: number, zc: number) => {
    const [x, y] = k.p(u, w, zc);
    pen.beginPath();
    pen.ellipse(x, y, 0.32 * k.s, 0.26 * k.s, 0, 0, Math.PI * 2);
    k.paint(hash(seed, 9) < 0.5 ? '#e8607a' : '#f2b13c', k.thin * 0.8);
  };
  pad(cu, cv, z + 1.6, 1.0, 1.4, 0.1, C.cactusDark);
  pad(cu - 0.9, cv + 0.2, z + 3.3, 0.8, 1.05, -0.5, C.cactus);
  pad(cu + 0.8, cv + 0.3, z + 3.0, 0.75, 1.0, 0.45, C.cactus);
  pad(cu + 0.15, cv + 0.5, z + 4.3, 0.65, 0.85, 0.1, shade(C.cactus, 0.06));
  tip(cu - 1.3, cv + 0.2, z + 4.35);
  tip(cu + 0.3, cv + 0.5, z + 5.1);
}

// A ribbed column cactus with one arm, its top rounded, a flower on it.
function column(k: Kit, cu: number, cv: number, z: number, seed: number): void {
  const side = hash(seed, 4) < 0.5 ? -1 : 1;
  const arm = (u0: number, zb: number, zt: number, dir: number) => {
    // out from the trunk, then up
    k.rod([[u0, cv + 0.1, zb], [u0 + dir * 1.1, cv + 0.1, zb + 0.2], [u0 + dir * 1.25, cv + 0.1, zt]], C.cactusDark, 0.5);
    k.rod([[u0, cv + 0.1, zb], [u0 + dir * 1.1, cv + 0.1, zb + 0.2], [u0 + dir * 1.25, cv + 0.1, zt]], C.cactus, 0.42);
    const [x, y] = k.p(u0 + dir * 1.25, cv + 0.1, zt);
    k.pen.beginPath();
    k.pen.arc(x, y, 0.42 * k.s * 0.5, 0, Math.PI * 2);
    k.pen.fillStyle = shade(C.cactus, 0.12);
    k.pen.fill();
  };
  arm(cu + side * 0.4, z + 1.6, z + 3.4, side);
  lathe(k, cu, cv, z, [[0, 0.62], [3.7, 0.66], [4.3, 0.55], [4.7, 0.3], [4.85, 0.05]], C.cactus);
  // ribs up the trunk
  if (k.s >= 3) {
    const seg: Array<[P3, P3]> = [];
    for (const a of [0.9, 1.5, 2.1]) {
      const da = a - Math.PI / 4;
      seg.push([[cu + Math.cos(da) * 0.6, cv + Math.sin(da) * 0.6, z + 0.2], [cu + Math.cos(da) * 0.58, cv + Math.sin(da) * 0.58, z + 4.2]]);
    }
    k.segs(seg, withAlpha(C.cactusDark, 0.85), Math.max(0.6, 0.08 * k.s), 'round');
  }
  if (hash(seed, 5) < 0.6) arm(cu - side * 0.45, z + 2.4, z + 3.7, -side);
  const [x, y] = k.p(cu, cv, z + 4.95);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.pen.beginPath();
    k.pen.ellipse(x + Math.cos(a) * 0.2 * k.s, y + Math.sin(a) * 0.14 * k.s, 0.2 * k.s, 0.13 * k.s, a, 0, Math.PI * 2);
    k.paint('#f4d65a', k.thin * 0.6);
  }
}

// ── the barrel rack ──────────────────────────────────────────────────────────
// A plank rack of three barrels on their sides, two below and one nestled
// on top, their heads toward the room (one on tap); beside it an upright
// keg with a bent pipe up out of its lid to a tap.
const kegs: PropArt = {
  len: 12,
  dep: 5,
  height: 9.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 2.6, 6.4, 2.8, 0.3);
    const r = 1.7;
    const v0 = 0.5;
    const len = 3.9;
    // the rack: rails under the barrels, posts at its ends
    for (const vv of [0.7, 3.6]) k.box(0.2, vv, 0, 7.6, 0.55, 0.55, C.woodDark, { line: k.thin });
    for (const u of [0.15, 7.45]) k.box(u, 0.5, 0, 0.45, 0.45, 6.6, C.wood, { line: k.thin });
    const zc = 0.55 + r;
    barrelSide(k, 2.1, v0, zc, r, len, C.stave, false);
    barrelSide(k, 5.7, v0, zc, r, len, mix(C.stave, C.woodLight, 0.4), hash(v.seed, 1) < 0.6);
    barrelSide(k, 3.9, v0 + 0.15, zc + r * 1.72, r, len - 0.3, shade(C.stave, 0.06), true);
    for (const u of [0.15, 7.45]) k.box(u, 3.9, 0, 0.45, 0.45, 6.6, C.wood, { line: k.thin });
    k.box(0.15, 0.5, 6.6, 7.75, 3.85, 0.4, C.woodLight, { line: k.thin, top: shade(C.woodLight, 0.12) });
    // the keg on tap, a tin cup under its tap
    k.shadow(10.0, 2.6, 1.8, 1.6, 0.25);
    keg(k, 9.9, 2.4, 0, 1.55, 6.0, shade(C.stave, -0.04), 1);
    glass(k, 11.0, 3.9, 0, 0.32, 0.7, false);
  },
};

// ── crates and drums, two high ───────────────────────────────────────────────
// A big crate with a drum (or a hooped cask) on it, a stack of two crates
// beside it, a bolted scrap box in front now and then; mirrored by seed.
const stack: PropArt = {
  len: 9,
  dep: 6,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4.5, 3, 4.8, 3.2, 0.3);
    const flip = hash(v.seed, 1) < 0.5;
    const U = (u: number, w: number) => (flip ? 9 - u - w : u);
    const woods = [C.woodLight, mix(C.woodLight, C.hide, 0.4), '#b4895a'] as const;
    const wood = (i: number) => woods[(i + v.seed) % woods.length];
    // the stack of two (drawn first when it is the farther one)
    const two = () => {
      crate(k, U(4.9, 3.8), 0.5, 0, 3.8, 3.6, 3.3, wood(1));
      crate(k, U(5.25, 3.0), 0.75, 3.3, 3.0, 3.0, 2.6, wood(2));
    };
    const big = () => {
      crate(k, U(0.3, 4.3), 0.3, 0, 4.3, 4.2, 3.7, wood(0));
      const cu = U(0.3, 4.3) + 2.15;
      if (hash(v.seed, 2) < 0.55) drumOn(k, cu, 2.4, 3.7, v.seed);
      else caskOn(k, cu, 2.4, 3.7, v.seed);
    };
    if (flip) {
      two();
      big();
    } else {
      big();
      two();
    }
    // in front: a scrap box or a sack
    if (hash(v.seed, 3) < 0.5) scrapBox(k, U(2.0, 3.0), 4.4, 0, 3.0, 1.5, 1.6, v.seed);
    else {
      k.shadow(U(6.3, 0) + (flip ? -1.0 : 1.0), 5.0, 1.1, 0.9, 0.22);
      sack(k, U(6.8, 0), 4.9, 0, 0.95, 2.4, C.burlap);
    }
  },
};

function drumOn(k: Kit, cu: number, cv: number, z: number, seed: number): void {
  const paints: readonly Color[] = ['#a8653f', '#6f9f96', '#8a8f6a', '#9c958a'];
  const paint = paints[Math.floor(hash(seed, 4) * paints.length)];
  lathe(k, cu, cv, z, [[0, 1.3], [4.2, 1.3]], paint, { lid: shade(paint, 0.1) });
  for (const dz of [1.4, 2.8]) band(k, cu, cv, z + dz, 1.31, withAlpha(INK, 0.55), Math.max(0.8, 0.14 * k.s));
  k.cyl(cu + 0.5, cv - 0.3, z + 4.2, 0.24, 0.14, C.scrap, { line: k.thin });
}

function caskOn(k: Kit, cu: number, cv: number, z: number, seed: number): void {
  const r = 1.25;
  const h = 3.8;
  const wood = mix(C.stave, C.hide, hash(seed, 5) * 0.4);
  lathe(k, cu, cv, z, [[0, r * 0.84], [h * 0.5, r], [h, r * 0.84]], wood, { lid: shade(wood, 0.12) });
  for (const [dz, rr] of [[0.5, 0.9], [h - 0.5, 0.9]] as const) {
    band(k, cu, cv, z + dz, r * rr * 1.02, INK, Math.max(1.4, 0.26 * k.s + k.thin));
    band(k, cu, cv, z + dz, r * rr * 1.02, C.hoop, Math.max(0.8, 0.26 * k.s));
  }
}

// A box of bolted scrap plate, rust at its edges, a little round port.
function scrapBox(k: Kit, u0: number, v0: number, z0: number, du: number, dv: number, dz: number, seed: number): void {
  const paint = hash(seed, 6) < 0.3 ? '#5f9a92' : C.plate;
  k.box(u0, v0, z0, du, dv, dz, paint, { line: k.lw });
  const F = v0 + dv + 0.01;
  k.poly([[u0, F, z0], [u0 + du, F, z0], [u0 + du, F, z0 + 0.35], [u0 + du * 0.6, F, z0 + 0.55], [u0, F, z0 + 0.3]], withAlpha(k.side(C.rust, 0, 1), 0.7), 0);
  if (k.s >= 3) {
    const dots: P3[] = [];
    for (let i = 0; i <= 4; i++) dots.push([u0 + 0.25 + (i * (du - 0.5)) / 4, F, z0 + dz - 0.25], [u0 + 0.25 + (i * (du - 0.5)) / 4, F, z0 + 0.25]);
    rivets(k, dots, C.plateDark, 0.09);
  }
  k.face(u0 + du * 0.62, F, z0 + dz * 0.55, Math.min(0.5, dz * 0.28), C.steelLight, k.thin, 14);
}

// ── a trestle table and its benches ──────────────────────────────────────────
// Planks on two trestles, iron straps across them; a bench either side;
// mugs, a jug and a bowl left out on it.
const trestle: PropArt = {
  len: 12,
  dep: 7,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(6, 3.5, 6.6, 3.8, 0.28);
    const bench = (v0: number) => {
      for (const u of [1.0, 10.5]) for (const dv of [0.15, 0.85]) k.box(u, v0 + dv, 0, 0.35, 0.3, 1.9, C.woodDark, { line: k.thin });
      k.box(0.5, v0, 1.9, 11, 1.3, 0.45, C.plank, { line: k.thin });
    };
    bench(0.3);
    // the trestles: legs splayed out, a stretcher between
    for (const u of [1.8, 10.0]) {
      k.rod([[u, 2.6, 3.6], [u, 2.1, 0]], C.woodDark, 0.32);
      k.rod([[u, 4.6, 3.6], [u, 5.1, 0]], C.woodDark, 0.32);
      k.rod([[u, 2.4, 1.6], [u, 4.8, 1.6]], C.wood, 0.2);
    }
    k.rod([[1.8, 3.6, 1.3], [10.0, 3.6, 1.3]], C.wood, 0.22);
    // the top: three planks, two straps
    k.box(0.4, 2.1, 3.6, 11.2, 3.0, 0.55, C.plankLight, { line: k.lw });
    seams(k, 0.4, 2.1, 3.6, 11.2, 3.0, 0.55, 1, 3);
    for (const u of [2.6, 9.2]) {
      k.poly([[u, 2.1, 4.16], [u + 0.45, 2.1, 4.16], [u + 0.45, 5.1, 4.16], [u, 5.1, 4.16]], C.hoop, 0);
      k.poly([[u, 5.11, 3.6], [u + 0.45, 5.11, 3.6], [u + 0.45, 5.11, 4.15], [u, 5.11, 4.15]], C.hoop, 0);
      if (k.s >= 3) rivets(k, [[u + 0.22, 2.5, 4.17], [u + 0.22, 4.7, 4.17]], '#3e3a36', 0.08);
    }
    // what is left on it
    const zt = 4.15;
    const s = v.seed;
    glass(k, 2.0, 3.2, zt, 0.34, 0.8, false);
    glass(k, 4.4, 4.2, zt, 0.32, 0.75, hash(s, 1) < 0.5);
    jug(k, 6.3, 3.3, zt, 0.55, 1.5, hash(s, 2) < 0.5 ? C.clay : '#d08a52');
    lathe(k, 8.3, 3.8, zt, [[0, 0.35], [0.4, 0.75]], C.cream, { mouth: '#d8c49a', line: k.thin });
    if (hash(s, 3) < 0.6) bottle(k, 10.3, 3.3, zt, 1.7, '#4f8a5a', 0.28);
    else glass(k, 10.2, 3.6, zt, 0.32, 0.75, false);
    bench(5.5);
  },
};

// ── a tube lamp on a pole ────────────────────────────────────────────────────
// A thin rusty post on three splayed feet carrying a cold-white tube, its
// cable trailing off down the post; a faint pool of light round it.
const lamp: PropArt = {
  len: 3,
  dep: 3,
  height: 16,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 1.5;
    k.pool(c, c, 2.2, 2.2, C.tubeGlow, 0.16);
    k.shadow(c, c, 1.1, 1.1, 0.3);
    k.line([[c - 0.2, c + 0.5, 0.05], [c - 0.9, c + 1.2, 0.03], [c - 1.4, c + 1.3, 0.03]], '#2e2620', Math.max(0.8, 0.1 * k.s));
    // three feet splayed from a collar, the post up from it
    for (const a of [0.5, 2.6, 4.7]) k.rod([[c + Math.cos(a) * 0.15, c + Math.sin(a) * 0.15, 1.6], [c + Math.cos(a) * 1.15, c + Math.sin(a) * 1.15, 0]], C.rustDark, 0.16);
    k.cyl(c, c, 1.3, 0.3, 0.6, C.steelDark, { line: k.thin });
    k.rod([[c, c, 1.8], [c, c, 10.6]], C.rustDark, 0.22);
    k.line([[c + 0.22, c, 1.9], [c + 0.22, c, 10.4]], withAlpha('#2e2620', 0.9), Math.max(0.7, 0.08 * k.s));
    tubeLamp(k, c, c, 10.75, 4.6, 0.3);
  },
};

// ── a bedroll ────────────────────────────────────────────────────────────────
// A padded roll laid out flat, its blanket folded back, the far end still
// rolled and strapped; a pack for a pillow and a canteen by it.
const bedroll: PropArt = {
  len: 9,
  dep: 4,
  height: 2.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4.5, 2, 4.6, 2.1, 0.24);
    const roll = C.bedroll;
    k.box(0.4, 0.5, 0, 7.0, 2.9, 0.45, roll, { round: 0.2, top: shade(roll, 0.12) });
    // the blanket over most of it, folded back at the head
    const blanket = hash(v.seed, 1) < 0.5 ? '#6f9f96' : '#b0583a';
    k.box(2.6, 0.45, 0.45, 4.8, 3.0, 0.3, blanket, { round: 0.15, top: shade(blanket, 0.1) });
    k.box(2.4, 0.45, 0.75, 0.9, 3.0, 0.25, shade(blanket, 0.08), { round: 0.12 });
    if (k.s >= 3) k.segs([[[3.8, 0.5, 0.76], [3.8, 3.4, 0.76]], [[5.6, 0.5, 0.76], [5.6, 3.4, 0.76]]], withAlpha(INK, 0.3), Math.max(0.6, 0.07 * k.s));
    // the rolled end, strapped
    tube(k, [8.1, 0.45, 0.75], [8.1, 3.45, 0.75], 0.75, 0.75, roll, shade(roll, 0.15));
    for (const w of [1.1, 2.8]) {
      const pts = [] as P3[];
      for (let i = 0; i <= 8; i++) {
        const a = -Math.PI / 4 + (Math.PI * i) / 8;
        pts.push([8.1 + Math.cos(a) * 0.78, w, 0.75 + Math.sin(a) * 0.78]);
      }
      k.line(pts, INK, Math.max(1.4, 0.2 * k.s + k.thin));
      k.line(pts, '#5a3a22', Math.max(0.8, 0.2 * k.s));
    }
    // the pack and the canteen
    k.box(0.5, 0.8, 0.45, 1.7, 2.3, 1.1, C.hideDark, { round: 0.4, top: shade(C.hideDark, 0.12) });
    k.line([[0.8, 3.12, 1.45], [0.9, 3.12, 0.7], [1.9, 3.12, 0.7]], '#5a3a22', Math.max(0.7, 0.1 * k.s));
    lathe(k, 0.9, 3.75, 0, [[0, 0.2], [0.2, 0.5], [0.85, 0.5], [1.05, 0.2]], C.scrap, { line: k.thin });
  },
};

// ── a perforated mat ─────────────────────────────────────────────────────────
// A steel plate punched all over with holes, laid where the work is
// greasy: a toolbox on it, a cog and a spanner put down.
const mat: PropArt = {
  len: 7,
  dep: 5,
  height: 2,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.5, 2.5, 3.6, 2.6, 0.2);
    k.box(0.3, 0.3, 0, 6.4, 4.4, 0.18, C.steel, { line: k.thin, top: shade(C.steel, 0.1) });
    if (k.s >= 3) {
      const holes: P3[] = [];
      for (let u = 0.75; u < 6.5; u += 0.55) for (let w = 0.7; w < 4.5; w += 0.55) holes.push([u + (Math.round(w / 0.55) % 2) * 0.27, w, 0.19]);
      rivets(k, holes, withAlpha('#2e3238', 0.75), 0.08);
    }
    // the toolbox
    const tb = hash(v.seed, 1) < 0.5 ? '#a8453a' : '#3f8a84';
    k.box(3.6, 1.0, 0.18, 2.6, 1.4, 1.05, tb, { line: k.lw });
    k.rod([[4.1, 1.7, 1.23], [4.1, 1.7, 1.75], [5.7, 1.7, 1.75], [5.7, 1.7, 1.23]], C.steelDark, 0.12);
    k.line([[3.6, 2.41, 0.88], [6.2, 2.41, 0.88]], withAlpha(INK, 0.6), Math.max(0.6, k.thin * 0.7));
    // a cog and a spanner put down
    k.disc(1.7, 2.6, 0.2, 0.95, C.scrap, k.thin);
    k.disc(1.7, 2.6, 0.21, 0.3, '#3a3a38', 0);
    if (k.s >= 3) {
      const teeth: P3[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        teeth.push([1.7 + Math.cos(a) * 1.05, 2.6 + Math.sin(a) * 1.05, 0.21]);
      }
      rivets(k, teeth, C.scrap, 0.13);
    }
    k.rod([[3.2, 3.9, 0.25], [5.6, 3.5, 0.25]], C.steelLight, 0.2);
  },
};

// ── a strapped chest ─────────────────────────────────────────────────────────
// Planks bound in iron straps and corners, a lid, a hasp.
const chest: PropArt = {
  len: 5,
  dep: 3.5,
  height: 3.8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 1.8, 2.6, 1.8, 0.28);
    const wood = hash(v.seed, 1) < 0.5 ? C.wood : C.woodLight;
    k.box(0.35, 0.4, 0, 4.3, 2.7, 2.4, wood, { stripe: false });
    seams(k, 0.35, 0.4, 0, 4.3, 2.7, 2.4, 3, 0);
    k.box(0.25, 0.3, 2.4, 4.5, 2.9, 1.0, shade(wood, 0.08), { top: shade(wood, 0.16) });
    const F = 3.21;
    for (const u of [1.15, 3.45]) {
      k.poly([[u, F, 0.05], [u + 0.45, F, 0.05], [u + 0.45, F, 3.4], [u, F, 3.4]], k.side(C.hoop, 0, 1), k.thin);
      k.poly([[u, 0.3, 3.41], [u + 0.45, 0.3, 3.41], [u + 0.45, F, 3.41], [u, F, 3.41]], shade(C.hoop, 0.1), k.thin);
    }
    k.poly([[2.15, F + 0.02, 2.0], [2.85, F + 0.02, 2.0], [2.85, F + 0.02, 3.0], [2.15, F + 0.02, 3.0]], C.brass, k.thin);
    if (k.s >= 3) rivets(k, [[1.37, F + 0.02, 0.5], [1.37, F + 0.02, 1.7], [3.67, F + 0.02, 0.5], [3.67, F + 0.02, 1.7], [2.5, F + 0.03, 2.3]], '#3e3a36', 0.09);
  },
};

// ── sacks ────────────────────────────────────────────────────────────────────
// Three sacks of grain against the wall, tied at the neck, one smaller in
// front; a tin scoop on the floor.
const sacks: PropArt = {
  len: 6,
  dep: 4,
  height: 4.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2, 3.2, 2.1, 0.26);
    const pale = mix(C.burlap, '#efe2c4', 0.4);
    const a = hash(v.seed, 1) < 0.5;
    sack(k, 1.5, 1.4, 0, 1.2, 3.7, a ? C.burlap : pale);
    sack(k, 4.2, 1.5, 0, 1.25, 4.2, a ? pale : C.burlap);
    sack(k, 2.8, 2.8, 0, 1.0, 2.6, shade(C.burlap, -0.05));
    lathe(k, 5.0, 3.3, 0, [[0, 0.3], [0.45, 0.42]], C.scrap, { mouth: '#e8d6a6', line: k.thin });
  },
};

// ── scrap ────────────────────────────────────────────────────────────────────
// Salvage waiting for the bench: a bolted scrap box with a cog leant on
// it, a sheet of corrugated iron against the wall, lengths of pipe.
const scrap: PropArt = {
  len: 8,
  dep: 5,
  height: 5.5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 2.5, 4.2, 2.6, 0.28);
    // the sheet leant against the wall
    const s0 = 4.3;
    const s1 = 7.7;
    const sheet: P3[] = [[s0, 0.2, 5.3], [s1, 0.2, 5.3], [s1, 1.7, 0], [s0, 1.7, 0]];
    k.poly(sheet, k.side(hash(v.seed, 1) < 0.5 ? C.rust : C.plate, 0, 1, 0.1), k.lw);
    if (k.s >= 3) {
      const rib: Array<[P3, P3]> = [];
      for (let u = s0 + 0.45; u < s1 - 0.2; u += 0.55) rib.push([[u, 0.21, 5.2], [u, 1.71, 0.1]]);
      k.segs(rib, withAlpha(INK, 0.35), Math.max(0.6, 0.08 * k.s));
    }
    // the box and the cog leant on it
    scrapBox(k, 0.4, 0.4, 0, 3.6, 3.0, 3.3, v.seed);
    gear(k, 2.6, 3.55, 1.25, 1.2, 10, hash(v.seed, 2) < 0.5 ? C.scrapDark : C.brassDark);
    // pipes on the floor
    tube(k, [4.3, 3.0, 0.45], [7.7, 3.4, 0.45], 0.45, 0.45, C.pipe, '#3e4248');
    tube(k, [4.6, 4.1, 0.38], [7.4, 4.3, 0.38], 0.38, 0.38, shade(C.pipe, -0.1), '#3e4248');
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: stack, count: 1, place: 'wall' },
  { art: trestle, count: 1, place: 'floor' },
  { art: kegs, count: 1, place: 'wall' },
  { art: lamp, count: 1, place: 'floor' },
  { art: tank, count: 1, place: 'wall' },
  { art: bedroll, count: 1, place: 'floor' },
  { art: sacks, count: 1, place: 'wall' },
  { art: barrel, count: 1, place: 'floor' },
  { art: scrap, count: 1, place: 'wall' },
  { art: mat, count: 1, place: 'floor' },
  { art: chest, count: 1, place: 'wall' },
  { art: cactus, count: 1, place: 'floor' },
  { art: stack, count: 1, place: 'wall' },
  { art: trestle, count: 1, place: 'floor' },
  { art: barrel, count: 2, place: 'wall' },
  { art: lamp, count: 1, place: 'floor' },
  { art: sacks, count: 1, place: 'floor' },
  { art: cactus, count: 1, place: 'floor' },
  { art: chest, count: 1, place: 'floor' },
  { art: barrel, count: 1, place: 'floor' },
  { art: bedroll, count: 2, place: 'floor' },
  { art: stack, count: 1, place: 'floor' },
  { art: trestle, count: 1, place: 'floor' },
  { art: lamp, count: 1, place: 'floor' },
  { art: scrap, count: 1, place: 'floor' },
  { art: kegs, count: 1, place: 'floor' },
  { art: sacks, count: 1, place: 'wall' },
  { art: chest, count: 1, place: 'wall' },
];

export const DECOR_ART = { barrel, tank, cactus, kegs, stack, trestle, lamp, bedroll, mat, chest, sacks, scrap };
