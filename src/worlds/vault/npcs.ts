import { apply, mul, move, turn, type Mat, type Sketch } from '../../art/figure/paint.ts';
import { shade } from '../../art/iso.ts';
import { bump, ease, env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet, Swing } from '../types.ts';
import { C } from './kit.ts';
import { COUNTER, SAFE, STOOL } from './stations.ts';

// The vault's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the vault's ink: the teller in her chair behind the
// counting desk (the desk stands out from the wall to make room: see
// COUNTER in ./stations.ts), the safecracker at the safe's door with his
// stethoscope on and a gloved hand on the dial, and the old night guard
// on his stool by the vault doorway (the doorway's near stanchion made
// way for it: see STOOL). None is dressed like the agents (navy guards):
// a green eyeshade, a striped jersey, an oxblood greatcoat.

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// A stroke `w` units wide (at least a pixel) through the points, in the
// sketch's second pass: a detail line (a stripe, a strap, a tube).
function stroke(sk: Sketch, pts: readonly number[], w: number, color: string, cap: 'round' | 'butt' = 'round'): void {
  sk.draw((q, c) => {
    q.lineWidth = Math.max(w, 1 / c.px);
    q.lineCap = cap;
    q.lineJoin = 'round';
    q.strokeStyle = color;
    q.beginPath();
    q.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) q.lineTo(pts[i], pts[i + 1]);
    q.stroke();
  });
}

// The inverse of a sketch frame: a point of the local's own frame in the
// part's.
function inverse(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2];
  return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det];
}

// Where a point of the head (its frame: origin at the neck) stands in the
// local's own frame, for puppet p: what the near hand holds can reach it.
function headPoint(b: Bones, p: Puppet, x: number, y: number): [number, number] {
  return apply(mul(mul(move(0, -p.bob), turn(p.lean)), mul(move(b.neck[0], b.neck[1]), turn(p.tilt))), x, y);
}

// The turn that sets arm k's forearm frame back upright on screen, for
// what a hand holds level (a stamp, a bag).
const upright = (p: Puppet, k: 0 | 1): Mat => turn(p.arms[k].sh + p.arms[k].el - p.lean);

// An arm k of the way from a to b.
const mix = (a: Swing, b: Swing, k: number): Swing => ({ sh: a.sh + (b.sh - a.sh) * k, el: a.el + (b.el - a.el) * k });

// ── the teller ───────────────────────────────────────────────────────────
// In her leather chair behind the counting desk: auburn hair in a bun, a
// green eyeshade, a white blouse with black sleeve garters under a bottle
// green waistcoat with brass buttons, a black bow at her collar. At work
// she thumbs through a bundle of notes, mouthing the count, then brings
// her stamp down on the ledger with the other hand; she hands over a gold
// coin.

const T_SKIN = '#f2c7a0';
const T_SKIN_D = '#d39c76';
const T_HAIR = '#9a4a28';
const T_HAIR_D = '#6c301a';
const BLOUSE = '#f6efe0';
const BLOUSE_D = '#d6cbb6';
const VEST = '#2f5a45';
const VEST_D = '#1f3f30';
const SKIRT = '#3b424c';
const SKIRT_D = '#2b3039';
const VISOR = '#46b36e';
const NOTE = '#8fb07e';
const NOTE_D = '#6a8a5c';

const TELLER_BONES: Bones = { neck: [0.25, -5.6], shoulders: [[-1.45, -5.0], [1.75, -5.0]], upper: 1.65, fore: 1.6 };

