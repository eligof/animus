import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Particle, SlotKind } from '../../world/types.ts';
import type { PropArt, PropView } from '../types.ts';
import { across, barrel, basis, bookRow, bucket, candle, crate, dynamite, fillPts, flames, hangLantern, heap, hull, lantern, logU, logV, nugget, onCircle, pickaxe, rails, ring, rock, ropeCoil, sack, shovel, sparkle, wheel } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, due, fling, hash, part, puff, still, withAlpha } from './kit.ts';

// The mine's stations, each a PropArt in its own frame (u along the wall,
// v out toward the agent, z up; the viewer always sees the top, the +v
// front and the +u end). Animated ones paint their still parts through the
// sprite cache (see still) and only the moving bits each frame.
//
//   write     the smithy: a fieldstone forge under an iron hood, bellows,
//             the anvil on its stump, a quench tub
//   read      the assay office: shelves of ledgers, ore samples and survey
//             rolls, a standing desk with the day book under a lantern
//   search    the dig face: an outcrop of rock in a timber set, a vein of
//             gold through it, a pick stuck in it, rubble at its foot
//   run       the steam pump: a riveted boiler, the engine and its
//             flywheel, a pump with its hose to a barrel
//   web       the ore cart: a laden hopper wagon on a length of track
//             between two stops, a point lever, a lamp post
//   think     the map table: the survey spread on a trestle table,
//             weighted down with a lantern and a rock, rolls in a barrel
//   idle      the camp: a fire in a ring of stones with a kettle on a
//             tripod, log benches, a tent and a bedroll
//   entrance  the lift: a timber headframe over the shaft, the cage on
//             its rope from the sheave wheel, the winch

type Spawn = (p: Particle) => void;

const SPARK: readonly [number, number, number] = [255, 196, 96];
const GOLDDUST: readonly [number, number, number] = [255, 214, 92];

// ── write: the smithy ───────────────────────────────────────────────────────
// A fieldstone forge against the wall under a riveted iron hood and its
// flue; bellows on a stand to one side, the anvil on a log stump at the
// front corner, a quench tub with tongs, a scuttle of coal. Its smith
// stands on the floor beside the anvil (SMITH, see npcs.ts) and does the
// hammering: worked, the bellows blow, the coals brighten and the anvil
// glows under the bar he holds there, throwing sparks; left alone, the
// hammer rests across the stump.

const HOOD = { b: 8.2, t: 11.6 };
const ANVIL = { u: 3.4, v: 5.8, z: 4.3 };
// Where the smith stands: on the floor past the smithy's front, the anvil
// a step ahead of him along u.
export const SMITH = { u: 1.0, v: 8.8 };

const write: PropArt = {
  len: 11,
  dep: 7,
  height: 16,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const k = still(v, 'write', 16, (k) => {
      k.shadow(5.5, 3.6, 6.2, 3.8, 0.3);
      wallTools(k);
      // the hearth: fieldstone with a fire bed in its top
      k.box(0.6, 0.3, 0, 5.8, 3.9, 3.4, '#857a70', { stripe: false });
      fieldstone(k, 0.6, 6.4, 4.2, 0, 3.4, 'v', v.seed);
      fieldstone(k, 0.3, 4.2, 6.4, 0, 3.4, 'u', v.seed + 1);
      k.poly([[1.1, 0.8, 3.41], [5.9, 0.8, 3.41], [5.9, 3.7, 3.41], [1.1, 3.7, 3.41]], '#24160e', k.thin);
      k.pool(3.5, 2.25, 2.0, 1.2, '#c0501c', 0.5, 3.42, 'lighter');
      for (let i = 0; i < 11; i++) {
        const u = 1.6 + hash(v.seed, i, 3) * 3.8;
        const w = 1.2 + hash(v.seed, i, 4) * 2.2;
        rock(k, u, w, 3.42, 0.24 + hash(v.seed, i, 5) * 0.14, 0.22, i % 3 ? '#3a302c' : '#4a3a30', i, Math.max(0.8, k.thin * 0.5));
      }
      // the bellows' stand
      for (const u of [7.4, 9.9]) k.box(u, 1.4, 0, 0.5, 1.6, 2.6, C.timberOld, { line: k.thin });
      k.box(7.0, 1.2, 2.3, 3.4, 2.0, 0.35, C.timber, { line: k.thin });
      bellowsBoard(k, 2.9, '#7a5232');
      // a scuttle of coal by the hearth
      bucket(k, 6.7, 5.9, 0, 0.85, 1.1, C.iron, C.coal);
      heap(k, 6.7, 5.9, 1.0, 0.6, 0.45, v.seed + 9, [C.coal, '#3a3230']);
      // the hood over the fire on two iron rods, its flue up the wall
      for (const u of [0.95, 6.05]) k.rod([[u, 3.95, 3.4], [u, 3.95, HOOD.b - 0.5]], C.iron, 0.12);
      hood(k);
      // the quench tub with tongs in it
      barrel(k, 9.3, 5.3, 0, 1.05, 1.7, C.timberOld, '#2f4a52');
      k.rod([[8.9, 5.1, 1.2], [8.6, 4.9, 3.4]], C.iron, 0.09);
      k.rod([[9.1, 5.1, 1.2], [8.75, 5.2, 3.45]], C.iron, 0.09);
      // the anvil on its stump
      k.shadow(ANVIL.u, ANVIL.v, 1.4, 1.2, 0.3);
      k.cyl(ANVIL.u, ANVIL.v, 0, 1.05, 2.4, C.timberOld, { top: '#c99a62' });
      anvil(k);
    });
    // the coals: glowing, brighter while worked, small flames licking up
    const t = v.t;
    const flick = 0.5 + 0.5 * (0.6 * Math.sin(t * Math.PI * 2) + 0.4 * Math.sin(t * Math.PI * 4 + 1.3));
    const hot = v.active ? 0.75 + 0.25 * flick : 0.35 + 0.1 * flick;
    k.pool(3.5, 2.25, 2.3, 1.4, '#ff7a2a', 0.55 * hot, 3.42);
    flames(k, 3.5, 2.4, 3.45, v.active ? 0.42 : 0.28, t * (v.active ? Math.PI : 1.2));
    k.halo(3.5, 2.4, 4.6, v.active ? 4.5 : 3.2, '#ff9a48', 0.42 * hot);
    // the bellows breathing
    const lift = v.active ? 0.55 + 0.45 * Math.sin(t * Math.PI) : 0.75;
    bellowsTop(k, 2.9, lift);
    // the anvil glowing under the smith's hot bar, or the hammer resting
    if (v.active) k.halo(ANVIL.u - 0.2, ANVIL.v, ANVIL.z + 0.2, 1.8, '#ff9a48', 0.42 + 0.08 * Math.sin(t * Math.PI * 2));
    else hammer(k);
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const t = v.t;
    // smoke off the flue
    if (due(t, dt, v.active ? 1.2 : 0.35, v.seed)) spawn(puff('smoke', 3.5, 1.9, 16.2, Math.floor(t * 10), 0));
    if (!v.active) return;
    // sparks off the anvil, at the smith's tempo (two blows in 1.6 s)
    const strike = Math.floor(t * 1.25);
    if (Math.floor((t - dt) * 1.25) !== strike) {
      for (let i = 0; i < 7; i++) spawn(fling('spark', ANVIL.u - 0.3, ANVIL.v, ANVIL.z + 0.3, strike, i, SPARK, 0.8, 3.2, 12));
    }
    if (due(t, dt, 2.5, v.seed + 1)) spawn(fling('ember', 3.5, 2.4, 4.2, Math.floor(t * 20), 1, [255, 140, 60], 0.3, 2, -0.5));
  },
};

// Rough stones on a face of the hearth: `axis` 'v' is the front (v = at,
// u from a0 to a1), 'u' the end (u = at, v from a0 to a1).
function fieldstone(k: Kit, a0: number, a1: number, at: number, z0: number, z1: number, axis: 'u' | 'v', seed: number): void {
  const P = (a: number, z: number): P3 => (axis === 'v' ? [a, at + 0.01, z] : [at + 0.01, a, z]);
  const tone = (c: Color) => k.side(c, axis === 'u' ? 1 : 0, axis === 'v' ? 1 : 0, 0.18);
  let r = 0;
  for (let z = z0 + 0.1; z < z1 - 0.3; z += 1.1, r++) {
    let a = a0 + 0.1 + (r & 1) * 0.6;
    let i = 0;
    while (a < a1 - 0.4) {
      const w = Math.min(a1 - 0.1 - a, 1.1 + hash(seed, r * 9 + i, 11) * 0.9);
      const h = Math.min(z1 - 0.1 - z, 0.95);
      const c = ['#9a9086', '#8a8078', '#a39684', '#7f766e'][Math.floor(hash(seed, r * 9 + i, 12) * 4)];
      k.poly([P(a + 0.06, z + 0.06), P(a + w - 0.06, z + 0.06), P(a + w - 0.06, z + h - 0.06), P(a + 0.06, z + h - 0.06)], tone(c), k.thin * 0.7, 0.3);
      a += w;
      i++;
    }
  }
}

// The hood: a riveted iron frustum from the rim (HOOD.b) to the flue.
function hood(k: Kit): void {
  const { b, t } = HOOD;
  const iron = '#5f5651';
  k.box(0.6, 0.25, b - 0.55, 5.8, 3.95, 0.55, iron, { line: k.lw, stripe: false });
  const front: P3[] = [[0.7, 4.1, b], [6.3, 4.1, b], [4.3, 2.6, t], [2.7, 2.6, t]];
  const end: P3[] = [[6.3, 0.3, b], [6.3, 4.1, b], [4.3, 2.6, t], [4.3, 1.2, t]];
  k.poly(end, shade(iron, -0.2), k.lw);
  k.poly(front, k.vgrad(3.5, 3.4, b, t, [[0, shade(iron, 0.08)], [1, shade(iron, -0.05)]]), k.lw);
  // seams and rivets
  k.line([[3.5, 4.1, b], [3.5, 2.6, t]], withAlpha(INK, 0.5), k.thin * 0.7);
  if (k.s >= 5) {
    k.pen.beginPath();
    for (let u = 1.0; u < 6.2; u += 0.55) {
      const [x, y] = k.p(u, 4.12, b - 0.28);
      k.pen.moveTo(x + 0.11 * k.s, y);
      k.pen.arc(x, y, 0.11 * k.s, 0, Math.PI * 2);
    }
    k.pen.fillStyle = '#a49890';
    k.pen.fill();
  }
  k.cyl(3.5, 1.9, t - 0.3, 0.8, 16 - t + 0.3, iron, { line: k.lw });
  k.cyl(3.5, 1.9, 15.6, 0.92, 0.4, shade(iron, -0.1), { line: k.thin });
  // soot round the rim
  k.line([[0.8, 4.12, b - 0.05], [6.2, 4.12, b - 0.05]], '#1e140e', Math.max(0.8, 0.12 * k.s));
}

