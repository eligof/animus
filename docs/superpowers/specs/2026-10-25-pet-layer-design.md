# The pet layer: design

## Goal

Make each agent a little creature you look after, Tamagotchi-style, built
on what the agent is really doing: needs meters from its real state, a
floating card beside the selected character, a chat window to read its
conversation and send it a message, and growth over weeks per project.
Everything stays local; the only thing animus ever sends is a message you
type, to the session you picked.

Out of scope here (separate designs): game-inspired worlds, office props,
broader chrome clean-up.

## 1. Meters (real data, pet-styled)

Per agent, computed from its transcript as the Claude source already tails
it:

| meter | pet meaning | source |
|---|---|---|
| context | how full | context used / context window: input + cache-read + cache-creation tokens of the latest assistant reply, over the model's window (200k; 1M when the session asked for a 1M model, i.e. `requestedModel` ends in `[1m]`, or any reply already exceeded 200k) |
| energy | how tired | the current working streak: full after 2 min idle, empty after 45 min of work without a 2 min idle gap; refills while idle |
| health | hurt | failures in the last 10 min (API errors, tool results with `is_error`), each costing a share that heals over time |
| mood | happy / grumpy | consecutive tool calls without an error, plus a boost when a turn finishes |
| level | growth | crew XP (section 4) |

Plain facts alongside: model, the session's AI title, git branch, time on
task, output tokens, live subagents. No dollar cost (prices change; a wrong
number is worse than none).

Each meter is 0..1 with a `critical` flag (context ≥ 0.9, energy ≤ 0.15,
health ≤ 0.3). The character shows its state in the scene: drowsy eyes when
energy is low, a bandage when health is low, a bigger bounce when mood is
high.

## 2. The floating card

- Selecting an agent (Tab / shift-Tab, or from the roster) opens its card
  beside the character; Esc closes it; `i` toggles the card while keeping
  the selection and camera follow.
- The card follows the character and flips sides near the scene edge so it
  never covers it. Below about 60 x 14 scene cells it docks in a corner.
- Drawn as terminal text over the scene (like labels): crisp at any zoom,
  no image cost. A rounded frame in the world's palette, about 42 x 9 cells:

```
╭─ ★3 nova · lead ─────────────── 4m12s ─╮
│ ✎ Edit src/parser.ts                    │
│ "Fix the tokenizer edge case"  main     │
│ 🍙 context  ████████░░ 78%               │
│ ⚡ energy █████░░░░░ 52%               │
│ ❤ health ██████████ ok   ☺ mood ▲ 12  │
│ opus 5.5 · 182k tok out · 3 subagents  │
╰─ [⏎]talk  [c]heer  [Tab] next  [Esc] ──╯
```

- Bars colour green / amber / red by level and pulse gently when critical.
- Enter opens the chat (section 3; `t` stays the theme key); `c` cheers: the character's cheer pose
  with hearts, cosmetic only, nothing sent.

## 3. Talking

Enter grows the card into a chat window beside the character; the room keeps
playing. Esc returns to the card.

Reading (always available):
- Bubbles from the transcript: the agent's text replies, your prompts, and
  tool steps as one-line rows (`▶ $ npm test ✓`, `✎ Edit parser.ts`).
  Thinking shows as "thinking…" only, never its content.
- Newest at the bottom; Up/Down scroll; long replies fold after 6 lines
  (Enter on a folded bubble expands it).

Sending (live sessions):
- An input line at the bottom; Enter sends. While the input has focus,
  every key goes to it (`q` types q; it does not quit).
- Delivery uses Claude Code's cross-session messaging: find the live
  session whose `sessionId` matches the transcript in
  `~/.claude/sessions/<pid>.json` (PID alive), take its
  `messagingSocketPath` (strip a `uds:` prefix), connect to that Unix
  socket and post the message. Never read the `<pid>.key` files or any
  token. The message framing is pinned by a spike on a throwaway session
  (build step 0) before this is built.
