import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSites, hub, keepClear, planLayout, slotRect, yard } from '../src/world/layout.ts';
import type { Rect } from '../src/world/layout.ts';
import { BASE, footprint, heightAt, moreDecor, planRoom, toWorld, veils } from '../src/world/room.ts';
import type { PlacedProp, Reserve } from '../src/world/room.ts';
import { hashString } from '../src/world/rng.ts';
import type { Layout } from '../src/world/types.ts';
import { THEMES } from '../src/themes/index.ts';
import { Stage } from '../src/world/stage.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { planFor as cafePlan } from '../src/worlds/cafe/room.ts';
import { mines } from '../src/worlds/mines.ts';
import { stubProp } from '../src/worlds/stub.ts';
import type { PropArt, WorldDef } from '../src/worlds/types.ts';

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
  // (in a room BASE across, which gets the decor as asked; see moreDecor)
  const L = planLayout(2 * BASE + 12, 1000, 'mines');
  assert.equal(L.W, BASE);
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

// Rooms from the smallest to the biggest, in units across (80 x 24 is 72,
// 100 x 30 86 and 97 full screen, 120 x 36 108, 150 x 46 143 and 153 full
// screen, 200 x 60 160).
const SIDES = [72, 80, 86, 97, 104, 112, 120, 132, 143, 153, 160];
const square = (side: number, id: string) => planLayout(2 * side + 12, 1000, id);
// The pieces a big room has over what its world asks for: placed after
// the rest, their seeds count on from the world's own (see planRoom).
const moreOf = (world: WorldDef, props: PlacedProp[]) => {
  const asked = (world.decor ?? []).reduce((n, d) => n + d.count, 0);
  const mine = new Set(Array.from({ length: asked }, (_, k) => hashString(`${world.id}:decor:${k}`)));
  return decorOf(props).filter((p) => !mine.has(p.seed));
};

test('rooms up to BASE across get the decor as asked; a bigger one more, round its pieces in turn, none more than doubled, a set piece or fixture once', () => {
  const art = (len: number) => stubProp(len, 4, 6, [90, 90, 90]);
  const [a, b, c, hearth, shelf, booth] = [art(5), art(6), art(4), art(20), art(8), art(6)];
  const world = {
    decor: [
      { art: a, count: 4, place: 'floor' },
      { art: b, count: 1, place: 'floor' },
      { art: a, count: 2, place: 'floor' },
      { art: c, count: 3, place: 'floor' },
      { art: hearth, count: 1, place: 'wall' },
      { art: shelf, count: 2, place: 'wall' },
      { art: booth, count: 1, place: 'wall' },
    ],
  } as const satisfies Pick<WorldDef, 'decor'>;
  for (const side of SIDES.filter((s) => s <= BASE)) assert.deepEqual(moreDecor(world, square(side, 'mines')), [], `${side} across`);
  let last = 0;
  for (const side of SIDES.filter((s) => s > BASE)) {
    const more = moreDecor(world, square(side, 'mines'));
    assert.ok(more.length >= last, `${side} across: ${more.length} more, after ${last}`);
    last = more.length;
    const n = (p: PropArt) => more.filter((m) => m.art === p).length;
    // the walls' first, then the floor's; the floor's go a, b, c, a, c, ...
    const floor = more.findIndex((m) => m.place === 'floor');
    if (floor >= 0) assert.ok(more.slice(floor).every((m) => m.place === 'floor'), `${side} across: the walls' after the floor's`);
    assert.deepEqual(more.filter((m) => m.place === 'floor').slice(0, 4).map((m) => m.art), [a, b, c, a].slice(0, n(a) + n(b) + n(c)));
    assert.equal(n(hearth), 0, 'a second hearth');
    assert.equal(n(booth), 0, 'a second of a fixture asked for once');
    assert.ok(n(a) <= 6 && n(b) <= 1 && n(c) <= 3 && n(shelf) <= 2, `${side} across: more than doubled`);
    assert.ok(Math.abs(n(a) - n(c)) <= 1 || n(c) === 3, `${side} across: not round in turn`);
  }
  assert.ok(last >= 5, `the biggest room gets ${last} more`);
});

