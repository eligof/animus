# animus

Your Claude Code agents, as tiny wizards working in a Noita-style pixel cave
in your terminal.

Every running Claude Code session and every subagent it spawns gets its own
procedurally generated wizard (humans, robots, cats, aliens, ghosts, with
hats, robes, accessories and a glowing staff). What the wizard does follows
what the agent is doing right now: it hammers at the anvil while editing
files, reads at the bookshelf, digs into the rock while grepping, stirs the
cauldron while running shell commands, casts at the crystal orb while
browsing the web, ponders at the altar while thinking, and dozes off by the
campfire when a session waits for you.

![The Mines](docs/screenshots/mines.png)

## A cave where every pixel is simulated

The scene is a cutaway chunk of underground cave seen in 2:1 isometric, one
voxel per pixel, and like in Noita every voxel is a material that moves:
sand and gravel fall and pile, water and oil flow and layer, fire spreads to
anything that burns and leaves ash and smoke, gas rises and fades, lava
meeting water turns to obsidian and steam, acid eats rock.

The agents' work is physical:

- **writing** strikes sparks off the anvil
- **searching** digs a tunnel into the wall, dropping gravel
- **running** lights a fire under the cauldron and fills the air with smoke
- **errors** blow a small crater in the floor
- **finishing** sets off fireworks that rain down as gold dust
- **delegating** casts a spell bolt at the subagent

Over minutes the cave heals: craters regrow, loose debris erodes, springs
refill, so a long session never wrecks it.

It is lit the Noita way: dark rock lit by what glows. Fire, lava, glowing
fungus, crystals and every wizard's staff light up the rock around them,
with bloom around bright things and a soft vignette. Press `l` to see the
flat materials.

## Run it

Requires Node ≥ 23.6 (runs TypeScript directly, no build, no dependencies)
and a truecolor terminal (most modern ones: kitty, WezTerm, Ghostty,
Alacritty, Konsole, GNOME Terminal, iTerm2, Windows Terminal). Bigger
windows get a bigger cave; smaller ones get a camera that follows the
action (and the selected agent).

Terminals that draw Unicode sextants themselves (Alacritty, kitty, WezTerm,
Ghostty, foot) get **sextant pixels**: 2x3 pixels per cell instead of 1x2,
three times the resolution. Elsewhere animus uses half blocks; press `r` or
pass `--pixels` to switch. Detection goes by the terminal's environment
variables, so if the sextant blocks look wrong (say, a multiplexer or a font
without them), press `r` once: the choice is saved.

```sh
node bin/animus.js            # live: watch the Claude Code agents on this machine
node bin/animus.js --demo     # a simulated crew, no Claude data needed
node bin/animus.js -t hell    # pick a biome

# optional: put it on your PATH
ln -s "$PWD/bin/animus.js" ~/.local/bin/animus
```

Run it from a clone (or a symlink to one). Installing it as a package under
`node_modules` won't work: Node refuses to strip TypeScript types there.

Start Claude Code in another terminal (or several) and they walk in through
the tunnel.

## Biomes

| id | biome | vibe |
| --- | --- | --- |
| `mines` | The Mines | timbered shafts, coal seams, gold veins, torches, a water pool |
| `fungal` | Fungal Caverns | giant glowing mushrooms, drifting spores, a pit of toxic sludge |
| `snowy` | Snowy Depths | icy rock, falling snow, a frozen pond, warm braziers |
| `vault` | The Vault | a steel facility in the rock, acid in metal basins, blinking lamps |
| `hell` | Hell | red rock, a lava lake and a lava fall, bone piles, flame vents |

`node bin/animus.js --list-themes` prints the installed biomes. The last
biome you picked is remembered in `~/.config/animus/config.json`.

| | |
| --- | --- |
| ![Fungal Caverns](docs/screenshots/fungal.png) | ![Snowy Depths](docs/screenshots/snowy.png) |
| ![The Vault](docs/screenshots/vault.png) | ![Hell](docs/screenshots/hell.png) |

## Keys

