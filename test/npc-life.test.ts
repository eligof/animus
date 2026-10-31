import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, AgentInfo } from '../src/agents.ts';
import { ACTS } from '../src/art/npc/acts.ts';
import { getTheme, themeIds } from '../src/themes/index.ts';
import { hub } from '../src/world/layout.ts';
import { COFFEE_LEG } from '../src/world/life.ts';
import { NPC_R } from '../src/world/npc-place.ts';
import { NATTER_EVERY, NATTER_S, SERVE_S, SERVE_WAIT, SHOW_EVERY, type Local } from '../src/world/npcs.ts';
import { toWorld } from '../src/world/room.ts';
import { Stage, WORK_APART } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Layout, Spot } from '../src/world/types.ts';
import { mines } from '../src/worlds/mines.ts';
import type { NpcAct, WorldDef } from '../src/worlds/types.ts';
import { trio } from './npc-fakes.ts';

// Life with the locals: a coffee run goes to the drink server; idle agents
// order, served one at a time, the next beckoned up and waiting beside,
// patient from its turn and never cut off mid-serve; a reaction waits for
// a serve, a serve for no more than the act under way; a word keeps the
// counter shut; a show (every 2 to 4 minutes, with two idle agents free
// for it, on a local with nothing on) draws a ring of the idle in every
// world, clear of the workers and the other locals, a spot left free
// taken again, a stand-up waiting for it, and lets them go with a cheer
// for the host, never one at work; a word now and
// then with a local passed; n off ends it all and leaves nobody stuck; o
// off stops only the coffee runs; the same run plays the same.

const NOW = 1_700_000_000_000;
const RECT = { x: 0, y: 1, w: 120, h: 33 };

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});
const awake = (id: string, now: number, extra: Partial<AgentInfo> = {}) => agent(id, 'idle', { since: now - 3000, ...extra });

// The mines with fixed spots round the hub, and three stand-in locals: a
// pourer serving drinks (with a show), a clerk handing out tickets, a
// smith.
const lively: WorldDef = {
  ...mines,
  pois: (L: Layout) => {
    const h = hub(L);
    return [
      { x: Math.round(h.x - 9), y: Math.round(h.y + 3), kind: 'seat', face: h },
      { x: Math.round(h.x + 4), y: Math.round(h.y - 9), kind: 'drink', face: h },
      { x: Math.round(h.x + 2), y: Math.round(h.y + 2), kind: 'dance' },
      { x: Math.round(h.x - 6), y: Math.round(h.y - 8), kind: 'view', face: { x: L.T, y: L.T } },
      { x: Math.round(h.x + 9), y: Math.round(h.y + 9), kind: 'pet' },
    ];
  },
};
const world = trio(lively);

function newStage(w: WorldDef = world, r = RECT): Stage {
  const stage = new Stage(w);
  stage.layout(r);
  return stage;
}

function run(stage: Stage, crew: (now: number) => AgentInfo[], seconds: number, start = NOW, each?: (now: number) => void): number {
  let now = start;
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    stage.sync(crew(now), now);
    stage.update(0.05, now);
    each?.(now);
  }
  return now;
}

const byId = (stage: Stage, id: string): Actor => stage.actors().find((a) => a.info.id === id)!;
// Puts `a` at `s`, standing.
const teleport = (a: Actor, s: Spot) => {
  a.x = s.x;
  a.y = s.y;
  a.path = [];
};
// Where `a` stands, or is going.
const dest = (a: Actor): Spot => a.path[a.path.length - 1] ?? a;
const named = (stage: Stage, name: string) => stage.life.locals!.all.find((l) => l.art.name === name)!;
const near = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
// What local k is doing now.
const actOf = (stage: Stage, k: number): NpcAct => stage.life.locals!.doing(stage.life.locals!.of(k)!, stage.life.clock).act;
const LOCAL = new Set(['order', 'watch', 'natter']);
// On an errand with a local (a coffee run to its counter too).
const withLocal = (a: Actor) => {
  const e = a.mind.errand;
  return !!e && (LOCAL.has(e.kind) || (e.kind === 'coffee' && e.local !== undefined));
};
// The longest anyone has walked on the spot so far (as office-life.test.ts
// has it): call it every frame.
function treadmill(stage: Stage): () => number {
  const last = new Map<Actor, Spot & { secs: number }>();
  let most = 0;
  return () => {
    for (const a of stage.actors()) {
      const was = last.get(a);
      const stuck = !!was && a.state !== 'enter' && a.path.length > 0 && !stage.life.holding(a) && near(a, was) < 0.01;
      const secs = stuck ? was.secs + 0.05 : 0;
      most = Math.max(most, secs);
      last.set(a, { x: a.x, y: a.y, secs });
    }
    return most;
  };
}

