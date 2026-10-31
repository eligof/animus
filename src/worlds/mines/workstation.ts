import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { across, bucket, fillPts, hangLantern, hull, pickaxe, ring, rock, ropeCoil, sparkle } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, kitOf } from './kit.ts';

// The Mines's workstation (see WorkstationArt in ../types.ts): a miner's
// lantern-lit workbench. Heavy planks edged in timber on two pine
// trestles, braced with an iron strap; a hurricane lantern hung from a
// bent pole at its left end; at the back, right of the agent, a slate in
// a timber frame propped upright as a foreman chalks up the shift (the
// screen); the right end kept clear for a desk upgrade. Looks: 0 a pick
// leaning on the left trestle, 1 a coil of rope under the top, 2 a bucket
// of ore under it. On: the lantern lit.
// What stands on the top is a place's pick from a gold-rush camp's odds
// and ends (CLUTTER): an enamel cup, a lump of ore, a little pan of nuggets,
// a coil of fuse, coal, a bundle of dynamite, an enamel coffee pot, an
// opened can of beans, a poke of gold dust, a canary in its cage and an
// oil can, on spots in the strip between the agent and the slate. What
// moves (LOOPS): a candle stub in its dish at the front right corner,
// its flame swaying while the desk is worked, out while it is not.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const TOP = 6.0; // the top's surface
const UNDER = 5.4; // the planks' underside
const BEAM = 4.8; // the trestles' cross beams' underside
const TRESTLES = [0.75, 6.25];
// The slate's frame: u0..u1 along, v0..v1 deep, up from the top to z1.
const SLATE = { u0: 2.3, u1: 5.5, v0: 0.45, v1: 0.9, z1: 9.85 };

// A trestle at u: two pine legs splayed front and back under a cross beam.
function trestle(k: Kit, u: number): void {
  k.rod([[u, 0.25, 0], [u, 0.85, BEAM]], C.pine, 0.42);
  k.rod([[u, 2.75, 0], [u, 2.15, BEAM]], C.pine, 0.42);
  k.box(u - 0.35, 0.3, BEAM, 0.7, 2.4, UNDER - BEAM, C.pine, { line: k.thin });
}

// The planks of the top, the timber edge along its front, and (close up)
// a candle-blackened knot or two.
function bench(k: Kit): void {
  // three planks, their ends not quite flush, the seams inked between them
  k.box(0.1, 0, UNDER, DESK.len - 0.1, 0.9, TOP - UNDER, C.plank, { stripe: false });
  k.box(0, 0.9, UNDER, DESK.len - 0.05, 0.85, TOP - UNDER, shade(C.plank, -0.05), { stripe: false });
  k.box(0.05, 1.75, UNDER, DESK.len - 0.05, 0.85, TOP - UNDER, C.plank, { stripe: false });
  k.box(0, 2.6, UNDER - 0.35, DESK.len, 0.4, TOP - UNDER + 0.35, C.timber);
  if (k.fine) {
    for (const [u, v, r] of [[1.9, 0.55, 0.16], [4.3, 1.95, 0.13], [6.3, 2.25, 0.11]] as const) {
      k.disc(u, v, TOP + 0.01, r * 1.8, shade(C.plank, -0.2), 0);
      k.disc(u, v, TOP + 0.01, r, C.timberDark, 0);
    }
    // a grain line or two
    k.line([[0.4, 0.95, TOP + 0.01], [1.5, 0.9, TOP + 0.01]], shade(C.plank, -0.22), Math.max(0.7, 0.06 * k.s));
    k.line([[3.1, 2.1, TOP + 0.01], [5.0, 2.15, TOP + 0.01]], shade(C.plank, -0.22), Math.max(0.7, 0.06 * k.s));
  }
}

