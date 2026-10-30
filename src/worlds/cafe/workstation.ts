import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { hull, ring } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Cozy Café's workstation (see WorkstationArt in ../types.ts): a little laptop table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A small table on walnut legs, its top one of three woods (the café's
// tables never match: honey oak, chestnut or pale ash); an open laptop
// right of the agent, its lid tilted back off the base's back edge, a dark
// bezel round the screen. The back of the right end is kept clear for a
// desk upgrade, so it shows beside the agent. On, the screen's light falls
// across the keys.
//
// What stands on it (`clutter`, a few a table; see clutterOf in
// ../workstation.ts): a croissant on a plate, a succulent in a pot, a
// paperback, the sugar bowl, a cupcake, a rose in a bud vase, a stack of
// macarons, a folded menu card, a little teapot and two cookies on a
// napkin. Three stand left of the laptop, one right of it. What moves while
// its agent works (`loops`): the latte at the front right corner steams,
// and the candle in a jar behind it is lit, its flame swaying; while the
// screen is off the latte is cold and the candle out.

const ZT = 5.9; // the table top
// The lid's inner face: its bottom edge on the base's back edge, leaning
// back as it rises.
const LID: readonly [P3, P3, P3, P3] = [
  [2.92, 1.15, ZT + 0.26],
  [5.38, 1.15, ZT + 0.26],
  [5.38, 0.8, ZT + 3.46],
  [2.92, 0.8, ZT + 3.46],
];

// A point on the lid's face: fu across from its left edge, fz up from its foot.
const on = (fu: number, fz: number): P3 => {
  const [a, b, , d] = LID;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

const SCREEN: readonly [P3, P3, P3, P3] = [on(0.065, 0.09), on(0.935, 0.09), on(0.935, 0.92), on(0.065, 0.92)];

// The three looks' table tops: honey oak, chestnut, pale ash.
const WOODS: readonly Color[] = [C.honey, '#a8693f', '#d8b98a'];

function draw(v: PropView): void {
  const k = kitOf(v);
  const look = ((v.seed % 3) + 3) % 3;
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.45, 0.3);
  // four walnut legs, back ones first, an H of stretchers low between
  // them, and the apron under the top
  const leg = (u: number, w: number) => {
    k.box(u, w, 0, 0.6, 0.6, ZT - 0.5, C.walnut, { stripe: false });
    k.box(u - 0.06, w - 0.06, 0, 0.72, 0.72, 0.35, C.walnutDark, { line: k.thin, stripe: false });
  };
  leg(0.4, 0.35);
  k.box(0.55, 0.95, 1.35, 0.3, 1.1, 0.3, C.walnutDark, { line: k.thin, stripe: false });
  leg(0.4, 2.05);
  k.box(1.0, 1.35, 1.4, 5.0, 0.3, 0.25, C.walnutDark, { line: k.thin, stripe: false });
  leg(6.0, 0.35);
  k.box(6.15, 0.95, 1.35, 0.3, 1.1, 0.3, C.walnutDark, { line: k.thin, stripe: false });
  leg(6.0, 2.05);
  k.box(0.3, 0.25, ZT - 1.15, 6.4, 2.5, 0.65, C.walnut, { stripe: false });
  // the top in the look's wood, its grain
  const wood = WOODS[look];
  k.box(0, 0, ZT - 0.5, DESK.len, DESK.dep, 0.5, wood, { round: 0.12 });
  if (k.fine) {
    for (const [w, u0, u1] of [[0.7, 0.3, 2.3], [1.55, 0.6, 2.4], [2.4, 0.25, 6.7], [0.9, 5.4, 6.8]] as const) k.line([[u0, w, ZT + 0.01], [u1, w, ZT + 0.01]], shade(wood, -0.14), Math.max(0.6, 0.06 * k.s));
  }
  // the laptop: its lid (the edge behind the face, then the face), its base
  laptop(k, v.active);
}

