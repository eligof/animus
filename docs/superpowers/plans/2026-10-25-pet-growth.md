# Pet layer, part 3: growth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each project gets a crew that grows over weeks from real work. The lead and each subagent type earn XP for finished turns, passing builds and tests, and finished subagent runs; they level up with a burst of the world's confetti and a `★N!`; levels unlock cosmetics drawn in every world's style (a hat, a badge, a desk upgrade at the favourite station, an outfit colour swap, an aura). The crew is kept in `crews.json`, nothing from transcripts. The in-scene face states that part 1 deferred come with it: drowsy eyes, a bandage, a happy bounce.

**Architecture:** Sources report what earns XP as `Gain`s: the Claude source reads them from transcripts (`claude/gains.ts`) and the demo makes up its own. `pet/crew.ts` holds the pure rules (points, levels, unlocks) and `Crews`, a ledger that counts each gain once even when a transcript is read again. `pet/store.ts` keeps the ledger in `crews.json` (debounced, corrupt files moved aside), and `pet/project.ts` names a crew by its git checkout. The World counts gains into the live and demo crews, gives each agent its role's `level`, and tells the stage about level-ups. The stage turns meters into a figure's `feel`, a level into its `wear`, and time at the stations into desk upgrades. The figure art draws the face states and cosmetics as part of the sprite key, and the scene draws the desk upgrades and the hop.

**Tech Stack:** TypeScript on Node 26 (runs .ts directly), `node:test`, `node:crypto` for the project hash, no dependencies. Spec: `docs/superpowers/specs/2026-10-25-pet-layer-design.md` (section 4, Growth; and section 1's in-scene face states).

**Conventions (read before starting):**
- Worktree: `<repo>` (branch `illustrated`, at `b5166ae` or later). Run every command from there.
- Tests: `node --test test/<file>.test.ts`; full suite `node --test "test/**/*.test.ts"` (901 tests before this plan, 956 after; each task gives the count it ends at).
- Typecheck: `node node_modules/typescript/bin/tsc -p tsconfig.json`. `node_modules` is a symlink to a scratch install; leave it alone.
- Style: 2-space indent, single quotes, comments that say why in plain English like the surrounding code. No new dependencies.
- Commit messages end with these two trailer lines:
- Never run bare `git stash`: the stash is shared with the other worktrees. To set work aside, make a WIP commit.
- Privacy: tests use synthetic records only. `crews.json` holds a hash of each project's path, and per role its XP and the date it last earned any: no path, no session id, nothing from a transcript.
- Every glyph drawn is one cell (`★` is; it passes `cellSafe`).
- How the steps are written: a new file is given whole. A changed file is given as edits in order: **After** a block (which occurs once in the file at that point) **insert** lines; **Replace** a block (which occurs once) **with** another; **Append** to the end. Blank lines inside a block count.
- Every task's code below was run during planning in a scratch copy of this tree, one commit per task, on `e34d779`. Applying each task's edits, exactly as written, to the commit before it was checked to give that commit's files byte for byte; each task's failing and passing runs, the typecheck and the full suite were run at that commit. The whole plan was then applied again, from this text, on `b5166ae` (a later chat fix in files this plan does not touch, one test more): typecheck clean, 956 tests pass. The suite counts written here are for `b5166ae`. The figures, desk upgrades and level-up were also looked at in a real Ghostty. If a step's output differs from what is written, stop and look before changing a test. The suite has a few fixed time bounds (e.g. the chat's "300 bubbles … under 2 ms"); under heavy load one can fail once. Rerun that file alone before suspecting the change.

**Decisions this plan makes (beyond the spec):**
1. **Who earns what.** A finished turn (+10) is a lead's: its final reply stopped with `end_turn`, counted once per prompt. A reply written as several records, or a stop hook sending it on, is still one turn; an interrupted turn or an API error's stand-in reply earns nothing. A build or test command that passed (+5) goes to whoever ran it, the lead or the subagent's type. A finished subagent (+3) goes to its own type, once per run. The source's existing finish signals tell when it has finished: its transcript, meta.json, the lead's task notification, the launching call's result. A subagent's run is not also a "turn", and a lead earns nothing for its subagents.
2. **Build and test commands** (`isCheck` in `claude/gains.ts`). The shell line is split at `&&`, `||`, `;`, `|` and line breaks. A part counts when, after `VAR=value`, `sudo`, `time`, `timeout N`, `nice`, `env` and runners (`npx`, `bunx`, `pnpm exec/dlx`, `yarn dlx`, `uv run`, `poetry run`, `pipenv run`, `bundle exec`) are stripped and a path is cut to its program's name, it starts with one of these:
   - `npm`, `pnpm`, `yarn` or `bun` (optionally `run`) followed by `test`, `build`, `typecheck`, `tsc` or `check` (also `test:unit` and the like), and `npm t`;
   - `tsc`, `vitest`, `jest`, `mocha`, `ava`, `tap`, `playwright test`, `cypress run`, `node --test`, `node …/tsc|jest|vitest|mocha`, `deno test|check|compile`, `bun test`;
   - `pytest`, `python -m pytest|unittest|tox|mypy|compileall`, `tox`, `nox`, `mypy`, `pyright`;
   - `cargo test|build|check|nextest|bench`, `go test|build|vet`;
   - `make` alone or with `all`, `build`, `test`, `tests` or `check` (flags allowed; `make clean`/`lint` do not count);
   - `mvn` and `mvnw` `test|package|verify|install|compile`, `gradle` and `gradlew` `test|build|check|assemble`, `dotnet test|build`;
   - `cmake --build`, `ctest`, `ninja`, `meson test|compile`, `bazel` and `bazelisk` `test|build`, `swift test|build`, `xcodebuild`;
   - `mix test|compile`, `rspec`, `phpunit`, `pest`, `rake` (alone, `test` or `spec`), `zig`, `stack`, `cabal` and `dune` `test|build`.

   It passed when its result is not an error (Claude Code marks a non-zero exit as one; a refused call is one too).
3. **No double counting: per-agent watermarks in memory, and each role's saved `seen` as a floor.** Within a run, `Crews` remembers each agent's latest counted event: its time and the keys counted at that time. Keys are message ids for turns, tool call ids for checks, and `finish` for a subagent run. A transcript read again (its session came back, its path changed) counts nothing at or before it. Across runs, a gain counts only if it is newer than its role's `seen` as loaded, and every gain ever counted for that role was no newer than that. So nothing is counted twice, and nothing beyond "XP per role and the last-seen date" is stored.
   - The alternative, a persisted watermark per session id, would store session ids and grow with every session; it was rejected.
   - The cost: an event older than its role's last counted event, never read before animus quit, is not counted. That is only possible for a record written with an old timestamp.
   - XP and `seen` are saved together, so a crash loses both together: the tail is read again and they are recounted once.
