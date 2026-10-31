import { shade } from '../../art/iso.ts';
import { bump, ease, env, own, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, inFrame, seen } from '../../art/npc/helpers.ts';
import { move, mul, turn, zoom, type Sketch } from '../../art/figure/paint.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcPlace, NpcServe, Puppet } from '../types.ts';
import { C, withAlpha } from './kit.ts';
import { FISH_STOOL, FLOAT, RADIO_STOOL, STOVE } from './stations.ts';

// Snowy Depths' locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the depths' night-navy ink: the camp cook past
// the stove's far end, stirring a pot of cocoa; an old ice fisher on the
// stool by the hole; the radio operator on the log before the set, its
// back to us, headphones on.

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// A soft round glow (steam's sheen, a lamp's light), r units across.
function glowDot(sk: Sketch, x: number, y: number, r: number, a: number, color: string): void {
  if (a <= 0.02) return;
  sk.draw((q) => {
    const g = q.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(color, Math.min(1, a)));
    g.addColorStop(1, withAlpha(color, 0));
    q.fillStyle = g;
    q.beginPath();
    q.arc(x, y, r, 0, TAU);
    q.fill();
  });
}

// ── the cook ─────────────────────────────────────────────────────────────
// A round camp cook: a tall white toque, rosy cheeks, a bushy moustache, a
// red neckerchief, a teal knit sweater under a white apron with a cocoa
// stain and a towel at the waist. At work it stirs the pot of cocoa on the
// stove with a long ladle in its far hand, its near fist on its hip, then
// lifts the ladle for a taste and nods; it hands over a mug of cocoa.

const SKIN = '#f0c09a';
const SKIN_D = '#cf9a74';
const CHEEK = '#ee8f86';
const TACHE = '#7a4a2c';
const TACHE_D = '#5c3520';
const SWEATER = C.teal;
const SWEATER_D = '#2c6166';
const APRON = '#f3ede2';
const APRON_D = '#cfc5b2';
const TOQUE = '#fbf8f2';
const TOQUE_D = '#d6d0c4';
const TROUSERS = '#4d5368';
const TROUSERS_D = '#383d4f';
const BOOT = C.woodDeep;
const LADLE = C.tin;
const LADLE_D = '#8a95a3';

// Its body is drawn at 95% (see cookParts) so the toque keeps within its
// height; its bones are where the smaller body puts them.
const COOK_BONES: Bones = { neck: [0.14, -7.45], shoulders: [[-1.85, -6.85], [1.95, -6.85]], upper: 1.6, fore: 1.5 };

// Felt boots with a fur cuff, standing at x.
function boots(sk: Sketch, x: number, near: boolean, y = 0): void {
  sk.blob((q) => q.roundRect(x - 0.65, y - 1.25, 1.85, 1.25, 0.5), near ? BOOT : shade(BOOT, -0.15), { dark: shade(BOOT, -0.3), d: 0.2 });
  sk.blob((q) => q.roundRect(x - 0.7, y - 1.55, 1.45, 0.55, 0.25), C.furWhite, { dark: C.furGrey, d: 0.12 });
}

const cookParts: NpcParts = {
  body(sk, _p, back) {
    sk.at(zoom(0.95), () => cookBody(sk, back));
  },
  head(sk, p, back) {
    cookHead(sk, p, back);
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, COOK_BONES.upper], 1.3, k ? SWEATER_D : SWEATER, { dark: k ? null : SWEATER_D });
  },
  fore(sk, p, k) {
    cookFore(sk, p, k);
  },
};

function cookBody(sk: Sketch, back: boolean): void {
  for (const [x, near] of [[1.05, false], [-0.8, true]] as const) {
    sk.limb([x, -3.4, x + 0.05, -1.3], 1.4, near ? TROUSERS : TROUSERS_D, { dark: near ? TROUSERS_D : null });
    boots(sk, x, near);
  }
  // the sweater over a round belly
  sk.blob((q) => {
    q.moveTo(-2.05, -7.55);
    q.quadraticCurveTo(0.15, -8.15, 2.3, -7.55);
    q.quadraticCurveTo(3.35, -5.6, 2.75, -3.1);
    q.quadraticCurveTo(0.3, -2.45, -2.1, -3.1);
    q.quadraticCurveTo(-2.55, -5.4, -2.05, -7.55);
    q.closePath();
  }, SWEATER, { dark: SWEATER_D, d: 0.55 });
  sk.limb([-2.0, -3.25, 0.3, -2.95, 2.65, -3.25], 0.4, SWEATER_D, { line: 0.5 });
  if (back) {
    sk.limb([-1.9, -6.8, 2.1, -4.4], 0.3, APRON_D, { line: 0.4 });
    sk.limb([2.1, -6.8, -1.9, -4.4], 0.3, APRON_D, { line: 0.4 });
    sk.limb([-2.1, -4.6, 2.5, -4.6], 0.35, APRON, { dark: APRON_D, line: 0.5 });
    return;
  }
  // the apron, a cocoa stain on it, a striped towel tucked at the waist
  sk.blob((q) => {
    q.moveTo(-0.6, -7.35);
    q.lineTo(1.75, -7.35);
    q.lineTo(1.95, -5.2);
    q.quadraticCurveTo(3.1, -4.6, 3.0, -2.6);
    q.lineTo(2.85, -1.7);
    q.quadraticCurveTo(0.6, -1.3, -1.55, -1.75);
    q.lineTo(-1.6, -3.0);
    q.quadraticCurveTo(-1.5, -4.7, -0.75, -5.2);
    q.closePath();
  }, APRON, { dark: APRON_D, d: 0.45 });
  sk.blob(ell(1.3, -3.4, 0.42, 0.3, 0.3), withAlpha(C.cocoa, 0.75), { line: 0, sil: false });
  sk.blob(circ(1.85, -3.0, 0.14), withAlpha(C.cocoa, 0.75), { line: 0, sil: false });
  sk.limb([-1.85, -5.05, 2.75, -5.0], 0.32, APRON_D, { line: 0.5 });
  sk.blob((q) => {
    q.moveTo(-1.3, -5.15);
    q.lineTo(-0.35, -5.15);
    q.lineTo(-0.25, -3.1);
    q.lineTo(-1.35, -3.2);
    q.closePath();
  }, '#f6efe4', { dark: APRON_D, d: 0.15, line: 0.5 });
  sk.draw((q, c) => {
    q.strokeStyle = C.wool;
    q.lineWidth = Math.max(0.15, 1.1 / c.px);
    q.beginPath();
    for (const y of [-4.6, -3.7]) {
      q.moveTo(-1.28, y);
      q.lineTo(-0.3, y - 0.03);
    }
    q.stroke();
  });
  // the neckerchief, knotted at the front
  sk.blob((q) => {
    q.moveTo(-1.4, -7.75);
    q.quadraticCurveTo(0.3, -7.0, 1.95, -7.75);
    q.lineTo(1.6, -7.15);
    q.quadraticCurveTo(0.3, -6.6, -1.1, -7.15);
    q.closePath();
  }, C.wool, { dark: C.woolDark, d: 0.15 });
  sk.blob((q) => {
    q.moveTo(0.45, -7.1);
    q.lineTo(1.25, -7.1);
    q.lineTo(0.95, -6.05);
    q.closePath();
  }, C.wool, { dark: C.woolDark, d: 0.1, line: 0.5 });
}

