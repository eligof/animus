import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { BANDS, checker, dot, fillPts, foldChair, frustum, hull, ring, sleeve, tin } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf, withAlpha } from './kit.ts';

// The shelter's furniture between the stations: a diner's kitchen (a
// rounded fridge, a counter and a chest soda cooler, all unbranded, on red
// and cream checker), steel shelves of canned food (plain bands, no labels
// to read), a bank of lockers, an iron cot, a chest of drawers with a lamp
// on it, an office water cooler, pedestal tables with folding chairs on
// rubber mats, olive water drums on a pallet and a mutant potted plant
// with a faint glow. All still
// (drawn once into the scene's static layer), each on its own soft shadow,
// varied by the placement's seed.

// ── shelves of tins ─────────────────────────────────────────────────────────
// A steel rack of four shelves stacked with tins in plain coloured bands,
// a jar or two and a carton on top.
const cans: PropArt = {
  len: 8,
  dep: 3,
  height: 13,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 1.6, 4.3, 1.8, 0.28);
    const posts: Array<[number, number]> = [[0.3, 0.3], [7.45, 0.3], [0.3, 2.45], [7.45, 2.45]];
    for (const [u, w] of posts.slice(0, 2)) k.box(u, w, 0, 0.25, 0.25, 12.0, C.steelDark, { line: k.thin, stripe: false });
    const shelves = [0.5, 3.6, 6.7, 9.8];
    shelves.forEach((z, i) => {
      k.box(0.3, 0.3, z, 7.4, 2.4, 0.25, C.steel, { line: k.thin });
      const top = z + 0.25;
      const sd = v.seed * 7 + i * 13;
      const kind = hash(sd, 1);
      if (i === 0 && kind < 0.5) {
        // a carton on the bottom shelf, tins beside it
        k.box(0.6, 0.6, top, 3.2, 1.9, 2.2, '#c49a62', { line: k.lw });
        k.line([[0.6, 2.51, top + 1.6], [3.8, 2.51, top + 1.6]], '#9a7444', Math.max(0.7, 0.1 * k.s));
        tinRow(k, 4.3, 7.4, top, sd, 2);
      } else if (kind < 0.25) {
        // preserves in jars, then tins
        for (let j = 0; j < 3; j++) jar(k, 1.0 + j * 1.1, 1.6, top, ['#c8463a', C.mustard, '#7fbf4a'][(sd + j) % 3]);
        tinRow(k, 4.1, 7.4, top, sd, 1);
      } else tinRow(k, 0.6, 7.4, top, sd, kind < 0.7 ? 2 : 1);
    });
    // the top: a carton and a stack of tins
    k.box(0.6, 0.5, 12.0, 3.0, 2.0, 0.25, C.steel, { line: k.thin });
    k.box(0.4, 0.3, 12.0, 7.4, 2.4, 0.2, C.steel, { line: k.thin });
    k.box(0.8, 0.6, 12.2, 2.6, 1.8, 0.8, '#b98a55', { line: k.thin });
    for (const [u, w] of posts.slice(2)) k.box(u, w, 0, 0.25, 0.25, 12.2, C.steelDark, { line: k.thin, stripe: false });
  },
};

// Tins along a shelf from u0 to u1: a back row and a front row, `high`
// tins to a stack.
function tinRow(k: Kit, u0: number, u1: number, z: number, seed: number, high: number): void {
  const r = 0.44;
  const h = 0.95;
  for (const [row, w] of [[0, 0.95], [1, 2.0]] as const) {
    let i = 0;
    for (let u = u0 + r; u <= u1 - r; u += 2 * r + 0.08, i++) {
      const band = BANDS[Math.floor(hash(seed, i, row + 3) * BANDS.length)];
      const stack = row === 0 ? high : Math.max(1, high - (hash(seed, i, 9) < 0.4 ? 1 : 0));
      for (let s = 0; s < stack; s++) tin(k, u, w, z + s * h, r, h - 0.02, band);
    }
  }
}

// A preserving jar: glass, the fruit in it, a lid.
function jar(k: Kit, u: number, v: number, z: number, fruit: Color): void {
  k.cyl(u, v, z, 0.45, 1.4, '#cfe0dc', { line: k.thin });
  sleeve(k, u, v, 0.42, z + 0.1, z + 1.1, withAlpha(fruit, 0.85));
  k.cyl(u, v, z + 1.4, 0.4, 0.22, C.brass, { line: k.thin });
}

