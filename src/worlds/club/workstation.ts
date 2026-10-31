import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { cone, martini, platter } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf, withAlpha } from './kit.ts';

// Underground Club's workstation (see WorkstationArt in ../types.ts): a
// small DJ desk. A compact black booth, its front a dim grid of LEDs, a
// neon lip along its top front edge and a thin LED strip under it; right
// of the agent a laptop on a little steel stand, its lid (the screen)
// tilted back a little; on the left a controller with two small platters
// and a fader; the right end kept clear for a desk upgrade. Looks: the lip
// pink, cyan or lime. On: the lip and the strip glow.
// What stands on the top is a place's pick from a DJ booth's clutter
// (CLUTTER): headphones, a record half out of its sleeve, glow sticks, a
// cassette, sunglasses, a can, a cocktail, a sticker-covered speaker, a
// plush bear, a pad controller (its pads lit while worked) and a mic, on a
// row of spots along the front before the laptop. What moves (LOOPS): a
// little mirror ball on a stand at the front right corner, turning and
// throwing glints while the desk is worked, dull and still while not.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const ZT = 5.65; // the booth's top
const FRONT = 2.8; // the booth's front face (the top overhangs it to the footprint's edge)
const LIPS: readonly Color[] = [C.pink, C.cyan, C.lime];
// The laptop: its base on the stand, the lid hinged at the base's back and
// leaning back (its face at v = lidV(z)).
const BASE = { u0: 2.3, u1: 5.45, v0: 0.75, v1: 1.7, z: 6.15, h: 0.16 };
const HINGE = BASE.z + BASE.h;
const LID_TOP = 9.85;
const lidV = (z: number): number => BASE.v0 + 0.03 - 0.15 * (z - HINGE);
const SCREEN = { u0: 2.6, u1: 5.15, z0: 6.7, z1: 9.5 };

// The booth: its body, the dark LED front, the top slab.
function booth(k: Kit): void {
  k.box(0.15, 0.25, 0, DESK.len - 0.3, FRONT - 0.25, ZT - 0.35, C.black, { stripe: false });
  k.rect(0.45, FRONT + 0.01, 0.5, DESK.len - 0.45, ZT - 1.05, '#120e18', k.thin);
  const pen = k.pen;
  const r = Math.max(0.6, 0.12 * k.s);
  pen.beginPath();
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 5; j++) {
      const [x, y] = k.p(0.85 + i * 0.76, FRONT + 0.02, 0.95 + j * 0.72);
      pen.moveTo(x + r, y);
      pen.arc(x, y, r, 0, Math.PI * 2);
    }
  }
  pen.fillStyle = '#2e2440';
  pen.fill();
  k.box(0, 0.1, ZT - 0.35, DESK.len, DESK.dep - 0.1, 0.35, C.gear);
}

// The neon lip along the top's front edge and the LED strip under it, in
// the look's colour; glowing (kept inside the footprint) while on.
function lights(k: Kit, color: Color, on: boolean): void {
  const lip: P3[] = [[0.3, DESK.dep, ZT - 0.17], [DESK.len - 0.3, DESK.dep, ZT - 0.17]];
  const strip: P3[] = [[0.5, FRONT + 0.02, ZT - 0.62], [DESK.len - 0.5, FRONT + 0.02, ZT - 0.62]];
  if (on) {
    k.wash(DESK.len / 2, FRONT + 0.03, ZT - 1.1, 3.2, 1.0, color, 0.3);
    for (let u = 0.9; u < DESK.len - 0.5; u += 1.3) k.halo(u, DESK.dep, ZT - 0.2, 0.9, color, 0.22);
  }
  k.line(strip, on ? color : mix(color, C.black, 0.45), Math.max(1, 0.1 * k.s));
  k.line(lip, '#120e18', Math.max(1.4, 0.2 * k.s) + k.lw);
  k.line(lip, on ? color : mix(color, C.black, 0.3), Math.max(1.4, 0.2 * k.s));
  if (on) k.line(lip, mix(color, '#ffffff', 0.7), Math.max(0.7, 0.08 * k.s));
}

