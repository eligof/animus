import type { Sketch } from '../../art/figure/paint.ts';
import { move, mul, turn, zoom } from '../../art/figure/paint.ts';
import { shade } from '../../art/iso.ts';
import { through } from '../../art/motion.ts';
import { bump, ease, env, HANG, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, fromHand, reach, toward } from '../../art/npc/helpers.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe } from '../types.ts';
import { BEAT, C } from './kit.ts';
import { BAR, DJ, HATCH } from './stations.ts';

// The club's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the club's ink: the DJ behind the decks, the bartender
// behind the neon bar and the coat-check attendant in its hatch (each
// station leaves room behind its counter: see DJ, BAR and HATCH in
// ./stations.ts).

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

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
// beat; its show is the drop, a fist pumping beside its head; it
// celebrates with both hands up and out, pumping.

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
  pose(u) {
    const beat = Math.abs(Math.sin(u * TAU));
    const scratch = Math.sin(u * TAU * 2);
    return { ...rest(), bob: 0.1 * beat, lean: 0.05, tilt: 0.04 + 0.14 * beat, arms: [{ sh: 1.0 + 0.2 * scratch, el: 0.55 - 0.2 * scratch }, { sh: 0.85, el: 0.7 + 0.15 * Math.sin(u * TAU) }], eyes: beat > 0.85 ? 'happy' : 'open' };
  },
};

// The drop: the far hand still on the mixer, the near fist up and out
// beside its head (a local's arms are short and its head big: a fist up
// over it hides its face), pumping on every beat, the head nodding into
// it, mouth open, eyes squeezed happy.
const djShow: NpcLoop & { crowd: 'dance' } = {
  secs: 4 * BEAT,
  crowd: 'dance',
  pose(u) {
    const pump = Math.abs(Math.sin(u * TAU * 2));
    return { ...rest(), bob: 0.4 * pump, lean: -0.05, tilt: -0.08 + 0.2 * pump, arms: [{ sh: -1.8 - 0.15 * pump, el: -0.8 - 0.25 * pump }, { sh: 0.9, el: 0.7 }], eyes: pump > 0.5 ? 'happy' : 'open', mouth: pump > 0.4 ? 'open' : 'smile' };
  },
};

