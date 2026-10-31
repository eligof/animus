import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTheme } from '../src/themes/index.ts';
import { deskZone } from '../src/world/desks.ts';
import { buildSites, hub, planLayout, yard } from '../src/world/layout.ts';
import type { Rect } from '../src/world/layout.ts';
import { NPC_R, cutOf, facingOf } from '../src/world/npc-place.ts';
import { footprint, planRoom, toWorld } from '../src/world/room.ts';
import { hashString } from '../src/world/rng.ts';
import type { Spot } from '../src/world/types.ts';
import type { NpcLook, WorldDef } from '../src/worlds/types.ts';
import { standIn, standers, trio, withLocals } from './npc-fakes.ts';

// Where the locals stand in a planned room: one behind its counter or
// seated inside its station where its art says, facing where it says; one
// standing on floor kept clear (desks, decor and routing keep off it) or
// left out; whoever one serves in front of its station, the next beside,
// both reachable; a world's own furniture the same with locals or without.

const mines = getTheme('mines')!;
// The smallest room, and a big one (a 200 x 60 terminal's).
const SMALL = planLayout(200, 105, 'mines');
const BIG = planLayout(500, 290, 'mines');
const plan = (w: WorldDef, L = BIG) => planRoom(w, L, hashString(w.id));
const near = (r: Rect, s: Spot, m: number) => s.x > r.x0 - m && s.x < r.x1 + m && s.y > r.y0 - m && s.y < r.y1 + m;

test('a local behind its counter or seated stands inside its station where its art says, cut at its counter', () => {
  const w = trio(mines);
  for (const L of [SMALL, BIG]) {
    const room = plan(w, L);
    assert.equal(room.npcs.length, 3, `${room.npcs.length} of 3 placed in a room ${L.W} across`);
    for (const p of room.npcs) {
      const n = w.npcs![p.k];
      const prop = room.props[p.prop];
      assert.equal(prop.slot?.kind, n.station);
      const [x, y] = toWorld(prop, n.place.u, n.place.v, 0);
      assert.deepEqual([p.x, p.y, p.z, p.mode, p.station, p.wall], [x, y, n.place.mode === 'seated' ? n.place.z : 0, n.place.mode, n.station, prop.wall]);
      assert.equal(p.cut, cutOf(n.place));
      assert.ok(near(footprint(prop), p, 0), `${n.name} is not inside its station`);
    }
  }
});

test('a local faces into the room, along its station or away, as its art says, on either wall', () => {
  for (const look of ['out', 'along', 'back'] as NpcLook[]) {
    // the write station backs onto the right wall, the read station the left
    const w = withLocals(mines, [
      standIn('r', 'write', { mode: 'behind', u: 5.5, v: 1.5, top: 5, edge: 3, look }),
      standIn('l', 'read', { mode: 'behind', u: 7, v: 1, top: 4, edge: 2, look }),
    ]);
    const room = plan(w);
    assert.deepEqual(room.npcs.map((p) => p.wall).sort(), ['left', 'right']);
    for (const p of room.npcs) assert.deepEqual(p.facing, facingOf(p.wall, look), `${w.npcs![p.k].name} looking ${look}`);
  }
});

test('a standing local is placed on floor kept clear, else left out; desks, decor and routing keep off it', () => {
  const w = standers(mines);
  const room = plan(w);
  const L = room.L;
  const placed = room.npcs.filter((p) => p.mode === 'standing');
  assert.ok(placed.length >= 1, 'no standing local fits');
  assert.ok(!room.npcs.some((p) => w.npcs![p.k].name === 'insider'), 'one standing inside its station placed');
  const yd = yard(L);
  const h = hub(L);
  for (const p of placed) {
    const what = `${w.npcs![p.k].name} at ${p.x.toFixed(1)}, ${p.y.toFixed(1)}`;
    for (const q of room.props) assert.ok(!near(footprint(q), p, NPC_R), `${what}: on a prop`);
    for (const r of room.supply) assert.ok(!near(r, p, NPC_R), `${what}: on a pile`);
    for (const s of L.slots) assert.ok(Math.hypot(s.spot.x - p.x, s.spot.y - p.y) >= (s.kind === 'entrance' ? 8 : 3), `${what}: on the ${s.kind} station's spot`);
    for (const q of room.pois) assert.ok(Math.hypot(q.x - p.x, q.y - p.y) >= 3, `${what}: on a spot idlers like`);
    for (const b of buildSites(L)) assert.ok(Math.hypot(b.x - p.x, b.y - p.y) >= b.r + 2, `${what}: on a plaza`);
    assert.ok(Math.hypot(yd.x - p.x, yd.y - p.y) >= yd.r + 1 && Math.hypot(h.x - p.x, h.y - p.y) >= 5, `${what}: in the yard or on the hub`);
    for (const d of room.desks) assert.ok(!near(deskZone(d), p, NPC_R), `${what}: a workstation on it`);
    assert.ok(!room.nav.isOpen(p), `${what}: routing walks through it`);
    for (const o of placed) if (o !== p) assert.ok(Math.hypot(o.x - p.x, o.y - p.y) >= 2 * NPC_R + 1, `${what}: two on one spot`);
  }
});

test('whoever a local serves stands in front of its station, the next beside, on free floor workstations keep off, reachable from the way in', () => {
  const w = trio(mines);
  const room = plan(w);
  const door = room.L.slots.find((s) => s.kind === 'entrance')!.spot;
  let pairs = 0;
  for (const p of room.npcs) {
    for (const s of [p.front, p.wait]) {
      if (!s) continue;
      for (const q of room.props) assert.ok(!near(footprint(q), s, 1.2), `local ${p.k}: served on a prop`);
      for (const d of room.desks) assert.ok(!near(deskZone(d), s, 1), `local ${p.k}: served under a workstation`);
      assert.ok(room.nav.find(door, s), `local ${p.k}: whoever it serves cannot get there from the way in`);
    }
    if (p.front && p.wait) pairs++;
  }
  assert.ok(room.npcs.find((p) => w.npcs![p.k].name === 'pourer')!.front, 'nowhere to be served a drink');
  assert.ok(pairs >= 1, 'nowhere to wait beside a counter');
});

test("a world's shell finds the same furniture with its locals as without: they are placed after the decor", () => {
  for (const id of ['club', 'office', 'vault', 'meadhall']) {
    const w = getTheme(id)!;
    const L = planLayout(375, 200, id);
    const bare = planRoom({ ...w, npcs: [] }, L, hashString(id)).props.map(footprint);
    assert.deepEqual(planRoom(trio(w), L, hashString(id)).props.map(footprint), bare, id);
  }
});
