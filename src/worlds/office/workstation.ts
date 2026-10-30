import type { Color } from '../../art/types.ts';
import { mix, shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { across, caster, frustum, hull, leaf, ring } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// The Startup's workstation (see WorkstationArt in ../types.ts): a standing desk with a monitor.
// A white top on a black steel frame, its two legs telescoped up to
// standing height on wide feet, its controller under the front edge; one
// thin monitor on an arm off a pole at the right; a compact keyboard and a
// mouse at the front, before the agent. Drawn once a scale, frame, look and
// pick of clutter, and kept: it never looks at v.t; v.active (its screen
// on) lights the controller's LED; v.seed (0, 1 or 2) picks what is under
// it: a balance board pushed under the front (0), the board and a backpack
// slumped against the right leg (1), or a rolling drawer unit under the
// right end (2). The shared activity layer paints over `screen`; a desk
// upgrade stands at `top`, at the back of its right end (nothing of its own
// there).
//
// On the top, a few things a startup's desks gather (`clutter`, a pick a
// place, see clutterOf): a mug of coffee, a takeaway cup, a can of
// sparkling water, a succulent, a rubber duck, sticky notes, notebooks and
// a pen, a phone on a stand (lit while at work), headphones, a little robot
// (its eyes lit while at work), a puzzle cube and a frosted donut. They
// stand on four spots: left of the monitor, and three staggered across the
// open strip between its glass and the keyboard and mouse.
//
// Two things move while its agent works (`loops`): a Newton's cradle in
// the front right corner, its end balls swinging in turn, and a busy light
// clipped on the monitor's top right corner, breathing red. Off, the
// cradle hangs still and the light is out.

// The top's surface; the monitor's black panel round its screen.
const TOP = 6.0;
const MON = { u0: 2.5, u1: 5.05, v0: 0.6, v1: 0.9, z0: 6.6, z1: 9.65 };
const PANEL = '#25272c';

// The desk itself: its frame, what is under it by look, its top, the
// monitor, the keyboard and the mouse.
function drawDesk(v: PropView): void {
  const k = kitOf(v);
  const look = ((v.seed % 3) + 3) % 3;
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  // the frame: a wide foot along v under each leg, the legs in two
  // stages, a beam between them under the top
  const leg = (u: number) => {
    k.box(u - 0.35, 0.2, 0, 0.7, 2.6, 0.3, C.steel, { line: k.thin });
    k.box(u - 0.38, 1.1, 0.3, 0.76, 0.76, 2.9, C.steel, { line: k.thin, stripe: false });
    k.box(u - 0.28, 1.2, 3.2, 0.56, 0.56, TOP - 0.4 - 3.2, C.steelLight, { line: k.thin, stripe: false });
  };
  leg(1.0);
  k.box(1.3, 1.28, TOP - 1.0, 4.4, 0.4, 0.6, C.steel, { line: k.thin, stripe: false });
  // under the right end, by look (inside the right leg, so before it)
  if (look === 1) backpack(k);
  else if (look === 2) drawers(k);
  leg(6.0);
  // a balance board pushed under the front: a birch deck on its roller
  if (look !== 2) {
    k.shadow(2.2, 2.35, 1.5, 0.6, 0.22);
    k.box(1.85, 2.0, 0, 0.7, 0.7, 0.36, C.fabricA, { round: 0.25, line: k.thin });
    k.box(0.9, 1.9, 0.36, 2.6, 0.95, 0.18, C.birch, { line: k.thin });
    k.poly([[1.1, 2.05, 0.55], [3.3, 2.05, 0.55], [3.3, 2.7, 0.55], [1.1, 2.7, 0.55]], C.steel, 0);
  }
  // the top: white, its edge picked out in birch
  k.box(0, 0, TOP - 0.4, DESK.len, DESK.dep, 0.4, C.white, { left: C.birch, right: shade(C.birch, -0.15) });
  // the monitor's pole, clamped to the back edge at the right, and its arm
  k.box(5.15, 0.1, TOP, 0.55, 0.55, 0.3, C.steel, { line: k.thin, stripe: false });
  k.rod([[5.42, 0.38, TOP + 0.3], [5.42, 0.38, 8.5]], C.steel, 0.24);
  k.rod([[5.42, 0.38, 8.2], [4.6, 0.45, 8.2]], C.steel, 0.2);
  // the controller under the front edge, its LED lit while at work
  k.box(5.0, 2.55, TOP - 0.78, 1.1, 0.42, 0.38, C.steel, { line: k.thin * 0.8, stripe: false });
  const n = 2.98;
  if (k.fine) for (const u of [5.25, 5.5]) k.face(u, n, TOP - 0.59, 0.08, C.steelLight, 0, 10);
  k.face(5.82, n, TOP - 0.59, 0.1, v.active ? '#7dff9a' : '#2f4a37', 0, 10);
  if (v.active) k.halo(5.82, n, TOP - 0.59, 0.5, C.leafLight, 0.55);
  // the monitor: a thin black panel on the arm, its screen to the front
  k.box(MON.u0, MON.v0, MON.z0, MON.u1 - MON.u0, MON.v1 - MON.v0, MON.z1 - MON.z0, PANEL, { round: 0.12, stripe: false });
  // a compact keyboard before the agent, near the front edge, and the
  // mouse beside it (the open strip right of it is for the clutter)
  k.box(0.6, 2.15, TOP, 2.1, 0.72, 0.16, '#e3e6ea', { line: k.thin });
  if (k.fine) {
    const keys: Array<[P3, P3]> = [];
    for (const w of [2.33, 2.51, 2.69]) keys.push([[0.8, w, TOP + 0.17], [2.5, w, TOP + 0.17]]);
    k.segs(keys, withAlpha('#9aa0a8', 0.9), 0.09 * k.s);
  }
  k.box(2.9, 2.2, TOP, 0.38, 0.6, 0.18, '#e3e6ea', { line: k.thin, round: 0.18 });
}

// ── under the desk ──────────────────────────────────────────────────────────

// A backpack slumped on the floor against the right leg: a rounded body, a
// pocket on its front, a grab loop on top.
function backpack(k: Kit): void {
  const pack = '#3f6f8f';
  k.shadow(4.95, 2.05, 0.8, 0.6, 0.26);
  k.box(4.4, 1.6, 0, 1.15, 0.85, 1.95, pack, { round: 0.32, line: k.thin, stripe: false });
  k.box(4.55, 2.45, 0.2, 0.85, 0.22, 0.95, shade(pack, 0.1), { round: 0.16, line: k.thin, stripe: false });
  k.line([[4.62, 2.67, 1.05], [5.33, 2.67, 1.05]], shade(pack, -0.4), Math.max(0.6, 0.06 * k.s));
  k.rod([[4.8, 2.0, 1.95], [4.98, 2.0, 2.2], [5.17, 2.0, 1.95]], shade(pack, -0.2), 0.08);
}

// A rolling drawer unit under the right end: white, three drawers on its
// front with steel pulls, on casters.
function drawers(k: Kit): void {
  k.shadow(4.75, 1.5, 1.0, 1.2, 0.26);
  for (const [u, w] of [[4.2, 0.65], [5.3, 0.65], [4.2, 2.35], [5.3, 2.35]] as const) caster(k, u, w, 'v');
  k.box(4.0, 0.45, 0.32, 1.5, 2.1, 3.2, C.white, { line: k.thin });
  const front = 2.55;
  const seams: Array<[P3, P3]> = [1.38, 2.45].map((z) => [[4.0, front, 0.32 + z], [5.5, front, 0.32 + z]]);
  k.segs(seams, INK, Math.max(0.7, k.thin * 0.7));
  const pulls: Array<[P3, P3]> = [0.32 + 1.15, 0.32 + 2.22, 0.32 + 2.95].map((z) => [[4.5, front + 0.02, z], [5.0, front + 0.02, z]]);
  k.segs(pulls, INK, Math.max(1.2, 0.14 * k.s), 'round');
  k.segs(pulls, C.steelLight, Math.max(0.6, 0.07 * k.s), 'round');
}

// ── the ink and shapes of little things ─────────────────────────────────────
// The kit's thin line is about a fifth of a unit, as thick as a little
// thing's parts: what stands on the top is outlined at half that (`edge`)
// and its inner lines at a quarter (`seam`).

const edge = (k: Kit): number => Math.max(1, 0.1 * k.s);
const seam = (k: Kit): number => Math.max(0.6, 0.05 * k.s);

// A rod (an arm, a pen, a band) w units thick in `color`, edged in ink
// (a seam's worth each side: a rod is thinner than a thing).
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  const px = Math.max(0.8, w * k.s);
  k.line(pts, INK, px + 2 * seam(k));
  k.line(pts, color, px);
}