// Both hands up and out beside its head, pumping twice, and down again:
// the near one swung up behind, the far one up in front (as the shared
// cheer, see art/npc/acts.ts).
const djCelebrate: NpcLoop = {
  secs: 4 * BEAT,
  pose(u) {
    const k = env(u, 0.25, 0.75);
    const pump = Math.abs(Math.sin(u * TAU * 2)) * k;
    const near = { sh: HANG.sh - 1.95 * k - 0.15 * pump, el: HANG.el - 1.1 * k - 0.2 * pump };
    const far = { sh: HANG.sh + 1.65 * k + 0.15 * pump, el: HANG.el + 0.7 * k + 0.15 * pump };
    return { ...rest(), bob: 0.3 * pump, tilt: -0.1 * k, arms: [near, far], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
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

// ── the bartender ────────────────────────────────────────────────────────
// Behind the neon bar: a slick black pompadour with a violet sheen, a
// curled moustache, a white shirt with its sleeves rolled, a plum
// waistcoat with chrome buttons and a pink bow tie; long arms, the better
// to work round its big head. At work it shakes a cocktail hard in one
// hand out by its head, the other on the bar, then tips it over the glass
// on the bar in a pink pour; it celebrates by flipping the shaker over its
// head and catching it. It serves the cocktail.

const BT_BONES: Bones = { neck: [0.15, -8.6], shoulders: [[-1.6, -8.0], [1.75, -8.0]], upper: 2.0, fore: 1.85 };
const BT_SKIN = '#8a5636';
const BT_SKIN_D = '#683e26';
const SHIRT = '#f6f0f8';
const SHIRT_D = '#cbbfd6';
const VEST = C.plum;
const VEST_D = '#42204f';
const SLACKS = '#2b2633';
const SLACKS_D = '#1d1924';
const POMP = '#241d29';
const POMP_D = '#140f18';

// A cocktail: a coupe on a stem, pink, a lime on its rim (the stem in the
// hand, the bowl over it).
const cocktail: NpcServe = {
  name: 'cocktail',
  drink: true,
  draw(sk) {
    sk.limb([0, -0.1, 0, 0.9], 0.18, '#d3d2e2');
    sk.blob((p) => {
      p.moveTo(-0.75, -0.75);
      p.lineTo(0.75, -0.75);
      p.quadraticCurveTo(0.6, -0.05, 0, -0.05);
      p.quadraticCurveTo(-0.6, -0.05, -0.75, -0.75);
      p.closePath();
    }, C.pink, { dark: shade(C.pink, -0.25), d: 0.2 });
    sk.blob((p) => p.arc(0.65, -0.8, 0.25, 0, TAU), C.lime, { line: 0.5 });
  },
};

// A cobbler shaker, big as a cartoon's, gripped round its tin at the
// origin, its cap up -y (its strainer's mouth MOUTH up): a tin, the
// strainer, the little cap; a glint down its lit side.
const MOUTH = 1.55;
function shaker(sk: Sketch): void {
  sk.push(mul(zoom(1.3), move(0, 0.77)));
  sk.blob((q) => {
    q.moveTo(-0.36, 0);
    q.lineTo(0.36, 0);
    q.lineTo(0.47, -1.3);
    q.lineTo(-0.47, -1.3);
    q.closePath();
  }, C.chrome, { dark: C.steel, d: 0.2 });
  sk.blob((q) => {
    q.moveTo(-0.47, -1.36);
    q.lineTo(0.47, -1.36);
    q.lineTo(0.22, -1.95);
    q.lineTo(-0.22, -1.95);
    q.closePath();
  }, C.chrome, { dark: C.steel, d: 0.15 });
  sk.blob((q) => q.roundRect(-0.24, -2.32, 0.48, 0.4, 0.14), '#b8b8c8', { dark: C.steelDark, d: 0.1 });
  sk.draw((q, c) => {
    q.strokeStyle = '#ffffff';
    q.lineWidth = Math.max(0.16, 1 / c.px);
    q.lineCap = 'round';
    q.beginPath();
    q.moveTo(-0.18, -0.2);
    q.lineTo(-0.25, -1.15);
    q.stroke();
  });
  sk.pop();
}

// The work loop's beats (see bartenderWork): the shake, evenly round the
// loop in twelfths (see through: hard back and forth from 2/12 to 6/12,
// still for the pour), and how far into the pour (0 shaking, 1 tipped
// over the glass).
const BT_SHAKE = [0, 0, 1, -1, 1, -1, 1, 0, 0, 0, 0, 0] as const;
const shakeOf = (u: number) => through(BT_SHAKE, u);
const pourOf = (u: number) => ease(u, 0.55, 0.68) - ease(u, 0.82, 0.95);

// Where the bartender stands (v out from the back-bar), and the rim of the
// glass it pours into on the bar (BAR.glass), in its own frame: forward of
// it along the counter's back edge, where the counter's top shows higher
// up the screen than at its feet, so the glass and the pour stand above
// where the bartender is cut (see cutOf in world/npc-place.ts).
const BT_V = 3.0;
const RIM = { x: BAR.at - BT_V - (BAR.glass[0] - BAR.glass[1]), y: (BAR.glass[0] + BAR.glass[1] - BAR.at - BT_V) / 2 - BAR.z - 1.4 };
const TIP = 2.1;

const bartenderParts: NpcParts = {
  body(sk) {
    // legs in black trousers and shoes (the bar hides them), the far one
    // first
    for (const [x, near] of [[1.0, false], [-0.85, true]] as const) {
      sk.limb([x, -3.6, x + 0.1, -0.8], 1.2, near ? SLACKS : SLACKS_D, { dark: near ? SLACKS_D : null });
      sk.blob((q) => q.roundRect(x - 0.55, -1.0, 1.6, 0.95, 0.4), '#17131b', { dark: '#0d0a10', d: 0.15 });
    }
    // the shirt
    sk.blob((q) => {
      q.moveTo(-1.95, -8.4);
      q.quadraticCurveTo(0.1, -8.95, 2.15, -8.4);
      q.lineTo(2.35, -3.3);
      q.quadraticCurveTo(0.15, -2.8, -2.1, -3.3);
      q.closePath();
    }, SHIRT, { dark: SHIRT_D, d: 0.5 });
    // the waistcoat over it, open in a V to the bow tie, pointed at its hem
    sk.blob((q) => {
      q.moveTo(-1.95, -8.4);
      q.quadraticCurveTo(-1.0, -8.7, 0.0, -8.65);
      q.lineTo(0.7, -5.7);
      q.lineTo(1.35, -8.6);
      q.quadraticCurveTo(1.85, -8.55, 2.15, -8.4);
      q.lineTo(2.4, -3.4);
      q.lineTo(1.35, -2.75);
      q.lineTo(0.75, -3.25);
      q.lineTo(0.2, -2.8);
      q.quadraticCurveTo(-1.0, -3.0, -2.15, -3.3);
      q.closePath();
    }, VEST, { dark: VEST_D, d: 0.55 });
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = c.ink;
      q.lineWidth = Math.max(c.line, 1 / c.px);
      q.beginPath();
      q.moveTo(0.7, -5.7);
      q.lineTo(0.75, -3.25);
      q.stroke();
      q.fillStyle = C.chrome;
      for (const y of [-5.1, -4.25]) {
        q.beginPath();
        q.arc(0.92, y, 0.2, 0, TAU);
        q.fill();
        q.stroke();
      }
    });
    // the bow tie at the collar
    sk.blob((q) => {
      q.moveTo(0.68, -8.25);
      q.lineTo(-0.2, -8.75);
      q.lineTo(-0.15, -7.7);
      q.closePath();
      q.moveTo(0.68, -8.25);
      q.lineTo(1.6, -8.75);
      q.lineTo(1.55, -7.7);
      q.closePath();
    }, C.pink, { dark: shade(C.pink, -0.25), d: 0.15, line: 0.5 });
    sk.blob((q) => q.arc(0.68, -8.25, 0.3, 0, TAU), shade(C.pink, -0.15), { line: 0.5 });
  },
  head(sk, p) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob((q) => q.ellipse(cx, cy, 3.35, 3.2, 0, 0, TAU), BT_SKIN, { dark: BT_SKIN_D, d: 0.45 });
    // the pompadour: swept up off the forehead into a quiff and back over
    // the crown, short at the nape
    sk.blob((q) => {
      q.moveTo(cx - 1.0, cy + 0.6);
      q.lineTo(cx - 1.15, cy - 1.0);
      q.quadraticCurveTo(cx + 0.2, cy - 2.1, cx + 2.2, cy - 2.25);
      q.quadraticCurveTo(cx + 3.6, cy - 2.4, cx + 3.75, cy - 3.4);
      q.quadraticCurveTo(cx + 3.6, cy - 4.6, cx + 1.4, cy - 4.6);
      q.quadraticCurveTo(cx - 1.4, cy - 4.65, cx - 2.6, cy - 3.5);
      q.quadraticCurveTo(cx - 3.6, cy - 2.4, cx - 3.4, cy - 0.4);
      q.quadraticCurveTo(cx - 3.2, cy + 0.9, cx - 2.4, cy + 1.0);
      q.quadraticCurveTo(cx - 1.8, cy - 0.4, cx - 1.0, cy + 0.6);
      q.closePath();
    }, POMP, { dark: POMP_D, d: 0.35 });
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = C.violet;
      q.lineWidth = Math.max(0.28, 1 / c.px);
      q.beginPath();
      q.moveTo(cx - 1.9, cy - 3.45);
      q.quadraticCurveTo(cx - 0.2, cy - 4.25, cx + 2.2, cy - 4.05);
      q.stroke();
    });
    // the ear
    sk.blob((q) => q.ellipse(cx - 1.75, cy + 0.55, 0.55, 0.75, 0, 0, TAU), BT_SKIN, { dark: BT_SKIN_D, d: 0.2, line: 0.5 });
    face(sk, { x: cx + 0.75, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth, drop: 1.55 });
    // a curled moustache over the mouth
    sk.blob((q) => {
      const mx = cx + 0.8;
      const my = cy + 1.75;
      q.moveTo(mx, my - 0.15);
      q.quadraticCurveTo(mx - 0.75, my - 0.3, mx - 1.1, my + 0.05);
      q.quadraticCurveTo(mx - 1.45, my - 0.15, mx - 1.3, my - 0.5);
      q.quadraticCurveTo(mx - 1.15, my - 0.05, mx - 0.95, my + 0.25);
      q.quadraticCurveTo(mx - 0.45, my + 0.35, mx, my + 0.12);
      q.quadraticCurveTo(mx + 0.45, my + 0.35, mx + 0.95, my + 0.25);
      q.quadraticCurveTo(mx + 1.15, my - 0.05, mx + 1.3, my - 0.5);
      q.quadraticCurveTo(mx + 1.45, my - 0.15, mx + 1.1, my + 0.05);
      q.quadraticCurveTo(mx + 0.75, my - 0.3, mx, my - 0.15);
      q.closePath();
    }, POMP, { line: 0.4, sil: false });
  },
  upper(sk, _p, k) {
    // white sleeves
    sk.limb([0, 0, 0, BT_BONES.upper], 1.25, k ? SHIRT_D : SHIRT, { dark: k ? null : SHIRT_D });
  },
  fore(sk, p, k) {
    const f = BT_BONES.fore;
    // rolled to the elbow, the forearm bare
    sk.limb([0, 0.2, 0, f - 0.25], 0.95, k ? BT_SKIN_D : BT_SKIN, { dark: k ? null : BT_SKIN_D });
    sk.blob((q) => q.roundRect(-0.7, -0.2, 1.4, 0.65, 0.3), k ? SHIRT_D : SHIRT, { dark: k ? null : SHIRT_D, d: 0.15 });
    // what the hand holds, upright in the room, under its fingers: at work
    // the shaker in the far hand, shaken, then tipped over the glass on the
    // bar; in a flip, the shaker spinning up over its head
    atHand(sk, p, k, f, () => {
      if (p.act === 'work' && k === 1) {
        const pour = pourOf(p.u);
        const tip = mix(0.25 + 0.12 * shakeOf(p.u), TIP, pour);
        sk.at(turn(tip), () => shaker(sk));
        if (pour > 0.95) {
          // the pour, from the strainer down into the glass
          const [tx, ty] = fromHand(BT_BONES, p, 1, RIM.x, RIM.y);
          const [mx, my] = [Math.sin(tip) * MOUTH, -Math.cos(tip) * MOUTH];
          sk.limb([mx, my, mx + 0.1, (my + ty) / 2, tx, ty], 0.24, C.pink, { line: 0.4, sil: false });
        }
      }
      if (p.act === 'celebrate' && k === 1) {
        const fly = bump(p.u, 0.25, 0.75);
        const spin = ease(p.u, 0.25, 0.75) * TAU;
        sk.at(mul(move(0.3 * fly, -8 * fly), turn(spin)), () => shaker(sk));
      }
    });
    sk.blob((q) => q.arc(0, f, 0.62, 0, TAU), k ? BT_SKIN_D : BT_SKIN, { dark: BT_SKIN_D, d: 0.2 });
  },
};

