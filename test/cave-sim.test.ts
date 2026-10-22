import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTables, M } from '../src/cave/materials.ts';
import { debris, ember, spark, updateParticles } from '../src/cave/particles.ts';
import { dig, explode, fuelOf, heal, ignite, spawn, step } from '../src/cave/sim.ts';
import type { Particle } from '../src/cave/types.ts';
import { Voxels } from '../src/cave/voxels.ts';
import { Rng } from '../src/world/rng.ts';

const T = buildTables();

// A small world with a rock floor at z = 0.
function world(W = 24, D = 24, H = 24): Voxels {
  const v = new Voxels(W, D, H);
  box(v, 0, 0, 0, W - 1, D - 1, 0, M.ROCK);
  return v;
}

// Fills the inclusive box with m.
function box(v: Voxels, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number): void {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) v.put(x, y, z, m);
}

// A rock basin: walls one voxel thick around the inclusive interior box,
// from the floor up to z1.
function basin(v: Voxels, x0: number, y0: number, x1: number, y1: number, z1: number): void {
  box(v, x0 - 1, y0 - 1, 1, x1 + 1, y1 + 1, z1, M.ROCK);
  box(v, x0, y0, 1, x1, y1, z1, M.AIR);
}

function count(v: Voxels, m: number): number {
  let n = 0;
  for (let i = 0; i < v.size; i++) if (v.mat[i] === m) n++;
  return n;
}

function asleep(v: Voxels): boolean {
  return v.next.every((c) => c === 0);
}

class Sim {
  readonly v: Voxels;
  readonly rng: Rng;
  tick = 0;
  constructor(v: Voxels, seed = 1) {
    this.v = v;
    this.rng = new Rng(seed);
    v.commitBase();
  }
  run(n: number, each?: (t: number) => void): void {
    for (let k = 0; k < n; k++) {
      each?.(this.tick);
      step(this.v, T, this.rng, this.tick++);
      this.v.takeChanges();
    }
  }
  pour(x: number, y: number, z: number, m: number): void {
    if (this.v.get(x, y, z) === M.AIR) spawn(this.v, this.v.idx(x, y, z), m, this.rng);
  }
}

test('a column of sand slumps into a sloped pile and keeps every grain', () => {
  const s = new Sim(world());
  box(s.v, 12, 12, 1, 12, 12, 12, M.SAND);
  s.run(400);
  assert.equal(count(s.v, M.SAND), 12);
  const height = (x: number, y: number) => {
    let h = 0;
    for (let z = 1; z < s.v.H; z++) if (s.v.get(x, y, z) === M.SAND) h++;
    return h;
  };
  let wide = 0;
  let top = 0;
  for (let y = 0; y < 24; y++) {
    for (let x = 0; x < 24; x++) {
      const h = height(x, y);
      if (h > 0) wide++;
      top = Math.max(top, h);
    }
  }
  assert.ok(wide >= 5, `footprint ${wide}`);
  assert.ok(top >= 2 && top < 12, `peak ${top}`);
  assert.equal(height(12, 12), top, 'the peak sits where the sand fell');
  assert.ok(height(12, 12) > height(14, 12), 'slopes down from the peak');
});

test('water poured into a basin levels out', () => {
  const s = new Sim(world());
  basin(s.v, 4, 4, 19, 19, 8);
  let poured = 0;
  s.run(1600, (t) => {
    if (t < 400 && s.v.get(11, 12, 14) === M.AIR) {
      s.pour(11, 12, 14, M.WATER);
      poured++;
    }
  });
  assert.equal(count(s.v, M.WATER), poured);
  let lo = Infinity;
  let hi = -Infinity;
  for (let y = 4; y <= 19; y++) {
    for (let x = 4; x <= 19; x++) {
      let top = 1;
      for (let z = 1; z < s.v.H; z++) if (s.v.get(x, y, z) === M.WATER) top = z + 1;
      lo = Math.min(lo, top);
      hi = Math.max(hi, top);
    }
  }
  assert.ok(hi - lo <= 1, `surface from ${lo} to ${hi}`);
  assert.ok(asleep(s.v), 'the pool comes to rest');
});

test('oil floats up through water', () => {
  const s = new Sim(world());
  basin(s.v, 8, 8, 15, 15, 10);
  box(s.v, 8, 8, 1, 15, 15, 3, M.OIL);
  box(s.v, 8, 8, 4, 15, 15, 6, M.WATER);
  s.run(800);
  assert.equal(count(s.v, M.OIL), 192);
  assert.equal(count(s.v, M.WATER), 192);
  for (let y = 8; y <= 15; y++) {
    for (let x = 8; x <= 15; x++) {
      let water = -1;
      let oil = Infinity;
      for (let z = 1; z < s.v.H; z++) {
        const m = s.v.get(x, y, z);
        if (m === M.WATER) water = Math.max(water, z);
        if (m === M.OIL) oil = Math.min(oil, z);
      }
      assert.ok(water < oil, `column ${x},${y}: water up to ${water}, oil from ${oil}`);
    }
  }
});

