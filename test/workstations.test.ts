import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Activity, AgentInfo } from '../src/agents.ts';
import { Scene } from '../src/art/scene.ts';
import { StressSource } from '../src/demo/stress.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { footprint } from '../src/world/room.ts';
import { EMPTY_S, POP_S, Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Desk, Particle } from '../src/world/types.ts';
import { World } from '../src/world/world.ts';
import { WORLDS } from '../src/worlds/index.ts';
import { mines } from '../src/worlds/mines.ts';
import { budget } from './helpers.ts';

// The stress test: twenty agents at work (four leads with four subagents
// each, each turning to something else every few seconds) in every world,
// in a small, a usual and a big terminal. Each stands at a workstation of
// its own, or, once every place is taken, at a teammate's side; none
// stands within about four units of another.

const NOW = 1_700_000_000_000;
const SIZES: Array<[number, number]> = [[80, 24], [150, 46], [200, 60]];
const APART = 4;

const team = (a: AgentInfo) => (a.role === 'lead' ? a.id : (a.parentId ?? a.id));

test('the stress crew: four leads with four subagents each, all at work, each turning to something else every few seconds, the same every run', () => {
  const moves = (src: StressSource) => Array.from({ length: 60 }, (_, i) => src.poll(NOW + i * 500));
  const a = moves(new StressSource(4, 4, NOW));
  assert.deepEqual(a, moves(new StressSource(4, 4, NOW)));
  for (const crew of a) {
    assert.equal(crew.length, 20);
    assert.equal(crew.filter((x) => x.role === 'lead').length, 4);
    for (const x of crew) assert.ok(!['idle', 'done', 'error'].includes(x.activity), x.activity);
    for (const x of crew.filter((y) => y.role === 'sub')) assert.equal(crew.find((y) => y.id === x.parentId)?.role, 'lead');
  }
  // In 30 s each turns to something else at least twice, at most eight times.
  for (let k = 0; k < 20; k++) {
    const changes = a.slice(1).filter((crew, i) => crew[k].since !== a[i][k].since).length;
    assert.ok(changes >= 2 && changes <= 8, `${a[0][k].id}: ${changes} changes`);
  }
});

function stressed(world: (typeof WORLDS)[number], cols: number, rows: number, seconds = 12): { stage: Stage; crew: AgentInfo[] } {
  const stage = new Stage(world);
  stage.layout(computeLayout(cols, rows).scene);
  const src = new StressSource(4, 4, NOW);
  let now = NOW;
  let crew: AgentInfo[] = [];
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    crew = src.poll(now);
    stage.sync(crew, now);
    stage.update(0.05, now);
  }
  return { stage, crew };
}

for (const [cols, rows] of SIZES) {
  test(`${cols}x${rows}: twenty at work, each at a workstation of its own or at a teammate's side, none on top of another`, () => {
    for (const w of WORLDS) {
      const { stage } = stressed(w, cols, rows);
      const places = stage.room()!.desks.length;
      const up = stage.workstations();
      const actors = stage.actors();
      const tag = (a: Actor) => `${w.id} ${cols}x${rows}: ${a.info.id}`;
      assert.equal(actors.length, 20, w.id);
      // As many have their own as there are places.
      assert.equal(up.filter((x) => x.owner).length, Math.min(20, places), `${w.id} ${cols}x${rows}: ${places} places`);
      for (const a of actors) {
        assert.equal(a.state, 'work', `${tag(a)} is ${a.state}`);
        const own = up.find((x) => x.owner === a.info.id);
        if (own) {
          assert.equal(a.station, own.desk, `${tag(a)} not at its own`);
          assert.ok(Math.hypot(a.x - own.desk.spot.x, a.y - own.desk.spot.y) < 0.01, `${tag(a)} not at its spot`);
          continue;
        }
        // Sharing: a teammate's, when a teammate has one.
        const at = up.find((x) => x.desk === a.station);
        assert.ok(at?.owner, `${tag(a)} at no workstation`);
        const mates = up.filter((x) => x.owner && team(actors.find((o) => o.info.id === x.owner)!.info) === team(a.info));
        if (mates.length) assert.ok(mates.includes(at), `${tag(a)} at a stranger's`);
        assert.ok(Math.hypot(a.x - at.desk.spot.x, a.y - at.desk.spot.y) <= 12.5, `${tag(a)} far from the one it shares`);
      }
      for (let i = 0; i < actors.length; i++) {
        for (let j = i + 1; j < actors.length; j++) {
          const d = Math.hypot(actors[i].x - actors[j].x, actors[i].y - actors[j].y);
          assert.ok(d >= APART, `${tag(actors[i])} and ${actors[j].info.id} ${d.toFixed(1)} apart`);
        }
      }
    }
  });
}

