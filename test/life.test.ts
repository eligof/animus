import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEATS, SLEEP_AFTER } from '../src/world/life.ts';
import { hub } from '../src/world/layout.ts';
import type { Layout } from '../src/world/types.ts';
import type { Pose } from '../src/world/character.ts';
import { LOOP, frameOf } from '../src/art/figure/rig.ts';
import type { FigureFrame } from '../src/world/frame.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import { mines } from '../src/worlds/mines.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import type { AgentInfo, Activity } from '../src/agents.ts';

const NOW = 1_700_000_000_000;
// A scene that plans the smallest room (72 units), as these were tuned in.
const RECT = { x: 0, y: 1, w: 80, h: 21 };

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});
// Waiting, but only just: stays awake however long the test runs.
const awake = (id: string, now: number, extra: Partial<AgentInfo> = {}) => agent(id, 'idle', { since: now - 3000, ...extra });

// The mines with a fixed set of spots round the hub, so these tests do not
// hang on how the world itself dresses its floor.
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

function newStage(world: WorldDef = lively, r = RECT): Stage {
  const stage = new Stage(world);
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

const byId = (stage: Stage, id: string) => stage.actors().find((a) => a.info.id === id)!;
const pose = (stage: Stage, a: Actor, now: number): Pose => stage.lookOf(a, now).pose;
const BEAT_POSES = new Set<Pose>(['glance', 'lean', 'stretch', 'scratch', 'tap']);

test('idle agents wander between spots and do the fitting thing at each', () => {
  const stage = newStage();
  const ids = ['i1', 'i2', 'i3'];
  const visited = new Map<string, Set<string>>(ids.map((id) => [id, new Set()]));
  const poses = new Set<Pose>();
  let at = 0;
  let frames = 0;
  run(stage, (n) => ids.map((id) => awake(id, n)), 60, NOW, (now) => {
    for (const a of stage.actors()) {
      frames++;
      const p = pose(stage, a, now);
      poses.add(p);
      const e = a.mind.errand;
      if (e?.kind === 'visit' && e.arrived) {
        at++;
        visited.get(a.info.id)!.add(e.poi.kind);
        if (e.poi.kind === 'seat') assert.equal(p === 'sit' || a.mind.gestures.length > 0, true, 'not sitting on a seat');
        if (e.poi.kind === 'dance') assert.ok(p === 'dance' || a.mind.gestures.length > 0, 'not dancing on the dance floor');
      }
      assert.notEqual(p, 'sleep', 'fell asleep while still waiting');
    }
  });
  for (const [id, kinds] of visited) assert.ok(kinds.size >= 1, `${id} never got anywhere`);
  const all = new Set([...visited.values()].flatMap((k) => [...k]));
  assert.ok(all.size >= 3, `only ${[...all].join(', ')} visited`);
  assert.ok(at / frames > 0.2, `only ${((100 * at) / frames).toFixed(0)}% of the time spent at a spot`);
  assert.ok(poses.size >= 4, `poses: ${[...poses].join(', ')}`);
});

test('after a long wait an idle agent goes to sleep at the idle prop', () => {
  const stage = newStage();
  // Waiting since well past SLEEP_AFTER.
  const now = run(stage, () => [agent('z', 'idle', { since: NOW - (SLEEP_AFTER + 5) * 1000 })], 30);
  const a = byId(stage, 'z');
  assert.equal(a.mind.errand?.kind, 'nap');
  assert.equal(a.station?.kind, 'idle');
  assert.equal(pose(stage, a, now), 'sleep');
});

test('chat and building go on right up to the nap, not just early in the wait', () => {
  const stage = newStage();
  // Held a few seconds short of SLEEP_AFTER: long into the wait, still awake.
  const late = (id: string, n: number) => agent(id, 'idle', { since: n - (SLEEP_AFTER - 3) * 1000 });
  const did = new Set<string>();
  run(stage, (n) => [late('ann', n), late('bob', n), late('cy', n)], 120, NOW, (now) => {
    for (const a of stage.actors()) {
      if (a.mind.errand) did.add(a.mind.errand.kind);
      assert.notEqual(pose(stage, a, now), 'sleep', 'fell asleep while still awake');
    }
  });
  assert.ok(did.has('chat'), `never chatted (${[...did].join(', ')})`);
  assert.ok(did.has('haul'), `never helped build (${[...did].join(', ')})`);
});

test('a sleeper gets up every minute or so for a few seconds, then lies back down', () => {
  const stage = newStage();
  const since = NOW - (SLEEP_AFTER + 5) * 1000;
  const ids = ['z1', 'z2'];
  const spells = new Map<string, Array<[number, number]>>(ids.map((id) => [id, []]));
  const rose = new Map<string, number>();
  const back = new Map<string, number>(ids.map((id) => [id, 0]));
  const poses = new Set<Pose>();
  run(stage, () => ids.map((id) => agent(id, 'idle', { since })), 240, NOW, (now) => {
    const t = (now - NOW) / 1000;
    for (const id of ids) {
      const a = byId(stage, id);
      const p = pose(stage, a, now);
      if (!stage.life.sleeping(a)) {
        if (!rose.has(id)) rose.set(id, t);
        poses.add(p);
        assert.notEqual(p, 'sleep', `${id} sleeps while up`);
        continue;
      }
      if (rose.has(id)) {
        spells.get(id)!.push([rose.get(id)!, t]);
        rose.delete(id);
      }
      // Back in bed at the idle prop after a spell.
      if (spells.get(id)!.length && a.station?.kind === 'idle' && !a.path.length && p === 'sleep') back.set(id, back.get(id)! + 1);
    }
  });
  for (const id of ids) {
    const s = spells.get(id)!;
    assert.ok(s.length >= 2, `${id} got up ${s.length} times in 4 minutes`);
    for (const [from, to] of s) assert.ok(to - from >= 6 - 0.1 && to - from <= 10 + 0.1, `${id} up for ${(to - from).toFixed(1)} s`);
    for (let k = 1; k < s.length; k++) {
      const gap = s[k][0] - s[k - 1][1];
      assert.ok(gap >= 60 - 0.1 && gap <= 100, `${id} slept only ${gap.toFixed(1)} s between spells`);
    }
    assert.ok(back.get(id)! > 0, `${id} never lay back down`);
  }
  const [s1, s2] = ids.map((id) => spells.get(id)!.map(([from]) => from));
  assert.ok(s1.some((t, k) => s2[k] === undefined || Math.abs(t - s2[k]) > 2), 'sleepers get up in lockstep');
  assert.ok(['stretch', 'drink', 'walk'].some((p) => poses.has(p as Pose)), `up but only ${[...poses].join(', ')}`);
});

test('nobody asks a sleeper to chat, and sleepers never haul', () => {
  const stage = newStage();
  const since = NOW - (SLEEP_AFTER + 5) * 1000;
  const sleepers = ['s1', 's2', 's3'];
  let up = 0;
  // Long enough for the sleepers to get up a few times each.
  run(stage, (n) => [awake('w', n), ...sleepers.map((id) => agent(id, 'idle', { since }))], 400, NOW, () => {
    for (const id of sleepers) {
      const a = byId(stage, id);
      const e = a.mind.errand;
      assert.ok(e?.kind !== 'chat' && e?.kind !== 'haul', `${id} on a ${e?.kind}`);
      if (!stage.life.sleeping(a)) up++;
    }
  });
  assert.ok(up > 0, 'no sleeper ever got up');
});

test('two idle agents meet and chat face to face, with little pictures', () => {
  const stage = newStage();
  let met = false;
  const said = new Set<string>();
  run(stage, (n) => [awake('ann', n), awake('bob', n)], 120, NOW, (now) => {
    const a = byId(stage, 'ann');
    const b = byId(stage, 'bob');
    const ea = a.mind.errand;
    const eb = b.mind.errand;
    if (ea?.kind === 'chat' && eb?.kind === 'chat' && ea.arrived && eb.arrived && a.mind.gestures.length === 0 && b.mind.gestures.length === 0) {
      assert.equal(ea.with, 'bob');
      assert.equal(eb.with, 'ann');
      const la = stage.lookOf(a, now);
      const lb = stage.lookOf(b, now);
      assert.equal(la.pose, 'chat');
      assert.equal(lb.pose, 'chat');
      assert.ok(la.face && Math.hypot(la.face.x - b.x, la.face.y - b.y) < 1e-6, 'ann looks elsewhere');
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) < 8, 'too far apart to chat');
      met = true;
      for (const m of [a.mind, b.mind]) if (m.emote && m.emote.born <= stage.life.clock) said.add(m.emote.e);
    }
  });
  assert.ok(met, 'never chatted');
  assert.ok([...said].some((e) => ['note', 'heart', 'idea', 'question'].includes(e)), `said ${[...said].join(', ')}`);
});

