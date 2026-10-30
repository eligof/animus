# At the desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each place's desk gets random clutter in its world's style and a bit that moves while its agent works; each world's agents work with tools of their own that show from behind; agents at work break their loop with short beats.

**Architecture:** A world's `WorkstationArt` gains an optional `clutter` pool (things plus spots on the top) and `loops` (frames of something moving). The desk picture splits into a body (with its place's pick of clutter), a screen and loop frames, each cached and placed in depth order, so a change of activity sends only a small screen. Held tools move out of `props.ts` into a library, `src/art/figure/tools/`, a file a grip, each mapping every costume to its tool; the rig holds them beside the body from behind. Beats are gestures picked in `Life.work`, with four new rig poses.

**Tech Stack:** TypeScript on node ≥ 23.6 (type stripping, no build), `node:test`, the project's own canvas (`src/art/canvas.ts`), the figure sketch API (`src/art/figure/paint.ts`).

**Spec:** `docs/superpowers/specs/2026-10-30-at-the-desk-design.md`.

---

## Ground rules for every task

- Work in the `animus-illustrated` worktree on branch `world-life`. Never touch the user's own `animus` checkout.
- Subagents make **no git changes** (no commit, stash, checkout, reset). The coordinator commits after each task's review. Commit steps below are for the coordinator.
- Commits use the noreply identity already configured. Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and carry **no** `Claude-Session:` line and no local paths (public repo).
- Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p .` (no npx). One test file: `node --test test/<file>.test.ts`. One test by name: `node --test --test-name-pattern="<part of name>" test/<file>.test.ts`. Whole suite (about a minute): `node --test "test/**/*.test.ts"`. The test "300 bubbles … under 2 ms" can flake under full-suite load; rerun it alone before treating it as a failure.
- Comments match the codebase: plain English, short sentences, say what a thing is and why.
- No real brands, logos or text in any drawing (lines and shapes only).
- To look at your work: `node scripts/scene-shot.ts <world> <out.png> --at 40 --size 150x46 --zoom 4 --select 2`, writing PNGs to the session scratchpad (never into the repo), then open the PNG.

## File structure

| File | Change | Responsibility |
| --- | --- | --- |
| `src/worlds/types.ts` | modify | `Clutter`, `DeskLoop` types; `WorkstationArt.clutter`, `.loops` |
| `src/worlds/workstation.ts` | modify | `clutterOf(world, place)`: a place's pick |
| `src/art/scene/desk.ts` | rewrite | body, screen and loop pictures, `loopFrame`, `deskPictures` |
| `src/art/scene.ts` | modify | place a desk's pictures in depth order; warm them |
| `src/world/character.ts` | modify | `COSTUMES` list; poses `glance`, `lean`, `scratch`, `tap` |
| `src/art/figure/tools/tool.ts` | create | `Tool`, `Slot`, `ENVELOPE`, `everyone`, shared colours |
| `src/art/figure/tools/write.ts` | create | `SURFACES`, `WRITERS` (write pose) |
| `src/art/figure/tools/read.ts` | create | `READS` (read pose) |
| `src/art/figure/tools/run.ts` | create | `RUNS` (run pose) |
| `src/art/figure/tools/search.ts` | create | `SEARCHES` (search pose) |
| `src/art/figure/tools/web.ts` | create | `WEBS` (web pose) |
| `src/art/figure/tools/index.ts` | create | `SLOT_OF`, `toolOf(costume, slot)` |
| `src/art/figure/props.ts` | modify | the five work tools from the costume's kit |
| `src/art/figure/body.ts` | modify | pass `back` to `drawProp` |
| `src/art/figure/rig.ts` | modify | holds from behind (write, read, web); the four beat poses |
| `src/world/life.ts` | modify | `BEATS`, `BEAT_EVERY`; beats in `work`; `Gesture.beat`; `Look.since` |
| `src/world/stage.ts` | modify | beats facing the desk; a beat's pose clock |
| `src/worlds/<world>/workstation.ts` (16) | modify | each world's clutter and loops |
| `test/desk-fakes.ts` | create | stand-in clutter and loops for tests |
| `test/desk-clutter.test.ts` | create | the pick |
| `test/themes.test.ts` | modify | the clutter and loop contract, every world |
| `test/workstation-art.test.ts` | modify | body, screen, loops as pictures |
| `test/workstations.test.ts` | modify | the plate budget with loops |
| `test/player.test.ts` | modify | bytes a step with loops |
| `test/tools.test.ts` | create | the tool contract, the table, from behind |
| `test/figure.test.ts` | modify | the beat poses |
| `test/life.test.ts` | modify | beats |
| `test/<world>.test.ts` (16) | modify | each world dresses its desks |

---

## Task 1: The clutter and loop contract, and a place's pick

**Files:**
- Modify: `src/worlds/types.ts:53-66`
- Modify: `src/worlds/workstation.ts`
- Create: `test/desk-fakes.ts`
- Create: `test/desk-clutter.test.ts`
- Modify: `test/themes.test.ts` (imports, a helper, a test inside the per-world loop, a `todo` test after it)

- [ ] **Step 1: Write the stand-ins**

Create `test/desk-fakes.ts`:

```ts
import type { Clutter, DeskLoop, P3, WorldDef } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';

// Stand-ins for a world's desk art, for tests that must not hang on how a
// world draws: clutter that is a square of colour, a loop that is a dot
// rising a step a frame (dim while off).

const COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe'];

export function square(name: string, color: string): Clutter {
  return {
    name,
    r: 0.4,
    h: 0.6,
    draw(v, at) {
      const [x, y] = v.at(at[0], at[1], at[2] + 0.3);
      v.pen.fillStyle = color;
      v.pen.fillRect(x - 0.2 * v.s, y - 0.2 * v.s, 0.4 * v.s, 0.4 * v.s);
    },
  };
}

export function blink(name: string, at: P3, frames = 8, fps = 8): DeskLoop {
  return {
    name,
    at,
    r: 0.5,
    h: 1.2,
    frames,
    fps,
    draw(v, i) {
      const [x, y] = v.at(at[0], at[1], at[2] + 0.2 + (0.8 * i) / frames);
      v.pen.fillStyle = v.active ? '#ffd34a' : '#7a6a3a';
      v.pen.beginPath();
      v.pen.arc(x, y, 0.2 * v.s, 0, Math.PI * 2);
      v.pen.fill();
    },
  };
}

// `w` with ten squares of clutter to pick from, on five spots in front of
// its screen (`id` names it apart: the pick is seeded by it).
export function dressed(w: WorldDef, id = w.id): WorldDef {
  const ws = workstationOf(w);
  const z = ws.top[2];
  const spots: P3[] = [[3.0, 2.1, z], [4.7, 2.1, z], [6.3, 2.2, z], [3.4, 1.3, z], [5.0, 1.3, z]];
  return { ...w, id, workstation: { ...ws, clutter: { items: COLORS.map((c, k) => square(`thing${k}`, c)), spots } } };
}

// `w` with two loops on every desk, eight frames at eight a second each.
export function looped(w: WorldDef): WorldDef {
  const ws = workstationOf(w);
  const z = ws.top[2];
  return { ...w, workstation: { ...ws, loops: [blink('a', [6.2, 2.0, z]), blink('b', [3.2, 2.3, z])] } };
}
```

- [ ] **Step 2: Write the failing pick tests**

Create `test/desk-clutter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTheme } from '../src/themes/index.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import { clutterOf, workstationOf } from '../src/worlds/workstation.ts';
import { dressed } from './desk-fakes.ts';

// What stands on each place's desk: a few of its world's things, picked by
// the world and the place.

const cafe = getTheme('cafe')!;
const pick = (w: WorldDef, place: number) => clutterOf(w, place).map((c) => `${c.item.name}@${c.spot}`).sort().join();

test("a place's clutter: 2 to 4 things on as many spots, the same every time, far to near", () => {
  const w = dressed(cafe);
  const spots = workstationOf(w).clutter!.spots;
  for (let place = 0; place < 20; place++) {
    const a = clutterOf(w, place);
    assert.ok(a.length >= 2 && a.length <= 4, `place ${place}: ${a.length} things`);
    assert.equal(new Set(a.map((c) => c.item.name)).size, a.length, `place ${place}: a thing twice`);
    assert.equal(new Set(a.map((c) => c.spot)).size, a.length, `place ${place}: two on one spot`);
    for (const c of a) assert.deepEqual(c.at, spots[c.spot]);
    for (let k = 1; k < a.length; k++) assert.ok(a[k - 1].at[0] + a[k - 1].at[1] <= a[k].at[0] + a[k].at[1], `place ${place}: not far to near`);
    assert.equal(pick(w, place), pick(w, place), `place ${place}: another pick the second time`);
  }
});

test("among a world's first twelve places at least eight have picks of their own; another world picks apart", () => {
  const picks = Array.from({ length: 12 }, (_, p) => pick(dressed(cafe), p));
  assert.ok(new Set(picks).size >= 8, `${new Set(picks).size} picks of 12`);
  const other = Array.from({ length: 12 }, (_, p) => pick(dressed(cafe, 'elsewhere'), p));
  assert.ok(other.some((q, p) => q !== picks[p]), 'another world picks the same');
});

test('a world with no clutter puts none on its desks', () => {
  assert.deepEqual(clutterOf({ ...cafe, workstation: { ...workstationOf(cafe), clutter: { items: [], spots: [] } } }, 3), []);
});
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test test/desk-clutter.test.ts`
Expected: FAIL, `does not provide an export named 'clutterOf'`.

- [ ] **Step 4: Add the types**

In `src/worlds/types.ts`, replace the block from `// A world's workstation (see world/desks.ts):` down to `export type WorkstationArt = PropArt & { screen: Quad; top: P3 };` with:

```ts
// A small thing that may stand on a workstation's top (see
// WorkstationArt.clutter), in the world's style: `r` is the radius of its
// footprint and `h` how tall it stands (units), round where it stands.
// `draw` paints it standing at `at` (u, v on the top, z the top's surface)
// with the desk's view (`v.active` while its screen is on: a candle may be
// lit). `name` tells it apart (camelCase, unique in its world).
export type Clutter = { name: string; r: number; h: number; draw(v: PropView, at: P3): void };

// Something on a workstation that moves while its agent works (a
// lantern's flame, a cauldron's bubbles, steam off a cup): `frames`
// pictures (4 to 8) shown `fps` a second (at most 8), standing at `at` in
// the desk's frame, inside `r` round it and `h` over it. `draw` paints
// frame `i`; frame 0 is the still one shown while the screen is off
// (`v.active` false: unlit). The desk's own draw leaves out what its loops
// paint.
export type DeskLoop = { name: string; at: P3; r: number; h: number; frames: number; fps: number; draw(v: PropView, i: number): void };

// A world's workstation (see world/desks.ts): a prop DESK.len x DESK.dep
// that stands at most DESK.height tall and is never animated (it is drawn
// once a scale, frame, look and pick of clutter, and kept; see
// art/scene/desk.ts). Its agent stands at DESK_SPOT, in front. It names
// where its screen is (`screen`, upright on its body, to the right of
// where its agent stands: the shared activity layer draws on it, see
// art/screen.ts) and where a desk upgrade stands on it (`top`, on its top
// surface). `v.active` is true while its screen is on; `v.seed` is 0, 1 or
// 2: the world's few looks of it. `clutter`: things a place's desk picks a
// few of (see clutterOf in ./workstation.ts) and the spots on the top they
// may stand on, clear of the screen, the upgrade and the agent at work;
// `loops`: one or two things that move on it while its agent works, as
// clear.
export type WorkstationArt = PropArt & {
  screen: Quad;
  top: P3;
  clutter?: { items: readonly Clutter[]; spots: readonly P3[] };
  loops?: readonly DeskLoop[];
};
```

- [ ] **Step 5: Add the pick**

In `src/worlds/workstation.ts`, change the imports to:

```ts
import { contactShadow, hexOf, ink as inkFrom, inkWidth, isoBox, mix, shade } from '../art/iso.ts';
import { DESK } from '../world/desks.ts';
import { hashString, Rng } from '../world/rng.ts';
import type { Clutter, P3, PropView, WorkstationArt, WorldDef } from './types.ts';
```

and append:

