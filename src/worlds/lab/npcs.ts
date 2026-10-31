import { shade } from '../../art/iso.ts';
import { bump, ease, env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { move, mul, turn, zoom, type Sketch } from '../../art/figure/paint.ts';
import type { Color, Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet } from '../types.ts';
import { C } from './kit.ts';
import { ASSISTANT, CHEMIST } from './stations.ts';

// The lab's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the lab's teal ink: the hunchbacked assistant at the
// tesla coil's lever (see ASSISTANT in ./stations.ts), the professor at
// the near end of the chalkboard, the chemist behind her bench (see
// CHEMIST). Each drawn facing +x in three-quarter view, its near side
// toward -x.

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
const poly = (pts: readonly number[]) => (p: Pen) => {
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
};

// Draws `fn` in a frame turned back level at the end of arm k's forearm
// (the hand), whatever the arm and the lean: for what is held upright.
function level(sk: Sketch, p: Puppet, k: 0 | 1, f: number, fn: () => void): void {
  sk.at(mul(move(0, f), turn(p.arms[k].sh + p.arms[k].el - p.lean)), fn);
}

// A few round bubbles about (x, y), rising `rise` with t.
function fizz(sk: Sketch, x: number, y: number, t: number, color: Color, rise = 1.3): void {
  sk.draw((q, c) => {
    q.strokeStyle = color;
    q.lineWidth = Math.max(0.1, 0.7 / c.px);
    for (let i = 0; i < 3; i++) {
      const f = (t + i / 3) % 1;
      q.beginPath();
      q.arc(x + 0.35 * Math.sin(i * 2.3 + f * 4), y - f * rise, 0.14 + 0.08 * i, 0, TAU);
      q.stroke();
    }
  });
}

// ── the assistant ────────────────────────────────────────────────────────
// A hunchback in a patched, ragged burlap smock with a rope belt, his hump
// high on his back, a big bald head with three hairs and a single bushy
// brow, one snaggle tooth, big ears, long arms. He stands on the floor at
// the end of the coil's console, a hand on its great lever, rubbing his
// hands in glee; his show is "it's alive!": the lever yanked, arms flung
// up, a cackle.

const AS = {
  skin: '#d6c9a6',
  skinD: '#ad9f7c',
  smock: '#5c4c3a',
  smockD: '#433628',
  patch: '#8a7556',
  rope: '#c9a86a',
  legs: '#4a4a52',
  legsD: '#36363c',
  wrap: '#8a7a62',
  brow: '#2a2420',
};

const ASSISTANT_BONES: Bones = { neck: [1.3, -6.6], shoulders: [[-0.45, -6.0], [2.2, -5.9]], upper: 1.9, fore: 1.9 };

const assistantParts: NpcParts = {
  body(sk, _p, back) {
    // short bowed legs, feet wrapped in rags
    for (const [x, near] of [[1.4, false], [-0.4, true]] as const) {
      sk.limb([x - 0.25, -3.1, x + 0.2, -1.6, x, -0.7], 1.05, near ? AS.legs : AS.legsD, { dark: near ? AS.legsD : null });
      sk.blob((q) => q.roundRect(x - 0.6, -0.95, 1.75, 0.95, 0.45), AS.wrap, { dark: shade(AS.wrap, -0.2), d: 0.2 });
    }
    // the smock: hunched forward, the hump high on the back, a ragged hem
    sk.blob((q) => {
      q.moveTo(-1.2, -2.6);
      q.lineTo(-1.9, -4.6);
      q.quadraticCurveTo(-3.3, -6.6, -2.2, -8.1);
      q.quadraticCurveTo(-0.8, -9.3, 0.9, -7.3);
      q.quadraticCurveTo(2.6, -6.6, 3.0, -5.3);
      q.lineTo(3.1, -2.9);
      q.lineTo(2.5, -2.4);
      q.lineTo(1.9, -2.9);
      q.lineTo(1.2, -2.3);
      q.lineTo(0.5, -2.85);
      q.lineTo(-0.2, -2.25);
      q.closePath();
    }, AS.smock, { dark: AS.smockD, d: 0.55 });
    // a patch on the hump, the rope belt
    sk.blob(poly([-2.4, -7.3, -1.2, -7.6, -1.0, -6.4, -2.2, -6.2]), AS.patch, { line: 0.5 });
    sk.limb([-1.6, -4.1, 0.6, -4.05, 3.0, -4.15], 0.32, AS.rope, { line: 0.5 });
    if (back) return;
    sk.limb([1.5, -4.05, 1.7, -3.2], 0.22, AS.rope, { line: 0.4 });
    sk.blob(poly([0.4, -5.6, 1.4, -5.75, 1.5, -4.75, 0.5, -4.6]), shade(AS.patch, -0.1), { line: 0.5 });
  },
  head(sk, p, back) {
    const cx = 0.6;
    const cy = -2.55;
    // a big ear at the back of the head
    sk.blob(ell(cx - 2.6, cy + 0.4, 0.9, 1.2), AS.skin, { dark: AS.skinD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.05, 2.95), AS.skin, { dark: AS.skinD, d: 0.45 });
    // three hairs on top
    sk.draw((q, c) => {
      q.strokeStyle = AS.brow;
      q.lineWidth = Math.max(0.12, 0.8 / c.px);
      q.lineCap = 'round';
      q.beginPath();
      for (const [x, a] of [[-0.5, -0.5], [0.2, 0.1], [0.9, 0.55]] as const) {
        q.moveTo(cx + x, cy - 2.9);
        q.quadraticCurveTo(cx + x + a, cy - 3.9, cx + x + a * 1.8, cy - 3.6);
      }
      q.stroke();
    });
    if (back) return;
    // stubble on the jaw
    sk.blob(ell(cx + 0.9, cy + 1.75, 1.9, 0.95), '#c2b593', { line: 0, sil: false });
    face(sk, { x: cx + 0.8, y: cy + 0.05, eyes: p.eyes, mouth: p.mouth, gap: 2.2, r: 0.58, drop: 1.6 });
    // one bushy brow right across, a snaggle tooth, a lumpy nose
    sk.limb([cx - 0.75, cy - 0.95, cx + 0.6, cy - 0.65, cx + 1.9, cy - 1.15], 0.5, AS.brow, { line: 0.5 });
    if (p.mouth !== 'closed') sk.blob(poly([cx + 0.55, cy + 1.45, cx + 0.95, cy + 1.45, cx + 0.75, cy + 1.95]), '#f4efe0', { line: 0.4, sil: false });
    sk.blob(ell(cx + 1.15, cy + 0.65, 0.55, 0.5), shade(AS.skin, -0.06), { dark: AS.skinD, d: 0.15, line: 0.5 });
  },
  upper(sk, _p, k) {
    const b = ASSISTANT_BONES.upper;
    sk.limb([0, 0, 0, b], 1.2, k ? AS.smockD : AS.smock, { dark: k ? null : AS.smockD });
  },
  fore(sk, _p, k) {
    const f = ASSISTANT_BONES.fore;
    // a ragged sleeve end, a bony forearm, a big knobbly hand
    sk.limb([0, 0, 0, f - 0.4], 0.85, k ? AS.skinD : AS.skin, { dark: k ? null : AS.skinD });
    sk.blob(poly([-0.65, -0.15, 0.65, -0.15, 0.6, 0.6, 0.3, 0.35, 0.0, 0.7, -0.3, 0.35, -0.6, 0.65]), k ? AS.smockD : AS.smock, { line: 0.5 });
    sk.blob(ell(0, f, 0.72, 0.62), k ? AS.skinD : AS.skin, { dark: AS.skinD, d: 0.2 });
  },
};

// The near hand on the lever's knob (thrown back toward him), as solved
// for its place: the upper arm back, the forearm reaching down to it.
const ON_LEVER = { sh: -0.16, el: 1.59 };
// Both hands together before his chest, rubbing.
const RUB: readonly [{ sh: number; el: number }, { sh: number; el: number }] = [{ sh: 0.71, el: 1.17 }, { sh: -0.48, el: 2.71 }];

// A hand on the lever, the other drumming the console; then both hands
// together, rubbing, and a giggle.
const assistantWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const rub = ease(u, 0.42, 0.52) - ease(u, 0.9, 1);
    const wring = Math.sin(u * TAU * 5) * bump(u, 0.5, 0.92);
    const drum = Math.sin(u * TAU * 4) * (1 - rub);
    return {
      ...rest(),
      bob: 0.12 * Math.abs(wring),
      lean: 0.15,
      tilt: 0.05 + 0.08 * rub + 0.05 * Math.abs(wring),
      arms: [
        { sh: ON_LEVER.sh + (RUB[0].sh - ON_LEVER.sh) * rub + 0.08 * wring, el: ON_LEVER.el + (RUB[0].el - ON_LEVER.el) * rub },
        { sh: 0.75 + (RUB[1].sh - 0.75) * rub + 0.05 * drum, el: 0.9 + (RUB[1].el - 0.9) * rub - 0.12 * wring },
      ],
      eyes: rub > 0.5 ? 'happy' : 'open',
      mouth: rub > 0.5 ? (wring > 0 ? 'open' : 'smile') : 'smile',
    };
  },
};

