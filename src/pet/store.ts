import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configPath } from '../config.ts';
import { MAX_CREWS, MAX_ROLES, lastSeen, table } from './crew.ts';
import type { CrewBook, RoleRec } from './crew.ts';

// The crews, kept in crews.json beside the config:
//
//   { "version": 1,
//     "crews": { "<hash of the project's path>": { "lead": { "xp": 340, "seen": "2026-10-25T10:00:00.000Z" } } } }
//
// XP per role and when it last earned any, nothing from a transcript. Read
// once at the start; a file that is not one of these is moved aside
// (crews.json.bad-<time>) and a fresh book started. One that cannot be read
// at all (no permission, a failing disk), or something there that is not a
// plain file, is left alone: that run keeps its crews in memory only, and
// says so (CrewStore.readError). A read that fails for a moment (too many
// files open, busy) is tried again first, a few times a moment apart, there
// at the start (a fifth of a second at most): a try later in the run would
// have to merge what it read with the XP counted meanwhile, not worth it
// for so rare a thing.
// Written once a change has waited a while (debounced), and on the way out;
// a small file, for its owner only, written to a temp file and renamed into
// place, so a crash never leaves half of one. If two animus run at once, the
// last to write wins.

export const SAVE_AFTER_MS = 10_000;
// A crews file is small; a bigger one is moved aside like any other that is
// not a crews file.
const MAX_BYTES = 4 << 20;
// Errors reading it that may pass by themselves, and how long to wait (ms)
// before each try again.
const PASSING = new Set(['EMFILE', 'ENFILE', 'EAGAIN', 'EINTR', 'EBUSY']);
const RETRY_MS = [10, 40, 160];

export function crewsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(configPath(env)), 'crews.json');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// An ISO date and time, as toISOString writes them (or with an offset for
// the Z). Date.parse alone reads far more: "1" is 2001.
const ISO = /^(\d{4}|[+-]\d{6})-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?(Z|[+-]\d\d:\d\d)$/;
// A time saved further ahead than this was saved by a clock that was wrong.
const AHEAD_MS = 24 * 3600_000;

// When a role last earned (`seen`, ms): 0, never, when it is not a time.
// One from well past `now` is read as now; as a floor it would let the role
// earn nothing until the clock caught up.
function seenOf(v: unknown, now: number): number {
  const t = typeof v === 'string' && ISO.test(v) ? Date.parse(v) : NaN;
  if (!(t > 0)) return 0;
  return t > now + AHEAD_MS ? now : t;
}

// The `n` of `items` seen most recently (all of them, as they are, if no
// more than that).
function newest<T>(items: T[], n: number, when: (item: T) => number): T[] {
  return items.length <= n ? items : items.toSorted((a, b) => when(b) - when(a)).slice(0, n);
}

// The book in a crews file's text (entries that do not fit dropped, and
// past the caps the least recently seen); null when it is not a crews file
// at all.
export function parseCrews(text: string, now = Date.now()): CrewBook | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(d) || d.version !== 1 || !isObj(d.crews)) return null;
  const crews: Array<[string, Record<string, RoleRec>, number]> = [];
  for (const [k, roles] of Object.entries(d.crews)) {
    if (!/^[0-9a-f]{16}$/.test(k) || !isObj(roles)) continue;
    const found: Array<[string, RoleRec]> = [];
    for (const [role, r] of Object.entries(roles)) {
      // JSON.parse keeps a "__proto__" key as a key of its own, but anything
      // that copies the book into a plain object would make it the prototype.
      if (role === '__proto__' || !isObj(r) || role.length > 64 || typeof r.xp !== 'number' || !Number.isFinite(r.xp) || r.xp < 0) continue;
      found.push([role, { xp: Math.floor(r.xp), seen: seenOf(r.seen, now) }]);
    }
    if (!found.length) continue;
    const out = table<RoleRec>();
    for (const [role, r] of newest(found, MAX_ROLES, ([, r]) => r.seen)) out[role] = r;
    crews.push([k, out, lastSeen(out)]);
  }
  const book: CrewBook = table();
  for (const [k, out] of newest(crews, MAX_CREWS, ([, , t]) => t)) book[k] = out;
  return book;
}

export function crewsText(book: CrewBook): string {
  const crews: Record<string, Record<string, { xp: number; seen: string }>> = {};
  for (const [k, roles] of Object.entries(book)) {
    const out: Record<string, { xp: number; seen: string }> = {};
    // A role called __proto__ is not written either: parseCrews would not
    // read it back, so its XP lasts the run.
    for (const [role, r] of Object.entries(roles)) if (role !== '__proto__') out[role] = { xp: r.xp, seen: new Date(r.seen).toISOString() };
    crews[k] = out;
  }
  return JSON.stringify({ version: 1, crews }, null, 2) + '\n';
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[:.]/g, '-');

