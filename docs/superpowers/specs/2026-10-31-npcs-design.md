# The locals: three NPCs in every world

Date: 2026-10-31. Branch `npcs` (from `world-life`, which is PR #4).

## The problem

The user: "add some non AI standing in one place npc like animations,
like a dj at the club, or a barista at the coffee … those animations will
interact with the AI Animus, make them related to the worlds", then "3
related npc for each world, for the club 3 npc, the coffee 3 npc", drawn
as fully custom characters, interacting every way offered (reacting,
serving, drawing a crowd, chatting back), and "place them in fitted
locations on each world".

Since every agent works at a workstation of its own, the room's stations
are scenery nobody works. The locals bring them back to life: each works
one of its world's stations, where its job puts it.

## The cast

Each world has three locals, each at one of its world's stations (the
world's artist may refine the cast with research):

| world | locals (station) |
| --- | --- |
| club | DJ (DJ booth), bartender (neon bar), coat-check attendant (coat check) |
| cafe | barista (espresso bar), pastry chef (pastry case), old regular with a paper (wingback) |
| mines | blacksmith (smithy), assayer weighing gold (assay office), old prospector (dig face) |
| lab | hunchbacked assistant (tesla coil), professor (chalkboard), chemist (chemistry bench) |
| den | sysadmin (server racks), overclocker (rig), pizza courier (steel door) |
| station | captain (helm), engineer (reactor), comms officer (comms station) |
| fungal | herbalist (apothecary chest), mushroom witch (cauldron), a myconid (fairy ring) |
| snowy | camp cook (stove), ice fisher (fishing hole), radio operator (radio) |
| vault | teller (counting desk), safecracker (safe), guard (vault doorway) |
| hell | contract clerk (contract desk), forge demon (hellforge), witch (scrying cauldron) |
| dunes | mechanic (crank generator), lookout (spyglass), barkeep (bar) |
| meadhall | skald (long table), smith (forge), chieftain (high seat) |
| starfall | refinery tech (refiner), pilot (pilot's chair), cook (mess bench) |
| shelter | overseer (radar console), mechanic (water purifier), diner waitress (jukebox and booth) |
| colony | tailor (tailoring bench), blacksmith (smithy), camp cook (campfire) |
| office | IT admin (server rack), receptionist (glass door), office manager (kitchen island) |

## Where they stand

Each local names where its job puts it, in its station's frame, in one of
three ways:

- **behind** its counter or deck, inside the station's footprint at its
  back: its picture is cut at the counter top's height, so the counter
  hides its legs (the DJ behind the decks, the bartender behind the bar,
  the barista, the teller, the clerk, the coat-check hatch);
- **seated** in a seat that is part of its station, at the seat's height
  (the chieftain on the high seat, the pilot, the old regular in the
  wingback, the overseer);
- **standing** on the floor where the job is, outside every footprint, a
  spot the room planner keeps clear like a station's lanes (the smith at
  the forge's side, the guard by the door, the prospector at the dig
  face).

A station built flat against its wall gets a little room behind its
counter in its own art when a local needs it. A local faces into the room
(its face toward the viewer) unless its job turns it. Its station is
worked while it is on duty: it animates as when an agent worked it.

Locals are not agents: no label, not in the roster, not selectable; they
stay with no agents in the room. A key, `n`, turns them on and off,
remembered like office life's `o` (on by default). Where a room is too
small for a standing spot, that local is left out, as decor is. The text
dashboard does not show them.

## How a local is drawn

Fully custom characters on a shared puppet:

- A world's `npcs` lists its three. Each names its `station`, its place
  (mode, spot in the station's frame, facing; a cut height for one
  behind), and draws its **parts** with the sketch API in the critters'
  style (one ink, light from the upper left, about an agent's height, at
  most 16 units tall): its body, head, near arm, far arm, and what it holds
  or wears.
- A shared **puppet** drives the parts: the body's bob and lean, the
  head's tilt, each arm's shoulder and elbow, eyes (open, blink, happy,
  shut) and mouth (closed, open, smile, o).
- Each local's own **loops** set the puppet frame by frame: **work** (on
  duty, always: the DJ scratching and nodding, the barista tamping and
  pulling a shot), optionally a **show** (a longer performance for a
  crowd; every world has at least one) and a **serve** item (what it hands
  over: a cup, a cocktail, a pastry, a coat ticket).
