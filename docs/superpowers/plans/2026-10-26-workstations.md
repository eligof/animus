# Workstations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every agent gets a workstation of its own, in every world: it pops up as the agent walks in, the agent does all its work there and its screen shows what it is doing; past the room's places, a newcomer stands at a teammate's side; when the agent leaves, its workstation stands empty a few seconds, then shrinks away. Shipped through a PR.

**Architecture:** Groundwork first, in shared code, test-first with complete code (Tasks 1–7): the stress test, red (Task 1); places for workstations planned with the room, in team pods (Task 2); the workstation contract, a plain workstation for every world and the shared activity layer (Task 3); workstations as cached sprites in the scene (Task 4); workstations going up and coming down with their agents, walked round (Task 5); desk upgrades on them (Task 6); and agents working at them, sharing past capacity (Task 7: the stress test turns green). Then each world draws its own workstation from a brief, in parallel, two or three worlds an agent, each owning only its worlds' files (Tasks 8–13). Then the coordinator reviews and commits the art (Task 14), takes stress screenshots and times frames in a real Ghostty before and after (Task 15), writes the README (Task 16) and ships through the CI loop (Task 17).

**Tech Stack:** TypeScript run directly by Node 26 (type stripping, no build), `node:test`, the zero-dependency rasterizer in `src/art/` (a Canvas2D-like `Pen`, isometric helpers, a PNG encoder), kitty graphics in Ghostty.

**Spec:** `docs/superpowers/specs/2026-10-26-workstations-design.md`. Art direction and the `Pen` contract: `docs/superpowers/specs/2026-10-24-illustrated-design.md`. The world conventions this plan builds on: "Conventions for every world" in `docs/superpowers/plans/2026-10-25-game-worlds.md`, with the changes listed under "Conventions" in Part B of `docs/superpowers/plans/2026-10-26-office.md`.

---

## Read this first

**What is proven.** Tasks 1–7 were applied from this text, mechanically
(each "replace" found exactly once, each "Create" written as given), to a
clean checkout of `stations` (09c0fc1), in order: each step's tests failed
first as the step says, then passed; the typecheck and the full suite ran
after each task with the counts given; each commit step ran as written.
Task 7 Step 6's renders were looked at (team pods on the open floor, every
agent at its own workstation, nothing in the walkways, the way in, the
plazas or the yard, no clumps at 150 x 46; at 80 x 24 a few pods and the
rest of the crew at teammates' sides, apart). For the art tasks each
world's workstation module (its frame, over a placeholder drawing: only
its shadow), its registration and its test were applied for all sixteen
worlds on top of Task 7: every world's test, the contract and the
typecheck pass, and the full suite counts 1427, as Task 14 expects. The
drawing code itself is written from each world's brief (about 100 to 250
lines a world: too much to inline for sixteen worlds), as in the
game-worlds plan. Task 16's README changes were applied to the README as
it stands.

**Decisions where the spec meets the code:**

