import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, AgentInfo } from '../src/agents.ts';
import { DemoSource } from '../src/demo/source.ts';
import { COFFEE_LEG, COFFEE_POUR, FIVE_S, FIVE_WALK, HUDDLE_EVERY, HUDDLE_GATHER, HUDDLE_S, SLEEP_AFTER, STANDUP_EVERY, STANDUP_GATHER, STANDUP_S } from '../src/world/life.ts';
import type { Errand } from '../src/world/life.ts';
import { hub } from '../src/world/layout.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Layout, Spot } from '../src/world/types.ts';
import { WORLDS } from '../src/worlds/index.ts';
import { mines } from '../src/worlds/mines.ts';
import type { WorldDef } from '../src/worlds/types.ts';

// Office life: the kick-off huddle, coffee runs, high-fives and stand-ups.
// Each fires when its trigger happens and not otherwise, ends within its
// time, never takes a working agent from its workstation, and lets go of
// an agent the moment it is given work; the demo crew shows all four.

const NOW = 1_700_000_000_000;
// The smallest room (72 units), as the life tests use.
const RECT = { x: 0, y: 1, w: 80, h: 21 };

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});
// Waiting, but only just: awake however long the test runs.
const awake = (id: string, now: number, extra: Partial<AgentInfo> = {}) => agent(id, 'idle', { since: now - 3000, ...extra });

// The mines with fixed spots round the hub (a drink among them), so these
// tests do not hang on how a world dresses its floor.
const lively: WorldDef = {
  ...mines,
  npcs: [],
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

function newStage(world: WorldDef = lively, r = RECT): Stage {
  const stage = new Stage(world);
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

const find = (stage: Stage, id: string): Actor | undefined => stage.actors().find((a) => a.info.id === id);
const byId = (stage: Stage, id: string): Actor => find(stage, id)!;
const kindOf = (a: Actor | undefined): Errand['kind'] | undefined => a?.mind.errand?.kind;
// An agent's own workstation's desk (none: undefined).
const own = (stage: Stage, id: string) => stage.workstations().find((w) => w.owner === id)?.desk;
const OFFICE = new Set(['huddle', 'coffee', 'five', 'standup']);
const gap = (a: Spot, b: Spot) => Math.hypot(a.x - b.x, a.y - b.y);
const confetti = (stage: Stage, now: number) => stage.frame(now, null)!.particles.filter((p) => p.kind === 'confetti').length;
// The floor spot `sx` units right and `sy` units down the screen from `at`
// (as life.ts places spots round someone).
const onScreen = (at: Spot, sx: number, sy: number): Spot => ({ x: at.x + sy + sx / 2, y: at.y + sy - sx / 2 });
const standableIn = (stage: Stage) => (stage as unknown as { standable(s: Spot): boolean }).standable.bind(stage);
// Talking right now (a stand-up's turn, a lead to its huddle); and none of
// office life's poses or its speech mark showing.
const talking = (stage: Stage, a: Actor) => a.mind.gestures.some((g) => g.pose === 'talk' && g.at <= stage.life.clock && stage.life.clock < g.until);
const OFFICE_POSES = new Set(['talk', 'sip', 'highfive']);
const quiet = (stage: Stage, a: Actor, now: number) => !OFFICE_POSES.has(stage.lookOf(a, now).pose) && !a.mind.gestures.some((g) => OFFICE_POSES.has(g.pose)) && a.mind.emote?.e !== 'speech';

// The longest anyone has walked on the spot so far (a path to follow, not
// held by a gesture, yet not moving), in seconds: call it every frame.
function treadmill(stage: Stage): () => number {
  const last = new Map<Actor, Spot & { secs: number }>();
  let most = 0;
  return () => {
    for (const a of stage.actors()) {
      const was = last.get(a);
      const stuck = !!was && a.state !== 'enter' && a.path.length > 0 && !stage.life.holding(a) && gap(a, was) < 0.01;
      const secs = stuck ? was.secs + 0.05 : 0;
      most = Math.max(most, secs);
      last.set(a, { x: a.x, y: a.y, secs });
    }
    return most;
  };
}

// ── the kick-off huddle ─────────────────────────────────────────────────

test('subagents a lead starts within a few seconds gather round it, nodding along under its speech mark, then each goes to its workstation', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const desk = byId(stage, 'L').station;
  assert.ok(desk && desk === own(stage, 'L'), 'the lead is not at its workstation');
  const t0 = now;
  const crew = (n: number) => [lead, ...(n > t0 ? [agent('s1', 'think', { parentId: 'L', since: t0 })] : []), ...(n > t0 + 1500 ? [agent('s2', 'think', { parentId: 'L', since: t0 + 1500 })] : [])];
  const there = new Set<string>();
  let speech = false;
  let over = -1;
  now = run(stage, crew, HUDDLE_GATHER + HUDDLE_S + 8, now, (n) => {
    const L = byId(stage, 'L');
    assert.equal(L.station, desk, 'the working lead left its desk');
    if (L.mind.emote?.e === 'speech') speech = true;
    for (const id of ['s1', 's2']) {
      const a = find(stage, id);
      const e = a?.mind.errand;
      if (e?.kind !== 'huddle' || !e.arrived) continue;
      there.add(id);
      assert.ok(gap(a!, L) < 9, `${id} is ${gap(a!, L).toFixed(1)} from its lead`);
    }
    if (there.size === 2 && over < 0 && ['s1', 's2'].every((id) => kindOf(find(stage, id)) !== 'huddle')) over = n;
  });
  assert.deepEqual([...there].sort(), ['s1', 's2'], 'both gathered round the lead');
  assert.ok(speech, 'no speech mark over the lead');
  assert.ok(over > 0 && (over - t0) / 1000 <= HUDDLE_GATHER + HUDDLE_S + 1, 'the huddle never ended');
  // Off to work: each at its own workstation.
  run(stage, crew, 6, now);
  for (const id of ['s1', 's2']) assert.ok(own(stage, id) && byId(stage, id).station === own(stage, id), `${id} is not at its workstation`);
});

test('in a huddle the newcomers nod along, facing their lead', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const t0 = now;
  let looked = false;
  run(stage, (n) => [lead, ...(n > t0 ? [agent('s1', 'think', { parentId: 'L', since: t0 })] : [])], HUDDLE_GATHER, now, (n) => {
    const a = find(stage, 's1');
    const e = a?.mind.errand;
    if (e?.kind !== 'huddle' || !e.arrived || a!.path.length) return;
    const look = stage.lookOf(a!, n);
    assert.equal(look.pose, 'chat');
    const L = byId(stage, 'L');
    assert.ok(look.face && Math.hypot(look.face.x - L.x, look.face.y - L.y) < 0.5, 'not facing its lead');
    looked = true;
  });
  assert.ok(looked, 'never stood in the huddle');
});

