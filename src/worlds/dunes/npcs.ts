import { shade } from '../../art/iso.ts';
import { bump, ease, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, inFrame, reach, seen, toBody } from '../../art/npc/helpers.ts';
import { move, mul, turn } from '../../art/figure/paint.ts';
import type { Sketch } from '../../art/figure/paint.ts';
import type { Color, Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet, Swing } from '../types.ts';
import { C } from './kit.ts';
import type {  } from './kit.ts';
import { BAR, CRANK, SPY } from './stations.ts';

// The outpost's locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the outpost's leather-brown ink: the mechanic
// cranking the generator from the floor before it, the lookout on its
// stool at the spyglass, and the barkeep behind the bar (each station
// leaves it room: see CRANK, SPY and BAR in ./stations.ts). None wears the
// drifters' straw hat or rawhide coat.

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
type Pt = [number, number];

// ── the mechanic ─────────────────────────────────────────────────────────
// Before the generator, cranking: a wiry mechanic with spiky black hair,
// brass goggles pushed up on its forehead, a grease-smudged cream vest,
// its rust-orange coveralls' top half tied round its waist by the sleeves,
// a wrench on its hip and leather gloves. At work it turns the crank in
// its far hand (it draws the crank: see CRANK), its other fist on its
// hip, leaning into each turn; it celebrates wiping its brow, then a
// thumbs-up.

const M = {
  skin: '#b97a4e',
  skinD: '#8e5a36',
  hair: '#2e221c',
  hairD: '#1c1410',
  vest: '#efe2c4',
  vestD: '#cdbb98',
  suit: '#c8642e',
  suitD: '#984620',
  boot: '#5a3e2b',
  bootD: '#3e2a1c',
  glove: '#6a4a2e',
  gloveD: '#4a321e',
  strap: '#4a3020',
  grease: '#8a7a62',
};
const MECH_BONES: Bones = { neck: [0.2, -7.75], shoulders: [[-1.7, -7.15], [1.75, -7.2]], upper: 1.85, fore: 1.75 };
const MECH_AT = { u: 2.8, v: 12.5 };
// The crank's hub in the mechanic's frame, and a turn of it: the pin
// round the hub on the wheel's face, the grip standing out toward us.
const HUB = seen(MECH_AT, [CRANK.u, CRANK.v, CRANK.z]);
const crankAt = (a: number): { pin: Pt; end: Pt; grip: Pt } => {
  const pin: Pt = [HUB[0] + CRANK.r * Math.cos(a), HUB[1] + (CRANK.r * Math.cos(a)) / 2 - CRANK.r * Math.sin(a)];
  const out = seen({ u: 0, v: 0 }, [0, CRANK.out, 0]);
  return { pin, end: [pin[0] + out[0], pin[1] + out[1]], grip: [pin[0] + out[0] * 0.62, pin[1] + out[1] * 0.62] };
};
// The crank's angle in the wheel's face (from +u toward +z): turned
// clockwise as we see it, once a work loop; spinning on by itself while
// the mechanic does anything else.
const A0 = 0.6;
const crankAngle = (p: Puppet) => A0 - TAU * p.u * (p.act === 'work' ? 1 : 1.5);

