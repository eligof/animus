import type { Vitals } from '../agents.ts';
import { rested } from '../agents.ts';
import { INTERRUPTED, refused, resultText } from './transcript.ts';

// The pet card's facts about an agent, folded from its transcript records
// as the source reads them (see source.ts): the model and how full its
// context is, output so far, recent failures (not calls a hook, the
// permission rules or the user refused), the run of good tool calls, the
// current working stretch, the session's title and git branch.

const SMALL_WINDOW = 200_000;
const BIG_WINDOW = 1_000_000;
// Failures are remembered this long (the health meter heals over it).
const ERROR_SPAN = 600_000;
// Message ids remembered so repeated usage is counted once; past this the
// set is cleared (an old message never comes back, so at worst the current
// one is counted twice).
const MAX_COUNTED = 5000;
// Tool calls awaiting their result, at most (the oldest dropped past it).
const MAX_PENDING = 100;

type Usage = { input_tokens?: unknown; cache_read_input_tokens?: unknown; cache_creation_input_tokens?: unknown; output_tokens?: unknown };
type Rec = {
  type?: string;
  timestamp?: string;
  isMeta?: boolean;
  requestedModel?: unknown;
  aiTitle?: unknown;
  gitBranch?: unknown;
  isApiErrorMessage?: boolean;
  message?: { id?: unknown; model?: unknown; usage?: unknown; stop_reason?: unknown; content?: unknown };
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export class VitalsReader {
  private v: Vitals = {
    model: '',
    window: SMALL_WINDOW,
    context: 0,
    outTokens: 0,
    errors: [],
    streak: 0,
    turnEndedAt: 0,
    busySince: 0,
    lastAt: 0,
    midTool: false,
    title: '',
    branch: '',
  };
  private counted = new Set<string>();
  // Tool calls out without their result yet.
  private pending = new Set<string>();
  // How the latest reply stopped: its stop reason or, when it has none
  // (as in most subagent transcripts), 'tool_use' if it calls a tool;
  // 'interrupted' once the user stopped the turn.
  private stop: string | null = null;

  apply(rec: unknown): void {
    if (!rec || typeof rec !== 'object') return;
    const r = rec as Rec;
    const v = this.v;
    const t = Date.parse(r.timestamp ?? '');
    const timed = Number.isFinite(t);
    if (r.type === 'ai-title' && typeof r.aiTitle === 'string') v.title = r.aiTitle;
    if (typeof r.gitBranch === 'string' && r.gitBranch) v.branch = r.gitBranch;
    // Meta records (hook notes, command caveats) are not the agent at work.
    if (r.isMeta) return;
    if (timed && (r.type === 'assistant' || r.type === 'user')) {
      if (rested(v, t)) v.busySince = t;
      v.lastAt = Math.max(v.lastAt, t);
    }
    const m = r.message;
    if (r.type === 'assistant' && m && typeof m === 'object') {
      if (typeof m.model === 'string' && m.model && m.model !== '<synthetic>') v.model = m.model;
      // The window follows the session's current model (it can be switched
      // mid-session); a context past the small window only ever raises it.
      if (typeof r.requestedModel === 'string') v.window = r.requestedModel.endsWith('[1m]') ? BIG_WINDOW : SMALL_WINDOW;
      if (m.usage && typeof m.usage === 'object') {
        const u = m.usage as Usage;
        const ctx = num(u.input_tokens) + num(u.cache_read_input_tokens) + num(u.cache_creation_input_tokens);
        if (ctx > 0) v.context = ctx;
        if (ctx > SMALL_WINDOW) v.window = BIG_WINDOW;
        const id = typeof m.id === 'string' ? m.id : '';
        if (!id || !this.counted.has(id)) {
          if (this.counted.size >= MAX_COUNTED) this.counted.clear();
          if (id) this.counted.add(id);
          v.outTokens += num(u.output_tokens);
        }
      }
      if (r.isApiErrorMessage) this.fail(timed ? t : undefined);
      if (m.stop_reason === 'end_turn' && timed) v.turnEndedAt = t;
      const blocks = Array.isArray(m.content) ? (m.content as Array<{ type?: unknown; id?: unknown }>) : [];
      for (const b of blocks) if (b?.type === 'tool_use' && typeof b.id === 'string') this.call(b.id);
      this.stop = typeof m.stop_reason === 'string' ? m.stop_reason : blocks.some((b) => b?.type === 'tool_use') ? 'tool_use' : null;
      // Stopped for good (finished, out of tokens, an error): no call is out.
      if ((this.stop !== null && this.stop !== 'tool_use') || r.isApiErrorMessage) this.pending.clear();
      this.settle();
      return;
    }
    if (r.type !== 'user' || !m) return;
    if (typeof m.content === 'string') {
      if (m.content.startsWith(INTERRUPTED)) this.interrupted();
      return;
    }
    if (!Array.isArray(m.content)) return;
    for (const b of m.content as Array<{ type?: unknown; text?: unknown; tool_use_id?: unknown; is_error?: unknown; content?: unknown }>) {
      if (b?.type === 'text' && typeof b.text === 'string' && b.text.startsWith(INTERRUPTED)) this.interrupted();
      if (b?.type !== 'tool_result') continue;
      if (typeof b.tool_use_id === 'string') this.pending.delete(b.tool_use_id);
      if (b.is_error === true && resultText(b).startsWith(INTERRUPTED)) this.interrupted();
      // A call refused before it ran neither failed nor went well.
      if (b.is_error === true) {
        if (!refused(b)) this.fail(timed ? t : undefined);
      } else v.streak++;
    }
    this.settle();
  }

  private call(id: string): void {
    if (this.pending.size >= MAX_PENDING) this.pending.delete(this.pending.values().next().value!);
    this.pending.add(id);
  }

  // The user stopped the turn: no call is out, nothing is under way.
  private interrupted(): void {
    this.pending.clear();
    this.stop = 'interrupted';
    this.settle();
  }

  private settle(): void {
    this.v.midTool = this.stop === 'tool_use' || this.pending.size > 0;
  }

  // A copy for an AgentInfo, failures older than ERROR_SPAN dropped.
  snapshot(now: number): Vitals {
    this.v.errors = this.v.errors.filter((e) => now - e <= ERROR_SPAN);
    return { ...this.v, errors: [...this.v.errors] };
  }

  // A failure always breaks the streak; it is only dated when the record was.
  // Times go in sorted, so records out of order keep errors oldest first.
  private fail(t?: number): void {
    this.v.streak = 0;
    if (t === undefined) return;
    const e = this.v.errors;
    let i = e.length;
    while (i > 0 && e[i - 1] > t) i--;
    e.splice(i, 0, t);
    if (this.v.errors.length > 50) this.v.errors.splice(0, this.v.errors.length - 50);
  }
}
