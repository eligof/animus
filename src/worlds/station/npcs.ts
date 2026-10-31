import { move, mul, turn } from '../../art/figure/paint.ts';
import { shade } from '../../art/iso.ts';
import { bump, ease, env, HANG, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand } from '../../art/npc/helpers.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe } from '../types.ts';
import { C } from './kit.ts';
import { CHAIR, CONSOLE } from './stations.ts';

// The station's locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the station's ink: the captain in the helm's
// chair, the engineer at the reactor's riser and the comms officer behind
// the comms console (the console's mast and screen stand at its back, out
// of the officer's way: see CONSOLE in ./stations.ts).

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
// A stroke at least a pixel wide, in a part's units.
const thin = (w: number, px: number) => Math.max(w, 1 / px);

// ── the captain ──────────────────────────────────────────────────────────
// Seated in the helm's big chair, turned side-on to the room: a white
// peaked cap with a gold badge, a trim white beard, a navy double-breasted
// coat with gold buttons, epaulettes and cuff rings, black boots. At work
// it drums its fingers on the armrest, points ahead (an order given) and
// nods; it celebrates with a salute.

const CAP = {
  skin: '#e9c29c',
  skinD: '#c99a72',
  beard: '#eceae4',
  beardD: '#b9b5ac',
  coat: '#2c4a80',
  coatD: '#1f3660',
  gold: C.amber,
  goldD: '#c98a2a',
  crown: '#eef2f6',
  crownD: '#c3cbd8',
  band: '#22304e',
  visor: '#1b2030',
  boots: '#20232e',
};

// Seated: its seat line at y = -1, so its shoulders are low.
const CAP_BONES: Bones = { neck: [0.05, -5.6], shoulders: [[-1.7, -5.0], [1.75, -5.0]], upper: 1.75, fore: 1.7 };

// The order: the far arm out pointing ahead, at u of its work (out over a
// fifth of the loop, back over a sixth).
const capPoint = (u: number) => ease(u, 0.3, 0.5) - ease(u, 0.68, 0.84);
// How far up the salute is, at u of its celebration.
const capSalute = (u: number) => env(u, 0.25, 0.75);

