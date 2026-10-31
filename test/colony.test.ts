import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { Bounds } from '../src/art/scene/bounds.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { colony } from '../src/worlds/colony.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { DECOR_ART } from '../src/worlds/colony/decor.ts';
import { planFor, zonesFor } from '../src/worlds/colony/room.ts';
import { budget } from './helpers.ts';

// The Frontier Colony's art: every piece draws in both wall frames and as
// an island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise (the
// campfire burns whoever sits by it); the walls keep their windows off the
// stations; the floor is zoned under what the stage furnishes (tile under
// the lab and the sick bay, stone under the smithy and the tailoring bench,
// a stockpile round the stores and each stack) and the room is well
// furnished; warm round the campfire, a seat on a log, a look at the hills;
// the shell, its firelight and fireflies and every prop stay within their
// time budgets; the room's two stacks are one of logs and one of steel; the
// overlay, drawn a piece at a time as the scene draws it, skips what is off
// the piece and nothing on it.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(colony.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
// Stations that move with nobody at them; every other animated station
// holds still until worked (so there is nothing to resend).
const RESTLESS = new Set<string>(['idle']);
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
function render(art: PropArt, s: number, wall: 'left' | 'right', island: boolean, t: number, active: boolean, seed = 1234): { c: Canvas; box: Box } {
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
  art.draw({ pen: c, s, at, len: art.len, dep: art.dep, wall, island, t, active, seed });
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
  test(`Frontier Colony ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`Frontier Colony ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Frontier Colony ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Frontier Colony stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(colony.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Frontier Colony room: the walls keep their windows off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'colony');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows onto the hills`);
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

test('Frontier Colony floor: zoned under what the stage furnishes, on the floor, and the room well furnished', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'colony');
    const room = planRoom(colony, L, hashString('colony'));
    const zones = zonesFor(L.W, L.D, L.H, L.T);
    for (const z of zones) assert.ok(z.x0 >= L.T && z.y0 >= L.T && z.x1 <= L.W && z.y1 <= L.D && z.x1 > z.x0 && z.y1 > z.y0, `${L.W}: a ${z.kind} zone off the floor: ${JSON.stringify(z)}`);
    const under = (kind: string, what: string, r: { x0: number; y0: number; x1: number; y1: number }) => {
      assert.ok(zones.some((z) => z.kind === kind && z.x0 <= r.x0 && z.y0 <= r.y0 && z.x1 >= r.x1 && z.y1 >= r.y1), `${L.W}: no ${kind} under the ${what} at ${JSON.stringify(r)}`);
    };
    const station = (k: SlotKind) => room.props.find((p) => p.slot?.kind === k)!;
    under('tile', 'research bench', footprint(station('read')));
    under('stone', 'smithy', footprint(station('run')));
    under('stone', 'tailoring bench', footprint(station('write')));
    under('stock', 'stores', footprint(station('search')));
    for (const p of room.props.filter((q) => q.art === DECOR_ART.hospital)) under('tile', 'sick bay', footprint(p));
    for (const p of room.props.filter((q) => q.art === DECOR_ART.stack)) under('stock', 'stack', footprint(p));
    // full of the colony's things, not a big bare floor
    const decor = room.props.filter((p) => !p.slot).length;
    assert.ok(decor >= 12, `${L.W}: only ${decor} pieces of decor`);
  }
});

test('Frontier Colony points of interest: warm round the campfire, a seat on a log, a look at the hills', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'colony');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(colony, L, hashString('colony'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, round the campfire`);
    assert.ok(count('seat') >= 2, `${L.W}: ${count('seat')} seat spots, on the log seats`);
    assert.ok(count('view') >= 3, `${L.W}: ${count('view')} view spots, two of the stations and the hills`);
  }
});