test('an explosion makes those nearby flinch with a start, then look at it', () => {
  const stage = newStage();
  let now = run(stage, () => [agent('w1', 'write'), agent('w2', 'write')], 12);
  const w2 = byId(stage, 'w2');
  const crew = [agent('w1', 'error', { since: now }), agent('w2', 'write')];
  let flinched = false;
  let looked = false;
  now = run(stage, () => crew, 2.5, now, (n) => {
    const p = pose(stage, w2, n);
    if (p === 'flinch') flinched = true;
    const g = w2.mind.gestures.find((q) => q.at <= stage.life.clock && stage.life.clock < q.until);
    if (flinched && p === 'idle' && g?.face) looked = true;
  });
  assert.ok(flinched, 'never flinched');
  assert.ok(looked, 'never looked toward the blast');
  void now;
});

test('the bang shows a start or a sweat drop over those near', () => {
  const stage = newStage();
  const now = run(stage, () => [agent('w1', 'write'), agent('w2', 'write')], 12);
  const w2 = byId(stage, 'w2');
  run(stage, () => [agent('w1', 'error', { since: now }), agent('w2', 'write')], 0.1, now);
  assert.ok(w2.mind.emote && ['excl', 'sweat'].includes(w2.mind.emote.e), `emote ${w2.mind.emote?.e}`);
});