// ── a bank of lockers ───────────────────────────────────────────────────────
// Three tall steel lockers on a plinth, vents at the top and the foot of
// each door, a handle, a blank card holder; a padlock on one.
const lockers: PropArt = {
  len: 9,
  dep: 3,
  height: 15,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4.5, 1.6, 4.8, 1.8, 0.3);
    const paint = hash(v.seed, 1) < 0.5 ? '#4f8f88' : '#6f8a62';
    k.box(0.3, 0.3, 0, 8.4, 2.4, 0.6, '#2b3330', { line: k.thin, stripe: false });
    k.box(0.3, 0.2, 0.6, 8.4, 2.5, 13.8, paint, { round: 0.08 });
    const F = 2.71;
    const lit = k.lit(0, 1);
    for (let i = 0; i < 3; i++) {
      const a0 = 0.45 + i * 2.75;
      const a1 = a0 + 2.6;
      k.rect(a0, 0.8, a1, 14.2, F, lit ? shade(paint, 0.04) : shade(paint, -0.12), k.thin);
      // vents: slots at the top and the foot
      const slots: Array<[P3, P3]> = [];
      for (const z0 of [12.2, 1.6]) for (let j = 0; j < 4; j++) slots.push([[a0 + 0.55, F + 0.01, z0 + j * 0.4], [a1 - 0.55, F + 0.01, z0 + j * 0.4]]);
      k.segs(slots, withAlpha('#141a16', 0.75), Math.max(0.7, 0.14 * k.s));
      // a blank card holder and the handle
      k.rect(a0 + 0.8, 10.2, a1 - 0.8, 10.9, F + 0.02, lit ? C.cream : shade(C.cream, -0.12), Math.max(0.6, k.thin * 0.7));
      k.box(a1 - 0.6, F, 6.6, 0.3, 0.3, 1.6, C.chrome, { line: k.thin, stripe: false });
      if (hash(v.seed, i, 3) < 0.35) {
        // a padlock on the hasp
        k.box(a1 - 0.62, F + 0.3, 6.0, 0.36, 0.2, 0.4, C.brass, { line: k.thin * 0.8, stripe: false });
        k.rod([[a1 - 0.55, F + 0.4, 6.4], [a1 - 0.55, F + 0.4, 6.6], [a1 - 0.33, F + 0.4, 6.6], [a1 - 0.33, F + 0.4, 6.4]], C.chrome, 0.06);
      }
    }
    // a helmet and a boot box on top
    k.box(5.4, 0.6, 14.4, 2.6, 1.8, 0.7, '#c49a62', { line: k.thin });
    const [hx, hy] = k.p(2.0, 1.4, 14.45);
    const R = 0.95 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(hx - R * 1.25, hy);
    k.pen.quadraticCurveTo(hx, hy - R * 1.6, hx + R * 1.25, hy);
    k.pen.closePath();
    k.paint(C.orange, k.thin);
    k.line([[1.2, 1.4, 14.45], [2.8, 1.4, 14.45]], shade(C.orange, -0.3), Math.max(0.8, 0.14 * k.s));
  },
};

// ── water drums on a pallet ─────────────────────────────────────────────────
// Olive-drab drums with ribs and bungs on a wooden pallet (army surplus,
// unmarked; olive so they stand apart from the purifier's teal tanks), a
// tap on the front one and a tin cup hung on it.
const DRUM = '#7b8143';
const DRUM_RIB = '#585d2c';
const drums: PropArt = {
  len: 5,
  dep: 5,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(2.5, 2.5, 2.4, 2.4, 0.3);
    // the pallet: slats over three runners
    for (const w of [0.4, 2.2, 4.0]) k.box(0.3, w, 0, 4.4, 0.6, 0.45, C.woodDark, { line: k.thin, stripe: false });
    for (let i = 0; i < 5; i++) k.box(0.3 + i * 0.9, 0.3, 0.45, 0.75, 4.4, 0.25, i & 1 ? '#a07a52' : '#b08a5e', { line: k.thin, stripe: false });
    const z = 0.7;
    const drum = (cu: number, cv: number, r: number, h: number, tap: boolean) => {
      k.cyl(cu, cv, z, r, h, DRUM);
      for (const f of [0.33, 0.66]) sleeve(k, cu, cv, r * 1.01, z + h * f - 0.12, z + h * f + 0.12, DRUM_RIB, k.thin * 0.6);
      k.disc(cu - r * 0.35, cv - r * 0.3, z + h + 0.01, r * 0.18, DRUM_RIB, k.thin * 0.7);
      k.disc(cu + r * 0.4, cv + r * 0.1, z + h + 0.01, r * 0.12, DRUM_RIB, k.thin * 0.7);
      if (tap) {
        k.rod([[cu + 0.3, cv + r - 0.1, z + 0.8], [cu + 0.3, cv + r + 0.4, z + 0.8], [cu + 0.3, cv + r + 0.45, z + 0.5]], C.brass, 0.13);
        dot(k, cu + 0.3, cv + r + 0.45, z + 0.3, 0.08, C.water, 0);
      }
    };
    const mirror = hash(v.seed, 4) < 0.5;
    const U = (u: number) => (mirror ? 5 - u : u);
    drum(U(1.45), 1.45, 1.05, 4.6, false);
    drum(U(3.55), 1.55, 1.05, 4.6, false);
    drum(U(2.45), 3.45, 1.1, 4.4, true);
    // a tin cup hung from the front drum's rim
    k.cyl(U(2.45) - 0.7, 4.55, z + 3.0, 0.28, 0.5, '#b9c0c2', { line: k.thin });
  },
};

