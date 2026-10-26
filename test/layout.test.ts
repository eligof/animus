import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ISLANDS, LIMITS, PROP_SIZE, WALL_KINDS, arrangement, buildSites, hub, inRect, keepClear, planLayout, slotRect } from '../src/world/layout.ts';
import { THEMES } from '../src/themes/index.ts';
import type { Layout, SlotKind } from '../src/world/types.ts';

// Canvases measured in units (canvas pixels / pixels per unit).
const SIZES: Array<[number, number]> = [
  [80, 40],
  [184, 99],
  [320, 171],
  [400, 180],
  [1000, 500],
];
const KINDS: SlotKind[] = ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write'];

const big = (cw: number, ch: number) => cw >= 2 * LIMITS.minSide + 12 && ch >= LIMITS.minSide + LIMITS.minH + 12;

test('planLayout sizes the room to the canvas within the clamps', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const tag = `${cw}x${ch}: ${L.W}x${L.D}x${L.H} T${L.T}`;
    assert.ok(L.W >= LIMITS.minSide && L.W <= LIMITS.maxSide && L.D >= LIMITS.minSide && L.D <= LIMITS.maxSide, tag);
    assert.ok(L.H >= LIMITS.minH && L.H <= LIMITS.maxH, tag);
    assert.ok(L.T >= 6 && L.T <= 8, tag);
    // Its screen footprint, (W + D) across and (W + D) / 2 + H down, fits.
    if (big(cw, ch)) assert.ok(L.W + L.D <= cw && (L.W + L.D) / 2 + L.H <= ch, `${tag}: does not fit`);
    else assert.equal(L.W, LIMITS.minSide, `${tag}: a small canvas gets the smallest room`);
  }
  assert.ok(big(320, 171) && big(400, 180) && big(1000, 500));
});

test('bigger canvases get bigger rooms, up to the cap', () => {
  const sides = SIZES.map(([cw, ch]) => planLayout(cw, ch).W);
  for (let i = 1; i < sides.length; i++) assert.ok(sides[i] >= sides[i - 1], sides.join(' '));
  const huge = planLayout(1000, 500);
  assert.equal(huge.W, LIMITS.maxSide);
  assert.ok(huge.H <= LIMITS.maxH, `${huge.H} units tall`);
  assert.equal(huge.H, planLayout(4000, 2000).H);
});

// Every world's layout, and the one for no world in particular.
const WORLDS = ['', ...THEMES.map((t) => t.id)];

test('wall props back onto their walls, the rest stand out on the floor, all inside the room without overlaps', () => {
  for (const [cw, ch] of SIZES) {
    for (const id of WORLDS) {
      const L = planLayout(cw, ch, id);
      const tag = `${cw}x${ch} ${id}`;
      assert.deepEqual(L.slots.map((s) => s.kind).sort(), KINDS, tag);
      for (const s of L.slots) {
        const r = slotRect(s);
        assert.ok(r.x0 >= L.T && r.y0 >= L.T && r.x1 <= L.W && r.y1 <= L.D, `${tag}: ${s.kind} off the floor`);
        assert.equal(s.len, PROP_SIZE[s.kind].len);
        assert.equal(s.dep, PROP_SIZE[s.kind].dep);
        if (s.island) {
          assert.ok(ISLANDS.includes(s.kind) || s.kind === 'idle', `${tag}: ${s.kind} out on the floor`);
          assert.ok(r.x0 > L.T + 1 && r.y0 > L.T + 1 && r.x1 < L.W - 1 && r.y1 < L.D - 1, `${tag}: ${s.kind} against a wall or the front cut`);
        } else {
          assert.equal(s.wall === 'right' ? s.y0 : s.x0, L.T, `${tag}: ${s.kind} not against its wall`);
          assert.ok((WALL_KINDS[s.wall] as readonly string[]).includes(s.kind), `${tag}: ${s.kind} on the ${s.wall} wall`);
        }
      }
      for (let i = 0; i < L.slots.length; i++) {
        for (let j = i + 1; j < L.slots.length; j++) {
          const a = slotRect(L.slots[i]);
          const b = slotRect(L.slots[j]);
          const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
          assert.ok(!overlap, `${tag}: ${L.slots[i].kind} overlaps ${L.slots[j].kind}`);
        }
      }
    }
  }
});

