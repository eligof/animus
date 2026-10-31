import { shade } from '../../art/iso.ts';
import { bump, ease, env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import type { Sketch } from '../../art/figure/paint.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet } from '../types.ts';
import { C } from './kit.ts';
import { ANVIL, BENCH, FIRE, LEFT_SEAT, POT } from './stations.ts';

// The colony's locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the colony's earth-brown ink: the tailor behind
// the tailoring bench at its sewing machine, the blacksmith at the anvil
// by the smithy's side, and the camp cook on a log by the fire, stirring
// the pot. None wears a colonist's rancher hat.

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// Where the hand of arm k is in the body's frame (which bobs and leans: see
// toBody), for a held thing that must reach a point (the tongs to the
// anvil, the spoon into the pot).
function handAt(b: Bones, p: Puppet, k: 0 | 1): [number, number] {
  const { sh, el } = p.arms[k];
  const [sx, sy] = b.shoulders[k];
  return [sx + b.upper * Math.sin(sh) + b.fore * Math.sin(sh + el), sy + b.upper * Math.cos(sh) + b.fore * Math.cos(sh + el)];
}

// A point of the local's own frame (feet on the floor, upright) in its
// body's frame, which bobs and leans.
function toBody(p: Puppet, x: number, y: number): [number, number] {
  const c = Math.cos(-p.lean);
  const s = Math.sin(-p.lean);
  const yy = y + p.bob;
  return [x * c - yy * s, x * s + yy * c];
}

// Draws `fn` in a frame at the hand of arm k (the fore part's frame) turned
// so that its +y runs at angle `a` in the body's frame (0 straight down, +
// toward where the local faces).
function along(sk: Sketch, b: Bones, p: Puppet, k: 0 | 1, a: number, fn: () => void): void {
  const r = a - (p.arms[k].sh + p.arms[k].el);
  sk.at([Math.cos(-r), Math.sin(-r), -Math.sin(-r), Math.cos(-r), 0, b.fore], fn);
}

// Legs in trousers and shoes, the far one first: hips at y = -top.
function legs(sk: Sketch, top: number, w: number, cloth: string, clothD: string, shoe: string, apart = 0.95): void {
  for (const [x, near] of [[apart, false], [-apart + 0.1, true]] as const) {
    sk.limb([x, -top, x + 0.1, -0.8], w, near ? cloth : clothD, { dark: near ? clothD : null });
    sk.blob((q) => q.roundRect(x - 0.6, -1.05, 1.65, 1.05, 0.45), shoe, { dark: shade(shoe, -0.25), d: 0.2 });
  }
}

// ── the tailor ────────────────────────────────────────────────────────────
// An old tailor behind the bench at the sewing machine: bald on top with a
// grey fringe, a walrus moustache, round spectacles, a blue waistcoat with
// brass buttons over a cream shirt, red sleeve garters, the yellow tape
// measure round its neck and a red pincushion on its wrist. At work it
// feeds the cloth under the needle with both hands, head bent, then looks
// the seam over.

const T_SKIN = '#e8b690';
const T_SKIN_D = '#c48c66';
const T_HAIR = '#d6d2ca';
const T_HAIR_D = '#a8a39a';
const T_SHIRT = C.paper;
const T_SHIRT_D = '#cfbf9c';
const T_VEST = C.clothBlue;
const T_VEST_D = '#2c4b6e';
const T_TROU = '#5a4636';
const T_TROU_D = '#45352a';
const T_SHOE = '#3a2a20';
const TAPE = '#ead24a';
const BRASS = '#d8b048';

const T_BONES: Bones = { neck: [0.1, -7.8], shoulders: [[-1.6, -7.2], [1.75, -7.2]], upper: 1.65, fore: 1.6 };

const tailorParts: NpcParts = {
  body(sk) {
    legs(sk, 3.4, 1.2, T_TROU, T_TROU_D, T_SHOE);
    // the shirt, then the waistcoat over it, open in a V at the neck
    sk.blob((q) => {
      q.moveTo(-1.95, -7.6);
      q.quadraticCurveTo(0.1, -8.1, 2.1, -7.6);
      q.lineTo(2.3, -3.3);
      q.quadraticCurveTo(0.15, -2.85, -2.05, -3.3);
      q.closePath();
    }, T_SHIRT, { dark: T_SHIRT_D, d: 0.5 });
    sk.blob((q) => {
      q.moveTo(-1.95, -7.45);
      q.quadraticCurveTo(-1.2, -7.95, -0.35, -7.85);
      q.lineTo(0.6, -5.5);
      q.lineTo(1.45, -7.85);
      q.quadraticCurveTo(1.95, -7.75, 2.15, -7.45);
      q.lineTo(2.35, -3.7);
      q.lineTo(1.3, -2.9);
      q.lineTo(0.55, -3.45);
      q.quadraticCurveTo(-0.8, -3.0, -2.05, -3.35);
      q.closePath();
    }, T_VEST, { dark: T_VEST_D, d: 0.55 });
    // a dark tie in the V, brass buttons down the opening
    sk.blob((q) => {
      q.moveTo(0.3, -7.7);
      q.lineTo(0.9, -7.7);
      q.lineTo(0.75, -6.1);
      q.lineTo(0.6, -5.75);
      q.lineTo(0.45, -6.1);
      q.closePath();
    }, '#7a2e2a', { line: 0.5 });
    for (const y of [-5.0, -4.25, -3.5]) sk.blob(circ(0.62 + (y + 5) * 0.04, y, 0.22), BRASS, { line: 0.45, sil: false });
    // the tape measure hung round the neck, down either side of the chest
    for (const [x0, x1, y1] of [[-1.0, -1.3, -4.5], [1.55, 1.85, -4.95]] as const) {
      sk.limb([x0, -7.75, x0 - 0.05, -6.2, x1, y1], 0.55, TAPE, { dark: shade(TAPE, -0.18) });
      sk.draw((q, c) => {
        if (c.px < 5) return;
        q.strokeStyle = '#6a5a2a';
        q.lineWidth = Math.max(0.08, 0.7 / c.px);
        q.beginPath();
        for (let i = 0; i < 5; i++) {
          const f = 0.25 + i * 0.15;
          const x = x0 + (x1 - x0) * f;
          const y = -7.4 + (y1 + 7.4) * f;
          q.moveTo(x - 0.27, y);
          q.lineTo(x - 0.05, y);
        }
        q.stroke();
      });
    }
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.35, 3.25), T_SKIN, { dark: T_SKIN_D, d: 0.45 });
    // the shine on the bald dome, toward the light
    sk.draw((q, c) => {
      q.fillStyle = '#ffffff70';
      q.beginPath();
      q.ellipse(cx + c.lx * 1.4, cy - 1.0 + c.ly * 1.5, 0.95, 0.42, Math.atan2(c.ly, c.lx) + Math.PI / 2, 0, TAU);
      q.fill();
    });
    // the grey fringe round the back and over the far ear
    sk.blob((q) => {
      q.moveTo(cx - 1.3, cy - 2.35);
      q.quadraticCurveTo(cx - 3.85, cy - 1.9, cx - 3.55, cy + 1.0);
      q.quadraticCurveTo(cx - 3.2, cy + 2.6, cx - 1.7, cy + 2.95);
      q.quadraticCurveTo(cx - 2.45, cy + 1.2, cx - 2.3, cy - 0.4);
      q.quadraticCurveTo(cx - 2.1, cy - 1.6, cx - 1.3, cy - 2.35);
      q.closePath();
    }, T_HAIR, { dark: T_HAIR_D, d: 0.3 });
    sk.blob(ell(cx + (back ? -3.05 : 3.05), cy - 0.25, 0.55, 1.05), T_HAIR, { dark: T_HAIR_D, d: 0.2 });
    // the near ear in the fringe
    sk.blob(ell(cx + (back ? 2.55 : -2.55), cy + 0.45, 0.6, 0.75), T_SKIN, { dark: T_SKIN_D, d: 0.2, line: 0.5 });
    if (back) return;
    const ex = cx + 0.6;
    const ey = cy + 0.5;
    face(sk, { x: ex, y: ey, eyes: p.eyes, mouth: p.mouth, drop: 2.15 });
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = c.ink;
      // bushy grey brows
      q.lineWidth = Math.max(0.42, 1.5 / c.px);
      q.strokeStyle = T_HAIR_D;
      q.beginPath();
      q.moveTo(ex - 1.95, ey - 1.15);
      q.quadraticCurveTo(ex - 1.2, ey - 1.55, ex - 0.55, ey - 1.2);
      q.moveTo(ex + 0.6, ey - 1.2);
      q.quadraticCurveTo(ex + 1.2, ey - 1.5, ex + 1.8, ey - 1.1);
      q.stroke();
      // round wire spectacles
      q.strokeStyle = c.ink;
      q.lineWidth = Math.max(0.16, 0.9 / c.px);
      q.beginPath();
      q.arc(ex - 1.15, ey, 0.82, 0, TAU);
      q.moveTo(ex + 1.15 + 0.74, ey);
      q.arc(ex + 1.15, ey, 0.74, 0, TAU);
      q.moveTo(ex - 0.33, ey - 0.1);
      q.quadraticCurveTo(ex, ey - 0.35, ex + 0.41, ey - 0.1);
      q.moveTo(ex - 1.97, ey - 0.1);
      q.lineTo(cx - 2.2, ey - 0.35);
      q.stroke();
    });
    // the walrus moustache
    sk.blob((q) => {
      q.moveTo(ex - 1.55, ey + 1.95);
      q.quadraticCurveTo(ex - 1.2, ey + 0.95, ex + 0.05, ey + 1.15);
      q.quadraticCurveTo(ex + 1.3, ey + 0.95, ex + 1.6, ey + 1.9);
      q.quadraticCurveTo(ex + 0.9, ey + 1.55, ex + 0.05, ey + 1.75);
      q.quadraticCurveTo(ex - 0.85, ey + 1.6, ex - 1.55, ey + 1.95);
      q.closePath();
    }, T_HAIR, { dark: T_HAIR_D, d: 0.2, line: 0.5 });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, T_BONES.upper], 1.15, k ? T_SHIRT_D : T_SHIRT, { dark: k ? null : T_SHIRT_D });
    // a red sleeve garter
    sk.limb([-0.5, 0.75, 0.5, 0.75], 0.32, C.cloth, { line: 0.4 });
  },
  fore(sk, p, k) {
    const f = T_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 0.95, k ? T_SKIN_D : T_SKIN, { dark: k ? null : T_SKIN_D });
    // the rolled cuff
    sk.limb([0, 0.05, 0, 0.45], 1.2, k ? T_SHIRT_D : T_SHIRT, { dark: k ? null : T_SHIRT_D, line: 0.5 });
    sk.blob(circ(0, f, 0.6), k ? T_SKIN_D : T_SKIN, { dark: T_SKIN_D, d: 0.2 });
    // the pincushion on the near wrist, pins in it
    if (k === 0 && p.act !== 'handOver') {
      sk.blob(ell(-0.55, f - 0.55, 0.5, 0.42), C.cloth, { dark: shade(C.cloth, -0.25), d: 0.15, line: 0.5 });
      sk.draw((q, c) => {
        if (c.px < 4) return;
        for (const [x, y, col] of [[-0.75, -0.75, '#f0f0e8'], [-0.4, -0.85, '#7cc0e0'], [-0.5, -0.45, '#f0d040']] as const) {
          q.fillStyle = col;
          q.beginPath();
          q.arc(x, f + y, 0.13, 0, TAU);
          q.fill();
        }
      });
    }
  },
};

