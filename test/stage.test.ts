import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stage, stationKindFor } from '../src/world/stage.ts';
import { mines } from '../src/cave/biomes/mines.ts';
import { THEMES } from '../src/themes/index.ts';
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

test('agents at the props out on the floor stand on open floor, backs to us, facing the prop', () => {
  for (const b of THEMES) {
    for (const [r, mode] of [[RECT, 'half'], [{ x: 0, y: 1, w: 150, h: 44 }, 'sextant']] as const) {
      if (mode === 'sextant' && b.id !== 'mines' && b.id !== 'cafe') continue;
      const stage = new Stage(b, mode);
      stage.layout(r);
      const crew = [agent('r', 'run'), agent('w', 'web'), agent('t', 'think'), agent('z', 'idle', { since: NOW - 3_600_000 })];
      run(stage, crew, 25);
      const v = stage.voxels()!;
      for (const a of stage.actors()) {
        const tag = `${b.id} ${mode}: ${a.info.id}`;
        const st = a.station;
        assert.ok(st?.island, `${tag} not at a prop out on the floor`);
        assert.equal(a.state, 'work', tag);
        const g = v.ground(Math.floor(a.x), Math.floor(a.y));
        assert.ok(Math.abs(g - st.z0) <= 2, `${tag}: ground ${g} under the feet, floor ${st.z0}`);
        for (let z = g; z < g + 12; z++) assert.equal(v.get(Math.floor(a.x), Math.floor(a.y), z), M.AIR, `${tag}: blocked at z ${z}`);
        for (const p of stage.stations()) {
          const f = footprint(p);
          assert.ok(!(a.x > f.x0 && a.x < f.x1 && a.y > f.y0 && a.y < f.y1), `${tag} inside ${p.kind}`);
        }
        if (a.info.id === 'z') continue;
        // The prop is up-screen of them, and they look its way.
        const f = footprint(st);
        const cx = (f.x0 + f.x1) / 2;
        const cy = (f.y0 + f.y1) / 2;
        const look = stage.lookOf(a);
        assert.ok(cx + cy < a.x + a.y, `${tag}: the prop is not behind them`);
        assert.ok(look.facing.back, `${tag}: facing us`);
        assert.equal(look.facing.flip, cx - cy < a.x - a.y, `${tag}: facing away from the prop`);
      }
    }
  }
});

test('agents sharing a prop stand apart', () => {
  const stage = newStage();
  run(stage, [agent('a', 'write'), agent('b', 'write'), agent('c', 'write')], 14);
  const xs = stage.actors().map((a) => [a.x, a.y]);
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) assert.ok(Math.hypot(xs[i][0] - xs[j][0], xs[i][1] - xs[j][1]) >= 4, 'crowded');
});

// How far apart two floor spots are on screen at `zoom`, in pixels.
const onScreen = (p: { x: number; y: number }, q: { x: number; y: number }, zoom: number) =>
  Math.hypot(p.x - q.x - (p.y - q.y), (p.x - q.x + p.y - q.y) / 2) * zoom;

test('zoomed out, a crowd at a prop lines up a figure apart on screen, close by and turned to it', () => {
  for (const kind of ['write', 'read', 'think', 'run'] as const) {
    const stage = newStage({ x: 0, y: 1, w: 150, h: 44 }, 'sextant');
    const crew = ['a', 'b', 'c'].map((id) => agent(`${kind}-${id}`, kind));
    const now = run(stage, crew, 20);
    stage.draw(new Screen(150, 46), 20, now, null);
    assert.equal(stage.zoomLevel, 0.5);
    const st = slot(stage, kind);
    const f = footprint(st);
    const crowd = stage.actors();
    let working = 0;
    for (const a of crowd) {
      const tag = `${kind}: ${a.info.id} at ${a.x.toFixed(0)},${a.y.toFixed(0)}`;
      assert.equal(a.station, st, tag);
      assert.equal(a.state, 'work', tag);
      // A lane step is 12 px on screen: 24 voxels at 1/2. Never more than
      // 2.5 of them from the prop's own spot.
      assert.ok(Math.hypot(a.x - st.spot.x, a.y - st.spot.y) <= 2.5 * 24, `${tag}: far from its prop`);
      // At work (not mid-gesture), backs to us and turned the prop's way.
      const look = stage.lookOf(a);
      if (look.pose !== kind) continue;
      working++;
      assert.ok(look.facing.back, `${tag}: facing us`);
      assert.equal(look.facing.flip, (f.x0 + f.x1 - f.y0 - f.y1) / 2 < a.x - a.y, `${tag}: turned away from the prop`);
    }
    assert.ok(working >= 2, `${kind}: ${working} at work`);
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) {
        const d = onScreen(crowd[i], crowd[j], 0.5);
        assert.ok(d >= 12 - 1e-9, `${kind}: ${crowd[i].info.id} and ${crowd[j].info.id} ${d.toFixed(1)} px apart`);
      }
    }
  }
});

