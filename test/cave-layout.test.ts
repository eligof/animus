import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEFT_WALL, LIMITS, PROP_SIZE, RIGHT_WALL, inRect, planLayout, slotRect } from '../src/cave/layout.ts';
import { mines } from '../src/cave/biomes/mines.ts';
import { M, MATERIALS } from '../src/cave/materials.ts';
import { project } from '../src/cave/types.ts';
import type { Ctx, Layout, Particle, PointLight, Slot, SlotKind } from '../src/cave/types.ts';
import { Voxels } from '../src/cave/voxels.ts';
import { Rng } from '../src/world/rng.ts';

const SIZES: Array<[number, number]> = [
  [80, 40],
  [184, 99],
  [320, 171],
  [400, 180],
  [1000, 500],
];
const KINDS: SlotKind[] = ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write'];
const PARTICLE_KINDS = new Set(['spark', 'ember', 'debris', 'drop', 'rune', 'bolt', 'glint', 'zzz']);

const kindOf = (m: number) => MATERIALS[m]?.kind ?? 'solid';
const solid = (m: number) => kindOf(m) === 'solid';
const liquid = (m: number) => kindOf(m) === 'liquid';

function world(L: Layout, seed = 1): Voxels {
  const v = new Voxels(L.W, L.D, L.H);
  mines.generate(v, L, new Rng(seed));
  return v;
}

// A frame context that records what props and weather emit.
function stub(v: Voxels, seed = 3) {
  const lights: PointLight[] = [];
  const parts: Particle[] = [];
  const c: Ctx = { v, rng: new Rng(seed), t: 0, dt: 1 / 30, spawn: (p) => parts.push(p), light: (l) => lights.push(l) };
  return { c, lights, parts };
}

function run(c: Ctx, frames: number, each: () => void): void {
  for (let f = 0; f < frames; f++) {
    c.t += c.dt;
    each();
  }
}

const big = (cw: number, ch: number) => cw >= 2 * LIMITS.minSide + 4 && ch >= LIMITS.minSide + LIMITS.minH + 4;

test('planLayout sizes the chunk to the canvas within the clamps', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const tag = `${cw}x${ch}: ${L.W}x${L.D}x${L.H} T${L.T} floor ${L.floor}`;
    assert.ok(L.W >= LIMITS.minSide && L.W <= LIMITS.maxSide && L.D >= LIMITS.minSide && L.D <= LIMITS.maxSide, tag);
    assert.ok(L.H >= LIMITS.minH && L.H <= LIMITS.maxH, tag);
    assert.ok(L.T >= 6 && L.T <= 8 && L.floor >= 6 && L.floor <= 10, tag);
    const corners = [project(L.view, 0, 0, L.H), project(L.view, L.W, 0, 0), project(L.view, 0, L.D, 0), project(L.view, L.W, L.D, 0), project(L.view, L.W, 0, L.H), project(L.view, 0, L.D, L.H)];
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    // Centred on the canvas, whether or not it fits.
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - cw / 2) <= 1, `${tag}: not centred across`);
    assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - ch / 2) <= 1, `${tag}: not centred down`);
    if (big(cw, ch)) {
      for (const [sx, sy] of corners) assert.ok(sx >= 0 && sx <= cw && sy >= 0 && sy <= ch, `${tag}: corner ${sx},${sy} off the canvas`);
    } else {
      assert.equal(L.W, LIMITS.minSide, `${tag}: a small canvas gets the smallest chunk`);
    }
  }
  assert.ok(big(320, 171) && big(400, 180) && big(1000, 500));
});

test('bigger canvases get bigger chunks, up to the cap', () => {
  const sides = SIZES.map(([cw, ch]) => planLayout(cw, ch).W);
  for (let i = 1; i < sides.length; i++) assert.ok(sides[i] >= sides[i - 1], sides.join(' '));
  const huge = planLayout(1000, 500);
  assert.equal(huge.W, LIMITS.maxSide);
  assert.equal(huge.H, LIMITS.maxH);
});

test('every prop gets a slot backing onto its wall, inside the room, without overlaps', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const tag = `${cw}x${ch}`;
    assert.deepEqual(L.slots.map((s) => s.kind).sort(), KINDS, tag);
    for (const s of L.slots) {
      const r = slotRect(s);
      assert.ok(r.x0 >= L.T && r.y0 >= L.T && r.x1 <= L.W && r.y1 <= L.D, `${tag}: ${s.kind} off the floor`);
      assert.equal(s.wall === 'right' ? s.y0 : s.x0, L.T, `${tag}: ${s.kind} not against its wall`);
      assert.equal(s.z0, L.floor);
      assert.equal(s.len, PROP_SIZE[s.kind].len);
      assert.equal(s.dep, PROP_SIZE[s.kind].dep);
      assert.ok((s.wall === 'right' ? RIGHT_WALL : LEFT_WALL).includes(s.kind), `${tag}: ${s.kind} on the ${s.wall} wall`);
    }
    for (let i = 0; i < L.slots.length; i++) {
      for (let j = i + 1; j < L.slots.length; j++) {
        const a = slotRect(L.slots[i]);
        const b = slotRect(L.slots[j]);
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
        assert.ok(!overlap, `${tag}: ${L.slots[i].kind} overlaps ${L.slots[j].kind}`);
      }
    }
  }
});

