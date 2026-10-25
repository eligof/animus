import { closeSync, constants, fstatSync, openSync, readSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';

// The project a working directory belongs to, for its crew: the top of its
// git checkout, else the directory itself, named by its real path (so a
// link to it, or a path with `..` in it, is the same project). A linked
// worktree counts as its repository: its .git file names a git dir of its
// own, whose `commondir` names the repository's, <main>/.git (the main
// checkout) or a bare repository's (the bare repository itself). So a crew
// follows its repo from worktree to worktree. Read once per directory.

const known = new Map<string, string>();
const MAX_KNOWN = 500;

export function projectRoot(cwd: string): string {
  // A relative path is relative to nothing we know: its own project.
  if (!isAbsolute(cwd)) return cwd;
  const at = resolve(cwd);
  const hit = known.get(at);
  if (hit !== undefined) return hit;
  // Walked up from where it really is, as git does.
  let root = real(at);
  for (let dir = root; ; ) {
    const git = join(dir, '.git');
    let st: ReturnType<typeof statSync> | undefined;
    try {
      st = statSync(git);
    } catch {
      st = undefined;
    }
    if (st?.isDirectory()) {
      root = dir;
      break;
    }
    if (st?.isFile()) {
      root = repository(dir, git) ?? dir;
      break;
    }
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  root = real(root);
  if (known.size >= MAX_KNOWN) known.clear();
  known.set(at, root);
  return root;
}

// Its real path; as it is when it has none (it is gone, say).
function real(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

// The repository of the linked worktree at `dir` (null: not one, say a
// submodule, whose .git file points to a git dir with no commondir).
function repository(dir: string, gitFile: string): string | null {
  const m = /^gitdir:\s*(.+?)\s*$/m.exec(head(gitFile) ?? '');
  if (!m) return null;
  const gitdir = resolve(dir, m[1]);
  // One line, the path; git strips only the line break.
  const common = head(join(gitdir, 'commondir'))?.replace(/[\r\n]+$/, '');
  if (!common) return null;
  const at = resolve(gitdir, common);
  return basename(at) === '.git' ? dirname(at) : at;
}

// A gitfile or a commondir is one short line. At most this much of one is
// read, and only from a plain file: a pipe or a device in its place is not
// waited on, nor read without end.
const MAX_HEAD = 4096;
// Reused by every read (they are synchronous).
const headBuf = Buffer.allocUnsafe(MAX_HEAD);

function head(path: string): string | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch {
    return null;
  }
  try {
    if (!fstatSync(fd).isFile()) return null;
    let n = 0;
    for (let r = 1; r > 0 && n < headBuf.length; n += r) r = readSync(fd, headBuf, n, headBuf.length - n, null);
    return headBuf.toString('utf8', 0, n);
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}
