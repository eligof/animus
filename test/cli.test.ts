import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { themeIds } from '../src/themes/index.ts';
import { tempDir } from './helpers.ts';

const run = (...args: string[]) =>
  spawnSync(process.execPath, ['bin/animus.js', ...args], { encoding: 'utf8' });

test('--version prints package version', () => {
  const r = run('--version');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^animus 0\.1\.0/);
});

test('unknown flag exits 2 with usage', () => {
  const r = run('--nope');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: animus/i);
});

test('--help prints usage and exits 0', () => {
  const r = run('--help');
  assert.equal(r.status, 0);
  assert.match(r.stdout, /usage: animus/i);
});

const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '');

test('--list-themes lists every preset', () => {
  const r = run('--list-themes');
  assert.equal(r.status, 0);
  for (const id of themeIds()) assert.match(r.stdout, new RegExp(`^${id}\\b`, 'm'));
});

for (const id of themeIds()) {
  test(`--snapshot --demo renders the ${id} scene`, () => {
    const r = run('--snapshot', '--demo', '--theme', id, '--width', '120', '--height', '36');
    assert.equal(r.status, 0, r.stderr);
    assert.ok(r.stdout.includes('\x1b['));
    const text = strip(r.stdout);
    assert.equal(text.split('\n').filter(Boolean).length, 36);
    assert.match(text, /ANIMUS/);
  });
}

test('--snapshot of live data with an empty claude dir hints at demo', () => {
  const dir = tempDir('animus-empty');
  const r = run('--snapshot', '--claude-dir', dir, '--at', '1');
  assert.equal(r.status, 0, r.stderr);
  assert.match(strip(r.stdout), /press d for demo/);
});

test('unknown theme exits 2', () => {
  const r = run('--theme', 'nope', '--snapshot');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /unknown theme/);
});

test('bad numbers exit 2', () => {
  assert.equal(run('--snapshot', '--width', 'wide').status, 2);
  assert.equal(run('--fps', '0').status, 2);
});

test('interactive mode needs a terminal', () => {
  const r = run('--demo');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /terminal/i);
});

test('startLoop stops for good when the first frame throws', async () => {
  const { startLoop } = await import('../src/app.ts');
  let calls = 0;
  const errors: unknown[] = [];
  startLoop(() => {
    calls++;
    throw new Error('boom');
  }, 200, (e) => errors.push(e));
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls, 1);
  assert.equal(errors.length, 1);
});

test('startLoop stops after a later frame throws', async () => {
  const { startLoop } = await import('../src/app.ts');
  let calls = 0;
  const errors: unknown[] = [];
  startLoop(() => {
    if (++calls === 3) throw new Error('later');
  }, 200, (e) => errors.push(e));
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls, 3);
  assert.equal(errors.length, 1);
});

test('tildify only shortens paths inside the home directory', async () => {
  const { tildify } = await import('../src/app.ts');
  const { homedir } = await import('node:os');
  const home = homedir();
  assert.equal(tildify(join(home, '.claude')), '~/.claude');
  assert.equal(tildify(home), '~');
  assert.equal(tildify(home + '2/.claude'), home + '2/.claude');
});

test('--pixels selects the cell format', () => {
  const sex = run('--snapshot', '--demo', '--pixels', 'sextant');
  assert.equal(sex.status, 0, sex.stderr);
  assert.ok([...sex.stdout].some((ch) => { const cp = ch.codePointAt(0)!; return cp >= 0x1fb00 && cp <= 0x1fb3b; }));
  const half = run('--snapshot', '--demo', '--pixels', 'half');
  assert.ok(half.stdout.includes('▀'));
  assert.equal(run('--snapshot', '--pixels', 'huge').status, 2);
});