const capParts: NpcParts = {
  body(sk, _p, back) {
    // legs forward off the seat and down, the far one first
    for (const [y, near] of [[-1.35, false], [-0.95, true]] as const) {
      const x = near ? -0.2 : 0.6;
      sk.limb([x, y, x + 2.7, y + 0.2, x + 2.95, y + 3.0], 1.45, near ? CAP.coat : CAP.coatD, { dark: near ? CAP.coatD : null });
      sk.blob((q) => q.roundRect(x + 2.2, y + 2.55, 1.9, 1.05, 0.45), CAP.boots, { dark: shade(CAP.boots, -0.4), d: 0.2 });
    }
    // the coat, its skirt over its lap
    sk.blob((q) => {
      q.moveTo(-2.0, -5.45);
      q.quadraticCurveTo(0.1, -6.0, 2.15, -5.4);
      q.quadraticCurveTo(2.55, -2.8, 2.3, -1.6);
      q.lineTo(1.4, -0.7);
      q.quadraticCurveTo(-0.6, -0.4, -2.2, -0.9);
      q.quadraticCurveTo(-2.4, -3.2, -2.0, -5.45);
      q.closePath();
    }, CAP.coat, { dark: CAP.coatD, d: 0.5 });
    if (back) return;
    // a white shirt at the neck, the lapels, two rows of gold buttons
    sk.blob((q) => {
      q.moveTo(0.35, -5.75);
      q.lineTo(1.75, -5.6);
      q.lineTo(1.05, -4.3);
      q.closePath();
    }, '#f3f6fa', { line: 0.5 });
    sk.limb([0.3, -5.7, 1.05, -4.25, 1.8, -5.55], 0.18, CAP.coatD, { line: 0 });
    for (const x of [0.55, 1.65]) for (const y of [-3.9, -2.85, -1.8]) sk.blob(circ(x + (y + 3) * 0.06, y, 0.22), CAP.gold, { line: 0.5, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.3, 3.15), CAP.skin, { dark: CAP.skinD, d: 0.45 });
    // white hair cropped short at the back and over the ear
    sk.blob((q) => {
      q.moveTo(cx - 1.4, cy - 1.0);
      q.quadraticCurveTo(cx - 3.2, cy - 1.2, cx - 3.3, cy + 0.4);
      q.quadraticCurveTo(cx - 3.1, cy + 1.8, cx - 2.2, cy + 2.2);
      q.quadraticCurveTo(cx - 2.3, cy + 0.6, cx - 1.4, cy - 1.0);
      q.closePath();
    }, CAP.beard, { dark: CAP.beardD, d: 0.25 });
    if (!back) {
      // a trim white beard round the jaw, a moustache
      sk.blob((q) => {
        q.moveTo(cx - 2.1, cy + 1.2);
        q.quadraticCurveTo(cx - 1.4, cy + 3.9, cx + 1.3, cy + 3.75);
        q.quadraticCurveTo(cx + 3.2, cy + 3.3, cx + 3.25, cy + 1.3);
        q.quadraticCurveTo(cx + 2.4, cy + 2.4, cx + 1.3, cy + 2.15);
        q.quadraticCurveTo(cx - 0.6, cy + 2.6, cx - 2.1, cy + 1.2);
        q.closePath();
      }, CAP.beard, { dark: CAP.beardD, d: 0.3 });
      face(sk, { x: cx + 0.9, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, drop: 1.4 });
      sk.blob((q) => {
        q.moveTo(cx + 0.3, cy + 1.7);
        q.quadraticCurveTo(cx + 1.0, cy + 1.2, cx + 1.8, cy + 1.5);
        q.quadraticCurveTo(cx + 2.5, cy + 1.2, cx + 3.1, cy + 1.7);
        q.quadraticCurveTo(cx + 1.8, cy + 2.05, cx + 0.3, cy + 1.7);
        q.closePath();
      }, CAP.beard, { line: 0.5, sil: false });
    }
    // the peaked cap: a white crown wider than the band, a navy band, a
    // black visor out front, a gold badge
    sk.blob((q) => {
      q.moveTo(cx - 3.15, cy - 1.75);
      q.quadraticCurveTo(cx - 3.9, cy - 3.5, cx - 2.4, cy - 4.2);
      q.quadraticCurveTo(cx + 0.6, cy - 5.2, cx + 3.7, cy - 3.6);
      q.quadraticCurveTo(cx + 3.9, cy - 2.4, cx + 3.05, cy - 1.75);
      q.closePath();
    }, CAP.crown, { dark: CAP.crownD, d: 0.35 });
    sk.blob((q) => q.roundRect(cx - 3.15, cy - 2.35, 6.2, 0.95, 0.3), CAP.band, { line: 0.6 });
    if (!back) {
      sk.blob((q) => {
        q.moveTo(cx + 0.6, cy - 1.5);
        q.lineTo(cx + 3.1, cy - 1.55);
        q.quadraticCurveTo(cx + 4.4, cy - 1.3, cx + 4.3, cy - 0.85);
        q.quadraticCurveTo(cx + 2.5, cy - 0.75, cx + 0.6, cy - 1.5);
        q.closePath();
      }, CAP.visor, { dark: shade(CAP.visor, -0.3), d: 0.15 });
      sk.blob((q) => {
        const x = cx + 1.25;
        const y = cy - 2.95;
        q.moveTo(x, y - 0.55);
        q.lineTo(x + 0.45, y);
        q.lineTo(x, y + 0.5);
        q.lineTo(x - 0.45, y);
        q.closePath();
      }, CAP.gold, { dark: CAP.goldD, d: 0.12, line: 0.6 });
      sk.limb([cx + 0.15, cy - 2.75, cx + 0.75, cy - 3.0], 0.22, CAP.gold, { line: 0.4 });
      sk.limb([cx + 2.35, cy - 2.75, cx + 1.75, cy - 3.0], 0.22, CAP.gold, { line: 0.4 });
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, CAP_BONES.upper], 1.3, k ? CAP.coatD : CAP.coat, { dark: k ? null : CAP.coatD });
    // an epaulette on the shoulder, fringed
    sk.blob(ell(0, -0.05, 0.95, 0.45), CAP.gold, { dark: CAP.goldD, d: 0.15, line: 0.6 });
    sk.draw((q, c) => {
      q.beginPath();
      for (let x = -0.7; x <= 0.71; x += 0.35) {
        q.moveTo(x, 0.3);
        q.lineTo(x * 1.05, 0.75);
      }
      q.lineWidth = thin(0.13, c.px);
      q.strokeStyle = CAP.goldD;
      q.stroke();
    });
  },
  fore(sk, p, k) {
    const f = CAP_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 1.1, k ? CAP.coatD : CAP.coat, { dark: k ? null : CAP.coatD });
    // gold rings round the cuff
    for (const y of [f - 0.75, f - 0.45]) sk.blob((q) => q.rect(-0.56, y, 1.12, 0.16), CAP.gold, { line: 0, sil: false });
    if (k === 1 && p.act === 'celebrate') {
      // a flat hand, upright in the room as the arm comes up, its
      // fingertips to the visor's tip, beside the face
      const a = capSalute(p.u) * (Math.PI + 0.2);
      atHand(sk, p, 1, f - 0.2, () =>
        sk.blob((q) => q.ellipse(0.9 * Math.sin(a), 0.9 * Math.cos(a), 0.36, 1.0, -a, 0, TAU), CAP.skin, { dark: CAP.skinD, d: 0.12 }),
      );
      return;
    }
    if (k === 1 && p.act === 'work' && capPoint(p.u) > 0.5) {
      // a finger out, pointing the way
      sk.limb([0, f + 0.2, 0.05, f + 1.25], 0.42, CAP.skin, { dark: CAP.skinD });
    }
    sk.blob(circ(0, f, 0.64), k ? CAP.skinD : CAP.skin, { dark: CAP.skinD, d: 0.2 });
  },
};

