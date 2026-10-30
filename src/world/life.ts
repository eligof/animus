import type { RGB } from '../term/color.ts';
import { hex } from '../term/color.ts';
import type { Block, Construction, Works } from './build.ts';
import type { Emote, Pose } from './character.ts';
import type { Critter } from './critter.ts';
import { Rng, hashString } from './rng.ts';
import type { Actor } from './stage.ts';
import type { Facing, Particle, Poi, Spot } from './types.ts';

// The life between the work: idle characters wander between the spots
// they like (a seat, a drink, a view, the dance floor, the fire, the
// critter), chat with each other, pet the critter and help build; workers
// stretch, sip and look round now and then; everyone waves, flinches at a
// bang and cheers a finish. And office life (the o key turns it off): a
// kick-off huddle round a lead that has just started subagents, coffee
// runs, a high-five when a subagent finishes, a stand-up when a crew waits.
// Every choice comes from the character's own seeded Rng, so a scene plays
// out the same way every time.

export type { Spot };

export const SLEEP_AFTER = 150; // seconds idle before a nap: awake long enough to wander, chat and build
const WANDER = 0.7; // walking pace idling about, of the normal pace
const HAUL = 0.85;
const MAX_HAULERS = 4;
const REACT_R = 40; // how far a bang or a cheer carries, units
const CHEER_R = 70; // everyone this near a build cheers it finished, and each quarter of the way
const CHAT_GAP = 5; // units between two chatting characters
const CHAT_EMOTES: readonly Emote[] = ['note', 'heart', 'idea', 'question'];
const APART = 3; // units between two standing in a ring or round a lead, at least (see around)
// Office life. A huddle: subagents a lead starts within HUDDLE_JOIN seconds
// of the first gather round it (at most one a lead every HUDDLE_EVERY),
// HUDDLE_R units out; it starts once they are all there and no more can
// join (or HUDDLE_WAIT after the first got there, HUDDLE_GATHER at most
// after one there set out) and lasts HUDDLE_S; anyone not there within
// HUDDLE_GATHER gives up. So none is in one longer than HUDDLE_GATHER +
// HUDDLE_S.
const HUDDLE_JOIN = 4;
export const HUDDLE_EVERY = 30;
const HUDDLE_R = 4.5;
const HUDDLE_WAIT = 3;
export const HUDDLE_S = 2.5;
export const HUDDLE_GATHER = 12;
// A coffee run now and then (one an agent every COFFEE_EVERY seconds at
// most): there, COFFEE_POUR seconds at the machine, back; then a mug in
// hand for MUG seconds, a sip every SIP seconds. Each leg gives up after
// COFFEE_LEG seconds.
export const COFFEE_EVERY = 150;
export const COFFEE_POUR = 2.5;
export const COFFEE_LEG = 25;
const MUG: readonly [number, number] = [45, 75];
const SIP: readonly [number, number] = [6, 12];
const SIP_S = 2;
// Where the newcomers of a huddle stand round their lead, on screen: (units
// to the right, units down toward the viewer) from it, the first two either
// side, then in front a little either side, then further out. And where a
// finished subagent stands to high-five its lead: beside it on screen,
// about 7 units apart (their raised hands meet between them), else a step
// nearer or further, higher or lower (every one of them beside it, see
// beside; with none free, no high-five), within FIVE_WALK seconds; they
// slap for FIVE_S.
const FAN: ReadonlyArray<readonly [number, number]> = [[5.5, 0], [-5.5, 0], [3, 3.5], [-3, 3.5], [7.5, -1.5], [-7.5, -1.5]];
const BESIDE: ReadonlyArray<readonly [number, number]> = [[7, 0], [-7, 0], [7, 1.5], [-7, 1.5], [7, -1.5], [-7, -1.5]];
const SIDLE: ReadonlyArray<readonly [number, number]> = [5.5, 7, 8.5].flatMap((sx) => [0, 1.5, -1.5, 3, -3].flatMap((sy) => [[sx, sy], [-sx, sy]] as const));
// Beside each other for a high-five: 3.5 to 7.5 units apart, and 5 or
// more across the screen (not one behind the other).
const beside = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y) >= 3.5 && Math.hypot(a.x - b.x, a.y - b.y) <= 7.5 && Math.abs(a.x - b.x - (a.y - b.y)) >= 5;
export const FIVE_WALK = 10;
export const FIVE_S = 1.3;
// A stand-up: STANDUP_N or more idle agents of a crew, at most once every
// STANDUP_EVERY seconds a crew (at most STANDUP_MAX of them), gather in a
// ring on open floor (STANDUP_GATHER seconds to get there) and take turns
// talking, STANDUP_TURN seconds each, for STANDUP_S.
const STANDUP_N = 3;
const STANDUP_MAX = 6;
export const STANDUP_EVERY = 180;
export const STANDUP_GATHER = 15;
export const STANDUP_S = 8;
const STANDUP_TURN = 2;
const TAU = Math.PI * 2;

// A short pose over whatever else is going on: a wave, a cheer, a flinch,
// a stretch. `hold` stops a walker for its length.
export type Gesture = { pose: Pose; at: number; until: number; face?: Spot; hold: boolean };

export type Errand =
  | { kind: 'visit'; poi: Poi; arrived: boolean; until: number; pose: Pose; since: number; beat: number }
  | { kind: 'chat'; with: string; arrived: boolean; until: number; since: number; beat: number; turn: number }
  | { kind: 'pet'; arrived: boolean; until: number; since: number }
  | { kind: 'haul'; site: Construction; step: 'fetch' | 'pick' | 'carry' | 'place'; until: number; item: number; trips: number; since: number }
  | { kind: 'nap'; wake: number } // clock time it next gets up for a moment
  // office life (see OFFICE)
  | { kind: 'huddle'; lead: string; arrived: boolean; since: number }
  | { kind: 'coffee'; step: 'go' | 'pour' | 'back'; poi: Poi; from: Spot; until: number; since: number }
  | { kind: 'five'; lead: string; at: Spot; to: Spot; arrived: boolean; until: number; since: number; clap: number }
  | { kind: 'standup'; crew: string; arrived: boolean; since: number };

// Office life's errands: dropped when it is turned off; a working agent
// that ends one goes straight back to its station. And its poses (see
// hush).
const OFFICE: ReadonlySet<Errand['kind']> = new Set(['huddle', 'coffee', 'five', 'standup']);
const OFFICE_POSES: ReadonlySet<Pose> = new Set(['talk', 'sip', 'highfive']);
// A lead's kick-off huddle: when it opened, where the lead stands (or is
// heading), who is in it and where each stands, when the first got there,
// when it ends (0: not started). A crew's stand-up: who is in it, the
// middle of its ring, when it began and when it ends (0: still gathering),
// when the next turn to talk comes and whose it is.
type Huddle = { opened: number; at: Spot; members: string[]; spots: Spot[]; firstHere: number; until: number };
type Standup = { members: string[]; centre: Spot; since: number; until: number; beat: number; turn: number };

export type Mind = {
  rng: Rng;
  errand: Errand | null;
  gestures: Gesture[];
  emote: { e: Emote; born: number; until: number } | null;
  think: number; // clock time of the next free choice
  micro: number; // clock time of a worker's next little break
  cheer: boolean; // a worker's detail just changed
  celebrated: number;
  lastPoi: Poi | null;
  lastChat: number;
  greeted: number; // last answered a lead's bolt
  up: number; // a sleeper is up and about until this clock time (see rise)
  exit: number; // gone from the list: leave by this clock time once the block is down (0 = staying)
  mug: number; // carries a mug of coffee until this clock time (0: none)
  sip: number; // its next sip from it
  coffee: number; // when it last went for one
};