type Ell = { cx: number; cy: number; rx: number; ry: number; rot: number };

// The screen ellipse of an ellipsoid at c with radii r along u, v and z: its
// outline as the pen sees it (a ball when the three are one).
function ovoid(k: Kit, c: P3, r: P3): Ell {
  const [cx, cy] = k.p(...c);
  const axis = (du: number, dv: number, dz: number): Pt => {
    const [x, y] = k.p(c[0] + du, c[1] + dv, c[2] + dz);
    return [x - cx, y - cy];
  };
  const a = axis(r[0], 0, 0);
  const b = axis(0, r[1], 0);
  const d = axis(0, 0, r[2]);
  const p = a[0] * a[0] + b[0] * b[0] + d[0] * d[0];
  const q = a[0] * a[1] + b[0] * b[1] + d[0] * d[1];
  const t = a[1] * a[1] + b[1] * b[1] + d[1] * d[1];
  const mid = (p + t) / 2;
  const dif = Math.hypot((p - t) / 2, q);
  return { cx, cy, rx: Math.sqrt(mid + dif), ry: Math.sqrt(Math.max(0, mid - dif)), rot: 0.5 * Math.atan2(2 * q, p - t) };
}

// An ellipsoid, shaded across (lit left), edged in ink.
function blob(k: Kit, c: P3, r: P3, base: Color, line = edge(k)): Ell {
  const e = ovoid(k, c, r);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  k.paint(across(k, [[e.cx - e.rx, e.cy], [e.cx + e.rx, e.cy]], base, 0.22, 0.26), line);
  return e;
}

