import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Vitals } from '../src/agents.ts';
import { meters } from '../src/pet/meters.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const vitals = (o: Partial<Vitals> = {}): Vitals => ({
  model: 'claude-opus-5-5', window: 200_000, context: 0, outTokens: 0, errors: [], streak: 0, turnEndedAt: 0, busySince: NOW, lastAt: NOW, midTool: false, title: '', branch: '', ...o,
});
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('context is the context used over the window, critical from 90%', () => {
  near(meters(vitals({ context: 50_000 }), NOW).context.value, 0.25);
  assert.equal(meters(vitals({ context: 179_000 }), NOW).context.critical, false);
  assert.equal(meters(vitals({ context: 180_000 }), NOW).context.critical, true);
  near(meters(vitals({ context: 900_000 }), NOW).context.value, 1);
});

test('energy drains over 45 minutes of work and is full after two quiet minutes once the turn ended', () => {
  near(meters(vitals({ busySince: NOW, lastAt: NOW }), NOW).energy.value, 1);
  near(meters(vitals({ busySince: NOW - 9 * MIN, lastAt: NOW }), NOW).energy.value, 0.8);
  const tired = meters(vitals({ busySince: NOW - 40 * MIN, lastAt: NOW }), NOW).energy;
  assert.ok(tired.value < 0.15 && tired.critical);
  near(meters(vitals({ busySince: NOW - 40 * MIN, lastAt: NOW - 2 * MIN, turnEndedAt: NOW - 2 * MIN }), NOW).energy.value, 1);
});

test('a long tool run keeps draining energy; a wait after the turn restores it', () => {
  // Ten quiet minutes in a tool call (or a subagent): still at work.
  near(meters(vitals({ busySince: NOW - 18 * MIN, lastAt: NOW - 10 * MIN, midTool: true }), NOW).energy.value, 0.6);
  // Three minutes quiet after the turn stopped (however it did): rested.
  near(meters(vitals({ busySince: NOW - 18 * MIN, lastAt: NOW - 3 * MIN }), NOW).energy.value, 1);
  near(meters(vitals({ busySince: NOW - 18 * MIN, lastAt: NOW - 3 * MIN, turnEndedAt: NOW - 3 * MIN }), NOW).energy.value, 1);
  // One minute is not long enough.
  near(meters(vitals({ busySince: NOW - 18 * MIN, lastAt: NOW - MIN }), NOW).energy.value, 0.6);
});

test('each recent failure hurts, and the hurt heals over ten minutes', () => {
  near(meters(vitals(), NOW).health.value, 1);
  near(meters(vitals({ errors: [NOW] }), NOW).health.value, 0.75);
  near(meters(vitals({ errors: [NOW - 5 * MIN] }), NOW).health.value, 0.875);
  const hurt = meters(vitals({ errors: [NOW, NOW, NOW] }), NOW).health;
  assert.ok(hurt.value <= 0.3 && hurt.critical);
  near(meters(vitals({ errors: [NOW - 11 * MIN] }), NOW).health.value, 1);
});

test('mood rises with the streak and after a finished turn', () => {
  near(meters(vitals({ streak: 0 }), NOW).mood.value, 0.3);
  near(meters(vitals({ streak: 4 }), NOW).mood.value, 0.5);
  near(meters(vitals({ streak: 0, turnEndedAt: NOW }), NOW).mood.value, 0.5);
  near(meters(vitals({ streak: 30 }), NOW).mood.value, 1);
  assert.equal(meters(vitals({ streak: 7 }), NOW).streak, 7);
  assert.equal(meters(vitals(), NOW).mood.critical, false);
});

test('a fresh agent with no working stretch yet is rested', () => {
  const e = meters(vitals({ busySince: 0, lastAt: NOW }), NOW).energy;
  near(e.value, 1);
  assert.equal(e.critical, false);
});

test('a corrupt number never yields NaN', () => {
  const m = meters(vitals({ context: NaN }), NOW);
  assert.equal(m.context.value, 0);
  assert.equal(m.context.critical, false);
});

test('the lift of a finished turn fades over five minutes', () => {
  near(meters(vitals({ streak: 0, turnEndedAt: NOW - 2.5 * MIN }), NOW).mood.value, 0.4);
  near(meters(vitals({ streak: 0, turnEndedAt: NOW - 5 * MIN }), NOW).mood.value, 0.3);
});
