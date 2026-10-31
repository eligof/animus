import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, AgentInfo } from '../src/agents.ts';
import { ACTS, framesOf, puppetOf, rest } from '../src/art/npc/acts.ts';
import { hub } from '../src/world/layout.ts';
import { NPC_R } from '../src/world/npc-place.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Layout } from '../src/world/types.ts';
import { mines } from '../src/worlds/mines.ts';
import type { NpcAct, WorldDef } from '../src/worlds/types.ts';
import { standIn, standers, trio, withLocals } from './npc-fakes.ts';

// The locals on stage: at their stations at work, their stations worked
// (never the way in), each to its own rhythm; the acts life gives them (a
// wave for a newcomer, first from the local by the door; a cheer for a
// finish, a flinch at a bang, applause for a level-up), one after another,
// each seen through to its end; n turns them off and on; a standing one is
// kept clear.

const NOW = 1_700_000_000_000;
// A roomy scene: a room about 107 across.
const RECT = { x: 0, y: 1, w: 120, h: 33 };

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});
// Waiting, but only just: awake however long the test runs.
const awake = (id: string, now: number, extra: Partial<AgentInfo> = {}) => agent(id, 'idle', { since: now - 3000, ...extra });

// The mines with fixed spots round the hub (as the life tests have them),
// and three stand-in locals.
const lively: WorldDef = {
  ...mines,
  pois: (L: Layout) => {
    const h = hub(L);
    return [
      { x: Math.round(h.x - 9), y: Math.round(h.y + 3), kind: 'seat', face: h },
      { x: Math.round(h.x + 4), y: Math.round(h.y - 9), kind: 'drink', face: h },
      { x: Math.round(h.x + 2), y: Math.round(h.y + 2), kind: 'dance' },
      { x: Math.round(h.x - 6), y: Math.round(h.y - 8), kind: 'view', face: { x: L.T, y: L.T } },
      { x: Math.round(h.x + 9), y: Math.round(h.y + 9), kind: 'pet' },
    ];
  },
};
const world = trio(lively);

function newStage(w: WorldDef = world, r = RECT): Stage {
  const stage = new Stage(w);
  stage.layout(r);
  return stage;
}

function run(stage: Stage, crew: (now: number) => AgentInfo[], seconds: number, start = NOW, each?: (now: number) => void): number {
  let now = start;
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    stage.sync(crew(now), now);
    stage.update(0.05, now);
    each?.(now);
  }
  return now;
}

const byId = (stage: Stage, id: string): Actor => stage.actors().find((a) => a.info.id === id)!;
// What each local did over a run, by k.
function acts(stage: Stage, crew: (now: number) => AgentInfo[], seconds: number, start: number): { now: number; seen: Map<number, Set<NpcAct>> } {
  const seen = new Map<number, Set<NpcAct>>();
  const now = run(stage, crew, seconds, start, (t) => {
    for (const n of stage.frame(t)!.npcs!) seen.set(n.k, (seen.get(n.k) ?? new Set()).add(n.act));
  });
  return { now, seen };
}

test('the locals stand at their stations at work, the stations worked, each to its own rhythm', () => {
  const stage = newStage();
  let now = run(stage, () => [], 1);
  const f = stage.frame(now)!;
  assert.equal(f.npcs!.length, 3);
  for (const n of f.npcs!) {
    const p = stage.room()!.npcs.find((q) => q.k === n.k)!;
    assert.deepEqual([n.x, n.y, n.z, n.prop, n.facing], [p.x, p.y, p.z, p.prop, p.facing]);
    assert.equal(n.act, 'work');
    assert.equal(n.top, p.z + world.npcs![n.k].tall);
    assert.equal(n.works && f.active[n.prop], true, `${world.npcs![n.k].name}'s station is not worked`);
  }
  const frames = new Map<number, Set<number>>();
  let together = 0;
  let all = 0;
  now = run(stage, () => [], 2, now, (t) => {
    const g = stage.frame(t)!.npcs!;
    for (const n of g) frames.set(n.k, (frames.get(n.k) ?? new Set()).add(n.frame));
    all++;
    if (g.every((n) => n.frame === g[0].frame)) together++;
  });
  for (const [k, s] of frames) assert.equal(s.size, framesOf(world.npcs![k].work), `${world.npcs![k].name} skipped frames of its work`);
  assert.ok(together < all / 2, 'the locals work in step');
});

