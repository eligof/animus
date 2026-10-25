# Pet layer, part 1: vitals, meters and the agent card — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent carries real vitals from its transcript; the selected agent gets a floating card beside its character with pet-style meters (belly, energy, health, mood), plain facts and a cheer key.

**Architecture:** A `VitalsReader` folds transcript records into a `Vitals` snapshot that the Claude source attaches to each `AgentInfo` (the demo source simulates its own). `meters()` turns vitals into 0..1 meters with critical flags. `drawCard()` draws the card as terminal text over the scene; `World` places it beside the selected figure and routes `i` (card on/off) and `c` (cheer).

**Tech Stack:** TypeScript on Node 26 (runs .ts directly), `node:test`, no dependencies. Spec: `docs/superpowers/specs/2026-10-25-pet-layer-design.md` (sections 1 and 2).

**Conventions (read before starting):**
- Worktree: `<repo>`. Run commands from there.
- Tests: `node --test test/<file>.test.ts`; full suite `node --test "test/**/*.test.ts"`.
- Typecheck: `node node_modules/typescript/bin/tsc -p tsconfig.json` (node_modules is a symlink to a scratch install; leave it).
- Style: 2-space indent, single quotes, comments that say why in plain English like the surrounding code; no new dependencies.
- Commit messages end with the two trailer lines used in this repo:
- Card text uses plain words for the meters (no emoji): emoji are double width in some terminals and would break the frame.

## File map

| File | What it does |
|---|---|
| `src/agents.ts` (modify) | `Vitals` type; `AgentInfo.vitals?` |
| `src/claude/vitals.ts` (new) | `VitalsReader`: transcript records → `Vitals` |
| `src/claude/source.ts` (modify) | keep a `VitalsReader` per tracked transcript; attach snapshots |
| `src/demo/source.ts` (modify) | simulated vitals for the demo crew |
| `src/pet/meters.ts` (new) | `meters(vitals, now)` → belly, energy, health, mood |
| `src/ui/card.ts` (new) | `placeCard`, `drawCard`, `modelName`, `tokens` |
| `src/world/stage.ts` (modify) | `cheer(id)` |
| `src/world/world.ts` (modify) | card state, drawing, `i` / `c` keys |
| `src/ui/overlays.ts` (modify) | help lines for `i` and `c` |
| `test/vitals.test.ts`, `test/meters.test.ts`, `test/card.test.ts` (new); `test/source.test.ts`, `test/demo.test.ts`, `test/world.test.ts` (extend) | tests |

---

### Task 1: The `Vitals` type and `VitalsReader`

**Files:**
- Modify: `src/agents.ts` (the `AgentInfo` type at the top)
- Create: `src/claude/vitals.ts`
- Test: `test/vitals.test.ts`

- [ ] **Step 1: Add the type to `src/agents.ts`**

Insert above `export type AgentInfo = {`:

```ts
// What the pet card shows about an agent beyond its activity, kept from
// its transcript (see claude/vitals.ts; the demo simulates its own).
export type Vitals = {
  model: string; // e.g. 'claude-opus-5-5'; '' until the first reply
  window: number; // its context window, tokens
  context: number; // tokens in context as of the latest reply
  outTokens: number; // output tokens over what was read of the transcript
  errors: number[]; // times (ms) of failures in the last 10 minutes, oldest first
  streak: number; // tool calls in a row without an error
  turnEndedAt: number; // when the latest turn ended (0: none yet)
  busySince: number; // start of the current working stretch (0: none)
  lastAt: number; // time of the latest record (0: none)
  title: string; // the session's AI title ('' if none)
  branch: string; // git branch ('' if unknown)
};
```

and add a field at the end of `AgentInfo` (after `lastSeen: number;`):

```ts
  vitals?: Vitals;
```

