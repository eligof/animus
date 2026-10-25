import type { Vitals } from '../agents.ts';
import { rested } from '../agents.ts';
import type { Feel } from '../world/character.ts';

// An agent's vitals as a pet's needs, each 0..1 with a critical flag:
//   context how full its context window is (full: time to compact)
//   energy  drains over a long working stretch, full after a short rest
//           (quiet once the turn stopped; a long tool run is work)
//   health  each recent failure hurts; the hurt heals over ten minutes
//   mood    a run of good tool calls, and a lift when a turn finishes

export type Meter = { value: number; critical: boolean };
export type Meters = { context: Meter; energy: Meter; health: Meter; mood: Meter; streak: number };

const WORK_SPAN = 45 * 60_000; // working this long without a rest: empty
const HEAL_SPAN = 600_000;
const HIT = 0.25; // what one fresh failure costs
const LIFT = 0.2; // a finished turn's lift, fading over LIFT_SPAN
const LIFT_SPAN = 300_000;

const clamp = (v: number) => (!Number.isFinite(v) || v < 0 ? 0 : v > 1 ? 1 : v);

export function meters(v: Vitals, now: number): Meters {
  const context = clamp(v.window > 0 ? v.context / v.window : 0);
  const energy = rested(v, now) ? 1 : clamp(1 - (now - v.busySince) / WORK_SPAN);
  let hurt = 0;
  for (const t of v.errors) {
    const age = now - t;
    if (age >= 0 && age < HEAL_SPAN) hurt += HIT * (1 - age / HEAL_SPAN);
  }
  const health = clamp(1 - hurt);
  const since = now - v.turnEndedAt;
  const lift = v.turnEndedAt && since >= 0 && since < LIFT_SPAN ? LIFT * (1 - since / LIFT_SPAN) : 0;
  const mood = clamp(0.3 + 0.05 * v.streak + lift);
  return {
    context: { value: context, critical: context >= 0.9 },
    energy: { value: energy, critical: energy <= 0.15 },
    health: { value: health, critical: health <= 0.3 },
    mood: { value: mood, critical: false },
    streak: v.streak,
  };
}

// A mood this high shows: a grin and a bigger bounce.
export const BOUNCY = 0.8;

// How its figure shows the meters: drowsy eyes when its energy is
// critical, a bandage when its health is, a bounce when its mood is high.
export function feelOf(m: Meters): Feel {
  return { drowsy: m.energy.critical, bandaged: m.health.critical, bouncy: m.mood.value >= BOUNCY };
}