// The book in `path` (empty when there is none yet). One that is not a
// crews file is moved aside, so nothing is lost. When what is there cannot
// be read (no permission, a read error) or is not a plain file (a
// directory, a pipe), why: the error's code, or 'not a file'. That is not
// ours to move, nor to write over (see CrewStore).
export function readCrews(path: string, now = Date.now()): CrewBook | string {
  // Opened once and checked through the handle, so what is read is what
  // was checked; without blocking, so a pipe there cannot hang the start.
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    return code === 'ENOENT' ? table() : (code ?? 'error');
  }
  let text: string;
  try {
    const st = fstatSync(fd);
    if (!st.isFile()) return 'not a file';
    text = st.size <= MAX_BYTES ? readFileSync(fd, 'utf8') : '';
  } catch (err) {
    return (err as NodeJS.ErrnoException).code ?? 'error';
  } finally {
    closeSync(fd);
  }
  const book = parseCrews(text, now);
  if (book) return book;
  try {
    renameSync(path, `${path}.bad-${stamp(now)}`);
  } catch {
    // Left where it is; the next save replaces it.
  }
  return table();
}

// The book in `path` as readCrews reads it; null when there is no reading
// it.
export function loadCrews(path: string, now = Date.now()): CrewBook | null {
  const got = readCrews(path, now);
  return typeof got === 'string' ? null : got;
}

// Best effort: a read-only config dir must not break the app. A crews.json
// that is a link (to a dotfiles repo, say) is written through: the file it
// points at is replaced, in its own directory, and the link stays. The file
// is its owner's only, and so is the directory if it has to be made (one
// that is there already keeps its mode).
export function saveCrews(path: string, book: CrewBook): boolean {
  let target = path;
  try {
    if (lstatSync(path).isSymbolicLink()) target = realpathSync(path);
  } catch {
    // None yet, or a link to nothing, which the file replaces.
  }
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(tmp, crewsText(book), { mode: 0o600 });
    renameSync(tmp, target);
    return true;
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Nothing more to do.
    }
    return false;
  }
}

// When the book is written: once a change has waited `wait` ms (changes in
// the meantime ride along), and on the way out (flush). A write that fails
// is tried again a while later, and on the way out.
//
// The times are the caller's (the World's `now`, which tests drive), not a
// monotonic clock of the store's own; a wall clock set back is caught
// instead, in tick.
export class CrewStore {
  readonly path: string;
  // Writes that worked.
  writes = 0;
  // Why what was at `path` could not be read (see readCrews); null while
  // it could. Once set, this run never writes over it.
  readError: string | null = null;
  private due = Infinity;
  private wait: number;
  private read: typeof readCrews;

  // `read`: how the file is read (tests stand in for a failing disk).
  constructor(path = crewsPath(), wait = SAVE_AFTER_MS, read: typeof readCrews = readCrews) {
    this.path = path;
    this.wait = wait;
    this.read = read;
  }

  get readOnly(): boolean {
    return this.readError !== null;
  }

  load(now = Date.now()): CrewBook {
    let got = this.read(this.path, now);
    for (const ms of RETRY_MS) {
      if (typeof got !== 'string' || !PASSING.has(got)) break;
      // A pause that holds the thread: only at the start, and rarely.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
      got = this.read(this.path, now);
    }
    if (typeof got !== 'string') return got;
    this.readError ??= got;
    return table();
  }

  // The book changed at `now`.
  changed(now: number): void {
    if (this.due === Infinity && !this.readOnly) this.due = now + this.wait;
  }

  // Writes `book` once a change is due; true when it wrote.
  tick(now: number, book: CrewBook): boolean {
    if (this.due === Infinity) return false;
    // The clock was set back since the change: the wait counts from now,
    // not from a time that may be hours ahead.
    if (this.due - now > this.wait) this.due = now + this.wait;
    if (now < this.due) return false;
    if (this.flush(book)) return true;
    // It failed: tried again a while later, not at every tick.
    this.due = now + this.wait;
    return false;
  }

  // Writes `book` now if it changed since the last write.
  flush(book: CrewBook): boolean {
    if (this.due === Infinity || this.readOnly) return false;
    // `due` stays set until a write works, so a failed one is tried again.
    if (!saveCrews(this.path, book)) return false;
    this.due = Infinity;
    this.writes++;
    return true;
  }
}
