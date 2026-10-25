import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, writeFileSync, appendFileSync, utimesSync, rmSync, readFileSync, realpathSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import type { Gain } from '../src/agents.ts';
import { ClaudeSource } from '../src/claude/source.ts';
import { Crews } from '../src/pet/crew.ts';
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
  writeFileSync(sub, line({ type: 'user', isSidechain: true, timestamp: iso(now - 900), message: { content: 'review the code' } }));
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

test('leads and subagents carry vitals from their transcripts', () => {
  const now = Date.now();
  const { root, lead, sub } = setup(now);
  appendFileSync(
    lead,
    line({ type: 'assistant', timestamp: iso(now - 500), gitBranch: 'main', message: { id: 'm1', model: 'claude-opus-5-5', usage: { input_tokens: 10, cache_read_input_tokens: 90_000, output_tokens: 700 }, content: [{ type: 'text', text: 'ok' }] } }),
  );
  appendFileSync(sub, line({ type: 'user', timestamp: iso(now - 400), message: { content: [{ type: 'tool_result', tool_use_id: 'q', is_error: true }] } }));
  const src = new ClaudeSource(root, { alive: () => true });
  const agents = src.poll(now);
  const l = agents.find((a) => a.id === 'S1')!;
  const s = agents.find((a) => a.id === 'abc')!;
  assert.equal(l.vitals?.model, 'claude-opus-5-5');
  assert.equal(l.vitals?.context, 90_010);
  assert.equal(l.vitals?.outTokens, 700);
  assert.equal(l.vitals?.branch, 'main');
  assert.equal(s.vitals?.errors.length, 1);
  assert.equal(s.vitals?.streak, 0);
});

test('an idle session, or a finished subagent, is never mid-tool', () => {
  const now = Date.now();
  // Both transcripts end in a call with no result.
  const call = (at: number) => line({ type: 'assistant', timestamp: iso(at), message: { content: [{ type: 'tool_use', id: 'z', name: 'Bash', input: { command: 'npm test' } }] } });
  const busy = setup(now);
  assert.equal(new ClaudeSource(busy.root, { alive: () => true }).poll(now).find((a) => a.id === 'S1')!.vitals?.midTool, true);
  const { root, sub } = setup(now, 'idle');
  appendFileSync(sub, call(now - 500));
  writeFileSync(join(subDir(root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'ecc:code-reviewer', description: 'Review rocket fuel module', finished: true }));
  const agents = new ClaudeSource(root, { alive: () => true }).poll(now);
  const l = agents.find((a) => a.id === 'S1')!;
  const s = agents.find((a) => a.id === 'abc')!;
  assert.equal(l.activity, 'idle');
  assert.equal(l.vitals?.midTool, false);
  assert.equal(s.activity, 'done');
  assert.equal(s.vitals?.midTool, false);
});

test('a lead without a transcript yet has no vitals', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  rmSync(lead);
  const agents = new ClaudeSource(root, { alive: () => true }).poll(now);
  const l = agents.find((a) => a.id === 'S1')!;
  assert.ok(l);
  assert.equal(l.vitals, undefined);
});

test('vitals are not double-counted across polls', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  const rec = (id: string, out: number, at: number) =>
    line({ type: 'assistant', timestamp: iso(at), message: { id, model: 'claude-opus-5-5', usage: { input_tokens: 1, output_tokens: out }, content: [{ type: 'text', text: 'ok' }] } });
  appendFileSync(lead, rec('m1', 300, now - 500));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 100 });
  const out = (t: number) => src.poll(t).find((a) => a.id === 'S1')!.vitals?.outTokens;
  const first = out(now);
  assert.equal(first, 300);
  assert.equal(out(now + 200), first);
  appendFileSync(lead, rec('m2', 50, now + 250));
  assert.equal(out(now + 400), 350);
});

test('leads and subagents carry their conversation', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  appendFileSync(lead, line({ type: 'assistant', uuid: 'r1', timestamp: iso(now - 500), message: { content: [{ type: 'text', text: 'Found it.' }] } }));
  const src = new ClaudeSource(root, { alive: () => true });
  src.poll(now);
  assert.deepEqual(src.chat('S1')!.map((b) => [b.kind, b.text]), [['tool', 'Grep "fuel"'], ['agent', 'Found it.']]);
  assert.deepEqual(src.chat('abc')!.map((b) => [b.kind, b.text]), [['user', 'review the code']]);
  assert.equal(src.chat('nobody'), null);
});

