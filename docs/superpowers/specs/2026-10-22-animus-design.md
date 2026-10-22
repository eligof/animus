# Animus — animated terminal stage for Claude agents

Date: 2026-10-22
Status: approved (autonomous /goal session — user asked for no pauses)

## Purpose

`animus` is a terminal (CLI) app that shows the Claude Code agents running on
this machine as small animated characters working inside a themed 2D scene.
Every session and every subagent gets its own procedurally generated
character. What a character does on screen mirrors what the agent is doing
right now (reading files, editing code, running shell commands, searching,
browsing, thinking, delegating, finished, idle).

The user picks a scene preset: Lab, Underground Club, Hacker's Den, Orbital
Station, Cozy Café. Everything moves: characters, stations, background
ambience, header, transitions.

Success criteria:

1. `animus` run in a terminal shows live Claude Code sessions and subagents
   from `~/.claude` as characters, updating within ~1 s of transcript writes.
2. `animus --demo` shows a convincing simulated crew without any live data.
3. Five themes, switchable at runtime (`t`, `1`–`5`, picker overlay), each
   with its own palette, background art, stations and ambient animation.
4. Each agent's character is deterministic for its id and visually distinct.
5. Steady 15–20 fps with low CPU (diff rendering, polling ≤ 1 Hz on disk).
6. Terminal always restored on exit, crash, or signal.
7. Zero runtime dependencies; `node --test` suite green.

## Approach

Chosen: **Node 26 + native TypeScript type stripping, zero dependencies**,
custom double-buffered truecolor cell renderer.

Rejected:
- Python + curses: truecolor and per-cell RGB are awkward; fewer good
  primitives for diff rendering.
- Ink / blessed / terminal-kit: need npm, which is not installed here, and
  give less control over per-frame animation.

Constraint from type stripping: erasable TypeScript only (no `enum`, no
parameter properties, no namespaces); imports use `.ts` extensions.

## "Connecting the Claude account"

Claude Code already records everything locally. Animus reads it, read-only:

| Source | Gives |
| --- | --- |
| `~/.claude/sessions/<pid>.json` | live sessions: `pid`, `sessionId`, `cwd`, `name`, `status` (`busy`/`idle`), `updatedAt`, `kind` |
| `~/.claude/projects/<slug>/<sessionId>.jsonl` | session transcript (assistant `tool_use` blocks, `thinking`, `text`, `stop_reason`, user `tool_result`) |
| `~/.claude/projects/<slug>/<sessionId>/subagents/agent-<id>.jsonl` | subagent transcript |
| `…/subagents/agent-<id>.meta.json` | `agentType`, `description`, `model` |
| `~/.claude.json` → `oauthAccount` | `displayName`, `seatTier`/`billingType` for the header only |

Rules:
- Root dir = `--claude-dir` flag, else `$CLAUDE_CONFIG_DIR`, else `~/.claude`.
  `~/.claude.json` is looked up in the home dir (`dirname(root)/.claude.json`).
- Never read or show tokens/credentials. Only `displayName` (and a plan
  label) from `oauthAccount`.
- A session is live if its pid answers `process.kill(pid, 0)`.
- Transcript location: scan `projects/*/` for `<sessionId>.jsonl` (cache the
  hit); do not re-derive the slug.
- Transcripts are tailed incrementally by byte offset, keeping a partial-line
  buffer. First read of a large file only parses the last 256 KB.
- Subagents shown: those of live sessions whose transcript changed in the
  last 10 minutes.

### Activity model

Each agent has one current `Activity`:

| Activity | Triggered by |
| --- | --- |
| `write` | `Edit`, `Write`, `MultiEdit`, `NotebookEdit` |
| `read` | `Read`, `NotebookRead`, `ReadMcpResource…`, `ListMcpResources…` |
| `search` | `Grep`, `Glob`, `LS`, `ToolSearch` |
| `run` | `Bash`, `BashOutput`, `KillShell`, `Monitor`, `PowerShell`; unknown tools |
| `web` | `WebFetch`, `WebSearch`, any `mcp__*` tool |
| `delegate` | `Agent`, `Task`, `Workflow`, `SendMessage`, `Skill` |
| `think` | latest block is `thinking`, or session `busy` with no newer tool |
| `talk` | latest block is assistant `text` (and turn not ended) |
| `done` | subagent: last assistant message `stop_reason: end_turn`, no pending tool, file quiet ≥ 5 s |
| `idle` | session status `idle`, or no transcript activity ≥ 60 s |
| `error` | latest `tool_result` has `is_error: true` (shown ~3 s, then reverts to `think`) |