// A glint on a round thing: a small pale oval up its lit side.
function glint(k: Kit, e: Ell, a = 0.55): void {
  k.pen.beginPath();
  k.pen.ellipse(e.cx - e.rx * 0.38, e.cy - e.ry * 0.4, Math.max(0.6, e.rx * 0.26), Math.max(0.4, e.ry * 0.17), -0.6, 0, Math.PI * 2);
  k.pen.fillStyle = withAlpha('#ffffff', a);
  k.pen.fill();
}

// Fills (and inks, line > 0) a polygon of screen points.
function fillPts(k: Kit, pts: ReadonlyArray<Pt>, c: Color | null, line = 0): void {
  k.pen.beginPath();
  pts.forEach(([x, y], i) => (i ? k.pen.lineTo(x, y) : k.pen.moveTo(x, y)));
  k.pen.closePath();
  k.paint(c, line);
}

// A low dome on a level rim at z (a lens, a lid): radius r, h tall.
function cap(k: Kit, u: number, w: number, z: number, r: number, h: number, fill: Color): void {
  const pts: Pt[] = [...ring(k, [u, w, z], [0, 0, 1], r, 20)];
  for (let i = 1; i <= 5; i++) {
    const a = (i / 5) * (Math.PI / 2);
    pts.push(...ring(k, [u, w, z + Math.sin(a) * h], [0, 0, 1], Math.cos(a) * r, 14));
  }
  const sil = hull(pts);
  fillPts(k, sil, null);
  k.paint(across(k, sil, fill, 0.25, 0.2), edge(k));
}

// A soft shadow on the top under a thing.
const sit = (k: Kit, u: number, w: number, z: number, r: number): void => k.shadow(u, w, r, r * 0.9, 0.24, z);

// ── the pool ────────────────────────────────────────────────────────────────
// Each fills most of its 0.45 round and stands at most 1.2 tall (the room
// a spot has between the agent and the screen): chunky shapes and plain
// colours, to read at a terminal's few pixels a unit.

// A blue mug of coffee, its handle a ring on the +u side.
const blueMug: Clutter = {
  name: 'mug',
  r: 0.45,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.34;
    const c = u - 0.08;
    sit(k, u, w, z, 0.42);
    k.cyl(c, w, z, r, 0.56, C.fabricB, { line: edge(k) });
    k.disc(c, w, z + 0.535, r * 0.8, C.coffee, seam(k));
    // the handle, on the near side, so after the body
    const handle: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const th = -Math.PI / 2 + (i / 12) * Math.PI;
      handle.push([c + r * 0.92 + Math.cos(th) * 0.17, w, z + 0.29 + Math.sin(th) * 0.15]);
    }
    stick(k, handle, shade(C.fabricB, -0.08), 0.08);
  },
};

