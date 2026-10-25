import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { PropArt, PropView, WorldDef } from '../types.ts';
import { beaker, bubbles, crate, cylinder, erlenmeyer, hazard, mutant, pot, tube } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, hash, kitOf } from './kit.ts';

// The lab's furniture between the stations: trolleys of glassware, gas
// cylinders in a stand, the rat maze, a specimen vat, the teaching
// skeleton, stacks of supply crates and a mutant pot plant. All still
// (drawn once into the scene's static layer), each on its own soft shadow,
// varied by the placement's seed.

// ── a lab trolley ───────────────────────────────────────────────────────────
// Two steel shelves on castors: glassware and a rack of tubes on top, a box
// of gloves and a jug below.
const cart: PropArt = {
  len: 6,
  dep: 4,
  height: 8,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2, 3.2, 2.2, 0.26);
    const legs: Array<[number, number]> = [[0.6, 0.6], [5.1, 0.6], [0.6, 3.1], [5.1, 3.1]];
    for (const [u, w] of legs.slice(0, 2)) k.rod([[u + 0.15, w + 0.15, 0.4], [u + 0.15, w + 0.15, 5.0]], C.chrome, 0.16);
    k.box(0.4, 0.4, 1.0, 5.2, 3.2, 0.25, C.steel, { line: k.lw });
    // the lower shelf: gloves and a jug
    k.box(0.9, 0.8, 1.25, 2.0, 1.4, 1.0, '#6fb0e0', { line: k.thin });
    k.poly([[1.4, 2.21, 1.9], [2.4, 2.21, 1.9], [2.4, 2.21, 2.15], [1.4, 2.21, 2.15]], '#f6f2e6', 0);
    k.lathe(4.1, 1.9, [[1.25, 0.65], [2.3, 0.65], [2.8, 0.35], [3.0, 0.3]], '#e9eeec', k.thin, true);
    k.box(0.4, 0.4, 4.8, 5.2, 3.2, 0.25, C.steel, { line: k.lw });
    // the top: a rack of tubes, flasks and a beaker
    const z = 5.05;
    k.box(0.8, 1.2, z, 2.0, 0.8, 0.2, C.wood, { line: k.thin });
    const tubes = [C.green, C.magenta, C.blue, C.amber];
    for (let i = 0; i < 4; i++) tube(k, 1.05 + i * 0.45, 1.6, z + 0.1, 1.5, tubes[(i + v.seed) % 4], 0.5);
    k.box(0.8, 1.2, z + 0.85, 2.0, 0.8, 0.15, C.wood, { line: k.thin, stripe: false });
    erlenmeyer(k, 3.8, 1.5, z, 2.0, hash(v.seed, 1) < 0.5 ? C.green : C.magenta, 0.4);
    beaker(k, 4.6, 2.8, z, 0.5, 1.2, C.blue, 0.5);
    beaker(k, 2.0, 3.0, z, 0.45, 0.9, null);
    for (const [u, w] of legs.slice(2)) k.rod([[u + 0.15, w + 0.15, 0.4], [u + 0.15, w + 0.15, 5.0]], C.chrome, 0.16);
    k.rod([[5.3, 0.75, 5.0], [5.6, 0.75, 6.0], [5.6, 3.25, 6.0], [5.3, 3.25, 5.0]], C.chrome, 0.12);
    for (const [u, w] of legs) k.dot(u + 0.15, w + 0.15, 0.25, Math.max(1.2, 0.26 * k.s), INK);
  },
};

