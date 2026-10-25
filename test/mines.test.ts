import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { mines } from '../src/worlds/mines.ts';
import { DECOR_ART } from '../src/worlds/mines/decor.ts';
import { planFor } from '../src/worlds/mines/room.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { bestOf, budget } from './helpers.ts';

// The Mines' art: every piece draws in both wall frames and as an island
// at the fitted scale and zoomed in, inside its footprint and height;
// animated pieces move while worked and still ones never look at the
// clock; the shell stays within its time budget (whole and in the scene's
// 256 px tiles) and keeps its posts, lamps, drifts and racks off the
// stations; the drifts' rails and the rubble stay clear of them too.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(mines.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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

for (const [name, art] of ARTS) {
  test(`mines ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`mines ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`mines ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('mines stations: their bits fly from inside them, and only the hot ones while idle', () => {
  for (const [name, art] of Object.entries(mines.stations) as Array<[SlotKind, PropArt]>) {
    if (!art.emit) continue;
    for (const active of [false, true]) {
      const bits: Particle[] = [];
      const at = frame(project(0, 0, 8), 'right', 0, 0);
      for (let i = 0; i < 120; i++) art.emit({ pen: new Canvas(1, 1), s: 8, at, len: art.len, dep: art.dep, wall: 'right', island: false, t: i / 18, active, seed: 7 }, 1 / 18, (p) => bits.push(p));
      for (const p of bits) {
        assert.ok(p.x >= -1 && p.x <= art.len + 1 && p.y >= -1 && p.y <= art.dep + 1 && p.z >= 0 && p.z <= art.height + 2, `${name}: a ${p.kind} starts at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`);
        assert.ok(p.life > 0, `${name}: a dead ${p.kind}`);
      }
      if (active) assert.ok(bits.length > 0, `${name} gives off nothing while worked`);
    }
  }
});

test('mines room: the walls keep their drifts, posts, lamps and racks off the stations', () => {
  for (const [w, h] of [[375, 220], [300, 165], [200, 120], [160, 110], [488, 322]]) {
    const L = planLayout(w, h, 'mines');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'post'), `${L.W}: no posts`);
    assert.ok(plan.features.some((f) => f.kind === 'lamp'), `${L.W}: no lamps`);
    if (L.W >= 120) assert.ok(plan.features.some((f) => f.kind === 'adit'), `${L.W}: no drift`);
    assert.ok(plan.features.filter((f) => f.kind === 'adit').length <= 2, `${L.W}: too many drifts`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
    }
    // the rails out of the drifts and the fallen rock stay off the stations
    const rects = L.slots.map(slotRect);
    for (const r of plan.rails) {
      const box = r.wall === 'right' ? { x0: r.a - 2.5, y0: L.T, x1: r.a + 2.5, y1: L.T + r.len + 2 } : { x0: L.T, y0: r.a - 2.5, x1: L.T + r.len + 2, y1: r.a + 2.5 };
      for (const q of rects) assert.ok(box.x1 <= q.x0 || box.x0 >= q.x1 || box.y1 <= q.y0 || box.y0 >= q.y1, `${L.W}: rails run into a station`);
    }
    for (const p of plan.scatter) for (const q of rects) assert.ok(!(p.x > q.x0 - 2 && p.x < q.x1 + 2 && p.y > q.y0 - 2 && p.y < q.y1 + 2), `${L.W}: rock under a station`);
    // somewhere to look down each drift, on open floor
    const room = planRoom(mines, L, 1);
    const views = room.pois.filter((p) => p.kind === 'view');
    assert.ok(views.length >= 2, `${L.W}: nowhere to look`);
    for (const p of room.pois) for (const pr of room.props) {
      const r = footprint(pr);
      assert.ok(!(p.x >= r.x0 && p.x < r.x1 && p.y >= r.y0 && p.y < r.y1), `${L.W}: a ${p.kind} spot inside a prop`);
    }
  }
});

test('mines room: the shell draws inside the canvas and it all stays in budget', () => {
  const L = planLayout(375, 220, 'mines'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(mines, L, 1);
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
  mines.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    mines.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0 && b.x1 < c.width && b.y1 < c.height, 'drew nothing');
  // The scene paints the shell in 256 px tiles: each one draws only what
  // falls on it, so the whole room in tiles costs no more than a few times
  // the room in one go.
  const whole = bestOf(() => mines.room.draw(view(0)));
  budget(`the shell in tiles (${whole.toFixed(0)} ms whole)`, () => {
    for (let ty = 0; ty * 256 < 920; ty++) {
      for (let tx = 0; tx * 256 < 1500; tx++) {
        const tile = new Canvas(256, 256);
        const Q = project(cam.ox - tx * 256, cam.oy - ty * 256, s);
        mines.room.draw({ pen: tile, s, at: Q, W: L.W, D: L.D, H: L.H, T: L.T, t: 0, seed: 1 });
      }
    }
  }, Math.max(400, whole * 4));
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // No room-wide overlay: what moves, moves in the props.
  assert.equal(mines.room.overlay, undefined);
  // Decor is all still, and the floor gets a fair share of it.
  assert.ok(room.props.filter((p) => !p.slot).every((p) => !p.art.animated), 'animated decor');
  assert.ok(room.props.filter((p) => !p.slot).length >= 8, 'a bare floor');
});
