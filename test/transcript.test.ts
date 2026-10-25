import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { TranscriptTail, initialState, applyRecord } from '../src/claude/transcript.ts';
import { tempDir } from './helpers.ts';

const ts = (s: number) => new Date(Date.UTC(2026, 9, 22, 12, 0, s)).toISOString();

const assistant = (sec: number, content: unknown[], stop: string | null = null) => ({
  type: 'assistant',
  timestamp: ts(sec),
  message: { role: 'assistant', content, stop_reason: stop },
});
const user = (sec: number, content: unknown) => ({ type: 'user', timestamp: ts(sec), message: { role: 'user', content } });

function tmpFile(): string {
  return join(tempDir('animus-tx'), 't.jsonl');
}

test('tool_use sets activity, tool_result clears pending, end_turn ends', () => {
  const st = initialState(0);
  assert.equal(applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Edit', input: { file_path: '/p/x.ts' } }], 'tool_use')), true);
  assert.equal(st.activity, 'write');
  assert.equal(st.detail, 'Edit x.ts');
  assert.equal(st.pending.size, 1);
  assert.equal(st.lastSeen, Date.parse(ts(1)));
  applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }]));
  assert.equal(st.pending.size, 0);
  applyRecord(st, assistant(3, [{ type: 'text', text: 'All done here.' }], 'end_turn'));
  assert.equal(st.activity, 'talk');
  assert.equal(st.detail, 'All done here.');
  assert.equal(st.ended, true);
});

test('thinking block means think', () => {
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'thinking', thinking: '' }]));
  assert.equal(st.activity, 'think');
});

test('error tool_result flags error for 3s', () => {
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'false' } }]));
  applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'boom' }]));
  assert.equal(st.activity, 'error');
  assert.equal(st.errorUntil, Date.parse(ts(2)) + 3000);
});

// A call a PreToolUse hook blocked, as Claude Code records it, and the
// user turning a call down.
const HOOK = 'PreToolUse:Bash hook error: [gate]: blocked until the facts are stated';
const REJECTED = "The user doesn't want to proceed with this tool use. The tool use was rejected.";

test('a call a hook blocked, or the user turned down, is no failure', () => {
  for (const content of [HOOK, [{ type: 'text', text: HOOK }], REJECTED, [{ type: 'text', text: REJECTED }]]) {
    const st = initialState(0);
    applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf build' } }]));
    applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content }]));
    assert.equal(st.activity, 'run', JSON.stringify(content));
    assert.equal(st.errorUntil, 0);
    assert.equal(st.pending.size, 0);
  }
  // A command whose output mentions a hook error still failed.
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'make' } }]));
  applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: `Exit code 1\n${HOOK}` }]));
  assert.equal(st.activity, 'error');
});

test('a call the permission rules denied is no failure either', () => {
  const denied = 'Permission to use Bash with command rm -rf build has been denied.';
  for (const content of [denied, [{ type: 'text', text: denied }]]) {
    const st = initialState(0);
    applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf build' } }]));
    applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content }]));
    assert.equal(st.activity, 'run', JSON.stringify(content));
    assert.equal(st.errorUntil, 0);
  }
  // A command that failed for want of a permission did fail.
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cat /root/x' } }]));
  applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Permission to use /root/x: EACCES' }]));
  assert.equal(st.activity, 'error');
});

test('a call a built-in permission check denied is no failure either', () => {
  const denied = 'Permission for this command was denied by a built-in Claude Code check.';
  for (const content of [denied, [{ type: 'text', text: denied }]]) {
    const st = initialState(0);
    applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'rm -rf build' } }]));
    applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content }]));
    assert.equal(st.activity, 'run', JSON.stringify(content));
    assert.equal(st.errorUntil, 0);
  }
  // A server turning a command away is a real failure.
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'git push' } }]));
  applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: 'Permission for this command was denied by the remote: 403' }]));
  assert.equal(st.activity, 'error');
});

test('a tool call the user interrupted is no failure', () => {
  const stopped = '[Request interrupted by user for tool use]';
  for (const content of [stopped, [{ type: 'text', text: stopped }]]) {
    const st = initialState(0);
    applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'npm test' } }]));
    applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content }]));
    assert.notEqual(st.activity, 'error', JSON.stringify(content));
    assert.equal(st.errorUntil, 0);
  }
  // Output that only looks like it is a real failure.
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'curl x' } }]));
  applyRecord(st, user(2, [{ type: 'tool_result', tool_use_id: 't1', is_error: true, content: '[Request failed with status 500]' }]));
  assert.equal(st.activity, 'error');
});

