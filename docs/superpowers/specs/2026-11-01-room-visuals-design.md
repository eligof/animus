# Room visuals: light, night and a signature for every room

Date: 2026-11-01. Branch `room-visuals` (from main after #9).

## The ask

The user: "make the visual side of the rooms, spin up some graphical
agents to check the aesthetic and the visuals of the worlds and let them
think about the changes".

## How it was judged

A generator/evaluator loop on offline renders (`scripts/scene-shot.ts` at
the user's 19x42 px cells: the 100x30 room, zoomed in, the 80x24 and
150x46 rooms, and lights off). Critics scored every world on a rubric
(design quality 0.35, originality 0.30, craft 0.25, function 0.10; pass
7.5) and proposed changes; builders, each owning a few worlds or one part
of the engine, made them; fresh critics scored again.

Round 0 (main): no world passed. From 5.8 (shelter) to 7.4 (cafe,
station); the engine's share 6.4. What every critique found:

- The agents' builds were voxel stacks, the style the user had rejected
  twice, and often the brightest thing in the room.
- Light did not show. Pools were screen-blended and vanished on bright
  floors; `l` (lights off) changed under 1 % of the picture, since no
  room or prop knew the lights were off.
- No shade where planes meet: the two walls were the same value (the art
  rules want the left about 18 % darker) and the back corner was brighter
  than the front in 14 of 16 rooms.
- Big rooms (150x46) kept the decor of the 100x30 room and looked empty.
- Furniture parked in front of rooms' hero pieces (the cafe's hearth, the
  club's mural, the den's video wall).
- Rooms read as one diamond in sixteen colours: generic shells with
  themed props.

## The user's calls

- Builds: **smooth sculpted** objects (over keeping blocks with a shadow).
- Lighting: all three of a baked **shell light pass**, **declared lights**
  with `l` as a real **night**, and a per-world **evening tint**.
- Room shape: **kept** (square floor, same height); the effort goes into
  the art inside it.

## The engine

- **Shell light pass** (`src/art/scene/light.ts`, every room, drawn into
  the base tiles once a scale): shade where the floor meets the walls and
  in the back corner, the floor darker toward its far corners but light
  in the front walkway, walls darker toward their tops, the left wall a
  shade darker, soft shadows behind props that stand against a wall.
  Tuned per world with `WorldDef.light`.
- **Declared lights**: `RoomArt.lights` and `PropArt.light` name lamps
  (out at night), fires, lava, glows and screens (on at night) and windows
  (a patch of sun or moon on the floor, cut by the bars). The engine draws
  floor pools that brighten the floor by the light's colour times its own
  (a brown floor turns gold and its planks still show), wall washes and
  halos. All of it is baked into the base or into props' kept pictures.
- **Night**: `lit` reaches the art (`RoomView.lit`, `PropView.lit`, the
  desks' pictures; read it with `lampsOn`), and every kept picture is kept
  per lit state, so `l` repaints once. At night the room is graded cool
  and dim (per world: `light.night`), lamps are out, and emitters and
  moonlit windows carry it; the crew gets 30 % of the darkening, emotes
  and label pills none; the backdrop is never darkened.
- **Evening tint**: `WorldDef.ambient` now applies fully to the room,
  props and builds, half to the crew, not to emotes and pills.
- **Builds** (`src/art/scene/build.ts`): the blocks of `src/world/build.ts`
  stay the progress model, but are only measured; each shape is drawn
  smooth with the art rules' shading in the world's build colours (a round
  tower with battlements and a lantern, a gabled house with lit windows,
  a smooth pyramid with a stair, a robed statue with a staff and orb, a
  machine with a tank and a stack). While it rises, the solid is cut at
  the laid height under a fresh course, with two poles and a plank beside
  it and the rest a clean see-through ghost. Every build casts a contact
  shadow, and pale build colours are capped near the room's wall value so
  a build no longer out-shines a dark room.
- **Smoke and steam**: cartoon puffs (three rounds as one shape, a light
  crescent on top), not airbrushed discs.
- **Big rooms** (`src/world/room.ts`): above the 100x30 room (97 units)
  wall decor grows with the free wall length and floor decor with
  (side / 97)^1.5, cycling evenly through the world's list; the extra
  pieces only line the back walls. Rooms up to 97 units plan as before.
- **Keep-clear** (`WorldDef.reserve`): stretches of wall (and how far into
  the room) or floor patches the planner keeps decor out of. A room
  planned while a world is being asked for its reserve is planned without
  it, so a world that plans its own furniture to answer can't recurse.
- **`scripts/art-lint.ts`**: the art rules' numbers per world (left/right
  wall ratio, floor back/front, how much `l` changes, figure contrast,
  decor per room size).

## The worlds

Every world declares its lights, has its own night (and tint where the
default greyed it), drops the pools it used to paint by hand, and keeps
its hero clear where furniture hid it. Each also got a signature:

| world | what changed |
| --- | --- |
| mines | tilted dark strata with angular blocks, a gold seam at every size, a rough rock rim, cart ruts; lanterns and gold carry the night |
| lab | castle stone on the upper wall, pointed gothic windows, the generator in a recess with a plasma globe; a stormy night |
| club | neon at every room size, the mural above the strip, a dance floor that chases the beat and spotlights that sweep it; at night the rig is dark and the neon carries it |
| den | dark blocks and carpet lit by the screens, glyphs spilling off the video wall (now never hidden), a night street outside, moonbeams |
| station | each porthole a small scene, cargo nets, walkway plates, warm lamps between the portholes; planet light at night |
| cafe | the hearth slid clear of the furniture, a chalk menu and shelves over stations, a wet street outside; firelight and string lights at night |
| fungal | bulging cave rock, a giant glowing mushroom, an irregular geode, a wavy rim; teal light from the fungi |
| snowy | hand-drawn ice walls, white snow floor with blue shadows, a frozen mammoth, a snow-roll cornice; aurora-green skylights at night |
| vault | warm marble floor with brass reflections, cones of light under the girder lamps; only the gold glows after hours |
| hell | basalt with lava vents and glowing joints, a skull frieze, cracks fanning from the Maw; lit from below, red-brown at night |
| dunes | a turquoise sky and dunes outside, backlit sails for a dome, blown sand at the door; striped noon sun, deep desert-blue night |
| meadhall | lighter flagstones and pale plaster, an open window lattice, a longship tapestry over the hearth; the hearth lights the hall |
| starfall | slate wall foot, locker banks, a terrarium, mountains in the windows; pink daylight, violet night |
| shelter | dug into the earth (soil and clay on the cut walls), a checker floor in a border, a mural, bulkhead ribs; a night shift under amber emergency lamps |
| colony | warmer fieldstone, a timber wall plate and a girt hung with drying crops, shelves and pelts between the windows; golden windows |
| office | a mural over the standing desks, clocks, hanging pothos, golden-hour window patches, taller windows in big rooms |

Bugs found on the way: the shelter drew its window frame over the view
(the glass read as dark mirrors); the den's view sat 1.6 units behind the
wall, so its moon fell outside the opening; mines and fungal dropped
pieces near the edges of the 256 px tiles.

## Cost

Nothing new per frame: light, night and the tint are baked into the base
tiles and kept pictures, and a plate test checks that later frames, lit
and dark, send no pixels. The base paint grows by about 1 ms a tile for
the shell pass (up to 1.7 ms at night); a build's picture takes 4.4 ms at
the default zoom (3.3 for the blocks it replaces), once per course.
