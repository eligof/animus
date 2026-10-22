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
};

export type AgentEvent = { at: number; agentId: string; name: string; activity: Activity; detail: string };

export interface AgentSource {
  readonly label: string;
  poll(now: number): AgentInfo[];
  drainEvents(): AgentEvent[];
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
