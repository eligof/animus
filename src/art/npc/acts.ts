import type { Npc, NpcAct, NpcLoop, Puppet, Swing } from '../../worlds/types.ts';
import { framesFor } from '../motion.ts';

// The acts every local shares (see Npc in worlds/types.ts): a wave, a
// cheer, a flinch, applause, a word, a nod, handing over what it serves
// and beckoning someone over. Each drives the same puppet for every local
// with nothing drawn of its own, and starts and ends at rest (its first
// and last frames: see puppetOf), so it slots in between frames of the
// local's work. Arm 0 is the near one (it hands things over), arm 1 the
// far one, on the side the local faces (it waves and beckons). A local's
// head is wider than its shoulders and its arms are short: a hand raised
// straight up covers its face, so raised hands go out to the sides, the
// near one up behind, the far one up in front.

export const TAU = Math.PI * 2;
export type SharedAct = Exclude<NpcAct, 'work' | 'show' | 'celebrate'>;

// Arms hanging easy, a soft bend at the elbow (shared by every puppet at
// rest: a Swing is never changed); and an arm swung on from there, `sh` at
// the shoulder and `el` at the elbow.
export const HANG: Swing = Object.freeze({ sh: 0.12, el: 0.2 });
export const swing = (sh: number, el: number): Swing => ({ sh: HANG.sh + sh, el: HANG.el + el });
const TALK: ReadonlyArray<Puppet['mouth']> = ['open', 'smile', 'o', 'open', 'closed'];

// A local at rest: standing easy, eyes open, a small smile.
export function rest(): Puppet {
  return { act: 'work', u: 0, bob: 0, lean: 0, tilt: 0, arms: [HANG, HANG], eyes: 'open', mouth: 'smile', hold: false };
}

