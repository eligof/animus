import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { Color } from '../../art/types.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { ball, barrel, crate, fillPts, frustum, hull, ring, sack, sprout } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Frontier Colony's workstation (see WorkstationArt in ../types.ts): a plank work table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Three planks on a pair of trestles, a stretcher between them. At the
// right back a slate in a wooden frame leans on a little easel, a stick
// of chalk on its ledge (the corner behind it kept clear for a desk
// upgrade). Under the table, by look: a bucket of water, a sack of grain
// or a small crate.
//
// Its clutter (a few a desk, see clutterOf), what a frontier homestead's
// table gathers, on a row of spots along its front: a tin mug, a blue
// enamel coffee pot, two apples, a horseshoe on a block, a jar of jam
// with a checked cloth over it, a basket of eggs, a jar of wildflowers,
// a whittled bird, a seed pouch, a rolled map, a little oil lamp (lit
// while the desk is worked) and a cutting of a glowing purple plant from
// the hills in a jar of water. Its loop: at the right end a toy wind pump
// whose wheel turns while the desk is worked.

const ZT = 5.4; // the table's top
// The slate, leaning back on its easel: its foot at v0, its head at v1.
const SLATE = { u0: 2.95, u1: 6.0, v0: 1.45, v1: 0.95, z0: 6.9, z1: 9.5 };

// A point on the slate's plane: fu across from its left edge, fz up from
// its foot (outside 0..1 for its frame).
function onSlate(fu: number, fz: number): P3 {
  const s = SLATE;
  return [s.u0 + (s.u1 - s.u0) * fu, s.v0 + (s.v1 - s.v0) * fz, s.z0 + (s.z1 - s.z0) * fz];
}

// ── on the top: the clutter and the loop ────────────────────────────────────

// Where a thing may stand: a row along the front of the top, before the
// slate's ledge, from past the agent to short of the right end.
const SPOTS: readonly P3[] = [
  [2.85, 2.15, ZT],
  [3.86, 2.25, ZT],
  [4.87, 2.25, ZT],
  [5.88, 2.25, ZT],
];

// The ink of a small thing: its outline (`edge`, two thirds of the kit's
// thin line) and its inner lines (`hair`), so a thing under a unit across
// does not drown in ink.
const edge = (k: Kit) => Math.max(0.8, k.thin * 0.65);
const hair = (k: Kit) => Math.max(0.6, k.thin * 0.4);

// A thin rod for a small thing (a handle, a stick): ink under colour, w
// units.
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + hair(k) * 2);
  k.line(pts, color, w * k.s);
}

// An upright round body turned on a lathe: rings of radius r at heights z
// over (u, w), filled as one silhouette, shaded across.
function turned(k: Kit, u: number, w: number, prof: ReadonlyArray<readonly [number, number]>, base: Color, line = edge(k)): Pt[] {
  const pts = prof.flatMap(([z, r]) => ring(k, [u, w, z], [0, 0, 1], Math.max(r, 0.001), 18));
  const sil = hull(pts);
  const xs = sil.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, 0.08));
  g.addColorStop(0.3, shade(base, 0.16));
  g.addColorStop(0.65, base);
  g.addColorStop(1, shade(base, -0.26));
  fillPts(k, sil, g, line);
  return sil;
}

// A leaf for a small thing: from screen point (x, y) toward angle a, L
// units long and w wide, inked thinly.
function leafOf(k: Kit, x: number, y: number, a: number, L: number, w: number, fill: Color): void {
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const P = (s: number, t: number): [number, number] => [x + (ca * s - sa * t) * k.s, y + (sa * s + ca * t) * k.s];
  const pen = k.pen;
  pen.beginPath();
  pen.moveTo(...P(0, 0));
  pen.bezierCurveTo(...P(L * 0.3, -w), ...P(L * 0.8, -w * 0.8), ...P(L, 0));
  pen.bezierCurveTo(...P(L * 0.8, w * 0.8), ...P(L * 0.3, w), ...P(0, 0));
  pen.closePath();
  k.paint(fill, hair(k));
}

