# Game-inspired worlds: design

Date: 2026-10-25. Branch `worlds-games` (from `main` at 67a381e).

## Goal

Five new illustrated worlds in the spirit of five games the user loves,
each with original names and art: no game names, logos, emblems or
iconic trademarked shapes anywhere (code, art, docs).

| world | id | in the spirit of |
| --- | --- | --- |
| Dust Outpost | `dunes` | Kenshi |
| Longhall | `meadhall` | Skyrim |
| Starfall Base | `starfall` | No Man's Sky |
| Atomic Shelter | `shelter` | Fallout |
| Frontier Colony | `colony` | RimWorld |

The ids are `dunes` and `meadhall` rather than `dust` and `longhall`:
the room planner seeds its furniture layout from the id, and those two
laid out badly (two existing layout tests failed); changing the planner
would move every existing world's furniture.

The game names above appear only in this design note, to say what each
world is reaching for; they never appear in the app, its art or the
README.

Each is a cutaway room like the existing ten (see
`2026-10-24-illustrated-design.md` for the art direction: outlined
cartoon, one ink colour, light from the upper left, no text in the
picture) and fulfils the `WorldDef` contract in `src/worlds/types.ts`.

## Not in scope

- Office furniture and office life (a later, separate project).
- New mechanics (weather systems, day/night, events): each world gets one
  animated room overlay, like the existing worlds, and nothing more.
- Changes to the existing ten worlds. (After review two shared changes
  reached them after all: the five that wore the wizard's robe got
  costumes of their own, and every room is now planned from the
  terminal's cells with its floor decor kept by the walls and stations;
  see Changes after review.)

## Shared groundwork

### Costumes

`Costume` (`src/world/character.ts`) gains five values, each drawn for all
five species (human, robot, cat, alien, ghost) in every pose and facing,
with its own ★2 level hat (`src/art/figure/look.ts`):

| costume | world | outfit | ★2 hat |
| --- | --- | --- | --- |
| `drifter` | dunes | wrapped scarf, a knee-length dark rawhide coat strapped shut, sleeves rolled over rag-wrapped forearms, baggy trousers | a low, wide straw cone with a chin cord |
| `nord` | meadhall | a homespun tunic under a wolf-grey fur mantle and a charcoal cloak, a wide belt with a round iron buckle, fur-topped cross-strapped boots, braids | a rounded iron helm with a ridge, a nose bar and cheek plates (no horns) |
| `exosuit` | starfall | one bright piece in its colour, a chest plate, pads and boot toes in its complement on a slate harness, a plain chest lamp | a round helmet in the suit's colour, its visor flipped up (no crest, no antenna) |
| `jumpsuit` | shelter | a deep teal jumpsuit with a plain orange placket and belt, leather forearm cuffs (no number, no logo, no wrist computer) | a newsboy cap |
| `colonist` | colony | an open knee-length duster over a cream shirt, slate trousers | a cowboy hat with a creased crown and a dark band |

The table gives the costumes as redrawn after review; the first drafts
are recorded under Changes after review.

Subagent accessories (headset, glasses, lamp, beret, goggles, hood, bow)
work as they do today; from ★2 the level hat takes the place of the lamp,
beret or hood, as in every world. The ★8 outfit swap gives each new
costume its other colours too (the jumpsuit's teal is dyed a deep shade
kept out of the blues, never royal blue).

### Critters

`CritterKind` (`src/worlds/types.ts`) gains three, drawn in the outlined
style with the same life as the others (wander, follow, be petted, a heart):

- `beetle` (dunes): a round sand beetle, shell and stubby legs.
- `hopper` (starfall): a small fluffy alien that hops, with antennae.
- `husky` (colony): a husky dog, curled tail.

The meadhall has the `fox` and the shelter the `rat`.

### Fifteen worlds

- The five join `WORLDS` (`src/worlds/index.ts`) after the existing ten,
  in the order above, so they come last in the picker (`p`), in `t` / `T`
  and in `--list-themes`.
- `1`–`9` and `0` keep jumping to the first ten; the five are reached
  with `t` / `T` and the picker. No new keys.
- The registry test in `test/themes.test.ts` lists the fifteen ids.
- CI's snapshot step loops over `--list-themes`, so it covers them with
  no workflow change.

