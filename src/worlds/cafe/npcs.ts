import type { Sketch } from '../../art/figure/paint.ts';
import { mul, turn, zoom } from '../../art/figure/paint.ts';
import { shade } from '../../art/iso.ts';
import { bump, ease, env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, fromHand, handOf, reach, toward } from '../../art/npc/helpers.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe } from '../types.ts';
import { C } from './kit.ts';
import { ESPRESSO, OPEN, SEAT } from './stations.ts';

// The café's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the café's espresso-brown ink: the barista behind the
// espresso bar, the pastry chef behind the open end of the pastry case and
// the old regular in the wingback (each station leaves room for its local:
// see ESPRESSO, OPEN and SEAT in ./stations.ts).

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
const mix = (a: number, b: number, k: number) => a + (b - a) * k;

// The standing locals' build: a long body under the head, so what their
// hands do shows over the counter they stand behind and under their chin.
const TALL_BONES: Bones = { neck: [0.15, -8.5], shoulders: [[-1.6, -7.9], [1.75, -7.9]], upper: 1.85, fore: 1.75 };

// Legs and shoes (a counter hides them), the far one first.
function legs(sk: Sketch, cloth: string, dark: string, shoe: string): void {
  for (const [x, near] of [[0.95, false], [-0.8, true]] as const) {
    sk.limb([x, -3.6, x + 0.05, -0.8], 1.2, near ? cloth : dark, { dark: near ? dark : null });
    sk.blob((q) => q.roundRect(x - 0.5, -1.0, 1.55, 0.95, 0.4), shoe, { dark: shade(shoe, -0.3), d: 0.15 });
  }
}

// A long torso, shoulders to hips, facing +x.
function torso(sk: Sketch, fill: string, dark: string): void {
  sk.blob((q) => {
    q.moveTo(-1.95, -8.3);
    q.quadraticCurveTo(0.1, -8.85, 2.15, -8.3);
    q.lineTo(2.35, -3.3);
    q.quadraticCurveTo(0.15, -2.8, -2.1, -3.3);
    q.closePath();
  }, fill, { dark, d: 0.5 });
}

// ── the barista ──────────────────────────────────────────────────────────
// Behind the espresso bar, beside the machine: dark hair swept back into a
// bun, a short brown beard, a cream shirt with its sleeves rolled and a
// denim apron. At work
// it tamps a portafilter, then steams a jug of milk up at the wand; its
// show is latte art: a heart poured into a cup with a wiggle and a flick,
// then the cup held up for all to see. It serves the latte.

const BR_SKIN = '#e3a57e';
const BR_SKIN_D = '#c3835d';
const BEARD = '#6b4a33';
const HAIR = '#4a3324';
const HAIR_D = '#33231a';
const SHIRT = C.cream;
const SHIRT_D = '#d6c19c';
const APRON = '#4a6584';
const APRON_D = '#384e68';

// Where the barista stands, out from the back counter, and the steam
// wand's tip in its own frame: forward of it, where the counter's back edge
// shows higher up the screen than at its feet (see cutOf in
// world/npc-place.ts), so the jug held up to it shows over the bar.
const BR_V = 2.8;
const WAND = {
  x: ESPRESSO.at - BR_V - (ESPRESSO.wand[0] - ESPRESSO.wand[1]),
  y: (ESPRESSO.wand[0] + ESPRESSO.wand[1] - ESPRESSO.at - BR_V) / 2 - ESPRESSO.wand[2],
};

// A cup of latte on its saucer, the saucer at the hand: its foam with a
// crema heart, `heart` of the way poured (1 whole), seen a little from
// above (`up` tips it further toward us to show it off).
function latteCup(sk: Sketch, heart = 1, up = 0): void {
  sk.blob(ell(0, -0.05, 1.05, 0.28), C.china, { dark: shade(C.china, -0.12), d: 0.1, line: 0.5 });
  sk.blob((q) => {
    q.moveTo(-0.72, -1.15);
    q.lineTo(0.72, -1.15);
    q.quadraticCurveTo(0.7, -0.15, 0, -0.15);
    q.quadraticCurveTo(-0.7, -0.15, -0.72, -1.15);
    q.closePath();
  }, C.china, { dark: shade(C.china, -0.15), d: 0.2 });
  sk.limb([0.7, -0.95, 1.05, -0.8, 0.85, -0.45], 0.16, C.china, { line: 0.4 });
  const ry = 0.24 + 0.3 * up;
  sk.blob(ell(0, -1.15, 0.72, ry), C.crema, { line: 0.5 });
  if (heart > 0.05) {
    sk.draw((q) => {
      const h = 0.42 * heart;
      const sy = ry / 0.24;
      q.fillStyle = '#fbf3e6';
      q.beginPath();
      q.moveTo(0, -1.15 + h * 0.55 * Math.min(sy, 1.6));
      q.bezierCurveTo(-h * 1.5, -1.15 - h * 0.2 * sy, -h * 0.6, -1.15 - h * 1.0 * sy, 0, -1.15 - h * 0.35 * sy);
      q.bezierCurveTo(h * 0.6, -1.15 - h * 1.0 * sy, h * 1.5, -1.15 - h * 0.2 * sy, 0, -1.15 + h * 0.55 * Math.min(sy, 1.6));
      q.fill();
    });
  }
}

const latte: NpcServe = { name: 'latte', drink: true, draw: (sk) => latteCup(sk) };