test('a wooden block next to fire burns away to ash, smoking', () => {
  const s = new Sim(world());
  box(s.v, 10, 10, 1, 13, 13, 4, M.WOOD);
  let smoke = 0;
  let ash = 0;
  s.run(3000, (t) => {
    // A torch held against one face for the first second or so.
    if (t < 40) for (let z = 1; z <= 4; z++) for (let y = 10; y <= 13; y++) s.pour(9, y, z, M.FIRE);
    if (t % 10 === 0) {
      smoke = Math.max(smoke, count(s.v, M.SMOKE));
      ash = Math.max(ash, count(s.v, M.ASH));
    }
  });
  // Fire can die out beside a last splinter; nearly all of it must go.
  assert.ok(count(s.v, M.WOOD) <= 2, `${count(s.v, M.WOOD)} of 64 wood voxels left`);
  assert.equal(count(s.v, M.FIRE), 0);
  assert.ok(smoke > 0, 'no smoke');
  assert.ok(ash > 0 && count(s.v, M.ASH) > 0, 'no ash');
});

test('a burning voxel remembers its fuel and leaves the residue', () => {
  const v = world();
  const rng = new Rng(3);
  const i = v.idx(5, 5, 1);
  v.set(i, M.WOOD);
  assert.ok(ignite(v, i, rng));
  assert.equal(v.mat[i], M.FIRE);
  assert.equal(fuelOf(v.shade[i]), M.WOOD);
  assert.ok(v.life[i] > 0);
  spawn(v, v.idx(6, 5, 1), M.FIRE, rng);
  assert.equal(fuelOf(v.shade[v.idx(6, 5, 1)]), M.AIR, 'a bare flame');
  v.set(v.idx(7, 5, 1), M.ROCK);
  assert.equal(ignite(v, v.idx(7, 5, 1), rng), false, 'rock does not burn');
});

test('water on lava makes obsidian and steam', () => {
  const s = new Sim(world());
  basin(s.v, 8, 8, 13, 13, 6);
  box(s.v, 8, 8, 1, 13, 13, 1, M.LAVA);
  let steam = 0;
  s.run(300, (t) => {
    if (t < 80) s.pour(10, 10, 12, M.WATER);
    steam = Math.max(steam, count(s.v, M.STEAM));
  });
  assert.ok(count(s.v, M.OBSIDIAN) > 0, 'no obsidian');
  assert.ok(steam > 0, 'no steam');
});

test('smoke rises and fades away', () => {
  const s = new Sim(world());
  box(s.v, 11, 11, 2, 13, 13, 2, M.SMOKE);
  const meanZ = () => {
    let n = 0;
    let sum = 0;
    for (let i = 0; i < s.v.size; i++) {
      if (s.v.mat[i] !== M.SMOKE) continue;
      n++;
      sum += s.v.zOf(i);
    }
    return sum / n;
  };
  s.run(10);
  assert.equal(count(s.v, M.SMOKE), 9);
  assert.ok(meanZ() > 5, `mean height ${meanZ()}`);
  s.run(300);
  assert.equal(count(s.v, M.SMOKE), 0);
  assert.ok(asleep(s.v));
});

test('a settled world stops simulating', () => {
  const s = new Sim(world());
  basin(s.v, 3, 3, 12, 12, 6);
  box(s.v, 16, 16, 6, 18, 18, 14, M.SAND);
  box(s.v, 5, 5, 8, 9, 9, 10, M.WATER);
  s.run(1500);
  assert.ok(asleep(s.v), 'chunks still awake');
  const snapshot = s.v.mat.slice();
  s.run(10);
  assert.ok(s.v.active.every((c) => c === 0));
  assert.deepEqual(s.v.mat, snapshot);
});

test('explode carves a crater and its debris lands as gravel', () => {
  const s = new Sim(world());
  box(s.v, 0, 0, 0, 23, 23, 9, M.ROCK);
  const rock = count(s.v, M.ROCK);
  const ps: Particle[] = [];
  explode(s.v, T, 12, 12, 9, 4, s.rng, (p) => ps.push(p));
  assert.ok(rock - count(s.v, M.ROCK) > 30, `carved ${rock - count(s.v, M.ROCK)}`);
  assert.equal(s.v.get(12, 12, 9) === M.ROCK, false, 'the centre is gone');
  assert.ok(ps.some((p) => p.kind === 'debris' && p.mat === M.GRAVEL), 'no debris');
  assert.ok(ps.some((p) => p.kind === 'spark' && p.glow && p.ignites), 'no sparks');
  assert.equal(count(s.v, M.GRAVEL), 0);
  s.run(300, () => updateParticles(ps, s.v, T, 1 / 30, s.rng));
  assert.equal(ps.length, 0);
  assert.ok(count(s.v, M.GRAVEL) > 0, 'no gravel landed');
});

