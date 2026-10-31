import { shade } from '../../art/iso.ts';
import { move, turn, type Sketch } from '../../art/figure/paint.ts';
import { bump, ease, HANG, own, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, level, reach, seen, toBody } from '../../art/npc/helpers.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet, Swing } from '../types.ts';
import { C } from './kit.ts';
import { BOOTH, SCOPE, TOP_GAUGE, VALVE } from './stations.ts';

// The Atomic Shelter's locals (see Npc in ../types.ts), on the shared
// puppet, in the figures' style and the shelter's ink: none of them in the
// residents' teal jumpsuit and cap. The overseer stands at the radar
// console's end watching the sweep (see SCOPE in ./stations.ts), the
// mechanic before the water purifier at its valve wheel (see VALVE), and the
// waitress at the open end of the diner booth, its coffee cup at her
// hand (see BOOTH).

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// Swing a to b by k.
const mixSwing = (a: Swing, b: Swing, k: number): Swing => ({ sh: a.sh + (b.sh - a.sh) * k, el: a.el + (b.el - a.el) * k });

// Strokes in the second pass: round-capped, `w` units wide.
function strokes(sk: Sketch, color: string, w: number, fn: (q: Pen) => void): void {
  sk.draw((q, c) => {
    q.lineCap = 'round';
    q.lineJoin = 'round';
    q.lineWidth = Math.max(w, 1 / c.px);
    q.strokeStyle = color;
    q.beginPath();
    fn(q);
    q.stroke();
  });
}

// A torso from the shoulders (y0) to the hips (y1), x0 to x1 across.
function torso(x0: number, x1: number, y0: number, y1: number): (p: Pen) => void {
  return (q) => {
    q.moveTo(x0, y0);
    q.quadraticCurveTo((x0 + x1) / 2, y0 - 0.5, x1, y0);
    q.quadraticCurveTo(x1 + 0.25, (y0 + y1) / 2, x1 + 0.1, y1);
    q.quadraticCurveTo((x0 + x1) / 2, y1 + 0.45, x0 - 0.05, y1);
    q.quadraticCurveTo(x0 - 0.2, (y0 + y1) / 2, x0, y0);
    q.closePath();
  };
}

// ── the overseer ──────────────────────────────────────────────────────────
// The shelter's overseer: silver hair combed back, a trim moustache, a
// slate-blue blazer with brass buttons and a pin on the lapel over a cream
// shirt and a red tie. One hand behind its back, the other holding a
// chrome public-address microphone on a coiled cord. At work it watches
// the sweep go round the scope, then lifts the microphone and speaks.

const O_SKIN = '#e6b48e';
const O_SKIN_D = '#bf8d67';
const SILVER = '#d6dadd';
const SILVER_D = '#a5acb2';
const BLAZER = '#3f5269';
const BLAZER_D = '#2d3b4e';
const SLACKS = '#6c6f68';
const SLACKS_D = '#51544e';
const SHOE = '#2f2a26';

const OVERSEER_BONES: Bones = { neck: [0.15, -7.95], shoulders: [[-1.75, -7.4], [1.85, -7.4]], upper: 1.7, fore: 1.6 };

// How far into its work the overseer has the microphone up, and speaks.
const miked = (u: number) => ease(u, 0.38, 0.5) - ease(u, 0.86, 0.97);
const TALK: ReadonlyArray<Puppet['mouth']> = ['open', 'o', 'open', 'closed', 'open', 'o'];

