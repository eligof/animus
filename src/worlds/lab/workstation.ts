import { shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { DESK } from '../../world/desks.ts';
import type { Clutter, DeskLoop, PropView, WorkstationArt } from '../types.ts';
import { beaker, bulb, erlenmeyer, jar, pilot } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Mad Science Lab's workstation (see WorkstationArt in ../types.ts): a lab
// bench with a green-screen terminal. A short bench of teal cupboards
// under a black resin top; right of the agent a chunky terminal, its deep
// beige case round the tube (the screen), its keyboard in front of the
// agent; at the left back a ring stand holding a round flask of fluid over
// a little burner; the right end kept clear for a desk upgrade. Looks: the
// flask's fluid green, magenta or blue. On: the fluid glows and the burner
// is lit.
// What stands on the top is a place's pick from a mad scientist's bench
// (CLUTTER): a beaker, a rack of test tubes, a stoppered flask, a petri
// dish, a brain in a jar, brass goggles, a horseshoe magnet, a corked
// potion, a spirit burner (lit while worked) and a big glass bulb (its
// filament glowing while worked), on a spot beside the ring stand and a
// row along the front before the terminal. What moves (LOOPS): a flask of
// green fluid on a hot plate at the front right corner, boiling while the
// desk is worked, still and the plate cold while it is not.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.

const ZT = 5.85; // the resin top's surface
const FLUIDS: readonly Color[] = [C.green, C.magenta, C.blue];
// The terminal's beige, as the chemistry bench's.
const BEIGE = '#ddd5bd';
const BEIGE_BACK = '#c9c0a6';
// The terminal's case: u0..u1 along, its face at v = F, from the top to z1.
const CRT = { u0: 2.5, u1: 5.6, F: 1.45, z1: 9.8 };
// The flask on its ring stand.
const FLASK = { u: 0.8, v: 0.85, z: 6.9, R: 0.74 };

// The cupboards: a toe kick, the body, a drawer row and three doors with
// chrome pulls, the resin top over them.
function bench(k: Kit): void {
  k.box(0.4, 0.4, 0, DESK.len - 0.8, 2.1, 0.45, C.iron, { line: k.thin, stripe: false });
  k.box(0.15, 0.15, 0.45, DESK.len - 0.3, 2.5, ZT - 0.9, C.tealDark, { stripe: false });
  const F = 2.65;
  const door = k.side(C.cabinet, 0, 1);
  for (const [u0, u1] of [[0.35, 2.3], [2.45, 4.55], [4.7, 6.65]] as const) {
    k.face(u0, u1, F, 0.7, 3.95, door, k.thin, 0.1);
    k.face(u0, u1, F, 4.15, 4.8, door, k.thin, 0.1);
    const m = (u0 + u1) / 2;
    k.rod([[m - 0.35, F + 0.08, 4.48], [m + 0.35, F + 0.08, 4.48]], C.chrome, 0.12);
    const pu = u0 < 2 ? u1 - 0.3 : u0 + 0.3;
    k.rod([[pu, F + 0.08, 3.5], [pu, F + 0.08, 2.75]], C.chrome, 0.12);
  }
  k.box(0, 0, ZT - 0.45, DESK.len, DESK.dep, 0.45, C.resin);
}

// The terminal: a deep beige case, its tapering back, the tube's dark rim
// round the screen, vents, a knob and its pilot light.
function terminal(k: Kit, on: boolean): void {
  const { u0, u1, F, z1 } = CRT;
  k.box(u0 + 0.4, 0.1, ZT + 0.3, u1 - u0 - 0.8, 0.7, z1 - ZT - 1.1, BEIGE_BACK, { stripe: false });
  k.box(u0, 0.8, ZT, u1 - u0, F - 0.8, z1 - ZT, BEIGE, { round: 0.25 });
  // the tube's rim, a little bigger than the screen, its corners rounded
  k.poly([[2.65, F, 6.45], [5.45, F, 6.45], [5.45, F, 9.55], [2.65, F, 9.55]], '#1d2a26', k.thin, 0.45);
  // under the tube: vents, a knob and the pilot light
  if (k.fine) for (let i = 0; i < 4; i++) k.line([[2.9 + i * 0.3, F + 0.01, 6.02], [2.9 + i * 0.3, F + 0.01, 6.28]], shade(BEIGE, -0.3), Math.max(0.7, 0.07 * k.s));
  k.dot(4.6, F + 0.01, 6.15, Math.max(1, 0.13 * k.s), BEIGE_BACK, k.thin * 0.7);
  pilot(k, 5.15, F + 0.01, 6.15, 0.11, C.greenGlow, on);
}

// The terminal's keyboard, in front of the agent at the top's left front
// (the front before the terminal is kept for what stands on the top).
function keyboard(k: Kit): void {
  const [u0, v0] = [0.45, 1.85];
  k.box(u0, v0, ZT, 2.1, 0.6, 0.25, BEIGE, { line: k.thin });
  if (k.fine) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 6; j++) {
        const [x, y] = k.p(u0 + 0.18 + j * 0.3, v0 + 0.17 + i * 0.22, ZT + 0.26);
        pen.moveTo(x, y);
        pen.lineTo(x + 0.15 * k.s, y + 0.075 * k.s);
      }
    }
    pen.strokeStyle = '#9a917a';
    pen.lineWidth = Math.max(0.6, 0.1 * k.s);
    pen.stroke();
  }
}