// A steel milk jug, held by its handle at the origin: the body to +x, its
// spout up at the far rim; tipped `tip` (+ pours forward).
function jug(sk: Sketch, tip: number): void {
  sk.at(turn(tip), () => {
    sk.limb([0.1, -0.55, -0.15, -0.15, 0.1, 0.35], 0.24, C.chrome, { line: 0.45 });
    sk.blob((q) => {
      q.moveTo(0.3, -0.75);
      q.lineTo(1.65, -0.75);
      q.lineTo(1.95, -0.95);
      q.lineTo(1.75, -0.55);
      q.lineTo(1.6, 0.75);
      q.quadraticCurveTo(1.0, 0.95, 0.4, 0.75);
      q.closePath();
    }, C.chrome, { dark: '#9aa3a8', d: 0.25 });
    sk.draw((q, c) => {
      q.strokeStyle = '#ffffff';
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.16, 1 / c.px);
      q.beginPath();
      q.moveTo(0.6, -0.5);
      q.lineTo(0.65, 0.5);
      q.stroke();
    });
  });
}
const SPOUT: [number, number] = [1.95, -0.95];
const MIRROR = [-1, 0, 0, 1, 0, 0] as const;

// A portafilter, held by its handle at the origin: the black handle back
// to the steel basket, its grounds level; the tamper's steel foot and
// walnut knob pressed on it `press` (0 lifted, 1 pressed home).
function portafilter(sk: Sketch, press: number | null): void {
  sk.limb([0, 0, 1.05, -0.25], 0.42, '#2b2522', { line: 0.5 });
  sk.blob(ell(1.75, -0.4, 0.8, 0.32), C.chrome, { dark: '#9aa3a8', d: 0.15 });
  sk.blob(ell(1.75, -0.48, 0.6, 0.2), C.coffee, { line: 0.4, sil: false });
  if (press === null) return;
  const y = -0.55 - 0.7 * (1 - press);
  sk.blob((q) => q.roundRect(1.15, y - 0.3, 1.2, 0.32, 0.12), C.chrome, { dark: '#9aa3a8', d: 0.1 });
  sk.blob((q) => q.roundRect(1.55, y - 1.0, 0.4, 0.75, 0.18), C.walnut, { dark: C.walnutDark, d: 0.1 });
  sk.blob(circ(1.75, y - 1.1, 0.36), C.walnut, { dark: C.walnutDark, d: 0.1 });
}

// The work loop's beats (see baristaWork), by the frame (f = u * 12): the
// tamp (frames 0 to 4), the portafilter away under the bar as the jug comes
// up to the wand (over frames 5 and 6), the jug swirled there (7 to 9),
// and the jug away as the portafilter comes back (over 10 and 11): each
// hand-over eased across two frames, never a cut.
const tampOf = (u: number) => 1 - ease(u * 12, 4, 6.5) + ease(u * 12, 9.5, 12);
const steamOf = (u: number) => ease(u * 12, 5, 7.5) - ease(u * 12, 9, 11.5);
const pressOf = (u: number) => Math.max(0, Math.sin(u * TAU * 2.6));

// The show's beats (see baristaShow), by the frame (f = u * 16): into the
// pour (over frames 1 to 3), the heart growing (4 to 9), the jug flicked
// away (10), the cup lifted high (over 10 and 11) and held, and down again
// (over 14 and 15) as it comes back to rest.
const pourOf = (u: number) => ease(u * 16, 1.5, 4) - ease(u * 16, 8.5, 10.5);
const heartOf = (u: number) => ease(u * 16, 3.5, 9.5);
const showOf = (u: number) => ease(u * 16, 9.5, 12) - ease(u * 16, 13, 15.5);

