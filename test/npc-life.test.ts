import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, AgentInfo } from '../src/agents.ts';
import { hub } from '../src/world/layout.ts';
import { COFFEE_LEG } from '../src/world/life.ts';
import { NATTER_EVERY, NATTER_S, SERVE_S, SERVE_WAIT } from '../src/world/npcs.ts';
import { toWorld } from '../src/world/room.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Layout, Spot } from '../src/world/types.ts';
import { mines } from '../src/worlds/mines.ts';
import type { NpcAct, WorldDef } from '../src/worlds/types.ts';
import { trio } from './npc-fakes.ts';

// Life with the locals: a coffee run goes to the drink server; idle agents
// order, served one at a time, the next waiting beside; a reaction waits
// for a serve; a show draws a ring of the idle and lets them go, never one
// at work; a word now and then with a local passed; n off ends it all and
// leaves nobody stuck; o off stops only the coffee runs; the same run
// plays the same.

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

test('a show draws the free idle agents into a ring in front, never one at work; they applaud at the end and drift off', () => {
  const stage = newStage();
  stage.office = false;
  const idle = ['i1', 'i2', 'i3', 'i4'];
  const crew = (n: number) => [...idle.map((id) => awake(id, n)), agent('w1', 'write'), agent('w2', 'read')];
  const now = run(stage, crew, 6);
  const host = named(stage, 'pourer');
  stage.life.locals!.nextShow = stage.life.clock;
  const watched = new Set<string>();
  const cheered = new Set<string>();
  let shown = false;
  let ring: Spot[] = [];
  run(stage, crew, 60, now, (n) => {
    if (host.show) shown = true;
    const here: Spot[] = [];
    for (const a of stage.actors()) {
      if (watched.has(a.info.id) && a.mind.gestures.some((g) => g.pose === 'cheer')) cheered.add(a.info.id);
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
  assert.ok(watched.size >= 2, `${watched.size} watched it`);
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) assert.ok(near(ring[i], ring[j]) >= 3 - 1e-6, 'two in the ring on one spot');
  assert.ok(cheered.size >= 2, 'no applause at the end');
  for (const id of watched) assert.notEqual(byId(stage, id).mind.errand?.kind, 'watch', `${id} still watching`);
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