// Tongs, a hammer and a horseshoe hung on the wall behind the bellows.
function wallTools(k: Kit): void {
  const z = 8.6;
  k.box(7.0, 0, z, 3.8, 0.35, 0.55, C.timberOld, { line: k.thin });
  k.rod([[7.6, 0.4, z], [7.45, 0.45, z - 3.0]], C.iron, 0.1);
  k.rod([[7.8, 0.4, z], [7.95, 0.45, z - 3.0]], C.iron, 0.1);
  k.rod([[8.7, 0.45, z], [8.7, 0.5, z - 2.6]], C.timber, 0.16);
  k.box(8.35, 0.35, z - 3.1, 0.7, 0.35, 0.55, C.iron, { line: k.thin });
  const shoe: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.1 + (i / 10) * 1.8);
    shoe.push([9.9 + Math.cos(a) * 0.45, 0.45, z - 1.0 - Math.sin(a) * 0.5]);
  }
  k.rod(shoe, '#8a8480', 0.14);
}

// The bellows: two boards in plane, hinged at the nozzle (u 6.6), the top
// one lifted `lift` at the broad end.
const BELLOWS: ReadonlyArray<readonly [number, number]> = [[6.9, 2.15], [7.6, 1.75], [8.6, 1.35], [9.9, 1.45], [10.4, 2.2], [9.9, 2.95], [8.6, 3.05], [7.6, 2.65]];

function bellowsBoard(k: Kit, z: number, c: Color): void {
  k.rod([[6.9, 2.2, z + 0.2], [6.1, 2.25, z + 0.35]], C.brass, 0.18);
  k.poly(BELLOWS.map(([u, w]) => [u, w, z] as P3), c, k.lw, 0.3);
}

function bellowsTop(k: Kit, z: number, lift: number): void {
  const top = BELLOWS.map(([u, w]) => [u, w, z + 0.15 + lift * Math.max(0, (u - 6.9) / 3.5)] as P3);
  const bot = BELLOWS.map(([u, w]) => [u, w, z + 0.1] as P3);
  const sil = hull([...top, ...bot].map((p) => k.p(...p)));
  fillPts(k, sil, across(k, sil, C.leather), k.lw);
  if (k.s >= 5) {
    // pleats round the leather
    for (const f of [0.33, 0.66]) {
      const mid = BELLOWS.map(([u, w]) => [u, w, z + 0.1 + (0.05 + lift * Math.max(0, (u - 6.9) / 3.5)) * f] as P3);
      k.line(mid.filter((p) => p[0] > 7.2), shade(C.leather, -0.35), Math.max(0.6, 0.07 * k.s));
    }
  }
  k.poly(top, '#9a6a3c', k.lw, 0.3);
  // the handles
  k.rod([[10.3, 2.2, top[4][2]], [11.0, 2.2, top[4][2] + 0.1]], C.timberDark, 0.16);
}

// The anvil on its stump, its heel toward the smith (-u), its horn away.
function anvil(k: Kit): void {
  const { u, v: w, z } = ANVIL;
  const steel = '#4e4c54';
  k.box(u - 0.9, w - 0.55, 2.4, 1.8, 1.1, 0.5, steel, { line: k.lw });
  k.box(u - 0.55, w - 0.38, 2.9, 1.1, 0.76, 0.75, steel, { line: k.lw });
  k.box(u - 1.3, w - 0.5, z - 0.7, 2.4, 1.0, 0.7, steel, { line: k.lw, top: '#8e9098' });
  // the horn, toward +u (nearer the viewer, so drawn after the face)
  k.poly([[u + 1.1, w - 0.45, z - 0.65], [u + 2.35, w, z - 0.2], [u + 1.1, w + 0.45, z - 0.65], [u + 1.1, w + 0.45, z], [u + 1.1, w - 0.45, z]], shade(steel, 0.12), k.lw);
  k.line([[u - 1.1, w + 0.3, z + 0.01], [u + 0.9, w + 0.3, z + 0.01]], '#c4c6cc', Math.max(0.7, 0.08 * k.s));
}

// The hammer at rest, its head on the stump's edge, its haft out over it.
function hammer(k: Kit): void {
  k.rod([[ANVIL.u + 0.2, ANVIL.v + 0.9, 2.45], [ANVIL.u + 1.4, ANVIL.v + 1.0, 2.2]], C.timber, 0.16);
  k.box(ANVIL.u - 0.15, ANVIL.v + 0.45, 2.4, 0.6, 0.55, 0.45, C.iron, { line: k.thin });
}

// ── read: the assay office ──────────────────────────────────────────────────
// Rough shelves of the mine's books and samples: day books and ledgers,
// boxes of ore (gold, copper, amethyst, coal), jars of gold dust and rolled
// surveys; on top a crate and a lamp. Beside them the assay counter, the
// day book open on it under a lantern hung high off the wall, and behind
// it, between the counter and the wall, room for the assayer (ASSAY, see
// npcs.ts), who weighs the gold. Worked, the lantern burns bright and its
// light flickers on the counter.

const SHELF = [0.5, 5.0, 9.4, 13.8, 18.2];
const BAYS: ReadonlyArray<readonly [number, number]> = [[0.95, 4.9], [5.4, 9.35]];
// The counter (u0 to u1, its back `back` out from the wall, its front at
// `front`, its top `top` high) and where the assayer stands behind it.
export const ASSAY = { u0: 9.95, u1: 13.85, back: 1.8, front: 3.85, top: 5.9, u: 11.65, v: 1.4 };
const LAMP: P3 = [13.3, 1.0, 17.0];

const read: PropArt = {
  len: 14,
  dep: 4,
  height: 21,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'read', 21, (k) => {
      const F = 3.3; // the shelves' front
      k.shadow(5.2, 2.2, 6.0, 2.4, 0.3);
      // back boards, uprights, shelves
      k.box(0.4, 0.05, 0, 9.3, 0.5, 18.6, C.timberOld, { stripe: false });
      if (k.fine) for (let u = 1.6; u < 9.6; u += 1.2) k.line([[u, 0.56, 0.5], [u, 0.56, 18.5]], shade(C.timberOld, -0.3), 0.06 * k.s);
      // row by row from the bottom: the bay's dark back, the shelf, its load
      SHELF.slice(0, -1).forEach((z0, r) => {
        const z1 = SHELF[r + 1] - 0.4;
        for (const [u0, u1] of BAYS) k.poly([[u0, 0.56, z0], [u1, 0.56, z0], [u1, 0.56, z1], [u0, 0.56, z1]], k.vgrad(u0, 0.56, z0, z1, [[0, '#2e1d12'], [1, '#4a3322']]), 0);
        k.box(0.4, 0.05, z0 - 0.4, 9.3, F, 0.4, C.timber, { line: k.thin });
        for (const [bi, [u0, u1]] of BAYS.entries()) shelfLoad(k, u0, u1, F, z0, z1 - z0, Math.floor(hash(v.seed, r * 3 + bi, 5) * 5), v.seed + r * 7 + bi * 3);
      });
      k.box(0.4, 0.05, SHELF[4] - 0.4, 9.3, F + 0.2, 0.5, C.timber, { line: k.lw });
      for (const u of [0.4, 4.95, 9.3]) k.box(u, F - 0.6, 0, 0.45, 0.6, 18.7, C.timberOld, { line: k.lw, stripe: false });
      // on top: a crate of samples, rolled surveys
      crate(k, 0.9, 0.6, 18.3, 2.6, 2.2, 1.6, C.pine);
      heap(k, 2.2, 1.7, 19.9, 0.9, 0.4, v.seed + 3, [C.rockLight, C.gold, C.copper]);
      for (let i = 0; i < 3; i++) logU(k, 5.2, 8.6 - i * 0.3, 1.0 + i * 0.75, 18.6 + (i === 1 ? 0.55 : 0.3), 0.32, C.paper);
      // the counter: boarded in, a plank top, the day book open on it
      const { u0, u1, back, front, top } = ASSAY;
      k.shadow((u0 + u1) / 2, (back + front) / 2, 2.4, 1.4, 0.26);
      k.box(u0, back + 0.05, 0, u1 - u0, front - back - 0.2, top - 0.3, C.timberOld, { stripe: false });
      for (let u = u0 + 0.45; u < u1 - 0.3; u += 0.6) k.line([[u, front - 0.13, 0.15], [u, front - 0.13, top - 0.45]], shade(C.timberOld, -0.3), Math.max(0.6, 0.06 * k.s));
      for (let w = back + 0.5; w < front - 0.3; w += 0.6) k.line([[u1 - 0.09, w, 0.15], [u1 - 0.09, w, top - 0.45]], shade(C.timberOld, -0.42), Math.max(0.6, 0.06 * k.s));
      k.box(u0, front - 0.35, 0, u1 - u0, 0.2, 0.35, C.timberDark, { line: k.thin, stripe: false });
      k.box(u0 - 0.1, back, top - 0.3, u1 - u0 + 0.2, front - back, 0.3, C.plank, { line: k.lw });
      const z = top + 0.01;
      k.poly([[u0 + 0.5, back + 0.75, z], [u0 + 1.7, back + 0.7, z + 0.08], [u0 + 1.7, front - 0.35, z + 0.08], [u0 + 0.5, front - 0.3, z]], '#e8dcc0', k.thin);
      k.poly([[u0 + 1.7, back + 0.7, z + 0.08], [u0 + 2.9, back + 0.75, z], [u0 + 2.9, front - 0.3, z], [u0 + 1.7, front - 0.35, z + 0.08]], C.paper, k.thin);
      if (k.s >= 5) for (const a of [u0 + 0.65, u0 + 1.85]) for (let i = 0; i < 3; i++) {
        const w = back + 1.05 + i * 0.45;
        k.line([[a, w, z + 0.05], [a + 0.85, w, z + 0.05]], '#8a7a62', Math.max(0.6, 0.05 * k.s));
      }
      // an ink pot and its pen lying by it, a poke of dust and a nugget or two
      k.cyl(u1 - 0.45, back + 0.4, top, 0.22, 0.3, '#2b2a33', { line: k.thin });
      k.line([[u1 - 0.5, back + 0.95, z + 0.06], [u1 - 0.2, back + 1.9, z + 0.06]], '#efe6d6', Math.max(0.8, 0.1 * k.s));
      sack(k, u1 - 0.55, front - 0.55, top, 0.32, 0.5, true, v.seed + 5, C.gold);
      for (let j = 0; j < 2; j++) nugget(k, u0 + 0.35 + j * 0.3, front - 0.35, top, 0.17, v.seed + 30 + j, j === 0);
      // the lantern's bracket on the wall, high over the assayer's head
      k.rod([[LAMP[0], 0.05, LAMP[2] + 0.2], [LAMP[0], LAMP[1], LAMP[2] + 0.2]], C.iron, 0.12);
      k.rod([[LAMP[0], 0.05, LAMP[2] - 0.8], [LAMP[0], LAMP[1] - 0.4, LAMP[2] + 0.15]], C.iron, 0.08);
    });
    // the lantern over the counter: bright while the assayer works
    part(v, `read-lamp-${v.active}`, [LAMP[0] - 1.2, LAMP[0] + 1.2, LAMP[1] - 1.2, LAMP[1] + 1.2, LAMP[2] - 3.0, LAMP[2] + 0.4], 0, 0, 0, (k) => hangLantern(k, LAMP[0], LAMP[1], LAMP[2], 0.4, v.active ? 1 : 0.45));
    // its light on the counter, dim while nobody works, flickering while he does
    const flick = v.active ? 0.36 + 0.05 * Math.sin(v.t * Math.PI * 2) + 0.03 * Math.sin(v.t * Math.PI * 6) : 0.14;
    k.pool((ASSAY.u0 + ASSAY.u1) / 2, (ASSAY.back + ASSAY.front) / 2, 2.4, 1.5, '#ffe2a0', flick, ASSAY.top);
  },
};