1. **Places come after the stations and the decor.** A room plans its
   workstations' places last, on the open floor its stations, decor, pois,
   plazas and yard leave (`src/world/desks.ts`, called at the end of
   `planRoom`). That gives 25 at 150 x 46 and 28 at 200 x 60 (the cap,
   `deskCap`: 12 in the smallest room, 25 in a 143-unit one, 28 in the
   biggest), 19 at 120 x 36, 10 to 15 at 100 x 30, but only **3 to 5 at
   80 x 24**, not the spec's "about 12". The 72-unit room of an 80 x 24 terminal is full: its eight
   stations and the floor kept in front of them, the way in, two plazas,
   the yard, the idlers' spots and the decor leave room for a few pods
   (measured: a single desk with its agent and an aisle needs about 11 x 9
   units clear). Planning the places before the decor was tried: 9 to 12
   at 80 x 24, but it strips small rooms of their decor (the lab keeps 1
   of its 15 floor pieces) and of the spots idlers use, and fifteen tests
   across life, rooms and worlds fail (idlers that never get anywhere,
   worlds' own spots lost under desks, a dance floor built over). Past
   capacity agents share, apart (decision 4), so nothing breaks; the user
   may still prefer desks first in small rooms (a follow-up, not here).
2. **The workstation is 7 x 3 units and at most 10 tall** (`DESK` in
   `src/world/desks.ts`), its agent standing 2 out from its front and 2
   along (`DESK_SPOT`): left of its middle as the viewer sees it, in
   either frame, so the screen on its right stays in view. It is smaller
   than a station (the café's write station is 11 x 7): a pod of five fits.
3. **Pods.** A lead's place in the middle of a front row of three, two
   behind in the gaps (a row 13 units back: their agents stand in view
   over the front row's desks), or a row of five; then two and two, rows of three
   and two, one alone. Pods are placed one at a time, the biggest shape
   that fits first, each away from those before (up to 40 units), near
   the front middle, all turned alike unless the other way fits far
   better, snug against what stands there; a walkway runs round each pod.
   Places keep off the props (a unit), the floor in front of the stations
   (3 units round their spots), the way in (8 round its spot and its
   approach), the plazas and their piles, the yard, the hub and the ways
   from the door and the idle prop to it, and the idlers' spots (2); no
   desk stands in front of a station's front corner, an idler's spot, a
   plaza or another place's agent so as to hide it (as the stage judges
   a figure in view).
4. **Arrival, sharing, leaving.** Within one poll, leads come in before
   their subagents. A lead takes the lead's place of a pod nobody is in
   (else any lead's place, else the free place nearest the door); a
   subagent a place in its lead's pod nearest its lead's, else the free
   place nearest its lead's, sparing the lead's places of empty pods; a
   subagent whose lead is not in the room takes places as a lead does.
   With every place taken, a newcomer shares the teammate's workstation
   with the fewest at its side, standing on the first spot beside it that
   is free (a step past either end, then in front of the gaps, then on
   rings out to 12 units) on open floor, in view and 4 units (`WORK_APART`)
   from everyone; with none free by a teammate's, by anyone's; it moves to
   its own when a place comes free. A workstation left empty can be taken
   back by its agent, or by a newcomer, until it starts to shrink.
5. **Screens.** `talk` and `delegate` show speech balloons; `idle`, `done`,
   `error` and an empty workstation show a dim screen (the spec names idle
   and waiting; an error shows over the agent's head as before). The layer
   is static: a workstation's sprite is kept per world, ink, frame, look,
   screen, pop step and scale. A world may draw its workstation in three
   small variations (`v.seed`: 0, 1 or 2; a desk's index picks one), so a
   pod of five does not look stamped; the plain one has one look.
6. **The room's stations stand idle while everyone works.** Nobody works
   at a station any more: an animated station holds still, as it does
   when not worked. They stay as the scenery idle agents and office life
   use (the idle prop for naps, the drink and warm spots, views, the way
   in, the plazas, the yard). The workstations' screens carry the work.
7. **Tests that encoded station sharing change, each saying why** (Task 7
   lists them): a worker is at its own workstation, not the station for
   its activity; a crowd's lanes now serve only those asleep at the idle
   prop; the room's stations stand idle; a close-up of an agent at a
   workstation by the front of the room stops at the room's edge (the
   test now skips those); the high-five's fallback is tested with the six
   spots beside the lead blocked, as no workstation leaves none of them
   free; a chat hides its agent's own label (the label count stayed level
   when the room the chat frees showed a neighbour's); a mug's steam is
   compared just after the bang, as no worked station sparks. The desk
   upgrade tests change with the upgrades (Task 6).
8. **A huddle waits for its join window** (`life.ts`): a lead's
   workstation may stand by the door, so its first newcomer could arrive
   and start the huddle before the second came in; it now starts once all
   its members are there and no more can join (`HUDDLE_JOIN`), as its
   comment always said. The lead's "desk" for huddles and high-fives is
   its workstation: they already gather where the lead stands.
9. **The demo crew's pinned moves are unchanged.** Its source
   (`src/demo/source.ts`) is not touched, and nothing on the stage feeds
   back into it, so `test/demo.test.ts`'s pinned hash holds as it is; the
   demo's agents now work at workstations.

**The no-brand rule, for every task, file, comment, commit and picture:**
nothing copies a real company's logo, product or brand; no readable text,
letters or digits in a picture (screens show lines, bars and shapes);
monitors, laptops and consoles plain, no logo on a lid.

**Environment.** Work in `<repo>` (the checkout's absolute path: put it in
for `<repo>` wherever a command has it) on branch `stations` (from public
`main` at 32b9578; `main` is protected: everything ships through a PR).
Commands run from `<repo>` unless they say otherwise. The
repository's git identity is the maintainer's noreply address: do not
change it. Node is `/usr/bin/node`; there is no `npx` or `npm` on the PATH.

- Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p .` (no output when clean)
- All tests: `node --test "test/**/*.test.ts"` (1375 pass before Task 1)
- One file: `node --test test/stage.test.ts`
- Timing budgets can flake on a busy machine; rerun the file before chasing one.
- Scratch space: `$SCRATCH` (export it in every shell that runs a step that
  uses it; renders, contact sheets and the Ghostty harness live there,
  never in the repo).

**Commits.** Every commit message ends with exactly this line (the commit
steps below include it):

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

## File structure

| file | task | responsibility |
| --- | --- | --- |
| `src/demo/stress.ts` | 1 | a made-up crew: L leads with S subagents each, all at work, turning to something else every few seconds |
| `scripts/scene-shot.ts` | 1 | `--crew LxS`: render the stress crew instead of the demo crew |
| `test/workstations.test.ts` | 1, 5, 7 | the stress test (1); a workstation's life and the walking grid (5); sharing, budgets with twenty (7) |
| `src/world/types.ts` | 2 | `Desk`: a workstation's place |
| `src/world/desks.ts` | 2 | planning the places in team pods (`planDesks`, `DESK`, `DESK_SPOT`, `deskCap`, `deskZone`, `covers`) |
| `src/world/layout.ts` | 2 | `slotRect` takes a desk; `boxCount` (moved from `room.ts`) |
| `src/world/room.ts` | 2, 6 | `Room.desks` (2); comments where desk upgrades no longer stand (6) |
| `test/desks.test.ts` | 2 | the planner's guarantees |
| `src/worlds/types.ts` | 3 | `WorkstationArt` (a still prop naming its `screen` quad and its `top`), `WorldDef.workstation` |
| `src/worlds/workstation.ts` | 3 | the plain workstation in a world's colours; `workstationOf` |
| `src/art/screen.ts` | 3 | the shared activity layer |
| `src/world/frame.ts` | 3, 6 | `Screen`, `DeskFrame`, `SceneFrame.desks` (3); `TrinketFrame.z` (6) |
| `test/themes.test.ts` | 3 | the workstation contract for every world |
| `test/workstation-art.test.ts` | 3, 4, 5 | the layer and the plain workstation (3); sprites (4); keys in the plate (5) |
| `src/art/scene/desk.ts` | 4 | a workstation's sprite: art, screen, pop step; cached |
| `src/art/scene.ts` | 4, 6 | workstations among the depth-sorted things, warmed (4); an upgrade at its height (6) |
| `src/world/path.ts` | 5 | `NavGrid.rerate`: rate part of the routing grid again |
| `src/world/stage.ts` | 5, 6, 7 | workstations up and down with their agents, walked round (5); upgrades on them (6); agents at them, sharing (7) |
| `src/world/life.ts` | 7 | a huddle waits for its join window |
| `test/stage.test.ts`, `test/office-life.test.ts`, `test/world.test.ts`, `test/scene.test.ts`, `test/scene-plate.test.ts` | 1, 2, 4, 6, 7 | updated as each task says |
| `src/worlds/<id>/workstation.ts`, `src/worlds/<id>.ts`, `test/<id>.test.ts` | 8–13 | each world's own workstation, registered, tested |
| `README.md` | 16 | workstations in "What the characters do", the upgrades, office life, adding a world |

## Tool: a workstation's contact sheet (scratch, not in the repo)

The art tasks look at a workstation on its own with this. Create
`$SCRATCH/tools/desk-sheet.ts`:

```ts
// A world's workstation on its own, as the scene draws it: rows of the
// eight screens (write, read, search, run, web, think, talk, off) in each
// frame (right, then left) for each of its looks (0, 1, 2), then a row of
// its pop (each step, on the right wall), with a figure of the world's
// costume at its agent's spot in the first column of each row so its size
// reads. Usage:
//   node desk-sheet.ts <src dir> <world id | module file> <out.png> [s]
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const SRC = process.argv[2];
const { Canvas } = await import(`${SRC}/art/canvas.ts`);
const { encodeRgb } = await import(`${SRC}/art/png.ts`);
const { POP_STEPS, deskSprite } = await import(`${SRC}/art/scene/desk.ts`);
const { figureSprite } = await import(`${SRC}/art/figure.ts`);
const { inkOf } = await import(`${SRC}/art/scene.ts`);
const { getTheme } = await import(`${SRC}/themes/index.ts`);
const { traitsFor } = await import(`${SRC}/world/character.ts`);
const { DESK_SPOT } = await import(`${SRC}/world/desks.ts`);
const arg = process.argv[3];
const world = arg.endsWith('.ts') ? Object.values(await import(pathToFileURL(resolve(arg)).href)).find((v: any) => v && v.stations) : getTheme(arg);
if (!world) throw new Error(`no world ${arg}`);
const S = Number(process.argv[5] ?? 10);
const ink = inkOf(world);
const SCREENS = ['write', 'read', 'search', 'run', 'web', 'think', 'talk', 'off'];
const cw = Math.round(17 * S);
const ch = Math.round(20 * S);
const rows: Array<Array<{ wall: 'left' | 'right'; screen: string; grow: number; seed: number }>> = [];
for (const seed of [0, 1, 2]) for (const wall of ['right', 'left'] as const) rows.push(SCREENS.map((screen) => ({ wall, screen, grow: 1, seed })));
rows.push(Array.from({ length: POP_STEPS + 1 }, (_, k) => ({ wall: 'right' as const, screen: 'write', grow: k / POP_STEPS, seed: 0 })));
const c = new Canvas(cw * SCREENS.length, ch * rows.length);
const bd = world.backdrop;
c.fillStyle = `rgb(${bd[0]},${bd[1]},${bd[2]})`;
c.fillRect(0, 0, c.width, c.height);
const fig = (wall: 'left' | 'right') => figureSprite({ id: 'x', x: 0, y: 0, z: 0, traits: traitsFor('agent-7', 'sub'), costume: world.costume, pose: 'write', poseT: 0.3, phase: 0.2, facing: { back: true, flip: false }, selected: false, hurt: false, sleeping: false, walking: false }, S, ink);
rows.forEach((row, r) => {
  row.forEach((d, k) => {
    const x0 = k * cw;
    const y0 = r * ch;
    c.fillStyle = (k + r) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';
    c.fillRect(x0, y0, cw, ch);
    if (d.grow <= 0) return;
    const sp = deskSprite(world, d, S, ink);
    // its back corner at (0.42, 0.45) of the cell
    const ax = x0 + Math.round(cw * 0.42);
    const ay = y0 + Math.round(ch * 0.45);
    c.drawImage(sp.img, ax - sp.ax, ay - sp.ay);
    if (k === 0) {
      // its agent, in front of it (u, v) = DESK_SPOT in its frame
      const [u, v] = [DESK_SPOT.u, DESK_SPOT.v];
      const [x, y] = d.wall === 'right' ? [u, v] : [v, u];
      const f = fig(d.wall);
      c.drawImage(f.img, Math.round(ax + (x - y) * S) - f.ax, Math.round(ay + ((x + y) * S) / 2) - f.ay);
    }
  });
});
writeFileSync(process.argv[4], encodeRgb(c, (bd[0] << 16) | (bd[1] << 8) | bd[2], 2));
console.log(process.argv[4]);
```

It draws, for each of the world's three looks, a row of the eight screens
on each wall, a figure of the world's costume at its agent's spot in the
first cell of each row, and a last row of its pop (each step). Usage:
`node "$SCRATCH/tools/desk-sheet.ts" "$PWD/src" <world id or module file> <out.png> [scale]`.

## Part A: groundwork (one agent, in order, test-first)

Tasks 1–7 are done by one agent, in order, each on the commit before it.
Every "replace" below matches exactly one place in the file as it stands
after the tasks before it; every "Create" is the whole file. A step that
says a test fails must see it fail, for the reason given, before the code
that makes it pass goes in. After each task: the typecheck and the full
suite, with the counts given (the three stress tests stay red until
Task 7), then the commit as written.

### Task 1: The stress test, red; a stress crew for renders

**Files:**
- Create: `src/demo/stress.ts` (a made-up crew: L leads with S subagents each, all at work)
- Create: `test/workstations.test.ts` (the stress test; Tasks 5 and 6 add to it)
- Modify: `scripts/scene-shot.ts` (`--crew LxS`), `test/scene.test.ts` (its test)

The stress test is written first, against the stage as it is, so it fails
today for the reason the spec gives. It reads the workstations through two
small helpers that see none before Task 5 adds them; Task 7 swaps the
helpers for the real calls.

- [ ] **Step 1: The stress crew**

Create `src/demo/stress.ts`:

```ts
import type { Activity, AgentEvent, AgentInfo, AgentSource } from '../agents.ts';

// A made-up crew for stress tests and renders: `leads` leads with `subs`
// subagents each, all at work from the start, each turning to something
// else every four to ten seconds (never waiting, never done), the same
// every run.
const ACTS: readonly Activity[] = ['write', 'read', 'search', 'run', 'web', 'think', 'write', 'write', 'read', 'run'];

type Agent = { id: string; name: string; role: 'lead' | 'sub'; parentId?: string; activity: Activity; next: number; since: number };

export class StressSource implements AgentSource {
  readonly label = 'stress';
  private agents: Agent[] = [];
  private seed = 12345;

  constructor(leads: number, subs: number, start: number) {
    for (let l = 0; l < leads; l++) {
      this.agents.push({ id: `L${l}`, name: `lead ${l}`, role: 'lead', activity: 'write', next: start, since: start });
      for (let k = 0; k < subs; k++) this.agents.push({ id: `L${l}S${k}`, name: `sub ${l}.${k}`, role: 'sub', parentId: `L${l}`, activity: 'read', next: start, since: start });
    }
  }

  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    return this.seed / 2 ** 32;
  }

  poll(now: number): AgentInfo[] {
    for (const a of this.agents) {
      if (now < a.next) continue;
      a.activity = ACTS[Math.floor(this.rnd() * ACTS.length)];
      a.next = now + 4000 + this.rnd() * 6000;
      a.since = now;
    }
    return this.agents.map((a) => ({ id: a.id, name: a.name, role: a.role, parentId: a.parentId, project: '/stress', agentType: a.role === 'sub' ? 'general-purpose' : undefined, activity: a.activity, detail: `${a.activity} things`, since: a.since, lastSeen: now, crew: '/stress' }));
  }

  drainEvents(): AgentEvent[] {
    return [];
  }
}
```

- [ ] **Step 2: Write the stress test**

Create `test/workstations.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentInfo } from '../src/agents.ts';
import { StressSource } from '../src/demo/stress.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Spot } from '../src/world/types.ts';
import { WORLDS } from '../src/worlds/index.ts';

// The stress test: twenty agents at work (four leads with four subagents
// each, each turning to something else every few seconds) in every world,
// in a small, a usual and a big terminal. Each stands at a workstation of
// its own, or, once every place is taken, at a teammate's side; none
// stands within about four units of another.

const NOW = 1_700_000_000_000;
const SIZES: Array<[number, number]> = [[80, 24], [150, 46], [200, 60]];
const APART = 4;

const team = (a: AgentInfo) => (a.role === 'lead' ? a.id : (a.parentId ?? a.id));

// What the stage says of its workstations and of the places planned for
// them (see Stage.workstations and Room.desks): none, before there were
// any. (Written first, against the stage as it was.)
type Up = { desk: { spot: Spot }; owner: string | null };
const upOf = (stage: Stage): Up[] => (stage as unknown as { workstations?(): Up[] }).workstations?.() ?? [];
const placesOf = (stage: Stage): number => (stage.room() as unknown as { desks?: unknown[] }).desks?.length ?? 0;

test('the stress crew: four leads with four subagents each, all at work, each turning to something else every few seconds, the same every run', () => {
  const moves = (src: StressSource) => Array.from({ length: 60 }, (_, i) => src.poll(NOW + i * 500));
  const a = moves(new StressSource(4, 4, NOW));
  assert.deepEqual(a, moves(new StressSource(4, 4, NOW)));
  for (const crew of a) {
    assert.equal(crew.length, 20);
    assert.equal(crew.filter((x) => x.role === 'lead').length, 4);
    for (const x of crew) assert.ok(!['idle', 'done', 'error'].includes(x.activity), x.activity);
    for (const x of crew.filter((y) => y.role === 'sub')) assert.equal(crew.find((y) => y.id === x.parentId)?.role, 'lead');
  }
  // In 30 s each turns to something else at least twice, at most eight times.
  for (let k = 0; k < 20; k++) {
    const changes = a.slice(1).filter((crew, i) => crew[k].since !== a[i][k].since).length;
    assert.ok(changes >= 2 && changes <= 8, `${a[0][k].id}: ${changes} changes`);
  }
});

function stressed(world: (typeof WORLDS)[number], cols: number, rows: number, seconds = 12): { stage: Stage; crew: AgentInfo[] } {
  const stage = new Stage(world);
  stage.layout(computeLayout(cols, rows).scene);
  const src = new StressSource(4, 4, NOW);
  let now = NOW;
  let crew: AgentInfo[] = [];
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    crew = src.poll(now);
    stage.sync(crew, now);
    stage.update(0.05, now);
  }
  return { stage, crew };
}

for (const [cols, rows] of SIZES) {
  test(`${cols}x${rows}: twenty at work, each at a workstation of its own or at a teammate's side, none on top of another`, () => {
    for (const w of WORLDS) {
      const { stage } = stressed(w, cols, rows);
      const places = placesOf(stage);
      const up = upOf(stage);
      const actors = stage.actors();
      const tag = (a: Actor) => `${w.id} ${cols}x${rows}: ${a.info.id}`;
      assert.equal(actors.length, 20, w.id);
      // As many have their own as there are places.
      assert.equal(up.filter((x) => x.owner).length, Math.min(20, places), `${w.id} ${cols}x${rows}: ${places} places`);
      for (const a of actors) {
        assert.equal(a.state, 'work', `${tag(a)} is ${a.state}`);
        const own = up.find((x) => x.owner === a.info.id);
        if (own) {
          assert.equal(a.station, own.desk, `${tag(a)} not at its own`);
          assert.ok(Math.hypot(a.x - own.desk.spot.x, a.y - own.desk.spot.y) < 0.01, `${tag(a)} not at its spot`);
          continue;
        }
        // Sharing: a teammate's, when a teammate has one.
        const at = up.find((x) => x.desk === a.station);
        assert.ok(at?.owner, `${tag(a)} at no workstation`);
        const mates = up.filter((x) => x.owner && team(actors.find((o) => o.info.id === x.owner)!.info) === team(a.info));
        if (mates.length) assert.ok(mates.includes(at), `${tag(a)} at a stranger's`);
        assert.ok(Math.hypot(a.x - at.desk.spot.x, a.y - at.desk.spot.y) <= 12.5, `${tag(a)} far from the one it shares`);
      }
      for (let i = 0; i < actors.length; i++) {
        for (let j = i + 1; j < actors.length; j++) {
          const d = Math.hypot(actors[i].x - actors[j].x, actors[i].y - actors[j].y);
          assert.ok(d >= APART, `${tag(actors[i])} and ${actors[j].info.id} ${d.toFixed(1)} apart`);
        }
      }
    }
  });
}
```

- [ ] **Step 3: Run it to see it fail**

Run: `node --test test/workstations.test.ts`
Expected: the stress-crew test passes; the three stress tests FAIL, with
`mines 80x24: L0 at no workstation`, `mines 150x46: L0 is walk` (still
queueing for a crowded station after 12 seconds) and
`mines 200x60: L0 at no workstation`.

- [ ] **Step 4: `--crew` for scene-shot, test first**

In `test/scene.test.ts`, replace:

```ts
test('the screenshot script takes a world by its id or by its module file, so a world not registered yet can be looked at', async () => {
```

with:

```ts
test('the screenshot script renders a stress crew instead, if asked: leads and their subagents, all at work', async () => {
  const { shot } = await import('../scripts/scene-shot.ts');
  const o = { world: 'cafe', at: 6, cols: 80, rows: 24, cell: { w: 8, h: 16 }, zoom: 0, select: -1, full: true, dark: false };
  const crew = shot({ ...o, crew: [2, 3] }).png;
  assert.equal(crew.subarray(1, 4).toString('ascii'), 'PNG');
  assert.notDeepEqual(crew, shot(o).png);
});

test('the screenshot script takes a world by its id or by its module file, so a world not registered yet can be looked at', async () => {
```

Run: `node --test test/scene.test.ts`
Expected: FAIL: the new test (`shot` ignores `crew`: the two PNGs are the same).

In `scripts/scene-shot.ts`, replace:

```ts
//   node scripts/scene-shot.ts <world> <out.png> [--at 20] [--size 150x46]
//     [--cell 10x20] [--zoom 0] [--select -1] [--full] [--dark]
```

with:

```ts
//   node scripts/scene-shot.ts <world> <out.png> [--at 20] [--size 150x46]
//     [--cell 10x20] [--zoom 0] [--select -1] [--full] [--dark] [--crew 4x4]
```

In `scripts/scene-shot.ts`, replace:

```ts
// --dark: lighting off. Prints the PNG size, the first render's time (the
```

with:

```ts
// --dark: lighting off; --crew LxS: instead of the demo crew, L leads with
// S subagents each, all at work, changing tasks every few seconds (see
// demo/stress.ts). Prints the PNG size, the first render's time (the
```

In `scripts/scene-shot.ts`, replace:

```ts
import { Screen } from '../src/term/screen.ts';
```

with:

```ts
import { StressSource } from '../src/demo/stress.ts';
import { Screen } from '../src/term/screen.ts';
```

In `scripts/scene-shot.ts`, replace:

```ts
export function shot(o: { world: string | WorldDef; at: number; cols: number; rows: number; cell: { w: number; h: number }; zoom: number; select: number; full: boolean; dark: boolean }): { png: Buffer; pictures: number; ms: { first: number; frame: number; encode: number } } {
  const theme = typeof o.world === 'string' ? getTheme(o.world) : o.world;
  if (!theme) throw new Error(`unknown world "${o.world}"`);
  const w = new World({ theme, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~/.claude', start: DEMO_EPOCH, images: true, view: 'scene', lights: !o.dark });
```

with:

```ts
export function shot(o: { world: string | WorldDef; at: number; cols: number; rows: number; cell: { w: number; h: number }; zoom: number; select: number; full: boolean; dark: boolean; crew?: [number, number] }): { png: Buffer; pictures: number; ms: { first: number; frame: number; encode: number } } {
  const theme = typeof o.world === 'string' ? getTheme(o.world) : o.world;
  if (!theme) throw new Error(`unknown world "${o.world}"`);
  const live = o.crew ? new StressSource(o.crew[0], o.crew[1], DEMO_EPOCH) : null;
  const w = new World({ theme, live, demo: !live, account: { name: 'you', plan: '' }, rootLabel: '~/.claude', start: DEMO_EPOCH, images: true, view: 'scene', lights: !o.dark });
```

In `scripts/scene-shot.ts`, replace:

```ts
    options: { at: { type: 'string' }, size: { type: 'string' }, cell: { type: 'string' }, zoom: { type: 'string' }, select: { type: 'string' }, full: { type: 'boolean' }, dark: { type: 'boolean' } },
```

with:

```ts
    options: { at: { type: 'string' }, size: { type: 'string' }, cell: { type: 'string' }, zoom: { type: 'string' }, select: { type: 'string' }, full: { type: 'boolean' }, dark: { type: 'boolean' }, crew: { type: 'string' } },
```

In `scripts/scene-shot.ts`, replace:

```ts
    process.stderr.write('usage: node scripts/scene-shot.ts <world> <out.png> [--at s] [--size 150x46] [--cell 10x20] [--zoom n] [--select n] [--full] [--dark]\n');
```

with:

```ts
    process.stderr.write('usage: node scripts/scene-shot.ts <world> <out.png> [--at s] [--size 150x46] [--cell 10x20] [--zoom n] [--select n] [--full] [--dark] [--crew LxS]\n');
```

In `scripts/scene-shot.ts`, replace:

```ts
  const { png, pictures, ms } = shot({ world: def, at: Number(values.at ?? 20), cols, rows, cell: { w: cw, h: ch }, zoom: Number(values.zoom ?? 0), select: Number(values.select ?? -1), full: !!values.full, dark: !!values.dark });
```

with:

```ts
  const crew = values.crew ? pair(values.crew, 'crew') : undefined;
  const { png, pictures, ms } = shot({ world: def, at: Number(values.at ?? 20), cols, rows, cell: { w: cw, h: ch }, zoom: Number(values.zoom ?? 0), select: Number(values.select ?? -1), full: !!values.full, dark: !!values.dark, crew });
```

Run: `node --test test/scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Look at today's crowd**

Run (the "before" pictures, kept for the user):

```bash
mkdir -p "$SCRATCH/renders"
node scripts/scene-shot.ts cafe "$SCRATCH/renders/before-cafe-20.png" --crew 4x4 --at 40 --cell 19x42
node scripts/scene-shot.ts mines "$SCRATCH/renders/before-mines-20.png" --crew 4x4 --at 40 --cell 19x42
```

Expected: two paths printed. Open them with the Read tool: crowds bunched
in front of the stations and round the islands in the middle.

- [ ] **Step 6: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1380`, `ℹ pass 1377`, `ℹ fail 3`:
the three stress tests, red until Task 7.

- [ ] **Step 7: Commit**

```bash
git add src/demo/stress.ts test/workstations.test.ts scripts/scene-shot.ts test/scene.test.ts
git commit -F - <<'EOF'
test(stations): twenty at work in every world, at their own workstations

The stress test, red: twenty agents at work (four leads, four
subagents each) in every world at 80x24, 150x46 and 200x60 must each
stand at a workstation of its own or, past the room's places, at a
teammate's side, never within four units of another. Today they queue
at the eight shared stations. A made-up stress crew for it, and
scene-shot --crew LxS to render one.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 2: Places for workstations, in team pods

**Files:**
- Create: `src/world/desks.ts` (the planner), `test/desks.test.ts`
- Modify: `src/world/types.ts` (the `Desk` type), `src/world/layout.ts` (`slotRect` takes a desk; `boxCount` moves here), `src/world/room.ts` (`Room.desks`), `test/scene.test.ts` and `test/scene-plate.test.ts` (their hand-built rooms gain `desks: []`)

A room plans its workstations' places once, after its stations and decor
(decision 1): pods of up to five places on the open floor that is left,
clear of everything people need, hiding nobody. Nothing uses them yet.

- [ ] **Step 1: Write the test**

Create `test/desks.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../src/themes/index.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { DESK, DESK_SPOT, deskCap, deskZone } from '../src/world/desks.ts';
import { FIGURE_H } from '../src/world/frame.ts';
import { buildSites, hub, planLayout, slotRect, yard } from '../src/world/layout.ts';
import type { Rect } from '../src/world/layout.ts';
import type { Room } from '../src/world/room.ts';
import { footprint, heightAt, planRoom } from '../src/world/room.ts';
import { hashString } from '../src/world/rng.ts';
import type { Spot } from '../src/world/types.ts';
import type { WorldDef } from '../src/worlds/types.ts';

// Where workstations go (see desks.ts): places in team pods on the open
// floor each room's stations and decor leave, clear of everything people
// need, hiding nobody.

const TERMS: Array<[number, number]> = [[80, 24], [100, 30], [120, 36], [150, 46], [200, 60]];

// The room the stage furnishes for a terminal this size (as Stage.layout),
// each planned once for the tests below.
const rooms = new Map<string, Room>();
function roomFor(w: WorldDef, cols: number, rows: number): Room {
  const key = `${w.id}:${cols}x${rows}`;
  let room = rooms.get(key);
  if (!room) {
    const sc = computeLayout(cols, rows).scene;
    rooms.set(key, (room = planRoom(w, planLayout((sc.w * 10) / 4, (sc.h * 20) / 4, w.id), hashString(w.id))));
  }
  return room;
}

// How far a point is from a rect (0 inside it), and two rects apart.
const off = (p: Spot, r: Rect) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));
const apart = (a: Rect, b: Rect) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

// Whether someone at p is in view (as the stage's `level` judges it).
function inView(p: Spot, tall: (x: number, y: number) => number): boolean {
  for (let dy = 0; dy <= FIGURE_H; dy++) {
    for (let dx = dy ? 0 : 1; dx <= FIGURE_H; dx++) if (Math.abs(dx - dy) <= 3 && tall(p.x + dx, p.y + dy) > (dx + dy) / 2 + 5) return false;
  }
  return true;
}

test('a room plans places for workstations: a few in the smallest room, two dozen and more in a 150 x 46 terminal', () => {
  const want: Record<string, number> = { '80x24': 3, '100x30': 10, '120x36': 19, '150x46': 25, '200x60': 28 };
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const n = room.desks.length;
      assert.ok(n >= want[`${cols}x${rows}`] && n <= deskCap(room.L), `${w.id} ${cols}x${rows}: ${n} places`);
      room.desks.forEach((d, i) => {
        assert.equal(d.index, i);
        assert.deepEqual([d.len, d.dep, d.kind, d.island], [DESK.len, DESK.dep, 'desk', true]);
        const at = d.wall === 'right' ? { x: d.x0 + DESK_SPOT.u, y: d.y0 + DESK_SPOT.v } : { x: d.x0 + DESK_SPOT.v, y: d.y0 + DESK_SPOT.u };
        assert.deepEqual(d.spot, at, 'its agent stands in front of it');
      });
    }
  }
});

test('each place stands on the floor, clear of the props, the stations\' fronts, the way in, the plazas, the yard, the hub and the spots idlers like', () => {
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const { L } = room;
      const door = L.slots.find((s) => s.kind === 'entrance')!;
      const yd = yard(L);
      const h = hub(L);
      for (const d of room.desks) {
        const tag = `${w.id} ${cols}x${rows}: place ${d.index}`;
        const z = deskZone(d);
        const f = footprint(d);
        assert.ok(z.x0 >= L.T && z.y0 >= L.T && z.x1 <= L.W - 2 && z.y1 <= L.D - 2, `${tag} off the floor`);
        for (const p of room.props) assert.ok(apart(z, footprint(p)) >= 1, `${tag} on a ${p.slot?.kind ?? 'piece of decor'}`);
        for (const r of room.supply) assert.ok(apart(z, r) >= 1, `${tag} on a pile`);
        for (const s of L.slots) assert.ok(off(s.spot, z) > 3, `${tag} in front of the ${s.kind}`);
        assert.ok(off(door.spot, z) > 8, `${tag} in the way in`);
        for (const b of buildSites(L)) assert.ok(off(b, z) > b.r + 1, `${tag} on a plaza`);
        assert.ok(off(yd, z) > yd.r + 1, `${tag} in the yard`);
        assert.ok(off(h, f) > 4, `${tag} on the hub`);
        for (const p of room.pois) assert.ok(off(p, z) > 2, `${tag} on a ${p.kind} spot`);
      }
    }
  }
});

test('no place hides anyone: not its own agent, nor another\'s, nor a station\'s front, a spot idlers like or a plaza', () => {
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const feet = room.desks.map(footprint);
      const desks = (x: number, y: number) => (feet.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) ? DESK.height : 0);
      const all = (x: number, y: number) => Math.max(heightAt(room, x, y), desks(x, y));
      const tag = `${w.id} ${cols}x${rows}`;
      for (const d of room.desks) assert.ok(inView(d.spot, all), `${tag}: the agent at place ${d.index} hidden`);
      for (const s of room.L.slots) {
        const r = slotRect(s);
        assert.ok(inView({ x: r.x1, y: r.y1 }, desks), `${tag}: the ${s.kind}'s front hidden`);
      }
      for (const p of room.pois) assert.ok(inView(p, desks), `${tag}: the ${p.kind} spot hidden`);
      for (const b of buildSites(room.L)) assert.ok(inView(b, desks), `${tag}: a plaza hidden`);
    }
  }
});

test('pods keep a team together: its places side by side, turned alike, its lead\'s first; a walkway between pods', () => {
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const pods = new Map<number, typeof room.desks>();
      for (const d of room.desks) pods.set(d.pod, [...(pods.get(d.pod) ?? []), d]);
      const tag = `${w.id} ${cols}x${rows}`;
      for (const [pod, ds] of pods) {
        assert.ok(ds.length >= 1 && ds.length <= 5, `${tag}: pod ${pod} of ${ds.length}`);
        assert.ok(ds[0].lead && ds.slice(1).every((d) => !d.lead), `${tag}: pod ${pod}'s lead's place is not its first`);
        assert.ok(ds.every((d) => d.wall === ds[0].wall), `${tag}: pod ${pod} turned two ways`);
        for (const d of ds) assert.ok(Math.hypot(d.spot.x - ds[0].spot.x, d.spot.y - ds[0].spot.y) <= 25, `${tag}: place ${d.index} far from its lead's`);
      }
      for (const a of room.desks) {
        for (const b of room.desks) if (a.pod < b.pod) assert.ok(apart(deskZone(a), deskZone(b)) >= 1, `${tag}: pods ${a.pod} and ${b.pod} with no walkway between`);
      }
    }
  }
});

test('places are planned the same every time', () => {
  const L = planLayout(375, 220, 'cafe');
  const cafe = THEMES.find((t) => t.id === 'cafe')!;
  const plan = () => JSON.stringify(planRoom(cafe, L, hashString('cafe')).desks);
  assert.equal(plan(), plan());
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `node --test test/desks.test.ts`
Expected: FAIL: `Cannot find module '.../src/world/desks.ts'`.

- [ ] **Step 3: The `Desk` type**

In `src/world/types.ts`, replace:

```ts
// The room planned for a scene: the floor W x D, wall height H, wall
// thickness T, and the station slots.
```

with:

```ts
// A workstation's place (see desks.ts): built facing `wall`'s way out on
// the floor, as an island is (its front and its agent toward the viewer),
// its agent at `spot`. `pod` is the team pod it belongs to, `lead` whether
// it is the pod's lead's place, `index` its number in the room.
export type Desk = {
  kind: 'desk';
  wall: 'left' | 'right';
  island: true;
  x0: number;
  y0: number;
  len: number;
  dep: number;
  spot: Spot;
  pod: number;
  lead: boolean;
  index: number;
};

// The room planned for a scene: the floor W x D, wall height H, wall
// thickness T, and the station slots.
```

- [ ] **Step 4: `slotRect` for a desk too, and `boxCount` shared**

In `src/world/layout.ts`, replace:

```ts
export function slotRect(s: Slot): Rect {
```

with:

```ts
export function slotRect(s: Pick<Slot, 'wall' | 'x0' | 'y0' | 'len' | 'dep'>): Rect {
```

In `src/world/layout.ts`, replace:

```ts
    for (let k = 0; k <= n; k++) mark(a.x + ((h.x - a.x) * k) / n, a.y + ((h.y - a.y) * k) / n, 2);
  }
  return keep;
}
```

with:

```ts
    for (let k = 0; k <= n; k++) mark(a.x + ((h.x - a.x) * k) / n, a.y + ((h.y - a.y) * k) / n, 2);
  }
  return keep;
}
// How many of `mask`'s cells (x + W * y) a box covers, one look a box
// (sums over every box from the corner).
export function boxCount(mask: Uint8Array, W: number, D: number): (r: Rect) => number {
  const W1 = W + 1;
  const sum = new Int32Array(W1 * (D + 1));
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) sum[x + 1 + W1 * (y + 1)] = mask[x + W * y] + sum[x + W1 * (y + 1)] + sum[x + 1 + W1 * y] - sum[x + W1 * y];
  }
  return (r) => sum[r.x1 + W1 * r.y1] - sum[r.x0 + W1 * r.y1] - sum[r.x1 + W1 * r.y0] + sum[r.x0 + W1 * r.y0];
}
```

In `src/world/room.ts`, replace:

```ts
// How many of `mask`'s cells (x + W * y) a box covers, one look a box
// (sums over every box from the corner).
function boxCount(mask: Uint8Array, W: number, D: number): (r: Rect) => number {
  const W1 = W + 1;
  const sum = new Int32Array(W1 * (D + 1));
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) sum[x + 1 + W1 * (y + 1)] = mask[x + W * y] + sum[x + W1 * (y + 1)] + sum[x + 1 + W1 * y] - sum[x + W1 * y];
  }
  return (r) => sum[r.x1 + W1 * r.y1] - sum[r.x0 + W1 * r.y1] - sum[r.x1 + W1 * r.y0] + sum[r.x0 + W1 * r.y0];
}

// Units between two footprints
```

with:

```ts
// Units between two footprints
```

- [ ] **Step 5: The planner**

Create `src/world/desks.ts`:

```ts
import { FIGURE_H } from './frame.ts';
import type { Rect } from './layout.ts';
import { boxCount, buildSites, hub, slotRect, yard } from './layout.ts';
import type { Desk, Layout, Poi, Spot } from './types.ts';

// Workstations: every agent gets one of its own (see Stage), on a place the
// room plans once, here, on the open floor its stations and decor leave
// (see planRoom). Places come in team pods: a row
// of desks side by side (or two rows, one behind the other), all built
// facing the viewer as the islands are, so their agents stand in front of
// them, backs to us; the lead's place first, its subagents' round it. Pods
// keep off the props, the floor just in front of the stations, the way in,
// the plazas and their piles, the yard, the hub, the spots idlers like and
// the ways from the door and the idle prop to the hub; they hide no
// station, spot or plaza from view; a walkway runs round each pod.

// A workstation's footprint (units: `len` along its frame's u, `dep` out
// along v), how tall it may stand, and where its agent stands in its frame:
// a step out from its front, left of its middle as the viewer sees it, so
// the screen on its right stays in view.
export const DESK = { len: 7, dep: 3, height: 10 } as const;
export const DESK_SPOT = { u: 2, v: DESK.dep + 2 } as const;
// Desk to desk along a row of a pod, and a pod's back row to its front
// row: its back row's agents stand between them, in view over the front
// row's desks (see covers).
const PITCH = 10;
const ROW = 13;
// Pod shapes, biggest first: each desk's back corner in its frame (u, v),
// the lead's first, then round it. Five: the lead in the middle of a front
// row of three, two behind in the gaps; or a row of five. Four: two and
// two. Then a row of three, of two, one alone.
const PODS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, ROW], [-PITCH, ROW], [PITCH, ROW], [-PITCH / 2, 0], [PITCH / 2, 0]],
  [[0, 0], [-PITCH, 0], [PITCH, 0], [-2 * PITCH, 0], [2 * PITCH, 0]],
  [[0, ROW], [PITCH, ROW], [0, 0], [PITCH, 0]],
  [[0, 0], [-PITCH, 0], [PITCH, 0]],
  [[0, 0], [PITCH, 0]],
  [[0, 0]],
];
// In a desk's frame: its footprint, and the floor in front where its
// agent stands (a sharer or two beside it).
const BODY = { u0: 0, v0: 0, u1: DESK.len, v1: DESK.dep };
const STAND = { u0: 0, v0: DESK.dep, u1: DESK.len, v1: DESK_SPOT.v + 1 };
// Floor kept round a pod for walking past it (more in a big room), round
// the spots idlers like, round the plazas and round the way in; how wide
// the ways from the door and the idle prop to the hub are kept; how near
// the front cut a desk's agent stands at most.
const AISLE = [1.5, 4] as const;
const POI_CLEAR = 2;
const PLAZA_CLEAR = 1;
const DOOR_CLEAR = 8;
const WAY = 2;
const FRONT = 2;
// Pods spread out over the floor: each keeps away from those placed
// before, up to this far, as much as it keeps near the front middle.
const SPREAD = 40;

// How many places a room plans at most: a dozen in the smallest room
// (whose floor holds a few), about two dozen in a 150 x 46 terminal's.
export function deskCap(L: Layout): number {
  return Math.round(12 + ((L.W - 72) * 13) / 71);
}

// The desk with its back corner at (x0, y0), built facing `wall`'s way.
export function deskAt(wall: 'left' | 'right', x0: number, y0: number): Omit<Desk, 'pod' | 'lead' | 'index'> {
  const spot = wall === 'right' ? { x: x0 + DESK_SPOT.u, y: y0 + DESK_SPOT.v } : { x: x0 + DESK_SPOT.v, y: y0 + DESK_SPOT.u };
  return { kind: 'desk', wall, island: true, x0, y0, len: DESK.len, dep: DESK.dep, spot };
}

// A rect of a desk's frame (u0..u1, v0..v1 off its back corner), grown by
// `pad`, on the floor in whole cells.
function onFloor(d: Pick<Desk, 'wall' | 'x0' | 'y0'>, z: { u0: number; v0: number; u1: number; v1: number }, pad = 0): Rect {
  const [a0, a1, b0, b1] = [Math.floor(z.u0 - pad), Math.ceil(z.u1 + pad), Math.floor(z.v0 - pad), Math.ceil(z.v1 + pad)];
  return d.wall === 'right' ? { x0: d.x0 + a0, y0: d.y0 + b0, x1: d.x0 + a1, y1: d.y0 + b1 } : { x0: d.x0 + b0, y0: d.y0 + a0, x1: d.x0 + b1, y1: d.y0 + a1 };
}

// The floor a workstation on desk `d` takes: its footprint and where its
// agent stands in front of it.
export function deskZone(d: Pick<Desk, 'wall' | 'x0' | 'y0'>): Rect {
  return onFloor(d, { u0: BODY.u0, v0: BODY.v0, u1: STAND.u1, v1: STAND.v1 });
}

// The floor cells a desk standing there would hide someone at `p` behind:
// in front of them (toward the viewer), across the middle of the figure,
// near enough for a desk DESK.height tall to cover most of it (as the
// stage's `level` judges a spot).
export function covers(p: Spot, each: (x: number, y: number) => void): void {
  const reach = 2 * (DESK.height - 5);
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  for (let dy = 0; dy < reach; dy++) {
    for (let dx = Math.max(0, dy - 3); dx <= dy + 3 && dx + dy < reach; dx++) each(px + dx, py + dy);
  }
}

// Whether someone at `p` is in view: nothing just in front (toward the
// viewer, across the middle of the figure) tall enough to hide most of
// them, as the stage's `level` judges it; `tall` says how tall what stands
// over a floor point is.
function inView(p: Spot, tall: (x: number, y: number) => number): boolean {
  for (let dy = 0; dy <= FIGURE_H; dy++) {
    for (let dx = dy ? 0 : 1; dx <= FIGURE_H; dx++) {
      if (Math.abs(dx - dy) <= 3 && tall(p.x + dx, p.y + dy) > (dx + dy) / 2 + 5) return false;
    }
  }
  return true;
}

// The places for workstations in room L, furnished with `taken` (every
// prop's footprint and the supply piles; `height`: how tall the props
// stand over each floor cell, x + W * y) and its points of interest named:
// pods placed one at a time, the biggest shape that fits first, each where
// it is cheapest (away from the pods placed before, near the middle of the
// front of the floor, in the room's own frame, snug against what is
// there), up to deskCap. A pod's lead's place is its first.
export function planDesks(L: Layout, taken: readonly Rect[], height: Float32Array, pois: readonly Poi[], seed: number): Desk[] {
  const { W, D, T } = L;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < D;
  const box = (into: Uint8Array, r: Rect) => {
    for (let y = Math.max(0, r.y0); y < Math.min(D, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) into[x + W * y] = 1;
  };
  // Every cell any of which lies within r of c.
  const disc = (into: Uint8Array, c: Spot, r: number) => {
    for (let y = Math.floor(c.y - r) - 1; y <= Math.ceil(c.y + r); y++) {
      for (let x = Math.floor(c.x - r) - 1; x <= Math.ceil(c.x + r); x++) {
        if (inside(x, y) && Math.hypot(Math.max(0, x - c.x, c.x - x - 1), Math.max(0, y - c.y, c.y - y - 1)) <= r) into[x + W * y] = 1;
      }
    }
  };
  const way = (into: Uint8Array, a: Spot, b: Spot, r: number) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let k = 0; k <= n; k++) disc(into, { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, r);
  };
  // Where a desk may not stand (`ground`), and where its agent may not
  // (`floor`): the stations and the floor just in front of them, the
  // plazas, the yard, the spots idlers like and the way in; desks keep off
  // the hub and the ways from the door and the idle prop to it too.
  const ground = new Uint8Array(W * D);
  const floor = new Uint8Array(W * D);
  const both = [ground, floor];
  const h = hub(L);
  for (const s of L.slots) {
    const r = slotRect(s);
    const pad = s.island ? 2 : 1;
    box(ground, { x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad });
    box(floor, { x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 });
    for (const m of both) disc(m, s.spot, 3);
    if (s.kind === 'entrance' || s.kind === 'idle') way(ground, s.spot, h, WAY);
    if (s.kind === 'entrance') {
      for (const m of both) {
        box(m, { x0: r.x0 - 2, y0: r.y0 - 2, x1: Math.max(r.x1, s.spot.x) + 6, y1: Math.max(r.y1, s.spot.y) + 6 });
        disc(m, s.spot, DOOR_CLEAR);
      }
    }
  }
  for (const r of taken) for (const m of both) box(m, { x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 });
  for (const b of buildSites(L)) for (const m of both) disc(m, b, b.r + PLAZA_CLEAR);
  const yd = yard(L);
  for (const m of both) disc(m, yd, yd.r + 1);
  disc(ground, h, 4);
  for (const p of pois) for (const m of both) disc(m, p, POI_CLEAR);
  // Where a desk may not stand either: in front of a station's front
  // corner, a spot idlers like, a plaza or another desk's agent.
  const cover = new Uint8Array(W * D);
  const hide = (p: Spot) =>
    covers(p, (x, y) => {
      if (inside(x, y)) cover[x + W * y] = 1;
    });
  for (const s of L.slots) {
    const r = slotRect(s);
    hide({ x: r.x1, y: r.y1 });
  }
  for (const p of pois) hide(p);
  for (const b of buildSites(L)) hide(b);
  // How tall what stands on the floor is so far, desks too: no desk's
  // agent may be hidden.
  const stood = height.slice();
  const aisle = AISLE[0] + (AISLE[1] - AISLE[0]) * Math.max(0, Math.min(1, (W - 72) / 71));
  const out: Desk[] = [];
  const cap = deskCap(L);
  // The middle of the front of the floor, and the room's own frame (every
  // pod turned alike reads tidiest).
  const goal = { x: T + (W - T) * 0.62, y: T + (D - T) * 0.62 };
  const own: 'left' | 'right' = seed & 1 ? 'left' : 'right';
  type Pod = { wall: 'left' | 'right'; at: Array<[number, number]>; cost: number };
  // Where each pod placed so far stands, about.
  const centres: Spot[] = [];
  // Each place a lone desk fits (its back corner at x + W * y), by wall,
  // and how snug it stands there (0: it does not fit); worked out afresh
  // where a pod has just gone down.
  const fit = { right: new Float32Array(W * D), left: new Float32Array(W * D) };
  let stale = { x0: T, y0: T, x1: W, y1: D };
  for (let pod = 0; out.length < cap; pod++) {
    const free = boxCount(ground, W, D);
    const open = boxCount(floor, W, D);
    const hidden = boxCount(cover, W, D);
    for (const wall of ['right', 'left'] as const) {
      for (let y = Math.max(T, stale.y0); y < Math.min(D, stale.y1); y++) {
        for (let x = Math.max(T, stale.x0); x < Math.min(W, stale.x1); x++) {
          const d = { wall, x0: x, y0: y };
          const s = onFloor(d, STAND);
          const ok = s.x1 <= W - FRONT && s.y1 <= D - FRONT && !free(onFloor(d, BODY, 0.5)) && !hidden(onFloor(d, BODY)) && !open(s);
          fit[wall][x + W * y] = ok ? 1 + free(onFloor(d, BODY, 1.5)) : 0;
        }
      }
    }
    let found: Pod | null = null;
    for (const shape of PODS) {
      if (out.length + shape.length > cap) continue;
      const fits: Pod[] = [];
      for (const wall of ['right', 'left'] as const) {
        const one = fit[wall];
        // Each desk's offset on the floor from the pod's anchor, and where
        // the pod's agents stand on average from it.
        const offs = shape.map(([u, v]) => (wall === 'right' ? [u, v] : [v, u]));
        const sx = offs.reduce((n, [x]) => n + x, 0) / offs.length + (wall === 'right' ? DESK_SPOT.u : DESK_SPOT.v);
        const sy = offs.reduce((n, [, y]) => n + y, 0) / offs.length + (wall === 'right' ? DESK_SPOT.v : DESK_SPOT.u);
        for (let ay = T; ay < D; ay++) {
          for (let ax = T; ax < W; ax++) {
            let snug = 0;
            for (const [dx, dy] of offs) {
              const x = ax + dx;
              const y = ay + dy;
              const k = x >= T && y >= T && x < W && y < D ? one[x + W * y] : 0;
              if (!k) {
                snug = -1;
                break;
              }
              snug += k - 1;
            }
            if (snug < 0) continue;
            const cx = ax + sx;
            const cy = ay + sy;
            let alone = SPREAD;
            for (const c of centres) alone = Math.min(alone, Math.hypot(c.x - cx, c.y - cy));
            const cost = Math.hypot(cx - goal.x, cy - goal.y) / 2 - 2 * alone + (wall === own ? 0 : 12) - snug / offs.length;
            fits.push({ wall, at: offs.map(([dx, dy]) => [ax + dx, ay + dy]), cost });
          }
        }
      }
      fits.sort((a, b) => a.cost - b.cost);
      // The cheapest whose agents nothing hides: no desk standing, nor one
      // of its own.
      found =
        fits.find((p) => {
          const mine = new Uint8Array(W * D);
          for (const [x, y] of p.at) box(mine, onFloor({ wall: p.wall, x0: x, y0: y }, BODY));
          const tall = (x: number, y: number) => {
            const i = Math.floor(x) + W * Math.floor(y);
            return !inside(Math.floor(x), Math.floor(y)) ? 0 : mine[i] ? Math.max(DESK.height, stood[i]) : stood[i];
          };
          return p.at.every(([x, y]) => inView(deskAt(p.wall, x, y).spot, tall));
        }) ?? null;
      if (found) break;
    }
    if (!found) break;
    const wall = found.wall;
    centres.push(found.at.map(([x, y]) => deskAt(wall, x, y).spot).reduce((c, p, k, all) => ({ x: c.x + p.x / all.length, y: c.y + p.y / all.length }), { x: 0, y: 0 }));
    // What changed: the pod, its aisle and the reach of its cover, and a
    // desk's length further back (a desk there may no longer fit).
    const far = DESK.len + 2 * (DESK.height - 5) + AISLE[1] + 4;
    const xs = found.at.map(([x]) => x);
    const ys = found.at.map(([, y]) => y);
    stale = { x0: Math.min(...xs) - far, y0: Math.min(...ys) - far, x1: Math.max(...xs) + far, y1: Math.max(...ys) + far };
    found.at.forEach(([x, y], k) => {
      const d = deskAt(wall, x, y);
      out.push({ ...d, pod, lead: k === 0, index: out.length });
      const r = onFloor(d, BODY);
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) stood[x + W * y] = Math.max(stood[x + W * y], DESK.height);
      for (const m of both) {
        box(m, onFloor(d, BODY, aisle));
        box(m, onFloor(d, STAND, aisle));
      }
      hide(d.spot);
    });
  }
  return out;
}
```

- [ ] **Step 6: The room plans its places**

In `src/world/room.ts`, replace:

```ts
import { supplyFor } from './build.ts';
import type { Rect } from './layout.ts';
import { buildSites, hub, keepClear, wallGaps, yard } from './layout.ts';
import { NavGrid } from './path.ts';
import { Rng, hashString } from './rng.ts';
import type { Layout, Poi, Slot, SlotKind, Spot } from './types.ts';

// The furnished room: every station slot holding its world's prop, decor
// along the walls and on the floor by them and by the stations (clear of
// the walkways, plazas and the yard), the routing grid round all of it,
// the spots idle characters like, and the supply piles builders fetch from.
```

with:

```ts
import { supplyFor } from './build.ts';
import { planDesks } from './desks.ts';
import type { Rect } from './layout.ts';
import { boxCount, buildSites, hub, keepClear, wallGaps, yard } from './layout.ts';
import { NavGrid } from './path.ts';
import { Rng, hashString } from './rng.ts';
import type { Desk, Layout, Poi, Slot, SlotKind, Spot } from './types.ts';

// The furnished room: every station slot holding its world's prop, decor
// along the walls and on the floor by them and by the stations (clear of
// the walkways, plazas and the yard), the routing grid round all of it,
// the spots idle characters like, the supply piles builders fetch from,
// and the places on the open floor left where workstations go up (see
// desks.ts).
```

In `src/world/room.ts`, replace:

```ts
  props: PlacedProp[]; // the stations in slot order, then the decor

```

with:

```ts
  props: PlacedProp[]; // the stations in slot order, then the decor
  desks: Desk[]; // where workstations go up, pod by pod, each pod's lead's first

```

In `src/world/room.ts`, replace:

```ts
  return { L, props, nav, pois, supply, height };
```

with:

```ts
  const desks = planDesks(L, [...all, ...supply], height, pois, seed);
  return { L, props, desks, nav, pois, supply, height };
```

In `test/scene.test.ts`, replace:

```ts
const room = (props: PlacedProp[]): Room => ({ L: { W, D, H, T, slots: [] }, props, nav:
```

with:

```ts
const room = (props: PlacedProp[]): Room => ({ L: { W, D, H, T, slots: [] }, props, desks: [], nav:
```

In `test/scene-plate.test.ts`, replace:

```ts
props: [place(still, 30, 30), place(blinker, 14, 40)], nav:
```

with:

```ts
props: [place(still, 30, 30), place(blinker, 14, 40)], desks: [], nav:
```

- [ ] **Step 7: Run the test to see it pass**

Run: `node --test test/desks.test.ts`
Expected: PASS, 5 tests (about 4 s: it plans 80 rooms).

Run: `node --test test/room.test.ts test/layout.test.ts`
Expected: PASS (the stations and decor are planned as before; the places
come after them).

- [ ] **Step 8: Look at the places**

The counts the decisions give (decision 1), every world at each size:

```bash
mkdir -p "$SCRATCH/tools"
cat > "$SCRATCH/tools/places.ts" <<'EOF'
// How many places each world's room plans at a few terminal sizes, and in
// how many pods. Usage: node places.ts <src dir>
const SRC = process.argv[2];
const { planLayout } = await import(`${SRC}/world/layout.ts`);
const { planRoom } = await import(`${SRC}/world/room.ts`);
const { computeLayout } = await import(`${SRC}/ui/layout.ts`);
const { THEMES } = await import(`${SRC}/themes/index.ts`);
const { hashString } = await import(`${SRC}/world/rng.ts`);
for (const [c, r] of [[80, 24], [100, 30], [120, 36], [150, 46], [200, 60]]) {
  const sc = computeLayout(c, r).scene;
  const n: number[] = [];
  const pods: number[] = [];
  for (const w of THEMES) {
    const room = planRoom(w, planLayout((sc.w * 10) / 4, (sc.h * 20) / 4, w.id), hashString(w.id));
    n.push(room.desks.length);
    pods.push(new Set(room.desks.map((d: { pod: number }) => d.pod)).size);
  }
  const s = [...n].sort((a, b) => a - b);
  console.log(`${c}x${r}: ${s[0]} to ${s[15]} places (${s[8]} in the middle), in ${Math.min(...pods)} to ${Math.max(...pods)} pods`);
}
EOF
node "$SCRATCH/tools/places.ts" "$PWD/src"
```

Expected:

```
80x24: 3 to 5 places (4 in the middle), in 2 to 5 pods
100x30: 10 to 15 places (14 in the middle), in 6 to 10 pods
120x36: 19 to 19 places (19 in the middle), in 4 to 6 pods
150x46: 25 to 25 places (25 in the middle), in 5 to 5 pods
200x60: 28 to 28 places (28 in the middle), in 6 to 6 pods
```

- [ ] **Step 9: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1385`, `ℹ pass 1382`, `ℹ fail 3`
(the stress tests, still red).

- [ ] **Step 10: Commit**

```bash
git add src/world/desks.ts test/desks.test.ts src/world/types.ts src/world/layout.ts src/world/room.ts test/scene.test.ts test/scene-plate.test.ts
git commit -F - <<'EOF'
feat(stations): rooms plan places for workstations, in team pods

After its stations and decor, a room plans places on the open floor
left: pods of up to five (a lead's place and its subagents' round it,
in a front row and the gaps behind, or a row), clear of the props, the
stations' fronts, the way in, the plazas and their piles, the yard, the
hub and the spots idlers like, hiding nobody, a walkway round each pod.
Two dozen in a 150x46 terminal, a few in the smallest room.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 3: The workstation contract, the plain workstation, the activity layer

**Files:**
- Create: `src/worlds/workstation.ts` (the plain workstation; `workstationOf`), `src/art/screen.ts` (the activity layer), `test/workstation-art.test.ts`
- Modify: `src/worlds/types.ts` (`WorkstationArt`, `WorldDef.workstation`), `src/world/frame.ts` (`Screen`, `DeskFrame`, `SceneFrame.desks`), `test/themes.test.ts` (the contract)

A world's workstation is a still prop of the desk's footprint that names
its screen (a quad on its body) and the spot on its top where a desk
upgrade stands; the shared activity layer draws what its agent does on
that screen. Every world gets the plain one, in its colours and ink, until
it draws its own (Tasks 8 to 13).

- [ ] **Step 1: Write the tests**

The contract, for every world (its own workstation, or the plain one):

In `test/themes.test.ts`, replace:

```ts
import { loadWorld } from '../scripts/scene-shot.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { Theme } from '../src/themes/types.ts';
import { PROP_SIZE, planLayout } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { project } from '../src/world/frame.ts';
import { recordingPen } from './helpers.ts';
```

with:

```ts
import { loadWorld } from '../scripts/scene-shot.ts';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project as iso } from '../src/art/iso.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { Theme } from '../src/themes/types.ts';
import { PROP_SIZE, planLayout } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { DESK, DESK_SPOT } from '../src/world/desks.ts';
import { project } from '../src/world/frame.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { recordingPen } from './helpers.ts';
```

In `test/themes.test.ts`, replace:

```ts
          assert.ok(q.life > 0 && q.life <= 10 && isRGB(q.color), `${tag}: ${q.kind} life or colour`);
        }
      }
    }
  });
}
```

with:

```ts
          assert.ok(q.life > 0 && q.life <= 10 && isRGB(q.color), `${tag}: ${q.kind} life or colour`);
        }
      }
    }
  });
  test(`world ${w.id}: its workstation fits its place, draws inside it in both frames at both scales, and names a screen on its body`, () => {
    const art = workstationOf(w);
    assert.deepEqual([art.len, art.dep], [DESK.len, DESK.dep], 'footprint');
    assert.ok(art.height > 0 && art.height <= DESK.height, `${art.height} tall`);
    assert.ok(!art.animated && !art.emit, 'a workstation is a still sprite: no animation, no bits');
    // The screen: a parallelogram upright on its body, right of where the
    // agent stands, a fair size; the desk upgrade's spot on its top.
    const [a, b, c, d] = art.screen;
    for (const p of art.screen) assert.ok(p[0] >= 0 && p[0] <= DESK.len && p[1] >= 0 && p[1] <= DESK.dep && p[2] >= 0 && p[2] <= art.height, `screen corner ${p} off its body`);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(c[k] - (b[k] + d[k] - a[k])) < 1e-6, 'the screen is not a parallelogram');
    assert.ok(d[2] - a[2] >= 1.5 && Math.abs(b[2] - a[2]) < 1e-6, 'the screen is not upright');
    assert.ok(b[0] - a[0] >= 1.5 && Math.min(a[0], d[0]) >= DESK_SPOT.u + 0.5, 'the screen is not to the right of the agent');
    const [tu, tv, tz] = art.top;
    assert.ok(tu >= 0.5 && tu <= DESK.len - 0.5 && tv >= 0.5 && tv <= DESK.dep - 0.5 && tz >= 2 && tz <= art.height, `the upgrade's spot ${art.top} is not on its top`);
    for (const s of [4, 16]) {
      for (const wall of ['right', 'left'] as const) {
        for (const seed of [0, 1, 2]) {
          for (const active of [false, true]) {
            const pad = 6 * s;
            const at0 = frame(iso(0, 0, s), wall, 0, 0);
            let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
              const [x, y] = at0(u, v, z);
              box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
            }
            const cv = new Canvas(Math.ceil(box.x1 - box.x0 + 2 * pad), Math.ceil(box.y1 - box.y0 + 2 * pad));
            const at = frame(iso(pad - box.x0, pad - box.y0, s), wall, 0, 0);
            art.draw({ pen: cv, s, at, len: art.len, dep: art.dep, wall, island: true, t: 3, active, seed });
            // Everything at least faintly opaque lies inside its box, a
            // half unit of ink allowed.
            const slack = s / 2;
            for (let y = 0; y < cv.height; y++) {
              for (let x = 0; x < cv.width; x++) {
                if (cv.data[(y * cv.width + x) * 4 + 3] < 16) continue;
                assert.ok(x >= pad - slack && x <= cv.width - pad + slack && y >= pad - slack && y <= cv.height - pad + slack, `s ${s} ${wall} seed ${seed}${active ? ' (on)' : ''}: painted at ${x},${y}, outside its box`);
              }
            }
          }
        }
      }
    }
  });
}
```

The activity layer and the plain workstation:

Create `test/workstation-art.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { drawScreen } from '../src/art/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Screen } from '../src/world/frame.ts';
import type { Quad } from '../src/worlds/types.ts';
import { plainWorkstation } from '../src/worlds/workstation.ts';