- [ ] **Step 2: Write the failing test `test/vitals.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VitalsReader } from '../src/claude/vitals.ts';

const T0 = Date.UTC(2026, 9, 25, 10, 0, 0);
const at = (s: number) => new Date(T0 + s * 1000).toISOString();
const reply = (s: number, o: { id?: string; model?: string; input?: number; read?: number; made?: number; out?: number; stop?: string; extra?: object } = {}) => ({
  type: 'assistant',
  timestamp: at(s),
  ...o.extra,
  message: {
    id: o.id ?? `m${s}`,
    model: o.model ?? 'claude-opus-5-5',
    stop_reason: o.stop ?? null,
    usage: { input_tokens: o.input ?? 10, cache_read_input_tokens: o.read ?? 0, cache_creation_input_tokens: o.made ?? 0, output_tokens: o.out ?? 5 },
    content: [{ type: 'text', text: 'hi' }],
  },
});
const result = (s: number, isError = false) => ({ type: 'user', timestamp: at(s), message: { content: [{ type: 'tool_result', tool_use_id: 'x', is_error: isError }] } });

test('the latest reply sets the model and how full the context is', () => {
  const r = new VitalsReader();
  r.apply(reply(1, { input: 100, read: 40_000, made: 2_000 }));
  r.apply(reply(2, { model: 'claude-sonnet-5-5', input: 50, read: 60_000, made: 0 }));
  const v = r.snapshot(T0 + 3000);
  assert.equal(v.model, 'claude-sonnet-5-5');
  assert.equal(v.context, 60_050);
  assert.equal(v.window, 200_000);
});

test('a 1M model or a context past 200k means the 1M window', () => {
  const a = new VitalsReader();
  a.apply(reply(1, { extra: { requestedModel: 'claude-opus-5-5[1m]' } }));
  assert.equal(a.snapshot(T0).window, 1_000_000);
  const b = new VitalsReader();
  b.apply(reply(1, { read: 250_000 }));
  assert.equal(b.snapshot(T0).window, 1_000_000);
});

test('output is counted once per message, though every block repeats it', () => {
  const r = new VitalsReader();
  r.apply(reply(1, { id: 'A', out: 300 }));
  r.apply(reply(1, { id: 'A', out: 300 }));
  r.apply(reply(2, { id: 'B', out: 200 }));
  assert.equal(r.snapshot(T0 + 3000).outTokens, 500);
});

test('good tool results build a streak; a failure resets it and is remembered for ten minutes', () => {
  const r = new VitalsReader();
  r.apply(result(1));
  r.apply(result(2));
  r.apply(result(3));
  assert.equal(r.snapshot(T0 + 4000).streak, 3);
  r.apply(result(4, true));
  r.apply(reply(5, { extra: { isApiErrorMessage: true } }));
  const v = r.snapshot(T0 + 6000);
  assert.equal(v.streak, 0);
  assert.deepEqual(v.errors, [T0 + 4000, T0 + 5000]);
  assert.deepEqual(r.snapshot(T0 + 4000 + 600_001).errors, [T0 + 5000]);
});

test('the end of a turn, the working stretch, the title and the branch', () => {
  const r = new VitalsReader();
  r.apply({ type: 'user', timestamp: at(0), gitBranch: 'feat/cart', message: { content: 'go' } });
  r.apply(reply(10, { stop: 'end_turn' }));
  r.apply({ type: 'ai-title', aiTitle: 'Fix the cart total' });
  let v = r.snapshot(T0 + 20_000);
  assert.equal(v.turnEndedAt, T0 + 10_000);
  assert.equal(v.busySince, T0);
  assert.equal(v.title, 'Fix the cart total');
  assert.equal(v.branch, 'feat/cart');
  // Two quiet minutes start a new working stretch.
  r.apply(reply(200));
  v = r.snapshot(T0 + 201_000);
  assert.equal(v.busySince, T0 + 200_000);
  assert.equal(v.lastAt, T0 + 200_000);
});

test('records it cannot read leave it as it was', () => {
  const r = new VitalsReader();
  for (const rec of [null, 42, 'x', {}, { type: 'assistant' }, { type: 'assistant', message: { usage: 'nope' } }]) r.apply(rec);
  const v = r.snapshot(T0);
  assert.equal(v.model, '');
  assert.equal(v.context, 0);
  assert.equal(v.outTokens, 0);
});

test('a snapshot is a copy', () => {
  const r = new VitalsReader();
  r.apply(result(1, true));
  const v = r.snapshot(T0 + 2000);
  v.errors.push(1);
  assert.equal(r.snapshot(T0 + 2000).errors.length, 1);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test test/vitals.test.ts`
Expected: FAIL — `Cannot find module '../src/claude/vitals.ts'`.

- [ ] **Step 4: Write `src/claude/vitals.ts`**

```ts
import type { Vitals } from '../agents.ts';

// The pet card's facts about an agent, folded from its transcript records
// as the source reads them (see source.ts): the model and how full its
// context is, output so far, recent failures, the run of good tool calls,
// the current working stretch, the session's title and git branch.

const SMALL_WINDOW = 200_000;
const BIG_WINDOW = 1_000_000;
// Failures are remembered this long (the health meter heals over it).
const ERROR_SPAN = 600_000;
// A quiet gap this long ends a working stretch.
const IDLE_GAP = 120_000;
// Message ids remembered so repeated usage is counted once; past this the
// set is cleared (an old message never comes back, so at worst the current
// one is counted twice).
const MAX_COUNTED = 5000;

type Usage = { input_tokens?: unknown; cache_read_input_tokens?: unknown; cache_creation_input_tokens?: unknown; output_tokens?: unknown };
type Rec = {
  type?: string;
  timestamp?: string;
  isMeta?: boolean;
  requestedModel?: unknown;
  aiTitle?: unknown;
  gitBranch?: unknown;
  isApiErrorMessage?: boolean;
  message?: { id?: unknown; model?: unknown; usage?: unknown; stop_reason?: unknown; content?: unknown };
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export class VitalsReader {
  private v: Vitals = {
    model: '',
    window: SMALL_WINDOW,
    context: 0,
    outTokens: 0,
    errors: [],
    streak: 0,
    turnEndedAt: 0,
    busySince: 0,
    lastAt: 0,
    title: '',
    branch: '',
  };
  private counted = new Set<string>();

  apply(rec: unknown): void {
    if (!rec || typeof rec !== 'object') return;
    const r = rec as Rec;
    const v = this.v;
    const t = Date.parse(r.timestamp ?? '');
    const timed = Number.isFinite(t);
    if (r.type === 'ai-title' && typeof r.aiTitle === 'string') v.title = r.aiTitle;
    if (typeof r.gitBranch === 'string' && r.gitBranch) v.branch = r.gitBranch;
    if (typeof r.requestedModel === 'string' && r.requestedModel.endsWith('[1m]')) v.window = BIG_WINDOW;
    if (timed && (r.type === 'assistant' || r.type === 'user')) {
      if (!v.busySince || t - v.lastAt >= IDLE_GAP) v.busySince = t;
      v.lastAt = Math.max(v.lastAt, t);
    }
    if (r.isMeta) return;
    const m = r.message;
    if (r.type === 'assistant' && m && typeof m === 'object') {
      if (typeof m.model === 'string' && m.model && m.model !== '<synthetic>') v.model = m.model;
      if (m.usage && typeof m.usage === 'object') {
        const u = m.usage as Usage;
        const ctx = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
        if (ctx > 0) v.context = ctx;
        if (ctx > SMALL_WINDOW) v.window = BIG_WINDOW;
        const id = typeof m.id === 'string' ? m.id : '';
        if (!id || !this.counted.has(id)) {
          if (this.counted.size >= MAX_COUNTED) this.counted.clear();
          if (id) this.counted.add(id);
          v.outTokens += num(u.output_tokens);
        }
      }
      if (r.isApiErrorMessage && timed) this.fail(t);
      if (m.stop_reason === 'end_turn' && timed) v.turnEndedAt = t;
      return;
    }
    if (r.type === 'user' && m && Array.isArray(m.content)) {
      for (const b of m.content as Array<{ type?: unknown; is_error?: unknown }>) {
        if (b?.type !== 'tool_result') continue;
        if (b.is_error === true) {
          if (timed) this.fail(t);
        } else v.streak++;
      }
    }
  }

  // A copy for an AgentInfo, failures older than ERROR_SPAN dropped.
  snapshot(now: number): Vitals {
    this.v.errors = this.v.errors.filter((e) => now - e <= ERROR_SPAN);
    return { ...this.v, errors: [...this.v.errors] };
  }

  private fail(t: number): void {
    this.v.streak = 0;
    this.v.errors.push(t);
    if (this.v.errors.length > 50) this.v.errors.splice(0, this.v.errors.length - 50);
  }
}
```

