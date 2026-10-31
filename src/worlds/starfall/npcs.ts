import { shade } from '../../art/iso.ts';
import { move, turn, type Sketch } from '../../art/figure/paint.ts';
import { bump, ease, env, HANG, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand } from '../../art/npc/helpers.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet } from '../types.ts';
import { C } from './kit.ts';
import { CHAIR, CHUTE } from './stations.ts';

// The Starfall Base's locals (see Npc in ../types.ts), on the shared
// puppet, in the figures' style and the base's ink: none of them in a
// suit and helmet like the crew. The refinery tech stands by the
// refiner's chute (see CHUTE in ./stations.ts), the pilot sits in the
// pilot's chair facing the glass, its head over the chair's back (see
// CHAIR), and the cook stands at the food processor's end of the mess
// bench.

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// A torso from the shoulders (y0) to the hips (y1), x0 to x1 across.
function torso(x0: number, x1: number, y0: number, y1: number, belly = 0): (p: Pen) => void {
  return (q) => {
    q.moveTo(x0, y0);
    q.quadraticCurveTo((x0 + x1) / 2, y0 - 0.5, x1, y0);
    q.quadraticCurveTo(x1 + 0.2 + belly, (y0 + y1) / 2, x1 + 0.1, y1);
    q.quadraticCurveTo((x0 + x1) / 2, y1 + 0.45, x0 - 0.05, y1);
    q.quadraticCurveTo(x0 - 0.2, (y0 + y1) / 2, x0, y0);
    q.closePath();
  };
}

// Points round the top of an ellipse at (cx, cy), from its left end to its
// right (rx on the left, rx2 on the right), for a band over a head.
function overTop(cx: number, cy: number, rx: number, ry: number, rx2 = rx, n = 14): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = Math.PI + (i / n) * Math.PI;
    out.push(cx + Math.cos(t) * (Math.cos(t) < 0 ? rx : rx2), cy + Math.sin(t) * ry);
  }
  return out;
}

// Which side the far ear is on: +x from the front, -x from behind.
const FAR = (back: boolean) => (back ? -1 : 1);

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

// ── the refinery tech ─────────────────────────────────────────────────────
// A stocky tech with a big ginger beard, a navy beanie under yellow ear
// defenders, a slate work suit under a prefab-orange vest with silver
// bands, heavy gloves and boots. At work it scoops a sample of
// refined nuggets from the chute's bin and sifts it, then checks a readout
// on its slate, a tap and a nod. It hands over a cyan crystal.

const T_SKIN = '#e2a77a';
const T_SKIN_D = '#bb8056';
const BEARD = '#c4622e';
const BEARD_D = '#93451d';
const BEANIE = '#2f3552';
const BEANIE_D = '#20253c';
const SUIT = '#58687f';
const SUIT_D = '#414e63';
const VEST = C.trimOrange;
const VEST_D = '#c8711b';
const SILVER = '#eef3f8';
const T_PANTS = '#464d63';
const T_PANTS_D = '#33394b';
const BOOT = '#5e4b3c';
const BOOT_D = '#413328';
const GLOVE = '#d9c39a';
const GLOVE_D = '#b09766';

const TECH_BONES: Bones = { neck: [0.1, -7.8], shoulders: [[-1.95, -7.2], [2.05, -7.2]], upper: 1.75, fore: 1.55 };

// How far into its work the tech scoops (0..1) and reads its slate, by
// the frame (f = u * 12): the scoop up out of rest over two frames, down
// over two (6) as the slate comes up over two (7), and the slate down over
// two (11) to rest at frame 0; the dip into the bin eased in and out round
// frame 3.
const scooping = (u: number) => ease(u * 12, 0, 2) - ease(u * 12, 5, 7);
const reading = (u: number) => ease(u * 12, 6, 8) - ease(u * 12, 10, 12);
const dipping = (u: number) => bump(u * 12, 1.5, 4.5);