function cookHead(sk: Sketch, p: Puppet, back: boolean): void {
  const cx = 0.1;
  const cy = -2.95;
  sk.blob(ell(cx, cy, 3.35, 3.15), SKIN, { dark: SKIN_D, d: 0.45 });
  if (!back) {
    sk.blob(ell(cx - 1.0, cy + 1.05, 0.65, 0.42), CHEEK, { line: 0, sil: false });
    sk.blob(ell(cx + 2.35, cy + 1.0, 0.45, 0.36), CHEEK, { line: 0, sil: false });
    face(sk, { x: cx + 0.55, y: cy + 0.05, eyes: p.eyes, mouth: p.mouth, gap: 2.3, drop: 2.2 });
    // a round nose and a moustache curling up at its ends
    sk.blob((q) => {
      q.moveTo(cx - 1.2, cy + 1.7);
      q.quadraticCurveTo(cx - 1.4, cy + 0.95, cx - 0.55, cy + 1.25);
      q.quadraticCurveTo(cx + 0.55, cy + 1.2, cx + 0.65, cy + 1.45);
      q.quadraticCurveTo(cx + 0.75, cy + 1.2, cx + 1.8, cy + 1.25);
      q.quadraticCurveTo(cx + 2.6, cy + 0.95, cx + 2.45, cy + 1.75);
      q.quadraticCurveTo(cx + 1.6, cy + 2.15, cx + 0.65, cy + 1.85);
      q.quadraticCurveTo(cx - 0.3, cy + 2.15, cx - 1.2, cy + 1.7);
      q.closePath();
    }, TACHE, { dark: TACHE_D, d: 0.15, line: 0.55 });
    sk.blob(ell(cx + 0.7, cy + 0.85, 0.55, 0.45), '#f2a48a', { dark: SKIN_D, d: 0.15, line: 0.5 });
    for (const dx of [-1.15, 1.15]) sk.limb([cx + 0.0 + dx, cy - 0.75, cx + 0.55 + dx, cy - 1.1, cx + 1.1 + dx, cy - 0.8], 0.32, TACHE, { line: 0.4, sil: false });
  } else {
    sk.blob((q) => {
      q.moveTo(cx - 3.2, cy - 0.3);
      q.quadraticCurveTo(cx, cy + 0.8, cx + 3.2, cy - 0.3);
      q.lineTo(cx + 3.3, cy - 1.0);
      q.quadraticCurveTo(cx, cy, cx - 3.3, cy - 1.0);
      q.closePath();
    }, TACHE, { dark: TACHE_D, d: 0.1, line: 0.4 });
  }
  // the toque: a band round the head, a puffed top in pleats
  const by = cy - 1.55;
  sk.blob((q) => {
    q.moveTo(cx - 2.75, by - 1.9);
    q.quadraticCurveTo(cx - 3.9, by - 3.35, cx - 2.0, by - 3.7);
    q.quadraticCurveTo(cx - 1.4, by - 4.55, cx + 0.3, by - 4.1);
    q.quadraticCurveTo(cx + 1.9, by - 4.5, cx + 2.6, by - 3.5);
    q.quadraticCurveTo(cx + 4.0, by - 3.1, cx + 2.9, by - 1.9);
    q.closePath();
  }, TOQUE, { dark: TOQUE_D, d: 0.5 });
  sk.draw((q, c) => {
    q.strokeStyle = withAlpha(TOQUE_D, 0.9);
    q.lineWidth = Math.max(0.12, 0.7 / c.px);
    q.beginPath();
    for (const dx of [-1.3, 0.25, 1.6]) {
      q.moveTo(cx + dx, by - 2.0);
      q.quadraticCurveTo(cx + dx * 1.15, by - 2.9, cx + dx * 0.9, by - 3.6);
    }
    q.stroke();
  });
  sk.blob((q) => {
    q.moveTo(cx - 3.0, by - 0.1);
    q.quadraticCurveTo(cx + 0.1, by + 0.55, cx + 3.15, by - 0.1);
    q.lineTo(cx + 3.0, by - 2.05);
    q.quadraticCurveTo(cx + 0.1, by - 1.55, cx - 2.85, by - 2.05);
    q.closePath();
  }, TOQUE, { dark: TOQUE_D, d: 0.35 });
}

