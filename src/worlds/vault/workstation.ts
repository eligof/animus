import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, Quad, WorkstationArt } from '../types.ts';
import { coins, fillPts, hull, rivets } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// The Vault's workstation (see WorkstationArt in ../types.ts): a teller's desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A mahogany pedestal desk with a green leather inlay; a security monitor
// in a brass frame at the back, right of the agent, two brass knobs and a
// lamp under its glass; a banker's lamp with a green shade at the left,
// lit while the screen is on (a warm pool on the leather); coins before
// the monitor. Looks: more coins, a bundle of notes in a plain band, or a
// rubber stamp on its pad. The right end of the top is kept clear for a
// desk upgrade, beside the agent rather than behind it.

const TOP = 5.6; // the desk's top
const MON = { u0: 2.2, u1: 5.9, v0: 0.15, v1: 0.95, z0: 6.0, z1: 9.95 }; // the monitor: its case, its bezel
const GLASS = { u0: 2.7, u1: 5.4, z0: 6.7, z1: 9.4 }; // the screen, inside the bezel
const LAMP = { u: 0.95, v: 0.55, z: TOP + 1.7, u0: 0.4, u1: 1.5, r: 0.5 }; // the banker's lamp's shade

const SCREEN: Quad = [
  [GLASS.u0, MON.v1 + 0.03, GLASS.z0],
  [GLASS.u1, MON.v1 + 0.03, GLASS.z0],
  [GLASS.u1, MON.v1 + 0.03, GLASS.z1],
  [GLASS.u0, MON.v1 + 0.03, GLASS.z1],
];

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = v.seed % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.3);
    // the pedestals of drawers, the panel between them set back, the top
    k.box(2.3, 0.45, 1.4, 2.4, 0.35, 3.8, C.mahoganyDark, { stripe: false });
    for (const u0 of [0.3, 4.6]) pedestal(k, u0);
    k.box(0, 0, TOP - 0.6, DESK.len, DESK.dep, 0.6, C.mahogany);
    k.rect(0.15, TOP - 0.48, DESK.len - 0.15, TOP - 0.12, DESK.dep + 0.01, withAlpha(INK, 0.18), 0);
    // the green leather, tooled in gold round its edge
    const z = TOP + 0.01;
    k.poly([[0.35, 0.35, z], [6.65, 0.35, z], [6.65, 2.65, z], [0.35, 2.65, z]], C.leather, k.thin);
    if (k.fine) k.line([[0.55, 0.55, z], [6.45, 0.55, z], [6.45, 2.45, z], [0.55, 2.45, z], [0.55, 0.55, z]], withAlpha(C.brassLight, 0.55), Math.max(0.6, 0.06 * k.s));
    // the banker's lamp: a brass foot and stem, its green shade
    k.disc(LAMP.u, LAMP.v, TOP + 0.02, 0.5, C.brass, k.thin);
    k.disc(LAMP.u, LAMP.v, TOP + 0.14, 0.32, C.brassLight, 0);
    k.rod([[LAMP.u, LAMP.v, TOP + 0.1], [LAMP.u, LAMP.v, LAMP.z]], C.brass, 0.14);
    shadeOf(k, v.active);
    // the monitor: a steel case on a swivel foot, a broad brass bezel round
    // the glass
    const mu = (MON.u0 + MON.u1) / 2;
    k.cyl(mu, 0.5, TOP, 0.75, 0.18, C.iron, { line: k.thin });
    k.box(mu - 0.35, 0.35, TOP + 0.18, 0.7, 0.35, MON.z0 - TOP - 0.18, C.steelDark, { stripe: false, line: k.thin });
    k.box(MON.u0 + 0.1, MON.v0, MON.z0 + 0.1, MON.u1 - MON.u0 - 0.2, MON.v1 - MON.v0 - 0.15, MON.z1 - MON.z0 - 0.15, C.gunmetal, { round: 0.2 });
    k.box(MON.u0, MON.v1 - 0.18, MON.z0, MON.u1 - MON.u0, 0.18, MON.z1 - MON.z0, C.brass, { round: 0.12 });
    const n = MON.v1 + 0.01;
    k.rect(GLASS.u0 - 0.12, GLASS.z0 - 0.12, GLASS.u1 + 0.12, GLASS.z1 + 0.12, n, C.brassDark, k.thin);
    k.rect(GLASS.u0 - 0.03, GLASS.z0 - 0.03, GLASS.u1 + 0.03, GLASS.z1 + 0.03, n + 0.01, C.screenDark, 0);
    k.line([[MON.u0 + 0.25, n, MON.z1 - 0.2], [MON.u1 - 0.3, n, MON.z1 - 0.2]], withAlpha(C.brassLight, 0.8), Math.max(0.7, 0.1 * k.s));
    // under the glass: two knobs and a lamp, lit while it watches
    const zk = (MON.z0 + GLASS.z0) / 2;
    for (const a of [MON.u0 + 0.85, MON.u0 + 1.4]) k.face(a, n + 0.02, zk, 0.2, C.brassLight, k.thin, 14);
    k.face(MON.u1 - 0.65, n + 0.02, zk, 0.13, v.active ? '#ff5a46' : '#7a3a34', k.thin, 12);
    if (v.active && k.fine) k.halo(MON.u1 - 0.65, n + 0.05, zk, 0.6, '#ff6a50', 0.45);
    if (k.fine) {
      const r: P3[] = [];
      for (const a of [MON.u0 + 0.3, MON.u1 - 0.3]) for (const zz of [MON.z0 + 0.3, MON.z1 - 0.45]) r.push([a, n + 0.02, zz]);
      rivets(k, r, C.brassDark, 0.09);
    }
    // the lamp's light on the leather, while the screen is on
    if (v.active) {
      k.pool(LAMP.u + 0.4, LAMP.v + 1.2, 1.9, 1.15, '#ffe2a0', 0.5, TOP + 0.03);
      k.halo(LAMP.u, LAMP.v + LAMP.r, LAMP.z - 0.1, 1.7, '#ffd890', 0.4);
    }
    // what lies before the monitor, short of the glass and clear of the
    // upgrade's spot: coins always, and the look's own
    const zt = TOP + 0.02;
    if (look === 0) {
      coins(k, 4.5, 2.1, zt, 5);
      coins(k, 5.3, 1.95, zt, 7);
      coins(k, 4.95, 2.6, zt, 3);
    } else if (look === 1) {
      coins(k, 5.3, 1.95, zt, 5);
      notes(k, 3.5, 1.85, zt);
    } else {
      coins(k, 5.3, 1.95, zt, 4);
      stamp(k, 3.6, 1.75, zt);
    }
  },
  screen: SCREEN,
  top: [6.4, 0.6, TOP],
};

