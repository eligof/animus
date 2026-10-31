import { move, mul, turn } from '../../art/figure/paint.ts';
import { mix, shade } from '../../art/iso.ts';
import { bump, ease, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Swing } from '../types.ts';
import { C, withAlpha } from './kit.ts';
import { BENCH } from './stations.ts';

// The den's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and the den's ink: the sysadmin at the racks' pull-out
// console, the overclocker behind the test bench (the bench leaves room
// behind it: see BENCH in ./stations.ts) and the pizza courier waiting by
// the steel door.

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
// A stroke at least a pixel wide, in a part's units.
const thin = (w: number, px: number) => Math.max(w, 1 / px);

// ── the sysadmin ─────────────────────────────────────────────────────────
// A big greybeard at the pull-out console beside the racks, turned along
// them: bald on top with a little ponytail, round glasses catching the
// screens' green, a teal flannel shirt open over a grey tee, sleeves rolled,
// a lanyard with a badge, cargo trousers and boots. At work it types at the
// console, then holds a cable up to its glasses and squints at it.

const SYS = {
  skin: '#e2b48c',
  skinD: '#bd8d67',
  hair: '#a8a299',
  hairD: '#7f796f',
  shirt: C.teal,
  shirtD: '#22524f',
  check: '#173634',
  checkLit: '#62a493',
  tee: '#9aa39f',
  cargo: '#77704f',
  cargoD: '#5a543b',
  boots: '#3b332c',
};

const SYS_BONES: Bones = { neck: [0.15, -8.15], shoulders: [[-1.9, -7.55], [2.0, -7.55]], upper: 1.8, fore: 1.65 };

// The flannel shirt, round over the belly.
function sysShirt(q: Pen): void {
  q.moveTo(-2.2, -7.95);
  q.quadraticCurveTo(0.2, -8.6, 2.4, -7.9);
  q.quadraticCurveTo(3.45, -5.8, 2.7, -3.25);
  q.quadraticCurveTo(0.25, -2.7, -2.25, -3.2);
  q.quadraticCurveTo(-2.6, -5.6, -2.2, -7.95);
  q.closePath();
}

