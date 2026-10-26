import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { cup, hull, leaf, pot } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, kitOf } from './kit.ts';

// Cozy Café's workstation (see WorkstationArt in ../types.ts): a little laptop table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// A small oak table on walnut legs; an open laptop right of the agent, its
// lid tilted back off the base's back edge, a dark bezel round the screen;
// a latte on its saucer by the agent's hand, a sugar bowl behind it. The
// back of the right end is kept clear for a desk upgrade, so it shows
// beside the agent. Looks, at the front of the right end: a succulent in a
// pot, a croissant on a plate, a closed paperback. On, the screen's light
// falls across the keys.

const ZT = 5.9; // the table top
// The lid's inner face: its bottom edge on the base's back edge, leaning
// back as it rises.
const LID: readonly [P3, P3, P3, P3] = [
  [2.92, 1.15, ZT + 0.26],
  [5.38, 1.15, ZT + 0.26],
  [5.38, 0.8, ZT + 3.46],
  [2.92, 0.8, ZT + 3.46],
];

// A point on the lid's face: fu across from its left edge, fz up from its foot.
const on = (fu: number, fz: number): P3 => {
  const [a, b, , d] = LID;
  return [a[0] + (b[0] - a[0]) * fu + (d[0] - a[0]) * fz, a[1] + (b[1] - a[1]) * fu + (d[1] - a[1]) * fz, a[2] + (b[2] - a[2]) * fu + (d[2] - a[2]) * fz];
};

const SCREEN: readonly [P3, P3, P3, P3] = [on(0.065, 0.09), on(0.935, 0.09), on(0.935, 0.92), on(0.065, 0.92)];

function draw(v: PropView): void {
  const k = kitOf(v);
  const look = ((v.seed % 3) + 3) % 3;
  k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.45, 0.3);
  // four walnut legs, back ones first, an H of stretchers low between
  // them, and the apron under the top
  const leg = (u: number, w: number) => {
    k.box(u, w, 0, 0.6, 0.6, ZT - 0.5, C.walnut, { stripe: false });
    k.box(u - 0.06, w - 0.06, 0, 0.72, 0.72, 0.35, C.walnutDark, { line: k.thin, stripe: false });
  };
  leg(0.4, 0.35);
  k.box(0.55, 0.95, 1.35, 0.3, 1.1, 0.3, C.walnutDark, { line: k.thin, stripe: false });
  leg(0.4, 2.05);
  k.box(1.0, 1.35, 1.4, 5.0, 0.3, 0.25, C.walnutDark, { line: k.thin, stripe: false });
  leg(6.0, 0.35);
  k.box(6.15, 0.95, 1.35, 0.3, 1.1, 0.3, C.walnutDark, { line: k.thin, stripe: false });
  leg(6.0, 2.05);
  k.box(0.3, 0.25, ZT - 1.15, 6.4, 2.5, 0.65, C.walnut, { stripe: false });
  // the oak top, its grain
  k.box(0, 0, ZT - 0.5, DESK.len, DESK.dep, 0.5, C.honey, { round: 0.12 });
  if (k.fine) {
    for (const [w, u0, u1] of [[0.7, 0.3, 2.3], [1.55, 0.6, 2.4], [2.4, 0.25, 6.7], [0.9, 5.4, 6.8]] as const) k.line([[u0, w, ZT + 0.01], [u1, w, ZT + 0.01]], shade(C.honey, -0.14), Math.max(0.6, 0.06 * k.s));
  }
  // the sugar bowl, a china pot with its lid and knob, and the latte by
  // the agent's hand
  k.cyl(0.95, 1.0, ZT, 0.4, 0.42, C.china);
  k.disc(0.95, 1.0, ZT + 0.48, 0.34, shade(C.china, -0.05), k.thin);
  k.cyl(0.95, 1.0, ZT + 0.48, 0.1, 0.16, C.brass, { line: k.thin });
  cup(k, 1.6, 2.2, ZT, C.china, true, 0.38);
  // the laptop: its lid (the edge behind the face, then the face), its base
  laptop(k, v.active);
  // the look, at the front of the right end
  if (look === 0) {
    pot(k, 6.25, 2.2, ZT, 0.48, 0.8);
    succulent(k, 6.25, 2.2, ZT + 0.72);
  } else if (look === 1) {
    k.disc(6.2, 2.2, ZT + 0.04, 0.6, C.china, k.thin);
    croissant(k, 6.2, 2.05, ZT + 0.1);
  } else {
    k.box(5.6, 1.75, ZT, 1.15, 0.8, 0.36, C.mustard, { round: 0.06, stripe: false });
    k.line([[5.65, 2.55, ZT + 0.18], [6.7, 2.55, ZT + 0.18]], '#f6ecd2', Math.max(0.8, 0.12 * k.s));
  }
}

