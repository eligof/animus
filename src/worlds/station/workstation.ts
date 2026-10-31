import { mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import type { Quad } from './bits.ts';
import { fillPts, hull, mug, on, ring, sprouts } from './bits.ts';
import type { Kit, P3, Pt } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Orbital Station's workstation (see WorkstationArt in ../types.ts): a console pod.
// A white console on a single navy pedestal, its deck sloping down toward
// the agent with a row of round buttons high on it under the screen and a
// trackball by the agent's hand, a flat shelf behind it; its screen canted
// back on a short steel arm over the right of the deck, and a chrome
// handrail round the left end. On the right end a little bracket holds one
// of its looks: a mug in a clip, a tablet in a sleeve, or a potted sprout
// under a dome. Drawn once a scale, frame, look and screen, and kept: it
// never looks at v.t; v.active (its screen on) lights the buttons; v.seed
// (0, 1 or 2) picks the look. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`, on the shelf at its right end
// (nothing of its own there).
//
// What stands on it (`clutter`, a few a desk; see clutterOf in
// ../workstation.ts): a drink pouch with its straw clamped, a foil-wrapped
// ration bar, a roll of grey tape, a torch, a model rocket, a little plush
// alien (the crew's zero-g mascot), an orange zinnia grown in a pod, a
// photo of home, a model of the first satellite and a tin of rations. Two
// stand on the shelf left of the screen, three along the front of the
// deck. What moves while its agent works (`loops`): a holo emitter at the
// deck's front right throwing up a ringed planet that turns (dark while
// the screen is off), and a beacon on top of the screen whose red light
// swells and fades.

// The console's body, end to end along u (the profile below, the same at
// every u): the shelf at the back, the deck sloping to the front lip.
const U0 = 0.7;
const U1 = 6.2;
const BODY = { back: 0.3, front: 2.8, bottom: 3.9, lip: 5.2, shelf: 6.0, edge: 1.3 };
// The screen, canted back.
const SCREEN: Quad = [
  [2.8, 1.2, 6.75],
  [4.95, 1.2, 6.75],
  [4.95, 0.95, 9.45],
  [2.8, 0.95, 9.45],
];
const BUTTONS: readonly Color[] = [C.orange, C.cyan, C.green, C.orange, C.cyan];

// A point on the deck: g = 0 at its front lip, 1 at the shelf's edge.
const deck = (u: number, g: number): P3 => [u, BODY.front - (BODY.front - BODY.edge) * g, BODY.lip + (BODY.shelf - BODY.lip) * g];

// The deck's height at v (its front lip at BODY.front, up to the shelf's
// edge), and the line along its front where things stand.
const deckZ = (w: number): number => BODY.lip + ((BODY.shelf - BODY.lip) * (BODY.front - w)) / (BODY.front - BODY.edge);
const FRONT = 2.25;

// ── what stands on it ─────────────────────────────────────────────────────

// Small things are inked lighter than the console (a tenth of a unit), or
// their outline would swallow them.
const fine = (k: Kit): number => Math.max(1, 0.1 * k.s);

// A thin stick (an antenna, a straw): a line of colour w units wide over
// a slightly wider one of ink.
function stick(k: Kit, pts: ReadonlyArray<P3>, color: Color, w: number): void {
  k.line(pts, INK, w * k.s + Math.max(1, 0.08 * k.s));
  k.line(pts, color, w * k.s);
}

// A soft shadow where a thing stands (on the deck's slope as on the shelf).
const foot = (k: Kit, u: number, w: number, z: number, r: number): void => k.shadow(u, w, r, r, 0.35, z);

// An upright round thing narrowing (or widening) from radius r0 at z0 to
// r1 at z1, shaded across like a cylinder.
function taper(k: Kit, u: number, w: number, z0: number, r0: number, z1: number, r1: number, base: Color, line = fine(k)): void {
  const sil = hull([...ring(k, [u, w, z0], [0, 0, 1], r0, 18), ...ring(k, [u, w, z1], [0, 0, 1], r1, 18)]);
  const xs = sil.map((p) => p[0]);
  const g = k.pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  g.addColorStop(0, shade(base, 0.06));
  g.addColorStop(0.3, shade(base, 0.14));
  g.addColorStop(0.6, base);
  g.addColorStop(1, shade(base, -0.24));
  fillPts(k, sil, g, line);
}

// A foil drink pouch standing up, an orange label across it, its straw
// clamped shut with a yellow clip.
const drinkPouch: Clutter = {
  name: 'drinkPouch',
  r: 0.3,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.3);
    k.box(u - 0.24, w - 0.1, z, 0.48, 0.2, 0.62, '#c9d1dc', { line: fine(k), round: 0.08, stripe: false });
    k.rect(u - 0.22, z + 0.2, u + 0.22, z + 0.38, w + 0.105, C.orange, 0);
    stick(k, [[u + 0.04, w, z + 0.6], [u + 0.06, w, z + 0.92]], C.white, 0.06);
    k.box(u - 0.04, w - 0.05, z + 0.72, 0.18, 0.1, 0.08, C.yellow, { line: fine(k), stripe: false });
  },
};