test('someone walks in: the local nearest the door waves', () => {
  const stage = newStage();
  const now = run(stage, (n) => [awake('a', n)], 4);
  const door = stage.stations().find((s) => s.kind === 'entrance')!.spot;
  const far = (p: { x: number; y: number }) => Math.hypot(p.x - door.x, p.y - door.y);
  const first = stage.room()!.npcs.reduce((m, p) => (far(p) < far(m) ? p : m));
  const { seen } = acts(stage, (n) => [awake('a', n), awake('b', n)], 2, now);
  assert.ok(seen.get(first.k)!.has('wave'), `the local by the door: ${[...seen.get(first.k)!].join(', ')}`);
});

test('a finish: every local cheers, its own way where it has one; a bang: those near flinch; a level-up: they applaud', () => {
  const stage = newStage();
  const now = run(stage, () => [agent('w', 'write')], 8);
  let r = acts(stage, () => [agent('w', 'done', { since: now })], 2, now);
  for (const [k, s] of r.seen) assert.ok(s.has(world.npcs![k].celebrate ? 'celebrate' : 'cheer'), `${world.npcs![k].name} did not celebrate: ${[...s].join(', ')}`);
  const broke = r.now;
  r = acts(stage, () => [agent('w', 'error', { since: broke })], 2, r.now);
  const bang = byId(stage, 'w').error!;
  for (const p of stage.room()!.npcs) {
    const near = Math.hypot(p.x - bang.x, p.y - bang.y) <= 40;
    assert.equal(r.seen.get(p.k)!.has('flinch'), near, `${world.npcs![p.k].name} ${near ? 'did not flinch' : 'flinched from afar'}`);
  }
  stage.levelUp('w', 3);
  const back = r.now;
  r = acts(stage, () => [agent('w', 'write', { since: back })], 2.5, r.now);
  for (const [k, s] of r.seen) assert.ok(s.has('applaud'), `${world.npcs![k].name} did not applaud`);
});

test('acts come one after another: one lined up waits for the one under way, never cut off', () => {
  const stage = newStage();
  const now = run(stage, () => [agent('w', 'write')], 4);
  const L = stage.life.locals!;
  const clerk = L.all.find((l) => l.art.name === 'clerk')!;
  L.applaud(stage.life.clock);
  L.celebrate(stage.life.clock);
  const seq: NpcAct[] = [];
  run(stage, () => [agent('w', 'write')], 5, now, (t) => {
    const act = stage.frame(t)!.npcs!.find((n) => n.k === clerk.k)!.act;
    if (act !== seq[seq.length - 1]) seq.push(act);
  });
  assert.deepEqual(seq.filter((a) => a !== 'work'), ['applaud', 'cheer'], `in turn: ${seq.join(', ')}`);
});

test('an act played once is seen through to its last frame, back at rest', () => {
  const stage = newStage();
  const now = run(stage, () => [agent('w', 'write')], 6);
  const L = stage.life.locals!;
  const clerk = L.all.find((l) => l.art.name === 'clerk')!;
  L.applaud(stage.life.clock);
  const seen: number[] = [];
  run(stage, () => [agent('w', 'write')], 3, now, (t) => {
    const n = stage.frame(t)!.npcs!.find((q) => q.k === clerk.k)!;
    if (n.act === 'applaud') seen.push(n.frame);
  });
  const last = Math.max(...seen);
  assert.equal(last, framesOf(ACTS.applaud) - 1, 'its last frame never shown');
  const p = puppetOf(clerk.art, 'applaud', last);
  const r = rest();
  const off = Math.abs(p.bob - r.bob) + Math.abs(p.lean - r.lean) + Math.abs(p.tilt - r.tilt) + p.arms.reduce((n, a, k) => n + Math.abs(a.sh - r.arms[k].sh) + Math.abs(a.el - r.arms[k].el), 0);
  assert.ok(off < 1e-9 && p.eyes === r.eyes && p.mouth === r.mouth && !p.hold, `its last frame ${off.toFixed(2)} off rest`);
});

