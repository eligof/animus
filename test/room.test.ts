import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSites, hub, keepClear, planLayout, slotRect, yard } from '../src/world/layout.ts';
import type { Rect } from '../src/world/layout.ts';
import { footprint, heightAt, planRoom, toWorld } from '../src/world/room.ts';
import type { PlacedProp } from '../src/world/room.ts';
import { THEMES } from '../src/themes/index.ts';
import { mines } from '../src/worlds/mines.ts';
import { stubProp } from '../src/worlds/stub.ts';
import type { WorldDef } from '../src/worlds/types.ts';

// Rooms for canvases from a small terminal's to a huge one's, in units.
const SIZES: Array<[number, number]> = [[150, 85], [305, 215], [500, 290], [1000, 500]];
const overlap = (a: Rect, b: Rect, pad = 0) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
const decorOf = (props: PlacedProp[]) => props.filter((p) => !p.slot);

test('every station slot holds its world\'s prop, sized to the slot', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch, 'mines');
    const room = planRoom(mines, L, 7);
    assert.equal(room.L, L);
    L.slots.forEach((s, i) => {
      const p = room.props[i];
      assert.equal(p.slot, s);
      assert.equal(p.art, mines.stations[s.kind], s.kind);
      assert.deepEqual([p.wall, p.island, p.x0, p.y0, p.len, p.dep], [s.wall, !!s.island, s.x0, s.y0, s.len, s.dep], s.kind);
      assert.deepEqual(footprint(p), slotRect(s));
    });
  }
});

test('a prop\'s frame runs along its wall and out from it, islands in their wall\'s frame', () => {
  const right = { wall: 'right' as const, x0: 20, y0: 8 };
  const left = { wall: 'left' as const, x0: 8, y0: 30 };
  assert.deepEqual(toWorld(right, 3, 2, 5), [23, 10, 5]);
  assert.deepEqual(toWorld(left, 3, 2, 5), [10, 33, 5]);
  const L = planLayout(500, 290, 'cafe');
  for (const p of planRoom(THEMES.find((t) => t.id === 'cafe')!, L, 1).props) {
    const r = footprint(p);
    // The far corner of the footprint is (len, dep) in the prop's frame; v
    // runs toward the viewer (larger x + y) whichever the wall.
    const [x, y] = toWorld(p, p.len, p.dep, 0);
    assert.deepEqual([x, y], [r.x1, r.y1]);
    const [bx, by] = toWorld(p, 0, 0, 0);
    const [fx, fy] = toWorld(p, 0, 1, 0);
    assert.equal(fx + fy, bx + by + 1, 'v does not point at the viewer');
  }
});

test('decor stands on the floor, clear of the stations, the walkways, the plazas, the yard, the piles and each other', () => {
  for (const world of THEMES) {
    for (const [cw, ch] of SIZES) {
      const L = planLayout(cw, ch, world.id);
      const room = planRoom(world, L, 3);
      const tag = `${world.id} ${cw}x${ch}`;
      const keep = keepClear(L);
      const yd = yard(L);
      for (const p of decorOf(room.props)) {
        const r = footprint(p);
        assert.ok(r.x0 >= L.T && r.y0 >= L.T && r.x1 <= L.W - 2 && r.y1 <= L.D - 2, `${tag}: decor off the floor`);
        if (!p.island) assert.equal(p.wall === 'right' ? p.y0 : p.x0, L.T, `${tag}: wall decor away from its wall`);
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) assert.equal(keep[x + L.W * y], 0, `${tag}: decor on a walkway at ${x},${y}`);
        assert.ok(!overlap(r, { x0: yd.x - yd.r, y0: yd.y - yd.r, x1: yd.x + yd.r, y1: yd.y + yd.r }), `${tag}: decor in the yard`);
        for (const s of room.supply) assert.ok(!overlap(r, s, 1), `${tag}: decor on a pile`);
        for (const o of room.props) if (o !== p) assert.ok(!overlap(r, footprint(o), 1), `${tag}: decor touches ${o.slot?.kind ?? 'decor'}`);
      }
    }
  }
});

test('decor goes where the world asks: along the walls or out on the floor', () => {
  const L = planLayout(305, 215, 'mines');
  const want = mines.decor!;
  const room = planRoom(mines, L, 3);
  const decor = decorOf(room.props);
  for (const d of want) {
    const got = decor.filter((p) => p.art === d.art);
    assert.equal(got.length, d.count, `${d.place}: ${got.length} of ${d.count} placed`);
    for (const p of got) assert.equal(p.island, d.place === 'floor');
    assert.ok(got.every((p) => p.len === d.art.len && p.dep === d.art.dep));
  }
  // Pieces get seeds of their own.
  assert.equal(new Set(room.props.map((p) => p.seed)).size, room.props.length);
});

