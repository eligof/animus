import { apply, mul, move, turn, type Sketch } from '../../art/figure/paint.ts';
import { shade } from '../../art/iso.ts';
import { bump, ease, env, HANG, own, rest, swing, TAU } from '../../art/npc/acts.ts';
import { face } from '../../art/npc/face.ts';
import { atHand, inFrame, invert, upright } from '../../art/npc/helpers.ts';
import type { Pen } from '../../art/types.ts';
import type { Bones, Npc, NpcLoop, NpcParts, NpcServe, Swing } from '../types.ts';
import { C } from './kit.ts';
import { ANVIL, BUREAU, POT } from './stations.ts';

// Hell's locals (see Npc in ../types.ts), on the shared puppet, in the
// figures' style and hell's ink: cozy cartoon devils, not frights. The
// contract clerk in his spiky chair behind the contract desk (the desk
// stands out from the wall to make room: see BUREAU in ./stations.ts), the
// forge demon at his anvil on the forge's front edge, and the witch at her
// scrying cauldron's side with its bone ladle. None is dressed like the
// agents (red robes, gold ram's horns): a red-skinned clerk in black, a
// big ember-orange smith with a fiery tuft in a charcoal apron, a lilac
// witch in a tall hat: three hues apart.

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

// A stroke `w` units wide (at least a pixel) through the points, in the
// sketch's second pass: a detail line (a strap, a stitch, a chain).
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

// An arm k of the way from a to b.
const mix = (a: Swing, b: Swing, k: number): Swing => ({ sh: a.sh + (b.sh - a.sh) * k, el: a.el + (b.el - a.el) * k });

// A curved horn from its root (x, y) to its tip, `w` thick at the root.
function horn(sk: Sketch, x: number, y: number, tx: number, ty: number, bend: number, w: number, fill: string, dark: string): void {
  const mx = (x + tx) / 2 + bend;
  const my = (y + ty) / 2;
  const nx = -(ty - y);
  const ny = tx - x;
  const l = Math.hypot(nx, ny) || 1;
  const ox = (nx / l) * w;
  const oy = (ny / l) * w;
  sk.blob((q) => {
    q.moveTo(x - ox, y - oy);
    q.quadraticCurveTo(mx - ox * 0.5, my - oy * 0.5, tx, ty);
    q.quadraticCurveTo(mx + ox * 0.5, my + oy * 0.5, x + ox, y + oy);
    q.closePath();
  }, fill, { dark, d: 0.15 });
}

// A pointed devil's tail from the small of the back, curling up behind.
function tail(sk: Sketch, pts: readonly number[], w: number, fill: string, dark: string): void {
  sk.limb(pts, w, fill, { dark });
  const n = pts.length;
  const [x, y] = [pts[n - 2], pts[n - 1]];
  const [px, py] = [pts[n - 4], pts[n - 3]];
  const a = Math.atan2(y - py, x - px);
  sk.at(mul(move(x, y), turn(a)), () =>
    sk.blob((q) => {
      q.moveTo(1.0, 0);
      q.lineTo(-0.2, -0.6);
      q.quadraticCurveTo(0.05, 0, -0.2, 0.6);
      q.closePath();
    }, fill, { dark, d: 0.1 }),
  );
}

// ── the clerk ────────────────────────────────────────────────────────────
// The contract clerk: a small red devil in a black frock coat and a stiff
// white collar with a red cravat, slicked black hair to a widow's peak,
// little black horns, round gold spectacles, a pointed goatee and a tail
// curling up behind his chair. At work he writes with his red quill, the
// far hand holding the sheet, then rocks the blotter over the fresh line;
// he hands over a rolled contract under a red seal.

const RED = '#d4483a';
const RED_D = '#a8302a';
const FROCK = '#3a2c40';
const FROCK_D = '#261c2c';
const COLLAR = '#f4ead8';
const SLICK = '#2b1620';
const HORN_K = '#3e2430';
const QUILL = '#f05a3a';
const HORN_K_D = '#24141c';

const CLERK_BONES: Bones = { neck: [0.25, -5.55], shoulders: [[-1.45, -4.95], [1.7, -4.95]], upper: 1.6, fore: 1.55 };

