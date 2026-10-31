import { shade } from '../../art/iso.ts';
import { bump, ease, env, rest, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import type { Sketch } from '../../art/figure/paint.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Puppet } from '../types.ts';
import { C } from './kit.ts';
import { FRONT_DESK, ISLAND, RACK } from './stations.ts';

// The Startup's locals (see Npc in ../types.ts), on the shared puppet, in
// the figures' style and the office's warm-brown ink: the IT admin by the
// server rack with a laptop on its arm, the receptionist at the front desk
// by the glass door on a headset, and the office manager in the aisle of
// the kitchen island, at the espresso machine, who brings out the Friday
// cake. None wears an agent's cap or hoodie.

const ell = (cx: number, cy: number, rx: number, ry: number) => (p: Pen) => p.ellipse(cx, cy, rx, ry, 0, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// Draws `fn` in a frame at the hand of arm k (the fore part's frame) turned
// so that its +y runs at angle `a` in the body's frame (0 straight down, +
// toward where the local faces): at 0 the frame is level with the body.
function along(sk: Sketch, b: Bones, p: Puppet, k: 0 | 1, a: number, fn: () => void): void {
  const r = a - (p.arms[k].sh + p.arms[k].el);
  sk.at([Math.cos(-r), Math.sin(-r), -Math.sin(-r), Math.cos(-r), 0, b.fore], fn);
}

// Legs in trousers and shoes, the far one first: hips at y = -top.
function legs(sk: Sketch, top: number, w: number, cloth: string, clothD: string, shoe: string, sole = shoe): void {
  for (const [x, near] of [[0.95, false], [-0.85, true]] as const) {
    sk.limb([x, -top, x + 0.1, -0.8], w, near ? cloth : clothD, { dark: near ? clothD : null });
    sk.blob((q) => q.roundRect(x - 0.55, -1.05, 1.6, 1.05, 0.45), shoe, { dark: shade(shoe, -0.2), d: 0.2 });
    if (sole !== shoe) sk.blob((q) => q.roundRect(x - 0.55, -0.32, 1.6, 0.32, 0.15), sole, { line: 0.5, sil: false });
  }
}

// Stripes of colour across a part, clipped to a shape (a plaid, a Breton
// top): rows every `gap` from y0 to y1 in `color`, `w` thick.
function stripes(sk: Sketch, shape: (p: Pen) => void, y0: number, y1: number, gap: number, w: number, color: string, cols = false): void {
  sk.draw((q, c) => {
    if (c.px < 3) return;
    q.save();
    q.beginPath();
    shape(q);
    q.clip();
    q.fillStyle = color;
    for (let y = y0; y < y1; y += gap) q.fillRect(-4, y, 9, w);
    if (cols) for (let x = -3.6; x < 4; x += gap) q.fillRect(x, y0, w, y1 - y0);
    q.restore();
  });
}

// ── the IT admin ──────────────────────────────────────────────────────────
// By the server rack, a laptop open on its forearm: messy dark hair, thick
// black glasses, a short beard, an open red plaid shirt over a grey tee
// with a little power ring on it, a teal lanyard and keycard, olive
// trousers. At work it types, looks up and plugs a cable into the rack,
// and types again; it cheers a finish with a thumbs-up.

const A_SKIN = '#d9a77c';
const A_SKIN_D = '#b07e58';
const A_HAIR = '#3a2a24';
const A_HAIR_D = '#241a16';
const PLAID = '#c8463a';
const PLAID_D = '#9a3028';
const TEE = '#4a4d55';
const TEE_D = '#363840';
const A_TROU = '#6b6a4a';
const A_TROU_D = '#535238';
const LAPTOP = '#b9bec7';
const LAPTOP_D = '#8c929c';

const A_BONES: Bones = { neck: [0.15, -7.9], shoulders: [[-1.7, -7.35], [1.85, -7.35]], upper: 1.7, fore: 1.6 };

const torsoA = (q: Pen) => {
  q.moveTo(-2.0, -7.7);
  q.quadraticCurveTo(0.1, -8.25, 2.2, -7.7);
  q.lineTo(2.4, -3.3);
  q.quadraticCurveTo(0.15, -2.8, -2.1, -3.3);
  q.closePath();
};

// Whether the admin has its laptop open on its arm (else it is tucked
// under its arm, shut).
const laptopOut = (p: Puppet) => p.act === 'work' || p.act === 'celebrate';

const adminParts: NpcParts = {
  body(sk, p) {
    legs(sk, 3.5, 1.25, A_TROU, A_TROU_D, '#ece8e0', '#3a3a3a');
    // the grey tee, then the open plaid shirt over it, either side
    sk.blob(torsoA, TEE, { dark: TEE_D, d: 0.5 });
    sk.draw((q, c) => {
      q.strokeStyle = C.chart;
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.3, 1.1 / c.px);
      q.beginPath();
      q.arc(0.5, -5.4, 0.7, -Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6 + TAU);
      q.moveTo(0.5, -6.35);
      q.lineTo(0.5, -5.45);
      q.stroke();
    });
    for (const side of [-1, 1] as const) {
      const shirt = (q: Pen) => {
        if (side < 0) {
          q.moveTo(-2.0, -7.7);
          q.quadraticCurveTo(-1.0, -8.1, -0.45, -7.95);
          q.lineTo(-0.35, -3.0);
          q.quadraticCurveTo(-1.3, -2.95, -2.2, -3.25);
          q.closePath();
        } else {
          q.moveTo(1.45, -7.95);
          q.quadraticCurveTo(1.9, -7.9, 2.2, -7.7);
          q.lineTo(2.45, -3.25);
          q.quadraticCurveTo(1.9, -2.95, 1.35, -3.0);
          q.closePath();
        }
      };
      sk.blob(shirt, PLAID, { dark: PLAID_D, d: 0.4 });
      stripes(sk, shirt, -8.2, -2.8, 1.0, 0.22, '#3a2a3a66', true);
    }
    // the lanyard and its keycard
    sk.limb([-0.4, -7.8, 0.2, -5.4, 0.9, -7.85], 0.2, C.chart, { line: 0.4 });
    sk.blob((q) => q.roundRect(-0.15, -5.55, 0.8, 1.05, 0.15), C.white, { line: 0.5 });
    // the laptop shut, tucked under its arm when it is not working
    if (!laptopOut(p)) sk.blob((q) => q.roundRect(-2.75, -6.3, 0.7, 2.5, 0.2), LAPTOP, { dark: LAPTOP_D, d: 0.2 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    sk.blob(ell(cx, cy, 3.35, 3.2), A_SKIN, { dark: A_SKIN_D, d: 0.45 });
    // messy hair: a mop over the top, tufts sticking up
    sk.blob((q) => {
      q.moveTo(cx - 3.4, cy + 0.4);
      q.quadraticCurveTo(cx - 3.9, cy - 3.0, cx - 1.6, cy - 3.6);
      q.lineTo(cx - 1.2, cy - 4.4);
      q.lineTo(cx - 0.3, cy - 3.8);
      q.lineTo(cx + 0.6, cy - 4.5);
      q.lineTo(cx + 1.3, cy - 3.75);
      q.quadraticCurveTo(cx + 3.6, cy - 3.4, cx + 3.55, cy - 1.0);
      q.quadraticCurveTo(cx + 2.4, cy - 2.2, cx + 0.6, cy - 1.9);
      q.quadraticCurveTo(cx - 1.4, cy - 1.8, cx - 2.2, cy - 0.6);
      q.quadraticCurveTo(cx - 2.6, cy + 0.2, cx - 3.4, cy + 0.4);
      q.closePath();
    }, A_HAIR, { dark: A_HAIR_D, d: 0.3 });
    sk.blob(ell(cx + (back ? 2.6 : -2.6), cy + 0.55, 0.6, 0.78), A_SKIN, { dark: A_SKIN_D, d: 0.2, line: 0.5 });
    if (back) return;
    const ex = cx + 0.6;
    const ey = cy + 0.4;
    // a short beard round the jaw
    sk.blob((q) => {
      q.moveTo(cx - 2.45, cy + 0.9);
      q.quadraticCurveTo(cx - 2.0, cy + 3.2, cx + 0.5, cy + 3.35);
      q.quadraticCurveTo(cx + 2.9, cy + 3.0, cx + 3.15, cy + 1.0);
      q.quadraticCurveTo(cx + 2.3, cy + 2.1, cx + 0.6, cy + 2.15);
      q.quadraticCurveTo(cx - 1.3, cy + 2.1, cx - 2.45, cy + 0.9);
      q.closePath();
    }, A_HAIR, { dark: A_HAIR_D, d: 0.2, line: 0.5 });
    face(sk, { x: ex, y: ey, eyes: p.eyes, mouth: p.mouth, drop: 1.45 });
    // thick black glasses, a glint of the screen in them while it works
    sk.draw((q, c) => {
      q.strokeStyle = '#1e1a1a';
      q.lineWidth = Math.max(0.3, 1.5 / c.px);
      q.lineJoin = 'round';
      q.beginPath();
      q.roundRect(ex - 2.05, ey - 0.75, 1.75, 1.45, 0.4);
      q.roundRect(ex + 0.35, ey - 0.7, 1.6, 1.4, 0.4);
      q.moveTo(ex - 0.3, ey - 0.25);
      q.lineTo(ex + 0.35, ey - 0.25);
      q.moveTo(ex - 2.05, ey - 0.3);
      q.lineTo(cx - 2.5, ey - 0.5);
      q.stroke();
      if (laptopOut(p) && p.act === 'work' && p.u < 0.5) {
        q.fillStyle = '#7fd4ff55';
        q.fillRect(ex - 1.9, ey - 0.6, 1.45, 0.5);
        q.fillRect(ex + 0.5, ey - 0.55, 1.3, 0.5);
      }
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, A_BONES.upper], 1.2, k ? PLAID_D : PLAID, { dark: k ? null : PLAID_D });
  },
  fore(sk, p, k) {
    const f = A_BONES.fore;
    // the plaid sleeve rolled to the elbow, a bare forearm
    sk.limb([0, 0, 0, f - 0.3], 0.95, k ? A_SKIN_D : A_SKIN, { dark: k ? null : A_SKIN_D });
    sk.limb([0, 0, 0, 0.45], 1.25, k ? PLAID_D : PLAID, { dark: k ? null : PLAID_D, line: 0.5 });
    if (k === 0 && laptopOut(p)) {
      // the laptop open on the forearm, held level: its base on the arm,
      // its lid up from the hinge at the front, the screen's light on the
      // lid's inside edge
      along(sk, A_BONES, p, 0, 0, () => {
        sk.blob((q) => q.roundRect(-0.9, -0.62, 4.1, 0.45, 0.14), LAPTOP, { dark: LAPTOP_D, d: 0.15 });
        sk.blob((q) => {
          q.moveTo(2.85, -0.45);
          q.lineTo(3.25, -0.5);
          q.lineTo(2.55, -3.2);
          q.lineTo(2.15, -3.1);
          q.closePath();
        }, LAPTOP_D, { dark: shade(LAPTOP_D, -0.15), d: 0.1 });
        sk.limb([2.75, -0.7, 2.13, -3.0], 0.16, C.screenGlow, { line: 0, sil: false });
        sk.draw((q, c) => {
          if (c.px < 4) return;
          q.strokeStyle = '#6f757e';
          q.lineWidth = Math.max(0.08, 0.6 / c.px);
          q.beginPath();
          q.moveTo(-0.5, -0.66);
          q.lineTo(2.4, -0.66);
          q.stroke();
        });
      });
    }
    if (k === 1 && p.act === 'work' && p.u >= 0.5 && p.u < 0.85) {
      // the patch cable it plugs into the rack
      sk.limb([0.1, f, 0.9, f + 0.5, 1.2, f - 0.3], 0.22, C.chartWarm, { line: 0.5 });
      sk.blob((q) => q.roundRect(-0.3, f - 0.75, 0.6, 0.55, 0.1), '#2c2e33', { line: 0.5 });
    }
    if (k === 1 && p.act === 'celebrate') {
      // a thumbs-up
      sk.blob(circ(0, f, 0.62), A_SKIN, { dark: A_SKIN_D, d: 0.2 });
      sk.limb([0.05, f - 0.2, 0.15, f - 1.05], 0.42, A_SKIN, { dark: A_SKIN_D });
      return;
    }
    sk.blob(circ(0, f, 0.6), k ? A_SKIN_D : A_SKIN, { dark: A_SKIN_D, d: 0.2 });
  },
};

// The laptop arm: the forearm out before the belly.
const HOLD = { sh: 0.35, el: 0.87 };

// Typing on the laptop, a look up at the rack, a cable plugged into a
// server, a nod, and typing again.
const adminWork: NpcLoop = {
  secs: 3.2,
  frames: 12,
  pose(u) {
    // (the reach out and back each over two frames)
    const reach = ease(u, 0.42, 0.62) - ease(u, 0.78, 0.98);
    const tap = Math.sin(u * TAU * 3) * (1 - reach);
    return {
      ...rest(),
      tilt: 0.14 * (1 - reach) - 0.12 * reach,
      lean: -0.03 * reach,
      arms: [HOLD, { sh: 0.34 + 0.9 * reach, el: 1.33 - 0.12 * tap - 0.55 * reach }],
      eyes: u > 0.82 && u < 0.92 ? 'happy' : 'open',
      mouth: reach > 0.5 ? 'o' : 'closed',
    };
  },
};

// A thumbs-up and a grin, the laptop still on its arm.
const adminCelebrate: NpcLoop = {
  secs: 1.4,
  frames: 8,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    return { ...rest(), bob: 0.15 * bump(u, 0.3, 0.7), tilt: -0.08 * k, arms: [{ sh: 0.12 + (HOLD.sh - 0.12) * k, el: 0.2 + (HOLD.el - 0.2) * k }, { sh: 0.12 + 1.3 * k, el: 0.2 + 1.25 * k }], eyes: k > 0.5 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
  },
};

// A fresh print off the 3D printer: a little teal tugboat.
const figurine: NpcServe = {
  name: 'figurine',
  drink: false,
  draw(sk) {
    const T = C.noteTeal;
    const TD = shade(T, -0.25);
    sk.blob((q) => {
      q.moveTo(-1.2, -0.9);
      q.lineTo(1.35, -0.9);
      q.quadraticCurveTo(1.2, 0.0, 0.7, 0.1);
      q.lineTo(-0.9, 0.1);
      q.quadraticCurveTo(-1.25, -0.3, -1.2, -0.9);
      q.closePath();
    }, T, { dark: TD, d: 0.2 });
    sk.blob((q) => q.roundRect(-0.7, -1.75, 1.1, 0.9, 0.15), T, { dark: TD, d: 0.15 });
    sk.blob((q) => q.roundRect(-0.45, -2.35, 0.4, 0.65, 0.1), T, { dark: TD, d: 0.1 });
    sk.draw((q, c) => {
      q.strokeStyle = TD;
      q.lineWidth = Math.max(0.08, 0.6 / c.px);
      q.beginPath();
      for (const y of [-0.6, -0.3]) {
        q.moveTo(-1.1, y);
        q.lineTo(1.2, y);
      }
      q.stroke();
      q.fillStyle = '#2a3a3a';
      q.beginPath();
      q.arc(0.05, -1.3, 0.2, 0, TAU);
      q.fill();
    });
  },
};

const itAdmin: Npc = {
  name: 'itAdmin',
  station: 'run',
  // on the floor by the open side of the rack, its door within reach
  place: { mode: 'standing', u: 12.5, v: RACK.v1 },
  tall: 15,
  bones: A_BONES,
  parts: adminParts,
  work: adminWork,
  celebrate: adminCelebrate,
  serve: figurine,
};

// ── the receptionist ─────────────────────────────────────────────────────
// Behind the front desk past the door's latch side (clear of its opening
// and its swing), the first face anyone sees: a big
// round puff of hair, a slim headset with its mic at the mouth, gold hoops,
// a sunflower cardigan over a white top, a teal pendant. At work it types,
// then takes a call, a hand to the headset, talking, and types again.

const R_SKIN = '#a8673f';
const R_SKIN_D = '#7e4a2c';
const R_HAIR = '#3b2720';
const R_HAIR_D = '#25170f';
const CARDI = '#ffc857';
const CARDI_D = '#d9a23a';
const R_TOP = '#f6f3ee';
const R_TOP_D = '#d8d3ca';
const GOLD = '#e8b84a';
const SET = '#2a2c30';

const R_BONES: Bones = { neck: [0.1, -7.85], shoulders: [[-1.6, -7.3], [1.7, -7.3]], upper: 1.65, fore: 1.6 };

const receptionistParts: NpcParts = {
  body(sk) {
    legs(sk, 3.4, 1.15, '#3a3f5a', '#2c3046', '#c9714b');
    // the white top, the open cardigan over it, a teal pendant
    sk.blob((q) => {
      q.moveTo(-1.9, -7.6);
      q.quadraticCurveTo(0.1, -8.1, 2.0, -7.6);
      q.lineTo(2.2, -3.3);
      q.quadraticCurveTo(0.1, -2.85, -2.0, -3.3);
      q.closePath();
    }, R_TOP, { dark: R_TOP_D, d: 0.5 });
    for (const side of [-1, 1] as const) {
      sk.blob((q) => {
        if (side < 0) {
          q.moveTo(-1.9, -7.6);
          q.quadraticCurveTo(-1.0, -8.0, -0.3, -7.85);
          q.quadraticCurveTo(-0.15, -5.4, -0.05, -2.95);
          q.quadraticCurveTo(-1.2, -2.9, -2.15, -3.2);
          q.closePath();
        } else {
          q.moveTo(1.25, -7.85);
          q.quadraticCurveTo(1.75, -7.85, 2.0, -7.6);
          q.lineTo(2.25, -3.2);
          q.quadraticCurveTo(1.6, -2.9, 1.05, -2.95);
          q.quadraticCurveTo(1.15, -5.4, 1.25, -7.85);
          q.closePath();
        }
      }, CARDI, { dark: CARDI_D, d: 0.45 });
    }
    sk.draw((q, c) => {
      q.fillStyle = shade(CARDI, -0.3);
      for (const y of [-6.2, -5.0, -3.8]) {
        q.beginPath();
        q.arc(-0.2, y, Math.max(0.12, 0.6 / c.px), 0, TAU);
        q.fill();
      }
      q.strokeStyle = GOLD;
      q.lineWidth = Math.max(0.1, 0.6 / c.px);
      q.beginPath();
      q.moveTo(-0.1, -7.85);
      q.quadraticCurveTo(0.5, -6.7, 1.1, -7.85);
      q.stroke();
    });
    sk.blob(ell(0.5, -6.55, 0.32, 0.4), C.chart, { line: 0.5 });
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -3.0;
    // the puff of hair behind and round the head, its edge in curls
    sk.blob((q) => {
      const n = 13;
      for (let i = 0; i <= n; i++) {
        const a = Math.PI * 0.82 - (i / n) * Math.PI * 1.64 - Math.PI / 2;
        const r = 4.0 + (i & 1 ? 0.0 : 0.3);
        const x = cx - 0.2 + Math.cos(a) * r * 1.02;
        const y = cy - 0.9 + Math.sin(a) * r * 0.9;
        if (i === 0) q.moveTo(x, y);
        else q.quadraticCurveTo(cx - 0.2 + Math.cos(a + 0.12) * (r + 0.45), cy - 0.9 + Math.sin(a + 0.12) * (r + 0.4) * 0.95, x, y);
      }
      q.lineTo(cx + 2.4, cy + 0.6);
      q.lineTo(cx - 2.4, cy + 0.9);
      q.closePath();
    }, R_HAIR, { dark: R_HAIR_D, d: 0.5 });
    sk.draw((q, c) => {
      if (c.px < 4) return;
      q.strokeStyle = '#4e362c';
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.12, 0.7 / c.px);
      q.beginPath();
      for (const [x, y] of [[-3.4, -2.6], [-2.6, -4.4], [-0.8, -5.2], [1.2, -5.0], [2.8, -3.9], [-3.9, -0.6]] as const) {
        q.moveTo(cx + x - 0.3, cy + y + 0.2);
        q.quadraticCurveTo(cx + x, cy + y - 0.25, cx + x + 0.3, cy + y + 0.15);
      }
      q.stroke();
    });
    sk.blob(ell(cx, cy, 3.3, 3.15), R_SKIN, { dark: R_SKIN_D, d: 0.45 });
    // the hairline over the brow
    sk.blob((q) => {
      q.moveTo(cx - 3.2, cy + 0.2);
      q.quadraticCurveTo(cx - 3.2, cy - 3.2, cx + 0.2, cy - 3.3);
      q.quadraticCurveTo(cx + 3.3, cy - 3.2, cx + 3.3, cy - 0.4);
      q.quadraticCurveTo(cx + 2.0, cy - 1.9, cx + 0.3, cy - 1.75);
      q.quadraticCurveTo(cx - 1.6, cy - 1.6, cx - 2.3, cy - 0.3);
      q.closePath();
    }, R_HAIR, { dark: R_HAIR_D, d: 0.3 });
    const ear = back ? 2.65 : -2.65;
    sk.blob(ell(cx + ear, cy + 0.6, 0.6, 0.78), R_SKIN, { dark: R_SKIN_D, d: 0.2, line: 0.5 });
    // a gold hoop under the near ear
    sk.draw((q, c) => {
      q.strokeStyle = GOLD;
      q.lineWidth = Math.max(0.16, 0.9 / c.px);
      q.beginPath();
      q.arc(cx + ear - 0.05, cy + 1.75, 0.45, 0, TAU);
      q.stroke();
    });
    // the headset: a band over the hair, the cup on the near ear, its mic
    // boom round to the mouth
    sk.limb([cx + ear, cy + 0.3, cx - 2.9, cy - 3.2, cx - 0.2, cy - 5.3, cx + 2.5, cy - 4.3, cx + 3.1, cy - 2.4], 0.3, SET);
    sk.blob(ell(cx + ear, cy + 0.6, 0.62, 0.8), SET, { dark: shade(SET, -0.3), d: 0.15 });
    if (back) return;
    sk.limb([cx - 2.5, cy + 1.2, cx - 1.2, cy + 2.55, cx + 0.2, cy + 2.4], 0.16, SET, { line: 0.5 });
    sk.blob(ell(cx + 0.25, cy + 2.4, 0.28, 0.22), SET, { line: 0.5 });
    face(sk, { x: cx + 0.65, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth });
    // lashes on the outer corners
    sk.draw((q, c) => {
      if (p.eyes !== 'open') return;
      q.strokeStyle = c.ink;
      q.lineCap = 'round';
      q.lineWidth = Math.max(0.12, 0.8 / c.px);
      q.beginPath();
      q.moveTo(cx + 0.65 - 1.55, cy + 0.0);
      q.lineTo(cx + 0.65 - 1.9, cy - 0.3);
      q.moveTo(cx + 0.65 + 1.55, cy + 0.05);
      q.lineTo(cx + 0.65 + 1.85, cy - 0.25);
      q.stroke();
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, R_BONES.upper], 1.2, k ? CARDI_D : CARDI, { dark: k ? null : CARDI_D });
  },
  fore(sk, _p, k) {
    const f = R_BONES.fore;
    sk.limb([0, 0, 0, f - 0.35], 1.15, k ? CARDI_D : CARDI, { dark: k ? null : CARDI_D });
    sk.limb([0, f - 0.55, 0, f - 0.3], 0.9, k ? R_SKIN_D : R_SKIN);
    sk.blob(circ(0, f, 0.58), k ? R_SKIN_D : R_SKIN, { dark: R_SKIN_D, d: 0.2 });
  },
};

// Typing at the desk (the hands kept over its back edge, where its top
// cuts the picture), then a call on the headset: the near hand up to the
// ear cup by her side, its elbow out (never across her face), the far one
// turning a word over, the mouth going, a nod; and back to typing.
const TALK: ReadonlyArray<Puppet['mouth']> = ['open', 'smile', 'o', 'open', 'closed', 'smile'];
const receptionistWork: NpcLoop = {
  secs: 3.6,
  frames: 12,
  pose(u) {
    // (the hand up to the headset over three frames, down over two)
    const call = ease(u, 0.34, 0.6) - ease(u, 0.82, 1);
    const tap = Math.sin(u * TAU * 3) * (1 - call);
    const i = Math.floor(u * 12);
    return {
      ...rest(),
      tilt: 0.1 * (1 - call) + 0.08 * call * Math.sin(u * TAU * 3),
      lean: 0.05 * (1 - call),
      arms: [{ sh: 0.95 + 0.08 * tap - 3.55 * call, el: 0.75 - 0.08 * tap - 1.35 * call - 1.2 * Math.sin(Math.PI * call) }, { sh: 0.2 + 0.06 * tap + 1.3 * call, el: 2.4 - 0.1 * tap - 1.5 * call + 0.25 * call * Math.sin(u * TAU * 3) }],
      eyes: call > 0.5 && i % 4 === 2 ? 'happy' : 'open',
      mouth: call > 0.5 ? TALK[i % TALK.length] : 'smile',
    };
  },
};

// A visitor badge on a teal lanyard: a white card, a photo square and
// lines for a name (no letters).
const badge: NpcServe = {
  name: 'badge',
  drink: false,
  draw(sk) {
    sk.limb([-0.45, -0.75, -0.2, -2.3, 0.2, -2.3, 0.45, -0.75], 0.18, C.chart, { line: 0.4 });
    sk.blob((q) => q.roundRect(-0.85, -0.85, 1.7, 2.1, 0.22), C.white, { dark: '#d8d6d0', d: 0.12 });
    sk.blob((q) => q.roundRect(-0.85, -0.85, 1.7, 0.45, 0.2), C.chart, { line: 0.4, sil: false });
    sk.blob((q) => q.roundRect(-0.55, -0.2, 0.7, 0.75, 0.1), C.noteLilac, { line: 0.4, sil: false });
    sk.draw((q, c) => {
      q.strokeStyle = '#8a8a90';
      q.lineWidth = Math.max(0.1, 0.7 / c.px);
      q.beginPath();
      q.moveTo(0.3, 0.0);
      q.lineTo(0.65, 0.0);
      q.moveTo(0.3, 0.35);
      q.lineTo(0.6, 0.35);
      q.moveTo(-0.55, 0.85);
      q.lineTo(0.6, 0.85);
      q.stroke();
    });
  },
};

const receptionist: Npc = {
  name: 'receptionist',
  station: 'entrance',
  // close behind the front desk, whose back edge runs past her on both
  // sides on screen; its top hides her legs (cut 5.05 over her feet)
  place: { mode: 'behind', u: FRONT_DESK.at, v: FRONT_DESK.stand, top: FRONT_DESK.z, edge: FRONT_DESK.v0 },
  tall: 16,
  bones: R_BONES,
  parts: receptionistParts,
  work: receptionistWork,
  serve: badge,
};

// ── the office manager ───────────────────────────────────────────────────
// The heart of the office, in the kitchen island's aisle: an auburn top
// knot in a coral band, freckles, a teal apron over a navy-and-white
// striped top. At work it pulls a shot at the espresso machine and wipes
// the counter down. Its show is Friday cake: a party hat on, a cake with
// three lit candles held out and swayed to a song, lifted high with a
// cheer, confetti falling.

const M_SKIN = '#f2c4a2';
const M_SKIN_D = '#cc9a78';
const M_HAIR = '#b0532e';
const M_HAIR_D = '#843a1e';
const BAND = '#ff6b6b';
const NAVY = '#2e3f6e';
const APRON_T = C.chart;
const APRON_T_D = '#2fa69e';

const M_BONES: Bones = { neck: [0.1, -7.8], shoulders: [[-1.6, -7.25], [1.75, -7.25]], upper: 1.65, fore: 1.6 };

const torsoM = (q: Pen) => {
  q.moveTo(-1.95, -7.6);
  q.quadraticCurveTo(0.1, -8.1, 2.1, -7.6);
  q.lineTo(2.3, -3.3);
  q.quadraticCurveTo(0.15, -2.85, -2.05, -3.3);
  q.closePath();
};

// The Friday cake, level on the palm of the far hand (the frame's origin
// at the hand): a plate, two layers of sponge and cream, pink icing
// dripping, sprinkles, three candles with flames that flicker with `u`.
function cake(sk: Sketch, u: number): void {
  sk.blob((q) => q.roundRect(-2.1, -0.85, 4.2, 0.4, 0.18), C.white, { dark: '#d8d4cc', d: 0.1 });
  sk.blob((q) => q.roundRect(-1.7, -3.05, 3.4, 2.25, 0.35), '#f3d9a8', { dark: '#d9b47c', d: 0.25 });
  sk.blob((q) => q.roundRect(-1.7, -2.05, 3.4, 0.34, 0.12), C.notePink, { line: 0.4, sil: false });
  sk.blob((q) => {
    q.moveTo(-1.75, -3.15);
    q.quadraticCurveTo(0, -3.45, 1.75, -3.15);
    q.lineTo(1.75, -2.55);
    for (const [x, d] of [[1.3, 0.45], [0.7, 0.2], [0.1, 0.55], [-0.5, 0.25], [-1.1, 0.5]] as const) {
      q.quadraticCurveTo(x + 0.2, -2.55 + d, x, -2.55 + d * 0.5);
      q.quadraticCurveTo(x - 0.15, -2.6, x - 0.3, -2.6);
    }
    q.lineTo(-1.75, -2.6);
    q.closePath();
  }, '#ff9ebb', { dark: '#ef7aa0', d: 0.12 });
  sk.draw((q, c) => {
    if (c.px < 3) return;
    for (const [x, y, col] of [[-1.3, -3.05, C.noteYellow], [-0.7, -3.15, C.noteTeal], [-0.05, -3.2, C.noteLilac], [0.6, -3.15, C.noteYellow], [1.2, -3.05, C.noteTeal]] as const) {
      q.fillStyle = col;
      q.fillRect(x, y, 0.28, 0.12);
    }
  });
  const flick = [0, 0.15, -0.1, 0.1, -0.15, 0.05];
  for (const [i, x] of [-0.9, 0, 0.9].entries()) {
    sk.blob((q) => q.roundRect(x - 0.15, -4.05, 0.3, 0.95, 0.08), [C.noteTeal, C.noteYellow, C.noteLilac][i], { line: 0.45 });
    const w = flick[(Math.floor(u * 16) + i * 2) % flick.length];
    sk.blob((q) => {
      q.moveTo(x, -4.15);
      q.quadraticCurveTo(x + 0.35, -4.4, x + w, -4.95);
      q.quadraticCurveTo(x - 0.35, -4.4, x, -4.15);
      q.closePath();
    }, '#ffd27a', { line: 0.45 });
    sk.blob(ell(x, -4.37, 0.1, 0.16), '#fff6d8', { line: 0, sil: false });
  }
}

// How far the show has the cake out (0 before and after, 1 held).
const cakeOut = (p: Puppet) => (p.act === 'show' ? 1 : 0);

const managerParts: NpcParts = {
  body(sk, p) {
    legs(sk, 3.4, 1.2, '#4a3f5a', '#383046', '#f2efe6', '#c9714b');
    // the striped top, the teal apron over it, a pocket, its strap
    sk.blob(torsoM, '#f6f3ee', { dark: '#d8d3ca', d: 0.5 });
    stripes(sk, torsoM, -7.7, -3.0, 0.75, 0.3, NAVY);
    sk.blob((q) => {
      q.moveTo(-1.0, -6.9);
      q.lineTo(1.8, -6.9);
      q.lineTo(1.95, -5.1);
      q.quadraticCurveTo(2.6, -3.6, 2.5, -1.9);
      q.quadraticCurveTo(0.3, -1.6, -1.85, -1.9);
      q.quadraticCurveTo(-1.95, -3.6, -1.25, -5.1);
      q.closePath();
    }, APRON_T, { dark: APRON_T_D, d: 0.45 });
    sk.limb([-0.9, -6.85, -0.35, -7.9], 0.28, APRON_T_D);
    sk.limb([1.7, -6.85, 1.2, -7.9], 0.28, APRON_T_D);
    sk.blob((q) => q.roundRect(0.1, -4.4, 1.5, 1.0, 0.25), APRON_T_D, { line: 0.45, sil: false });
    // confetti falling round it while the cake is out
    if (cakeOut(p)) {
      sk.draw((q, c) => {
        if (c.px < 3) return;
        const cols = [C.chartHot, C.chartWarm, C.chart, C.noteLilac, C.notePink];
        for (let i = 0; i < 9; i++) {
          const x = -6.5 + ((i * 37) % 13) * 1.0 + Math.sin(p.u * TAU * 2 + i) * 0.4;
          const y = -19 + (((i * 0.23 + p.u) % 1) * 15);
          q.save();
          q.translate(x, y);
          q.rotate(i + p.u * TAU * 2);
          q.fillStyle = cols[i % cols.length];
          q.fillRect(-0.25, -0.12, 0.5, 0.24);
          q.restore();
        }
      });
    }
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.95;
    // the top knot behind the head
    sk.blob(ell(cx - 0.6, cy - 3.6, 1.5, 1.2), M_HAIR, { dark: M_HAIR_D, d: 0.3 });
    sk.blob(ell(cx, cy, 3.3, 3.15), M_SKIN, { dark: M_SKIN_D, d: 0.45 });
    // the hair swept up, the coral band round it
    sk.blob((q) => {
      q.moveTo(cx - 3.35, cy + 0.6);
      q.quadraticCurveTo(cx - 3.6, cy - 3.2, cx + 0.2, cy - 3.4);
      q.quadraticCurveTo(cx + 3.3, cy - 3.3, cx + 3.35, cy - 0.6);
      q.quadraticCurveTo(cx + 2.4, cy - 2.1, cx + 0.6, cy - 2.0);
      q.quadraticCurveTo(cx - 1.4, cy - 1.8, cx - 2.3, cy - 0.5);
      q.quadraticCurveTo(cx - 2.7, cy + 0.3, cx - 3.35, cy + 0.6);
      q.closePath();
    }, M_HAIR, { dark: M_HAIR_D, d: 0.3 });
    sk.limb([cx - 3.1, cy - 1.5, cx - 1.6, cy - 2.9, cx + 0.6, cy - 3.35, cx + 2.4, cy - 2.75], 0.5, BAND, { dark: shade(BAND, -0.2) });
    if (p.act === 'show') {
      // the party hat, tipped, striped, a pompom on its point
      sk.blob((q) => {
        q.moveTo(cx - 1.6, cy - 3.1);
        q.lineTo(cx + 1.9, cy - 3.35);
        q.lineTo(cx + 0.9, cy - 7.0);
        q.closePath();
      }, C.chartWarm, { dark: shade(C.chartWarm, -0.2), d: 0.25 });
      sk.draw((q) => {
        q.save();
        q.beginPath();
        q.moveTo(cx - 1.6, cy - 3.1);
        q.lineTo(cx + 1.9, cy - 3.35);
        q.lineTo(cx + 0.9, cy - 7.0);
        q.closePath();
        q.clip();
        q.strokeStyle = C.chartHot;
        q.lineWidth = 0.45;
        q.beginPath();
        for (const t of [0.3, 0.6]) {
          q.moveTo(cx - 1.6 + 2.5 * t - 1, cy - 3.1 - 3.9 * t - 0.4);
          q.lineTo(cx + 1.9 - 1.0 * t + 1, cy - 3.35 - 3.65 * t + 0.5);
        }
        q.stroke();
        q.restore();
      });
      sk.blob(circ(cx + 0.9, cy - 7.1, 0.5), C.chart, { line: 0.5 });
    }
    sk.blob(ell(cx + (back ? 2.6 : -2.6), cy + 0.55, 0.6, 0.78), M_SKIN, { dark: M_SKIN_D, d: 0.2, line: 0.5 });
    if (back) return;
    const ex = cx + 0.6;
    const ey = cy + 0.55;
    sk.draw((q, c) => {
      q.fillStyle = '#ff8a7a55';
      for (const x of [ex - 1.75, ex + 1.8]) {
        q.beginPath();
        q.ellipse(x, ey + 1.0, 0.6, 0.36, 0, 0, TAU);
        q.fill();
      }
      if (c.px < 4) return;
      q.fillStyle = '#b06a4a99';
      for (const [x, y] of [[-1.9, 0.75], [-1.5, 0.95], [-1.75, 1.2], [1.6, 0.8], [2.0, 1.0], [1.75, 1.25]] as const) {
        q.beginPath();
        q.arc(ex + x, ey + y, 0.09, 0, TAU);
        q.fill();
      }
    });
    face(sk, { x: ex, y: ey, eyes: p.eyes, mouth: p.mouth });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, M_BONES.upper], 1.15, k ? '#d8d3ca' : '#f6f3ee', { dark: k ? null : '#d8d3ca' });
    sk.limb([-0.5, 0.55, 0.5, 0.55], 0.22, NAVY, { line: 0 });
    sk.limb([-0.5, 1.15, 0.5, 1.15], 0.22, NAVY, { line: 0 });
  },
  fore(sk, p, k) {
    const f = M_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 0.95, k ? M_SKIN_D : M_SKIN, { dark: k ? null : M_SKIN_D });
    sk.limb([0, 0, 0, 0.42], 1.2, k ? '#d8d3ca' : '#f6f3ee', { dark: k ? null : '#d8d3ca', line: 0.5 });
    if (k === 1 && p.act === 'work' && p.u >= 0.5) {
      // the cloth it wipes the counter down with
      sk.blob((q) => {
        q.moveTo(-0.7, f - 0.2);
        q.quadraticCurveTo(0.1, f - 0.6, 0.8, f - 0.1);
        q.quadraticCurveTo(0.9, f + 0.6, 0.2, f + 0.75);
        q.quadraticCurveTo(-0.6, f + 0.7, -0.7, f - 0.2);
        q.closePath();
      }, C.noteTeal, { dark: shade(C.noteTeal, -0.2), d: 0.15 });
    }
    sk.blob(circ(0, f, 0.58), k ? M_SKIN_D : M_SKIN, { dark: M_SKIN_D, d: 0.2 });
    if (k === 1 && cakeOut(p)) along(sk, M_BONES, p, 1, 0, () => cake(sk, p.u));
  },
};