// Feeding cloth under the needle, both hands on it, head bent to the seam:
// two pushes, then a look up at the work and back.
const tailorWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const look = bump(u, 0.58, 1);
    const k = 1 - look;
    const push = Math.sin(u * TAU * 2) * (1 - ease(u, 0.42, 0.58));
    return {
      ...rest(),
      lean: 0.08 * k + 0.02,
      tilt: 0.16 * k - 0.06 * look,
      bob: -0.05 * Math.abs(push),
      arms: [{ sh: 1.05 + 0.16 * push * k - 0.35 * look, el: 0.45 + 0.25 * look }, { sh: 0.95 - 0.16 * push * k + 0.05 * look, el: 0.55 + 0.1 * look }],
      eyes: look > 0.6 ? 'happy' : 'open',
      mouth: look > 0.6 ? 'smile' : 'closed',
    };
  },
};

// A woollen scarf, folded over, striped red and cream, fringed.
const scarf: NpcServe = {
  name: 'scarf',
  drink: false,
  draw(sk) {
    sk.blob((q) => q.roundRect(-0.9, -1.1, 1.8, 2.0, 0.35), C.cloth, { dark: shade(C.cloth, -0.25), d: 0.2 });
    sk.draw((q) => {
      q.fillStyle = C.paper;
      for (const y of [-0.55, 0.15]) q.fillRect(-0.85, y, 1.7, 0.32);
    });
    sk.blob((q) => q.roundRect(-0.9, -1.1, 1.8, 2.0, 0.35), '#0000', { line: 0.6, sil: false });
    sk.draw((q, c) => {
      q.strokeStyle = C.cloth;
      q.lineWidth = Math.max(0.12, 0.8 / c.px);
      q.beginPath();
      for (let i = 0; i < 5; i++) {
        q.moveTo(-0.7 + i * 0.35, 0.9);
        q.lineTo(-0.72 + i * 0.35, 1.4);
      }
      q.stroke();
    });
  },
};