test('when someone finishes, the others cheer them', () => {
  const stage = newStage();
  let now = run(stage, (n) => [agent('w1', 'write'), awake('i1', n), agent('w2', 'write')], 12);
  const i1 = byId(stage, 'i1');
  const w2 = byId(stage, 'w2');
  const cheered = new Set<string>();
  now = run(stage, (n) => [agent('w1', 'done', { since: now }), awake('i1', n), agent('w2', 'write')], 1.5, now, (n) => {
    for (const a of [i1, w2]) if (pose(stage, a, n) === 'cheer') cheered.add(a.info.id);
  });
  assert.ok(cheered.has('i1'), 'the idle agent did not cheer');
  assert.ok(cheered.has('w2'), 'the worker next door did not cheer');
  assert.ok(i1.mind.emote && ['star', 'heart'].includes(i1.mind.emote.e));
});

test('workers keep at it, with an occasional break, and cheer a new file', () => {
  const stage = newStage();
  let now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  const count = new Map<Pose, number>();
  now = run(stage, () => [agent('w', 'write')], 120, now, (n) => {
    const p = pose(stage, w, n);
    count.set(p, (count.get(p) ?? 0) + 1);
  });
  const total = [...count.values()].reduce((a, b) => a + b, 0);
  assert.ok((count.get('write') ?? 0) / total >= 0.75, `writing only ${((100 * (count.get('write') ?? 0)) / total).toFixed(0)}% of the time`);
  assert.ok([...BEAT_POSES].some((p) => count.has(p)), `no beats: ${[...count.keys()].join(', ')}`);
  w.mind.celebrated = -Infinity;
  w.mind.gestures = [];
  let cheered = false;
  run(stage, () => [agent('w', 'write', { detail: 'Edit other.ts' })], 0.5, now, (n) => {
    if (pose(stage, w, n) === 'cheer') cheered = true;
  });
  assert.ok(cheered, 'no cheer for a new file');
});

test('a lead waves to its new subagent, and the subagent answers a bolt with a start and a wave', () => {
  const stage = newStage();
  let now = run(stage, () => [agent('L', 'write', { role: 'lead' })], 8);
  const lead = byId(stage, 'L');
  let waved = false;
  now = run(stage, () => [agent('L', 'write', { role: 'lead' }), agent('S', 'read', { parentId: 'L' })], 1.5, now, (n) => {
    if (pose(stage, lead, n) === 'wave') waved = true;
  });
  assert.ok(waved, 'the lead never waved');
  const sub = byId(stage, 'S');
  let startled = false;
  let answered = false;
  run(stage, () => [agent('L', 'delegate', { role: 'lead', since: now }), agent('S', 'read', { parentId: 'L' })], 4, now, (n) => {
    if (sub.mind.emote?.e === 'excl') startled = true;
    if (pose(stage, sub, n) === 'wave') answered = true;
  });
  assert.ok(startled, 'no ! over the subagent');
  assert.ok(answered, 'the subagent never waved back');
});

