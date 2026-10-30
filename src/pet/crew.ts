import { createHash } from 'node:crypto';
import type { AgentInfo, Gain } from '../agents.ts';

// Growth: a crew per project, its agents kept by role (the lead, and each
// subagent type), each growing with XP from real work (see
// claude/gains.ts): a finished turn of the lead's, a build or test command
// that passed, a subagent that finished its run. Failures cost nothing.
// Levels come at 100, 250, 500 and 1000 XP, then at each doubling; some
// unlock something to wear or show. All of it is cosmetic.

export type GainKind = Gain['kind'];
export const POINTS: Record<GainKind, number> = { turn: 10, check: 5, subagent: 3 };

const STEPS = [100, 250, 500, 1000];
const MAX_LEVEL = 99;

// The XP that reaches `level` (★1 from the start).
export function xpFor(level: number): number {
  if (level <= 1) return 0;
  if (level - 2 < STEPS.length) return STEPS[level - 2];
  return STEPS[STEPS.length - 1] * 2 ** (level - 1 - STEPS.length);
}

export function levelOf(xp: number): number {
  let n = 1;
  while (n < MAX_LEVEL && xp >= xpFor(n + 1)) n++;
  return n;
}

// What a level unlocks, each kept from then on: a hat from the world's
// costume set, a badge on the shirt, an upgrade on its own workstation
// (a plant, a steaming mug or a trophy), its outfit in other colours, a
// soft aura.
export type Unlocks = { hat: boolean; badge: boolean; desk: boolean; outfit: boolean; aura: boolean };
export const UNLOCKS: ReadonlyArray<readonly [keyof Unlocks, number]> = [
  ['hat', 2],
  ['badge', 3],
  ['desk', 5],
  ['outfit', 8],
  ['aura', 10],
];

export function unlocks(level: number): Unlocks {
  const u: Unlocks = { hat: false, badge: false, desk: false, outfit: false, aura: false };
  for (const [what, at] of UNLOCKS) u[what] = level >= at;
  return u;
}

// The role an agent is kept under in its crew: the lead, or its subagent
// type (Claude Code's default type when it has none).
export function roleOf(a: Pick<AgentInfo, 'role' | 'agentType'>): string {
  return a.role === 'lead' ? 'lead' : (a.agentType || 'general-purpose').slice(0, 64);
}

// ── the ledger ──────────────────────────────────────────────────────────
// Each crew is kept under a hash of its project's path (crews.json holds
// no paths), each role with its XP and when it last earned any (`seen`,
// ms): nothing from a transcript.
export type RoleRec = { xp: number; seen: number };
export type CrewBook = Record<string, Record<string, RoleRec>>;

// A table keyed by names from outside (a subagent type, a crew's hash): it
// has no prototype, so a role called `constructor` or `__proto__` is a name
// like any other, not something every object has.
export function table<T>(): Record<string, T> {
  return Object.create(null);
}

// What one counted gain did: the role's XP and level after it, and the
// level before.
export type Award = { crew: string; role: string; xp: number; level: number; was: number; at: number };

// At most this many crews (the least recently seen go first) and roles a
// crew (a role past it earns nothing).
export const MAX_CREWS = 200;
export const MAX_ROLES = 64;
// Agents whose last counted event is remembered, at most.
export const MAX_MARKS = 5000;
// The latest time a date can hold (ms): a later one could never be saved.
const MAX_TIME = 8.64e15;

// When a crew last earned anything (0: never).
export function lastSeen(roles: Record<string, RoleRec>): number {
  let t = 0;
  for (const r of Object.values(roles)) t = Math.max(t, r.seen);
  return t;
}

const keys = new Map<string, string>();

// The key a crew is kept under: a hash of its project's path.
export function crewKey(crew: string): string {
  let k = keys.get(crew);
  if (!k) {
    k = createHash('sha256').update(crew).digest('hex').slice(0, 16);
    if (keys.size >= 1000) keys.clear();
    keys.set(crew, k);
  }
  return k;
}

