import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { Activity, AgentEvent, AgentInfo, AgentSource, Bubble, Gain, SendResult } from '../agents.ts';
import { diffEvents } from '../agents.ts';
import { roleOf } from '../pet/crew.ts';
import { projectRoot } from '../pet/project.ts';
import { clip } from './activity.ts';
import { ChatReader } from './chat.ts';
import { GainReader } from './gains.ts';
import { entries, sendTo } from './inbox.ts';
import type { Entry } from './inbox.ts';
import { findTranscript } from './paths.ts';
import { listSessions, pidAlive } from './sessions.ts';
import { TranscriptTail, applyRecord, initialState } from './transcript.ts';
import type { TranscriptState } from './transcript.ts';
import { VitalsReader } from './vitals.ts';

type Meta = { agentType: string; description: string; toolUseId: string; background: boolean; finished: boolean };

type Tracked = {
  tail: TranscriptTail;
  state: TranscriptState;
  vitals: VitalsReader;
  chat: ChatReader;
  gains: GainReader;
  paid: boolean; // its finished run was settled (subagents)
  meta?: Meta;
  crew?: string; // subagents: the crew its gains go to
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
// Gains kept until drained, at most.
const MAX_GAINS = 2000;
// A gain stamped further ahead than this is a bad clock: it would lift its
// role's saved floor (see pet/crew.ts) past every real one to come.
const MAX_AHEAD_MS = 60_000;
// A background subagent's run is settled by its task notification, which
// can reach the lead's transcript minutes after the run's last write; with
// none this long after it, the run is taken to have finished well.
const NOTIFY_GRACE_MS = 60_000;
const NOTIFICATION = /<task-id>([^<]+)<\/task-id>[\s\S]*?<status>([^<]+)<\/status>/g;
// The notification's statuses for a run that went well.
const COMPLETED = new Set(['completed', 'ok']);

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

// Collects subagent finish signals from a lead transcript record. A task
// notification comes as a user record, or (mid-turn) as an attachment of
// a queued command; it is first written as it is queued for the lead,
// right as the subagent finishes.
function leadSignals(t: Tracked, rec: unknown): void {
  const r = rec as { type?: string; operation?: unknown; content?: unknown; attachment?: { type?: unknown; prompt?: unknown }; message?: { content?: unknown } };
  if (!r) return;
  const content = r.type === 'user' ? r.message?.content : r.type === 'attachment' && r.attachment?.type === 'queued_command' ? r.attachment.prompt : r.type === 'queue-operation' && r.operation === 'enqueue' ? r.content : undefined;
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
  private sessions = new Map<string, Entry>(); // as of the last scan, by session id
  private gains: Gain[] = [];

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

  // Oldest first: each agent's are found in order, but the agents in turn.
  drainGains(): Gain[] {
    const g = this.gains.sort((a, b) => a.at - b.at);
    this.gains = [];
    return g;
  }

  // The gains a transcript showed since last collected, for `role` in `crew`.
  private collect(t: Tracked, agent: string, crew: string, role: string, now: number): void {
    for (const f of t.gains.take()) this.gain({ agent, crew, role, ...f }, now);
  }

  private gain(g: Gain, now: number): void {
    if (!g.crew || g.at > now + MAX_AHEAD_MS) return;
    if (this.gains.length >= MAX_GAINS) this.gains.shift();
    this.gains.push(g);
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
      t = {
        tail: new TranscriptTail(path),
        state: initialState(now),
        vitals: new VitalsReader(),
        chat: new ChatReader(),
        gains: new GainReader(lead),
        paid: false,
        results: new Set(),
        notified: new Map(),
      };
      this.tracked.set(id, t);
    }
    for (const rec of t.tail.read()) {
      try {
        applyRecord(t.state, rec);
        if (lead) leadSignals(t, rec);
      } catch {
        // A record we cannot interpret must not stop the others.
      }
      try {
        t.vitals.apply(rec);
      } catch {
        // Vitals are cosmetic: a bad record must not touch the state or the finish signals.
      }
      try {
        t.chat.apply(rec);
      } catch {
        // Nor may the conversation.
      }
      try {
        t.gains.apply(rec);
      } catch {
        // Nor what earns XP.
      }
    }
    return t;
  }

  // An agent's conversation as read so far (see chat.ts); null for one
  // this source does not track (gone, or not one of its agents).
  chat(id: string): readonly Bubble[] | null {
    return this.tracked.get(id)?.chat.bubbles() ?? null;
  }

  // Why an agent cannot be sent a message (null: it can), as of the last
  // scan. A subagent runs inside its lead's session and has no inbox.
  reach(id: string): string | null {
    const e = this.sessions.get(id);
    if (!e) return this.tracked.has(id) ? 'a subagent has no session of its own' : 'no live session';
    return e.inbox.ok ? null : e.inbox.reason;
  }

  // Posts the user's text into a lead's session, its inbox looked up afresh.
  send(id: string, text: string): Promise<SendResult> {
    if (!this.sessions.has(id)) return Promise.resolve({ ok: false, reason: this.reach(id) ?? 'no live session' });
    return sendTo(this.root, id, text, { alive: this.alive });
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
    // One entry per session, chosen as send chooses (see entries).
    const chosen = entries(listSessions(this.root, this.alive));
    this.sessions = new Map(chosen.map((e) => [e.session.sessionId, e]));
    const sessions = chosen.map((e) => e.session);
    for (const s of sessions) {
      const path = this.transcriptFor(s.sessionId, now);
      const project = clip(basename(s.cwd), 24) || 'session';
      const crew = s.cwd ? projectRoot(s.cwd) : '';
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
      if (crew) lead.crew = crew;
      seen.add(s.sessionId);
      if (path) {
        const t = this.track(s.sessionId, path, now, true);
        const st = t.state;
        lead.vitals = t.vitals.snapshot(now);
        this.collect(t, s.sessionId, crew, 'lead', now);
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
      if (s.status === 'idle') {
        Object.assign(lead, { activity: 'idle', detail: 'waiting for you' });
        // Waiting for the user, whatever the transcript last said: a call
        // never answered must not keep it at work.
        if (lead.vitals) lead.vitals.midTool = false;
      }
      else if (s.status === 'waiting') Object.assign(lead, { activity: 'talk', detail: 'needs your input' });
      out.push(lead);
      if (path) out.push(...this.subagents(s.sessionId, path, project, crew, now, seen));
    }
    for (const [id, t] of [...this.tracked]) {
      if (seen.has(id)) continue;
      // A subagent gone before its type was ever known: its gains go to
      // the default type, as they would had it finished.
      if (t.crew !== undefined && !t.meta) this.collect(t, id, t.crew, roleOf({ role: 'sub' }), now);
      this.tracked.delete(id);
    }
    const live = new Set(sessions.map((s) => s.sessionId));
    for (const id of [...this.paths.keys()]) if (!live.has(id)) this.paths.delete(id);
    for (const id of [...this.missUntil.keys()]) if (!live.has(id)) this.missUntil.delete(id);
    for (const p of [...this.finished.keys()]) if (!this.listed.has(p)) this.finished.delete(p);
    this.listed.clear();
    return out;
  }

  private subagents(sessionId: string, leadPath: string, project: string, crew: string, now: number, seen: Set<string>): AgentInfo[] {
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
      // Its gains go to its type, held until its meta.json says which: a
      // gain must go to the same role however often it is read, or it may
      // be counted twice. One that finishes (or is gone) with none ever
      // readable is the default type. Its finished run gains once, unless
      // it was interrupted, or its notification says it did not complete
      // (failed, killed). A background one's notification is waited for
      // (see NOTIFY_GRACE_MS); the run is settled only then.
      t.crew = crew;
      const role = roleOf({ role: 'sub', agentType: meta?.agentType });
      if (meta || finished) this.collect(t, id, crew, role, now);
      const failed = lead?.notified.get(id);
      if (finished && !t.paid && (failed !== undefined || !meta?.background || quiet >= NOTIFY_GRACE_MS)) {
        t.paid = true;
        if (!st.interrupted && (failed === undefined || COMPLETED.has(failed))) this.gain({ agent: id, at: st.lastSeen || m, key: 'finish', crew, role, kind: 'subagent' }, now);
      }
      if (finished && quiet >= DONE_LINGER_MS) {
        // Out of sight; one not settled yet is still read, for its notification.
        if (t.paid) this.finished.set(path, m);
        else seen.add(id);
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
        vitals: t.vitals.snapshot(now),
      };
      if (crew) info.crew = crew;
      if (finished && st.interrupted) Object.assign(info, { activity: 'idle', detail: 'interrupted' });
      else if (finished && (failed === 'failed' || failed === 'killed')) Object.assign(info, { activity: 'error', detail: failed });
      else if (finished) Object.assign(info, { activity: 'done', detail: 'finished' });
      else if (st.lastSeen === 0) Object.assign(info, { activity: 'think', detail: 'spinning up' });
      // A finished subagent has no call out, whatever its transcript says.
      if (finished && info.vitals) info.vitals.midTool = false;
      out.push(info);
    }
    return out;
  }
}
