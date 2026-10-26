# Game-Inspired Worlds Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Five new illustrated worlds (a desert outpost, a Nordic mead hall, a base on an alien planet, a retro-atomic shelter and a frontier colony), each with its own costume and ★2 hat on every species, three new critters, all fifteen worlds in the picker and the README gallery, shipped through a PR.

**Architecture:** Groundwork first, in shared code, test-first with complete code (Tasks 1–4): five `Costume` values with their ★2 hats, their outfits and ★8 colours on all five species, three `CritterKind`s, and `scripts/scene-shot.ts` able to render a world that is not registered yet. Then five independent world tasks (5–9), each owning only `src/worlds/<id>.ts`, `src/worlds/<id>/` and `test/<id>.test.ts`, run in parallel with no git and no shared files. Then the coordinator reviews, commits and registers them (10), checks them in a real Ghostty (11), brings the README gallery to fifteen (12) and ships through the CI loop (13).

**Tech Stack:** TypeScript run directly by Node 26 (type stripping, no build), `node:test`, the zero-dependency rasterizer in `src/art/` (a Canvas2D-like `Pen`, isometric helpers, a PNG encoder), kitty graphics in Ghostty.

**Spec:** `docs/superpowers/specs/2026-10-25-game-worlds-design.md`. Art direction and the `Pen` contract: `docs/superpowers/specs/2026-10-24-illustrated-design.md`.

---

## Read this first

**World art is written from a brief, not from code in this plan.** Each
world is about 3,000 lines of drawing code: too large to inline. Tasks 5–9
therefore deliberately deviate from "complete code in every step": each gives
the complete test file (which fixes the contract: footprints, heights,
animation, wall pieces, points of interest, the frame-time budgets), the
complete world module (`src/worlds/<id>.ts`: palette, backdrop, ink, costume,
critter, build, confetti), the kit's ink and colour table, the complete
points-of-interest code, and a precise per-file brief; the implementer writes
the drawing code against the tests and looks at renders. Every other task in
this plan has complete code, proven: Tasks 1–4 were applied from this text to
a clean checkout and pass the typecheck and the full suite after each task,
and Task 10's registry changes were run with all fifteen worlds registered.

**Decisions where the spec meets the code:**

1. **Two ids differ from the spec: `dunes` (Dust Outpost) and `meadhall`
   (Longhall).** The room planner (`arrangement()` in `src/world/layout.ts`)
   is seeded by the world's id, and the spec's `dust` and `longhall` seed
   layouts that break its own invariants: `dust` puts its three islands
   nearly in a line in an 80x40 room and too near the hub in a 1000x500 one,
   `longhall` too near the hub in a 1000x500 one (`test/layout.test.ts`:
   "the crowd is drawn out…" and "in big rooms the islands stand well
   out…"). Changing the planner would move every existing world's furniture,
   which the spec rules out. `dunes` and `meadhall` pass every layout, room
   and stage test with all fifteen registered; `starfall`, `shelter` and
   `colony` are kept. The names, taglines and everything shown are unchanged;
   the screenshots are `docs/screenshots/dunes.png` and
   `docs/screenshots/meadhall.png`.
2. **The ★2 hats come with the costume values (Task 1); the outfits and ★8
   colours follow (Task 2).** `PRIZES` and `LEVEL_HAT` are
   `Record<Costume, …>`, so the type checker needs a costume's hat and hat
   height in the same change as the costume.
3. **The registry changes in Task 10, after review, not in the groundwork.**
   Registering first would put five placeholder worlds in the picker and in
   CI; instead Task 4 lets a world task render its world from its module file
   (`node scripts/scene-shot.ts src/worlds/<id>.ts out.png`) and the contract
   test checks it through `ANIMUS_THEME_FILE`. Registering fifteen also breaks
   `test/world.test.ts` ("t / T / digits switch themes" presses the key `15`);
   Task 10 fixes it: digits reach the first ten, as the spec says.
4. **Every world has `warm`, `view`, `dance` and `pet` spots**
   (`test/room.test.ts`). Worlds with no fire get their warm spots by
   something warm: the outpost's teapot, the base's refiner, the shelter's
   valve radio.
5. **Starfall's pilot's chair** is an island prop, drawn front toward the
   viewer like every prop; "facing the glass" is drawn as the chair turned
   toward the back wall (we see its high back), the glass bays behind it.
6. **Wall pieces are the shell's**: the skull and lanterns, shields, banners,
   antlers and herbs, screens and vents, tubes, pipes and fuse boxes, tool
   boards and maps are drawn by each room's shell between the stations, like
   the café's windows and hearth; free-standing pieces are `decor`.

**The trademark rule (the spec's), for every task, file, comment, commit and
picture:** no game names, no logos, no emblems, no iconic trademarked shapes.
In particular: no numbers anywhere on the jumpsuit (front or back), no horned
helmets, no round cog-shaped door (the shelter's blast door is rectangular
with a hand-wheel), no cartoon mascot, no wrist computer, no rocket-shaped
bottles, no readable text or digits in any picture (screens and ledgers show
glyph-like marks and lines), shields and banners in plain colours and simple
knot or band patterns only.

**Environment.** Work in `<repo>` on branch
`worlds-games`. Node is `/usr/bin/node`; there is no `npx` or `npm` on the
PATH.

- Typecheck: `node node_modules/typescript/bin/tsc --noEmit -p .` (no output when clean)
- All tests: `node --test "test/**/*.test.ts"` (1015 pass before Task 1)
- One file: `node --test test/figure.test.ts`
- Timing budgets in the art tests can flake on a busy machine (seen once
  while writing this plan: `hell room: … entrance a frame: 1.03 ms, over the
  1 ms budget`); rerun that file before chasing it.
- Scratch space for renders: `SCRATCH=$SCRATCH` (export it in every shell that runs a step that uses it)

**Commits.** Every commit message ends with exactly these two lines (the
commit steps below include them):

```
Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
```

## File structure

| file | task | responsibility |
| --- | --- | --- |
| `src/world/character.ts` | 1 | the `Costume` type gains `drifter`, `nord`, `exosuit`, `jumpsuit`, `colonist` |
| `src/art/figure/look.ts` | 1, 2 | the ★2 `Prize` per costume (1); the game worlds' cloth colours, each costume's look and its ★8 colours (2) |
| `src/art/figure/head.ts` | 1, 2 | the five ★2 hats (1); a nord's braids (2) |
| `src/world/frame.ts` | 1 | how high each new hat reaches (`LEVEL_HAT`, read by `figureTop`) |
| `src/art/figure/body.ts` | 2 | boots, skirts, the outfits' details, scarf, cloak, mantle, chest light, cuffs, ghost accents |
| `src/worlds/types.ts` | 3 | `CritterKind` gains `beetle`, `hopper`, `husky` |
| `src/world/critter.ts` | 3 | their walking speeds |
| `src/art/figure/critters.ts` | 3 | their drawings |
| `scripts/scene-shot.ts` | 4 | renders a world by id or by module file (`loadWorld`) |
| `test/figure.test.ts`, `test/themes.test.ts`, `test/scene.test.ts` | 1–4 | the groundwork's tests |
| `src/worlds/<id>.ts` | 5–9 | each world's `WorldDef` (complete code below) |
| `src/worlds/<id>/kit.ts` | 5–9 | its ink, colours and drawing kit (a copy of the vault's kit) |
| `src/worlds/<id>/bits.ts` | 5–9 | small things drawn in several pieces (optional) |
| `src/worlds/<id>/room.ts` | 5–9 | the plan of its wall pieces (`planFor`), the shell, the overlay, its points of interest |
| `src/worlds/<id>/stations.ts` | 5–9 | the eight station props (`STATIONS`) |
| `src/worlds/<id>/decor.ts` | 5–9 | free-standing furniture (`DECOR`, `DECOR_ART`) |
| `test/<id>.test.ts` | 5–9 | each world's art test (complete code below) |
| `src/worlds/index.ts` | 10 | the registry: fifteen worlds |
| `test/themes.test.ts`, `test/world.test.ts` | 10 | the registry test; digits reach the first ten |
| `README.md` | 4, 12 | scene-shot's world argument (4); the gallery, keys and ★2 hats for fifteen worlds (12) |
| `docs/screenshots/<id>.png` | 12 | five new gallery screenshots, 715x410 |

## Tool: contact sheets (scratch, not in the repo)

Tasks 1–3 look at the new costumes and critters on contact sheets: every
species, front and back, plain, with the ★2 hat, in ★8 colours and both; a
row of poses; the critters idling and moving.

Create `$SCRATCH/tools/sheet.ts`:

```ts
// Contact sheets: each costume on every species, front and back, plain,
// with its level's hat (★2), in its other colours (★8) and both; and the
// critters idling and on the move (each a row idle, a row moving; the last
// two frames flipped). Usage:
//   node sheet.ts <src dir> <out dir> [costume,costume,…] [s] [critter,critter,…]
import { writeFileSync } from 'node:fs';
const SRC = process.argv[2];
const OUT = process.argv[3];
const { figureSprite, critterSprite } = await import(`${SRC}/art/figure.ts`);
const { Canvas } = await import(`${SRC}/art/canvas.ts`);
const { encodeRgb } = await import(`${SRC}/art/png.ts`);
const { traitsFor } = await import(`${SRC}/world/character.ts`);
const INK = '#2b2233';
const S = Number(process.argv[5] ?? 7);
const SPECIES = ['human', 'robot', 'cat', 'alien', 'ghost'];
const ids = new Map<string, string[]>();
for (let i = 0; i < 3000; i++) {
  const t = traitsFor(`agent-${i}`, 'sub');
  const l = ids.get(t.species) ?? [];
  if (l.length < 8) l.push(`agent-${i}`);
  ids.set(t.species, l);
}
const who = (sp: string, n = 0) => traitsFor(ids.get(sp)![n], n % 3 === 0 ? 'lead' : 'sub');
const fig = (tr: unknown, costume: string, pose: string, o: Record<string, unknown> = {}) => ({ id: 'x', x: 0, y: 0, z: 0, traits: tr, costume, pose, poseT: 0.3, phase: 0.2, facing: { back: false, flip: false }, selected: false, hurt: false, sleeping: false, walking: false, item: [90, 170, 230], ...o });
const NONE = { hat: false, badge: false, outfit: false, aura: false };
const VARIANTS: Array<[string, object]> = [['plain', NONE], ['hat', { ...NONE, hat: true }], ['outfit', { ...NONE, outfit: true }], ['both', { ...NONE, hat: true, outfit: true }]];
const BG = 0xd9d2c4;
function sheet(costume: string, pose = 'idle'): void {
  const cw = Math.round(17 * S);
  const ch = Math.round(25 * S);
  const cols = VARIANTS.length * 2;
  const c = new Canvas(cols * cw, SPECIES.length * ch);
  c.fillStyle = '#d9d2c4';
  c.fillRect(0, 0, c.width, c.height);
  SPECIES.forEach((sp, r) => {
    let col = 0;
    for (const back of [false, true]) {
      for (const [, wear] of VARIANTS) {
        const spr = figureSprite(fig(who(sp, r % 2 ? 2 : 1), costume, pose, { wear, facing: { back, flip: false } }), S, INK);
        const x = col * cw + Math.round(cw / 2) - spr.ax;
        const y = r * ch + Math.round(ch * 0.9) - spr.ay;
        c.fillStyle = (col + r) % 2 ? '#d2cab9' : '#ddd6c8';
        c.fillRect(col * cw, r * ch, cw, ch);
        c.drawImage(spr.img, x, y);
        col++;
      }
    }
  });
  writeFileSync(`${OUT}/costume-${costume}${pose === 'idle' ? '' : '-' + pose}.png`, encodeRgb(c, BG, 2));
}
const list = (process.argv[4] ?? 'drifter,nord,exosuit,jumpsuit,colonist').split(',');
for (const co of list) sheet(co);
// Poses in action, one row a costume (human, robot, cat, alien, ghost cycling).
{
  const poses = ['walk', 'write', 'read', 'run', 'search', 'web', 'think', 'sit', 'carry', 'cheer', 'dance', 'sleep'];
  const cw = Math.round(17 * S * 0.75);
  const ch = Math.round(25 * S * 0.75);
  const c = new Canvas(poses.length * cw, list.length * ch);
  c.fillStyle = '#d9d2c4';
  c.fillRect(0, 0, c.width, c.height);
  list.forEach((co, r) => poses.forEach((pose, k) => {
    const spr = figureSprite(fig(who(SPECIES[k % 5], 1), co, pose, { sleeping: pose === 'sleep', wear: k % 3 === 0 ? { ...NONE, hat: true } : NONE, facing: { back: k % 4 === 3, flip: k % 2 === 1 } }), S * 0.75, INK);
    c.fillStyle = (k + r) % 2 ? '#d2cab9' : '#ddd6c8';
    c.fillRect(k * cw, r * ch, cw, ch);
    c.drawImage(spr.img, k * cw + Math.round(cw / 2) - spr.ax, r * ch + Math.round(ch * 0.85) - spr.ay);
  }));
  writeFileSync(`${OUT}/costume-poses.png`, encodeRgb(c, BG, 2));
}
// Critters, if asked: argv[6] a comma list of kinds.
if (process.argv[6]) {
  const kinds = process.argv[6].split(',');
  const bodies: Record<string, number[]> = { beetle: [196, 120, 62], hopper: [178, 132, 236], husky: [138, 146, 158], cat: [232, 145, 58], fox: [226, 120, 48], rat: [150, 140, 130] };
  const cs = S * 1.6;
  const cw = Math.round(13 * cs);
  const ch = Math.round(11 * cs);
  const frames = 8;
  const c = new Canvas(frames * cw, kinds.length * 2 * ch);
  c.fillStyle = '#d9d2c4';
  c.fillRect(0, 0, c.width, c.height);
  kinds.forEach((kind, r) => {
    for (const moving of [false, true]) {
      for (let i = 0; i < frames; i++) {
        const cr = { kind, body: bodies[kind] ?? [200, 120, 80], x: 0, y: 0, z: 0, flip: i >= 6, moving };
        const t = moving ? i * 0.05 + 0.01 : i * 0.3 + 0.01;
        const spr = critterSprite(cr, t, cs, INK);
        const row = r * 2 + (moving ? 1 : 0);
        c.fillStyle = (i + row) % 2 ? '#d2cab9' : '#ddd6c8';
        c.fillRect(i * cw, row * ch, cw, ch);
        c.drawImage(spr.img, i * cw + Math.round(cw / 2) - spr.ax, row * ch + Math.round(ch * 0.85) - spr.ay);
      }
    }
  });
  writeFileSync(`${OUT}/critters.png`, encodeRgb(c, BG, 2));
}
console.log('ok');
```

Part A tasks run `node "$SCRATCH/tools/sheet.ts" "$PWD/src" "$SCRATCH/sheets" <costumes> <s> [critters]`
and look at the PNGs it writes with the Read tool.

## Part A: groundwork (shared code, complete, test-first)


### Task 1: Five costume values, each with its ★2 hat

The type checker ties these together: `PRIZES` (look.ts) and `LEVEL_HAT`
(frame.ts) are `Record<Costume, …>`, so a new costume needs its hat and its
hat height in the same change. Until Task 2 the five new costumes are drawn
in `lookOf`'s default branch (the café's everyday clothes); the hats sit on
the head, whose height does not depend on the outfit, so the heights
recorded here stay right after Task 2.

**Files:**
- Modify: `src/world/character.ts` (the `Costume` type and its comment)
- Modify: `src/art/figure/look.ts` (`Prize`, `PRIZES`)
- Modify: `src/art/figure/head.ts` (`prizeHat`: five new cases after `cap`)
- Modify: `src/world/frame.ts` (`LEVEL_HAT`)
- Test: `test/figure.test.ts`, `test/themes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add the five costumes to the figure tests' costume list (every loop over
`COSTUMES` now covers them: sane sprites in every pose and facing, face
states, every unlock, the hat-height check, the outfit swap), let the two
timing tests cycle through all of them, add a test naming each new hat, and
let the contract test accept the new costumes.

In `test/figure.test.ts`, replace:

```ts
const SPECIES: Species[] = ['human', 'robot', 'cat', 'alien', 'ghost'];
const COSTUMES: Costume[] = ['casual', 'wizard', 'scientist', 'raver', 'hacker', 'astronaut'];
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];
```

with:

```ts
const SPECIES: Species[] = ['human', 'robot', 'cat', 'alien', 'ghost'];
const COSTUMES: Costume[] = ['casual', 'wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'];
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];
```

In `test/figure.test.ts`, replace:

```ts
  const tr = [who('human', 1), who('robot', 1), who('cat', 2), who('alien', 1), who('ghost', 1)];
  for (let i = 0; i < 20; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i }), 4, INK);
  clearSprites();
```

with:

```ts
  const tr = [who('human', 1), who('robot', 1), who('cat', 2), who('alien', 1), who('ghost', 1)];
  for (let i = 0; i < 20; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i }), 4, INK);
  clearSprites();
```

In `test/figure.test.ts`, replace:

```ts
  const n = 120;
  for (let i = 0; i < n; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13 }), 4, INK);
  const ms = (performance.now() - t0) / n;
```

with:

```ts
  const n = 120;
  for (let i = 0; i < n; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i * 0.13 }), 4, INK);
  const ms = (performance.now() - t0) / n;
```

In `test/figure.test.ts`, replace:

```ts
test('the hat takes the place of a lamp, a beret or a hood; a headset stays under it', () => {
```

with:

```ts
test("the game worlds' hats: a straw hat, an iron helm, a helmet with a fin, a flat cap and a rancher's hat", () => {
  assert.deepEqual(
    (['drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'] as Costume[]).map((co) => PRIZES[co]),
    ['straw', 'helm', 'visor', 'flatcap', 'rancher'],
  );
});

test('the hat takes the place of a lamp, a beret or a hood; a headset stays under it', () => {
```

In `test/figure.test.ts`, replace:

```ts
      if (i === 0) clearSprites();
      figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13, ...all }), 4, INK);
    },
```

with:

```ts
      if (i === 0) clearSprites();
      figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i * 0.13, ...all }), 4, INK);
    },
```

In `test/figure.test.ts`, replace:

```ts
    const t = performance.now();
    for (let i = 0; i < 24; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % 6], POSES[i % 24], { poseT: i * 0.13, ...o }), 16, INK);
    return performance.now() - t;
```

with:

```ts
    const t = performance.now();
    for (let i = 0; i < 24; i++) figureSprite(fig(tr[i % 5], COSTUMES[i % COSTUMES.length], POSES[i % 24], { poseT: i * 0.13, ...o }), 16, INK);
    return performance.now() - t;
```

In `test/themes.test.ts`, replace:

```ts
const KINDS: SlotKind[] = ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write'];
const COSTUMES = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual'];
const CRITTERS = ['cat', 'rat', 'drone', 'slime', 'fox', 'imp'];
```

with:

```ts
const KINDS: SlotKind[] = ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write'];
const COSTUMES = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'];
const CRITTERS = ['cat', 'rat', 'drone', 'slime', 'fox', 'imp'];
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/figure.test.ts test/themes.test.ts`

Expected: FAIL, 3 of 54 tests:
`the game worlds' hats: …` (`Expected values to be strictly deep-equal`),
`each world's costume has its own hat, …` (`drifter: the undefined shows`) and
`cosmetics: every costume and species wears each unlock, …`
(`human/drifter/idle/hat: shows`).

- [ ] **Step 3: Add the costume values**

In `src/world/character.ts`, replace:

```ts
// lab coats in the lab, party outfits in the club, hoodies in the den,
// space suits on the station, everyday clothes in the café.
export type Costume = 'wizard' | 'scientist' | 'raver' | 'hacker' | 'astronaut' | 'casual';
export type Species = 'human' | 'robot' | 'cat' | 'alien' | 'ghost';
```

with:

```ts
// lab coats in the lab, party outfits in the club, hoodies in the den,
// space suits on the station, everyday clothes in the café; a scarf and a
// long coat at the dust outpost, a fur cloak in the longhall, a bright
// exosuit at the starfall base, a blue jumpsuit in the shelter and a work
// jacket in the frontier colony.
export type Costume = 'wizard' | 'scientist' | 'raver' | 'hacker' | 'astronaut' | 'casual' | 'drifter' | 'nord' | 'exosuit' | 'jumpsuit' | 'colonist';
export type Species = 'human' | 'robot' | 'cat' | 'alien' | 'ghost';
```

- [ ] **Step 4: Name each costume's hat**

In `src/art/figure/look.ts`, replace:

```ts
// club, a cap worn backwards in the den, an antenna on a space helmet, a
// grander hat for a wizard.
export type Prize = 'beanie' | 'mortarboard' | 'party' | 'cap' | 'antenna' | 'grand';
export const PRIZES: Record<Costume, Prize> = { casual: 'beanie', scientist: 'mortarboard', raver: 'party', hacker: 'cap', astronaut: 'antenna', wizard: 'grand' };
export const GOLD = '#f5c542';
```

with:

```ts
// club, a cap worn backwards in the den, an antenna on a space helmet, a
// grander hat for a wizard; a wide straw hat with a drifter's coat, an
// iron helm with a nose guard (no horns) over a fur cloak, a helmet with
// its visor up and a fin over an exosuit, a flat cap with a jumpsuit and a
// wide-brimmed rancher's hat with a work jacket.
export type Prize = 'beanie' | 'mortarboard' | 'party' | 'cap' | 'antenna' | 'grand' | 'straw' | 'helm' | 'visor' | 'flatcap' | 'rancher';
export const PRIZES: Record<Costume, Prize> = {
  casual: 'beanie',
  scientist: 'mortarboard',
  raver: 'party',
  hacker: 'cap',
  astronaut: 'antenna',
  wizard: 'grand',
  drifter: 'straw',
  nord: 'helm',
  exosuit: 'visor',
  jumpsuit: 'flatcap',
  colonist: 'rancher',
};
export const GOLD = '#f5c542';
```

- [ ] **Step 5: Draw the five hats**

Each in the head frame (origin at the head's centre, x toward the face,
y down; `sx` is the crown's centre, a little toward the face; `F` the face's
centre line), in the same two-pass outlined style as the beanie and the cap:
a wide straw hat with a band in the character's colour and woven rings on the
brim; a pointed iron helm with a ridge, a riveted brow band and a nose guard
(front only; no horns); a white helmet open at the face with its tinted visor
raised over the brow, a swept-back fin and an ear piece in the character's
colour (from behind: the shell, the fin edge-on and a band); a puffy tweed
flat cap in a muted shade of the character's colour with its peak over the
brow and a herringbone weave; a brown felt rancher's hat with a pinched crown,
a crease, a band in the character's colour and a brim curled up at the sides.

In `src/art/figure/head.ts`, replace:

```ts
      return;
    }
  }
```

with:

```ts
      return;
    }
    case 'straw': {
      // a wide brim, a round crown and a band in its colour
      const straw = '#e2c27c';
      const strawD = '#b8955a';
      const brim = ell(sx, -2.3, 5.45, 1.3, -0.05);
      sk.blob(brim, straw, { dark: strawD, d: 0.35 });
      sk.draw((p, k) => {
        if (k.px < 5) return;
        // the weave: rings round the brim
        p.strokeStyle = alpha(k.ink, 0.28);
        p.lineWidth = k.line * 0.7;
        for (const [rx, ry] of [[4.6, 1.02], [3.75, 0.78]] as const) {
          p.beginPath();
          p.ellipse(sx, -2.3, rx, ry, -0.05, Math.PI * 0.05, Math.PI * 0.95);
          p.stroke();
        }
      });
      const crown = (p: Pen) => {
        p.moveTo(-2.65, -2.4);
        p.quadraticCurveTo(-2.85, -5.25, sx, -5.3);
        p.quadraticCurveTo(2.9, -5.25, 2.75, -2.4);
        p.quadraticCurveTo(sx, -1.95, -2.65, -2.4);
        p.closePath();
      };
      sk.blob(crown, straw, { dark: strawD, d: 0.5 });
      sk.draw((p) => {
        p.save();
        p.beginPath();
        crown(p);
        p.clip();
        p.fillStyle = c;
        p.fillRect(-3.2, -3.25, 6.4, 0.85);
        p.restore();
      });
      return;
    }
    case 'helm': {
      // a pointed iron helm, a riveted brow band and a nose guard
      const iron = '#8e959e';
      const ironD = '#646b75';
      const dome = (p: Pen) => {
        p.moveTo(-3.55, -0.55);
        p.quadraticCurveTo(-3.8, -3.6, -1.2, -4.75);
        p.quadraticCurveTo(sx, -5.5, 1.3, -4.75);
        p.quadraticCurveTo(3.85, -3.6, 3.6, -0.55);
        p.quadraticCurveTo(sx, -1.15, -3.55, -0.55);
        p.closePath();
      };
      sk.blob(dome, iron, { dark: ironD, d: 0.6 });
      sk.draw((p, k) => {
        // the ridge over the top, toward the face (or the nape, from behind)
        p.beginPath();
        p.moveTo(sx, -5.3);
        p.quadraticCurveTo(sx + (back ? -0.6 : 0.6), -3.4, sx + (back ? -0.7 : 0.75), -1.35);
        p.strokeStyle = k.ink;
        p.lineWidth = k.line;
        p.lineCap = 'round';
        p.stroke();
      });
      const band = (p: Pen) => p.roundRect(-3.75, -1.4, 7.5, 1.0, 0.35);
      sk.blob(band, shade(iron, -0.1), { dark: ironD, d: 0.2 });
      sk.draw((p) => {
        p.fillStyle = '#c9ced5';
        for (let x = -3.0; x <= 3.1; x += 1.2) {
          p.beginPath();
          p.arc(x, -0.9, 0.17, 0, TAU);
          p.fill();
        }
      });
      if (!back) sk.blob((p) => p.roundRect(F - 0.27, -1.0, 0.54, 2.35, 0.22), iron, { dark: ironD, d: 0.12 });
      return;
    }
    case 'visor': {
      // a white shell over the top and sides, open at the face, its visor
      // raised over the brow, a swept-back fin and an ear piece in its colour
      const shell = '#eef1f5';
      const shellD = '#bcc5d1';
      if (back) {
        sk.blob((p) => {
          p.moveTo(-3.75, 1.5);
          p.quadraticCurveTo(-4.25, -4.55, -0.1, -4.75);
          p.quadraticCurveTo(4.15, -4.55, 3.75, 1.5);
          p.quadraticCurveTo(0.0, 2.2, -3.75, 1.5);
          p.closePath();
        }, shell, { dark: shellD, d: 0.7 });
        sk.blob((p) => p.roundRect(sx - 0.4, -6.55, 0.8, 2.3, 0.35), c, { dark: cd, d: 0.15 });
        sk.blob((p) => p.roundRect(-3.9, 0.15, 7.8, 0.7, 0.3), c, { dark: cd, d: 0.15 });
        return;
      }
      sk.blob((p) => {
        p.moveTo(-3.85, 1.6);
        p.quadraticCurveTo(-4.35, -4.5, 0.1, -4.75);
        p.quadraticCurveTo(4.3, -4.5, 4.0, -0.35);
        p.quadraticCurveTo(F + 0.6, -2.05, -1.55, -1.15);
        p.quadraticCurveTo(-2.45, 0.2, -2.2, 1.85);
        p.quadraticCurveTo(-3.05, 2.15, -3.85, 1.6);
        p.closePath();
      }, shell, { dark: shellD, d: 0.6 });
      // the visor, raised over the brow: tinted glass with a glint
      sk.blob(ell(F + 0.2, -2.6, 2.95, 0.95, -0.04), '#2c3a56', { line: 0.6 });
      sk.draw((p) => {
        p.beginPath();
        p.ellipse(F - 0.85, -2.85, 1.1, 0.24, -0.1, 0, TAU);
        p.fillStyle = alpha('#9fe8ff', 0.75);
        p.fill();
      });
      // the fin, swept back over the top
      sk.blob((p) => {
        p.moveTo(-2.75, -3.75);
        p.quadraticCurveTo(-2.75, -5.7, -2.05, -6.6);
        p.quadraticCurveTo(-0.35, -5.75, 1.75, -4.55);
        p.quadraticCurveTo(-0.4, -4.95, -2.75, -3.75);
        p.closePath();
      }, c, { dark: cd, d: 0.25 });
      sk.blob(circ(-3.45, 0.55, 0.78), c, { dark: cd, d: 0.15 });
      return;
    }
    case 'flatcap': {
      // a puffy flat cap of tweed in a muted shade of its colour, the peak
      // over the brow
      const tweed = mix(c, '#6f6456', 0.6);
      const tweedD = shade(tweed, -0.24);
      if (!back) sk.blob(ell(F + 2.15, -1.55, 2.0, 0.55, 0.18), shade(tweed, -0.14), { dark: tweedD, d: 0.15 });
      const crown = (p: Pen) => {
        if (back) {
          p.moveTo(-3.6, -1.35);
          p.quadraticCurveTo(-3.9, -4.85, sx, -5.05);
          p.quadraticCurveTo(3.85, -4.85, 3.6, -1.35);
          p.quadraticCurveTo(sx, -1.9, -3.6, -1.35);
        } else {
          p.moveTo(-3.6, -1.4);
          p.quadraticCurveTo(-3.9, -4.6, -0.6, -5.1);
          p.quadraticCurveTo(2.7, -5.2, 4.1, -2.65);
          p.quadraticCurveTo(4.35, -1.95, 3.6, -1.75);
          p.quadraticCurveTo(sx, -2.05, -3.6, -1.4);
        }
        p.closePath();
      };
      sk.blob(crown, tweed, { dark: tweedD, d: 0.5 });
      sk.draw((p, k) => {
        if (k.px < 5) return;
        // a herringbone weave
        p.save();
        p.beginPath();
        crown(p);
        p.clip();
        p.strokeStyle = alpha(k.ink, 0.22);
        p.lineWidth = k.line * 0.6;
        p.beginPath();
        for (let x = -3.4; x < 3.8; x += 0.9) {
          p.moveTo(x, -2.0);
          p.lineTo(x + 0.35, -2.9);
          p.lineTo(x, -3.8);
        }
        p.stroke();
        p.restore();
      });
      sk.blob(circ(back ? sx : -0.5, -5.0, 0.32), tweedD, { line: 0.5 });
      return;
    }
    case 'rancher': {
      // brown felt: a pinched crown with a band in its colour, the brim
      // curled up at the sides
      const felt = '#8b5d3b';
      const feltD = '#674328';
      const brim = (p: Pen) => {
        p.moveTo(-5.25, -3.2);
        p.quadraticCurveTo(-4.4, -2.45, sx, -2.6);
        p.quadraticCurveTo(4.5, -2.45, 5.35, -3.2);
        p.quadraticCurveTo(5.0, -1.55, sx, -1.45);
        p.quadraticCurveTo(-4.9, -1.55, -5.25, -3.2);
        p.closePath();
      };
      sk.blob(brim, shade(felt, -0.06), { dark: feltD, d: 0.3 });
      const crown = (p: Pen) => {
        p.moveTo(-2.45, -2.4);
        p.lineTo(-2.3, -4.95);
        p.quadraticCurveTo(-1.3, -5.75, sx - 0.15, -5.05);
        p.quadraticCurveTo(sx + 1.0, -5.75, 2.4, -4.95);
        p.lineTo(2.6, -2.4);
        p.quadraticCurveTo(sx, -1.95, -2.45, -2.4);
        p.closePath();
      };
      sk.blob(crown, felt, { dark: feltD, d: 0.5 });
      sk.draw((p, k) => {
        p.save();
        p.beginPath();
        crown(p);
        p.clip();
        p.fillStyle = c;
        p.fillRect(-3.0, -3.15, 6.0, 0.8);
        p.restore();
        // the crease down the crown
        p.beginPath();
        p.moveTo(sx - 0.15, -5.0);
        p.quadraticCurveTo(sx + 0.05, -4.3, sx - 0.05, -3.6);
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.8;
        p.lineCap = 'round';
        p.stroke();
      });
      return;
    }
  }
```

- [ ] **Step 6: Record how high each hat reaches**

`figureTop` must be at least as high as any species reaches in the hat,
standing about, walking or at work, at s = 3 and 16, front and back, and the
tallest must come within a unit of it (the hat test checks both). Measured on
this branch (the tallest, rounded up to the next quarter): straw hat, iron
helm, flat cap and rancher's hat 17.33 (17.5), the finned helmet 18.67
(18.75).

In `src/world/frame.ts`, replace:

```ts
const WIZARD_HAT = 19.25;
const LEVEL_HAT: Record<Costume, number> = { casual: 18.25, scientist: 17.5, raver: 21.75, hacker: 17.5, astronaut: 20.75, wizard: 20.75 };
```

with:

```ts
const WIZARD_HAT = 19.25;
const LEVEL_HAT: Record<Costume, number> = {
  casual: 18.25,
  scientist: 17.5,
  raver: 21.75,
  hacker: 17.5,
  astronaut: 20.75,
  wizard: 20.75,
  drifter: 17.5,
  nord: 17.5,
  exosuit: 18.75,
  jumpsuit: 17.5,
  colonist: 17.5,
};
```

- [ ] **Step 7: Run the tests to see them pass**

Run: `node --test test/figure.test.ts test/themes.test.ts`
Expected: PASS: `ℹ tests 54`, `ℹ pass 54`, `ℹ fail 0`.

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

Run: `node --test "test/**/*.test.ts"`
Expected: `ℹ tests 1016`, `ℹ pass 1016`, `ℹ fail 0`.

- [ ] **Step 8: Look at the hats**

Run: `mkdir -p "$SCRATCH/sheets" && node "$SCRATCH/tools/sheet.ts" "$PWD/src" "$SCRATCH/sheets" drifter,nord,exosuit,jumpsuit,colonist 7`
Expected: `ok`; then open `$SCRATCH/sheets/costume-<costume>.png` for each of
the five with the Read tool (rows: human, robot, cat, alien, ghost; columns:
front plain, ★2, ★8, ★2+★8, then the same from behind). Each hat must read
at a glance as itself, sit on the head (not float, not cut off), show the
character's colour (band, fin, ear piece or tweed), and carry no logo, number,
letter, emblem or horn.

- [ ] **Step 9: Commit**

```bash
git add src/world/character.ts src/art/figure/look.ts src/art/figure/head.ts src/world/frame.ts test/figure.test.ts test/themes.test.ts
git commit -F - <<'EOF'
feat(figure): five game-world costumes with their level hats

drifter, nord, exosuit, jumpsuit and colonist join the costumes; at
★2 each wears its own hat: a straw hat, an iron helm with a nose guard, a
helmet with a fin and its visor up, a flat cap and a rancher's hat.
figureTop knows how high each reaches.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 2: The five outfits on every species, and their ★8 colours

**Files:**
- Modify: `src/art/figure/look.ts` (the game worlds' cloth colours, five `lookOf` cases, the ★8 swap)
- Modify: `src/art/figure/body.ts` (boots, coat and tunic skirts, the outfits' details, the scarf, cloak, mantle and chest light, cuffs, ghost accents)
- Modify: `src/art/figure/head.ts` (a nord's braids)
- Test: `test/figure.test.ts`

What each wears (all five species; a ghost keeps its sheet and gets the
costume's accents):

| costume | main garment | details | legs and feet | ★8 |
| --- | --- | --- | --- | --- |
| drifter | a long sand-coloured coat, open over the shirt | a wrapped scarf in the trim colour, one striped, fringed end hanging; a cloth sash | dark trousers, boots | the coat tinted 45 % toward the new hue |
| nord | a tunic in a homespun shade of the shirt colour, skirted to mid-thigh | a fur cloak (edges at the sides from the front, the whole back from behind), a fur mantle round the shoulders, a leather belt with a plain square buckle, leather cuffs; humans wear two braids tied in the trim colour | wool trousers, fur-topped boots | the tunic in a homespun shade of the new hue |
| exosuit | a bright suit: the shirt colour lit toward the character's own colour | white shoulder panels, a round cyan chest light with a soft glow (front), a dark spine strip (back), white cuffs, dark gloves, a dark belt with a cyan dot | white legs with knee pads in the suit colour, dark boots | the suit in the new hue (legs stay white: two-tone) |
| jumpsuit | one blue piece | a plain yellow stripe down the front and a yellow collar, a belt with a plain buckle; **no number, no logo, front or back** | the same blue, dark boots | blue tinted half toward the new hue, legs too |
| colonist | a canvas work jacket in an earthy shade of the shirt colour, open over a cream shirt | collar points, two chest pockets, a utility belt with two pouches (one at the back) | work trousers, boots | the jacket in an earthy shade of the new hue |

- [ ] **Step 1: Write the failing tests**

Each new costume must look unlike every other costume on every species, front
and back; each outfit must show its signature cloth (sand, fur, white panels,
the yellow stripe, the cream shirt); a jumpsuit must be the same blue on
everyone, its legs following the top at ★8. The existing outfit-swap test
already loops over the new costumes.

In `test/figure.test.ts`, replace:

```ts
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, trinketSprite, type Sprite } from '../src/art/figure.ts';
import { GOLD, PRIZES, lookOf } from '../src/art/figure/look.ts';
import { blinkAt, frameOf, LOOP } from '../src/art/figure/rig.ts';
```

with:

```ts
import { clearSprites, critterSprite, emoteSprite, figureSprite, spriteCount, spriteStats, trinketSprite, type Sprite } from '../src/art/figure.ts';
import { FUR, GOLD, PANEL, PRIZES, SAND, SHIRT, STRIPE, SUIT_BLUE, lookOf } from '../src/art/figure/look.ts';
import { blinkAt, frameOf, LOOP } from '../src/art/figure/rig.ts';
```

In `test/figure.test.ts`, replace:

```ts
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];
```

with:

```ts
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];
// The game worlds' costumes: the outpost, the longhall, the base, the
// shelter and the colony.
const GAME: Costume[] = ['drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'];
```

In `test/figure.test.ts`, replace:

```ts
test('the outfit swap puts the main garment in the trim\'s hue and the old colour in the trim', () => {
```

with:

```ts
test("the game worlds' costumes dress every species in clothes of their own, front and back", () => {
  for (const sp of SPECIES) {
    for (const back of [false, true]) {
      const looks = new Map(COSTUMES.map((co) => [co, hash(figureSprite(fig(who(sp, 1), co, 'idle', { facing: { back, flip: false } }), 6, INK))]));
      for (const co of GAME) {
        for (const other of COSTUMES) if (other !== co) assert.notEqual(looks.get(co), looks.get(other), `${sp}${back ? ' from behind' : ''}: ${co} looks like ${other}`);
      }
    }
  }
});

test('each outfit shows what it is made of: a sand coat, fur, white panels, a yellow stripe, a cream shirt under a jacket', () => {
  const s = 8;
  const marks: ReadonlyArray<readonly [Costume, string]> = [['drifter', SAND], ['nord', FUR], ['exosuit', PANEL], ['jumpsuit', STRIPE], ['colonist', SHIRT]];
  for (const [co, color] of marks) {
    for (const sp of ['human', 'robot', 'cat', 'alien'] as Species[]) {
      const spr = figureSprite(fig(who(sp, 1), co, 'idle'), s, INK);
      assert.ok(pixelsOf(spr, color) > 2 * s, `${sp} ${co}: ${pixelsOf(spr, color)} pixels of ${color}`);
    }
  }
});

test('a jumpsuit is one blue piece on everyone; at ★8 the legs take its new colour too', () => {
  for (const n of [0, 1, 2]) {
    const was = lookOf(who('human', n), 'jumpsuit');
    assert.deepEqual([was.top, was.legs], [SUIT_BLUE, SUIT_BLUE]);
    const now = lookOf(who('human', n), 'jumpsuit', WEARS[2][1]);
    assert.notEqual(now.top, SUIT_BLUE);
    assert.equal(now.legs, now.top);
  }
});

test('the outfit swap puts the main garment in the trim\'s hue and the old colour in the trim', () => {
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/figure.test.ts test/themes.test.ts`
Expected: FAIL: `test/figure.test.ts` does not load:
`SyntaxError: The requested module '../src/art/figure/look.ts' does not provide an export named 'FUR'`.

- [ ] **Step 3: The colours: cloth, the five looks and their ★8 swap**

In `src/art/figure/look.ts`, replace:

```ts
export const WHITE = '#ffffff';
```

with:

```ts
export const WHITE = '#ffffff';
// The game worlds' cloth: a drifter's sand coat, the homespun a tunic is
// dyed over, a jumpsuit's blue and its stripe, a work jacket's canvas, an
// exosuit's white panels.
export const SAND = '#c9a874';
export const HOMESPUN = '#5e4b3a';
export const SUIT_BLUE = '#2f6fb8';
export const STRIPE = '#f2c230';
export const CANVAS = '#6f5b3e';
export const PANEL = '#eef1f5';
export const FUR = '#a08a6c';
export const FUR_D = '#7d6a52';
export const CLOAK = '#6e5a47';
export const CLOAK_D = '#54443a';
export const SHIRT = '#efe4cc';
```

In `src/art/figure/look.ts`, replace:

```ts
      break;
    default:
```

with:

```ts
      break;
    case 'drifter':
      // a long sand-coloured coat open over its shirt, dark trousers and
      // boots; the scarf (in its trim) is drawn on, see body.ts
      L.top = SAND;
      L.topD = dk(SAND);
      L.sleeve = 'long';
      L.legs = '#5b4a3a';
      L.legsD = '#46382b';
      L.shoe = '#6e4b2e';
      L.shoeD = '#553820';
      L.sole = '#3a2a1e';
      break;
    case 'nord': {
      // a tunic in a homespun shade of its colour, wool trousers, fur-topped
      // boots; the fur cloak and the braids are drawn on, see body.ts and
      // head.ts
      const tunic = mix(shirt, HOMESPUN, 0.25);
      L.top = tunic;
      L.topD = dk(tunic);
      L.sleeve = 'long';
      L.legs = '#4b4038';
      L.legsD = '#3a312b';
      L.shoe = '#7a5f45';
      L.shoeD = '#5f4833';
      L.sole = '#3e3127';
      break;
    }
    case 'exosuit': {
      // bright two-tone: its colour, lit up, over white legs and panels,
      // dark gloves and boots
      const suit = mix(shirt, color, 0.55);
      L.top = suit;
      L.topD = dk(suit);
      L.sleeve = 'long';
      L.legs = PANEL;
      L.legsD = '#c3ccd8';
      L.shoe = '#4b5363';
      L.shoeD = '#383f4c';
      L.sole = PANEL;
      L.hand = '#3d4554';
      L.handD = '#2c323e';
      break;
    }
    case 'jumpsuit':
      // one piece in blue (a plain yellow stripe is drawn on: no number, no
      // logo), dark boots
      L.top = SUIT_BLUE;
      L.topD = dk(SUIT_BLUE);
      L.legs = L.top;
      L.legsD = L.topD;
      L.sleeve = 'long';
      L.shoe = '#3b3640';
      L.shoeD = '#2c2830';
      L.sole = '#6b6470';
      break;
    case 'colonist': {
      // a canvas work jacket in an earthy shade of its colour over a cream
      // shirt, work trousers and boots
      const jacket = mix(shirt, CANVAS, 0.5);
      L.top = jacket;
      L.topD = dk(jacket);
      L.under = SHIRT;
      L.sleeve = 'long';
      L.legs = '#5a5244';
      L.legsD = '#463f34';
      L.shoe = '#6b4a30';
      L.shoeD = '#52381f';
      L.sole = '#3a2a1e';
      break;
    }
    default:
```

In `src/art/figure/look.ts`, replace:

```ts
    } else {
      L.top = costume === 'scientist' || costume === 'astronaut' ? mix(L.top, alt, 0.5) : alt;
      L.topD = dk(L.top);
```

with:

```ts
    } else {
      // A white coat or suit, a sand coat and a blue jumpsuit are tinted
      // with it; a tunic and a work jacket keep their homespun and canvas.
      if (costume === 'scientist' || costume === 'astronaut' || costume === 'jumpsuit') L.top = mix(L.top, alt, 0.5);
      else if (costume === 'drifter') L.top = mix(SAND, alt, 0.45);
      else if (costume === 'nord') L.top = mix(alt, HOMESPUN, 0.25);
      else if (costume === 'colonist') L.top = mix(alt, CANVAS, 0.5);
      else L.top = alt;
      L.topD = dk(L.top);
```

In `src/art/figure/look.ts`, replace:

```ts
      L.trimD = dk(shirt);
      if (costume === 'astronaut') {
        L.legs = L.top;
```

with:

```ts
      L.trimD = dk(shirt);
      if (costume === 'astronaut' || costume === 'jumpsuit') {
        L.legs = L.top;
```

- [ ] **Step 4: Draw the outfits**

The scarf and the mantle are parts of their own over the torso (z 6.9, under
the head and the near arm, like the space suit's collar); the cloak goes
behind the body from the front (z 0) and over the back from behind (z 5.8,
under a cat's tail); the chest light's glow is drawn over the suit (z 5.3).
Boots run up the shin from 42 % of the way below the knee. Details on the
torso are clipped to it (see `dress`); the three costumes with details on the
front of the torso give a ghost's sheet the same details.

In `src/art/figure/body.ts`, replace:

```ts
import { drawHead, hairBehind, star } from './head.ts';
import { GOLD, WHITE, type Look } from './look.ts';
import { apply, move, mul, turn, type Mat, type Sketch } from './paint.ts';
```

with:

```ts
import { drawHead, hairBehind, star } from './head.ts';
import { CLOAK, CLOAK_D, FUR, FUR_D, GOLD, PANEL, STRIPE, WHITE, type Look } from './look.ts';
import { apply, move, mul, turn, type Mat, type Sketch } from './paint.ts';
```

In `src/art/figure/body.ts`, replace:

```ts
const lerp = (p: V, q: V, k: number): V => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
```

with:

```ts
const lerp = (p: V, q: V, k: number): V => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];

// The game worlds' costumes wear boots.
const BOOTS: ReadonlySet<string> = new Set(['drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist']);
```

In `src/art/figure/body.ts`, replace:

```ts
  if (L.costume === 'hacker' && !L.hoodUp) add(back ? 6 : 0, () => hoodDown(sk, L, top, back));
  if (L.sp === 'cat') add(back ? 6 : 0, () => tail(sk, L, r.t));
```

with:

```ts
  if (L.costume === 'hacker' && !L.hoodUp) add(back ? 6 : 0, () => hoodDown(sk, L, top, back));
  if (L.costume === 'drifter') add(6.9, () => scarf(sk, L, top, back));
  if (L.costume === 'nord') {
    add(back ? 5.8 : 0, () => cloak(sk, r, top, floorY, back, sitting));
    add(6.9, () => mantle(sk, top, back));
  }
  if (L.costume === 'exosuit' && !back) add(5.3, () => chestGlow(sk, top));
  if (L.sp === 'cat') add(back ? 6 : 0, () => tail(sk, L, r.t));
```

In `src/art/figure/body.ts`, replace:

```ts
  sk.limb([g.hip[0], g.hip[1], g.kn[0], g.kn[1], g.ft[0], g.ft[1]], robe && sitting ? 1.85 : w, c, { dark: cd });
  if (L.costume === 'raver' && !back) {
```

with:

```ts
  sk.limb([g.hip[0], g.hip[1], g.kn[0], g.kn[1], g.ft[0], g.ft[1]], robe && sitting ? 1.85 : w, c, { dark: cd });
  if (BOOTS.has(L.costume)) {
    // a boot up the shin, fur-topped on a nord; a knee pad on an exosuit
    const b0 = lerp(g.kn, g.ft, 0.42);
    sk.limb([b0[0], b0[1], g.ft[0], g.ft[1]], w + 0.12, L.shoe, { dark: L.shoeD });
    if (L.costume === 'nord') sk.limb([b0[0], b0[1] - 0.12, b0[0], b0[1] + 0.12], w + 0.5, FUR, { dark: FUR_D });
    if (L.costume === 'exosuit') sk.blob((p) => p.arc(g.kn[0] + 0.12, g.kn[1], 0.62, 0, TAU), L.top, { dark: L.topD, d: 0.15 });
  }
  if (L.costume === 'raver' && !back) {
```

In `src/art/figure/body.ts`, replace:

```ts
  }
  if (L.costume === 'scientist') {
    const hem = sitting ? 0.9 : Math.min(floorY - 1.4, 1.95);
    const coat = (p: Pen) => path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.55, hem], [cx - 2.45, hem]], 0.45);
```

with:

```ts
  }
  if (L.costume === 'scientist' || L.costume === 'drifter') {
    // a lab coat to the knee; a drifter's coat longer
    const long = L.costume === 'drifter';
    const hem = sitting ? (long ? 1.2 : 0.9) : Math.min(floorY - (long ? 0.8 : 1.4), long ? 2.65 : 1.95);
    const coat = (p: Pen) => path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.55, hem], [cx - 2.45, hem]], 0.45);
```

In `src/art/figure/body.ts`, replace:

```ts
      p.stroke();
    });
    return;