// The laptop on its little steel stand: the stand's sides and plate, the
// silver base and its keys, the lid leaning back.
function laptop(k: Kit): void {
  const { u0, u1, v0, v1, z, h } = BASE;
  for (const u of [u0 + 0.35, u1 - 0.5]) k.box(u, v0 + 0.15, ZT, 0.15, v1 - v0 - 0.4, z - ZT - 0.12, C.steel, { line: k.thin, stripe: false });
  k.box(u0 + 0.25, v0 + 0.1, z - 0.12, u1 - u0 - 0.5, v1 - v0 - 0.3, 0.12, C.steel, { line: k.thin, stripe: false });
  k.box(u0, v0, z, u1 - u0, v1 - v0, h, '#c4c8d4', { line: k.thin });
  k.poly([[u0 + 0.3, v0 + 0.15, z + h + 0.01], [u1 - 0.3, v0 + 0.15, z + h + 0.01], [u1 - 0.3, v0 + 0.58, z + h + 0.01], [u0 + 0.3, v0 + 0.58, z + h + 0.01]], '#2a2532', 0);
  if (k.fine) k.poly([[u0 + 1.25, v0 + 0.66, z + h + 0.01], [u1 - 1.25, v0 + 0.66, z + h + 0.01], [u1 - 1.25, v0 + 0.86, z + h + 0.01], [u0 + 1.25, v0 + 0.86, z + h + 0.01]], '#a9aebb', 0);
  // the lid: its top edge and its end, then its face
  const t = 0.12;
  const f = (u: number, zz: number): P3 => [u, lidV(zz), zz];
  const b = (u: number, zz: number): P3 => [u, lidV(zz) - t, zz];
  k.poly([b(u0, LID_TOP), b(u1, LID_TOP), f(u1, LID_TOP), f(u0, LID_TOP)], '#d3d6e0', k.thin);
  k.poly([f(u1, HINGE), b(u1, HINGE), b(u1, LID_TOP), f(u1, LID_TOP)], '#9ea3b2', k.thin);
  k.poly([f(u0, HINGE), f(u1, HINGE), f(u1, LID_TOP), f(u0, LID_TOP)], '#b9bec9', k.lw);
}

// The controller on the left: two small platters and a fader between.
function controller(k: Kit): void {
  const z = ZT + 0.32;
  k.box(0.2, 1.15, ZT, 2.0, 1.55, 0.32, '#3a3446', { round: 0.12 });
  platter(k, 0.7, 1.75, z, 0.42, C.pink);
  platter(k, 1.7, 1.75, z, 0.42, C.cyan);
  k.line([[1.2, 1.4, z + 0.01], [1.2, 2.15, z + 0.01]], '#121016', Math.max(0.8, 0.1 * k.s));
  k.box(1.07, 1.7, z, 0.26, 0.22, 0.12, '#e6e2ee', { line: k.thin * 0.7, stripe: false });
}

// ── on the top: a place's pick of these (see clutterOf) ─────────────────────

// A light ink for small parts (the kit's thin line would fill them).
const fine = (k: Kit): number => Math.max(0.7, 0.07 * k.s);
// A point across the view (t) and toward the viewer (n) from (u, v), in
// the top's plane: what lies "side by side" lies along t in either frame.
const A = Math.SQRT1_2;
const off = (u: number, v: number, t: number, n: number, z: number): P3 => [u + A * (t + n), v + A * (n - t), z];

// Headphones set down on their cups, the band arched over them: hot pink
// cups with pale rims and a glint, a bright chrome band (thinly inked, so
// they read on the booth's black top), a pink glow under them while the
// desk is worked.
const headphones: Clutter = {
  name: 'headphones',
  r: 0.32,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const s = k.s;
    if (v.active) k.halo(u, w, z + 0.12, 0.3, C.pink, 0.45);
    const band: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const th = (i / 12) * Math.PI;
      band.push(off(u, w, -Math.cos(th) * 0.22, 0, z + 0.2 + Math.sin(th) * 0.38));
    }
    k.line(band, INK, Math.max(2, 0.1 * s + 2 * fine(k)));
    k.line(band, C.chrome, Math.max(1, 0.1 * s));
    k.line(band.slice(3, 8), '#ffffff', Math.max(0.5, 0.035 * s));
    const pen = k.pen;
    for (const f of [-1, 1]) {
      const [x, y] = k.p(...off(u, w, f * 0.23, 0, z + 0.16));
      pen.beginPath();
      pen.ellipse(x, y, 0.13 * s, 0.18 * s, 0, 0, Math.PI * 2);
      k.paint(C.pink, fine(k));
      pen.beginPath();
      pen.ellipse(x - f * 0.07 * s, y, 0.05 * s, 0.13 * s, 0, 0, Math.PI * 2);
      k.paint(mix(C.pink, '#ffffff', 0.55), 0);
      pen.beginPath();
      pen.arc(x + f * 0.04 * s, y - 0.08 * s, Math.max(0.5, 0.03 * s), 0, Math.PI * 2);
      k.paint('#ffffff', 0);
    }
  },
};

