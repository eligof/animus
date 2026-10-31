import type { Pose } from '../../world/character.ts';
import { framesFor } from '../motion.ts';

// Poses as rigs: where the pelvis, hands and feet go, how the body leans and
// the head tilts, the face, and what is held, for one frame of a pose's
// loop. Pure numbers; ./body.ts and ./head.ts draw them.
//
// Units: a figure is 14 tall. The root frame has its origin between the
// feet on the floor, x toward where the figure faces (screen right, before
// any flip), y down. The body frame has its origin at the pelvis and leans
// with the body. Arm and leg 'A' is the one on the screen-left side (the
// near one seen from the front), 'B' the screen-right one (near from the
// back).

export type V = readonly [number, number];
export type Grip = 'fist' | 'open' | 'point';
// `fwd`: the hand is out in front of the body (hidden behind it from the
// back); `high`: up by the face (drawn over the head from the front).
export type Arm = { hand: V; bend: number; fwd: boolean; high: boolean; grip: Grip };
export type Leg = { foot: V; ang: number; bend: number };
// 'drowsy': heavy lids over open eyes; 'droop': over eyes cast down.
export type Eyes = 'open' | 'blink' | 'happy' | 'closed' | 'wide' | 'squeeze' | 'down' | 'up' | 'drowsy' | 'droop';
export type Mouth = 'smile' | 'grin' | 'open' | 'o' | 'flat' | 'frown' | 'wavy' | 'yawn' | 'small';
export type Brows = 'none' | 'up' | 'worried' | 'focus';
export type Face = { eyes: Eyes; look: V; mouth: Mouth; brows: Brows; blush: boolean };
export type PropKind = 'book' | 'notepad' | 'pencil' | 'magnifier' | 'tablet' | 'mallet' | 'mug' | 'block' | 'thought' | 'spark' | 'sweat';
// A held or shown thing: at hand `hand` (offset x, y) or, for -1, at (x, y)
// in the body frame; turned `a` radians; `v` a per-kind parameter (a page
// turning, a thought growing, steam).
export type Prop = { kind: PropKind; hand: -1 | 0 | 1; x: number; y: number; a: number; v: number; fwd: boolean };
export type Rig = {
  pelvis: [number, number]; // root frame
  lean: number; // radians, + toward the facing side
  chest: number; // breath: lifts the shoulders and head, units
  tilt: number; // the head, radians, + nods forward
  arms: [Arm, Arm];
  legs: [Leg, Leg];
  face: Face;
  props: Prop[];
  mode: 'stand' | 'sit' | 'lie';
  sway: number; // a skirt's or a ghost's hem swinging, -1..1
  hover: number; // a ghost floats this high
  shake: number; // whole-figure jitter, x units
  t: number; // seconds into the loop, for tails, steam and glows
};

export const SH: readonly [V, V] = [[-1.65, -4.05], [1.8, -4.05]]; // shoulders, body frame
export const HIP: readonly [V, V] = [[-0.85, -0.15], [0.95, -0.15]];
export const NECK: V = [0.2, -4.4];
export const HEAD_UP = 2.95; // neck to the head's centre
export const UPPER = 1.65;
export const FORE = 1.55;
export const THIGH = 1.55;
export const SHIN = 1.45;
const STAND: V = [0.05, -3.45];
const FEET: readonly [V, V] = [[-0.85, -0.65], [1.0, -0.65]];
const REST: readonly [V, V] = [[-2.3, -1.0], [2.45, -1.0]];
const TAU = Math.PI * 2;

// Loop length (seconds) by pose, and the frames it is drawn in (see
// ANIM_FPS in art/motion.ts).
const SECS: Record<Pose, number> = {
  idle: 3.2, walk: 0.5, write: 0.6, read: 3, think: 3.2, run: 0.7,
  search: 1.6, web: 2, delegate: 1.2, talk: 1.2, done: 0.9, error: 0.8,
  sleep: 3.2, sit: 3.2, carry: 1, place: 1.6, cheer: 0.6, wave: 0.6,
  drink: 2.4, stretch: 2.4, chat: 1.6, flinch: 0.4, dance: 0.9, pet: 1.2,
  highfive: 0.8, sip: 2,
  glance: 1.6, lean: 2.2, scratch: 1.2, tap: 0.9,
};
export const LOOP = {} as Record<Pose, readonly [number, number]>;
for (const pose of Object.keys(SECS) as Pose[]) LOOP[pose] = [SECS[pose], framesFor(SECS[pose])];