const mechParts: NpcParts = {
  body(sk, p, back) {
    // the crank, behind the mechanic: the arm from the hub, the grip
    inFrame(sk, () => {
      const { pin, end } = crankAt(crankAngle(p));
      sk.limb([...HUB, ...pin], 0.42, C.scrapDark, { dark: shade(C.scrapDark, -0.2) });
      sk.limb([...pin, ...end], 0.5, C.woodLight, { dark: C.wood });
      sk.blob(circ(HUB[0], HUB[1], 0.5), C.brass, { dark: C.brassDark, d: 0.15 });
    });
    // legs in the coveralls, work boots; the far one first
    for (const [x, near] of [[0.95, false], [-0.75, true]] as const) {
      sk.limb([x, -4.0, x + 0.1, -1.0], 1.35, near ? M.suit : M.suitD, { dark: near ? M.suitD : null });
      sk.blob((q) => q.roundRect(x - 0.62, -1.25, 1.7, 1.25, 0.5), near ? M.boot : M.bootD, { dark: M.bootD, d: 0.2 });
    }
    // the vest
    sk.blob((q) => {
      q.moveTo(-1.85, -7.5);
      q.quadraticCurveTo(0.2, -8.0, 2.05, -7.55);
      q.lineTo(2.25, -4.1);
      q.quadraticCurveTo(0.2, -3.7, -1.95, -4.1);
      q.closePath();
    }, M.vest, { dark: M.vestD, d: 0.5 });
    if (!back) {
      // grease on it
      sk.blob(ell(0.9, -5.6, 0.45, 0.3, 0.4), M.grease, { line: 0, sil: false });
      sk.blob(ell(-0.6, -6.6, 0.3, 0.2, -0.3), M.grease, { line: 0, sil: false });
    }
    // the coveralls' top half tied round the waist, the sleeves knotted
    // at the front and hanging
    sk.blob((q) => q.roundRect(-2.15, -4.75, 4.55, 1.25, 0.55), M.suit, { dark: M.suitD, d: 0.3 });
    if (!back) {
      sk.limb([1.95, -4.1, 2.35, -3.2, 2.2, -2.3], 0.62, M.suit, { dark: M.suitD });
      sk.limb([1.75, -4.1, 1.3, -3.1, 1.45, -2.4], 0.62, M.suitD);
      sk.blob(circ(1.85, -4.2, 0.5), M.suit, { dark: M.suitD, d: 0.15 });
    }
    // a wrench on the near hip
    sk.limb([-2.0, -4.0, -2.25, -2.3], 0.34, C.steel, { dark: C.steelDark });
    sk.blob((q) => {
      q.arc(-2.28, -2.05, 0.45, 0, TAU);
    }, C.steel, { dark: C.steelDark, d: 0.1 });
    sk.blob(circ(-2.2, -1.9, 0.18), M.boot, { line: 0, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx + (back ? 2.95 : -2.95), cy + 0.65, 0.62, 0.78), M.skin, { dark: M.skinD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.3, 3.15), M.skin, { dark: M.skinD, d: 0.45 });
    // spiky black hair over the top and back
    sk.blob((q) => {
      q.moveTo(cx - 3.3, cy + 0.6);
      q.quadraticCurveTo(cx - 3.6, cy - 2.2, cx - 2.4, cy - 3.1);
      q.lineTo(cx - 2.7, cy - 4.0);
      q.lineTo(cx - 1.2, cy - 3.55);
      q.lineTo(cx - 0.6, cy - 4.25);
      q.lineTo(cx + 0.5, cy - 3.7);
      q.lineTo(cx + 1.5, cy - 4.1);
      q.lineTo(cx + 2.0, cy - 3.3);
      q.lineTo(cx + 3.2, cy - 3.3);
      q.quadraticCurveTo(cx + 3.6, cy - 2.2, cx + 3.3, cy - 1.4);
      q.quadraticCurveTo(cx + 1.4, cy - 2.3, cx - 1.0, cy - 1.7);
      q.quadraticCurveTo(cx - 1.9, cy - 0.9, cx - 2.6, cy + 0.9);
      q.closePath();
    }, M.hair, { dark: M.hairD, d: 0.3 });
    // the goggles' strap round the head, the goggles up on the forehead
    sk.limb([cx - 3.25, cy - 0.4, cx - 1.2, cy - 1.75, cx + 1.4, cy - 2.05, cx + 3.25, cy - 1.45], 0.42, M.strap);
    if (!back) {
      for (const [gx, r] of [[cx + 0.35, 0.78], [cx + 2.15, 0.66]] as const) {
        sk.blob(circ(gx, cy - 1.8, r), C.brass, { dark: C.brassDark, d: 0.12 });
        sk.blob(circ(gx, cy - 1.8, r * 0.62), C.turquoise, { dark: C.turquoiseDark, d: 0.12, line: 0.5 });
        sk.blob(circ(gx - r * 0.25, cy - 2.0, r * 0.18), '#e8fbf6', { line: 0, sil: false });
      }
      face(sk, { x: cx + 0.6, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
      // a smudge of grease on the cheek
      sk.blob(ell(cx - 0.95, cy + 1.55, 0.42, 0.22, -0.3), M.grease, { line: 0, sil: false });
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, MECH_BONES.upper], 1.15, k ? M.skinD : M.skin, { dark: k ? null : M.skinD });
  },
  fore(sk, p, k) {
    const f = MECH_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 0.95, k ? M.skinD : M.skin, { dark: k ? null : M.skinD });
    sk.limb([0, f - 0.7, 0, f - 0.35], 1.1, M.glove, { dark: M.gloveD });
    // a thumb up, celebrating
    if (k === 1 && p.act === 'celebrate' && p.u > 0.5 && p.u < 0.95) atHand(sk, p, 1, f, () => sk.limb([0, 0, 0.05, -1.0], 0.42, M.glove, { dark: M.gloveD }));
    sk.blob(circ(0, f, 0.66), k ? M.gloveD : M.glove, { dark: M.gloveD, d: 0.2 });
  },
};

// Its far hand on the crank's grip, wherever the crank is.
function onCrank(p: Puppet, a: number): Swing {
  return reach(MECH_BONES, 1, ...toBody(p, ...crankAt(a).grip), true);
}
const ON_HIP: Swing = { sh: -0.5, el: 1.3 };