// Past the six spots fanned round the lead (or with some of them blocked)
// newcomers once stood on top of each other.
test('eight newcomers huddle round their lead in every world, each on a spot of its own', () => {
  const subs = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'];
  for (const world of WORLDS) {
    const stage = newStage(world);
    const lead = agent('L', 'write', { role: 'lead' });
    let t0 = 0;
    const crew = (n: number) => [lead, ...(t0 && n > t0 ? subs.map((id) => agent(id, 'think', { parentId: 'L', since: t0 })) : [])];
    let now = run(stage, crew, 6);
    t0 = now;
    let most = 0;
    run(stage, crew, HUDDLE_GATHER, now, () => {
      const L = byId(stage, 'L');
      const there = subs.map((id) => find(stage, id)).filter((a): a is Actor => {
        const e = a?.mind.errand;
        return e?.kind === 'huddle' && e.arrived && !a!.path.length;
      });
      most = Math.max(most, there.length);
      for (const a of there) {
        assert.ok(gap(a, L) >= 3.5, `${world.id}: ${a.info.id} ${gap(a, L).toFixed(1)} from its lead`);
        for (const b of there) if (a !== b) assert.ok(gap(a, b) >= 2.5, `${world.id}: ${a.info.id} and ${b.info.id} ${gap(a, b).toFixed(1)} apart`);
      }
    });
    assert.ok(most >= 6, `${world.id}: only ${most} gathered`);
  }
});

// A newcomer held up `hold` seconds on its way in, another joining three
// seconds later held up for good: when the first got to its spot and when
// its huddle let it go, from when it joined; and whether the huddle began.
function lateHuddle(hold: number): { there: number; took: number; began: boolean } {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  const now = run(stage, () => [lead], 6);
  const t0 = now;
  const crew = (n: number) => [
    lead,
    ...(n > t0 ? [agent('s1', 'think', { parentId: 'L', since: t0 })] : []),
    ...(n > t0 + 3000 ? [agent('s2', 'think', { parentId: 'L', since: t0 + 3000 })] : []),
  ];
  let joined = 0;
  let held = false;
  let there = 0;
  let over = 0;
  let began = false;
  run(stage, crew, HUDDLE_GATHER + HUDDLE_S + 8, now, (n) => {
    const [s1, s2] = [find(stage, 's1'), find(stage, 's2')];
    if (!joined && kindOf(s1) === 'huddle') joined = n;
    if (joined && !held && s1!.state !== 'enter') {
      held = true;
      if (hold) stage.life.gesture(s1!, 'idle', hold);
    }
    if (s2 && kindOf(s2) === 'huddle' && !s2.mind.gestures.length) stage.life.gesture(s2, 'idle', 30);
    const e = s1?.mind.errand;
    if (!there && e?.kind === 'huddle' && e.arrived) there = n;
    if (byId(stage, 'L').mind.emote?.e === 'speech') began = true;
    if (joined && !over && kindOf(s1) !== 'huddle') over = n;
  });
  return { there: (there - joined) / 1000, took: (over - joined) / 1000, began };
}

// Getting there a second before giving up, it once stood waiting
// HUDDLE_WAIT more for the other, then the huddle: 17.5 s at most.
test('a huddle keeps a newcomer HUDDLE_GATHER + HUDDLE_S at most, however late it got there', () => {
  const walk = lateHuddle(0).there;
  const late = lateHuddle(HUDDLE_GATHER - 1 - walk);
  assert.ok(late.there > HUDDLE_GATHER - 2 && late.there < HUDDLE_GATHER, `got there after ${late.there} s`);
  assert.ok(late.began, 'no huddle');
  assert.ok(late.took <= HUDDLE_GATHER + HUDDLE_S + 0.1, `kept ${late.took} s`);
});

