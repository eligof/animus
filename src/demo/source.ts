import type { Activity, AgentEvent, AgentInfo, AgentSource, Bubble, Gain, Vitals } from '../agents.ts';
import { diffEvents } from '../agents.ts';
import { isCheck } from '../claude/gains.ts';
import { roleOf } from '../pet/crew.ts';
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

const TITLES = ['Fix the tokenizer edge case', 'Add dark mode to settings', 'Speed up the test suite', 'Ship the checkout flow', 'Tidy the auth module'];
const BRANCHES = ['main', 'feat/checkout', 'fix/tokenizer', 'perf/tests', 'chore/auth'];
const WINDOW = 200_000;
const TOOLS: ReadonlySet<Activity> = new Set(['write', 'read', 'search', 'run', 'web']);
// A wait for "you" this long is a rest in the demo: the next task starts a
// new working stretch. A real session rests after REST_MS (two minutes) of
// quiet, but the demo's day runs fast (its leads wait 25 to 45 s every
// minute or two), so a wait this long stands in for that rest, and a
// shorter pause would not.
const DEMO_REST_MS = 20_000;

// What the demo crew says (made up, like the crew). Some summaries run
// long, so the chat window has something to fold.
const OPENERS = ["On it. I'll start by reading the code around it.", 'Sure. Let me look at how it works today first.', 'Okay, starting with the tests to see what fails.'];
const TASKS = ['report back what you find, with file paths.', 'keep it short: the three things that matter most.', 'change nothing; tell me what you would do.'];
const SUMMARIES = [
  'Done. The tokenizer dropped the last character whenever a line ended in an escaped quote: the scanner stepped past the backslash and then again past the quote, so the closing quote was never seen.\n\nI changed it to take the escape as one step and added three tests (an escaped quote at the end of a line, in the middle, and doubled). The whole suite passes: 214 tests.\n\nWant me to look at the other scanners that copy this loop?',
  'Dark mode is in. Settings has a new Appearance section with light, dark and system; the choice is saved per user and applied before the first paint, so there is no flash.\n\nI moved the colours into CSS variables in one file and checked the contrast of every text colour against both backgrounds.',
  'The test suite now runs in 41 s instead of 3 min 10 s. Most of the time went to one fixture that rebuilt the database for every test; it now builds it once per worker and rolls back after each test.\n\nTwo tests depended on the order they ran in. I fixed both. Nothing else changed.',
  'Checkout works end to end in the staging build: cart, address, payment, confirmation. I left the coupon field behind a flag because its rules are not settled yet.',
  'Tests are green and the change is small. Ready for you to look at.',
];
const FOLLOW_UPS = ['Nice. Can you add a test for the empty case too?', 'Looks good. Now tidy up the naming in that module.', 'Great, ship it. Then look at the flaky test in CI.', 'Thanks. What would it take to do the same for the API?'];
const REPORTS = [
  'Found it: the retry loop in client.ts never resets its counter, so after three failures every later request gives up at once. A one-line fix; I changed nothing.',
  'Three things: the session token is logged at debug level, the reset link never expires, and the password check is not constant time. The first is the one to fix today.',
  'Mapped the API: 14 routes in four files. Everything goes through router.go; the two odd ones out are the webhooks, which skip the auth middleware on purpose.',
  'All 214 tests pass on a clean checkout. The flaky one is cart.test.ts: it depends on the clock and fails just after midnight.',
];
// Entries kept per agent.
const MAX_CHAT = 200;

// The demo's crews start some way along (XP by crew and role), so the demo
// shows what growth looks like: atlas's lead is at ★10 with every unlock,
// its crew at levels from ★1 to ★8, and nova's lead is fifteen XP short of
// ★4, which its first finished turn brings within a minute (with the
// world's seed, 7).
export const DEMO_XP: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  'demo:animus': { lead: 33_000, 'code-reviewer': 8_400, 'docs-writer': 2_100, Explore: 1_150, Plan: 520, 'test-runner': 260, 'security-reviewer': 130, 'general-purpose': 40 },
  'demo:webshop': { lead: 485, 'security-reviewer': 4_100, 'test-runner': 1_020, Explore: 260, 'general-purpose': 150, 'code-reviewer': 96, 'docs-writer': 30, Plan: 0 },
};

