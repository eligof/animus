import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Caster } from '../src/cave/raycast.ts';
import { M, buildTables } from '../src/cave/materials.ts';
import type { View } from '../src/cave/types.ts';
import { Voxels } from '../src/cave/voxels.ts';

const T = buildTables();
const lum = (c: number) => ((c >> 16) & 255) * 3 + ((c >> 8) & 255) * 6 + (c & 255);

// A caster whose canvas fits the whole grid with a small margin.
function fit(v: Voxels, dx = 0, dy = 0): { c: Caster; view: View; w: number; h: number } {
  const view = { ox: v.D + 2 + dx, oy: v.H + 2 + dy };
  const w = v.W + v.D + 5;
  const h = Math.ceil((v.W + v.D) / 2) + v.H + 5;
  return { c: new Caster(v, T, w, h, view), view, w, h };
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
}

test('an empty world is all backdrop', () => {
  const v = new Voxels(6, 5, 4);
  const { c } = fit(v);
  c.renderAll();
  assert.ok(c.albedo.every((a) => a === -1));
  assert.ok(c.emit.every((e) => e === 0));
  assert.ok(c.depth.every((d) => d === -Infinity));
});

test('a single voxel lights four pixels: two top, one left side, one right side', () => {
  const v = new Voxels(4, 4, 4);
  v.put(1, 1, 1, M.ROCK, 3);
  const view = { ox: 5, oy: 5 };
  const c = new Caster(v, T, 12, 12, view);
  c.renderAll();
  // The voxel's corner (1, 1, 1) projects to (5, 5): the top face covers
  // the row above it, the +y face (screen left) and +x face (screen right)
  // the row below.
  const lit: string[] = [];
  for (let p = 0; p < 144; p++) if (c.albedo[p] !== -1) lit.push(`${p % 12},${(p / 12) | 0}`);
  assert.deepEqual(lit.sort(), ['4,4', '4,5', '5,4', '5,5']);
  const at = (x: number, y: number) => c.albedo[y * 12 + x];
  assert.equal(at(4, 4), at(5, 4));
  assert.ok(lum(at(4, 4)) > lum(at(4, 5)), 'top brighter than the left side');
  assert.ok(lum(at(4, 5)) > lum(at(5, 5)), 'left side brighter than the right side');
  const vi = v.idx(1, 1, 1);
  for (const [x, y] of [[4, 4], [5, 4], [4, 5], [5, 5]]) {
    assert.equal(c.hit[y * 12 + x], vi);
    // The hit point lies on the cube, so its depth is within the cube's range.
    const d = c.depth[y * 12 + x];
    assert.ok(d >= 3 && d <= 6, `depth ${d}`);
  }
  // Depth is x + y + z where the pixel's ray meets the face: at (4.5, 4.5)
  // the top at z = 2, at (4.5, 5.5) the +y face at y = 2.
  assert.equal(c.depth[4 * 12 + 4], 5);
  assert.equal(c.depth[5 * 12 + 4], 4.75);
});

test('a nearer voxel hides a farther one', () => {
  const v = new Voxels(5, 5, 5);
  v.put(1, 1, 1, M.ROCK);
  v.put(2, 2, 2, M.METAL);
  const { c } = fit(v);
  c.renderAll();
  const far = v.idx(1, 1, 1);
  const near = v.idx(2, 2, 2);
  let seen = 0;
  for (let p = 0; p < c.hit.length; p++) {
    assert.notEqual(c.hit[p], far);
    if (c.hit[p] === near) seen++;
  }
  assert.equal(seen, 4);
});