const sysParts: NpcParts = {
  body(sk, _p, back) {
    // cargo legs with a side pocket, boots; the far one first
    for (const [x, near] of [[1.0, false], [-0.9, true]] as const) {
      sk.limb([x, -3.6, x + 0.1, -0.95], 1.5, near ? SYS.cargo : SYS.cargoD, { dark: near ? SYS.cargoD : null });
      if (near) sk.blob((q) => q.roundRect(x - 0.72, -2.85, 0.75, 0.95, 0.15), SYS.cargoD, { line: 0.5, sil: false });
      sk.blob((q) => q.roundRect(x - 0.7, -1.1, 1.95, 1.1, 0.45), SYS.boots, { dark: shade(SYS.boots, -0.3), d: 0.2 });
    }
    sk.blob(sysShirt, SYS.shirt, { dark: SYS.shirtD, d: 0.5 });
    // the checks, clipped to the shirt
    sk.draw((q, c) => {
      q.save();
      q.beginPath();
      sysShirt(q);
      q.clip();
      q.lineCap = 'butt';
      q.beginPath();
      for (let x = -2.0; x < 3.6; x += 1.25) {
        q.moveTo(x, -9);
        q.lineTo(x + 0.25, -2.5);
      }
      for (let y = -7.3; y < -2.8; y += 1.25) {
        q.moveTo(-3, y);
        q.lineTo(3.6, y + 0.1);
      }
      q.lineWidth = thin(0.42, c.px);
      q.strokeStyle = SYS.check;
      q.stroke();
      q.beginPath();
      for (let x = -1.45; x < 3.6; x += 2.5) {
        q.moveTo(x, -9);
        q.lineTo(x + 0.25, -2.5);
      }
      q.lineWidth = thin(0.14, c.px);
      q.strokeStyle = SYS.checkLit;
      q.stroke();
      q.restore();
    });
    if (back) return;
    // the shirt open down the front over a grey tee
    sk.blob((q) => {
      q.moveTo(0.6, -8.25);
      q.lineTo(1.9, -8.05);
      q.quadraticCurveTo(2.0, -5.6, 1.75, -3.0);
      q.lineTo(1.05, -2.95);
      q.quadraticCurveTo(1.05, -5.8, 0.6, -8.25);
      q.closePath();
    }, SYS.tee, { dark: shade(SYS.tee, -0.15), d: 0.2 });
    // the lanyard round the neck and its badge
    sk.limb([-0.5, -8.2, 0.35, -6.2, 0.95, -5.3], 0.22, C.stripe, { line: 0.4 });
    sk.limb([2.0, -8.0, 1.5, -6.2, 1.25, -5.3], 0.22, C.stripe, { line: 0.4 });
    sk.blob((q) => q.roundRect(0.45, -5.45, 1.45, 1.75, 0.18), C.white, { line: 0.6 });
    sk.blob((q) => q.rect(0.6, -5.3, 1.15, 0.35), C.stripe, { line: 0, sil: false });
    sk.blob((q) => q.rect(0.75, -4.65, 0.55, 0.6), '#7f8a86', { line: 0, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the little ponytail at the back
    sk.limb([cx - 2.6, cy + 0.6, cx - 3.6, cy + 1.6, cx - 3.4, cy + 2.9], 0.85, SYS.hair, { dark: SYS.hairD });
    sk.blob(ell(cx, cy, 3.35, 3.2), SYS.skin, { dark: SYS.skinD, d: 0.45 });
    // the shine on the bald top
    sk.blob(ell(cx - 0.9, cy - 2.15, 1.0, 0.45), '#f6d7b8', { line: 0, sil: false });
    // the fringe of hair round the back, over the ear
    sk.blob((q) => {
      q.moveTo(cx - 1.7, cy - 0.9);
      q.quadraticCurveTo(cx - 3.0, cy - 1.3, cx - 3.45, cy + 0.3);
      q.quadraticCurveTo(cx - 3.4, cy + 1.9, cx - 2.3, cy + 2.6);
      q.quadraticCurveTo(cx - 2.6, cy + 1.2, cx - 2.0, cy + 0.4);
      q.quadraticCurveTo(cx - 1.6, cy - 0.3, cx - 1.7, cy - 0.9);
      q.closePath();
    }, SYS.hair, { dark: SYS.hairD, d: 0.3 });
    if (back) return;
    // the beard, from the ear round the jaw, big under the chin
    sk.blob((q) => {
      q.moveTo(cx - 0.75, cy + 0.9);
      q.quadraticCurveTo(cx - 1.0, cy + 4.6, cx + 1.5, cy + 5.0);
      q.quadraticCurveTo(cx + 3.7, cy + 4.6, cx + 3.55, cy + 1.6);
      q.quadraticCurveTo(cx + 2.5, cy + 2.3, cx + 1.25, cy + 1.75);
      q.quadraticCurveTo(cx + 0.1, cy + 1.6, cx - 0.75, cy + 0.9);
      q.closePath();
    }, SYS.hair, { dark: SYS.hairD, d: 0.35 });
    face(sk, { x: cx + 0.85, y: cy + 0.45, eyes: p.eyes, mouth: p.mouth, drop: 1.55 });
    // a moustache over the mouth
    sk.blob((q) => {
      q.moveTo(cx + 0.15, cy + 2.05);
      q.quadraticCurveTo(cx + 0.9, cy + 1.45, cx + 1.7, cy + 1.75);
      q.quadraticCurveTo(cx + 2.4, cy + 1.45, cx + 3.1, cy + 2.0);
      q.quadraticCurveTo(cx + 1.7, cy + 2.35, cx + 0.15, cy + 2.05);
      q.closePath();
    }, SYS.hairD, { line: 0.5, sil: false });
    // round glasses, the screens' green on the lenses
    sk.draw((q, c) => {
      const near: [number, number, number] = [cx - 0.3, cy + 0.45, 0.88];
      const far: [number, number, number] = [cx + 2.0, cy + 0.45, 0.8];
      q.beginPath();
      for (const [x, y, r] of [near, far]) {
        q.moveTo(x + r, y);
        q.arc(x, y, r, 0, TAU);
      }
      q.fillStyle = '#5dff8f2e';
      q.fill();
      q.beginPath();
      q.moveTo(near[0] - 0.55, near[1] - 0.4);
      q.lineTo(near[0] - 0.15, near[1] - 0.6);
      q.lineWidth = thin(0.16, c.px);
      q.strokeStyle = '#d8ffe2';
      q.stroke();
      q.beginPath();
      for (const [x, y, r] of [near, far]) {
        q.moveTo(x + r, y);
        q.arc(x, y, r, 0, TAU);
      }
      q.moveTo(near[0] + near[2], near[1] - 0.1);
      q.lineTo(far[0] - far[2], far[1] - 0.1);
      q.moveTo(near[0] - near[2], near[1] - 0.05);
      q.lineTo(cx - 1.75, cy + 0.2);
      q.lineWidth = thin(0.2, c.px);
      q.strokeStyle = c.ink;
      q.stroke();
    });
  },
  upper(sk, _p, k) {
    // flannel sleeves
    sk.limb([0, 0, 0, SYS_BONES.upper], 1.35, k ? SYS.shirtD : SYS.shirt, { dark: k ? null : SYS.shirtD });
  },
  fore(sk, p, k) {
    const f = SYS_BONES.fore;
    sk.limb([0, 0.1, 0, f - 0.3], 1.05, k ? SYS.skinD : SYS.skin, { dark: k ? null : SYS.skinD });
    // the rolled cuff at the elbow
    sk.blob((q) => q.roundRect(-0.7, -0.15, 1.4, 0.6, 0.25), k ? SYS.shirtD : SYS.shirt, { line: 0.5 });
    // the far hand holding a cable's plug up beside its glasses, upright
    // whatever the arm does, the cable hanging from its fist
    if (k === 1 && p.act === 'work' && sysCable(p.u) > 0.4) {
      sk.at(mul(move(0, f), turn(p.arms[1].sh + p.arms[1].el - p.lean)), () => {
        sk.limb([0.1, 0.2, 0.75, 1.3, 0.55, 2.4, 0.95, 3.3], 0.34, '#ffd23e', { line: 0.5 });
        sk.blob((q) => q.roundRect(-0.38, -1.45, 0.76, 1.05, 0.12), '#cfd6d3', { dark: '#9aa5a1', d: 0.15 });
        sk.blob((q) => q.rect(-0.2, -1.85, 0.4, 0.42), '#e8b04a', { line: 0.4 });
      });
    }
    sk.blob(circ(0, f, 0.66), k ? SYS.skinD : SYS.skin, { dark: SYS.skinD, d: 0.2 });
  },
};

// How far into holding up the cable it is, at u of its work: up over three
// frames, down over two.
const sysCable = (u: number) => ease(u, 0.42, 0.66) - ease(u, 0.83, 1);

// Typing at the console, a key tapped with each hand by turns; then the far
// hand comes up with a cable, its head tipped back to squint at it, and
// down again.
const sysWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const c = sysCable(u);
    const tap = Math.sin(u * TAU * 5) * (1 - c);
    return {
      ...rest(),
      lean: 0.07 - 0.04 * c,
      tilt: 0.1 - 0.16 * c,
      arms: [
        { sh: 0.42 + 0.06 * tap, el: 0.9 - 0.1 * tap },
        { sh: 0.62 - 0.06 * tap + 1.4 * c, el: 0.75 },
      ],
      eyes: u > 0.66 && u < 0.84 ? 'blink' : 'open',
      mouth: c > 0.5 ? 'closed' : 'smile',
    };
  },
};

