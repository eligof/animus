import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { Crews, MAX_CREWS, MAX_ROLES, crewKey } from '../src/pet/crew.ts';
import type { CrewBook } from '../src/pet/crew.ts';
import { CrewStore, SAVE_AFTER_MS, crewsPath, crewsText, loadCrews, parseCrews, readCrews, saveCrews } from '../src/pet/store.ts';
import { budget, tempDir } from './helpers.ts';

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
// The book's tables have no prototype; compared by what they hold.
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const book = (): CrewBook => ({ [crewKey('/home/u/rocket')]: { lead: { xp: 340, seen: T0 }, Explore: { xp: 12, seen: T0 - 5000 } } });

test('crews.json sits beside the config: under XDG_CONFIG_HOME, else ~/.config', () => {
  assert.equal(crewsPath({ XDG_CONFIG_HOME: '/x/conf' }), '/x/conf/animus/crews.json');
  assert.equal(crewsPath({}), join(homedir(), '.config', 'animus', 'crews.json'));
});

test('a saved book loads back; the file holds hashes, roles, XP and dates only', () => {
  const path = join(tempDir('animus-crews'), 'animus', 'crews.json');
  assert.deepEqual(plain(loadCrews(path)), {}, 'none yet');
  assert.equal(saveCrews(path, book()), true);
  assert.deepEqual(plain(loadCrews(path)), book());
  const d = JSON.parse(readFileSync(path, 'utf8'));
  assert.deepEqual(d, { version: 1, crews: { [crewKey('/home/u/rocket')]: { lead: { xp: 340, seen: '2026-10-25T10:00:00.000Z' }, Explore: { xp: 12, seen: '2026-10-25T09:59:55.000Z' } } } });
  assert.ok(!readFileSync(path, 'utf8').includes('rocket'));
  assert.deepEqual(readdirSync(join(path, '..')), ['crews.json'], 'no temp file left');
});

test('a corrupt file is moved aside and a fresh book started', () => {
  for (const junk of ['{"version":1,"crews":', '[]', '{"version":2,"crews":{}}', '{"crews":{}}', 'null']) {
    const dir = tempDir('animus-crews');
    const path = join(dir, 'crews.json');
    writeFileSync(path, junk);
    assert.deepEqual(plain(loadCrews(path, T0)), {}, junk);
    assert.ok(!existsSync(path), `${junk}: moved`);
    const bad = join(dir, 'crews.json.bad-2026-10-25T10-00-00-000Z');
    assert.equal(readFileSync(bad, 'utf8'), junk, 'kept as it was');
    assert.equal(saveCrews(path, book()), true);
    assert.deepEqual(plain(loadCrews(path)), book(), 'a fresh one');
  }
});

test('entries that do not fit are dropped and the rest kept', () => {
  const path = join(tempDir('animus-crews'), 'crews.json');
  const k = crewKey('/p');
  writeFileSync(
    path,
    JSON.stringify({
      version: 1,
      crews: {
        [k]: { lead: { xp: 50, seen: '2026-10-25T10:00:00.000Z' }, bad1: { xp: -1, seen: '2026-10-25T10:00:00.000Z' }, bad2: { xp: 'many', seen: '2026-10-25T10:00:00.000Z' }, bad3: 7 },
        'not-a-hash': { lead: { xp: 1, seen: '2026-10-25T10:00:00.000Z' } },
      },
    }),
  );
  assert.deepEqual(plain(loadCrews(path)), { [k]: { lead: { xp: 50, seen: T0 } } });
  assert.ok(existsSync(path), 'a crews file is not moved aside for a bad entry');
});

test('writes wait until a change is ten seconds old; changes meanwhile ride along', () => {
  const store = new CrewStore(join(tempDir('animus-crews'), 'crews.json'));
  const crews = new Crews();
  assert.equal(SAVE_AFTER_MS, 10_000);
  assert.equal(store.tick(T0, crews.data()), false, 'nothing changed');
  crews.give('/p', 'lead', 10);
  store.changed(T0);
  crews.give('/p', 'lead', 20);
  store.changed(T0 + 4000);
  assert.equal(store.tick(T0 + 9999, crews.data()), false);
  assert.equal(store.writes, 0);
  assert.equal(store.tick(T0 + 10_000, crews.data()), true);
  assert.equal(store.writes, 1);
  assert.equal(new Crews(store.load()).xp('/p', 'lead'), 20);
  assert.equal(store.tick(T0 + 60_000, crews.data()), false, 'nothing new');
  assert.equal(store.flush(crews.data()), false, 'nothing new to flush either');
  crews.give('/p', 'lead', 30);
  store.changed(T0 + 61_000);
  assert.equal(store.flush(crews.data()), true, 'on the way out: at once');
  assert.equal(new Crews(store.load()).xp('/p', 'lead'), 30);
  assert.equal(store.writes, 2);
});