// ── a mutant potted plant ───────────────────────────────────────────────────
// A swollen, ribbed, freckled bulb in an old tin, toothy leaves of a
// strange green curling off it, and three stalks nodding under glowing
// pods: something that grew down here on its own.
const mutant: PropArt = {
  len: 4,
  dep: 4,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    const pen = k.pen;
    k.shadow(c, c, 1.7, 1.7, 0.28);
    // the pot: a big old tin with a rusted band, dark soil
    k.cyl(c, c, 0, 1.2, 1.9, '#9aa39c', { line: k.lw, top: '#4a3422' });
    sleeve(k, c, c, 1.21, 0.35, 1.45, '#b87333');
    // leaves at the back, drooping over the rim
    const leaves = 6;
    const back = (i: number) => i % 2 === 0;
    const leafAt = (i: number) => {
      const a = -Math.PI / 2 + (i - (leaves - 1) / 2) * 0.72 + (hash(v.seed, i, 6) - 0.5) * 0.25;
      oddLeaf(k, c, c, 3.2 + (i % 3) * 0.4, a, (1.7 + hash(v.seed, i, 7) * 0.6) * k.s, i & 2 ? C.leafOdd : C.leaf);
    };
    for (let i = 0; i < leaves; i++) if (back(i)) leafAt(i);
    // the stalks, nodding under their pods
    const pods: Array<[number, number, number, number]> = [[-0.9, 0.3, 6.6, 0.5], [0.7, -0.2, 8.1, 0.62], [1.1, 0.5, 5.9, 0.42]];
    for (const [du, dv, z, r] of pods) {
      const mid: P3 = [c + du * 0.3, c + dv * 0.3, (3.6 + z) / 2 + 0.6];
      k.line([[c, c, 3.6], mid, [c + du, c + dv, z - r * 0.9]], INK, 0.24 * k.s + k.thin * 1.2);
      k.line([[c, c, 3.6], mid, [c + du, c + dv, z - r * 0.9]], '#6f9a3a', 0.24 * k.s);
    }
    // the bulb: swollen and ribbed like a gourd, lit from the upper left, freckled
    const [bx, by] = k.p(c, c, 3.0);
    const R = 1.3 * k.s;
    pen.beginPath();
    pen.ellipse(bx, by, R, R * 1.1, 0, 0, Math.PI * 2);
    const g = pen.createRadialGradient(bx - R * 0.35, by - R * 0.4, 0, bx, by, R * 1.2);
    g.addColorStop(0, '#e2f49a');
    g.addColorStop(0.5, '#8fbf4a');
    g.addColorStop(1, '#4a7428');
    k.paint(g, k.lw);
    pen.beginPath();
    for (const f of [-0.5, 0, 0.5]) {
      pen.moveTo(bx + f * R, by - R * 1.02 * Math.sqrt(1 - f * f));
      pen.quadraticCurveTo(bx + f * R * 1.35, by, bx + f * R, by + R * 1.05 * Math.sqrt(1 - f * f));
    }
    pen.strokeStyle = withAlpha('#2f5a1e', 0.55);
    pen.lineWidth = Math.max(0.6, 0.08 * k.s);
    pen.stroke();
    if (k.s >= 4) {
      pen.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = hash(v.seed, i, 3) * Math.PI * 2;
        const d = 0.2 + hash(v.seed, i, 4) * 0.55;
        const rr = Math.max(0.6, (0.09 + hash(v.seed, i, 5) * 0.07) * k.s);
        const x = bx + Math.cos(a) * R * d;
        const y = by + Math.sin(a) * R * d;
        pen.moveTo(x + rr, y);
        pen.arc(x, y, rr, 0, Math.PI * 2);
      }
      pen.fillStyle = withAlpha('#c8e85a', 0.8);
      pen.fill();
    }
    // the leaves in front of it
    for (let i = 0; i < leaves; i++) if (!back(i)) leafAt(i);
    // the pods, glowing faintly
    for (const [du, dv, z, r] of pods) {
      k.halo(c + du, c + dv, z, r * 2.6, C.glow, 0.3);
      const [px, py] = k.p(c + du, c + dv, z);
      pen.beginPath();
      pen.ellipse(px, py, r * k.s, r * 1.3 * k.s, 0, 0, Math.PI * 2);
      const pg = pen.createRadialGradient(px - r * 0.3 * k.s, py - r * 0.4 * k.s, 0, px, py, r * 1.4 * k.s);
      pg.addColorStop(0, '#fbffd8');
      pg.addColorStop(0.55, C.glow);
      pg.addColorStop(1, '#8ab82a');
      k.paint(pg, k.thin);
    }
  },
};