const techParts: NpcParts = {
  body(sk, _p, back) {
    // work trousers into heavy boots, the far leg first
    for (const [x, near] of [[1.05, false], [-0.95, true]] as const) {
      sk.limb([x, -3.7, x + 0.05, -1.1], 1.5, near ? T_PANTS : T_PANTS_D, { dark: near ? T_PANTS_D : null });
      sk.blob((q) => q.roundRect(x - 0.75, -1.35, 1.95, 1.35, 0.55), BOOT, { dark: BOOT_D, d: 0.25 });
      strokes(sk, BOOT_D, 0.18, (q) => {
        q.moveTo(x - 0.6, -0.3);
        q.lineTo(x + 1.05, -0.3);
      });
    }
    // the suit, then the vest over it, open down the front
    sk.blob(torso(-2.35, 2.45, -7.75, -3.2, 0.15), SUIT, { dark: SUIT_D, d: 0.5 });
    sk.blob(torso(-2.4, 2.5, -7.6, -3.55, 0.15), VEST, { dark: VEST_D, d: 0.45 });
    if (!back) sk.blob((q) => {
      q.moveTo(0.05, -7.85);
      q.lineTo(1.25, -7.85);
      q.lineTo(1.0, -3.6);
      q.lineTo(0.55, -3.6);
      q.closePath();
    }, SUIT, { dark: SUIT_D, d: 0.15, line: 0.5 });
    // two silver bands round the vest (broken at the opening in front)
    sk.draw((q, c) => {
      q.save();
      q.beginPath();
      torso(-2.4, 2.5, -7.6, -3.55, 0.15)(q);
      q.clip();
      for (const y of [-5.6, -4.55]) {
        q.fillStyle = SILVER;
        q.fillRect(-3, y, 6, 0.42);
        q.strokeStyle = c.ink;
        q.lineWidth = Math.max(c.line * 0.6, 1 / c.px);
        q.beginPath();
        q.rect(-3, y, 6, 0.42);
        q.stroke();
      }
      if (!back) {
        q.fillStyle = SUIT;
        q.fillRect(0.38, -8, 0.75, 5);
      }
      q.restore();
    });
    if (!back) strokes(sk, SUIT_D, 0.12, (q) => {
      q.moveTo(0.78, -7.7);
      q.lineTo(0.78, -3.7);
    });
    // a tool belt with a pouch on the near hip
    sk.blob((q) => q.roundRect(-2.45, -3.85, 4.95, 0.7, 0.3), '#3a3350', { dark: '#2a2440', d: 0.15 });
    sk.blob((q) => q.roundRect(-2.2, -3.6, 1.4, 1.3, 0.3), BOOT, { dark: BOOT_D, d: 0.2 });
    if (!back) sk.blob(circ(1.75, -3.5, 0.28), C.gold, { line: 0.5 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the far cup of its ear defenders, behind the head
    sk.blob(ell(cx + FAR(back) * 3.15, cy + 0.15, 0.95, 1.3), C.gold, { dark: '#d99a2a', d: 0.2 });
    sk.blob(ell(cx, cy, 3.35, 3.2), T_SKIN, { dark: T_SKIN_D, d: 0.45 });
    if (!back) {
      // the beard: round the jaw from ear to ear, full under the chin
      sk.blob((q) => {
        q.moveTo(cx - 3.3, cy - 0.2);
        q.quadraticCurveTo(cx - 2.6, cy + 1.6, cx - 0.6, cy + 1.25);
        q.quadraticCurveTo(cx + 0.9, cy + 1.05, cx + 2.4, cy + 1.25);
        q.quadraticCurveTo(cx + 3.3, cy + 0.6, cx + 3.35, cy - 0.3);
        q.quadraticCurveTo(cx + 3.9, cy + 3.0, cx + 0.6, cy + 4.0);
        q.quadraticCurveTo(cx - 2.8, cy + 3.9, cx - 3.3, cy - 0.2);
        q.closePath();
      }, BEARD, { dark: BEARD_D, d: 0.35 });
      // a moustache over the mouth
      sk.blob((q) => {
        q.moveTo(cx - 0.4, cy + 1.75);
        q.quadraticCurveTo(cx + 0.7, cy + 1.05, cx + 1.85, cy + 1.75);
        q.quadraticCurveTo(cx + 0.7, cy + 1.6, cx - 0.4, cy + 1.75);
        q.closePath();
      }, BEARD_D, { line: 0.5 });
      face(sk, { x: cx + 0.65, y: cy + 0.3, eyes: p.eyes, mouth: p.mouth, drop: 1.85 });
    } else {
      sk.blob(ell(cx, cy + 1.2, 3.0, 2.0), BEARD_D, { sil: false, line: 0 });
    }
    // the beanie, rolled up at its brim, over the top of the head
    sk.blob((q) => {
      q.moveTo(cx - 3.45, cy - 0.7);
      q.quadraticCurveTo(cx - 3.4, cy - 3.95, cx + 0.1, cy - 4.0);
      q.quadraticCurveTo(cx + 3.5, cy - 3.95, cx + 3.5, cy - 0.7);
      q.closePath();
    }, BEANIE, { dark: BEANIE_D, d: 0.35 });
    sk.blob((q) => q.roundRect(cx - 3.6, cy - 1.45, 7.2, 1.05, 0.5), BEANIE, { dark: BEANIE_D, d: 0.2 });
    // ear defenders: a band over the beanie, a safety-yellow cup each side
    sk.limb(overTop(cx, cy - 0.3, 3.25, 3.95), 0.5, '#3a3350', { dark: '#262138' });
    sk.blob(ell(cx - FAR(back) * 3.2, cy + 0.15, 1.1, 1.45), C.gold, { dark: '#d99a2a', d: 0.3 });
    sk.blob(ell(cx - FAR(back) * 3.35, cy + 0.15, 0.45, 0.75), '#3a3350', { line: 0.5, sil: false });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, TECH_BONES.upper], 1.45, k ? SUIT_D : SUIT, { dark: k ? null : SUIT_D });
  },
  fore(sk, p, k) {
    const f = TECH_BONES.fore;
    sk.limb([0, 0, 0, f - 0.55], 1.3, k ? SUIT_D : SUIT, { dark: k ? null : SUIT_D });
    // a heavy glove, a turned-back cuff
    sk.blob((q) => q.roundRect(-0.8, f - 0.95, 1.6, 0.6, 0.25), k ? GLOVE_D : GLOVE, { dark: GLOVE_D, d: 0.15 });
    sk.blob(circ(0, f, 0.72), k ? GLOVE_D : GLOVE, { dark: GLOVE_D, d: 0.25 });
    if (p.act !== 'work') return;
    // the scoop in the near hand while it samples, nuggets in it once dipped
    if (k === 0 && scooping(p.u) > 0.3) {
      atHand(sk, p, k, f, () => {
        sk.limb([0, 0, 0.9, 0.5], 0.32, '#8c939b');
        sk.blob((q) => {
          q.moveTo(0.7, 0.3);
          q.lineTo(2.7, 0.3);
          q.quadraticCurveTo(2.7, 1.35, 1.7, 1.35);
          q.quadraticCurveTo(0.7, 1.35, 0.7, 0.3);
          q.closePath();
        }, '#cfd6de', { dark: '#8c939b', d: 0.2 });
        if (p.u > 0.2) for (const [x, y] of [[1.1, 0.15], [1.65, -0.05], [2.25, 0.1]] as const) sk.blob((q) => q.roundRect(x - 0.3, y - 0.25, 0.6, 0.5, 0.15), C.gold, { dark: '#d99a2a', d: 0.1, line: 0.5 });
      });
    }
    // the slate in the far hand while it reads
    if (k === 1 && reading(p.u) > 0.4) {
      atHand(sk, p, k, f, () => {
        sk.blob((q) => q.roundRect(-0.4, -2.0, 2.6, 1.9, 0.3), C.dark, { dark: '#1e2133', d: 0.15 });
        sk.blob((q) => q.roundRect(-0.05, -1.7, 1.9, 1.3, 0.15), C.screen, { line: 0.5 });
        strokes(sk, '#2f6a9a', 0.14, (q) => {
          q.moveTo(0.2, -1.05);
          q.lineTo(0.6, -1.3);
          q.lineTo(1.0, -0.85);
          q.lineTo(1.55, -1.45);
        });
      });
    }
  },
};

