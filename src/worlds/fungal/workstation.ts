import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { across, boulder, crystal, fillPts, flask, hull, ring, root, shroom } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, Kit, kitOf, smallKitOf, withAlpha } from './kit.ts';

// Fungal Caverns's workstation (see WorkstationArt in ../types.ts): a shelf-fungus desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A broad bracket fungus, its pale growing edge and its zones on top and
// its gills under the lip, grown out of a stout stalk with a skirt and a
// bulb in a torn cup at its foot. Right of the agent a slab of polished
// crystal stands upright in a cradle of roots: the screen is its face. The
// back of the right end is kept clear for a desk upgrade, so it shows
// beside the agent. Looks: the bracket is tan with a cream edge, sulphur
// orange with a yellow one, or lilac-brown with a pale one.
//
// Its clutter is what a forager camped in a glowing cavern keeps by them:
// a pot of glowing mushrooms, a jar of spores, a snail, a cushion of moss
// with its sporophytes up, a point of crystal, a bowl of berries, a
// beetle, a fern, a potion, a candle on a slice of stalk and two acorns.
// Glowing things glow brighter while the desk is worked; the candle is
// lit. Its spots: one at the back left, one by the slab's foot, two along
// the front, between the agent and the screen and apart across the
// picture, so a near thing does not stand right over a far one. Its loop:
// a toadstool lamp at the front of the right end that breathes while the
// desk is worked, its cap bobbing and glowing and spores rising off it
// (dark and still while it is not).

const ZT = 5.6; // the cap's top
const TH = 0.85; // its lip
type Look = { cap: Color; edge: Color };
const LOOKS: readonly Look[] = [
  { cap: C.capTan, edge: '#f1dfb8' },
  { cap: '#d4843c', edge: '#f6d67e' },
  { cap: '#9c7c92', edge: '#eadcec' },
];
const CLAY = '#9c5a3c';

// The cap's outline at height z, scaled by f about its middle: a rounded
// oblong (a superellipse), a little lumpy, inside the footprint.
function rim(z: number, f: number, n = 28): P3[] {
  const out: P3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const lump = 1 + 0.03 * Math.sin(th * 7 + 1.3);
    const x = Math.sign(c) * Math.abs(c) ** 0.62 * lump;
    const y = Math.sign(s) * Math.abs(s) ** 0.62 * lump;
    out.push([3.5 + 3.4 * x * f, 1.5 + 1.4 * y * f, z]);
  }
  return out;
}

// The crystal slab: its face's outline in (u, z), a gem's chamfered top;
// its face at v = FACE, its back at v = BACK.
const FACE = 1.05;
const BACK = 0.48;
const SLAB: ReadonlyArray<readonly [number, number]> = [
  [2.82, ZT],
  [5.48, ZT],
  [5.48, ZT + 3.5],
  [5.05, ZT + 4.0],
  [3.25, ZT + 4.0],
  [2.82, ZT + 3.5],
];

function draw(v: PropView): void {
  const k = kitOf(v);
  const look = LOOKS[((v.seed % 3) + 3) % 3];
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.45, 0.32);
  stalk(k);
  cap(k, look);
  slab(k);
}

