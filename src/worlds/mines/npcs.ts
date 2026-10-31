import { shade } from '../../art/iso.ts';
import { bump, ease, env, HANG, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, upright } from '../../art/npc/helpers.ts';
import { move, turn, mul, type Sketch } from '../../art/figure/paint.ts';
import type { Color, Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet } from '../types.ts';
import { C } from './kit.ts';
import { ASSAY, SMITH } from './stations.ts';

// The mine's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the mine's coal-dust ink: the blacksmith at the anvil
// beside the smithy (see SMITH in ./stations.ts), the assayer behind his
// counter in the assay office (see ASSAY), the old prospector at the dig
// face. Each drawn facing +x in three-quarter view, its near side toward -x.

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
const poly = (pts: readonly number[]) => (p: Pen) => {
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
};

// A few short strokes of light about (x, y): sparks off a blow, a glint.
function sparks(sk: Sketch, x: number, y: number, r: number, n: number, color: Color, seed: number): void {
  sk.draw((q, c) => {
    q.lineCap = 'round';
    q.strokeStyle = color;
    q.lineWidth = Math.max(0.16, 1 / c.px);
    q.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.1 + 0.8 * ((i * 0.618 + seed * 0.37) % 1));
      const r0 = r * (0.35 + 0.2 * ((i * 0.41 + seed) % 1));
      const r1 = r * (0.75 + 0.35 * ((i * 0.29 + seed * 0.5) % 1));
      q.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      q.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    }
    q.stroke();
  });
}

// A four-pointed twinkle at (x, y), r across.
function twinkle(sk: Sketch, x: number, y: number, r: number, color: Color): void {
  sk.draw((q) => {
    q.beginPath();
    q.moveTo(x, y - r);
    q.quadraticCurveTo(x, y, x + r, y);
    q.quadraticCurveTo(x, y, x, y + r);
    q.quadraticCurveTo(x, y, x - r, y);
    q.quadraticCurveTo(x, y, x, y - r);
    q.fillStyle = color;
    q.fill();
  });
}

// ── the blacksmith ───────────────────────────────────────────────────────
// A broad, bald smith with a bushy rust beard and soot on his cheek, a
// grey shirt with its sleeves rolled to the shoulder, a scorched leather
// apron to his shins, heavy boots, leather gloves. He stands on the floor
// at the smithy's front, turned to the anvil a step ahead of him (see
// SMITH in ./stations.ts): his far hand holds a bar across it by its cool
// end, glowing at the other, and the near one swings the hammer back over
// his shoulder and down on it, sparks off every blow. His show forges a
// blade, a flurry of blows and the blade held up glowing; he cheers with
// the hammer up.

const SM = {
  skin: '#d39068',
  skinD: '#a86a47',
  beard: '#b35a2e',
  beardD: '#86401f',
  shirt: '#6c665f',
  shirtD: '#4f4a45',
  apron: C.leather,
  apronD: '#663619',
  trousers: '#4e3d30',
  trousersD: '#3a2c22',
  boot: '#3a2a1e',
  glove: '#6a4a30',
  gloveD: '#4e3420',
  iron: '#4e4c54',
  stock: '#5a5458',
  hot: '#ffae4a',
  white: '#fff0b0',
};

const SMITH_BONES: Bones = { neck: [0.35, -8.3], shoulders: [[-1.55, -7.75], [2.25, -7.65]], upper: 2.0, fore: 1.9 };

// The hammer in the near fist: the haft out past the hand, the head across
// its end, the striking face on the side the blow comes down.
const HAFT: readonly [number, number] = [0.26, 0.97];
const HAFT_L = 2.3;

function hammer(sk: Sketch, f: number): void {
  const [hx, hy] = HAFT;
  const ex = hx * HAFT_L;
  const ey = f + hy * HAFT_L;
  sk.limb([-hx * 0.4, f - hy * 0.4, ex, ey], 0.34, C.timber, { dark: C.timberDark });
  const ax = -hy;
  const ay = hx;
  const at = (s: number, t: number): number[] => [ex + ax * s + hx * t, ey + ay * s + hy * t];
  sk.blob(poly([...at(-0.95, -0.42), ...at(1.05, -0.55), ...at(1.05, 0.55), ...at(-0.95, 0.42)]), SM.iron, { dark: shade(SM.iron, -0.3), d: 0.25 });
}

// Where the hammer's face is, in the hand's frame.
const FACE: readonly [number, number] = [HAFT[0] * HAFT_L - HAFT[1] * 1.05, HAFT[1] * HAFT_L + HAFT[0] * 1.05];

// The bar in the far fist, lying level along the anvil (down the screen
// to the right, as the anvil runs), dark iron at the hand and glowing at
// its far end; or, held up, a blade fresh off the anvil.
function stock(sk: Sketch, blade: boolean): void {
  if (blade) {
    sk.limb([0, 0.5, 0, -0.6], 0.42, SM.stock, { line: 0.6 });
    sk.blob(poly([-0.42, -0.55, 0.42, -0.55, 0.34, -4.2, 0, -5.0, -0.34, -4.2]), '#ffc966', { dark: '#ff8a2a', d: 0.2, line: 0.5 });
    sk.limb([0.02, -0.8, 0.02, -4.1], 0.12, SM.white, { line: 0, sil: false });
    return;
  }
  const dx = 0.894;
  const dy = 0.447;
  const pt = (t: number): number[] => [-0.3 * dx + t * dx, -0.3 * dy + t * dy];
  sk.limb([...pt(0), ...pt(1.3)], 0.42, SM.stock, { line: 0.6 });
  sk.limb([...pt(1.2), ...pt(2.9)], 0.42, SM.hot, { dark: '#e8742a', line: 0.6 });
  sk.limb([...pt(1.5), ...pt(2.8)], 0.14, SM.white, { line: 0, sil: false });
}