// What one bay of shelving holds (kind 0..4), its front at F.
function shelfLoad(k: Kit, u0: number, u1: number, F: number, z: number, h: number, kind: number, seed: number): void {
  const fr = F - 0.1;
  if (kind === 0) {
    bookRow(k, u0 + 0.1, u1 - 0.1, fr, z, h - 0.4, seed);
  } else if (kind === 1) {
    // sample boxes, ore heaped in them
    const ores: Color[] = [C.gold, C.copper, C.amethyst, C.coal, C.verdigris];
    for (let i = 0; i < 3; i++) {
      const bu = u0 + 0.15 + i * 1.3;
      crate(k, bu, F - 2.0, z, 1.2, 1.7, 0.9, i & 1 ? C.pine : C.plank);
      const c = ores[Math.floor(hash(seed, i, 7) * ores.length)];
      if (c === C.gold) for (let j = 0; j < 3; j++) nugget(k, bu + 0.3 + j * 0.3, F - 1.2 + (j & 1) * 0.3, z + 0.9, 0.24, seed + j, j === 1);
      else for (let j = 0; j < 3; j++) rock(k, bu + 0.3 + j * 0.3, F - 1.2 + (j & 1) * 0.3, z + 0.9, 0.26, 0.3, c, seed + j, k.thin * 0.7);
    }
    if (h > 3) bookRow(k, u0 + 0.2, u1 - 0.2, fr, z + 1.0, h - 1.5, seed + 2);
  } else if (kind === 2) {
    // jars of gold dust and crystals, a ledger lying flat
    for (let j = 0; j < 3; j++) k.box(u0 + 0.2, F - 2.4, z + j * 0.38, 2.0 - j * 0.1, 2.0, 0.38, ['#7a3a2a', '#3f4e3a', '#34465e'][j], { line: k.thin, stripe: false });
    for (const [i, c] of [[0, C.gold], [1, C.amethyst]] as const) {
      const ju = u1 - 1.6 + i * 0.95;
      k.cyl(ju, F - 1.1, z, 0.42, 1.3, '#c9dcd6', { line: k.thin });
      k.cyl(ju, F - 1.1, z + 0.08, 0.34, 0.85, c, { line: 0 });
      k.cyl(ju, F - 1.1, z + 1.3, 0.45, 0.22, C.timberDark, { line: k.thin });
    }
  } else if (kind === 3) {
    // rolled surveys stacked in a pyramid
    const r = 0.36;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 3 - row; i++) logV(k, F - 2.6, F - 0.1, u0 + 0.9 + i * 0.78 + row * 0.39, z + r + row * r * 1.7, r, i & 1 ? C.paper : '#e6d6b2');
    bookRow(k, u0 + 2.9, u1 - 0.1, fr, z, h - 0.4, seed);
  } else {
    // a miner's hat with its lamp, a candle, a pair of scales
    k.cyl(u0 + 1.3, F - 1.2, z, 0.9, 0.12, '#6a4a2a', { line: k.thin });
    k.cyl(u0 + 1.3, F - 1.2, z + 0.1, 0.6, 0.65, '#7a5530', { line: k.thin });
    k.cyl(u0 + 1.3, F - 0.6, z + 0.45, 0.18, 0.28, C.brass, { line: k.thin });
    candle(k, u0 + 2.6, F - 1.0, z, 0.9);
    const su = u1 - 1.0;
    k.cyl(su, F - 1.2, z, 0.5, 0.15, C.brass, { line: k.thin });
    k.rod([[su, F - 1.2, z + 0.15], [su, F - 1.2, z + 1.7]], C.brass, 0.08);
    k.rod([[su - 0.9, F - 1.2, z + 1.6], [su + 0.9, F - 1.2, z + 1.7]], C.brass, 0.07);
    for (const du of [-0.9, 0.9]) {
      k.line([[su + du, F - 1.2, z + 1.65], [su + du, F - 1.2, z + 0.75]], '#8a6a3a', Math.max(0.6, 0.04 * k.s));
      k.disc(su + du, F - 1.2, z + 0.7, 0.4, C.brass, k.thin);
    }
    nugget(k, su - 0.9, F - 1.2, z + 0.72, 0.16, seed, false);
  }
}

// ── search: the dig face ────────────────────────────────────────────────────
// An outcrop of rock bulging from the wall inside a timber set: a coal
// seam through it and a vein of quartz and gold with nuggets in it, a pick
// stuck in the rock, a lantern on the cap, rubble and a pan of ore at the
// foot. Working it makes the gold glitter and chips fly.

// The face: facets between these stations along u, each column leaning
// back from its foot (out FV from the wall) through a bulge at half height
// to its top (FZ high); the top and middle corners shift along u (DT, DM)
// so the facets' edges run slanted, like broken rock.
const FU = [1.1, 3.0, 4.9, 6.9, 8.9, 11.0];
const FV = [1.3, 2.5, 3.0, 2.8, 2.2, 1.4];
const FZ = [11.6, 10.8, 11.9, 11.0, 11.7, 11.3];
const DM = [0, 0.7, -0.6, 0.5, -0.5, 0];
const DT = [0, -0.5, 0.6, -0.4, 0.5, 0];
const lean = (v: number) => 0.45 + (v - 0.45) * 0.3;
const bulge = (v: number) => (v + lean(v)) / 2 + 0.35;

// The point on the face at (u, z) (near enough for drawing on it).
function faceAt(u: number, z: number, out = 0.04): P3 {
  let i = 0;
  while (i < FU.length - 2 && u > FU[i + 1]) i++;
  const t = Math.max(0, Math.min(1, (u - FU[i]) / (FU[i + 1] - FU[i])));
  const vb = FV[i] + (FV[i + 1] - FV[i]) * t;
  const zt = FZ[i] + (FZ[i + 1] - FZ[i]) * t;
  const f = Math.min(1, z / zt);
  const v = f < 0.5 ? vb + (bulge(vb) - vb) * f * 2 : bulge(vb) + (lean(vb) - bulge(vb)) * (f - 0.5) * 2;
  return [u, v + out, z];
}

const FACE_VEIN: ReadonlyArray<P3> = [[1.6, 3.2], [2.9, 4.3], [4.2, 4.6], [5.6, 5.9], [7.0, 6.4], [8.4, 7.9], [9.9, 8.6]].map(([u, z]) => faceAt(u, z, 0.08));

const search: PropArt = {
  len: 12,
  dep: 4,
  height: 14,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const k = still(v, 'search', 14, (k) => {
      k.shadow(6, 2.2, 6.4, 2.4, 0.3);
      k.box(0.3, 0.1, 0, 0.95, 1.0, 12.4, C.timber, { stripe: false });
      digFace(k);
      k.box(10.8, 0.1, 0, 0.95, 1.0, 12.4, C.timber, { stripe: false });
      k.box(-0.1, 0, 12.4, 12.2, 1.3, 1.3, C.timberOld);
      // boulders broken off at its foot
      for (const [u, w, r, h, c] of [[2.2, 2.9, 0.9, 1.3, '#8a7462'], [6.9, 3.4, 0.75, 1.0, '#7e6a5a'], [10.2, 2.6, 0.8, 1.5, '#8a7462']] as const) rock(k, u, w, 0, r, h, c, Math.round(u * 17), k.lw);
      // the pick stuck in the rock
      pickaxe(k, [9.0, 4.3, 3.6], [8.1, 2.95, 6.9], [0, -0.45, 0.89], 0.9);
      // rubble at the foot, a pan of ore, a shovel
      heap(k, 4.4, 3.4, 0, 1.4, 0.9, v.seed + 11, [C.rockLight, C.stone, C.gold, C.rock]);
      k.shadow(8.4, 3.5, 1.1, 0.8, 0.22);
      k.cyl(8.4, 3.5, 0, 0.95, 0.35, '#6e6a68', { top: '#4a4644' });
      for (let j = 0; j < 4; j++) nugget(k, 8.1 + (j % 2) * 0.55, 3.3 + Math.floor(j / 2) * 0.4, 0.3, 0.2, v.seed + j, j === 0);
      shovel(k, [11.6, 1.6, 6.2], [11.3, 3.4, 0.2], [0.85, 0.2, 0.1], 0.85);
      // the lantern's nail in the cap
      k.rod([[5.6, 1.3, 12.6], [5.6, 1.8, 12.6]], C.iron, 0.08);
    });
    part(v, `search-lamp-${v.active}`, [4.6, 6.6, 0.8, 2.8, 9.2, 12.8], 0, 0, 0, (k) => hangLantern(k, 5.6, 1.8, 12.6, 0.3, v.active ? 1 : 0.7));
    // glitter along the vein: one glint idling, several while worked (the
    // same ones every 2 s)
    const rate = v.active ? 5 : 1.2;
    const n = v.active ? 4 : 1;
    for (let i = 0; i < n; i++) {
      const tick = (Math.floor(v.t * rate) % 10) + i * 7;
      const j = Math.floor(hash(tick, 3) * FACE_VEIN.length);
      const a = Math.sin(((v.t * rate) % 1) * Math.PI);
      const [u, w, z] = FACE_VEIN[j];
      sparkle(k, u + (hash(tick, 4) - 0.5) * 0.8, w + 0.2, z + (hash(tick, 5) - 0.5) * 0.6, 0.45 + 0.4 * a, a);
    }
    if (v.active) k.halo(6, 2.6, 6, 6, '#ffd36a', 0.16 + 0.06 * Math.sin(v.t * Math.PI * 2));
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    if (!v.active) return;
    const n = due(v.t, dt, 6, v.seed);
    for (let i = 0; i < n; i++) {
      const tick = Math.floor(v.t * 30) + i;
      const [u, w, z] = FACE_VEIN[Math.floor(hash(tick, 9) * FACE_VEIN.length)];
      spawn(hash(tick, 8) < 0.4 ? fling('glint', u, w + 0.5, z, tick, i, GOLDDUST, 0.7, 2.2, 10) : fling('spark', u, w + 0.5, z, tick, i, [214, 196, 170], 0.9, 2.5, 14));
    }
  },
};