test('at most one huddle a lead every 30 seconds', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const t0 = now;
  const late = t0 + 10_000; // after the first huddle, within HUDDLE_EVERY
  const later = t0 + (HUDDLE_EVERY + 5) * 1000;
  const crew = (n: number) => [
    lead,
    ...(n > t0 ? [agent('s1', 'think', { parentId: 'L', since: t0 })] : []),
    ...(n > late ? [agent('s2', 'think', { parentId: 'L', since: late })] : []),
    ...(n > later ? [agent('s3', 'think', { parentId: 'L', since: later })] : []),
  ];
  const huddled = new Set<string>();
  run(stage, crew, HUDDLE_EVERY + 15, now, () => {
    for (const id of ['s1', 's2', 's3']) if (kindOf(find(stage, id)) === 'huddle') huddled.add(id);
  });
  assert.deepEqual([...huddled].sort(), ['s1', 's3']);
});

test('no huddle when the lead is not in the room or the first task is already running', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const t0 = now;
  const crew = (n: number) => [
    lead,
    ...(n > t0 ? [agent('busy', 'read', { parentId: 'L', since: t0 }), agent('orphan', 'think', { parentId: 'nobody', since: t0 })] : []),
  ];
  run(stage, crew, 10, now, () => {
    for (const id of ['busy', 'orphan']) assert.notEqual(kindOf(find(stage, id)), 'huddle', `${id} huddled`);
  });
});

test('a newcomer given its first task mid-huddle leaves for its workstation at once', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let now = run(stage, () => [lead], 6);
  const t0 = now;
  let given = 0;
  let checked = false;
  run(stage, (n) => [lead, ...(n > t0 ? [agent('s1', given ? 'read' : 'think', { parentId: 'L', since: given || t0 })] : [])], HUDDLE_GATHER, now, (n) => {
    const a = find(stage, 's1');
    if (!given && kindOf(a) === 'huddle') given = n + 50; // the next sync brings its first task
    else if (given && n >= given && !checked) {
      assert.notEqual(kindOf(a), 'huddle');
      assert.ok(own(stage, 's1') && a!.station === own(stage, 's1'), 'not on its way to its workstation');
      checked = true;
    }
  });
  assert.ok(checked, 'never joined the huddle');
});

// It went on talking (held still, its speech mark up) for up to the
// whole huddle.
test('a lead talking to its huddle stops at once when it is given work, or office life is turned off', () => {
  for (const how of ['work', 'off'] as const) {
    const stage = newStage();
    let work = 0;
    let t0 = 0;
    const crew = (n: number) => [
      work ? agent('L', 'write', { role: 'lead', since: work }) : awake('L', n, { role: 'lead' }),
      ...(t0 && n > t0 ? ['s1', 's2'].map((id) => agent(id, 'think', { parentId: 'L', since: t0 })) : []),
    ];
    let now = run(stage, crew, 6);
    t0 = now;
    const L = byId(stage, 'L');
    for (let i = 0; i < HUDDLE_GATHER * 20 && !talking(stage, L); i++) now = run(stage, crew, 0.05, now);
    assert.ok(talking(stage, L) && L.mind.emote?.e === 'speech', `${how}: the lead never talked to its huddle`);
    if (how === 'off') stage.office = false;
    else work = now + 50; // the next sync brings its work
    now = run(stage, crew, 0.05, now);
    assert.ok(quiet(stage, L, now), `${how}: the lead goes on talking`);
  }
});

// ── coffee runs ─────────────────────────────────────────────────────────

test('an idle agent goes for a coffee and comes back with a mug, sipping from it, also at work', () => {
  const stage = newStage();
  const ids = ['c1', 'c2', 'c3'];
  let work = '';
  let at = 0;
  const drink = stage.pois().find((p) => p.kind === 'drink')!;
  const poured = new Set<string>();
  let sipIdle = false;
  let sipWork = false;
  let mugAtWork = false;
  run(stage, (n) => ids.map((id) => (id === work ? agent(id, 'write', { since: at }) : awake(id, n))), 240, NOW, (n) => {
    for (const id of ids) {
      const a = byId(stage, id);
      const e = a.mind.errand;
      if (e?.kind === 'coffee' && e.step === 'pour') {
        poured.add(id);
        assert.ok(Math.hypot(a.x - drink.x, a.y - drink.y) < 2, 'pouring away from the drink spot');
      }
      const mug = !!stage.lookOf(a, n).mug;
      const sip = a.mind.gestures.some((g) => g.pose === 'sip' && g.at <= stage.life.clock);
      if (mug && sip && id !== work) sipIdle = true;
      // The first with a mug is given work a few seconds later.
      if (mug && !work && sipIdle) {
        work = id;
        at = n;
      }
      if (id === work && a.state === 'work' && a.station && a.station === own(stage, id)) {
        if (mug) mugAtWork = true;
        if (sip) sipWork = true;
        assert.notEqual(kindOf(a), 'coffee', 'a worker on a coffee run');
      }
    }
  });
  assert.ok(poured.size >= 1, 'nobody went for a coffee');
  assert.ok(sipIdle, 'no sip standing about');
  assert.ok(mugAtWork && sipWork, `the mug at work: carried ${mugAtWork}, sipped ${sipWork}`);
});

// An agent that hit an error with a mug in hand went on sipping, smiling,
// a quarter of the time.
test('an agent in error never sips: its error shows, even over a sip under way', () => {
  const stage = newStage();
  let err = 0;
  const crew = () => [agent('e', err ? 'error' : 'write', { since: err || NOW })];
  let now = run(stage, crew, 8);
  const a = byId(stage, 'e');
  a.mind.mug = stage.life.clock + 60;
  a.mind.sip = stage.life.clock;
  now = run(stage, crew, 0.5, now);
  assert.equal(stage.lookOf(a, now).pose, 'sip', 'no sip under way at its desk');
  err = now + 50; // the next sync brings the error
  const other = new Set<string>();
  run(stage, crew, 40, now, (n) => {
    const pose = stage.lookOf(a, n).pose;
    if (n >= err && pose !== 'error') other.add(pose);
  });
  assert.deepEqual([...other], [], 'shown over the error');
});