test('explode spares metal and obsidian at the rim', () => {
  const v = world();
  box(v, 0, 0, 0, 23, 23, 9, M.METAL);
  const before = count(v, M.METAL);
  explode(v, T, 12, 12, 9, 4, new Rng(5), () => {});
  assert.ok(before - count(v, M.METAL) < 8, `metal lost ${before - count(v, M.METAL)}`);
});

test('dig removes a blob of rock, returns the count and throws gravel', () => {
  const v = world();
  box(v, 0, 0, 0, 23, 23, 9, M.ROCK);
  box(v, 14, 12, 8, 14, 12, 9, M.METAL);
  const rock = count(v, M.ROCK);
  const ps: Particle[] = [];
  const n = dig(v, T, 12, 12, 9, 2, new Rng(9), (p) => ps.push(p));
  assert.ok(n > 0);
  assert.equal(rock - count(v, M.ROCK), n);
  assert.equal(count(v, M.METAL), 2, 'metal is not dug');
  assert.ok(ps.length > 0 && ps.every((p) => p.kind === 'debris' && p.mat === M.GRAVEL));
});

test('heal regrows a carved hole from its walls, except where protected', () => {
  const s = new Sim(world());
  box(s.v, 0, 0, 0, 23, 23, 9, M.ROCK);
  s.v.commitBase();
  box(s.v, 10, 10, 4, 12, 12, 6, M.AIR);
  box(s.v, 3, 3, 4, 4, 4, 5, M.AIR);
  const guarded = (x: number, y: number) => x < 6 && y < 6;
  let t = 0;
  for (; t < 20000 && count(s.v, M.AIR) > 8 + 24 * 24 * 14; t++) heal(s.v, T, s.rng, 1000, guarded);
  assert.equal(count(s.v, M.AIR), 8 + 24 * 24 * 14, `after ${t} rounds`);
  for (let z = 4; z <= 6; z++) for (let y = 10; y <= 12; y++) for (let x = 10; x <= 12; x++) {
    const i = s.v.idx(x, y, z);
    assert.equal(s.v.mat[i], M.ROCK);
    assert.equal(s.v.shade[i], s.v.baseShade[i]);
  }
  assert.equal(s.v.get(3, 3, 4), M.AIR, 'protected voxel regrew');
});

test('heal refills springs and wears loose material away', () => {
  const s = new Sim(world());
  basin(s.v, 4, 4, 9, 9, 4);
  box(s.v, 4, 4, 1, 9, 9, 3, M.WATER);
  s.v.commitBase();
  box(s.v, 4, 4, 3, 9, 9, 3, M.AIR);
  box(s.v, 14, 14, 1, 16, 16, 3, M.SAND);
  for (let t = 0; t < 3000; t++) heal(s.v, T, s.rng, 1000);
  assert.equal(count(s.v, M.WATER), 108, 'the pool refilled');
  assert.equal(count(s.v, M.SAND), 0, 'the loose sand wore away');
});

test('with heal running, steady sand fall plateaus', () => {
  const s = new Sim(world());
  const samples: number[] = [];
  s.run(5000, (t) => {
    for (let k = 0; k < 3; k++) s.pour(s.rng.int(2, 21), s.rng.int(2, 21), 20, M.SAND);
    heal(s.v, T, s.rng, 400);
    if (t % 100 === 0) samples.push(count(s.v, M.SAND));
  });
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const mid = mean(samples.slice(25, 35));
  const late = mean(samples.slice(40));
  assert.ok(late < mid * 1.15, `still growing: ${mid.toFixed(0)} → ${late.toFixed(0)}`);
  assert.ok(Math.max(...samples) < 2000, `peak ${Math.max(...samples)} of 15000 poured`);
});

test('the same seed gives the same world', () => {
  const play = (seed: number) => {
    const v = world();
    basin(v, 3, 3, 10, 10, 5);
    box(v, 3, 3, 1, 10, 10, 2, M.OIL);
    box(v, 15, 15, 1, 18, 18, 4, M.WOOD);
    box(v, 4, 4, 10, 8, 8, 12, M.WATER);
    box(v, 16, 4, 6, 18, 6, 12, M.SAND);
    box(v, 14, 14, 1, 14, 18, 3, M.FIRE);
    box(v, 4, 4, 3, 5, 5, 3, M.FIRE);
    box(v, 1, 20, 1, 3, 22, 3, M.GUNPOWDER);
    v.put(4, 20, 1, M.FIRE);
    const s = new Sim(v, seed);
    const ps: Particle[] = [];
    s.run(400, () => {
      updateParticles(ps, v, T, 1 / 30, s.rng);
      heal(v, T, s.rng, 200);
    });
    return v;
  };
  const a = play(42);
  const b = play(42);
  assert.deepEqual(a.mat, b.mat);
  assert.deepEqual(a.shade, b.shade);
  assert.deepEqual(a.life, b.life);
  assert.notDeepEqual(play(43).mat, a.mat);
});

