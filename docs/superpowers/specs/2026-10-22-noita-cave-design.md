# Noita-style isometric cave — design

User direction: "something closer to the game Noita but for iso point of view";
choices: full pixel physics + Noita look, an isometric cave/mine chunk with biome
presets, tiny Noita-sized characters. Built with parallel subagents.

## Scene

A cutaway chunk of underground terrain seen in 2:1 isometric, one voxel per pixel
(sx = ox + x − y, sy = oy + (x + y)/2 − z). Two thick rock back walls (x < T,
y < T) and a floor slab; front and top cut open so cut faces show strata. Stations
are props against the walls: anvil (write), bookshelf (read), dig face (search),
cauldron (run), crystal orb (web), candle altar (think), campfire + bedroll (idle),
tunnel (entrance). Characters are ~12 px robed wizards with glowing eyes and staffs.

## Simulation (src/cave/sim.ts, particles.ts)

Every voxel has a material (materials.ts): solids, powders (fall, pile), liquids
(fall, spread, layer by density), gases (rise, fade), fire (spreads to flammables,
leaves residue, makes smoke). Reactions: water+lava → obsidian+steam, water puts out
fire, acid dissolves, lava/fire melt ice and snow, gunpowder explodes. Chunked
activity (8³) keeps the cost to what moves. Free particles (sparks, embers, debris,
drops, runes, bolts) fly until they land; debris and drops become voxels. Healing
slowly restores the generated world (regrows carved rock, evaporates/erodes extra
loose material, refills springs) so a long-running session stays bounded.

## Agents drive the physics

Work at a prop has physical effects: hammer sparks at the anvil, digging carves the
wall and drops gravel, fire burns under the cauldron while running commands, candles
burn at the altar, the orb sparkles, runes drift off books. Errors explode a small
crater; finishing bursts into fireworks and gold dust; delegating casts a bolt at the
subagent; long idles drift z's.

## Rendering (raycast.ts, glow.ts, wizard.ts)

Per-pixel ray march through the voxel grid (unit DDA along (1,1,1)), face-shaded
per-voxel colour variants (the grain), front-to-back translucency for water, ice,
glass, gas and fire. Only pixels whose rays can see a changed voxel are re-cast each
frame. Characters and particles are depth-tested into copies of the buffers; the
compositor lights the frame: ambient + large-radius blur of emissive pixels
(fire/lava/crystal light the rock) + point lights (staffs, torches, lamps) + bloom +
vignette. The world renders into its own canvas; the stage crops it to the terminal
and pans when the terminal is smaller than the chunk.

## Biomes

Mines (default), Fungal Caverns, Snowy Depths, The Vault, Hell — each: materials and
colour overrides, terrain/strata/decor generator, the shared props with its own
materials, ambient weather (drips, sand trickles, snow, spores, lava falls, steam),
grade and UI palette.

## Kept

Claude connector, agent model, World/UI chrome, half/sextant pixel modes (`r`),
lighting toggle (`l`), config, CLI, CI.

## Testing

Material rules, explosion/dig/heal and bounded mass; raycast exactness (incremental
== full), occlusion, translucency; compositor light/bloom/depth tests; sprite
contracts; layout/generation invariants (spots standable, pools contained,
determinism); stage behaviour (walking, retargeting, effects, labels); per-module
and whole-frame performance budgets.