- [ ] **Step 5: Run the test to see it pass**

Run: `node --test test/vitals.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` — expected: no output, exit 0.

```bash
git add src/agents.ts src/claude/vitals.ts test/vitals.test.ts
git commit -F - <<'EOF'
feat(vitals): keep an agent's vitals from its transcript

The model and how full its context is, output so far, recent failures,
the run of good tool calls, the working stretch, the session's title and
git branch, for the pet card to show.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 2: The Claude source attaches vitals

**Files:**
- Modify: `src/claude/source.ts` (the `Tracked` type, `track()`, the lead in `scan()`, the info in `subagents()`)
- Test: `test/source.test.ts` (append)

- [ ] **Step 1: Write the failing test** — append to `test/source.test.ts`:

```ts
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
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test --test-name-pattern="carry vitals" test/source.test.ts`
Expected: FAIL — `l.vitals` is undefined.

- [ ] **Step 3: Implement in `src/claude/source.ts`**

Add the import next to the transcript imports:

```ts
import { VitalsReader } from './vitals.ts';
```

In the `Tracked` type, after `state: TranscriptState;` add:

```ts
  vitals: VitalsReader;
```

In `track()`, replace the creation line

```ts
      t = { tail: new TranscriptTail(path), state: initialState(now), results: new Set(), notified: new Map() };
```

with

```ts
      t = { tail: new TranscriptTail(path), state: initialState(now), vitals: new VitalsReader(), results: new Set(), notified: new Map() };
```

and inside the record loop, after `applyRecord(t.state, rec);` add:

```ts
        t.vitals.apply(rec);
```

In `scan()`, replace

```ts
        const st = this.track(s.sessionId, path, now, true).state;
```

with

```ts
        const t = this.track(s.sessionId, path, now, true);
        const st = t.state;
        lead.vitals = t.vitals.snapshot(now);
```

In `subagents()`, in the `const info: AgentInfo = { ... }` literal, after `lastSeen: Math.max(st.lastSeen, m),` add:

```ts
        vitals: t.vitals.snapshot(now),
```

- [ ] **Step 4: Run the source tests**

Run: `node --test test/source.test.ts`
Expected: PASS (all, including the new one).

- [ ] **Step 5: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` — expected: exit 0.

```bash
git add src/claude/source.ts test/source.test.ts
git commit -F - <<'EOF'
feat(source): live agents carry their vitals

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 3: The demo crew simulates vitals

**Files:**
- Modify: `src/demo/source.ts`
- Test: `test/demo.test.ts` (append)

The demo's existing random sequence must not change (screenshots and other tests depend on it), so vitals use their own `Rng`.

- [ ] **Step 1: Write the failing test** — append to `test/demo.test.ts` (it already imports `test`, `assert` and `DemoSource`; if not, add `import { DemoSource } from '../src/demo/source.ts';`):

```ts
test('the demo crew carries believable vitals', () => {
  const start = 1_700_000_000_000;
  const src = new DemoSource(7, start);
  let agents = src.poll(start);
  for (let t = start; t <= start + 120_000; t += 250) agents = src.poll(t);
  assert.ok(agents.length >= 2);
  for (const a of agents) {
    const v = a.vitals!;
    assert.ok(v, `${a.name} has no vitals`);
    assert.match(v.model, /^claude-(opus|sonnet)-5-5$/);
    assert.ok(v.context > 0 && v.context <= v.window, `${a.name} context ${v.context}`);
    assert.ok(v.outTokens > 0);
    assert.ok(v.busySince > 0 && v.busySince <= start + 120_000);
    if (a.role === 'lead') assert.ok(v.title && v.branch);
  }
});