type Sim = { info: AgentInfo; next: number; endsAt: number; doneUntil: number; nextSpawn: number; idleAt: number; subType?: number; vitals: Vitals; chat: Bubble[]; waits: number };

// A scripted, deterministic crew so the stage can be shown without live data.
export class DemoSource implements AgentSource {
  readonly label = 'demo';
  private rng: Rng;
  // Vitals draw from their own stream so the crew's moves stay as they were.
  private vrng: Rng;
  // And their conversations from a third.
  private crng: Rng;
  private said = 0;
  private sims: Sim[] = [];
  private seq = 0;
  private last = new Map<string, AgentInfo>();
  private events: AgentEvent[] = [];
  private gains: Gain[] = [];

  constructor(seed = 1, start = Date.now()) {
    this.rng = new Rng(seed);
    this.vrng = new Rng(seed * 7919 + 1);
    this.crng = new Rng(seed * 104729 + 3);
    this.lead('atlas', 'animus', start);
    this.lead('nova', 'webshop', start);
  }

  // A fresh agent's vitals: some way into a working stretch already, so
  // the crew's energy differs from the start.
  private born(lead: boolean, now: number): Vitals {
    const r = this.vrng;
    return {
      model: lead ? 'claude-opus-5-5' : 'claude-sonnet-5-5',
      window: WINDOW,
      context: Math.round(r.range(15_000, 60_000)),
      outTokens: Math.round(r.range(500, 4_000)),
      errors: [],
      streak: r.int(0, 6),
      turnEndedAt: 0,
      busySince: now - Math.round(r.range(0, 40 * 60_000)),
      lastAt: now,
      midTool: false,
      title: lead ? TITLES[r.int(0, TITLES.length - 1)] : '',
      branch: lead ? BRANCHES[r.int(0, BRANCHES.length - 1)] : '',
    };
  }