// ── gas cylinders ───────────────────────────────────────────────────────────
// Three tall cylinders chained in a steel stand: green, blue and black with
// a white shoulder, a regulator gauge on one.
const cylinders: PropArt = {
  len: 6,
  dep: 3,
  height: 11,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 1.5, 3.4, 1.8, 0.28);
    k.box(0.4, 0.3, 0, 5.2, 2.4, 0.4, C.steelDark, { line: k.lw });
    const bodies: Color[] = ['#3f8a5a', '#3a6fb0', '#2f3a40'];
    const n = (v.seed % 3) | 0;
    for (let i = 0; i < 3; i++) cylinder(k, 1.3 + i * 1.7, 1.5, 0.4, 0.75, 8.6 + (i === 1 ? 0.6 : 0), bodies[(i + n) % 3], i === 2 ? '#f2f4f0' : C.chrome);
    // the chain across the front and its posts
    for (const u of [0.5, 5.5]) k.rod([[u, 2.5, 0.4], [u, 2.5, 6.4]], C.steelDark, 0.16);
    const chain: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const f = i / 12;
      chain.push([0.5 + 5 * f, 2.55, 6.0 - Math.sin(f * Math.PI) * 0.5]);
    }
    k.line(chain, INK, Math.max(1.4, 0.16 * k.s + k.lw));
    k.line(chain, C.chrome, Math.max(0.8, 0.16 * k.s));
    // a regulator with its gauge on the middle one
    const [x, y] = k.p(3.0 + 0.6, 1.5 + 0.3, 9.6);
    k.pen.beginPath();
    k.pen.arc(x, y, 0.35 * k.s, 0, Math.PI * 2);
    k.paint('#f6f1e2', k.thin);
    k.pen.beginPath();
    k.pen.moveTo(x, y);
    k.pen.lineTo(x + 0.2 * k.s, y - 0.2 * k.s);
    k.pen.strokeStyle = C.red;
    k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    k.pen.stroke();
  },
};

// ── the rat maze ────────────────────────────────────────────────────────────
// A low table holding a plywood maze: thin walls on a grid with a few
// turns, a wedge of cheese at the heart, a clipboard of results beside it.
// Even rows and columns of MAZE are wall lines, odd ones the runs between.
const MAZE = [
  '#############',
  '#.....#.....#',
  '#.###.#.###.#',
  '#.#...#...#.#',
  '#.#.#####.#.#',
  '#...#...#...#',
  '###.#.#.#.###',
  '#.....#.....#',
  '######.######',
];
const maze: PropArt = {
  len: 9,
  dep: 7,
  height: 5,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(4.5, 3.5, 4.8, 3.6, 0.26);
    for (const [u, w] of [[0.8, 0.8], [7.8, 0.8], [0.8, 5.8], [7.8, 5.8]] as const) k.box(u, w, 0, 0.4, 0.4, 2.4, C.steelDark, { line: k.thin });
    k.box(0.4, 0.4, 2.4, 8.2, 6.2, 0.4, '#d8c49a');
    const z = 2.8;
    const T = 0.22;
    const R = 1.0;
    const at = (i: number) => Math.floor(i / 2) * (T + R) + (i % 2 ? T : 0);
    const size = (i: number) => (i % 2 ? R : T);
    const u0 = 0.75;
    const v0 = 0.75;
    const cols = MAZE[0].length;
    const rows = MAZE.length;
    k.poly([[u0, v0, z + 0.01], [u0 + at(cols), v0, z + 0.01], [u0 + at(cols), v0 + at(rows), z + 0.01], [u0, v0 + at(rows), z + 0.01]], '#efe2bf', 0);
    // walls: runs along the even rows, short pieces down the odd ones
    const walls: Array<[number, number, number, number]> = [];
    MAZE.forEach((row, r) => {
      if (r % 2 === 0) {
        for (let c = 0; c < cols; c++) {
          if (row[c] !== '#') continue;
          let e = c;
          while (e + 1 < cols && row[e + 1] === '#') e++;
          walls.push([u0 + at(c), v0 + at(r), at(e) + size(e) - at(c), T]);
          c = e;
        }
      } else for (let c = 0; c < cols; c += 2) if (row[c] === '#') walls.push([u0 + at(c), v0 + at(r), T, R]);
    });
    walls.sort((a, b) => a[0] + a[2] + a[1] + a[3] - (b[0] + b[2] + b[1] + b[3]));
    for (const [u, w, du, dv] of walls) k.box(u, w, z, du, dv, 0.65, '#c99a62', { line: Math.max(0.8, k.thin * 0.7), stripe: false, top: '#e8c48c' });
    // the cheese at the heart
    const cu = u0 + at(6) + T / 2;
    const cv = v0 + at(5) + R / 2;
    k.poly([[cu - 0.3, cv - 0.2, z + 0.02], [cu + 0.3, cv - 0.2, z + 0.02], [cu + 0.3, cv + 0.2, z + 0.02], [cu + 0.3, cv + 0.2, z + 0.35], [cu - 0.3, cv - 0.2, z + 0.35]], '#f2c230', k.thin);
    // a clipboard on the table's corner
    k.poly([[7.0, 5.6, 2.82], [8.3, 5.6, 2.82], [8.3, 6.5, 2.82], [7.0, 6.5, 2.82]], C.woodDark, k.thin);
    k.poly([[7.15, 5.7, 2.84], [8.15, 5.7, 2.84], [8.15, 6.4, 2.84], [7.15, 6.4, 2.84]], C.paper, 0);
  },
};