function laptop(k: Kit, lit: boolean): void {
  // The lid: a slab a fifth of a unit thick, its back in brushed chrome
  // (seen only along its top and right edges), its face a dark bezel.
  const rear = LID.map(([u, w, z]): P3 => [u, w - 0.2, z - 0.05]);
  const pen = k.pen;
  pen.beginPath();
  hull([...LID, ...rear].map((p) => k.p(...p))).forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  k.paint(C.chrome);
  k.poly([...LID], '#2c2a2e');
  // the base, its keys and its pad
  k.box(2.92, 1.15, ZT, 2.46, 1.65, 0.26, C.chrome, { round: 0.06 });
  const zt = ZT + 0.265;
  k.poly([[3.12, 1.32, zt], [5.18, 1.32, zt], [5.18, 2.05, zt], [3.12, 2.05, zt]], '#7f858d', 0);
  if (k.fine) {
    k.pen.beginPath();
    for (const w of [1.56, 1.8]) k.trace([[3.12, w, zt], [5.18, w, zt]]);
    k.pen.strokeStyle = '#5f646b';
    k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    k.pen.stroke();
  }
  k.poly([[3.73, 2.2, zt], [4.57, 2.2, zt], [4.57, 2.65, zt], [3.73, 2.65, zt]], shade(C.chrome, 0.06), k.thin);
  if (lit) {
    // the screen's light across the keys
    k.pool(4.15, 1.7, 1.6, 0.95, C.screen, 0.7, zt);
    k.halo(4.15, 1.3, ZT + 1.2, 1.6, C.screen, 0.22);
  }
}

// ── what stands on it ─────────────────────────────────────────────────────

// Small things are inked lighter than the furniture (a tenth of a unit),
// or their outline would swallow them.
const fine = (k: Kit): number => Math.max(1, 0.1 * k.s);

// A thin stick (a stem, a handle, a spout): a line of colour w units wide
// over a slightly wider one of ink.
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + Math.max(1, 0.08 * k.s));
  k.line(pts, color, w * k.s);
}

// A round dot on screen at a frame point, r in units.
function dot(k: Kit, u: number, w: number, z: number, r: number, color: Color, line = 0): void {
  const [x, y] = k.p(u, w, z);
  k.pen.beginPath();
  k.pen.arc(x, y, Math.max(0.6, r * k.s), 0, Math.PI * 2);
  k.paint(color, line);
}

// An ellipse on screen round a frame point, rx and ry in units.
function blob(k: Kit, u: number, w: number, z: number, rx: number, ry: number, color: Color, line = fine(k), rot = 0): void {
  const [x, y] = k.p(u, w, z);
  k.pen.beginPath();
  k.pen.ellipse(x, y, rx * k.s, ry * k.s, rot, 0, Math.PI * 2);
  k.paint(color, line);
}

// An upright round thing narrowing (or widening) from radius r0 at z0 to
// r1 at z1, shaded across like a cylinder.
function taper(k: Kit, u: number, w: number, z0: number, r0: number, z1: number, r1: number, base: Color, line = fine(k)): Pt[] {
  const sil = hull([...ring(k, [u, w, z0], [0, 0, 1], r0, 18), ...ring(k, [u, w, z1], [0, 0, 1], r1, 18)]);
  const xs = sil.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, 0.06));
  g.addColorStop(0.3, shade(base, 0.14));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.24));
  k.pen.beginPath();
  sil.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(g, line);
  return sil;
}

// A croissant on a little plate.
const croissant: Clutter = {
  name: 'croissant',
  r: 0.3,
  h: 0.35,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.disc(u, w, z + 0.03, 0.31, C.china, fine(k));
    const cv = w - 0.08;
    const z0 = z + 0.05;
    const pts: P3[] = [];
    for (let i = 0; i <= 10; i++) {
      const a = Math.PI * (0.12 + (0.76 * i) / 10);
      pts.push([u + Math.cos(a) * 0.34, cv - Math.sin(a) * 0.19 + 0.13, z0 + Math.sin(a) * 0.22]);
    }
    for (let i = 10; i >= 0; i--) {
      const a = Math.PI * (0.12 + (0.76 * i) / 10);
      pts.push([u + Math.cos(a) * 0.24, cv - Math.sin(a) * 0.08 + 0.13, z0]);
    }
    k.poly(pts, '#d9944a', fine(k), 0.06);
    for (const du of [-0.13, 0.02, 0.16]) k.line([[u + du, cv - 0.02, z0 + 0.21], [u + du + 0.05, cv + 0.12, z0 + 0.1]], '#a8622e', Math.max(0.8, 0.045 * k.s));
  },
};