// The slate in its timber frame, a chalk ledge at its foot and a strut
// propping it at the +u end. The screen is its face (see WORKSTATION.screen).
function slate(k: Kit): void {
  const { u0, u1, v0, v1, z1 } = SLATE;
  k.rod([[u1 + 0.3, 0.1, TOP], [u1 - 0.1, v0 + 0.1, 8.9]], C.timber, 0.26);
  k.box(u0, v0, TOP, u1 - u0, v1 - v0, z1 - TOP, C.timberDark);
  // the slate's face inside the frame (the layer paints over it)
  k.poly([[2.6, v1, 6.6], [5.2, v1, 6.6], [5.2, v1, 9.4], [2.6, v1, 9.4]], '#3b4046', k.thin);
  // pegs at the frame's corners
  if (k.fine) for (const [u, z] of [[u0 + 0.15, 6.3], [u1 - 0.15, 6.3], [u0 + 0.15, z1 - 0.22], [u1 - 0.15, z1 - 0.22]] as const) k.disc(u, v1 + 0.01, z, 0.07, C.timberOld, 0);
  // the chalk ledge, a stub of chalk and a rag on it
  k.box(u0, v1, TOP, u1 - u0, 0.3, 0.28, C.timber, { line: k.thin });
  k.rod([[3.0, v1 + 0.15, TOP + 0.36], [3.55, v1 + 0.15, TOP + 0.36]], '#f2ece0', 0.16);
  if (k.fine) k.poly([[4.3, v1 + 0.02, TOP + 0.28], [5.0, v1 + 0.02, TOP + 0.28], [4.95, v1 + 0.3, TOP + 0.42], [4.35, v1 + 0.3, TOP + 0.4]], C.canvas, k.thin);
}

// ── on the top: a place's pick of these (see clutterOf) ─────────────────────

// A pot or can from r0 round at its foot to r1 round h up, shaded across.
function frustum(k: Kit, u: number, v: number, z: number, r0: number, r1: number, h: number, color: Color, line = k.thin): void {
  const pts = hull([...ring(k, [u, v, z], [0, 0, 1], r0, 24), ...ring(k, [u, v, z + h], [0, 0, 1], r1, 24)]);
  fillPts(k, pts, across(k, pts, color), line);
}

// A band round an upright drum r round from z0 to z1 (a label, a hoop):
// its front half, inked down its sides.
function band(k: Kit, u: number, v: number, z0: number, z1: number, r: number, fill: Color): void {
  const a = k.ell(u, v, z0, r);
  const b = k.ell(u, v, z1, r);
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(b.cx, b.cy, b.rx, b.ry, b.rot, Math.PI, 0, true);
  pen.ellipse(a.cx, a.cy, a.rx, a.ry, a.rot, 0, Math.PI, false);
  pen.closePath();
  pen.fillStyle = fill;
  pen.fill();
  pen.beginPath();
  for (const f of [-1, 1]) {
    pen.moveTo(a.cx + f * a.rx, a.cy);
    pen.lineTo(b.cx + f * b.rx, b.cy);
  }
  k.paint(null, k.thin);
}

// White flecks on enamel, on the side the viewer sees: (turn, height) pairs
// round a drum of radius r(height).
function flecks(k: Kit, u: number, v: number, z: number, at: ReadonlyArray<readonly [number, number]>, r: (dz: number) => number): void {
  if (k.s < 5) return;
  const pen = k.pen;
  pen.beginPath();
  for (const [th, dz] of at) {
    const [x, y] = k.p(u + Math.cos(th) * r(dz), v + Math.sin(th) * r(dz), z + dz);
    const d = Math.max(0.5, 0.035 * k.s);
    pen.moveTo(x + d, y);
    pen.arc(x, y, d, 0, Math.PI * 2);
  }
  pen.fillStyle = '#eef2f0';
  pen.fill();
}

// A handle of bent strap or wire: ink under the colour.
function strap(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, Math.max(1, w * k.s + k.thin));
  k.line(pts, color, Math.max(0.6, w * k.s));
}

const ENAMEL = C.blanket2; // blue graniteware
const ENAMEL_WHITE = '#ece6da';

// An enamel camp cup, white with a blue rim, its handle on the +u side.
const enamelCup: Clutter = {
  name: 'enamelCup',
  r: 0.4,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.27, 0.5, ENAMEL_WHITE, { line: k.thin });
    band(k, u, w, z + 0.38, z + 0.5, 0.27, ENAMEL);
    k.disc(u, w, z + 0.5, 0.27, ENAMEL, k.thin);
    k.disc(u, w, z + 0.5, 0.2, '#3a2a20', 0);
    strap(k, [[u + 0.26, w, z + 0.42], [u + 0.41, w, z + 0.36], [u + 0.4, w, z + 0.17], [u + 0.26, w, z + 0.12]], ENAMEL_WHITE, 0.08);
  },
};