const tailor: Npc = {
  name: 'tailor',
  station: 'write',
  // behind the cutting table, turned to the machine on its right; the
  // table's top hides its legs
  place: { mode: 'behind', u: BENCH.at, v: BENCH.stand, top: BENCH.z, edge: BENCH.v0, look: 'along' },
  tall: 14,
  bones: T_BONES,
  parts: tailorParts,
  work: tailorWork,
  serve: scarf,
};

// ── the blacksmith ────────────────────────────────────────────────────────
// A big smith at the anvil by the smithy's open side: a black beard, a red
// headband, bare arms, a leather apron over a grey shirt, a bracer on each
// wrist. The tongs in its near hand hold a glowing bar on the anvil while
// the hammer in its far hand rings down on it; its show forges a horseshoe
// and holds it up glowing in the tongs; it cheers with the hammer high.

const S_SKIN = '#c4865a';
const S_SKIN_D = '#9a6440';
const S_BEARD = '#2e2420';
const S_BEARD_D = '#1a1410';
const S_SHIRT = '#8a8478';
const S_SHIRT_D = '#6a655c';
const APRON = '#8a5634';
const APRON_D = '#663e24';
const STRAP = '#4e3220';
const S_TROU = '#4a443e';
const S_TROU_D = '#36322e';
const S_BOOT = '#3a2a20';
const HOT = '#ffb040';
const HOTTER = '#fff0a0';

const S_BONES: Bones = { neck: [0.2, -8.15], shoulders: [[-2.1, -7.45], [2.25, -7.45]], upper: 1.8, fore: 1.75 };