// A plump succulent in a terracotta pot, a rosette of fat pointed leaves.
const succulent: Clutter = {
  name: 'succulent',
  r: 0.3,
  h: 0.75,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.18, 0.27, C.terracotta, { line: fine(k) });
    k.cyl(u, w, z + 0.25, 0.22, 0.08, shade(C.terracotta, 0.08), { line: fine(k), top: '#4a3122' });
    const [x, y] = k.p(u, w, z + 0.32);
    for (const [a, f, c] of [[-2.6, 0.85, '#5f8f6a'], [-0.55, 0.85, '#5f8f6a'], [-2.1, 1, '#7fb08a'], [-1.05, 1, '#7fb08a'], [-1.57, 1.1, '#a6cf9c']] as const) {
      const L = 0.17 * f * k.s;
      k.pen.beginPath();
      k.pen.ellipse(x + Math.cos(a) * L, y + Math.sin(a) * L, L, 0.08 * k.s, a, 0, Math.PI * 2);
      k.paint(c, fine(k) * 0.8);
    }
  },
};

// Two paperbacks, one on the other, their page edges cream, a ribbon
// hanging from the top one.
const paperback: Clutter = {
  name: 'paperback',
  r: 0.3,
  h: 0.25,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const book = (u0: number, w0: number, z0: number, a: number, b: number, c: Color) => {
      k.box(u0, w0, z0, a, b, 0.1, c, { line: fine(k), round: 0.02, stripe: false });
      k.poly([[u0 + 0.04, w0 + b + 0.003, z0 + 0.025], [u0 + a - 0.03, w0 + b + 0.003, z0 + 0.025], [u0 + a - 0.03, w0 + b + 0.003, z0 + 0.075], [u0 + 0.04, w0 + b + 0.003, z0 + 0.075]], '#f6ecd2', 0);
    };
    book(u - 0.23, w - 0.19, z, 0.5, 0.38, C.mustard);
    book(u - 0.19, w - 0.15, z + 0.1, 0.43, 0.31, C.teal);
    k.line([[u + 0.1, w + 0.16, z + 0.19], [u + 0.12, w + 0.17, z + 0.04]], C.oxblood, Math.max(1, 0.05 * k.s));
  },
};

// The sugar bowl: a china pot with its lid and a brass knob.
const sugarBowl: Clutter = {
  name: 'sugarBowl',
  r: 0.3,
  h: 0.45,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.25, 0.28, C.china, { line: fine(k) });
    k.disc(u, w, z + 0.32, 0.22, shade(C.china, -0.05), fine(k));
    k.cyl(u, w, z + 0.32, 0.07, 0.09, C.brass, { line: fine(k) * 0.8 });
  },
};

// A cupcake: a pink pleated paper cup, a swirl of icing, a cherry.
const cupcake: Clutter = {
  name: 'cupcake',
  r: 0.3,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const pink = '#e88aa8';
    taper(k, u, w, z, 0.15, z + 0.2, 0.2, pink, fine(k) * 0.8);
    if (k.fine) for (const du of [-0.09, 0, 0.09]) k.line([[u + du * 0.75, w + 0.14, z + 0.02], [u + du, w + 0.19, z + 0.19]], shade(pink, -0.2), Math.max(0.6, 0.03 * k.s));
    // the icing: one round-topped swirl
    const e = k.ell(u, w, z + 0.2, 0.24);
    const [, py] = k.p(u, w, z + 0.5);
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(e.cx - e.rx, e.cy);
    pen.bezierCurveTo(e.cx - e.rx * 1.05, e.cy - 0.16 * k.s, e.cx - 0.08 * k.s, py + 0.04 * k.s, e.cx, py);
    pen.bezierCurveTo(e.cx + 0.08 * k.s, py + 0.04 * k.s, e.cx + e.rx * 1.05, e.cy - 0.16 * k.s, e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
    pen.closePath();
    k.paint('#fdeef3', fine(k) * 0.8);
    pen.beginPath();
    pen.moveTo(e.cx - e.rx * 0.8, e.cy - 0.04 * k.s);
    pen.quadraticCurveTo(e.cx, e.cy + 0.05 * k.s, e.cx + e.rx * 0.8, e.cy - 0.06 * k.s);
    pen.moveTo(e.cx - e.rx * 0.5, e.cy - 0.14 * k.s);
    pen.quadraticCurveTo(e.cx, e.cy - 0.07 * k.s, e.cx + e.rx * 0.5, e.cy - 0.15 * k.s);
    pen.strokeStyle = '#f2b0c4';
    pen.lineWidth = Math.max(0.6, 0.03 * k.s);
    pen.stroke();
    dot(k, u + 0.01, w, z + 0.52, 0.065, '#d8343c', fine(k) * 0.6);
  },
};