## The worlds

Station props per slot (`write`, `read`, `search`, `run`, `web`, `think`,
`idle`, `entrance`), decor, the room overlay, points of interest, critter,
build shape and confetti. Palettes, backdrops and ink are each world's own
choice, in keeping with its mood.

### Dust Outpost (`dunes`)

A sun-bleached desert outpost: a drifters' bar and workshop. Room: walls
of adobe poured in courses, patched with riveted scrap plates and a pipe
run, under a steel ring beam and a ribbed dome; small windows onto the
dunes behind louvred shutters throwing shafts of hard daylight onto a
deck of bleached planks; shelves, bounty boards, tool racks and cold tube
lamps between the stations (first drafted as sandstone and scrap walls
with hide awnings). Overlay: gusts of sand streaking past the windows and
a heat shimmer, dust motes in the beams, a tube lamp's flicker.

- write: a scrap-wood desk with a ledger and ink pot
- read: a crate shelf of salvaged books and scrolls
- search: a spyglass on a tripod by a window
- run: a workbench with a crank generator (it spins while worked)
- web: a signal mast radio (the dial glows while worked)
- think: cushions and a teapot on a woven rug
- idle: a bar counter with stools (`drink`, `seat`)
- entrance: a heavy door with a hanging cloth
- decor: a bar's clutter: barrels racked on their sides, kegs, crates
  and drums stacked two high, scrap, sacks, strapped chests, a water
  tank; trestle tables with benches, tube lamps on poles, bedrolls, a
  mat with a toolbox, potted cacti (the big beast's skull hangs on the
  wall)
- critter `beetle`; costume `drifter`; build `pyramid` (a stone cairn);
  confetti in sand, rust and turquoise

### Longhall (`meadhall`)

A Nordic mead hall at night. Room: upright plank walls on a fieldstone
footing, carved posts with knee braces up to a carved beam hung with
crimson swags, smoke-darkened plaster above with small high lattice
windows onto snow; round shields, long banners (plain colours and simple
knot patterns, no emblems), an elk head and iron candle rings between the
stations; dark flagstones with crimson runners. Overlay: snow falling
past the windows and the firelight's flicker.

- write: a scribe's lectern with a quill
- read: a shelf of tomes and scrolls
- search: a map table with a candle
- run: a forge and anvil (sparks while worked)
- web: a raven on a perch (it ruffles and turns while worked)
- think: the chief's carved high seat
- idle: the long table with drinking horns (`seat`, `drink`)
- entrance: an iron-banded double door
- decor: a long stone-rimmed hearth against a wall with a cauldron and
  firewood (`warm`; first planned as a fire pit on the open floor), wall
  benches under shields, mead casks, weapon racks, a bound chest, stores,
  a woodpile with its chopping block, a tanning frame, a wolf-pelt rug,
  braziers; herbs hang on the walls
- critter `fox`; costume `nord`; build `statue` (a carved warrior);
  confetti in ember, gold and frost blue

### Starfall Base (`starfall`)

A prefab base on a strange bright planet. Room: grey modules in thick
rounded frames with orange trim and blue lights in their recesses. One
wall is the planet side, mostly glass bays onto a pink sky, teal hills,
giant odd flora, two moons and a ringed planet; the other is the base's
working side, with light panels, wall screens, hose reels and vents
under a cable tray (first drafted as glass domes on both walls). The
floor is metal deck plates with hex and triangle inlays and light strips.
Overlay: slow drifting light motes and a shooting star now and then.

- write: a holo desk (its projection flickers while worked)
- read: a rack of glowing data cubes
- search: a scanner on a stand, sweeping
- run: a refiner, glowing and chugging
- web: a comms dish that turns
- think: a pilot's chair facing the glass
- idle: a mess bench with a food processor (`seat`, `drink`)
- entrance: an airlock
- decor: storage capsules stacked two high, canister racks, glowing
  planters, cargo crates, paddle-leaved alien plants in pots, caged lamp
  pillars, round power pods
- critter `hopper`; costume `exosuit`; build `tower` (a signal beacon);
  confetti in magenta, cyan and gold

### Atomic Shelter (`shelter`)