export function newMind(id: string, clock: number): Mind {
  const rng = new Rng(hashString(id) ^ 0x51f15e);
  return {
    rng,
    errand: null,
    gestures: [],
    emote: null,
    think: clock + rng.range(0.5, 1.5),
    micro: clock + rng.range(8, 20),
    cheer: false,
    celebrated: -Infinity,
    lastPoi: null,
    lastChat: clock,
    greeted: -Infinity,
    up: 0,
    exit: 0,
    mug: 0,
    sip: 0,
    coffee: -Infinity,
  };
}

// What a character looks like right now: its pose, what it faces, the
// colour (an index into the world's build colours) of a block it holds, and
// whether it carries a mug of coffee.
export type Look = { pose: Pose; face?: Spot; item?: number; mug?: boolean };

// What life needs from the stage.
export type LifeHost = {
  walk(a: Actor, to: Spot): void; // off its station and on its way there
  standable(s: Spot): boolean; // on the floor, clear of props, builds and piles
  nap(a: Actor): void; // off to sleep at the idle prop
  leave(a: Actor): void; // out through the entrance
  idleFor(a: Actor): number; // seconds in the current activity
  spawn(p: Particle): void;
  occupied(x: number, y: number, z: number): boolean; // someone stands in this unit block
  back(a: Actor): void; // straight back to the station for its activity (an idle one is free to roam)
  yard(): Spot | null; // open floor in front of the hub, where a stand-up gathers
};

export function faceToward(a: Spot, f: Spot, fallback: Facing): Facing {
  const dx = f.x - a.x;
  const dy = f.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.3) return fallback;
  return { back: dx + dy < 0, flip: dx - dy < 0 };
}

const working = (a: Actor) => a.info.activity !== 'idle' && a.info.activity !== 'done' && a.info.activity !== 'error';
// In the room: not coming in, not on the way out, not gone.
const present = (a: Actor) => !a.gone && a.state !== 'enter' && a.state !== 'leave';

export class Life {
  clock = 0;
  pois: Poi[] = [];
  works: Works | null = null;
  critter: Critter | null = null;
  private host: LifeHost;
  private rng: Rng;
  private byId = new Map<string, Actor>();
  private met = new Map<string, number>(); // pair of ids → when they last passed
  private pruned = 0;
  // Office life: on (see setOffice), the huddles by lead and the stand-ups
  // by crew under way, when each lead and crew last had one, and when the
  // crews were last looked over for a stand-up.
  office = true;
  private huddles = new Map<string, Huddle>();
  private lastHuddle = new Map<string, number>();
  private standups = new Map<string, Standup>();
  private lastStandup = new Map<string, number>();
  private polled = -Infinity;

  constructor(host: LifeHost, seed = 0x11fe) {
    this.host = host;
    this.rng = new Rng(seed);
  }

  // A new world: new spots, builds and critter; everyone drops what they
  // were doing.
  setWorld(pois: Poi[], works: Works | null, critter: Critter | null, actors: Iterable<Actor>): void {
    this.pois = pois;
    this.works = works;
    this.critter = critter;
    if (works) works.onRaze = (c) => this.dust(c);
    for (const a of actors) {
      a.mind.errand = null;
      a.mind.gestures = [];
      a.mind.think = this.clock + 0.5;
    }
    this.huddles.clear();
    this.standups.clear();
  }

  // Office life on or off; off, every moment of it ends at once (its poses
  // and speech marks with it) and the mugs go.
  setOffice(on: boolean): void {
    this.office = on;
    if (on) return;
    for (const a of this.byId.values()) {
      if (a.mind.errand && OFFICE.has(a.mind.errand.kind)) this.end(a);
      this.hush(a);
      a.mind.mug = 0;
    }
    this.huddles.clear();
    this.standups.clear();
  }

  // ── events from the stage ─────────────────────────────────────────────
  // Someone walked in: idle characters wave hello; a subagent's lead waves.
  arrived(a: Actor, actors: Iterable<Actor>): void {
    const c = this.clock;
    for (const o of actors) {
      if (o === a || o.state === 'enter' || o.state === 'leave') continue;
      if (o.info.id === a.info.parentId) {
        this.gesture(o, 'wave', 1.3, { delay: 0.2, face: a });
      } else if (o.info.activity === 'idle' && !this.sleeping(o) && !this.carrying(o) && !o.mind.exit) {
        // Even mid-chat they look up to say hello.
        this.gesture(o, 'wave', 1.1, { delay: o.mind.rng.range(0.2, 1), face: a });
      }
    }
    a.mind.think = Math.max(a.mind.think, c + 1);
    if (this.office) this.kickOff(a);
  }

  // The activity changed: whatever they were up to is dropped (a working
  // agent leaves an office moment for its station at once, see end; work or
  // an error shows at once, no talking or sipping over it). A subagent that
  // finished goes to high-five its lead first.
  changed(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    m.exit = 0;
    this.end(a);
    if (a.info.activity !== 'idle' && a.info.activity !== 'done') this.hush(a);
    if (a.info.activity === 'done') {
      m.think = c + 1.6; // celebrate before anything else
      if (this.office) this.highFive(a);
    } else if (a.info.activity === 'idle') m.think = c + m.rng.range(2.5, 3.5); // a short wait is no reason to wander off
    else m.micro = Math.max(m.micro, c + m.rng.range(6, 14));
  }

  // Same activity, new detail (a new file, a new command).
  detail(a: Actor): void {
    if (working(a)) a.mind.cheer = true;
  }

  // An explosion at (x, y): those near flinch, then look at it.
  boom(x: number, y: number, by: Actor, actors: Iterable<Actor>): void {
    const at = { x, y };
    for (const o of actors) {
      if (o === by || !this.awake(o) || Math.hypot(o.x - x, o.y - y) > REACT_R) continue;
      const m = o.mind;
      m.gestures = [];
      const d = m.rng.range(0, 0.15);
      this.gesture(o, 'flinch', 0.7, { delay: d, face: at });
      // Then a long look, unless they have somewhere to be.
      if (!(working(o) && o.path.length)) this.gesture(o, 'idle', 1.4, { delay: d + 0.7, face: at });
      this.emote(o, m.rng.chance(0.5) ? 'excl' : 'sweat', 1.8, m.rng.range(0.1, 0.6));
    }
  }

  // Someone finished: those near (and every idle character) cheer them;
  // a worker on the way somewhere just smiles.
  finished(a: Actor, actors: Iterable<Actor>): void {
    for (const o of actors) {
      if (o === a || !this.awake(o) || this.carrying(o)) continue;
      if (Math.hypot(o.x - a.x, o.y - a.y) > REACT_R && o.info.activity !== 'idle') continue;
      const m = o.mind;
      const d = m.rng.range(0.1, 0.6);
      if (!(working(o) && o.path.length)) this.gesture(o, 'cheer', 1.2, { delay: d, face: a });
      this.emote(o, m.rng.chance(0.5) ? 'star' : 'heart', 1.8, d);
    }
  }

  // A lead's bolt reached its subagent: it startles and waves back.
  cast(lead: Actor, sub: Actor): void {
    const m = sub.mind;
    if (this.clock - m.greeted < 15) return;
    m.greeted = this.clock;
    this.emote(sub, 'excl', 1.5);
    this.gesture(sub, 'wave', 1, { delay: 0.35, face: lead });
  }

  // The agent is gone from the list. A finished agent on its way with a
  // block lays it first, and one on its way to a high-five gives it, then
  // goes (true: not yet).
  vanish(a: Actor): boolean {
    const e = a.mind.errand;
    if (a.info.activity === 'done' && e?.kind === 'haul') {
      e.trips = 1;
      if (!a.mind.exit) a.mind.exit = this.clock + 20;
      return true;
    }
    if (e?.kind === 'five') {
      if (!a.mind.exit) a.mind.exit = this.clock + FIVE_WALK + FIVE_S;
      return true;
    }
    return false;
  }