// Scoops a sample out of the bin, sifts it, tips it back; then holds up its
// slate, taps it and nods.
const techWork: NpcLoop = {
  secs: 3,
  frames: 12,
  pose(u) {
    const s = scooping(u);
    const r = reading(u);
    const dip = dipping(u);
    const sift = u > 0.25 && u < 0.42 ? Math.sin(u * TAU * 12) : 0;
    const tap = bump(u, 0.62, 0.72) + bump(u, 0.72, 0.82);
    return {
      ...rest(),
      lean: s * (0.1 + 0.1 * dip) - 0.03 * r,
      bob: -0.25 * dip,
      tilt: s * (0.12 + 0.1 * dip) + 0.12 * r + 0.08 * bump(u, 0.82, 0.95),
      arms: [{ sh: HANG.sh + s * (0.8 + 0.08 * dip) + r * 1.05 + 0.15 * tap, el: HANG.el + s * (0.45 - 0.45 * dip + 0.12 * sift) + r * (1.15 - 0.2 * tap) }, swing(r * 1.2, r * 1.25)],
      eyes: u > 0.84 && u < 0.92 ? 'happy' : u > 0.34 && u < 0.4 ? 'blink' : 'open',
      mouth: r > 0.5 ? 'closed' : 'smile',
    };
  },
};

// A cluster of cyan crystal points on a little base.
const crystal: NpcServe = {
  name: 'crystal',
  drink: false,
  draw(sk) {
    sk.blob((q) => q.roundRect(-0.85, -0.25, 1.7, 0.55, 0.2), '#8c939b', { dark: '#6e757d', d: 0.1 });
    for (const [x, h, w, lean] of [[-0.45, 1.5, 0.42, -0.25], [0.45, 1.2, 0.4, 0.3], [0, 2.1, 0.5, 0.05]] as const) {
      sk.blob((q) => {
        q.moveTo(x - w, -0.2);
        q.lineTo(x - w * 0.8 + lean, -0.2 - h * 0.75);
        q.lineTo(x + lean, -0.2 - h);
        q.lineTo(x + w * 0.8 + lean, -0.2 - h * 0.75);
        q.lineTo(x + w, -0.2);
        q.closePath();
      }, C.cyan, { dark: shade(C.cyan, -0.25), d: 0.2 });
    }
  },
};

const refineryTech: Npc = {
  name: 'refineryTech',
  station: 'run',
  // on the floor at the refiner's end, by the chute's bin
  place: { mode: 'standing', u: 13, v: CHUTE.v },
  tall: 15,
  bones: TECH_BONES,
  parts: techParts,
  work: techWork,
  serve: crystal,
};

// ── the pilot ─────────────────────────────────────────────────────────────
// In the pilot's chair, facing the glass: fair hair in a high ponytail
// under a headset with a boom mic, a brown flight jacket with a cream fleece collar over a
// navy flight suit. From behind, its head and collar show over the chair's
// back. At work its hands make small moves on the stick and the throttle,
// and now and then it looks aside out of the glass; it celebrates with a
// fist pumped over the chair.

const P_SKIN = '#f0c39b';
const P_SKIN_D = '#cc976e';
const P_HAIR = '#e8b65a';
const P_HAIR_D = '#bf8a38';
const JACKET = '#8a5534';
const JACKET_D = '#62391f';
const FLEECE = '#f2e4c6';
const FLEECE_D = '#d4bf97';
const FLIGHT = '#3c4868';
const FLIGHT_D = '#2b3450';
const SET = '#3a3350';
const SET_D = '#262138';