test('in a room with no drink spot open, a coffee run goes to a warm one', () => {
  const dry: WorldDef = {
    ...mines,
    npcs: [],
    pois: (L: Layout) => {
      const h = hub(L);
      return [
        { x: Math.round(h.x - 9), y: Math.round(h.y + 3), kind: 'warm', face: h },
        { x: Math.round(h.x + 2), y: Math.round(h.y + 2), kind: 'dance' },
        { x: Math.round(h.x + 9), y: Math.round(h.y + 9), kind: 'pet' },
      ];
    },
  };
  const stage = newStage(dry);
  const warm = stage.pois().find((p) => p.kind === 'warm')!;
  const ids = ['c1', 'c2', 'c3'];
  let poured = 0;
  run(stage, (n) => ids.map((id) => awake(id, n)), 240, NOW, () => {
    for (const id of ids) {
      const a = byId(stage, id);
      const e = a.mind.errand;
      if (e?.kind !== 'coffee' || e.step !== 'pour') continue;
      assert.equal(e.poi, warm, 'a coffee run to somewhere else');
      poured++;
    }
  });
  assert.ok(poured > 0, 'no coffee run');
});

test('a coffee run ends within its time, and one agent goes for one at most every few minutes', () => {
  const stage = newStage();
  const ids = ['c1', 'c2', 'c3'];
  const runs = new Map<string, number[]>();
  const began = new Map<string, number>();
  run(stage, (n) => ids.map((id) => awake(id, n)), 400, NOW, (n) => {
    for (const id of ids) {
      const on = kindOf(byId(stage, id)) === 'coffee';
      if (on && !began.has(id)) began.set(id, n);
      if (!on && began.has(id)) {
        const secs = (n - began.get(id)!) / 1000;
        assert.ok(secs <= 2 * COFFEE_LEG + COFFEE_POUR + 1, `${id}'s coffee run took ${secs} s`);
        runs.set(id, [...(runs.get(id) ?? []), began.get(id)!]);
        began.delete(id);
      }
    }
  });
  const all = [...runs.values()].flat();
  assert.ok(all.length >= 2, `${all.length} coffee runs in 400 s`);
  for (const starts of runs.values()) for (let k = 1; k < starts.length; k++) assert.ok(starts[k] - starts[k - 1] >= 150_000, 'two coffee runs within 150 s');
});

test('an agent given work on a coffee run goes straight to its workstation', () => {
  const stage = newStage();
  const ids = ['c1', 'c2', 'c3'];
  let work = '';
  let at = 0;
  let checked = false;
  run(stage, (n) => ids.map((id) => (id === work ? agent(id, 'write', { since: at }) : awake(id, n))), 240, NOW, (n) => {
    for (const id of ids) {
      const a = byId(stage, id);
      if (!work && kindOf(a) === 'coffee') {
        work = id;
        at = n + 50; // the next sync brings its work
      } else if (id === work && n >= at && !checked) {
        assert.notEqual(kindOf(a), 'coffee', `${id} went on with its coffee run`);
        assert.ok(own(stage, id) && a.station === own(stage, id), `${id} is not on its way to its workstation`);
        checked = true;
      }
    }
  });
  assert.ok(checked, 'nobody went for a coffee');
});

// ── high-fives ──────────────────────────────────────────────────────────

test('a finished subagent high-fives its lead before the finale; a working lead only turns and raises a hand at its desk', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let done = 0;
  const crew = () => [lead, agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
  let now = run(stage, crew, 10);
  const desk = byId(stage, 'L').station;
  assert.ok(own(stage, 's') && byId(stage, 's').station === own(stage, 's'), 'the subagent is not at its workstation');
  done = now;
  let fived = false;
  let early = 0;
  let after = 0;
  let end = 0;
  now = run(stage, crew, FIVE_WALK + FIVE_S + 4, now, (n) => {
    const L = byId(stage, 'L');
    const s = byId(stage, 's');
    assert.equal(L.station, desk, 'the working lead left its desk');
    const e = s.mind.errand;
    if (e?.kind === 'five') {
      early += confetti(stage, n);
      if (e.arrived && s.mind.gestures.some((g) => g.pose === 'highfive' && g.at <= stage.life.clock && stage.life.clock < g.until)) {
        fived = true;
        assert.ok(gap(s, L) < 7, `${gap(s, L).toFixed(1)} apart`);
        assert.equal(stage.lookOf(L, n).pose, 'highfive', 'the lead does not raise a hand');
        assert.equal(L.path.length, 0);
      }
    } else if (fived) {
      if (!end) end = n;
      after += confetti(stage, n);
    }
  });
  assert.ok(fived, 'no high-five');
  assert.equal(early, 0, 'the finale went off before the high-five');
  assert.ok(after > 0, 'no finale after the high-five');
  assert.ok((end - done) / 1000 <= FIVE_WALK + FIVE_S + 1, 'the high-five never ended');
});