function cookFore(sk: Sketch, p: Puppet, k: 0 | 1): void {
  const f = COOK_BONES.fore;
  sk.limb([0, 0, 0, f - 0.5], 1.2, k ? SWEATER_D : SWEATER, { dark: k ? null : SWEATER_D });
  sk.limb([-0.5, f - 0.55, 0.5, f - 0.55], 0.42, k ? SWEATER_D : shade(SWEATER, 0.12), { line: 0.5 });
  sk.blob(circ(0, f, 0.62), k ? SKIN_D : SKIN, { dark: SKIN_D, d: 0.2 });
  if (k === 1 && (p.act === 'work' || p.act === 'celebrate')) {
    // the ladle in the far hand: upright down into the pot while
    // stirring, turned back to the lips for a taste, held up high in a
    // cheer
    const work = p.act === 'work' ? 1 : 0;
    const taste = work * cookTaste(p.u);
    const high = p.act === 'celebrate' ? env(p.u, 0.2, 0.8) : 0;
    const tip = work * (-0.15 - 0.95 * taste) + (1 - work) * (0.3 + (Math.PI - 0.5) * high);
    const grip = 1.0 + 0.9 * taste;
    atHand(sk, p, 1, f, () => {
      sk.at(turn(-tip), () => {
        sk.limb([0, -grip, 0, 3.6 - grip], 0.26, LADLE, { dark: LADLE_D });
        sk.blob((q) => {
          q.moveTo(-0.7, 3.5 - grip);
          q.lineTo(0.7, 3.5 - grip);
          q.quadraticCurveTo(0.7, 4.6 - grip, 0, 4.6 - grip);
          q.quadraticCurveTo(-0.7, 4.6 - grip, -0.7, 3.5 - grip);
          q.closePath();
        }, LADLE, { dark: LADLE_D, d: 0.2 });
      });
      sk.blob(circ(0, 0, 0.62), SKIN_D, { dark: SKIN_D, d: 0.2 });
    });
  }
}

// How far the cook has the ladle up at his lips, at u round his work:
// lifted out of the pot over three frames, a taste and a nod, lowered back
// into it over three.
const cookTaste = (u: number): number => ease(u, 0.5, 0.75) - ease(u, 0.78, 1);

// At the stove: two rounds of the ladle in the pot, the near fist on the
// hip, then the ladle up to the lips, a happy taste, a nod.
const cookWork: NpcLoop = {
  secs: 2.4,
  pose(u) {
    const taste = cookTaste(u);
    const stir = 1 - taste;
    const a = Math.min(1, u / 0.5) * TAU * 2;
    return {
      ...rest(),
      bob: 0.05 * Math.sin(a) * stir,
      lean: 0.08 * stir - 0.04 * taste,
      tilt: 0.12 * stir + 0.18 * bump(u, 0.75, 0.95),
      arms: [
        { sh: -0.5, el: 1.8 },
        { sh: 0.8 + 0.12 * Math.sin(a) * stir + 1.5 * taste, el: 1.3 + 0.15 * Math.cos(a) * stir },
      ],
      eyes: taste > 0.6 ? 'happy' : 'open',
      mouth: taste > 0.6 ? 'o' : 'smile',
    };
  },
};

// A cheer: both arms up and out, the ladle up high like a toast in the far
// hand (up in front of him), the near hand up behind his head, clear of
// his face; a laugh and a bounce; from rest and back.
const cookCelebrate: NpcLoop = {
  secs: 1.6,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const laugh = Math.abs(Math.sin(u * TAU * 2));
    return {
      ...rest(),
      bob: 0.25 * laugh * k,
      lean: -0.06 * k,
      tilt: -0.12 * k,
      arms: [swing(-(1.8 + 0.15 * laugh) * k, -0.9 * k), swing(1.75 * k, 0.6 * k)],
      eyes: k > 0.4 ? 'happy' : 'open',
      mouth: k > 0.4 ? 'open' : 'smile',
    };
  },
};

// A mug of cocoa: white enamel with a blue rim, a marshmallow afloat,
// steam curling off it.
const cocoa: NpcServe = {
  name: 'cocoa',
  drink: true,
  draw(sk) {
    sk.limb([0.85, -0.35, 1.45, -0.1, 1.4, 0.45, 0.85, 0.6], 0.24, C.mug, { dark: shade(C.mug, -0.2), line: 0.5 });
    sk.blob((q) => q.roundRect(-0.9, -0.75, 1.8, 1.75, 0.3), C.mug, { dark: shade(C.mug, -0.18), d: 0.25 });
    sk.blob(ell(0, -0.75, 0.9, 0.24), C.navy, { line: 0.5 });
    sk.blob(ell(0, -0.72, 0.7, 0.16), C.cocoa, { line: 0 });
    sk.blob((q) => q.roundRect(-0.15, -1.05, 0.55, 0.42, 0.12), '#fbf6ee', { dark: '#e6dccb', d: 0.06, line: 0.45 });
    sk.limb([-0.3, -1.2, -0.05, -1.75, -0.35, -2.4], 0.16, withAlpha('#ffffff', 0.8), { line: 0, sil: false });
  },
};

const cook: Npc = {
  name: 'cook',
  station: 'run',
  // past the stove's far end, turned along to the pot on its top
  place: { mode: 'standing', u: -1.5, v: STOVE.v + 0.8, look: 'along' },
  tall: 16,
  bones: COOK_BONES,
  parts: cookParts,
  work: cookWork,
  celebrate: cookCelebrate,
  serve: cocoa,
};