const baristaParts: NpcParts = {
  body(sk) {
    legs(sk, '#3b3534', '#2a2524', '#5b3622');
    torso(sk, SHIRT, SHIRT_D);
    // the apron: a bib on a strap round the neck, a pocket, brass rivets
    sk.blob((q) => {
      q.moveTo(-0.5, -7.4);
      q.lineTo(1.75, -7.4);
      q.lineTo(2.1, -5.4);
      q.lineTo(2.35, -2.9);
      q.quadraticCurveTo(0.3, -2.5, -1.9, -2.9);
      q.lineTo(-1.75, -5.4);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.45 });
    sk.limb([-0.35, -7.4, 0.15, -8.4, 1.6, -7.4], 0.22, APRON_D, { line: 0.4, sil: false });
    sk.blob((q) => q.roundRect(-0.2, -5.2, 1.7, 1.2, 0.15), APRON_D, { line: 0.4, sil: false });
    sk.draw((q, c) => {
      q.fillStyle = C.brass;
      for (const [x, y] of [[-0.05, -5.05], [1.35, -5.05]] as const) {
        q.beginPath();
        q.arc(x, y, Math.max(0.14, 0.8 / c.px), 0, TAU);
        q.fill();
      }
    });
  },
  head(sk, p) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.25, 3.1), BR_SKIN, { dark: BR_SKIN_D, d: 0.45 });
    // a full short beard round the jaw, the chin under the mouth
    sk.blob((q) => {
      q.moveTo(cx - 1.35, cy + 0.25);
      q.quadraticCurveTo(cx - 1.75, cy + 3.0, cx + 0.7, cy + 3.6);
      q.quadraticCurveTo(cx + 2.9, cy + 3.35, cx + 3.2, cy + 0.85);
      q.lineTo(cx + 2.7, cy + 1.25);
      q.quadraticCurveTo(cx + 2.0, cy + 1.55, cx + 1.65, cy + 2.15);
      q.quadraticCurveTo(cx + 0.85, cy + 2.55, cx + 0.05, cy + 2.15);
      q.quadraticCurveTo(cx - 0.55, cy + 1.55, cx - 0.8, cy + 0.55);
      q.closePath();
    }, BEARD, { dark: shade(BEARD, -0.2), d: 0.25 });
    // the ear
    sk.blob(ell(cx - 1.7, cy + 0.45, 0.55, 0.72), BR_SKIN, { dark: BR_SKIN_D, d: 0.2, line: 0.5 });
    // the hair swept back off the brow into a bun on the crown, the sides
    // cut short
    sk.blob((q) => {
      q.moveTo(cx - 1.3, cy + 0.4);
      q.quadraticCurveTo(cx - 3.55, cy + 0.3, cx - 3.25, cy - 1.6);
      q.quadraticCurveTo(cx - 2.7, cy - 3.25, cx + 0.2, cy - 3.25);
      q.quadraticCurveTo(cx + 2.9, cy - 3.2, cx + 3.25, cy - 1.15);
      q.quadraticCurveTo(cx + 1.6, cy - 2.05, cx - 0.2, cy - 1.55);
      q.quadraticCurveTo(cx - 1.0, cy - 1.2, cx - 1.3, cy + 0.4);
      q.closePath();
    }, HAIR, { dark: HAIR_D, d: 0.35 });
    sk.blob(circ(cx - 0.75, cy - 3.6, 1.05), HAIR, { dark: HAIR_D, d: 0.3 });
    sk.blob((q) => q.roundRect(cx - 1.45, cy - 2.95, 1.4, 0.38, 0.15), C.mustard, { line: 0.45 });
    sk.draw((q, c) => {
      q.strokeStyle = HAIR_D;
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.12, 0.8 / c.px);
      q.beginPath();
      for (const x of [-1.4, -0.2, 1.0, 2.1]) {
        q.moveTo(cx + x + 0.6, cy - 1.75 - 0.05 * x);
        q.quadraticCurveTo(cx + x - 0.2, cy - 2.7, cx + x - 1.0, cy - 2.95);
      }
      q.stroke();
    });
    face(sk, { x: cx + 0.75, y: cy + 0.35, eyes: p.eyes, mouth: p.mouth, drop: 1.45 });
    // the moustache over the mouth
    sk.blob((q) => {
      const mx = cx + 0.8;
      const my = cy + 1.45;
      q.moveTo(mx - 1.0, my + 0.3);
      q.quadraticCurveTo(mx - 0.7, my - 0.25, mx, my - 0.12);
      q.quadraticCurveTo(mx + 0.7, my - 0.25, mx + 1.0, my + 0.3);
      q.quadraticCurveTo(mx + 0.45, my + 0.12, mx, my + 0.25);
      q.quadraticCurveTo(mx - 0.45, my + 0.12, mx - 1.0, my + 0.3);
      q.closePath();
    }, BEARD, { line: 0.45, sil: false });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, TALL_BONES.upper], 1.2, k ? SHIRT_D : SHIRT, { dark: k ? null : SHIRT_D });
  },
  fore(sk, p, k) {
    const f = TALL_BONES.fore;
    sk.limb([0, 0.2, 0, f - 0.25], 0.95, k ? BR_SKIN_D : BR_SKIN, { dark: k ? null : BR_SKIN_D });
    sk.blob((q) => q.roundRect(-0.68, -0.2, 1.36, 0.65, 0.3), k ? SHIRT_D : SHIRT, { dark: k ? null : SHIRT_D, d: 0.15 });
    // what the hand holds, under its fingers
    atHand(sk, p, k, TALL_BONES.fore, () => {
      if (p.act === 'work') {
        const tamp = tampOf(p.u);
        if (k === 0 && tamp > 0.05) sk.at(zoom(1.25), () => portafilter(sk, pressOf(p.u)));
        if (k === 1 && steamOf(p.u) > 0.05) jug(sk, 0.15 * Math.sin(p.u * TAU * 3));
      }
      if (p.act === 'show') {
        // the cup in the near hand; the jug in the far one, turned to pour
        // back across into it
        const pour = pourOf(p.u);
        if (k === 0) latteCup(sk, heartOf(p.u), showOf(p.u));
        if (k === 1 && showOf(p.u) < 0.5) {
          const tip = -(0.2 + 0.55 * pour) + 0.07 * pour * Math.sin(p.u * TAU * 8);
          sk.at(mul(turn(tip), MIRROR), () => jug(sk, 0));
          if (pour > 0.6) {
            // the milk, from the spout down into the cup
            const sx = -Math.cos(tip) * SPOUT[0] - Math.sin(tip) * SPOUT[1];
            const sy = -Math.sin(tip) * SPOUT[0] + Math.cos(tip) * SPOUT[1];
            const [hx, hy] = handOf(TALL_BONES, p, 0);
            const [tx, ty] = fromHand(TALL_BONES, p, 1, hx + 0.1, hy - 1.05);
            sk.limb([sx, sy, (sx + tx) / 2 - 0.05, (sy + ty) / 2, tx, ty], 0.22, '#fbf3e6', { line: 0.4, sil: false });
          }
        }
      }
    });
    sk.blob(circ(0, f, 0.6), k ? BR_SKIN_D : BR_SKIN, { dark: BR_SKIN_D, d: 0.2 });
  },
};

// Behind the bar: the portafilter in the near hand, tamped twice with the
// far one, then put away under the bar while the far hand holds the jug up
// to the steam wand, swirling it, and back.
const baristaWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const tamp = tampOf(u);
    const steam = steamOf(u);
    const press = tamp * pressOf(u);
    const swirl = Math.sin(u * TAU * 3);
    const near = reach(TALL_BONES, 0, mix(0.6, 0.9, tamp), mix(-5.6, -6.7, tamp));
    const far = reach(TALL_BONES, 1, mix(2.6, WAND.x - 1.0 + 0.12 * swirl, steam), mix(-8.2 + 0.55 * press, WAND.y + 0.35 - 0.1 * Math.cos(u * TAU * 3), steam));
    return {
      ...rest(),
      bob: 0.12 * press,
      lean: 0.05 * press + 0.04 * steam,
      tilt: 0.12 * tamp + 0.06 * press + 0.05 * steam,
      arms: [near, far],
      eyes: steam > 0.5 && swirl > 0.6 ? 'happy' : 'open',
    };
  },
};