// The ring stand: its plate and rod, a burner under the flask, the round
// flask clamped by its neck; fluid of the look's colour, glowing when on.
function flask(k: Kit, fluid: Color, on: boolean): void {
  const { u, v, z, R } = FLASK;
  k.box(0.2, 0.2, ZT, 1.4, 1.2, 0.16, C.iron, { line: k.thin, stripe: false });
  k.rod([[0.4, 0.4, ZT], [0.4, 0.4, 9.75]], C.steel, 0.16);
  // the burner, its flame lit while the screen is on
  k.cyl(u, v, ZT + 0.16, 0.3, 0.2, C.iron, { line: k.thin });
  k.cyl(u, v, ZT + 0.36, 0.12, 0.45, C.brass, { line: k.thin });
  if (on) {
    k.poly([[u - 0.13, v, ZT + 0.82], [u, v, ZT + 1.12], [u + 0.13, v, ZT + 0.82]], C.blue, 0, 0.3);
    k.halo(u, v, ZT + 0.95, 0.5, C.arc, 0.4);
  }
  // the ring under the bulb, on its arm from the rod
  k.rod([[0.4, 0.4, z + 0.25], [u - 0.55, v - 0.1, z + 0.25]], C.steelDark, 0.12);
  if (on) k.halo(u, v, z + R, R * 2.4, fluid, 0.32);
  bulb(k, u, v, z, R, 0.75, fluid, 0.55);
  const e = k.ell(u, v, z + 0.25, R * 0.95);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
  k.paint(null, Math.max(1.2, 0.14 * k.s), C.steelDark);
  // the clamp on its neck
  k.rod([[0.4, 0.4, z + 2 * R + 0.3], [u, v, z + 2 * R + 0.3]], C.steelDark, 0.12);
  k.cyl(u, v, z + 2 * R + 0.2, 0.28, 0.2, C.steelDark, { line: k.thin });
}

// ── on the top: a place's pick of these (see clutterOf) ─────────────────────

// A light ink for small glass and parts (the kit's thin line would fill them).
const fine = (k: Kit): number => Math.max(0.7, 0.07 * k.s);

// A beaker of amber fluid with a pouring lip.
const amberBeaker: Clutter = {
  name: 'amberBeaker',
  r: 0.3,
  h: 0.75,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    beaker(k, u, w, z, 0.26, 0.7, C.amber, 0.6);
    if (k.s >= 5) for (const dz of [0.22, 0.36, 0.5]) k.line([[u - 0.2, w + 0.15, z + dz], [u - 0.1, w + 0.22, z + dz]], withAlpha(INK, 0.6), fine(k) * 0.8);
  },
};

// A little wooden rack of three test tubes.
const tubeRack: Clutter = {
  name: 'tubeRack',
  r: 0.3,
  h: 0.9,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const line = fine(k);
    k.box(u - 0.3, w - 0.13, z, 0.6, 0.26, 0.08, C.wood, { line, stripe: false });
    k.box(u - 0.3, w - 0.06, z + 0.08, 0.07, 0.12, 0.42, C.woodDark, { line, stripe: false });
    ([[-0.15, C.amber], [0, C.greenGlow], [0.15, C.violet]] as const).forEach(([du, c]) => {
      k.glass(u + du, w, [[z + 0.06, 0.01], [z + 0.12, 0.06], [z + 0.82, 0.06], [z + 0.86, 0.075]], c, 0.55, line);
    });
    k.box(u - 0.3, w - 0.13, z + 0.42, 0.6, 0.26, 0.08, C.wood, { line, stripe: false });
    k.box(u + 0.23, w - 0.06, z + 0.08, 0.07, 0.12, 0.42, C.woodDark, { line, stripe: false });
  },
};

