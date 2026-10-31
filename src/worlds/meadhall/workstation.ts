import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { fillPts, flame, furry, horn, hull, pebble, ring, zigzag } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf } from './kit.ts';

// Longhall's workstation (see WorkstationArt in ../types.ts): a scribe's
// desk. A thick carved plank on two trestles, a shelf between them with a
// bundle of scrolls; on it a small timber frame with a stretched vellum in
// it (the screen: the shared activity layer paints on it); in front of the
// agent a sheet of parchment. The back of its right end is kept clear for a
// desk upgrade, beside the frame and away from the agent. Looks, under the
// top: 0 a rolled fur on the shelf beside the scrolls, 1 a small iron-bound
// chest there, 2 a small round shield leaning on the right trestle.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Its clutter (a few a desk, see clutterOf): a drinking horn, a wooden
// tankard of mead with its foam, a round loaf, three rune stones, a shed
// antler, a little painted wooden horse, a wheel of cheese cut into, a scroll
// with a wax seal, a horn inkwell with its quill, a cloth purse of coins,
// two red apples. Its loop: a candle on an iron stand at the front
// of the top's right end, its flame flickering while the desk is worked,
// out while it is not.

const TOP = 6.0; // the desk's top
// The vellum's frame: posts, a top bar and a foot rail round the screen.
const FRAME = { u0: 1.85, u1: 5.65, post: 0.35, v0: 0.4, v1: 0.8, z1: 10, bar: 0.45, rail: 0.35 };
const SCREEN = { u0: 2.5, u1: 5.0, v: 0.75, z0: 6.65, z1: 9.35 };

function draw(v: PropView): void {
  const k = kitOf(v);
  const look = ((v.seed % 3) + 3) % 3;
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.3);
  // the left trestle, the shelf and its scrolls, the right trestle
  trestle(k, 0.35);
  k.box(0.95, 1.2, 1.1, 5.1, 0.55, 0.45, C.timberDark, { line: k.thin, stripe: false });
  k.box(0.95, 0.55, 1.55, 5.1, 1.9, 0.3, C.timberDark, { line: k.thin });
  scrolls(k, 2.9, 1.85);
  if (look === 0) furRoll(k, 1.15, 2.6, 1.85);
  else if (look === 1) chest(k, 1.2, 2.55, 1.85);
  trestle(k, 6.05);
  if (look === 2) shield(k, 5.55, 2.95, 1.25, 1.1);
  // the plank top: a carved apron under its front, seams along it
  k.box(0.95, 2.45, 4.55, 5.1, 0.35, 0.7, C.timberDark, { line: k.thin, stripe: false });
  if (k.fine) zigzag(k, 1.15, 5.85, 2.81, 4.9, 0.4, C.carving, Math.max(0.8, 0.1 * k.s));
  k.box(0, 0, TOP - 0.8, DESK.len, DESK.dep, 0.8, C.timber);
  k.line([[0.05, DESK.dep + 0.01, TOP - 0.4], [DESK.len - 0.05, DESK.dep + 0.01, TOP - 0.4]], C.carving, Math.max(1, 0.16 * k.s));
  if (k.fine) {
    zigzag(k, 0.25, DESK.len - 0.25, DESK.dep + 0.02, TOP - 0.4, 0.36, shade(C.carving, 0.18), Math.max(0.7, 0.07 * k.s));
    k.segs([[[0.15, 1.0, TOP], [DESK.len - 0.15, 1.0, TOP]], [[0.15, 2.0, TOP], [DESK.len - 0.15, 2.0, TOP]]], shade(C.timber, -0.22), Math.max(0.7, 0.07 * k.s));
  }
  // the vellum in its frame
  vellum(k);
  // in front of the agent: a sheet of parchment
  k.poly([[0.55, 1.75, TOP + 0.02], [2.55, 1.6, TOP + 0.02], [2.7, 2.7, TOP + 0.02], [0.7, 2.85, TOP + 0.02]], C.parchment, k.thin);
  if (k.fine) {
    const rows: Array<readonly [P3, P3]> = [];
    for (let i = 0; i < 4; i++) {
      const f = 0.2 + i * 0.2;
      rows.push([[0.85 + f * 0.15, 1.75 + f * 1.05, TOP + 0.03], [2.3 + f * 0.15 - (i === 3 ? 0.6 : 0), 1.62 + f * 1.05, TOP + 0.03]]);
    }
    k.segs(rows, '#8a7656', Math.max(0.7, 0.07 * k.s), 'round');
  }
}