// ── the fisher ───────────────────────────────────────────────────────────
// An old ice fisher on the stool by the hole: a fur trapper's hat with its
// flaps down, a big grey beard and a red nose, a mustard buffalo-check
// coat with a fur collar, red mittens, felt boots. At work it jigs a short
// rod over the hole, its line down to the float; its show is the big
// catch: a bite, a tug of war, the rod bent hard, then a great fish
// pulled out and shown off.

const F_SKIN = '#e8b08a';
const F_SKIN_D = '#c78a66';
const BEARD = '#dcd8d0';
const BEARD_D = '#aca69c';
const COAT = C.mustard;
const COAT_D = '#b0832c';
const CHECK = '#7a4f1e';
const HAT = '#8b5a36';
const HAT_D = '#6a4126';
const MITT = C.wool;
const MITT_D = C.woolDark;
const ROD = '#d9583a';
const FISH_BACK = '#5d7f86';
const FISH_BELLY = '#ee8c5e';

const FISH_BONES: Bones = { neck: [0.2, -5.7], shoulders: [[-1.7, -5.1], [1.95, -5.1]], upper: 1.6, fore: 1.5 };
const FISH_PLACE: NpcPlace = { mode: 'seated', u: FISH_STOOL.u, v: FISH_STOOL.v, z: FISH_STOOL.top - 1, look: 'along' };
// Where the float rides, in the fisher's frame.
const BOB = seen(FISH_PLACE, FLOAT);

// Buffalo checks over a shape just painted: dark bands both ways, clipped
// to it.
function checks(sk: Sketch, shape: (p: Pen) => void, x0: number, y0: number, x1: number, y1: number, step = 1.1): void {
  sk.draw((q) => {
    q.save();
    q.beginPath();
    shape(q);
    q.clip();
    q.fillStyle = withAlpha(CHECK, 0.45);
    for (let x = x0; x < x1; x += step) q.fillRect(x, y0, step / 2, y1 - y0);
    for (let y = y0; y < y1; y += step) q.fillRect(x0, y, x1 - x0, step / 2);
    q.restore();
  });
}

const coatShape = (q: Pen) => {
  q.moveTo(-1.9, -5.45);
  q.quadraticCurveTo(0.2, -6.05, 2.25, -5.45);
  q.quadraticCurveTo(2.8, -3.4, 2.55, -1.05);
  q.quadraticCurveTo(0.4, -0.55, -2.25, -0.95);
  q.quadraticCurveTo(-2.45, -3.4, -1.9, -5.45);
  q.closePath();
};

// A fish: a char, olive back, orange belly, pale spots; nose at the origin,
// its body down +y (as held up by the gills), `len` long.
function fishShape(sk: Sketch, len: number, flap: number): void {
  const w = len * 0.24;
  sk.blob((q) => {
    q.moveTo(0, len - 0.15);
    q.lineTo(-w * 0.9 + flap, len + w * 0.9);
    q.quadraticCurveTo(0 + flap * 0.5, len + w * 0.3, w * 0.9 + flap, len + w * 0.9);
    q.closePath();
  }, FISH_BACK, { dark: shade(FISH_BACK, -0.2), d: 0.15 });
  sk.blob((q) => {
    q.moveTo(0, 0);
    q.quadraticCurveTo(w * 1.3, len * 0.3, w * 0.35, len);
    q.lineTo(-w * 0.35, len);
    q.quadraticCurveTo(-w * 1.3, len * 0.3, 0, 0);
    q.closePath();
  }, FISH_BACK, { dark: shade(FISH_BACK, -0.2), d: 0.25 });
  sk.blob((q) => {
    q.moveTo(w * 0.2, len * 0.12);
    q.quadraticCurveTo(w * 1.05, len * 0.35, w * 0.3, len * 0.9);
    q.quadraticCurveTo(w * 0.35, len * 0.4, w * 0.2, len * 0.12);
    q.closePath();
  }, FISH_BELLY, { line: 0, sil: false });
  for (const [x, y] of [[-0.3, 0.35], [0.1, 0.5], [-0.25, 0.65], [0.05, 0.8]] as const) sk.blob(circ(x * w * 2, y * len, 0.1 + w * 0.05), '#e8f0f0', { line: 0, sil: false });
  sk.blob(circ(-w * 0.15, len * 0.1, 0.17), '#1a2136', { line: 0, sil: false });
}