4. **What the start reads of the past counts, quietly.** A first run (or a session's backlog since the last run) counts every gain in the transcripts' tails that is newer than the floor. Level-ups from events before the World's start are not celebrated: no burst or mark on launch.
5. **The project** is the top of the git checkout of the agent's working directory. A linked worktree counts as its main checkout (its `.git` file points into `<main>/.git/worktrees/`), so a crew follows a repo across worktrees. A submodule is its own project; outside a checkout, the directory itself. The crew's key is the first 16 hex digits of the SHA-256 of that path. A subagent is in its lead's crew.
6. **`crews.json`** is `{ "version": 1, "crews": { "<hash>": { "<role>": { "xp": N, "seen": "<ISO date>" } } } }`, beside `config.json` (so `$XDG_CONFIG_HOME` is honoured).
   - A file that does not parse as one (bad JSON, wrong version, wrong shape, or over 4 MB) is renamed `crews.json.bad-<ISO time>` and a fresh book starts. Single bad entries are dropped and the rest kept. A non-file in its place is left alone.
   - It is written synchronously, but at most once per change burst: when a change is ten seconds old, and at once on exit. The file is small and goes to a temp file renamed into place; the budget test holds a full 200-crew save under 5 ms. An asynchronous write was rejected: one still in flight at exit could land after the final save and overwrite it.
   - At most 200 crews (the least recently seen go) and 64 roles a crew. If two animus run at once, the last to write wins.
   - `--snapshot` neither reads nor writes it; `--demo` uses a throwaway crew.
7. **The hat** (★2) comes from the costume's set: a knit beanie (café), a mortarboard (lab), a striped party cone (club), a cap worn backwards (den), an antenna with a glowing bulb on the space helmet (station), and a grander, taller wizard hat with a gold band and stars (the five wizard worlds). It replaces a lamp, a beret or a hood (the hood goes down); a lead's headset stays, under it. It is not worn while a block is carried on the head.
8. **The badge** (★3) is a gold star pin on the chest, seen from the front only (a sleeper's arms may cover it). **The outfit swap** (★8) puts the main garment in the trim's hue at full colour; a white lab coat or space suit is tinted with it, and the trim takes the old colour. A ghost's sheet takes a pastel of it, with gold trim. **The aura** (★10) is a soft radial glow in the agent's own colour, with two or three twinkles, drawn inside the sprite behind the figure.
9. **The desk upgrade** (★5) is a potted plant, a steaming mug on a stool, or a trophy on a plinth. Which one is picked by a hash of the crew and role; it is drawn in the colour of one of the role's agents.
   - It stands on the floor beside the station that role worked at most this run, by one of the station's back corners, else its front ones, clear of the props and of other upgrades.
   - The favourite is counted in memory, not saved, because the spec keeps only XP and the date. After a restart it is learnt again within minutes of work.
   - It shows while an agent of that role is in the room. The mug sends up steam.
10. **Face states:** drowsy eyes when energy is critical, a plaster on the cheek when health is critical, and a grin plus a bounce when mood is at least 0.8 (`BOUNCY`).
    - They are part of the sprite key only as far as they show: no face from behind, and the grin only standing about or walking.
    - The bounce is a hop of up to 0.9 units: a hop a step when walking, one every half second standing about. It lifts the drawn sprite only, not the shadow, the label or the card; it is not in the sprite key, so it costs no new sprites.
11. **A level-up** reuses the finish's fireworks and confetti (factored out of the `done` effect as `burst`). It raises `★N!` in the world's warn colour: a word mark drawn over the labels, centred and bold. No emote pops up over the agent at that moment, so nothing hides the mark. Every actor of the role in the room celebrates.
12. **The card** shows `★N` before the name, in the warn colour made to read on the panel, capped at ★99. The dashboard view is unchanged; the spec asks only for the card.
13. **The demo crew** gains from its own events: a lead's turn when it starts waiting, a check when it runs one of its build or test commands, a finished run when a subagent is done. These are deterministic and take no random draws. Its throwaway crews start fast-forwarded (`DEMO_XP`), so a demo shows growth at once: atlas's lead is at ★10 with every unlock, and nova's lead is ten XP short of ★4, which its first finished turn (within a minute) brings with a burst.

## File map

| File | What it does |
|---|---|
| `src/agents.ts` (modify) | `Gain`; `AgentInfo.crew`, `AgentInfo.level`; `AgentSource.drainGains?` |
| `src/pet/crew.ts` (new) | `POINTS`, `xpFor`, `levelOf`, `UNLOCKS`, `unlocks`, `roleOf`; `crewKey`, `Crews` (the ledger), `CrewBook`, `Award` |
| `src/pet/store.ts` (new) | `crewsPath`, `parseCrews`, `crewsText`, `loadCrews`, `saveCrews`, `CrewStore` (debounced writes), `SAVE_AFTER_MS` |
| `src/pet/project.ts` (new) | `projectRoot(cwd)`: the crew's project |
| `src/pet/meters.ts` (modify) | `BOUNCY`, `feelOf(meters)` |
| `src/claude/gains.ts` (new) | `isCheck(command)`, `GainReader` |
| `src/claude/source.ts` (modify) | a `GainReader` per transcript; `drainGains`; each agent's `crew`; a subagent's finish |
| `src/demo/source.ts` (modify) | `DEMO_XP`; its agents' `crew`; `drainGains` |
| `src/world/character.ts` (modify) | `Feel`, `Wear` |
| `src/world/frame.ts` (modify) | `FigureFrame.feel / wear / hop`; `Trinket`, `TrinketFrame`, `MUG_TOP`, `SceneFrame.trinkets` |
| `src/art/figure/rig.ts` (modify) | the `drowsy` eyes kind |
| `src/art/figure/look.ts` (modify) | `Prize`, `PRIZES`, `GOLD`; the look's `prize / badge / aura`; the outfit swap |
| `src/art/figure/head.ts` (modify) | drowsy eyes, the plaster, the six hats; `star` exported |
| `src/art/figure/body.ts` (modify) | the badge, the aura; `bandaged` to the head |
| `src/art/figure/trinkets.ts` (new) | the plant, the mug, the trophy |
| `src/art/figure.ts` (modify) | the sprite key with feel and wear; a bigger box; `trinketSprite` |
| `src/art/scene.ts` (modify) | desk upgrades among the depth-sorted items; the hop |
| `src/world/stage.ts` (modify) | `levelUp`, `burst`; feel, wear and hop per figure; the station tally and desk upgrades; word marks |
| `src/ui/card.ts` (modify) | `★N` on the top edge |
| `src/world/world.ts` (modify) | live and demo crews, levels, level-ups, saving (`WorldOpts.crews`, `saveCrews`) |
| `src/app.ts` (modify) | an interactive run's `CrewStore`, saved on exit |
| `README.md` (modify) | a Growth section |
| `test/crew.test.ts`, `test/store.test.ts`, `test/project.test.ts`, `test/gains.test.ts` (new); `test/source.test.ts`, `test/demo.test.ts`, `test/figure.test.ts`, `test/scene.test.ts`, `test/stage.test.ts`, `test/card.test.ts`, `test/world.test.ts` (extend) | tests |

---

### Task 1: Levels and unlocks

**Files:**
- Test: `test/crew.test.ts` (new)
- Create: `src/pet/crew.ts`

The pure rules of growth start `src/pet/crew.ts`: what each kind of gain is worth, the level thresholds (100, 250, 500, 1000, then doubling), what each level unlocks, and the role an agent is kept under in its crew.

- [ ] **Step 1: The failing test, `test/crew.test.ts`**

The tests for the rules.

Create `test/crew.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { POINTS, UNLOCKS, levelOf, roleOf, unlocks, xpFor } from '../src/pet/crew.ts';

test('levels come at 100, 250, 500 and 1000 XP, then at each doubling', () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(xpFor), [0, 100, 250, 500, 1000, 2000, 4000, 8000, 16000, 32000]);
  assert.equal(levelOf(0), 1);
  assert.equal(levelOf(99), 1);
  assert.equal(levelOf(100), 2);
  assert.equal(levelOf(249), 2);
  assert.equal(levelOf(250), 3);
  assert.equal(levelOf(999), 4);
  assert.equal(levelOf(1000), 5);
  assert.equal(levelOf(31_999), 9);
  assert.equal(levelOf(32_000), 10);
  assert.equal(levelOf(1e300), 99, 'capped');
});

test('a finished turn is worth 10, a passing build or test 5, a finished subagent 3', () => {
  assert.deepEqual(POINTS, { turn: 10, check: 5, subagent: 3 });
});

test('unlocks: a hat at 2, a badge at 3, the desk at 5, the outfit at 8, the aura at 10', () => {
  assert.deepEqual(UNLOCKS, [['hat', 2], ['badge', 3], ['desk', 5], ['outfit', 8], ['aura', 10]]);
  assert.deepEqual(unlocks(1), { hat: false, badge: false, desk: false, outfit: false, aura: false });
  assert.deepEqual(unlocks(2), { hat: true, badge: false, desk: false, outfit: false, aura: false });
  assert.deepEqual(unlocks(4), { hat: true, badge: true, desk: false, outfit: false, aura: false });
  assert.deepEqual(unlocks(7), { hat: true, badge: true, desk: true, outfit: false, aura: false });
  assert.deepEqual(unlocks(9), { hat: true, badge: true, desk: true, outfit: true, aura: false });
  assert.deepEqual(unlocks(12), { hat: true, badge: true, desk: true, outfit: true, aura: true });
});

test('agents are kept by role: the lead, or the subagent type', () => {
  assert.equal(roleOf({ role: 'lead', agentType: 'Explore' }), 'lead');
  assert.equal(roleOf({ role: 'sub', agentType: 'Explore' }), 'Explore');
  assert.equal(roleOf({ role: 'sub' }), 'general-purpose');
  assert.equal(roleOf({ role: 'sub', agentType: 'x'.repeat(100) }).length, 64);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/crew.test.ts`
Expected: FAIL: `Cannot find module '…/src/pet/crew.ts'`.

- [ ] **Step 3: `src/pet/crew.ts`**

The rules.

Create `src/pet/crew.ts`:

```ts
import type { AgentInfo } from '../agents.ts';

// Growth: a crew per project, its agents kept by role (the lead, and each
// subagent type), each growing with XP from real work (see
// claude/gains.ts): a finished turn of the lead's, a build or test command
// that passed, a subagent that finished its run. Failures cost nothing.
// Levels come at 100, 250, 500 and 1000 XP, then at each doubling; some
// unlock something to wear or show. All of it is cosmetic.

export type GainKind = 'turn' | 'check' | 'subagent';
export const POINTS: Record<GainKind, number> = { turn: 10, check: 5, subagent: 3 };

const STEPS = [100, 250, 500, 1000];
const MAX_LEVEL = 99;

// The XP that reaches `level` (★1 from the start).
export function xpFor(level: number): number {
  if (level <= 1) return 0;
  if (level - 2 < STEPS.length) return STEPS[level - 2];
  return STEPS[STEPS.length - 1] * 2 ** (level - 1 - STEPS.length);
}

export function levelOf(xp: number): number {
  let n = 1;
  while (n < MAX_LEVEL && xp >= xpFor(n + 1)) n++;
  return n;
}

// What a level unlocks, each kept from then on: a hat from the world's
// costume set, a badge on the shirt, an upgrade at its favourite station
// (a plant, a steaming mug or a trophy), its outfit in other colours, a
// soft aura.
export type Unlocks = { hat: boolean; badge: boolean; desk: boolean; outfit: boolean; aura: boolean };
export const UNLOCKS: ReadonlyArray<readonly [keyof Unlocks, number]> = [
  ['hat', 2],
  ['badge', 3],
  ['desk', 5],
  ['outfit', 8],
  ['aura', 10],
];

export function unlocks(level: number): Unlocks {
  const u: Unlocks = { hat: false, badge: false, desk: false, outfit: false, aura: false };
  for (const [what, at] of UNLOCKS) u[what] = level >= at;
  return u;
}

// The role an agent is kept under in its crew: the lead, or its subagent
// type (Claude Code's default type when it has none).
export function roleOf(a: Pick<AgentInfo, 'role' | 'agentType'>): string {
  return a.role === 'lead' ? 'lead' : (a.agentType || 'general-purpose').slice(0, 64);
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/crew.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 905`, `ℹ pass 905`, `ℹ fail 0`).

```bash
git add test/crew.test.ts src/pet/crew.ts
git commit -F - <<'EOF'
feat(pet): levels and unlocks for a crew's roles

What each gain is worth, levels at 100, 250, 500 and 1000 XP and then
at each doubling, what each level unlocks, and the role an agent is kept
under: the lead, or its subagent type.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: Counting each gain once

**Files:**
- Test: `test/crew.test.ts`
- Modify: `src/agents.ts`
- Modify: `src/pet/crew.ts`

Sources report what earns XP as `Gain`s (a new type in `src/agents.ts`); `Crews` counts them into a book of crews, each event once even when a transcript is read again. Within a run each agent's latest counted event is remembered; across runs each role's saved `seen` is the floor (see decision 3).

- [ ] **Step 1: The failing test, `test/crew.test.ts`**

Add the ledger to the import, and append its tests:

Replace

```ts
import { POINTS, UNLOCKS, levelOf, roleOf, unlocks, xpFor } from '../src/pet/crew.ts';
```

with

```ts
import type { Gain } from '../src/agents.ts';
import { Crews, MAX_CREWS, MAX_ROLES, POINTS, UNLOCKS, crewKey, levelOf, roleOf, unlocks, xpFor } from '../src/pet/crew.ts';
import type { CrewBook } from '../src/pet/crew.ts';
```

Append to the end of the file:

```ts

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const gain = (o: Partial<Gain> = {}): Gain => ({ agent: 'S1', at: T0, key: 'k', crew: '/home/u/rocket', role: 'lead', kind: 'turn', ...o });

test('each kind of gain counts its points to its role', () => {
  const c = new Crews();
  assert.equal(c.count(gain({ key: 'a', kind: 'turn' }))?.xp, 10);
  assert.equal(c.count(gain({ key: 'b', kind: 'check' }))?.xp, 15);
  assert.equal(c.count(gain({ agent: 'sub1', key: 'finish', role: 'Explore', kind: 'subagent' }))?.xp, 3);
  assert.equal(c.xp('/home/u/rocket', 'lead'), 15);
  assert.equal(c.xp('/home/u/rocket', 'Explore'), 3);
  assert.equal(c.xp('/home/u/other', 'lead'), 0, 'another project, another crew');
});

test('the same events read again are not counted again, nor anything older', () => {
  const c = new Crews();
  const events = [gain({ at: T0, key: 'a' }), gain({ at: T0 + 1000, key: 'b', kind: 'check' }), gain({ at: T0 + 1000, key: 'c', kind: 'check' })];
  for (const g of events) assert.ok(c.count(g));
  // The transcript read again from its tail (its session came back).
  for (const g of events) assert.equal(c.count(g), null);
  assert.equal(c.count(gain({ at: T0 + 500, key: 'z' })), null, 'older than the last counted');
  assert.equal(c.xp('/home/u/rocket', 'lead'), 20);
  // Another agent of the same role counts on its own.
  assert.equal(c.count(gain({ agent: 'S2', at: T0 + 500, key: 'a' }))?.xp, 30);
});

test('after a restart only events newer than the role last earned are counted', () => {
  const before = new Crews();
  before.count(gain({ at: T0, key: 'a' }));
  before.count(gain({ at: T0 + 1000, key: 'b' }));
  const saved: CrewBook = JSON.parse(JSON.stringify(before.data()));
  const after = new Crews(saved);
  // The tail is read again, with one turn finished while animus was off.
  assert.equal(after.count(gain({ at: T0, key: 'a' })), null);
  assert.equal(after.count(gain({ at: T0 + 1000, key: 'b' })), null);
  assert.equal(after.count(gain({ agent: 'S2', at: T0 + 900, key: 'q' })), null, 'any agent of that role');
  assert.equal(after.count(gain({ at: T0 + 5000, key: 'c' }))?.xp, 30);
  assert.equal(after.xp('/home/u/rocket', 'lead'), 30);
});

test('a gain that crosses a threshold says so', () => {
  const c = new Crews();
  c.give('/home/u/rocket', 'lead', 95);
  const a = c.count(gain())!;
  assert.deepEqual(a, { crew: '/home/u/rocket', role: 'lead', xp: 105, level: 2, was: 1, at: T0 });
  assert.equal(c.count(gain({ at: T0 + 1, key: 'n' }))!.was, 2);
  assert.equal(c.level('/home/u/rocket', 'lead'), 2);
});

test('the book keeps a hash of the project path, XP and the time last earned, nothing else', () => {
  const c = new Crews();
  c.count(gain({ at: T0 + 7 }));
  assert.match(crewKey('/home/u/rocket'), /^[0-9a-f]{16}$/);
  assert.deepEqual(c.data(), { [crewKey('/home/u/rocket')]: { lead: { xp: 10, seen: T0 + 7 } } });
  assert.ok(!JSON.stringify(c.data()).includes('rocket'));
});

test('unknown kinds, untimed events and roles past the cap earn nothing; old crews make room', () => {
  const c = new Crews();
  assert.equal(c.count(gain({ kind: 'nap' as Gain['kind'] })), null);
  assert.equal(c.count(gain({ at: NaN })), null);
  for (let i = 0; i < MAX_ROLES; i++) assert.ok(c.count(gain({ role: `t${i}`, agent: `a${i}` })));
  assert.equal(c.count(gain({ role: 'one-more', agent: 'z' })), null);
  const d = new Crews();
  for (let i = 0; i < MAX_CREWS + 3; i++) d.count(gain({ crew: `/p/${i}`, agent: `a${i}`, at: T0 + i }));
  assert.equal(Object.keys(d.data()).length, MAX_CREWS);
  assert.equal(d.xp('/p/0', 'lead'), 0, 'the least recently seen went');
  assert.equal(d.xp(`/p/${MAX_CREWS + 2}`, 'lead'), 10);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/crew.test.ts`
Expected: FAIL: `SyntaxError: The requested module '../src/pet/crew.ts' does not provide an export named 'Crews'`.

- [ ] **Step 3: `src/agents.ts`**

The `Gain` type, after `SendResult`:

After

```ts
export type SendResult = { ok: true } | { ok: false; reason: string };

```

insert

```ts
// Something an agent did that earns its crew XP (see pet/crew.ts): a
// finished turn, a build or test command that passed, a finished
// subagent run. `agent` is the agent whose transcript showed it and `at`
// when it happened (ms); `key` names it among that agent's events at that
// time, the same however often the transcript is read. It goes to `role`
// ('lead' or a subagent type) in the crew of project `crew`.
export type Gain = { agent: string; at: number; key: string; crew: string; role: string; kind: 'turn' | 'check' | 'subagent' };

```

- [ ] **Step 4: `src/pet/crew.ts`**

The ledger: import `createHash` and `Gain`, take `GainKind` from `Gain`, and append `crewKey` and `Crews`.

Replace

```ts
import type { AgentInfo } from '../agents.ts';
```

with

```ts
import { createHash } from 'node:crypto';
import type { AgentInfo, Gain } from '../agents.ts';
```

Replace

```ts
export type GainKind = 'turn' | 'check' | 'subagent';
```

with

```ts
export type GainKind = Gain['kind'];
```

Append to the end of the file:

```ts

// ── the ledger ──────────────────────────────────────────────────────────
// Each crew is kept under a hash of its project's path (crews.json holds
// no paths), each role with its XP and when it last earned any (`seen`,
// ms): nothing from a transcript.
export type RoleRec = { xp: number; seen: number };
export type CrewBook = Record<string, Record<string, RoleRec>>;

// What one counted gain did: the role's XP and level after it, and the
// level before.
export type Award = { crew: string; role: string; xp: number; level: number; was: number; at: number };

// At most this many crews (the least recently seen go first) and roles a
// crew (a role past it earns nothing).
export const MAX_CREWS = 200;
export const MAX_ROLES = 64;
// Agents whose last counted event is remembered, at most.
const MAX_MARKS = 5000;

const keys = new Map<string, string>();

// The key a crew is kept under: a hash of its project's path.
export function crewKey(crew: string): string {
  let k = keys.get(crew);
  if (!k) {
    k = createHash('sha256').update(crew).digest('hex').slice(0, 16);
    if (keys.size >= 1000) keys.clear();
    keys.set(crew, k);
  }
  return k;
}

// Counts gains into the book, each once. A transcript is read again from
// its tail when animus starts, or when its session comes back, so the same
// events come round again. Within a run, each agent's latest counted event
// (its time, and the keys counted at that time) is remembered: an event no
// later than that was counted. Across runs, each role's `seen` as loaded
// is a floor: anything counted before was no later than it. So an event is
// never counted twice; one that happened while animus was off is counted
// on the next start, as long as the tail still holds it.
export class Crews {
  private book: CrewBook;
  private floor = new Map<string, number>();
  private marks = new Map<string, { at: number; keys: Set<string> }>();

  constructor(book: CrewBook = {}) {
    this.book = book;
    for (const [k, roles] of Object.entries(book)) for (const [role, r] of Object.entries(roles)) this.floor.set(`${k}\n${role}`, r.seen);
  }

  // Counts `g` if it was not counted before; says what it did (null: not
  // counted).
  count(g: Gain): Award | null {
    const points = POINTS[g.kind];
    if (!points || !Number.isFinite(g.at) || !g.crew || !g.role) return null;
    const k = crewKey(g.crew);
    if (g.at <= (this.floor.get(`${k}\n${g.role}`) ?? -Infinity)) return null;
    const m = this.marks.get(g.agent);
    if (m && (g.at < m.at || (g.at === m.at && m.keys.has(g.key)))) return null;
    let roles = this.book[k];
    if (!roles) {
      this.makeRoom();
      roles = this.book[k] = {};
    }
    let r = roles[g.role];
    if (!r) {
      if (Object.keys(roles).length >= MAX_ROLES) return null;
      r = roles[g.role] = { xp: 0, seen: 0 };
    }
    if (!m || g.at > m.at) {
      this.marks.delete(g.agent);
      if (this.marks.size >= MAX_MARKS) this.marks.delete(this.marks.keys().next().value!);
      this.marks.set(g.agent, { at: g.at, keys: new Set([g.key]) });
    } else m.keys.add(g.key);
    const was = levelOf(r.xp);
    r.xp += points;
    r.seen = Math.max(r.seen, g.at);
    return { crew: g.crew, role: g.role, xp: r.xp, level: levelOf(r.xp), was, at: g.at };
  }

  xp(crew: string, role: string): number {
    return this.book[crewKey(crew)]?.[role]?.xp ?? 0;
  }

  level(crew: string, role: string): number {
    return levelOf(this.xp(crew, role));
  }

  // Sets a role's XP outright (the demo's crew starts some way along).
  give(crew: string, role: string, xp: number): void {
    const roles = (this.book[crewKey(crew)] ??= {});
    roles[role] = { xp, seen: roles[role]?.seen ?? 0 };
  }

  // The book as it stands, to save.
  data(): CrewBook {
    return this.book;
  }

  // One crew too many: the least recently seen goes.
  private makeRoom(): void {
    const ks = Object.keys(this.book);
    if (ks.length < MAX_CREWS) return;
    const last = (k: string) => Math.max(0, ...Object.values(this.book[k]).map((r) => r.seen));
    const oldest = ks.reduce((a, b) => (last(b) < last(a) ? b : a));
    delete this.book[oldest];
  }
}
```

- [ ] **Step 5: Run it to see it pass**

Run: `node --test test/crew.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 6: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 911`, `ℹ pass 911`, `ℹ fail 0`).

```bash
git add test/crew.test.ts src/agents.ts src/pet/crew.ts
git commit -F - <<'EOF'
feat(pet): a crew ledger that counts each gain once

Each agent's latest counted event is remembered within a run, and each
role's last-earned time is the floor after a restart, so a transcript
read again from its tail never pays twice. Crews are kept under a hash
of the project's path; at most 200 crews and 64 roles a crew.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: crews.json

**Files:**
- Test: `test/store.test.ts` (new)
- Create: `src/pet/store.ts`

`src/pet/store.ts` reads and writes the book as `$XDG_CONFIG_HOME/animus/crews.json` (default `~/.config/animus/`, beside `config.json`): XP and an ISO last-seen date per role, keyed by the project hash. A file that is not a crews file is moved aside as `crews.json.bad-<time>`; writes wait until a change is ten seconds old, and happen at once on the way out.

- [ ] **Step 1: The failing test, `test/store.test.ts`**

Load, save, corrupt files, the debounce, an unwritable place and a save budget, all in temp dirs:

Create `test/store.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Crews, crewKey } from '../src/pet/crew.ts';
import type { CrewBook } from '../src/pet/crew.ts';
import { CrewStore, SAVE_AFTER_MS, crewsPath, loadCrews, saveCrews } from '../src/pet/store.ts';
import { budget, tempDir } from './helpers.ts';

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const book = (): CrewBook => ({ [crewKey('/home/u/rocket')]: { lead: { xp: 340, seen: T0 }, Explore: { xp: 12, seen: T0 - 5000 } } });

test('crews.json sits beside the config: under XDG_CONFIG_HOME, else ~/.config', () => {
  assert.equal(crewsPath({ XDG_CONFIG_HOME: '/x/conf' }), '/x/conf/animus/crews.json');
  assert.equal(crewsPath({}), join(homedir(), '.config', 'animus', 'crews.json'));
});

test('a saved book loads back; the file holds hashes, roles, XP and dates only', () => {
  const path = join(tempDir('animus-crews'), 'animus', 'crews.json');
  assert.deepEqual(loadCrews(path), {}, 'none yet');
  assert.equal(saveCrews(path, book()), true);
  assert.deepEqual(loadCrews(path), book());
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
    assert.deepEqual(loadCrews(path, T0), {}, junk);
    assert.ok(!existsSync(path), `${junk}: moved`);
    const bad = join(dir, 'crews.json.bad-2026-10-25T10-00-00-000Z');
    assert.equal(readFileSync(bad, 'utf8'), junk, 'kept as it was');
    assert.equal(saveCrews(path, book()), true);
    assert.deepEqual(loadCrews(path), book(), 'a fresh one');
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
        [k]: { lead: { xp: 50, seen: '2026-10-25T10:00:00.000Z' }, bad1: { xp: -1, seen: '2026-10-25T10:00:00.000Z' }, bad2: { xp: 5, seen: 'never' }, bad3: 7 },
        'not-a-hash': { lead: { xp: 1, seen: '2026-10-25T10:00:00.000Z' } },
      },
    }),
  );
  assert.deepEqual(loadCrews(path), { [k]: { lead: { xp: 50, seen: T0 } } });
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
  assert.deepEqual(store.load(), {});
  mkdirSync(join(dir, 'crews.json'));
  assert.deepEqual(loadCrews(join(dir, 'crews.json'), T0), {}, 'a directory is no crews file');
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
  assert.equal(Object.keys(loadCrews(path)).length, 200);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/store.test.ts`
Expected: FAIL: `Cannot find module '…/src/pet/store.ts'`.

- [ ] **Step 3: `src/pet/store.ts`**

The file and its writer:

Create `src/pet/store.ts`:

```ts
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { configPath } from '../config.ts';
import type { CrewBook, RoleRec } from './crew.ts';

// The crews, kept in crews.json beside the config:
//
//   { "version": 1,
//     "crews": { "<hash of the project's path>": { "lead": { "xp": 340, "seen": "2026-10-25T10:00:00.000Z" } } } }
//
// XP per role and when it last earned any, nothing from a transcript. Read
// once at the start; a file that is not one of these is moved aside
// (crews.json.bad-<time>) and a fresh book started. Written once a change
// has waited a while (debounced), and on the way out; a small file, written
// to a temp file and renamed into place, so a crash never leaves half of
// one. If two animus run at once, the last to write wins.

export const SAVE_AFTER_MS = 10_000;
// A crews file is small; anything bigger (or not a plain file) is not one.
const MAX_BYTES = 4 << 20;

export function crewsPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(dirname(configPath(env)), 'crews.json');
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// The book in a crews file's text (entries that do not fit dropped); null
// when it is not a crews file at all.
export function parseCrews(text: string): CrewBook | null {
  let d: unknown;
  try {
    d = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(d) || d.version !== 1 || !isObj(d.crews)) return null;
  const book: CrewBook = {};
  for (const [k, roles] of Object.entries(d.crews)) {
    if (!/^[0-9a-f]{16}$/.test(k) || !isObj(roles)) continue;
    const out: Record<string, RoleRec> = {};
    for (const [role, r] of Object.entries(roles)) {
      if (!isObj(r) || role.length > 64 || typeof r.xp !== 'number' || !Number.isFinite(r.xp) || r.xp < 0 || typeof r.seen !== 'string') continue;
      const seen = Date.parse(r.seen);
      if (Number.isFinite(seen)) out[role] = { xp: Math.floor(r.xp), seen };
    }
    if (Object.keys(out).length) book[k] = out;
  }
  return book;
}

export function crewsText(book: CrewBook): string {
  const crews: Record<string, Record<string, { xp: number; seen: string }>> = {};
  for (const [k, roles] of Object.entries(book)) {
    const out: Record<string, { xp: number; seen: string }> = {};
    for (const [role, r] of Object.entries(roles)) out[role] = { xp: r.xp, seen: new Date(r.seen).toISOString() };
    crews[k] = out;
  }
  return JSON.stringify({ version: 1, crews }, null, 2) + '\n';
}

const stamp = (ms: number) => new Date(ms).toISOString().replace(/[:.]/g, '-');

// The book in `path` (empty when there is none or it cannot be read). One
// that is not a crews file is moved aside, so nothing is lost.
export function loadCrews(path: string, now = Date.now()): CrewBook {
  let text: string;
  try {
    const st = statSync(path);
    // Not a plain file: not ours to move (the next save fails and says so).
    if (!st.isFile()) return {};
    text = st.size <= MAX_BYTES ? readFileSync(path, 'utf8') : '';
  } catch {
    return {};
  }
  const book = parseCrews(text);
  if (book) return book;
  try {
    renameSync(path, `${path}.bad-${stamp(now)}`);
  } catch {
    // Left where it is; the next save replaces it.
  }
  return {};
}

// Best effort: a read-only config dir must not break the app.
export function saveCrews(path: string, book: CrewBook): boolean {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, crewsText(book));
    renameSync(tmp, path);
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
// the meantime ride along), and on the way out (flush).
export class CrewStore {
  readonly path: string;
  writes = 0;
  private due = Infinity;
  private wait: number;

  constructor(path = crewsPath(), wait = SAVE_AFTER_MS) {
    this.path = path;
    this.wait = wait;
  }

  load(now = Date.now()): CrewBook {
    return loadCrews(this.path, now);
  }

  // The book changed at `now`.
  changed(now: number): void {
    if (this.due === Infinity) this.due = now + this.wait;
  }

  // Writes `book` once a change is due; true when it wrote.
  tick(now: number, book: CrewBook): boolean {
    return now >= this.due && this.flush(book);
  }

  // Writes `book` now if it changed since the last write.
  flush(book: CrewBook): boolean {
    if (this.due === Infinity) return false;
    this.due = Infinity;
    this.writes++;
    return saveCrews(this.path, book);
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/store.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 918`, `ℹ pass 918`, `ℹ fail 0`).

```bash
git add test/store.test.ts src/pet/store.ts
git commit -F - <<'EOF'
feat(pet): keep crews in crews.json

XP per role and when it last earned any, under a hash of the project's
path, beside config.json. A file that is not a crews file is moved aside
and a fresh book started. Written once a change is ten seconds old, and
on the way out, to a temp file renamed into place.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Which project an agent works in

**Files:**
- Test: `test/project.test.ts` (new)
- Create: `src/pet/project.ts`

A crew is per project: the top of the git checkout of the agent's working directory, else the directory. A linked worktree counts as its main checkout (decision 5).

- [ ] **Step 1: The failing test, `test/project.test.ts`**

Checkouts, worktrees and submodules made in temp dirs:

Create `test/project.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../src/pet/project.ts';
import { tempDir } from './helpers.ts';

test('a directory inside a git checkout belongs to the top of the checkout', () => {
  const repo = tempDir('animus-proj');
  mkdirSync(join(repo, '.git'));
  mkdirSync(join(repo, 'src', 'deep'), { recursive: true });
  assert.equal(projectRoot(repo), repo);
  assert.equal(projectRoot(join(repo, 'src', 'deep')), repo);
});

test('a linked worktree belongs to its main checkout; a submodule to itself', () => {
  const base = tempDir('animus-proj');
  const main = join(base, 'app');
  mkdirSync(join(main, '.git', 'worktrees', 'feature'), { recursive: true });
  const wt = join(base, 'app-feature');
  mkdirSync(join(wt, 'lib'), { recursive: true });
  writeFileSync(join(wt, '.git'), `gitdir: ${join(main, '.git', 'worktrees', 'feature')}\n`);
  assert.equal(projectRoot(join(wt, 'lib')), main);
  const sub = join(main, 'vendor', 'dep');
  mkdirSync(sub, { recursive: true });
  writeFileSync(join(sub, '.git'), 'gitdir: ../../.git/modules/dep\n');
  assert.equal(projectRoot(sub), sub);
});

test('outside any checkout a directory is its own project', () => {
  const dir = join(tempDir('animus-proj'), 'loose');
  mkdirSync(dir);
  // (the temp dir is not inside a checkout: os.tmpdir() never is)
  assert.equal(projectRoot(dir), dir);
  assert.equal(projectRoot('relative/dir'), 'relative/dir');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/project.test.ts`
Expected: FAIL: `Cannot find module '…/src/pet/project.ts'`.

- [ ] **Step 3: `src/pet/project.ts`**

The lookup, cached per directory:

Create `src/pet/project.ts`:

```ts
import { readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';

// The project a working directory belongs to, for its crew: the top of its
// git checkout, else the directory itself. A linked worktree counts as its
// main checkout (its .git file points into <main>/.git/worktrees/), so a
// crew follows its repo from worktree to worktree. Read once per directory.

const known = new Map<string, string>();
const MAX_KNOWN = 500;

export function projectRoot(cwd: string): string {
  const hit = known.get(cwd);
  if (hit !== undefined) return hit;
  let root = cwd;
  if (isAbsolute(cwd)) {
    for (let dir = cwd; ; ) {
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
        root = mainCheckout(dir, git) ?? dir;
        break;
      }
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  if (known.size >= MAX_KNOWN) known.clear();
  known.set(cwd, root);
  return root;
}

// The main checkout of the linked worktree at `dir` (null: not one, say a
// submodule, whose .git file points into its parent's .git/modules/).
function mainCheckout(dir: string, gitFile: string): string | null {
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(gitFile, 'utf8').slice(0, 4096));
    if (!m) return null;
    const gitdir = resolve(dir, m[1]);
    const at = gitdir.lastIndexOf(`${sep}.git${sep}worktrees${sep}`);
    return at > 0 ? gitdir.slice(0, at) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/project.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 921`, `ℹ pass 921`, `ℹ fail 0`).

```bash
git add test/project.test.ts src/pet/project.ts
git commit -F - <<'EOF'
feat(pet): a crew per project: the top of its git checkout

A linked worktree counts as its main checkout, so a crew follows its
repo from worktree to worktree; outside a checkout, the directory.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: What in a transcript earns XP

**Files:**
- Test: `test/gains.test.ts` (new)
- Create: `src/claude/gains.ts`

`src/claude/gains.ts` reads transcript records as the source does: a lead's finished turn (its final reply stopped with `end_turn`, once per prompt), and a build or test command that passed (decision 2 has the patterns). Each gain keeps the record's time and a key from the transcript, so reading the same records again gives the same gains.

- [ ] **Step 1: The failing test, `test/gains.test.ts`**

Synthetic records only:

Create `test/gains.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GainReader, isCheck } from '../src/claude/gains.ts';

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const prompt = (s: number, text = 'go', extra: object = {}) => ({ type: 'user', uuid: `u${s}`, timestamp: at(s), message: { role: 'user', content: text }, ...extra });
// One record per content block, as Claude Code writes them.
const reply = (s: number, id: string, stop: string | null, ...content: object[]) => ({ type: 'assistant', uuid: `a${s}`, timestamp: at(s), message: { id, role: 'assistant', model: 'claude-opus-5-5', stop_reason: stop, content } });
const bash = (s: number, id: string, command: string) => reply(s, `m${s}`, 'tool_use', { type: 'tool_use', id, name: 'Bash', input: { command } });
const result = (s: number, id: string, isError = false, content = 'ok') => ({ type: 'user', uuid: `r${s}`, timestamp: at(s), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } });
const read = (lead: boolean, ...recs: unknown[]) => {
  const r = new GainReader(lead);
  for (const rec of recs) r.apply(rec);
  return r.take().map((g) => `${g.kind}@${(g.at - T0) / 1000}:${g.key}`);
};

test('build and test commands are told from the rest', () => {
  const yes = [
    'npm test', 'npm run test:unit', 'npm run build', 'pnpm test', 'yarn build', 'bun test', 'npm t',
    'npx tsc --noEmit', 'tsc -p tsconfig.json', 'node node_modules/typescript/bin/tsc -p tsconfig.json', 'node --test "test/**/*.test.ts"',
    'npx vitest run', './node_modules/.bin/jest --ci', 'pytest -q', 'python -m pytest tests/', 'uv run pytest', 'poetry run pytest -x',
    'cargo test', 'cargo build --release', 'cargo check', 'go test ./...', 'go build ./cmd/x', 'make', 'make test', 'make -j8', 'make -j8 build V=1',
    'mvn -q test', './gradlew build', 'dotnet test', 'cmake --build build', 'ctest', 'bazel test //...', 'swift build', 'mix test',
    'bundle exec rspec', 'vendor/bin/phpunit', 'rake', 'zig build', 'deno test', 'tox', 'mypy src',
    'cd app && npm test 2>&1 | tail -20', 'FOO=1 timeout 600 npm test', '(cd web && make)', 'git status; npm run typecheck',
  ];
  const no = [
    'git status', 'ls -la', 'npm install', 'npm ci', 'npm run lint', 'npm run dev', 'make clean', 'make lint', 'cargo fmt', 'go mod tidy',
    'echo npm test', 'git commit -m "npm test"', 'cat Makefile', 'docker compose up', 'rm -rf build', 'grep -r test src', 'nodemon', 'node server.js',
  ];
  for (const c of yes) assert.ok(isCheck(c), `should count: ${c}`);
  for (const c of no) assert.ok(!isCheck(c), `should not count: ${c}`);
});

test("a lead's turn counts once, when its final reply ends", () => {
  assert.deepEqual(
    read(
      true,
      prompt(0),
      reply(1, 'm1', 'tool_use', { type: 'tool_use', id: 't1', name: 'Read', input: { file_path: '/a' } }),
      result(2, 't1'),
      // The final reply: its thinking and its text, each a record ending the turn.
      reply(3, 'm3', 'end_turn', { type: 'thinking', thinking: '' }),
      reply(3, 'm3', 'end_turn', { type: 'text', text: 'Done.' }),
      // A stop hook sends it on: still the same turn.
      prompt(4, 'Stop hook feedback: run the tests', { isMeta: true }),
      reply(5, 'm5', 'end_turn', { type: 'text', text: 'Now done.' }),
      prompt(9, 'next'),
      reply(10, 'm10', 'end_turn', { type: 'text', text: 'ok' }),
    ),
    ['turn@3:turn:m3', 'turn@10:turn:m10'],
  );
});

test('an interrupted turn and an API error earn nothing', () => {
  assert.deepEqual(read(true, prompt(0), prompt(1, '[Request interrupted by user]'), reply(2, 'm2', 'end_turn', { type: 'text', text: 'ok' })), []);
  assert.deepEqual(read(true, prompt(0), { ...reply(1, 'm1', 'end_turn', { type: 'text', text: 'API Error' }), isApiErrorMessage: true }), []);
  assert.deepEqual(read(true, prompt(0), reply(1, 'm1', 'end_turn', { type: 'text', text: 'x' }), { ...reply(2, 'm2', 'end_turn', { type: 'text', text: 'x' }), message: { id: 'm2', model: '<synthetic>', stop_reason: 'end_turn', content: [] } }), ['turn@1:turn:m1']);
});

test('a build or test that passed earns; one that failed or was refused, or another command, does not', () => {
  assert.deepEqual(
    read(
      false,
      bash(1, 'b1', 'npm test'),
      result(2, 'b1'),
      bash(3, 'b2', 'cargo build'),
      result(4, 'b2', true, 'Exit code 101'),
      bash(5, 'b3', 'git status'),
      result(6, 'b3'),
      bash(7, 'b4', 'make test'),
      result(8, 'b4', true, 'Permission to use Bash with command make test has been denied.'),
      result(9, 'b1'), // a result already seen: nothing more
    ),
    ['check@2:check:b1'],
  );
});

test("a subagent's transcript counts its checks, not turns", () => {
  assert.deepEqual(read(false, prompt(0, 'task'), bash(1, 'b1', 'pytest -q'), result(2, 'b1'), reply(3, 'm3', 'end_turn', { type: 'text', text: 'All green.' })), ['check@2:check:b1']);
});

test('meta and sidechain records are not the agent at work', () => {
  assert.deepEqual(read(true, prompt(0), { ...reply(1, 'm1', 'end_turn', { type: 'text', text: 'x' }), isSidechain: true }, { ...bash(2, 'b', 'npm test'), isMeta: true }, result(3, 'b')), []);
});

test('read again, the same records give the same gains', () => {
  const recs = [prompt(0), bash(1, 'b1', 'go test ./...'), result(2, 'b1'), reply(3, 'm3', 'end_turn', { type: 'text', text: 'ok' })];
  assert.deepEqual(read(true, ...recs), ['check@2:check:b1', 'turn@3:turn:m3']);
  assert.deepEqual(read(true, ...recs), read(true, ...recs));
  // From the middle of the turn (a tail read): the turn still counts.
  assert.deepEqual(read(true, ...recs.slice(2)), ['turn@3:turn:m3']);
});

test('records it cannot read leave it as it was', () => {
  assert.deepEqual(read(true, null, 7, 'x', {}, { type: 'assistant' }, { type: 'user', message: { content: [null, 3] } }, { type: 'assistant', message: { stop_reason: 'end_turn' } }), []);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/gains.test.ts`
Expected: FAIL: `Cannot find module '…/src/claude/gains.ts'`.

- [ ] **Step 3: `src/claude/gains.ts`**

The reader and the command patterns:

Create `src/claude/gains.ts`:

```ts
import type { Gain } from '../agents.ts';
import { INTERRUPTED } from './transcript.ts';

// What in a transcript earns XP (see pet/crew.ts), read as the source reads
// the records:
//   turn      a lead's turn finished: its final reply stopped with
//             end_turn. Counted once per prompt: a reply in several records,
//             or a stop hook sending it on, is one turn.
//   check     a build or test command that passed: a Bash (or PowerShell)
//             call whose command is one (see isCheck) and whose result is
//             not an error. A failure costs nothing.
// (A finished subagent is the source's to tell: see source.ts.) Each gain
// keeps the record's time and a key from the transcript (the message or
// tool call id), so reading the same records again gives the same gains.

export type Found = Pick<Gain, 'at' | 'key' | 'kind'>;

// Tool calls whose result is awaited, at most (the oldest dropped).
const MAX_CALLS = 200;
// Gains held until taken, at most.
const MAX_FOUND = 500;

// Run before the command itself and stripped: VAR=value, sudo, time, nice,
// env, timeout 60, and runners (npx, bunx, pnpm exec/dlx, yarn dlx, uv run,
// poetry run, pipenv run, bundle exec).
const PREFIX = /^(?:\w+=\S*|sudo|time|nice|env|command|exec|timeout(?:\s+-\S+)*\s+\S+|npx|bunx|pnpm\s+(?:exec|dlx)|yarn\s+dlx|uv\s+run|poetry\s+run|pipenv\s+run|bundle\s+exec)\s+/;

// The build and test commands, as each part of a shell line starts (a
// program run by path is taken by its name: ./gradlew, vendor/bin/phpunit).
const CHECKS: readonly RegExp[] = [
  /^(?:npm|pnpm|yarn|bun)(?:\s+run)?\s+(?:test|build|typecheck|tsc|check)(?:[:\s]|$)/,
  /^(?:npm|pnpm|yarn)\s+t(?:\s|$)/,
  /^(?:tsc|vitest|jest|mocha|ava|tap|playwright\s+test|cypress\s+run)(?:\s|$)/,
  /^node\s+(?:--test(?:\s|$)|\S*\b(?:tsc|jest|vitest|mocha)(?:\.c?js)?(?:\s|$))/,
  /^deno\s+(?:test|check|compile)(?:\s|$)/,
  /^bun\s+test(?:\s|$)/,
  /^(?:python3?|py)\s+-m\s+(?:pytest|unittest|tox|mypy|compileall)(?:\s|$)/,
  /^(?:pytest|tox|nox|mypy|pyright)(?:\s|$)/,
  /^cargo\s+(?:test|build|check|nextest|bench)(?:\s|$)/,
  /^go\s+(?:test|build|vet)(?:\s|$)/,
  /^make(?:\s+-\S+)*(?:\s+(?:all|build|test|tests|check))?(?:\s+-\S+)*\s*$/,
  /^make(?:\s+-\S+)*\s+(?:all|build|test|tests|check)(?:\s|$)/,
  /^(?:mvn|mvnw)(?:\s+-\S+)*\s+(?:test|package|verify|install|compile)(?:\s|$)/,
  /^(?:gradle|gradlew)(?:\s+-\S+)*\s+(?:test|build|check|assemble)(?:\s|$)/,
  /^dotnet\s+(?:test|build)(?:\s|$)/,
  /^(?:cmake\s+--build|ctest|ninja|meson\s+(?:test|compile))(?:\s|$)/,
  /^(?:bazel|bazelisk)\s+(?:test|build)(?:\s|$)/,
  /^swift\s+(?:test|build)(?:\s|$)/,
  /^xcodebuild(?:\s|$)/,
  /^mix\s+(?:test|compile)(?:\s|$)/,
  /^(?:rspec|phpunit|pest)(?:\s|$)/,
  /^rake(?:\s+(?:test|spec))?\s*$/,
  /^rake\s+(?:test|spec)(?:\s|$)/,
  /^(?:zig|stack|cabal|dune)\s+(?:test|build)(?:\s|$)/,
];

// Whether a shell command runs a build or the tests: any part of it (split
// at &&, ||, ;, | and line breaks) that starts with one. So
// `cd app && npm test 2>&1 | tail` counts, `git commit -m "npm test"`
// does not.
export function isCheck(command: string): boolean {
  for (const part of command.split(/&&|\|\||[;|\n]/)) {
    let s = part.trim().replace(/^\(+\s*/, '').replace(/\s*\)+$/, '');
    for (let k = 0; k < 8; k++) {
      const t = s.replace(PREFIX, '');
      if (t === s) break;
      s = t;
    }
    // A program run by its path: by its name.
    s = s.replace(/^\S*\/(?=[^\s/]+)/, '');
    if (CHECKS.some((re) => re.test(s))) return true;
  }
  return false;
}

type Rec = {
  type?: string;
  timestamp?: string;
  uuid?: unknown;
  isMeta?: boolean;
  isSidechain?: boolean;
  isApiErrorMessage?: boolean;
  message?: { id?: unknown; model?: unknown; stop_reason?: unknown; content?: unknown };
};
type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; text?: unknown; tool_use_id?: unknown; is_error?: unknown };

const SHELLS = new Set(['Bash', 'PowerShell']);

// One transcript's gains as its records are read. `lead`: a session's own
// transcript (its turns count); a subagent's run is the source's to count.
export class GainReader {
  private lead: boolean;
  // Build and test calls awaiting their result.
  private calls = new Set<string>();
  // A prompt is being answered. True at first: a tail read from the middle
  // of a turn still sees it finish.
  private open = true;
  private found: Found[] = [];

  constructor(lead: boolean) {
    this.lead = lead;
  }

  apply(rec: unknown): void {
    if (!rec || typeof rec !== 'object') return;
    const r = rec as Rec;
    // Hook notes, peer messages and a stop hook's feedback are not the
    // agent's work, nor a prompt; sidechain records are a subagent's.
    if (r.isMeta || r.isSidechain) return;
    const t = Date.parse(r.timestamp ?? '');
    const m = r.message;
    if (!m || typeof m !== 'object') return;
    const blocks = Array.isArray(m.content) ? (m.content as Block[]) : [];
    if (r.type === 'assistant') {
      for (const b of blocks) {
        if (b?.type !== 'tool_use' || typeof b.id !== 'string' || !SHELLS.has(String(b.name))) continue;
        const command = (b.input as { command?: unknown } | null)?.command;
        if (typeof command === 'string' && isCheck(command)) this.call(b.id);
      }
      // An API error's stand-in reply ends nothing.
      if (r.isApiErrorMessage || m.model === '<synthetic>') return;
      if (this.lead && m.stop_reason === 'end_turn' && this.open && Number.isFinite(t)) {
        this.open = false;
        const id = typeof m.id === 'string' ? m.id : typeof r.uuid === 'string' ? r.uuid : String(t);
        this.add({ at: t, key: `turn:${id}`, kind: 'turn' });
      }
      return;
    }
    if (r.type !== 'user') return;
    if (typeof m.content === 'string') {
      this.prompt(m.content);
      return;
    }
    let results = false;
    for (const b of blocks) {
      if (b?.type !== 'tool_result') continue;
      results = true;
      const id = typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
      if (!this.calls.delete(id)) continue;
      if (b.is_error !== true && Number.isFinite(t)) this.add({ at: t, key: `check:${id}`, kind: 'check' });
    }
    const text = blocks.find((b) => b?.type === 'text' && typeof b.text === 'string');
    if (!results && text) this.prompt(String(text.text));
  }

  // The gains found since last taken, oldest first.
  take(): Found[] {
    const out = this.found;
    this.found = [];
    return out;
  }

  // A user's prompt opens a turn; their interrupting it closes it unfinished.
  private prompt(text: string): void {
    this.open = !text.startsWith(INTERRUPTED);
  }

  private call(id: string): void {
    if (this.calls.size >= MAX_CALLS) this.calls.delete(this.calls.values().next().value!);
    this.calls.add(id);
  }

  private add(f: Found): void {
    if (this.found.length >= MAX_FOUND) this.found.shift();
    this.found.push(f);
  }
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/gains.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 929`, `ℹ pass 929`, `ℹ fail 0`).

```bash
git add test/gains.test.ts src/claude/gains.ts
git commit -F - <<'EOF'
feat(gains): what in a transcript earns XP

A lead's finished turn, once per prompt (a reply in several records, or a
stop hook sending it on, is one turn; an interrupted one or an API error
earns nothing), and a build or test command that passed.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: The Claude source reports gains and crews

**Files:**
- Test: `test/source.test.ts`
- Modify: `src/agents.ts`
- Modify: `src/claude/source.ts`

The source keeps a `GainReader` per tracked transcript and hands out what it found through the new optional `AgentSource.drainGains()`. A subagent's gains wait (up to 5 s) for its meta.json, which says its type, the role they go to; a finished subagent run is one more gain, once. Every live agent says its `crew`: the project root of its session's working directory.

- [ ] **Step 1: The failing test, `test/source.test.ts`**

Import `Gain` and `Crews`, and append the tests:

After

```ts
import { join } from 'node:path';
```

insert

```ts
import type { Gain } from '../src/agents.ts';
```

After

```ts
import { ClaudeSource } from '../src/claude/source.ts';
```

insert

```ts
import { Crews } from '../src/pet/crew.ts';
```

Append to the end of the file:

```ts

// A finished build or test and a finished turn, as a transcript shows them.
const checked = (t: number, id: string, command: string, isError = false) => [
  line({ type: 'assistant', timestamp: iso(t), message: { id: `m-${id}`, stop_reason: 'tool_use', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] } }),
  line({ type: 'user', timestamp: iso(t + 100), message: { content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content: isError ? 'Exit code 1' : 'ok' }] } }),
];
const ended = (t: number, id: string) => line({ type: 'assistant', timestamp: iso(t), message: { id, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Done.' }] } });
const brief = (gs: Gain[]) => gs.map((g) => `${g.agent} ${g.role} ${g.kind} ${g.key} ${g.crew}`);

test('live agents say their crew: the top of the git checkout they work in', () => {
  const now = Date.now();
  const { root } = setup(now);
  const repo = tempDir('animus-repo');
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
  appendFileSync(sub, [...checked(now - 800, 's1', 'pytest -q'), ended(now - 600, 'r1')].join(''));
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

test("a subagent's gains wait for its type a moment, then go to the default type", () => {
  const now = Date.now();
  const { root, sub } = setup(now);
  rmSync(join(subDir(root), 'agent-abc.meta.json'));
  appendFileSync(sub, checked(now - 800, 's1', 'cargo test').join(''));
  const src = new ClaudeSource(root, { alive: () => true, intervalMs: 0 });
  src.poll(now);
  assert.deepEqual(src.drainGains(), [], 'its type not known yet');
  src.poll(now + 6000);
  assert.deepEqual(brief(src.drainGains()), ['abc general-purpose check check:s1 /home/u/rocket']);
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/source.test.ts`
Expected: FAIL: 5 of 33, with `TypeError: src.drainGains is not a function` (and `crew` undefined in the first).

- [ ] **Step 3: `src/agents.ts`**

`AgentInfo.crew` and `AgentSource.drainGains`:

After

```ts
  vitals?: Vitals;
```

insert

```ts
  // The crew it belongs to: its project's path (the top of the git checkout
  // it works in, else its working directory); the demo's are made up.
  crew?: string;
```

After

```ts
  send?(id: string, text: string): Promise<SendResult>;
```

insert

```ts
  // What its agents did that earns XP since last asked, oldest first. The
  // same event may come again (a transcript read again): the crew counts
  // each once (see pet/crew.ts).
  drainGains?(): Gain[];
```

- [ ] **Step 4: `src/claude/source.ts`**

A gain reader per transcript, the crew of each agent, and the subagent's finish:

Replace

```ts
import type { Activity, AgentEvent, AgentInfo, AgentSource, Bubble, SendResult } from '../agents.ts';
```

with

```ts
import type { Activity, AgentEvent, AgentInfo, AgentSource, Bubble, Gain, SendResult } from '../agents.ts';
```

After

```ts
import { diffEvents } from '../agents.ts';
```

insert

```ts
import { roleOf } from '../pet/crew.ts';
import { projectRoot } from '../pet/project.ts';
```

After

```ts
import { ChatReader } from './chat.ts';
```

insert

```ts
import { GainReader } from './gains.ts';
```

After

```ts
  chat: ChatReader;
```

insert

```ts
  gains: GainReader;
  born: number; // when it was first tracked
  paid: boolean; // its finished run was reported as a gain (subagents)
```

After

```ts
const MISS_RETRY_MS = 5000;
```

insert

```ts
// A subagent's gains wait this long for its meta.json (which says its type,
// the role they go to); after that they go to the default type.
const META_WAIT_MS = 5000;
// Gains kept until drained, at most.
const MAX_GAINS = 2000;
```

After

```ts
  private sessions = new Map<string, Entry>(); // as of the last scan, by session id
```

insert

```ts
  private gains: Gain[] = [];
```

After

```ts
    this.events = [];
    return e;
  }

```

insert

```ts
  drainGains(): Gain[] {
    const g = this.gains;
    this.gains = [];
    return g;
  }

  // The gains a transcript showed since last collected, for `role` in `crew`.
  private collect(t: Tracked, agent: string, crew: string, role: string): void {
    for (const f of t.gains.take()) this.gain({ agent, crew, role, ...f });
  }

  private gain(g: Gain): void {
    if (!g.crew) return;
    if (this.gains.length >= MAX_GAINS) this.gains.shift();
    this.gains.push(g);
  }

```

Replace

```ts
      t = { tail: new TranscriptTail(path), state: initialState(now), vitals: new VitalsReader(), chat: new ChatReader(), results: new Set(), notified: new Map() };
```

with

```ts
      t = {
        tail: new TranscriptTail(path),
        state: initialState(now),
        vitals: new VitalsReader(),
        chat: new ChatReader(),
        gains: new GainReader(lead),
        born: now,
        paid: false,
        results: new Set(),
        notified: new Map(),
      };
```

After

```ts
        // Nor may the conversation.
      }
```

insert

```ts
      try {
        t.gains.apply(rec);
      } catch {
        // Nor what earns XP.
      }
```

After

```ts
      const project = clip(basename(s.cwd), 24) || 'session';
```

insert

```ts
      const crew = s.cwd ? projectRoot(s.cwd) : '';
```

After

```ts
        lastSeen: s.updatedAt || now,
      };
```

insert

```ts
      if (crew) lead.crew = crew;
```

After

```ts
        lead.vitals = t.vitals.snapshot(now);
```

insert

```ts
        this.collect(t, s.sessionId, crew, 'lead');
```

Replace

```ts
      if (path) out.push(...this.subagents(s.sessionId, path, project, now, seen));
```

with

```ts
      if (path) out.push(...this.subagents(s.sessionId, path, project, crew, now, seen));
```

Replace

```ts
  private subagents(sessionId: string, leadPath: string, project: string, now: number, seen: Set<string>): AgentInfo[] {
```

with

```ts
  private subagents(sessionId: string, leadPath: string, project: string, crew: string, now: number, seen: Set<string>): AgentInfo[] {
```

After

```ts
        (st.lastText && st.pending.size === 0 && quiet >= STALE_TEXT_MS);
```

insert

```ts
      // Its gains go to its type, once its meta.json says which (or it
      // has waited long enough, or finished); its finished run, once.
      const role = roleOf({ role: 'sub', agentType: meta?.agentType });
      if (meta || finished || now - t.born >= META_WAIT_MS) this.collect(t, id, crew, role);
      if (finished && !t.paid) {
        t.paid = true;
        this.gain({ agent: id, at: st.lastSeen || m, key: 'finish', crew, role, kind: 'subagent' });
      }
```

After

```ts
        vitals: t.vitals.snapshot(now),
      };
```

insert

```ts
      if (crew) info.crew = crew;
```

- [ ] **Step 5: Run it to see it pass**

Run: `node --test test/source.test.ts`
Expected: PASS (33 tests).

- [ ] **Step 6: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 934`, `ℹ pass 934`, `ℹ fail 0`).

```bash
git add test/source.test.ts src/agents.ts src/claude/source.ts
git commit -F - <<'EOF'
feat(source): live agents report their crew and what earns XP

Each transcript's gains, a subagent's to its type once its meta.json
says it (or after 5 s), and a finished subagent run once; every agent
says its crew, the top of its session's git checkout.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: The demo crew earns XP

**Files:**
- Test: `test/demo.test.ts`
- Modify: `src/demo/source.ts`

The demo gains as a live crew would: a lead's turn when it starts waiting for you, a passing check when it runs one of its build or test commands, a finished run when a subagent is done. Nothing is drawn from the crew's random stream, so the pinned crew-moves hash test keeps passing. `DEMO_XP` is the throwaway crews' starting XP (decision 13).

- [ ] **Step 1: The failing test, `test/demo.test.ts`**

Import `DEMO_XP` and `Crews`, and append the tests:

Replace

```ts
import { DemoSource } from '../src/demo/source.ts';
```

with

```ts
import { DEMO_XP, DemoSource } from '../src/demo/source.ts';
```

After

```ts
import type { AgentInfo } from '../src/agents.ts';
```

insert

```ts
import { Crews } from '../src/pet/crew.ts';
```

Append to the end of the file:

```ts

test('the demo crew earns XP as a live one would: finished turns, passing checks, finished runs', () => {
  const src = new DemoSource(7, START);
  const frames = simulate(src, 600);
  const gains = src.drainGains();
  assert.deepEqual(src.drainGains(), []);
  const kinds = new Set(gains.map((g) => g.kind));
  assert.deepEqual([...kinds].sort(), ['check', 'subagent', 'turn']);
  const seen = new Map(frames.flat().map((a) => [a.id, a]));
  for (const g of gains) {
    const a = seen.get(g.agent)!;
    assert.ok(a, g.agent);
    assert.equal(g.crew, `demo:${a.project}`);
    assert.equal(a.crew, g.crew);
    assert.equal(g.role, a.role === 'lead' ? 'lead' : a.agentType);
    if (g.kind === 'turn') assert.equal(a.role, 'lead');
    if (g.kind === 'subagent') assert.equal(a.role, 'sub');
    assert.ok(g.at >= START && g.at <= START + 600_000);
  }
  // Every lead's wait is a finished turn.
  const waits = frames.flatMap((list, k) => list.filter((a) => a.role === 'lead' && a.activity === 'idle' && frames[k - 1]?.find((b) => b.id === a.id)?.activity !== 'idle'));
  assert.equal(gains.filter((g) => g.kind === 'turn').length, waits.length);
  // The same again for the same seed.
  const again = new DemoSource(7, START);
  simulate(again, 600);
  assert.deepEqual(again.drainGains(), gains);
});

test('counted, the demo crew levels up: nova reaches ★4 with its first finished turn', () => {
  const src = new DemoSource(7, START);
  const crews = new Crews();
  for (const [crew, roles] of Object.entries(DEMO_XP)) for (const [role, xp] of Object.entries(roles)) crews.give(crew, role, xp);
  assert.equal(crews.level('demo:animus', 'lead'), 10);
  assert.equal(crews.level('demo:webshop', 'lead'), 3);
  const ups: string[] = [];
  for (let t = 0; t <= 300; t += 0.5) {
    src.poll(START + t * 1000);
    for (const g of src.drainGains()) {
      const a = crews.count(g);
      if (a && a.level > a.was) ups.push(`${a.crew} ${a.role} ★${a.level}`);
    }
  }
  assert.ok(ups.includes('demo:webshop lead ★4'), ups.join(', '));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/demo.test.ts`
Expected: FAIL: `SyntaxError: The requested module '../src/demo/source.ts' does not provide an export named 'DEMO_XP'`.

- [ ] **Step 3: `src/demo/source.ts`**

Crews, the starting XP, and the gains:

Replace

```ts
import type { Activity, AgentEvent, AgentInfo, AgentSource, Bubble, Vitals } from '../agents.ts';
```

with

```ts
import type { Activity, AgentEvent, AgentInfo, AgentSource, Bubble, Gain, Vitals } from '../agents.ts';
```

After

```ts
import { diffEvents } from '../agents.ts';
```

insert

```ts
import { isCheck } from '../claude/gains.ts';
import { roleOf } from '../pet/crew.ts';
```

After

```ts
const MAX_CHAT = 200;

```

insert

```ts
// The demo's crews start some way along (XP by crew and role), so the demo
// shows what growth looks like: atlas's crew has every unlock, and nova is
// ten XP short of ★4, which its first finished turn brings.
export const DEMO_XP: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'demo:animus': { lead: 33_000, 'code-reviewer': 8_400, 'docs-writer': 2_100, Explore: 1_150, Plan: 520, 'test-runner': 260, 'security-reviewer': 130, 'general-purpose': 40 },
  'demo:webshop': { lead: 490, 'security-reviewer': 4_100, 'test-runner': 1_020, Explore: 260, 'general-purpose': 150, 'code-reviewer': 96, 'docs-writer': 30, Plan: 0 },
};

```

After

```ts
  private events: AgentEvent[] = [];
```

insert

```ts
  private gains: Gain[] = [];
```

Replace

```ts
      info: { id: `demo-${name}`, name, role: 'lead', project, activity: 'think', detail: 'new task', since: now, lastSeen: now },
```

with

```ts
      info: { id: `demo-${name}`, name, role: 'lead', project, activity: 'think', detail: 'new task', since: now, lastSeen: now, crew: `demo:${project}` },
```

After

```ts
        lastSeen: now,
```

insert

```ts
        crew: parent.info.crew,
```

After

```ts
    this.converse(s, was, activity, now);
```

insert

```ts
    this.earn(s, activity, now);
  }

  // What earns its crew XP, as a live transcript would show it: a lead's
  // turn ending (it waits for you), a build or test that runs (a failing
  // one shows as an error instead), a subagent's run done.
  private earn(s: Sim, activity: Activity, now: number): void {
    const a = s.info;
    const gain = (kind: Gain['kind'], key: string) => this.gains.push({ agent: a.id, at: now, key, crew: a.crew ?? '', role: roleOf(a), kind });
    if (activity === 'idle' && a.role === 'lead') gain('turn', `turn:${now}`);
    else if (activity === 'run' && isCheck(a.detail.replace(/^\$ /, ''))) gain('check', `check:${now}`);
    else if (activity === 'done' && a.role === 'sub') gain('subagent', 'finish');
  }

  drainGains(): Gain[] {
    const g = this.gains;
    this.gains = [];
    return g;
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/demo.test.ts`
Expected: PASS (13 tests, the pinned crew-moves hash among them).

- [ ] **Step 5: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 936`, `ℹ pass 936`, `ℹ fail 0`).

```bash
git add test/demo.test.ts src/demo/source.ts
git commit -F - <<'EOF'
feat(demo): the demo crew earns XP and starts some way along

Turns, passing checks and finished runs from what the crew does, no
random draws (the crew moves as it did). Its throwaway crews start with
atlas's at every unlock and nova's a turn short of its next level.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 8: Face states in the figure

**Files:**
- Test: `test/figure.test.ts`
- Modify: `src/world/character.ts`
- Modify: `src/world/frame.ts`
- Modify: `src/art/figure/rig.ts`
- Modify: `src/art/figure/head.ts`
- Modify: `src/art/figure/body.ts`
- Modify: `src/art/figure.ts`

Drowsy eyes when energy is critical, a bandage when health is, a grin when mood is high (the bounce comes with the stage, Task 11). `Feel` joins the figure's frame and its sprite key; the key keeps only what shows (no face from behind; the grin only standing about or walking), so a face state from behind shares the plain sprite.

- [ ] **Step 1: The failing test, `test/figure.test.ts`**

Import `Feel`, and append the tests:

Replace

```ts
import { traitsFor, type Costume, type Emote, type Pose, type Species, type Traits } from '../src/world/character.ts';
```

with

```ts
import { traitsFor, type Costume, type Emote, type Feel, type Pose, type Species, type Traits } from '../src/world/character.ts';
```

Append to the end of the file:

```ts

// A sprite drawn within bounds: a whole-pixel anchor near its feet, about a
// figure's size, a clear pixel all round.
function sane(spr: Sprite, s: number, what: string): void {
  const { width: w, height: h } = spr.img;
  assert.ok(Number.isInteger(spr.ax) && Number.isInteger(spr.ay), `${what}: whole-pixel anchor`);
  assert.ok(w >= 4 * s && w <= 22 * s + 6, `${what}: width ${w}`);
  assert.ok(h >= 6 * s && h <= 24 * s + 6, `${what}: height ${h}`);
  assert.ok(spr.ay > h * 0.6 && spr.ay < h, `${what}: anchor y near the bottom`);
  assert.ok(borderClear(spr), `${what}: clipped at the edge`);
}

const FEELS: ReadonlyArray<readonly [string, Feel]> = [
  ['drowsy', { drowsy: true, bandaged: false, bouncy: false }],
  ['bandaged', { drowsy: false, bandaged: true, bouncy: false }],
  ['bouncy', { drowsy: false, bandaged: false, bouncy: true }],
];

test('face states: drowsy eyes, a bandage, a grin, for every costume and species', () => {
  clearSprites();
  const s = 6;
  for (const sp of SPECIES) {
    for (const co of COSTUMES) {
      for (const back of [false, true]) {
        const facing = { back, flip: false };
        const base = figureSprite(fig(who(sp, 1), co, 'idle', { facing }), s, INK);
        for (const [name, feel] of FEELS) {
          const what = `${sp}/${co}/${name}${back ? '/back' : ''}`;
          const n = spriteCount();
          const spr = figureSprite(fig(who(sp, 1), co, 'idle', { facing, feel }), s, INK);
          sane(spr, s, what);
          if (back && name !== 'bandaged') {
            // From behind only the bandage shows: the same sprite as without.
            assert.equal(spr, base, `${what}: shares the plain sprite`);
            continue;
          }
          assert.equal(spriteCount(), n + 1, `${what}: a sprite of its own`);
          assert.notEqual(hash(spr), hash(base), `${what}: looks different`);
          assert.equal(figureSprite(fig(who(sp, 1), co, 'idle', { facing, feel }), s, INK), spr, `${what}: cached`);
        }
      }
    }
  }
});

test('a face state changes the face, not the figure', () => {
  const tr = who('human', 2);
  const base = figureSprite(fig(tr, 'casual', 'idle'), 8, INK);
  for (const [name, feel] of FEELS) {
    const spr = figureSprite(fig(tr, 'casual', 'idle', { feel }), 8, INK);
    assert.equal(spr.img.width, base.img.width, name);
    assert.equal(spr.img.height, base.img.height, name);
    let diff = 0;
    for (let i = 0; i < spr.img.data.length; i++) if (spr.img.data[i] !== base.img.data[i]) diff++;
    assert.ok(diff > 0 && diff < spr.img.data.length * 0.06, `${name}: ${diff} bytes differ`);
  }
  // At work it is still tired: heavy eyes as it ponders.
  assert.notEqual(hash(figureSprite(fig(tr, 'casual', 'think', { feel: FEELS[0][1] }), 8, INK)), hash(figureSprite(fig(tr, 'casual', 'think'), 8, INK)));
  // The grin is for standing about and walking, not for work.
  assert.equal(figureSprite(fig(tr, 'casual', 'write', { feel: FEELS[2][1] }), 8, INK), figureSprite(fig(tr, 'casual', 'write'), 8, INK));
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/figure.test.ts`
Expected: FAIL: 2 of 13: `human/casual/drowsy: a sprite of its own` and `drowsy: 0 bytes differ`.

- [ ] **Step 3: `src/world/character.ts`**

The `Feel` type, before `Traits`:

After

```ts
export type Accessory = 'none' | 'headset' | 'glasses' | 'lamp' | 'beret' | 'goggles' | 'hood' | 'bow';

```

insert

```ts
// How an agent feels, from its meters (see pet/meters.ts), as its figure
// shows it: drowsy eyes when its energy is critical, a bandage when its
// health is, a grin (and a bigger bounce, see FigureFrame.hop) when its
// mood is high.
export type Feel = { drowsy: boolean; bandaged: boolean; bouncy: boolean };

```

- [ ] **Step 4: `src/world/frame.ts`**

`FigureFrame.feel` and `FigureFrame.hop`:

Replace

```ts
import type { Costume, Emote, Pose, Traits } from './character.ts';
```

with

```ts
import type { Costume, Emote, Feel, Pose, Traits } from './character.ts';
```

Replace

```ts
// `hurt` while an error is on show; `walking` while on the move.
```

with

```ts
// `hurt` while an error is on show; `walking` while on the move. `feel` is
// how its meters say it feels; `hop` how high a happy bounce lifts it this
// frame (units; only the figure is drawn higher: its shadow, label and
// card stay put).
```

After

```ts
  walking: boolean;
```

insert

```ts
  feel?: Feel;
  hop?: number;
```

- [ ] **Step 5: `src/art/figure/rig.ts`**

A new eyes kind:

Replace

```ts
export type Eyes = 'open' | 'blink' | 'happy' | 'closed' | 'wide' | 'squeeze' | 'down' | 'up';
```

with

```ts
export type Eyes = 'open' | 'blink' | 'happy' | 'closed' | 'wide' | 'squeeze' | 'down' | 'up' | 'drowsy';
```

- [ ] **Step 6: `src/art/figure/head.ts`**

Drowsy eyes for every face (human, cat and ghost; robot; alien), and the plaster:

Replace

```ts
import { hole, type Ctx, type Sketch } from './paint.ts';
```

with

```ts
import { hole, move, mul, turn, type Ctx, type Sketch } from './paint.ts';
```

After

```ts
      p.stroke();
      return;
    }
```

insert

```ts
    case 'drowsy':
      // heavy lids: the lower half of an open eye under a drooping lid
      p.save();
      p.beginPath();
      p.rect(x - rx * 1.6, y + 0.02, rx * 3.2, ry * 2);
      p.clip();
      p.beginPath();
      p.ellipse(x, y + 0.05, rx, ry * 0.95, 0, 0, TAU);
      p.fillStyle = L.eye;
      p.fill();
      p.restore();
      p.beginPath();
      p.moveTo(x - rx * 1.2, y + 0.14);
      p.quadraticCurveTo(x, y - 0.08, x + rx * 1.2, y + 0.14);
      p.strokeStyle = ink;
      p.lineWidth = w;
      p.stroke();
      return;
```

After

```ts
          p.arc(x, y, 0.5, 0, TAU);
          p.stroke();
          break;
```

insert

```ts
        case 'drowsy':
          p.roundRect(x - 0.32, y + 0.04, 0.64, 0.38, 0.17);
          p.fill();
          break;
```

After

```ts
      const big = f.eyes === 'wide' ? 1.15 : 1;
```

insert

```ts
      p.save();
      if (f.eyes === 'drowsy') {
        // half shut: only what is under the lid shows
        p.beginPath();
        p.rect(x - 2, y, 4, 2);
        p.clip();
      }
```

After

```ts
      p.fillStyle = alpha(WHITE, 0.7);
      p.fill();
```

insert

```ts
      p.restore();
      if (f.eyes === 'drowsy') {
        p.beginPath();
        p.moveTo(x - rx * 1.05, y + 0.05);
        p.quadraticCurveTo(x, y - 0.2, x + rx * 1.05, y + 0.05);
        p.strokeStyle = c.ink;
        p.lineWidth = lw(c, 1.2);
        p.lineCap = 'round';
        p.stroke();
      }
```

Replace

```ts
export type HeadOpts = { back: boolean; t: number; carry: boolean; frame: number };
```

with

```ts
// `bandaged`: its health is low, a plaster shows (see plaster).
export type HeadOpts = { back: boolean; t: number; carry: boolean; frame: number; bandaged?: boolean };
```

After

```ts
    accessory(sk, L, o, face);
  }

```

insert

```ts
  if (o.bandaged) plaster(sk, back);

```

After

```ts
  if (L.costume === 'astronaut') helmet(sk, L, back);
}

```

insert

```ts
// Two strips of sticking plaster crossed: on the far cheek from the front,
// on the back of the head from behind.
function plaster(sk: Sketch, back: boolean): void {
  const tape = '#f4d6ab';
  const [x, y] = back ? [-0.9, -0.7] : [F + 2.1, 1.45];
  for (const a of [-0.62, 0.62]) {
    sk.at(mul(move(x, y), turn(a)), () => sk.blob((p) => p.roundRect(-0.95, -0.3, 1.9, 0.6, 0.28), tape, { dark: shade(tape, -0.14), d: 0.12, line: 0.55 }));
  }
  sk.draw((p) => {
    p.fillStyle = shade(tape, -0.3);
    for (const [dx, dy] of [[-0.14, -0.1], [0.14, 0.1], [0.12, -0.12], [-0.12, 0.12]]) {
      p.beginPath();
      p.arc(x + dx, y + dy, 0.055, 0, TAU);
      p.fill();
    }
  });
}

```

- [ ] **Step 7: `src/art/figure/body.ts`**

Pass `bandaged` to the head:

Replace

```ts
export type View = { back: boolean; item: Color | null; frame: number };
```

with

```ts
export type View = { back: boolean; item: Color | null; frame: number; bandaged?: boolean };
```

Replace

```ts
  add(7, () => drawHead(sk, L, r.face, { back, t: r.t, carry: hasBlockOnHead(r), frame: v.frame }), H);
```

with

```ts
  add(7, () => drawHead(sk, L, r.face, { back, t: r.t, carry: hasBlockOnHead(r), frame: v.frame, bandaged: v.bandaged }), H);
```

- [ ] **Step 8: `src/art/figure.ts`**

The feel in the sprite key and the face:

Replace

```ts
  const key = `f|${lk}|${pose}|${i}|${wi}|${blink ? 1 : 0}${back ? 1 : 0}${flip ? 1 : 0}${f.hurt ? 1 : 0}${f.sleeping ? 1 : 0}|${item}|${q}|${ink}`;
```

with

```ts
  // How it feels, as far as it shows: no face from behind, and the grin
  // only standing about or walking.
  const feel = f.feel;
  const drowsy = !!feel?.drowsy && !back;
  const bouncy = !!feel?.bouncy && !back && (pose === 'idle' || pose === 'walk');
  const fk = `${drowsy ? 1 : 0}${feel?.bandaged ? 1 : 0}${bouncy ? 1 : 0}`;
  const key = `f|${lk}|${pose}|${i}|${wi}|${blink ? 1 : 0}${back ? 1 : 0}${flip ? 1 : 0}${f.hurt ? 1 : 0}${f.sleeping ? 1 : 0}|${fk}|${item}|${q}|${ink}`;
```

After

```ts
    else if (blink && (face.eyes === 'open' || face.eyes === 'up' || face.eyes === 'down')) face.eyes = 'blink';
```

insert

```ts
    // How it feels: heavy eyes when tired, a grin when happy (an error on
    // show wins over that).
    if (drowsy && (face.eyes === 'open' || face.eyes === 'up' || face.eyes === 'wide')) face.eyes = 'drowsy';
    if (bouncy) {
      face.mouth = 'grin';
      face.blush = true;
    }
```

Replace

```ts
    buildFigure(sk, rig, look, { back, item: item || null, frame: i });
```

with

```ts
    buildFigure(sk, rig, look, { back, item: item || null, frame: i, bandaged: feel?.bandaged ?? false });
```

- [ ] **Step 9: Run it to see it pass**

Run: `node --test test/figure.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 10: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 938`, `ℹ pass 938`, `ℹ fail 0`).

```bash
git add test/figure.test.ts src/world/character.ts src/world/frame.ts src/art/figure/rig.ts src/art/figure/head.ts src/art/figure/body.ts src/art/figure.ts
git commit -F - <<'EOF'
feat(figure): drowsy eyes, a bandage and a grin from the meters

Part of the sprite key, only as far as they show: no face from behind,
the grin only standing about or walking.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 9: Cosmetics in the figure

**Files:**
- Test: `test/figure.test.ts`
- Modify: `src/world/character.ts`
- Modify: `src/world/frame.ts`
- Modify: `src/art/figure/look.ts`
- Modify: `src/art/figure/head.ts`
- Modify: `src/art/figure/body.ts`
- Modify: `src/art/figure.ts`

What a level lets a figure wear, in every costume's style: ★2 a hat from the costume's set (beanie, mortarboard, party cone, backwards cap, helmet antenna, a grander wizard hat), ★3 a star badge, ★8 the outfit in other colours, ★10 a soft aura. `Wear` joins the frame; the look is cached per traits, costume and wear, so the sprite key carries it. The figure box grows so a hat on a hop or on a sleeper is never clipped.

- [ ] **Step 1: The failing test, `test/figure.test.ts`**

Imports, the sleeper case of the badge, and the tests (one is the figure budget with every cosmetic):

After

```ts
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, type Sprite } from '../src/art/figure.ts';
```

insert

```ts
import { GOLD, PRIZES, lookOf } from '../src/art/figure/look.ts';
```

Replace

```ts
import { traitsFor, type Costume, type Emote, type Feel, type Pose, type Species, type Traits } from '../src/world/character.ts';
```

with

```ts
import { traitsFor, type Costume, type Emote, type Feel, type Pose, type Species, type Traits, type Wear } from '../src/world/character.ts';
import { hexOf } from '../src/art/iso.ts';
import { budget } from './helpers.ts';
```

Append to the end of the file:

```ts

const NONE: Wear = { hat: false, badge: false, outfit: false, aura: false };
const WEARS: ReadonlyArray<readonly [string, Wear]> = [
  ['hat', { ...NONE, hat: true }],
  ['badge', { ...NONE, badge: true }],
  ['outfit', { ...NONE, outfit: true }],
  ['aura', { ...NONE, aura: true }],
  ['all', { hat: true, badge: true, outfit: true, aura: true }],
];

test('cosmetics: every costume and species wears each unlock, both ways round, within bounds', () => {
  clearSprites();
  const s = 5;
  for (const sp of SPECIES) {
    for (const co of COSTUMES) {
      for (const pose of ['idle', 'done', 'cheer', 'sleep'] as Pose[]) {
        for (const back of [false, true]) {
          const o = { facing: { back, flip: back }, sleeping: pose === 'sleep', poseT: 0.45 };
          const plain = figureSprite(fig(who(sp, 2), co, pose, o), s, INK);
          for (const [name, wear] of WEARS) {
            const what = `${sp}/${co}/${pose}/${name}${back ? '/back' : ''}`;
            const spr = figureSprite(fig(who(sp, 2), co, pose, { ...o, wear }), s, INK);
            sane(spr, s, what);
            // A badge is pinned on the front: from behind it does not show,
            // and a sleeper's arms may cover it. Everything else shows.
            if (name === 'badge' && back && pose !== 'sleep') assert.equal(hash(spr), hash(plain), what);
            else if (!(name === 'badge' && pose === 'sleep')) assert.notEqual(hash(spr), hash(plain), `${what}: shows`);
            assert.equal(figureSprite(fig(who(sp, 2), co, pose, { ...o, wear }), s, INK), spr, `${what}: cached`);
          }
        }
      }
    }
  }
});

test("each world's costume has its own hat, on top of the head", () => {
  const tr = who('human', 1);
  const hats = new Set<string>();
  for (const co of COSTUMES) {
    const plain = figureSprite(fig(tr, co, 'idle'), 6, INK);
    const hat = figureSprite(fig(tr, co, 'idle', { wear: WEARS[0][1] }), 6, INK);
    assert.ok(hat.ay > plain.ay, `${co}: the ${PRIZES[co]} stands above the head (${hat.ay} vs ${plain.ay})`);
    hats.add(PRIZES[co]);
  }
  assert.equal(hats.size, COSTUMES.length);
});

test('the hat takes the place of a lamp, a beret or a hood; a headset stays under it', () => {
  const lamp = traitsFor('x', 'sub', 'Explore');
  assert.equal(lamp.accessory, 'lamp');
  const L = lookOf(lamp, 'wizard', WEARS[0][1]);
  assert.equal(L.prize, 'grand');
  assert.equal(L.acc, 'none');
  const hood = lookOf(traitsFor('y', 'sub', 'security-reviewer'), 'hacker', WEARS[0][1]);
  assert.equal(hood.hoodUp, false);
  assert.equal(hood.prize, 'cap');
  const lead = lookOf(traitsFor('z', 'lead'), 'casual', WEARS[0][1]);
  assert.equal(lead.acc, 'headset');
  assert.equal(lookOf(lamp, 'wizard').prize, null, 'no hat before ★2');
});

test('the outfit swap puts the main garment in the trim\'s hue and the old colour in the trim', () => {
  for (const co of COSTUMES) {
    const tr = who('human', 0);
    const was = lookOf(tr, co);
    const now = lookOf(tr, co, WEARS[2][1]);
    assert.notEqual(now.top, was.top, co);
    assert.equal(now.trim, hexOf(tr.shirt), co);
  }
  const ghost = lookOf(who('ghost', 0), 'casual', WEARS[2][1]);
  assert.notEqual(ghost.top, lookOf(who('ghost', 0), 'casual').top, 'a sheet takes a pastel');
  assert.equal(ghost.trim, GOLD);
});

test('a figure with every cosmetic and face state draws within the figure budget', () => {
  const tr = [who('human', 1), who('robot', 1), who('cat', 2), who('alien', 1), who('ghost', 1)];
  const all = { wear: WEARS[4][1], feel: { drowsy: true, bandaged: true, bouncy: true } };
  // Uncached each time: the cache is emptied at the start of every run.
  budget(
    'figure with cosmetics',
    (i) => {
      if (i === 0) clearSprites();
      figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13, ...all }), 4, INK);
    },
    3,
    { calls: 48 },
  );
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/figure.test.ts`
Expected: FAIL: `SyntaxError: The requested module '../src/art/figure/look.ts' does not provide an export named 'GOLD'`.

- [ ] **Step 3: `src/world/character.ts`**

The `Wear` type, after `Feel`:

After

```ts
export type Feel = { drowsy: boolean; bandaged: boolean; bouncy: boolean };
```

insert

```ts
// What its level lets it wear (see pet/crew.ts): a hat from the world's
// costume set, a badge on the shirt, its outfit in other colours, a soft
// aura.
export type Wear = { hat: boolean; badge: boolean; outfit: boolean; aura: boolean };
```

- [ ] **Step 4: `src/world/frame.ts`**

`FigureFrame.wear`:

Replace

```ts
import type { Costume, Emote, Feel, Pose, Traits } from './character.ts';
```

with

```ts
import type { Costume, Emote, Feel, Pose, Traits, Wear } from './character.ts';
```

Replace

```ts
// card stay put).
```

with

```ts
// card stay put); `wear` what its level lets it wear.
```

After

```ts
  feel?: Feel;
```

insert

```ts
  wear?: Wear;
```

- [ ] **Step 5: `src/art/figure/look.ts`**

The hat for each costume, gold, and the look's new fields:

Replace

```ts
import type { Accessory, Costume, Species, Traits } from '../../world/character.ts';
```

with

```ts
import type { Accessory, Costume, Species, Traits, Wear } from '../../world/character.ts';
import type { RGB } from '../../term/color.ts';
import { hsl } from '../../term/color.ts';
```

Replace

```ts
// with the shaded side of each (light comes from the upper left).
```

with

```ts
// with the shaded side of each (light comes from the upper left); and what
// its level lets it wear (see Wear).

// The hat a level brings (★2), one from each costume's set: a knit beanie
// with everyday clothes, a mortarboard with a lab coat, a party cone at the
// club, a cap worn backwards in the den, an antenna on a space helmet, a
// grander hat for a wizard.
export type Prize = 'beanie' | 'mortarboard' | 'party' | 'cap' | 'antenna' | 'grand';
export const PRIZES: Record<Costume, Prize> = { casual: 'beanie', scientist: 'mortarboard', raver: 'party', hacker: 'cap', astronaut: 'antenna', wizard: 'grand' };
export const GOLD = '#f5c542';
```

After

```ts
  hoodUp: boolean;
```

insert

```ts
  prize: Prize | null; // its level's hat (★2)
  badge: boolean; // a star badge on the chest (★3)
  aura: boolean; // a soft glow round it (★10)
```

After

```ts
const dk = (c: Color, k = 0.22) => shade(c, -k);
```

insert

```ts

// A colour's hue, degrees.
function hueOf([r, g, b]: RGB): number {
  const hi = Math.max(r, g, b);
  const d = hi - Math.min(r, g, b);
  if (d === 0) return 0;
  const h = hi === r ? (g - b) / d : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
```

Replace

```ts
export function lookOf(tr: Traits, costume: Costume): Look {
```

with

```ts
export function lookOf(tr: Traits, costume: Costume, wear?: Wear): Look {
```

After

```ts
    hoodUp: false,
```

insert

```ts
    prize: null,
    badge: false,
    aura: false,
```

After

```ts
    L.trimD = dk(color);
  }
```

insert

```ts
  if (wear?.outfit) {
    // ★8: the outfit in other colours. The main garment takes the trim's
    // hue, full (a white coat or suit is tinted with it), the trim the
    // old colour; a ghost's sheet takes a pastel of it, its trim gold.
    const alt = hexOf(hsl(hueOf(tr.trim), 0.62, 0.5));
    if (ghost) {
      L.top = mix(GHOST, alt, 0.3);
      L.topD = dk(L.top, 0.18);
      L.trim = GOLD;
      L.trimD = dk(GOLD);
    } else {
      L.top = costume === 'scientist' || costume === 'astronaut' ? mix(L.top, alt, 0.5) : alt;
      L.topD = dk(L.top);
      L.trim = shirt;
      L.trimD = dk(shirt);
      if (costume === 'astronaut') {
        L.legs = L.top;
        L.legsD = L.topD;
      }
      if (costume === 'wizard') L.hat = shade(L.top, -0.06);
      if (costume === 'hacker') L.hat = L.top;
      L.hatD = dk(L.hat);
    }
  }
  if (wear?.hat) {
    // ★2: the hat goes on in place of a lamp, a beret or a hood.
    L.prize = PRIZES[costume];
    if (L.acc === 'lamp' || L.acc === 'beret' || L.acc === 'hood') L.acc = 'none';
    L.hoodUp = false;
  }
  L.badge = wear?.badge ?? false;
  L.aura = wear?.aura ?? false;
```

- [ ] **Step 6: `src/art/figure/head.ts`**

The hats (a headset stays under one), and `star` exported for the badge:

Replace

```ts
import type { Look } from './look.ts';
```

with

```ts
import { GOLD, type Look } from './look.ts';
```

Replace

```ts
  if (L.acc === 'headset' && wizardHat(L)) {
```

with

```ts
  if (L.acc === 'headset' && (wizardHat(L) || L.prize)) {
```

After

```ts
  if (L.costume === 'astronaut') helmet(sk, L, back);
```

insert

```ts
  if (L.prize === 'antenna' && !o.carry) antenna(sk, L, back);
```

Replace

```ts
  if (wizardHat(L) && !o.carry) {
```

with

```ts
  if (L.prize === 'grand' && !o.carry) {
    grandHat(sk, L, back);
    return;
  }
  if (wizardHat(L) && !o.carry && !L.prize) {
```

After

```ts
      p.stroke();
    });
  }
```

insert

```ts
  if (L.prize && L.prize !== 'grand' && L.prize !== 'antenna' && !o.carry) prizeHat(sk, L, back);
}

// ★2: a level's hat (see look.ts), over the hair, the goggles of a lab
// coat or a raver's headband.
function prizeHat(sk: Sketch, L: Look, back: boolean): void {
  const c = L.color;
  const cd = shade(c, -0.24);
  const sx = back ? -0.1 : 0.1; // its crown, a little toward the face
  switch (L.prize) {
    case 'beanie': {
      sk.blob((p) => {
        p.moveTo(-3.45, -1.35);
        p.quadraticCurveTo(-3.6, -4.4, sx, -4.5);
        p.quadraticCurveTo(3.65, -4.4, 3.5, -1.35);
        p.closePath();
      }, c, { dark: cd, d: 0.55 });
      const brim = (p: Pen) => p.roundRect(-3.75, -2.1, 7.5, 1.2, 0.55);
      sk.blob(brim, shade(c, -0.1), { dark: cd, d: 0.2 });
      sk.draw((p, k) => {
        // the knit's ribs
        p.save();
        p.beginPath();
        brim(p);
        p.clip();
        p.strokeStyle = alpha(k.ink, 0.35);
        p.lineWidth = k.line * 0.8;
        p.beginPath();
        for (let x = -3.2; x < 3.6; x += 0.8) {
          p.moveTo(x, -2.05);
          p.lineTo(x, -0.95);
        }
        p.stroke();
        p.restore();
      });
      sk.blob(circ(sx, -4.85, 1.0), mix(c, WHITE, 0.55), { dark: mix(c, WHITE, 0.25), d: 0.3 });
      return;
    }
    case 'mortarboard': {
      const black = '#34324a';
      sk.blob((p) => {
        p.moveTo(-3.2, -1.9);
        p.quadraticCurveTo(-3.1, -3.75, sx, -3.85);
        p.quadraticCurveTo(3.25, -3.75, 3.2, -1.9);
        p.quadraticCurveTo(sx, -2.5, -3.2, -1.9);
        p.closePath();
      }, black, { dark: shade(black, -0.25), d: 0.35 });
      // the board, seen a little from above, and its tassel
      sk.blob((p) => {
        p.moveTo(-4.6, -3.75);
        p.lineTo(sx, -5.05);
        p.lineTo(4.7, -3.75);
        p.lineTo(sx, -2.75);
        p.closePath();
      }, '#45425c', { dark: black, d: 0.18 });
      sk.limb([sx, -3.95, 2.6, -3.55, 3.15, -1.9], 0.24, GOLD, { line: 0.5 });
      sk.blob((p) => p.roundRect(2.85, -2.05, 0.6, 1.05, 0.25), GOLD, { dark: shade(GOLD, -0.2), d: 0.15, line: 0.5 });
      sk.blob(circ(sx, -3.95, 0.34), GOLD, { line: 0.5 });
      return;
    }
    case 'party': {
      const cone = (p: Pen) => {
        p.moveTo(-2.1, -2.55);
        p.lineTo(0.95, -8.3);
        p.lineTo(2.45, -2.4);
        p.quadraticCurveTo(0.2, -1.85, -2.1, -2.55);
        p.closePath();
      };
      sk.blob(cone, c, { dark: cd, d: 0.45 });
      sk.draw((p) => {
        // stripes
        p.save();
        p.beginPath();
        cone(p);
        p.clip();
        p.strokeStyle = alpha(WHITE, 0.75);
        p.lineWidth = 0.55;
        p.beginPath();
        for (const y of [-3.6, -5.2, -6.8]) {
          p.moveTo(-3, y + 0.9);
          p.lineTo(3, y - 0.6);
        }
        p.stroke();
        p.restore();
      });
      sk.blob(circ(0.95, -8.5, 0.8), mix(c, WHITE, 0.6), { dark: mix(c, WHITE, 0.3), d: 0.25 });
      return;
    }
    case 'cap': {
      sk.blob((p) => {
        p.moveTo(-3.45, -1.25);
        p.quadraticCurveTo(-3.55, -4.25, sx, -4.3);
        p.quadraticCurveTo(3.6, -4.25, 3.45, -1.25);
        p.quadraticCurveTo(sx, -1.95, -3.45, -1.25);
        p.closePath();
      }, c, { dark: cd, d: 0.55 });
      sk.draw((p, k) => {
        // a seam over the crown
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.7;
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(sx, -4.25);
        p.quadraticCurveTo(sx + 0.25, -2.8, sx + 0.1, -1.6);
        p.stroke();
      });
      // the peak, turned to the back: off the back of the head, or toward
      // us when we see it from behind
      if (back) sk.blob(ell(sx, -1.55, 2.5, 0.8), shade(c, -0.12), { dark: cd, d: 0.2 });
      else sk.blob(ell(-3.85, -1.75, 1.85, 0.6, 0.18), shade(c, -0.12), { dark: cd, d: 0.2 });
      sk.blob(circ(sx, -4.3, 0.36), shade(c, -0.15), { line: 0.5 });
      return;
    }
  }
}

// ★2 for a wizard: a grander hat, taller, with a gold band and stars.
function grandHat(sk: Sketch, L: Look, back: boolean): void {
  const hat = L.hat;
  sk.blob(ell(back ? -0.1 : 0.15, -2.4, 4.35, 1.15), hat, { dark: L.hatD, d: 0.35 });
  const cone = (p: Pen) => {
    p.moveTo(-2.5, -2.55);
    p.quadraticCurveTo(-1.55, -5.4, -1.0, -7.3);
    p.quadraticCurveTo(-2.0, -7.7, -3.2, -7.3);
    p.quadraticCurveTo(-1.2, -9.4, 0.65, -7.4);
    p.quadraticCurveTo(1.75, -4.9, 2.8, -2.55);
    p.quadraticCurveTo(0.1, -2.0, -2.5, -2.55);
    p.closePath();
  };
  sk.blob(cone, hat, { dark: L.hatD, d: 0.55 });
  sk.draw((p) => {
    p.save();
    p.beginPath();
    cone(p);
    p.clip();
    p.beginPath();
    p.moveTo(-2.8, -3.55);
    p.quadraticCurveTo(0.1, -2.95, 3.0, -3.55);
    p.lineTo(3.0, -2.0);
    p.lineTo(-2.8, -2.0);
    p.closePath();
    p.fillStyle = GOLD;
    p.fill();
    p.restore();
    if (back) return;
    star(p, 0.45, -4.75, 0.62, GOLD);
    star(p, -0.75, -6.35, 0.38, '#fff3c4');
    star(p, 1.25, -6.05, 0.3, '#fff3c4');
  });
}

// ★2 on a space helmet: an antenna with a glowing bulb.
function antenna(sk: Sketch, L: Look, back: boolean): void {
  const x = back ? -0.4 : 0.6;
  sk.limb([x, -4.35, x + 0.3, -5.6, x + 0.75, -6.8], 0.24, '#9aa3b0', { line: 0.6 });
  sk.draw((p) => {
    const g = p.createRadialGradient(x + 0.8, -7.2, 0.3, x + 0.8, -7.2, 1.7);
    g.addColorStop(0, alpha(L.color, 0.5));
    g.addColorStop(1, alpha(L.color, 0));
    p.beginPath();
    p.arc(x + 0.8, -7.2, 1.7, 0, TAU);
    p.fillStyle = g;
    p.fill();
  });
  sk.blob(circ(x + 0.8, -7.2, 0.72), L.color, { dark: shade(L.color, -0.22), d: 0.2 });
  sk.draw((p) => {
    p.beginPath();
    p.arc(x + 0.6, -7.42, 0.2, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.9);
    p.fill();
  });
```

Replace

```ts
function star(p: Pen, x: number, y: number, r: number, fill: string): void {
```

with

```ts
export function star(p: Pen, x: number, y: number, r: number, fill: string): void {
```

- [ ] **Step 7: `src/art/figure/body.ts`**

The badge and the aura:

Replace

```ts
import { drawHead, hairBehind } from './head.ts';
import type { Look } from './look.ts';
```

with

```ts
import { drawHead, hairBehind, star } from './head.ts';
import { GOLD, type Look } from './look.ts';
```

After

```ts
  const floorY = -r.pelvis[1];

```

insert

```ts
  // ★10: the aura, behind everything
  if (L.aura) aura(sk, L, r.t);

```

After

```ts
  add(5, () => torso(sk, L, top, back, r, floorY));
```

insert

```ts
  if (L.badge && !back) add(5.2, () => badge(sk, top));
```

After

```ts
// ---- torso ------------------------------------------------------------------

```

insert

```ts
// ★3: a gold star badge pinned on the chest.
function badge(sk: Sketch, top: number): void {
  const x = 1.45;
  const y = top + 1.35;
  sk.blob((p) => p.arc(x, y, 0.62, 0, TAU), GOLD, { dark: shade(GOLD, -0.22), d: 0.16, line: 0.6, sil: false });
  sk.draw((p) => star(p, x - 0.02, y + 0.02, 0.4, '#fff8dc'));
}

// ★10: a soft glow in its own colour round it, and a twinkle or two.
function aura(sk: Sketch, L: Look, t: number): void {
  sk.draw((p) => {
    const g = p.createRadialGradient(0.1, -6.6, 0.5, 0.1, -6.6, 8.4);
    g.addColorStop(0, alpha(L.color, 0.38));
    g.addColorStop(0.55, alpha(L.color, 0.18));
    g.addColorStop(1, alpha(L.color, 0));
    p.beginPath();
    p.ellipse(0.1, -6.6, 6.0, 8.4, 0, 0, TAU);
    p.fillStyle = g;
    p.fill();
    for (const [x, y, ph] of [[-4.3, -11.2, 0], [4.2, -4.4, 2.1], [3.6, -12.6, 4.2]]) {
      const k = 0.5 + 0.5 * Math.sin(t * 5 + ph);
      const r = 0.35 + 0.35 * k;
      p.beginPath();
      p.moveTo(x, y - r * 2);
      p.quadraticCurveTo(x, y, x + r, y);
      p.quadraticCurveTo(x, y, x, y + r * 2);
      p.quadraticCurveTo(x, y, x - r, y);
      p.quadraticCurveTo(x, y, x, y - r * 2);
      p.closePath();
      p.fillStyle = alpha('#ffffff', 0.55 + 0.4 * k);
      p.fill();
    }
  });
}

```

- [ ] **Step 8: `src/art/figure.ts`**

The look keyed by what it wears, and a bigger box:

Replace

```ts
import type { Costume, Emote, Traits } from '../world/character.ts';
```

with

```ts
import type { Costume, Emote, Traits, Wear } from '../world/character.ts';
```

Replace

```ts
const looks = new WeakMap<Traits, Map<Costume, { look: Look; key: string }>>();
```

with

```ts
const looks = new WeakMap<Traits, Map<string, { look: Look; key: string }>>();
```

Replace

```ts
function lookFor(tr: Traits, costume: Costume): { look: Look; key: string } {
```

with

```ts
// What it wears as key letters: hat, badge, outfit, aura.
const wearKey = (w?: Wear) => (w ? `${w.hat ? 'h' : ''}${w.badge ? 'b' : ''}${w.outfit ? 'o' : ''}${w.aura ? 'a' : ''}` : '');

function lookFor(tr: Traits, costume: Costume, wear?: Wear): { look: Look; key: string } {
```

Replace

```ts
  let hit = m.get(costume);
```

with

```ts
  const wk = wearKey(wear);
  let hit = m.get(`${costume}|${wk}`);
```

Replace

```ts
    const key = [tr.species, hexOf(tr.skin), hexOf(tr.hair), tr.hairStyle, hexOf(tr.shirt), hexOf(tr.trim), hexOf(tr.pants), tr.pattern, tr.accessory, hexOf(tr.eye), hexOf(tr.color), costume].join(',');
    hit = { look: lookOf(tr, costume), key };
    m.set(costume, hit);
```

with

```ts
    const key = [tr.species, hexOf(tr.skin), hexOf(tr.hair), tr.hairStyle, hexOf(tr.shirt), hexOf(tr.trim), hexOf(tr.pants), tr.pattern, tr.accessory, hexOf(tr.eye), hexOf(tr.color), costume, wk].join(',');
    hit = { look: lookOf(tr, costume, wear), key };
    m.set(`${costume}|${wk}`, hit);
```

Replace

```ts
const FIG_BOX = { x0: -12, x1: 10, y0: -22, y1: 2 };
```

with

```ts
// Room for any pose (x, y in units round the anchor), with a level's hat:
// on a hop for joy, or lying down asleep.
const FIG_BOX = { x0: -14, x1: 12, y0: -24, y1: 5 };
```

Replace

```ts
  const { look, key: lk } = lookFor(f.traits, f.costume);
```

with

```ts
  const { look, key: lk } = lookFor(f.traits, f.costume, f.wear);
```

- [ ] **Step 9: Run it to see it pass**

Run: `node --test test/figure.test.ts`
Expected: PASS (18 tests).

- [ ] **Step 10: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 943`, `ℹ pass 943`, `ℹ fail 0`).

```bash
git add test/figure.test.ts src/world/character.ts src/world/frame.ts src/art/figure/look.ts src/art/figure/head.ts src/art/figure/body.ts src/art/figure.ts
git commit -F - <<'EOF'
feat(figure): a level's hat, badge, outfit and aura in every costume

A hat from each costume's set in place of a lamp, beret or hood, a star
badge on the chest, the outfit in the trim's hue, a soft aura; cached
with the look, so part of the sprite key.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 10: Desk upgrades and the hop in the scene

**Files:**
- Test: `test/figure.test.ts`
- Test: `test/scene.test.ts`
- Modify: `src/world/frame.ts`
- Create: `src/art/figure/trinkets.ts`
- Modify: `src/art/figure.ts`
- Modify: `src/art/scene.ts`

The scene draws desk upgrades (a potted plant, a mug on a stool, a trophy on a plinth, in their owner's colour) as cached sprites standing on the floor, depth-sorted like figures, and lifts a hopping figure without moving its shadow. The stage fills them in (Task 11).

- [ ] **Step 1: The failing test, `test/figure.test.ts`**

Import `trinketSprite`, and append its test:

Replace

```ts
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, type Sprite } from '../src/art/figure.ts';
```

with

```ts
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, trinketSprite, type Sprite } from '../src/art/figure.ts';
```

Append to the end of the file:

```ts

test("desk upgrades: a plant, a mug on a stool and a trophy, standing on their foot, in their owner's colour", () => {
  for (const kind of ['plant', 'mug', 'trophy'] as const) {
    for (const s of [3, 6, 14]) {
      const spr = trinketSprite(kind, [200, 40, 160], s, INK);
      const { width: w, height: h } = spr.img;
      assert.ok(borderClear(spr), `${kind} at ${s}: clipped`);
      assert.ok(h >= 4 * s && h <= 7 * s + 6, `${kind} at ${s}: height ${h}`);
      assert.ok(w >= 2 * s && w <= 6 * s + 6, `${kind} at ${s}: width ${w}`);
      let foot = false;
      for (let x = 0; x < w && !foot; x++) foot = alphaAt(spr, x, spr.ay - 1) > 0;
      assert.ok(h - spr.ay <= s + 3 && foot, `${kind} at ${s}: standing on its anchor`);
      assert.equal(trinketSprite(kind, [200, 40, 160], s, INK), spr, 'cached');
    }
    const a = trinketSprite(kind, [200, 40, 160], 8, INK);
    const b = trinketSprite(kind, [40, 200, 90], 8, INK);
    assert.notEqual(hash(a), hash(b), `${kind}: in its owner's colour`);
    let found = false;
    for (let i = 0; i < a.img.data.length && !found; i += 4) if (a.img.data[i + 3] === 255 && Math.abs(a.img.data[i] - 200) < 8 && Math.abs(a.img.data[i + 1] - 40) < 8 && Math.abs(a.img.data[i + 2] - 160) < 8) found = true;
    assert.ok(found, `${kind}: the colour shows`);
  }
});
```

- [ ] **Step 2: The failing test, `test/scene.test.ts`**

Import `budget`, and append the tests (the last is a plate budget with every cosmetic):

After

```ts
import type { PropArt, WorldDef } from '../src/worlds/types.ts';
```

insert

```ts
import { budget } from './helpers.ts';
```

Append to the end of the file:

```ts

test('a desk upgrade stands on the floor, in front of a prop or hidden behind it like a figure', () => {
  const isle = place(flat(10, 6, 8, '#00ff00'), 'right', true, 30, 30);
  const r = room([isle]);
  const bare = copy(new Scene().render(frame(r)).bitmap);
  const tk = (x: number, y: number) => frame(r, { trinkets: [{ id: 'lead', kind: 'trophy', x, y, color: [200, 40, 160] }] });
  assert.ok(covered(bare, new Scene().render(tk(35, 39)).bitmap.data, GREEN) > 20, 'in front: covers the island');
  assert.equal(covered(bare, new Scene().render(tk(35, 27)).bitmap.data, GREEN), 0, 'behind: hidden');
  const plate = new Scene().plate(tk(35, 39));
  assert.ok(plate.layers.some((l) => l.id === 'trinket:lead'));
});

test('a hop lifts the figure, not its shadow', () => {
  const r = room([]);
  const at = (hop: number) => new Scene().plate(frame(r, { figures: [figure('a', 30, 30, { hop })] })).layers;
  const still = at(0);
  const up = at(1);
  const y = (ls: typeof still, id: string) => ls.find((l) => l.id === id)!.y;
  assert.equal(y(still, 'fig:a') - y(up, 'fig:a'), S, 'a unit higher');
  assert.equal(y(up, 'shadow:a'), y(still, 'shadow:a'));
});

test('a busy plate where everyone wears everything, feels something and hops, with desk upgrades, fits the budget', () => {
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('cafe')!, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.full = true;
  w.resize(150, 46);
  let now = start;
  for (let i = 0; i < 20 * 18; i++) {
    now = start + i * (1000 / 18);
    w.tick(now);
  }
  w.draw(new Screen(150, 46), now);
  const f = w.scene()!;
  const all = { wear: { hat: true, badge: true, outfit: true, aura: true }, feel: { drowsy: true, bandaged: true, bouncy: true } };
  const figs = [...f.figures];
  for (let k = 0; figs.length < 9; k++) figs.push(figure(`extra-${k}`, 40 + 12 * k, 90 - 7 * k));
  const trinkets = (['plant', 'mug', 'trophy'] as const).map((kind, i) => ({ id: `t${i}`, kind, x: 30 + 20 * i, y: 40, color: [200, 60, 160] as [number, number, number] }));
  const busy = (k: number): SceneFrame => ({ ...f, figures: figs.slice(0, 9).map((g, i) => ({ ...g, ...all, hop: (k + i) % 3 === 0 ? 0.6 : 0 })), trinkets, lit: true, t: f.t + k / 30 });
  const scene = new Scene();
  scene.plate(busy(0));
  // As the plate above: 8 ms is the budget; generous, files run in parallel.
  budget('busy plate with growth', (k) => scene.plate(busy(k + 1)), 16, { runs: 5 });
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test test/figure.test.ts test/scene.test.ts`
Expected: FAIL: `test/figure.test.ts` cannot load (`does not provide an export named 'trinketSprite'`); in `test/scene.test.ts` the desk upgrade test (`in front: covers the island`) and the hop test (`a unit higher`) fail. The busy-plate budget passes already: the old scene ignores what it does not know.

- [ ] **Step 4: `src/world/frame.ts`**

`Trinket`, `TrinketFrame`, `MUG_TOP` and `SceneFrame.trinkets`:

After

```ts
export type LabelFrame = { col: number; row: number; w: number; kind: 'name' | 'bubble' | 'error' | 'glyph'; color: RGB; alpha: number; text: string; ink: RGB; bold: boolean; mark?: { col: number; ch: string; ink: RGB } };

```

insert

```ts
// A desk upgrade (★5; see Stage.trinkets): a plant, a steaming mug or a
// trophy standing on the floor by its owner's favourite station, in its
// owner's colour.
export type Trinket = 'plant' | 'mug' | 'trophy';
// Steam rises off a mug's rim this high (units).
export const MUG_TOP = 3.7;
export type TrinketFrame = { id: string; kind: Trinket; x: number; y: number; color: RGB };

```

After

```ts
  critter: CritterFrame | null;
```

insert

```ts
  trinkets?: TrinketFrame[];
```

- [ ] **Step 5: `src/art/figure/trinkets.ts`**

The three upgrades:

Create `src/art/figure/trinkets.ts`:

```ts
import { MUG_TOP } from '../../world/frame.ts';
import type { Trinket } from '../../world/frame.ts';
import { mix, shade } from '../iso.ts';
import type { Color, Pen } from '../types.ts';
import { GOLD } from './look.ts';
import type { Sketch } from './paint.ts';

// A level's desk upgrade (★5), standing on the floor by its owner's
// favourite station, (0, 0) at its foot, 4 to 6 units tall: a potted plant
// with a band in its owner's colour, a mug of its colour on a stool (the
// stage sends steam up off it, see MUG_TOP), a gold trophy on a plinth
// with a plate of its colour.

const TAU = Math.PI * 2;

export function drawTrinket(sk: Sketch, kind: Trinket, color: Color): void {
  if (kind === 'plant') plant(sk, color);
  else if (kind === 'mug') mug(sk, color);
  else trophy(sk, color);
}

function plant(sk: Sketch, color: Color): void {
  const green = '#4caf62';
  const leaf = (a: number, len: number, w: number) => (p: Pen) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = s * len;
    const ty = -2.3 - c * len;
    p.moveTo(0, -2.3);
    p.quadraticCurveTo(s * len * 0.5 + c * w, -2.3 - c * len * 0.5 + s * w, tx, ty);
    p.quadraticCurveTo(s * len * 0.5 - c * w, -2.3 - c * len * 0.5 - s * w, 0, -2.3);
    p.closePath();
  };
  for (const [a, len] of [[-1.0, 2.6], [1.05, 2.5], [-0.35, 3.4], [0.4, 3.2]] as const) sk.blob(leaf(a, len, 0.95), green, { dark: shade(green, -0.25), d: 0.3 });
  const pot = (p: Pen) => {
    p.moveTo(-1.1, 0);
    p.lineTo(1.1, 0);
    p.lineTo(1.4, -2.0);
    p.lineTo(-1.4, -2.0);
    p.closePath();
  };
  const clay = '#c8693e';
  sk.blob(pot, clay, { dark: shade(clay, -0.22), d: 0.35 });
  sk.draw((p) => {
    p.save();
    p.beginPath();
    pot(p);
    p.clip();
    p.fillStyle = color;
    p.fillRect(-2, -1.35, 4, 0.5);
    p.restore();
  });
  sk.blob((p) => p.roundRect(-1.6, -2.45, 3.2, 0.6, 0.25), shade(clay, 0.08), { dark: shade(clay, -0.15), d: 0.15 });
}

function mug(sk: Sketch, color: Color): void {
  const wood = '#a8743f';
  for (const x of [-1.2, 1.2]) sk.limb([x, -1.9, x * 1.1, 0], 0.45, shade(wood, -0.15), { line: 0.6 });
  sk.blob((p) => p.roundRect(-1.7, -2.3, 3.4, 0.6, 0.25), wood, { dark: shade(wood, -0.22), d: 0.2 });
  sk.limb([0.75, -3.25, 1.35, -3.0, 0.75, -2.55], 0.3, color, { line: 0.6 });
  sk.blob((p) => p.roundRect(-0.8, MUG_TOP * -1, 1.6, 1.45, 0.3), color, { dark: shade(color, -0.22), d: 0.25 });
  sk.draw((p) => {
    p.beginPath();
    p.ellipse(0, -MUG_TOP + 0.12, 0.62, 0.17, 0, 0, TAU);
    p.fillStyle = '#5b3a24';
    p.fill();
  });
}

function trophy(sk: Sketch, color: Color): void {
  const dark = '#4a3f52';
  sk.blob((p) => p.roundRect(-1.35, -1.05, 2.7, 1.05, 0.2), dark, { dark: shade(dark, -0.2), d: 0.2 });
  sk.draw((p) => {
    p.fillStyle = color;
    p.fillRect(-0.6, -0.75, 1.2, 0.45);
  });
  sk.limb([0, -1.05, 0, -2.3], 0.5, GOLD, { dark: shade(GOLD, -0.2), line: 0.6 });
  sk.blob((p) => p.ellipse(0, -1.15, 0.8, 0.25, 0, 0, TAU), GOLD, { dark: shade(GOLD, -0.2), d: 0.1 });
  for (const s of [-1, 1]) sk.limb([s * 1.05, -4.3, s * 1.55, -3.85, s * 0.85, -3.2], 0.28, GOLD, { line: 0.6 });
  const cup = (p: Pen) => {
    p.moveTo(-1.2, -4.75);
    p.lineTo(1.2, -4.75);
    p.quadraticCurveTo(1.15, -2.55, 0, -2.35);
    p.quadraticCurveTo(-1.15, -2.55, -1.2, -4.75);
    p.closePath();
  };
  sk.blob(cup, GOLD, { dark: shade(GOLD, -0.22), d: 0.4 });
  sk.draw((p) => {
    p.beginPath();
    p.ellipse(0, -4.75, 1.2, 0.28, 0, 0, TAU);
    p.fillStyle = mix(GOLD, '#000000', 0.25);
    p.fill();
    // a glint
    p.beginPath();
    p.ellipse(-0.55, -3.9, 0.16, 0.5, 0.2, 0, TAU);
    p.fillStyle = 'rgba(255, 255, 255, 0.8)';
    p.fill();
  });
}
```

- [ ] **Step 6: `src/art/figure.ts`**

Their sprites, cached with the rest:

Replace

```ts
import type { CritterFrame, FigureFrame } from '../world/frame.ts';
```

with

```ts
import type { RGB } from '../term/color.ts';
import type { CritterFrame, FigureFrame, Trinket } from '../world/frame.ts';
```

After

```ts
import { blinkAt, frameOf, LOOP, rigFor } from './figure/rig.ts';
```

insert

```ts
import { drawTrinket } from './figure/trinkets.ts';
```

Append to the end of the file:

```ts

// ---- desk upgrades -------------------------------------------------------------

const TRINKET_BOX = { x0: -3, x1: 3, y0: -7, y1: 1 };

export function trinketSprite(kind: Trinket, color: RGB, s: number, ink: string): Sprite {
  const q = quant(s);
  const c = hexOf(color);
  return cached(`t|${kind}|${c}|${q}|${ink}`, () => {
    const sk = new Sketch();
    drawTrinket(sk, kind, c);
    return paint(sk, q, ink, false, TRINKET_BOX);
  });
}
```

- [ ] **Step 7: `src/art/scene.ts`**

Drawn among the depth-sorted items; a hop lifts the figure:

Replace

```ts
import { critterSprite, emoteSprite, figureSprite, spriteStats } from './figure.ts';
```

with

```ts
import { critterSprite, emoteSprite, figureSprite, spriteStats, trinketSprite } from './figure.ts';
```

Replace

```ts
      // Anchors are whole pixels: whole-pixel blits (the fast path).
```

with

```ts
      // Anchors are whole pixels: whole-pixel blits (the fast path). A
      // hop lifts the figure only, not where it stands.
```

Replace

```ts
      const [x, y] = P(g.x, g.y, g.z);
```

with

```ts
      const [x, y] = P(g.x, g.y, g.z + (g.hop ?? 0));
```

After

```ts
      const it: Item = { x0: g.x, y0: g.y, x1: g.x, y1: g.y, h: g.z, point: true, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: `fig:${g.id}`, img: sp.img, x: dx, y: dy };
```

insert

```ts
      if (seen(it)) out.push(it);
    }
    for (const tk of f.trinkets ?? []) {
      // Desk upgrades stand on the floor, sorted like a figure.
      const sp = trinketSprite(tk.kind, tk.color, s, ink);
      const [x, y] = P(tk.x, tk.y, 0);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const it: Item = { x0: tk.x, y0: tk.y, x1: tk.x, y1: tk.y, h: 0, point: true, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: `trinket:${tk.id}`, img: sp.img, x: dx, y: dy };
```

- [ ] **Step 8: Run it to see it pass**

Run: `node --test test/figure.test.ts test/scene.test.ts`
Expected: PASS (36 tests: 19 + 17).

- [ ] **Step 9: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 947`, `ℹ pass 947`, `ℹ fail 0`).

```bash
git add test/figure.test.ts test/scene.test.ts src/world/frame.ts src/art/figure/trinkets.ts src/art/figure.ts src/art/scene.ts
git commit -F - <<'EOF'
feat(scene): desk upgrades on the floor, and a hop drawn higher

A plant, a mug on a stool or a trophy in its owner's colour, sorted like
a figure; a happy figure's hop lifts its sprite, not its shadow.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 11: The stage: level-ups, feelings, what they wear, desk upgrades

**Files:**
- Test: `test/stage.test.ts`
- Modify: `src/agents.ts`
- Modify: `src/pet/meters.ts`
- Modify: `src/world/stage.ts`

The stage turns each agent's meters into its `feel` (and a hop for a happy one), its `level` (a new optional `AgentInfo` field the World fills in) into its `wear`, and tallies the time each crew role works at each station this run: at ★5 its upgrade stands by the one it worked most. `levelUp(id, level)` showers the world's confetti (the finish's burst, factored out) and raises `★N!` as a word over the labels; no emote pops up then, so nothing hides it.

- [ ] **Step 1: The failing test, `test/stage.test.ts`**

Import `Vitals` and `hashString`, and append the tests:

Replace

```ts
import type { AgentInfo, Activity } from '../src/agents.ts';
```

with

```ts
import type { AgentInfo, Activity, Vitals } from '../src/agents.ts';
import { hashString } from '../src/world/rng.ts';
```

Append to the end of the file:

```ts

const MIN = 60_000;
// Vitals for an agent that feels a certain way at NOW (see pet/meters.ts).
const vitals = (o: Partial<Vitals> = {}): Vitals => ({
  model: 'claude-opus-5-5', window: 200_000, context: 0, outTokens: 0, errors: [], streak: 0, turnEndedAt: 0, busySince: NOW, lastAt: NOW, midTool: true, title: '', branch: '', ...o,
});

test("a level-up showers the world's confetti and pops ★N! over the agent, who cheers", () => {
  for (const w of [mines, THEMES.find((t) => t.id === 'cafe')!]) {
    const stage = newStage(RECT, w);
    const crew = [agent('a', 'idle', { crew: '/p', level: 3 })];
    let now = run(stage, crew, 3);
    stage.levelUp('a', 3);
    now = run(stage, crew, 0.1, now);
    const bits = particlesOf(stage).filter((p) => p.kind === 'confetti');
    assert.ok(bits.length > 5 && bits.every((p) => w.finale.colors.some((c) => c.join() === p.color.join())), `${w.id}: confetti in the world's colours`);
    const { s, f } = text(stage, now);
    const mark = f.marks.find((m) => m.ch === '★3!');
    assert.ok(mark, 'the mark');
    assert.deepEqual(mark.ink, w.palette.warn);
    assert.ok(s.toText().split('\n')[mark.row].includes('★3!'), 'drawn as text');
    // No emote pops up over it, so nothing hides the mark.
    assert.equal(f.figures.find((g) => g.id === 'a')!.emote, undefined);
    const a = stage.actors()[0];
    assert.equal(stage.lookOf(a, now).pose, 'cheer');
    // It rises and is gone in a few seconds.
    now = run(stage, crew, 3.5, now);
    assert.ok(!stage.frame(now)!.marks.some((m) => m.ch === '★3!'));
  }
  // Nobody by that id: nothing happens.
  newStage().levelUp('nobody', 2);
});

test('figures show how their meters say they feel, and what their level lets them wear', () => {
  const stage = newStage();
  const tired = agent('tired', 'write', { vitals: vitals({ busySince: NOW - 44 * MIN }) });
  const hurt = agent('hurt', 'read', { vitals: vitals({ errors: [NOW, NOW, NOW] }) });
  const glad = agent('glad', 'idle', { vitals: vitals({ streak: 12, midTool: false }), level: 10, crew: '/p' });
  const plain = agent('plain', 'search', { level: 1, crew: '/p' });
  let now = run(stage, [tired, hurt, glad, plain], 4);
  const fig = (id: string) => stage.frame(now)!.figures.find((g) => g.id === id)!;
  assert.deepEqual(fig('tired').feel, { drowsy: true, bandaged: false, bouncy: false });
  assert.deepEqual(fig('hurt').feel, { drowsy: false, bandaged: true, bouncy: false });
  assert.equal(fig('glad').feel?.bouncy, true);
  assert.deepEqual(fig('glad').wear, { hat: true, badge: true, outfit: true, aura: true });
  assert.equal(fig('plain').feel, undefined, 'no vitals, no feelings shown');
  assert.equal(fig('plain').wear, undefined, 'nothing to wear at ★1');
  // The happy one bounces from frame to frame; the others stand on the floor.
  const hops = new Set<number>();
  for (let i = 0; i < 20; i++) {
    now = run(stage, [tired, hurt, glad, plain], 0.05, now);
    const g = fig('glad');
    if (g.pose === 'idle' || g.pose === 'walk') hops.add(Math.round((g.hop ?? 0) * 10));
    assert.equal(fig('tired').hop, undefined);
  }
  assert.ok(hops.size >= 3 && Math.max(...hops) <= 9, `hops ${[...hops]}`);
});

test('at ★5 a crew role gets a desk upgrade by the station it worked at most; below, none', () => {
  const stage = newStage(WIDE);
  const writer = agent('w', 'write', { crew: '/p', role: 'lead', level: 5 });
  const junior = agent('j', 'write', { crew: '/p', agentType: 'Explore', level: 4 });
  let now = run(stage, [writer, junior], 30);
  let f = stage.frame(now)!;
  assert.equal(f.trinkets!.length, 1);
  const tk = f.trinkets![0];
  assert.equal(tk.id, '/p\nlead');
  assert.ok(['plant', 'mug', 'trophy'].includes(tk.kind));
  const desk = slot(stage, 'write');
  const r = footprintOf(desk);
  const away = Math.max(r.x0 - tk.x, tk.x - r.x1, r.y0 - tk.y, tk.y - r.y1);
  assert.ok(away > 0 && away < 12, `beside the desk (${away.toFixed(1)} units off it)`);
  // Reading for longer than it wrote: the shelves are its favourite now.
  now = run(stage, [{ ...writer, activity: 'read', since: now }, junior], 70, now);
  f = stage.frame(now)!;
  const shelves = footprintOf(slot(stage, 'read'));
  const t2 = f.trinkets![0];
  assert.ok(Math.max(shelves.x0 - t2.x, t2.x - shelves.x1, shelves.y0 - t2.y, t2.y - shelves.y1) < 12, 'moved to the shelves');
  // Gone with its agent.
  now = run(stage, [junior], 20, now);
  assert.deepEqual(stage.frame(now)!.trinkets, []);
});

test('two upgrades at one station stand apart; a mug steams', () => {
  const stage = newStage(WIDE);
  // Roles whose upgrade is a mug, and another.
  const roles = Array.from({ length: 40 }, (_, i) => `type-${i}`);
  const mugRole = roles.find((t) => hashString(`/p\n${t}`) % 3 === 1)!;
  const other = roles.find((t) => hashString(`/p\n${t}`) % 3 !== 1)!;
  const crew = [agent('m', 'write', { crew: '/p', agentType: mugRole, level: 6 }), agent('o', 'write', { crew: '/p', agentType: other, level: 6 })];
  let now = run(stage, crew, 30);
  const [a, b] = stage.frame(now)!.trinkets!;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 3, 'apart');
  const mug = [a, b].find((t) => t.kind === 'mug')!;
  let steam = 0;
  for (let i = 0; i < 40; i++) {
    now = run(stage, crew, 0.05, now);
    steam = Math.max(steam, particlesOf(stage).filter((p) => p.kind === 'steam' && Math.hypot(p.x - mug.x, p.y - mug.y) < 3).length);
  }
  assert.ok(steam > 0, 'steam off the mug');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/stage.test.ts`
Expected: FAIL: 4 of 41: `stage.levelUp is not a function`, the feel test's `deepEqual` (no `feel` yet), and both desk-upgrade tests (no `trinkets` in the frame).

- [ ] **Step 3: `src/agents.ts`**

`AgentInfo.level`:

After

```ts
  crew?: string;
```

insert

```ts
  // Its role's level in its crew (★N, see pet/crew.ts), as the World
  // knows it; sources leave it out.
  level?: number;
```

- [ ] **Step 4: `src/pet/meters.ts`**

How the meters show on the figure:

After

```ts
import { rested } from '../agents.ts';
```

insert

```ts
import type { Feel } from '../world/character.ts';
```

Append to the end of the file:

```ts

// A mood this high shows: a grin and a bigger bounce.
export const BOUNCY = 0.8;

// How its figure shows the meters: drowsy eyes when its energy is
// critical, a bandage when its health is, a bounce when its mood is high.
export function feelOf(m: Meters): Feel {
  return { drowsy: m.energy.critical, bandaged: m.health.critical, bouncy: m.mood.value >= BOUNCY };
}
```

- [ ] **Step 5: `src/world/stage.ts`**

Feel, wear and hop on each figure; level-ups; the station tally and the desk upgrades; word marks over the labels:

After

```ts
import { clip } from '../claude/activity.ts';
```

insert

```ts
import { roleOf, unlocks } from '../pet/crew.ts';
import { feelOf, meters } from '../pet/meters.ts';
```

Replace

```ts
import type { Pose, Traits } from './character.ts';
```

with

```ts
import type { Feel, Pose, Traits, Wear } from './character.ts';
```

Replace

```ts
import type { BuildFrame, Camera, FigureFrame, LabelFrame, SceneFrame } from './frame.ts';
import { EMOTE, FIGURE_H, project } from './frame.ts';
```

with

```ts
import type { BuildFrame, Camera, FigureFrame, LabelFrame, SceneFrame, Trinket, TrinketFrame } from './frame.ts';
import { EMOTE, FIGURE_H, MUG_TOP, project } from './frame.ts';
```

After

```ts
const MAX_EMOTES = 3; // shown at once
```

insert

```ts
// A happy agent's bounce: this high (units), a hop a step while walking,
// one every HOP_IDLE seconds standing about.
const HOP = 0.9;
const HOP_WALK = 0.25;
const HOP_IDLE = 0.5;
// Desk upgrades by role (picked by a hash of crew and role), and how far
// from its station's corner one stands; crew roles whose time at each
// station is kept, at most.
const TRINKETS: readonly Trinket[] = ['plant', 'mug', 'trophy'];
const TRINKET_GAP = 2;
const MAX_WORKED = 200;
```

Replace

```ts
// Letters drifting up as terminal text (z's of a sleeper, a '!' on errors).
```

with

```ts
// Letters drifting up as terminal text (z's of a sleeper, a '!' on errors,
// ★N! on a level-up).
```

After

```ts
type Glyph = { x: number; y: number; z: number; vz: number; ch: string; color: RGB; life: number };

```

insert

```ts
// A crew role's key: its crew and role (see pet/crew.ts).
const roleKey = (a: AgentInfo) => `${a.crew}\n${roleOf(a)}`;

```

After

```ts
  private critter: Critter | null = null;
```

insert

```ts
  // Seconds each crew role (see roleKey) worked at each station this run,
  // and the desk upgrades as they stand.
  private worked = new Map<string, Map<StationKind, number>>();
  private trinkets: TrinketFrame[] = [];
```

After

```ts
    this.life.emote(a, 'heart', 2);
  }

```

insert

```ts
  // Its role reached `level`: a shower of the world's confetti, as a
  // finish has, ★N! rising over its head (where an emote would be: none
  // pops up, so nothing hides it), and it cheers.
  levelUp(id: string, level: number): void {
    const a = this.cast.get(id);
    if (!a || !this.L) return;
    this.burst(a);
    this.glyphs.push({ x: a.x, y: a.y, z: FIGURE_H + 3, vz: 2.2, ch: `★${level}!`, color: this.world.palette.warn, life: 3 });
    a.mind.emote = null;
    this.life.gesture(a, 'cheer', 1.4);
  }

```

After

```ts
    this.life.update([...this.cast.values()], dt);
```

insert

```ts
    this.tally(dt);
```

After

```ts
    updateParticles(this.particles, dt, this.L ?? undefined);
  }

```

insert

```ts
  // Time at work at each station, by crew role, and the desk upgrades it
  // earns; a mug steams.
  private tally(dt: number): void {
    for (const a of this.cast.values()) {
      const k = a.station?.kind;
      if (a.state !== 'work' || !k || k === 'entrance' || !a.info.crew) continue;
      const key = roleKey(a.info);
      let m = this.worked.get(key);
      if (!m) {
        if (this.worked.size >= MAX_WORKED) this.worked.delete(this.worked.keys().next().value!);
        this.worked.set(key, (m = new Map()));
      }
      m.set(k, (m.get(k) ?? 0) + dt);
    }
    this.trinkets = this.placeTrinkets();
    for (const tk of this.trinkets) {
      if (tk.kind === 'mug' && this.rng.next() < dt / 0.45) this.add({ ...smoke(tk.x, tk.y, MUG_TOP, this.rng, [236, 232, 228], 'steam'), vz: 2.5, life: 1.3 });
    }
  }

  // The desk upgrades (★5): one for each crew role here at that level, at
  // the station it worked most this run, a plant, a mug or a trophy by
  // its role, in the colour of one of its agents.
  private placeTrinkets(): TrinketFrame[] {
    const L = this.L;
    if (!L || this.worked.size === 0) return [];
    const out: TrinketFrame[] = [];
    const done = new Set<string>();
    for (const a of this.actors()) {
      if (!a.info.crew || !unlocks(a.info.level ?? 1).desk) continue;
      const key = roleKey(a.info);
      const m = this.worked.get(key);
      if (done.has(key) || !m) continue;
      let best: StationKind | null = null;
      let most = 0;
      for (const [k, secs] of m) {
        if (secs > most) {
          best = k;
          most = secs;
        }
      }
      const slot = L.slots.find((s) => s.kind === best);
      if (!slot) continue;
      done.add(key);
      out.push({ id: key, kind: TRINKETS[hashString(key) % TRINKETS.length], ...this.trinketSpot(slot, out), color: a.traits.color });
    }
    return out;
  }

  // Where a desk upgrade stands by `slot`: by one of its back corners,
  // else its front ones, a step out each way along the wall, on the floor
  // clear of every prop and the upgrades already placed.
  private trinketSpot(slot: Slot, placed: readonly Spot[]): Spot {
    const g = TRINKET_GAP;
    const at = (u: number, v: number): Spot => (slot.wall === 'right' ? { x: slot.x0 + u, y: slot.y0 + v } : { x: slot.x0 + v, y: slot.y0 + u });
    const spots: Spot[] = [];
    for (const v of [g, slot.dep + g]) for (const j of [0, 1, 2]) spots.push(at(slot.len + g + 3 * j, v), at(-g - 3 * j, v));
    const free = (s: Spot) => this.standable(s) && placed.every((p) => Math.hypot(p.x - s.x, p.y - s.y) >= 3);
    return spots.find(free) ?? spots[0];
  }

```

Replace

```ts
      const colors = [pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color];
      for (let i = 0; i < 46; i++) {
        const ang = r.next() * Math.PI * 2;
        const sp = 4 + r.next() * 8;
        this.add({ kind: 'spark', x: a.x, y: a.y, z: head + 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 10 + r.next() * 12, life: 0.8 + r.next() * 0.8, color: r.pick(colors), glow: true, gravity: 14 });
      }
      const fin = this.world.finale.colors;
      for (let i = 0; i < 14; i++) {
        this.add({ kind: 'confetti', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 6, vx: r.range(-4, 4), vy: r.range(-4, 4), vz: 6 + r.next() * 6, life: 4, color: r.pick(fin), glow: false, gravity: 16 });
      }
```

with

```ts
      this.burst(a);
```

After

```ts
    if (this.life.sleeping(a) && every(1.1)) this.glyphs.push({ x: a.x, y: a.y, z: head + 2, vz: 5, ch: r.pick(['z', 'Z']), color: pal.dim, life: 2 });
  }

```

insert

```ts
  // Fireworks in the world's colours over `a`, and a shower of its confetti.
  private burst(a: Actor): void {
    const r = this.rng;
    const pal = this.world.palette;
    const head = FIGURE_H - 2;
    const colors = [pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color];
    for (let i = 0; i < 46; i++) {
      const ang = r.next() * Math.PI * 2;
      const sp = 4 + r.next() * 8;
      this.add({ kind: 'spark', x: a.x, y: a.y, z: head + 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 10 + r.next() * 12, life: 0.8 + r.next() * 0.8, color: r.pick(colors), glow: true, gravity: 14 });
    }
    const fin = this.world.finale.colors;
    for (let i = 0; i < 14; i++) {
      this.add({ kind: 'confetti', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 6, vx: r.range(-4, 4), vy: r.range(-4, 4), vz: 6 + r.next() * 6, life: 4, color: r.pick(fin), glow: false, gravity: 16 });
    }
  }

  // How it feels, from its meters (none without vitals), and what its
  // level lets it wear (nothing at ★1).
  private feel(a: Actor, now: number): Feel | undefined {
    const v = a.info.vitals;
    return v ? feelOf(meters(v, now)) : undefined;
  }

  private wear(a: Actor): Wear | undefined {
    const level = a.info.level ?? 1;
    if (level < 2) return undefined;
    const u = unlocks(level);
    return { hat: u.hat, badge: u.badge, outfit: u.outfit, aura: u.aura };
  }

```

After

```ts
      if (look.item !== undefined) fig.item = this.world.build.colors[look.item] ?? this.world.build.colors[0];
```

insert

```ts
      const feel = this.feel(a, now);
      const wear = this.wear(a);
      if (feel) fig.feel = feel;
      if (wear) fig.wear = wear;
      // A happy one bounces: a hop a step walking, now and then standing about.
      if (feel?.bouncy && !fig.sleeping && (look.pose === 'idle' || look.pose === 'walk')) {
        const per = look.pose === 'walk' ? HOP_WALK : HOP_IDLE;
        fig.hop = HOP * Math.abs(Math.sin((Math.PI * (fig.poseT + fig.phase)) / per));
      }
```

After

```ts
      figures,
      critter,
```

insert

```ts
      trinkets: this.trinkets,
```

Replace

```ts
    for (const m of f.marks) s.put(m.col, m.row, m.ch, m.ink);
```

with

```ts
    for (const m of f.marks) if ([...m.ch].length === 1) s.put(m.col, m.row, m.ch, m.ink);
```

After

```ts
      if (l.mark) s.put(l.mark.col, l.row, l.mark.ch, l.mark.ink, undefined, BOLD);
    }