// The vellum's frame on the desk's back: a dark backboard between two
// posts, a foot rail and a top bar; the hide stretched in it by its
// corners, a margin of it round the screen, laced to the posts.
function vellum(k: Kit): void {
  const F = FRAME;
  const S = SCREEN;
  const i0 = F.u0 + F.post;
  const i1 = F.u1 - F.post;
  const iz0 = TOP + F.rail;
  const iz1 = F.z1 - F.bar;
  k.box(i0, F.v0, TOP, i1 - i0, 0.2, F.z1 - TOP, C.timberDark, { line: k.thin, stripe: false });
  k.box(i0, F.v0, TOP, i1 - i0, F.v1 - F.v0, F.rail, C.timberDark, { line: k.thin });
  k.box(F.u0, F.v0, TOP, F.post, F.v1 - F.v0, iz1 - TOP, C.timber, { stripe: false });
  k.box(i1, F.v0, TOP, F.post, F.v1 - F.v0, iz1 - TOP, C.timber, { stripe: false });
  // the hide: a margin round the screen, its edges drawn in between the
  // corners where it is pulled out to the frame
  const n = S.v - 0.02;
  const [u0, u1, z0, z1] = [S.u0 - 0.2, S.u1 + 0.2, S.z0 - 0.15, S.z1 + 0.15];
  const tip = 0.08;
  const sag = 0.07;
  const pts: P3[] = [
    [i0 + tip, n, iz0 + tip],
    [(u0 + u1) / 2, n, z0 + sag],
    [i1 - tip, n, iz0 + tip],
    [u1 - sag, n, (z0 + z1) / 2],
    [i1 - tip, n, iz1 - tip],
    [(u0 + u1) / 2, n, z1 - sag],
    [i0 + tip, n, iz1 - tip],
    [u0 + sag, n, (z0 + z1) / 2],
  ];
  // each edge a gentle curve through its middle point
  const edge: P3[] = [];
  for (let c = 0; c < 8; c += 2) {
    const a = pts[c];
    const m = pts[c + 1];
    const b = pts[(c + 2) % 8];
    for (let i = 0; i < 6; i++) {
      const t = i / 6;
      const w = [(1 - t) * (1 - t), 2 * t * (1 - t), t * t];
      // through m at t = 0.5: its control point pulled out past it
      const ctl = [0, 1, 2].map((d) => 2 * m[d] - (a[d] + b[d]) / 2);
      edge.push([0, 1, 2].map((d) => w[0] * a[d] + w[1] * ctl[d] + w[2] * b[d]) as P3);
    }
  }
  k.poly(edge, C.cream, k.thin);
  if (k.fine) {
    // laced to the posts
    const cords: Array<readonly [P3, P3]> = [];
    for (const f of [0.22, 0.5, 0.78]) {
      const z = z0 + (z1 - z0) * f;
      cords.push([[u0 + sag + 0.06, n, z], [i0, n, z + 0.12]], [[u1 - sag - 0.06, n, z], [i1, n, z + 0.12]]);
    }
    k.segs(cords, C.leatherDark, Math.max(0.8, 0.08 * k.s), 'round');
  }
  k.box(F.u0 - 0.12, F.v0 - 0.05, iz1, F.u1 - F.u0 + 0.24, F.v1 - F.v0 + 0.1, F.bar, C.timber, { round: 0.12 });
  if (k.fine) zigzag(k, F.u0 + 0.1, F.u1 - 0.1, F.v1 + 0.06, F.z1 - F.bar / 2, 0.24, C.carving, Math.max(0.7, 0.07 * k.s));
}