// A curling, toothy leaf from the stem at (cu, cv, z), angle a on screen,
// L px long.
function oddLeaf(k: Kit, cu: number, cv: number, z: number, a: number, L: number, fill: Color): void {
  const [x, y] = k.p(cu, cv, z);
  const pen = k.pen;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (along: number, side: number): [number, number] => [x + ca * along - sa * side, y + sa * along + ca * side];
  const w = L * 0.32;
  pen.beginPath();
  pen.moveTo(...P(0, 0));
  const teeth = 4;
  for (let i = 1; i <= teeth; i++) {
    const f = i / (teeth + 1);
    const bulge = Math.sin(f * Math.PI) * w;
    pen.lineTo(...P(L * (f - 0.08), bulge * 0.7));
    pen.lineTo(...P(L * f, bulge));
  }
  pen.quadraticCurveTo(...P(L * 1.05, w * 0.4), ...P(L * 0.9, -w * 0.5));
  pen.quadraticCurveTo(...P(L * 0.5, -w * 0.9), ...P(0, 0));
  pen.closePath();
  k.paint(fill, k.thin);
  pen.beginPath();
  pen.moveTo(...P(0, 0));
  pen.quadraticCurveTo(...P(L * 0.5, w * 0.1), ...P(L * 0.85, -w * 0.2));
  pen.strokeStyle = withAlpha(INK, 0.45);
  pen.lineWidth = Math.max(0.5, k.thin * 0.6);
  pen.stroke();
}

// ── the kitchen ─────────────────────────────────────────────────────────────
// The diner's corner, backed against a wall (the shell paints the wall
// behind it pink with a pale aqua band): a patch of red and cream checker;
// a rounded mint fridge with chrome handles; a cream counter with a teal top,
// a chrome toaster, a percolator and a stack of plates on it; a teal chest
// soda cooler with a chrome lid and a plain cream band (no name, no badge).
const kitchen: PropArt = {
  len: 18,
  dep: 6,
  height: 13.6,
  draw(v: PropView): void {
    const k = kitOf(v);
    checker(k, 0.2, 0.2, 17.8, 5.8, 15, 5);
    k.shadow(9, 2.6, 9.2, 2.8, 0.3);
    fridge(k, 0.6, 0.5);
    counter(k, 6.7, 0.5, v.seed);
    cooler(k, 13.1, 0.7);
  },
};

// A rounded fridge from (u0, v0): mint, on a dark plinth, a freezer door
// over the main one, chrome handles, a kick plate and a plain chrome bar.
function fridge(k: Kit, u0: number, v0: number): void {
  const w = 5.4;
  const d = 3.6;
  const top = 13.2;
  const F = v0 + d;
  k.box(u0 + 0.35, v0 + 0.3, 0, w - 0.7, d - 0.5, 0.45, '#2f3a38', { line: k.thin, stripe: false });
  k.box(u0, v0, 0.45, w, d, top - 0.45, C.mint, { round: 1.2 });
  const face = k.side(C.mint, 0, 1);
  // the doors' seam, the kick plate and a soft gloss down the front
  k.line([[u0 + 0.2, F + 0.01, 9.5], [u0 + w - 0.2, F + 0.01, 9.5]], withAlpha(INK, 0.65), k.thin);
  k.rect(u0 + 0.25, 0.75, u0 + w - 0.25, 1.55, F + 0.01, C.chrome, k.thin);
  k.poly([[u0 + 0.8, F + 0.02, 2.0], [u0 + 1.45, F + 0.02, 2.0], [u0 + 1.45, F + 0.02, 12.2], [u0 + 0.8, F + 0.02, 12.2]], withAlpha('#ffffff', 0.22), 0, 0.3);
  k.rect(u0 + 1.9, 11.7, u0 + 3.7, 12.1, F + 0.02, C.chrome, Math.max(0.6, k.thin * 0.7));
  // the handles: chrome bars on posts
  for (const [z0, z1] of [[5.4, 8.4], [10.0, 11.4]] as const) {
    k.box(u0 + w - 1.05, F, z0, 0.32, 0.45, z1 - z0, C.chrome, { line: k.thin, stripe: false, round: 0.12 });
  }
  if (k.fine) k.line([[u0 + 0.25, F + 0.02, 9.62], [u0 + w - 0.25, F + 0.02, 9.62]], withAlpha(shade(face, 0.25), 0.8), 0.06 * k.s);
}