const clerkParts: NpcParts = {
  body(sk) {
    // his tail, up behind the chair
    tail(sk, [-1.3, -1.6, -2.8, -1.7, -3.5, -3.0, -3.1, -4.4], 0.42, RED, RED_D);
    // seated: thighs forward, shins down to little black hooves
    for (const [dx, dy, near] of [[0.55, -0.15, false], [-0.25, 0.1, true]] as const) {
      const c = near ? FROCK : FROCK_D;
      sk.limb([-0.4 + dx, -1.2 + dy, 2.3 + dx, -1.05 + dy], 1.05, c, { dark: near ? FROCK_D : null });
      sk.limb([2.3 + dx, -1.05 + dy, 2.45 + dx, 1.9 + dy], 0.9, c, { dark: near ? FROCK_D : null });
      sk.blob((q) => {
        q.moveTo(1.85 + dx, 1.85 + dy);
        q.lineTo(3.05 + dx, 1.85 + dy);
        q.lineTo(3.0 + dx, 2.45 + dy);
        q.lineTo(1.9 + dx, 2.45 + dy);
        q.closePath();
      }, '#1a1014', { line: 0.5 });
    }
    // the frock coat, open over a white shirt front
    sk.blob((q) => {
      q.moveTo(-1.85, -5.15);
      q.quadraticCurveTo(0.15, -5.75, 2.05, -5.2);
      q.quadraticCurveTo(2.5, -3.4, 2.25, -1.3);
      q.quadraticCurveTo(0.2, -0.9, -1.75, -1.3);
      q.quadraticCurveTo(-2.15, -3.4, -1.85, -5.15);
      q.closePath();
    }, FROCK, { dark: FROCK_D, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(-0.15, -5.55);
      q.lineTo(1.75, -5.4);
      q.lineTo(1.05, -2.9);
      q.closePath();
    }, COLLAR, { line: 0.5 });
    // the cravat, the lapels, a gold watch chain
    sk.blob((q) => {
      q.moveTo(0.35, -5.25);
      q.lineTo(1.35, -5.25);
      q.lineTo(1.05, -3.7);
      q.lineTo(0.75, -3.45);
      q.lineTo(0.55, -3.8);
      q.closePath();
    }, C.velvet, { dark: C.velvetDark, d: 0.1, line: 0.5 });
    stroke(sk, [-0.15, -5.5, 0.8, -3.0, 1.1, -2.2], 0.12, FROCK_D);
    stroke(sk, [1.9, -5.35, 1.2, -2.9], 0.12, FROCK_D);
    stroke(sk, [1.2, -2.6, 1.6, -2.15, 2.15, -2.3], 0.12, C.gold);
  },
  head(sk, p, back) {
    const cx = 0.1;
    const cy = -2.9;
    // his little horns, the far one first
    horn(sk, cx + 1.5, cy - 2.55, cx + 2.3, cy - 4.25, 0.45, 0.45, HORN_K, HORN_K_D);
    sk.blob(ell(cx, cy, 3.15, 3.0), RED, { dark: RED_D, d: 0.45 });
    // the near ear, pointed, laid back
    sk.blob((q) => {
      q.moveTo(cx - 2.6, cy - 0.2);
      q.lineTo(cx - 4.0, cy - 1.0);
      q.quadraticCurveTo(cx - 3.3, cy + 0.9, cx - 2.5, cy + 1.0);
      q.closePath();
    }, RED, { dark: RED_D, d: 0.15 });
    // the slicked hair, down to a widow's peak
    sk.blob((q) => {
      q.moveTo(cx - 3.1, cy + 0.2);
      q.quadraticCurveTo(cx - 3.3, cy - 2.9, cx - 0.2, cy - 3.15);
      q.quadraticCurveTo(cx + 2.8, cy - 3.0, cx + 3.15, cy - 0.7);
      q.quadraticCurveTo(cx + 2.4, cy - 1.6, cx + 1.25, cy - 0.6);
      q.quadraticCurveTo(cx + 0.4, cy - 1.7, cx - 1.6, cy - 1.4);
      q.quadraticCurveTo(cx - 2.3, cy - 0.7, cx - 3.1, cy + 0.2);
      q.closePath();
    }, SLICK, { dark: '#180c12', d: 0.3 });
    stroke(sk, [cx - 1.6, cy - 2.6, cx + 0.8, cy - 2.75], 0.12, '#5a3a4a');
    horn(sk, cx - 1.2, cy - 2.75, cx - 1.9, cy - 4.5, -0.5, 0.5, HORN_K, HORN_K_D);
    if (back) return;
    face(sk, { x: cx + 0.65, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, drop: 1.4 });
    // the goatee and round gold spectacles
    sk.blob((q) => {
      q.moveTo(cx + 0.2, cy + 2.55);
      q.quadraticCurveTo(cx + 0.8, cy + 2.9, cx + 1.4, cy + 2.5);
      q.lineTo(cx + 0.95, cy + 3.75);
      q.closePath();
    }, SLICK, { line: 0.5 });
    sk.draw((q, c) => {
      q.strokeStyle = C.gold;
      q.lineWidth = Math.max(0.16, 1 / c.px);
      q.beginPath();
      q.arc(cx - 0.5, cy + 0.55, 0.85, 0, TAU);
      q.moveTo(cx + 2.55, cy + 0.55);
      q.arc(cx + 1.8, cy + 0.55, 0.75, 0, TAU);
      q.moveTo(cx + 0.35, cy + 0.45);
      q.quadraticCurveTo(cx + 0.7, cy + 0.25, cx + 1.05, cy + 0.45);
      q.moveTo(cx - 1.35, cy + 0.45);
      q.lineTo(cx - 2.7, cy + 0.15);
      q.stroke();
      q.fillStyle = '#ffffff40';
      q.beginPath();
      q.arc(cx - 0.75, cy + 0.25, 0.25, 0, TAU);
      q.fill();
    });
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, CLERK_BONES.upper], 1.1, k ? FROCK_D : FROCK, { dark: k ? null : FROCK_D });
  },
  fore(sk, p, k) {
    const f = CLERK_BONES.fore;
    sk.limb([0, 0, 0, f - 0.4], 0.95, k ? FROCK_D : FROCK, { dark: k ? null : FROCK_D });
    stroke(sk, [-0.45, f - 0.45, 0.45, f - 0.45], 0.32, COLLAR, 'butt');
    // the red quill in the near hand, in its own loops (see NpcParts)
    if (k === 0 && own(p.act)) {
      atHand(sk, p, 0, f, () => {
        sk.blob((q) => {
          q.moveTo(0.25, 0.1);
          q.quadraticCurveTo(-1.2, -1.2, -1.15, -3.0);
          q.quadraticCurveTo(-0.35, -1.8, 0.4, -0.2);
          q.closePath();
        }, QUILL, { dark: C.velvet, d: 0.15, line: 0.5 });
        stroke(sk, [0.45, 0.75, -1.1, -2.9], 0.1, '#f2e6c8');
      });
    }
    // the rocking blotter in the far hand, over the fresh line
    if (k === 1 && p.act === 'work' && p.u >= 0.6 && p.u < 0.96) {
      atHand(sk, p, 1, f, () => {
        sk.blob((q) => {
          q.moveTo(-1.1, 0.3);
          q.quadraticCurveTo(0, 1.25, 1.1, 0.3);
          q.closePath();
        }, '#efe2c8', { line: 0.5 });
        sk.blob((q) => q.roundRect(-1.1, -0.1, 2.2, 0.45, 0.1), C.ebony, { dark: '#24141a', d: 0.1 });
        sk.blob(circ(0, -0.35, 0.3), C.gold, { line: 0.5 });
      });
    }
    sk.blob(circ(0, f, 0.55), k ? RED_D : RED, { dark: RED_D, d: 0.18 });
  },
};