// Behind the bar, its near hand on the counter: the shaker shaken hard in
// the far hand out by its head, then tipped over the glass on the bar, a
// pink pour, and back up.
const bartenderWork: NpcLoop = {
  secs: 1.8,
  pose(u) {
    const s = shakeOf(u);
    const k = pourOf(u);
    const pour = [RIM.x - Math.sin(TIP) * MOUTH, RIM.y - 0.8 + Math.cos(TIP) * MOUTH] as const;
    const near = reach(BT_BONES, 0, 1.5, -5.9 + 0.1 * s);
    const far = reach(BT_BONES, 1, mix(4.25 + 0.1 * s, pour[0], k), mix(-10.5 - 0.5 * s, pour[1], k));
    return {
      ...rest(),
      bob: 0.1 * Math.abs(s),
      lean: 0.03 * s + 0.06 * k,
      tilt: 0.04 * s + 0.18 * k,
      arms: [near, far],
      // squeezed happy a third of the way in, for a twelfth of the loop
      eyes: Math.abs(u - 1 / 3) < 1 / 24 ? 'happy' : 'open',
      mouth: k > 0.9 ? 'o' : 'smile',
    };
  },
};

// The flip: the far hand tosses the shaker up over its head, its eyes
// follow it round, and it catches it, grinning.
const bartenderCelebrate: NpcLoop = {
  secs: 1.5,
  pose(u) {
    const k = env(u, 0.2, 0.85);
    const fly = bump(u, 0.25, 0.75);
    return {
      ...rest(),
      bob: 0.4 * bump(u, 0.75, 0.98),
      tilt: -0.25 * fly,
      arms: [
        swing(0.8 * k, 0.7 * k),
        swing(2.1 * k, 0.4 * k),
      ],
      eyes: u > 0.78 && k > 0.3 ? 'happy' : 'open',
      mouth: fly > 0.4 ? 'o' : k > 0.3 ? 'open' : 'smile',
    };
  },
};