test('a local at the way in never works it: its door opens only for those who pass, and it is first to greet a newcomer', () => {
  const porter = standIn('porter', 'entrance', { mode: 'behind', u: 12, v: 1, top: 3, edge: 2 });
  const w = withLocals(lively, [...world.npcs!, porter]);
  const stage = newStage(w);
  const now = run(stage, () => [agent('w', 'write')], 8);
  const L = stage.life.locals!;
  const p = stage.room()!.npcs.find((q) => w.npcs![q.k] === porter);
  assert.ok(p, 'the porter is not in the room');
  const f = stage.frame(now)!;
  assert.equal(f.npcs!.find((q) => q.k === p.k)!.works, false, 'the porter works the way in');
  assert.ok(!L.worked.has(p.prop), 'the way in is worked');
  assert.equal(f.active[p.prop], false, 'the way in open with nobody passing');
  for (const q of f.npcs!) if (q.k !== p.k) assert.ok(q.works && L.worked.has(q.prop) && f.active[q.prop], `${w.npcs![q.k].name}'s station is not worked`);
  // someone walks in: the porter waves, before any other local stirs
  const first = new Map<number, { act: NpcAct; at: number }>();
  run(stage, (t) => [agent('w', 'write'), awake('new', t)], 3, now, (t) => {
    for (const q of stage.frame(t)!.npcs!) if (q.act !== 'work' && !first.has(q.k)) first.set(q.k, { act: q.act, at: stage.life.clock });
  });
  const mine = first.get(p.k);
  assert.equal(mine?.act, 'wave', 'the porter did not wave');
  for (const [k, o] of first) if (k !== p.k) assert.ok(o.at > mine!.at, `${w.npcs![k].name} greeted first`);
  // and so every time
  const door = stage.stations().find((s) => s.kind === 'entrance')!.spot;
  const at = L.of(p.k)!;
  for (let i = 0; i < 30; i++) {
    for (const l of L.all) l.acts = [];
    L.greet(door, stage.life.clock);
    const wave = at.acts[0];
    assert.equal(wave?.act, 'wave', 'the porter did not wave');
    for (const l of L.all) if (l !== at && l.acts.length) assert.ok(l.acts[0].at > wave.at, `${l.art.name} greeted first`);
  }
});

test('n off: the locals go and their stations stand idle; on again, they are back', () => {
  const stage = newStage();
  let now = run(stage, () => [agent('w', 'write')], 3);
  const props = stage.frame(now)!.npcs!.map((n) => n.prop);
  stage.npcs = false;
  assert.equal(stage.npcs, false);
  assert.equal(stage.life.locals, null);
  now = run(stage, () => [agent('w', 'write')], 1, now);
  const f = stage.frame(now)!;
  assert.equal(f.npcs, undefined);
  for (const i of props) assert.equal(f.active[i], false, `prop ${i} still worked`);
  stage.npcs = true;
  now = run(stage, () => [agent('w', 'write')], 1, now);
  assert.equal(stage.frame(now)!.npcs!.length, 3);
});

test('a local standing on the floor is kept clear: nobody walks or stands where it stands', () => {
  const stage = newStage(standers(lively), { x: 0, y: 1, w: 150, h: 44 });
  const standing = stage.room()!.npcs.filter((p) => p.mode === 'standing');
  assert.ok(standing.length >= 1, 'no standing local fits');
  const ids = ['i1', 'i2', 'i3', 'i4', 'i5', 'i6'];
  run(stage, (n) => ids.map((id) => awake(id, n)), 90, NOW, () => {
    for (const a of stage.actors()) for (const p of standing) assert.ok(Math.hypot(a.x - p.x, a.y - p.y) >= NPC_R, `${a.info.id} at ${a.x.toFixed(1)}, ${a.y.toFixed(1)} walked through a local`);
  });
});
