# Isometric Pixel Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat cell-art scene with an isometric pixel-art room (half-block pixels, voxel furniture, pixel characters) across all five presets.

**Architecture:** A `PixelCanvas` (2 px per cell) is composited into the existing `Screen` with `▀`. An iso projection plus inverse-mapped box rasteriser draws a room (floor, two back walls) and voxel station models from `IsoTheme`s. `src/world/stage.ts` is rewritten in place with the same public API, so `World`, UI chrome, CLI and tests above it are untouched.

**Tech Stack:** Node ≥ 23.6 erasable TypeScript, `node:test`, `node:zlib` (PNG previews). No dependencies.

Spec: `docs/superpowers/specs/2026-10-22-isometric-design.md`.

Conventions: as in `2026-10-22-animus.md` (erasable TS, `.ts` imports, width-1 glyphs, `node --test "test/**/*.test.ts"`, commit per task).

## File structure

```
src/iso/canvas.ts      PixelCanvas: pixels, blend, sprite blit, half-block blit to Screen
src/iso/projection.ts  Iso: toScreen / floorAt / wall inverses (tile size from layout)
src/iso/box.ts         Box, Face, drawBox (inverse-mapped faces, oriented local coords)
src/iso/room.ts        layoutRoom (tile size, W, D, origin, placements, door, spots), drawRoom
src/iso/sprites.ts     characterSprite(traits, pose, t, facing, phase) → pixel sprite
src/iso/png.ts         encodePng(canvas, scale) for previews/docs
src/themes/types.ts    IsoTheme, IsoStation, Palette, StationKind (replaces flat types)
src/themes/art.ts      noise, pulse, shading helpers (flat art helpers removed)
src/themes/{lab,club,den,station,cafe}.ts   rewritten as IsoThemes
src/world/stage.ts     rewritten: iso actors, paths, particles, labels (same public API)
scripts/preview-theme.ts  renders a theme file with a demo crew to PNG
test/iso.test.ts       canvas, projection, box, png
test/room.test.ts      layout fit/placements
test/sprites.test.ts   character sprites
test/stage.test.ts     rewritten for iso
test/themes.test.ts    rewritten for IsoTheme
```

## Key interfaces

```ts
// canvas.ts
export const CLEAR = -1;
export class PixelCanvas {
  readonly w: number; readonly h: number; data: Int32Array;
  constructor(w: number, h: number);
  clear(c: RGB): void;
  set(x: number, y: number, c: RGB): void;            // OOB ignored
  get(x: number, y: number): RGB | null;
  blend(x: number, y: number, c: RGB, a: number): void;
  sprite(sp: PixelSprite, x: number, y: number): void; // null pixels transparent
  blit(s: Screen, r: Rect): void;                      // row y covers pixels 2y, 2y+1
}
export type PixelSprite = { w: number; h: number; px: Array<Array<RGB | null>>; ax: number; ay: number }; // anchor

// projection.ts
export class Iso {
  readonly tw: number; readonly hh: number; ox: number; oy: number; // hh = tw/2
  constructor(tw: number, ox: number, oy: number);
  toScreen(gx: number, gy: number, gz?: number): [number, number];
  floorAt(sx: number, sy: number, gz?: number): [number, number];   // inverse on a horizontal plane
}

// box.ts
export type Face = 'top' | 'front' | 'side';
export type Box = { a: number; b: number; z: number; len: number; dep: number; h: number; color: RGB;
                    paint?: (face: Face, u: number, v: number) => RGB | null | undefined };
// a = along the wall, b = away from the wall; front = face towards the room, side = visible end.
export type Placement = { wall: 'left' | 'right'; along: number; out: number };
export function drawBox(c: PixelCanvas, iso: Iso, box: Box, at: Placement): void;
export function shade(c: RGB, face: Face): RGB; // top 1.0, front 0.82, side 0.66

// room.ts
export type Spot = { gx: number; gy: number };
export type Placed = { kind: StationKind | 'entrance'; station: IsoStation; at: Placement; spot: Spot; depth: number; users: number };
export type Room = { iso: Iso; W: number; D: number; wallH: number; cw: number; ch: number; placed: Placed[] };
export function layoutRoom(cw: number, ch: number, theme: IsoTheme): Room;
export function drawRoom(c: PixelCanvas, room: Room, theme: IsoTheme, t: number, now: number): void;

// sprites.ts
export type Facing = { back: boolean; flip: boolean };
export function characterSprite(tr: Traits, pose: Pose, t: number, facing: Facing, phase?: number): PixelSprite & { dx: number; dy: number };

// themes/types.ts
export type IsoStation = { name: string; size: { len: number; dep: number; h: number }; model(t: number, active: boolean): Box[] };
export type IsoTheme = { id: string; name: string; tagline: string; palette: Palette; backdrop: RGB; wallH: number;
  floor(gx: number, gy: number, t: number): RGB;
  wall(side: 'left' | 'right', u: number, v: number, t: number, now: number): RGB;
  stations: Record<StationKind | 'entrance', IsoStation>;
  ambient?(c: PixelCanvas, room: Room, t: number): void };
```