// A record half out of its sleeve, lying flat: the sleeve's bold shapes
// (no words), the black disc and its label.
const vinyl: Clutter = {
  name: 'vinyl',
  r: 0.32,
  h: 0.1,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const [du, dv] = [0.1, -0.03];
    k.cyl(u + du, w + dv, z, 0.24, 0.03, '#141018', { line: fine(k) });
    k.disc(u + du, w + dv, z + 0.03, 0.08, C.amber, 0);
    const S = 0.24;
    const sl = (a: number, b: number, zz: number): P3 => [u - 0.07 + a, w + b, zz];
    k.box(u - 0.07 - S, w - S, z, 2 * S, 2 * S, 0.05, C.violet, { line: fine(k), stripe: false });
    k.disc(u - 0.07, w, z + 0.051, 0.16, C.pink, 0);
    k.disc(u - 0.07, w, z + 0.052, 0.1, C.cyan, 0);
    k.poly([sl(-0.2, 0.2, z + 0.053), sl(-0.05, 0.2, z + 0.053), sl(-0.2, 0.05, z + 0.053)], C.lime, 0);
  },
};

// Three glow sticks crossed on the top, glowing while the desk is worked.
const glowSticks: Clutter = {
  name: 'glowSticks',
  r: 0.32,
  h: 0.12,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const sticks: ReadonlyArray<readonly [number, Color]> = [[0.3, C.lime], [1.4, C.pink], [2.4, C.cyan]];
    for (const [a, c] of sticks) {
      const d = 0.27;
      const pts: P3[] = [[u - Math.cos(a) * d, w - Math.sin(a) * d, z + 0.05], [u + Math.cos(a) * d, w + Math.sin(a) * d, z + 0.05]];
      k.line(pts, INK, Math.max(1.4, 0.1 * k.s + fine(k)));
      k.neon(pts, c, 0.1, v.active ? 0.6 : 0);
    }
  },
};

// A cassette lying flat: a smoky case, a pale label with a stripe (no
// words) and its two reel holes.
const cassette: Clutter = {
  name: 'cassette',
  r: 0.32,
  h: 0.12,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const L = 0.3;
    const D = 0.2;
    const q = (t: number, n: number, zz: number) => off(u, w, t, n, zz);
    const zt = z + 0.08;
    // the case: its two seen sides, then its top
    k.poly([q(-L, D, z), q(L, D, z), q(L, D, zt), q(-L, D, zt)], shade(C.plum, -0.15), fine(k));
    k.poly([q(L, -D, z), q(L, D, z), q(L, D, zt), q(L, -D, zt)], shade(C.plum, -0.3), fine(k));
    k.poly([q(-L, -D, zt), q(L, -D, zt), q(L, D, zt), q(-L, D, zt)], C.plum, fine(k));
    k.poly([q(-0.24, -0.15, zt + 0.005), q(0.24, -0.15, zt + 0.005), q(0.24, 0.08, zt + 0.005), q(-0.24, 0.08, zt + 0.005)], C.paper, 0);
    k.poly([q(-0.24, -0.1, zt + 0.006), q(0.24, -0.1, zt + 0.006), q(0.24, -0.05, zt + 0.006), q(-0.24, -0.05, zt + 0.006)], C.hot, 0);
    for (const t of [-0.12, 0.12]) {
      const [cu, cv] = q(t, 0.01, 0);
      k.disc(cu, cv, zt + 0.007, 0.045, INK, 0);
    }
    k.poly([q(-0.18, 0.1, zt + 0.006), q(0.18, 0.1, zt + 0.006), q(0.14, 0.18, zt + 0.006), q(-0.14, 0.18, zt + 0.006)], shade(C.plum, -0.2), 0);
  },
};