  private lead(name: string, project: string, now: number): void {
    this.sims.push({
      info: { id: `demo-${name}`, name, role: 'lead', project, activity: 'think', detail: 'new task', since: now, lastSeen: now, crew: `demo:${project}` },
      next: now + this.rng.range(1500, 4000),
      endsAt: Infinity,
      doneUntil: Infinity,
      nextSpawn: now + this.rng.range(2500, 8000),
      idleAt: now + this.rng.range(15000, 45000), // the first wait comes early
      vitals: this.born(true, now),
      chat: [],
      waits: 0,
    });
    const sim = this.sims[this.sims.length - 1];
    this.say(sim, 'user', sim.vitals.title, now);
    this.say(sim, 'agent', this.crng.pick(OPENERS), now);
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
        crew: parent.info.crew,
      },
      next: now + this.rng.range(6000, 9000), // spinning up: time for a kick-off huddle round its lead
      endsAt: now + this.rng.range(20000, 60000),
      doneUntil: Infinity,
      nextSpawn: Infinity,
      idleAt: Infinity,
      subType: ti,
      vitals: this.born(false, now),
      chat: [],
      waits: 0,
    });
    const sim = this.sims[this.sims.length - 1];
    this.say(sim, 'user', `${sim.info.name}: ${this.crng.pick(TASKS)}`, now);
  }

  private change(s: Sim, activity: Activity, now: number): void {
    const was = s.info.activity;
    const waited = was === 'idle' ? now - s.info.since : 0;
    s.info.activity = activity;
    s.info.detail = this.rng.pick(DETAILS[activity]);
    s.info.since = now;
    const v = s.vitals;
    const r = this.vrng;
    v.lastAt = now;
    v.outTokens += Math.round(r.range(200, 1_500));
    // Context fills as it works; near full, it compacts back down.
    v.context += Math.round(r.range(2_000, 9_000));
    if (v.context > WINDOW * 0.95) v.context = Math.round(r.range(20_000, 35_000));
    if (activity === 'error') {
      v.streak = 0;
      v.errors.push(now);
    } else if (TOOLS.has(activity)) v.streak++;
    v.errors = v.errors.filter((e) => now - e <= 600_000);
    if (activity === 'idle' || activity === 'done') v.turnEndedAt = now;
    v.midTool = TOOLS.has(activity) || activity === 'delegate';
    if (activity !== 'idle' && waited >= DEMO_REST_MS) v.busySince = now;
    this.converse(s, was, activity, now);
    this.earn(s, activity, now);
  }

  // What earns its crew XP, as a live transcript would show it: a lead's
  // turn ending (it waits for you), a build or test that runs (a failing
  // one shows as an error instead), a subagent's run done.
  private earn(s: Sim, activity: Activity, now: number): void {
    const a = s.info;
    const gain = (kind: Gain['kind'], key: string) => this.gains.push({ agent: a.id, at: now, key, crew: a.crew ?? '', role: roleOf(a), kind });
    if (activity === 'idle' && a.role === 'lead') gain('turn', `turn:${now}`);
    else if (activity === 'run' && isCheck(a.detail.replace(/^\$ /, ''))) gain('check', `check:${now}`);
    else if (activity === 'done' && a.role === 'sub') gain('subagent', 'finish');
  }

  drainGains(): Gain[] {
    const g = this.gains;
    this.gains = [];
    return g;
  }

  // The conversation it would have had: your next request when a lead
  // starts again, a step per tool call, a mark where it thought, a word
  // when it talks, a summary when it stops.
  private converse(s: Sim, was: Activity, activity: Activity, now: number): void {
    const r = this.crng;
    if (s.info.role === 'lead' && was === 'idle' && activity !== 'idle') this.say(s, 'user', r.pick(FOLLOW_UPS), now);
    switch (activity) {
      case 'think':
        this.say(s, 'thinking', '', now);
        return;
      case 'talk':
        this.say(s, 'agent', s.info.detail, now);
        return;
      case 'idle':
        this.say(s, 'agent', r.pick(SUMMARIES), now);
        return;
      case 'done':
        this.say(s, 'agent', r.pick(REPORTS), now);
        return;
      case 'error':
        this.say(s, 'tool', r.pick(DETAILS.run), now, 'run', 'failed');
        return;
      default:
        this.say(s, 'tool', s.info.detail, now, activity, 'ok');
    }
  }

  private say(s: Sim, kind: Bubble['kind'], text: string, now: number, activity?: Activity, outcome?: Bubble['outcome']): void {
    if (kind === 'thinking' && s.chat[s.chat.length - 1]?.kind === 'thinking') return;
    const b: Bubble = { id: `${s.info.id}:${++this.said}`, kind, text, at: now };
    if (activity) b.activity = activity;
    if (outcome) b.outcome = outcome;
    s.chat.push(b);
    if (s.chat.length > MAX_CHAT) s.chat.splice(0, s.chat.length - MAX_CHAT);
  }

  // An agent's conversation so far (null: not one of the crew).
  chat(id: string): readonly Bubble[] | null {
    return this.sims.find((s) => s.info.id === id)?.chat ?? null;
  }

  // Make-believe agents have no session to post into.
  reach(_id: string): string | null {
    return 'demo agents take no messages';
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
        // On every other wait of its lead (the first, the third, …) the team
        // waits with it, and goes on when the lead does: a crew waiting
        // together, time for a stand-up.
        const lead = this.sims.find((p) => p.info.id === s.info.parentId);
        if (lead?.info.activity === 'idle' && lead.waits % 2 === 1) {
          if (s.info.activity !== 'idle') {
            this.change(s, 'idle', now);
            s.info.detail = `waiting for ${lead.info.name}`;
          }
          continue;
        }
        if (s.info.activity === 'idle') s.next = Math.min(s.next, now);
      } else if (now >= s.nextSpawn) {
        this.spawn(s, now);
        s.nextSpawn = now + this.rng.range(8000, 20000);
      }
      if (now < s.next) continue;
      // Leads wait for "you" every minute or two, long enough to wander,
      // chat and help build.
      if (now >= s.idleAt) {
        s.waits++; // (its team waits with it on odd ones, see above)
        this.change(s, 'idle', now);
        s.next = now + this.rng.range(25000, 45000);
        s.idleAt = now + this.rng.range(60000, 120000);
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
    const list = this.sims.map((s) => ({ ...s.info, vitals: { ...s.vitals, errors: [...s.vitals.errors] } }));
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
