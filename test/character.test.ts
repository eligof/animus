import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashString, Rng } from '../src/world/rng.ts';
import { traitsFor, spriteFor, poseFor, SPRITE_W, SPRITE_H } from '../src/world/character.ts';
import type { Pose } from '../src/world/character.ts';
import { isWide } from '../src/term/width.ts';

const POSES: Pose[] = ['idle', 'walk', 'write', 'read', 'think', 'run', 'search', 'web', 'delegate', 'talk', 'done', 'error', 'sleep'];

test('hashString is stable FNV-1a', () => {
  assert.equal(hashString(''), 2166136261);
  assert.equal(hashString('a'), 0xe40c292c);
  assert.notEqual(hashString('agent-1'), hashString('agent-2'));
});

test('Rng is deterministic and in range', () => {
  const a = new Rng(5);
  const b = new Rng(5);
  for (let i = 0; i < 50; i++) {
    const x = a.next();
    assert.equal(x, b.next());
    assert.ok(x >= 0 && x < 1);
  }
  const r = new Rng(9);
  for (let i = 0; i < 100; i++) {
    const n = r.int(3, 6);
    assert.ok(n >= 3 && n <= 6);
  }
  assert.equal(new Rng(1).pick(['only']), 'only');
});

test('traits are deterministic per id', () => {
  assert.deepEqual(traitsFor('abc', 'sub'), traitsFor('abc', 'sub'));
});

test('different ids look different', () => {
  const looks = new Set<string>();
  for (let i = 0; i < 20; i++) {
    const t = traitsFor(`agent-${i}`, 'sub');
    looks.add(`${t.species}/${t.hairStyle}/${t.shirt.join(',')}`);
  }
  assert.ok(looks.size >= 10, `only ${looks.size} looks`);
});

test('accessories follow role and agent type', () => {
  assert.equal(traitsFor('x', 'lead').accessory, 'headset');
  assert.equal(traitsFor('x', 'sub', 'ecc:code-reviewer').accessory, 'glasses');
  assert.equal(traitsFor('x', 'sub', 'Explore').accessory, 'lamp');
  assert.equal(traitsFor('x', 'sub', 'Plan').accessory, 'beret');
  assert.equal(traitsFor('x', 'sub', 'feature-dev:code-architect').accessory, 'beret');
  assert.equal(traitsFor('x', 'sub', 'test-runner').accessory, 'goggles');
  assert.equal(traitsFor('x', 'sub', 'ecc:security-reviewer').accessory, 'hood');
});

test('every pose renders a 5x4 sprite of width-1 glyphs', () => {
  for (let i = 0; i < 12; i++) {
    const tr = traitsFor(`sprite-${i}`, i % 3 === 0 ? 'lead' : 'sub', i % 2 ? 'Explore' : undefined);
    for (const pose of POSES) {
      for (let t = 0; t <= 3; t += 0.3) {
        for (const facing of [1, -1] as const) {
          const sp = spriteFor(tr, pose, t, facing, i);
          assert.equal(sp.cells.length, SPRITE_H);
          for (const row of sp.cells) {
            assert.equal(row.length, SPRITE_W);
            for (const c of row) {
              if (!c) continue;
              assert.equal([...c.ch].length, 1, `${pose} '${c.ch}'`);
              assert.ok(!isWide(c.ch), `${pose} wide '${c.ch}'`);
            }
          }
        }
      }
    }
  }
});

test('walking animates legs', () => {
  const tr = traitsFor('walker', 'sub');
  const a = JSON.stringify(spriteFor(tr, 'walk', 0, 1).cells[3]);
  const b = JSON.stringify(spriteFor(tr, 'walk', 0.15, 1).cells[3]);
  assert.notEqual(a, b);
});

test('celebrating jumps', () => {
  const tr = traitsFor('winner', 'sub');
  const dys = new Set<number>();
  for (let t = 0; t < 2; t += 0.05) dys.add(spriteFor(tr, 'done', t, 1).dy);
  assert.ok(dys.size > 1);
});

test('poseFor maps activities and sleeps when idle long', () => {
  assert.equal(poseFor('write', 0, false), 'write');
  assert.equal(poseFor('write', 0, true), 'walk');
  assert.equal(poseFor('idle', 5, false), 'idle');
  assert.equal(poseFor('idle', 25, false), 'sleep');
  assert.equal(poseFor('done', 0, true), 'done');
});