// A tin mug, its handle toward -u, coffee in it.
const tinMug: Clutter = {
  name: 'tinMug',
  r: 0.4,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    stick(k, [[u - 0.26, w, z + 0.5], [u - 0.42, w + 0.02, z + 0.36], [u - 0.26, w, z + 0.16]], C.steel, 0.07);
    k.cyl(u, w, z, 0.28, 0.6, C.steel, { line: edge(k), top: shade(C.steelDark, -0.1) });
    k.disc(u, w, z + 0.59, 0.21, '#5a3a22', 0);
    k.line([[u - 0.13, w + 0.21, z + 0.08], [u - 0.13, w + 0.21, z + 0.5]], withAlpha('#ffffff', 0.45), Math.max(0.7, 0.05 * k.s));
  },
};

// A blue enamel coffee pot, speckled white: a wide foot narrowing to a
// domed lid with a knob, a long spout toward +u and a handle toward -u.
const coffeePot: Clutter = {
  name: 'coffeePot',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const blue = '#3f6a9a';
    const dark = '#2f4f74';
    stick(k, [[u - 0.18, w, z + 0.6], [u - 0.38, w, z + 0.55], [u - 0.38, w, z + 0.22], [u - 0.24, w, z + 0.14]], dark, 0.08);
    // the spout, from low on the body up and out
    k.poly([[u + 0.16, w, z + 0.12], [u + 0.18, w, z + 0.34], [u + 0.36, w, z + 0.64], [u + 0.43, w, z + 0.6], [u + 0.29, w, z + 0.12]], blue, edge(k));
    turned(k, u, w, [[z, 0.3], [z + 0.08, 0.3], [z + 0.56, 0.2], [z + 0.62, 0.19]], blue);
    // the lid: a low dome with a knob
    turned(k, u, w, [[z + 0.6, 0.19], [z + 0.68, 0.16], [z + 0.74, 0.08], [z + 0.76, 0.001]], shade(blue, 0.15));
    ball(k, u, w, z + 0.8, 0.06, dark, hair(k));
    if (k.s >= 5) {
      const dots: P3[] = [[u - 0.1, w + 0.25, z + 0.18], [u + 0.12, w + 0.22, z + 0.34], [u - 0.04, w + 0.2, z + 0.46], [u + 0.2, w + 0.17, z + 0.12], [u - 0.22, w + 0.12, z + 0.32], [u + 0.04, w + 0.24, z + 0.08]];
      for (const [a, b, c] of dots) {
        const [x, y] = k.p(a, b, c);
        k.pen.beginPath();
        k.pen.arc(x, y, Math.max(0.5, 0.025 * k.s), 0, Math.PI * 2);
        k.pen.fillStyle = withAlpha(C.white, 0.85);
        k.pen.fill();
      }
    }
  },
};

// Two red apples, a leaf on one.
const apples: Clutter = {
  name: 'apples',
  r: 0.4,
  h: 0.55,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    for (const [du, dv, c] of [[-0.15, 0.12, '#c8402e'], [0.15, -0.12, '#d65038']] as const) {
      ball(k, u + du, w + dv, z + 0.22, 0.22, c, edge(k));
      stick(k, [[u + du, w + dv, z + 0.42], [u + du + 0.03, w + dv, z + 0.52]], C.bark, 0.03);
    }
    const [x, y] = k.p(u + 0.18, w - 0.12, z + 0.49);
    leafOf(k, x, y, -0.5, 0.26, 0.09, C.leaf);
  },
};