// The rock face: triangles lit by which way they turn (toward the light at
// the upper left, and up), its top and its end, strata and a coal seam
// across it, cracks, and the vein of quartz and gold with nuggets in it.
function digFace(k: Kit): void {
  const rockC = '#7f6755';
  const N = FU.length - 1;
  const bot = (i: number): P3 => [FU[i], FV[i], 0];
  const mid = (i: number): P3 => [FU[i] + DM[i], bulge(FV[i]), FZ[i] * 0.5];
  const top = (i: number): P3 => [FU[i] + DT[i], lean(FV[i]), FZ[i]];
  const tone = (p: P3, q: P3, r: P3, base: Color): Color => {
    const a: P3 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
    const b: P3 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
    let n: P3 = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
    const l = Math.hypot(...n) || 1;
    const sx = (n[0] * k.eu[0] + n[1] * k.ev[0]) / (l * k.s);
    return shade(base, -sx * 0.34 + (n[2] / l) * 0.24 - 0.08);
  };
  const tri = (p: P3, q: P3, r: P3) => k.poly([p, q, r], tone(p, q, r, rockC), 0);
  // the top, behind the facets' upper edges, and the end toward +u
  for (let i = 0; i < N; i++) k.poly([top(i), top(i + 1), [FU[i + 1], 0.2, FZ[i + 1] + 0.5], [FU[i], 0.2, FZ[i] + 0.5]], shade(rockC, 0.16), k.thin);
  k.poly([[FU[N], 0.2, 0], bot(N), mid(N), top(N), [FU[N], 0.2, FZ[N] + 0.5]], shade(rockC, -0.3), k.lw);
  for (let i = 0; i < N; i++) {
    if (i & 1) {
      tri(bot(i), bot(i + 1), mid(i + 1));
      tri(bot(i), mid(i + 1), mid(i));
      tri(mid(i), mid(i + 1), top(i));
      tri(mid(i + 1), top(i + 1), top(i));
    } else {
      tri(bot(i), bot(i + 1), mid(i));
      tri(bot(i + 1), mid(i + 1), mid(i));
      tri(mid(i), mid(i + 1), top(i + 1));
      tri(mid(i), top(i + 1), top(i));
    }
  }
  // strata: a pale band low down, the coal seam across the middle
  const band = (za: number, zb: number, color: Color) => {
    const pts: P3[] = [];
    for (let u = FU[0]; u <= FU[N] + 0.01; u += 0.5) pts.push(faceAt(Math.min(u, FU[N]), za + Math.sin(u * 1.3) * 0.15, 0.03));
    for (let u = FU[N]; u >= FU[0] - 0.01; u -= 0.5) pts.push(faceAt(Math.max(u, FU[0]), zb + Math.sin(u * 1.7) * 0.2, 0.03));
    k.poly(pts, color, 0);
  };
  band(2.0, 2.8, withAlpha('#d6bc96', 0.35));
  band(5.2, 6.6, withAlpha(C.coal, 0.92));
  band(9.0, 9.5, withAlpha('#4a3c32', 0.45));
  // the facets' edges, faint, then the silhouette
  k.pen.beginPath();
  for (let i = 0; i <= N; i++) {
    for (const [p, q] of [[bot(i), mid(i)], [mid(i), top(i)]] as const) {
      const [x0, y0] = k.p(...p);
      const [x1, y1] = k.p(...q);
      k.pen.moveTo(x0, y0);
      k.pen.lineTo(x1, y1);
    }
    if (i < N) {
      const [x0, y0] = k.p(...mid(i));
      const [x1, y1] = k.p(...mid(i + 1));
      k.pen.moveTo(x0, y0);
      k.pen.lineTo(x1, y1);
    }
  }
  k.pen.strokeStyle = withAlpha(INK, 0.35);
  k.pen.lineWidth = Math.max(0.7, k.thin * 0.6);
  k.pen.lineJoin = 'round';
  k.pen.stroke();
  const rim: P3[] = [bot(0), mid(0), top(0)];
  for (let i = 1; i <= N; i++) rim.push(top(i));
  rim.push(mid(N), bot(N));
  k.line(rim, INK, k.lw);
  // coal glints and cracks
  k.pen.beginPath();
  for (let i = 0; i < 9; i++) {
    const [x, y] = k.p(...faceAt(1.6 + i * 1.1, 5.9 + Math.sin(i * 2.3) * 0.3, 0.05));
    const r = Math.max(0.8, 0.2 * k.s);
    k.pen.moveTo(x - r, y);
    k.pen.lineTo(x, y - r * 0.7);
    k.pen.lineTo(x + r, y);
    k.pen.lineTo(x, y + r * 0.7);
    k.pen.closePath();
  }
  k.pen.fillStyle = '#8c8ca0';
  k.pen.fill();
  for (const [u0, z0, u1, z1] of [[2.0, 9.8, 3.1, 8.6], [6.1, 3.8, 6.9, 2.2], [9.1, 10.4, 9.9, 9.9], [3.6, 1.2, 4.1, 0.2]] as const) {
    k.line([faceAt(u0, z0), faceAt((u0 + u1) / 2 + 0.2, (z0 + z1) / 2), faceAt(u1, z1)], withAlpha(INK, 0.55), Math.max(0.8, 0.1 * k.s));
  }
  // the vein
  k.line([...FACE_VEIN], withAlpha(INK, 0.6), Math.max(1.6, 0.85 * k.s));
  k.line([...FACE_VEIN], '#e2d6bc', Math.max(1.2, 0.5 * k.s));
  k.line([...FACE_VEIN], C.goldDark, Math.max(0.8, 0.2 * k.s));
  for (const i of [1, 3, 5]) nugget(k, FACE_VEIN[i][0], FACE_VEIN[i][1] + 0.1, FACE_VEIN[i][2] - 0.35, 0.42, 60 + i, false);
}

// ── run: the steam pump ─────────────────────────────────────────────────────
// A riveted upright boiler on a timber skid, its firebox glowing; the engine
// beside it driving a big flywheel; a pump at the front with its hose
// running to a barrel; coal and a shovel by the firebox. Running it spins
// the wheel, works the piston, stokes the fire and puffs smoke and steam.

const BOILER = { u: 3.0, v: 3.4, r: 2.0, z0: 0.8, z1: 7.8 };
const BOILER_C = '#4f6a58';
const FLY = { c: [7.3, 7.6, 4.6] as P3, r: 3.3 };
const CYL = { u0: 5.2, u1: 8.0, v: 4.4, z: 4.6, r: 0.75 };