  // On its way to a high-five or giving one: the finale waits (see
  // Stage.effects).
  fiving(a: Actor): boolean {
    return a.mind.errand?.kind === 'five';
  }

  // In a kick-off huddle: a subagent spinning up, its station waits (see
  // Stage.moving).
  huddled(a: Actor): boolean {
    return a.mind.errand?.kind === 'huddle';
  }

  // Drops whatever errand `a` is on (and frees whoever or whatever it involved).
  end(a: Actor): void {
    const m = a.mind;
    const e = m.errand;
    if (!e) return;
    m.errand = null;
    m.think = this.clock + m.rng.range(0.8, 2.4);
    if (e.kind === 'chat') {
      m.lastChat = this.clock;
      const b = this.byId.get(e.with);
      const be = b?.mind.errand;
      if (b && be?.kind === 'chat' && be.with === a.info.id) this.end(b);
    } else if (e.kind === 'pet') {
      if (this.critter?.claimedBy === a.info.id) this.critter.claimedBy = null;
    } else if (e.kind === 'haul' && (e.step === 'carry' || e.step === 'place')) {
      e.site.carriers = Math.max(0, e.site.carriers - 1);
    } else if (OFFICE.has(e.kind)) {
      // its poses go with it; work comes first: straight to its station
      this.hush(a);
      if (working(a) && a.state !== 'leave' && !a.gone) this.host.back(a);
    }
  }

  // ── per frame ─────────────────────────────────────────────────────────
  update(actors: Actor[], dt: number): void {
    this.clock += dt;
    const c = this.clock;
    this.byId = new Map(actors.map((a) => [a.info.id, a]));
    for (const a of actors) {
      const m = a.mind;
      if (m.gestures.length) m.gestures = m.gestures.filter((g) => g.until > c);
      if (m.emote && m.emote.until <= c) m.emote = null;
    }
    for (const a of actors) {
      if (a.gone || a.state === 'enter' || a.state === 'leave') continue;
      const m = a.mind;
      if (m.exit && c > m.exit) {
        this.end(a);
        m.exit = 0;
        this.host.leave(a);
        continue;
      }
      const act = a.info.activity;
      if (act === 'idle') this.idle(a);
      else if (act === 'done') this.done(a);
      else if (act !== 'error') this.work(a);
      if (m.errand) this.pursue(a);
      if (m.mug) this.sipping(a);
    }
    if (this.office) {
      this.huddling();
      this.standing();
    }
    this.mingle(actors);
    const cr = this.critter;
    if (cr) {
      if (cr.claimedBy && !this.byId.has(cr.claimedBy)) cr.claimedBy = null;
      cr.update(dt, (x, y) => this.host.standable({ x, y }));
    }
    if (c - this.pruned > 5) {
      this.pruned = c;
      for (const [k, t] of this.met) if (c - t > 60 || !k.split('|').every((id) => this.byId.has(id))) this.met.delete(k);
    }
  }

  private idle(a: Actor): void {
    const m = a.mind;
    const e = m.errand;
    const idleFor = this.host.idleFor(a);
    if (idleFor >= SLEEP_AFTER) {
      // Up for a moment, a block to lay first, or a subagent on its way to
      // high-five it; then back to bed.
      if (this.clock < m.up || this.carrying(a)) return;
      if (e?.kind !== 'nap' && this.awaited(a)) return;
      if (e?.kind === 'nap') {
        if (this.clock >= e.wake && !a.path.length) this.rise(a);
        return;
      }
      this.end(a);
      m.mug = 0;
      m.errand = { kind: 'nap', wake: this.clock + m.rng.range(60, 90) };
      this.host.nap(a);
      return;
    }
    if (e?.kind === 'nap') {
      // Idle afresh (a new wait began): up and about again.
      m.errand = null;
      m.think = this.clock + m.rng.range(0.5, 1.5);
    }
    if (!m.errand && this.clock >= m.think && !this.held(a) && !this.awaited(a)) this.choose(a);
  }

  // A sleeper gets up for a few seconds: a stretch, then a drink, a look
  // round or a stroll to a spot nearby; then it is back to bed (see idle).
  private rise(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    m.up = c + m.rng.range(6, 10);
    m.errand = null;
    this.gesture(a, 'stretch', 1.6);
    const pois = this.openPois(a);
    const opts: Array<readonly [string, number]> = [['drink', 2], ['look', 2]];
    if (pois.length) opts.push(['visit', 3]);
    switch (m.rng.weighted(opts)) {
      case 'visit': {
        const poi = this.pickPoi(a, pois);
        m.lastPoi = poi;
        m.errand = { kind: 'visit', poi, arrived: false, until: 0, pose: 'idle', since: c, beat: 0 };
        this.host.walk(a, poi);
        break;
      }
      case 'drink':
        this.gesture(a, 'drink', 1.5, { delay: 1.8 });
        this.emote(a, 'cup', 1.4, 1.8);
        break;
      default:
        this.emote(a, 'zzz', 1.6);
        this.gesture(a, 'idle', 1.2, { delay: 1.8, face: { x: a.x + 4, y: a.y - 2 } });
        this.gesture(a, 'idle', 1.2, { delay: 3, face: { x: a.x - 2, y: a.y + 4 } });
    }
  }

  // Finished agents help build until they go.
  private done(a: Actor): void {
    const m = a.mind;
    if (m.errand || this.clock < m.think || this.held(a)) return;
    const site = this.site();
    if (site) this.haul(a, site, 99);
    else m.think = this.clock + 3;
  }

  // Workers keep at it, with a little break now and then.
  private work(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    if (a.state !== 'work' || !a.station || a.path.length || m.errand || m.gestures.length) return;
    if (m.cheer) {
      m.cheer = false;
      if (c - m.celebrated >= 8) {
        m.celebrated = c;
        this.gesture(a, 'cheer', 0.9, { hold: false });
        this.emote(a, m.rng.pick<Emote>(['star', 'idea', 'note']), 1.6);
      }
      return;
    }
    if (c < m.micro) return;
    m.micro = c + m.rng.range(14, 30);
    const r = { x: a.x + 4, y: a.y - 2 };
    const l = { x: a.x - 2, y: a.y + 4 };
    switch (m.rng.weighted<string>([['stretch', 3], ['drink', 2], ['look', 3]])) {
      case 'stretch':
        this.gesture(a, 'stretch', 1.6, { hold: false });
        break;
      case 'drink':
        this.gesture(a, 'drink', 1.5, { hold: false });
        this.emote(a, 'cup', 1.4);
        break;
      default:
        this.gesture(a, 'idle', 0.8, { face: m.rng.chance(0.5) ? r : l, hold: false });
        this.gesture(a, 'idle', 0.8, { delay: 0.8, face: m.rng.chance(0.5) ? l : r, hold: false });
    }
  }