// A ration bar in orange foil, its ends crimped silver, lying flat.
const rationBar: Clutter = {
  name: 'rationBar',
  r: 0.35,
  h: 0.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.3);
    k.box(u - 0.34, w - 0.14, z, 0.1, 0.28, 0.1, C.chrome, { line: fine(k), stripe: false });
    k.box(u - 0.25, w - 0.15, z, 0.5, 0.3, 0.15, C.orange, { line: fine(k), round: 0.04, stripe: false });
    k.box(u + 0.24, w - 0.14, z, 0.1, 0.28, 0.1, C.chrome, { line: fine(k), stripe: false });
    k.poly([[u - 0.1, w - 0.15, z + 0.151], [u + 0.08, w - 0.15, z + 0.151], [u + 0.08, w + 0.15, z + 0.151], [u - 0.1, w + 0.15, z + 0.151]], '#f6f8fb', 0);
  },
};

// A roll of grey tape lying flat, the hole in its middle dark.
const tapeRoll: Clutter = {
  name: 'tapeRoll',
  r: 0.32,
  h: 0.22,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.32);
    k.cyl(u, w, z, 0.3, 0.2, '#a3adba', { line: fine(k), top: '#b8c1cc' });
    k.disc(u, w, z + 0.2, 0.15, '#1d2436', fine(k));
    if (k.fine) {
      // the edge of the tape wound round
      const e = k.ell(u, w, z + 0.2, 0.24);
      k.pen.beginPath();
      k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      k.paint(null, Math.max(0.6, 0.03 * k.s));
    }
  },
};

// A yellow torch lying along u, its head and lens toward +u.
const torch: Clutter = {
  name: 'torch',
  r: 0.35,
  h: 0.3,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.3);
    k.box(u - 0.34, w - 0.08, z, 0.42, 0.16, 0.16, C.yellow, { line: fine(k), round: 0.06, stripe: false });
    k.box(u - 0.2, w - 0.085, z, 0.12, 0.17, 0.165, '#2a2f3d', { line: 0, stripe: false });
    k.box(u + 0.08, w - 0.12, z, 0.22, 0.24, 0.24, C.yellow, { line: fine(k), round: 0.05, stripe: false });
    k.poly([[u + 0.305, w - 0.08, z + 0.04], [u + 0.305, w + 0.08, z + 0.04], [u + 0.305, w + 0.08, z + 0.2], [u + 0.305, w - 0.08, z + 0.2]], '#eaf6ff', 0, 0.05);
  },
};

// A model rocket standing on its fins: a white body, an orange nose,
// orange fins, a round window.
const modelRocket: Clutter = {
  name: 'modelRocket',
  r: 0.3,
  h: 1.05,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.25);
    // four broad fins, the far two first
    const fin = (du: number, dw: number) => k.poly([[u + du * 0.08, w + dw * 0.08, z + 0.5], [u + du * 0.3, w + dw * 0.3, z + 0.12], [u + du * 0.3, w + dw * 0.3, z], [u + du * 0.08, w + dw * 0.08, z]], C.orange, Math.max(0.8, 0.06 * k.s));
    fin(-1, 0);
    fin(0, -1);
    k.cyl(u, w, z, 0.13, 0.66, C.white, { line: fine(k), top: C.white });
    taper(k, u, w, z + 0.66, 0.13, z + 1.0, 0.01, C.orange);
    fin(1, 0);
    fin(0, 1);
    k.dot(u, w + 0.12, z + 0.45, 0.05, C.cyan, fine(k) * 0.8);
  },
};

