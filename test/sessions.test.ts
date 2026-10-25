import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { claudeRoot, findTranscript } from '../src/claude/paths.ts';
import { inboxOf } from '../src/claude/inbox.ts';
import { listSessions, pidAlive } from '../src/claude/sessions.ts';
import { readAccount } from '../src/claude/account.ts';
import { tempDir } from './helpers.ts';

function fixture(): string {
  const root = tempDir('animus-root');
  mkdirSync(join(root, 'sessions'));
  const s = (pid: number, extra = {}) => ({
    pid, sessionId: `sess-${pid}`, cwd: `/home/u/proj${pid}`, name: `proj-${pid}`, status: 'busy',
    updatedAt: 1792679757034, kind: 'interactive', ...extra,
  });
  writeFileSync(join(root, 'sessions', '100.json'), JSON.stringify(s(100)));
  writeFileSync(join(root, 'sessions', '200.json'), JSON.stringify(s(200, { status: 'idle' })));
  writeFileSync(join(root, 'sessions', '300.json'), '{broken');
  writeFileSync(join(root, 'sessions', '100.abc.key'), 'secret');
  return root;
}

test('listSessions returns live sessions only and skips garbage', () => {
  const root = fixture();
  const live = listSessions(root, (pid) => pid === 100);
  assert.equal(live.length, 1);
  assert.equal(live[0].sessionId, 'sess-100');
  assert.equal(live[0].cwd, '/home/u/proj100');
  assert.equal(live[0].status, 'busy');
  const both = listSessions(root, () => true);
  assert.deepEqual(both.map((s) => s.pid).sort(), [100, 200]);
});

test('listSessions on missing dir is empty', () => {
  assert.deepEqual(listSessions(join(tempDir('animus-nope'), 'missing')), []);
});

test('pidAlive is true for this process and false for a bogus pid', () => {
  assert.equal(pidAlive(process.pid), true);
  assert.equal(pidAlive(2 ** 22 + 12345), false);
});

test('findTranscript scans projects and caches', () => {
  const root = fixture();
  mkdirSync(join(root, 'projects', '-home-u-proj100'), { recursive: true });
  const p = join(root, 'projects', '-home-u-proj100', 'sess-100.jsonl');
  writeFileSync(p, '');
  const cache = new Map<string, string>();
  assert.equal(findTranscript(root, 'sess-100', cache), p);
  assert.equal(cache.get('sess-100'), p);
  assert.equal(findTranscript(root, 'sess-999', cache), null);
});

test('readAccount exposes only name and plan', () => {
  const home = tempDir('animus-home');
  const root = join(home, '.claude');
  mkdirSync(root);
  writeFileSync(
    join(home, '.claude.json'),
    JSON.stringify({ oauthAccount: { displayName: 'Ada', seatTier: 'max', emailAddress: 'e@x', accessToken: 'SECRET' } }),
  );
  const acct = readAccount(root);
  assert.deepEqual(acct, { name: 'Ada', plan: 'max' });
  assert.ok(!JSON.stringify(acct).includes('SECRET'));
  assert.equal(readAccount(join(tempDir('animus-none'), 'home', '.claude')), null);
});

test('claudeRoot precedence: flag > env > home', () => {
  assert.equal(claudeRoot('/x', { CLAUDE_CONFIG_DIR: '/y' }), '/x');
  assert.equal(claudeRoot(undefined, { CLAUDE_CONFIG_DIR: '/y' }), '/y');
  assert.equal(claudeRoot(undefined, {}), join(homedir(), '.claude'));
});

test('pidAlive treats processes owned by someone else as not ours', { skip: process.getuid?.() === 0 && 'running as root' }, () => {
  assert.equal(pidAlive(1), false);
});

test('pidAlive rejects reused pids and non-positive pids', () => {
  assert.equal(pidAlive(0), false);
  assert.equal(pidAlive(-1), false);
  if (process.platform === 'linux') {
    const stat = readFileSync(`/proc/${process.pid}/stat`, 'utf8');
    const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
    assert.equal(pidAlive(process.pid, start), true);
    assert.equal(pidAlive(process.pid, String(Number(start) + 1)), false);
  }
});

