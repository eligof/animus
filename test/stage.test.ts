import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stage, stationKindFor } from '../src/world/stage.ts';
import { mines } from '../src/cave/biomes/mines.ts';
import { M, MATERIALS } from '../src/cave/materials.ts';
import type { Slot } from '../src/cave/types.ts';
import { Screen } from '../src/term/screen.ts';
import type { AgentInfo, Activity } from '../src/agents.ts';

const NOW = 1_700_000_000_000;
const RECT = { x: 0, y: 1, w: 120, h: 33 };

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

function newStage(r = RECT, mode: 'half' | 'sextant' = 'half'): Stage {
  const stage = new Stage(mines, mode);
  stage.layout(r);
  return stage;
}

const slot = (stage: Stage, kind: string) => stage.stations().find((s) => s.kind === kind)!;

function footprint(p: Slot) {
  return p.wall === 'right'
    ? { x0: p.x0, x1: p.x0 + p.len, y0: p.y0, y1: p.y0 + p.dep }
    : { x0: p.x0, x1: p.x0 + p.dep, y0: p.y0, y1: p.y0 + p.len };
}

const solids = (stage: Stage) => stage.voxels()!.mat.reduce((n, m) => n + (MATERIALS[m]?.kind === 'solid' ? 1 : 0), 0);

test('stationKindFor groups activities', () => {
  assert.equal(stationKindFor('write'), 'write');
  assert.equal(stationKindFor('talk'), 'think');
  assert.equal(stationKindFor('delegate'), 'think');
  assert.equal(stationKindFor('idle'), 'idle');
  assert.equal(stationKindFor('done'), null);
  assert.equal(stationKindFor('error'), null);
});

test('a writer walks from the tunnel to the anvil and works', () => {
  const stage = newStage();
  const a = agent('w1', 'write');
  stage.sync([a], NOW);
  const actor = stage.actors()[0];
  const door = slot(stage, 'entrance');
  assert.equal(actor.state, 'enter');
  assert.ok(Math.hypot(actor.x - door.spot.x, actor.y - door.spot.y) < 1e-9, 'spawns at the tunnel');
  run(stage, [a], 12);
  const anvil = slot(stage, 'write');
  assert.equal(actor.state, 'work');
  assert.equal(actor.station, anvil);
  assert.ok(Math.hypot(actor.x - anvil.spot.x, actor.y - anvil.spot.y) < 1e-6);
});

test('readers go to the left wall', () => {
  const stage = newStage();
  run(stage, [agent('r', 'read')], 12);
  const actor = stage.actors()[0];
  assert.equal(actor.station?.kind, 'read');
  assert.equal(actor.station?.wall, 'left');
});

test('agents sharing a prop stand apart', () => {
  const stage = newStage();
  run(stage, [agent('a', 'write'), agent('b', 'write'), agent('c', 'write')], 14);
  const xs = stage.actors().map((a) => [a.x, a.y]);
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) assert.ok(Math.hypot(xs[i][0] - xs[j][0], xs[i][1] - xs[j][1]) >= 4, 'crowded');
});

test('activity change shows a bubble and retargets', () => {
  const stage = newStage();
  let now = run(stage, [agent('a', 'write')], 10);
  const actor = stage.actors()[0];
  stage.sync([agent('a', 'run', { detail: '$ npm test' })], now + 50);
  assert.ok(actor.bubbleUntil > now + 50);
  now = run(stage, [agent('a', 'run', { detail: '$ npm test' })], 12, now + 50);
  assert.equal(actor.station?.kind, 'run');
  assert.equal(actor.state, 'work');
});

test('agents that vanish walk out through the tunnel and are purged', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'idle'), agent('b', 'write')], 10);
  run(stage, [agent('b', 'write')], 16, now);
  assert.deepEqual(stage.actors().map((x) => x.info.id), ['b']);
});

