import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOP } from '../src/art/figure/rig.ts';
import { ANIM_FPS, framesFor, through } from '../src/art/motion.ts';
import { ACTS, framesOf } from '../src/art/npc/acts.ts';
import { AMBIENT_FPS, CYCLE } from '../src/art/scene.ts';
import { getTheme, themeIds } from '../src/themes/index.ts';
import { workstationOf } from '../src/worlds/workstation.ts';

// Drawn `frames` pictures over `secs` seconds: 15 a second, give or take
// half a picture over the loop.
const fifteen = (what: string, frames: number, secs: number) =>
  assert.ok(Math.abs(frames - secs * ANIM_FPS) <= 0.5, `${what}: ${frames} pictures over ${secs} s`);

test('what moves in place is drawn 15 times a second, which divides 30 and 60 frames a second evenly', () => {
  assert.equal(ANIM_FPS, 15);
  assert.equal(30 % ANIM_FPS, 0);
  assert.equal(60 % ANIM_FPS, 0);
  for (const secs of [0.4, 0.5, 1, 1.6, 3.2]) fifteen(`${secs} s`, framesFor(secs), secs);
});

test("every pose, shared act, local's loop and desk loop is drawn 15 times a second", () => {
  for (const [pose, [secs, frames]] of Object.entries(LOOP)) fifteen(pose, frames, secs);
  for (const [act, lp] of Object.entries(ACTS)) fifteen(act, framesOf(lp), lp.secs);
  for (const id of themeIds()) {
    const w = getTheme(id)!;
    for (const n of w.npcs ?? []) for (const [name, lp] of [['work', n.work], ['show', n.show], ['celebrate', n.celebrate]] as const) if (lp) fifteen(`${id} ${n.name} ${name}`, framesOf(lp), lp.secs);
    for (const lp of workstationOf(w).loops ?? []) fifteen(`${id} ${lp.name}`, framesFor(lp.secs), lp.secs);
  }
});

test('props, steam and the room move 15 times a second; a worked station goes round in two seconds', () => {
  assert.equal(AMBIENT_FPS, ANIM_FPS);
  assert.equal(CYCLE / AMBIENT_FPS, 2);
});

test('a loop through a table of keys meets each key on its step and goes smoothly between, round the end too', () => {
  const keys = [1, 0.35, -0.9, -0.1];
  keys.forEach((k, j) => assert.ok(Math.abs(through(keys, j / 4) - k) < 1e-12, `key ${j}`));
  assert.ok(Math.abs(through(keys, 1) - keys[0]) < 1e-12, 'round the end');
  // no jumps: a step of 1/240 round the loop moves it a little
  for (let i = 0; i < 240; i++) assert.ok(Math.abs(through(keys, (i + 1) / 240) - through(keys, i / 240)) < 0.1, `a jump at ${i}/240`);
});
