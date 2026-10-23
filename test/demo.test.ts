import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoSource } from '../src/demo/source.ts';
import type { AgentInfo } from '../src/agents.ts';

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