// The stout stalk: a bulb at its foot in the torn cup it grew from, a
// skirt round it.
function stalk(k: Kit): void {
  const cu = 3.6;
  const cv = 1.55;
  const ring = (z: number, r: number) => {
    const out: P3[] = [];
    for (let i = 0; i < 18; i++) out.push([cu + r * Math.cos((i / 18) * Math.PI * 2), cv + r * Math.sin((i / 18) * Math.PI * 2), z]);
    return out;
  };
  const body = hull([...ring(0.05, 0.95), ...ring(0.55, 1.2), ...ring(1.3, 0.92), ...ring(ZT - TH, 0.72)].map((p) => k.p(...p)));
  const xs = body.map((p) => p[0]);
  fillPts(k, body, across(k, Math.min(...xs), Math.max(...xs), C.stalk, 0.08, -0.26), k.lw);
  // the cap's shade falling on it
  const [, ty] = k.p(cu, cv, ZT - TH);
  const [, by] = k.p(cu, cv, 0);
  const under = k.pen.createLinearGradient(0, ty, 0, by);
  under.addColorStop(0, withAlpha('#2a1830', 0.55));
  under.addColorStop(0.35, withAlpha('#2a1830', 0));
  fillPts(k, body, under, 0);
  // fibres up it
  if (k.fine) {
    k.pen.beginPath();
    for (const [a, z0, z1] of [[2.2, 1.0, 3.0], [2.6, 1.4, 4.4], [1.75, 0.8, 2.6], [1.3, 1.6, 4.6]] as const) {
      const p = (z: number, r: number): P3 => [cu + r * Math.cos(a), cv + r * Math.sin(a), z];
      k.trace([p(z0, 0.86), p(z1, 0.76), p(z0, 0.86)]);
    }
    k.pen.strokeStyle = withAlpha(shade(C.stalk, -0.35), 0.7);
    k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    k.pen.stroke();
  }
  // the skirt
  const skirt = hull([...ring(3.45, 0.76), ...ring(2.95, 1.12)].map((p) => k.p(...p)));
  fillPts(k, skirt, shade(C.stalk, -0.04), k.thin);
  // the torn cup its bulb grew out of
  const cup: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 4 + (i / 12) * Math.PI;
    cup.push([cu + 1.24 * Math.cos(a), cv + 1.24 * Math.sin(a), i % 2 ? 1.05 : 0.8]);
  }
  for (let i = 12; i >= 0; i--) {
    const a = -Math.PI / 4 + (i / 12) * Math.PI;
    cup.push([cu + 1.12 * Math.cos(a), cv + 1.12 * Math.sin(a), 0.1]);
  }
  k.poly(cup, shade(C.stalk, -0.12), k.thin);
}

// The bracket fungus: gills under its lip, its rim, its top with a pale
// growing edge and zones in the look's colours.
function cap(k: Kit, look: Look): void {
  const zl = ZT - TH;
  // the gills: seen as a sliver under the front of the lip
  const outer = rim(zl, 0.97);
  const inner = rim(zl - 0.85, 0.62);
  fillPts(k, hull([...outer, ...inner].map((p) => k.p(...p))), C.gill, k.lw);
  if (k.fine) {
    k.pen.beginPath();
    outer.forEach((p, i) => k.trace([p, inner[i], p]));
    k.pen.strokeStyle = shade(C.gill, -0.3);
    k.pen.lineWidth = Math.max(0.7, k.thin * 0.7);
    k.pen.stroke();
  }
  // the lip
  fillPts(k, hull([...rim(ZT, 1), ...rim(zl, 1)].map((p) => k.p(...p))), shade(look.cap, -0.2), k.lw);
  // the top: a pale growing edge, then zones going darker toward the
  // middle, where it grows from the stalk
  k.poly(rim(ZT, 1), look.edge);
  const [x0] = k.p(0, 3, ZT);
  const [x1] = k.p(7, 0, ZT);
  for (const [f, c] of [[0.88, look.cap], [0.7, shade(look.cap, -0.12)], [0.5, shade(look.cap, -0.04)], [0.3, shade(look.cap, -0.24)]] as const) {
    k.poly(rim(ZT, f), across(k, Math.min(x0, x1), Math.max(x0, x1), c, 0.12, -0.1), 0);
  }
}