// A trestle at u0: a carved slab on a foot, a cleat under the top.
function trestle(k: Kit, u0: number): void {
  k.box(u0 - 0.15, 0.2, 0, 0.9, 2.6, 0.5, C.timberDark, { line: k.thin });
  k.box(u0, 0.55, 0.5, 0.6, 1.9, TOP - 1.4, C.timber, { stripe: false });
  k.box(u0 - 0.1, 0.3, TOP - 1.3, 0.8, 2.4, 0.5, C.timberDark, { line: k.thin, stripe: false });
  if (k.fine) {
    // a carved notch down the slab's face
    k.line([[u0 + 0.6 + 0.01, 1.1, 1.3], [u0 + 0.6 + 0.01, 1.5, 2.6], [u0 + 0.6 + 0.01, 1.1, 3.9]], C.timberDark, Math.max(0.8, 0.1 * k.s));
  }
}

// A rolled scroll lying along u from u0 to u1 at (v, z) (its axis),
// radius r: the parchment, its rolled +u end.
function roll(k: Kit, u0: number, u1: number, v: number, z: number, r: number, color: Color = C.parchment, line = k.thin): void {
  fillPts(k, hull([...ring(k, [u0, v, z], [1, 0, 0], r, 12), ...ring(k, [u1, v, z], [1, 0, 0], r, 12)]), color, line);
  fillPts(k, ring(k, [u1, v, z], [1, 0, 0], r, 12), shade(color, -0.1), line);
  fillPts(k, ring(k, [u1 + 0.01, v, z], [1, 0, 0], r * 0.4, 8), '#b89a6a', 0);
}

// A bundle of scrolls on the shelf, tied with a red cord.
function scrolls(k: Kit, u0: number, z: number): void {
  const r = 0.3;
  roll(k, u0 + 0.2, u0 + 2.6, 1.1, z + r, r);
  roll(k, u0, u0 + 2.4, 1.7, z + r, r, shade(C.parchment, -0.04));
  roll(k, u0 + 0.35, u0 + 2.8, 2.25, z + r, r);
  roll(k, u0 + 0.1, u0 + 2.5, 1.45, z + r * 2.6, r, shade(C.parchment, 0.04));
  k.line([[u0 + 1.3, 2.55, z + 0.1], [u0 + 1.3, 2.55, z + 0.7], [u0 + 1.3, 1.75, z + 1.4]], C.red, Math.max(1, 0.14 * k.s));
}

// A fur rolled up and tied, lying along u from u0 to u1 on the shelf at z.
function furRoll(k: Kit, u0: number, u1: number, z: number): void {
  const [v, r] = [1.75, 0.42];
  const zc = z + r;
  fillPts(k, hull([...ring(k, [u0, v, zc], [1, 0, 0], r, 14), ...ring(k, [u1, v, zc], [1, 0, 0], r, 14)]), k.grad([u0, v, zc + r], [u0, v, zc - r], [[0, '#c0a682'], [0.5, C.fur], [1, C.furDark]]), k.thin);
  const end: P3[] = Array.from({ length: 12 }, (_, i) => [u1 + 0.01, v + Math.cos((i / 12) * Math.PI * 2) * r, zc + Math.sin((i / 12) * Math.PI * 2) * r]);
  furry(k, end, C.furDark, 3, 0.12, k.thin);
  fillPts(k, ring(k, [u1 + 0.02, v, zc], [1, 0, 0], r * 0.45, 10), shade(C.furDark, -0.2), 0);
  for (const u of [u0 + 0.35, u1 - 0.35]) k.line([[u, v + r * 0.95, zc - r * 0.3], [u, v + r * 0.4, zc + r * 0.92], [u, v - r * 0.3, zc + r * 0.95]], C.leatherDark, Math.max(1, 0.1 * k.s));
}

// A small chest bound in iron on the shelf, from u0 to u1, standing on z.
function chest(k: Kit, u0: number, u1: number, z: number): void {
  const [v0, v1, h] = [1.15, 2.3, 0.75];
  k.box(u0, v0, z, u1 - u0, v1 - v0, h, C.timberLight, { line: k.thin });
  k.box(u0 - 0.03, v0 - 0.03, z + h, u1 - u0 + 0.06, v1 - v0 + 0.06, 0.28, C.timber, { line: k.thin, round: 0.1 });
  const bands: Array<readonly [P3, P3]> = [];
  for (const u of [u0 + 0.25, u1 - 0.25]) bands.push([[u, v1 + 0.04, z], [u, v1 + 0.04, z + h + 0.28]]);
  k.segs(bands, C.iron, Math.max(1, 0.12 * k.s));
  k.rect((u0 + u1) / 2 - 0.12, z + h - 0.25, (u0 + u1) / 2 + 0.12, z + h + 0.05, v1 + 0.05, C.ironLight, k.thin);
}

