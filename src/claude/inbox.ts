import { lstatSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, isAbsolute } from 'node:path';
import { ours } from '../agents.ts';
import type { Bubble, SendResult } from '../agents.ts';
import { SENDER } from './chat.ts';
import { listSessions, pidAlive } from './sessions.ts';
import type { LiveSession } from './sessions.ts';

// Posting the user's message into an agent's live session, through Claude
// Code's cross-session messaging (docs/superpowers/specs/2026-10-25-inbox-
// protocol.md): find the session's inbox socket in its registry entry,
// write one framed line to it, and follow the message until the session's
// transcript shows it. Only the text the user typed is sent, only to the
// session they picked. No token or `<pid>.key` file is ever read.

// A send that has not settled by then has failed (a session that takes
// the message closes the connection at once).
export const SEND_TIMEOUT_MS = 5000;
// Characters in one message at most: the chat reads a message of up to
// 20,000 UTF-16 units whole (chat.ts), which this many characters always
// fit, and only a message read whole can be seen delivered.
export const MAX_SEND = 4000;
// The wrapper's closing tag, as a receiver matching it in any case would.
// Tag characters (U+E0000-E007F) hide text from the reader; only a subdivision
// flag's (black flag, 2-7 letters or digits, cancel tag) may be sent.
const TAGS = /[\u{e0000}-\u{e007f}]/u;
const FLAG = /\u{1f3f4}[\u{e0030}-\u{e0039}\u{e0061}-\u{e007a}]{2,7}\u{e007f}/gu;
export const hiddenTags = (text: string): boolean => TAGS.test(text.replace(FLAG, ''));
const CLOSE_TAG = /<\/cross-session-message/i;

// Where a session takes messages, or why it does not.
export type Inbox = { ok: true; socket: string } | { ok: false; reason: string };

// A registry entry's inbox (undefined: no live session by that id). The
// registry names any path its writers like, and whatever listens there
// gets the user's text, so before anything is sent the entry must be the
// file Claude Code writes for its pid, and its inbox a Unix socket (not a
// link to one) at an absolute path, owned by `uid` (this process's user)
// and open to no one else, as Claude Code makes it (mode 600).
export function inboxOf(s: LiveSession | undefined, uid: number | undefined = process.getuid?.()): Inbox {
  if (!s) return { ok: false, reason: 'no live session' };
  if (s.refusal) return { ok: false, reason: s.refusal };
  if (s.peerProtocol < 1) return { ok: false, reason: 'its Claude Code takes no messages' };
  if (!s.socket) return { ok: false, reason: 'messaging is off in its session' };
  if (s.file !== `${s.pid}.json`) return { ok: false, reason: 'its registry entry is not named for its pid' };
  const why = unsafe(s.socket, uid);
  return why ? { ok: false, reason: why } : { ok: true, socket: s.socket };
}

// Why the inbox at `path` is not one to send to (null: it is). Reasons
// name no part of the path: they are shown as they are.
function unsafe(path: string, uid: number | undefined): string | null {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(path);
  if (scheme) return `its inbox is not a Unix socket (${scheme[1]}:)`;
  if (!isAbsolute(path)) return 'its inbox is not an absolute path';
  let st;
  try {
    st = lstatSync(path);
  } catch (e) {
    return `its inbox is not there (${(e as NodeJS.ErrnoException).code ?? 'error'})`;
  }
  if (st.isSymbolicLink()) return 'its inbox is a symlink';
  if (!st.isSocket()) return 'its inbox is not a socket';
  if (uid !== undefined && st.uid !== uid) return 'its inbox is not yours';
  if ((st.mode & 0o077) !== 0) return 'its inbox is open to other users';
  return roomOf(dirname(path), uid);
}