test('islands keep off the hub, the plazas and the walkways, and out of the view of each other', () => {
  for (const [cw, ch] of SIZES) {
    for (const id of WORLDS) {
      const L = planLayout(cw, ch, id);
      const tag = `${cw}x${ch} ${id}`;
      const isles = L.slots.filter((s) => s.island);
      assert.equal(isles.length, ISLANDS.length + 1, tag);
      const h = hub(L);
      // The walkways between the props on the walls, to the hub and the plazas.
      const ways = keepClear({ ...L, slots: L.slots.filter((s) => !s.island) });
      const roomy = L.W >= 100;
      for (const s of isles) {
        const r = slotRect(s);
        const near = (x: number, y: number) => Math.hypot(Math.max(r.x0, Math.min(x, r.x1)) - x, Math.max(r.y0, Math.min(y, r.y1)) - y);
        assert.ok(near(h.x, h.y) >= 4, `${tag}: ${s.kind} on the hub`);
        for (const p of buildSites(L)) assert.ok(near(p.x, p.y) >= p.r + 2, `${tag}: ${s.kind} on a plaza`);
        if (!roomy) continue;
        let crossed = 0;
        for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) crossed += ways[x + L.W * y];
        assert.equal(crossed, 0, `${tag}: ${s.kind} stands on a walkway`);
        for (const o of isles) {
          if (o === s) continue;
          const q = slotRect(o);
          assert.ok(Math.max(q.x0 - r.x1, r.x0 - q.x1, q.y0 - r.y1, r.y0 - q.y1) >= 2, `${tag}: ${s.kind} crowds ${o.kind}`);
        }
      }
    }
  }
});

test('the crowd is drawn out from the back walls: idle at the front, islands round the middle', () => {
  const u = (L: Layout, x: number, y: number) => (x + y - 2 * L.T) / (L.W + L.D - 2 * L.T);
  for (const [cw, ch] of SIZES) {
    for (const id of WORLDS) {
      const L = planLayout(cw, ch, id);
      const tag = `${cw}x${ch} ${id}`;
      const idle = L.slots.find((s) => s.kind === 'idle')!;
      const r = slotRect(idle);
      assert.ok(idle.island && u(L, (r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2) >= 0.55, `${tag}: idle not in the front half`);
      const isles = L.slots.filter((s) => ISLANDS.includes(s.kind));
      assert.ok(isles.every((s) => s.island), `${tag}: an island on a wall`);
      // The smallest rooms have nowhere else for the last one.
      const back = isles.filter((s) => u(L, s.spot.x, s.spot.y) < 0.36).length;
      assert.ok(back <= (L.W < 100 ? 1 : 0), `${tag}: ${back} islands at the back`);
      // Spread round the hub, not in a line: the three span a real triangle.
      const [a, b, c] = isles.map((s) => s.spot);
      const area = Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
      assert.ok(area > ((L.W - L.T) * 0.1) ** 2, `${tag}: islands in a line (area ${area})`);
    }
  }
});

// Big rooms (174, 216 and 256 units).
const BIG: Array<[number, number]> = [[360, 260], [500, 300], [1000, 500]];

test('in big rooms the islands stand well out from the hub, clear of the view of the wall crowds and the plazas', () => {
  // Just in front of p (the camera looks in along -x -y), close enough to
  // cover someone there, within `half` across the screen.
  const masks = (r: ReturnType<typeof slotRect>, p: { x: number; y: number }, half: number) =>
    r.x0 - r.y1 < p.x - p.y + half && p.x - p.y - half < r.x1 - r.y0 && r.x1 + r.y1 > p.x + p.y && r.x0 + r.y0 - (p.x + p.y) < 40;
  for (const [cw, ch] of BIG) {
    for (const id of WORLDS) {
      const L = planLayout(cw, ch, id);
      const tag = `${cw}x${ch} ${id}`;
      const h = hub(L);
      const side = Math.min(L.W, L.D) - L.T;
      const isles = L.slots.filter((s) => ISLANDS.includes(s.kind));
      const ring = isles.reduce((n, s) => n + Math.hypot(s.spot.x - h.x, s.spot.y - h.y), 0) / isles.length / side;
      assert.ok(ring >= 0.26, `${tag}: islands ${ring.toFixed(3)} of the side from the hub`);
      for (const s of isles) {
        const r = slotRect(s);
        for (const o of L.slots) {
          if (!o.island && o.kind !== 'entrance') assert.ok(!masks(r, o.spot, 12), `${tag}: ${s.kind} hides the ${o.kind} crowd`);
        }
        for (const p of buildSites(L)) assert.ok(!masks(r, p, p.r * Math.SQRT2), `${tag}: ${s.kind} hides a plaza`);
      }
    }
  }
});

test('each world keeps its own wall order and island places, the same every time', () => {
  for (const id of WORLDS) {
    assert.deepEqual(arrangement(id), arrangement(id), id);
    assert.deepEqual(planLayout(400, 180, id).slots, planLayout(400, 180, id).slots, id);
  }
  const orders = new Set(WORLDS.map((id) => JSON.stringify([arrangement(id).left, arrangement(id).right])));
  const rings = new Set(WORLDS.map((id) => arrangement(id).ring.map(([k]) => k).join()));
  assert.ok(orders.size >= 3, `${orders.size} wall orders`);
  assert.ok(rings.size >= 3, `${rings.size} island orders`);
  const spots = new Set(THEMES.map((t) => JSON.stringify(planLayout(400, 180, t.id).slots.map((s) => s.spot))));
  assert.ok(spots.size >= THEMES.length - 2, `${spots.size} layouts for ${THEMES.length} worlds`);
});

test('spots stand on open floor in front of their props, apart from each other', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const tag = `${cw}x${ch}`;
    for (const s of L.slots) {
      const { x, y } = s.spot;
      assert.ok(Number.isInteger(x) && Number.isInteger(y), `${tag}: ${s.kind} spot not on a whole unit`);
      assert.ok(x >= L.T && y >= L.T && x < L.W && y < L.D, `${tag}: ${s.kind} spot off the floor`);
      const out = s.wall === 'right' ? y - s.y0 : x - s.x0;
      assert.ok(out >= s.dep + 2 && out <= s.dep + 6, `${tag}: ${s.kind} spot ${out} out from its back`);
      for (const o of L.slots) assert.ok(!inRect(slotRect(o), x, y), `${tag}: ${s.kind} spot inside ${o.kind}`);
    }
    for (let i = 0; i < L.slots.length; i++) {
      for (let j = i + 1; j < L.slots.length; j++) {
        const a = L.slots[i].spot;
        const b = L.slots[j].spot;
        assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 6, `${tag}: ${L.slots[i].kind} and ${L.slots[j].kind} spots too close`);
      }
    }
  }
});