// A cream counter from (u0, v0) with a teal top: a toe kick, two doors with
// chrome pulls, and on top a chrome toaster, a percolator and plates.
function counter(k: Kit, u0: number, v0: number, seed: number): void {
  const w = 6.0;
  const d = 3.2;
  const h = 6.0;
  const F = v0 + d;
  k.box(u0 + 0.2, v0, 0, w - 0.4, d - 0.3, 0.55, '#2f3a38', { line: k.thin, stripe: false });
  k.box(u0, v0, 0.55, w, d, h - 0.55, '#e8dcc0', { stripe: false });
  for (const [a0, a1] of [[u0 + 0.3, u0 + w / 2 - 0.15], [u0 + w / 2 + 0.15, u0 + w - 0.3]] as const) {
    k.rect(a0, 1.0, a1, h - 0.5, F + 0.01, k.side('#efe4cc', 0, 1, 0.1), k.thin);
    const pu = a0 < u0 + w / 2 ? a1 - 0.5 : a0 + 0.5;
    k.box(pu - 0.12, F, h - 1.9, 0.24, 0.25, 0.9, C.chrome, { line: k.thin * 0.8, stripe: false });
  }
  k.box(u0 - 0.2, v0 - 0.1, h, w + 0.4, d + 0.35, 0.45, C.teal);
  k.line([[u0 - 0.2, F + 0.26, h + 0.12], [u0 + w + 0.2, F + 0.26, h + 0.12], [u0 + w + 0.2, v0 - 0.1, h + 0.12]], C.chrome, Math.max(0.8, 0.14 * k.s));
  const zt = h + 0.45;
  // the toaster: rounded chrome, two dark slots, a lever
  k.shadow(u0 + 1.5, v0 + 1.4, 1.2, 0.8, 0.25, zt);
  k.box(u0 + 0.6, v0 + 0.8, zt, 1.9, 1.2, 1.25, C.chrome, { round: 0.45 });
  k.segs([[[u0 + 0.95, v0 + 1.15, zt + 1.26], [u0 + 2.15, v0 + 1.15, zt + 1.26]], [[u0 + 0.95, v0 + 1.6, zt + 1.26], [u0 + 2.15, v0 + 1.6, zt + 1.26]]], '#2a2a26', Math.max(0.7, 0.12 * k.s), 'round');
  k.box(u0 + 2.5, v0 + 1.25, zt + 0.5, 0.2, 0.3, 0.2, '#2a2a26', { line: 0, stripe: false });
  // the percolator: a chrome pot, its glass knob
  k.shadow(u0 + 3.6, v0 + 1.4, 0.8, 0.7, 0.25, zt);
  frustum(k, u0 + 3.6, v0 + 1.4, zt, 0.62, zt + 1.9, 0.45, C.chrome, shade(C.chrome, -0.2));
  k.cyl(u0 + 3.6, v0 + 1.4, zt + 1.9, 0.18, 0.35, '#e8a868', { line: k.thin });
  k.rod([[u0 + 4.1, v0 + 1.4, zt + 1.6], [u0 + 4.55, v0 + 1.4, zt + 1.4], [u0 + 4.5, v0 + 1.4, zt + 0.5], [u0 + 4.15, v0 + 1.4, zt + 0.4]], '#2a2a26', 0.1);
  // a stack of plates
  const n = 3 + Math.floor(hash(seed, 21) * 3);
  for (let i = 0; i < n; i++) k.cyl(u0 + 5.05, v0 + 2.1, zt + i * 0.16, 0.62, 0.14, C.cream, { line: k.thin * 0.8 });
}

// A chest soda cooler from (u0, v0): teal on short legs, a plain cream band
// round it, a chrome lid with a handle, a bottle opener and its cap catcher.
function cooler(k: Kit, u0: number, v0: number): void {
  const w = 4.5;
  const d = 3.0;
  const F = v0 + d;
  for (const [u, w2] of [[u0 + 0.3, v0 + 0.3], [u0 + w - 0.6, v0 + 0.3], [u0 + 0.3, F - 0.6], [u0 + w - 0.6, F - 0.6]] as const) k.box(u, w2, 0, 0.3, 0.3, 0.7, '#2f3a38', { line: k.thin, stripe: false });
  k.box(u0, v0, 0.7, w, d, 3.7, C.teal, { round: 0.5 });
  k.rect(u0 + 0.15, 2.3, u0 + w - 0.15, 3.0, F + 0.01, k.side(C.cream, 0, 1, 0.1), 0);
  k.poly([[u0 + w + 0.01, v0 + 0.15, 2.3], [u0 + w + 0.01, F - 0.15, 2.3], [u0 + w + 0.01, F - 0.15, 3.0], [u0 + w + 0.01, v0 + 0.15, 3.0]], k.side(C.cream, 1, 0, 0.18), 0);
  k.box(u0 - 0.15, v0 - 0.15, 4.4, w + 0.3, d + 0.3, 0.55, C.chrome, { round: 0.25 });
  k.box(u0 + w / 2 - 0.7, F + 0.15, 4.25, 1.4, 0.25, 0.35, shade(C.chrome, -0.1), { line: k.thin, stripe: false });
  // the bottle opener and the box that catches the caps
  k.box(u0 + w - 1.1, F, 3.3, 0.5, 0.2, 0.55, C.chrome, { line: k.thin * 0.8, stripe: false });
  k.box(u0 + w - 1.25, F, 1.3, 0.8, 0.45, 0.7, '#2f3a38', { line: k.thin, stripe: false });
}