```ts
// What stands on the top of place `place`'s workstation in world `w`: 2 to
// 4 of its clutter on as many of its spots (`spot`: which), picked by the
// world's id and the place, so a desk keeps its things while it stands and
// its neighbours have others; far to near (the order to draw them). None
// where the world has none.
export type OnTop = { item: Clutter; at: P3; spot: number };
export function clutterOf(w: WorldDef, place: number): OnTop[] {
  const c = workstationOf(w).clutter;
  if (!c || !c.items.length || !c.spots.length) return [];
  const rng = new Rng(hashString(`${w.id}#${place}`));
  const n = Math.min(rng.int(2, 4), c.items.length, c.spots.length);
  const items = shuffle(c.items.map((_, k) => k), rng).slice(0, n);
  const spots = shuffle(c.spots.map((_, k) => k), rng).slice(0, n);
  return items.map((k, j) => ({ item: c.items[k], at: c.spots[spots[j]], spot: spots[j] })).sort((a, b) => a.at[0] + a.at[1] - (b.at[0] + b.at[1]));
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
```

- [ ] **Step 6: Run the pick tests**

Run: `node --test test/desk-clutter.test.ts`
Expected: PASS, 3 tests. If "at least eight" fails, the seed is the cause: try `hashString(\`${w.id}#${place}\`) ^ Math.imul(place + 1, 0x9e3779b1)` and rerun.

- [ ] **Step 7: Write the contract test for every world**

In `test/themes.test.ts`, add to the imports:

```ts
import { createHash } from 'node:crypto';
import type { P3, PropView } from '../src/worlds/types.ts';
```

Add this helper above the `for (const w of …)` loop:

```ts
// Whether canvas point (x, y) is inside the convex polygon q.
function inQuad(q: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let sign = 0;
  for (let k = 0; k < q.length; k++) {
    const [ax, ay] = q[k];
    const [bx, by] = q[(k + 1) % q.length];
    const c = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    if (!c) continue;
    if (!sign) sign = c;
    else if (c !== sign) return false;
  }
  return true;
}
```

Inside the per-world loop, after the workstation test, add:

```ts
  test(`world ${w.id}: what stands on its desks and what moves there keeps to its place: on the top, inside its box, clear of the screen, the upgrade and the agent at work`, () => {
    const art = workstationOf(w);
    const items = art.clutter?.items ?? [];
    const spots = art.clutter?.spots ?? [];
    const loops = art.loops ?? [];
    if (art.clutter) {
      assert.ok(items.length >= 8 && items.length <= 12, `${items.length} things to pick from`);
      assert.ok(spots.length >= 4, `${spots.length} spots`);
      assert.equal(new Set(items.map((i) => i.name)).size, items.length, 'two things of one name');
    }
    for (const it of items) assert.ok(it.r > 0 && it.r <= 0.75 && it.h > 0 && it.h <= 2.5, `${it.name}: ${it.r} round, ${it.h} tall`);
    spots.forEach((p, k) => {
      assert.ok(p[0] >= 0.75 && p[0] <= DESK.len - 0.75 && p[1] >= 0.75 && p[1] <= DESK.dep - 0.75 && p[2] >= 2 && p[2] <= art.height - 1, `spot ${p} is not on its top`);
      assert.ok(Math.hypot(p[0] - art.top[0], p[1] - art.top[1]) >= 1.75, `spot ${p} is on the upgrade's`);
      for (const q of spots.slice(k + 1)) assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) >= 1.6, `spots ${p} and ${q} are too close`);
    });
    assert.ok(loops.length <= 2, `${loops.length} loops`);
    assert.equal(new Set(loops.map((l) => l.name)).size, loops.length, 'two loops of one name');
    for (const lp of loops) {
      const [u, v, z] = lp.at;
      assert.ok(Number.isInteger(lp.frames) && lp.frames >= 4 && lp.frames <= 8, `${lp.name}: ${lp.frames} frames`);
      assert.ok(lp.fps > 0 && lp.fps <= 8, `${lp.name}: ${lp.fps} a second`);
      assert.ok(lp.r > 0 && lp.r <= 1.5 && lp.h > 0 && u >= 0 && u <= DESK.len && v >= 0 && v <= DESK.dep && z >= 0 && z + lp.h <= art.height + 0.5, `${lp.name} at ${lp.at} is not on its desk`);
      assert.ok(Math.hypot(u - art.top[0], v - art.top[1]) >= lp.r + 1, `${lp.name} is on the upgrade's spot`);
    }
    // On the canvas at s 6, in either frame: each thing on each spot, each
    // loop's every frame, lit and not.
    const s = 6;
    const hashOf = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');
    for (const wall of ['right', 'left'] as const) {
      const at = frame(iso(80, 100, s), wall, 0, 0);
      const screen = art.screen.map((p) => at(...p));
      const [fx, fy] = at(DESK_SPOT.u, DESK_SPOT.v, 0);
      const fig = { x0: fx - FIGURE_HALF_W * s, x1: fx + FIGURE_HALF_W * s, y0: fy - FIGURE_H * s, y1: fy };
      const parts: Array<{ what: string; box: [P3, number, number]; draw: (v: PropView) => void }> = [];
      for (const it of items) for (const p of spots) parts.push({ what: `${it.name} at ${p}`, box: [p, it.r, it.h], draw: (v) => it.draw(v, p) });
      for (const lp of loops) for (let i = 0; i < lp.frames; i++) parts.push({ what: `${lp.name} frame ${i}`, box: [lp.at, lp.r, lp.h], draw: (v) => lp.draw(v, i) });
      for (const part of parts) {
        for (const active of [false, true]) {
          const what = `${wall}${active ? ' (on)' : ''}: ${part.what}`;
          const c = new Canvas(160, 160);
          part.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island: true, t: 0, active, seed: 0 });
          const [[u, v, z], r, h] = part.box;
          let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
          for (const du of [-r, r]) for (const dv of [-r, r]) for (const dz of [0, h]) {
            const [x, y] = at(u + du, v + dv, z + dz);
            box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
          }
          let n = 0;
          let over = 0;
          let behind = 0;
          for (let y = 0; y < c.height; y++) {
            for (let x = 0; x < c.width; x++) {
              if (c.data[(y * c.width + x) * 4 + 3] < 16) continue;
              n++;
              assert.ok(x >= box.x0 - s && x <= box.x1 + s && y >= box.y0 - s && y <= box.y1 + s, `${what}: painted at ${x},${y}, outside its box`);
              if (inQuad(screen, x + 0.5, y + 0.5)) over++;
              if (x >= fig.x0 && x <= fig.x1 && y >= fig.y0 && y <= fig.y1) behind++;
            }
          }
          assert.ok(n > 0, `${what}: nothing drawn`);
          assert.ok(over <= s, `${what}: ${over} pixels over the screen`);
          assert.ok(behind <= 0.1 * n, `${what}: ${Math.round((100 * behind) / n)}% of it behind its agent`);
        }
      }
      // A loop's frame is the same picture every time; lit, its frames differ.
      for (const lp of loops) {
        const shot = (i: number) => {
          const c = new Canvas(160, 160);
          lp.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island: true, t: 0, active: true, seed: 0 }, i);
          return hashOf(c);
        };
        const frames = Array.from({ length: lp.frames }, (_, i) => shot(i));
        assert.deepEqual(Array.from({ length: lp.frames }, (_, i) => shot(i)), frames, `${wall}: ${lp.name} drew a frame two ways`);
        assert.ok(new Set(frames).size >= 2, `${wall}: ${lp.name} does not move`);
      }
    }
  });
```

At the end of the file, after the per-world loop, add:

```ts
test('every world dresses its desks: things to pick from, and something that moves', { todo: "the worlds' desk art" }, () => {
  const bare = THEMES.filter((w) => !workstationOf(w).clutter || !workstationOf(w).loops?.length).map((w) => w.id);
  assert.deepEqual(bare, []);
});
```

- [ ] **Step 8: Run the world tests and the typecheck**

Run: `node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (no world has clutter yet, so the new per-world test checks only that nothing breaks; the `todo` test reports as todo, not as a failure). Typecheck clean.

- [ ] **Step 9: Commit (coordinator)**

```bash
git add src/worlds/types.ts src/worlds/workstation.ts test/desk-fakes.ts test/desk-clutter.test.ts test/themes.test.ts
git commit -m "feat(desk): a world's desk clutter and loops, and a place's pick

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 2: The desk in pictures: body, screen, loops

**Files:**
- Rewrite: `src/art/scene/desk.ts`
- Modify: `src/art/scene.ts` (header comment's `depth` row, the `./scene/desk.ts` import, the desks loop in `figureChores` near line 705, the desks loop in `items` near line 860)
- Modify: `test/workstation-art.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/workstation-art.test.ts`, make the imports:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { Scene } from '../src/art/scene.ts';
import { POP_STEPS, deskSprite, deskStats, loopFrame, loopSprite, screenSprite } from '../src/art/scene/desk.ts';
import { drawScreen } from '../src/art/screen.ts';
import { StressSource } from '../src/demo/stress.ts';
import { Screen as Term } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Screen } from '../src/world/frame.ts';
import { World } from '../src/world/world.ts';
import type { Quad } from '../src/worlds/types.ts';
import { clutterOf, plainWorkstation, workstationOf } from '../src/worlds/workstation.ts';
import { dressed, looped } from './desk-fakes.ts';
```

Replace the test `'a workstation sprite is drawn once for what it shows and kept: the same key, the same pixels'` with:

```ts
test('a workstation is pictures kept for what they show: its body (its clutter, lit or not), its screen (one for every desk), its loops', () => {
  const cafe = getTheme('cafe')!;
  const ink = '#2f1d18';
  const d = { id: 0, wall: 'right' as const, screen: 'write' as Screen, grow: 1, seed: 1 };
  const m = deskStats.misses;
  const body = deskSprite(cafe, d, 4, ink);
  assert.equal(deskStats.misses, m + 1);
  assert.equal(deskSprite(cafe, { ...d }, 4, ink), body, 'drawn again');
  // A change of activity: the same body, another screen.
  assert.equal(deskSprite(cafe, { ...d, screen: 'run' }, 4, ink), body, 'a new body for a new activity');
  const scr = screenSprite(cafe, d, 4, ink);
  assert.equal(screenSprite(cafe, { ...d, id: 5 }, 4, ink), scr, 'a screen for each desk');
  assert.notEqual(hash(screenSprite(cafe, { ...d, screen: 'run' }, 4, ink).img), hash(scr.img));
  assert.ok(scr.img.width * scr.img.height * 2 < body.img.width * body.img.height, 'the screen is not small beside the body');
  // The body is another picture off, in the other frame, at another scale.
  assert.notEqual(deskSprite(cafe, { ...d, screen: 'off' }, 4, ink), body, 'the same body off');
  for (const o of [deskSprite(cafe, { ...d, wall: 'left' }, 4, ink), deskSprite(cafe, d, 8, ink)]) assert.notEqual(hash(o.img), hash(body.img));
  // Popping up: a picture a step (body and screen in one), growing out of
  // the floor and a little past its size; the last is the body.
  const steps = Array.from({ length: POP_STEPS }, (_, k) => deskSprite(cafe, { ...d, grow: (k + 1) / POP_STEPS }, 4, ink));
  assert.equal(steps[POP_STEPS - 1], body);
  assert.ok(steps[0].img.height < body.img.height, 'the first step is not smaller');
  assert.ok(Math.max(...steps.map((p) => p.img.height)) > body.img.height, 'it does not grow past its size');
  assert.equal(new Set(steps).size, POP_STEPS);
  assert.equal(deskSprite(cafe, { ...d, grow: 0.21 }, 4, ink), steps[0], 'a step between steps');
});

test("a desk's body carries its place's clutter: places with other picks, other pictures", () => {
  const w = dressed(getTheme('cafe')!);
  const ink = '#2f1d18';
  const d = { wall: 'right' as const, screen: 'write' as Screen, grow: 1, seed: 1 };
  const pick = (id: number) => clutterOf(w, id).map((c) => `${c.item.name}@${c.spot}`).join();
  const other = Array.from({ length: 12 }, (_, id) => id).find((id) => pick(id) !== pick(0))!;
  assert.notEqual(hash(deskSprite(w, { ...d, id: 0 }, 4, ink).img), hash(deskSprite(w, { ...d, id: other }, 4, ink).img));
});

test("a desk's loops run while its agent works, a step apart from desk to desk, and stand on their first frame while it is off", () => {
  const w = looped(getTheme('cafe')!);
  const lp = workstationOf(w).loops![0];
  for (let k = 0; k < 40; k++) assert.equal(loopFrame(lp, 0, 3, false, k * 0.1), 0, 'off, yet moving');
  const shown = new Set(Array.from({ length: lp.frames }, (_, k) => loopFrame(lp, 0, 3, true, (k + 0.5) / lp.fps)));
  assert.equal(shown.size, lp.frames, 'a frame skipped');
  assert.ok(new Set(Array.from({ length: 6 }, (_, id) => loopFrame(lp, 0, id, true, 2))).size >= 3, 'neighbours in step');
  const ink = '#2f1d18';
  const a = loopSprite(w, 0, 2, true, 'right', 4, ink);
  assert.equal(loopSprite(w, 0, 2, true, 'right', 4, ink), a, 'drawn again');
  assert.notEqual(hash(loopSprite(w, 0, 3, true, 'right', 4, ink).img), hash(a.img), 'two frames alike');
});
```