// A small green plush alien sitting up: a round body, two eyes, two
// antennas with balls on their ends.
const plushAlien: Clutter = {
  name: 'plushAlien',
  r: 0.3,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.28);
    const body = '#7ad67a';
    for (const s of [-1, 1]) {
      stick(k, [[u + s * 0.08, w, z + 0.5], [u + s * 0.17, w, z + 0.72]], shade(body, -0.15), 0.04);
      k.dot(u + s * 0.17, w, z + 0.74, 0.06, C.grow, fine(k) * 0.8);
    }
    const [x, y] = k.p(u, w, z + 0.27);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.3 * k.s, 0.28 * k.s, 0, 0, Math.PI * 2);
    k.paint(k.hgrad([u - 0.3, w, z], [u + 0.3, w, z], [[0, shade(body, 0.12)], [0.6, body], [1, shade(body, -0.2)]]), fine(k));
    for (const s of [-1, 1]) {
      k.pen.beginPath();
      k.pen.arc(x + s * 0.1 * k.s, y - 0.05 * k.s, Math.max(0.8, 0.06 * k.s), 0, Math.PI * 2);
      k.pen.fillStyle = INK;
      k.pen.fill();
    }
    k.pen.beginPath();
    k.pen.arc(x, y + 0.06 * k.s, Math.max(0.6, 0.06 * k.s), 0.2, Math.PI - 0.2);
    k.pen.strokeStyle = INK;
    k.pen.lineWidth = Math.max(0.7, 0.03 * k.s);
    k.pen.stroke();
  },
};

// An orange zinnia, the first flower grown in orbit, in a white pod with
// an orange band.
const zinnia: Clutter = {
  name: 'zinnia',
  r: 0.3,
  h: 0.95,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.25);
    k.cyl(u, w, z, 0.2, 0.3, C.white, { line: fine(k) });
    k.cyl(u, w, z + 0.15, 0.205, 0.07, C.orange, { line: 0, top: C.orange });
    k.disc(u, w, z + 0.3, 0.16, C.soil, 0);
    const [x, y] = k.p(u, w, z + 0.32);
    for (const [a, c] of [[-2.5, C.leafDark], [-0.65, C.leafDark], [-1.95, C.leaf], [-1.15, C.leafLight]] as const) {
      const L = 0.2 * k.s;
      k.pen.beginPath();
      k.pen.ellipse(x + Math.cos(a) * L, y + Math.sin(a) * L, L, 0.09 * k.s, a, 0, Math.PI * 2);
      k.paint(c, fine(k) * 0.8);
    }
    stick(k, [[u, w, z + 0.32], [u + 0.02, w, z + 0.78]], C.leaf, 0.04);
    // the flower: a scalloped ring of petals round a dark heart
    const [fx, fy] = k.p(u + 0.02, w, z + 0.8);
    const pen = k.pen;
    pen.beginPath();
    for (let j = 0; j <= 40; j++) {
      const a = (j / 40) * Math.PI * 2;
      const rr = (0.17 + 0.035 * Math.cos(a * 10)) * k.s;
      const px = fx + Math.cos(a) * rr;
      const py = fy + Math.sin(a) * rr * 0.75;
      if (j) pen.lineTo(px, py);
      else pen.moveTo(px, py);
    }
    pen.closePath();
    k.paint(C.orange, fine(k) * 0.8);
    k.dot(u + 0.02, w, z + 0.8, 0.07, '#8a3a1a');
  },
};

// A photo of home in a little steel frame, leaning back on its strut: a
// sky, a green hill, a sun.
const photo: Clutter = {
  name: 'photo',
  r: 0.3,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.25);
    const q: Quad = [[u - 0.24, w + 0.06, z], [u + 0.24, w + 0.06, z], [u + 0.24, w - 0.1, z + 0.56], [u - 0.24, w - 0.1, z + 0.56]];
    stick(k, [[u, w - 0.02, z + 0.3], [u, w - 0.24, z]], C.steelDark, 0.05);
    k.poly([...q], C.steelDark, fine(k), 0.03);
    const pic: Quad = [on(q, 0.13, 0.13), on(q, 0.87, 0.13), on(q, 0.87, 0.87), on(q, 0.13, 0.87)];
    k.poly([...pic], '#8fd0ff', 0);
    k.poly([on(pic, 0, 0), on(pic, 1, 0), on(pic, 1, 0.3), on(pic, 0.6, 0.48), on(pic, 0.25, 0.42), on(pic, 0, 0.3)], C.leaf, 0);
    k.dot(...on(pic, 0.72, 0.76), 0.05, C.yellow);
  },
};

