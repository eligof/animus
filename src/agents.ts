// Shared contract between agent sources (live Claude data, demo crew) and the
// stage/UI that animates them.

export type Activity =
  | 'write'
  | 'read'
  | 'search'
  | 'run'
  | 'web'
  | 'delegate'
  | 'think'
  | 'talk'
  | 'done'
  | 'idle'
  | 'error';

export const ACTIVITIES: readonly Activity[] = [
  'write', 'read', 'search', 'run', 'web', 'delegate', 'think', 'talk', 'done', 'idle', 'error',
];

// What the pet card shows about an agent beyond its activity, kept from
// its transcript (see claude/vitals.ts; the demo simulates its own).
export type Vitals = {
  model: string; // e.g. 'claude-opus-5-5'; '' until the first reply
  window: number; // its context window, tokens
  context: number; // tokens in context as of the latest reply
  outTokens: number; // output tokens over what was read of the transcript
  errors: number[]; // times (ms) of failures in the last 10 minutes, oldest first
  streak: number; // tool calls in a row without an error
  turnEndedAt: number; // when the latest turn ended (0: none yet)
  busySince: number; // start of the current working stretch (0: none)
  lastAt: number; // time of the latest record (0: none)
  // Mid-turn on a tool: a call out, or its result just back. Then quiet is
  // work (a command or a subagent running); stopped any other way
  // (finished, interrupted, out of tokens, an error) the agent is waiting,
  // and quiet is rest.
  midTool: boolean;
  title: string; // the session's AI title ('' if none)
  branch: string; // git branch ('' if unknown)
};

// Quiet this long, not mid-turn on a tool, is a rest: the next record
// starts a new working stretch, and the energy meter is full.
export const REST_MS = 120_000;

// No working stretch yet, or a rest under way at `now`.
export function rested(v: Vitals, now: number): boolean {
  return !v.busySince || (!v.midTool && now - v.lastAt >= REST_MS);
}

// One entry of an agent's conversation, as the chat window shows it (see
// claude/chat.ts; the demo makes up its own):
//   agent     its text reply
//   user      a prompt: yours to a lead, the lead's task to a subagent
//   sent      a message animus posted into its session
//   tool      one tool step, worded as the card words it ('$ npm test')
//   thinking  it thought here (never what: thinking is not shown)
export type Bubble = {
  id: string; // stable while the conversation is read
  kind: 'agent' | 'user' | 'sent' | 'tool' | 'thinking';
  text: string;
  at: number; // ms (0: unknown)
  activity?: Activity; // tool steps: the kind of step, for its glyph
  outcome?: 'pending' | 'ok' | 'failed' | 'refused'; // tool steps
  // sent: the pid its receiver verified sent it, when it says. Anything
  // that reaches the inbox may give the name animus; only a message from
  // this process is yours.
  peerPid?: number;
};

// Whether a 'sent' entry is this process's (`self`): any sender can take
// the name animus, so when its receiver verified who sent it, that must be
// us. One that does not say is taken at its word.
export function ours(b: Bubble, self = process.pid): boolean {
  return b.peerPid === undefined || b.peerPid === self;
}

// How a send went, as far as the sender can tell (see claude/inbox.ts).
export type SendResult = { ok: true } | { ok: false; reason: string };

// Something an agent did that earns its crew XP (see pet/crew.ts): a
// finished turn, a build or test command that passed, a finished
// subagent run. `agent` is the agent whose transcript showed it and `at`
// when it happened (ms); `key` names it among that agent's events at that
// time, the same however often the transcript is read. It goes to `role`
// ('lead' or a subagent type) in the crew of project `crew`.
export type Gain = { agent: string; at: number; key: string; crew: string; role: string; kind: 'turn' | 'check' | 'subagent' };

export type AgentInfo = {
  id: string;
  name: string;
  role: 'lead' | 'sub';
  parentId?: string;
  project: string;
  agentType?: string;
  activity: Activity;
  detail: string;
  since: number;
  lastSeen: number;
  vitals?: Vitals;
  // The crew it belongs to: its project's path (the top of the git checkout
  // it works in, else its working directory); the demo's are made up.
  crew?: string;
  // Its role's level in its crew (★N, see pet/crew.ts), as the World
  // knows it; sources leave it out.
  level?: number;
};

export type AgentEvent = { at: number; agentId: string; name: string; activity: Activity; detail: string };

export interface AgentSource {
  readonly label: string;
  poll(now: number): AgentInfo[];
  drainEvents(): AgentEvent[];
  // The agent's conversation as read so far, oldest first (null: not one
  // of this source's agents). The chat window only reads it.
  chat?(id: string): readonly Bubble[] | null;
  // Why the agent cannot be sent a message now (null: it can).
  reach?(id: string): string | null;
  // Posts the user's `text` into the agent's session. Settles within
  // seconds and never rejects.
  send?(id: string, text: string): Promise<SendResult>;
  // What its agents did that earns XP since last asked, oldest first. The
  // same event may come again (a transcript read again): the crew counts
  // each once (see pet/crew.ts).
  drainGains?(): Gain[];
}

// Records an event for every agent whose activity or detail differs from the
// previous poll. Shared by all sources so the event semantics stay identical.
export function diffEvents(prev: Map<string, AgentInfo>, next: AgentInfo[], at: number): AgentEvent[] {
  const events: AgentEvent[] = [];
  for (const a of next) {
    const p = prev.get(a.id);
    if (!p || p.activity !== a.activity || p.detail !== a.detail) {
      events.push({ at, agentId: a.id, name: a.name, activity: a.activity, detail: a.detail });
    }
  }
  return events;
}