const fisherParts: NpcParts = {
  body(sk, _p, back) {
    // legs: thighs forward off the stool, shins down to the ice, felt boots
    for (const [y, near] of [[-1.25, false], [-1.05, true]] as const) {
      const hip = near ? -0.4 : 0.7;
      sk.limb([hip, y, 2.0 + (near ? 0 : 0.35), y - 0.1, 2.15 + (near ? 0 : 0.35), 0.4], 1.35, near ? '#4d5368' : '#383d4f', { dark: near ? '#383d4f' : null });
      boots(sk, 2.15 + (near ? -0.15 : 0.2), near, FISH_PLACE.mode === 'seated' ? FISH_PLACE.z : 0);
    }
    // the coat, checked, a fur collar
    sk.blob(coatShape, COAT, { dark: COAT_D, d: 0.5 });
    checks(sk, coatShape, -2.6, -6.1, 2.9, -0.4);
    sk.blob((q) => {
      q.moveTo(-2.05, -5.55);
      q.quadraticCurveTo(0.2, -6.35, 2.4, -5.55);
      q.quadraticCurveTo(2.2, -4.7, 1.2, -4.6);
      q.quadraticCurveTo(0.2, -4.4, -0.8, -4.65);
      q.quadraticCurveTo(-1.9, -4.75, -2.05, -5.55);
      q.closePath();
    }, C.furLight, { dark: C.fur, d: 0.2 });
    if (back) return;
    for (const y of [-3.6, -2.4]) sk.blob(circ(0.95, y, 0.2), CHECK, { line: 0.5, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.25, 3.1), F_SKIN, { dark: F_SKIN_D, d: 0.45 });
    if (!back) {
      // the beard, from ear to ear and down over the collar
      sk.blob((q) => {
        q.moveTo(cx - 2.9, cy + 0.2);
        q.quadraticCurveTo(cx - 3.1, cy + 3.4, cx - 0.6, cy + 4.3);
        q.quadraticCurveTo(cx + 0.9, cy + 4.9, cx + 2.2, cy + 3.8);
        q.quadraticCurveTo(cx + 3.6, cy + 2.6, cx + 3.15, cy + 0.2);
        q.quadraticCurveTo(cx + 2.1, cy + 1.5, cx + 0.7, cy + 1.25);
        q.quadraticCurveTo(cx - 1.4, cy + 1.6, cx - 2.9, cy + 0.2);
        q.closePath();
      }, BEARD, { dark: BEARD_D, d: 0.35 });
      sk.blob(ell(cx - 1.05, cy + 0.55, 0.55, 0.32), '#ee9078', { line: 0, sil: false });
      face(sk, { x: cx + 0.55, y: cy - 0.05, eyes: p.eyes, mouth: p.mouth, gap: 2.25, drop: 1.95 });
      sk.blob(ell(cx + 0.75, cy + 0.85, 0.62, 0.5), '#e66f62', { dark: '#c4524a', d: 0.15, line: 0.5 });
      for (const dx of [-1.1, 1.1]) sk.blob(ell(cx + 0.55 + dx, cy - 0.9, 0.7, 0.26, dx < 0 ? -0.2 : 0.2), BEARD, { dark: BEARD_D, d: 0.08, line: 0.45 });
    } else {
      sk.blob(ell(cx, cy + 0.6, 3.1, 2.4), BEARD, { dark: BEARD_D, d: 0.3 });
    }
    // the trapper's hat: its crown, the flaps down over the ears, the front
    // flap turned up, all in fur
    sk.blob((q) => {
      q.moveTo(cx - 3.55, cy + 2.3);
      q.quadraticCurveTo(cx - 4.0, cy + 0.6, cx - 3.4, cy - 0.6);
      q.quadraticCurveTo(cx - 3.3, cy - 4.1, cx + 0.1, cy - 4.3);
      q.quadraticCurveTo(cx + 3.5, cy - 4.1, cx + 3.55, cy - 0.6);
      q.quadraticCurveTo(cx + 3.9, cy + 0.6, cx + 3.45, cy + 2.0);
      q.quadraticCurveTo(cx + 2.6, cy + 2.1, cx + 2.55, cy + 0.2);
      q.quadraticCurveTo(cx + 1.0, cy - 1.6, cx - 1.4, cy - 1.2);
      q.quadraticCurveTo(cx - 2.6, cy - 0.6, cx - 2.55, cy + 0.6);
      q.quadraticCurveTo(cx - 2.6, cy + 2.4, cx - 3.55, cy + 2.3);
      q.closePath();
    }, HAT, { dark: HAT_D, d: 0.5 });
    if (!back) {
      sk.blob((q) => {
        q.moveTo(cx - 2.9, cy - 1.0);
        q.quadraticCurveTo(cx + 0.3, cy - 2.6, cx + 3.3, cy - 1.0);
        q.quadraticCurveTo(cx + 3.6, cy - 2.4, cx + 2.6, cy - 2.8);
        q.quadraticCurveTo(cx + 0.2, cy - 3.6, cx - 2.3, cy - 2.85);
        q.quadraticCurveTo(cx - 3.3, cy - 2.4, cx - 2.9, cy - 1.0);
        q.closePath();
      }, C.fur, { dark: C.furDark, d: 0.25 });
    }
    sk.draw((q, c) => {
      q.strokeStyle = withAlpha(HAT_D, 0.9);
      q.lineWidth = Math.max(0.12, 0.65 / c.px);
      q.beginPath();
      for (const [x, y] of [[-1.8, -3.3], [-0.4, -3.6], [1.1, -3.5], [2.3, -3.1], [-3.1, 0.6], [3.2, 0.5]] as const) {
        q.moveTo(cx + x, cy + y);
        q.lineTo(cx + x + 0.25, cy + y + 0.45);
      }
      q.stroke();
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, FISH_BONES.upper], 1.3, k ? COAT_D : COAT, { dark: k ? null : COAT_D });
  },
  fore(sk, p, k) {
    const f = FISH_BONES.fore;
    sk.limb([0, 0, 0, f - 0.4], 1.15, k ? COAT_D : COAT, { dark: k ? null : COAT_D });
    sk.blob(ell(0, f, 0.62, 0.58), k ? MITT_D : MITT, { dark: MITT_D, d: 0.2 });
    const show = p.act === 'show' ? p.u : -1;
    const caught = show >= 0.62;
    if (k !== 0 || !own(p.act)) return;
    if (caught) {
      // the great fish shown off across the chest in both hands (the rod
      // dropped on the ice), its tail flapping
      atHand(sk, p, 0, f, () => {
        sk.at(mul(move(4.6, -0.1), turn(Math.PI / 2)), () => fishShape(sk, 6.2, 0.35 * Math.sin(show * TAU * 6)));
        sk.blob(ell(0, 0, 0.62, 0.58), MITT, { dark: MITT_D, d: 0.2 });
      });
      return;
    }
    // the rod, short and stiff, pointing down at the hole (bent down hard
    // in the tug of war), the line from its tip to the float
    const tug = show >= 0.12 ? bump(show, 0.1, 0.64) : 0;
    let tip: [number, number] = [0, 0];
    atHand(sk, p, 0, f, () => {
      const a = 1.05 + 0.35 * tug;
      const L = 3.1;
      const ex = Math.sin(a) * L;
      const ey = Math.cos(a) * L;
      const bend = 1.5 * tug;
      sk.limb([-0.25, -0.5, 0.25, 0.45], 0.42, '#c9a06a', { dark: '#9c7646' });
      sk.draw((q, c) => {
        q.strokeStyle = c.ink;
        q.lineCap = 'round';
        q.lineWidth = 0.34;
        q.beginPath();
        q.moveTo(0.2, 0.35);
        q.quadraticCurveTo(ex * 0.75, ey * 0.75 - bend * 0.2, ex - bend * 0.35, ey + bend);
        q.stroke();
        q.strokeStyle = ROD;
        q.lineWidth = 0.17;
        q.stroke();
      });
      sk.blob(circ(-0.15, 0.5, 0.32), C.ironLight, { line: 0.5 });
      tip = sk.where(ex - bend * 0.35, ey + bend);
      sk.blob(ell(0, 0, 0.62, 0.58), MITT, { dark: MITT_D, d: 0.2 });
    });
    // what hangs from the tip, drawn in the fisher's own frame: the line to
    // the float (bobbing as it jigs, under in the tug of war), or, as the
    // fish comes out, the fish on its end
    const jig = p.act === 'work' ? Math.max(0, Math.sin(p.u * TAU * 2 - 0.5)) : 0;
    const bite = show >= 0 && show < 0.62 ? bump(show, 0.02, 0.14) : 0;
    const under = tug > 0 || bite > 0.5;
    const fly = show >= 0.5 && show < 0.62;
    inFrame(sk, () => {
      const [bx, by] = BOB;
      const fy = by + 0.12 * jig + 0.3 * bite;
      const end: [number, number] = fly ? [bx - 0.6, by - 4.2] : [bx, under ? by + 0.15 : fy - 0.25];
      {
        sk.draw((q, c) => {
          q.strokeStyle = withAlpha('#e6eef5', 0.95);
          q.lineWidth = Math.max(0.12, 0.8 / c.px);
          q.beginPath();
          q.moveTo(tip[0], tip[1]);
          q.lineTo(end[0], end[1]);
          q.stroke();
        });
      }
      if (fly) sk.at(mul(move(end[0], end[1]), turn(-0.5)), () => fishShape(sk, 4.2, 0.4));
      else if (!under) {
        sk.blob(circ(bx, fy, 0.3), '#e8473a', { dark: '#b8322a', d: 0.08, line: 0.5 });
        sk.blob((q) => q.arc(bx, fy - 0.02, 0.3, Math.PI, 0), '#ffffff', { line: 0.5 });
      }
      if (tug > 0 || bite > 0.2) {
        sk.draw((q, c) => {
          q.strokeStyle = withAlpha('#cfe9f8', 0.9);
          q.lineWidth = Math.max(0.1, 0.7 / c.px);
          q.beginPath();
          q.ellipse(bx, by + 0.1, 1.1, 0.45, 0, 0, TAU);
          q.stroke();
        });
      }
    });
  },
};