test('a place it cannot write never throws', () => {
  const dir = tempDir('animus-crews');
  writeFileSync(join(dir, 'file'), 'x');
  assert.equal(saveCrews(join(dir, 'file', 'crews.json'), book()), false);
  const store = new CrewStore(join(dir, 'file', 'crews.json'));
  store.changed(T0);
  assert.equal(store.flush(book()), false);
  assert.deepEqual(plain(store.load()), {});
  mkdirSync(join(dir, 'crews.json'));
  assert.equal(loadCrews(join(dir, 'crews.json'), T0), null, 'a directory is no crews file');
  assert.ok(existsSync(join(dir, 'crews.json')), 'and is left where it is');
});

test('saving a full book takes a few milliseconds at most', () => {
  const big: CrewBook = {};
  for (let i = 0; i < 200; i++) {
    const roles: CrewBook[string] = {};
    for (const r of ['lead', 'Explore', 'Plan', 'code-reviewer', 'general-purpose', 'test-runner', 'docs-writer', 'security-reviewer']) roles[r] = { xp: i * 37, seen: T0 + i };
    big[crewKey(`/p/${i}`)] = roles;
  }
  const path = join(tempDir('animus-crews'), 'crews.json');
  budget('save 200 crews', () => saveCrews(path, big), 5);
  assert.equal(Object.keys(loadCrews(path)!).length, 200);
});

test('a crews file with a role named __proto__, or xp, loads without harm', () => {
  const k = crewKey('/p');
  const at = '"seen":"2026-10-25T10:00:00.000Z"';
  // Written out by hand: an object literal's __proto__ is its prototype, not a key.
  const text = `{"version":1,"crews":{"${k}":{"__proto__":{"xp":500,${at}},"xp":{"xp":7,${at}},"constructor":{"xp":3,${at}}}}}`;
  const c = new Crews(parseCrews(text)!);
  assert.equal(c.xp('/p', 'xp'), 7);
  assert.equal(c.xp('/p', 'constructor'), 3);
  assert.equal(c.xp('/p', '__proto__'), 0, 'not read');
  assert.equal(c.xp('/p', 'seen'), 0);
  assert.ok(c.count({ agent: 'L', at: T0 + 1, key: 'k', crew: '/p', role: 'lead', kind: 'turn' }));
  assert.doesNotThrow(() => crewsText(c.data()));
  const o: Record<string, unknown> = {};
  assert.equal(o.xp, undefined);
  assert.equal(o.seen, undefined);
});

test('a time that is not an ISO date counts as never: its XP is kept', () => {
  const k = crewKey('/p');
  const roles = { a: { xp: 5, seen: 'never' }, b: { xp: 6, seen: '1' }, c: { xp: 7, seen: 'Oct 25 2026' }, d: { xp: 8 }, e: { xp: 9, seen: 1e12 }, f: { xp: 1, seen: '2026-10-25T10:00:00Z' } };
  const book = parseCrews(JSON.stringify({ version: 1, crews: { [k]: roles } }), T0)!;
  assert.deepEqual(plain(book), { [k]: { a: { xp: 5, seen: 0 }, b: { xp: 6, seen: 0 }, c: { xp: 7, seen: 0 }, d: { xp: 8, seen: 0 }, e: { xp: 9, seen: 0 }, f: { xp: 1, seen: T0 } } });
});

test('a time more than a day ahead of the clock is read as now, so the role is not frozen until then', () => {
  const path = join(tempDir('animus-crews'), 'crews.json');
  const k = crewKey('/p');
  const iso = (ms: number) => new Date(ms).toISOString();
  writeFileSync(path, JSON.stringify({ version: 1, crews: { [k]: { lead: { xp: 50, seen: '2099-01-01T00:00:00.000Z' }, Plan: { xp: 4, seen: iso(T0 + 3_600_000) } } } }));
  assert.deepEqual(plain(loadCrews(path, T0)), { [k]: { lead: { xp: 50, seen: T0 }, Plan: { xp: 4, seen: T0 + 3_600_000 } } }, 'within a day: as it is');
  const c = new Crews(loadCrews(path, T0)!);
  assert.equal(c.count({ agent: 'L', at: T0 + 1000, key: 'k', crew: '/p', role: 'lead', kind: 'turn' })?.xp, 60);
});