// In the chair: the near hand drumming on the armrest, the far one on its
// knee; then the far arm out, pointing ahead, chin up, an order given; and
// a nod, eyes smiling.
const capWork: NpcLoop = {
  secs: 3.0,
  pose(u) {
    const pt = capPoint(u);
    const nod = bump(u, 0.82, 1.0);
    const drum = u < 0.36 ? Math.max(0, Math.sin(u * TAU * 8)) : 0;
    const talk = pt > 0.5 && Math.floor(u * 12) % 2 === 0;
    return {
      ...rest(),
      lean: 0.03 * pt,
      tilt: -0.08 * pt + 0.2 * nod,
      arms: [{ sh: 0.3, el: 1.0 + 0.18 * drum }, { sh: 0.45 + 1.15 * pt, el: 0.85 - 0.8 * pt }],
      eyes: nod > 0.5 ? 'happy' : u > 0.2 && u < 0.28 ? 'blink' : 'open',
      mouth: talk ? 'open' : pt > 0.5 ? 'closed' : 'smile',
    };
  },
};

// A salute: the far arm up and out behind its head (swung short of
// overhead, so the head stays in front of it), the flat hand at the
// visor's tip beside its face, not over it; chin up, held, and down again.
const capCelebrate: NpcLoop = {
  secs: 1.8,
  pose(u) {
    const k = capSalute(u);
    return { ...rest(), tilt: -0.1 * k, arms: [{ sh: 0.3, el: 1.0 }, swing(2.03 * k, 0.15 * k)], mouth: k > 0.5 ? 'closed' : 'smile' };
  },
};

const captain: Npc = {
  name: 'captain',
  station: 'write',
  // in the chair, turned along the helm, its seat line on the cushion
  place: { mode: 'seated', u: CHAIR.u + 0.2, v: CHAIR.v, z: CHAIR.seat - 1, look: 'along' },
  tall: 13,
  bones: CAP_BONES,
  parts: capParts,
  work: capWork,
  celebrate: capCelebrate,
};