// ── an iron cot ─────────────────────────────────────────────────────────────
// A tubular iron bed along the wall, its head rail at u = 0 taller than its
// foot rail, a thin ticking mattress, a white pillow, a grey blanket with
// the sheet turned down over it.
const cot: PropArt = {
  len: 12,
  dep: 5,
  height: 5.6,
  draw(v: PropView): void {
    const k = kitOf(v);
    const iron = '#3e4a48';
    k.shadow(6, 2.6, 6.2, 2.6, 0.28);
    const v0 = 0.5;
    const v1 = 4.5;
    // the head rail and the back posts
    const rail = (u: number, zt: number) => {
      for (const w of [v0, v1]) k.rod([[u, w, 0], [u, w, zt]], iron, 0.16);
      k.rod([[u, v0, zt - 0.05], [u, v1, zt - 0.05]], iron, 0.14);
      k.rod([[u, v0, 1.6], [u, v1, 1.6]], iron, 0.12);
      const n = 4;
      for (let i = 1; i < n; i++) k.rod([[u, v0 + ((v1 - v0) * i) / n, 1.6], [u, v0 + ((v1 - v0) * i) / n, zt - 0.05]], iron, 0.08);
    };
    rail(0.4, 5.3);
    k.rod([[11.6, v0, 0], [11.6, v0, 3.9]], iron, 0.16);
    // the mattress on its springs
    k.box(0.5, v0 + 0.1, 1.3, 11.0, v1 - v0 - 0.2, 0.25, iron, { line: k.thin, stripe: false });
    k.box(0.55, v0 + 0.15, 1.55, 10.9, v1 - v0 - 0.3, 0.8, '#e6dcc4', { round: 0.25 });
    if (k.fine) {
      const tick: Array<[P3, P3]> = [];
      for (let z = 1.75; z < 2.3; z += 0.22) tick.push([[0.7, v1 - 0.14, z], [11.3, v1 - 0.14, z]]);
      k.segs(tick, withAlpha('#7f9a9a', 0.5), 0.05 * k.s);
    }
    // the pillow
    k.box(0.9, v0 + 0.5, 2.3, 2.3, v1 - v0 - 1.0, 0.75, '#f6f4ee', { round: 0.35 });
    // the blanket, the sheet turned down over its top
    k.box(3.4, v0 + 0.05, 2.3, 8.15, v1 - v0 - 0.1, 0.42, '#7d8a80', { round: 0.15 });
    k.box(3.4, v0 + 0.05, 2.3, 0.75, v1 - v0 - 0.1, 0.5, '#f6f4ee', { round: 0.12, stripe: false });
    k.poly([[3.6, v1 + 0.06, 1.0], [11.5, v1 + 0.06, 1.0], [11.5, v1 + 0.06, 2.4], [3.6, v1 + 0.06, 2.4]], k.side('#7d8a80', 0, 1), k.thin, 0.15);
    if (k.fine) k.line([[4.0, v1 + 0.07, 1.25], [11.2, v1 + 0.07, 1.25]], withAlpha('#c8d0c8', 0.6), 0.08 * k.s);
    // the front posts and the foot rail
    k.rod([[0.4, v1 + 0.05, 0], [0.4, v1 + 0.05, 5.3]], iron, 0.16);
    k.rod([[11.6, v1, 0], [11.6, v1, 3.9]], iron, 0.16);
    k.rod([[11.6, v0, 3.85], [11.6, v1, 3.85]], iron, 0.14);
    for (let i = 1; i < 4; i++) k.rod([[11.6, v0 + ((v1 - v0) * i) / 4, 1.6], [11.6, v0 + ((v1 - v0) * i) / 4, 3.85]], iron, 0.08);
    k.rod([[11.6, v0, 1.6], [11.6, v1, 1.6]], iron, 0.12);
  },
};