// A takeaway coffee: a white paper cup, a kraft sleeve round its middle, a
// white lid with a raised rim and a sip hole.
const coffeeCup: Clutter = {
  name: 'coffeeCup',
  r: 0.4,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    sit(k, u, w, z, 0.36);
    frustum(k, u, w, z, 0.25, z + 0.85, 0.34, C.white, null, edge(k));
    frustum(k, u, w, z + 0.28, 0.284, z + 0.58, 0.316, '#c8975f', null, edge(k));
    k.cyl(u, w, z + 0.85, 0.37, 0.08, '#f7f6f2', { line: edge(k) });
    k.cyl(u, w, z + 0.93, 0.28, 0.09, '#ecebe6', { line: edge(k) });
    k.disc(u + 0.08, w + 0.12, z + 1.02, 0.06, C.coffee, 0);
  },
};

// A can of sparkling water: lilac, a white wave round it, a steel top and
// its tab.
const seltzer: Clutter = {
  name: 'seltzer',
  r: 0.3,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const r = 0.25;
    sit(k, u, w, z, 0.3);
    k.cyl(u, w, z, r, 0.8, C.noteLilac, { line: edge(k), top: C.chrome });
    // the wave, round the side that shows (normals toward +u and +v)
    const wave: P3[] = [];
    for (let i = 0; i <= 18; i++) {
      const th = -Math.PI / 4 + (i / 18) * Math.PI;
      wave.push([u + Math.cos(th) * r, w + Math.sin(th) * r, z + 0.4 + Math.sin(th * 3) * 0.08]);
    }
    k.line(wave, '#ffffff', Math.max(0.9, 0.11 * k.s));
    k.disc(u, w, z + 0.8, 0.19, shade(C.chrome, -0.14), seam(k));
    k.disc(u + 0.04, w + 0.05, z + 0.805, 0.08, C.chrome, seam(k));
  },
};

// A succulent: a rosette of fat sage leaves in a terracotta pot.
const ROSETTE: ReadonlyArray<readonly [number, number, number, Color]> = [
  [-Math.PI / 2 - 0.3, 0.62, 0.21, '#6f9f6a'],
  [-Math.PI / 2 + 0.3, 0.62, 0.21, '#6f9f6a'],
  [-Math.PI / 2 - 0.95, 0.56, 0.2, '#86b980'],
  [-Math.PI / 2 + 0.95, 0.56, 0.2, '#86b980'],
  [-Math.PI / 2, 0.52, 0.2, '#9fcf95'],
  [-Math.PI / 2 - 1.45, 0.45, 0.17, '#9fcf95'],
  [-Math.PI / 2 + 1.45, 0.45, 0.17, '#9fcf95'],
];
const succulent: Clutter = {
  name: 'succulent',
  r: 0.45,
  h: 1.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    sit(k, u, w, z, 0.4);
    frustum(k, u, w, z, 0.26, z + 0.42, 0.34, C.terracotta, null, edge(k));
    k.cyl(u, w, z + 0.36, 0.36, 0.11, shade(C.terracotta, 0.08), { line: edge(k), top: '#4a3428' });
    const [x, y] = k.p(u, w, z + 0.47);
    // back to front: the tall middle leaves, then the ones fanning out
    for (const [a, len, wd, c] of ROSETTE) leaf(k, x, y, a, len * k.s, wd * k.s, c, false, edge(k));
  },
};

// A rubber duck, for talking a bug through: a yellow body and head, an
// orange beak, facing the agent (+v).
const rubberDuck: Clutter = {
  name: 'rubberDuck',
  r: 0.45,
  h: 0.9,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const yellow = '#ffd23f';
    sit(k, u, w, z, 0.42);
    // the tail, up at the back
    k.poly([[u - 0.13, w - 0.3, z + 0.3], [u + 0.13, w - 0.3, z + 0.3], [u, w - 0.5, z + 0.56]], shade(yellow, -0.08), edge(k));
    const body = blob(k, [u, w - 0.04, z + 0.26], [0.34, 0.4, 0.26], yellow);
    // the wing, a darker curve on its near side
    k.line([[u + 0.27, w - 0.2, z + 0.35], [u + 0.34, w, z + 0.27], [u + 0.27, w + 0.15, z + 0.19]], shade(yellow, -0.32), Math.max(0.7, 0.06 * k.s));
    const head = blob(k, [u, w + 0.18, z + 0.66], [0.22, 0.22, 0.21], yellow);
    blob(k, [u, w + 0.4, z + 0.61], [0.1, 0.11, 0.05], '#ff8a3a');
    // its eye, on the side that shows
    const [ex, ey] = k.p(u + 0.13, w + 0.28, z + 0.74);
    k.pen.beginPath();
    k.pen.arc(ex, ey, Math.max(0.8, 0.045 * k.s), 0, Math.PI * 2);
    k.pen.fillStyle = INK;
    k.pen.fill();
    glint(k, head, 0.5);
    glint(k, body, 0.35);
  },
};

