import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Stage, stationKindFor } from '../src/world/stage.ts';
import { lab } from '../src/themes/lab.ts';
import { Screen } from '../src/term/screen.ts';
import type { AgentInfo, Activity } from '../src/agents.ts';
import type { RGB } from '../src/term/color.ts';

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

function newStage(r = RECT): Stage {
  const stage = new Stage(lab);
  stage.layout(r);
  return stage;
}

test('stationKindFor groups activities', () => {
  assert.equal(stationKindFor('write'), 'write');
  assert.equal(stationKindFor('talk'), 'think');
  assert.equal(stationKindFor('delegate'), 'think');
  assert.equal(stationKindFor('idle'), 'idle');
  assert.equal(stationKindFor('done'), null);
  assert.equal(stationKindFor('error'), null);
});

test('a writer walks from the door to the write station and works', () => {
  const stage = newStage();
  const a = agent('w1', 'write');
  stage.sync([a], NOW);
  const actor = stage.actors()[0];
  const door = stage.stations().find((p) => p.kind === 'entrance')!;
  assert.equal(actor.state, 'enter');
  assert.ok(Math.hypot(actor.gx - door.spot.gx, actor.gy - door.spot.gy) < 1e-9, 'spawns at the door');
  run(stage, [a], 10);
  const desk = stage.stations().find((p) => p.kind === 'write')!;
  assert.equal(actor.state, 'work');
  assert.equal(actor.station, desk);
  assert.ok(Math.hypot(actor.gx - desk.spot.gx, actor.gy - desk.spot.gy) < 1e-6);
});

test('readers go to the left wall', () => {
  const stage = newStage();
  run(stage, [agent('r', 'read')], 10);
  const actor = stage.actors()[0];
  assert.equal(actor.station?.kind, 'read');
  assert.equal(actor.station?.at.wall, 'left');
});

test('agents sharing a station stand side by side', () => {
  const stage = newStage();
  run(stage, [agent('a', 'write'), agent('b', 'write'), agent('c', 'write')], 12);
  const spots = stage.actors().map((a) => `${a.gx.toFixed(2)},${a.gy.toFixed(2)}`);
  assert.equal(new Set(spots).size, 3);
});

test('activity change shows a bubble and retargets', () => {
  const stage = newStage();
  let now = run(stage, [agent('a', 'write')], 8);
  const actor = stage.actors()[0];
  stage.sync([agent('a', 'run', { detail: '$ npm test' })], now + 50);
  assert.ok(actor.bubbleUntil > now + 50);
  now = run(stage, [agent('a', 'run', { detail: '$ npm test' })], 8, now + 50);
  assert.equal(actor.station?.kind, 'run');
  assert.equal(actor.state, 'work');
});

test('agents that vanish walk out through the door and are purged', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'idle'), agent('b', 'write')], 8);
  run(stage, [agent('b', 'write')], 15, now);
  assert.deepEqual(stage.actors().map((x) => x.info.id), ['b']);
});

test('done agents stay put and celebrate', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'write')], 8);
  const actor = stage.actors()[0];
  const [x, y] = [actor.gx, actor.gy];
  run(stage, [agent('a', 'done')], 3, now);
  assert.equal(actor.gx, x);
  assert.equal(actor.gy, y);
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
  const stage = new Stage(lab);
  stage.sync([agent('early', 'write')], NOW);
  stage.update(0.05, NOW + 50);
  stage.layout(RECT);
  const a = stage.actors()[0];
  assert.ok(Number.isFinite(a.gx) && Number.isFinite(a.gy) && a.gx > 0 && a.gy > 0, `${a.gx},${a.gy}`);
});

test('resizing keeps every actor on the floor', () => {
  const stage = newStage({ x: 0, y: 1, w: 200, h: 57 });
  const now = run(stage, [agent('far', 'idle'), agent('near', 'read')], 10);
  stage.layout({ x: 0, y: 1, w: 80, h: 21 });
  run(stage, [agent('far', 'idle'), agent('near', 'read')], 0.1, now);
  for (const a of stage.actors()) assert.ok(a.gx > 0 && a.gy > 0, `${a.info.id} at ${a.gx},${a.gy}`);
});

test('draw works with 0, 1 and 12 agents at several sizes and themes swap', () => {
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'delegate', 'think', 'talk', 'done', 'idle', 'error'];
  for (const [w, h] of [[60, 17], [80, 21], [120, 33], [200, 57]]) {
    for (const n of [0, 1, 12]) {
      const stage = newStage({ x: 0, y: 1, w, h });
      const agents = Array.from({ length: n }, (_, i) => agent(`a${i}`, acts[i % acts.length]));
      const now = run(stage, agents, 3);
      const s = new Screen(w, h + 2);
      stage.draw(s, 3, now, agents[0]?.id ?? null);
      stage.setTheme(lab);
      stage.draw(s, 3.1, now + 100, null);
      assert.ok(s.ch.includes('▀'), 'pixels drawn');
    }
  }
});