const tellerParts: NpcParts = {
  body(sk) {
    // seated: thighs forward to the knees, shins down to small shoes (the
    // far leg first), a charcoal skirt over the thighs
    for (const [dx, dy, near] of [[0.55, -0.15, false], [-0.25, 0.1, true]] as const) {
      sk.limb([2.3 + dx, -1.0 + dy, 2.45 + dx, 2.1 + dy], 0.85, near ? SKIRT : SKIRT_D, { dark: near ? SKIRT_D : null });
      sk.blob((q) => q.roundRect(1.95 + dx, 1.75 + dy, 1.35, 0.7, 0.3), '#1e2023', { dark: '#121315', d: 0.15 });
    }
    sk.blob((q) => {
      q.moveTo(-1.7, -2.4);
      q.lineTo(1.4, -2.3);
      q.quadraticCurveTo(3.2, -1.95, 3.1, -0.85);
      q.quadraticCurveTo(3.0, -0.25, 2.2, -0.25);
      q.lineTo(-1.5, -0.4);
      q.quadraticCurveTo(-2.1, -1.4, -1.7, -2.4);
      q.closePath();
    }, SKIRT, { dark: SKIRT_D, d: 0.4 });
    // the blouse, then the waistcoat over it, open at the throat
    const torso = (q: Pen) => {
      q.moveTo(-1.85, -5.15);
      q.quadraticCurveTo(0.15, -5.75, 2.05, -5.2);
      q.quadraticCurveTo(2.45, -3.6, 2.15, -1.9);
      q.quadraticCurveTo(0.2, -1.55, -1.65, -1.9);
      q.quadraticCurveTo(-2.05, -3.5, -1.85, -5.15);
      q.closePath();
    };
    sk.blob(torso, VEST, { dark: VEST_D, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(-0.1, -5.6);
      q.lineTo(1.65, -5.45);
      q.lineTo(1.0, -3.75);
      q.closePath();
    }, BLOUSE, { line: 0.5 });
    // the bow at her collar, the buttons down the front
    sk.blob((q) => {
      q.moveTo(0.85, -5.35);
      q.lineTo(0.15, -5.75);
      q.lineTo(0.2, -4.95);
      q.closePath();
      q.moveTo(0.85, -5.35);
      q.lineTo(1.55, -5.8);
      q.lineTo(1.55, -4.95);
      q.closePath();
    }, '#1e2023', { line: 0.5 });
    sk.blob(circ(0.85, -5.35, 0.22), '#1e2023', { line: 0 });
    for (const y of [-3.35, -2.6]) sk.blob(circ(1.2, y, 0.2), C.brass, { line: 0.4 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the bun at the back of the head
    sk.blob(circ(cx - 2.45, cy - 2.2, 1.3), T_HAIR, { dark: T_HAIR_D, d: 0.3 });
    sk.blob(ell(cx, cy, 3.3, 3.15), T_SKIN, { dark: T_SKIN_D, d: 0.45 });
    // the hair, swept back to the bun, a lock over the near ear
    sk.blob((q) => {
      q.moveTo(cx - 3.2, cy + 1.2);
      q.quadraticCurveTo(cx - 3.6, cy - 2.8, cx - 0.2, cy - 3.3);
      q.quadraticCurveTo(cx + 3.0, cy - 3.2, cx + 3.35, cy - 0.9);
      q.quadraticCurveTo(cx + 1.8, cy - 1.8, cx - 0.3, cy - 1.55);
      q.quadraticCurveTo(cx - 1.9, cy - 1.0, cx - 2.2, cy + 1.3);
      q.closePath();
    }, T_HAIR, { dark: T_HAIR_D, d: 0.35 });
    // the eyeshade: its band round the head, its green brim out over the
    // eyes and a green shade on her brow under it
    if (!back) {
      face(sk, { x: cx + 0.6, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
      // a touch of blush
      sk.draw((q) => {
        q.fillStyle = '#ff8f8f55';
        q.beginPath();
        q.ellipse(cx - 1.25, cy + 1.75, 0.55, 0.3, 0, 0, TAU);
        q.ellipse(cx + 2.65, cy + 1.7, 0.45, 0.28, 0, 0, TAU);
        q.fill();
      });
    }
    stroke(sk, [cx - 3.25, cy - 1.15, cx - 1.0, cy - 1.7, cx + 1.4, cy - 1.75], 0.45, '#2a6a44');
    sk.blob((q) => {
      q.moveTo(cx - 0.3, cy - 2.1);
      q.quadraticCurveTo(cx + 2.6, cy - 2.55, cx + 5.1, cy - 1.25);
      q.quadraticCurveTo(cx + 5.3, cy - 0.5, cx + 4.6, cy - 0.35);
      q.quadraticCurveTo(cx + 2.2, cy - 0.85, cx - 0.3, cy - 1.3);
      q.closePath();
    }, VISOR + 'ee', { dark: '#2a8048ee', d: 0.3 });
    stroke(sk, [cx + 0.6, cy - 1.95, cx + 2.8, cy - 2.05, cx + 4.7, cy - 1.15], 0.14, '#b8f0c8');
  },
  upper(sk, _p, k) {
    // a full white sleeve, a black garter round it
    sk.limb([0, 0, 0, TELLER_BONES.upper], 1.2, k ? BLOUSE_D : BLOUSE, { dark: k ? null : BLOUSE_D });
    stroke(sk, [-0.6, 0.85, 0.6, 0.85], 0.28, '#1e2023', 'butt');
  },
  fore(sk, p, k) {
    const f = TELLER_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.0, k ? BLOUSE_D : BLOUSE, { dark: k ? null : BLOUSE_D });
    const work = p.act === 'work';
    // the bundle of notes in the near hand, held up before her while she
    // counts: a note bent over by her thumb every other frame
    if (k === 0 && work) {
      sk.at(mul(move(0, f), upright(p, 0)), () => {
        sk.blob((q) => q.roundRect(-0.35, -1.85, 1.7, 2.0, 0.14), NOTE, { dark: NOTE_D, d: 0.18 });
        stroke(sk, [-0.1, -1.5, 1.1, -1.5], 0.07, '#4f6a42');
        stroke(sk, [-0.1, -1.15, 1.1, -1.15], 0.07, '#4f6a42');
        sk.blob((q) => q.rect(-0.37, -0.8, 1.74, 0.36), C.paper, { line: 0.4 });
        if (p.u < 0.6 && Math.floor(p.u * 12) % 2 === 1) {
          sk.blob((q) => {
            q.moveTo(-0.3, -1.8);
            q.quadraticCurveTo(-0.6, -2.9, 0.6, -3.0);
            q.lineTo(1.3, -2.85);
            q.quadraticCurveTo(0.5, -2.6, 0.9, -1.8);
            q.closePath();
          }, shade(NOTE, 0.12), { dark: NOTE, d: 0.12 });
        }
      });
    }
    // the stamp in the far hand, brought down on the ledger: a turned
    // wooden knob, its red rubber foot
    if (k === 1 && work && p.u >= 0.58 && p.u < 0.96) {
      sk.at(mul(move(0, f), upright(p, 1)), () => {
        sk.blob((q) => q.roundRect(-0.65, 0.3, 1.3, 0.42, 0.08), C.red, { dark: shade(C.red, -0.25), d: 0.1 });
        sk.blob((q) => q.roundRect(-0.55, 0.0, 1.1, 0.35, 0.06), C.walnut, { line: 0.5 });
        sk.limb([0, 0.0, 0, -0.55], 0.4, C.walnut, { dark: shade(C.walnut, -0.25) });
        sk.blob(circ(0, -0.8, 0.42), C.walnut, { dark: shade(C.walnut, -0.25), d: 0.12 });
      });
    }
    sk.blob(circ(0, f, 0.55), k ? T_SKIN_D : T_SKIN, { dark: T_SKIN_D, d: 0.18 });
  },
};

// Counting: the near hand holds the bundle up before her, its thumb
// flicking a note over every other frame, her lips moving with the count;
// then the far hand takes up the stamp from the desk and brings it down
// on the page with a thump, and lays it by again.
const T_HOLD: Swing = { sh: 0.65, el: 0.96 };
const T_FLICK: Swing = { sh: 0.74, el: 1.0 };
const T_REST: Swing = { sh: 0.08, el: 1.64 };
const T_UP: Swing = { sh: 0.66, el: 2.14 };
const T_DOWN: Swing = { sh: -0.06, el: 1.83 };
const tellerWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const flick = u < 0.6 && Math.floor(u * 12) % 2 === 1 ? 1 : 0;
    const up = ease(u, 0.58, 0.68);
    const down = ease(u, 0.7, 0.78);
    const back = ease(u, 0.88, 1);
    const far = mix(mix(mix(T_REST, T_UP, up), T_DOWN, down), T_REST, back);
    const thump = bump(u, 0.72, 0.9);
    return {
      ...rest(),
      tilt: 0.12 + 0.06 * thump - 0.06 * up * (1 - down),
      lean: 0.04 + 0.04 * thump,
      arms: [mix(T_HOLD, T_FLICK, flick), far],
      eyes: thump > 0.6 ? 'happy' : 'open',
      mouth: u < 0.6 ? (flick ? 'o' : 'closed') : thump > 0.4 ? 'smile' : 'closed',
    };
  },
};

// A gold coin: a rim, a raised star in the middle, a glint.
const coin: NpcServe = {
  name: 'coin',
  drink: false,
  draw(sk) {
    sk.blob(circ(0.15, 0.25, 0.95), C.gold, { dark: C.goldDeep, d: 0.25 });
    sk.draw((q, c) => {
      q.lineWidth = Math.max(0.12, 1 / c.px);
      q.strokeStyle = C.brassDark;
      q.beginPath();
      q.arc(0.15, 0.25, 0.68, 0, TAU);
      q.stroke();
      q.fillStyle = C.goldLight;
      q.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.18 : 0.42;
        q.lineTo(0.15 + Math.cos(a) * r, 0.25 + Math.sin(a) * r);
      }
      q.closePath();
      q.fill();
    });
  },
};