// A pad of yellow sticky notes, a pink one stuck on top at a slant, its
// loose corner curled up.
const stickyNotes: Clutter = {
  name: 'stickyNotes',
  r: 0.45,
  h: 0.35,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = 0.34;
    sit(k, u, w, z, 0.44);
    k.box(u - e, w - e, z, 2 * e, 2 * e, 0.24, C.noteYellow, { line: edge(k), stripe: false });
    const edges: Array<[P3, P3]> = [];
    for (const dz of [0.08, 0.16]) {
      edges.push([[u + e, w - e + 0.03, z + dz], [u + e, w + e, z + dz]]);
      edges.push([[u - e + 0.03, w + e, z + dz], [u + e, w + e, z + dz]]);
    }
    k.segs(edges, shade(C.noteYellow, -0.3), seam(k) * 0.8);
    const a = 0.4;
    const n = 0.28;
    const corner = (du: number, dv: number): P3 => [u + du * Math.cos(a) - dv * Math.sin(a), w + du * Math.sin(a) + dv * Math.cos(a), z + 0.245];
    k.poly([corner(-n, -n), corner(n, -n), corner(n, 0.06), corner(0.06, n), corner(-n, n)], C.notePink, edge(k));
    const [cu, cw] = corner(0.2, 0.2);
    k.poly([corner(0.06, n), corner(n, 0.06), [cu, cw, z + 0.33]], shade(C.notePink, 0.28), seam(k));
  },
};

// Two notebooks, one on the other, their page edges showing under their
// covers, a pen lying across the top.
const notebooks: Clutter = {
  name: 'notebooks',
  r: 0.45,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const pages = '#f6efe0';
    sit(k, u, w, z, 0.45);
    const book = (u0: number, w0: number, z0: number, cover: Color) => {
      const [du, dv, dz] = [0.76, 0.54, 0.15];
      k.box(u0, w0, z0, du, dv, dz, cover, { line: edge(k), top: cover, left: pages, right: shade(pages, -0.12), stripe: false });
      // the bottom cover, a band along the foot of the page edges
      k.segs([[[u0 + du, w0, z0 + 0.02], [u0 + du, w0 + dv, z0 + 0.02]], [[u0, w0 + dv, z0 + 0.02], [u0 + du, w0 + dv, z0 + 0.02]]], cover, Math.max(0.8, 0.05 * k.s));
    };
    book(u - 0.4, w - 0.24, z, C.table);
    book(u - 0.35, w - 0.31, z + 0.15, C.fabricA);
    stick(k, [[u - 0.25, w + 0.14, z + 0.34], [u + 0.27, w - 0.2, z + 0.34]], C.penBlue, 0.07);
    k.line([[u + 0.2, w - 0.155, z + 0.34], [u + 0.27, w - 0.2, z + 0.34]], '#ffffff', Math.max(0.6, 0.06 * k.s));
  },
};