// Writing: the near hand's quill scratching along the line, the far hand
// flat on the sheet; then the blotter rocked over it, a pleased look.
const C_WRITE: Swing = { sh: 0.59, el: 0.95 };
const C_WRITE2: Swing = { sh: 0.84, el: 0.6 };
const C_HOLD: Swing = { sh: -0.2, el: 1.85 };
const C_BLOT: Swing = { sh: -0.05, el: 1.75 };
const C_LIFT: Swing = { sh: 0.95, el: 1.45 };
const clerkWork: NpcLoop = {
  secs: 3,
  pose(u) {
    const along = u < 0.6 ? 0.5 - 0.5 * Math.cos((u / 0.6) * TAU) : 0;
    const scratch = Math.sin(u * TAU * 4) * (1 - ease(u, 0.5, 0.6));
    const blot = ease(u, 0.56, 0.64) - ease(u, 0.92, 1);
    const rock = Math.sin((u - 0.6) * TAU * 3) * blot;
    const near = mix(mix(C_WRITE, C_WRITE2, along), C_LIFT, blot);
    return {
      ...rest(),
      tilt: 0.16 - 0.06 * blot + 0.03 * scratch,
      lean: 0.06,
      arms: [{ sh: near.sh + 0.04 * scratch, el: near.el }, { sh: mix(C_HOLD, C_BLOT, blot).sh + 0.08 * rock, el: mix(C_HOLD, C_BLOT, blot).el }],
      eyes: blot > 0.5 && u > 0.8 ? 'happy' : 'open',
      mouth: blot > 0.5 ? 'smile' : 'closed',
    };
  },
};

// A contract, rolled and tied, its red wax seal hanging off a ribbon.
const contract: NpcServe = {
  name: 'contract',
  drink: false,
  draw(sk) {
    sk.at(turn(-0.5), () => {
      sk.limb([-1.4, 0.1, 1.4, 0.1], 1.0, C.parchment, { dark: C.parchmentDark });
      sk.blob(ell(-1.4, 0.1, 0.25, 0.5), C.parchmentDark, { line: 0.5 });
      stroke(sk, [0.2, -0.4, 0.2, 0.6], 0.2, C.velvet, 'butt');
    });
    stroke(sk, [0.2, 0.4, 0.45, 1.4], 0.14, C.velvet);
    sk.blob(circ(0.5, 1.65, 0.45), '#c8303a', { dark: C.velvetDark, d: 0.1 });
  },
};

const clerk: Npc = {
  name: 'clerk',
  station: 'write',
  // in his chair behind the desk (its seat 4.4 up, his seat line a unit
  // over his frame); the desk top hides him from the chest down
  place: { mode: 'seated', u: BUREAU.seat[0], v: BUREAU.seat[1], z: BUREAU.seat[2] + 0.05 - 1, top: BUREAU.top, edge: BUREAU.back },
  tall: 13,
  bones: CLERK_BONES,
  parts: clerkParts,
  work: clerkWork,
  serve: contract,
};

// ── the forge demon ──────────────────────────────────────────────────────
// A big, round, ember-orange smith: great curling bone horns with a tuft
// of fire between them, a broad grin with two little tusks, a charcoal
// leather apron, bracers and a pointed tail. At work he hammers an ingot
// on the anvil, his tongs holding it in the near hand. His show is all
// hellfire: a deep breath, cheeks full; a gout of fire breathed onto the
// ingot till it flares white-hot and a fountain of sparks leaps off it; a
// flurry of blows, sparks flying off each; then a roar, hammer and tongs
// flung up wide and the fire on his head blazing up tall.

const PLUM = '#de7330';
const PLUM_D = '#a84e1e';
const BELLY = '#f4a865';
const APRON = '#3e3436';
const APRON_D = '#2a2224';
const BOOTS = '#2a1a1e';
const HAMMER_H = '#6e4630';

const SMITH_BONES: Bones = { neck: [0.3, -8.15], shoulders: [[-2.6, -7.7], [2.85, -7.7]], upper: 1.9, fore: 1.8 };
// Where he stands, along from the anvil, and the ingot on it from his
// feet (frame units: forward, down).
const SMITH: [number, number] = [Math.round((ANVIL.u - 3.3) * 10) / 10, 12.6];
const INGOT: [number, number] = [ANVIL.u - SMITH[0] - (ANVIL.v - SMITH[1]), (ANVIL.u - SMITH[0] + ANVIL.v - SMITH[1]) / 2 - ANVIL.z - 0.3];
// His show's beats, at u of it: the ingot flaring white-hot under his
// fire (and dimming as it is worked), the blows of the flurry (the hammer
// 0 raised, 1 down on the ingot: it lands at u = 0.5 and 0.625), and the
// roar at its end.
const flareOf = (u: number) => (ease(u, 0.27, 0.36) - 0.45 * ease(u, 0.5, 0.75)) * (1 - ease(u, 0.92, 1));
const blowOf = (u: number) => (u > 0.4375 && u < 0.6875 ? 0.5 + 0.5 * Math.cos((u - 0.5) * TAU * 8) : 0);
const roarOf = (u: number) => ease(u, 0.7, 0.8) - ease(u, 0.86, 1);
// How far after a blow lands, 0 to 1 of the time to the next (sparks fly
// off it for the first part).
const sinceBlow = (u: number) => (((u - 0.5) * 8) % 1 + 1) % 1;

// A spray of sparks flying off (x, y) up and out, `n` of them `r` long,
// `k` 1 as they burst and fading out further off; `seed` turns the spray.
function sparkSpray(sk: Sketch, x: number, y: number, n: number, r: number, k: number, seed: number): void {
  sk.draw((q, c) => {
    q.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const a = -Math.PI * (0.06 + ((i + 0.5) / n) * 0.88) + 0.18 * Math.sin(seed * 7.1 + i * 2.3);
      const r0 = 0.3 + (1 - k) * r * 0.6;
      const r1 = r0 + r * (0.45 + 0.4 * ((i * 5 + seed) % 3) / 2);
      q.strokeStyle = i % 3 ? C.lavaHot : C.lavaWhite;
      q.lineWidth = Math.max(0.16, 1 / c.px) * (k > 0.5 ? 1.5 : 1.1);
      q.beginPath();
      q.moveTo(x + Math.cos(a) * r0, y + Math.sin(a) * r0);
      q.lineTo(x + Math.cos(a) * r1, y + Math.sin(a) * r1);
      q.stroke();
    }
  });
}