// Cranking: one turn a loop, leaning into the push and back with the
// pull, a bob with the effort.
const mechWork: NpcLoop = {
  secs: 2.0,
  pose(u) {
    const a = A0 - TAU * u;
    const push = Math.cos(a);
    const p: Puppet = { ...rest(), u, bob: 0.12 * Math.abs(Math.sin(a)), lean: 0.05 + 0.05 * push, tilt: 0.06 + 0.06 * push, eyes: u > 0.83 && u < 0.92 ? 'blink' : 'open', mouth: push > 0.5 ? 'closed' : 'smile' };
    return { ...p, arms: [ON_HIP, onCrank(p, a)] };
  },
};

// Done: a gloved hand wiped across its brow, then a thumbs-up and a grin.
const mechCelebrate: NpcLoop = {
  secs: 2.0,
  pose(u) {
    const wipe = bump(u, 0.05, 0.5);
    const across = ease(u, 0.12, 0.42);
    const up = bump(u, 0.45, 1.0) ** 0.6;
    return {
      ...rest(),
      tilt: -0.1 * wipe - 0.06 * up,
      lean: -0.03 * wipe,
      arms: [swing(2.35 * wipe, (1.55 - 0.45 * across) * wipe), swing(1.45 * up, 1.35 * up)],
      eyes: wipe > 0.4 ? 'shut' : up > 0.4 ? 'happy' : 'open',
      mouth: wipe > 0.4 ? 'o' : up > 0.3 ? 'open' : 'smile',
    };
  },
};

const mechanic: Npc = {
  name: 'mechanic',
  station: 'run',
  // on the floor before the generator's sled, turning the crank on the
  // wheel's face (deeper than it, so up and to the right on screen)
  place: { mode: 'standing', u: MECH_AT.u, v: MECH_AT.v, look: 'along' },
  tall: 15,
  bones: MECH_BONES,
  parts: mechParts,
  work: mechWork,
  celebrate: mechCelebrate,
};

// ── the lookout ──────────────────────────────────────────────────────────
// On a stool at the spyglass, its eye to the glass: a lean nomad in a long
// sand robe with a rust sash, a turquoise head wrap with its veil loose
// round its neck, a leather strap across its chest with a brass compass.
// At work it peers, twisting the focus ring, then sits back, rubs its eye
// and shades it with a hand to look out bare-eyed, and back to the glass.

const L = {
  skin: '#8a5a3c',
  skinD: '#6a4228',
  wrap: C.turquoiseDark,
  wrapL: C.turquoise,
  wrapD: '#1f6a61',
  robe: '#e6d2aa',
  robeD: '#c2a87c',
  sash: C.rust,
  sashD: C.rustDark,
  strap: '#6a4428',
  boot: '#7a5232',
  bootD: '#5a3a22',
};
const LOOK_BONES: Bones = { neck: [0.35, -5.95], shoulders: [[-1.45, -5.4], [1.85, -5.4]], upper: 1.8, fore: 1.7 };
// Where its eye meets the eyepiece (see SPY): its frame, seated.
const SEAT = SPY.seat;
const EYE = seen(SEAT, SPY.eye);
const TUBE_DIR = (() => {
  const a = seen(SEAT, SPY.eye);
  const b = seen(SEAT, [SPY.eye[0] + SPY.dir[0], SPY.eye[1] + SPY.dir[1], SPY.eye[2] + SPY.dir[2]]);
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return [(b[0] - a[0]) / l, (b[1] - a[1]) / l] as Pt;
})();
// Along the glass from the eyepiece: its screen length a unit of tube.
const TUBE_K = (() => {
  const b = seen({ u: 0, v: 0 }, SPY.dir);
  return Math.hypot(b[0], b[1]);
})();
const onTube = (s: number): Pt => [EYE[0] + TUBE_DIR[0] * TUBE_K * s, EYE[1] + TUBE_DIR[1] * TUBE_K * s];