---

### Task 1: Pixel canvas, projection, PNG

**Files:** `src/iso/canvas.ts`, `src/iso/projection.ts`, `src/iso/png.ts`, `test/iso.test.ts`

Tests: `set/get` and OOB; `blend` halfway; `sprite` skips null pixels and honours anchor; `blit` writes `▀` with fg = pixel (x, 2y) and bg = pixel (x, 2y+1), and `' '` + bg when both equal; `Iso.toScreen(1,0,0)` = `[ox + hh, oy + hh/2]`, `(0,1,0)` = `[ox - hh, oy + hh/2]`, `(0,0,1)` = `[ox, oy - hh]`; `floorAt(toScreen(gx, gy, z), z)` round-trips; `encodePng` output starts with the PNG signature, has IHDR width = w·scale, and inflates IDAT to `h·scale·(1 + 3·w·scale)` bytes.

- [ ] TDD → commit `feat(iso): pixel canvas, projection, png encoder`.

### Task 2: Oriented voxel boxes

**Files:** `src/iso/box.ts`, extend `test/iso.test.ts`

`drawBox` maps local `(a, b)` to world: right wall (`gy = 0` wall): `gx = along + a`, `gy = out + b`; front = world face at `gy = y + d` (screen-left face), side = face at `gx = x + w`. Left wall (`gx = 0` wall): `gy = along + a`, `gx = out + b`; front = face at `gx = x + w` (screen-right face), side = face at `gy = y + d`. Pixels are inverse-mapped: top plane first, then the two vertical planes; `u` runs along `a` (front/top) or `b` (side), `v` is height (vertical faces) or `b` (top). `paint` returning `null` leaves the pixel untouched; `undefined` uses `shade(color, face)`.
Tests: a 1x1x1 box at the origin on each wall paints top, front and side with three different shaded colours at known pixels; `paint` receives `u, v` in `[0,len) x [0,h)` for front; `null` leaves pixels transparent; nothing is drawn outside the projected hexagon bounds.

- [ ] TDD → commit `feat(iso): oriented voxel boxes`.

### Task 3: Theme contract + Lab (iso)

**Files:** rewrite `src/themes/types.ts`, `src/themes/art.ts` (keep `noise`, `pulse`; add `checker`, `glow` helpers), rewrite `src/themes/lab.ts`; temporarily register only lab in `src/themes/index.ts`; rewrite `test/themes.test.ts`.
Lab: white/grey checker floor with grout lines, pale tiled walls with a periodic-table poster, shelf of flasks with bubbling liquid pixels, blinking control panel, wall clock (scene `now`). Stations (local models): write = desk + monitor with scrolling code pixels; read = tall bookshelf with coloured spines; search = DNA scanner box with animated helix; run = tesla coil (base, coil, torus) with spark pixels when active; web = radio with antenna and pulsing signal pixels; think = chalkboard on legs with writing appearing; idle = coffee machine with steam; entrance = metal door frame in the wall with a light.
Generic theme tests (every registered theme): all kinds present; `model(t, active)` returns boxes inside `[0,len] x [0,dep] x [0,h]` for t in several values and both states; colours valid; `floor`/`wall` return RGB for sampled coords; drawing room + ambient at several canvas sizes never throws or writes outside the canvas.

- [ ] TDD → commit `feat(themes): iso theme contract and Mad Science Lab`.

### Task 4: Room layout + drawing