// A horseshoe standing open end up on a little block, for luck, its nail
// holes along it.
const horseshoe: Clutter = {
  name: 'horseshoe',
  r: 0.4,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.box(u - 0.3, w - 0.14, z, 0.6, 0.28, 0.14, C.plankDark, { line: edge(k), stripe: false });
    const n = w;
    const zc = z + 0.5;
    const outer: P3[] = [];
    const inner: P3[] = [];
    // round through the bottom, open at the top
    const arcA = (f: number) => Math.PI * (0.78 + 1.44 * f);
    for (let i = 0; i <= 14; i++) {
      const a = arcA(i / 14);
      outer.push([u + Math.cos(a) * 0.3, n, zc + Math.sin(a) * 0.33]);
      inner.push([u + Math.cos(a) * 0.15, n, zc + Math.sin(a) * 0.18]);
    }
    k.poly([...outer, ...inner.reverse()], k.lgrad([u - 0.3, n, z], [u + 0.3, n, z], [0, 0, 1], [[0, '#d4dade'], [0.55, C.steel], [1, C.steelDark]]), edge(k));
    if (k.s >= 5) {
      for (let i = 1; i < 6; i++) {
        const a = arcA(i / 6);
        const [x, y] = k.p(u + Math.cos(a) * 0.225, n, zc + Math.sin(a) * 0.255);
        k.pen.beginPath();
        k.pen.arc(x, y, Math.max(0.5, 0.025 * k.s), 0, Math.PI * 2);
        k.pen.fillStyle = INK;
        k.pen.fill();
      }
    }
  },
};

// A jar of jam, dark red through the glass, a red-checked cloth tied over
// its lid with string.
const jamJar: Clutter = {
  name: 'jamJar',
  r: 0.4,
  h: 0.75,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.25, 0.52, '#8a2a3a', { line: edge(k), top: '#a8384a' });
    k.line([[u - 0.12, w + 0.18, z + 0.08], [u - 0.12, w + 0.18, z + 0.42]], withAlpha('#ffffff', 0.45), Math.max(0.7, 0.05 * k.s));
    // the cloth: a puffed cap over the lid, skirts hanging down
    const cloth = turned(k, u, w, [[z + 0.4, 0.3], [z + 0.52, 0.29], [z + 0.62, 0.22], [z + 0.66, 0.12]], C.white, edge(k));
    const xs = cloth.map((p) => p[0]);
    const ys = cloth.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const y0 = Math.min(...ys);
    const y1 = Math.max(...ys);
    const pen = k.pen;
    pen.save();
    fillPts(k, cloth, null, 0);
    pen.clip();
    const step = Math.max(2, 0.1 * k.s);
    pen.fillStyle = withAlpha(C.cloth, 0.85);
    for (let x = x0; x < x1; x += step * 2) pen.fillRect(x, y0, step, y1 - y0);
    pen.fillStyle = withAlpha(C.cloth, 0.45);
    for (let y = y0; y < y1; y += step * 2) pen.fillRect(x0, y, x1 - x0, step);
    pen.restore();
    fillPts(k, cloth, null, edge(k));
    const e = k.ell(u, w, z + 0.48, 0.27);
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
    pen.strokeStyle = '#c8a46a';
    pen.lineWidth = Math.max(0.8, 0.05 * k.s);
    pen.stroke();
  },
};