// A lump of ore: grey rock with gold showing in it, and a glint.
const oreLump: Clutter = {
  name: 'oreLump',
  r: 0.4,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    rock(k, u, w, z, 0.4, 0.5, C.rock, 17, k.thin);
    k.disc(u - 0.1, w + 0.12, z + 0.32, 0.12, C.gold, 0);
    k.disc(u + 0.14, w + 0.05, z + 0.2, 0.08, C.goldHi, 0);
    k.disc(u + 0.04, w - 0.1, z + 0.42, 0.07, C.gold, 0);
    if (k.s >= 5) sparkle(k, u - 0.12, w + 0.08, z + 0.45, 0.26, 0.9);
  },
};

// A little gold pan, its sides sloping out, three nuggets in it.
const nuggetPan: Clutter = {
  name: 'nuggetPan',
  r: 0.4,
  h: 0.35,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    frustum(k, u, w, z, 0.28, 0.4, 0.14, C.ironLight);
    k.disc(u, w, z + 0.14, 0.4, shade(C.ironLight, 0.12), k.thin);
    k.disc(u, w, z + 0.14, 0.31, shade(C.iron, 0.1), 0);
    const fine = Math.max(0.6, 0.07 * k.s);
    rock(k, u - 0.13, w - 0.07, z + 0.14, 0.13, 0.12, C.gold, 3, fine);
    rock(k, u + 0.13, w - 0.06, z + 0.14, 0.11, 0.1, C.gold, 5, fine);
    rock(k, u, w + 0.1, z + 0.14, 0.15, 0.14, C.gold, 8, fine);
    if (k.s >= 5) sparkle(k, u - 0.03, w + 0.08, z + 0.3, 0.2, 0.9);
  },
};

// A coil of tarred safety fuse, three fat turns stacked, each with the
// lamp's light along its top, its loose end over the rim and cut pale.
const FUSE = '#6e5a4c';
const fuseCoil: Clutter = {
  name: 'fuseCoil',
  r: 0.4,
  h: 0.45,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const pen = k.pen;
    const thick = 0.13 * k.s;
    for (let i = 0; i < 3; i++) {
      const e = k.ell(u, w, z + 0.08 + i * 0.13, 0.3 - i * 0.03);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      pen.strokeStyle = INK;
      pen.lineWidth = Math.max(1.6, thick + k.thin);
      pen.stroke();
      pen.strokeStyle = shade(FUSE, 0.06 * i);
      pen.lineWidth = Math.max(0.9, thick);
      pen.stroke();
      // the sheen of the tar along the turn's top, on its near side
      pen.beginPath();
      pen.ellipse(e.cx, e.cy - thick * 0.22, e.rx, e.ry, e.rot, 0.25, Math.PI - 0.25);
      pen.strokeStyle = '#b8a48c';
      pen.lineWidth = Math.max(0.6, thick * 0.32);
      pen.stroke();
    }
    strap(k, [[u + 0.14, w + 0.2, z + 0.34], [u + 0.28, w + 0.28, z + 0.2], [u + 0.36, w + 0.3, z + 0.05]], shade(FUSE, 0.12), 0.12);
    k.disc(u + 0.36, w + 0.3, z + 0.05, 0.06, '#e8d8b8', 0);
  },
};

// A lump of coal: an angular nugget of anthracite, its top facet catching
// the lamp blue-grey, its right side in shade, a glint on its edge.
function coalLump(k: Kit, u: number, w: number, z: number, r: number, h: number, tilt: number): void {
  const [x, y] = k.p(u, w, z);
  const W = r * k.s * 1.35;
  const H = h * k.s;
  const t = tilt * W;
  const pen = k.pen;
  const out: Array<[number, number]> = [
    [x - W, y - 0.12 * H],
    [x - 0.78 * W, y - 0.62 * H],
    [x - 0.18 * W + t, y - H],
    [x + 0.52 * W + t, y - 0.86 * H],
    [x + W, y - 0.3 * H],
    [x + 0.62 * W, y + 0.2 * W],
    [x - 0.42 * W, y + 0.22 * W],
  ];
  const mid: [number, number] = [x + 0.08 * W + t * 0.5, y - 0.46 * H];
  const face = (pts: ReadonlyArray<readonly [number, number]>, fill: Color): void => {
    pen.beginPath();
    pts.forEach(([px, py], i) => (i ? pen.lineTo(px, py) : pen.moveTo(px, py)));
    pen.closePath();
    pen.fillStyle = fill;
    pen.fill();
  };
  face(out, '#4c5266'); // the near faces
  face([out[1], out[2], out[3], mid], '#8c95b0'); // the top, lit
  face([out[3], out[4], out[5], mid], '#30333f'); // the right, in shade
  pen.beginPath();
  out.forEach(([px, py], i) => (i ? pen.lineTo(px, py) : pen.moveTo(px, py)));
  pen.closePath();
  k.paint(null, Math.max(0.9, 0.09 * k.s));
  // a glint on the top's front edge
  pen.beginPath();
  pen.moveTo(out[2][0] + 0.1 * W, out[2][1] + 0.12 * H);
  pen.lineTo(mid[0] - 0.1 * W, mid[1] - 0.05 * H);
  pen.strokeStyle = '#e4eaff';
  pen.lineWidth = Math.max(0.7, 0.05 * k.s);
  pen.lineCap = 'round';
  pen.stroke();
}