test('with office life on, a coffee run goes to the drink server: served in turn at its counter, back with a mug, in time', () => {
  const stage = newStage();
  const bar = named(stage, 'pourer');
  const spots = [bar.at.front, bar.at.wait].filter((s): s is Spot => !!s);
  assert.ok(spots.length, 'nowhere to be served');
  const ids = ['c1', 'c2', 'c3'];
  let handed = false;
  let toBar = 0;
  let back = 0;
  const began = new Map<string, number>();
  run(stage, (n) => ids.map((id) => awake(id, n)), 240, NOW, (n) => {
    if (actOf(stage, bar.k) === 'handOver') handed = true;
    for (const id of ids) {
      const a = byId(stage, id);
      const e = a.mind.errand;
      if (e?.kind !== 'coffee') {
        if (began.has(id)) assert.ok((n - began.get(id)!) / 1000 <= 2 * COFFEE_LEG + SERVE_WAIT + 1, `${id}'s coffee run took too long`);
        began.delete(id);
        continue;
      }
      if (!began.has(id)) began.set(id, n);
      if (e.step === 'go' && e.local === bar.k) toBar++;
      if (e.step === 'pour' && e.local !== undefined) assert.ok(spots.some((s) => near(a, s) < 1.5), 'waiting away from the counter');
      if (e.step === 'back') {
        back++;
        assert.ok(stage.lookOf(a, n).mug, 'back without a mug');
      }
    }
  });
  assert.ok(toBar > 0, 'no coffee run to the server');
  assert.ok(handed, 'the server never handed anything over');
  assert.ok(back > 0, 'nobody came back with a coffee');
});

test('idle agents order from a local: served one at a time, the second waiting beside, each going off with a heart', () => {
  const stage = newStage();
  stage.office = false;
  const now = run(stage, (n) => [awake('o1', n), awake('o2', n)], 3);
  const clerk = named(stage, 'clerk');
  assert.ok(clerk.at.front && clerk.at.wait, 'no room for two at the clerk');
  const [a, b] = [byId(stage, 'o1'), byId(stage, 'o2')];
  assert.ok(stage.life.order(a, clerk.k) && stage.life.order(b, clerk.k), 'no room to order');
  const began = new Map<string, number>();
  const hearts = new Set<string>();
  const was = new Map<string, string | undefined>();
  run(stage, (n) => [awake('o1', n), awake('o2', n)], 40, now, () => {
    if (clerk.serving && !began.has(clerk.serving.id)) began.set(clerk.serving.id, stage.life.clock);
    for (const o of [a, b]) {
      const e = o.mind.errand;
      if (e?.kind === 'order' && e.arrived && e.local === clerk.k) assert.ok(near(o, clerk.at.front!) < 1.5 || near(o, clerk.at.wait!) < 1.5, `${o.info.id} waits away from the counter`);
      if (was.get(o.info.id) === 'order' && e?.kind !== 'order' && o.mind.emote?.e === 'heart') hearts.add(o.info.id);
      was.set(o.info.id, e?.kind);
    }
  });
  assert.deepEqual([...began.keys()].sort(), ['o1', 'o2'], 'not both served');
  const [t1, t2] = [...began.values()].sort((x, y) => x - y);
  assert.ok(t2 - t1 >= SERVE_S - 1e-6, 'two served at once');
  assert.deepEqual([...hearts].sort(), ['o1', 'o2'], 'not both went off with a heart');
});

test('a drink ordered comes back as a mug while office life is on, as a heart while it is off', () => {
  for (const office of [true, false]) {
    const stage = newStage();
    stage.office = office;
    const now = run(stage, (n) => [awake('o', n)], 3);
    const bar = named(stage, 'pourer');
    const a = byId(stage, 'o');
    a.mind.coffee = stage.life.clock; // no coffee run of its own meanwhile
    assert.ok(stage.life.order(a, bar.k));
    let got = '';
    run(stage, (n) => [awake('o', n)], 30, now, () => {
      if (!got && a.mind.errand?.kind !== 'order') got = a.mind.mug > stage.life.clock ? 'a mug' : a.mind.emote?.e === 'heart' ? 'a heart' : 'nothing';
    });
    assert.equal(got, office ? 'a mug' : 'a heart', `office life ${office ? 'on' : 'off'}`);
  }
});