// The poses a carried mug of coffee shows in (see FigureFrame.mug), always
// in hand B: held before the belly standing about, walking or pondering, on
// the lap sitting, in the talking hand in a chat. The rest put it down for
// a moment (a sip has its own).
export const MUG_POSES: ReadonlySet<Pose> = new Set<Pose>(['idle', 'walk', 'think', 'sit', 'chat']);

const frac = (v: number) => v - Math.floor(v);

// The loop frame for a pose at poseT (seconds); `phase` (0..1) desyncs
// characters.
export function frameOf(pose: Pose, poseT: number, phase: number): number {
  const [per, n] = LOOP[pose];
  return Math.floor(frac(poseT / per + phase * 0.618) * n) % n;
}

// The eyes a pose has in frame i, before blinks and feelings (they depend
// on nothing else), worked out once a pose.
const poseEyes = new Map<Pose, Eyes[]>();
export function eyesAt(pose: Pose, i: number): Eyes {
  let e = poseEyes.get(pose);
  if (!e) poseEyes.set(pose, (e = Array.from({ length: LOOP[pose][1] }, (_, j) => rigFor(pose, j, { back: false, walking: false, walkU: 0, item: false, mug: false }).face.eyes)));
  return e[i];
}

// Eyes shut for a moment every 3 to 5 seconds (the gap set by `phase`).
export function blinkAt(poseT: number, phase: number): boolean {
  const per = 3 + 2 * frac(phase * 7.31);
  const t = poseT + phase * 11.7;
  return frac(t / per) * per < 0.17;
}

function base(): Rig {
  return {
    pelvis: [STAND[0], STAND[1]],
    lean: 0,
    chest: 0,
    tilt: 0,
    arms: [arm(REST[0], 1), arm(REST[1], 1)],
    legs: [{ foot: FEET[0], ang: 0, bend: -1 }, { foot: FEET[1], ang: 0, bend: -1 }],
    face: { eyes: 'open', look: [0, 0], mouth: 'smile', brows: 'none', blush: false },
    props: [],
    mode: 'stand',
    sway: 0,
    hover: 0,
    shake: 0,
    t: 0,
  };
}

function arm(hand: V, bend: number, o: Partial<Arm> = {}): Arm {
  return { hand, bend, fwd: false, high: false, grip: 'fist', ...o };
}

const prop = (kind: PropKind, hand: -1 | 0 | 1, x: number, y: number, a = 0, v = 0, fwd = true): Prop => ({ kind, hand, x, y, a, v, fwd });

// 0..1..0 bump over [a, b] of the loop.
function bump(u: number, a: number, b: number): number {
  if (u <= a || u >= b) return 0;
  return Math.sin(((u - a) / (b - a)) * Math.PI);
}