test('a lead with an inbox can be sent to; its subagents and the rest cannot', async (t) => {
  const now = Date.now();
  const { root } = setup(now);
  const src = new ClaudeSource(root, { alive: () => true });
  src.poll(now);
  assert.equal(src.reach('S1'), 'its Claude Code takes no messages');
  assert.equal(src.reach('abc'), 'a subagent has no session of its own');
  assert.equal(src.reach('nobody'), 'no live session');
  assert.deepEqual(await src.send('abc', 'hi'), { ok: false, reason: 'a subagent has no session of its own' });
  // Messaging on: a socket and the protocol in its registry entry.
  const reg = join(root, 'sessions', '4242.json');
  const on = (socket: string) => writeFileSync(reg, JSON.stringify({ ...JSON.parse(readFileSync(reg, 'utf8')), messagingSocketPath: socket, peerProtocol: 1 }));
  on(join(root, 'none.sock'));
  src.poll(now + 1000);
  assert.equal(src.reach('S1'), 'its inbox is not there (ENOENT)');
  assert.deepEqual(await src.send('S1', 'hi'), { ok: false, reason: 'its inbox is not there (ENOENT)' });
  // A fake inbox, private as Claude Code makes it.
  const sock = join(root, 'in.sock');
  const server = createServer((c) => c.resume());
  t.after(() => server.close());
  await new Promise<void>((res) => server.listen(sock, res));
  chmodSync(sock, 0o600);
  on(sock);
  src.poll(now + 2000);
  assert.equal(src.reach('S1'), null);
  assert.deepEqual(await src.send('S1', 'hi'), { ok: true });
});

// A finished build or test and a finished turn, as a transcript shows them
// (`sub`: a subagent's, whose records are all sidechain records).
const checked = (t: number, id: string, command: string, isError = false, sub = false) => [
  line({ type: 'assistant', isSidechain: sub, timestamp: iso(t), message: { id: `m-${id}`, stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } }),
  line({ type: 'user', isSidechain: sub, timestamp: iso(t + 100), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: isError ? 'Exit code 1' : 'ok' }] } }),
];
const ended = (t: number, id: string, sub = false) => line({ type: 'assistant', isSidechain: sub, timestamp: iso(t), message: { id, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } });
const brief = (gs: Gain[]) => gs.map((g) => `${g.agent} ${g.role} ${g.kind} ${g.key} ${g.crew}`);

test('live agents say their crew: the top of the git checkout they work in', () => {
  const now = Date.now();
  const { root } = setup(now);
  // Its real path: a crew is keyed by it (macOS's temp dir is behind a link).
  const repo = realpathSync(tempDir('animus-repo'));
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'pkg'));
  const reg = join(root, 'sessions', '4242.json');
  writeFileSync(reg, JSON.stringify({ ...JSON.parse(readFileSync(reg, 'utf8')), cwd: join(repo, 'pkg') }));
  const agents = new ClaudeSource(root, { alive: () => true }).poll(now);
  assert.equal(agents.find((a) => a.id === 'S1')!.crew, repo);
  assert.equal(agents.find((a) => a.id === 'abc')!.crew, repo, 'a subagent is in its lead\'s crew');
});

test("a lead's passing checks and finished turns are gains for its crew, drained once", () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  appendFileSync(lead, [...checked(now - 900, 'b1', 'npm test'), ...checked(now - 700, 'b2', 'npm run build', true), ended(now - 500, 'm9')].join(''));
  const src = new ClaudeSource(root, { alive: () => true });
  src.poll(now);
  assert.deepEqual(brief(src.drainGains()), ['S1 lead check check:b1 /home/u/rocket', 'S1 lead turn turn:m9 /home/u/rocket']);
  assert.deepEqual(src.drainGains(), []);
});

test("a subagent's checks go to its type, and its finished run gains once", () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  appendFileSync(sub, [...checked(now - 800, 's1', 'pytest -q', false, true), ended(now - 600, 'r1', true)].join(''));
  writeFileSync(join(subDir(root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'ecc:code-reviewer', description: 'Review rocket fuel module', finished: true }));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  src.poll(now);
  const gs = src.drainGains();
  assert.deepEqual(brief(gs), ['abc ecc:code-reviewer check check:s1 /home/u/rocket', 'abc ecc:code-reviewer subagent finish /home/u/rocket']);
  assert.equal(gs[1].at, now - 600, 'when it last wrote');
  src.poll(now + 1000);
  src.poll(now + 30_000);
  assert.deepEqual(src.drainGains(), [], 'finished once');
});

