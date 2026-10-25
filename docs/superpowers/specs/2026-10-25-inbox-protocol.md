# Posting into a Claude Code session: the inbox protocol (as observed)

Part 2 of the pet layer (talking to an agent) posts the user's message into
the agent's live session through Claude Code's cross-session messaging.
The socket and its 30 s first-line deadline are documented
(https://code.claude.com/docs/en/cross-session-messaging.md); the message
framing is not. This note records what a spike on Claude Code v2.1.302
(Linux) established: by reading the installed client's source, then live
against one throwaway headless session (`claude -p --input-format
stream-json --output-format stream-json`, no tools, haiku). Nothing here
reads or needs a token or the `<pid>.key` files.

## Finding the target

- The registry `~/.claude/sessions/<pid>.json` (written ~0.5 s after a
  session starts) has `sessionId`, `pid`, `cwd`, `status`,
  `messagingSocketPath` (a plain path, e.g.
  `/run/user/1000/cc-socks/<pid>.sock`, mode 600), `peerProtocol` (1) and
  `peerFeatures`.
- A transcript's file name is its session id: match it to the registry's
  `sessionId`, check the pid is alive, use `messagingSocketPath`. A session
  is messageable when `peerProtocol >= 1` and the path is non-empty.
- Never open `<pid>.key` (it is a credential) or `~/.claude.json`.

## The frame

Connect to the Unix socket and write one JSON line ending in `\n`, then
end the connection. No auth line is needed on Linux (it is only checked
on Windows; its tokens are not ours to have).

```json
{"type":"user","message":{"role":"user","content":"<cross-session-message from-name=\"animus\">\nhello\n</cross-session-message>"},"priority":"next","session_id":"<target sessionId>"}
```

- `content` carries the sender's name in a `<cross-session-message ...>`
  wrapper; the receiver accepts the wrapper only if rebuilding it from its
  parsed attributes gives the same string (send just `from-name`; the name
  must not contain `"`, `<`, `>` or newlines; at most 64 chars). Text
  containing `</cross-session-message` must not be sent wrapped.
- `session_id`: always send it. A mismatch is dropped silently (guards a
  recycled pid or socket).
- `priority`: `next` (default), `now` or `later`.
- Never claim `from-mode="bypass"`.

## Outcomes

- The socket never answers: delivered and dropped look the same to the
  sender (zero bytes, clean close). A successful write is not a delivery.
- Delivered: the receiver queues the message as a prompt (slash commands
  and attachments off) and starts a turn. Its transcript gains a
  `queue-operation` enqueue/dequeue and then a record with `type: "user"`,
  `isMeta: true`, `turnOrigin: "peer"`, `promptSource: "system"` and
  `origin: { kind: "peer", from: "unknown", verifiedPeerPid, name:
  "animus", body: "<text>" }` (no `name`/`body` without the wrapper);
  `message.content` is a string that begins "Another Claude session sent a
  message:" and includes the wrapper verbatim. So animus confirms delivery
  by watching the target's transcript for that record, and shows its own
  messages by `origin.kind === "peer" && origin.name === "animus"`.
- Held (a receiver in bypass mode holds messages from non-bypassing
  senders for the user's approval, expiring after 5 min) and refused /
  dropped messages produce receipts only to a listening socket of the
  sender's (`{"type":"control","action":"peer_message_status",...}`),
  which animus does not open in part 2; it reports "sent, waiting" until
  the transcript shows the message, and "not seen" after a timeout.