A retro-atomic bunker under the wasteland in 1950s paint: teal, orange
and cream (first drafted in shelter blue and yellow). Room: cream steel
panels between raised frames over a mint band with a teal stripe (pink
behind the kitchen, the diner's corner), a teal frieze under a bundle of
pipes with orange valves; capsule lights, rounded-corner windows, a
chalkboard, framed landscapes, a starburst clock, a fuse box, an amber
radiation sign and vents between the stations; an ochre resin deck with
a riveted steel border. Hazard stripes are amber. Overlay: one capsule
light flickering, dust drifting down through their light and steam off
the valves. The entrance is a rectangular blast door with a wheel: never
a round cog-shaped door.

- write: a typewriter desk
- read: a filing cabinet with manuals on top
- search: a radar scope (the sweep turns while worked)
- run: a bubbling water purifier with gauges
- web: a green-text CRT terminal (lines scroll while worked; glyph-like
  marks, no readable text)
- think: an armchair by a valve radio
- idle: a jukebox and a diner booth (`dance`, `seat`)
- entrance: the blast door
- decor: a diner's kitchen on red and cream checker (a rounded fridge, a
  counter, a chest soda cooler, all unbranded), shelves of canned food
  (plain labels), lockers, an iron cot, a chest of drawers with a lamp, a
  water cooler, pedestal tables with folding chairs, water drums, a
  mutant potted plant
- critter `rat`; costume `jumpsuit`; build `machine` (a small reactor);
  confetti in teal, orange and cream (first drafted as shelter blue,
  yellow and green)

### Frontier Colony (`colony`)

A colony base on a frontier world. Room: plain walls of cut stone in
offset courses, bare but for windows onto hills and a big sky (first
drafted as rough stone and plank walls hung with tools); the floor zoned
as a colony zones it: planks for living space, white tile under the
research bench and the sick bay, stone slabs under the forge and the
benches, dashed stockpile outlines round the stores. Overlay: the
campfire's flicker and fireflies outside.

- write: a tailoring bench
- read: a research bench with a microscope and books
- search: a stockpile of crates and sacks
- run: a smithy (glowing while worked)
- web: a trade-comms console
- think: a chess table
- idle: a campfire with log seats (`warm`, `seat`)
- entrance: a wooden door with a sun lamp
- decor: hydroponics racks, stacks of wood and steel, a sick-bay bed with
  a vitals monitor, a colonist's bed and chest, a shelf of stores, a
  workbench, a cooking stove, supply crates, a battery bank, standing
  lamps, a long plank table, potted plants, a sculpture on a plinth, a
  small turret
- critter `husky`; costume `colonist`; build `house` (a cabin); confetti
  in grass green, wood brown and sky blue

## Speed

The same rules as the existing worlds: static props are drawn once and
cached; animated props (`animated: true`) are small and redraw only their
moving part; overlays are light. Each world's own test includes a
frame-time check with the `budget()` helper (as the existing world tests
do), and each new world's busy frame is measured in a real Ghostty before
it ships.

## Testing

- Costumes and critters: the existing figure and critter tests loop over
  every costume and critter (sane sprites, no clipping at the sprite's
  edge, sprite key equals pixels, every costume's hat drawn, outfit swap
  changes pixels); the new values must pass them.
- Each world: the contract test
  (`ANIMUS_THEME_FILE=src/worlds/<id>.ts node --test test/themes.test.ts`)
  and its own `test/<id>.test.ts` in the pattern of the existing world
  tests (every prop drawn within its footprint and height, animated props
  change while worked, the budget).
- The registry test lists fifteen worlds; CI snapshots each at two sizes.

## How it is built

1. Groundwork (costumes, hats, critters, the registry and test for
   fifteen), test first, then reviewed.
2. Five world agents in parallel, each owning only `src/worlds/<id>.ts`,
   `src/worlds/<id>/` and `test/<id>.test.ts`; no git and no shared files.
   The coordinator commits each world and registers it.
3. Each world reviewed for code and art (the art direction above,
   footprints, the trademark rule: no logos, game names, emblems or iconic
   shapes), then fixes.
4. Ghostty screenshots of all five with the demo crew for the user before
   merging; changes as asked.