// The ingot flaring under his fire: a white-hot glow round it, `f` 0..1.
function flare(sk: Sketch, x: number, y: number, f: number): void {
  sk.draw((q) => {
    const g = q.createRadialGradient(x, y, 0, x, y, 1.0 + 1.6 * f);
    g.addColorStop(0, '#fff8dcf0');
    g.addColorStop(0.35, '#ffd25ad0');
    g.addColorStop(0.7, '#ff7a1f60');
    g.addColorStop(1, '#ff7a1f00');
    q.fillStyle = g;
    q.beginPath();
    q.arc(x, y, 1.0 + 1.6 * f, 0, TAU);
    q.fill();
  });
  sk.blob(ell(x, y, 0.95, 0.38), f > 0.6 ? C.lavaWhite : C.lavaHot, { line: 0.5, sil: false });
}

// Fire at u round its loop: three tongues of flame.
function fireTuft(sk: Sketch, x: number, y: number, s: number, u: number): void {
  const f = (i: number) => 1 + 0.18 * Math.sin(u * TAU * 2 + i * 2.1);
  for (const [col, k] of [[C.fire, 1], [C.flame, 0.68], [C.flameHot, 0.38]] as const) {
    sk.blob((q) => {
      q.moveTo(x - 1.2 * s * k, y);
      q.quadraticCurveTo(x - 1.3 * s * k, y - 1.2 * s * k * f(0), x - 0.7 * s * k, y - 1.7 * s * k * f(0));
      q.quadraticCurveTo(x - 0.45 * s * k, y - 1.0 * s * k, x - 0.1 * s * k, y - 2.3 * s * k * f(1));
      q.quadraticCurveTo(x + 0.35 * s * k, y - 1.1 * s * k, x + 0.75 * s * k, y - 1.8 * s * k * f(2));
      q.quadraticCurveTo(x + 1.3 * s * k, y - 1.0 * s * k, x + 1.2 * s * k, y);
      q.closePath();
    }, col, { line: k === 1 ? 0.6 : 0, sil: k === 1 });
  }
}

