import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stage, stationKindFor } from '../src/world/stage.ts';
import { lab } from '../src/themes/lab.ts';
import { Screen } from '../src/term/screen.ts';
import type { AgentInfo, Activity } from '../src/agents.ts';

const NOW = 1_700_000_000_000;

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});

function run(stage: Stage, agents: AgentInfo[], seconds: number, start = NOW): number {
  let now = start;
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    stage.sync(agents, now);
    stage.update(0.05, now);
  }
  return now;
}

test('stationKindFor groups activities', () => {
  assert.equal(stationKindFor('write'), 'write');
  assert.equal(stationKindFor('talk'), 'think');
  assert.equal(stationKindFor('delegate'), 'think');
  assert.equal(stationKindFor('idle'), 'idle');
  assert.equal(stationKindFor('done'), null);
  assert.equal(stationKindFor('error'), null);
});

test('single-level layout keeps stations inside the scene, left to right', () => {
  const stage = new Stage(lab);
  const r = { x: 0, y: 1, w: 100, h: 14 };
  stage.layout(r);
  assert.deepEqual(stage.floors(), [13]);
  const st = stage.stations();
  assert.equal(st.length, 8);
  for (let i = 1; i < st.length; i++) assert.ok(st[i].x >= st[i - 1].x);
  for (const p of st) {
    assert.ok(p.x >= r.x && p.x + p.def.frames[0].w <= r.x + r.w, `${p.def.name} x=${p.x}`);
    assert.equal(p.y + p.def.frames[0].h - 1, 13, `${p.def.name} stands on the floor`);
  }
  assert.equal(st[0].def.kind, 'entrance');
});

test('tall scenes get two levels', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 120, h: 33 });
  const floors = stage.floors();
  assert.equal(floors.length, 2);
  assert.equal(floors[1], 1 + 33 - 2);
  const upper = stage.stations().filter((p) => p.level === 0).map((p) => p.def.kind);
  const lower = stage.stations().filter((p) => p.level === 1).map((p) => p.def.kind);
  assert.ok(upper.length >= 3 && lower.includes('entrance'), `${upper} / ${lower}`);
  assert.equal(upper.length + lower.length, 8);
});

test('a writer walks from the entrance to the write station and works', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 100, h: 18 });
  const a = agent('w1', 'write');
  stage.sync([a], NOW);
  const actor = stage.actors()[0];
  assert.equal(actor.state, 'enter');
  run(stage, [a], 10);
  const station = stage.stations().find((p) => p.def.kind === 'write')!;
  assert.equal(actor.state, 'work');
  assert.ok(Math.abs(actor.x + 2 - station.center) <= 10, `actor ${actor.x} station ${station.center}`);
  assert.equal(actor.station, station);
});

test('reaching an upper station climbs the ladder', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 120, h: 33 });
  const a = agent('r1', 'read');
  stage.sync([a], NOW);
  run(stage, [a], 15);
  const actor = stage.actors()[0];
  const station = stage.stations().find((p) => p.def.kind === 'read')!;
  assert.equal(station.level, 0);
  assert.equal(actor.level, 0);
  assert.equal(actor.y, stage.floors()[0] + 1);
  assert.equal(actor.state, 'work');
});

test('activity change shows a bubble and retargets', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 100, h: 18 });
  let now = run(stage, [agent('a', 'write')], 8);
  const actor = stage.actors()[0];
  stage.sync([agent('a', 'run', { detail: '$ npm test' })], now + 50);
  assert.ok(actor.bubbleUntil > now + 50);
  now = run(stage, [agent('a', 'run', { detail: '$ npm test' })], 8, now + 50);
  assert.equal(actor.station?.def.kind, 'run');
});

test('agents that vanish walk out and are purged', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 100, h: 18 });
  const now = run(stage, [agent('a', 'idle'), agent('b', 'write')], 8);
  run(stage, [agent('b', 'write')], 15, now);
  assert.deepEqual(stage.actors().map((x) => x.info.id), ['b']);
});

test('done agents stay put and celebrate', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 100, h: 18 });
  const now = run(stage, [agent('a', 'write')], 8);
  const actor = stage.actors()[0];
  const x = actor.x;
  run(stage, [agent('a', 'done')], 3, now);
  assert.equal(actor.x, x);
  assert.equal(actor.state, 'work');
});