// A red rose in a slim teal glass bud vase.
const budVase: Clutter = {
  name: 'budVase',
  r: 0.25,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    stick(k, [[u, w, z + 0.4], [u + 0.02, w, z + 0.9]], C.leafDark, 0.035);
    blob(k, u + 0.1, w, z + 0.68, 0.11, 0.05, C.leaf, fine(k) * 0.6, -0.5);
    taper(k, u, w, z, 0.16, z + 0.24, 0.16, '#6fb0a8', fine(k) * 0.8);
    taper(k, u, w, z + 0.24, 0.16, z + 0.48, 0.06, '#6fb0a8', fine(k) * 0.8);
    blob(k, u + 0.02, w, z + 0.95, 0.15, 0.13, '#e0464a', fine(k) * 0.6);
    k.pen.beginPath();
    const [x, y] = k.p(u + 0.02, w, z + 0.96);
    k.pen.arc(x, y, 0.07 * k.s, 0.4, 4.6);
    k.pen.strokeStyle = '#8f2424';
    k.pen.lineWidth = Math.max(0.6, 0.025 * k.s);
    k.pen.stroke();
  },
};

// Three macarons stacked: pink, mint, lavender, each with a stripe of
// cream filling round its middle.
const macarons: Clutter = {
  name: 'macarons',
  r: 0.3,
  h: 0.45,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const stack: ReadonlyArray<readonly [Color, number, number]> = [['#f2a7b8', 0, 0], ['#a8dcc0', 0.03, -0.02], ['#c8b0e0', -0.02, 0.02]];
    stack.forEach(([c, du, dw], i) => {
      const zi = z + i * 0.14;
      k.cyl(u + du, w + dw, zi, 0.21, 0.13, c, { line: fine(k) * 0.7, top: shade(c, 0.1) });
      const e = k.ell(u + du, w + dw, zi + 0.065, 0.212);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
      k.pen.strokeStyle = '#fbf3e4';
      k.pen.lineWidth = Math.max(0.8, 0.035 * k.s);
      k.pen.stroke();
    });
  },
};

// A folded menu card standing like a tent: cream, a sage border, a coffee
// cup drawn on it and two lines under (no words).
const menuCard: Clutter = {
  name: 'menuCard',
  r: 0.25,
  h: 0.45,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const back: P3[] = [[u - 0.22, w - 0.12, z], [u + 0.22, w - 0.12, z], [u + 0.22, w, z + 0.42], [u - 0.22, w, z + 0.42]];
    const face: P3[] = [[u - 0.22, w + 0.12, z], [u + 0.22, w + 0.12, z], [u + 0.22, w, z + 0.42], [u - 0.22, w, z + 0.42]];
    k.poly(back, shade(C.cream, -0.12), fine(k));
    k.poly([[u + 0.22, w + 0.12, z], [u + 0.22, w - 0.12, z], [u + 0.22, w, z + 0.42]], shade(C.cream, -0.2), fine(k));
    k.poly(face, C.cream, fine(k));
    const at = (a: number, b: number): P3 => [u - 0.22 + 0.44 * a, w + 0.12 - 0.12 * b, z + 0.42 * b];
    k.poly([at(0.08, 0.1), at(0.92, 0.1), at(0.92, 0.9), at(0.08, 0.9)], C.sage, Math.max(0.6, 0.03 * k.s));
    k.poly([at(0.16, 0.18), at(0.84, 0.18), at(0.84, 0.82), at(0.16, 0.82)], C.cream, 0);
    dot(k, ...at(0.5, 0.62), 0.07, C.coffee);
    for (const b of [0.38, 0.28]) k.line([at(0.3, b), at(0.7, b)], shade(C.sage, -0.1), Math.max(0.6, 0.03 * k.s));
  },
};