const smithParts: NpcParts = {
  body(sk) {
    tail(sk, [-1.8, -3.0, -3.6, -2.4, -4.4, -3.8, -4.1, -5.4], 0.6, PLUM, PLUM_D);
    // short thick legs and cloven boots, the far leg first
    for (const [x, near] of [[1.25, false], [-1.0, true]] as const) {
      sk.limb([x, -3.0, x + 0.05, -1.0], 1.75, near ? APRON_D : shade(APRON_D, -0.2), { dark: near ? shade(APRON_D, -0.2) : null });
      sk.blob((q) => {
        q.moveTo(x - 0.9, -1.3);
        q.lineTo(x + 1.35, -1.3);
        q.quadraticCurveTo(x + 1.55, 0, x + 1.2, 0);
        q.lineTo(x - 0.85, 0);
        q.quadraticCurveTo(x - 1.05, -0.6, x - 0.9, -1.3);
        q.closePath();
      }, BOOTS, { dark: '#160c10', d: 0.15 });
      stroke(sk, [x + 0.35, -0.6, x + 0.35, 0], 0.12, '#000000a0');
    }
    // the big round body, a paler belly
    const torso = (q: Pen) => {
      q.moveTo(-2.95, -7.85);
      q.quadraticCurveTo(0.2, -8.95, 3.25, -8.0);
      q.quadraticCurveTo(4.3, -5.2, 3.2, -2.4);
      q.quadraticCurveTo(0.2, -1.6, -2.7, -2.4);
      q.quadraticCurveTo(-3.55, -5.2, -2.95, -7.85);
      q.closePath();
    };
    sk.blob(torso, PLUM, { dark: PLUM_D, d: 0.6 });
    sk.blob(ell(1.6, -5.4, 1.9, 2.4, 0.15), BELLY, { line: 0, sil: false });
    // the leather apron over the front, its strap up round his neck
    sk.blob((q) => {
      q.moveTo(-0.5, -6.6);
      q.lineTo(2.55, -6.85);
      q.quadraticCurveTo(3.95, -4.6, 3.35, -1.6);
      q.lineTo(-1.1, -1.4);
      q.quadraticCurveTo(-1.5, -4.0, -0.5, -6.6);
      q.closePath();
    }, APRON, { dark: APRON_D, d: 0.35 });
    stroke(sk, [-0.4, -6.6, 0.1, -8.4], 0.24, APRON_D);
    stroke(sk, [2.45, -6.8, 2.3, -8.4], 0.24, APRON_D);
    // a pocket, a chisel in it; the belt
    sk.blob((q) => q.roundRect(0.4, -4.4, 1.7, 1.2, 0.2), APRON_D, { line: 0.5 });
    sk.limb([1.6, -4.4, 1.85, -5.4], 0.3, C.ironLight);
    stroke(sk, [-2.9, -3.65, 0.2, -3.3, 3.6, -3.55], 0.35, '#2a1416');
  },
  head(sk, p, back) {
    const cx = 0.15;
    const cy = -2.9;
    const show = p.act === 'show' ? p.u : -1;
    const puff = show >= 0 ? bump(show, 0.02, 0.22) : 0;
    // the far horn, behind the head
    horn(sk, cx + 1.9, cy - 2.35, cx + 3.8, cy - 3.9, 0.55, 0.72, C.bone, C.boneShade);
    sk.blob(ell(cx, cy, 3.45 + 0.15 * puff, 3.25), PLUM, { dark: PLUM_D, d: 0.5 });
    // his tuft of fire, flickering, blazing up tall as he roars
    fireTuft(sk, cx + 0.1, cy - 2.8, 0.82 + 0.85 * (show >= 0 ? roarOf(show) : 0), p.u + (p.act === 'work' ? 0 : 0.37));
    // the near ear, pointed
    sk.blob((q) => {
      q.moveTo(cx - 2.85, cy - 0.3);
      q.lineTo(cx - 4.3, cy - 1.0);
      q.quadraticCurveTo(cx - 3.6, cy + 1.0, cx - 2.75, cy + 1.0);
      q.closePath();
    }, PLUM, { dark: PLUM_D, d: 0.15 });
    horn(sk, cx - 1.8, cy - 2.55, cx - 3.6, cy - 4.2, -0.55, 0.78, C.bone, C.boneShade);
    if (back) return;
    // heavy brows, the face, two little tusks
    stroke(sk, [cx - 1.25, cy - 0.35, cx - 0.1, cy - 0.15], 0.38, '#5a2410');
    stroke(sk, [cx + 1.2, cy - 0.2, cx + 2.4, cy - 0.35], 0.32, '#5a2410');
    face(sk, { x: cx + 0.65, y: cy + 0.55, eyes: p.eyes, mouth: p.mouth, gap: 2.45, drop: 1.6 });
    if (p.mouth !== 'o') {
      for (const x of [cx + 0.05, cx + 1.35]) {
        sk.blob((q) => {
          q.moveTo(x - 0.22, cy + 2.35);
          q.lineTo(x + 0.22, cy + 2.35);
          q.lineTo(x, cy + 1.75);
          q.closePath();
        }, '#fff6e6', { line: 0.4, sil: false });
      }
    }
    // cheeks puffed full for the fire, then the gout of it on the ingot
    if (puff > 0.3) {
      sk.draw((q) => {
        q.fillStyle = '#ff9a8a60';
        q.beginPath();
        q.ellipse(cx + 2.5, cy + 1.5, 0.75, 0.55, 0, 0, TAU);
        q.ellipse(cx - 1.0, cy + 1.6, 0.65, 0.5, 0, 0, TAU);
        q.fill();
      });
    }
    const gout = show >= 0 ? bump(show, 0.2, 0.44) : 0;
    if (gout > 0.05) {
      const [tx, ty] = apply(invert(sk.m), INGOT[0], INGOT[1]);
      const mx = cx + 0.7;
      const my = cy + 2.3;
      const dx = tx - mx;
      const dy = ty - my;
      const l = Math.hypot(dx, dy);
      sk.at(mul(move(mx, my), turn(Math.atan2(dy, dx))), () => {
        for (const [col, k] of [[C.fire, 1], [C.flame, 0.7], [C.flameHot, 0.4]] as const) {
          const len = l * (0.55 + 0.45 * gout) * (k === 1 ? 1 : 0.92);
          const w = 1.6 * k * (0.7 + 0.3 * gout);
          sk.blob((q) => {
            q.moveTo(0, -0.25 * k);
            q.quadraticCurveTo(len * 0.5, -w, len, -w * 0.4 + 0.3 * Math.sin(show * 40));
            q.quadraticCurveTo(len * 1.08, 0, len, w * 0.4);
            q.quadraticCurveTo(len * 0.5, w, 0, 0.25 * k);
            q.closePath();
          }, col, { line: k === 1 ? 0.6 : 0, sil: k === 1 });
        }
      });
    }
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, SMITH_BONES.upper], 1.9, k ? PLUM_D : PLUM, { dark: k ? null : PLUM_D });
  },
  fore(sk, p, k) {
    const f = SMITH_BONES.fore;
    sk.limb([0, 0, 0, f - 0.3], 1.7, k ? PLUM_D : PLUM, { dark: k ? null : PLUM_D });
    sk.blob((q) => q.roundRect(-0.95, f - 1.15, 1.9, 0.75, 0.2), APRON, { dark: APRON_D, d: 0.1 });
    if (k === 1 && own(p.act)) {
      // the hammer: a short haft on along the forearm, a heavy iron head
      // across its end
      sk.limb([0, f - 0.2, 0, f + 1.6], 0.42, HAMMER_H, { dark: shade(HAMMER_H, -0.3) });
      sk.blob((q) => q.roundRect(-0.85, f + 1.2, 1.7, 0.95, 0.15), C.iron, { dark: '#221c20', d: 0.15 });
      sk.blob((q) => q.rect(-0.9, f + 1.3, 0.25, 0.75), C.ironLight, { line: 0.4 });
    }
    if (k === 0 && own(p.act)) {
      // the tongs: on the ingot at work and through the show's fire and
      // flurry, then swung off it and up with his arm (straight out of
      // his fist) as he roars, and back onto it as the arm comes down
      const show = p.act === 'show' ? p.u : -1;
      const up = show >= 0 ? ease(roarOf(show), 0.15, 0.5) : 0;
      const [ix, iy] = apply(invert(sk.m), INGOT[0] - 0.6, INGOT[1] + 0.1);
      const tx = ix * (1 - up);
      const ty = iy + (f + 3.2 - iy) * up;
      const a = Math.atan2(ty - f, tx);
      const l = Math.hypot(tx, ty - f);
      sk.at(mul(move(0, f), turn(a)), () => {
        sk.limb([0, -0.1, l * 0.75, -0.18, l, -0.05], 0.22, C.ironLight);
        sk.limb([0, 0.1, l * 0.75, 0.18, l, 0.05], 0.22, C.iron);
      });
      // in the show the ingot flares white-hot under his fire, a fountain
      // of sparks leaping off it, and sparks fly off every blow
      if (show >= 0) {
        const fl = flareOf(show);
        inFrame(sk, () => {
          const [x, y] = INGOT;
          if (fl > 0.05) flare(sk, x, y, fl);
          const burst = bump(show, 0.3, 0.5);
          if (burst > 0.1) sparkSpray(sk, x, y - 0.2, 11, 1.4 + 2.2 * burst, burst, 6);
          const since = sinceBlow(show);
          if (show >= 0.5 && show < 0.6875 && since < 0.4) sparkSpray(sk, x + 0.3, y - 0.2, 8, 1.6, 1 - since / 0.4, show < 0.6 ? 11 : 13);
        });
      }
    }
    sk.blob(circ(0, f, 0.85), k ? PLUM_D : PLUM, { dark: PLUM_D, d: 0.22 });
  },
};