// A few lumps of coal with a cold blue sheen.
const coal: Clutter = {
  name: 'coal',
  r: 0.42,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    // the back ones first
    coalLump(k, u + 0.17, w - 0.13, z, 0.22, 0.36, 0.1);
    coalLump(k, u - 0.17, w - 0.05, z, 0.24, 0.44, -0.1);
    coalLump(k, u + 0.05, w + 0.16, z, 0.27, 0.52, 0.05);
  },
};

// A bundle of three sticks of dynamite tied with cord, a fuse curling up.
const dynamite: Clutter = {
  name: 'dynamite',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const H = 0.9;
    for (const [du, dv] of [[-0.15, -0.08], [0.15, -0.08], [0, 0.15]] as const) {
      k.cyl(u + du, w + dv, z, 0.15, H, C.red, { line: k.thin });
      k.disc(u + du, w + dv, z + H, 0.08, '#e8d6b0', 0);
    }
    const e = k.ell(u, w + 0.02, z + H * 0.5, 0.33);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0.2, Math.PI - 0.2);
    k.pen.strokeStyle = C.rope;
    k.pen.lineWidth = Math.max(0.8, 0.09 * k.s);
    k.pen.stroke();
    k.line([[u, w + 0.15, z + H], [u + 0.04, w + 0.15, z + H + 0.18], [u + 0.18, w + 0.15, z + H + 0.28], [u + 0.27, w + 0.15, z + H + 0.38]], '#3a2a20', Math.max(0.8, 0.07 * k.s));
  },
};

// A blue enamel coffee pot, flecked white: spout behind, handle in front.
const coffeePot: Clutter = {
  name: 'coffeePot',
  r: 0.42,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    strap(k, [[u - 0.16, w - 0.06, z + 0.3], [u - 0.3, w - 0.1, z + 0.58], [u - 0.4, w - 0.12, z + 0.8]], ENAMEL, 0.16);
    frustum(k, u, w, z, 0.3, 0.21, 0.76, ENAMEL);
    flecks(k, u, w, z, [[0.3, 0.15], [1.2, 0.3], [0.9, 0.58], [2.0, 0.22], [-0.3, 0.48], [1.6, 0.66], [0.2, 0.68], [2.3, 0.5]], (dz) => 0.3 - (0.09 * dz) / 0.76);
    k.disc(u, w, z + 0.76, 0.21, ENAMEL_WHITE, k.thin);
    frustum(k, u, w, z + 0.76, 0.19, 0.09, 0.14, shade(ENAMEL, 0.06));
    k.cyl(u, w, z + 0.9, 0.06, 0.1, '#d9dde0', { line: k.thin * 0.8 });
    strap(k, [[u + 0.22, w + 0.03, z + 0.68], [u + 0.4, w + 0.04, z + 0.58], [u + 0.38, w + 0.04, z + 0.26], [u + 0.25, w + 0.03, z + 0.16]], ENAMEL, 0.08);
  },
};