// A model of the first satellite on a little stand: a polished ball and
// four antennas swept back.
const sputnik: Clutter = {
  name: 'sputnik',
  r: 0.32,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.22);
    k.cyl(u, w, z, 0.16, 0.06, C.hull, { line: fine(k) });
    stick(k, [[u, w, z + 0.06], [u, w, z + 0.3]], C.steelDark, 0.04);
    const c: P3 = [u, w, z + 0.42];
    for (const [du, dw] of [[-1, -1], [1, -1]] as const) stick(k, [c, [u + du * 0.32, w + dw * 0.26, z + 0.08]], C.chrome, 0.03);
    const [x, y] = k.p(...c);
    k.pen.beginPath();
    k.pen.arc(x, y, 0.17 * k.s, 0, Math.PI * 2);
    k.paint(k.hgrad([u - 0.17, w, c[2]], [u + 0.17, w, c[2]], [[0, '#ffffff'], [0.35, C.chrome], [1, C.steel]]), fine(k));
    for (const [du, dw] of [[-1, 1], [1, 1]] as const) stick(k, [c, [u + du * 0.32, w + dw * 0.26, z + 0.08]], C.chrome, 0.03);
  },
};

// A round tin of rations, a red label round it and a ring pull on its lid.
const rationTin: Clutter = {
  name: 'rationTin',
  r: 0.3,
  h: 0.4,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    foot(k, u, w, z, 0.25);
    k.cyl(u, w, z, 0.23, 0.32, C.chrome, { line: fine(k), top: '#dfe5ee' });
    k.cyl(u, w, z + 0.07, 0.232, 0.17, C.red, { line: 0, top: C.red });
    k.disc(u, w, z + 0.32, 0.17, '#cfd7e2', Math.max(0.6, 0.03 * k.s));
    k.disc(u + 0.05, w + 0.04, z + 0.33, 0.06, C.steel, Math.max(0.6, 0.03 * k.s));
  },
};

// A thing drawn f times its size about where it stands (its lines too):
// the console's knobs and buttons are the size of the things as drawn, so
// they stand out a size up (as wide as the spots a hand apart allow).
function grown(c: Clutter, f: number): Clutter {
  return {
    name: c.name,
    r: c.r * f,
    h: c.h * f,
    draw(v, p) {
      const [pu, pw, pz] = p;
      c.draw({ ...v, s: v.s * f, at: (u, w, z) => v.at(pu + (u - pu) * f, pw + (w - pw) * f, pz + (z - pz) * f) }, p);
    },
  };
}

// ── what moves ───────────────────────────────────────────────────────────

// A holo emitter at the deck's front right: a steel puck with a lens. While
// its desk is worked the lens glows and throws up a hologram of a ringed
// planet that turns, a little each frame (its three meridians repeat every
// sixty degrees, so eight frames go round seamlessly); off, the lens is
// dark and nothing shows above it.
const HOLO: P3 = [5.75, 2.4, deckZ(2.4)];
const holoPlanet: DeskLoop = {
  name: 'holoPlanet',
  at: HOLO,
  r: 0.4,
  h: 1.45,
  frames: 8,
  fps: 4,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = HOLO;
    foot(k, u, w, z, 0.35);
    k.cyl(u, w, z, 0.3, 0.14, C.steelDark, { line: fine(k), top: C.steel });
    k.disc(u, w, z + 0.145, 0.17, v.active ? C.holo : C.screenDark, fine(k) * 0.8);
    if (!v.active) return;
    const pen = k.pen;
    const zc = z + 0.95;
    const [bx, by] = k.p(u, w, z + 0.15);
    const [cx, cy] = k.p(u, w, zc);
    const r = 0.27 * k.s;
    // the beam up from the lens
    pen.beginPath();
    pen.moveTo(bx - 0.12 * k.s, by);
    pen.lineTo(cx - r, cy);
    pen.lineTo(cx + r, cy);
    pen.lineTo(bx + 0.12 * k.s, by);
    pen.closePath();
    pen.fillStyle = withAlpha(C.holo, 0.16);
    pen.fill();
    k.halo(u, w, zc, 0.75, C.holo, 0.3);
    // the globe, its equator and three meridians turning
    const line = Math.max(0.8, 0.045 * k.s);
    pen.beginPath();
    pen.arc(cx, cy, r, 0, Math.PI * 2);
    pen.fillStyle = withAlpha(C.holo, 0.22);
    pen.fill();
    pen.strokeStyle = withAlpha('#d8feff', 0.95);
    pen.lineWidth = line;
    pen.stroke();
    pen.beginPath();
    pen.ellipse(cx, cy, r, r * 0.3, 0, 0, Math.PI * 2);
    for (let m = 0; m < 3; m++) {
      const a = (m * Math.PI) / 3 + (i / 8) * (Math.PI / 3);
      const rx = Math.abs(Math.cos(a)) * r;
      if (rx < 0.5) continue;
      pen.moveTo(cx + rx, cy);
      pen.ellipse(cx, cy, rx, r, 0, 0, Math.PI * 2);
    }
    pen.strokeStyle = withAlpha(C.holo, 0.75);
    pen.lineWidth = line * 0.8;
    pen.stroke();
    // the ring round it, tilted
    pen.beginPath();
    pen.ellipse(cx, cy, r * 1.6, r * 0.4, -0.28, 0, Math.PI * 2);
    pen.strokeStyle = withAlpha('#e8fbff', 0.9);
    pen.lineWidth = line * 1.2;
    pen.stroke();
  },
};