// Sunglasses lying folded: two dark lenses in pink frames, a glint on each.
const sunglasses: Clutter = {
  name: 'sunglasses',
  r: 0.32,
  h: 0.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    // the folded arms behind
    for (const f of [-1, 1]) k.line([off(u, w, f * 0.26, 0.02, z + 0.03), off(u, w, f * 0.2, -0.16, z + 0.05), off(u, w, -f * 0.05, -0.18, z + 0.05)], C.pink, Math.max(0.8, 0.06 * k.s));
    for (const f of [-1, 1]) {
      const [x, y] = k.p(...off(u, w, f * 0.14, 0.04, z + 0.1));
      const pen = k.pen;
      pen.beginPath();
      pen.ellipse(x, y, 0.15 * k.s, 0.1 * k.s, 0, 0, Math.PI * 2);
      k.paint('#1c1426', Math.max(1, 0.07 * k.s), C.pink);
      pen.beginPath();
      pen.ellipse(x - 0.05 * k.s, y - 0.03 * k.s, 0.05 * k.s, 0.025 * k.s, -0.4, 0, Math.PI * 2);
      k.paint('#ffffffb0', 0);
    }
    k.line([off(u, w, -0.02, 0.04, z + 0.12), off(u, w, 0.02, 0.04, z + 0.12)], C.pink, Math.max(0.8, 0.06 * k.s));
  },
};

// A slim can of something fizzy: lime with a dark band (no words).
const can: Clutter = {
  name: 'can',
  r: 0.25,
  h: 0.7,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.16, 0.62, C.lime, { line: fine(k) });
    k.cyl(u, w, z + 0.22, 0.165, 0.14, '#1d1a24', { line: 0 });
    k.disc(u, w, z + 0.62, 0.13, C.chrome, fine(k) * 0.6);
    k.disc(u + 0.04, w + 0.03, z + 0.625, 0.04, C.steelDark, 0);
  },
};

// A cocktail glass of something blue, a cherry on its rim.
const cocktail: Clutter = {
  name: 'cocktail',
  r: 0.32,
  h: 0.8,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    martini(k, u, w, z, C.cyan, 0.3);
    const [x, y] = k.p(u + 0.18, w + 0.12, z + 0.74);
    k.pen.beginPath();
    k.pen.arc(x, y, Math.max(1, 0.07 * k.s), 0, Math.PI * 2);
    k.paint(C.red, fine(k) * 0.8);
  },
};

// A little speaker covered in stickers (shapes, no words): a violet-grey
// cabinet, a cyan neon rim round its front, its cone in a chrome surround,
// a light lit while the desk is worked (the rim glowing too).
const speaker: Clutter = {
  name: 'speaker',
  r: 0.32,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const [u0, v0, H] = [u - 0.26, w - 0.2, 0.85];
    const F = w + 0.22;
    k.box(u0, v0, z, 0.52, 0.42, H, '#5a4f70', { line: fine(k) * 1.3 });
    // the neon rim round its front: lit, a bright tube with a white core;
    // off, a paler cyan than the cabinet
    const e = 0.045;
    const rim: P3[] = [[u0 + e, F + 0.01, z + e], [u0 + 0.52 - e, F + 0.01, z + e], [u0 + 0.52 - e, F + 0.01, z + H - e], [u0 + e, F + 0.01, z + H - e], [u0 + e, F + 0.01, z + e]];
    k.line(rim, v.active ? C.cyan : mix(C.cyan, '#5a4f70', 0.4), Math.max(1, 0.06 * k.s));
    if (v.active) k.line(rim, mix(C.cyan, '#ffffff', 0.7), Math.max(0.5, 0.025 * k.s));
    cone(k, u, F + 0.005, z + 0.36, 0.17);
    const pen = k.pen;
    const [lx, ly] = k.p(u + 0.15, F + 0.01, z + 0.72);
    pen.beginPath();
    pen.arc(lx, ly, Math.max(0.8, 0.045 * k.s), 0, Math.PI * 2);
    k.paint(v.active ? C.lime : shade(C.lime, -0.45), 0);
    if (v.active) k.halo(u + 0.15, F + 0.02, z + 0.72, 0.18, C.lime, 0.6);
    // stickers on its front and its +u side
    k.ring(u - 0.15, F + 0.01, z + 0.7, 0.07, C.pink, 0);
    k.poly([[u - 0.05, F + 0.01, z + 0.62], [u + 0.04, F + 0.01, z + 0.62], [u + 0.04, F + 0.01, z + 0.78], [u - 0.05, F + 0.01, z + 0.78]], C.amber, 0);
    const side = u + 0.26 + 0.01;
    k.poly([[side, w - 0.05, z + 0.5], [side, w + 0.12, z + 0.42], [side, w + 0.08, z + 0.66]], C.cyan, 0);
    k.poly([[side, w - 0.15, z + 0.15], [side, w + 0.02, z + 0.15], [side, w + 0.02, z + 0.28], [side, w - 0.15, z + 0.28]], C.lime, 0);
  },
};