// Seated: the hips at y = -1, the shoulders 4 up from them.
const PILOT_BONES: Bones = { neck: [0.1, -5.55], shoulders: [[-1.75, -4.95], [1.85, -4.95]], upper: 1.65, fore: 1.55 };

// How far the pilot has turned its head aside, in its work.
const aside = (p: Puppet) => (p.act === 'work' ? bump(p.u, 0.5, 0.92) : 0);

const pilotParts: NpcParts = {
  body(sk, _p, back) {
    // the legs, seated: thighs forward, shins down, boots; the far one first
    for (const [dx, near] of [[0.7, false], [-0.6, true]] as const) {
      const c = near ? FLIGHT : FLIGHT_D;
      sk.limb([dx - 0.4, -1.3, dx + 2.3, -1.15], 1.55, c, { dark: near ? FLIGHT_D : null });
      sk.limb([dx + 2.3, -1.15, dx + 2.55, 2.0], 1.35, c, { dark: near ? FLIGHT_D : null });
      sk.blob((q) => q.roundRect(dx + 1.85, 1.75, 1.95, 1.15, 0.5), SET, { dark: SET_D, d: 0.2 });
    }
    // the jacket, its ribbed hem, the zip
    sk.blob(torso(-2.3, 2.35, -5.6, -1.0), JACKET, { dark: JACKET_D, d: 0.5 });
    sk.blob((q) => q.roundRect(-2.3, -1.55, 4.75, 0.65, 0.3), JACKET_D, { dark: '#4a2a16', d: 0.1, line: 0.5 });
    if (!back) {
      strokes(sk, '#d8c6a0', 0.14, (q) => {
        q.moveTo(0.85, -5.3);
        q.lineTo(0.85, -1.6);
      });
      // a round patch on the chest: a gold star on navy (no words)
      sk.blob(circ(-0.7, -3.9, 0.62), FLIGHT, { line: 0.5 });
      sk.blob((q) => {
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const r = i % 2 ? 0.17 : 0.42;
          q.lineTo(-0.7 + Math.cos(a) * r, -3.9 + Math.sin(a) * r);
        }
        q.closePath();
      }, C.gold, { line: 0, sil: false });
    }
    // the fleece collar round the neck
    sk.blob((q) => {
      q.moveTo(-2.15, -5.25);
      q.quadraticCurveTo(-1.3, -6.3, 0.2, -6.25);
      q.quadraticCurveTo(1.7, -6.3, 2.35, -5.25);
      q.quadraticCurveTo(back ? 0.1 : 1.6, back ? -4.6 : -3.9, back ? -2.15 : 0.6, back ? -5.25 : -4.6);
      q.closePath();
    }, FLEECE, { dark: FLEECE_D, d: 0.3 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    const a = aside(p);
    if (back) {
      // turned aside, its cheek, an eye's lashes and its nose show past
      // the side of its head, the hair and the near cup turning with it
      if (a > 0.05) {
        sk.blob(ell(cx + 2.3, cy + 0.9, 1.55, 2.0), P_SKIN, { dark: P_SKIN_D, d: 0.2 });
        sk.blob(circ(cx + 2.4 + 1.45 * a, cy + 1.05, 0.45), P_SKIN, { dark: P_SKIN_D, d: 0.1 });
        if (a > 0.5) strokes(sk, '#2a2030', 0.16, (q) => {
          q.moveTo(cx + 2.55 + 0.6 * a, cy + 0.1);
          q.lineTo(cx + 2.95 + 0.6 * a, cy - 0.05);
        });
      }
      const hx = cx - 0.55 * a;
      sk.blob(ell(hx, cy, 3.3 - 0.25 * a, 3.15), P_HAIR, { dark: P_HAIR_D, d: 0.5 });
      // the hair drawn up into a high ponytail: strands up to its tie at
      // the crown, the tail falling down the back of the head, swinging
      // with the look aside
      const tx = hx + 0.2;
      const ty = cy - 2.35;
      strokes(sk, P_HAIR_D, 0.14, (q) => {
        for (const x of [-2.7, -1.6, 1.7, 2.75]) {
          q.moveTo(hx + x, cy + 1.6 - Math.abs(x) * 0.5);
          q.quadraticCurveTo(hx + x * 0.75, cy - 1.2, tx + x * 0.12, ty + 0.2);
        }
      });
      const sw = 0.7 * a;
      sk.blob((q) => {
        q.moveTo(tx - 0.75, ty);
        q.quadraticCurveTo(tx - 1.35 + sw, cy + 0.6, tx - 0.25 + sw * 1.4, cy + 2.9);
        q.quadraticCurveTo(tx + 0.15 + sw * 1.4, cy + 3.15, tx + 0.45 + sw * 1.2, cy + 2.7);
        q.quadraticCurveTo(tx + 1.15 + sw, cy + 0.6, tx + 0.75, ty);
        q.closePath();
      }, P_HAIR, { dark: P_HAIR_D, d: 0.3 });
      strokes(sk, P_HAIR_D, 0.12, (q) => {
        q.moveTo(tx - 0.2, ty + 0.6);
        q.quadraticCurveTo(tx - 0.45 + sw, cy + 0.9, tx - 0.05 + sw * 1.4, cy + 2.6);
        q.moveTo(tx + 0.35, ty + 0.6);
        q.quadraticCurveTo(tx + 0.45 + sw, cy + 0.9, tx + 0.3 + sw * 1.3, cy + 2.4);
      });
      sk.blob((q) => q.roundRect(tx - 0.7, ty - 0.3, 1.4, 0.55, 0.25), C.magenta, { line: 0.5 });
      sk.blob((q) => q.roundRect(cx - 1.3 - 0.4 * a, cy + 2.4, 2.6, 0.95, 0.45), P_SKIN_D, { line: 0.5, sil: false });
    } else {
      // the ponytail behind the head
      sk.blob((q) => {
        q.moveTo(cx - 1.2, cy - 3.2);
        q.quadraticCurveTo(cx - 4.6, cy - 2.6, cx - 4.1, cy + 1.6);
        q.quadraticCurveTo(cx - 3.2, cy + 0.2, cx - 1.6, cy - 1.6);
        q.closePath();
      }, P_HAIR, { dark: P_HAIR_D, d: 0.3 });
      sk.blob(ell(cx, cy, 3.3, 3.15), P_SKIN, { dark: P_SKIN_D, d: 0.45 });
      // short hair, a fringe swept to the side
      sk.blob((q) => {
        q.moveTo(cx - 3.3, cy + 0.3);
        q.quadraticCurveTo(cx - 3.5, cy - 3.6, cx + 0.2, cy - 3.6);
        q.quadraticCurveTo(cx + 3.5, cy - 3.5, cx + 3.35, cy - 0.6);
        q.quadraticCurveTo(cx + 2.4, cy - 2.0, cx + 0.3, cy - 1.7);
        q.quadraticCurveTo(cx - 1.3, cy - 1.4, cx - 2.3, cy - 0.2);
        q.quadraticCurveTo(cx - 2.8, cy + 0.6, cx - 3.3, cy + 0.3);
        q.closePath();
      }, P_HAIR, { dark: P_HAIR_D, d: 0.35 });
      face(sk, { x: cx + 0.55 + 0.45 * a, y: cy + 0.8, eyes: p.eyes, mouth: p.mouth });
    }
    // the headset: a band over the top, a cup on each ear, a boom mic (from
    // behind, the cup on the side it turns to comes round with the head)
    const far = FAR(back);
    const turnIn = back ? 0.9 * a : 0;
    sk.blob(ell(cx + far * 3.0, cy + 0.45, 0.85, 1.2), SET, { dark: SET_D, d: 0.2 });
    sk.limb(overTop(cx, cy + 0.1, 3.05, 3.6, 3.05 - turnIn), 0.45, SET, { dark: SET_D });
    sk.blob(ell(cx - far * (3.0 - turnIn), cy + 0.45, 1.0 - 0.2 * a * (back ? 1 : 0), 1.3), SET, { dark: SET_D, d: 0.25 });
    sk.blob(ell(cx - far * (3.1 - turnIn), cy + 0.45, 0.45, 0.65), C.magenta, { line: 0.5, sil: false });
    if (!back) {
      sk.limb([cx - 2.7, cy + 1.2, cx - 1.2, cy + 2.6, cx + 0.3, cy + 2.55], 0.24, SET);
      sk.blob(circ(cx + 0.45, cy + 2.5, 0.38), SET, { dark: SET_D, d: 0.1 });
    } else {
      sk.limb([cx + 2.9 - turnIn, cy + 1.3, cx + 3.1 + 0.4 * a, cy + 2.6], 0.24, SET);
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, PILOT_BONES.upper], 1.4, k ? JACKET_D : JACKET, { dark: k ? null : JACKET_D });
  },
  fore(sk, _p, k) {
    const f = PILOT_BONES.fore;
    sk.limb([0, 0, 0, f - 0.5], 1.25, k ? JACKET_D : JACKET, { dark: k ? null : JACKET_D });
    sk.blob((q) => q.roundRect(-0.65, f - 0.85, 1.3, 0.45, 0.2), JACKET_D, { line: 0.5 });
    // flight gloves
    sk.blob(circ(0, f, 0.62), k ? SET_D : SET, { dark: SET_D, d: 0.2 });
  },
};

