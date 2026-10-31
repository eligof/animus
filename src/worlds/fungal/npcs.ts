import { shade } from '../../art/iso.ts';
import { bump, ease, env, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand } from '../../art/npc/helpers.ts';
import { turn, type Sketch } from '../../art/figure/paint.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet } from '../types.ts';
import { C, withAlpha } from './kit.ts';
import { POT, RING } from './stations.ts';

// The caverns' locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the caverns' ink: the herbalist beside the
// apothecary chest, the witch at the far side of her cauldron, and a
// myconid, a little mushroom person, sitting on the moss in the middle of
// the fairy ring.

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// A soft glowing dot (a spore), r units across its glow.
function glowDot(sk: Sketch, x: number, y: number, r: number, a: number, color: string = C.glow): void {
  if (a <= 0.02) return;
  sk.draw((q) => {
    const g = q.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(C.glowHot, Math.min(1, a)));
    g.addColorStop(0.35, withAlpha(color, Math.min(1, a * 0.8)));
    g.addColorStop(1, withAlpha(color, 0));
    q.fillStyle = g;
    q.beginPath();
    q.arc(x, y, r, 0, TAU);
    q.fill();
  });
}

// ── the herbalist ─────────────────────────────────────────────────────────
// An old herb-gatherer: bald under a crown of leaves, round spectacles, a
// great white beard over a brown tunic, a tan leather apron with sprigs
// in its pocket. At work it grinds in a stone mortar held in its far hand,
// the pestle going round, then lifts a sprig to its nose and breathes it
// in. It hands over a bundle of herbs tied with twine.

const H_SKIN = '#e0ad86';
const H_SKIN_D = '#bd8762';
const BEARD = '#f3efe6';
const BEARD_D = '#cfc7b6';
const TUNIC = '#7c5a4c';
const TUNIC_D = '#5a3f38';
const APRON = '#c99a62';
const APRON_D = '#a07548';
const BOOTS = '#4a3530';
const LEAF = C.mossLight;
const LEAF_D = C.moss;
const STONE = '#a59fb2';
const STONE_D = '#7d7690';

const HERB_BONES: Bones = { neck: [0.15, -7.75], shoulders: [[-1.75, -7.1], [1.85, -7.1]], upper: 1.65, fore: 1.55 };

// A sprig: a stem with leaves in pairs up it, drawn upright from (x, y).
function sprig(sk: Sketch, x: number, y: number, len: number, lean = 0, color: string = LEAF, dark: string = LEAF_D): void {
  const tx = x + Math.sin(lean) * len;
  const ty = y - Math.cos(lean) * len;
  sk.limb([x, y, tx, ty], 0.16, C.mossDark, { line: 0.4 });
  for (let i = 1; i <= 3; i++) {
    const f = i / 3.4;
    const lx = x + (tx - x) * f;
    const ly = y + (ty - y) * f;
    for (const s of [-1, 1]) sk.blob(ell(lx + s * 0.34, ly - 0.08, 0.36, 0.19, s * -0.6 + lean), color, { dark, d: 0.08, line: 0.4 });
  }
  sk.blob(ell(tx, ty - 0.1, 0.22, 0.34, lean), color, { dark, d: 0.08, line: 0.4 });
}

