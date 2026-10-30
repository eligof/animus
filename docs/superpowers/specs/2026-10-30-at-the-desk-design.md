# At the desk: world clutter, world tools, desks that move, work beats

Date: 2026-10-30. Branch `world-life` (from `main` at 298ddac).

## The problem

The user, after workstations shipped: "make the workstations more related
to the world, and make more moving parts on the maps also related to the
world and try to make the animation better", then on seeing the sixteen
workstations: "looks nice, try randomize the top of the workstations,
also the tools each anima uses, make them related to the world too".

The ask splits into three projects, built in this order, each with its
own spec, plan and pull request:

- **A, at the desk (this spec):** random world clutter on desk tops,
  world tools in hand, desks that animate while worked, and richer motion
  while at work.
- **B, living rooms:** stations that animate on their own (since agents
  work at their own desks nobody works the room's stations, so the
  espresso machine, the club's decks and the rest never move now), world
  things that travel the room, weather and windows.
- **C, motion polish:** walking (easing, less sliding), and pop-ins and
  effects with more life.

Today every desk of a world is one of three fixed looks; every agent in
every world writes with a notepad and pencil, reads a book, swings a
mallet, searches with a magnifier and browses on a tablet; a workstation
never moves; and an agent at work loops one short motion for as long as
the activity lasts.

## What changes

### 1. Desk-top clutter, and the desk picture in two

- A world's `workstation` gains an optional `clutter`: a pool of 8 to 12
  small items in the world's style (the mines: ore chunks, a tin cup, a
  coil of fuse, a candle stub; hell: a skull, a goblet, bones, a black
  candle), each with its own draw and a footprint of at most about 1.5
  units, and a list of spots on the desk's top where one may stand. Every
  spot is clear of the screen, of the desk upgrade's spot (`top`) and of
  the agent at work's figure on screen, in either frame (held to it as the
  upgrade is).
- Each place gets 2 to 4 items, picked with a seed from the world's id and
  the place's index: a desk keeps its look while it stands, and its
  neighbours differ. The three body looks stay; a world may move its fixed
  bits (a mug, a lamp) into the pool.
- The desk's picture splits in two:
  - the **body** (the desk, its clutter, lamps lit or not), keyed by world,
    frame, look, clutter pick, on or off (its agent at work), pop step and
    scale, drawn once a desk;
  - the **screen** (what the shared activity layer paints on its quad),
    keyed by world, frame, activity and scale, shared by every desk of the
    world and laid over the body.
  A change of activity then sends only a small screen picture, less than
  today's whole desk.

### 2. Desks that animate

- A world's `workstation` gains optional `loops` (one or two): an anchor
  on the desk, 4 to 8 frames, a rate of at most about 8 frames a second,
  and a draw for frame `i`: a lantern's flame, a cauldron's bubbles, a
  candle, a holo screen's shimmer, a fan, steam off a cup.
- The shared engine piece (B reuses it for rooms): loop frames cached by
  world, loop, frame, frame wall and scale; placed right after their desk
  in depth order; each desk's phase offset (neighbours do not flicker in
  step); played only while the desk's agent is at work, its first frame
  otherwise. Each frame goes to the terminal once, then is only placed.

### 3. Tools in hand

- A shared library, `src/art/figure/tools/` (a file a grip), of about 40
  small tools in the figure style. Each belongs to one grip, so the rig's motions stay as
  they are: **swing** (run), **held out** (search), **two hands** (read),
  **surface and writer** (write), **at the chest** (web).
- Each costume (one a world) names its five:

| world | write | read | run | search | web |
| --- | --- | --- | --- | --- | --- |
| The Mines | chalk on a slate | a folded map | pickaxe | lantern | crank radio |
| Mad Science Lab | pencil on a clipboard | lab manual | flask, shaken | geiger counter | plasma orb |
| Underground Club | marker on a flyer | vinyl sleeve | drumstick | glow stick | phone |
| Hacker's Den | marker on sticky notes | printout | screwdriver | flashlight | laptop |
| Orbital Station | stylus on a datapad | data slate | wrench | scanner | holo projector |
| Cozy Café | pen on an order pad | recipe book | whisk | magnifier | phone |
| Fungal Caverns | quill on a leaf | field guide | trowel | glowing mushroom | spore orb |
| Snowy Depths | pencil in a notebook | map | ice axe | lantern | radio |
| The Vault | fountain pen in a ledger | ledger | rubber stamp | jeweller's loupe | telephone handset |
| Hell | quill on a scroll | grimoire | trident | crystal ball | scrying mirror |
| Dust Outpost | pencil in a notebook | map | spanner | dowsing rod | radio |
| Longhall | quill on parchment | scroll | axe | torch | rune stone |
| Starfall Base | stylus on a datapad | data slate | multitool | scanner | holo projector |
| Atomic Shelter | pencil on a clipboard | manual | wrench | geiger counter | radio |
| Frontier Colony | pencil in a notebook | almanac | hammer | spyglass | radio |
| The Startup | marker on sticky notes | printout | ping-pong paddle | magnifier | tablet |

- The wizard costume (no world) keeps today's five. Think (a thought
  bubble), the mug and the carried block are as they are.
- Figure pictures are already cached by costume, so the tools cost nothing
  more a frame.

### 4. Work beats

- An agent at work (at its own desk, or sharing one) breaks its loop
  every 6 to 15 seconds (its own rhythm, the same every run) with one
  beat of 1 to 2.5 seconds: it glances at its screen and nods, leans in,
  stretches, scratches its head, taps a foot, or, with a mug, sips.
- Beats are gestures (the system the office-life moments use): they never
  move the agent, hold no one up, wait while it is in a huddle, a
  high-five or showing an emote, and end at once when its activity
  changes. They are work motion, not office life: `o` leaves them on.
- New rig poses: glance, lean, scratch and tap (stretch and sip exist).

## Tests

- **Contract (every world):** clutter items draw within their footprint
  and height; every clutter spot is on the desk's top and clear of the
  screen, the upgrade's spot and the agent's figure in either frame;
  loops are anchored on the desk, have 4 to 8 frames, draw within their
  box, and the same frame draws the same pixels.
- **Clutter:** a place's pick is the same every run and while it stands;
  among a world's first 12 places at least 8 picks differ.
- **Split picture:** a change of activity makes a new screen picture only,
  never a new body; the body changes with on and off, pop step and scale.
- **Tools:** every costume names a tool for each of the five activities,
  each of that activity's grip; each draws inside the figure's box,
  unclipped; the same pose in two worlds with different tools draws
  differently; the wizard's is today's.
- **Beats:** at work, a beat every 6 to 15 seconds; none moves the agent;
  none during a huddle, a high-five or an emote; an activity change ends
  one at once; with office life off they still come.
- **Budget:** twenty agents at 150 x 46 with every desk's loops: the next
  frame's plate time within today's budget, and, warm, no more bytes a
  frame to the terminal than today plus a few kilobytes.

## Build, check, ship

1. The tests above first, red.
2. Groundwork in one agent: the split desk picture, the clutter contract
   and pick, the loop engine, the tool library's grips with today's five
   as the fallback, the costume table, the beats and their poses.
3. Art in parallel: clutter pools and loops for the sixteen worlds (about
   three worlds an agent, in each world's own files), and the tool
   drawings (by grip, a file each).
4. One round of code and art review, fixes.
5. Ghostty captures (zoomed at desks in a few worlds, before and after)
   for the user; frame timing against today.
6. README; pull request through the required checks; merge after the
   user's OK.

## Not in this project

Stations, travellers, weather and windows (B); walking and effects (C);
new world themes; any change to how desks are placed.