test('the demo stays deterministic with vitals', () => {
  const start = 1_700_000_000_000;
  const a = new DemoSource(7, start);
  const b = new DemoSource(7, start);
  for (let t = start; t <= start + 60_000; t += 500) {
    const x = a.poll(t).map(({ vitals, ...rest }) => rest);
    const y = b.poll(t).map(({ vitals, ...rest }) => rest);
    assert.deepEqual(x, y);
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test --test-name-pattern="believable vitals" test/demo.test.ts`
Expected: FAIL — `has no vitals`.

- [ ] **Step 3: Implement in `src/demo/source.ts`**

Change the type import at the top to include `Vitals`:

```ts
import type { Activity, AgentEvent, AgentInfo, AgentSource, Vitals } from '../agents.ts';
```

Below `const MAX_SUBS = 7;` add:

```ts
const TITLES = ['Fix the tokenizer edge case', 'Add dark mode to settings', 'Speed up the test suite', 'Ship the checkout flow', 'Tidy the auth module'];
const BRANCHES = ['main', 'feat/checkout', 'fix/tokenizer', 'perf/tests', 'chore/auth'];
const WINDOW = 200_000;
const TOOLS: ReadonlySet<Activity> = new Set(['write', 'read', 'search', 'run', 'web']);
```

Extend the `Sim` type with a `vitals` field:

```ts
type Sim = { info: AgentInfo; next: number; endsAt: number; doneUntil: number; nextSpawn: number; idleAt: number; subType?: number; vitals: Vitals };
```

Add a second Rng to the class fields (after `private rng: Rng;`):

```ts
  // Vitals draw from their own stream so the crew's moves stay as they were.
  private vrng: Rng;
```

and in the constructor, before the `this.lead(...)` calls:

```ts
    this.vrng = new Rng(seed * 7919 + 1);
```

Add this method to the class:

```ts
  // A fresh agent's vitals: some way into a working stretch already, so
  // the crew's energy differs from the start.
  private born(lead: boolean, now: number): Vitals {
    const r = this.vrng;
    return {
      model: lead ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
      window: WINDOW,
      context: Math.round(r.range(15_000, 60_000)),
      outTokens: Math.round(r.range(500, 4_000)),
      errors: [],
      streak: r.int(0, 6),
      turnEndedAt: 0,
      busySince: now - Math.round(r.range(0, 40 * 60_000)),
      lastAt: now,
      title: lead ? TITLES[r.int(0, TITLES.length - 1)] : '',
      branch: lead ? BRANCHES[r.int(0, BRANCHES.length - 1)] : '',
    };
  }
```

In `lead(...)`, add `vitals: this.born(true, now),` to the pushed sim object (next to `idleAt`). In `spawn(...)`, add `vitals: this.born(false, now),` to the pushed sim object (next to `subType: ti`), and set the subagent's title from its name right after the push:

```ts
    const sim = this.sims[this.sims.length - 1];
    sim.vitals.title = sim.info.name;
```

Replace `change()` with:

```ts
  private change(s: Sim, activity: Activity, now: number): void {
    const was = s.info.activity;
    s.info.activity = activity;
    s.info.detail = this.rng.pick(DETAILS[activity]);
    s.info.since = now;
    const v = s.vitals;
    const r = this.vrng;
    v.lastAt = now;
    v.outTokens += Math.round(r.range(200, 1_500));
    // Context fills as it works; near full, it compacts back down.
    v.context += Math.round(r.range(2_000, 9_000));
    if (v.context > WINDOW * 0.95) v.context = Math.round(r.range(20_000, 35_000));
    if (activity === 'error') {
      v.streak = 0;
      v.errors.push(now);
    } else if (TOOLS.has(activity)) v.streak++;
    v.errors = v.errors.filter((e) => now - e <= 600_000);
    if (activity === 'idle' || activity === 'done') v.turnEndedAt = now;
    if (was === 'idle' && activity !== 'idle') v.busySince = now;
  }
```

In `poll()`, replace the list line with:

```ts
    const list = this.sims.map((s) => ({ ...s.info, vitals: { ...s.vitals, errors: [...s.vitals.errors] } }));
```

- [ ] **Step 4: Run the demo tests and the world tests**

Run: `node --test test/demo.test.ts test/world.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` — expected: exit 0.

```bash
git add src/demo/source.ts test/demo.test.ts
git commit -F - <<'EOF'
feat(demo): the demo crew carries believable vitals

From their own random stream, so the crew moves as it did.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 4: Meters

**Files:**
- Create: `src/pet/meters.ts`
- Test: `test/meters.test.ts`

- [ ] **Step 1: Write the failing test `test/meters.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Vitals } from '../src/agents.ts';
import { meters } from '../src/pet/meters.ts';

const NOW = 1_700_000_000_000;
const MIN = 60_000;
const vitals = (o: Partial<Vitals> = {}): Vitals => ({
  model: 'claude-opus-5-5', window: 200_000, context: 0, outTokens: 0, errors: [], streak: 0, turnEndedAt: 0, busySince: NOW, lastAt: NOW, title: '', branch: '', ...o,
});
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} vs ${b}`);

test('belly is the context used over the window, critical from 90%', () => {
  near(meters(vitals({ context: 50_000 }), NOW).belly.value, 0.25);
  assert.equal(meters(vitals({ context: 179_000 }), NOW).belly.critical, false);
  assert.equal(meters(vitals({ context: 180_000 }), NOW).belly.critical, true);
  near(meters(vitals({ context: 900_000 }), NOW).belly.value, 1);
});

test('energy drains over 45 minutes of work and is full after two quiet minutes', () => {
  near(meters(vitals({ busySince: NOW, lastAt: NOW }), NOW).energy.value, 1);
  near(meters(vitals({ busySince: NOW - 9 * MIN, lastAt: NOW }), NOW).energy.value, 0.8);
  const tired = meters(vitals({ busySince: NOW - 40 * MIN, lastAt: NOW }), NOW).energy;
  assert.ok(tired.value < 0.15 && tired.critical);
  near(meters(vitals({ busySince: NOW - 40 * MIN, lastAt: NOW - 2 * MIN }), NOW).energy.value, 1);
});

test('each recent failure hurts, and the hurt heals over ten minutes', () => {
  near(meters(vitals(), NOW).health.value, 1);
  near(meters(vitals({ errors: [NOW] }), NOW).health.value, 0.75);
  near(meters(vitals({ errors: [NOW - 5 * MIN] }), NOW).health.value, 0.875);
  const hurt = meters(vitals({ errors: [NOW, NOW, NOW] }), NOW).health;
  assert.ok(hurt.value <= 0.3 && hurt.critical);
  near(meters(vitals({ errors: [NOW - 11 * MIN] }), NOW).health.value, 1);
});

test('mood rises with the streak and after a finished turn', () => {
  near(meters(vitals({ streak: 0 }), NOW).mood.value, 0.3);
  near(meters(vitals({ streak: 4 }), NOW).mood.value, 0.5);
  near(meters(vitals({ streak: 0, turnEndedAt: NOW }), NOW).mood.value, 0.5);
  near(meters(vitals({ streak: 30 }), NOW).mood.value, 1);
  assert.equal(meters(vitals({ streak: 7 }), NOW).streak, 7);
  assert.equal(meters(vitals(), NOW).mood.critical, false);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/meters.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/pet/meters.ts`**

```ts
import type { Vitals } from '../agents.ts';

// An agent's vitals as a pet's needs, each 0..1 with a critical flag:
//   belly   how full its context is (full: time to compact)
//   energy  drains over a long working stretch, full after a short rest
//   health  each recent failure hurts; the hurt heals over ten minutes
//   mood    a run of good tool calls, and a lift when a turn finishes

export type Meter = { value: number; critical: boolean };
export type Meters = { belly: Meter; energy: Meter; health: Meter; mood: Meter; streak: number };

const REST = 120_000; // quiet this long: rested
const WORK_SPAN = 45 * 60_000; // working this long without a rest: empty
const HEAL_SPAN = 600_000;
const HIT = 0.25; // what one fresh failure costs
const LIFT = 0.2; // a finished turn's lift, fading over LIFT_SPAN
const LIFT_SPAN = 300_000;

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export function meters(v: Vitals, now: number): Meters {
  const belly = clamp(v.window > 0 ? v.context / v.window : 0);
  const rested = !v.lastAt || now - v.lastAt >= REST;
  const energy = rested ? 1 : clamp(1 - (now - v.busySince) / WORK_SPAN);
  let hurt = 0;
  for (const t of v.errors) {
    const age = now - t;
    if (age >= 0 && age < HEAL_SPAN) hurt += HIT * (1 - age / HEAL_SPAN);
  }
  const health = clamp(1 - hurt);
  const since = now - v.turnEndedAt;
  const lift = v.turnEndedAt && since >= 0 && since < LIFT_SPAN ? LIFT * (1 - since / LIFT_SPAN) : 0;
  const mood = clamp(0.3 + 0.05 * v.streak + lift);
  return {
    belly: { value: belly, critical: belly >= 0.9 },
    energy: { value: energy, critical: energy <= 0.15 },
    health: { value: health, critical: health <= 0.3 },
    mood: { value: mood, critical: false },
    streak: v.streak,
  };
}
```

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/meters.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` — expected: exit 0.

```bash
git add src/pet/meters.ts test/meters.test.ts
git commit -F - <<'EOF'
feat(pet): an agent's vitals as a pet's needs

Belly from the context window, energy over the working stretch, health
from recent failures, mood from the tool streak and finished turns.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 5: The card

**Files:**
- Create: `src/ui/card.ts`
- Test: `test/card.test.ts`

- [ ] **Step 1: Write the failing test `test/card.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentInfo, Vitals } from '../src/agents.ts';
import { meters } from '../src/pet/meters.ts';
import { DEFAULT, Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import { CARD_H, CARD_W, drawCard, modelName, placeCard, tokens } from '../src/ui/card.ts';
import type { CardOpts } from '../src/ui/card.ts';

const NOW = 1_700_000_000_000;
const SCENE = { x: 0, y: 1, w: 100, h: 30 };
const pal = getTheme('cafe')!.palette;
const vitals: Vitals = { model: 'claude-opus-5-5', window: 200_000, context: 156_000, outTokens: 182_400, errors: [], streak: 12, turnEndedAt: 0, busySince: NOW - 9 * 60_000, lastAt: NOW, title: 'Fix the tokenizer edge case', branch: 'main' };
const info = (o: Partial<AgentInfo> = {}): AgentInfo => ({ id: 'n', name: 'nova', role: 'lead', project: 'p', activity: 'write', detail: 'Edit src/parser.ts', since: NOW - 252_000, lastSeen: NOW, vitals, ...o });
const opts = (o: Partial<CardOpts> = {}): CardOpts => ({ info: info(), meters: meters(vitals, NOW), subs: 3, color: [120, 200, 255], palette: pal, now: NOW, ...o });

test('model names and token counts read short', () => {
  assert.equal(modelName('claude-opus-5-5'), 'opus 5.5');
  assert.equal(modelName('claude-haiku-4-5-20251001'), 'haiku 4.5');
  assert.equal(modelName('some-model'), 'some-model');
  assert.equal(tokens(950), '950');
  assert.equal(tokens(182_400), '182k');
  assert.equal(tokens(1_250_000), '1.3M');
});

test('the card sits beside its character, on the side with room, inside the scene', () => {
  assert.deepEqual(placeCard(SCENE, [20, 12]), { x: 23, y: 8 });
  // Near the right edge it goes to the left.
  assert.deepEqual(placeCard(SCENE, [80, 12]), { x: 80 - 3 - CARD_W, y: 8 });
  // Never above or below the scene.
  assert.equal(placeCard(SCENE, [20, 1]).y, SCENE.y);
  assert.equal(placeCard(SCENE, [20, 29]).y, SCENE.y + SCENE.h - CARD_H);
  // No character in view, or a small scene: docked in the bottom-right corner.
  assert.deepEqual(placeCard(SCENE, null), { x: SCENE.x + SCENE.w - CARD_W - 1, y: SCENE.y + SCENE.h - CARD_H - 1 });
  assert.deepEqual(placeCard({ x: 0, y: 1, w: 50, h: 12 }, [10, 5]), { x: 0 + 50 - CARD_W - 1, y: 1 + 12 - CARD_H - 1 });
});

test('the card shows the agent, its meters and the facts', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), [20, 12]);
  const text = s.toText();
  for (const want of ['nova · lead', '4m', 'Edit src/parser.ts', '"Fix the tokenizer edge case"', 'main', 'belly', '78%', 'energy', 'health', 'mood', '▲12', 'opus 5.5', '182k out', '3 subagents', '[c]heer', '[i] hide']) {
    assert.ok(text.includes(want), `missing "${want}" in\n${text}`);
  }
  // The card sets a background, so the scene's image does not show through.
  const { x, y } = placeCard(SCENE, [20, 12]);
  assert.notEqual(s.bg[y * 100 + x + 5], DEFAULT);
});

test('without vitals the card says so instead of showing meters', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts({ info: info({ vitals: undefined }), meters: null }), [20, 12]);
  const text = s.toText();
  assert.ok(text.includes('no vitals yet'));
  assert.ok(!text.includes('belly'));
});