// An Erlenmeyer flask of blue fluid, stoppered.
const blueFlask: Clutter = {
  name: 'blueFlask',
  r: 0.3,
  h: 0.85,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    erlenmeyer(k, u, w, z, 0.7, C.blue, 0.42);
    k.cyl(u, w, z + 0.66, 0.11, 0.14, C.rubber, { line: fine(k) });
  },
};

// A petri dish of pale agar, its colonies in the lab's bright colours.
const petriDish: Clutter = {
  name: 'petriDish',
  r: 0.3,
  h: 0.15,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.29, 0.08, withAlpha(C.glass, 0.85), { line: fine(k) });
    k.disc(u, w, z + 0.07, 0.24, '#eee6a8', 0);
    for (const [du, dv, r, c] of [[-0.09, -0.06, 0.07, C.green], [0.08, -0.08, 0.05, C.magenta], [0.02, 0.09, 0.06, C.orange], [-0.1, 0.1, 0.04, C.green], [0.13, 0.06, 0.04, C.violet]] as const) {
      k.disc(u + du, w + dv, z + 0.075, r, c, 0);
    }
  },
};

// A brain floating in a jar of green fluid under a steel lid.
const brainJar: Clutter = {
  name: 'brainJar',
  r: 0.3,
  h: 1.1,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    jar(k, u, w, z, 0.27, 0.8, C.fluid, C.steelDark, (x, y, size) => {
      const pen = k.pen;
      const line = fine(k);
      pen.beginPath();
      pen.ellipse(x, y, size * 0.95, size * 0.72, 0, 0, Math.PI * 2);
      k.paint('#f4a6b8', line);
      // its folds
      pen.beginPath();
      pen.moveTo(x, y - size * 0.7);
      pen.quadraticCurveTo(x + size * 0.15, y, x, y + size * 0.7);
      for (const [a, b] of [[-0.6, -0.25], [-0.5, 0.3], [0.45, -0.3], [0.55, 0.25]] as const) {
        pen.moveTo(x + a * size, y + b * size);
        pen.quadraticCurveTo(x + a * size * 0.6, y + (b + 0.2) * size, x + a * size * 0.3, y + b * size);
      }
      pen.strokeStyle = '#c56a84';
      pen.lineWidth = Math.max(0.6, line * 0.8);
      pen.stroke();
    });
  },
};

// Brass-rimmed goggles lying lenses up, their leather strap looped behind.
const goggles: Clutter = {
  name: 'goggles',
  r: 0.3,
  h: 0.2,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const line = fine(k);
    const e = k.ell(u - 0.05, w - 0.05, z + 0.05, 0.25);
    k.pen.beginPath();
    k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, Math.PI * 0.92, Math.PI * 2.08);
    k.paint(null, Math.max(1.4, 0.09 * k.s + line), INK);
    k.pen.strokeStyle = '#8a5a3a';
    k.pen.lineWidth = Math.max(0.9, 0.09 * k.s);
    k.pen.stroke();
    // the lenses side by side across the view, a bridge between
    const d = 0.13;
    for (const f of [-1, 1]) {
      const [lu, lv] = [u + f * d, w - f * d];
      k.cyl(lu, lv, z, 0.13, 0.1, C.brass, { line });
      k.disc(lu, lv, z + 0.1, 0.095, '#7fdcae', line * 0.6);
      k.disc(lu - 0.03, lv - 0.03, z + 0.105, 0.035, '#ffffffc8', 0);
    }
    k.line([[u - 0.03, w + 0.03, z + 0.09], [u + 0.03, w - 0.03, z + 0.09]], C.brass, Math.max(0.8, 0.07 * k.s));
  },
};

