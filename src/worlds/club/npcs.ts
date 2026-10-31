import { shade } from '../../art/iso.ts';
import { env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts } from '../types.ts';
import { BEAT, C } from './kit.ts';
import { DJ } from './stations.ts';

// The club's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the club's ink: the DJ behind the decks (the booth
// leaves room behind its counter: see DJ in ./stations.ts).

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

const SKIN = '#c98a5e';
const SKIN_D = '#a06a45';
const TEE = '#2b2633';
const TEE_D = '#1d1924';
const HAIR = C.pink;
const HAIR_D = '#c42a86';
const CANS = '#37313f';
const CANS_D = '#221e28';
const JEANS = '#3a3f66';
const JEANS_D = '#2b2f4e';
const KICKS = '#f1e7f4';

// ── the DJ ───────────────────────────────────────────────────────────────
// Behind the decks: a pink swoop of hair, headphones on, a black tee with a
// neon ring and bolt on it (no words), a glowing band on each wrist. At
// work it scratches the near record and rides a fader, nodding on the
// beat; its show is the drop, a fist pumping over its head; it celebrates
// with both hands up, pumping.

const DJ_BONES: Bones = { neck: [0.15, -7.9], shoulders: [[-1.65, -7.35], [1.8, -7.35]], upper: 1.7, fore: 1.6 };

const djParts: NpcParts = {
  body(sk, _p, back) {
    // legs in jeans and white sneakers (the booth hides them), the far one
    // first
    for (const [x, near] of [[1.0, false], [-0.85, true]] as const) {
      sk.limb([x, -3.5, x + 0.1, -0.8], 1.25, near ? JEANS : JEANS_D, { dark: near ? JEANS_D : null });
      sk.blob((q) => q.roundRect(x - 0.55, -1.0, 1.55, 1.0, 0.45), KICKS, { dark: shade(KICKS, -0.18), d: 0.2 });
    }
    // the tee
    sk.blob((q) => {
      q.moveTo(-2.0, -7.7);
      q.quadraticCurveTo(0.1, -8.25, 2.2, -7.7);
      q.lineTo(2.35, -3.3);
      q.quadraticCurveTo(0.15, -2.8, -2.1, -3.3);
      q.closePath();
    }, TEE, { dark: TEE_D, d: 0.5 });
    if (back) return;
    // its print: a pink ring with a cyan bolt through it
    sk.draw((q, c) => {
      q.lineWidth = Math.max(0.32, 1 / c.px);
      q.lineCap = 'round';
      q.lineJoin = 'round';
      q.strokeStyle = C.pink;
      q.beginPath();
      q.arc(0.35, -5.6, 0.95, 0, TAU);
      q.stroke();
      q.strokeStyle = C.cyan;
      q.beginPath();
      q.moveTo(0.7, -6.9);
      q.lineTo(-0.05, -5.5);
      q.lineTo(0.75, -5.6);
      q.lineTo(0.0, -4.3);
      q.stroke();
    });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the far cup of the headphones, behind the head
    sk.blob(ell(cx + (back ? -2.9 : 2.9), cy + 0.5, 0.8, 1.1), CANS, { dark: CANS_D, d: 0.2 });
    sk.blob(ell(cx, cy, 3.4, 3.2), SKIN, { dark: SKIN_D, d: 0.45 });
    // the hair: shaved short at the sides, a pink swoop over the top
    sk.blob((q) => {
      q.moveTo(cx - 3.3, cy - 0.4);
      q.quadraticCurveTo(cx - 3.0, cy - 3.6, cx + 0.2, cy - 3.75);
      q.quadraticCurveTo(cx + 3.4, cy - 3.8, cx + 3.9, cy - 1.4);
      q.quadraticCurveTo(cx + 2.2, cy - 2.4, cx + 0.4, cy - 2.0);
      q.quadraticCurveTo(cx - 1.6, cy - 1.7, cx - 3.3, cy - 0.4);
      q.closePath();
    }, HAIR, { dark: HAIR_D, d: 0.35 });
    // the band over the top, into the hair on the far side; the near cup
    // on its ear, a cyan ring on it
    sk.limb([cx - 2.9, cy + 0.2, cx - 2.7, cy - 2.4, cx - 0.6, cy - 3.75, cx + 1.6, cy - 3.5, cx + 2.6, cy - 2.5], 0.42, CANS, { dark: CANS_D });
    sk.blob(ell(cx + (back ? 2.9 : -2.9), cy + 0.5, 0.95, 1.25), CANS, { dark: CANS_D, d: 0.25 });
    sk.blob(ell(cx + (back ? 3.05 : -3.05), cy + 0.5, 0.42, 0.6), C.cyan, { line: 0.5, sil: false });
    if (!back) face(sk, { x: cx + 0.55, y: cy + 0.8, eyes: p.eyes, mouth: p.mouth });
  },
  upper(sk, _p, k) {
    // short black sleeves
    sk.limb([0, 0, 0, DJ_BONES.upper], 1.2, k ? TEE_D : TEE, { dark: k ? null : TEE_D });
  },
  fore(sk, _p, k) {
    const f = DJ_BONES.fore;
    sk.limb([0, 0, 0, f - 0.25], 0.95, k ? SKIN_D : SKIN, { dark: k ? null : SKIN_D });
    sk.blob((q) => q.roundRect(-0.6, f - 1.0, 1.2, 0.4, 0.18), C.cyan, { line: 0.5 });
    sk.blob(circ(0, f, 0.62), k ? SKIN_D : SKIN, { dark: SKIN_D, d: 0.2 });
  },
};

