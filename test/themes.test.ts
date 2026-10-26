import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWorld } from '../scripts/scene-shot.ts';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project as iso } from '../src/art/iso.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { Theme } from '../src/themes/types.ts';
import { PROP_SIZE, planLayout } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { DESK, DESK_SPOT } from '../src/world/desks.ts';
import { project } from '../src/world/frame.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { recordingPen } from './helpers.ts';

// Contract every world must meet. ANIMUS_THEME_FILE=src/worlds/x.ts also
// checks a world module that is not registered yet (its default export, or
// the first exported object with `stations`: see loadWorld).
const extraFile = process.env.ANIMUS_THEME_FILE;
const EXTRA: Theme[] = extraFile ? [await loadWorld(extraFile)] : [];

const KINDS: SlotKind[] = ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write'];
const COSTUMES = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual', 'drifter', 'nord', 'exosuit', 'jumpsuit', 'colonist', 'miner', 'forager', 'parka', 'guard', 'demon', 'startup'];
const CRITTERS = ['cat', 'rat', 'drone', 'slime', 'fox', 'imp', 'beetle', 'hopper', 'husky', 'corgi'];
const SHAPES = ['tower', 'house', 'pyramid', 'statue', 'machine'];
const PARTICLE_KINDS = new Set(['spark', 'ember', 'confetti', 'smoke', 'steam', 'drop', 'glint', 'bolt', 'zzz']);
const isRGB = (c: unknown) => Array.isArray(c) && c.length === 3 && c.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);
const finite = (pts: Array<[number, number]>) => pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y));

test('registry exposes unique ids', () => {
  const ids = themeIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(ids, ['mines', 'lab', 'club', 'den', 'station', 'cafe', 'fungal', 'snowy', 'vault', 'hell', 'dunes', 'meadhall', 'starfall', 'shelter', 'colony', 'office']);
  assert.equal(getTheme('mines')?.id, 'mines');
  assert.equal(getTheme('nope'), undefined);
});

test('the mines, the caverns, the snows, the vault and hell dress for where they are', () => {
  assert.deepEqual(
    ['mines', 'fungal', 'snowy', 'vault', 'hell'].map((id) => getTheme(id)?.costume),
    ['miner', 'forager', 'parka', 'guard', 'demon'],
  );
});