const teller: Npc = {
  name: 'teller',
  station: 'write',
  // in her chair behind the desk (its seat 3.5 up, her seat line a unit
  // over her frame); the desk top hides her from the chest down
  place: { mode: 'seated', u: COUNTER.seat[0], v: COUNTER.seat[1], z: 2.5, top: COUNTER.top, edge: COUNTER.back },
  tall: 13,
  bones: TELLER_BONES,
  parts: tellerParts,
  work: tellerWork,
  serve: coin,
};

// ── the safecracker ──────────────────────────────────────────────────────
// A lanky cartoon burglar in a black-and-cream striped jersey, a black
// knit cap, a black mask over the eyes and black gloves, a stethoscope in
// his ears. At work he stands at the safe's door, the stethoscope's bell
// pressed to it in the near hand, the far hand working the dial, listening
// with his head cocked. His show is the crack: a held breath, the click,
// and a bag of gold hoisted high. He celebrates rubbing his hands.

const S_SKIN = '#eab48a';
const S_SKIN_D = '#c48a64';
const JERSEY = '#efe6cf';
const JERSEY_D = '#cbbf9f';
const BLACK = '#23252d';
const BLACK_D = '#15161b';
const TUBE = '#2b2d36';

const SAFE_BONES: Bones = { neck: [0.45, -7.55], shoulders: [[-1.45, -6.95], [1.95, -6.95]], upper: 1.8, fore: 1.65 };
// The stethoscope's tubes join under his chin (head frame).
const JOIN: [number, number] = [0.75, 1.15];