test('an idle lead stops for the high-five, the two facing each other', () => {
  const stage = newStage();
  let done = 0;
  const crew = (n: number) => [awake('L', n, { role: 'lead' }), agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
  const now = run(stage, crew, 10);
  done = now;
  let faced = false;
  run(stage, crew, FIVE_WALK + FIVE_S + 2, now, (n) => {
    const s = byId(stage, 's');
    const L = byId(stage, 'L');
    const e = s.mind.errand;
    if (e?.kind !== 'five' || !e.arrived) return;
    const [a, b] = [stage.lookOf(s, n), stage.lookOf(L, n)];
    if (a.pose !== 'highfive' || b.pose !== 'highfive') return;
    assert.ok(stage.life.holding(L), 'the idle lead walks on');
    assert.notEqual(a.facing.flip, b.facing.flip, 'not facing each other');
    faced = true;
  });
  assert.ok(faced, 'never high-fived face to face');
});

// With the demo crew a lead long idle went off to its nap while its
// subagent was on the way to high-five it, and the subagent chased it
// across the room.
test('an idle lead due for its nap waits for the high-five first', () => {
  const stage = newStage();
  let done = 0;
  // Its nap due a moment after its subagent finishes.
  const since = NOW + 10_000 - (SLEEP_AFTER - 0.3) * 1000;
  const crew = () => [agent('L', 'idle', { role: 'lead', since }), agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
  const now = run(stage, crew, 10);
  done = now;
  let landed = false;
  run(stage, crew, FIVE_WALK + FIVE_S + 2, now, () => {
    const e = byId(stage, 's').mind.errand;
    if (e?.kind === 'five' && e.arrived) landed = true;
    if (!landed) assert.notEqual(kindOf(byId(stage, 'L')), 'nap', 'the lead went to bed with its high-five on the way');
  });
  assert.ok(landed, 'the high-five never landed');
});

// With the demo crew a lead was often still waving, talking to a huddle or
// sipping when its subagent got there, and that showed instead of its hand.
test('the high-five shows over whatever either was doing: both raise a hand the whole time', () => {
  const stage = newStage();
  let done = 0;
  const crew = (n: number) => [awake('L', n, { role: 'lead' }), agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
  const now = run(stage, crew, 10);
  done = now;
  // Each busy with something long: the lead talking, the subagent waving
  // (as it walks).
  stage.life.gesture(byId(stage, 'L'), 'talk', 30);
  stage.life.gesture(byId(stage, 's'), 'wave', 30, { hold: false });
  let both = 0;
  const other: string[] = [];
  run(stage, crew, FIVE_WALK + FIVE_S + 2, now, (n) => {
    const s = byId(stage, 's');
    const e = s.mind.errand;
    if (e?.kind !== 'five' || !e.arrived) return;
    const [a, b] = [stage.lookOf(s, n).pose, stage.lookOf(byId(stage, 'L'), n).pose];
    if (a === 'highfive' && b === 'highfive') both++;
    else other.push(`${a}/${b}`);
  });
  assert.ok(both > 0, 'no high-five');
  assert.deepEqual(other, [], 'the subagent and the lead showed something else');
});

// Such a lead's gestures were cleared for a held high-five, hiding its
// error or the block it carried.
test('a lead in error only turns to a subagent come to high-five it: its error shows', () => {
  const stage = newStage();
  let err = 0;
  let done = 0;
  const crew = () => [agent('L', err ? 'error' : 'write', { role: 'lead', since: err || NOW }), agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
  let now = run(stage, crew, 10);
  err = now;
  now = run(stage, crew, 1, now);
  done = now;
  let fived = 0;
  run(stage, crew, FIVE_WALK + FIVE_S, now, (n) => {
    const s = byId(stage, 's');
    const e = s.mind.errand;
    if (e?.kind !== 'five' || !e.arrived) return;
    const look = stage.lookOf(byId(stage, 'L'), n);
    assert.equal(look.pose, 'error');
    assert.ok(look.face && gap(look.face, s) < 0.5, 'not facing its subagent');
    if (stage.lookOf(s, n).pose === 'highfive') fived++;
  });
  assert.ok(fived > 0, 'no high-five');
});

test('a lead carrying a block only turns to a subagent come to high-five it: the block shows', () => {
  for (const world of [lively, ...['office', 'cafe', 'den'].map((id) => WORLDS.find((w) => w.id === id)!)]) {
    const stage = newStage(world);
    let free = 0;
    let done = 0;
    const crew = () => [agent('L', free ? 'done' : 'write', { role: 'lead', since: free || NOW }), agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
    let now = run(stage, crew, 8);
    free = now; // the lead helps build
    let carried = 0;
    run(stage, crew, 60, now, (n) => {
      const L = byId(stage, 'L');
      if (!done && stage.life.carrying(L)) done = n + 50; // its subagent finishes
      const s = find(stage, 's');
      const e = s?.mind.errand;
      if (e?.kind !== 'five' || !e.arrived || !stage.life.carrying(L)) return;
      const look = stage.lookOf(L, n);
      assert.ok(look.pose === 'carry' || look.pose === 'place', `${world.id}: ${look.pose} over the block`);
      if (!L.path.length) assert.ok(look.face && gap(look.face, s!) < 0.5, `${world.id}: not facing its subagent`);
      carried++;
    });
    assert.ok(carried > 0, `${world.id}: never high-fived carrying`);
  }
});

test('no high-five when the lead is not in the room: the finale goes off at once', () => {
  const stage = newStage();
  let done = 0;
  const crew = () => [agent('s', done ? 'done' : 'read', { parentId: 'gone', since: done || NOW })];
  let now = run(stage, crew, 8);
  done = now;
  let seen = 0;
  now = run(stage, crew, 1.5, now, (n) => {
    assert.notEqual(kindOf(byId(stage, 's')), 'five');
    seen += confetti(stage, n);
  });
  assert.ok(seen > 0, 'no finale');
});

// A lead with no room the usual 7 units either side of it (as at a
// station by the wall of a small room, or a workstation between two
// others): a subagent coming from its own was sent to a spot up or down
// the screen from its lead instead, never counted as beside it, and walked
// on that spot until it gave up, the finale held all the while.
test('a lead with no room right beside it still gets its high-five, from a step nearer, further, higher or lower', () => {
  for (const id of ['station', 'snowy', 'shelter']) {
    const stage = newStage(WORLDS.find((w) => w.id === id)!);
    const lead = agent('L', 'write', { role: 'lead' });
    let done = 0;
    const crew = () => [lead, agent('s', done ? 'done' : 'write', { parentId: 'L', since: done || NOW })];
    let now = run(stage, crew, 10);
    const L = byId(stage, 'L');
    assert.ok(L.station && L.station === own(stage, 'L'), `${id}: the lead is not at its workstation`);
    // No room at the six spots right beside it (BESIDE in life.ts).
    const beside = [[7, 0], [-7, 0], [7, 1.5], [-7, 1.5], [7, -1.5], [-7, -1.5]].map(([sx, sy]) => onScreen(L, sx, sy));
    const priv = stage as unknown as { standable(s: Spot): boolean };
    const free = standableIn(stage);
    priv.standable = (p) => free(p) && beside.every((q) => gap(p, q) > 0.75);
    const standable = standableIn(stage);
    for (const p of beside) assert.ok(!standable(p), `${id}: room beside the lead`);
    done = now;
    const stuck = treadmill(stage);
    let landed = 0;
    now = run(stage, crew, FIVE_WALK + FIVE_S + 2, now, (n) => {
      stuck();
      const s = byId(stage, 's');
      const e = s.mind.errand;
      if (e?.kind !== 'five' || !e.arrived || landed) return;
      landed = n;
      const [dx, dy] = [s.x - L.x, s.y - L.y];
      assert.ok(Math.abs(dx - dy) >= 5 && gap(s, L) <= 7.5, `${id}: not beside the lead: ${dx.toFixed(1)}, ${dy.toFixed(1)}`);
    });
    assert.ok(landed, `${id}: no high-five`);
    assert.ok((landed - done) / 1000 < 4, `${id}: the high-five took ${(landed - done) / 1000} s`);
    assert.ok(stuck() <= 1, `${id}: walked on the spot ${stuck().toFixed(2)} s`);
  }
});

test('with no room by its lead at all, no high-five: the finale goes off at once', () => {
  const stage = newStage();
  const lead = agent('L', 'write', { role: 'lead' });
  let done = 0;
  const crew = () => [lead, agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })];
  let now = run(stage, crew, 10);
  // Walled in: nowhere within 10 units of the lead to stand.
  const L = byId(stage, 'L');
  const standable = standableIn(stage);
  (stage as unknown as { standable(s: Spot): boolean }).standable = (s) => gap(s, L) > 10 && standable(s);
  done = now;
  let seen = 0;
  run(stage, crew, 1.5, now, (n) => {
    assert.notEqual(kindOf(byId(stage, 's')), 'five');
    seen += confetti(stage, n);
  });
  assert.ok(seen > 0, 'no finale');
});

// With the demo crew in the smallest terminal, one high-five in about
// twenty-five never landed (in nine of the worlds): the subagent walked on
// the spot beside its lead for up to FIVE_WALK, the finale held.
test('in every world, in the smallest terminal, each high-five lands after a short walk or is skipped, and nobody walks on the spot', () => {
  for (const world of WORLDS) {
    const stage = newStage(world);
    const src = new DemoSource(7, NOW);
    const stuck = treadmill(stage);
    // each on its way to a high-five: how long it has walked (not held by
    // a wave or a cheer)
    const walked = new Map<string, number>();
    let landed = 0;
    run(stage, (n) => src.poll(n), 300, NOW, () => {
      stuck();
      for (const a of stage.actors()) {
        const e = a.mind.errand;
        const id = a.info.id;
        if (e?.kind === 'five' && !e.arrived) {
          walked.set(id, (walked.get(id) ?? 0) + (stage.life.holding(a) ? 0 : 0.05));
          continue;
        }
        if (!walked.has(id)) continue;
        if (e?.kind === 'five') {
          assert.ok(walked.get(id)! <= 4, `${world.id}: ${id} walked ${walked.get(id)!.toFixed(2)} s to its high-five`);
          landed++;
        } else {
          // given up: only after a lead that went, or is off to another station
          const lead = find(stage, a.info.parentId ?? '');
          assert.ok(!lead || lead.state === 'leave' || lead.path.length > 0, `${world.id}: ${id}'s high-five never landed`);
        }
        walked.delete(id);
      }
    });
    assert.ok(stuck() <= 1, `${world.id}: walked on the spot ${stuck().toFixed(2)} s`);
    assert.ok(landed > 0, `${world.id}: no high-five`);
  }
});

test('a subagent gone from the list mid-way gives its high-five, then leaves', () => {
  const stage = newStage();
  let done = 0;
  let gone = false;
  const lead = agent('L', 'write', { role: 'lead' });
  const crew = () => (gone ? [lead] : [lead, agent('s', done ? 'done' : 'read', { parentId: 'L', since: done || NOW })]);
  let now = run(stage, crew, 10);
  done = now;
  now = run(stage, crew, 0.2, now);
  gone = true;
  let fived = false;
  run(stage, crew, FIVE_WALK + FIVE_S + 4, now, () => {
    const s = find(stage, 's');
    if (!s) return;
    const e = s.mind.errand;
    if (e?.kind === 'five' && e.arrived) fived = true;
    if (e?.kind === 'five') assert.notEqual(s.state, 'leave');
  });
  assert.ok(fived, 'left without its high-five');
  assert.equal(find(stage, 's'), undefined, 'never left');
});

// ── stand-ups ───────────────────────────────────────────────────────────

test('three idle agents of a crew gather in a ring and take turns talking with speech marks, then scatter; not again for a few minutes', () => {
  const stage = newStage();
  const ids = ['a1', 'a2', 'a3'];
  const crew = (n: number) => ids.map((id) => awake(id, n, { crew: 'c' }));
  const talked = new Set<string>();
  const marks = new Set<string>();
  let began = 0;
  let over = 0;
  let again = false;
  run(stage, crew, STANDUP_EVERY - 10, NOW, (n) => {
    const on = ids.filter((id) => kindOf(byId(stage, id)) === 'standup');
    if (on.length && !began) began = n;
    if (began && !over && !on.length) over = n;
    if (over && on.length) again = true;
    for (const id of on) {
      const a = byId(stage, id);
      if (a.mind.gestures.some((g) => g.pose === 'talk' && g.at <= stage.life.clock && stage.life.clock < g.until)) talked.add(id);
      if (a.mind.emote?.e === 'speech') marks.add(id);
    }
  });
  assert.ok(began && (began - NOW) / 1000 < 5, 'no stand-up');
  assert.ok(over && (over - began) / 1000 <= STANDUP_GATHER + STANDUP_S + 1, `the stand-up took ${(over - began) / 1000} s`);
  assert.ok(talked.size >= 3 && marks.size >= 3, `${talked.size} talked, ${marks.size} with a speech mark`);
  assert.ok(!again, `a second stand-up within ${STANDUP_EVERY} s`);
});

// A ring of six in the smallest terminal: a spot that was blocked turned
// onto its neighbour's, and two stood on top of each other.
test('in a stand-up of six, in every world, they stand apart, round a middle, facing it', () => {
  const ids = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'];
  for (const world of WORLDS) {
    const stage = newStage(world);
    let checked = 0;
    run(stage, (n) => ids.map((id) => awake(id, n, { crew: 'c' })), STANDUP_GATHER + STANDUP_S, NOW, (n) => {
      const ring = ids.map((id) => byId(stage, id)).filter((a) => {
        const e = a.mind.errand;
        return e?.kind === 'standup' && e.arrived && !a.path.length;
      });
      if (ring.length < ids.length) return;
      for (const a of ring) for (const b of ring) if (a !== b) assert.ok(gap(a, b) >= 3, `${world.id}: ${a.info.id} and ${b.info.id} ${gap(a, b).toFixed(1)} apart`);
      // all facing one middle, round it (no gap of half the circle)
      const mid = stage.lookOf(ring[0], n).face!;
      for (const a of ring) assert.ok(gap(stage.lookOf(a, n).face!, mid) < 0.5, `${world.id}: ${a.info.id} looks away`);
      const angs = ring.map((a) => Math.atan2(a.y - mid.y, a.x - mid.x)).sort((p, q) => p - q);
      const widest = Math.max(...angs.map((t, i) => (i ? t - angs[i - 1] : t + 2 * Math.PI - angs[angs.length - 1])));
      assert.ok(widest < Math.PI, `${world.id}: not round the middle`);
      checked++;
    });
    assert.ok(checked > 0, `${world.id}: the ring never stood`);
  }
});

test('no stand-up for two waiting, nor for three of different crews or of none', () => {
  for (const crew of [
    (n: number) => [awake('a1', n, { crew: 'c' }), awake('a2', n, { crew: 'c' })],
    (n: number) => [awake('a1', n, { crew: 'c' }), awake('a2', n, { crew: 'd' }), awake('a3', n, { crew: 'e' })],
    (n: number) => [awake('a1', n), awake('a2', n), awake('a3', n)],
  ]) {
    const stage = newStage();
    run(stage, crew, 30, NOW, () => {
      for (const a of stage.actors()) assert.notEqual(kindOf(a), 'standup');
    });
  }
});

// The talker given work went on talking (held still, its speech mark up)
// for most of its turn.
test('anyone given work leaves a stand-up at once, a talker its talk and speech mark too; down to one, it breaks up', () => {
  const stage = newStage();
  const ids = ['a1', 'a2', 'a3'];
  const work = new Map<string, number>();
  const crew = (n: number) => ids.map((id) => (work.has(id) ? agent(id, 'write', { crew: 'c', since: work.get(id)! }) : awake(id, n, { crew: 'c' })));
  let step = 0;
  let talker = '';
  run(stage, crew, STANDUP_GATHER + STANDUP_S, NOW, (n) => {
    const on = ids.filter((id) => kindOf(byId(stage, id)) === 'standup');
    if (step === 0) {
      talker = on.find((id) => talking(stage, byId(stage, id))) ?? '';
      if (!talker) return;
      assert.equal(byId(stage, talker).mind.emote?.e, 'speech', 'a talker with no speech mark');
      work.set(talker, n + 50);
      step = 1;
    } else if (step === 1 && work.get(talker)! <= n) {
      const a = byId(stage, talker);
      assert.notEqual(kindOf(a), 'standup', `${talker} stayed`);
      assert.ok(own(stage, talker) && a.station === own(stage, talker), `${talker} is not on its way to work`);
      assert.ok(quiet(stage, a, n), `${talker} goes on talking`);
      const rest = ids.filter((id) => id !== talker);
      assert.deepEqual(on, rest, 'the other two carry on');
      work.set(rest[0], n + 50);
      step = 2;
    } else if (step === 2 && [...work.values()].every((t) => t <= n)) {
      const last = byId(stage, ids.find((id) => !work.has(id))!);
      assert.equal(kindOf(last), undefined, 'a ring of one goes on');
      assert.ok(quiet(stage, last, n), 'the last one goes on talking');
      step = 3;
    }
  });
  assert.equal(step, 3);
});

// ── all of it ───────────────────────────────────────────────────────────

// Turned off mid-turn, the talker went on talking under its speech mark,
// and a sip under way went on.
test('off, office life ends every moment at once, its poses and speech marks with it, starts none and puts the mugs down', () => {
  const stage = newStage();
  const ids = ['a1', 'a2', 'a3'];
  const crew = (n: number) => ids.map((id) => awake(id, n, { crew: 'c' }));
  // a stand-up under way, someone talking
  let now = NOW;
  let talker: Actor | undefined;
  for (let i = 0; i < (STANDUP_GATHER + STANDUP_S) * 20 && !talker; i++) {
    now = run(stage, crew, 0.05, now);
    talker = ids.map((id) => byId(stage, id)).find((a) => talking(stage, a));
  }
  assert.ok(talker, 'no stand-up talking to end');
  assert.equal(talker.mind.emote?.e, 'speech');
  for (const id of ids) byId(stage, id).mind.mug = stage.life.clock + 30;
  // and a sip, and a high-five, under way
  const [sipper, fiver] = ids.map((id) => byId(stage, id)).filter((a) => a !== talker);
  stage.life.gesture(sipper, 'sip', 2);
  stage.life.gesture(fiver, 'highfive', 1.3);
  stage.office = false;
  assert.equal(stage.office, false);
  for (const id of ids) assert.ok(quiet(stage, byId(stage, id), now), `${id} goes on with office life`);
  now = run(stage, crew, 240, now, (n) => {
    for (const id of ids) {
      const a = byId(stage, id);
      assert.ok(!OFFICE.has(kindOf(a) ?? ''), `${id} on a ${kindOf(a)}`);
      assert.ok(!stage.lookOf(a, n).mug, `${id} has a mug`);
      assert.ok(quiet(stage, a, n), `${id} in an office pose`);
    }
  });
  stage.office = true;
  let back = false;
  run(stage, crew, 5, now, () => {
    if (ids.some((id) => kindOf(byId(stage, id)) === 'standup')) back = true;
  });
  assert.ok(back, 'on again, no stand-up');
});

test('the demo crew shows all four within a few minutes, each moment ends in time, and nobody at work is taken from it', () => {
  const stage = newStage(mines, { x: 0, y: 1, w: 150, h: 44 });
  const src = new DemoSource(7, NOW);
  const first = new Map<string, number>();
  const since = new Map<Actor, { kind: string; at: number }>();
  const most: Record<string, number> = { huddle: HUDDLE_GATHER + HUDDLE_S, coffee: 2 * COFFEE_LEG + COFFEE_POUR, five: FIVE_WALK + FIVE_S, standup: STANDUP_GATHER + STANDUP_S };
  const end = run(stage, (n) => src.poll(n), 240, NOW, (n) => {
    for (const a of stage.actors()) {
      const e = a.mind.errand;
      const k = e?.kind ?? '';
      const on = (e?.kind === 'coffee' && e.step === 'pour') || ((k === 'huddle' || k === 'five' || k === 'standup') && (e as { arrived: boolean }).arrived);
      if (on && !first.has(k)) first.set(k, (n - NOW) / 1000);
      // Work first: only a newcomer still spinning up (a huddle) is on an
      // office moment while its agent works.
      const busy = a.info.activity !== 'idle' && a.info.activity !== 'done' && a.info.activity !== 'error';
      if (busy && OFFICE.has(k)) assert.ok(k === 'huddle' && a.info.activity === 'think', `${a.info.id} at work (${a.info.activity}) on a ${k}`);
      const was = since.get(a);
      if (OFFICE.has(k) && was?.kind !== k) since.set(a, { kind: k, at: n });
      else if (!OFFICE.has(k) && was) {
        since.delete(a);
        assert.ok((n - was.at) / 1000 <= most[was.kind] + 1, `${a.info.id}'s ${was.kind} took ${(n - was.at) / 1000} s`);
      }
    }
  });
  // and those still under way at the end
  for (const [a, was] of since) assert.ok((end - was.at) / 1000 <= most[was.kind] + 1, `${a.info.id}'s ${was.kind} has taken ${(end - was.at) / 1000} s so far`);
  assert.deepEqual([...first.keys()].sort(), ['coffee', 'five', 'huddle', 'standup'], `seen: ${JSON.stringify(Object.fromEntries(first))}`);
  for (const [k, t] of first) assert.ok(t <= 180, `the first ${k} at ${t} s`);
});
