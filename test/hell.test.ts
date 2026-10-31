import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { ANIM_FPS } from '../src/art/motion.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { hell } from '../src/worlds/hell.ts';
import { DECOR_ART } from '../src/worlds/hell/decor.ts';
import { planFor } from '../src/worlds/hell/room.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { budget } from './helpers.ts';

// Hell's art: every piece draws in both wall frames and as an island at
// the fitted scale and zoomed in, inside its footprint and height;
// animated pieces move and still ones never look at the clock; the shell
// stays within its time budget and keeps its wall pieces off the stations.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(hell.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];

type Box = { x0: number; y0: number; x1: number; y1: number };

// Draws `art` alone on a transparent canvas; returns the canvas and the
// screen box of its footprint raised to its height.
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean): { c: Canvas; box: Box } {
  const pad = 6 * s;
  const w = Math.ceil((art.len + art.dep) * s + 2 * pad);
  const h = Math.ceil(((art.len + art.dep) / 2 + art.height) * s + 2 * pad);
  const at0 = frame(project(0, 0, s), wall, 0, 0);
  let box: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const ox = pad - box.x0;
  const oy = pad - box.y0;
  const at = frame(project(ox, oy, s), wall, 0, 0);
  const c = new Canvas(w, h);
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed: 1234 });
  return { c, box: { x0: box.x0 + ox, y0: box.y0 + oy, x1: box.x1 + ox, y1: box.y1 + oy } };
}

// The box round every pixel painted at least `min` (of 255) opaque.
function painted(c: Canvas, min = 16): Box | null {
  let b: Box | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < min) continue;
      if (!b) b = { x0: x, y0: y, x1: x, y1: y };
      else {
        b.x0 = Math.min(b.x0, x);
        b.y0 = Math.min(b.y0, y);
        b.x1 = Math.max(b.x1, x);
        b.y1 = Math.max(b.y1, y);
      }
    }
  }
  return b;
}

const same = (a: Canvas, b: Canvas) => a.data.length === b.data.length && a.data.every((n, i) => n === b.data[i]);

// Pixels not the same in two pictures of one size.
function unlike(a: Canvas, b: Canvas): number {
  let n = 0;
  for (let o = 0; o < a.data.length; o += 4) {
    if (a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2] || a.data[o + 3] !== b.data[o + 3]) n++;
  }
  return n;
}

