import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import { station } from '../src/worlds/station.ts';
import { DECOR_ART } from '../src/worlds/station/decor.ts';
import { planFor, viewport } from '../src/worlds/station/room.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { budget } from './helpers.ts';

// The Orbital Station's art: every piece draws in both wall frames and as
// an island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still while idle;
// still ones never look at the clock; the shell stays within its time
// budget, keeps its wall pieces off the stations, and its planet turns
// in a small piece of overlay.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(station.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`station ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`station ${name}: moves while worked, holds still while idle`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
        // idle, nothing changes, so its picture is never sent again
        const p = render(art, 8, wall, false, 0.3, false).c;
        const q = render(art, 8, wall, false, 7.9, false).c;
        assert.ok(same(p, q), `${name} (${wall}) changes with the clock while idle`);
      }
    });
  } else {
    test(`station ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('station room: the walls keep their viewport, portholes and screens off the stations', () => {
  for (const [w, h] of [[622, 357], [375, 220], [300, 165], [200, 120], [160, 110]]) {
    const L = planLayout(w, h, 'station');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.equal(plan.features.filter((f) => f.kind === 'viewport').length, 1, `${L.W}: no viewport`);
    assert.ok(plan.features.some((f) => f.kind === 'porthole'), `${L.W}: no portholes`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
    }
    // the ribs stand clear of the wall pieces
    for (const wall of ['left', 'right'] as const) {
      for (const r of plan.ribs[wall]) {
        assert.ok(!plan.features.some((f) => f.wall === wall && Math.abs(f.a - r) < f.w / 2 + 1), `${L.W}: a rib at ${r} through a wall piece`);
      }
    }
    // the planet sits inside the viewport's glass, above everyone's heads
    const f = plan.features.find((g) => g.kind === 'viewport')!;
    const g = viewport(f, L.H);
    assert.ok(g.pa - g.pr >= g.a0 && g.pa + g.pr <= g.a1 && g.pz - g.pr >= g.z0 && g.pz + g.pr <= g.z1, `${L.W}: the planet spills out of the glass`);
    assert.ok(g.pz - g.pr >= 14, `${L.W}: the planet hangs at head height`);
    // spots to look out of the viewport and to warm up by the reactor
    const pois = station.pois!(L);
    assert.ok(pois.filter((p) => p.kind === 'view').length >= 3, 'views out of the viewport');
    assert.ok(pois.filter((p) => p.kind === 'warm').length >= 2, 'warm spots by the reactor');
  }
});

test('station room: the shell draws inside the canvas, the planet turns, and it all stays in budget', (t) => {
  const L = planLayout(375, 220, 'station'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(station, L, 1);
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
  station.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    station.room.draw(view(0));
    props(0, false, false);
  }, 400);
  t.diagnostic(`static layer ${still.toFixed(0)} ms`);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // A 256 px tile of the shell, as the scene paints it: cheap, as most of
  // the room misses it.
  const tile = new Canvas(256, 256);
  const tileAt = project(cam.ox - 600, cam.oy - 300, s);
  const each = budget('a tile of the shell', () => station.room.draw({ pen: tile, s, at: tileAt, W: L.W, D: L.D, H: L.H, T: L.T, t: 0, seed: 1 }), 25, { calls: 4 });
  t.diagnostic(`a shell tile ${each.toFixed(1)} ms`);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    const ms = budget(`${p.slot?.kind} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
    t.diagnostic(`${p.slot?.kind} ${ms.toFixed(2)} ms a frame`);
  }
  // The overlay: cheap, small, and the planet turns.
  const a = new Canvas(1500, 920);
  const z = new Canvas(1500, 920);
  station.room.overlay!({ ...view(0.5), pen: a });
  station.room.overlay!({ ...view(30), pen: z });
  assert.ok(!same(a, z), 'the planet does not turn');
  const area = painted(a, 1)!;
  assert.ok((area.x1 - area.x0) * (area.y1 - area.y0) < 160 * 160, `the overlay paints ${area.x1 - area.x0} x ${area.y1 - area.y0} px`);
  const over = budget('the overlay a frame', (i) => station.room.overlay!(view(i / 6)), 3, { calls: 20 });
  t.diagnostic(`overlay ${over.toFixed(2)} ms a frame, ${area.x1 - area.x0} x ${area.y1 - area.y0} px`);
});

test('Orbital Station\'s workstation: its own, still whatever the clock', () => {
  const art = station.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('Orbital Station: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(station);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});
