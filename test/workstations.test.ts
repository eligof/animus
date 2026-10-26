import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentInfo } from '../src/agents.ts';
import { StressSource } from '../src/demo/stress.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { Spot } from '../src/world/types.ts';
import { WORLDS } from '../src/worlds/index.ts';

// The stress test: twenty agents at work (four leads with four subagents
// each, each turning to something else every few seconds) in every world,
// in a small, a usual and a big terminal. Each stands at a workstation of
// its own, or, once every place is taken, at a teammate's side; none
// stands within about four units of another.

const NOW = 1_700_000_000_000;
const SIZES: Array<[number, number]> = [[80, 24], [150, 46], [200, 60]];
const APART = 4;

const team = (a: AgentInfo) => (a.role === 'lead' ? a.id : (a.parentId ?? a.id));

// What the stage says of its workstations and of the places planned for
// them (see Stage.workstations and Room.desks): none, before there were
// any. (Written first, against the stage as it was.)
type Up = { desk: { spot: Spot }; owner: string | null };
const upOf = (stage: Stage): Up[] => (stage as unknown as { workstations?(): Up[] }).workstations?.() ?? [];
const placesOf = (stage: Stage): number => (stage.room() as unknown as { desks?: unknown[] }).desks?.length ?? 0;

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
      const places = placesOf(stage);
      const up = upOf(stage);
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