const bartender: Npc = {
  name: 'bartender',
  station: 'run',
  // behind the bar, between it and the back-bar's shelves of bottles
  place: { mode: 'behind', u: BAR.at, v: BT_V, top: BAR.z + 0.4, edge: BAR.v0 - 0.2 },
  tall: 16,
  bones: BT_BONES,
  parts: bartenderParts,
  work: bartenderWork,
  celebrate: bartenderCelebrate,
  serve: cocktail,
};

// ── the coat-check attendant ─────────────────────────────────────────────
// In the hatch, between the rail of coats and the counter: a lilac bob
// with a blunt fringe under a little velvet pillbox hat, a velvet jacket
// with a stand-up collar and a row of brass buttons, white gloves. At work
// it lifts a coat up over the counter on its hanger and hands it down,
// tears a ticket and taps the bell; it celebrates ringing the bell twice.
// It serves a coat ticket.

const CC_BONES: Bones = { neck: [0.15, -7.9], shoulders: [[-1.55, -7.3], [1.7, -7.3]], upper: 2.0, fore: 1.9 };
const CC_SKIN = '#f3cdb4';
const CC_SKIN_D = '#d9a78c';
const BOB = '#b98cff';
const BOB_D = '#8b5bd9';
const JACKET = C.velvet;
const JACKET_D = C.velvetDark;
const GLOVE = '#f7f2fa';
const GLOVE_D = '#cfc6dc';
const CC_V = 1.7;
const COAT = '#2f6e8a';