test('spots stand on open floor in front of their props, apart from each other', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const tag = `${cw}x${ch}`;
    for (const s of L.slots) {
      const { x, y } = s.spot;
      assert.ok(Number.isInteger(x) && Number.isInteger(y), `${tag}: ${s.kind} spot not on a voxel`);
      assert.ok(x >= L.T && y >= L.T && x < L.W && y < L.D, `${tag}: ${s.kind} spot off the floor`);
      const out = s.wall === 'right' ? y - L.T : x - L.T;
      assert.ok(out >= s.dep + 2 && out <= s.dep + 6, `${tag}: ${s.kind} spot ${out} out from its wall`);
      for (const o of L.slots) assert.ok(!inRect(slotRect(o), x, y), `${tag}: ${s.kind} spot inside ${o.kind}`);
    }
    for (let i = 0; i < L.slots.length; i++) {
      for (let j = i + 1; j < L.slots.length; j++) {
        const a = L.slots[i].spot;
        const b = L.slots[j].spot;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 6, `${tag}: ${L.slots[i].kind} and ${L.slots[j].kind} spots too close`);
      }
    }
  }
});

test('mines.generate is deterministic per seed', () => {
  const L = planLayout(320, 171);
  const a = world(L, 7);
  const b = world(L, 7);
  const c = world(L, 8);
  assert.ok(Buffer.from(a.mat).equals(Buffer.from(b.mat)));
  assert.ok(Buffer.from(a.shade).equals(Buffer.from(b.shade)));
  assert.ok(!Buffer.from(a.mat).equals(Buffer.from(c.mat)));
});

test('the walls and floor are solid rock and the room above the floor is mostly air', () => {
  for (const [cw, ch] of [SIZES[0], SIZES[2], SIZES[4]]) {
    const L = planLayout(cw, ch);
    const v = world(L);
    const tag = `${cw}x${ch}`;
    let wall = 0;
    let wallSolid = 0;
    let slab = 0;
    let slabFull = 0;
    let room = 0;
    let roomAir = 0;
    for (let z = 0; z < L.H; z++) {
      for (let y = 0; y < L.D; y++) {
        for (let x = 0; x < L.W; x++) {
          const m = v.get(x, y, z);
          if (x < L.T || y < L.T) {
            wall++;
            if (solid(m)) wallSolid++;
          } else if (z < L.floor) {
            slab++;
            if (m !== M.AIR) slabFull++;
          } else if (z > L.floor) {
            room++;
            if (m === M.AIR) roomAir++;
          }
        }
      }
    }
    assert.ok(wallSolid / wall > 0.92, `${tag}: walls ${((100 * wallSolid) / wall).toFixed(1)}% solid`);
    assert.ok(slabFull / slab > 0.97, `${tag}: floor ${((100 * slabFull) / slab).toFixed(1)}% filled`);
    assert.ok(roomAir / room > 0.9, `${tag}: room ${((100 * roomAir) / room).toFixed(1)}% air`);
    // Strata: the walls mix the three rocks, with coal seams and gold.
    const seen = new Set<number>();
    for (let i = 0; i < v.size; i++) seen.add(v.mat[i]);
    for (const m of [M.ROCK, M.ROCK_DARK, M.DIRT, M.COAL, M.GOLD_ORE, M.WOOD, M.GRAVEL, M.SAND, M.MOSS]) assert.ok(seen.has(m), `${tag}: no ${MATERIALS[m]?.name}`);
  }
});

test('every spot is standable: floor underfoot and headroom above', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    for (const seed of [1, 2, 3]) {
      const v = world(L, seed);
      for (const s of L.slots) {
        const { x, y } = s.spot;
        const g = v.ground(x, y);
        const tag = `${cw}x${ch} seed ${seed}: ${s.kind} spot`;
        assert.ok(Math.abs(g - L.floor) <= 2, `${tag}: ground ${g}, floor ${L.floor}`);
        for (let z = g; z < g + 14; z++) assert.equal(v.get(x, y, z), M.AIR, `${tag}: blocked at z ${z}`);
      }
    }
  }
});