```

insert

```ts
    // A word (★3!) goes over the labels, centred on its column, in bold.
    for (const m of f.marks) {
      const n = [...m.ch].length;
      if (n > 1) s.text(Math.max(f.camera.cells.x, m.col - (n >> 1)), m.row, m.ch, m.ink, undefined, BOLD, end);
    }
```

- [ ] **Step 6: Run it to see it pass**

Run: `node --test test/stage.test.ts`
Expected: PASS (41 tests).

- [ ] **Step 7: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 951`, `ℹ pass 951`, `ℹ fail 0`).

```bash
git add test/stage.test.ts src/agents.ts src/pet/meters.ts src/world/stage.ts
git commit -F - <<'EOF'
feat(stage): level-ups, how they feel, what they wear, desk upgrades

The meters show on each figure (a happy one bounces), its level dresses
it, and at its fifth level a crew role's upgrade stands by the station it
worked most. A level-up showers the world's confetti and raises ★N!.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 12: The card shows ★N

**Files:**
- Test: `test/card.test.ts`
- Modify: `src/ui/card.ts`

The card's top edge puts the agent's level in its crew before its name, `★N` in the world's warn colour made to read on the panel (capped at ★99). No level (a live agent without a working directory), no star.

- [ ] **Step 1: The failing test, `test/card.test.ts`**

Import `legible`, a frame-integrity case with a level, and the test:

Replace

```ts
import { CARD_H, CARD_W, drawCard, modelName, placeCard, tokens } from '../src/ui/card.ts';
```

with

```ts
import { CARD_H, CARD_W, drawCard, legible, modelName, placeCard, tokens } from '../src/ui/card.ts';
```

After

```ts
    { name: 'long model', o: { info: info({ vitals: longV({ model: 'm'.repeat(80) }) }) }, at: FIG },