const herbParts: NpcParts = {
  body(sk, _p, back) {
    // boots and brown breeches, the far leg first
    for (const [x, near] of [[1.0, false], [-0.8, true]] as const) {
      sk.limb([x, -3.4, x + 0.05, -0.9], 1.3, near ? TUNIC : TUNIC_D, { dark: near ? TUNIC_D : null });
      sk.blob((q) => q.roundRect(x - 0.6, -1.15, 1.75, 1.15, 0.5), BOOTS, { dark: shade(BOOTS, -0.2), d: 0.2 });
    }
    // the tunic, a little round in the middle
    sk.blob((q) => {
      q.moveTo(-1.95, -7.5);
      q.quadraticCurveTo(0.15, -8.1, 2.25, -7.5);
      q.quadraticCurveTo(2.85, -5.4, 2.4, -3.0);
      q.quadraticCurveTo(0.2, -2.55, -2.05, -3.0);
      q.quadraticCurveTo(-2.4, -5.4, -1.95, -7.5);
      q.closePath();
    }, TUNIC, { dark: TUNIC_D, d: 0.5 });
    if (back) {
      // the apron's ties crossed over the back
      sk.limb([-1.8, -6.9, 1.9, -4.3], 0.3, APRON_D, { line: 0.4 });
      sk.limb([1.9, -6.9, -1.8, -4.3], 0.3, APRON_D, { line: 0.4 });
      return;
    }
    // the apron: a bib on a neck strap, a skirt to the knee, a pocket with
    // sprigs in it, its ties at the waist
    sk.blob((q) => {
      q.moveTo(-0.75, -7.2);
      q.lineTo(1.45, -7.2);
      q.lineTo(1.6, -5.2);
      q.quadraticCurveTo(2.55, -4.8, 2.6, -3.2);
      q.lineTo(2.45, -1.95);
      q.quadraticCurveTo(0.4, -1.55, -1.6, -1.95);
      q.lineTo(-1.65, -3.2);
      q.quadraticCurveTo(-1.55, -4.8, -0.85, -5.2);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.4 });
    sk.limb([-1.75, -5.15, 2.3, -5.1], 0.32, APRON_D, { line: 0.5 });
    sprig(sk, 0.6, -3.5, 1.5, -0.25);
    sprig(sk, 1.25, -3.45, 1.25, 0.3, C.mossPale, LEAF);
    sk.blob((q) => q.roundRect(-0.15, -3.75, 2.1, 1.25, 0.3), APRON_D, { dark: shade(APRON_D, -0.15), d: 0.15 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the head, bald and shining, white hair round the back
    sk.blob(ell(cx - 0.1, cy + 0.2, 3.3, 3.2), H_SKIN, { dark: H_SKIN_D, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(cx - 3.45, cy - 0.3);
      q.quadraticCurveTo(cx - 3.7, cy + 2.4, cx - 2.2, cy + 3.0);
      q.quadraticCurveTo(cx - 2.6, cy + 1.2, cx - 2.3, cy - 0.6);
      q.closePath();
    }, BEARD, { dark: BEARD_D, d: 0.2 });
    if (back) {
      sk.blob((q) => {
        q.moveTo(cx - 3.4, cy - 0.2);
        q.quadraticCurveTo(cx - 3.4, cy + 3.3, cx - 0.1, cy + 3.5);
        q.quadraticCurveTo(cx + 3.3, cy + 3.3, cx + 3.2, cy - 0.2);
        q.quadraticCurveTo(cx - 0.1, cy + 1.2, cx - 3.4, cy - 0.2);
        q.closePath();
      }, BEARD, { dark: BEARD_D, d: 0.3 });
    } else {
      // the beard, a great soft cloud from ear to chest, and a moustache
      sk.blob((q) => {
        q.moveTo(cx - 2.5, cy + 0.5);
        q.quadraticCurveTo(cx - 3.0, cy + 3.6, cx - 1.1, cy + 4.6);
        q.quadraticCurveTo(cx + 0.4, cy + 5.6, cx + 1.6, cy + 4.5);
        q.quadraticCurveTo(cx + 3.6, cy + 3.4, cx + 3.25, cy + 0.6);
        q.quadraticCurveTo(cx + 2.2, cy + 1.9, cx + 0.6, cy + 1.7);
        q.quadraticCurveTo(cx - 1.2, cy + 1.9, cx - 2.5, cy + 0.5);
        q.closePath();
      }, BEARD, { dark: BEARD_D, d: 0.4 });
      face(sk, { x: cx + 0.55, y: cy + 0.25, eyes: p.eyes, mouth: p.mouth, gap: 2.2, drop: 1.85 });
      sk.blob((q) => {
        q.moveTo(cx - 0.6, cy + 1.75);
        q.quadraticCurveTo(cx + 0.55, cy + 1.05, cx + 1.7, cy + 1.75);
        q.quadraticCurveTo(cx + 1.2, cy + 2.15, cx + 0.55, cy + 1.75);
        q.quadraticCurveTo(cx - 0.1, cy + 2.15, cx - 0.6, cy + 1.75);
        q.closePath();
      }, BEARD, { dark: BEARD_D, d: 0.1, line: 0.5 });
      sk.blob(ell(cx + 0.6, cy + 1.1, 0.5, 0.42), H_SKIN, { dark: H_SKIN_D, d: 0.15, line: 0.5 });
      // round brass spectacles and bushy white brows
      sk.draw((q, c) => {
        q.lineWidth = Math.max(0.2, 0.9 / c.px);
        q.strokeStyle = C.brass;
        for (const dx of [-1.1, 1.0]) {
          q.beginPath();
          q.arc(cx + 0.55 + dx, cy + 0.25, 0.82, 0, TAU);
          q.stroke();
        }
        q.beginPath();
        q.moveTo(cx + 0.27, cy + 0.15);
        q.quadraticCurveTo(cx + 0.55, cy - 0.05, cx + 0.73, cy + 0.15);
        q.stroke();
      });
      for (const dx of [-1.15, 1.0]) sk.limb([cx - 0.1 + dx, cy - 0.75, cx + 0.55 + dx, cy - 1.15, cx + 1.2 + dx, cy - 0.85], 0.45, BEARD, { dark: BEARD_D, line: 0.5 });
    }
    // the crown of leaves round the dome
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (1.05 + (i / 6) * 0.9);
      const lx = cx - 0.1 + Math.cos(a) * 3.15;
      const ly = cy - 0.6 + Math.sin(a) * 1.5;
      sk.blob(ell(lx, ly, 0.75, 0.38, a + Math.PI / 2 + (i % 2 ? 0.4 : -0.4)), i % 2 ? LEAF : C.mossPale, { dark: LEAF_D, d: 0.12, line: 0.5 });
    }
    sk.blob(circ(cx + 2.2, cy - 2.2, 0.32), C.capRed, { dark: shade(C.capRed, -0.2), d: 0.08, line: 0.5 });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, HERB_BONES.upper], 1.25, k ? TUNIC_D : TUNIC, { dark: k ? null : TUNIC_D });
  },
  fore(sk, p, k) {
    const f = HERB_BONES.fore;
    // sleeves rolled to the elbow
    sk.blob(ell(0, 0.15, 0.68, 0.42), k ? shade(C.parchment, -0.2) : C.parchment, { dark: shade(C.parchment, -0.2), d: 0.1 });
    sk.limb([0, 0.35, 0, f - 0.25], 0.9, k ? H_SKIN_D : H_SKIN, { dark: k ? null : H_SKIN_D });
    const work = p.act === 'work';
    if (k === 1 && work) {
      // the mortar, cradled level in the far hand, herbs in it
      atHand(sk, p, 1, f, () => {
        sk.blob((q) => {
          q.moveTo(-1.85, -0.75);
          q.lineTo(0.75, -0.75);
          q.quadraticCurveTo(0.65, 0.75, -0.55, 0.85);
          q.quadraticCurveTo(-1.75, 0.75, -1.85, -0.75);
          q.closePath();
        }, STONE, { dark: STONE_D, d: 0.25 });
        sk.blob(ell(-0.55, -0.75, 1.3, 0.38), '#5a4f68', { line: 0.5 });
        sk.blob(ell(-0.6, -0.8, 0.9, 0.2), C.moss, { line: 0 });
      });
    }
    sk.blob(circ(0, f, 0.6), k ? H_SKIN_D : H_SKIN, { dark: H_SKIN_D, d: 0.2 });
    if (k === 0 && (work || p.act === 'celebrate')) {
      // the pestle slanting down into the mortar, or a sprig to sniff (or
      // to wave): swapped halfway up to the nose and halfway back down
      const sniff = p.act === 'celebrate' || herbSniff(p.u) > 0.5;
      atHand(sk, p, 0, f, () => {
        if (sniff) sprig(sk, 0.15, 0.2, 1.9, 0.5);
        else {
          sk.limb([-0.45, -0.75, 1.15, 1.45], 0.38, '#d8d0e0', { dark: '#aaa2b8' });
          sk.blob(ell(1.2, 1.5, 0.36, 0.3, 0.6), '#d8d0e0', { dark: '#aaa2b8', d: 0.1, line: 0.5 });
        }
        sk.blob(circ(0, 0, 0.6), H_SKIN, { dark: H_SKIN_D, d: 0.2 });
      });
    }
  },
};