test('meters colour by level; a critical one pulses in the bad colour', () => {
  const { x, y } = placeCard(SCENE, [20, 12]);
  const row = y + 3; // the belly row
  const bar = x + 10; // its first bar cell
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), [20, 12]);
  assert.deepEqual(s.fgAt(bar, row), pal.warn, '78% full: amber');
  const full: Vitals = { ...vitals, context: 195_000 };
  const s2 = new Screen(100, 32);
  // Even half-seconds show the bad colour, odd ones dim: a gentle pulse.
  drawCard(s2, SCENE, opts({ meters: meters(full, NOW), now: 1_000 }), [20, 12]);
  assert.deepEqual(s2.fgAt(bar, row), pal.bad);
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/card.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `src/ui/card.ts`**

```ts
import type { AgentInfo } from '../agents.ts';
import type { Meter, Meters } from '../pet/meters.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import type { Palette } from '../themes/types.ts';
import { activityGlyph, elapsed } from './chrome.ts';

// The selected agent's card: terminal text over the scene beside its
// character (like the labels, crisp at any zoom), with its pet meters and
// plain facts. Meters are words, not emoji: emoji are double width in some
// terminals and would break the frame.
//
//   ╭─ nova · lead ─────────────────────── 4m ─╮
//   │ ✎ Edit src/parser.ts                     │
//   │ "Fix the tokenizer edge case"       main │
//   │ belly   ████████░░  78%                  │
//   │ energy  ████████░░  80%                  │
//   │ health  ██████████   ok   mood ▲12       │
//   │ opus 5.5 · 182k out · 3 subagents        │
//   ╰─ [c]heer  [tab] next  [i] hide  [esc] ───╯

export const CARD_W = 44;
export const CARD_H = 8;
const GAP = 3; // cells between the character and the card
const BAR = 10;

export type CardOpts = {
  info: AgentInfo;
  meters: Meters | null;
  subs: number; // its live subagents
  color: RGB; // the agent's own colour
  palette: Palette;
  now: number;
};

// 'claude-opus-5-5' → 'opus 5.5' (a date suffix dropped); anything else as is.
export function modelName(m: string): string {
  const k = /^claude-([a-z]+)-(\d+)-(\d+)/.exec(m);
  return k ? `${k[1]} ${k[2]}.${k[3]}` : m;
}

export function tokens(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

// Where the card goes for a character whose head is at cell `at`: to its
// right, or its left when the right has no room, centred on it and kept
// inside the scene; docked in the bottom-right corner when there is no
// character in view or the scene is too small to float in.
export function placeCard(scene: Rect, at: [number, number] | null): { x: number; y: number } {
  const dock = { x: scene.x + scene.w - CARD_W - 1, y: scene.y + scene.h - CARD_H - 1 };
  if (!at || scene.w < 60 || scene.h < 14) return dock;
  const [col, row] = at;
  let x = col + GAP;
  if (x + CARD_W > scene.x + scene.w) x = col - GAP - CARD_W;
  x = Math.max(scene.x, Math.min(scene.x + scene.w - CARD_W, x));
  const y = Math.max(scene.y, Math.min(scene.y + scene.h - CARD_H, row - Math.floor(CARD_H / 2)));
  return { x, y };
}

// A meter's colour: good, warn or bad by level (`fill` meters, like the
// belly, are bad when high); a critical one pulses between bad and dim.
function shade(m: Meter, fill: boolean, p: Palette, now: number): RGB {
  if (m.critical) return Math.floor(now / 500) % 2 === 0 ? p.bad : p.dim;
  const v = fill ? 1 - m.value : m.value;
  return v > 0.5 ? p.good : v > 0.2 ? p.warn : p.bad;
}

export function drawCard(s: Screen, scene: Rect, o: CardOpts, at: [number, number] | null): void {
  const p = o.palette;
  const { x, y } = placeCard(scene, at);
  const bg = p.panel;
  const ink = p.panelText;
  const edge = p.border;
  const right = x + CARD_W - 1;
  for (let j = 0; j < CARD_H; j++) s.fill({ x, y: y + j, w: CARD_W, h: 1 }, ' ', ink, bg);
  // The frame.
  for (let i = 1; i < CARD_W - 1; i++) {
    s.put(x + i, y, '─', edge, bg);
    s.put(x + i, y + CARD_H - 1, '─', edge, bg);
  }
  for (let j = 1; j < CARD_H - 1; j++) {
    s.put(x, y + j, '│', edge, bg);
    s.put(right, y + j, '│', edge, bg);
  }
  s.put(x, y, '╭', edge, bg);
  s.put(right, y, '╮', edge, bg);
  s.put(x, y + CARD_H - 1, '╰', edge, bg);
  s.put(right, y + CARD_H - 1, '╯', edge, bg);
  const a = o.info;
  // Top edge: the name in its colour, the role, the time on this activity.
  const time = ` ${elapsed(o.now - a.since)} `;
  const timeX = right - 1 - [...time].length;
  s.put(x + 2, y, ' ', ink, bg);
  const nx = s.text(x + 3, y, a.name, o.color, bg, BOLD, timeX - 12);
  s.text(nx, y, ` · ${a.role} `, p.dim, bg, 0, timeX - 1);
  s.text(timeX, y, time, p.dim, bg);
  // The activity, then the session's title and branch.
  const gx = s.text(x + 2, y + 1, `${activityGlyph(a.activity)} `, o.color, bg);
  s.text(gx, y + 1, a.detail, ink, bg, 0, right - 1);
  const v = a.vitals;
  const branchX = v?.branch ? right - 1 - [...v.branch].length : right - 1;
  if (v?.title) s.text(x + 2, y + 2, `"${v.title}"`, ink, bg, 0, branchX - 1);
  if (v?.branch) s.text(branchX, y + 2, v.branch, p.dim, bg, 0, right - 1);
  const m = o.meters;
  if (!m || !v) {
    s.text(x + 2, y + 4, 'no vitals yet (no transcript read)', p.dim, bg, 0, right - 1);
  } else {
    const row = (j: number, label: string, mt: Meter, fill: boolean, value: string) => {
      s.text(x + 2, y + j, label, ink, bg);
      const n = Math.round(mt.value * BAR);
      const c = shade(mt, fill, p, o.now);
      for (let i = 0; i < BAR; i++) s.put(x + 10 + i, y + j, i < n ? '█' : '░', i < n ? c : p.dim, bg);
      s.text(x + 22, y + j, value, c, bg);
    };
    const pct = (mt: Meter) => `${Math.round(mt.value * 100)}%`.padStart(4);
    row(3, 'belly', m.belly, true, pct(m.belly));
    row(4, 'energy', m.energy, false, pct(m.energy));
    row(5, 'health', m.health, false, m.health.value >= 0.99 ? '  ok' : pct(m.health));
    s.text(x + 28, y + 5, 'mood', ink, bg);
    s.text(x + 33, y + 5, `${m.mood.value >= 0.5 ? '▲' : '▼'}${m.streak}`, shade(m.mood, false, p, o.now), bg, 0, right - 1);
    const facts = [modelName(v.model) || 'model ?', `${tokens(v.outTokens)} out`, o.subs ? `${o.subs} subagent${o.subs === 1 ? '' : 's'}` : ''].filter(Boolean).join(' · ');
    s.text(x + 2, y + 6, facts, p.dim, bg, 0, right - 1);
  }
  // Bottom edge: the keys.
  s.text(x + 2, y + CARD_H - 1, ' [c]heer  [tab] next  [i] hide  [esc] ', p.dim, bg, 0, right - 1);
}
```

