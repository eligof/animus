import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES } from '../src/themes/index.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { DESK, DESK_SPOT, deskCap, deskZone } from '../src/world/desks.ts';
import { FIGURE_H } from '../src/world/frame.ts';
import { buildSites, hub, planLayout, slotRect, yard } from '../src/world/layout.ts';
import type { Rect } from '../src/world/layout.ts';
import type { Room } from '../src/world/room.ts';
import { footprint, heightAt, planRoom } from '../src/world/room.ts';
import { hashString } from '../src/world/rng.ts';
import type { Spot } from '../src/world/types.ts';
import type { WorldDef } from '../src/worlds/types.ts';

// Where workstations go (see desks.ts): places in team pods on the open
// floor each room's stations and decor leave, clear of everything people
// need, hiding nobody.

const TERMS: Array<[number, number]> = [[80, 24], [100, 30], [120, 36], [150, 46], [200, 60]];

// The room the stage furnishes for a terminal this size (as Stage.layout),
// each planned once for the tests below.
const rooms = new Map<string, Room>();
function roomFor(w: WorldDef, cols: number, rows: number): Room {
  const key = `${w.id}:${cols}x${rows}`;
  let room = rooms.get(key);
  if (!room) {
    const sc = computeLayout(cols, rows).scene;
    rooms.set(key, (room = planRoom(w, planLayout((sc.w * 10) / 4, (sc.h * 20) / 4, w.id), hashString(w.id))));
  }
  return room;
}

// How far a point is from a rect (0 inside it), and two rects apart.
const off = (p: Spot, r: Rect) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));
const apart = (a: Rect, b: Rect) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

// Whether someone at p is in view (as the stage's `level` judges it).
function inView(p: Spot, tall: (x: number, y: number) => number): boolean {
  for (let dy = 0; dy <= FIGURE_H; dy++) {
    for (let dx = dy ? 0 : 1; dx <= FIGURE_H; dx++) if (Math.abs(dx - dy) <= 3 && tall(p.x + dx, p.y + dy) > (dx + dy) / 2 + 5) return false;
  }
  return true;
}

test('a room plans places for workstations: a few in the smallest room, two dozen and more in a 150 x 46 terminal', () => {
  const want: Record<string, number> = { '80x24': 3, '100x30': 10, '120x36': 19, '150x46': 25, '200x60': 28 };
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const n = room.desks.length;
      assert.ok(n >= want[`${cols}x${rows}`] && n <= deskCap(room.L), `${w.id} ${cols}x${rows}: ${n} places`);
      room.desks.forEach((d, i) => {
        assert.equal(d.index, i);
        assert.deepEqual([d.len, d.dep, d.kind, d.island], [DESK.len, DESK.dep, 'desk', true]);
        const at = d.wall === 'right' ? { x: d.x0 + DESK_SPOT.u, y: d.y0 + DESK_SPOT.v } : { x: d.x0 + DESK_SPOT.v, y: d.y0 + DESK_SPOT.u };
        assert.deepEqual(d.spot, at, 'its agent stands in front of it');
      });
    }
  }
});

test('each place stands on the floor, clear of the props, the stations\' fronts, the way in, the plazas, the yard, the hub and the spots idlers like', () => {
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const { L } = room;
      const door = L.slots.find((s) => s.kind === 'entrance')!;
      const yd = yard(L);
      const h = hub(L);
      for (const d of room.desks) {
        const tag = `${w.id} ${cols}x${rows}: place ${d.index}`;
        const z = deskZone(d);
        const f = footprint(d);
        assert.ok(z.x0 >= L.T && z.y0 >= L.T && z.x1 <= L.W - 2 && z.y1 <= L.D - 2, `${tag} off the floor`);
        for (const p of room.props) assert.ok(apart(z, footprint(p)) >= 1, `${tag} on a ${p.slot?.kind ?? 'piece of decor'}`);
        for (const r of room.supply) assert.ok(apart(z, r) >= 1, `${tag} on a pile`);
        for (const s of L.slots) assert.ok(off(s.spot, z) > 3, `${tag} in front of the ${s.kind}`);
        assert.ok(off(door.spot, z) > 8, `${tag} in the way in`);
        for (const b of buildSites(L)) assert.ok(off(b, z) > b.r + 1, `${tag} on a plaza`);
        assert.ok(off(yd, z) > yd.r + 1, `${tag} in the yard`);
        assert.ok(off(h, f) > 4, `${tag} on the hub`);
        for (const p of room.pois) assert.ok(off(p, z) > 2, `${tag} on a ${p.kind} spot`);
      }
    }
  }
});

test('no place hides anyone: not its own agent, nor another\'s, nor a station\'s front, a spot idlers like or a plaza', () => {
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const feet = room.desks.map(footprint);
      const desks = (x: number, y: number) => (feet.some((r) => x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) ? DESK.height : 0);
      const all = (x: number, y: number) => Math.max(heightAt(room, x, y), desks(x, y));
      const tag = `${w.id} ${cols}x${rows}`;
      for (const d of room.desks) assert.ok(inView(d.spot, all), `${tag}: the agent at place ${d.index} hidden`);
      for (const s of room.L.slots) {
        const r = slotRect(s);
        assert.ok(inView({ x: r.x1, y: r.y1 }, desks), `${tag}: the ${s.kind}'s front hidden`);
      }
      for (const p of room.pois) assert.ok(inView(p, desks), `${tag}: the ${p.kind} spot hidden`);
      for (const b of buildSites(room.L)) assert.ok(inView(b, desks), `${tag}: a plaza hidden`);
    }
  }
});

test('pods keep a team together: its places side by side, turned alike, its lead\'s first; a walkway between pods', () => {
  for (const [cols, rows] of TERMS) {
    for (const w of THEMES) {
      const room = roomFor(w, cols, rows);
      const pods = new Map<number, typeof room.desks>();
      for (const d of room.desks) pods.set(d.pod, [...(pods.get(d.pod) ?? []), d]);
      const tag = `${w.id} ${cols}x${rows}`;
      for (const [pod, ds] of pods) {
        assert.ok(ds.length >= 1 && ds.length <= 5, `${tag}: pod ${pod} of ${ds.length}`);
        assert.ok(ds[0].lead && ds.slice(1).every((d) => !d.lead), `${tag}: pod ${pod}'s lead's place is not its first`);
        assert.ok(ds.every((d) => d.wall === ds[0].wall), `${tag}: pod ${pod} turned two ways`);
        for (const d of ds) assert.ok(Math.hypot(d.spot.x - ds[0].spot.x, d.spot.y - ds[0].spot.y) <= 25, `${tag}: place ${d.index} far from its lead's`);
      }
      for (const a of room.desks) {
        for (const b of room.desks) if (a.pod < b.pod) assert.ok(apart(deskZone(a), deskZone(b)) >= 1, `${tag}: pods ${a.pod} and ${b.pod} with no walkway between`);
      }
    }
  }
});

test('places are planned the same every time', () => {
  const L = planLayout(375, 220, 'cafe');
  const cafe = THEMES.find((t) => t.id === 'cafe')!;
  const plan = () => JSON.stringify(planRoom(cafe, L, hashString('cafe')).desks);
  assert.equal(plan(), plan());
});