// A wicker basket of eggs, its handle arched over them.
const eggBasket: Clutter = {
  name: 'eggBasket',
  r: 0.4,
  h: 0.8,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const wicker = '#c8964e';
    const zr = z + 0.36;
    frustum(k, u, w, z, zr, 0.27, 0.36, wicker, shade(wicker, -0.35));
    if (k.s >= 5) {
      for (const dz of [0.1, 0.2]) {
        const e = k.ell(u, w, z + dz, 0.27 + dz * 0.25);
        k.pen.beginPath();
        k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
        k.pen.strokeStyle = shade(wicker, -0.35);
        k.pen.lineWidth = hair(k);
        k.pen.stroke();
      }
    }
    // the handle, from rim to rim over the middle
    const arch: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const a = (i / 12) * Math.PI;
      arch.push([u + Math.cos(a) * 0.33, w, zr + Math.sin(a) * 0.4]);
    }
    stick(k, arch, wicker, 0.055);
    // the eggs, sitting in it, then the near rim over them
    for (const [du, dv, dz, c] of [[-0.13, -0.07, 0.08, '#fbf4e6'], [0.13, -0.05, 0.09, '#f2e2c4'], [0.0, 0.1, 0.06, '#fbf4e6']] as const) {
      const [x, y] = k.p(u + du, w + dv, zr + dz);
      k.pen.beginPath();
      k.pen.ellipse(x, y, 0.12 * k.s, 0.15 * k.s, 0, 0, Math.PI * 2);
      k.paint(c, hair(k));
    }
    const e = k.ell(u, w, zr, 0.36);
    const rim = Math.max(1, 0.08 * k.s);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = rim + hair(k) * 2;
    k.pen.stroke();
    k.pen.strokeStyle = shade(wicker, 0.1);
    k.pen.lineWidth = rim;
    k.pen.stroke();
  },
};

// A jar of wildflowers: a sprig of leaves and three blooms.
const wildflowers: Clutter = {
  name: 'wildflowers',
  r: 0.4,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.24, 0.55, '#cfe6e0', { line: edge(k), top: '#9ac8c0' });
    sprout(k, u, w, z + 0.52, 0.6, 7);
    for (const [du, dz, c] of [[-0.18, 0.95, C.white], [0.04, 1.07, '#e8c040'], [0.2, 0.9, '#d06a9a']] as const) ball(k, u + du, w, z + dz, 0.12, c, hair(k));
  },
};

// A whittled bird on a little block, its head turned.
const whittledBird: Clutter = {
  name: 'whittledBird',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.box(u - 0.28, w - 0.2, z, 0.56, 0.4, 0.16, C.plankDark, { line: edge(k), stripe: false });
    bird(k, u + 0.06, w + 0.06, z + 0.16, 0.6, edge(k));
  },
};

// A cloth pouch of seeds tied at the neck with red string, a few seeds
// spilt before it.
const seedPouch: Clutter = {
  name: 'seedPouch',
  r: 0.4,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const cloth = '#cdb487';
    const e0 = k.ell(u, w, z + 0.12, 0.3);
    const e1 = k.ell(u, w, z + 0.48, 0.12);
    const pen = k.pen;
    pen.beginPath();
    pen.moveTo(e0.cx - e0.rx, e0.cy);
    pen.bezierCurveTo(e0.cx - e0.rx * 1.15, (e0.cy + e1.cy) / 2, e1.cx - e1.rx * 1.1, e1.cy + (e0.cy - e1.cy) * 0.25, e1.cx - e1.rx, e1.cy);
    pen.lineTo(e1.cx + e1.rx, e1.cy);
    pen.bezierCurveTo(e1.cx + e1.rx * 1.1, e1.cy + (e0.cy - e1.cy) * 0.25, e0.cx + e0.rx * 1.15, (e0.cy + e1.cy) / 2, e0.cx + e0.rx, e0.cy);
    pen.ellipse(e0.cx, e0.cy, e0.rx, e0.ry, 0, 0, Math.PI);
    pen.closePath();
    const g = pen.createLinearGradient(e0.cx - e0.rx, 0, e0.cx + e0.rx, 0);
    g.addColorStop(0, shade(cloth, 0.12));
    g.addColorStop(0.6, cloth);
    g.addColorStop(1, shade(cloth, -0.25));
    k.paint(g, edge(k));
    // the frill above the string, the string
    const [nx, ny] = k.p(u, w, z + 0.56);
    pen.beginPath();
    pen.ellipse(nx, ny, e1.rx * 1.25, e1.rx * 0.6, 0, 0, Math.PI * 2);
    k.paint(shade(cloth, 0.1), hair(k));
    k.line([[u - 0.13, w, z + 0.48], [u + 0.13, w, z + 0.48]], C.cloth, Math.max(1, 0.07 * k.s));
    // a patch of green on its front: what grows from it
    k.poly([[u - 0.08, w + 0.27, z + 0.16], [u + 0.1, w + 0.25, z + 0.16], [u + 0.1, w + 0.25, z + 0.32], [u - 0.08, w + 0.27, z + 0.32]], C.green, 0);
    for (const [du, dv] of [[0.24, 0.28], [0.3, 0.18], [0.16, 0.34]] as const) {
      const [x, y] = k.p(u + du, w + dv, z + 0.01);
      pen.beginPath();
      pen.ellipse(x, y, Math.max(0.7, 0.04 * k.s), Math.max(0.5, 0.025 * k.s), 0, 0, Math.PI * 2);
      pen.fillStyle = '#7a5a35';
      pen.fill();
    }
  },
};