test('a reaction waits for a serve: a finish mid-serve, the hand-over first, then the cheer', () => {
  const stage = newStage();
  stage.office = false;
  let now = run(stage, (n) => [awake('o', n), agent('w', 'write')], 4);
  const clerk = named(stage, 'clerk');
  assert.ok(stage.life.order(byId(stage, 'o'), clerk.k));
  for (let i = 0; i < 30 * 20 && !clerk.serving; i++) now = run(stage, (n) => [awake('o', n), agent('w', 'write')], 0.05, now);
  assert.ok(clerk.serving, 'never served');
  const fin = now;
  const seq: NpcAct[] = [];
  run(stage, (n) => [awake('o', n), agent('w', 'done', { since: fin })], 5, now, () => {
    const act = actOf(stage, clerk.k);
    if (act !== seq[seq.length - 1]) seq.push(act);
  });
  assert.deepEqual(seq.filter((a) => a !== 'work').slice(0, 2), ['handOver', 'cheer'], `in turn: ${seq.join(', ')}`);
});

test('a show draws the free idle agents into a ring in front, never one at work; they cheer the host as it ends and drift off', () => {
  const stage = newStage();
  stage.office = false;
  const idle = ['i1', 'i2', 'i3', 'i4'];
  const crew = (n: number) => [...idle.map((id) => awake(id, n)), agent('w1', 'write'), agent('w2', 'read')];
  const now = run(stage, crew, 6);
  const host = named(stage, 'pourer');
  stage.life.locals!.nextShow = stage.life.clock;
  const watched = new Set<string>();
  let shown = false;
  let ring: Spot[] = [];
  // those there watching the frame before it ended, and when it ends
  let there: string[] = [];
  let until = 0;
  let ended = false;
  run(stage, crew, 60, now, (n) => {
    if (host.show) {
      shown = true;
      until = host.show.until;
      there = stage.actors().filter((a) => a.mind.errand?.kind === 'watch' && (a.mind.errand as { arrived: boolean }).arrived).map((a) => a.info.id);
    } else if (until && !ended) {
      ended = true;
      // each of them cheers, facing the host, as the show ends
      assert.ok(there.length >= 2, `${there.length} there at the end`);
      for (const id of there) {
        const g = byId(stage, id).mind.gestures.find((q) => q.pose === 'cheer');
        assert.ok(g, `${id} did not cheer the show`);
        assert.ok(g.face && near(g.face, host.at) < 1e-9, `${id} cheered facing away from the host`);
        assert.ok(g.at >= until - 1e-9 && g.at <= until + 0.1, `${id} cheered ${(g.at - until).toFixed(2)} s from the end`);
      }
    }
    const here: Spot[] = [];
    for (const a of stage.actors()) {
      const e = a.mind.errand;
      if (e?.kind !== 'watch') continue;
      assert.ok(idle.includes(a.info.id), `${a.info.id}, at work, watching a show`);
      watched.add(a.info.id);
      if (!e.arrived) continue;
      here.push({ x: a.x, y: a.y });
      // (a gesture shows over it a moment: a cheer for a build, a wave)
      if (a.mind.gestures.some((g) => g.at <= stage.life.clock)) continue;
      const look = stage.lookOf(a, n);
      assert.equal(look.pose, 'idle', `${a.info.id} not watching`);
      assert.ok(look.face && near(look.face, host.at) < 1e-9, `${a.info.id} not facing the show`);
    }
    if (here.length > ring.length) ring = here;
  });
  assert.ok(shown, 'no show');
  assert.ok(ended, 'the show never ended');
  assert.ok(watched.size >= 2, `${watched.size} watched it`);
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) assert.ok(near(ring[i], ring[j]) >= 3 - 1e-6, 'two in the ring on one spot');
  for (const id of watched) assert.notEqual(byId(stage, id).mind.errand?.kind, 'watch', `${id} still watching`);
});