```

insert

```ts
    { name: 'a level and a long name', o: { info: info({ name: 'n'.repeat(40), level: 120 }) }, at: FIG },
```

Append to the end of the file:

```ts

test("the top edge shows the agent's level in its crew, ★N in gold, when it has one", () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts({ info: info({ level: 3 }) }), FIG);
  const { x, y } = placeCard(SCENE, FIG);
  const top = s.toText().split('\n')[y].slice(x);
  assert.ok(top.startsWith('╭─ ★3 nova · lead'), top);
  const fg = s.fgAt(x + 3, y);
  assert.deepEqual(fg, legible(pal.warn, pal.panel, pal.panelText, 4.5));
  const t = new Screen(100, 32);
  drawCard(t, SCENE, opts({ info: info({ level: 140 }) }), FIG);
  assert.ok(t.toText().split('\n')[y].slice(x).startsWith('╭─ ★99 nova · lead'), 'capped at 99');
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/card.test.ts`
Expected: FAIL: 1 of 24: the top edge starts `╭─ nova · lead`.

- [ ] **Step 3: `src/ui/card.ts`**

The star before the name:

Replace

```ts
//   ╭─ nova · lead ─────────────────────── 4m ─╮
```

with

```ts
//   ╭─ ★3 nova · lead ──────────────────── 4m ─╮
```

Replace

```ts
  // Top edge: the name in its colour, the role, the time on this activity.