const lookParts: NpcParts = {
  body(sk, _p, back) {
    // the legs: thighs forward along the stool, shins down, soft boots
    for (const [dy, near] of [[-0.35, false], [0.15, true]] as const) {
      const c = near ? L.robe : L.robeD;
      sk.limb([-0.3, -1.6 + dy, 2.4, -1.35 + dy], 1.45, c, { dark: near ? L.robeD : null });
      sk.limb([2.5, -1.3 + dy, 2.75 + (near ? 0 : 0.4), 1.4 + dy], 1.15, near ? L.robeD : shade(L.robeD, -0.1));
      sk.blob((q) => q.roundRect(2.2 + (near ? 0 : 0.4), 1.25 + dy, 1.75, 1.0, 0.45), near ? L.boot : L.bootD, { dark: L.bootD, d: 0.2 });
    }
    // the robe from the shoulders to the stool, its skirt over the thighs
    sk.blob((q) => {
      q.moveTo(-1.7, -5.75);
      q.quadraticCurveTo(0.35, -6.3, 2.15, -5.75);
      q.quadraticCurveTo(2.5, -3.6, 2.1, -2.25);
      q.lineTo(2.9, -1.6);
      q.lineTo(2.9, -0.55);
      q.quadraticCurveTo(0.8, -0.35, -1.6, -0.8);
      q.quadraticCurveTo(-2.1, -3.2, -1.7, -5.75);
      q.closePath();
    }, L.robe, { dark: L.robeD, d: 0.45 });
    // the sash
    sk.limb([-1.75, -2.6, 0.3, -2.75, 2.2, -2.6], 0.75, L.sash, { dark: L.sashD });
    if (back) return;
    // a strap across the chest, a brass compass on it
    sk.limb([-1.4, -5.6, 0.4, -4.1, 1.9, -2.9], 0.38, L.strap);
    sk.blob(circ(0.75, -3.85, 0.55), C.brass, { dark: C.brassDark, d: 0.12 });
    sk.blob(circ(0.75, -3.85, 0.3), C.cream, { line: 0.5, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the veil loose round its neck
    sk.blob(ell(cx + 0.2, cy + 3.0, 2.3, 0.85), L.wrap, { dark: L.wrapD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.25, 3.1), L.skin, { dark: L.skinD, d: 0.45 });
    // the wrap: wound round the head over the brow, its tail at the back
    sk.limb([cx - 2.6, cy - 0.6, cx - 3.4, cy + 1.4, cx - 3.0, cy + 2.8], 0.85, L.wrapD);
    sk.blob((q) => {
      q.moveTo(cx - 3.35, cy + 0.2);
      q.quadraticCurveTo(cx - 3.6, cy - 3.7, cx + 0.2, cy - 4.05);
      q.quadraticCurveTo(cx + 3.5, cy - 3.9, cx + 3.45, cy - 1.0);
      q.quadraticCurveTo(cx + 1.5, cy - 1.75, cx - 0.4, cy - 1.45);
      q.quadraticCurveTo(cx - 2.2, cy - 1.1, cx - 3.35, cy + 0.2);
      q.closePath();
    }, L.wrap, { dark: L.wrapD, d: 0.35 });
    if (!back) {
      // its windings
      sk.limb([cx - 2.6, cy - 1.05, cx - 0.5, cy - 2.2, cx + 2.9, cy - 2.2], 0.22, L.wrapL, { line: 0, sil: false });
      sk.limb([cx - 2.9, cy - 2.2, cx - 0.4, cy - 3.3, cx + 2.4, cy - 3.25], 0.2, L.wrapL, { line: 0, sil: false });
      const glass = p.act === 'work' && peer(p.u) > 0.9;
      face(sk, { x: cx + 0.6, y: cy + 0.75, eyes: glass ? 'shut' : p.eyes, mouth: p.mouth });
      if (glass) {
        // the end of the glass at its eye (the rest is the station's)
        inFrame(sk, () => {
          const a = onTube(-0.05);
          const b = onTube(0.9);
          sk.limb([...a, ...b], 0.62, C.brass, { dark: C.brassDark });
          sk.blob(ell(a[0], a[1], 0.42, 0.55), shade(C.brass, 0.1), { dark: C.brassDark, d: 0.12 });
        });
      }
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, LOOK_BONES.upper], 1.25, k ? L.robeD : L.robe, { dark: k ? null : L.robeD });
  },
  fore(sk, _p, k) {
    const f = LOOK_BONES.fore;
    sk.limb([0, 0, 0, f - 0.5], 1.15, k ? L.robeD : L.robe, { dark: k ? null : L.robeD });
    sk.blob(circ(0, f - 0.05, 0.6), k ? L.skinD : L.skin, { dark: L.skinD, d: 0.2 });
  },
};

// Its work, in twelfths of the loop, each change eased over two of them:
// at the glass (the first third); back from it (to a half), rubbing its
// eye with its near hand (to 7/12), its far hand still on the tube; that
// hand to its brow as the other goes back to its knee (to 3/4), looking
// out bare-eyed (to 5/6); and in again (to the end).
const peer = (u: number) => 1 - ease(u, 4 / 12, 6 / 12) + ease(u, 10 / 12, 1);
const rubbing = (u: number) => ease(u, 4 / 12, 6 / 12) - ease(u, 7 / 12, 9 / 12);
const shading = (u: number) => ease(u, 7 / 12, 9 / 12) - ease(u, 10 / 12, 1);
// Its lean and nod at the glass (its eye then sits at SPY's eyepiece), its
// near hand on its knee and up at its eye, its far hand up at its brow.
const PEER = { lean: 0.12, tilt: 0.1 };
const ON_KNEE: Swing = { sh: 0.45, el: 0.55 };
const AT_EYE: Swing = { sh: 1.75, el: 2.05 };
const AT_BROW: Swing = { sh: 2.55, el: 2.1 };

// Peering, its far hand under the draw tube twisting the focus back and
// forth; then back from the glass for a rub of the eye and a hand to its
// brow, looking out bare-eyed; and in again.
const lookWork: NpcLoop = {
  secs: 3.6,
  pose(u) {
    const k = peer(u);
    const rub = rubbing(u);
    const shadeIt = shading(u);
    const p: Puppet = { ...rest(), u, lean: 0.02 + (PEER.lean - 0.02) * k, tilt: PEER.tilt * k };
    // at the glass
    const twist = Math.sin(u * TAU * 3);
    const ring = onTube(1.35 + 0.12 * twist);
    const at = reach(LOOK_BONES, 1, ...toBody(p, ring[0], ring[1] + 0.5), true);
    const near: Swing = { sh: ON_KNEE.sh + (AT_EYE.sh - ON_KNEE.sh) * rub, el: ON_KNEE.el + (AT_EYE.el - ON_KNEE.el) * rub + 0.12 * Math.sin(u * TAU * 8) * rub };
    const far: Swing = { sh: at.sh + (AT_BROW.sh - at.sh) * shadeIt, el: at.el + (AT_BROW.el - at.el) * shadeIt };
    return {
      ...p,
      tilt: p.tilt - (0.05 + 0.06 * shadeIt) * (1 - k),
      arms: [near, far],
      eyes: k > 0.9 ? 'open' : rub > 0.5 ? 'shut' : 'open',
      mouth: k > 0.9 ? 'closed' : rub > 0.5 ? 'o' : 'smile',
    };
  },
};

const lookout: Npc = {
  name: 'lookout',
  station: 'search',
  // on the stool at the spyglass's near end, facing along it to the window
  place: { mode: 'seated', u: SEAT.u, v: SEAT.v, z: SEAT.z, look: 'along' },
  tall: 13,
  bones: LOOK_BONES,
  parts: lookParts,
  work: lookWork,
};

// ── the barkeep ──────────────────────────────────────────────────────────
// Behind the bar: a big, ruddy barkeep, bald under a rust bandana knotted
// at the back, a walrus moustache, a cream shirt with its sleeves rolled,
// a leather waistcoat and a hide apron. At work it polishes a tin cup with
// a rag and holds it up to the light; its show is a juggle of three
// bottles over its head; it serves a tin cup of cactus beer.

const B = {
  skin: '#d9926a',
  skinD: '#b06e4a',
  cheek: '#e86f5a',
  band: '#b8412a',
  bandD: '#8a2e1c',
  tache: '#9a5a2e',
  tacheD: '#723e1c',
  shirt: '#f0e4c8',
  shirtD: '#cdbd98',
  vest: '#5a3a24',
  vestD: '#3e2818',
  apron: C.hide,
  apronD: C.hideDark,
  legs: '#4a4038',
  rag: '#e8dcc0',
  tin: '#a6b0ba',
  tinD: '#7c8794',
};
const BAR_BONES: Bones = { neck: [0.15, -8.15], shoulders: [[-1.75, -7.5], [2.0, -7.55]], upper: 2.0, fore: 1.8 };

// A tin cup in the hand: a tapered can with a handle, beer and foam in it.
function tinCup(sk: Sketch, x: number, y: number, k = 1): void {
  sk.limb([x + 0.55 * k, y - 0.95 * k, x + 1.05 * k, y - 0.8 * k, x + 1.0 * k, y - 0.25 * k, x + 0.55 * k, y - 0.2 * k], 0.22 * k, B.tinD);
  sk.blob((q) => {
    q.moveTo(x - 0.62 * k, y - 1.2 * k);
    q.lineTo(x + 0.62 * k, y - 1.2 * k);
    q.lineTo(x + 0.5 * k, y + 0.15 * k);
    q.quadraticCurveTo(x, y + 0.3 * k, x - 0.5 * k, y + 0.15 * k);
    q.closePath();
  }, B.tin, { dark: B.tinD, d: 0.25 });
  sk.blob(ell(x, y - 1.2 * k, 0.62 * k, 0.22 * k), '#f6ecd0', { line: 0.5 });
  sk.blob(ell(x - 0.15 * k, y - 1.3 * k, 0.32 * k, 0.12 * k), '#ffffff', { line: 0, sil: false });
}

const tinCupServe: NpcServe = {
  name: 'tinCup',
  drink: true,
  draw(sk) {
    tinCup(sk, 0.2, 0.2);
  },
};

// A bottle centred on (x, y), turned `a` from upright.
function bottleAt(sk: Sketch, x: number, y: number, a: number, c: Color): void {
  sk.at(mul(move(x, y), turn(a)), () => {
    sk.blob((q) => {
      q.moveTo(-0.45, 1.15);
      q.lineTo(-0.45, -0.05);
      q.quadraticCurveTo(-0.45, -0.4, -0.18, -0.55);
      q.lineTo(-0.16, -1.15);
      q.lineTo(0.16, -1.15);
      q.lineTo(0.18, -0.55);
      q.quadraticCurveTo(0.45, -0.4, 0.45, -0.05);
      q.lineTo(0.45, 1.15);
      q.closePath();
    }, c, { dark: shade(c, -0.25), d: 0.15 });
    sk.blob((q) => q.roundRect(-0.36, 0.1, 0.72, 0.6, 0.1), C.cream, { line: 0.5, sil: false });
    sk.limb([-0.22, 0.95, -0.22, 0.2], 0.1, '#fff8e8', { line: 0, sil: false });
  });
}

// Three bottles in a cascade, hand to hand over its head, wide of its
// face: bottle i at phase w (0..1) of its round from the near hand to the
// far one and back, in the local's own frame (its foot, and its turn).
const HANDS: [Pt, Pt] = [[-4.4, -8.6], [5.3, -8.6]];
const PEAK = 7.6;
function juggleAt(w: number): { at: Pt; a: number } {
  const half = w < 0.5 ? 0 : 1;
  const s = (w % 0.5) / 0.5;
  const from = HANDS[half];
  const to = HANDS[1 - half];
  if (s < 0.2) {
    // in the hand, dipping to throw: the near hand holds it by its foot,
    // the far one by its neck
    const dip = Math.sin((s / 0.2) * Math.PI) * 0.5;
    return { at: [from[0], from[1] - 1.1 + dip], a: half * Math.PI };
  }
  // up and over, half a turn on the way
  const f = (s - 0.2) / 0.8;
  return { at: [from[0] + (to[0] - from[0]) * f, from[1] - 1.1 - 4 * PEAK * f * (1 - f)], a: (half + f) * Math.PI };
}
const BOTTLES: readonly Color[] = ['#4f8a5a', '#c07a2a', C.turquoiseDark];

const barParts: NpcParts = {
  body(sk, p, back) {
    // legs and boots (the bar hides them)
    for (const [x, near] of [[1.1, false], [-0.9, true]] as const) {
      sk.limb([x, -4.0, x + 0.1, -0.9], 1.5, near ? B.legs : shade(B.legs, -0.15));
      sk.blob((q) => q.roundRect(x - 0.6, -1.1, 1.8, 1.1, 0.45), '#3a2a1e', { dark: '#2a1e14', d: 0.2 });
    }
    // the shirt over a big round front
    sk.blob((q) => {
      q.moveTo(-2.25, -7.8);
      q.quadraticCurveTo(0.15, -8.5, 2.45, -7.85);
      q.quadraticCurveTo(3.4, -5.4, 2.6, -3.4);
      q.quadraticCurveTo(0.2, -2.9, -2.3, -3.4);
      q.quadraticCurveTo(-2.75, -5.6, -2.25, -7.8);
      q.closePath();
    }, B.shirt, { dark: B.shirtD, d: 0.5 });
    // the waistcoat: its back and near side, open down the front
    sk.blob((q) => {
      q.moveTo(-2.25, -7.8);
      q.quadraticCurveTo(-0.6, -8.25, 0.4, -8.05);
      q.lineTo(0.75, -5.4);
      q.lineTo(0.55, -3.7);
      q.quadraticCurveTo(-1.0, -3.2, -2.3, -3.4);
      q.quadraticCurveTo(-2.75, -5.6, -2.25, -7.8);
      q.closePath();
    }, B.vest, { dark: B.vestD, d: 0.35 });
    if (!back) {
      sk.blob((q) => {
        q.moveTo(1.75, -8.0);
        q.quadraticCurveTo(2.5, -7.85, 2.6, -7.5);
        q.quadraticCurveTo(3.3, -5.6, 2.75, -3.6);
        q.lineTo(2.25, -3.55);
        q.lineTo(2.35, -5.3);
        q.closePath();
      }, B.vest, { dark: B.vestD, d: 0.2 });
      sk.blob(circ(0.95, -5.0, 0.16), C.brass, { line: 0.5, sil: false });
      sk.blob(circ(1.0, -4.15, 0.16), C.brass, { line: 0.5, sil: false });
    }
    // the apron from the belly down, its string round the waist
    sk.blob((q) => {
      q.moveTo(-2.1, -4.3);
      q.quadraticCurveTo(0.4, -3.75, 2.95, -4.3);
      q.lineTo(2.75, -0.9);
      q.quadraticCurveTo(0.4, -0.6, -1.9, -0.9);
      q.closePath();
    }, B.apron, { dark: B.apronD, d: 0.35 });
    sk.limb([-2.2, -4.25, 0.4, -3.85, 2.95, -4.3], 0.28, B.apronD, { line: 0.5 });
    // the rag tucked in the apron string while its hands are busy elsewhere
    if (p.act !== 'work') sk.limb([-1.95, -4.1, -2.3, -3.1, -2.05, -2.3], 0.6, B.rag, { dark: shade(B.rag, -0.15) });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -3.0;
    sk.blob(ell(cx + (back ? 3.05 : -3.05), cy + 0.7, 0.66, 0.82), B.skin, { dark: B.skinD, d: 0.25 });
    sk.blob(ell(cx, cy, 3.4, 3.2), B.skin, { dark: B.skinD, d: 0.45 });
    // the bandana over the top of its bald head, knotted at the back
    sk.blob((q) => {
      q.moveTo(cx - 3.3, cy - 0.5);
      q.quadraticCurveTo(cx - 3.0, cy - 3.6, cx + 0.3, cy - 3.75);
      q.quadraticCurveTo(cx + 3.2, cy - 3.6, cx + 3.45, cy - 1.3);
      q.quadraticCurveTo(cx + 1.0, cy - 2.05, cx - 3.3, cy - 0.5);
      q.closePath();
    }, B.band, { dark: B.bandD, d: 0.3 });
    sk.limb([cx - 3.2, cy - 0.9, cx - 4.3, cy - 0.3], 0.5, B.bandD);
    sk.limb([cx - 3.2, cy - 0.9, cx - 4.1, cy + 0.7], 0.5, B.band, { dark: B.bandD });
    if (back) return;
    // white spots on the bandana
    for (const [dx, dy] of [[-1.6, -2.4], [0.4, -3.1], [2.1, -2.6], [-0.4, -2.1]] as const) sk.blob(circ(cx + dx, cy + dy, 0.2), '#f6ead0', { line: 0, sil: false });
    // ruddy cheeks
    sk.blob(ell(cx - 0.75, cy + 1.25, 0.55, 0.35), B.cheek, { line: 0, sil: false });
    sk.blob(ell(cx + 2.25, cy + 1.2, 0.45, 0.3), B.cheek, { line: 0, sil: false });
    face(sk, { x: cx + 0.65, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, drop: 1.85 });
    // bushy brows and the moustache drooping past its mouth
    sk.limb([cx - 0.85, cy - 0.45, cx - 0.4, cy - 0.85, cx + 0.1, cy - 0.65], 0.32, B.tache, { line: 0.4 });
    sk.limb([cx + 1.35, cy - 0.65, cx + 1.8, cy - 0.85, cx + 2.2, cy - 0.5], 0.3, B.tache, { line: 0.4 });
    sk.blob((q) => {
      q.moveTo(cx + 0.7, cy + 1.25);
      q.quadraticCurveTo(cx - 0.6, cy + 1.2, cx - 1.0, cy + 2.6);
      q.quadraticCurveTo(cx - 0.3, cy + 2.0, cx + 0.7, cy + 1.95);
      q.quadraticCurveTo(cx + 1.7, cy + 2.0, cx + 2.4, cy + 2.55);
      q.quadraticCurveTo(cx + 2.1, cy + 1.2, cx + 0.7, cy + 1.25);
      q.closePath();
    }, B.tache, { dark: B.tacheD, d: 0.15 });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, BAR_BONES.upper], 1.4, k ? B.shirtD : B.shirt, { dark: k ? null : B.shirtD });
  },
  fore(sk, p, k) {
    const f = BAR_BONES.fore;
    // the rolled cuff, the forearm, the hand
    sk.limb([0, 0, 0, f - 0.3], 1.1, k ? B.skinD : B.skin, { dark: k ? null : B.skinD });
    sk.limb([0, 0.05, 0, 0.35], 1.45, k ? B.shirtD : B.shirt, { dark: k ? null : B.shirtD });
    sk.blob(circ(0, f, 0.72), k ? B.skinD : B.skin, { dark: B.skinD, d: 0.2 });
    if (p.act === 'work') {
      // the far hand holds the cup upright, the near one wipes it out
      if (k === 1) {
        atHand(sk, p, 1, f, () => tinCup(sk, 0, -0.4, 1.2));
        if (inspecting(p.u) > 0.7) {
          const [x, y] = sk.where(0, f);
          inFrame(sk, () => sk.blob(star(x - 0.35, y - 1.75, 0.85), '#fffbea', { line: 0, sil: false }));
        }
      } else sk.blob((q) => {
        q.moveTo(-0.6, f - 0.2);
        q.quadraticCurveTo(-0.15, f - 0.75, 0.5, f - 0.35);
        q.quadraticCurveTo(0.85, f + 0.3, 0.35, f + 0.75);
        q.lineTo(0.2, f + 1.35);
        q.quadraticCurveTo(-0.35, f + 0.9, -0.65, f + 0.4);
        q.closePath();
      }, B.rag, { dark: shade(B.rag, -0.15), d: 0.2 });
    }
    if (k === 0 && p.act === 'show') {
      // the bottles, in the local's own frame, over everything
      inFrame(sk, () => {
        for (let i = 0; i < 3; i++) {
          const j = juggleAt((p.u * 2 + i / 3) % 1);
          bottleAt(sk, j.at[0], j.at[1], j.a, BOTTLES[i]);
        }
      });
    }
  },
};