// How far into his show the blows go (four, landing 3/16 of the loop
// apart, the last at 9/16 and held there).
const SHOW_BLOWS = 0.6;

// The frame of local p's last blow landing, if this is one (sparks fly).
function landed(p: Puppet): boolean {
  if (p.act === 'work') return (p.u * 2) % 1 < 0.05;
  return p.act === 'show' && p.u < SHOW_BLOWS && ((p.u * 16) / 3) % 1 < 0.05;
}

const smithParts: NpcParts = {
  body(sk, _p, back) {
    // legs apart in dark trousers, heavy boots, the far one first
    for (const [x, near] of [[1.35, false], [-1.05, true]] as const) {
      sk.limb([x, -4.3, x + 0.05, -1.0], 1.55, near ? SM.trousers : SM.trousersD, { dark: near ? SM.trousersD : null });
      sk.blob((q) => q.roundRect(x - 0.8, -1.25, 2.0, 1.25, 0.5), SM.boot, { dark: shade(SM.boot, -0.25), d: 0.2 });
    }
    // the shirt: a barrel chest
    sk.blob((q) => {
      q.moveTo(-2.3, -8.1);
      q.quadraticCurveTo(0.4, -8.9, 2.9, -8.0);
      q.quadraticCurveTo(3.4, -6.0, 2.9, -3.9);
      q.quadraticCurveTo(0.3, -3.4, -2.4, -3.9);
      q.quadraticCurveTo(-2.9, -6.0, -2.3, -8.1);
      q.closePath();
    }, SM.shirt, { dark: SM.shirtD, d: 0.5 });
    if (back) return;
    // the apron: from the chest to the shins, a strap round the neck
    sk.limb([-0.9, -7.3, -0.2, -8.6, 1.4, -8.6, 2.0, -7.3], 0.3, SM.apronD, { line: 0.5 });
    sk.blob((q) => {
      q.moveTo(-1.1, -7.4);
      q.lineTo(2.2, -7.4);
      q.quadraticCurveTo(2.45, -6.6, 2.85, -5.6);
      q.lineTo(3.05, -1.8);
      q.quadraticCurveTo(0.8, -1.35, -1.75, -1.8);
      q.lineTo(-1.95, -5.6);
      q.quadraticCurveTo(-1.35, -6.6, -1.1, -7.4);
      q.closePath();
    }, SM.apron, { dark: SM.apronD, d: 0.45 });
    // a pocket, scorch marks
    sk.blob((q) => q.roundRect(-0.1, -5.0, 1.9, 1.3, 0.3), shade(SM.apron, -0.08), { line: 0.5 });
    sk.blob(ell(1.6, -2.6, 0.55, 0.32), '#4a2814', { line: 0, sil: false });
    sk.blob(ell(-0.8, -6.3, 0.35, 0.22), '#4a2814', { line: 0, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.35;
    const cy = -3.3;
    // a fringe of hair round the back of the head
    sk.blob(ell(cx - 2.3, cy + 0.4, 1.4, 1.7), SM.beardD, { dark: shade(SM.beardD, -0.2), d: 0.2 });
    sk.blob(ell(cx, cy, 3.35, 3.2), SM.skin, { dark: SM.skinD, d: 0.45 });
    if (back) return;
    sk.blob(ell(cx - 2.5, cy + 0.6, 0.65, 0.85), SM.skin, { dark: SM.skinD, d: 0.2 });
    // a shine on the dome
    sk.blob(ell(cx - 1.0, cy - 2.2, 0.9, 0.42), '#efb38e', { line: 0, sil: false });
    // the beard: bushy from ear to ear and down over the chest
    sk.blob((q) => {
      q.moveTo(cx - 2.6, cy + 0.2);
      q.quadraticCurveTo(cx - 2.1, cy + 2.6, cx - 1.2, cy + 4.0);
      q.quadraticCurveTo(cx + 0.6, cy + 5.1, cx + 2.3, cy + 3.9);
      q.quadraticCurveTo(cx + 3.6, cy + 2.6, cx + 3.35, cy + 0.6);
      q.quadraticCurveTo(cx + 1.6, cy + 1.6, cx + 0.5, cy + 1.3);
      q.quadraticCurveTo(cx - 1.2, cy + 1.6, cx - 2.6, cy + 0.2);
      q.closePath();
    }, SM.beard, { dark: SM.beardD, d: 0.4 });
    // soot on the cheek
    sk.blob(ell(cx + 2.35, cy + 0.15, 0.55, 0.3), '#7a5a4a', { line: 0, sil: false });
    face(sk, { x: cx + 0.8, y: cy - 0.1, eyes: p.eyes, mouth: p.mouth, gap: 2.4, drop: 1.85 });
    // bushy brows and the moustache over the mouth
    for (const [x, w] of [[cx - 0.4, 1.3], [cx + 2.0, 1.15]] as const) sk.limb([x - w / 2, cy - 1.15, x + w / 2, cy - 1.25 - (x > cx ? 0.15 : 0)], 0.45, SM.beardD, { line: 0.5 });
    sk.blob((q) => {
      q.moveTo(cx - 0.6, cy + 1.45);
      q.quadraticCurveTo(cx + 0.85, cy + 0.85, cx + 2.4, cy + 1.45);
      q.quadraticCurveTo(cx + 0.9, cy + 1.85, cx - 0.6, cy + 1.45);
      q.closePath();
    }, SM.beard, { dark: SM.beardD, d: 0.15, line: 0.6 });
    sk.blob(ell(cx + 1.15, cy + 0.6, 0.5, 0.45), '#e08a6a', { line: 0.4 });
  },
  upper(sk, _p, k) {
    // a thick arm, the sleeve rolled to the shoulder
    const b = SMITH_BONES.upper;
    sk.limb([0, 0.2, 0, b], 1.35, k ? SM.skinD : SM.skin, { dark: k ? null : SM.skinD });
    sk.limb([0, -0.1, 0, 0.75], 1.5, k ? SM.shirtD : SM.shirt, { dark: k ? null : SM.shirtD });
  },
  fore(sk, p, k) {
    const f = SMITH_BONES.fore;
    const work = p.act === 'work' || p.act === 'show';
    sk.limb([0, 0, 0, f - 0.3], 1.25, k ? SM.skinD : SM.skin, { dark: k ? null : SM.skinD });
    if (k === 1 && work) {
      // in the show, once the arm is up, what it holds is the finished blade
      const blade = p.act === 'show' && p.arms[1].sh > 1.2;
      atHand(sk, p, 1, f, () => stock(sk, blade));
    }
    if (k === 0 && (work || p.act === 'celebrate')) hammer(sk, f);
    // a leather glove on the fist
    sk.blob(circ(0, f, 0.85), k ? SM.gloveD : SM.glove, { dark: k ? null : SM.gloveD, d: 0.25 });
    if (k === 0 && landed(p)) {
      // the blow lands: sparks off the hammer's face
      sk.at(mul(move(FACE[0], f + FACE[1]), upright(p, 0)), () => sparks(sk, 0, 0.1, 2.0, 8, '#ffd36a', Math.round(p.u * 16)));
    }
  },
};

// A horseshoe, fresh off the anvil: an iron U with its nail holes.
const horseshoe: NpcServe = {
  name: 'horseshoe',
  drink: false,
  draw(sk) {
    sk.limb([-0.85, 0.9, -1.0, -0.1, -0.55, -0.85, 0.15, -1.05, 0.85, -0.7, 1.15, 0.1, 0.95, 0.9], 0.55, '#8a8480', { dark: '#5f5a57' });
    sk.draw((q, c) => {
      q.fillStyle = c.ink;
      for (const [x, y] of [[-0.95, 0.35], [-0.8, -0.45], [0.95, -0.35], [1.1, 0.4]] as const) {
        q.beginPath();
        q.arc(x, y, 0.1, 0, TAU);
        q.fill();
      }
    });
  },
};

// One blow, k from 0 (the hammer's face on the bar) to 1 (drawn back
// behind his head). The strike, from beside his ear down onto the bar, is
// the way from k = 0.3 to 0 and falls between frames (no frame of a blow
// has k under 0.3 but its landing: see raised), for his fist could not
// come down over his short arm's arc without crossing his face; from 0.3
// up the fist stays by his ear and goes back behind his head, the elbow
// up, the hammer cocked. The body leans into the blow and the far hand
// keeps the bar on the anvil.
function blow(k: number): Pick<Puppet, 'bob' | 'lean' | 'arms'> {
  const strike = ease(k, 0, 0.3);
  const back = ease(k, 0.3, 1);
  return {
    bob: -0.15 * (1 - k),
    lean: 0.15 - 0.1 * k,
    arms: [
      { sh: 0.85 + 2.15 * strike + 0.4 * back, el: 0.72 - 0.02 * strike + 0.15 * back },
      { sh: -0.35 + 0.28 * k, el: 2.19 - 0.5 * k },
    ],
  };
}

// How far up the hammer is through one blow, ph 0 to 1: landing at 0, up
// fast, a moment at the top, and down; never under 0.3 off the landing, so
// the strike's last stretch falls between frames (a blow is 9 or 12 of
// them).
const raised = (ph: number) => (ph < 0.05 ? 0 : 0.3 + 0.7 * (ph < 0.5 ? Math.sin((ph / 0.5) * (Math.PI / 2)) : Math.cos(((ph - 0.5) / 0.5) * (Math.PI / 2)) ** 1.4));

// At the anvil: two blows a loop, sparks off each, the head nodding with
// them, eyes screwed up as each lands.
const smithWork: NpcLoop = {
  secs: 1.6,
  pose(u) {
    const ph = (u * 2) % 1;
    const k = raised(ph);
    const hit = ph < 0.05;
    return { ...rest(), ...blow(k), tilt: 0.14 - 0.1 * k, eyes: hit ? 'shut' : 'open', mouth: hit ? 'closed' : 'smile' };
  },
};

// Forging a blade: four quick blows, harder and faster than at work, the
// last landing 9/16 of the way round; then the blade lifted high over half
// a second, glowing, held there with a laugh, and lowered over another
// half second to the anvil, where the next loop's first blow lands.
const smithShow: NpcLoop & { crowd: 'watch' } = {
  secs: 3.2,
  crowd: 'watch',
  pose(u) {
    if (u < SHOW_BLOWS) {
      const n = (u * 16) / 3;
      const k = n >= 3 ? 0 : raised(n % 1);
      return { ...rest(), ...blow(k), tilt: 0.16 - 0.12 * k, eyes: k < 0.1 ? 'shut' : 'open', mouth: k < 0.1 ? 'o' : 'closed' };
    }
    const up = ease(u, 0.57, 0.72) - ease(u, 0.8, 0.95);
    const shake = Math.sin(u * TAU * 5) * bump(u, 0.62, 0.9);
    const b = blow(0);
    return {
      ...rest(),
      bob: 0.25 * up + b.bob * (1 - up),
      lean: b.lean * (1 - up) - 0.08 * up,
      tilt: 0.16 - 0.48 * up,
      arms: [
        { sh: b.arms[0].sh * (1 - up) + 0.35 * up, el: b.arms[0].el * (1 - up) + 0.45 * up },
        { sh: b.arms[1].sh * (1 - up) + 2.3 * up, el: b.arms[1].el * (1 - up) + (0.1 + 0.06 * shake) * up },
      ],
      eyes: up > 0.5 ? 'happy' : 'open',
      mouth: up > 0.5 ? 'open' : 'smile',
    };
  },
};

// The hammer up behind his head (swung back and up, never across his
// face), the other fist pumping out in front, and a roar.
const smithCelebrate: NpcLoop = {
  secs: 1.6,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const pump = Math.abs(Math.sin(u * TAU * 1.5));
    return { ...rest(), bob: 0.3 * pump * k, lean: -0.06 * k, tilt: -0.15 * k, arms: [swing(-2.5 * k, -0.8 * k), swing(1.65 * k, (0.6 + 0.3 * pump) * k)], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

const blacksmith: Npc = {
  name: 'blacksmith',
  station: 'write',
  // on the floor at the smithy's front, turned to the anvil
  place: { mode: 'standing', u: SMITH.u, v: SMITH.v, look: 'along' },
  tall: 15,
  bones: SMITH_BONES,
  parts: smithParts,
  work: smithWork,
  show: smithShow,
  celebrate: smithCelebrate,
  serve: horseshoe,
};

// ── the assayer ──────────────────────────────────────────────────────────
// Behind his counter in the assay office: a thin clerk in a green eyeshade
// and round spectacles, hair parted down the middle, a waxed moustache, a
// white shirt with red sleeve garters under an oxblood waistcoat with a
// watch chain, a black string tie. He weighs gold dust on hand scales held
// up in the far hand, pinching more into the pan with the near one, then
// lifts a loupe to his eye and peers.

const AS = {
  skin: '#e7c19c',
  skinD: '#c09270',
  hair: '#3a2a20',
  hairD: '#251a13',
  shirt: '#f2e8d2',
  shirtD: '#cfc2a4',
  vest: '#7a3530',
  vestD: '#5a2420',
  trousers: '#5a5450',
  trousersD: '#423d3a',
  shoe: '#2e2420',
  shade: '#5fae8a',
  shadeD: '#3f8a6a',
  garter: '#c8382c',
  brass: C.brass,
  brassD: '#a87a2a',
};

const ASSAYER_BONES: Bones = { neck: [0.15, -7.8], shoulders: [[-1.5, -7.25], [1.75, -7.25]], upper: 1.65, fore: 1.6 };

// The hand scales hanging from the far fist: a short chain, the beam
// tipped `tip` radians, a brass pan on three cords at each end.
function scales(sk: Sketch, tip: number): void {
  sk.limb([0, 0.1, 0, 0.9], 0.08, AS.brassD, { line: 0.4 });
  sk.at(mul(move(0, 0.95), turn(tip)), () => {
    sk.limb([-1.35, 0, 1.35, 0], 0.17, AS.brass, { dark: AS.brassD });
    sk.blob(circ(0, 0, 0.22), AS.brass, { line: 0.5 });
    for (const x of [-1.25, 1.25]) {
      sk.at(mul(move(x, 0), turn(-tip)), () => {
        sk.draw((q, c) => {
          q.strokeStyle = '#6a5030';
          q.lineWidth = Math.max(0.06, 0.7 / c.px);
          q.beginPath();
          q.moveTo(0, 0);
          q.lineTo(-0.5, 1.25);
          q.moveTo(0, 0);
          q.lineTo(0.5, 1.25);
          q.stroke();
        });
        sk.blob((q) => {
          q.moveTo(-0.65, 1.2);
          q.quadraticCurveTo(0, 1.75, 0.65, 1.2);
          q.closePath();
        }, AS.brass, { dark: AS.brassD, d: 0.12, line: 0.5 });
        if (x < 0) sk.blob(ell(0, 1.18, 0.38, 0.14), C.gold, { line: 0, sil: false });
      });
    }
  });
}

const assayerParts: NpcParts = {
  body(sk, _p, back) {
    for (const [x, near] of [[0.75, false], [-0.75, true]] as const) {
      sk.limb([x, -3.6, x + 0.05, -0.8], 1.15, near ? AS.trousers : AS.trousersD, { dark: near ? AS.trousersD : null });
      sk.blob((q) => q.roundRect(x - 0.5, -0.95, 1.5, 0.95, 0.42), AS.shoe, { dark: shade(AS.shoe, -0.2), d: 0.2 });
    }
    // the shirt, then the waistcoat over it
    sk.blob((q) => {
      q.moveTo(-1.7, -7.55);
      q.quadraticCurveTo(0.15, -8.1, 1.95, -7.55);
      q.lineTo(1.95, -3.4);
      q.quadraticCurveTo(0.15, -3.0, -1.75, -3.4);
      q.closePath();
    }, AS.shirt, { dark: AS.shirtD, d: 0.45 });
    if (back) {
      sk.blob(poly([-1.75, -7.2, 1.95, -7.2, 2.0, -3.4, -1.8, -3.4]), AS.vestD, { line: 0.5 });
      return;
    }
    sk.blob(poly([-1.75, -7.35, -0.15, -7.4, 0.55, -5.0, 1.3, -7.4, 1.95, -7.3, 2.05, -3.35, 0.6, -2.8, -1.8, -3.35]), AS.vest, { dark: AS.vestD, d: 0.4 });
    // buttons and the watch chain across to a pocket
    sk.draw((q, c) => {
      q.fillStyle = '#e6c27a';
      for (const y of [-4.6, -3.8]) {
        q.beginPath();
        q.arc(0.6, y, 0.13, 0, TAU);
        q.fill();
      }
      q.strokeStyle = C.gold;
      q.lineWidth = Math.max(0.12, 0.8 / c.px);
      q.beginPath();
      q.moveTo(0.6, -4.3);
      q.quadraticCurveTo(-0.4, -3.6, -1.35, -4.4);
      q.stroke();
    });
    // the string tie
    sk.limb([0.55, -7.45, 0.35, -5.9], 0.16, '#1e1814', { line: 0 });
    sk.limb([0.55, -7.45, 0.8, -5.95], 0.16, '#1e1814', { line: 0 });
  },
  head(sk, p, back) {
    const cx = 0.25;
    const cy = -3.15;
    sk.blob(ell(cx, cy, 3.2, 3.1), AS.skin, { dark: AS.skinD, d: 0.45 });
    // hair slicked flat and parted down the middle
    sk.blob((q) => {
      q.moveTo(cx - 3.2, cy + 0.2);
      q.quadraticCurveTo(cx - 3.3, cy - 3.2, cx, cy - 3.3);
      q.quadraticCurveTo(cx + 3.0, cy - 3.3, cx + 3.25, cy - 0.9);
      q.quadraticCurveTo(cx + 1.9, cy - 2.0, cx + 0.5, cy - 2.25);
      q.quadraticCurveTo(cx - 1.6, cy - 2.0, cx - 2.3, cy + 0.6);
      q.closePath();
    }, AS.hair, { dark: AS.hairD, d: 0.3 });
    if (!back) {
      sk.blob(ell(cx - 2.4, cy + 0.7, 0.55, 0.8), AS.skin, { dark: AS.skinD, d: 0.2 });
      face(sk, { x: cx + 0.75, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, gap: 2.25, r: 0.42, drop: 1.6 });
      // round spectacles
      sk.draw((q, c) => {
        q.strokeStyle = '#8a6a3a';
        q.lineWidth = Math.max(0.14, 0.9 / c.px);
        q.beginPath();
        for (const [x, r] of [[cx - 0.4, 0.82], [cx + 1.85, 0.74]] as const) {
          q.moveTo(x + r, cy + 0.55);
          q.arc(x, cy + 0.55, r, 0, TAU);
        }
        q.moveTo(cx + 0.42, cy + 0.45);
        q.lineTo(cx + 1.11, cy + 0.45);
        q.moveTo(cx - 1.22, cy + 0.45);
        q.lineTo(cx - 2.3, cy + 0.2);
        q.stroke();
      });
      // a waxed moustache, its ends curled up
      sk.limb([cx - 0.65, cy + 1.75, cx - 0.05, cy + 1.75, cx + 0.75, cy + 1.6, cx + 1.4, cy + 1.75, cx + 2.05, cy + 1.75, cx + 2.35, cy + 1.45], 0.32, AS.hair, { line: 0.5 });
    }
    // the eyeshade: a band round the head, its green bill out over the eyes
    sk.limb([cx - 3.1, cy - 0.9, cx - 1.0, cy - 1.45, cx + 1.4, cy - 1.5, cx + 3.15, cy - 1.15], 0.5, AS.shadeD, { line: 0.5 });
    if (!back) {
      sk.blob(poly([cx - 1.6, cy - 1.45, cx + 3.15, cy - 1.45, cx + 4.6, cy - 0.35, cx + 0.2, cy - 0.15]), AS.shade, { dark: AS.shadeD, d: 0.2, line: 0.6 });
      sk.limb([cx + 0.1, cy - 0.3, cx + 4.4, cy - 0.45], 0.1, '#bfe8d0', { line: 0, sil: false });
    }
  },
  upper(sk, _p, k) {
    const b = ASSAYER_BONES.upper;
    sk.limb([0, 0, 0, b], 1.1, k ? AS.shirtD : AS.shirt, { dark: k ? null : AS.shirtD });
    sk.limb([0, 0.75, 0, 1.1], 1.18, AS.garter, { line: 0.5 });
  },
  fore(sk, p, k) {
    const f = ASSAYER_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 1.0, k ? AS.shirtD : AS.shirt, { dark: k ? null : AS.shirtD });
    sk.blob(circ(0, f, 0.55), k ? AS.skinD : AS.skin, { dark: AS.skinD, d: 0.2 });
    if (p.act !== 'work') return;
    const look = assayLook(p.u);
    if (k === 1) {
      // the scales, weighed: tipping while the dust goes in, settling
      // level, and tipping again as the next pinch comes
      const tip = 0.28 * (1 - ease(p.u, 0.3, 0.55) + ease(p.u, 0.85, 1)) * (0.7 + 0.3 * Math.sin(p.u * TAU * 3));
      atHand(sk, p, 1, f, () => scales(sk, tip));
    } else if (look < 0.15) {
      // a pinch of gold dust falling into the pan
      atHand(sk, p, 0, f, () => {
        sk.draw((q) => {
          q.fillStyle = C.gold;
          for (let i = 0; i < 4; i++) {
            const y = 0.35 + ((i * 0.33 + p.u * 3) % 1) * 1.4;
            q.beginPath();
            q.arc(0.1 * Math.sin(i * 2.1), y, 0.11, 0, TAU);
            q.fill();
          }
        });
      });
    } else {
      // the loupe at his eye: a little black barrel pointing out from it,
      // pinched between finger and thumb, its lens catching the light
      atHand(sk, p, 0, f, () => {
        sk.limb([0, -0.2, -0.1, -0.85], 0.35, AS.skin, { line: 0.5 });
        sk.blob((q) => q.roundRect(-0.45, -1.55, 0.95, 0.75, 0.15), '#2a2420', { line: 0.6 });
        sk.blob(ell(0.55, -1.18, 0.2, 0.42), '#cfe6ea', { line: 0.5 });
        twinkle(sk, 0.55, -1.32, 0.22, '#ffffff');
      });
    }
  },
};

// A gold nugget, lumpy, a glint on it.
const goldNugget: NpcServe = {
  name: 'nugget',
  drink: false,
  draw(sk) {
    sk.blob(poly([-0.95, 0.2, -0.65, -0.55, 0.05, -0.85, 0.8, -0.55, 1.05, 0.15, 0.55, 0.75, -0.4, 0.7]), C.gold, { dark: C.goldDark, d: 0.3 });
    twinkle(sk, -0.15, -0.3, 0.45, C.goldHi);
  },
};

// How far the assayer has the loupe up to his eye at u round his work: up
// over nearly a third of the loop, a long look, down over its last quarter
// (his near hand pinches dust while it is down, holds the loupe while it
// is up).
const assayLook = (u: number): number => ease(u, 0.38, 0.68) - ease(u, 0.76, 1);

// Weighing: dust pinched into the pan while the beam tips, the beam
// settling level, then the loupe up to the eye and a long look.
const assayerWork: NpcLoop = {
  secs: 3.2,
  pose(u) {
    const look = assayLook(u);
    const pinch = Math.sin(u * TAU * 4) * (1 - ease(u, 0.35, 0.45));
    return {
      ...rest(),
      lean: 0.05 + 0.04 * look,
      tilt: 0.1 + 0.08 * look,
      arms: [
        { sh: 1.05 + 0.08 * pinch + 0.63 * look, el: 0.75 + 0.8 * look },
        { sh: 1.35 - 0.1 * look, el: 1.05 },
      ],
      eyes: look > 0.5 ? 'open' : u > 0.4 && u < 0.48 ? 'blink' : 'open',
      mouth: look > 0.5 ? 'o' : 'closed',
    };
  },
};

const assayer: Npc = {
  name: 'assayer',
  station: 'read',
  // behind the counter, its top hiding his legs
  place: { mode: 'behind', u: ASSAY.u, v: ASSAY.v, top: ASSAY.top, edge: ASSAY.back },
  tall: 14,
  bones: ASSAYER_BONES,
  parts: assayerParts,
  work: assayerWork,
  serve: goldNugget,
};

// ── the prospector ───────────────────────────────────────────────────────
// An old prospector at the dig face: a battered slouch hat, a long white
// beard and bushy brows, a red nose, a faded olive check shirt under
// leather braces, patched trousers in tall boots, a tin cup at his belt.
// He stands on the floor before the face, turned along it, swinging his
// pick at the rock; he cheers by holding a nugget up to the light.

const PR = {
  skin: '#d9a079',
  skinD: '#b07a58',
  beard: '#ece4d2',
  beardD: '#c4b9a2',
  hat: '#7a5a3a',
  hatD: '#56402a',
  shirt: '#8a8a52',
  shirtD: '#6a6a3c',
  check: '#5a5a32',
  braces: '#5a3a24',
  trousers: '#7a6248',
  trousersD: '#5e4a36',
  patch: C.canvas,
  boot: '#4a3222',
};

const PROSPECTOR_BONES: Bones = { neck: [0.4, -7.55], shoulders: [[-1.35, -7.0], [1.95, -6.95]], upper: 1.7, fore: 1.6 };

// The pick in the near fist, swung one-handed: the haft out of the hand
// at an angle to the forearm that the wrist turns through the swing (`sh`,
// the arm's swing: square to it at the blow, near in line with it drawn
// back over the shoulder), the head across its end, its point leading.
const PICK_L = 3.6;
const PICK_T = 1.8;

function pickHaft(sh: number): [number, number] {
  const a = 1.35 - 1.05 * Math.max(0, Math.min(1, (sh - 1.0) / 2.0));
  return [Math.sin(a), Math.cos(a)];
}

function pick(sk: Sketch, f: number, sh: number): void {
  const [hx, hy] = pickHaft(sh);
  const ex = hx * PICK_L;
  const ey = f + hy * PICK_L;
  sk.limb([-hx * 0.35, f - hy * 0.35, ex, ey], 0.3, C.pine, { dark: C.timber });
  const ax = -hy;
  const ay = hx;
  const at = (s: number, t: number): number[] => [ex + ax * s + hx * t, ey + ay * s + hy * t];
  sk.limb([...at(-PICK_T, -0.55), ...at(-0.75, -0.05), ...at(0, 0.14), ...at(0.75, -0.05), ...at(PICK_T, -0.55)], 0.42, '#8a8790', { dark: '#5a5660' });
}

// Where the pick's point is, in the hand's frame.
function pickTip(f: number, sh: number): [number, number] {
  const [hx, hy] = pickHaft(sh);
  return [hx * PICK_L - hy * PICK_T - hx * 0.5, f + hy * PICK_L + hx * PICK_T - hy * 0.5];
}

const prospectorParts: NpcParts = {
  body(sk, p, back) {
    for (const [x, near] of [[1.0, false], [-0.8, true]] as const) {
      sk.limb([x, -3.7, x + 0.05, -1.6], 1.15, near ? PR.trousers : PR.trousersD, { dark: near ? PR.trousersD : null });
      sk.blob((q) => q.roundRect(x - 0.62, -2.1, 1.45, 2.1, 0.45), PR.boot, { dark: shade(PR.boot, -0.25), d: 0.2 });
    }
    if (!back) sk.blob((q) => q.roundRect(-1.15, -3.3, 0.75, 0.75, 0.15), PR.patch, { line: 0.5 });
    // the shirt, a little stooped
    sk.blob((q) => {
      q.moveTo(-1.6, -7.3);
      q.quadraticCurveTo(0.4, -7.8, 2.35, -7.2);
      q.lineTo(2.3, -3.4);
      q.quadraticCurveTo(0.3, -3.0, -1.75, -3.4);
      q.closePath();
    }, PR.shirt, { dark: PR.shirtD, d: 0.45 });
    // its check
    sk.draw((q, c) => {
      q.strokeStyle = PR.check;
      q.lineWidth = Math.max(0.12, 0.7 / c.px);
      q.beginPath();
      for (const x of [-0.8, 0.4, 1.6]) {
        q.moveTo(x, -7.4);
        q.lineTo(x, -3.3);
      }
      for (const y of [-6.2, -4.8]) {
        q.moveTo(-1.7, y);
        q.lineTo(2.3, y);
      }
      q.stroke();
    });
    // the belt, the braces, a tin cup on the hip
    sk.limb([-1.75, -3.65, 2.3, -3.65], 0.45, PR.braces, { line: 0.5 });
    if (back) {
      sk.limb([-0.9, -3.6, 0.3, -7.4], 0.32, PR.braces, { line: 0.5 });
      sk.limb([1.5, -3.6, 0.3, -7.4], 0.32, PR.braces, { line: 0.5 });
      return;
    }
    sk.limb([-0.9, -3.7, -0.75, -7.35], 0.32, PR.braces, { line: 0.5 });
    sk.limb([1.6, -3.7, 1.75, -7.2], 0.32, PR.braces, { line: 0.5 });
    const sw = p.act === 'work' ? 0.15 * Math.sin(p.u * TAU) : 0;
    sk.at(mul(move(-1.75, -3.4), turn(sw)), () => {
      sk.blob((q) => q.roundRect(-0.55, 0, 1.1, 0.9, 0.12), '#a3a6ab', { dark: '#7f8287', d: 0.15, line: 0.5 });
      sk.limb([0.55, 0.2, 0.85, 0.45, 0.55, 0.7], 0.12, '#7f8287', { line: 0.4 });
    });
  },
  head(sk, p, back) {
    const cx = 0.35;
    const cy = -3.0;
    // grey hair hanging under the hat at the back
    sk.blob(ell(cx - 2.0, cy + 0.3, 1.5, 1.8), PR.beardD, { dark: shade(PR.beardD, -0.15), d: 0.2 });
    sk.blob(ell(cx, cy, 3.15, 3.05), PR.skin, { dark: PR.skinD, d: 0.45 });
    if (!back) {
      sk.blob(ell(cx - 2.3, cy + 0.5, 0.55, 0.8), PR.skin, { dark: PR.skinD, d: 0.2 });
      // the long beard, down over the chest, the moustache over the mouth
      sk.blob((q) => {
        q.moveTo(cx - 2.3, cy + 0.2);
        q.quadraticCurveTo(cx - 1.9, cy + 3.0, cx - 0.5, cy + 4.6);
        q.quadraticCurveTo(cx + 0.6, cy + 6.2, cx + 1.4, cy + 5.4);
        q.quadraticCurveTo(cx + 2.4, cy + 4.0, cx + 3.1, cy + 0.9);
        q.quadraticCurveTo(cx + 1.5, cy + 1.7, cx + 0.6, cy + 1.6);
        q.quadraticCurveTo(cx - 1.0, cy + 1.7, cx - 2.3, cy + 0.2);
        q.closePath();
      }, PR.beard, { dark: PR.beardD, d: 0.35 });
      sk.draw((q, c) => {
        q.strokeStyle = PR.beardD;
        q.lineWidth = Math.max(0.1, 0.6 / c.px);
        q.beginPath();
        for (const [x0, y0, x1, y1] of [[cx - 0.6, cy + 2.6, cx - 0.1, cy + 4.0], [cx + 0.6, cy + 2.8, cx + 0.8, cy + 4.6], [cx + 1.8, cy + 2.4, cx + 1.7, cy + 3.6]] as const) {
          q.moveTo(x0, y0);
          q.lineTo(x1, y1);
        }
        q.stroke();
      });
      face(sk, { x: cx + 0.9, y: cy - 0.05, eyes: p.eyes, mouth: p.mouth, gap: 2.2, r: 0.42, drop: 1.85 });
      sk.blob((q) => {
        q.moveTo(cx - 0.4, cy + 1.5);
        q.quadraticCurveTo(cx + 0.95, cy + 0.8, cx + 2.5, cy + 1.45);
        q.quadraticCurveTo(cx + 1.0, cy + 2.15, cx - 0.4, cy + 1.5);
        q.closePath();
      }, PR.beard, { dark: PR.beardD, d: 0.15, line: 0.6 });
      sk.blob(ell(cx + 1.2, cy + 0.75, 0.6, 0.52), '#d9786a', { dark: '#b85a4e', d: 0.15, line: 0.5 });
      // bushy white brows
      for (const [x, w] of [[cx - 0.2, 1.4], [cx + 2.05, 1.2]] as const) sk.limb([x - w / 2, cy - 1.15, x + w / 2, cy - 1.4], 0.5, PR.beard, { line: 0.5 });
    }
    // the slouch hat: a dented crown and a wide brim, battered, tipped
    sk.at(mul(move(cx, cy - 1.7), turn(-0.08)), () => {
      sk.blob((q) => {
        q.moveTo(-2.4, 0.2);
        q.quadraticCurveTo(-2.6, -2.6, -0.6, -2.7);
        q.quadraticCurveTo(0.3, -2.2, 0.9, -2.75);
        q.quadraticCurveTo(2.7, -2.6, 2.5, 0.2);
        q.closePath();
      }, PR.hat, { dark: PR.hatD, d: 0.4 });
      sk.limb([-2.35, -0.25, 2.45, -0.25], 0.42, '#3a2a1c', { line: 0 });
      sk.blob((q) => {
        q.moveTo(-4.4, 0.75);
        q.quadraticCurveTo(-3.6, -0.3, 0.1, -0.1);
        q.quadraticCurveTo(3.9, -0.4, 4.9, 0.25);
        q.quadraticCurveTo(4.6, 0.95, 3.6, 0.85);
        q.quadraticCurveTo(0.1, 0.65, -3.5, 1.05);
        q.quadraticCurveTo(-4.3, 1.15, -4.4, 0.75);
        q.closePath();
      }, PR.hat, { dark: PR.hatD, d: 0.25 });
    });
  },
  upper(sk, _p, k) {
    const b = PROSPECTOR_BONES.upper;
    sk.limb([0, 0, 0, b], 1.05, k ? PR.shirtD : PR.shirt, { dark: k ? null : PR.shirtD });
  },
  fore(sk, p, k) {
    const f = PROSPECTOR_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 0.95, k ? PR.shirtD : PR.shirt, { dark: k ? null : PR.shirtD });
    sk.blob(circ(0, f, 0.55), k ? PR.skinD : PR.skin, { dark: PR.skinD, d: 0.2 });
    if (k === 0 && p.act === 'work') {
      pick(sk, f, p.arms[0].sh);
      if (p.u < 0.05) {
        const [x, y] = pickTip(f, p.arms[0].sh);
        sk.at(mul(move(x, y), upright(p, 0)), () => {
          // chips of rock off the blow
          sk.draw((q) => {
            q.fillStyle = C.rockLight;
            for (const [dx, dy, r] of [[-0.7, -0.8, 0.22], [-1.2, -0.2, 0.17], [-0.4, -1.4, 0.15], [-1.4, -1.0, 0.13]] as const) {
              q.beginPath();
              q.arc(dx, dy, r, 0, TAU);
              q.fill();
            }
          });
          twinkle(sk, -0.5, -0.4, 0.55, C.goldHi);
        });
      }
    }
    if (k === 1 && p.act === 'celebrate' && p.arms[1].sh > 0.6) {
      // a nugget held up to the light, glinting
      atHand(sk, p, 1, f, () => {
        sk.blob(poly([-0.6, -0.4, -0.35, -1.05, 0.25, -1.2, 0.7, -0.75, 0.6, -0.2, 0.1, 0.05]), C.gold, { dark: C.goldDark, d: 0.25 });
        twinkle(sk, 0.05, -0.8, 0.4 + 0.35 * Math.abs(Math.sin(p.u * TAU * 2)), '#ffffff');
      });
    }
  },
};

// At the face: the pick drawn back over the shoulder and swung into the
// rock, chips off it and a glint of gold, the other hand on his hip; an
// old man's swing, unhurried.
const prospectorWork: NpcLoop = {
  secs: 2,
  pose(u) {
    const k = u < 0.5 ? Math.sin((u / 0.5) * (Math.PI / 2)) : Math.cos(((u - 0.5) / 0.5) * (Math.PI / 2)) ** 1.4;
    const hit = u < 0.05;
    return {
      ...rest(),
      bob: -0.1 * (1 - k),
      lean: 0.15 - 0.23 * k,
      tilt: 0.08 - 0.16 * k,
      arms: [
        { sh: 1.16 + 1.84 * k, el: 0.07 + 0.53 * k + 0.5 * Math.sin(Math.PI * k) },
        { sh: -0.25, el: 1.5 },
      ],
      eyes: hit ? 'shut' : 'open',
      mouth: hit ? 'o' : 'closed',
    };
  },
};

// A nugget up to the light, a look at it, a grin.
const prospectorCelebrate: NpcLoop = {
  secs: 2,
  pose(u) {
    const k = env(u, 0.25, 0.8);
    return { ...rest(), bob: 0.15 * k, lean: -0.08 * k, tilt: -0.22 * k, arms: [{ sh: 0.3 * k, el: HANG.el + 1.5 * k }, swing(2.5 * k, 0.25 * k)], eyes: k > 0.5 ? 'happy' : 'open', mouth: k > 0.5 ? 'open' : 'smile' };
  },
};

const prospector: Npc = {
  name: 'prospector',
  station: 'search',
  // on the floor before the face, turned along it
  place: { mode: 'standing', u: 2.5, v: 7.5, look: 'along' },
  tall: 15,
  bones: PROSPECTOR_BONES,
  parts: prospectorParts,
  work: prospectorWork,
  celebrate: prospectorCelebrate,
};

export const NPCS: readonly Npc[] = [blacksmith, assayer, prospector];