const sysadmin: Npc = {
  name: 'sysadmin',
  station: 'search',
  // on the floor at the racks' near end, turned along them to the console
  place: { mode: 'standing', u: 0.2, v: 6.5, look: 'along' },
  tall: 15,
  bones: SYS_BONES,
  parts: sysParts,
  work: sysWork,
};

// ── the overclocker ──────────────────────────────────────────────────────
// Behind the test bench's far end, the rig before it at the near end:
// spiky platinum hair with neon green tips, amber goggles pushed up on its
// forehead, a violet tank top with a green trim, slim pale cryo gloves. At
// work it turns the fan controller's knob and watches the fans; its show is
// the stress test: goggles down, leaning in over the rig and cranking the
// knob as the rig's glow comes up on its face, sweating, a held breath,
// then goggles up and both fists up beside its head.

const OC = {
  skin: '#d39c70',
  skinD: '#ab7550',
  hair: '#ebe4d2',
  hairD: '#b5aa90',
  tips: C.green,
  top: '#6c4cc0',
  topD: '#4d3592',
  trim: C.green,
  glove: '#d9eef8',
  gloveD: '#9fc8de',
  cuff: '#7fd8f0',
  pants: '#3a4045',
  pantsD: '#2a2f33',
  lens: C.amber,
};

const OC_BONES: Bones = { neck: [0.1, -7.85], shoulders: [[-1.6, -7.3], [1.75, -7.3]], upper: 1.6, fore: 1.65 };

// The stress test (see ocShow), at u of the show: how far it leans in over
// the rig, its goggles down, the rig's glow on its face, the held breath,
// and the win.
const ocLean = (u: number) => ease(u, 0.06, 0.2) - ease(u, 0.38, 0.48);
const ocGoggles = (u: number) => u > 0.03 && u < 0.53;
const ocGlow = (u: number) => ease(u, 0.06, 0.38) - ease(u, 0.46, 0.53);
const ocHold = (u: number) => bump(u, 0.37, 0.57);
const ocWin = (u: number) => ease(u, 0.53, 0.63) - ease(u, 0.88, 0.99);