// At the decks: the near hand scratching the record back and forth, the
// far one riding a fader, the head nodding on the beat (two a loop).
const djWork: NpcLoop = {
  secs: 2 * BEAT,
  frames: 8,
  pose(u) {
    const beat = Math.abs(Math.sin(u * TAU));
    const scratch = Math.sin(u * TAU * 2);
    return { ...rest(), bob: 0.1 * beat, lean: 0.05, tilt: 0.04 + 0.14 * beat, arms: [{ sh: 1.0 + 0.2 * scratch, el: 0.55 - 0.2 * scratch }, { sh: 0.85, el: 0.7 + 0.15 * Math.sin(u * TAU) }], eyes: beat > 0.85 ? 'happy' : 'open' };
  },
};

// The drop: the far hand still on the mixer, the near fist pumping over its
// head, bouncing on every beat, mouth open, eyes squeezed happy.
const djShow: NpcLoop & { crowd: 'dance' } = {
  secs: 4 * BEAT,
  frames: 16,
  crowd: 'dance',
  pose(u) {
    const pump = Math.abs(Math.sin(u * TAU * 2));
    return { ...rest(), bob: 0.4 * pump, lean: -0.05, tilt: -0.08 + 0.2 * pump, arms: [{ sh: 2.55 + 0.3 * pump, el: 0.35 - 0.25 * pump }, { sh: 0.9, el: 0.7 }], eyes: pump > 0.5 ? 'happy' : 'open', mouth: pump > 0.4 ? 'open' : 'smile' };
  },
};

// Both hands up, pumping twice, and down again.
const djCelebrate: NpcLoop = {
  secs: 4 * BEAT,
  frames: 8,
  pose(u) {
    const k = env(u, 0.15, 0.85);
    const pump = Math.abs(Math.sin(u * TAU * 2));
    const up = { sh: 0.12 + (2.3 + 0.3 * pump) * k, el: 0.2 };
    return { ...rest(), bob: 0.3 * pump * k, tilt: -0.1 * k, arms: [up, up], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

const dj: Npc = {
  name: 'dj',
  station: 'write',
  // behind the decks, between the speakers; the booth's top hides its legs
  place: { mode: 'behind', u: 5.5, v: 1.3, top: DJ.z, edge: DJ.back },
  tall: 15,
  bones: DJ_BONES,
  parts: djParts,
  work: djWork,
  show: djShow,
  celebrate: djCelebrate,
};

export const NPCS: readonly Npc[] = [dj];