// Where the anvil's face is from the smith, in its own frame (see the smithy's
// ANVIL and blacksmith's place below): the screen has it ANVIL_DX ahead and
// ANVIL_DY up.
const SMITH = { u: 12.5, v: ANVIL.v - 2.0 };
const ANVIL_DX = (SMITH.u - SMITH.v) - (ANVIL.u - ANVIL.v);
const ANVIL_DY = (SMITH.u + SMITH.v) / 2 - (ANVIL.u + ANVIL.v) / 2 + ANVIL.z + 0.4;
// How much of the show is the flurry of blows (the rest holds the shoe
// up); where the show holds the new horseshoe up, out before its face; the
// shoe's shape, its toe in the tongs' jaws, its heels away.
const FLURRY = 9 / 16;
const SHOW_SHOE = [5.4, -11.2] as const;
const SHOE: ReadonlyArray<readonly [number, number]> = Array.from({ length: 9 }, (_, i) => {
  const a = -Math.PI / 2 - 2.3 + (i / 8) * 4.6;
  return [Math.cos(a) * 0.72, 0.62 + Math.sin(a) * 0.78] as const;
});

const smithParts: NpcParts = {
  body(sk, p) {
    legs(sk, 3.3, 1.45, S_TROU, S_TROU_D, S_BOOT, 1.05);
    // a broad chest in a grey shirt
    sk.blob((q) => {
      q.moveTo(-2.4, -7.7);
      q.quadraticCurveTo(0.1, -8.5, 2.6, -7.7);
      q.quadraticCurveTo(2.9, -5.5, 2.45, -3.2);
      q.quadraticCurveTo(0.1, -2.7, -2.25, -3.2);
      q.quadraticCurveTo(-2.75, -5.5, -2.4, -7.7);
      q.closePath();
    }, S_SHIRT, { dark: S_SHIRT_D, d: 0.55 });
    // the leather apron, chest to knee, its strap round the neck
    sk.limb([-0.9, -6.8, -0.6, -8.2], 0.4, STRAP);
    sk.limb([1.7, -6.8, 1.4, -8.2], 0.4, STRAP);
    sk.blob((q) => {
      q.moveTo(-1.2, -7.0);
      q.lineTo(2.0, -7.0);
      q.quadraticCurveTo(2.2, -5.0, 2.75, -3.6);
      q.lineTo(2.6, -1.7);
      q.quadraticCurveTo(0.4, -1.35, -1.9, -1.7);
      q.lineTo(-2.05, -3.6);
      q.quadraticCurveTo(-1.4, -5.0, -1.2, -7.0);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.5 });
    // a pocket, its stitching, and a smudge of soot
    sk.blob((q) => q.roundRect(-0.1, -4.6, 1.6, 1.15, 0.25), APRON_D, { line: 0.5, sil: false });
    sk.draw((q) => {
      q.fillStyle = '#2a201844';
      q.beginPath();
      q.ellipse(1.6, -6.0, 0.55, 0.3, 0.3, 0, TAU);
      q.fill();
    });
    // sparks off the work during the show's flurry
    if (p.act === 'show' && p.u < FLURRY) {
      sk.draw((q, c) => {
        const [ax, ay] = toBody(p, ANVIL_DX, -ANVIL_DY);
        q.strokeStyle = HOTTER;
        q.lineCap = 'round';
        q.lineWidth = Math.max(0.18, 1 / c.px);
        q.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = -0.4 - i * 0.45 + p.u * 9;
          const r0 = 0.7 + ((i * 37 + Math.floor(p.u * 16) * 11) % 7) * 0.12;
          q.moveTo(ax + Math.cos(a) * r0, ay - Math.abs(Math.sin(a)) * r0);
          q.lineTo(ax + Math.cos(a) * (r0 + 0.6), ay - Math.abs(Math.sin(a)) * (r0 + 0.6));
        }
        q.stroke();
      });
    }
  },
  head(sk, p, back) {
    const cx = 0.15;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.3, 3.2), S_SKIN, { dark: S_SKIN_D, d: 0.45 });
    // short black hair on top, under the headband
    sk.blob((q) => {
      q.moveTo(cx - 3.25, cy - 0.2);
      q.quadraticCurveTo(cx - 3.3, cy - 3.5, cx + 0.2, cy - 3.6);
      q.quadraticCurveTo(cx + 3.3, cy - 3.5, cx + 3.3, cy - 1.0);
      q.lineTo(cx - 2.0, cy - 1.2);
      q.closePath();
    }, S_BEARD, { dark: S_BEARD_D, d: 0.3 });
    // the red headband, knotted at the back
    sk.limb([cx - 3.3, cy - 1.2, cx - 1.0, cy - 2.05, cx + 1.6, cy - 2.0, cx + 3.25, cy - 1.15], 0.75, C.cloth, { dark: shade(C.cloth, -0.25) });
    if (!back) {
      sk.limb([cx - 3.2, cy - 1.3, cx - 4.1, cy - 0.6], 0.42, C.cloth, { dark: shade(C.cloth, -0.25) });
      sk.limb([cx - 3.2, cy - 1.3, cx - 3.9, cy + 0.15], 0.42, shade(C.cloth, -0.15));
    }
    // the near ear
    sk.blob(ell(cx + (back ? 2.6 : -2.6), cy + 0.5, 0.6, 0.78), S_SKIN, { dark: S_SKIN_D, d: 0.2, line: 0.5 });
    // the beard: from ear to ear round the jaw, full under the chin
    sk.blob((q) => {
      q.moveTo(cx - 2.6, cy + 0.2);
      q.quadraticCurveTo(cx - 2.4, cy + 3.3, cx + 0.3, cy + 4.15);
      q.quadraticCurveTo(cx + 3.0, cy + 3.6, cx + 3.25, cy + 0.6);
      q.quadraticCurveTo(cx + 2.4, cy + 1.4, cx + 0.7, cy + 1.35);
      q.quadraticCurveTo(cx - 1.4, cy + 1.6, cx - 2.6, cy + 0.2);
      q.closePath();
    }, S_BEARD, { dark: S_BEARD_D, d: 0.35 });
    if (back) return;
    const ex = cx + 0.6;
    const ey = cy + 0.2;
    face(sk, { x: ex, y: ey, eyes: p.eyes, mouth: p.mouth, drop: 1.75 });
    // heavy brows
    sk.draw((q, c) => {
      q.lineCap = 'round';
      q.strokeStyle = S_BEARD;
      q.lineWidth = Math.max(0.5, 1.7 / c.px);
      q.beginPath();
      q.moveTo(ex - 1.95, ey - 0.95);
      q.lineTo(ex - 0.6, ey - 1.15);
      q.moveTo(ex + 0.55, ey - 1.1);
      q.lineTo(ex + 1.75, ey - 0.85);
      q.stroke();
    });
  },
  upper(sk, _p, k) {
    // bare, big arms out of the shirt's short sleeves
    sk.limb([0, 0, 0, S_BONES.upper], 1.45, k ? S_SKIN_D : S_SKIN, { dark: k ? null : S_SKIN_D });
    sk.limb([0, -0.1, 0, 0.5], 1.6, k ? S_SHIRT_D : S_SHIRT, { dark: k ? null : S_SHIRT_D, line: 0.5 });
  },
  fore(sk, p, k) {
    const f = S_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.3, k ? S_SKIN_D : S_SKIN, { dark: k ? null : S_SKIN_D });
    sk.limb([0, f - 0.85, 0, f - 0.35], 1.45, STRAP, { line: 0.5 });
    const tool = p.act === 'work' || p.act === 'show' || p.act === 'celebrate';
    if (k === 1 && tool) {
      // the hammer: an ash handle out of the fist, the iron head across it,
      // its face down at the blow and turned up as it is raised
      const { sh, el } = p.arms[1];
      const up = Math.max(0, Math.min(1, (sh - STRIKE.sh) / (RAISE.sh - STRIKE.sh)));
      const a = p.act === 'celebrate' ? sh + el + 0.35 : Math.PI / 2 + (RAISE.a - Math.PI / 2) * up;
      along(sk, S_BONES, p, 1, a, () => {
        sk.limb([0, -0.35, 0, 1.75], 0.36, C.plankLight, { dark: C.plank });
        sk.blob((q) => q.roundRect(-0.9, 1.35, 1.5, 0.8, 0.14), C.iron, { dark: shade(C.iron, -0.3), d: 0.2 });
        sk.blob((q) => q.roundRect(-0.95, 1.4, 0.3, 0.7, 0.08), '#8a8a94', { line: 0.4, sil: false });
      });
    }
    if (k === 0 && (p.act === 'work' || p.act === 'show')) {
      // the tongs, reaching from the fist to the work on the anvil (or up
      // for the show's horseshoe)
      const [hx, hy] = handAt(S_BONES, p, 0);
      const high = p.act === 'show' ? ease(p.u, FLURRY, FLURRY + 0.1) - ease(p.u, 0.9, 1) : 0;
      const [tx, ty] = toBody(p, ANVIL_DX - 0.9 + (SHOW_SHOE[0] - ANVIL_DX + 0.9) * high, -ANVIL_DY + (SHOW_SHOE[1] + ANVIL_DY) * high);
      const a = Math.atan2(tx - hx, ty - hy);
      const L = Math.min(4.6, Math.max(2.0, Math.hypot(tx - hx, ty - hy) - 0.5));
      along(sk, S_BONES, p, 0, a, () => {
        sk.limb([0.12, -0.2, 0.15, L - 0.15], 0.2, C.iron);
        sk.limb([-0.12, -0.2, -0.15, L - 0.15], 0.2, shade(C.iron, 0.15));
        if (p.act === 'show' && p.u >= FLURRY - 0.2) {
          // the horseshoe, glowing
          sk.limb(SHOE.flatMap(([x, y]) => [x, L + y]), 0.42, HOT, { dark: '#e86a1a' });
          if (high > 0.5) {
            sk.draw((q, c) => {
              q.strokeStyle = HOTTER;
              q.lineCap = 'round';
              q.lineWidth = Math.max(0.15, 0.9 / c.px);
              q.beginPath();
              for (const [x, y, r] of [[-1.5, L + 0.2, 0.4], [1.4, L - 0.3, 0.35], [0.1, L - 1.0, 0.3]] as const) {
                q.moveTo(x - r, y);
                q.lineTo(x + r, y);
                q.moveTo(x, y - r);
                q.lineTo(x, y + r);
              }
              q.stroke();
            });
          }
        } else {
          // the bar, white-hot at its end
          sk.limb([0, L - 0.3, 0, L + 1.0], 0.42, HOT, { dark: '#e86a1a' });
          sk.blob(circ(0, L + 0.85, 0.28), HOTTER, { line: 0, sil: false });
        }
      });
    }
    sk.blob(circ(0, f, 0.72), k ? S_SKIN_D : S_SKIN, { dark: S_SKIN_D, d: 0.2 });
  },
};

