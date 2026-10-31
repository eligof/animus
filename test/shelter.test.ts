import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import type { Slot, SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { shelter } from '../src/worlds/shelter.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { DECOR_ART } from '../src/worlds/shelter/decor.ts';
import { CAP, PIPES, capsFor, planFor } from '../src/worlds/shelter/room.ts';
import { budget } from './helpers.ts';

// The Atomic Shelter's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise; the
// walls keep their capsule lights, pipes, windows, chalkboard, pictures,
// clock, fuse box, sign and vents off the stations, share them out under
// the room's caps, and keep the pipes flat to the wall under their valve
// and gauge; the diner's pink and aqua stretch of wall stands behind the
// kitchen; a dance by the jukebox, a seat in the booth, warm by the valve
// radio; a 150-column room is well furnished; the shell, its flickering
// light, dust and steam and every prop stay within their time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(shelter.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>([]);
const VIEWS: Array<{ wall: 'left' | 'right'; island: boolean }> = [
  { wall: 'right', island: false },
  { wall: 'left', island: false },
  { wall: 'right', island: true },
  { wall: 'left', island: true },
];
// Terminals of 10 x 20 cells: 150 x 44, 120 x 33, 80 x 24, 64 x 22 and a
// big 200 x 60; the world's own spots are asked of the roomier ones.
const SIZES: Array<[number, number]> = [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]];
const ROOMY: Array<[number, number]> = [[375, 220], [300, 165], [500, 300]];

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
  test(`Atomic Shelter ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`Atomic Shelter ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Atomic Shelter ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Atomic Shelter stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(shelter.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Atomic Shelter room: the walls keep their lights, pipes, windows and the rest off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'shelter');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'tube'), `${L.W}: no capsule lights`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other along the wall
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Atomic Shelter room: the caps are counted over the room, one clock, and both walls get their share', () => {
  // a 150 x 44 terminal's room has the brief's caps; a bigger one more
  assert.deepEqual(capsFor(planLayout(375, 220, 'shelter')), CAP);
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'shelter');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    const cap = capsFor(L);
    for (const kind of Object.keys(CAP) as Array<keyof typeof CAP>) {
      const n = features.filter((f) => f.kind === kind).length;
      assert.ok(n <= cap[kind] && cap[kind] >= CAP[kind], `${L.W}: ${n} ${kind}s, the room's cap ${cap[kind]}`);
    }
    assert.ok(features.filter((f) => f.kind === 'clock').length <= 1, `${L.W}: more than one clock`);
    for (const wall of ['left', 'right'] as const) {
      const mine = features.filter((f) => f.wall === wall);
      assert.ok(mine.some((f) => f.kind === 'tube'), `${L.W}: no tube on the ${wall} wall`);
      assert.ok(mine.length * 3 >= features.length, `${L.W}: the ${wall} wall has ${mine.length} of the ${features.length} pieces`);
      // no two of a kind side by side without a station between them
      const along = (s: Slot) => (wall === 'right' ? [slotRect(s).x0, slotRect(s).x1] : [slotRect(s).y0, slotRect(s).y1]);
      mine.sort((p, q) => p.a - q.a).forEach((f, i) => {
        const g = mine[i + 1];
        if (g && g.kind === f.kind) assert.ok(slotsOn(L, wall).some((s) => along(s)[0] >= f.a && along(s)[1] <= g.a), `${L.W}: two ${f.kind}s side by side at ${f.a} and ${g.a}`);
      });
    }
  }
});