// How far the herbalist has a sprig up at his nose, at u round his work:
// lifted over three frames, a long sniff, lowered over three.
const herbSniff = (u: number): number => ease(u, 0.43, 0.68) - ease(u, 0.76, 1);

// At the chest: the pestle going round in the mortar, then a sprig lifted
// to the nose, a long sniff, eyes shut, and back to grinding.
const herbWork: NpcLoop = {
  secs: 3.2,
  pose(u) {
    const sniff = herbSniff(u);
    const g = 1 - sniff;
    const round = u * TAU * 3;
    return {
      ...rest(),
      lean: 0.06 * g - 0.05 * sniff,
      tilt: 0.14 * g - 0.1 * sniff,
      arms: [
        { sh: 1.25 + 0.12 * Math.sin(round) * g + 0.9 * sniff, el: 0.35 + 0.18 * Math.cos(round) * g + 1.8 * sniff },
        { sh: 0.62 + 0.06 * Math.sin(round) * g, el: 0.1 + 0.25 * sniff },
      ],
      eyes: sniff > 0.6 ? 'shut' : 'open',
      mouth: sniff > 0.6 ? 'o' : 'smile',
    };
  },
};

// A little jig: a sprig waved high beside his head (the near arm up
// behind it, clear of his face), the other hand on the hip, a hop on each
// foot; from rest and back.
const herbCelebrate: NpcLoop = {
  secs: 1.6,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const hop = Math.abs(Math.sin(u * TAU * 2));
    return {
      ...rest(),
      bob: 0.35 * hop * k,
      lean: 0.06 * Math.sin(u * TAU * 2) * k,
      tilt: -0.08 * k,
      arms: [swing(-(2.1 + 0.15 * hop) * k, -0.85 * k), swing(0.35 * k, 1.6 * k)],
      eyes: k > 0.4 ? 'happy' : 'open',
      mouth: k > 0.4 ? 'open' : 'smile',
    };
  },
};

// A bundle of herbs: sprigs fanned out of a twist of twine.
const herbs: NpcServe = {
  name: 'herbs',
  drink: false,
  draw(sk) {
    sprig(sk, -0.1, 0.6, 2.0, -0.35);
    sprig(sk, 0.2, 0.6, 2.3, 0.05, C.mossPale, LEAF);
    sprig(sk, 0.4, 0.6, 1.9, 0.45, '#9c7cc8', C.capViolet);
    sk.limb([-0.3, 0.3, 0.6, 0.3], 0.35, C.parchment, { dark: shade(C.parchment, -0.2) });
  },
};

const herbalist: Npc = {
  name: 'herbalist',
  station: 'search',
  // beside the chest's far end, turned along it to its drawers
  place: { mode: 'standing', u: -1.6, v: 5.3, look: 'along' },
  tall: 14,
  bones: HERB_BONES,
  parts: herbParts,
  work: herbWork,
  celebrate: herbCelebrate,
  serve: herbs,
};

// ── the witch ────────────────────────────────────────────────────────────
// A mushroom witch: moss-pale skin and a sharp nose, long lilac-white hair,
// a violet hat like a pointed mushroom cap, gills under its brim and
// glowing toadstools sprouting from its band, a plum robe cinched with a
// sash, pointed boots. At work she stirs her cauldron with a long ladle,
// peering in; she cackles with her arms up when something is done, and
// hands over a cup of mushroom tea.

const W_SKIN = '#b9d39c';
const W_SKIN_D = '#93b27a';
const W_HAIR = '#e4dcef';
const W_HAIR_D = '#b4a6cc';
const ROBE = '#4a3262';
const ROBE_D = '#33224a';
const HAT = '#7a48a8';
const HAT_D = '#55307a';
const SASH = '#5f9e8a';
const SASH_D = '#467a69';
const BOOT = '#2c2236';
const BOOT_D = '#1f1828';
const LADLE = '#8a6650';
const LADLE_D = '#5a3f38';

const WITCH_BONES: Bones = { neck: [0.1, -7.45], shoulders: [[-1.45, -6.85], [1.6, -6.85]], upper: 1.7, fore: 1.55 };

