import { ACTS, loopOf, once } from '../art/npc/acts.ts';
import type { Npc, NpcAct, WorldDef } from '../worlds/types.ts';
import type { Emote } from './character.ts';
import type { NpcFrame } from './frame.ts';
import type { Life } from './life.ts';
import { NPC_R } from './npc-place.ts';
import { Rng, hashString } from './rng.ts';
import type { PlacedNpc } from './room.ts';
import type { Actor } from './stage.ts';
import type { Spot } from './types.ts';

// The locals (see Npc in worlds/types.ts): three people who are not agents,
// each working one of a world's stations all the time. What each is doing:
// its work, always, and over it the acts life gives it, one after another
// (one lined up waits for the one under way, and so does a hand-over; a
// show waits for them all: nothing is cut off; none during a show): a wave
// for someone walking in, a cheer for a finish, a flinch at a bang,
// applause for a level-up. One with something to serve serves those who
// come for it in turn, one at a time, at its counter or beside it, and
// beckons the next one up (see Life's order and coffee errands); one with
// a show puts it on now and then, the idle agents free for it gathering
// round (see perform and Life.watch); an idle agent passing one free for a
// word may stop for one (see Life.natters). Everything comes from the
// world's seeded Rng and the life clock: a run plays the same every time.

// A serve is the shared hand-over (seconds). One whose turn it is at a
// counter (nobody served, nobody ahead of it) goes without if nothing is
// handed over within SERVE_WAIT: time for an act under way, or a beckon,
// first. It never goes while it is being served.
export const SERVE_S = ACTS.handOver.secs;
export const SERVE_WAIT = 2 * SERVE_S + 2;
// How far a bang carries to a local (units, as for the agents in life.ts).
const REACT_R = 40;
// At most this many acts lined up for a local.
const MAX_ACTS = 4;
// A word: an idle agent passing within NATTER_R of where a free local
// serves may stop (NATTER_CHANCE once a pass: no other roll for NATTER_LOOK
// seconds), at most once every NATTER_EVERY seconds an agent, for NATTER_S.
export const NATTER_R = 6;
export const NATTER_CHANCE = 0.35;
export const NATTER_LOOK = 8;
export const NATTER_EVERY = 60;
export const NATTER_S = 5;
// Shows: one every SHOW_EVERY seconds (the first as long in) while at
// least SHOW_MIN idle agents are awake (else a look again SHOW_RETRY
// later); it lasts SHOW_S; up to SHOW_MAX stand round it, APART from each
// other, joining as they come free (see Life.spare) until SHOW_JOIN before
// it ends.
export const SHOW_EVERY: readonly [number, number] = [120, 240];
export const SHOW_S = 20;
export const SHOW_MIN = 2;
const SHOW_MAX = 6;
const SHOW_RETRY = 10;
const SHOW_JOIN = 6;
const APART = 3;

// A local on duty: its art and where it stands (see PlacedNpc); its acts
// (the shared ones and its own, by the life clock: each from `at` to
// `until`, over its work; `begun` once an update has seen it under way)
// and the emotes over its head; those it serves in turn (`queue`, each
// where it stands: at the counter or beside it), the one it is serving and
// those it has served (until life lets them go); the show it is putting on
// (the spots of its ring, and who has each: `crowd[i]` at `ring[i]`, null
// while it is free), and the agent it is having a word with.
export type Local = {
  k: number;
  art: Npc;
  at: PlacedNpc;
  acts: Array<{ act: NpcAct; at: number; until: number; begun?: boolean }>;
  emotes: Array<{ e: Emote; born: number; until: number }>;
  queue: Array<{ id: string; spot: Spot }>;
  serving: { id: string; until: number } | null;
  served: Set<string>;
  show: { until: number; ring: Spot[]; crowd: Array<string | null> } | null;
  natter: { id: string; until: number } | null;
};