The shade thresholds (`> 0.5` good, `> 0.2` warn) put the test's 78%-full belly (0.22 left) at amber; keep them.

- [ ] **Step 4: Run the test to see it pass**

Run: `node --test test/card.test.ts`
Expected: PASS (5 tests). If the content test misses a string, print the card (`console.log(s.toText())`) and fix the layout in `card.ts`; change a test string only if it contradicts the spec.

- [ ] **Step 5: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` — expected: exit 0.

```bash
git add src/ui/card.ts test/card.test.ts
git commit -F - <<'EOF'
feat(card): the agent card, drawn as text over the scene

Beside the character on the side with room, docked in a corner when it
cannot float; the name, activity, title and branch, the four meters in
good, warn and bad colours (a critical one pulses), the model, output
and subagents, and the keys.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 6: The world shows the card; `i` and `c`

**Files:**
- Modify: `src/world/stage.ts` (add `cheer`)
- Modify: `src/world/world.ts` (card state, drawing, keys)
- Modify: `src/ui/overlays.ts` (help lines)
- Test: `test/world.test.ts` (append)

- [ ] **Step 1: Write the failing tests** — append to `test/world.test.ts`:

```ts
// A world in the scene view (images on), run until the crew is in.
function sceneWorld(): { w: World; now: number } {
  const w = demoWorld(true);
  const now = advance(w, 20);
  return { w, now };
}

test('selecting an agent in the scene shows its card beside it; i hides and shows it', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  let text = s.toText();
  assert.match(text, /╭─/);
  assert.match(text, /belly/);
  w.handleKey(key('i'));
  w.draw(s, now);
  text = s.toText();
  assert.doesNotMatch(text, /belly/);
  assert.ok(w.selectedId, 'i keeps the selection');
  w.handleKey(key('i'));
  w.draw(s, now);
  assert.match(s.toText(), /belly/);
});

test('no card without a selection, nor in the dashboard view', () => {
  const { w, now } = sceneWorld();
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.doesNotMatch(s.toText(), /belly/);
  const d = demoWorld(false);
  const t = advance(d, 20);
  d.handleKey(key('\t'));
  d.draw(s, t);
  assert.doesNotMatch(s.toText(), /belly/);
});

test('c cheers the selected agent: a heart over it', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const id = w.selectedId!;
  w.handleKey(key('c'));
  let t = now;
  for (let i = 0; i < 4; i++) {
    t += 1000 / 18;
    w.tick(t);
  }
  const s = new Screen(120, 36);
  w.draw(s, t);
  const fig = w.scene()!.figures.find((g) => g.id === id);
  assert.equal(fig?.emote?.kind, 'heart');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test --test-name-pattern="card|cheers" test/world.test.ts`