// "It's alive!": both hands on the lever, a yank, then his arms flung up
// and waving, head thrown back, cackling; then back to the lever.
const assistantShow: NpcLoop & { crowd: 'watch' } = {
  secs: 3.2,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const yank = bump(u, 0.02, 0.22);
    const up = ease(u, 0.2, 0.3) - ease(u, 0.85, 0.97);
    const wave = Math.sin(u * TAU * 4);
    const both = { sh: ON_LEVER.sh, el: ON_LEVER.el };
    const lever: [{ sh: number; el: number }, { sh: number; el: number }] = [both, { sh: 0.1, el: 1.2 + 0.2 * yank }];
    return {
      ...rest(),
      bob: -0.35 * yank + up * (0.3 + 0.25 * Math.abs(wave)),
      lean: 0.15 + 0.1 * yank - 0.3 * up,
      tilt: 0.1 * yank - 0.35 * up,
      // flung up and out past his great head: the near one up behind it,
      // the far one up before his face
      arms: [
        { sh: lever[0].sh * (1 - up) + (3.65 + 0.2 * wave) * up, el: lever[0].el * (1 - up) - 0.2 * up },
        { sh: lever[1].sh * (1 - up) + (2.0 - 0.2 * wave) * up, el: lever[1].el * (1 - up) - 0.15 * up },
      ],
      eyes: up > 0.5 ? 'happy' : yank > 0.5 ? 'shut' : 'open',
      mouth: up > 0.5 ? (wave > 0 ? 'open' : 'o') : 'smile',
    };
  },
};