// A map rolled up and tied with red string, lying along u.
const rolledMap: Clutter = {
  name: 'rolledMap',
  r: 0.4,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.14;
    const a: P3 = [u - 0.27, w + 0.06, z + r];
    const b: P3 = [u + 0.37, w - 0.04, z + r];
    k.line([a, b], INK, (2 * r) * k.s * 1.22 + edge(k) * 2);
    k.line([a, b], C.paper, (2 * r) * k.s * 1.22);
    k.line([[a[0], a[1], a[2] - r * 0.3], [b[0], b[1], b[2] - r * 0.3]], shade(C.paper, -0.18), r * k.s * 0.6);
    // its rolled end, toward the viewer in either frame (+u or +v): a spiral
    for (const end of [a, b]) {
      const [x, y] = k.p(...end);
      k.pen.beginPath();
      k.pen.arc(x, y, r * k.s * 0.55, 0, Math.PI * 1.6);
      k.pen.strokeStyle = withAlpha('#8a7a5a', 0.9);
      k.pen.lineWidth = hair(k);
      k.pen.stroke();
    }
    const [mx, my] = k.p(u + 0.05, w + 0.01, z + r);
    k.pen.beginPath();
    k.pen.moveTo(mx, my - r * k.s * 1.2);
    k.pen.lineTo(mx, my + r * k.s * 1.2);
    k.pen.strokeStyle = C.cloth;
    k.pen.lineWidth = Math.max(1, 0.08 * k.s);
    k.pen.stroke();
  },
};

// A little oil lamp: a brass foot and font, a glass chimney, a cap; lit
// while the desk is worked, its flame and a soft glow in the glass.
const lamp: Clutter = {
  name: 'oilLamp',
  r: 0.4,
  h: 1.35,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const brass = '#b8863a';
    const lit = v.active;
    turned(k, u, w, [[z, 0.3], [z + 0.08, 0.3], [z + 0.12, 0.12], [z + 0.3, 0.1], [z + 0.36, 0.26], [z + 0.52, 0.27], [z + 0.62, 0.1]], brass);
    if (lit) k.halo(u, w, z + 0.95, 0.6, '#ffcf7a', 0.5);
    const [cx, cy] = k.p(u, w, z + 0.92);
    const rx = 0.2 * k.s;
    const ry = 0.32 * k.s;
    const pen = k.pen;
    pen.beginPath();
    pen.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    if (lit) {
      const g = pen.createRadialGradient(cx, cy + ry * 0.2, 0, cx, cy, ry);
      g.addColorStop(0, '#fffbe0');
      g.addColorStop(0.5, '#ffe08a');
      g.addColorStop(1, '#f0b050');
      k.paint(g, edge(k));
      pen.beginPath();
      pen.ellipse(cx, cy + ry * 0.25, rx * 0.25, ry * 0.4, 0, 0, Math.PI * 2);
      pen.fillStyle = C.flameHot;
      pen.fill();
    } else k.paint('#d8ccb0', edge(k));
    k.cyl(u, w, z + 1.2, 0.09, 0.12, '#d8ccb0', { line: hair(k) * 1.4 });
  },
};