const ocParts: NpcParts = {
  body(sk, _p, back) {
    for (const [x, near] of [[0.95, false], [-0.8, true]] as const) {
      sk.limb([x, -3.5, x + 0.05, -0.85], 1.3, near ? OC.pants : OC.pantsD, { dark: near ? OC.pantsD : null });
      sk.blob((q) => q.roundRect(x - 0.6, -1.0, 1.65, 1.0, 0.45), '#e9ecea', { dark: shade('#e9ecea', -0.2), d: 0.2 });
      sk.blob((q) => q.rect(x - 0.45, -0.45, 1.4, 0.22), C.green, { line: 0, sil: false });
    }
    // a violet tank top over bare shoulders
    sk.blob((q) => {
      q.moveTo(-1.75, -7.9);
      q.quadraticCurveTo(0.1, -8.4, 2.0, -7.85);
      q.lineTo(2.3, -3.3);
      q.quadraticCurveTo(0.2, -2.8, -2.05, -3.3);
      q.closePath();
    }, OC.skin, { dark: OC.skinD, d: 0.4 });
    sk.blob((q) => {
      q.moveTo(-1.95, -7.5);
      q.quadraticCurveTo(-1.1, -7.6, -0.75, -8.15);
      q.quadraticCurveTo(0.35, -7.0, 1.25, -8.1);
      q.quadraticCurveTo(1.6, -7.5, 2.15, -7.45);
      q.lineTo(2.35, -3.3);
      q.quadraticCurveTo(0.2, -2.8, -2.1, -3.3);
      q.closePath();
    }, OC.top, { dark: OC.topD, d: 0.5 });
    if (back) return;
    // the green trim round its neck and a green bolt across the chest
    sk.draw((q, c) => {
      q.beginPath();
      q.moveTo(-0.75, -8.1);
      q.quadraticCurveTo(0.35, -7.0, 1.25, -8.05);
      q.lineWidth = thin(0.24, c.px);
      q.strokeStyle = OC.trim;
      q.stroke();
    });
    sk.blob((q) => {
      q.moveTo(0.9, -6.6);
      q.lineTo(-0.1, -5.1);
      q.lineTo(0.55, -5.1);
      q.lineTo(-0.2, -3.9);
      q.lineTo(1.35, -5.55);
      q.lineTo(0.7, -5.55);
      q.lineTo(1.5, -6.6);
      q.closePath();
    }, OC.trim, { line: 0.4, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    const show = p.act === 'show';
    const down = show && ocGoggles(p.u);
    // spiky platinum hair behind the head, its tips dyed
    const spikes: Array<[number, number]> = [[-3.6, 0.6], [-3.6, -1.8], [-2.4, -3.9], [-0.6, -4.9], [1.4, -4.8], [3.1, -3.7], [3.9, -1.7]];
    const hair = (q: Pen) => {
      q.moveTo(cx - 3.2, cy + 1.2);
      for (let i = 0; i < spikes.length; i++) {
        const [sx, sy] = spikes[i];
        const [nx, ny] = spikes[Math.min(spikes.length - 1, i + 1)];
        q.lineTo(cx + sx, cy + sy);
        q.lineTo(cx + (sx + nx) / 2 * 0.72, cy + (sy + ny) / 2 * 0.72);
      }
      q.lineTo(cx + 3.2, cy - 0.6);
      q.closePath();
    };
    sk.blob(hair, OC.hair, { dark: OC.hairD, d: 0.3 });
    sk.draw((q, c) => {
      q.beginPath();
      for (const [sx, sy] of spikes.slice(1, -1)) {
        q.moveTo(cx + sx, cy + sy);
        q.lineTo(cx + sx * 0.82 - 0.35, cy + sy * 0.82 + 0.1);
        q.lineTo(cx + sx * 0.82 + 0.35, cy + sy * 0.82 - 0.05);
        q.closePath();
      }
      q.fillStyle = OC.tips;
      q.fill();
      q.lineWidth = thin(0.12, c.px);
      q.strokeStyle = c.ink;
      q.stroke();
    });
    sk.blob(ell(cx, cy, 3.3, 3.15), OC.skin, { dark: OC.skinD, d: 0.45 });
    // a fringe over the brow
    sk.blob((q) => {
      q.moveTo(cx - 3.1, cy - 0.7);
      q.quadraticCurveTo(cx - 2.6, cy - 3.6, cx + 0.4, cy - 3.3);
      q.quadraticCurveTo(cx + 3.0, cy - 3.1, cx + 3.4, cy - 1.1);
      q.lineTo(cx + 2.3, cy - 1.7);
      q.lineTo(cx + 1.6, cy - 0.9);
      q.lineTo(cx + 0.7, cy - 1.8);
      q.lineTo(cx - 0.3, cy - 1.1);
      q.quadraticCurveTo(cx - 1.8, cy - 1.6, cx - 3.1, cy - 0.7);
      q.closePath();
    }, OC.hair, { dark: OC.hairD, d: 0.25 });
    // the goggles' strap round its head: up over the forehead, or down
    // round it at the eyes in the stress test
    const gy = down ? cy + 0.7 : cy - 2.4;
    sk.limb(down ? [cx - 3.3, cy + 0.4, cx - 1.4, cy + 0.65, cx + 0.2, gy] : [cx - 3.3, cy - 0.6, cx - 1.4, cy - 2.0, cx + 0.2, gy], 0.6, '#2a2f33', { line: 0.5 });
    if (back) return;
    face(sk, { x: cx + 0.85, y: cy + 0.75, eyes: p.eyes, mouth: p.mouth });
    // the rig's green glow coming up on its face as it leans in
    const glow = show ? ocGlow(p.u) : 0;
    if (glow > 0.05) {
      sk.draw((q) => {
        q.save();
        q.beginPath();
        q.ellipse(cx, cy, 3.3, 3.15, 0, 0, TAU);
        q.clip();
        q.beginPath();
        q.ellipse(cx + 2.9, cy + 2.2, 2.6, 2.4, 0, 0, TAU);
        q.fillStyle = withAlpha(C.green, 0.08 + 0.2 * glow);
        q.fill();
        q.restore();
      });
    }
    // the goggles: a rubber frame, two round lenses, a bridge; amber up on
    // its forehead, lit green from the rig when down over its eyes
    const lens = down ? mix(OC.lens, C.glyph, 0.35 + 0.65 * glow) : OC.lens;
    sk.limb([cx - 0.1, gy, cx + 2.6, gy], 1.85, '#3a4045', { line: 0.6 });
    for (const [x, r] of [[cx + 0.15, 0.78], [cx + 2.4, 0.68]] as const) {
      sk.blob(circ(x, gy, r), lens, { dark: shade(lens, -0.3), d: 0.22, line: 0.6 });
      sk.blob(ell(x - r * 0.3, gy - 0.25, r * 0.3, r * 0.18), down ? '#eaffef' : '#fff2c8', { line: 0, sil: false });
    }
    // a bead of sweat in the stress test
    if (show && p.u > 0.22 && p.u < 0.6) {
      sk.blob((q) => {
        const x = cx + 3.05;
        const y = cy - 1.2 + (p.u - 0.22) * 4;
        q.moveTo(x, y - 0.6);
        q.quadraticCurveTo(x + 0.45, y + 0.05, x, y + 0.35);
        q.quadraticCurveTo(x - 0.45, y + 0.05, x, y - 0.6);
        q.closePath();
      }, '#bfefff', { line: 0.6 });
    }
  },
  upper(sk, _p, k) {
    // bare arms
    sk.limb([0, 0, 0, OC_BONES.upper], 1.05, k ? OC.skinD : OC.skin, { dark: k ? null : OC.skinD });
  },
  fore(sk, p, k) {
    const f = OC_BONES.fore;
    sk.limb([0, 0, 0, f - 0.5], 0.95, k ? OC.skinD : OC.skin, { dark: k ? null : OC.skinD });
    // a slim cryo glove, pale, its cuff banded up the wrist
    sk.limb([0, f - 0.75, 0, f - 0.2], 1.0, k ? OC.gloveD : OC.glove, { dark: OC.gloveD });
    sk.blob((q) => q.rect(-0.5, f - 0.62, 1.0, 0.22), OC.cuff, { line: 0, sil: false });
    sk.blob(ell(0.05, f + 0.1, 0.62, 0.58), k ? OC.gloveD : OC.glove, { dark: OC.gloveD, d: 0.2 });
    sk.blob(ell(0.5, f - 0.15, 0.22, 0.32), k ? OC.gloveD : OC.glove, { line: 0.5, sil: false });
    // sparks off the knob as it cranks it at the peak
    if (k === 1 && p.act === 'show' && ocGlow(p.u) > 0.6 && ocLean(p.u) > 0.5) {
      sk.draw((q, c) => {
        q.beginPath();
        // (the forearm's -x is away from its head)
        for (const [x, y, r] of [[-1.2, f + 0.5, 0.5], [-1.5, f - 0.7, 0.35], [-0.5, f + 1.4, 0.3]] as const) {
          q.moveTo(x - r, y);
          q.lineTo(x + r, y);
          q.moveTo(x, y - r);
          q.lineTo(x, y + r);
        }
        q.lineWidth = thin(0.16, c.px);
        q.strokeStyle = '#ffe680';
        q.stroke();
      });
    }
  },
};

// The far glove on the fan controller's knob (high on the rig's far post,
// over the bench), the near one on the bench's edge.
const OC_KNOB = { sh: 1.3, el: 1.4 };
const HANG = rest().arms[0];
const OC_EDGE = { sh: 0.8, el: 0.85 };

// At the bench: turning the knob a notch up and back, eyes down on the fans
// and up at the controller's lights, a blink.
const ocWork: NpcLoop = {
  secs: 2,
  frames: 10,
  pose(u) {
    const turn = Math.sin(u * TAU);
    const look = Math.sin(u * TAU + 1);
    return {
      ...rest(),
      lean: 0.05,
      bob: -0.06 * Math.abs(turn),
      tilt: 0.06 + 0.07 * look,
      arms: [{ sh: OC_EDGE.sh + 0.03 * look, el: OC_EDGE.el }, { sh: OC_KNOB.sh + 0.07 * turn, el: OC_KNOB.el - 0.14 * turn }],
      eyes: u > 0.65 && u < 0.75 ? 'blink' : 'open',
      mouth: turn > 0.6 ? 'o' : 'closed',
    };
  },
};

// The stress test: goggles down, crouched in over the rig, the far glove
// cranking the knob as the rig's glow comes up on its face, a bead of
// sweat, sparks; a held breath, pulled back upright, fists clenched at its
// chest; then goggles up and both fists up and out beside its head,
// bouncing; back to the knob.
const ocShow: NpcLoop & { crowd: 'watch' } = {
  secs: 4.8,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const lean = ocLean(u);
    const hold = ocHold(u);
    const win = ocWin(u);
    const crank = lean * Math.sin(u * TAU * 4);
    const pump = win * (0.5 - 0.5 * Math.cos(u * TAU * 4));
    // at the rig (crouched in, the far glove kept on the knob), clenched,
    // then the fists up in a V: the near one swung up behind, the far one
    // up in front, beside its head
    const mixed = (a: Swing, b: Swing, k: number): Swing => ({ sh: a.sh + (b.sh - a.sh) * k, el: a.el + (b.el - a.el) * k });
    const rig: Swing[] = [
      { sh: OC_EDGE.sh + 0.12 * lean, el: OC_EDGE.el + 0.4 * lean },
      { sh: OC_KNOB.sh + 0.33 * lean - 0.04 * crank, el: OC_KNOB.el - 0.27 * lean + 0.1 * crank },
    ];
    const clench: Swing[] = [{ sh: 0.55, el: 1.55 }, { sh: 0.0, el: 2.6 }];
    const fists: Swing[] = [{ sh: -1.85 - 0.15 * pump, el: -0.95 - 0.1 * pump }, { sh: 1.75 + 0.12 * pump, el: 0.85 + 0.12 * pump }];
    // (clenched from the held breath until the fists go up; the near arm
    // swings by its side between the bench and its fist, never out over
    // the bench's end)
    const tense = ease(u, 0.37, 0.45) - ease(u, 0.66, 0.8);
    const base = (k: 0 | 1) => mixed(rig[k], clench[k], tense);
    const near = win < 0.5 ? mixed(base(0), HANG, win * 2) : mixed(HANG, fists[0], win * 2 - 1);
    const arms: [Swing, Swing] = [near, mixed(base(1), fists[1], win)];
    return {
      ...rest(),
      lean: 0.05 - 0.08 * hold - 0.08 * win,
      bob: 0.55 * pump - 0.55 * lean + 0.15 * hold,
      tilt: 0.06 + 0.08 * lean - 0.12 * hold - 0.14 * win,
      arms,
      eyes: win > 0.4 ? 'happy' : 'open',
      mouth: win > 0.4 ? 'open' : hold > 0.3 ? 'closed' : lean > 0.5 ? 'o' : 'closed',
    };
  },
};

const overclocker: Npc = {
  name: 'overclocker',
  station: 'run',
  // behind the middle of the bench's far end, the rig at its elbow toward
  // the front: the bench's back edge runs past it on both sides on screen
  // and its top hides its legs (cut 5.5 over its feet)
  place: { mode: 'behind', u: 6.6, v: 1.3, top: BENCH.z, edge: BENCH.back },
  tall: 15.5,
  bones: OC_BONES,
  parts: ocParts,
  work: ocWork,
  show: ocShow,
};

// ── the courier ──────────────────────────────────────────────────────────
// Waiting by the steel door with the order: big curly hair, a red jacket
// with a reflective band, a yellow delivery cube on its back, a stack of
// pizza boxes under its arm. At work it checks its phone and taps its
// foot. It hands over a slice.

const CR = {
  skin: '#6b4430',
  skinD: '#50311f',
  hair: '#2a1e18',
  hairD: '#1a120e',
  jacket: '#c0392f',
  jacketD: '#922a22',
  band: '#dfe6e2',
  bag: '#e0a83e',
  bagD: '#b07e26',
  strap: '#2a2f33',
  jeans: '#2b3348',
  jeansD: '#1f2536',
  kicks: '#e9ecea',
};

const CR_BONES: Bones = { neck: [0.15, -7.8], shoulders: [[-1.6, -7.3], [1.75, -7.3]], upper: 1.65, fore: 1.6 };

// How far the near foot is lifted, tapping, at u of its work.
const crTap = (u: number) => bump(u, 0.1, 0.22) + bump(u, 0.3, 0.42) + bump(u, 0.6, 0.72);

const crParts: NpcParts = {
  body(sk, p, back) {
    // the delivery cube on its back, a reflective band round it
    sk.blob((q) => q.roundRect(-4.6, -11.0, 3.6, 6.6, 0.5), CR.bag, { dark: CR.bagD, d: 0.5 });
    sk.blob((q) => q.roundRect(-4.6, -11.0, 3.6, 0.9, 0.4), shade(CR.bag, 0.12), { line: 0.6, sil: false });
    sk.blob((q) => q.rect(-4.55, -7.6, 3.5, 0.5), CR.band, { line: 0.5, sil: false });
    // legs in dark jeans, white sneakers; the near foot taps at work
    const lift = p.act === 'work' ? crTap(p.u) : 0;
    for (const [x, near] of [[0.95, false], [-0.8, true]] as const) {
      sk.limb([x, -3.5, x + 0.05, -0.85], 1.3, near ? CR.jeans : CR.jeansD, { dark: near ? CR.jeansD : null });
      const a = near ? -0.35 * lift : 0;
      sk.at([Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), x - 0.55, -0.1], () => {
        sk.blob((q) => q.roundRect(0, -0.9, 1.7, 1.0, 0.45), CR.kicks, { dark: shade(CR.kicks, -0.2), d: 0.2 });
        sk.blob((q) => q.rect(0.1, -0.35, 1.5, 0.22), C.red, { line: 0, sil: false });
      });
    }
    // the jacket
    sk.blob((q) => {
      q.moveTo(-2.0, -7.85);
      q.quadraticCurveTo(0.1, -8.4, 2.15, -7.8);
      q.lineTo(2.45, -3.1);
      q.quadraticCurveTo(0.2, -2.6, -2.2, -3.1);
      q.closePath();
    }, CR.jacket, { dark: CR.jacketD, d: 0.5 });
    if (!back) {
      // its zip and the reflective band across the chest
      sk.draw((q, c) => {
        q.beginPath();
        q.moveTo(1.2, -7.9);
        q.lineTo(1.4, -3.0);
        q.lineWidth = thin(0.12, c.px);
        q.strokeStyle = c.ink;
        q.stroke();
      });
      sk.blob((q) => {
        q.moveTo(-2.1, -5.6);
        q.lineTo(2.35, -5.75);
        q.lineTo(2.37, -5.15);
        q.lineTo(-2.12, -5.0);
        q.closePath();
      }, CR.band, { line: 0.5, sil: false });
      // the bag's strap over the shoulder
      sk.limb([-1.2, -8.0, -0.6, -6.2, -0.5, -3.6], 0.5, CR.strap, { line: 0.5 });
    }
    // the stack of pizza boxes at its near hip, under its arm
    for (let i = 0; i < 3; i++) {
      const y = -4.1 - i * 0.62;
      sk.blob((q) => {
        q.moveTo(-3.7, y);
        q.lineTo(0.9, y + 0.25);
        q.lineTo(0.9, y - 0.35);
        q.lineTo(-3.7, y - 0.6);
        q.closePath();
      }, C.cardboard, { dark: C.cardboardDark, d: 0.15 });
    }
    sk.blob((q) => {
      q.moveTo(-3.7, -5.94);
      q.lineTo(0.9, -5.69);
      q.lineTo(2.1, -6.5);
      q.lineTo(-2.4, -6.75);
      q.closePath();
    }, shade(C.cardboard, 0.1), { line: 0.6 });
    // a little red sticker on the top box
    sk.blob(ell(-0.6, -6.22, 0.42, 0.2), C.red, { line: 0.4, sil: false });
  },
  head(sk, p, back) {
    const cx = 0.15;
    const cy = -2.95;
    // big curly hair: a cloud of curls behind and over the head
    const curls: Array<[number, number, number]> = [
      [-3.0, 0.9, 1.2], [-3.3, -0.9, 1.3], [-2.6, -2.6, 1.35], [-1.0, -3.45, 1.35], [0.9, -3.5, 1.3], [2.6, -3.0, 1.25], [3.4, -1.5, 1.05],
    ];
    sk.blob((q) => {
      for (const [x, y, r] of curls) {
        q.moveTo(cx + x + r, cy + y);
        q.arc(cx + x, cy + y, r, 0, TAU);
      }
      q.moveTo(cx + 2.8, cy - 0.5);
      q.ellipse(cx - 0.1, cy - 1.0, 2.9, 2.6, 0, 0, TAU);
    }, CR.hair, { dark: CR.hairD, d: 0.35 });
    sk.blob(ell(cx, cy + 0.15, 3.2, 3.05), CR.skin, { dark: CR.skinD, d: 0.45 });
    // the curls coming down over its brow
    sk.blob((q) => {
      q.moveTo(cx - 3.15, cy - 0.1);
      q.quadraticCurveTo(cx - 2.6, cy - 3.3, cx + 0.5, cy - 3.0);
      q.quadraticCurveTo(cx + 3.0, cy - 2.7, cx + 3.25, cy - 0.7);
      q.quadraticCurveTo(cx + 2.7, cy - 1.15, cx + 2.2, cy - 0.9);
      q.quadraticCurveTo(cx + 1.6, cy - 1.6, cx + 0.9, cy - 1.15);
      q.quadraticCurveTo(cx + 0.1, cy - 1.8, cx - 0.6, cy - 1.15);
      q.quadraticCurveTo(cx - 1.6, cy - 1.5, cx - 3.15, cy - 0.1);
      q.closePath();
    }, CR.hair, { dark: CR.hairD, d: 0.25 });
    if (back) return;
    face(sk, { x: cx + 0.85, y: cy + 0.85, eyes: p.eyes, mouth: p.mouth });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, CR_BONES.upper], 1.25, k ? CR.jacketD : CR.jacket, { dark: k ? null : CR.jacketD });
    sk.blob((q) => q.rect(-0.62, 0.75, 1.24, 0.4), CR.band, { line: 0.4, sil: false });
  },
  fore(sk, p, k) {
    const f = CR_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 1.1, k ? CR.jacketD : CR.jacket, { dark: k ? null : CR.jacketD });
    // the phone in the far hand, its screen lit
    if (k === 1 && p.act === 'work') {
      // held upright whatever the arm does, tipped back toward its face
      sk.at(mul(move(0, f), turn(p.arms[1].sh + p.arms[1].el - p.lean - 0.25)), () => {
        sk.blob((q) => q.roundRect(-0.6, -2.15, 1.2, 2.0, 0.25), '#2a2f33', { line: 0.6 });
        sk.blob((q) => q.roundRect(-0.42, -1.97, 0.84, 1.62, 0.12), '#7fe8ff', { line: 0, sil: false });
        sk.draw((q, c) => {
          q.beginPath();
          const off = (p.u * 4) % 1;
          for (let i = 0; i < 3; i++) {
            const y = -1.75 + ((i * 0.5 + off * 0.5) % 1.4);
            q.moveTo(-0.28, y);
            q.lineTo(0.22 - (i % 2) * 0.15, y);
          }
          q.lineWidth = thin(0.13, c.px);
          q.strokeStyle = '#1f6a8a';
          q.stroke();
        });
      });
    }
    sk.blob(circ(0, f, 0.62), k ? CR.skinD : CR.skin, { dark: CR.skinD, d: 0.2 });
  },
};