Replace the test `'in the plate a standing workstation keeps its picture from frame to frame, and gets another when its screen changes'` with:

```ts
// The mines with two at work on each of two leads' teams, settled.
function settled() {
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('mines')!, live: new StressSource(2, 2, start), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.resize(150, 46);
  let t = start;
  for (let i = 0; i < 10 * 18; i++) w.tick((t = start + i * (1000 / 18)));
  w.draw(new Term(150, 46), t);
  return w.scene()!;
}

test('in the plate a standing workstation keeps its pictures from frame to frame; a change of activity changes its screen only', () => {
  const f = settled();
  assert.equal(f.desks!.length, 6);
  const scene = new Scene();
  const keys = (fr: typeof f) => new Map(scene.plate(fr).layers.filter((l) => /^(desk|screen):/.test(l.id)).map((l) => [l.id, l.pic.key]));
  const first = keys(f);
  assert.equal(first.size, 12);
  assert.deepEqual(keys({ ...f, t: f.t + 0.5 }), first, 'a picture changed with nothing to change it');
  const d = f.desks!.find((x) => x.screen !== 'off')!;
  const next = keys({ ...f, desks: f.desks!.map((x) => (x === d ? { ...x, screen: x.screen === 'web' ? 'read' : 'web' } : x)) });
  for (const [id, key] of first) assert.equal(next.get(id) === key, id !== `screen:${d.id}`, id);
});

test('in the plate each desk shows its loops, their pictures moving on with time only while its screen is on', () => {
  const f = settled();
  const g = { ...f, world: looped(f.world) };
  const scene = new Scene();
  const keys = (fr: typeof g) => new Map(scene.plate(fr).layers.filter((l) => l.id.startsWith('loop:')).map((l) => [l.id, l.pic.key]));
  const now = keys(g);
  assert.equal(now.size, 2 * g.desks!.length);
  const later = keys({ ...g, t: g.t + 1 / 8 });
  for (const d of g.desks!) for (const k of [0, 1]) assert.equal(later.get(`loop:${d.id}:${k}`) !== now.get(`loop:${d.id}:${k}`), d.screen !== 'off', `desk ${d.id} loop ${k}`);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/workstation-art.test.ts`
Expected: FAIL, `does not provide an export named 'loopFrame'`.

- [ ] **Step 3: Rewrite `src/art/scene/desk.ts`**

```ts
// Workstations as pictures (see world/desks.ts and Stage): the world's own
// (or the plain one, see worlds/workstation.ts) drawn in its frame at a
// scale, each picture drawn once and kept, keyed by what it shows, all of
// them anchored at the desk's back corner on the floor:
//
//   body     the desk, the clutter its place picked (see clutterOf), lamps
//            lit while its screen is on: placed again for free while it
//            stands;
//   screen   what the shared activity layer paints on its screen (see
//            art/screen.ts), one an activity for every desk of the world:
//            a change of activity sends only this;
//   loop     a frame of something that moves while its agent works (see
//            WorkstationArt.loops), one a frame for every desk.
//
// Popping up or shrinking away it grows out of the floor in POP_STEPS
// steps, each one picture of all of it (body, screen and its loops' still
// frames).

import type { DeskFrame } from '../../world/frame.ts';
import { toWorld } from '../../world/room.ts';
import type { DeskLoop, PropView, WorkstationArt, WorldDef } from '../../worlds/types.ts';
import { clutterOf, workstationOf } from '../../worlds/workstation.ts';
import { Canvas } from '../canvas.ts';
import type { At } from '../iso.ts';
import { drawScreen } from '../screen.ts';
import { cropped } from './pixels.ts';

// A picture and its anchor: where the workstation's back corner on the
// floor falls in it.
export type DeskSprite = { img: Canvas; ax: number; ay: number };

// A pop in this many steps (each its own picture), and how much a step
// grows it: out of the floor, a little past its size, and back.
export const POP_STEPS = 5;
export function growth(grow: number): number {
  const t = Math.max(0, Math.min(1, Math.round(grow * POP_STEPS) / POP_STEPS)) - 1;
  return 1 + 2.70158 * t * t * t + 1.70158 * t * t;
}
const stepOf = (grow: number) => Math.max(0, Math.min(POP_STEPS, Math.round(grow * POP_STEPS)));
// Still growing out of the floor (or shrinking into it): all in one picture.
export const popping = (grow: number) => stepOf(grow) < POP_STEPS;

// Room round the box for its shadow and its ink, in units.
const PAD = 2;
// Pictures kept, least recently used out first past either bound.
const MAX = 1024;
const MAX_BYTES = 48 << 20;
const cache = new Map<string, DeskSprite>();
let bytes = 0;
export const deskStats = { hits: 0, misses: 0 };

// Each workstation art a number of its own for the keys (a world's art is
// one object; a test may hand in another under the same world id).
const arts = new WeakMap<WorkstationArt, number>();
let serial = 0;
function artKey(a: WorkstationArt): number {
  let n = arts.get(a);
  if (n === undefined) arts.set(a, (n = ++serial));
  return n;
}

function kept(key: string, make: () => DeskSprite): DeskSprite {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    deskStats.hits++;
    return hit;
  }
  deskStats.misses++;
  const sp = make();
  cache.set(key, sp);
  bytes += sp.img.data.length;
  while (cache.size > MAX || bytes > MAX_BYTES) {
    const [k, old] = cache.entries().next().value as [string, DeskSprite];
    cache.delete(k);
    bytes -= old.img.data.length;
  }
  return sp;
}

// A picture of part of workstation `art` in `wall`'s frame at scale s,
// grown by g about the middle of its footprint: `draw` paints it through
// `at` (the frame's units to the canvas). Cropped to what it painted,
// anchored at the back corner.
function picture(art: WorkstationArt, wall: 'left' | 'right', g: number, s: number, draw: (pen: Canvas, at: At) => void): DeskSprite {
  const cu = art.len / 2;
  const cv = art.dep / 2;
  const place = { wall, x0: 0, y0: 0 };
  const rel = (u: number, v: number, z: number): [number, number] => {
    const [x, y, zz] = toWorld(place, cu + (u - cu) * g, cv + (v - cv) * g, z * g);
    return [(x - y) * s, ((x + y) * s) / 2 - zz * s];
  };
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const u of [-PAD, art.len + PAD]) {
    for (const v of [-PAD, art.dep + PAD]) {
      for (const z of [0, art.height + PAD]) {
        const [x, y] = rel(u, v, z);
        x0 = Math.min(x0, x);
        y0 = Math.min(y0, y);
        x1 = Math.max(x1, x);
        y1 = Math.max(y1, y);
      }
    }
  }
  const ox = Math.ceil(-x0);
  const oy = Math.ceil(-y0);
  const c = new Canvas(Math.max(1, Math.ceil(x1 + ox) + 1), Math.max(1, Math.ceil(y1 + oy) + 1));
  draw(c, (u, v, z) => {
    const [x, y] = rel(u, v, z);
    return [x + ox, y + oy];
  });
  const crop = cropped(c);
  return crop ? { img: crop.img, ax: ox - crop.x, ay: oy - crop.y } : { img: new Canvas(1, 1), ax: 0, ay: 0 };
}

const viewOf = (art: WorkstationArt, pen: Canvas, at: At, s: number, wall: 'left' | 'right', active: boolean, seed: number): PropView => ({ pen, s, at, len: art.len, dep: art.dep, wall, island: true, t: 0, active, seed });

// The body of workstation d of `world` at scale s in ink `ink` (popping,
// all of it).
export function deskSprite(world: WorldDef, d: Pick<DeskFrame, 'id' | 'wall' | 'screen' | 'grow' | 'seed'>, s: number, ink: string): DeskSprite {
  const art = workstationOf(world);
  const step = stepOf(d.grow);
  const pop = step < POP_STEPS;
  const on = d.screen !== 'off';
  const pick = clutterOf(world, d.id);
  const key = `b|${artKey(art)}|${ink}|${d.wall}|${d.seed}|${pop ? d.screen : on ? 'on' : 'off'}|${pick.map((c) => `${c.item.name}@${c.spot}`).join()}|${step}|${s}`;
  return kept(key, () => {
    const g = growth(d.grow);
    return picture(art, d.wall, g, s, (pen, at) => {
      if (!step) return;
      const v = viewOf(art, pen, at, s * g, d.wall, on, d.seed);
      pen.save();
      art.draw(v);
      pen.restore();
      for (const c of pick) {
        pen.save();
        c.item.draw(v, c.at);
        pen.restore();
      }
      if (!pop) return;
      for (const lp of art.loops ?? []) {
        pen.save();
        lp.draw(v, 0);
        pen.restore();
      }
      drawScreen(pen, at, art.screen, d.screen, ink);
    });
  });
}

// The screen of a workstation of `world` grown to its size: what its agent
// is doing.
export function screenSprite(world: WorldDef, d: Pick<DeskFrame, 'wall' | 'screen'>, s: number, ink: string): DeskSprite {
  const art = workstationOf(world);
  return kept(`s|${artKey(art)}|${ink}|${d.wall}|${d.screen}|${s}`, () => picture(art, d.wall, 1, s, (pen, at) => drawScreen(pen, at, art.screen, d.screen, ink)));
}

// Frame i of loop k of the workstation of `world`, lit or not, grown to
// its size.
export function loopSprite(world: WorldDef, k: number, i: number, on: boolean, wall: 'left' | 'right', s: number, ink: string): DeskSprite {
  const art = workstationOf(world);
  return kept(`l|${artKey(art)}|${ink}|${wall}|${k}|${i}|${on ? 1 : 0}|${s}`, () =>
    picture(art, wall, 1, s, (pen, at) => {
      const lp = art.loops?.[k];
      if (!lp) return;
      pen.save();
      lp.draw(viewOf(art, pen, at, s, wall, on, 0), i);
      pen.restore();
    }),
  );
}

// The frame loop k (`lp`) of desk `id` shows at scene time t: running
// while its screen is on, each desk a step of its own along it (neighbours
// do not flicker in step); the still one, 0, while it is off.
export function loopFrame(lp: DeskLoop, k: number, id: number, on: boolean, t: number): number {
  if (!on) return 0;
  const lag = (((id + 1) * 0.618 + k * 0.29) % 1) * lp.frames;
  return Math.floor(t * lp.fps + lag) % lp.frames;
}

// Workstation d's pictures as the scene places them at time t, back to
// front (they share its box, so they are drawn in this order: see
// depth.ts), with their layers' ids and whether each was drawn just now.
export type DeskPicture = { id: string; sp: DeskSprite; fresh: boolean };
export function deskPictures(world: WorldDef, d: DeskFrame, t: number, s: number, ink: string): DeskPicture[] {
  const out: DeskPicture[] = [];
  const add = (id: string, make: () => DeskSprite) => {
    const m = deskStats.misses;
    const sp = make();
    out.push({ id, sp, fresh: deskStats.misses > m });
  };
  add(`desk:${d.id}`, () => deskSprite(world, d, s, ink));
  if (popping(d.grow)) return out;
  const on = d.screen !== 'off';
  (workstationOf(world).loops ?? []).forEach((lp, k) => add(`loop:${d.id}:${k}`, () => loopSprite(world, k, loopFrame(lp, k, d.id, on, t), on, d.wall, s, ink)));
  add(`screen:${d.id}`, () => screenSprite(world, d, s, ink));
  return out;
}
```

- [ ] **Step 4: Place the pictures in the scene**

In `src/art/scene.ts`:

Change `import { POP_STEPS, deskSprite, deskStats, growth } from './scene/desk.ts';` to:

```ts
import { POP_STEPS, deskPictures, growth } from './scene/desk.ts';
```

In the header comment, in the `depth` row, change `props, workstations, builds, piles, figures, desk upgrades` to `props, workstations (a body, its loops and its screen), builds, piles, figures, desk upgrades`.

In `figureChores`, replace the desks loop with:

```ts
    for (const d of f.desks ?? []) {
      if (d.grow <= 0) continue;
      yield () => {
        for (const { sp, fresh } of deskPictures(f.world, d, f.t, s, ink)) made(sp.img, fresh);
      };
    }
```

In `items`, replace the desks loop with:

```ts
    for (const d of f.desks ?? []) {
      // A workstation stands on the floor like a prop, as tall as it has
      // grown: its body, then its loops and its screen over it (one box,
      // so in that order).
      if (d.grow <= 0) continue;
      const [x, y] = P(d.x0, d.y0, 0);
      const r = footprint(d);
      const box = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, h: workstationOf(f.world).height * growth(d.grow), point: false };
      for (const { id, sp } of deskPictures(f.world, d, f.t, s, ink)) {
        const dx = Math.round(x) - sp.ax;
        const dy = Math.round(y) - sp.ay;
        const it: Item = { ...box, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id, img: sp.img, x: dx, y: dy };
        if (seen(it)) out.push(it);
      }
    }
```

- [ ] **Step 5: Run the tests, the scene tests and the typecheck**

Run: `node --test test/workstation-art.test.ts test/desk-clutter.test.ts test/scene.test.ts test/scene-plate.test.ts test/workstations.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS. If a scene test counts layers or ids and now sees `screen:` layers, update its count with a comment saying a desk is a body and a screen; weaken no other assertion. If a screen draws under its body, check `compare` in `src/art/scene/depth.ts`: equal boxes go in push order (`|| -1`), so `deskPictures` must push body, loops, screen.

- [ ] **Step 6: Look at it**

Run: `node scripts/scene-shot.ts mines <scratchpad>/split.png --at 40 --size 150x46 --zoom 4 --select 2` and open the PNG. Expected: desks look as before this change (no clutter or loops exist yet): screens in place, not offset, not doubled at their edges.

- [ ] **Step 7: Commit (coordinator)**

```bash
git add src/art/scene/desk.ts src/art/scene.ts test/workstation-art.test.ts
git commit -m "feat(desk): a desk as a body, a screen and loop frames

A change of activity now sends a small screen, not a whole desk.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 3: The budget with loops on every desk

**Files:**
- Modify: `test/workstations.test.ts` (the test `"twenty at their workstations: the stage's frame and the scene's plate stay within budget"`)
- Modify: `test/player.test.ts` (a new test)

- [ ] **Step 1: Loops in the plate budget**

In `test/workstations.test.ts`, add `import { looped } from './desk-fakes.ts';`. In the plate half of the budget test, change `theme: getTheme('cafe')!` to `theme: looped(getTheme('cafe')!)`, and the comment above it to:

```ts
  // The plate: twenty figures, as many workstations with two loops each,
  // labels; the workstations' pictures drawn once, then placed.
```

- [ ] **Step 2: A bytes test**

In `test/player.test.ts`, add to the imports:

```ts
import { StressSource } from '../src/demo/stress.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import { looped } from './desk-fakes.ts';
```

and append:

```ts
// Twenty at work in a world, played into the terminal: the bytes a step
// once every workstation is up (after 15 seconds, over the next 3).
function bytesAStep(theme: WorldDef): number {
  const rate = 18;
  const world = new World({ theme, live: new StressSource(4, 4, START), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start: START, images: true, view: 'scene' });
  world.setCell(8, 16);
  world.resize(150, 46);
  const screen = new Screen(150, 46);
  const player = new ScenePlayer({ encode: (b, opaque) => (opaque ? encodeRgb(b, 0, 1) : encodeRgba(b, 1)) });
  let bytes = 0;
  for (let k = 0; k < 18 * rate; k++) {
    const now = START + (k * 1000) / rate;
    world.tick(now);
    const out = player.step(world, screen, now);
    if (k >= 15 * rate) bytes += out.length;
  }
  return bytes / (3 * rate);
}

test('two loops on every one of twenty workstations cost at most 4 KiB a step more than none', () => {
  const cafe = getTheme('cafe')!;
  const none = bytesAStep(cafe);
  const two = bytesAStep(looped(cafe));
  assert.ok(two <= none + 4096, `${two.toFixed(0)} bytes a step with loops, ${none.toFixed(0)} without`);
});
```

- [ ] **Step 3: Run them**

