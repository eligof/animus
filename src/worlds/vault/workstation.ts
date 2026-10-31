import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, Quad, WorkstationArt } from '../types.ts';
import { across, coins, fillPts, frustum, gem, goldBar, hull, ring, rivets } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, Kit, kitOf, smallKitOf, withAlpha } from './kit.ts';

// The Vault's workstation (see WorkstationArt in ../types.ts): a teller's desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A mahogany pedestal desk with a leather inlay; a security monitor in a
// brass frame at the back, right of the agent, two brass knobs and a lamp
// under its glass; a banker's lamp with a green shade at the back left,
// behind the agent, lit while the screen is on (a warm pool on the
// leather). The right end of the top is kept clear for a desk upgrade,
// beside the agent rather than behind it. Looks: the leather is green,
// oxblood or navy.
//
// Its clutter is a counting-house clerk's: stacks of coins, gold bars, a
// tied money bag, a gem on a velvet cushion, a steel cash box, an abacus,
// an ink pot with a quill, a brass balance, bundles of notes in plain
// bands, a rubber stamp on its pad and a ledger. Its spots: by the lamp's
// foot, before the monitor and along the front, between the agent at work
// and the monitor and apart across the picture. Its loop: a mahogany desk
// clock at the front of the right end, its pendulum swinging while the
// desk is worked (hanging still while it is not).

const TOP = 5.6; // the desk's top
const MON = { u0: 2.2, u1: 5.9, v0: 0.15, v1: 0.95, z0: 6.0, z1: 9.95 }; // the monitor: its case, its bezel
const GLASS = { u0: 2.7, u1: 5.4, z0: 6.7, z1: 9.4 }; // the screen, inside the bezel
const LAMP = { u: 0.95, v: 0.55, z: TOP + 1.7, u0: 0.4, u1: 1.5, r: 0.5 }; // the banker's lamp's shade
const LEATHER: readonly Color[] = [C.leather, C.oxblood, '#2f4766'];

const SCREEN: Quad = [
  [GLASS.u0, MON.v1 + 0.03, GLASS.z0],
  [GLASS.u1, MON.v1 + 0.03, GLASS.z0],
  [GLASS.u1, MON.v1 + 0.03, GLASS.z1],
  [GLASS.u0, MON.v1 + 0.03, GLASS.z1],
];

// ── what stands on the top ───────────────────────────────────────────────
// Each drawn standing at `at` on the leather with the small things' kit
// (a thinner outline), never reading v.t.

// The kit for the smallest parts of a small thing (beads, a bob): its
// outline the small kit's inner line.
const fineKit = (k: Kit): Kit => new Kit(k.pen, k.at, k.s, k.thin);

// The screen outline of a solid of revolution up from (u, w, z): rings of
// radius r at heights dz.
function lathe(k: Kit, u: number, w: number, z: number, rings: ReadonlyArray<readonly [number, number]>): Pt[] {
  return hull(rings.flatMap(([dz, r]) => ring(k, [u, w, z + dz], [0, 0, 1], r, 18)));
}

// A ball on screen at a frame point, r units round, lit from the upper left.
function bead(k: Kit, p: P3, r: number, fill: Color, line = k.thin): void {
  const [x, y] = k.p(...p);
  const R = r * k.s;
  const g = k.pen.createRadialGradient(x - R * 0.35, y - R * 0.35, 0, x, y, R);
  g.addColorStop(0, shade(fill, 0.45));
  g.addColorStop(0.5, fill);
  g.addColorStop(1, shade(fill, -0.3));
  k.pen.beginPath();
  k.pen.arc(x, y, R, 0, Math.PI * 2);
  k.paint(g, line);
}

// Three stacks of gold coins, short to tall.
const coinStacks: Clutter = {
  name: 'coinStacks',
  r: 0.44,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    for (const [du, dv, n] of [[-0.14, -0.14, 6], [0.19, -0.08, 3], [-0.05, 0.19, 8]] as const) coins(k, u + du, w + dv, z, n, 0.22);
  },
};