// A beacon on top of the screen: a stub of a mast with a red lamp on its
// tip. While the desk is worked the lamp is lit, a hot heart in a red
// dome, and its red light swells out round it and ebbs (never out); while
// it is not, the dome is dark glass and throws no light.
const BEACON: P3 = [4.65, 0.77, 9.69];
const GLOW = [0.3, 0.55, 0.85, 1, 0.85, 0.55] as const;
const beacon: DeskLoop = {
  name: 'beacon',
  at: BEACON,
  r: 0.3,
  h: 0.7,
  frames: 6,
  fps: 4,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = BEACON;
    k.box(u - 0.12, w - 0.1, z - 0.03, 0.24, 0.2, 0.1, C.steelDark, { line: fine(k), stripe: false });
    stick(k, [[u, w, z + 0.05], [u, w, z + 0.45]], C.steel, 0.05);
    const lamp: P3 = [u, w, z + 0.55];
    if (!v.active) {
      k.dot(...lamp, 0.12, '#3a2630', fine(k) * 0.8);
      return;
    }
    const b = GLOW[i];
    // the swell: red light painted over what is behind (so it shows on a
    // pale wall as on a dark one), out to most of a unit at its height
    const [x, y] = k.p(...lamp);
    const R = (0.3 + 0.45 * b) * k.s;
    const g = k.pen.createRadialGradient(x, y, 0, x, y, R);
    g.addColorStop(0, withAlpha('#ff2a2a', 0.6 + 0.3 * b));
    g.addColorStop(0.45, withAlpha('#ff2a2a', 0.22 + 0.2 * b));
    g.addColorStop(1, withAlpha('#ff2a2a', 0));
    k.pen.beginPath();
    k.pen.arc(x, y, R, 0, Math.PI * 2);
    k.pen.fillStyle = g;
    k.pen.fill();
    k.dot(...lamp, 0.13, mix('#e81c1c', '#ff6a5a', b), fine(k) * 0.8);
    k.dot(...lamp, 0.03 + 0.04 * b, '#ffd8cc');
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the pedestal: a rounded foot, one navy column with an orange band
    k.box(2.3, 0.45, 0, 2.6, 2.1, 0.35, C.hullDark, { round: 0.3, line: k.thin });
    k.box(2.95, 0.85, 0.35, 1.3, 1.3, BODY.bottom - 0.35, C.hull, { stripe: false });
    k.line([[2.97, 2.16, 3.0], [4.26, 2.16, 3.0], [4.26, 0.87, 3.0]], C.orange, Math.max(1, 0.22 * k.s));
    // the handrail round the left end, behind the body
    rail(k);
    // the body
    body(k);
    // the screen's short arm off the shelf, then its canted housing
    k.box(3.58, 0.5, BODY.shelf, 0.6, 0.45, 0.5, C.steelDark, { line: k.thin, stripe: false });
    k.rod([[3.88, 0.72, BODY.shelf + 0.4], [3.88, 0.72, 7.4]], C.steel, 0.22);
    housing(k);
    // the trackball by the agent's hand, and the row of buttons high on
    // the deck under the screen
    const [tx, ty] = k.p(...deck(2.0, 0.43));
    k.pen.beginPath();
    k.pen.ellipse(tx, ty, 0.5 * k.s, 0.36 * k.s, 0, 0, Math.PI * 2);
    k.paint(C.steelDark, k.thin);
    k.pen.beginPath();
    k.pen.arc(tx, ty - 0.12 * k.s, Math.max(1.2, 0.34 * k.s), 0, Math.PI * 2);
    k.paint('#9fb3c8', k.thin);
    BUTTONS.forEach((c, i) => {
      const [x, y] = k.p(...deck(3.1 + i * 0.5, 0.78));
      const r = Math.max(1, 0.21 * k.s);
      k.pen.beginPath();
      k.pen.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2);
      k.paint(v.active ? mix(c, '#ffffff', 0.2) : shade(c, -0.5), k.thin * 0.7);
      if (v.active) {
        k.halo(...deck(3.1 + i * 0.5, 0.78), 0.45, c, 0.35);
        if (k.fine) {
          k.pen.beginPath();
          k.pen.arc(x - r * 0.3, y - r * 0.25, Math.max(0.6, r * 0.3), 0, Math.PI * 2);
          k.pen.fillStyle = '#ffffff';
          k.pen.fill();
        }
      }
    });
    // the right end's bracket and the look it holds
    bracket(k, look);
  },
  screen: SCREEN,
  // the shelf's right end, clear of the agent and the screen
  top: [6.5, 0.5, BODY.shelf],
  clutter: {
    items: [grown(drinkPouch, 1.2), grown(rationBar, 1.05), grown(tapeRoll, 1.15), grown(torch, 1.05), grown(modelRocket, 1.2), grown(plushAlien, 1.2), grown(zinnia, 1.2), grown(photo, 1.2), grown(sputnik, 1.05), grown(rationTin, 1.2)],
    // two on the shelf left of the screen, three along the deck's front
    spots: [
      [1.45, 0.75, BODY.shelf],
      [2.3, 1.15, BODY.shelf],
      [3.02, FRONT, deckZ(FRONT)],
      [3.96, FRONT, deckZ(FRONT)],
      [4.9, FRONT, deckZ(FRONT)],
    ],
  },
  loops: [holoPlanet, beacon],
};