test('readAccount stops at the first config file that exists', () => {
  const home = tempDir('animus-home2');
  const root = join(home, '.claude-work');
  mkdirSync(root);
  writeFileSync(join(root, '.claude.json'), JSON.stringify({ primaryApiKey: 'x' }));
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ oauthAccount: { displayName: 'Other', seatTier: 'pro' } }));
  assert.equal(readAccount(root), null);
});

test('listSessions keeps the inbox socket (a uds: prefix dropped) and the peer protocol', () => {
  const root = tempDir('animus-reg');
  mkdirSync(join(root, 'sessions'));
  const base = { cwd: '/w', status: 'busy', updatedAt: 1, kind: 'interactive' };
  writeFileSync(join(root, 'sessions', '1.json'), JSON.stringify({ ...base, pid: 1, sessionId: 'a', messagingSocketPath: '/run/user/1000/cc-socks/1.sock', peerProtocol: 1 }));
  writeFileSync(join(root, 'sessions', '2.json'), JSON.stringify({ ...base, pid: 2, sessionId: 'b', messagingSocketPath: 'uds:/run/user/1000/cc-socks/2.sock', peerProtocol: 2 }));
  writeFileSync(join(root, 'sessions', '3.json'), JSON.stringify({ ...base, pid: 3, sessionId: 'c' }));
  assert.deepEqual(
    listSessions(root, () => true).map((s) => [s.sessionId, s.socket, s.peerProtocol]),
    [['a', '/run/user/1000/cc-socks/1.sock', 1], ['b', '/run/user/1000/cc-socks/2.sock', 2], ['c', '', 0]],
  );
});

test('listSessions reads only regular registry files of at most 64 KB: never a FIFO, a link or a huge file', { skip: process.platform === 'win32' && 'no FIFOs' }, () => {
  const root = tempDir('animus-reg-odd');
  const dir = join(root, 'sessions');
  mkdirSync(dir);
  const entry = (pid: number, extra = {}) => JSON.stringify({ pid, sessionId: `s${pid}`, cwd: '/w', status: 'busy', updatedAt: 1, kind: 'interactive', ...extra });
  writeFileSync(join(dir, '1.json'), entry(1));
  execFileSync('mkfifo', [join(dir, '2.json')]);
  writeFileSync(join(dir, '3.json'), entry(3, { pad: 'x'.repeat(70_000) }));
  const elsewhere = join(tempDir('animus-reg-else'), '4.json');
  writeFileSync(elsewhere, entry(4));
  symlinkSync(elsewhere, join(dir, '4.json'));
  // Read in a child process: a read that blocks on the FIFO stalls it, not
  // the test.
  const sessions = new URL('../src/claude/sessions.ts', import.meta.url).href;
  const script = `import { listSessions } from ${JSON.stringify(sessions)}; console.log(JSON.stringify(listSessions(process.argv[1], () => true).map((s) => s.pid)));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script, root], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(r.signal, null, 'it never blocked');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout), [1]);
});

test('a registry entry not owned by this user is kept without an inbox, with the reason', () => {
  const root = tempDir('animus-reg-own');
  mkdirSync(join(root, 'sessions'));
  writeFileSync(join(root, 'sessions', '1.json'), JSON.stringify({ pid: 1, sessionId: 'a', cwd: '/w', status: 'busy', updatedAt: 1, kind: 'interactive', messagingSocketPath: '/run/user/1000/cc-socks/1.sock', peerProtocol: 1 }));
  const me = process.getuid?.() ?? 0;
  const mine = listSessions(root, () => true, me)[0];
  assert.equal(mine.socket, '/run/user/1000/cc-socks/1.sock');
  assert.equal(mine.refusal, undefined);
  // A test cannot chown: the user it must belong to is made someone else.
  const theirs = listSessions(root, () => true, me + 1)[0];
  assert.deepEqual([theirs.socket, theirs.peerProtocol, theirs.refusal], ['', 0, 'its registry entry is not yours']);
  assert.deepEqual(inboxOf(theirs, me), { ok: false, reason: 'its registry entry is not yours' });
});
