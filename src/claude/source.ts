import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Activity, AgentEvent, AgentInfo, AgentSource } from '../agents.ts';
import { diffEvents } from '../agents.ts';
import { clip } from './activity.ts';
import { findTranscript } from './paths.ts';
import { listSessions, pidAlive } from './sessions.ts';
import { TranscriptTail, applyRecord, initialState } from './transcript.ts';
import type { TranscriptState } from './transcript.ts';

type Meta = { agentType: string; description: string; toolUseId: string; background: boolean; finished: boolean };

type Tracked = {
  tail: TranscriptTail;
  state: TranscriptState;
  meta?: Meta;
  // Lead transcripts only: ids of tool calls that returned, and subagent
  // task notifications (agent id → status) — how Claude Code reports that a
  // subagent finished.
  results: Set<string>;
  notified: Map<string, string>;
};

type Opts = { intervalMs?: number; alive?: (pid: number, procStart?: string) => boolean; subagentWindowMs?: number };

const DONE_LINGER_MS = 25_000;
// Unfinished subagents stay visible this long without writes (a single long
// model generation can take many minutes).
const SUBAGENT_WINDOW_MS = 3_600_000;
// Old transcripts carry no finish signal: a reply that ended in text and was
// followed by this much silence is treated as finished.
const STALE_TEXT_MS = 600_000;
// No pending tool, turn not over, and nothing written for a while: the model
// is generating its next step.
const THINK_AFTER_MS = 8000;
// A session whose transcript does not exist yet is looked up again after this.
const MISS_RETRY_MS = 5000;
const NOTIFICATION = /<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/g;

function present(st: TranscriptState, now: number): { activity: Activity; detail: string } {
  if (now < st.errorUntil) return { activity: 'error', detail: st.detail };
  if (st.activity === 'error' || (st.pending.size === 0 && !st.ended && now - st.lastSeen > THINK_AFTER_MS)) {
    return { activity: 'think', detail: 'thinking…' };
  }
  return { activity: st.activity, detail: st.detail };
}