// A red horseshoe magnet standing on its bend, facing the viewer, its
// poles up and silver.
const magnet: Clutter = {
  name: 'magnet',
  r: 0.3,
  h: 0.8,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    // across the view (a) and toward the viewer (n), in the top's plane
    const a = Math.SQRT1_2;
    const at = (n: number, t: number, zz: number): P3 => [u + a * t + a * n, w - a * t + a * n, zz];
    const R = 0.27;
    const r = 0.09;
    const cz = z + R;
    const top = z + 0.78;
    const shape = (n: number): P3[] => {
      const out: P3[] = [];
      for (let i = 0; i <= 12; i++) {
        const th = Math.PI + (i / 12) * Math.PI;
        out.push(at(n, -Math.cos(th) * R, cz + Math.sin(th) * R));
      }
      out.push(at(n, -R, top), at(n, -r, top));
      for (let i = 12; i >= 0; i--) {
        const th = Math.PI + (i / 12) * Math.PI;
        out.push(at(n, -Math.cos(th) * r, cz + Math.sin(th) * r));
      }
      out.push(at(n, r, top), at(n, R, top));
      return out;
    };
    const line = Math.max(0.8, 0.08 * k.s);
    k.poly(shape(-0.07), shade(C.red, -0.35), line);
    k.poly(shape(0.07), C.red, line);
    for (const f of [-1, 1]) {
      const [t0, t1] = f < 0 ? [-R, -r] : [r, R];
      k.poly([at(-0.07, t0, top), at(-0.07, t1, top), at(0.07, t1, top), at(0.07, t0, top)], shade(C.chrome, 0.05), line);
      k.poly([at(0.07, t0, top - 0.16), at(0.07, t1, top - 0.16), at(0.07, t1, top), at(0.07, t0, top)], C.chrome, line);
    }
  },
};

// A round-bottomed potion of violet fluid with a cork in its neck.
const potion: Clutter = {
  name: 'potion',
  r: 0.3,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    bulb(k, u, w, z, 0.26, 0.28, C.violet, 0.62);
    k.cyl(u, w, z + 0.78, 0.1, 0.16, C.cork, { line: fine(k) });
  },
};

// A squat glass spirit burner, its wick in a brass collar: a little blue
// flame while the desk is worked.
const spiritBurner: Clutter = {
  name: 'spiritBurner',
  r: 0.3,
  h: 0.8,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.glass(u, w, [[z, 0.25], [z + 0.05, 0.27], [z + 0.22, 0.27], [z + 0.36, 0.12]], '#d8ecff', 0.6);
    k.cyl(u, w, z + 0.34, 0.1, 0.1, C.brass, { line: fine(k) });
    k.line([[u, w, z + 0.44], [u, w, z + 0.52]], INK, Math.max(0.7, 0.05 * k.s));
    if (!v.active) return;
    k.halo(u, w, z + 0.62, 0.45, C.arc, 0.4);
    k.poly([[u - 0.09, w, z + 0.5], [u, w, z + 0.78], [u + 0.09, w, z + 0.5]], C.blue, 0, 0.3);
    k.poly([[u - 0.04, w, z + 0.5], [u, w, z + 0.64], [u + 0.04, w, z + 0.5]], '#e8f4ff', 0, 0.2);
  },
};

// A big glass bulb on a brass screw base; its filament glows while the
// desk is worked.
const lightBulb: Clutter = {
  name: 'lightBulb',
  r: 0.3,
  h: 1.0,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    const on = v.active;
    k.cyl(u, w, z, 0.13, 0.26, C.brass, { line: fine(k) });
    if (k.s >= 5) for (const dz of [0.08, 0.16]) k.line([[u - 0.12, w + 0.06, z + dz], [u + 0.06, w + 0.12, z + dz + 0.03]], shade(C.brass, -0.3), Math.max(0.6, 0.05 * k.s));
    if (on) k.halo(u, w, z + 0.6, 0.6, C.warm, 0.5);
    const prof: ReadonlyArray<readonly [number, number]> = [[z + 0.26, 0.12], [z + 0.38, 0.16], [z + 0.52, 0.25], [z + 0.66, 0.27], [z + 0.8, 0.22], [z + 0.9, 0.13], [z + 0.95, 0.02]];
    k.glass(u, w, prof, on ? withAlpha(C.warm, 0.5) : null, 0.98, fine(k) * 1.3);
    const fil: P3[] = [[u - 0.05, w, z + 0.3], [u - 0.06, w, z + 0.58], [u - 0.02, w, z + 0.64], [u + 0.02, w, z + 0.56], [u + 0.06, w, z + 0.64], [u + 0.05, w, z + 0.3]];
    k.line(fil, on ? '#fff3c0' : '#7a6a5a', Math.max(0.7, 0.05 * k.s));
  },
};