// Small moves on the stick (the near hand) and the throttle (the far one),
// a sway with the craft; a reach to tap the console; a look aside out of
// the glass.
const pilotWork: NpcLoop = {
  secs: 3.6,
  frames: 12,
  pose(u) {
    const w = Math.sin(u * TAU);
    const w2 = Math.sin(u * TAU * 2 + 0.6);
    const reach = ease(u * 12, 0.5, 3) - ease(u * 12, 4, 6);
    const tap = bump(u, 0.22, 0.3) + bump(u, 0.3, 0.38);
    const a = bump(u, 0.5, 0.92);
    return {
      ...rest(),
      lean: 0.03 * w + 0.06 * reach,
      tilt: 0.05 * w2 - 0.12 * a + 0.05 * reach,
      arms: [{ sh: 1.05 + 0.1 * w2, el: 0.55 - 0.1 * w2 }, { sh: 0.9 + 0.06 * w + reach * (0.95 + 0.12 * tap), el: 0.6 - reach * (0.45 + 0.25 * tap) }],
      eyes: u > 0.3 && u < 0.36 ? 'blink' : 'open',
      mouth: a > 0.5 ? 'closed' : 'smile',
    };
  },
};

// From rest, a fist up beside its head, over the chair, pumped twice, and
// down again.
const pilotCelebrate: NpcLoop = {
  secs: 1.6,
  frames: 8,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const pump = Math.abs(Math.sin(u * TAU * 2));
    return {
      ...rest(),
      bob: 0.2 * pump * k,
      tilt: -0.12 * k,
      arms: [swing(0.6 * k, 0.4 * k), swing(1.9 * k, (0.75 + 0.3 * pump) * k)],
      eyes: k > 0.4 ? 'happy' : 'open',
      mouth: k > 0.4 ? 'open' : 'smile',
    };
  },
};

