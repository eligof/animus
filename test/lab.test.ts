import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { Particle, SlotKind } from '../src/world/types.ts';
import { lab } from '../src/worlds/lab.ts';
import { DECOR_ART } from '../src/worlds/lab/decor.ts';
import { planFor } from '../src/worlds/lab/room.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { budget } from './helpers.ts';

// The Mad Science Lab's art: every piece draws in both wall frames and as
// an island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still while nobody
// works them (so nothing is sent); still ones never look at the clock; the
// shell stays within its time budget, keeps its wall pieces off the
// stations, and its overlay (lightning, the Jacob's ladder) is sparse.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(lab.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`lab ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`lab ${name}: moves while worked, holds still while idle`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
        const i = render(art, 8, wall, false, 0.3, false).c;
        const j = render(art, 8, wall, false, 5.9, false).c;
        assert.ok(same(i, j), `${name} (${wall}) changes with the clock while nobody works it`);
      }
    });
  } else {
    test(`lab ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }

  if (art.emit) {
    test(`lab ${name}: its particles start inside its box`, () => {
      const got: Particle[] = [];
      for (let i = 0; i < 60; i++) {
        const t = i / 12;
        art.emit!({ pen: new Canvas(1, 1), s: 4, at: (u, v, z) => [u, v - z], len: art.len, dep: art.dep, wall: 'right', island: false, t, active: true, seed: 77 }, 1 / 12, (p) => got.push(p));
      }
      assert.ok(got.length > 0, `${name} emits nothing while worked`);
      for (const p of got) {
        assert.ok(p.x >= -1 && p.x <= art.len + 1 && p.y >= -1 && p.y <= art.dep + 1 && p.z >= 0 && p.z <= art.height + 1, `${name}: particle at ${p.x}, ${p.y}, ${p.z}`);
        assert.ok(p.life > 0, `${name}: a dead particle`);
      }
    });
  }
}

test('lab room: the walls keep their windows, generator and charts off the stations', () => {
  for (const [w, h] of [[622, 357], [375, 220], [300, 165], [200, 120], [160, 110]]) {
    const L = planLayout(w, h, 'lab');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.equal(plan.features.filter((f) => f.kind === 'gen').length, 1, `${L.W}: no generator`);
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        assert.ok(f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and off each other
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        assert.ok(f.a + f.w / 2 <= g.a - g.w / 2 + 0.01 || g.a + g.w / 2 <= f.a - f.w / 2 + 0.01, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
    // somewhere warm by the generator and to watch its sparks
    const pois = lab.pois!(L);
    assert.ok(pois.filter((p) => p.kind === 'view').length >= 2, 'views');
    assert.ok(pois.filter((p) => p.kind === 'warm').length >= 2, 'warm spots by the generator');
  }
});

test('lab room: the shell draws inside the canvas, the overlay is sparse and moves, and it all stays in budget', (t) => {
  const L = planLayout(375, 220, 'lab'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(lab, L, 1);
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
  lab.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    lab.room.draw(view(0));
    props(0, false, false);
  }, 400);
  t.diagnostic(`static layer ${still.toFixed(0)} ms`);
  const b = painted(c, 1);
  assert.ok(b && b.x0 >= 0 && b.y0 >= 0, 'drew nothing');
  // The shell alone, as one 256 px base tile paints it (the whole room
  // drawn into a small canvas): cheap, as it runs once per tile.
  const tile = new Canvas(256, 256);
  const T = project(cam.ox - 600, cam.oy - 300, s);
  const tileView = { pen: tile, s, at: T, W: L.W, D: L.D, H: L.H, T: L.T, t: 0, seed: 1 };
  lab.room.draw(tileView);
  const perTile = budget('a base tile of the shell', () => lab.room.draw(tileView), 40);
  t.diagnostic(`shell per base tile ${perTile.toFixed(1)} ms`);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    const each = budget(`${p.slot?.kind} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
    t.diagnostic(`${p.slot?.kind} ${each.toFixed(2)} ms a frame`);
  }
  // The overlay: it moves (the ladder's arc climbs), it is cheap, and it
  // paints a small part of the canvas (it is sent as pictures).
  const frames = [0.2, 0.5, 0.9, 1.4].map((at) => {
    const o = new Canvas(1500, 920);
    lab.room.overlay!({ ...view(at), pen: o });
    return o;
  });
  assert.ok(frames.some((o, i) => i > 0 && !same(o, frames[0])), 'the overlay does not move');
  let most = 0;
  for (const o of frames) {
    let n = 0;
    for (let i = 3; i < o.data.length; i += 4) if (o.data[i] > 8) n++;
    assert.ok(n <= 1500 * 920 * 0.01, `the overlay paints ${n} px`);
    most = Math.max(most, n);
  }
  t.diagnostic(`overlay paints at most ${most} px`);
  const over = budget('the overlay a frame', (i) => lab.room.overlay!(view(i / 12)), 3, { calls: 20 });
  t.diagnostic(`overlay ${over.toFixed(2)} ms a frame`);
});

test('Mad Science Lab\'s workstation: its own, still whatever the clock', () => {
  const art = lab.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
