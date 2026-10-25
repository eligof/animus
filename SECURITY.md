# Security policy

## What animus touches

- Reads, never writes, Claude Code's local state under `~/.claude`
  (session registry, transcripts, subagent metadata) and the display name /
  plan label from `~/.claude.json`. Tokens and other account fields are not
  read out of that file.
- Writes only its own files: `~/.config/animus/config.json` (preferences)
  and `~/.config/animus/crews.json` (crew growth: a hash of each project's
  path, and XP and a last-earned time per role; mode 0600).
- Makes no network connections and has no runtime dependencies. Its one
  outgoing message is a chat message you type and send to a session you
  picked: it goes over that session's local Unix socket (Claude Code's
  cross-session messaging), and only after checking the session's registry
  entry is your own file and the socket is a real socket that only you can
  open, in a directory others cannot change. It never reads the session
  `<pid>.key` files or any token.
- Text coming from transcripts is sanitized before it is drawn (control
  characters, escape sequences, bidi/zero-width marks removed), so a
  transcript cannot drive your terminal.

## Reporting a vulnerability

Please report suspected vulnerabilities privately to the repository owner
(open an issue only for non-sensitive problems). Include steps to reproduce
and the version (`animus --version`). You will get an acknowledgement within
a week.

## Automated checks

Every pull request runs: tests on Linux and macOS, a TypeScript type check,
workflow linting, CodeQL (security-extended queries; any finding fails the
build) and a gitleaks secret scan over the full history. Dependabot watches
GitHub Actions versions, and all actions are pinned to commit SHAs.