```

with

```ts
  // Top edge: its level in its crew (★N, when it has one), the name in
  // its colour, the role, the time on this activity.
```

Replace

```ts
  const nx = s.text(cx + 1, y, fit(a.name, 16), me, bg, BOLD, timeX - 4);
```

with

```ts
  const lx = a.level ? s.text(cx + 1, y, `★${Math.min(99, a.level)} `, legible(p.warn, bg, ink, 4.5), bg, BOLD) : cx + 1;
  const nx = s.text(lx, y, fit(a.name, 16), me, bg, BOLD, timeX - 4);
```

- [ ] **Step 4: Run it to see it pass**

Run: `node --test test/card.test.ts`
Expected: PASS (24 tests).

- [ ] **Step 5: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 952`, `ℹ pass 952`, `ℹ fail 0`).

```bash
git add test/card.test.ts src/ui/card.ts
git commit -F - <<'EOF'
feat(card): the agent's level, ★N, on the card's top edge

In the warn colour made to read on the panel, capped at ★99.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 13: The world grows its crews

**Files:**
- Test: `test/world.test.ts`
- Modify: `src/world/world.ts`
- Modify: `src/app.ts`
- Modify: `README.md`

The World counts every source's gains into its crews (the live ones from `crews.json`, the demo's a throwaway seeded from `DEMO_XP`), gives each agent its role's `level`, celebrates a level-up on every actor of that role (not one that came from what the start read of the past), and saves the live crews ten seconds after a change and on the way out. `app.ts` hands an interactive run its `CrewStore`; a snapshot reads none. The README gains a Growth section.

- [ ] **Step 1: The failing test, `test/world.test.ts`**

Imports; the card-label test reads the name after the card's new `★N`; and the tests:

Replace

```ts
import { appendFileSync, chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
```

with

```ts
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
```

Replace

```ts
import type { Activity, AgentSource, AgentInfo, Bubble, SendResult, Vitals } from '../src/agents.ts';
```

with

```ts
import type { Activity, AgentSource, AgentInfo, Bubble, Gain, SendResult, Vitals } from '../src/agents.ts';
import { crewKey } from '../src/pet/crew.ts';
import { CrewStore } from '../src/pet/store.ts';
```

Replace

```ts
  // The name as the card's title shows it (tags clip long names).
  const name = /╭─ (\S+) ·/.exec(s.toText())?.[1].slice(0, 5) ?? '';
```

with

```ts
  // The name as the card's title shows it, after its ★N (tags clip long
  // names).
  const name = /╭─ (?:★\d+ )?(\S+) ·/.exec(s.toText())?.[1].slice(0, 5) ?? '';
```

Append to the end of the file:

```ts

// A live source of one lead in crew '/p' whose gains the test hands out.
function growingSource() {
  const gains: Gain[] = [];
  const src: AgentSource = {
    label: 'live',
    poll: (): AgentInfo[] => [{ id: 'L', name: 'lead', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: START, lastSeen: START, crew: '/p' }],
    drainEvents: () => [],
    drainGains: () => gains.splice(0),
  };
  return { src, gains };
}
const turn = (at: number, key = `t${at}`): Gain => ({ agent: 'L', at, key, crew: '/p', role: 'lead', kind: 'turn' });

test('live gains grow the crew, saved to crews.json once a change is ten seconds old, and the card shows ★N', () => {
  const path = join(tempDir('animus-world-crews'), 'crews.json');
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true, crews: new CrewStore(path) });
  w.resize(120, 36);
  for (let i = 0; i < 10; i++) gains.push(turn(START + 100 + i));
  let now = advance(w, 2);
  assert.equal(existsSync(path), false, 'not yet');
  now = advance(w, 9, now);
  const d = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(d.crews[crewKey('/p')].lead.xp, 100);
  w.handleKey(key('\t'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /★2 lead · lead/);
});