// The hammer arm at the blow (its head on the anvil) and raised (up by the
// face, the head turned back: `a`, the handle's angle).
const STRIKE = { sh: 0.66, el: 0.6 };
const RAISE = { sh: 1.65, el: 0.95, a: 3.4 };

// A blow of the hammer over `u` (0 to 1): raised, then down fast onto the
// anvil, a ring and a beat.
function blow(u: number): { sh: number; el: number; hit: number } {
  const k = ease(u, 0.0, 0.5) - ease(u, 0.58, 0.72);
  return { sh: STRIKE.sh + (RAISE.sh - STRIKE.sh) * k, el: STRIKE.el + (RAISE.el - STRIKE.el) * k, hit: bump(u, 0.66, 0.95) };
}

// Two blows, the tongs turning the bar between them.
const smithWork: NpcLoop = {
  secs: 1.5,
  frames: 12,
  pose(u) {
    const b = blow((u * 2) % 1);
    return {
      ...rest(),
      lean: 0.06 + 0.04 * b.hit,
      bob: -0.15 * b.hit,
      tilt: 0.12 + 0.06 * b.hit,
      arms: [{ sh: 1.45 + 0.08 * Math.sin(u * TAU), el: 0.5 }, { sh: b.sh, el: b.el }],
      eyes: b.hit > 0.6 ? 'shut' : 'open',
      mouth: b.hit > 0.6 ? 'closed' : 'smile',
    };
  },
};