// Three little gold bars, two down and one across them.
const goldBars: Clutter = {
  name: 'goldBars',
  r: 0.45,
  h: 0.42,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    goldBar(k, u - 0.33, w - 0.31, z, 0.66, 0.3, 0.2);
    goldBar(k, u - 0.33, w + 0.01, z, 0.66, 0.3, 0.2);
    goldBar(k, u - 0.29, w - 0.15, z + 0.2, 0.58, 0.3, 0.2);
  },
};

// A canvas money bag tied at the neck, its ruff above the cord; no sign
// on it.
const moneyBag: Clutter = {
  name: 'moneyBag',
  r: 0.42,
  h: 0.9,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const base = '#c9ad7c';
    const body = lathe(k, u, w, z, [[0, 0.26], [0.1, 0.36], [0.3, 0.4], [0.5, 0.3], [0.62, 0.13]]);
    fillPts(k, body, across(k, body, base), k.lw);
    fillPts(k, lathe(k, u, w, z + 0.6, [[0, 0.11], [0.2, 0.2], [0.24, 0.17]]), across(k, body, shade(base, 0.08)), k.lw);
    k.rod([[u - 0.14, w + 0.06, z + 0.62], [u, w + 0.14, z + 0.6], [u + 0.14, w + 0.06, z + 0.62]], C.oxblood, 0.06);
    k.line([[u - 0.2, w + 0.3, z + 0.24], [u - 0.14, w + 0.34, z + 0.44]], withAlpha(INK, 0.35), Math.max(0.6, 0.04 * k.s));
  },
};

// A cut gem on a velvet cushion, tassels at its corners.
const gemCushion: Clutter = {
  name: 'gem',
  r: 0.42,
  h: 0.72,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.box(u - 0.3, w - 0.3, z, 0.6, 0.6, 0.18, C.velvet, { round: 0.12 });
    for (const [du, dv] of [[0.3, -0.3], [0.3, 0.3], [-0.3, 0.3]] as const) bead(fineKit(k), [u + du, w + dv, z + 0.1], 0.06, C.brass, 0);
    const [x, y] = k.p(u, w, z + 0.47);
    gem(k, x, y, 0.3 * k.s, '#3f86e0');
  },
};

// A steel cash box, a brass handle on its lid and a lock plate on its
// front.
const cashBox: Clutter = {
  name: 'cashBox',
  r: 0.45,
  h: 0.55,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.box(u - 0.36, w - 0.26, z, 0.72, 0.52, 0.34, C.steel, { round: 0.04 });
    k.line([[u - 0.36, w + 0.265, z + 0.25], [u + 0.36, w + 0.265, z + 0.25], [u + 0.365, w - 0.26, z + 0.25]], withAlpha(INK, 0.7), Math.max(0.6, 0.04 * k.s));
    k.rect(u - 0.08, z + 0.08, u + 0.08, z + 0.22, w + 0.27, C.brass, k.thin);
    k.rod([[u - 0.15, w, z + 0.34], [u - 0.12, w, z + 0.48], [u + 0.12, w, z + 0.48], [u + 0.15, w, z + 0.34]], C.brass, 0.05);
  },
};

// An abacus standing on its feet: a mahogany frame, four rods of beads.
const abacus: Clutter = {
  name: 'abacus',
  r: 0.44,
  h: 0.78,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const f = fineKit(k);
    k.box(u - 0.4, w - 0.12, z + 0.06, 0.08, 0.24, 0.66, C.mahogany, { stripe: false });
    k.box(u - 0.36, w - 0.04, z + 0.1, 0.72, 0.08, 0.06, C.mahoganyDark, { line: k.thin, stripe: false });
    const rows = [0.24, 0.38, 0.52, 0.64];
    for (const zz of rows) k.line([[u - 0.34, w, z + zz], [u + 0.34, w, z + zz]], C.brassDark, Math.max(0.6, 0.03 * k.s));
    rows.forEach((zz, r) => {
      const left = [1, 3, 2, 4][r];
      for (let b = 0; b < 5; b++) {
        const du = b < left ? -0.28 + b * 0.11 : 0.28 - (4 - b) * 0.11;
        bead(f, [u + du, w, z + zz], 0.06, r % 2 ? C.velvet : C.brass, Math.max(0.6, k.thin * 0.6));
      }
    });
    k.box(u - 0.36, w - 0.04, z + 0.68, 0.72, 0.08, 0.06, C.mahoganyDark, { line: k.thin, stripe: false });
    k.box(u + 0.32, w - 0.12, z + 0.06, 0.08, 0.24, 0.66, C.mahogany, { stripe: false });
    for (const du of [-0.4, 0.32]) k.box(u + du - 0.02, w - 0.16, z, 0.12, 0.32, 0.06, C.mahoganyDark, { line: k.thin, stripe: false });
  },
};