```

with:

```ts
      p.stroke();
    });
    return;
  }
  if (L.costume === 'nord') {
    // the tunic's skirt to mid-thigh over the trousers
    const hem = sitting ? 0.55 : 1.1;
    const sw = r.sway * 0.15;
    sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
    sk.blob((p) => path(p, [[cx - 2.2, -1.4], [cx + 2.3, -1.4], [cx + 2.6 + sw, hem], [cx - 2.5 + sw, hem]], 0.45), L.top, { dark: L.topD, d: 0.5 });
    return;
```

In `src/art/figure/body.ts`, replace:

```ts
      return;
    case 'raver':
```

with:

```ts
      return;
    case 'drifter':
      // the coat open over its shirt, belted with a sash
      if (back) {
        p.beginPath();
        p.moveTo(xF, top + 0.3);
        p.lineTo(xF, bot);
        stroke(line * 0.8);
      } else {
        p.beginPath();
        p.moveTo(xF - 0.5, top - 0.2);
        p.lineTo(xF + 0.55, top - 0.2);
        p.lineTo(xF + 0.4, bot + 0.5);
        p.lineTo(xF - 0.35, bot + 0.5);
        p.closePath();
        p.fillStyle = L.under;
        p.fill();
        stroke();
      }
      belt(p, ink, line, '#7a5a3a', back ? null : '#7a5a3a', xF);
      return;
    case 'nord':
      // a leather belt with a plain iron buckle
      belt(p, ink, line, '#5a3d28', back ? null : '#9aa1aa', xF);
      return;
    case 'exosuit':
      // white panels over the shoulders, a dark belt; the chest light glows
      p.beginPath();
      p.moveTo(-4, top - 0.5);
      p.lineTo(4, top - 0.5);
      p.lineTo(4, top + 1.15);
      p.quadraticCurveTo(xF, top + (back ? 1.5 : 1.85), -4, top + 1.15);
      p.closePath();
      p.fillStyle = PANEL;
      p.fill();
      stroke(line * 0.9);
      if (back) {
        p.fillStyle = '#3d4554';
        p.fillRect(xF - 0.35, top + 1.2, 0.7, bot - top - 1.2);
      } else {
        p.beginPath();
        p.arc(xF + 0.05, top + 2.25, 0.62, 0, TAU);
        p.fillStyle = '#3d4554';
        p.fill();
        stroke(line * 0.8);
        p.beginPath();
        p.arc(xF + 0.05, top + 2.25, 0.4, 0, TAU);
        p.fillStyle = '#8ff8ff';
        p.fill();
        p.beginPath();
        p.arc(xF - 0.07, top + 2.12, 0.13, 0, TAU);
        p.fillStyle = WHITE;
        p.fill();
      }
      belt(p, ink, line, '#3d4554', back ? null : '#8ff8ff', xF);
      return;
    case 'jumpsuit':
      // a plain yellow stripe down the front, a yellow collar, a belt
      if (!back) {
        p.fillStyle = STRIPE;
        p.fillRect(xF - 0.32, top - 0.5, 0.64, bot - top + 1);
        p.beginPath();
        for (const dx of [-0.32, 0.32]) {
          p.moveTo(xF + dx, top - 0.5);
          p.lineTo(xF + dx, bot + 0.5);
        }
        stroke(line * 0.8);
      }
      p.beginPath();
      p.ellipse(back ? -0.1 : 0.15, top - 0.05, 1.75, 0.62, 0, 0, Math.PI);
      p.fillStyle = STRIPE;
      p.fill();
      stroke(line * 0.8);
      belt(p, ink, line, '#5a4030', back ? null : '#c9ced5', xF);
      return;
    case 'colonist':
      // the jacket open over a cream shirt, collar points, two chest
      // pockets, a utility belt with pouches
      if (back) {
        p.beginPath();
        p.moveTo(-4, top + 1.3);
        p.quadraticCurveTo(xF, top + 1.6, 4, top + 1.3);
        stroke(line * 0.8);
      } else {
        p.beginPath();
        p.moveTo(xF - 0.75, top - 0.2);
        p.lineTo(xF + 0.75, top - 0.2);
        p.lineTo(xF + 0.2, top + 2.4);
        p.lineTo(xF - 0.2, top + 2.4);
        p.closePath();
        p.fillStyle = L.under;
        p.fill();
        stroke();
        p.fillStyle = shade(L.top, 0.1);
        for (const s of [-1, 1]) {
          p.beginPath();
          p.moveTo(xF + s * 0.75, top - 0.2);
          p.lineTo(xF + s * 1.45, top + 0.95);
          p.lineTo(xF + s * 0.35, top + 0.7);
          p.closePath();
          p.fill();
          stroke(line * 0.8);
        }
        for (const x of [xF - 1.9, xF + 0.95]) {
          p.beginPath();
          p.roundRect(x, top + 1.2, 0.95, 0.85, 0.15);
          stroke(line * 0.8);
          p.beginPath();
          p.moveTo(x, top + 1.5);
          p.lineTo(x + 0.95, top + 1.5);
          stroke(line * 0.7);
        }
      }
      belt(p, ink, line, '#5a3f28', back ? null : '#c9b27a', xF);
      for (const x of back ? [xF - 1.2] : [xF - 1.95, xF + 1.05]) {
        p.beginPath();
        p.roundRect(x, -1.05, 0.9, 1.05, 0.2);
        p.fillStyle = '#7a5a3a';
        p.fill();
        stroke(line * 0.8);
      }
      return;
    case 'raver':
```

In `src/art/figure/body.ts`, replace:

```ts
export function heart(p: Pen, x: number, y: number, r: number): void {
```

with:

```ts
// A belt round the waist (clipped to the torso) and, from the front, its
// buckle: a plain square, no emblem.
function belt(p: Pen, ink: Color, line: number, color: Color, buckle: Color | null, xF: number): void {
  p.fillStyle = color;
  p.fillRect(-4, -0.8, 8, 0.65);
  p.beginPath();
  p.moveTo(-4, -0.8);
  p.lineTo(4, -0.8);
  p.moveTo(-4, -0.15);
  p.lineTo(4, -0.15);
  p.strokeStyle = ink;
  p.lineWidth = line * 0.8;
  p.stroke();
  if (!buckle) return;
  p.beginPath();
  p.roundRect(xF - 0.38, -0.88, 0.76, 0.81, 0.12);
  p.fillStyle = buckle;
  p.fill();
  p.stroke();
}

// A drifter's scarf: wrapped round the neck under the chin, one end
// hanging down the front (or the back), striped, with a fringe.
function scarf(sk: Sketch, L: Look, top: number, back: boolean): void {
  const c = L.trim;
  const cd = L.trimD;
  const x = back ? -0.85 : 1.35;
  const tail = (p: Pen) => p.roundRect(x - 0.5, top + 0.55, 1.0, 2.55, 0.4);
  sk.blob(tail, c, { dark: cd, d: 0.2 });
  sk.draw((p, k) => {
    p.save();
    p.beginPath();
    tail(p);
    p.clip();
    p.fillStyle = shade(c, -0.18);
    for (const y of [top + 2.1, top + 2.55]) p.fillRect(x - 1, y, 2, 0.22);
    p.restore();
    p.strokeStyle = k.ink;
    p.lineWidth = k.line * 0.8;
    p.lineCap = 'round';
    p.beginPath();
    for (const dx of [-0.28, 0, 0.28]) {
      p.moveTo(x + dx, top + 3.1);
      p.lineTo(x + dx, top + 3.5);
    }
    p.stroke();
  });
  sk.blob((p) => p.ellipse(0.15, top + 0.45, 2.45, 0.88, back ? 0.04 : -0.04, 0, TAU), c, { dark: cd, d: 0.3 });
}

// A nord's fur cloak: behind the body seen from the front (its edges show
// at the sides), over the back seen from behind, to the knee.
function cloak(sk: Sketch, r: Rig, top: number, floorY: number, back: boolean, sitting: boolean): void {
  const hem = sitting ? 0.9 : Math.min(floorY - 1.3, 2.3);
  const sw = r.sway * 0.25;
  const shape = (p: Pen) => path(p, [[-2.45, top + 0.2], [2.6, top + 0.2], [3.05 + sw, hem], [-2.95 + sw, hem]], 0.7);
  sk.blob(shape, CLOAK, { dark: CLOAK_D, d: 0.6 });
  sk.draw((p, k) => {
    if (k.px < 4) return;
    // the fur's lie, in a few soft strokes
    p.save();
    p.beginPath();
    shape(p);
    p.clip();
    p.strokeStyle = alpha(k.ink, back ? 0.3 : 0.22);
    p.lineWidth = k.line * 0.7;
    p.lineCap = 'round';
    p.beginPath();
    for (let x = -2.2; x <= 2.6; x += 0.95) {
      p.moveTo(x + sw * 0.3, hem - 0.15);
      p.lineTo(x + sw * 0.2 - 0.1, hem - 1.0);
    }
    p.stroke();
    p.restore();
  });
}

// The fur mantle round a nord's shoulders, its lower edge in tufts.
function mantle(sk: Sketch, top: number, back: boolean): void {
  const cx = back ? 0.0 : 0.15;
  sk.blob((p) => {
    p.moveTo(cx - 2.85, top + 0.35);
    p.quadraticCurveTo(cx - 2.6, top - 0.75, cx, top - 0.8);
    p.quadraticCurveTo(cx + 2.65, top - 0.75, cx + 2.9, top + 0.35);
    const n = 6;
    for (let j = 0; j < n; j++) {
      const xa = cx + 2.9 - (5.75 * (j + 0.5)) / n;
      const xb = cx + 2.9 - (5.75 * (j + 1)) / n;
      p.quadraticCurveTo(xa, top + 1.75 - 0.25 * Math.abs(j - 2.5) / 2.5, xb, top + 1.05 + (j === n - 1 ? -0.7 : 0));
    }
    p.closePath();
  }, FUR, { dark: FUR_D, d: 0.35 });
}

// An exosuit's chest light: a soft cyan glow round it (the light itself is
// on the suit, see dress).
function chestGlow(sk: Sketch, top: number): void {
  sk.draw((p) => {
    const x = 0.65;
    const y = top + 2.25;
    const g = p.createRadialGradient(x, y, 0.3, x, y, 1.7);
    g.addColorStop(0, alpha('#8ff8ff', 0.5));
    g.addColorStop(1, alpha('#8ff8ff', 0));
    p.beginPath();
    p.arc(x, y, 1.7, 0, TAU);
    p.fillStyle = g;
    p.fill();
  });
}

export function heart(p: Pen, x: number, y: number, r: number): void {
```

In `src/art/figure/body.ts`, replace:

```ts
  sk.blob(sheet, L.top, { dark: L.topD, d: 0.7 });
  if (L.costume === 'raver' && !back) {
```

with:

```ts
  sk.blob(sheet, L.top, { dark: L.topD, d: 0.7 });
  if (L.costume === 'exosuit' || L.costume === 'jumpsuit' || L.costume === 'colonist') {
    // a stripe, a chest light, a belt and pouches on the sheet
    const xF = back ? -0.35 : 0.65;
    sk.draw((p, k) => {
      p.save();
      p.beginPath();
      sheet(p);
      p.clip();
      dress(p, k.ink, k.line, k.px, L, top, 0.35, xF, back);
      p.restore();
    });
  }
  if (L.costume === 'raver' && !back) {
```

In `src/art/figure/body.ts`, replace:

```ts
      const c1 = lerp(a.e, a.h, 0.82);
      const cuff = L.costume === 'hacker' ? shade(L.top, -0.12) : astro ? L.color : shade(L.top, -0.06);
      sk.limb([c0[0], c0[1], c1[0], c1[1]], astro ? 1.5 : 1.28, cuff, { line: 0.6 });
```

with:

```ts
      const c1 = lerp(a.e, a.h, 0.82);
      const cuff = L.costume === 'hacker' ? shade(L.top, -0.12) : astro ? L.color : L.costume === 'nord' ? '#6b4f38' : L.costume === 'exosuit' ? PANEL : shade(L.top, -0.06);
      sk.limb([c0[0], c0[1], c1[0], c1[1]], astro ? 1.5 : 1.28, cuff, { line: 0.6 });
```

- [ ] **Step 5: A nord's braids**

In `src/art/figure/head.ts`, replace:

```ts
  }
  if (!human && !hood && L.costume !== 'astronaut') headShine(sk, L, back);
```

with:

```ts
  }
  if (human && !hood && L.costume === 'nord') braids(sk, L, back);
  if (!human && !hood && L.costume !== 'astronaut') headShine(sk, L, back);
```

In `src/art/figure/head.ts`, replace:

```ts
    }
  });
}
```

with:

```ts
    }
  });
}

// A nord's two braids, tied at the ends in its trim: over the shoulders
// from the front, down the back from behind.
function braids(sk: Sketch, L: Look, back: boolean): void {
  const ends: ReadonlyArray<readonly [number, number, number, number]> = back
    ? [[-1.95, 1.7, -2.15, 5.4], [1.65, 1.7, 1.85, 5.4]]
    : [[-3.0, 0.8, -3.2, 5.0], [3.15, 1.6, 3.35, 5.0]];
  for (const [x0, y0, x1, y1] of ends) {
    sk.limb([x0, y0, (x0 + x1) / 2 + 0.12, (y0 + y1) / 2, x1, y1], 0.9, L.hair, { dark: L.hairD });
    sk.draw((p, c) => {
      if (c.px < 4) return;
      // the plait
      p.strokeStyle = alpha(c.ink, 0.45);
      p.lineWidth = c.line * 0.7;
      p.lineCap = 'round';
      p.beginPath();
      for (let k = 1; k < 6; k++) {
        const t = k / 6.5;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        p.moveTo(x - 0.35, y - 0.12);
        p.lineTo(x + 0.3, y + 0.2);
      }
      p.stroke();
    });
    sk.blob(circ(x1, y1 - 0.35, 0.42), L.trim, { dark: L.trimD, d: 0.12, line: 0.5 });
  }
}
```

- [ ] **Step 6: Run the tests to see them pass**

Run: `node --test test/figure.test.ts test/themes.test.ts`
Expected: PASS: `ℹ tests 57`, `ℹ pass 57`, `ℹ fail 0`.

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

Run: `node --test "test/**/*.test.ts"`
Expected: `ℹ tests 1019`, `ℹ pass 1019`, `ℹ fail 0`.

- [ ] **Step 7: Look at the outfits**

Run: `node "$SCRATCH/tools/sheet.ts" "$PWD/src" "$SCRATCH/sheets" drifter,nord,exosuit,jumpsuit,colonist 7`
Expected: `ok`; open the five `$SCRATCH/sheets/costume-<costume>.png` and
`$SCRATCH/sheets/costume-poses.png` (walk, write, read, run, search, web,
think, sit, carry, cheer, dance, sleep) with the Read tool. Each must read as
itself on every species from the front and from behind, in the outlined style
of the existing costumes (one ink, two-tone shading, light from the upper
left); nothing clipped at the sprite's edge; the jumpsuit carries no number
or logo, front or back.

- [ ] **Step 8: Commit**

```bash
git add src/art/figure/look.ts src/art/figure/head.ts src/art/figure/body.ts test/figure.test.ts
git commit -F - <<'EOF'
feat(figure): dress every species for the five game worlds

A drifter's long sand coat and scarf, a nord's tunic, fur cloak and
braids, a bright two-tone exosuit with a chest light, a blue jumpsuit
with a plain yellow stripe and a colonist's work jacket with a utility
belt; each in other colours at ★8, a ghost's sheet with the accents.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 3: Three critters: a sand beetle, a hopper and a husky