// The top of the bell on the counter (HATCH.bell) in the attendant's own
// frame: forward of it along the counter's back edge, within its reach.
const BELL = { x: HATCH.at - CC_V - (HATCH.bell[0] - HATCH.bell[1]), y: (HATCH.bell[0] + HATCH.bell[1] - HATCH.at - CC_V) / 2 - HATCH.top - 0.5 };

// A coat ticket: a cream stub with a punched hole and a pink band, its
// torn edge zigzag (no number).
function ticket(sk: Sketch): void {
  sk.blob((q) => {
    q.moveTo(-0.55, -0.3);
    q.lineTo(0.55, -0.3);
    for (let i = 0; i < 5; i++) q.lineTo(0.55 + (i % 2 ? 0 : 0.14), -0.3 + (i + 1) * 0.34);
    q.lineTo(-0.55, 1.4);
    q.closePath();
  }, '#f2e6c8', { dark: '#d6c6a0', d: 0.12, line: 0.5 });
  sk.blob((q) => q.rect(-0.55, 0.85, 1.1, 0.3), C.pink, { line: 0, sil: false });
  sk.draw((q, c) => {
    q.fillStyle = c.ink;
    q.beginPath();
    q.arc(0, 0.15, 0.16, 0, TAU);
    q.fill();
  });
}

const coatTicket: NpcServe = { name: 'ticket', drink: false, draw: (sk) => sk.at(move(0, 0.1), () => ticket(sk)) };