// Latte art: the cup in the near hand before its chest, the jug in the
// far one tipped back across into it, wiggling a heart in; a flick up and
// away; then the cup lifted high by its head and tipped toward the room,
// the far hand out (voila), and down.
const baristaShow: NpcLoop & { crowd: 'watch' } = {
  secs: 4,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const k = ease(u * 16, 0, 2.5) - ease(u * 16, 13, 16);
    const pour = pourOf(u);
    const up = showOf(u);
    const flick = bump(u * 16, 9, 11.5);
    const near = reach(TALL_BONES, 0, mix(-0.4, mix(1.2, -2.5, up), k), mix(-4.6, mix(-6.6, -9.9, up), k));
    const far = reach(TALL_BONES, 1, mix(2.0, mix(3.6 - 0.15 * pour, 4.3, up), k), mix(-4.8, mix(-8.4 - 0.9 * flick, -7.4, up), k));
    return {
      ...rest(),
      bob: 0.25 * bump(u, 0.7, 0.85),
      lean: 0.06 * pour - 0.04 * up,
      tilt: 0.16 * pour - 0.1 * up,
      arms: [near, far],
      eyes: up > 0.5 ? 'happy' : 'open',
      mouth: up > 0.5 ? 'open' : pour > 0.5 ? 'o' : 'smile',
    };
  },
};

const barista: Npc = {
  name: 'barista',
  station: 'run',
  // behind the bar beside the machine, out from the back counter
  place: { mode: 'behind', u: ESPRESSO.at, v: BR_V, top: ESPRESSO.top, edge: ESPRESSO.edge },
  tall: 16,
  bones: TALL_BONES,
  parts: baristaParts,
  work: baristaWork,
  show: baristaShow,
  serve: latte,
};

// ── the pastry chef ──────────────────────────────────────────────────────
// Behind the open end of the pastry case: a tall pleated toque, ginger
// curls under it, rosy cheeks, a white double-breasted jacket and a red
// neckerchief. At work it ices a cupcake held in the near hand from a
// piping bag in the far one, round and round, the toque bobbing; then sets
// it down and takes up the next. It serves a croissant.

const PC_SKIN = '#f2c4a0';
const PC_SKIN_D = '#d9a07c';
const WHITES = '#fbf7ef';
const WHITES_D = '#ddd2c0';
const CURLS = C.terracotta;
const CURLS_D = '#9e4c2c';
const ICING = '#f2a7b8';
const PC_V = 0.75;
const PC_BONES: Bones = { neck: [0.15, -8.2], shoulders: [[-1.6, -7.6], [1.75, -7.6]], upper: 1.85, fore: 1.75 };

// A croissant, golden and crescent, held by its middle.
const croissant: NpcServe = {
  name: 'croissant',
  drink: false,
  draw(sk) {
    sk.blob((q) => {
      q.moveTo(-1.35, -0.1);
      q.quadraticCurveTo(-1.0, -1.35, 0, -1.4);
      q.quadraticCurveTo(1.0, -1.35, 1.35, -0.1);
      q.quadraticCurveTo(0.9, -0.6, 0, -0.55);
      q.quadraticCurveTo(-0.9, -0.6, -1.35, -0.1);
      q.closePath();
    }, '#d9944a', { dark: '#b06a30', d: 0.25 });
    sk.draw((q, c) => {
      q.strokeStyle = '#a8622e';
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.14, 0.9 / c.px);
      q.beginPath();
      for (const x of [-0.75, -0.25, 0.25, 0.75]) {
        q.moveTo(x * 1.05, -1.25 + Math.abs(x) * 0.35);
        q.lineTo(x * 0.85, -0.6 + Math.abs(x) * 0.1);
      }
      q.stroke();
    });
  },
};

// A cupcake held at the origin: a pink paper case, a golden top and its
// icing piped `ice` of the way (three tiers of a pink swirl), a cherry once
// done.
function cupcake(sk: Sketch, ice: number): void {
  sk.blob((q) => {
    q.moveTo(-0.6, -0.95);
    q.lineTo(0.6, -0.95);
    q.lineTo(0.45, 0);
    q.lineTo(-0.45, 0);
    q.closePath();
  }, '#f6c9d3', { dark: '#dda0b0', d: 0.15 });
  sk.draw((q, c) => {
    q.strokeStyle = '#d98ea2';
    q.lineWidth = Math.max(0.1, 0.7 / c.px);
    q.beginPath();
    for (const x of [-0.3, 0, 0.3]) {
      q.moveTo(x * 1.25, -0.9);
      q.lineTo(x, -0.05);
    }
    q.stroke();
  });
  sk.blob(ell(0, -1.0, 0.7, 0.35), '#d9a35c', { dark: '#b9803e', d: 0.12 });
  const tiers = [[0.68, -1.15], [0.52, -1.45], [0.34, -1.72]] as const;
  tiers.forEach(([r, y], i) => {
    const t = Math.max(0, Math.min(1, ice * 3 - i));
    if (t > 0.05) sk.blob(ell(0, y, r * (0.6 + 0.4 * t), 0.24), ICING, { dark: shade(ICING, -0.18), d: 0.1, line: 0.5 });
  });
  if (ice >= 0.98) sk.blob(circ(0.05, -2.0, 0.2), C.red, { line: 0.4 });
}