test('a level-up bursts over the agent with ★N!; one read from before the start does not', () => {
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true });
  w.resize(120, 36);
  let now = advance(w, 3);
  const marks = (t: number) => {
    const s = new Screen(120, 36);
    w.draw(s, t);
    return s.toText();
  };
  // Ten turns from before animus started: ★2, quietly.
  for (let i = 0; i < 10; i++) gains.push(turn(START - 60_000 + i));
  now = advance(w, 0.5, now);
  assert.doesNotMatch(marks(now), /★2!/);
  // Fifteen more, now: ★3, celebrated.
  for (let i = 0; i < 15; i++) gains.push(turn(now + i));
  let seen = false;
  for (let i = 0; i < 18 && !seen; i++) {
    now = advance(w, 1 / 18, now);
    seen = /★3!/.test(marks(now));
  }
  assert.ok(seen, 'the ★3! mark');
});

test('the demo crew starts some way along and earns XP as it works: nova reaches ★4', () => {
  const w = demoWorld(true);
  let now = START;
  let up = false;
  for (let i = 0; i < 90 * 6 && !up; i++) {
    now = advance(w, 1 / 6, now);
    const s = new Screen(120, 36);
    w.draw(s, now);
    up = /★4!/.test(s.toText());
  }
  assert.ok(up, 'nova levelled up within a minute and a half');
  const atlas = w.scene()!.figures.find((g) => g.id === 'demo-atlas')!;
  assert.deepEqual(atlas.wear, { hat: true, badge: true, outfit: true, aura: true });
});

