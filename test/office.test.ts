import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { planLayout, slotRect, slotsOn } from '../src/world/layout.ts';
import { hashString } from '../src/world/rng.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { PropArt, RoomArt } from '../src/worlds/types.ts';
import { office } from '../src/worlds/office.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { DECOR_ART } from '../src/worlds/office/decor.ts';
import { CAP, GAP, LAMP_N, pendantZ, planFor } from '../src/worlds/office/room.ts';
import { budget } from './helpers.ts';

// The Startup's art: every piece draws in both wall frames and as an
// island at the fitted scale and zoomed in, inside its footprint and
// height; animated pieces move while worked and hold still otherwise; the
// brick walls keep their big windows, prints, neon squiggle, bike and
// pendant lamps off the stations, the tall furniture and each other, under
// their caps, each lamp seen in the middle of a full bay and never under
// the clouds; each window keeps its own city whatever room was drawn
// before; coffee at the espresso counter, seats at its stools, a look at
// the skyline; a 150-column room is lively, its decor by the walls and
// stations (the extra desks backed onto a wall, the beanbags big enough to
// sit in), none in the front of the room; the shell, its clouds and city
// lights and every prop stay within their time budgets.

const ARTS: Array<[string, PropArt]> = [...(Object.entries(office.stations) as Array<[SlotKind, PropArt]>), ...Object.entries(DECOR_ART)];
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
  test(`The Startup ${name}: draws in both wall frames and as an island, inside its footprint and height`, () => {
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
    test(`The Startup ${name}: moves while worked`, () => {
      for (const wall of ['right', 'left'] as const) {
        const a = render(art, 8, wall, false, 0.3, true).c;
        const b = render(art, 8, wall, false, 1.7, true).c;
        assert.ok(!same(a, b), `${name} (${wall}) looks the same at two times while active`);
      }
    });
  } else {
    test(`The Startup ${name}: still, whatever the clock or the work`, () => {
      const a = render(art, 8, 'right', false, 0, false).c;
      for (const [t, active] of [[3.7, false], [11.2, true]] as const) {
        assert.ok(same(a, render(art, 8, 'right', false, t, active).c), `${name} changed with t = ${t}${active ? ' (active)' : ''}`);
      }
    });
  }
}

test('The Startup stations: the desk, the kanban board, the rack and printer, the dashboards, the whiteboard and the door move while worked; idle, they hold still', () => {
  for (const kind of ['write', 'search', 'run', 'web', 'think', 'entrance'] as const) assert.ok(office.stations[kind].animated, `${kind} is not animated`);
  for (const [name, art] of Object.entries(office.stations)) {
    if (!art.animated || RESTLESS.has(name)) continue;
    const a = render(art, 8, 'right', false, 0.3, false).c;
    const b = render(art, 8, 'right', false, 2.9, false).c;
    assert.ok(same(a, b), `${name} moves while idle`);
  }
});

test('The Startup espresso machine never sleeps: steam rises off it, worked or not', () => {
  const art = office.stations.idle;
  assert.ok(art.emit, 'no steam');
  for (const active of [false, true]) {
    const bits: string[] = [];
    const view = { pen: render(art, 4, 'right', true, 0, active).c, s: 4, at: (u: number, v: number, z: number): [number, number] => [u, v + z], len: art.len, dep: art.dep, wall: 'right' as const, island: true, t: 0, active, seed: 1 };
    for (let f = 0; f < 60; f++) art.emit!({ ...view, t: f / 10 }, 0.1, (q) => bits.push(q.kind));
    assert.ok(bits.includes('steam'), `no steam${active ? ' while worked' : ''}`);
  }
});

test('The Startup room: the walls keep their windows, prints, neon squiggle and pendant lamps off the stations and apart', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'office');
    const plan = planFor(L.W, L.D, L.H, L.T);
    assert.deepEqual(plan.L.slots, L.slots, 'the shell found a different plan from the stage');
    assert.ok(plan.features.some((f) => f.kind === 'window'), `${L.W}: no windows onto the city`);
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

