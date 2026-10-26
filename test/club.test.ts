import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import { hashString } from '../src/world/rng.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { club } from '../src/worlds/club.ts';
import { DECOR_ART } from '../src/worlds/club/decor.ts';
import { TILE, planFor } from '../src/worlds/club/plan.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { budget } from './helpers.ts';

// The Underground Club's art: every piece draws in both wall frames and as
// an island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and still ones never look at
// the clock; the shell finds the same furniture as the stage, keeps its
// wall pieces off the stations and its dance floor clear of everything;
// and it all stays within its time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(club.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`club ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`club ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.02, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`club ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('club stations: worked ones give off notes and sparkle; the fog machine breathes', () => {
  const bits = (art: PropArt, active: boolean, from: number, to: number) => {
    const out: Particle[] = [];
    for (let t = from; t < to; t += 1 / 18) {
      art.emit?.({ pen: new Canvas(1, 1), s: 4, at: (u, v, z) => [u, v - z], len: art.len, dep: art.dep, wall: 'right', island: false, t, active, seed: 7 }, 1 / 18, (p) => out.push(p));
    }
    return out;
  };
  for (const kind of ['write', 'run', 'web'] as const) {
    const art = club.stations[kind];
    assert.equal(bits(art, false, 0, 4).length, 0, `${kind} sparkles while idle`);
    const on = bits(art, true, 0, 4);
    assert.ok(on.length >= 3, `${kind} gives off ${on.length} bits in 4 s of work`);
    for (const p of on) assert.ok(p.x > -3 && p.x < art.len + 3 && p.y > -3 && p.y < art.dep + 3 && p.z > 0 && p.z < art.height + 4, `${kind} spawns at ${p.x}, ${p.y}, ${p.z}`);
  }
  const fog = bits(DECOR_ART.fogger, false, 0, 12);
  assert.ok(fog.length >= 3 && fog.every((p) => p.kind === 'smoke'), 'the fog machine puffs smoke');
});

test('club room: the shell knows the stage furniture, keeps its walls off the stations and lays a clear dance floor', () => {
  for (const [w, h] of [[375, 220], [300, 165], [200, 120], [160, 110], [600, 400]]) {
    const L = planLayout(w, h, 'club');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    // the furniture where the stage puts it
    const room = planRoom(club, L, hashString(club.id));
    assert.deepEqual(plan.decor.map(footprint), room.props.filter((p) => !p.slot).map(footprint), `${L.W}: the shell's furniture is not the stage's`);
    assert.ok(plan.features.some((f) => f.kind === 'bay' && f.sign >= 0), `${L.W}: no neon signs`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
    }
    // the dance floor: on the floor, clear of every prop, and danced on
    const d = plan.dance;
    assert.ok(d, `${L.W}: no dance floor`);
    const size = d.n * TILE;
    assert.ok(d.n >= 3 && d.x0 >= L.T && d.y0 >= L.T && d.x0 + size <= L.W && d.y0 + size <= L.D, `${L.W}: the dance floor is off the floor`);
    for (const p of room.props) {
      const r = footprint(p);
      assert.ok(r.x1 <= d.x0 || r.x0 >= d.x0 + size || r.y1 <= d.y0 || r.y0 >= d.y0 + size, `${L.W}: ${p.slot?.kind ?? 'decor'} stands on the dance floor`);
    }
    const dance = room.pois.filter((p) => p.kind === 'dance');
    assert.ok(dance.length >= 3, `${L.W}: only ${dance.length} spots to dance`);
    for (const p of dance) assert.ok(p.x >= d.x0 && p.x <= d.x0 + size && p.y >= d.y0 && p.y <= d.y0 + size, `${L.W}: dancing off the floor at ${p.x}, ${p.y}`);
  }
  // a big room gets its mural and a fire exit
  const big = planLayout(375, 220, 'club');
  const fs = planFor(big.W, big.D, big.H, big.T).features;
  assert.equal(fs.filter((f) => f.kind === 'mural').length, 1, 'no mural');
  assert.equal(fs.filter((f) => f.kind === 'exit').length, 1, 'no fire exit');
});

test('club room: the shell draws inside the canvas, the ball turns, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'club'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(club, L, hashString(club.id));
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
  club.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    club.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // A tile of the shell (the scene paints it in 256 px tiles) costs less
  // than the whole.
  const tile = new Canvas(256, 256);
  const tileAt = project(cam.ox - 600, cam.oy - 300, s);
  budget(`a tile (the whole shell took ${still.toFixed(1)} ms)`, () => club.room.draw({ ...view(0), pen: tile, at: tileAt }), still / 2);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: cheap, and the ball and its sparkles move.
  const a = new Canvas(1500, 920);
  const z = new Canvas(1500, 920);
  club.room.overlay!({ ...view(0.5), pen: a });
  club.room.overlay!({ ...view(0.9), pen: z });
  assert.ok(!same(a, z), 'the overlay does not move');
  budget('the overlay a frame', (i) => club.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Underground Club\'s workstation: its own, still whatever the clock', () => {
  const art = club.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