5. README gallery to fifteen with new screenshots; a PR to `main` through
   the CI loop; squash-merge.

## Changes after review

What changed once the user had looked at the five worlds (and the rest)
in a real Ghostty. The sections above describe the worlds as they now
are; this records what moved and why.

### The Atomic Shelter's colours

The shelter moved from blue and yellow to teal, orange and cream. A blue
jumpsuit with a yellow stripe is the inspiration's signature trade dress,
and it read as that even with no number and no logo. The jumpsuit is now
one deep teal piece with a plain orange placket and belt (still no
number, no logo), its ★8 dye kept out of the blues; the room went to
1950s teal, orange and cream paint over an ochre deck, the purifier's
tanks to teal, the hazard stripes to amber, and the confetti from shelter
blue, yellow and green to teal, orange and cream.

### The worlds, re-themed from references

Each game world was re-themed from reference research into what its game
looks like: walls, floor and decor gathered in clusters.

- Dust Outpost: poured-adobe walls patched with scrap plates under a
  ribbed dome, louvred windows throwing light on bleached planks, and a
  bar's clutter of racked barrels, crates, trestle tables and bedrolls.
- Longhall: plank walls between carved posts on a fieldstone footing
  under a beam of crimson swags, dark flagstones with crimson runners,
  and a hearth, benches, casks, racks and a woodpile against the walls.
- Starfall Base: grey prefab modules with orange trim and blue lights,
  one wall glass onto the planet and the other the base's working side,
  deck plates with inlays, and capsules, canister racks, planters and
  lamp pillars.
- Atomic Shelter: cream steel panels over a mint band, a pipe bundle with
  steaming valves, an ochre resin deck, and a diner's kitchen corner,
  lockers, a cot and tables with folding chairs.
- Frontier Colony: plain cut-stone walls with only windows, a floor
  zoned in planks, tile and stone with stockpile outlines, and a sick
  bay, beds, a stove, a workbench, lamps and a long table.

### Costumes

The five game costumes were redrawn after their games' typical outfits
(the table under Costumes is the result). The first drafts were: for the
drifter a sand-coloured long coat and a wide straw hat; for the nord a
fur cloak over a tunic and an iron helm with a nose guard; for the
exosuit a bright two-tone suit and a visor helmet with a fin; for the
jumpsuit a blue jumpsuit with a plain yellow stripe and a flat cap; for
the colonist a work jacket with a utility belt and a wide-brimmed
rancher's hat.

Five setting costumes were added for the existing worlds that still
dressed their crews as wizards (the wizard costume stays in the code, but
no world wears it now), each for every species, with its own ★2 hat and
★8 colours:

- `miner` (mines): denim bib overalls over a rolled-up work shirt, a
  neckerchief and gloves; an old-time leather cap with a brass lamp.
- `forager` (fungal): a moss capelet over an oatmeal tunic, a satchel,
  shin wraps; a spotted toadstool cap.
- `parka` (snowy): a red puffy parka with a fur ruff and mittens; a
  trapper hat with fur ear flaps.
- `guard` (vault): a navy waistcoat, tie and watch chain over a pale
  shirt; a peaked cap.
- `demon` (hell): a scarlet robe, a high-collared plum cape, bone nubs
  and a tail; grand curled gold horns.

### Rooms

The user found the rooms too big and empty, with decor standing loose at
the front. Two fixes, for every world:

- Rooms are planned from the terminal's size in cells (at a nominal 10 x
  20 pixel cell), not its pixels: planned from the pixels, a HiDPI screen
  (Ghostty's 19 x 42 pixel cells) got a room twice the size. A 2x screen
  now shows the same room, only sharper. The largest room went from 256
  to 160 units a side (`LIMITS.maxSide` in `src/world/layout.ts`), so huge
  terminals don't get empty rooms either.
- Floor decor had gone to the most open floor, which was the empty front
  of the room. It now stands within 4 units of a back wall (its corners
  too), a station or another piece, and wholly out of the front third of
  the room (`src/world/room.ts`); a piece with nowhere like that is left
  out. This moved the existing worlds' decor too, which the choice of the
  `dunes` and `meadhall` ids had tried to avoid; the ids stayed.
