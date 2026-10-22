import { openSync, fstatSync, readSync, closeSync } from 'node:fs';
import type { Activity } from '../agents.ts';
import { toolActivity, toolDetail, clip } from './activity.ts';

export type TranscriptState = {
  activity: Activity;
  detail: string;
  since: number;
  lastSeen: number;
  pending: Set<string>;
  ended: boolean;
  errorUntil: number;
  lastText: boolean; // latest assistant output was text (a tool call may still follow)
  interrupted: boolean;
};

export function initialState(now = Date.now()): TranscriptState {
  return {
    activity: 'idle',
    detail: '',
    since: now,
    lastSeen: 0,
    pending: new Set(),
    ended: false,
    errorUntil: 0,
    lastText: false,
    interrupted: false,
  };
}

type Block = { type?: string; id?: string; name?: string; input?: unknown; text?: string; tool_use_id?: string; is_error?: boolean };

function set(st: TranscriptState, activity: Activity, detail: string, at: number): boolean {
  if (st.activity === activity && st.detail === detail) return false;
  st.activity = activity;
  st.detail = detail;
  st.since = at;
  return true;
}

// A user text record: either the user interrupting, or a new request.
function prompt(st: TranscriptState, text: string, at: number): boolean {
  if (text.startsWith('[Request interrupted')) {
    st.ended = true;
    st.interrupted = true;
    st.pending.clear();
    return set(st, 'idle', 'interrupted', at);
  }
  st.ended = false;
  st.interrupted = false;
  return set(st, 'think', 'new task', at);
}

// Folds one transcript record into the agent state. Returns true when the
// visible activity/detail changed.
export function applyRecord(st: TranscriptState, rec: unknown): boolean {
  if (!rec || typeof rec !== 'object') return false;
  const r = rec as { type?: string; timestamp?: string; isMeta?: boolean; message?: { content?: unknown; stop_reason?: string | null } };
  if ((r.type !== 'assistant' && r.type !== 'user') || r.isMeta) return false;
  const parsed = Date.parse(r.timestamp ?? '');
  const at = Number.isFinite(parsed) ? parsed : st.lastSeen;
  st.lastSeen = Math.max(st.lastSeen, at);
  const content = r.message?.content;
  let changed = false;

  if (r.type === 'assistant') {
    const blocks = Array.isArray(content) ? (content as Block[]) : [];
    let lastText = false;
    for (const b of blocks) {
      lastText = b?.type === 'text' && typeof b.text === 'string' && b.text.trim() !== '';
      if (b?.type === 'tool_use') {
        if (typeof b.id === 'string') st.pending.add(b.id);
        st.ended = false;
        const name = typeof b.name === 'string' && b.name ? b.name : 'tool';
        const input = b.input && typeof b.input === 'object' ? (b.input as Record<string, unknown>) : {};
        changed = set(st, toolActivity(name), toolDetail(name, input), at) || changed;
      } else if (b?.type === 'thinking' || b?.type === 'redacted_thinking') {
        changed = set(st, 'think', 'thinking…', at) || changed;
      } else if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) {
        changed = set(st, 'talk', clip(b.text, 40), at) || changed;
      }
    }
    // Claude Code writes one record per content block and often leaves
    // stop_reason null; a tool call can follow a text record minutes later,
    // so text alone never ends the turn (the source uses finish signals).
    if (blocks.length) st.lastText = lastText;
    if (r.message?.stop_reason === 'end_turn' && st.pending.size === 0) st.ended = true;
    else if (blocks.some((b) => b?.type === 'thinking')) st.ended = false;
    return changed;
  }

  if (typeof content === 'string') return prompt(st, content, at);
  const blocks = Array.isArray(content) ? (content as Block[]) : [];
  let sawResult = false;
  for (const b of blocks) {
    if (b?.type !== 'tool_result') continue;
    sawResult = true;
    if (typeof b.tool_use_id === 'string') st.pending.delete(b.tool_use_id);
    if (b.is_error) {
      st.errorUntil = at + 3000;
      changed = set(st, 'error', 'tool failed', at) || changed;
    }
  }
  const text = blocks.find((b) => b?.type === 'text' && typeof b.text === 'string');
  if (!sawResult && text) changed = prompt(st, String(text.text), at) || changed;
  return changed;
}

// Incrementally reads a growing JSONL file. Keeps undecoded bytes of a
// trailing partial line between reads so multi-byte UTF-8 is never split.
export class TranscriptTail {
  readonly path: string;
  private maxInitial: number;
  private offset = 0;
  private rest: Buffer = Buffer.alloc(0);
  private first = true;
  private skipPartial = false;

  constructor(path: string, maxInitialBytes = 262144) {
    this.path = path;
    this.maxInitial = maxInitialBytes;
  }

  read(): unknown[] {
    let fd: number;
    try {
      fd = openSync(this.path, 'r');
    } catch {
      return [];
    }
    try {
      const size = fstatSync(fd).size;
      if (size < this.offset) {
        this.offset = 0;
        this.rest = Buffer.alloc(0);
      }
      if (this.first) {
        this.first = false;
        if (size > this.maxInitial) {
          this.offset = size - this.maxInitial;
          this.skipPartial = true;
        }
      }
      if (size === this.offset) return [];
      const chunk = Buffer.alloc(size - this.offset);
      const n = readSync(fd, chunk, 0, chunk.length, this.offset);
      this.offset += n;
      let data = this.rest.length ? Buffer.concat([this.rest, chunk.subarray(0, n)]) : chunk.subarray(0, n);
      if (this.skipPartial) {
        const nl = data.indexOf(10);
        if (nl < 0) {
          this.rest = Buffer.from(data);
          return [];
        }
        data = data.subarray(nl + 1);
        this.skipPartial = false;
      }
      const last = data.lastIndexOf(10);
      if (last < 0) {
        this.rest = Buffer.from(data);
        return [];
      }
      this.rest = Buffer.from(data.subarray(last + 1));
      const out: unknown[] = [];
      for (const line of data.subarray(0, last).toString('utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          // Half-written or corrupt line: skip it.
        }
      }
      return out;
    } catch {
      // Unreadable (EISDIR, EIO, vanished): treat as no new data.
      return [];
    } finally {
      closeSync(fd);
    }
  }
}
