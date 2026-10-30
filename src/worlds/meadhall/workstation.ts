import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { candle, fillPts, flame, horn, hull, ring, zigzag } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf } from './kit.ts';

// Longhall's workstation (see WorkstationArt in ../types.ts): a scribe's
// desk. A thick carved plank on two trestles, a shelf between them with a
// bundle of scrolls; on it a small timber frame with a stretched vellum in
// it (the screen: the shared activity layer paints on it); in front of the
// agent a sheet of parchment, a horn inkwell with its quill; a candle on
// an iron stand at the front of its right end. The back of its right end
// is kept clear for a desk upgrade, beside the frame and away from the
// agent. Looks: 0 a drinking horn on the desk, 1 a scroll with a plain wax
// seal, 2 a small round shield leaning on the right trestle. On: the
// candle lit.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) lights the candle; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const TOP = 6.0; // the desk's top
// The vellum's frame: posts, a top bar and a foot rail round the screen.
const FRAME = { u0: 1.85, u1: 5.65, post: 0.35, v0: 0.4, v1: 0.8, z1: 10, bar: 0.45, rail: 0.35 };
const SCREEN = { u0: 2.5, u1: 5.0, v: 0.75, z0: 6.65, z1: 9.35 };
// The candle's stand, at the front of the desk's right end.
const CANDLE = { u: 6.5, v: 2.5 };

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.3);
    // the left trestle, the shelf and its scrolls, the right trestle
    trestle(k, 0.35);
    k.box(0.95, 1.2, 1.1, 5.1, 0.55, 0.45, C.timberDark, { line: k.thin, stripe: false });
    k.box(0.95, 0.55, 1.55, 5.1, 1.9, 0.3, C.timberDark, { line: k.thin });
    scrolls(k, 2.9, 1.85);
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
    // in front of the agent: a sheet of parchment; the inkwell and its quill
    k.poly([[0.55, 1.75, TOP + 0.02], [2.55, 1.6, TOP + 0.02], [2.7, 2.7, TOP + 0.02], [0.7, 2.85, TOP + 0.02]], C.parchment, k.thin);
    if (k.fine) {
      const rows: Array<readonly [P3, P3]> = [];
      for (let i = 0; i < 4; i++) {
        const f = 0.2 + i * 0.2;
        rows.push([[0.85 + f * 0.15, 1.75 + f * 1.05, TOP + 0.03], [2.3 + f * 0.15 - (i === 3 ? 0.6 : 0), 1.62 + f * 1.05, TOP + 0.03]]);
      }
      k.segs(rows, '#8a7656', Math.max(0.7, 0.07 * k.s), 'round');
    }
    inkwell(k, 3.2, 2.35);
    // the look's own thing
    if (look === 0) horn(k, [[5.85, 2.3, TOP + 0.42], [5.15, 2.45, TOP + 0.36], [4.5, 2.5, TOP + 0.45], [4.0, 2.4, TOP + 0.85]], 0.4);
    if (look === 1) sealedScroll(k, 3.95, 5.85, 2.35);
    // the candle on its iron stand: a foot, a stem with a ring to hold it
    // by, a dish
    const { u: cu, v: cv } = CANDLE;
    k.disc(cu, cv, TOP + 0.02, 0.38, C.iron, k.thin);
    k.rod([[cu, cv, TOP + 0.05], [cu, cv, TOP + 0.5]], C.iron, 0.11);
    k.rod([[cu + 0.05, cv + 0.05, TOP + 0.2], [cu + 0.35, cv + 0.3, TOP + 0.24], [cu + 0.32, cv + 0.32, TOP + 0.44], [cu + 0.05, cv + 0.05, TOP + 0.44]], C.iron, 0.08);
    k.disc(cu, cv, TOP + 0.52, 0.34, C.iron, k.thin);
    k.disc(cu, cv, TOP + 0.58, 0.23, C.ironDark, 0);
    candle(k, cu, cv, TOP + 0.58, 0.8, false);
    // lit: the flame, and a warm pool of its light on the desk
    if (v.active) {
      flame(k, cu, cv, TOP + 1.78, 1, 0.5, 0.42);
      k.pool(cu - 1.2, 2.2, 2.0, 0.9, '#ffb060', 0.16, TOP + 0.02);
    }
  },
  screen: [
    [SCREEN.u0, SCREEN.v, SCREEN.z0],
    [SCREEN.u1, SCREEN.v, SCREEN.z0],
    [SCREEN.u1, SCREEN.v, SCREEN.z1],
    [SCREEN.u0, SCREEN.v, SCREEN.z1],
  ],
  top: [6.5, 0.55, TOP],
};

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
function roll(k: Kit, u0: number, u1: number, v: number, z: number, r: number, color: Color = C.parchment): void {
  fillPts(k, hull([...ring(k, [u0, v, z], [1, 0, 0], r, 12), ...ring(k, [u1, v, z], [1, 0, 0], r, 12)]), color, k.thin);
  fillPts(k, ring(k, [u1, v, z], [1, 0, 0], r, 12), shade(color, -0.1), k.thin);
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

// A horn inkwell set in a little block on the desk, its quill in it.
function inkwell(k: Kit, u: number, v: number): void {
  k.box(u - 0.4, v - 0.35, TOP, 0.8, 0.7, 0.35, C.timberDark, { line: k.thin });
  horn(k, [[u, v, TOP + 1.15], [u + 0.04, v + 0.03, TOP + 0.75], [u + 0.18, v + 0.1, TOP + 0.36]], 0.3);
  k.disc(u, v, TOP + 1.15, 0.2, '#120c10', 0);
  // the quill, leaning out to the front: its shaft, then the vane
  const nib: P3 = [u + 0.03, v + 0.03, TOP + 0.95];
  const end: P3 = [u + 0.75, v + 0.5, TOP + 1.85];
  const at = (f: number, off: number): P3 => [nib[0] + (end[0] - nib[0]) * f + off, nib[1] + (end[1] - nib[1]) * f - off * 0.4, nib[2] + (end[2] - nib[2]) * f];
  k.poly([at(0.25, 0), at(0.45, 0.22), at(0.8, 0.2), at(1, 0), at(0.75, -0.14), at(0.45, -0.12)], C.cream, k.thin);
  k.line([nib, end], shade(C.cream, -0.3), Math.max(0.8, 0.07 * k.s));
}

// A scroll with a plain wax seal on a ribbon, lying along u.
function sealedScroll(k: Kit, u0: number, u1: number, v: number): void {
  const r = 0.36;
  roll(k, u0, u1, v, TOP + r, r);
  const um = (u0 + u1) / 2 - 0.2;
  k.line([[um, v + r * 0.2, TOP + r * 1.9], [um, v + r, TOP + r], [um + 0.15, v + r + 0.15, TOP + 0.15]], C.redDark, Math.max(1, 0.12 * k.s));
  k.face(um + 0.15, v + r + 0.18, TOP + 0.3, 0.3, C.red, k.thin, 14);
  k.face(um + 0.13, v + r + 0.19, TOP + 0.33, 0.16, shade(C.red, 0.15), 0, 10);
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