// The crystal slab and the roots cradling it.
function slab(k: Kit): void {
  const face = SLAB.map(([u, z]): P3 => [u, FACE, z]);
  const back = SLAB.map(([u, z]): P3 => [u, BACK, z]);
  // its sides, as one dark shape round both faces
  fillPts(k, hull([...face, ...back].map((p) => k.p(...p))), C.crystalDark, k.lw);
  // its face, lit from the left
  const [x0] = k.p(2.82, FACE, ZT);
  const [x1] = k.p(5.48, FACE, ZT);
  k.poly(face, across(k, Math.min(x0, x1), Math.max(x0, x1), C.crystal, 0.22, -0.18), k.lw);
  // the bevel round the face: lines from its corners in
  const inset: P3[] = [[3.0, FACE, ZT + 0.38], [5.3, FACE, ZT + 0.38], [5.3, FACE, ZT + 3.58], [4.98, FACE, ZT + 3.8], [3.32, FACE, ZT + 3.8], [3.0, FACE, ZT + 3.58]];
  k.pen.beginPath();
  face.forEach((p, i) => k.trace([p, inset[i], p]));
  k.trace(inset);
  k.pen.strokeStyle = withAlpha(C.crystalLit, 0.8);
  k.pen.lineWidth = Math.max(0.7, k.thin * 0.8);
  k.pen.stroke();
  // a glint down its lit edge
  k.line([[2.89, FACE, ZT + 0.4], [2.89, FACE, ZT + 3.42], [3.3, FACE, ZT + 3.9]], withAlpha('#ffffff', 0.6), Math.max(0.8, 0.12 * k.s));
  // the roots: one along its foot, one curling up each side
  root(k, [2.3, 1.45, ZT + 0.05], [4.15, 1.05, ZT + 0.35], [6.0, 1.4, ZT + 0.05], 0.34);
  root(k, [2.05, 1.75, ZT], [2.45, 1.4, ZT + 0.45], [2.82, 1.15, ZT + 1.45], 0.5);
  root(k, [6.15, 1.75, ZT], [5.75, 1.4, ZT + 0.5], [5.5, 1.2, ZT + 1.55], 0.48);
}

// ── what stands on the top ───────────────────────────────────────────────
// Each drawn standing at `at` on the cap's top with the small things' kit
// (a thinner outline), never reading v.t. Glowing things glow brighter
// while the desk is worked.

// The kit for the smallest parts of a small thing (berries, a cap a
// fifth of a unit round): its outline the small kit's inner line.
const fineKit = (k: Kit): Kit => new Kit(k.pen, k.at, k.s, k.thin);

// A level ring of frame points round (u, w) at z.
function oval(u: number, w: number, z: number, ru: number, rv: number, n = 16): P3[] {
  return Array.from({ length: n }, (_, i): P3 => [u + ru * Math.cos((i / n) * Math.PI * 2), w + rv * Math.sin((i / n) * Math.PI * 2), z]);
}

// The outline of a solid of revolution up from (u, w, z): rings of radius
// r at heights dz, as one screen shape.
function lathe(k: Kit, u: number, w: number, z: number, rings: ReadonlyArray<readonly [number, number]>): Pt[] {
  return hull(rings.flatMap(([dz, r]) => ring(k, [u, w, z + dz], [0, 0, 1], r, 18)));
}

// A shape filled with a gradient lit from the left, inked.
function solid(k: Kit, pts: ReadonlyArray<Pt>, base: Color, line = k.lw): void {
  const xs = pts.map((p) => p[0]);
  fillPts(k, pts, across(k, Math.min(...xs), Math.max(...xs), base, 0.14, -0.28), line);
}

// A ball of colour on screen at a frame point, r units round.
function bead(k: Kit, p: P3, r: number, fill: Color, line = k.thin): void {
  const [x, y] = k.p(...p);
  const R = r * k.s;
  const g = k.pen.createRadialGradient(x - R * 0.35, y - R * 0.35, 0, x, y, R);
  g.addColorStop(0, shade(fill, 0.4));
  g.addColorStop(0.5, fill);
  g.addColorStop(1, shade(fill, -0.25));
  k.pen.beginPath();
  k.pen.arc(x, y, R, 0, Math.PI * 2);
  k.paint(g, line);
}

// A fern frond from `a` arching through `c` to `b`, `w` wide at its
// widest: a leaf of leaflets (a toothed edge), a rib down it.
function frond(k: Kit, a: P3, c: P3, b: P3, w: number): void {
  const n = 10;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const m = (j: number) => (1 - t) * (1 - t) * a[j] + 2 * (1 - t) * t * c[j] + t * t * b[j];
    pts.push(k.p(m(0), m(1), m(2)));
  }
  const left: Pt[] = [];
  const right: Pt[] = [];
  pts.forEach(([x, y], i) => {
    const [px, py] = pts[Math.max(0, i - 1)];
    const [nx, ny] = pts[Math.min(n, i + 1)];
    const l = Math.hypot(nx - px, ny - py) || 1;
    const ww = w * k.s * Math.sin(Math.PI * Math.min(1, 0.1 + (i / n) * 0.95)) * (i % 2 ? 1 : 0.6);
    left.push([x - ((ny - py) / l) * ww, y + ((nx - px) / l) * ww]);
    right.push([x + ((ny - py) / l) * ww, y - ((nx - px) / l) * ww]);
  });
  fillPts(k, [...left, ...right.reverse()], k.grad(a, b, [[0, C.mossLight], [1, C.mossPale]]), k.thin);
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.strokeStyle = C.mossDark;
  k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
  k.pen.stroke();
}