// Stripes across a shape: black bands every `gap` units down it.
function stripes(sk: Sketch, shape: (q: Pen) => void, y0: number, y1: number, gap: number, band: number): void {
  sk.draw((q) => {
    q.save();
    q.beginPath();
    shape(q);
    q.clip();
    q.fillStyle = BLACK;
    for (let y = y0; y < y1; y += gap) q.fillRect(-5, y, 10, band);
    q.restore();
  });
}

const safeParts: NpcParts = {
  body(sk) {
    // slim black trousers, soft black shoes, the far leg first
    for (const [x, near] of [[0.95, false], [-0.75, true]] as const) {
      sk.limb([x, -3.4, x + 0.15, -0.75], 1.1, near ? BLACK : BLACK_D, { dark: near ? BLACK_D : null });
      sk.blob((q) => q.roundRect(x - 0.5, -0.95, 1.55, 0.95, 0.45), '#2e3038', { dark: BLACK_D, d: 0.2 });
    }
    // the striped jersey, a little hunched
    const jersey = (q: Pen) => {
      q.moveTo(-1.85, -7.1);
      q.quadraticCurveTo(0.3, -7.95, 2.4, -7.25);
      q.quadraticCurveTo(2.75, -5.0, 2.15, -3.05);
      q.quadraticCurveTo(0.2, -2.6, -1.7, -3.05);
      q.quadraticCurveTo(-2.2, -5.2, -1.85, -7.1);
      q.closePath();
    };
    sk.blob(jersey, JERSEY, { dark: JERSEY_D, d: 0.5 });
    stripes(sk, jersey, -6.75, -3.0, 0.9, 0.42);
    // its black hem
    sk.draw((q) => {
      q.save();
      q.beginPath();
      jersey(q);
      q.clip();
      q.fillStyle = BLACK;
      q.fillRect(-3, -3.55, 6, 1);
      q.restore();
    });
  },
  head(sk, p, back) {
    const cx = 0.15;
    const cy = -2.9;
    sk.blob(ell(cx, cy, 3.25, 3.1), S_SKIN, { dark: S_SKIN_D, d: 0.45 });
    // stubble on his jaw
    sk.draw((q) => {
      q.fillStyle = '#5a647a40';
      q.beginPath();
      q.ellipse(cx + 0.7, cy + 1.95, 2.3, 1.05, 0, 0, TAU);
      q.fill();
    });
    // the mask: a black band over the eyes, its ties out behind
    sk.limb([cx - 3.2, cy + 0.55, cx - 4.5, cy + 0.05], 0.38, BLACK);
    sk.limb([cx - 3.2, cy + 0.75, cx - 4.2, cy + 1.45], 0.38, BLACK);
    sk.blob((q) => {
      q.moveTo(cx - 3.25, cy - 0.05);
      q.quadraticCurveTo(cx + 0.2, cy - 0.55, cx + 3.25, cy - 0.05);
      q.quadraticCurveTo(cx + 3.3, cy + 0.9, cx + 3.05, cy + 1.45);
      q.quadraticCurveTo(cx + 0.2, cy + 1.25, cx - 3.0, cy + 1.45);
      q.quadraticCurveTo(cx - 3.35, cy + 0.8, cx - 3.25, cy - 0.05);
      q.closePath();
    }, BLACK, { dark: BLACK_D, d: 0.2 });
    if (!back) {
      // holes for his eyes
      sk.blob(ell(cx - 0.55, cy + 0.75, 0.82, 0.62), S_SKIN, { line: 0.5, sil: false });
      sk.blob(ell(cx + 1.75, cy + 0.75, 0.74, 0.58), S_SKIN, { line: 0.5, sil: false });
      face(sk, { x: cx + 0.6, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth, r: 0.45 });
    }
    // the knit cap, its turned-up cuff
    sk.blob((q) => {
      q.moveTo(cx - 3.45, cy - 0.35);
      q.quadraticCurveTo(cx - 3.7, cy - 3.7, cx - 0.1, cy - 4.0);
      q.quadraticCurveTo(cx + 3.3, cy - 3.9, cx + 3.4, cy - 1.0);
      q.quadraticCurveTo(cx, cy - 1.55, cx - 3.45, cy - 0.35);
      q.closePath();
    }, BLACK, { dark: BLACK_D, d: 0.35 });
    sk.blob((q) => {
      q.moveTo(cx - 3.5, cy - 0.3);
      q.quadraticCurveTo(cx, cy - 1.45, cx + 3.45, cy - 0.95);
      q.lineTo(cx + 3.35, cy - 1.95);
      q.quadraticCurveTo(cx, cy - 2.5, cx - 3.45, cy - 1.3);
      q.closePath();
    }, '#30333d', { dark: BLACK, d: 0.15 });
    sk.blob(ell(cx + 0.1, cy - 4.05, 0.5, 0.32), BLACK, { line: 0.5 });
    // the stethoscope's ear tubes, down to where they join under his chin
    if (!back) {
      stroke(sk, [cx - 2.6, cy + 0.55, cx - 2.2, cy + 2.6, JOIN[0], JOIN[1]], 0.2, TUBE);
      stroke(sk, [cx + 2.9, cy + 0.9, cx + 2.2, cy + 2.7, JOIN[0], JOIN[1]], 0.2, TUBE);
      sk.blob(circ(cx - 2.6, cy + 0.55, 0.28), C.chrome, { line: 0.5 });
      sk.blob(circ(JOIN[0], JOIN[1], 0.2), C.chrome, { line: 0.5 });
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, SAFE_BONES.upper], 1.15, k ? JERSEY_D : JERSEY, { dark: k ? null : JERSEY_D });
    sk.draw((q) => {
      q.fillStyle = BLACK;
      q.fillRect(-0.6, 0.45, 1.2, 0.4);
      q.fillRect(-0.6, 1.3, 1.2, 0.4);
    });
  },
  fore(sk, p, k) {
    const f = SAFE_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.0, k ? JERSEY_D : JERSEY, { dark: k ? null : JERSEY_D });
    sk.draw((q) => {
      q.fillStyle = BLACK;
      q.fillRect(-0.52, 0.45, 1.04, 0.38);
    });
    // the bag of gold, held up on the far hand at the end of the show,
    // coins at its open neck
    if (k === 1 && p.act === 'show' && p.u >= 0.5) {
      sk.at(mul(move(0.2, f - 0.2), upright(p, 1)), () => {
        sk.blob((q) => {
          q.moveTo(-0.55, -2.1);
          q.quadraticCurveTo(-2.1, -1.4, -1.7, 0.0);
          q.quadraticCurveTo(-0.2, 0.75, 1.4, 0.15);
          q.quadraticCurveTo(2.0, -1.4, 0.55, -2.1);
          q.closePath();
        }, '#a8844e', { dark: '#7a5c32', d: 0.35 });
        stroke(sk, [-0.6, -1.85, 0.6, -1.85], 0.22, '#5a3e22');
        sk.blob(ell(-0.15, -2.35, 0.8, 0.38), C.gold, { dark: C.goldDeep, d: 0.12 });
        sk.blob(ell(0.45, -2.55, 0.42, 0.3), C.goldLight, { line: 0.4 });
      });
    }
    // the stethoscope's bell in the near hand, its tube back to his chin
    if (k === 0 && (p.act === 'work' || (p.act === 'show' && p.u < 0.45))) {
      const [jx, jy] = apply(inverse(sk.m), ...headPoint(SAFE_BONES, p, JOIN[0], JOIN[1]));
      stroke(sk, [0, f + 0.2, (jx + 0) / 2 - 0.6, (jy + f) / 2 + 0.9, jx, jy], 0.2, TUBE);
      sk.blob(circ(0.2, f + 0.35, 0.5), C.chrome, { dark: '#9aa4ad', d: 0.12 });
    }
    sk.blob(circ(0, f, 0.6), k ? BLACK_D : BLACK, { dark: BLACK_D, d: 0.18 });
  },
};