// ── a workstation's life ────────────────────────────────────────────────

const WIDE = { x: 0, y: 1, w: 150, h: 44 };
const SMALL = { x: 0, y: 1, w: 80, h: 21 };
const lead = (id: string, activity: Activity = 'write', extra: Partial<AgentInfo> = {}): AgentInfo => ({ id, name: id, role: 'lead', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra });
const sub = (id: string, parentId: string, activity: Activity = 'write'): AgentInfo => ({ ...lead(id, activity), role: 'sub', parentId });

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

function staged(r = WIDE, w = mines): Stage {
  const stage = new Stage(w);
  stage.layout(r);
  return stage;
}

const particlesOf = (stage: Stage) => (stage as unknown as { particles: Particle[] }).particles;
// Bits of `kind` within 6 units of a desk's middle.
const near = (stage: Stage, d: Desk, kind: string) => {
  const r = footprint(d);
  return particlesOf(stage).filter((p) => p.kind === kind && Math.hypot(p.x - (r.x0 + r.x1) / 2, p.y - (r.y0 + r.y1) / 2) < 6).length;
};

test('a workstation pops up as its agent comes in, growing out of the floor with a puff and a sparkle in half a second', () => {
  const stage = staged();
  stage.sync([lead('a')], NOW);
  const [w] = stage.workstations();
  assert.equal(w.owner, 'a');
  assert.ok(near(stage, w.desk, 'smoke') >= 4 && near(stage, w.desk, 'glint') >= 4, 'no puff and sparkle');
  const grow: number[] = [];
  run(stage, () => [lead('a')], 0.7, NOW, (n) => grow.push(stage.frame(n)!.desks![0].grow));
  for (let k = 1; k < grow.length; k++) assert.ok(grow[k] >= grow[k - 1], `shrank at ${k}`);
  assert.ok(grow[0] > 0 && grow[0] < 0.25, `${grow[0]} grown at first`);
  assert.ok(grow[POP_S * 20 - 2] < 1, 'up too soon');
  assert.equal(grow[POP_S * 20], 1, 'not up in half a second');
});

test('left empty, a workstation stands a few seconds, then shrinks away with a puff; its place is free for the next to come', () => {
  const stage = staged();
  let now = run(stage, () => [lead('a')], 10);
  const [w] = stage.workstations();
  const place = w.desk;
  const t0 = now;
  const seen: Array<[number, number | null, string | null, number]> = [];
  let puffed = 0;
  now = run(stage, () => [], EMPTY_S + POP_S + 1, now, (n) => {
    const d = stage.frame(n)!.desks!.find((x) => x.id === place.index);
    const t = (n - t0) / 1000;
    seen.push([t, d ? d.grow : null, d ? d.screen : null, stage.workstations().length]);
    if (t > EMPTY_S && t < EMPTY_S + 0.2) puffed = Math.max(puffed, near(stage, place, 'smoke'));
  });
  for (const [t, grow, screen, up] of seen) {
    if (t > 0.1 && t < EMPTY_S - 0.1) assert.deepEqual([grow, screen, up], [1, 'off', 1], `at ${t.toFixed(2)} s`);
    if (t > EMPTY_S + 0.15 && t < EMPTY_S + POP_S - 0.1) assert.ok(grow !== null && grow > 0 && grow < 1, `at ${t.toFixed(2)} s: grown ${grow}`);
    if (t > EMPTY_S + POP_S + 0.15) assert.equal(up, 0, `at ${t.toFixed(2)} s: still there`);
  }
  assert.ok(puffed >= 4, 'no puff as it went');
  // The next lead to come takes the place.
  run(stage, () => [lead('b')], 1, now);
  assert.equal(stage.workstations()[0].desk, place);
  assert.equal(stage.workstations()[0].owner, 'b');
});

test('one back within those few seconds takes its own again, as it stands', () => {
  const stage = staged();
  let now = run(stage, () => [lead('a')], 10);
  const [w] = stage.workstations();
  now = run(stage, () => [], 2, now);
  assert.equal(w.owner, null);
  run(stage, () => [lead('a')], 1, now);
  assert.deepEqual(stage.workstations().map((x) => [x, x.owner]), [[w, 'a']]);
  assert.equal(stage.frame(now)!.desks![0].grow, 1, 'it popped up again');
});