const assistant: Npc = {
  name: 'assistant',
  station: 'run',
  // on the floor at the console's end, turned to the lever
  place: { mode: 'standing', u: ASSISTANT.u, v: ASSISTANT.v, look: 'along' },
  tall: 12,
  bones: ASSISTANT_BONES,
  parts: assistantParts,
  work: assistantWork,
  show: assistantShow,
};

// ── the professor ────────────────────────────────────────────────────────
// An old professor with a wild white halo of hair round a bald crown, a
// great white moustache, round wire spectacles, a tweed jacket with elbow
// patches over a white shirt and a red bow tie. He stands on the floor
// before the near end of the chalkboard, turned along it, tapping a line
// of working with a short pointer, then pushing his spectacles up his
// nose; he celebrates with a finger up: eureka.

const PF = {
  skin: '#efc9a4',
  skinD: '#c99f7a',
  hair: '#f2f1ec',
  hairD: '#c9ccc8',
  tweed: '#7d6a48',
  tweedD: '#5c4d33',
  patch: '#5a4630',
  shirt: '#f6f2e6',
  tie: C.red,
  trousers: '#6a6c72',
  trousersD: '#505257',
  shoe: '#5a3a24',
};

const PROFESSOR_BONES: Bones = { neck: [0.2, -7.8], shoulders: [[-1.5, -7.3], [1.8, -7.3]], upper: 1.65, fore: 1.6 };