test('water over sand mixes their colours and keeps the sand depth', () => {
  const v = new Voxels(6, 6, 4);
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) v.put(x, y, 0, M.SAND, 2);
  const dry = fit(v);
  dry.c.renderAll();
  for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) v.put(x, y, 1, M.WATER, 2);
  const wet = fit(v);
  wet.c.renderAll();
  // A pixel looking down through the middle of the pool onto the sand.
  const [sx, sy] = [wet.view.ox + 0.5, wet.view.oy + 3 - 1 + 0.5];
  const p = Math.floor(sy) * wet.w + Math.floor(sx);
  const water = T.color[(M.WATER << 3) | 2];
  const mixed = wet.c.albedo[p];
  const sand = dry.c.albedo[p];
  assert.equal(wet.c.hit[p], dry.c.hit[p]);
  assert.ok(wet.c.hit[p] >= 0 && v.mat[wet.c.hit[p]] === M.SAND);
  assert.equal(wet.c.depth[p], dry.c.depth[p]);
  assert.notEqual(mixed, sand);
  assert.ok((mixed & 255) > (sand & 255), 'bluer than sand');
  assert.ok(((mixed >> 16) & 255) > ((water >> 16) & 255), 'redder than water');
});

test('glowing voxels write their light to emit', () => {
  const v = new Voxels(5, 5, 5);
  v.put(1, 1, 1, M.LAVA, 4);
  v.put(3, 3, 1, M.ROCK, 4);
  const { c } = fit(v);
  c.renderAll();
  const lava = v.idx(1, 1, 1);
  const glow = T.glow[(M.LAVA << 3) | 4];
  let lit = 0;
  for (let p = 0; p < c.hit.length; p++) {
    if (c.hit[p] === lava) {
      assert.equal(c.emit[p], glow);
      lit++;
    } else assert.equal(c.emit[p], 0);
  }
  assert.ok(lit > 0);
  // A translucent glowing voxel in front of rock glows too, more faintly.
  v.put(4, 4, 2, M.FIRE, 0);
  const f = fit(v);
  f.c.renderAll();
  const fire = T.glow[(M.FIRE << 3) | 0];
  const behind = f.c.hit.findIndex((h, p) => h === v.idx(3, 3, 1) && f.c.emit[p] !== 0);
  assert.ok(behind >= 0, 'fire in front of the rock adds light');
  assert.ok(lum(f.c.emit[behind]) < lum(fire));
});

// Reference: every voxel's stretch along the (nudged) ray, nearest first.
function bruteHits(v: Voxels, w: number, h: number, view: View): Int32Array {
  const out = new Int32Array(w * h).fill(-1);
  const e = 1e-6;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const a = px + 0.5 - view.ox + e;
      const c = (px + 0.5 - view.ox + 2 * (py + 0.5 - view.oy)) / 2 + 2 * e;
      let best = -Infinity;
      for (let i = 0; i < v.size; i++) {
        if (T.alpha[v.mat[i]] < 1) continue;
        const x = v.xOf(i);
        const y = v.yOf(i);
        const z = v.zOf(i);
        const lo = Math.max(x, y + a, z + c);
        const hi = Math.min(x + 1, y + 1 + a, z + 1 + c);
        if (hi - lo > 1e-9 && hi > best) {
          best = hi;
          out[py * w + px] = i;
        }
      }
    }
  }
  return out;
}

test('hits match a brute-force march, ties and all', () => {
  const rnd = rng(5);
  for (const [dx, dy] of [[0, 0], [0.5, 0], [0, 0.5], [0.5, 0.5], [0.25, -0.25]]) {
    const v = new Voxels(7, 6, 5);
    for (let i = 0; i < v.size; i++) if (rnd() < 0.25) v.set(i, M.ROCK);
    const { c, view, w, h } = fit(v, dx, dy);
    c.renderAll();
    assert.deepEqual(c.hit, bruteHits(v, w, h, view), `view offset ${dx}, ${dy}`);
  }
});

test('a solid block shows no cracks, even with every edge on a pixel centre', () => {
  for (const [dx, dy] of [[0, 0], [0.5, 0], [0.5, 0.5]]) {
    const v = new Voxels(6, 5, 4);
    for (let i = 0; i < v.size; i++) v.set(i, M.ROCK);
    const { c, view, w, h } = fit(v, dx, dy);
    c.renderAll();
    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        // Inside the block's silhouette (strictly) means some voxel is hit.
        const a = px + 0.5 - view.ox;
        const cc = (a + 2 * (py + 0.5 - view.oy)) / 2;
        const inside = Math.min(v.W, v.D + a, v.H + cc) - Math.max(0, a, cc) > 1e-9;
        if (inside) assert.ok(c.hit[py * w + px] >= 0, `crack at ${px},${py} (offset ${dx}, ${dy})`);
      }
    }
  }
});