// A pedestal of three drawers from u0, 2.1 wide, brass pulls on its front.
function pedestal(k: Kit, u0: number): void {
  const [v0, v1, w] = [0.3, 2.75, 2.1];
  k.box(u0 - 0.05, v0 - 0.05, 0, w + 0.1, v1 - v0 + 0.1, 0.3, C.mahoganyDark, { stripe: false, line: k.thin });
  k.box(u0, v0, 0.3, w, v1 - v0, TOP - 0.9, C.mahogany, { stripe: false });
  const f = v1 + 0.01;
  const front = k.side(shade(C.mahogany, 0.06), 0, 1);
  const pulls: Array<[P3, P3]> = [];
  for (const [z0, z1] of [[0.5, 2.0], [2.2, 3.55], [3.75, 4.75]] as const) {
    k.rect(u0 + 0.22, z0, u0 + w - 0.22, z1, f, front, k.thin);
    const zm = (z0 + z1) / 2 + 0.1;
    pulls.push([[u0 + w / 2 - 0.4, f + 0.02, zm], [u0 + w / 2 + 0.4, f + 0.02, zm]]);
  }
  for (const [a, b] of pulls) k.rod([a, b], C.brass, 0.12);
}

// The banker's lamp's shade: a half tube of green glass along u, lit
// underneath while the screen is on.
function shadeOf(k: Kit, on: boolean): void {
  const { u0, u1, v, z, r } = LAMP;
  const arcAt = (u: number): P3[] => Array.from({ length: 9 }, (_, i) => [u, v + Math.cos((i / 8) * Math.PI) * r, z + Math.sin((i / 8) * Math.PI) * r * 0.85] as P3);
  const shell = hull([...arcAt(u0), ...arcAt(u1)].map((p) => k.p(...p)));
  const green = '#2f7a54';
  fillPts(k, shell, k.grad([u0, v, z + r], [u0, v + r, z], [[0, '#5fb88a'], [0.5, green], [1, shade(green, -0.3)]]), k.lw);
  k.line(arcAt(u1), withAlpha(INK, 0.7), k.thin);
  k.line([[u0 + 0.1, v - r * 0.3, z + r * 0.75], [u1 - 0.2, v - r * 0.3, z + r * 0.75]], withAlpha('#d8ffe8', 0.6), Math.max(0.7, 0.08 * k.s));
  k.line([[u0 + 0.1, v + r, z], [u1 - 0.1, v + r, z]], on ? '#fff0c0' : '#c9b78a', Math.max(0.8, 0.12 * k.s));
}

// A bundle of notes in a plain paper band, lying along u.
function notes(k: Kit, u: number, v: number, z: number): void {
  k.box(u, v, z, 1.3, 0.75, 0.24, '#8fae7e', { line: k.thin, stripe: false });
  k.box(u + 0.02, v + 0.03, z + 0.24, 1.26, 0.7, 0.18, '#a5c294', { line: k.thin, stripe: false });
  k.box(u + 0.5, v - 0.03, z, 0.32, 0.81, 0.44, C.paper, { line: 0, stripe: false });
}

// A rubber stamp, its wooden knob up, on an ink pad in a tin.
function stamp(k: Kit, u: number, v: number, z: number): void {
  k.box(u, v, z, 1.35, 0.85, 0.16, C.steelDark, { line: k.thin, stripe: false });
  k.poly([[u + 0.12, v + 0.1, z + 0.17], [u + 1.23, v + 0.1, z + 0.17], [u + 1.23, v + 0.75, z + 0.17], [u + 0.12, v + 0.75, z + 0.17]], C.oxblood, 0);
  const cu = u + 0.95;
  const cv = v + 0.45;
  k.box(cu - 0.35, cv - 0.25, z + 0.17, 0.7, 0.5, 0.22, '#2a2a30', { line: k.thin, stripe: false });
  k.cyl(cu, cv, z + 0.39, 0.13, 0.45, C.walnut, { line: k.thin });
  k.cyl(cu, cv, z + 0.8, 0.26, 0.26, C.walnut, { line: k.thin, top: shade(C.walnut, 0.2) });
}