const professorParts: NpcParts = {
  body(sk, _p, back) {
    for (const [x, near] of [[0.8, false], [-0.75, true]] as const) {
      sk.limb([x, -3.6, x + 0.05, -0.8], 1.15, near ? PF.trousers : PF.trousersD, { dark: near ? PF.trousersD : null });
      sk.blob((q) => q.roundRect(x - 0.5, -0.95, 1.55, 0.95, 0.42), PF.shoe, { dark: shade(PF.shoe, -0.2), d: 0.2 });
    }
    // the jacket, cut away at the front over the shirt
    sk.blob((q) => {
      q.moveTo(-1.95, -7.55);
      q.quadraticCurveTo(0.2, -8.15, 2.15, -7.55);
      q.lineTo(2.35, -2.9);
      q.quadraticCurveTo(0.2, -2.5, -2.05, -2.9);
      q.closePath();
    }, PF.tweed, { dark: PF.tweedD, d: 0.5 });
    if (back) return;
    sk.blob(poly([0.15, -7.6, 1.45, -7.6, 1.15, -4.6, 0.65, -4.2]), PF.shirt, { line: 0.5 });
    // lapels, the bow tie, a pocket with a pen in it
    sk.blob(poly([0.0, -7.55, 0.65, -6.0, 0.55, -4.3, -0.1, -6.2]), shade(PF.tweed, 0.08), { line: 0.5 });
    sk.blob(poly([1.6, -7.55, 1.25, -6.0, 1.15, -4.6, 1.8, -6.2]), shade(PF.tweed, -0.06), { line: 0.5 });
    sk.blob(poly([0.25, -7.65, 0.85, -7.3, 1.45, -7.65, 1.45, -6.95, 0.85, -7.25, 0.25, -6.95]), PF.tie, { line: 0.6 });
    sk.limb([-1.4, -5.0, -0.2, -5.0], 0.18, PF.tweedD, { line: 0 });
    sk.limb([-1.0, -5.1, -0.95, -5.8], 0.16, C.hazard, { line: 0.4 });
    // tweed flecks
    sk.draw((q) => {
      q.fillStyle = PF.tweedD;
      for (let i = 0; i < 9; i++) {
        q.beginPath();
        q.arc(-1.6 + ((i * 1.37) % 3.6), -7 + ((i * 2.3) % 3.8), 0.08, 0, TAU);
        q.fill();
      }
    });
  },
  head(sk, p, back) {
    const cx = 0.25;
    const cy = -3.1;
    // the wild white hair: a cloud round the back and sides
    sk.blob((q) => {
      q.moveTo(cx - 1.0, cy - 2.6);
      q.quadraticCurveTo(cx - 3.0, cy - 4.4, cx - 3.6, cy - 2.2);
      q.quadraticCurveTo(cx - 5.0, cy - 1.4, cx - 4.0, cy + 0.3);
      q.quadraticCurveTo(cx - 4.7, cy + 1.8, cx - 2.6, cy + 2.3);
      q.lineTo(cx + 2.4, cy - 0.6);
      q.quadraticCurveTo(cx + 3.9, cy - 0.7, cx + 3.5, cy - 1.8);
      q.quadraticCurveTo(cx + 4.3, cy - 3.0, cx + 2.8, cy - 3.2);
      q.quadraticCurveTo(cx + 2.2, cy - 4.5, cx + 1.0, cy - 2.6);
      q.closePath();
    }, PF.hair, { dark: PF.hairD, d: 0.45 });
    sk.blob(ell(cx, cy, 3.0, 2.95), PF.skin, { dark: PF.skinD, d: 0.45 });
    if (back) return;
    sk.blob(ell(cx - 0.9, cy - 2.0, 0.9, 0.4), '#fbe3c8', { line: 0, sil: false });
    face(sk, { x: cx + 0.75, y: cy + 0.35, eyes: p.eyes, mouth: p.mouth, gap: 2.2, r: 0.44, drop: 1.85 });
    // round wire spectacles
    sk.draw((q, c) => {
      q.strokeStyle = '#7f8e96';
      q.lineWidth = Math.max(0.14, 0.9 / c.px);
      q.beginPath();
      for (const [x, r] of [[cx - 0.35, 0.82], [cx + 1.85, 0.74]] as const) {
        q.moveTo(x + r, cy + 0.35);
        q.arc(x, cy + 0.35, r, 0, TAU);
      }
      q.moveTo(cx + 0.47, cy + 0.25);
      q.lineTo(cx + 1.11, cy + 0.25);
      q.stroke();
    });
    // white brows and the great moustache over the mouth
    for (const [x, w] of [[cx - 0.35, 1.2], [cx + 1.85, 1.05]] as const) sk.limb([x - w / 2, cy - 0.85, x + w / 2, cy - 1.0], 0.36, PF.hair, { line: 0.5 });
    sk.blob((q) => {
      q.moveTo(cx - 0.9, cy + 1.95);
      q.quadraticCurveTo(cx + 0.85, cy + 0.85, cx + 2.6, cy + 1.95);
      q.quadraticCurveTo(cx + 2.2, cy + 2.35, cx + 0.85, cy + 1.75);
      q.quadraticCurveTo(cx - 0.5, cy + 2.35, cx - 0.9, cy + 1.95);
      q.closePath();
    }, PF.hair, { dark: PF.hairD, d: 0.15, line: 0.6 });
  },
  upper(sk, _p, k) {
    const b = PROFESSOR_BONES.upper;
    sk.limb([0, 0, 0, b], 1.15, k ? PF.tweedD : PF.tweed, { dark: k ? null : PF.tweedD });
  },
  fore(sk, p, k) {
    const f = PROFESSOR_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 1.05, k ? PF.tweedD : PF.tweed, { dark: k ? null : PF.tweedD });
    sk.blob(ell(0, 0.35, 0.42, 0.5), PF.patch, { line: 0.4, sil: false });
    sk.limb([0, f - 0.45, 0, f - 0.3], 1.1, PF.shirt, { line: 0.5 });
    if (k === 1 && p.act === 'work') {
      // a short pointer, its tip to the board
      level(sk, p, 1, f, () => {
        sk.limb([-0.25, 0.2, 1.35, -1.05], 0.2, C.wood, { dark: C.woodDark });
        sk.limb([1.15, -0.89, 1.4, -1.09], 0.22, C.iron, { line: 0.4 });
      });
    }
    sk.blob(circ(0, f, 0.55), k ? PF.skinD : PF.skin, { dark: PF.skinD, d: 0.2 });
    if (k === 1 && p.act === 'celebrate' && p.arms[1].sh > 1.5) {
      // the finger up: eureka
      level(sk, p, 1, f, () => sk.limb([0.1, -0.35, 0.15, -1.25], 0.3, PF.skin, { line: 0.5 }));
    }
  },
};