// Where he stands: before the door's hinge side, the dial (DIAL) ahead of
// him, under his far hand.
const SAFECRACKER: [number, number] = [SAFE.u0 + 0.6, SAFE.v1 + 1.9];

// At the door: leaning in, the bell to the steel by the dial, the far
// hand on the dial turning it a notch at a time; his head cocked, eyes
// shut to listen, open again.
const S_BELL: Swing = { sh: 1.46, el: 0.61 };
const S_DIAL: Swing = { sh: 0.31, el: 2.03 };
const safeWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const twist = Math.sin(u * TAU * 2);
    const listen = bump(u, 0.2, 0.55) + bump(u, 0.7, 0.98);
    return {
      ...rest(),
      lean: 0.13 + 0.02 * listen,
      tilt: 0.1 + 0.14 * listen,
      arms: [S_BELL, { sh: S_DIAL.sh + 0.05 * twist, el: S_DIAL.el + 0.22 * twist }],
      eyes: listen > 0.5 ? 'shut' : 'open',
      mouth: listen > 0.5 ? 'closed' : 'smile',
    };
  },
};

// The crack: slower and slower at the dial, breath held; the click (a
// start, eyes wide); a grin round at the crowd and the bag hoisted high,
// bouncing.
const safeShow: NpcLoop & { crowd: 'watch' } = {
  secs: 5,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const hold = 1 - ease(u, 0.32, 0.4);
    const click = bump(u, 0.34, 0.5);
    const lift = ease(u, 0.46, 0.58);
    const bounce = lift * Math.abs(Math.sin((u - 0.58) * TAU * 2));
    const turn = Math.sin(u * TAU * 4) * hold;
    const dial = { sh: S_DIAL.sh + 0.04 * turn, el: S_DIAL.el + 0.15 * turn };
    return {
      ...rest(),
      bob: 0.12 * hold + 0.45 * click + 0.35 * bounce,
      lean: 0.16 * hold * (1 - lift) - 0.05 * lift,
      tilt: 0.26 * hold - 0.12 * lift,
      arms: [mix(mix(S_BELL, { sh: 2.2, el: 1.2 }, click), { sh: 0.5 + 0.5 * bounce, el: 1.6 }, lift), mix(mix(dial, { sh: 0.9, el: 1.2 }, click), { sh: 2.15 + 0.2 * bounce, el: -0.25 }, lift)],
      eyes: hold > 0.5 ? 'shut' : click > 0.3 ? 'open' : 'happy',
      mouth: hold > 0.5 ? 'closed' : click > 0.3 ? 'o' : 'open',
    };
  },
};