// Why the directory holding an inbox is not one to trust (null: it is).
// Where others can add or remove entries, one of them could swap the
// socket for their own between the checks and the connection. Claude Code
// keeps its sockets in a private directory ($XDG_RUNTIME_DIR/cc-socks, or
// /tmp/cc-socks-<uid>: mode 700); a sticky directory (like /tmp) is safe
// too, as others cannot remove or rename what is ours there.
function roomOf(dir: string, uid: number | undefined): string | null {
  let st;
  try {
    st = lstatSync(dir);
  } catch (e) {
    return `its inbox directory is not there (${(e as NodeJS.ErrnoException).code ?? 'error'})`;
  }
  if (uid !== undefined && st.uid !== uid && st.uid !== 0) return 'its inbox directory is not yours';
  if ((st.mode & 0o022) !== 0 && (st.mode & 0o1000) === 0) return 'its inbox directory can be changed by other users';
  return null;
}

// A session's registry entry and its inbox.
export type Entry = { session: LiveSession; inbox: Inbox };

// One entry per session id in `list` (in the order the ids first appear).
// Several can name one session (a restarted process's stale file, or one
// planted to draw its messages): one whose inbox can be sent to wins, then
// the newest. Display, reach and send all go by this choice.
export function entries(list: readonly LiveSession[]): Entry[] {
  const best = new Map<string, Entry>();
  for (const session of list) {
    const e = { session, inbox: inboxOf(session) };
    const b = best.get(session.sessionId);
    if (!b || (e.inbox.ok && !b.inbox.ok) || (e.inbox.ok === b.inbox.ok && session.updatedAt > b.session.updatedAt)) best.set(session.sessionId, e);
  }
  return [...best.values()];
}

// The inbox of the live session `sessionId`, looked up afresh in the
// registry (its process must be running).
export function findInbox(root: string, sessionId: string, alive: (pid: number, procStart?: string) => boolean = pidAlive): Inbox {
  const list = listSessions(root, alive).filter((s) => s.sessionId === sessionId);
  return entries(list)[0]?.inbox ?? inboxOf(undefined);
}

// The one line that posts `text` into session `sessionId`: a user message
// whose content names animus in the cross-session wrapper, at the default
// priority, with the session id the receiver checks against its own (a
// mismatch, as after a pid or socket was recycled, is dropped). Null for
// text holding the wrapper's closing tag: the receiver could not tell it
// from the wrapper, and unwrapped it would arrive with no name, so animus
// could neither show it as yours nor see it delivered.
export function frame(sessionId: string, text: string): string | null {
  if (CLOSE_TAG.test(text) || hiddenTags(text)) return null;
  const content = `<cross-session-message from-name="${SENDER}">\n${text}\n</cross-session-message>`;
  return `${JSON.stringify({ type: 'user', message: { role: 'user', content }, priority: 'next', session_id: sessionId })}\n`;
}

// Writes `line` to the Unix socket at `path` and ends the connection. The
// socket never answers: a clean close is all a sender learns (delivered
// and dropped look the same; see followUp for what comes next). A line
// written in full is with the receiver whatever happens after (no close by
// the time out, a reset): sent, for the transcript to confirm. Only one
// that was not is not sent, and so worth sending again.
export function post(path: string, line: string, timeoutMs = SEND_TIMEOUT_MS): Promise<SendResult> {
  return new Promise((resolve) => {
    let connected = false;
    let written = false;
    let settled = false;
    const sock = connect({ path });
    const done = (r: SendResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(r);
    };
    const timer = setTimeout(() => done(written ? { ok: true } : { ok: false, reason: 'timed out' }), timeoutMs);
    // A send under way never holds up quitting: the process does not sit
    // out the time out for a receiver that has yet to close.
    timer.unref();
    sock.unref();
    // Anything it says is read and dropped, so its end is seen.
    sock.on('data', () => {});
    sock.on('connect', () => {
      connected = true;
      sock.end(line, (e?: Error | null) => {
        if (!e) written = true;
      });
    });
    sock.on('error', (e: NodeJS.ErrnoException) => done(written ? { ok: true } : { ok: false, reason: `${connected ? 'connection lost' : "can't connect"} (${e.code ?? 'error'})` }));
    sock.on('close', (hadError) => {
      if (!hadError) done(connected ? { ok: true } : { ok: false, reason: "can't connect" });
    });
  });
}