// ── the engineer ─────────────────────────────────────────────────────────
// Standing at the reactor's riser: orange coveralls with the sleeves rolled
// up, a tool belt, a red bandana with white spots knotted on top, an auburn
// ponytail, a smudge of grease on its cheek, a big wrench. At work it
// tightens the valve with the wrench and leans in to tap the gauge; its
// show is venting the core: the wheel cranked open, a roar of steam out of
// the vent, arms wide, then a thumbs-up.

const ENG = {
  skin: '#c68e64',
  skinD: '#a06c46',
  hair: '#a84a2a',
  hairD: '#7e3418',
  scarf: C.red,
  scarfD: '#b83846',
  suit: C.orange,
  suitD: '#c46a24',
  belt: '#4a5266',
  pouch: '#7a6a52',
  boots: '#2a2f3d',
  steel: C.chrome,
  steelD: C.steel,
};

const ENG_BONES: Bones = { neck: [0.1, -7.85], shoulders: [[-1.6, -7.3], [1.75, -7.3]], upper: 1.6, fore: 1.6 };

// The show's beats at u: cranking the wheel, the steam, the thumbs-up.
const engCrank = (u: number) => ease(u, 0.02, 0.1) - ease(u, 0.26, 0.32);
const engSteam = (u: number) => ease(u, 0.26, 0.34) - ease(u, 0.6, 0.68);
const engThumb = (u: number) => ease(u, 0.62, 0.7) - ease(u, 0.9, 0.98);