const run: PropArt = {
  len: 11,
  dep: 11,
  height: 15,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'run', 15, (k) => {
      k.shadow(5.5, 5.6, 6.0, 5.6, 0.3);
      // the skid
      k.box(0.6, 0.8, 0, 9.8, 8.4, 0.8, C.timberOld, { stripe: false });
      if (k.fine) for (let u = 1.8; u < 10.4; u += 1.2) k.line([[u, 9.21, 0.05], [u, 9.21, 0.75]], shade(C.timberOld, -0.3), 0.06 * k.s);
      // coal by the firebox, a shovel in it
      heap(k, 1.6, 7.4, 0.8, 1.1, 0.7, v.seed + 4, [C.coal, '#3a3230', C.coal]);
      shovel(k, [2.6, 8.4, 3.6], [1.7, 7.3, 1.0], [0.6, -0.6, 0.2], 0.8);
      // the boiler: riveted bands, a dome, the stack
      const { u, v: w, r, z0, z1 } = BOILER;
      k.cyl(u, w, z0, r, z1 - z0, BOILER_C);
      for (const z of [z0 + 2.4, z0 + 4.8]) {
        const e = k.ell(u, w, z, r);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
        k.pen.strokeStyle = INK;
        k.pen.lineWidth = Math.max(1.4, 0.3 * k.s + k.thin);
        k.pen.stroke();
        k.pen.strokeStyle = C.brass;
        k.pen.lineWidth = Math.max(0.8, 0.3 * k.s);
        k.pen.stroke();
        if (k.s >= 5) {
          k.pen.beginPath();
          for (let i = 1; i < 12; i++) {
            const th = (i / 12) * Math.PI;
            const x = e.cx + Math.cos(th) * e.rx;
            const y = e.cy + Math.sin(th) * e.ry - 0.3 * k.s;
            k.pen.moveTo(x + 0.1 * k.s, y);
            k.pen.arc(x, y, 0.1 * k.s, 0, Math.PI * 2);
          }
          k.pen.fillStyle = '#a49890';
          k.pen.fill();
        }
      }
      dome(k, u, w, z1, r, 1.2, BOILER_C);
      k.cyl(u, w, z1 + 1.0, 0.6, 14.4 - z1 - 1.0, '#3e3633');
      k.cyl(u, w, 14.1, 0.85, 0.45, '#3e3633', { line: k.thin });
      // the safety valve and whistle
      k.cyl(u + 1.2, w + 0.2, z1 + 0.3, 0.2, 1.0, C.brass, { line: k.thin });
      k.cyl(u + 1.2, w + 0.2, z1 + 1.2, 0.28, 0.4, C.brass, { line: k.thin });
      // the firebox door on the boiler's front
      fillPts(k, ring(k, [u + 0.3, w + r * 0.94, z0 + 1.6], [0.15, 1, 0], 0.95, 16), '#2a1d16', k.lw);
      // the gauge
      fillPts(k, ring(k, [u + 1.2, w + r * 0.75, z1 - 1.4], [0.6, 0.8, 0], 0.55, 16), C.brass, k.thin);
      fillPts(k, ring(k, [u + 1.22, w + r * 0.77, z1 - 1.4], [0.6, 0.8, 0], 0.42, 16), '#f2ead6', 0);
      // steam pipe to the engine
      k.rod([[u + 1.3, w - 0.4, z1 + 0.4], [u + 1.9, w - 0.4, z1 + 0.6], [CYL.u0 + 0.6, CYL.v - 0.3, z1 + 0.6], [CYL.u0 + 0.6, CYL.v - 0.3, CYL.z + CYL.r]], C.copper, 0.24);
      // the engine bed and its cylinder
      k.box(4.8, 3.3, 0.8, 4.4, 2.2, CYL.z - CYL.r - 0.8, '#4e4744', { stripe: false });
      logU(k, CYL.u0, CYL.u1, CYL.v, CYL.z, CYL.r, '#5a524e');
      for (const uu of [CYL.u0 + 0.15, CYL.u1 - 0.15]) fillPts(k, ring(k, [uu, CYL.v, CYL.z], [1, 0, 0], CYL.r + 0.12, 16), '#6e6662', k.thin);
      fillPts(k, ring(k, [CYL.u1 + 0.01, CYL.v, CYL.z], [1, 0, 0], CYL.r * 0.6, 12), '#8a827e', k.thin);
      // the flywheel's bearings: an A frame each side
      for (const fv of [FLY.c[1] - 1.4, FLY.c[1] + 0.9]) {
        k.rod([[FLY.c[0] - 1.2, fv, 0.8], [FLY.c[0], fv, FLY.c[2]], [FLY.c[0] + 1.2, fv, 0.8]], '#4e4744', 0.32);
      }
      k.rod([[FLY.c[0], FLY.c[1] - 1.5, FLY.c[2]], [FLY.c[0], FLY.c[1] + 0.3, FLY.c[2]]], C.steel, 0.22);
    });
    const t = v.t;
    const spin = v.active ? t * 3.2 : 0.4;
    // the firebox's glow
    const { u, v: w, r, z0 } = BOILER;
    const flick = 0.5 + 0.5 * Math.sin(t * 9.1) * Math.sin(t * 5.3 + 1);
    const hot = v.active ? 0.8 + 0.2 * flick : 0.35;
    fillPts(k, ring(k, [u + 0.3, w + r * 0.95, z0 + 1.6], [0.15, 1, 0], 0.7, 14), v.active ? '#ff8a2a' : '#7a3a1a', 0);
    k.halo(u + 0.3, w + r + 0.3, z0 + 1.6, 2.8, '#ff8a3a', 0.45 * hot);
    // the gauge's needle
    const ga = v.active ? -0.5 + Math.sin(t * 6) * 0.18 : -2.3;
    const gc: P3 = [u + 1.24, w + r * 0.78, BOILER.z1 - 1.4];
    const [ea, eb] = basis([0.6, 0.8, 0]);
    k.line([gc, onCircle(gc, ea, eb, 0.36, ga)], C.red, Math.max(0.8, 0.08 * k.s));
    // the piston rod and the connecting rod to the crank
    const pin = onCircle([FLY.c[0], FLY.c[1] - 0.45, FLY.c[2]], [1, 0, 0], [0, 0, 1], 1.5, spin);
    const cross: P3 = [CYL.u1 + 0.6 + (pin[0] - FLY.c[0]) * 0.5, CYL.v, CYL.z];
    k.rod([[CYL.u1, CYL.v, CYL.z], cross], C.steel, 0.16);
    k.box(cross[0] - 0.25, CYL.v - 0.3, CYL.z - 0.3, 0.5, 0.6, 0.6, '#4e4744', { line: k.thin });
    k.rod([cross, pin], '#7a7470', 0.2);
    // the flywheel, then what stands before it
    wheel(k, FLY.c, [0, 1, 0], FLY.r, 6, spin, '#a63e2e', C.brass, 0.14);
    k.disc(pin[0], pin[1] + 0.2, pin[2], 0.2, C.steel, k.thin);
    part(v, 'run-front', [0, 11, 7.5, 11, 0, 4], 0, 0, 0, (k) => {
      // the pump at the front with its hose to a barrel of water
      k.cyl(2.6, 9.6, 0, 0.9, 0.25, '#4e4744', { line: k.thin });
      k.cyl(2.6, 9.6, 0.25, 0.6, 2.4, '#5e5652');
      k.rod([[2.6, 9.6, 2.9], [2.6, 9.6, 3.6], [3.8, 9.6, 3.9]], C.iron, 0.18);
      k.rod([[3.1, 9.7, 1.9], [3.7, 9.9, 2.1]], C.iron, 0.2);
      k.rod([[2.0, 9.9, 0.6], [1.0, 10.4, 0.3], [0.6, 9.4, 0.25], [1.3, 8.9, 0.2], [2.4, 8.7, 0.9]], '#2f2a28', 0.36);
      k.rod([[3.7, 9.9, 2.1], [4.6, 10.2, 0.4], [6.2, 10.4, 0.3], [7.4, 10.0, 0.6], [8.4, 9.8, 1.9]], '#2f2a28', 0.36);
      k.shadow(9.2, 9.6, 1.2, 1.0, 0.25);
      barrel(k, 9.2, 9.6, 0, 0.95, 2.0, C.timberOld, '#2f4a52');
    });
    if (v.active) {
      // a trickle from the hose into the barrel
      const wob = Math.sin(t * 17) * 0.05;
      k.line([[8.6, 9.75, 2.0], [8.75 + wob, 9.7, 1.95]], '#9cc4d0', Math.max(0.8, 0.12 * k.s));
    }
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const t = v.t;
    if (due(t, dt, v.active ? 2.2 : 0.3, v.seed)) spawn(puff('smoke', BOILER.u, BOILER.v, 14.8, Math.floor(t * 10), 0, [96, 86, 80]));
    if (!v.active) return;
    if (due(t, dt, 1.4, v.seed + 3)) spawn(puff('steam', CYL.u1 + 0.4, CYL.v + 0.5, CYL.z + 0.5, Math.floor(t * 10), 1));
    if (due(t, dt, 0.6, v.seed + 5)) spawn(puff('steam', BOILER.u + 1.2, BOILER.v + 0.2, BOILER.z1 + 1.8, Math.floor(t * 10), 2));
  },
};

// A rounded dome on top of a cylinder.
function dome(k: Kit, cu: number, cv: number, z: number, r: number, h: number, base: Color): void {
  const e = k.ell(cu, cv, z, r);
  const [, ty] = k.p(cu, cv, z + h);
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(e.cx - e.rx, e.cy);
  pen.bezierCurveTo(e.cx - e.rx, ty + (e.cy - ty) * 0.2, e.cx - e.rx * 0.5, ty, e.cx, ty);
  pen.bezierCurveTo(e.cx + e.rx * 0.5, ty, e.cx + e.rx, ty + (e.cy - ty) * 0.2, e.cx + e.rx, e.cy);
  pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
  pen.closePath();
  const g = pen.createRadialGradient(e.cx - e.rx * 0.35, ty + (e.cy - ty) * 0.3, 0, e.cx, e.cy, e.rx * 1.3);
  g.addColorStop(0, shade(base, 0.3));
  g.addColorStop(0.4, base);
  g.addColorStop(1, shade(base, -0.3));
  k.paint(g, k.lw);
}

// ── web: the ore cart ───────────────────────────────────────────────────────
// A length of track between two timber stops with a hopper wagon heaped
// with ore and gold; a lamp post at the far end, a point lever, sacks of
// ore waiting. Working it sends the cart rolling out and back, its wheels
// turning, the lever thrown.

const TRACK_V = 4.6;
const CART = { len: 3.6, r: 0.55 };

