# animus

Your Claude Code agents, as little pixel-art characters working in an
isometric room in your terminal.

Every running Claude Code session and every subagent it spawns gets its own
procedurally generated character (humans, robots, cats, aliens, ghosts, with
hair, outfits and accessories). What the character does follows what the
agent is doing right now: it types at the desk while editing files, reads at
the bookshelf, scans while grepping, works the machine while running shell
commands, takes a call while browsing the web, ponders at the board while
thinking, celebrates with confetti when a subagent finishes, and dozes off
when a session waits for you.

![Mad Science Lab](docs/screenshots/lab.png)

The scene is real pixel art: every terminal cell shows several pixels (two
with `▀` half blocks, six with Unicode sextants where the terminal draws
them), drawn as a 2:1 isometric diorama with voxel furniture, outlined and
shaded characters and contact shadows. The room grows with your terminal.

Each preset is lit like a scene: an ambient grade, pools of coloured light
from screens, lamps, neon and spotlights (furniture glows brighter while an
agent works at it, and characters pick up the light as they walk through),
bloom around everything that glows by itself, haze and a soft vignette.
Press `l` to see the raw art.

## Run it

Requires Node ≥ 23.6 (runs TypeScript directly, no build, no dependencies)
and a truecolor terminal (most modern ones: kitty, WezTerm, Ghostty,
Alacritty, Konsole, GNOME Terminal, iTerm2, Windows Terminal). Bigger
windows give bigger rooms and more detailed characters.

Terminals that draw Unicode sextants themselves (Alacritty, kitty, WezTerm,
Ghostty, foot) get **sextant pixels**: 2x3 pixels per cell instead of 1x2, three
times the resolution, with characters drawn natively at that density (round
heads, eye shine, shirt motifs, two-tone shoes). Elsewhere animus uses half
blocks; press `r` or pass `--pixels` to switch. Detection goes by the
terminal's environment variables, so if the sextant blocks look wrong (say,
a multiplexer or a font without them), press `r` once: the choice is saved.

```sh
node bin/animus.js            # live: watch the Claude Code agents on this machine
node bin/animus.js --demo     # a simulated crew, no Claude data needed
node bin/animus.js -t club    # pick a scene preset

# optional: put it on your PATH
ln -s "$PWD/bin/animus.js" ~/.local/bin/animus
```

Run it from a clone (or a symlink to one). Installing it as a package under
`node_modules` won't work: Node refuses to strip TypeScript types there.

Start Claude Code in another terminal (or several) and they walk in.

## Scene presets

| id | preset | vibe |
| --- | --- | --- |
| `lab` | Mad Science Lab | bubbling flasks, tesla coils, a very busy chalkboard |
| `club` | Underground Club | neon, DJ decks, light beams and a pulsing dance floor |
| `den` | Hacker's Den | matrix rain, CRT rigs, server racks, a conspiracy board |
| `station` | Orbital Station | viewports onto a rotating planet, a pulsing reactor |
| `cafe` | Cozy Café | rain on the windows, espresso steam, string lights |

`node bin/animus.js --list-themes` prints the installed presets. The last
preset you picked is remembered in `~/.config/animus/config.json`.

| | |
| --- | --- |
| ![Underground Club](docs/screenshots/club.png) | ![Hacker's Den](docs/screenshots/den.png) |
| ![Orbital Station](docs/screenshots/station.png) | ![Cozy Café](docs/screenshots/cafe.png) |

## Keys

| key | action |
| --- | --- |
| `t` / `T` | next / previous preset |
| `1`–`9` | jump to a preset |
| `p` | preset picker with live preview |
| `tab` / `shift-tab`, `←` `→` | select an agent (shows its current action) |
| `esc` | clear selection / close overlay |
| `d` | toggle the demo crew (mixes with live agents) |
| `r` | pixels: half blocks / sextants (remembered) |
| `l` | lighting on / off (remembered) |
| `space` | pause |
| `?` | help |
| `q`, `ctrl-c` | quit |

## What the characters do

| activity | triggered by | on stage |
| --- | --- | --- |
| write | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` | typing at the write station, sparks |
| read | `Read` | holding a book at the read station |
| search | `Grep`, `Glob`, `LS`, `ToolSearch` | magnifying glass, question marks |
| run | `Bash` and other tools | working the machine, sparks |
| web | `WebFetch`, `WebSearch`, MCP tools | phone to the ear, signal waves |
| delegate | `Agent`/`Task`, `Skill`, `SendMessage` | pointing, at the think station |
| think | thinking, planning, generating | hand on chin, thought bubbles |
| talk | replying, asking you a question | gesturing |
| done | subagent finished | jumping with arms up, confetti, then leaves |
| idle | session waiting for you | idle, then asleep with floating z's |
| error | a tool call failed | red `!`, shaking |

Leads (sessions) wear a headset. Subagents get accessories from their type:
reviewers wear glasses, explorers a miner lamp, planners/architects a beret,
testers goggles, security agents a hood.

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
node --test "test/**/*.test.ts"                       # all tests
node scripts/preview-theme.ts src/themes/lab.ts --out /tmp/lab.png   # render a preset to PNG
ANIMUS_THEME_FILE=src/themes/x.ts node --test test/themes.test.ts   # lint a new preset
```

Layout: `src/claude` (read-only connector), `src/demo` (simulated crew),
`src/iso` (pixel canvas, isometric projection, voxel boxes, room layout,
pixel characters), `src/world` (traits, stage simulation, world
composition), `src/themes` (presets), `src/ui` (header, roster, ticker,
overlays), `src/term` (cell screen, diffing ANSI renderer, terminal
handling).

### Adding a preset

Create `src/themes/<id>.ts` exporting an `IsoTheme` (see
`src/themes/types.ts`, and `src/themes/lab.ts` as the reference): UI
palette, floor and wall painters (called per pixel with tile/wall
coordinates and the time `t`), and eight pieces of furniture — write, read,
search, run, web, think, idle and the entrance door — each a voxel model
`model(t, active)` returning boxes in its own frame (`a` along the wall, `b`
into the room, `z` up) with optional per-face painters for screens, books,
lights. An optional `ambient` draws effects over the finished scene.
Check it with `ANIMUS_THEME_FILE=src/themes/<id>.ts node --test
test/themes.test.ts` and the PNG preview, then register it in
`src/themes/index.ts`.