test('two waiting, with reactions lined up at every hand-over: each hand-over that starts is seen through, and both are served', () => {
  const stage = newStage();
  stage.office = false;
  const crew = (n: number) => [awake('o1', n), awake('o2', n)];
  let now = run(stage, crew, 4);
  const L = stage.life.locals!;
  const clerk = named(stage, 'clerk');
  const [a, b] = [byId(stage, 'o1'), byId(stage, 'o2')];
  assert.ok(stage.life.order(a, clerk.k) && stage.life.order(b, clerk.k), 'no room to order');
  // both at the counter at once
  for (const o of [a, b]) teleport(o, clerk.queue.find((q) => q.id === o.info.id)!.spot);
  const started = new Set<string>();
  const served = new Set<string>();
  let serving: string | null = null;
  now = run(stage, crew, 20, now, () => {
    const c = stage.life.clock;
    for (const o of [a, b]) {
      if (L.served(clerk.k, o)) served.add(o.info.id);
      // never sent off in the middle of its own hand-over
      if (serving === o.info.id && clerk.serving?.id === o.info.id) assert.equal(o.mind.errand?.kind, 'order', `${o.info.id} gone mid-serve`);
    }
    const id = clerk.serving?.id ?? null;
    if (id && id !== serving) {
      started.add(id);
      // a level-up and a finish come in mid-serve
      L.applaud(c);
      L.celebrate(c);
    }
    if (serving && id !== serving) assert.ok(served.has(serving) || L.served(clerk.k, byId(stage, serving)), `${serving}'s hand-over was cut off`);
    serving = id;
  });
  assert.deepEqual([...started].sort(), ['o1', 'o2'], 'not both handed anything');
  assert.deepEqual([...served].sort(), ['o1', 'o2'], 'not both served');
});

test('four acts lined up, then someone at the counter: served once the act under way is over, never left to go without', () => {
  const stage = newStage();
  stage.office = false;
  const crew = (n: number) => [awake('o', n)];
  let now = run(stage, crew, 4);
  const L = stage.life.locals!;
  const clerk = named(stage, 'clerk');
  const o = byId(stage, 'o');
  for (let i = 0; i < 4; i++) L.applaud(stage.life.clock);
  assert.equal(clerk.acts.length, 4, 'not four lined up');
  now = run(stage, crew, 0.6, now);
  assert.equal(actOf(stage, clerk.k), 'applaud', 'nothing under way');
  assert.ok(stage.life.order(o, clerk.k), 'no room to order');
  teleport(o, clerk.queue[0].spot);
  let arrived = 0;
  let began = 0;
  let served = false;
  run(stage, crew, 12, now, () => {
    const c = stage.life.clock;
    const e = o.mind.errand;
    if (!arrived && e?.kind === 'order' && e.arrived) arrived = c;
    if (!began && clerk.serving?.id === 'o') began = c;
    if (L.served(clerk.k, o)) served = true;
  });
  assert.ok(arrived, 'never at the counter');
  assert.ok(began, 'never served');
  assert.ok(began - arrived <= ACTS.applaud.secs + 0.1, `served ${(began - arrived).toFixed(2)} s after it came: more than the act under way`);
  assert.ok(served, 'went without');
});

test('the turn moves on: the local beckons the next one up before its hand-over, and only with someone waiting', () => {
  const stage = newStage();
  stage.office = false;
  const crew = (n: number) => [awake('o1', n), awake('o2', n)];
  let now = run(stage, crew, 4);
  const clerk = named(stage, 'clerk');
  const [a, b] = [byId(stage, 'o1'), byId(stage, 'o2')];
  assert.ok(stage.life.order(a, clerk.k) && stage.life.order(b, clerk.k), 'no room to order');
  for (const o of [a, b]) teleport(o, clerk.queue.find((q) => q.id === o.info.id)!.spot);
  const seq: NpcAct[] = [];
  now = run(stage, crew, 12, now, () => {
    const act = actOf(stage, clerk.k);
    if (act !== seq[seq.length - 1]) seq.push(act);
  });
  assert.deepEqual(seq.filter((q) => q !== 'work'), ['handOver', 'beckon', 'handOver'], `in turn: ${seq.join(', ')}`);
  // one alone: no beckon
  assert.ok(stage.life.order(a, clerk.k), 'no room to order');
  teleport(a, clerk.queue[0].spot);
  const alone: NpcAct[] = [];
  run(stage, crew, 6, now, () => {
    const act = actOf(stage, clerk.k);
    if (act !== alone[alone.length - 1]) alone.push(act);
  });
  assert.deepEqual(alone.filter((q) => q !== 'work'), ['handOver'], `alone: ${alone.join(', ')}`);
});

test('a local having a word serves nobody until it is over: no counter, no queue', () => {
  const stage = newStage();
  stage.office = false;
  const crew = (n: number) => [awake('a', n), awake('b', n)];
  let now = run(stage, crew, 4);
  const L = stage.life.locals!;
  const clerk = named(stage, 'clerk');
  const [a, b] = [byId(stage, 'a'), byId(stage, 'b')];
  const at = clerk.at.front!;
  assert.equal(L.counter(at), clerk.k, 'the clerk is not the nearest counter');
  L.natter(clerk.k, a, stage.life.clock);
  assert.notEqual(L.counter(at), clerk.k, 'its counter open mid-word');
  assert.equal(L.join(clerk.k, b), null, 'a queue mid-word');
  assert.equal(clerk.queue.length, 0);
  now = run(stage, crew, 6, now);
  assert.equal(clerk.natter, null, 'the word never ended');
  assert.equal(L.counter(at), clerk.k, 'its counter shut after the word');
});

