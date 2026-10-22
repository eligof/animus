import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync, utimesSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ClaudeSource } from '../src/claude/source.ts';
import { tempDir } from './helpers.ts';

const iso = (ms: number) => new Date(ms).toISOString();
const line = (o: unknown) => JSON.stringify(o) + '\n';

function setup(now: number, status = 'busy') {
  const root = tempDir('animus-src');
  mkdirSync(join(root, 'sessions'));
  writeFileSync(
    join(root, 'sessions', '4242.json'),
    JSON.stringify({ pid: 4242, sessionId: 'S1', cwd: '/home/u/rocket', name: 'rocket-7', status, updatedAt: now, kind: 'interactive' }),
  );
  const proj = join(root, 'projects', '-home-u-rocket');
  mkdirSync(join(proj, 'S1', 'subagents'), { recursive: true });
  const lead = join(proj, 'S1.jsonl');
  writeFileSync(
    lead,
    line({ type: 'assistant', timestamp: iso(now - 1000), message: { content: [{ type: 'tool_use', id: 'a', name: 'Grep', input: { pattern: 'fuel' } }] } }),
  );
  const sub = join(proj, 'S1', 'subagents', 'agent-abc.jsonl');
  writeFileSync(sub, line({ type: 'user', timestamp: iso(now - 900), message: { content: 'review the code' } }));
  writeFileSync(
    join(proj, 'S1', 'subagents', 'agent-abc.meta.json'),
    JSON.stringify({ agentType: 'ecc:code-reviewer', description: 'Review rocket fuel module' }),
  );
  return { root, lead, sub };
}

test('lead and subagent appear with roles and metadata', () => {
  const now = Date.now();
  const { root } = setup(now);
  const src = new ClaudeSource(root, { alive: () => true });
  const agents = src.poll(now);
  const lead = agents.find((a) => a.id === 'S1');
  const sub = agents.find((a) => a.id === 'abc');
  assert.ok(lead && sub, JSON.stringify(agents));
  assert.equal(lead.role, 'lead');
  assert.equal(lead.name, 'rocket-7');
  assert.equal(lead.project, 'rocket');
  assert.equal(lead.activity, 'search');
  assert.equal(lead.detail, 'Grep "fuel"');
  assert.equal(sub.role, 'sub');
  assert.equal(sub.parentId, 'S1');
  assert.equal(sub.agentType, 'ecc:code-reviewer');
  assert.equal(sub.name, 'Review rocket…');
  assert.equal(sub.project, 'rocket');
});

test('new transcript lines show up on the next scan with an event', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 100 });
  src.poll(now);
  src.drainEvents();
  appendFileSync(
    sub,
    line({ type: 'assistant', timestamp: iso(now + 50), message: { content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'npm test' } }] } }),
  );
  assert.equal(src.poll(now + 50).find((a) => a.id === 'abc')!.activity, 'think', 'cached until interval passes');
  const agents = src.poll(now + 200);
  assert.equal(agents.find((a) => a.id === 'abc')!.activity, 'run');
  const ev = src.drainEvents();
  assert.ok(ev.some((e) => e.agentId === 'abc' && e.detail === '$ npm test'), JSON.stringify(ev));
  assert.deepEqual(src.drainEvents(), []);
});

test('finished subagent shows done, then disappears', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(
    sub,
    line({ type: 'assistant', timestamp: iso(now - 800), message: { content: [{ type: 'text', text: 'LGTM' }], stop_reason: 'end_turn' } }),
  );
  const tenSecAgo = (now - 10_000) / 1000;
  utimesSync(sub, tenSecAgo, tenSecAgo);
  const src = new ClaudeSource(root, { alive: () => true });
  assert.equal(src.poll(now).find((a) => a.id === 'abc')?.activity, 'done');
  const later = new ClaudeSource(root, { alive: () => true });
  const minuteAgo = (now - 60_000) / 1000;
  utimesSync(sub, minuteAgo, minuteAgo);
  assert.equal(later.poll(now).find((a) => a.id === 'abc'), undefined);
});

test('idle session shows idle lead', () => {
  const now = Date.now();
  const { root } = setup(now, 'idle');
  const src = new ClaudeSource(root, { alive: () => true });
  const lead = src.poll(now).find((a) => a.id === 'S1')!;
  assert.equal(lead.activity, 'idle');
  assert.equal(lead.detail, 'waiting for you');
});