// A piping bag from its nozzle at (nx, ny) to the twist at the origin (in
// the far hand): a clear cone full of pink icing, a steel nozzle.
function pipingBag(sk: Sketch, nx: number, ny: number): void {
  const a = Math.atan2(nx, -ny);
  const L = Math.hypot(nx, ny);
  sk.at(turn(a + Math.PI), () => {
    // along +y from the twist to the nozzle
    sk.blob((q) => {
      q.moveTo(-0.85, -0.45);
      q.quadraticCurveTo(0, -0.85, 0.85, -0.45);
      q.lineTo(0.2, L - 0.3);
      q.lineTo(-0.2, L - 0.3);
      q.closePath();
    }, '#f7c6d2', { dark: '#e09aae', d: 0.2 });
    sk.limb([0, -0.55, 0.15, -1.1], 0.32, '#fbf3e6', { line: 0.45 });
    sk.blob((q) => {
      q.moveTo(-0.2, L - 0.35);
      q.lineTo(0.2, L - 0.35);
      q.lineTo(0.06, L);
      q.lineTo(-0.06, L);
      q.closePath();
    }, C.chrome, { line: 0.4 });
  });
}

// The work loop's beats (see pastryChefWork): the icing piped on, then the
// cupcake set down out of sight and a bare one brought up.
const iceOf = (u: number) => ease(u, 0.05, 0.7);
const downOf = (u: number) => ease(u, 0.7, 0.8) - ease(u, 0.86, 0.98);

const pastryChefParts: NpcParts = {
  body(sk) {
    legs(sk, '#4a4442', '#363130', '#2f2a29');
    torso(sk, WHITES, WHITES_D);
    // the double-breasted front: its overlap and two rows of buttons
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = c.ink;
      q.lineWidth = Math.max(c.line * 0.8, 1 / c.px);
      q.beginPath();
      q.moveTo(1.3, -7.6);
      q.quadraticCurveTo(1.55, -5.4, 1.4, -3.1);
      q.stroke();
      q.fillStyle = C.walnut;
      for (const x of [0.15, 1.0]) {
        for (const y of [-6.7, -5.6, -4.5]) {
          q.beginPath();
          q.arc(x + (y + 6.7) * 0.03, y, 0.19, 0, TAU);
          q.fill();
        }
      }
    });
    // the neckerchief, knotted at the throat
    sk.blob((q) => {
      q.moveTo(-0.9, -8.45);
      q.quadraticCurveTo(0.5, -8.0, 1.75, -8.4);
      q.lineTo(1.4, -7.65);
      q.quadraticCurveTo(0.5, -7.35, -0.6, -7.7);
      q.closePath();
    }, C.red, { dark: shade(C.red, -0.25), d: 0.15 });
    sk.blob((q) => {
      q.moveTo(0.35, -7.8);
      q.lineTo(1.25, -7.75);
      q.lineTo(0.95, -6.75);
      q.closePath();
    }, C.red, { dark: shade(C.red, -0.25), d: 0.12, line: 0.5 });
  },
  head(sk, p) {
    const cx = 0.1;
    const cy = -2.95;
    // curls at the nape, under the toque
    sk.blob((q) => {
      q.moveTo(cx - 3.2, cy + 1.2);
      q.quadraticCurveTo(cx - 3.8, cy - 1.4, cx - 2.2, cy - 2.4);
      q.lineTo(cx + 1.0, cy - 2.2);
      q.lineTo(cx - 1.4, cy + 1.4);
      q.closePath();
    }, CURLS, { dark: CURLS_D, d: 0.3 });
    sk.blob(ell(cx, cy, 3.2, 3.05), PC_SKIN, { dark: PC_SKIN_D, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(cx - 3.25, cy + 0.6);
      q.quadraticCurveTo(cx - 3.5, cy - 2.4, cx - 1.0, cy - 2.6);
      q.quadraticCurveTo(cx - 0.3, cy - 1.6, cx - 1.15, cy - 1.0);
      q.quadraticCurveTo(cx - 1.7, cy - 0.2, cx - 2.0, cy + 0.9);
      q.quadraticCurveTo(cx - 2.6, cy + 1.6, cx - 3.25, cy + 0.6);
      q.closePath();
    }, CURLS, { dark: CURLS_D, d: 0.25 });
    sk.blob((q) => {
      q.moveTo(cx + 1.4, cy - 2.4);
      q.quadraticCurveTo(cx + 2.9, cy - 2.2, cx + 3.15, cy - 0.8);
      q.quadraticCurveTo(cx + 2.4, cy - 1.6, cx + 1.4, cy - 1.65);
      q.closePath();
    }, CURLS, { dark: CURLS_D, d: 0.15, line: 0.5 });
    sk.blob(ell(cx - 1.7, cy + 0.45, 0.5, 0.68), PC_SKIN, { dark: PC_SKIN_D, d: 0.2, line: 0.5 });
    // the toque: a band round the brow, a tall pleated puff over it,
    // billowing out wider than the band
    sk.blob((q) => {
      q.moveTo(cx - 2.6, cy - 2.2);
      q.quadraticCurveTo(cx - 3.75, cy - 3.0, cx - 3.4, cy - 4.2);
      q.quadraticCurveTo(cx - 3.1, cy - 4.9, cx - 1.9, cy - 4.8);
      q.quadraticCurveTo(cx - 1.0, cy - 5.15, cx, cy - 4.88);
      q.quadraticCurveTo(cx + 1.0, cy - 5.2, cx + 1.95, cy - 4.85);
      q.quadraticCurveTo(cx + 3.3, cy - 4.9, cx + 3.65, cy - 4.0);
      q.quadraticCurveTo(cx + 3.95, cy - 2.9, cx + 2.8, cy - 2.25);
      q.closePath();
    }, WHITES, { dark: WHITES_D, d: 0.45 });
    sk.draw((q, c) => {
      q.strokeStyle = WHITES_D;
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.14, 0.9 / c.px);
      q.beginPath();
      for (const x of [-2.2, -1.0, 0.1, 1.2, 2.3]) {
        q.moveTo(cx + x * 0.9, cy - 2.6);
        q.quadraticCurveTo(cx + x * 1.05, cy - 3.7, cx + x, cy - 4.75);
      }
      q.stroke();
    });
    sk.blob((q) => {
      q.moveTo(cx - 3.1, cy - 1.55);
      q.quadraticCurveTo(cx, cy - 2.25, cx + 3.15, cy - 1.75);
      q.lineTo(cx + 3.05, cy - 2.65);
      q.quadraticCurveTo(cx, cy - 3.1, cx - 3.0, cy - 2.4);
      q.closePath();
    }, WHITES, { dark: WHITES_D, d: 0.2 });
    face(sk, { x: cx + 0.7, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, drop: 1.3 });
    sk.draw((q) => {
      q.fillStyle = '#ff7f8a70';
      for (const [x, r] of [[cx - 0.5, 0.5], [cx + 2.25, 0.42]] as const) {
        q.beginPath();
        q.ellipse(x, cy + 1.5, r, r * 0.6, 0, 0, TAU);
        q.fill();
      }
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, PC_BONES.upper], 1.25, k ? WHITES_D : WHITES, { dark: k ? null : WHITES_D });
  },
  fore(sk, p, k) {
    const f = PC_BONES.fore;
    sk.limb([0, 0, 0, f - 0.45], 1.1, k ? WHITES_D : WHITES, { dark: k ? null : WHITES_D });
    atHand(sk, p, k, PC_BONES.fore, () => {
      if (p.act !== 'work') return;
      const ice = iceOf(p.u);
      if (k === 0) cupcake(sk, downOf(p.u) > 0.5 && p.u < 0.9 ? 1 : p.u >= 0.9 ? 0 : ice);
      if (k === 1) {
        // the bag's nozzle over the cupcake in the other hand
        const [hx, hy] = handOf(PC_BONES, p, 0);
        const [nx, ny] = fromHand(PC_BONES, p, 1, hx + 0.05, hy - 1.15 - 0.75 * ice - 0.25);
        pipingBag(sk, nx, ny);
      }
    });
    sk.blob(circ(0, f, 0.6), k ? PC_SKIN_D : PC_SKIN, { dark: PC_SKIN_D, d: 0.2 });
  },
};