test('a watcher who leaves frees its spot in the ring: the next one free takes it', () => {
  const stage = newStage();
  stage.office = false;
  const idle = Array.from({ length: 10 }, (_, i) => `i${i}`);
  const working = new Set<string>();
  const crew = (n: number) => idle.map((id) => (working.has(id) ? agent(id, 'write') : awake(id, n)));
  let now = run(stage, crew, 6);
  const host = named(stage, 'pourer');
  stage.life.locals!.nextShow = stage.life.clock;
  for (let i = 0; i < 20 * 20 && !host.show; i++) now = run(stage, crew, 0.05, now);
  assert.ok(host.show, 'no show');
  const show = host.show;
  for (let i = 0; i < 10 * 20 && show.crowd.includes(null); i++) now = run(stage, crew, 0.05, now);
  assert.ok(!show.crowd.includes(null), `the ring never filled: ${show.crowd.join(', ')}`);
  // one of them is called away to work
  const k = 0;
  const gone = show.crowd[k]!;
  working.add(gone);
  now = run(stage, crew, 0.05, now);
  assert.notEqual(show.crowd[k], gone, 'its spot still held');
  let taken = '';
  for (let i = 0; i < 6 * 20 && !taken; i++) {
    now = run(stage, crew, 0.05, now);
    const id = show.crowd[k];
    if (id && id !== gone) taken = id;
  }
  assert.ok(taken, 'nobody took the spot left free');
  const t = byId(stage, taken);
  assert.equal(t.mind.errand?.kind, 'watch');
  assert.ok(near(dest(t), show.ring[k]) < 1.5, `${taken} not off to the spot left free`);
  const ids = show.crowd.filter((q) => q !== null);
  assert.equal(new Set(ids).size, ids.length, 'one on two spots');
});

test("a show's ring keeps clear of the agents at their workstations, of where the other locals serve and of one standing", () => {
  const stage = newStage();
  stage.office = false;
  const workers = ['w1', 'w2', 'w3'];
  const crew = (n: number) => [awake('i1', n), awake('i2', n), ...workers.map((id) => agent(id, 'write'))];
  let now = run(stage, crew, 6);
  const host = named(stage, 'pourer');
  const clerk = named(stage, 'clerk');
  const smith = named(stage, 'smith');
  const c = host.at.ring;
  const away = Math.atan2(c.y - host.at.y, c.x - host.at.x);
  const round = (k: number, r = 5): Spot => ({ x: c.x + Math.cos(away + k * (Math.PI / 8)) * r, y: c.y + Math.sin(away + k * (Math.PI / 8)) * r });
  // a worker on the ring's first spot, the clerk serving on the next, the
  // smith standing just past the one after
  const w = byId(stage, 'w1');
  assert.equal(w.station?.kind, 'desk', 'the worker is not at a workstation');
  clerk.at = { ...clerk.at, front: round(-1), wait: null };
  smith.at = { ...smith.at, mode: 'standing', x: round(1, 8.5).x, y: round(1, 8.5).y };
  stage.life.locals!.nextShow = stage.life.clock;
  // where the agents at their workstations stood as it began
  let at: Spot[] = [];
  for (let i = 0; i < 20 * 20 && !host.show; i++) {
    teleport(w, round(0));
    at = stage.actors().filter((a) => a.station?.kind === 'desk').map(dest);
    now = run(stage, crew, 0.05, now);
  }
  assert.ok(host.show, 'no show');
  assert.ok(at.some((p) => near(p, round(0)) < 1e-9), 'the worker was not on the ring');
  for (const s of host.show.ring) {
    for (const p of at) assert.ok(near(s, p) >= WORK_APART - 1e-9, `a watcher ${near(s, p).toFixed(2)} from an agent at work`);
    assert.ok(near(s, clerk.at.front!) >= 3 - 1e-9, `a watcher ${near(s, clerk.at.front!).toFixed(2)} from where the clerk serves`);
    assert.ok(near(s, smith.at) >= NPC_R + 3 - 1e-9, `a watcher ${near(s, smith.at).toFixed(2)} from the smith standing`);
  }
});