// What the locals need from the stage: whether one may stand at a spot
// (to be served there), and whether a show's watcher may (clear of the
// agents at their workstations too).
export type LocalsHost = { standable(s: Spot): boolean; watchable(s: Spot): boolean };

const frac = (v: number) => v - Math.floor(v);
const dist = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
// `xs` without what `keep` turns down: the same array when it keeps it all.
const kept = <T>(xs: T[], keep: (x: T) => boolean): T[] => (xs.every(keep) ? xs : xs.filter(keep));
// Whether a local at `at` works its station: every one but the way in,
// whose door opens only for those who pass.
const works = (at: PlacedNpc) => at.station !== 'entrance';

export class Locals {
  readonly all: Local[];
  // The room's props the locals work (see works).
  readonly worked: ReadonlySet<number>;
  // Life clock time of the next show (see perform).
  nextShow: number;
  private rng: Rng;
  private host: LocalsHost;

  constructor(world: WorldDef, placed: readonly PlacedNpc[], host: LocalsHost, clock: number) {
    const arts = world.npcs ?? [];
    this.all = placed.map((at) => ({ k: at.k, art: arts[at.k], at, acts: [], emotes: [], queue: [], serving: null, served: new Set<string>(), show: null, natter: null }));
    this.worked = new Set(placed.filter(works).map((at) => at.prop));
    this.rng = new Rng(hashString(world.id) ^ 0x10ca1);
    this.host = host;
    this.nextShow = clock + this.rng.range(SHOW_EVERY[0], SHOW_EVERY[1]);
  }

  // Local k (an index into its world's), if it is on duty.
  of(k: number): Local | undefined {
    return this.all.find((l) => l.k === k);
  }

  // ── serving ───────────────────────────────────────────────────────────
  // The nearest local with something to serve (a drink, for `drink`), no
  // show or word on and room at its counter.
  counter(a: Spot, drink = false): number | null {
    let best: Local | null = null;
    for (const l of this.all) {
      const s = l.art.serve;
      if (!s || (drink && !s.drink) || l.show || l.natter || !this.spotFor(l)) continue;
      if (!best || dist(l.at, a) < dist(best.at, a)) best = l;
    }
    return best ? best.k : null;
  }

  // `a` takes its place at local k's counter: where to stand, or null when
  // there is no room (or a show or a word is on).
  join(k: number, a: Actor): Spot | null {
    const l = this.of(k);
    const spot = l && !l.show && !l.natter ? this.spotFor(l) : null;
    if (!l || !spot) return null;
    l.queue.push({ id: a.info.id, spot });
    return spot;
  }

  // `a` is done with local k: out of its queue (its hand-over goes with
  // it), its show's crowd or its word.
  leave(k: number, a: Actor): void {
    const l = this.of(k);
    if (!l) return;
    const id = a.info.id;
    l.queue = l.queue.filter((q) => q.id !== id);
    l.served.delete(id);
    if (l.serving?.id === id) {
      l.serving = null;
      l.acts = l.acts.filter((q) => q.act !== 'handOver');
    }
    if (l.show) l.show.crowd = l.show.crowd.map((q) => (q === id ? null : q));
    if (l.natter?.id === id) l.natter = null;
  }

  // Whether local k has handed `a` what it serves.
  served(k: number, a: Actor): boolean {
    return !!this.of(k)?.served.has(a.info.id);
  }

  // Whether it is `a`'s turn at local k's counter: nobody being served,
  // and nobody ahead of it still to be. Its patience counts only then (see
  // SERVE_WAIT).
  turn(k: number, a: Actor): boolean {
    const l = this.of(k);
    if (!l || l.serving) return false;
    return l.queue.find((q) => !l.served.has(q.id))?.id === a.info.id;
  }

  // Whether what local k serves is a drink.
  drink(k: number): boolean {
    return !!this.of(k)?.art.serve?.drink;
  }

