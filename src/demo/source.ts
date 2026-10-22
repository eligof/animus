import type { Activity, AgentEvent, AgentInfo, AgentSource } from '../agents.ts';
import { diffEvents } from '../agents.ts';
import { Rng } from '../world/rng.ts';

const DETAILS: Record<Activity, readonly string[]> = {
  write: ['Edit cli.ts', 'Edit stage.ts', 'Write README.md', 'Edit auth.ts', 'Edit cart.tsx', 'MultiEdit api.ts', 'Edit styles.css', 'Write schema.sql', 'Edit router.go', 'Edit main.rs'],
  read: ['Read package.json', 'Read index.ts', 'Read DESIGN.md', 'Read utils.py', 'Read Cargo.toml', 'Read checkout.ts', 'Read .env.example', 'Read server.go'],
  search: ['Grep "TODO"', 'Glob **/*.test.ts', 'Grep "useEffect"', 'Grep "fn main"', 'Glob src/**/*.tsx', 'Grep "password"', 'Grep "deprecated"'],
  run: ['$ npm test', '$ git status', '$ cargo build', '$ pytest -q', '$ docker compose up', '$ git diff --stat', '$ make lint', '$ go test ./...', '$ npm run build'],
  web: ['search "terminal sprites"', 'fetch docs.anthropic.com', 'fetch developer.mozilla.org', 'search "ansi truecolor"', 'Linear list_issues', 'GitHub get_pull_request'],
  delegate: ['→ Explore', '→ code-reviewer', '→ test-runner', '→ Plan', '→ security-reviewer'],
  think: ['thinking…'],
  talk: ['Found the bug!', 'Tests are green.', 'Refactoring next.', 'Need more coffee.', 'Ship it?', 'Looks good to me.', 'Hmm, flaky test.'],
  done: ['finished'],
  idle: ['waiting for you'],
  error: ['tool failed'],
};

const SUB_TYPES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['code-reviewer', ['Review auth flow', 'Review cart logic', 'Second opinion']],
  ['Explore', ['Explore codebase', 'Map the API', 'Find entry points']],
  ['Plan', ['Plan migration', 'Plan refactor', 'Draft roadmap']],
  ['test-runner', ['Run test suite', 'Fix flaky test', 'Add edge cases']],
  ['security-reviewer', ['Audit secrets', 'Check injections', 'Threat model']],
  ['general-purpose', ['Research options', 'Benchmark parser', 'Dig into logs']],
  ['docs-writer', ['Write docs', 'Update changelog', 'Polish README']],
];

const LEAD_MIX: ReadonlyArray<readonly [Activity, number]> = [
  ['write', 4], ['read', 3], ['search', 2], ['run', 3], ['web', 1], ['think', 2], ['talk', 1], ['delegate', 1.2], ['error', 0.3],
];
const SUB_MIX: ReadonlyArray<readonly [Activity, number]> = [
  ['write', 3], ['read', 4], ['search', 3], ['run', 3], ['web', 1.2], ['think', 2], ['talk', 0.8], ['error', 0.3],
];

const MAX_SUBS = 7;

type Sim = { info: AgentInfo; next: number; endsAt: number; doneUntil: number; nextSpawn: number; subType?: number };

// A scripted, deterministic crew so the stage can be shown without live data.
export class DemoSource implements AgentSource {
  readonly label = 'demo';
  private rng: Rng;
  private sims: Sim[] = [];
  private seq = 0;
  private last = new Map<string, AgentInfo>();
  private events: AgentEvent[] = [];

  constructor(seed = 1, start = Date.now()) {
    this.rng = new Rng(seed);
    this.lead('atlas', 'animus', start);
    this.lead('nova', 'webshop', start);
  }

  private lead(name: string, project: string, now: number): void {
    this.sims.push({
      info: { id: `demo-${name}`, name, role: 'lead', project, activity: 'think', detail: 'new task', since: now, lastSeen: now },
      next: now + this.rng.range(1500, 4000),
      endsAt: Infinity,
      doneUntil: Infinity,
      nextSpawn: now + this.rng.range(2500, 8000),
    });
  }

  private spawn(parent: Sim, now: number, typeIndex?: number): void {
    if (this.sims.filter((s) => s.info.role === 'sub').length >= MAX_SUBS) return;
    const ti = typeIndex ?? this.rng.int(0, SUB_TYPES.length - 1);
    const [agentType, names] = SUB_TYPES[ti];
    this.seq++;
    this.sims.push({
      info: {
        id: `demo-sub-${this.seq}`,
        name: this.rng.pick(names),
        role: 'sub',
        parentId: parent.info.id,
        project: parent.info.project,
        agentType,
        activity: 'think',
        detail: 'spinning up',
        since: now,
        lastSeen: now,
      },
      next: now + this.rng.range(1500, 3500),
      endsAt: now + this.rng.range(20000, 60000),
      doneUntil: Infinity,
      nextSpawn: Infinity,
      subType: ti,
    });
  }

  private change(s: Sim, activity: Activity, now: number): void {
    s.info.activity = activity;
    s.info.detail = this.rng.pick(DETAILS[activity]);
    s.info.since = now;
  }

  private step(now: number): void {
    for (const s of [...this.sims]) {
      s.info.lastSeen = now;
      if (s.info.role === 'sub') {
        if (now >= s.doneUntil) {
          this.sims.splice(this.sims.indexOf(s), 1);
          continue;
        }
        if (now >= s.endsAt && s.info.activity !== 'done') {
          this.change(s, 'done', now);
          s.doneUntil = now + 6000;
          continue;
        }
        if (s.info.activity === 'done') continue;
      } else if (now >= s.nextSpawn) {
        this.spawn(s, now);
        s.nextSpawn = now + this.rng.range(8000, 20000);
      }
      if (now < s.next) continue;
      if (s.info.role === 'lead' && s.info.activity !== 'idle' && this.rng.chance(0.1)) {
        this.change(s, 'idle', now);
        s.next = now + this.rng.range(6000, 15000);
        continue;
      }
      const act = this.rng.weighted(s.info.role === 'lead' ? LEAD_MIX : SUB_MIX);
      this.change(s, act, now);
      if (act === 'delegate') {
        const ti = SUB_TYPES.findIndex(([t]) => s.info.detail === `→ ${t}`);
        this.spawn(s, now, ti >= 0 ? ti : undefined);
      }
      s.next = now + (act === 'error' ? 1500 : this.rng.range(2000, 7000));
    }
  }

  poll(now: number): AgentInfo[] {
    this.step(now);
    const list = this.sims.map((s) => ({ ...s.info }));
    this.events.push(...diffEvents(this.last, list, now));
    this.last = new Map(list.map((a) => [a.id, a]));
    return list;
  }

  drainEvents(): AgentEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }
}
