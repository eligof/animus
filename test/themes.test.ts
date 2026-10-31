import { test } from 'node:test';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { loadWorld } from '../scripts/scene-shot.ts';
import { Canvas } from '../src/art/canvas.ts';
import { TRINKET_BOX } from '../src/art/figure.ts';
import { frame, project as iso } from '../src/art/iso.ts';
import { framesFor } from '../src/art/motion.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { Theme } from '../src/themes/types.ts';
import { PROP_SIZE, planLayout, type Rect } from '../src/world/layout.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { DESK, DESK_SPOT, deskZone } from '../src/world/desks.ts';
import { FIGURE_H, FIGURE_HALF_W, project } from '../src/world/frame.ts';
import type { P3, PropView } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { S, canvasBox, partCheck, viewOf } from './desk-contract.ts';
import { recordingPen } from './helpers.ts';
import { NPC_R } from '../src/world/npc-place.ts';
import { hashString } from '../src/world/rng.ts';
import { differ, npcContract, npcPicture, painted, stationLoops } from './npc-contract.ts';

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
// Rooms (units across) to place the locals in: the smallest, where one
// standing may be left out, then those terminals give (100 x 30 full
// screen is 97 across, 120 x 36 108, 120 x 40 and 120 x 44 109, 100 x 40
// 119, 150 x 46 143, 120 x 44 full screen 144, 150 x 46 full screen 153,
// 160 x 50 and up 160) and some between. From ROOMY across, every local is
// placed and whoever one serves has somewhere to stand.
const ROOMS = [72, 86, 90, 97, 104, 108, 109, 112, 118, 119, 122, 126, 132, 137, 143, 144, 153, 160];
const ROOMY = 90;
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
  test(`world ${w.id}: its workstation fits its place, draws inside it in both frames at both scales, names a screen on its body and a spot for an upgrade clear of its agent`, () => {
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
    // The upgrade stands clear of the agent at work in front of it (on
    // screen, its picture's box barely overlaps the figure's, from its feet
    // to the top of its head), in either frame.
    for (const wall of ['right', 'left'] as const) {
      const on = (u: number, v: number, z: number) => {
        const [x, y, zz] = toWorld({ wall, x0: 0, y0: 0 }, u, v, z);
        return [x - y, (x + y) / 2 - zz];
      };
      const [fx, fy] = on(DESK_SPOT.u, DESK_SPOT.v, 0);
      const [kx, ky] = on(tu, tv, tz);
      const over = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
      const k = TRINKET_BOX;
      const shared = over(fx - FIGURE_HALF_W, fx + FIGURE_HALF_W, kx + k.x0, kx + k.x1) * over(fy - FIGURE_H, fy, ky + k.y0, ky + k.y1);
      const part = shared / ((k.x1 - k.x0) * (k.y1 - k.y0));
      assert.ok(part <= 0.1, `${wall}: the upgrade at ${art.top} stands behind its agent (${(part * 100).toFixed(0)}% of it)`);
    }
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

  test(`world ${w.id}: what stands on its desks and what moves there keeps to its place: on the top, inside its box, clear of the screen, the upgrade and the agent at work`, () => {
    const art = workstationOf(w);
    const items = art.clutter?.items ?? [];
    const spots = art.clutter?.spots ?? [];
    const loops = art.loops ?? [];
    if (art.clutter) {
      assert.ok(items.length >= 8 && items.length <= 12, `${items.length} things to pick from`);
      assert.ok(spots.length >= 4, `${spots.length} spots`);
      assert.equal(new Set(items.map((i) => i.name)).size, items.length, 'two things of one name');
    }
    for (const it of items) assert.ok(it.r > 0 && it.r <= 0.5 && it.h > 0 && it.h <= 1.5, `${it.name}: ${it.r} round, ${it.h} tall`);
    const maxR = Math.max(0, ...items.map((i) => i.r));
    spots.forEach((p, k) => {
      assert.ok(p[0] >= 0.75 && p[0] <= DESK.len - 0.75 && p[1] >= 0.75 && p[1] <= DESK.dep - 0.75 && p[2] >= 2 && p[2] <= art.height - 1, `spot ${p} is not on its top`);
      assert.ok(Math.hypot(p[0] - art.top[0], p[1] - art.top[1]) >= 1.75, `spot ${p} is on the upgrade's`);
      for (const q of spots.slice(k + 1)) assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) >= 2 * maxR + 0.2, `spots ${p} and ${q} are too close`);
    });
    assert.ok(loops.length <= 2, `${loops.length} loops`);
    assert.equal(new Set(loops.map((l) => l.name)).size, loops.length, 'two loops of one name');
    loops.forEach((lp, k) => {
      const [u, v, z] = lp.at;
      assert.ok(lp.secs >= 0.4 && lp.secs <= 3, `${lp.name}: ${lp.secs} s round`);
      assert.ok(lp.r > 0 && lp.r <= 1.5 && lp.h > 0 && u - lp.r >= 0 && u + lp.r <= DESK.len && v - lp.r >= 0 && v + lp.r <= DESK.dep && z >= 0 && z + lp.h <= art.height + 0.5, `${lp.name} at ${lp.at} is not on its desk`);
      assert.ok(Math.hypot(u - art.top[0], v - art.top[1]) >= lp.r + 1, `${lp.name} is on the upgrade's spot`);
      for (const p of spots) assert.ok(Math.hypot(u - p[0], v - p[1]) >= lp.r + maxR, `${lp.name} is on the spot ${p}`);
      for (const o of loops.slice(k + 1)) assert.ok(Math.hypot(u - o.at[0], v - o.at[1]) >= lp.r + o.r, `${lp.name} and ${o.name} overlap`);
    });
    // On the canvas at scale S, in either frame: each thing on each spot,
    // each loop's every frame, lit and not.
    const hashOf = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');
    for (const wall of ['right', 'left'] as const) {
      const parts: Array<{ what: string; box: [P3, number, number]; draw: (v: PropView) => void }> = [];
      for (const it of items) for (const p of spots) parts.push({ what: `${it.name} at ${p}`, box: [p, it.r, it.h], draw: (v) => it.draw(v, p) });
      for (const lp of loops) for (let i = 0, n = framesFor(lp.secs); i < n; i++) parts.push({ what: `${lp.name} frame ${i}`, box: [lp.at, lp.r, lp.h], draw: (v) => lp.draw(v, i / n) });
      for (const part of parts) {
        for (const active of [false, true]) {
          const what = `${wall}${active ? ' (on)' : ''}: ${part.what}`;
          const { n, over, behind, outside } = partCheck(art, wall, part.draw, part.box, active);
          assert.ok(!outside, `${what}: painted at ${outside}, outside its box`);
          assert.ok(n > 0, `${what}: nothing drawn`);
          assert.ok(over <= S, `${what}: ${over} pixels over the screen`);
          assert.ok(behind <= 0.1 * n, `${what}: ${Math.round((100 * behind) / n)}% of it behind its agent`);
        }
      }
      // A loop is sorted as a point at its anchor, so it is drawn over what
      // is nearer it only if their pictures overlap: they must not, for
      // every spot nearer than the loop and the largest thing on it.
      const maxH = Math.max(0, ...items.map((i) => i.h));
      for (const lp of loops) {
        for (const p of spots) {
          if (p[0] + p[1] <= lp.at[0] + lp.at[1]) continue;
          const a = canvasBox(art, wall, [lp.at, lp.r, lp.h]);
          const b = canvasBox(art, wall, [p, maxR, maxH]);
          assert.ok(!(a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1), `${wall}: ${lp.name} would paint over a thing at ${p}`);
        }
      }
      // What is drawn does not depend on the clock.
      const atTime = (draw: (v: PropView) => void, t: number) => {
        const c = new Canvas(160, 160);
        draw(viewOf(art, wall, c, true, t));
        return hashOf(c);
      };
      for (const it of items.slice(0, 12)) if (spots[0]) assert.equal(atTime((v) => it.draw(v, spots[0]), 0), atTime((v) => it.draw(v, spots[0]), 7.3), `${wall}: ${it.name} draws with the clock`);
      for (const lp of loops) for (let i = 0, n = framesFor(lp.secs); i < n; i++) assert.equal(atTime((v) => lp.draw(v, i / n), 0), atTime((v) => lp.draw(v, i / n), 7.3), `${wall}: ${lp.name} frame ${i} draws with the clock`);
      // A loop's frame is the same picture every time; lit, its frames differ.
      for (const lp of loops) {
        const shot = (i: number) => {
          const c = new Canvas(160, 160);
          lp.draw(viewOf(art, wall, c, true), i / framesFor(lp.secs));
          return hashOf(c);
        };
        const frames = Array.from({ length: framesFor(lp.secs) }, (_, i) => shot(i));
        assert.deepEqual(Array.from({ length: framesFor(lp.secs) }, (_, i) => shot(i)), frames, `${wall}: ${lp.name} drew a frame two ways`);
        assert.ok(new Set(frames).size >= 2, `${wall}: ${lp.name} does not move`);
      }
    }
  });

  test(`world ${w.id}: its locals work its stations, each where its job puts it, drawn inside their box in every act and frame, and look apart; the stations they work loop in 2 s`, () => {
    const npcs = w.npcs ?? [];
    assert.ok(npcs.length <= 3, `${npcs.length} locals`);
    assert.equal(new Set(npcs.map((n) => n.name)).size, npcs.length, 'two locals of one name');
    assert.equal(new Set(npcs.map((n) => n.station)).size, npcs.length, 'two locals at one station');
    assert.ok(npcs.filter((n) => n.serve?.drink).length <= 1, 'more than one serves drinks');
    for (const n of npcs) {
      npcContract(w, n);
      stationLoops(w, n);
    }
    const pics = npcs.map((n) => npcPicture(n, 'work', 0, n.place.look === 'back'));
    for (let i = 0; i < pics.length; i++) {
      for (let j = i + 1; j < pics.length; j++) {
        const least = Math.min(painted(pics[i]).n, painted(pics[j]).n);
        assert.ok(differ(pics[i], pics[j]) >= 0.25 * least, `${npcs[i].name} and ${npcs[j].name} look alike`);
      }
    }
  });

  test(`world ${w.id}: its locals are placed where their jobs put them in every room ${ROOMY} across or more, a standing one on floor kept clear, whoever each serves within reach`, () => {
    const npcs = w.npcs ?? [];
    const near = (r: Rect, s: { x: number; y: number }, m: number) => s.x > r.x0 - m && s.x < r.x1 + m && s.y > r.y0 - m && s.y < r.y1 + m;
    for (const side of ROOMS) {
      const L = planLayout(2 * side + 12, 1000, w.id);
      assert.equal(L.W, side);
      const room = planRoom(w, L, hashString(w.id));
      const door = L.slots.find((s) => s.kind === 'entrance')!.spot;
      const roomy = side >= ROOMY;
      npcs.forEach((n, k) => {
        const p = room.npcs.find((q) => q.k === k);
        if (!p) {
          assert.ok(!roomy && n.place.mode === 'standing', `${w.id}: ${n.name} left out of a room ${side} across`);
          return;
        }
        assert.equal(room.props[p.prop].slot?.kind, n.station);
        if (p.mode === 'standing') {
          for (const q of room.props) assert.ok(!near(footprint(q), p, NPC_R), `${w.id}: ${n.name} stands on a prop in a room ${side} across`);
          for (const d of room.desks) assert.ok(!near(deskZone(d), p, NPC_R), `${w.id}: ${n.name} stands under a workstation in a room ${side} across`);
        }
        if (n.serve && roomy) assert.ok(p.front, `${w.id}: ${n.name} serves, with nowhere for anyone to stand to be served in a room ${side} across`);
        if (p.front) assert.ok(room.nav.find(door, p.front), `${w.id}: whoever ${n.name} serves cannot get there from the way in, in a room ${side} across`);
      });
    }
  });
}

test('every world dresses its desks: things to pick from, and something that moves', () => {
  const bare = THEMES.filter((w) => !workstationOf(w).clutter || !workstationOf(w).loops?.length).map((w) => w.id);
  assert.deepEqual(bare, []);
});

test('every world has three locals at work, one of them with a show', () => {
  const short = THEMES.filter((w) => !w.npcs || w.npcs.length !== 3 || !w.npcs.some((n) => n.show)).map((w) => w.id);
  assert.deepEqual(short, []);
});