  // ── shows and words ───────────────────────────────────────────────────
  // The nearest local free for a word (nothing under way or lined up,
  // nobody served or waiting, no show, no word on) whose counter (or
  // itself, with none) is within NATTER_R of `a`.
  near(a: Spot, c: number): number | null {
    let best: Local | null = null;
    let bd = NATTER_R;
    for (const l of this.all) {
      if (l.queue.length || l.serving || l.show || l.natter || l.acts.some((q) => q.until > c)) continue;
      const d = dist(l.at.front ?? l.at, a);
      if (d < bd) {
        best = l;
        bd = d;
      }
    }
    return best ? best.k : null;
  }

  // A word with `a` (see Life.natters): it answers, a speech mark and
  // talking, then nods and laughs.
  natter(k: number, a: Actor, c: number): void {
    const l = this.of(k);
    if (!l) return;
    l.natter = { id: a.info.id, until: c + NATTER_S };
    l.acts.push({ act: 'talk', at: c + 1.3, until: c + 1.3 + ACTS.talk.secs }, { act: 'nod', at: c + 3.2, until: c + 3.2 + ACTS.nod.secs });
    this.emote(l, 'speech', c + 1.3, 1.5);
    this.emote(l, 'note', c + 3.2, 1.4);
  }

  // ── what life tells them ──────────────────────────────────────────────
  // Someone walked in (at `a`): the local nearest the way in waves, first;
  // each of the others waves or nods about half the time, a moment later.
  greet(a: Spot, c: number): void {
    let door: Local | null = null;
    for (const l of this.all) if (!door || dist(l.at, a) < dist(door.at, a)) door = l;
    for (const l of this.all) {
      if (l === door) this.react(l, 'wave', c, this.rng.range(0.2, 0.4));
      else if (this.rng.chance(0.5)) this.react(l, this.rng.chance(0.5) ? 'wave' : 'nod', c, this.rng.range(0.5, 1.2));
    }
  }

  // Someone finished: every local celebrates, its own way where it has one
  // (see Npc.celebrate), a star or a heart over it.
  celebrate(c: number): void {
    for (const l of this.all) {
      const d = this.rng.range(0.1, 0.6);
      if (this.react(l, l.art.celebrate ? 'celebrate' : 'cheer', c, d)) this.emote(l, this.rng.chance(0.5) ? 'star' : 'heart', c + d, 1.6);
    }
  }

  // A bang at (x, y): those near flinch with a start, then look (a '!').
  flinch(x: number, y: number, c: number): void {
    for (const l of this.all) {
      if (dist(l.at, { x, y }) > REACT_R) continue;
      const d = this.rng.range(0, 0.15);
      if (this.react(l, 'flinch', c, d)) this.emote(l, 'excl', c + d + 0.3, 1.6);
    }
  }

  // Someone's role levelled up: they applaud.
  applaud(c: number): void {
    for (const l of this.all) this.react(l, 'applaud', c, this.rng.range(0.1, 0.5));
  }

  // ── per frame ─────────────────────────────────────────────────────────
  // Acts and emotes over are dropped and those gone let go; a show over
  // ends with a bow, one under way draws those come free; the first there
  // of those waiting is served; a show starts when one is due (see
  // perform). What is under way now has begun (see serve).
  update(life: Life, actors: readonly Actor[]): void {
    const c = life.clock;
    const here = (id: string) => life.actor(id) !== undefined;
    for (const l of this.all) {
      l.acts = kept(l.acts, (q) => q.until > c);
      l.emotes = kept(l.emotes, (e) => e.until > c);
      l.queue = kept(l.queue, (q) => here(q.id));
      for (const id of l.served) if (!here(id)) l.served.delete(id);
      if (l.natter && (c >= l.natter.until || !here(l.natter.id))) l.natter = null;
      if (l.show && c >= l.show.until) {
        l.show = null;
        this.react(l, 'nod', c, 0);
        this.emote(l, 'heart', c, 1.6);
      }
      if (l.show) {
        const show = l.show;
        if (!show.crowd.every((id) => id === null || here(id))) show.crowd = show.crowd.map((id) => (id !== null && here(id) ? id : null));
        this.gather(l, life, actors, c);
      }
      this.serve(l, c, life);
      for (const q of l.acts) if (q.at <= c) q.begun = true;
    }
    if (c >= this.nextShow && !this.all.some((l) => l.show)) this.perform(life, actors, c);
  }

