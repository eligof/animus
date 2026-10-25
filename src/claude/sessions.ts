import { closeSync, constants, fstatSync, openSync, readdirSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';

export type LiveSession = {
  pid: number;
  file: string; // its registry file's name (Claude Code writes <pid>.json)
  sessionId: string;
  cwd: string;
  name: string;
  status: string;
  updatedAt: number;
  kind: string;
  // Where it takes cross-session messages: its inbox socket ('' when
  // messaging is off) and the protocol it speaks (0: none).
  socket: string;
  peerProtocol: number;
  // Why its messaging is not to be trusted, when its entry is not the
  // user's own: its socket and protocol are then dropped.
  refusal?: string;
};

// `procStart` is the process start time Claude Code records (field 22 of
// /proc/<pid>/stat); on Linux it tells a reused pid from the original process.
export function pidAlive(pid: number, procStart?: string): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    // ESRCH: gone. EPERM: the pid now belongs to another user, so the
    // Claude session that registered it is gone too.
    return false;
  }
  if (procStart && process.platform === 'linux') {
    try {
      const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
      return stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19] === procStart;
    } catch {
      return true; // cannot verify: trust kill()
    }
  }
  return true;
}

// A registry entry is a small JSON file. Anything else under that name (a
// FIFO, which would block the read; a link, say to /dev/zero, which would
// never end; a huge file) is never read: opened without following links or
// waiting for a writer, and read only as a regular file of at most this.
const MAX_ENTRY = 64 * 1024;
// One byte more than allowed tells a file that grew past it. Reused by
// every read (they are synchronous), so a scan fills no fresh 64 KB a file.
const entryBuf = Buffer.allocUnsafe(MAX_ENTRY + 1);

// Its text, and whether the file is `uid`'s (undefined: not checked).
function readEntry(path: string, uid: number | undefined): { text: string; mine: boolean } | null {
  let fd: number;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  } catch {
    return null;
  }
  try {
    const st = fstatSync(fd);
    if (!st.isFile() || st.size > MAX_ENTRY) return null;
    const buf = entryBuf;
    let n = 0;
    for (let r = 1; r > 0 && n < buf.length; n += r) r = readSync(fd, buf, n, buf.length - n, null);
    return n > MAX_ENTRY ? null : { text: buf.toString('utf8', 0, n), mine: uid === undefined || st.uid === uid };
  } finally {
    closeSync(fd);
  }
}

// Reads Claude Code's live session registry (sessions/<pid>.json) and keeps
// entries whose process is still running.
// An entry another user owns is listed, but takes no messages.
export function listSessions(root: string, alive: (pid: number, procStart?: string) => boolean = pidAlive, uid: number | undefined = process.getuid?.()): LiveSession[] {
  let files: string[];
  try {
    files = readdirSync(join(root, 'sessions')).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: LiveSession[] = [];
  for (const f of files) {
    try {
      const got = readEntry(join(root, 'sessions', f), uid);
      if (got === null) continue;
      const d = JSON.parse(got.text);
      if (typeof d.pid !== 'number' || typeof d.sessionId !== 'string') continue;
      if (!alive(d.pid, typeof d.procStart === 'string' ? d.procStart : undefined)) continue;
      out.push({
        pid: d.pid,
        file: f,
        sessionId: d.sessionId,
        cwd: typeof d.cwd === 'string' ? d.cwd : '',
        name: typeof d.name === 'string' ? d.name : '',
        status: typeof d.status === 'string' ? d.status : 'busy',
        updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
        kind: typeof d.kind === 'string' ? d.kind : '',
        socket: !got.mine ? '' : typeof d.messagingSocketPath === 'string' ? d.messagingSocketPath.replace(/^uds:/, '') : '',
        peerProtocol: !got.mine ? 0 : typeof d.peerProtocol === 'number' ? d.peerProtocol : 0,
        ...(got.mine ? {} : { refusal: 'its registry entry is not yours' }),
      });
    } catch {
      // Being rewritten or not a session file.
    }
  }
  return out.sort((a, b) => a.pid - b.pid);
}