// A coat on its hanger, hanging from the hook at the origin, swung `sway`:
// teal wool, its lapels, a sleeve at each side, two buttons.
function coatOnHanger(sk: Sketch, sway: number): void {
  sk.at(turn(sway), () => {
    sk.limb([0, 0.1, 0, -0.35, 0.35, -0.5], 0.14, C.steel, { line: 0.4 });
    sk.limb([-1.15, 0.85, 0, 0.25, 1.15, 0.85], 0.16, C.steel, { line: 0.4 });
    sk.blob((q) => {
      q.moveTo(-1.25, 0.8);
      q.quadraticCurveTo(0, 0.35, 1.25, 0.8);
      q.lineTo(1.5, 5.4);
      q.quadraticCurveTo(0, 5.7, -1.5, 5.4);
      q.closePath();
    }, COAT, { dark: shade(COAT, -0.25), d: 0.35 });
    for (const x of [-1.3, 1.3]) sk.limb([x, 1.0, x * 1.12, 4.3], 0.7, shade(COAT, x < 0 ? 0.08 : -0.12), { line: 0.5 });
    sk.blob((q) => {
      q.moveTo(-0.5, 0.55);
      q.lineTo(0, 2.6);
      q.lineTo(0.5, 0.55);
      q.lineTo(0.15, 0.5);
      q.lineTo(0, 1.6);
      q.lineTo(-0.15, 0.5);
      q.closePath();
    }, shade(COAT, 0.2), { line: 0.4, sil: false });
    sk.draw((q, c) => {
      q.fillStyle = C.brass;
      q.strokeStyle = c.ink;
      q.lineWidth = Math.max(c.line * 0.7, 1 / c.px);
      for (const y of [3.1, 4.1]) {
        q.beginPath();
        q.arc(0.05, y, 0.17, 0, TAU);
        q.fill();
        q.stroke();
      }
    });
  });
}

// The work loop's beats (see coatCheckWork): the coat lifted up on its
// hanger and handed down over the counter (0 out of sight, 1 held high);
// the ticket torn; the bell tapped.
// Each hands over to the next across a tenth of the loop or more.
const liftOf = (u: number) => ease(u, 0.0, 0.2) - ease(u, 0.3, 0.5);
const tearOf = (u: number) => ease(u, 0.42, 0.6) - ease(u, 0.66, 0.84);
const tapOf = (u: number) => ease(u, 0.68, 0.8) - ease(u, 0.84, 1);