// Icing a cupcake: the near hand holds it up over the counter, the far
// hand pipes round and round over it, the toque bobbing; then the cupcake
// goes down onto the counter and a bare one comes up (the swap made out of
// sight, behind the counter, so the loop joins up unseen).
const pastryChefWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const ice = iceOf(u);
    const down = downOf(u);
    const round = u * TAU * 3;
    const near = reach(PC_BONES, 0, 1.45 - 0.3 * down, -6.45 + 1.6 * down);
    const far = reach(PC_BONES, 1, 3.85 + 0.25 * Math.cos(round) * (1 - down), -8.6 - 0.6 * ice + 0.2 * Math.sin(round) + 2.5 * down);
    return {
      ...rest(),
      bob: 0.14 * Math.abs(Math.sin(round)),
      lean: 0.04,
      tilt: 0.04 + 0.06 * Math.sin(round),
      arms: [near, far],
      eyes: down > 0.5 ? 'happy' : 'open',
      mouth: ice > 0.4 && ice < 0.9 ? 'o' : 'smile',
    };
  },
};

const pastryChef: Npc = {
  name: 'pastryChef',
  station: 'search',
  // behind the counter's open end, just past the case, turned along it
  place: { mode: 'behind', u: OPEN.at, v: PC_V, top: OPEN.top, edge: OPEN.edge, look: 'along' },
  tall: 16,
  bones: PC_BONES,
  parts: pastryChefParts,
  work: pastryChefWork,
  serve: croissant,
};

// ── the regular ──────────────────────────────────────────────────────────
// In the wingback, its slippered feet up on the pouf: an old gent, bald
// with white tufts and a white moustache, round gold spectacles, a tweed
// jacket and a red bow tie. At work it reads the paper (lines and blocks,
// no print), turns a page and takes a sip of tea; it celebrates lowering
// the paper with a little clap.

const RG_SKIN = '#ecbe9c';
const RG_SKIN_D = '#cf9b78';
const TUFT = '#f1ece2';
const TUFT_D = '#cfc7b8';
const TWEED = '#8b6b4f';
const TWEED_D = '#6c513b';
const SLACKS = '#6b6560';
const SLACKS_D = '#504b47';
const PAPER = '#f4ecd8';
const PAPER_D = '#d9ccb0';

// Sitting: its hips on the cushion a unit over its frame (see SEAT).
const RG_BONES: Bones = { neck: [0.1, -5.5], shoulders: [[-1.5, -4.95], [1.65, -4.95]], upper: 1.6, fore: 1.55 };

// Where its feet rest: on the pouf (see think in ./stations.ts), in its
// frame.
const POUF = { x: 2.2, y: 2.5 };

// Where the open paper is held, in the body's frame: from the near hand's
// edge to the far hand's, from under the chin down over the lap (folded at
// `fold` while one hand holds it).
const PAPER_AT = { x0: 0.45, x1: 4.15, fold: 2.25, y0: -4.9, y1: -1.35 };