// The far hand up toward the board with the pointer, as solved for its
// place; the near one up to the spectacles.
const AT_BOARD = { sh: 1.7, el: 1.41 };
const AT_GLASSES = { sh: 1.89, el: 1.16 };

// Two taps on the board, a nod at the working, then the spectacles pushed
// back up his nose.
const professorWork: NpcLoop = {
  secs: 2.8,
  frames: 12,
  pose(u) {
    const tap = u < 0.55 ? Math.abs(Math.sin(u * TAU * (2 / 0.55) * 0.5)) : 0;
    const specs = bump(u, 0.62, 0.95);
    const away = ease(u, 0.55, 0.65) - ease(u, 0.92, 1);
    return {
      ...rest(),
      lean: 0.08 - 0.04 * specs,
      tilt: -0.05 + 0.1 * tap - 0.08 * specs,
      arms: [
        { sh: 0.15 + (AT_GLASSES.sh - 0.15) * specs, el: 0.25 + (AT_GLASSES.el - 0.25) * specs },
        { sh: AT_BOARD.sh - 0.4 * away, el: AT_BOARD.el + 0.3 * tap + 0.4 * away },
      ],
      eyes: specs > 0.6 ? 'blink' : 'open',
      mouth: tap > 0.6 ? 'o' : 'closed',
    };
  },
};