// A horseshoe forged: a flurry of three quick blows, then the shoe lifted
// in the tongs, glowing, the smith beaming at it, and back to the anvil.
const smithShow: NpcLoop & { crowd: 'watch' } = {
  secs: 2.4,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const f = u < FLURRY ? blow(((u / FLURRY) * 3) % 1) : { ...STRIKE, hit: 0 };
    const high = ease(u, FLURRY, FLURRY + 0.1) - ease(u, 0.9, 1);
    return {
      ...rest(),
      lean: 0.08 * (1 - high) - 0.06 * high,
      bob: -0.15 * f.hit + 0.25 * bump(u, 0.62, 0.88),
      tilt: 0.12 * (1 - high) - 0.16 * high,
      arms: [{ sh: 1.45 + 0.5 * high, el: 0.5 - 0.4 * high }, { sh: f.sh * (1 - high) + 1.0 * high, el: f.el * (1 - high) + 1.35 * high }],
      eyes: high > 0.5 ? 'happy' : f.hit > 0.6 ? 'shut' : 'open',
      mouth: high > 0.5 ? 'open' : 'closed',
    };
  },
};

// The hammer thrust up high, twice, with a whoop.
const smithCelebrate: NpcLoop = {
  secs: 1.4,
  frames: 8,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const pump = Math.abs(Math.sin(u * TAU * 2));
    return { ...rest(), bob: 0.25 * pump * k, tilt: -0.12 * k, arms: [{ sh: 0.12 + 0.4 * k, el: 0.2 + 0.9 * k }, { sh: 0.12 + (2.5 + 0.2 * pump) * k, el: 0.2 }], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

const blacksmith: Npc = {
  name: 'blacksmith',
  station: 'run',
  // on the floor by the smithy's +u end, the anvil at arm's length
  place: { mode: 'standing', u: SMITH.u, v: SMITH.v },
  tall: 15,
  bones: S_BONES,
  parts: smithParts,
  work: smithWork,
  show: smithShow,
  celebrate: smithCelebrate,
};

// ── the camp cook ─────────────────────────────────────────────────────────
// A round, rosy camp cook on the log by the fire: auburn hair under a
// mustard kerchief, a blue checked shirt with its sleeves rolled, a white
// apron with a stain on it, a long wooden spoon in the pot. At work it
// stirs, then lifts the spoon for a taste and a happy hum.

const K_SKIN = '#f0c29c';
const K_SKIN_D = '#c8946e';
const K_HAIR = '#a8502a';
const K_HAIR_D = '#7e3a1e';
const KERCHIEF = '#e8b040';
const KERCHIEF_D = '#c08a24';
const K_SHIRT = C.clothBlue;
const K_SHIRT_D = '#2c4b6e';
const K_APRON = '#f2efe6';
const K_APRON_D = '#d0cbbd';
const K_TROU = '#6e5a44';
const K_TROU_D = '#544432';
const K_BOOT = '#4a3424';

// Seated: the seat line at y = -1, the frame lifted to sit on the log.
const K_BONES: Bones = { neck: [0.25, -5.75], shoulders: [[-1.75, -5.15], [1.9, -5.15]], upper: 1.6, fore: 1.55 };

// Where the pot is from the cook, in its own frame: on the screen, POT_DX
// ahead and POT_DY up (its rim).
const COOK = { u: LEFT_SEAT.u, v: FIRE.v - 1.2, z: LEFT_SEAT.z - 1 };
const POT_DX = (FIRE.u - FIRE.v) - (COOK.u - COOK.v);
const POT_DY = (COOK.u + COOK.v) / 2 - (FIRE.u + FIRE.v) / 2 + POT + 1.4 - COOK.z;

const cookParts: NpcParts = {
  body(sk) {
    // seated: thighs forward off the log, shins down, boots on the floor
    for (const [x, near] of [[0.9, false], [-0.5, true]] as const) {
      const c = near ? K_TROU : K_TROU_D;
      sk.limb([x - 0.6, -1.0, x + 1.3, -1.3, x + 1.55, 0.2], 1.35, c, { dark: near ? K_TROU_D : null });
      sk.blob((q) => q.roundRect(x + 0.95, -0.15, 1.75, 1.0, 0.45), K_BOOT, { dark: shade(K_BOOT, -0.25), d: 0.2 });
    }
    // a round body in the checked shirt
    sk.blob((q) => {
      q.moveTo(-2.0, -5.45);
      q.quadraticCurveTo(0.2, -6.15, 2.3, -5.45);
      q.quadraticCurveTo(3.2, -3.0, 2.4, -0.7);
      q.quadraticCurveTo(0.2, -0.2, -1.9, -0.7);
      q.quadraticCurveTo(-2.75, -3.0, -2.0, -5.45);
      q.closePath();
    }, K_SHIRT, { dark: K_SHIRT_D, d: 0.55 });
    sk.draw((q, c) => {
      if (c.px < 4) return;
      q.strokeStyle = '#ffffff55';
      q.lineWidth = Math.max(0.12, 0.6 / c.px);
      q.beginPath();
      for (const x of [-1.4, -0.4, 0.6, 1.6]) {
        q.moveTo(x, -5.7);
        q.lineTo(x + 0.1, -0.6);
      }
      for (const y of [-4.8, -3.8, -2.8, -1.8]) {
        q.moveTo(-2.3, y);
        q.lineTo(2.7, y);
      }
      q.stroke();
    });
    // the apron over the belly and lap, its bib and a stain
    sk.blob((q) => {
      q.moveTo(-0.9, -5.0);
      q.lineTo(1.8, -5.0);
      q.lineTo(2.0, -3.4);
      q.quadraticCurveTo(3.0, -2.6, 3.0, -0.9);
      q.lineTo(-1.0, -0.8);
      q.quadraticCurveTo(-1.4, -2.5, -0.9, -3.4);
      q.closePath();
    }, K_APRON, { dark: K_APRON_D, d: 0.45 });
    sk.draw((q) => {
      q.fillStyle = '#b07a4a66';
      q.beginPath();
      q.ellipse(1.6, -2.1, 0.45, 0.32, 0.4, 0, TAU);
      q.fill();
    });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.9;
    sk.blob(ell(cx, cy, 3.3, 3.15), K_SKIN, { dark: K_SKIN_D, d: 0.45 });
    // auburn hair at the nape and over the ears, under the kerchief
    sk.blob((q) => {
      q.moveTo(cx - 3.3, cy - 0.9);
      q.quadraticCurveTo(cx - 3.8, cy + 1.6, cx - 2.6, cy + 2.4);
      q.quadraticCurveTo(cx - 2.0, cy + 0.6, cx - 1.4, cy - 0.4);
      q.closePath();
    }, K_HAIR, { dark: K_HAIR_D, d: 0.25 });
    sk.blob((q) => {
      q.moveTo(cx + 2.4, cy - 1.1);
      q.quadraticCurveTo(cx + 3.6, cy - 0.4, cx + 3.2, cy + 0.9);
      q.quadraticCurveTo(cx + 2.7, cy + 0.1, cx + 2.4, cy - 1.1);
      q.closePath();
    }, K_HAIR, { dark: K_HAIR_D, d: 0.2 });
    // the kerchief over the top, knotted at the back, its tails out
    sk.blob((q) => {
      q.moveTo(cx - 3.45, cy - 0.6);
      q.quadraticCurveTo(cx - 3.3, cy - 3.75, cx + 0.2, cy - 3.8);
      q.quadraticCurveTo(cx + 3.4, cy - 3.6, cx + 3.45, cy - 0.9);
      q.quadraticCurveTo(cx + 0.2, cy - 2.0, cx - 3.45, cy - 0.6);
      q.closePath();
    }, KERCHIEF, { dark: KERCHIEF_D, d: 0.35 });
    sk.draw((q, c) => {
      if (c.px < 4) return;
      q.fillStyle = '#fff6d8aa';
      for (const [x, y] of [[-1.6, -2.6], [0.2, -3.1], [1.9, -2.5], [-0.6, -1.9], [1.0, -1.85]] as const) {
        q.beginPath();
        q.arc(cx + x, cy + y, 0.2, 0, TAU);
        q.fill();
      }
    });
    if (!back) {
      sk.blob((q) => {
        q.moveTo(cx - 3.2, cy - 1.0);
        q.lineTo(cx - 4.4, cy - 1.6);
        q.lineTo(cx - 4.2, cy - 0.5);
        q.closePath();
      }, KERCHIEF, { dark: KERCHIEF_D, d: 0.2, line: 0.5 });
    }
    sk.blob(ell(cx + (back ? 2.6 : -2.6), cy + 0.5, 0.6, 0.75), K_SKIN, { dark: K_SKIN_D, d: 0.2, line: 0.5 });
    if (back) return;
    const ex = cx + 0.6;
    const ey = cy + 0.55;
    // rosy cheeks
    sk.draw((q) => {
      q.fillStyle = '#ff8a7a66';
      for (const x of [ex - 1.75, ex + 1.8]) {
        q.beginPath();
        q.ellipse(x, ey + 1.0, 0.6, 0.38, 0, 0, TAU);
        q.fill();
      }
    });
    face(sk, { x: ex, y: ey, eyes: p.eyes, mouth: p.mouth });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, K_BONES.upper], 1.25, k ? K_SHIRT_D : K_SHIRT, { dark: k ? null : K_SHIRT_D });
  },
  fore(sk, p, k) {
    const f = K_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.05, k ? K_SKIN_D : K_SKIN, { dark: k ? null : K_SKIN_D });
    sk.limb([0, 0.0, 0, 0.4], 1.3, k ? K_SHIRT_D : K_SHIRT, { dark: k ? null : K_SHIRT_D, line: 0.5 });
    if (k === 1 && p.act === 'work') {
      // the long spoon: into the pot stirring, or up for a taste
      const [hx, hy] = handAt(K_BONES, p, 1);
      const [tx, ty] = toBody(p, POT_DX - 0.2, -POT_DY + 0.6);
      const taste = ease(p.u, 0.55, 0.7) - ease(p.u, 0.9, 1);
      const a = Math.atan2(tx - hx, ty - hy) * (1 - taste) + Math.PI * 0.82 * taste;
      along(sk, K_BONES, p, 1, a, () => {
        sk.limb([0, -0.4, 0, 2.6], 0.3, C.plankLight, { dark: C.plank });
        sk.blob(ell(0, 2.85, 0.42, 0.62), C.plankLight, { dark: C.plank, d: 0.15 });
        if (taste > 0.5) sk.blob(ell(0, 2.75, 0.3, 0.42), '#b0683a', { line: 0, sil: false });
      });
    }
    sk.blob(circ(0, f, 0.65), k ? K_SKIN_D : K_SKIN, { dark: K_SKIN_D, d: 0.2 });
  },
};