// Waiting at the door: its phone up in the far hand, head tipped to it, a
// thumb scrolling; the near foot tapping three times; then a look up at the
// door and back to the phone.
const crWork: NpcLoop = {
  secs: 2.4,
  frames: 12,
  pose(u) {
    const look = bump(u, 0.74, 1.0);
    return {
      ...rest(),
      bob: 0.06 * crTap(u),
      tilt: 0.14 - 0.24 * look,
      arms: [{ sh: 0.3, el: 1.05 }, { sh: 0.66 - 0.1 * look, el: 1.75 - 0.35 * look }],
      eyes: look > 0.6 ? 'open' : u > 0.46 && u < 0.56 ? 'blink' : 'open',
      mouth: look > 0.5 ? 'smile' : 'closed',
    };
  },
};

// A slice of pepperoni, hot, a string of cheese off its tip.
const slice: NpcServe = {
  name: 'slice',
  drink: false,
  draw(sk) {
    sk.blob((q) => {
      q.moveTo(-1.3, -1.1);
      q.quadraticCurveTo(0.1, -1.6, 1.4, -1.0);
      q.lineTo(0.1, 1.6);
      q.closePath();
    }, C.pizza, { dark: shade(C.pizza, -0.2), d: 0.2 });
    sk.limb([-1.35, -1.15, 0.1, -1.65, 1.45, -1.05], 0.5, C.crust, { dark: shade(C.crust, -0.2) });
    for (const [x, y] of [[-0.4, -0.6], [0.55, -0.45], [0.1, 0.45]] as const) sk.blob(circ(x, y, 0.3), C.pepperoni, { line: 0.5 });
    sk.limb([0.1, 1.55, 0.25, 2.3], 0.12, '#ffe8a0', { line: 0 });
  },
};

const courier: Npc = {
  name: 'courier',
  station: 'entrance',
  // on the floor past the door's frame, in front of the empty boxes
  place: { mode: 'standing', u: 14, v: 5.5 },
  tall: 15.5,
  bones: CR_BONES,
  parts: crParts,
  work: crWork,
  serve: slice,
};

export const NPCS: readonly Npc[] = [sysadmin, overclocker, courier];