for (const w of [...THEMES, ...EXTRA.filter((e) => !THEMES.some((t) => t.id === e.id))]) {
  test(`world ${w.id}: identity, palette, costume, critter, finale and builds`, () => {
    assert.ok(/^[a-z]+$/.test(w.id), `id ${w.id}`);
    assert.ok(w.name && w.tagline);
    assert.ok(isRGB(w.backdrop));
    for (const [k, v] of Object.entries(w.palette)) assert.ok(isRGB(v), `palette.${k}`);
    assert.ok(COSTUMES.includes(w.costume), `costume ${w.costume}`);
    assert.ok(CRITTERS.includes(w.critter.kind) && isRGB(w.critter.body), 'critter');
    assert.ok(w.finale.colors.length > 0 && w.finale.colors.every(isRGB), 'finale colours');
    assert.ok(w.build.colors.length > 0 && w.build.colors.every(isRGB), 'build colours');
    assert.ok(SHAPES.includes(w.build.shape), `build shape ${w.build.shape}`);
    if (w.ambient) assert.ok(isRGB(w.ambient.tint) && w.ambient.strength >= 0 && w.ambient.strength <= 1, 'ambient');
  });

  test(`world ${w.id}: a prop for every station, fitting its slot, and sane decor`, () => {
    for (const k of KINDS) {
      const art = w.stations[k];
      assert.ok(art, `no ${k} prop`);
      assert.deepEqual([art.len, art.dep], [PROP_SIZE[k].len, PROP_SIZE[k].dep], `${k} footprint`);
      assert.ok(art.height > 0 && art.height <= 40, `${k} ${art.height} tall`);
    }
    for (const d of w.decor ?? []) {
      assert.ok(Number.isInteger(d.count) && d.count >= 0 && d.count <= 12, `decor count ${d.count}`);
      assert.ok(d.art.len > 0 && d.art.dep > 0 && d.art.len <= 24 && d.art.dep <= 24 && d.art.height > 0, 'decor size');
    }
  });

  test(`world ${w.id}: the room and every prop draw with the pen, inside the canvas`, () => {
    const L = planLayout(305, 215, w.id);
    const room = planRoom(w, L, 1);
    const s = 4;
    const cam = { s, ox: L.D * s + 20, oy: L.H * s + 20 };
    const width = (L.W + L.D) * s + 40;
    const height = ((L.W + L.D) / 2 + L.H) * s + 40;
    const inside = (pts: Array<[number, number]>) => pts.every(([x, y]) => x >= -1 && y >= -1 && x <= width + 1 && y <= height + 1);
    const pen = recordingPen(width, height);
    w.room.draw({ pen, s, at: (x, y, z) => project(cam, x, y, z), W: L.W, D: L.D, H: L.H, T: L.T, t: 0, seed: 1 });
    w.room.overlay?.({ pen, s, at: (x, y, z) => project(cam, x, y, z), W: L.W, D: L.D, H: L.H, T: L.T, t: 1, seed: 1 });
    assert.ok(pen.fills > 0, 'the room drew nothing');
    assert.ok(finite(pen.points) && inside(pen.points), 'the room drew off the canvas');
    assert.equal(pen.depth, 0, 'save() without restore()');
    for (const p of room.props) {
      for (const active of [false, true]) {
        const pp = recordingPen(width, height);
        const view = { pen: pp, s, at: (u: number, v: number, z: number) => project(cam, ...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t: 2.5, active, seed: p.seed };
        p.art.draw(view);
        const tag = `${p.slot?.kind ?? 'decor'}${active ? ' (active)' : ''}`;
        assert.ok(pp.fills + pp.strokes > 0, `${tag} drew nothing`);
        assert.ok(finite(pp.points), `${tag}: points not finite`);
        assert.equal(pp.depth, 0, `${tag}: save() without restore()`);
        const parts: Particle[] = [];
        for (let f = 0; f < 30; f++) p.art.emit?.({ ...view, t: f / 10 }, 0.1, (q) => parts.push(q));
        for (const q of parts) {
          assert.ok(PARTICLE_KINDS.has(q.kind), `${tag}: particle kind ${q.kind}`);
          assert.ok([q.x, q.y, q.z, q.vx, q.vy, q.vz, q.life, q.gravity].every(Number.isFinite), `${tag}: particle not finite`);
          assert.ok(q.x >= -2 && q.y >= -2 && q.x <= p.len + 2 && q.y <= p.dep + 2 && q.z >= 0 && q.z <= p.art.height + 20, `${tag}: particle away from the prop (its own frame)`);
          assert.ok(q.life > 0 && q.life <= 10 && isRGB(q.color), `${tag}: ${q.kind} life or colour`);
        }
      }
    }
  });
  test(`world ${w.id}: its workstation fits its place, draws inside it in both frames at both scales, and names a screen on its body`, () => {
    const art = workstationOf(w);
    assert.deepEqual([art.len, art.dep], [DESK.len, DESK.dep], 'footprint');
    assert.ok(art.height > 0 && art.height <= DESK.height, `${art.height} tall`);
    assert.ok(!art.animated && !art.emit, 'a workstation is a still sprite: no animation, no bits');
    // The screen: a parallelogram upright on its body, right of where the
    // agent stands, a fair size; the desk upgrade's spot on its top.
    const [a, b, c, d] = art.screen;
    for (const p of art.screen) assert.ok(p[0] >= 0 && p[0] <= DESK.len && p[1] >= 0 && p[1] <= DESK.dep && p[2] >= 0 && p[2] <= art.height, `screen corner ${p} off its body`);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(c[k] - (b[k] + d[k] - a[k])) < 1e-6, 'the screen is not a parallelogram');
    assert.ok(d[2] - a[2] >= 1.5 && Math.abs(b[2] - a[2]) < 1e-6, 'the screen is not upright');
    assert.ok(b[0] - a[0] >= 1.5 && Math.min(a[0], d[0]) >= DESK_SPOT.u + 0.5, 'the screen is not to the right of the agent');
    const [tu, tv, tz] = art.top;
    assert.ok(tu >= 0.5 && tu <= DESK.len - 0.5 && tv >= 0.5 && tv <= DESK.dep - 0.5 && tz >= 2 && tz <= art.height, `the upgrade's spot ${art.top} is not on its top`);
    for (const s of [4, 16]) {
      for (const wall of ['right', 'left'] as const) {
        for (const seed of [0, 1, 2]) {
          for (const active of [false, true]) {
            const pad = 6 * s;
            const at0 = frame(iso(0, 0, s), wall, 0, 0);
            let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
              const [x, y] = at0(u, v, z);
              box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
            }
            const cv = new Canvas(Math.ceil(box.x1 - box.x0 + 2 * pad), Math.ceil(box.y1 - box.y0 + 2 * pad));
            const at = frame(iso(pad - box.x0, pad - box.y0, s), wall, 0, 0);
            art.draw({ pen: cv, s, at, len: art.len, dep: art.dep, wall, island: true, t: 3, active, seed });
            // Everything at least faintly opaque lies inside its box, a
            // half unit of ink allowed.
            const slack = s / 2;
            for (let y = 0; y < cv.height; y++) {
              for (let x = 0; x < cv.width; x++) {
                if (cv.data[(y * cv.width + x) * 4 + 3] < 16) continue;
                assert.ok(x >= pad - slack && x <= cv.width - pad + slack && y >= pad - slack && y <= cv.height - pad + slack, `s ${s} ${wall} seed ${seed}${active ? ' (on)' : ''}: painted at ${x},${y}, outside its box`);
              }
            }
          }
        }
      }
    }
  });
}