test('The Startup room: its caps over the whole room, windows on both walls of a roomy one, the bike on a wall, pendant lamps between', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'office');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    for (const kind of Object.keys(CAP) as Array<keyof typeof CAP>) {
      const n = features.filter((f) => f.kind === kind).length;
      assert.ok(n <= CAP[kind], `${L.W}: ${n} ${kind}s, over its cap of ${CAP[kind]}`);
    }
  }
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'office');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    for (const wall of ['left', 'right'] as const) assert.ok(features.some((f) => f.wall === wall && f.kind === 'window'), `${L.W}: no window on the ${wall} wall`);
    assert.ok(features.some((f) => f.kind === 'bike'), `${L.W}: no bike on the walls`);
    assert.ok(features.some((f) => f.kind === 'pendant'), `${L.W}: no pendant lamps`);
  }
  // the bike hangs flat on the wall, the shell's, not free-standing decor
  assert.ok(!Object.keys(DECOR_ART).includes('bike'), 'the bike is still a piece of decor');
});

test('The Startup room: the windows, prints, neon and bike keep clear of the tall furniture stood along the walls', () => {
  // slim pieces (a fig, a standing lamp) may stand before a window or the
  // neon, never a print or the bike; solid ones over a sill (the booth, the
  // snack shelf, the fridge, the desks) before nothing
  const slim = new Set<PropArt>([DECOR_ART.fig, DECOR_ART.lamp]);
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'office');
    const room = planRoom(office, L, hashString('office'));
    const { features } = planFor(L.W, L.D, L.H, L.T);
    for (const p of room.props) {
      if (p.slot || (!slim.has(p.art) && p.art.height <= 6)) continue;
      const r = footprint(p);
      for (const wall of ['right', 'left'] as const) {
        const [n0, a0, a1] = wall === 'right' ? [r.y0, r.x0, r.x1] : [r.x0, r.y0, r.y1];
        if (n0 > L.T + 2) continue; // not against this wall
        for (const f of features) {
          if (f.wall !== wall || f.kind === 'pendant' || (slim.has(p.art) && (f.kind === 'window' || f.kind === 'neon'))) continue;
          assert.ok(f.a + f.w / 2 <= a0 || f.a - f.w / 2 >= a1, `${L.W}: the ${f.kind} at ${f.a} on the ${wall} wall behind decor ${p.art.height} tall at ${a0}..${a1}`);
        }
      }
    }
  }
});

test('The Startup room: each pendant lamp is seen in the middle of a full bay, GAP clear of its neighbours, and the clouds never pass over it', () => {
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'office');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    for (const p of features.filter((f) => f.kind === 'pendant')) {
      // hung LAMP_N out from the wall, it is seen against the bricks LAMP_N back along it
      const c = p.a - LAMP_N;
      for (const g of features) {
        if (g.wall !== p.wall || g.kind === 'pendant') continue;
        const clear = Math.max(g.a - g.w / 2 - (c + p.w / 2), c - p.w / 2 - (g.a + g.w / 2));
        assert.ok(clear >= GAP - 0.5, `${L.W}: the pendant at ${p.a} (seen at ${c}) only ${clear.toFixed(2)} from the ${g.kind} at ${g.a}`);
      }
    }
  }
  // the overlay (painted over the finished frame) never over a shade
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'office');
    const { features } = planFor(L.W, L.D, L.H, L.T);
    const s = 4;
    const P = project(L.D * s + 20, L.H * s + 30, s);
    const o = new Canvas(Math.ceil((L.W + L.D) * s + 40), Math.ceil(((L.W + L.D) / 2 + L.H) * s + 60));
    const shades = features.filter((f) => f.kind === 'pendant').map((f) => frame(P, f.wall, f.wall === 'right' ? 0 : L.T, f.wall === 'right' ? L.T : 0)(f.a, LAMP_N, pendantZ(L.H) + 0.3));
    for (let t = 0; t < 48; t += 2) {
      o.clear();
      office.room.overlay!({ pen: o, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t, seed: 1 });
      for (const [cx, cy] of shades) {
        for (let y = Math.floor(cy - 1.2 * s); y <= cy + 1.2 * s; y++) {
          for (let x = Math.floor(cx - 1.8 * s); x <= cx + 1.8 * s; x++) {
            assert.ok(o.data[(y * o.width + x) * 4 + 3] <= 8, `${L.W}: at t = ${t} the overlay paints over the pendant seen at (${cx.toFixed(0)}, ${cy.toFixed(0)})`);
          }
        }
      }
    }
  }
});

