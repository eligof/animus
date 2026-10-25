# Sprite compositor: design

## Why

In Ghostty the illustrated scene was "very laggy". Measured on the user's
machine (Ghostty 1.3.1, KDE Wayland at 1.15, so Ghostty renders at 2x:
cell 19 x 42 px, scene canvas about 2000 x 1300):

- Every change re-sent pixels: a full-canvas RGBA front (~180 KiB escaped)
  per picture, paced to 8 fps, which the 18 fps loop turned into ~5.6 fps.
  Choppy by design.
- Zoomed in or following an agent, the camera pans every frame, the still
  back changes with it, and every picture re-sent the ~1 MB back as well:
  3.5–5.8 MB/s, ~90 ms of our CPU per picture (over the 55 ms loop step).
- A probe in a real Ghostty: re-placing 61 already-sent images plus a
  panned base (source rectangle) costs 3.5 KiB and 0.14 ms per frame;
  Ghostty used 7% CPU at 30 fps, 10% at 60. z-order and source rectangles
  work.

So the terminal composites: pictures go out once and are kept, and a frame
is a list of placements. Pixels only travel for new sprites, the base when
the camera re-centres, and things animated in place (at the ambient rate).

## The contract: `src/art/plate.ts` (fixed)

`Pic { key, img, opaque? }`, `Placed { id, pic, x, y, volatile? }`,
`Plate { width, height, rect, cell, backdrop, layers }` (bottom first) and
`composite(plate)`, which draws it into one bitmap. The scene builds
plates; the kitty stream sends them; `composite` serves screenshots, tests
and the zoom ease.

## Scene: `Scene.plate(f: SceneFrame): Plate` (src/art/scene.ts)

Layers, bottom to top (all whole-pixel, unscaled sprites):

1. **base** (`id 'base:<tx>,<ty>'`, opaque): the backdrop with its soft
   light and the room shell in 256 px tiles on a grid fixed to the world
   at each scale, each tile painted on its own and kept (LRU-bounded); a
   pan only moves tiles and brings new ones into view. (A first version
   painted one picture with a margin round the view and re-centred it;
   every re-centre and every new zoom stalled 150-730 ms.)
2. **floor**: prop floor parts (shadows, pools of light) of still props
   (cached per prop, idle / worked, per layer), contact shadows (shared
   sprites), the selection ring and the hurt ring (sprites cached per
   scale and colour; the hurt pulse in 8 steps).
3. **depth**, in `depthOrder`: prop bodies (cached), builds and piles
   (cached), figures and the critter (their cached sprites), and between
   them the particles slotted as now, one volatile layer per non-empty slot
   (`id 'bits:<k>'`), drawn into a canvas cropped to what they paint.
   Animated props are volatile layers (`id 'prop:<i>'`) drawn on their own
   (as `propSprite` does, whole: body and floor) and redrawn only when the
   ambient tick (`floor(t * AMBIENT_FPS)`) or `active` changes.
4. **emotes** (cached sprites).
5. **overlay** (volatile, `id 'overlay'`): the room's overlay drawn in the
   base's space (so a pan moves it, not redraws it), redrawn per ambient
   tick and per base, cropped to what it paints.
6. **glows** (when lit): halos as cached alpha sprites (radius, colour,
   alpha in 8 steps); the complete-build pulse in 8 steps. Additive light
   becomes alpha-over; keep the look as close as the eye can tell.
7. **pills**: one sprite per label, cached by (width, height, colour, alpha
   in 16 steps, ink, strong).

The world's ambient tint (`tintAll`) is baked into everything below the
glows (base, floor, depth, emotes, overlay), through a cache of tinted
copies; glows and pills stay untinted, as now.

Keys must be stable: a cached sprite's key is the same string every frame
it is used (derive it from the sprite object's identity plus the tint, or
from what it was drawn from). `id`s are stable per thing (`fig:<id>`,
`prop:<i>`, `shadow:<figure id>`, `pill:<n>` ...).

The zoom does not ease: each scale's pictures are drawn afresh, so an
ease would send whole pictures for every step. It jumps, and the pan cuts
with it; the pan alone still eases.

## Warming

`SceneFrame.next` lists the cameras one keypress away (next agent, zoom
in, zoom out, previous agent, back to the room). With time left in a
frame, `Scene.warm(f, until)` paints, a unit at a time, what those would
show (tiles round the view, then each next camera's tiles, prop, figure
and emote sprites at its scale, then the rest of the room) and returns
the new pictures, which `PlateStream.preload` sends ahead unplaced. A key
press then only moves pictures the terminal holds: measured in Ghostty,
8-32 ms from key to screen (was up to 730 ms).

`Scene.render(f)` stays for screenshots and tests: `composite(plate(f))`. The back/front split (`backOf`,
`SceneImage.back`) and the `stamp` keys go.

## Stream: `PlateStream` (src/term/plates.ts)

`step(plate | null): string` returns the escapes for one frame inside a
synchronized update ('' when nothing changed):

- New pics are transmitted once (`a=t`, PNG; RGB for opaque) under a new
  image id and kept; volatile placements own one image id each and a new
  pic replaces it (`a=T` under that id).
- A placement goes out (`a=p,i,p,X,Y,z,C=1,q=2`, cursor at its cell)
  only when its image, cell, offsets, source rectangle or z changed;
  placements gone from the plate are deleted (`a=d,d=i,i,p`).
- Placements are cut to the canvas with a source rectangle (`x,y,w,h`),
  never placed outside the scene's cells. Pixel (px, py) of the canvas is
  cell (rect.x + floor(px / cell.w), rect.y + floor(py / cell.h)) with
  offsets `X = px mod cell.w`, `Y = py mod cell.h`. All keys are integers.
- z: all below the text (`z <= UNDER_CELLS`), in layer order.
- Kept images are evicted least recently used past a budget of decoded
  bytes (`a=d,d=I`).
- `null` (no scene) deletes the placements and keeps the images;
  `invalidate()` (resize, cell size, theme) forgets everything and deletes
  all images; `clear()` gives the escape that deletes everything (exit).

## App

Each loop step draws the text and steps the plate stream, together in one
synchronized update; no label holding, no motion / ambient pacing: if
nothing moved, nothing goes out.

## Tests

- Stream: a model terminal (transmit, place with offsets / source rect /
  z, delete by image and placement) composites what it holds; after every
  step it must equal `composite(plate)`, through moves, pans, clipping at
  all four edges, volatile changes, layers coming and going, eviction and
  invalidation. A step where only placements moved carries no image data.
- Scene: `composite(plate(f))` matches the previous renderer (reference
  frames saved before the change): exactly with the lights off, and with
  them on except near glows. Keys are stable across frames and pans; a pan
  paints only the tiles it brings into view; after `warm`, the plate at a
  next camera paints nothing.
- Perf (real Ghostty probe): per-frame bytes and Ghostty CPU at the loop
  rate, zoomed and following.