test('idle agents wave hello to a newcomer', () => {
  const stage = newStage();
  const now = run(stage, (n) => [awake('i1', n), awake('i2', n)], 6);
  let hello = 0;
  run(stage, (n) => [awake('i1', n), awake('i2', n), agent('new', 'read')], 2, now, (n) => {
    for (const id of ['i1', 'i2']) {
      const a = byId(stage, id);
      if (pose(stage, a, n) === 'wave') hello++;
    }
  });
  assert.ok(hello > 0, 'nobody said hello');
});

test('characters passing each other sometimes wave', () => {
  const stage = newStage();
  let waves = 0;
  const met = (stage.life as unknown as { met: Map<string, number> }).met;
  run(stage, (n) => ['a', 'b', 'c', 'd'].map((id) => awake(id, n)), 120, NOW, () => {
    for (const a of stage.actors()) if (a.mind.gestures.some((g) => g.pose === 'wave' && g.at <= stage.life.clock && stage.life.clock < g.until)) waves++;
  });
  assert.ok(met.size > 0, 'nobody ever passed anybody');
  assert.ok(waves > 0, 'nobody waved');
});

test('emotes pop up over heads, a few at a time, and are gone within 2.5 s', () => {
  const stage = newStage({ ...lively }, { x: 0, y: 1, w: 120, h: 33 });
  let now = run(stage, (n) => [agent('w1', 'write'), awake('i1', n), awake('i2', n), awake('i3', n), awake('i4', n), agent('w2', 'write')], 12);
  const crew = (n: number) => [agent('w1', 'done', { since: now }), awake('i1', n), awake('i2', n), awake('i3', n), awake('i4', n), agent('w2', 'write')];
  let most = 0;
  let any = 0;
  const lives: number[] = [];
  now = run(stage, crew, 6, now, (n) => {
    const f = stage.frame(n, null)!;
    const shown = f.figures.filter((g) => g.emote).length;
    assert.equal(shown, stage.emotesShown);
    for (const g of f.figures) if (g.emote) assert.ok(g.emote.t >= 0 && g.emote.t <= 2.5, `emote ${g.emote.kind} ${g.emote.t.toFixed(2)} s old`);
    most = Math.max(most, shown);
    any += shown;
    for (const a of stage.actors()) {
      const e = a.mind.emote;
      if (e) {
        lives.push(e.until - e.born);
        assert.ok(e.until > stage.life.clock, 'an expired emote still shows');
      }
    }
  });
  assert.ok(any > 0, 'no emote was ever drawn');
  assert.ok(most <= 3, `${most} emotes at once`);
  assert.ok(lives.every((l) => l >= 1 && l <= 2.5), `emote lifetimes ${Math.min(...lives)}..${Math.max(...lives)}`);
  // Group emotes do not all pop on the same tick.
  const borns = stage.actors().map((a) => a.mind.emote?.born).filter((b): b is number => b !== undefined);
  assert.ok(new Set(borns).size === borns.length || borns.length < 2, 'emotes fired in lockstep');
});