// Counts gains into the book, each once. A transcript is read again from
// its tail when animus starts, or when its session comes back, so the same
// events come round again. Within a run, each agent's latest counted event
// (its time, and the keys counted at that time) is remembered: an event no
// later than that was counted. Across runs, each role's `seen` as loaded
// is a floor: anything counted before was no later than it. So an event is
// never counted twice; one that happened while animus was off is counted
// on the next start, as long as the tail still holds it.
export class Crews {
  private book: CrewBook;
  private floor = new Map<string, number>();
  // Each agent's mark, and the crew and role (as `floor` keys them) it
  // counted under.
  private marks = new Map<string, { at: number; keys: Set<string>; under: string }>();

  constructor(book: CrewBook = {}) {
    // A copy, in tables of its own.
    this.book = table();
    for (const [k, roles] of Object.entries(book)) {
      const mine = (this.book[k] = table<RoleRec>());
      for (const [role, r] of Object.entries(roles)) {
        mine[role] = { xp: r.xp, seen: r.seen };
        this.floor.set(`${k}\n${role}`, r.seen);
      }
    }
  }

  // Counts `g` if it was not counted before; says what it did (null: not
  // counted).
  count(g: Gain): Award | null {
    const points = Object.hasOwn(POINTS, g.kind) ? POINTS[g.kind] : 0;
    // No time at all (0 or less), or one past what a date holds, which
    // would make every later save fail.
    if (!points || !(g.at > 0 && g.at <= MAX_TIME) || !g.crew || !g.role) return null;
    // Saved to the millisecond, so a fraction (a file's mtime) is rounded
    // up: read back after a restart, the same event is no later than `seen`.
    const at = Math.ceil(g.at);
    const k = crewKey(g.crew);
    const under = `${k}\n${g.role}`;
    if (at <= (this.floor.get(under) ?? -Infinity)) return null;
    const m = this.marks.get(g.agent);
    if (m && (at < m.at || (at === m.at && m.keys.has(g.key)))) return null;
    let roles = this.book[k];
    if (!roles) {
      this.makeRoom();
      roles = this.book[k] = table();
    }
    let r = roles[g.role];
    if (!r) {
      if (Object.keys(roles).length >= MAX_ROLES) return null;
      r = roles[g.role] = { xp: 0, seen: 0 };
    }
    if (!m || at > m.at) {
      this.marks.delete(g.agent);
      if (this.marks.size >= MAX_MARKS) this.forget();
      this.marks.set(g.agent, { at, keys: new Set([g.key]), under });
    } else m.keys.add(g.key);
    const was = levelOf(r.xp);
    r.xp += points;
    r.seen = Math.max(r.seen, at);
    return { crew: g.crew, role: g.role, xp: r.xp, level: levelOf(r.xp), was, at };
  }

  xp(crew: string, role: string): number {
    return this.book[crewKey(crew)]?.[role]?.xp ?? 0;
  }

  level(crew: string, role: string): number {
    return levelOf(this.xp(crew, role));
  }

  // Sets a role's XP outright (the demo's crew starts some way along).
  give(crew: string, role: string, xp: number): void {
    const roles = (this.book[crewKey(crew)] ??= table());
    roles[role] = { xp, seen: roles[role]?.seen ?? 0 };
  }

  // The book as it stands, to save.
  data(): CrewBook {
    return this.book;
  }

  // One agent too many to remember: the one longest without a newer event
  // goes. Everything it counted was no later than its mark, so its role's
  // floor rises to that: its transcript read again counts nothing.
  private forget(): void {
    const [agent, m] = this.marks.entries().next().value!;
    this.marks.delete(agent);
    this.floor.set(m.under, Math.max(this.floor.get(m.under) ?? -Infinity, m.at));
  }

  // One crew too many: the least recently seen goes.
  private makeRoom(): void {
    const ks = Object.keys(this.book);
    if (ks.length < MAX_CREWS) return;
    let oldest = ks[0];
    let when = Infinity;
    for (const k of ks) {
      const t = lastSeen(this.book[k]);
      if (t < when) [oldest, when] = [k, t];
    }
    delete this.book[oldest];
  }
}
