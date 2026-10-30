import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { snowy } from '../src/worlds/snowy.ts';
import { DECOR_ART } from '../src/worlds/snowy/decor.ts';
import { planFor } from '../src/worlds/snowy/room.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { budget } from './helpers.ts';

// Snowy Depths' art: every piece draws in both wall frames and as an island
// at the fitted scale and zoomed in, inside its footprint and height;
// animated pieces move while worked and hold still while idle (so an idle
// one is never sent again), still ones never look at the clock; the shell
// stays within its time budget and keeps its wall pieces off the stations;
// the snow falls.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(snowy.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`snowy ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`snowy ${name}: moves while worked, holds still while idle`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
        const c = render(art, 8, wall, false, 0.3, false).c;
        const d = render(art, 8, wall, false, 1.7, false).c;
        assert.ok(same(c, d), `${name} (${wall}) changes while idle`);
      }
    });
  } else {
    test(`snowy ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('snowy room: the walls keep their falls, windows and lanterns off the stations', () => {
  for (const [w, h] of [[600, 400], [375, 220], [300, 165], [200, 120], [160, 110]]) {
    const L = planLayout(w, h, 'snowy');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'falls'), `${L.W}: no frozen falls`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
    }
    // pieces on one wall do not overlap
    for (const wall of ['left', 'right'] as const) {
      const on = plan.features.filter((f) => f.wall === wall).sort((p, q) => p.a - q.a);
      for (let i = 1; i < on.length; i++) assert.ok(on[i - 1].a + on[i - 1].w / 2 <= on[i].a - on[i].w / 2, `${L.W}: ${on[i - 1].kind} overlaps ${on[i].kind}`);
    }
    // somewhere to warm up, and a look at the falls
    const pois = snowy.pois!(L);
    assert.ok(pois.filter((p) => p.kind === 'warm').length >= 2, 'warm spots by the fire');
    assert.ok(pois.some((p) => p.kind === 'view'), 'something to look at');
  }
});

test('snowy room: snow sifts down at the skylights and blows in at the gate', () => {
  const flakes = (art: PropArt, active: boolean) => {
    const out: Particle[] = [];
    const v = { pen: new Canvas(1, 1), s: 4, at: frame(project(0, 0, 4), 'right', 0, 0), len: art.len, dep: art.dep, wall: 'right' as const, island: false, t: 0, active, seed: 7 };
    for (let i = 0; i < 300; i++) art.emit!({ ...v, t: i / 30 }, 1 / 30, (p) => out.push(p));
    return out.filter((p) => p.kind === 'drop');
  };
  const sky = flakes(DECOR_ART.skylight, false);
  assert.ok(sky.length >= 5, `the skylight let in ${sky.length} flakes in 10 s`);
  for (const p of sky) assert.ok(p.vz < 0 && p.z > 10 && p.life * -p.vz <= p.z + 1, 'flakes fall from on high and are gone by the floor');
  const idle = flakes(snowy.stations.entrance, false).length;
  const busy = flakes(snowy.stations.entrance, true).length;
  assert.ok(busy > idle * 3 && idle > 0, `the gate lets in ${idle} flakes idle, ${busy} with someone in it`);
});

test('snowy room: the shell draws inside the canvas, the frost twinkles, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'snowy'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(snowy, L, 1);
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
  snowy.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    snowy.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: cheap, sparse (high on the walls), and the frost twinkles.
  const a = new Canvas(1500, 920);
  const z = new Canvas(1500, 920);
  snowy.room.overlay!({ ...view(0.5), pen: a });
  snowy.room.overlay!({ ...view(1.9), pen: z });
  assert.ok(!same(a, z), 'the overlay does not move');
  const lit = (q: Canvas) => q.data.reduce((n, x, i) => n + ((i & 3) === 3 && x > 0 ? 1 : 0), 0);
  assert.ok(lit(a) < 1500 * 920 * 0.01, `the overlay paints ${lit(a)} pixels`);
  budget('the overlay a frame', (i) => snowy.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Snowy Depths\'s workstation: its own, still whatever the clock', () => {
  const art = snowy.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