Each activity change carries a short human detail: `Edit cli.ts`,
`$ git status`, `Grep "TODO"`, `WebSearch terminal sprites`, `→ code-reviewer`.
Unknown tools map to `run` with the tool name as detail.

### Agent snapshot (source → UI contract)

```ts
type AgentInfo = {
  id: string;            // sessionId or agentId
  name: string;          // session name / subagent description, ≤ 18 chars
  role: 'lead' | 'sub';  // session vs subagent
  parentId?: string;
  project: string;       // basename(cwd)
  agentType?: string;    // subagent type from meta.json
  activity: Activity;
  detail: string;
  since: number;         // ms epoch of activity start
  lastSeen: number;      // ms epoch of last transcript change
};
```

Two sources implement `AgentSource { poll(now): AgentInfo[]; drainEvents(): AgentEvent[] }`
where `AgentEvent = { at, agentId, name, activity, detail }`:
`ClaudeSource` (live) and `DemoSource` (scripted random crew: 2 leads that
spawn/finish subagents, cycling activities with plausible details). `--demo`
uses demo only. With no live agents, the footer offers `d` to toggle demo.

## Visual design

### Rendering

- `Screen`: width × height cell grid; cell = char + fg RGB + bg RGB + bold.
  Width-1 glyphs only (block elements, box drawing, ASCII, a few math
  symbols; no emoji).
- `Renderer`: diffs previous vs current frame, emits minimal ANSI (cursor
  jumps only on gaps, SGR only on color change). Truecolor when
  `COLORTERM` is `truecolor`/`24bit`, else xterm-256 approximation.
- Terminal: alt screen, hidden cursor, raw stdin, resize → full redraw.
  Restore on `exit`, `SIGINT`, `SIGTERM`, `uncaughtException`.
- Loop: 18 fps default (`--fps`), `dt`-based simulation.

### Layout

```
┌ header: ANIMUS ▸ theme name · ◉ Ada · 3 working 1 idle · 17:42 ┐
│                                                   │ roster      │
│                 scene (stage)                     │ (≥100 cols) │
│                                                   │             │
├ footer: event ticker · key hints ─────────────────┴─────────────┘
```

Under 100 columns the roster is hidden (selected agent shown in footer).
Minimum supported size 60×20; smaller shows a "make me bigger" card.

### Characters

Sprite: 5 columns × 4 rows, built from a seed = hash(agent id).

```
 ▄█▄    row 0  hair/hat   (style × color)
 •ᴗ•    row 1  face       (skin as bg, eye/mouth glyphs; side cells: ears/headphones/long hair)
╱███╲   row 2  arms+torso (skin arms, shirt color + pattern)
 ▌ ▐    row 3  legs       (pants color, walk frames)
```

Traits from seed: species (human, robot, cat, alien, ghost), skin, hair
style, hair color, shirt color & pattern, pants. Accessory from role:
lead → headset; subagent type keyword → `review` glasses, `explore`/`search`
miner lamp, `plan`/`architect` beret, `test` goggles, `security` hood; else
seeded. Name tag (agent color) above the head; a speech bubble shows the
detail for 3 s after each activity change and permanently for the selected
agent.

Poses (frames chosen by activity + time):
`idle` blink/look around · `walk` alternating legs, arm swing · `write`
fast typing arms + key sparks · `read` holding book, eyes scanning · `think`
hand on chin + animated thought bubble · `run` working a machine + sparks ·
`search` peering, eyes sweeping, `?` · `web` signal waves `≋` · `delegate`
pointing/waving · `talk` mouth moving + `…` bubble · `done` jumping with arms
up + confetti · `error` red `!` and shake · long idle → sleeping `z Z`.

### Scene simulation

- Theme supplies stations (`write`, `read`, `search`, `run`, `web`, `think`,
  `idle`, plus an entrance). Stations are laid out left→right on the floor
  line; each has slots so several agents can share it (slots spread across
  the station width and in front of it).
- `delegate` and `talk` use the `think` station; `error` stays in place;
  `done` stays in place (celebrating).
- An actor whose activity changes picks the least-crowded matching station
  and walks there (≈ 14 cells/s), then plays the activity pose.
- New agent → appears at the entrance with a spawn effect. `done`
  subagent → celebrates 4 s, walks to the entrance, despawns. Gone sessions
  → walk out.
- Stations animate on their own and "light up" while used.

### Themes