// An ink pot of dark glass, a quill standing in it.
const inkPot: Clutter = {
  name: 'inkPot',
  r: 0.32,
  h: 1.3,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const glass = lathe(k, u, w, z, [[0, 0.26], [0.2, 0.27], [0.3, 0.16]]);
    fillPts(k, glass, across(k, glass, '#2a3550'), k.lw);
    k.cyl(u, w, z + 0.28, 0.13, 0.08, C.brass);
    // the quill: its shaft, its vane down the far side
    const a: P3 = [u + 0.02, w, z + 0.34];
    const b: P3 = [u + 0.22, w - 0.1, z + 1.25];
    const [ax, ay] = k.p(...a);
    const [bx, by] = k.p(...b);
    const l = Math.hypot(bx - ax, by - ay) || 1;
    const nx = (by - ay) / l;
    const ny = -(bx - ax) / l;
    const W = 0.13 * k.s;
    const pt = (t: number, side: number): Pt => [ax + (bx - ax) * t + nx * W * side, ay + (by - ay) * t + ny * W * side];
    fillPts(k, [pt(0.3, 0), pt(0.45, -0.9), pt(0.75, -1), pt(1, 0), pt(0.8, 0.7), pt(0.5, 0.6)], C.cream, k.thin);
    k.line([a, b], shade(C.cream, -0.3), Math.max(0.7, 0.04 * k.s));
  },
};

// A brass balance: a pillar on a wooden foot, a beam, a pan hung at each
// end.
const scales: Clutter = {
  name: 'scales',
  r: 0.45,
  h: 1.1,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const f = fineKit(k);
    k.cyl(u, w, z, 0.2, 0.08, C.walnut);
    k.rod([[u, w, z + 0.08], [u, w, z + 0.96]], C.brass, 0.05);
    k.rod([[u - 0.3, w, z + 0.92], [u + 0.3, w, z + 0.92]], C.brass, 0.04);
    bead(f, [u, w, z + 1.0], 0.06, C.brassLight, Math.max(0.6, k.thin * 0.6));
    for (const du of [-0.3, 0.3]) {
      const zp = z + 0.4;
      k.pen.beginPath();
      for (const [a, b] of [[-0.13, 0], [0.13, 0], [0, 0.1]] as const) {
        const [x0, y0] = k.p(u + du, w, z + 0.92);
        const [x1, y1] = k.p(u + du + a, w + b, zp + 0.06);
        k.pen.moveTo(x0, y0);
        k.pen.lineTo(x1, y1);
      }
      k.pen.strokeStyle = withAlpha(INK, 0.75);
      k.pen.lineWidth = Math.max(0.6, 0.025 * k.s);
      k.pen.stroke();
      frustum(f, u + du, w, zp, 0.06, zp + 0.08, 0.15, C.brass, C.brassLight);
    }
    coins(f, u - 0.3, w, z + 0.48, 2, 0.08);
  },
};

