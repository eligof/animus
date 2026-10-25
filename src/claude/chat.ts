import type { Bubble } from '../agents.ts';
import { toolActivity, toolDetail } from './activity.ts';
import { COMMAND, INTERRUPTED, SYSTEM, refused } from './transcript.ts';

// An agent's conversation as the chat window shows it, folded from its
// transcript records as the source reads them (see source.ts): its text
// replies, the prompts it was given, its tool steps as one-line rows, a
// mark where it thought (never what), and the messages animus posted into
// its session. Hook notes, command output, task notifications and other
// sessions' messages are left out. Transcript text is untrusted: it is
// kept as is here and made cell-safe where it is drawn (ui/chat-lines.ts).

// The name animus posts under (see inbox.ts).
export const SENDER = 'animus';
// Entries kept (the oldest dropped past it), and characters of one message.
const MAX_BUBBLES = 300;
const MAX_TEXT = 20_000;
// Tool calls whose result is still to come, at most.
const MAX_OPEN_TOOLS = 200;
// Record uuids remembered, to show a replayed record once.
const MAX_SEEN = 5000;

type Block = { type?: unknown; id?: unknown; name?: unknown; input?: unknown; text?: unknown; tool_use_id?: unknown; is_error?: unknown; content?: unknown };
type Rec = {
  type?: unknown;
  uuid?: unknown;
  timestamp?: unknown;
  isMeta?: unknown;
  origin?: { kind?: unknown; name?: unknown; body?: unknown; verifiedPeerPid?: unknown };
  message?: { content?: unknown };
};

export class ChatReader {
  private list: Bubble[] = [];
  // Tool steps whose result is still to come, by tool call id.
  private tools = new Map<string, Bubble>();
  private seq = 0;
  // Record uuids already applied, the oldest forgotten past MAX_SEEN.
  private seen = new Set<string>();

  // The conversation so far, oldest first. The caller only reads it.
  bubbles(): readonly Bubble[] {
    return this.list;
  }

  apply(rec: unknown): void {
    if (!rec || typeof rec !== 'object') return;
    const r = rec as Rec;
    if (r.type !== 'assistant' && r.type !== 'user') return;
    const t = typeof r.timestamp === 'string' ? Date.parse(r.timestamp) : NaN;
    const at = Number.isFinite(t) ? t : 0;
    // A record read twice (replayed, or resumed) is shown once.
    if (typeof r.uuid === 'string' && r.uuid) {
      if (this.seen.has(r.uuid)) return;
      this.seen.add(r.uuid);
      if (this.seen.size > MAX_SEEN) this.seen.delete(this.seen.values().next().value!);
    }
    const key = typeof r.uuid === 'string' && r.uuid ? r.uuid : `r${++this.seq}`;
    const content = r.message?.content;
    // A peer message is one whether or not it is marked meta; of those,
    // only animus's own are shown, as posted.
    const o = r.origin;
    if (o?.kind === 'peer') {
      if (r.type === 'user' && o.name === SENDER && typeof o.body === 'string') {
        const pid = o.verifiedPeerPid;
        this.add({ id: key, kind: 'sent', text: o.body, at, ...(Number.isInteger(pid) ? { peerPid: pid as number } : {}) });
      }
      return;
    }
    if (r.isMeta === true) return;
    if (r.type === 'assistant') {
      const blocks = Array.isArray(content) ? (content as Block[]) : [];
      blocks.forEach((b, i) => {
        const id = `${key}:${i}`;
        if (b?.type === 'text' && typeof b.text === 'string' && b.text.trim()) this.add({ id, kind: 'agent', text: b.text, at });
        else if (b?.type === 'thinking' || b?.type === 'redacted_thinking') this.add({ id, kind: 'thinking', text: '', at });
        else if (b?.type === 'tool_use') {
          const name = typeof b.name === 'string' && b.name ? b.name : 'tool';
          const input = b.input && typeof b.input === 'object' ? (b.input as Record<string, unknown>) : {};
          const step: Bubble = { id, kind: 'tool', text: toolDetail(name, input), at, activity: toolActivity(name), outcome: 'pending' };
          this.add(step);
          if (typeof b.id === 'string') this.open(b.id, step);
        }
      });
      return;
    }
    if (typeof content === 'string') {
      this.prompt(key, content, at);
      return;
    }
    if (!Array.isArray(content)) return;
    const blocks = content as Block[];
    let results = false;
    for (const b of blocks) {
      if (b?.type !== 'tool_result') continue;
      results = true;
      const id = typeof b.tool_use_id === 'string' ? b.tool_use_id : '';
      const step = this.tools.get(id);
      if (!step) continue;
      this.tools.delete(id);
      // A call refused before it ran (a hook, the rules, the user) or
      // interrupted is no failure.
      step.outcome = b.is_error !== true ? 'ok' : refused(b) ? 'refused' : 'failed';
    }
    if (results) return;
    const text = blocks.filter((b) => b?.type === 'text' && typeof b.text === 'string').map((b) => b.text as string).join('\n');
    if (text) this.prompt(key, text, at);
  }

  // A prompt, unless Claude Code wrote it (an interruption, a note, a
  // slash command's markup).
  private prompt(id: string, text: string, at: number): void {
    const t = text.trimStart();
    if (!t || t.startsWith(INTERRUPTED) || SYSTEM.test(t) || COMMAND.test(t)) return;
    this.add({ id, kind: 'user', text, at });
  }

  private add(b: Bubble): void {
    // One mark for a run of thinking.
    if (b.kind === 'thinking' && this.list[this.list.length - 1]?.kind === 'thinking') return;
    if (b.text.length > MAX_TEXT) b.text = `${[...b.text].slice(0, MAX_TEXT).join('')}…`;
    this.list.push(b);
    if (this.list.length > MAX_BUBBLES) this.list.splice(0, this.list.length - MAX_BUBBLES);
  }

  private open(id: string, step: Bubble): void {
    if (this.tools.size >= MAX_OPEN_TOOLS) this.tools.delete(this.tools.keys().next().value!);
    this.tools.set(id, step);
  }
}