// An opened can of beans: a plain red label, the lid cut and bent up at
// the back, a spoon standing in it.
const beanCan: Clutter = {
  name: 'beanCan',
  r: 0.36,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const H = 0.56;
    k.cyl(u, w, z, 0.25, H, C.steel, { line: k.thin });
    band(k, u, w, z + 0.12, z + 0.42, 0.25, '#b0473a');
    k.disc(u, w, z + H, 0.2, '#8a4a2a', 0);
    if (k.s >= 5) for (const [du, dv] of [[-0.06, 0.02], [0.05, -0.05], [0.04, 0.07]] as const) k.disc(u + du, w + dv, z + H + 0.01, 0.045, '#b86a3a', 0);
    // the spoon, its bowl down in the beans
    strap(k, [[u + 0.02, w + 0.04, z + H], [u + 0.2, w + 0.1, z + H + 0.34]], C.steel, 0.06);
    // the lid, hinged at the back rim, raised nearly upright
    const lid = ring(k, [u - 0.1, w - 0.1, z + H + 0.2], [-0.66, -0.66, 0.34], 0.22, 20);
    fillPts(k, lid, shade(C.steel, -0.08), k.thin);
  },
};

// A poke of gold dust: a leather pouch tied at the neck, a pinch spilt.
const goldPoke: Clutter = {
  name: 'goldPoke',
  r: 0.4,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const s = k.s;
    const pen = k.pen;
    const [x, y] = k.p(u, w, z);
    const by = y - 0.3 * s; // the belly's middle
    const ny = y - 0.62 * s; // the neck
    pen.beginPath();
    pen.moveTo(x - 0.1 * s, ny);
    pen.bezierCurveTo(x - 0.2 * s, ny + 0.1 * s, x - 0.48 * s, by - 0.12 * s, x - 0.46 * s, by + 0.06 * s);
    pen.bezierCurveTo(x - 0.44 * s, y + 0.06 * s, x + 0.44 * s, y + 0.06 * s, x + 0.46 * s, by + 0.06 * s);
    pen.bezierCurveTo(x + 0.48 * s, by - 0.12 * s, x + 0.2 * s, ny + 0.1 * s, x + 0.1 * s, ny);
    pen.closePath();
    const g = pen.createLinearGradient(x - 0.46 * s, 0, x + 0.46 * s, 0);
    g.addColorStop(0, shade(C.leather, 0.3));
    g.addColorStop(0.5, shade(C.leather, 0.12));
    g.addColorStop(1, shade(C.leather, -0.2));
    k.paint(g, k.thin);
    // the gathered top over the tie
    pen.beginPath();
    pen.moveTo(x - 0.1 * s, ny);
    pen.lineTo(x - 0.24 * s, ny - 0.18 * s);
    pen.lineTo(x - 0.07 * s, ny - 0.12 * s);
    pen.lineTo(x + 0.02 * s, ny - 0.25 * s);
    pen.lineTo(x + 0.09 * s, ny - 0.12 * s);
    pen.lineTo(x + 0.24 * s, ny - 0.16 * s);
    pen.lineTo(x + 0.1 * s, ny);
    pen.closePath();
    k.paint(shade(C.leather, 0.22), Math.max(0.8, 0.1 * s));
    // the tie round the neck, one end hanging
    pen.beginPath();
    pen.moveTo(x - 0.13 * s, ny + 0.01 * s);
    pen.lineTo(x + 0.13 * s, ny + 0.01 * s);
    pen.moveTo(x + 0.09 * s, ny + 0.02 * s);
    pen.quadraticCurveTo(x + 0.22 * s, ny + 0.1 * s, x + 0.17 * s, ny + 0.28 * s);
    pen.strokeStyle = C.rope;
    pen.lineWidth = Math.max(0.8, 0.08 * s);
    pen.lineCap = 'round';
    pen.stroke();
    // gold dust spilt at its foot
    k.disc(u + 0.3, w + 0.16, z, 0.08, C.gold, 0);
    k.disc(u + 0.18, w + 0.3, z, 0.06, C.goldHi, 0);
  },
};

