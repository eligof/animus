# Workstations: one per agent, in every world

Date: 2026-10-26. Branch `stations` (from `main` at 32b9578).

## The problem

The user: "whenever the agents are running, they all stand in a group…
give the agents work space where they can work, and every time a new agent
is coming it will pop up a new work station. Make that on all worlds."

A stress run (a fake live source with 20 working agents: 4 leads with 4
subagents each, activities changing every few seconds) at 150x46 shows why:
each world has eight shared stations, so agents doing the same kind of
work queue in lanes in front of one station, and clumps form round the
island stations in the middle of the room.

## What changes

Every agent gets **one dynamic workstation of its own**, which pops up when
it arrives, and does all its work there. The workstation shows what the
agent is doing.

### The workstation

- Each world defines a `workstation` prop in its own style (the café a
  laptop table, the mines a lantern-lit workbench, the Longhall a scribe's
  desk, Starfall a holo console, the Startup a standing desk with a
  monitor, and so on for all sixteen worlds), drawn with that world's kit.
- The world draws the workstation's body and names where its screen or
  work surface is (a quad in prop-local units). A **shared activity
  layer** draws what the agent is doing on it, the same in every world:
  - write: code lines; read: an open page; search: a magnifier over a
    list; run: a terminal with sparks; web: a globe; think: a lightbulb or
    doodles; delegate/talk: speech marks; idle/waiting: a dimmed screen.
- Workstations are their own sprites (like the desk upgrades), never baked
  into the room: drawn once per world, scale and activity and reused, so
  they add almost no cost per frame.
- A plain fallback workstation (a simple desk with a screen, in the
  world's ink and palette) is used by any world that has not drawn its own
  yet.

### Where they go

- When a room is planned, it also plans **workstation slots** in pod
  shapes on the open floor (mostly the middle and front, now empty): a
  lead's slot with its subagents' slots round it, so a team sits together.
  Slots never sit on walkways, the entrance, the building plazas, the
  critter's yard, or in front of the room's stations; they do not hide
  stations or crowds from view. About 25 slots at 150x46 and about 12 at
  80x24.
- Agents take slots in order of arrival: a lead takes a pod's lead slot; a
  subagent takes a slot in its lead's pod, or the nearest free one.
- **Arrival:** the newcomer's workstation pops up as it walks in — grows
  out of the floor with a puff and a sparkle in about half a second — and
  it walks to it.
- **Departure:** when an agent leaves, its workstation stays empty for a
  few seconds, then shrinks away with a puff; the slot is free again.
- **Past capacity:** more agents than slots → a newcomer shares the
  nearest teammate's workstation, standing at its side (as it queues
  today). Nothing breaks.
- Workstations block walking like furniture; the walking grid is updated
  when one appears or goes, by marking only its cells.
- A ★5 desk upgrade (plant, mug, trophy) stands on the agent's own
  workstation instead of on the floor.

### What the world's stations do now

They stay as scenery that idle agents and office life use: the idle spot,
drink and warm spots, views, the entrance, the building plazas and the
critter's yard all keep working. Office life (huddles at the lead,
coffee runs, high-fives, stand-ups) works with workstations: the lead's
"desk" is its workstation.

## Tests

- **Stress test (written first, fails today):** a fake live source with 20
  working agents in every world at 80x24, 150x46 and 200x60: every working
  agent stands at its own workstation; no two working agents closer than
  about 4 units; past capacity, sharers stand at a teammate's side.
- Workstations never overlap props, walkways, the entrance, plazas or the
  yard; pods keep a team together; pop-in and pop-out finish on time; a
  freed slot is reused; the walking grid stays consistent (no one walks
  through a workstation; no one is trapped).
- The shared activity layer: each activity draws something different;
  sprite key equals pixels.
- Every world's workstation passes the contract (draws within its
  footprint and height, names a screen quad on its body).
- Frame budgets hold with 20 agents.

## Build, check, ship

1. The stress test first (red).
2. Shared groundwork in one agent: slot planning, workstation sprites and
   pop-in/out, the activity layer, agents walking to their own
   workstation, walking-grid updates, desk upgrades on the desk, the plain
   fallback.
3. Workstation art for all sixteen worlds, in parallel (about three worlds
   per agent, in each world's own files).
4. One round of code and art review, fixes.
5. Ghostty stress screenshots (20 agents in a few worlds, before and
   after) for the user, and frame timing against today.
6. README note; pull request on the public repo through the required
   checks; merge after the user's OK.