// Hammering: the hammer up beside his head (forward of it, clear of his
// face), down on the ingot with a clang (a squint and a grin), up again;
// the tongs steady in the near hand.
const H_UP: Swing = { sh: 1.95, el: 0.75 };
const H_HIT: Swing = { sh: 1.41, el: -0.84 };
const T_HOLD: Swing = { sh: 1.0, el: 0.45 };
const smithWork: NpcLoop = {
  secs: 1.2,
  pose(u) {
    const down = ease(u, 0.25, 0.5) - ease(u, 0.62, 0.95);
    const hit = bump(u, 0.42, 0.68);
    return {
      ...rest(),
      bob: -0.15 * hit,
      lean: 0.04 + 0.06 * down,
      tilt: 0.06 + 0.12 * down,
      arms: [T_HOLD, mix(H_UP, H_HIT, down)],
      eyes: hit > 0.5 ? 'happy' : 'open',
      mouth: hit > 0.5 ? 'open' : 'smile',
    };
  },
};

// The show: a deep breath, cheeks full; a gout of fire on the ingot, which
// flares; a flurry of blows on it; and a roar, the hammer and the tongs
// flung up and out beside his head (never over his face), the fire on his
// head blazing up, a grin. Each change eased over a third of a second or
// more, back to the start at its end. The tongs' forearm leads its arm up
// and comes down last, so the tongs stay up by his head rather than swept
// out behind him.
const T_UP = swing(-1.9, -1.0);
const smithShow: NpcLoop & { crowd: 'watch' } = {
  secs: 4.8,
  crowd: 'watch',
  pose(u) {
    const breathe = bump(u, 0.0, 0.24);
    const fire = bump(u, 0.18, 0.46);
    const flurrying = ease(u, 0.4, 0.47) - ease(u, 0.66, 0.74);
    const blow = blowOf(u);
    const roar = roarOf(u);
    const hammer = mix(mix({ sh: 2.0, el: 0.85 }, mix(H_UP, H_HIT, blow), flurrying), swing(1.75, 0.75), roar);
    const lead = 1 - (1 - roar) ** 2;
    const sh = T_HOLD.sh + (T_UP.sh - T_HOLD.sh) * roar;
    const fore = T_HOLD.sh + T_HOLD.el + (T_UP.sh + T_UP.el - T_HOLD.sh - T_HOLD.el) * lead;
    const tongs = { sh, el: fore - sh };
    return {
      ...rest(),
      bob: 0.25 * breathe + 0.35 * roar * Math.abs(Math.sin(u * TAU * 4)),
      lean: -0.08 * breathe + 0.1 * fire + 0.05 * flurrying - 0.06 * roar,
      tilt: -0.16 * breathe + 0.2 * fire - 0.16 * roar,
      arms: [tongs, hammer],
      eyes: breathe > 0.5 ? 'shut' : fire > 0.3 || roar > 0.5 || blow > 0.5 ? 'happy' : 'open',
      mouth: breathe > 0.3 ? 'o' : 'open',
    };
  },
};

const forgeDemon: Npc = {
  name: 'forgeDemon',
  station: 'run',
  // out on the floor at the forge's front edge, the anvil before him
  place: { mode: 'standing', u: SMITH[0], v: SMITH[1], look: 'along' },
  tall: 16,
  bones: SMITH_BONES,
  parts: smithParts,
  work: smithWork,
  show: smithShow,
};

// ── the witch ────────────────────────────────────────────────────────────
// A cozy hell-witch: lilac skin, a long nose with a wart, a toothy grin,
// wild white hair under a tall crooked hat (two little black horns poke
// out of it), a violet robe with a ragged hem, a moss-green shawl, a bone
// pendant, striped stockings and pointed boots. At work she stirs the
// cauldron with its bone ladle and sprinkles in a pinch of something; she
// celebrates with a cackle and serves a goblet of soulfire brew.

const LILAC = '#c09ac4';
const LILAC_D = '#9a76a4';
const ROBE = '#4e2a64';
const ROBE_D = '#341a46';
const HAT = '#33203f';
const HAT_D = '#21142a';
const HAIR = '#f2ece4';
const HAIR_D = '#c8beb4';
const SHAWL = '#5f6a34';
const SHAWL_D = '#434c22';

const WITCH_BONES: Bones = { neck: [0.3, -7.15], shoulders: [[-1.5, -6.85], [1.85, -6.85]], upper: 1.8, fore: 1.7 };
// Where she stands: at the cauldron's side, the brew ahead of her.
const WITCH: [number, number] = [-1.6, POT.v + 1.0];

