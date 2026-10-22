import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { Theme } from '../src/themes/types.ts';
import { planLayout } from '../src/cave/layout.ts';
import { M, MATERIALS, buildTables } from '../src/cave/materials.ts';
import { heal, step } from '../src/cave/sim.ts';
import type { Ctx, Layout, Particle, PointLight, SlotKind } from '../src/cave/types.ts';
import { Voxels } from '../src/cave/voxels.ts';
import { Rng } from '../src/world/rng.ts';

// Contract every biome must meet. ANIMUS_THEME_FILE=src/cave/biomes/x.ts
// also checks a biome module that is not registered yet (its default
// export, or the first exported object with `generate`).
async function loadTheme(file: string): Promise<Theme> {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const found = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'generate' in (v as object));
  if (!found) throw new Error(`${file} exports no biome`);
  return found as Theme;
}
const extraFile = process.env.ANIMUS_THEME_FILE;
const EXTRA: Theme[] = extraFile ? [await loadTheme(extraFile)] : [];

const SIZES: Array<[number, number]> = [[80, 40], [320, 171], [1000, 500]];
const KINDS: SlotKind[] = ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write'];
const PARTICLE_KINDS = new Set(['spark', 'ember', 'debris', 'drop', 'rune', 'bolt', 'glint', 'zzz']);
const isRGB = (c: unknown) => Array.isArray(c) && c.length === 3 && c.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
const kindOf = (m: number) => MATERIALS[m]?.kind ?? 'solid';
const solid = (m: number) => kindOf(m) === 'solid';
const liquid = (m: number) => kindOf(m) === 'liquid';

function world(b: Theme, L: Layout, seed = 1): Voxels {
  const v = new Voxels(L.W, L.D, L.H);
  b.generate(v, L, new Rng(seed));
  return v;
}

function stub(v: Voxels, seed = 3) {
  const lights: PointLight[] = [];
  const parts: Particle[] = [];
  const c: Ctx = { v, rng: new Rng(seed), t: 0, dt: 1 / 30, spawn: (p) => parts.push(p), light: (l) => lights.push(l) };
  return { c, lights, parts };
}

function sane(L: Layout, lights: PointLight[], parts: Particle[], tag: string): void {
  for (const l of lights) {
    assert.ok([l.x, l.y, l.z, l.radius, l.intensity].every(Number.isFinite), `${tag}: light not finite`);
    assert.ok(l.x >= -1 && l.y >= -1 && l.z >= 0 && l.x <= L.W + 1 && l.y <= L.D + 1 && l.z <= L.H + 4, `${tag}: light outside the world`);
    assert.ok(l.radius >= 6 && l.radius <= 40, `${tag}: light radius ${l.radius}`);
    assert.ok(l.intensity > 0 && l.intensity <= 2, `${tag}: light intensity ${l.intensity}`);
    assert.ok(isRGB(l.color), `${tag}: light colour`);
  }
  for (const p of parts) {
    assert.ok(PARTICLE_KINDS.has(p.kind), `${tag}: particle kind ${p.kind}`);
    assert.ok([p.x, p.y, p.z, p.vx, p.vy, p.vz, p.life, p.gravity].every(Number.isFinite), `${tag}: particle not finite`);
    assert.ok(p.x >= 0 && p.y >= 0 && p.z >= 0 && p.x <= L.W && p.y <= L.D && p.z <= L.H, `${tag}: ${p.kind} spawned outside the world`);
    assert.ok(p.life > 0 && p.life <= 10, `${tag}: ${p.kind} life ${p.life}`);
    assert.ok(isRGB(p.color), `${tag}: ${p.kind} colour`);
    if (p.mat !== undefined) assert.ok(MATERIALS[p.mat] && kindOf(p.mat) !== 'air', `${tag}: ${p.kind} lands as nothing`);
  }
}

test('registry exposes unique ids', () => {
  const ids = themeIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('mines'));
  assert.equal(getTheme('mines')?.id, 'mines');
  assert.equal(getTheme('nope'), undefined);
});