test('leads come first, followed by their subagents', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 100, h: 18 });
  stage.sync([
    agent('s1', 'read', { parentId: 'L2' }),
    agent('L1', 'write', { role: 'lead' }),
    agent('L2', 'write', { role: 'lead' }),
    agent('s2', 'read', { parentId: 'L1' }),
  ], NOW);
  assert.deepEqual(stage.actors().map((a) => a.info.id), ['L1', 's2', 'L2', 's1']);
});

test('draw works with 0, 1 and 12 agents at several sizes and themes swap', () => {
  for (const [w, h] of [[60, 14], [120, 33], [200, 50]]) {
    for (const n of [0, 1, 12]) {
      const stage = new Stage(lab);
      const r = { x: 0, y: 1, w, h };
      stage.layout(r);
      const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'delegate', 'think', 'talk', 'done', 'idle', 'error'];
      const agents = Array.from({ length: n }, (_, i) => agent(`a${i}`, acts[i % acts.length]));
      const now = run(stage, agents, 3);
      const s = new Screen(w, h + 2);
      stage.draw(s, 3, now, agents[0]?.id ?? null);
      stage.setTheme(lab);
      stage.draw(s, 3.1, now + 100, null);
    }
  }
});

test('actors synced before the first layout land on a real floor', () => {
  const stage = new Stage(lab);
  stage.sync([agent('early', 'write')], NOW);
  stage.update(0.05, NOW + 50);
  stage.layout({ x: 0, y: 1, w: 100, h: 30 });
  const a = stage.actors()[0];
  assert.ok(a.level >= 0 && a.level < stage.floors().length, `level ${a.level}`);
  assert.ok(Number.isFinite(a.y) && Number.isFinite(a.x), `x=${a.x} y=${a.y}`);
});

test('retargeting mid-climb still ends on a real floor', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 120, h: 33 });
  let now = run(stage, [agent('c', 'read')], 1.2);
  const actor = stage.actors()[0];
  // Step until the actor is between floors.
  for (let i = 0; i < 400 && actor.y === stage.floors()[1] + 1; i++) {
    now += 50;
    stage.sync([agent('c', 'read')], now);
    stage.update(0.05, now);
  }
  assert.ok(actor.y < stage.floors()[1] + 1 && actor.y > stage.floors()[0] + 1, `not climbing: y=${actor.y}`);
  now = run(stage, [agent('c', 'run', { detail: '$ make' })], 12, now);
  assert.equal(actor.state, 'work');
  assert.equal(actor.y, stage.floors()[actor.level] + 1, 'floating between floors');
  assert.equal(actor.station?.def.kind, 'run');
});

test('80x24 terminals get two levels without overlapping stations', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 80, h: 21 });
  assert.equal(stage.floors().length, 2);
  for (const level of [0, 1]) {
    const st = stage.stations().filter((p) => p.level === level).sort((a, b) => a.x - b.x);
    for (let i = 1; i < st.length; i++) {
      assert.ok(st[i].x >= st[i - 1].x + st[i - 1].def.frames[0].w, `${st[i - 1].def.name} overlaps ${st[i].def.name}`);
    }
  }
});

test('growing from one floor to two keeps actors on the ground floor', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 120, h: 14 });
  run(stage, [agent('g', 'write')], 6);
  stage.layout({ x: 0, y: 1, w: 120, h: 33 });
  const a = stage.actors()[0];
  assert.equal(a.level, stage.floors().length - 1);
});

test('late subagent metadata updates the character', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 120, h: 33 });
  stage.sync([agent('m', 'read')], NOW);
  stage.sync([agent('m', 'read', { agentType: 'ecc:code-reviewer' })], NOW + 750);
  assert.equal(stage.actors()[0].traits.accessory, 'glasses');
});

test('shrinking the scene pulls every actor back inside it', () => {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 200, h: 33 });
  const now = run(stage, [agent('far', 'idle')], 10);
  run(stage, [agent('far', 'done')], 1, now);
  stage.layout({ x: 0, y: 1, w: 80, h: 21 });
  for (const a of stage.actors()) assert.ok(a.x >= 0 && a.x + 5 <= 80, `x=${a.x}`);
});