// A plush bear sat on the top, as won from the claw machine: round
// ears, a pale muzzle, its feet out in front.
const bear: Clutter = {
  name: 'plushBear',
  r: 0.3,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const s = k.s;
    const pen = k.pen;
    const line = fine(k);
    const fur = '#ff8cc6';
    const pale = '#ffd6ea';
    const [x, y] = k.p(u, w, z);
    const blob = (cx: number, cy: number, rx: number, ry: number, fill: Color, ink = line) => {
      pen.beginPath();
      pen.ellipse(x + cx * s, y + cy * s, rx * s, ry * s, 0, 0, Math.PI * 2);
      k.paint(fill, ink);
    };
    blob(0, -0.27, 0.27, 0.25, fur);
    blob(-0.2, -0.32, 0.08, 0.12, shade(fur, -0.08));
    blob(0.2, -0.32, 0.08, 0.12, shade(fur, -0.12));
    blob(0, -0.24, 0.13, 0.12, pale, 0);
    for (const f of [-1, 1]) blob(f * 0.14, -0.05, 0.1, 0.07, pale);
    for (const f of [-1, 1]) blob(f * 0.17, -0.82, 0.08, 0.08, fur);
    blob(0, -0.66, 0.21, 0.19, fur);
    blob(0, -0.6, 0.09, 0.065, pale, 0);
    blob(0, -0.63, 0.03, 0.022, INK, 0);
    if (s >= 5) for (const f of [-1, 1]) blob(f * 0.08, -0.7, 0.024, 0.024, INK, 0);
  },
};

// A pad controller: a square of pads, lit in the club's neons while the
// desk is worked, dim while not.
const pads: Clutter = {
  name: 'pads',
  r: 0.32,
  h: 0.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const H = 0.09;
    k.box(u - 0.28, w - 0.28, z, 0.56, 0.56, H, '#241f2c', { line: fine(k), stripe: false });
    const cols: readonly Color[] = [C.pink, C.cyan, C.lime, C.violet, C.amber];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const pu = u - 0.2 + i * 0.16;
        const pv = w - 0.2 + j * 0.16;
        const c = cols[Math.floor(hash(i, j, 7) * cols.length)];
        k.poly([[pu - 0.06, pv - 0.06, z + H], [pu + 0.06, pv - 0.06, z + H], [pu + 0.06, pv + 0.06, z + H], [pu - 0.06, pv + 0.06, z + H]], v.active ? c : mix(c, C.black, 0.6), 0);
      }
    }
    if (v.active) k.halo(u, w, z + H, 0.3, C.violet, 0.3);
  },
};