test('Atomic Shelter room: the pipe runs stand flat to the wall, their valve and gauge above whatever can stand in front of them', () => {
  const { copper, main, drain, lip, flat, clear, valve, gauge } = PIPES;
  for (const p of [copper, main, drain]) assert.ok(p.n + p.r + lip <= flat, `a pipe stands ${p.n + p.r + lip} out from the wall, over ${flat}`);
  assert.ok(flat <= 1.5, `the pipes stand ${flat} out from the wall`);
  assert.ok(valve.z - valve.r >= clear && gauge.z - gauge.r >= clear, 'the valve or the gauge hangs below the clear line');
  // what can be backed against a wall, wherever it lands, stands under it
  for (const d of shelter.decor ?? []) if (d.place === 'wall') assert.ok(d.art.height <= clear - 1.5, `a piece of wall decor ${d.art.height} tall reaches the valves`);
  // and nothing placed in front of a pipe run, out as far as its valve and
  // gauge reach, is taller (a few seeds: the scene furnishes with its own)
  const reach = Math.max(valve.n + valve.r, gauge.n + gauge.r);
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'shelter');
    const runs = planFor(L.W, L.D, L.H, L.T).features.filter((f) => f.kind === 'pipes');
    for (const seed of [hashString('shelter'), 1, 2, 3, 4, 5]) {
      for (const p of planRoom(shelter, L, seed).props) {
        const r = footprint(p);
        for (const f of runs) {
          const [a0, a1, out] = f.wall === 'right' ? [r.x0, r.x1, r.y0 - L.T] : [r.y0, r.y1, r.x0 - L.T];
          if (a1 <= f.a - f.w / 2 || a0 >= f.a + f.w / 2 || out >= reach) continue;
          assert.ok(p.art.height <= clear - 1.5, `${L.W}: ${p.slot?.kind ?? 'decor'} ${p.art.height} tall in front of the pipes at ${f.a} on the ${f.wall} wall`);
        }
      }
    }
  }
});

test('Atomic Shelter points of interest: a dance by the jukebox, a seat in the booth, warm by the radio', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'shelter');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(shelter, L, hashString('shelter'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('dance') >= 4, `${L.W}: ${count('dance')} dance spots, by the jukebox and on the floor`);
    assert.ok(count('seat') >= 2, `${L.W}: ${count('seat')} seat spots, in the booth`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, by the valve radio`);
  }
});

test('Atomic Shelter decor: every piece is in DECOR_ART, each finds floor in a 150 x 44 terminal, and the room is well furnished', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of shelter.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(shelter, planLayout(375, 220, 'shelter'), hashString('shelter'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
  const decor = room.props.filter((p) => !p.slot).length;
  assert.ok(decor >= 10, `${decor} pieces of decor in a 150 x 44 terminal's room`);
});

test("Atomic Shelter room: the diner's stretch of wall stands behind the kitchen, on its wall and clear of the stations", () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'shelter');
    const kitchen = planRoom(shelter, L, hashString('shelter')).props.find((p) => p.art === DECOR_ART.kitchen);
    assert.ok(kitchen && !kitchen.island, `${L.W}: the kitchen does not stand against a wall`);
    const { diner } = planFor(L.W, L.D, L.H, L.T);
    assert.ok(diner, `${L.W}: no diner's stretch of wall`);
    const { wall, a0: d0, a1: d1 } = diner;
    assert.equal(wall, kitchen.wall, `${L.W}: the diner's stretch is on the other wall`);
    const at = kitchen.wall === 'right' ? kitchen.x0 : kitchen.y0;
    assert.ok(d0 <= at && d1 >= at + kitchen.len, `${L.W}: the diner's stretch ${d0}..${d1} does not cover the kitchen at ${at}`);
    const behind = slotsOn(L, wall).filter((s) => {
      const r = slotRect(s);
      const [a0, a1] = wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
      return d1 > a0 && d0 < a1;
    });
    assert.deepEqual(behind.map((s) => s.kind), [], `${L.W}: the diner's stretch runs behind a station`);
  }
});

test('Atomic Shelter room: the shell draws inside the canvas, the tubes flicker and dust drifts down, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'shelter'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(shelter, L, hashString('shelter'));
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
  shelter.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    shelter.room.draw(view(0));
    props(0, false, false);
  }, 400);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell a tile at a time, as the scene paints it: no worse than whole.
  const tile = new Canvas(256, 256);
  budget('the shell in tiles', () => {
    for (let ty = 0; ty < 920; ty += 256) {
      for (let tx = 0; tx < 1500; tx += 256) {
        tile.clear();
        shelter.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: a capsule light flickers, dust drifts down and the valves
  // let off steam, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    shelter.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => shelter.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Atomic Shelter\'s workstation: its own, still whatever the clock', () => {
  const art = shelter.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('Atomic Shelter: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(shelter);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});

test('Atomic Shelter: three locals at work, each where its job puts it', () => {
  assert.deepEqual(shelter.npcs!.map((n) => [n.name, n.station, n.place.mode]), [
    ['overseer', 'search', 'standing'],
    ['mechanic', 'run', 'standing'],
    ['waitress', 'idle', 'seated'],
  ]);
  assert.ok(shelter.npcs!.some((n) => n.show), 'no show');
});