test('labels never cover an emote or each other', () => {
  const stage = new Stage(lively);
  stage.layout({ x: 0, y: 1, w: 150, h: 46 });
  let now = run(stage, (n) => ['a', 'b', 'c', 'd', 'e'].map((id) => awake(id, n)), 20);
  now = run(stage, (n) => [...['a', 'b', 'c', 'd', 'e'].map((id) => awake(id, n)), agent('f', 'done', { since: now })], 3, now, (n) => {
    const f = stage.frame(n, null)!;
    const ls = stage.labels();
    // Over every emote, the cells it shows in stay free of labels.
    for (const g of f.figures) {
      if (!g.emote) continue;
      const c = f.camera;
      const x = c.ox + (g.x - g.y) * c.s;
      const top = c.oy + ((g.x + g.y) * c.s) / 2 - 20 * c.s;
      const bottom = c.oy + ((g.x + g.y) * c.s) / 2 - 15.5 * c.s;
      const col = c.cells.x + Math.floor(x / c.cell.w);
      for (let row = c.cells.y + Math.floor(top / c.cell.h) + 1; row < c.cells.y + Math.floor(bottom / c.cell.h); row++) {
        for (const l of ls) assert.ok(l.y !== row || col < l.x || col >= l.x + l.w, `a label covers ${g.id}'s emote`);
      }
    }
    for (let i = 0; i < ls.length; i++) {
      for (let j = i + 1; j < ls.length; j++) {
        const a = ls[i];
        const b = ls[j];
        assert.ok(a.y !== b.y || a.x + a.w <= b.x || b.x + b.w <= a.x, `labels overlap: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
      }
    }
  });
  void now;
});

test('the critter potters about near home, keeps clear of everything, and loves a pet', () => {
  const stage = newStage();
  const cr = stage.pet();
  assert.ok(cr, 'no critter by the pet spot');
  const home = { ...cr.home };
  let moved = 0;
  let petted = false;
  let last = { x: cr.x, y: cr.y };
  run(stage, (n) => ['p1', 'p2', 'p3'].map((id) => awake(id, n)), 150, NOW, (now) => {
    assert.ok(Math.hypot(cr.x - home.x, cr.y - home.y) <= cr.radius + 0.5, `strayed to ${cr.x.toFixed(1)},${cr.y.toFixed(1)}`);
    moved += Math.hypot(cr.x - last.x, cr.y - last.y);
    last = { x: cr.x, y: cr.y };
    for (const a of stage.actors()) {
      const e = a.mind.errand;
      if (e?.kind === 'pet' && e.arrived && pose(stage, a, now) === 'pet') {
        petted = true;
        assert.ok(Math.hypot(a.x - cr.x, a.y - cr.y) < 5, 'petting from afar');
      }
    }
  });
  assert.ok(moved > 10, `the critter barely moved (${moved.toFixed(1)})`);
  assert.ok(petted, 'nobody petted it');
});

test('choices are deterministic per seed', () => {
  const trace = () => {
    const stage = newStage();
    const out: string[] = [];
    run(stage, (n) => [awake('a', n), awake('b', n), agent('c', 'done'), agent('w', 'write')], 30, NOW, (now) => {
      if ((now - NOW) % 1000 === 0) out.push(stage.actors().map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)},${pose(stage, a, now)}`).join(';'));
    });
    return out.join('|');
  };
  assert.equal(trace(), trace());
});

test('a long, busy session stays bounded', () => {
  const stage = newStage();
  const acts: Activity[] = ['write', 'read', 'idle', 'search', 'done', 'run', 'error', 'idle', 'think', 'web'];
  const met = (stage.life as unknown as { met: Map<string, number> }).met;
  let now = NOW;
  for (let round = 0; round < 60; round++) {
    // Agents come and go; activities cycle through everything.
    const crew = Array.from({ length: 4 + (round % 5) }, (_, i) => agent(`b${(i + round) % 9}`, acts[(i * 3 + round) % acts.length], { since: now }));
    now = run(stage, () => crew, 6, now, () => {
      const cast = stage.actors();
      assert.ok(cast.length <= 9, `${cast.length} actors`);
      for (const a of cast) {
        assert.ok(a.mind.gestures.length <= 4, `${a.info.id} has ${a.mind.gestures.length} gestures`);
        if (a.mind.emote) assert.ok(a.mind.emote.until - a.mind.emote.born <= 2.5);
      }
    });
    assert.ok((stage as unknown as { particles: unknown[] }).particles.length <= 1500);
    assert.ok((stage as unknown as { glyphs: unknown[] }).glyphs.length < 200);
    assert.ok(stage.builds().length <= 2, `${stage.builds().length} builds`);
    assert.ok(met.size <= 36 + 9, `${met.size} remembered meetings`);
  }
  const cr = stage.pet();
  if (cr) assert.ok(!cr.claimedBy || stage.actors().some((a) => a.info.id === cr.claimedBy), 'the critter is held by someone gone');
});

test('a big frame with a living crew stays within budget', () => {
  const stage = new Stage(lively);
  stage.layout({ x: 0, y: 1, w: 200, h: 57 });
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const crew = (n: number) => Array.from({ length: 12 }, (_, i) => (i < 4 ? awake(`p${i}`, n) : i < 6 ? agent(`p${i}`, 'done') : agent(`p${i}`, acts[i % acts.length])));
  let now = run(stage, crew, 30);
  stage.frame(now, null);
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    now += 55;
    stage.sync(crew(now), now);
    stage.update(0.055, now);
    stage.frame(now, i % 10 === 0 ? 'p0' : null);
  }
  const ms = (performance.now() - t0) / 40;
  // The model's share of a frame: a few ms, leaving the scene its 25.
  assert.ok(ms < 10, `${ms.toFixed(2)} ms per frame`);
});

