import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DEMO_XP, DemoSource } from '../src/demo/source.ts';
import type { AgentInfo, Gain } from '../src/agents.ts';
import { Crews } from '../src/pet/crew.ts';
import { meters } from '../src/pet/meters.ts';

const START = 1_700_000_000_000;

function simulate(src: DemoSource, seconds: number, step = 0.5): AgentInfo[][] {
  const frames: AgentInfo[][] = [];
  for (let t = 0; t <= seconds; t += step) frames.push(src.poll(START + t * 1000));
  return frames;
}

test('crew forms within 30 seconds', () => {
  const frames = simulate(new DemoSource(7, START), 30);
  const last = frames[frames.length - 1];
  assert.ok(last.length >= 3, `only ${last.length} agents`);
  const leads = last.filter((a) => a.role === 'lead');
  assert.equal(leads.length, 2);
  const sub = last.find((a) => a.role === 'sub');
  assert.ok(sub, 'no subagent');
  assert.ok(leads.some((l) => l.id === sub.parentId));
  assert.ok(sub.agentType);
});

test('same seed and clock give identical output', () => {
  const a = simulate(new DemoSource(42, START), 20);
  const b = simulate(new DemoSource(42, START), 20);
  assert.deepEqual(a, b);
});

test('subagents finish and leave', () => {
  const frames = simulate(new DemoSource(3, START), 150);
  const doneIds = new Set(frames.flat().filter((a) => a.activity === 'done').map((a) => a.id));
  assert.ok(doneIds.size > 0, 'no one finished');
  const last = frames[frames.length - 1];
  const stillThere = [...doneIds].filter((id) => last.some((a) => a.id === id));
  assert.ok(stillThere.length < doneIds.size, 'finished agents never left');
});

test('leads wait for you every minute or two, while most of the crew keeps busy', () => {
  const step = 0.5;
  const frames = simulate(new DemoSource(7, START), 900, step);
  for (const id of ['demo-atlas', 'demo-nova']) {
    const starts: number[] = [];
    const lens: number[] = [];
    let from = -1;
    frames.forEach((list, k) => {
      const idle = list.find((a) => a.id === id)!.activity === 'idle';
      if (idle && from < 0) from = k * step;
      if (!idle && from >= 0) {
        starts.push(from);
        lens.push(k * step - from);
        from = -1;
      }
    });
    assert.ok(starts.length >= 6, `${id} waited ${starts.length} times in 15 minutes`);
    assert.ok(starts[0] <= 60, `${id} first waits at ${starts[0]} s`);
    for (const l of lens) assert.ok(l >= 25 && l <= 45 + step, `${id} waited ${l} s`);
    // A wait starts at the end of a step (at most 7 s) once it is due.
    for (let k = 1; k < starts.length; k++) assert.ok(starts[k] - starts[k - 1] >= 60 && starts[k] - starts[k - 1] <= 120 + 7 + step, `${id} waits ${starts[k] - starts[k - 1]} s apart`);
  }
  const all = frames.flat();
  const busy = all.filter((a) => a.activity !== 'idle').length / all.length;
  assert.ok(busy >= 0.75, `only ${(100 * busy).toFixed(0)}% busy`);
});

test('activities vary and events are emitted', () => {
  const src = new DemoSource(11, START);
  simulate(src, 40);
  const events = src.drainEvents();
  assert.ok(events.length > 10, `${events.length} events`);
  assert.ok(new Set(events.map((e) => e.activity)).size >= 5);
  assert.deepEqual(src.drainEvents(), []);
  for (const e of events) assert.ok(e.detail.length > 0 && e.detail.length <= 48, e.detail);
});