// A cutting from the hills in a jar of water: a purple plant that glows
// a little, faintly more while the desk is worked.
const cutting: Clutter = {
  name: 'cutting',
  r: 0.4,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.24, 0.5, '#bfe0e8', { line: edge(k), top: '#9ccbd8' });
    k.line([[u - 0.11, w + 0.17, z + 0.08], [u - 0.11, w + 0.17, z + 0.4]], withAlpha('#ffffff', 0.5), Math.max(0.7, 0.05 * k.s));
    stick(k, [[u, w, z + 0.5], [u + 0.04, w, z + 0.9]], '#5a3a6a', 0.04);
    k.halo(u + 0.04, w, z + 0.92, 0.35, C.grow, v.active ? 0.5 : 0.25);
    const [x, y] = k.p(u + 0.04, w, z + 0.86);
    for (const [a, L] of [[-2.75, 0.3], [-0.4, 0.3], [-2.2, 0.38], [-0.95, 0.38], [-1.57, 0.42]] as const) leafOf(k, x, y, a, L, L * 0.36, a === -1.57 ? shade(C.grow, 0.25) : C.grow);
  },
};

const CLUTTER: readonly Clutter[] = [tinMug, coffeePot, apples, horseshoe, jamJar, eggBasket, wildflowers, whittledBird, seedPouch, rolledMap, lamp, cutting];

