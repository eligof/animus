# Animus isometric pixel stage

Date: 2026-10-22
Status: approved (autonomous /goal session: "make it instead 2d make it
isometric pixeleited")
Builds on: `2026-10-22-animus-design.md` (connector, world, UI chrome and CI
stay as they are).

## Goal

Replace the flat side-view scene (cell glyph art) with an isometric pixel-art
diorama: a room seen from above at the classic 2:1 pixel-isometric angle,
voxel-style furniture as stations, and small pixel-sprite characters that
walk across the floor tiles. Everything stays animated; all five presets are
redrawn in the new style.

Success criteria:

1. The scene is drawn from square pixels (two per terminal cell) in full
   colour, as an isometric room: tiled floor, two back walls, furniture
   standing on the floor, characters walking between pieces.
2. Every agent is a distinct pixel character (traits from the existing
   `traitsFor`), with walk/work/celebrate/sleep animations and facing.
3. All five presets (lab, club, den, station, cafe) exist in iso form with
   animated stations, wall decor and ambient effects.
4. Frame cost stays under 3 ms at 200x60; output stays diff-rendered.
5. Name tags, bubbles, roster, ticker, overlays, keys, live/demo sources,
   snapshot mode and CI keep working.

## Approach

Chosen: **half-block pixel canvas** — each cell shows two vertically stacked
pixels with `▀` (fg = top pixel, bg = bottom pixel). Cells are about twice as
tall as wide, so pixels come out square. Works in any truecolor terminal and
through tmux; the existing diff renderer is unchanged.

Rejected:
- Quadrant/sextant blocks: more resolution but only two colours per cell, so
  pixel art clashes at every edge.
- Kitty/Sixel/iTerm graphics: real pixels, but not universal, break the cell
  diff renderer, and fail inside many multiplexers.

## Geometry

- World coordinates: `gx` (to the right and down on screen), `gy` (to the
  left and down), `gz` (up), in tile units.
- Projection (pixels): `sx = ox + (gx - gy) * TW/2`,
  `sy = oy + (gx + gy) * TH/2 - gz * ZH`, with `TH = TW/2` and `ZH = TW/2`
  per height unit (a 1x1x1 voxel looks like a cube).
- `TW` is chosen per layout so the room fits the scene canvas: even, clamped
  to 8..16 px. The room grid is sized from the canvas too (at least 8x6
  tiles).
- The room: floor `W x D` tiles at `gz = 0`; back walls along `gy = 0`
  (right wall) and `gx = 0` (left wall), `wallH` units tall.
- Boxes (`{x, y, z, w, d, h}` in world units) are rasterised by inverse
  mapping: for every pixel in the box's screen bounds, solve which visible
  face (top, front-left at `y + d`, front-right at `x + w`) it lies on and
  its face coordinates `(u, v)`; a per-face painter returns the colour (base
  colour with shading, or a texture: books, screens, buttons, glow).
- Draw order: floor, walls (with wall decor), then all boxes, characters and
  pixel particles sorted by depth `gx + gy` of their front edge (painter's
  algorithm; furniture stands against the walls, so this is exact for the
  layouts used).

## Rendering pipeline

```
World.draw
 └ Stage.draw(screen, t, now, selected)
    ├ PixelCanvas.clear(theme.backdrop)
    ├ room: floor + walls + wall decor (theme painters)
    ├ sorted: station boxes, characters (pixel sprites), shadows, particles
    ├ theme.ambient(canvas, room, t)   light beams, rain, glints (pixel space)
    ├ canvas.blit(screen, rect)        half-block compositing
    └ labels (cells): name tags, bubbles, z/?/! marks, selection arrow
```

`PixelCanvas`: `w x h` pixels (`h = 2 * rows`), packed RGB with a
transparent sentinel; `blit` writes `▀` cells (or a plain space when both
pixels match).

## Characters

Pixel sprites built per frame from `Traits` (species, skin, hair, shirt,
trim, pants, accessory, eye colour): 7 px wide and 12 px tall, anchored at
the feet. Poses: idle (breathing + blink), walk (4-frame leg cycle, 1 px
bob), work variants (typing arms, holding a book, magnifier, phone, pointing,
gesturing, hand on chin), done (jump, arms up), error (shake, red), sleep
(slumped, eyes closed). Facing: front (towards the viewer, face visible) or
back (hair visible), times left/right mirror, from the walking direction; at
a station the character faces the furniture. A soft elliptical shadow is
blended into the floor under each character.

Labels stay as text cells: the name tag above the head, the bubble above
that, `z`/`?`/`!` marks, and the selection arrow.

## Stage

- Floor grid with the entrance on the left wall near the front corner and
  stations against the two back walls (read, search, web on the left wall;
  write, run, think, idle on the right wall), each with a footprint and a
  work spot on the free floor in front of it; slots fan out along the wall
  so several agents can share a piece of furniture.
- Actors move in tile space at about 3 tiles/s along straight segments
  across the free central floor (furniture only lines the walls).
- Lifecycle as before: spawn at the door with a pixel sparkle, walk to the
  station for the activity, work, celebrate when done, walk out and
  despawn; leaving agents walk back to the door.
- Particles live in pixel space (sparks, confetti, steam, bubbles).
- The previous level/ladder model is dropped: the iso room scales with the
  terminal instead.

## Themes

```ts
type IsoTheme = {
  id: string; name: string; tagline: string;
  palette: Palette;                                         // UI colours (unchanged)
  backdrop: RGB;                                            // canvas outside the room
  wallH: number;                                            // wall height (units)
  floor(gx: number, gy: number, t: number): RGB;            // per floor pixel
  wall(side: 'left' | 'right', u: number, v: number, t: number, now: number): RGB; // per wall pixel
  stations: Record<StationKind | 'entrance', IsoStation>;
  ambient?(canvas: PixelCanvas, room: RoomView, t: number): void;
};
type IsoStation = {
  name: string;
  size: { w: number; d: number; h: number };                // footprint in tiles, height in units
  model(t: number, active: boolean): Box[];                 // voxel model in local coords, animated
};
type Box = { x: number; y: number; z: number; w: number; d: number; h: number;
             top: Paint; left: Paint; right: Paint };       // Paint = RGB | (u, v, t) => RGB | null
```

`wall` paints wall pixels in wall coordinates (`u` along the wall in tiles,
`v` up in units), which is where windows, posters, neon signs and clocks
live. Presets keep their identity: Mad Science Lab (white tiles, flasks,
tesla coil, chalkboard), Underground Club (dark bricks, DJ booth, pulsing
dance-floor tiles, light beams), Hacker's Den (matrix rain wall, CRT rig,
server rack), Orbital Station (viewport with planet, reactor, holo-table),
Cozy Café (window with rain, espresso machine, sofa).

## What stays

Connector (`src/claude`), demo source, World key handling and overlays, UI
chrome (header, roster with face icons, ticker), terminal/renderer, config,
CLI and CI. `src/world/character.ts` keeps `traitsFor` and the cell face used
by the roster; pixel sprites live in a new module.

## Testing

- Projection/inverse: round-trip world↔screen; box face selection returns
  the expected face/uv at sampled pixels.
- Canvas: blit produces `▀` with the right fg/bg; transparent pixels show
  the backdrop.
- Room layout: room fits the canvas from 60x20 to 300x80; stations inside
  the floor, against walls, non-overlapping; work spots on free floor.
- Sprites: every pose x facing x frame stays inside its box and uses trait
  colours; walking frames differ.
- Stage: actor reaches the work spot of its activity's station, despawns via
  the door; draw at many sizes without throwing; labels never overlap.
- Themes (each): all station kinds, models return boxes inside the
  footprint, painters return colours, ambient/backdrop draw inside the scene
  at many sizes and times.
- Frame-time check: under 3 ms average at 200x60 with 12 agents.
- Existing CLI/world/UI tests keep passing (snapshot per preset).