// Her long hair, falling behind her shoulders (behind the body from the
// front, over it from behind), in the body's frame.
function longHair(sk: Sketch, back: boolean): void {
  sk.blob((q) => {
    q.moveTo(-2.4, -12.4);
    q.quadraticCurveTo(-4.4, -9.5, -3.6, -5.8);
    q.quadraticCurveTo(-3.1, -4.3, -2.2, -4.6);
    q.quadraticCurveTo(-1.6, -3.9, -0.8, -4.7);
    if (back) {
      q.quadraticCurveTo(0.2, -3.8, 1.2, -4.7);
      q.quadraticCurveTo(2.2, -4.0, 2.7, -5.0);
      q.quadraticCurveTo(3.6, -8.0, 2.4, -12.4);
    } else {
      q.quadraticCurveTo(0.6, -6.0, 1.6, -7.8);
      q.quadraticCurveTo(2.9, -8.6, 2.6, -11.0);
    }
    q.closePath();
  }, W_HAIR, { dark: W_HAIR_D, d: 0.45 });
}

const witchParts: NpcParts = {
  body(sk, _p, back) {
    if (!back) longHair(sk, false);
    // pointed boots, the toes curled up, under the hem
    for (const [x, near] of [[0.95, false], [-0.75, true]] as const) {
      sk.blob((q) => {
        q.moveTo(x - 0.55, -1.15);
        q.lineTo(x + 0.45, -1.15);
        q.quadraticCurveTo(x + 1.0, -0.5, x + 1.85, -1.0);
        q.quadraticCurveTo(x + 1.6, 0.05, x + 0.5, 0.0);
        q.lineTo(x - 0.55, 0.0);
        q.closePath();
      }, near ? BOOT : BOOT_D, { dark: near ? BOOT_D : null, d: 0.2 });
    }
    // the robe: fitted to a cinched waist, flaring to a ragged hem
    sk.blob((q) => {
      q.moveTo(-1.85, -7.15);
      q.quadraticCurveTo(0.1, -7.7, 2.05, -7.15);
      q.quadraticCurveTo(1.85, -5.7, 1.35, -4.65);
      q.quadraticCurveTo(2.5, -2.5, 3.0, -0.5);
      q.quadraticCurveTo(2.6, -0.75, 2.25, -0.4);
      q.quadraticCurveTo(1.9, -0.75, 1.45, -0.3);
      q.quadraticCurveTo(1.0, -0.7, 0.6, -0.3);
      q.quadraticCurveTo(0.1, -0.7, -0.3, -0.3);
      q.quadraticCurveTo(-0.75, -0.7, -1.15, -0.3);
      q.quadraticCurveTo(-1.6, -0.75, -2.0, -0.35);
      q.quadraticCurveTo(-2.4, -0.7, -2.85, -0.5);
      q.quadraticCurveTo(-2.3, -2.5, -1.3, -4.65);
      q.quadraticCurveTo(-1.75, -5.7, -1.85, -7.15);
      q.closePath();
    }, ROBE, { dark: ROBE_D, d: 0.55 });
    // a sash round the waist
    sk.limb([-1.35, -4.75, 0.1, -4.95, 1.45, -4.75], 0.55, SASH, { dark: SASH_D });
    if (back) return;
    // its knot and ends at the hip, a glowing vial hung from it
    sk.limb([-0.75, -4.75, -1.05, -3.3], 0.38, SASH, { dark: SASH_D, line: 0.5 });
    sk.limb([-0.55, -4.75, -0.2, -3.5], 0.38, SASH_D, { line: 0.5 });
    sk.blob(circ(-0.65, -4.8, 0.36), SASH, { dark: SASH_D, d: 0.1 });
    sk.limb([1.0, -4.6, 1.05, -4.0], 0.12, '#2b2233', { line: 0 });
    sk.blob((q) => {
      q.moveTo(0.8, -4.05);
      q.lineTo(1.3, -4.05);
      q.quadraticCurveTo(1.65, -3.2, 1.05, -2.95);
      q.quadraticCurveTo(0.45, -3.2, 0.8, -4.05);
      q.closePath();
    }, C.sludge, { dark: C.sludgeDark, d: 0.12, line: 0.5 });
    glowDot(sk, 1.05, -3.4, 1.0, 0.45, C.sludgeHot);
    // a pendant: a glowing drop on a cord
    sk.draw((q, c) => {
      q.strokeStyle = c.ink;
      q.lineWidth = Math.max(0.12, 0.7 / c.px);
      q.beginPath();
      q.moveTo(-0.7, -7.25);
      q.quadraticCurveTo(0.3, -6.0, 1.2, -7.25);
      q.stroke();
    });
    sk.blob(ell(0.3, -6.25, 0.28, 0.38), C.glow, { dark: C.glowSoft, d: 0.1, line: 0.5 });
    glowDot(sk, 0.3, -6.25, 0.9, 0.5);
  },
  head(sk, p, back) {
    const cx = 0.15;
    const cy = -2.95;
    if (back) longHair(sk, true);
    sk.blob(ell(cx, cy, 3.15, 3.05), W_SKIN, { dark: W_SKIN_D, d: 0.45 });
    if (back) {
      sk.blob(ell(cx, cy - 0.2, 3.3, 3.0), W_HAIR, { dark: W_HAIR_D, d: 0.4 });
    } else {
      // cheeks, eyes and mouth, then the nose over them
      sk.blob(ell(cx - 0.85, cy + 1.25, 0.6, 0.36), '#e89ab0', { line: 0, sil: false });
      face(sk, { x: cx + 0.4, y: cy + 0.3, eyes: p.eyes, mouth: p.mouth, gap: 2.1, drop: 2.15 });
      sk.blob((q) => {
        q.moveTo(cx + 0.7, cy + 0.95);
        q.quadraticCurveTo(cx + 1.5, cy + 1.15, cx + 2.65, cy + 1.95);
        q.quadraticCurveTo(cx + 1.7, cy + 2.0, cx + 0.9, cy + 1.75);
        q.closePath();
      }, W_SKIN, { dark: W_SKIN_D, d: 0.15, line: 0.55 });
      // a fringe of hair under the brim, and a lock down past the near cheek
      sk.blob((q) => {
        q.moveTo(cx - 3.25, cy + 1.2);
        q.quadraticCurveTo(cx - 3.4, cy - 2.0, cx - 0.6, cy - 2.6);
        q.quadraticCurveTo(cx + 2.4, cy - 2.7, cx + 3.15, cy - 0.6);
        q.quadraticCurveTo(cx + 2.0, cy - 1.4, cx + 1.1, cy - 0.85);
        q.quadraticCurveTo(cx + 0.2, cy - 1.6, cx - 0.9, cy - 0.85);
        q.quadraticCurveTo(cx - 1.9, cy - 1.0, cx - 2.3, cy + 0.2);
        q.quadraticCurveTo(cx - 2.6, cy + 1.6, cx - 3.25, cy + 1.2);
        q.closePath();
      }, W_HAIR, { dark: W_HAIR_D, d: 0.3 });
    }
    // the hat: a wide brim, gills under its front edge, a cone like a
    // pointed mushroom cap, its tip flopped back, pale spots on it, a band
    // with glowing toadstools sprouting from it
    const by = cy - 1.85;
    sk.blob(ell(cx + 0.15, by + 0.12, 4.9, 1.15, -0.04), shade(C.gill, -0.08), { line: 0.55 });
    sk.blob(ell(cx + 0.15, by - 0.08, 4.9, 1.0, -0.04), HAT, { dark: HAT_D, d: 0.35 });
    if (!back) {
      sk.draw((q, c) => {
        q.strokeStyle = withAlpha(shade(C.gill, -0.35), 0.9);
        q.lineWidth = Math.max(0.1, 0.6 / c.px);
        q.beginPath();
        for (let i = 0; i < 13; i++) {
          const a = Math.PI * (0.12 + (i / 12) * 0.76);
          const x = cx + 0.15 + Math.cos(a) * 4.7;
          const y = by + 0.15 + Math.sin(a) * 1.0;
          q.moveTo(x, y - 0.05);
          q.lineTo(x * 0.92 + (cx + 0.15) * 0.08, y + 0.18);
        }
        q.stroke();
      });
    }
    sk.blob((q) => {
      q.moveTo(cx - 2.45, by - 0.25);
      q.quadraticCurveTo(cx - 1.75, by - 2.2, cx - 0.6, by - 2.95);
      q.quadraticCurveTo(cx + 0.15, by - 3.45, cx - 0.55, by - 3.6);
      q.quadraticCurveTo(cx - 1.65, by - 3.65, cx - 2.8, by - 2.95);
      q.quadraticCurveTo(cx - 1.35, by - 4.25, cx + 0.15, by - 3.95);
      q.quadraticCurveTo(cx + 1.3, by - 3.6, cx + 1.4, by - 2.6);
      q.quadraticCurveTo(cx + 1.8, by - 1.2, cx + 2.75, by - 0.25);
      q.quadraticCurveTo(cx + 0.15, by + 0.55, cx - 2.45, by - 0.25);
      q.closePath();
    }, HAT, { dark: HAT_D, d: 0.55 });
    for (const [x, y, r] of [[cx - 0.6, by - 1.9, 0.38], [cx + 0.9, by - 1.2, 0.3], [cx + 0.3, by - 2.75, 0.24], [cx - 1.5, by - 0.95, 0.26]] as const) {
      sk.blob(ell(x, y, r, r * 0.8), C.spot, { line: 0.45, sil: false });
    }
    sk.blob((q) => {
      q.moveTo(cx - 2.4, by - 0.3);
      q.quadraticCurveTo(cx + 0.15, by + 0.45, cx + 2.75, by - 0.3);
      q.lineTo(cx + 2.4, by - 1.0);
      q.quadraticCurveTo(cx + 0.1, by - 0.35, cx - 2.15, by - 1.0);
      q.closePath();
    }, SASH, { dark: SASH_D, d: 0.15 });
    for (const [x, h, r] of [[cx - 1.9, 1.0, 0.5], [cx - 1.15, 1.45, 0.62], [cx - 0.45, 0.85, 0.42]] as const) {
      const y = by - 0.6;
      sk.limb([x, y, x + 0.05, y - h], 0.2, C.stalk, { line: 0.5 });
      sk.blob((q) => {
        q.moveTo(x - r, y - h + 0.05);
        q.quadraticCurveTo(x - r, y - h - r * 1.1, x + 0.05, y - h - r * 1.1);
        q.quadraticCurveTo(x + r, y - h - r * 1.1, x + r, y - h + 0.05);
        q.closePath();
      }, C.glow, { dark: C.glowSoft, d: 0.12, line: 0.5 });
    }
    glowDot(sk, cx - 1.15, by - 1.9, 1.6, 0.4);
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0.05, WITCH_BONES.upper], 1.2, k ? ROBE_D : ROBE, { dark: k ? null : ROBE_D });
  },
  fore(sk, p, k) {
    const f = WITCH_BONES.fore;
    // a bell sleeve, wide at the cuff
    sk.blob((q) => {
      q.moveTo(-0.55, -0.1);
      q.lineTo(0.55, -0.1);
      q.lineTo(0.95, f - 0.55);
      q.quadraticCurveTo(0.0, f - 0.15, -0.95, f - 0.55);
      q.closePath();
    }, k ? ROBE_D : ROBE, { dark: k ? null : ROBE_D, d: 0.25 });
    sk.blob(circ(0, f + 0.05, 0.55), k ? W_SKIN_D : W_SKIN, { dark: W_SKIN_D, d: 0.2 });
    if (k === 0 && (p.act === 'work' || p.act === 'celebrate')) {
      // the long ladle: its handle up past the fist, the bowl down in the
      // pot (stirring) or held high (a cackle)
      const tip = p.act === 'work' ? 0.55 : 0.55 + (Math.PI - 0.25) * env(p.u, 0.18, 0.82);
      atHand(sk, p, 0, f + 0.05, () => {
        sk.at(turn(-tip), () => {
          sk.limb([0, -1.1, 0, 4.0], 0.32, LADLE, { dark: LADLE_D });
          sk.blob((q) => {
            q.moveTo(-0.75, 4.0);
            q.lineTo(0.75, 4.0);
            q.quadraticCurveTo(0.7, 5.2, 0, 5.2);
            q.quadraticCurveTo(-0.7, 5.2, -0.75, 4.0);
            q.closePath();
          }, LADLE, { dark: LADLE_D, d: 0.2 });
        });
        sk.blob(circ(0, 0, 0.5), W_SKIN, { dark: W_SKIN_D, d: 0.2 });
      });
    }
  },
};