  // What local l is doing at life clock c, and the frame of it: the act
  // under way (a show loops, the rest play once, ending on their last
  // frame), else its work, each local at a phase of its own so the three
  // are not in step.
  doing(l: Local, c: number): { act: NpcAct; frame: number } {
    const a = l.acts.find((q) => q.at <= c && c < q.until);
    if (!a) {
      const w = l.art.work;
      return { act: 'work', frame: Math.floor(frac(c / w.secs + l.k * 0.37) * w.frames) % w.frames };
    }
    const lp = loopOf(l.art, a.act);
    const k = (c - a.at) / lp.secs;
    return { act: a.act, frame: once(a.act) ? Math.min(lp.frames - 1, Math.floor(k * lp.frames)) : Math.floor(frac(k) * lp.frames) % lp.frames };
  }

  // The locals as a frame shows them (see NpcFrame).
  frames(c: number): NpcFrame[] {
    return this.all.map((l) => {
      const p = l.at;
      const { act, frame } = this.doing(l, c);
      const f: NpcFrame = { k: l.k, x: p.x, y: p.y, z: p.z, top: p.z + l.art.tall, facing: p.facing, act, frame, prop: p.prop, on: p.mode !== 'standing', works: works(p), shadow: p.mode === 'standing' };
      if (p.cut !== undefined) f.cut = { h: p.cut, slope: p.wall === 'right' ? 0.5 : -0.5 };
      const e = l.emotes.find((q) => q.born <= c && c < q.until);
      if (e) f.emote = { kind: e.e, t: c - e.born };
      return f;
    });
  }

  // Where the next one local l serves would stand: at its counter, or
  // beside it, whichever is free of the queue and standable; else null.
  private spotFor(l: Local): Spot | null {
    for (const s of [l.at.front, l.at.wait]) if (s && !l.queue.some((q) => q.spot === s) && this.host.standable(s)) return s;
    return null;
  }

  // A serve over: that one is served, and with another waiting there the
  // turn moves on: l beckons it up. Then, while nothing has begun (an act
  // that only now came due waits instead), no show or word is on, the
  // first of those waiting who is there gets a hand-over; whatever l had
  // lined up waits for that.
  private serve(l: Local, c: number, life: Life): void {
    const next = () =>
      l.queue.find((q) => {
        const a = life.actor(q.id);
        return !!a && !l.served.has(q.id) && !a.path.length && dist(a, q.spot) < 1.5;
      });
    if (l.serving && c >= l.serving.until) {
      l.served.add(l.serving.id);
      l.serving = null;
      if (next()) this.lead(l, 'beckon', c);
    }
    if (l.serving || l.show || l.natter || l.acts.some((q) => q.begun)) return;
    const n = next();
    if (!n) return;
    this.lead(l, 'handOver', c);
    l.serving = { id: n.id, until: c + SERVE_S };
  }

  // A show (see SHOW_EVERY): with SHOW_MIN idle agents awake, a local with
  // a show and nothing on (nobody served or waiting, no word, no act under
  // way or lined up) starts it, and those free for it gather round (see
  // gather). Nobody to give one, too few awake or no room for a ring: it
  // looks again a little later.
  private perform(life: Life, actors: readonly Actor[], c: number): void {
    const awake = actors.filter((a) => a.info.activity === 'idle' && a.state !== 'enter' && a.state !== 'leave' && !a.gone && !life.sleeping(a));
    const cast = this.all.filter((l) => l.art.show && !l.queue.length && !l.serving && !l.natter && !l.acts.length);
    const l = awake.length >= SHOW_MIN && cast.length ? this.rng.pick(cast) : null;
    const show = l?.art.show;
    const ring = l ? ringRound(l.at.ring, l.at, SHOW_MAX, (s) => this.host.watchable(s) && this.offDuty(s, l)) : [];
    if (!l || !show || !ring.length) {
      this.nextShow = c + SHOW_RETRY;
      return;
    }
    this.nextShow = c + this.rng.range(SHOW_EVERY[0], SHOW_EVERY[1]);
    const until = c + SHOW_S;
    l.acts.push({ act: 'show', at: c, until, begun: true });
    l.show = { until, ring, crowd: ring.map(() => null) };
    this.emote(l, show.crowd === 'dance' ? 'note' : 'star', c, 1.6);
    this.gather(l, life, actors, c);
  }