const coatCheckParts: NpcParts = {
  body(sk) {
    // legs in black (the counter hides them), the far one first
    for (const [x, near] of [[0.95, false], [-0.8, true]] as const) {
      sk.limb([x, -3.4, x + 0.05, -0.8], 1.15, near ? '#2b2633' : '#1d1924', { dark: near ? '#1d1924' : null });
      sk.blob((q) => q.roundRect(x - 0.5, -1.0, 1.5, 0.95, 0.4), '#17131b', { dark: '#0d0a10', d: 0.15 });
    }
    // the velvet jacket, a bellhop's: short, buttoned up
    sk.blob((q) => {
      q.moveTo(-1.9, -7.6);
      q.quadraticCurveTo(0.1, -8.15, 2.1, -7.6);
      q.lineTo(2.3, -3.6);
      q.quadraticCurveTo(1.3, -3.0, 0.6, -3.1);
      q.quadraticCurveTo(-0.8, -3.0, -2.05, -3.4);
      q.closePath();
    }, JACKET, { dark: JACKET_D, d: 0.5 });
    // brass trim down its front and a row of buttons, a brass tag
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = C.brass;
      q.lineWidth = Math.max(0.22, 1 / c.px);
      q.beginPath();
      q.moveTo(0.62, -7.6);
      q.lineTo(0.6, -3.15);
      q.stroke();
      q.fillStyle = C.brass;
      q.strokeStyle = c.ink;
      q.lineWidth = Math.max(c.line * 0.8, 1 / c.px);
      for (const y of [-6.7, -5.7, -4.7, -3.8]) {
        q.beginPath();
        q.arc(0.95, y, 0.2, 0, TAU);
        q.fill();
        q.stroke();
      }
      q.beginPath();
      q.arc(-0.9, -6.2, 0.36, 0, TAU);
      q.fill();
      q.stroke();
    });
    // the stand-up collar
    sk.blob((q) => q.roundRect(-0.85, -8.35, 2.4, 0.85, 0.3), JACKET, { dark: JACKET_D, d: 0.15 });
    sk.draw((q, c) => {
      q.strokeStyle = C.brass;
      q.lineWidth = Math.max(0.18, 1 / c.px);
      q.beginPath();
      q.moveTo(-0.7, -7.65);
      q.lineTo(1.4, -7.65);
      q.stroke();
    });
  },
  head(sk, p) {
    const cx = 0.1;
    const cy = -2.95;
    // the back of the bob, behind the face
    sk.blob((q) => {
      q.moveTo(cx - 3.55, cy + 2.4);
      q.quadraticCurveTo(cx - 3.9, cy - 3.9, cx + 0.3, cy - 3.85);
      q.quadraticCurveTo(cx + 3.9, cy - 3.8, cx + 3.75, cy + 0.2);
      q.lineTo(cx + 3.6, cy + 2.4);
      q.quadraticCurveTo(cx, cy + 2.9, cx - 3.55, cy + 2.4);
      q.closePath();
    }, BOB_D, { dark: shade(BOB_D, -0.15), d: 0.3 });
    sk.blob((q) => q.ellipse(cx + 0.2, cy + 0.15, 3.1, 3.0, 0, 0, TAU), CC_SKIN, { dark: CC_SKIN_D, d: 0.4 });
    // its front: down past the ears to the jaw, a blunt fringe
    sk.blob((q) => {
      q.moveTo(cx - 3.6, cy + 2.35);
      q.quadraticCurveTo(cx - 3.95, cy - 3.95, cx + 0.3, cy - 3.95);
      q.quadraticCurveTo(cx + 3.95, cy - 3.9, cx + 3.8, cy + 0.1);
      q.lineTo(cx + 3.75, cy - 0.35);
      q.lineTo(cx - 0.35, cy - 0.35);
      q.lineTo(cx - 0.6, cy + 0.2);
      q.quadraticCurveTo(cx - 1.25, cy + 1.6, cx - 1.6, cy + 2.45);
      q.closePath();
    }, BOB, { dark: BOB_D, d: 0.4 });
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = '#e6d4ff';
      q.lineWidth = Math.max(0.24, 1 / c.px);
      q.beginPath();
      q.moveTo(cx - 2.4, cy - 2.9);
      q.quadraticCurveTo(cx - 0.9, cy - 3.55, cx + 0.8, cy - 3.45);
      q.stroke();
    });
    // the pillbox hat, tipped on the crown, a brass band round it
    sk.at(mul(move(cx + 0.9, cy - 3.45), turn(0.18)), () => {
      sk.blob((q) => q.roundRect(-1.35, -1.25, 2.7, 1.35, 0.35), JACKET, { dark: JACKET_D, d: 0.3 });
      sk.blob((q) => q.ellipse(0, -1.25, 1.35, 0.4, 0, 0, TAU), shade(JACKET, 0.12), { line: 0.5 });
      sk.blob((q) => q.rect(-1.35, -0.45, 2.7, 0.32), C.brass, { line: 0.4, sil: false });
    });
    face(sk, { x: cx + 1.0, y: cy + 0.85, eyes: p.eyes, mouth: p.mouth, gap: 2.1, drop: 1.25 });
    // rosy cheeks
    sk.draw((q) => {
      q.fillStyle = '#ff8fb066';
      for (const [x, r] of [[cx - 0.35, 0.5], [cx + 2.55, 0.42]] as const) {
        q.beginPath();
        q.ellipse(x, cy + 1.75, r, r * 0.6, 0, 0, TAU);
        q.fill();
      }
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, CC_BONES.upper], 1.2, k ? JACKET_D : JACKET, { dark: k ? null : JACKET_D });
  },
  fore(sk, p, k) {
    const f = CC_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.05, k ? JACKET_D : JACKET, { dark: k ? null : JACKET_D });
    // a brass cuff, then the white glove
    sk.blob((q) => q.roundRect(-0.6, f - 0.75, 1.2, 0.32, 0.12), C.brass, { line: 0.45 });
    atHand(sk, p, k, f, () => {
      if (p.act === 'work' && k === 1 && liftOf(p.u) > 0.02) coatOnHanger(sk, 0.12 * Math.sin(p.u * TAU * 2));
      // the ticket, whole between the hands, then torn: the stub in the
      // near hand
      const tear = tearOf(p.u);
      if (p.act === 'work' && k === 0 && tear > 0.02) sk.at(mul(move(0.5, -0.7), mul(turn(0.3 - 0.5 * tear), zoom(1.35))), () => ticket(sk));
      // the bell's ring: three short strokes off the hand
      const ding = p.act === 'work' ? (tapOf(p.u) > 0.8 ? 1 : 0) : p.act === 'celebrate' ? (Math.abs(Math.sin(p.u * TAU * 2)) > 0.85 ? 1 : 0) : 0;
      if (k === 1 && ding) {
        sk.draw((q, c) => {
          q.lineCap = 'round';
          q.strokeStyle = C.amber;
          q.lineWidth = Math.max(0.22, 1.2 / c.px);
          q.beginPath();
          for (const a of [-0.5, 0.15, 0.8]) {
            q.moveTo(0.4 + Math.cos(a - 1.2) * 0.9, -0.3 + Math.sin(a - 1.2) * 0.9);
            q.lineTo(0.4 + Math.cos(a - 1.2) * 1.6, -0.3 + Math.sin(a - 1.2) * 1.6);
          }
          q.stroke();
        });
      }
    });
    sk.blob((q) => q.arc(0, f, 0.62, 0, TAU), k ? GLOVE_D : GLOVE, { dark: GLOVE_D, d: 0.2 });
  },
};