// At the machine: the far hand locks the portafilter in with a twist and
// presses for the shot, a look at it; then wiping the counter down with a
// cloth, round and round.
const managerWork: NpcLoop = {
  secs: 3.2,
  frames: 12,
  pose(u) {
    const shot = 1 - ease(u, 0.42, 0.55) + ease(u, 0.92, 1);
    const twist = Math.sin(u * TAU * 2) * bump(u, 0.0, 0.4);
    const round = ((u - 0.5) / 0.42) * TAU;
    const wipe = 1 - shot;
    return {
      ...rest(),
      lean: 0.06 * shot + 0.08 * wipe,
      tilt: 0.12,
      arms: [{ sh: 0.45, el: 0.85 }, { sh: (0.62 + 0.08 * twist) * shot + (0.8 + 0.12 * Math.cos(round)) * wipe, el: (0.3 - 0.1 * twist) * shot + (0.55 + 0.15 * Math.sin(round)) * wipe }],
      eyes: u > 0.36 && u < 0.46 ? 'happy' : 'open',
      mouth: u > 0.6 && u < 0.85 ? 'smile' : 'closed',
    };
  },
};

// Friday cake: the cake held out on the far hand, swayed to a song, the
// near hand keeping time before its chest; then the cake lifted with a hop
// and a cheer, the near hand sweeping out to show it off, and back to the
// song.
const SING: ReadonlyArray<Puppet['mouth']> = ['open', 'o', 'open', 'smile'];
const managerShow: NpcLoop & { crowd: 'watch' } = {
  secs: 3.2,
  frames: 16,
  crowd: 'watch',
  pose(u) {
    const tada = ease(u, 0.58, 0.68) - ease(u, 0.88, 0.98);
    const song = 1 - tada;
    const sway = Math.sin((u / 0.6) * TAU * 2) * song;
    const beat = Math.sin(u * TAU * 4);
    return {
      ...rest(),
      lean: 0.05 * sway - 0.04 * tada,
      bob: 0.12 * Math.abs(sway) + 0.45 * bump(u, 0.62, 0.86),
      tilt: 0.1 * sway - 0.1 * tada,
      arms: [{ sh: (1.1 + 0.18 * beat) * song + 0.75 * tada, el: (0.7 + 0.35 * beat) * song + 0.05 * tada }, { sh: 1.5 + 0.06 * sway + 0.4 * tada, el: 0.12 + 0.1 * tada }],
      eyes: tada > 0.4 || Math.abs(sway) > 0.6 ? 'happy' : 'open',
      mouth: tada > 0.4 ? 'open' : SING[Math.floor(u * 16) % SING.length],
    };
  },
};