const pilot: Npc = {
  name: 'pilot',
  station: 'think',
  // in the chair, its back to us; cut at the top of the chair's back
  place: { mode: 'seated', u: CHAIR.u, v: CHAIR.v, z: CHAIR.seat - 1, top: CHAIR.top, edge: CHAIR.back, look: 'back' },
  tall: 12,
  bones: PILOT_BONES,
  parts: pilotParts,
  work: pilotWork,
  celebrate: pilotCelebrate,
};

// ── the cook ──────────────────────────────────────────────────────────────
// A round cook in a tall toque, a black moustache, a cyan neckerchief, a
// white jacket with gold buttons and a magenta apron (the mess bench's
// cushions). At work it whisks a bowl and tastes from the spoon; its show
// is a pancake flipped high in the low gravity, floating, turning, and
// caught. It serves a mug of something hot.

const K_SKIN = '#a8704a';
const K_SKIN_D = '#7f5233';
const TASH = '#2a2030';
const COAT = C.white;
const COAT_D = '#cdd5e1';
const APRON = C.magenta;
const APRON_D = '#d0307e';
const TOQUE = '#ffffff';
const TOQUE_D = '#d7dde8';
const K_PANTS = '#3f4560';
const K_PANTS_D = '#2e3349';
const PAN = '#3a3350';
const PANCAKE = '#f2b45a';

const COOK_BONES: Bones = { neck: [0.1, -7.7], shoulders: [[-2.05, -7.05], [2.15, -7.05]], upper: 1.6, fore: 1.5 };

// The pancake's flight in the show (0..1 up and down), and its turn.
const flight = (u: number) => (u < 0.16 || u > 0.74 ? 0 : Math.sin(((u - 0.16) / 0.58) * Math.PI));
const flip = (u: number) => ease(u, 0.16, 0.74) * 1.5 * TAU;