// Two bundles of notes in plain paper bands, one across the other.
const notes: Clutter = {
  name: 'notes',
  r: 0.44,
  h: 0.42,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    const bundle = (u0: number, v0: number, z0: number, du: number, dv: number) => {
      k.box(u0, v0, z0, du, dv, 0.1, '#8fae7e', { stripe: false });
      k.box(u0 + 0.02, v0 + 0.02, z0 + 0.1, du - 0.04, dv - 0.04, 0.08, '#a5c294', { line: k.thin, stripe: false });
      if (du > dv) k.box(u0 + du / 2 - 0.08, v0 - 0.02, z0, 0.16, dv + 0.04, 0.2, C.paper, { line: k.thin, stripe: false });
      else k.box(u0 - 0.02, v0 + dv / 2 - 0.08, z0, du + 0.04, 0.16, 0.2, C.paper, { line: k.thin, stripe: false });
    };
    bundle(u - 0.38, w - 0.2, z, 0.76, 0.4);
    bundle(u - 0.18, w - 0.36, z + 0.19, 0.38, 0.72);
  },
};

// A rubber stamp, its wooden knob up, on an ink pad in a tin.
const stamp: Clutter = {
  name: 'stamp',
  r: 0.42,
  h: 0.75,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.box(u - 0.34, w - 0.24, z, 0.68, 0.48, 0.1, C.steelDark, { stripe: false });
    k.poly([[u - 0.27, w - 0.18, z + 0.105], [u + 0.27, w - 0.18, z + 0.105], [u + 0.27, w + 0.18, z + 0.105], [u - 0.27, w + 0.18, z + 0.105]], C.oxblood, 0);
    k.box(u - 0.1, w - 0.12, z + 0.1, 0.34, 0.24, 0.1, '#2a2a30', { line: k.thin, stripe: false });
    k.box(u - 0.12, w - 0.14, z + 0.2, 0.38, 0.28, 0.12, C.walnut, { line: k.thin, stripe: false });
    k.cyl(u + 0.07, w, z + 0.32, 0.07, 0.24, C.walnut);
    k.cyl(u + 0.07, w, z + 0.54, 0.16, 0.16, C.walnut, { top: shade(C.walnut, 0.22) });
  },
};

// A ledger lying shut: oxblood boards over the page block, gilt corners,
// a red ribbon out of its foot.
const ledger: Clutter = {
  name: 'ledger',
  r: 0.45,
  h: 0.24,
  draw(v, [u, w, z]) {
    const k = smallKitOf(v);
    k.box(u - 0.35, w - 0.27, z, 0.7, 0.54, 0.04, C.oxblood, { line: k.thin, stripe: false });
    k.box(u - 0.33, w - 0.25, z + 0.04, 0.66, 0.5, 0.13, C.paper, { line: k.thin, stripe: false });
    if (k.fine) k.line([[u + 0.335, w - 0.2, z + 0.1], [u + 0.335, w + 0.25, z + 0.1], [u - 0.3, w + 0.255, z + 0.1]], withAlpha(INK, 0.3), Math.max(0.6, 0.03 * k.s));
    k.box(u - 0.35, w - 0.27, z + 0.17, 0.7, 0.54, 0.05, C.oxblood, { top: shade(C.oxblood, 0.04) });
    if (k.fine) k.line([[u - 0.27, w - 0.19, z + 0.222], [u + 0.27, w - 0.19, z + 0.222], [u + 0.27, w + 0.19, z + 0.222], [u - 0.27, w + 0.19, z + 0.222], [u - 0.27, w - 0.19, z + 0.222]], withAlpha(C.brassLight, 0.6), Math.max(0.6, 0.03 * k.s));
    k.box(u - 0.39, w - 0.27, z, 0.08, 0.54, 0.22, shade(C.oxblood, -0.15), { line: k.thin, stripe: false });
    for (const [du, dv] of [[0.35, 0.27], [0.35, -0.27]] as const) {
      const sv = Math.sign(dv);
      k.poly([[u + du, w + dv, z + 0.221], [u + du - 0.14, w + dv, z + 0.221], [u + du, w + dv - sv * 0.14, z + 0.221]], C.brass, Math.max(0.6, k.thin * 0.6));
    }
    k.line([[u + 0.1, w + 0.27, z + 0.12], [u + 0.13, w + 0.42, z + 0.01]], C.red, Math.max(0.8, 0.06 * k.s));
  },
};