// A clay pot of two blue mushrooms that glow.
const shroomPot: Clutter = {
  name: 'shroomPot',
  r: 0.42,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const lit = v.active;
    solid(k, lathe(k, u, w, z, [[0, 0.24], [0.36, 0.33]]), CLAY);
    k.disc(u, w, z + 0.36, 0.33, shade(CLAY, 0.12), k.thin);
    k.disc(u, w, z + 0.37, 0.26, C.soilDark, 0);
    const cap = lit ? shade(C.capBlue, 0.4) : C.capBlue;
    const f = fineKit(k);
    shroom(f, u - 0.06, w - 0.06, z + 0.36, 0.55, 0.34, cap, { glow: lit, rb: 0.09, lean: [-0.03, -0.02], spots: withAlpha(C.spot, 0.8), seed: 4 });
    shroom(f, u + 0.17, w + 0.12, z + 0.36, 0.3, 0.22, cap, { glow: lit, rb: 0.07, lean: [0.06, 0.03], cap: 'bun' });
  },
};

// A corked jar of spores, specks of light in a soft glow.
const sporeJar: Clutter = {
  name: 'sporeJar',
  r: 0.4,
  h: 1.25,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.cyl(u, w, z, 0.37, 0.95, withAlpha(C.glass, 0.5));
    k.cyl(u, w, z + 0.06, 0.3, 0.62, withAlpha(v.active ? C.glow : C.glowSoft, 0.75), { line: 0 });
    for (const [du, dz, r] of [[-0.12, 0.22, 0.07], [0.1, 0.45, 0.06], [-0.05, 0.66, 0.05], [0.16, 0.18, 0.05], [0.02, 0.84, 0.04]] as const) bead(k, [u + du, w + 0.3, z + dz], r, C.glowHot, 0);
    k.cyl(u, w, z + 0.95, 0.27, 0.28, C.wood, { top: shade(C.wood, 0.2) });
    k.halo(u, w, z + 0.45, v.active ? 1.0 : 0.75, C.glow, v.active ? 0.4 : 0.22);
  },
};

// A snail on its way along the top, its shell a coil.
const snail: Clutter = {
  name: 'snail',
  r: 0.45,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const body = '#cdb79c';
    const side = (d: number): P3[] => [
      [u - 0.46, w + d, z],
      [u + 0.26, w + d, z],
      [u + 0.42, w + d, z + 0.12],
      [u + 0.44, w + d, z + 0.36],
      [u + 0.3, w + d, z + 0.4],
      [u + 0.18, w + d, z + 0.18],
      [u - 0.36, w + d, z + 0.1],
    ];
    solid(k, hull([...side(-0.12), ...side(0.12)].map((p) => k.p(...p))), body);
    // its eye stalks, the far one first
    for (const d of [-0.07, 0.07]) {
      const foot: P3 = [u + 0.36, w + d, z + 0.36];
      const tip: P3 = [u + 0.48, w + d * 1.8, z + 0.7];
      k.line([foot, tip], INK, Math.max(1.2, 0.15 * k.s));
      k.line([foot, tip], body, Math.max(0.6, 0.07 * k.s));
      bead(k, tip, 0.06, '#3a2a30', 0);
    }
    // the shell, a coil on its back
    const [x, y] = k.p(u - 0.1, w, z + 0.44);
    const R = 0.38 * k.s;
    const shell = C.capTan;
    const g = k.pen.createRadialGradient(x - R * 0.4, y - R * 0.4, 0, x, y, R);
    g.addColorStop(0, shade(shell, 0.35));
    g.addColorStop(0.6, shell);
    g.addColorStop(1, shade(shell, -0.3));
    k.pen.beginPath();
    k.pen.arc(x, y, R, 0, Math.PI * 2);
    k.paint(g, k.lw);
    k.pen.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 4 + 0.6;
      const rr = R * (0.1 + (0.72 * i) / 40);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i) k.pen.lineTo(px, py);
      else k.pen.moveTo(px, py);
    }
    k.pen.strokeStyle = shade(shell, -0.5);
    k.pen.lineWidth = Math.max(0.8, 0.07 * k.s);
    k.pen.stroke();
  },
};

