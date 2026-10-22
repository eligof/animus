import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { claudeRoot, findTranscript } from '../src/claude/paths.ts';
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