// The body: white, a navy control panel let into its deck, its +u end a
// grey panel; an orange stripe of livery along the front; inked round its
// silhouette.
function body(k: Kit): void {
  const { back, front, bottom, lip, shelf, edge } = BODY;
  const end: P3[] = [[U1, back, bottom], [U1, front, bottom], [U1, front, lip], [U1, edge, shelf], [U1, back, shelf]];
  const face: P3[] = [[U0, front, bottom], [U1, front, bottom], [U1, front, lip], [U0, front, lip]];
  const slope: P3[] = [[U0, front, lip], [U1, front, lip], [U1, edge, shelf], [U0, edge, shelf]];
  const top: P3[] = [[U0, edge, shelf], [U1, edge, shelf], [U1, back, shelf], [U0, back, shelf]];
  k.poly(face, k.side(C.white, 0, 1), k.thin);
  k.poly(end, k.side(C.panel, 1, 0), k.thin);
  k.poly(slope, shade(C.white, 0.04), k.thin);
  k.poly(top, C.shell, k.thin);
  // the navy control panel let into the deck
  const panel: P3[] = [deck(U0 + 0.3, 0.18), deck(U1 - 0.2, 0.18), deck(U1 - 0.2, 0.82), deck(U0 + 0.3, 0.82)];
  k.poly(panel, k.lgrad(panel[0], panel[3], [1, 0, 0], [[0, '#2b3754'], [1, '#3a4766']]), k.thin, 0.15);
  // a white lip along the deck's front edge, the livery stripe under it
  k.line([[U0 + 0.05, front, lip - 0.02], [U1 - 0.05, front, lip - 0.02]], '#f6f8fb', Math.max(1, 0.18 * k.s));
  k.line([[U0 + 0.1, front + 0.01, 4.45], [U1, front + 0.01, 4.45], [U1 + 0.01, back + 0.1, 4.45]], C.orange, Math.max(1, 0.3 * k.s));
  if (k.fine) {
    // a vent in the front, a seam across the end
    for (const z of [4.0, 4.15]) k.line([[U0 + 3.2, front + 0.01, z], [U0 + 4.6, front + 0.01, z]], C.steel, Math.max(0.6, 0.07 * k.s));
    k.line([[U1 + 0.01, edge, shelf - 0.05], [U1 + 0.01, edge, bottom + 0.1]], shade(C.panel, -0.15), Math.max(0.6, 0.06 * k.s));
  }
  const pts: Pt[] = [];
  for (const q of [end, face, slope, top]) for (const p of q) pts.push(k.p(...p));
  fillPts(k, hull(pts), null, k.lw);
}