// A cushion of moss, its sporophytes up on thin red stalks.
const moss: Clutter = {
  name: 'moss',
  r: 0.45,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const mound = lathe(k, u, w, z, [[0, 0.44], [0.22, 0.38], [0.38, 0.22]]);
    const [cx, cy] = k.p(u - 0.12, w - 0.12, z + 0.34);
    const g = k.pen.createRadialGradient(cx, cy, 0, cx, cy, 0.7 * k.s);
    g.addColorStop(0, C.mossPale);
    g.addColorStop(0.45, C.mossLight);
    g.addColorStop(1, C.moss);
    fillPts(k, mound, g, k.lw);
    if (k.fine) {
      k.pen.beginPath();
      for (const [du, dv, dz] of [[-0.24, 0.12, 0.18], [0.05, 0.26, 0.12], [0.24, -0.05, 0.2], [-0.06, -0.02, 0.36], [0.14, 0.14, 0.28]] as const) {
        const [x, y] = k.p(u + du, w + dv, z + dz);
        k.pen.moveTo(x - 0.09 * k.s, y);
        k.pen.quadraticCurveTo(x, y + 0.08 * k.s, x + 0.09 * k.s, y);
      }
      k.pen.strokeStyle = C.mossDark;
      k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
      k.pen.stroke();
    }
    for (const [du, dv, hh] of [[-0.14, -0.12, 0.5], [0.12, -0.06, 0.38], [0.0, 0.12, 0.28]] as const) {
      const b: P3 = [u + du, w + dv, z + 0.32];
      const t: P3 = [u + du + 0.05, w + dv, z + 0.32 + hh];
      k.line([b, t], INK, Math.max(1, 0.11 * k.s));
      k.line([b, t], '#c0603a', Math.max(0.6, 0.05 * k.s));
      bead(k, t, 0.08, '#b0542e');
    }
  },
};

// A point of crystal and two little ones on a lump of rock; lit within
// while the desk is worked.
const crystalPoint: Clutter = {
  name: 'crystal',
  r: 0.45,
  h: 1.45,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    boulder(k, u, w, z, 0.42, 0.26, C.rock, 5);
    if (v.active) k.halo(u, w, z + 0.7, 0.9, C.crystal, 0.4);
    crystal(k, [u - 0.14, w - 0.08, z + 0.14], [-0.5, -0.12, 1], 0.78, 0.15, C.crystal, k.lw);
    crystal(k, [u + 0.02, w - 0.02, z + 0.14], [0.06, 0, 1], 1.25, 0.2, C.crystal, k.lw);
    crystal(k, [u + 0.16, w + 0.12, z + 0.1], [0.4, 0.35, 1], 0.6, 0.14, C.crystal, k.lw);
    if (v.active) k.halo(u, w, z + 0.8, 0.45, C.crystalLit, 0.4);
  },
};

// A wooden bowl heaped with berries.
const berryBowl: Clutter = {
  name: 'berryBowl',
  r: 0.45,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    solid(k, lathe(k, u, w, z, [[0, 0.22], [0.12, 0.36], [0.3, 0.44]]), C.wood);
    k.disc(u, w, z + 0.3, 0.44, shade(C.wood, 0.14), k.lw);
    k.disc(u, w, z + 0.31, 0.36, C.woodDark, 0);
    const berries: ReadonlyArray<readonly [number, number, number, Color]> = [
      [-0.16, -0.14, 0.04, C.red],
      [0.1, -0.18, 0.03, '#4c5cb0'],
      [-0.2, 0.1, 0.03, '#4c5cb0'],
      [-0.02, -0.02, 0.14, C.capViolet],
      [0.2, 0.02, 0.04, C.red],
      [0.04, 0.18, 0.06, C.red],
    ];
    for (const [du, dv, dz, c] of berries) bead(k, [u + du, w + dv, z + 0.4 + dz], 0.13, c, Math.max(1, k.thin * 0.8));
  },
};

