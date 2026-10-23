import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Construction, SHAPES, blueprint, capOf, defaultStyle } from '../src/cave/build.ts';
import type { Works } from '../src/cave/build.ts';
import { buildSites, planLayout } from '../src/cave/layout.ts';
import { mines } from '../src/cave/biomes/mines.ts';
import { M, MATERIALS } from '../src/cave/materials.ts';
import { explode } from '../src/cave/sim.ts';
import { buildTables } from '../src/cave/materials.ts';
import type { Biome, Layout, Slot } from '../src/cave/types.ts';
import { Voxels } from '../src/cave/voxels.ts';
import { Rng, hashString } from '../src/world/rng.ts';
import { Stage } from '../src/world/stage.ts';
import { Screen } from '../src/term/screen.ts';
import type { Actor } from '../src/world/stage.ts';
import type { AgentInfo, Activity } from '../src/agents.ts';

const NOW = 1_700_000_000_000;

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});

function newStage(biome: Biome = mines, r = { x: 0, y: 1, w: 120, h: 33 }): Stage {
  const stage = new Stage(biome, 'half');
  stage.layout(r);
  return stage;
}

function footprint(p: Slot) {
  return p.wall === 'right'
    ? { x0: p.x0, x1: p.x0 + p.len, y0: p.y0, y1: p.y0 + p.dep }
    : { x0: p.x0, x1: p.x0 + p.dep, y0: p.y0, y1: p.y0 + p.len };
}

