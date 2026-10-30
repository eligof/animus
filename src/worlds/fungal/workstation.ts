import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { across, fillPts, hull, root, shroom } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf, withAlpha } from './kit.ts';

// Fungal Caverns's workstation (see WorkstationArt in ../types.ts): a shelf-fungus desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A broad bracket fungus, its pale growing edge and its zones on top and
// its gills under the lip, grown out of a stout stalk with a skirt and a
// bulb in a torn cup at its foot. Right of the agent a slab of polished
// crystal stands upright in a cradle of roots: the screen is its face. At
// the left a toadstool lamp, at the front of the right end a jar of
// glowing spores; the back of the right end is kept clear for a desk
// upgrade, so it shows beside the agent. Looks: the lamp's cap glows teal,
// violet or blue. On, the lamp is lit.

const ZT = 5.6; // the cap's top
const TH = 0.85; // its lip
const LOOKS: readonly Color[] = [C.glow, C.capViolet, C.capBlue];

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
  cap(k);
  slab(k);
  // the toadstool lamp, at the left
  lamp(k, 0.75, 2.05, look, v.active);
  // the jar of spores, at the front of the right end
  jar(k, 6.3, 2.1);
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
// growing edge and zones.
function cap(k: Kit): void {
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
  fillPts(k, hull([...rim(ZT, 1), ...rim(zl, 1)].map((p) => k.p(...p))), shade(C.capTan, -0.2), k.lw);
  // the top: a pale growing edge, then zones going darker toward the
  // middle, where it grows from the stalk
  k.poly(rim(ZT, 1), '#f1dfb8');
  const [x0] = k.p(0, 3, ZT);
  const [x1] = k.p(7, 0, ZT);
  for (const [f, c] of [[0.88, C.capTan], [0.7, shade(C.capTan, -0.12)], [0.5, shade(C.capTan, -0.04)], [0.3, shade(C.capTan, -0.24)]] as const) {
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

// A toadstool lamp: a pale stalk under a domed cap in the look's colour,
// lit from within while the screen is on.
function lamp(k: Kit, u: number, w: number, color: Color, lit: boolean): void {
  if (lit) k.pool(u, w, 1.5, 1.0, color, 0.35, ZT);
  shroom(k, u, w, ZT, 1.45, 0.72, lit ? shade(color, 0.22) : shade(color, -0.12), { cap: 'dome', spots: withAlpha(C.spot, 0.85), seed: 3, rb: 0.26 });
  if (lit) {
    k.halo(u, w, ZT + 1.8, 2.1, color, 0.5);
    k.halo(u, w, ZT + 1.75, 0.8, '#ffffff', 0.35);
  }
}

// A glass jar of glowing spores, a cork in it.
function jar(k: Kit, u: number, w: number): void {
  k.cyl(u, w, ZT, 0.42, 1.05, withAlpha(C.glass, 0.5), { line: k.thin });
  k.cyl(u, w, ZT + 0.05, 0.34, 0.7, withAlpha(C.glowSoft, 0.75), { line: 0 });
  if (k.fine) {
    for (const [du, dz] of [[-0.12, 0.25], [0.1, 0.5], [-0.05, 0.75], [0.15, 0.2]] as const) {
      const [x, y] = k.p(u + du, w + 0.35, ZT + dz);
      k.pen.beginPath();
      k.pen.arc(x, y, 0.08 * k.s, 0, Math.PI * 2);
      k.pen.fillStyle = C.glowHot;
      k.pen.fill();
    }
  }
  k.cyl(u, w, ZT + 1.05, 0.3, 0.3, C.wood, { line: k.thin });
  k.halo(u, w, ZT + 0.5, 1.1, C.glow, 0.3);
}

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
};