// A toy wind pump at the table's right end: a wooden tower narrowing to a
// little platform, a wheel of eight red and cream blades on it, a tail
// vane behind. While the desk is worked the wheel turns, a quarter turn a
// loop (the blades take turns in two colours: seamless).
const PUMP_AT: P3 = [6.55, 1.9, ZT];
const WINDPUMP: DeskLoop = {
  name: 'windPump',
  at: PUMP_AT,
  r: 0.3,
  h: 1.75,
  frames: 6,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = PUMP_AT;
    const t = v.active ? i / 6 : 0;
    const wood = C.plank;
    // the tower: four legs, two braces
    const legs: Array<[number, number]> = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    const top = z + 1.15;
    for (const [a, b] of legs) stick(k, [[u + a * 0.24, w + b * 0.24, z], [u + a * 0.06, w + b * 0.06, top]], wood, 0.04);
    for (const f of [0.35, 0.7]) {
      const rr = 0.24 - 0.18 * f;
      const zz = z + (top - z) * f;
      stick(k, [[u - rr, w + rr, zz], [u + rr, w + rr, zz], [u + rr, w - rr, zz]], wood, 0.03);
    }
    k.box(u - 0.1, w - 0.1, top, 0.2, 0.2, 0.06, C.plankDark, { line: hair(k), stripe: false });
    // the head turned a little off the viewer, so its vane shows
    const face = Math.PI / 4 + 0.45;
    const d: P3 = [Math.cos(face), Math.sin(face), 0];
    const ax: P3 = [-d[1], d[0], 0];
    const c: P3 = [u + d[0] * 0.08, w + d[1] * 0.08, top + 0.3];
    // the vane, behind
    const tail = (f: number, dz: number): P3 => [c[0] - d[0] * f, c[1] - d[1] * f, c[2] + dz];
    stick(k, [tail(0, 0), tail(0.42, 0)], C.iron, 0.03);
    k.poly([tail(0.3, -0.12), tail(0.48, -0.16), tail(0.48, 0.2), tail(0.3, 0.12)], C.cloth, hair(k));
    // the wheel: eight blades round a hub, in the plane square to d
    const at = (rr: number, th: number): Pt => k.p(c[0] + ax[0] * rr * Math.cos(th), c[1] + ax[1] * rr * Math.cos(th), c[2] + rr * Math.sin(th));
    const spin = t * (Math.PI / 2);
    for (let j = 0; j < 8; j++) {
      const th = spin + (j * Math.PI) / 4;
      fillPts(k, [at(0.08, th - 0.12), at(0.42, th - 0.24), at(0.42, th + 0.2), at(0.08, th + 0.12)], j % 2 ? C.paper : C.cloth, hair(k));
    }
    const rim = Array.from({ length: 20 }, (_, j) => at(0.42, (j / 20) * Math.PI * 2));
    fillPts(k, rim, null, hair(k));
    fillPts(k, Array.from({ length: 10 }, (_, j) => at(0.07, (j / 10) * Math.PI * 2)), C.iron, hair(k));
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the trestles: two splayed legs and a cross beam each, a stretcher
    // between them low down
    k.box(0.85, 1.3, 1.1, 5.3, 0.4, 0.4, C.plankDark, { line: k.thin, stripe: false });
    for (const u of [0.75, 6.25]) {
      k.rod([[u, 0.75, ZT - 0.6], [u, 0.2, 0.05]], C.plankDark, 0.36);
      k.rod([[u, 2.25, ZT - 0.6], [u, 2.8, 0.05]], C.plankDark, 0.36);
      k.box(u - 0.3, 0.15, ZT - 1.05, 0.6, 2.7, 0.55, C.plank, { line: k.thin, stripe: false });
    }
    // under the table, by look: a bucket of water, a sack or a crate
    const look = ((v.seed % 3) + 3) % 3;
    if (look === 0) barrel(k, 3.4, 2.0, 0, 0.5, 0.85, C.plankLight, '#5a8ab0');
    else if (look === 1) sack(k, 3.5, 2.0, 0, 0.62, 1.1, 3);
    else crate(k, 2.9, 1.75, 0, 1.2, 0.95, 0.85);
    // the top: three planks, nail heads at their ends
    for (let i = 0; i < 3; i++) k.box(0, i, ZT - 0.5, DESK.len, 1, 0.5, i === 1 ? shade(C.plankLight, -0.06) : C.plankLight, { stripe: i === 2 });
    if (k.fine) {
      const nails: Array<[P3, P3]> = [];
      for (const u of [0.75, 6.25]) for (const w of [0.5, 1.5, 2.5]) nails.push([[u - 0.06, w, ZT + 0.01], [u + 0.06, w, ZT + 0.01]]);
      k.segs(nails, INK, Math.max(1, 0.16 * k.s), 'round');
      // the grain, a line or two down each plank
      const grain: Array<[P3, P3]> = [[[0.4, 0.45, ZT + 0.01], [2.6, 0.5, ZT + 0.01]], [[3.4, 1.55, ZT + 0.01], [6.3, 1.5, ZT + 0.01]], [[1.1, 2.6, ZT + 0.01], [3.2, 2.55, ZT + 0.01]]];
      k.segs(grain, withAlpha(INK, 0.3), Math.max(0.6, 0.07 * k.s), 'round');
    }
    // the easel: a back leg, the frame leaning on it, two short front legs
    // under the ledge and a stick of chalk on it
    k.rod([[4.48, 0.2, ZT], [4.48, 0.85, SLATE.z1 + 0.2]], C.plankDark, 0.22);
    slate(k);
    for (const u of [SLATE.u0 + 0.1, SLATE.u1 - 0.1]) k.rod([[u, SLATE.v0 + 0.25, ZT], [u, SLATE.v0 + 0.15, SLATE.z0 - 0.42]], C.plankDark, 0.2);
    k.box(SLATE.u0 - 0.35, SLATE.v0, SLATE.z0 - 0.42, SLATE.u1 - SLATE.u0 + 0.7, 0.4, 0.2, C.plankLight, { line: k.thin, stripe: false });
    k.box(3.3, SLATE.v0 + 0.1, SLATE.z0 - 0.22, 0.6, 0.18, 0.14, C.white, { line: k.thin * 0.8, stripe: false });
  },
  screen: [onSlate(0, 0), onSlate(1, 0), onSlate(1, 1), onSlate(0, 1)],
  top: [6.5, 0.6, ZT],
  clutter: { items: CLUTTER, spots: SPOTS },
  loops: [WINDPUMP],
};