// A phone leant back on a little birch stand, its screen to the agent: lit,
// a note come in, while at work; dark with a sheen while not.
const phone: Clutter = {
  name: 'phone',
  r: 0.4,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    sit(k, u, w, z, 0.36);
    k.box(u - 0.29, w - 0.26, z, 0.58, 0.5, 0.06, C.birch, { line: edge(k), stripe: false });
    k.box(u - 0.29, w + 0.12, z + 0.06, 0.58, 0.12, 0.1, C.birchDark, { line: edge(k), stripe: false });
    // the phone: its front face, leant back, and the case round it
    const bl: P3 = [u - 0.24, w + 0.11, z + 0.1];
    const br: P3 = [u + 0.24, w + 0.11, z + 0.1];
    const tl: P3 = [u - 0.24, w - 0.17, z + 0.98];
    const tr: P3 = [u + 0.24, w - 0.17, z + 0.98];
    const back = (p: P3): P3 => [p[0], p[1] - 0.06, p[2] - 0.02];
    const sil = hull([bl, br, tr, tl, back(bl), back(br), back(tr), back(tl)].map((p) => k.p(...p)));
    fillPts(k, sil, '#2a2d34', edge(k));
    // a point on its face: s across, t up
    const on = (s: number, t: number): P3 => [bl[0] + (br[0] - bl[0]) * s, bl[1] + (tl[1] - bl[1]) * t, bl[2] + (tl[2] - bl[2]) * t];
    const glassQ = [on(0.1, 0.05), on(0.9, 0.05), on(0.9, 0.95), on(0.1, 0.95)];
    if (v.active) {
      k.poly(glassQ, k.grad(on(0.5, 0.05), on(0.5, 0.95), [[0, '#2b4d70'], [1, '#4f8fc0']]), 0);
      k.poly([on(0.18, 0.7), on(0.82, 0.7), on(0.82, 0.85), on(0.18, 0.85)], C.chart, 0, 0.05);
      k.segs([[on(0.2, 0.52), on(0.75, 0.52)], [on(0.2, 0.4), on(0.6, 0.4)]], withAlpha('#ffffff', 0.55), Math.max(0.6, 0.05 * k.s), 'round');
      k.halo(...on(0.5, 0.5), 0.4, C.screenGlow, 0.3);
    } else {
      k.poly(glassQ, '#1b2430', 0);
      k.poly([on(0.1, 0.55), on(0.45, 0.95), on(0.65, 0.95), on(0.1, 0.3)], withAlpha('#ffffff', 0.12), 0);
    }
  },
};

// Over-ear headphones stood on their cups, the band arched over: one cup
// shows its cushion, the other its coral cap.
const headphones: Clutter = {
  name: 'headphones',
  r: 0.45,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const shell = '#34363c';
    sit(k, u, w, z, 0.44);
    // a cup with its axis along u, from a0 to a1, its face at a1 `face`
    const cup = (a0: number, a1: number, face: Color) => {
      const c = z + 0.28;
      const sil = hull([...ring(k, [a0, w, c], [1, 0, 0], 0.27, 18), ...ring(k, [a1, w, c], [1, 0, 0], 0.27, 18)]);
      fillPts(k, sil, shell, edge(k));
      fillPts(k, ring(k, [a1, w, c], [1, 0, 0], 0.2, 18), face, seam(k));
    };
    cup(u - 0.47, u - 0.29, '#5d6068');
    const band: P3[] = [];
    for (let i = 0; i <= 16; i++) {
      const th = (i / 16) * Math.PI;
      band.push([u - 0.38 * Math.cos(th), w, z + 0.5 + 0.45 * Math.sin(th)]);
    }
    stick(k, band, shell, 0.1);
    stick(k, band.slice(5, 12), '#5d6068', 0.13);
    cup(u + 0.29, u + 0.47, C.fabricA);
  },
};

// A little vinyl robot: a white body on stubby legs, a boxy head with a
// dark visor and two round eyes (lit teal while at work), an antenna with
// a red ball.
const robot: Clutter = {
  name: 'robot',
  r: 0.4,
  h: 1.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const white = '#eef0f2';
    sit(k, u, w, z, 0.36);
    for (const du of [-0.12, 0.12]) k.box(u + du - 0.07, w - 0.085, z, 0.14, 0.17, 0.22, C.steelLight, { line: edge(k), stripe: false });
    stick(k, [[u - 0.23, w, z + 0.5], [u - 0.3, w + 0.05, z + 0.31]], '#c9cdd3', 0.09);
    k.box(u - 0.2, w - 0.16, z + 0.2, 0.4, 0.32, 0.36, white, { line: edge(k), stripe: false });
    k.rect(u - 0.08, z + 0.29, u + 0.08, z + 0.43, w + 0.161, v.active ? C.chart : '#4a7f7b', seam(k));
    stick(k, [[u + 0.23, w, z + 0.5], [u + 0.3, w + 0.05, z + 0.31]], '#c9cdd3', 0.09);
    k.box(u - 0.25, w - 0.19, z + 0.55, 0.5, 0.38, 0.36, white, { line: edge(k), round: 0.06, stripe: false });
    const n = w + 0.191;
    k.rect(u - 0.19, z + 0.61, u + 0.19, z + 0.85, n, '#1d2a3a', seam(k));
    const eye = v.active ? C.screenGlow : '#3c6a80';
    for (const du of [-0.09, 0.09]) k.face(u + du, n + 0.001, z + 0.73, 0.055, eye, 0, 12);
    if (v.active) k.halo(u, n, z + 0.73, 0.3, C.screenGlow, 0.35);
    stick(k, [[u, w, z + 0.91], [u, w, z + 1.06]], C.steel, 0.05);
    glint(k, blob(k, [u, w, z + 1.1], [0.065, 0.065, 0.065], C.chartHot), 0.5);
  },
};