// Smoothstep from a to b.
export function ease(u: number, a: number, b: number): number {
  const k = Math.max(0, Math.min(1, (u - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

// In and out: 0 at either end of the loop, 1 from a to b.
export function env(u: number, a = 0.2, b = 0.8): number {
  return ease(u, 0, a) - ease(u, b, 1);
}

// 0..1..0 over [a, b] of the loop.
export function bump(u: number, a: number, b: number): number {
  return u <= a || u >= b ? 0 : Math.sin(((u - a) / (b - a)) * Math.PI);
}

export const ACTS: Readonly<Record<SharedAct, NpcLoop>> = {
  // the far hand up in front of it, waving beside its head
  wave: {
    secs: 1.2,
    pose(u) {
      const k = env(u, 0.2, 0.85);
      return { ...rest(), tilt: -0.04 * k, arms: [HANG, swing(1.65 * k, k * (0.55 + 0.3 * Math.sin(u * TAU * 3)))], eyes: k > 0.5 ? 'happy' : 'open' };
    },
  },
  // both hands up and out to the sides, a pump of the fists and a little
  // hop
  cheer: {
    secs: 1.2,
    pose(u) {
      const k = env(u, 0.2, 0.8);
      const pump = 0.2 * bump(u, 0.25, 0.75);
      return { ...rest(), bob: 0.6 * bump(u, 0.25, 0.75), tilt: -0.08 * k, arms: [swing(-1.85 * k, -(1.05 + pump) * k), swing(1.65 * k, (0.65 + pump) * k)], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 ? 'open' : 'smile' };
    },
  },
  // a start: back, hands up by the face, eyes shut
  flinch: {
    secs: 0.8,
    pose(u) {
      const k = env(u, 0.15, 0.7);
      return { ...rest(), bob: -0.3 * k, lean: -0.22 * k, tilt: 0.08 * k, arms: [swing(1.9 * k, 1.7 * k), swing(1.7 * k, 1.8 * k)], eyes: k > 0.3 ? 'shut' : 'open', mouth: k > 0.3 ? 'o' : 'smile' };
    },
  },
  // hands out in front at the chest, under the chin, clapping
  applaud: {
    secs: 1.6,
    pose(u) {
      const k = env(u, 0.15, 0.85);
      const clap = 0.5 + 0.5 * Math.sin(u * TAU * 4);
      return { ...rest(), tilt: 0.04 * k, arms: [swing(0.9 * k, k * (0.35 + 0.35 * clap)), swing(0.75 * k, k * (0.75 + 0.35 * clap))], eyes: k > 0.4 ? 'happy' : 'open', mouth: k > 0.4 && clap > 0.5 ? 'open' : 'smile' };
    },
  },
  // a word: the far hand turning it over, the mouth going
  talk: {
    secs: 1.6,
    pose(u) {
      const k = env(u, 0.15, 0.85);
      return { ...rest(), tilt: 0.06 * Math.sin(u * TAU * 2) * k, arms: [HANG, swing((0.7 + 0.35 * Math.sin(u * TAU * 2)) * k, 0.9 * k)], mouth: k > 0.15 ? TALK[Math.floor(u * 10) % TALK.length] : 'smile' };
    },
  },
  // two nods, eyes smiling
  nod: {
    secs: 1.0,
    pose(u) {
      const n = Math.sin(u * TAU) ** 2;
      return { ...rest(), tilt: 0.2 * n, eyes: n > 0.5 ? 'happy' : 'open' };
    },
  },
  // the near hand out at the chest, the forearm level, with what it serves
  // standing in it (see Npc.serve) under the chin
  handOver: {
    secs: 1.6,
    pose(u) {
      const k = env(u, 0.25, 0.75);
      return { ...rest(), lean: 0.08 * k, tilt: 0.06 * k, arms: [swing(0.85 * k, 0.55 * k), HANG], eyes: k > 0.6 ? 'happy' : 'open', hold: k > 0.5 };
    },
  },
  // the far hand out, curling: come over
  beckon: {
    secs: 1.4,
    pose(u) {
      const k = env(u, 0.15, 0.85);
      return { ...rest(), tilt: -0.06 * k, arms: [HANG, swing(1.6 * k, k * (0.5 + 0.8 * Math.max(0, Math.sin(u * TAU * 3))))] };
    },
  },
};

// The loop local n plays for `act`: its own (its work, its show, its way
// of cheering, or the shared cheer for one that has none) or the shared
// one.
export function loopOf(n: Npc, act: NpcAct): NpcLoop {
  if (act === 'work') return n.work;
  if (act === 'show') return n.show ?? n.work;
  if (act === 'celebrate') return n.celebrate ?? ACTS.cheer;
  return ACTS[act];
}

// Whether `act` plays once (everything but work and a show, which go
// round).
export const once = (act: NpcAct): boolean => act !== 'work' && act !== 'show';

// Whether `act` is one of a local's own (its work, its show, its
// celebration), not a shared one: only then do its hands hold its tools
// (see NpcParts in worlds/types.ts).
export const own = (act: NpcAct): boolean => act === 'work' || act === 'show' || act === 'celebrate';

// The pictures loop lp is drawn in (see ANIM_FPS in art/motion.ts).
export const framesOf = (lp: NpcLoop): number => framesFor(lp.secs);

// How far into `act` frame `frame` of its loop lp is: round a loop, frame i
// at i / frames; played once, i / (frames - 1), so its last frame is its
// end and it is seen back at rest.
function uOf(act: NpcAct, lp: NpcLoop, frame: number): number {
  const n = framesOf(lp);
  return once(act) ? frame / (n - 1) : frame / n;
}

// Local n's puppet in frame `frame` of `act`, named for the loop it plays:
// a celebration with none of its own is the shared cheer, empty-handed.
export function puppetOf(n: Npc, act: NpcAct, frame: number): Puppet {
  const lp = loopOf(n, act);
  const u = uOf(act, lp, frame);
  return { ...lp.pose(u), act: act === 'celebrate' && !n.celebrate ? 'cheer' : act, u };
}