test('pools hold their liquid', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    for (const seed of [1, 2, 3]) {
      const v = world(L, seed);
      let water = 0;
      let oil = 0;
      for (let i = 0; i < v.size; i++) {
        const m = v.mat[i];
        if (!liquid(m)) continue;
        if (m === M.WATER) water++;
        if (m === M.OIL) oil++;
        const x = v.xOf(i);
        const y = v.yOf(i);
        const z = v.zOf(i);
        const tag = `${cw}x${ch} seed ${seed}: ${MATERIALS[m]?.name} at ${x},${y},${z}`;
        assert.notEqual(v.get(x, y, z - 1), M.AIR, `${tag} over air`);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(v.get(x + dx, y + dy, z), M.AIR, `${tag} beside air`);
      }
      assert.ok(water > 20, `${cw}x${ch} seed ${seed}: a water pool`);
      assert.ok(oil > 4, `${cw}x${ch} seed ${seed}: an oil puddle`);
    }
  }
});

test('flames burn clear of oil and of anything that would catch', () => {
  for (const [cw, ch] of [SIZES[0], SIZES[2], SIZES[4]]) {
    const L = planLayout(cw, ch);
    for (const seed of [1, 2]) {
      const v = world(L, seed);
      const { c } = stub(v);
      run(c, 90, () => {
        for (const s of L.slots) mines.props[s.kind].tick?.(c, s, true);
        mines.weather?.(c, L);
      });
      const fires: number[][] = [];
      const oil: number[][] = [];
      for (let i = 0; i < v.size; i++) {
        if (v.mat[i] === M.FIRE) fires.push([v.xOf(i), v.yOf(i), v.zOf(i)]);
        if (v.mat[i] === M.OIL) oil.push([v.xOf(i), v.yOf(i), v.zOf(i)]);
      }
      assert.ok(fires.length >= 8, `${cw}x${ch}: only ${fires.length} flames`);
      for (const [x, y, z] of fires) {
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const m = v.get(x + dx, y + dy, z + dz);
          // The campfire's coal bed is meant to smoulder.
          if (m === M.COAL && z === L.floor + 1) continue;
          assert.ok(!MATERIALS[m]?.flammable, `${cw}x${ch} seed ${seed}: flame at ${x},${y},${z} touches ${MATERIALS[m]?.name}`);
        }
        for (const [ox, oy, oz] of oil) assert.ok(Math.hypot(x - ox, y - oy, z - oz) >= 10, `${cw}x${ch} seed ${seed}: oil within 10 of a flame`);
      }
    }
  }
});

function sane(L: Layout, lights: PointLight[], parts: Particle[], tag: string): void {
  for (const l of lights) {
    assert.ok([l.x, l.y, l.z, l.radius, l.intensity].every(Number.isFinite), `${tag}: light not finite`);
    assert.ok(l.x >= -1 && l.y >= -1 && l.z >= 0 && l.x <= L.W + 1 && l.y <= L.D + 1 && l.z <= L.H + 4, `${tag}: light outside the world`);
    assert.ok(l.radius >= 6 && l.radius <= 40, `${tag}: light radius ${l.radius}`);
    assert.ok(l.intensity > 0 && l.intensity <= 2, `${tag}: light intensity ${l.intensity}`);
    assert.ok(l.color.every((ch) => Number.isInteger(ch) && ch >= 0 && ch <= 255), `${tag}: light colour`);
  }
  for (const p of parts) {
    assert.ok(PARTICLE_KINDS.has(p.kind), `${tag}: particle kind ${p.kind}`);
    assert.ok([p.x, p.y, p.z, p.vx, p.vy, p.vz, p.life, p.gravity].every(Number.isFinite), `${tag}: particle not finite`);
    assert.ok(p.x >= 0 && p.y >= 0 && p.z >= 0 && p.x <= L.W && p.y <= L.D && p.z <= L.H, `${tag}: ${p.kind} spawned outside the world`);
    assert.ok(p.life > 0 && p.life <= 10, `${tag}: ${p.kind} life ${p.life}`);
    assert.ok(Math.hypot(p.vx, p.vy, p.vz) < 30, `${tag}: ${p.kind} too fast`);
    assert.ok(p.color.every((ch) => Number.isInteger(ch) && ch >= 0 && ch <= 255), `${tag}: ${p.kind} colour`);
    if (p.mat !== undefined) assert.ok(MATERIALS[p.mat] && kindOf(p.mat) !== 'air', `${tag}: ${p.kind} lands as nothing`);
  }
}