const engParts: NpcParts = {
  body(sk, p, back) {
    // the vent's steam, behind the engineer (the riser is further off)
    if (p.act === 'show' && p.u > 0.26 && p.u < 0.8) {
      sk.at(mul(turn(-p.lean), move(0, p.bob)), () => {
        const k0 = (p.u - 0.26) / 0.54;
        for (let i = 5; i >= 0; i--) {
          const k = k0 * 1.6 - i * 0.14;
          if (k <= 0 || k > 1.05) continue;
          const r = 0.7 + 1.9 * k;
          const x = 4.6 + 1.4 * k + Math.sin(i * 2.1) * 0.7;
          const y = -7.2 - 9.0 * k;
          sk.blob(circ(x, y, r), '#f4f8ff', { dark: '#c9d6e6', d: 0.35 * r });
        }
      });
    }
    for (const [x, near] of [[0.95, false], [-0.8, true]] as const) {
      sk.limb([x, -3.5, x + 0.05, -0.85], 1.4, near ? ENG.suit : ENG.suitD, { dark: near ? ENG.suitD : null });
      sk.blob((q) => q.roundRect(x - 0.62, -1.1, 1.75, 1.1, 0.4), ENG.boots, { dark: shade(ENG.boots, -0.4), d: 0.2 });
    }
    sk.blob((q) => {
      q.moveTo(-1.95, -7.85);
      q.quadraticCurveTo(0.1, -8.4, 2.1, -7.8);
      q.lineTo(2.35, -3.2);
      q.quadraticCurveTo(0.2, -2.7, -2.15, -3.2);
      q.closePath();
    }, ENG.suit, { dark: ENG.suitD, d: 0.5 });
    // the tool belt and its pouch
    sk.blob((q) => {
      q.moveTo(-2.2, -4.25);
      q.lineTo(2.4, -4.4);
      q.lineTo(2.42, -3.7);
      q.lineTo(-2.2, -3.55);
      q.closePath();
    }, ENG.belt, { line: 0.5 });
    sk.blob((q) => q.roundRect(-2.1, -4.1, 1.3, 1.6, 0.25), ENG.pouch, { dark: shade(ENG.pouch, -0.2), d: 0.15 });
    if (back) return;
    // the zip and a chest pocket with a pen in it
    sk.draw((q, c) => {
      q.beginPath();
      q.moveTo(1.2, -8.0);
      q.lineTo(1.35, -4.4);
      q.lineWidth = thin(0.12, c.px);
      q.strokeStyle = c.ink;
      q.stroke();
    });
    sk.blob((q) => q.roundRect(-0.6, -6.9, 1.35, 1.2, 0.15), ENG.suitD, { line: 0.5, sil: false });
    sk.limb([0.3, -7.4, 0.3, -6.7], 0.22, C.cyan, { line: 0.4 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the ponytail out the back
    sk.limb([cx - 2.6, cy - 1.0, cx - 4.0, cy - 0.2, cx - 4.3, cy + 1.6, cx - 3.7, cy + 2.8], 1.1, ENG.hair, { dark: ENG.hairD });
    sk.blob(ell(cx, cy, 3.3, 3.15), ENG.skin, { dark: ENG.skinD, d: 0.45 });
    // hair round the back under the bandana
    sk.blob((q) => {
      q.moveTo(cx - 1.2, cy - 1.4);
      q.quadraticCurveTo(cx - 3.2, cy - 1.6, cx - 3.35, cy + 0.4);
      q.quadraticCurveTo(cx - 3.0, cy + 1.8, cx - 2.3, cy + 2.0);
      q.quadraticCurveTo(cx - 2.2, cy, cx - 1.2, cy - 1.4);
      q.closePath();
    }, ENG.hair, { dark: ENG.hairD, d: 0.25 });
    // the bandana over the top of its head, spotted, knotted on top
    const scarf = (q: Pen) => {
      q.moveTo(cx - 3.3, cy - 0.6);
      q.quadraticCurveTo(cx - 3.2, cy - 3.6, cx + 0.2, cy - 3.45);
      q.quadraticCurveTo(cx + 3.2, cy - 3.3, cx + 3.35, cy - 0.9);
      q.quadraticCurveTo(cx + 0.2, cy - 2.2, cx - 3.3, cy - 0.6);
      q.closePath();
    };
    sk.blob(scarf, ENG.scarf, { dark: ENG.scarfD, d: 0.35 });
    sk.draw((q) => {
      q.save();
      q.beginPath();
      scarf(q);
      q.clip();
      q.beginPath();
      for (const [x, y] of [[-2.2, -1.6], [-0.9, -2.6], [0.6, -2.9], [2.0, -2.3], [-2.3, -2.9], [0.0, -1.8], [1.4, -1.6], [2.6, -1.3]] as const) {
        q.moveTo(cx + x + 0.22, cy + y);
        q.arc(cx + x, cy + y, 0.22, 0, TAU);
      }
      q.fillStyle = '#fff4f0';
      q.fill();
      q.restore();
    });
    for (const a of [-0.6, 0.5]) {
      sk.blob((q) => q.ellipse(cx + 0.9 + Math.sin(a) * 0.9, cy - 3.9 - Math.cos(a) * 0.55, 0.75, 0.45, a, 0, TAU), ENG.scarf, { dark: ENG.scarfD, d: 0.15 });
    }
    sk.blob(circ(cx + 0.9, cy - 3.55, 0.38), ENG.scarfD, { line: 0.6 });
    if (back) return;
    face(sk, { x: cx + 0.9, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
    // a smudge of grease on its cheek
    sk.blob(ell(cx + 2.45, cy + 1.6, 0.42, 0.2), '#7a5a48', { line: 0, sil: false });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, ENG_BONES.upper], 1.2, k ? ENG.suitD : ENG.suit, { dark: k ? null : ENG.suitD });
  },
  fore(sk, p, k) {
    const f = ENG_BONES.fore;
    sk.limb([0, 0.1, 0, f - 0.3], 1.0, k ? ENG.skinD : ENG.skin, { dark: k ? null : ENG.skinD });
    // the rolled sleeve at the elbow
    sk.blob((q) => q.roundRect(-0.68, -0.2, 1.36, 0.62, 0.25), k ? ENG.suitD : ENG.suit, { line: 0.5 });
    // the big wrench in the near hand (put by for the thumbs-up)
    if (k === 0 && (p.act === 'work' || (p.act === 'show' && engThumb(p.u) < 0.5))) {
      sk.limb([0, f, 0.3, f + 2.2], 0.42, ENG.steel, { dark: ENG.steelD });
      sk.blob((q) => {
        q.moveTo(0.3, f + 2.0);
        q.lineTo(-0.35, f + 2.75);
        q.lineTo(-0.05, f + 3.0);
        q.lineTo(0.35, f + 2.6);
        q.lineTo(0.75, f + 3.05);
        q.lineTo(1.05, f + 2.75);
        q.lineTo(0.45, f + 2.0);
        q.closePath();
      }, ENG.steel, { dark: ENG.steelD, d: 0.15 });
    }
    sk.blob(circ(0, f, 0.62), k ? ENG.skinD : ENG.skin, { dark: ENG.skinD, d: 0.2 });
    // a thumb up
    if (k === 1 && p.act === 'show' && engThumb(p.u) > 0.5) sk.limb([0.35, f - 0.1, 0.4, f - 0.95], 0.4, ENG.skin, { dark: ENG.skinD });
  },
};

// At the riser: the wrench on the valve, a few hard turns; then leaning in
// to tap the gauge with a knuckle and read it.
const engWork: NpcLoop = {
  secs: 2.4,
  pose(u) {
    const crank = u < 0.5 ? Math.sin(u * TAU * 3) : 0;
    // (leaning in to the gauge over a fifth of the loop, back over a sixth)
    const peer = ease(u, 0.42, 0.62) - ease(u, 0.84, 1);
    const tap = peer * Math.max(0, Math.sin(u * TAU * 5));
    return {
      ...rest(),
      lean: 0.15,
      bob: -0.06 * Math.abs(crank),
      tilt: 0.08 + 0.1 * peer,
      arms: [
        { sh: 0.65 + 0.2 * crank - 0.3 * peer, el: 0.2 + 0.4 * peer },
        { sh: 0.25 - 0.45 * peer, el: 0.5 + 1.0 * peer + 0.15 * tap },
      ],
      eyes: u > 0.2 && u < 0.3 ? 'blink' : 'open',
      mouth: Math.abs(crank) > 0.8 ? 'o' : 'closed',
    };
  },
};

// Venting the core: both hands crank the wheel open, a roar of steam out of
// the vent, leaning back with its arms flung wide, eyes shut; then a
// thumbs-up, grinning.
const engShow: NpcLoop & { crowd: 'watch' } = {
  secs: 5.0,
  crowd: 'watch',
  pose(u) {
    const crank = engCrank(u);
    const steam = engSteam(u);
    const thumb = engThumb(u);
    const heave = Math.sin(u * TAU * 8) * crank;
    return {
      ...rest(),
      lean: 0.15 * crank - 0.16 * steam,
      bob: -0.1 * Math.abs(heave) + 0.15 * thumb,
      tilt: 0.1 * crank - 0.14 * steam,
      arms: [
        { sh: HANG.sh + (0.55 + 0.25 * heave) * crank - 1.6 * steam - 0.5 * thumb, el: HANG.el - 0.1 * steam + 1.1 * thumb },
        { sh: HANG.sh + 0.2 * crank + 1.9 * steam + 1.75 * thumb, el: HANG.el + 0.9 * crank + 0.2 * steam + 1.25 * thumb },
      ],
      eyes: steam > 0.4 ? 'shut' : thumb > 0.4 ? 'happy' : 'open',
      mouth: steam > 0.4 ? 'o' : thumb > 0.4 ? 'open' : crank > 0.5 ? 'closed' : 'smile',
    };
  },
};

const engineer: Npc = {
  name: 'engineer',
  station: 'run',
  // on the floor off the plinth's end, outside the hazard ring painted
  // round the reactor (see room.ts), the riser at arm's (and wrench's)
  // length in front of it on screen
  place: { mode: 'standing', u: 12.5, v: 7.3 },
  tall: 15,
  bones: ENG_BONES,
  parts: engParts,
  work: engWork,
  show: engShow,
};

// ── the comms officer ────────────────────────────────────────────────────
// Behind the comms console: a plum uniform with a white yoke and a round
// amber comm badge, black hair in a neat bun, a headset with a mic on a
// boom. At work it keys at the console with both hands, leans in to read
// the screen with a nod, and puts a hand to its headset, talking. It hands
// over a data chip.

const COM = {
  skin: '#7a4e34',
  skinD: '#5c3824',
  hair: '#1c1620',
  hairD: '#0f0b12',
  suit: C.plum,
  suitD: '#5a4090',
  yoke: C.shell,
  set: C.navy,
  setD: '#1d2640',
  pants: C.navy,
  pantsD: '#1d2640',
};

const COM_BONES: Bones = { neck: [0.1, -7.8], shoulders: [[-1.55, -7.3], [1.7, -7.3]], upper: 1.6, fore: 1.55 };

// A hand to the headset, listening and answering, at u of its work: up
// over a fifth of the loop, down over its last sixth.
const comCall = (u: number) => ease(u, 0.42, 0.62) - ease(u, 0.85, 1);

const comParts: NpcParts = {
  body(sk, _p, back) {
    for (const [x, near] of [[0.95, false], [-0.8, true]] as const) {
      sk.limb([x, -3.5, x + 0.05, -0.85], 1.25, near ? COM.pants : COM.pantsD, { dark: near ? COM.pantsD : null });
      sk.blob((q) => q.roundRect(x - 0.6, -1.0, 1.65, 1.0, 0.45), '#2a2f3d', { dark: '#1a1d26', d: 0.2 });
    }
    sk.blob((q) => {
      q.moveTo(-1.9, -7.85);
      q.quadraticCurveTo(0.1, -8.35, 2.05, -7.8);
      q.lineTo(2.3, -3.15);
      q.quadraticCurveTo(0.2, -2.7, -2.1, -3.15);
      q.closePath();
    }, COM.suit, { dark: COM.suitD, d: 0.5 });
    // a white yoke across the shoulders, a high collar
    sk.blob((q) => {
      q.moveTo(-1.95, -7.8);
      q.quadraticCurveTo(0.1, -8.3, 2.08, -7.75);
      q.lineTo(2.12, -6.9);
      q.quadraticCurveTo(0.1, -6.55, -2.0, -7.05);
      q.closePath();
    }, COM.yoke, { dark: shade(COM.yoke, -0.15), d: 0.25 });
    sk.blob((q) => q.roundRect(-0.6, -8.45, 2.0, 0.75, 0.3), COM.suitD, { line: 0.5 });
    if (back) return;
    // the comm badge, a seam down the front, a belt
    sk.blob(circ(0.95, -6.0, 0.45), C.amber, { dark: shade(C.amber, -0.25), d: 0.15, line: 0.6 });
    sk.blob(circ(0.95, -6.0, 0.18), '#fff2c8', { line: 0, sil: false });
    sk.blob((q) => {
      q.moveTo(-2.15, -3.95);
      q.lineTo(2.3, -4.1);
      q.lineTo(2.32, -3.55);
      q.lineTo(-2.15, -3.4);
      q.closePath();
    }, COM.set, { line: 0.5, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // a bun at the back
    sk.blob(circ(cx - 3.0, cy - 1.7, 1.35), COM.hair, { dark: COM.hairD, d: 0.3 });
    sk.blob(ell(cx, cy, 3.3, 3.15), COM.skin, { dark: COM.skinD, d: 0.45 });
    // sleek hair, parted, swept back over the ear
    sk.blob((q) => {
      q.moveTo(cx - 3.35, cy + 1.2);
      q.quadraticCurveTo(cx - 3.6, cy - 3.0, cx - 0.4, cy - 3.45);
      q.quadraticCurveTo(cx + 2.8, cy - 3.6, cx + 3.4, cy - 0.9);
      q.quadraticCurveTo(cx + 1.8, cy - 2.4, cx + 0.7, cy - 2.1);
      q.quadraticCurveTo(cx - 1.4, cy - 1.6, cx - 2.0, cy + 1.6);
      q.closePath();
    }, COM.hair, { dark: COM.hairD, d: 0.3 });
    // the headset's band over the top
    sk.limb([cx - 2.25, cy + 0.2, cx - 2.3, cy - 2.4, cx - 0.4, cy - 3.5, cx + 1.8, cy - 3.2], 0.45, COM.set, { dark: COM.setD });
    if (!back) {
      face(sk, { x: cx + 0.9, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
      // the mic on its boom, round to its mouth
      sk.limb([cx - 2.0, cy + 1.1, cx - 0.4, cy + 2.6, cx + 1.0, cy + 2.4], 0.22, COM.setD, { line: 0.5 });
      sk.blob(ell(cx + 1.05, cy + 2.35, 0.35, 0.28), C.orange, { line: 0.6 });
    }
    // the ear cup
    sk.blob(ell(cx - 2.25, cy + 0.6, 0.85, 1.1), COM.set, { dark: COM.setD, d: 0.25 });
    sk.blob(ell(cx - 2.25, cy + 0.6, 0.4, 0.55), C.orange, { line: 0.5, sil: false });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, COM_BONES.upper], 1.15, k ? COM.suitD : COM.suit, { dark: k ? null : COM.suitD });
  },
  fore(sk, _p, k) {
    const f = COM_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 1.0, k ? COM.suitD : COM.suit, { dark: k ? null : COM.suitD });
    sk.blob((q) => q.roundRect(-0.55, f - 0.75, 1.1, 0.32, 0.12), COM.yoke, { line: 0.5, sil: false });
    sk.blob(circ(0, f, 0.58), k ? COM.skinD : COM.skin, { dark: COM.skinD, d: 0.2 });
  },
};

// Keying at the console, both hands tapping by turns, head down to the
// keys; leaning in to read the screen, a nod; then the near hand up to the
// headset by its side (its elbow out, clear of its face), a word into the
// mic and a nod, the far hand still keying; and back. Each change eased,
// none snapped.
const comWork: NpcLoop = {
  secs: 2.4,
  pose(u) {
    const call = comCall(u);
    const read = bump(u, 0.22, 0.56);
    const nod = bump(u, 0.36, 0.5) + bump(u, 0.66, 0.82);
    // the hands key by turns, six times each round the loop, fast while
    // both are down; its mouth and a blink go by the keys (twelve a loop)
    const tap = -Math.cos(u * TAU * 6) * (1 - 0.6 * read);
    const i = Math.round(u * 12);
    return {
      ...rest(),
      lean: 0.04 + 0.08 * read - 0.03 * call,
      bob: -0.15 * read,
      tilt: 0.14 - 0.2 * read - 0.1 * call + 0.16 * nod,
      arms: [
        { sh: 1.0 + 0.12 * tap * (1 - call) - 3.59 * call, el: 0.65 - 0.15 * tap * (1 - call) - 1.27 * call - 1.2 * Math.sin(Math.PI * call) },
        { sh: 0.8 - 0.12 * tap, el: 1.2 + 0.15 * tap },
      ],
      eyes: nod > 0.6 ? 'happy' : i === 3 ? 'blink' : 'open',
      mouth: call > 0.5 ? (i % 2 ? 'open' : 'smile') : read > 0.6 ? 'o' : 'closed',
    };
  },
};

// A data chip: a navy card with gold contacts and a glowing line.
const dataChip: NpcServe = {
  name: 'dataChip',
  drink: false,
  draw(sk) {
    sk.at(turn(-0.25), () => {
      sk.blob((q) => q.roundRect(-1.1, -1.4, 2.2, 1.5, 0.25), C.navy, { dark: shade(C.navy, -0.25), d: 0.2 });
      for (let i = 0; i < 4; i++) sk.blob((q) => q.rect(-0.9 + i * 0.5, -0.4, 0.3, 0.38), C.amber, { line: 0.4, sil: false });
      sk.limb([-0.8, -1.0, 0.1, -1.0, 0.45, -0.75, 0.8, -0.75], 0.16, C.cyan, { line: 0 });
    });
  },
};

const commsOfficer: Npc = {
  name: 'commsOfficer',
  station: 'web',
  // behind the console, the screen and mast behind it; the console's top
  // hides its legs
  place: { mode: 'behind', u: 2.2, v: 1.2, top: CONSOLE.z, edge: CONSOLE.back },
  tall: 14.5,
  bones: COM_BONES,
  parts: comParts,
  work: comWork,
  serve: dataChip,
};

export const NPCS: readonly Npc[] = [captain, engineer, commsOfficer];