test('frame time stays low with a big crew', () => {
  const stage = newStage({ x: 0, y: 1, w: 200, h: 57 });
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const agents = Array.from({ length: 12 }, (_, i) => agent(`b${i}`, acts[i % acts.length]));
  let now = run(stage, agents, 5);
  const s = new Screen(200, 60);
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    now += 55;
    stage.sync(agents, now);
    stage.update(0.055, now);
    stage.draw(s, i * 0.055, now, null);
  }
  const ms = (performance.now() - t0) / 40;
  assert.ok(ms < 12, `${ms.toFixed(2)} ms per frame`);
});

test('sextant frames stay within budget with a big crew', () => {
  const stage = new Stage(lab, 'sextant');
  stage.layout({ x: 0, y: 1, w: 200, h: 57 });
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const agents = Array.from({ length: 12 }, (_, i) => agent(`x${i}`, acts[i % acts.length]));
  let now = run(stage, agents, 5);
  const s = new Screen(200, 60);
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    now += 55;
    stage.sync(agents, now);
    stage.update(0.055, now);
    stage.draw(s, i * 0.055, now, null);
  }
  const ms = (performance.now() - t0) / 40;
  // 18 fps leaves 55 ms a frame; stay well inside it even on slow CI.
  assert.ok(ms < 30, `${ms.toFixed(2)} ms per frame`);
});

function footprintOf(p: { at: { wall: string; along: number; out: number }; station: { size: { len: number; dep: number } } }) {
  const { len, dep } = p.station.size;
  return p.at.wall === 'right'
    ? { x0: p.at.along, x1: p.at.along + len, y0: p.at.out, y1: p.at.out + dep }
    : { x0: p.at.out, x1: p.at.out + dep, y0: p.at.along, y1: p.at.along + len };
}

test('a change of activity during the entrance still retargets', () => {
  const stage = newStage();
  stage.sync([agent('quick', 'idle')], NOW);
  stage.sync([agent('quick', 'write')], NOW + 300);
  run(stage, [agent('quick', 'write')], 10, NOW + 300);
  assert.equal(stage.actors()[0].station?.kind, 'write');
});

test('crowds never stand or walk inside furniture', () => {
  for (const [w, h] of [[80, 21], [100, 30], [120, 33]]) {
    const stage = newStage({ x: 0, y: 1, w, h });
    const crowd = Array.from({ length: 7 }, (_, i) => agent(`c${i}`, i % 2 ? 'write' : 'read'));
    let now = NOW;
    for (let i = 0; i < 300; i++) {
      now += 50;
      stage.sync(crowd, now);
      stage.update(0.05, now);
      for (const a of stage.actors()) {
        for (const p of stage.stations()) {
          const f = footprintOf(p);
          const inside = a.gx > f.x0 + 0.05 && a.gx < f.x1 - 0.05 && a.gy > f.y0 + 0.05 && a.gy < f.y1 - 0.05;
          assert.ok(!inside, `${w}x${h}: ${a.info.id} inside ${p.kind} at ${a.gx.toFixed(2)},${a.gy.toFixed(2)}`);
        }
      }
    }
  }
});