// A four-pointed glint round (x, y).
const star = (x: number, y: number, r: number) => (q: Pen) => {
  q.moveTo(x, y - r);
  q.quadraticCurveTo(x, y, x + r, y);
  q.quadraticCurveTo(x, y, x, y + r);
  q.quadraticCurveTo(x, y, x - r, y);
  q.quadraticCurveTo(x, y, x, y - r);
  q.closePath();
};

// How far into holding the cup up to the light the barkeep is, at u of
// its work: out from halfway round the loop to three quarters, a look,
// back from 0.78 to its end.
const inspecting = (u: number) => ease(u, 0.5, 0.75) - ease(u, 0.78, 1);
// Where it holds the cup to polish it, in front of its belly over the
// counter, and out to the side to look it over.
const POLISH: Pt = [1.75, -5.9];
const OUT: Pt = [3.6, -7.4];

// Polishing a tin cup, the rag going round inside it, then the cup held
// out to look it over, a squint, a glint, and back to it.
const barWork: NpcLoop = {
  secs: 2.8,
  pose(u) {
    const up = inspecting(u);
    const c = Math.cos(u * TAU * 2);
    const sn = Math.sin(u * TAU * 2);
    const cup: Pt = [POLISH[0] + (OUT[0] - POLISH[0]) * up, POLISH[1] + (OUT[1] - POLISH[1]) * up + 0.1 * sn * (1 - up)];
    const wipe: Pt = [POLISH[0] - 0.1 + 0.25 * c, POLISH[1] - 1.45 + 0.12 * sn];
    const rag: Pt = [wipe[0] + (0.1 - wipe[0]) * up, wipe[1] + (-5.7 - wipe[1]) * up];
    const p: Puppet = { ...rest(), u, tilt: 0.2 - 0.18 * up + 0.04 * sn * (1 - up), lean: 0.03, eyes: up > 0.6 ? 'blink' : 'open', mouth: up > 0.6 ? 'closed' : 'smile' };
    return { ...p, arms: [reach(BAR_BONES, 0, ...toBody(p, ...rag), true), reach(BAR_BONES, 1, ...toBody(p, ...cup), true)] };
  },
};

