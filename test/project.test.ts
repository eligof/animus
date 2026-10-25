import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { projectRoot } from '../src/pet/project.ts';
import { tempDir } from './helpers.ts';

// A fresh directory, as its real path (projects are named by theirs).
const fresh = () => realpathSync(tempDir('animus-proj'));

// Runs git in `cwd`, away from the user's own config and any repository
// the tests themselves run in.
function git(cwd: string, ...args: string[]): void {
  const env: NodeJS.ProcessEnv = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' };
  for (const [k, v] of Object.entries(process.env)) if (!k.startsWith('GIT_')) env[k] = v;
  execFileSync('git', ['-c', 'init.defaultBranch=main', ...args], { cwd, env, stdio: 'ignore' });
}
const hasGit = (() => {
  try {
    execFileSync('git', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

test('a directory inside a git checkout belongs to the top of the checkout', () => {
  const repo = fresh();
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'src', 'deep'), { recursive: true });
  assert.equal(projectRoot(repo), repo);
  assert.equal(projectRoot(join(repo, 'src', 'deep')), repo);
});

test('a linked worktree belongs to its main checkout, by an absolute or a relative path; a submodule to itself', () => {
  const base = fresh();
  const main = join(base, 'app');
  // What git leaves in the main checkout's .git for each linked worktree:
  // its own git dir, whose commondir names the repository's.
  for (const name of ['feature', 'fix']) {
    mkdirSync(join(main, '.git', 'worktrees', name), { recursive: true });
    writeFileSync(join(main, '.git', 'worktrees', name, 'commondir'), '../..\n');
  }
  const wt = join(base, 'app-feature');
  mkdirSync(join(wt, 'lib'), { recursive: true });
  writeFileSync(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'feature')}\n`);
  assert.equal(projectRoot(join(wt, 'lib')), main);
  const rel = join(base, 'app-fix');
  mkdirSync(rel);
  writeFileSync(join(rel, '.git'), 'gitdir: ../app/.git/worktrees/fix\n');
  assert.equal(projectRoot(rel), main);
  const sub = join(main, 'vendor', 'dep');
  mkdirSync(sub, { recursive: true });
  mkdirSync(join(main, '.git', 'modules', 'dep'), { recursive: true });
  writeFileSync(join(sub, '.git'), 'gitdir: ../../.git/modules/dep\n');
  assert.equal(projectRoot(sub), sub);
});

test('a .git file whose git dir is gone, or that is not a gitfile at all, leaves the folder holding it', () => {
  const base = fresh();
  const gone = join(base, 'gone');
  mkdirSync(gone);
  writeFileSync(join(gone, '.git'), `gitdir: ${join(base, 'nowhere', '.git', 'worktrees', 'x')}\n`);
  assert.equal(projectRoot(gone), gone);
  const junk = join(base, 'junk');
  mkdirSync(junk);
  writeFileSync(join(junk, '.git'), 'x'.repeat(100_000));
  assert.equal(projectRoot(junk), junk);
});

test('with git: linked worktrees of a checkout, and of a bare repository, each belong to their repository', (t) => {
  if (!hasGit) return t.skip('no git here');
  const base = fresh();
  const main = join(base, 'main');
  git(base, 'init', '-q', main);
  git(main, 'commit', '-q', '--allow-empty', '-m', 'first');
  git(main, 'worktree', 'add', '-q', join(base, 'main-wt'));
  assert.equal(projectRoot(join(base, 'main-wt')), main);
  const bare = join(base, 'proj.git');
  git(base, 'clone', '-q', '--bare', main, bare);
  git(bare, 'worktree', 'add', '-q', join(base, 'one'));
  git(bare, 'worktree', 'add', '-q', join(base, 'two'));
  mkdirSync(join(base, 'two', 'lib'));
  assert.equal(projectRoot(join(base, 'one')), bare);
  assert.equal(projectRoot(join(base, 'two', 'lib')), bare, 'one crew for both');
});

test('a path through a link, or written loosely, names the project by its real path', () => {
  const base = fresh();
  const repo = join(base, 'repo');
  mkdirSync(join(repo, '.git'), { recursive: true });
  mkdirSync(join(repo, 'src'));
  symlinkSync(repo, join(base, 'to-repo'));
  symlinkSync(join(repo, 'src'), join(base, 'to-src'));
  assert.equal(projectRoot(join(base, 'to-repo')), repo);
  assert.equal(projectRoot(join(base, 'to-repo', 'src')), repo);
  assert.equal(projectRoot(join(base, 'to-src')), repo, 'a link into the middle of it');
  assert.equal(projectRoot(`${repo}/src/../src/.`), repo);
  assert.equal(projectRoot(`${repo}//src/`), repo);
});

// Whether `dir` or any folder above it holds a .git.
function inCheckout(dir: string): boolean {
  for (let d = dir; ; d = dirname(d)) {
    if (existsSync(join(d, '.git'))) return true;
    if (dirname(d) === d) return false;
  }
}

test('outside any checkout a directory is its own project', (t) => {
  assert.equal(projectRoot('relative/dir'), 'relative/dir');
  const dir = join(fresh(), 'loose');
  mkdirSync(dir);
  if (inCheckout(dir)) return t.skip(`the temp dir, ${dirname(dir)}, is inside a git checkout`);
  assert.equal(projectRoot(dir), dir);
});