test('The Startup windows: each shows its own city, whatever size of room was drawn before', async () => {
  // a second copy of the shell's module, its caches empty
  const spec = `../src/worlds/office/room.ts?fresh=${process.pid}`;
  const fresh = (await import(spec)) as { room: RoomArt };
  const draw = (art: RoomArt, [w, h]: [number, number]) => {
    const L = planLayout(w, h, 'office');
    const s = 2;
    const c = new Canvas(Math.ceil((L.W + L.D) * s + 20), Math.ceil(((L.W + L.D) / 2 + L.H) * s + 30));
    art.draw({ pen: c, s, at: project(L.D * s + 10, L.H * s + 20, s), W: L.W, D: L.D, H: L.H, T: L.T, t: 0, seed: 1 });
    return c;
  };
  draw(office.room, [300, 165]);
  draw(office.room, [375, 220]);
  assert.ok(same(draw(office.room, [500, 300]), draw(fresh.room, [500, 300])), 'a 200 x 60 room drawn after smaller ones differs from one drawn fresh');
});

test('The Startup points of interest: coffee at the espresso counter, seats at its stools, a look at the skyline', () => {
  for (const [w, h] of ROOMY) {
    const L = planLayout(w, h, 'office');
    // furnished as the stage furnishes it (seeded by the world's id); its
    // spots kept are those on open floor
    const room = planRoom(office, L, hashString('office'));
    const count = (k: string) => room.pois.filter((p) => p.kind === k).length;
    for (const k of ['warm', 'view', 'dance', 'pet']) assert.ok(count(k) >= 1, `${L.W}: no ${k} spot`);
    const bar = L.slots.find((s) => s.kind === 'idle')!;
    const r = slotRect(bar);
    const near = (p: { x: number; y: number }) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1)) <= 10;
    const drinks = room.pois.filter((p) => p.kind === 'drink');
    assert.ok(drinks.length >= 2, `${L.W}: ${drinks.length} drink spots`);
    for (const d of drinks) assert.ok(near(d), `${L.W}: a drink spot at (${d.x}, ${d.y}), away from the espresso counter`);
    assert.ok(count('seat') >= 2, `${L.W}: ${count('seat')} seat spots`);
    // a seat is by a stool, just off the counter's footprint, not out on the concrete
    const by = (p: { x: number; y: number }) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1)) <= 2;
    for (const p of room.pois.filter((q) => q.kind === 'seat')) assert.ok(by(p), `${L.W}: a seat at (${p.x}, ${p.y}), away from the counter's stools`);
    assert.ok(count('view') >= 3, `${L.W}: ${count('view')} view spots, two of the stations and the skyline`);
  }
});

test('The Startup decor: every piece is in DECOR_ART, each finds floor in a 150 x 44 terminal, the room is lively, and none stands in its front third', () => {
  const pieces = Object.values(DECOR_ART);
  for (const d of office.decor ?? []) assert.ok(pieces.includes(d.art), 'a piece of decor missing from DECOR_ART');
  const L = planLayout(375, 220, 'office');
  const room = planRoom(office, L, hashString('office'));
  for (const [name, art] of Object.entries(DECOR_ART)) assert.ok(room.props.some((p) => p.art === art), `${name} found no floor`);
  const decor = room.props.filter((p) => !p.slot);
  assert.ok(decor.length >= 12, `${decor.length} pieces of decor in a 150 x 44 terminal's room`);
  for (const p of decor) {
    const r = footprint(p);
    assert.ok(r.x1 + r.y1 <= (2 / 3) * (L.W + L.D) + 1, `a piece of decor at (${r.x0}, ${r.y0}) out in the front of the room`);
  }
});

