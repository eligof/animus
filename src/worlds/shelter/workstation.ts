import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { dot, frustum, rivets } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, kitOf, withAlpha } from './kit.ts';

// Atomic Shelter's workstation (see WorkstationArt in ../types.ts): a steel desk with a terminal.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A riveted steel desk on a drawer pedestal (its left end) and a plain
// side panel (its right end), a teal trim along its front edge. On it, at
// the right, a chunky teal terminal in a riveted case (its right back
// corner kept clear for a desk upgrade), the glass set in a
// dark bezel with a rim of green phosphor; before it a keyboard and a
// stack of punch cards; at the front left a gooseneck lamp, its shade
// mint, pink or aqua by look, lit while the screen is on.

const ZT = 6.0; // the desk's top
const GLASS = { u0: 2.95, u1: 5.55, n: 1.35, z0: 6.7, z1: 9.45 };
const SHADES = [C.mint, C.pink, C.aqua] as const;

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the modesty panel at the back, the plain right end, the pedestal
    k.box(2.6, 0.35, 1.6, 3.7, 0.3, ZT - 2.2, shade(C.steel, -0.2), { line: k.thin, stripe: false });
    k.box(6.2, 0.3, 0, 0.5, 2.4, ZT - 0.6, C.steel, { stripe: false });
    k.box(0.3, 0.3, 0, 2.3, 2.4, ZT - 0.6, C.steel, { stripe: false });
    // the pedestal's three drawers, each with a chrome pull
    for (const [z0, z1] of [[0.35, 1.95], [2.15, 3.5], [3.7, 5.05]] as const) {
      k.rect(0.55, z0, 2.35, z1, 2.71, k.side(C.steelLight, 0, 1, 0.12), k.thin);
      k.box(1.1, 2.7, (z0 + z1) / 2 - 0.12, 0.7, 0.18, 0.24, C.chrome, { line: k.thin * 0.8, stripe: false });
    }
    if (k.fine) rivets(k, [[0.45, 2.71, 0.2], [2.45, 2.71, 0.2], [6.35, 2.71, 0.2], [6.55, 2.71, 0.2]]);
    // the top: steel with a teal trim along its front edge
    k.box(0, 0, ZT - 0.6, DESK.len, DESK.dep, 0.6, C.steelLight);
    k.rect(0.05, ZT - 0.55, DESK.len - 0.05, ZT - 0.12, DESK.dep + 0.01, C.teal, k.thin);
    if (k.fine) rivets(k, [[0.35, DESK.dep + 0.02, ZT - 0.38], [3.5, DESK.dep + 0.02, ZT - 0.38], [6.65, DESK.dep + 0.02, ZT - 0.38]]);
    // the terminal: a deep case, its riveted front, the bezel and the
    // phosphor rim round the glass, two orange knobs under it
    const g = GLASS;
    k.box(2.55, 0.15, ZT, 3.4, g.n - 0.15, 3.95, C.teal, { round: 0.3 });
    if (k.fine) {
      // vents along the case's top
      const vents: Array<[P3, P3]> = [];
      for (let i = 0; i < 4; i++) vents.push([[3.3 + i * 0.25, 0.45, ZT + 3.96], [3.3 + i * 0.25, 0.95, ZT + 3.96]]);
      k.segs(vents, C.tealDark, Math.max(0.8, 0.1 * k.s), 'round');
    }
    k.rect(g.u0 - 0.24, g.z0 - 0.22, g.u1 + 0.24, g.z1 + 0.2, g.n + 0.005, C.crtDark, k.thin);
    k.rect(g.u0 - 0.13, g.z0 - 0.12, g.u1 + 0.13, g.z1 + 0.11, g.n + 0.01, v.active ? C.crt : C.crtDim, 0);
    for (const u of [3.2, 3.6]) dot(k, u, g.n + 0.02, ZT + 0.3, 0.15, C.orange, k.thin * 0.7);
    dot(k, 5.3, g.n + 0.02, ZT + 0.3, 0.1, v.active ? C.radar : C.crtDim, 0);
    if (k.fine) {
      const rv: P3[] = [];
      for (const u of [2.72, 5.78]) for (const z of [ZT + 0.22, ZT + 3.75]) rv.push([u, g.n + 0.01, z]);
      rivets(k, rv);
    }
    // the keyboard before the agent: a cream wedge with rows of keys
    const kb = (fu: number, fv: number): P3 => [1.05 + fu * 2.6, 1.65 + fv * 1.0, ZT + 0.45 - fv * 0.3];
    k.box(1.05, 1.65, ZT, 2.6, 1.0, 0.15, shade(C.cream, -0.12), { line: k.thin, stripe: false });
    k.poly([kb(0, 0), kb(1, 0), kb(1, 1), kb(0, 1)], C.cream, k.lw);
    k.poly([kb(1, 0), kb(1, 1), [3.65, 2.65, ZT], [3.65, 1.65, ZT]], shade(C.cream, -0.2), k.thin);
    const keys: Array<[P3, P3]> = [];
    for (let r = 0; r < 3; r++) keys.push([kb(0.1, 0.22 + r * 0.28), kb(0.9, 0.22 + r * 0.28)]);
    k.segs(keys, '#4a4a40', Math.max(0.8, 0.16 * k.s));
    // a stack of punch cards, squared off, a band on the top one
    for (let i = 0; i < 4; i++) {
      const du = (i & 1) * 0.08 - 0.04;
      k.box(4.55 + du, 1.75 - du, ZT + i * 0.14, 1.5, 0.9, 0.14, i & 1 ? '#f2e9cf' : C.cream, { line: k.thin * 0.7, stripe: false });
    }
    const zc = ZT + 0.57;
    k.poly([[4.55, 1.8, zc], [6.05, 1.8, zc], [6.05, 2.02, zc], [4.55, 2.02, zc]], C.orange, 0);
    if (k.fine) {
      const holes: Array<[P3, P3]> = [];
      for (let r = 0; r < 3; r++) for (let i = 0; i < 5; i++) {
        const u = 4.75 + i * 0.25 + ((r + i) % 2) * 0.06;
        const w = 2.15 + r * 0.16;
        holes.push([[u, w, zc], [u + 0.1, w, zc]]);
      }
      k.segs(holes, withAlpha('#4a4a40', 0.8), Math.max(0.6, 0.06 * k.s));
    }
    // the gooseneck lamp at the front left: a round foot, a bent neck,
    // a shade in this look's colour
    const on = v.active;
    k.cyl(0.55, 2.35, ZT, 0.42, 0.18, C.steelDark, { line: k.thin });
    k.rod([[0.55, 2.35, ZT + 0.15], [0.5, 2.3, ZT + 1.6], [0.75, 2.1, ZT + 2.7], [1.3, 2.0, ZT + 3.0]], C.steelDark, 0.12);
    if (on) k.pool(1.7, 2.1, 1.2, 0.8, C.lamp, 0.55, ZT);
    // the bulb peeping out under the shade, then the shade over it
    const [bx, by] = k.p(1.55, 2.0, ZT + 2.15);
    const e = k.ell(1.55, 2.0, ZT + 2.15, 0.42);
    k.pen.beginPath();
    k.pen.ellipse(bx, by, e.rx, e.rx * 0.75, 0, 0, Math.PI * 2);
    k.paint(on ? C.lamp : shade(C.lamp, -0.45), k.thin);
    frustum(k, 1.55, 2.0, ZT + 3.1, 0.22, ZT + 2.4, 0.6, SHADES[look], null);
    if (on) k.halo(1.55, 2.0, ZT + 2.2, 1.6, '#ffe2a0', 0.4);
  },
  screen: [
    [GLASS.u0, GLASS.n, GLASS.z0],
    [GLASS.u1, GLASS.n, GLASS.z0],
    [GLASS.u1, GLASS.n, GLASS.z1],
    [GLASS.u0, GLASS.n, GLASS.z1],
  ],
  top: [6.5, 0.6, ZT],
};