const web: PropArt = {
  len: 9,
  dep: 9,
  height: 10,
  animated: true,
  draw(v: PropView): void {
    const k = still(v, 'web', 10, (k) => {
      k.shadow(4.5, 4.6, 4.8, 3.6, 0.22);
      rails(k, 0, 9, TRACK_V, 0);
      // the far stop
      k.box(0.15, TRACK_V - 1.5, 0, 0.8, 3.0, 1.4, C.timberOld);
      k.box(0.95, TRACK_V - 1.1, 0.7, 0.35, 0.55, 0.55, C.timber, { line: k.thin });
      k.box(0.95, TRACK_V + 0.55, 0.7, 0.35, 0.55, 0.55, C.timber, { line: k.thin });
      // the lamp post at the back
      k.shadow(1.2, 1.2, 0.9, 0.8, 0.25);
      k.box(0.8, 0.8, 0, 0.8, 0.8, 8.2, C.timber, { stripe: false });
      k.rod([[1.2, 1.6, 7.6], [1.2, 2.6, 7.6]], C.iron, 0.12);
      hangLantern(k, 1.2, 2.6, 7.6, 0.3, 1);
      // sacks of ore waiting at the back
      sack(k, 6.4, 1.5, 0, 1.0, 2.2, true, v.seed + 2, C.rockLight);
      sack(k, 7.9, 1.8, 0, 0.95, 2.0, false, v.seed + 3);
    });
    // the cart: parked at the far stop, or rolling out and back
    const pos = v.active ? 1.4 + 3.3 * (0.5 - 0.5 * Math.cos(v.t * 1.1)) : 1.4;
    const turn = -(pos / CART.r) * 0.9;
    // the far wheels barely show under the body: plain discs
    for (const du of [0.75, CART.len - 0.75]) fillPts(k, ring(k, [pos + du, TRACK_V - 1.0, 0.75], [0, 1, 0], CART.r, 10), '#3a3432', k.thin);
    part(v, 'web-cart', [0, CART.len, TRACK_V - 1.8, TRACK_V + 1.8, 0.6, 4.6], pos, 0, 0, (k) => cartBody(k, v.seed));
    for (const du of [0.75, CART.len - 0.75]) wheel(k, [pos + du, TRACK_V + 1.05, 0.75], [0, 1, 0], CART.r, 4, turn, '#3a3432', '#6e6662', 0.3);
    // the near stop, over the cart
    part(v, 'web-stop', [7.8, 9, TRACK_V - 1.6, TRACK_V + 1.6, 0, 1.5], 0, 0, 0, (k) => {
      k.box(8.05, TRACK_V - 1.5, 0, 0.8, 3.0, 1.4, C.timberOld);
      k.box(7.7, TRACK_V - 1.1, 0.7, 0.35, 0.55, 0.55, C.timber, { line: k.thin });
      k.box(7.7, TRACK_V + 0.55, 0.7, 0.35, 0.55, 0.55, C.timber, { line: k.thin });
    });
    // the point lever at the front: over toward the far end, or thrown
    const th = v.active ? 0.5 : -0.5;
    k.box(1.6, 7.4, 0, 1.4, 0.9, 0.5, C.iron, { line: k.thin });
    const top: P3 = [2.3 + Math.sin(th) * 2.2, 7.85, 0.5 + Math.cos(th) * 2.2];
    k.rod([[2.3, 7.85, 0.5], top], '#d8d0c4', 0.14);
    k.line([[2.3 + Math.sin(th) * 1.2, 7.85, 0.5 + Math.cos(th) * 1.2], [2.3 + Math.sin(th) * 1.7, 7.85, 0.5 + Math.cos(th) * 1.7]], C.red, Math.max(1, 0.14 * k.s));
    k.disc(top[0], top[1], top[2], 0.22, C.red, k.thin);
  },
};

// The hopper: a box widening to the top on a chassis, iron bands, ore heaped
// over the rim (in its own frame: u 0..CART.len, centred on TRACK_V).
function cartBody(k: Kit, seed: number): void {
  const L = CART.len;
  const w = TRACK_V;
  k.shadow(L / 2, w, L * 0.6, 1.5, 0.25, 0.35);
  k.box(0.3, w - 0.9, 0.5, L - 0.6, 1.8, 0.5, '#3e3836', { line: k.thin, stripe: false });
  const lo = (u: number, s: number): P3 => [u, w + s * 1.2, 1.0];
  const hi = (u: number, s: number): P3 => [u, w + s * 1.5, 3.3];
  const steel = '#6e5a4e';
  // the end (+u) and the front (+v), the back's top edge showing inside
  k.poly([lo(L - 0.1, -1), lo(L - 0.1, 1), hi(L + 0.2, 1), hi(L + 0.2, -1)], k.side(steel, 1, 0, 0.2), k.lw);
  k.poly([lo(0.1, 1), lo(L - 0.1, 1), hi(L + 0.2, 1), hi(-0.2, 1)], k.side(steel, 0, 1, 0.2), k.lw);
  // bands and rivets on the front
  for (const f of [0.22, 0.78]) k.line([[0.1 + (L - 0.2) * f, w + 1.21, 1.05], [-0.2 + (L + 0.4) * f, w + 1.51, 3.25]], shade(steel, -0.3), Math.max(1, 0.18 * k.s));
  k.line([[-0.2, w + 1.52, 3.2], [L + 0.2, w + 1.52, 3.2], [L + 0.2, w - 1.5, 3.2]], shade(steel, 0.25), Math.max(0.8, 0.12 * k.s));
  // ore heaped in it, gold among the rock
  k.poly([hi(-0.2, -1), hi(L + 0.2, -1), hi(L + 0.2, 1), hi(-0.2, 1)], '#3a2c22', k.thin);
  heap(k, L / 2, w, 3.25, 1.5, 1.0, seed + 21, [C.rockLight, C.stone, C.gold, C.rock, C.gold]);
}

// ── think: the map table ────────────────────────────────────────────────────
// A heavy trestle table with the survey of the workings spread on it (drifts
// as lines, the shafts as squares, contours, a red route to the strike),
// held flat by a lantern, a rock and an ink pot, dividers lying on it;
// surveys rolled in a barrel at the end, a crate to sit on. Thinking turns
// the lantern up and traces the route on.

const MAP: readonly [number, number, number, number] = [1.5, 8.6, 1.1, 5.1]; // u0, u1, v0, v1
const ROUTE: ReadonlyArray<readonly [number, number]> = [[0.12, 0.8], [0.3, 0.72], [0.38, 0.45], [0.55, 0.4], [0.62, 0.22], [0.82, 0.2]];
const TOP = 5.75;

const think: PropArt = {
  len: 12,
  dep: 7,
  height: 11,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const at = (fu: number, fv: number): P3 => [MAP[0] + (MAP[1] - MAP[0]) * fu, MAP[2] + (MAP[3] - MAP[2]) * fv, TOP + 0.02];
    const k = still(v, 'think', 11, (k) => {
      k.shadow(5.5, 3.4, 6.0, 3.4, 0.3);
      // trestles and the stretcher
      for (const u of [1.6, 9.0]) {
        k.rod([[u, 1.0, 0], [u + 0.3, 3.3, 5.2], [u, 5.6, 0]], C.timberOld, 0.36);
        k.box(u - 0.1, 1.2, 5.0, 0.8, 4.2, 0.35, C.timberOld, { line: k.thin });
      }
      k.box(1.6, 3.0, 2.0, 7.8, 0.5, 0.45, C.timberOld, { line: k.thin });
      // the top: planks
      k.box(0.6, 0.7, 5.35, 9.8, 5.0, 0.4, C.plank);
      if (k.fine) for (let w = 1.95; w < 5.6; w += 1.25) k.line([[0.6, w, TOP + 0.01], [10.4, w, TOP + 0.01]], shade(C.plank, -0.3), 0.06 * k.s);
      // the survey, its corners curling
      const [u0, u1, v0, v1] = MAP;
      k.poly([[u0, v0, TOP + 0.01], [u1, v0, TOP + 0.01], [u1, v1, TOP + 0.01], [u0, v1, TOP + 0.01]], C.paper, k.thin);
      k.poly([[u1 - 0.9, v1, TOP + 0.01], [u1, v1 - 0.7, TOP + 0.01], [u1 - 0.2, v1 - 0.2, TOP + 0.4]], shade(C.paper, -0.12), k.thin);
      surveyLines(k, at);
      // what holds it down: the lantern's spot, a rock, the ink pot
      rock(k, u0 + 0.3, v0 + 0.3, TOP, 0.55, 0.5, C.stone, 9, k.thin);
      k.cyl(u1 - 0.2, v1 - 0.4, TOP, 0.32, 0.45, '#2b2a33', { line: k.thin });
      k.line([[u1 - 0.2, v1 - 0.4, TOP + 0.45], [u1 + 0.3, v1 - 0.9, TOP + 1.5]], '#efe6d6', Math.max(0.8, 0.12 * k.s));
      // dividers lying open on the survey
      k.line([at(0.42, 0.62), at(0.5, 0.95), at(0.6, 0.66)], '#9a9ca2', Math.max(0.8, 0.1 * k.s));
      // a candle stub and a mug at the near corner
      candle(k, 10.0, 5.6, TOP, 0.5);
      k.cyl(1.2, 5.6, TOP, 0.35, 0.6, '#d9d2c4', { line: k.thin });
      // surveys rolled in a barrel at the end
      barrel(k, 11.2, 2.0, 0, 0.75, 2.4, C.timberOld);
      for (const [du, dv, h] of [[-0.25, -0.1, 3.4], [0.2, 0.15, 3.9], [0.0, -0.3, 3.1], [0.3, -0.25, 3.6]] as const) k.cyl(11.2 + du, 2.0 + dv, 1.2, 0.2, h, i2c(du), { line: k.thin });
      // a crate to sit on
      crate(k, 3.2, 6.0, 0, 2.0, 1.0, 1.9, C.pine);
    });
    // the lantern weighting the far corner: turned up while someone ponders
    const glow = v.active ? 0.9 + 0.1 * Math.sin(v.t * 2.3) : 0.5;
    lantern(k, MAP[1] + 0.3, MAP[2] + 0.2, TOP, glow);
    k.pool(5.5, 3.0, 4.2, 2.8, '#ffd890', 0.2 * glow, TOP + 0.02);
    // the red route to the strike, traced on while thinking
    const n = ROUTE.length - 1;
    const f = v.active ? ((v.t * 0.35) % 1.3) / 1.0 : 1;
    const pts: P3[] = [];
    for (let i = 0; i <= n; i++) {
      const g = i / n;
      if (g > f) {
        const [a0, b0] = ROUTE[i - 1];
        const [a1, b1] = ROUTE[i];
        const q = (f - (i - 1) / n) * n;
        pts.push(at(a0 + (a1 - a0) * q, b0 + (b1 - b0) * q));
        break;
      }
      pts.push(at(...ROUTE[i]));
    }
    if (pts.length > 1) k.line(pts, '#c0392f', Math.max(1, 0.16 * k.s));
    // the strike: a gold mark, glinting
    const [su, sv, sz] = at(0.84, 0.18);
    k.disc(su, sv, sz, 0.32, C.gold, k.thin);
    if (v.active || f >= 1) sparkle(k, su, sv, sz + 0.3, 0.5 + 0.2 * Math.sin(v.t * 4), v.active ? 1 : 0.6);
  },
};

const i2c = (n: number): Color => (n > 0.1 ? C.paper : n < -0.1 ? '#e6d6b2' : '#d9c8a0');