test('incremental updates equal a fresh render', () => {
  const mats = [M.AIR, M.AIR, M.ROCK, M.DIRT, M.SAND, M.WATER, M.LAVA, M.SMOKE, M.GLASS, M.FIRE, M.CRYSTAL];
  for (const [dx, dy] of [[0, 0], [0.5, 0.5]]) {
    const rnd = rng(42 + dx * 10);
    const v = new Voxels(18, 15, 12);
    for (let i = 0; i < v.size; i++) if (v.zOf(i) < 3 || rnd() < 0.15) v.set(i, mats[(rnd() * mats.length) | 0]);
    v.takeChanges();
    const { c } = fit(v, dx, dy);
    c.renderAll();
    for (let round = 0; round < 50; round++) {
      const n = 1 + ((rnd() * (round % 5 === 0 ? 300 : 30)) | 0);
      for (let k = 0; k < n; k++) v.set((rnd() * v.size) | 0, mats[(rnd() * mats.length) | 0], (rnd() * 8) | 0);
      c.update(v.takeChanges());
      const fresh = fit(v, dx, dy).c;
      fresh.renderAll();
      assert.deepEqual(c.albedo, fresh.albedo, `albedo, round ${round}`);
      assert.deepEqual(c.emit, fresh.emit, `emit, round ${round}`);
      assert.deepEqual(c.depth, fresh.depth, `depth, round ${round}`);
      assert.deepEqual(c.hit, fresh.hit, `hit, round ${round}`);
    }
  }
});

// The cave the renderer is sized for: two rock slabs 8 thick for the back
// walls, a bumpy floor, a pool, a few props, air above.
function bigCave(rnd: () => number): Voxels {
  const v = new Voxels(160, 130, 48);
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number) => {
    for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.put(x, y, z, m);
  };
  box(0, 0, 0, 8, 130, 48, M.ROCK);
  box(0, 0, 0, 160, 8, 48, M.ROCK_DARK);
  box(0, 0, 0, 160, 130, 8, M.ROCK);
  for (let k = 0; k < 400; k++) {
    const x = 8 + ((rnd() * 150) | 0);
    const y = 8 + ((rnd() * 120) | 0);
    box(x, y, 8, x + 3, y + 3, 9 + ((rnd() * 3) | 0), M.DIRT);
  }
  box(40, 60, 6, 70, 80, 8, M.WATER);
  box(100, 30, 8, 104, 34, 20, M.WOOD);
  box(20, 20, 8, 30, 24, 28, M.METAL);
  box(120, 90, 8, 124, 93, 10, M.LAVA);
  v.takeChanges();
  return v;
}

const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[xs.length >> 1];

test('performance: 400x180 over a 160x130x48 cave', (t) => {
  const rnd = rng(11);
  const v = bigCave(rnd);
  const view = { ox: 185, oy: 40 };
  const c = new Caster(v, T, 400, 180, view);
  c.renderAll();
  const full: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    c.renderAll();
    full.push(performance.now() - t0);
  }
  const inc: number[] = [];
  for (let k = 0; k < 5; k++) {
    for (let n = 0; n < 3000; n++) {
      const x = 8 + ((rnd() * 152) | 0);
      const y = 8 + ((rnd() * 122) | 0);
      const z = 8 + ((rnd() * 10) | 0);
      v.put(x, y, z, v.get(x, y, z) === M.AIR ? M.SAND : M.AIR);
    }
    const changes = v.takeChanges();
    const t0 = performance.now();
    c.update(changes);
    inc.push(performance.now() - t0);
  }
  const fresh = new Caster(v, T, 400, 180, view);
  fresh.renderAll();
  assert.deepEqual(c.albedo, fresh.albedo);
  t.diagnostic(`renderAll median ${median(full).toFixed(2)} ms (target 40)`);
  t.diagnostic(`update(~3000 changes) median ${median(inc).toFixed(2)} ms (target 4)`);
  assert.ok(median(full) < 120, `renderAll ${median(full)} ms`);
  assert.ok(median(inc) < 12, `update ${median(inc)} ms`);
});