// At the cauldron: the ladle going round the pot in both hands, leaning
// in to peer at the brew, a sniff now and then.
const witchWork: NpcLoop = {
  secs: 2.0,
  pose(u) {
    const a = u * TAU;
    const peer = bump(u, 0.45, 0.85);
    return {
      ...rest(),
      bob: 0.06 * Math.sin(a * 2),
      lean: 0.12 + 0.05 * Math.sin(a),
      tilt: 0.1 + 0.12 * peer,
      arms: [
        { sh: 1.15 + 0.28 * Math.sin(a), el: 0.55 + 0.3 * Math.cos(a) },
        { sh: 1.0 + 0.28 * Math.sin(a + 0.4), el: 0.95 + 0.3 * Math.cos(a + 0.4) },
      ],
      eyes: peer > 0.7 ? 'happy' : 'open',
      mouth: peer > 0.5 ? 'o' : 'smile',
    };
  },
};

// A cackle: both arms flung up and out (the near one up behind her head,
// the far one up in front, hands clear of her face), the ladle swung high,
// head thrown back, shaking with laughter; from rest and back.
const witchCelebrate: NpcLoop = {
  secs: 1.8,
  pose(u) {
    const k = env(u, 0.18, 0.82);
    const shake = Math.sin(u * TAU * 5);
    return {
      ...rest(),
      bob: 0.12 * Math.abs(shake) * k,
      lean: -0.1 * k,
      tilt: -0.22 * k + 0.05 * shake * k,
      arms: [
        swing(-1.95 * k, -0.95 * k),
        swing(1.7 * k, 0.7 * k),
      ],
      eyes: k > 0.35 ? 'happy' : 'open',
      mouth: k > 0.35 ? 'open' : 'smile',
    };
  },
};

