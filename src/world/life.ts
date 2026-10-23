import type { RGB } from '../term/color.ts';
import { hex } from '../term/color.ts';
import type { Block, Construction, Works } from '../cave/build.ts';
import type { Critter } from '../cave/critter.ts';
import { hub, slotRect } from '../cave/layout.ts';
import { M } from '../cave/materials.ts';
import type { EmoteSprite, Facing, Layout, Particle, Poi, Slot, SlotKind } from '../cave/types.ts';
import type { Voxels } from '../cave/voxels.ts';
import * as wizard from '../cave/wizard.ts';
import type { Emote, Pose } from './character.ts';
import { Rng, hashString } from './rng.ts';
import type { Actor } from './stage.ts';

// The life between the work: idle characters wander between the spots
// they like (a seat, a drink, a view, the dance floor, the fire, the
// critter), chat with each other, pet the critter and help build; workers
// stretch, sip and look round now and then; everyone waves, flinches at a
// bang and cheers a finish. Every choice comes from the character's own
// seeded Rng, so a scene plays out the same way every time.

export type Spot = { x: number; y: number };

export const SLEEP_AFTER = 150; // seconds idle before a nap: awake long enough to wander, chat and build
const WANDER = 0.7; // walking pace idling about, of the normal pace
const HAUL = 0.85;
const MAX_HAULERS = 4;
const REACT_R = 40; // how far a bang or a cheer carries, voxels
const CHEER_R = 70; // everyone this near a build cheers it finished, and each quarter of the way
const CHAT_GAP = 5; // voxels between two chatting characters
const CHAT_EMOTES: readonly Emote[] = ['note', 'heart', 'idea', 'question'];

// A short pose over whatever else is going on: a wave, a cheer, a flinch,
// a stretch. `hold` stops a walker for its length.
export type Gesture = { pose: Pose; at: number; until: number; face?: Spot; hold: boolean };

export type Errand =
  | { kind: 'visit'; poi: Poi; arrived: boolean; until: number; pose: Pose; since: number; beat: number }
  | { kind: 'chat'; with: string; arrived: boolean; until: number; since: number; beat: number; turn: number }
  | { kind: 'pet'; arrived: boolean; until: number; since: number }
  | { kind: 'haul'; site: Construction; step: 'fetch' | 'pick' | 'carry' | 'place'; until: number; mat: number; trips: number; since: number }
  | { kind: 'nap'; wake: number }; // clock time it next gets up for a moment

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
  };
}

// What a character looks like right now: its pose, what it faces, and the
// material of a block it holds.
export type Look = { pose: Pose; face?: Spot; item?: number };

// What life needs from the stage.
export type LifeHost = {
  walk(a: Actor, to: Spot): void; // off its station and on its way there
  standable(s: Spot): boolean; // on the floor, clear of props, builds and piles
  nap(a: Actor): void; // off to sleep at the idle prop
  leave(a: Actor): void; // out through the entrance
  idleFor(a: Actor): number; // seconds in the current activity
  spawn(p: Particle): void;
  occupied(x: number, y: number, z: number): boolean; // someone stands in this voxel
};

export function faceToward(a: Spot, f: Spot, fallback: Facing): Facing {
  const dx = f.x - a.x;
  const dy = f.y - a.y;
  if (Math.abs(dx) + Math.abs(dy) < 0.3) return fallback;
  return { back: dx + dy < 0, flip: dx - dy < 0 };
}