test('on the way out the crews are saved at once; a crews file it cannot read is moved aside', () => {
  const dir = tempDir('animus-world-crews');
  const path = join(dir, 'crews.json');
  writeFileSync(path, 'not json');
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true, crews: new CrewStore(path) });
  w.resize(120, 36);
  assert.equal(readdirSync(dir).filter((f) => f.startsWith('crews.json.bad-')).length, 1);
  gains.push(turn(START + 10));
  advance(w, 1);
  w.saveCrews();
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).crews[crewKey('/p')].lead.xp, 10);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/world.test.ts`
Expected: FAIL: 4 of 59, the four new tests: no crews.json is written, no `★3!` or `★4!` shows, nothing is moved aside. (The card-label test passes only with its new pattern.)

- [ ] **Step 3: `src/world/world.ts`**

Crews, levels, level-ups and saving:

Replace

```ts
import type { AgentEvent, AgentInfo, AgentSource, Bubble } from '../agents.ts';
```

with

```ts
import type { AgentEvent, AgentInfo, AgentSource, Bubble, Gain } from '../agents.ts';
```

Replace

```ts
import { DemoSource } from '../demo/source.ts';
```

with

```ts
import { DEMO_XP, DemoSource } from '../demo/source.ts';
import { Crews, roleOf } from '../pet/crew.ts';
import type { Award } from '../pet/crew.ts';
import type { CrewStore } from '../pet/store.ts';
```

After

```ts
  lights?: boolean;
