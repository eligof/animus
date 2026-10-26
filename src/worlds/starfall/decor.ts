import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { band, bulbPlant, capsule, crateBox, frondPlant, frustum, leaf, paddleLeaf, rflat, rivets, rrect } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf, withAlpha } from './kit.ts';

// The base's furniture between the stations, the clutter of a working
// prefab: storage capsules stacked two high and canister racks against the
// walls, glowing planters under the glass, crates, paddle-leaved alien
// plants in pots, caged lamp pillars and round power pods on the floor. All still (drawn
// once into the scene's static layer), each on its own soft shadow,
// varied by the placement's seed.

// A small cyan status light on a front face, its glow kept tight.
function statusLight(k: Kit, u: number, v: number, z: number, col: Color = '#9ff6ff'): void {
  k.halo(u, v, z, 0.8, col, 0.45);
  const [x, y] = k.p(u, v, z);
  k.pen.beginPath();
  k.pen.arc(x, y, Math.max(0.9, 0.2 * k.s), 0, Math.PI * 2);
  k.paint(col, Math.max(0.5, k.thin * 0.5));
}

// Orange trim on a box's top corners: small caps over each corner in view.
function cornerTrim(k: Kit, u0: number, v0: number, z: number, du: number, dv: number): void {
  const c = Math.min(0.8, du * 0.2, dv * 0.2);
  for (const [u, v] of [[u0, v0 + dv - c], [u0 + du - c, v0 + dv - c], [u0 + du - c, v0]] as const) k.box(u, v, z - 0.5, c, c, 0.55, C.trimOrange, { line: k.thin * 0.8, stripe: false });
}

// ── storage capsules ────────────────────────────────────────────────────────
// White capsules with an orange lid band and a small cyan light, stacked
// two high in a grey cradle against the wall; now and then one column is a
// single capsule with a crate on it.
const pods: PropArt = {
  len: 8,
  dep: 4,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 2, 4.2, 2.1, 0.3);
    // the cradle: a base plate and a back rail with two posts
    k.box(0.25, 0.3, 0, 7.5, 3.4, 0.5, C.metal, { round: 0.2 });
    for (const u of [0.35, 7.2]) k.box(u, 0.25, 0.5, 0.45, 0.45, 9.0, C.metalDark, { stripe: false });
    k.box(0.35, 0.25, 9.0, 7.3, 0.45, 0.45, C.metalDark, { stripe: false });
    const r = 1.62;
    const h = 4.15;
    const single = hash(v.seed, 1) < 0.35;
    const bands: Color[] = [C.trimOrange, C.trimOrange, hash(v.seed, 2) < 0.5 ? C.prefab : C.trimOrange, C.trimOrange];
    for (const [i, cu] of [[0, 2.05], [1, 5.95]] as const) {
      const two = !(single && i === 1);
      capsule(k, cu, 2.05, 0.5, r, h, C.white, bands[i * 2], h - 1.35, h - 0.8);
      statusLight(k, cu + r * 0.5, 2.05 + r * 0.82, 0.5 + h * 0.42);
      if (two) {
        // a collar, then the upper capsule
        k.cyl(cu, 2.05, 0.5 + h - 0.15, r * 0.72, 0.45, C.metal);
        capsule(k, cu, 2.05, 0.5 + h + 0.25, r, h, C.white, bands[i * 2 + 1], h - 1.35, h - 0.8);
        statusLight(k, cu + r * 0.5, 2.05 + r * 0.82, 0.5 + h + 0.25 + h * 0.42, hash(v.seed, 3 + i) < 0.75 ? '#9ff6ff' : '#ffd27a');
      } else {
        k.cyl(cu, 2.05, 0.5 + h - 0.15, r * 0.72, 0.4, C.metal);
        crateBox(k, cu - 1.35, 0.75, 0.5 + h + 0.25, 2.7, 2.7, 2.5, C.white, C.trimOrange, v.seed);
      }
    }
  },
};