Run: `node --test test/player.test.ts test/workstations.test.ts`
Expected: PASS. If the bytes test fails, print `two - none` and look at what a step sends (`out` holds kitty commands): a loop frame change should be a placement of a picture already sent, not a new transmission. A new transmission every step means a loop key changes for something other than its frame (check `loopSprite`'s key).

- [ ] **Step 4: Commit (coordinator)**

```bash
git add test/workstations.test.ts test/player.test.ts
git commit -m "test(desk): frame and byte budgets with loops on every desk

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 4: The tool library, today's five for everyone

**Files:**
- Modify: `src/world/character.ts` (add `COSTUMES` after `Costume`)
- Create: `src/art/figure/tools/tool.ts`, `write.ts`, `read.ts`, `run.ts`, `search.ts`, `web.ts`, `index.ts`
- Modify: `src/art/figure/props.ts`
- Modify: `src/art/figure/body.ts:141`
- Create: `test/tools.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `test/tools.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { buildFigure } from '../src/art/figure/body.ts';
import { lookOf } from '../src/art/figure/look.ts';
import { Sketch, render } from '../src/art/figure/paint.ts';
import { LOOP, rigFor, type Rig } from '../src/art/figure/rig.ts';
import { ENVELOPE, toolOf, type Slot } from '../src/art/figure/tools/index.ts';
import { COSTUMES, traitsFor, type Costume, type Pose } from '../src/world/character.ts';

// The tools of the work poses: every costume's own (a world's), each kept
// to its slot's room, and seen from behind at the desk.

const INK = '#2b2233';
const SLOTS: Slot[] = ['surface', 'writer', 'read', 'run', 'search', 'web'];
// The design's table (surface, writer, read, run, search, web).
const TABLE: Record<Costume, string[]> = {
  miner: ['slate', 'chalk', 'foldedMap', 'pickaxe', 'lantern', 'crankRadio'],
  scientist: ['clipboard', 'pencil', 'labManual', 'flask', 'geigerCounter', 'plasmaOrb'],
  raver: ['flyer', 'marker', 'vinylSleeve', 'drumstick', 'glowStick', 'phone'],
  hacker: ['stickyNotes', 'marker', 'printout', 'screwdriver', 'flashlight', 'laptop'],
  astronaut: ['datapad', 'stylus', 'dataSlate', 'wrench', 'scanner', 'holoProjector'],
  casual: ['orderPad', 'pen', 'recipeBook', 'whisk', 'magnifier', 'phone'],
  forager: ['leaf', 'quill', 'fieldGuide', 'trowel', 'glowingMushroom', 'sporeOrb'],
  parka: ['notebook', 'pencil', 'map', 'iceAxe', 'lantern', 'radio'],
  guard: ['ledger', 'fountainPen', 'ledgerBook', 'rubberStamp', 'loupe', 'handset'],
  demon: ['scroll', 'quill', 'grimoire', 'trident', 'crystalBall', 'scryingMirror'],
  drifter: ['notebook', 'pencil', 'map', 'spanner', 'dowsingRod', 'radio'],
  nord: ['parchment', 'quill', 'scroll', 'axe', 'torch', 'runeStone'],
  exosuit: ['datapad', 'stylus', 'dataSlate', 'multitool', 'scanner', 'holoProjector'],
  jumpsuit: ['clipboard', 'pencil', 'manual', 'wrench', 'geigerCounter', 'radio'],
  colonist: ['notebook', 'pencil', 'almanac', 'hammer', 'spyglass', 'radio'],
  startup: ['stickyNotes', 'marker', 'printout', 'pingPongPaddle', 'magnifier', 'tablet'],
  wizard: ['notepad', 'pencil', 'book', 'mallet', 'magnifier', 'tablet'],
};
const tr = traitsFor('agent-1', 'sub');
const hash = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

// A tool alone at s, its hand in the middle of a canvas 12 units across.
function alone(slot: Slot, c: Costume, s: number, back: boolean, v = 0): Canvas {
  const sk = new Sketch();
  toolOf(c, slot).draw(sk, v, lookOf(tr, c), back);
  const cv = new Canvas(12 * s, 12 * s);
  render(cv, sk, [s, 0, 0, s, 6 * s, 6 * s], Math.max(1.5, 0.28 * s), INK);
  return cv;
}

// A figure from rig r at s, standing in the middle of its canvas.
function figure(r: Rig, c: Costume, back: boolean, s: number): Canvas {
  const sk = new Sketch();
  buildFigure(sk, r, lookOf(tr, c), { back, item: null, frame: 0 });
  const cv = new Canvas(30 * s, 34 * s);
  render(cv, sk, [s, 0, 0, s, 15 * s, 28 * s], Math.max(1.5, 0.28 * s), INK);
  return cv;
}

// Pixels that differ between two pictures of one size.
function differ(a: Canvas, b: Canvas): number {
  let n = 0;
  for (let o = 0; o < a.data.length; o += 4) {
    const d = Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]);
    if (d > 48 || Math.abs(a.data[o + 3] - b.data[o + 3]) > 32) n++;
  }
  return n;
}

test('every costume holds a tool in each slot of the work poses; the wizard, the first five ever drawn', () => {
  for (const c of COSTUMES) for (const slot of SLOTS) assert.ok(toolOf(c, slot)?.name, `${c} ${slot}`);
  assert.deepEqual(SLOTS.map((slot) => toolOf('wizard', slot).name), TABLE.wizard);
});

test("each tool draws something inside its slot's room, front and back, whatever its value", () => {
  const s = 8;
  const done = new Set<string>();
  for (const slot of SLOTS) {
    const e = ENVELOPE[slot];
    for (const c of COSTUMES) {
      const t = toolOf(c, slot);
      if (done.has(`${slot}:${t.name}`)) continue;
      done.add(`${slot}:${t.name}`);
      for (const back of [false, true]) {
        for (const v of [0, 0.5, 1]) {
          const what = `${slot} ${t.name}${back ? ' (back)' : ''} at ${v}`;
          const cv = alone(slot, c, s, back, v);
          let n = 0;
          for (let y = 0; y < cv.height; y++) {
            for (let x = 0; x < cv.width; x++) {
              if (cv.data[(y * cv.width + x) * 4 + 3] < 16) continue;
              n++;
              const ux = x / s - 6;
              const uy = y / s - 6;
              assert.ok(ux >= e.x0 - 0.5 && ux <= e.x1 + 0.5 && uy >= e.y0 - 0.5 && uy <= e.y1 + 0.5, `${what}: painted at ${ux.toFixed(2)}, ${uy.toFixed(2)}`);
            }
          }
          assert.ok(n >= s * s, `${what}: ${n} pixels`);
        }
      }
    }
  }
});

test('seen from behind at its desk, a figure at work shows its tool beside the body: writing, reading, browsing and searching in every frame, swinging in a quarter of them', () => {
  const s = 6;
  const WORK: Array<[Pose, number]> = [['write', 1], ['read', 1], ['web', 1], ['search', 1], ['run', 0.25]];
  for (const c of COSTUMES) {
    for (const [pose, share] of WORK) {
      const n = LOOP[pose][1];
      let frames = 0;
      let shown = 0;
      for (let i = 0; i < n; i += 2) {
        const r = rigFor(pose, i, { back: true, walking: false, walkU: 0, item: false, mug: false });
        frames++;
        if (differ(figure(r, c, true, s), figure({ ...r, props: [] }, c, true, s)) >= 1.5 * s * s) shown++;
      }
      assert.ok(shown >= share * frames, `${c} ${pose}: the tool shows in ${shown} of ${frames} frames from behind`);
    }
  }
});

test("each world works with its own tools, as the design's table says, and tools of other names look other", { todo: 'the tool art' }, () => {
  const wrong: string[] = [];
  for (const c of COSTUMES) SLOTS.forEach((slot, k) => toolOf(c, slot).name !== TABLE[c][k] && wrong.push(`${c} ${slot}: ${toolOf(c, slot).name}, not ${TABLE[c][k]}`));
  assert.deepEqual(wrong, []);
  for (const slot of SLOTS) {
    const looks = new Map<string, string>();
    for (const c of COSTUMES) {
      const name = toolOf(c, slot).name;
      const h = hash(alone(slot, c, 8, false));
      const was = looks.get(h);
      assert.ok(!was || was === name, `${slot}: ${name} looks like ${was}`);
      looks.set(h, name);
    }
  }
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/tools.test.ts`
Expected: FAIL, `Cannot find module` for `src/art/figure/tools/index.ts`.

- [ ] **Step 3: The costume list**

In `src/world/character.ts`, right after the `Costume` type, add:

```ts
export const COSTUMES: readonly Costume[] = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist', 'miner', 'forager', 'parka', 'guard', 'demon', 'startup'];
```

- [ ] **Step 4: `src/art/figure/tools/tool.ts`**

```ts
import type { Costume } from '../../../world/character.ts';
import { COSTUMES } from '../../../world/character.ts';
import type { Look } from '../look.ts';
import type { Sketch } from '../paint.ts';

// A tool in hand (see ./index.ts), drawn in its own frame: origin at the
// hand that holds it (or where the rig puts it), +x the way it points, in
// figure units (a figure is 14 tall). `v` is its pose's value for it (a
// page turning over, 0 to 1; a strike landing, 1; a screen's page, 0 or
// 1); `back` is true seen from behind (a book may show its cover, a phone
// its case). `name` is the design's (see the table in test/tools.test.ts).
export type Tool = { name: string; draw(sk: Sketch, v: number, L: Look, back: boolean): void };

// What a costume holds for each kind of work: the write pose's surface and
// writer, and the read, run, search and web poses' one tool each.
export type Slot = 'surface' | 'writer' | 'read' | 'run' | 'search' | 'web';

// Where each slot's tools stay (units, in their own frame), so the
// figure's box holds every pose with any of them.
export const ENVELOPE: Record<Slot, { x0: number; x1: number; y0: number; y1: number }> = {
  surface: { x0: -1.6, x1: 1.6, y0: -1.7, y1: 1.7 },
  writer: { x0: -0.8, x1: 2.8, y0: -0.7, y1: 0.7 },
  read: { x0: -2.6, x1: 2.6, y0: -1.9, y1: 1.9 },
  run: { x0: -1.0, x1: 4.8, y0: -2.2, y1: 2.2 },
  search: { x0: -1.0, x1: 4.0, y0: -2.6, y1: 2.0 },
  web: { x0: -2.8, x1: 2.8, y0: -2.8, y1: 2.8 },
};

// One tool for every costume (a grip's file puts each world's own over it).
export const everyone = (t: Tool): Record<Costume, Tool> => Object.fromEntries(COSTUMES.map((c) => [c, t])) as Record<Costume, Tool>;

export const TAU = Math.PI * 2;
// Colours the tools share.
export const WHITE = '#ffffff';
export const PAGE = '#fbf4e4';
export const PAGE_D = '#e3d6bd';
export const COVER = '#a3543f';
export const WOOD = '#b07a48';
export const WOOD_D = '#875a33';
export const METAL = '#9aa3b2';
export const METAL_D = '#727b8b';
export const BRASS = '#d4a94c';
export const SCREEN = '#a8e8ff';
export const SLATE = '#2c3140';
```

- [ ] **Step 5: The five grip files, each with today's tool for everyone**

Move each drawing out of `drawProp` in `src/art/figure/props.ts` into its file unchanged, reading `pr.v` as `v`.

`src/art/figure/tools/write.ts` (complete):

```ts
import type { Costume } from '../../../world/character.ts';
import { alpha } from '../../iso.ts';
import { PAGE, PAGE_D, TAU, everyone, type Tool } from './tool.ts';

// The write pose's tools (surface and writer): a surface held in one hand,
// upright in its own frame, about 1.7 across and 2.1 tall, its top toward
// -y; a writer in the other, pointing along +x, its tip at about 1.9. From
// the front a pad before the chest; from behind held out at the side (see
// the write pose in ../rig.ts). Each costume's own below.

// A pad of lined paper on a spiral.
const notepad: Tool = {
  name: 'notepad',
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.85, -1.05, 1.7, 2.1, 0.22), PAGE, { dark: PAGE_D, d: 0.2 });
    sk.draw((p, c) => {
      p.strokeStyle = alpha(c.ink, 0.45);
      p.lineWidth = Math.max(c.line * 0.6, 0.6 / c.px);
      p.beginPath();
      for (const y of [-0.3, 0.15, 0.6]) {
        p.moveTo(-0.55, y);
        p.lineTo(0.55, y);
      }
      p.stroke();
      p.fillStyle = c.ink;
      for (const x of [-0.5, 0, 0.5]) {
        p.beginPath();
        p.arc(x, -1.05, 0.14, 0, TAU);
        p.fill();
      }
    });
  },
};

// A yellow pencil, its rubber at the hand.
const pencil: Tool = {
  name: 'pencil',
  draw(sk) {
    sk.limb([0, 0, 1.55, 0], 0.34, '#f6c544', { line: 0.5 });
    sk.limb([1.55, 0, 1.95, 0], 0.2, '#3a3040', { line: 0.4 });
    sk.limb([-0.25, 0, 0, 0], 0.36, '#ff8fa8', { line: 0.5 });
  },
};

export const SURFACES: Record<Costume, Tool> = everyone(notepad);
export const WRITERS: Record<Costume, Tool> = everyone(pencil);
```

`src/art/figure/tools/read.ts`: a file with this shape, the body of `openBook` being today's `book(sk, flip)` from `props.ts` copied unchanged:

```ts
import type { Costume } from '../../../world/character.ts';
import { alpha, mix, shade } from '../../iso.ts';
import { zoom, type Sketch } from '../paint.ts';
import { COVER, PAGE, PAGE_D, WHITE, everyone, type Tool } from './tool.ts';

// The read pose's tools: held open in both hands, about 4 across and 2.6
// tall, pages toward the viewer; `v` (0 to 1) turns a page over from right
// to left. From the front before the chest; from behind at the side (see
// the read pose in ../rig.ts). Each costume's own below.

// An open book.
const book: Tool = { name: 'book', draw: (sk, v) => sk.at(zoom(1.15), () => openBook(sk, v)) };

// An open book, pages toward the viewer; `flip` (0..1) turns a page over
// from right to left.
function openBook(sk: Sketch, flip: number): void {
  // today's book(sk, flip) body from props.ts, unchanged
}

export const READS: Record<Costume, Tool> = everyone(book);
```

`src/art/figure/tools/run.ts`, with the `case 'mallet':` body from `drawProp` (`pr.v` as `v`):

```ts
import type { Costume } from '../../../world/character.ts';
import { METAL, METAL_D, WOOD, WOOD_D, everyone, type Tool } from './tool.ts';

// The run pose's tools: swung, the handle at the hand along +x, the head
// out to about 3.2; `v` is 1 on the strike (marks of the blow, a spill, a
// stamp's print). Raised over the head it shows from behind. Each
// costume's own below.

// A mallet: a wooden handle, a steel head, marks of the blow on the strike.
const mallet: Tool = {
  name: 'mallet',
  draw(sk, v) {
    // today's case 'mallet' body from drawProp, `pr.v` read as `v`
  },
};

export const RUNS: Record<Costume, Tool> = everyone(mallet);
```

`src/art/figure/tools/search.ts`, with the `case 'magnifier':` body:

```ts
import type { Costume } from '../../../world/character.ts';
import { alpha, shade } from '../../iso.ts';
import { hole } from '../paint.ts';
import { BRASS, TAU, WHITE, everyone, type Tool } from './tool.ts';

// The search pose's tools: held out at arm's length, the handle at the
// hand along +x, the business end round x 2 (it sweeps in small circles);
// out at the side, so it shows from behind too. Each costume's own below.

// A magnifying glass with a brass rim.
const magnifier: Tool = {
  name: 'magnifier',
  draw(sk) {
    // today's case 'magnifier' body from drawProp
  },
};

export const SEARCHES: Record<Costume, Tool> = everyone(magnifier);
```

`src/art/figure/tools/web.ts`, with the `case 'tablet':` body (`pr.v` as `v`):

```ts
import type { Costume } from '../../../world/character.ts';
import { alpha } from '../../iso.ts';
import { SCREEN, SLATE, TAU, everyone, type Tool } from './tool.ts';

// The web pose's tools: held at the chest in both hands (from behind, held
// up and out at the side, see ../rig.ts), about 2.7 across, a glow round
// it allowed; `v` is the page (0 or 1) a swipe turns. Each costume's own
// below.

// A tablet: a slate case, a glowing screen with a picture and lines on it.
const tablet: Tool = {
  name: 'tablet',
  draw(sk, v, L) {
    // today's case 'tablet' body from drawProp, `pr.v` read as `v`
  },
};

export const WEBS: Record<Costume, Tool> = everyone(tablet);
```

Each `// today's … body` comment is replaced by the moved code; nothing of it changes but `pr.v` → `v`. Drop any import the moved body does not use (the typecheck in Step 8 lists them).

- [ ] **Step 6: `src/art/figure/tools/index.ts`**

```ts
import type { Costume } from '../../../world/character.ts';
import type { PropKind } from '../rig.ts';
import { READS } from './read.ts';
import { RUNS } from './run.ts';
import { SEARCHES } from './search.ts';
import type { Slot, Tool } from './tool.ts';
import { WEBS } from './web.ts';
import { SURFACES, WRITERS } from './write.ts';

export { ENVELOPE } from './tool.ts';
export type { Slot, Tool } from './tool.ts';

// The work poses' tools, a costume's own (its world's, see each grip's
// file): the rig names the slot a held prop fills (its kind), the costume
// what fills it. The wizard keeps the first five ever drawn.
export const SLOT_OF: Partial<Record<PropKind, Slot>> = { notepad: 'surface', pencil: 'writer', book: 'read', mallet: 'run', magnifier: 'search', tablet: 'web' };
const BY_SLOT: Record<Slot, Record<Costume, Tool>> = { surface: SURFACES, writer: WRITERS, read: READS, run: RUNS, search: SEARCHES, web: WEBS };

export function toolOf(c: Costume, slot: Slot): Tool {
  return BY_SLOT[slot][c];
}
```

- [ ] **Step 7: `drawProp` takes the costume's tools**

In `src/art/figure/props.ts`:

1. Make the header comment:

```ts
// Things in hand, and the little extras a pose shows: the work poses'
// tools (a costume's own, see ./tools/), a mug, the block a builder
// carries, thought bubbles, a spark, a drop of sweat. Each draws in its
// own frame: origin at the hand (or where the rig puts it), +x pointing
// the way it is held.
```

2. Remove the colour constants that moved to `tools/tool.ts` and are no longer used here, the `book` function, and the `case`s for `book`, `notepad`, `pencil`, `magnifier`, `tablet` and `mallet`.
3. Add `import { SLOT_OF, toolOf } from './tools/index.ts';`.
4. Make `drawProp`:

```ts
export function drawProp(sk: Sketch, pr: Prop, at: V, L: Look, item: Color | null, back: boolean): void {
  sk.push(mul(move(at[0], at[1]), turn(pr.a)));
  const slot = SLOT_OF[pr.kind];
  if (slot) toolOf(L.costume, slot).draw(sk, pr.v, L, back);
  else {
    switch (pr.kind) {
      case 'mug':
        mug(sk, L, pr.v, pr.a);
        break;
      case 'block':
        cube(sk, item ?? '#8e8996', 2.0);
        break;
      case 'thought':
        thought(sk, pr.v);
        break;
      case 'spark':
        // today's spark body, unchanged
        break;
      case 'sweat':
        // today's sweat body, unchanged
        break;
    }
  }
  sk.pop();
}
```

with the `spark` and `sweat` bodies kept exactly as they are.

In `src/art/figure/body.ts`, change `add(propZ(pr, back), () => drawProp(sk, pr, at, L, v.item));` to `add(propZ(pr, back), () => drawProp(sk, pr, at, L, v.item, back));`.

- [ ] **Step 8: Run the tests and the typecheck**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test test/tools.test.ts test/figure.test.ts`
Expected: typecheck clean. In `tools.test.ts` the slot and envelope tests PASS; the from-behind test FAILS for `write` (typing shows no tool from behind) and `web` (the tablet is hidden), maybe `read`; the `todo` test reports todo. `figure.test.ts` PASSES unchanged: figures look as before (only where the drawing code lives changed).

- [ ] **Step 9: Hand straight on to Task 5**

The from-behind test is red here; Task 5 turns it green. The coordinator commits Tasks 4 and 5 together (Task 5, Step 6).

---

## Task 5: Tools held beside the body from behind

**Files:**
- Modify: `src/art/figure/rig.ts` (the `write`, `read` and `web` cases of `rigFor`)

- [ ] **Step 1: Confirm the failing test**

Run: `node --test --test-name-pattern="seen from behind" test/tools.test.ts`
Expected: FAIL naming `write` and `web` frames (and possibly `read`).

- [ ] **Step 2: The write pose from behind**

In `rigFor`, `case 'write'`, replace the `if (c.back) { … }` branch (typing) with:

```ts
      if (c.back) {
        // from behind (at the desk): the surface held out at the near side,
        // the writer going over it, both past the body
        const w = Math.sin(u * TAU * 2);
        r.arms[1] = arm([3.2, -2.9], 1, { fwd: true });
        r.arms[0] = arm([1.4 + 0.2 * w, -2.75 + 0.12 * c1], 1, { fwd: true });
        r.props.push(prop('notepad', 1, 0.6, -0.3, 0.3));
        r.props.push(prop('pencil', 0, 0.1, -0.2, -0.15));
      } else {
```

(the `else` branch, scribbling in a notepad from the front, stays as it is).

- [ ] **Step 3: The read pose from behind**

In `case 'read'`, replace the two `r.arms` lines and the `r.props.push(prop('book', …))` line with:

```ts
      const turning = turnV < 1 && u < 0.22 ? turnV : 0;
      if (c.back) {
        // from behind: held open at the near side
        r.arms[0] = arm([1.2, -2.6], 1, { fwd: true });
        r.arms[1] = arm([3.4, -2.75], 1, { fwd: true });
        r.props.push(prop('book', -1, 3.0, -3.2, 0.22, turning));
      } else {
        r.arms[0] = arm([0.5, -2.35], 1, { fwd: true });
        r.arms[1] = arm([3.05, -2.45], 1, { fwd: true });
        r.props.push(prop('book', -1, 1.8, -3.05, -0.08, turning));
      }
```

- [ ] **Step 4: The web pose from behind**

In `case 'web'`, replace the two `r.arms` lines and the `r.props.push(prop('tablet', …))` line with:

```ts
      if (c.back) {
        // from behind: held up and out at the near side, a thumb going over it
        r.arms[1] = arm([3.55, -3.9], 1, { fwd: true });
        r.arms[0] = arm([1.3 + 0.25 * swipe, -3.0], 1, { fwd: true });
        r.props.push(prop('tablet', 1, 0.6, -0.5, -0.25, Math.floor(u * 2)));
      } else {
        r.arms[0] = arm([1.0 + 0.55 * swipe, -2.85 - 0.2 * swipe], 1, { fwd: true });
        r.arms[1] = arm([3.55, -2.95], 1, { fwd: true });
        r.props.push(prop('tablet', -1, 2.3, -3.0, 0.08, Math.floor(u * 2)));
      }
```

- [ ] **Step 5: Run and tune**

Run: `node --test test/tools.test.ts test/figure.test.ts`
Expected: the from-behind test PASSES; `figure.test.ts` PASSES (its "every pose, facing, species and costume" test checks nothing is clipped). If a pose still fails, move its tool further out (larger x in the hold) a few tenths at a time; if a figure test reports clipping, move it back in. Then look: `node scripts/scene-shot.ts mines <scratchpad>/behind.png --at 40 --size 150x46 --zoom 4 --select 2`. A writer's pad and pencil, a reader's book and a browser's tablet show beside their backs at their desks, held, not floating.

- [ ] **Step 6: Commit Tasks 4 and 5 (coordinator)**

```bash
git add src/world/character.ts src/art/figure/tools src/art/figure/props.ts src/art/figure/body.ts src/art/figure/rig.ts test/tools.test.ts
git commit -m "feat(figure): the work tools in a library, held beside the body from behind

Every costume still holds today's five; each world's come next.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 6: The beat poses

**Files:**
- Modify: `src/world/character.ts` (the `Pose` type and its comment)
- Modify: `src/art/figure/rig.ts` (`LOOP`, four cases in `rigFor`)
- Modify: `test/figure.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/figure.test.ts`, change the rig import to `import { blinkAt, frameOf, LOOP, MUG_POSES, rigFor } from '../src/art/figure/rig.ts';` and append:

```ts
const atRest = { back: false, walking: false, walkU: 0, item: false, mug: false };

test('the beats at work: each starts at rest and moves away from it mid-loop', () => {
  for (const pose of ['glance', 'lean', 'scratch', 'tap'] as Pose[]) {
    const [per, n] = LOOP[pose];
    const first = rigFor(pose, 0, atRest);
    assert.ok(Math.abs(first.lean) <= 0.03 && Math.abs(first.tilt) <= 0.05, `${pose}: not at rest at its start`);
    const sprites = new Set(Array.from({ length: n }, (_, i) => hash(figureSprite(fig(who('human', 1), 'casual', pose, { poseT: ((i + 0.5) * per) / n, phase: 0 }), 4, INK))));
    assert.ok(sprites.size >= 3, `${pose}: ${sprites.size} different frames`);
  }
  assert.ok(rigFor('lean', LOOP.lean[1] / 2, atRest).lean >= 0.2, 'a lean that does not lean in');
  assert.ok(Math.max(...Array.from({ length: LOOP.glance[1] }, (_, i) => rigFor('glance', i, atRest).tilt)) >= 0.1, 'a glance with no nod');
  const rest = rigFor('idle', 0, atRest).legs[1].foot[1];
  assert.ok(Array.from({ length: LOOP.tap[1] }, (_, i) => rigFor('tap', i, atRest).legs[1].foot[1]).some((y) => y < rest - 0.3), 'a tap that never lifts the foot');
});

test('a scratch: a hand up by the side of the head mid-loop, down at its start, on every species', () => {
  const s = 8;
  const [per, n] = LOOP.scratch;
  for (const sp of SPECIES) {
    const tr = who(sp, 1);
    const at = (i: number) => figureSprite(fig(tr, 'casual', 'scratch', { poseT: ((i + 0.5) * per) / n, phase: 0 }), s, INK);
    const hand = lookOf(tr, 'casual').hand;
    assert.ok(highest(pixelsAt(at(n / 2), s, hand)) > 9.5, `${sp}: the hand reaches ${highest(pixelsAt(at(n / 2), s, hand))} mid-scratch`);
    assert.ok(highest(pixelsAt(at(0), s, hand)) < 8.5, `${sp}: the hand already up at the start`);
  }
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test --test-name-pattern="beats at work|a scratch" test/figure.test.ts`
Expected: FAIL (`LOOP[pose]` is undefined for `glance`).

- [ ] **Step 3: The poses**

In `src/world/character.ts`, make the `Pose` type and its comment:

```ts
// Work poses follow the agent's activity; the rest are the little life in
// between: sitting, carrying a block (and placing it on a build), cheering,
// waving, sipping a drink, stretching, chatting face to face, flinching at a
// bang, dancing, petting a critter; office life's high-five and a sip
// from a mug held in both hands; and the beats at work (see BEATS in
// life.ts): a glance at the screen with a nod, leaning in, a scratch of
// the head, a tap of the foot.
export type Pose =
  | 'idle' | 'walk' | 'write' | 'read' | 'think' | 'run' | 'search' | 'web' | 'delegate' | 'talk' | 'done' | 'error' | 'sleep'
  | 'sit' | 'carry' | 'place' | 'cheer' | 'wave' | 'drink' | 'stretch' | 'chat' | 'flinch' | 'dance' | 'pet'
  | 'highfive' | 'sip'
  | 'glance' | 'lean' | 'scratch' | 'tap';
```

In `src/art/figure/rig.ts`, add to `LOOP` after `sip: [2, 12],`:

```ts
  glance: [1.6, 12], lean: [2.2, 12], scratch: [1.2, 12], tap: [0.9, 9],
```

and these cases to `rigFor`, after `case 'sip'`:

```ts
    case 'glance': {
      // a look over at the screen, two nods, and back
      const k = ease(u, 0, 0.2) - ease(u, 0.8, 1);
      const nod = Math.max(0, Math.sin(u * TAU * 2)) * k;
      r.face.look = [0.8 * k, 0.1 * k];
      r.tilt = 0.12 * nod;
      r.lean = 0.05 * k;
      r.face.mouth = nod > 0.5 ? 'smile' : 'small';
      r.arms[0] = arm([0.9, -2.4], 1, { fwd: true });
      r.arms[1] = arm([2.6, -2.45], 1, { fwd: true });
      break;
    }
    case 'lean': {
      // leaning in at the screen, chin on a hand, and back
      const k = ease(u, 0, 0.3) - ease(u, 0.75, 1);
      r.lean = 0.3 * k;
      r.tilt = 0.1 * k;
      r.pelvis[1] += 0.25 * k;
      r.face.eyes = k > 0.5 ? 'wide' : 'open';
      r.face.brows = 'focus';
      r.face.mouth = 'small';
      r.arms[1] = arm([2.2 + 0.4 * k, -2.4 - 2.2 * k], 1, { fwd: true, high: k > 0.6 });
      r.arms[0] = arm([1.2, -2.3], 1, { fwd: true });
      break;
    }
    case 'scratch': {
      // a hand up to the side of the head, scratching, puzzled
      const k = ease(u, 0, 0.2) - ease(u, 0.85, 1);
      const w = Math.sin(u * TAU * 4) * k;
      r.arms[1] = arm([2.4 + 0.2 * w, -2.4 - 5.4 * k + 0.25 * Math.abs(w)], 1, { high: k > 0.5, grip: 'open' });
      r.tilt = -0.08 * k;
      r.face.eyes = k > 0.3 ? 'up' : 'open';
      r.face.look = [0.3 * k, -0.3 * k];
      r.face.mouth = k > 0.3 ? 'wavy' : 'small';
      r.face.brows = k > 0.3 ? 'worried' : 'none';
      break;
    }
    case 'tap': {
      // arms folded, a foot tapping three times, waiting on something
      const tap = Math.max(0, Math.sin(u * TAU * 3));
      r.legs[1] = { foot: [FEET[1][0] + 0.3, FEET[1][1] - 0.45 * tap], ang: -0.25 * tap, bend: -1 };
      r.arms[0] = arm([1.6, -2.9], 1, { fwd: true });
      r.arms[1] = arm([0.4, -2.75], 1, { fwd: true });
      r.face.mouth = 'flat';
      r.face.look = [0.3, 0];
      r.chest = 0.06 * tap;
      break;
    }
```

- [ ] **Step 4: Run and tune**

Run: `node --test test/figure.test.ts`
Expected: PASS, including "every pose, facing, species and costume gives a sane sprite" (it now covers the four new poses, both ways round, every costume). If the scratch hand does not reach 9.5 units, raise `-5.4 * k` toward `-5.8 * k`; if it clips the head badly from the front, lower it. To look, write a short script in the scratchpad that draws `figureSprite` frames of the four poses for two species onto one `Canvas` and saves it with `encodeRgb(canvas, 0xf4f0e8)` from `src/art/png.ts`.

- [ ] **Step 5: Commit (coordinator)**

```bash
git add src/world/character.ts src/art/figure/rig.ts test/figure.test.ts
git commit -m "feat(figure): four beats at work: a glance and a nod, a lean, a scratch, a tap

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 7: Beats at work

**Files:**
- Modify: `src/world/life.ts` (constants, `Gesture`, `Mind.micro`, `newMind`, `Look`, `changed`, `work`, `gesture`, `looks`)
- Modify: `src/world/stage.ts` (`FACES_STATION` near line 110; `poseT` and `phase` in `frame` near line 1335)
- Modify: `test/life.test.ts`

- [ ] **Step 1: Write the failing tests**

In `test/life.test.ts`, change `import { SLEEP_AFTER } from '../src/world/life.ts';` to `import { BEATS, SLEEP_AFTER } from '../src/world/life.ts';` and add:

```ts
import { LOOP, frameOf } from '../src/art/figure/rig.ts';
import type { FigureFrame } from '../src/world/frame.ts';
```

Add, under the `pose` helper near the top:

```ts
const BEAT_POSES = new Set<Pose>(['glance', 'lean', 'stretch', 'scratch', 'tap']);
```

In the test `'workers keep at it, with an occasional break, and cheer a new file'`, change `>= 0.85` to `>= 0.75`, and the breaks line to:

```ts
  assert.ok([...BEAT_POSES].some((p) => count.has(p)), `no beats: ${[...count.keys()].join(', ')}`);
```

Then append:

```ts
// A lone writer settled at its desk, then `secs` seconds of work: each
// beat as it began (when, its pose, whether it showed its back).
function beats(office: boolean, secs = 120): Array<{ at: number; pose: Pose; back: boolean }> {
  const stage = newStage();
  stage.office = office;
  const now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  const out: Array<{ at: number; pose: Pose; back: boolean }> = [];
  const [x, y] = [w.x, w.y];
  let was: Pose | null = null;
  run(stage, () => [agent('w', 'write')], secs, now, (n) => {
    const look = stage.lookOf(w, n);
    if (BEAT_POSES.has(look.pose) && look.pose !== was) out.push({ at: n, pose: look.pose, back: look.facing.back });
    if (BEAT_POSES.has(look.pose)) assert.ok(Math.hypot(w.x - x, w.y - y) < 1e-9, `a ${look.pose} moved it`);
    was = look.pose;
  });
  return out;
}

test('at work, a beat every 6 to 15 seconds, the same every run, office life or not: a glance and a nod, leaning in, a stretch, a scratch, a tap', () => {
  const a = beats(false);
  assert.deepEqual(beats(false), a, 'not the same every run');
  assert.ok(a.length >= 7, `${a.length} beats in two minutes`);
  for (let k = 1; k < a.length; k++) {
    const gap = (a[k].at - a[k - 1].at) / 1000;
    assert.ok(gap >= 6 - 0.05 && gap <= 15 + 0.1, `${gap.toFixed(2)} s between beats`);
  }
  assert.ok(new Set(a.map((b) => b.pose)).size >= 4, `only ${[...new Set(a.map((b) => b.pose))].join(', ')}`);
  for (const b of a) assert.equal(b.back, b.pose === 'glance' || b.pose === 'lean' || b.pose === 'tap', `a ${b.pose} ${b.back ? 'with its back to us' : 'facing us'}`);
  assert.ok(beats(true, 60).length >= 3, 'no beats with office life on');
});

test('a beat lasts whole loops of its pose and begins at its first frame', () => {
  for (const [p, , secs] of BEATS) {
    const k = secs / LOOP[p][0];
    assert.ok(Math.abs(k - Math.round(k)) < 1e-9 && secs >= 1 && secs <= 2.5, `${p}: ${secs} s, ${k} loops`);
  }
  const stage = newStage();
  stage.office = false;
  const now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  w.mind.gestures = [];
  w.mind.micro = 0;
  let first: FigureFrame | undefined;
  run(stage, () => [agent('w', 'write')], 0.5, now, (n) => {
    const g = stage.frame(n)!.figures.find((f) => f.id === 'w')!;
    if (!first && BEAT_POSES.has(g.pose)) first = g;
  });
  assert.ok(first, 'no beat');
  assert.equal(frameOf(first.pose, first.poseT, first.phase), 0, `a ${first.pose} began mid-loop`);
});

test('no beat starts under an emote or over a high-five; a change of activity ends one at once', () => {
  const stage = newStage();
  stage.office = false;
  let now = run(stage, () => [agent('w', 'write')], 10);
  const w = byId(stage, 'w');
  const noBeat = (why: string) => (n: number) => assert.ok(!BEAT_POSES.has(pose(stage, w, n)), why);
  w.mind.gestures = [];
  w.mind.micro = 0;
  stage.life.emote(w, 'idea', 2);
  now = run(stage, () => [agent('w', 'write')], 1.5, now, noBeat('a beat under an emote'));
  let began = false;
  now = run(stage, () => [agent('w', 'write')], 1, now, (n) => {
    began ||= BEAT_POSES.has(pose(stage, w, n));
  });
  assert.ok(began, 'no beat once the emote went');
  w.mind.gestures = [];
  w.mind.micro = 0;
  stage.life.gesture(w, 'highfive', 1.3, { hold: false });
  now = run(stage, () => [agent('w', 'write')], 1.2, now, noBeat('a beat over a high-five'));
  w.mind.gestures = [];
  w.mind.emote = null;
  w.mind.micro = 0;
  now = run(stage, () => [agent('w', 'write')], 0.1, now);
  assert.ok(BEAT_POSES.has(pose(stage, w, now)), 'no beat to break into');
  now = run(stage, () => [agent('w', 'read', { since: now })], 0.05, now);
  assert.equal(pose(stage, w, now), 'read');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test --test-name-pattern="beat" test/life.test.ts`
Expected: FAIL, `does not provide an export named 'BEATS'`.

- [ ] **Step 3: Beats in `src/world/life.ts`**

After the `STANDUP_*` constants, add:

```ts
// A worker's beats (see work): one every BEAT_EVERY seconds (its own
// rhythm), weighted, each lasting whole loops of its pose (see LOOP in
// art/figure/rig.ts), so it eases out of rest and back: a glance at the
// screen and a nod, leaning in, a stretch, a scratch of the head, a tap of
// the foot. Work motion, not office life: on either way.
export const BEAT_EVERY: readonly [number, number] = [6, 15];
export const BEATS: ReadonlyArray<readonly [Pose, number, number]> = [
  ['glance', 3, 1.6],
  ['lean', 3, 2.2],
  ['stretch', 2, 2.4],
  ['scratch', 2, 1.2],
  ['tap', 2, 1.8],
];
```

Make `Gesture` and its comment:

```ts
// A short pose over whatever else is going on: a wave, a cheer, a flinch,
// a stretch. `hold` stops a walker for its length; `beat` marks a worker's
// beat (see BEATS), which a change of activity ends.
export type Gesture = { pose: Pose; at: number; until: number; face?: Spot; hold: boolean; beat?: boolean };
```

In `Mind`, change the comment of `micro` to `// clock time of a worker's next beat`; in `newMind`, change `micro: clock + rng.range(8, 20),` to `micro: clock + rng.range(BEAT_EVERY[0], BEAT_EVERY[1]),`.

Make `Look` and its comment:

```ts
// What a character looks like right now: its pose, what it faces, the
// colour (an index into the world's build colours) of a block it holds,
// whether it carries a mug of coffee, and for a beat when it began (life
// clock: its pose starts at its first frame then).
export type Look = { pose: Pose; face?: Spot; item?: number; mug?: boolean; since?: number };
```

In `changed`, make the first lines:

```ts
  changed(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    m.gestures = m.gestures.filter((g) => !g.beat);
    m.exit = 0;
```

Replace `work` with:

```ts
  // Workers keep at it, with a beat now and then (see BEATS), and a cheer
  // for a new file. No beat on an errand (a huddle, a high-five) or over a
  // gesture; one under an emote waits for it to go.
  private work(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    if (a.state !== 'work' || !a.station || a.path.length || m.errand || m.gestures.length) return;
    if (m.cheer) {
      m.cheer = false;
      if (c - m.celebrated >= 8) {
        m.celebrated = c;
        this.gesture(a, 'cheer', 0.9, { hold: false });
        this.emote(a, m.rng.pick<Emote>(['star', 'idea', 'note']), 1.6);
      }
      return;
    }
    if (c < m.micro || (m.emote && m.emote.until > c)) return;
    m.micro = c + m.rng.range(BEAT_EVERY[0], BEAT_EVERY[1]);
    const [pose, , secs] = m.rng.weighted(BEATS.map((b) => [b, b[1]] as const));
    this.gesture(a, pose, secs, { hold: false, beat: true });
  }
```

Make `gesture` take `beat`:

```ts
  gesture(a: Actor, pose: Pose, secs: number, o: { delay?: number; face?: Spot; hold?: boolean; beat?: boolean } = {}): void {
    const at = this.clock + (o.delay ?? 0);
    const g: Gesture = { pose, at, until: at + secs, hold: o.hold ?? true };
    if (o.face) g.face = { x: o.face.x, y: o.face.y };
    if (o.beat) g.beat = true;
    const gs = a.mind.gestures;
    gs.push(g);
    if (gs.length > 4) gs.splice(0, gs.length - 4);
  }
```

In `looks`, change `if (g) return g.face ? { pose: g.pose, face: g.face } : { pose: g.pose };` to:

```ts
    if (g) {
      const out: Look = { pose: g.pose };
      if (g.face) out.face = g.face;
      if (g.beat) out.since = g.at;
      return out;
    }
```

- [ ] **Step 4: Beats in `src/world/stage.ts`**

Make `FACES_STATION` and its comment:

```ts
// Poses done with the back to the viewer, facing the prop: the work, and
// the beats at it that look its way (a glance, a lean, a tap; a scratch
// and a stretch turn to us).
const FACES_STATION = new Set<Pose>(['write', 'read', 'search', 'web', 'run', 'think', 'glance', 'lean', 'tap']);
```

In `frame`, add the comment `// A beat's pose runs from its first frame (see Look.since).` above `const fig: FigureFrame = {`, and change its two fields:

```ts
        poseT: look.since !== undefined ? c - look.since : t + a.gait,
        phase: look.since !== undefined ? 0 : a.phase / 997,
```

- [ ] **Step 5: Run the tests**

Run: `node --test test/life.test.ts test/office-life.test.ts test/stage.test.ts test/workstations.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS. If an office-life test fails because a worker now has a beat where it held still: beats start only with no errand and no gesture, so look for a test that empties `gestures` by hand and then expects a still pose; keep the test's intent and allow the beat poses there.

- [ ] **Step 6: Commit (coordinator)**

```bash
git add src/world/life.ts src/world/stage.ts test/life.test.ts
git commit -m "feat(life): beats at work every 6 to 15 seconds, office life on or off

They replace the stretch, drink and look round every 14 to 30 seconds.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Task 8: Groundwork check

- [ ] **Step 1: Everything**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts" 2>&1 | tail -15`
Expected: typecheck clean; every test passes, two `todo` (the worlds' desk art, the tool art).

- [ ] **Step 2: Look**

Render `mines`, `cafe` and `office` at `--at 40 --zoom 4 --select 2` into the scratchpad and look: desks as before, tools beside the backs at the desks, an agent now and then glancing, leaning, tapping. Nothing offset or doubled.

---

## Tasks 9–14: Each world's desk clutter and loops (in parallel)

One task an agent, each in its worlds' own files only:

| Task | Worlds (directory under `src/worlds/`, test file under `test/`) |
| --- | --- |
| 9 | `mines`, `lab`, `club` |
| 10 | `den`, `station`, `cafe` |
| 11 | `fungal`, `snowy`, `vault` |
| 12 | `hell`, `dunes`, `meadhall` |
| 13 | `starfall`, `shelter`, `colony` |
| 14 | `office` |

**Files (for each world `<w>` of the task):**
- Modify: `src/worlds/<w>/workstation.ts` (and `src/worlds/<w>/bits.ts` for a helper the room's art can share)
- Modify: `test/<w>.test.ts`

**What to build, for each world:**

1. `clutter.items`: 8 to 12 `Clutter` things in the world's style (the ideas below are a start; the world's own art and research come first). Each has a unique camelCase `name`, `r` ≤ 0.5, `h` ≤ 1.5, and is drawn with the world's kit (`kitOf(v)` from `./kit.ts`) standing at `at`, never reading `v.t`. It may light up while `v.active`. Something taller belongs in the desk's body or in a loop.
2. `clutter.spots`: at least 4 spots on the top (u, v, z: z the top's surface), each pair at least `2 × (the pool's largest r) + 0.2` apart, at least 1.75 from `top`. Every thing must pass at every spot, in both frames: not painted over the screen, not behind the agent at work. The free room is a thin strip between the agent's figure and the screen, and it differs from desk to desk: map it with `node scripts/desk-spots.ts <w> <r> <h>` (`.` free, `S` over the screen, `A` behind the agent, `U` too near the upgrade), using your pool's largest r and h. Small, low things give more spots; the lab's desk, the tightest, wants things at most 0.4 round and 1.2 tall.
3. Take off the desk's own top whatever is now in the pool: things standing on the top that are not the screen, its frame or its structure, look-dependent ones included (like the mines' gold pan). Keep the three looks (`v.seed`) for what is under or part of the desk.
4. `loops`: 1 or 2 `DeskLoop`s, 4 to 8 frames, at most 8 a second, frame 0 the still one (unlit when `!v.active`). Each stays inside the desk's footprint and clear of the screen, the upgrade, the agent and the clutter's spots (at least its `r` plus the pool's largest `r` from each). Loops have more room than clutter (v from 0.5 to 2.5, and only `r + 1` from `top`): the front right corner by the upgrade often suits one, as the candle below. Every frame paints something, lit or not (a loop of steam draws its cup too); it never reads `v.t` and is the same on every look. The desk's `draw` no longer paints what a loop paints (for example the lantern's lit flame).
5. The comment block at the top of `workstation.ts` says what the pool and the loops are.
6. A test in `test/<w>.test.ts` (import `workstationOf` from `../src/worlds/workstation.ts`; `<world>` is the world's const, like `mines`):

```ts
test('<world name>: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(<world>);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});
```

**An example, the mines' tin cup and a candle loop** (the kit's helpers as `cup()` in the mines' `workstation.ts` uses them):

```ts
import type { Clutter, DeskLoop } from '../types.ts';

// A tin cup, its handle on the +u side.
const tinCup: Clutter = {
  name: 'tinCup',
  r: 0.5,
  h: 0.6,
  draw(v, [u, w, z]) {
    const k = kitOf(v);
    k.cyl(u, w, z, 0.3, 0.55, C.steel, { line: k.thin });
    k.disc(u, w, z + 0.55, 0.22, shade(C.steel, -0.35), 0);
    const handle: P3[] = [[u + 0.3, w, z + 0.45], [u + 0.48, w, z + 0.38], [u + 0.46, w, z + 0.17], [u + 0.3, w, z + 0.12]];
    k.line(handle, INK, Math.max(1, 0.16 * k.s));
    k.line(handle, C.steel, Math.max(0.6, 0.08 * k.s));
  },
};

// A candle stub in a dish at the top's front right; its flame sways while
// the desk is worked, out while it is not.
const CANDLE: P3 = [6.2, 2.2, TOP];
const candle: DeskLoop = {
  name: 'candle',
  at: CANDLE,
  r: 0.5,
  h: 1.6,
  frames: 6,
  fps: 6,
  draw(v, i) {
    const k = kitOf(v);
    const [u, w, z] = CANDLE;
    k.cyl(u, w, z, 0.42, 0.1, C.iron, { line: k.thin });
    k.cyl(u, w, z + 0.1, 0.16, 0.55, '#efe6d0', { line: k.thin });
    if (!v.active) return;
    const sway = [0, 0.04, 0.07, 0.04, 0, -0.04][i];
    const tall = [0.5, 0.56, 0.48, 0.54, 0.5, 0.46][i];
    k.poly([[u + sway * 2, w, z + 0.65 + tall], [u + 0.1, w, z + 0.7], [u - 0.1, w, z + 0.7]], '#ffb43a', k.thin);
  },
};
```

**Ideas** (a start, not a list to copy):

| World | Clutter | Loops |
| --- | --- | --- |
| mines | ore with gold, tin cup, coil of fuse, candle stub, gold pan with nuggets, lump of coal, chisel, oil can, a canary's cage | candle flame, or the lantern's flame where it shows |
| lab | beaker, rack of test tubes, flask of something green, petri dish, brain in a jar, spirit burner, goggles, magnet | bubbling flask, a tesla coil's spark |
| club | vinyl record, headphones, glow sticks, cassette, sticker-covered speaker, disco ball, sunglasses | turning disco ball, an equaliser's lights |
| den | energy drink can, pizza box, rubber duck, cactus, game controller, cable tangle, mug, keycaps | blinking router lights, a lava lamp |
| station | food pouch, model planet, tether clip, ration bar, plant in a pod, torch, patch kit | blinking beacon, turning holo-planet |
| cafe | latte with art, croissant, sugar jar, vase of flowers, cupcake, teapot, cookie jar, menu card | steam off a cup, a candle in a jar |
| fungal | glowing mushrooms in a pot, snail, spore jar, moss, crystal, acorn cup, beetle, fern | a mushroom cap's pulse, a puff of spores |
| snowy | thermos, snow globe, mittens, cocoa, compass, ice chunk, tin can, pine cone | snow globe swirl, steam off cocoa |
| vault | stack of coins, gem, money bag, cash box, abacus, ink pot, scales, key ring | desk clock pendulum, a gleam crossing the coins |
| hell | skull, goblet, bones, black candle, potion, chain, horned figurine, hourglass | black candle flame, bubbling cauldron |
| dunes | canteen, cactus pot, compass, cow skull, sand jar, bolts, goggles, scrap | a turning wind vane, a little fan |
| meadhall | drinking horn, tankard, loaf, rune stones, small shield, antler, carved figure, fish | candle flame, a tankard's foam |
| starfall | ration cube, docked drone, cable spool, crystal shard, energy cell, helmet visor, sample tube | blinking indicator, turning hologram |
| shelter | tin cans, soda bottle (no brand), first-aid tin, dice, toy figure (no brand), gas mask, candle, ration box | blinking warning light, a wobbling desk fan |
| colony | horseshoe, tin cup, apple, rolled map, harmonica, seed pouch, cutting in a jar, oil lamp | oil lamp flame, a toy windmill |
| office | coffee cup, succulent, rubber duck, sticky notes, phone on a stand, energy bar, figurine, headphones | a desk toy (a swinging cradle), a notification light |

- [ ] **Step 1:** Add the world test above to `test/<w>.test.ts`; run `node --test test/<w>.test.ts`. Expected: FAIL, "no clutter to pick from".
- [ ] **Step 2:** Build the clutter, spots and loops; take the pooled things off the desk's own draw.
- [ ] **Step 3:** Run `node --test test/<w>.test.ts test/themes.test.ts test/desk-clutter.test.ts`. Expected: PASS, the world's contract test included (on the top, inside its box, clear of the screen, the upgrade and the agent).
- [ ] **Step 4:** Look: `node scripts/scene-shot.ts <w> <scratchpad>/<w>-desks.png --at 40 --size 150x46 --zoom 4 --select 2`, and with `--crew 4x4 --at 60` for a full room. Desks differ from each other; things sit on the top (not floating, not through the screen's frame); loops show on worked desks.
- [ ] **Step 5:** Report the files changed and each world's pool and loops. (The coordinator commits each task as `feat(<world>): desk clutter and loops`.)

---

## Tasks 15–19: Each world's tools (in parallel)

One task an agent, each in its grip's file only (`src/art/figure/tools/<grip>.ts`):

| Task | File | Slot(s) | Tools to draw (costumes) |
| --- | --- | --- | --- |
| 15 | `write.ts` | surface, writer | surfaces: slate (miner), clipboard (scientist, jumpsuit), flyer (raver), stickyNotes (hacker, startup), datapad (astronaut, exosuit), orderPad (casual), leaf (forager), notebook (parka, drifter, colonist), ledger (guard), scroll (demon), parchment (nord); writers: chalk (miner), marker (raver, hacker, startup), stylus (astronaut, exosuit), pen (casual), quill (forager, demon, nord), fountainPen (guard); pencil stays for scientist, parka, drifter, jumpsuit, colonist |
| 16 | `read.ts` | read | foldedMap (miner), labManual (scientist), vinylSleeve (raver), printout (hacker, startup), dataSlate (astronaut, exosuit), recipeBook (casual), fieldGuide (forager), map (parka, drifter), ledgerBook (guard), grimoire (demon), scroll (nord), manual (jumpsuit), almanac (colonist) |
| 17 | `run.ts` | run | pickaxe (miner), flask (scientist: shaken, a slosh and bubbles on the strike), drumstick (raver), screwdriver (hacker), wrench (astronaut, jumpsuit), whisk (casual), trowel (forager), iceAxe (parka), rubberStamp (guard: a print on the strike), trident (demon), spanner (drifter), axe (nord), multitool (exosuit), hammer (colonist), pingPongPaddle (startup) |
| 18 | `search.ts` | search | lantern (miner, parka), geigerCounter (scientist, jumpsuit), glowStick (raver), flashlight (hacker), scanner (astronaut, exosuit), magnifier stays (casual, startup), glowingMushroom (forager), loupe (guard), crystalBall (demon), dowsingRod (drifter), torch (nord), spyglass (colonist) |
| 19 | `web.ts` | web | crankRadio (miner), plasmaOrb (scientist), phone (raver, casual), laptop (hacker), holoProjector (astronaut, exosuit), sporeOrb (forager), radio (parka, drifter, jumpsuit, colonist), handset (guard), scryingMirror (demon), runeStone (nord); tablet stays (startup, wizard) |

**What to build:** each tool is a `Tool` with the design's `name`, drawn with the sketch API (`sk.blob`, `sk.limb`, `sk.draw`, `sk.at`, shading with `{ dark, d }`) in the figure style, like today's tool in the same file: chunky, outlined by the renderer, readable at s = 4. It keeps inside the slot's `ENVELOPE` (`tools/tool.ts`). Seen from behind (at the desk, the main view) the rig holds the tool so its working face (pages, screen, glass) still shows over the shoulder; use `back` only for what really differs from behind. A tool may use `L.color` (the agent's colour) for a detail. No text, no brands. The file's record then maps each costume to its tool, for example:

```ts
export const RUNS: Record<Costume, Tool> = { ...everyone(mallet), miner: pickaxe, scientist: flask, raver: drumstick, hacker: screwdriver, astronaut: wrench, jumpsuit: wrench, casual: whisk, forager: trowel, parka: iceAxe, guard: rubberStamp, demon: trident, drifter: spanner, nord: axe, exosuit: multitool, colonist: hammer, startup: pingPongPaddle };
```

An example, the pickaxe (a long handle along +x, a curved double-pointed head across its end):

```ts
// A miner's pick: a long ash handle, an iron head curving to two points.
const pickaxe: Tool = {
  name: 'pickaxe',
  draw(sk, v) {
    sk.limb([-0.45, 0, 2.9, 0], 0.4, WOOD, { dark: WOOD_D, line: 0.6 });
    sk.blob((p) => {
      p.moveTo(2.75, -0.35);
      p.quadraticCurveTo(3.0, -1.4, 3.55, -2.0);
      p.quadraticCurveTo(3.2, -1.2, 3.25, -0.3);
      p.lineTo(3.25, 0.3);
      p.quadraticCurveTo(3.2, 1.2, 3.55, 2.0);
      p.quadraticCurveTo(3.0, 1.4, 2.75, 0.35);
      p.closePath();
    }, METAL, { dark: METAL_D, d: 0.25 });
    if (v) {
      // sparks off the strike
      sk.draw((p, c) => {
        p.strokeStyle = '#ffd34a';
        p.lineWidth = Math.max(c.line, 1 / c.px);
        p.lineCap = 'round';
        p.beginPath();
        for (const a of [-0.7, 0.1, 0.8]) {
          p.moveTo(3.7 + Math.cos(a) * 0.3, 2.1 + Math.sin(a) * 0.3);
          p.lineTo(3.7 + Math.cos(a) * 0.9, 2.1 + Math.sin(a) * 0.9);
        }
        p.stroke();
      });
    }
  },
};
```

(Check it against `ENVELOPE.run`: y stays within ±2.2, plus half a unit.)

- [ ] **Step 1:** Run `node --test test/tools.test.ts` and read the `todo` test's output: the rows of your slot are the ones to make right. Other agents edit the other grip files at the same time; a failure that comes from a file you do not own is theirs, retry a little later.
- [ ] **Step 2:** Draw the tools; map the costumes.
- [ ] **Step 3:** Run `node --test test/tools.test.ts test/figure.test.ts`. Expected: every test passes; in the `todo` test's output no row of your slot is wrong and none of your tools "looks like" another.
- [ ] **Step 4:** Look: a short script in the scratchpad that, for each costume, draws `figureSprite` (from `src/art/figure.ts`) of your pose at s = 8, front and back, two frames, onto one `Canvas`, and saves it with `encodeRgb(canvas, 0xf4f0e8)` from `src/art/png.ts`. Each tool reads as what it is, held, in its costume's world. Also `node scripts/scene-shot.ts mines <scratchpad>/tools.png --at 40 --zoom 4 --select 2`.
- [ ] **Step 5:** Report what you drew. (The coordinator commits each as `feat(tools): each world's <grip> tools`.)

---

## Task 20: The art in, the `todo`s off

- [ ] **Step 1:** Remove `{ todo: "the worlds' desk art" }` from the test in `test/themes.test.ts` and `{ todo: 'the tool art' }` from the test in `test/tools.test.ts`.
- [ ] **Step 2:** Run `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts" 2>&1 | tail -15`. Expected: every test passes, none todo.
- [ ] **Step 3:** Commit (coordinator): `test: every world dresses its desks and holds its own tools`.

## Task 21: Review

- [ ] **Step 1:** A code review of `git diff 298ddac..HEAD -- src test`. The reviewer gets the diff and the spec, not this plan's conclusions. It checks keys and depth order, cache bounds, beats with office life, and comments in the codebase's voice.
- [ ] **Step 2:** An art review: render every world at `--at 40 --zoom 4 --select 2` and with `--crew 4x4 --at 60`, and the five tool sheets. Look for things floating or through a frame, tools that do not read, a loop that strobes, desks that look alike.
- [ ] **Step 3:** Fix what holds up; rerun the whole suite; commit each fix.

## Task 22: Captures and timing for the user

- [ ] **Step 1:** Ghostty captures, zoomed at desks in the mines, the café, hell and the office, before (`main`) and after; frame timing with twenty at work against `main`. Send them to the user.
- [ ] **Step 2:** Wait for the user's word on the look before the README and the pull request.

## Task 23: README and pull request (after the user's OK)

- [ ] **Step 1:** Update `README.md` (desks dressed in each world's things, each world's tools, beats) and regenerate `docs/screenshots/*` with the demo account "you".
- [ ] **Step 2:** Strip any `Claude-Session:` trailer from the branch's commit messages, push `world-life`, open the pull request, watch the required checks, fix until green, and merge once the user says so.
