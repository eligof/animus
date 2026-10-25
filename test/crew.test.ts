import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Gain } from '../src/agents.ts';
import { Crews, MAX_CREWS, MAX_MARKS, MAX_ROLES, POINTS, UNLOCKS, crewKey, levelOf, roleOf, table, unlocks, xpFor } from '../src/pet/crew.ts';
import type { CrewBook, RoleRec } from '../src/pet/crew.ts';
import { crewsText, parseCrews } from '../src/pet/store.ts';

test('levels come at 100, 250, 500 and 1000 XP, then at each doubling', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(xpFor), [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000]);
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(99), 1);
  assert.equal(levelOf(100), 2);
  assert.equal(levelOf(249), 2);
  assert.equal(levelOf(250), 3);
  assert.equal(levelOf(999), 4);
  assert.equal(levelOf(1000), 5);
  assert.equal(levelOf(31_999), 9);
  assert.equal(levelOf(32_000), 10);
  assert.equal(levelOf(1e300), 99, 'capped');
});

test('a finished turn is worth 10, a passing build or test 5, a finished subagent 3', () => {
  assert.deepEqual(POINTS, { turn: 10, check: 5, subagent: 3 });
});

test('unlocks: a hat at 2, a badge at 3, the desk at 5, the outfit at 8, the aura at 10', () => {
  assert.deepEqual(UNLOCKS, [['hat', 2], ['badge', 3], ['desk', 5], ['outfit', 8], ['aura', 10]]);
  assert.deepEqual(unlocks(1), { hat: false, badge: false, desk: false, outfit: false, aura: false });
  assert.deepEqual(unlocks(2), { hat: true, badge: false, desk: false, outfit: false, aura: false });
  assert.deepEqual(unlocks(4), { hat: true, badge: true, desk: false, outfit: false, aura: false });
  assert.deepEqual(unlocks(7), { hat: true, badge: true, desk: true, outfit: false, aura: false });
  assert.deepEqual(unlocks(9), { hat: true, badge: true, desk: true, outfit: true, aura: false });
  assert.deepEqual(unlocks(12), { hat: true, badge: true, desk: true, outfit: true, aura: true });
});

test('agents are kept by role: the lead, or the subagent type', () => {
  assert.equal(roleOf({ role: 'lead', agentType: 'Explore' }), 'lead');
  assert.equal(roleOf({ role: 'sub', agentType: 'Explore' }), 'Explore');
  assert.equal(roleOf({ role: 'sub' }), 'general-purpose');
  assert.equal(roleOf({ role: 'sub', agentType: 'x'.repeat(100) }).length, 64);
});

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
// The book's tables have no prototype; compared by what they hold.
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const gain = (o: Partial<Gain> = {}): Gain => ({ agent: 'S1', at: T0, key: 'k', crew: '/home/u/rocket', role: 'lead', kind: 'turn', ...o });

test('each kind of gain counts its points to its role', () => {
  const c = new Crews();
  assert.equal(c.count(gain({ key: 'a', kind: 'turn' }))?.xp, 10);
  assert.equal(c.count(gain({ key: 'b', kind: 'check' }))?.xp, 15);
  assert.equal(c.count(gain({ agent: 'sub1', key: 'finish', role: 'Explore', kind: 'subagent' }))?.xp, 3);
  assert.equal(c.xp('/home/u/rocket', 'lead'), 15);
  assert.equal(c.xp('/home/u/rocket', 'Explore'), 3);
  assert.equal(c.xp('/home/u/other', 'lead'), 0, 'another project, another crew');
});

test('the same events read again are not counted again, nor anything older', () => {
  const c = new Crews();
  const events = [gain({ at: T0, key: 'a' }), gain({ at: T0 + 1000, key: 'b', kind: 'check' }), gain({ at: T0 + 1000, key: 'c', kind: 'check' })];
  for (const g of events) assert.ok(c.count(g));
  // The transcript read again from its tail (its session came back).
  for (const g of events) assert.equal(c.count(g), null);
  assert.equal(c.count(gain({ at: T0 + 500, key: 'z' })), null, 'older than the last counted');
  assert.equal(c.xp('/home/u/rocket', 'lead'), 20);
  // Another agent of the same role counts on its own.
  assert.equal(c.count(gain({ agent: 'S2', at: T0 + 500, key: 'a' }))?.xp, 30);
});

test('after a restart only events newer than the role last earned are counted', () => {
  const before = new Crews();
  before.count(gain({ at: T0, key: 'a' }));
  before.count(gain({ at: T0 + 1000, key: 'b' }));
  // Saved and read back as crews.json holds it.
  const after = new Crews(parseCrews(crewsText(before.data()))!);
  // The tail is read again, with one turn finished while animus was off.
  assert.equal(after.count(gain({ at: T0, key: 'a' })), null);
  assert.equal(after.count(gain({ at: T0 + 1000, key: 'b' })), null);
  assert.equal(after.count(gain({ agent: 'S2', at: T0 + 900, key: 'q' })), null, 'any agent of that role');
  assert.equal(after.count(gain({ at: T0 + 5000, key: 'c' }))?.xp, 30);
  assert.equal(after.xp('/home/u/rocket', 'lead'), 30);
});