// ── a canister rack ─────────────────────────────────────────────────────────
// A grey back plate with orange corners, three tall canisters (red, orange
// and white) strapped to it, valves on their tops piped into the plate, a
// gauge between them.
const tanks: PropArt = {
  len: 7,
  dep: 3,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3.5, 1.6, 3.6, 1.6, 0.3);
    // the back plate, standing just off the wall
    k.box(0.3, 0.15, 0.4, 6.4, 0.45, 8.2, C.metal, { round: 0.25 });
    k.poly(rrect(0.75, 1.0, 6.25, 8.1, 0.61, 0.5), withAlpha(shade(C.metal, -0.12), 0.9), k.thin * 0.8);
    for (const [u, z] of [[0.55, 8.15], [6.45, 8.15], [0.55, 0.75], [6.45, 0.75]] as const) k.poly(rrect(u - 0.38, z - 0.38, u + 0.38, z + 0.38, 0.62, 0.15), C.trimOrange, k.thin * 0.7);
    k.box(0.2, 0.4, 0, 6.6, 2.4, 0.4, C.metalDark, { round: 0.15 });
    const order = hash(v.seed, 1) < 0.5;
    const cols: Color[] = order ? [C.prefab, C.trimOrange, C.white] : [C.white, C.prefab, C.trimOrange];
    const us = [1.35, 3.5, 5.65];
    // the pipes from each valve back into the plate
    for (const u of us) k.rod([[u, 1.6, 7.45], [u, 1.6, 7.9], [u, 0.6, 7.9]], C.metal, 0.22);
    us.forEach((u, i) => {
      const r = 0.95;
      k.cyl(u, 1.6, 0.4, r, 6.0, cols[i]);
      // a domed shoulder and the valve
      frustum(k, u, 1.6, 6.4, r, 6.95, r * 0.55, cols[i], null);
      k.cyl(u, 1.6, 6.95, 0.28, 0.5, C.metalDark);
      k.disc(u, 1.6, 7.5, 0.45, C.prefab, k.thin);
      // a pale band near the foot, and the warning chevron of white ones
      band(k, u, 1.6, r + 0.01, 1.0, 1.45);
      k.paint(cols[i] === C.white ? C.trimOrange : C.white, k.thin * 0.7);
    });
    // the straps across them
    for (const z of [2.6, 5.2]) {
      k.line([[0.7, 2.6, z], [6.3, 2.6, z]], INK, Math.max(1.4, 0.3 * k.s) + k.thin * 1.4);
      k.line([[0.7, 2.6, z], [6.3, 2.6, z]], C.metalDark, Math.max(1.4, 0.3 * k.s));
    }
    // a gauge on the plate, between the canisters up high
    k.face(2.45, 0.62, 7.0, 0.42, C.white, k.thin * 0.8);
    k.line([[2.45, 0.63, 7.0], [2.7, 0.63, 7.22]], C.prefab, Math.max(0.6, 0.08 * k.s));
  },
};

// ── a glowing planter ───────────────────────────────────────────────────────
// A long low trough in a grey frame with orange corners, a blue light strip
// along its front, glowing soil and alien plants: magenta and teal fronds,
// bulb pods, broad leaves.
const planter: PropArt = {
  len: 8,
  dep: 3,
  height: 9,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4, 1.6, 4.2, 1.6, 0.3);
    k.box(0.2, 0.3, 0, 7.6, 2.6, 2.3, C.frame, { round: 0.25 });
    cornerTrim(k, 0.2, 0.3, 2.3, 7.6, 2.6);
    // the light strip along its front
    k.poly([[0.8, 2.91, 0.8], [7.2, 2.91, 0.8], [7.2, 2.91, 1.25], [0.8, 2.91, 1.25]], C.glow, k.thin * 0.7);
    k.halo(4, 3.0, 1.0, 1.6, C.glow, 0.3);
    // the soil, glowing a little
    k.poly(rflat(0.75, 0.75, 7.25, 2.45, 2.31, 0.4), '#2c4a52', k.thin);
    k.pool(4, 1.6, 3.2, 0.9, C.grass, 0.35, 2.32);
    const z = 2.35;
    const cv = 1.6;
    const [bx0, by0] = k.p(1.6, cv, z);
    const [bx1, by1] = k.p(6.2, cv, z);
    // broad leaves low over the rim
    for (const [x, y, a, col] of [[bx0, by0, -2.6, C.grassDark], [bx0, by0, -1.4, C.grass], [bx1, by1, -0.5, C.grassDark], [bx1, by1, -1.7, C.grass]] as const) leaf(k, x, y, a, 2.1 * k.s, 0.62 * k.s, col);
    // fronds and pods, by seed
    const pink = hash(v.seed, 1) < 0.5;
    frondPlant(k, 2.6, cv, z, 5.6, -1, 0.75, pink ? '#d24ba8' : C.grass, k.thin, -0.4);
    bulbPlant(k, 3.9, cv, z, 6.0, 0.4, 0.7, pink ? C.flora3 : C.flora, k.thin, 0.25);
    frondPlant(k, 5.2, cv, z, 4.8, 1, 0.7, pink ? C.grass : '#d24ba8', k.thin, 0.5);
    bulbPlant(k, 6.4, cv, z, 3.6, 0.3, 0.55, C.cyan, k.thin, 0.25);
    bulbPlant(k, 1.4, cv, z, 3.2, -0.3, 0.5, C.flora2, k.thin, 0.2);
  },
};