test('a show needs two idle agents awake: none with one, one with two', () => {
  const stage = newStage();
  stage.office = false;
  let pair = false;
  const crew = (n: number) => [awake('i1', n), ...(pair ? [awake('i2', n)] : []), agent('w1', 'write'), agent('w2', 'read')];
  let now = run(stage, crew, 6);
  const L = stage.life.locals!;
  L.nextShow = stage.life.clock;
  now = run(stage, crew, 40, now, () => assert.ok(!L.all.some((l) => l.show), 'a show for one'));
  pair = true;
  let shown = false;
  run(stage, crew, 40, now, () => {
    if (L.all.some((l) => l.show)) shown = true;
  });
  assert.ok(shown, 'no show for two');
});

// Those in local l's show's ring at their spots in it now.
const ringed = (stage: Stage, l: Local): number =>
  l.show?.crowd.filter((id, k) => {
    const a = id === null ? undefined : byId(stage, id);
    const e = a?.mind.errand;
    return !!a && e?.kind === 'watch' && e.arrived && near(a, l.show!.ring[k]) < 1.5;
  }).length ?? 0;

test("in every world, a show with idle agents free for it draws a ring: two or more at their spots in it by 12 s in", () => {
  // (a scene where every world's show local has its place)
  const rect = { x: 0, y: 1, w: 150, h: 42 };
  for (const id of themeIds()) {
    const stage = newStage(getTheme(id)!, rect);
    stage.office = false;
    const crew = (n: number) => [...['i1', 'i2', 'i3', 'i4'].map((q) => awake(q, n)), agent('w1', 'write')];
    let now = run(stage, crew, 6);
    const L = stage.life.locals!;
    L.nextShow = stage.life.clock;
    let host: Local | undefined;
    let from = 0;
    let most = 0;
    for (let i = 0; i < 40 * 20; i++) {
      now = run(stage, crew, 0.05, now);
      if (!host) {
        host = L.all.find((l) => l.show);
        from = stage.life.clock;
      }
      if (!host?.show) continue;
      if (stage.life.clock - from > 12) break;
      most = Math.max(most, ringed(stage, host));
    }
    assert.ok(host, `${id}: no show`);
    assert.ok(most >= 2, `${id}: ${most} at their spots round the ${host.art.name} 12 s into its show`);
  }
});

test('a show waits for two idle agents free for it: none while they are all in a stand-up, one with a ring once it is over', () => {
  const stage = newStage();
  const crew = (n: number) => ['c1', 'c2', 'c3', 'c4'].map((id) => awake(id, n, { crew: 'c' }));
  const kind = (a: Actor) => a.mind.errand?.kind;
  let now = NOW;
  for (let i = 0; i < 20 * 20 && !stage.actors().every((a) => kind(a) === 'standup'); i++) now = run(stage, crew, 0.05, now);
  assert.ok(stage.actors().every((a) => kind(a) === 'standup'), 'no stand-up');
  const L = stage.life.locals!;
  L.nextShow = stage.life.clock;
  let host: Local | undefined;
  let most = 0;
  run(stage, crew, 50, now, () => {
    const up = stage.actors().filter((a) => kind(a) === 'standup').length;
    host ??= L.all.find((l) => l.show);
    if (!host) return;
    assert.ok(up <= 2, `a show with ${up} of the four in a stand-up`);
    most = Math.max(most, ringed(stage, host));
  });
  assert.ok(host, 'no show once the stand-up was over');
  assert.ok(most >= 2, `${most} at their spots in the ring`);
});

test('a stand-up waits for a show: it takes nobody watching one, and the crew stands up once it is over', () => {
  const stage = newStage();
  const crew = (n: number) => ['c1', 'c2', 'c3', 'c4'].map((id) => awake(id, n, { crew: 'c' }));
  const kind = (a: Actor) => a.mind.errand?.kind;
  // no stand-up yet: one only just over
  const last = (stage.life as unknown as { lastStandup: Map<string, number> }).lastStandup;
  last.set('c', stage.life.clock);
  let now = run(stage, crew, 6);
  const L = stage.life.locals!;
  L.nextShow = stage.life.clock;
  let host: Local | undefined;
  for (let i = 0; i < 20 * 20 && !host; i++) {
    now = run(stage, crew, 0.05, now);
    host = L.all.find((l) => l.show);
  }
  assert.ok(host, 'no show');
  // a stand-up due now
  last.delete('c');
  let most = 0;
  let after = false;
  run(stage, crew, 40, now, () => {
    const up = stage.actors().filter((a) => kind(a) === 'standup');
    if (host!.show) {
      for (const a of up) assert.fail(`${a.info.id} off to a stand-up from the show`);
      most = Math.max(most, ringed(stage, host!));
    } else if (up.length) after = true;
  });
  assert.ok(most >= 2, `${most} at their spots in the ring`);
  assert.ok(after, 'no stand-up once the show was over');
});