test('in every room, from the smallest to the biggest, the decor keeps its places, and a big room more of it lines the back walls', (t) => {
  const BAND = 2 / 3;
  const NEAR = 4;
  const report: string[] = [];
  for (const world of THEMES) {
    const counts: number[] = [];
    for (const side of SIDES) {
      const L = square(side, world.id);
      const room = planRoom(world, L, hashString(world.id));
      const tag = `${world.id} ${side}`;
      const keep = keepClear(L);
      const yd = yard(L);
      const decor = decorOf(room.props);
      counts.push(decor.length);
      for (const p of decor) {
        const r = footprint(p);
        assert.ok(r.x0 >= L.T && r.y0 >= L.T && r.x1 <= L.W - 2 && r.y1 <= L.D - 2, `${tag}: decor off the floor`);
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) assert.equal(keep[x + L.W * y], 0, `${tag}: decor on a walkway at ${x},${y}`);
        assert.ok(!overlap(r, { x0: yd.x - yd.r, y0: yd.y - yd.r, x1: yd.x + yd.r, y1: yd.y + yd.r }), `${tag}: decor in the yard`);
        for (const s of room.supply) assert.ok(!overlap(r, s, 1), `${tag}: decor on a pile`);
        for (const o of room.props) if (o !== p) assert.ok(!overlap(r, footprint(o), 1), `${tag}: decor touches ${o.slot?.kind ?? 'decor'}`);
        if (p.island) assert.ok(r.x1 + r.y1 <= BAND * (L.W + L.D), `${tag}: a piece in the front of the room`);
      }
      const more = moreOf(world, room.props);
      if (side <= BASE) assert.equal(more.length, 0, `${tag}: more decor than asked`);
      const h = hub(L);
      const m = 0.15 * (L.W - L.T);
      for (const p of more) {
        const r = footprint(p);
        const at = `${tag}: a ${p.art.len}x${p.art.dep} more at ${r.x0},${r.y0}`;
        assert.ok(!overlap(r, { x0: h.x - m, y0: h.y - m, x1: h.x + m, y1: h.y + m }), `${at} in the middle of the floor`);
        if (!p.island) continue;
        const byWall = Math.min(r.x0, r.y0) - L.T <= NEAR;
        const byBacked = room.props.some((q) => q !== p && !q.island && gap(r, footprint(q)) <= NEAR);
        assert.ok(byWall || byBacked, `${at} stands out on the floor, by no back wall`);
      }
    }
    // a big room is more furnished than one BASE across
    const at = (s: number) => counts[SIDES.indexOf(s)];
    assert.ok(at(143) > at(BASE) && at(160) >= at(143), `${world.id}: ${counts.join(' ')}`);
    report.push(`${world.id} ${counts.join(' ')}`);
  }
  t.diagnostic(`decor placed at ${SIDES.join(' ')} across:\n${report.join('\n')}`);
});

test('in a big room no piece is more than doubled, and a set piece or a fixture is one a room', () => {
  for (const world of THEMES) {
    const room = planRoom(world, square(160, world.id), hashString(world.id));
    for (const art of new Set((world.decor ?? []).map((d) => d.art))) {
      const of = (world.decor ?? []).filter((d) => d.art === art);
      const asked = of.reduce((n, d) => n + d.count, 0);
      const got = decorOf(room.props).filter((p) => p.art === art).length;
      const once = art.len >= 15 || (asked === 1 && of[0].place === 'wall');
      assert.ok(got <= (once ? asked : 2 * asked), `${world.id}: ${got} of a ${art.len}x${art.dep} piece asked for ${asked} times`);
    }
  }
});