// A small round shield leaning back on the right trestle, its face toward
// the agent: two plain halves, red and blue, an iron rim and boss.
function shield(k: Kit, a: number, n: number, z: number, r: number): void {
  const lean = 0.28;
  const at = (da: number, dz: number): P3 => [a + da, n - Math.max(0, dz + r) * lean, z + dz];
  const round = (rr: number, th0 = 0, th1 = Math.PI * 2, steps = 24): P3[] => Array.from({ length: steps + 1 }, (_, i) => {
    const th = th0 + ((th1 - th0) * i) / steps;
    return at(Math.cos(th) * rr, Math.sin(th) * rr);
  });
  k.shadow(a, n - 0.3, r * 0.9, 0.5, 0.3);
  k.poly(round(r), C.red, k.lw);
  k.poly([at(0, 0), ...round(r - 0.04, Math.PI / 2, Math.PI * 1.5, 12)], C.blue, 0);
  // the light from the upper left
  const [hx, hy] = k.p(...at(-r * 0.4, r * 0.45));
  const g = k.pen.createRadialGradient(hx, hy, 0, hx, hy, r * k.s * 1.6);
  g.addColorStop(0, '#fff4dc40');
  g.addColorStop(0.5, '#fff4dc10');
  g.addColorStop(1, '#00000030');
  k.poly(round(r), g, 0);
  k.line(round(r - 0.1), C.ironLight, Math.max(1, 0.18 * k.s));
  k.pen.beginPath();
  k.trace(round(r));
  k.paint(null, k.lw);
  k.poly(round(r * 0.3, 0, Math.PI * 2, 14), C.iron, k.thin);
  k.poly(round(r * 0.12, 0, Math.PI * 2, 8).map((p): P3 => [p[0] - 0.06, p[1], p[2] + 0.06]), C.ironLight, 0);
}

// ── what may stand on the top ──────────────────────────────────────────────
// Each stands at `at` (u, v on the top, z its surface), inside `r` round
// it and `h` over it, outlined finer than the furniture so a small thing
// keeps its colour.

const edge = (k: Kit): number => Math.max(1, k.lw * 0.45);

// A round blob in screen space at a frame point, rx x ry px.
function dot(k: Kit, p: P3, rx: number, ry: number, fill: Color, line = 0): void {
  const [x, y] = k.p(...p);
  k.pen.beginPath();
  k.pen.ellipse(x, y, Math.max(0.5, rx), Math.max(0.5, ry), 0, 0, Math.PI * 2);
  k.paint(fill, line);
}

// A drinking horn lying on the top, mead in its gilt mouth (toward +u),
// its tip curling up.
const drinkingHorn: Clutter = {
  name: 'drinkingHorn',
  r: 0.4,
  h: 0.7,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.shadow(u, w, 0.44, 0.28, 0.3, z);
    horn(k, [[u + 0.4, w - 0.02, z + 0.27], [u + 0.08, w + 0.08, z + 0.2], [u - 0.2, w + 0.06, z + 0.26], [u - 0.38, w - 0.02, z + 0.52]], 0.25, true, edge(k));
  },
};