test("a subagent's gains wait for its type, however late its meta.json comes", () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  const metaPath = join(subDir(root), 'agent-abc.meta.json');
  rmSync(metaPath);
  appendFileSync(sub, checked(now - 800, 's1', 'cargo test', false, true).join(''));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  src.poll(now);
  assert.deepEqual(src.drainGains(), [], 'its type not known yet');
  src.poll(now + 6000);
  assert.deepEqual(src.drainGains(), [], 'still not known: still held');
  writeFileSync(metaPath, JSON.stringify({ agentType: 'Explore', description: 'Map it' }));
  src.poll(now + 7000);
  // Its type, as a source started now would find it: the same role however it is read.
  assert.deepEqual(brief(src.drainGains()), ['abc Explore check check:s1 /home/u/rocket']);
  const again = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  again.poll(now + 8000);
  assert.deepEqual(brief(again.drainGains()), ['abc Explore check check:s1 /home/u/rocket']);
});

test('with no meta.json ever readable, its gains go to the default type once it finishes, or is gone', () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  rmSync(join(subDir(root), 'agent-abc.meta.json'));
  appendFileSync(sub, checked(now - 800, 's1', 'cargo test', false, true).join(''));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  src.poll(now);
  src.poll(now + 6000);
  assert.deepEqual(src.drainGains(), [], 'held while it runs');
  appendFileSync(sub, ended(now + 6500, 'r1', true));
  src.poll(now + 7000);
  assert.deepEqual(brief(src.drainGains()), ['abc general-purpose check check:s1 /home/u/rocket', 'abc general-purpose subagent finish /home/u/rocket']);

  // One that never finishes: given to the default type when it is no longer seen.
  const other = setup(now);
  rmSync(join(subDir(other.root), 'agent-abc.meta.json'));
  appendFileSync(other.sub, checked(now - 800, 's1', 'cargo test', false, true).join(''));
  const gone = new ClaudeSource(other.root, { alive: () => true, intervalMs: 0, subagentWindowMs: 10_000 });
  gone.poll(now);
  assert.deepEqual(gone.drainGains(), []);
  gone.poll(now + 20_000);
  assert.deepEqual(brief(gone.drainGains()), ['abc general-purpose check check:s1 /home/u/rocket']);
});

test('a subagent interrupted, or reported failed or killed, earns no finished run', () => {
  const now = Date.now();
  const interrupted = setup(now);
  appendFileSync(interrupted.sub, line({ type: 'user', isSidechain: true, timestamp: iso(now - 500), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }));
  const a = new ClaudeSource(interrupted.root, { alive: () => true });
  assert.equal(a.poll(now).find((x) => x.id === 'abc')?.detail, 'interrupted');
  assert.deepEqual(a.drainGains(), []);
  for (const status of ['failed', 'killed']) {
    const { root, lead, sub } = setup(now);
    appendFileSync(sub, checked(now - 800, 's1', 'pytest -q', false, true).join(''));
    appendFileSync(lead, line({ type: 'user', isSidechain: false, timestamp: iso(now - 200), message: { role: 'user', content: `<task-notification>\n<task-id>abc</task-id>\n<status>${status}</status>\n<summary>Agent "Review" ${status}</summary>\n</task-notification>` } }));
    const src = new ClaudeSource(root, { alive: () => true });
    assert.equal(src.poll(now).find((x) => x.id === 'abc')?.detail, status);
    // Its passing check still counts; the run does not.
    assert.deepEqual(brief(src.drainGains()), ['abc ecc:code-reviewer check check:s1 /home/u/rocket'], status);
  }
});