const cookParts: NpcParts = {
  body(sk, _p, back) {
    // the legs in dark trousers, black clogs; the far one first
    for (const [x, near] of [[1.0, false], [-0.9, true]] as const) {
      sk.limb([x, -3.4, x + 0.05, -0.9], 1.45, near ? K_PANTS : K_PANTS_D, { dark: near ? K_PANTS_D : null });
      sk.blob((q) => q.roundRect(x - 0.65, -1.05, 1.8, 1.05, 0.45), C.dark, { dark: '#1e2133', d: 0.2 });
    }
    // the jacket, round in the belly
    sk.blob((q) => {
      q.moveTo(-2.4, -7.5);
      q.quadraticCurveTo(0.1, -8.1, 2.45, -7.5);
      q.quadraticCurveTo(3.55, -5.0, 2.55, -2.9);
      q.quadraticCurveTo(0.1, -2.35, -2.35, -2.9);
      q.quadraticCurveTo(-2.9, -5.2, -2.4, -7.5);
      q.closePath();
    }, COAT, { dark: COAT_D, d: 0.55 });
    if (back) {
      // the apron's ties crossed at the back
      strokes(sk, APRON, 0.3, (q) => {
        q.moveTo(-2.2, -4.2);
        q.lineTo(2.3, -4.2);
        q.moveTo(0.1, -4.2);
        q.lineTo(-0.5, -3.1);
        q.moveTo(0.1, -4.2);
        q.lineTo(0.8, -3.2);
      });
      return;
    }
    // two rows of gold buttons
    for (const [x, y] of [[-0.35, -6.8], [-0.35, -5.9], [1.45, -6.8], [1.45, -5.9]] as const) sk.blob(circ(x, y, 0.2), C.gold, { line: 0.5, sil: false });
    // the apron: a bib over the belly to the knees, a pocket
    sk.blob((q) => {
      q.moveTo(-1.0, -6.0);
      q.lineTo(1.9, -6.0);
      q.quadraticCurveTo(3.25, -4.6, 2.75, -2.0);
      q.lineTo(-1.95, -2.0);
      q.quadraticCurveTo(-2.25, -4.3, -1.0, -6.0);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.45 });
    sk.blob((q) => q.roundRect(-0.4, -3.85, 2.0, 1.05, 0.25), APRON_D, { line: 0.5, sil: false });
    strokes(sk, APRON_D, 0.16, (q) => {
      q.moveTo(-1.9, -4.5);
      q.lineTo(2.9, -4.5);
    });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.85;
    // the neckerchief, its knot at the front
    sk.blob((q) => q.roundRect(cx - 2.2, cy + 2.55, 4.6, 0.95, 0.45), C.cyan, { dark: shade(C.cyan, -0.25), d: 0.2 });
    sk.blob(ell(cx, cy, 3.35, 3.1), K_SKIN, { dark: K_SKIN_D, d: 0.45 });
    if (!back) {
      sk.blob((q) => {
        q.moveTo(cx + 0.9, cy + 3.3);
        q.lineTo(cx + 2.0, cy + 4.3);
        q.lineTo(cx + 0.4, cy + 4.1);
        q.closePath();
      }, C.cyan, { dark: shade(C.cyan, -0.25), d: 0.1 });
      // short dark hair at the sides under the hat
      sk.blob((q) => {
        q.moveTo(cx - 3.3, cy - 0.9);
        q.quadraticCurveTo(cx - 3.4, cy + 0.6, cx - 2.6, cy + 1.0);
        q.lineTo(cx - 2.4, cy - 1.1);
        q.closePath();
      }, TASH, { line: 0.5 });
      // cheeks, a big moustache
      sk.blob(circ(cx + 2.35, cy + 1.4, 0.55), '#c7805a', { line: 0, sil: false });
      face(sk, { x: cx + 0.6, y: cy + 0.25, eyes: p.eyes, mouth: p.mouth, drop: 1.9 });
      sk.blob((q) => {
        q.moveTo(cx + 0.65, cy + 1.25);
        q.quadraticCurveTo(cx + 1.9, cy + 0.95, cx + 2.6, cy + 1.95);
        q.quadraticCurveTo(cx + 1.9, cy + 1.75, cx + 0.65, cy + 1.75);
        q.quadraticCurveTo(cx - 0.6, cy + 1.75, cx - 1.3, cy + 1.95);
        q.quadraticCurveTo(cx - 0.6, cy + 0.95, cx + 0.65, cy + 1.25);
        q.closePath();
      }, TASH, { line: 0.5 });
    } else {
      sk.blob(ell(cx, cy - 0.3, 3.1, 2.4), TASH, { sil: false, line: 0 });
    }
    // the toque: a band round the head, the puff over it, pleats
    sk.blob((q) => {
      q.moveTo(cx - 2.9, cy - 1.7);
      q.quadraticCurveTo(cx - 4.5, cy - 5.1, cx - 1.6, cy - 5.25);
      q.quadraticCurveTo(cx + 0.1, cy - 6.1, cx + 1.8, cy - 5.25);
      q.quadraticCurveTo(cx + 4.7, cy - 5.1, cx + 3.1, cy - 1.7);
      q.closePath();
    }, TOQUE, { dark: TOQUE_D, d: 0.5 });
    strokes(sk, TOQUE_D, 0.14, (q) => {
      for (const x of [-1.3, 0.1, 1.5]) {
        q.moveTo(cx + x, cy - 2.6);
        q.lineTo(cx + x * 1.15, cy - 4.7);
      }
    });
    sk.blob((q) => q.roundRect(cx - 3.15, cy - 2.6, 6.5, 1.25, 0.4), TOQUE, { dark: TOQUE_D, d: 0.25 });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, COOK_BONES.upper], 1.5, k ? COAT_D : COAT, { dark: k ? null : COAT_D });
  },
  fore(sk, p, k) {
    const f = COOK_BONES.fore;
    // rolled-up sleeves, bare forearms
    sk.limb([0, 0.2, 0, f - 0.25], 1.05, k ? K_SKIN_D : K_SKIN, { dark: k ? null : K_SKIN_D });
    sk.blob((q) => q.roundRect(-0.8, -0.2, 1.6, 0.75, 0.3), k ? COAT_D : COAT, { dark: COAT_D, d: 0.15 });
    sk.blob(circ(0, f, 0.66), k ? K_SKIN_D : K_SKIN, { dark: K_SKIN_D, d: 0.2 });
    if (p.act === 'work') {
      // the bowl in the far hand, the whisk (a spoon to taste) in the near
      if (k === 1) {
        atHand(sk, p, k, f, () => {
          sk.blob((q) => {
            q.moveTo(-0.6, -0.7);
            q.lineTo(2.6, -0.7);
            q.quadraticCurveTo(2.4, 0.9, 1.0, 0.9);
            q.quadraticCurveTo(-0.4, 0.9, -0.6, -0.7);
            q.closePath();
          }, C.panelLight, { dark: '#b9c4d2', d: 0.25 });
          sk.blob(ell(1.0, -0.72, 1.55, 0.3), '#ffe7a8', { line: 0.5, sil: false });
          sk.blob((q) => q.roundRect(0.3, 0.05, 1.4, 0.3, 0.12), C.cyan, { line: 0, sil: false });
        });
      } else {
        const taste = cookTaste(p.u) > 0.4;
        sk.at(move(0, f), () => {
          sk.limb([0, 0, 0, 1.9], 0.26, '#cfd6de');
          if (taste) sk.blob(ell(0, 2.15, 0.42, 0.55), '#cfd6de', { dark: '#8c939b', d: 0.1 });
          else sk.blob(ell(0, 2.3, 0.5, 0.8), '#e4e9ef', { dark: '#8c939b', d: 0.15, line: 0.5 });
        });
      }
    }
    if (p.act === 'show' && k === 0) {
      // the pan, level, and the pancake flying up out of it, turning
      atHand(sk, p, k, f, () => {
        const tip = 0.35 * bump(p.u, 0.08, 0.2) - 0.15 * bump(p.u, 0.72, 0.86);
        sk.at(turn(-tip), () => {
          sk.limb([0, 0, 1.0, -0.15], 0.38, PAN);
          sk.blob((q) => {
            q.moveTo(0.9, -0.45);
            q.lineTo(4.1, -0.45);
            q.quadraticCurveTo(4.1, 0.35, 3.4, 0.35);
            q.lineTo(1.6, 0.35);
            q.quadraticCurveTo(0.9, 0.35, 0.9, -0.45);
            q.closePath();
          }, PAN, { dark: '#262138', d: 0.15 });
        });
        const h = flight(p.u);
        const a = flip(p.u);
        const sq = Math.abs(Math.cos(a));
        sk.blob(ell(2.5 + 0.5 * h, -0.75 - 13 * h, 1.3, Math.max(0.24, 0.5 * sq + 0.12)), PANCAKE, { dark: '#d4893a', d: 0.15 });
        if (h > 0.25) {
          // a trail of crumbs floating up after it
          for (const [dx, dy, r] of [[-0.4, 1.4, 0.18], [0.5, 2.3, 0.14], [-0.1, 3.1, 0.11]] as const) sk.blob(circ(2.5 + 0.5 * h + dx, -0.75 - 13 * h + dy * h, r), PANCAKE, { line: 0.5, sil: false });
        }
      });
    }
  },
};