// A wooden tankard of mead, two iron hoops round it, foam on top.
const tankard: Clutter = {
  name: 'tankard',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.38, 0.3, 0.3, z);
    const handle: P3[] = [[u + 0.26, w, z + 0.66], [u + 0.42, w, z + 0.58], [u + 0.4, w, z + 0.22], [u + 0.26, w, z + 0.16]];
    k.line(handle, INK, 0.11 * k.s + 2 * e);
    k.line(handle, '#7a5030', 0.11 * k.s);
    k.cyl(u, w, z, 0.3, 0.72, '#9a6a3e', { line: e, top: '#a87848' });
    for (const zz of [0.14, 0.56]) {
      const o = k.ell(u, w, z + zz, 0.305);
      k.pen.beginPath();
      k.pen.ellipse(o.cx, o.cy, o.rx, o.ry, 0, 0.05, Math.PI - 0.05);
      k.pen.strokeStyle = C.ironDark;
      k.pen.lineWidth = Math.max(1, 0.08 * k.s);
      k.pen.stroke();
    }
    // the foam: a cap of bubbles over the rim
    const top = z + 0.72;
    k.disc(u, w, top, 0.26, '#f4ead0', 0);
    for (const [du, dv, r] of [[-0.14, 0.04, 0.13], [0.02, 0.12, 0.14], [0.14, -0.02, 0.12], [-0.02, -0.1, 0.12]] as const) dot(k, [u + du, w + dv, top + 0.06], r * k.s, r * k.s * 0.8, '#fbf4e2', e * 0.7);
  },
};

// A round loaf, scored across its crust.
const loaf: Clutter = {
  name: 'loaf',
  r: 0.4,
  h: 0.5,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.42, 0.34, 0.3, z);
    pebble(k, u, w, z, 0.4, 0.46, '#c88a48', e);
    const cuts: Array<readonly [P3, P3]> = [
      [[u - 0.2, w - 0.08, z + 0.42], [u + 0.08, w + 0.2, z + 0.42]],
      [[u - 0.06, w - 0.2, z + 0.43], [u + 0.2, w + 0.06, z + 0.4]],
    ];
    k.segs(cuts, '#8a5428', Math.max(0.8, 0.07 * k.s), 'round');
    k.segs(cuts.map(([a, b]): readonly [P3, P3] => [[a[0] - 0.02, a[1], a[2] + 0.02], [b[0] - 0.02, b[1], b[2] + 0.02]]), '#f0c888', Math.max(0.6, 0.04 * k.s), 'round');
  },
};

// Three rune stones, each with a mark cut in it.
const runeStones: Clutter = {
  name: 'runeStones',
  r: 0.4,
  h: 0.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.42, 0.34, 0.26, z);
    const stones: Array<[number, number, string]> = [[-0.2, -0.16, C.stoneLight], [0.2, -0.08, C.stone], [-0.02, 0.2, '#a8a69c']];
    stones.forEach(([du, dv, c], i) => {
      const [a, b] = [u + du, w + dv];
      pebble(k, a, b, z, 0.19, 0.2, c, e);
      // a cut: a stroke, and a short one off it
      const mark: Array<readonly [P3, P3]> = [[[a - 0.02, b + 0.04, z + 0.2], [a + 0.04, b - 0.06, z + 0.2]]];
      if (i !== 1) mark.push([[a + 0.01, b - 0.01, z + 0.2], [a + 0.08, b + 0.03, z + 0.2]]);
      else mark.push([[a + 0.02, b - 0.02, z + 0.2], [a - 0.06, b - 0.04, z + 0.2]]);
      k.segs(mark, C.ironDark, Math.max(0.7, 0.05 * k.s), 'round');
    });
  },
};

// A shed antler lying on the top: its beam curving up, three tines.
const antler: Clutter = {
  name: 'antler',
  r: 0.4,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.42, 0.3, 0.26, z);
    const bone = (pts: ReadonlyArray<P3>, wd: number) => {
      k.line(pts, INK, wd * k.s + 2 * e);
      k.line(pts, C.horn, wd * k.s);
    };
    const beam: P3[] = [[u - 0.38, w + 0.1, z + 0.08], [u - 0.1, w + 0.02, z + 0.1], [u + 0.18, w - 0.08, z + 0.16], [u + 0.36, w - 0.16, z + 0.32]];
    bone([[u - 0.12, w + 0.02, z + 0.1], [u - 0.06, w + 0.0, z + 0.42]], 0.07);
    bone([[u + 0.12, w - 0.06, z + 0.14], [u + 0.2, w - 0.06, z + 0.55]], 0.07);
    bone([[u + 0.32, w - 0.14, z + 0.28], [u + 0.42, w - 0.18, z + 0.6]], 0.06);
    bone(beam, 0.1);
    dot(k, [u - 0.4, w + 0.11, z + 0.1], 0.08 * k.s, 0.08 * k.s, '#b89a70', e * 0.8);
  },
};