function mtime(p: string): number {
  try {
    return statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

function readMeta(path: string): Meta | undefined {
  try {
    const m = JSON.parse(readFileSync(path, 'utf8'));
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      agentType: str(m.agentType),
      description: str(m.description),
      toolUseId: str(m.toolUseId),
      background: m.requestShape === 'background',
      finished: m.finished === true,
    };
  } catch {
    return undefined; // not written yet
  }
}

// Collects subagent finish signals from a lead transcript record.
function leadSignals(t: Tracked, rec: unknown): void {
  const r = rec as { type?: string; message?: { content?: unknown } };
  if (!r || r.type !== 'user') return;
  const content = r.message?.content;
  const texts: string[] = [];
  if (typeof content === 'string') texts.push(content);
  else if (Array.isArray(content)) {
    for (const b of content as Array<{ type?: string; text?: unknown; tool_use_id?: unknown }>) {
      if (b?.type === 'tool_result' && typeof b.tool_use_id === 'string') t.results.add(b.tool_use_id);
      else if (b?.type === 'text' && typeof b.text === 'string') texts.push(b.text);
    }
  }
  for (const text of texts) {
    if (!text.includes('<task-notification>')) continue;
    for (const m of text.matchAll(NOTIFICATION)) t.notified.set(m[1].trim(), m[2].trim());
  }
  if (t.results.size > 20_000) t.results.clear();
}

// Live agents read from Claude Code's local state: the session registry plus
// each session's transcript and subagent transcripts. Read-only.
export class ClaudeSource implements AgentSource {
  readonly label = 'live';
  readonly root: string;
  private interval: number;
  private alive: (pid: number, procStart?: string) => boolean;
  private window: number;
  private tracked = new Map<string, Tracked>();
  private paths = new Map<string, string>();
  private missUntil = new Map<string, number>();
  private last = new Map<string, AgentInfo>();
  private cached: AgentInfo[] = [];
  private lastScan = -Infinity;
  private events: AgentEvent[] = [];
  private finished = new Map<string, number>(); // transcript path → mtime when seen finished
  private listed = new Set<string>(); // subagent transcripts seen during the current scan

  constructor(root: string, opts: Opts = {}) {
    this.root = root;
    this.interval = opts.intervalMs ?? 750;
    this.alive = opts.alive ?? pidAlive;
    this.window = opts.subagentWindowMs ?? SUBAGENT_WINDOW_MS;
  }

  drainEvents(): AgentEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  poll(now: number): AgentInfo[] {
    // A clock that jumped backwards (now < lastScan) rescans instead of freezing.
    if (now >= this.lastScan && now - this.lastScan < this.interval) return this.cached;
    this.lastScan = now;
    let agents: AgentInfo[];
    try {
      agents = this.scan(now);
    } catch {
      return this.cached;
    }
    this.events.push(...diffEvents(this.last, agents, now));
    this.last = new Map(agents.map((a) => [a.id, a]));
    this.cached = agents;
    return agents;
  }

  private track(id: string, path: string, now: number, lead: boolean): Tracked {
    let t = this.tracked.get(id);
    if (!t || t.tail.path !== path) {
      t = { tail: new TranscriptTail(path), state: initialState(now), results: new Set(), notified: new Map() };
      this.tracked.set(id, t);
    }
    for (const rec of t.tail.read()) {
      try {
        applyRecord(t.state, rec);
        if (lead) leadSignals(t, rec);
      } catch {
        // A record we cannot interpret must not stop the others.
      }
    }
    return t;
  }

  private transcriptFor(sessionId: string, now: number): string | null {
    const until = this.missUntil.get(sessionId);
    if (until !== undefined && now < until && until - now <= MISS_RETRY_MS) return null;
    const path = findTranscript(this.root, sessionId, this.paths);
    if (path) this.missUntil.delete(sessionId);
    else this.missUntil.set(sessionId, now + MISS_RETRY_MS);
    return path;
  }

  private scan(now: number): AgentInfo[] {
    const out: AgentInfo[] = [];
    const seen = new Set<string>();
    const sessions = listSessions(this.root, this.alive);
    for (const s of sessions) {
      const path = this.transcriptFor(s.sessionId, now);
      const project = clip(basename(s.cwd), 24) || 'session';
      const lead: AgentInfo = {
        id: s.sessionId,
        name: clip(s.name || project, 18),
        role: 'lead',
        project,
        activity: 'think',
        detail: 'starting up',
        since: s.updatedAt || now,
        lastSeen: s.updatedAt || now,
      };
      seen.add(s.sessionId);
      if (path) {
        const st = this.track(s.sessionId, path, now, true).state;
        lead.lastSeen = Math.max(st.lastSeen, lead.lastSeen);
        if (st.lastSeen > 0) {
          lead.since = st.since;
          if (st.ended && now >= st.errorUntil) {
            Object.assign(lead, st.interrupted ? { activity: 'idle', detail: 'interrupted' } : { activity: 'think', detail: 'wrapping up' });
          } else {
            Object.assign(lead, present(st, now));
          }
        }
      }
      if (s.status === 'idle') Object.assign(lead, { activity: 'idle', detail: 'waiting for you' });
      else if (s.status === 'waiting') Object.assign(lead, { activity: 'talk', detail: 'needs your input' });
      out.push(lead);
      if (path) out.push(...this.subagents(s.sessionId, path, project, now, seen));
    }
    for (const id of [...this.tracked.keys()]) if (!seen.has(id)) this.tracked.delete(id);
    const live = new Set(sessions.map((s) => s.sessionId));
    for (const id of [...this.paths.keys()]) if (!live.has(id)) this.paths.delete(id);
    for (const id of [...this.missUntil.keys()]) if (!live.has(id)) this.missUntil.delete(id);
    for (const p of [...this.finished.keys()]) if (!this.listed.has(p)) this.finished.delete(p);
    this.listed.clear();
    return out;
  }

  private subagents(sessionId: string, leadPath: string, project: string, now: number, seen: Set<string>): AgentInfo[] {
    const dir = join(dirname(leadPath), sessionId, 'subagents');
    let files: string[];
    try {
      files = readdirSync(dir).filter((f) => f.startsWith('agent-') && f.endsWith('.jsonl'));
    } catch {
      return [];
    }
    const lead = this.tracked.get(sessionId);
    const out: AgentInfo[] = [];
    for (const f of files) {
      const id = f.slice('agent-'.length, -'.jsonl'.length);
      const path = join(dir, f);
      this.listed.add(path);
      const m = mtime(path);
      if (now - m > this.window || this.finished.get(path) === m) continue;
      const quiet = now - m;
      const t = this.track(id, path, now, false);
      // Re-read until finished: meta.json can land late and gains
      // `finished: true` when the subagent completes.
      if (!t.meta?.finished) t.meta = readMeta(join(dir, `agent-${id}.meta.json`)) ?? t.meta;
      const st = t.state;
      const meta = t.meta;
      const finished =
        st.ended ||
        meta?.finished === true ||
        (lead?.notified.has(id) ?? false) ||
        (meta !== undefined && !meta.background && meta.toolUseId !== '' && (lead?.results.has(meta.toolUseId) ?? false)) ||
        (st.lastText && st.pending.size === 0 && quiet >= STALE_TEXT_MS);
      if (finished && quiet >= DONE_LINGER_MS) {
        this.finished.set(path, m);
        continue;
      }
      seen.add(id);
      const info: AgentInfo = {
        id,
        name: clip(meta?.description || meta?.agentType || `agent ${id.slice(0, 6)}`, 18),
        role: 'sub',
        parentId: sessionId,
        project,
        agentType: meta?.agentType || undefined,
        ...present(st, now),
        since: st.since,
        lastSeen: Math.max(st.lastSeen, m),
      };
      const failed = lead?.notified.get(id);
      if (finished && st.interrupted) Object.assign(info, { activity: 'idle', detail: 'interrupted' });
      else if (finished && (failed === 'failed' || failed === 'killed')) Object.assign(info, { activity: 'error', detail: failed });
      else if (finished) Object.assign(info, { activity: 'done', detail: 'finished' });
      else if (st.lastSeen === 0) Object.assign(info, { activity: 'think', detail: 'spinning up' });
      out.push(info);
    }
    return out;
  }
}