// Rubbing his gloved hands together, grinning.
const safeCelebrate: NpcLoop = {
  secs: 1.2,
  frames: 8,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const rub = Math.sin(u * TAU * 3);
    return { ...rest(), bob: 0.15 * k, lean: 0.06 * k, tilt: 0.08 * k, arms: [{ sh: 0.12 + (1.05 + 0.12 * rub) * k, el: 0.2 + 1.45 * k }, { sh: 0.12 + (0.95 - 0.12 * rub) * k, el: 0.2 + 1.5 * k }], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'smile' : 'closed' };
  },
};

const safecracker: Npc = {
  name: 'safecracker',
  station: 'search',
  // before the safe's door, on its hinge side, facing along it to the dial
  place: { mode: 'standing', u: SAFECRACKER[0], v: SAFECRACKER[1], look: 'along' },
  tall: 15,
  bones: SAFE_BONES,
  parts: safeParts,
  work: safeWork,
  show: safeShow,
  celebrate: safeCelebrate,
};

// ── the guard ────────────────────────────────────────────────────────────
// The old night guard on his stool by the vault doorway: big and round in
// an oxblood greatcoat with two rows of brass buttons and a ring of keys at
// his belt, white gloves, a peaked cap with a brass badge, a grey walrus
// moustache and a red nose. At work he sits with his hands on his belly,
// drumming his fingers, looks one way and the other, and touches his cap.

const G_SKIN = '#eeb08e';
const G_SKIN_D = '#c98868';
const COAT = '#8a2e30';
const COAT_D = '#5e1c20';
const TROUSERS = '#2b3039';
const GLOVE = '#f4f1ea';
const GLOVE_D = '#cfcabd';
const MOUSTACHE = '#d9d6cf';
const MOUSTACHE_D = '#a8a49a';

const GUARD_BONES: Bones = { neck: [0.15, -6.85], shoulders: [[-2.2, -6.2], [2.35, -6.2]], upper: 2.0, fore: 1.85 };