test('shows come every 2 to 4 minutes', () => {
  const stage = newStage();
  stage.office = false;
  const crew = (n: number) => ['i1', 'i2', 'i3'].map((id) => awake(id, n));
  const L = stage.life.locals!;
  const from = stage.life.clock;
  assert.ok(L.nextShow - from >= SHOW_EVERY[0] && L.nextShow - from <= SHOW_EVERY[1], `the first due ${(L.nextShow - from).toFixed(1)} s in`);
  const starts: number[] = [];
  let on = false;
  run(stage, crew, SHOW_EVERY[1] + 20, NOW, () => {
    const now = L.all.some((l) => l.show);
    if (now && !on) {
      const c = stage.life.clock;
      starts.push(c);
      assert.ok(L.nextShow - c >= SHOW_EVERY[0] && L.nextShow - c <= SHOW_EVERY[1], `the next due ${(L.nextShow - c).toFixed(1)} s after it`);
    }
    on = now;
  });
  assert.ok(starts.length >= 1, 'no show in four minutes');
  assert.ok(starts[0] - from >= SHOW_EVERY[0], `the first ${(starts[0] - from).toFixed(1)} s in`);
});

test('no show starts on a busy local: one with a queue, one serving, one having a word, one with an act lined up', () => {
  const cases: Array<[string, (stage: Stage) => void]> = [
    ['a queue', (stage) => assert.ok(stage.life.order(byId(stage, 'i1'), named(stage, 'pourer').k))],
    ['a serve', (stage) => void (named(stage, 'pourer').serving = { id: 'i1', until: stage.life.clock + 30 })],
    ['a word', (stage) => stage.life.locals!.natter(named(stage, 'pourer').k, byId(stage, 'i1'), stage.life.clock)],
    ['an act', (stage) => stage.life.locals!.applaud(stage.life.clock)],
    ['nothing', () => {}],
  ];
  for (const [what, make] of cases) {
    const stage = newStage();
    stage.office = false;
    const crew = (n: number) => ['i1', 'i2', 'i3'].map((id) => awake(id, n));
    let now = run(stage, crew, 6);
    const host = named(stage, 'pourer');
    const busy = () => host.acts.length || host.queue.length || host.natter || host.serving;
    for (let i = 0; i < 30 * 20 && busy(); i++) now = run(stage, crew, 0.05, now);
    assert.ok(!busy(), `${what}: never free`);
    make(stage);
    stage.life.locals!.nextShow = stage.life.clock;
    run(stage, crew, 0.05, now);
    assert.equal(!!host.show, what === 'nothing', `${what}: ${host.show ? 'a show' : 'no show'}`);
  }
});

test('a show waits for an act under way: it plays to its end, then the show', () => {
  const stage = newStage();
  stage.office = false;
  const crew = (n: number) => ['i1', 'i2', 'i3'].map((id) => awake(id, n));
  const now = run(stage, crew, 6);
  const L = stage.life.locals!;
  const host = named(stage, 'pourer');
  L.applaud(stage.life.clock);
  const seq: Array<[NpcAct, number]> = [];
  let set = false;
  run(stage, crew, 15, now, () => {
    const d = L.doing(host, stage.life.clock);
    if (!set && d.act === 'applaud') {
      // due now, in the middle of it
      L.nextShow = stage.life.clock;
      set = true;
    }
    const last = seq[seq.length - 1];
    if (!last || last[0] !== d.act || last[1] !== d.frame) seq.push([d.act, d.frame]);
  });
  const acts = seq.map(([a]) => a);
  const clap = seq.filter(([a]) => a === 'applaud').map(([, f]) => f);
  assert.equal(Math.max(...clap), ACTS.applaud.frames - 1, 'the applause cut off');
  assert.ok(acts.includes('show'), 'no show');
  assert.ok(acts.indexOf('show') > acts.lastIndexOf('applaud'), 'the show over the applause');
});