test('every prop ticks, active and idle, with sane lights and particles', () => {
  const L = planLayout(320, 171);
  const lit: Record<string, boolean> = {};
  const emits: Record<string, boolean> = {};
  for (const active of [true, false]) {
    for (const s of L.slots) {
      const v = world(L);
      const { c, lights, parts } = stub(v);
      const prop = mines.props[s.kind];
      assert.ok(prop.tick, `${s.kind} has no tick`);
      run(c, 150, () => prop.tick!(c, s, active));
      sane(L, lights, parts, `${s.kind} ${active ? 'active' : 'idle'}`);
      lit[`${s.kind}:${active}`] = lights.length > 0;
      emits[`${s.kind}:${active}`] = parts.length > 0;
    }
  }
  for (const k of ['write', 'read', 'run', 'web', 'think', 'idle', 'entrance']) assert.ok(lit[`${k}:true`], `${k} gives no light while worked`);
  for (const k of ['web', 'think', 'idle', 'entrance']) assert.ok(lit[`${k}:false`], `${k} goes dark when idle`);
  for (const k of ['write', 'read', 'search', 'web', 'think', 'idle']) assert.ok(emits[`${k}:true`], `${k} throws off nothing while worked`);
  assert.ok(!lit['write:false'] && !emits['write:false'], 'the idle anvil is quiet');
});

test('the dig face digs deeper over time but never through the back of the wall', () => {
  for (const [cw, ch] of [SIZES[0], SIZES[2]]) {
    const L = planLayout(cw, ch);
    const v = world(L);
    const s = L.slots.find((o) => o.kind === 'search') as Slot;
    const before = Buffer.from(v.mat);
    const { c, parts } = stub(v);
    let deepest = Infinity;
    run(c, 30 * 400, () => mines.props.search.tick!(c, s, true));
    let dug = 0;
    for (let i = 0; i < v.size; i++) {
      if (before[i] === v.mat[i] || v.mat[i] !== M.AIR) continue;
      dug++;
      const x = v.xOf(i);
      const y = v.yOf(i);
      const z = v.zOf(i);
      assert.ok(inRect(slotRect(s), x, y) || (s.wall === 'left' ? y >= s.y0 && y < s.y0 + s.len : x >= s.x0 && x < s.x0 + s.len), `dug outside the face at ${x},${y},${z}`);
      assert.ok(z >= s.z0 && z < s.z0 + 12, `dug at height ${z - s.z0}`);
      deepest = Math.min(deepest, s.wall === 'left' ? x : y);
    }
    assert.ok(dug > 100, `${cw}x${ch}: only ${dug} voxels dug`);
    assert.equal(deepest, 2, `${cw}x${ch}: deepest dig at ${deepest}`);
    const debris = parts.filter((p) => p.kind === 'debris');
    assert.ok(debris.length >= dug && debris.every((p) => p.mat === M.GRAVEL && p.gravity > 0));
    assert.ok(parts.some((p) => p.kind === 'glint'), 'no glint off the ore');
  }
});

test('weather drips seep water, trickles sand and keeps the wall torches lit', () => {
  const L = planLayout(320, 171);
  const v = world(L);
  const { c, lights, parts } = stub(v);
  let sand = 0;
  run(c, 30 * 90, () => {
    mines.weather!(c, L);
    if (v.get(L.T, L.T + 2, L.H - 3) === M.SAND) {
      sand++;
      v.put(L.T, L.T + 2, L.H - 3, M.AIR); // let it fall
    }
  });
  sane(L, lights, parts, 'weather');
  const drops = parts.filter((p) => p.kind === 'drop');
  assert.ok(drops.length >= 4 && drops.every((p) => p.mat === M.WATER), `${drops.length} drips`);
  assert.ok(sand > 0, 'no sand trickle');
  assert.ok(lights.length / (30 * 90) >= 2, `${lights.length / (30 * 90)} torch lights per frame`);
});

test('a big world generates quickly', () => {
  world(planLayout(320, 171)); // warm up
  const L = planLayout(1000, 500);
  assert.ok(L.W * L.D * L.H >= 170 * 150 * 60);
  const t0 = performance.now();
  world(L, 11);
  const ms = performance.now() - t0;
  assert.ok(ms < 300, `${ms.toFixed(0)} ms`);
});

test('the detour hub and the ways to it are kept clear', async () => {
  const { hub, keepClear } = await import('../src/cave/layout.ts');
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const keep = keepClear(L);
    const h = hub(L);
    assert.equal(keep[Math.floor(h.x) + L.W * Math.floor(h.y)], 1, `${cw}x${ch}: hub not kept clear`);
    for (const s of L.slots) {
      const mx = Math.floor((s.spot.x + h.x) / 2);
      const my = Math.floor((s.spot.y + h.y) / 2);
      assert.equal(keep[mx + L.W * my], 1, `${cw}x${ch}: way from ${s.kind} to the hub not kept clear`);
    }
  }
});