// A finger up and a little hop: eureka.
const professorCelebrate: NpcLoop = {
  secs: 1.6,
  frames: 8,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    return { ...rest(), bob: 0.4 * bump(u, 0.25, 0.6), lean: -0.04 * k, tilt: -0.15 * k, arms: [{ sh: 0.12 + 0.3 * k, el: 0.2 + 1.2 * k }, { sh: 0.12 + 2.6 * k, el: 0.2 + 0.2 * k }], eyes: k > 0.5 ? 'happy' : 'open', mouth: k > 0.3 ? 'open' : 'o' };
  },
};

const professor: Npc = {
  name: 'professor',
  station: 'think',
  // on the floor before the board's near end, turned along it
  place: { mode: 'standing', u: 0.5, v: 8.5, look: 'along' },
  tall: 15,
  bones: PROFESSOR_BONES,
  parts: professorParts,
  work: professorWork,
  celebrate: professorCelebrate,
};

// ── the chemist ──────────────────────────────────────────────────────────
// Behind her bench: a chemist with her dark hair up in a bun, round
// goggles pushed up on her forehead, a yellow rubber apron over a plum
// shirt, black rubber gloves to the elbow. Her near hand rests on the
// bench; in the far one she swirls a flask of glowing green, holds it up
// to the light, and it gives a little puff.

const CH = {
  skin: '#c4875c',
  skinD: '#9a6440',
  hair: '#2a1e22',
  hairD: '#1a1214',
  shirt: '#6a4a86',
  shirtD: '#4e3466',
  apron: C.hazard,
  apronD: '#c9971a',
  glove: C.rubber,
  gloveD: '#262c2f',
  legs: '#3a4449',
  legsD: '#2a3236',
  strap: C.teal,
};

const CHEMIST_BONES: Bones = { neck: [0.15, -7.85], shoulders: [[-1.45, -7.3], [1.75, -7.3]], upper: 1.65, fore: 1.6 };

// The flask in her far hand, upright on her palm: a conical flask of
// glowing green, bubbling, with a puff off its mouth while `puff` is on.
function flask(sk: Sketch, u: number, puff: number): void {
  sk.blob(poly([-0.22, -2.3, 0.22, -2.3, 0.22, -1.6, 0.85, -0.25, 0.85, 0.1, -0.85, 0.1, -0.85, -0.25, -0.22, -1.6]), '#e3f6f8', { line: 0.6 });
  sk.blob(poly([-0.62, -0.75, 0.62, -0.75, 0.82, -0.25, 0.82, 0.05, -0.82, 0.05, -0.82, -0.25]), C.green, { dark: shade(C.green, -0.2), d: 0.15, line: 0 , sil: false });
  sk.limb([-0.5, -0.5, -0.25, -1.4], 0.1, '#ffffff', { line: 0, sil: false });
  fizz(sk, 0.05, -0.6, u * 3, '#f2ffe0');
  if (puff > 0) {
    const r = 0.5 + 0.6 * puff;
    sk.blob((q) => {
      q.arc(0, -2.7 - r, r, 0, TAU);
      q.moveTo(0.55 * r + 0.45 * r, -2.4 - r * 0.6);
      q.arc(0.55 * r, -2.4 - r * 0.6, 0.45 * r, 0, TAU);
      q.moveTo(-0.55 * r + 0.42 * r, -2.5 - r * 0.7);
      q.arc(-0.55 * r, -2.5 - r * 0.7, 0.42 * r, 0, TAU);
    }, '#c6f2a8', { dark: '#9edc84', d: 0.15, line: 0.5 });
  }
}