test('tall floor decor stays out of the view of the crowds and the plazas', () => {
  const tall: WorldDef = { ...mines, decor: [{ art: stubProp(5, 5, 24, [90, 90, 90]), count: 6, place: 'floor' }] };
  const masks = (r: Rect, p: { x: number; y: number }, half: number) =>
    r.x0 - r.y1 < p.x - p.y + half && p.x - p.y - half < r.x1 - r.y0 && r.x0 + r.y0 > p.x + p.y && r.x0 + r.y0 - (p.x + p.y) < 40;
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch, 'mines');
    const room = planRoom(tall, L, 5);
    const decor = decorOf(room.props);
    assert.ok(decor.length > 0, `${cw}x${ch}: no room for any`);
    for (const p of decor) {
      const r = footprint(p);
      for (const s of L.slots) if (s.kind !== 'entrance') assert.ok(!masks(r, s.spot, 4), `${cw}x${ch}: hides the ${s.kind} crowd`);
      for (const b of buildSites(L)) assert.ok(!masks(r, b, b.r), `${cw}x${ch}: hides a plaza`);
    }
  }
});

test('the routing grid goes round every prop, and the room knows how tall they stand', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch, 'mines');
    const room = planRoom(mines, L, 3);
    const h = hub(L);
    assert.ok(room.nav.isOpen(h), 'the hub is shut');
    assert.equal(heightAt(room, h.x, h.y), 0);
    for (const p of room.props) {
      const r = footprint(p);
      const mid = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
      assert.ok(!room.nav.isOpen(mid), `${p.slot?.kind ?? 'decor'} is walkable`);
      assert.equal(heightAt(room, mid.x, mid.y), p.art.height);
    }
  }
});

test('points of interest stand on open floor; worlds may name their own', () => {
  for (const world of THEMES) {
    const L = planLayout(305, 215, world.id);
    const room = planRoom(world, L, 3);
    const kinds = new Set(room.pois.map((p) => p.kind));
    for (const k of ['warm', 'view', 'dance', 'pet'] as const) assert.ok(kinds.has(k), `${world.id}: no ${k} spot`);
    for (const p of room.pois) {
      assert.ok(p.x > L.T && p.y > L.T && p.x < L.W - 1 && p.y < L.D - 1, `${world.id}: ${p.kind} off the floor`);
      for (const q of room.props) {
        const r = footprint(q);
        assert.ok(!(p.x > r.x0 - 1 && p.x < r.x1 + 1 && p.y > r.y0 - 1 && p.y < r.y1 + 1), `${world.id}: ${p.kind} spot in a prop`);
      }
    }
  }
  const own: WorldDef = { ...mines, pois: (L) => [{ x: hub(L).x, y: hub(L).y, kind: 'dance' }, { x: 0, y: 0, kind: 'seat' }] };
  const L = planLayout(305, 215, 'mines');
  const room = planRoom(own, L, 3);
  assert.deepEqual(room.pois, [{ x: hub(L).x, y: hub(L).y, kind: 'dance' }], 'off-floor spots are dropped, the rest kept');
});

test('each build plaza has a supply pile beside it, on the floor and clear of the props', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch, 'mines');
    const room = planRoom(mines, L, 3);
    const plazas = buildSites(L);
    assert.equal(room.supply.length, plazas.length);
    room.supply.forEach((s, k) => {
      assert.deepEqual([s.x1 - s.x0, s.y1 - s.y0], [3, 3]);
      assert.ok(s.x0 > L.T && s.y0 > L.T && s.x1 < L.W - 1 && s.y1 < L.D - 1, 'pile off the floor');
      const d = Math.hypot((s.x0 + s.x1) / 2 - plazas[k].x, (s.y0 + s.y1) / 2 - plazas[k].y);
      assert.ok(d > plazas[k].r && d < plazas[k].r + 6, `pile ${d.toFixed(1)} from its plaza`);
      for (const p of room.props) assert.ok(!overlap(s, footprint(p)), `pile on ${p.slot?.kind ?? 'decor'}`);
    });
  }
});

test('a room is planned the same every time', () => {
  const L = planLayout(500, 290, 'club');
  const club = THEMES.find((t) => t.id === 'club')!;
  const plan = () => {
    const r = planRoom(club, L, 9);
    return JSON.stringify({ props: r.props.map((p) => [p.wall, p.island, p.x0, p.y0, p.len, p.dep, p.seed]), pois: r.pois, supply: r.supply });
  };
  assert.equal(plan(), plan());
});