// A little wooden horse, painted red with a white saddle cloth.
const horse: Clutter = {
  name: 'horse',
  r: 0.4,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const S = k.s;
    const pen = k.pen;
    k.shadow(u, w, 0.4, 0.28, 0.3, z);
    const [x, y] = k.p(u, w, z);
    // in profile, facing -u: the legs, the body and neck in one, the head
    const red = C.red;
    pen.beginPath();
    pen.moveTo(x - 0.28 * S, y - 0.02 * S);
    pen.lineTo(x - 0.22 * S, y - 0.36 * S);
    pen.lineTo(x - 0.34 * S, y - 0.62 * S);
    pen.lineTo(x - 0.46 * S, y - 0.62 * S);
    pen.lineTo(x - 0.5 * S, y - 0.74 * S);
    pen.lineTo(x - 0.34 * S, y - 0.92 * S);
    pen.lineTo(x - 0.18 * S, y - 0.84 * S);
    pen.lineTo(x - 0.06 * S, y - 0.5 * S);
    pen.lineTo(x + 0.26 * S, y - 0.5 * S);
    pen.lineTo(x + 0.36 * S, y - 0.34 * S);
    pen.lineTo(x + 0.3 * S, y - 0.02 * S);
    pen.lineTo(x + 0.2 * S, y - 0.02 * S);
    pen.lineTo(x + 0.18 * S, y - 0.3 * S);
    pen.lineTo(x - 0.12 * S, y - 0.3 * S);
    pen.lineTo(x - 0.16 * S, y - 0.02 * S);
    pen.closePath();
    const g = pen.createLinearGradient(x - 0.5 * S, y - 0.9 * S, x + 0.36 * S, y);
    g.addColorStop(0, shade(red, 0.2));
    g.addColorStop(0.6, red);
    g.addColorStop(1, C.redDark);
    k.paint(g, e);
    // the saddle cloth, the mane, an eye
    pen.beginPath();
    pen.moveTo(x - 0.02 * S, y - 0.5 * S);
    pen.lineTo(x + 0.2 * S, y - 0.5 * S);
    pen.lineTo(x + 0.16 * S, y - 0.32 * S);
    pen.lineTo(x + 0.02 * S, y - 0.32 * S);
    pen.closePath();
    k.paint(C.cream, e * 0.7);
    pen.beginPath();
    pen.moveTo(x - 0.33 * S, y - 0.9 * S);
    pen.lineTo(x - 0.18 * S, y - 0.82 * S);
    pen.lineTo(x - 0.08 * S, y - 0.54 * S);
    pen.strokeStyle = C.ochre;
    pen.lineWidth = Math.max(0.8, 0.06 * S);
    pen.stroke();
    pen.beginPath();
    pen.arc(x - 0.36 * S, y - 0.76 * S, Math.max(0.5, 0.03 * S), 0, Math.PI * 2);
    pen.fillStyle = INK;
    pen.fill();
  },
};

// A wheel of cheese, a wedge cut from its near side.
const cheese: Clutter = {
  name: 'cheese',
  r: 0.4,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const [r, h] = [0.38, 0.32];
    k.shadow(u, w, 0.42, 0.34, 0.3, z);
    k.cyl(u, w, z, r, h, '#d8a838', { line: e, top: '#f0d070' });
    // the cut: the wedge's two faces, from the middle out to the rim
    const a0 = Math.PI * 0.15;
    const a1 = Math.PI * 0.55;
    const rim = (a: number, zz: number): P3 => [u + Math.cos(a) * r, w + Math.sin(a) * r, zz];
    const mid = (zz: number): P3 => [u, w, zz];
    k.poly([mid(z + h), rim(a0, z + h), ...Array.from({ length: 7 }, (_, i) => rim(a0 + ((a1 - a0) * i) / 6, z + h)), rim(a1, z + h)], '#5a3a22', 0);
    k.poly([mid(z), rim(a0, z), rim(a0, z + h), mid(z + h)], '#f6dc84', e * 0.8);
    k.poly([mid(z), rim(a1, z), rim(a1, z + h), mid(z + h)], '#e8c060', e * 0.8);
    k.poly([mid(z + h + 0.005), rim(a0, z + h + 0.005), ...Array.from({ length: 7 }, (_, i) => rim(a0 + ((a1 - a0) * i) / 6, z + h + 0.005)), rim(a1, z + h + 0.005)], '#5a3a22', 0);
  },
};