// The juggle: each hand dipping to toss as a bottle leaves it, its eyes
// following them up.
const barShow: NpcLoop & { crowd: 'watch' } = {
  secs: 2.4,
  crowd: 'watch',
  pose(u) {
    const p: Puppet = { ...rest(), u, bob: 0.12 * Math.abs(Math.sin(u * TAU * 3)), tilt: -0.2 };
    const hand = (h: 0 | 1) => {
      let dip = 0;
      for (let i = 0; i < 3; i++) {
        const w = (u * 2 + i / 3) % 1;
        const s = (w % 0.5) / 0.5;
        if ((w < 0.5 ? 0 : 1) === h && s < 0.2) dip = Math.sin((s / 0.2) * Math.PI) * 0.5;
      }
      return [HANDS[h][0], HANDS[h][1] + dip] as Pt;
    };
    return {
      ...p,
      arms: [reach(BAR_BONES, 0, ...toBody(p, ...hand(0)), true), reach(BAR_BONES, 1, ...toBody(p, ...hand(1)), true)],
      eyes: 'open',
      mouth: Math.sin(u * TAU * 3) > 0.6 ? 'o' : 'smile',
    };
  },
};

const barkeep: Npc = {
  name: 'barkeep',
  station: 'idle',
  // behind the counter, between it and the barrel rack
  place: { mode: 'behind', u: BAR.u, v: BAR.v, top: BAR.top, edge: BAR.edge },
  tall: 15,
  bones: BAR_BONES,
  parts: barParts,
  work: barWork,
  show: barShow,
  serve: tinCupServe,
};

export const NPCS: readonly Npc[] = [mechanic, lookout, barkeep];