// Jigging: two twitches of the rod a loop, the float bobbing to them, the
// head nodding along, a blink.
const fisherWork: NpcLoop = {
  secs: 2.0,
  pose(u) {
    const jig = Math.max(0, Math.sin(u * TAU * 2 - 0.5));
    return {
      ...rest(),
      lean: 0.1,
      tilt: 0.14 + 0.06 * jig,
      arms: [{ sh: 0.95 + 0.12 * jig, el: 0.35 + 0.12 * jig }, { sh: 0.62, el: 0.75 }],
      eyes: u > 0.8 && u < 0.95 ? 'blink' : 'open',
    };
  },
};

// The big catch: a bite (it sits up), a tug of war (leaning back on the
// rod bent hard, rocking), the yank (the fish flies out), and the fish
// shown off in both hands, lifted again and again, a grin, and lowered
// over the last three frames, back to the rod as the loop comes round.
const fisherShow: NpcLoop & { crowd: 'watch' } = {
  secs: 4.8,
  crowd: 'watch',
  pose(u) {
    const bite = bump(u, 0.02, 0.14);
    const tug = bump(u, 0.1, 0.64);
    const rock = Math.sin(u * TAU * 5) * tug;
    const yank = bump(u, 0.5, 0.7);
    const held = ease(u, 0.6, 0.7) - ease(u, 0.82, 1);
    const lift = held * Math.abs(Math.sin(u * TAU * 3));
    return {
      ...rest(),
      bob: 0.25 * lift,
      lean: 0.1 * (1 - tug) * (1 - held) - 0.25 * tug + 0.07 * rock - 0.05 * held,
      tilt: 0.1 - 0.15 * tug - 0.15 * held + 0.1 * bite,
      arms: [
        { sh: 0.95 + 0.3 * tug + 0.9 * yank + 0.3 * held + 0.3 * lift, el: 0.35 + 0.4 * tug },
        { sh: 0.62 + 0.4 * tug + 0.38 * held + 0.3 * lift, el: 0.75 + 0.2 * tug - 0.35 * held },
      ],
      eyes: held > 0.5 ? 'happy' : tug > 0.5 ? 'shut' : 'open',
      mouth: held > 0.5 ? 'open' : bite > 0.3 ? 'o' : tug > 0.5 ? 'closed' : 'smile',
    };
  },
};

const fisher: Npc = {
  name: 'fisher',
  station: 'think',
  // on the stool by the hole, turned along the station to face it
  place: FISH_PLACE,
  tall: 13,
  bones: FISH_BONES,
  parts: fisherParts,
  work: fisherWork,
  show: fisherShow,
};