test('one sharing a workstation moves to a place of its own when one comes free', () => {
  const stage = staged(SMALL);
  const places = stage.room()!.desks.length;
  const subs = Array.from({ length: places }, (_, i) => `s${i}`);
  let gone = '';
  const crew = () => [lead('L'), ...subs.filter((id) => id !== gone).map((id) => sub(id, 'L'))];
  let now = run(stage, crew, 15);
  const owns = (id: string) => stage.workstations().some((w) => w.owner === id);
  const sharer = subs.find((id) => !owns(id))!;
  assert.ok(sharer, 'nobody shares');
  gone = subs.find((id) => owns(id))!;
  now = run(stage, crew, 10, now);
  assert.ok(owns(sharer), `${sharer} has none of its own`);
  const a = stage.actors().find((x) => x.info.id === sharer)!;
  const own = stage.workstations().find((w) => w.owner === sharer)!;
  assert.equal(a.station, own.desk);
  assert.ok(Math.hypot(a.x - own.desk.spot.x, a.y - own.desk.spot.y) < 0.01, 'not at it');
});

test('nobody walks through a workstation, and nobody is trapped: one that goes up where someone stands sends them out of its way', () => {
  // A crowd coming and going, waiting and at work, in a mid-sized room.
  const stage = staged({ x: 0, y: 1, w: 120, h: 33 }, WORLDS.find((w) => w.id === 'cafe')!);
  const ids = Array.from({ length: 22 }, (_, i) => `a${i}`);
  const crew = (n: number) =>
    ids.flatMap((id, i) => {
      const t = (n - NOW) / 1000;
      // each comes at its own time and goes a while later; some wait, some work
      if (t < i * 1.5 || t > 40 + (i % 5) * 6) return [];
      return [lead(id, Math.floor(t / 7 + i) % 3 === 0 ? 'idle' : 'write', { since: NOW + Math.floor(t / 7) * 7000 })];
    });
  const stuck = new Map<string, number>();
  let most = 0;
  let checked = 0;
  run(stage, crew, 70, NOW, () => {
    const up = stage.workstations().map((w) => footprint(w.desk));
    most = Math.max(most, stage.actors().length);
    for (const a of stage.actors()) {
      if (a.state === 'enter') continue;
      const inside = up.find((r) => a.x > r.x0 + 0.25 && a.x < r.x1 - 0.25 && a.y > r.y0 + 0.25 && a.y < r.y1 - 0.25);
      // Inside one only while stepping out of it.
      const t = inside ? (stuck.get(a.info.id) ?? 0) + 0.05 : 0;
      stuck.set(a.info.id, t);
      assert.ok(t < 1, `${a.info.id} inside a workstation for ${t.toFixed(2)} s, at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
      if (inside) assert.ok(a.path.length > 0, `${a.info.id} stands inside a workstation`);
      checked++;
    }
  });
  assert.ok(most >= 15 && checked > 10_000, `${most} at most, ${checked} looks`);
  assert.equal(stage.workstations().length, 0, 'workstations left standing');
});

test('twenty at their workstations: the stage\'s frame and the scene\'s plate stay within budget', () => {
  // The model's share of a frame, as for a busy crew at the stations.
  const { stage } = stressed(WORLDS.find((w) => w.id === 'cafe')!, 200, 60);
  let now = NOW + 12_000;
  const src = new StressSource(4, 4, NOW);
  budget(
    'the stage with twenty',
    () => {
      now += 55;
      stage.sync(src.poll(now), now);
      stage.update(0.055, now);
      stage.frame(now);
    },
    10,
    { runs: 5, calls: 20 },
  );
  // The plate: twenty figures, as many workstations, labels; the
  // workstations' sprites drawn once, then placed.
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('cafe')!, live: new StressSource(4, 4, start), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.full = true;
  w.resize(150, 46);
  let t = start;
  for (let i = 0; i < 15 * 18; i++) w.tick((t = start + i * (1000 / 18)));
  w.draw(new Screen(150, 46), t);
  const f = w.scene()!;
  assert.equal(f.desks!.length, 20);
  const scene = new Scene();
  scene.plate(f);
  budget('a plate of twenty at their workstations', (k) => scene.plate({ ...f, t: f.t + k / 30 }), 16, { runs: 5, calls: 1 });
});