// A hand mic lying on the top: a steel handle with a hot pink grip ring,
// a big chrome grille with a glint, and its cable curling off the end in
// cyan (glowing while the desk is worked), so it reads on the black top.
const mic: Clutter = {
  name: 'mic',
  r: 0.32,
  h: 0.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const s = k.s;
    k.neon([off(u, w, -0.24, 0.06, z + 0.04), off(u, w, -0.3, 0.16, z + 0.02), off(u, w, -0.18, 0.24, z + 0.02), off(u, w, -0.06, 0.2, z + 0.02)], C.cyan, 0.05, v.active ? 0.5 : 0);
    const a = off(u, w, -0.24, 0.06, z + 0.07);
    const b = off(u, w, 0.1, -0.04, z + 0.08);
    k.line([a, b], INK, Math.max(2, 0.13 * s + 2 * fine(k)));
    k.line([a, b], C.steel, Math.max(1, 0.13 * s));
    k.line([off(u, w, -0.2, 0.05, z + 0.1), off(u, w, 0.04, -0.02, z + 0.11)], mix(C.steel, '#ffffff', 0.5), Math.max(0.5, 0.035 * s));
    k.line([off(u, w, 0.02, -0.01, z + 0.08), off(u, w, 0.1, -0.04, z + 0.08)], C.pink, Math.max(1, 0.14 * s));
    const [hx, hy] = k.p(...off(u, w, 0.16, -0.06, z + 0.11));
    const pen = k.pen;
    pen.beginPath();
    pen.arc(hx, hy, 0.14 * s, 0, Math.PI * 2);
    k.paint(C.chrome, fine(k));
    if (s >= 5) {
      pen.beginPath();
      for (const f of [-0.5, 0, 0.5]) {
        pen.moveTo(hx + f * 0.14 * s, hy - Math.sqrt(1 - f * f) * 0.13 * s);
        pen.lineTo(hx + f * 0.14 * s, hy + Math.sqrt(1 - f * f) * 0.13 * s);
      }
      pen.strokeStyle = C.steel;
      pen.lineWidth = Math.max(0.5, 0.025 * s);
      pen.stroke();
    }
    pen.beginPath();
    pen.arc(hx - 0.05 * s, hy - 0.05 * s, Math.max(0.6, 0.035 * s), 0, Math.PI * 2);
    k.paint('#ffffff', 0);
  },
};

const CLUTTER: readonly Clutter[] = [headphones, vinyl, glowSticks, cassette, sunglasses, can, cocktail, speaker, bear, pads, mic];

// Where they stand: a row along the top's front before the laptop, clear
// of its lid, the agent and the upgrade's end.
const SPOTS: readonly P3[] = [
  [2.8, 2.05, ZT],
  [3.65, 2.25, ZT],
  [4.5, 2.25, ZT],
  [5.35, 2.25, ZT],
];