// A little sage teapot for one: a round body, a lid with a knob, a spout
// toward +u and a handle opposite.
const teapot: Clutter = {
  name: 'teapot',
  r: 0.3,
  h: 0.5,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    stick(k, [[u - 0.17, w, z + 0.3], [u - 0.31, w, z + 0.27], [u - 0.3, w, z + 0.11], [u - 0.17, w, z + 0.09]], C.sage, 0.055);
    stick(k, [[u + 0.14, w, z + 0.11], [u + 0.26, w, z + 0.22], [u + 0.33, w, z + 0.33]], C.sage, 0.075);
    const [x, y] = k.p(u, w, z + 0.2);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.25 * k.s, 0.2 * k.s, 0, 0, Math.PI * 2);
    k.paint(k.hgrad([u - 0.25, w, z], [u + 0.25, w, z], [[0, shade(C.sage, 0.15)], [0.6, C.sage], [1, shade(C.sage, -0.22)]]), fine(k));
    blob(k, u, w, z + 0.38, 0.13, 0.055, shade(C.sage, 0.08));
    dot(k, u, w, z + 0.44, 0.045, C.brass, fine(k) * 0.7);
  },
};

// Two chocolate-chip cookies on a folded paper napkin.
const cookies: Clutter = {
  name: 'cookies',
  r: 0.3,
  h: 0.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.poly([[u - 0.27, w - 0.27, z + 0.01], [u + 0.27, w - 0.27, z + 0.01], [u + 0.27, w + 0.27, z + 0.01], [u - 0.27, w + 0.27, z + 0.01]], '#fbf7ee', fine(k) * 0.7);
    for (const [du, dw, dz] of [[-0.08, -0.06, 0.02], [0.08, 0.08, 0.04]] as const) {
      k.cyl(u + du, w + dw, z + dz, 0.14, 0.04, '#d9a25a', { line: fine(k) * 0.6, top: '#e4b26c' });
      for (const [a, b] of [[-0.05, -0.03], [0.05, 0.02], [0.0, 0.07], [-0.02, -0.08]] as const) dot(k, u + du + a, w + dw + b, z + dz + 0.045, 0.025, '#5a3a22');
    }
  },
};

// A thing drawn f times its size about where it stands (its lines too).
function grown(c: Clutter, f: number): Clutter {
  return {
    name: c.name,
    r: c.r * f,
    h: c.h * f,
    draw(v, p) {
      const [pu, pw, pz] = p;
      c.draw({ ...v, s: v.s * f, at: (u, w, z) => v.at(pu + (u - pu) * f, pw + (w - pw) * f, pz + (z - pz) * f) }, p);
    },
  };
}

// ── what moves ───────────────────────────────────────────────────────────

// A candle in a little amber glass jar, right of the laptop: while its
// desk is worked its flame sways and flickers tall and short, its warm
// light swelling and ebbing with it, and the glass glows; off, it is out.
const CANDLE: P3 = [6.45, 1.85, ZT];
const SWAY = [0, 0.03, 0.05, 0.03, 0, -0.03] as const;
const TALL = [0, 0.09, -0.04, 0.07, 0.02, -0.06] as const;
const candle: DeskLoop = {
  name: 'candle',
  at: CANDLE,
  r: 0.25,
  h: 0.8,
  frames: 6,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = CANDLE;
    const on = v.active;
    const tall = on ? TALL[i] : 0;
    if (on) {
      // the warm light it throws on the table, swelling and ebbing with the
      // flame (painted over the wood, so it shows on the palest top)
      const pen = k.pen;
      const [px, py] = k.p(u, w, z);
      const R = (0.65 + tall * 1.5) * k.s * Math.SQRT2;
      pen.save();
      pen.translate(px, py);
      pen.scale(1, 0.5);
      const g = pen.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, withAlpha('#ff9a30', 0.62 + tall * 1.5));
      g.addColorStop(0.5, withAlpha('#ff9a30', 0.3 + tall));
      g.addColorStop(1, withAlpha('#ff9a30', 0));
      pen.beginPath();
      pen.arc(0, 0, R, 0, Math.PI * 2);
      pen.fillStyle = g;
      pen.fill();
      pen.restore();
    }
    k.cyl(u, w, z, 0.18, 0.38, on ? '#ffc96a' : '#d9b67a', { line: fine(k), top: on ? '#fff0b8' : '#efd9a8' });
    stick(k, [[u, w, z + 0.38], [u, w, z + 0.45]], '#3a2a22', 0.02);
    if (!on) return;
    k.halo(u, w, z + 0.55, 0.85 + tall * 1.5, '#ffb04a', 0.6 + tall * 2);
    k.halo(u, w, z + 0.55, 0.32, '#fff0c0', 0.5 + tall * 2);
    const [x, y] = k.p(u, w, z + 0.62 + tall / 2);
    const sx = SWAY[i] * k.s;
    const h = (0.22 + tall / 2) * k.s;
    const wd = 0.13 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(x + sx * 2, y - h);
    k.pen.quadraticCurveTo(x + wd, y + h * 0.2, x, y + h * 0.6);
    k.pen.quadraticCurveTo(x - wd, y + h * 0.2, x + sx * 2, y - h);
    k.pen.fillStyle = '#ff9a2a';
    k.pen.fill();
    k.pen.beginPath();
    k.pen.moveTo(x + sx * 1.4, y - h * 0.6);
    k.pen.quadraticCurveTo(x + wd * 0.6, y + h * 0.25, x, y + h * 0.55);
    k.pen.quadraticCurveTo(x - wd * 0.6, y + h * 0.25, x + sx * 1.4, y - h * 0.6);
    k.pen.fillStyle = C.flame;
    k.pen.fill();
    blob(k, u, w, z + 0.53, 0.03, 0.055, C.flameHot, 0);
  },
};