// The chrome handrail: a bar along the left end on two standoffs.
function rail(k: Kit): void {
  const z = 5.45;
  k.rod([[U0, 0.55, z - 0.2], [0.3, 0.55, z], [0.3, 2.55, z], [U0, 2.55, z - 0.35]], C.chrome, 0.2);
}

// The screen's housing: a white slab canted back, its face a white bezel
// round the glass with a thin navy edge.
function housing(k: Kit): void {
  const q = SCREEN;
  const shell: Quad = [on(q, -0.1, -0.1), on(q, 1.1, -0.1), on(q, 1.1, 1.1), on(q, -0.1, 1.1)];
  const bez: Quad = [on(q, -0.015, -0.02), on(q, 1.015, -0.02), on(q, 1.015, 1.02), on(q, -0.015, 1.02)];
  // back along the slab's normal: up the slope, into the console
  const back = shell.map(([u, w, z]) => [u, w - 0.32, z - 0.06] as P3);
  // the +u end and the top edge, then the face
  k.poly([shell[1], back[1], back[2], shell[2]], k.side(C.panel, 1, 0), k.thin);
  k.poly([shell[3], shell[2], back[2], back[3]], C.shell, k.thin);
  k.poly([...shell], k.side(C.white, 0, 1), k.thin, 0.15);
  k.poly([...bez], C.navy, 0, 0.08);
  const pts: Pt[] = [...shell, ...back].map((p) => k.p(...p));
  fillPts(k, hull(pts), null, k.lw);
}

// The bracket on the right end, and on it: a mug in a clip (0), a tablet
// in a sleeve (1), or a potted sprout under a dome (2).
function bracket(k: Kit, look: number): void {
  const z = 4.7;
  if (look === 1) {
    // a tablet standing in a fabric sleeve hung on the end panel, its
    // glass to the room
    k.box(6.25, 1.25, 4.4, 0.22, 1.0, 1.65, '#3a4766', { line: k.thin, round: 0.08, stripe: false });
    k.poly([[6.48, 1.35, 5.0], [6.48, 2.15, 5.0], [6.48, 2.15, 5.92], [6.48, 1.35, 5.92]], C.screenMid, 0);
    k.box(U1, 1.1, 4.2, 0.42, 1.3, 0.9, C.blanket, { line: k.thin, round: 0.08, stripe: false });
    return;
  }
  // a little shelf off the end, on a steel strut
  k.rod([[U1, 1.7, 3.9], [6.65, 1.7, z - 0.05]], C.steel, 0.12);
  k.box(U1, 1.15, z - 0.12, 0.75, 1.1, 0.12, C.steelDark, { line: k.thin, stripe: false });
  if (look === 0) {
    // a mug, clipped in by a steel ring
    mug(k, 6.55, 1.7, z, C.orange, 0.28);
    k.cyl(6.55, 1.7, z, 0.33, 0.16, C.steel, { line: k.thin });
  } else {
    // a pot, a sprout, a glass dome over them
    k.cyl(6.58, 1.7, z, 0.3, 0.35, C.white, { line: k.thin });
    k.disc(6.58, 1.7, z + 0.33, 0.24, C.soil, 0);
    sprouts(k, 6.58, 1.7, z + 0.35, 4, 0.75, 9, [C.leaf, C.leafLight]);
    const [cx, cy] = k.p(6.58, 1.7, z + 0.15);
    const r = 0.36 * Math.SQRT2 * k.s;
    k.pen.beginPath();
    k.pen.ellipse(cx, cy - 0.15 * k.s, r, r * 1.35, 0, Math.PI, Math.PI * 2);
    k.pen.closePath();
    k.paint('#cfe9ff33', k.thin * 0.8);
    k.pen.beginPath();
    k.pen.arc(cx - r * 0.45, cy - r * 0.75, Math.max(0.6, r * 0.14), 0, Math.PI * 2);
    k.pen.fillStyle = '#ffffffaa';
    k.pen.fill();
  }
}
