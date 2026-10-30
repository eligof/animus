import type { Activity, AgentEvent, AgentInfo, AgentSource } from '../agents.ts';

// A made-up crew for stress tests and renders: `leads` leads with `subs`
// subagents each, all at work from the start, each turning to something
// else every four to ten seconds (never waiting, never done), the same
// every run.
const ACTS: readonly Activity[] = ['write', 'read', 'search', 'run', 'web', 'think', 'write', 'write', 'read', 'run'];

type Agent = { id: string; name: string; role: 'lead' | 'sub'; parentId?: string; activity: Activity; next: number; since: number };

export class StressSource implements AgentSource {
  readonly label = 'stress';
  private agents: Agent[] = [];
  private seed = 12345;

  constructor(leads: number, subs: number, start: number) {
    for (let l = 0; l < leads; l++) {
      this.agents.push({ id: `L${l}`, name: `lead ${l}`, role: 'lead', activity: 'write', next: start, since: start });
      for (let k = 0; k < subs; k++) this.agents.push({ id: `L${l}S${k}`, name: `sub ${l}.${k}`, role: 'sub', parentId: `L${l}`, activity: 'read', next: start, since: start });
    }
  }

  private rnd(): number {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    return this.seed / 2 ** 32;
  }

  poll(now: number): AgentInfo[] {
    for (const a of this.agents) {
      if (now < a.next) continue;
      a.activity = ACTS[Math.floor(this.rnd() * ACTS.length)];
      a.next = now + 4000 + this.rnd() * 6000;
      a.since = now;
    }
    return this.agents.map((a) => ({ id: a.id, name: a.name, role: a.role, parentId: a.parentId, project: '/stress', agentType: a.role === 'sub' ? 'general-purpose' : undefined, activity: a.activity, detail: `${a.activity} things`, since: a.since, lastSeen: now, crew: '/stress' }));
  }

  drainEvents(): AgentEvent[] {
    return [];
  }
}