// A beetle, its wing cases green going blue, three legs a side.
const beetle: Clutter = {
  name: 'beetle',
  r: 0.45,
  h: 0.48,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.pen.beginPath();
    for (const sd of [-1, 1]) {
      for (const du of [-0.2, 0.02, 0.22]) k.open([[u + du, w + sd * 0.12, z + 0.14], [u + du + 0.05, w + sd * 0.36, z + 0.16], [u + du + 0.12, w + sd * 0.42, z]]);
      k.open([[u + 0.42, w + sd * 0.05, z + 0.16], [u + 0.54, w + sd * 0.17, z + 0.26]]);
    }
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = Math.max(1, 0.06 * k.s);
    k.pen.lineCap = 'round';
    k.pen.lineJoin = 'round';
    k.pen.stroke();
    // its head, then its thorax, then its wing cases over them
    fillPts(k, hull([...oval(u + 0.4, w, z + 0.06, 0.09, 0.11), ...oval(u + 0.4, w, z + 0.18, 0.07, 0.08)].map((p) => k.p(...p))), '#35505a', k.thin);
    fillPts(k, hull([...oval(u + 0.27, w, z + 0.08, 0.12, 0.17), ...oval(u + 0.27, w, z + 0.26, 0.08, 0.12)].map((p) => k.p(...p))), '#2f7a68', k.thin);
    const shell = hull([...oval(u - 0.08, w, z + 0.1, 0.34, 0.25), ...oval(u - 0.08, w, z + 0.36, 0.22, 0.15)].map((p) => k.p(...p)));
    const xs = shell.map((p) => p[0]);
    const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
    g.addColorStop(0, '#78e8b8');
    g.addColorStop(0.45, '#2f9a7e');
    g.addColorStop(1, '#2c4f96');
    fillPts(k, shell, g, k.lw);
    k.line([[u + 0.18, w, z + 0.33], [u - 0.06, w, z + 0.46], [u - 0.4, w, z + 0.16]], withAlpha(INK, 0.8), Math.max(0.7, 0.06 * k.s));
    const [hx, hy] = k.p(u - 0.15, w - 0.06, z + 0.42);
    k.pen.beginPath();
    k.pen.ellipse(hx, hy, 0.11 * k.s, 0.05 * k.s, -0.4, 0, Math.PI * 2);
    k.pen.fillStyle = withAlpha('#ffffff', 0.6);
    k.pen.fill();
  },
};

// A fern in a little clay pot, its fronds arching out.
const fern: Clutter = {
  name: 'fern',
  r: 0.45,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    solid(k, lathe(k, u, w, z, [[0, 0.2], [0.34, 0.27]]), CLAY);
    k.disc(u, w, z + 0.34, 0.27, shade(CLAY, 0.12), k.thin);
    k.disc(u, w, z + 0.35, 0.21, C.soilDark, 0);
    const b: P3 = [u, w, z + 0.34];
    const fronds: ReadonlyArray<readonly [number, number, number]> = [
      [-0.5, -0.86, 1.15],
      [0.88, -0.48, 0.95],
      [-0.92, 0.38, 0.85],
      [0.4, 0.92, 0.75],
    ];
    for (const [du, dv, hh] of [...fronds].sort((p, q) => p[0] + p[1] - (q[0] + q[1]))) {
      frond(k, b, [u + du * 0.15, w + dv * 0.15, z + 0.34 + hh * 1.2], [u + du * 0.4, w + dv * 0.4, z + 0.34 + hh * 0.45], 0.16);
    }
  },
};

// A round flask of pink potion, glowing while the desk is worked.
const potion: Clutter = {
  name: 'potion',
  r: 0.4,
  h: 1.1,
  draw(v, [u, w, z]) {
    flask(smallKitOf(v), u, w, z, 0.37, C.pink, v.active);
  },
};