// A little carved bird standing on (u, v, z), facing -u, about `sc` of a
// unit tall, inked `line` px: drawn flat to the screen, so it reads the
// same in either frame.
function bird(k: Kit, u: number, v: number, z: number, sc = 1, line = k.lw): void {
  const wood = '#dcb47e';
  const [x0] = k.p(0, 0, 0);
  const d = k.p(1, 0, 0)[0] > x0 ? -1 : 1; // which way -u lies on the screen
  const [cx, cy] = k.p(u, v, z + 0.52 * sc);
  const s = k.s * 1.25 * sc;
  const pen = k.pen;
  const shape = (pts: ReadonlyArray<readonly [number, number]>, fill: string, line: number) => {
    pen.beginPath();
    pts.forEach(([x, y], i) => (i ? pen.lineTo(cx + d * x * s, cy + y * s) : pen.moveTo(cx + d * x * s, cy + y * s)));
    pen.closePath();
    k.paint(fill, line);
  };
  // the tail, then the body, the head and its beak over it
  shape([[-0.25, -0.05], [-0.95, -0.55], [-1.0, -0.35], [-0.4, 0.2]], shade(wood, -0.15), line);
  pen.beginPath();
  pen.ellipse(cx, cy, 0.62 * s, 0.42 * s, 0, 0, Math.PI * 2);
  k.paint(wood, line);
  pen.beginPath();
  pen.arc(cx + d * 0.42 * s, cy - 0.45 * s, 0.3 * s, 0, Math.PI * 2);
  k.paint(wood, line);
  shape([[0.66, -0.52], [0.98, -0.44], [0.68, -0.36]], '#e8a040', Math.min(line, k.thin));
  pen.beginPath();
  pen.arc(cx + d * 0.48 * s, cy - 0.5 * s, Math.max(0.7, 0.06 * s), 0, Math.PI * 2);
  k.paint(INK, 0);
  if (k.s * sc >= 7) {
    // a carved wing
    pen.beginPath();
    pen.moveTo(cx - d * 0.25 * s, cy - 0.1 * s);
    pen.quadraticCurveTo(cx + d * 0.05 * s, cy + 0.2 * s, cx + d * 0.3 * s, cy - 0.02 * s);
    pen.strokeStyle = shade(wood, -0.35);
    pen.lineWidth = Math.max(0.6, 0.06 * s);
    pen.stroke();
  }
}

// The slate's wooden frame, a board thick, leaning back on the easel (the
// shared layer paints the slate itself over `screen`).
function slate(k: Kit): void {
  const mu = 0.4 / (SLATE.u1 - SLATE.u0); // the frame's width, as shares of the slate
  const mz = 0.38 / (SLATE.z1 - SLATE.z0);
  const wood = shade(C.plankLight, 0.12);
  const fr = [onSlate(-mu, -mz), onSlate(1 + mu, -mz), onSlate(1 + mu, 1 + mz), onSlate(-mu, 1 + mz)];
  const back = fr.map(([u, w, z]): P3 => [u, w - 0.18, z]);
  // its thickness: the top and the right end
  k.poly([fr[3], fr[2], back[2], back[3]], shade(wood, 0.1), k.thin);
  k.poly([fr[1], back[1], back[2], fr[2]], k.side(wood, 1, 0, 0.2), k.thin);
  k.poly(fr, wood, k.lw);
  k.poly([onSlate(0, 0), onSlate(1, 0), onSlate(1, 1), onSlate(0, 1)], '#3a423c', 0);
}