test('the demo crew carries believable vitals', () => {
  const start = 1_700_000_000_000;
  const src = new DemoSource(7, start);
  let agents = src.poll(start);
  const lastCtx = new Map<string, number>();
  let compacted = false;
  let ended = 0;
  let now = start;
  for (; now <= start + 600_000; now += 250) {
    agents = src.poll(now);
    for (const a of agents) {
      const v = a.vitals!;
      assert.ok(v, `${a.name} has no vitals`);
      assert.ok(v.context > 0 && v.context <= v.window, `${a.name} context ${v.context}`);
      const prev = lastCtx.get(a.id);
      if (prev !== undefined && v.context < prev) compacted = true;
      lastCtx.set(a.id, v.context);
      for (const e of v.errors) assert.ok(now - e <= 600_000 && e <= now, `${a.name} stale error`);
      assert.deepEqual(v.errors, [...v.errors].sort((x, y) => x - y));
      if (a.activity === 'idle' || a.activity === 'done') {
        assert.ok(v.turnEndedAt > 0, `${a.name} ${a.activity} without turnEndedAt`);
        ended++;
      }
    }
  }
  assert.ok(compacted, 'context never compacted');
  assert.ok(ended > 0, 'nobody ever idled');
  const t = now - 250;
  assert.ok(agents.length >= 2);
  for (const a of agents) {
    const v = a.vitals!;
    assert.match(v.model, /^claude-(opus|sonnet)-5-5$/);
    assert.ok(v.outTokens > 0);
    assert.ok(v.busySince > 0 && v.busySince <= t);
    if (a.role === 'lead') assert.ok(v.title && v.branch);
  }
  // A polled copy is the caller's: scribbling on it changes nothing later.
  const a0 = agents[0];
  const before = [...a0.vitals!.errors];
  a0.vitals!.errors.push(1, 2, 3);
  const again = src.poll(now).find((a) => a.id === a0.id)!;
  assert.deepEqual(again.vitals!.errors.slice(0, before.length), before);
  assert.ok(!again.vitals!.errors.includes(3));
});

test('the demo crew\'s energy differs, and a lead back from a wait starts afresh', () => {
  const start = 1_700_000_000_000;
  const src = new DemoSource(7, start);
  const prev = new Map<string, AgentInfo>();
  let low = 0;
  let all = 0;
  let back = 0;
  for (let now = start; now <= start + 600_000; now += 250) {
    for (const a of src.poll(now)) {
      all++;
      if (meters(a.vitals!, now).energy.value < 0.95) low++;
      const p = prev.get(a.id);
      // A wait of 20 s or more is a rest (the demo's day runs fast).
      if (a.role === 'lead' && p?.activity === 'idle' && a.activity !== 'idle' && now - p.since >= 20_000) {
        assert.equal(a.vitals!.busySince, now, `${a.name} back at ${now - start}`);
        back++;
      }
      prev.set(a.id, a);
    }
  }
  assert.ok(back > 0, 'no lead came back from a wait');
  assert.ok(low > 0 && low < all, `${low} of ${all} below 95%`);
});

test('demo subagents have no session title (their name already says it)', () => {
  const src = new DemoSource(7, START);
  const subs = simulate(src, 60).flat().filter((a) => a.role === 'sub');
  assert.ok(subs.length > 0);
  for (const a of subs) assert.equal(a.vitals!.title, '', a.name);
});

test('the demo crew moves exactly as pinned', () => {
  const start = 1_700_000_000_000;
  const src = new DemoSource(7, start);
  const moves: unknown[] = [];
  for (let t = start; t <= start + 120_000; t += 250)
    moves.push(src.poll(t).map((a) => ({ id: a.id, name: a.name, role: a.role, parentId: a.parentId, activity: a.activity, detail: a.detail, since: a.since })));
  const hash = createHash('sha256').update(JSON.stringify(moves)).digest('hex');
  // Pins the crew's moves, so vitals and conversations never draw from the
  // crew's random stream. Repinned for office life: subagents spin up for
  // six to nine seconds (time for a kick-off huddle round their lead) and
  // on every other wait of its lead the team waits too (time for a
  // stand-up).
  assert.equal(hash, 'b23c3a0c12eb3e957dd4cf77ac3f0b09d68788bcb132be3c6980b3207fc41238');
});

test('demo subagents spin up for six to nine seconds before their first task', () => {
  const frames = simulate(new DemoSource(7, START), 400);
  const born = new Map<string, number>();
  const first = new Map<string, AgentInfo>();
  for (const a of frames.flat()) {
    if (a.role !== 'sub') continue;
    if (!born.has(a.id)) born.set(a.id, a.since);
    if (!first.has(a.id) && a.detail !== 'spinning up') first.set(a.id, a);
  }
  let n = 0;
  for (const [id, a] of first) {
    if (a.activity === 'idle') continue; // its team was waiting first (see below)
    const secs = (a.since - born.get(id)!) / 1000;
    assert.ok(secs >= 6 && secs <= 9, `${id} spun up for ${secs} s`);
    n++;
  }
  assert.ok(n >= 5, `${n} subagents started`);
});

test('on every other wait of a lead its team waits with it: three or more of a crew idle at once', () => {
  const frames = simulate(new DemoSource(7, START), 400);
  const idle = (list: AgentInfo[], crew: string) => list.filter((a) => a.crew === crew && a.activity === 'idle');
  for (const crew of ['demo:animus', 'demo:webshop']) {
    assert.ok(frames.some((list) => idle(list, crew).length >= 3), `${crew}: never three waiting`);
    // only while its lead waits
    for (const list of frames) if (idle(list, crew).some((a) => a.role === 'sub')) assert.ok(idle(list, crew).some((a) => a.role === 'lead'), `${crew}: a subagent waits alone`);
  }
});