test('the detour hub and the ways to it are kept clear', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const keep = keepClear(L);
    const h = hub(L);
    assert.equal(keep[Math.floor(h.x) + L.W * Math.floor(h.y)], 1, `${cw}x${ch}: hub not kept clear`);
    for (const s of L.slots) {
      const mx = Math.floor((s.spot.x + h.x) / 2);
      const my = Math.floor((s.spot.y + h.y) / 2);
      assert.equal(keep[mx + L.W * my], 1, `${cw}x${ch}: way from ${s.kind} to the hub not kept clear`);
    }
  }
});

test('build plazas sit on open floor, clear of props and spots, and are kept clear', () => {
  for (const [cw, ch] of SIZES) {
    const L = planLayout(cw, ch);
    const keep = keepClear(L);
    const sites = buildSites(L);
    assert.equal(sites.length, 2);
    for (const s of sites) {
      assert.ok(s.x - s.r > L.T && s.y - s.r > L.T && s.x + s.r < L.W - 1 && s.y + s.r < L.D - 1, `${cw}x${ch}: plaza off the floor`);
      assert.equal(keep[Math.floor(s.x) + L.W * Math.floor(s.y)], 1, `${cw}x${ch}: plaza not kept clear`);
      for (const slot of L.slots) {
        const r = slotRect(slot);
        const nx = Math.max(r.x0, Math.min(s.x, r.x1));
        const ny = Math.max(r.y0, Math.min(s.y, r.y1));
        assert.ok(Math.hypot(s.x - nx, s.y - ny) > s.r, `${cw}x${ch}: plaza overlaps ${slot.kind}`);
        assert.ok(Math.hypot(s.x - slot.spot.x, s.y - slot.spot.y) > s.r + 1, `${cw}x${ch}: plaza covers the ${slot.kind} spot`);
      }
    }
  }
});