const CLUTTER: readonly Clutter[] = [amberBeaker, tubeRack, blueFlask, petriDish, brainJar, goggles, magnet, potion, spiritBurner, lightBulb];

// Where they stand: one between the ring stand and the terminal, and a
// row along the front before the terminal, clear of its tube, the agent
// and the upgrade's end.
const SPOTS: readonly P3[] = [
  [2.0, 1.3, ZT],
  [2.92, 2.25, ZT],
  [3.73, 2.25, ZT],
  [4.54, 2.25, ZT],
  [5.35, 2.25, ZT],
];

// A round flask of green fluid on a little hot plate at the top's front
// right: boiling while the desk is worked (the plate's coil red, bubbles
// rising and breaking at the neck), still and the plate cold while not.
const BOIL: P3 = [6.35, 2.45, ZT];
const BOIL_R = 0.3;
const BOIL_Z = 0.2; // the plate's top over the resin
const boiling: DeskLoop = {
  name: 'boilingFlask',
  at: BOIL,
  r: 0.5,
  h: 1.6,
  frames: 6,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = BOIL;
    const on = v.active;
    const zp = z + BOIL_Z;
    k.box(u - 0.38, w - 0.38, z, 0.76, 0.76, BOIL_Z, C.steelDark, { line: k.thin });
    k.disc(u, w, zp, 0.3, on ? C.orange : C.iron, fine(k));
    if (on) {
      k.disc(u, w, zp, 0.2, '#ffd27a', 0);
      k.halo(u, w, zp, 0.5, C.orange, 0.35);
    }
    k.dot(u + 0.2, w + 0.38, z + BOIL_Z / 2, Math.max(0.8, 0.06 * k.s), on ? C.red : C.chrome, fine(k) * 0.6);
    if (on) k.halo(u, w, zp + BOIL_R, 0.65, C.greenGlow, 0.3);
    bulb(k, u, w, zp, BOIL_R, 0.36, on ? C.greenGlow : C.green, 0.6);
    if (!on) return;
    // bubbles rising through the fluid, each a step further a frame, and
    // one breaking out of the neck
    const pen = k.pen;
    pen.beginPath();
    for (let j = 0; j < 5; j++) {
      const t = ((i / 6 + j / 5) % 1);
      const zz = zp + 0.08 + t * BOIL_R * 1.05;
      const du = [-0.12, 0.08, -0.03, 0.13, 0.0][j] + Math.sin((t + j) * 6) * 0.02;
      const [x, y] = k.p(u + du, w, zz);
      const r = Math.max(0.7, (0.03 + 0.03 * t) * k.s);
      pen.moveTo(x + r, y);
      pen.arc(x, y, r, 0, Math.PI * 2);
    }
    pen.fillStyle = '#ffffffd8';
    pen.fill();
    const top = zp + 2 * BOIL_R + 0.36 + 0.08;
    const t = i / 6;
    const [x, y] = k.p(u, w, top + 0.06 + t * 0.4);
    const r = (0.06 + 0.05 * Math.sin(t * Math.PI)) * k.s;
    pen.beginPath();
    pen.arc(x + Math.sin(t * 5) * 0.03 * k.s, y, r, 0, Math.PI * 2);
    pen.fillStyle = withAlpha(C.greenGlow, 0.85 - 0.5 * t);
    pen.fill();
  },
};

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const fluid = FLUIDS[v.seed % 3];
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    bench(k);
    flask(k, fluid, v.active);
    keyboard(k);
    terminal(k, v.active);
  },
  // the tube's glass, inside its rim
  screen: [
    [2.8, CRT.F, 6.6],
    [5.3, CRT.F, 6.6],
    [5.3, CRT.F, 9.4],
    [2.8, CRT.F, 9.4],
  ],
  // the top's right end, beside the terminal, clear of the agent
  top: [6.3, 0.75, ZT],
  clutter: { items: CLUTTER, spots: SPOTS },
  loops: [boiling],
};