test('a file with more crews, or roles a crew, than are kept loads the most recently seen of them', () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const crews: Record<string, unknown> = {};
  for (let i = 0; i < MAX_CREWS + 5; i++) crews[crewKey(`/p/${i}`)] = { lead: { xp: i, seen: iso(T0 + i * 1000) } };
  const roles: Record<string, unknown> = {};
  for (let j = 0; j < MAX_ROLES + 6; j++) roles[`r${j}`] = { xp: j, seen: iso(T0 + 1e6 + j) };
  crews[crewKey('/big')] = roles;
  const book = parseCrews(JSON.stringify({ version: 1, crews }), T0)!;
  assert.equal(Object.keys(book).length, MAX_CREWS);
  for (let i = 0; i < 6; i++) assert.equal(book[crewKey(`/p/${i}`)], undefined, `/p/${i}: among the least recently seen`);
  assert.equal(book[crewKey('/p/6')].lead.xp, 6);
  const big = book[crewKey('/big')];
  assert.equal(Object.keys(big).length, MAX_ROLES);
  for (let j = 0; j < 6; j++) assert.equal(big[`r${j}`], undefined, `r${j}`);
  assert.equal(big.r6.xp, 6);
  assert.equal(big[`r${MAX_ROLES + 5}`].xp, MAX_ROLES + 5);
});

test('a crews file it cannot read is never written over: the run keeps its crews in memory', (t) => {
  if (process.getuid?.() === 0) return t.skip('root reads a file whatever its mode');
  const path = join(tempDir('animus-crews'), 'crews.json');
  assert.equal(saveCrews(path, book()), true);
  chmodSync(path, 0o000);
  t.after(() => chmodSync(path, 0o600));
  assert.equal(loadCrews(path, T0), null);
  const store = new CrewStore(path);
  const crews = new Crews(store.load(T0));
  assert.equal(crews.xp('/p', 'lead'), 0);
  crews.give('/p', 'lead', 10);
  store.changed(T0);
  assert.equal(store.tick(T0 + SAVE_AFTER_MS, crews.data()), false);
  assert.equal(store.flush(crews.data()), false, 'nor on the way out');
  assert.equal(store.writes, 0);
  assert.equal(store.readOnly, true);
  assert.equal(store.readError, 'EACCES', 'and says why');
  chmodSync(path, 0o600);
  assert.deepEqual(plain(loadCrews(path)), book(), 'as it was');
});

test('a crews file there is no reading at all is read once; one read as it should be leaves the store writing', () => {
  const path = join(tempDir('animus-crews'), 'crews.json');
  for (const code of ['EACCES', 'EIO', 'ELOOP']) {
    let reads = 0;
    const store = new CrewStore(path, SAVE_AFTER_MS, () => (reads++, code));
    assert.deepEqual(plain(store.load(T0)), {});
    assert.equal(reads, 1, `${code}: not tried again`);
    assert.equal(store.readOnly, true, code);
    assert.equal(store.readError, code);
  }
  // None yet, a crews file, one moved aside: nothing to say.
  for (const text of [null, crewsText(book()), 'not json']) {
    if (text !== null) writeFileSync(path, text);
    const store = new CrewStore(path);
    store.load(T0);
    assert.equal(store.readOnly, false, String(text));
    assert.equal(store.readError, null);
  }
});

test('a crews file that cannot be read for a moment (too many files open, busy) is tried again before the run gives up on it', () => {
  const path = join(tempDir('animus-crews'), 'crews.json');
  assert.equal(saveCrews(path, book()), true);
  for (const code of ['EMFILE', 'ENFILE', 'EAGAIN', 'EINTR', 'EBUSY']) {
    let reads = 0;
    const store = new CrewStore(path, SAVE_AFTER_MS, (p, now) => (++reads < 3 ? code : readCrews(p, now)));
    const crews = new Crews(store.load(T0));
    assert.equal(reads, 3, code);
    assert.equal(crews.xp('/home/u/rocket', 'lead'), 340, `${code}: read on the third try`);
    assert.equal(store.readOnly, false, code);
    crews.give('/p', 'lead', 10);
    store.changed(T0);
    assert.equal(store.flush(crews.data()), true, `${code}: and saved`);
  }
  // One that does not pass: given up on after a few more tries, a moment
  // apart, and not written over.
  const times: number[] = [];
  const store = new CrewStore(path, SAVE_AFTER_MS, () => (times.push(performance.now()), 'EAGAIN'));
  store.load(T0);
  assert.equal(times.length, 4, 'three more tries');
  for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= 5, `a moment apart: ${times[i] - times[i - 1]}ms`);
  assert.ok(times[3] - times[0] < 1000, 'and not long');
  assert.equal(store.readOnly, true);
  assert.equal(store.readError, 'EAGAIN');
  store.changed(T0);
  assert.equal(store.flush(book()), false);
});