// No one stands inside a prop, a build's footprint or a pile.
function assertClear(stage: Stage, where: string): void {
  const builds = stage.builds();
  for (const a of stage.actors()) {
    if (a.state === 'enter' || a.state === 'leave') continue;
    for (const p of stage.stations()) {
      if (p.kind === 'entrance') continue;
      const f = footprint(p);
      const inside = a.x > f.x0 + 0.5 && a.x < f.x1 - 0.5 && a.y > f.y0 + 0.5 && a.y < f.y1 - 0.5;
      assert.ok(!inside, `${where}: ${a.info.id} inside ${p.kind} at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
    }
    for (const b of builds) {
      const cell = b.blocks.some((k) => k.x === Math.floor(a.x) && k.y === Math.floor(a.y) && k.z <= b.top.z);
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

test('every shape fits its plaza, stacks bottom-up and wears a glowing cap', () => {
  const style = { mats: [M.BRICK, M.ROCK, M.WOOD], shape: 'tower' as const };
  for (const shape of SHAPES) {
    for (const [R, H] of [[4.5, 12], [7, 18], [10.5, 24]]) {
      const bs = blueprint(shape, style, R, H);
      assert.ok(bs.length > 50, `${shape} ${R}: only ${bs.length} voxels`);
      const keys = new Set(bs.map((b) => `${b.x},${b.y},${b.z}`));
      assert.equal(keys.size, bs.length, `${shape} has doubled voxels`);
      for (let i = 1; i < bs.length; i++) assert.ok(bs[i].z >= bs[i - 1].z, `${shape} not bottom-up at ${i}`);
      for (const b of bs) assert.ok(Math.hypot(b.x, b.y) <= R + 0.5, `${shape} ${R}: ${b.x},${b.y} outside the plaza`);
      const across = Math.max(...bs.map((b) => b.x)) - Math.min(...bs.map((b) => b.x)) + 1;
      const tall = Math.max(...bs.map((b) => b.z)) + 1;
      assert.ok(across >= 7 && across <= 24, `${shape} ${R}: ${across} across`);
      assert.ok(tall >= 9 && tall <= 30, `${shape} ${R}x${H}: ${tall} tall`);
      const top = bs.filter((b) => b.z >= tall - 3);
      assert.ok(top.some((b) => b.mat === capOf(style.mats)), `${shape} has no glowing cap`);
      assert.ok(bs.every((b) => MATERIALS[b.mat]?.kind === 'solid'), `${shape} uses a non-solid`);
    }
  }
});

test('the cap is the style\'s own glow, else a lamp', () => {
  assert.equal(capOf([M.ROCK, M.NEON_PINK]), M.NEON_PINK);
  assert.equal(capOf([M.ROCK, M.WOOD]), M.LAMP);
});

test('without a style of its own a biome builds a stone tower of its rock', () => {
  const bare: Biome = { ...mines, id: 'bare', build: undefined };
  const L = planLayout(240, 132);
  const v = new Voxels(L.W, L.D, L.H);
  bare.generate(v, L, new Rng(hashString('mines')));
  v.commitBase();
  const style = defaultStyle(v, L);
  assert.equal(style.shape, 'tower');
  assert.ok(style.mats.length >= 1 && style.mats.every((m) => MATERIALS[m]?.kind === 'solid'));
  const walls = new Set<number>();
  for (let z = L.floor; z < L.H; z++) walls.add(v.base[v.idx(1, L.T + 5, z)]);
  assert.ok(walls.has(style.mats[0]), 'the tower is not made of the walls\' rock');
});

test('builders lay bricks bottom-up on a plaza, healing keeps them, and the pile goes when done', () => {
  // Stone, so the test blast cannot set it alight.
  const stage = newStage({ ...mines, build: { mats: [M.BRICK, M.ROCK], shape: 'tower' } });
  const v = stage.voxels()!;
  let now = run(stage, builders, 4);
  const site = stage.builds()[0];
  assert.ok(site, 'no build started');
  const L = (stage as unknown as { L: Layout }).L;
  const plazas = buildSites(L);
  assert.ok(plazas.some((p) => Math.hypot(p.x - site.plaza.x, p.y - site.plaza.y) < 1e-6), 'built off the plazas');
  for (const b of site.blocks) assert.ok(Math.hypot(b.x + 0.5 - site.plaza.x, b.y + 0.5 - site.plaza.y) <= site.plaza.r + 0.8, 'footprint wider than the plaza');
  const pileCells = () => {
    let n = 0;
    for (let y = site.pile.y0; y < site.pile.y1; y++) for (let x = site.pile.x0; x < site.pile.x1; x++) if (v.ground(x, y) > L.floor + 0) n++;
    return n;
  };
  assert.ok(pileCells() > 0, 'no pile of materials');
  let last = 0;
  // Builders until it stands (then nobody is left wanting to build).
  for (let i = 0; i < 1200 && !site.complete; i++) now = run(stage, builders, 0.05, now, () => {
    const laid = site.laid;
    if (laid === last) return;
    // Everything up to `laid` stands, in the world and its base; nothing past it yet.
    for (let k = 0; k < laid; k++) {
      const b = site.blocks[k];
      const i = v.idx(b.x, b.y, b.z);
      assert.equal(v.base[i], b.mat, `brick voxel ${k} not in the base`);
    }
    for (let k = laid; k < site.blocks.length; k++) {
      const b = site.blocks[k];
      assert.notEqual(v.base[v.idx(b.x, b.y, b.z)], b.mat === M.AIR ? -1 : b.mat, `voxel ${k} placed early`);
    }
    // Bottom-up: nothing laid sits above anything still to come.
    if (laid < site.blocks.length) assert.ok(site.blocks[laid - 1].z <= site.blocks[laid].z);
    last = laid;
  });
  assert.ok(site.complete, `only ${site.placed}/${site.count} bricks after 60 s`);
  assert.equal(pileCells(), 0, 'the pile is still there');
  // Blow a hole in it; healing puts it back.
  const T = buildTables(mines.colors);
  const mid = site.blocks[Math.floor(site.blocks.length / 2)];
  explode(v, T, mid.x, mid.y, mid.z, 3, new Rng(5), () => {});
  const standing = () => site.blocks.filter((b) => v.mat[v.idx(b.x, b.y, b.z)] === b.mat).length;
  const hit = standing();
  assert.ok(hit < site.blocks.length, 'the blast missed');
  run(stage, () => [], 240, now);
  assert.ok(standing() > hit, `healing restored nothing (${hit} → ${standing()})`);
  assert.ok(standing() >= site.blocks.length * 0.95, `only ${standing()} of ${site.blocks.length} voxels back`);
});

test('a finished build starts the next on the other plaza, up to one per plaza, then renews the oldest', () => {
  const stage = newStage();
  const v = stage.voxels()!;
  const solids = () => v.mat.reduce((n, m) => n + (MATERIALS[m]?.kind === 'solid' ? 1 : 0), 0);
  let now = run(stage, builders, 150);
  const builds = stage.builds();
  assert.equal(builds.length, 2, `${builds.length} builds`);
  assert.ok(builds.every((b) => b.complete), builds.map((b) => `${b.shape} ${b.placed}/${b.count}`).join(', '));
  assert.notEqual(builds[0].plaza, builds[1].plaza);
  const full = solids();
  const first = builds[0];
  // Every plaza built: nothing new starts until the oldest has stood a while.
  now = run(stage, builders, 60, now);
  assert.equal(stage.builds().length, 2);
  assert.ok(stage.builds().every((b) => b.complete));
  let seen = new Set<Construction>(stage.builds());
  let most = 0;
  run(stage, builders, 400, now, () => {
    for (const b of stage.builds()) seen.add(b);
    most = Math.max(most, stage.builds().length);
  });
  assert.ok(most <= 2, `${most} builds at once`);
  assert.ok(!stage.builds().includes(first), 'the oldest build was never renewed');
  assert.ok(seen.size > 2, 'nothing new was built');
  assert.ok(solids() < full * 1.05, `the world keeps filling up (${full} → ${solids()})`);
  seen = new Set();
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
  const site = stage.builds()[0];
  const before = site.placed;
  now = run(stage, () => [], 25, now);
  assert.ok(site.placed > before, 'the block was never laid');
  assert.equal(stage.actors().length, 0, 'never left');
});

// A bare mines world with a build staked out on its first plaza.
function staked(shape: Construction['shape'], H = 19) {
  const L = planLayout(360, 200);
  const v = new Voxels(L.W, L.D, L.H);
  mines.generate(v, L, new Rng(hashString('mines')));
  v.commitBase();
  return { v, c: new Construction(v, L, buildSites(L)[0], shape, { mats: [M.BRICK, M.ROCK], shape }, H) };
}

const same = (a: Uint8Array, b: Uint8Array) => Buffer.from(a.buffer, a.byteOffset, a.byteLength).equals(Buffer.from(b.buffer, b.byteOffset, b.byteLength));

test('a build shows exactly the voxels still to lay as its ghost, which shrinks brick by brick', () => {
  const { v, c } = staked('statue');
  const key = (b: { x: number; y: number; z: number }) => `${b.x},${b.y},${b.z}`;
  // The plaza is clear, so the whole blueprint is still to come.
  assert.ok(c.blocks.every((b) => v.mat[v.idx(b.x, b.y, b.z)] === M.AIR), 'the plaza is not clear');
  let last = Infinity;
  for (;;) {
    const mat = v.mat.slice();
    const base = v.base.slice();
    const g = c.ghost();
    assert.ok(same(v.mat, mat) && same(v.base, base), 'the ghost wrote voxels');
    assert.deepEqual(new Set(g.map(key)), new Set(c.blocks.slice(c.laid).map(key)), `ghost at ${c.placed}/${c.count} is not the unplaced voxels`);
    assert.ok(g.length < last, 'the ghost did not shrink');
    last = g.length;
    if (c.complete) break;
    c.place();
  }
  assert.equal(last, 0);
});

test('the ghost is drawn into the frame, never into the world, and fades as the build goes up', () => {
  const stage = newStage();
  const v = stage.voxels()!;
  const site = (stage as unknown as { works: Works }).works.current(0)!;
  const s = new Screen(120, 34);
  const shown = () => {
    stage.draw(s, 0, NOW, null);
    return stage.ghostShown;
  };
  const mat = v.mat.slice();
  const base = v.base.slice();
  const n0 = shown();
  assert.ok(n0 > 40, `only ${n0} ghost pixels`);
  assert.ok(same(v.mat, mat) && same(v.base, base), 'drawing the ghost wrote voxels');
  while (site.placed < site.count / 2) site.place();
  const n1 = shown();
  assert.ok(n1 > 0 && n1 < n0, `half built: ${n0} → ${n1} ghost pixels`);
  while (!site.complete) site.place();
  assert.equal(shown(), 0, 'a finished build still has a ghost');
});

test('small builds go up two bricks a haul, big ones one', () => {
  const small = staked('statue').c;
  const big = staked('tower').c;
  assert.ok(small.count < 30 && big.count >= 30, `${small.count} and ${big.count} bricks`);
  for (const [c, per] of [[small, 2], [big, 1]] as const) {
    const laid = c.place()!;
    assert.equal(c.placed, per, `${c.shape}: ${c.placed} bricks a haul`);
    assert.equal(laid.length, c.bricks[per] - c.bricks[0]);
    while (!c.complete) c.place();
    assert.equal(c.placed, c.count, 'overshot the last brick');
  }
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

test('the build hologram is cyan in a warm world and amber in a cold one, outlined, with a band sweeping up it', async () => {
  const { snowy } = await import('../src/cave/biomes/snowy.ts');
  const { hell } = await import('../src/cave/biomes/hell.ts');
  const { fungal } = await import('../src/cave/biomes/fungal.ts');
  const CYAN = [127, 232, 255];
  const AMBER = [255, 179, 71];
  for (const [b, hue] of [[mines, CYAN], [hell, CYAN], [snowy, AMBER], [fungal, AMBER]] as const) assert.deepEqual(newStage(b).ghostHue(), hue, b.id);

  // Over the mines' brown floor the ghost's pixels turn blue-green.
  const stage = newStage();
  const priv = stage as unknown as {
    world: { data: Int32Array; w: number };
    albedo: Int32Array;
    clock: number;
    works: Works;
    ghosts(): number[];
    overlayGhosts(found: number[], bare: Int32Array): number;
  };
  priv.works.current(0);
  stage.draw(new Screen(120, 34), 0, NOW, null);
  const found = priv.ghosts();
  const px = found.filter((_, k) => k % 4 === 0);
  assert.ok(px.length > 40, `${px.length} ghost pixels`);
  const ch = (v: number, sh: number) => (v >> sh) & 255;
  const mean = (ids: number[], f: (v: number) => number) => ids.reduce((s, i) => s + f(priv.world.data[i]), 0) / ids.length;
  const floor = [...priv.world.data.keys()].filter((i) => priv.world.data[i] !== -1 && !px.includes(i));
  assert.ok(mean(floor, (v) => ch(v, 16) - ch(v, 0)) > 10, 'the mines are not warm');
  assert.ok(mean(px, (v) => ch(v, 0) - ch(v, 16)) > 10, 'the ghost is not cool');
  // A bright outline: silhouette pixels with a side off it outshine the inside.
  const inside = new Set(px);
  const W = priv.world.w;
  const edge = px.filter((i) => !inside.has(i - 1) || !inside.has(i + 1) || !inside.has(i - W) || !inside.has(i + W));
  const core = px.filter((i) => !edge.includes(i));
  const lum = (v: number) => ch(v, 16) + ch(v, 8) + ch(v, 0);
  assert.ok(edge.length > 10 && core.length > 10);
  assert.ok(mean(edge, lum) > mean(core, lum) + 40, `outline ${mean(edge, lum).toFixed(0)} vs inside ${mean(core, lum).toFixed(0)}`);
  // The band climbs: a second later it is higher up the ghost. Over a grey
  // floor its pixels are the whitest inside the outline.
  const band = (clock: number) => {
    priv.clock = clock;
    for (const i of px) priv.world.data[i] = 0x404040;
    priv.overlayGhosts(found, priv.albedo);
    const rows = core.filter((i) => lum(priv.world.data[i]) > 470).map((i) => Math.floor(i / W));
    return rows.reduce((s, y) => s + y, 0) / rows.length;
  };
  const low = band(0.25);
  const high = band(1.25);
  assert.ok(Number.isFinite(low) && Number.isFinite(high), 'no band');
  assert.ok(high < low - 3, `band at row ${low.toFixed(1)}, then ${high.toFixed(1)}`);
  assert.equal(band(2.25), low, 'the sweep does not repeat every 2 s');
});