test('each demo agent has a believable conversation', () => {
  const src = new DemoSource(7, START);
  const frames = simulate(src, 300);
  for (const a of frames[frames.length - 1]) {
    const log = src.chat(a.id)!;
    // A subagent spun up a moment ago has only its task so far.
    assert.ok(log.length >= (a.role === 'lead' ? 2 : 1), `${a.name}: ${log.length} entries`);
    assert.equal(log[0].kind, 'user', `${a.name} starts with a prompt`);
    for (const b of log) {
      if (b.kind === 'tool') assert.ok(b.text && b.activity && (b.outcome === 'ok' || b.outcome === 'failed'), JSON.stringify(b));
      else if (b.kind === 'thinking') assert.equal(b.text, '');
      else assert.ok(b.text.length > 0, JSON.stringify(b));
    }
    for (let i = 1; i < log.length; i++) assert.ok(!(log[i].kind === 'thinking' && log[i - 1].kind === 'thinking'), 'one mark per run of thinking');
    assert.equal(new Set(log.map((b) => b.id)).size, log.length, 'ids are unique');
  }
  // The leads have waited by now: a summary long enough to fold, then your next request.
  const atlas = src.chat('demo-atlas')!;
  assert.ok(atlas.some((b) => b.kind === 'agent' && b.text.length > 300), 'no long summary');
  assert.ok(atlas.filter((b) => b.kind === 'user').length >= 2, 'no follow-up request');
  assert.equal(src.chat('nobody'), null);
});

test('demo agents take no messages', () => {
  assert.equal(new DemoSource(7, START).reach('demo-atlas'), 'demo agents take no messages');
});

test('the demo crew earns XP as a live one would: finished turns, passing checks, finished runs', () => {
  const src = new DemoSource(7, START);
  const frames = simulate(src, 600);
  const gains = src.drainGains();
  assert.deepEqual(src.drainGains(), []);
  const kinds = new Set(gains.map((g) => g.kind));
  assert.deepEqual([...kinds].sort(), ['check', 'subagent', 'turn']);
  const seen = new Map(frames.flat().map((a) => [a.id, a]));
  for (const g of gains) {
    const a = seen.get(g.agent)!;
    assert.ok(a, g.agent);
    assert.equal(g.crew, `demo:${a.project}`);
    assert.equal(a.crew, g.crew);
    assert.equal(g.role, a.role === 'lead' ? 'lead' : a.agentType);
    if (g.kind === 'turn') assert.equal(a.role, 'lead');
    if (g.kind === 'subagent') assert.equal(a.role, 'sub');
    assert.ok(g.at >= START && g.at <= START + 600_000);
  }
  // Every lead's wait is a finished turn.
  const waits = frames.flatMap((list, k) => list.filter((a) => a.role === 'lead' && a.activity === 'idle' && frames[k - 1]?.find((b) => b.id === a.id)?.activity !== 'idle'));
  assert.equal(gains.filter((g) => g.kind === 'turn').length, waits.length);
  // The same again for the same seed.
  const again = new DemoSource(7, START);
  simulate(again, 600);
  assert.deepEqual(again.drainGains(), gains);
});

test('counted, the demo crew levels up: nova reaches ★4 with its first finished turn', () => {
  const src = new DemoSource(7, START);
  const crews = new Crews();
  for (const [crew, roles] of Object.entries(DEMO_XP)) for (const [role, xp] of Object.entries(roles)) crews.give(crew, role, xp);
  assert.equal(crews.level('demo:animus', 'lead'), 10);
  assert.equal(crews.level('demo:webshop', 'lead'), 3);
  const ups: string[] = [];
  let first: Gain | undefined; // nova's first finished turn
  for (let t = 0; t <= 300; t += 0.5) {
    src.poll(START + t * 1000);
    for (const g of src.drainGains()) {
      if (!first && g.agent === 'demo-nova' && g.kind === 'turn') first = g;
      const a = crews.count(g);
      if (a && a.level > a.was) ups.push(`${a.crew} ${a.role} ★${a.level} ${g.agent} ${g.key}`);
    }
  }
  assert.ok(first && first.at - START <= 60_000, 'nova finished no turn in its first minute');
  assert.ok(ups.includes(`demo:webshop lead ★4 demo-nova ${first.key}`), ups.join(', '));
});
