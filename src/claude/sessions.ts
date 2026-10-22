import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LiveSession = {
  pid: number;
  sessionId: string;
  cwd: string;
  name: string;
  status: string;
  updatedAt: number;
  kind: string;
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

// Reads Claude Code's live session registry (sessions/<pid>.json) and keeps
// entries whose process is still running.
export function listSessions(root: string, alive: (pid: number, procStart?: string) => boolean = pidAlive): LiveSession[] {
  let files: string[];
  try {
    files = readdirSync(join(root, 'sessions')).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: LiveSession[] = [];
  for (const f of files) {
    try {
      const d = JSON.parse(readFileSync(join(root, 'sessions', f), 'utf8'));
      if (typeof d.pid !== 'number' || typeof d.sessionId !== 'string') continue;
      if (!alive(d.pid, typeof d.procStart === 'string' ? d.procStart : undefined)) continue;
      out.push({
        pid: d.pid,
        sessionId: d.sessionId,
        cwd: typeof d.cwd === 'string' ? d.cwd : '',
        name: typeof d.name === 'string' ? d.name : '',
        status: typeof d.status === 'string' ? d.status : 'busy',
        updatedAt: typeof d.updatedAt === 'number' ? d.updatedAt : 0,
        kind: typeof d.kind === 'string' ? d.kind : '',
      });
    } catch {
      // Being rewritten or not a session file.
    }
  }
  return out.sort((a, b) => a.pid - b.pid);
}