- The agent's terminal shows `› Message from @animus: …`; Claude sees it as
  a message from another session, not as user input: it cannot approve a
  permission prompt or run a slash command. A session in bypass mode holds
  it until approved in that terminal.
- Each sent message shows its outcome: ✓ delivered, ⏳ held for approval,
  ✗ not sent (session ended, messaging off, refused, timed out after 5 s).
- A session that cannot receive (no registry entry or socket) disables the
  input with the reason and offers to copy the text to the clipboard (OSC
  52) instead.
- Rejected alternatives: keystroke injection into the agent's terminal
  (tmux / tty) can approve permission prompts; `claude --resume -p` forks a
  separate run (or is refused) for a foreground session.

## 4. Growth (per project, cosmetic)

- A crew per project (git repo root, else the working directory). Agents
  are kept by role and type, not by session: the lead, and each subagent
  type (`Explore`, `code-reviewer`, ...).
- XP: +10 per finished turn, +5 per successful build or test command, +3
  per finished subagent; errors cost nothing. Levels at 100, 250, 500, 1000,
  then doubling. A level-up bursts confetti in the world's colours and pops
  a `★N!` mark.
- Unlocks (cosmetic, in every world's style): ★2 a hat from the world's
  costume set, ★3 a shirt badge, ★5 a desk upgrade at its favourite station
  (plant, steaming mug, trophy), ★8 an outfit colour swap, ★10 a soft aura.
- Saved in `$XDG_CONFIG_HOME/animus/crews.json` (default
  `~/.config/animus/`), keyed by a hash of the project path: XP per role
  and the last-seen date only, nothing from transcripts. Writes are
  debounced; a corrupt file is moved aside and a fresh one started.
  `--demo` uses a throwaway crew.

## Architecture

New units, each testable alone:
- `src/claude/vitals.ts`: the transcript reader keeps the card's facts
  (model, window, context used, output tokens, recent errors, tool streak,
  working-since, title, branch, cwd). `AgentInfo` gains an optional
  `vitals`; the demo source synthesises believable ones.
- `src/pet/meters.ts`: pure; vitals + now → meters with critical flags.
- `src/pet/crew.ts`: pure XP / level / unlock logic, plus load and save of
  `crews.json`.
- `src/claude/chat.ts`: an agent's conversation as bubbles from its
  transcript tail.
- `src/claude/inbox.ts`: send to a session: registry lookup, socket post,
  outcome; asynchronous with a 5 s timeout, never blocking the frame loop.
- `src/ui/card.ts`, `src/ui/chat.ts`: draw the card and the chat window as
  text over the scene; the chat owns its input line state.

Changed:
- `World`: card / chat state and key routing (input focus captures keys).
- Figure rig (`src/art/figure/*`): face states (drowsy, bandaged, happy)
  and cosmetics (hat, badge, outfit swap, aura) as part of the sprite key.
- Stage: the level-up burst, desk upgrades at a station.

## Testing

- Vitals from small synthetic transcript lines (context maths, window
  detection, errors, streaks, title, branch).
- Meter maths and critical flags.
- Crew: XP, levels, unlocks; save / load / corrupt file in a temp dir.
- Inbox against a fake Unix socket server in the test (framing from the
  spike); outcomes and the timeout.
- Card and chat as screen-text snapshots; the card's placement near edges.
- Key routing: typing in the chat never triggers app keys.
- Cosmetics and face states drawn for every world (figure tests).
- A real Ghostty screenshot check at the end.

## Build order

0. Spike: the inbox socket's message framing, on a throwaway session.
1. Vitals, meters, card.
2. Chat reading.
3. Chat sending.
4. Crew XP, face states, cosmetics (per-world cosmetic art can fan out).

## Privacy

Transcripts are read locally and shown locally; nothing from them leaves
the machine. Animus sends only text the user typed, only to the session the
user picked. No credential files are read. README and screenshots use the
demo crew.