// A background subagent that has written its last: Claude Code marks its
// meta.json finished at once, but its task notification, the only word
// of how it ended, can reach the lead's transcript minutes later.
function background(now: number) {
  const s = setup(now);
  appendFileSync(s.sub, ended(now - 500, 'r1', true));
  writeFileSync(join(subDir(s.root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Map it', toolUseId: 'toolu_B', requestShape: 'background', finished: true }));
  return s;
}
const note = (status: string) => `<task-notification>\n<task-id>abc</task-id>\n<status>${status}</status>\n<summary>Agent "Map it" ${status}</summary>\n</task-notification>`;
const finishes = (gs: Gain[]) => brief(gs.filter((g) => g.kind === 'subagent'));

test("a background subagent's finished run waits for its notification, in whichever form it comes", () => {
  const now = Date.now();
  // Mid-turn, Claude Code hands the lead the notification as an attachment.
  const a = background(now);
  appendFileSync(a.lead, line({ type: 'attachment', isSidechain: false, timestamp: iso(now - 300), attachment: { type: 'queued_command', prompt: note('failed'), commandMode: 'task-notification' } }));
  const src = new ClaudeSource(a.root, { alive: () => true, intervalMs: 0 });
  assert.equal(src.poll(now).find((x) => x.id === 'abc')?.detail, 'failed');
  src.poll(now + 70_000);
  assert.deepEqual(finishes(src.drainGains()), [], 'failed, as an attachment');

  // A killed one's notification, written as a user record half a minute on.
  const b = background(now);
  const late = new ClaudeSource(b.root, { alive: () => true, intervalMs: 0 });
  late.poll(now);
  assert.deepEqual(finishes(late.drainGains()), [], 'held for its notification');
  appendFileSync(b.lead, line({ type: 'user', timestamp: iso(now + 30_000), message: { role: 'user', content: note('killed') } }));
  late.poll(now + 30_000);
  late.poll(now + 70_000);
  assert.deepEqual(finishes(late.drainGains()), [], 'killed, half a minute later');

  // Queued for the lead as it finished: a completed run is settled at once.
  const c = background(now);
  appendFileSync(c.lead, line({ type: 'queue-operation', operation: 'enqueue', timestamp: iso(now - 400), sessionId: 'S1', content: note('completed') }));
  const queued = new ClaudeSource(c.root, { alive: () => true, intervalMs: 0 });
  queued.poll(now);
  assert.deepEqual(finishes(queued.drainGains()), ['abc Explore subagent finish /home/u/rocket']);
});

test('a background subagent whose notification never comes gains once the wait is over, unless interrupted', () => {
  const now = Date.now();
  const { root } = background(now);
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  src.poll(now);
  assert.equal(src.poll(now + 30_000).find((x) => x.id === 'abc'), undefined, 'out of sight, still waiting');
  assert.deepEqual(finishes(src.drainGains()), []);
  src.poll(now + 61_000);
  const gs = src.drainGains();
  assert.deepEqual(finishes(gs), ['abc Explore subagent finish /home/u/rocket']);
  assert.equal(gs[0].at, now - 500, 'when it last wrote');
  src.poll(now + 90_000);
  assert.deepEqual(src.drainGains(), [], 'once');

  const cut = background(now);
  appendFileSync(cut.sub, line({ type: 'user', isSidechain: true, timestamp: iso(now - 400), message: { role: 'user', content: [{ type: 'text', text: '[Request interrupted by user]' }] } }));
  const off = new ClaudeSource(cut.root, { alive: () => true, intervalMs: 0 });
  off.poll(now);
  off.poll(now + 61_000);
  assert.deepEqual(finishes(off.drainGains()), []);
});

test('a foreground subagent gains as soon as its launching call returns', () => {
  const now = Date.now();
  const { root, lead, sub } = setup(now);
  appendFileSync(sub, ended(now - 500, 'r1', true));
  writeFileSync(join(subDir(root), 'agent-abc.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Map it', toolUseId: 'toolu_F', requestShape: 'foreground', finished: true }));
  appendFileSync(lead, line({ type: 'user', timestamp: iso(now - 200), message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_F', content: 'mapped' }] } }));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  src.poll(now);
  assert.deepEqual(finishes(src.drainGains()), ['abc Explore subagent finish /home/u/rocket']);
});

test('gains are drained oldest first, whichever agent showed them', () => {
  const now = Date.now();
  const { root, lead, sub } = setup(now);
  appendFileSync(lead, checked(now - 500, 'b1', 'npm test').join(''));
  appendFileSync(sub, checked(now - 800, 's1', 'pytest -q', false, true).join(''));
  const src = new ClaudeSource(root, { alive: () => true });
  src.poll(now);
  assert.deepEqual(brief(src.drainGains()), ['abc ecc:code-reviewer check check:s1 /home/u/rocket', 'S1 lead check check:b1 /home/u/rocket']);
});

test('a gain stamped far in the future is dropped: it would lift the role\'s floor past every real one', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  appendFileSync(lead, [...checked(now - 900, 'b1', 'npm test'), ...checked(now + 30_000, 'b2', 'npm test'), ...checked(now + 3_600_000, 'b3', 'npm test')].join(''));
  const src = new ClaudeSource(root, { alive: () => true });
  src.poll(now);
  assert.deepEqual(brief(src.drainGains()), ['S1 lead check check:b1 /home/u/rocket', 'S1 lead check check:b2 /home/u/rocket']);
});

test('read again by a new source, the same gains come round, and the crew counts them once', () => {
  const now = Date.now();
  const { root, lead } = setup(now);
  appendFileSync(lead, [...checked(now - 900, 'b1', 'go test ./...'), ended(now - 500, 'm9')].join(''));
  const crews = new Crews();
  const first = new ClaudeSource(root, { alive: () => true });
  first.poll(now);
  for (const g of first.drainGains()) crews.count(g);
  const again = new ClaudeSource(root, { alive: () => true });
  again.poll(now + 1000);
  const gs = again.drainGains();
  assert.equal(gs.length, 2);
  for (const g of gs) assert.equal(crews.count(g), null);
  assert.equal(crews.xp('/home/u/rocket', 'lead'), 15);
});