// ── a chest of drawers ──────────────────────────────────────────────────────
// A wooden chest of three drawers with brass pulls on short legs; on it a
// table lamp (a teal base, a cream cone of a shade, lit), a small globe on
// its stand and a framed snapshot (a plain sepia scene).
const dresser: PropArt = {
  len: 7,
  dep: 4,
  height: 11.4,
  draw(v: PropView): void {
    const k = kitOf(v);
    const wood = '#8a5a36';
    k.shadow(3.5, 2.0, 3.6, 2.0, 0.28);
    for (const [u, w] of [[0.6, 0.6], [6.0, 0.6], [0.6, 3.0], [6.0, 3.0]] as const) k.box(u, w, 0, 0.4, 0.4, 0.6, C.woodDark, { line: k.thin, stripe: false });
    k.box(0.4, 0.4, 0.6, 6.2, 3.2, 6.0, wood, { stripe: false });
    k.box(0.25, 0.3, 6.6, 6.5, 3.45, 0.4, shade(wood, -0.1));
    const F = 3.61;
    for (const [z0, z1] of [[1.0, 2.8], [3.0, 4.6], [4.8, 6.3]] as const) {
      k.rect(0.7, z0, 6.3, z1, F, k.side(shade(wood, 0.06), 0, 1, 0.12), k.thin);
      for (const u of [2.0, 5.0]) k.box(u - 0.3, F, (z0 + z1) / 2 - 0.1, 0.6, 0.18, 0.22, C.brass, { line: k.thin * 0.8, stripe: false });
    }
    const zt = 7.0;
    // the snapshot, at the back
    k.box(3.6, 0.9, zt, 1.4, 0.2, 1.7, C.chrome, { line: k.thin, stripe: false });
    k.rect(3.75, zt + 0.15, 4.85, zt + 1.55, 1.11, k.vgrad(4.3, 1.11, zt, zt + 1.6, [[0, '#8a6a4a'], [1, '#d8c09a']]), 0);
    k.face(4.3, 1.12, zt + 0.95, 0.28, '#6a4a32', 0, 10);
    // the globe on its stand
    k.disc(5.6, 2.4, zt + 0.02, 0.45, C.brass, k.thin);
    k.rod([[5.6, 2.4, zt], [5.6, 2.4, zt + 0.6]], C.brass, 0.08);
    const [gx, gy] = k.p(5.6, 2.4, zt + 1.35);
    const R = 0.72 * k.s;
    const pen = k.pen;
    pen.beginPath();
    pen.arc(gx, gy, R, 0, Math.PI * 2);
    const g = pen.createRadialGradient(gx - R * 0.35, gy - R * 0.35, 0, gx, gy, R * 1.1);
    g.addColorStop(0, '#d6f0ea');
    g.addColorStop(0.6, '#6fb0b8');
    g.addColorStop(1, '#3f7f88');
    k.paint(g, k.thin);
    pen.beginPath();
    pen.ellipse(gx - R * 0.15, gy - R * 0.1, R * 0.35, R * 0.5, 0.4, 0, Math.PI * 2);
    pen.fillStyle = withAlpha('#c9b46a', 0.85);
    pen.fill();
    // the lamp: a teal base, a stem, a cream cone of a shade, lit inside
    k.shadow(1.9, 1.9, 0.9, 0.8, 0.25, zt);
    k.cyl(1.9, 1.9, zt, 0.6, 0.25, shade(C.teal, -0.1));
    const base = ring(k, [1.9, 1.9, zt + 0.9], [0, 0, 1], 0.55, 18);
    const neck = ring(k, [1.9, 1.9, zt + 1.6], [0, 0, 1], 0.2, 18);
    fillPts(k, hull([...ring(k, [1.9, 1.9, zt + 0.25], [0, 0, 1], 0.35, 18), ...base, ...neck]), C.teal, k.lw);
    k.rod([[1.9, 1.9, zt + 1.6], [1.9, 1.9, zt + 2.3]], C.brass, 0.08);
    k.halo(1.9, 1.9, zt + 2.6, 2.6, '#ffe2a0', 0.35);
    frustum(k, 1.9, 1.9, zt + 2.0, 1.25, zt + 3.7, 0.7, C.cream, '#fff3c4');
    k.pool(2.6, 2.4, 2.0, 1.4, '#ffe2a0', 0.4, zt + 0.01);
  },
};