const guardParts: NpcParts = {
  body(sk, p) {
    // seated: stout legs forward to the knees and down to glossy black
    // boots on the stool's ring, the far leg first
    for (const [dx, near] of [[0.7, false], [-0.35, true]] as const) {
      const c = near ? TROUSERS : shade(TROUSERS, -0.2);
      sk.limb([dx, -1.5, 2.6 + dx, -1.3], 1.6, c, { dark: near ? shade(TROUSERS, -0.2) : null });
      sk.limb([2.6 + dx, -1.3, 2.7 + dx, 0.4], 1.45, c, { dark: near ? shade(TROUSERS, -0.2) : null });
      sk.blob((q) => q.roundRect(1.95 + dx, 0.2, 2.1, 1.15, 0.5), '#17181c', { dark: '#0c0d10', d: 0.2 });
      sk.blob(ell(3.1 + dx, 0.5, 0.5, 0.18), '#5a5e68', { line: 0, sil: false });
    }
    // the greatcoat, round over the belly, its skirts over his lap
    const coat = (q: Pen) => {
      q.moveTo(-2.55, -6.35);
      q.quadraticCurveTo(0.2, -7.3, 2.85, -6.45);
      q.quadraticCurveTo(4.0, -4.2, 3.35, -1.5);
      q.quadraticCurveTo(1.0, -0.7, -2.2, -0.9);
      q.quadraticCurveTo(-3.15, -3.8, -2.55, -6.35);
      q.closePath();
    };
    sk.blob(coat, COAT, { dark: COAT_D, d: 0.55 });
    sk.draw((q, c) => {
      q.save();
      q.beginPath();
      coat(q);
      q.clip();
      // the belt
      q.fillStyle = '#1b1d22';
      q.beginPath();
      q.moveTo(-3.5, -3.2);
      q.quadraticCurveTo(0.5, -3.65, 4.5, -3.0);
      q.lineTo(4.5, -2.4);
      q.quadraticCurveTo(0.5, -3.05, -3.5, -2.6);
      q.fill();
      q.restore();
      // the front edge of the coat, down its middle
      q.strokeStyle = COAT_D;
      q.lineWidth = Math.max(0.14, 1 / c.px);
      q.beginPath();
      q.moveTo(1.55, -6.75);
      q.quadraticCurveTo(2.7, -4.2, 2.3, -1.2);
      q.stroke();
    });
    sk.blob((q) => q.roundRect(1.4, -3.45, 0.85, 0.8, 0.12), C.brass, { dark: C.brassDark, d: 0.1 });
    // two rows of brass buttons
    for (const [x0, y0] of [[0.85, 0], [2.35, 0.1]] as const) {
      for (const [y, dx] of [[-5.7, 0], [-4.75, 0.2], [-3.9, 0.3], [-1.95, 0.25]] as const) sk.blob(circ(x0 + dx, y + y0, 0.27), C.brass, { dark: C.brassDark, d: 0.08, line: 0.5 });
    }
    // the collar
    sk.blob((q) => {
      q.moveTo(-1.3, -6.85);
      q.quadraticCurveTo(0.4, -7.45, 2.1, -6.9);
      q.lineTo(2.0, -6.25);
      q.quadraticCurveTo(0.4, -6.75, -1.2, -6.25);
      q.closePath();
    }, COAT_D, { line: 0.5 });
    stroke(sk, [-1.2, -6.3, 0.4, -6.78, 2.0, -6.3], 0.14, C.gold);
    // the ring of keys at the near hip, swinging a little
    const sway = p.act === 'work' ? 0.2 * Math.sin(p.u * TAU * 2) : 0;
    sk.at(mul(move(-2.0, -2.6), turn(sway)), () => {
      sk.draw((q, c) => {
        q.strokeStyle = C.brass;
        q.lineWidth = Math.max(0.2, 1 / c.px);
        q.beginPath();
        q.arc(0, 0.55, 0.5, 0, TAU);
        q.stroke();
      });
      for (const [a, col] of [[-0.5, C.brass], [0.05, C.steelLight], [0.55, C.brassLight]] as const) {
        sk.at(turn(a), () => {
          sk.limb([0, 1.0, 0, 1.9], 0.22, col);
          sk.blob(circ(0, 1.0, 0.24), col, { line: 0.5 });
          sk.limb([0, 1.7, 0.3, 1.7], 0.16, col);
        });
      }
    });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -3.0;
    const tip = p.act === 'work' ? bump(p.u, 0.72, 0.97) : 0;
    const toss = p.act === 'celebrate' ? bump(p.u, 0.15, 0.85) : 0;
    // looking one way, then the other, at work
    const look = p.act === 'work' ? 0.45 * Math.sin(p.u * TAU) : 0;
    sk.blob(ell(cx, cy, 3.35, 3.15), G_SKIN, { dark: G_SKIN_D, d: 0.45 });
    // grey sideburns and the near ear
    sk.blob(ell(cx - 2.55, cy + 0.55, 0.62, 0.8), G_SKIN, { dark: G_SKIN_D, d: 0.15 });
    sk.blob((q) => {
      q.moveTo(cx - 3.2, cy - 0.9);
      q.quadraticCurveTo(cx - 3.45, cy + 0.8, cx - 2.7, cy + 1.9);
      q.lineTo(cx - 2.15, cy + 1.6);
      q.quadraticCurveTo(cx - 2.6, cy + 0.3, cx - 2.3, cy - 0.9);
      q.closePath();
    }, MOUSTACHE, { dark: MOUSTACHE_D, d: 0.15 });
    if (!back) {
      face(sk, { x: cx + 0.75 + look, y: cy + 0.3, eyes: p.eyes, mouth: p.mouth, drop: 2.35, r: 0.45 });
      // rosy cheeks, the red nose, the walrus moustache over his lip
      sk.draw((q) => {
        q.fillStyle = '#ff7a7a50';
        q.beginPath();
        q.ellipse(cx - 1.2 + look, cy + 1.45, 0.65, 0.4, 0, 0, TAU);
        q.ellipse(cx + 2.75 + look, cy + 1.35, 0.5, 0.36, 0, 0, TAU);
        q.fill();
      });
      sk.blob((q) => {
        const x = cx + 0.8 + look;
        const y = cy + 1.75;
        q.moveTo(x, y - 0.35);
        q.quadraticCurveTo(x - 1.4, y - 0.7, x - 2.1, y + 0.75);
        q.quadraticCurveTo(x - 1.2, y + 0.35, x - 0.6, y + 0.65);
        q.quadraticCurveTo(x, y + 0.35, x + 0.6, y + 0.65);
        q.quadraticCurveTo(x + 1.3, y + 0.35, x + 2.15, y + 0.7);
        q.quadraticCurveTo(x + 1.5, y - 0.7, x, y - 0.35);
        q.closePath();
      }, MOUSTACHE, { dark: MOUSTACHE_D, d: 0.2 });
      sk.blob(circ(cx + 0.95 + look, cy + 1.2, 0.55), '#e8807a', { dark: '#c45e58', d: 0.15 });
    }
    // the peaked cap, lifted at a touch and tossed up in a cheer
    sk.at(mul(move(cx - 3.3 + 0.2 * tip, cy - 1.45 - 0.3 * tip - 1.8 * toss), turn(-0.09 * tip - 0.25 * toss)), () => {
      sk.blob((q) => {
        q.moveTo(0, 0);
        q.quadraticCurveTo(-0.4, -2.0, 1.7, -2.5);
        q.lineTo(5.6, -2.65);
        q.quadraticCurveTo(7.5, -2.45, 6.9, -0.35);
        q.quadraticCurveTo(3.4, 0.35, 0, 0);
        q.closePath();
      }, COAT, { dark: COAT_D, d: 0.35 });
      stroke(sk, [0.15, -0.35, 3.4, 0.0, 6.85, -0.7], 0.45, C.gold, 'butt');
      if (!back) {
        sk.blob((q) => {
          q.moveTo(3.6, -0.05);
          q.quadraticCurveTo(6.6, -0.6, 8.1, 0.45);
          q.quadraticCurveTo(6.4, 1.1, 3.6, 0.55);
          q.closePath();
        }, '#17181c', { dark: '#0c0d10', d: 0.12 });
        sk.blob((q) => {
          q.moveTo(5.0, -2.15);
          q.lineTo(5.85, -1.95);
          q.lineTo(5.75, -1.2);
          q.lineTo(5.35, -0.85);
          q.lineTo(4.95, -1.25);
          q.closePath();
        }, C.brass, { dark: C.brassDark, d: 0.1, line: 0.5 });
      }
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, GUARD_BONES.upper], 1.5, k ? COAT_D : COAT, { dark: k ? null : COAT_D });
  },
  fore(sk, _p, k) {
    const f = GUARD_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.3, k ? COAT_D : COAT, { dark: k ? null : COAT_D });
    stroke(sk, [-0.68, f - 0.55, 0.68, f - 0.55], 0.3, C.gold, 'butt');
    sk.blob(circ(0, f, 0.72), k ? GLOVE_D : GLOVE, { dark: GLOVE_D, d: 0.2 });
  },
};