test('The Startup decor: the extra desks back onto a wall, and a beanbag is big enough to sit in', () => {
  const { desks, beanbag } = DECOR_ART;
  for (const [w, h] of SIZES) {
    const L = planLayout(w, h, 'office');
    const room = planRoom(office, L, hashString('office'));
    for (const p of room.props.filter((q) => q.art === desks)) {
      const r = footprint(p);
      assert.ok(!p.island && (p.wall === 'right' ? r.y0 : r.x0) === L.T, `${L.W}: a bench of desks out on the floor at (${r.x0}, ${r.y0})`);
    }
  }
  assert.ok(beanbag.len >= 6 && beanbag.dep >= 6 && beanbag.height >= 4.5, `a beanbag ${beanbag.len} x ${beanbag.dep} x ${beanbag.height}`);
});

test('The Startup room: the shell draws inside the canvas, clouds drift and city lights come on, and it all stays in budget', () => {
  const L = planLayout(375, 220, 'office'); // a 150 x 44 terminal of 10 x 20 cells
  const room = planRoom(office, L, hashString('office'));
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
  office.room.draw(view(0));
  props(0, false, false);
  budget('static layer', () => {
    c.clear();
    office.room.draw(view(0));
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
        office.room.draw({ ...view(0), pen: tile, at: project(cam.ox - tx, cam.oy - ty, s) });
      }
    }
  }, 400);
  // Each animated prop's frame (its still parts cached after the first).
  for (const p of room.props.filter((q) => q.art.animated)) {
    const v = (t: number) => ({ pen: c, s, at: (u: number, w: number, z: number) => P(...toWorld(p, u, w, z)), len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active: true, seed: p.seed });
    for (let i = 0; i < 5; i++) p.art.draw(v(i));
    budget(`${p.slot?.kind ?? 'decor'} a frame`, (i) => p.art.draw(v(i / 12)), 1, { calls: 40 });
  }
  // The overlay: clouds drift past the windows and lights come on in the
  // city, cheaply.
  const frames = [0, 0.6, 1.2, 1.8, 2.4].map((t) => {
    const o = new Canvas(1500, 920);
    office.room.overlay!({ ...view(t), pen: o });
    return o;
  });
  assert.ok(frames.some((f, i) => i > 0 && !same(f, frames[0])), 'the overlay does not move');
  budget('the overlay a frame', (i) => office.room.overlay!(view(i / 12)), 3, { calls: 20 });
});

test('The Startup\'s workstation: its own, still whatever the clock', () => {
  const art = office.workstation;
  assert.ok(art, 'no workstation of its own');
  const at = (t: number, active: boolean): Canvas => render(art, 8, 'right', true, t, active).c;
  for (const active of [false, true]) assert.ok(same(at(0, active), at(7.3, active)), `it changed with the clock${active ? ' (on)' : ''}`);
});

test('The Startup: its desks have things of their own to pick from, and something that moves', () => {
  const art = workstationOf(office);
  assert.ok(art.clutter && art.clutter.items.length >= 8 && art.clutter.items.length <= 12, 'no clutter to pick from');
  assert.ok(art.loops && art.loops.length >= 1 && art.loops.length <= 2, 'nothing moves');
});

test('The Startup: three locals at work, each where its job puts it', () => {
  assert.deepEqual(office.npcs!.map((n) => [n.name, n.station, n.place.mode]), [['itAdmin', 'run', 'standing'], ['receptionist', 'entrance', 'behind'], ['officeManager', 'idle', 'behind']]);
  assert.ok(office.npcs!.some((n) => n.show), 'no show');
});