const overseerParts: NpcParts = {
  body(sk, _p, back) {
    // grey slacks, polished shoes; the far leg first
    for (const [x, near] of [[0.95, false], [-0.85, true]] as const) {
      sk.limb([x, -3.6, x + 0.05, -0.9], 1.25, near ? SLACKS : SLACKS_D, { dark: near ? SLACKS_D : null });
      sk.blob((q) => q.roundRect(x - 0.55, -1.0, 1.7, 1.0, 0.45), SHOE, { dark: '#1c1916', d: 0.2 });
      sk.blob(ell(x + 0.45, -0.75, 0.35, 0.12), '#6a625a', { line: 0, sil: false });
    }
    // the blazer
    sk.blob(torso(-2.05, 2.2, -7.75, -3.2), BLAZER, { dark: BLAZER_D, d: 0.5 });
    if (back) {
      strokes(sk, BLAZER_D, 0.14, (q) => {
        q.moveTo(0.1, -4.6);
        q.lineTo(0.1, -3.2);
      });
      return;
    }
    // the shirt and tie in the V of the lapels
    sk.blob((q) => {
      q.moveTo(-0.15, -7.95);
      q.lineTo(1.75, -7.95);
      q.lineTo(0.85, -5.0);
      q.closePath();
    }, C.cream, { dark: shade(C.cream, -0.12), d: 0.15 });
    sk.blob((q) => {
      q.moveTo(0.55, -7.8);
      q.lineTo(1.1, -7.8);
      q.lineTo(1.0, -5.75);
      q.lineTo(0.8, -5.35);
      q.lineTo(0.6, -5.75);
      q.closePath();
    }, C.red, { dark: shade(C.red, -0.2), d: 0.1, line: 0.5 });
    // the lapels, a pin on the near one, a pocket square, brass buttons
    strokes(sk, BLAZER_D, 0.2, (q) => {
      q.moveTo(-0.25, -7.85);
      q.lineTo(0.55, -6.3);
      q.lineTo(0.85, -5.0);
      q.moveTo(1.85, -7.85);
      q.lineTo(1.3, -6.4);
      q.lineTo(0.85, -5.0);
    });
    sk.blob(circ(-0.05, -6.85, 0.26), C.brass, { line: 0.5, sil: false });
    sk.blob((q) => {
      q.moveTo(1.55, -6.0);
      q.lineTo(2.25, -6.0);
      q.lineTo(1.95, -6.55);
      q.closePath();
    }, C.teal, { line: 0.5, sil: false });
    for (const y of [-4.6, -3.7]) sk.blob(circ(0.9, y, 0.22), C.brass, { line: 0.5, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.3, 3.15), O_SKIN, { dark: O_SKIN_D, d: 0.45 });
    // silver hair combed back from a side parting, a quiff over the brow
    sk.blob((q) => {
      if (back) {
        q.moveTo(cx - 3.35, cy + 0.9);
        q.quadraticCurveTo(cx - 3.7, cy - 3.8, cx + 0.1, cy - 3.75);
        q.quadraticCurveTo(cx + 3.7, cy - 3.8, cx + 3.35, cy + 0.9);
        q.quadraticCurveTo(cx, cy + 1.7, cx - 3.35, cy + 0.9);
      } else {
        q.moveTo(cx - 3.35, cy + 0.6);
        q.quadraticCurveTo(cx - 3.7, cy - 3.5, cx - 0.4, cy - 3.85);
        q.quadraticCurveTo(cx + 2.6, cy - 4.3, cx + 3.55, cy - 1.9);
        q.quadraticCurveTo(cx + 2.4, cy - 2.55, cx + 0.6, cy - 2.25);
        q.quadraticCurveTo(cx - 1.4, cy - 1.95, cx - 2.3, cy - 0.6);
        q.quadraticCurveTo(cx - 2.6, cy + 0.6, cx - 3.35, cy + 0.6);
      }
      q.closePath();
    }, SILVER, { dark: SILVER_D, d: 0.35 });
    strokes(sk, SILVER_D, 0.13, (q) => {
      for (const d of [0, 0.75, 1.5]) {
        q.moveTo(cx - 2.6 + d * 0.3, cy - 1.3 - d);
        q.quadraticCurveTo(cx - 1.2 + d * 0.3, cy - 2.9 - d * 0.3, cx + 1.2, cy - 3.4 + d * 0.2);
      }
    });
    if (back) return;
    // the ear on the near side, grey at the temple
    sk.blob(ell(cx - 2.85, cy + 0.65, 0.55, 0.8), O_SKIN, { dark: O_SKIN_D, d: 0.15 });
    face(sk, { x: cx + 0.6, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
    // brows and a trim moustache
    strokes(sk, SILVER_D, 0.22, (q) => {
      q.moveTo(cx - 1.05, cy - 0.35);
      q.lineTo(cx - 0.05, cy - 0.45);
      q.moveTo(cx + 1.3, cy - 0.45);
      q.lineTo(cx + 2.1, cy - 0.3);
    });
    if (p.mouth !== 'open' && p.mouth !== 'o') {
      sk.blob((q) => {
        q.moveTo(cx - 0.2, cy + 1.9);
        q.quadraticCurveTo(cx + 0.65, cy + 1.45, cx + 1.55, cy + 1.9);
        q.quadraticCurveTo(cx + 0.65, cy + 1.75, cx - 0.2, cy + 1.9);
        q.closePath();
      }, SILVER, { line: 0.5 });
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, OVERSEER_BONES.upper], 1.3, k ? BLAZER_D : BLAZER, { dark: k ? null : BLAZER_D });
  },
  fore(sk, p, k) {
    const f = OVERSEER_BONES.fore;
    sk.limb([0, 0, 0, f - 0.45], 1.15, k ? BLAZER_D : BLAZER, { dark: k ? null : BLAZER_D });
    sk.blob((q) => q.roundRect(-0.55, f - 0.75, 1.1, 0.4, 0.15), C.cream, { line: 0.5 });
    sk.blob(circ(0, f, 0.6), k ? O_SKIN_D : O_SKIN, { dark: O_SKIN_D, d: 0.2 });
    if (k !== 0 || !own(p.act)) return;
    // the microphone: a chrome capsule on a black grip, turned toward its
    // mouth once lifted, a coiled cord hanging from it
    atHand(sk, p, 0, f, () => {
      strokes(sk, '#2a2a26', 0.13, (q) => {
        q.moveTo(0, 0.3);
        for (let i = 1; i <= 6; i++) q.quadraticCurveTo(i % 2 ? 0.45 : -0.45, 0.3 + (i - 0.5) * 0.4, 0, 0.3 + i * 0.4);
      });
      sk.at(turn((p.act === 'work' ? 0.45 * miked(p.u) : 0) + 0.15), () => {
        sk.blob((q) => q.roundRect(-0.3, -0.9, 0.6, 1.3, 0.2), '#2a2a26', { dark: '#1a1a18', d: 0.1 });
        sk.blob((q) => q.roundRect(-0.45, -2.05, 0.9, 1.3, 0.42), C.chrome, { dark: '#9aa2a6', d: 0.15 });
        strokes(sk, '#7d8a88', 0.08, (q) => {
          for (const y of [-1.75, -1.45, -1.15]) {
            q.moveTo(-0.3, y);
            q.lineTo(0.3, y);
          }
        });
      });
    });
  },
};

// Watches the sweep, the microphone held low; lifts it to its mouth and
// speaks, nodding, then lowers it. The other hand stays behind its back.
const overseerWork: NpcLoop = {
  secs: 4,
  pose(u) {
    const m = miked(u);
    const speak = u > 0.5 && u < 0.85;
    return {
      ...rest(),
      tilt: -0.07 * (1 - m) + 0.06 * m * Math.sin(u * TAU * 4),
      lean: -0.03 + 0.04 * m,
      arms: [{ sh: 0.55 + 0.35 * m, el: 1.15 + 1.0 * m }, { sh: -0.35, el: 0.6 }],
      eyes: u > 0.2 && u < 0.26 ? 'blink' : 'open',
      mouth: speak ? TALK[Math.floor(u * 12) % TALK.length] : 'closed',
    };
  },
};

const overseer: Npc = {
  name: 'overseer',
  station: 'search',
  // on the floor before the console's end, turned along it to the scope
  place: { mode: 'standing', u: SCOPE.u - 4, v: 6, look: 'along' },
  tall: 15,
  bones: OVERSEER_BONES,
  parts: overseerParts,
  work: overseerWork,
};

// ── the mechanic ──────────────────────────────────────────────────────────
// A stocky mechanic in olive coveralls with the sleeves rolled up, a red
// bandana knotted over dark hair, grease on its forearms and cheek, a red
// rag hanging from a pocket and a big chrome wrench in its near hand. At
// work it cranks the purifier's valve wheel round, then knocks on the
// gauge over it; it celebrates with a puff of relief, then the wrench
// held up high behind and the other fist up in front, both beside its
// head, clear of its face.

const M_SKIN = '#b77a4e';
const M_SKIN_D = '#8c5733';
const OLIVE = '#6f7d45';
const OLIVE_D = '#535e32';
const BANDANA = C.red;
const BANDANA_D = '#962f26';
const M_HAIR = '#3a2a22';
const GREASE = '#3b3a32';
const M_BOOT = '#4a3a2c';
const WRENCH = C.chrome;
const WRENCH_D = '#97a0a4';

const MECH_BONES: Bones = { neck: [0.1, -7.55], shoulders: [[-2.05, -7.0], [2.15, -7.0]], upper: 1.65, fore: 1.55 };

// Where it stands: on the floor before the purifier, turned along it to the
// valve wheel at its front corner, the wheel and the gauge over it showing
// beside it, not behind it.
const MECH_AT = { u: 8, v: 13 };
// Where points of the purifier show in the mechanic's own frame (see seen
// in art/npc/helpers.ts): its wheel, a little inside the rim where the hand
// grips, and the gauge it knocks on.
const WHEEL = seen(MECH_AT, VALVE);
const WHEEL_R = 0.85;
const GAUGE = seen(MECH_AT, TOP_GAUGE);

// How far into its work the mechanic cranks the wheel (the rest it knocks
// on the gauge).
// (each change over two frames or more, round the loop too)
const cranking = (u: number) => 1 - ease(u, 0.54, 0.7) + ease(u, 0.8, 1);

const mechParts: NpcParts = {
  body(sk, _p, back) {
    // coverall legs into work boots, the far leg first
    for (const [x, near] of [[1.05, false], [-0.95, true]] as const) {
      sk.limb([x, -3.6, x + 0.05, -1.05], 1.5, near ? OLIVE : OLIVE_D, { dark: near ? OLIVE_D : null });
      sk.blob((q) => q.roundRect(x - 0.7, -1.25, 1.9, 1.25, 0.5), M_BOOT, { dark: '#33281e', d: 0.2 });
    }
    // the coveralls' body, a belt
    sk.blob(torso(-2.4, 2.45, -7.5, -3.25), OLIVE, { dark: OLIVE_D, d: 0.5 });
    sk.blob((q) => q.roundRect(-2.45, -4.05, 5.0, 0.6, 0.25), '#4a3a2c', { dark: '#33281e', d: 0.1, line: 0.5 });
    // the rag out of the back pocket, on the near hip
    sk.blob((q) => {
      q.moveTo(-2.35, -3.7);
      q.lineTo(-1.5, -3.7);
      q.lineTo(-1.7, -2.0);
      q.lineTo(-2.2, -2.3);
      q.lineTo(-2.6, -2.1);
      q.closePath();
    }, C.red, { dark: BANDANA_D, d: 0.15 });
    if (back) return;
    sk.blob((q) => q.roundRect(1.05, -3.95, 0.65, 0.45, 0.1), C.brass, { line: 0.5, sil: false });
    // the zip, a chest pocket with a pencil in it, a smudge
    strokes(sk, OLIVE_D, 0.15, (q) => {
      q.moveTo(1.0, -7.5);
      q.lineTo(1.0, -4.1);
    });
    sk.blob((q) => q.roundRect(-1.2, -6.6, 1.5, 1.15, 0.2), OLIVE, { dark: OLIVE_D, d: 0.15, line: 0.5, sil: false });
    sk.limb([-0.7, -6.6, -0.6, -7.3], 0.22, C.mustard, { sil: false });
    sk.blob(ell(1.7, -5.2, 0.45, 0.3), GREASE, { line: 0, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.9;
    sk.blob(ell(cx, cy, 3.35, 3.15), M_SKIN, { dark: M_SKIN_D, d: 0.45 });
    // dark hair under the bandana at the sides and the nape
    sk.blob((q) => {
      q.moveTo(cx - 3.35, cy - 0.7);
      q.quadraticCurveTo(cx - 3.5, cy + 1.2, cx - 2.6, cy + 1.6);
      q.lineTo(cx - 2.2, cy - 0.8);
      q.closePath();
    }, M_HAIR, { line: 0.5 });
    if (back) sk.blob(ell(cx, cy + 0.6, 3.05, 1.6), M_HAIR, { line: 0, sil: false });
    else {
      sk.blob(ell(cx - 2.75, cy + 0.6, 0.55, 0.8), M_SKIN, { dark: M_SKIN_D, d: 0.15 });
      face(sk, { x: cx + 0.65, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
      // thick brows, stubble, a smudge of grease on the cheek
      strokes(sk, M_HAIR, 0.32, (q) => {
        q.moveTo(cx - 1.1, cy - 0.35);
        q.lineTo(cx + 0.05, cy - 0.5);
        q.moveTo(cx + 1.25, cy - 0.5);
        q.lineTo(cx + 2.15, cy - 0.3);
      });
      sk.blob((q) => {
        q.moveTo(cx - 1.6, cy + 1.6);
        q.quadraticCurveTo(cx + 0.7, cy + 3.4, cx + 2.9, cy + 1.6);
        q.quadraticCurveTo(cx + 2.6, cy + 2.9, cx + 0.7, cy + 3.15);
        q.quadraticCurveTo(cx - 1.2, cy + 3.0, cx - 1.6, cy + 1.6);
        q.closePath();
      }, M_SKIN_D, { line: 0, sil: false });
      sk.blob(ell(cx + 2.25, cy + 1.05, 0.5, 0.28), GREASE, { line: 0, sil: false });
    }
    // the bandana over the top, its knot and tails behind
    const kx = back ? cx + 0.1 : cx - 3.1;
    sk.blob((q) => {
      q.moveTo(cx - 3.45, cy - 0.5);
      q.quadraticCurveTo(cx - 3.5, cy - 3.85, cx + 0.1, cy - 3.9);
      q.quadraticCurveTo(cx + 3.55, cy - 3.85, cx + 3.45, cy - 0.5);
      q.quadraticCurveTo(cx, cy - 1.2, cx - 3.45, cy - 0.5);
      q.closePath();
    }, BANDANA, { dark: BANDANA_D, d: 0.35 });
    for (const [x, y] of [[-1.6, -2.6], [0.6, -3.2], [2.2, -2.0], [-0.4, -1.7], [1.4, -1.35]] as const) sk.blob(circ(cx + x, cy + y, 0.17), '#f4eadc', { line: 0, sil: false });
    sk.blob((q) => {
      q.moveTo(kx, cy - 1.0);
      q.lineTo(kx - 1.1, cy + 0.4);
      q.lineTo(kx - 0.3, cy + 0.6);
      q.closePath();
      q.moveTo(kx + 0.2, cy - 1.0);
      q.lineTo(kx - 0.2, cy + 1.2);
      q.lineTo(kx + 0.6, cy + 0.9);
      q.closePath();
    }, BANDANA, { dark: BANDANA_D, d: 0.15 });
    sk.blob(circ(kx, cy - 1.0, 0.4), BANDANA, { dark: BANDANA_D, d: 0.1 });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, MECH_BONES.upper], 1.45, k ? OLIVE_D : OLIVE, { dark: k ? null : OLIVE_D });
  },
  fore(sk, p, k) {
    const f = MECH_BONES.fore;
    // the sleeve rolled to the elbow, a bare forearm with grease on it
    sk.limb([0, 0.3, 0, f - 0.2], 1.15, k ? M_SKIN_D : M_SKIN, { dark: k ? null : M_SKIN_D });
    sk.blob((q) => q.roundRect(-0.8, -0.25, 1.6, 0.75, 0.3), k ? OLIVE_D : OLIVE, { dark: OLIVE_D, d: 0.15 });
    sk.blob(ell(0.15, 0.95, 0.3, 0.2), GREASE, { line: 0, sil: false });
    sk.blob(circ(0, f, 0.68), k ? M_SKIN_D : M_SKIN, { dark: M_SKIN_D, d: 0.2 });
    // the wrench hanging in the near fist (stood up in it as it cheers)
    if (k === 0 && own(p.act)) atHand(sk, p, 0, f, () => sk.at(turn(p.act === 'celebrate' && p.arms[0].sh < -0.6 ? -Math.PI / 2 - 0.35 : Math.PI / 2 - 0.1 * p.lean), () => wrench(sk)));
  },
};

// A big adjustable wrench along +x from the fist to its open jaw.
const WRENCH_L = 2.4;
function wrench(sk: Sketch): void {
  sk.limb([-0.3, 0, WRENCH_L - 0.5, 0], 0.42, WRENCH, { dark: WRENCH_D });
  sk.blob((q) => {
    q.moveTo(WRENCH_L - 0.65, -0.62);
    q.lineTo(WRENCH_L + 0.3, -0.7);
    q.lineTo(WRENCH_L + 0.3, -0.22);
    q.lineTo(WRENCH_L - 0.05, -0.2);
    q.lineTo(WRENCH_L - 0.05, 0.2);
    q.lineTo(WRENCH_L + 0.3, 0.22);
    q.lineTo(WRENCH_L + 0.3, 0.7);
    q.lineTo(WRENCH_L - 0.65, 0.62);
    q.closePath();
  }, WRENCH, { dark: WRENCH_D, d: 0.15 });
}

// Cranks the wheel round once with the far hand on its rim, leaning into
// it, the wrench hanging in the near hand; then knocks twice on the gauge
// over the wheel with its knuckles, squinting at it, and takes the wheel
// again.
const mechWork: NpcLoop = {
  secs: 2.8,
  pose(u) {
    const c = cranking(u);
    const t = 1 - c;
    const turnOf = ease(u, 0, 0.58);
    const th = Math.PI / 2 + TAU * turnOf;
    const tap = bump(u, 0.62, 0.71) + bump(u, 0.79, 0.88);
    const lean = 0.05 + 0.04 * Math.sin(TAU * turnOf) * c + 0.03 * t;
    const bob = -0.12 * Math.abs(Math.sin(TAU * turnOf)) * c;
    const crank = reach(MECH_BONES, 1, ...toBody({ lean, bob }, WHEEL[0] + WHEEL_R * Math.cos(th), WHEEL[1] + WHEEL_R * (0.5 * Math.cos(th) - Math.sin(th))));
    const knock = reach(MECH_BONES, 1, ...toBody({ lean, bob }, GAUGE[0] - 0.75 - 0.5 * (1 - tap), GAUGE[1] + 0.2));
    return {
      ...rest(),
      lean,
      bob,
      tilt: 0.06 * c - 0.06 * t,
      arms: [HANG, mixSwing(knock, crank, c)],
      eyes: t > 0.5 && tap > 0.6 ? 'blink' : 'open',
      mouth: c > 0.5 ? 'closed' : t > 0.5 ? 'o' : 'smile',
    };
  },
};

// From rest: a puff of relief, shoulders dropping, then a grin, the wrench
// up high behind in the near fist and the far fist up in front, both
// beside its head (as the shared cheer has them), a hop, and back.
const mechCelebrate: NpcLoop = {
  secs: 1.8,
  pose(u) {
    const puff = bump(u, 0.0, 0.35);
    const up = ease(u, 0.2, 0.45) - ease(u, 0.75, 1);
    const pump = 0.15 * bump(u, 0.45, 0.75);
    return {
      ...rest(),
      tilt: 0.06 * puff - 0.08 * up,
      bob: -0.15 * puff + 0.35 * bump(u, 0.4, 0.75),
      arms: [swing(-1.9 * up, -(1.0 + pump) * up), swing(1.65 * up, (0.65 + pump) * up)],
      eyes: puff > 0.5 ? 'shut' : up > 0.3 ? 'happy' : 'open',
      mouth: puff > 0.5 ? 'o' : up > 0.3 ? 'open' : 'smile',
    };
  },
};

const mechanic: Npc = {
  name: 'mechanic',
  station: 'run',
  // on the floor before the purifier, turned along it to the valve wheel
  place: { mode: 'standing', u: MECH_AT.u, v: MECH_AT.v, look: 'along' },
  tall: 14,
  bones: MECH_BONES,
  parts: mechParts,
  work: mechWork,
  celebrate: mechCelebrate,
};

// ── the waitress ──────────────────────────────────────────────────────────
// A diner waitress at the booth's open end: red hair in a high ponytail
// under a white paper cap, a pencil over her ear, a pink dress with a
// white collar and a frilled white apron, white socks and two-tone shoes.
// At work she tops up the cup on the table from the coffee pot, then taps
// her pencil to her chin over the order; her show is a dance to the
// jukebox, the pot swung at her side. She hands over a mug of coffee.

const W_SKIN = '#f1c9a5';
const W_SKIN_D = '#d0a07c';
const W_HAIR = '#c4552e';
const W_HAIR_D = '#92391c';
const DRESS = '#e98aa0';
const DRESS_D = '#c4687e';
const APRON = '#fbf8f0';
const APRON_D = '#dcd5c5';
const POT_GLASS = '#dfe8ec';
const COFFEE = '#5a3420';
const PENCIL = '#f0c040';

const WAITRESS_BONES: Bones = { neck: [0.1, -7.8], shoulders: [[-1.6, -7.3], [1.7, -7.3]], upper: 1.65, fore: 1.55 };

// How far into her work she pours, and taps her pencil.
const pouring = (u: number) => ease(u, 0, 0.17) - ease(u, 0.4, 0.58);
const tilting = (u: number) => ease(u, 0.12, 0.2) - ease(u, 0.36, 0.44);
const musing = (u: number) => ease(u, 0.5, 0.66) - ease(u, 0.82, 1);

const waitressParts: NpcParts = {
  body(sk, p, back) {
    // bare legs, white socks, two-tone shoes; a kick now and then in her
    // dance; the far leg first
    const beat = p.act === 'show' ? Math.floor(p.u * 8) % 4 : -1;
    for (const [x, near] of [[0.9, false], [-0.75, true]] as const) {
      const kick = (near && beat === 1) || (!near && beat === 3) ? 1 : 0;
      const fx = x + 0.9 * kick;
      const fy = -0.5 * kick;
      sk.limb([x, -3.2, fx + 0.05, fy - 1.0], 1.0, near ? W_SKIN : W_SKIN_D, { dark: near ? W_SKIN_D : null });
      sk.blob((q) => q.roundRect(fx - 0.45, fy - 1.15, 1.0, 0.45, 0.15), '#ffffff', { line: 0.5 });
      sk.blob((q) => q.roundRect(fx - 0.55, fy - 0.85, 1.6, 0.85, 0.4), '#f4f0e6', { dark: '#d8d2c4', d: 0.15 });
      sk.blob((q) => q.roundRect(fx - 0.05, fy - 0.85, 0.55, 0.85, 0.1), '#2a2a26', { line: 0, sil: false });
    }
    // the dress: a fitted bodice, a skirt flaring to the knee
    const sway = p.act === 'show' ? 0.35 * Math.sin(p.u * TAU * 2) : 0;
    sk.blob((q) => {
      q.moveTo(-1.85, -7.6);
      q.quadraticCurveTo(0.1, -8.1, 2.0, -7.6);
      q.quadraticCurveTo(2.1, -5.6, 1.75, -4.6);
      q.quadraticCurveTo(2.9 + sway, -3.2, 3.0 + sway, -2.35);
      q.quadraticCurveTo(0.1 + sway, -1.75, -2.85 + sway, -2.35);
      q.quadraticCurveTo(-2.7 + sway, -3.4, -1.6, -4.6);
      q.quadraticCurveTo(-2.0, -5.6, -1.85, -7.6);
      q.closePath();
    }, DRESS, { dark: DRESS_D, d: 0.5 });
    if (back) {
      // the apron's bow at the back
      sk.blob(ell(-0.4, -4.55, 0.65, 0.4), APRON, { dark: APRON_D, d: 0.1 });
      sk.blob(ell(0.6, -4.55, 0.65, 0.4), APRON, { dark: APRON_D, d: 0.1 });
      sk.blob(circ(0.1, -4.55, 0.28), APRON, { line: 0.5 });
      return;
    }
    // the apron: its band, a frilled skirt over the dress, a pocket
    sk.blob((q) => {
      q.moveTo(-1.2, -4.75);
      q.lineTo(2.15, -4.75);
      q.quadraticCurveTo(2.55 + sway, -3.3, 2.5 + sway, -2.6);
      for (let i = 0; i <= 6; i++) q.quadraticCurveTo(2.5 + sway - (i + 0.5) * 0.6, -2.15, 2.5 + sway - (i + 1) * 0.6, -2.55);
      q.quadraticCurveTo(-1.85 + sway, -3.4, -1.2, -4.75);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.35 });
    sk.blob((q) => q.roundRect(-1.3, -5.05, 3.6, 0.45, 0.2), APRON, { dark: APRON_D, d: 0.1 });
    sk.blob((q) => q.roundRect(0.95 + sway * 0.6, -3.9, 0.95, 0.75, 0.15), APRON_D, { line: 0.5, sil: false });
    // the white collar, rounded either side
    sk.blob((q) => {
      q.moveTo(-0.9, -7.85);
      q.quadraticCurveTo(-0.85, -6.9, 0.35, -6.95);
      q.lineTo(0.75, -7.6);
      q.lineTo(1.15, -6.95);
      q.quadraticCurveTo(2.2, -6.95, 2.0, -7.75);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.15 });
    for (const y of [-6.4, -5.6]) sk.blob(circ(0.75, y, 0.17), APRON, { line: 0.5, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the ponytail high at the back, swinging when she dances
    const swing = p.act === 'show' ? 0.6 * Math.sin(p.u * TAU * 2 + 0.8) : 0.15 * Math.sin(p.u * TAU);
    const px = back ? cx + 0.3 : cx - 2.6;
    sk.blob((q) => {
      q.moveTo(px + 0.9, cy - 3.1);
      q.quadraticCurveTo(px - 2.0 + swing, cy - 3.0, px - 1.5 + swing * 1.6, cy + 1.7);
      q.quadraticCurveTo(px - 0.9 + swing * 1.2, cy + 0.2, px - 0.1, cy - 1.7);
      q.closePath();
    }, W_HAIR, { dark: W_HAIR_D, d: 0.3 });
    sk.blob(ell(cx, cy, 3.25, 3.1), W_SKIN, { dark: W_SKIN_D, d: 0.45 });
    // her hair: swept up, curled bangs over the brow
    sk.blob((q) => {
      if (back) {
        q.moveTo(cx - 3.3, cy + 1.2);
        q.quadraticCurveTo(cx - 3.7, cy - 3.7, cx + 0.1, cy - 3.75);
        q.quadraticCurveTo(cx + 3.7, cy - 3.7, cx + 3.3, cy + 1.2);
        q.quadraticCurveTo(cx, cy + 2.1, cx - 3.3, cy + 1.2);
      } else {
        q.moveTo(cx - 3.3, cy + 1.0);
        q.quadraticCurveTo(cx - 3.65, cy - 3.6, cx + 0.2, cy - 3.75);
        q.quadraticCurveTo(cx + 3.6, cy - 3.7, cx + 3.35, cy - 0.7);
        q.quadraticCurveTo(cx + 2.9, cy - 1.95, cx + 1.9, cy - 1.75);
        q.quadraticCurveTo(cx + 1.6, cy - 2.6, cx + 0.6, cy - 2.2);
        q.quadraticCurveTo(cx - 0.2, cy - 2.8, cx - 1.0, cy - 1.9);
        q.quadraticCurveTo(cx - 2.2, cy - 1.5, cx - 2.3, cy + 0.2);
        q.quadraticCurveTo(cx - 2.7, cy + 1.1, cx - 3.3, cy + 1.0);
      }
      q.closePath();
    }, W_HAIR, { dark: W_HAIR_D, d: 0.35 });
    // the paper cap, a pink band round it
    sk.blob((q) => {
      q.moveTo(cx - 2.3, cy - 3.0);
      q.lineTo(cx + 2.5, cy - 3.0);
      q.quadraticCurveTo(cx + 2.2, cy - 4.4, cx + 0.1, cy - 4.55);
      q.quadraticCurveTo(cx - 2.0, cy - 4.4, cx - 2.3, cy - 3.0);
      q.closePath();
    }, '#ffffff', { dark: '#ddd8cc', d: 0.2 });
    sk.blob((q) => q.roundRect(cx - 2.45, cy - 3.35, 5.1, 0.5, 0.2), DRESS, { dark: DRESS_D, d: 0.1, line: 0.5 });
    if (back) return;
    // the pencil over her near ear, blush, and her face
    sk.limb([cx - 3.4, cy - 0.3, cx - 2.2, cy + 0.6], 0.3, PENCIL);
    sk.blob(circ(cx - 2.2, cy + 0.6, 0.15), '#3a3030', { line: 0, sil: false });
    for (const x of [-0.75, 2.3]) sk.blob(ell(cx + x, cy + 1.45, 0.45, 0.28), '#f29a9a', { line: 0, sil: false });
    face(sk, { x: cx + 0.6, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth, iris: '#2a3a30' });
  },
  upper(sk, _p, k) {
    // a puffed short sleeve, a bare arm under it
    sk.limb([0, 0.4, 0, WAITRESS_BONES.upper], 0.95, k ? W_SKIN_D : W_SKIN, { dark: k ? null : W_SKIN_D });
    sk.blob(ell(0, 0.3, 0.9, 0.85), k ? DRESS_D : DRESS, { dark: DRESS_D, d: 0.2 });
  },
  fore(sk, p, k) {
    const f = WAITRESS_BONES.fore;
    sk.limb([0, 0, 0, f - 0.2], 0.9, k ? W_SKIN_D : W_SKIN, { dark: k ? null : W_SKIN_D });
    sk.blob(circ(0, f, 0.55), k ? W_SKIN_D : W_SKIN, { dark: W_SKIN_D, d: 0.15 });
    if (k === 0 && own(p.act)) {
      // the coffee pot, tipped to pour at work
      const tip = p.act === 'work' ? POUR_TIP * tilting(p.u) : 0;
      atHand(sk, p, 0, f, () => sk.at(turn(tip), () => pot(sk, p.act === 'work' && tip > 0.6)));
    }
    if (k === 1 && p.act === 'work' && musing(p.u) > 0.4) {
      // the pencil, tapped to her chin
      sk.at(move(0, f), () => sk.limb([0, 0.2, 0.15, -1.7], 0.3, PENCIL));
    }
  },
};

// The coffee pot in her hand: a round glass carafe, coffee in it, an
// orange collar and handle; the stream from its spout (SPOUT, from the
// hand) when it pours.
const SPOUT = { x: 1.75, y: -1.3 };
const POUR_TIP = 0.95;
function pot(sk: Sketch, stream: boolean): void {
  sk.limb([-0.1, -1.0, -0.65, -0.85, -0.65, 0.25, -0.2, 0.4], 0.28, C.orange);
  sk.blob(circ(0.5, 0.3, 1.0), POT_GLASS, { dark: '#b9c8ce', d: 0.2 });
  sk.blob((q) => {
    q.moveTo(-0.45, 0.5);
    q.quadraticCurveTo(0.5, 0.3, 1.45, 0.5);
    q.quadraticCurveTo(1.3, 1.3, 0.5, 1.3);
    q.quadraticCurveTo(-0.3, 1.3, -0.45, 0.5);
    q.closePath();
  }, COFFEE, { line: 0.5, sil: false });
  sk.blob((q) => q.roundRect(-0.15, -1.2, 1.3, 0.55, 0.2), C.orange, { dark: '#b8622a', d: 0.1 });
  sk.blob((q) => {
    q.moveTo(1.1, -1.15);
    q.lineTo(SPOUT.x, SPOUT.y);
    q.lineTo(1.4, -0.75);
    q.closePath();
  }, POT_GLASS, { line: 0.5 });
  sk.blob(ell(0.1, -0.05, 0.18, 0.38), '#ffffff', { line: 0, sil: false });
  if (stream) {
    sk.at(move(SPOUT.x, SPOUT.y), () => level(sk, () => strokes(sk, COFFEE, 0.24, (q) => {
      q.moveTo(0, 0);
      q.quadraticCurveTo(0.12, 0.35, 0.08, 0.95);
    })));
  }
}

// Where her cup shows in her own frame (x toward the table on screen, y
// down), its rim; and where her near hand goes for the spout, the pot
// tipped `tip`, to pour into it from just over it.
const CUP = { x: BOOTH.cup[0] - BOOTH.cup[1] - (BOOTH.u - BOOTH.v), y: (BOOTH.cup[0] + BOOTH.cup[1] - BOOTH.u - BOOTH.v) / 2 - BOOTH.cup[2] };
function pourAt(tip: number): { x: number; y: number } {
  const c = Math.cos(tip);
  const s = Math.sin(tip);
  return { x: CUP.x - (SPOUT.x * c - SPOUT.y * s), y: CUP.y - 1.0 - (SPOUT.x * s + SPOUT.y * c) };
}

// Tops up the cup on the table, the pot tipped over it; then the pot down
// at her side and the pencil tapped to her chin over the order.
const waitressWork: NpcLoop = {
  secs: 3.2,
  pose(u) {
    const po = pouring(u);
    const m = musing(u);
    const tap = Math.abs(Math.sin(u * TAU * 4)) * m;
    const lean = 0.05 * po;
    const at = pourAt(POUR_TIP * tilting(u));
    const hold: Swing = { sh: 0.25 + 0.1 * m, el: 0.3 + 0.4 * m };
    return {
      ...rest(),
      lean,
      tilt: 0.1 * po - 0.06 * m,
      arms: [mixSwing(hold, reach(WAITRESS_BONES, 0, ...toBody({ lean, bob: 0 }, at.x, at.y)), po), swing(m * 0.75, m * (1.95 + 0.25 * tap))],
      eyes: m > 0.5 && u > 0.7 && u < 0.8 ? 'blink' : 'open',
      mouth: m > 0.5 ? 'closed' : 'smile',
    };
  },
};

// A dance to the jukebox: hips swinging, a bounce on every beat, kicks
// either side, the pot swung at her side and the other hand waving up
// beside her head.
const waitressShow: NpcLoop & { crowd: 'dance' } = {
  secs: 3.2,
  crowd: 'dance',
  pose(u) {
    const beat = Math.abs(Math.sin(u * TAU * 4));
    const sw = Math.sin(u * TAU * 2);
    return {
      ...rest(),
      bob: 0.35 * beat,
      lean: 0.12 * sw,
      tilt: -0.08 * sw,
      arms: [{ sh: -0.1 + 0.45 * sw, el: 0.45 + 0.25 * beat }, { sh: 1.95 + 0.15 * sw, el: 0.35 + 0.45 * beat }],
      eyes: beat > 0.6 ? 'happy' : 'open',
      mouth: beat > 0.5 ? 'open' : 'smile',
    };
  },
};

// A diner mug of coffee: cream, a teal band, steam.
const coffee: NpcServe = {
  name: 'coffee',
  drink: true,
  draw(sk) {
    sk.limb([0.85, -0.95, 1.4, -0.75, 1.4, -0.15, 0.85, 0.05], 0.3, C.cream);
    sk.blob((q) => q.roundRect(-0.9, -1.35, 1.8, 1.85, 0.35), C.cream, { dark: shade(C.cream, -0.15), d: 0.3 });
    sk.blob((q) => q.roundRect(-0.9, -0.7, 1.8, 0.45, 0), C.teal, { line: 0.5, sil: false });
    sk.blob(ell(0, -1.32, 0.75, 0.2), COFFEE, { line: 0.5, sil: false });
    strokes(sk, '#f4f4ee', 0.16, (q) => {
      q.moveTo(-0.25, -1.65);
      q.quadraticCurveTo(-0.6, -2.0, -0.2, -2.35);
      q.moveTo(0.35, -1.6);
      q.quadraticCurveTo(0.05, -1.95, 0.4, -2.2);
    });
  },
};

const waitress: Npc = {
  name: 'waitress',
  station: 'idle',
  // on the booth's checker at its open end, turned along it to the table
  place: { mode: 'seated', u: BOOTH.u, v: BOOTH.v, z: 0, look: 'along' },
  tall: 15,
  bones: WAITRESS_BONES,
  parts: waitressParts,
  work: waitressWork,
  show: waitressShow,
  serve: coffee,
};

export const NPCS: readonly Npc[] = [overseer, mechanic, waitress];