test('particles: sparks light what they hit, embers float, bolts arrive', () => {
  const v = world();
  box(v, 0, 0, 0, 23, 23, 2, M.GUNPOWDER);
  const rng = new Rng(4);
  const ps: Particle[] = [spark(12, 12, 6, rng), ember(5, 5, 5, rng), { kind: 'bolt', x: 2, y: 2, z: 10, vx: 0, vy: 0, vz: 0, life: 5, color: [255, 255, 255], glow: true, gravity: 0, target: { x: 20, y: 20, z: 10 } }];
  ps[0].vz = -10;
  let lit = false;
  let rose = false;
  for (let f = 0; f < 120 && ps.length; f++) {
    updateParticles(ps, v, T, 1 / 30, rng);
    lit ||= count(v, M.FIRE) > 0;
    rose ||= ps.some((p) => p.kind === 'ember' && p.z > 5.5);
  }
  assert.ok(lit, 'the spark lit no gunpowder');
  assert.ok(rose, 'the ember did not float up');
  assert.equal(ps.length, 0, 'every particle ended');
  const d = debris(1, 1, 1, M.GOLD_DUST, T, rng);
  assert.equal(d.mat, M.GOLD_DUST);
  assert.equal(d.glow, true);
});

test('burning gunpowder explodes', () => {
  const s = new Sim(world());
  box(s.v, 0, 0, 0, 23, 23, 4, M.ROCK);
  box(s.v, 10, 10, 5, 13, 13, 6, M.GUNPOWDER);
  const rock = count(s.v, M.ROCK);
  const ps: Particle[] = [];
  s.v.put(9, 10, 5, M.FIRE);
  for (let k = 0; k < 120; k++) {
    step(s.v, T, s.rng, s.tick++, (p) => ps.push(p));
    s.v.takeChanges();
  }
  assert.equal(count(s.v, M.GUNPOWDER), 0);
  assert.ok(rock - count(s.v, M.ROCK) > 10, 'no crater');
  assert.ok(ps.length > 0, 'no particles');
});

test('step stays fast in a busy 140x120x48 cave', () => {
  const v = new Voxels(140, 120, 48);
  box(v, 0, 0, 0, 139, 119, 5, M.ROCK);
  // An oil pool, alight and fed from a spout so it keeps burning.
  box(v, 19, 19, 6, 46, 46, 12, M.ROCK);
  box(v, 20, 20, 6, 45, 45, 12, M.AIR);
  box(v, 20, 20, 6, 45, 45, 9, M.OIL);
  for (let y = 22; y < 44; y += 4) for (let x = 22; x < 44; x += 4) v.put(x, y, 10, M.FIRE);
  // A basin under a waterfall.
  box(v, 79, 29, 6, 111, 61, 16, M.ROCK);
  box(v, 80, 30, 6, 110, 60, 16, M.AIR);
  box(v, 80, 30, 6, 110, 60, 9, M.WATER);
  const s = new Sim(v, 7);
  let lit = true;
  const each = () => {
    for (let k = 0; k < 4; k++) s.pour(94 + (k & 1), 44 + (k >> 1), 40, M.WATER);
    for (let k = 0; k < 3; k++) s.pour(32 + k, 32, 30, M.OIL);
    for (let k = 0; k < 3; k++) s.pour(s.rng.int(58, 62), s.rng.int(78, 82), 6, M.SMOKE);
  };
  // The first tick after commitBase scans every chunk once; time after it.
  s.run(10, each);
  let ms = 0;
  let worst = 0;
  const N = 300;
  for (let k = 0; k < N; k++) {
    each();
    const t0 = performance.now();
    step(v, T, s.rng, s.tick++);
    const dt = performance.now() - t0;
    ms += dt;
    worst = Math.max(worst, dt);
    v.takeChanges();
    if (k % 50 === 0 && count(v, M.FIRE) === 0) lit = false;
  }
  const awake = v.next.reduce((n, c) => n + c, 0);
  const avg = ms / N;
  console.log(`  step: ${avg.toFixed(3)} ms/tick average (worst ${worst.toFixed(2)}) over ${N} ticks; ${awake}/${v.next.length} chunks awake, fire ${count(v, M.FIRE)}, smoke ${count(v, M.SMOKE)}, water ${count(v, M.WATER)}`);
  assert.ok(lit, 'the pool went out');
  assert.ok(avg < 3, `${avg.toFixed(2)} ms per tick`);
});