const witchParts: NpcParts = {
  body(sk) {
    // striped stockings and pointed boots, the far leg first
    for (const [x, near] of [[0.75, false], [-0.6, true]] as const) {
      sk.limb([x, -2.0, x + 0.05, -0.8], 0.75, near ? '#d8cce0' : '#b0a2ba');
      stroke(sk, [x - 0.4, -1.65, x + 0.45, -1.65], 0.28, ROBE_D, 'butt');
      stroke(sk, [x - 0.4, -1.1, x + 0.45, -1.1], 0.28, ROBE_D, 'butt');
      sk.blob((q) => {
        q.moveTo(x - 0.5, -0.9);
        q.lineTo(x + 0.6, -0.9);
        q.quadraticCurveTo(x + 1.4, -0.4, x + 1.9, -0.75);
        q.quadraticCurveTo(x + 1.8, 0, x + 0.9, 0);
        q.lineTo(x - 0.5, 0);
        q.closePath();
      }, '#1e1420', { dark: '#120a12', d: 0.12 });
    }
    // the robe, flaring to a ragged hem
    sk.blob((q) => {
      q.moveTo(-1.8, -7.2);
      q.quadraticCurveTo(0.25, -7.85, 2.2, -7.25);
      q.quadraticCurveTo(2.7, -4.5, 3.3, -1.75);
      q.lineTo(2.5, -1.3);
      q.lineTo(1.85, -1.85);
      q.lineTo(1.0, -1.25);
      q.lineTo(0.3, -1.85);
      q.lineTo(-0.5, -1.25);
      q.lineTo(-1.2, -1.85);
      q.lineTo(-2.4, -1.4);
      q.quadraticCurveTo(-2.3, -4.6, -1.8, -7.2);
      q.closePath();
    }, ROBE, { dark: ROBE_D, d: 0.45 });
    // the shawl over her shoulders, a bone pendant on a cord
    sk.blob((q) => {
      q.moveTo(-2.05, -7.0);
      q.quadraticCurveTo(0.25, -7.95, 2.45, -7.05);
      q.quadraticCurveTo(2.6, -5.9, 1.3, -5.2);
      q.lineTo(0.75, -4.6);
      q.lineTo(0.2, -5.2);
      q.quadraticCurveTo(-1.4, -5.6, -2.05, -7.0);
      q.closePath();
    }, SHAWL, { dark: SHAWL_D, d: 0.3 });
    sk.draw((q, c) => {
      q.fillStyle = SHAWL_D;
      for (let i = 0; i < 7; i++) {
        q.beginPath();
        q.arc(-1.6 + i * 0.55, -6.55 + Math.abs(i - 3.5) * 0.12, Math.max(0.1, 0.6 / c.px), 0, TAU);
        q.fill();
      }
    });
    stroke(sk, [0.0, -7.3, 0.9, -5.1, 1.7, -7.3], 0.08, '#2a1a1a');
    sk.blob(ell(0.9, -4.85, 0.38, 0.32), C.bone, { dark: C.boneShade, d: 0.08, line: 0.5 });
    sk.draw((q) => {
      q.fillStyle = '#3a2a2a';
      q.beginPath();
      q.arc(0.78, -4.88, 0.08, 0, TAU);
      q.arc(1.02, -4.88, 0.08, 0, TAU);
      q.fill();
    });
  },
  head(sk, p, back) {
    const cx = 0.15;
    const cy = -2.85;
    // wild white hair, out behind and under the brim
    sk.blob((q) => {
      q.moveTo(cx - 1.5, cy - 2.2);
      q.quadraticCurveTo(cx - 4.4, cy - 2.0, cx - 3.9, cy + 0.3);
      q.quadraticCurveTo(cx - 4.6, cy + 1.5, cx - 3.4, cy + 2.6);
      q.quadraticCurveTo(cx - 2.8, cy + 3.3, cx - 2.0, cy + 2.0);
      q.lineTo(cx + 1.0, cy - 1.2);
      q.closePath();
    }, HAIR, { dark: HAIR_D, d: 0.3 });
    sk.blob(ell(cx, cy, 3.1, 2.95), LILAC, { dark: LILAC_D, d: 0.45 });
    sk.blob((q) => {
      q.moveTo(cx + 2.0, cy - 1.6);
      q.quadraticCurveTo(cx + 3.6, cy - 1.0, cx + 3.3, cy + 0.6);
      q.quadraticCurveTo(cx + 2.6, cy - 0.3, cx + 1.6, cy - 0.6);
      q.closePath();
    }, HAIR, { dark: HAIR_D, d: 0.15 });
    if (!back) {
      face(sk, { x: cx + 0.6, y: cy + 0.35, eyes: p.eyes, mouth: p.mouth, drop: 1.85, r: 0.48 });
      // a tooth in her grin, and the long nose with its wart
      if (p.mouth === 'open') sk.blob((q) => q.rect(cx + 0.5, cy + 2.2, 0.3, 0.3), '#fff6e6', { line: 0, sil: false });
      sk.blob((q) => {
        q.moveTo(cx + 0.95, cy + 0.6);
        q.quadraticCurveTo(cx + 3.3, cy + 0.8, cx + 3.9, cy + 1.75);
        q.quadraticCurveTo(cx + 2.6, cy + 1.75, cx + 1.1, cy + 1.6);
        q.closePath();
      }, LILAC, { dark: LILAC_D, d: 0.15, line: 0.6 });
      sk.blob(circ(cx + 2.5, cy + 1.0, 0.2), '#8a6a94', { line: 0.4, sil: false });
      sk.draw((q) => {
        q.fillStyle = '#ff8fb050';
        q.beginPath();
        q.ellipse(cx - 1.3, cy + 1.55, 0.55, 0.32, 0, 0, TAU);
        q.fill();
      });
    }
    // the hat: a wide brim, a tall crooked crown bent back at the tip, a
    // bone-buckled band, two little horns poking out of it
    horn(sk, cx + 1.9, cy - 2.6, cx + 3.2, cy - 3.7, 0.3, 0.32, '#241820', '#120a10');
    sk.blob((q) => {
      q.moveTo(cx - 1.9, cy - 2.2);
      q.quadraticCurveTo(cx - 1.0, cy - 4.1, cx - 0.4, cy - 5.3);
      q.quadraticCurveTo(cx - 1.2, cy - 6.4, cx - 2.9, cy - 5.8);
      q.quadraticCurveTo(cx - 1.1, cy - 5.75, cx + 0.5, cy - 5.1);
      q.quadraticCurveTo(cx + 1.6, cy - 3.7, cx + 2.4, cy - 2.2);
      q.closePath();
    }, HAT, { dark: HAT_D, d: 0.35 });
    sk.blob((q) => {
      q.moveTo(cx - 1.75, cy - 2.25);
      q.quadraticCurveTo(cx + 0.3, cy - 3.0, cx + 2.35, cy - 2.25);
      q.lineTo(cx + 2.15, cy - 2.85);
      q.quadraticCurveTo(cx + 0.3, cy - 3.6, cx - 1.5, cy - 2.85);
      q.closePath();
    }, C.velvet, { dark: C.velvetDark, d: 0.1 });
    sk.blob((q) => q.roundRect(cx + 0.55, cy - 3.2, 0.75, 0.75, 0.12), C.bone, { line: 0.5 });
    sk.blob(ell(cx + 0.3, cy - 2.0, 4.7, 1.0, -0.06), HAT, { dark: HAT_D, d: 0.2 });
    horn(sk, cx - 1.6, cy - 2.75, cx - 3.0, cy - 3.9, -0.3, 0.32, '#241820', '#120a10');
  },
  upper(sk, _p, k) {
    sk.limb([0, 0, 0, WITCH_BONES.upper], 1.15, k ? ROBE_D : ROBE, { dark: k ? null : ROBE_D });
  },
  fore(sk, p, k) {
    const f = WITCH_BONES.fore;
    sk.limb([0, 0, 0, f - 0.4], 1.0, k ? ROBE_D : ROBE, { dark: k ? null : ROBE_D });
    // the flared cuff
    sk.blob((q) => {
      q.moveTo(-0.55, f - 0.75);
      q.lineTo(0.55, f - 0.75);
      q.lineTo(0.8, f - 0.15);
      q.lineTo(-0.8, f - 0.15);
      q.closePath();
    }, k ? ROBE_D : ROBE, { dark: ROBE_D, d: 0.1 });
    // the bone ladle in the far hand while she stirs: its knuckle over
    // her fist, its shaft down into the brew
    if (k === 1 && p.act === 'work') {
      sk.at(mul(move(0, f), mul(upright(p, 1), turn(-0.55))), () => {
        sk.limb([0, -0.7, 0, 4.4], 0.36, C.bone, { dark: C.boneShade });
        sk.blob(ell(0, -0.85, 0.42, 0.32), C.bone, { dark: C.boneShade, d: 0.08 });
        sk.blob(ell(0.1, 4.6, 0.75, 0.45), C.bone, { dark: C.boneShade, d: 0.12 });
      });
    }
    // a pinch of something sprinkled from the near fingers: green sparks
    if (k === 0 && p.act === 'work' && p.u >= 0.55 && p.u < 0.9) {
      sk.draw((q) => {
        q.fillStyle = C.soul;
        for (let i = 0; i < 4; i++) {
          const t = (p.u * 9 + i * 0.27) % 1;
          q.beginPath();
          q.arc(0.3 + (i - 1.5) * 0.35, f + 0.6 + t * 1.8, 0.16, 0, TAU);
          q.fill();
        }
      });
    }
    sk.blob(circ(0, f, 0.52), k ? LILAC_D : LILAC, { dark: LILAC_D, d: 0.18 });
  },
};

