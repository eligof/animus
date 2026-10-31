import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt } from '../src/worlds/types.ts';
import { vault } from '../src/worlds/vault.ts';
import { DECOR_ART } from '../src/worlds/vault/decor.ts';
import { planFor, reach, runnerArea } from '../src/worlds/vault/room.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { budget } from './helpers.ts';

// The Vault's art: every piece draws in both wall frames and as an island
// at the fitted scale and zoomed in, inside its footprint and height;
// animated pieces move and still ones never look at the clock; the shell
// stays within its time budget, keeps its wall pieces off the stations and
// stands the great door beside the way in.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(vault.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`vault ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`vault ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`vault ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('vault stations: animated ones hold still while nobody works them (nothing to resend)', () => {
  for (const [name, art] of Object.entries(vault.stations)) {
    if (!art.animated) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('vault room: the walls keep their banks, niches and lamps off the stations; the door stands by the way in', () => {
  for (const [w, h] of [[375, 220], [300, 165], [200, 120], [160, 110], [500, 300]]) {
    const L = planLayout(w, h, 'vault');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'bank'), `${L.W}: no deposit banks`);
    const doors = plan.features.filter((f) => f.kind === 'door');
    assert.ok(doors.length <= 1, `${L.W}: more than one door`);
    if (L.W >= 100) assert.equal(doors.length, 1, `${L.W}: no door by the way in`);
    for (const f of plan.features) {
      const end = f.wall === 'right' ? L.W : L.D;
      const r = reach(f, L.H);
      assert.ok(r.a0 >= L.T && r.a1 <= end, `${L.W}: ${f.kind} at ${f.a} off its wall`);
      for (const s of slotsOn(L, f.wall)) {
        const q = slotRect(s);
        const [a0, a1] = f.wall === 'right' ? [q.x0, q.x1] : [q.y0, q.y1];
        assert.ok(r.a1 <= a0 || r.a0 >= a1, `${L.W}: ${f.kind} at ${f.a} behind ${s.kind}`);
      }
      // and clear of each other
      for (const g of plan.features) {
        if (g === f || g.wall !== f.wall) continue;
        const q = reach(g, L.H);
        const overlap = r.a0 < q.a1 && q.a0 < r.a1 && r.z0 < q.z1 && q.z0 < r.z1;
        assert.ok(!overlap, `${L.W}: ${f.kind} at ${f.a} overlaps ${g.kind} at ${g.a}`);
      }
    }
    for (const door of doors) {
      const ent = L.slots.find((s) => s.kind === 'entrance')!;
      const e0 = ent.wall === 'right' ? ent.x0 : ent.y0;
      const r = reach(door, L.H);
      assert.equal(door.wall, ent.wall);
      assert.ok(Math.min(Math.abs(r.a0 - (e0 + ent.len)), Math.abs(r.a1 - e0)) < 1, `${L.W}: the door is not beside the way in`);
    }
    // the runner in from the way in stops short of every prop the stage
    // places (it furnishes the room seeded by the world's id)
    const ent = L.slots.find((q) => q.kind === 'entrance')!;
    const room = planRoom(vault, L, hashString(vault.id));
    assert.ok(plan.runner >= 4, `${L.W}: the runner is only ${plan.runner} long`);
    const r = runnerArea(ent, plan.runner);
    for (const p of room.props) {
      if (p.slot === ent) continue;
      const q = footprint(p);
      assert.ok(!(q.x0 < r.x1 && r.x0 < q.x1 && q.y0 < r.y1 && r.y0 < q.y1), `${L.W}: the runner runs under ${p.slot?.kind ?? 'decor'}`);
    }
    // views of the door and the gold are on open floor
    const views = vault.pois!(L).filter((p) => p.kind === 'view');
    assert.ok(views.length >= 3, 'views of the door and the gold');
  }
});

test('vault room: the shell draws inside the canvas, the cameras blink, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'vault'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(vault, L, 1);
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
  assert.ok(room.props.some((p) => p.art === DECOR_ART.pit), 'the acid pit found no floor');
  // The static layer: the shell and every still prop (warmed once, as a
  // long-running app is).
  vault.room.draw(view(0));
  props(0, false, false);
  const still = budget('static layer', () => {
    c.clear();
    vault.room.draw(view(0));
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
        vault.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: the cameras' lights blink, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    vault.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => vault.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('The Vault\'s workstation: its own, still whatever the clock', () => {
  const art = vault.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('The Vault: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(vault);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});

test('The Vault: three locals at work, each where its job puts it', () => {
  assert.deepEqual(vault.npcs!.map((n) => [n.name, n.station, n.place.mode]), [['teller', 'write', 'seated'], ['safecracker', 'search', 'standing'], ['guard', 'entrance', 'standing']]);
  assert.ok(vault.npcs!.some((n) => n.show), 'no show');
});