// A candle stub on a slice of mushroom stalk, lit while the desk is worked.
const candle: Clutter = {
  name: 'candle',
  r: 0.44,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.cyl(u, w, z, 0.42, 0.16, C.stalk, { top: shade(C.gill, 0.12) });
    const e = k.ell(u, w, z + 0.16, 0.26);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    k.pen.strokeStyle = shade(C.gill, -0.2);
    k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    k.pen.stroke();
    k.cyl(u + 0.02, w, z + 0.16, 0.18, 0.56, C.wax);
    k.line([[u + 0.15, w + 0.12, z + 0.7], [u + 0.16, w + 0.13, z + 0.46]], shade(C.wax, 0.18), Math.max(0.8, 0.08 * k.s));
    k.line([[u + 0.02, w, z + 0.72], [u + 0.02, w, z + 0.82]], INK, Math.max(0.8, 0.06 * k.s));
    if (!v.active) return;
    const [x, y] = k.p(u + 0.02, w, z + 0.96);
    k.halo(u + 0.02, w, z + 0.96, 0.8, '#ffc070', 0.45);
    k.pen.beginPath();
    k.pen.moveTo(x, y - 0.26 * k.s);
    k.pen.quadraticCurveTo(x + 0.14 * k.s, y + 0.02 * k.s, x, y + 0.13 * k.s);
    k.pen.quadraticCurveTo(x - 0.14 * k.s, y + 0.02 * k.s, x, y - 0.26 * k.s);
    k.paint(C.flame, 0);
    k.pen.beginPath();
    k.pen.ellipse(x, y + 0.03 * k.s, 0.05 * k.s, 0.08 * k.s, 0, 0, Math.PI * 2);
    k.pen.fillStyle = C.flameHot;
    k.pen.fill();
  },
};

// An acorn standing on its point at (x, y) on screen, R px round, tilted
// by `tilt`: a glossy nut under a scaly cap.
function acorn(k: Kit, x: number, y: number, R: number, tilt: number): void {
  const pen = k.pen;
  pen.save();
  pen.translate(x, y);
  pen.rotate(tilt);
  // the nut, an egg point down
  pen.beginPath();
  pen.moveTo(0, R * 1.05);
  pen.bezierCurveTo(R * 0.95, R * 0.8, R * 0.95, -R * 0.35, R * 0.82, -R * 0.4);
  pen.lineTo(-R * 0.82, -R * 0.4);
  pen.bezierCurveTo(-R * 0.95, -R * 0.35, -R * 0.95, R * 0.8, 0, R * 1.05);
  const g = pen.createLinearGradient(-R, 0, R, 0);
  g.addColorStop(0, '#d29a5a');
  g.addColorStop(0.35, '#c08040');
  g.addColorStop(1, '#8a5428');
  k.paint(g, k.lw);
  pen.beginPath();
  pen.ellipse(-R * 0.38, R * 0.1, R * 0.14, R * 0.36, 0, 0, Math.PI * 2);
  pen.fillStyle = withAlpha('#ffffff', 0.35);
  pen.fill();
  // the cap, scaly, a stalk on it
  pen.beginPath();
  pen.moveTo(-R * 0.98, -R * 0.36);
  pen.bezierCurveTo(-R * 1.0, -R * 1.0, R * 1.0, -R * 1.0, R * 0.98, -R * 0.36);
  pen.quadraticCurveTo(0, -R * 0.16, -R * 0.98, -R * 0.36);
  k.paint('#7a5a3c', k.lw);
  if (k.fine) {
    pen.beginPath();
    for (const [a, b] of [[-0.6, -0.55], [-0.2, -0.62], [0.2, -0.62], [0.6, -0.55], [-0.4, -0.78], [0, -0.82], [0.4, -0.78]] as const) {
      pen.moveTo(R * (a - 0.12), R * b);
      pen.quadraticCurveTo(R * a, R * (b + 0.12), R * (a + 0.12), R * b);
    }
    pen.strokeStyle = '#4e3826';
    pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    pen.stroke();
  }
  pen.beginPath();
  pen.moveTo(0, -R * 0.84);
  pen.lineTo(R * 0.12, -R * 1.2);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(1.2, 0.14 * k.s);
  pen.stroke();
  pen.strokeStyle = '#7a5a3c';
  pen.lineWidth = Math.max(0.6, 0.06 * k.s);
  pen.stroke();
  pen.restore();
}