// A puzzle cube, mid-solve: a black body, its three showing faces a
// jumble of coloured squares.
const CUBE: readonly Color[] = [C.chartHot, C.white, C.fabricB, C.fabricC, C.leaf, C.fabricA];
const TILES = ['203145032', '512340251', '450123304'];
const puzzleCube: Clutter = {
  name: 'puzzleCube',
  r: 0.45,
  h: 0.65,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const e = 0.62;
    const u0 = u - e / 2;
    const w0 = w - e / 2;
    sit(k, u, w, z, 0.44);
    k.box(u0, w0, z, e, e, e, '#2a2a2e', { line: edge(k), stripe: false });
    const t = e / 3;
    const g = 0.025;
    const d = t - 2 * g;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const a = i * t + g;
        const b = j * t + g;
        const top = CUBE[Number(TILES[0][i * 3 + j])];
        const east = CUBE[Number(TILES[1][i * 3 + j])];
        const south = CUBE[Number(TILES[2][i * 3 + j])];
        k.poly([[u0 + a, w0 + b, z + e], [u0 + a + d, w0 + b, z + e], [u0 + a + d, w0 + b + d, z + e], [u0 + a, w0 + b + d, z + e]], shade(top, 0.08), 0);
        k.poly([[u0 + e, w0 + a, z + b], [u0 + e, w0 + a + d, z + b], [u0 + e, w0 + a + d, z + b + d], [u0 + e, w0 + a, z + b + d]], k.side(east, 1, 0), 0);
        k.poly([[u0 + a, w0 + e, z + b], [u0 + a + d, w0 + e, z + b], [u0 + a + d, w0 + e, z + b + d], [u0 + a, w0 + e, z + b + d]], k.side(south, 0, 1), 0);
      }
    }
  },
};

// A pink frosted donut with sprinkles, lying on the top.
const SPRINKLES: ReadonlyArray<readonly [number, number, Color]> = [
  [0.3, 0.22, C.noteTeal], [1.2, 0.28, C.fabricC], [2.1, 0.21, '#ffffff'], [2.9, 0.28, C.fabricB],
  [3.7, 0.22, C.fabricC], [4.5, 0.28, C.noteTeal], [5.3, 0.22, '#ffffff'], [6.0, 0.27, C.fabricB],
];
const donut: Clutter = {
  name: 'donut',
  r: 0.45,
  h: 0.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const dough = '#d9a066';
    sit(k, u, w, z, 0.44);
    k.cyl(u, w, z, 0.4, 0.17, dough, { line: edge(k) });
    k.disc(u, w, z + 0.175, 0.34, C.notePink, seam(k));
    k.disc(u, w, z + 0.18, 0.11, shade(dough, -0.3), seam(k));
    for (const [a, r, c] of SPRINKLES) {
      const p: P3 = [u + Math.cos(a) * r, w + Math.sin(a) * r, z + 0.18];
      k.line([p, [p[0] + Math.cos(a + 1.4) * 0.07, p[1] + Math.sin(a + 1.4) * 0.07, p[2]]], c, Math.max(0.8, 0.05 * k.s));
    }
  },
};

// ── the loops ───────────────────────────────────────────────────────────────