// ── a specimen vat ──────────────────────────────────────────────────────────
// A tall glass vat of glowing green on a steel plinth, something with one
// big eye and curling arms asleep in it, cables up and out of its lid.
const vat: PropArt = {
  len: 5,
  dep: 5,
  height: 14,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2.5;
    k.pool(c, c, 3.6, 3.6, C.greenGlow, 0.3);
    k.shadow(c, c, 2.2, 2.2, 0.3);
    k.cyl(c, c, 0, 1.9, 1.0, C.steelDark);
    k.cyl(c, c, 1.0, 1.75, 0.7, C.iron);
    for (let i = 0; i < 3; i++) k.dot(c - 0.6 + i * 0.6, c + 1.8, 0.5, Math.max(1, 0.13 * k.s), [C.green, C.amber, C.red][i]);
    const z0 = 1.7;
    const z1 = 11.6;
    k.glass(c, c, [[z0, 1.5], [z1, 1.5]], '#8fe85a', 0.88);
    k.halo(c, c + 0.5, 6.5, 4.2, C.greenGlow, 0.35);
    creature(k, c, c, 6.4, v.seed);
    bubbles(k, c, c + 0.8, z0 + 0.4, z1 - 1.5, 2.0, 0.37 + hash(v.seed, 1) * 3, 10, v.seed, '#ffffffb0', 1);
    k.cyl(c, c, z1, 1.65, 0.8, C.steelDark);
    k.cyl(c, c, z1 + 0.8, 0.9, 0.4, C.iron, { line: k.thin });
    k.rod([[c - 0.3, c, z1 + 1.2], [c - 0.5, c - 0.3, z1 + 2.0], [c - 1.4, c - 1.4, z1 + 2.2]], '#2a3034', 0.2);
    k.rod([[c + 0.3, c, z1 + 1.2], [c + 0.6, c - 0.4, z1 + 1.8], [c + 0.2, c - 1.8, z1 + 2.1]], '#c0504a', 0.16);
  },
};

// The vat's sleeper: a round body, one big closed eye, arms curling down.
function creature(k: Kit, u: number, v: number, z: number, seed: number): void {
  const [x, y] = k.p(u, v, z);
  const R = 0.95 * k.s;
  const pen = k.pen;
  const body = hash(seed, 2) < 0.5 ? '#c98ad8' : '#e8a07a';
  for (let i = 0; i < 4; i++) {
    const sx = (i - 1.5) * 0.45;
    pen.beginPath();
    pen.moveTo(x + sx * R, y + R * 0.6);
    pen.bezierCurveTo(x + sx * R * 1.6, y + R * 1.4, x + sx * R * 0.4, y + R * 2.0, x + sx * R * 1.3, y + R * 2.6);
    pen.strokeStyle = INK;
    pen.lineWidth = R * 0.3 + k.thin;
    pen.lineCap = 'round';
    pen.stroke();
    pen.strokeStyle = body;
    pen.lineWidth = R * 0.3;
    pen.stroke();
  }
  pen.beginPath();
  pen.ellipse(x, y, R, R * 0.9, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - R * 0.35, y - R * 0.4, 0, x, y, R * 1.1);
  g.addColorStop(0, shade(body, 0.35));
  g.addColorStop(1, shade(body, -0.15));
  k.paint(g, k.thin);
  // a sleeping eye: a lid's curve and lashes
  pen.beginPath();
  pen.ellipse(x, y + R * 0.05, R * 0.45, R * 0.3, 0, 0.1, Math.PI - 0.1);
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, R * 0.1);
  pen.stroke();
  pen.beginPath();
  for (const a of [0.6, 1.57, 2.5]) {
    const ex = x + Math.cos(a) * R * 0.45;
    const ey = y + R * 0.05 + Math.sin(a) * R * 0.3;
    pen.moveTo(ex, ey);
    pen.lineTo(ex + Math.cos(a) * R * 0.15, ey + Math.sin(a) * R * 0.15);
  }
  pen.stroke();
}