// Smoothstep from a to b.
function ease(u: number, a: number, b: number): number {
  const k = Math.max(0, Math.min(1, (u - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

// Legs (and the pelvis's bob) for walk-cycle frame u (0..1): contact at 0
// and 0.5, passing at 0.25 and 0.75.
export function walkLegs(r: Rig, u: number, amp = 1.2): void {
  const th = u * TAU;
  for (const k of [0, 1] as const) {
    const ph = th + (k ? Math.PI : 0);
    const c = Math.cos(ph);
    const lift = Math.max(0, -Math.sin(ph)) * 0.85;
    r.legs[k] = { foot: [FEET[k][0] + amp * c, FEET[k][1] - lift], ang: -0.32 * c, bend: -1 };
  }
  r.pelvis = [STAND[0] + 0.15, STAND[1] + 0.17 * Math.cos(2 * th) + 0.15];
  r.lean = 0.07;
  r.sway = -Math.cos(th);
}

function walkArms(r: Rig, u: number): void {
  const c = Math.cos(u * TAU);
  r.arms[0] = arm([REST[0][0] - 0.95 * c, REST[0][1] - 0.35 * Math.max(0, -c)], 1);
  r.arms[1] = arm([REST[1][0] + 0.95 * c, REST[1][1] - 0.35 * Math.max(0, c)], 1);
}

export type RigCtx = { back: boolean; walking: boolean; walkU: number; item: boolean; mug: boolean };

// The rig for frame i of a pose (see LOOP).
export function rigFor(pose: Pose, i: number, c: RigCtx): Rig {
  const [per, n] = LOOP[pose];
  const u = i / n;
  const r = base();
  r.t = u * per;
  const s1 = Math.sin(u * TAU);
  const c1 = Math.cos(u * TAU);
  // which of n even steps round the loop u is at: what flaps or shakes
  // goes by time, at the rate it was drawn at
  const at = (n: number) => Math.floor(u * n);
  switch (pose) {
    case 'idle': {
      r.chest = 0.14 * (0.5 - 0.5 * c1);
      r.arms[0] = arm([REST[0][0] - 0.06 * s1, REST[0][1] - 0.05 * s1], 1);
      r.arms[1] = arm([REST[1][0] + 0.06 * s1, REST[1][1] - 0.05 * s1], 1);
      // now and then a glance round
      const g = ease(u, 0.5, 0.58) - ease(u, 0.8, 0.88);
      r.face.look = [-0.9 * g, 0];
      r.tilt = -0.04 * g;
      break;
    }
    case 'walk':
      walkLegs(r, u);
      walkArms(r, u);
      r.tilt = 0.03 * Math.cos(2 * u * TAU);
      break;
    case 'write': {
      r.lean = 0.12;
      r.tilt = 0.12;
      r.face.eyes = 'down';
      r.face.mouth = 'small';
      if (c.back) {
        // from behind (at the desk): the surface held out at the near side,
        // the writer going over it, both past the body
        const w = Math.sin(u * TAU * 2);
        r.arms[1] = arm([3.75 + 0.15 * w, -3.0], 1, { fwd: true });
        r.arms[0] = arm([1.4 + 0.2 * w, -2.75 + 0.12 * c1], 1, { fwd: true });
        r.props.push(prop('notepad', -1, 3.7, -1.8, 0.25));
        r.props.push(prop('pencil', 1, -0.1, 0.1, Math.PI - 1.1));
      } else {
        // scribbling in a notepad
        const w = Math.sin(u * TAU * 2);
        r.arms[1] = arm([2.15, -2.35], 1, { fwd: true });
        r.arms[0] = arm([1.45 + 0.25 * w, -2.6 + 0.12 * c1], 1, { fwd: true });
        r.props.push(prop('notepad', 1, 0.15, -0.35, -0.25));
        r.props.push(prop('pencil', 0, 0.1, -0.2, -0.7));
      }
      break;
    }
    case 'read': {
      const turnV = ease(u, 0, 0.22);
      r.tilt = 0.14;
      r.lean = 0.04;
      r.face.eyes = 'down';
      r.face.look = [0.25 - 0.5 * ease(u, 0.25, 0.95), 0];
      r.face.mouth = 'small';
      r.chest = 0.08 * (0.5 - 0.5 * c1);
      const turning = turnV < 1 && u < 0.22 ? turnV : 0;
      if (c.back) {
        // from behind: held open at the near side
        r.arms[0] = arm([1.8, -2.6], 1, { fwd: true });
        r.arms[1] = arm([4.0, -2.75], 1, { fwd: true });
        r.props.push(prop('book', -1, 4.4, -3.2, 0.22, turning));
      } else {
        r.arms[0] = arm([0.5, -2.35], 1, { fwd: true });
        r.arms[1] = arm([3.05, -2.45], 1, { fwd: true });
        r.props.push(prop('book', -1, 1.8, -3.05, -0.08, turning));
      }
      break;
    }
    case 'think': {
      r.tilt = -0.1 + 0.07 * s1;
      r.face.eyes = 'up';
      r.face.look = [0.35, -0.3];
      r.face.mouth = 'flat';
      r.face.brows = 'up';
      r.arms[0] = arm([1.3, -4.55], 1, { fwd: true, high: true });
      r.arms[1] = arm([0.4, -1.75], 1, { fwd: true });
      r.props.push(prop('thought', -1, 3.6, -9.6, 0, u));
      break;
    }
    case 'run': {
      // hammering: wind up behind the head, strike down in front
      const up = ease(u, 0.05, 0.45);
      const hit = ease(u, 0.5, 0.62);
      const k = up * (1 - hit);
      const strike = u >= 0.62 && u < 0.8;
      r.lean = 0.14 - 0.12 * k + (strike ? 0.08 : 0);
      r.pelvis[1] += strike ? 0.22 : 0;
      r.face.eyes = strike ? 'squeeze' : 'open';
      r.face.brows = 'focus';
      r.face.mouth = strike ? 'open' : 'flat';
      r.arms[0] = arm([1.6, -1.4], 1, { fwd: true });
      if (c.back) {
        // from behind (at the desk): wound up out at the near side, beside
        // the head; over it the tool would look stuck on
        r.arms[1] = arm([3.3 + 1.6 * k, -1.6 - 2.6 * k], 1, { fwd: k < 0.5, high: k > 0.5 });
        r.props.push(prop('mallet', 1, 0, 0, 0.35 - 1.45 * k + (strike ? 0.2 : 0), strike ? 1 : 0, k < 0.5));
      } else {
        r.arms[1] = arm([3.3 - 2.6 * k, -1.6 - 5.0 * k], 1, { fwd: true, high: k > 0.5 });
        r.props.push(prop('mallet', 1, 0, 0, 0.35 - 2.75 * k + (strike ? 0.2 : 0), strike ? 1 : 0, k < 0.5));
      }
      break;
    }
    case 'search': {
      r.lean = 0.2;
      r.tilt = 0.18;
      r.pelvis[1] += 0.2;
      r.face.eyes = 'wide';
      r.face.mouth = 'o';
      r.face.look = [0.3, 0.25];
      const a = u * TAU;
      r.arms[1] = arm([3.25 + 0.55 * Math.sin(a), -2.3 + 0.35 * Math.cos(a)], 1, { fwd: true });
      r.arms[0] = arm([-2.25, -1.6], 1);
      r.props.push(prop('magnifier', 1, 0, 0, 0.35 + 0.2 * Math.sin(a)));
      break;
    }
    case 'web': {
      const swipe = ease(u, 0.1, 0.25) - ease(u, 0.3, 0.45) + ease(u, 0.6, 0.75) - ease(u, 0.8, 0.95);
      r.tilt = 0.14;
      r.face.eyes = 'down';
      r.face.mouth = 'smile';
      r.face.look = [0.3, 0];
      if (c.back) {
        // from behind: held up and out at the near side, the hand bobbing
        // with each swipe
        r.arms[1] = arm([3.55, -3.9 + 0.15 * swipe], 1, { fwd: true });
        r.arms[0] = arm([1.3, -3.0], 1, { fwd: true });
        r.props.push(prop('tablet', 1, 1.2, -0.4, -0.2, Math.floor(u * 2)));
      } else {
        r.arms[0] = arm([1.0 + 0.55 * swipe, -2.85 - 0.2 * swipe], 1, { fwd: true });
        r.arms[1] = arm([3.55, -2.95], 1, { fwd: true });
        r.props.push(prop('tablet', -1, 2.3, -3.0, 0.08, Math.floor(u * 2)));
      }
      break;
    }
    case 'delegate': {
      const k = ease(u, 0, 0.18) - ease(u, 0.55, 0.85);
      r.lean = -0.04 + 0.08 * k;
      r.face.brows = 'focus';
      r.face.mouth = k > 0.5 ? 'open' : 'smile';
      r.arms[1] = arm([3.4 + 1.3 * k, -3.6 - 0.9 * k], 1, { fwd: true, grip: 'point' });
      r.arms[0] = arm([-1.55, -1.75], 1);
      if (k > 0.6) r.props.push(prop('spark', 1, 0.95, -0.05, 0, u));
      break;
    }
    case 'talk': {
      // explaining: the hands open out and up in turn
      const a = u * TAU;
      const p = Math.max(0, Math.sin(a));
      const q = Math.max(0, -Math.sin(a));
      r.arms[0] = arm([0.7 - 0.9 * p, -2.6 - 2.0 * p], 1, { fwd: true, high: p > 0.5, grip: 'open' });
      r.arms[1] = arm([3.2 + 0.4 * q, -2.5 - 2.3 * q], 1, { fwd: true, high: q > 0.5, grip: 'open' });
      r.lean = 0.04 * (p - q);
      r.face.mouth = ['open', 'o', 'smile', 'open', 'small', 'open', 'o', 'smile', 'open', 'open', 'smile', 'small'][at(12)] as Mouth;
      r.face.brows = u > 0.5 ? 'up' : 'none';
      r.tilt = 0.05 * Math.sin(a * 2);
      break;
    }
    case 'done': {
      // hop for joy, arms flung up
      const h = 1.5 * bump(u, 0.15, 0.75);
      const crouch = 0.35 * (bump(u, 0, 0.18) + bump(u, 0.72, 1));
      r.pelvis = [STAND[0], STAND[1] - h + crouch];
      r.legs[0] = { foot: [FEET[0][0] + 0.15, FEET[0][1] - h * 0.85], ang: h > 0.2 ? 0.35 : 0, bend: -1 };
      r.legs[1] = { foot: [FEET[1][0] + 0.15, FEET[1][1] - h * 0.85], ang: h > 0.2 ? 0.35 : 0, bend: -1 };
      const up = h > 0.15 ? 1 : 0.45;
      r.arms[0] = arm([-2.3 - 0.9 * up, -1.6 - 5.3 * up], up > 0.5 ? -1 : 1, { high: up > 0.5 });
      r.arms[1] = arm([2.7 + 0.8 * up, -1.6 - 5.35 * up], 1, { high: up > 0.5 });
      r.face = { eyes: 'happy', look: [0, 0], mouth: 'grin', brows: 'none', blush: true };
      r.sway = h > 0.15 ? 0.5 : 0;
      break;
    }
    case 'error': {
      const j = at(8) % 2 ? 1 : -1;
      r.shake = 0.22 * j;
      r.lean = -0.16;
      r.pelvis[1] += 0.2;
      r.arms[0] = arm([-3.1, -5.5 - 0.25 * j], -1, { high: true, grip: 'open' });
      r.arms[1] = arm([3.5, -5.7 + 0.25 * j], 1, { high: true, grip: 'open' });
      r.face = { eyes: 'wide', look: [0, 0], mouth: 'wavy', brows: 'worried', blush: false };
      r.props.push(prop('sweat', -1, -2.5, -9.2, 0, u));
      break;
    }
    case 'flinch': {
      const j = at(4) % 2 ? 1 : -1;
      r.shake = 0.1 * j;
      r.lean = -0.2;
      r.tilt = 0.1;
      r.pelvis[1] += 0.35;
      r.legs[0] = { foot: [FEET[0][0] - 0.35, FEET[0][1]], ang: 0, bend: -1 };
      r.arms[0] = arm([1.0, -5.1], 1, { fwd: true, high: true, grip: 'open' });
      r.arms[1] = arm([2.4, -5.5], 1, { fwd: true, high: true, grip: 'open' });
      r.face = { eyes: 'squeeze', look: [0, 0], mouth: 'wavy', brows: 'worried', blush: false };
      break;
    }
    case 'sleep': {
      r.mode = 'lie';
      // on its back, hands on the tummy, a knee up (body.ts lays the
      // whole figure down)
      r.chest = 0.16 * (0.5 - 0.5 * c1);
      r.tilt = -0.2;
      r.pelvis = [STAND[0], STAND[1]];
      r.legs[0] = { foot: [FEET[0][0] + 0.2, FEET[0][1]], ang: -0.6, bend: -1 };
      r.legs[1] = { foot: [1.35, -1.0], ang: -0.2, bend: -1 };
      r.arms[0] = arm([1.0, -2.2], 1, { fwd: true });
      r.arms[1] = arm([1.75, -2.6], 1, { fwd: true });
      r.face = { eyes: 'closed', look: [0, 0], mouth: at(8) < 4 ? 'small' : 'o', brows: 'none', blush: true };
      break;
    }
    case 'sit': {
      r.mode = 'sit';
      r.pelvis = [0, -1.15];
      r.lean = -0.03 + 0.03 * s1;
      r.chest = 0.1 * (0.5 - 0.5 * c1);
      r.legs[0] = { foot: [1.75, -0.6], ang: 0, bend: -1 };
      r.legs[1] = { foot: [2.85, -0.6], ang: 0, bend: -1 };
      r.arms[0] = arm([1.35, -1.25], 1, { fwd: true });
      r.arms[1] = arm([2.5, -1.25], 1, { fwd: true });
      const g = ease(u, 0.45, 0.55) - ease(u, 0.85, 0.95);
      r.face.look = [-0.8 * g, -0.1 * g];
      break;
    }
    case 'carry': {
      r.chest = -0.08 * (0.5 - 0.5 * c1);
      r.arms[0] = arm([-2.1, -6.9], -1, { high: true, grip: 'open' });
      r.arms[1] = arm([2.8, -6.95], 1, { high: true, grip: 'open' });
      r.face.brows = 'focus';
      r.face.mouth = 'small';
      r.props.push(prop('block', -1, 0.3, -12.55, 0, 0, false));
      break;
    }
    case 'place': {
      // crouch and set the block down in front (or reach for one)
      const k = ease(u, 0, 0.35) - ease(u, 0.75, 1) * 0.6;
      r.pelvis = [STAND[0] - 0.3 * k, STAND[1] + 1.1 * k];
      r.lean = 0.42 * k;
      r.tilt = 0.12 * k;
      r.face.eyes = 'down';
      r.face.mouth = 'small';
      r.face.brows = 'focus';
      r.legs[0] = { foot: [FEET[0][0] - 0.25 * k, FEET[0][1]], ang: 0, bend: -1 };
      r.legs[1] = { foot: [FEET[1][0] + 0.45 * k, FEET[1][1]], ang: 0, bend: -1 };
      r.arms[0] = arm([1.35, -0.4 + 0.2 * k], 1, { fwd: true });
      r.arms[1] = arm([3.6, -0.5 + 0.2 * k], 1, { fwd: true });
      if (c.item) r.props.push(prop('block', -1, 2.5, -0.9 + 0.2 * k, 0, 1));
      break;
    }
    case 'cheer': {
      const h = 0.55 * bump(u, 0.1, 0.6);
      r.pelvis[1] -= h;
      r.legs[0] = { foot: [FEET[0][0], FEET[0][1] - h * 0.9], ang: 0, bend: -1 };
      r.legs[1] = { foot: [FEET[1][0], FEET[1][1] - h * 0.9], ang: 0, bend: -1 };
      const p = u < 0.5 ? 1 : 0;
      r.arms[0] = arm([-3.3 + 0.35 * p, -5.8 - 1.15 * p], -1, { high: true });
      r.arms[1] = arm([3.1 - 0.2 * (1 - p), -5.9 - 1.2 * (1 - p)], 1, { high: true });
      r.face = { eyes: 'happy', look: [0, 0], mouth: p ? 'grin' : 'open', brows: 'none', blush: true };
      break;
    }
    case 'wave': {
      const w = Math.sin(u * TAU + 0.6);
      r.arms[1] = arm([4.25 + 0.35 * w, -6.0 + 0.15 * Math.abs(w)], 1, { high: true, grip: 'open' });
      r.tilt = -0.05;
      r.lean = -0.03;
      r.face.mouth = 'grin';
      r.face.eyes = 'happy';
      break;
    }
    case 'drink': {
      const sip = ease(u, 0.25, 0.4) - ease(u, 0.7, 0.85);
      r.arms[1] = arm([2.45 - 0.75 * sip, -2.35 - 2.95 * sip], 1, { fwd: true, high: sip > 0.3 });
      r.tilt = -0.08 * sip;
      r.face.eyes = sip > 0.6 ? 'closed' : 'open';
      r.face.mouth = sip > 0.6 ? 'small' : 'smile';
      r.face.blush = sip > 0.6;
      r.props.push(prop('mug', 1, 0.35, -0.15, -0.55 * sip, u));
      break;
    }
    case 'stretch': {
      const k = ease(u, 0, 0.3) - ease(u, 0.75, 1);
      const side = Math.sin(u * TAU) * k;
      r.lean = 0.14 * side;
      r.pelvis[1] -= 0.08 * k;
      r.chest = 0.2 * k;
      r.arms[0] = arm([-2.3 - 1.25 * k, -1.0 - 6.0 * k], k > 0.5 ? -1 : 1, { high: k > 0.4, grip: 'open' });
      r.arms[1] = arm([2.45 + 1.35 * k, -1.0 - 6.1 * k], 1, { high: k > 0.4, grip: 'open' });
      r.face = { eyes: k > 0.4 ? 'closed' : 'open', look: [0, 0], mouth: k > 0.4 ? 'yawn' : 'smile', brows: 'none', blush: false };
      r.tilt = -0.12 * k;
      break;
    }
    case 'chat': {
      const talking = u < 0.55;
      const a = u * TAU * 2;
      r.arms[1] = arm([2.6 + 0.3 * Math.sin(a), -2.3 - (talking ? 0.6 * Math.max(0, Math.sin(a)) : 0)], 1, { fwd: true, grip: 'open' });
      r.arms[0] = arm([-1.6, -1.75], 1);
      r.face.mouth = talking ? (['open', 'smile', 'o', 'open', 'smile', 'small', 'open', 'smile', 'o'] as Mouth[])[at(16) % 9] : 'smile';
      r.face.eyes = talking ? 'open' : at(16) % 4 < 2 ? 'happy' : 'open';
      r.tilt = talking ? 0 : 0.07 * Math.max(0, Math.sin(a * 1.5));
      break;
    }
    case 'dance': {
      const a = u * TAU;
      const b = Math.abs(Math.sin(a));
      r.pelvis = [STAND[0] + 0.35 * Math.sin(a), STAND[1] + 0.32 * b];
      r.lean = 0.12 * Math.sin(a);
      r.legs[0] = { foot: [FEET[0][0] - 0.2, FEET[0][1] - 0.55 * Math.max(0, Math.sin(a))], ang: 0, bend: -1 };
      r.legs[1] = { foot: [FEET[1][0] + 0.2, FEET[1][1] - 0.55 * Math.max(0, -Math.sin(a))], ang: 0, bend: -1 };
      const p = Math.sin(a) > 0;
      r.arms[0] = p ? arm([-3.15, -6.6], -1, { high: true, grip: 'point' }) : arm([-2.6, -1.6], 1);
      r.arms[1] = p ? arm([2.9, -1.7], 1) : arm([3.1, -6.7], 1, { high: true, grip: 'point' });
      r.face = { eyes: 'happy', look: [0, 0], mouth: at(12) % 6 < 3 ? 'grin' : 'open', brows: 'none', blush: true };
      r.sway = Math.sin(a);
      break;
    }
    case 'pet': {
      const st = Math.sin(u * TAU);
      r.pelvis = [STAND[0] - 0.2, STAND[1] + 1.35];
      r.lean = 0.3;
      r.tilt = 0.12;
      r.legs[0] = { foot: [FEET[0][0] - 0.3, FEET[0][1]], ang: 0, bend: -1 };
      r.legs[1] = { foot: [FEET[1][0] + 0.6, FEET[1][1]], ang: 0, bend: -1 };
      r.arms[1] = arm([3.5 + 0.45 * st, 0.2 - 0.15 * Math.abs(st)], 1, { fwd: true, grip: 'open' });
      r.arms[0] = arm([1.2, -0.6], 1, { fwd: true });
      r.face = { eyes: 'happy', look: [0, 0], mouth: 'smile', brows: 'none', blush: true };
      break;
    }
    case 'highfive': {
      // a hand up and out to meet the other's, a slap at the start of the
      // loop; the other hand out a little
      const slap = bump(u, 0, 0.3);
      r.lean = 0.06 + 0.05 * slap;
      r.arms[1] = arm([4.2 + 0.3 * slap, -6.3 + 0.1 * slap], 1, { fwd: true, high: true, grip: 'open' });
      r.arms[0] = arm([-2.5, -1.5], 1);
      r.face = { eyes: 'happy', look: [0, 0], mouth: 'grin', brows: 'none', blush: true };
      break;
    }
    case 'sip': {
      // both hands round a mug: up to the lips, a slow sip with the eyes
      // shut, and down again
      const k = ease(u, 0.15, 0.4) - ease(u, 0.75, 0.95);
      r.arms[1] = arm([2.2 - 0.45 * k, -2.75 - 2.4 * k], 1, { fwd: true, high: k > 0.5 });
      r.arms[0] = arm([1.45 - 0.3 * k, -2.35 - 2.3 * k], 1, { fwd: true, high: k > 0.5 });
      r.tilt = -0.06 * k;
      r.face.eyes = k > 0.6 ? 'closed' : 'open';
      r.face.mouth = k > 0.6 ? 'small' : 'smile';
      r.face.blush = k > 0.6;
      r.props.push(prop('mug', 1, 0.3, -0.15, -0.4 * k, u));
      break;
    }
    case 'glance': {
      // a look over at the screen, two nods, and back
      const k = ease(u, 0, 0.2) - ease(u, 0.8, 1);
      const nod = Math.max(0, Math.sin(u * TAU * 2)) * k;
      r.face.look = [0.8 * k, 0.1 * k];
      r.tilt = 0.2 * nod;
      r.lean = 0.12 * k;
      r.pelvis[0] += 0.35 * k;
      r.face.mouth = nod > 0.5 ? 'smile' : 'small';
      r.arms[0] = arm([0.9, -2.4], 1, { fwd: true });
      r.arms[1] = arm([2.6, -2.45], 1, { fwd: true });
      break;
    }
    case 'lean': {
      // leaning in at the screen, chin on a hand, and back
      const k = ease(u, 0, 0.3) - ease(u, 0.75, 1);
      r.lean = 0.3 * k;
      r.tilt = 0.1 * k;
      r.pelvis[1] += 0.25 * k;
      r.face.eyes = k > 0.5 ? 'wide' : 'open';
      r.face.brows = 'focus';
      r.face.mouth = 'small';
      r.arms[1] = arm([2.2 + 0.4 * k, -2.4 - 2.2 * k], 1, { fwd: true, high: k > 0.6 });
      r.arms[0] = arm([1.2, -2.3], 1, { fwd: true });
      break;
    }
    case 'scratch': {
      // a hand up to the side of the head, scratching, puzzled
      const k = ease(u, 0, 0.2) - ease(u, 0.75, 1);
      const w = Math.sin(u * TAU * 4) * k;
      r.arms[1] = arm([2.8 + 0.2 * w, -2.4 - 5.4 * k + 0.25 * Math.abs(w)], 1, { high: k > 0.5, grip: 'open' });
      r.tilt = -0.08 * k;
      r.face.eyes = k > 0.3 ? 'up' : 'open';
      r.face.look = [0.3 * k, -0.3 * k];
      r.face.mouth = k > 0.3 ? 'wavy' : 'small';
      r.face.brows = k > 0.3 ? 'worried' : 'none';
      break;
    }
    case 'tap': {
      // arms folded, a foot tapping three times, waiting on something
      const tap = Math.max(0, Math.sin(u * TAU * 3));
      r.legs[1] = { foot: [FEET[1][0] + 0.3, FEET[1][1] - 0.7 * tap], ang: -0.35 * tap, bend: -1 };
      r.arms[0] = arm([1.6, -2.9], 1, { fwd: true });
      r.arms[1] = arm([0.4, -2.75], 1, { fwd: true });
      r.face.mouth = 'flat';
      r.face.look = [0.3, 0];
      r.pelvis[1] -= 0.08 * tap;
      r.chest = 0.06 * tap;
      break;
    }
  }
  // A carried mug in hand B (see MUG_POSES).
  if (c.mug && MUG_POSES.has(pose)) {
    if (pose === 'idle' || pose === 'walk' || pose === 'think') r.arms[1] = arm([2.15, -2.55], 1, { fwd: true });
    r.props.push(prop('mug', 1, 0.35, -0.15, 0, u));
  }
  // A ghost bobs in the air (a whole number of bobs a loop).
  r.hover = r.mode === 'stand' ? 0.45 + 0.22 * Math.sin(u * TAU * Math.max(1, Math.round(per / 1.6))) : 0;
  // Carrying or gesturing on the move: the legs keep walking.
  if (c.walking && pose !== 'walk' && r.mode === 'stand' && pose !== 'place' && pose !== 'pet') {
    const lean = r.lean;
    walkLegs(r, c.walkU);
    r.lean = Math.max(lean, r.lean);
  }
  return r;
}
