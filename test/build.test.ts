import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Construction, SHAPES, blueprint, capOf } from '../src/world/build.ts';
import type { Works } from '../src/world/build.ts';
import { buildSites, planLayout } from '../src/world/layout.ts';
import { footprint } from '../src/world/room.ts';
import type { Layout } from '../src/world/types.ts';
import { Stage } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import type { RGB } from '../src/term/color.ts';
import { mines } from '../src/worlds/mines.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import type { AgentInfo, Activity } from '../src/agents.ts';

const NOW = 1_700_000_000_000;

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});

function newStage(world: WorldDef = mines, r = { x: 0, y: 1, w: 120, h: 33 }): Stage {
  const stage = new Stage(world);
  stage.layout(r);
  return stage;
}

// No one stands inside a prop, a build's footprint or a pile.
function assertClear(stage: Stage, where: string): void {
  const builds = stage.builds();
  for (const a of stage.actors()) {
    if (a.state === 'enter' || a.state === 'leave') continue;
    for (const p of stage.room()!.props) {
      if (p.slot?.kind === 'entrance') continue;
      const f = footprint(p);
      const inside = a.x > f.x0 + 0.5 && a.x < f.x1 - 0.5 && a.y > f.y0 + 0.5 && a.y < f.y1 - 0.5;
      assert.ok(!inside, `${where}: ${a.info.id} inside ${p.slot?.kind ?? 'decor'} at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
    }
    for (const b of builds) {
      const cell = b.built().some((k) => k.x === Math.floor(a.x) && k.y === Math.floor(a.y));
      assert.ok(!cell, `${where}: ${a.info.id} stands in the ${b.shape} at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
      if (!b.complete) {
        const p = b.pile;
        const inPile = a.x > p.x0 + 0.5 && a.x < p.x1 - 0.5 && a.y > p.y0 + 0.5 && a.y < p.y1 - 0.5;
        assert.ok(!inPile, `${where}: ${a.info.id} stands in the pile`);
      }
    }
  }
}

// Steps the stage with `crew` (refreshed each frame) and a check per frame.
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

const builders = () => [agent('d1', 'done'), agent('d2', 'done'), agent('d3', 'done'), agent('d4', 'done')];
const FOUR: RGB[] = [[120, 80, 40], [130, 70, 50], [90, 80, 70], [255, 240, 200]];

test('every shape fits its plaza, stacks bottom-up and wears a cap', () => {
  for (const shape of SHAPES) {
    for (const [R, H] of [[4.5, 12], [7, 18], [10.5, 24]]) {
      const bs = blueprint(shape, 4, R, H);
      assert.ok(bs.length > 50, `${shape} ${R}: only ${bs.length} blocks`);
      const keys = new Set(bs.map((b) => `${b.x},${b.y},${b.z}`));
      assert.equal(keys.size, bs.length, `${shape} has doubled blocks`);
      for (let i = 1; i < bs.length; i++) assert.ok(bs[i].z >= bs[i - 1].z, `${shape} not bottom-up at ${i}`);
      for (const b of bs) assert.ok(Math.hypot(b.x, b.y) <= R + 0.5, `${shape} ${R}: ${b.x},${b.y} outside the plaza`);
      const across = Math.max(...bs.map((b) => b.x)) - Math.min(...bs.map((b) => b.x)) + 1;
      const tall = Math.max(...bs.map((b) => b.z)) + 1;
      assert.ok(across >= 7 && across <= 24, `${shape} ${R}: ${across} across`);
      assert.ok(tall >= 9 && tall <= 30, `${shape} ${R}x${H}: ${tall} tall`);
      const top = bs.filter((b) => b.z >= tall - 3);
      assert.ok(top.some((b) => b.c === 3), `${shape} has no cap`);
      assert.ok(bs.every((b) => Number.isInteger(b.c) && b.c >= 0 && b.c < 4), `${shape} colours out of the palette`);
    }
  }
});

test('the cap is the last colour, and a single colour serves for all', () => {
  assert.equal(capOf(FOUR), 3);
  assert.equal(capOf([[1, 2, 3]]), 0);
  assert.ok(blueprint('tower', 1, 6, 16).every((b) => b.c === 0));
  const two = blueprint('house', 2, 6, 16);
  assert.deepEqual([...new Set(two.map((b) => b.c))].sort(), [0, 1]);
});

test('builders lay bricks bottom-up on a plaza, and the pile goes when done', () => {
  const stage = newStage();
  let now = run(stage, builders, 4);
  const site = stage.builds()[0];
  assert.ok(site, 'no build started');
  const L = (stage as unknown as { L: Layout }).L;
  assert.ok(buildSites(L).some((p) => Math.hypot(p.x - site.plaza.x, p.y - site.plaza.y) < 1e-6), 'built off the plazas');
  for (const b of site.blocks) assert.ok(Math.hypot(b.x + 0.5 - site.plaza.x, b.y + 0.5 - site.plaza.y) <= site.plaza.r + 0.8, 'footprint wider than the plaza');
  assert.ok(site.blocks.every((b) => b.z >= 0), 'below the floor');
  const shown = () => stage.frame(now)!.builds.find((b) => b.top === site.top)!;
  assert.ok(shown().pile, 'no pile of materials while it goes up');
  let last = 0;
  // Builders until it stands (then nobody is left wanting to build).
  for (let i = 0; i < 1200 && !site.complete; i++) now = run(stage, builders, 0.05, now, () => {
    const laid = site.laid;
    if (laid === last) return;
    // Bottom-up: nothing laid sits above anything still to come.
    if (laid < site.blocks.length) assert.ok(site.blocks[laid - 1].z <= site.blocks[laid].z);
    const f = shown();
    assert.equal(f.blocks.length, laid);
    assert.equal(f.pending.length, site.blocks.length - laid);
    assert.equal(f.progress, site.placed / site.count);
    last = laid;
  });
  assert.ok(site.complete, `only ${site.placed}/${site.count} bricks after 60 s`);
  const done = shown();
  assert.equal(done.pile, null, 'the pile is still there');
  assert.equal(done.pending.length, 0);
  assert.ok(done.complete && done.progress === 1);
});

test('a finished build starts the next on the other plaza, up to one per plaza, then renews the oldest', () => {
  const stage = newStage();
  let now = run(stage, builders, 150);
  const builds = stage.builds();
  assert.equal(builds.length, 2, `${builds.length} builds`);
  assert.ok(builds.every((b) => b.complete), builds.map((b) => `${b.shape} ${b.placed}/${b.count}`).join(', '));
  assert.notEqual(builds[0].plaza, builds[1].plaza);
  const first = builds[0];
  // Every plaza built: nothing new starts until the oldest has stood a while.
  now = run(stage, builders, 60, now);
  assert.equal(stage.builds().length, 2);
  assert.ok(stage.builds().every((b) => b.complete));
  const seen = new Set<Construction>(stage.builds());
  let most = 0;
  run(stage, builders, 400, now, () => {
    for (const b of stage.builds()) seen.add(b);
    most = Math.max(most, stage.builds().length);
  });
  assert.ok(most <= 2, `${most} builds at once`);
  assert.ok(!stage.builds().includes(first), 'the oldest build was never renewed');
  assert.ok(seen.size > 2, 'nothing new was built');
});

test('carriers walk round props, builds and piles, and never stand inside them', () => {
  for (const r of [{ x: 0, y: 1, w: 120, h: 33 }, { x: 0, y: 1, w: 200, h: 57 }]) {
    const stage = newStage(mines, r);
    const crew = (now: number) => [
      ...builders(),
      agent('i1', 'idle', { since: now - 2000 }),
      agent('i2', 'idle', { since: now - 2000 }),
      agent('w1', 'write'),
      agent('r1', 'read'),
      agent('s1', 'search'),
    ];
    run(stage, crew, 120, NOW, (now) => assertClear(stage, `${r.w}x${r.h} @${((now - NOW) / 1000).toFixed(1)}s`));
    assert.ok(stage.builds().some((b) => b.placed > 0), 'nothing was built');
  }
});

test('nobody holding a block vanishes with it: a finished agent lays its block, then leaves', () => {
  const stage = newStage();
  let now = run(stage, () => [agent('d', 'done')], 3);
  const a = stage.actors()[0] as Actor;
  // Wait until it carries a block.
  for (let i = 0; i < 400 && !(a.mind.errand?.kind === 'haul' && a.mind.errand.step === 'carry'); i++) now = run(stage, () => [agent('d', 'done')], 0.05, now);
  assert.equal(a.mind.errand?.kind, 'haul');
  // It shows the block in one of the world's build colours.
  const fig = stage.frame(now)!.figures.find((f) => f.id === 'd')!;
  assert.equal(fig.pose, 'carry');
  assert.ok(mines.build.colors.includes(fig.item!), `carries ${fig.item}`);
  const site = stage.builds()[0];
  const before = site.placed;
  now = run(stage, () => [], 25, now);
  assert.ok(site.placed > before, 'the block was never laid');
  assert.equal(stage.actors().length, 0, 'never left');
});

// A build staked out on the first plaza of a bare room.
function staked(shape: Construction['shape'], H = 19) {
  const L = planLayout(360, 200);
  return new Construction(L, buildSites(L)[0], shape, FOUR, H);
}

test('a build\'s ghost is exactly the blocks still to lay, shrinking brick by brick', () => {
  const c = staked('statue');
  const key = (b: { x: number; y: number; z: number }) => `${b.x},${b.y},${b.z}`;
  let last = Infinity;
  for (;;) {
    const g = c.ghost();
    assert.deepEqual(new Set(g.map(key)), new Set(c.blocks.slice(c.laid).map(key)), `ghost at ${c.placed}/${c.count} is not the unplaced blocks`);
    assert.equal(c.built().length + g.length, c.blocks.length);
    assert.ok(g.length < last, 'the ghost did not shrink');
    last = g.length;
    if (c.complete) break;
    c.place();
  }
  assert.equal(last, 0);
  c.raze();
  assert.equal(c.placed, 0);
  assert.equal(c.ghost().length, c.blocks.length);
});

test('small builds go up two bricks a haul, big ones one', () => {
  const small = staked('statue');
  const big = staked('tower');
  assert.ok(small.count < 30 && big.count >= 30, `${small.count} and ${big.count} bricks`);
  for (const [c, per] of [[small, 2], [big, 1]] as const) {
    const laid = c.place()!;
    assert.equal(c.placed, per, `${c.shape}: ${c.placed} bricks a haul`);
    assert.equal(laid.length, c.bricks[per] - c.bricks[0]);
    while (!c.complete) c.place();
    assert.equal(c.placed, c.count, 'overshot the last brick');
    assert.equal(c.place(), null);
  }
});

test('a brick is not laid where someone stands', () => {
  const c = staked('tower');
  const b = c.blocks[0];
  assert.equal(c.place((x, y) => x === b.x && y === b.y), null);
  assert.equal(c.placed, 0);
  assert.ok(c.place(() => false));
});

test('those near cheer as a build passes a quarter, a half and three quarters, and again when it stands', () => {
  const stage = newStage();
  // One builder, so no two bricks land together; two workers look on.
  const crew = () => [agent('d1', 'done'), agent('w1', 'write'), agent('w2', 'read')];
  let now = run(stage, crew, 4);
  const site = stage.builds()[0];
  assert.ok(site && site.placed < site.count / 4, 'no build under way');
  // Gestures from before (hellos, the builders' own finish) don't count.
  const seen = new WeakSet<object>();
  for (const a of stage.actors()) for (const g of a.mind.gestures) seen.add(g);
  const waves: number[] = []; // how far along at each new round of cheers
  for (let i = 0; i < 2400 && !site.complete; i++) now = run(stage, crew, 0.05, now, () => {
    let fresh = false;
    for (const a of stage.actors()) {
      for (const g of a.mind.gestures) {
        if (seen.has(g)) continue;
        seen.add(g);
        if (g.pose === 'cheer') fresh = true;
      }
    }
    if (fresh) waves.push(site.placed / site.count);
  });
  assert.ok(site.complete, 'never finished');
  assert.equal(waves.length, 4, `cheers at ${waves.map((p) => p.toFixed(2)).join(', ')}`);
  waves.forEach((p, k) => assert.ok(p >= (k + 1) / 4 && p < (k + 1) / 4 + 2 / site.count + 1e-9, `cheer ${k + 1} at ${p.toFixed(2)}`));
});

test('the build ghost is cyan in a warm world and amber in a cold one', async () => {
  const { snowy } = await import('../src/worlds/snowy.ts');
  const { hell } = await import('../src/worlds/hell.ts');
  const { fungal } = await import('../src/worlds/fungal.ts');
  const CYAN = [127, 232, 255];
  const AMBER = [255, 179, 71];
  for (const [w, hue] of [[mines, CYAN], [hell, CYAN], [snowy, AMBER], [fungal, AMBER]] as const) assert.deepEqual(newStage(w).ghostHue(), hue, w.id);
  const stage = newStage();
  (stage as unknown as { works: Works }).works.current(0);
  const f = stage.frame(NOW)!;
  assert.equal(f.builds.length, 1);
  assert.deepEqual(f.builds[0].ghost, CYAN);
  assert.ok(f.builds[0].pending.length > 40 && f.builds[0].blocks.length === 0);
  assert.equal(f.builds[0].colors, mines.build.colors);
});