// A canary in a little brass cage on a wooden foot, on its perch.
const canaryCage: Clutter = {
  name: 'canaryCage',
  r: 0.4,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const s = k.s;
    const pen = k.pen;
    const R = 0.34;
    const z0 = z + 0.1;
    const z1 = z + 0.8;
    const zt = z + 1.1;
    k.cyl(u, w, z, 0.39, 0.1, C.timber, { line: k.thin });
    const wire = (th: number): P3[] => {
      const c = Math.cos(th);
      const n = Math.sin(th);
      return [[u + R * c, w + R * n, z0], [u + R * c, w + R * n, z1], [u + R * 0.72 * c, w + R * 0.72 * n, z1 + 0.2], [u, w, zt]];
    };
    const W = Math.max(0.6, 0.05 * s);
    const bars = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2 + 0.3);
    const far = (th: number) => Math.cos(th) + Math.sin(th) < 0;
    for (const th of bars) if (far(th)) k.line(wire(th), shade(C.brass, -0.25), W);
    // the perch, and the bird on it facing screen right
    const fine = Math.max(0.6, 0.05 * s);
    k.line([[u - 0.26, w + 0.06, z0 + 0.2], [u + 0.26, w - 0.06, z0 + 0.2]], C.timberDark, Math.max(0.7, 0.06 * s));
    const [bx, by] = k.p(u, w, z0 + 0.2);
    const yellow = '#ffd83a';
    pen.beginPath();
    pen.moveTo(bx - 0.1 * s, by - 0.12 * s);
    pen.lineTo(bx - 0.32 * s, by + 0.02 * s);
    pen.lineTo(bx - 0.26 * s, by - 0.15 * s);
    pen.closePath();
    k.paint(shade(yellow, -0.18), fine);
    pen.beginPath();
    pen.ellipse(bx, by - 0.15 * s, 0.2 * s, 0.15 * s, -0.25, 0, Math.PI * 2);
    k.paint(yellow, fine);
    pen.beginPath();
    pen.ellipse(bx - 0.04 * s, by - 0.14 * s, 0.11 * s, 0.07 * s, -0.4, 0, Math.PI * 2);
    k.paint(shade(yellow, -0.12), 0);
    pen.beginPath();
    pen.arc(bx + 0.13 * s, by - 0.34 * s, 0.12 * s, 0, Math.PI * 2);
    k.paint(yellow, fine);
    pen.beginPath();
    pen.moveTo(bx + 0.23 * s, by - 0.37 * s);
    pen.lineTo(bx + 0.34 * s, by - 0.33 * s);
    pen.lineTo(bx + 0.23 * s, by - 0.29 * s);
    pen.closePath();
    k.paint(C.fire, 0);
    if (s >= 5) {
      pen.beginPath();
      pen.arc(bx + 0.16 * s, by - 0.36 * s, Math.max(0.5, 0.03 * s), 0, Math.PI * 2);
      pen.fillStyle = INK;
      pen.fill();
    }
    for (const th of bars) if (!far(th)) k.line(wire(th), C.brass, W);
    for (const zz of [z0, z1]) {
      const e = k.ell(u, w, zz, R);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      pen.strokeStyle = C.brass;
      pen.lineWidth = Math.max(0.8, 0.07 * s);
      pen.stroke();
    }
    const [hx, hy] = k.p(u, w, zt + 0.09);
    pen.beginPath();
    pen.ellipse(hx, hy, 0.08 * s, 0.09 * s, 0, 0, Math.PI * 2);
    k.paint(null, Math.max(0.8, 0.06 * s), C.brass);
  },
};

// A copper oil can: a low drum, a tall cone and a long thin spout.
const oilCan: Clutter = {
  name: 'oilCan',
  r: 0.4,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    frustum(k, u, w, z, 0.34, 0.34, 0.2, C.copper);
    k.disc(u, w, z + 0.2, 0.34, shade(C.copper, 0.16), k.thin * 0.6);
    frustum(k, u, w, z + 0.2, 0.29, 0.07, 0.5, shade(C.copper, 0.08));
    strap(k, [[u + 0.02, w, z + 0.66], [u - 0.36, w - 0.04, z + 1.12]], C.ironLight, 0.06);
    k.disc(u, w, z + 0.7, 0.07, C.brass, k.thin * 0.7);
  },
};

const CLUTTER: readonly Clutter[] = [enamelCup, oreLump, nuggetPan, fuseCoil, coal, dynamite, coffeePot, beanCan, goldPoke, canaryCage, oilCan];

// Where they stand: a line of spots from beside the lantern's pole, past
// the agent's hands, to the front edge before the slate, clear of the
// slate, the agent and the upgrade's end.
const SPOTS: readonly P3[] = [
  [1.55, 0.78, TOP],
  [2.4, 1.4, TOP],
  [3.3, 1.95, TOP],
  [4.35, 2.15, TOP],
  [5.4, 2.25, TOP],
];