test('an idle agent passing a free local stops for a word now and then: speech marks both ways, at most one a minute an agent', () => {
  const stage = newStage();
  stage.office = false;
  const clerk = named(stage, 'clerk');
  const prop = stage.room()!.props[clerk.at.prop];
  const at = (u: number, v: number): Spot => {
    const [x, y] = toWorld(prop, u, v, 0);
    return { x, y };
  };
  // spots to wander between, all near the clerk's counter
  const standable = (stage as unknown as { standable(s: Spot): boolean }).standable.bind(stage);
  const spots = [at(1, prop.dep + 4), at(11, prop.dep + 4), at(6, prop.dep + 7)];
  for (const s of spots) assert.ok(standable(s), `no standing at ${s.x}, ${s.y}`);
  stage.life.pois = spots.map((s) => ({ ...s, kind: 'view' as const }));
  const ids = ['n1', 'n2', 'n3'];
  const starts = new Map<string, number[]>();
  let answered = false;
  run(stage, (n) => ids.map((id) => awake(id, n)), 240, NOW, () => {
    const c = stage.life.clock;
    for (const id of ids) {
      const a = byId(stage, id);
      const e = a.mind.errand;
      if (e?.kind !== 'natter' || e.since !== c) continue;
      starts.set(id, [...(starts.get(id) ?? []), c]);
      assert.equal(a.mind.emote?.e, 'speech', 'no word from the agent');
      assert.ok(e.until - e.since <= NATTER_S + 1e-9);
    }
    if (stage.life.locals!.all.some((l) => l.emotes.some((q) => q.e === 'speech' && q.born <= c))) answered = true;
  });
  const all = [...starts.values()].flat();
  assert.ok(all.length >= 2, `${all.length} words in four minutes`);
  for (const s of starts.values()) for (let k = 1; k < s.length; k++) assert.ok(s[k] - s[k - 1] >= NATTER_EVERY - 1e-6, 'two words within a minute');
  assert.ok(answered, 'no local answered');
});

test('n off ends every errand with a local at once, and nobody is left stuck', () => {
  const stage = newStage();
  stage.office = false;
  const ids = ['a1', 'a2', 'a3', 'a4'];
  const crew = (n: number) => ids.map((id) => awake(id, n));
  let now = run(stage, crew, 4);
  stage.life.locals!.nextShow = stage.life.clock;
  for (let i = 0; i < 30 * 20 && !stage.actors().some((a) => a.mind.errand?.kind === 'watch'); i++) now = run(stage, crew, 0.05, now);
  assert.ok(stage.actors().some((a) => a.mind.errand?.kind === 'watch'), 'no show to end');
  const other = stage.actors().find((a) => a.mind.errand?.kind !== 'watch');
  if (other) stage.life.order(other, named(stage, 'clerk').k);
  stage.npcs = false;
  for (const a of stage.actors()) assert.ok(!withLocal(a), `${a.info.id} still on a ${a.mind.errand?.kind}`);
  const stuck = treadmill(stage);
  now = run(stage, crew, 30, now, () => {
    for (const a of stage.actors()) assert.ok(!withLocal(a), `${a.info.id} on a ${a.mind.errand?.kind}`);
    assert.ok(stuck() < 2, 'someone walking on the spot');
  });
  assert.equal(stage.frame(now)!.npcs, undefined);
});

test('o off stops the coffee runs to the server, not the orders', () => {
  const stage = newStage();
  run(stage, (n) => [awake('o', n), awake('p', n)], 3);
  const bar = named(stage, 'pourer');
  const clerk = named(stage, 'clerk');
  const [o, p] = [byId(stage, 'o'), byId(stage, 'p')];
  // o on its way for a coffee from the server, p ordering a ticket
  stage.life.end(o);
  const spot = stage.life.locals!.join(bar.k, o)!;
  o.mind.errand = { kind: 'coffee', step: 'go', poi: { ...spot, kind: 'drink', face: { x: bar.at.x, y: bar.at.y } }, from: { x: o.x, y: o.y }, until: 0, since: stage.life.clock, local: bar.k };
  assert.ok(stage.life.order(p, clerk.k));
  stage.office = false;
  assert.equal(o.mind.errand, null, 'the coffee run went on');
  assert.ok(!bar.queue.some((q) => q.id === 'o'), 'still waiting at the counter');
  assert.equal(p.mind.errand?.kind, 'order', 'the order ended with office life');
});

test('the same run plays the same, locals and all', () => {
  const trace = () => {
    const stage = newStage();
    stage.life.locals!.nextShow = 20;
    const out: string[] = [];
    run(stage, (n) => [awake('a', n), awake('b', n), awake('c', n), agent('w', 'write')], 60, NOW, (n) => {
      if ((n - NOW) % 1000 !== 0) return;
      const who = stage.actors().map((a) => `${a.x.toFixed(2)},${a.y.toFixed(2)},${a.mind.errand?.kind ?? '-'}`);
      const locals = stage.frame(n)!.npcs!.map((q) => `${q.act}${q.frame}`);
      out.push([...who, ...locals].join(';'));
    });
    return out.join('|');
  };
  assert.equal(trace(), trace());
});