test('a crowd too big for its lanes never doubles up on one spot', () => {
  // Small rooms clamp lanes to the floor; seven or nine at one prop.
  for (const [r, mode, n] of [[RECT, 'half', 7], [{ x: 0, y: 1, w: 150, h: 44 }, 'sextant', 9]] as const) {
    const stage = newStage(r, mode);
    const crew = Array.from({ length: n }, (_, i) => agent(`d${i}`, i % 2 ? 'write' : 'read'));
    const now = run(stage, crew, 25);
    stage.draw(new Screen(r.w, r.h + 2), 25, now, null);
    const zoom = Math.max(stage.zoomLevel, 0.5);
    for (const kind of ['write', 'read']) {
      const there = stage.actors().filter((a) => a.station?.kind === kind);
      assert.ok(there.every((a) => a.state === 'work'), `${mode} ${kind}: still walking`);
      for (let i = 0; i < there.length; i++) {
        for (let j = i + 1; j < there.length; j++) {
          const d = onScreen(there[i], there[j], zoom);
          assert.ok(d >= 6, `${mode} ${kind}: ${there[i].info.id} and ${there[j].info.id} only ${d.toFixed(1)} px apart`);
        }
      }
    }
  }
});

test('walkers detouring through the hub keep to their own side of it', async () => {
  const { hub } = await import('../src/cave/layout.ts');
  const { hashString } = await import('../src/world/rng.ts');
  const stage = newStage({ x: 0, y: 1, w: 150, h: 44 }, 'sextant');
  // Two walkers whose ids hash to either side.
  const ids = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'];
  const left = ids.find((id) => hashString(id) & 1)!;
  const right = ids.find((id) => !(hashString(id) & 1))!;
  run(stage, [agent(left, 'idle'), agent(right, 'idle')], 1);
  const priv = stage as unknown as { walkTo(a: unknown, to: { x: number; y: number }): void; L: Parameters<typeof hub>[0] };
  const h = hub(priv.L);
  const { W, T } = priv.L;
  // Trips between points round the edge of the floor, every which way.
  const rim: Array<{ x: number; y: number }> = [];
  for (let f = 0.1; f < 0.95; f += 0.1) {
    const a = T + 2 + f * (W - T - 4);
    rim.push({ x: a, y: T + 2 }, { x: T + 2, y: a }, { x: a, y: W - 3 }, { x: W - 3, y: a });
  }
  let offset = 0;
  let pairs = 0;
  for (const from of rim) {
    for (const to of rim) {
      const sides: number[] = [];
      for (const a of stage.actors()) {
        Object.assign(a, from);
        priv.walkTo(a, to);
        const via = a.path[0];
        if (a.path.length !== 2 || Math.hypot(via.x - h.x, via.y - h.y) > 3.5) continue;
        // On the hub itself only where its side of it is blocked; otherwise
        // three voxels across the way, the side signed by the id.
        const off = Math.hypot(via.x - h.x, via.y - h.y);
        if (off < 1e-9) continue;
        offset++;
        assert.ok(Math.abs(off - 3) < 1e-6, `${a.info.id}: ${off.toFixed(2)} off the hub`);
        assert.ok(Math.abs((via.x - h.x) * (to.x - from.x) + (via.y - h.y) * (to.y - from.y)) < 1e-6, `${a.info.id}: not across the way`);
        sides.push(Math.sign((to.x - from.x) * (via.y - h.y) - (to.y - from.y) * (via.x - h.x)));
      }
      if (sides.length < 2) continue;
      pairs++;
      assert.notEqual(sides[0], sides[1], `${from.x},${from.y} → ${to.x},${to.y}: both on one side`);
    }
  }
  assert.ok(offset >= 10 && pairs >= 4, `${offset} detours beside the hub, ${pairs} side by side`);
});