// Stirring the pot, round and round, then the spoon up for a taste, a
// blow on it, and a happy hum.
const cookWork: NpcLoop = {
  secs: 3.2,
  frames: 12,
  pose(u) {
    const taste = ease(u, 0.55, 0.7) - ease(u, 0.9, 1);
    const stir = 1 - taste;
    const a = (u / 0.55) * TAU;
    return {
      ...rest(),
      lean: (0.12 + 0.04 * Math.sin(a)) * stir - 0.04 * taste,
      tilt: 0.1 * stir - 0.05 * taste,
      arms: [{ sh: 0.55 * stir + 0.3 * taste, el: 1.4 * stir + 1.2 * taste }, { sh: (1.0 + 0.12 * Math.cos(a)) * stir + 1.75 * taste, el: (0.55 + 0.12 * Math.sin(a)) * stir + 1.45 * taste }],
      eyes: u > 0.72 && u < 0.92 ? 'happy' : 'open',
      mouth: u > 0.66 && u < 0.76 ? 'o' : u >= 0.76 && u < 0.92 ? 'smile' : 'closed',
    };
  },
};

// A tin mug of stew, enamel blue flecked white, steaming.
const stew: NpcServe = {
  name: 'stew',
  drink: true,
  draw(sk) {
    const M = '#4a7ab8';
    sk.limb([0.95, -1.0, 1.45, -0.8, 1.45, -0.1, 0.95, 0.1], 0.28, M);
    sk.blob((q) => q.roundRect(-0.95, -1.35, 1.9, 1.75, 0.25), M, { dark: shade(M, -0.25), d: 0.25 });
    sk.blob(ell(0, -1.35, 0.95, 0.28), '#8a5a32', { line: 0.5 });
    sk.draw((q, c) => {
      q.fillStyle = '#ffffffcc';
      for (const [x, y] of [[-0.5, -0.6], [0.3, -0.2], [-0.2, 0.15], [0.55, -0.85]] as const) {
        q.beginPath();
        q.arc(x, y, 0.1, 0, TAU);
        q.fill();
      }
      q.strokeStyle = '#ffffffaa';
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.14, 0.9 / c.px);
      q.beginPath();
      q.moveTo(-0.3, -1.7);
      q.quadraticCurveTo(-0.6, -2.1, -0.25, -2.45);
      q.moveTo(0.35, -1.75);
      q.quadraticCurveTo(0.05, -2.2, 0.4, -2.6);
      q.stroke();
    });
  },
};

const cook: Npc = {
  name: 'cook',
  station: 'idle',
  // on the left log, drawn up to the fire, facing it
  place: { mode: 'seated', u: COOK.u, v: COOK.v, z: COOK.z, look: 'along' },
  tall: 12.5,
  bones: K_BONES,
  parts: cookParts,
  work: cookWork,
  serve: stew,
};

export const NPCS: readonly Npc[] = [tailor, blacksmith, cook];