The critter's life (wandering near home, sitting, holding still to be petted,
the heart over it) is the stage's and the same for every kind; a new kind
needs only its speed and its drawing. All three stay on the floor (`hover`
is 0: the hopper's hops are in its drawing).

**Files:**
- Modify: `src/worlds/types.ts` (`CritterKind`)
- Modify: `src/world/critter.ts` (`SPEED`)
- Modify: `src/art/figure/critters.ts` (the header comment, `critterArt`'s switch, three drawings)
- Test: `test/figure.test.ts`, `test/themes.test.ts`

- [ ] **Step 1: Write the failing tests**

The critter test idles and moves every kind, flips it and checks its anchor;
the contract test learns the new kinds.

In `test/figure.test.ts`, replace:

```ts
test('critters: every kind idles and moves, flips, and is anchored on the floor', () => {
  for (const kind of ['cat', 'rat', 'drone', 'slime', 'fox', 'imp'] as const) {
    const c: CritterFrame = { kind, body: [200, 120, 80], x: 0, y: 0, z: 0, flip: false, moving: false };
```

with:

```ts
test('critters: every kind idles and moves, flips, and is anchored on the floor', () => {
  for (const kind of ['cat', 'rat', 'drone', 'slime', 'fox', 'imp', 'beetle', 'hopper', 'husky'] as const) {
    const c: CritterFrame = { kind, body: [200, 120, 80], x: 0, y: 0, z: 0, flip: false, moving: false };
```

In `test/themes.test.ts`, replace:

```ts
const COSTUMES = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'];
const CRITTERS = ['cat', 'rat', 'drone', 'slime', 'fox', 'imp'];
const SHAPES = ['tower', 'house', 'pyramid', 'statue', 'machine'];
```

with:

```ts
const COSTUMES = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist'];
const CRITTERS = ['cat', 'rat', 'drone', 'slime', 'fox', 'imp', 'beetle', 'hopper', 'husky'];
const SHAPES = ['tower', 'house', 'pyramid', 'statue', 'machine'];
```

- [ ] **Step 2: Run the tests to see them fail**

Run: `node --test test/figure.test.ts test/themes.test.ts`
Expected: FAIL, 1 of 57: `critters: every kind idles and moves, flips, and is anchored on the floor` (`beetle: 1 idle, 1 moving frames`).

- [ ] **Step 3: The kinds and their speeds**

In `src/worlds/types.ts`, replace:

```ts
export type CritterKind = 'cat' | 'rat' | 'drone' | 'slime' | 'fox' | 'imp';
export type BuildShape = 'tower' | 'house' | 'pyramid' | 'statue' | 'machine';
```

with:

```ts
export type CritterKind = 'cat' | 'rat' | 'drone' | 'slime' | 'fox' | 'imp' | 'beetle' | 'hopper' | 'husky';
export type BuildShape = 'tower' | 'house' | 'pyramid' | 'statue' | 'machine';
```

In `src/world/critter.ts`, replace:

```ts
const SPEED: Record<CritterKind, number> = { cat: 5, rat: 6, drone: 4, slime: 2.4, fox: 6, imp: 3.5 };
```

with:

```ts
const SPEED: Record<CritterKind, number> = { cat: 5, rat: 6, drone: 4, slime: 2.4, fox: 6, imp: 3.5, beetle: 3, hopper: 4.5, husky: 6.5 };
```

- [ ] **Step 4: Draw them**

The beetle scuttles in threes (one stride a loop, so all four moving frames
differ), twitches its feelers and breathes at rest; the hopper squashes,
stretches and hops, its feelers' tips glowing; the husky trots, wags and pants
at rest now and then.

In `src/art/figure/critters.ts`, replace:

```ts
// anchor on the floor under its middle: a cat, a rat, a hovering drone, a
// slime, a fox or a flapping imp. Idle loops breathe, swish and blink;
// moving ones trot, hop or buzz.
```

with:

```ts
// anchor on the floor under its middle: a cat, a rat, a hovering drone, a
// slime, a fox, a flapping imp, a sand beetle, a fluffy hopper or a husky.
// Idle loops breathe, swish and blink; moving ones trot, hop, scuttle or
// buzz.
```

In `src/art/figure/critters.ts`, replace:

```ts
          imp(sk, f);
          break;
```

with:

```ts
          imp(sk, f);
          break;
        case 'beetle':
          beetle(sk, f);
          break;
        case 'hopper':
          hopper(sk, f);
          break;
        case 'husky':
          husky(sk, f);
          break;
```

In `src/art/figure/critters.ts`, replace:

```ts
    p.quadraticCurveTo(0.3, -1.25, 0.8, -1.75);
    p.strokeStyle = c.ink;
    p.lineWidth = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.stroke();
  });
}
```

with:

```ts
    p.quadraticCurveTo(0.3, -1.25, 0.8, -1.75);
    p.strokeStyle = c.ink;
    p.lineWidth = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.stroke();
  });
}

// A round sand beetle: a domed shell split down the back, a little head
// with feelers poking out in front, six stubby legs that scuttle in threes.
function beetle(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const bob = f.moving ? -0.08 * Math.abs(Math.sin(a)) : 0;
  const breathe = f.moving ? 0 : 0.06 * Math.sin(a);
  const tw = f.moving ? 0 : 0.18 * Math.sin(a * 2);
  const leg = (x: number, ph: number, near: boolean) => {
    const sw = f.moving ? 0.35 * Math.sin(a + ph) : 0;
    const lift = f.moving ? Math.max(0, Math.cos(a + ph)) * 0.2 : 0;
    sk.limb([x, -0.75 + bob, x + 0.25 + sw, -0.15 - lift], 0.34, near ? f.bd : shade(f.bd, -0.15), { line: 0.6 });
  };
  for (const [x, ph] of [[-1.0, Math.PI], [0.3, 0], [1.5, Math.PI]] as const) leg(x, ph, false);
  const top = -3.05 - breathe + bob;
  const shell = (p: Pen) => {
    p.moveTo(-2.3, -0.55 + bob);
    p.quadraticCurveTo(-2.45, top + 0.05, -0.05, top);
    p.quadraticCurveTo(2.3, top + 0.05, 2.2, -0.55 + bob);
    p.quadraticCurveTo(0, -0.2 + bob, -2.3, -0.55 + bob);
    p.closePath();
  };
  sk.blob(shell, f.b, { dark: f.bd, d: 0.5 });
  sk.draw((p, c) => {
    // the split down its back, a few spots and a gloss
    p.save();
    p.beginPath();
    shell(p);
    p.clip();
    p.strokeStyle = c.ink;
    p.lineWidth = c.line;
    p.lineCap = 'round';
    p.beginPath();
    p.moveTo(0.3, top + 0.05);
    p.quadraticCurveTo(0.6, -1.7 + bob, 0.45, -0.3 + bob);
    p.stroke();
    p.fillStyle = shade(f.b, -0.3);
    for (const [x, y] of [[-1.3, -1.5], [-0.55, -2.35], [1.35, -1.8]] as const) {
      p.beginPath();
      p.arc(x, y + bob, 0.24, 0, TAU);
      p.fill();
    }
    p.restore();
    p.beginPath();
    p.ellipse(-0.95, top + 0.7, 0.75, 0.3, -0.35, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.55);
    p.fill();
  });
  // the head and its feelers, in front of the shell
  sk.at(move(2.3, -1.05 + bob), () => {
    sk.limb([0.3, -0.4, 0.85, -1.05 + tw, 1.35, -1.2 + tw], 0.17, f.bd, { line: 0.5 });
    sk.limb([0.0, -0.5, 0.4, -1.3 - tw, 0.8, -1.55 - tw], 0.17, f.bd, { line: 0.5 });
    sk.blob(ell(0.15, 0, 0.82, 0.68), shade(f.b, -0.35), { dark: shade(f.b, -0.5), d: 0.15 });
    sk.draw(eyeDot(0.5, -0.12, 0.2, f.blink));
  });
  for (const [x, ph] of [[-1.4, 0], [-0.1, Math.PI], [1.1, 0]] as const) leg(x, ph, true);
}

// A fur ball's outline: tufts round an ellipse.
function fluff(p: Pen, cx: number, cy: number, rx: number, ry: number, n: number, amp: number): void {
  p.moveTo(cx + rx, cy);
  for (let j = 1; j <= n; j++) {
    const t = (j / n) * TAU;
    const m = ((j - 0.5) / n) * TAU;
    p.quadraticCurveTo(cx + (rx + amp) * Math.cos(m), cy + (ry + amp) * Math.sin(m), cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  }
  p.closePath();
}

const GLOW = '#fff3a0';

// A small fluffy alien that gets about in hops: a round tuft of fur that
// squashes and stretches, big eyes, two feelers with glowing tips, tiny
// feet.
function hopper(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const hop = f.moving ? Math.max(0, Math.sin(a)) * 1.4 : 0;
  const k = f.moving ? 0.18 * Math.cos(a) : 0.05 * Math.sin(a);
  const w = 1.75 * (1 + k * 0.5);
  const h = 1.6 * (1 - k * 0.6);
  const cy = -h - 0.3 - hop;
  for (const x of [-0.7, 0.75]) sk.blob(ell(x, -0.2 - hop * 0.6, 0.45, 0.25), f.bd, { line: 0.6 });
  const sway = f.moving ? -0.3 * Math.cos(a) : 0.2 * Math.sin(a * 2);
  for (const [x, s] of [[-0.35, -1], [0.75, 1]] as const) {
    const tx = x + s * 0.5 + sway;
    const ty = cy - h - 1.35;
    sk.limb([x, cy - h * 0.7, x + s * 0.2 + sway * 0.5, cy - h - 0.55, tx, ty], 0.18, f.bd, { line: 0.5 });
    sk.draw((p) => {
      const g = p.createRadialGradient(tx, ty, 0.1, tx, ty, 0.95);
      g.addColorStop(0, alpha(GLOW, 0.6));
      g.addColorStop(1, alpha(GLOW, 0));
      p.beginPath();
      p.arc(tx, ty, 0.95, 0, TAU);
      p.fillStyle = g;
      p.fill();
    });
    sk.blob(circ(tx, ty, 0.3), GLOW, { line: 0.5 });
  }
  sk.blob((p) => fluff(p, 0.1, cy, w, h, 12, 0.32), f.b, { dark: f.bd, d: 0.45 });
  sk.draw((p, c) => {
    eyeDot(0.6, cy - 0.15, 0.38, f.blink)(p, c);
    eyeDot(-0.3, cy - 0.15, 0.34, f.blink)(p, c);
    p.beginPath();
    p.moveTo(0.05, cy + 0.55);
    p.quadraticCurveTo(0.2, cy + 0.75, 0.4, cy + 0.55);
    p.strokeStyle = c.ink;
    p.lineWidth = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.stroke();
    p.fillStyle = alpha('#ff8fb0', 0.45);
    for (const x of [-0.85, 1.15]) {
      p.beginPath();
      p.ellipse(x, cy + 0.35, 0.3, 0.18, 0, 0, TAU);
      p.fill();
    }
  });
}

// A husky: its colour over the back, white on its mask, chest, belly and
// legs, pricked ears, a longer muzzle and its tail curled up over its back
// (it wags; it pants at rest now and then).
function husky(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const step = f.moving ? Math.sin(a) : 0;
  const bob = f.moving ? -0.2 * Math.abs(Math.cos(a)) : 0.06 * Math.sin(a);
  const wag = f.moving ? 0.2 * Math.sin(a * 2) : 0.35 * Math.sin(a * 2);
  const white = mix(f.b, WHITE, 0.85);
  const whiteD = shade(white, -0.14);
  // the tail, curled over the back
  sk.at(mul(move(-2.05, -2.55 + bob), turn(wag)), () => {
    const tail = (p: Pen) => {
      p.moveTo(0.15, 0.3);
      p.quadraticCurveTo(-1.45, -0.15, -1.25, -1.5);
      p.quadraticCurveTo(-0.85, -2.45, 0.55, -1.95);
      p.quadraticCurveTo(-0.25, -1.4, 0.45, -0.45);
      p.closePath();
    };
    sk.blob(tail, f.b, { dark: f.bd, d: 0.35 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      tail(p);
      p.clip();
      p.beginPath();
      p.arc(0.45, -1.95, 0.6, 0, TAU);
      p.fillStyle = white;
      p.fill();
      p.restore();
    });
  });
  const leg = (x: number, ph: number, near: boolean) => {
    const sw = f.moving ? 0.5 * Math.sin(a + ph) : 0;
    const lift = f.moving ? Math.max(0, Math.cos(a + ph)) * 0.4 : 0;
    sk.limb([x, -1.55 + bob, x + sw, -0.35 - lift], 0.66, near ? white : whiteD, { dark: near ? whiteD : null });
  };
  leg(1.3, Math.PI, false);
  leg(-1.6, 0, false);
  const body = ell(-0.3, -2.05 + bob, 2.15, 1.18);
  sk.blob(body, f.b, { dark: f.bd, d: 0.45 });
  sk.draw((p) => {
    // the white belly and chest
    p.save();
    p.beginPath();
    body(p);
    p.clip();
    p.beginPath();
    p.ellipse(0.2, -1.05 + bob, 2.3, 0.62, 0, 0, TAU);
    p.ellipse(1.55, -1.9 + bob, 0.7, 1.0, 0, 0, TAU);
    p.fillStyle = white;
    p.fill();
    p.restore();
  });
  leg(1.05, 0, true);
  leg(-1.9, Math.PI, true);
  // the head
  sk.at(move(1.95 + step * 0.05, -3.25 + bob), () => {
    for (const [x0, x1] of [[-0.95, -0.2], [0.2, 0.95]] as const) {
      sk.blob((p) => {
        p.moveTo(x0, -0.55);
        p.lineTo((x0 + x1) / 2, -2.05);
        p.lineTo(x1, -0.7);
        p.closePath();
      }, f.b, { dark: f.bd, d: 0.2 });
      sk.draw((p) => {
        p.beginPath();
        p.moveTo(x0 + 0.25, -0.75);
        p.lineTo((x0 + x1) / 2, -1.6);
        p.lineTo(x1 - 0.2, -0.85);
        p.closePath();
        p.fillStyle = white;
        p.fill();
      });
    }
    const head = ell(0, 0, 1.22, 1.08);
    sk.blob(head, f.b, { dark: f.bd, d: 0.35 });
    sk.draw((p) => {
      // the mask: white round the eyes and down the face
      p.save();
      p.beginPath();
      head(p);
      p.clip();
      p.beginPath();
      p.ellipse(0.35, 0.45, 1.05, 0.8, 0, 0, TAU);
      p.ellipse(0.05, -0.55, 0.22, 0.35, 0, 0, TAU);
      p.fillStyle = white;
      p.fill();
      p.restore();
    });
    sk.blob((p) => {
      p.moveTo(0.45, -0.05);
      p.quadraticCurveTo(1.3, -0.15, 1.95, 0.3);
      p.quadraticCurveTo(1.9, 0.85, 1.2, 0.85);
      p.quadraticCurveTo(0.6, 0.9, 0.35, 0.65);
      p.closePath();
    }, white, { dark: whiteD, d: 0.15, line: 0.6 });
    sk.blob(circ(1.9, 0.3, 0.24), EYE, { line: 0, sil: false });
    sk.draw(eyeDot(0.5, -0.12, 0.22, f.blink));
    sk.draw(eyeDot(-0.3, -0.12, 0.2, f.blink));
    if (f.moving || f.i % 4 < 2) {
      sk.draw((p) => {
        p.beginPath();
        p.ellipse(1.35, 0.95, 0.24, 0.32, 0.2, 0, TAU);
        p.fillStyle = '#ff8fa8';
        p.fill();
      });
    }
  });
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `node --test test/figure.test.ts test/themes.test.ts`
Expected: PASS: `ℹ tests 57`, `ℹ pass 57`, `ℹ fail 0`.

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

Run: `node --test "test/**/*.test.ts"`
Expected: `ℹ tests 1019`, `ℹ pass 1019`, `ℹ fail 0`.

- [ ] **Step 6: Look at them**

Run: `node "$SCRATCH/tools/sheet.ts" "$PWD/src" "$SCRATCH/sheets" drifter 12 beetle,hopper,husky`
Expected: `ok`; open `$SCRATCH/sheets/critters.png` with the Read tool (each
kind: a row of idle frames, a row of moving frames, the last two flipped).
The beetle reads as a round beetle with a head, feelers and six legs, the
hopper as a fluffy round alien with glowing feelers, the husky as a husky
(white mask, chest and legs, pricked ears, tail curled over its back), all in
the outlined style of the cat and the fox.

- [ ] **Step 7: Commit**

```bash
git add src/worlds/types.ts src/world/critter.ts src/art/figure/critters.ts test/figure.test.ts test/themes.test.ts
git commit -F - <<'EOF'
feat(critters): a sand beetle, a hopper and a husky

Three critter kinds for the game worlds, drawn in the outlined style
and living as the others do: a round sand beetle that scuttles, a
fluffy alien that hops and a husky that trots and wags.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


### Task 4: Look at a world before it is registered

World tasks own only their own files and must not touch the registry, but
`scripts/scene-shot.ts` renders only registered ids. Let it take a world's
module file as well, loaded as the contract test loads `ANIMUS_THEME_FILE`
(the default export, or the first exported object with `stations`). This is
the only shared piece the world tasks need that does not exist yet: the
contract test, the `budget()` helper, `planLayout`, `planRoom`, the stub art
and each world's own kit pattern already exist.

**Files:**
- Modify: `scripts/scene-shot.ts` (`loadWorld`; `shot` takes a `WorldDef` as well as an id)
- Modify: `README.md` (the script's paragraph under Development)
- Test: `test/scene.test.ts`

- [ ] **Step 1: Write the failing test**

In `test/scene.test.ts`, replace:

```ts
test('the selected figure stands in a ring of its colour, the hurt in a pulsing red one', () => {
```

with:

```ts
test('the screenshot script takes a world by its id or by its module file, so a world not registered yet can be looked at', async () => {
  const { loadWorld, shot } = await import('../scripts/scene-shot.ts');
  const cafe = await loadWorld('cafe');
  assert.equal(cafe.id, 'cafe');
  assert.equal(await loadWorld('src/worlds/cafe.ts'), cafe);
  await assert.rejects(loadWorld('nope'), /unknown world "nope"/);
  await assert.rejects(loadWorld('src/worlds/types.ts'), /exports no world/);
  const { png } = shot({ world: { ...cafe, id: 'unlisted' }, at: 1, cols: 80, rows: 24, cell: { w: 8, h: 16 }, zoom: 0, select: -1, full: true, dark: false });
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 384]);
});

test('the selected figure stands in a ring of its colour, the hurt in a pulsing red one', () => {
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/scene.test.ts`
Expected: FAIL, 1 of 18: `the screenshot script takes a world by its id or by its module file, …` (`TypeError [Error]: loadWorld is not a function`).

- [ ] **Step 3: Load a world by id or module file**

In `scripts/scene-shot.ts`, replace:

```ts
//
// --at: seconds of demo time; --size: the terminal in cells; --cell: a
```

with:

```ts
//
// <world>: a registered world's id, or a world's module file
// (src/worlds/<id>.ts) to look at one not registered yet.
// --at: seconds of demo time; --size: the terminal in cells; --cell: a
```

In `scripts/scene-shot.ts`, replace:

```ts
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
```

with:

```ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
```

In `scripts/scene-shot.ts`, replace:

```ts
import { World } from '../src/world/world.ts';
```

with:

```ts
import { World } from '../src/world/world.ts';
import type { WorldDef } from '../src/worlds/types.ts';
```

In `scripts/scene-shot.ts`, replace:

```ts
export function shot(o: { world: string; at: number; cols: number; rows: number; cell: { w: number; h: number }; zoom: number; select: number; full: boolean; dark: boolean }): { png: Buffer; pictures: number; ms: { first: number; frame: number; encode: number } } {
  const theme = getTheme(o.world);
  if (!theme) throw new Error(`unknown world "${o.world}"`);
```

with:

```ts
// A world by its id, or by its module file (a path ending in .ts): the
// module's default export or the first exported object with `stations`,
// as the contract test loads one (ANIMUS_THEME_FILE).
export async function loadWorld(arg: string): Promise<WorldDef> {
  if (!arg.endsWith('.ts')) {
    const theme = getTheme(arg);
    if (!theme) throw new Error(`unknown world "${arg}"`);
    return theme;
  }
  const mod = (await import(pathToFileURL(resolve(arg)).href)) as Record<string, unknown>;
  const found = mod.default ?? Object.values(mod).find((v) => !!v && typeof v === 'object' && 'stations' in v);
  if (!found) throw new Error(`${arg} exports no world`);
  return found as WorldDef;
}

export function shot(o: { world: string | WorldDef; at: number; cols: number; rows: number; cell: { w: number; h: number }; zoom: number; select: number; full: boolean; dark: boolean }): { png: Buffer; pictures: number; ms: { first: number; frame: number; encode: number } } {
  const theme = typeof o.world === 'string' ? getTheme(o.world) : o.world;
  if (!theme) throw new Error(`unknown world "${o.world}"`);
```

In `scripts/scene-shot.ts`, replace:

```ts
  const [cw, ch] = pair(values.cell ?? '10x20', 'cell');
  const { png, pictures, ms } = shot({ world, at: Number(values.at ?? 20), cols, rows, cell: { w: cw, h: ch }, zoom: Number(values.zoom ?? 0), select: Number(values.select ?? -1), full: !!values.full, dark: !!values.dark });
  writeFileSync(out, png);
```

with:

```ts
  const [cw, ch] = pair(values.cell ?? '10x20', 'cell');
  const { png, pictures, ms } = shot({ world: await loadWorld(world), at: Number(values.at ?? 20), cols, rows, cell: { w: cw, h: ch }, zoom: Number(values.zoom ?? 0), select: Number(values.select ?? -1), full: !!values.full, dark: !!values.dark });
  writeFileSync(out, png);
```

- [ ] **Step 4: Document it**

In `README.md`, replace:

```markdown
`scripts/scene-shot.ts <world> <out.png>` takes `--at <s>` (demo time,
default 20), `--size 150x46` (terminal cells), `--cell 10x20` (cell
pixels), `--zoom <n>` (`+` presses), `--select <n>` (the n-th agent
picked, from 0), `--full` and `--dark` (lighting off). It renders only the
picture; labels, card and chat are terminal text.
`scripts/sarif-gate.ts` fails CI on any CodeQL finding.
```

with:

```markdown
`scripts/scene-shot.ts <world> <out.png>` renders a world by its id, or by
its module file (`src/worlds/<id>.ts`) to look at one not registered yet.
It takes `--at <s>` (demo time, default 20), `--size 150x46` (terminal
cells), `--cell 10x20` (cell pixels), `--zoom <n>` (`+` presses),
`--select <n>` (the n-th agent picked, from 0), `--full` and `--dark`
(lighting off). It renders only the picture; labels, card and chat are
terminal text.
`scripts/sarif-gate.ts` fails CI on any CodeQL finding.
```

- [ ] **Step 5: Run it**

Run: `node --test test/scene.test.ts`
Expected: PASS: `ℹ tests 18`, `ℹ pass 18`, `ℹ fail 0`.

Run: `node scripts/scene-shot.ts src/worlds/cafe.ts "$SCRATCH/cafe-from-file.png" --size 100x30`
Expected: one line, `…/cafe-from-file.png: <n> KB; first render <n> ms, next plate <n> ms (<n> pictures), encode <n> ms`.

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

Run: `node --test "test/**/*.test.ts"`
Expected: `ℹ tests 1020`, `ℹ pass 1020`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add scripts/scene-shot.ts README.md test/scene.test.ts
git commit -F - <<'EOF'
feat(scripts): scene-shot renders a world from its module file

A world not registered yet can be looked at:
node scripts/scene-shot.ts src/worlds/<id>.ts out.png

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```


## Part B: the five worlds (parallel; art from the brief, contract from the tests)

Tasks 5–9 are independent and parallel-safe; they need Tasks 1–4 merged
first (the costumes, the critters and `scene-shot` with a module file). Each
is done by one agent that:

- owns only `src/worlds/<id>.ts`, `src/worlds/<id>/*.ts` and `test/<id>.test.ts`;
- runs no git and touches no other file (not the registry, not shared code,
  not another world);
- hands back its file list, its test output and its render paths. The
  coordinator reviews and commits each world in Task 10 (the commit is the
  last step of each world task, run by the coordinator).

### Conventions for every world

**What the tests and the registry import** (names exact):

- `src/worlds/<id>.ts`: `export const <id>: WorldDef` (complete code in each task).
- `src/worlds/<id>/kit.ts`: `INK`, `C`, the `Kit` class and its helpers.
- `src/worlds/<id>/room.ts`: `export const room: RoomArt` (with an
  `overlay`); `export function planFor(W: number, D: number, H: number, T: number): Plan`
  with `export type Plan = { L: Layout; features: Feature[] }` and
  `export type Feature = { wall: 'left' | 'right'; kind: Kind; a: number; w: number; k: number }`
  (`a` the piece's centre along its wall, `w` the width it takes along the
  wall: everything the piece draws on the wall lies within `a ± w / 2`;
  `k` a per-piece seed); and `export function <id>Pois(L: Layout): Poi[]`
  (complete code in each task).
- `src/worlds/<id>/stations.ts`: `export const STATIONS: Record<SlotKind, PropArt>`.
- `src/worlds/<id>/decor.ts`: `export const DECOR: NonNullable<WorldDef['decor']>`
  and `export const DECOR_ART = { … }` holding every piece `DECOR` uses, and
  nothing else.

**The kit.** Copy `src/worlds/vault/kit.ts` to `src/worlds/<id>/kit.ts` and
change only: the header comment (the world's name), `INK`, the `C` table
(given in each task) and the contact shadow's colour in `Kit.shadow`
(`'#04060c'`, given in each task). Keep the rest: `Kit` with `sees` (culling),
`box`, `cyl`, `trace`, `poly`, `rect`, `paint`, `line`, `segs`, `rod`, `ell`,
`disc`, `face`, `shadow`, `halo`, `pool`, `wash` and the gradients; `circle`,
`withAlpha`, `softDot`, `kitOf`; `still` for animated props; `due` and `wisp`
for particles. Copy small shared bits you need (`bookRow`, `crown`, `leaf`,
`pot`, `hull`, `ring`, `frustum`, `chair`, `stool`, `flames`) from
`src/worlds/cafe/bits.ts` or `src/worlds/vault/bits.ts` into
`src/worlds/<id>/bits.ts`, retinted to the world; never import another
world's files.

**The plan of the walls (`planFor`).** As the café does
(`src/worlds/cafe/room.ts`, `planFor` and `features`): memoize by
`` `${W}x${D}x${H}x${T}` ``; `let L = planLayout(2 * W + 12, W + H + 12, '<id>')`
and, if its `W`, `D`, `H` or `T` differ, `L = { W, D, H, T, slots: [] }` (the
test checks the shell finds the stage's slots); the free stretches are
`wallGaps(L, wall)` less 2 units at the corner and 2.5 beside a station; pack
each stretch from the world's `ORDER` list (cycled), skipping kinds at their
cap and kinds that do not fit, 4 units between pieces, the world's first kind
first on each wall, fillers (the narrowest kind) last; spread what fits with
even gaps. The test checks, at five room sizes from 72 to 216 units, that
every piece lies on its wall, a unit clear of every station on that wall and
clear of every other piece, and that the world's required kinds are there.

**Points of interest.** Paste the given `<id>Pois` into `room.ts` with the
imports listed beside it; it also needs `type Wall = 'left' | 'right'` and
your `planFor`. The test furnishes the room as the stage does
(`planRoom(world, L, hashString('<id>'))`) and counts the spots that survive
on open floor; in a 150x44, a 120x33 and a 200x60 terminal there must be the
`warm`, `view`, `dance` and `pet` spots every world has, plus the world's own.

**Art rules** (`docs/superpowers/specs/2026-10-24-illustrated-design.md`):

- Outlined cartoon with one ink: every outline in the world's `INK`, `k.lw`
  wide, inner lines `k.thin`; never pure black.
- Light from the upper left: top faces lifted about 12 %, the face toward the
  lower left in the base colour, the face toward the lower right about 18 %
  darker (`k.box`, `k.cyl` and `k.side` do this in either wall frame); one
  highlight stripe along top front edges; no noise, no dithering.
- A soft contact shadow under every prop (`k.shadow`).
- Light: warm pools and halos composited `screen` or `lighter` at low alpha
  (`k.pool`, `k.halo`); glowing bits get a soft halo.
- Saturated, not neon; one clear dominant hue; the characters must stay
  readable on the floor and the walls.
- No text, letters, digits or runes in the picture: screens, ledgers, maps
  and labels show lines, bars and shapes.
- Small detail only when `k.fine` (s ≥ 7).
- The trademark rule (see "Read this first").

**Footprints and frames.** A prop draws in its own frame: `u` along its wall
(0..len), `v` out into the room (0..dep), `z` up; the viewer always sees its
top, its `+v` front and its `+u` end; an island is drawn the same way, as if
backed onto `wall`, its front toward the viewer. Stations use their
`PROP_SIZE` footprint exactly (write 11x7, read 14x4, search 12x4, run 11x11,
web 9x9, think 12x7, idle 15x11, entrance 15x4; the contract test checks) and
stand at most 40 tall. Everything a prop paints at alpha ≥ 16/255 stays inside
its footprint raised to its height (the test allows half a unit of ink), in
both wall frames, as an island, at s = 4 and 16: a faint glow may spill, a
visible one may not. The entrance's doorway spans about u 3.5–9.5 (agents
stand at u = 6) and is at least 15 tall. Decor pieces are at most 24 x 24
units, at most 12 of each.

**Speed** (each world's test enforces the budgets; the scene's limits are 400
ms for the static layer and 25 ms a frame):

- A prop that is not `animated` is drawn once into the static layer: its
  `draw` must never look at `v.t` or `v.active` (its `emit` may).
- An `animated` prop is redrawn every frame: paint its still parts through
  `still(v, '<name>', height, (k) => …)` (cached per scale and placement) and
  draw only the moving bits on top: at most 1 ms a frame at s = 4.09.
- An animated station moves only while worked (`v.active`); idle, it holds
  still, so nothing is resent. The only exceptions are the `RESTLESS`
  stations named in the world's test.
- The shell is painted a 256 px tile at a time: skip whatever is off the pen
  with `k.sees(…)` so that the shell in tiles stays within 400 ms.
- The overlay is redrawn at the ambient rate and cut into 64 px tiles: keep
  its marks small and local (inside windows, round a tube, by a fire); no
  washes over whole walls; at most 3 ms a frame; it must change over a couple
  of seconds.
- Particles (`emit`) only of the existing kinds (`spark`, `ember`,
  `confetti`, `smoke`, `steam`, `drop`, `glint`, `bolt`, `zzz`), starting
  within the prop's footprint (±2 units) and at most 20 units over its
  height, living at most 10 s.

**How to check a world** (each task gives the exact commands):

1. `node --test test/<id>.test.ts`: its art test.
2. `ANIMUS_THEME_FILE=src/worlds/<id>.ts node --test test/themes.test.ts`:
   the contract every world meets (34 tests until Task 10 registers it).
3. `node node_modules/typescript/bin/tsc --noEmit -p .`
4. Three renders with the demo crew, opened with the Read tool: a 150x46
   terminal, a 100x30 one and one zoomed in on an agent. The "next plate" each
   prints should be under 25 ms.
5. Compare with the brief and the art rules; fix; repeat.

**Done when** (every world; each task adds its own):

- [ ] Its test, the contract test and the typecheck pass.
- [ ] The three renders read at a glance as the world in the brief: every
      station is recognisable as its job, the wall pieces and decor are
      there, the overlay moves, the characters wear the world's costume and
      the critter is about.
- [ ] One ink, light from the upper left, contact shadows; no text, no logos,
      no emblems, no game names in code, comments or pictures.
- [ ] Nothing outside `src/worlds/<id>.ts`, `src/worlds/<id>/` and
      `test/<id>.test.ts` was touched, and no git command was run.


### Task 5: Dust Outpost (`dunes`)

A sun-bleached desert outpost: sandstone and rusted scrap-metal walls, hide awnings, shuttered windows onto hazy dunes; packed sand underfoot; warm, dusty, quiet. Dominant hue: sand, with rust and turquoise accents.

**Files** (this task owns these and nothing else):
- Create: `src/worlds/dunes.ts` (complete code below)
- Create: `src/worlds/dunes/kit.ts`, `src/worlds/dunes/bits.ts` (if needed), `src/worlds/dunes/room.ts`, `src/worlds/dunes/stations.ts`, `src/worlds/dunes/decor.ts`
- Test: `test/dunes.test.ts` (complete code below)

- [ ] **Step 1: Write the test**

It fixes the contract: every station and piece of decor draws in both wall
frames and as an island, at s = 4 and 16, inside its footprint and height;
animated pieces move while worked and stations hold still otherwise; the wall
pieces keep off the stations and each other and the required ones are always
there; the world's points of interest survive on open floor; every piece of
decor finds floor; the static layer, the shell painted in tiles, each animated
prop's frame and the overlay stay within their budgets, and the overlay moves.

Create `test/dunes.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { dunes } from '../src/worlds/dunes.ts';
import { DECOR_ART } from '../src/worlds/dunes/decor.ts';
import { planFor } from '../src/worlds/dunes/room.ts';
import { budget } from './helpers.ts';

// The Dust Outpost's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise; the
// walls keep their windows, skull, shelves and lanterns off the stations;
// drinks at the bar and tea on the rug; the shell, its sand gusts and every
// prop stay within their time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(dunes.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>([]);
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];
// Terminals of 10 x 20 cells: 150 x 44, 120 x 33, 80 x 24, 64 x 22 and a
// big 200 x 60; the world's own spots are asked of the roomier ones.
const SIZES: Array<[number, number]> = [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]];
const ROOMY: Array<[number, number]> = [[375, 220], [300, 165], [500, 300]];

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws `art` alone on a transparent canvas; returns the canvas and the
// screen box of its footprint raised to its height.
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean): { c: Canvas; box: Box } {
  const pad = 6 * s;
  const w = Math.ceil((art.len + art.dep) * s + 2 * pad);
  const h = Math.ceil(((art.len + art.dep) / 2 + art.height) * s + 2 * pad);
  const at0 = frame(project(0, 0, s), wall, 0, 0);
  let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const ox = pad - box.x0;
  const oy = pad - box.y0;
  const at = frame(project(ox, oy, s), wall, 0, 0);
  const c = new Canvas(w, h);
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed: 1234 });
  return { c, box: { x0: box.x0 + ox, y0: box.y0 + oy, x1: box.x1 + ox, y1: box.y1 + oy } };
}

// The box round every pixel painted at least `min` (of 255) opaque.
function painted(c: Canvas, min = 16): Box | null {
  let b: Box | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < min) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y };
      else {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

const same = (a: Canvas, b: Canvas) => a.data.length === b.data.length && a.data.every((n, i) => n === b.data[i]);

for (const [name, art] of ARTS) {
  test(`Dust Outpost ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        for (const active of [false, true]) {
          const { c, box } = render(art, s, wall, island, 1.3, active);
          const p = painted(c);
          const tag = `${name} s=${s} ${wall}${island ? ' island' : ''}${active ? ' active' : ''}`;
          assert.ok(p, `${tag}: drew nothing`);
          // ink overhangs by half a line; a unit's slack round the box
          const m = s * 0.6 + 2;
          assert.ok(p.x0 >= box.x0 - m && p.x1 <= box.x1 + m && p.y0 >= box.y0 - m && p.y1 <= box.y1 + m, `${tag}: painted ${JSON.stringify(p)} outside ${JSON.stringify(box)}`);
        }
      }
    }
  });

  if (art.animated) {
    test(`Dust Outpost ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Dust Outpost ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Dust Outpost stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(dunes.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Dust Outpost room: the walls keep their windows, skull, shelves and lanterns off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'dunes');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no shuttered windows onto the dunes`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other along the wall
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Dust Outpost points of interest: drinks at the bar, tea on the rug, a look at the dunes', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'dunes');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(dunes, L, hashString('dunes'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('drink') >= 2, `${L.W}: ${count('drink')} drink spots, at the bar`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, round the teapot on the rug`);
    assert.ok(count('view') >= 3, `${L.W}: ${count('view')} view spots, two of the stations and the dunes`);
  }
});

test('Dust Outpost decor: every piece is in DECOR_ART, and each finds floor in a 150 x 44 terminal', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of dunes.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(dunes, planLayout(375, 220, 'dunes'), hashString('dunes'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
});

test('Dust Outpost room: the shell draws inside the canvas, the sand blows past the windows, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'dunes'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(dunes, L, hashString('dunes'));
  const s = 4.09;
  const cam = { ox: L.D * s + 30, oy: L.H * s + 20 };
  const c = new Canvas(1500, 920);
  const P = project(cam.ox, cam.oy, s);
  const view = (t: number) => ({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  const props = (t: number, active: boolean, animated: boolean) => {
    for (const p of room.props) {
      if (!!p.art.animated !== animated) continue;
      p.art.draw({ pen: c, s, at: (u, v, z) => P(...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    }
  };

  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  dunes.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    dunes.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell a tile at a time, as the scene paints it: no worse than whole.
  const tile = new Canvas(256, 256);
  budget('the shell in tiles', () => {
    for (let ty = 0; ty < 920; ty += 256) {
      for (let tx = 0; tx < 1500; tx += 256) {
        tile.clear();
        dunes.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: sand gusts past the windows and the air shimmers, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    dunes.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => dunes.room.overlay!(view(i / 12)), 3, { calls: 20 });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/dunes.test.ts`
Expected: FAIL: the file does not load: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/worlds/dunes.ts'`.

- [ ] **Step 3: The world module**

Create `src/worlds/dunes.ts`:

```ts
import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './dunes/decor.ts';
import { INK } from './dunes/kit.ts';
import { dunesPois, room } from './dunes/room.ts';
import { STATIONS } from './dunes/stations.ts';

// Dust Outpost: scrap walls, hide awnings and sand on the wind. A sun-bleached
// desert outpost in outlined cartoon (dark leather-brown ink): the shell in
// dunes/room.ts, the stations in dunes/stations.ts, the furniture in
// dunes/decor.ts, all drawn with the kit in dunes/kit.ts and dunes/bits.ts.

const PALETTE: Palette = {
  bg: hex('#1c140c'),
  wall: hex('#d9b98a'),
  wall2: hex('#b88e5c'),
  floor: hex('#c79a62'),
  floor2: hex('#a87c48'),
  text: hex('#f6e8cf'),
  dim: hex('#a8916f'),
  accent: hex('#3fb8a8'),
  accent2: hex('#c0582e'),
  panel: hex('#241a10'),
  panelText: hex('#f6e8cf'),
  border: hex('#9a6a3a'),
  bubble: hex('#fff6e6'),
  bubbleText: hex('#3a2a1a'),
  good: hex('#8fbf6a'),
  warn: hex('#e8b04a'),
  bad: hex('#d0583e'),
};

export const dunes: WorldDef = {
  id: 'dunes',
  name: 'Dust Outpost',
  tagline: 'Scrap walls, hide awnings and sand on the wind',
  palette: PALETTE,
  backdrop: hex('#170f08'),
  ink: INK,
  room,
  pois: dunesPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'drifter',
  critter: { kind: 'beetle', body: hex('#b4682c') }, // a sand beetle
  finale: { colors: [[226, 196, 140], [192, 88, 46], [63, 184, 168]] }, // sand, rust and turquoise confetti
  build: { colors: [hex('#c9a46c'), hex('#a8845a'), hex('#d9bf8f'), hex('#3fb8a8')], shape: 'pyramid' }, // a stone cairn of sandstone, crowned in turquoise
};
```

- [ ] **Step 4: The kit**

Copy `src/worlds/vault/kit.ts` to `src/worlds/dunes/kit.ts`; in the copy
change the header comment to this world's, the contact shadow's colour in
`Kit.shadow` from `'#04060c'` to `'#1e1006'`, and `INK` and `C` to:

```ts
// The one outline colour: a dark leather brown.
export const INK = '#3a2414';

export const C = {
  // stone, sand and scrap
  sandstone: '#d9b98a',
  sandstoneLight: '#e8cfa4',
  sandstoneDark: '#b88e5c',
  sand: '#e3c48e',
  sandDark: '#c9a36a',
  scrap: '#8c8f8a',
  scrapDark: '#62655f',
  rust: '#b4562e',
  rustDark: '#7e3a20',
  // wood, hide and cloth
  wood: '#8a5a34',
  woodLight: '#a8744a',
  woodDark: '#64401f',
  hide: '#c99a5b',
  hideDark: '#9a6e3a',
  cloth: '#c0582e',
  clothLight: '#e07a4a',
  turquoise: '#3fb8a8',
  turquoiseDark: '#2a8a7e',
  cream: '#f2e3c6',
  // brass, glass, ink and clay
  brass: '#d4a24a',
  brassDark: '#a87a2e',
  glass: '#9fd4cf',
  inkPot: '#2b2a3a',
  clay: '#c66a42',
  // outside: haze over the dunes
  sky: '#f6c98e',
  skyHigh: '#f0a868',
  dune: '#e6b872',
  duneShade: '#c9925a',
  duneFar: '#efc995',
  // light, plants and bone
  lamp: '#ffd08a',
  flame: '#ffc04a',
  cactus: '#5f9a4f',
  cactusDark: '#3f7440',
  bone: '#efe6d2',
  boneDark: '#cbbd9e',
} as const;
```

- [ ] **Step 5: The room (`src/worlds/dunes/room.ts`)**

**Plan** (`planFor`, see the conventions): `type Kind = 'window' | 'skull' | 'shelf' | 'lantern'`; widths,
caps and what each piece is:

| kind | w (units) | cap | what it is |
| --- | --- | --- | --- |
| `window` | 10 | — | a shuttered window: a plank frame, two plank shutters swung open, a hide awning on two poles over it; through it a hazy sky (`sky` up to `skyHigh`) over three bands of dunes (`duneFar`, `dune`, `duneShade`); sill at z 11, top at `min(H - 9, 31)` |
| `skull` | 9 | 1 | a big beast's skull mounted on a plank: a long jaw, two curved tusks, dark eye holes (`bone`, `boneDark`) |
| `shelf` | 8 | 2 | a plank shelf on two brackets: clay pots, a jug and a coil of rope |
| `lantern` | 2 | — (filler) | a tin lantern on a hook, lit: a warm halo |

`ORDER`: window, skull, shelf, window, lantern, window, shelf, window; first on each wall: `window`. Required at every
size (the test): `window`.

**Floor:** Packed sand (`C.sand`) laid with irregular sandstone flags (`sandstone`, `sandstoneLight`, `sandstoneDark`) in a loose grid of 6–10-unit slabs; sand drifted along the foot of both walls (soft mounds about 1.5 tall); pebbles when `k.fine`. The floor's front cut (2.5 thick) in `sandstoneDark`.

**Walls:** A course of sandstone blocks up to z 9 (staggered, thin mortar lines), then rusted scrap-metal panels (`scrap`, `scrapDark`, rust streaks in `rust`, rivets, a patch or two in another tone) up to the top, a timber beam (`wood`) along the top edge; the walls' tops and front ends in `sandstoneDark`.

**Light:** Warm halos at the lanterns; a soft warm pool of sunlight on the floor before each window (`k.pool`, `screen`, alpha about 0.12).

**Overlay** (`room.overlay`): Only inside each window's glass: 6–10 thin pale streaks of sand (`sand`, alpha 0.35–0.6, 1–3 units long) blowing sideways at about 12 units a second and wrapping round the glass; and a heat shimmer: two faint wavy bands (alpha at most 0.08) over the dune line whose wave follows `t`.

**Points of interest:** The default warm spots by the bar (the idle prop) become drinks; two warm spots by the teapot on the rug (think); a look out of up to three windows. Paste this into `room.ts`, with these imports:

```ts
import { defaultPois, footprint } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
```

```ts
// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but the two by the bar for a drink rather than to warm
// up, tea for two on the rug by the teapot, and a look out of the windows.
export function dunesPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).map((p): Poi => (p.kind === 'warm' ? { ...p, kind: 'drink' } : p));
  const rug = slot('think');
  if (rug) out.push({ ...at(rug, -4, 1), kind: 'warm', face: mid(rug) }, { ...at(rug, 4, 1), kind: 'warm', face: mid(rug) });
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}
```

- [ ] **Step 6: The stations (`src/worlds/dunes/stations.ts`)**

`export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };`

| slot | the prop | footprint | height | animated | while worked |
| --- | --- | --- | --- | --- | --- |
| `write` | a scrap-wood desk on two crates: an open ledger, an ink pot and a quill; a stool | 11 x 7 | 11 | yes | the quill scratches across the page and short ink lines grow on it (lines, never letters) |
| `read` | a shelf of stacked open crates: salvaged books, scrolls tied with string, a clay pot, a folded map on top | 14 x 4 | 18 | no | — |
| `search` | a brass spyglass on a wooden tripod before a small shuttered slit window on the prop's back plane (v ≈ 0) with a sliver of dunes in it | 12 x 4 | 16 | yes | the spyglass pans a little and its lens glints |
| `run` | a workbench with a crank generator: a spoked flywheel and its handle, a belt to a dynamo with copper coils, tools, a coil of wire | 11 x 11 | 13 | yes | the flywheel and crank turn; `spark` particles at the dynamo |
| `web` | a signal-mast radio: a wooden cabinet radio on a crate and a tall thin mast with guy wires and a pennant | 9 x 9 | 24 | yes | the dial glows amber and its needle sweeps; a `glint` at the mast's tip now and then |
| `think` | cushions round a low brass teapot and two tea glasses on a woven rug (bands of turquoise and rust) | 12 x 7 | 6 | no | still; `emit` steam (`steam`) off the teapot, more while active |
| `idle` | a bar counter of planks on a sandstone base, three stools, bottles and cups, a hide awning over it on two poles | 15 x 11 | 14 | no | — |
| `entrance` | a heavy plank door with iron straps in a sandstone frame, a cloth hanging across half the doorway | 15 x 4 | 20 | yes | the cloth sways aside while someone passes through |

- [ ] **Step 7: The decor (`src/worlds/dunes/decor.ts`)**

| `DECOR_ART` key | the piece | len x dep x height | place and count | animated |
| --- | --- | --- | --- | --- |
| `barrel` | a rusty steel drum or a hooped wooden barrel (by seed) | 4 x 4 x 6 | wall 2, floor 2 | no |
| `tank` | a riveted water tank on legs, a tap and a drip bucket | 7 x 5 x 12 | wall 1 | no |
| `cactus` | a cactus (paddles or a column, by seed) in a clay pot | 4 x 4 x 7 | floor 3 | no |

```ts
export const DECOR: NonNullable<WorldDef['decor']> = [{ art: barrel, count: 2, place: 'wall' }, { art: tank, count: 1, place: 'wall' }, { art: cactus, count: 3, place: 'floor' }, { art: barrel, count: 2, place: 'floor' }];

export const DECOR_ART = { barrel, tank, cactus };
```

- [ ] **Step 8: Run the checks**

Run: `node --test test/dunes.test.ts`
Expected: PASS: `ℹ tests 27`, `ℹ pass 27`, `ℹ fail 0`.

Run: `ANIMUS_THEME_FILE=src/worlds/dunes.ts node --test test/themes.test.ts`
Expected: PASS: `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0` (its three contract tests among them: `world dunes: identity, …`, `… a prop for every station, …`, `… the room and every prop draw with the pen, …`).

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

- [ ] **Step 9: Look at it**

Run:

```bash
mkdir -p "$SCRATCH/worlds"
node scripts/scene-shot.ts src/worlds/dunes.ts "$SCRATCH/worlds/dunes-150x46.png"
node scripts/scene-shot.ts src/worlds/dunes.ts "$SCRATCH/worlds/dunes-100x30.png" --size 100x30
node scripts/scene-shot.ts src/worlds/dunes.ts "$SCRATCH/worlds/dunes-zoom.png" --zoom 3 --select 0
```

Expected: one line each, `<path>: <n> KB; first render <n> ms, next plate <n> ms (<n> pictures), encode <n> ms`, the next plate under 25 ms.
Open the three PNGs with the Read tool and go through the checklist below;
fix and render again until it holds.

**Done when** (with the shared checklist in the conventions):

- [ ] The skull reads as a big beast's skull; the outpost reads sun-bleached and dusty.
- [ ] Sand blows only inside the windows.

- [ ] **Step 10: Commit (the coordinator, after Task 10's review of this world)**

```bash
git add src/worlds/dunes.ts src/worlds/dunes/kit.ts src/worlds/dunes/bits.ts src/worlds/dunes/room.ts src/worlds/dunes/stations.ts src/worlds/dunes/decor.ts test/dunes.test.ts
git commit -F - <<'EOF'
feat(worlds): Dust Outpost (dunes)

A sun-bleached desert outpost: its shell and overlay, eight stations, its
furniture and points of interest, tested for footprints, animation,
wall pieces and frame time.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

(`git add` skips nothing silently: if `bits.ts` was not needed, drop it from
the list.)


### Task 6: Longhall (`meadhall`)

A Nordic mead hall at night: timber walls on a stone base, carved posts, shields and banners in plain colours, antlers, small windows onto falling snow; a long fire pit on the floor; warm firelight against the cold blue outside. Dominant hue: warm timber brown, with ember, gold and frost blue.

**Files** (this task owns these and nothing else):
- Create: `src/worlds/meadhall.ts` (complete code below)
- Create: `src/worlds/meadhall/kit.ts`, `src/worlds/meadhall/bits.ts` (if needed), `src/worlds/meadhall/room.ts`, `src/worlds/meadhall/stations.ts`, `src/worlds/meadhall/decor.ts`
- Test: `test/meadhall.test.ts` (complete code below)

- [ ] **Step 1: Write the test**

It fixes the contract: every station and piece of decor draws in both wall
frames and as an island, at s = 4 and 16, inside its footprint and height;
animated pieces move while worked and stations hold still otherwise; the wall
pieces keep off the stations and each other and the required ones are always
there; the world's points of interest survive on open floor; every piece of
decor finds floor; the static layer, the shell painted in tiles, each animated
prop's frame and the overlay stay within their budgets, and the overlay moves.

Create `test/meadhall.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { meadhall } from '../src/worlds/meadhall.ts';
import { DECOR_ART } from '../src/worlds/meadhall/decor.ts';
import { planFor } from '../src/worlds/meadhall/room.ts';
import { budget } from './helpers.ts';

// The Longhall's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and stations hold still
// otherwise; the walls keep their windows, shields, banners and antlers off
// the stations; warm round the fire pit and a drink at the long table; the
// shell, its snow and firelight and every prop stay within their time
// budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(meadhall.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>([]);
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];
// Terminals of 10 x 20 cells: 150 x 44, 120 x 33, 80 x 24, 64 x 22 and a
// big 200 x 60; the world's own spots are asked of the roomier ones.
const SIZES: Array<[number, number]> = [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]];
const ROOMY: Array<[number, number]> = [[375, 220], [300, 165], [500, 300]];

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws `art` alone on a transparent canvas; returns the canvas and the
// screen box of its footprint raised to its height.
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean): { c: Canvas; box: Box } {
  const pad = 6 * s;
  const w = Math.ceil((art.len + art.dep) * s + 2 * pad);
  const h = Math.ceil(((art.len + art.dep) / 2 + art.height) * s + 2 * pad);
  const at0 = frame(project(0, 0, s), wall, 0, 0);
  let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const ox = pad - box.x0;
  const oy = pad - box.y0;
  const at = frame(project(ox, oy, s), wall, 0, 0);
  const c = new Canvas(w, h);
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed: 1234 });
  return { c, box: { x0: box.x0 + ox, y0: box.y0 + oy, x1: box.x1 + ox, y1: box.y1 + oy } };
}

// The box round every pixel painted at least `min` (of 255) opaque.
function painted(c: Canvas, min = 16): Box | null {
  let b: Box | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < min) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y };
      else {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

const same = (a: Canvas, b: Canvas) => a.data.length === b.data.length && a.data.every((n, i) => n === b.data[i]);

for (const [name, art] of ARTS) {
  test(`Longhall ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        for (const active of [false, true]) {
          const { c, box } = render(art, s, wall, island, 1.3, active);
          const p = painted(c);
          const tag = `${name} s=${s} ${wall}${island ? ' island' : ''}${active ? ' active' : ''}`;
          assert.ok(p, `${tag}: drew nothing`);
          // ink overhangs by half a line; a unit's slack round the box
          const m = s * 0.6 + 2;
          assert.ok(p.x0 >= box.x0 - m && p.x1 <= box.x1 + m && p.y0 >= box.y0 - m && p.y1 <= box.y1 + m, `${tag}: painted ${JSON.stringify(p)} outside ${JSON.stringify(box)}`);
        }
      }
    }
  });

  if (art.animated) {
    test(`Longhall ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Longhall ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Longhall stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(meadhall.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Longhall room: the walls keep their windows, shields, banners, antlers and herbs off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'meadhall');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows onto the snow`);
    assert.ok(plan.features.some((f) => f.kind === 'shield'), `${L.W}: no shields`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other along the wall
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Longhall points of interest: warm round the fire pit, a drink at the long table', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'meadhall');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(meadhall, L, hashString('meadhall'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, round the fire pit`);
    assert.ok(count('drink') >= 2, `${L.W}: ${count('drink')} drink spots, at the long table`);
    assert.ok(count('seat') >= 1, `${L.W}: ${count('seat')} seat spots, on a bench`);
  }
});

test('Longhall decor: every piece is in DECOR_ART, and each finds floor in a 150 x 44 terminal', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of meadhall.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(meadhall, planLayout(375, 220, 'meadhall'), hashString('meadhall'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
});

test('Longhall room: the shell draws inside the canvas, the snow falls and the firelight flickers, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'meadhall'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(meadhall, L, hashString('meadhall'));
  const s = 4.09;
  const cam = { ox: L.D * s + 30, oy: L.H * s + 20 };
  const c = new Canvas(1500, 920);
  const P = project(cam.ox, cam.oy, s);
  const view = (t: number) => ({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  const props = (t: number, active: boolean, animated: boolean) => {
    for (const p of room.props) {
      if (!!p.art.animated !== animated) continue;
      p.art.draw({ pen: c, s, at: (u, v, z) => P(...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    }
  };
  assert.ok(room.props.some((p) => p.art === DECOR_ART.firepit), 'the fire pit found no floor');
  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  meadhall.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    meadhall.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell a tile at a time, as the scene paints it: no worse than whole.
  const tile = new Canvas(256, 256);
  budget('the shell in tiles', () => {
    for (let ty = 0; ty < 920; ty += 256) {
      for (let tx = 0; tx < 1500; tx += 256) {
        tile.clear();
        meadhall.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: snow falls past the windows and the firelight flickers, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    meadhall.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => meadhall.room.overlay!(view(i / 12)), 3, { calls: 20 });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/meadhall.test.ts`
Expected: FAIL: the file does not load: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/worlds/meadhall.ts'`.

- [ ] **Step 3: The world module**

Create `src/worlds/meadhall.ts`:

```ts
import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './meadhall/decor.ts';
import { INK } from './meadhall/kit.ts';
import { meadhallPois, room } from './meadhall/room.ts';
import { STATIONS } from './meadhall/stations.ts';

// Longhall: a mead hall of timber on stone, firelight on the walls and snow
// at the windows, in outlined cartoon (smoky brown ink): the shell in
// meadhall/room.ts, the stations in meadhall/stations.ts, the furniture in
// meadhall/decor.ts, all drawn with the kit in meadhall/kit.ts and
// meadhall/bits.ts.

const PALETTE: Palette = {
  bg: hex('#120c08'),
  wall: hex('#7a5236'),
  wall2: hex('#5e3e28'),
  floor: hex('#6b5848'),
  floor2: hex('#54453a'),
  text: hex('#f1e4cc'),
  dim: hex('#a08c74'),
  accent: hex('#f0a040'),
  accent2: hex('#7fb4d8'),
  panel: hex('#1a120c'),
  panelText: hex('#f1e4cc'),
  border: hex('#8a5a32'),
  bubble: hex('#fff4e2'),
  bubbleText: hex('#3a2618'),
  good: hex('#8fbf7a'),
  warn: hex('#e8a94e'),
  bad: hex('#c8503a'),
};

export const meadhall: WorldDef = {
  id: 'meadhall',
  name: 'Longhall',
  tagline: 'Firelight on timber, snow at the windows, mead on the long table',
  palette: PALETTE,
  backdrop: hex('#0e0907'),
  ink: INK,
  room,
  pois: meadhallPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'nord',
  critter: { kind: 'fox', body: hex('#d9772e') }, // a fox
  finale: { colors: [[240, 120, 40], [245, 197, 66], [150, 200, 235]] }, // ember, gold and frost-blue confetti
  build: { colors: [hex('#8a8f96'), hex('#6b7077'), hex('#a8adb3'), hex('#f0a040')], shape: 'statue' }, // a carved stone warrior, an ember at its heart
};
```

- [ ] **Step 4: The kit**

Copy `src/worlds/vault/kit.ts` to `src/worlds/meadhall/kit.ts`; in the copy
change the header comment to this world's, the contact shadow's colour in
`Kit.shadow` from `'#04060c'` to `'#140a04'`, and `INK` and `C` to:

```ts
// The one outline colour: a smoky brown.
export const INK = '#2a1a10';

export const C = {
  // timber and stone
  timber: '#7a5236',
  timberLight: '#946646',
  timberDark: '#5e3e28',
  log: '#8c5e3a',
  stone: '#8a8580',
  stoneLight: '#a39e98',
  stoneDark: '#6b6661',
  plank: '#6b5848',
  plankDark: '#54453a',
  rushes: '#c9a85a',
  // iron, gold and leather
  iron: '#5a5e66',
  ironLight: '#7d828b',
  ironDark: '#3f434a',
  gold: '#d9a441',
  leather: '#7a4a2a',
  leatherDark: '#5a3418',
  // cloth for shields and banners: plain colours only
  red: '#9c3b32',
  blue: '#3b5a8c',
  green: '#3f6b45',
  ochre: '#c9873f',
  cream: '#e9dcc0',
  // fire
  ember: '#f07a28',
  flame: '#ffc04a',
  flameHot: '#fff0b0',
  coal: '#3a2620',
  // outside: snow at night
  night: '#26314d',
  nightLow: '#3c4b70',
  snow: '#eef4fa',
  frost: '#9fc8e8',
  pine: '#22303a',
  // fur, horn, feathers, parchment and herbs
  fur: '#a08a6c',
  furDark: '#7d6a52',
  wolf: '#8a8f96',
  wolfDark: '#6a6f76',
  horn: '#e6d6b0',
  raven: '#2a2a35',
  ravenSheen: '#4a5a7a',
  parchment: '#ead9b0',
  herb: '#6f8f4a',
} as const;
```

- [ ] **Step 5: The room (`src/worlds/meadhall/room.ts`)**

**Plan** (`planFor`, see the conventions): `type Kind = 'window' | 'shield' | 'banner' | 'antlers' | 'herbs'`; widths,
caps and what each piece is:

| kind | w (units) | cap | what it is |
| --- | --- | --- | --- |
| `window` | 7 | — | a small shuttered window onto snow at night: `night` to `nightLow`, pine silhouettes (`pine`) with snow on them, snow on the sill; sill at z 12 |
| `shield` | 5 | 4 | a round shield: a plain colour split in halves or quarters (`red`, `blue`, `green`, `ochre`, `cream`, by `k`), an iron rim and boss; no emblem |
| `banner` | 6 | 3 | a cloth banner from a pole: one plain colour with a simple band or knot-border pattern, a swallow-tail or fringed end |
| `antlers` | 7 | 1 | an antler rack on a carved plaque (`horn`) |
| `herbs` | 4 | 2 (filler) | bundles of herbs hanging from a peg rail (`herb`, `rushes`) |

`ORDER`: window, shield, banner, window, antlers, shield, herbs, window, banner, shield; first on each wall: `window`. Required at every
size (the test): `window` and `shield`.

**Floor:** Wide planks (`plank`, `plankDark`) with a border of flat stones (`stone`, `stoneDark`) along both walls, rushes scattered (`rushes`, short strokes when `k.fine`). The front cut in `plankDark`.

**Walls:** A base course of rounded fieldstones (`stone`, `stoneLight`, `stoneDark`) up to z 7, then horizontal split logs (`log`, `timber`, dark seams in `timberDark`), a carved post at each wall's two ends (knotwork bands, no emblem), a heavy roof beam along the top with iron brackets (`iron`); the top of the walls a little smoky (darker toward the top).

**Light:** A warm rim of light from below on the wall pieces; the hall darker toward the top. The fire pit and the braziers (decor) light themselves.

**Overlay** (`room.overlay`): Snow: inside each window 8–14 small flakes (`snow`, 0.2–0.4 units) falling slowly and drifting sideways, wrapping round the glass. Firelight: one soft warm glow (`ember`, `screen`, alpha 0.06–0.12 following `t`, radius about 18 units) on the floor and the lower walls round the fire pit, found as the points of interest find it (`planRoom` seeded by the id, memoized by room size): one gradient, no more.

**Points of interest:** Drinks at either end of the long table (instead of the default one by the forge); warm round the fire pit (instead of the defaults by the table), if the room found floor for it; a look out of up to two windows. The function furnishes the room itself, as the vault's shell does, so `room.ts` imports `STATIONS` and `DECOR`. Paste this into `room.ts`, with these imports:

```ts
import { hashString } from '../../world/rng.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import type { WorldDef } from '../types.ts';
import { DECOR, DECOR_ART } from './decor.ts';
import { STATIONS } from './stations.ts';
```

```ts
// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but a drink at either end of the long table rather than
// by the forge; warm round the fire pit, found where the stage puts it
// (planRoom seeded by the world's id, as the vault finds its decor), or by
// the table if the room had no floor for the pit; a look out of a couple of
// windows.
export function meadhallPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  let out = defaultPois(L).filter((p) => p.kind !== 'drink');
  const table = slot('idle');
  if (table) out.push({ ...at(table, -6, 0), kind: 'drink', face: mid(table) }, { ...at(table, 6, 0), kind: 'drink', face: mid(table) });
  const furnished = planRoom({ id: 'meadhall', stations: STATIONS, decor: DECOR } as unknown as WorldDef, L, hashString('meadhall'));
  const pit = furnished.props.find((p) => p.art === DECOR_ART.firepit);
  if (pit) {
    const r = footprint(pit);
    const face = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    const spots = r.x1 - r.x0 >= r.y1 - r.y0
      ? [{ x: face.x - 5, y: r.y1 + 3 }, { x: face.x + 5, y: r.y1 + 3 }, { x: r.x1 + 3, y: face.y }]
      : [{ x: r.x1 + 3, y: face.y - 5 }, { x: r.x1 + 3, y: face.y + 5 }, { x: face.x, y: r.y1 + 3 }];
    out = out.filter((p) => p.kind !== 'warm');
    for (const s of spots) out.push({ ...s, kind: 'warm', face });
  }
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 2)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}
```

- [ ] **Step 6: The stations (`src/worlds/meadhall/stations.ts`)**

`export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };`

| slot | the prop | footprint | height | animated | while worked |
| --- | --- | --- | --- | --- | --- |
| `write` | a scribe's lectern: a slanted desk on a carved pedestal, an open book, a quill in an ink horn, a candle on its edge; a stool | 11 x 7 | 14 | yes | the quill moves across the page and lines appear (never runes or letters); the candle flickers |
| `read` | timber shelves of leather tomes, scrolls in a rack, a drinking horn and a candle | 14 x 4 | 18 | no | — |
| `search` | a map table against the wall: a spread map (coasts and rivers as plain shapes and lines), a candle, carved markers | 12 x 4 | 9 | yes | the candle flickers and a marker slides across the map |
| `run` | a forge: a stone hearth of glowing coals under a hood and chimney, bellows, an anvil on a stump with a hammer, a quench barrel | 11 x 11 | 16 | yes | the coals pulse; the hammer rises and falls on the anvil; `spark` and `ember` particles |
| `web` | a raven on a T-perch atop a carved post | 9 x 9 | 14 | yes | the raven ruffles its feathers and turns its head |
| `think` | the chief's high seat: a big carved chair (knotwork bands, no emblem), a fur thrown over it, on a low dais with a footstool | 12 x 7 | 17 | no | — |
| `idle` | the long table: planks on trestles, benches either side, drinking horns, a mead jug, bread and a platter | 15 x 11 | 8 | no | — |
| `entrance` | an iron-banded double door under a round arch, ring handles | 15 x 4 | 22 | yes | both leaves swing in while someone passes |

- [ ] **Step 7: The decor (`src/worlds/meadhall/decor.ts`)**

| `DECOR_ART` key | the piece | len x dep x height | place and count | animated |
| --- | --- | --- | --- | --- |
| `firepit` | a long fire pit: a ring of stones, logs and flames (place it first so it gets its floor; if the test says it found none, shorten it, not below 14) | 20 x 8 x 6 | floor 1 | yes: the flames always flicker; `emit` embers and smoke |
| `rack` | a weapon rack: plain spears and axes, a round shield leaning on it | 8 x 3 x 12 | wall 2 | no |
| `rug` | a grey wolf-pelt rug, legs spread, the head at one end (eyes shut, friendly) | 10 x 7 x 1 | floor 1 | no |
| `brazier` | an iron brazier on three legs with a small fire | 4 x 4 x 7 | floor 2 | yes: the flames always flicker |

```ts
export const DECOR: NonNullable<WorldDef['decor']> = [{ art: firepit, count: 1, place: 'floor' }, { art: rack, count: 2, place: 'wall' }, { art: rug, count: 1, place: 'floor' }, { art: brazier, count: 2, place: 'floor' }];

export const DECOR_ART = { firepit, rack, rug, brazier };
```

- [ ] **Step 8: Run the checks**

Run: `node --test test/meadhall.test.ts`
Expected: PASS: `ℹ tests 29`, `ℹ pass 29`, `ℹ fail 0`.

Run: `ANIMUS_THEME_FILE=src/worlds/meadhall.ts node --test test/themes.test.ts`
Expected: PASS: `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0` (its three contract tests among them: `world meadhall: identity, …`, `… a prop for every station, …`, `… the room and every prop draw with the pen, …`).

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

- [ ] **Step 9: Look at it**

Run:

```bash
mkdir -p "$SCRATCH/worlds"
node scripts/scene-shot.ts src/worlds/meadhall.ts "$SCRATCH/worlds/meadhall-150x46.png"
node scripts/scene-shot.ts src/worlds/meadhall.ts "$SCRATCH/worlds/meadhall-100x30.png" --size 100x30
node scripts/scene-shot.ts src/worlds/meadhall.ts "$SCRATCH/worlds/meadhall-zoom.png" --zoom 3 --select 0
```

Expected: one line each, `<path>: <n> KB; first render <n> ms, next plate <n> ms (<n> pictures), encode <n> ms`, the next plate under 25 ms.
Open the three PNGs with the Read tool and go through the checklist below;
fix and render again until it holds.

**Done when** (with the shared checklist in the conventions):

- [ ] Shields and banners carry plain colours and simple patterns only; no horns anywhere (the ★2 helm has none).
- [ ] Snow falls only inside the windows; the hall reads warm and firelit against the cold outside.

- [ ] **Step 10: Commit (the coordinator, after Task 10's review of this world)**

```bash
git add src/worlds/meadhall.ts src/worlds/meadhall/kit.ts src/worlds/meadhall/bits.ts src/worlds/meadhall/room.ts src/worlds/meadhall/stations.ts src/worlds/meadhall/decor.ts test/meadhall.test.ts
git commit -F - <<'EOF'
feat(worlds): Longhall (meadhall)

A Nordic mead hall at night: its shell and overlay, eight stations, its
furniture and points of interest, tested for footprints, animation,
wall pieces and frame time.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

(`git add` skips nothing silently: if `bits.ts` was not needed, drop it from
the list.)


### Task 7: Starfall Base (`starfall`)

A prefab base on a strange bright planet: white modular panels, the back walls mostly glass bays onto a pink sky, teal grass, giant odd flora, two moons and a ringed planet; clean, bright and a little wondrous. Dominant hue: white and pink, with magenta, cyan and gold accents.

**Files** (this task owns these and nothing else):
- Create: `src/worlds/starfall.ts` (complete code below)
- Create: `src/worlds/starfall/kit.ts`, `src/worlds/starfall/bits.ts` (if needed), `src/worlds/starfall/room.ts`, `src/worlds/starfall/stations.ts`, `src/worlds/starfall/decor.ts`
- Test: `test/starfall.test.ts` (complete code below)

- [ ] **Step 1: Write the test**

It fixes the contract: every station and piece of decor draws in both wall
frames and as an island, at s = 4 and 16, inside its footprint and height;
animated pieces move while worked and stations hold still otherwise; the wall
pieces keep off the stations and each other and the required ones are always
there; the world's points of interest survive on open floor; every piece of
decor finds floor; the static layer, the shell painted in tiles, each animated
prop's frame and the overlay stay within their budgets, and the overlay moves.

Create `test/starfall.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { starfall } from '../src/worlds/starfall.ts';
import { DECOR_ART } from '../src/worlds/starfall/decor.ts';
import { planFor } from '../src/worlds/starfall/room.ts';
import { budget } from './helpers.ts';

// The Starfall Base's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise; the
// walls keep their glass bays, screens, vents and lamps off the stations; a
// look through the glass, a drink at the mess bench, warm by the refiner;
// the shell, its motes and falling stars and every prop stay within their
// time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(starfall.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>([]);
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];
// Terminals of 10 x 20 cells: 150 x 44, 120 x 33, 80 x 24, 64 x 22 and a
// big 200 x 60; the world's own spots are asked of the roomier ones.
const SIZES: Array<[number, number]> = [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]];
const ROOMY: Array<[number, number]> = [[375, 220], [300, 165], [500, 300]];

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws `art` alone on a transparent canvas; returns the canvas and the
// screen box of its footprint raised to its height.
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean): { c: Canvas; box: Box } {
  const pad = 6 * s;
  const w = Math.ceil((art.len + art.dep) * s + 2 * pad);
  const h = Math.ceil(((art.len + art.dep) / 2 + art.height) * s + 2 * pad);
  const at0 = frame(project(0, 0, s), wall, 0, 0);
  let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const ox = pad - box.x0;
  const oy = pad - box.y0;
  const at = frame(project(ox, oy, s), wall, 0, 0);
  const c = new Canvas(w, h);
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed: 1234 });
  return { c, box: { x0: box.x0 + ox, y0: box.y0 + oy, x1: box.x1 + ox, y1: box.y1 + oy } };
}

// The box round every pixel painted at least `min` (of 255) opaque.
function painted(c: Canvas, min = 16): Box | null {
  let b: Box | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < min) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y };
      else {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

const same = (a: Canvas, b: Canvas) => a.data.length === b.data.length && a.data.every((n, i) => n === b.data[i]);

for (const [name, art] of ARTS) {
  test(`Starfall Base ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        for (const active of [false, true]) {
          const { c, box } = render(art, s, wall, island, 1.3, active);
          const p = painted(c);
          const tag = `${name} s=${s} ${wall}${island ? ' island' : ''}${active ? ' active' : ''}`;
          assert.ok(p, `${tag}: drew nothing`);
          // ink overhangs by half a line; a unit's slack round the box
          const m = s * 0.6 + 2;
          assert.ok(p.x0 >= box.x0 - m && p.x1 <= box.x1 + m && p.y0 >= box.y0 - m && p.y1 <= box.y1 + m, `${tag}: painted ${JSON.stringify(p)} outside ${JSON.stringify(box)}`);
        }
      }
    }
  });

  if (art.animated) {
    test(`Starfall Base ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Starfall Base ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Starfall Base stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(starfall.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Starfall Base room: the walls keep their glass bays, screens, vents and lamps off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'starfall');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'glass'), `${L.W}: no glass bays onto the planet`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other along the wall
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Starfall Base points of interest: a look through the glass, a drink at the mess bench, warm by the refiner', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'starfall');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(starfall, L, hashString('starfall'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('view') >= 3, `${L.W}: ${count('view')} view spots, two of the stations and the planet`);
    assert.ok(count('drink') >= 2, `${L.W}: ${count('drink')} drink spots, at the food processor`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, by the refiner`);
  }
});

test('Starfall Base decor: every piece is in DECOR_ART, and each finds floor in a 150 x 44 terminal', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of starfall.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(starfall, planLayout(375, 220, 'starfall'), hashString('starfall'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
});

test('Starfall Base room: the shell draws inside the canvas, the motes drift and a star falls, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'starfall'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(starfall, L, hashString('starfall'));
  const s = 4.09;
  const cam = { ox: L.D * s + 30, oy: L.H * s + 20 };
  const c = new Canvas(1500, 920);
  const P = project(cam.ox, cam.oy, s);
  const view = (t: number) => ({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  const props = (t: number, active: boolean, animated: boolean) => {
    for (const p of room.props) {
      if (!!p.art.animated !== animated) continue;
      p.art.draw({ pen: c, s, at: (u, v, z) => P(...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    }
  };

  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  starfall.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    starfall.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell a tile at a time, as the scene paints it: no worse than whole.
  const tile = new Canvas(256, 256);
  budget('the shell in tiles', () => {
    for (let ty = 0; ty < 920; ty += 256) {
      for (let tx = 0; tx < 1500; tx += 256) {
        tile.clear();
        starfall.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: light motes drift and now and then a star falls past the glass, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    starfall.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => starfall.room.overlay!(view(i / 12)), 3, { calls: 20 });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/starfall.test.ts`
Expected: FAIL: the file does not load: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/worlds/starfall.ts'`.

- [ ] **Step 3: The world module**

Create `src/worlds/starfall.ts`:

```ts
import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './starfall/decor.ts';
import { INK } from './starfall/kit.ts';
import { starfallPois, room } from './starfall/room.ts';
import { STATIONS } from './starfall/stations.ts';

// Starfall Base: a prefab base on a bright strange planet, two moons over a
// pink sky past the glass, in outlined cartoon (deep violet ink): the shell
// in starfall/room.ts, the stations in starfall/stations.ts, the furniture
// in starfall/decor.ts, all drawn with the kit in starfall/kit.ts and
// starfall/bits.ts.

const PALETTE: Palette = {
  bg: hex('#140a1c'),
  wall: hex('#d9e2ec'),
  wall2: hex('#aebccc'),
  floor: hex('#8a96a8'),
  floor2: hex('#6f7b8e'),
  text: hex('#f2ecff'),
  dim: hex('#9a8fb4'),
  accent: hex('#ff4fa3'),
  accent2: hex('#38d9e8'),
  panel: hex('#1c1028'),
  panelText: hex('#f2ecff'),
  border: hex('#7a54b8'),
  bubble: hex('#fbf6ff'),
  bubbleText: hex('#2a1a3a'),
  good: hex('#5fe0a0'),
  warn: hex('#ffc04a'),
  bad: hex('#ff5d6c'),
};

export const starfall: WorldDef = {
  id: 'starfall',
  name: 'Starfall Base',
  tagline: 'Two moons over a pink sky, strange flora past the glass',
  palette: PALETTE,
  backdrop: hex('#12081a'),
  ink: INK,
  room,
  pois: starfallPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'exosuit',
  critter: { kind: 'hopper', body: hex('#b07ef0') }, // a fluffy hopper
  finale: { colors: [[255, 79, 163], [56, 217, 232], [255, 200, 74]] }, // magenta, cyan and gold confetti
  build: { colors: [hex('#d9e2ec'), hex('#aebccc'), hex('#ff4fa3'), hex('#38d9e8')], shape: 'tower' }, // a signal beacon, white with magenta and cyan lights
};
```

- [ ] **Step 4: The kit**

Copy `src/worlds/vault/kit.ts` to `src/worlds/starfall/kit.ts`; in the copy
change the header comment to this world's, the contact shadow's colour in
`Kit.shadow` from `'#04060c'` to `'#120a1c'`, and `INK` and `C` to:

```ts
// The one outline colour: a deep violet.
export const INK = '#2a1f3d';

export const C = {
  // the base: white modular panels, deck plates, grates
  panel: '#d9e2ec',
  panelLight: '#eef3f8',
  panelDark: '#aebccc',
  seam: '#8a9ab0',
  deck: '#8a96a8',
  deckDark: '#6f7b8e',
  grate: '#5d687a',
  trim: '#7a54b8',
  // accents and light
  magenta: '#ff4fa3',
  cyan: '#38d9e8',
  gold: '#ffc04a',
  amber: '#ffb347',
  screen: '#7ff6ff',
  holo: '#8ff8ff',
  dark: '#2b2f45',
  // outside: a pink sky, teal grass, odd flora, two moons, a ringed planet
  skyTop: '#ff8ec4',
  skyLow: '#ffd1a8',
  grass: '#2fbfa8',
  grassDark: '#1f8f80',
  hill: '#44d4b8',
  flora: '#ff7ad1',
  flora2: '#9b6cff',
  flora3: '#ffd84a',
  stalk: '#3a8a7a',
  moon: '#f6f0ff',
  moon2: '#cfe6ff',
  planet: '#ffb86b',
  ring: '#ffe2b8',
  glass: '#bfe9ff',
  // crates and pods
  orange: '#ff8a3a',
  white: '#f6f8fb',
} as const;
```

- [ ] **Step 5: The room (`src/worlds/starfall/room.ts`)**

**Plan** (`planFor`, see the conventions): `type Kind = 'glass' | 'screen' | 'vent' | 'lamp'`; widths,
caps and what each piece is:

| kind | w (units) | cap | what it is |
| --- | --- | --- | --- |
| `glass` | 14 | — | a big glass bay with a rounded top in a thick white frame; through it a pink sky (`skyTop` down to `skyLow`), teal hills (`hill`, `grass`, `grassDark`), giant odd flora (bulb-topped stalks, spiral fronds, puffball trees in `flora`, `flora2`, `flora3` on `stalk`); in the first bay on the right wall two moons (`moon`, `moon2`), in the first on the left wall a ringed planet low over the hills (`planet`, `ring`) |
| `screen` | 6 | 2 | a wall screen with a planet map: blobs and contour lines and a blinking dot; no text |
| `vent` | 4 | 3 | a round air vent with slats |
| `lamp` | 2 | — (filler) | a slim strip lamp, lit |

`ORDER`: glass, screen, glass, vent, glass, screen, vent, glass; first on each wall: `glass`. Required at every
size (the test): `glass`.

**Floor:** Modular deck plates (`deck`, `deckDark`) in 8-unit squares with rounded corners and seams, grate strips (`grate`) along both walls, a few small round floor lights (cyan). The front cut in `deckDark`.

**Walls:** White modular panels (`panel`, `panelLight`, `panelDark`) with seams and rounded corners, a trim band (`trim`) at z 6, small lights along the top edge.

**Light:** Cool light pools on the floor below the glass bays; small halos at the lamps.

**Overlay** (`room.overlay`): 8–12 slow light motes (soft dots 0.3–0.6 units in cyan, magenta and gold at alpha at most 0.5) drifting in the air before the glass bays, each on its own slow loop; and in one glass bay a shooting star: a short bright streak with a fading tail crossing the sky for about a second every seven.

**Points of interest:** Drinks either side of the food processor on the mess bench (idle) and warm either side of the refiner (run), instead of the defaults; a look out through up to three glass bays. Paste this into `room.ts`, with these imports:

```ts
import { defaultPois, footprint } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
```

```ts
// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but a drink either side of the food processor on the
// mess bench, warm either side of the refiner's glow, and a look out
// through the glass bays.
export function starfallPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).filter((p) => p.kind !== 'warm' && p.kind !== 'drink');
  const mess = slot('idle');
  const refiner = slot('run');
  if (mess) out.push({ ...at(mess, -6, 0), kind: 'drink', face: mid(mess) }, { ...at(mess, 6, 0), kind: 'drink', face: mid(mess) });
  if (refiner) out.push({ ...at(refiner, -7, 0), kind: 'warm', face: mid(refiner) }, { ...at(refiner, 7, 0), kind: 'warm', face: mid(refiner) });
  for (const f of fs.filter((g) => g.kind === 'glass').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 7), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}
```

- [ ] **Step 6: The stations (`src/worlds/starfall/stations.ts`)**

`export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };`

| slot | the prop | footprint | height | animated | while worked |
| --- | --- | --- | --- | --- | --- |
| `write` | a holo desk: a curved white desk with a projector bar; over it a translucent cyan projection (panels, a chart line, a wire globe) | 11 x 7 | 14 | yes | the projection is on: it flickers and a scan line runs down it (idle: only the projector bar's dim lights) |
| `read` | a rack of data cubes: white shelves of small glowing cubes in cyan, magenta and gold | 14 x 4 | 16 | yes | a highlight travels along the cubes (idle: a steady glow) |
| `search` | a scanner on a stand: a tripod, a dish-like head and a small screen | 12 x 4 | 14 | yes | a translucent fan of light sweeps from the head; a blip on the screen |
| `run` | a refiner: a squat cylinder with a glowing core window, an intake hopper, pipes and a stack | 11 x 11 | 15 | yes | the core pulses, a piston chugs; puffs of `steam` |
| `web` | a comms dish on a pylon with a feed horn and a light at its tip | 9 x 9 | 18 | yes | the dish turns slowly and the tip light blinks |
| `think` | a pilot's chair turned toward the back wall (we see its high padded back and headrest), a console arc before it with a small hologram globe | 12 x 7 | 12 | no | — |
| `idle` | a mess bench: a table and two benches, trays and cups, a boxy food processor with a glowing slot at one end | 15 x 11 | 10 | no | — |
| `entrance` | an airlock: a rounded hatch frame, two sliding door halves, an amber warning light above, a small panel | 15 x 4 | 20 | yes | the halves slide apart and the light blinks while someone passes |

- [ ] **Step 7: The decor (`src/worlds/starfall/decor.ts`)**

| `DECOR_ART` key | the piece | len x dep x height | place and count | animated |
| --- | --- | --- | --- | --- |
| `pod` | a storage pod: a white capsule container with a colour band and a handle | 6 x 5 x 10 | wall 2 | no |
| `crate` | a cargo crate, white and orange, with handles | 5 x 5 x 5 | floor 2 | no |
| `plant` | a potted alien plant: glowing bulbous pods or spiral fronds (by seed) | 4 x 4 x 9 | floor 3 | no |
| `beacon` | a landing-pad beacon: a short post with a light | 4 x 4 x 12 | floor 1 | yes: the light always blinks |

```ts
export const DECOR: NonNullable<WorldDef['decor']> = [{ art: pod, count: 2, place: 'wall' }, { art: crate, count: 2, place: 'floor' }, { art: plant, count: 3, place: 'floor' }, { art: beacon, count: 1, place: 'floor' }];

export const DECOR_ART = { pod, crate, plant, beacon };
```

- [ ] **Step 8: Run the checks**

Run: `node --test test/starfall.test.ts`
Expected: PASS: `ℹ tests 29`, `ℹ pass 29`, `ℹ fail 0`.

Run: `ANIMUS_THEME_FILE=src/worlds/starfall.ts node --test test/themes.test.ts`
Expected: PASS: `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0` (its three contract tests among them: `world starfall: identity, …`, `… a prop for every station, …`, `… the room and every prop draw with the pen, …`).

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

- [ ] **Step 9: Look at it**

Run:

```bash
mkdir -p "$SCRATCH/worlds"
node scripts/scene-shot.ts src/worlds/starfall.ts "$SCRATCH/worlds/starfall-150x46.png"
node scripts/scene-shot.ts src/worlds/starfall.ts "$SCRATCH/worlds/starfall-100x30.png" --size 100x30
node scripts/scene-shot.ts src/worlds/starfall.ts "$SCRATCH/worlds/starfall-zoom.png" --zoom 3 --select 0
```

Expected: one line each, `<path>: <n> KB; first render <n> ms, next plate <n> ms (<n> pictures), encode <n> ms`, the next plate under 25 ms.
Open the three PNGs with the Read tool and go through the checklist below;
fix and render again until it holds.

**Done when** (with the shared checklist in the conventions):

- [ ] In the default 150x46 render the planet reads strange and bright: pink sky, teal hills, odd flora, two moons and a ringed planet.
- [ ] The pilot's chair shows its back, facing the glass.

- [ ] **Step 10: Commit (the coordinator, after Task 10's review of this world)**

```bash
git add src/worlds/starfall.ts src/worlds/starfall/kit.ts src/worlds/starfall/bits.ts src/worlds/starfall/room.ts src/worlds/starfall/stations.ts src/worlds/starfall/decor.ts test/starfall.test.ts
git commit -F - <<'EOF'
feat(worlds): Starfall Base (starfall)

A prefab base on a strange bright planet: its shell and overlay, eight stations, its
furniture and points of interest, tested for footprints, animation,
wall pieces and frame time.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

(`git add` skips nothing silently: if `bits.ts` was not needed, drop it from
the list.)


### Task 8: Atomic Shelter (`shelter`)

A retro-atomic bunker deep under the wasteland: riveted steel walls, pipes, hazard stripes, recessed lights, a flickering tube; snug and a little worn, mid-century in its furniture. Dominant hue: green-grey steel, with shelter blue, yellow and a green glow.

**Files** (this task owns these and nothing else):
- Create: `src/worlds/shelter.ts` (complete code below)
- Create: `src/worlds/shelter/kit.ts`, `src/worlds/shelter/bits.ts` (if needed), `src/worlds/shelter/room.ts`, `src/worlds/shelter/stations.ts`, `src/worlds/shelter/decor.ts`
- Test: `test/shelter.test.ts` (complete code below)

- [ ] **Step 1: Write the test**

It fixes the contract: every station and piece of decor draws in both wall
frames and as an island, at s = 4 and 16, inside its footprint and height;
animated pieces move while worked and stations hold still otherwise; the wall
pieces keep off the stations and each other and the required ones are always
there; the world's points of interest survive on open floor; every piece of
decor finds floor; the static layer, the shell painted in tiles, each animated
prop's frame and the overlay stay within their budgets, and the overlay moves.

Create `test/shelter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { shelter } from '../src/worlds/shelter.ts';
import { DECOR_ART } from '../src/worlds/shelter/decor.ts';
import { planFor } from '../src/worlds/shelter/room.ts';
import { budget } from './helpers.ts';

// The Atomic Shelter's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise; the
// walls keep their tubes, pipes, vents, fuse boxes and clocks off the
// stations; a dance by the jukebox, a seat in the booth, warm by the valve
// radio; the shell, its flickering tubes and dust and every prop stay
// within their time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(shelter.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>([]);
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];
// Terminals of 10 x 20 cells: 150 x 44, 120 x 33, 80 x 24, 64 x 22 and a
// big 200 x 60; the world's own spots are asked of the roomier ones.
const SIZES: Array<[number, number]> = [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]];
const ROOMY: Array<[number, number]> = [[375, 220], [300, 165], [500, 300]];

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws `art` alone on a transparent canvas; returns the canvas and the
// screen box of its footprint raised to its height.
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean): { c: Canvas; box: Box } {
  const pad = 6 * s;
  const w = Math.ceil((art.len + art.dep) * s + 2 * pad);
  const h = Math.ceil(((art.len + art.dep) / 2 + art.height) * s + 2 * pad);
  const at0 = frame(project(0, 0, s), wall, 0, 0);
  let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const ox = pad - box.x0;
  const oy = pad - box.y0;
  const at = frame(project(ox, oy, s), wall, 0, 0);
  const c = new Canvas(w, h);
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed: 1234 });
  return { c, box: { x0: box.x0 + ox, y0: box.y0 + oy, x1: box.x1 + ox, y1: box.y1 + oy } };
}

// The box round every pixel painted at least `min` (of 255) opaque.
function painted(c: Canvas, min = 16): Box | null {
  let b: Box | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < min) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y };
      else {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

const same = (a: Canvas, b: Canvas) => a.data.length === b.data.length && a.data.every((n, i) => n === b.data[i]);

for (const [name, art] of ARTS) {
  test(`Atomic Shelter ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        for (const active of [false, true]) {
          const { c, box } = render(art, s, wall, island, 1.3, active);
          const p = painted(c);
          const tag = `${name} s=${s} ${wall}${island ? ' island' : ''}${active ? ' active' : ''}`;
          assert.ok(p, `${tag}: drew nothing`);
          // ink overhangs by half a line; a unit's slack round the box
          const m = s * 0.6 + 2;
          assert.ok(p.x0 >= box.x0 - m && p.x1 <= box.x1 + m && p.y0 >= box.y0 - m && p.y1 <= box.y1 + m, `${tag}: painted ${JSON.stringify(p)} outside ${JSON.stringify(box)}`);
        }
      }
    }
  });

  if (art.animated) {
    test(`Atomic Shelter ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Atomic Shelter ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Atomic Shelter stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(shelter.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Atomic Shelter room: the walls keep their tubes, pipes, vents, fuse boxes and clocks off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'shelter');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'tube'), `${L.W}: no fluorescent tubes`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other along the wall
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Atomic Shelter points of interest: a dance by the jukebox, a seat in the booth, warm by the radio', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'shelter');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(shelter, L, hashString('shelter'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('dance') >= 4, `${L.W}: ${count('dance')} dance spots, by the jukebox and on the floor`);
    assert.ok(count('seat') >= 2, `${L.W}: ${count('seat')} seat spots, in the booth`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, by the valve radio`);
  }
});

test('Atomic Shelter decor: every piece is in DECOR_ART, and each finds floor in a 150 x 44 terminal', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of shelter.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(shelter, planLayout(375, 220, 'shelter'), hashString('shelter'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
});

test('Atomic Shelter room: the shell draws inside the canvas, the tubes flicker and dust drifts down, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'shelter'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(shelter, L, hashString('shelter'));
  const s = 4.09;
  const cam = { ox: L.D * s + 30, oy: L.H * s + 20 };
  const c = new Canvas(1500, 920);
  const P = project(cam.ox, cam.oy, s);
  const view = (t: number) => ({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  const props = (t: number, active: boolean, animated: boolean) => {
    for (const p of room.props) {
      if (!!p.art.animated !== animated) continue;
      p.art.draw({ pen: c, s, at: (u, v, z) => P(...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    }
  };

  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  shelter.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    shelter.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell a tile at a time, as the scene paints it: no worse than whole.
  const tile = new Canvas(256, 256);
  budget('the shell in tiles', () => {
    for (let ty = 0; ty < 920; ty += 256) {
      for (let tx = 0; tx < 1500; tx += 256) {
        tile.clear();
        shelter.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: the fluorescent tubes flicker and dust drifts down, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    shelter.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => shelter.room.overlay!(view(i / 12)), 3, { calls: 20 });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/shelter.test.ts`
Expected: FAIL: the file does not load: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/worlds/shelter.ts'`.

- [ ] **Step 3: The world module**

Create `src/worlds/shelter.ts`:

```ts
import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './shelter/decor.ts';
import { INK } from './shelter/kit.ts';
import { shelterPois, room } from './shelter/room.ts';
import { STATIONS } from './shelter/stations.ts';

// Atomic Shelter: a retro-atomic bunker under the wasteland, riveted steel,
// humming tubes and a jukebox, in outlined cartoon (dark green-grey ink):
// the shell in shelter/room.ts, the stations in shelter/stations.ts, the
// furniture in shelter/decor.ts, all drawn with the kit in shelter/kit.ts
// and shelter/bits.ts.

const PALETTE: Palette = {
  bg: hex('#0b0f0c'),
  wall: hex('#7d8a7a'),
  wall2: hex('#5f6b5d'),
  floor: hex('#5a5e58'),
  floor2: hex('#474b46'),
  text: hex('#e8f0dc'),
  dim: hex('#8a9886'),
  accent: hex('#f2c230'),
  accent2: hex('#3f7fd0'),
  panel: hex('#121812'),
  panelText: hex('#e8f0dc'),
  border: hex('#4f6a4a'),
  bubble: hex('#f6fbea'),
  bubbleText: hex('#22301e'),
  good: hex('#7fe07a'),
  warn: hex('#f2c230'),
  bad: hex('#e05040'),
};

export const shelter: WorldDef = {
  id: 'shelter',
  name: 'Atomic Shelter',
  tagline: 'Riveted steel and a jukebox, deep under the wasteland',
  palette: PALETTE,
  backdrop: hex('#090c0a'),
  ink: INK,
  room,
  pois: shelterPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'jumpsuit',
  critter: { kind: 'rat', body: hex('#8f857a') }, // a shelter rat
  finale: { colors: [[63, 127, 208], [242, 194, 48], [127, 224, 122]] }, // shelter blue, yellow and green confetti
  build: { colors: [hex('#7d8a7a'), hex('#5f6b5d'), hex('#f2c230'), hex('#7fe07a')], shape: 'machine' }, // a small reactor, steel with yellow and a green glow
};
```

- [ ] **Step 4: The kit**

Copy `src/worlds/vault/kit.ts` to `src/worlds/shelter/kit.ts`; in the copy
change the header comment to this world's, the contact shadow's colour in
`Kit.shadow` from `'#04060c'` to `'#0a0d0a'`, and `INK` and `C` to:

```ts
// The one outline colour: a dark green-grey.
export const INK = '#1e2620';

export const C = {
  // steel, concrete and paint
  steel: '#7d8a7a',
  steelLight: '#97a596',
  steelDark: '#5f6b5d',
  rivet: '#a9b5a6',
  concrete: '#5a5e58',
  concreteDark: '#474b46',
  blue: '#3f7fd0',
  blueDark: '#2f62a6',
  yellow: '#f2c230',
  black: '#2a2a26',
  red: '#c8463a',
  cream: '#efe6cc',
  // pipes, brass and chrome
  copper: '#b87333',
  copperDark: '#8a5424',
  pipe: '#6f7f8c',
  brass: '#d4a24a',
  chrome: '#cfd4d6',
  // light and screens
  lamp: '#fff3c4',
  tube: '#e8fff4',
  crt: '#39ff6e',
  crtDim: '#1a7a3a',
  crtDark: '#0c2a14',
  radar: '#7dff9a',
  valve: '#ffb347',
  // wood, cloth, water and odd plants
  wood: '#7a5236',
  woodDark: '#5a3a22',
  leather: '#8c3a2e',
  vinyl: '#c8463a',
  water: '#7fc8e8',
  leaf: '#7fbf4a',
  leafOdd: '#b8e04a',
  glow: '#d8ff6a',
} as const;
```

- [ ] **Step 5: The room (`src/worlds/shelter/room.ts`)**

**Plan** (`planFor`, see the conventions): `type Kind = 'tube' | 'pipes' | 'vent' | 'fuse' | 'clock'`; widths,
caps and what each piece is:

| kind | w (units) | cap | what it is |
| --- | --- | --- | --- |
| `tube` | 8 | 4 | a fluorescent tube fixture high on the wall: a metal housing and a pale tube, its cool light a soft pool below (drawn lit; the overlay makes it flicker) |
| `pipes` | 10 | 3 | vertical pipe runs (copper and grey) with a hand-wheel valve and a round gauge (a needle and ticks, no digits) |
| `vent` | 4 | 3 (filler) | a square louvred vent |
| `fuse` | 5 | 2 | a fuse box with a hazard-striped door and a lever |
| `clock` | 3 | 1 | a round wall clock: ticks and two hands, no digits |

`ORDER`: tube, pipes, fuse, tube, vent, clock, pipes, tube, vent; first on each wall: `tube`. Required at every
size (the test): `tube`.

**Floor:** Concrete slabs (`concrete`, `concreteDark`) with joints; a painted hazard-stripe border (`yellow` and `black` diagonals) along the foot of both walls. The front cut in `concreteDark`.

**Walls:** Riveted steel plates (`steel`, `steelLight`, `steelDark`, rivets in `rivet`) in rows; a dado band in shelter blue (`blue`) with a thin yellow line at z 8; a run of pipes (`pipe`, `copper`) along the top with brackets and a valve or two; recessed caged lights along the top.

**Light:** Cool pools under the tubes; small warm halos at the recessed lights.

**Overlay** (`room.overlay`): Each tube flickers: on most of the time (a soft cool glow round it), dim or off for a few frames at moments picked by `hash(f.k, Math.floor(t * 8))`, differently per tube; and dust: in the light below each tube 5–8 small pale motes drifting slowly down and wrapping.

**Points of interest:** Two more dance spots by the jukebox and a seat at the end of the booth (the idle prop); warm either side of the valve radio (think) instead of by the booth. Paste this into `room.ts`, with these imports:

```ts
import { defaultPois, footprint } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
```

```ts
// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, two more to dance by the jukebox and a seat at the end
// of the booth (the idle prop), and warm by the valve radio's glow rather
// than at the booth.
export function shelterPois(L: Layout): Poi[] {
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).filter((p) => p.kind !== 'warm');
  const juke = slot('idle');
  const radio = slot('think');
  if (juke) out.push({ ...at(juke, -4, 2), kind: 'dance', face: mid(juke) }, { ...at(juke, 2, 3), kind: 'dance', face: mid(juke) }, { ...at(juke, -9, 1), kind: 'seat', face: mid(juke) });
  if (radio) out.push({ ...at(radio, -5, 1), kind: 'warm', face: mid(radio) }, { ...at(radio, 5, 1), kind: 'warm', face: mid(radio) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}
```

- [ ] **Step 6: The stations (`src/worlds/shelter/stations.ts`)**

`export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };`

| slot | the prop | footprint | height | animated | while worked |
| --- | --- | --- | --- | --- | --- |
| `write` | a typewriter desk: a steel desk, a typewriter with a sheet in the roller (grey lines, no text), a stack of papers, a desk lamp, a swivel chair | 11 x 7 | 11 | yes | the carriage steps across, keys bob, lines grow on the sheet |
| `read` | two four-drawer steel filing cabinets with pull handles, binders and manuals on top (coloured spines, no text) | 14 x 4 | 16 | no | — |
| `search` | a radar console: a round green scope (rings and a cross) in a steel console with knobs | 12 x 4 | 12 | yes | the sweep turns and a blip lights behind it (idle: the scope glows dim with its rings) |
| `run` | a water purifier: two tanks with glass sight tubes, round gauges (needles, no digits), pipes and valve wheels | 11 x 11 | 15 | yes | bubbles rise in the sight tubes, the needles wobble; a puff of `steam` |
| `web` | a green-screen terminal on a steel desk: a chunky monitor and a keyboard | 9 x 9 | 12 | yes | glyph-like green marks (short bars of varying length, never letters) scroll up the screen |
| `think` | a worn, patched armchair beside a wooden cabinet radio with a glowing dial | 12 x 7 | 11 | no | the dial's warm glow is still |
| `idle` | a jukebox (rounded top, coloured light bands, a chrome grille; no logo) and a diner booth (two padded benches and a table) | 15 x 11 | 13 | yes | the jukebox's light bands cycle |
| `entrance` | a rectangular blast door: a heavy steel door in a thick frame striped with hazard yellow and black, a big spoked hand-wheel in its middle, heavy hinges; never round, never cog-shaped | 15 x 4 | 22 | yes | the wheel turns and the door swings ajar while someone passes |

- [ ] **Step 7: The decor (`src/worlds/shelter/decor.ts`)**

| `DECOR_ART` key | the piece | len x dep x height | place and count | animated |
| --- | --- | --- | --- | --- |
| `cans` | steel shelves of canned food: tins with plain coloured bands, no text | 8 x 3 x 13 | wall 2 | no |
| `lockers` | a bank of three steel lockers with vents | 9 x 3 x 15 | wall 1 | no |
| `drums` | blue water drums with a tap, on a pallet | 5 x 5 x 6 | floor 2 | no |
| `mutant` | a mutant potted plant: bulbous, with odd leaves and a faint green glow | 4 x 4 x 9 | floor 1 | no |

```ts
export const DECOR: NonNullable<WorldDef['decor']> = [{ art: cans, count: 2, place: 'wall' }, { art: lockers, count: 1, place: 'wall' }, { art: drums, count: 2, place: 'floor' }, { art: mutant, count: 1, place: 'floor' }];

export const DECOR_ART = { cans, lockers, drums, mutant };
```

- [ ] **Step 8: Run the checks**

Run: `node --test test/shelter.test.ts`
Expected: PASS: `ℹ tests 29`, `ℹ pass 29`, `ℹ fail 0`.

Run: `ANIMUS_THEME_FILE=src/worlds/shelter.ts node --test test/themes.test.ts`
Expected: PASS: `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0` (its three contract tests among them: `world shelter: identity, …`, `… a prop for every station, …`, `… the room and every prop draw with the pen, …`).

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

- [ ] **Step 9: Look at it**

Run:

```bash
mkdir -p "$SCRATCH/worlds"
node scripts/scene-shot.ts src/worlds/shelter.ts "$SCRATCH/worlds/shelter-150x46.png"
node scripts/scene-shot.ts src/worlds/shelter.ts "$SCRATCH/worlds/shelter-100x30.png" --size 100x30
node scripts/scene-shot.ts src/worlds/shelter.ts "$SCRATCH/worlds/shelter-zoom.png" --zoom 3 --select 0
```

Expected: one line each, `<path>: <n> KB; first render <n> ms, next plate <n> ms (<n> pictures), encode <n> ms`, the next plate under 25 ms.
Open the three PNGs with the Read tool and go through the checklist below;
fix and render again until it holds.

**Done when** (with the shared checklist in the conventions):

- [ ] The blast door is rectangular with a hand-wheel; no numbers, digits or logos anywhere (doors, suits, tins, screens, gauges, the clock).
- [ ] Renders at `--at 20` and `--at 21` show the tubes in different states or the dust moved.

- [ ] **Step 10: Commit (the coordinator, after Task 10's review of this world)**

```bash
git add src/worlds/shelter.ts src/worlds/shelter/kit.ts src/worlds/shelter/bits.ts src/worlds/shelter/room.ts src/worlds/shelter/stations.ts src/worlds/shelter/decor.ts test/shelter.test.ts
git commit -F - <<'EOF'
feat(worlds): Atomic Shelter (shelter)

A retro-atomic bunker deep under the wasteland: its shell and overlay, eight stations, its
furniture and points of interest, tested for footprints, animation,
wall pieces and frame time.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

(`git add` skips nothing silently: if `bits.ts` was not needed, drop it from
the list.)


### Task 9: Frontier Colony (`colony`)

A colony base on a frontier world at dusk: rough stone and plank walls, windows onto green hills under a big sky, a campfire burning in the middle of the room, fireflies outside; homely and hard-working. Dominant hue: warm wood and stone, with grass green and sky blue.

**Files** (this task owns these and nothing else):
- Create: `src/worlds/colony.ts` (complete code below)
- Create: `src/worlds/colony/kit.ts`, `src/worlds/colony/bits.ts` (if needed), `src/worlds/colony/room.ts`, `src/worlds/colony/stations.ts`, `src/worlds/colony/decor.ts`
- Test: `test/colony.test.ts` (complete code below)

- [ ] **Step 1: Write the test**

It fixes the contract: every station and piece of decor draws in both wall
frames and as an island, at s = 4 and 16, inside its footprint and height;
animated pieces move while worked and stations hold still otherwise; the wall
pieces keep off the stations and each other and the required ones are always
there; the world's points of interest survive on open floor; every piece of
decor finds floor; the static layer, the shell painted in tiles, each animated
prop's frame and the overlay stay within their budgets, and the overlay moves.

Create `test/colony.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { colony } from '../src/worlds/colony.ts';
import { DECOR_ART } from '../src/worlds/colony/decor.ts';
import { planFor } from '../src/worlds/colony/room.ts';
import { budget } from './helpers.ts';

// The Frontier Colony's art: every piece draws in both wall frames and as
// an island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise (the
// campfire burns whoever sits by it); the walls keep their windows, tool
// boards, lamps and maps off the stations; warm round the campfire, a seat
// on a log, a look at the hills; the shell, its firelight and fireflies and
// every prop stay within their time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(colony.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>(['idle']);
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];
// Terminals of 10 x 20 cells: 150 x 44, 120 x 33, 80 x 24, 64 x 22 and a
// big 200 x 60; the world's own spots are asked of the roomier ones.
const SIZES: Array<[number, number]> = [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]];
const ROOMY: Array<[number, number]> = [[375, 220], [300, 165], [500, 300]];

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws `art` alone on a transparent canvas; returns the canvas and the
// screen box of its footprint raised to its height.
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean): { c: Canvas; box: Box } {
  const pad = 6 * s;
  const w = Math.ceil((art.len + art.dep) * s + 2 * pad);
  const h = Math.ceil(((art.len + art.dep) / 2 + art.height) * s + 2 * pad);
  const at0 = frame(project(0, 0, s), wall, 0, 0);
  let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const ox = pad - box.x0;
  const oy = pad - box.y0;
  const at = frame(project(ox, oy, s), wall, 0, 0);
  const c = new Canvas(w, h);
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed: 1234 });
  return { c, box: { x0: box.x0 + ox, y0: box.y0 + oy, x1: box.x1 + ox, y1: box.y1 + oy } };
}

// The box round every pixel painted at least `min` (of 255) opaque.
function painted(c: Canvas, min = 16): Box | null {
  let b: Box | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < min) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y };
      else {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

const same = (a: Canvas, b: Canvas) => a.data.length === b.data.length && a.data.every((n, i) => n === b.data[i]);

for (const [name, art] of ARTS) {
  test(`Frontier Colony ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        for (const active of [false, true]) {
          const { c, box } = render(art, s, wall, island, 1.3, active);
          const p = painted(c);
          const tag = `${name} s=${s} ${wall}${island ? ' island' : ''}${active ? ' active' : ''}`;
          assert.ok(p, `${tag}: drew nothing`);
          // ink overhangs by half a line; a unit's slack round the box
          const m = s * 0.6 + 2;
          assert.ok(p.x0 >= box.x0 - m && p.x1 <= box.x1 + m && p.y0 >= box.y0 - m && p.y1 <= box.y1 + m, `${tag}: painted ${JSON.stringify(p)} outside ${JSON.stringify(box)}`);
        }
      }
    }
  });

  if (art.animated) {
    test(`Frontier Colony ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Frontier Colony ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Frontier Colony stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(colony.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Frontier Colony room: the walls keep their windows, tool boards, lamps and maps off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'colony');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows onto the hills`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other along the wall
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Frontier Colony points of interest: warm round the campfire, a seat on a log, a look at the hills', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'colony');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(colony, L, hashString('colony'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, round the campfire`);
    assert.ok(count('seat') >= 2, `${L.W}: ${count('seat')} seat spots, on the log seats`);
    assert.ok(count('view') >= 3, `${L.W}: ${count('view')} view spots, two of the stations and the hills`);
  }
});

test('Frontier Colony decor: every piece is in DECOR_ART, and each finds floor in a 150 x 44 terminal', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of colony.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(colony, planLayout(375, 220, 'colony'), hashString('colony'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
});

test('Frontier Colony room: the shell draws inside the canvas, the campfire flickers and fireflies blink, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'colony'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(colony, L, hashString('colony'));
  const s = 4.09;
  const cam = { ox: L.D * s + 30, oy: L.H * s + 20 };
  const c = new Canvas(1500, 920);
  const P = project(cam.ox, cam.oy, s);
  const view = (t: number) => ({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  const props = (t: number, active: boolean, animated: boolean) => {
    for (const p of room.props) {
      if (!!p.art.animated !== animated) continue;
      p.art.draw({ pen: c, s, at: (u, v, z) => P(...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    }
  };

  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  colony.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    colony.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell a tile at a time, as the scene paints it: no worse than whole.
  const tile = new Canvas(256, 256);
  budget('the shell in tiles', () => {
    for (let ty = 0; ty < 920; ty += 256) {
      for (let tx = 0; tx < 1500; tx += 256) {
        tile.clear();
        colony.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: the campfire's light flickers on the walls and fireflies blink outside, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    colony.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => colony.room.overlay!(view(i / 12)), 3, { calls: 20 });
});
```

- [ ] **Step 2: Run the test to see it fail**

Run: `node --test test/colony.test.ts`
Expected: FAIL: the file does not load: `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/src/worlds/colony.ts'`.

- [ ] **Step 3: The world module**

Create `src/worlds/colony.ts`:

```ts
import { hex } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { WorldDef } from './types.ts';
import { DECOR } from './colony/decor.ts';
import { INK } from './colony/kit.ts';
import { colonyPois, room } from './colony/room.ts';
import { STATIONS } from './colony/stations.ts';

// Frontier Colony: stone and planks under a big sky, a campfire and a husky,
// in outlined cartoon (dark earth-brown ink): the shell in colony/room.ts,
// the stations in colony/stations.ts, the furniture in colony/decor.ts, all
// drawn with the kit in colony/kit.ts and colony/bits.ts.

const PALETTE: Palette = {
  bg: hex('#11130c'),
  wall: hex('#a89a82'),
  wall2: hex('#8a7c64'),
  floor: hex('#8a6a44'),
  floor2: hex('#6e5436'),
  text: hex('#f2ead8'),
  dim: hex('#a39a80'),
  accent: hex('#7cc04a'),
  accent2: hex('#6aaee0'),
  panel: hex('#1a1a10'),
  panelText: hex('#f2ead8'),
  border: hex('#7a6a44'),
  bubble: hex('#fbf7ec'),
  bubbleText: hex('#2f2a1c'),
  good: hex('#7cc04a'),
  warn: hex('#e8b04a'),
  bad: hex('#d0583e'),
};

export const colony: WorldDef = {
  id: 'colony',
  name: 'Frontier Colony',
  tagline: 'Stone and planks under a big sky, a campfire and a husky',
  palette: PALETTE,
  backdrop: hex('#0e100a'),
  ink: INK,
  room,
  pois: colonyPois,
  stations: STATIONS,
  decor: DECOR,
  costume: 'colonist',
  critter: { kind: 'husky', body: hex('#8a929e') }, // a husky
  finale: { colors: [[124, 192, 74], [140, 98, 58], [106, 174, 224]] }, // grass green, wood brown and sky blue confetti
  build: { colors: [hex('#8c623a'), hex('#6e4a2a'), hex('#a8a090'), hex('#7cc04a')], shape: 'house' }, // a log cabin with a stone chimney and a green roof
};
```

- [ ] **Step 4: The kit**

Copy `src/worlds/vault/kit.ts` to `src/worlds/colony/kit.ts`; in the copy
change the header comment to this world's, the contact shadow's colour in
`Kit.shadow` from `'#04060c'` to `'#100c06'`, and `INK` and `C` to:

```ts
// The one outline colour: a dark earth brown.
export const INK = '#2a2216';

export const C = {
  // stone and planks
  stone: '#a89a82',
  stoneLight: '#c0b39a',
  stoneDark: '#8a7c64',
  mortar: '#c9bca2',
  plank: '#8c623a',
  plankLight: '#a8784a',
  plankDark: '#6e4a2a',
  floor: '#8a6a44',
  floorDark: '#6e5436',
  log: '#7a5232',
  bark: '#5a3a22',
  // metal
  steel: '#9aa3ab',
  steelDark: '#6f7880',
  iron: '#4a4a52',
  // fire and lamps
  fire: '#ff8a2a',
  flame: '#ffc04a',
  flameHot: '#fff0b0',
  ember: '#ff5a1a',
  lamp: '#ffe08a',
  sun: '#fff6c8',
  // outside: hills at dusk
  skyTop: '#5a7fc0',
  skyLow: '#f8c890',
  cloud: '#f6e6d8',
  hill: '#4f8a3a',
  hillFar: '#7aa860',
  firefly: '#f8ff9a',
  // cloth, plants, paper and the chess board
  canvas: '#d9c9a0',
  cloth: '#c0503a',
  clothBlue: '#3f6a9a',
  green: '#7cc04a',
  leaf: '#5f9a3a',
  grow: '#b07aff',
  white: '#eef0ea',
  paper: '#efe4cc',
  chessDark: '#3a3028',
  chessLight: '#e8dcc4',
} as const;
```

- [ ] **Step 5: The room (`src/worlds/colony/room.ts`)**

**Plan** (`planFor`, see the conventions): `type Kind = 'window' | 'tools' | 'map' | 'lamp'`; widths,
caps and what each piece is:

| kind | w (units) | cap | what it is |
| --- | --- | --- | --- |
| `window` | 10 | — | a four-pane window in a plank frame with a sill and a small pot: rolling hills (`hillFar`, `hill`) under a dusk sky (`skyTop` down to `skyLow`) with a cloud or two (`cloud`); sill at z 12, top at `min(H - 9, 30)` |
| `tools` | 8 | 2 | a pegboard of hanging tools: a saw, a hammer, a wrench, a coil of rope |
| `map` | 6 | 1 | a pinned map of the colony's land: patches, a river line and pins; no text |
| `lamp` | 2 | — (filler) | a hanging oil lamp, lit |

`ORDER`: window, tools, window, map, window, tools, window; first on each wall: `window`. Required at every
size (the test): `window`.

**Floor:** Rough wide planks (`floor`, `floorDark`) with knots, and nail dots when `k.fine`. The front cut in `floorDark`.

**Walls:** Rough fieldstone with mortar (`stone`, `stoneLight`, `stoneDark`, `mortar`) up to z 10, vertical planks above (`plank`, `plankLight`, `plankDark`), a log beam along the top (`log`, `bark`).

**Light:** Warm halos at the lamps; the campfire lights itself.

**Overlay** (`room.overlay`): Firelight: one soft warm glow (`fire`, `screen`, alpha 0.05–0.12 following `t`) on the floor and the lower walls round the campfire (its slot: `L.slots.find((s) => s.kind === 'idle')`), one gradient; and fireflies: in each window 3–5 small yellow-green dots (`firefly`) drifting and blinking.

**Points of interest:** The defaults already sit round the idle prop, here the campfire (warm either side, a log seat in front); a second log seat, and a look out of up to three windows. Paste this into `room.ts`, with these imports:

```ts
import { defaultPois, footprint } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
```

```ts
// ── points of interest ─────────────────────────────────────────────────────
// The usual spots round the campfire (warm either side, a log seat in
// front), a second log seat, and a look out of the windows at the hills.
export function colonyPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L);
  const fire = slot('idle');
  if (fire) out.push({ ...at(fire, -4, 9), kind: 'seat', face: mid(fire) });
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}
```

- [ ] **Step 6: The stations (`src/worlds/colony/stations.ts`)**

`export const STATIONS: Record<SlotKind, PropArt> = { write, read, search, run, web, think, idle, entrance };`

| slot | the prop | footprint | height | animated | while worked |
| --- | --- | --- | --- | --- | --- |
| `write` | a tailoring bench: a treadle sewing machine on a plank bench, folded bolts of cloth (`cloth`, `clothBlue`, `canvas`), scissors, a spool rack | 11 x 7 | 11 | yes | the needle bobs and the cloth feeds |
| `read` | a research bench against the wall: a microscope, a stack of books, flasks, a shelf of books above | 14 x 4 | 17 | yes | the microscope's lamp glows and a flask bubbles (idle: both still) |
| `search` | a stockpile: stacked crates, grain sacks, a barrel of steel bars, a few logs | 12 x 4 | 9 | no | — |
| `run` | a smithy: a brick furnace with a chimney and a bellows wheel, an anvil, a water trough, tongs | 11 x 11 | 18 | yes | the furnace mouth glows bright and pulses, the bellows wheel turns; `spark` and `ember` particles |
| `web` | a trade-comms console: a metal cabinet with a screen (a moving waveform, no text), a microphone on a stand, an antenna on top | 9 x 9 | 15 | yes | the waveform moves and the antenna's light blinks |
| `think` | a chess table: a small square table with a board and pieces (simple shapes), two chairs | 12 x 7 | 8 | no | — |
| `idle` | a campfire: a ring of stones, crossed logs and flames, three log seats round it, a pot on a tripod | 15 x 11 | 8 | yes | the flames always flicker, worked or not (the one `RESTLESS` station); `emit` embers and smoke |
| `entrance` | a plank door with iron hinges in a timber frame, and a sun lamp on a bracket beside it shining warm white | 15 x 4 | 20 | yes | the door swings open while someone passes |

- [ ] **Step 7: The decor (`src/worlds/colony/decor.ts`)**

| `DECOR_ART` key | the piece | len x dep x height | place and count | animated |
| --- | --- | --- | --- | --- |
| `hydro` | hydroponics: a rack of two trays of green seedlings under a violet grow-light strip (`grow`) | 9 x 4 x 7 | wall 2 | no |
| `bed` | a hospital bed: a steel frame, white sheets and a pillow, a drip stand | 10 x 5 x 6 | wall 1 | no |
| `stack` | a stack of logs or of steel bars (by seed) | 6 x 4 x 5 | floor 2 | no |
| `turret` | a small defence turret on a tripod: squat, boxy, toy-like | 4 x 4 x 7 | floor 1 | no |

```ts
export const DECOR: NonNullable<WorldDef['decor']> = [{ art: hydro, count: 2, place: 'wall' }, { art: bed, count: 1, place: 'wall' }, { art: stack, count: 2, place: 'floor' }, { art: turret, count: 1, place: 'floor' }];

export const DECOR_ART = { hydro, bed, stack, turret };
```

- [ ] **Step 8: Run the checks**

Run: `node --test test/colony.test.ts`
Expected: PASS: `ℹ tests 29`, `ℹ pass 29`, `ℹ fail 0`.

Run: `ANIMUS_THEME_FILE=src/worlds/colony.ts node --test test/themes.test.ts`
Expected: PASS: `ℹ tests 34`, `ℹ pass 34`, `ℹ fail 0` (its three contract tests among them: `world colony: identity, …`, `… a prop for every station, …`, `… the room and every prop draw with the pen, …`).

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

- [ ] **Step 9: Look at it**

Run:

```bash
mkdir -p "$SCRATCH/worlds"
node scripts/scene-shot.ts src/worlds/colony.ts "$SCRATCH/worlds/colony-150x46.png"
node scripts/scene-shot.ts src/worlds/colony.ts "$SCRATCH/worlds/colony-100x30.png" --size 100x30
node scripts/scene-shot.ts src/worlds/colony.ts "$SCRATCH/worlds/colony-zoom.png" --zoom 3 --select 0
```

Expected: one line each, `<path>: <n> KB; first render <n> ms, next plate <n> ms (<n> pictures), encode <n> ms`, the next plate under 25 ms.
Open the three PNGs with the Read tool and go through the checklist below;
fix and render again until it holds.

**Done when** (with the shared checklist in the conventions):

- [ ] The room reads as a homestead at dusk; the campfire burns with nobody at it.

- [ ] **Step 10: Commit (the coordinator, after Task 10's review of this world)**

```bash
git add src/worlds/colony.ts src/worlds/colony/kit.ts src/worlds/colony/bits.ts src/worlds/colony/room.ts src/worlds/colony/stations.ts src/worlds/colony/decor.ts test/colony.test.ts
git commit -F - <<'EOF'
feat(worlds): Frontier Colony (colony)

A colony base on a frontier world at dusk: its shell and overlay, eight stations, its
furniture and points of interest, tested for footprints, animation,
wall pieces and frame time.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

(`git add` skips nothing silently: if `bits.ts` was not needed, drop it from
the list.)


## Part C: the coordinator

### Task 10: Review each world, commit it, and register all five

**Files:**
- Modify: `src/worlds/index.ts` (the registry: fifteen worlds, the five last)
- Modify: `test/themes.test.ts` (the registry test lists fifteen ids)
- Modify: `test/world.test.ts` (the digits reach the first ten worlds)

- [ ] **Step 1: Review each world as it is handed back**

For each of `dunes`, `meadhall`, `starfall`, `shelter`, `colony`:

- Code: only its own files changed (`git status --short` lists nothing else);
  the exports are those of the conventions; no prop that is not `animated`
  reads `v.t` or `v.active`; animated props paint their still parts through
  `still`; the shell culls with `k.sees`; `<id>Pois` is the given code; no
  import from another world's folder; nothing left over (dead code, debug
  output).
- Art: open its three renders (`$SCRATCH/worlds/<id>-150x46.png`,
  `-100x30.png`, `-zoom.png`) with the Read tool against its brief and the
  art rules: outlined cartoon in one ink, light from the upper left, contact
  shadows, every station recognisable, the wall pieces and decor there, the
  costume and critter right.
- Trademark: no game name anywhere. The names are only in the spec's table,
  so check with it rather than typing them:

Run: `grep -rniF -f <(sed -n 's/^| [^|]* | `[a-z]*` | \(.*\) |$/\1/p' docs/superpowers/specs/2026-10-25-game-worlds-design.md) src test scripts README.md`
Expected: no output (exit 1).

And look again for numbers, logos, emblems, horns, a round door or readable
text in the renders.

Send anything to fix back to the world's agent and have it rerun its Step 8
and Step 9.

- [ ] **Step 2: Commit each world**

When a world passes review, run that world's Step 10 (Tasks 5–9): one commit
per world, its own files only.

Run: `node --test "test/**/*.test.ts"`
Expected: `ℹ fail 0`, with 143 more tests than after Task 4 once all five are
committed (27 + 29 x 4): `ℹ tests 1163`.

- [ ] **Step 3: Write the failing registry test**

The registry test lists fifteen ids. "t / T / digits switch themes" pressed
the key `15` for the last of fifteen worlds, which is not a key: the digits
reach the first ten (`0` is the tenth), and `T` from the first goes round to
the last.

In `test/themes.test.ts`, replace:

```ts
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ['mines', 'lab', 'club', 'den', 'station', 'cafe', 'fungal', 'snowy', 'vault', 'hell']);
  assert.equal(getTheme('mines')?.id, 'mines');
```

with:

```ts
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ['mines', 'lab', 'club', 'den', 'station', 'cafe', 'fungal', 'snowy', 'vault', 'hell', 'dunes', 'meadhall', 'starfall', 'shelter', 'colony']);
  assert.equal(getTheme('mines')?.id, 'mines');
```

In `test/world.test.ts`, replace:

```ts
  assert.equal(w.theme.id, ids[0]);
  w.handleKey(key(THEMES.length === 10 ? '0' : String(THEMES.length)));
  assert.equal(w.theme.id, ids[THEMES.length - 1]);
  // A digit past the last preset does nothing (0 is the tenth).
  const beyond = THEMES.length < 9 ? String(THEMES.length + 1) : THEMES.length < 10 ? '0' : null;
  if (beyond) assert.equal(w.handleKey(key(beyond)), null);
});
```

with:

```ts
  assert.equal(w.theme.id, ids[0]);
  // The digits reach the first ten (0 is the tenth); worlds past them
  // only t / T and the picker.
  const last = Math.min(THEMES.length, 10);
  w.handleKey(key(last === 10 ? '0' : String(last)));
  assert.equal(w.theme.id, ids[last - 1]);
  // A digit past the last preset does nothing.
  const beyond = THEMES.length < 9 ? String(THEMES.length + 1) : THEMES.length < 10 ? '0' : null;
  if (beyond) assert.equal(w.handleKey(key(beyond)), null);
  // T from the first goes round to the last.
  w.handleKey(key('1'));
  w.handleKey(key('T'));
  assert.equal(w.theme.id, ids[ids.length - 1]);
});
```

- [ ] **Step 4: Run the tests to see the registry test fail**

Run: `node --test test/themes.test.ts test/world.test.ts`
Expected: FAIL, 1 test: `registry exposes unique ids` (`Expected values to be strictly deep-equal`); `t / T / digits switch themes` passes with ten worlds and with fifteen.

- [ ] **Step 5: Register the five**

In `src/worlds/index.ts`, replace:

```ts
import { hell } from './hell.ts';

// Every world, in picker order; the first is the default.
export const WORLDS: readonly WorldDef[] = [mines, lab, club, den, station, cafe, fungal, snowy, vault, hell];
```

with:

```ts
import { hell } from './hell.ts';
import { dunes } from './dunes.ts';
import { meadhall } from './meadhall.ts';
import { starfall } from './starfall.ts';
import { shelter } from './shelter.ts';
import { colony } from './colony.ts';

// Every world, in picker order; the first is the default. The digit keys
// reach the first ten; the rest only `t` / `T` and the picker.
export const WORLDS: readonly WorldDef[] = [mines, lab, club, den, station, cafe, fungal, snowy, vault, hell, dunes, meadhall, starfall, shelter, colony];
```

- [ ] **Step 6: Run everything**

Run: `node --test "test/**/*.test.ts"`
Expected: `ℹ tests 1183`, `ℹ pass 1183`, `ℹ fail 0` (each new world adds its
three contract tests and a snapshot test in `test/cli.test.ts`: 1163 + 20).

Run: `node node_modules/typescript/bin/tsc --noEmit -p .`
Expected: no output, exit 0.

Run: `node bin/animus.js --list-themes | tail -5`
Expected:

```
dunes    Dust Outpost — Scrap walls, hide awnings and sand on the wind
meadhall Longhall — Firelight on timber, snow at the windows, mead on the long table
starfall Starfall Base — Two moons over a pink sky, strange flora past the glass
shelter  Atomic Shelter — Riveted steel and a jukebox, deep under the wasteland
colony   Frontier Colony — Stone and planks under a big sky, a campfire and a husky
```

Run CI's snapshot step for every world:

```bash
for theme in $(node bin/animus.js --list-themes | awk '{print $1}'); do
  node bin/animus.js --snapshot --demo --theme "$theme" --width 120 --height 36 > /dev/null
  node bin/animus.js --snapshot --demo --theme "$theme" --width 80 --height 24 > /dev/null
done && echo snapshots ok
```

Expected: `snapshots ok`.

- [ ] **Step 7: Commit**

```bash
git add src/worlds/index.ts test/themes.test.ts test/world.test.ts
git commit -F - <<'EOF'
feat(worlds): fifteen worlds in the picker

The dust outpost, the longhall, the starfall base, the atomic shelter
and the frontier colony come after the ten, in t / T, the picker and
--list-themes; the digits still reach the first ten.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 11: The five in a real Ghostty

Screenshots of each world with the demo crew in a real Ghostty, for the user,
and each one's busy frame measured there (the spec's speed rule). Nothing in
the repo changes unless the user asks for changes.

The harness in `$SCRATCH`: `run-shots.sh <world> <shots>` opens a fresh
Ghostty window (150x46), runs `probe-shots.ts` (the real loop: World →
ScenePlayer → Renderer, the demo crew, the account shown as "you") and
screenshots each marked moment to `$SCRATCH/shots/<world>-<shot>.png`;
`probe4.ts` measures the real loop's frames in Ghostty (for the café).

**Files:** none in the repo; in `$SCRATCH`: `probe-world.ts`, `run-perf.sh`.

- [ ] **Step 1: A frame probe for any world**

Run:

```bash
sed -e "s/getTheme('cafe')/getTheme(process.env.WORLD ?? 'cafe')/" -e "s/'probe4.txt'/'probe-' + (process.env.WORLD ?? 'cafe') + '.txt'/" "$SCRATCH/probe4.ts" > "$SCRATCH/probe-world.ts"
grep -c "process.env.WORLD" "$SCRATCH/probe-world.ts"
```

Expected: `2`.

Create `$SCRATCH/run-perf.sh`:

```bash
#!/bin/bash
# Runs probe-world.ts for one world in a fresh Ghostty window (150x46): the
# real loop at 30 fps, the demo crew busy, a few keys (zoom, select, back);
# prints its step times and Ghostty's CPU. Usage: run-perf.sh <world>
S=$(dirname "$0")
rm -f "$S/probe-$1.txt"
(WORLD=$1 timeout 120 ghostty --gtk-single-instance=false --window-width=150 --window-height=46 -e node "$S/probe-world.ts" 30 8 >"$S/ghostty-perf.log" 2>&1 &)
for i in $(seq 1 500); do [ -f "$S/probe-$1.txt" ] && break; sleep 0.3; done
cat "$S/probe-$1.txt"
```

Run: `chmod +x "$SCRATCH/run-perf.sh"`

- [ ] **Step 2: Screenshots**

Run, one world at a time (each opens its own window):

```bash
for w in dunes meadhall starfall shelter colony; do "$SCRATCH/run-shots.sh" $w room; done
```

Expected: the five paths `$SCRATCH/shots/<world>-room.png`. Open each with
the Read tool: the whole room in view, the crew at work in the world's
costume, the labels legible over it, the picture sharp (no smearing while
the crew moves).

- [ ] **Step 3: Busy frames**

Run: `"$SCRATCH/run-perf.sh" cafe` (the baseline), then `"$SCRATCH/run-perf.sh" <world>` for each of the five.

Expected for each: a header line and the key timings, then
`all: <n> steps (<n>/s); step p50 <n> p95 <n> max <n> ms; our CPU <n>%; out <n> KiB/s; ghostty CPU <n>%`.
Each world's p95 step is at most 1.5 times the café's and under 12 ms, it
keeps 28 steps a second or more, and Ghostty's CPU is within 5 points of the
café's. A world that misses: profile its animated props and overlay
(`node --test test/<id>.test.ts` prints their budgets), fix it in its own
files, rerun its checks and this step.

- [ ] **Step 4: Show the user**

Give the user the five screenshot paths and the five timing lines. Make the
changes they ask for in the world's own files (its Steps 8–9 again), then
commit:

```bash
git add src/worlds/<id>.ts src/worlds/<id>/ test/<id>.test.ts
git commit -F - <<'EOF'
fix(worlds): <what changed> in the <name>

<why, in a sentence or two>

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 12: The README gallery, fifteen worlds

**Files:**
- Create: `docs/screenshots/dunes.png`, `docs/screenshots/meadhall.png`, `docs/screenshots/starfall.png`, `docs/screenshots/shelter.png`, `docs/screenshots/colony.png`
- Modify: `README.md` (the gallery, the digits, the ★2 hats, the keys table)

- [ ] **Step 1: The screenshots**

The gallery's pictures are the terminal's area of the Ghostty window shots,
halved: 715x410 like the other ten (the crop below reproduces the café's
README picture from its shot to within 1 % RMSE). Take them after the user's
changes (Task 11), so they show the final art.

Run:

```bash
magick "$SCRATCH/shots/dunes-room.png" -crop 1430x820+78+97 +repage -resize 715x410 docs/screenshots/dunes.png
magick "$SCRATCH/shots/meadhall-room.png" -crop 1430x820+78+97 +repage -resize 715x410 docs/screenshots/meadhall.png
magick "$SCRATCH/shots/starfall-room.png" -crop 1430x820+78+97 +repage -resize 715x410 docs/screenshots/starfall.png
magick "$SCRATCH/shots/shelter-room.png" -crop 1430x820+78+97 +repage -resize 715x410 docs/screenshots/shelter.png
magick "$SCRATCH/shots/colony-room.png" -crop 1430x820+78+97 +repage -resize 715x410 docs/screenshots/colony.png
file docs/screenshots/{dunes,meadhall,starfall,shelter,colony}.png
```

Expected: five lines, each `PNG image data, 715 x 410, …`. Open each with the
Read tool: the whole terminal (the header row at the top, the keys row at the
bottom), no window frame. If a frame shows, the window landed elsewhere: find
the terminal's top-left corner in that shot and use it as the offset.

- [ ] **Step 2: The README**

Three new gallery rows (the last with one world), the digits reaching the
first ten, the five new hats in the levels table, the keys table.

In `README.md`, replace:

```markdown
| ![The Vault](docs/screenshots/vault.png)<br>**The Vault** `vault`<br>Deposit boxes, gold under amber lamps and acid in the pit | ![Hell](docs/screenshots/hell.png)<br>**Hell** `hell`<br>Lava lakes, brimstone and the bones of the damned |

`node bin/animus.js --list-themes` prints them. `t` / `T` step through the
worlds, `1`–`9` and `0` jump to one, `p` opens a picker with a live preview.
The last world you picked is remembered.
```

with:

```markdown
| ![The Vault](docs/screenshots/vault.png)<br>**The Vault** `vault`<br>Deposit boxes, gold under amber lamps and acid in the pit | ![Hell](docs/screenshots/hell.png)<br>**Hell** `hell`<br>Lava lakes, brimstone and the bones of the damned |
| ![Dust Outpost](docs/screenshots/dunes.png)<br>**Dust Outpost** `dunes`<br>Scrap walls, hide awnings and sand on the wind | ![Longhall](docs/screenshots/meadhall.png)<br>**Longhall** `meadhall`<br>Firelight on timber, snow at the windows, mead on the long table |
| ![Starfall Base](docs/screenshots/starfall.png)<br>**Starfall Base** `starfall`<br>Two moons over a pink sky, strange flora past the glass | ![Atomic Shelter](docs/screenshots/shelter.png)<br>**Atomic Shelter** `shelter`<br>Riveted steel and a jukebox, deep under the wasteland |
| ![Frontier Colony](docs/screenshots/colony.png)<br>**Frontier Colony** `colony`<br>Stone and planks under a big sky, a campfire and a husky | |

`node bin/animus.js --list-themes` prints them. `t` / `T` step through the
worlds, `1`–`9` and `0` jump to one of the first ten, `p` opens a picker
with a live preview. The last world you picked is remembered.
```

In `README.md`, replace:

```markdown
| --- | --- | --- |
| ★2 | 100 | a hat: a beanie in the café, a mortarboard in the lab, a party hat in the club, a cap in the den, an antenna on the station, a grand wizard's hat everywhere else |
| ★3 | 250 | a badge on the shirt |
```

with:

```markdown
| --- | --- | --- |
| ★2 | 100 | a hat: a beanie in the café, a mortarboard in the lab, a party hat in the club, a cap in the den, an antenna on the station, a wide straw hat at the outpost, an iron helm in the longhall, a helmet with a fin at the starfall base, a flat cap in the shelter, a rancher's hat in the colony, a grand wizard's hat everywhere else |
| ★3 | 250 | a badge on the shirt |
```

In `README.md`, replace:

```markdown
| `t` / `T` | next / previous world |
| `1`–`9`, `0` | jump to a world (`0` is the tenth) |
| `p` | world picker with live preview (`↑` `↓` browse, `enter` keep, `esc` go back) |
```

with:

```markdown
| `t` / `T` | next / previous world |
| `1`–`9`, `0` | jump to one of the first ten worlds (`0` is the tenth) |
| `p` | world picker with live preview (`↑` `↓` browse, `enter` keep, `esc` go back) |
```

- [ ] **Step 3: Check it**

Run: `grep -c "docs/screenshots/" README.md`
Expected: `20` (the hero, fifteen worlds, the card, the chat, the level-up, the dashboard).

Run: `grep -rniF -f <(sed -n 's/^| [^|]* | `[a-z]*` | \(.*\) |$/\1/p' docs/superpowers/specs/2026-10-25-game-worlds-design.md) README.md docs/screenshots`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/screenshots/dunes.png docs/screenshots/meadhall.png docs/screenshots/starfall.png docs/screenshots/shelter.png docs/screenshots/colony.png
git commit -F - <<'EOF'
docs(readme): fifteen worlds in the gallery

Screenshots of the five new worlds from a real Ghostty, the digits
reaching the first ten and the five new level hats.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
EOF
```

### Task 13: The PR, through CI, squash-merged

- [ ] **Step 1: Everything green locally**

Run: `node node_modules/typescript/bin/tsc --noEmit -p . && node --test "test/**/*.test.ts"`
Expected: no typecheck output; `ℹ fail 0`.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin worlds-games
gh pr create --base main --head worlds-games --title "Five game-inspired worlds" --body-file - <<'EOF'
Five new illustrated worlds after the existing ten: the Dust Outpost (`dunes`), the Longhall (`meadhall`), the Starfall Base (`starfall`), the Atomic Shelter (`shelter`) and the Frontier Colony (`colony`).

- Five costumes on every species, each with its own ★2 hat and ★8 colours: a drifter's long coat and scarf, a nord's tunic, fur cloak and braids, a bright exosuit with a chest light, a blue jumpsuit with a plain yellow stripe, a colonist's work jacket.
- Three critters: a sand beetle, a fluffy hopper and a husky.
- Each world: its shell and animated overlay, eight stations, furniture and points of interest, tested for footprints, animation, wall pieces and frame time; measured in a real Ghostty.
- `scripts/scene-shot.ts` renders a world from its module file, before it is registered.
- The digit keys still reach the first ten worlds; the five are a `t` / `T` or the picker away.
- README gallery with fifteen worlds.

Design: `docs/superpowers/specs/2026-10-25-game-worlds-design.md`; plan: `docs/superpowers/plans/2026-10-25-game-worlds.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

EOF
```

Expected: the PR's URL.

- [ ] **Step 3: The CI loop**

Run: `gh pr checks --watch`
Expected: every check passes (tests on Linux and macOS, the snapshot of
every preset, the typecheck, CodeQL). On a failure: `gh run view <run-id> --log-failed`, fix it, commit (with the two trailer lines), `git push`, and watch again. The CodeQL gate fails on any finding.

- [ ] **Step 4: Squash-merge**

Once the checks are green and the user has seen the worlds (Task 11):

Run: `gh pr merge --squash`
Expected: the PR merged into `main` (the repository deletes the head branch).


## Self-review: the spec against this plan

| spec | where |
| --- | --- |
| Five worlds with original names and art, no game names, logos, emblems or iconic shapes | Tasks 5–9 (briefs, trademark rule in "Read this first" and the conventions); Task 10 Step 1 and Task 12 Step 3 (a name check driven by the spec's own table) |
| Each a cutaway room fulfilling `WorldDef`, in the illustrated art direction | Tasks 5–9 (complete world modules, the conventions' art rules, the contract test in Step 8) |
| Five `Costume` values on all five species, every pose and facing | Tasks 1–2 (`test/figure.test.ts` loops over every costume, species, pose and facing) |
| A ★2 hat per costume; it replaces the lamp, beret or hood; headsets stay under it | Task 1 (the existing hat tests now cover the five) |
| The ★8 outfit swap gives each new costume its other colours | Task 2 (look.ts; the outfit-swap test covers the five; the jumpsuit test) |
| Three `CritterKind`s, outlined, with the same life | Task 3 |
| The longhall's fox, the shelter's rat | Tasks 6 and 8 (world modules) |
| Registered after the ten in the spec's order; picker, `t` / `T`, `--list-themes`; digits keep the first ten; no new keys | Task 10 (registry, registry test, digits test) |
| CI snapshots every world with no workflow change | Task 10 Step 6 runs the same loop locally |
| Each world's stations, decor, overlay, points of interest, critter, build shape and confetti | Tasks 5–9 (tables, module code, POI code) |
| Shelter's entrance: a rectangular blast door with a wheel, never a round cog door | Task 8 (entrance row, done-when) |
| Speed: static props cached, animated props small, light overlays; `budget()` in each world's test; busy frame measured in a real Ghostty | Tasks 5–9 (tests and the conventions' speed rules); Task 11 Step 3 |
| Testing: figure and critter tests loop over the new values; each world's contract test and own test; the registry lists fifteen | Tasks 1–3, 5–9, 10 |
| How it is built: groundwork, five parallel agents with no git and no shared files, review, Ghostty screenshots for the user, README gallery, PR through CI, squash-merge | Part A, Part B, Tasks 10–13 |

Where the plan departs from the spec, and why, is under "Decisions" in
"Read this first": the ids `dunes` and `meadhall`, the hats landing with the
costume values, and the registry moving to the coordinator's Task 10.