test('a big room planned at a voxel a pixel (HD) is crossed at a jog, and the strides keep up', () => {
  const stage = new Stage(mines, 'hd');
  stage.setCell(10, 20);
  stage.layout({ x: 0, y: 1, w: 150, h: 44 });
  run(stage, [agent('j', 'write')], 0.05);
  const priv = stage as unknown as { k: number; L: { W: number; D: number; T: number }; move(a: unknown, dt: number): void };
  assert.equal(priv.k, 1);
  assert.equal(priv.L.W, 256);
  const a = stage.actors()[0];
  Object.assign(a, { x: priv.L.T + 10, y: priv.L.T + 10, path: [{ x: priv.L.W - 20, y: priv.L.D - 20 }], gait: 0 });
  priv.move(a, 0.1);
  const went = Math.hypot(a.x - priv.L.T - 10, a.y - priv.L.T - 10);
  // A walk is 22 voxels a second: a long trip here goes at three times that,
  // as sextant's zoomed-out rooms do.
  assert.ok(went > 0.1 * 22 * 2.9, `${went.toFixed(2)} voxels in 0.1 s`);
  assert.ok(a.gait > 0, 'the strides did not quicken');
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

test('name tags and bubbles never overlap', () => {
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

test('indoors, a finish showers the theme\'s own bits and leaves nothing on the floor', async () => {
  const { cafe } = await import('../src/cave/biomes/cafe.ts');
  const stage = new Stage(cafe, 'half');
  stage.layout(RECT);
  const now = run(stage, [agent('d', 'write')], 10);
  const v = stage.voxels()!;
  const before = v.mat.slice();
  stage.sync([agent('d', 'done', { since: now })], now + 50);
  stage.update(0.05, now + 50);
  const ps = (stage as unknown as { particles: Array<{ kind: string; color: number[]; mat?: number }> }).particles.filter((p) => p.kind === 'debris');
  assert.ok(ps.length > 0, 'no shower');
  assert.ok(ps.every((p) => p.mat === undefined && p.color.join() !== '255,211,74'), 'gold dust in the cafe');
  run(stage, [agent('d', 'done', { since: now })], 4, now + 50);
  let added = 0;
  for (let i = 0; i < v.mat.length; i++) if (v.mat[i] === M.GOLD_DUST && before[i] !== M.GOLD_DUST) added++;
  assert.equal(added, 0);
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

test('zoomed out, the scene keeps the world\'s own colours instead of blending new ones', () => {
  const stage = newStage({ x: 0, y: 1, w: 60, h: 17 }, 'sextant');
  const now = run(stage, [], 1);
  const s = new Screen(60, 19);
  stage.draw(s, 1, now, null);
  assert.ok(stage.zoomLevel < 0.9, `zoom ${stage.zoomLevel}`);
  const priv = stage as unknown as { world: { data: Int32Array }; screen: { data: Int32Array } };
  const own = new Set(priv.world.data);
  const shown = priv.screen.data.filter((v) => v !== -1);
  const kept = shown.filter((v) => own.has(v)).length / shown.length;
  assert.ok(kept > 0.85, `${(kept * 100).toFixed(0)} % of scene pixels are world colours`);
});

test('a room that just misses fitting is shown at full detail, not at half size', () => {
  // Half blocks: 150x110 px plans the smallest room, a little too wide.
  const stage = newStage({ x: 0, y: 1, w: 150, h: 55 });
  const now = run(stage, [agent('a', 'write')], 1);
  stage.draw(new Screen(150, 57), 1, now, null);
  assert.equal(stage.zoomLevel, 1);
  // Sextant at 120x40 plans a big room at half size instead of a small one.
  const sx = newStage({ x: 0, y: 1, w: 92, h: 37 }, 'sextant');
  assert.ok(sx.voxels()!.W > 120, `room ${sx.voxels()!.W}`);
});

test('an error stays on show after the next tool call starts, ahead of other bubbles', () => {
  const stage = newStage({ x: 0, y: 1, w: 120, h: 33 }, 'sextant');
  const crowd = ['p', 'q', 'r', 's'].map((id) => agent(id, 'write'));
  let now = run(stage, [...crowd, agent('e', 'think')], 8);
  now = run(stage, [...crowd, agent('e', 'error', { since: now, detail: 'npm test failed' })], 0.5, now);
  // The next call starts at once, and everyone else just changed too.
  const next = agent('e', 'write', { since: now, detail: 'Edit app.ts' });
  const busy = crowd.map((a) => ({ ...a, detail: 'Edit other.ts', since: now }));
  const text = () => {
    const s = new Screen(120, 35);
    stage.draw(s, 1, now, null);
    return s.ch.join('');
  };
  now = run(stage, [...busy, next], 1, now);
  assert.match(text(), /npm test failed/);
  now = run(stage, [...busy, next], 5, now);
  assert.doesNotMatch(text(), /npm test failed/);
});

// Stands the actors still round the middle of the room, the i-th
// `cells[i]` (columns, rows) of sextant text cells from it on screen: a
// crowd, wherever the lanes would put them.
function gather(stage: Stage, cells: ReadonlyArray<readonly [number, number]>): void {
  const crowd = stage.actors();
  const z = stage.zoomLevel;
  const x = stage.voxels()!.W / 2;
  const y = stage.voxels()!.D / 2;
  crowd.forEach((a, i) => {
    const [c, r] = cells[i % cells.length];
    const across = (2 * c) / z; // screen x is x - y
    const down = (3 * r) / z; // screen y is (x + y) / 2 - z
    a.x = x + across / 2 + down;
    a.y = y - across / 2 + down;
    a.z = -1;
    a.path = [];
  });
}

test('a loud label moves rows at once: an error bubble shows in every frame from the bang on', () => {
  for (const sel of ['p', null]) {
    const stage = newStage({ x: 0, y: 1, w: 120, h: 33 }, 'sextant');
    const crowd = ['p', 'q', 'r', 's', 't'].map((id) => agent(id, 'write'));
    let now = run(stage, [...crowd, agent('e', 'write')], 8);
    // p (the selection, its bubble placed first) and e a dozen columns
    // apart on one row, the rest off to the side; e's short name fits
    // beside p's bubble.
    const cells = [[0, 0], [-26, 2], [-24, 0], [-22, 2], [-20, 0], [12, 0]] as const;
    const frame = (agents: AgentInfo[]) => {
      now = run(stage, agents, 0.05, now);
      gather(stage, cells);
      const s = new Screen(120, 35);
      stage.draw(s, (now - NOW) / 1000, now, sel);
      return s;
    };
    for (let i = 0; i < 20; i++) frame([...crowd, agent('e', 'write')]);
    // Then e fails, and its bubble, far wider than its name, runs into p's.
    const failed = agent('e', 'error', { since: now, detail: 'npm test failed' });
    let frames = 0;
    let missed = 0;
    for (let i = 0; i < 100; i++) {
      const s = frame([...crowd, failed]);
      if (!stage.actors().find((a) => a.info.id === 'e')!.error) continue;
      frames++;
      if (!s.ch.join('').includes('npm test failed')) missed++;
    }
    assert.ok(frames > 60, `${frames} frames after the bang`);
    assert.equal(missed, 0, `selection ${sel}: the error bubble was missing from ${missed} of ${frames} frames`);
  }
});

// Names and bubbles (not glyph marks) whose middles are within 8 columns
// and 4 rows of each other, at most, round any one of them.
function tallestStack(ls: ReadonlyArray<{ x: number; y: number; w: number }>): number {
  let most = 0;
  for (const l of ls) most = Math.max(most, ls.filter((m) => Math.abs(m.x + m.w / 2 - (l.x + l.w / 2)) < 8 && Math.abs(m.y - l.y) <= 4).length);
  return most;
}

test('no more than three names or bubbles stack in a 16-column band', () => {
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  // Ten heads within a dozen columns and three rows.
  const cells = Array.from({ length: 10 }, (_, i) => [((i * 5) % 13) - 6, (i % 3) * 1.5] as const);
  for (const [w, h] of [[120, 33], [150, 44]]) {
    const stage = newStage({ x: 0, y: 1, w, h }, 'sextant');
    let crowd = Array.from({ length: 10 }, (_, i) => agent(`l${i}`, acts[i % acts.length]));
    let now = run(stage, crowd, 6);
    stage.draw(new Screen(w, h + 2), 6, now, null);
    let most = 0;
    for (let k = 0; k < 30; k++) {
      // Everyone just changed, so all are loud and none shrinks for the
      // crowd alone.
      crowd = crowd.map((a) => ({ ...a, detail: `step ${k}` }));
      now = run(stage, crowd, 0.1, now);
      gather(stage, cells);
      stage.draw(new Screen(w, h + 2), (now - NOW) / 1000, now, k < 20 ? null : 'l4');
      most = Math.max(most, tallestStack(stage.labels().filter((l) => l.w > 1)));
    }
    assert.ok(most >= 2, `labels never met (${most})`);
    assert.ok(most <= 3, `${w}x${h}: ${most} labels stacked in one band`);
  }
});

test('in a crowd, quiet labels shrink to their activity glyph and keep to the two rows over the head', async () => {
  const { activityGlyph } = await import('../src/ui/chrome.ts');
  const stage = newStage({ x: 0, y: 1, w: 120, h: 33 }, 'sextant');
  // A huddle, long past their last change.
  const crowd = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => agent(id, 'read', { since: NOW - 60_000 }));
  const now = run(stage, crowd, 12);
  stage.draw(new Screen(120, 35), 12, now, null);
  gather(stage, [[0, 0], [-3, 0], [3, 0], [-2, 2], [2, 2], [0, -2]]);
  const s = new Screen(120, 35);
  stage.draw(s, 12.05, now + 50, null);
  const marks = stage.labels().filter((l) => l.w === 1);
  const names = stage.labels().filter((l) => l.w > 1);
  assert.ok(marks.length >= 2, `${marks.length} glyph marks, ${names.length} names`);
  assert.ok(names.length < crowd.length - 1, `${names.length} of ${crowd.length} still show their names`);
  for (const m of marks) assert.equal(s.ch[m.y * 120 + m.x], activityGlyph('read'), `mark at ${m.x},${m.y}`);
  const rows = (stage as unknown as { rows: Map<string, { off: number }> }).rows;
  for (const [id, memo] of rows) assert.ok(memo.off <= 2, `${id}'s quiet label on row ${memo.off}`);
});

test('names that clip alike are told apart', async () => {
  const { tagNames } = await import('../src/world/stage.ts');
  type A = Parameters<typeof tagNames>[0][number];
  const crew = ['Check injections', 'atlas', 'Check injections', 'Explore codebase', 'Explore tests', 'Map the API'].map((name, order) => ({ info: { id: `x${order}`, name }, order }) as unknown as A);
  const short = tagNames(crew, 8);
  const shown = crew.map((a) => short.get(a));
  // Same name twice: numbered in the order they came.
  assert.deepEqual(shown.slice(0, 3), ['Check…', 'atlas', 'Check…2']);
  // Different names cut alike: first word and the second's initial.
  assert.deepEqual(shown.slice(3), ['Explo c…', 'Explo t…', 'Map the…']);
  assert.equal(new Set(shown).size, shown.length);
  // At bubble length too.
  assert.deepEqual(crew.map((a) => tagNames(crew, 10).get(a)), ['Check inj…', 'atlas', 'Check inj…2', 'Explore c…', 'Explore t…', 'Map the…']);
});