test('leads come first, followed by their subagents', () => {
  const stage = newStage();
  stage.sync([
    agent('s1', 'read', { parentId: 'L2' }),
    agent('L1', 'write', { role: 'lead' }),
    agent('L2', 'write', { role: 'lead' }),
    agent('s2', 'read', { parentId: 'L1' }),
  ], NOW);
  assert.deepEqual(stage.actors().map((a) => a.info.id), ['L1', 's2', 'L2', 's1']);
});

test('late subagent metadata updates the character', () => {
  const stage = newStage();
  stage.sync([agent('m', 'read')], NOW);
  stage.sync([agent('m', 'read', { agentType: 'ecc:code-reviewer' })], NOW + 750);
  assert.equal(stage.actors()[0].traits.accessory, 'glasses');
});

test('actors synced before the first layout land on the floor', () => {
  const stage = new Stage(mines);
  stage.sync([agent('early', 'write')], NOW);
  stage.update(0.05, NOW + 50);
  stage.layout(RECT);
  const v = stage.voxels()!;
  const a = stage.actors()[0];
  assert.ok(a.x > 0 && a.y > 0 && a.x < v.W && a.y < v.D, `${a.x},${a.y}`);
});

test('resizing keeps every actor on the floor', () => {
  const stage = newStage({ x: 0, y: 1, w: 200, h: 57 });
  const now = run(stage, [agent('far', 'idle'), agent('near', 'read')], 10);
  stage.layout({ x: 0, y: 1, w: 80, h: 21 });
  run(stage, [agent('far', 'idle'), agent('near', 'read')], 0.1, now);
  const v = stage.voxels()!;
  for (const a of stage.actors()) assert.ok(a.x > 0 && a.y > 0 && a.x < v.W && a.y < v.D, `${a.info.id} at ${a.x},${a.y}`);
});

test('crowds never stand or walk inside props', () => {
  for (const [w, h] of [[80, 21], [120, 33]]) {
    const stage = newStage({ x: 0, y: 1, w, h });
    const crowd = Array.from({ length: 7 }, (_, i) => agent(`c${i}`, i % 2 ? 'write' : 'read'));
    let now = NOW;
    for (let i = 0; i < 300; i++) {
      now += 50;
      stage.sync(crowd, now);
      stage.update(0.05, now);
      for (const a of stage.actors()) {
        for (const p of stage.stations()) {
          if (p.kind === 'entrance') continue;
          const f = footprint(p);
          const inside = a.x > f.x0 + 0.5 && a.x < f.x1 - 0.5 && a.y > f.y0 + 0.5 && a.y < f.y1 - 0.5;
          assert.ok(!inside, `${w}x${h}: ${a.info.id} inside ${p.kind} at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
        }
      }
    }
  }
});

test('draw works with 0, 1 and 12 agents at several sizes, both pixel modes, and the biome can be swapped', () => {
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'delegate', 'think', 'talk', 'done', 'idle', 'error'];
  for (const mode of ['half', 'sextant'] as const) {
    for (const [w, h] of [[60, 17], [120, 33], [200, 57]]) {
      for (const n of [0, 1, 12]) {
        const stage = newStage({ x: 0, y: 1, w, h }, mode);
        const agents = Array.from({ length: n }, (_, i) => agent(`a${i}`, acts[i % acts.length]));
        const now = run(stage, agents, 2);
        const s = new Screen(w, h + 2);
        stage.draw(s, 2, now, agents[0]?.id ?? null);
        stage.setTheme(mines);
        stage.draw(s, 2.1, now + 100, null);
        if (mode === 'half') assert.ok(s.ch.includes('▀'), 'half-block pixels drawn');
        else assert.ok(s.ch.some((ch) => { const cp = ch.codePointAt(0)!; return cp >= 0x1fb00 && cp <= 0x1fb3b; }), 'sextant pixels drawn');
      }
    }
  }
});

test('name tags, bubbles and the selection arrow never overlap', () => {
  const stage = newStage({ x: 0, y: 1, w: 120, h: 33 }, 'sextant');
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const crowd = Array.from({ length: 12 }, (_, i) => agent(`l${i}`, acts[i % acts.length]));
  const now = run(stage, crowd, 8);
  const s = new Screen(120, 35);
  stage.draw(s, 0.2, now, 'l3');
  const labels = stage.labels();
  assert.ok(labels.length > 3);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      assert.ok(a.y !== b.y || a.x + a.w <= b.x || b.x + b.w <= a.x, `labels overlap: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
    }
  }
});

test('labels are cleared when there is nothing to draw', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'write')], 6);
  stage.draw(new Screen(120, 35), 0, now, 'a');
  assert.ok(stage.labels().length > 0);
  stage.layout({ x: 0, y: 1, w: 0, h: 0 });
  stage.draw(new Screen(120, 35), 0.1, now, 'a');
  assert.deepEqual(stage.labels(), []);
});