test('string user content is a new prompt', () => {
  const st = initialState(0);
  st.ended = true;
  applyRecord(st, user(1, 'please fix the bug'));
  assert.equal(st.ended, false);
  assert.equal(st.activity, 'think');
});

test('junk records are ignored', () => {
  const st = initialState(0);
  assert.equal(applyRecord(st, null), false);
  assert.equal(applyRecord(st, 'x'), false);
  assert.equal(applyRecord(st, { type: 'mode', mode: 'normal' }), false);
  assert.equal(st.activity, 'idle');
});

test('tail reads incrementally, handles partial and malformed lines', () => {
  const f = tmpFile();
  writeFileSync(f, JSON.stringify({ a: 1 }) + '\n' + 'not json\n');
  const tail = new TranscriptTail(f);
  assert.deepEqual(tail.read(), [{ a: 1 }]);
  assert.deepEqual(tail.read(), []);
  const line = JSON.stringify({ b: 'héllo' });
  const buf = Buffer.from(line + '\n');
  appendFileSync(f, buf.subarray(0, 8));
  assert.deepEqual(tail.read(), []);
  appendFileSync(f, buf.subarray(8));
  assert.deepEqual(tail.read(), [{ b: 'héllo' }]);
});

test('tail on missing file returns nothing', () => {
  const tail = new TranscriptTail(join(tempDir('animus-tx'), 'does-not-exist.jsonl'));
  assert.deepEqual(tail.read(), []);
});

test('tail starts near the end of large files', () => {
  const f = tmpFile();
  const lines = Array.from({ length: 200 }, (_, i) => JSON.stringify({ i, pad: 'x'.repeat(40) }));
  writeFileSync(f, lines.join('\n') + '\n');
  const tail = new TranscriptTail(f, 1000);
  const recs = tail.read() as Array<{ i: number }>;
  assert.ok(recs.length > 0 && recs.length < 30, `got ${recs.length}`);
  assert.equal(recs[recs.length - 1].i, 199);
  for (const r of recs) assert.equal(typeof r.i, 'number');
});

test('tail restarts after truncation', () => {
  const f = tmpFile();
  writeFileSync(f, JSON.stringify({ a: 1 }) + '\n' + JSON.stringify({ a: 2 }) + '\n');
  const tail = new TranscriptTail(f);
  tail.read();
  writeFileSync(f, JSON.stringify({ c: 3 }) + '\n');
  assert.deepEqual(tail.read(), [{ c: 3 }]);
});

test('a trailing text block alone does not end the turn (a tool call may still be streaming)', () => {
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'text', text: 'Now I will write the module:' }]));
  assert.equal(st.ended, false);
  assert.equal(st.lastText, true);
  applyRecord(st, assistant(2, [{ type: 'tool_use', id: 't2', name: 'Write', input: { file_path: '/m.ts' } }]));
  assert.equal(st.lastText, false);
});

test('an interrupted request ends the turn', () => {
  const st = initialState(0);
  applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'sleep 99' } }]));
  applyRecord(st, user(2, [{ type: 'text', text: '[Request interrupted by user for tool use]' }]));
  assert.equal(st.ended, true);
  assert.equal(st.pending.size, 0);
  assert.equal(st.activity, 'idle');
  assert.equal(st.detail, 'interrupted');
});

test('malformed but valid-JSON records never throw', () => {
  const st = initialState(0);
  assert.doesNotThrow(() => applyRecord(st, assistant(1, [{ type: 'tool_use', id: 't', name: 42, input: null }])));
  assert.equal(st.activity, 'run');
  assert.doesNotThrow(() => applyRecord(st, { type: 'assistant', message: { content: [null, 5, 'x', { type: 'text', text: 7 }] } }));
  assert.doesNotThrow(() => applyRecord(st, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: {} }] } }));
});

test('tail on an unreadable path returns nothing', () => {
  const dir = tempDir('animus-dir');
  assert.deepEqual(new TranscriptTail(dir).read(), []);
});
