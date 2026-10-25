import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { themeIds } from '../src/themes/index.ts';
import { tempDir } from './helpers.ts';

// Every run has a home of its own, empty, and no CLAUDE_CONFIG_DIR: no
// test reads the real ~/.claude or ~/.config/animus.
const HOME = tempDir('animus-cli-home');
const own = { HOME, XDG_CONFIG_HOME: join(HOME, '.config'), CLAUDE_CONFIG_DIR: undefined };
const runIn = (env: NodeJS.ProcessEnv, ...args: string[]) =>
  spawnSync(process.execPath, ['bin/animus.js', ...args], { encoding: 'utf8', env: { ...process.env, ...own, ...env } });
const run = (...args: string[]) => runIn({}, ...args);

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

test('--snapshot leaves the crews file as it is, while its agents earn XP', () => {
  // A live session (this test's own process stands in for Claude Code)
  // whose lead checks its work and ends turns: XP, were it counted in.
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const line = (o: unknown) => JSON.stringify(o) + '\n';
  const root = tempDir('animus-snap-claude');
  mkdirSync(join(root, 'sessions'));
  writeFileSync(join(root, 'sessions', `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: 'S1', cwd: '/home/u/rocket', name: 'rocket-7', status: 'busy', updatedAt: now, kind: 'interactive' }));
  const proj = join(root, 'projects', '-home-u-rocket');
  mkdirSync(proj, { recursive: true });
  const turns = [0, 1, 2].flatMap((k) => [
    line({ type: 'assistant', timestamp: iso(now - 3000 + k * 800), message: { id: `m-c${k}`, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `c${k}`, name: 'Bash', input: { command: 'npm test' } }] } }),
    line({ type: 'user', timestamp: iso(now - 2900 + k * 800), message: { content: [{ type: 'tool_result', tool_use_id: `c${k}`, is_error: false, content: 'ok' }] } }),
    line({ type: 'assistant', timestamp: iso(now - 2800 + k * 800), message: { id: `m-e${k}`, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } }),
  ]);
  writeFileSync(join(proj, 'S1.jsonl'), turns.join(''));
  // Its crews file as another animus left it (not as this one writes
  // them), or one it cannot read (which an interactive run moves aside).
  for (const text of ['{"version":1,"crews":{}}', 'not json']) {
    const cfg = tempDir('animus-snap-cfg');
    mkdirSync(join(cfg, 'animus'));
    const path = join(cfg, 'animus', 'crews.json');
    writeFileSync(path, text);
    const r = runIn({ XDG_CONFIG_HOME: cfg }, '--snapshot', '--claude-dir', root, '--at', '2');
    assert.equal(r.status, 0, r.stderr);
    assert.equal(readFileSync(path, 'utf8'), text);
    assert.deepEqual(readdirSync(join(cfg, 'animus')), ['crews.json']);
  }
});

test('on the way out the terminal is put back first, then the theme and the crews are written', async () => {
  const { leave } = await import('../src/app.ts');
  const log: string[] = [];
  const term = { write: (s: string) => log.push(s.includes('a=d') ? 'images off' : s), restore: () => log.push('restore') };
  leave(term, [() => log.push('config'), () => log.push('crews')]);
  assert.deepEqual(log, ['images off', 'restore', 'config', 'crews']);
  // From the process's exit hook too (a direct process.exit): the
  // pictures go with the terminal; a save that fails stops no other.
  log.length = 0;
  leave(term, [() => { throw new Error('read-only'); }, () => log.push('crews')], { images: false });
  assert.deepEqual(log, ['restore', 'crews']);
});

test('on the way out, crews it could not save are owned up to on stderr, once the terminal is back; otherwise nothing is said', async () => {
  const { leave } = await import('../src/app.ts');
  const log: string[] = [];
  const term = { write: (s: string) => log.push(s.includes('a=d') ? 'images off' : s), restore: () => log.push('restore') };
  const say = (s: string) => log.push(`stderr: ${s}`);
  leave(term, [() => log.push('crews')], { note: 'crews.json unreadable (EACCES): progress not saved this run', say });
  assert.deepEqual(log, ['images off', 'restore', 'crews', 'stderr: animus: crews.json unreadable (EACCES): progress not saved this run\n']);
  log.length = 0;
  leave(term, [() => log.push('crews')], { images: false, note: 'crews.json unreadable (EIO): progress not saved this run', say });
  assert.deepEqual(log, ['restore', 'crews', 'stderr: animus: crews.json unreadable (EIO): progress not saved this run\n']);
  log.length = 0;
  leave(term, [() => log.push('crews')], { note: null, say });
  leave(term, [() => log.push('crews')], { say });
  assert.deepEqual(log, ['images off', 'restore', 'crews', 'images off', 'restore', 'crews']);
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

test('--view picks the scene or the dashboard', () => {
  // A snapshot is text: the dashboard unless the scene is asked for.
  const dash = run('--snapshot', '--demo');
  assert.equal(dash.status, 0, dash.stderr);
  assert.match(strip(dash.stdout), /╭─ .*lead · /s);
  const scene = run('--snapshot', '--demo', '--view', 'scene', '--at', '20');
  assert.equal(scene.status, 0, scene.stderr);
  assert.doesNotMatch(strip(scene.stdout), /lead · /);
  assert.ok(scene.stdout.includes('39;49m'), 'scene cells not left on the default colours');
  // Live, from this run's own home: nothing there, so the hint.
  const live = run('--snapshot', '--view', 'dashboard');
  assert.equal(live.status, 0, live.stderr);
  assert.match(strip(live.stdout), /press d for demo/);
  const bad = run('--snapshot', '--view', 'hd');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /--view must be auto, scene or dashboard/);
  // The old flag is gone.
  assert.equal(run('--snapshot', '--pixels', 'half').status, 2);
});