test('an error blows a crater next to the agent, once per error', () => {
  const stage = newStage();
  const now = run(stage, [agent('e', 'think')], 10);
  const before = solids(stage);
  const err = agent('e', 'error', { since: now });
  stage.sync([err], now + 50);
  stage.update(0.05, now + 50);
  const after = solids(stage);
  assert.ok(before - after > 20, `crater removed ${before - after} solid voxels`);
  run(stage, [err], 2, now + 50);
  assert.ok(after - solids(stage) < 40, 'exploded again for the same error');
});

test('searching digs into the wall; running burns fire under the cauldron', () => {
  const stage = newStage();
  run(stage, [agent('s', 'search'), agent('r', 'run')], 20);
  const v = stage.voxels()!;
  const dig = slot(stage, 'search');
  let carved = 0;
  for (let i = 0; i < v.size; i++) {
    if (v.base[i] === M.AIR || v.mat[i] !== M.AIR) continue;
    const x = v.xOf(i);
    const y = v.yOf(i);
    if (dig.wall === 'left' ? x < dig.x0 + 2 && y >= dig.y0 && y < dig.y0 + dig.len : y < dig.y0 + 2 && x >= dig.x0 && x < dig.x0 + dig.len) carved++;
  }
  assert.ok(carved > 0, 'nothing dug out of the wall');
  const pot = footprint(slot(stage, 'run'));
  let fire = 0;
  for (let i = 0; i < v.size; i++) {
    if (v.mat[i] !== M.FIRE) continue;
    const x = v.xOf(i);
    const y = v.yOf(i);
    if (x >= pot.x0 - 1 && x <= pot.x1 + 1 && y >= pot.y0 - 1 && y <= pot.y1 + 1) fire++;
  }
  assert.ok(fire > 0, 'no fire under the cauldron');
});

test('finishing sets off a shower that lands as gold dust', () => {
  const stage = newStage();
  const now = run(stage, [agent('d', 'write')], 10);
  const v = stage.voxels()!;
  const gold = () => v.mat.reduce((n, m) => n + (m === M.GOLD_DUST ? 1 : 0), 0);
  const before = gold();
  run(stage, [agent('d', 'done', { since: now })], 4, now);
  assert.ok(gold() > before, 'no gold dust landed');
});

test('lighting can be switched off', () => {
  const stage = newStage({ x: 0, y: 1, w: 120, h: 33 }, 'sextant');
  const now = run(stage, [agent('a', 'run')], 6);
  const lit = new Screen(120, 35);
  stage.draw(lit, 1, now, null);
  stage.lit = false;
  const flat = new Screen(120, 35);
  stage.draw(flat, 1, now, null);
  let diff = 0;
  for (let i = 0; i < lit.fg.length; i++) if (lit.fg[i] !== flat.fg[i] || lit.bg[i] !== flat.bg[i]) diff++;
  assert.ok(diff > 500, `only ${diff} cells changed`);
});

test('the camera follows the selected agent when the cave is bigger than the view', () => {
  const stage = newStage({ x: 0, y: 1, w: 40, h: 14 }, 'half');
  const crowd = [agent('far', 'read'), agent('other', 'write')];
  let now = run(stage, crowd, 10);
  const s = new Screen(40, 16);
  for (let i = 0; i < 40; i++) {
    now += 50;
    stage.draw(s, i * 0.05, now, 'far');
  }
  assert.ok(stage.labels().length > 0, 'the selected agent is off screen');
});