// Mushroom tea: a squat clay cup, a little cap floating in it, steam.
const brew: NpcServe = {
  name: 'brew',
  drink: true,
  draw(sk) {
    sk.blob((q) => {
      q.moveTo(-0.95, -0.55);
      q.lineTo(0.95, -0.55);
      q.quadraticCurveTo(0.9, 0.9, 0, 0.95);
      q.quadraticCurveTo(-0.9, 0.9, -0.95, -0.55);
      q.closePath();
    }, '#b07a58', { dark: '#8a5a40', d: 0.2 });
    sk.limb([0.9, -0.2, 1.4, 0.0, 0.85, 0.5], 0.22, '#b07a58', { dark: '#8a5a40', line: 0.5 });
    sk.blob(ell(0, -0.55, 0.85, 0.24), '#8a6a3a', { line: 0.5 });
    sk.blob(ell(0.2, -0.62, 0.32, 0.13), C.capTan, { line: 0.4 });
    sk.limb([-0.3, -1.0, -0.05, -1.7, -0.35, -2.4], 0.16, withAlpha('#ffffff', 0.75), { line: 0, sil: false });
  },
};

const witch: Npc = {
  name: 'witch',
  station: 'run',
  // at the cauldron's far side, past the fire's stones, turned along to it
  place: { mode: 'standing', u: -1.6, v: POT.v, look: 'along' },
  tall: 16,
  bones: WITCH_BONES,
  parts: witchParts,
  work: witchWork,
  celebrate: witchCelebrate,
  serve: brew,
};

// ── the myconid ──────────────────────────────────────────────────────────
// A little mushroom person on the moss in the middle of the ring: a plump
// cream stalk for a body, a frill round its neck, a round face under a
// big violet cap dotted with glowing spots, stubby arms. At work it sways,
// eyes shut, and now and then its cap gives a squeeze and a puff of
// glowing spores floats up; its show is the spore dance, bouncing, arms
// waving, a burst of spores on every beat.