// On his stool: hands folded on his belly, the near fingers drumming every
// other frame, looking one way and the other, then a gloved touch to the
// brim of his cap.
const G_BELLY: Swing = { sh: 0.71, el: 0.33 };
const G_DRUM: Swing = { sh: 0.8, el: 0.45 };
const G_REST: Swing = { sh: 0.8, el: -1.42 };
const G_CAP: Swing = { sh: 2.62, el: 0.4 };
const guardWork: NpcLoop = {
  secs: 3,
  frames: 12,
  pose(u) {
    const tip = bump(u, 0.7, 0.98);
    const drum = u < 0.66 && Math.floor(u * 12) % 2 === 1 ? 1 : 0;
    return {
      ...rest(),
      bob: 0.06 * drum,
      lean: -0.03 - 0.03 * tip,
      tilt: 0.04 * Math.sin(u * TAU * 2) - 0.06 * tip,
      arms: [mix(G_BELLY, G_DRUM, drum), mix(G_REST, G_CAP, tip)],
      eyes: tip > 0.6 ? 'happy' : 'open',
      mouth: tip > 0.4 ? 'open' : 'smile',
    };
  },
};

// Both arms up and the cap tossed into the air, caught on his head again.
const guardCelebrate: NpcLoop = {
  secs: 1.6,
  frames: 10,
  pose(u) {
    const k = env(u, 0.15, 0.85);
    const up = { sh: 0.12 + 2.6 * k, el: 0.2 - 0.1 * k };
    return { ...rest(), bob: 0.3 * bump(u, 0.2, 0.7), tilt: -0.1 * k, arms: [up, up], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

const guard: Npc = {
  name: 'guard',
  station: 'entrance',
  // on his stool beside the opening, inside the doorway's own footprint
  // (its seat 2.4 up, his seat line a unit over his frame), facing the
  // room: nearest whoever comes in
  place: { mode: 'seated', u: STOOL.u, v: STOOL.v, z: STOOL.z - 1 },
  tall: 15,
  bones: GUARD_BONES,
  parts: guardParts,
  work: guardWork,
  celebrate: guardCelebrate,
};

export const NPCS: readonly Npc[] = [teller, safecracker, guard];