**Files:** `src/iso/room.ts`, `test/room.test.ts`
`layoutRoom`: for `tw` from 16 down to 6 (even), `hh = tw/2`, `sumW = floor((cw - 4) / hh)`, `sumH = floor((ch - 3 - wallH·hh) · 2 / hh)`, `sum = min(sumW, sumH)`; take the first `tw` with `sum ≥ 16` (else the first with `sum ≥ 10`, else tw 6); `W = round(sum · 0.55)`, `D = sum - W`; origin centres the room (`ox = cw/2 + (D - W)·hh/2`, `oy = wallH·hh + 2`). Right wall gets write, run, think, idle; left wall gets read, search, web, then the entrance nearest the viewer; pieces are spaced evenly along each wall (`along` positions), `out = 0`; spot = 0.8 tiles in front of the piece centre.
`drawRoom`: walls (inverse-mapped planes `gx = 0` and `gy = 0`, `0 ≤ v < wallH`, theme `wall` painter, top edge darkened), floor (inverse-mapped `gz = 0`, theme `floor`), then a 1-px darker floor edge along the front sides.
Tests: room fits (`W + D`)·hh ≤ cw and height ≤ ch for canvases from 60x34 to 300x160; every placement lies inside the floor and placements on the same wall don't overlap; spots are on the floor and not inside any footprint; drawRoom paints the wall corner pixel and the floor centre pixel.

- [ ] TDD → commit `feat(iso): room layout and drawing`.

### Task 5: Pixel characters

**Files:** `src/iso/sprites.ts`, `test/sprites.test.ts`
Sprite canvas 11x14 (character in columns 2..8), feet anchor at bottom centre. Front/back views, flip mirrors. Species/accessory variants from `Traits`. Poses: idle (blink every ~3.3 s), walk (4 frames, legs + arm swing + 1 px bob), write (arms typing), read (book), think (hand to chin), run (arms pumping), search (magnifier), web (phone), delegate (pointing arm), talk (gesturing), done (arms up, `dy` jump), error (red tint, `dx` shake), sleep (eyes closed, slumped).
Tests: every pose × facing × several t gives an 11x14 grid; the shirt colour appears; front views show eye pixels and back views don't; walk frames differ; flip mirrors columns; done has a non-zero `dy` at some t.

- [ ] TDD → commit `feat(iso): pixel character sprites`.

### Task 6: Iso stage

**Files:** rewrite `src/world/stage.ts`, rewrite `test/stage.test.ts`
Same public API as before (`Stage(theme)`, `setTheme`, `layout(rect)`, `sync`, `update`, `draw(screen, t, now, selectedId)`, `actors()`, `stations()`, `floors()` removed). Actors live in tile space (`gx, gy`), walk at 3 tiles/s along straight segments to their station spot + slot offset (slots fan out ±0.9 tiles along the wall), face the walking direction, then face the furniture while working. Spawn at the entrance spot with a sparkle; leaving agents walk to the entrance and vanish. `draw`: canvas clear → `drawRoom` → depth-sorted stations (`drawBox` for each model box), shadows, characters (`characterSprite`) and pixel particles → `theme.ambient` → `canvas.blit` → labels (name tags, bubbles with collision avoidance, z/?/! marks, selection arrow) in cells.
Tests: writer reaches the write spot and works; reader goes to the left wall; activity change shows a bubble and retargets; vanished agents leave via the door and are purged; leads first in `actors()`; late `agentType` updates traits; resize keeps actors on the floor; draw at 60x14, 120x33, 200x50 with 0/1/12 agents; frame time < 3 ms average at 200x57 scene with 12 agents.

- [ ] TDD → commit `feat(world): isometric stage`.

### Task 7: Preview script

**Files:** rewrite `scripts/preview-theme.ts`
`node scripts/preview-theme.ts <theme.ts> --png out.png [--w 120 --h 36 --t 6 --scale 4]`: builds a `World` with the given theme and the demo crew, simulates `t` seconds, renders the scene canvas, writes a PNG (and prints the station list). Used by theme authors and for README screenshots.

- [ ] Manual check → commit `chore: iso theme preview to PNG`.

### Task 8: Club, Den, Station, Café (parallel subagents)

Each agent rewrites one theme file to the `IsoTheme` contract using `src/themes/lab.ts` as the reference and the spec's preset descriptions; verifies with `ANIMUS_THEME_FILE=src/themes/<id>.ts node --test test/themes.test.ts` and PNG previews.

- [ ] Dispatch 4 agents → review PNGs → register → full suite → commit `feat(themes): iso club, den, station, cafe`.

### Task 9: Integration, docs, verification

- [ ] Full suite, snapshots for every preset at 80x24/120x36/200x60, pty run, frame-time check.
- [ ] README: new screenshots (PNG from preview), describe the isometric scene; spec status.
- [ ] Code review (requesting-code-review) → fix → PR → CI loop until green.