// ── the radio operator ───────────────────────────────────────────────────
// On the log before the set, its back to us: a navy coat, a mustard scarf
// trailing down its back, a red knit cap under big headphones, a signal
// coming in at its ear. At work its near hand turns the dial while the
// other goes to its ear now and then, its head cocked, listening.

const R_SKIN = '#f1c7a6';
const R_SKIN_D = '#d0a183';
const R_COAT = C.navy;
const R_COAT_D = '#283d5e';
const SCARF = C.mustard;
const SCARF_D = '#b0832c';
const CAP = C.woolDark;
const CAP_D = '#6a2220';
const CANS = '#3a3442';
const CANS_D = '#262230';

const RADIO_BONES: Bones = { neck: [0.15, -5.7], shoulders: [[-1.75, -5.1], [1.9, -5.1]], upper: 1.55, fore: 1.45 };
const RADIO_PLACE: NpcPlace = { mode: 'seated', u: RADIO_STOOL.u, v: RADIO_STOOL.v, z: RADIO_STOOL.top - 1, look: 'back' };

// How far its near hand has gone from the dial up to its ear (0 to 1).
const earOf = (u: number) => ease(u, 0.3, 0.55) - ease(u, 0.76, 1);

// How the signal comes in at the ear (0 none to 1) at this frame.
const signal = (p: Puppet) => (p.act === 'work' ? earOf(p.u) : 0);

const radioParts: NpcParts = {
  body(sk, _p, back) {
    if (!back) {
      // from the front: legs forward off the log, boots on the floor
      for (const [y, near] of [[-1.25, false], [-1.05, true]] as const) {
        const hip = near ? -0.4 : 0.7;
        sk.limb([hip, y, 1.9 + (near ? 0 : 0.35), y - 0.1, 2.05 + (near ? 0 : 0.35), 0.3], 1.3, near ? TROUSERS : TROUSERS_D, { dark: near ? TROUSERS_D : null });
        boots(sk, 2.05 + (near ? -0.15 : 0.2), near, RADIO_PLACE.mode === 'seated' ? RADIO_PLACE.z : 0);
      }
    }
    // the coat, its skirt spread on the log
    sk.blob((q) => {
      q.moveTo(-1.95, -5.4);
      q.quadraticCurveTo(0.15, -6.0, 2.25, -5.4);
      q.quadraticCurveTo(2.75, -3.2, 2.7, -0.75);
      q.quadraticCurveTo(0.3, -0.35, -2.3, -0.75);
      q.quadraticCurveTo(-2.45, -3.2, -1.95, -5.4);
      q.closePath();
    }, R_COAT, { dark: R_COAT_D, d: 0.5 });
    if (back) {
      // its back: a seam, a half belt with two buttons, the scarf's tails
      sk.limb([0.2, -5.3, 0.25, -0.8], 0.12, R_COAT_D, { line: 0 });
      sk.blob((q) => q.roundRect(-1.3, -2.75, 3.1, 0.5, 0.2), R_COAT_D, { line: 0.5 });
      for (const x of [-0.95, 1.45]) sk.blob(circ(x, -2.5, 0.16), C.brass, { line: 0.4, sil: false });
      sk.blob((q) => {
        q.moveTo(-0.7, -5.4);
        q.lineTo(0.5, -5.4);
        q.quadraticCurveTo(0.7, -4.2, 0.35, -3.1);
        q.lineTo(-0.55, -3.25);
        q.quadraticCurveTo(-0.45, -4.3, -0.7, -5.4);
        q.closePath();
      }, SCARF, { dark: SCARF_D, d: 0.15 });
      sk.draw((q, c) => {
        q.strokeStyle = SCARF_D;
        q.lineWidth = Math.max(0.12, 0.7 / c.px);
        q.beginPath();
        for (const y of [-4.6, -4.0, -3.45]) {
          q.moveTo(-0.55, y);
          q.lineTo(0.45, y + 0.05);
        }
        q.stroke();
      });
    } else {
      for (const y of [-4.2, -3.1, -2.0]) sk.blob(circ(0.95, y, 0.18), C.brass, { line: 0.4, sil: false });
    }
    // the scarf round the neck
    sk.blob((q) => {
      q.moveTo(-1.75, -5.85);
      q.quadraticCurveTo(0.2, -5.0, 2.1, -5.85);
      q.lineTo(1.95, -5.05);
      q.quadraticCurveTo(0.2, -4.35, -1.6, -5.05);
      q.closePath();
    }, SCARF, { dark: SCARF_D, d: 0.2 });
    if (!back) sk.limb([1.1, -5.1, 1.35, -3.6], 0.6, SCARF, { dark: SCARF_D, line: 0.5 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    const sig = signal(p);
    // the headphones' band and far cup behind
    sk.blob(ell(cx + (back ? -3.05 : 3.0), cy + 0.3, 0.8, 1.15), CANS, { dark: CANS_D, d: 0.2 });
    sk.blob(ell(cx, cy, 3.2, 3.05), R_SKIN, { dark: R_SKIN_D, d: 0.45 });
    if (back) {
      // short brown hair at the nape under the cap
      sk.blob((q) => {
        q.moveTo(cx - 3.0, cy - 0.6);
        q.quadraticCurveTo(cx - 3.1, cy + 2.2, cx - 1.3, cy + 2.6);
        q.quadraticCurveTo(cx + 0.1, cy + 2.2, cx + 1.4, cy + 2.6);
        q.quadraticCurveTo(cx + 3.1, cy + 2.2, cx + 3.0, cy - 0.6);
        q.closePath();
      }, '#6a4430', { dark: '#4f3122', d: 0.3 });
    } else {
      sk.blob((q) => {
        q.moveTo(cx - 3.0, cy + 0.6);
        q.quadraticCurveTo(cx - 3.1, cy - 1.6, cx - 1.4, cy - 1.2);
        q.quadraticCurveTo(cx - 2.2, cy + 0.2, cx - 3.0, cy + 0.6);
        q.closePath();
      }, '#6a4430', { dark: '#4f3122', d: 0.2 });
      face(sk, { x: cx + 0.55, y: cy + 0.4, eyes: p.eyes, mouth: p.mouth, gap: 2.25, drop: 1.45 });
      // round glasses, freckles
      sk.draw((q, c) => {
        q.lineWidth = Math.max(0.15, 0.9 / c.px);
        q.strokeStyle = c.ink;
        for (const dx of [-1.12, 1.1]) {
          q.beginPath();
          q.arc(cx + 0.55 + dx, cy + 0.4, 0.85, 0, TAU);
          q.stroke();
        }
        q.fillStyle = '#c98a64';
        for (const [x, y] of [[-1.3, 1.45], [-0.85, 1.6], [1.9, 1.45], [2.3, 1.6]] as const) {
          q.beginPath();
          q.arc(cx + x, cy + y, 0.1, 0, TAU);
          q.fill();
        }
      });
    }
    // the knit cap, its turned-up brim ribbed, a bobble on top
    sk.blob((q) => {
      q.moveTo(cx - 3.25, cy - 0.7);
      q.quadraticCurveTo(cx - 3.4, cy - 3.9, cx + 0.1, cy - 4.0);
      q.quadraticCurveTo(cx + 3.5, cy - 3.9, cx + 3.3, cy - 0.7);
      q.closePath();
    }, CAP, { dark: CAP_D, d: 0.45 });
    sk.blob((q) => q.roundRect(cx - 3.4, cy - 1.75, 6.85, 1.25, 0.5), CAP, { dark: CAP_D, d: 0.2 });
    sk.draw((q, c) => {
      q.strokeStyle = CAP_D;
      q.lineWidth = Math.max(0.1, 0.6 / c.px);
      q.beginPath();
      for (let x = -2.9; x < 3.2; x += 0.55) {
        q.moveTo(cx + x, cy - 1.6);
        q.lineTo(cx + x, cy - 0.65);
      }
      q.stroke();
    });
    sk.blob(circ(cx + 0.1, cy - 4.2, 0.75), C.mustard, { dark: SCARF_D, d: 0.2 });
    // the band over the top, the near cup on its ear
    sk.limb([cx - 2.95, cy + 0.0, cx - 2.9, cy - 2.6, cx - 1.0, cy - 4.0, cx + 1.2, cy - 4.0, cx + 2.95, cy - 2.6, cx + 3.0, cy + 0.0], 0.42, CANS, { dark: CANS_D });
    const nx = cx + (back ? 3.05 : -3.05);
    sk.blob(ell(nx, cy + 0.3, 0.95, 1.3), CANS, { dark: CANS_D, d: 0.25 });
    sk.blob(ell(nx + (back ? 0.15 : -0.15), cy + 0.3, 0.45, 0.7), C.brass, { line: 0.5, sil: false });
    // the signal coming in: arcs pulsing out from the near cup
    if (sig > 0.05) {
      const s = back ? 1 : -1;
      sk.draw((q, c) => {
        q.lineCap = 'round';
        q.lineWidth = Math.max(0.16, 1.0 / c.px);
        for (let i = 0; i < 3; i++) {
          const r = 1.3 + i * 0.75 + 0.35 * sig;
          q.strokeStyle = withAlpha('#9fe8d0', Math.max(0, sig * (1 - i * 0.28)));
          q.beginPath();
          q.arc(nx, cy + 0.3, r, s > 0 ? -0.6 : Math.PI - 0.6, s > 0 ? 0.6 : Math.PI + 0.6);
          q.stroke();
        }
      });
      glowDot(sk, nx + s * 1.6, cy + 0.3, 1.6, 0.25 * sig, '#9fe8d0');
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, RADIO_BONES.upper], 1.25, k ? R_COAT_D : R_COAT, { dark: k ? null : R_COAT_D });
  },
  fore(sk, _p, k) {
    const f = RADIO_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.1, k ? R_COAT_D : R_COAT, { dark: k ? null : R_COAT_D });
    sk.blob(circ(0, f, 0.56), k ? R_SKIN_D : R_SKIN, { dark: R_SKIN_D, d: 0.2 });
  },
};