// A little mirror ball on a chrome stand at the top's front right: turning
// while the desk is worked, its facets sliding round and a few throwing
// coloured glints; dull grey and still while not.
const BALL: P3 = [6.35, 2.45, ZT];
const BALL_R = 0.34;
const BALL_Z = 0.86; // its middle over the top
const mirrorBall: DeskLoop = {
  name: 'mirrorBall',
  at: BALL,
  r: 0.5,
  h: 1.4,
  secs: 8 / 6,
  draw(v, phase) {
    const i = Math.floor(phase * 8);
const k = kitOf(v);
    const [u, w, z] = BALL;
    const on = v.active;
    const s = k.s;
    k.cyl(u, w, z, 0.26, 0.08, C.steelDark, { line: fine(k) });
    k.rod([[u, w, z + 0.08], [u, w, z + BALL_Z - BALL_R + 0.05]], C.chrome, 0.07);
    const [cx, cy] = k.p(u, w, z + BALL_Z);
    const rx = Math.SQRT2 * BALL_R * s;
    const ry = Math.sqrt(1.5) * BALL_R * s;
    if (on) k.halo(u, w, z + BALL_Z, 0.75, C.violet, 0.35);
    const pen = k.pen;
    pen.beginPath();
    pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    pen.fillStyle = on ? '#8d8aa6' : '#6e6a80';
    pen.fill();
    // the facets: bands of latitude, columns of longitude turned an eighth
    // of a column a frame (so the eighth frame is the first again). A
    // facet's shade and glint go by where it is, not which it is: the
    // lights it catches stay put while the facets slide under them.
    pen.save();
    pen.beginPath();
    pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    pen.clip();
    const BANDS = 6;
    const COLS = 12;
    const col = (Math.PI * 2) / COLS;
    const turn = on ? (i / 8) * col : 0;
    const P = (lat: number, lon: number): [number, number] => [cx + rx * Math.cos(lat) * Math.sin(lon), cy - ry * Math.sin(lat)];
    const LIGHTS: ReadonlyArray<readonly [number, number, Color]> = [[1, -0.6, '#ffffff'], [2, 0.35, C.pink], [3, -0.2, '#ffffff'], [4, 0.75, C.cyan], [4, -0.85, '#ffffff']];
    for (let b = 0; b < BANDS; b++) {
      const la0 = -Math.PI / 2 + (b / BANDS) * Math.PI;
      const la1 = -Math.PI / 2 + ((b + 1) / BANDS) * Math.PI;
      for (let m = 0; m < COLS; m++) {
        const lo0 = -Math.PI + m * col + turn;
        const lo1 = lo0 + col;
        const mid = (lo0 + lo1) / 2;
        if (Math.cos(mid) <= 0.05) continue;
        const lit = Math.cos(mid) * (0.6 + 0.4 * Math.cos((la0 + la1) / 2 - 0.5));
        const tone = 0.45 + 0.25 * Math.sin(mid * 5 + b * 1.7);
        let c = mix('#4a4660', '#e8e6f4', Math.min(1, tone * lit + 0.1));
        if (on) {
          for (const [lb, lon, lc] of LIGHTS) {
            if (lb !== b) continue;
            const g = 1 - Math.abs(mid - lon) / (col * 0.8);
            if (g > 0) c = mix(c, lc, Math.min(1, g * 1.3));
          }
        } else c = mix(c, '#5a5670', 0.4);
        pen.beginPath();
        const q = [P(la0, lo0), P(la0, lo1), P(la1, lo1), P(la1, lo0)];
        pen.moveTo(...q[0]);
        for (const p of q.slice(1)) pen.lineTo(...p);
        pen.closePath();
        pen.fillStyle = c;
        pen.fill();
        pen.strokeStyle = withAlpha(INK, 0.55);
        pen.lineWidth = Math.max(0.4, 0.025 * s);
        pen.stroke();
      }
    }
    pen.restore();
    pen.beginPath();
    pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    k.paint(null, fine(k) * 1.3);
    if (!on) return;
    // a white glint at the lit upper left, and two sparkles off it that
    // drift round with the turn
    k.halo(u, w, z + BALL_Z, 0.18, '#ffffff', 0.8);
    const [gx, gy] = [cx - rx * 0.4, cy - ry * 0.45];
    pen.beginPath();
    pen.arc(gx, gy, Math.max(0.8, 0.05 * s), 0, Math.PI * 2);
    pen.fillStyle = '#ffffff';
    pen.fill();
    for (const [ph, c] of [[0, C.pink], [0.5, C.cyan]] as const) {
      const t = (i / 8 + ph) % 1;
      const a = -Math.PI * 0.85 + t * Math.PI * 0.7;
      const [x, y] = [cx + Math.cos(a) * rx * 1.25, cy + Math.sin(a) * ry * 0.6 - ry * 0.2];
      const r = 0.1 * Math.sin(t * Math.PI) * s;
      if (r < 0.3) continue;
      pen.beginPath();
      pen.moveTo(x, y - r * 2);
      pen.lineTo(x + r * 0.5, y - r * 0.5);
      pen.lineTo(x + r * 2, y);
      pen.lineTo(x + r * 0.5, y + r * 0.5);
      pen.lineTo(x, y + r * 2);
      pen.lineTo(x - r * 0.5, y + r * 0.5);
      pen.lineTo(x - r * 2, y);
      pen.lineTo(x - r * 0.5, y - r * 0.5);
      pen.closePath();
      pen.fillStyle = c;
      pen.fill();
    }
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const color = LIPS[v.seed % 3];
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.3);
    booth(k);
    lights(k, color, v.active);
    laptop(k);
    controller(k);
  },
  // the lid's screen, inside its silver edge, leaning back with it
  screen: [
    [SCREEN.u0, lidV(SCREEN.z0), SCREEN.z0],
    [SCREEN.u1, lidV(SCREEN.z0), SCREEN.z0],
    [SCREEN.u1, lidV(SCREEN.z1), SCREEN.z1],
    [SCREEN.u0, lidV(SCREEN.z1), SCREEN.z1],
  ],
  // the top's right end, beside the laptop, clear of the agent
  top: [6.3, 0.75, ZT],
  clutter: { items: CLUTTER, spots: SPOTS },
  loops: [mirrorBall],
};