// The shared activity layer on a workstation's screen, and workstations as
// sprites: drawn once for what they show, kept, placed again for free.

const SCREENS: Screen[] = ['write', 'read', 'search', 'run', 'web', 'think', 'talk', 'off'];
const QUAD: Quad = [[1, 1, 1], [9, 1, 1], [9, 1, 7], [1, 1, 7]];
const hash = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

test('the activity layer draws each activity its own way, inside the screen', () => {
  const s = 8;
  const seen = new Map<string, Screen>();
  for (const kind of SCREENS) {
    for (const wall of ['right', 'left'] as const) {
      const c = new Canvas(200, 200);
      const at = frame(project(100, 60, s), wall, 0, 0);
      drawScreen(c, at, QUAD, kind, '#2b2233');
      // Inside the screen's outline on the canvas, a pixel of ink allowed.
      const pts = QUAD.map((p) => at(...p));
      const [x0, x1] = [Math.min(...pts.map((p) => p[0])) - 2, Math.max(...pts.map((p) => p[0])) + 2];
      const [y0, y1] = [Math.min(...pts.map((p) => p[1])) - 2, Math.max(...pts.map((p) => p[1])) + 2];
      let n = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (!c.data[(y * c.width + x) * 4 + 3]) continue;
          n++;
          assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${kind} ${wall}: painted at ${x},${y}, off the screen`);
        }
      }
      assert.ok(n > 100, `${kind} ${wall}: ${n} pixels`);
      if (wall === 'right') {
        const h = hash(c);
        assert.ok(!seen.has(h), `${kind} looks like ${seen.get(h)}`);
        seen.set(h, kind);
      }
    }
  }
});

test('the plain workstation, for a world with none of its own, takes the world\'s colours', () => {
  const cafe = getTheme('cafe')!;
  const mines = getTheme('mines')!;
  const draw = (w: typeof cafe) => {
    const c = new Canvas(160, 160);
    plainWorkstation(w).draw({ pen: c, s: 8, at: frame(project(80, 50, 8), 'right', 0, 0), len: 7, dep: 3, wall: 'right', island: true, t: 0, active: true, seed: 0 });
    return hash(c);
  };
  assert.notEqual(draw(cafe), draw(mines));
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/themes.test.ts test/workstation-art.test.ts`
Expected: FAIL: `Cannot find module '.../src/worlds/workstation.ts'` (the
contract) and `Cannot find module '.../src/art/screen.ts'` (the art test).

- [ ] **Step 3: The types**

In `src/worlds/types.ts`, replace:

```ts
// What the room shell draws with: the floor and the two back walls.
```

with:

```ts
// A point, and a quad (four corners going round, the first at its bottom
// left as the viewer sees it), in a prop's frame (u, v, z).
export type P3 = readonly [number, number, number];
export type Quad = readonly [P3, P3, P3, P3];

// A world's workstation (see world/desks.ts): a prop DESK.len x DESK.dep
// that stands at most DESK.height tall and is never animated (it is drawn
// once a scale, frame, look and screen, and kept; see art/scene/desk.ts).
// Its agent stands at DESK_SPOT, in front. It names where its screen is
// (`screen`, upright on its body, to the right of where its agent stands:
// the shared activity layer draws on it, see art/screen.ts) and where a
// desk upgrade stands on it (`top`, on its top surface). `v.active` is true
// while its screen is on; `v.seed` is 0, 1 or 2: the world's few looks of it.
export type WorkstationArt = PropArt & { screen: Quad; top: P3 };

// What the room shell draws with: the floor and the two back walls.
```

In `src/worlds/types.ts`, replace:

```ts
  decor?: ReadonlyArray<{ art: PropArt; count: number; place: 'wall' | 'floor' }>;
```

with:

```ts
  decor?: ReadonlyArray<{ art: PropArt; count: number; place: 'wall' | 'floor' }>;
  // Each agent's own workstation (a plain desk with a screen in the
  // world's colours when it has none: see worlds/workstation.ts).
  workstation?: WorkstationArt;
```

In `src/world/frame.ts`, replace:

```ts
export type TrinketFrame = { id: string; kind: Trinket; x: number; y: number; color: RGB };
```

with:

```ts
export type TrinketFrame = { id: string; kind: Trinket; x: number; y: number; color: RGB };

// What a workstation's screen shows (the shared activity layer, see
// art/screen.ts): the work of the agent at it, or dim ('off') while it
// waits or is away and once it is left empty.
export type Screen = 'write' | 'read' | 'search' | 'run' | 'web' | 'think' | 'talk' | 'off';
// A workstation standing in the room (see Stage): its desk's place and
// frame, what its screen shows, how far it has grown out of the floor (0
// to 1: popping up, or shrinking away once left) and which of the world's
// few looks of it (0 to 2) it wears.
export type DeskFrame = { id: number; wall: 'left' | 'right'; x0: number; y0: number; len: number; dep: number; screen: Screen; grow: number; seed: number };
```

In `src/world/frame.ts`, replace:

```ts
  trinkets?: TrinketFrame[];
  builds: BuildFrame[];
```

with:

```ts
  trinkets?: TrinketFrame[];
  desks?: DeskFrame[]; // the workstations, by desk index
  builds: BuildFrame[];
```

- [ ] **Step 4: The activity layer**

Create `src/art/screen.ts`:

```ts
import type { Screen } from '../world/frame.ts';
import type { Quad } from '../worlds/types.ts';
import type { At } from './iso.ts';
import { inkWidth } from './iso.ts';
import type { Color, Pen } from './types.ts';

// The shared activity layer: what an agent is doing, drawn on its
// workstation's screen alike in every world (see WorkstationArt.screen):
// code lines for writing, an open page for reading, a magnifier over a
// list for searching, a terminal with sparks for running things, a globe
// for the web, a lightbulb for thinking, speech marks for talking or
// handing work out; a dim screen with a glint of glass while it waits, is
// away or is left. No text or digits: lines, bars and shapes. Static (the
// workstation's sprite is kept, see art/scene/desk.ts).

type Pt = [number, number];

// Each screen's backdrop.
const BACK: Record<Screen, Color> = {
  write: '#e8f4ff',
  read: '#fbf6e9',
  search: '#ecf6ea',
  run: '#1c2230',
  web: '#e6f0ff',
  think: '#fff4d6',
  talk: '#f2ecff',
  off: '#1e232d',
};

export function drawScreen(pen: Pen, at: At, q: Quad, kind: Screen, ink: string): void {
  // A point of the quad: fu across from its left edge, fz up from its foot.
  const on = (fu: number, fz: number): Pt => {
    const p = (k: number) => q[0][k] + (q[1][k] - q[0][k]) * fu + (q[3][k] - q[0][k]) * fz;
    return at(p(0), p(1), p(2));
  };
  const [x0, y0] = on(0, 0);
  const [x1, y1] = on(1, 0);
  const [x3, y3] = on(0, 1);
  const s = Math.max(Math.hypot(x1 - x0, y1 - y0), Math.hypot(x3 - x0, y3 - y0)) / 3;
  const line = Math.max(1, inkWidth(s) * 0.5);
  const poly = (pts: Pt[], fill: Color | null, stroke: Color | null = null, w = line) => {
    pen.beginPath();
    pts.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
    pen.closePath();
    if (fill) {
      pen.fillStyle = fill;
      pen.fill();
    }
    if (stroke) {
      pen.strokeStyle = stroke;
      pen.lineWidth = w;
      pen.stroke();
    }
  };
  // A bar from fu0 to fu1 at height fz, fh tall.
  const bar = (fu0: number, fu1: number, fz: number, fh: number, c: Color) => poly([on(fu0, fz), on(fu1, fz), on(fu1, fz + fh), on(fu0, fz + fh)], c);
  // A ring of n points round (fu, fz), radii ru across and rz up.
  const ring = (fu: number, fz: number, ru: number, rz: number, n = 14): Pt[] => Array.from({ length: n }, (_, k) => on(fu + ru * Math.cos((k / n) * Math.PI * 2), fz + rz * Math.sin((k / n) * Math.PI * 2)));
  pen.save();
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  poly([on(0, 0), on(1, 0), on(1, 1), on(0, 1)], BACK[kind]);
  switch (kind) {
    case 'write': {
      // indented code lines in a few colours, a cursor on the last
      const rows: Array<[number, number, Color]> = [[0.1, 0.55, '#2b6f9c'], [0.22, 0.75, '#c0507a'], [0.22, 0.6, '#3f8f5a'], [0.34, 0.8, '#7a5ab0'], [0.1, 0.45, '#2b6f9c']];
      rows.forEach(([a, b, c], i) => bar(a, b, 0.8 - i * 0.15, 0.08, c));
      bar(0.5, 0.56, 0.2, 0.1, '#2b3446');
      break;
    }
    case 'read': {
      // an open page: two columns of grey lines and a spine
      bar(0.48, 0.52, 0.08, 0.84, '#d6cdb6');
      for (let i = 0; i < 5; i++) {
        bar(0.08, i === 4 ? 0.3 : 0.42, 0.8 - i * 0.15, 0.06, '#8a8476');
        bar(0.58, i === 2 ? 0.75 : 0.92, 0.8 - i * 0.15, 0.06, '#8a8476');
      }
      break;
    }
    case 'search': {
      // a list, one row picked out, a magnifier over it
      for (let i = 0; i < 5; i++) bar(0.1, 0.62, 0.8 - i * 0.16, 0.07, i === 2 ? '#3f8f5a' : '#9aa79a');
      poly(ring(0.66, 0.46, 0.17, 0.2), '#ffffffaa', ink);
      poly([on(0.77, 0.3), on(0.82, 0.34), on(0.95, 0.12), on(0.9, 0.08)], ink);
      break;
    }
    case 'run': {
      // a dark terminal: a prompt, output lines, and sparks of success
      bar(0.08, 0.16, 0.78, 0.08, '#7ee08a');
      bar(0.2, 0.6, 0.78, 0.08, '#cfd8e6');
      bar(0.08, 0.5, 0.6, 0.06, '#7f8aa0');
      bar(0.08, 0.38, 0.46, 0.06, '#7f8aa0');
      bar(0.08, 0.16, 0.28, 0.08, '#7ee08a');
      bar(0.2, 0.26, 0.28, 0.08, '#cfd8e6');
      for (const [fu, fz, r] of [[0.72, 0.4, 0.09], [0.86, 0.62, 0.07], [0.82, 0.24, 0.05]] as const) {
        poly([on(fu - r, fz), on(fu, fz + r * 1.4), on(fu + r, fz), on(fu, fz - r * 1.4)], '#ffd34a');
      }
      break;
    }
    case 'web': {
      // a globe: a blue disc, its meridian and parallels
      poly(ring(0.5, 0.5, 0.3, 0.36), '#5aa6e8', ink);
      poly(ring(0.5, 0.5, 0.12, 0.36), null, '#e6f0ff');
      bar(0.21, 0.79, 0.49, 0.04, '#e6f0ff');
      bar(0.27, 0.73, 0.68, 0.03, '#e6f0ff');
      bar(0.27, 0.73, 0.3, 0.03, '#e6f0ff');
      break;
    }
    case 'think': {
      // a lightbulb with its rays
      poly(ring(0.5, 0.58, 0.2, 0.24), '#ffd34a', ink);
      bar(0.42, 0.58, 0.2, 0.14, '#9aa0aa');
      for (const [a, b] of [[0.18, 0.86], [0.82, 0.86], [0.12, 0.58], [0.88, 0.58]] as const) poly(ring(a, b, 0.035, 0.045, 6), '#f0a830');
      break;
    }
    case 'talk': {
      // two speech balloons, each with its tail
      poly([...ring(0.36, 0.64, 0.24, 0.2), on(0.24, 0.42), on(0.2, 0.32), on(0.34, 0.46)], '#ffffff', ink);
      poly([...ring(0.66, 0.34, 0.22, 0.18), on(0.78, 0.16), on(0.86, 0.08), on(0.72, 0.18)], '#c9b8ff', ink);
      for (const fu of [0.27, 0.36, 0.45]) poly(ring(fu, 0.64, 0.025, 0.035, 6), '#6b5aa8');
      break;
    }
    case 'off': {
      // glass with nothing on it: a glint across
      poly([on(0.55, 0.1), on(0.7, 0.1), on(0.35, 0.9), on(0.2, 0.9)], '#ffffff14');
      break;
    }
  }
  poly([on(0, 0), on(1, 0), on(1, 1), on(0, 1)], null, ink);
  pen.restore();
}
```

- [ ] **Step 5: The plain workstation**

Create `src/worlds/workstation.ts`:

```ts
import { contactShadow, hexOf, ink as inkFrom, inkWidth, isoBox, mix, shade } from '../art/iso.ts';
import { DESK } from '../world/desks.ts';
import type { PropView, WorkstationArt, WorldDef } from './types.ts';

// The plain workstation, for a world that has not drawn its own (see
// WorldDef.workstation): a desk on four legs with a monitor and a
// keyboard, in the world's colours and ink. Its screen faces the agent,
// right of where it stands; a desk upgrade stands at the desk's left end,
// behind the keyboard.

export function plainWorkstation(w: Pick<WorldDef, 'palette' | 'ink'>): WorkstationArt {
  const p = w.palette;
  const ink = w.ink ?? inkFrom(hexOf(p.floor));
  const wood = mix(hexOf(p.border), hexOf(p.wall2), 0.35);
  const dark = shade(wood, -0.28);
  const case_ = mix(hexOf(p.panel), '#3b404c', 0.5);
  const draw = (v: PropView) => {
    const { pen, at } = v;
    const box = (u0: number, v0: number, z0: number, du: number, dv: number, dz: number, base: string, stripe = true) => isoBox(pen, at, u0, v0, z0, du, dv, dz, base, { ink, line: inkWidth(v.s), stripe });
    contactShadow(pen, at, DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.6, DESK.dep / 2 + 0.6, 0.28);
    for (const [u, w2] of [[0.35, 0.3], [6.15, 0.3], [0.35, 2.2], [6.15, 2.2]] as const) box(u, w2, 0, 0.5, 0.5, 5.3, dark, false);
    box(0.4, 0.15, 2, 6.2, 0.3, 3.3, dark, false); // the modesty panel
    box(0, 0, 5.3, DESK.len, DESK.dep, 0.8, wood);
    // the monitor on its stand, its screen toward the agent
    box(4.15, 0.75, 6.1, 0.6, 0.45, 0.9, case_, false);
    box(2.75, 0.5, 6.8, 3.4, 0.4, 3.1, case_);
    // the keyboard, in front of the agent
    box(0.9, 1.7, 6.1, 2.6, 0.9, 0.22, shade(case_, 0.25), false);
  };
  return {
    len: DESK.len,
    dep: DESK.dep,
    height: 9.9,
    draw,
    // the monitor's front face, inside its bezel
    screen: [
      [2.95, 0.9, 7.0],
      [5.95, 0.9, 7.0],
      [5.95, 0.9, 9.7],
      [2.95, 0.9, 9.7],
    ],
    top: [1.1, 0.9, 6.1],
  };
}

// A world's workstation: its own, or the plain one in its colours (made
// once a world).
const plain = new WeakMap<WorldDef, WorkstationArt>();
export function workstationOf(w: WorldDef): WorkstationArt {
  if (w.workstation) return w.workstation;
  let art = plain.get(w);
  if (!art) plain.set(w, (art = plainWorkstation(w)));
  return art;
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `node --test test/themes.test.ts test/workstation-art.test.ts`
Expected: PASS (`ℹ pass 68`: 50 of the contract as before, a workstation test for each of the 16 worlds, and the 2 art tests).

- [ ] **Step 7: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1403`, `ℹ pass 1400`, `ℹ fail 3`.

- [ ] **Step 8: Commit**

```bash
git add src/worlds/workstation.ts src/art/screen.ts test/workstation-art.test.ts src/worlds/types.ts src/world/frame.ts test/themes.test.ts
git commit -F - <<'EOF'
feat(stations): the workstation contract, a plain one, the activity layer

A world's workstation is a still prop of the desk's footprint that
names its screen and the spot on its top for a desk upgrade; the
contract test holds every world to it. Until a world draws its own, a
plain desk with a monitor in its colours and ink. The shared activity
layer draws on the screen what the agent does: code lines, a page, a
magnifier over a list, a terminal with sparks, a globe, a lightbulb,
speech balloons, or glass gone dim.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 4: Workstations as sprites in the scene

**Files:**
- Create: `src/art/scene/desk.ts` (a workstation's picture: its art, its screen, its pop step; cached)
- Modify: `src/art/scene.ts` (workstations among the depth-sorted things; warming), `test/workstation-art.test.ts`, `test/scene.test.ts`

A workstation is drawn once for what it shows (world, ink, frame, look,
screen, pop step, scale) and kept, like a figure; standing still it costs
a placement. It pops up in five steps, growing out of the floor a little
past its size and back.

- [ ] **Step 1: Write the tests**

In `test/workstation-art.test.ts`, replace:

```ts
import { frame, project } from '../src/art/iso.ts';
import { drawScreen } from '../src/art/screen.ts';
```

with:

```ts
import { frame, project } from '../src/art/iso.ts';
import { POP_STEPS, deskSprite, deskStats } from '../src/art/scene/desk.ts';
import { drawScreen } from '../src/art/screen.ts';
```

In `test/workstation-art.test.ts`, replace:

```ts
test('the plain workstation, for a world with none of its own, takes the world\'s colours', () => {
```

with:

```ts
test('a workstation sprite is drawn once for what it shows and kept: the same key, the same pixels', () => {
  const cafe = getTheme('cafe')!;
  const ink = '#2f1d18';
  const d = { wall: 'right' as const, screen: 'write' as Screen, grow: 1, seed: 1 };
  const m = deskStats.misses;
  const a = deskSprite(cafe, d, 4, ink);
  assert.equal(deskStats.misses, m + 1);
  assert.equal(deskSprite(cafe, { ...d }, 4, ink), a, 'drawn again');
  assert.equal(deskStats.misses, m + 1);
  // What it shows makes another picture: its screen, its frame, its scale
  // (and its look, where the world draws more than one).
  const others = [{ ...d, screen: 'run' as Screen }, { ...d, wall: 'left' as const }].map((o) => deskSprite(cafe, o, 4, ink));
  others.push(deskSprite(cafe, d, 8, ink));
  for (const o of others) assert.notEqual(hash(o.img), hash(a.img));
  // Popping up: a picture a step, growing out of the floor and a little
  // past its size; all of them alike for every workstation.
  const steps = Array.from({ length: POP_STEPS }, (_, k) => deskSprite(cafe, { ...d, grow: (k + 1) / POP_STEPS }, 4, ink));
  assert.equal(steps[POP_STEPS - 1], a);
  assert.ok(steps[0].img.height < a.img.height, 'the first step is not smaller');
  assert.ok(Math.max(...steps.map((p) => p.img.height)) > a.img.height, 'it does not grow past its size');
  assert.equal(new Set(steps).size, POP_STEPS);
  assert.equal(deskSprite(cafe, { ...d, grow: 0.21 }, 4, ink), steps[0], 'a step between steps');
});

test('the plain workstation, for a world with none of its own, takes the world\'s colours', () => {
```

In `test/scene.test.ts`, replace:

```ts
test('a desk upgrade stands on the floor, in front of a prop or hidden behind it like a figure', () => {
```

with:

```ts
test('a workstation is a picture of its own in the plate, under a figure working at it; none before it grows', () => {
  const r = room([]);
  const d = { id: 0, wall: 'right' as const, x0: 30, y0: 30, len: 7, dep: 3, screen: 'write' as const, grow: 1, seed: 0 };
  const g = figure('w', 32, 35, { pose: 'write', facing: { back: true, flip: false } });
  const ids = new Scene().plate(frame(r, { desks: [d], figures: [g] })).layers.map((l) => l.id);
  assert.ok(ids.includes('desk:0'), 'no picture of the workstation');
  assert.ok(ids.indexOf('desk:0') < ids.indexOf('fig:w'), 'the figure is under its workstation');
  const none = new Scene().plate(frame(r, { desks: [{ ...d, grow: 0 }] })).layers;
  assert.ok(!none.some((l) => l.id.startsWith('desk:')), 'a workstation not yet grown');
});

test('a desk upgrade stands on the floor, in front of a prop or hidden behind it like a figure', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/workstation-art.test.ts test/scene.test.ts`
Expected: FAIL: `Cannot find module '.../src/art/scene/desk.ts'` (the art
test), and the new scene test: `no picture of the workstation`.

- [ ] **Step 3: The sprite**

Create `src/art/scene/desk.ts`:

```ts
// Workstations as pictures (see world/desks.ts and Stage): the world's own
// (or the plain one, see worlds/workstation.ts) drawn in its frame at a
// scale, its screen showing what its agent is doing (the shared layer, see
// art/screen.ts), grown out of the floor to a step of its pop. Each is
// drawn once and kept, keyed by everything it shows, so a workstation
// standing still costs only a placement, and one that goes up or down
// costs POP_STEPS small pictures, shared by every workstation in the room.

import type { DeskFrame } from '../../world/frame.ts';
import { toWorld } from '../../world/room.ts';
import type { WorldDef } from '../../worlds/types.ts';
import { workstationOf } from '../../worlds/workstation.ts';
import { Canvas } from '../canvas.ts';
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

// Room round the box for its shadow and its ink, in units.
const PAD = 2;
const MAX = 256;
const cache = new Map<string, DeskSprite>();
export const deskStats = { hits: 0, misses: 0 };

// Workstation `d` of `world` at scale s in ink `ink`.
export function deskSprite(world: WorldDef, d: Pick<DeskFrame, 'wall' | 'screen' | 'grow' | 'seed'>, s: number, ink: string): DeskSprite {
  const step = Math.max(0, Math.min(POP_STEPS, Math.round(d.grow * POP_STEPS)));
  const key = `${world.id}|${ink}|${d.wall}|${d.seed}|${d.screen}|${step}|${s}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    deskStats.hits++;
    return hit;
  }
  deskStats.misses++;
  const art = workstationOf(world);
  const g = growth(d.grow);
  const cu = art.len / 2;
  const cv = art.dep / 2;
  // Its frame grown by g about the middle of its footprint, projected with
  // its back corner at the origin.
  const place = { wall: d.wall, x0: 0, y0: 0 };
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
  const at = (u: number, v: number, z: number): [number, number] => {
    const [x, y] = rel(u, v, z);
    return [x + ox, y + oy];
  };
  if (step > 0) {
    c.save();
    art.draw({ pen: c, s: s * g, at, len: art.len, dep: art.dep, wall: d.wall, island: true, t: 0, active: d.screen !== 'off', seed: d.seed });
    c.restore();
    drawScreen(c, at, art.screen, d.screen, ink);
  }
  const crop = cropped(c);
  const sp: DeskSprite = crop ? { img: crop.img, ax: ox - crop.x, ay: oy - crop.y } : { img: new Canvas(1, 1), ax: 0, ay: 0 };
  cache.set(key, sp);
  if (cache.size > MAX) cache.delete(cache.keys().next().value as string);
  return sp;
}
```

- [ ] **Step 4: In the scene**

In `src/art/scene.ts`, replace:

```ts
//   depth     props, builds, piles, figures, desk upgrades and the critter
//             in depth order (see scene/depth.ts), each particle slotted in
```

with:

```ts
//   depth     props, workstations, builds, piles, figures, desk upgrades
//             and the critter in depth order (see scene/depth.ts), each
//             particle slotted in
```

In `src/art/scene.ts`, replace:

```ts
// again is the same picture. Sprites (tiles, props, builds, figures, desk
// upgrades, emotes, shadows, rings, halos, pills) are cached and keyed by
```

with:

```ts
// again is the same picture. Sprites (tiles, props, workstations, builds,
// figures, desk upgrades, emotes, shadows, rings, halos, pills) are cached
// and keyed by
```

In `src/art/scene.ts`, replace:

```ts
import type { CritterKind, RoomView, WorldDef } from '../worlds/types.ts';
```

with:

```ts
import type { CritterKind, RoomView, WorldDef } from '../worlds/types.ts';
import { workstationOf } from '../worlds/workstation.ts';
```

In `src/art/scene.ts`, replace:

```ts
import { buildSprite, pileSprite } from './scene/build.ts';
```

with:

```ts
import { buildSprite, pileSprite } from './scene/build.ts';
import { POP_STEPS, deskSprite, deskStats, growth } from './scene/desk.ts';
```

In `src/art/scene.ts`, replace:

```ts
    let act = '';
    for (const a of f.active) act += a ? '1' : '0';
    return `${scopeOf(f)}|${span(f.camera)}|${(f.next ?? []).map(span).join(';')}|${act}|${f.figures.length}|${f.builds.map((b) => b.blocks.length).join()}`;
```

with:

```ts
    let act = '';
    for (const a of f.active) act += a ? '1' : '0';
    let desks = '';
    for (const d of f.desks ?? []) desks += `${d.id}${d.screen}${Math.round(d.grow * POP_STEPS)};`;
    return `${scopeOf(f)}|${span(f.camera)}|${(f.next ?? []).map(span).join(';')}|${act}|${f.figures.length}|${f.builds.map((b) => b.blocks.length).join()}|${desks}`;
```

In `src/art/scene.ts`, replace:

```ts
  // contact shadows, the ring each would have if picked, and their emotes;
  // and the desk upgrades.
```

with:

```ts
  // contact shadows, the ring each would have if picked, and their emotes;
  // the workstations and the desk upgrades.
```

In `src/art/scene.ts`, replace:

```ts
    for (const tk of f.trinkets ?? []) {
      yield () => {
```

with:

```ts
    for (const d of f.desks ?? []) {
      if (d.grow <= 0) continue;
      yield () => {
        const m = deskStats.misses;
        const sp = deskSprite(f.world, d, s, ink);
        made(sp.img, deskStats.misses > m);
      };
    }
    for (const tk of f.trinkets ?? []) {
      yield () => {
```

In `src/art/scene.ts`, replace:

```ts
    f.builds.forEach((b, j) => {
      if (b.blocks.length || b.pending.length) {
        const e = this.buildAt(l, b, ink);
```

with:

```ts
    for (const d of f.desks ?? []) {
      // A workstation stands on the floor like a prop, as tall as it has grown.
      if (d.grow <= 0) continue;
      const sp = deskSprite(f.world, d, s, ink);
      const [x, y] = P(d.x0, d.y0, 0);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const r = footprint(d);
      const it: Item = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, h: workstationOf(f.world).height * growth(d.grow), point: false, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: `desk:${d.id}`, img: sp.img, x: dx, y: dy };
      if (seen(it)) out.push(it);
    }
    f.builds.forEach((b, j) => {
      if (b.blocks.length || b.pending.length) {
        const e = this.buildAt(l, b, ink);
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/workstation-art.test.ts test/scene.test.ts test/scene-plate.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1405`, `ℹ pass 1402`, `ℹ fail 3`.

- [ ] **Step 7: Commit**

```bash
git add src/art/scene/desk.ts src/art/scene.ts test/workstation-art.test.ts test/scene.test.ts
git commit -F - <<'EOF'
feat(stations): workstations as sprites in the scene

A workstation is drawn once for what it shows (world, ink, frame,
look, screen, pop step, scale) and kept; standing still it is only
placed. It takes its place in depth order like a prop, its height as
grown, and is warmed with the figures for the cameras a key away. A
pop is five pictures, out of the floor, a little past its size, back.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 5: Workstations go up and come down

**Files:**
- Modify: `src/world/path.ts` (`NavGrid.rerate`), `src/world/stage.ts` (workstations: places taken in order of arrival, popping up and going, walked round), `test/workstations.test.ts`, `test/workstation-art.test.ts`

Each agent that walks in gets a workstation on a free place, which pops up
out of the floor with a puff; when it leaves, its workstation stands empty
a few seconds, then shrinks away. Workstations block walking like
furniture: the routing grid is re-rated round one as it comes or goes
(only its cells), walkers re-plan, and anyone standing where one goes up
steps out of its way. The agents still work at the stations: Task 7 sends
them to their workstations.

- [ ] **Step 1: Write the tests**

In `test/workstations.test.ts`, replace:

```ts
import type { AgentInfo } from '../src/agents.ts';
import { StressSource } from '../src/demo/stress.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Spot } from '../src/world/types.ts';
import { WORLDS } from '../src/worlds/index.ts';
```

with:

```ts
import type { Activity, AgentInfo } from '../src/agents.ts';
import { StressSource } from '../src/demo/stress.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { footprint } from '../src/world/room.ts';
import { EMPTY_S, POP_S, Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Desk, Particle, Spot } from '../src/world/types.ts';
import { WORLDS } from '../src/worlds/index.ts';
import { mines } from '../src/worlds/mines.ts';
```

In `test/workstations.test.ts`, replace:

```ts
      for (let i = 0; i < actors.length; i++) {
        for (let j = i + 1; j < actors.length; j++) {
          const d = Math.hypot(actors[i].x - actors[j].x, actors[i].y - actors[j].y);
          assert.ok(d >= APART, `${tag(actors[i])} and ${actors[j].info.id} ${d.toFixed(1)} apart`);
        }
      }
    }
  });
}
```

with:

```ts
      for (let i = 0; i < actors.length; i++) {
        for (let j = i + 1; j < actors.length; j++) {
          const d = Math.hypot(actors[i].x - actors[j].x, actors[i].y - actors[j].y);
          assert.ok(d >= APART, `${tag(actors[i])} and ${actors[j].info.id} ${d.toFixed(1)} apart`);
        }
      }
    }
  });
}

// ── a workstation's life ────────────────────────────────────────────────

const WIDE = { x: 0, y: 1, w: 150, h: 44 };
const SMALL = { x: 0, y: 1, w: 80, h: 21 };
const lead = (id: string, activity: Activity = 'write', extra: Partial<AgentInfo> = {}): AgentInfo => ({ id, name: id, role: 'lead', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra });
const sub = (id: string, parentId: string, activity: Activity = 'write'): AgentInfo => ({ ...lead(id, activity), role: 'sub', parentId });

function run(stage: Stage, crew: (now: number) => AgentInfo[], seconds: number, start = NOW, each?: (now: number) => void): number {
  let now = start;
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    stage.sync(crew(now), now);
    stage.update(0.05, now);
    each?.(now);
  }
  return now;
}

function staged(r = WIDE, w = mines): Stage {
  const stage = new Stage(w);
  stage.layout(r);
  return stage;
}

const particlesOf = (stage: Stage) => (stage as unknown as { particles: Particle[] }).particles;
// Bits of `kind` within 6 units of a desk's middle.
const near = (stage: Stage, d: Desk, kind: string) => {
  const r = footprint(d);
  return particlesOf(stage).filter((p) => p.kind === kind && Math.hypot(p.x - (r.x0 + r.x1) / 2, p.y - (r.y0 + r.y1) / 2) < 6).length;
};

test('a workstation pops up as its agent comes in, growing out of the floor with a puff and a sparkle in half a second', () => {
  const stage = staged();
  stage.sync([lead('a')], NOW);
  const [w] = stage.workstations();
  assert.equal(w.owner, 'a');
  assert.ok(near(stage, w.desk, 'smoke') >= 4 && near(stage, w.desk, 'glint') >= 4, 'no puff and sparkle');
  const grow: number[] = [];
  run(stage, () => [lead('a')], 0.7, NOW, (n) => grow.push(stage.frame(n)!.desks![0].grow));
  for (let k = 1; k < grow.length; k++) assert.ok(grow[k] >= grow[k - 1], `shrank at ${k}`);
  assert.ok(grow[0] > 0 && grow[0] < 0.25, `${grow[0]} grown at first`);
  assert.ok(grow[POP_S * 20 - 2] < 1, 'up too soon');
  assert.equal(grow[POP_S * 20], 1, 'not up in half a second');
});

test('left empty, a workstation stands a few seconds, then shrinks away with a puff; its place is free for the next to come', () => {
  const stage = staged();
  let now = run(stage, () => [lead('a')], 10);
  const [w] = stage.workstations();
  const place = w.desk;
  const t0 = now;
  const seen: Array<[number, number | null, string | null, number]> = [];
  let puffed = 0;
  now = run(stage, () => [], EMPTY_S + POP_S + 1, now, (n) => {
    const d = stage.frame(n)!.desks!.find((x) => x.id === place.index);
    const t = (n - t0) / 1000;
    seen.push([t, d ? d.grow : null, d ? d.screen : null, stage.workstations().length]);
    if (t > EMPTY_S && t < EMPTY_S + 0.2) puffed = Math.max(puffed, near(stage, place, 'smoke'));
  });
  for (const [t, grow, screen, up] of seen) {
    if (t > 0.1 && t < EMPTY_S - 0.1) assert.deepEqual([grow, screen, up], [1, 'off', 1], `at ${t.toFixed(2)} s`);
    if (t > EMPTY_S + 0.15 && t < EMPTY_S + POP_S - 0.1) assert.ok(grow !== null && grow > 0 && grow < 1, `at ${t.toFixed(2)} s: grown ${grow}`);
    if (t > EMPTY_S + POP_S + 0.15) assert.equal(up, 0, `at ${t.toFixed(2)} s: still there`);
  }
  assert.ok(puffed >= 4, 'no puff as it went');
  // The next lead to come takes the place.
  run(stage, () => [lead('b')], 1, now);
  assert.equal(stage.workstations()[0].desk, place);
  assert.equal(stage.workstations()[0].owner, 'b');
});

test('one back within those few seconds takes its own again, as it stands', () => {
  const stage = staged();
  let now = run(stage, () => [lead('a')], 10);
  const [w] = stage.workstations();
  now = run(stage, () => [], 2, now);
  assert.equal(w.owner, null);
  run(stage, () => [lead('a')], 1, now);
  assert.deepEqual(stage.workstations().map((x) => [x, x.owner]), [[w, 'a']]);
  assert.equal(stage.frame(now)!.desks![0].grow, 1, 'it popped up again');
});

test('nobody walks through a workstation, and nobody is trapped: one that goes up where someone stands sends them out of its way', () => {
  // A crowd coming and going, waiting and at work, in a mid-sized room.
  const stage = staged({ x: 0, y: 1, w: 120, h: 33 }, WORLDS.find((w) => w.id === 'cafe')!);
  const ids = Array.from({ length: 22 }, (_, i) => `a${i}`);
  const crew = (n: number) =>
    ids.flatMap((id, i) => {
      const t = (n - NOW) / 1000;
      // each comes at its own time and goes a while later; some wait, some work
      if (t < i * 1.5 || t > 40 + (i % 5) * 6) return [];
      return [lead(id, Math.floor(t / 7 + i) % 3 === 0 ? 'idle' : 'write', { since: NOW + Math.floor(t / 7) * 7000 })];
    });
  const stuck = new Map<string, number>();
  let most = 0;
  let checked = 0;
  run(stage, crew, 70, NOW, () => {
    const up = stage.workstations().map((w) => footprint(w.desk));
    most = Math.max(most, stage.actors().length);
    for (const a of stage.actors()) {
      if (a.state === 'enter') continue;
      const inside = up.find((r) => a.x > r.x0 + 0.25 && a.x < r.x1 - 0.25 && a.y > r.y0 + 0.25 && a.y < r.y1 - 0.25);
      // Inside one only while stepping out of it.
      const t = inside ? (stuck.get(a.info.id) ?? 0) + 0.05 : 0;
      stuck.set(a.info.id, t);
      assert.ok(t < 1, `${a.info.id} inside a workstation for ${t.toFixed(2)} s, at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
      if (inside) assert.ok(a.path.length > 0, `${a.info.id} stands inside a workstation`);
      checked++;
    }
  });
  assert.ok(most >= 15 && checked > 10_000, `${most} at most, ${checked} looks`);
  assert.equal(stage.workstations().length, 0, 'workstations left standing');
});
```

In `test/workstation-art.test.ts`, replace:

```ts
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { POP_STEPS, deskSprite, deskStats } from '../src/art/scene/desk.ts';
import { drawScreen } from '../src/art/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Screen } from '../src/world/frame.ts';
import type { Quad } from '../src/worlds/types.ts';
```

with:

```ts
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { Scene } from '../src/art/scene.ts';
import { POP_STEPS, deskSprite, deskStats } from '../src/art/scene/desk.ts';
import { drawScreen } from '../src/art/screen.ts';
import { StressSource } from '../src/demo/stress.ts';
import { Screen as Term } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Screen } from '../src/world/frame.ts';
import { World } from '../src/world/world.ts';
import type { Quad } from '../src/worlds/types.ts';
```

In `test/workstation-art.test.ts`, replace:

```ts
test('the plain workstation, for a world with none of its own, takes the world\'s colours', () => {
```

with:

```ts
test('in the plate a standing workstation keeps its picture from frame to frame, and gets another when its screen changes', () => {
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('mines')!, live: new StressSource(2, 2, start), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.resize(150, 46);
  let t = start;
  for (let i = 0; i < 10 * 18; i++) w.tick((t = start + i * (1000 / 18)));
  w.draw(new Term(150, 46), t);
  const f = w.scene()!;
  assert.equal(f.desks!.length, 6);
  const scene = new Scene();
  const keys = (fr: typeof f) => new Map(scene.plate(fr).layers.filter((l) => l.id.startsWith('desk:')).map((l) => [l.id, l.pic.key]));
  const first = keys(f);
  assert.equal(first.size, 6);
  assert.deepEqual(keys({ ...f, t: f.t + 0.5 }), first, 'a picture changed with nothing to change it');
  const d = f.desks![0];
  const next = keys({ ...f, desks: f.desks!.map((x) => (x === d ? { ...x, screen: x.screen === 'web' ? 'read' : 'web' } : x)) });
  for (const [id, key] of first) assert.equal(next.get(id) === key, id !== `desk:${d.id}`, id);
});

test('the plain workstation, for a world with none of its own, takes the world\'s colours', () => {
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/workstations.test.ts test/workstation-art.test.ts`
Expected: FAIL: `test/workstations.test.ts` does not load (`The requested
module '../src/world/stage.ts' does not provide an export named
'EMPTY_S'`), and the plate test fails (`Cannot read properties of
undefined (reading 'length')`: the frame has no `desks`).

- [ ] **Step 3: Re-rating only part of the routing grid**

In `src/world/path.ts`, replace:

```ts
  isOpen(s: Spot): boolean {
    return this.open[this.cellOf(s)] !== SHUT;
  }

```

with:

```ts
  isOpen(s: Spot): boolean {
    return this.open[this.cellOf(s)] !== SHUT;
  }

  // Rates again the cells whose centres lie in [x0, x1) x [y0, y1) (as the
  // constructor does), when something there came or went.
  rerate(x0: number, y0: number, x1: number, y1: number, blocked: (x: number, y: number) => boolean | number): void {
    const c0 = Math.max(0, Math.floor((x0 - this.x0) / this.cell - 0.5));
    const c1 = Math.min(this.cols - 1, Math.ceil((x1 - this.x0) / this.cell - 0.5));
    const r0 = Math.max(0, Math.floor((y0 - this.y0) / this.cell - 0.5));
    const r1 = Math.min(this.rows - 1, Math.ceil((y1 - this.y0) / this.cell - 0.5));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const [x, y] = this.centre(c, r);
        if (x < x0 || x >= x1 || y < y0 || y >= y1) continue;
        const b = blocked(x, y);
        this.open[r * this.cols + c] = b === true || b === SHUT ? SHUT : b === NEAR ? NEAR : OPEN;
      }
    }
  }

```

- [ ] **Step 4: The stage's workstations**

In `src/world/stage.ts`, replace:

```ts
import type { WorldDef } from '../worlds/types.ts';
import { Works } from './build.ts';
```

with:

```ts
import type { WorldDef } from '../worlds/types.ts';
import { workstationOf } from '../worlds/workstation.ts';
import { Works } from './build.ts';
```

In `src/world/stage.ts`, replace:

```ts
import type { BuildFrame, Camera, FigureFrame, LabelFrame, SceneFrame, Trinket, TrinketFrame } from './frame.ts';
```

with:

```ts
import type { BuildFrame, Camera, DeskFrame, FigureFrame, LabelFrame, SceneFrame, Screen as DeskScreen, Trinket, TrinketFrame } from './frame.ts';
```

In `src/world/stage.ts`, replace:

```ts
import type { Facing, Layout, Particle, Poi, Slot, Spot, StationKind } from './types.ts';
```

with:

```ts
import type { Desk, Facing, Layout, Particle, Poi, Slot, Spot, StationKind } from './types.ts';
```

In `src/world/stage.ts`, replace:

```ts
const SETTLE_MS = 3000;
const DWELL_MS = 9000;

```

with:

```ts
const SETTLE_MS = 3000;
const DWELL_MS = 9000;
// A workstation grows out of the floor, or shrinks back into it, this long
// (seconds); one left empty stands this long before it goes.
export const POP_S = 0.5;
export const EMPTY_S = 4;

```

In `src/world/stage.ts`, replace:

```ts
// A crew role's key: its crew and role (see pet/crew.ts).
const roleKey = (a: AgentInfo) => `${a.crew}\n${roleOf(a)}`;
```

with:

```ts
// A crew role's key: its crew and role (see pet/crew.ts).
const roleKey = (a: AgentInfo) => `${a.crew}\n${roleOf(a)}`;

// The team an agent is in: its lead's id (its own for a lead, or for one
// whose lead is not known).
const teamOf = (a: AgentInfo) => (a.role === 'lead' ? a.id : (a.parentId ?? a.id));

// A workstation up on a desk (see desks.ts): whose it is (null once left
// empty), who had it last, when it went up and when it was left (stage
// clock; Infinity while it is someone's).
export type Workstation = { desk: Desk; owner: string | null; was: string; born: number; left: number };

// What a workstation's screen shows for its agent's activity.
export function screenFor(a: Activity): DeskScreen {
  switch (a) {
    case 'write':
    case 'read':
    case 'search':
    case 'run':
    case 'web':
    case 'think':
      return a;
    case 'talk':
    case 'delegate':
      return 'talk';
    default:
      return 'off';
  }
}
```

In `src/world/stage.ts`, replace:

```ts
  private critter: Critter | null = null;

```

with:

```ts
  private critter: Critter | null = null;
  // The workstations up, by desk index, and a count that moves on whenever
  // one goes up or down (walkers re-plan round it).
  private desks = new Map<number, Workstation>();
  private desksVer = 0;
  private desksSeen = 0;

```

In `src/world/stage.ts`, replace:

```ts
  stations(): Slot[] {
    return this.L?.slots ?? [];
  }

```

with:

```ts
  stations(): Slot[] {
    return this.L?.slots ?? [];
  }

  // The workstations up, in desk order.
  workstations(): Workstation[] {
    return [...this.desks.values()].sort((a, b) => a.desk.index - b.desk.index);
  }

```

In `src/world/stage.ts`, replace:

```ts
    if (key !== this.worldKey) this.build(L, key);
```

with:

```ts
    if (key !== this.worldKey) {
      this.build(L, key);
      // A new room: everyone's workstation is up in it already, in order
      // of arrival.
      for (const a of [...this.cast.values()].sort((p, q) => p.order - q.order)) if (a.state !== 'leave') this.claim(a, true);
    }
```

In `src/world/stage.ts`, replace:

```ts
    this.blocksAt = -1;
    this.nav = null;
    this.spots = this.plan.pois;
```

with:

```ts
    this.blocksAt = -1;
    this.nav = null;
    this.desks.clear();
    this.desksVer++;
    this.spots = this.plan.pois;
```

In `src/world/stage.ts`, replace:

```ts
  // Inside some prop's footprint (a station or decor), a build or a pile
  // (grown by `margin`).
  private inside(s: Spot, margin: number): boolean {
    for (const p of this.plan?.props ?? []) {
      const r = footprint(p);
      if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    }

```

with:

```ts
  // Inside some prop's footprint (a station or decor), a workstation, a
  // build or a pile (grown by `margin`).
  private inside(s: Spot, margin: number): boolean {
    for (const p of this.plan?.props ?? []) {
      const r = footprint(p);
      if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    }
    for (const w of this.desks.values()) {
      const r = slotRect(w.desk);
      if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    }

```

In `src/world/stage.ts`, replace:

```ts
  // A build or pile appeared (or went): walkers re-plan round it, and anyone
  // standing where it now is steps out of the way.
  private makeWay(): void {
    for (const a of this.cast.values()) {
      if (a.state === 'enter') continue;
      if (a.path.length) {
        const to = a.path[a.path.length - 1];
        this.walkTo(a, to);
      } else if (this.inside(a, 0.3)) {
```

with:

```ts
  // A build, a pile or a workstation appeared (or went): walkers re-plan
  // round it (one bound for where it now stands stops beside it), and
  // anyone standing where it now is steps out of the way.
  private makeWay(): void {
    this.desksSeen = this.desksVer;
    for (const a of this.cast.values()) {
      if (a.state === 'enter') continue;
      if (a.path.length) {
        const to = a.path[a.path.length - 1];
        this.walkTo(a, this.inside(to, 0.3) ? (this.nearestStandable(to) ?? to) : to);
      } else if (this.inside(a, 0.3)) {
```

In `src/world/stage.ts`, replace:

```ts
        if (heightAt(room, s.x + dx, s.y + dy) > (dx + dy) / 2 + 5) return false;
      }
    }
    return true;
  }
```

with:

```ts
        if (this.tall(s.x + dx, s.y + dy) > (dx + dy) / 2 + 5) return false;
      }
    }
    return true;
  }

  // How tall what stands over (x, y) is: a prop, or a workstation.
  private tall(x: number, y: number): number {
    let h = heightAt(this.plan!, x, y);
    for (const w of this.desks.values()) {
      const r = slotRect(w.desk);
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) h = Math.max(h, workstationOf(this.world).height);
    }
    return h;
  }
```

In `src/world/stage.ts`, replace:

```ts
  // Where the k-th of a crowd at `st` stands (see LANES and retarget).
```

with:

```ts
  // ── workstations ──────────────────────────────────────────────────────
  // Whether desk d is free to take: no workstation on it, or one left
  // empty that has not begun to go.
  private open(d: Desk): boolean {
    const w = this.desks.get(d.index);
    return !w || (w.owner === null && this.clock - w.left < EMPTY_S);
  }

  private ownDesk(a: Actor): Workstation | null {
    for (const w of this.desks.values()) if (w.owner === a.info.id) return w;
    return null;
  }

  // A place for a's workstation (see claim): the one it left a moment ago
  // if it is still there; for a lead (or a subagent whose lead is not in
  // the room), the lead's place of a pod nobody is in, else of any pod,
  // else the free place nearest the way in; for a subagent, the place in
  // its lead's pod nearest its lead's, else the free place nearest its
  // lead's (sparing the lead's places of pods nobody is in); null when
  // every place is taken.
  private placeFor(a: Actor): Desk | null {
    const all = this.plan?.desks ?? [];
    const free = all.filter((d) => this.open(d));
    if (!free.length) return null;
    const back = free.find((d) => this.desks.get(d.index)?.was === a.info.id);
    if (back) return back;
    const empty = (pod: number) => all.every((d) => d.pod !== pod || this.open(d));
    const by = (p: Spot) => (x: Desk, y: Desk) => Math.hypot(x.spot.x - p.x, x.spot.y - p.y) - Math.hypot(y.spot.x - p.x, y.spot.y - p.y);
    const door = this.door()?.spot ?? { x: 0, y: 0 };
    const lead = this.cast.get(teamOf(a.info));
    if (!lead || lead === a) return free.find((d) => d.lead && empty(d.pod)) ?? free.find((d) => d.lead) ?? [...free].sort(by(door))[0];
    const home = this.ownDesk(lead)?.desk;
    const from: Spot = home?.spot ?? lead;
    const pod = home ? free.filter((d) => d.pod === home.pod) : [];
    if (pod.length) return [...pod].sort(by(from))[0];
    const spare = free.filter((d) => !(d.lead && empty(d.pod)));
    return [...(spare.length ? spare : free)].sort(by(from))[0];
  }

  // Puts up a workstation for `a` on a free place, if it has none and there
  // is one: it pops up out of the floor with a puff (at once if `quick`).
  // Its own, or null.
  private claim(a: Actor, quick = false): Workstation | null {
    const had = this.ownDesk(a);
    if (had || !this.plan) return had;
    const d = this.placeFor(a);
    if (!d) return null;
    let w = this.desks.get(d.index);
    if (!w) {
      w = { desk: d, owner: null, was: '', born: quick ? -Infinity : this.clock, left: Infinity };
      this.desks.set(d.index, w);
      this.deskMoved(d);
      if (!quick) this.poof(d);
    }
    w.owner = a.info.id;
    w.left = Infinity;
    this.trinketsDue = true;
    return w;
  }

  // A workstation went up or down: routes round it again (only its cells).
  private deskMoved(d: Desk): void {
    this.desksVer++;
    const r = slotRect(d);
    const pad = NAV_PAD + NAV_CELL;
    this.nav?.rerate(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad, (x, y) => this.rate(x, y));
  }

  // Workstations follow their agents: one whose agent is leaving or gone
  // is left empty; one left empty for EMPTY_S shrinks away with a puff and
  // is gone POP_S later. Those without one of their own then take a place
  // come free.
  private upkeep(dt: number): void {
    let freed = false;
    for (const [i, w] of this.desks) {
      if (w.owner) {
        const o = this.cast.get(w.owner);
        if (o && o.state !== 'leave' && !o.gone) continue;
        w.was = w.owner;
        w.owner = null;
        w.left = this.clock;
        this.trinketsDue = true;
        freed = true;
        continue;
      }
      const t = this.clock - w.left;
      if (t >= EMPTY_S && t - dt < EMPTY_S) this.poof(w.desk);
      if (t >= EMPTY_S + POP_S) {
        this.desks.delete(i);
        this.deskMoved(w.desk);
        freed = true;
      }
    }
    if (!freed) return;
    for (const a of [...this.cast.values()].sort((p, q) => p.order - q.order)) if (a.state !== 'leave' && !a.gone) this.claim(a);
  }

  // A puff of dust and a few sparkles where a workstation pops up or goes.
  private poof(d: Desk): void {
    const r = slotRect(d);
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const rng = this.rng;
    for (let i = 0; i < 8; i++) {
      this.add({ ...smoke(cx + rng.range(-3, 3), cy + rng.range(-1.5, 1.5), 0.5 + rng.next(), rng, [214, 206, 196]), life: 0.6 + rng.next() * 0.4 });
    }
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      this.add({ kind: 'glint', x: cx + Math.cos(ang) * 2, y: cy + Math.sin(ang) * 2, z: 3 + rng.next() * 4, vx: Math.cos(ang) * 3, vy: Math.sin(ang) * 3, vz: 3 + rng.next() * 3, life: 0.5 + rng.next() * 0.3, color: [255, 241, 184], glow: true, gravity: 0 });
    }
  }

  // Where the k-th of a crowd at `st` stands (see LANES and retarget).
```

In `src/world/stage.ts`, replace:

```ts
  // Round the props on the room's own grid; once builds or piles stand, on
  // one that has them too (rebuilt when they change).
  private route(from: Spot, to: Spot): Spot[] | null {
    const L = this.L;
    if (!L || !this.plan) return null;
    const o = this.obstacles();
    let nav = this.plan.nav;
    if (o.discs.length || o.rects.length) {
      const key = `${this.worldKey}:${this.works?.version ?? 0}`;
      if (!this.nav || this.navKey !== key) {
        this.navKey = key;
        this.nav = new NavGrid(L.T, L.T, L.W - 1, L.D - 1, NAV_CELL, (x, y) => (this.inside({ x, y }, 0.8) ? 2 : this.inside({ x, y }, NAV_PAD) ? 1 : 0));
      }
      nav = this.nav;
    }
    const cells = nav.find(from, to);
    if (!cells) return null;
    return smooth(from, [...cells.slice(1, -1), to], (p, q) => !this.clips(p, q));
  }
```

with:

```ts
  // Round the props, the workstations, the builds and the piles, on a grid
  // of the room's floor built afresh when the builds change and re-rated
  // round a workstation as it goes up or down (see deskMoved).
  private route(from: Spot, to: Spot): Spot[] | null {
    const L = this.L;
    if (!L || !this.plan) return null;
    this.obstacles();
    const key = `${this.worldKey}:${this.works?.version ?? 0}`;
    if (!this.nav || this.navKey !== key) {
      this.navKey = key;
      this.nav = new NavGrid(L.T, L.T, L.W - 1, L.D - 1, NAV_CELL, (x, y) => this.rate(x, y));
    }
    const cells = this.nav.find(from, to);
    if (!cells) return null;
    return smooth(from, [...cells.slice(1, -1), to], (p, q) => !this.clips(p, q));
  }

  // A routing cell's rating (see NavGrid): inside something, near it, or open.
  private rate(x: number, y: number): number {
    return this.inside({ x, y }, 0.8) ? 2 : this.inside({ x, y }, NAV_PAD) ? 1 : 0;
  }
```

In `src/world/stage.ts`, replace:

```ts
  sync(agents: AgentInfo[], now: number): void {
    this.now = now;
    const ids = new Set<string>();
    for (const info of agents) {
```

with:

```ts
  sync(agents: AgentInfo[], now: number): void {
    this.now = now;
    const ids = new Set<string>();
    // Newcomers in order of arrival, leads before their subagents (a lead's
    // workstation goes up first, its team's round it).
    for (const info of agents) if (!this.cast.has(info.id) && info.role === 'lead') this.spawn(info, now);
    for (const info of agents) {
```

In `src/world/stage.ts`, replace:

```ts
      if (a.state === 'leave') {
        a.state = 'walk';
        this.life.end(a);
        this.retarget(a);
        continue;
      }
```

with:

```ts
      if (a.state === 'leave') {
        // Back after all: its workstation again (the one it left, if it
        // still stands).
        a.state = 'walk';
        this.life.end(a);
        this.claim(a);
        this.retarget(a);
        continue;
      }
```

In `src/world/stage.ts`, replace:

```ts
    this.cast.set(info.id, a);
    this.trinketsDue = true;
    this.retarget(a);
```

with:

```ts
    this.cast.set(info.id, a);
    this.trinketsDue = true;
    this.claim(a);
    this.retarget(a);
```

In `src/world/stage.ts`, replace:

```ts
    this.life.update([...this.cast.values()], dt);
    this.tally(dt);
    if ((this.works?.version ?? -1) !== this.blocksAt) this.makeWay();
```

with:

```ts
    this.life.update([...this.cast.values()], dt);
    this.upkeep(dt);
    this.tally(dt);
    if ((this.works?.version ?? -1) !== this.blocksAt || this.desksVer !== this.desksSeen) this.makeWay();
```

In `src/world/stage.ts`, replace:

```ts
      critter,
      trinkets: this.trinkets,
      builds,
```

with:

```ts
      critter,
      trinkets: this.trinkets,
      desks: this.workstations().map((w) => this.deskFrame(w)),
      builds,
```

In `src/world/stage.ts`, replace:

```ts
  // The ghost's hue: cyan where the world is warm (its floor and backdrop
  // redder than blue), amber where it is cold.
```

with:

```ts
  // A workstation as the frame shows it: its screen (its agent's activity,
  // dim once left) and how far it has grown out of the floor (popping up,
  // or shrinking away once left empty a while).
  private deskFrame(w: Workstation): DeskFrame {
    const d = w.desk;
    const o = w.owner ? this.cast.get(w.owner) : undefined;
    const gone = this.clock - w.left - EMPTY_S;
    const grow = gone > 0 ? Math.max(0, 1 - gone / POP_S) : Math.min(1, (this.clock - w.born) / POP_S);
    return { id: d.index, wall: d.wall, x0: d.x0, y0: d.y0, len: d.len, dep: d.dep, screen: o ? screenFor(o.info.activity) : 'off', grow, seed: d.index % 3 };
  }

  // The ghost's hue: cyan where the world is warm (its floor and backdrop
  // redder than blue), amber where it is cold.
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/workstations.test.ts test/workstation-art.test.ts`
Expected: PASS but for the three stress tests (the agents still work at
the stations: `mines 80x24: L0 is walk`, `mines 200x60: L0 not at its
own`).

- [ ] **Step 6: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1410`, `ℹ pass 1407`, `ℹ fail 3`.

- [ ] **Step 7: Commit**

```bash
git add src/world/path.ts src/world/stage.ts test/workstations.test.ts test/workstation-art.test.ts
git commit -F - <<'EOF'
feat(stations): workstations go up as agents come in, and go after them

Each agent that walks in takes a free place in order of arrival (a
lead a pod of its own, a subagent a place in its lead's pod or the
nearest), and its workstation pops up out of the floor with a puff and
a sparkle; left empty, it stands a few seconds, then shrinks away and
the place is free again. Workstations block walking like furniture:
only their cells of the routing grid are rated again as they come or
go, and walkers re-plan round them.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 6: A desk upgrade stands on its agent's own workstation

**Files:**
- Modify: `src/world/stage.ts` (the upgrades), `src/world/frame.ts` (`TrinketFrame.z`), `src/art/scene.ts` (an upgrade drawn at its height), `src/world/room.ts` (comments), `test/stage.test.ts`

A role's ★5 upgrade (a plant, a mug or a trophy) stands on the workstation
of the first of its agents that has one up, at the spot the world's
workstation names on its top; the time each role spent at each station,
which chose its favourite, is no longer kept. (Done before Task 7: once
agents work at their workstations no station is anyone's favourite.)

- [ ] **Step 1: Write the tests**

These replace the tests of upgrades by a favourite station.

In `test/stage.test.ts`, replace:

```ts
import { stubProp } from '../src/worlds/stub.ts';
```

with:

```ts
import { stubProp } from '../src/worlds/stub.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
```

In `test/stage.test.ts`, replace:

```ts
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

with:

```ts
test('at ★5 a crew role gets a desk upgrade, on its agent\'s workstation; below, none; it goes with its agent', () => {
  const stage = newStage(WIDE);
  const writer = agent('w', 'write', { crew: '/p', role: 'lead', level: 5 });
  const junior = agent('j', 'write', { crew: '/p', agentType: 'Explore', level: 4 });
  let now = run(stage, [writer, junior], 30);
  let f = stage.frame(now)!;
  assert.equal(f.trinkets!.length, 1);
  const tk = f.trinkets![0];
  assert.equal(tk.id, '/p\nlead');
  assert.ok(['plant', 'mug', 'trophy'].includes(tk.kind));
  const own = stage.workstations().find((w) => w.owner === 'w')!;
  const r = footprint(own.desk);
  assert.ok(tk.x > r.x0 && tk.x < r.x1 && tk.y > r.y0 && tk.y < r.y1, `at ${tk.x},${tk.y}, not on its workstation`);
  assert.ok(tk.z! > 2 && tk.z! < workstationOf(mines).height, `${tk.z} up: not on its top`);
  // Reading now: still on its own workstation.
  now = run(stage, [{ ...writer, activity: 'read', since: now }, junior], 10, now);
  f = stage.frame(now)!;
  assert.deepEqual(f.trinkets!.map((t) => [t.x, t.y]), [[tk.x, tk.y]]);
  // Gone with its agent.
  now = run(stage, [junior], 20, now);
  assert.deepEqual(stage.frame(now)!.trinkets, []);
});

test('two roles\' upgrades stand each on its own workstation; a mug steams', () => {
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
    steam = Math.max(steam, particlesOf(stage).filter((p) => p.kind === 'steam' && Math.hypot(p.x - mug.x, p.y - mug.y) < 3 && p.z >= mug.z!).length);
  }
  assert.ok(steam > 0, 'steam off the mug');
});


```

In `test/stage.test.ts`, replace:

```ts
// How far a spot is from a rect (0 inside it).
const off = (p: { x: number; y: number }, r: { x0: number; y0: number; x1: number; y1: number }) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));

test('a desk upgrade stands by its own station, nearer it than any other, clear of the props and of the entrance, off where anyone works or stands; with no such spot, none', () => {
  let shown = 0;
  for (const id of ['snowy', 'cafe']) {
    const w = THEMES.find((t) => t.id === id)!;
    for (const act of ['write', 'read', 'search', 'run', 'web', 'think'] as Activity[]) {
      // A 90x26 terminal's scene; four roles at one station, at ★5.
      const stage = newStage({ x: 0, y: 1, w: 90, h: 23 }, w);
      const crew = [0, 1, 2, 3].map((i) => agent(`a${i}`, act, { crew: '/p', agentType: `t${i}`, level: 5 }));
      const now = run(stage, crew, 12);
      const slots = stage.stations();
      const own = slotRect(slots.find((s) => s.kind === stationKindFor(act))!);
      const door = slots.find((s) => s.kind === 'entrance')!;
      for (const tk of stage.frame(now)!.trinkets!) {
        shown++;
        const what = `${id}/${act}/${tk.id.split('\n')[1]} at ${tk.x.toFixed(1)},${tk.y.toFixed(1)}`;
        for (const s of slots) if (s.kind !== stationKindFor(act)) assert.ok(off(tk, slotRect(s)) > off(tk, own), `${what}: nearer the ${s.kind}`);
        for (const p of stage.room()!.props) assert.ok(off(tk, footprint(p)) >= 1, `${what}: in a prop`);
        for (const p of [...slots.map((s) => s.spot), ...stage.pois()]) assert.ok(Math.hypot(p.x - tk.x, p.y - tk.y) >= 2, `${what}: on a spot someone stands at`);
        assert.ok(off(tk, slotRect(door)) >= 4, `${what}: in the way in`);
      }
    }
  }
  assert.ok(shown >= 12, `${shown} desk upgrades`);
});

test('in a small room a desk upgrade stands nearer where anyone works rather than not at all, never on a spot or a lane, nor by the way in', () => {
  let roles = 0;
  let shown = 0;
  for (const w of THEMES) {
    // An 80x24 terminal's scene; a role at each station, at ★5.
    const stage = newStage({ x: 0, y: 1, w: 80, h: 22 }, w);
    const crew = (['write', 'read', 'search', 'run', 'web', 'think'] as Activity[]).map((act, i) => agent(`a${i}`, act, { crew: '/p', agentType: `t${i}`, level: 5, since: NOW - 60_000 }));
    const now = run(stage, crew, 15);
    roles += crew.length;
    const slots = stage.stations();
    const door = slots.find((s) => s.kind === 'entrance')!;
    // Where anyone stands: the spots idlers like, the way in, and a crowd's first lanes at each station.
    const lanes = stage as unknown as { laneSpot(s: Slot, k: number): { x: number; y: number } };
    const stands = [...stage.pois(), door.spot, ...slots.filter((s) => s !== door).flatMap((s) => [0, 1, 2, 3, 4].map((k) => lanes.laneSpot(s, k)))];
    for (const tk of stage.frame(now)!.trinkets!) {
      shown++;
      const what = `${w.id}/${tk.id.split('\n')[1]} at ${tk.x.toFixed(1)},${tk.y.toFixed(1)}`;
      for (const p of stage.room()!.props) assert.ok(off(tk, footprint(p)) >= 1, `${what}: in a prop`);
      for (const p of stands) assert.ok(Math.hypot(p.x - tk.x, p.y - tk.y) >= 2, `${what}: on a spot someone stands at`);
      assert.ok(off(tk, slotRect(door)) >= 4, `${what}: in the way in`);
    }
  }
  assert.ok(shown >= roles - 1, `${shown} of ${roles} roles have a desk upgrade`);
});


```

with:

```ts
test('in every world, in a small room, each ★5 role whose agent has a workstation up has its upgrade on it, at the world\'s spot; one sharing has none', () => {
  let shown = 0;
  for (const w of THEMES) {
    // An 80x24 terminal's scene; more roles at ★5 than places.
    const stage = newStage({ x: 0, y: 1, w: 80, h: 22 }, w);
    const places = stage.room()!.desks.length;
    const crew = Array.from({ length: places + 2 }, (_, i) => agent(`a${i}`, (['write', 'read', 'search'] as Activity[])[i % 3], { crew: '/p', agentType: `t${i}`, level: 5, since: NOW - 60_000 }));
    const now = run(stage, crew, 15);
    const top = workstationOf(w).top;
    const trinkets = stage.frame(now)!.trinkets!;
    for (const ws of stage.workstations()) {
      const role = `/p\nt${ws.owner!.slice(1)}`;
      const tk = trinkets.find((t) => t.id === role);
      assert.ok(tk, `${w.id}: ${ws.owner} has no upgrade`);
      const [x, y, z] = toWorld(ws.desk, ...top);
      assert.deepEqual([tk.x, tk.y, tk.z], [x, y, z], `${w.id}: ${ws.owner}'s upgrade is not on its workstation`);
      shown++;
    }
    assert.equal(trinkets.length, stage.workstations().length, `${w.id}: an upgrade with no workstation`);
  }
  assert.ok(shown >= 16 * 3, `${shown} desk upgrades`);
});


```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/stage.test.ts`
Expected: FAIL: the three new upgrade tests (`at 70,10, not on its
workstation`, `steam off the mug`, `mines: a0's upgrade is not on its
workstation`: upgrades still stand by a station, on the floor).

- [ ] **Step 3: The upgrades, on the workstation**

In `src/world/stage.ts`, replace:

```ts
import { NAV_CELL, NAV_PAD, deskSpots, footprint, heightAt, planRoom, toWorld } from './room.ts';
```

with:

```ts
import { NAV_CELL, NAV_PAD, footprint, heightAt, planRoom, toWorld } from './room.ts';
```

In `src/world/stage.ts`, replace:

```ts
// Desk upgrades by role (picked by a hash of crew and role); how far it
// keeps from where anyone works or stands (the first of these it can, so
// a small room's crowded station still gets one, never on such a spot)
// and from the entrance; how often they are worked out again (seconds)
// when nothing says so sooner; crew roles whose time at each station is
// kept, at most. Where one may stand by its station: see deskSpots.
const TRINKETS: readonly Trinket[] = ['plant', 'mug', 'trophy'];
const TRINKET_CLEAR = [4, 3, 2];
const TRINKET_DOOR = 4;
const TRINKETS_EVERY = 0.5;
const MAX_WORKED = 200;
```

with:

```ts
// Desk upgrades by role (picked by a hash of crew and role), and how often
// they are worked out again (seconds) when nothing says so sooner.
const TRINKETS: readonly Trinket[] = ['plant', 'mug', 'trophy'];
const TRINKETS_EVERY = 0.5;
```

In `src/world/stage.ts`, replace:

```ts
// How far a spot is from a rect (0 inside it).
const off = (p: Spot, r: Box) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));


```

with:

```ts

```

In `src/world/stage.ts`, replace:

```ts
  // Seconds each crew role (see roleKey) worked at each station this run,
  // and the desk upgrades as they stand.
  private worked = new Map<string, Map<StationKind, number>>();
  private trinkets: TrinketFrame[] = [];
```

with:

```ts
  // The desk upgrades as they stand.
  private trinkets: TrinketFrame[] = [];
```

In `src/world/stage.ts`, replace:

```ts
    this.upkeep(dt);
    this.tally(dt);
```

with:

```ts
    this.upkeep(dt);
    this.tally();
    this.steamUp(dt);
```

In `src/world/stage.ts`, replace:

```ts
  // Time at work at each station, by crew role, and the desk upgrades it
  // earns (worked out again when the cast or a level changes, else now and
  // then: a favourite station shifts slowly); a mug steams.
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
    if (this.trinketsDue || this.clock >= this.trinketsAt + TRINKETS_EVERY) {
      this.trinkets = this.placeTrinkets();
      this.trinketsDue = false;
      this.trinketsAt = this.clock;
    }
    const r = this.steam;
    for (const tk of this.trinkets) {
      if (tk.kind === 'mug' && r.next() < dt / 0.45) this.add({ ...smoke(tk.x, tk.y, MUG_TOP, r, [236, 232, 228], 'steam'), vz: 2.5, life: 1.3 });
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
      const at = this.trinketSpot(slot, out);
      if (at) out.push({ id: key, kind: TRINKETS[hashString(key) % TRINKETS.length], ...at, color: a.traits.color });
    }
    return out;
  }

  // Where a desk upgrade stands by `slot`: a step out from one of its
  // corners, or further along the wall, the nearest such to it. On the
  // floor clear of every prop, of the entrance and of the upgrades already
  // placed, nearer this station than any other, and as far as it can be
  // from where anyone works (a station's spot and the lanes along it) or
  // likes to stand (see TRINKET_CLEAR); null where there is no such spot.
  private trinketSpot(slot: Slot, placed: readonly Spot[]): Spot | null {
    const L = this.L!;
    const spots = deskSpots(slot);
    const own = slotRect(slot);
    const others = L.slots.filter((s) => s !== slot);
    const stands: Spot[] = [...this.spots];
    for (const s of L.slots) {
      if (s.kind === 'entrance') stands.push(s.spot);
      else for (let k = 0; k < 5; k++) stands.push(this.laneSpot(s, k));
    }
    const free = (p: Spot) =>
      this.standable(p) &&
      placed.every((q) => Math.hypot(q.x - p.x, q.y - p.y) >= 3) &&
      others.every((s) => off(p, slotRect(s)) > off(p, own) && (s.kind !== 'entrance' || off(p, slotRect(s)) >= TRINKET_DOOR));
    // Each free spot, nearest the station first, with how close it comes to where anyone stands.
    const fit = spots
      .filter(free)
      .sort((p, q) => off(p, own) - off(q, own))
      .map((p) => ({ p, clear: Math.min(...stands.map((q) => Math.hypot(q.x - p.x, q.y - p.y))) }));
    for (const clear of TRINKET_CLEAR) {
      const f = fit.find((s) => s.clear >= clear);
      if (f) return f.p;
    }
    return null;
  }
```

with:

```ts
  // The desk upgrades (worked out again when the cast, a level or the room
  // changed, else now and then), and a mug's steam.
  private tally(): void {
    const dt = this.clock - this.trinketsAt;
    if (this.trinketsDue || dt >= TRINKETS_EVERY) {
      this.trinkets = this.placeTrinkets();
      this.trinketsDue = false;
      this.trinketsAt = this.clock;
    }
  }

  // The desk upgrades (★5): one for each crew role here at that level, on
  // the workstation of the first of its agents that has one up (where the
  // world's workstation says, see WorkstationArt.top), a plant, a mug or a
  // trophy by its role, in that agent's colour.
  private placeTrinkets(): TrinketFrame[] {
    if (!this.L) return [];
    const out: TrinketFrame[] = [];
    const done = new Set<string>();
    const top = workstationOf(this.world).top;
    for (const a of this.actors()) {
      if (!a.info.crew || !unlocks(a.info.level ?? 1).desk) continue;
      const key = roleKey(a.info);
      const w = this.ownDesk(a);
      if (done.has(key) || !w || this.clock - w.born < POP_S) continue;
      done.add(key);
      const [x, y, z] = toWorld(w.desk, top[0], top[1], top[2]);
      out.push({ id: key, kind: TRINKETS[hashString(key) % TRINKETS.length], x, y, z, color: a.traits.color });
    }
    return out;
  }

  // Steam off the mugs (on their own chance, so whether one stands shifts
  // nothing else the stage draws).
  private steamUp(dt: number): void {
    const r = this.steam;
    for (const tk of this.trinkets) {
      if (tk.kind === 'mug' && r.next() < dt / 0.45) this.add({ ...smoke(tk.x, tk.y, (tk.z ?? 0) + MUG_TOP, r, [236, 232, 228], 'steam'), vz: 2.5, life: 1.3 });
    }
  }
```

In `src/world/frame.ts`, replace:

```ts
// A desk upgrade (★5; see Stage.trinkets): a plant, a steaming mug or a
// trophy standing on the floor by its owner's favourite station, in its
// owner's colour.
export type Trinket = 'plant' | 'mug' | 'trophy';
// Steam rises off a mug's rim this high (units).
export const MUG_TOP = 3.7;
export type TrinketFrame = { id: string; kind: Trinket; x: number; y: number; color: RGB };
```

with:

```ts
// A desk upgrade (★5; see Stage.trinkets): a plant, a steaming mug or a
// trophy standing on its owner's workstation, `z` up (on the floor without
// one), in its owner's colour.
export type Trinket = 'plant' | 'mug' | 'trophy';
// Steam rises off a mug's rim this high (units) over where it stands.
export const MUG_TOP = 3.7;
export type TrinketFrame = { id: string; kind: Trinket; x: number; y: number; z?: number; color: RGB };
```

In `src/art/scene.ts`, replace:

```ts
    for (const tk of f.trinkets ?? []) {
      // Desk upgrades stand on the floor, sorted like a figure.
      const sp = trinketSprite(tk.kind, tk.color, s, ink);
      const [x, y] = P(tk.x, tk.y, 0);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const it: Item = { x0: tk.x, y0: tk.y, x1: tk.x, y1: tk.y, h: 0, point: true,
```

with:

```ts
    for (const tk of f.trinkets ?? []) {
      // Desk upgrades stand on their workstation, sorted like a figure (on
      // top of the desk it stands on).
      const sp = trinketSprite(tk.kind, tk.color, s, ink);
      const [x, y] = P(tk.x, tk.y, tk.z ?? 0);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const it: Item = { x0: tk.x, y0: tk.y, x1: tk.x, y1: tk.y, h: tk.z ?? 0, point: true,
```

In `src/world/room.ts`, replace:

```ts
// Where a station's desk upgrades may stand (see Stage.trinketSpot): a
// step (DESK_GAP) out from either end, by its back and by its front, then
// `steps` - 1 more steps of 3 units further along. The nearest of these
// are kept clear of decor (see planRoom).
```

with:

```ts
// The floor by a station's ends: a step (DESK_GAP) out from either end, by
// its back and by its front, then `steps` - 1 more steps of 3 units further
// along. The nearest of these are kept clear of floor decor (see planRoom).
```

In `src/world/room.ts`, replace:

```ts
  // where arrivals stand, and the floor a step from each station's ends
  // for its desk upgrades (floor decor likes to stand by the stations).
```

with:

```ts
  // where arrivals stand, and the floor a step from each station's ends
  // (floor decor likes to stand by the stations, not against them).
```

- [ ] **Step 4: Run the tests to see them pass**

Run: `node --test test/stage.test.ts test/scene.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1409`, `ℹ pass 1406`, `ℹ fail 3`
(two tests of upgrades by a station went, one test of upgrades on the
workstation in every world came).

- [ ] **Step 6: Commit**

```bash
git add src/world/stage.ts src/world/frame.ts src/art/scene.ts src/world/room.ts test/stage.test.ts
git commit -F - <<'EOF'
feat(stations): a desk upgrade stands on its agent's own workstation

A role's ★5 upgrade stands on the workstation of the first of its
agents with one up, where the world's workstation says on its top, and
goes with it; the time at each station that picked a favourite is no
longer kept.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 7: Agents work at their own workstations; past capacity, at a teammate's side

**Files:**
- Modify: `src/world/stage.ts` (every kind of work at the agent's own workstation; sharing past capacity), `src/world/life.ts` (a huddle waits for its join window), `test/workstations.test.ts`, `test/stage.test.ts`, `test/office-life.test.ts`, `test/world.test.ts`

Every working activity takes the agent to its own workstation (a new
activity changes its screen and its pose, not its place); waiting, it
roams as before, and asleep it naps at the idle prop. With every place
taken, a newcomer shares a teammate's workstation, standing at its side,
apart from everyone (decision 4), and moves to a place of its own when
one comes free. The stress test turns green here.

The tests that encoded a crowd sharing a station change with it (each
says why in its new title): an agent works at its own workstation, not
at the station for its activity; the lanes in front of a station now
only serve those asleep at the idle prop; the room's stations stand idle
while everyone works at a workstation; a close-up of an agent at a
workstation by the front of the room stops at the room's edge; a high-
five's fallback is tested with the spots beside the lead blocked, as no
workstation leaves none (decision 7); a chat hides its agent's label,
which the label count no longer shows when the room it frees shows a
neighbour's (decision 7); and a mug's steam is compared just after the
bang, as no station is worked to spark (decision 7).

- [ ] **Step 1: Write the tests**

The stress test reads the stage directly now, and gains two tests:

In `test/workstations.test.ts`, replace:

```ts
// What the stage says of its workstations and of the places planned for
// them (see Stage.workstations and Room.desks): none, before there were
// any. (Written first, against the stage as it was.)
type Up = { desk: { spot: Spot }; owner: string | null };
const upOf = (stage: Stage): Up[] => (stage as unknown as { workstations?(): Up[] }).workstations?.() ?? [];
const placesOf = (stage: Stage): number => (stage.room() as unknown as { desks?: unknown[] }).desks?.length ?? 0;


```

with:

```ts

```

In `test/workstations.test.ts`, replace:

```ts
      const places = placesOf(stage);
      const up = upOf(stage);
```

with:

```ts
      const places = stage.room()!.desks.length;
      const up = stage.workstations();
```

In `test/workstations.test.ts`, replace:

```ts
import type { Activity, AgentInfo } from '../src/agents.ts';
import { StressSource } from '../src/demo/stress.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { footprint } from '../src/world/room.ts';
import { EMPTY_S, POP_S, Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Desk, Particle, Spot } from '../src/world/types.ts';
import { WORLDS } from '../src/worlds/index.ts';
import { mines } from '../src/worlds/mines.ts';
```

with:

```ts
import type { Activity, AgentInfo } from '../src/agents.ts';
import { Scene } from '../src/art/scene.ts';
import { StressSource } from '../src/demo/stress.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { footprint } from '../src/world/room.ts';
import { EMPTY_S, POP_S, Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Desk, Particle } from '../src/world/types.ts';
import { World } from '../src/world/world.ts';
import { WORLDS } from '../src/worlds/index.ts';
import { mines } from '../src/worlds/mines.ts';
import { budget } from './helpers.ts';
```

In `test/workstations.test.ts`, replace:

```ts
test('nobody walks through a workstation, and nobody is trapped
```

with:

```ts
test('one sharing a workstation moves to a place of its own when one comes free', () => {
  const stage = staged(SMALL);
  const places = stage.room()!.desks.length;
  const subs = Array.from({ length: places }, (_, i) => `s${i}`);
  let gone = '';
  const crew = () => [lead('L'), ...subs.filter((id) => id !== gone).map((id) => sub(id, 'L'))];
  let now = run(stage, crew, 15);
  const owns = (id: string) => stage.workstations().some((w) => w.owner === id);
  const sharer = subs.find((id) => !owns(id))!;
  assert.ok(sharer, 'nobody shares');
  gone = subs.find((id) => owns(id))!;
  now = run(stage, crew, 10, now);
  assert.ok(owns(sharer), `${sharer} has none of its own`);
  const a = stage.actors().find((x) => x.info.id === sharer)!;
  const own = stage.workstations().find((w) => w.owner === sharer)!;
  assert.equal(a.station, own.desk);
  assert.ok(Math.hypot(a.x - own.desk.spot.x, a.y - own.desk.spot.y) < 0.01, 'not at it');
});

test('nobody walks through a workstation, and nobody is trapped
```

In `test/workstations.test.ts`, replace:

```ts
  assert.ok(most >= 15 && checked > 10_000, `${most} at most, ${checked} looks`);
  assert.equal(stage.workstations().length, 0, 'workstations left standing');
});
```

with:

```ts
  assert.ok(most >= 15 && checked > 10_000, `${most} at most, ${checked} looks`);
  assert.equal(stage.workstations().length, 0, 'workstations left standing');
});

test('twenty at their workstations: the stage\'s frame and the scene\'s plate stay within budget', () => {
  // The model's share of a frame, as for a busy crew at the stations.
  const { stage } = stressed(WORLDS.find((w) => w.id === 'cafe')!, 200, 60);
  let now = NOW + 12_000;
  const src = new StressSource(4, 4, NOW);
  budget(
    'the stage with twenty',
    () => {
      now += 55;
      stage.sync(src.poll(now), now);
      stage.update(0.055, now);
      stage.frame(now);
    },
    10,
    { runs: 5, calls: 20 },
  );
  // The plate: twenty figures, as many workstations, labels; the
  // workstations' sprites drawn once, then placed.
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('cafe')!, live: new StressSource(4, 4, start), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.full = true;
  w.resize(150, 46);
  let t = start;
  for (let i = 0; i < 15 * 18; i++) w.tick((t = start + i * (1000 / 18)));
  w.draw(new Screen(150, 46), t);
  const f = w.scene()!;
  assert.equal(f.desks!.length, 20);
  const scene = new Scene();
  scene.plate(f);
  budget('a plate of twenty at their workstations', (k) => scene.plate({ ...f, t: f.t + k / 30 }), 16, { runs: 5, calls: 1 });
});
```

The stage's tests:

In `test/stage.test.ts`, replace:

```ts
import { LANE, Stage, onScreen, stationKindFor } from '../src/world/stage.ts';
```

with:

```ts
import { LANE, Stage, WORK_APART, onScreen, screenFor, stationKindFor } from '../src/world/stage.ts';
```

In `test/stage.test.ts`, replace:

```ts
import type { Layout, Slot } from '../src/world/types.ts';
```

with:

```ts
import type { Desk, Layout, Slot } from '../src/world/types.ts';
```

In `test/stage.test.ts`, replace:

```ts
const footprintOf = (p: Slot) => footprint(p);
```

with:

```ts
const footprintOf = (p: Slot | Desk) => footprint(p);
```

In `test/stage.test.ts`, replace:

```ts
test('a writer walks from the entrance to the desk and works', () => {
  const stage = newStage();
  const a = agent('w1', 'write');
  stage.sync([a], NOW);
  const actor = stage.actors()[0];
  const door = slot(stage, 'entrance');
  assert.equal(actor.state, 'enter');
  assert.ok(Math.hypot(actor.x - door.spot.x, actor.y - door.spot.y) < 1e-9, 'spawns at the entrance');
  run(stage, [a], 12);
  const desk = slot(stage, 'write');
  assert.equal(actor.state, 'work');
  assert.equal(actor.station, desk);
  assert.ok(Math.hypot(actor.x - desk.spot.x, actor.y - desk.spot.y) < 1e-6);
});

test('readers go to the left wall', () => {
  const stage = newStage();
  run(stage, [agent('r', 'read')], 12);
  const actor = stage.actors()[0];
  assert.equal(actor.station?.kind, 'read');
  assert.equal(actor.station?.wall, 'left');
});
```

with:

```ts
test('a writer walks from the entrance to its own workstation, which went up as it came in, and works there', () => {
  const stage = newStage();
  const a = agent('w1', 'write');
  stage.sync([a], NOW);
  const actor = stage.actors()[0];
  const door = slot(stage, 'entrance');
  assert.equal(actor.state, 'enter');
  assert.ok(Math.hypot(actor.x - door.spot.x, actor.y - door.spot.y) < 1e-9, 'spawns at the entrance');
  const [ws] = stage.workstations();
  assert.equal(ws?.owner, 'w1', 'no workstation went up');
  run(stage, [a], 12);
  assert.equal(actor.state, 'work');
  assert.equal(actor.station, ws.desk);
  assert.ok(Math.hypot(actor.x - ws.desk.spot.x, actor.y - ws.desk.spot.y) < 1e-6);
});

test('every kind of work is done at its own workstation: a new activity changes its screen, not its place', () => {
  const stage = newStage();
  let now = run(stage, [agent('r', 'read')], 12);
  const actor = stage.actors()[0];
  const desk = actor.station;
  assert.equal(desk?.kind, 'desk');
  for (const act of ['write', 'search', 'run', 'web', 'think', 'delegate', 'talk'] as Activity[]) {
    now = run(stage, [agent('r', act, { since: now })], 6, now);
    assert.equal(actor.station, desk, act);
    assert.equal(actor.state, 'work', act);
    assert.equal(stage.frame(now)!.desks![0].screen, screenFor(act), act);
  }
});
```

In `test/stage.test.ts`, replace:

```ts
test('agents sharing a prop stand apart', () => {
  const stage = newStage();
  run(stage, [agent('a', 'write'), agent('b', 'write'), agent('c', 'write')], 14);
  const xs = stage.actors().map((a) => [a.x, a.y]);
```

with:

```ts
test('three writers work at three workstations, apart', () => {
  const stage = newStage();
  run(stage, [agent('a', 'write'), agent('b', 'write'), agent('c', 'write')], 14);
  assert.equal(new Set(stage.actors().map((a) => a.station)).size, 3);
  const xs = stage.actors().map((a) => [a.x, a.y]);
```

In `test/stage.test.ts`, replace:

```ts
test('a crowd at a prop lines up a figure apart on screen, close by and turned to it', () => {
  for (const kind of ['write', 'read', 'think', 'run'] as const) {
    const stage = newStage(WIDE);
    const crew = ['a', 'b', 'c'].map((id) => agent(`${kind}-${id}`, kind));
    run(stage, crew, 20);
    const st = slot(stage, kind);
    const f = footprintOf(st);
    const crowd = stage.actors();
    let working = 0;
    for (const a of crowd) {
      const tag = `${kind}: ${a.info.id} at ${a.x.toFixed(0)},${a.y.toFixed(0)}`;
      assert.equal(a.station, st, tag);
      assert.equal(a.state, 'work', tag);
      // Never more than 2.5 lane steps from the prop's own spot.
      assert.ok(Math.hypot(a.x - st.spot.x, a.y - st.spot.y) <= 2.5 * LANE * Math.SQRT2, `${tag}: far from its prop`);
      // At work (not mid-gesture), backs to us and turned the prop's way.
      const look = stage.lookOf(a);
      if (look.pose !== kind) continue;
      working++;
      assert.ok(look.facing.back, `${tag}: facing us`);
      assert.equal(look.facing.flip, (f.x0 + f.x1 - f.y0 - f.y1) / 2 < a.x - a.y, `${tag}: turned away from the prop`);
    }
    assert.ok(working >= 2, `${kind}: ${working} at work`);
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) {
        const d = onScreen(crowd[i], crowd[j]);
        assert.ok(d >= LANE - 1e-9, `${kind}: ${crowd[i].info.id} and ${crowd[j].info.id} ${d.toFixed(1)} units apart on screen`);
      }
    }
  }
});

test('a crowd too big for its lanes never doubles up on one spot', () => {
  // Small rooms clamp lanes to the floor; seven or nine at one prop.
  for (const [r, n] of [[{ x: 0, y: 1, w: 80, h: 21 }, 7], [WIDE, 9]] as const) {
    const stage = newStage(r);
    const crew = Array.from({ length: n }, (_, i) => agent(`d${i}`, i % 2 ? 'write' : 'read'));
    run(stage, crew, 25);
    for (const kind of ['write', 'read']) {
      const there = stage.actors().filter((a) => a.station?.kind === kind);
      assert.ok(there.every((a) => a.state === 'work'), `${r.w}x${r.h} ${kind}: still walking`);
      for (let i = 0; i < there.length; i++) {
        for (let j = i + 1; j < there.length; j++) {
          const d = onScreen(there[i], there[j]);
          assert.ok(d >= LANE / 2, `${r.w}x${r.h} ${kind}: ${there[i].info.id} and ${there[j].info.id} only ${d.toFixed(1)} units apart`);
        }
      }
    }
  }
});


```

with:

```ts
test('past every place, a newcomer shares a teammate\'s workstation, standing at its side apart from everyone, turned to it', () => {
  // A small room: a lead and more subagents than there are places.
  const stage = newStage({ x: 0, y: 1, w: 80, h: 21 });
  const places = stage.room()!.desks.length;
  const crew = [agent('L', 'write', { role: 'lead' }), ...Array.from({ length: places + 3 }, (_, i) => agent(`s${i}`, 'write', { parentId: 'L' }))];
  run(stage, crew, 20);
  const up = stage.workstations();
  const all = stage.actors();
  const sharers = all.filter((a) => !up.some((w) => w.owner === a.info.id));
  assert.equal(sharers.length, 4);
  let turned = 0;
  for (const a of sharers) {
    const at = up.find((w) => w.desk === a.station);
    const tag = `${a.info.id} at ${a.x.toFixed(0)},${a.y.toFixed(0)}`;
    assert.ok(at?.owner, `${tag}: at no workstation`);
    assert.equal(a.state, 'work', tag);
    assert.ok(a.lane > 0, tag);
    assert.ok(Math.hypot(a.x - at.desk.spot.x, a.y - at.desk.spot.y) <= 12.5, `${tag}: far from the one it shares`);
    const look = stage.lookOf(a);
    if (look.pose !== 'write') continue;
    turned++;
    const f = footprint(at.desk);
    assert.ok(look.facing.back, `${tag}: facing us`);
    assert.equal(look.facing.flip, (f.x0 + f.x1 - f.y0 - f.y1) / 2 < a.x - a.y, `${tag}: turned away from it`);
  }
  assert.ok(turned >= 2, `${turned} sharers at work`);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= WORK_APART, `${all[i].info.id} and ${all[j].info.id} on top of each other`);
  }
});

test('those asleep at the idle prop, more than its lanes, never double up on one spot', () => {
  // Small rooms clamp lanes to the floor; seven or nine asleep at one prop.
  for (const [r, n] of [[{ x: 0, y: 1, w: 80, h: 21 }, 7], [WIDE, 9]] as const) {
    const stage = newStage(r);
    const crew = Array.from({ length: n }, (_, i) => agent(`z${i}`, 'idle', { since: NOW - 3_600_000 }));
    run(stage, crew, 25);
    const there = stage.actors().filter((a) => a.station?.kind === 'idle');
    assert.equal(there.length, n, `${r.w}x${r.h}: not all at the idle prop`);
    assert.ok(there.every((a) => a.state === 'work'), `${r.w}x${r.h}: still walking`);
    for (let i = 0; i < there.length; i++) {
      for (let j = i + 1; j < there.length; j++) {
        const d = onScreen(there[i], there[j]);
        assert.ok(d >= LANE / 2, `${r.w}x${r.h}: ${there[i].info.id} and ${there[j].info.id} only ${d.toFixed(1)} units apart`);
      }
    }
  }
});


```

In `test/stage.test.ts`, replace:

```ts
test('activity change shows a bubble and retargets', () => {
  const stage = newStage();
  let now = run(stage, [agent('a', 'write')], 10);
  const actor = stage.actors()[0];
  stage.sync([agent('a', 'run', { detail: '$ npm test' })], now + 50);
  assert.ok(actor.bubbleUntil > now + 50);
  now = run(stage, [agent('a', 'run', { detail: '$ npm test' })], 12, now + 50);
  assert.equal(actor.station?.kind, 'run');
  assert.equal(actor.state, 'work');
});
```

with:

```ts
test('activity change shows a bubble; its agent stays at its workstation', () => {
  const stage = newStage();
  let now = run(stage, [agent('a', 'write')], 10);
  const actor = stage.actors()[0];
  const desk = actor.station;
  stage.sync([agent('a', 'run', { detail: '$ npm test' })], now + 50);
  assert.ok(actor.bubbleUntil > now + 50);
  now = run(stage, [agent('a', 'run', { detail: '$ npm test' })], 12, now + 50);
  assert.equal(actor.station, desk);
  assert.equal(actor.state, 'work');
});
```

In `test/stage.test.ts`, replace:

```ts
test('props at work are marked active in the frame, the entrance while someone comes through', () => {
  const stage = newStage();
  stage.sync([agent('s', 'search')], NOW);
  const door = stage.room()!.props.findIndex((p) => p.slot?.kind === 'entrance');
  stage.update(0.05, NOW + 50);
  assert.equal(stage.frame(NOW + 50)!.active[door], true, 'the entrance is not busy');
  const now = run(stage, [agent('s', 'search'), agent('r', 'run')], 20);
  const f = stage.frame(now)!;
  f.room.props.forEach((p, i) => assert.equal(f.active[i], p.slot?.kind === 'search' || p.slot?.kind === 'run', p.slot?.kind ?? 'decor'));
});
```

with:

```ts
test('the entrance is marked active while someone comes through; with everyone at a workstation the room\'s stations stand idle', () => {
  const stage = newStage();
  stage.sync([agent('s', 'search')], NOW);
  const door = stage.room()!.props.findIndex((p) => p.slot?.kind === 'entrance');
  stage.update(0.05, NOW + 50);
  assert.equal(stage.frame(NOW + 50)!.active[door], true, 'the entrance is not busy');
  const now = run(stage, [agent('s', 'search'), agent('r', 'run')], 20);
  const f = stage.frame(now)!;
  f.room.props.forEach((p, i) => assert.equal(f.active[i], false, p.slot?.kind ?? 'decor'));
  assert.deepEqual(f.desks!.map((d) => d.screen).sort(), ['run', 'search']);
});
```

In `test/stage.test.ts`, replace:

```ts
test('a close-up frames its agent from its feet to the top of its hat', () => {
  const stage = newStage(WIDE, THEMES.find((t) => t.id === 'club')!);
  const now = run(stage, hatted(), 15);
  for (const id of ['bo', 'cy']) {
    let f: SceneFrame | null = null;
    for (let i = 0; i < 80; i++) f = stage.frame(now, id);
    const g = f!.figures.find((x) => x.id === id)!;
    const [, feet] = project(f!.camera, g.x, g.y, 0);
    const [, top] = project(f!.camera, g.x, g.y, figureTop(g));
    assert.ok(Math.abs((feet + top) / 2 - f!.camera.h / 2) < f!.camera.s, `${id}: its middle at ${((feet + top) / 2).toFixed(0)}, the view's at ${f!.camera.h / 2}`);
  }
});
```

with:

```ts
test('a close-up frames its agent from its feet to the top of its hat', () => {
  const stage = newStage(WIDE, THEMES.find((t) => t.id === 'club')!);
  const now = run(stage, hatted(), 15);
  let centred = 0;
  for (const id of ['ada', 'bo', 'cy', 'di']) {
    let f: SceneFrame | null = null;
    for (let i = 0; i < 80; i++) f = stage.frame(now, id);
    const cam = f!.camera;
    const L = f!.room.L;
    const g = f!.figures.find((x) => x.id === id)!;
    const [, feet] = project(cam, g.x, g.y, 0);
    const [, top] = project(cam, g.x, g.y, figureTop(g));
    // (A workstation by the front of the room: the view stops at the
    // room's edge, a margin of 4 units past it, rather than show what is
    // past it.)
    const edge = Math.abs(project(cam, L.W, L.D, 0)[1] + 4 * cam.s - cam.h) < 1 || Math.abs(project(cam, 0, 0, L.H)[1] - 4 * cam.s) < 1;
    if (edge) continue;
    centred++;
    assert.ok(Math.abs((feet + top) / 2 - cam.h / 2) < cam.s, `${id}: its middle at ${((feet + top) / 2).toFixed(0)}, the view's at ${cam.h / 2}`);
  }
  assert.ok(centred >= 2, `${centred} close-ups away from the room's edges`);
});
```

In `test/stage.test.ts`, replace:

```ts
  run(a, crew(6, 'error', now), 1.5, now);
  now = run(b, crew(4, 'error', now), 1.5, now);
```

with:

```ts
  // (just after the bang: its sparks are out)
  run(a, crew(6, 'error', now), 0.3, now);
  now = run(b, crew(4, 'error', now), 0.3, now);
```

Office life's (a working agent's place is its own workstation; the
lead's "desk" is its workstation):

In `test/office-life.test.ts`, replace:

```ts
// Each fires when its trigger happens and not otherwise, ends within its
// time, never takes a working agent from its station, and lets go of an
// agent the moment it is given work; the demo crew shows all four.
```

with:

```ts
// Each fires when its trigger happens and not otherwise, ends within its
// time, never takes a working agent from its workstation, and lets go of
// an agent the moment it is given work; the demo crew shows all four.
```

In `test/office-life.test.ts`, replace:

```ts
const kindOf = (a: Actor | undefined): Errand['kind'] | undefined => a?.mind.errand?.kind;
```

with:

```ts
const kindOf = (a: Actor | undefined): Errand['kind'] | undefined => a?.mind.errand?.kind;
// An agent's own workstation's desk (none: undefined).
const own = (stage: Stage, id: string) => stage.workstations().find((w) => w.owner === id)?.desk;
```

In `test/office-life.test.ts`, replace:

```ts
test('subagents a lead starts within a few seconds gather round it, nodding along under its speech mark, then each goes to its station', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const desk = byId(stage, 'L').station;
  assert.equal(desk?.kind, 'write');
```

with:

```ts
test('subagents a lead starts within a few seconds gather round it, nodding along under its speech mark, then each goes to its workstation', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const desk = byId(stage, 'L').station;
  assert.ok(desk && desk === own(stage, 'L'), 'the lead is not at its workstation');
```

In `test/office-life.test.ts`, replace:

```ts
  // Off to work: each at its station.
  run(stage, crew, 6, now);
  for (const id of ['s1', 's2']) assert.equal(byId(stage, id).station?.kind, 'think', `${id} is not at its station`);
```

with:

```ts
  // Off to work: each at its own workstation.
  run(stage, crew, 6, now);
  for (const id of ['s1', 's2']) assert.ok(own(stage, id) && byId(stage, id).station === own(stage, id), `${id} is not at its workstation`);
```

In `test/office-life.test.ts`, replace:

```ts
test('a newcomer given its first task mid-huddle leaves for its station at once', () => {
```

with:

```ts
test('a newcomer given its first task mid-huddle leaves for its workstation at once', () => {
```

In `test/office-life.test.ts`, replace:

```ts
      assert.equal(a!.station?.kind, 'read', 'not on its way to its station');
```

with:

```ts
      assert.ok(own(stage, 's1') && a!.station === own(stage, 's1'), 'not on its way to its workstation');
```

In `test/office-life.test.ts`, replace:

```ts
      if (id === work && a.state === 'work' && a.station?.kind === 'write') {
```

with:

```ts
      if (id === work && a.state === 'work' && a.station && a.station === own(stage, id)) {
```

In `test/office-life.test.ts`, replace:

```ts
test('an agent given work on a coffee run goes straight to its station', () => {
```

with:

```ts
test('an agent given work on a coffee run goes straight to its workstation', () => {
```

In `test/office-life.test.ts`, replace:

```ts
        assert.equal(a.station?.kind, 'write', `${id} is not on its way to its station`);
```

with:

```ts
        assert.ok(own(stage, id) && a.station === own(stage, id), `${id} is not on its way to its workstation`);
```

In `test/office-life.test.ts`, replace:

```ts
  const desk = byId(stage, 'L').station;
  assert.equal(byId(stage, 's').station?.kind, 'read');
```

with:

```ts
  const desk = byId(stage, 'L').station;
  assert.ok(own(stage, 's') && byId(stage, 's').station === own(stage, 's'), 'the subagent is not at its workstation');
```

In `test/office-life.test.ts`, replace:

```ts
// These desks, in an 80 x 24 terminal, leave no room the usual 7 units
// either side of whoever works there. A subagent coming from the writing
// desk was sent to a spot up or down the screen from its lead instead,
// never counted as beside it, and walked on that spot until it gave up,
// the finale held all the while.
test('a lead whose desk leaves no room right beside it still gets its high-five, from a step nearer, further, higher or lower', () => {
  for (const [id, desk] of [['station', 'think'], ['snowy', 'web'], ['shelter', 'web']] as const) {
    const stage = newStage(WORLDS.find((w) => w.id === id)!);
    const lead = agent('L', desk, { role: 'lead' });
    let done = 0;
    const crew = () => [lead, agent('s', done ? 'done' : 'write', { parentId: 'L', since: done || NOW })];
    let now = run(stage, crew, 10);
    const L = byId(stage, 'L');
    assert.equal(L.station?.kind, desk);
    // (BESIDE in life.ts)
    const standable = standableIn(stage);
    for (const [sx, sy] of [[7, 0], [-7, 0], [7, 1.5], [-7, 1.5], [7, -1.5], [-7, -1.5]]) assert.ok(!standable(onScreen(L, sx, sy)), `${id}: room beside the ${desk} desk now: find another for this test`);
```

with:

```ts
// A lead with no room the usual 7 units either side of it (as at a
// station by the wall of a small room, or a workstation between two
// others): a subagent coming from its own was sent to a spot up or down
// the screen from its lead instead, never counted as beside it, and walked
// on that spot until it gave up, the finale held all the while.
test('a lead with no room right beside it still gets its high-five, from a step nearer, further, higher or lower', () => {
  for (const id of ['station', 'snowy', 'shelter']) {
    const stage = newStage(WORLDS.find((w) => w.id === id)!);
    const lead = agent('L', 'write', { role: 'lead' });
    let done = 0;
    const crew = () => [lead, agent('s', done ? 'done' : 'write', { parentId: 'L', since: done || NOW })];
    let now = run(stage, crew, 10);
    const L = byId(stage, 'L');
    assert.ok(L.station && L.station === own(stage, 'L'), `${id}: the lead is not at its workstation`);
    // No room at the six spots right beside it (BESIDE in life.ts).
    const beside = [[7, 0], [-7, 0], [7, 1.5], [-7, 1.5], [7, -1.5], [-7, -1.5]].map(([sx, sy]) => onScreen(L, sx, sy));
    const priv = stage as unknown as { standable(s: Spot): boolean };
    const free = standableIn(stage);
    priv.standable = (p) => free(p) && beside.every((q) => gap(p, q) > 0.75);
    const standable = standableIn(stage);
    for (const p of beside) assert.ok(!standable(p), `${id}: room beside the lead`);
```

In `test/office-life.test.ts`, replace:

```ts
      assert.equal(a.station?.kind, 'write', `${talker} is not on its way to work`);
```

with:

```ts
      assert.ok(own(stage, talker) && a.station === own(stage, talker), `${talker} is not on its way to work`);
```

The chat's label:

In `test/world.test.ts`, replace:

```ts
test('the chat stands in for the selected agent\'s label, as the card does', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('i')); // the card off: its label is back
  const s = new Screen(120, 36);
  w.draw(s, now);
  const all = w.scene()!.labels.length;
  w.handleKey(key('\r'));
  w.draw(s, now);
  assert.ok(w.scene()!.labels.length < all);
});
```

with:

```ts
test('the chat stands in for the selected agent\'s label, as the card does', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('i')); // the card off: its label is back
  const s = new Screen(120, 36);
  // (Its label, not the count of them: the room the chat frees may show a
  // neighbour's.)
  const name = (w as unknown as { stage: Stage }).stage.actors().find((a) => a.info.id === w.selectedId)!.info.name;
  const labelled = () => w.scene()!.labels.some((l) => l.text.includes(` ${name}`));
  w.draw(s, now);
  assert.ok(labelled(), 'no label before the chat');
  w.handleKey(key('\r'));
  w.draw(s, now);
  assert.ok(!labelled(), 'its label shows with the chat open');
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --test test/workstations.test.ts test/stage.test.ts test/office-life.test.ts test/world.test.ts`
Expected: FAIL: `test/stage.test.ts` does not load (`does not provide an
export named 'WORK_APART'`); the three stress tests and the sharer test;
the seven office-life tests that look for a working agent at its own
workstation (it is at a station).

- [ ] **Step 3: To the workstation**

In `src/world/stage.ts`, replace:

```ts
// A new activity sends its agent to another prop only once it has lasted
// this long, and never before the agent has worked at its prop a while; in
// between the pose changes in place.
const SETTLE_MS = 3000;
const DWELL_MS = 9000;
// A workstation grows out of the floor, or shrinks back into it, this long
// (seconds); one left empty stands this long before it goes.
export const POP_S = 0.5;
export const EMPTY_S = 4;
// Where a crowd at one prop stands: (along the wall, further out), in lane
// steps. A line along the wall (across the screen in front of a prop out
// on the floor), the middle and then out to either side; then a row a step
// further out, in the gaps of the first; then a third. All within 2.5
// steps of the prop's spot, so everyone still reads as working there: past
// these, a crowd overlaps a little.
```

with:

```ts
// A working activity sends a roaming agent to its workstation only once it
// has lasted this long; in between the pose changes in place.
const SETTLE_MS = 3000;
// A workstation grows out of the floor, or shrinks back into it, this long
// (seconds); one left empty stands this long before it goes.
export const POP_S = 0.5;
export const EMPTY_S = 4;
// Where one sharing a workstation stands (every place taken): (along it,
// out from it) off its owner's spot, in units, the first free one; a step
// past either end (halfway to the next desk of a row), then half a step
// further out, in front of the gaps, then further out again; all those
// taken, on rings round it further out, the front half first. Free: on
// the floor, in view and WORK_APART from where anyone else stands or is
// going (see share).
const RING = (r: number, from: number, to: number) =>
  Array.from({ length: 9 }, (_, i) => {
    const a = from + ((to - from) * i) / 8;
    return [Math.round(r * Math.cos(a) * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10] as const;
  });
const SIDES: ReadonlyArray<readonly [number, number]> = [
  [5, 0], [-5, 0], [2.5, 4], [-2.5, 4], [7.5, 4], [-7.5, 4], [0, 8], [5, 8], [-5, 8],
  ...[6, 8, 10, 12].flatMap((r) => RING(r, 0, Math.PI)),
  ...[8, 10, 12].flatMap((r) => RING(r, Math.PI, 2 * Math.PI).slice(1, -1)),
];
export const WORK_APART = 4;
// Where a crowd at one prop stands (those asleep at the idle prop): (along
// the wall, further out), in lane steps. A line along the wall (across the
// screen in front of a prop out on the floor), the middle and then out to
// either side; then a row a step further out, in the gaps of the first;
// then a third. All within 2.5 steps of the prop's spot, so everyone still
// reads as there: past these, a crowd overlaps a little.
```

In `src/world/stage.ts`, replace:

```ts
  station: Slot | null;
  lane: number;
```

with:

```ts
  station: Slot | Desk | null; // where it works: a station of the room's (asleep at the idle prop), or a workstation
  lane: number; // which spot there (see LANES; at a workstation, 0 its own, k the k-th of SIDES)
```

In `src/world/stage.ts`, replace:

```ts
  settledAt: number; // when it last arrived at its prop

```

with:

```ts

```

In `src/world/stage.ts`, replace:

```ts
// The scene's model: an illustrated room with agents as characters walking
// to the prop for their current activity and living a little in between
// (see life.ts): wandering, chatting, building. Nothing is drawn here but
// the labels (terminal text); `frame` hands a renderer everything else.
```

with:

```ts
// The scene's model: an illustrated room with agents as characters, each
// with a workstation of its own that pops up when it walks in (on a place
// the room planned, see desks.ts; at a teammate's side when every place is
// taken), where it does all its work, living a little in between (see
// life.ts): wandering, chatting, building, napping at the idle prop.
// Nothing is drawn here but the labels (terminal text); `frame` hands a
// renderer everything else.
```

In `src/world/stage.ts`, replace:

```ts
  // Due at another prop: the activity wants a different one, has lasted a
  // moment, and the agent has worked at its current one a while.
  private moving(a: Actor, now: number): boolean {
    if (a.state === 'leave' || !this.L || this.life.huddled(a)) return false;
    const kind = stationKindFor(a.info.activity);
    if (!kind || kind === 'idle' || a.station?.kind === kind) return false;
    if (now - a.info.since < SETTLE_MS) return false;
    return !a.station || a.state !== 'work' || now - a.settledAt >= DWELL_MS;
  }

  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind || !this.L) return;
    if (kind === 'idle' && this.idleFor(a) < SLEEP_AFTER) {
```

with:

```ts
  // Due at its workstation: at work a moment (the activity has lasted),
  // and not at a workstation (its own, or a teammate's) nor on its way.
  private moving(a: Actor, now: number): boolean {
    if (a.state === 'leave' || !this.L || this.life.huddled(a)) return false;
    const kind = stationKindFor(a.info.activity);
    if (!kind || kind === 'idle' || a.station?.kind === 'desk') return false;
    return now - a.info.since >= SETTLE_MS;
  }

  // Where the activity takes it: at work, to its workstation; waiting,
  // free to roam, or once asleep to the idle prop.
  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind || !this.L) return;
    if (kind !== 'idle') {
      this.toDesk(a);
      return;
    }
    if (this.idleFor(a) < SLEEP_AFTER) {
```

In `src/world/stage.ts`, replace:

```ts
  // Workstations follow their agents: one whose agent is leaving or gone
  // is left empty; one left empty for EMPTY_S shrinks away with a puff and
  // is gone POP_S later. Those without one of their own then take a place
  // come free.
  private upkeep(dt: number): void {
    let freed = false;
    for (const [i, w] of this.desks) {
      if (w.owner) {
        const o = this.cast.get(w.owner);
        if (o && o.state !== 'leave' && !o.gone) continue;
        w.was = w.owner;
        w.owner = null;
        w.left = this.clock;
        this.trinketsDue = true;
        freed = true;
        continue;
      }
      const t = this.clock - w.left;
      if (t >= EMPTY_S && t - dt < EMPTY_S) this.poof(w.desk);
      if (t >= EMPTY_S + POP_S) {
        this.desks.delete(i);
        this.deskMoved(w.desk);
        freed = true;
      }
    }
    if (!freed) return;
    for (const a of [...this.cast.values()].sort((p, q) => p.order - q.order)) if (a.state !== 'leave' && !a.gone) this.claim(a);
  }


```

with:

```ts
  // Workstations follow their agents: one whose agent is leaving or gone
  // is left empty; one left empty for EMPTY_S shrinks away with a puff and
  // is gone POP_S later. Those without one of their own then take a place
  // come free (a sharer walks over to its own); those sharing one whose
  // agent left find another.
  private upkeep(dt: number): void {
    let freed = false;
    for (const [i, w] of this.desks) {
      if (w.owner) {
        const o = this.cast.get(w.owner);
        if (o && o.state !== 'leave' && !o.gone) continue;
        w.was = w.owner;
        w.owner = null;
        w.left = this.clock;
        this.trinketsDue = true;
        freed = true;
        continue;
      }
      const t = this.clock - w.left;
      if (t >= EMPTY_S && t - dt < EMPTY_S) this.poof(w.desk);
      if (t >= EMPTY_S + POP_S) {
        this.desks.delete(i);
        this.deskMoved(w.desk);
        freed = true;
      }
    }
    if (!freed) return;
    for (const a of [...this.cast.values()].sort((p, q) => p.order - q.order)) {
      if (a.state === 'leave' || a.gone) continue;
      const own = this.ownDesk(a) ?? this.claim(a);
      const at = a.station?.kind === 'desk' ? this.desks.get(a.station.index) : undefined;
      // working elsewhere than its own, or at one nobody has now
      if (a.station?.kind === 'desk' && (own ? a.station !== own.desk : !at?.owner)) this.retarget(a);
    }
  }

  // To its workstation: its own (put up now if a place is free), else at a
  // teammate's side (see share).
  private toDesk(a: Actor): void {
    const own = this.ownDesk(a) ?? this.claim(a);
    const to = own ? { desk: own.desk, spot: own.desk.spot, lane: 0 } : this.share(a);
    if (!to) return;
    if (a.station === to.desk && a.lane === to.lane && (a.path.length || a.state === 'work')) return;
    a.station = to.desk;
    a.lane = to.lane;
    this.walkTo(a, to.spot);
    if (a.state === 'work') a.state = 'walk';
  }

  // Where `a` stands sharing a workstation: beside a teammate's (the one
  // with the fewest at its side, nearest its lead) on the first of SIDES
  // free there in view, else out of view (see beside); else the same by
  // anyone's; where it shares already, while that still holds; with none
  // free at all, the first spot by the first. Null when no workstation is
  // up.
  private share(a: Actor): { desk: Desk; spot: Spot; lane: number } | null {
    const team = teamOf(a.info);
    const up = [...this.desks.values()].filter((w) => w.owner && w.owner !== a.info.id);
    if (!up.length) return null;
    const teamAt = (w: Workstation) => {
      const o = this.cast.get(w.owner!);
      return o ? teamOf(o.info) : w.owner;
    };
    const sharers = (w: Workstation) => [...this.cast.values()].filter((o) => o !== a && o.station === w.desk && o.lane > 0).length;
    const lead = this.cast.get(team) ?? a;
    const far = (w: Workstation) => Math.hypot(w.desk.spot.x - lead.x, w.desk.spot.y - lead.y);
    const by = (p: Workstation, q: Workstation) => sharers(p) - sharers(q) || far(p) - far(q);
    const mates = up.filter((w) => teamAt(w) === team).sort(by);
    const others = up.filter((w) => teamAt(w) !== team).sort(by);
    const now = a.station?.kind === 'desk' ? up.find((w) => w.desk === a.station) : undefined;
    if (now && a.lane > 0 && this.beside(now.desk, a, a.lane, true)) return { desk: now.desk, spot: this.sideSpot(now.desk, a.lane), lane: a.lane };
    for (const pool of [mates, others]) {
      for (const seen of [true, false]) {
        for (const w of pool) {
          for (let k = 1; k <= SIDES.length; k++) if (this.beside(w.desk, a, k, seen)) return { desk: w.desk, spot: this.sideSpot(w.desk, k), lane: k };
        }
      }
    }
    const first = mates[0] ?? others[0];
    return { desk: first.desk, spot: this.sideSpot(first.desk, 1), lane: 1 };
  }

  // The k-th spot beside workstation d (see SIDES), on the floor.
  private sideSpot(d: Desk, k: number): Spot {
    const [du, dv] = SIDES[k - 1];
    return this.clampToFloor(d.wall === 'right' ? { x: d.spot.x + du, y: d.spot.y + dv } : { x: d.spot.x + dv, y: d.spot.y + du });
  }

  // Whether `a` may stand at the k-th spot beside d: clear of everything,
  // in view (if `seen`), and WORK_APART from where anyone else stands or
  // is going.
  private beside(d: Desk, a: Actor, k: number, seen: boolean): boolean {
    const p = this.sideSpot(d, k);
    if (!this.standable(p) || (seen && !this.level(p))) return false;
    for (const o of this.cast.values()) {
      if (o === a || o.state === 'leave' || o.gone) continue;
      const at = o.path[o.path.length - 1] ?? o;
      if (Math.hypot(at.x - p.x, at.y - p.y) < WORK_APART) return false;
    }
    return true;
  }


```

In `src/world/stage.ts`, replace:

```ts
      settledAt: now,

```

with:

```ts

```

In `src/world/stage.ts`, replace:

```ts
        } else if (a.state === 'walk') {
          a.state = 'work';
          a.settledAt = now;
        }
```

with:

```ts
        } else if (a.state === 'walk') {
          a.state = 'work';
        }
```

- [ ] **Step 4: A huddle waits for its join window**

A lead's workstation may stand near the way in: its first newcomer can be
there before the next has come through the door, and the huddle began
without it. It now starts once all are there and no more can join.

In `src/world/life.ts`, replace:

```ts
// Office life. A huddle: subagents a lead starts within HUDDLE_JOIN seconds
// of the first gather round it (at most one a lead every HUDDLE_EVERY),
// HUDDLE_R units out; it starts once they are all there (or HUDDLE_WAIT
// after the first got there, HUDDLE_GATHER at most after one there set
// out) and lasts HUDDLE_S; anyone not there within HUDDLE_GATHER gives up.
// So none is in one longer than HUDDLE_GATHER + HUDDLE_S.
```

with:

```ts
// Office life. A huddle: subagents a lead starts within HUDDLE_JOIN seconds
// of the first gather round it (at most one a lead every HUDDLE_EVERY),
// HUDDLE_R units out; it starts once they are all there and no more can
// join (or HUDDLE_WAIT after the first got there, HUDDLE_GATHER at most
// after one there set out) and lasts HUDDLE_S; anyone not there within
// HUDDLE_GATHER gives up. So none is in one longer than HUDDLE_GATHER +
// HUDDLE_S.
```

In `src/world/life.ts`, replace:

```ts
  // Each huddle starts once its members are all there (or HUDDLE_WAIT after
  // the first got there, HUDDLE_GATHER at most after one there set out):
```

with:

```ts
  // Each huddle starts once its members are all there and no more can join
  // (or HUDDLE_WAIT after the first got there, HUDDLE_GATHER at most after
  // one there set out):
```

In `src/world/life.ts`, replace:

```ts
      if (!errands.every((e) => e.arrived) && !due && c - h.firstHere < HUDDLE_WAIT) continue;
```

with:

```ts
      if ((!errands.every((e) => e.arrived) || c - h.opened <= HUDDLE_JOIN) && !due && c - h.firstHere < HUDDLE_WAIT) continue;
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/workstations.test.ts test/stage.test.ts test/office-life.test.ts test/world.test.ts test/life.test.ts`
Expected: PASS: every test, the stress tests too (`ℹ fail 0`).

- [ ] **Step 6: Look at it**

Run (the "after" pictures; the fallback workstation in every world):

```bash
node scripts/scene-shot.ts cafe "$SCRATCH/renders/after-cafe-20.png" --crew 4x4 --at 40 --cell 19x42
node scripts/scene-shot.ts starfall "$SCRATCH/renders/after-starfall-20.png" --crew 4x4 --at 40 --cell 19x42
node scripts/scene-shot.ts shelter "$SCRATCH/renders/after-shelter-20-80x24.png" --crew 4x4 --at 40 --size 80x24 --cell 19x42
node scripts/scene-shot.ts office "$SCRATCH/renders/after-office-close.png" --crew 4x4 --at 40 --cell 19x42 --zoom 2 --select 0
```

Expected: four paths. Open each with the Read tool: at 150 x 46 four team
pods (a front row of three and two behind, or a row) spread over the
middle and front of the floor, every agent at its own workstation, its
screen showing what it does; nothing in the walkways, the way in, the
plazas or the yard; no clumps. At 80 x 24 a few pods, the rest of the
crew at its teammates' sides, apart. Close up, the activity layer reads:
code lines, a page, a magnifier over a list, a terminal, a globe, a
lightbulb, speech balloons.

- [ ] **Step 7: Typecheck and the full suite**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1411`, `ℹ pass 1411`, `ℹ fail 0`.

- [ ] **Step 8: Commit**

```bash
git add src/world/stage.ts src/world/life.ts test/workstations.test.ts test/stage.test.ts test/office-life.test.ts test/world.test.ts
git commit -F - <<'EOF'
feat(stations): every agent works at its own workstation

Every kind of work is done at the agent's own workstation: a new
activity changes its screen and pose, not its place; waiting, it roams,
and asleep it naps at the idle prop. Past the room's places a newcomer
shares a teammate's workstation, standing at its side apart from
everyone, and moves to its own when a place comes free. A huddle now
waits for its join window, as a lead's workstation may stand by the
way in. The tests that encoded a crowd sharing a station now hold
agents to their workstations; the stress test passes.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

## Part B: each world's own workstation (art from a brief, contract from the tests)

Tasks 8–13 need Task 7 committed. They run in parallel, each done by one
agent that:

- owns only its worlds' `src/worlds/<id>/workstation.ts` (new),
  `src/worlds/<id>.ts` (two lines: the import and `workstation:`) and
  `test/<id>.test.ts` (one test at the end);
- runs no git and touches no other file (not shared code, not another
  world, not the registry);
- hands back its file list, its test output and its render paths. The
  coordinator reviews and commits each world (Task 14).

### Conventions for every workstation

**The contract** (`test/themes.test.ts` checks it for every world, with its
own workstation once registered):

- `len` x `dep` is `DESK.len` x `DESK.dep` (7 x 3 units); `height` at most
  `DESK.height` (10). Everything it paints at alpha 16/255 or more lies
  inside its footprint raised to its height (half a unit of ink allowed),
  in both frames, at s = 4 and 16, its screen on and off, in each look.
- Not `animated` and no `emit`: it is drawn once a scale, frame, look and
  screen and kept. Its `draw` never looks at `v.t` (the world's test checks
  it); it may look at `v.active` (its screen on: light a lamp) and
  `v.seed` (0, 1 or 2: three small variations, `v.seed % 3` to be safe).
- `screen`: four corners in its frame, the first at its bottom left as the
  viewer sees it, going round: a parallelogram with its bottom edge level,
  at least 1.5 units wide (along u) and 1.5 tall, its left edge at u 2.5
  or more (right of where the agent stands, `DESK_SPOT`: u 2, v 5), on
  its body, facing the agent (toward +v). Upright, or leaning back like a
  laptop's lid. About 3 wide and 2.8 tall reads best; the frame's
  numbers are a good start. The shared activity layer paints over the
  quad after the art: draw nothing of the workstation in front of it, and
  give the screen a bezel or frame round it in the world's style.
- `top`: where a desk upgrade (★5: a plant, a mug or a trophy, about 3
  units across and 5 tall) stands: on its top surface, at least half a
  unit in from its edges, 2 to 10 up. The left end of the top, behind the
  keyboard, is best (u about 1.1, v about 0.9): the agent's figure stands
  in front of it, the upgrade shows over its shoulder. Keep the world's
  own things off that spot.

**The art** (`docs/superpowers/specs/2026-10-24-illustrated-design.md`, and
the world's kit): one ink (the kit's `INK`, `k.lw` outlines, `k.thin`
inner lines), light from the upper left (`k.box` and `k.cyl` shade the
faces in either frame), a soft contact shadow (`k.shadow`, given), small
detail only when `k.fine`, no text, letters, digits, logos or emblems. It
must read as the world's at a glance next to its stations, at the size of
a figure (about 14 units tall): chunky shapes, two or three colours of
the world's `C`, the screen's frame the clearest thing on it. It stands
in a pod with four others: keep its ends plain, so a row of them reads as
a row. The kit is `src/worlds/<id>/kit.ts` (`kitOf(v)` gives a `Kit` in
the workstation's frame: `box`, `cyl`, `poly`, `rod`, `line`, `disc`,
`halo`, `shadow` and the rest); the world's `bits.ts` may help; never
import another world's files.

**How to check a world** (each task's steps give the commands):

1. `node --test test/<id>.test.ts`: its own test, the new one with it.
2. `node --test test/themes.test.ts`: the contract, every world.
3. `node node_modules/typescript/bin/tsc --noEmit -p .`
4. Its contact sheet: `node "$SCRATCH/tools/desk-sheet.ts" "$PWD/src" <id> "$SCRATCH/ws/<id>-sheet.png" 10`,
   opened with the Read tool: every screen readable on its face, the
   figure at its spot not covering the screen, the three looks, the pop.
5. Three renders with the stress crew, opened with the Read tool:
   `node scripts/scene-shot.ts <id> "$SCRATCH/ws/<id>-150.png" --crew 4x4 --at 40 --cell 19x42`,
   `node scripts/scene-shot.ts <id> "$SCRATCH/ws/<id>-80.png" --crew 4x4 --at 40 --size 80x24 --cell 19x42`
   and a close-up,
   `node scripts/scene-shot.ts <id> "$SCRATCH/ws/<id>-close.png" --crew 4x4 --at 40 --cell 19x42 --zoom 2 --select 0`.
   The "next plate" each prints stays under 8 ms.
6. Compare with the brief and the art rules; fix; repeat.

**Done when** (every world):

- [ ] Its test, the contract and the typecheck pass.
- [ ] The sheet and the three renders read at a glance as the world's own
      workstation, a team pod of them reads as a pod, and every screen's
      activity reads on its face (code lines, a page, a magnifier, a
      terminal, a globe, a lightbulb, speech balloons, dim).
- [ ] One ink, light from the upper left, a contact shadow; no text, no
      logos; nothing in front of the screen; the upgrade's spot clear.
- [ ] Nothing outside its own three files was touched, and no git command
      was run.

### Task 8: Workstations for The Mines, Mad Science Lab, Underground Club

**Files** (this task owns these and nothing else):
- Create: `src/worlds/mines/workstation.ts`; Modify: `src/worlds/mines.ts`, `test/mines.test.ts`
- Create: `src/worlds/lab/workstation.ts`; Modify: `src/worlds/lab.ts`, `test/lab.test.ts`
- Create: `src/worlds/club/workstation.ts`; Modify: `src/worlds/club.ts`, `test/club.test.ts`

- [ ] **Step 1: The Mines (`mines`): a miner's lantern-lit workbench**

A heavy workbench of rough planks (`C.plank`, edged `C.timber`) on two
trestles of `C.pine` braced with an iron strap (`C.iron`), a candle-
blackened knot or two when `k.fine`. At its left end a hurricane lantern
(a `C.brass` frame round `C.lamp` glass) hangs from a short bent pole
fixed to the trestle. Its screen is a slate in a timber frame
(`C.timberDark`) propped upright at the back right, as a foreman chalks up
the shift. In front of the agent a tin cup and a lump of ore with a gold
glint (`C.gold`, `C.goldHi`). Looks: 0 a pick head leaning on the left
trestle; 1 a coil of rope (`C.rope`) under the top; 2 a gold pan with
three nuggets on the right end of the top, clear of the slate. On
(`v.active`): the lantern lit, a warm halo (`k.halo`) round its glass.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/mines/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// The Mines's workstation (see WorkstationArt in ../types.ts): a miner's lantern-lit workbench.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/mines.ts`, replace:

```ts
import { STATIONS } from './mines/stations.ts';
```

with:

```ts
import { STATIONS } from './mines/stations.ts';
import { WORKSTATION } from './mines/workstation.ts';
```

In `src/worlds/mines.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/mines.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('The Mines\'s workstation: its own, still whatever the clock', () => {
  const art = mines.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/mines.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`mines`; fix and repeat until its "done when" holds.

- [ ] **Step 2: Mad Science Lab (`lab`): a lab bench with a green-screen terminal**

A short lab bench: a black resin top (`C.resin`) on teal cupboard doors
(`C.cabinet`, `C.teal`) with steel handles. Its screen is a chunky
terminal with a deep beige case and a round-cornered tube on the right
half (the layer paints the glass). At the left back a ring stand
(`C.steel`) holding a round flask (`C.glass`) of fluid; a rack of three
test tubes beside it. Looks: the flask's fluid 0 `C.green`, 1 `C.magenta`,
2 `C.blue`. On: the fluid glows (a soft halo in its colour, low alpha).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/lab/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Mad Science Lab's workstation (see WorkstationArt in ../types.ts): a lab bench with a green-screen terminal.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/lab.ts`, replace:

```ts
import { STATIONS } from './lab/stations.ts';
```

with:

```ts
import { STATIONS } from './lab/stations.ts';
import { WORKSTATION } from './lab/workstation.ts';
```

In `src/worlds/lab.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/lab.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Mad Science Lab\'s workstation: its own, still whatever the clock', () => {
  const art = lab.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/lab.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`lab`; fix and repeat until its "done when" holds.

- [ ] **Step 3: Underground Club (`club`): a small DJ desk**

A compact booth (`C.black`, `C.gear`) with a neon lip along its top front
edge and a thin LED strip under it. Its screen is a laptop on a little
steel stand at the right (`C.steel`; the lid is the screen, tilted back a
little). At the left a controller with two small platters and a fader;
headphones lie on it. Looks: the neon lip 0 `C.pink`, 1 `C.cyan`,
2 `C.lime`. On: the lip and the strip glow (`k.halo` along them, low
alpha, kept inside the footprint).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/club/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Underground Club's workstation (see WorkstationArt in ../types.ts): a small DJ desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/club.ts`, replace:

```ts
import { STATIONS } from './club/stations.ts';
```

with:

```ts
import { STATIONS } from './club/stations.ts';
import { WORKSTATION } from './club/workstation.ts';
```

In `src/worlds/club.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/club.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Underground Club\'s workstation: its own, still whatever the clock', () => {
  const art = club.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/club.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`club`; fix and repeat until its "done when" holds.

- [ ] **Step 4: Hand back**

The list of the files it created and changed (no git), each world's test output,
and the paths of its sheet and renders. Expected: the suite count is up
by one a world (`node --test "test/**/*.test.ts"`: `ℹ fail 0`).

### Task 9: Workstations for Hacker's Den, Orbital Station, The Startup

**Files** (this task owns these and nothing else):
- Create: `src/worlds/den/workstation.ts`; Modify: `src/worlds/den.ts`, `test/den.test.ts`
- Create: `src/worlds/station/workstation.ts`; Modify: `src/worlds/station.ts`, `test/station.test.ts`
- Create: `src/worlds/office/workstation.ts`; Modify: `src/worlds/office.ts`, `test/office.test.ts`

- [ ] **Step 1: Hacker's Den (`den`): a compact battlestation**

A dark desk (`C.deskTop` on `C.desk`) on black legs. Its screen is one
wide monitor on a short stand (`C.black` bezel), the right half of the
desk. A keyboard in front with a glowing underside, a mouse, an energy-
drink can (plain, no label) and at the left end a rubber duck
(`C.rubberDuck`). Looks: the keyboard's glow 0 `C.green`, 1 `C.magenta`,
2 `C.cyan`. On: the glow shows (a thin bright line under the keyboard and
a small halo).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/den/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Hacker's Den's workstation (see WorkstationArt in ../types.ts): a compact battlestation.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/den.ts`, replace:

```ts
import { STATIONS } from './den/stations.ts';
```

with:

```ts
import { STATIONS } from './den/stations.ts';
import { WORKSTATION } from './den/workstation.ts';
```

In `src/worlds/den.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/den.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Hacker\'s Den\'s workstation: its own, still whatever the clock', () => {
  const art = den.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/den.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`den`; fix and repeat until its "done when" holds.

- [ ] **Step 2: Orbital Station (`station`): a console pod**

A white console (`C.hull`, `C.panel`) on a single pedestal, its top
sloping toward the agent with a row of little round buttons (`C.orange`,
`C.cyan`, `C.green`) and a trackball. Its screen is canted on a short arm
(`C.steel`) at the right back. A chrome handrail (`C.chrome`) along its
left end. Looks: 0 a mug clipped into a holder, 1 a tablet in a sleeve,
2 a little potted sprout (`C.leaf`) under a dome. On: the buttons lit
(their colours brighter, a pin of light each when `k.fine`).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/station/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Orbital Station's workstation (see WorkstationArt in ../types.ts): a console pod.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/station.ts`, replace:

```ts
import { STATIONS } from './station/stations.ts';
```

with:

```ts
import { STATIONS } from './station/stations.ts';
import { WORKSTATION } from './station/workstation.ts';
```

In `src/worlds/station.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/station.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Orbital Station\'s workstation: its own, still whatever the clock', () => {
  const art = station.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/station.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`station`; fix and repeat until its "done when" holds.

- [ ] **Step 3: The Startup (`office`): a standing desk with a monitor**

A white top on a black steel frame, its legs telescoped up to standing
height (two thin columns on wide feet). Its screen is one monitor on an
arm (black bezel) at the right. A plain keyboard and mouse in front of the
agent, a balance board on the floor in front (inside the footprint).
Looks: 0 a white mug, 1 a closed laptop (plain lid, no logo), 2 a short
stack of notebooks. On: a tiny LED on the frame's controller lights.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/office/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// The Startup's workstation (see WorkstationArt in ../types.ts): a standing desk with a monitor.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/office.ts`, replace:

```ts
import { STATIONS } from './office/stations.ts';
```

with:

```ts
import { STATIONS } from './office/stations.ts';
import { WORKSTATION } from './office/workstation.ts';
```

In `src/worlds/office.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/office.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('The Startup\'s workstation: its own, still whatever the clock', () => {
  const art = office.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/office.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`office`; fix and repeat until its "done when" holds.

- [ ] **Step 4: Hand back**

The list of the files it created and changed (no git), each world's test output,
and the paths of its sheet and renders. Expected: the suite count is up
by one a world (`node --test "test/**/*.test.ts"`: `ℹ fail 0`).

### Task 10: Workstations for Cozy Café, Fungal Caverns, Snowy Depths

**Files** (this task owns these and nothing else):
- Create: `src/worlds/cafe/workstation.ts`; Modify: `src/worlds/cafe.ts`, `test/cafe.test.ts`
- Create: `src/worlds/fungal/workstation.ts`; Modify: `src/worlds/fungal.ts`, `test/fungal.test.ts`
- Create: `src/worlds/snowy/workstation.ts`; Modify: `src/worlds/snowy.ts`, `test/snowy.test.ts`

- [ ] **Step 1: Cozy Café (`cafe`): a little laptop table**

A small oak table (`C.honey` top on `C.walnut` legs). Its screen is an
open laptop (`C.chrome`), its lid tilted back a little (a parallelogram:
its bottom edge level on the base's back edge, its top edge leaning
away), at the right. A latte in a china cup (`C.china`, `C.crema`) and a
sugar bowl. Looks: 0 a succulent in a pot, 1 a croissant on a plate,
2 a closed paperback (`C.mustard`). On: the laptop's glow (a soft halo
over the keys).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/cafe/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Cozy Café's workstation (see WorkstationArt in ../types.ts): a little laptop table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/cafe.ts`, replace:

```ts
import { STATIONS } from './cafe/stations.ts';
```

with:

```ts
import { STATIONS } from './cafe/stations.ts';
import { WORKSTATION } from './cafe/workstation.ts';
```

In `src/worlds/cafe.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/cafe.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Cozy Café\'s workstation: its own, still whatever the clock', () => {
  const art = cafe.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/cafe.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`cafe`; fix and repeat until its "done when" holds.

- [ ] **Step 2: Fungal Caverns (`fungal`): a shelf-fungus desk**

A broad bracket fungus (`C.capTan`, gills `C.gill` under its lip) grown
out of a stout stalk (`C.stalk`) as the top. Its screen is a slab of
polished crystal (`C.crystal`, edged `C.crystalDark`) set upright in a
cradle of roots at the back right. At the left a glowing toadstool lamp;
a spore jar. Looks: the lamp 0 `C.glow`, 1 `C.capViolet`, 2 `C.capBlue`.
On: the lamp glows (`k.halo`, its colour).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/fungal/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Fungal Caverns's workstation (see WorkstationArt in ../types.ts): a shelf-fungus desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/fungal.ts`, replace:

```ts
import { STATIONS } from './fungal/stations.ts';
```

with:

```ts
import { STATIONS } from './fungal/stations.ts';
import { WORKSTATION } from './fungal/workstation.ts';
```

In `src/worlds/fungal.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/fungal.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Fungal Caverns\'s workstation: its own, still whatever the clock', () => {
  const art = fungal.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/fungal.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`fungal`; fix and repeat until its "done when" holds.

- [ ] **Step 3: Snowy Depths (`snowy`): an expedition table**

Planks on log legs (`C.wood`, `C.bark`), a fur draped over the left end.
Its screen is a pane of clear ice (`C.frost` rim, `C.ice`) in a timber
frame standing at the back right. A candle lantern (`C.lamp`) at the
left, a mug of cocoa. Looks: the fur 0 `C.fur`, 1 `C.furGrey`,
2 `C.furWhite`. On: the lantern lit.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/snowy/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Snowy Depths's workstation (see WorkstationArt in ../types.ts): an expedition table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/snowy.ts`, replace:

```ts
import { STATIONS } from './snowy/stations.ts';
```

with:

```ts
import { STATIONS } from './snowy/stations.ts';
import { WORKSTATION } from './snowy/workstation.ts';
```

In `src/worlds/snowy.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/snowy.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Snowy Depths\'s workstation: its own, still whatever the clock', () => {
  const art = snowy.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/snowy.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`snowy`; fix and repeat until its "done when" holds.

- [ ] **Step 4: Hand back**

The list of the files it created and changed (no git), each world's test output,
and the paths of its sheet and renders. Expected: the suite count is up
by one a world (`node --test "test/**/*.test.ts"`: `ℹ fail 0`).

### Task 11: Workstations for The Vault, Hell, Dust Outpost

**Files** (this task owns these and nothing else):
- Create: `src/worlds/vault/workstation.ts`; Modify: `src/worlds/vault.ts`, `test/vault.test.ts`
- Create: `src/worlds/hell/workstation.ts`; Modify: `src/worlds/hell.ts`, `test/hell.test.ts`
- Create: `src/worlds/dunes/workstation.ts`; Modify: `src/worlds/dunes.ts`, `test/dunes.test.ts`

- [ ] **Step 1: The Vault (`vault`): a teller's desk**

A mahogany desk (`C.mahogany`, `C.mahoganyDark`) with a green leather
inlay on its top. Its screen is a security monitor in a brass frame
(`C.brass`) at the right back. A banker's lamp with a green shade at the
left, a short stack of coins (`C.gold`). Looks: 0 more coins, 1 a bundle
of notes in a plain band (no print), 2 a rubber stamp on its pad. On: the
banker's lamp lit (a warm pool on the leather).

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/vault/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// The Vault's workstation (see WorkstationArt in ../types.ts): a teller's desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/vault.ts`, replace:

```ts
import { STATIONS } from './vault/stations.ts';
```

with:

```ts
import { STATIONS } from './vault/stations.ts';
import { WORKSTATION } from './vault/workstation.ts';
```

In `src/worlds/vault.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/vault.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('The Vault\'s workstation: its own, still whatever the clock', () => {
  const art = vault.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/vault.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`vault`; fix and repeat until its "done when" holds.

- [ ] **Step 2: Hell (`hell`): an ebony writing desk on gilt claws**

An ebony desk (`C.ebony`, `C.ebonyLight`) on gilt claw feet (`C.gold`).
Its screen is a scrying mirror in a frame of bone (`C.bone`,
`C.boneShade`) standing at the right back. A candle stuck in a skull
(`C.bone`, `C.wax`) at the left, a red quill in an inkwell. Looks: 0 the
candle as it is, 1 an hourglass, 2 a little brazier of embers (`C.ember`).
On: a red glow round the mirror's frame and the candle lit.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/hell/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Hell's workstation (see WorkstationArt in ../types.ts): an ebony writing desk on gilt claws.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/hell.ts`, replace:

```ts
import { STATIONS } from './hell/stations.ts';
```

with:

```ts
import { STATIONS } from './hell/stations.ts';
import { WORKSTATION } from './hell/workstation.ts';
```

In `src/worlds/hell.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/hell.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Hell\'s workstation: its own, still whatever the clock', () => {
  const art = hell.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/hell.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`hell`; fix and repeat until its "done when" holds.

- [ ] **Step 3: Dust Outpost (`dunes`): a scrap-wood desk**

Planks laid across two crates (`C.wood`, `C.woodDark`, the crates
`C.scrap`). Its screen is a salvaged tube monitor in a dented housing
(`C.scrap`, rust patches `C.rust`) at the right. A lamp on a bent pole
(`C.lamp`) at the left, a canteen (`C.turquoise`), a rolled chart.
Looks: 0 the canteen, 1 a little cactus in a tin, 2 a jar of bolts. On:
the lamp lit.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/dunes/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Dust Outpost's workstation (see WorkstationArt in ../types.ts): a scrap-wood desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/dunes.ts`, replace:

```ts
import { STATIONS } from './dunes/stations.ts';
```

with:

```ts
import { STATIONS } from './dunes/stations.ts';
import { WORKSTATION } from './dunes/workstation.ts';
```

In `src/worlds/dunes.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/dunes.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Dust Outpost\'s workstation: its own, still whatever the clock', () => {
  const art = dunes.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/dunes.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`dunes`; fix and repeat until its "done when" holds.

- [ ] **Step 4: Hand back**

The list of the files it created and changed (no git), each world's test output,
and the paths of its sheet and renders. Expected: the suite count is up
by one a world (`node --test "test/**/*.test.ts"`: `ℹ fail 0`).

### Task 12: Workstations for Longhall, Starfall Base

**Files** (this task owns these and nothing else):
- Create: `src/worlds/meadhall/workstation.ts`; Modify: `src/worlds/meadhall.ts`, `test/meadhall.test.ts`
- Create: `src/worlds/starfall/workstation.ts`; Modify: `src/worlds/starfall.ts`, `test/starfall.test.ts`

- [ ] **Step 1: Longhall (`meadhall`): a scribe's desk**

A desk of carved timber (`C.timber`, carved edges `C.carving`). Its
screen is a stretched vellum (`C.cream`) on a small carved stand at the
right back (the layer paints on it). A horn inkwell with a quill, a candle
on an iron arm (`C.iron`, `C.wax`) at the left, a bundle of scrolls.
Looks: 0 a drinking horn, 1 a scroll with a plain wax seal (no rune), 2 a
small round shield leaning on the left leg (plain colours, `C.red`,
`C.blue`). On: the candle lit.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/meadhall/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Longhall's workstation (see WorkstationArt in ../types.ts): a scribe's desk.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/meadhall.ts`, replace:

```ts
import { STATIONS } from './meadhall/stations.ts';
```

with:

```ts
import { STATIONS } from './meadhall/stations.ts';
import { WORKSTATION } from './meadhall/workstation.ts';
```

In `src/worlds/meadhall.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/meadhall.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Longhall\'s workstation: its own, still whatever the clock', () => {
  const art = meadhall.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/meadhall.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`meadhall`; fix and repeat until its "done when" holds.

- [ ] **Step 2: Starfall Base (`starfall`): a holo console**

A curved white desk (`C.panel`, `C.panelLight`) on one pedestal, a light
strip along its front edge, a projector bar along its back. Its screen is
the holo pane the bar throws up at the right: a thin `C.holo` frame
standing on the bar (the layer paints its face). A data slate and a little
glowing sprout pot at the left. Looks: the strip 0 `C.cyan`, 1 `C.magenta`,
2 `C.gold`. On: the strip and the projector bar glow.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/starfall/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Starfall Base's workstation (see WorkstationArt in ../types.ts): a holo console.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/starfall.ts`, replace:

```ts
import { STATIONS } from './starfall/stations.ts';
```

with:

```ts
import { STATIONS } from './starfall/stations.ts';
import { WORKSTATION } from './starfall/workstation.ts';
```

In `src/worlds/starfall.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/starfall.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Starfall Base\'s workstation: its own, still whatever the clock', () => {
  const art = starfall.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/starfall.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`starfall`; fix and repeat until its "done when" holds.

- [ ] **Step 3: Hand back**

The list of the files it created and changed (no git), each world's test output,
and the paths of its sheet and renders. Expected: the suite count is up
by one a world (`node --test "test/**/*.test.ts"`: `ℹ fail 0`).

### Task 13: Workstations for Atomic Shelter, Frontier Colony

**Files** (this task owns these and nothing else):
- Create: `src/worlds/shelter/workstation.ts`; Modify: `src/worlds/shelter.ts`, `test/shelter.test.ts`
- Create: `src/worlds/colony/workstation.ts`; Modify: `src/worlds/colony.ts`, `test/colony.test.ts`

- [ ] **Step 1: Atomic Shelter (`shelter`): a steel desk with a terminal**

A steel desk (`C.steel`, `C.steelLight`, rivets `C.rivet`) with a drawer
pedestal under its left end. Its screen is a green-phosphor terminal in a
riveted case (`C.crtDark` round `C.crt`) at the right. A gooseneck lamp at
the left, a stack of punch cards. Looks: the lamp 0 `C.mint`, 1 `C.pink`,
2 `C.aqua`. On: the lamp lit.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/shelter/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Atomic Shelter's workstation (see WorkstationArt in ../types.ts): a steel desk with a terminal.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/shelter.ts`, replace:

```ts
import { STATIONS } from './shelter/stations.ts';
```

with:

```ts
import { STATIONS } from './shelter/stations.ts';
import { WORKSTATION } from './shelter/workstation.ts';
```

In `src/worlds/shelter.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/shelter.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Atomic Shelter\'s workstation: its own, still whatever the clock', () => {
  const art = shelter.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/shelter.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`shelter`; fix and repeat until its "done when" holds.

- [ ] **Step 2: Frontier Colony (`colony`): a plank work table**

A plank table (`C.plank`, `C.plankDark`) on trestles. Its screen is a
slate board in a wooden frame on a little easel at the right back. An oil
lamp (`C.flame` behind its glass) at the left, a tin mug (`C.steel`), a
pencil. Looks: 0 a jar of wildflowers, 1 a bundle of plain seed packets,
2 a whittled bird. On: the lamp lit.

The module (the body of `draw` is the art, from the brief; `height`,
`screen` and `top` are its to place within the conventions: these numbers
pass the contract):

Create `src/worlds/colony/workstation.ts`:

```ts
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { C, kitOf } from './kit.ts';

// Frontier Colony's workstation (see WorkstationArt in ../types.ts): a plank work table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
  },
  screen: [
    [2.95, 0.9, 6.6],
    [6.0, 0.9, 6.6],
    [6.0, 0.9, 9.4],
    [2.95, 0.9, 9.4],
  ],
  top: [1.1, 0.9, 6.0],
};
```

Register it:

In `src/worlds/colony.ts`, replace:

```ts
import { STATIONS } from './colony/stations.ts';
```

with:

```ts
import { STATIONS } from './colony/stations.ts';
import { WORKSTATION } from './colony/workstation.ts';
```

In `src/worlds/colony.ts`, replace:

```ts
  decor: DECOR,
```

with:

```ts
  decor: DECOR,
  workstation: WORKSTATION,
```

Add at the end of `test/colony.test.ts` (it uses the file's own `render` and
`same`; the contract covers the rest):

```ts
test('Frontier Colony\'s workstation: its own, still whatever the clock', () => {
  const art = colony.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
```

Run: `node --test test/colony.test.ts && node --test test/themes.test.ts && node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: PASS (the new test fails only while `draw` looks at the clock),
no typecheck output.

Then the sheet and the renders (Conventions, steps 4 and 5) with `<id>` =
`colony`; fix and repeat until its "done when" holds.

- [ ] **Step 3: Hand back**

The list of the files it created and changed (no git), each world's test output,
and the paths of its sheet and renders. Expected: the suite count is up
by one a world (`node --test "test/**/*.test.ts"`: `ℹ fail 0`).

## Part C: the coordinator

### Task 14: Review each world's workstation and commit it

Each art agent hands back its files, its test output and its render paths
(Tasks 8–13). Review and commit each world on its own.

- [ ] **Step 1: The code**

For each world, read `src/worlds/<id>/workstation.ts` whole and check: it
draws with its own kit only (no other world's files imported); `draw`
never reads `v.t`; `v.seed` used modulo 3 or not at all; no `animated`,
no `emit`; nothing drawn in front of the screen quad; `screen` and `top`
as the conventions say; small detail behind `k.fine`; comments in the
code's own plain style. Ask for the code-review skill's second look
(`superpowers:requesting-code-review`) over all sixteen together, and fix
what it finds in the world's own files.

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ tests 1427`, `ℹ fail 0` (1411 after
Task 7, one test a world).

- [ ] **Step 2: The art**

Run, for each world (every picture opened with the Read tool):

```bash
mkdir -p "$SCRATCH/ws"
for id in mines lab club den station office cafe fungal snowy vault hell dunes meadhall starfall shelter colony; do
  node "$SCRATCH/tools/desk-sheet.ts" "$PWD/src" $id "$SCRATCH/ws/$id-sheet.png" 10
  node scripts/scene-shot.ts $id "$SCRATCH/ws/$id-150.png" --crew 4x4 --at 40 --cell 19x42
done
```

Expected: 32 paths. Each world's workstation reads as its own at a glance
next to its stations (the briefs), a pod of them as a pod; every screen's
activity reads; one ink, lit from the upper left; no text, no logos. Send
back what does not, to its agent (its own files only), and look again.

- [ ] **Step 3: Commit, a world at a time**

Each world once it passes Steps 1 and 2, on its own commit (its three
files only). Keep the lines for the worlds being committed:

```bash
while IFS='|' read -r id what; do
  git add "src/worlds/$id/workstation.ts" "src/worlds/$id.ts" "test/$id.test.ts"
  git commit -q -F - <<EOF
feat($id): its own workstation

$what, in the world's style. Its screen shows what
its agent is doing; a desk upgrade stands on its top.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
done <<'LIST'
mines|A miner's lantern-lit workbench
lab|A lab bench with a green-screen terminal
club|A small DJ desk
den|A compact battlestation
station|A console pod
office|A standing desk with a monitor
cafe|A little laptop table
fungal|A shelf-fungus desk
snowy|An expedition table
vault|A teller's desk
hell|An ebony writing desk on gilt claws
dunes|A scrap-wood desk
meadhall|A scribe's desk
starfall|A holo console
shelter|A steel desk with a terminal
colony|A plank work table
LIST
git log --oneline -16
```

Expected: one commit a world, `feat(<id>): its own workstation`, and a
clean tree (but for `node_modules`).

### Task 15: Twenty agents in a real Ghostty, before and after

Screenshots of the stress crew in a real Ghostty for the user, before (on
`main`) and after (on `stations`), and frames timed against today with
twenty agents (the spec's frame budgets). Nothing in the repo changes
unless the user asks for changes.

The harness in `$SCRATCH`: `run-shots.sh <world> <shots>` opens a fresh
Ghostty window (150 x 46), runs `probe-shots.ts` (the real loop: World →
ScenePlayer → Renderer, the account shown as "you") and screenshots each
marked moment to `$SCRATCH/shots/<world>-<shot>.png`; `run-perf.sh <world>`
runs `probe-world.ts` (the real loop at 30 fps, a few keys) and prints its
step times and Ghostty's CPU.

**Files:** none in the repo; in `$SCRATCH`: `probe-shots.ts` and
`probe-world.ts` (a stress crew, `CREW=LxS`; the code under test,
`ANIMUS_SRC`); a checkout of `main` at `$SCRATCH/main-before`.

- [ ] **Step 1: A checkout of today's `main` to compare with**

```bash
git -C <repo> worktree add --detach "$SCRATCH/main-before" 32b9578
ln -s <repo>/node_modules "$SCRATCH/main-before/node_modules"
```

Expected: `HEAD is now at 32b9578 The Startup world and office life (#2)`.

- [ ] **Step 2: The probes take a stress crew, and the code to run**

Both probes get the stress crew of `src/demo/stress.ts`, kept in the
probe itself so that it runs on `main` too (where that file does not
exist), and read the code under test from `ANIMUS_SRC`:

```bash
sed -i "s#^const R = .*#const R = process.env.ANIMUS_SRC ?? '<repo>/src';#" "$SCRATCH/probe-world.ts" "$SCRATCH/probe-shots.ts"
sed -i 's#live: null, demo: true,#live: crew(), demo: !process.env.CREW,#' "$SCRATCH/probe-world.ts" "$SCRATCH/probe-shots.ts"
for f in "$SCRATCH/probe-world.ts" "$SCRATCH/probe-shots.ts"; do cat >> "$f" <<'EOF'

// CREW=LxS: instead of the demo crew, L leads with S subagents each, all
// at work, each turning to something else every four to ten seconds (the
// stress crew of src/demo/stress.ts, kept here so the probe runs on a
// checkout from before it too). Hoisted: the world above is made with it.
function crew(): any {
  const m = (process.env.CREW ?? '').match(/^(\d+)x(\d+)$/);
  if (!m) return null;
  const acts = ['write', 'read', 'search', 'run', 'web', 'think', 'write', 'write', 'read', 'run'];
  let seed = 12345;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const t0 = Date.now();
  const agents: any[] = [];
  for (let l = 0; l < +m[1]; l++) {
    agents.push({ id: `L${l}`, name: `lead ${l}`, role: 'lead', activity: 'write', next: t0, since: t0 });
    for (let k = 0; k < +m[2]; k++) agents.push({ id: `L${l}S${k}`, name: `sub ${l}.${k}`, role: 'sub', parentId: `L${l}`, activity: 'read', next: t0, since: t0 });
  }
  return {
    label: 'stress',
    poll(now: number) {
      for (const a of agents) {
        if (now < a.next) continue;
        a.activity = acts[Math.floor(rnd() * acts.length)];
        a.next = now + 4000 + rnd() * 6000;
        a.since = now;
      }
      return agents.map((a) => ({ id: a.id, name: a.name, role: a.role, parentId: a.parentId, project: '/stress', agentType: a.role === 'sub' ? 'general-purpose' : undefined, activity: a.activity, detail: `${a.activity} things`, since: a.since, lastSeen: now, crew: '/stress' }));
    },
    drainEvents: () => [],
  };
}
EOF
done
grep -c "process.env.ANIMUS_SRC\|live: crew()\|^function crew" "$SCRATCH/probe-world.ts" "$SCRATCH/probe-shots.ts"
```

Expected: `3` for each file.

- [ ] **Step 3: Screenshots, before and after**

Run, one at a time (each opens its own window):

```bash
export CREW=4x4
for id in cafe mines starfall office; do
  ANIMUS_SRC="$SCRATCH/main-before/src" "$SCRATCH/run-shots.sh" $id room && mv "$SCRATCH/shots/$id-room.png" "$SCRATCH/shots/before-$id-20.png"
  ANIMUS_SRC=<repo>/src "$SCRATCH/run-shots.sh" $id room && mv "$SCRATCH/shots/$id-room.png" "$SCRATCH/shots/after-$id-20.png"
done
ls "$SCRATCH/shots/"{before,after}-*-20.png
```

Expected: eight paths. Open each with the Read tool. Before: the twenty
queue in lanes in front of the stations and bunch round the islands.
After: team pods on the open floor, each agent at its own workstation,
the screens showing their work; the labels legible, the picture sharp.

- [ ] **Step 4: Frames with twenty, against today**

Run:

```bash
export CREW=4x4
for id in cafe office; do
  ANIMUS_SRC="$SCRATCH/main-before/src" "$SCRATCH/run-perf.sh" $id | tail -1 | sed "s/^/before $id: /"
  ANIMUS_SRC=<repo>/src "$SCRATCH/run-perf.sh" $id | tail -1 | sed "s/^/after $id: /"
done
```

Expected: four lines `<before|after> <id>: all: <n> steps (<n>/s); step p50 <n> p95 <n> max <n> ms; our CPU <n>%; out <n> KiB/s; ghostty CPU <n>%`.
After keeps 28 steps a second or more, its p95 step at most 1.5 times
before's and under 12 ms, and Ghostty's CPU within 5 points of before's.
A miss: profile the scene with twenty (`node --cpu-prof scripts/scene-shot.ts cafe /dev/null --crew 4x4 --at 40`),
fix it test-first, rerun this step.

- [ ] **Step 5: Show the user, and clean up**

Give the user the eight screenshot paths and the four timing lines, and
the small-room numbers (decision 1). Make the changes they ask for (in a
world's own files as in Tasks 8–13, or test-first in shared code), each
committed with the Co-Authored-By line. Then:

```bash
git -C <repo> worktree remove "$SCRATCH/main-before"
```

### Task 16: The README

**Files:**
- Modify: `README.md` (the intro, the open floor, "What the characters do", the ★5 row, office life, adding a world)

- [ ] **Step 1: The text**

In `README.md`, replace:

```
as a character of its own, dressed for the world it is in. What it does
follows what its agent is doing right now: editing at the desk, reading at
the shelf, running commands at the machine. In between they live a little:
```

with:

```
as a character of its own, dressed for the world it is in, and gets a
workstation of its own that pops up as it walks in. It works there, and
its screen shows what its agent is doing right now: code going in, a page
being read, a search, a command running, the web, a thought. In between
they live a little:
```

In `README.md`, replace:

```
turning big and empty. The furniture between the stations stands along the
back walls, in the corners and beside the stations, never loose at the
front of the room. Names, speech bubbles, the card and the
```

with:

```
turning big and empty. The furniture between the stations stands along the
back walls, in the corners and beside the stations, never loose at the
front of the room; the open floor is the crew's, for their workstations
and their walks. Names, speech bubbles, the card and the
```

In `README.md`, replace:

```
Each world has a prop for each kind of work. A character walks to the one
for what its agent is doing, and the prop comes alive while it is worked
(in the café the espresso machine pulls shots, in the club the decks spin).
```

with:

```
Every agent works at a workstation of its own, drawn in the world's style
(a laptop table in the café, a lantern-lit workbench in the mines, a
scribe's desk in the longhall, a holo console at the base, a standing
desk at the startup). It pops up out of the floor as the agent walks in;
a team sits together, the lead's in the middle of its pod, its
subagents' round it; when the agent leaves, its workstation stands empty a
few seconds, then shrinks away. Past the room's places (about two dozen
in a 150 x 46 terminal, a few in an 80 x 24 one) a newcomer works at a
teammate's side until one comes free. The world's stations stay as the
scenery the crew uses between tasks: the fire to nap by, the bar for a
coffee, a view, the way in.
```

In `README.md`, replace:

```
| write | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | at the write station |
| read | `Read`, MCP resource reads | at the read station |
| search | `Grep`, `Glob`, `LS`, `ToolSearch` | at the search station |
| run | `Bash` and any other tool | at the run station |
| web | `WebFetch`, `WebSearch`, MCP tools | at the web station |
| think | thinking, planning, a new task | at the think station |
| delegate | `Agent`/`Task`, `Skill`, `SendMessage`, `Workflow` | casting a bolt at its subagent, who waves back |
| talk | a reply, a question for you | at the think station, glints round it |
```

with:

```
| write | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | at its workstation, code lines on the screen |
| read | `Read`, MCP resource reads | at its workstation, a page on the screen |
| search | `Grep`, `Glob`, `LS`, `ToolSearch` | at its workstation, a magnifier over a list |
| run | `Bash` and any other tool | at its workstation, a terminal with sparks |
| web | `WebFetch`, `WebSearch`, MCP tools | at its workstation, a globe |
| think | thinking, planning, a new task | at its workstation, a lightbulb |
| delegate | `Agent`/`Task`, `Skill`, `SendMessage`, `Workflow` | casting a bolt at its subagent, who waves back; speech balloons on the screen |
| talk | a reply, a question for you | at its workstation, speech balloons, glints round it |
```

In `README.md`, replace:

```
| ★5 | 1,000 | a desk upgrade (a plant, a steaming mug or a trophy) by its favourite station, the one it has worked at most since animus started |
```

with:

```
| ★5 | 1,000 | a desk upgrade (a plant, a steaming mug or a trophy) on its workstation |
```

In `README.md`, replace:

```
  round it and nod along under its speech mark for a moment, then go to
  their stations (at most once a lead every 30 seconds).
```

with:

```
  round it and nod along under its speech mark for a moment, then go to
  their workstations (at most once a lead every 30 seconds).
```

In `README.md`, replace:

```
It is all for show: nothing is sent or changed, a working agent never
leaves its station for it, and anyone given work drops it at once. `o`
```

with:

```
It is all for show: nothing is sent or changed, a working agent never
leaves its workstation for it, and anyone given work drops it at once. `o`
```

In `README.md`, replace:

```
   ambient tint, the `costume`, the `critter`, the `finale` colours and
   what the crew `build`s.
```

with:

```
   ambient tint, the `costume`, the `critter`, the `finale` colours,
   what the crew `build`s and, optionally, its `workstation` (a still prop
   7 x 3 units and at most 10 tall that names its screen and the spot on
   its top for a desk upgrade: `WorkstationArt` in `src/worlds/types.ts`;
   without one, a plain desk with a monitor in the world's colours).
```

- [ ] **Step 2: Check it**

Run: `grep -n "workstation" README.md | wc -l`
Expected: at least `12`.

Run: `grep -n "the write station\|favourite station\|their stations\|leaves its station" README.md`
Expected: no output.

The README's screenshots (the hero and the gallery) show the crew at the
stations, as it was: ask the user whether to retake them now (real Ghostty
captures, the demo crew, the account shown as "you", as before) or in a
follow-up.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -F - <<'EOF'
docs(readme): every agent at its own workstation

What the characters do, the screens' pictures for each kind of work,
the desk upgrade on the workstation, office life's huddle going back
to workstations, and the optional workstation of a new world.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 17: The PR, through CI

`main` is protected: everything lands through a PR with every required
check green, squash-merged once the maintainer approves.

- [ ] **Step 1: Everything green locally**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ fail 0`.

Run: `git status --short && git log --oneline main..stations`
Expected: a clean tree (but for `node_modules`), and the branch's commits:
the design, this plan, Tasks 1–7, a commit a world, the README (and any
fixes from Task 15).

Run: `git grep -nE "/home/[a-z]{2,}/|/tmp/claude-[0-9]+|claude\.ai/code/session" -- . ':!node_modules'`
Expected: no output: no local paths or session links in a public repo.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin stations
gh pr create --base main --head stations --title "A workstation for every agent, in every world" --body-file - <<'EOF'
Every agent gets a workstation of its own, in every world.

- **Workstations**: one pops up out of the floor (a puff and a sparkle) as its agent walks in; the agent does all its work there; left empty, it stands a few seconds, then shrinks away. Its screen shows what the agent is doing (code lines, a page, a magnifier over a list, a terminal with sparks, a globe, a lightbulb, speech balloons, dim while it waits), drawn by a shared layer.
- **Places**: each room plans them in team pods on the open floor its stations and decor leave, clear of the walkways, the way in, the plazas, the yard and the idlers' spots, hiding nobody: two dozen in a 150x46 terminal, a few in an 80x24 one. Past them a newcomer works at a teammate's side, apart, and moves to its own when a place comes free.
- **Sixteen workstations**, one in each world's style (a laptop table in the café, a lantern-lit workbench in the mines, a scribe's desk in the longhall, a holo console at the base, a standing desk at the startup, ...); a plain one in a world's colours for a world that draws none.
- Workstations are cached sprites (a pop is five pictures), walked round like furniture (only their cells of the routing grid are rated again).
- A desk upgrade (★5) stands on its agent's workstation. Office life uses the lead's workstation for its huddles and high-fives; a huddle waits for its join window.
- The stress test: twenty at work in every world at 80x24, 150x46 and 200x60, each at its own workstation or a teammate's side, none within four units of another. `scene-shot --crew 4x4` renders such a crew.
- README: workstations in "What the characters do".

Design: `docs/superpowers/specs/2026-10-26-workstations-design.md`; plan: `docs/superpowers/plans/2026-10-26-workstations.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

Expected: the PR's URL.

- [ ] **Step 3: The CI loop**

Run: `gh pr checks --watch`
Expected: every required check passes (tests on Linux and macOS, the
snapshot of every preset, the typecheck, CodeQL and its gate, which fails
on any finding). On a failure: `gh run view <run-id> --log-failed`, fix it,
commit (ending with the Co-Authored-By line), `git push`, and watch again.

- [ ] **Step 4: Merge, with the maintainer's approval**

Tell the user the PR is green and ask them to approve the merge (the
branch protection needs it). Once approved:

Run: `gh pr merge --squash`
Expected: the PR merged into `main` (the repository deletes the head branch).

## Self-review against the spec

| the spec asks | where |
| --- | --- |
| Stress test first, red: 20 working agents (4 leads x 4), every world, 80x24, 150x46, 200x60; own workstation; no two closer than about 4 units; sharers at a teammate's side | Task 1 (red), green in Task 7; `WORK_APART` = 4 |
| One workstation per agent, popping up as it arrives; all its work there | Task 5 (claimed on arrival, pops up), Task 7 (every working activity at it) |
| Each world's own `workstation` prop in its style, drawn with its kit | Tasks 8–13 (briefs for all sixteen), Task 14 (review) |
| The world names its screen as a quad in prop-local units; a shared activity layer draws the activity on it, the same in every world | Task 3 (`WorkstationArt.screen`, `drawScreen`, the contract) |
| write, read, search, run, web, think, delegate/talk, idle/waiting looks | Task 3 (`Screen`: write, read, search, run, web, think, talk, off), Task 5 (`screenFor`: delegate and talk to `talk`; idle, done, error and empty to `off`: decision 5) |
| Workstations are their own sprites, never baked into the room, drawn once per world, scale and activity | Task 4 (`deskSprite`, keyed by world, ink, frame, look, screen, pop step, scale; warmed) |
| A plain fallback in the world's ink and palette | Task 3 (`plainWorkstation`, `workstationOf`) |
| Slots planned with the room, in pods, mostly the middle and front; off walkways, the entrance, plazas, the yard, the stations' fronts; hiding no station or crowd | Task 2 (`planDesks`, `test/desks.test.ts`) |
| About 25 slots at 150x46, about 12 at 80x24 | Task 2: 25 at 150x46; 3 to 5 at 80x24 (decision 1: the room is full; sharing covers it) |
| Leads take a pod's lead slot; subagents a slot in their lead's pod, or the nearest free | Task 7 (`placeFor`; leads before subagents in a poll; decision 4) |
| Pop-in: grows out of the floor with a puff and a sparkle in about half a second; it walks to it | Task 5 (`POP_S` 0.5, `growth`, `poof`), Task 7 (walks to it) |
| Departure: empty for a few seconds, then shrinks away with a puff; the slot free again | Task 5 (`EMPTY_S` 4, shrink over `POP_S`, the place reused) |
| Past capacity: share the nearest teammate's workstation, at its side; nothing breaks | Task 7 (`share`, `SIDES`, moves to its own when one frees) |
| Workstations block walking; the grid updated by marking only their cells | Task 5 (`NavGrid.rerate`; walkers re-plan; anyone in the way steps out) |
| ★5 desk upgrade on the agent's own workstation | Task 6 (`placeTrinkets` at `art.top`, `TrinketFrame.z`) |
| The stations stay as scenery; office life works, the lead's desk is its workstation | Task 7 (stations idle: decision 6; huddle join window: decision 8; office-life tests) |
| Tests: no overlap with props, walkways, entrance, plazas, yard; pods keep a team; pop-in and pop-out on time; freed slot reused; the grid consistent | Task 2 (`desks.test.ts`), Task 5 (`workstations.test.ts`) |
| Tests: each activity draws something different; sprite key equals pixels | Task 3, Task 4 (`workstation-art.test.ts`) |
| Tests: every world's workstation passes the contract (footprint, height, a screen quad on its body) | Task 3 (`themes.test.ts`, the plain one), Tasks 8–13 (each world's own) |
| Tests: frame budgets hold with 20 agents | Task 7 (`workstations.test.ts`, the budget test) |
| One round of code and art review, fixes | Task 14 |
| Ghostty stress screenshots before and after, frame timing against today | Task 1 Step 5 and Task 7 Step 6 (scene-shot), Task 15 (a real Ghostty) |
| README note; PR through the required checks; merge after the user's OK | Tasks 16, 17 |

**Placeholders:** none. The only code not inlined is each world's drawing
(Tasks 8–13), written from its brief and held by its test and the
contract; the module's frame, registration and test are given in full.

**Names across tasks:** `Desk`, `DESK`, `DESK_SPOT`, `deskCap`,
`deskZone` (Task 2); `WorkstationArt`, `Quad`, `P3`, `workstationOf`,
`plainWorkstation`, `drawScreen`, `Screen`, `DeskFrame` (Task 3);
`deskSprite`, `POP_STEPS`, `growth`, `deskStats` (Task 4); `POP_S`,
`EMPTY_S`, `Workstation`, `Stage.workstations`, `screenFor`,
`NavGrid.rerate` (Task 5); `TrinketFrame.z` (Task 6); `SIDES`,
`WORK_APART` (Task 7): each is defined in the task named and used as
defined after it (checked by applying Tasks 1–7 from this text).