  // An idle character with nothing on decides what next.
  private choose(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    const opts: Array<readonly [string, number]> = [];
    const pois = this.openPois(a);
    if (pois.length) opts.push(['visit', 6]);
    const mate = this.mateFor(a);
    if (mate) opts.push(['chat', 1 + Math.min(4, (c - m.lastChat) / 4)]);
    const site = this.site();
    // A build nobody is working on calls louder: the first brick soon after
    // it is staked out, and none left standing half done for long.
    if (site) opts.push(['haul', this.haulers(site) ? 2.5 : 6]);
    const cr = this.critter;
    if (cr && !cr.claimedBy) opts.push(['pet', 1.5]);
    // A coffee run: likeliest early in a wait (the kettle goes on when the
    // work stops), at most one every COFFEE_EVERY seconds.
    const brew = this.office && !m.mug && c - m.coffee >= COFFEE_EVERY ? this.brew(a) : null;
    if (brew) opts.push(['coffee', this.host.idleFor(a) < 20 ? 8 : 3]);
    opts.push(['stretch', 0.6]);
    switch (m.rng.weighted(opts)) {
      case 'visit': {
        const poi = this.pickPoi(a, pois);
        m.lastPoi = poi;
        m.errand = { kind: 'visit', poi, arrived: false, until: 0, pose: 'idle', since: c, beat: 0 };
        this.host.walk(a, poi);
        break;
      }
      case 'chat':
        if (!this.chat(a, mate!)) m.think = c + 1;
        break;
      case 'haul':
        this.haul(a, site!, m.rng.int(1, 3));
        break;
      case 'pet': {
        cr!.claimedBy = a.info.id;
        m.errand = { kind: 'pet', arrived: false, until: 0, since: c };
        this.host.walk(a, this.petSpot(cr!, a));
        break;
      }
      case 'coffee':
        m.coffee = c;
        m.errand = { kind: 'coffee', step: 'go', poi: brew!, from: { x: a.x, y: a.y }, until: 0, since: c };
        this.host.walk(a, brew!);
        break;
      default:
        this.gesture(a, 'stretch', 1.6);
        m.think = c + 1.6 + m.rng.range(0.5, 1.5);
    }
  }

  // POIs nobody is at or heading for (the critter's spot has its own errand).
  private openPois(a: Actor): Poi[] {
    const taken = (p: Poi) => {
      for (const o of this.byId.values()) {
        if (o === a) continue;
        if (Math.hypot(o.x - p.x, o.y - p.y) < 3.5) return true;
        const e = o.mind.errand;
        if (e?.kind === 'visit' && e.poi === p) return true;
        const end = o.path[o.path.length - 1];
        if (end && Math.hypot(end.x - p.x, end.y - p.y) < 3.5) return true;
      }
      return false;
    };
    const ok = this.pois.filter((p) => p.kind !== 'pet' && this.host.standable(p) && !taken(p));
    const fresh = ok.filter((p) => p !== a.mind.lastPoi);
    return fresh.length ? fresh : ok;
  }

  // Nearer spots much more often.
  private pickPoi(a: Actor, pois: Poi[]): Poi {
    return a.mind.rng.weighted(pois.map((p) => [p, 1 / (1 + (Math.hypot(p.x - a.x, p.y - a.y) / 30) ** 2)] as const));
  }