test('the world stays bounded over a long busy session', () => {
  const stage = newStage();
  const acts: Activity[] = ['write', 'search', 'run', 'web', 'think', 'error', 'done'];
  const solid0 = solids(stage);
  let now = NOW;
  for (let round = 0; round < 12; round++) {
    const crowd = Array.from({ length: 6 }, (_, i) => agent(`b${i}`, acts[(i + round) % acts.length], { since: now }));
    now = run(stage, crowd, 5, now);
  }
  const solid1 = solids(stage);
  assert.ok(solid1 > solid0 * 0.97, `lost ${solid0 - solid1} solid voxels`);
  assert.ok((stage as unknown as { particles: unknown[] }).particles.length <= 1500);
});

test('a big sextant frame with a busy crew stays within budget', () => {
  const stage = newStage({ x: 0, y: 1, w: 200, h: 57 }, 'sextant');
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const agents = Array.from({ length: 12 }, (_, i) => agent(`p${i}`, acts[i % acts.length]));
  let now = run(stage, agents, 5);
  const s = new Screen(200, 60);
  stage.draw(s, 0, now, null);
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    now += 55;
    stage.sync(agents, now);
    stage.update(0.055, now);
    stage.draw(s, i * 0.055, now, null);
  }
  const ms = (performance.now() - t0) / 40;
  // 18 fps leaves 55 ms a frame; stay well inside it even on slow CI.
  assert.ok(ms < 40, `${ms.toFixed(2)} ms per frame`);
});

test('a zero-size layout pauses drawing but keeps the stage alive', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'write')], 4);
  stage.layout({ x: 0, y: 1, w: 0, h: 0 });
  // Errors and naps while hidden neither crash nor pile up letters.
  run(stage, [agent('a', 'error', { since: now }), agent('b', 'idle', { since: now - 60_000 })], 6, now);
  assert.ok((stage as unknown as { glyphs: unknown[] }).glyphs.length < 20);
  stage.layout(RECT);
  const later = run(stage, [agent('a', 'write')], 1, now + 6000);
  const s = new Screen(120, 35);
  stage.draw(s, 1, later, null);
  assert.ok(s.ch.includes('▀'), 'nothing drawn after coming back');
});

test('translucent edges blend over the biome backdrop, and a rebuild drops old lights', () => {
  const stage = newStage();
  run(stage, [agent('r', 'run')], 4);
  const b = mines.backdrop;
  const caster = (stage as unknown as { caster: { backdrop: number } }).caster;
  assert.equal(caster.backdrop, (b[0] << 16) | (b[1] << 8) | b[2]);
  assert.ok((stage as unknown as { lights: unknown[] }).lights.length > 0);
  stage.setTheme(mines);
  assert.equal((stage as unknown as { lights: unknown[] }).lights.length, 0);
});

test('wizards never jump more than a step up or down between frames', () => {
  const stage = newStage({ x: 0, y: 1, w: 120, h: 33 });
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think', 'idle'];
  let now = NOW;
  const last = new Map<string, number>();
  for (let round = 0; round < 4; round++) {
    const crowd = Array.from({ length: 7 }, (_, i) => agent(`h${i}`, acts[(i + round) % acts.length], { since: now }));
    for (let i = 0; i < 100; i++) {
      now += 50;
      stage.sync(crowd, now);
      stage.update(0.05, now);
      for (const a of stage.actors()) {
        const prev = last.get(a.info.id);
        if (prev !== undefined && prev >= 0 && a.z >= 0) assert.ok(Math.abs(a.z - prev) <= 2.01, `${a.info.id} jumped ${prev.toFixed(1)} → ${a.z.toFixed(1)}`);
        last.set(a.info.id, a.z);
      }
    }
  }
});