// An open newspaper between the near hand (left edge) and the far one
// (right edge), in the body's frame, from y0 down to y1: column rules, a
// grey block for a picture, a heavy bar for a headline (no letters);
// `page` swings a page over from the right half to the left (0 to 1).
function newspaper(sk: Sketch, x0: number, x1: number, y0: number, y1: number, page: number): void {
  const mid = (x0 + x1) / 2;
  const half = (a: number, b: number, side: number) => {
    sk.blob((q) => {
      q.moveTo(a, y0 + 0.15);
      q.lineTo(b, y0 - 0.1 * side);
      q.lineTo(b, y1 - 0.1 * side);
      q.lineTo(a, y1 + 0.15);
      q.closePath();
    }, PAPER, { dark: PAPER_D, d: 0.2 });
    sk.draw((q, c) => {
      const lo = Math.min(a, b) + 0.25;
      const hi = Math.max(a, b) - 0.25;
      if (hi - lo < 0.4) return;
      q.strokeStyle = '#7a6e60';
      q.lineCap = 'butt';
      q.lineWidth = Math.max(0.16, 0.9 / c.px);
      q.beginPath();
      q.moveTo(lo, y0 + 0.5);
      q.lineTo(hi, y0 + 0.5);
      q.stroke();
      q.lineWidth = Math.max(0.08, 0.6 / c.px);
      q.beginPath();
      for (let y = y0 + 1.0; y < y1 - 0.3; y += 0.42) {
        q.moveTo(lo, y);
        q.lineTo(hi, y);
      }
      q.stroke();
      if (side > 0) {
        q.fillStyle = '#a89b88';
        q.fillRect(lo, y0 + 0.95, (hi - lo) * 0.55, 1.1);
      }
    });
  };
  half(x0, mid, -1);
  half(mid, x1, 1);
  if (page > 0.02 && page < 0.98) {
    const x = mid + (x1 - mid) * Math.cos(page * Math.PI);
    half(mid, x, x > mid ? 1 : -1);
  }
}

// A teacup on its saucer at the hand.
function teacup(sk: Sketch): void {
  sk.blob(ell(0, -0.05, 0.85, 0.22), '#f6f1e6', { dark: '#d8cfbf', d: 0.1, line: 0.5 });
  sk.blob((q) => {
    q.moveTo(-0.6, -0.9);
    q.lineTo(0.6, -0.9);
    q.quadraticCurveTo(0.55, -0.1, 0, -0.1);
    q.quadraticCurveTo(-0.55, -0.1, -0.6, -0.9);
    q.closePath();
  }, '#f6f1e6', { dark: '#d8cfbf', d: 0.15 });
  sk.draw((q, c) => {
    q.strokeStyle = C.sage;
    q.lineWidth = Math.max(0.14, 0.9 / c.px);
    q.beginPath();
    q.moveTo(-0.55, -0.7);
    q.lineTo(0.55, -0.7);
    q.stroke();
  });
  sk.limb([0.58, -0.75, 0.9, -0.6, 0.6, -0.35], 0.14, '#f6f1e6', { line: 0.4 });
}

// The work loop's beats (see regularWork): a page turned; the tea sipped
// (the near hand off the paper, up over three frames and down over three);
// a glance up over it.
const pageOf = (u: number) => ease(u, 0.22, 0.42);
const sipOf = (u: number) => ease(u, 0.5, 0.75) - ease(u, 0.78, 1);