// A scroll with a plain wax seal on a ribbon, lying along u.
const sealedScroll: Clutter = {
  name: 'sealedScroll',
  r: 0.4,
  h: 0.5,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    const r = 0.2;
    k.shadow(u, w, 0.44, 0.24, 0.28, z);
    roll(k, u - 0.4, u + 0.36, w, z + r, r, C.parchment, e);
    const um = u - 0.05;
    k.line([[um, w + r * 0.2, z + r * 1.9], [um, w + r, z + r], [um + 0.1, w + r + 0.12, z + 0.08]], C.redDark, Math.max(1, 0.08 * k.s));
    k.face(um + 0.1, w + r + 0.14, z + 0.16, 0.15, C.red, e, 14);
    k.face(um + 0.09, w + r + 0.15, z + 0.18, 0.08, shade(C.red, 0.15), 0, 10);
  },
};

// A horn inkwell set in a little block, its goose quill leaning in it.
const inkHorn: Clutter = {
  name: 'inkHorn',
  r: 0.4,
  h: 1.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.38, 0.32, 0.3, z);
    k.box(u - 0.32, w - 0.28, z, 0.64, 0.56, 0.28, C.timberDark, { line: e });
    horn(k, [[u, w, z + 0.92], [u + 0.03, w + 0.02, z + 0.6], [u + 0.14, w + 0.08, z + 0.3]], 0.22, false, e);
    k.disc(u, w, z + 0.92, 0.15, '#120c10', 0);
    // the quill leaning back along the desk (-u): it shows up and aside in
    // either frame, its tip low enough to clear a screen behind the horn
    const nib: P3 = [u - 0.02, w + 0.02, z + 0.78];
    const end: P3 = [u - 0.4, w + 0.12, z + 1.1];
    const [x0, y0] = k.p(...nib);
    const [x1, y1] = k.p(...end);
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const [nx, ny] = [(y0 - y1) / len, (x1 - x0) / len];
    const q = (f: number, o: number): Pt => [x0 + (x1 - x0) * f + nx * o * k.s, y0 + (y1 - y0) * f + ny * o * k.s];
    fillPts(k, [q(0.25, 0), q(0.45, 0.12), q(0.8, 0.11), q(1, 0), q(0.75, -0.08), q(0.45, -0.06)], C.cream, e);
    k.line([nib, end], shade(C.cream, -0.3), Math.max(0.8, 0.05 * k.s));
  },
};

// A purse of blue cloth tied at its neck, gold coins spilt before it.
const purse: Clutter = {
  name: 'purse',
  r: 0.4,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.42, 0.32, 0.3, z);
    const c = u - 0.08;
    pebble(k, c, w - 0.06, z, 0.28, 0.42, C.blue, e);
    const neck = k.p(c, w - 0.06, z + 0.42);
    const tuft: Pt[] = [[neck[0] - 0.08 * k.s, neck[1] + 0.04 * k.s], [neck[0] - 0.13 * k.s, neck[1] - 0.16 * k.s], [neck[0], neck[1] - 0.1 * k.s], [neck[0] + 0.13 * k.s, neck[1] - 0.17 * k.s], [neck[0] + 0.08 * k.s, neck[1] + 0.04 * k.s]];
    fillPts(k, tuft, shade(C.blue, 0.08), e);
    k.line([[c - 0.1, w + 0.06, z + 0.4], [c + 0.1, w + 0.06, z + 0.4]], C.gold, Math.max(0.8, 0.06 * k.s));
    for (const [du, dv, dz] of [[0.2, 0.2, 0], [0.32, 0.02, 0], [0.1, 0.3, 0], [0.24, 0.12, 0.05]] as const) {
      k.cyl(u + du, w + dv, z + dz, 0.1, 0.04, C.gold, { line: e * 0.7, top: '#f0c860' });
    }
  },
};

