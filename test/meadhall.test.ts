import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { meadhall } from '../src/worlds/meadhall.ts';
import { DECOR_ART } from '../src/worlds/meadhall/decor.ts';
import { opening, planFor } from '../src/worlds/meadhall/room.ts';
import { budget } from './helpers.ts';

// The Longhall's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and stations hold still
// otherwise; the walls keep their windows, banners, shields and the elk off
// the stations (beside them or over their tops) and each other; warm before
// the hearth and a drink at the long table; the shell, its snow, firelight
// and candle flicker and every prop stay within their time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(meadhall.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`Longhall ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`Longhall ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`Longhall ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('Longhall stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(meadhall.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('Longhall room: the walls keep their pieces off the stations (beside them or over their tops) and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'meadhall');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows onto the snow`);
    assert.ok(plan.features.some((f) => f.kind === 'hanging' || f.kind === 'banner'), `${L.W}: no banners`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      assert.ok(f.a - f.w / 2 >= L.T && f.a + f.w / 2 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      assert.ok(f.z0 >= 0 && f.z1 <= L.H && f.z0 < f.z1, `${L.W}: ${f.kind} at ${f.a} reaches ${f.z0}..${f.z1}, off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const r = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
        const over = f.z0 >= meadhall.stations[s.kind].height + 1;
        assert.ok(over || f.a + f.w / 2 <= a0 - 1 || f.a - f.w / 2 >= a1 + 1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other: beside each other along the wall, or one over the other
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        const beside = f.a + f.w / 2 <= g.a - g.w / 2 || g.a + g.w / 2 <= f.a - f.w / 2;
        const over = f.z1 <= g.z0 || g.z1 <= f.z0;
        assert.ok(beside || over, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
  }
});

test('Longhall room: under the beam the hall hangs at most 6 shields, 4 banners, 1 elk head, 3 candle rings and 3 bundles of herbs, shared between its walls', () => {
  const CAPS: Record<string, number> = { shield: 6, banner: 4, elk: 1, chandelier: 3, herbs: 3 };
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'meadhall');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    for (const [kind, cap] of Object.entries(CAPS)) {
      const n = features.filter((f) => f.kind === kind).length;
      assert.ok(n <= cap, `${L.W}: ${n} ${kind} in the hall, over its ${cap}`);
    }
  }
  // a roomy hall has windows and long banners over the beam on both walls
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'meadhall');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    for (const wall of ['right', 'left'] as const) {
      assert.ok(features.some((f) => f.wall === wall && f.kind === 'hanging'), `${L.W}: no long banner on the ${wall} wall`);
      assert.ok(features.some((f) => f.wall === wall && f.kind === 'window'), `${L.W}: no window on the ${wall} wall`);
    }
  }
});

// Whether (x, y) is inside the convex polygon q (screen px), give or take
// `tol` px.
function within(q: Array<[number, number]>, x: number, y: number, tol: number): boolean {
  let area = 0;
  for (let i = 0; i < q.length; i++) {
    const [x0, y0] = q[i];
    const [x1, y1] = q[(i + 1) % q.length];
    area += x0 * y1 - x1 * y0;
  }
  const sgn = Math.sign(area);
  return q.every(([x0, y0], i) => {
    const [x1, y1] = q[(i + 1) % q.length];
    return (sgn * ((x1 - x0) * (y - y0) - (y1 - y0) * (x - x0))) / Math.hypot(x1 - x0, y1 - y0) >= -tol;
  });
}

test('Longhall room: the snow falls only inside the windows, never on their frames, lattice sills or the walls round them', () => {
  for (const [w, h, s] of [[375, 220, 4.09], [375, 220, 9], [500, 300, 4.09]] as const) {
    const L = planLayout(w, h, 'meadhall');
    const windows = planFor(L.W, L.D, L.H, L.T).features.filter((f) => f.kind === 'window');
    const P = project(L.D * s + 30, L.H * s + 20, s);
    const holes = windows.map((f) => {
      const at = frame(P, f.wall, f.wall === 'right' ? 0 : L.T, f.wall === 'right' ? L.T : 0);
      return opening(f).map(([u, v, z]) => at(u, v, z));
    });
    const c = new Canvas(Math.ceil((L.W + L.D) * s + 60), Math.ceil(((L.W + L.D) / 2 + L.H) * s + 40));
    for (const t of [0, 0.7, 1.9, 3.3, 7.1]) {
      c.clear();
      meadhall.room.overlay!({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
      let flakes = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          // snow: pale blue-white and near opaque (the firelight is a faint orange)
          if (c.data[i + 3] < 24 || c.data[i + 2] < c.data[i]) continue;
          flakes++;
          assert.ok(holes.some((q) => within(q, x + 0.5, y + 0.5, 1)), `${L.W} s=${s} t=${t}: snow at (${x}, ${y}), outside every window`);
        }
      }
      assert.ok(flakes > 0, `${L.W} s=${s} t=${t}: no snow at the windows`);
    }
  }
});

test('Longhall points of interest: warm before the hearth, a drink at the long table', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'meadhall');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(meadhall, L, hashString('meadhall'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    assert.ok(count('warm') >= 2, `${L.W}: ${count('warm')} warm spots, before the hearth`);
    assert.ok(count('drink') >= 2, `${L.W}: ${count('drink')} drink spots, at the long table`);
    assert.ok(count('seat') >= 1, `${L.W}: ${count('seat')} seat spots, on a bench`);
  }
});

test('Longhall decor: every piece is in DECOR_ART, each finds a place in a 150 x 44 terminal, and there are at least 10', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of meadhall.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const room = planRoom(meadhall, planLayout(375, 220, 'meadhall'), hashString('meadhall'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no place`);
  // and the hall is furnished, not bare: a dozen pieces or so by its walls
  const n = room.props.filter((p) => !p.slot).length;
  assert.ok(n >= 10, `only ${n} pieces of decor in a 150 x 44 terminal`);
});

test('Longhall room: the shell draws inside the canvas, the snow falls and the firelight flickers, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'meadhall'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(meadhall, L, hashString('meadhall'));
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
  assert.ok(room.props.some((p) => p.art === DECOR_ART.hearth), 'the hearth found no wall');
  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  meadhall.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    meadhall.room.draw(view(0));
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
        meadhall.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: snow falls past the windows and the firelight flickers, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    meadhall.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => meadhall.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('Longhall\'s workstation: its own, still whatever the clock', () => {
  const art = meadhall.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});
