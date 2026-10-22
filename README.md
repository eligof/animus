# animus

Your Claude Code agents, as little animated characters working in a 2D
terminal scene.

Every running Claude Code session and every subagent it spawns gets its own
procedurally generated character (humans, robots, cats, aliens, ghosts). What
the character does on screen follows what the agent is doing right now: it
types at the workbench while editing files, pulls books off the shelf while
reading, scans while grepping, works the machine while running shell
commands, waves a radio while browsing the web, ponders at the chalkboard
while thinking, celebrates with confetti when a subagent finishes, and dozes
off when a session waits for you.

```
 ◆ ANIMUS ▸ Mad Science Lab                       ● 8 working  ○ 0 idle  ◉ you   LIVE   21:30
        ┃   ┃   ┃   ┃     ▪                ▪     │● ● ● ● ● │    ▟!▙    │21:30│      │ CREW 8
       ▟█▙ ▐█▌ (█) ▟█▙    ▪▪          ▪▪▪▪▪▪     │▂▅▇██▅▃▁▁▂│           └─────┘      │ •ᴗ• atlas            2s
              ┌─────────┐                ┌────────┐       Fix flaky…    ╱┃╲         │  ▶ $ make lint
              │▌▐█▌▐▌█▐▌│                │╲╱╲╱╲╱╲╱│                 GitHub get_pu… │ └◎ᴗ◎ Add edge cases  5s
              ├─────────┤                ├────Draft roa…     ▄●▄     ┌──┸──┐        │   ✎ Edit cli.ts
 ║ ║          │█▐▌▌█▐▌▐█│                │ ▪▪ ◉ ▪ ▄▄▄▖       ◎ᴗ◎     │◉ ▤▤▤│   ▄╨▄  │ └•ᴗ• Draft roadmap   3s
▔╟─╢    ▔     │▐▌█▐▌▌█▐▌│       ▔       ▔└────────°~°   ▔   ▐█╋█╲    └─────┘   ◎▿◎  │   … thinking…
```

(Plain-text excerpt; the real thing is full truecolor and moves at 18 fps.)

## Run it

Requires Node ≥ 23.6 (runs TypeScript directly, no build, no dependencies)
and a terminal with truecolor and a font with block/box-drawing glyphs.

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

Tall terminals get a two-level scene (a mezzanine plus the ground floor,
connected by ladders); shorter ones get a single floor.

## Keys

| key | action |
| --- | --- |
| `t` / `T` | next / previous preset |
| `1`–`9` | jump to a preset |
| `p` | preset picker with live preview |
| `tab` / `shift-tab`, `←` `→` | select an agent (shows its current action) |
| `esc` | clear selection / close overlay |
| `d` | toggle the demo crew (mixes with live agents) |
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
animus --help | --version
```

## Development

```sh
node --test "test/**/*.test.ts"                       # all tests
node scripts/preview-theme.ts src/themes/lab.ts       # eyeball a preset's art
ANIMUS_THEME_FILE=src/themes/x.ts node --test test/themes.test.ts   # lint a new preset
```

Layout: `src/claude` (read-only connector), `src/demo` (simulated crew),
`src/world` (characters, stage simulation, world composition), `src/themes`
(presets), `src/ui` (header, roster, ticker, overlays), `src/term` (cell
screen, diffing ANSI renderer, terminal handling).

### Adding a preset

Create `src/themes/<id>.ts` exporting a `Theme` (see `src/themes/types.ts`,
and `src/themes/lab.ts` as the reference): a palette, seven stations
(write, read, search, run, web, think, idle) plus an entrance, each with idle
and active animation frames (max 11×6 cells, width-1 glyphs only), and
`drawBackdrop` / `drawAmbient` functions that animate from the time `t`.
Register it in `src/themes/index.ts`.