// How far the cook has the spoon up for a taste at u round its work
// (f = u * 12, the frame): up over three frames from 5, a taste, down over
// three from 9 (the whisk swapped for the spoon halfway up).
const cookTaste = (u: number): number => ease(u * 12, 5.5, 8.5) - ease(u * 12, 9, 12);

// Whisks the bowl, round and round, then tastes from the spoon, pleased.
const cookWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const taste = cookTaste(u);
    const stir = 1 - taste;
    const ph = (u / 0.6) * TAU * 3;
    return {
      ...rest(),
      bob: 0.12 * Math.abs(Math.sin(ph)) * stir,
      tilt: 0.12 * stir - 0.08 * taste,
      lean: 0.03 * stir,
      arms: [
        { sh: HANG.sh + stir * (0.95 + 0.12 * Math.sin(ph)) + taste * 1.05, el: HANG.el + stir * (1.05 + 0.2 * Math.cos(ph)) + taste * 1.9 },
        { sh: 0.95, el: 1.05 },
      ],
      eyes: taste > 0.6 ? 'happy' : 'open',
      mouth: taste > 0.6 ? 'o' : 'smile',
    };
  },
};

// The low-gravity pancake: a dip and a flick of the pan, the pancake
// floating up high and turning, watched all the way, caught, and the far
// arm up and out (over two frames, and down over two as the loop comes
// round).
const cookShow: NpcLoop & { crowd: 'watch' } = {
  secs: 4,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const h = flight(u);
    const flick = bump(u, 0.08, 0.2);
    const ta = ease(u * 16, 12, 14) - ease(u * 16, 14, 16);
    return {
      ...rest(),
      bob: -0.2 * bump(u, 0.02, 0.12) + 0.2 * flick,
      lean: -0.06 * h,
      tilt: -0.22 * h + 0.06 * bump(u, 0.74, 0.84),
      arms: [{ sh: 1.05 + 0.35 * flick - 0.15 * bump(u, 0.74, 0.86), el: 0.45 - 0.2 * flick }, { sh: HANG.sh + 0.5 * h + 1.6 * ta, el: HANG.el + 0.4 * h + 0.5 * ta }],
      eyes: ta > 0.3 ? 'happy' : 'open',
      mouth: h > 0.3 ? 'o' : ta > 0.3 ? 'open' : 'smile',
    };
  },
};

// A white mug with a magenta band, steaming.
const mug: NpcServe = {
  name: 'mug',
  drink: true,
  draw(sk) {
    sk.limb([0.85, -0.95, 1.35, -0.7, 1.35, -0.15, 0.85, 0.05], 0.26, C.white);
    sk.blob((q) => q.roundRect(-0.85, -1.35, 1.75, 1.85, 0.3), C.white, { dark: '#cdd5e1', d: 0.3 });
    sk.blob((q) => q.roundRect(-0.85, -0.75, 1.75, 0.5, 0), C.magenta, { line: 0.5, sil: false });
    sk.blob(ell(0.02, -1.32, 0.72, 0.2), '#6a3a2a', { line: 0.5, sil: false });
    strokes(sk, '#eef3f8', 0.16, (q) => {
      q.moveTo(-0.2, -1.65);
      q.quadraticCurveTo(-0.55, -2.0, -0.15, -2.35);
      q.moveTo(0.35, -1.6);
      q.quadraticCurveTo(0.05, -1.95, 0.4, -2.2);
    });
  },
};

const cook: Npc = {
  name: 'cook',
  station: 'idle',
  // on the floor at the food processor's end of the mess bench
  place: { mode: 'standing', u: 17, v: 5.4 },
  tall: 16,
  bones: COOK_BONES,
  parts: cookParts,
  work: cookWork,
  show: cookShow,
  serve: mug,
};

export const NPCS: readonly Npc[] = [refineryTech, pilot, cook];