const chemistParts: NpcParts = {
  body(sk, _p, back) {
    for (const [x, near] of [[0.75, false], [-0.7, true]] as const) {
      sk.limb([x, -3.6, x + 0.05, -0.8], 1.15, near ? CH.legs : CH.legsD, { dark: near ? CH.legsD : null });
      sk.blob((q) => q.roundRect(x - 0.5, -0.95, 1.5, 0.95, 0.42), '#2a2a30', { dark: '#1e1e22', d: 0.2 });
    }
    sk.blob((q) => {
      q.moveTo(-1.8, -7.55);
      q.quadraticCurveTo(0.15, -8.1, 2.0, -7.55);
      q.lineTo(2.1, -3.3);
      q.quadraticCurveTo(0.15, -2.9, -1.9, -3.3);
      q.closePath();
    }, CH.shirt, { dark: CH.shirtD, d: 0.45 });
    if (back) {
      sk.limb([-1.7, -5.0, 2.0, -5.0], 0.3, CH.apronD, { line: 0.5 });
      return;
    }
    // the rubber apron: a bib on a strap round the neck, down past the knees
    sk.limb([-0.35, -6.9, 0.3, -8.0, 1.2, -7.9, 1.55, -6.9], 0.25, CH.apronD, { line: 0.5 });
    sk.blob((q) => {
      q.moveTo(-0.55, -7.0);
      q.lineTo(1.75, -7.0);
      q.lineTo(1.85, -5.4);
      q.quadraticCurveTo(2.45, -5.2, 2.4, -3.0);
      q.lineTo(2.4, -1.4);
      q.quadraticCurveTo(0.4, -1.0, -1.7, -1.4);
      q.lineTo(-1.75, -3.0);
      q.quadraticCurveTo(-1.85, -5.2, -1.0, -5.4);
      q.closePath();
    }, CH.apron, { dark: CH.apronD, d: 0.4 });
    // a pocket and a pencil in it
    sk.limb([0.2, -6.4, 0.25, -7.15], 0.15, '#3a4449', { line: 0.4 });
    sk.blob((q) => q.roundRect(-0.25, -6.5, 1.3, 0.9, 0.2), shade(CH.apron, -0.07), { line: 0.5 });
  },
  head(sk, p, back) {
    const cx = 0.25;
    const cy = -3.1;
    // the bun on top, then the head, hair swept up off the face
    sk.blob(ell(cx - 0.9, cy - 3.3, 1.55, 1.3), CH.hair, { dark: CH.hairD, d: 0.3 });
    sk.blob(ell(cx, cy, 3.05, 3.0), CH.skin, { dark: CH.skinD, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(cx - 3.05, cy + 0.5);
      q.quadraticCurveTo(cx - 3.3, cy - 3.0, cx - 0.2, cy - 3.1);
      q.quadraticCurveTo(cx + 2.6, cy - 3.1, cx + 3.05, cy - 0.9);
      q.quadraticCurveTo(cx + 1.0, cy - 1.95, cx - 1.6, cy - 1.0);
      q.quadraticCurveTo(cx - 2.2, cy - 0.3, cx - 2.3, cy + 1.3);
      q.closePath();
    }, CH.hair, { dark: CH.hairD, d: 0.3 });
    // a pencil through the bun
    sk.limb([cx - 2.6, cy - 2.6, cx + 0.6, cy - 4.4], 0.18, C.hazard, { line: 0.4 });
    if (!back) {
      face(sk, { x: cx + 0.8, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, gap: 2.2, r: 0.5, drop: 1.5 });
      sk.blob(ell(cx + 2.35, cy + 1.25, 0.45, 0.25), '#d97a6a', { line: 0, sil: false });
    }
    // the goggles pushed up on her forehead: a strap round, two big lenses
    sk.limb([cx - 3.0, cy - 1.0, cx - 1.0, cy - 2.1, cx + 1.0, cy - 2.4, cx + 3.0, cy - 1.7], 0.5, CH.strap, { line: 0.5 });
    if (!back) {
      for (const [x, r] of [[cx - 0.05, 0.85], [cx + 1.85, 0.75]] as const) {
        sk.blob(circ(x, cy - 2.25, r), '#2a3236', { line: 0.6 });
        sk.blob(circ(x, cy - 2.25, r * 0.68), '#bfe8f0', { line: 0, sil: false });
        sk.limb([x - r * 0.35, cy - 2.45, x - r * 0.05, cy - 2.75], 0.12, '#ffffff', { line: 0, sil: false });
      }
    }
  },
  upper(sk, _p, k) {
    const b = CHEMIST_BONES.upper;
    sk.limb([0, 0, 0, b], 1.1, k ? CH.shirtD : CH.shirt, { dark: k ? null : CH.shirtD });
  },
  fore(sk, p, k) {
    const f = CHEMIST_BONES.fore;
    // long black rubber gloves to the elbow
    sk.limb([0, 0.05, 0, f - 0.3], 1.0, k ? CH.gloveD : CH.glove, { dark: k ? null : CH.gloveD });
    sk.limb([0, 0.05, 0, 0.35], 1.25, k ? CH.gloveD : CH.glove, { line: 0.5 });
    if (k === 1 && p.act === 'work') {
      // swirled: rocked a little on her palm
      const rock = 0.18 * Math.sin(p.u * TAU * 4) * (1 - ease(p.u, 0.38, 0.5));
      level(sk, p, 1, f, () => sk.at(mul(turn(rock), zoom(1.3)), () => flask(sk, p.u, bump(p.u, 0.7, 0.9))));
    }
    sk.blob(circ(0, f, 0.58), k ? CH.gloveD : CH.glove, { dark: CH.gloveD, d: 0.2 });
  },
};