// The survey's drawing: drifts as double lines, shafts as squares, a few
// contour lines (no words).
function surveyLines(k: Kit, at: (fu: number, fv: number) => P3): void {
  const ink = '#7a5a3a';
  const w = Math.max(0.8, 0.09 * k.s);
  const drift = (pts: ReadonlyArray<readonly [number, number]>) => k.line(pts.map(([a, b]) => at(a, b)), ink, w);
  drift([[0.05, 0.8], [0.3, 0.72], [0.38, 0.45], [0.55, 0.4], [0.95, 0.38]]);
  drift([[0.38, 0.45], [0.3, 0.12]]);
  drift([[0.55, 0.4], [0.62, 0.22], [0.9, 0.2]]);
  drift([[0.3, 0.72], [0.5, 0.88], [0.8, 0.82]]);
  for (const [a, b] of [[0.3, 0.72], [0.55, 0.4], [0.3, 0.12]] as const) {
    k.pen.beginPath();
    k.trace([at(a - 0.025, b - 0.05), at(a + 0.025, b - 0.05), at(a + 0.025, b + 0.05), at(a - 0.025, b + 0.05)]);
    k.paint('#c8b48a', Math.max(0.7, 0.07 * k.s), ink);
  }
  if (k.s >= 5) {
    for (let i = 0; i < 3; i++) {
      const pts: P3[] = [];
      for (let j = 0; j <= 12; j++) {
        const th = (j / 12) * Math.PI * 2;
        pts.push(at(0.72 + Math.cos(th) * (0.08 + i * 0.05), 0.65 + Math.sin(th) * (0.1 + i * 0.07)));
      }
      k.line(pts, '#b8a07a', Math.max(0.6, 0.05 * k.s));
    }
  }
}

// ── idle: the camp ──────────────────────────────────────────────────────────
// A fire in a ring of stones with a kettle hung over it from a tripod, log
// benches round it, a canvas tent and a bedroll with a blanket, a lantern on
// a crate, a pick leaning on a log. Where tired miners sleep.

const FIRE = { u: 6.6, v: 6.2 };

const idle: PropArt = {
  len: 15,
  dep: 11,
  height: 10,
  animated: true,
  movesIdle: true,
  draw(v: PropView): void {
    const k = still(v, 'idle', 10, (k) => {
      k.shadow(7.5, 5.5, 7.6, 5.4, 0.22);
      // trodden earth round the fire
      k.disc(FIRE.u, FIRE.v, 0.01, 5.2, withAlpha('#5a4430', 0.45), 0);
      // the tent at the back right
      tent(k, 10.0, 0.6, 4.6, 4.2, 4.4);
      // the back bench
      logU(k, 2.0, 9.0, 2.2, 0.62, 0.62);
      // the bedroll by the tent, the blanket over it, a rolled one at its head
      const bed: P3[] = [[10.4, 5.4, 0.05], [14.5, 5.4, 0.05], [14.5, 7.4, 0.05], [10.4, 7.4, 0.05]];
      k.poly(bed, '#6a5a44', k.thin, 0.3);
      k.box(10.6, 5.6, 0.05, 3.6, 1.6, 0.4, C.blanket2, { round: 0.3, line: k.lw });
      k.box(10.6, 5.6, 0.05, 1.3, 1.6, 0.42, C.wool, { round: 0.3, line: k.thin });
      if (k.fine) for (let u = 11.4; u < 14; u += 0.6) k.line([[u, 7.21, 0.1], [u, 7.21, 0.42]], shade(C.blanket2, -0.3), 0.06 * k.s);
      logU(k, 10.4, 12.4, 8.6, 0.45, 0.45, C.blanket);
      // the side bench
      logV(k, 3.4, 9.6, 1.6, 0.6, 0.6);
      // a lantern on a crate by the side bench, a pick leaning on it
      crate(k, 0.2, 9.4, 0, 1.6, 1.4, 1.6, C.pine);
      pickaxe(k, [2.5, 9.0, 0], [2.0, 8.7, 3.1], [0.8, -0.6, 0], 0.85);
      // the ring of stones and the logs in it
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        if (Math.sin(a) > 0.2) continue; // the front half after the fire
        rock(k, FIRE.u + Math.cos(a) * 1.9, FIRE.v + Math.sin(a) * 1.6, 0, 0.55, 0.55, i & 1 ? C.stone : C.stoneDark, i, k.thin);
      }
      k.disc(FIRE.u, FIRE.v, 0.05, 1.5, '#3a2a20', 0);
      logU(k, FIRE.u - 1.2, FIRE.u + 1.0, FIRE.v - 0.2, 0.35, 0.3, '#4a3022');
      logV(k, FIRE.v - 1.0, FIRE.v + 0.8, FIRE.u + 0.1, 0.55, 0.28, '#4a3022');
      // the tripod's back legs
      k.rod([[FIRE.u - 1.6, FIRE.v - 1.3, 0], [FIRE.u, FIRE.v, 5.6]], C.timberOld, 0.18);
      k.rod([[FIRE.u + 1.7, FIRE.v - 1.1, 0], [FIRE.u, FIRE.v, 5.6]], C.timberOld, 0.18);
    });
    // the fire, then the kettle over it and what stands before it
    const t = v.t;
    flames(k, FIRE.u, FIRE.v, 0.45, 0.42, t * 1.7);
    const flick = 0.5 + 0.5 * (0.6 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 12.9 + 1.3));
    k.halo(FIRE.u, FIRE.v, 1.4, 4.5, '#ff9a48', 0.4 + 0.12 * flick);
    part(v, 'idle-front', [0, 15, 3.5, 11, 0, 6], 0, 0, 0, (k) => {
      // the kettle on its chain
      k.line([[FIRE.u, FIRE.v, 5.6], [FIRE.u, FIRE.v, 3.9]], INK, Math.max(0.8, 0.08 * k.s));
      kettle(k, FIRE.u, FIRE.v, 2.4);
      // the front stones and the tripod's front leg
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        if (Math.sin(a) <= 0.2) continue;
        rock(k, FIRE.u + Math.cos(a) * 1.9, FIRE.v + Math.sin(a) * 1.6, 0, 0.55, 0.55, i & 1 ? C.stone : C.stoneDark, i, k.thin);
      }
      k.rod([[FIRE.u + 0.2, FIRE.v + 2.0, 0], [FIRE.u, FIRE.v, 5.6]], C.timberOld, 0.18);
      // a tin mug and a pan by the stones
      k.cyl(FIRE.u + 2.6, FIRE.v + 1.4, 0, 0.3, 0.5, '#9a9ca2', { line: k.thin });
      k.rod([[FIRE.u - 2.8, FIRE.v + 1.6, 0.1], [FIRE.u - 4.0, FIRE.v + 2.4, 0.1]], C.iron, 0.12);
      k.disc(FIRE.u - 2.4, FIRE.v + 1.3, 0.12, 0.6, C.iron, k.thin);
      // a lantern on the crate
      lantern(k, 1.0, 10.1, 1.6, 0.9);
    });
  },
  emit(v: PropView, dt: number, spawn: Spawn): void {
    const t = v.t;
    if (due(t, dt, 1.4, v.seed)) spawn(fling('ember', FIRE.u, FIRE.v, 2.2, Math.floor(t * 20), 0, [255, 140, 60], 0.25, 1.6, -0.6));
    if (due(t, dt, 0.7, v.seed + 1)) spawn(puff('smoke', FIRE.u, FIRE.v, 4.5, Math.floor(t * 10), 1, [110, 100, 92]));
    if (due(t, dt, v.active ? 1.2 : 0.4, v.seed + 2)) spawn(puff('steam', FIRE.u + 0.9, FIRE.v, 3.4, Math.floor(t * 10), 2));
  },
};

// An A-frame canvas tent, its opening toward +v.
function tent(k: Kit, u0: number, v0: number, du: number, dv: number, h: number): void {
  const cu = u0 + du / 2;
  const ridge = (w: number): P3 => [cu, w, h];
  const canvas = C.canvas;
  k.shadow(cu, v0 + dv / 2, du * 0.6, dv * 0.6, 0.25);
  // the +u slope (seen) and the front gable with its open flap
  k.poly([[u0 + du, v0, 0], [u0 + du, v0 + dv, 0], ridge(v0 + dv), ridge(v0)], k.side(canvas, 1, 0, 0.2), k.lw);
  const front: P3[] = [[u0, v0 + dv, 0], [u0 + du, v0 + dv, 0], ridge(v0 + dv)];
  k.poly(front, k.side(shade(canvas, 0.05), 0, 1, 0.2), k.lw);
  k.poly([[cu - 0.9, v0 + dv + 0.01, 0], [cu + 0.9, v0 + dv + 0.01, 0], [cu, v0 + dv + 0.01, h * 0.75]], '#2a1e16', k.thin);
  k.poly([[cu + 0.1, v0 + dv + 0.02, h * 0.72], [cu + 1.6, v0 + dv + 0.3, 0], [cu + 0.9, v0 + dv + 0.02, 0]], shade(canvas, -0.1), k.thin);
  // the ridge pole and guy ropes
  k.rod([ridge(v0 - 0.3), ridge(v0 + dv + 0.3)], C.timberOld, 0.12);
  k.line([ridge(v0 + dv + 0.3), [cu - 1.8, v0 + dv + 1.4, 0]], C.rope, Math.max(0.7, 0.06 * k.s));
  k.line([ridge(v0 + dv + 0.3), [cu + 2.2, v0 + dv + 1.0, 0]], C.rope, Math.max(0.7, 0.06 * k.s));
  if (k.fine) for (let i = 1; i < 4; i++) k.line([[u0 + du, v0 + (dv * i) / 4, 0.1], [cu + 0.02, v0 + (dv * i) / 4, h - 0.1]], shade(canvas, -0.28), 0.05 * k.s);
}

// A soot-black kettle with a lid and spout, hung by its bail.
function kettle(k: Kit, cu: number, cv: number, z: number): void {
  const body = '#3a3432';
  k.rod([[cu + 0.65, cv, z + 0.6], [cu + 1.25, cv, z + 1.2]], body, 0.2);
  const e = k.ell(cu, cv, z + 0.7, 0.85);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx * 0.95, e.rx * 0.6, 0, 0, Math.PI * 2);
  const g = k.pen.createRadialGradient(e.cx - e.rx * 0.3, e.cy - e.rx * 0.3, 0, e.cx, e.cy, e.rx);
  g.addColorStop(0, shade(body, 0.35));
  g.addColorStop(1, shade(body, -0.15));
  k.paint(g, k.lw);
  k.disc(cu, cv, z + 1.2, 0.4, shade(body, 0.12), k.thin);
  k.disc(cu, cv, z + 1.35, 0.12, C.brass, k.thin);
  const [bx, by] = k.p(cu, cv, z + 1.3);
  k.pen.beginPath();
  k.pen.ellipse(bx, by, e.rx * 0.8, 0.9 * k.s, 0, Math.PI * 1.05, Math.PI * 1.95);
  k.pen.strokeStyle = INK;
  k.pen.lineWidth = Math.max(0.8, 0.09 * k.s);
  k.pen.stroke();
}