// ── a stack of crates ───────────────────────────────────────────────────────
// White cargo crates with orange corner bands: a big one with a smaller one
// on it, or (by seed) a crate with a squat red drum beside it.
const crates: PropArt = {
  len: 6,
  dep: 6,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 3, 3.1, 3.1, 0.3);
    if (hash(v.seed, 1) < 0.55) {
      crateBox(k, 0.4, 0.4, 0, 5.0, 5.0, 3.7, C.white, C.trimOrange, v.seed);
      crateBox(k, 1.1, 1.0, 3.7, 3.3, 3.4, 2.8, C.white, hash(v.seed, 2) < 0.5 ? C.prefab : C.trimOrange, v.seed + 1);
    } else {
      crateBox(k, 0.3, 0.3, 0, 4.0, 4.4, 4.2, C.white, C.trimOrange, v.seed);
      // the drum: red with white bands, a lid with a cap
      k.shadow(4.4, 4.4, 1.4, 1.4, 0.3);
      k.cyl(4.4, 4.4, 0, 1.3, 3.0, C.prefab);
      for (const z of [0.6, 2.2]) {
        band(k, 4.4, 4.4, 1.31, z, z + 0.32);
        k.paint(C.white, k.thin * 0.7);
      }
      k.disc(4.4, 4.4, 3.0, 0.95, shade(C.prefab, 0.1), k.thin);
      k.cyl(4.0, 4.1, 3.0, 0.25, 0.3, C.metal);
    }
  },
};

// ── a paddle-leaved plant ───────────────────────────────────────────────────
// A white pot with an orange band and huge paddle leaves fanning out of it
// on long stalks, teal or magenta by seed.
const paddle: PropArt = {
  len: 5,
  dep: 5,
  height: 13,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    k.shadow(c, c, 2.0, 2.0, 0.3);
    frustum(k, c, c, 0, 1.25, 3.0, 1.7, C.white, '#3a3048');
    band(k, c, c, 1.6, 2.25, 2.7);
    k.paint(C.trimOrange, k.thin * 0.8);
    const magenta = hash(v.seed, 1) < 0.4;
    const main = magenta ? '#d24ba8' : '#3cc7a6';
    const alt = magenta ? '#e870c4' : '#2aa58c';
    // each leaf: its stalk's lean from upright (radians, screen), the
    // stalk's length and the blade's (units), back ones first
    const leaves: Array<[number, number, number, Color]> = [
      [-0.32, 5.6, 3.9, alt],
      [0.38, 5.2, 3.9, alt],
      [0.02, 6.0, 3.6, main],
      [-0.85, 3.4, 2.9, main],
      [0.85, 3.2, 2.9, main],
      [-0.6, 2.4, 3.0, alt],
      [0.62, 2.2, 3.0, alt],
    ];
    const jitter = (hash(v.seed, 2) - 0.5) * 0.2;
    const [fx, fy] = k.p(c, c, 2.85);
    for (const [lean, S, L, col] of leaves) {
      const a = lean + jitter;
      const tx = fx + Math.sin(a) * S * k.s;
      const ty = fy - Math.cos(a) * S * k.s;
      // the stalk, bowing outward, then the blade fanning on past its tip
      const cx = fx + Math.sin(a) * S * k.s * 0.25;
      const cy = fy - Math.cos(a) * S * k.s * 0.75;
      k.pen.beginPath();
      k.pen.moveTo(fx, fy);
      k.pen.quadraticCurveTo(cx, cy, tx, ty);
      k.pen.strokeStyle = INK;
      k.pen.lineWidth = Math.max(1.6, 0.26 * k.s) + k.thin * 1.4;
      k.pen.stroke();
      k.pen.strokeStyle = shade(col, -0.3);
      k.pen.lineWidth = Math.max(1.6, 0.26 * k.s);
      k.pen.stroke();
      const blade = a * 1.3 - Math.PI / 2;
      paddleLeaf(k, tx, ty, blade, L * k.s, L * k.s * 0.36, col);
    }
  },
};

