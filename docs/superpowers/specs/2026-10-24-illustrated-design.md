# Illustrated worlds: design

Date: 2026-10-24. Branch `illustrated` (worktree `<repo>`).

## Goal

The user found the pixel style "really bad" and asked to remove it and
make it look better. Decisions (made by the user):

- **Smooth illustrated art**, drawn as real images (kitty graphics
  protocol). The user runs **Ghostty**: full frames only, no frame patches.
- **Outlined cartoon** direction: dark outlines, two-tone shading,
  expressive rounded characters (Habbo, Two Point Hospital, Don't Starve).
- **Own renderer, zero dependencies**: a TypeScript rasterizer.
- Terminals without images (Alacritty) get an **agent dashboard**
  (text cards), not a scene.
- **Café first**, then the other nine worlds.

The pixel engine goes: falling-sand sim, raycaster, glow, voxel biomes,
pixel wizard sprites, sextant/half modes, pixel font.

## What stays

Agent sources (Claude, demo), header/roster/footer chrome, keys, the
life system (chat, visit, haul, build, nap, cheer, flinch, critter),
station layout (wall slots and islands, `planLayout`), lanes, labels
logic, zoom/follow, HD streaming (`HdStream`, kitty commands), config.

## Architecture

```
AgentSource ─► World ─► Stage (actors, Life, room model, camera) ─► SceneFrame
                                                                      │
                     image terminal:  Scene (src/art/scene.ts) ◄──────┘
                                        └─► Bitmap ─► PNG ─► HdStream ─► Ghostty
                     text terminal:   Dashboard (src/ui/dashboard.ts)
```

- `src/art/types.ts` (**fixed contract**): `Pen`, a Canvas2D subset
  (same names and semantics as the browser API), `Bitmap`, `Gradient`.
- `src/art/canvas.ts`: `Canvas` (a `Bitmap` + a `Pen`) with
  exact-coverage anti-aliased fills (nonzero / evenodd), strokes with
  round/miter/bevel joins and round/butt/square caps, transforms,
  clipping, linear/radial gradients, composite ops, `drawImage` (scaled:
  bilinear), plus `blur(bitmap, radius)`.
- `src/art/iso.ts`: projection and shared art primitives so every world
  looks consistent: `isoBox` (back-face culled, auto-shaded faces, ink
  outline, optional rounded edges), `isoCylinder`, floor quads, contact
  shadows, colour helpers (`shade`, `mix`, `ink`).
- `src/art/png.ts`: `encodeRgb(bitmap, bg, level)`: flatten onto `bg`
  and PNG-encode (zlib, "up" filter where rows repeat).
- `src/art/figure.ts`: cartoon characters, emotes and critters.
- `src/worlds/types.ts` (**fixed contract**): `WorldDef`, `PropArt`,
  `PropView`, `RoomArt`, `RoomView`, `Project`.
- `src/worlds/<id>.ts`: one world each (room shell, station props, decor).
- `src/art/scene.ts`: renders a `SceneFrame` to a `Bitmap`: cached static
  layer, depth-sorted dynamic drawables, label pills, dirty boxes.
- `src/ui/dashboard.ts`: the text fallback.

### World units and projection

Same frame as the old voxel world, minus the voxels: x, y on the floor,
z up, floor at z = 0, back walls are slabs x < T and y < T. `s` canvas
pixels per unit:

```
px = ox + (x - y) * s
py = oy + (x + y) * s / 2 - z * s      (larger x + y is nearer)
```

Rooms are planned in units by `planLayout` (sides 72 to 256). The camera
picks `s` to fit the room (about 3.5 to 5 px per unit at 150x46 cells of
10x20 px), and zooms by changing `s`.

## Art direction (all art must follow)

- **Ink**: each world has one dark ink colour (warm or cool tinted, never
  pure black). Outlines in ink, width `max(1.5, 0.3 * s)` px for props,
  `max(1.5, 0.28 * s)` for figures. Inner detail lines thinner (60 %).
- **Shading**: light from the upper left. Box faces: top = base lifted
  about 12 %, the face toward the lower left = base, the face toward the
  lower right = base dropped about 18 %. One highlight stripe on top front
  edges. No noise or dithering.
- **Contact shadows**: a soft ellipse under every figure and prop
  (black at 20–30 % alpha, radial falloff).
- **Light**: warm pools from lamps as radial gradients composited
  `screen` or `lighter` at low alpha; glowing bits get a soft halo.
- **Colour**: saturated but not neon (except club/den accents);
  each world has a clear dominant hue and the characters stay readable on it.
- **Characters**: chibi proportions, about 2.5 heads, 14 units tall; big
  head, two eyes that blink every 3–5 s, a small mouth; hair by
  `hairStyle` (8 styles); species human / robot / cat / alien / ghost;
  costume per world (wizard, scientist, raver, hacker, astronaut, casual);
  shirt and accent colours from `Traits`. Smooth animation per pose
  (12 frames a second, cached).
- **No text in the image**: names and bubbles are terminal text over a
  soft rounded pill the scene draws behind them.

## Performance budgets (1500 x 920 canvas)

- Static layer (room + static props): at most 400 ms, once per layout/zoom.
- One frame (copy static, draw dynamic, overlay): at most 25 ms.
- Figure sprite: at most 3 ms to draw, then cached per
  (look, pose, frame, facing, s).
- Ghostty gets whole frames: send when the picture changed, at most 8 fps
  while figures move and 2 fps for ambient animation; zlib level 1–2.

## Tracks and file ownership

Phase 1 (parallel):

- **A: rasterizer**: `src/art/canvas.ts`, `src/art/iso.ts`,
  `src/art/png.ts`, `test/art-*.test.ts`.
- **C: dashboard**: `src/ui/dashboard.ts`, `test/dashboard.test.ts`.
- **D: model**: removes the pixel engine; room model; `SceneFrame`;
  stub `WorldDef`s for all ten worlds; `Theme = WorldDef`; owns
  `src/world/*`, `src/cave/*` (deletion/moves), `src/themes/*`,
  `src/iso/*`, `src/worlds/<id>.ts` stubs, `src/app.ts`, `src/ui/chrome.ts`,
  `src/ui/overlays.ts`, `src/cli.ts`, and the tests for those.

Phase 1b (after A): **B: figures** (`src/art/figure.ts`) and **E: Café
art** (`src/worlds/cafe.ts`, replacing D's stub art only).

Phase 1c (after A and D): **F: scene and streaming**: `src/art/scene.ts`,
HD streaming in `src/app.ts`, label pills, dashboard hook-up.

Phase 2: the other nine worlds, one agent per world or two.
Phase 3: lighting and effects polish, design review, screenshots, README, PR.

## Testing

`node --test "test/**/*.test.ts"` and the typecheck stay green at every
commit. Rasterizer tests check coverage maths (half-covered pixels,
areas, winding rules, joins), gradients, composite ops and clip. Art is
checked by rendering PNGs and looking at them; every agent writes its
renders under the session scratchpad and reports their paths.