// A lone writer settled at its desk, then `secs` seconds of work: each
// beat as it began (when, its pose, whether it showed its back).
function beats(office: boolean, secs = 120): Array<{ at: number; pose: Pose; back: boolean }> {
  const stage = newStage();
  stage.office = office;
  const now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  const out: Array<{ at: number; pose: Pose; back: boolean }> = [];
  const [x, y] = [w.x, w.y];
  let was: Pose | null = null;
  run(stage, () => [agent('w', 'write')], secs, now, (n) => {
    const look = stage.lookOf(w, n);
    if (BEAT_POSES.has(look.pose) && look.pose !== was) out.push({ at: n, pose: look.pose, back: look.facing.back });
    if (BEAT_POSES.has(look.pose)) assert.ok(Math.hypot(w.x - x, w.y - y) < 1e-9, `a ${look.pose} moved it`);
    was = look.pose;
  });
  return out;
}

test('at work, a beat every 6 to 15 seconds, the same every run, office life or not: a glance and a nod, leaning in, a stretch, a scratch, a tap', () => {
  const a = beats(false);
  assert.deepEqual(beats(false), a, 'not the same every run');
  assert.ok(a.length >= 7, `${a.length} beats in two minutes`);
  for (let k = 1; k < a.length; k++) {
    const gap = (a[k].at - a[k - 1].at) / 1000;
    assert.ok(gap >= 6 - 0.05 && gap <= 15 + 0.1, `${gap.toFixed(2)} s between beats`);
  }
  assert.ok(new Set(a.map((b) => b.pose)).size >= 4, `only ${[...new Set(a.map((b) => b.pose))].join(', ')}`);
  for (const b of a) assert.equal(b.back, b.pose === 'glance' || b.pose === 'lean' || b.pose === 'tap', `a ${b.pose} ${b.back ? 'with its back to us' : 'facing us'}`);
  assert.ok(beats(true, 60).length >= 3, 'no beats with office life on');
});

test('a beat lasts whole loops of its pose and begins at its first frame', () => {
  for (const [p, , secs] of BEATS) {
    const k = secs / LOOP[p][0];
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && secs >= 1 && secs <= 2.5, `${p}: ${secs} s, ${k} loops`);
  }
  const stage = newStage();
  stage.office = false;
  const now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  w.mind.gestures = [];
  w.mind.micro = 0;
  let first: FigureFrame | undefined;
  run(stage, () => [agent('w', 'write')], 0.5, now, (n) => {
    const g = stage.frame(n)!.figures.find((f) => f.id === 'w')!;
    if (!first && BEAT_POSES.has(g.pose)) first = g;
  });
  assert.ok(first, 'no beat');
  assert.equal(frameOf(first.pose, first.poseT, first.phase), 0, `a ${first.pose} began mid-loop`);
});

test('no beat starts under an emote or over a high-five; a change of activity ends one at once', () => {
  const stage = newStage();
  stage.office = false;
  let now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  const noBeat = (why: string) => (n: number) => assert.ok(!BEAT_POSES.has(pose(stage, w, n)), why);
  w.mind.gestures = [];
  w.mind.micro = 0;
  stage.life.emote(w, 'idea', 2);
  now = run(stage, () => [agent('w', 'write')], 1.5, now, noBeat('a beat under an emote'));
  let began = false;
  now = run(stage, () => [agent('w', 'write')], 1, now, (n) => {
    began ||= BEAT_POSES.has(pose(stage, w, n));
  });
  assert.ok(began, 'no beat once the emote went');
  w.mind.gestures = [];
  w.mind.micro = 0;
  stage.life.gesture(w, 'highfive', 1.3, { hold: false });
  now = run(stage, () => [agent('w', 'write')], 1.2, now, noBeat('a beat over a high-five'));
  w.mind.gestures = [];
  w.mind.emote = null;
  w.mind.micro = 0;
  now = run(stage, () => [agent('w', 'write')], 0.1, now);
  assert.ok(BEAT_POSES.has(pose(stage, w, now)), 'no beat to break into');
  now = run(stage, () => [agent('w', 'read', { since: now })], 0.05, now);
  assert.equal(pose(stage, w, now), 'read');
});