test('nor is anything in its place that is not a plain file', (t) => {
  const path = join(tempDir('animus-crews'), 'crews.json');
  try {
    execFileSync('mkfifo', [path]);
  } catch {
    return t.skip('no mkfifo here');
  }
  const store = new CrewStore(path);
  const crews = new Crews(store.load(T0));
  crews.give('/p', 'lead', 10);
  store.changed(T0);
  assert.equal(store.flush(crews.data()), false);
  assert.ok(lstatSync(path).isFIFO(), 'left as it is');
  assert.equal(store.readError, 'not a file');
});

test('a write that fails is tried again, a while later and on the way out', () => {
  const dir = join(tempDir('animus-crews'), 'animus');
  const path = join(dir, 'crews.json');
  const store = new CrewStore(path);
  const crews = new Crews(store.load(T0));
  // A file where the directory should be: the write fails until it goes.
  writeFileSync(dir, 'in the way');
  crews.give('/p', 'lead', 10);
  store.changed(T0);
  assert.equal(store.tick(T0 + SAVE_AFTER_MS, crews.data()), false);
  assert.equal(store.writes, 0, 'only a write that worked counts');
  rmSync(dir);
  assert.equal(store.tick(T0 + SAVE_AFTER_MS + 1, crews.data()), false, 'not tried again at every tick');
  assert.equal(store.tick(T0 + 2 * SAVE_AFTER_MS, crews.data()), true);
  assert.equal(store.writes, 1);
  rmSync(dir, { recursive: true });
  writeFileSync(dir, 'in the way');
  crews.give('/p', 'lead', 20);
  store.changed(T0 + 3 * SAVE_AFTER_MS);
  assert.equal(store.flush(crews.data()), false);
  rmSync(dir);
  assert.equal(store.flush(crews.data()), true, 'the last flush tries again');
  assert.equal(new Crews(loadCrews(path)!).xp('/p', 'lead'), 20);
  assert.equal(store.writes, 2);
});

test('a crews.json that is a link is written through it: the link stays, the file it points at changes', () => {
  const dir = tempDir('animus-crews');
  mkdirSync(join(dir, 'dotfiles'));
  mkdirSync(join(dir, 'animus'));
  const real = join(dir, 'dotfiles', 'crews.json');
  const path = join(dir, 'animus', 'crews.json');
  assert.equal(saveCrews(real, book()), true);
  symlinkSync(join('..', 'dotfiles', 'crews.json'), path);
  const store = new CrewStore(path);
  const crews = new Crews(store.load(T0));
  assert.equal(crews.xp('/home/u/rocket', 'lead'), 340);
  crews.give('/p', 'lead', 10);
  store.changed(T0);
  assert.equal(store.flush(crews.data()), true);
  assert.ok(lstatSync(path).isSymbolicLink(), 'still a link');
  assert.equal(new Crews(loadCrews(real)!).xp('/p', 'lead'), 10);
  assert.deepEqual(readdirSync(join(dir, 'dotfiles')), ['crews.json'], 'no temp file left');
  assert.deepEqual(readdirSync(join(dir, 'animus')), ['crews.json']);
});

test('crews.json is for its owner only, in a directory made for its owner only', () => {
  const base = tempDir('animus-crews');
  const path = join(base, 'conf', 'animus', 'crews.json');
  assert.equal(saveCrews(path, book()), true);
  assert.equal(statSync(path).mode & 0o777, 0o600);
  assert.equal(statSync(dirname(path)).mode & 0o777, 0o700);
  // A directory that is there already keeps its mode.
  const shared = join(base, 'shared');
  mkdirSync(shared);
  chmodSync(shared, 0o755);
  assert.equal(saveCrews(join(shared, 'crews.json'), book()), true);
  assert.equal(statSync(shared).mode & 0o777, 0o755);
  assert.equal(statSync(join(shared, 'crews.json')).mode & 0o777, 0o600);
});

test('a clock set back does not hold a write off for as long', () => {
  const store = new CrewStore(join(tempDir('animus-crews'), 'crews.json'));
  const crews = new Crews(store.load(T0));
  crews.give('/p', 'lead', 10);
  store.changed(T0);
  const back = T0 - 3_600_000;
  assert.equal(store.tick(back, crews.data()), false);
  assert.equal(store.tick(back + SAVE_AFTER_MS, crews.data()), true, 'ten seconds after it went back');
});