// A Newton's cradle in the front right corner: five steel balls hung from
// a chrome frame on a walnut base. Frame 0 hangs still (a ball just
// struck); at work the right end ball swings out and back, then the left
// one, a full swing a second.
const CRADLE: P3 = [6.3, 2.35, TOP];
const SWING: ReadonlyArray<readonly [number, number]> = [[0, 0], [0, 0.18], [0, 0.3], [0, 0.18], [0, 0], [0.18, 0], [0.3, 0], [0.18, 0]];
const cradle: DeskLoop = {
  name: 'cradle',
  at: CRADLE,
  r: 0.6,
  h: 1.2,
  frames: 8,
  fps: 8,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = CRADLE;
    const top = z + 1.1;
    const L = 0.7;
    const br = 0.1;
    const [left, right] = v.active ? SWING[i % SWING.length] : [0, 0];
    k.shadow(u, w, 0.62, 0.38, 0.24, z);
    k.box(u - 0.56, w - 0.3, z, 1.12, 0.6, 0.12, C.plankDark, { line: edge(k), stripe: false });
    const bar = (n: number) => stick(k, [[u - 0.5, n, z + 0.12], [u - 0.5, n, top], [u + 0.5, n, top], [u + 0.5, n, z + 0.12]], C.chrome, 0.05);
    bar(w - 0.22);
    const balls = [0, 1, 2, 3, 4].map((j) => {
      const th = j === 0 ? -left : j === 4 ? right : 0;
      const hang = u + (j - 2) * 2 * br;
      return { hang, at: [hang + L * Math.sin(th), w, top - L * Math.cos(th)] as P3 };
    });
    const string = Math.max(0.5, 0.025 * k.s);
    const strings = (n: number): Array<[P3, P3]> => balls.map((b) => [[b.hang, n, top], b.at]);
    k.segs(strings(w - 0.22), withAlpha(INK, 0.6), string);
    for (const b of [...balls].sort((p, q) => p.at[0] - q.at[0])) glint(k, blob(k, b.at, [br, br, br], C.chrome, seam(k)), 0.8);
    k.segs(strings(w + 0.22), withAlpha(INK, 0.6), string);
    bar(w + 0.22);
  },
};

// A busy light clipped on the monitor's top, at its right corner: a white
// puck, its dome lit red while at work, its red light swelling out round it
// and ebbing slowly (two seconds a breath, never out); while not, the dome
// is grey and throws no light.
const BUSY: P3 = [4.6, 0.75, MON.z1];
const BREATH = [0.3, 0.45, 0.65, 0.85, 1, 0.85, 0.65, 0.45];
const busyLight: DeskLoop = {
  name: 'busyLight',
  at: BUSY,
  r: 0.35,
  h: 0.6,
  frames: 8,
  fps: 4,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = BUSY;
    const glow = v.active ? BREATH[i % BREATH.length] : 0;
    k.box(u - 0.23, w - 0.18, z, 0.46, 0.36, 0.07, C.steel, { line: edge(k), stripe: false });
    k.cyl(u, w, z + 0.07, 0.27, 0.13, '#e3e6ea', { line: edge(k) });
    if (glow > 0) {
      // the swell: red light painted over what is behind (so it shows on a
      // pale wall as on a dark one)
      const [x, y] = k.p(u, w, z + 0.3);
      const R = (0.32 + 0.4 * glow) * k.s;
      const g = k.pen.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, withAlpha('#ff3030', 0.55 + 0.35 * glow));
      g.addColorStop(0.45, withAlpha('#ff3030', 0.2 + 0.2 * glow));
      g.addColorStop(1, withAlpha('#ff3030', 0));
      k.pen.beginPath();
      k.pen.arc(x, y, R, 0, Math.PI * 2);
      k.pen.fillStyle = g;
      k.pen.fill();
    }
    const lens = glow > 0 ? mix('#e8262a', '#ff6a5a', glow) : '#9a9396';
    cap(k, u, w, z + 0.2, 0.21, 0.2, lens);
    if (glow > 0) k.halo(u - 0.06, w, z + 0.32, 0.1 + 0.06 * glow, '#fff1e8', 0.4 + 0.4 * glow);
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw: drawDesk,
  // the monitor's glass, inside its bezel
  screen: [
    [2.65, MON.v1, 6.8],
    [4.9, MON.v1, 6.8],
    [4.9, MON.v1, 9.5],
    [2.65, MON.v1, 9.5],
  ],
  // the right end's back corner, clear of the agent and the screen
  top: [6.5, 0.5, TOP],
  clutter: {
    items: [blueMug, coffeeCup, seltzer, succulent, rubberDuck, stickyNotes, notebooks, phone, headphones, robot, puzzleCube, donut],
    // left of the monitor; then a row across the open strip before it,
    // clear of its glass and behind the keyboard, each 1.1 from the next
    // (two things of 0.45 never touch) and spread across the view, so
    // that one seldom stands right behind another
    spots: [
      [1.75, 0.85, TOP],
      [2.95, 1.6, TOP],
      [4.05, 1.65, TOP],
      [5.15, 1.72, TOP],
    ],
  },
  loops: [cradle, busyLight],
};