// ── a water cooler ──────────────────────────────────────────────────────────
// An office water cooler: a cream cabinet with a chrome tap and a drip
// tray, a big glass bottle upturned on it with the water showing pale aqua
// (a bubble or two in it), a holder of paper cups on its side.
const water: PropArt = {
  len: 4,
  dep: 4,
  height: 10.6,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 1.7, 1.7, 0.28);
    k.box(0.6, 0.6, 0, 2.8, 2.8, 0.4, '#2f3a38', { line: k.thin, stripe: false });
    k.box(0.5, 0.5, 0.4, 3.0, 3.0, 5.4, '#e8dcc0', { round: 0.35 });
    // the tap over its drip tray, and a band round the top of the cabinet
    k.rect(0.7, 4.6, 3.3, 5.0, 3.51, k.side(C.teal, 0, 1, 0.12), 0);
    k.box(1.4, 3.5, 2.6, 1.2, 0.5, 0.25, C.chrome, { line: k.thin, stripe: false });
    k.box(1.75, 3.5, 3.7, 0.5, 0.45, 0.5, C.chrome, { line: k.thin, stripe: false, round: 0.12 });
    k.box(1.85, 3.9, 3.45, 0.3, 0.2, 0.3, C.chrome, { line: k.thin * 0.8, stripe: false });
    // the paper cups in their holder on the +u side
    k.cyl(3.75, 2.0, 2.6, 0.32, 2.2, C.chrome, { line: k.thin });
    k.cyl(3.75, 2.0, 2.1, 0.26, 0.5, '#f6f4ee', { line: k.thin * 0.8 });
    // the collar and the bottle: glass, the water in it, a bubble or two
    k.cyl(c, c, 5.8, 1.0, 0.35, shade('#e8dcc0', -0.1), { line: k.thin });
    const g = (z: number, r: number) => ring(k, [c, c, z], [0, 0, 1], r, 22);
    const neck = g(6.15, 0.45);
    const body = [...g(6.9, 1.3), ...g(10.0, 1.3)];
    const glass = hull([...neck, ...body]);
    fillPts(k, glass, withAlpha('#9ed4e0', 0.85), 0);
    const lift = hull([...g(9.2, 1.18), ...g(10.0, 1.3)]);
    fillPts(k, lift, withAlpha('#e6f6f8', 0.75), 0);
    fillPts(k, glass, null, k.lw);
    k.line([[c - 0.9, c + 0.6, 7.2], [c - 0.9, c + 0.6, 9.4]], withAlpha('#ffffff', 0.7), Math.max(0.7, 0.16 * k.s));
    if (k.fine) for (const [du, z, r] of [[0.3, 7.6, 0.14], [0.55, 8.3, 0.1]] as const) dot(k, c + du, c + 1.0, z, r, withAlpha('#ffffff', 0.8), Math.max(0.5, k.thin * 0.5));
  },
};

// ── a table and folding chairs ──────────────────────────────────────────────
// A pedestal table (a cream top with a chrome band on a chrome column) on a
// ribbed rubber mat, a folding chair at each end; on it a little board of
// checkers mid-game and a mug.
const table: PropArt = {
  len: 9,
  dep: 9,
  height: 5.2,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 4.5;
    // the mat
    k.poly([[0.5, 0.5, 0.03], [8.5, 0.5, 0.03], [8.5, 8.5, 0.03], [0.5, 8.5, 0.03]], '#3d4240', k.thin, 0.4);
    if (k.s >= 3) {
      const ribs: Array<[P3, P3]> = [];
      for (let w = 1.0; w < 8.1; w += 0.5) ribs.push([[0.9, w, 0.04], [8.1, w, 0.04]]);
      k.segs(ribs, withAlpha('#6a716d', 0.6), Math.max(0.6, 0.08 * k.s));
    }
    foldChair(k, 1.75, c - 0.2, 0, hash(v.seed, 3) < 0.5 ? '#8a9592' : '#9a8f84');
    // the table
    k.shadow(c, c, 2.4, 2.4, 0.3);
    k.cyl(c, c, 0, 1.0, 0.22, C.chrome);
    k.cyl(c, c, 0.22, 0.22, 3.75, C.chrome, { line: k.thin });
    k.cyl(c, c, 3.97, 2.2, 0.38, C.chrome, { top: '#e9e0c8' });
    k.disc(c, c, 4.36, 2.05, '#efe6cc', 0);
    const zt = 4.36;
    // the checkers board, a few pieces on it
    checker(k, c - 1.15, c - 1.0, c + 0.45, c + 0.6, 4, 4, zt + 0.02);
    for (let i = 0; i < 5; i++) {
      const pu = c - 0.95 + Math.floor(hash(v.seed, i, 5) * 4) * 0.4;
      const pv = c - 0.8 + Math.floor(hash(v.seed, i, 6) * 4) * 0.4;
      k.cyl(pu, pv, zt + 0.03, 0.15, 0.1, i & 1 ? '#2a2a26' : C.orange, { line: Math.max(0.5, k.thin * 0.6) });
    }
    // a mug
    k.cyl(c + 1.1, c + 0.9, zt, 0.32, 0.6, C.teal, { line: k.thin });
    foldChair(k, 7.25, c + 0.2, Math.PI, hash(v.seed, 4) < 0.5 ? '#8a9592' : '#9a8f84');
  },
};

export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: kitchen, count: 1, place: 'wall' },
  { art: lockers, count: 1, place: 'wall' },
  { art: cans, count: 2, place: 'wall' },
  { art: cot, count: 1, place: 'wall' },
  { art: dresser, count: 1, place: 'wall' },
  { art: water, count: 1, place: 'wall' },
  { art: table, count: 2, place: 'floor' },
  { art: drums, count: 2, place: 'floor' },
  { art: mutant, count: 1, place: 'floor' },
];

export const DECOR_ART = { kitchen, lockers, cans, cot, dresser, water, table, drums, mutant };