const STALK = C.stalk;
const STALK_D = '#c9bb98';
const CAP = C.capViolet;
const CAP_D = '#68398f';
const GILLS = '#e2cfa8';
const BLUSH = '#f0a0b8';

const MYC_BONES: Bones = { neck: [0.1, -5.5], shoulders: [[-1.85, -4.3], [1.95, -4.3]], upper: 1.15, fore: 1.1 };

// How squeezed its cap is (0 to 1) and how far its spores have risen (0
// none, then 0 to 1) at this frame.
function puffOf(p: Puppet): { squeeze: number; rise: number } {
  if (p.act === 'work') return { squeeze: bump(p.u, 0.5, 0.68), rise: p.u > 0.58 ? (p.u - 0.58) / 0.42 : -1 };
  if (p.act === 'show') {
    const b = (p.u * 4) % 1;
    return { squeeze: bump(b, 0.0, 0.3), rise: b > 0.15 ? (b - 0.15) / 0.85 : -1 };
  }
  if (p.act === 'celebrate') return { squeeze: bump(p.u, 0.2, 0.45), rise: p.u > 0.3 ? (p.u - 0.3) / 0.7 : -1 };
  return { squeeze: 0, rise: -1 };
}

const mycParts: NpcParts = {
  body(sk, p, back) {
    // stubby feet, poking forward from under it (kicking up in the dance)
    const kick = p.act === 'show' ? Math.sin(p.u * TAU * 4) : 0;
    for (const [x, near, k] of [[1.2, false, -kick], [-0.2, true, kick]] as const) {
      const lift = Math.max(0, k) * 0.6;
      sk.blob(ell(x + 0.9, -1.0 - lift, 0.95, 0.6, -0.2 - lift * 0.4), near ? STALK : STALK_D, { dark: near ? STALK_D : null, d: 0.2 });
    }
    // the plump stalk, a bulb at its foot
    sk.blob((q) => {
      q.moveTo(-1.55, -5.55);
      q.quadraticCurveTo(0.1, -5.9, 1.75, -5.55);
      q.quadraticCurveTo(2.0, -4.0, 2.55, -2.5);
      q.quadraticCurveTo(2.75, -0.85, 0.15, -0.8);
      q.quadraticCurveTo(-2.5, -0.85, -2.35, -2.5);
      q.quadraticCurveTo(-1.9, -4.0, -1.55, -5.55);
      q.closePath();
    }, STALK, { dark: STALK_D, d: 0.55 });
    // a belly button of a speck, and a little moss on its foot
    if (!back) sk.blob(ell(0.55, -2.6, 0.2, 0.14), STALK_D, { line: 0, sil: false });
    sk.blob((q) => {
      q.moveTo(-2.45, -1.6);
      q.quadraticCurveTo(-1.9, -2.1, -1.2, -1.55);
      q.quadraticCurveTo(-0.9, -0.85, -1.6, -0.82);
      q.quadraticCurveTo(-2.4, -0.9, -2.45, -1.6);
      q.closePath();
    }, C.mossLight, { dark: C.moss, d: 0.12, line: 0.5 });
    // the frill round its neck
    sk.blob((q) => {
      q.moveTo(-2.05, -5.05);
      for (let i = 0; i <= 8; i++) {
        const x = -2.05 + (i / 8) * 4.3;
        q.quadraticCurveTo(x - 0.27, -4.3 - (i % 2) * 0.12, x, -4.65);
      }
      q.lineTo(2.25, -5.35);
      q.quadraticCurveTo(0.1, -6.0, -2.05, -5.35);
      q.closePath();
    }, GILLS, { dark: shade(GILLS, -0.18), d: 0.2, line: 0.55 });
  },
  head(sk, p, back) {
    const { squeeze, rise } = puffOf(p);
    // its face on the stalk's top, under the cap
    sk.blob((q) => q.roundRect(-2.15, -3.5, 4.4, 3.85, 1.5), STALK, { dark: STALK_D, d: 0.45 });
    if (!back) {
      sk.blob(ell(-0.85, -0.85, 0.6, 0.36), BLUSH, { line: 0, sil: false });
      sk.blob(ell(1.95, -0.85, 0.48, 0.33), BLUSH, { line: 0, sil: false });
      face(sk, { x: 0.55, y: -1.55, eyes: p.eyes, mouth: p.mouth, gap: 2.25, r: 0.68, drop: 1.05 });
    }
    // the cap: gills under its rim, then the dome, squeezed in a puff
    const sq = 0.18 * squeeze;
    const rx = 4.35 * (1 + sq * 0.6);
    const top = -7.2 + 1.3 * sq;
    const rim = -2.85;
    sk.blob(ell(0.1, rim, rx * 0.93, 0.95), GILLS, { dark: shade(GILLS, -0.2), d: 0.25 });
    if (!back) {
      sk.draw((q, c) => {
        q.strokeStyle = withAlpha(shade(GILLS, -0.4), 0.8);
        q.lineWidth = Math.max(0.1, 0.55 / c.px);
        q.beginPath();
        for (let i = 1; i < 10; i++) {
          const a = Math.PI * (i / 10);
          q.moveTo(0.1 + Math.cos(a) * rx * 0.3, rim + 0.15 + Math.sin(a) * 0.3);
          q.lineTo(0.1 + Math.cos(a) * rx * 0.88, rim + Math.sin(a) * 0.8);
        }
        q.stroke();
      });
    }
    sk.blob((q) => {
      q.moveTo(0.1 - rx, rim + 0.1);
      q.bezierCurveTo(0.1 - rx * 1.05, top + 1.2, 0.1 - rx * 0.45, top, 0.1, top);
      q.bezierCurveTo(0.1 + rx * 0.45, top, 0.1 + rx * 1.05, top + 1.2, 0.1 + rx, rim + 0.1);
      q.quadraticCurveTo(0.1, rim - 0.9, 0.1 - rx, rim + 0.1);
      q.closePath();
    }, CAP, { dark: CAP_D, d: 0.7 });
    // a sheen, and the glowing spots
    sk.blob(ell(-1.4, top + 1.05, 1.1, 0.42, -0.3), withAlpha('#ffffff', 0.3), { line: 0, sil: false });
    const spots: ReadonlyArray<readonly [number, number, number]> = back
      ? [[-2.2, -4.0, 0.5], [0.6, -5.4, 0.55], [2.6, -3.9, 0.45], [-0.6, -3.5, 0.35]]
      : [[-2.4, -3.9, 0.45], [-0.3, -5.6, 0.5], [1.7, -4.6, 0.62], [3.2, -3.5, 0.4], [0.4, -3.6, 0.35]];
    const glow = 0.35 + 0.5 * squeeze;
    for (const [x, y, r] of spots) {
      const yy = y + (y - rim) * -sq * 0.9;
      sk.blob(ell(x * (1 + sq * 0.6), yy, r, r * 0.75), C.glowHot, { dark: C.glow, d: 0.1, line: 0.45, sil: false });
      glowDot(sk, x * (1 + sq * 0.6), yy, r * 2.6, glow);
    }
    // a puff of spores rising off the cap, spreading and fading
    if (rise >= 0) {
      const up = p.act === 'work' ? 1.5 : 2.4;
      for (let i = 0; i < 8; i++) {
        const sx = Math.sin(i * 2.4) * (1.0 + 2.6 * rise) + 0.1;
        const sy = top + 0.2 - rise * (up + (i % 3) * 0.3 * up) - (p.act === 'work' ? 0 : (i % 2) * 0.5);
        const a = (1 - rise * rise) * 0.95;
        glowDot(sk, sx, sy, 1.0, a);
        if (rise < 0.85) sk.blob(circ(sx, sy, 0.2 + 0.07 * (i % 2)), C.glowHot, { line: 0, sil: false });
      }
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, MYC_BONES.upper], 1.05, k ? STALK_D : STALK, { dark: k ? null : STALK_D });
  },
  fore(sk, _p, k) {
    const f = MYC_BONES.fore;
    sk.limb([0, 0, 0, f - 0.2], 0.95, k ? STALK_D : STALK, { dark: k ? null : STALK_D });
    sk.blob(ell(0, f, 0.58, 0.52), k ? STALK_D : STALK, { dark: STALK_D, d: 0.15 });
  },
};