test('a stretch of wall kept clear: nothing stands on the floor before it, nor where it hides the wall over its z', () => {
  const L = planLayout(305, 215, 'mines');
  const T = L.T;
  const kept: Reserve[] = [{ wall: 'right', a0: 40, a1: 55, out: 10 }];
  // (on the right wall a piece from (x0, y0) to (x1, y1) is u = x, v = y - T)
  const at = (x0: number, v0: number, len: number, dep: number): Rect => ({ x0, y0: T + v0, x1: x0 + len, y1: T + v0 + dep });
  assert.ok(veils(L, kept, at(45, 2, 4, 4), 1), 'a rug on its floor');
  assert.ok(veils(L, kept, at(57, 5, 4, 4), 12), 'a tall piece further along hides it');
  assert.ok(!veils(L, kept, at(57, 5, 4, 4), 4), 'one too short to');
  assert.ok(!veils(L, [{ ...kept[0], z: 8 }], at(57, 5, 4, 4), 12), 'nor one hiding only under its z');
  assert.ok(!veils(L, [{ ...kept[0], z: 8 }], at(45, 2, 4, 4), 4), 'a low piece before one hung up the wall');
  assert.ok(veils(L, [{ ...kept[0], z: 8 }], at(45, 2, 4, 4), 12), 'a tall one before it');
  assert.ok(!veils(L, kept, at(30, 2, 6, 4), 14), 'one nearer the corner hides nothing of it');
  assert.ok(!veils(L, kept, at(45, 12, 4, 4), 14), 'nor one past `out`');
  // the left wall's frame is the same, along y and out along x
  const left: Reserve[] = [{ wall: 'left', a0: 40, a1: 55, out: 10 }];
  assert.ok(veils(L, left, { x0: T + 5, y0: 57, x1: T + 9, y1: 61 }, 12));
  assert.ok(!veils(L, left, { x0: T + 5, y0: 57, x1: T + 9, y1: 61 }, 4));
  // The cafe's hearth kept clear: the decor goes round it (where some stood
  // in front of it before), in every room.
  const cafe = THEMES.find((t) => t.id === 'cafe')!;
  const hearth = (K: Layout): Reserve[] => cafePlan(K.W, K.D, K.H, K.T).features.filter((f) => f.kind === 'hearth').map((f) => ({ wall: f.wall, a0: f.a - f.w / 2, a1: f.a + f.w / 2, out: 10 }));
  let moved = 0;
  for (const side of SIDES) {
    const K = square(side, 'cafe');
    const keep = hearth(K);
    const kept = planRoom({ ...cafe, reserve: hearth }, K, hashString('cafe'));
    for (const p of decorOf(kept.props)) assert.ok(!veils(K, keep, footprint(p), p.art.height), `cafe ${side}: a ${p.art.len}x${p.art.dep} piece before the hearth`);
    if (decorOf(planRoom(cafe, K, hashString('cafe')).props).some((p) => veils(K, keep, footprint(p), p.art.height))) moved++;
  }
  assert.ok(moved > 0, 'nothing stood before the hearth anyway');
});

test('a patch of floor kept clear has no decor on it', () => {
  const L = planLayout(305, 215, 'mines');
  const patch = { x0: 10, y0: 10, x1: 20, y1: 16 };
  assert.ok(veils(L, [patch], { x0: 18, y0: 14, x1: 22, y1: 18 }, 1));
  assert.ok(!veils(L, [patch], { x0: 20, y0: 10, x1: 24, y1: 14 }, 30), 'one beside it');
  // all the floor along the back walls kept: no decor out by them
  const strip = (K: Layout) => [{ x0: 0, y0: 0, x1: K.W, y1: K.T + 14 }, { x0: 0, y0: 0, x1: K.T + 14, y1: K.D }];
  for (const side of [72, 120, 160]) {
    const K = square(side, 'mines');
    const room = planRoom({ ...mines, reserve: strip }, K, hashString('mines'));
    for (const p of decorOf(room.props)) assert.ok(!veils(K, strip(K), footprint(p), p.art.height), `${side}: decor on the kept floor`);
  }
});