  // The nearest other idle character free for a chat (not a sleeper, nor
  // one up for a moment only, nor a lead about to be high-fived).
  private mateFor(a: Actor): Actor | null {
    let best: Actor | null = null;
    let bd = Infinity;
    for (const b of this.byId.values()) {
      if (b === a || b.info.activity !== 'idle' || b.state === 'enter' || b.state === 'leave' || b.mind.exit) continue;
      if (this.host.idleFor(b) >= SLEEP_AFTER || this.held(b) || this.awaited(b)) continue;
      const e = b.mind.errand;
      if (e && e.kind !== 'visit') continue;
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  // Two characters meet halfway and face each other.
  private chat(a: Actor, b: Actor): boolean {
    const c = this.clock;
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    let ux = d > 1e-6 ? (b.x - a.x) / d : 1;
    let uy = d > 1e-6 ? (b.y - a.y) / d : 0;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    let sa: Spot | null = null;
    let sb: Spot | null = null;
    for (let k = 0; k < 6 && !sa; k++) {
      const pa = { x: mid.x - (ux * CHAT_GAP) / 2, y: mid.y - (uy * CHAT_GAP) / 2 };
      const pb = { x: mid.x + (ux * CHAT_GAP) / 2, y: mid.y + (uy * CHAT_GAP) / 2 };
      if (this.host.standable(pa) && this.host.standable(pb)) {
        sa = pa;
        sb = pb;
      } else {
        // Turn the pair round, then try nearer to whoever is asking.
        [ux, uy] = [-uy, ux];
        if (k === 3) Object.assign(mid, { x: a.x + ux * 2, y: a.y + uy * 2 });
      }
    }
    if (!sa || !sb) return false;
    this.end(b);
    a.mind.errand = { kind: 'chat', with: b.info.id, arrived: false, until: 0, since: c, beat: 0, turn: 0 };
    b.mind.errand = { kind: 'chat', with: a.info.id, arrived: false, until: 0, since: c, beat: 0, turn: 0 };
    this.host.walk(a, sa);
    this.host.walk(b, sb);
    return true;
  }

  private haul(a: Actor, site: Construction, trips: number): void {
    a.mind.errand = { kind: 'haul', site, step: 'fetch', until: 0, item: 0, trips, since: this.clock };
    this.host.walk(a, this.fetchSpot(site, a));
  }

  // The build under way that could use another pair of hands.
  private site(): Construction | null {
    const vacant = (p: { x: number; y: number; r: number }) => {
      for (const o of this.byId.values()) if (Math.hypot(o.x - p.x, o.y - p.y) < p.r + 1.5) return false;
      return true;
    };
    const s = this.works?.current(this.clock, vacant) ?? null;
    if (!s || s.complete) return null;
    return this.haulers(s) < MAX_HAULERS ? s : null;
  }

  private haulers(s: Construction): number {
    let n = 0;
    for (const o of this.byId.values()) if (o.mind.errand?.kind === 'haul' && o.mind.errand.site === s) n++;
    return n;
  }

  // Moves each errand on a step.
  private pursue(a: Actor): void {
    const m = a.mind;
    const e = m.errand!;
    const c = this.clock;
    const here = a.path.length === 0;
    switch (e.kind) {
      case 'visit': {
        if (!e.arrived) {
          if (here) {
            e.arrived = true;
            e.until = c + m.rng.range(4, 9);
            e.pose = poseAt(e.poi.kind, m.rng);
            e.beat = c + m.rng.range(0.3, 1.2);
          } else if (c - e.since > 25) this.end(a);
          return;
        }
        if (c >= e.until) {
          this.end(a);
          return;
        }
        if (c >= e.beat) {
          const k = e.poi.kind;
          if (k === 'dance') {
            e.beat = c + m.rng.range(2, 3.5);
            this.emote(a, 'note', 1.6);
          } else if (k === 'drink') {
            e.beat = c + m.rng.range(3.5, 5);
            this.emote(a, 'cup', 1.4);
          } else {
            e.beat = Infinity;
            if (m.rng.chance(0.5)) this.emote(a, m.rng.pick<Emote>(k === 'view' ? ['idea', 'star', 'question'] : ['heart', 'zzz', 'note']), 2);
          }
        }
        return;
      }
      case 'chat': {
        const b = this.byId.get(e.with);
        const be = b?.mind.errand;
        if (!b || be?.kind !== 'chat' || be.with !== a.info.id) {
          this.end(a);
          return;
        }
        if (!e.arrived && here) e.arrived = true;
        // One side runs the pair.
        if (a.info.id > b.info.id) return;
        if (!e.until) {
          if (e.arrived && be.arrived) {
            e.until = be.until = c + m.rng.range(5, 9);
            e.beat = c + 0.3;
          } else if (c - e.since > 20) this.end(a);
          return;
        }
        if (c >= e.until) {
          this.end(a);
          return;
        }
        if (c >= e.beat) {
          e.beat = c + m.rng.range(1.2, 1.9);
          this.emote(e.turn++ % 2 ? b : a, m.rng.pick(CHAT_EMOTES), 1.5);
        }
        return;
      }
      case 'pet': {
        const cr = this.critter;
        if (!cr || cr.claimedBy !== a.info.id) {
          this.end(a);
          return;
        }
        if (!e.arrived) {
          if (here) {
            if (Math.hypot(cr.x - a.x, cr.y - a.y) > 4.5) {
              if (c - e.since > 20) this.end(a);
              else this.host.walk(a, this.petSpot(cr, a));
              return;
            }
            e.arrived = true;
            e.until = c + m.rng.range(3, 5);
            this.emote(a, 'heart', 1.8);
            cr.heartUntil = c + 1.8;
            cr.face(a);
          } else if (c - e.since > 25) this.end(a);
          return;
        }
        if (c >= e.until) this.end(a);
        return;
      }
      case 'haul':
        this.carry(a, e);
        return;
      case 'huddle': {
        const lead = this.byId.get(e.lead);
        const h = this.huddles.get(e.lead);
        if (!lead || !h || !present(lead) || (h.until && c >= h.until)) {
          this.end(a);
          return;
        }
        if (!e.arrived) {
          if (here) {
            e.arrived = true;
            if (!h.firstHere) h.firstHere = c;
          } else if (c - e.since > HUDDLE_GATHER) this.end(a);
        }
        return;
      }
      case 'coffee':
        if (e.step === 'go') {
          if (here) {
            e.step = 'pour';
            e.until = c + COFFEE_POUR;
            this.emote(a, 'cup', 1.6, COFFEE_POUR - 1.6);
          } else if (c - e.since > COFFEE_LEG) this.end(a);
        } else if (e.step === 'pour') {
          // poured, it waits there for a subagent on its way to high-five it
          if (c < e.until || this.awaited(a)) return;
          m.mug = c + m.rng.range(...MUG);
          m.sip = c + m.rng.range(2, 4);
          e.step = 'back';
          e.since = c;
          this.host.walk(a, e.from);
        } else if (here || c - e.since > COFFEE_LEG) this.end(a);
        return;
      case 'five': {
        const lead = this.byId.get(e.lead);
        if (!lead || !present(lead)) {
          this.fived(a);
          return;
        }
        if (!e.arrived) {
          if (c - e.since > FIVE_WALK) this.fived(a);
          else if (Math.hypot(lead.x - e.at.x, lead.y - e.at.y) > 3 || (here && !beside(a, lead) && Math.hypot(a.x - e.to.x, a.y - e.to.y) >= 0.5)) {
            // the lead moved off, or the way ended somewhere else: beside
            // it again (no room there now: no high-five)
            const to = this.fiveSpot(lead, a);
            if (!to) {
              this.fived(a);
              return;
            }
            e.at = { x: lead.x, y: lead.y };
            e.to = to;
            this.host.walk(a, to);
          } else if (here) {
            // at its spot, or beside the lead anyway
            e.arrived = true;
            e.until = c + FIVE_S;
            e.clap = c + FIVE_S * 0.4;
            // over whatever either was doing (a wave, a word, a sip): the
            // first gesture under way is the one that shows
            a.mind.gestures = [];
            this.gesture(a, 'highfive', FIVE_S, { face: lead });
            // a working lead turns and raises a hand where it is; one in
            // trouble or with a block in its hands only turns (see look)
            if (!this.noHand(lead)) {
              lead.mind.gestures = [];
              this.gesture(lead, 'highfive', FIVE_S, { face: a, hold: !working(lead) });
            }
          }
          return;
        }
        if (e.clap && c >= e.clap) {
          e.clap = 0;
          this.stars({ x: (a.x + lead.x) / 2, y: (a.y + lead.y) / 2 });
        }
        if (c >= e.until) this.fived(a);
        return;
      }
      case 'standup': {
        if (!this.standups.has(e.crew)) this.end(a);
        else if (!e.arrived && here) e.arrived = true;
        else if (!e.arrived && c - e.since > STANDUP_GATHER + STANDUP_S) this.end(a);
        return;
      }
      default:
    }
  }

  // ── office life ───────────────────────────────────────────────────────
  // A subagent walked in: if its lead is in the room and awake and the
  // subagent's first task is not running yet (it is spinning up, thinking),
  // it joins the lead's kick-off huddle, the one opened a few seconds ago or
  // a new one (at most one a lead every HUDDLE_EVERY seconds).
  private kickOff(a: Actor): void {
    const id = a.info.parentId;
    if (a.info.role === 'lead' || !id || a.info.activity !== 'think') return;
    const lead = this.byId.get(id);
    if (!lead || !present(lead) || this.sleeping(lead)) return;
    const c = this.clock;
    let h = this.huddles.get(id);
    if (h && (h.until || c - h.opened > HUDDLE_JOIN)) return;
    if (!h) {
      if (c - (this.lastHuddle.get(id) ?? -Infinity) < HUDDLE_EVERY) return;
      const at = lead.path[lead.path.length - 1] ?? lead;
      h = { opened: c, at: { x: at.x, y: at.y }, members: [], spots: [], firstHere: 0, until: 0 };
      this.huddles.set(id, h);
      this.lastHuddle.set(id, c);
    }
    h.members.push(a.info.id);
    a.mind.errand = { kind: 'huddle', lead: id, arrived: false, since: c };
    this.host.walk(a, this.huddleSpot(h, a));
  }

  // Round the lead, fanned out on screen (see FAN), each on a spot of its
  // own.
  private huddleSpot(h: Huddle, a: Actor): Spot {
    const free = FAN.map(([sx, sy]) => onScreen(h.at, sx, sy)).filter((p) => this.host.standable(p) && h.spots.every((q) => Math.hypot(q.x - p.x, q.y - p.y) > 2));
    const spot = free[0] ?? this.around(h.at, HUDDLE_R, Math.atan2(a.y - h.at.y, a.x - h.at.x) + h.spots.length * 0.8, h.spots);
    h.spots.push(spot);
    return spot;
  }

  // Each huddle starts once its members are all there and no more can join
  // (or HUDDLE_WAIT after the first got there, HUDDLE_GATHER at most after
  // one there set out):
  // they stand round the lead, nodding along, a
  // speech mark over it, an idle lead talking to them; HUDDLE_S later each
  // goes to its station. Members gone or given work drop out; with none
  // left it is over (and the lead stops talking).
  private huddling(): void {
    const c = this.clock;
    for (const [id, h] of this.huddles) {
      h.members = h.members.filter((m) => this.byId.get(m)?.mind.errand?.kind === 'huddle');
      const lead = this.byId.get(id);
      if (!h.members.length || !lead) {
        if (lead && h.until > c) this.hush(lead);
        this.huddles.delete(id);
        continue;
      }
      // The lead is off to another station: they follow it there; once it
      // has started, it is over.
      const dest = lead.path[lead.path.length - 1] ?? lead;
      if (Math.hypot(dest.x - h.at.x, dest.y - h.at.y) > 3) {
        if (h.until) {
          h.until = c;
          continue;
        }
        h.at = { x: dest.x, y: dest.y };
        h.spots = [];
        h.firstHere = 0;
        for (const m of h.members) {
          const o = this.byId.get(m)!;
          const e = o.mind.errand;
          if (e?.kind === 'huddle') e.arrived = false;
          this.host.walk(o, this.huddleSpot(h, o));
        }
        continue;
      }
      if (h.until || !h.firstHere) continue;
      const errands = h.members.map((m) => this.byId.get(m)!.mind.errand as Extract<Errand, { kind: 'huddle' }>);
      // (one there that set out HUDDLE_GATHER ago waits no longer)
      const due = errands.some((e) => e.arrived && c - e.since >= HUDDLE_GATHER);
      if ((!errands.every((e) => e.arrived) || c - h.opened <= HUDDLE_JOIN) && !due && c - h.firstHere < HUDDLE_WAIT) continue;
      h.until = c + HUDDLE_S;
      this.emote(lead, 'speech', HUDDLE_S);
      if (!working(lead)) {
        const group = h.members.map((m) => this.byId.get(m)!);
        const mid = { x: group.reduce((n, o) => n + o.x, 0) / group.length, y: group.reduce((n, o) => n + o.y, 0) / group.length };
        this.gesture(lead, 'talk', HUDDLE_S, { face: mid });
      }
    }
  }

  // A drink spot nearby nobody is at or heading for, for a coffee run (the
  // world's espresso counter, bar or mess bench); in a room with none open,
  // a warm one (by the hearth, the stove or the fire, where every world
  // keeps a kettle on).
  private brew(a: Actor): Poi | null {
    const open = this.openPois(a);
    const pots = open.filter((p) => p.kind === 'drink');
    const warm = open.filter((p) => p.kind === 'warm');
    return pots.length ? this.pickPoi(a, pots) : warm.length ? this.pickPoi(a, warm) : null;
  }

  // Carrying a mug: a sip now and then (standing about, or at work: a
  // worker sips where it is; none in trouble: its error shows), until it is
  // finished.
  private sipping(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    if (!this.office || c >= m.mug || this.sleeping(a)) {
      m.mug = 0;
      return;
    }
    if (c < m.sip || a.path.length || m.gestures.length || this.carrying(a) || a.info.activity === 'error') return;
    const busy = working(a);
    if (busy && a.state !== 'work') return;
    m.sip = c + m.rng.range(...SIP);
    this.gesture(a, 'sip', SIP_S, { hold: !busy });
  }

  // A subagent finished and its lead is in the room and awake: it goes to
  // stand beside the lead for a high-five (no room there: the finale goes
  // off at once).
  private highFive(a: Actor): void {
    const lead = a.info.parentId ? this.byId.get(a.info.parentId) : undefined;
    if (a.info.role === 'lead' || !lead || !present(lead) || !present(a) || this.sleeping(lead) || this.carrying(a)) return;
    const to = this.fiveSpot(lead, a);
    if (!to) return;
    a.mind.errand = { kind: 'five', lead: lead.info.id, at: { x: lead.x, y: lead.y }, to, arrived: false, until: 0, since: this.clock, clap: 0 };
    this.host.walk(a, to);
  }

  // Where to stand for a high-five: beside the lead on screen, the nearer
  // side first, a little up or down if need be (BESIDE); else a step nearer,
  // further, higher or lower (SIDLE); null when none of them is free.
  private fiveSpot(lead: Actor, a: Actor): Spot | null {
    const near = (p: Spot) => Math.hypot(p.x - a.x, p.y - a.y);
    for (const offsets of [BESIDE, SIDLE]) {
      const ok = offsets.map(([sx, sy]) => onScreen(lead, sx, sy)).filter((p) => this.host.standable(p));
      if (ok.length) return ok.sort((p, q) => near(p) - near(q))[0];
    }
    return null;
  }

  // The high-five given (or missed): the finale may go off; one gone from
  // the list meanwhile leaves now.
  private fived(a: Actor): void {
    this.end(a);
    if (a.mind.exit) {
      a.mind.exit = 0;
      this.host.leave(a);
    }
  }

  // A small burst of stars where two hands meet.
  private stars(at: Spot): void {
    const r = this.rng;
    const colors: RGB[] = [hex('#ffd34a'), hex('#fff1b8'), hex('#ffb84a')];
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * TAU + r.range(-0.2, 0.2);
      const sp = r.range(2.5, 4.5);
      this.host.spawn({ kind: 'spark', x: at.x, y: at.y, z: 10.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: r.range(1, 4), life: r.range(0.45, 0.75), color: r.pick(colors), glow: true, gravity: 6 });
    }
  }

  // Someone a finished subagent is on its way to high-five: it holds still
  // (no new wanderings, no nap, not back from the coffee yet) until it has
  // been.
  private awaited(lead: Actor): boolean {
    for (const o of this.byId.values()) {
      const e = o.mind.errand;
      if (e?.kind === 'five' && e.lead === lead.info.id) return true;
    }
    return false;
  }

  // The subagent high-fiving `lead` right now, if any.
  private fiver(lead: Actor): Actor | null {
    for (const o of this.byId.values()) {
      const e = o.mind.errand;
      if (e?.kind === 'five' && e.arrived && e.lead === lead.info.id) return o;
    }
    return null;
  }

  // No hand to spare for a high-five: in trouble (its error shows) or a
  // block in its hands.
  private noHand(a: Actor): boolean {
    return a.info.activity === 'error' || this.carrying(a);
  }

  // Office poses and the speech mark over a talker, dropped at once.
  private hush(a: Actor): void {
    const m = a.mind;
    m.gestures = m.gestures.filter((g) => !OFFICE_POSES.has(g.pose));
    if (m.emote?.e === 'speech') m.emote = null;
  }

  // Free for a stand-up: idle, awake, in the room, not leaving, not hauling
  // a block, not about to be high-fived (a coffee run can wait).
  private waiting(a: Actor): boolean {
    const e = a.mind.errand;
    if (a.info.activity !== 'idle' || !present(a) || a.mind.exit || this.sleeping(a) || this.carrying(a) || this.awaited(a)) return false;
    return !e || e.kind === 'visit' || e.kind === 'chat' || e.kind === 'pet' || e.kind === 'haul' || e.kind === 'coffee';
  }

  // Stand-ups: a crew with STANDUP_N or more agents waiting gathers in a
  // ring in the yard (one at a time; at most once every STANDUP_EVERY
  // seconds a crew); once
  // all are there (or STANDUP_GATHER has passed) they take turns talking for
  // STANDUP_S, then scatter. Anyone given work leaves at once (see end); a
  // ring of fewer than two breaks up.
  private standing(): void {
    const c = this.clock;
    for (const [crew, st] of this.standups) {
      st.members = st.members.filter((id) => this.byId.get(id)?.mind.errand?.kind === 'standup');
      if (st.members.length < 2 || (st.until && c >= st.until)) {
        this.standups.delete(crew);
        for (const id of st.members) this.end(this.byId.get(id)!);
        continue;
      }
      if (!st.until) {
        const all = st.members.every((id) => {
          const e = this.byId.get(id)!.mind.errand;
          return e?.kind === 'standup' && e.arrived;
        });
        if (all || c - st.since > STANDUP_GATHER) {
          st.until = c + STANDUP_S;
          st.beat = c;
        }
        continue;
      }
      if (c >= st.beat) {
        const who = this.byId.get(st.members[st.turn++ % st.members.length])!;
        st.beat = c + STANDUP_TURN;
        this.gesture(who, 'talk', STANDUP_TURN - 0.2, { face: st.centre });
        this.emote(who, 'speech', STANDUP_TURN - 0.2);
      }
    }
    // A crew that is waiting, now and then.
    if (this.standups.size || c - this.polled < 1) return;
    this.polled = c;
    const crews = new Map<string, Actor[]>();
    for (const a of this.byId.values()) if (a.info.crew && this.waiting(a)) crews.set(a.info.crew, [...(crews.get(a.info.crew) ?? []), a]);
    for (const [crew, group] of crews) {
      if (group.length < STANDUP_N || this.standups.has(crew) || c - (this.lastStandup.get(crew) ?? -Infinity) < STANDUP_EVERY) continue;
      const centre = this.host.yard();
      if (!centre) continue;
      this.lastStandup.set(crew, c);
      const ring = group.slice(0, STANDUP_MAX);
      const r = 5 + 1.2 * ring.length;
      this.standups.set(crew, { members: ring.map((a) => a.info.id), centre, since: c, until: 0, beat: 0, turn: 0 });
      const seats: Spot[] = [];
      ring.forEach((a, k) => {
        this.end(a);
        a.mind.errand = { kind: 'standup', crew, arrived: false, since: c };
        // (a seat that is blocked turns aside, clear of the others)
        seats.push(this.around(centre, r, (k / ring.length) * TAU + 0.4, seats));
        this.host.walk(a, seats[k]);
      });
    }
  }

  private carry(a: Actor, e: Extract<Errand, { kind: 'haul' }>): void {
    const m = a.mind;
    const s = e.site;
    const c = this.clock;
    const here = a.path.length === 0;
    const gone = !this.works?.builds.includes(s);
    switch (e.step) {
      case 'fetch':
        if (s.complete || gone) this.end(a);
        else if (here) {
          e.step = 'pick';
          e.until = c + 0.5;
        } else if (c - e.since > 30) this.end(a);
        return;
      case 'pick':
        if (c < e.until) return;
        if (s.complete || gone) {
          this.end(a);
          return;
        }
        e.item = s.nextColor();
        s.carriers++;
        e.step = 'carry';
        e.since = c;
        this.host.walk(a, this.standFor(s, s.placed + (s.carriers - 1) * s.per, a));
        return;
      case 'carry':
        if (here) {
          e.step = 'place';
          e.until = c + 0.7;
        } else if (c - e.since > 30) this.end(a);
        return;
      case 'place': {
        if (c < e.until) return;
        if (s.complete || gone) {
          this.end(a);
          return;
        }
        const was = s.placed;
        const laid = s.place((x, y, z) => this.host.occupied(x, y, z));
        if (!laid) {
          // Someone is in the way: wait a moment, then give up.
          if (c - e.until > 4) this.end(a);
          return;
        }
        s.carriers = Math.max(0, s.carriers - 1);
        this.puff(laid);
        e.trips--;
        if (s.complete) this.built(s);
        // Past another quarter of the way up: a cheer of its own.
        else if (Math.floor((4 * s.placed) / s.count) > Math.floor((4 * was) / s.count)) this.quarter(s, laid);
        if (m.exit) {
          m.errand = null;
          m.exit = 0;
          this.host.leave(a);
        } else if (e.trips > 0 && !s.complete) {
          e.step = 'fetch';
          e.since = c;
          this.host.walk(a, this.fetchSpot(s, a));
        } else {
          m.errand = null;
          m.think = c + m.rng.range(1, 2.5);
        }
      }
    }
  }

  // A build is finished: a fountain of sparks off the top and everyone
  // near cheers.
  private built(s: Construction): void {
    const c = this.clock;
    this.works?.finish(s, c);
    const r = this.rng;
    const colors: RGB[] = [hex('#ffd34a'), hex('#ff7b2e'), hex('#9ad46a'), hex('#5ceeff'), hex('#ff5cbc')];
    for (let i = 0; i < 56; i++) {
      const ang = r.next() * Math.PI * 2;
      const sp = 3 + r.next() * 8;
      this.host.spawn({ kind: 'spark', x: s.top.x, y: s.top.y, z: s.top.z + 1, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 8 + r.next() * 12, life: 0.9 + r.next() * 0.9, color: r.pick(colors), glow: true, gravity: 14 });
    }
    this.cheer(s, 1.4);
  }

  // A quarter, a half, three quarters of the way up: a little burst off
  // the bricks just laid and a short cheer, so the goal feels nearer.
  private quarter(s: Construction, laid: Block[]): void {
    const r = this.rng;
    const b = laid[laid.length - 1];
    const colors: RGB[] = [hex('#ffd34a'), hex('#fff1b8'), hex('#9ad46a')];
    for (let i = 0; i < 14; i++) {
      const ang = r.next() * Math.PI * 2;
      const sp = 2 + r.next() * 4;
      this.host.spawn({ kind: 'spark', x: b.x + 0.5, y: b.y + 0.5, z: b.z + 1.5, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 5 + r.next() * 6, life: 0.5 + r.next() * 0.5, color: r.pick(colors), glow: true, gravity: 14 });
    }
    this.cheer(s, 0.8);
  }

  // Everyone awake near the build cheers it for `secs`.
  private cheer(s: Construction, secs: number): void {
    for (const o of this.byId.values()) {
      if (!this.awake(o) || Math.hypot(o.x - s.plaza.x, o.y - s.plaza.y) > CHEER_R) continue;
      const m = o.mind;
      const d = m.rng.range(0.1, 0.6);
      this.gesture(o, 'cheer', secs, { delay: d, face: s.top });
      this.emote(o, m.rng.chance(0.5) ? 'star' : 'heart', secs + 0.6, d);
    }
  }

  // A brick lands with a puff of glints.
  private puff(laid: Block[]): void {
    const r = this.rng;
    const n = Math.min(6, laid.length);
    for (let i = 0; i < n; i++) {
      const b = laid[(i * 7) % laid.length];
      this.host.spawn({ kind: 'glint', x: b.x + 0.5, y: b.y + 0.5, z: b.z + 1, vx: r.range(-1, 1), vy: r.range(-1, 1), vz: r.range(1, 3), life: 0.5, color: hex('#fff1b8'), glow: true, gravity: 0 });
    }
  }

  // A razed build goes in a cloud of dust.
  private dust(s: Construction): void {
    const r = this.rng;
    for (let i = 0; i < 30; i++) {
      this.host.spawn({ kind: 'smoke', x: s.plaza.x + r.range(-s.reach, s.reach), y: s.plaza.y + r.range(-s.reach, s.reach), z: s.top.z * r.next(), vx: 0, vy: 0, vz: r.range(1, 4), life: r.range(0.6, 1.4), color: hex('#b8a78f'), glow: false, gravity: 0 });
    }
  }

  // Where to stand to fetch from the pile: beside it, on the near side.
  private fetchSpot(s: Construction, a: Actor): Spot {
    const p = s.pile;
    const px = (p.x0 + p.x1) / 2;
    const py = (p.y0 + p.y1) / 2;
    return this.around({ x: px, y: py }, 3, Math.atan2(a.y - py, a.x - px));
  }

  // Where to stand to set brick k: at the build's edge beside it, on the
  // side facing the viewer so the builder stays in sight.
  private standFor(s: Construction, k: number, a: Actor): Spot {
    const cc = s.centroid(k);
    let dx = cc.x - s.plaza.x;
    let dy = cc.y - s.plaza.y;
    if (Math.hypot(dx, dy) < 1) {
      dx = a.x - s.plaza.x;
      dy = a.y - s.plaza.y;
    }
    if (dx + dy < 0) [dx, dy] = [-dy, -dx];
    return this.around(s.plaza, s.reach + 2, Math.atan2(dy, dx));
  }

  private petSpot(cr: Critter, a: Actor): Spot {
    return this.around(cr, 3, Math.atan2(a.y - cr.y, a.x - cr.x));
  }

  // A standable spot `d` from `c` at angle `ang`, turning either way to find
  // one, APART from each spot `taken` already if it can be (in finer turns,
  // all the way round, then a step further out); else the one furthest
  // from them.
  private around(c: Spot, d: number, ang: number, taken: readonly Spot[] = []): Spot {
    const [step, turns, rings] = taken.length ? [0.2, 32, [d, d + APART]] : [0.35, 12, [d]];
    let best: Spot | null = null;
    let room = -1;
    for (const r of rings) {
      for (let k = 0; k < turns; k++) {
        const turn = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * step;
        const s = { x: c.x + Math.cos(ang + turn) * r, y: c.y + Math.sin(ang + turn) * r };
        if (!this.host.standable(s)) continue;
        const clear = Math.min(Infinity, ...taken.map((t) => Math.hypot(t.x - s.x, t.y - s.y)));
        if (clear >= APART) return s;
        if (clear > room) [best, room] = [s, clear];
      }
    }
    return best ?? { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d };
  }

  // Passers-by wave at each other (a pair at most every 40 s).
  private mingle(actors: Actor[]): void {
    const c = this.clock;
    for (let i = 0; i < actors.length; i++) {
      const a = actors[i];
      if (!this.sociable(a)) continue;
      for (let j = i + 1; j < actors.length; j++) {
        const b = actors[j];
        if (!a.path.length && !b.path.length) continue;
        if (Math.abs(a.x - b.x) > 7 || Math.abs(a.y - b.y) > 7 || Math.hypot(a.x - b.x, a.y - b.y) > 7) continue;
        if (!this.sociable(b)) continue;
        const key = a.info.id < b.info.id ? `${a.info.id}|${b.info.id}` : `${b.info.id}|${a.info.id}`;
        const last = this.met.get(key);
        if (last !== undefined && c - last < 40) continue;
        this.met.set(key, c);
        // Two workers on their way are mostly too busy.
        if (!this.rng.chance(working(a) && working(b) ? 0.15 : 0.6)) continue;
        this.gesture(a, 'wave', 0.8, { face: { x: b.x, y: b.y } });
        this.gesture(b, 'wave', 0.8, { delay: 0.15, face: { x: a.x, y: a.y } });
      }
    }
  }

  // ── state queries ─────────────────────────────────────────────────────
  private awake(a: Actor): boolean {
    return a.state !== 'enter' && a.state !== 'leave' && !a.gone && !this.sleeping(a);
  }

  // Waited past SLEEP_AFTER and not up for a moment (see rise).
  sleeping(a: Actor): boolean {
    return a.info.activity === 'idle' && this.host.idleFor(a) >= SLEEP_AFTER && this.clock >= a.mind.up;
  }

  // Hauling a block: picking it up, carrying it or setting it down.
  carrying(a: Actor): boolean {
    const e = a.mind.errand;
    return e?.kind === 'haul' && (e.step === 'pick' || e.step === 'carry' || e.step === 'place');
  }

  // Not busy with anything that keeps the hands or eyes elsewhere.
  private free(a: Actor): boolean {
    if (a.mind.gestures.length || this.carrying(a) || a.mind.exit) return false;
    const e = a.mind.errand;
    if (!e || e.kind === 'visit' || e.kind === 'haul') return true;
    if (e.kind === 'nap') return false;
    if (e.kind === 'coffee') return e.step !== 'pour';
    return !e.arrived; // on the way to a chat, the critter or an office moment
  }

  private sociable(a: Actor): boolean {
    if (a.gone || a.state === 'enter' || a.state === 'leave') return false;
    if (a.station && a.state === 'work' && working(a)) return false;
    if (a.info.activity === 'idle' && this.sleeping(a)) return false;
    return this.free(a);
  }

  // A gesture holding the character still right now.
  holding(a: Actor): boolean {
    const c = this.clock;
    return a.mind.gestures.some((g) => g.hold && g.at <= c && c < g.until);
  }

  private held(a: Actor): boolean {
    return this.holding(a);
  }

  // Walking pace, of the normal pace.
  pace(a: Actor): number {
    const e = a.mind.errand;
    if (!e) return 1;
    if (e.kind === 'haul') return a.info.activity === 'done' ? 1 : HAUL;
    if (e.kind === 'nap') return 0.8;
    // to a huddle or a high-five with purpose, to a stand-up briskly
    if (e.kind === 'huddle' || e.kind === 'five') return 1;
    if (e.kind === 'standup') return HAUL;
    return WANDER;
  }

  gesture(a: Actor, pose: Pose, secs: number, o: { delay?: number; face?: Spot; hold?: boolean } = {}): void {
    const at = this.clock + (o.delay ?? 0);
    const g: Gesture = { pose, at, until: at + secs, hold: o.hold ?? true };
    if (o.face) g.face = { x: o.face.x, y: o.face.y };
    const gs = a.mind.gestures;
    gs.push(g);
    if (gs.length > 4) gs.splice(0, gs.length - 4);
  }

  // Shows `e` over a's head for `secs` (1 to 2.5), after `delay`.
  emote(a: Actor, e: Emote, secs: number, delay = 0): void {
    const born = this.clock + delay;
    a.mind.emote = { e, born, until: born + Math.max(1, Math.min(2.5, secs)) };
  }

  look(a: Actor, walking: boolean, base: Pose): Look {
    const out = this.looks(a, walking, base);
    if (this.office && a.mind.mug > this.clock) out.mug = true;
    // high-fived with no hand to spare: it only turns to the subagent
    const s = !walking && this.noHand(a) ? this.fiver(a) : null;
    if (s) out.face = { x: s.x, y: s.y };
    return out;
  }

  private looks(a: Actor, walking: boolean, base: Pose): Look {
    const c = this.clock;
    const g = a.mind.gestures.find((q) => q.at <= c && c < q.until);
    if (g) return g.face ? { pose: g.pose, face: g.face } : { pose: g.pose };
    const e = a.mind.errand;
    if (e?.kind === 'haul') {
      const pile = { x: (e.site.pile.x0 + e.site.pile.x1) / 2, y: (e.site.pile.y0 + e.site.pile.y1) / 2 };
      if (e.step === 'carry') return { pose: 'carry', item: e.item };
      if (e.step === 'place') return { pose: 'place', item: e.item, face: e.site.plaza };
      if (e.step === 'pick') return { pose: 'place', face: pile };
      return { pose: walking ? 'walk' : 'idle' };
    }
    if (walking) return { pose: e ? 'walk' : base };
    if (e?.kind === 'visit' && e.arrived) {
      const pose = e.poi.kind === 'drink' ? ((c + a.phase) % 4.5 < 1.6 ? 'drink' : 'idle') : e.pose;
      return e.poi.face ? { pose, face: e.poi.face } : { pose };
    }
    if (e?.kind === 'chat' && e.arrived) {
      const b = this.byId.get(e.with);
      return b ? { pose: 'chat', face: { x: b.x, y: b.y } } : { pose: 'chat' };
    }
    if (e?.kind === 'pet' && e.arrived && this.critter) return { pose: 'pet', face: { x: this.critter.x, y: this.critter.y } };
    if (e?.kind === 'huddle' && e.arrived) {
      // round the lead, nodding along
      const lead = this.byId.get(e.lead);
      return lead ? { pose: 'chat', face: { x: lead.x, y: lead.y } } : { pose: 'chat' };
    }
    if (e?.kind === 'coffee' && e.step === 'pour') return { pose: 'idle', face: e.poi.face ?? e.poi };
    if (e?.kind === 'standup' && e.arrived) {
      const st = this.standups.get(e.crew);
      return st ? { pose: 'idle', face: st.centre } : { pose: 'idle' };
    }
    if (e?.kind === 'five' && e.arrived) {
      const lead = this.byId.get(e.lead);
      return lead ? { pose: 'idle', face: { x: lead.x, y: lead.y } } : { pose: 'idle' };
    }
    // Only sleepers lie down: anyone awake, however long the wait, stands.
    return { pose: base === 'sleep' && !this.sleeping(a) ? 'idle' : base };
  }
}

// The floor spot `sx` units right and `sy` units down the screen from `at`
// (see the projection in worlds/types.ts).
function onScreen(at: Spot, sx: number, sy: number): Spot {
  return { x: at.x + sy + sx / 2, y: at.y + sy - sx / 2 };
}

function poseAt(kind: Poi['kind'], rng: Rng): Pose {
  switch (kind) {
    case 'seat': return 'sit';
    case 'drink': return 'drink';
    case 'dance': return 'dance';
    case 'pet': return 'pet';
    case 'warm': return rng.chance(0.5) ? 'sit' : 'idle';
    default: return 'idle';
  }
}