```

insert

```ts
  // Where the live agents' crews are kept (see pet/store.ts): read at the
  // start, written as they grow. None: they live in memory only.
  crews?: CrewStore;
```

After

```ts
const inFlight = (o: Outgoing) => o.status !== 'delivered' && o.status !== 'copied';

```

insert

```ts
// The demo's crews, some way along already (a throwaway, never saved).
function demoCrews(): Crews {
  const c = new Crews();
  for (const [crew, roles] of Object.entries(DEMO_XP)) for (const [role, xp] of Object.entries(roles)) c.give(crew, role, xp);
  return c;
}

```

After

```ts
  private demo: DemoSource | null = null;
```

insert

```ts
  // The live agents' crews (kept in `store`) and the demo's.
  private crews: Crews;
  private store: CrewStore | null;
  private demoCrew = demoCrews();
  // Level-ups since the last tick, to celebrate in the scene.
  private ups: Award[] = [];
```

After

```ts
    if (o.demo) this.demo = new DemoSource(7, o.start);
```

insert

```ts
    this.store = o.crews ?? null;
    this.crews = new Crews(this.store?.load(o.start) ?? {});
```

Replace

```ts
    return [...live, ...demo];
```

with

```ts
    this.grow(now);
    return [...live.map((a) => this.ranked(a, this.crews)), ...demo.map((a) => this.ranked(a, this.demoCrew))];
  }

  // XP from what the agents did, counted into their crews (each event
  // once). A level-up is celebrated in the scene, unless it came from what
  // the start read of the past. The live crews are saved a while after
  // they change.
  private grow(now: number): void {
    const from: Array<[AgentSource | null, Crews]> = [
      [this.live, this.crews],
      [this.demoOn ? this.demo : null, this.demoCrew],
    ];
    for (const [src, crews] of from) {
      let gains: Gain[] = [];
      try {
        gains = src?.drainGains?.() ?? [];
      } catch {
        // Growth is cosmetic: a failing source earns nothing this time.
      }
      for (const g of gains) {
        const a = crews.count(g);
        if (!a) continue;
        if (crews === this.crews) this.store?.changed(now);
        if (a.level > a.was && a.at >= this.start) this.ups.push(a);
      }
    }
    this.store?.tick(now, this.crews.data());
  }

  // The agent with its role's level in its crew.
  private ranked(a: AgentInfo, crews: Crews): AgentInfo {
    return a.crew ? { ...a, level: crews.level(a.crew, roleOf(a)) } : a;
  }

  // Writes the live crews now if they changed (on the way out).
  saveCrews(): void {
    this.store?.flush(this.crews.data());
```

Replace

```ts
    if (this.paused || this.sceneKey === '') return;
```

with

```ts
    if (this.paused || this.sceneKey === '') {
      this.ups = [];
      return;
    }
```

After

```ts
    this.stage.sync(agents, now);
```

insert

```ts
    // Everyone of the role that levelled up celebrates.
    for (const up of this.ups) {
      for (const x of this.stage.actors()) if (x.info.crew === up.crew && roleOf(x.info) === up.role) this.stage.levelUp(x.info.id, up.level);
    }
    this.ups = [];
```

Replace

```ts
        if (this.demoOn && !this.demo) this.demo = new DemoSource(7, this.lastTick);
```

with

```ts
        if (this.demoOn && !this.demo) {
          this.demo = new DemoSource(7, this.lastTick);
          this.demoCrew = demoCrews();
        }
```

- [ ] **Step 4: `src/app.ts`**

The crews file for an interactive run, saved on the way out:

After

```ts
import { loadConfig, saveConfig } from './config.ts';
```

insert

```ts
import { CrewStore } from './pet/store.ts';
```

Replace

```ts
function makeWorld(o: RunOpts, start: number, liveInterval?: number): World {
```

with

```ts
// `crews`: where the live crews are kept (an interactive run saves them;
// a snapshot only reads its transcripts' tails, in memory).
function makeWorld(o: RunOpts, start: number, liveInterval?: number, crews?: CrewStore): World {
```

After

```ts
    rootLabel: tildify(o.root),
    start,
```

insert

```ts
    crews: o.demo ? undefined : crews,
```

Replace

```ts
  const world = makeWorld(o, Date.now());
```

with

```ts
  const world = makeWorld(o, Date.now(), undefined, new CrewStore());
```

After

```ts
      flushSave();
```

insert

```ts
      world.saveCrews();
```

- [ ] **Step 5: `README.md`**

A Growth section, before "How it connects to your Claude account":

After

```md
beret, testers goggles, security agents a deep hood.

```

insert

```md
## Growth

Each project (the top of its git checkout, a linked worktree counting as
its main checkout) has a crew: the lead, and each subagent type, grow with
XP from real work. A finished turn earns 10, a build or test command that
passes 5 (`npm test`, `pytest`, `cargo build`, `go test`, `make`, `tsc`, …),
a subagent that finishes its run 3; failures cost nothing. Levels come at
100, 250, 500 and 1000 XP, then at each doubling, with a shower of the
world's confetti and `★N!` over the character; the agent card shows `★N`.
Levels unlock cosmetics in each world's style: a hat at ★2, a badge at ★3,
a plant, a steaming mug or a trophy by its favourite station at ★5, its
outfit in other colours at ★8 and a soft aura at ★10. The characters show
their meters too: drowsy eyes when their energy runs low, a bandage when
failures pile up, a happy bounce when their mood is high.

Crews are kept in `~/.config/animus/crews.json` (under `$XDG_CONFIG_HOME`
when set): for each project a hash of its path, and for each role its XP
and when it last earned any, nothing from a transcript. `--demo` uses a
throwaway crew.

```

- [ ] **Step 6: Run it to see it pass**

Run: `node --test test/world.test.ts`
Expected: PASS (59 tests).

- [ ] **Step 7: Typecheck, the full suite, commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` (expected: no output, exit 0) and `node --test "test/**/*.test.ts"` (expected: `ℹ tests 956`, `ℹ pass 956`, `ℹ fail 0`).

```bash
git add test/world.test.ts src/world/world.ts src/app.ts README.md
git commit -F - <<'EOF'
feat(world): crews grow from live and demo work, saved to crews.json

Each source's gains counted once into its crews; every agent carries
its role's level; a level-up is celebrated on every actor of the role,
not one read from before the start. The live crews are saved ten
seconds after a change and on the way out; the demo's are a throwaway.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 14: Check it in a real Ghostty

**Files:** none in the repo, unless something looks wrong. The probe and its harness live in the scratchpad: `S=$SCRATCH`.

The probe drives the real loop (World, ScenePlayer, Renderer) with the demo crew inside `ghostty --gtk-single-instance=false`. It writes `shot-<name>` markers, and the harness screenshots each one with `spectacle -b -n -a -o`. The demo crew starts fast-forwarded (`DEMO_XP`: atlas's crew has every unlock). The probe also runs the crew two minutes ahead, so the stations have favourites and the desk upgrades stand. It makes nova tired and hurt (its polled vitals) and atlas happy, and pops one level-up by hand (`stage.levelUp`), so the burst is on screen when the shot is taken. Only the demo crew is shown: no live session is read, and `crews.json` is not touched (the demo's crews are a throwaway).

- [ ] **Step 1: Put the probe and its harness in the scratchpad**

Both files were written there while planning and run against a scratch copy of this plan's code. If they are missing, create `$S/probe-growth.ts`:

```ts
// Growth in a real Ghostty: the real loop (World -> ScenePlayer -> Renderer)
// with the demo crew, writing ./shot-<name> markers for the harness
// (run-probe-growth.sh) to screenshot. Results to probe-growth.txt. The
// demo crew starts fast-forwarded (see DEMO_XP): atlas's crew wears every
// unlock, nova's is a turn short of ★4. The probe runs the crew two minutes
// ahead (so stations have favourites), makes nova tired and hurt and atlas
// happy, and pops one level-up by hand to catch it on screen.
import { rmSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
const R = process.env.ANIMUS_SRC ?? '<repo>/src';
const { ScenePlayer, together } = await import(`${R}/app.ts`);
const { encodeRgb } = await import(`${R}/art/png.ts`);
const { encodeRgba } = await import(`${R}/art/scene/front.ts`);
const { Screen } = await import(`${R}/term/screen.ts`);
const { Renderer } = await import(`${R}/term/renderer.ts`);
const { getTheme } = await import(`${R}/themes/index.ts`);
const { World } = await import(`${R}/world/world.ts`);
const { deleteImages } = await import(`${R}/term/kitty.ts`);
const DIR = new URL('.', import.meta.url).pathname;
const THEME = process.argv[2] ?? 'cafe';
const log: string[] = [];
const t0 = Date.now();
const note = (s: string) => log.push(`${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s ${s}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const out = process.stdout;

process.stdin.setRawMode(true);
process.stdin.resume();
let buf = '';
process.stdin.on('data', (d) => (buf += d.toString('latin1')));
out.write('\x1b[?1049h\x1b[?25l\x1b[2J\x1b[16t');
let cm: RegExpMatchArray | null = null;
for (let i = 0; i < 100 && !(cm = buf.match(/\x1b\[6;(\d+);(\d+)t/)); i++) await sleep(20);
const cols = out.columns;
const rows = out.rows;
const start = Date.now() - 120_000;
const theme = getTheme(THEME)!;
const world = new World({ theme, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true, view: 'scene' });
// Nova tired and hurt, atlas happy: their vitals as the demo polls them.
const demo = (world as any).demo;
const poll = demo.poll.bind(demo);
demo.poll = (now: number) =>
  poll(now).map((a: any) => {
    if (a.id === 'demo-nova') return { ...a, vitals: { ...a.vitals, busySince: now - 44 * 60_000, lastAt: now, midTool: true, errors: [now - 1000, now - 1000, now - 1000] } };
    if (a.id === 'demo-atlas') return { ...a, vitals: { ...a.vitals, streak: 20 } };
    return a;
  });
if (cm) world.setCell(+cm[2], +cm[1]);
world.resize(cols, rows);
const screen = new Screen(cols, rows);
const renderer = new Renderer('truecolor');
const bd = theme.backdrop;
const player = new ScenePlayer({ encode: (b: any, opaque: boolean) => (opaque ? encodeRgb(b, (bd[0] << 16) | (bd[1] << 8) | bd[2], 2) : encodeRgba(b, 2)) });
for (let t = start; t < Date.now(); t += 1000 / 18) world.tick(t);
note(`${cols}x${rows} cells, world ${THEME}`);
let stop = false;
const timer = setInterval(() => {
  if (stop) return;
  const t = performance.now();
  const now = Date.now();
  world.tick(now);
  const o = together(player.step(world, screen, now, t + 20), renderer.render(screen));
  if (o) out.write(o);
}, 1000 / 30);
const shot = async (name: string) => {
  writeFileSync(DIR + `shot-${name}`, '1');
  await sleep(1500);
  rmSync(DIR + `shot-${name}`, { force: true });
};
const fig = (id: string) => world.scene()?.figures.find((g: any) => g.id === id);
const select = async (id: string) => {
  for (let i = 0; i < 20 && world.selectedId !== id; i++) world.handleKey({ name: 'tab', ch: '\t', ctrl: false, shift: false } as any);
  await sleep(1500);
};

await sleep(2500);
const f = world.scene();
note(`trinkets: ${(f?.trinkets ?? []).map((t: any) => `${t.kind}`).join(', ') || 'none'}`);
note(`atlas wears: ${JSON.stringify(fig('demo-atlas')?.wear)}, feels: ${JSON.stringify(fig('demo-atlas')?.feel)}`);
note(`nova wears: ${JSON.stringify(fig('demo-nova')?.wear)}, feels: ${JSON.stringify(fig('demo-nova')?.feel)}`);
await shot('growth-room');
await select('demo-atlas');
note(`card: ${(screen.toText().match(/╭─ ★\d+ \S+/) ?? ['none'])[0]}`);
await shot('growth-atlas');
await select('demo-nova');
// Closer, for the face: two steps of zoom.
for (let i = 0; i < 2; i++) world.handleKey({ name: '+', ch: '+', ctrl: false, shift: false } as any);
await sleep(1500);
await shot('growth-nova');
(world as any).stage.levelUp('demo-nova', 5);
await sleep(500);
note(`mark: ${/★5!/.test(screen.toText())}`);
await shot('growth-levelup');
stop = true;
clearInterval(timer);
out.write(deleteImages() + '\x1b[?25h\x1b[?1049l');
writeFileSync(DIR + 'probe-growth.txt', log.join('\n') + '\n');
process.exit(0);
```

and `$S/run-probe-growth.sh` (then `chmod +x $S/run-probe-growth.sh`):

```bash
#!/bin/bash
# Runs probe-growth.ts (a world id, default cafe) in a fresh Ghostty window
# and screenshots each marked moment.
S=$(dirname "$0")
rm -f $S/probe-growth.txt $S/shot-*
(timeout 120 ghostty --gtk-single-instance=false --window-width=150 --window-height=46 -e node $S/probe-growth.ts ${1:-cafe} >$S/ghostty-growth.log 2>&1 &)
for name in growth-room growth-atlas growth-nova growth-levelup; do
  for i in $(seq 1 600); do [ -f $S/shot-$name ] && break; sleep 0.2; done
  sleep 0.5; spectacle -b -n -a -o $S/g-$name.png >/dev/null 2>&1
done
for i in $(seq 1 100); do [ -f $S/probe-growth.txt ] && break; sleep 0.3; done
cat $S/probe-growth.txt
```

- [ ] **Step 2: Run it**

Run: `$S/run-probe-growth.sh cafe`
Expected output (times and the order of the upgrades vary; `cafe` can be any world id):

```
   0.4s 131x34 cells, world cafe
   2.9s trinkets: trophy, mug, plant
   2.9s atlas wears: {"hat":true,"badge":true,"outfit":true,"aura":true}, feels: {"drowsy":false,"bandaged":false,"bouncy":true}
   2.9s nova wears: {"hat":true,"badge":true,"outfit":false,"aura":false}, feels: {"drowsy":true,"bandaged":true,"bouncy":true}
   5.9s card: ╭─ ★10 atlas
  12.5s mark: true
```

- [ ] **Step 3: Look at the screenshots**

Open `$S/g-growth-room.png`, `$S/g-growth-atlas.png`, `$S/g-growth-nova.png` and `$S/g-growth-levelup.png` with the Read tool. Crop with `magick <png> -crop WxH+X+Y +repage -scale 400% <out>.png` where the figures are small. Check each of these:
- **The room:** the crew wears hats in the world's style (beanies in the café). Some subagents have badges and swapped outfits. Desk upgrades (a plant, a mug on a stool, a trophy) stand on the floor beside stations, not inside a prop or floating.
- **The atlas close-up:** the card's top edge reads `★10 atlas · lead`. Atlas has a hat, a badge, a swapped outfit and a soft glow round it. It bounces now and then (compare two frames if in doubt).
- **The nova close-up (zoomed in twice):** nova has drowsy, half-shut eyes and a plaster on its cheek, and its card reads `★4` (or `★3`, if its first turn has not ended yet).
- **The level-up:** `★5!` in amber, bold, over nova's head and over any label there, with confetti and sparks round nova, who cheers. No emote hides the mark.
- **Everywhere:** nothing is clipped at a sprite's edge, the card's frame is intact, and nothing covers the roster or the footer.

Try one wizard world too (`$S/run-probe-growth.sh mines`): the grand hat, with a gold band and stars, must fit inside the sprite, even on a cheering hop.

- [ ] **Step 4: Fix what looks wrong**

For anything off in the screenshots, fix the art in `src/art/figure/*.ts` (or the placement in `src/world/stage.ts`) with a matching test. Rerun `node --test "test/**/*.test.ts"` and the typecheck, rerun the probe, and commit with a `fix(figure): …` or `fix(stage): …` message and the two trailers. When everything is right, there is nothing to commit for this task.

---

## Self-review notes

**Spec coverage (section 4, section 1's face states, and the task's list):**
- A crew per project, by git root, else the cwd; the demo a throwaway in-memory crew: Tasks 4, 6, 7 and 13. Agents kept by role and type: `roleOf`, Task 1.
- XP: +10 a finished turn, +5 a passing build or test (patterns: decision 2), +3 a finished subagent, errors nothing: Tasks 1, 2, 5, 6, 7.
- Levels at 100, 250, 500, 1000, then doubling: Task 1.
- A level-up bursts the world's confetti (the stage's own) and pops `★N!`: Tasks 11, 13. The card shows `★N`: Task 12.
- Unlocks in every world's style:
  - ★2 a hat from the costume set: Task 9.
  - ★3 a badge: Task 9.
  - ★5 a desk upgrade at the favourite station (plant, steaming mug, trophy; favourite = the station worked most): Tasks 10, 11.
  - ★8 an outfit colour swap: Task 9.
  - ★10 a soft aura: Task 9.
- Face states from real meters, part of the sprite key and cheap: drowsy (energy critical) and bandage (health critical) in Task 8; bounce (mood ≥ 0.8) in Tasks 8 (grin) and 10–11 (hop, drawn only).
- `crews.json` under `$XDG_CONFIG_HOME/animus/`, keyed by a hash of the project path, holding XP and the last-seen date only: Tasks 2, 3. Writes debounced: Tasks 3, 13. A corrupt file is moved aside (`crews.json.bad-<time>`) and a fresh one started: Tasks 3, 13. The frame loop is never blocked long (a tiny synchronous save, budgeted): Task 3.
- No XP twice across polls or restarts: decision 3, tested in Tasks 2 (re-reads, restart), 6 (a new source reading the same files) and 7 (the demo, deterministic).
- Tests asked for:
  - XP accounting from synthetic records: Tasks 2, 5, 6.
  - Level thresholds and the unlock table: Task 1.
  - `crews.json` load, save, corrupt file and debounce in temp dirs: Task 3.
  - Figure sprites with each cosmetic and face state for every world's costume: within bounds, distinct sprite keys, cached (Tasks 8, 9, 10).
  - The level-up burst and `★N!`: Tasks 11, 13. The card's `★N`: Task 12. The demo crew earning XP: Tasks 7, 13.
  - Budgets: the figure with every cosmetic (Task 9), a busy plate with growth (Task 10), the crews save (Task 3).
- Real Ghostty check with the demo crew (fast-forwarded), `spectacle -b -n -a -o`, probe-chat style: Task 14.
- Not in this part: `★N` in the dashboard view (the spec asks for the card); a saved favourite station (the spec keeps only XP and the date).

**Placeholder scan:** every code step has complete code, generated from the planning commits and checked to reproduce them byte for byte. Every run step has its exact command and expected output, including the failure seen at the commit before.

**Type and name consistency:**
- `Gain` (Task 2) is used in Tasks 5, 6, 7 and 13. `GainKind`, `POINTS`, `xpFor`, `levelOf`, `Unlocks`, `UNLOCKS`, `unlocks` and `roleOf` (Task 1) are used in Tasks 2, 6, 7, 11 and 13.
- `crewKey`, `Crews` (`count`, `xp`, `level`, `give`, `data`), `CrewBook`, `Award`, `MAX_CREWS` and `MAX_ROLES` (Task 2) are used in Tasks 3, 6, 7 and 13.
- `crewsPath`, `loadCrews`, `saveCrews`, `CrewStore` (`load`, `changed`, `tick`, `flush`, `writes`) and `SAVE_AFTER_MS` (Task 3) are used in Task 13. `projectRoot` (Task 4) is used in Task 6.
- `isCheck`, `GainReader` (`apply`, `take`) and `Found` (Task 5) are used in Tasks 6 and 7.
- `AgentInfo.crew` and `AgentSource.drainGains` (Task 6) are used in Tasks 7, 11 and 13. `DEMO_XP` (Task 7) is used in Task 13.
- `Feel`, `FigureFrame.feel` and `FigureFrame.hop` (Task 8) are used in Tasks 9, 10 and 11. `Wear` and `FigureFrame.wear` (Task 9) are used in Tasks 10 and 11.
- `Prize`, `PRIZES`, `GOLD`, `lookOf(tr, costume, wear)` and `star` (Task 9).
- `Trinket`, `TrinketFrame`, `MUG_TOP`, `SceneFrame.trinkets` and `trinketSprite` (Task 10) are used in Task 11.
- `AgentInfo.level`, `BOUNCY`, `feelOf`, `Stage.levelUp` and `Stage.burst` (Task 11) are used in Tasks 12 and 13.
- `WorldOpts.crews` and `World.saveCrews` (Task 13) are used in `app.ts` and in Task 14.
