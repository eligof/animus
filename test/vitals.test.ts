import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rested } from '../src/agents.ts';
import { VitalsReader } from '../src/claude/vitals.ts';

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const reply = (s: number, o: { id?: string; model?: string; input?: number; read?: number; made?: number; out?: number; stop?: string; extra?: object } = {}) => ({
  type: 'assistant',
  timestamp: at(s),
  ...o.extra,
  message: {
    id: o.id ?? `m${s}`,
    model: o.model ?? 'claude-opus-5-5',
    stop_reason: o.stop ?? null,
    usage: { input_tokens: o.input ?? 10, cache_read_input_tokens: o.read ?? 0, cache_creation_input_tokens: o.made ?? 0, output_tokens: o.out ?? 5 },
    content: [{ type: 'text', text: 'hi' }],
  },
});
const result = (s: number, isError = false) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: isError }] } });

test('the latest reply sets the model and how full the context is', () => {
  const r = new VitalsReader();
  r.apply(reply(1, { input: 100, read: 40_000, made: 2_000 }));
  r.apply(reply(2, { model: 'claude-sonnet-5-5', input: 50, read: 60_000, made: 0 }));
  const v = r.snapshot(T0 + 3000);
  assert.equal(v.model, 'claude-sonnet-5-5');
  assert.equal(v.context, 60_050);
  assert.equal(v.window, 200_000);
});

test('a 1M model or a context past 200k means the 1M window', () => {
  const a = new VitalsReader();
  a.apply(reply(1, { extra: { requestedModel: 'claude-opus-5-5[1m]' } }));
  assert.equal(a.snapshot(T0).window, 1_000_000);
  const b = new VitalsReader();
  b.apply(reply(1, { read: 250_000 }));
  assert.equal(b.snapshot(T0).window, 1_000_000);
});

test('output is counted once per message, though every block repeats it', () => {
  const r = new VitalsReader();
  r.apply(reply(1, { id: 'A', out: 300 }));
  r.apply(reply(1, { id: 'A', out: 300 }));
  r.apply(reply(2, { id: 'B', out: 200 }));
  assert.equal(r.snapshot(T0 + 3000).outTokens, 500);
});

test('good tool results build a streak; a failure resets it and is remembered for ten minutes', () => {
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply(result(2));
  r.apply(result(3));
  assert.equal(r.snapshot(T0 + 4000).streak, 3);
  r.apply(result(4, true));
  r.apply(reply(5, { extra: { isApiErrorMessage: true } }));
  const v = r.snapshot(T0 + 6000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, [T0 + 4000, T0 + 5000]);
  assert.deepEqual(r.snapshot(T0 + 4000 + 600_001).errors, [T0 + 5000]);
});

test('a call a hook blocked, or the user turned down, neither fails nor counts', () => {
  const hook = 'PreToolUse:Edit hook error: [gate]: blocked until the facts are stated';
  const rejected = "The user doesn't want to proceed with this tool use. The tool use was rejected.";
  const refused = (s: number, content: unknown) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content }] } });
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply(result(2));
  r.apply(refused(3, hook));
  r.apply(refused(4, [{ type: 'text', text: hook }]));
  r.apply(refused(5, rejected));
  r.apply(refused(6, [{ type: 'text', text: rejected }]));
  let v = r.snapshot(T0 + 7000);
  assert.equal(v.streak, 2);
  assert.deepEqual(v.errors, []);
  // A real failure still counts, hook error in its output or not.
  r.apply(refused(8, `Exit code 1\n${hook}`));
  v = r.snapshot(T0 + 9000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, [T0 + 8000]);
});

test('a call the permission rules denied neither fails nor counts', () => {
  const denied = 'Permission to use Bash with command rm -rf build has been denied.';
  const res = (s: number, content: unknown) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content }] } });
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply(res(2, denied));
  r.apply(res(3, [{ type: 'text', text: denied }]));
  let v = r.snapshot(T0 + 4000);
  assert.equal(v.streak, 1);
  assert.deepEqual(v.errors, []);
  // Output that only begins like a denial is a real failure.
  r.apply(res(5, 'Permission to use /root/x: EACCES'));
  v = r.snapshot(T0 + 6000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, [T0 + 5000]);
});

test('a call a built-in permission check denied neither fails nor counts', () => {
  const denied = 'Permission for this command was denied by a built-in Claude Code check.';
  const res = (s: number, content: unknown) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content }] } });
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply(res(2, denied));
  r.apply(res(3, [{ type: 'text', text: denied }]));
  let v = r.snapshot(T0 + 4000);
  assert.equal(v.streak, 1);
  assert.deepEqual(v.errors, []);
  // A server turning a command away is a real failure.
  r.apply(res(5, 'Permission for this command was denied by the remote: 403'));
  v = r.snapshot(T0 + 6000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, [T0 + 5000]);
});