test('name tags, bubbles and the selection arrow never overlap', () => {
  const stage = newStage({ x: 0, y: 1, w: 100, h: 30 });
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const crowd = Array.from({ length: 12 }, (_, i) => agent(`l${i}`, acts[i % acts.length]));
  const now = run(stage, crowd, 6);
  const s = new Screen(100, 32);
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

test('sextant mode draws with sextant glyphs', () => {
  const stage = new Stage(lab, 'sextant');
  stage.layout(RECT);
  const now = run(stage, [agent('x', 'write')], 4);
  const s = new Screen(120, 36);
  stage.draw(s, 1, now, null);
  assert.ok(s.ch.some((ch) => { const cp = ch.codePointAt(0)!; return cp >= 0x1fb00 && cp <= 0x1fb3b; }), 'no sextant glyphs');
  stage.setMode('half');
  stage.draw(s, 1.1, now + 50, null);
  assert.ok(s.ch.includes('▀'));
});

function sceneSum(s: Screen): [number, number, number] {
  const sum: [number, number, number] = [0, 0, 0];
  for (let y = 1; y < s.height - 2; y++) {
    for (let x = 0; x < s.width; x++) {
      for (const c of [s.fgAt(x, y), s.bgAt(x, y)]) for (let k = 0; k < 3; k++) sum[k] += c[k];
    }
  }
  return sum;
}

test('the theme grade darkens the scene and station lights shine while in use', () => {
  const red = { color: [255, 0, 0] as RGB, radius: 2.5, intensity: 1, a: 1, b: 1, z: 1.5 };
  const dim = { ...lab, lighting: { ambient: [110, 110, 110] as RGB } };
  const lit = { ...dim, stations: { ...lab.stations, write: { ...lab.stations.write, light: (_t: number, active: boolean) => (active ? red : null) } } };
  const frame = (theme: typeof lab, agents: AgentInfo[]) => {
    const stage = new Stage(theme);
    stage.layout(RECT);
    const now = run(stage, agents, 8);
    const s = new Screen(120, 36);
    stage.draw(s, 1, now, null);
    return sceneSum(s);
  };
  const plain = frame(lab, []);
  const dark = frame(dim, []);
  assert.ok(dark[1] < plain[1] * 0.75, `grade did not darken: ${dark[1]} vs ${plain[1]}`);
  const idle = frame(lit, [agent('r', 'read')]);
  const busy = frame(lit, [agent('w', 'write')]);
  assert.ok(busy[0] - busy[1] > idle[0] - idle[1] + 2000, `no red glow at the busy desk: ${busy} vs ${idle}`);
});

test('name tags stay centred on the sprite while it walks (half pixels)', async () => {
  const { layoutRoom } = await import('../src/iso/room.ts');
  const stage = newStage();
  const iso = layoutRoom(RECT.w, RECT.h * 2, lab, 1, 12).iso;
  const walker = agent('w', 'write');
  let now = NOW;
  let checked = 0;
  for (let i = 0; i < 160; i++) {
    now += 50;
    stage.sync([walker], now);
    stage.update(0.05, now);
    const a = stage.actors()[0];
    const s = new Screen(RECT.w, RECT.h + 2);
    stage.draw(s, i * 0.05, now, 'w');
    const [sx] = iso.toScreen(a.gx, a.gy, 0);
    const want = RECT.x + Math.round(sx);
    for (const l of stage.labels()) {
      if (l.x <= RECT.x || l.x + l.w >= RECT.x + RECT.w) continue; // clamped at an edge
      assert.equal(l.x + Math.floor(l.w / 2), want, `frame ${i}: label ${JSON.stringify(l)} vs sprite column ${want} (sx ${sx.toFixed(2)})`);
      checked++;
    }
  }
  assert.ok(checked > 20);
});

test('labels are cleared when there is nothing to draw', () => {
  const stage = newStage({ x: 0, y: 1, w: 100, h: 30 });
  const now = run(stage, [agent('a', 'write')], 4);
  stage.draw(new Screen(100, 32), 0, now, 'a');
  assert.ok(stage.labels().length > 0);
  stage.layout({ x: 0, y: 1, w: 0, h: 0 });
  stage.draw(new Screen(100, 32), 0.1, now, 'a');
  assert.deepEqual(stage.labels(), []);
});

test('contact shadows get the full lamp light, like the floor around them', async () => {
  const { layoutRoom } = await import('../src/iso/room.ts');
  const spot = { gx: 0, gy: 0 };
  const theme = { ...lab, lighting: { ambient: [60, 60, 60] as RGB, lights: () => [{ ...spot, gz: 0, color: [255, 255, 255] as RGB, radius: 3, intensity: 0.5 }] } };
  const withActor = new Stage(theme);
  withActor.layout(RECT);
  const now = run(withActor, [agent('w', 'read')], 10);
  const a = withActor.actors()[0];
  Object.assign(spot, { gx: a.gx, gy: a.gy });
  const empty = new Stage(theme);
  empty.layout(RECT);
  type Px = { w: number; h: number; data: Int32Array };
  const frame = (st: Stage, lit: boolean) => {
    st.lit = lit;
    st.draw(new Screen(120, 36), 1, now, null);
    return Int32Array.from((st as unknown as { canvas: Px }).canvas.data);
  };
  const g = (v: number) => (v >> 8) & 255;
  const rawA = frame(withActor, false);
  const litA = frame(withActor, true);
  const rawB = frame(empty, false);
  const litB = frame(empty, true);
  const [sx, sy] = layoutRoom(RECT.w, RECT.h * 2, lab, 1, 12).iso.toScreen(a.gx, a.gy, 0);
  let n = 0;
  for (let i = 0; i < rawA.length; i++) {
    if (Math.abs((i % 120) - sx) > 9 || Math.abs(Math.floor(i / 120) - sy) > 3) continue; // around the feet
    const ratio = g(rawA[i]) / g(rawB[i]);
    if (!(g(rawB[i]) > 100 && Math.abs(ratio - 0.72) < 0.03)) continue; // a shadow pixel
    n++;
    const shadowGain = g(litA[i]) / g(rawA[i]);
    const floorGain = g(litB[i]) / g(rawB[i]);
    assert.ok(shadowGain > floorGain * 0.9, `pixel ${i}: shadow lit ${shadowGain.toFixed(2)}x, floor ${floorGain.toFixed(2)}x`);
  }
  assert.ok(n >= 1, `found ${n} shadow pixels`);
});