for (const [name, art] of ARTS) {
  test(`hell ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        for (const active of [false, true]) {
          const { c, box } = render(art, s, wall, island, 1.3, active);
          const p = painted(c);
          const tag = `${name} s=${s} ${wall}${island ? ' island' : ''}${active ? ' active' : ''}`;
          assert.ok(p, `${tag}: drew nothing`);
          // ink overhangs by half a line; a unit's slack round the box
          const m = s * 0.6 + 2;
          assert.ok(p.x0 >= box.x0 - m && p.x1 <= box.x1 + m && p.y0 >= box.y0 - m && p.y1 <= box.y1 + m, `${tag}: painted ${JSON.stringify(p)} outside ${JSON.stringify(box)}`);
        }
      }
    }
  });

  if (art.animated) {
    test(`hell ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`hell ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

// Stations hold still while nobody works them (so they cost nothing to
// show); the lava keeps moving, a little every picture (ANIM_FPS a
// second), never in jumps.
test('hell: idle stations hold still; the lava moves a little every picture', () => {
  for (const [kind, art] of Object.entries(hell.stations)) {
    if (!art.animated) continue;
    const a = render(art, 8, 'right', false, 0.4, false).c;
    const b = render(art, 8, 'right', false, 5.9, false).c;
    assert.ok(same(a, b), `${kind} moves while idle`);
  }
  const lava = (t: number) => render(DECOR_ART.lavaPool, 8, 'right', false, t, false).c;
  for (const t of [0.1, 0.4, 0.77]) {
    const [a, next, later] = [lava(t), lava(t + 1 / ANIM_FPS), lava(t + 1 / 3)];
    assert.ok(!same(a, next), `the lava holds still from ${t} s to the next picture`);
    assert.ok(unlike(a, next) < unlike(a, later), `the lava jumps at ${t} s: ${unlike(a, next)} pixels to the next picture, ${unlike(a, later)} a third of a second on`);
  }
});

test('hell: props give off embers, sparks and soul-light in their own frame', () => {
  const got: Particle[] = [];
  for (const [name, art] of ARTS) {
    if (!art.emit) continue;
    let n = 0;
    for (let i = 0; i < 60; i++) {
      art.emit({ pen: new Canvas(1, 1), s: 4, at: (u, v, z) => [u, v - z], len: art.len, dep: art.dep, wall: 'right', island: false, t: i / 18, active: true, seed: 7 }, 1 / 18, (p) => {
        got.push(p);
        n++;
        assert.ok(p.x >= -2 && p.x <= art.len + 2 && p.y >= -2 && p.y <= art.dep + 2 && p.z >= 0 && p.z <= art.height + 3, `${name} spawned a bit at ${p.x}, ${p.y}, ${p.z}`);
      });
    }
    assert.ok(n > 0, `${name} gave off nothing in 60 frames of work`);
  }
  assert.ok(got.some((p) => p.kind === 'ember') && got.some((p) => p.kind === 'spark'), 'embers and sparks');
});

test('hell room: the walls keep the Maw, windows and banners off the stations', () => {
  for (const [w, h] of [[488, 330], [375, 220], [300, 165], [200, 120], [160, 110]]) {
    const L = planLayout(w, h, 'hell');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.equal(plan.features.filter((f) => f.kind === 'maw').length, 1, `${L.W}: no Maw`);
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
    }
    for (const a of plan.features) {
      for (const b of plan.features) {
        if (a === b || a.wall !== b.wall) continue;
        assert.ok(a.a + a.w / 2 <= b.a - b.w / 2 + 0.01 || b.a + b.w / 2 <= a.a - a.w / 2 + 0.01, `${L.W}: ${a.kind} overlaps ${b.kind}`);
      }
    }
    // the Maw's warm spots stand on open floor in the room
    const warm = hell.pois!(L).filter((p) => p.kind === 'warm');
    assert.ok(warm.length >= 2, 'warm spots by the Maw');
    for (const p of warm) assert.ok(p.x > L.T && p.y > L.T && p.x < L.W && p.y < L.D, 'a warm spot off the floor');
  }
});

test('hell room: the shell draws inside the canvas, the torches flicker, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'hell'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(hell, L, 1);
  const s = 4.09;
  const cam = { ox: L.D * s + 30, oy: L.H * s + 20 };
  const c = new Canvas(1500, 920);
  const P = project(cam.ox, cam.oy, s);
  const view = (t: number) => ({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  const props = (t: number, active: boolean, animated: boolean) => {
    for (const p of room.props) {
      if (!!p.art.animated !== animated) continue;
      p.art.draw({ pen: c, s, at: (u, v, z) => P(...toWorld(p, u, v, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    }
  };
  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  hell.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    hell.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: cheap, sparse, and the torches move.
  const a = new Canvas(1500, 920);
  const z = new Canvas(1500, 920);
  hell.room.overlay!({ ...view(0.5), pen: a });
  hell.room.overlay!({ ...view(0.9), pen: z });
  assert.ok(!same(a, z), 'the overlay does not move');
  const marked = painted(a, 1);
  let n = 0;
  for (let i = 3; i < a.data.length; i += 4) if (a.data[i]) n++;
  assert.ok(marked && n < a.width * a.height * 0.01, `the overlay paints ${n} px`);
  budget('the overlay a frame', (i) => hell.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Hell\'s workstation: its own, still whatever the clock', () => {
  const art = hell.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('Hell: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(hell);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});

test('Hell: three locals at work, each where its job puts it', () => {
  assert.deepEqual(hell.npcs!.map((n) => [n.name, n.station, n.place.mode]), [['clerk', 'write', 'seated'], ['forgeDemon', 'run', 'standing'], ['witch', 'web', 'standing']]);
  assert.ok(hell.npcs!.some((n) => n.show), 'no show');
});