// Two red apples.
const apples: Clutter = {
  name: 'apples',
  r: 0.4,
  h: 0.55,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = edge(k);
    k.shadow(u, w, 0.4, 0.3, 0.3, z);
    for (const [du, dv, c] of [[-0.14, -0.1, C.red], [0.16, 0.12, '#b8402e']] as const) {
      pebble(k, u + du, w + dv, z, 0.22, 0.38, c, e);
      k.line([[u + du, w + dv, z + 0.36], [u + du + 0.03, w + dv, z + 0.48]], C.leatherDark, Math.max(0.8, 0.05 * k.s));
      dot(k, [u + du + 0.06, w + dv, z + 0.44], 0.07 * k.s, 0.035 * k.s, C.herb, e * 0.5);
    }
  },
};

const ITEMS: Clutter[] = [drinkingHorn, tankard, loaf, runeStones, antler, horse, cheese, sealedScroll, inkHorn, purse, apples];

// Where they may stand: left of the frame, before it, and along the front
// of the top, clear of the upgrade and the candle.
const SPOTS: P3[] = [
  [1.45, 0.75, TOP],
  [2.3, 1.3, TOP],
  [3.4, 1.25, TOP],
  [4.45, 1.25, TOP],
  [2.9, 2.2, TOP],
  [3.95, 2.2, TOP],
  [5.0, 2.2, TOP],
];

// ── what moves on it ───────────────────────────────────────────────────────

// A candle on an iron stand at the front of the top's right end: a foot, a
// stem with a ring to hold it by, a dish. While the desk is worked its
// flame flickers; out, a dark wick.
const CANDLE: P3 = [6.5, 2.5, TOP];
const candle: DeskLoop = {
  name: 'candle',
  at: CANDLE,
  r: 0.5,
  h: 1.9,
  frames: 6,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [cu, cv, z] = CANDLE;
    const e = edge(k);
    k.disc(cu, cv, z + 0.02, 0.36, C.iron, e);
    k.rod([[cu, cv, z + 0.05], [cu, cv, z + 0.36]], C.iron, 0.1);
    k.rod([[cu + 0.05, cv + 0.05, z + 0.14], [cu + 0.32, cv + 0.28, z + 0.17], [cu + 0.3, cv + 0.3, z + 0.32], [cu + 0.05, cv + 0.05, z + 0.32]], C.iron, 0.07);
    k.disc(cu, cv, z + 0.38, 0.32, C.iron, e);
    k.disc(cu, cv, z + 0.43, 0.22, C.ironDark, 0);
    const top = z + 0.43 + 0.55;
    k.cyl(cu, cv, z + 0.43, 0.24, 0.55, C.cream, { line: e });
    k.line([[cu - 0.1, cv + 0.24, top], [cu - 0.12, cv + 0.26, top - 0.32]], shade(C.cream, -0.12), Math.max(0.7, 0.07 * k.s));
    if (!v.active) {
      k.line([[cu, cv, top], [cu, cv, top + 0.14]], INK, Math.max(0.8, 0.07 * k.s));
      return;
    }
    const sway = [0, 0.02, 0.04, 0.02, 0, -0.02][i];
    const f = [0.5, 0.62, 0.75, 0.6, 0.42, 0.36][i];
    const glow = [0.3, 0.31, 0.33, 0.31, 0.29, 0.28][i];
    flame(k, cu + sway, cv, top + 0.2, 0.95, f, glow);
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw,
  screen: [
    [SCREEN.u0, SCREEN.v, SCREEN.z0],
    [SCREEN.u1, SCREEN.v, SCREEN.z0],
    [SCREEN.u1, SCREEN.v, SCREEN.z1],
    [SCREEN.u0, SCREEN.v, SCREEN.z1],
  ],
  top: [6.5, 0.55, TOP],
  clutter: { items: ITEMS, spots: SPOTS },
  loops: [candle],
};