test('dead sessions and their subagents vanish', () => {
  const now = Date.now();
  const { root } = setup(now);
  const src = new ClaudeSource(root, { alive: () => false });
  assert.deepEqual(src.poll(now), []);
});

test('missing claude dir yields no agents', () => {
  const src = new ClaudeSource(join(tempDir('animus-missing'), '.claude'));
  assert.deepEqual(src.poll(Date.now()), []);
});

test('session waiting on the user shows as talking', () => {
  const now = Date.now();
  const { root } = setup(now, 'waiting');
  const lead = new ClaudeSource(root, { alive: () => true }).poll(now).find((a) => a.id === 'S1')!;
  assert.equal(lead.activity, 'talk');
  assert.equal(lead.detail, 'needs your input');
});

test('unfinished subagent stays visible during a long generation', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  const twentyMinAgo = (now - 20 * 60_000) / 1000;
  utimesSync(sub, twentyMinAgo, twentyMinAgo);
  const agents = new ClaudeSource(root, { alive: () => true }).poll(now);
  assert.ok(agents.some((a) => a.id === 'abc'), 'busy subagent hidden');
  const hourAgo = (now - 70 * 60_000) / 1000;
  utimesSync(sub, hourAgo, hourAgo);
  assert.ok(!new ClaudeSource(root, { alive: () => true }).poll(now).some((a) => a.id === 'abc'), 'stale subagent shown');
});

test('quiet agent with no pending tool is shown thinking', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now - 800), message: { content: [{ type: 'tool_use', id: 'q', name: 'Read', input: { file_path: '/x/a.ts' } }] } }));
  appendFileSync(sub, line({ type: 'user', timestamp: iso(now - 700), message: { content: [{ type: 'tool_result', tool_use_id: 'q', content: 'ok' }] } }));
  const a = new ClaudeSource(root, { alive: () => true }).poll(now + 30_000).find((x) => x.id === 'abc')!;
  assert.equal(a.activity, 'think');
  assert.equal(a.detail, 'thinking…');
});

test('recent tool result keeps the tool activity', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now - 2000), message: { content: [{ type: 'tool_use', id: 'q', name: 'Read', input: { file_path: '/x/a.ts' } }] } }));
  appendFileSync(sub, line({ type: 'user', timestamp: iso(now - 1500), message: { content: [{ type: 'tool_result', tool_use_id: 'q', content: 'ok' }] } }));
  const a = new ClaudeSource(root, { alive: () => true }).poll(now).find((x) => x.id === 'abc')!;
  assert.equal(a.activity, 'read');
});

test('errors show briefly then revert', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now - 1000), message: { content: [{ type: 'tool_use', id: 'e', name: 'Bash', input: { command: 'false' } }] } }));
  appendFileSync(sub, line({ type: 'user', timestamp: iso(now - 500), message: { content: [{ type: 'tool_result', tool_use_id: 'e', is_error: true, content: 'boom' }] } }));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  assert.equal(src.poll(now).find((x) => x.id === 'abc')!.activity, 'error');
  assert.notEqual(src.poll(now + 4000).find((x) => x.id === 'abc')!.activity, 'error');
});

test('a directory where a transcript should be does not break polling', () => {
  const now = Date.now();
  const { root } = setup(now);
  mkdirSync(join(root, 'projects', '-home-u-rocket', 'S1', 'subagents', 'agent-x.jsonl'));
  const agents = new ClaudeSource(root, { alive: () => true }).poll(now);
  assert.ok(agents.some((a) => a.id === 'S1'));
});

test('control characters and wide glyphs never reach names or details', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now), message: { content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'echo \x1b]0;pwned\x07\there 漢字' } }] } }));
  const a = new ClaudeSource(root, { alive: () => true }).poll(now).find((x) => x.id === 'abc')!;
  assert.ok(!/[\x00-\x1f\x7f-\x9f]/.test(a.detail), JSON.stringify(a.detail));
  assert.ok(!a.detail.includes('漢'), a.detail);
});

test('subagent metadata written late is picked up', () => {
  const now = Date.now();
  const { root } = setup(now);
  const metaPath = join(root, 'projects', '-home-u-rocket', 'S1', 'subagents', 'agent-abc.meta.json');
  rmSync(metaPath);
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  assert.equal(src.poll(now).find((a) => a.id === 'abc')!.agentType, undefined);
  writeFileSync(metaPath, JSON.stringify({ agentType: 'Explore', description: 'Map the code' }));
  const a = src.poll(now + 10).find((x) => x.id === 'abc')!;
  assert.equal(a.agentType, 'Explore');
  assert.equal(a.name, 'Map the code');
});