// Two acorns standing on their points, the small one in front.
const acorns: Clutter = {
  name: 'acorns',
  r: 0.44,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const [bx, by] = k.p(u - 0.12, w - 0.14, z + 0.4);
    acorn(k, bx, by, 0.36 * k.s, -0.1);
    const [fx, fy] = k.p(u + 0.16, w + 0.16, z + 0.3);
    acorn(k, fx, fy, 0.28 * k.s, 0.25);
  },
};

// The spots, a thing's width apart, in the strip between the agent at
// work and the slab: the back left, past the slab's foot, along the front.
const SPOTS: readonly P3[] = [
  [1.5, 0.75, ZT],
  [2.5, 1.4, ZT],
  [4.0, 2.0, ZT],
  [5.25, 2.25, ZT],
];

// A toadstool lamp at the front of the right end. While the desk is
// worked it breathes: its stalk stretches a little and its cap bobs up as
// its light swells, then settles, eased round eight steps (1.6 s); and
// three glowing spores, a third of a breath apart, rise off its crown,
// drifting back away from the slab, brightening and then fading away. Dark, still and
// spore-less while the desk is not worked.
const LAMP: P3 = [6.3, 2.35, ZT];
const BREATHS = 8;
const breath = (i: number): number => (1 - Math.cos((i / BREATHS) * Math.PI * 2)) / 2;
const SPORES: ReadonlyArray<readonly [number, number, number]> = [
  [-0.04, -0.12, 0],
  [0.16, 0.02, 1 / 3],
  [0.14, 0.12, 2 / 3],
];
const glowCap: DeskLoop = {
  name: 'glowCap',
  at: LAMP,
  r: 0.6,
  h: 2.3,
  frames: BREATHS,
  fps: 5,
  draw(v, i) {
    const k = smallKitOf(v);
    const [u, w, z] = LAMP;
    const lit = v.active;
    const a = lit ? breath(i) : 0;
    const bob = 0.15 * a;
    if (lit) k.pool(u, w, 0.9, 0.65, C.glow, 0.2 + 0.15 * a, z);
    const cap = lit ? mix(shade(C.glow, -0.05), shade(C.glow, 0.3), a) : shade(C.glowSoft, -0.3);
    shroom(k, u, w, z, 0.95 + bob, 0.55, cap, { spots: withAlpha(C.spot, 0.85), seed: 3, rb: 0.19, glow: lit });
    if (!lit) return;
    k.halo(u, w, z + 1.15 + bob, 0.75 + 0.25 * a, C.glow, 0.25 + 0.2 * a);
    k.halo(u, w, z + 1.1 + bob, 0.4, '#ffffff', 0.15 + 0.15 * a);
    // the spores: each from the crown up 0.85, drifting back off the slab's
    // way (-v), faded in and out
    const pen = k.pen;
    for (const [du, dv, ph] of SPORES) {
      const p = (i / BREATHS + ph) % 1;
      const fade = Math.sin(Math.PI * p);
      if (fade < 0.05) continue;
      const su = u + du + 0.06 * p;
      const sv = w + dv - 0.36 * p;
      const sz = z + 1.3 + 0.85 * p;
      k.halo(su, sv, sz, 0.32, C.glow, 0.9 * fade);
      const [x, y] = k.p(su, sv, sz);
      pen.beginPath();
      pen.arc(x, y, Math.max(1, 0.12 * k.s), 0, Math.PI * 2);
      pen.fillStyle = withAlpha(C.glowHot, 0.4 + 0.6 * fade);
      pen.fill();
    }
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 9.6,
  draw,
  screen: [
    [3.1, FACE, ZT + 0.7],
    [5.2, FACE, ZT + 0.7],
    [5.2, FACE, ZT + 3.48],
    [3.1, FACE, ZT + 3.48],
  ],
  top: [6.45, 0.6, ZT],
  clutter: { items: [shroomPot, sporeJar, snail, moss, crystalPoint, berryBowl, beetle, fern, potion, candle, acorns], spots: SPOTS },
  loops: [glowCap],
};