| key | action |
| --- | --- |
| `t` / `T` | next / previous biome |
| `1`–`9` | jump to a biome |
| `p` | biome picker with live preview |
| `tab` / `shift-tab`, `←` `→` | select an agent (shows its current action; the camera follows it) |
| `esc` | clear selection / close overlay |
| `d` | toggle the demo crew (mixes with live agents) |
| `r` | pixels: half blocks / sextants (remembered) |
| `l` | lighting on / off (remembered) |
| `space` | pause |
| `?` | help |
| `q`, `ctrl-c` | quit |

## What the wizards do

| activity | triggered by | in the cave |
| --- | --- | --- |
| write | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | hammering at the anvil, sparks fly |
| read | `Read` | reading a glowing book at the bookshelf, runes drift up |
| search | `Grep`, `Glob`, `LS`, `ToolSearch` | swinging a pickaxe into the rock face |
| run | `Bash` and other tools | stirring the cauldron over a fire, smoke rises |
| web | `WebFetch`, `WebSearch`, MCP tools | casting at the crystal orb, sparkles |
| delegate | `Agent`/`Task`, `Skill`, `SendMessage` | casting a bolt at the subagent |
| think | thinking, planning, generating | hand to chin at the candle altar |
| talk | replying, asking you a question | gesturing |
| done | subagent finished | jumping, fireworks and gold dust, then leaves |
| idle | session waiting for you | by the campfire, then asleep with floating z's |
| error | a tool call failed | a small explosion, red `!`, staggering |

Leads (sessions) wear a tall hat with a star (or a crown). Subagents get
accessories from their type: reviewers wear glasses, explorers a miner's
lamp, planners/architects a beret, testers goggles, security agents a deep
hood.

## How it connects to your Claude account

Animus never talks to the network. It reads, read-only, what Claude Code
already keeps on disk:

- `~/.claude/sessions/<pid>.json` — which sessions are running and whether
  they are busy, idle or waiting on you (dead pids are ignored)
- `~/.claude/projects/<project>/<session>.jsonl` — the session transcript,
  tailed incrementally (only new bytes are read)
- `~/.claude/projects/<project>/<session>/subagents/agent-*.jsonl` and
  `.meta.json` — subagents and their type/description
- `~/.claude.json` — only your display name (or the first word of your full
  name) and plan label for the header; tokens and other account fields are
  never read out

Text taken from transcripts (commands, file names, replies) is sanitized
before it is drawn: control characters and escape sequences are dropped and
wide glyphs replaced, so nothing in a transcript can drive your terminal.

Use `--claude-dir` (or `CLAUDE_CONFIG_DIR`) to point at another config dir.

## Other options

```
animus --snapshot [--demo] [--theme id] [--width 120] [--height 36] [--at 12]
    render one frame as ANSI text to stdout (good for previews and CI)
animus --fps <n>      frame rate (default 18)
animus --pixels <m>   auto (default), half or sextant
animus --help | --version
```

## Development

```sh
node --test "test/**/*.test.ts"                                   # all tests
node scripts/preview-theme.ts hell --out /tmp/hell.png            # render a biome to PNG
ANIMUS_THEME_FILE=src/cave/biomes/x.ts node --test test/themes.test.ts   # check a new biome
```

Layout: `src/claude` (read-only connector), `src/demo` (simulated crew),
`src/cave` (materials, voxel world, falling-sand simulation and particles,
isometric ray caster, lighting, wizard sprites, cave layout and props,
`biomes/`), `src/world` (traits, stage, world composition), `src/iso`
(pixel canvas, half-block and sextant blitting, PNG), `src/ui` (header,
roster, ticker, overlays), `src/term` (cell screen, diffing ANSI renderer,
terminal handling).

### Adding a biome

Create `src/cave/biomes/<id>.ts` exporting a `Biome` (see
`src/cave/types.ts`, and `src/cave/biomes/mines.ts` as the reference): UI
palette, light grade, material colour overrides, a `generate(v, layout, rng)`
that fills the voxel world (rock slabs, strata, floor, pools, decor) and
builds the eight props, the props themselves (usually `makeProps` from
`src/cave/props.ts` with your own materials, wrapped where a biome needs a
twist), and an optional `weather` for ambient life (drips, snow, spores, lava
falls). Keep liquids in basins and flames away from anything flammable: the
simulation will happily burn your cave down. Check it with
`ANIMUS_THEME_FILE=src/cave/biomes/<id>.ts node --test test/themes.test.ts`
and the PNG preview, then register it in `src/cave/biomes/index.ts`.