| id | name | palette / ambience | stations (write · read · search · run · web · think · idle) |
| --- | --- | --- | --- |
| `lab` | Mad Science Lab | white tiles, teal glass; rising bubbles, blinking panel LEDs | workbench PC · bookshelf · microscope · tesla coil · radio mast · chalkboard · coffee machine |
| `club` | Underground Club | deep purple, neon pink/cyan; sweeping light beams, EQ bars, pulsing floor | DJ decks · VIP booth · vinyl crates · light console · phone booth · dance floor · bar |
| `den` | Hacker's Den | black + phosphor green; matrix rain wall, CRT flicker | triple-CRT rig · manual stacks · radar scope · server rack · satellite dish · conspiracy board · beanbag + pizza |
| `station` | Orbital Station | navy + amber; parallax stars, rotating planet in viewport | nav console · data archive · scanner · reactor · comms array · holo-table · sleep pod |
| `cafe` | Cozy Café | warm browns, cream; rain on window, steam, swaying plants | laptop table · bookcase nook · newspaper rack · espresso machine · phone corner · window seat · sofa |

Theme contract:

```ts
type Theme = {
  id: string; name: string; tagline: string;
  palette: Palette;                        // named RGB roles for UI + scene
  drawBackdrop(s: Screen, r: Rect, t: number): void;   // wall, floor, decor
  drawAmbient(s: Screen, r: Rect, t: number): void;    // foreground fx
  stations: StationDef[];                  // one per StationKind
  entrance: StationDef;
};
```

Station art is written as string rows plus a parallel color-key map
(`'a'` → color) so themes stay data-like. Art may have several frames and an
`active` frame set used while an agent works there.

### Controls

| key | action |
| --- | --- |
| `t` / `T` | next / previous theme |
| `1`–`5` | jump to theme |
| `p` | theme picker overlay (live preview) |
| `tab` / `shift-tab` / `←` `→` | select agent |
| `esc` | clear selection / close overlay |
| `d` | toggle demo crew |
| `space` | pause animation |
| `?` | help overlay |
| `q` / `ctrl-c` | quit |

Last chosen theme persists to `$XDG_CONFIG_HOME/animus/config.json`
(`~/.config/animus/config.json`).

### CLI

```
animus [--theme <id>] [--demo] [--fps <n>] [--claude-dir <path>]
animus --list-themes
animus --snapshot [--theme <id>] [--demo] [--width 120] [--height 36] [--at <seconds>]
animus --help | --version
```

`--snapshot` renders one frame (ANSI) to stdout without touching the TTY,
used for tests, previews and docs. Non-TTY stdout without `--snapshot`
prints a hint and exits 1.

## Module map

```
bin/animus.js            shebang launcher → src/cli.ts
src/cli.ts               arg parsing, mode dispatch
src/app.ts               main loop, input, overlays, config persistence
src/term/color.ts        RGB helpers, lerp, 256-color fallback
src/term/screen.ts       cell buffer + drawing primitives
src/term/renderer.ts     frame diff → ANSI
src/term/terminal.ts     alt screen, raw mode, resize, restore
src/claude/paths.ts      claude dir resolution
src/claude/activity.ts   tool → activity + detail
src/claude/transcript.ts incremental JSONL tail + record → state
src/claude/sessions.ts   live session registry
src/claude/account.ts    display name / plan (no secrets)
src/claude/source.ts     ClaudeSource
src/demo/source.ts       DemoSource
src/world/rng.ts         seeded PRNG + string hash
src/world/character.ts   traits + sprite frames per pose
src/world/stage.ts       actors, stations, walking, effects
src/themes/types.ts      Theme, StationDef, Palette
src/themes/art.ts        art parsing/drawing helpers
src/themes/{lab,club,den,station,cafe}.ts
src/themes/index.ts      registry
src/ui/layout.ts         rects for header/scene/roster/footer
src/ui/chrome.ts         header, roster, footer
src/ui/overlays.ts       help, theme picker, size card
test/*.test.ts           node:test suites
```

## Error handling

- Connector never throws into the loop: malformed JSON lines skipped,
  missing dirs → empty list, unreadable files skipped; footer shows
  `no live claude agents in <dir> — press d for demo` when nothing is found.
- Terminal restored on every exit path; crash prints the error after
  restore.
- Tiny terminal → size card instead of broken layout.

## Testing

`node --test` (built-in runner, TS via type stripping):

- activity mapping table (each tool → activity/detail).
- transcript tailer: incremental reads, partial lines, malformed lines,
  `done`/`error` detection, fixtures based on real record shapes.
- sessions registry: dead pid filtered, missing dir.
- character: deterministic per id, distinct across ids, all sprite frames
  are 5×4 width-1 glyphs.
- screen/renderer: put/text clipping, diff emits nothing for identical
  frames, emits only changed cells.
- themes: every theme defines all station kinds, art rows have consistent
  widths, color keys resolve, backdrop/ambient draw without throwing at
  several sizes and times.
- stage: actor walks to matching station, spawn/despawn lifecycle.
- end-to-end: `--snapshot` for each theme with `--demo` exits 0 and output
  contains the theme name.