const regularParts: NpcParts = {
  body(sk, p) {
    // the legs out on the pouf, ankles crossed, in carpet slippers; the
    // far one first
    for (const [dx, near] of [[0.5, false], [0, true]] as const) {
      const fx = POUF.x + dx;
      sk.limb([-0.2, -1.05, 1.7, -0.75, fx - 0.35, POUF.y - 0.55], 1.25, near ? SLACKS : SLACKS_D, { dark: near ? SLACKS_D : null });
      sk.blob((q) => q.ellipse(fx + 0.1, POUF.y - 0.3, 0.85, 0.48, -0.25, 0, TAU), near ? C.oxblood : shade(C.oxblood, -0.15), { dark: shade(C.oxblood, -0.3), d: 0.15 });
    }
    // the tweed jacket over a cream shirt, the bow tie at its collar
    sk.blob((q) => {
      q.moveTo(-1.8, -5.0);
      q.quadraticCurveTo(0.1, -5.55, 2.0, -5.0);
      q.lineTo(2.3, -0.8);
      q.quadraticCurveTo(0.15, -0.4, -2.0, -0.85);
      q.closePath();
    }, TWEED, { dark: TWEED_D, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(0.05, -5.3);
      q.lineTo(1.35, -5.3);
      q.lineTo(0.75, -3.4);
      q.closePath();
    }, C.cream, { line: 0.5 });
    sk.draw((q, c) => {
      q.strokeStyle = TWEED_D;
      q.lineWidth = Math.max(0.1, 0.6 / c.px);
      q.beginPath();
      for (let y = -4.4; y < -1; y += 0.7) {
        q.moveTo(-1.7, y);
        q.lineTo(2.1, y + 0.1);
      }
      q.stroke();
    });
    sk.blob((q) => {
      q.moveTo(0.7, -5.05);
      q.lineTo(0.05, -5.4);
      q.lineTo(0.1, -4.7);
      q.closePath();
      q.moveTo(0.7, -5.05);
      q.lineTo(1.4, -5.4);
      q.lineTo(1.35, -4.7);
      q.closePath();
    }, C.red, { dark: shade(C.red, -0.25), d: 0.12, line: 0.5 });
    // in a cheer, the paper folded on its lap
    if (p.act === 'celebrate') sk.blob((q) => q.roundRect(0.4, -1.55, 2.6, 0.75, 0.15), PAPER, { dark: PAPER_D, d: 0.15 });
  },
  head(sk, p) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.15, 3.0), RG_SKIN, { dark: RG_SKIN_D, d: 0.45 });
    // white tufts over the ears, the crown bald and shining
    sk.blob((q) => {
      q.moveTo(cx - 3.3, cy + 0.9);
      q.quadraticCurveTo(cx - 3.75, cy - 1.0, cx - 2.6, cy - 1.75);
      q.quadraticCurveTo(cx - 2.3, cy - 0.8, cx - 1.4, cy - 0.55);
      q.quadraticCurveTo(cx - 1.8, cy + 0.5, cx - 2.2, cy + 1.3);
      q.closePath();
    }, TUFT, { dark: TUFT_D, d: 0.2 });
    sk.blob((q) => {
      q.moveTo(cx + 2.4, cy - 1.7);
      q.quadraticCurveTo(cx + 3.45, cy - 1.3, cx + 3.25, cy - 0.2);
      q.quadraticCurveTo(cx + 2.9, cy - 0.8, cx + 2.5, cy - 0.85);
      q.closePath();
    }, TUFT, { dark: TUFT_D, d: 0.15, line: 0.5 });
    sk.draw((q, c) => {
      q.strokeStyle = '#fff6ec';
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.24, 1.2 / c.px);
      q.beginPath();
      q.arc(cx - 0.6, cy - 1.0, 1.75, -2.4, -1.75);
      q.stroke();
    });
    sk.blob(ell(cx - 1.65, cy + 0.45, 0.5, 0.7), RG_SKIN, { dark: RG_SKIN_D, d: 0.2, line: 0.5 });
    face(sk, { x: cx + 0.75, y: cy + 0.35, eyes: p.eyes, mouth: p.mouth, drop: 1.75, r: 0.42 });
    // a white moustache and round gold spectacles
    sk.blob((q) => {
      const mx = cx + 0.8;
      const my = cy + 1.45;
      q.moveTo(mx - 1.15, my + 0.35);
      q.quadraticCurveTo(mx - 0.9, my - 0.25, mx, my - 0.15);
      q.quadraticCurveTo(mx + 0.9, my - 0.25, mx + 1.15, my + 0.35);
      q.quadraticCurveTo(mx + 0.5, my + 0.2, mx, my + 0.35);
      q.quadraticCurveTo(mx - 0.5, my + 0.2, mx - 1.15, my + 0.35);
      q.closePath();
    }, TUFT, { dark: TUFT_D, d: 0.1, line: 0.5, sil: false });
    sk.draw((q, c) => {
      q.strokeStyle = C.brass;
      q.lineWidth = Math.max(0.16, 1 / c.px);
      q.beginPath();
      q.arc(cx + 0.75 - 1.15, cy + 0.35, 0.72, 0, TAU);
      q.moveTo(cx + 0.75 + 1.15 + 0.62, cy + 0.35);
      q.arc(cx + 0.75 + 1.15, cy + 0.35, 0.62, 0, TAU);
      q.moveTo(cx + 0.75 - 0.43, cy + 0.2);
      q.quadraticCurveTo(cx + 0.75, cy - 0.05, cx + 0.75 + 0.53, cy + 0.2);
      q.moveTo(cx + 0.75 - 1.87, cy + 0.3);
      q.lineTo(cx - 1.35, cy + 0.15);
      q.stroke();
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, RG_BONES.upper], 1.15, k ? TWEED_D : TWEED, { dark: k ? null : TWEED_D });
  },
  fore(sk, p, k) {
    const f = RG_BONES.fore;
    sk.limb([0, 0, 0, f - 0.4], 1.05, k ? TWEED_D : TWEED, { dark: k ? null : TWEED_D });
    atHand(sk, p, k, RG_BONES.fore, () => {
      if (p.act !== 'work' || k !== 0) return;
      // the paper, held open from the near hand's edge to the far hand's
      // (by the far hand alone, folded, over a sip): the forearms behind
      // it, under the near hand's fingers and below the chin
      const sip = sipOf(p.u);
      const [x0, y0] = fromHand(RG_BONES, p, 0, mix(PAPER_AT.x0, PAPER_AT.fold, ease(sip, 0, 0.3)), PAPER_AT.y0);
      const [x1, y1] = fromHand(RG_BONES, p, 0, PAPER_AT.x1, PAPER_AT.y1);
      newspaper(sk, x0, x1, y0, y1, pageOf(p.u));
      if (sip > 0.3) teacup(sk);
    });
    sk.blob(circ(0, f, 0.55), k ? RG_SKIN_D : RG_SKIN, { dark: RG_SKIN_D, d: 0.2 });
  },
};

// Reading: the paper held open, the eyes along its lines and a blink; a
// page turned with the far hand; the near hand off it for a sip of tea,
// eyes shut; and back to the paper.
const regularWork: NpcLoop = {
  secs: 3.6,
  frames: 12,
  pose(u) {
    const page = bump(u, 0.2, 0.45);
    const sip = sipOf(u);
    const near = reach(RG_BONES, 0, mix(0.8, 1.45, sip), mix(-3.3, -4.35, sip));
    const far = reach(RG_BONES, 1, 3.75 - 0.7 * page, -3.55 - 0.7 * page);
    const i = Math.round(u * 12) % 12;
    return {
      ...rest(),
      lean: -0.04,
      tilt: 0.1 - 0.06 * sip + 0.03 * Math.sin(u * TAU),
      arms: [near, far],
      eyes: sip > 0.5 ? 'shut' : i === 2 ? 'blink' : 'open',
      mouth: sip > 0.5 ? 'o' : page > 0.5 ? 'open' : 'closed',
    };
  },
};

// The paper lowered to its lap, a little clap, a beam.
const regularCelebrate: NpcLoop = {
  secs: 1.6,
  frames: 8,
  pose(u) {
    const k = env(u, 0.2, 0.85);
    const clap = 0.5 + 0.5 * Math.sin(u * TAU * 3);
    const near = toward(k, reach(RG_BONES, 0, 1.0 + 0.1 * clap, -3.6));
    const far = toward(k, reach(RG_BONES, 1, 2.4 - 0.5 * clap, -3.7));
    return { ...rest(), tilt: -0.06 * k, arms: [near, far], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

const regular: Npc = {
  name: 'regular',
  station: 'think',
  // in the wingback, its feet up on the pouf
  place: { mode: 'seated', u: SEAT.u, v: SEAT.v, z: SEAT.z - 1 },
  tall: 12,
  bones: RG_BONES,
  parts: regularParts,
  work: regularWork,
  celebrate: regularCelebrate,
};

export const NPCS: readonly Npc[] = [barista, pastryChef, regular];