  // Whether a watcher of local l's show may stand at s for the others:
  // APART from where each serves (one that does) and from where one
  // standing stands.
  private offDuty(s: Spot, l: Local): boolean {
    for (const o of this.all) {
      if (o === l) continue;
      if (o.art.serve && [o.at.front, o.at.wait].some((q) => q && dist(q, s) < APART)) return false;
      if (o.at.mode === 'standing' && dist(o.at, s) < NPC_R + APART) return false;
    }
    return true;
  }

  // The idle agents free for it (see Life.spare) join local l's show, the
  // nearest first, each to a free spot of its ring (see Life.watch; one
  // left by a watcher is free again), until SHOW_JOIN before it ends.
  private gather(l: Local, life: Life, actors: readonly Actor[], c: number): void {
    const show = l.show;
    if (!show || c > show.until - SHOW_JOIN || !show.crowd.includes(null)) return;
    const far = (a: Actor) => dist(a, l.at.ring);
    const free = actors.filter((a) => !show.crowd.includes(a.info.id) && life.spare(a)).sort((p, q) => far(p) - far(q));
    for (const a of free) {
      const i = show.crowd.indexOf(null);
      if (i < 0) break;
      life.watch(a, l.k, show.ring[i], show.until);
      show.crowd[i] = a.info.id;
    }
  }

  // Starts `act` for l now, ahead of all it has lined up (each put back as
  // long), begun: a hand-over waits for it.
  private lead(l: Local, act: NpcAct, c: number): void {
    const secs = loopOf(l.art, act).secs;
    for (const q of l.acts) {
      q.at += secs;
      q.until += secs;
    }
    l.acts.unshift({ act, at: c, until: c + secs, begun: true });
  }

  // Lines `act` up for l, `delay` from now or once all it has lined up is
  // over, whichever is later (nothing under way is cut off); none during a
  // show, none past MAX_ACTS. Whether it was.
  private react(l: Local, act: NpcAct, c: number, delay: number): boolean {
    if (l.show || l.acts.length >= MAX_ACTS) return false;
    const at = Math.max(c + delay, ...l.acts.map((q) => q.until));
    l.acts.push({ act, at, until: at + loopOf(l.art, act).secs });
    return true;
  }

  // Shows `e` over l from `born`, for `secs`.
  private emote(l: Local, e: Emote, born: number, secs: number): void {
    l.emotes.push({ e, born, until: born + secs });
    if (l.emotes.length > 3) l.emotes.shift();
  }
}

// Up to n spots round `c` for a crowd watching a show at `to`: 5 units out
// (then further), the side away from it first and round either way, but
// never across the side toward it (a ring open to the show), each one
// fine (`ok`: see perform) and APART from the others.
function ringRound(c: Spot, to: Spot, n: number, ok: (s: Spot) => boolean): Spot[] {
  const out: Spot[] = [];
  const away = Math.atan2(c.y - to.y, c.x - to.x);
  for (const r of [5, 7.5, 10]) {
    for (let k = 0; k <= 12 && out.length < n; k++) {
      const a = away + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 8);
      const s = { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r };
      if (out.every((o) => dist(o, s) >= APART) && ok(s)) out.push(s);
    }
  }
  return out;
}