// ── the teaching skeleton ───────────────────────────────────────────────────
// A cartoon skeleton hung on a stand with castors, one arm raised in a wave.
const skeleton: PropArt = {
  len: 4,
  dep: 4,
  height: 15,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 1.7, 1.7, 0.26);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      k.rod([[c, c, 0.5], [c + Math.cos(a) * 1.4, c + Math.sin(a) * 1.4, 0.25]], C.steelDark, 0.16);
      k.dot(c + Math.cos(a) * 1.4, c + Math.sin(a) * 1.4, 0.15, Math.max(1, 0.2 * k.s), INK);
    }
    k.rod([[c - 0.3, c - 0.3, 0.5], [c - 0.3, c - 0.3, 14.2], [c, c, 14.4]], C.steel, 0.14);
    const bone = C.bone;
    const B = (pts: P3[], w: number) => k.rod(pts, bone, w);
    const z = 1.2;
    // legs, pelvis
    B([[c - 0.45, c, z + 6.2], [c - 0.55, c + 0.1, z + 3.3], [c - 0.5, c + 0.15, z + 0.3]], 0.22);
    B([[c + 0.45, c, z + 6.2], [c + 0.55, c + 0.1, z + 3.3], [c + 0.6, c + 0.2, z + 0.3]], 0.22);
    for (const du of [-0.5, 0.6]) k.box(c + du - 0.3, c - 0.1, z, 0.6, 0.7, 0.3, bone, { line: k.thin, stripe: false });
    k.poly([[c - 0.9, c, z + 6.0], [c + 0.9, c, z + 6.0], [c + 0.7, c, z + 7.0], [c - 0.7, c, z + 7.0]], bone, k.lw, 0.2);
    // the spine and ribs
    B([[c, c - 0.05, z + 6.8], [c, c - 0.1, z + 11.0]], 0.18);
    const pen = k.pen;
    for (let i = 0; i < 4; i++) {
      const zz = z + 8.2 + i * 0.65;
      const w = 0.95 - Math.abs(i - 1.5) * 0.12;
      const pts: P3[] = [];
      for (let j = 0; j <= 10; j++) {
        const a = Math.PI * (j / 10);
        pts.push([c + Math.cos(a) * w, c + Math.sin(a) * 0.55, zz - Math.sin(a) * 0.25]);
      }
      k.line(pts, INK, Math.max(1.2, 0.14 * k.s + k.lw));
      k.line(pts, bone, Math.max(0.7, 0.14 * k.s));
    }
    void pen;
    // arms: one hanging, one raised in a wave
    B([[c - 0.95, c, z + 10.9], [c - 1.25, c + 0.1, z + 8.8], [c - 1.15, c + 0.3, z + 6.9]], 0.16);
    B([[c + 0.95, c, z + 10.9], [c + 1.5, c + 0.2, z + 12.0], [c + 1.3, c + 0.3, z + 13.6]], 0.16);
    k.line([[c - 1.0, c, z + 11.0], [c + 1.0, c, z + 11.0]], INK, Math.max(1.4, 0.16 * k.s + k.lw));
    k.line([[c - 1.0, c, z + 11.0], [c + 1.0, c, z + 11.0]], bone, Math.max(0.8, 0.16 * k.s));
    for (const [hu, hz] of [[c - 1.15, z + 6.7], [c + 1.3, z + 13.8]] as const) k.dot(hu, c + 0.3, hz, Math.max(1.2, 0.22 * k.s), bone, k.thin);
    // the skull
    const [x, y] = k.p(c, c + 0.1, z + 12.3);
    const R = 0.8 * k.s;
    pen.beginPath();
    pen.ellipse(x, y - R * 0.15, R * 0.9, R * 0.85, 0, Math.PI * 0.95, Math.PI * 2.05);
    pen.lineTo(x + R * 0.55, y + R * 0.7);
    pen.lineTo(x - R * 0.55, y + R * 0.7);
    pen.closePath();
    k.paint(bone, k.lw);
    for (const sx of [-1, 1]) {
      pen.beginPath();
      pen.ellipse(x + sx * R * 0.35, y, R * 0.22, R * 0.26, 0, 0, Math.PI * 2);
      pen.fillStyle = INK;
      pen.fill();
    }
    pen.beginPath();
    pen.moveTo(x - R * 0.35, y + R * 0.45);
    pen.quadraticCurveTo(x, y + R * 0.62, x + R * 0.35, y + R * 0.45);
    pen.strokeStyle = INK;
    pen.lineWidth = Math.max(0.7, R * 0.08);
    pen.stroke();
  },
};