// ── entrance: the lift ──────────────────────────────────────────────────────
// A timber headframe over the shaft in the wall: two posts braced to a
// header, the sheave wheel on top, the iron cage on its rope in the shaft
// mouth, the winch with its crank beside it, a signal bell, a lantern.
// While someone comes or goes the wheel and the winch turn, the cage rides
// a little and its gate stands open.

const SHAFT = { u0: 2.7, u1: 9.3, h: 15 };
const CAGE = { u0: 3.1, u1: 8.9, v0: 0.4, v1: 3.5, h: 12 };
const SHEAVE: { c: P3; r: number } = { c: [6.0, 1.0, 24.0], r: 2.4 };
const DRUM = { u0: 11.8, u1: 13.9, v: 2.0, z: 2.6, r: 0.9 };

const entrance: PropArt = {
  len: 15,
  dep: 4,
  height: 27,
  animated: true,
  draw(v: PropView): void {
    const { u0, u1, h } = SHAFT;
    const k = still(v, 'entrance', 27, (k) => {
      // the shaft beyond the opening: rock falling away into the dark
      const out = -0.6;
      k.poly([[u0, out, 0], [u1, out, 0], [u1, out, h], [u0, out, h]], k.vgrad(u0, out, 0, h, [[0, '#120a06'], [0.5, '#2a1d14'], [1, '#3a2a1e']]), 0);
      k.poly([[u0, out, 0], [u0, 0, 0], [u0, 0, h], [u0, out, h]], k.side('#5a4a3e', 1, 0), 0);
      k.poly([[u0, out, h], [u1, out, h], [u1, 0, h], [u0, 0, h]], '#3a2c22', 0);
      // a ladder down the shaft's side
      for (const du of [0.4, 1.5]) k.line([[u0 + du, out + 0.05, 0], [u0 + du, out + 0.05, h]], '#5a3e26', Math.max(0.8, 0.14 * k.s));
      for (let z = 0.8; z < h; z += 1.3) k.line([[u0 + 0.4, out + 0.05, z], [u0 + 1.5, out + 0.05, z]], '#5a3e26', Math.max(0.6, 0.1 * k.s));
      // a landing of planks before it
      k.poly([[u0 - 0.6, 0, 0.04], [u1 + 0.6, 0, 0.04], [u1 + 0.6, 4.0, 0.04], [u0 - 0.6, 4.0, 0.04]], C.plank, k.thin);
      if (k.s >= 5) for (let u = u0; u < u1 + 0.6; u += 1.1) k.line([[u, 0, 0.05], [u, 4.0, 0.05]], shade(C.plank, -0.3), Math.max(0.6, 0.06 * k.s));
      // the headframe: posts, braces, the header, the sheave's bearings
      for (const u of [1.6, 9.8]) k.box(u, 0, 0, 1.0, 1.4, 21, C.timber, { stripe: false });
      k.box(0.8, 0, 21, 10.6, 1.6, 1.4, C.timberOld);
      k.rod([[2.6, 0.7, 17.5], [4.6, 0.7, 21]], C.timberOld, 0.45);
      k.rod([[9.8, 0.7, 17.5], [7.8, 0.7, 21]], C.timberOld, 0.45);
      for (const fv of [0.2, 1.6]) k.rod([[SHEAVE.c[0] - 1.1, fv, 22.4], [SHEAVE.c[0], fv, SHEAVE.c[2]], [SHEAVE.c[0] + 1.1, fv, 22.4]], C.timberOld, 0.3);
      // the winch's frame and the bell on the near post
      for (const u of [DRUM.u0 - 0.4, DRUM.u1 + 0.1]) k.rod([[u, 0.8, 0], [u + 0.15, DRUM.v, DRUM.z], [u, 3.2, 0]], C.timberOld, 0.3);
      k.rod([[10.8, 1.2, 15.6], [11.5, 1.2, 15.6]], C.iron, 0.1);
      // the lantern on the far post
      k.rod([[1.6, 0.7, 13.5], [0.9, 0.7, 13.5]], C.iron, 0.1);
      hangLantern(k, 0.9, 0.7, 13.5, 0.3, 1);
      // danger: a crate of dynamite and a coil of rope by the winch
      crate(k, 13.0, 0.3, 0, 1.6, 1.0, 1.1, C.pine);
      dynamite(k, 13.8, 0.8, 1.1, 3, 1.1);
      ropeCoil(k, 11.0, 3.3, 0, 0.7);
      logU(k, DRUM.u0, DRUM.u1, DRUM.v, DRUM.z, DRUM.r, '#6a5040');
    });
    const t = v.t;
    const turn = v.active ? t * 2.4 : 0;
    const ride = v.active ? Math.sin(t * 1.3) * 0.6 : 0;
    // the sheave wheel, the rope to the cage and to the winch
    wheel(k, SHEAVE.c, [0, 1, 0], SHEAVE.r, 6, turn, '#4b4542', C.brass, 0.16);
    k.line([[SHEAVE.c[0] - SHEAVE.r * 0.9, SHEAVE.c[1] + 0.2, SHEAVE.c[2]], [SHEAVE.c[0] - SHEAVE.r * 0.9, 1.9, CAGE.h + ride + 1.2]], '#3a3230', Math.max(1, 0.14 * k.s));
    k.line([[SHEAVE.c[0] + SHEAVE.r * 0.6, SHEAVE.c[1] + 0.2, SHEAVE.c[2] - SHEAVE.r * 0.6], [DRUM.u0 + 0.6, DRUM.v, DRUM.z + DRUM.r]], '#3a3230', Math.max(1, 0.14 * k.s));
    // the cage, riding
    part(v, 'entrance-cage', [CAGE.u0, CAGE.u1, CAGE.v0, CAGE.v1, 0, CAGE.h + 2], 0, 0, ride, (k) => cageBody(k));
    cageGate(k, ride, v.active);
    // the winch's crank
    const [ca, cb] = basis([1, 0, 0]);
    const hand = onCircle([DRUM.u1 + 0.35, DRUM.v, DRUM.z], ca, cb, 1.3, -turn * 1.6);
    k.rod([[DRUM.u1 + 0.3, DRUM.v, DRUM.z], [hand[0], hand[1], hand[2]]], C.iron, 0.16);
    k.rod([hand, [hand[0] + 0.7, hand[1], hand[2]]], C.timberDark, 0.2);
    // the signal bell, swinging while the cage rides
    const sw = v.active ? Math.sin(t * 8) * 0.4 : 0;
    const [bx, by] = k.p(11.5 + Math.sin(sw) * 0.5, 1.2, 15.0 - Math.cos(sw) * 0.5);
    const r = 0.45 * k.s;
    k.pen.beginPath();
    k.pen.moveTo(bx - r, by + r * 0.7);
    k.pen.quadraticCurveTo(bx - r, by - r, bx, by - r);
    k.pen.quadraticCurveTo(bx + r, by - r, bx + r, by + r * 0.7);
    k.pen.closePath();
    k.paint(C.brass, k.thin);
  },
};

// The cage: a floor, corner posts, a roof with the rope's shackle, bars on
// the end the viewer sees.
function cageBody(k: Kit): void {
  const { u0, u1, v0, v1, h } = CAGE;
  const iron = '#4e4846';
  k.box(u0, v0, 0, u1 - u0, v1 - v0, 0.45, iron, { line: k.lw });
  for (const [u, w] of [[u0, v0], [u1 - 0.35, v0]] as const) k.box(u, w, 0.45, 0.35, 0.35, h - 0.45, iron, { line: k.thin, stripe: false });
  // back bars
  if (k.s >= 4) for (let u = u0 + 0.8; u < u1 - 0.5; u += 0.75) k.line([[u, v0 + 0.1, 0.45], [u, v0 + 0.1, h]], shade(iron, -0.2), Math.max(0.8, 0.1 * k.s));
  // the end's bars
  for (let w = v0 + 0.5; w < v1 - 0.2; w += 0.6) k.rod([[u1 - 0.15, w, 0.45], [u1 - 0.15, w, h]], iron, 0.08);
  for (const [u, w] of [[u0, v1 - 0.35], [u1 - 0.35, v1 - 0.35]] as const) k.box(u, w, 0.45, 0.35, 0.35, h - 0.45, iron, { line: k.thin, stripe: false });
  k.box(u0 - 0.2, v0 - 0.2, h, u1 - u0 + 0.4, v1 - v0 + 0.4, 0.5, '#5e5652');
  k.rod([[(u0 + u1) / 2 - 0.7, (v0 + v1) / 2, h + 0.5], [(u0 + u1) / 2 - 0.9, 1.9, h + 1.2], [(u0 + u1) / 2 - 1.1, (v0 + v1) / 2, h + 0.5]], C.iron, 0.12);
  // a band round the middle
  k.line([[u0, v1, h * 0.5], [u1, v1, h * 0.5], [u1, v0, h * 0.5]], iron, Math.max(1, 0.22 * k.s));
}

// The gate across the cage's front: bars shut, or slid aside.
function cageGate(k: Kit, ride: number, open: boolean): void {
  const { u0, u1, v1, h } = CAGE;
  const slide = open ? (u1 - u0) * 0.62 : 0;
  const z0 = 0.5 + ride;
  const z1 = h - 0.3 + ride;
  // the bars in two strokes, ink then iron
  const pen = k.pen;
  pen.beginPath();
  for (let u = u0 + 0.45; u < u1 - 0.3; u += 0.62) {
    const uu = Math.min(u1 - 0.3, u + slide);
    if (open && uu >= u1 - 0.35 && u + slide > u1 - 0.3) continue;
    const [x0, y0] = k.p(uu, v1, z0);
    const [x1, y1] = k.p(uu, v1, z1);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.lineCap = 'round';
  pen.strokeStyle = INK;
  pen.lineWidth = 0.09 * k.s + k.lw * 1.4;
  pen.stroke();
  pen.strokeStyle = '#5e5652';
  pen.lineWidth = 0.09 * k.s;
  pen.stroke();
  for (const z of [z0 + 0.3, z1 - 0.4]) k.rod([[u0 + 0.3 + slide, v1, z], [u1 - 0.3, v1, z]], '#5e5652', 0.12);
}

export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };
