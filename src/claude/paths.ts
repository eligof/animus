import { readdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function claudeRoot(flag?: string, env: NodeJS.ProcessEnv = process.env): string {
  return flag || env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
}

// Session transcripts live in projects/<slug>/<sessionId>.jsonl. The slug is
// derived from the cwd by Claude Code; scanning avoids re-deriving it.
export function findTranscript(root: string, sessionId: string, cache: Map<string, string>): string | null {
  const hit = cache.get(sessionId);
  if (hit && existsSync(hit)) return hit;
  let dirs: string[];
  try {
    dirs = readdirSync(join(root, 'projects'));
  } catch {
    return null;
  }
  for (const d of dirs) {
    const p = join(root, 'projects', d, `${sessionId}.jsonl`);
    if (existsSync(p)) {
      cache.set(sessionId, p);
      return p;
    }
  }
  return null;
}