// In the hatch: a coat lifted up on its hanger in the far hand, held out
// over the counter and handed down; a ticket torn off between the hands;
// the bell tapped. The coat comes up from behind the counter and goes back
// down out of sight, so the loop joins up unseen.
const coatCheckWork: NpcLoop = {
  secs: 2.4,
  pose(u) {
    const lift = liftOf(u);
    const tear = tearOf(u);
    const tap = tapOf(u);
    const fx = 2.6 + 1.8 * lift - 0.8 * tear + (BELL.x - 2.6) * tap;
    const fy = -4.6 - 5.7 * lift - 2.2 * tear + (BELL.y + 0.3 + 4.6) * tap;
    const far = reach(CC_BONES, 1, fx, fy);
    const near = reach(CC_BONES, 0, 0.3 + 0.9 * tear - 0.1 * tear * tear, -5.3 - 1.6 * tear);
    return {
      ...rest(),
      bob: 0.15 * lift,
      lean: 0.04 * lift + 0.06 * tap,
      tilt: -0.1 * lift + 0.1 * tear + 0.12 * tap,
      arms: [near, far],
      eyes: tap > 0.8 ? 'happy' : 'open',
      mouth: lift > 0.8 ? 'open' : 'smile',
    };
  },
};

// Ding, ding: the bell rung twice, the near hand up and out beside its
// head in glee (its elbow out, clear of its face), a little hop, eyes shut
// tight.
const coatCheckCelebrate: NpcLoop = {
  secs: 1.2,
  pose(u) {
    const k = env(u, 0.15, 0.85);
    const ring = Math.abs(Math.sin(u * TAU * 2));
    const far = toward(k, reach(CC_BONES, 1, BELL.x, BELL.y + 0.3 - 0.9 * (1 - ring)));
    return { ...rest(), bob: 0.35 * bump(u, 0.3, 0.7), tilt: 0.1 * k * ring, arms: [{ sh: HANG.sh - 2.15 * k, el: HANG.el - 1.02 * k - 0.15 * ring * k }, far], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

const coatCheck: Npc = {
  name: 'coatCheck',
  station: 'search',
  // in the hatch, its back to the rail of coats
  place: { mode: 'behind', u: HATCH.at, v: CC_V, top: HATCH.top, edge: HATCH.edge },
  tall: 16,
  bones: CC_BONES,
  parts: coatCheckParts,
  work: coatCheckWork,
  celebrate: coatCheckCelebrate,
  serve: coatTicket,
};

export const NPCS: readonly Npc[] = [dj, bartender, coatCheck];