// The latte at the front right corner, on its saucer, a heart in its
// crema: while its desk is worked two wisps of steam curl up off it,
// rising a step each frame; off, it has gone cold.
const LATTE: P3 = [6.25, 2.5, ZT];
const latte: DeskLoop = {
  name: 'latte',
  at: LATTE,
  r: 0.35,
  h: 1.35,
  frames: 8,
  fps: 5,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = LATTE;
    k.disc(u, w, z + 0.04, 0.33, shade(C.china, -0.04), fine(k));
    stick(k, [[u + 0.18, w, z + 0.3], [u + 0.29, w, z + 0.25], [u + 0.28, w, z + 0.15], [u + 0.18, w, z + 0.13]], C.china, 0.05);
    k.cyl(u, w, z + 0.06, 0.2, 0.28, C.china, { line: fine(k) });
    k.disc(u, w, z + 0.33, 0.16, C.coffee, 0);
    const [x, y] = k.p(u, w, z + 0.335);
    const hh = 0.06 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(x, y + hh * 0.6);
    k.pen.bezierCurveTo(x - hh * 1.4, y - hh * 0.2, x - hh * 0.6, y - hh * 0.9, x, y - hh * 0.3);
    k.pen.bezierCurveTo(x + hh * 0.6, y - hh * 0.9, x + hh * 1.4, y - hh * 0.2, x, y + hh * 0.6);
    k.pen.fillStyle = C.crema;
    k.pen.fill();
    if (!v.active) return;
    // the steam: each wisp a wavy line fading as it rises, its wave
    // moving up an eighth of a turn a frame
    for (const [ph, du] of [[0, -0.05], [2.4, 0.07]] as const) {
      const pts: P3[] = [];
      for (let j = 0; j <= 12; j++) {
        const t = j / 12;
        const a = Math.PI * 2 * (t * 1.4 - i / 8) + ph;
        pts.push([u + du + Math.sin(a) * 0.06 * (0.4 + t) + t * 0.12, w, z + 0.42 + t * 0.9]);
      }
      for (let j = 0; j < 12; j++) k.line([pts[j], pts[j + 1]], withAlpha('#fffaf0', 0.85 * (1 - j / 12)), Math.max(1, (0.07 - 0.03 * (j / 12)) * k.s));
    }
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 9.6,
  draw,
  screen: SCREEN,
  top: [6.5, 0.55, ZT],
  clutter: {
    // a size up on the broad top (as wide as the spots between the agent,
    // the laptop and the loops allow)
    items: [croissant, succulent, paperback, sugarBowl, cupcake, budVase, macarons, menuCard, teapot, cookies].map((c) => grown(c, c.r < 0.3 ? 1.25 : 1.1)),
    // three left of the laptop, one right of it
    spots: [
      [1.4, 0.75, ZT],
      [2.25, 0.95, ZT],
      [2.55, 1.8, ZT],
      [5.65, 2.15, ZT],
    ],
  },
  loops: [candle, latte],
};