test('a world that plans the room to place what it keeps clear is not asked again meanwhile: that room is planned without it', () => {
  // as a shell does that slides its hero clear of the furniture (cafe, club)
  let asked = 0;
  let inner: PlacedProp[] = [];
  const world: WorldDef = {
    ...mines,
    reserve: (L) => {
      asked++;
      inner = planRoom(world, L, hashString('mines')).props;
      return [{ wall: 'right', a0: L.T, a1: L.W, out: 12 }];
    },
  };
  const L = square(143, 'mines');
  const room = planRoom(world, L, hashString('mines'));
  assert.equal(asked, 1);
  assert.deepEqual(inner.map(footprint), planRoom({ ...mines, reserve: undefined }, L, hashString('mines')).props.map(footprint), 'the room planned meanwhile kept something clear');
  const keep = [{ wall: 'right' as const, a0: L.T, a1: L.W, out: 12 }];
  assert.ok(decorOf(inner).some((p) => veils(L, keep, footprint(p), p.art.height)), 'nothing stood by the right wall anyway');
  for (const p of decorOf(room.props)) assert.ok(!veils(L, keep, footprint(p), p.art.height), 'decor by the kept wall');
});

// Terminals from small to big, in cells, and the room a stage furnishes
// for each one's scene.
const TERMS: Array<[number, number]> = [[80, 24], [100, 30], [150, 46], [200, 60]];
const staged = (world: WorldDef, cols: number, rows: number) => {
  const stage = new Stage(world);
  stage.layout(computeLayout(cols, rows).scene);
  return stage.room()!;
};
// Units between two footprints (0 if they touch).
const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

test('floor decor stands by the back walls and beside the props, never loose in the front of the room', (t) => {
  // The front band: the floor nearest the viewer, past this much of W + D
  // down the room; "by" a wall or a prop: within NEAR units of it.
  const BAND = 2 / 3;
  const NEAR = 4;
  const report: string[] = [];
  for (const [cols, rows] of TERMS) {
    const line: string[] = [];
    for (const world of THEMES) {
      const room = staged(world, cols, rows);
      const L = room.L;
      const tag = `${world.id} ${cols}x${rows} (${L.W} units)`;
      const floor = decorOf(room.props).filter((p) => p.island);
      for (const p of floor) {
        const r = footprint(p);
        const at = `${tag}: a ${p.art.len}x${p.art.dep} piece at ${r.x0},${r.y0}`;
        assert.ok(r.x1 + r.y1 <= BAND * (L.W + L.D), `${at} stands in the front of the room`);
        const byWall = Math.min(r.x0, r.y0) - L.T <= NEAR;
        const byProp = room.props.some((q) => q !== p && gap(r, footprint(q)) <= NEAR);
        assert.ok(byWall || byProp, `${at} stands loose, by no wall or prop`);
      }
      const asked = (world.decor ?? []).filter((d) => d.place === 'floor').reduce((n, d) => n + d.count, 0);
      if (asked) line.push(`${world.id} ${floor.length}/${asked}`);
      // Most of it still finds floor: a few pieces in the smallest rooms,
      // three in four from a 150 x 46 terminal up.
      const want = cols >= 150 ? Math.ceil(asked * 0.75) : Math.min(asked, 3);
      assert.ok(floor.length >= want, `${tag}: only ${floor.length} of ${asked} pieces of floor decor placed`);
    }
    report.push(`${cols}x${rows}: ${line.join(', ')}`);
  }
  t.diagnostic(`floor decor placed of asked:\n${report.join('\n')}`);
});

test('floor decor is placed the same every time', () => {
  for (const world of THEMES) {
    const plan = () => JSON.stringify(staged(world, 150, 46).props.map((p) => [p.wall, p.island, p.x0, p.y0, p.seed]));
    assert.equal(plan(), plan(), world.id);
  }
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