// A candle stub in a tin dish at the top's front right; its flame sways
// while the desk is worked, out while it is not.
const CANDLE: P3 = [6.35, 2.25, TOP];
const SWAY = [0, 0.4, 0.7, 0.4, 0, -0.35];
const TALL = [0.42, 0.45, 0.41, 0.44, 0.42, 0.4];
const candle: DeskLoop = {
  name: 'candle',
  at: CANDLE,
  r: 0.5,
  h: 1.4,
  frames: 6,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = CANDLE;
    const s = k.s;
    k.cyl(u, w, z, 0.4, 0.08, C.ironLight, { line: k.thin });
    const [rx, ry] = k.p(u + 0.3, w + 0.3, z + 0.06);
    k.pen.beginPath();
    k.pen.ellipse(rx, ry, 0.1 * s, 0.07 * s, 0, 0, Math.PI * 2);
    k.paint(null, Math.max(1, 0.06 * s + k.thin * 0.5), C.ironLight);
    k.disc(u + 0.1, w + 0.12, z + 0.08, 0.14, '#e8dcc0', k.thin * 0.7);
    k.cyl(u, w, z + 0.08, 0.16, 0.48, '#efe6d0', { line: k.thin });
    k.line([[u - 0.12, w + 0.1, z + 0.52], [u - 0.12, w + 0.1, z + 0.36]], '#e2d6b8', Math.max(0.8, 0.07 * s));
    k.line([[u, w, z + 0.56], [u + 0.02, w, z + 0.66]], INK, Math.max(0.7, 0.05 * s));
    if (!v.active) return;
    const [bx, by] = k.p(u, w, z + 0.62);
    const tall = TALL[i] * s;
    const tx = bx + SWAY[i] * 0.1 * s;
    k.halo(u, w, z + 0.82, 0.7, '#ffc070', 0.36 + (TALL[i] - 0.42) * 2);
    const tongue = (f: number, c: Color) => {
      const pen = k.pen;
      const wd = 0.12 * s * f;
      const top = by - tall * f;
      const lx = bx + (tx - bx) * f;
      pen.beginPath();
      pen.moveTo(lx, top);
      pen.quadraticCurveTo(bx + wd * 1.7, by - tall * 0.25 * f, bx, by + 0.04 * s);
      pen.quadraticCurveTo(bx - wd * 1.7, by - tall * 0.25 * f, lx, top);
      pen.closePath();
      pen.fillStyle = c;
      pen.fill();
    };
    tongue(1, C.fire);
    tongue(0.7, C.flame);
    tongue(0.4, C.flameHot);
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = v.seed % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the lantern's pole, behind the top's left end, fixed to the trestle
    const pole: P3[] = [[0.3, 0.12, BEAM], [0.3, 0.12, 9.5], [0.32, 0.4, 9.88], [0.34, 0.85, 9.85]];
    k.rod(pole, C.timberOld, 0.24);
    // the trestles, the stretcher between them and its iron strap
    trestle(k, TRESTLES[0]);
    trestle(k, TRESTLES[1]);
    k.box(TRESTLES[0] + 0.2, 1.25, 1.7, TRESTLES[1] - TRESTLES[0] - 0.4, 0.5, 0.5, C.pine, { line: k.thin, stripe: false });
    const strap: P3[] = [[TRESTLES[0] + 0.25, 1.78, BEAM - 0.05], [TRESTLES[1] - 0.25, 1.78, 2.15]];
    k.rod(strap, C.iron, 0.2);
    if (k.fine) for (const p of strap) k.disc(p[0], p[1] + 0.02, p[2], 0.09, C.ironLight, 0);
    if (look === 1) ropeCoil(k, 3.6, 2.05, 0, 0.85);
    if (look === 0) pickaxe(k, [1.2, 2.85, 4.5], [2.35, 2.9, 0.5], [0.96, 0, 0.28], 0.85);
    if (look === 2) bucket(k, 3.5, 2.0, 0, 0.62, 1.15, C.ironLight, C.rockDark);
    bench(k);
    slate(k);
    // the lantern on its short chain from the pole's crook
    hangLantern(k, 0.34, 0.85, 9.75, 0.3, v.active ? 1 : 0, 0.82);
  },
  // the slate's face, inside its timber frame
  screen: [
    [2.6, 0.9, 6.6],
    [5.2, 0.9, 6.6],
    [5.2, 0.9, 9.4],
    [2.6, 0.9, 9.4],
  ],
  // the top's right end, beside the slate, clear of the agent
  top: [6.3, 0.7, TOP],
  clutter: { items: CLUTTER, spots: SPOTS },
  loops: [candle],
};