const subDir = (root: string) => join(root, 'projects', '-home-u-rocket', 'S1', 'subagents');

test('meta.json finished:true marks the subagent done, then it leaves', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now - 500), message: { content: [{ type: 'text', text: 'Report ready.' }], stop_reason: null } }));
  writeFileSync(join(subDir(root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'ecc:code-reviewer', description: 'Review rocket fuel module', finished: true }));
  assert.equal(new ClaudeSource(root, { alive: () => true }).poll(now).find((a) => a.id === 'abc')?.activity, 'done');
  const old = (now - 60_000) / 1000;
  utimesSync(sub, old, old);
  assert.equal(new ClaudeSource(root, { alive: () => true }).poll(now).find((a) => a.id === 'abc'), undefined);
});

test('a task-notification in the lead transcript marks a background subagent done', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  appendFileSync(lead, line({ type: 'user', timestamp: iso(now - 200), message: { content: '<task-notification>\n<task-id>abc</task-id>\n<status>completed</status>\n</task-notification>' } }));
  assert.equal(new ClaudeSource(root, { alive: () => true }).poll(now).find((a) => a.id === 'abc')?.activity, 'done');
});

test('a foreground subagent is done when its launching tool call returns', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  writeFileSync(join(subDir(root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Map it', toolUseId: 'toolu_X', requestShape: 'foreground' }));
  appendFileSync(lead, line({ type: 'user', timestamp: iso(now - 200), message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_X', content: 'done mapping' }] } }));
  assert.equal(new ClaudeSource(root, { alive: () => true }).poll(now).find((a) => a.id === 'abc')?.activity, 'done');
});

test('a background launch acknowledgement does not finish the subagent', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  writeFileSync(join(subDir(root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Map it', toolUseId: 'toolu_B', requestShape: 'background' }));
  appendFileSync(lead, line({ type: 'user', timestamp: iso(now - 200), message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_B', content: 'Async agent launched successfully.' }] } }));
  assert.notEqual(new ClaudeSource(root, { alive: () => true }).poll(now).find((a) => a.id === 'abc')?.activity, 'done');
});

test('text followed by a long silence is thinking, not done', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now - 800), message: { content: [{ type: 'text', text: 'Now writing the big file:' }], stop_reason: null } }));
  const a = new ClaudeSource(root, { alive: () => true }).poll(now + 60_000).find((x) => x.id === 'abc');
  assert.equal(a?.activity, 'think');
});

test('a subagent with no readable records yet has a sane start time', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  writeFileSync(sub, line({ type: 'user', isMeta: true, timestamp: iso(now - 100), message: { content: 'meta' } }));
  const a = new ClaudeSource(root, { alive: () => true }).poll(now).find((x) => x.id === 'abc')!;
  assert.ok(now - a.since < 60_000, `since=${a.since}`);
});

test('a clock that jumps backwards does not freeze scanning', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 750 });
  src.poll(now);
  appendFileSync(sub, line({ type: 'assistant', timestamp: iso(now), message: { content: [{ type: 'tool_use', id: 'k', name: 'Grep', input: { pattern: 'x' } }] } }));
  assert.equal(src.poll(now - 600_000).find((a) => a.id === 'abc')!.activity, 'search');
});

test('sessions without a transcript yet are not rescanned on every poll', () => {
  const now = Date.now();
  const root = tempDir('animus-miss');
  mkdirSync(join(root, 'sessions'));
  mkdirSync(join(root, 'projects', '-p'), { recursive: true });
  writeFileSync(join(root, 'sessions', '7.json'), JSON.stringify({ pid: 7, sessionId: 'NEW', cwd: '/p', name: 'fresh', status: 'busy', updatedAt: now }));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  assert.equal(src.poll(now)[0].detail, 'starting up');
  writeFileSync(join(root, 'projects', '-p', 'NEW.jsonl'), line({ type: 'assistant', timestamp: iso(now), message: { content: [{ type: 'tool_use', id: 'r', name: 'Read', input: { file_path: '/p/a.ts' } }] } }));
  assert.equal(src.poll(now + 100)[0].detail, 'starting up', 'miss should be remembered briefly');
  assert.equal(src.poll(now + 6000)[0].activity, 'read');
});