Expected: FAIL — no `belly` on screen; `c` does nothing.

- [ ] **Step 3: Add `cheer` to `src/world/stage.ts`**

Add this public method to the `Stage` class, right after the `actors()` method:

```ts
  // The user cheers an agent on: it throws its arms up, a heart over it.
  cheer(id: string): void {
    const a = this.cast.get(id);
    if (!a) return;
    this.life.gesture(a, 'cheer', 1.2);
    this.life.emote(a, 'heart', 2);
  }
```

- [ ] **Step 4: Wire the card into `src/world/world.ts`**

Add imports at the top, with the others:

```ts
import { meters } from '../pet/meters.ts';
import { drawCard } from '../ui/card.ts';
import { FIGURE_H, cellAt, project } from './frame.ts';
```

(keep the existing `import type { SceneFrame } from './frame.ts';`).

Add a field to the class, next to `full = false;`:

```ts
  // The selected agent's card shows (i turns it off and on).
  card = true;
```

In `draw()`, replace

```ts
      if (this.last) this.stage.drawLabels(s, this.last);
```

with

```ts
      if (this.last) {
        this.stage.drawLabels(s, this.last);
        if (this.card && this.selectedId) this.showCard(s, L.scene, this.last, now);
      }
```

Add this method to the class (next to `drawEmptyHint`):