test('a gain that crosses a threshold says so', () => {
  const c = new Crews();
  c.give('/home/u/rocket', 'lead', 95);
  const a = c.count(gain())!;
  assert.deepEqual(a, { crew: '/home/u/rocket', role: 'lead', xp: 105, level: 2, was: 1, at: T0 });
  assert.equal(c.count(gain({ at: T0 + 1, key: 'n' }))!.was, 2);
  assert.equal(c.level('/home/u/rocket', 'lead'), 2);
});

test('the book keeps a hash of the project path, XP and the time last earned, nothing else', () => {
  const c = new Crews();
  c.count(gain({ at: T0 + 7 }));
  assert.match(crewKey('/home/u/rocket'), /^[0-9a-f]{16}$/);
  assert.deepEqual(plain(c.data()), { [crewKey('/home/u/rocket')]: { lead: { xp: 10, seen: T0 + 7 } } });
  assert.ok(!JSON.stringify(c.data()).includes('rocket'));
});

test('unknown kinds, untimed events and roles past the cap earn nothing; old crews make room', () => {
  const c = new Crews();
  assert.equal(c.count(gain({ kind: 'nap' as Gain['kind'] })), null);
  assert.equal(c.count(gain({ at: NaN })), null);
  for (let i = 0; i < MAX_ROLES; i++) assert.ok(c.count(gain({ role: `t${i}`, agent: `a${i}` })));
  assert.equal(c.count(gain({ role: 'one-more', agent: 'z' })), null);
  const d = new Crews();
  for (let i = 0; i < MAX_CREWS + 3; i++) d.count(gain({ crew: `/p/${i}`, agent: `a${i}`, at: T0 + i }));
  assert.equal(Object.keys(d.data()).length, MAX_CREWS);
  assert.equal(d.xp('/p/0', 'lead'), 0, 'the least recently seen went');
  assert.equal(d.xp(`/p/${MAX_CREWS + 2}`, 'lead'), 10);
});

test('a role or kind named like an object property is just a name: __proto__, constructor, toString', () => {
  const c = new Crews();
  for (const [i, role] of ['__proto__', 'constructor', 'toString'].entries()) {
    assert.equal(c.count(gain({ role, agent: `a${i}` }))?.xp, 10, role);
    assert.equal(c.count(gain({ role, agent: `a${i}`, at: T0 + 1, key: 'n' }))?.xp, 20, role);
    assert.equal(c.xp('/home/u/rocket', role), 20, role);
  }
  assert.equal(c.xp('/home/u/rocket', 'valueOf'), 0, 'never earned');
  c.give('/home/u/rocket', 'hasOwnProperty', 50);
  assert.equal(c.xp('/home/u/rocket', 'hasOwnProperty'), 50);
  for (const kind of ['constructor', 'toString', '__proto__']) assert.equal(c.count(gain({ kind: kind as Gain['kind'], at: T0 + 5, key: kind })), null, kind);
  const o: Record<string, unknown> = {};
  assert.equal(o.xp, undefined, 'nothing leaks onto every object');
  assert.equal(o.seen, undefined);
});

test('a time with a fraction of a millisecond (a file\'s mtime) is not counted again after a restart', () => {
  const before = new Crews();
  assert.ok(before.count(gain({ at: T0 + 0.25, key: 'a' })));
  const after = new Crews(parseCrews(crewsText(before.data()))!);
  assert.equal(after.count(gain({ at: T0 + 0.25, key: 'a' })), null);
  assert.equal(after.count(gain({ agent: 'S2', at: T0 + 0.75, key: 'q' })), null, 'nor one in the same millisecond');
  assert.equal(after.count(gain({ at: T0 + 1.5, key: 'b' }))?.xp, 20);
});

test('a time a date cannot hold, or none at all, earns nothing (and the book still saves)', () => {
  const c = new Crews();
  for (const at of [8.64e15 + 1, 1e300, Infinity, -Infinity, 0, -1000]) assert.equal(c.count(gain({ at, key: `k${at}` })), null, String(at));
  assert.ok(c.count(gain({ at: 8.64e15, key: 'last' })), 'the last time a date holds');
  assert.doesNotThrow(() => crewsText(c.data()));
});

test('an agent forgotten among thousands of others still never counts an event twice', () => {
  const c = new Crews();
  assert.ok(c.count(gain({ agent: 'A', at: T0, key: 'a' })));
  for (let i = 0; i < MAX_MARKS; i++) assert.ok(c.count(gain({ agent: `o${i}`, crew: '/home/u/other', at: T0 + 1 + i, key: 'x' })));
  // A's transcript is read again, long after its mark made way for the others'.
  assert.equal(c.count(gain({ agent: 'A', at: T0, key: 'a' })), null);
  assert.equal(c.xp('/home/u/rocket', 'lead'), 10);
  assert.equal(c.count(gain({ agent: 'A', at: T0 + 1, key: 'b' }))?.xp, 20, 'anything newer still counts');
});

test('making room among crews with many roles each does not run out of stack', () => {
  const book: CrewBook = table();
  for (let i = 0; i < MAX_CREWS; i++) book[crewKey(`/p/${i}`)] = { lead: { xp: 1, seen: T0 + i } };
  const big = table<RoleRec>();
  for (let j = 0; j < 150_000; j++) big[`r${j}`] = { xp: 1, seen: T0 - 1 };
  book[crewKey('/p/0')] = big;
  const c = new Crews(book);
  assert.ok(c.count(gain({ crew: '/p/new', at: T0 + 1e6 })));
  assert.equal(c.xp('/p/0', 'r0'), 0, 'the least recently seen went');
  assert.equal(c.xp('/p/1', 'lead'), 1);
});