// A latte on a saucer, a heart in its foam.
const latte: NpcServe = {
  name: 'latte',
  drink: true,
  draw(sk) {
    sk.blob(ell(0, 0.05, 1.25, 0.32), C.white, { dark: '#d8d4cc', d: 0.1 });
    sk.limb([0.8, -1.05, 1.25, -0.85, 1.25, -0.45, 0.8, -0.3], 0.24, C.chartWarm);
    sk.blob((q) => {
      q.moveTo(-0.9, -1.25);
      q.lineTo(0.9, -1.25);
      q.quadraticCurveTo(0.85, -0.05, 0, -0.05);
      q.quadraticCurveTo(-0.85, -0.05, -0.9, -1.25);
      q.closePath();
    }, C.chartWarm, { dark: shade(C.chartWarm, -0.2), d: 0.2 });
    sk.blob(ell(0, -1.25, 0.9, 0.3), '#c99a6a', { line: 0.5 });
    sk.draw((q) => {
      q.fillStyle = '#fbf3e4';
      q.beginPath();
      q.moveTo(0, -1.08);
      q.bezierCurveTo(-0.45, -1.25, -0.25, -1.48, 0, -1.33);
      q.bezierCurveTo(0.25, -1.48, 0.45, -1.25, 0, -1.08);
      q.fill();
    });
  },
};

const officeManager: Npc = {
  name: 'officeManager',
  station: 'idle',
  // in the aisle behind the front counter, turned to the espresso machine
  place: { mode: 'behind', u: ISLAND.at, v: ISLAND.stand, top: ISLAND.z, edge: ISLAND.edge, look: 'along' },
  tall: 15.5,
  bones: M_BONES,
  parts: managerParts,
  work: managerWork,
  show: managerShow,
  serve: latte,
};

export const NPCS: readonly Npc[] = [itAdmin, receptionist, officeManager];