// ── supply crates ───────────────────────────────────────────────────────────
// Slatted crates stacked two high and a yellow drum with a trefoil on it.
const crates: PropArt = {
  len: 6,
  dep: 5,
  height: 6,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(3, 2.5, 3.4, 2.8, 0.28);
    crate(k, 0.4, 0.4, 0, 2.8, 2.4, 2.3);
    crate(k, 0.7, 0.6, 2.3, 2.2, 2.0, 1.8, shade(C.wood, 0.06), hash(v.seed, 1) < 0.5);
    // the drum
    k.shadow(4.4, 2.3, 1.5, 1.4, 0.24);
    k.cyl(4.4, 2.3, 0, 1.15, 3.2, C.hazard);
    for (const z of [0.9, 2.2]) {
      const e = k.ell(4.4, 2.3, z, 1.15);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI);
      k.pen.strokeStyle = shade(C.hazard, -0.35);
      k.pen.lineWidth = Math.max(0.8, 0.12 * k.s);
      k.pen.stroke();
    }
    k.disc(4.4, 2.3, 3.2, 0.25, C.iron, k.thin);
    const [x, y] = k.p(4.4 + 0.75, 2.3 + 0.75, 1.55);
    for (let j = 0; j < 3; j++) {
      const a0 = -Math.PI / 2 + (j * Math.PI * 2) / 3 - 0.5;
      k.pen.beginPath();
      k.pen.arc(x, y, 0.5 * k.s, a0, a0 + 1);
      k.pen.arc(x, y, 0.16 * k.s, a0 + 1, a0, true);
      k.pen.closePath();
      k.pen.fillStyle = C.hazardInk;
      k.pen.fill();
    }
    // a small box on the floor before them
    crate(k, 1.2, 3.2, 0, 1.6, 1.3, 1.2, '#c9a066', false);
  },
};

// ── a mutant pot plant ──────────────────────────────────────────────────────
const plant: PropArt = {
  len: 4,
  dep: 4,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const c = 2;
    k.shadow(c, c, 1.7, 1.7, 0.28);
    pot(k, c, c, 0, 1.3, 2.3, hash(v.seed, 1) < 0.5 ? C.terracotta : '#3aa597');
    mutant(k, c, c, 2.2, 1.0, v.seed, hash(v.seed, 2) < 0.5 ? C.greenGlow : '#ff9ae0');
  },
};

// ── a hazard mat ────────────────────────────────────────────────────────────
// A low step stool on a striped mat (somewhere to stand to reach the top
// shelves), a fire bucket beside it.
const step: PropArt = {
  len: 5,
  dep: 4,
  height: 4,
  draw(v: PropView): void {
    const k = kitOf(v);
    hazard(k, [[0.2, 0.2, 0.03], [4.8, 0.2, 0.03], [4.8, 3.8, 0.03], [0.2, 3.8, 0.03]], 0.5);
    k.shadow(2, 2, 1.6, 1.4, 0.26);
    k.box(0.9, 1.0, 0, 2.2, 2.0, 1.4, '#2f6fb0', { round: 0.1 });
    k.box(0.9, 1.0, 1.4, 2.2, 1.0, 1.3, '#2f6fb0', { round: 0.1 });
    k.shadow(4.0, 2.6, 0.8, 0.8, 0.24);
    k.lathe(4.0, 2.6, [[0, 0.5], [1.4, 0.65], [1.45, 0.7]], C.red, k.lw, true);
    k.disc(4.0, 2.6, 1.3, 0.55, '#e8d9a8', 0);
    void v;
  },
};

// Interleaved so the first few fit in any room.
export const DECOR: NonNullable<WorldDef['decor']> = [
  { art: cart, count: 1, place: 'floor' },
  { art: plant, count: 1, place: 'floor' },
  { art: maze, count: 1, place: 'floor' },
  { art: cylinders, count: 1, place: 'floor' },
  { art: crates, count: 1, place: 'floor' },
  { art: vat, count: 1, place: 'floor' },
  { art: skeleton, count: 1, place: 'floor' },
  { art: cart, count: 1, place: 'floor' },
  { art: step, count: 1, place: 'floor' },
  { art: plant, count: 1, place: 'floor' },
  // only big rooms have the floor for these
  { art: crates, count: 1, place: 'floor' },
  { art: vat, count: 1, place: 'floor' },
  { art: cart, count: 1, place: 'floor' },
  { art: plant, count: 2, place: 'floor' },
];

export const DECOR_ART = { cart, cylinders, maze, vat, skeleton, crates, plant, step };
