import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTheme } from '../src/themes/index.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import { clutterOf, workstationOf } from '../src/worlds/workstation.ts';
import { dressed } from './desk-fakes.ts';

// What stands on each place's desk: a few of its world's things, picked by
// the world and the place.

const cafe = getTheme('cafe')!;
const pick = (w: WorldDef, place: number) => clutterOf(w, place).map((c) => `${c.item.name}@${c.spot}`).sort().join();

test("a place's clutter: 2 to 4 things on as many spots, the same every time, far to near", () => {
  const w = dressed(cafe);
  const spots = workstationOf(w).clutter!.spots;
  for (let place = 0; place < 20; place++) {
    const a = clutterOf(w, place);
    assert.ok(a.length >= 2 && a.length <= 4, `place ${place}: ${a.length} things`);
    assert.equal(new Set(a.map((c) => c.item.name)).size, a.length, `place ${place}: a thing twice`);
    assert.equal(new Set(a.map((c) => c.spot)).size, a.length, `place ${place}: two on one spot`);
    for (const c of a) assert.deepEqual(c.at, spots[c.spot]);
    for (let k = 1; k < a.length; k++) assert.ok(a[k - 1].at[0] + a[k - 1].at[1] <= a[k].at[0] + a[k].at[1], `place ${place}: not far to near`);
    assert.equal(pick(w, place), pick(w, place), `place ${place}: another pick the second time`);
  }
});

test("among a world's first twelve places at least eight have picks of their own; another world picks apart", () => {
  const picks = Array.from({ length: 12 }, (_, p) => pick(dressed(cafe), p));
  assert.ok(new Set(picks).size >= 8, `${new Set(picks).size} picks of 12`);
  const other = Array.from({ length: 12 }, (_, p) => pick(dressed(cafe, 'elsewhere'), p));
  assert.ok(other.some((q, p) => q !== picks[p]), 'another world picks the same');
});

test('a world with no clutter puts none on its desks', () => {
  assert.deepEqual(clutterOf({ ...cafe, workstation: { ...workstationOf(cafe), clutter: { items: [], spots: [] } } }, 3), []);
});