// In the ring: a slow sway, eyes shut, hands on its knees; a squeeze of the
// cap and a puff of spores drifting up.
const mycWork: NpcLoop = {
  secs: 2.0,
  pose(u) {
    const sway = Math.sin(u * TAU);
    const sq = bump(u, 0.5, 0.68);
    return {
      ...rest(),
      bob: -0.2 * sq,
      lean: 0.07 * sway,
      tilt: -0.05 * sway - 0.06 * sq,
      arms: [{ sh: 0.55 + 0.08 * sway, el: 0.35 }, { sh: 0.55 - 0.08 * sway, el: 0.35 }],
      eyes: sq > 0.3 ? 'happy' : 'shut',
      mouth: sq > 0.3 ? 'o' : 'smile',
    };
  },
};

// The spore dance: up off the moss, bouncing on every beat, arms out to
// either side and waving up in turn (the near one up behind its head, the
// far one up in front, its stubby hands never over its face), a burst of
// spores off its cap each bounce.
const mycShow: NpcLoop & { crowd: 'dance' } = {
  secs: 3.2,
  crowd: 'dance',
  pose(u) {
    const b = (u * 4) % 1;
    const hop = Math.sin(b * Math.PI);
    const side = Math.sin(u * TAU * 2);
    return {
      ...rest(),
      bob: 0.5 + 0.9 * hop,
      lean: 0.12 * side,
      tilt: -0.1 * side,
      arms: [
        { sh: -1.3 - 0.5 * side, el: -0.6 - 0.3 * Math.max(0, side) },
        { sh: 1.4 - 0.5 * side, el: 0.6 + 0.3 * Math.max(0, -side) },
      ],
      eyes: 'happy',
      mouth: hop > 0.5 ? 'open' : 'smile',
    };
  },
};

// A hop and a great puff, both arms up and out (the near one up behind
// its head, the far one up in front, hands beside its face); from rest
// and back.
const mycCelebrate: NpcLoop = {
  secs: 1.6,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    return { ...rest(), bob: 0.9 * bump(u, 0.15, 0.6), tilt: -0.1 * k, arms: [swing(-1.9 * k, -0.9 * k), swing(1.7 * k, 0.7 * k)], eyes: k > 0.3 ? 'happy' : 'open', mouth: k > 0.3 ? 'open' : 'smile' };
  },
};

const myconid: Npc = {
  name: 'myconid',
  station: 'think',
  // on the moss cushion in the middle of the ring
  place: { mode: 'seated', u: RING.u, v: RING.v, z: 0 },
  // its cap tops 13; its spores drift up past that
  tall: 15,
  bones: MYC_BONES,
  parts: mycParts,
  work: mycWork,
  show: mycShow,
  celebrate: mycCelebrate,
};

export const NPCS: readonly Npc[] = [herbalist, witch, myconid];