```ts
  // The selected agent's card, beside its character's head (docked when
  // the character is out of view).
  private showCard(s: Screen, scene: Rect, f: SceneFrame, now: number): void {
    const actors = this.stage.actors();
    const a = actors.find((x) => x.info.id === this.selectedId);
    if (!a) return;
    const g = f.figures.find((x) => x.id === a.info.id);
    let at: [number, number] | null = null;
    if (g) {
      const [px, py] = project(f.camera, g.x, g.y, g.z + FIGURE_H);
      const [col, row] = cellAt(f.camera, px, py);
      if (col >= scene.x && col < scene.x + scene.w && row >= scene.y && row < scene.y + scene.h) at = [col, row];
    }
    const v = a.info.vitals;
    drawCard(
      s,
      scene,
      {
        info: a.info,
        meters: v ? meters(v, now) : null,
        subs: actors.filter((x) => x.info.parentId === a.info.id).length,
        color: a.traits.color,
        palette: this.theme.palette,
        now,
      },
      at,
    );
  }
```

In `handleKey`, add two cases to the main `switch` (next to `case 'f':`):

```ts
      case 'i':
        this.card = !this.card;
        return null;
      case 'c':
        if (this.selectedId) this.stage.cheer(this.selectedId);
        return null;
```

- [ ] **Step 5: Add the help lines in `src/ui/overlays.ts`**

In the `HELP` array, after `['esc', 'clear selection / close'],` add:

```ts
  ['i', 'the agent card on / off'],
  ['c', 'cheer the selected agent on'],
```

- [ ] **Step 6: Run the world tests and the full suite**

Run: `node --test test/world.test.ts`
Expected: PASS (all).

Run: `node --test "test/**/*.test.ts"`
Expected: all pass. If a help-overlay test asserts the overlay's line count or height, update that number to include the two new lines.

- [ ] **Step 7: Typecheck and commit**

Run: `node node_modules/typescript/bin/tsc -p tsconfig.json` — expected: exit 0.

```bash
git add src/world/stage.ts src/world/world.ts src/ui/overlays.ts test/world.test.ts
git commit -F - <<'EOF'
feat(world): the selected agent's card beside it; i and c

The card follows the character and docks when it is out of view; i
turns it off and on (the selection and camera stay), c cheers the agent
on with a heart.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

---

### Task 7: Look at it in a real Ghostty

**Files:** none changed unless something looks wrong.

- [ ] **Step 1: Screenshot the card in Ghostty**

A Ghostty daemon runs with single-instance, so force a separate process. The app needs a real TTY for keys, so it runs interactively; the script only opens it and screenshots it after you (or a Tab sent with the agent-driven harness below) select an agent:

```bash
S=$SCRATCH
(timeout 30 ghostty --gtk-single-instance=false --window-width=150 --window-height=46 -e node <repo>/bin/animus.js --demo --theme cafe >/dev/null 2>&1 &)
sleep 8
# Send Tab to the focused Ghostty window via a probe instead if no human is at the keyboard:
# (see scratchpad/probe3.ts for driving World + ScenePlayer inside Ghostty with key presses).
spectacle -b -n -a -o $S/card.png >/dev/null 2>&1
```

If no one can press Tab, adapt `scratchpad/probe3.ts`: after the world warms up, call `world.handleKey({ name: 'tab', ch: '\t', ctrl: false, shift: false })`, keep stepping for 2 s, write a `shot-card` marker, and screenshot with `spectacle -b -n -a -o $S/card.png` when the marker appears.

- [ ] **Step 2: Look at the screenshot**

Open `card.png` (Read tool). Check: the card is beside the selected character and not over it; the frame lines join; the bars and colours read; nothing overlaps the roster or footer. Fix anything wrong in `src/ui/card.ts` with a matching test change, rerun the Task 5–6 tests, and commit with a `fix(card): …` message.

---

## Self-review notes

- Spec §1 meters: Tasks 1–4 (belly, energy, health, mood, critical flags, facts; no cost). The in-scene face states (drowsy, bandage, bounce) need the figure rig and belong to part 3.
- Spec §2 card: Tasks 5–6 (placement, flip, dock, frame, bars, pulse, `i`, `c`). The `[⏎]talk` key arrives with part 2, which adds it to the card's bottom line.
- Types across tasks: `Vitals` (Task 1) is used by Tasks 2–5; `Meters`/`Meter` (Task 4) by Tasks 5–6; `CARD_W`/`CARD_H`/`placeCard`/`drawCard`/`CardOpts` (Task 5) by Task 6.