// A fizzing beaker (not a drink): magenta, bubbles up out of it.
const fizzBeaker: NpcServe = {
  name: 'fizz',
  drink: false,
  draw(sk) {
    sk.blob(poly([-0.75, -1.4, 0.75, -1.4, 0.7, 0.6, -0.7, 0.6]), '#e3f6f8', { line: 0.6 });
    sk.blob(poly([-0.68, -0.6, 0.68, -0.6, 0.65, 0.55, -0.65, 0.55]), C.magenta, { dark: shade(C.magenta, -0.2), d: 0.15, line: 0, sil: false });
    sk.limb([-0.85, -1.4, 0.85, -1.4], 0.14, '#e3f6f8', { line: 0.5 });
    fizz(sk, 0.0, -1.5, 0.3, '#f6c9f0', 0.9);
  },
};

// The flask swirled before her, held up to the light by her face, a look,
// a puff off it (a blink, a start), and down to swirl again.
const chemistWork: NpcLoop = {
  secs: 3,
  frames: 12,
  pose(u) {
    const up = ease(u, 0.38, 0.55) - ease(u, 0.88, 1);
    const swirl = 1 - up;
    const s = Math.sin(u * TAU * 4);
    const c = Math.cos(u * TAU * 4);
    const puff = bump(u, 0.7, 0.9);
    return {
      ...rest(),
      bob: -0.1 * puff,
      lean: 0.04 - 0.1 * puff,
      tilt: 0.1 * swirl - 0.16 * up + 0.08 * puff,
      arms: [
        { sh: 0.8, el: 0.6 },
        { sh: 1.46 + 0.07 * s * swirl + 0.74 * up, el: 1.25 + 0.12 * c * swirl - 0.95 * up },
      ],
      eyes: puff > 0.5 ? 'shut' : 'open',
      mouth: puff > 0.5 ? 'o' : up > 0.5 ? 'smile' : 'closed',
    };
  },
};

const chemist: Npc = {
  name: 'chemist',
  station: 'write',
  // behind the bench, its top hiding her legs
  place: { mode: 'behind', u: CHEMIST.u, v: CHEMIST.v, top: CHEMIST.top, edge: CHEMIST.edge },
  // her flask held up to the light reaches over her bun
  tall: 15.5,
  bones: CHEMIST_BONES,
  parts: chemistParts,
  work: chemistWork,
  serve: fizzBeaker,
};

export const NPCS: readonly Npc[] = [assistant, professor, chemist];