for (const b of [...THEMES, ...EXTRA.filter((e) => !THEMES.some((t) => t.id === e.id))]) {
  test(`biome ${b.id}: identity, palette and grade`, () => {
    assert.ok(/^[a-z]+$/.test(b.id), `id ${b.id}`);
    assert.ok(b.name && b.tagline);
    assert.ok(isRGB(b.backdrop));
    for (const [k, v] of Object.entries(b.palette)) assert.ok(isRGB(v), `palette.${k}`);
    assert.ok(isRGB(b.grade.ambient), 'grade.ambient');
    assert.ok(b.grade.illum >= 0 && b.grade.illum <= 2 && b.grade.bloom >= 0 && b.grade.bloom <= 2 && b.grade.vignette >= 0 && b.grade.vignette <= 1, 'grade ranges');
    for (const [id, c] of Object.entries(b.colors ?? {})) {
      assert.ok(MATERIALS[Number(id)], `colour override for unknown material ${id}`);
      assert.match(String(c), /^#[0-9a-f]{6}$/i, `colour override ${id}`);
    }
    assert.doesNotThrow(() => buildTables(b.colors));
    for (const k of KINDS) assert.ok(b.props[k]?.name, `prop ${k}`);
  });

  test(`biome ${b.id}: generation is deterministic per seed`, () => {
    const L = planLayout(320, 171);
    const x = world(b, L, 7);
    const y = world(b, L, 7);
    const z = world(b, L, 8);
    assert.ok(Buffer.from(x.mat).equals(Buffer.from(y.mat)));
    assert.ok(Buffer.from(x.shade).equals(Buffer.from(y.shade)));
    assert.ok(!Buffer.from(x.mat).equals(Buffer.from(z.mat)));
  });

  test(`biome ${b.id}: solid walls and floor, open room, standable spots, contained pools`, () => {
    for (const [cw, ch] of SIZES) {
      const L = planLayout(cw, ch);
      const v = world(b, L);
      const tag = `${b.id} ${cw}x${ch}`;
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
      assert.ok(wallSolid / wall > 0.9, `${tag}: walls ${((100 * wallSolid) / wall).toFixed(1)}% solid`);
      assert.ok(slabFull / slab > 0.95, `${tag}: floor ${((100 * slabFull) / slab).toFixed(1)}% filled`);
      assert.ok(roomAir / room > 0.85, `${tag}: room ${((100 * roomAir) / room).toFixed(1)}% air`);
      for (const s of L.slots) {
        const { x, y } = s.spot;
        const g = v.ground(x, y);
        assert.ok(Math.abs(g - L.floor) <= 2, `${tag}: ${s.kind} spot ground ${g}, floor ${L.floor}`);
        for (let z = g; z < g + 14; z++) assert.equal(v.get(x, y, z), M.AIR, `${tag}: ${s.kind} spot blocked at z ${z}`);
      }
      for (let i = 0; i < v.size; i++) {
        const m = v.mat[i];
        if (!liquid(m)) continue;
        const x = v.xOf(i);
        const y = v.yOf(i);
        const z = v.zOf(i);
        const where = `${tag}: ${MATERIALS[m]?.name} at ${x},${y},${z}`;
        assert.notEqual(v.get(x, y, z - 1), M.AIR, `${where} over air`);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) assert.notEqual(v.get(x + dx, y + dy, z), M.AIR, `${where} beside air`);
      }
    }
  });

  test(`biome ${b.id}: props and weather tick with sane lights and particles, flames clear of fuel`, () => {
    for (const [cw, ch] of SIZES) {
      const L = planLayout(cw, ch);
      const v = world(b, L);
      for (const active of [false, true]) {
        const { c, lights, parts } = stub(v);
        for (let f = 0; f < 90; f++) {
          c.t += c.dt;
          for (const s of L.slots) b.props[s.kind].tick?.(c, s, active);
          b.weather?.(c, L);
        }
        sane(L, lights, parts, `${b.id} ${cw}x${ch} ${active ? 'active' : 'idle'}`);
      }
      for (let i = 0; i < v.size; i++) {
        if (v.mat[i] !== M.FIRE) continue;
        const [x, y, z] = [v.xOf(i), v.yOf(i), v.zOf(i)];
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
          const m = v.get(x + dx, y + dy, z + dz);
          // Fire beds (campfire coal, a brazier) are meant to smoulder.
          if (z <= L.floor + 1 && dz === -1) continue;
          assert.ok(!MATERIALS[m]?.flammable || m === M.COAL, `${b.id} ${cw}x${ch}: flame at ${x},${y},${z} touches ${MATERIALS[m]?.name}`);
        }
      }
    }
  });

  test(`biome ${b.id}: the world stays a cave under a minute of simulation`, () => {
    const L = planLayout(320, 171);
    const v = world(b, L);
    v.commitBase();
    const T = buildTables(b.colors);
    const rng = new Rng(5);
    const { c } = stub(v);
    const solidBefore = v.mat.reduce((n, m) => n + (solid(m) ? 1 : 0), 0);
    for (let tick = 0; tick < 36 * 60; tick++) {
      c.t += 1 / 36;
      c.dt = 1 / 36;
      if (tick % 2 === 0) {
        for (const s of L.slots) b.props[s.kind].tick?.(c, s, true);
        b.weather?.(c, L);
      }
      step(v, T, rng, tick, () => {});
      heal(v, T, rng, 1500);
    }
    const solidAfter = v.mat.reduce((n, m) => n + (solid(m) ? 1 : 0), 0);
    let fire = 0;
    for (let i = 0; i < v.size; i++) if (v.mat[i] === M.FIRE) fire++;
    assert.ok(solidAfter > solidBefore * 0.97, `${b.id}: ${solidBefore - solidAfter} solid voxels lost`);
    assert.ok(fire < 400, `${b.id}: ${fire} voxels on fire`);
  });

  test(`biome ${b.id}: a big world generates quickly`, () => {
    const L = planLayout(1000, 500);
    const t0 = performance.now();
    world(b, L);
    const ms = performance.now() - t0;
    assert.ok(ms < 600, `${ms.toFixed(0)} ms`);
  });
}