test('a tool call the user interrupted neither fails nor counts', () => {
  const res = (s: number, content: unknown) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: true, content }] } });
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply(res(2, '[Request interrupted by user for tool use]'));
  let v = r.snapshot(T0 + 3000);
  assert.equal(v.streak, 1);
  assert.deepEqual(v.errors, []);
  r.apply(res(4, '[Request failed with status 500]'));
  v = r.snapshot(T0 + 5000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, [T0 + 4000]);
});

test('the end of a turn, the working stretch, the title and the branch', () => {
  const r = new VitalsReader();
  r.apply({ type: 'user', timestamp: at(0), gitBranch: 'feat/cart', message: { content: 'go' } });
  r.apply(reply(10, { stop: 'end_turn' }));
  r.apply({ type: 'ai-title', aiTitle: 'Fix the cart total' });
  let v = r.snapshot(T0 + 20_000);
  assert.equal(v.turnEndedAt, T0 + 10_000);
  assert.equal(v.busySince, T0);
  assert.equal(v.title, 'Fix the cart total');
  assert.equal(v.branch, 'feat/cart');
  // Two quiet minutes start a new working stretch.
  r.apply(reply(200));
  v = r.snapshot(T0 + 201_000);
  assert.equal(v.busySince, T0 + 200_000);
  assert.equal(v.lastAt, T0 + 200_000);
});

test('a long tool run is no rest: the working stretch goes on', () => {
  const r = new VitalsReader();
  r.apply({ type: 'user', timestamp: at(0), message: { content: 'run the suite' } });
  r.apply(reply(5, { stop: 'tool_use' }));
  // Ten quiet minutes while the command (or a subagent) runs.
  r.apply(result(605));
  r.apply(reply(610, { stop: 'tool_use' }));
  assert.equal(r.snapshot(T0 + 611_000).busySince, T0);
});

test('a wait after the end of a turn is a rest: the next prompt starts a new stretch', () => {
  const r = new VitalsReader();
  r.apply({ type: 'user', timestamp: at(0), message: { content: 'go' } });
  r.apply(reply(10, { stop: 'end_turn' }));
  // A meta record (a hook's note) after the turn is not the agent at work.
  r.apply({ type: 'user', timestamp: at(11), isMeta: true, message: { content: 'note' } });
  let v = r.snapshot(T0 + 150_000);
  assert.equal(v.lastAt, T0 + 10_000);
  assert.equal(v.turnEndedAt, T0 + 10_000);
  r.apply({ type: 'user', timestamp: at(190), message: { content: 'and now this' } });
  v = r.snapshot(T0 + 191_000);
  assert.equal(v.busySince, T0 + 190_000);
  // A short wait is not.
  r.apply(reply(200, { stop: 'end_turn' }));
  r.apply({ type: 'user', timestamp: at(260), message: { content: 'one more' } });
  assert.equal(r.snapshot(T0 + 261_000).busySince, T0 + 190_000);
});

// A call to a tool, and what came back (as a subagent's transcript has
// them: no stop reason).
const call = (s: number, id: string, stop: string | null = 'tool_use') => ({ type: 'assistant', timestamp: at(s), message: { id: `c${s}`, model: 'claude-opus-5-5', stop_reason: stop, content: [{ type: 'tool_use', id, name: 'Bash', input: {} }] } });
const back = (s: number, id: string) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: id, content: 'ok' }] } });
const prompt = (s: number, content: unknown = 'go on') => ({ type: 'user', timestamp: at(s), message: { content } });

test('a turn that stopped any other way than on a tool rests while quiet', () => {
  const stops: Array<[string, Array<object>]> = [
    ['interrupted', [call(5, 'A'), prompt(10, [{ type: 'text', text: '[Request interrupted by user for tool use]' }])]],
    ['interrupted between calls', [reply(5, { stop: 'tool_use' }), prompt(10, '[Request interrupted by user]')]],
    ['interrupted, said in the result', [call(5, 'A'), prompt(10, [{ type: 'tool_result', tool_use_id: 'A', is_error: true, content: '[Request interrupted by user for tool use]' }])]],
    ['out of tokens', [reply(10, { stop: 'max_tokens' })]],
    ['paused', [reply(10, { stop: 'pause_turn' })]],
    ['an API error', [reply(10, { model: '<synthetic>', stop: 'stop_sequence', extra: { isApiErrorMessage: true } })]],
  ];
  for (const [name, recs] of stops) {
    const r = new VitalsReader();
    r.apply(prompt(0, 'start'));
    for (const rec of recs) r.apply(rec);
    const v = r.snapshot(T0 + 190_000);
    assert.equal(v.midTool, false, name);
    assert.ok(rested(v, T0 + 190_000), `${name}: not rested after three quiet minutes`);
    r.apply(prompt(190));
    assert.equal(r.snapshot(T0 + 191_000).busySince, T0 + 190_000, `${name}: no new stretch`);
  }
});