// ── a caged lamp pillar ─────────────────────────────────────────────────────
// A square foot, four slim posts with bands round them making a cage, a
// tall white light bar inside it and a cap with orange corners; its light
// on the floor round its foot.
const lamp: PropArt = {
  len: 3,
  dep: 3,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(1.5, 1.5, 1.5, 1.5, 0.28);
    k.pool(1.5, 1.5, 1.4, 1.4, C.amberLight, 0.4);
    k.box(0.2, 0.2, 0, 2.6, 2.6, 0.7, C.metalDark, { round: 0.15 });
    // the light: a glowing pillar, its two faces in view lit warm white
    k.halo(1.5, 1.5, 4.8, 2.0, '#fff1d6', 0.5);
    k.box(0.55, 0.55, 0.7, 1.9, 1.9, 8.2, '#fff6e6', { top: '#ffffff', left: '#fffaf0', right: '#ffe9c4', stripe: false, line: k.thin });
    k.line([[1.5, 2.46, 1.3], [1.5, 2.46, 8.4]], withAlpha('#ffffff', 0.95), Math.max(0.8, 0.22 * k.s));
    // the cage: posts at the corners, bands round them
    const post = (u: number, w: number) => k.box(u - 0.22, w - 0.22, 0.7, 0.44, 0.44, 8.2, C.metal, { stripe: false });
    post(2.55, 0.45);
    post(0.45, 2.55);
    for (const z of [3.2, 6.2]) k.rod([[0.45, 2.55, z], [2.55, 2.55, z], [2.55, 0.45, z]], C.metal, 0.12);
    post(2.55, 2.55);
    // the cap
    k.box(0.15, 0.15, 8.9, 2.7, 2.7, 0.75, C.frame, { round: 0.15 });
    cornerTrim(k, 0.15, 0.15, 9.65, 2.7, 2.7);
    rivets(k, [[0.6, 2.86, 9.25], [2.4, 2.86, 9.25]], C.panelLight, 0.1);
  },
};

// ── a power pod ─────────────────────────────────────────────────────────────
// A round generator on a grey plinth: a white body with an orange belt, a
// glowing cyan port on its front, an orange coil on its side and cooling
// fins on its crown.
const generator: PropArt = {
  len: 5,
  dep: 5,
  height: 7,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    k.shadow(c, c, 2.4, 2.4, 0.3);
    k.cyl(c, c, 0, 2.3, 0.55, C.metal);
    for (const [u, w] of [[1.0, 3.8], [3.8, 1.0]] as const) k.box(u - 0.35, w - 0.35, 0.4, 0.7, 0.7, 0.6, C.metalDark, { stripe: false });
    // the coil on its side, behind the body's near half
    k.cyl(4.3, 1.4, 0.55, 0.55, 3.4, C.prefab);
    for (const z of [1.3, 2.3, 3.3]) {
      band(k, 4.3, 1.4, 0.56, z, z + 0.22);
      k.paint(C.white, k.thin * 0.6);
    }
    capsule(k, c, c, 0.75, 2.25, 4.4, '#d3d8df', C.trimOrange, 1.45, 2.55);
    // the port: a cyan glow behind a ring, facing the viewer
    const th = Math.PI / 4;
    const n: P3 = [Math.cos(th), Math.sin(th), 0];
    const t: P3 = [-n[1], n[0], 0];
    const disc = (r: number, out: number): P3[] => Array.from({ length: 20 }, (_, i) => {
      const a = (i / 20) * Math.PI * 2;
      return [c + n[0] * (2.25 + out) + t[0] * Math.cos(a) * r, c + n[1] * (2.25 + out) + t[1] * Math.cos(a) * r, 2.75 + Math.sin(a) * r];
    });
    k.halo(c + n[0] * 2.5, c + n[1] * 2.5, 2.75, 1.3, C.glow, 0.45);
    k.poly(disc(0.82, 0.02), C.white, k.thin);
    k.poly(disc(0.56, 0.06), k.vgrad(c, c + 2, 2.2, 3.3, [[0, '#2f8fd0'], [0.5, C.glow], [1, '#d8fcff']]), k.thin * 0.7);
    // the crown: a collar and three fins
    k.cyl(c, c, 5.0, 0.9, 0.45, C.metal);
    for (const du of [-0.55, 0, 0.55]) k.box(c + du - 0.12, c - 0.75, 5.45, 0.24, 1.5, 1.1, C.frame, { stripe: false, line: k.thin });
    statusLight(k, c - 0.94, c + 2.05, 4.0, hash(v.seed, 1) < 0.5 ? '#9ff6ff' : '#ffd27a');
  },
};

// Against the walls the stores, racks and planters; on the floor by the
// walls and the stations the plants, crates, lamps and power pods. (Wall pieces are
// shallow, so a station still has a step of floor beside it for a desk
// upgrade even in an 80 x 24 terminal.)
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: pods, count: 3, place: 'wall' },
  { art: planter, count: 2, place: 'wall' },
  { art: tanks, count: 2, place: 'wall' },
  { art: paddle, count: 3, place: 'floor' },
  { art: crates, count: 2, place: 'floor' },
  { art: lamp, count: 3, place: 'floor' },
  { art: generator, count: 2, place: 'floor' },
];

export const DECOR_ART = { pods, planter, tanks, paddle, crates, lamp, generator };