function laptop(k: Kit, lit: boolean): void {
  // The lid: a slab a fifth of a unit thick, its back in brushed chrome
  // (seen only along its top and right edges), its face a dark bezel.
  const rear = LID.map(([u, w, z]): P3 => [u, w - 0.2, z - 0.05]);
  const pen = k.pen;
  pen.beginPath();
  hull([...LID, ...rear].map((p) => k.p(...p))).forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  k.paint(C.chrome);
  k.poly([...LID], '#2c2a2e');
  // the base, its keys and its pad
  k.box(2.92, 1.15, ZT, 2.46, 1.65, 0.26, C.chrome, { round: 0.06 });
  const zt = ZT + 0.265;
  k.poly([[3.12, 1.32, zt], [5.18, 1.32, zt], [5.18, 2.05, zt], [3.12, 2.05, zt]], '#7f858d', 0);
  if (k.fine) {
    k.pen.beginPath();
    for (const w of [1.56, 1.8]) k.trace([[3.12, w, zt], [5.18, w, zt]]);
    k.pen.strokeStyle = '#5f646b';
    k.pen.lineWidth = Math.max(0.6, 0.05 * k.s);
    k.pen.stroke();
  }
  k.poly([[3.73, 2.2, zt], [4.57, 2.2, zt], [4.57, 2.65, zt], [3.73, 2.65, zt]], shade(C.chrome, 0.06), k.thin);
  if (lit) {
    // the screen's light across the keys
    k.pool(4.15, 1.7, 1.6, 0.95, C.screen, 0.7, zt);
    k.halo(4.15, 1.3, ZT + 1.2, 1.6, C.screen, 0.22);
  }
}

// A plump succulent: a rosette of fat pointed leaves fanning up out of
// its pot, the far ones darker, drawn first.
function succulent(k: Kit, u: number, w: number, z: number): void {
  const [x, y] = k.p(u, w, z);
  const L = 1.15 * k.s;
  for (const [a, f, c] of [[-2.55, 0.85, '#5f8f6a'], [-0.6, 0.85, '#5f8f6a'], [-2.05, 1, '#7fb08a'], [-1.1, 1, '#7fb08a'], [-1.57, 1.1, '#a6cf9c']] as const) {
    leaf(k, x, y, a, L * f, L * 0.36, c, false);
  }
}

// A croissant lying along u on a plate at z.
function croissant(k: Kit, cu: number, cv: number, z: number): void {
  const pts: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = Math.PI * (0.15 + (0.7 * i) / 10);
    pts.push([cu + Math.cos(a) * 0.55, cv - Math.sin(a) * 0.32 + 0.22, z + Math.sin(a) * 0.36]);
  }
  for (let i = 10; i >= 0; i--) {
    const a = Math.PI * (0.15 + (0.7 * i) / 10);
    pts.push([cu + Math.cos(a) * 0.4, cv - Math.sin(a) * 0.14 + 0.22, z]);
  }
  k.poly(pts, '#d9944a', k.thin, 0.1);
  if (k.fine) for (const du of [-0.2, 0.05, 0.28]) k.line([[cu + du, cv - 0.05, z + 0.34], [cu + du + 0.08, cv + 0.2, z + 0.16]], '#a8622e', 0.05 * k.s);
}

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 9.6,
  draw,
  screen: SCREEN,
  top: [6.5, 0.55, ZT],
};