test('quiet mid-turn on a tool is work, in a subagent\'s transcript too', () => {
  for (const stop of ['tool_use', null]) {
    const r = new VitalsReader();
    r.apply(prompt(0, 'start'));
    r.apply(call(5, 'A', stop));
    // Ten quiet minutes while the command runs.
    let v = r.snapshot(T0 + 600_000);
    assert.equal(v.midTool, true, `stop ${stop}`);
    assert.ok(!rested(v, T0 + 600_000));
    r.apply(back(605, 'A'));
    // Its result is back: the model is at work on it.
    assert.equal(r.snapshot(T0 + 606_000).midTool, true);
    r.apply(reply(900, { stop: stop === null ? undefined : 'end_turn' }));
    v = r.snapshot(T0 + 1_100_000);
    assert.equal(v.busySince, T0, `stop ${stop}: the run was work`);
    // Its answer given, quiet is rest.
    assert.equal(v.midTool, false);
    assert.ok(rested(v, T0 + 1_100_000));
  }
});

test('records it cannot read leave it as it was', () => {
  const r = new VitalsReader();
  for (const rec of [null, 42, 'x', {}, { type: 'assistant' }, { type: 'assistant', message: { usage: 'nope' } }]) r.apply(rec);
  const v = r.snapshot(T0);
  assert.equal(v.model, '');
  assert.equal(v.context, 0);
  assert.equal(v.outTokens, 0);
});

test('a snapshot is a copy', () => {
  const r = new VitalsReader();
  r.apply(result(1, true));
  const v = r.snapshot(T0 + 2000);
  v.errors.push(1);
  assert.equal(r.snapshot(T0 + 2000).errors.length, 1);
});

test('a failure without a time still resets the streak', () => {
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply({ type: 'user', message: { content: [{ type: 'tool_result', is_error: true }] } });
  const v = r.snapshot(T0 + 2000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, []);
  r.apply(result(3));
  r.apply({ type: 'assistant', isApiErrorMessage: true, message: {} });
  assert.equal(r.snapshot(T0 + 4000).streak, 0);
});

test('failures stay oldest first when records arrive out of order, and the cap drops the oldest', () => {
  const r = new VitalsReader();
  r.apply(result(5, true));
  r.apply(result(2, true));
  r.apply(result(9, true));
  r.apply(result(3, true));
  assert.deepEqual(r.snapshot(T0 + 10_000).errors, [T0 + 2000, T0 + 3000, T0 + 5000, T0 + 9000]);
  const many = new VitalsReader();
  for (let s = 60; s >= 1; s--) many.apply(result(s, true));
  const e = many.snapshot(T0 + 61_000).errors;
  assert.equal(e.length, 50);
  assert.equal(e[0], T0 + 11_000);
  assert.equal(e[49], T0 + 60_000);
});

test('the window follows the session\'s current model, and only grows from a full context', () => {
  const r = new VitalsReader();
  r.apply(reply(1, { extra: { requestedModel: 'claude-opus-5-5[1m]' } }));
  assert.equal(r.snapshot(T0).window, 1_000_000);
  r.apply(reply(2, { extra: { requestedModel: 'claude-sonnet-5-5' } }));
  assert.equal(r.snapshot(T0).window, 200_000);
  r.apply(reply(3, { read: 250_000, extra: { requestedModel: 'claude-sonnet-5-5' } }));
  assert.equal(r.snapshot(T0).window, 1_000_000);
});

test('meta records and the synthetic model change nothing', () => {
  const r = new VitalsReader();
  r.apply(reply(1, { read: 500, out: 7 }));
  r.apply(result(2));
  r.apply({ ...reply(3, { model: 'claude-haiku-5', read: 9_000, out: 100 }), isMeta: true });
  r.apply({ ...result(4, true), isMeta: true });
  r.apply(reply(5, { model: '<synthetic>', input: 0, out: 0 }));
  const v = r.snapshot(T0 + 6000);
  assert.equal(v.model, 'claude-opus-5-5');
  assert.equal(v.context, 510);
  assert.equal(v.outTokens, 7);
  assert.equal(v.streak, 1);
  assert.deepEqual(v.errors, []);
});