// The spots, a thing's width apart, in the strip between the agent at
// work and the monitor, along the front.
const SPOTS: readonly P3[] = [
  [1.75, 0.75, TOP],
  [3.75, 1.25, TOP],
  [3.25, 2.25, TOP],
  [5.0, 1.75, TOP],
];

// A mahogany desk clock at the front of the right end, a brass-rimmed
// face over a glass door, its pendulum swinging behind the glass while the
// desk is worked (eight steps a beat, 1.3 s), still while it is not.
const CLOCK: P3 = [6.35, 2.35, TOP];
const clock: DeskLoop = {
  name: 'clock',
  at: CLOCK,
  r: 0.45,
  h: 1.6,
  secs: 8 / 6,
  draw(v, phase) {
    const i = Math.floor(phase * 8);
const k = smallKitOf(v);
    const f = fineKit(k);
    const [u, w, z] = CLOCK;
    const n = w + 0.18;
    k.box(u - 0.34, w - 0.22, z, 0.68, 0.44, 0.1, C.brassDark, { stripe: false });
    k.box(u - 0.29, w - 0.18, z + 0.1, 0.58, 0.36, 1.18, C.mahogany, { stripe: false });
    k.box(u - 0.33, w - 0.21, z + 1.28, 0.66, 0.42, 0.1, C.mahoganyDark);
    bead(f, [u, w, z + 1.48], 0.08, C.brass, Math.max(0.6, k.thin * 0.6));
    // the face, its hands at ten to two
    k.face(u, n + 0.01, z + 0.98, 0.25, C.brass, k.thin);
    k.face(u, n + 0.02, z + 0.98, 0.19, C.cream, 0);
    k.line([[u - 0.1, n + 0.03, z + 1.03], [u, n + 0.03, z + 0.98], [u + 0.12, n + 0.03, z + 1.06]], INK, Math.max(0.7, 0.035 * k.s));
    // the pendulum behind the glass door
    const zw0 = z + 0.2;
    const zw1 = z + 0.7;
    k.rect(u - 0.2, zw0, u + 0.2, zw1, n + 0.01, '#2e2218', k.thin);
    const swing = v.active ? 0.3 * Math.sin((i / 8) * Math.PI * 2) : 0;
    const L = 0.34;
    const pivot: P3 = [u, n + 0.02, zw1 - 0.04];
    const bob: P3 = [u + L * Math.sin(swing), n + 0.02, zw1 - 0.04 - L * Math.cos(swing)];
    k.line([pivot, bob], C.brass, Math.max(0.7, 0.04 * k.s));
    bead(f, bob, 0.09, C.brassLight, Math.max(0.6, k.thin * 0.6));
    k.line([[u - 0.14, n + 0.03, zw0 + 0.1], [u - 0.02, n + 0.03, zw1 - 0.06]], withAlpha('#ffffff', 0.35), Math.max(0.7, 0.04 * k.s));
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const leather = LEATHER[((v.seed % 3) + 3) % 3];
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.3);
    // the pedestals of drawers, the panel between them set back, the top
    k.box(2.3, 0.45, 1.4, 2.4, 0.35, 3.8, C.mahoganyDark, { stripe: false });
    for (const u0 of [0.3, 4.6]) pedestal(k, u0);
    k.box(0, 0, TOP - 0.6, DESK.len, DESK.dep, 0.6, C.mahogany);
    k.rect(0.15, TOP - 0.48, DESK.len - 0.15, TOP - 0.12, DESK.dep + 0.01, withAlpha(INK, 0.18), 0);
    // the leather, tooled in gold round its edge
    const z = TOP + 0.01;
    k.poly([[0.35, 0.35, z], [6.65, 0.35, z], [6.65, 2.65, z], [0.35, 2.65, z]], leather, k.thin);
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
  },
  screen: SCREEN,
  top: [6.4, 0.6, TOP],
  clutter: { items: [coinStacks, goldBars, moneyBag, gemCushion, cashBox, abacus, inkPot, scales, notes, stamp, ledger], spots: SPOTS },
  loops: [clock],
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