// Sends the user's `text` to the live session `sessionId`: framed, to the
// inbox its registry entry names right now.
export function sendTo(root: string, sessionId: string, text: string, o: { alive?: (pid: number, procStart?: string) => boolean; timeoutMs?: number } = {}): Promise<SendResult> {
  const n = [...text].length;
  if (n > MAX_SEND) return Promise.resolve({ ok: false, reason: `too long: ${n} characters, at most ${MAX_SEND}` });
  if (hiddenTags(text)) return Promise.resolve({ ok: false, reason: 'the text holds hidden tag characters' });
  const line = frame(sessionId, text);
  if (!line) return Promise.resolve({ ok: false, reason: 'the text holds </cross-session-message' });
  const box = findInbox(root, sessionId, o.alive);
  if (!box.ok) return Promise.resolve({ ok: false, reason: box.reason });
  return post(box.socket, line, o.timeoutMs);
}

// A message the user sent (or copied) from the chat window, followed until
// its target's transcript shows it:
//   sending    the send is under way
//   waiting    written to the inbox, not in the transcript yet
//   delivered  the transcript shows it (`bubble`)
//   unseen     still not there SEEN_WITHIN_MS after sending (held for
//              approval in that terminal, or dropped)
//   failed     not sent (`reason`), as far as the send could tell: it is
//              delivered still if the transcript shows it
//   copied     the agent takes no messages (`reason`): the text went to
//              the clipboard instead
export type Outgoing = {
  id: string;
  text: string;
  at: number; // when it was sent
  status: 'sending' | 'waiting' | 'delivered' | 'unseen' | 'failed' | 'copied';
  reason: string;
  result?: SendResult; // the send's outcome once it settles, for followUp to take up
  bubble?: string; // delivered: the transcript entry that shows it
};

export const SEEN_WITHIN_MS = 60_000;
// The transcript's clock may run a little behind the moment of sending.
const CLOCK_SLACK_MS = 5000;

// Moves a message along: its settled send's outcome first, then the first
// of its target's 'sent' entries with its text, from about when it was
// sent, that no other message claimed (`claimed` collects them) and that
// came from this process (`self`) when its receiver says who sent it.
// Called on every tick, so the frame loop never waits on a send.
export function followUp(o: Outgoing, log: readonly Bubble[] | null, claimed: Set<string>, now: number, self = process.pid): void {
  if (o.status === 'sending' && o.result) {
    if (!o.result.ok) {
      o.status = 'failed';
      o.reason = o.result.reason;
      return;
    }
    o.status = 'waiting';
  }
  if (o.status === 'copied' || o.status === 'delivered') return;
  const text = o.text.trim();
  const hit = log?.find((b) => b.kind === 'sent' && ours(b, self) && !claimed.has(b.id) && b.text.trim() === text && b.at >= o.at - CLOCK_SLACK_MS);
  if (hit) {
    o.status = 'delivered';
    o.bubble = hit.id;
    claimed.add(hit.id);
  } else if (o.status === 'waiting' && now - o.at >= SEEN_WITHIN_MS) o.status = 'unseen';
}

// Moves along all the messages `sent` to one agent whose conversation is
// `log`. Failed ones go last: one sent again after a failure takes its own
// entry, and the failed one only an entry left over.
export function followAll(sent: readonly Outgoing[], log: readonly Bubble[] | null, now: number, self = process.pid): void {
  const claimed = new Set(sent.flatMap((o) => (o.bubble ? [o.bubble] : [])));
  for (const o of sent) if (o.status !== 'failed') followUp(o, log, claimed, now, self);
  for (const o of sent) if (o.status === 'failed') followUp(o, log, claimed, now, self);
}