const working = (a: Actor) => a.info.activity !== 'idle' && a.info.activity !== 'done' && a.info.activity !== 'error';

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
  }

  // The activity changed: whatever they were up to is dropped.
  changed(a: Actor): void {
    const m = a.mind;
    const c = this.clock;
    m.exit = 0;
    this.end(a);
    if (a.info.activity === 'done') m.think = c + 1.6; // celebrate before anything else
    else if (a.info.activity === 'idle') m.think = c + m.rng.range(2.5, 3.5); // a short wait is no reason to wander off
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
  // block lays it first, then goes (true: not yet).
  vanish(a: Actor): boolean {
    const e = a.mind.errand;
    if (a.info.activity === 'done' && e?.kind === 'haul') {
      e.trips = 1;
      if (!a.mind.exit) a.mind.exit = this.clock + 20;
      return true;
    }
    return false;
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
      // Up for a moment, or a block to lay first; then back to bed.
      if (this.clock < m.up || this.carrying(a)) return;
      if (e?.kind === 'nap') {
        if (this.clock >= e.wake && !a.path.length) this.rise(a);
        return;
      }
      this.end(a);
      m.errand = { kind: 'nap', wake: this.clock + m.rng.range(60, 90) };
      this.host.nap(a);
      return;
    }
    if (e?.kind === 'nap') {
      // Idle afresh (a new wait began): up and about again.
      m.errand = null;
      m.think = this.clock + m.rng.range(0.5, 1.5);
    }
    if (!m.errand && this.clock >= m.think && !this.held(a)) this.choose(a);
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
  // one up for a moment only).
  private mateFor(a: Actor): Actor | null {
    let best: Actor | null = null;
    let bd = Infinity;
    for (const b of this.byId.values()) {
      if (b === a || b.info.activity !== 'idle' || b.state === 'enter' || b.state === 'leave' || b.mind.exit) continue;
      if (this.host.idleFor(b) >= SLEEP_AFTER || this.held(b)) continue;
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
    a.mind.errand = { kind: 'haul', site, step: 'fetch', until: 0, mat: 0, trips, since: this.clock };
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
      default:
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
        e.mat = s.nextMat();
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
      this.host.spawn({ kind: 'glint', x: s.plaza.x + r.range(-s.reach, s.reach), y: s.plaza.y + r.range(-s.reach, s.reach), z: s.top.z * r.next(), vx: 0, vy: 0, vz: r.range(1, 4), life: r.range(0.6, 1.4), color: hex('#b8a78f'), glow: false, gravity: 0 });
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

  // A standable spot `d` from `c` at angle `ang`, turning either way to find one.
  private around(c: Spot, d: number, ang: number): Spot {
    for (let k = 0; k < 12; k++) {
      const turn = (k % 2 ? -1 : 1) * Math.ceil(k / 2) * 0.35;
      const s = { x: c.x + Math.cos(ang + turn) * d, y: c.y + Math.sin(ang + turn) * d };
      if (this.host.standable(s)) return s;
    }
    return { x: c.x + Math.cos(ang) * d, y: c.y + Math.sin(ang) * d };
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

  private carrying(a: Actor): boolean {
    const e = a.mind.errand;
    return e?.kind === 'haul' && (e.step === 'pick' || e.step === 'carry' || e.step === 'place');
  }

  // Not busy with anything that keeps the hands or eyes elsewhere.
  private free(a: Actor): boolean {
    if (a.mind.gestures.length || this.carrying(a) || a.mind.exit) return false;
    const e = a.mind.errand;
    if (!e || e.kind === 'visit' || e.kind === 'haul') return true;
    if (e.kind === 'nap') return false;
    return !e.arrived; // on the way to a chat or the critter
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
    const c = this.clock;
    const g = a.mind.gestures.find((q) => q.at <= c && c < q.until);
    if (g) return g.face ? { pose: g.pose, face: g.face } : { pose: g.pose };
    const e = a.mind.errand;
    if (e?.kind === 'haul') {
      const pile = { x: (e.site.pile.x0 + e.site.pile.x1) / 2, y: (e.site.pile.y0 + e.site.pile.y1) / 2 };
      if (e.step === 'carry') return { pose: 'carry', item: e.mat };
      if (e.step === 'place') return { pose: 'place', item: e.mat, face: e.site.plaza };
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
    // Only sleepers lie down: anyone awake, however long the wait, stands.
    return { pose: base === 'sleep' && !this.sleeping(a) ? 'idle' : base };
  }
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

// ── points of interest for scenes that name none ─────────────────────────
// Warm spots and a seat by the idle prop's fire, views of the orb and the
// shelves, a sip from the cauldron, the rim of any pool (water to drink,
// lava to warm by, anything else to look at), a dance floor at the hub and
// the critter's spot in front of it.
export function defaultPois(L: Layout, v: Voxels): Poi[] {
  const out: Poi[] = [];
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number): Spot => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot): Spot => {
    const r = slotRect(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const fire = slot('idle');
  if (fire) {
    out.push({ ...at(fire, -9, 2), kind: 'warm', face: mid(fire) });
    out.push({ ...at(fire, 9, 2), kind: 'warm', face: mid(fire) });
    out.push({ ...at(fire, 4, 9), kind: 'seat', face: mid(fire) });
  }
  const orb = slot('web');
  if (orb) out.push({ ...at(orb, 4, 10), kind: 'view', face: mid(orb) });
  const shelf = slot('read');
  if (shelf) out.push({ ...at(shelf, -5, 10), kind: 'view', face: mid(shelf) });
  const pot = slot('run');
  if (pot) out.push({ ...at(pot, 10, 3), kind: 'drink', face: mid(pot) });
  const h = hub(L);
  for (const p of pools(L, v)) {
    const kind: Poi['kind'] = p.mat === M.WATER ? 'drink' : p.mat === M.LAVA ? 'warm' : 'view';
    const d = Math.hypot(h.x - p.x, h.y - p.y) || 1;
    const ux = (h.x - p.x) / d;
    const uy = (h.y - p.y) / d;
    // Out from the middle of the pool toward the hub, to just past its rim.
    let k = 0;
    while (k < 30 && isLiquid(v.base[v.idx(clampI(p.x + ux * k, 0, L.W - 1), clampI(p.y + uy * k, 0, L.D - 1), L.floor - 1)])) k++;
    out.push({ x: p.x + ux * (k + 2), y: p.y + uy * (k + 2), kind, face: { x: p.x, y: p.y } });
  }
  const g = (L.W - L.T) * 0.13;
  out.push({ x: h.x + 2, y: h.y - 3, kind: 'dance' });
  out.push({ x: h.x - 3, y: h.y + 2, kind: 'dance' });
  out.push({ x: h.x + g, y: h.y + g, kind: 'pet' });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

const clampI = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
const LIQUIDS = new Set<number>([M.WATER, M.OIL, M.LAVA, M.ACID, M.SLUDGE, M.POTION, M.COFFEE]);
const isLiquid = (m: number) => LIQUIDS.has(m);

// The middle of every liquid's pools on the floor (one spot per liquid).
function pools(L: Layout, v: Voxels): Array<{ x: number; y: number; mat: number }> {
  const sum = new Map<number, [number, number, number]>();
  const z = L.floor - 1;
  for (let y = L.T; y < L.D; y += 2) {
    for (let x = L.T; x < L.W; x += 2) {
      const m = v.base[v.idx(x, y, z)];
      if (!isLiquid(m)) continue;
      const s = sum.get(m) ?? [0, 0, 0];
      s[0] += x;
      s[1] += y;
      s[2]++;
      sum.set(m, s);
    }
  }
  return [...sum.entries()].filter(([, s]) => s[2] >= 3).map(([mat, s]) => ({ x: s[0] / s[2], y: s[1] / s[2], mat }));
}

// ── emotes ───────────────────────────────────────────────────────────────
// Drawn by the sprite module when it offers them; until then, tiny glyphs.
const external = (wizard as unknown as { emoteSprite?: (e: Emote, t: number) => EmoteSprite }).emoteSprite;

const GLYPHS: Record<Emote, { rows: string[]; color: string }> = {
  excl: { rows: ['#', '#', '#', '.', '#'], color: '#ff4f3a' },
  question: { rows: ['##.', '..#', '.#.', '...', '.#.'], color: '#8fd3ff' },
  heart: { rows: ['#.#', '###', '.#.'], color: '#ff6b9d' },
  note: { rows: ['.##', '.#.', '##.'], color: '#7ff0c0' },
  idea: { rows: ['.#.', '###', '###', '.#.'], color: '#ffe066' },
  sweat: { rows: ['.#.', '###', '.#.'], color: '#7fc8ff' },
  zzz: { rows: ['###', '.#.', '###'], color: '#c8d0ff' },
  anger: { rows: ['#.#', '.#.', '#.#'], color: '#ff3b3b' },
  star: { rows: ['.#.', '###', '#.#'], color: '#ffd34a' },
  cup: { rows: ['.:.', '##.', '###', '##.'], color: '#f4ead2' },
};

const cache = new Map<Emote, EmoteSprite>();

function glyph(e: Emote): EmoteSprite {
  const hit = cache.get(e);
  if (hit) return hit;
  const g = GLYPHS[e];
  const col = hex(g.color);
  const steam = hex('#cfd8e6');
  const w = Math.max(...g.rows.map((r) => r.length));
  const px = g.rows.map((r) => [...r.padEnd(w, '.')].map((ch) => (ch === '#' ? col : ch === ':' ? steam : null)));
  const sp: EmoteSprite = { w, h: g.rows.length, px, glow: px.map((r) => r.slice()), ax: Math.floor(w / 2), ay: g.rows.length - 1 };
  cache.set(e, sp);
  return sp;
}

export function emoteArt(e: Emote, t: number): EmoteSprite {
  return external ? external(e, t) : glyph(e);
}
