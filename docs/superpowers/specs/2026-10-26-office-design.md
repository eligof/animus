# The office: a startup world and office life

Date: 2026-10-26. Branch `office` (from `main` at 29d66a2).

The user asked for "office stuff". Two independent parts, built in
parallel:

1. **The Startup** (`office`): a sixteenth world, a modern startup loft.
2. **Office life**: four new moments the crew acts out in every world.

Art direction as for every world (`2026-10-24-illustrated-design.md`):
outlined cartoon, one ink colour, light from the upper left, no text in
the picture. Nothing copies a real company's logo, product or brand.

## Part 1: The Startup (`office`)

A `WorldDef` (`src/worlds/types.ts`) registered after the fifteen existing
worlds (the digits keep reaching the first ten; `t` / `T` and the picker
reach it).

- Name "The Startup", tagline "Exposed brick, standing desks and an
  espresso machine that never sleeps".
- **Room:** exposed brick back walls with big black-framed industrial
  windows onto a city skyline; polished concrete floor with a warm
  wood-plank zone; pendant lamps hanging along the wall tops. Overlay:
  slow clouds past the windows and city lights blinking on at dusk (light,
  above head height, like the other worlds' overlays).
- **Stations:**
  - write: a standing desk with dual monitors (screens glow and scroll
    abstract lines while worked)
  - read: a tall bookshelf with a beanbag in front
  - search: a kanban board of coloured sticky notes (notes shuffle while
    worked)
  - run: a server rack with blinking lights and a 3D printer beside it
    (the printer head moves while worked)
  - web: a wall-mounted TV showing dashboard graphs (bars and lines, no
    text)
  - think: a whiteboard wall of boxes and arrows (a new arrow is drawn
    while worked)
  - idle: the kitchen counter with an espresso machine and stools
    (`drink`, `seat`)
  - entrance: a glass door with a plain abstract logo shape
- **Decor** (clustered by walls and stations, never loose in the front
  third, as the room planner now enforces): a ping-pong table, beanbags,
  potted plants and a big fiddle-leaf fig, a bike on a wall rack, a snack
  shelf, a phone booth, standing lamps, a neon squiggle (no text).
- **Crew:** a new costume `startup`: hoodie, jeans and sneakers on every
  species; ★2 hat a backwards snapback cap; ★8 its own alternative
  colours (the ★8 test's minimum distance holds).
- **Critter:** a new `corgi`, the office dog, with the same life as the
  other critters (wander, follow, be petted, a heart).
- **Finale** confetti in bright brand-free colours; build `tower` (a
  trophy shelf).
- **Process:** reference research (real startup offices; how cozy office
  games draw them; a do-not-copy list), groundwork (costume, hat, corgi,
  registration), one world agent in its own files, code/art/trademark
  review, fixes.

## Part 2: Office life

All moments are cosmetic. They follow what the crew is really doing and
never hide it: an agent that is working stays at its station. They are
new errand kinds in `src/world/life.ts` beside chat, pet, haul and nap,
and use each world's own spots.

- **Kick-off huddle.** When a lead starts one or more subagents within a
  few seconds, the new subagents walk in to the lead's side, stand round
  it facing in (a nod, a speech mark) for about 2.5 s, then each walks to
  its station. At most one huddle per lead every 30 s. Skipped when the
  lead is not in the room or a subagent's first task is already running.
- **Coffee runs.** Now and then an idle agent walks to the world's drink
  spot (espresso counter, bar, mess bench, campfire…) and back, then
  carries a mug in its hand for a while, also while working, sipping from
  it. New art: a held mug and a sip pose.
- **High-fives.** When a subagent finishes and its lead is in the room, it
  walks to the lead and both do a high-five (a new two-figure gesture with
  a small star burst), then it goes on to the existing finale and leaves.
  If the lead is working, the lead only turns and raises a hand at its
  desk.
- **Stand-up.** When a crew has three or more idle agents, at most once
  every few minutes, they gather in a ring on open floor (the yard or a
  plaza) and take turns in the talk pose with speech marks for about
  8 s, then scatter. Anyone whose agent gets work leaves at once.
- Frequencies are tuned so a room is lively without the crew always away
  from its desks. The `o` key turns office life off and on, remembered like
  the view (`r`) and lighting (`l`), for anyone who wants pure status.

### Tests

- Each moment fires when its trigger happens and not otherwise; it ends
  within its timeout; working agents never leave their stations for it;
  an agent that gets work mid-moment leaves at once.
- The demo crew shows all four moments within a few minutes (its pinned
  crew-moves hash is updated deliberately, with the reason in the commit).
- New gestures (high-five, mug, sip) pass the figure tests (sane sprites,
  key equals pixels) for every species and costume.
- Frame budgets hold.

## Build, check, ship

- Work on `office` from public `main`, commits with the maintainer's
  noreply identity, shipped as a pull request through the required checks.
- The world and office life are built in parallel worktrees; they touch
  the figure code from two sides (a costume; new gestures) and are merged
  by rebase.
- Before merging: frames measured in a real Ghostty against the café, and
  screenshots of the Startup and of each office-life moment for the user.
- README: the Startup in the gallery, a short "Office life" section, the
  new setting in the keys/options.