test('Frontier Colony decor: every piece is in DECOR_ART, and each finds floor in a 150 x 44 terminal', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of colony.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(colony, planLayout(375, 220, 'colony'), hashString('colony'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
});

test('Frontier Colony decor: of the two stacks in the room one is logs and one steel bars, each inside its footprint', () => {
  const room = planRoom(colony, planLayout(375, 220, 'colony'), hashString('colony'));
  const stacks = room.props.filter((p) => p.art === DECOR_ART.stack);
  assert.equal(stacks.length, 2, `${stacks.length} stacks placed`);
  const kinds = stacks.map((p) => {
    for (const s of [4, 16]) {
      for (const { wall, island } of VIEWS) {
        const { c, box } = render(DECOR_ART.stack, s, wall, island, 0, false, p.seed);
        const q = painted(c);
        const m = s * 0.6 + 2;
        assert.ok(q && q.x0 >= box.x0 - m && q.x1 <= box.x1 + m && q.y0 >= box.y0 - m && q.y1 <= box.y1 + m, `stack ${p.seed} s=${s} ${wall}${island ? ' island' : ''}: painted ${JSON.stringify(q)} outside ${JSON.stringify(box)}`);
      }
    }
    // steel is a cool grey, logs a warm brown
    const { c } = render(DECOR_ART.stack, 8, 'right', false, 0, false, p.seed);
    let cool = 0;
    let warm = 0;
    for (let i = 0; i < c.data.length; i += 4) {
      if (c.data[i + 3] < 200) continue;
      if (c.data[i + 2] > c.data[i] + 6) cool++;
      else if (c.data[i] > c.data[i + 2] + 30) warm++;
    }
    return cool > warm ? 'steel' : 'logs';
  });
  assert.deepEqual([...kinds].sort(), ['logs', 'steel']);
});

test('Frontier Colony overlay: measured it marks every window; drawn onto one window it paints just what the whole frame paints there', () => {
  const L = planLayout(375, 220, 'colony');
  const plan = planFor(L.W, L.D, L.H, L.T);
  const s = 4.09;
  const P0 = project(0, 0, s);
  const view = (pen: Canvas | Bounds, at: (x: number, y: number, z: number) => [number, number], t: number) => ({ pen, s, at, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
  // The scene finds the overlay's pieces through a pen that only measures
  // (its size means nothing): nothing may be left out of it.
  const B = new Bounds(256, 256);
  for (const t of [0, 0.7, 1.4, 2.1, 2.8]) colony.room.overlay!(view(B, P0, t));
  const glass = (f: (typeof plan.features)[number]): Box => {
    const pts = [f.a - f.w / 2, f.a + f.w / 2].flatMap((a) => [12, 30].map((z) => (f.wall === 'right' ? P0(a, L.T - 0.85, z) : P0(L.T - 0.85, a, z))));
    return { x0: Math.min(...pts.map((p) => p[0])), y0: Math.min(...pts.map((p) => p[1])), x1: Math.max(...pts.map((p) => p[0])), y1: Math.max(...pts.map((p) => p[1])) };
  };
  const windows = plan.features.filter((f) => f.kind === 'window');
  for (const f of windows) {
    const g = glass(f);
    assert.ok(B.marks.some((m) => m.x0 < g.x1 && m.x1 > g.x0 && m.y0 < g.y1 && m.y1 > g.y0), `nothing measured in the ${f.wall} window at ${f.a}`);
  }
  // Drawn onto a canvas just round one window (as the scene draws a
  // piece), it paints the same pixels as the whole frame there.
  const ox = 820;
  const oy = 520;
  const whole = new Canvas(1700, 1000);
  for (const f of [windows[0], windows[windows.length - 1]]) {
    const g = glass(f);
    const x0 = Math.floor(g.x0) - 4;
    const y0 = Math.floor(g.y0) - 4;
    const piece = new Canvas(Math.ceil(g.x1) + 4 - x0, Math.ceil(g.y1) + 4 - y0);
    for (const t of [0.4, 1.9]) {
      whole.clear();
      piece.clear();
      colony.room.overlay!(view(whole, project(ox, oy, s), t));
      colony.room.overlay!(view(piece, project(-x0, -y0, s), t));
      let worst = 0;
      let lit = 0;
      for (let y = 0; y < piece.height; y++) {
        for (let x = 0; x < piece.width; x++) {
          const i = (y * piece.width + x) * 4;
          const j = ((y + y0 + oy) * whole.width + x + x0 + ox) * 4;
          for (let ch = 0; ch < 4; ch++) worst = Math.max(worst, Math.abs(piece.data[i + ch] - whole.data[j + ch]));
          if (piece.data[i + 3]) lit++;
        }
      }
      assert.ok(worst <= 2, `the ${f.wall} window at ${f.a}, t=${t}: a piece differs from the whole frame by ${worst}`);
      if (t === 0.4) assert.ok(lit > 0 || windows.length === 0, `the ${f.wall} window at ${f.a}: no fireflies drawn onto its piece`);
    }
  }
});

test('Frontier Colony overlay: the light of the campfire visibly breathes round the fire', () => {
  const L = planLayout(375, 220, 'colony');
  const fire = L.slots.find((q) => q.kind === 'idle')!;
  const s = 4.09;
  const P = project(L.D * s + 30, L.H * s + 20, s);
  const [x, y] = frame(P, fire.wall, fire.x0, fire.y0)(fire.len / 2, fire.dep * 0.47, 0);
  const o = new Canvas(1500, 920);
  const alphas: number[] = [];
  for (let t = 0; t < 3; t += 1 / 6) {
    o.clear();
    colony.room.overlay!({ pen: o, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
    alphas.push(o.data[(Math.round(y) * o.width + Math.round(x)) * 4 + 3]);
  }
  const lo = Math.min(...alphas);
  const hi = Math.max(...alphas);
  assert.ok(lo >= 16, `the firelight fades to ${lo}/255 at the fire`);
  assert.ok(hi - lo >= 30, `the firelight only swings ${lo}..${hi}/255 at the fire`);
  assert.ok(hi <= 90, `the firelight reaches ${hi}/255 at the fire: it would wash out whoever sits there`);
});

test('Frontier Colony room: the shell draws inside the canvas, the campfire flickers and fireflies blink, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'colony'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(colony, L, hashString('colony'));
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
  colony.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    colony.room.draw(view(0));
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
        colony.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: the campfire's light flickers on the walls and fireflies blink outside, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    colony.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => colony.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Frontier Colony\'s workstation: its own, still whatever the clock', () => {
  const art = colony.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('Frontier Colony: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(colony);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});
