import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import { den } from '../src/worlds/den.ts';
import { DECOR_ART } from '../src/worlds/den/decor.ts';
import { planFor } from '../src/worlds/den/room.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { budget } from './helpers.ts';

// The Hacker's Den's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and still ones never look at
// the clock; the shell stays within its time budget, keeps its wall pieces
// off the stations, and only the video wall's rain moves over it.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(den.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`den ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`den ${name}: moves while worked, and steps slowly while idle`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
      // idle, it changes no more than a couple of times a second: two
      // moments within one idle step look the same
      const a = render(art, 8, 'right', false, 4.02, false).c;
      const b = render(art, 8, 'right', false, 4.12, false).c;
      assert.ok(same(a, b), `${name} changes between frames while idle`);
    });
  } else {
    test(`den ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('den: the code rain pours on the think station and the video wall', () => {
  assert.ok(den.stations.think.animated, 'the rain wall station is animated');
  const a = render(den.stations.think, 8, 'right', false, 2.0, false).c;
  const b = render(den.stations.think, 8, 'right', false, 3.0, false).c;
  assert.ok(!same(a, b), 'the rain trickles even while nobody thinks there');
});

test('den room: the walls keep their pieces off the stations, with a video wall of rain', () => {
  for (const [w, h] of [[524, 300], [375, 220], [300, 165], [200, 120], [160, 110]]) {
    const L = planLayout(w, h, 'den');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.equal(plan.features.filter((f) => f.kind === 'rainwall').length, 1, `${L.W}: no video wall`);
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
    // pieces on one wall do not overlap (pipes and the high row aside)
    for (const wall of ['left', 'right'] as const) {
      const low = plan.features.filter((f) => f.wall === wall && f.z0 > 0 && f.z1 < 21 && f.kind !== 'pipe').sort((p, q) => p.a - q.a);
      for (let i = 1; i < low.length; i++) assert.ok(low[i - 1].a + low[i - 1].w / 2 <= low[i].a - low[i].w / 2, `${L.W}: ${low[i - 1].kind} overlaps ${low[i].kind}`);
    }
    // the spots to go and look at are on open floor
    const room = planRoom(den, L, 1);
    assert.ok(room.pois.some((p) => p.kind === 'view'), `${L.W}: nothing to look at`);
    assert.ok(room.pois.some((p) => p.kind === 'seat'), `${L.W}: nowhere to sit`);
  }
});

test('den room: the shell draws inside the canvas, the rain moves, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'den'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(den, L, 1);
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
  den.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    den.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // One base tile (the shell is painted once per 256 px tile).
  const tile = new Canvas(256, 256);
  const T = (x: number, y: number, z: number): [number, number] => {
    const q = P(x, y, z);
    return [q[0] - 600, q[1] - 300];
  };
  budget('a base tile', () => {
    tile.clear();
    den.room.draw({ ...view(0), pen: tile, at: T });
  }, 40);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: the video wall's rain heads, cheap and sparse.
  const a = new Canvas(1500, 920);
  const z = new Canvas(1500, 920);
  den.room.overlay!({ ...view(0.5), pen: a });
  den.room.overlay!({ ...view(0.9), pen: z });
  assert.ok(!same(a, z), 'the overlay does not move');
  const area = painted(a, 1)!;
  assert.ok((area.x1 - area.x0) * (area.y1 - area.y0) < 1500 * 920 * 0.05, 'the overlay is not sparse');
  budget('the overlay a frame', (i) => den.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Hacker\'s Den\'s workstation: its own, still whatever the clock', () => {
  const art = den.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('Hacker\'s Den: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(den);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});

test("Hacker's Den: three locals at work, each where its job puts it", () => {
  assert.deepEqual(den.npcs!.map((n) => [n.name, n.station, n.place.mode]), [
    ['sysadmin', 'search', 'standing'],
    ['overclocker', 'run', 'behind'],
    ['courier', 'entrance', 'standing'],
  ]);
  assert.ok(den.npcs!.some((n) => n.show), 'no show');
});