- **Shared acts** drive the same puppet for every local, with no drawing
  of their own: wave, cheer, flinch, applaud, talk, nod, hand over (the
  arm out with its serve item) and beckon. Each starts and ends at rest.
- Pictures: each frame drawn once, cached by local, act, frame, facing,
  scale (and cut), then only placed, as figures and critters are. Emotes
  over its head use the existing emote layer.

## How they behave

- **Reacting.** Someone walks in: the local by the door greets them; the
  other two wave or nod about half the time. A task finishes: all three
  celebrate (their own way where they have one, a cheer otherwise). An
  error goes off: those near flinch, then look. A level-up: they applaud.
  A reaction waits for a serve to finish, never cuts it off.
- **Serving.** With office life on, a coffee run goes to the world's drink
  server (barista, bartender, barkeep, cook) instead of the drink spot: it
  stands at the serving spot in front, the local hands over the cup, it
  walks back with it as today. Idle agents may also choose to order:
  walk over, get the local's item (carried if a drink, a heart if not). A
  local serves one at a time; a second waits beside.
- **Shows.** Every 2 to 4 minutes, with at least two idle agents awake,
  one local with a show starts it for about 20 seconds; free idle agents
  walk over and stand in a ring in front (dancing at the club, watching
  elsewhere), applaud at the end and drift off.
- **Chats.** An idle agent wandering within a few steps of a free local
  sometimes stops for a short exchange: speech marks both ways, a nod, a
  laugh; at most one a minute an agent.
- **Rules.** Working agents are never pulled away; only idle agents and
  coffee runs interact. Everything is seeded: the same run plays the same.
  `n` off removes the locals and ends any errand with one; `o` off stops
  only the coffee runs.

## Rendering and cost

- A local is a depth-sorted point like a figure; one behind or seated
  stands on its station's box (the `on` link loops use), so it sorts on
  top of its station and behind what is behind it. A contact shadow for a
  standing one.
- Three always-worked stations a world are the main new cost. Budget with
  twenty agents and three locals at 150 x 46: the plate within today's
  16 ms, and no more than 4 KiB a step over the same room with locals off.

## Tests

- **Contract, every world:** three locals, each at a station the world
  has; behind: inside its station's footprint at its back, with a cut
  height; seated: a seat within its station; standing: a spot on the
  floor, outside every footprint, reachable; every act and frame draws
  inside its box in both facings; the same frame the same pixels; work
  loops move; a world's three look distinct.
- **Puppet:** every shared act on a sample local moves what it should and
  starts and ends at rest.
- **Behaviour:** the door local greets a newcomer; finish, error and
  level-up reactions; a coffee run served by the barista with office life
  on; an idle order served one at a time, a second waiting; a show draws
  free idle agents into a ring and lets them go, never a working one;
  chats with their cooldown; `n` off leaves nothing behind or stuck; the
  same run plays the same.
- **Key:** `n` toggles and is remembered.
- **Budget:** as above.

## Build, check, ship

1. Tests first.
2. Groundwork, a task at a time: the puppet and the art contract; the
   placement (planner, room); the scene; the behaviour (`src/world/npcs.ts`,
   new errands in life); the key and preference; one sample local (the
   club's DJ) proving the whole path.
3. Art: sixteen world tasks in parallel, three locals each (and room
   behind a counter where needed), each batch checked in a clean worktree
   before it is committed.
4. Code review and art review; fixes.
5. Ghostty captures for the user.
6. README; pull request through the required checks.

## Not in this project

Locals that walk about, locals in the text dashboard, selecting a local.