// Stirring: the far hand round and round with the ladle, leaning in to the
// brew; then the near hand over the pot, sprinkling a pinch, a grin.
const W_STIR: Swing = { sh: 0.11, el: 2.61 };
const W_PINCH: Swing = { sh: 0.84, el: 1.44 };
const W_REST: Swing = { sh: 0.2, el: 0.6 };
const witchWork: NpcLoop = {
  secs: 2.4,
  pose(u) {
    const a = u * TAU * 2;
    const pinch = ease(u, 0.4, 0.6) - ease(u, 0.8, 1);
    return {
      ...rest(),
      lean: 0.1 + 0.02 * Math.sin(a),
      tilt: 0.14 + 0.05 * Math.sin(a) + 0.06 * pinch,
      arms: [mix(W_REST, W_PINCH, pinch), { sh: W_STIR.sh + 0.16 * Math.cos(a), el: W_STIR.el - 0.3 * Math.sin(a) }],
      eyes: pinch > 0.6 ? 'happy' : 'open',
      mouth: pinch > 0.6 ? 'open' : 'smile',
    };
  },
};

// A cackle: head thrown back, arms flung wide, shoulders shaking.
const witchCelebrate: NpcLoop = {
  secs: 1.4,
  pose(u) {
    const k = env(u, 0.2, 0.8);
    const shake = Math.sin(u * TAU * 4) * k;
    return {
      ...rest(),
      bob: 0.12 * Math.abs(shake),
      lean: -0.06 * k,
      tilt: -0.22 * k + 0.05 * shake,
      arms: [{ sh: HANG.sh - 1.8 * k, el: HANG.el - 0.7 * k + 0.15 * shake }, { sh: HANG.sh + 1.9 * k, el: HANG.el - 0.5 * k - 0.15 * shake }],
      eyes: k > 0.4 ? 'happy' : 'open',
      mouth: k > 0.3 ? 'open' : 'smile',
    };
  },
};

// A goblet of soulfire brew: a gold cup on a stem, brimming green.
const goblet: NpcServe = {
  name: 'goblet',
  drink: true,
  draw(sk) {
    sk.limb([0, 0.3, 0, 1.3], 0.3, C.goldDark);
    sk.blob(ell(0, 1.45, 0.75, 0.25), C.gold, { dark: C.goldDark, d: 0.1 });
    sk.blob((q) => {
      q.moveTo(-0.95, -0.95);
      q.lineTo(0.95, -0.95);
      q.quadraticCurveTo(0.8, 0.35, 0, 0.4);
      q.quadraticCurveTo(-0.8, 0.35, -0.95, -0.95);
      q.closePath();
    }, C.gold, { dark: C.goldDark, d: 0.2 });
    sk.blob(ell(0, -0.95, 0.95, 0.3), C.soul, { line: 0.5 });
    sk.blob(circ(0.35, -1.45, 0.22), '#d8fff0', { line: 0.4 });
  },
};

const witch: Npc = {
  name: 'witch',
  station: 'web',
  // at the cauldron's side, out on the floor, facing along it to the brew
  place: { mode: 'standing', u: WITCH[0], v: WITCH[1], look: 'along' },
  tall: 16,
  bones: WITCH_BONES,
  parts: witchParts,
  work: witchWork,
  celebrate: witchCelebrate,
  serve: goblet,
};

export const NPCS: readonly Npc[] = [clerk, forgeDemon, witch];