// Listening: its near hand turning the dial to and fro, then up to the ear
// cup as the signal comes in, the head cocked to it, and back to the dial;
// the far hand on the set. (Seen from behind, the near arm raised past
// the shoulder is swung the other way round, a whole turn less: the same
// arm, drawn over the head and not under it.)
const radioWork: NpcLoop = {
  secs: 2.4,
  pose(u) {
    const ear = earOf(u);
    const twist = Math.sin(u * TAU * 3) * (1 - ear);
    const sh = 1.15 + 1.6 * ear + 0.06 * twist;
    return {
      ...rest(),
      bob: 0.05 * Math.sin(u * TAU),
      lean: 0.12,
      tilt: 0.06 - 0.14 * ear,
      arms: [
        { sh: 0.9, el: 0.7 },
        { sh: sh > 2.2 ? sh - TAU : sh, el: 0.45 - 0.3 * ear + 0.12 * twist },
      ],
      eyes: ear > 0.6 ? 'shut' : 'open',
      mouth: ear > 0.6 ? 'o' : 'smile',
    };
  },
};

const radioOperator: Npc = {
  name: 'radioOperator',
  station: 'web',
  // on the log before the set, its back to us
  place: RADIO_PLACE,
  tall: 14,
  bones: RADIO_BONES,
  parts: radioParts,
  work: radioWork,
};

export const NPCS: readonly Npc[] = [cook, fisher, radioOperator];
