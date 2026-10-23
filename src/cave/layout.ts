import { Rng, hashString } from '../world/rng.ts';
import type { Layout, Slot, SlotKind } from './types.ts';

type Spot = { x: number; y: number };

// ── the prop table ───────────────────────────────────────────────────────
// Floor each prop needs: `len` along its wall, `dep` out from it, both in
// voxels; `at` is where along it the agent stands (default: the middle).
// Sized for 12 px characters.
export type PropSize = { len: number; dep: number; at?: number };

export const PROP_SIZE: Record<SlotKind, PropSize> = {
  write: { len: 11, dep: 7 }, // anvil on a stump, quench bucket
  run: { len: 11, dep: 11 }, // cauldron over a fire pit
  think: { len: 12, dep: 7 }, // altar with candles
  idle: { len: 15, dep: 11 }, // bedroll and campfire
  read: { len: 14, dep: 4 }, // bookshelf
  search: { len: 12, dep: 4 }, // dig face
  web: { len: 9, dep: 9 }, // crystal orb on a pedestal
  entrance: { len: 15, dep: 4, at: 6 }, // tunnel mouth (agents stand before the opening)
};

// Which props back onto which wall. The rest stand out on the floor, where
// the eye lands: run, web and think on a ring round the hub (ISLANDS), idle
// in front of it. Each biome shuffles the wall order and the islands'
// places (see arrangement).
export const WALL_KINDS = { left: ['read', 'entrance'], right: ['write', 'search'] } as const satisfies Record<'left' | 'right', readonly SlotKind[]>;
export const ISLANDS: readonly SlotKind[] = ['run', 'web', 'think'];

// World size clamps: the minimum still fits every prop (the stage pans a
// camera when the canvas is smaller); the maximum keeps the simulation
// cheap on huge terminals.
export const LIMITS = { minSide: 72, maxSide: 256, minH: 34, maxH: 72 } as const;

const MARGIN = 6; // px kept free around the chunk (the stage draws a 6 px border)
const STAND = 4; // voxels between a prop's front and its agent's spot
const FRONT = 3; // floor left free between the last prop and the front cut
const CORNER = 2; // gap between a wall's first prop and the other wall's props
// Islands' distance from the hub, of the floor's side: out from the middle
// in big rooms, where zoomed out the figures round them stay full size
// (RING[1] from RING_SIDES[1] voxels up); nearer in small ones (RING[0] up
// to RING_SIDES[0]), where there is no floor to spare.
const RING = [0.22, 0.33] as const;
const RING_SIDES = [100, 140] as const;
const IDLE_AT = 0.62; // the idle prop's place down the room's diagonal
const APRON = 2; // floor kept clear round an island (agents walk all round it)

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Wall height for a chunk `side` voxels square.
function heightFor(side: number): number {
  return clamp(Math.round(side * 0.42), LIMITS.minH, LIMITS.maxH);
}

// One biome's choreography: each wall's props from the back corner out
// and how the free stretches of that wall share out between them (weights,
// back gap first), each island's preferred angle round the hub (radians; 0
// points down the diagonal toward the viewer, positive to screen right)
// and the side the idle prop is built facing.
export type Arrangement = {
  left: readonly SlotKind[];
  right: readonly SlotKind[];
  gaps: Record<'left' | 'right', readonly number[]>;
  ring: ReadonlyArray<readonly [SlotKind, number]>;
  idle: 'left' | 'right';
};

// Stable per biome id: the four diagonal places round the hub (clear of
// the plazas to either side, of the idle prop in front and of the view of
// it), three of them taken, give or take a little.
export function arrangement(biome = ''): Arrangement {
  const rng = new Rng(hashString(`slots:${biome}`));
  const shuffle = <T>(a: readonly T[]): T[] => {
    const out = [...a];
    for (let i = out.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };
  const places = shuffle([0.25, 0.75, -0.25, -0.75].map((q) => q * Math.PI));
  const kinds = shuffle(ISLANDS);
  // A wider gap at the back than at the front, give or take.
  const gaps = () => [rng.range(1, 1.8), rng.range(0.6, 1.4), rng.range(0.4, 1)];
  return {
    left: shuffle(WALL_KINDS.left),
    right: shuffle(WALL_KINDS.right),
    gaps: { left: gaps(), right: gaps() },
    ring: kinds.map((k, i) => [k, places[i] + rng.range(-0.2, 0.2)] as const),
    idle: rng.chance(0.5) ? 'left' : 'right',
  };
}

// The cave chunk for a canvas: the biggest square chunk whose screen
// footprint, (W + D) px wide and (W + D) / 2 + H tall, fits with a margin,
// clamped to LIMITS, centred on the canvas; its props placed for `biome`
// (see arrangement).
export function planLayout(canvasW: number, canvasH: number, biome = ''): Layout {
  const fits = (s: number) => 2 * s <= canvasW - 2 * MARGIN && s + heightFor(s) <= canvasH - 2 * MARGIN;
  let side: number = LIMITS.maxSide;
  while (side > LIMITS.minSide && !fits(side)) side--;
  const W = side;
  const D = side;
  const H = heightFor(side);
  const T = clamp(Math.round(side / 16), 6, 8);
  const floor = clamp(Math.round(H * 0.17), 6, 10);
  const plan = arrangement(biome);
  const view = { ox: Math.round(canvasW / 2 - (W - D) / 2), oy: Math.round(canvasH / 2 - ((W + D) / 2 - H) / 2) };
  const L: Layout = { W, D, H, T, floor, slots: [], view };
  L.slots.push(
    ...wallSlots('right', plan.right, plan.gaps.right, T, floor, T + PROP_SIZE[plan.left[0]].dep + CORNER, W - FRONT),
    ...wallSlots('left', plan.left, plan.gaps.left, T, floor, T + PROP_SIZE[plan.right[0]].dep + CORNER, D - FRONT),
  );
  L.slots.push(idleSlot(L, plan.idle));
  for (const [kind, angle] of plan.ring) L.slots.push(islandSlot(L, kind, angle));
  return L;
}

// Spaces `kinds` along one wall between `start` and `end`, the free
// stretches before, between and after them shared out by `weights`.
function wallSlots(wall: 'left' | 'right', kinds: readonly SlotKind[], weights: readonly number[], T: number, floor: number, start: number, end: number): Slot[] {
  const total = kinds.reduce((n, k) => n + PROP_SIZE[k].len, 0);
  const sum = weights.reduce((n, w) => n + w, 0);
  const spare = Math.max(0, end - start - total);
  const out: Slot[] = [];
  let pos = start;
  kinds.forEach((kind, i) => {
    pos += (spare * weights[i]) / sum;
    out.push(freeSlot(kind, wall, Math.round(pos), T, floor));
    pos += PROP_SIZE[kind].len;
  });
  return out;
}

// A prop built facing `wall`'s way with its back corner at `along` on that
// wall's axis and `out` on the other (out = T: against the wall).
function freeSlot(kind: SlotKind, wall: 'left' | 'right', along: number, out: number, floor: number): Slot {
  const { len, dep, at = Math.floor(len / 2) } = PROP_SIZE[kind];
  const front = out + dep + STAND;
  return wall === 'right'
    ? { kind, wall, x0: along, y0: out, z0: floor, len, dep, spot: { x: along + at, y: front } }
    : { kind, wall, x0: out, y0: along, z0: floor, len, dep, spot: { x: front, y: along + at } };
}

// The same prop out on the floor, its footprint centred on (cx, cy).
function centred(kind: SlotKind, wall: 'left' | 'right', cx: number, cy: number, floor: number): Slot {
  const { len, dep } = PROP_SIZE[kind];
  const [a, b] = wall === 'right' ? [cx, cy] : [cy, cx];
  return { ...freeSlot(kind, wall, Math.round(a - len / 2), Math.round(b - dep / 2), floor), island: true };
}

// Fits on the floor with its spot, and stays `gap` clear of the other
// slots, the hub and the plazas, and off the yard.
function fits(L: Layout, s: Slot, gap: number): boolean {
  const r = slotRect(s);
  const { x, y } = s.spot;
  if (r.x0 < L.T + gap || r.y0 < L.T + gap || r.x1 > L.W - FRONT || r.y1 > L.D - FRONT) return false;
  if (x < L.T + 2 || y < L.T + 2 || x > L.W - FRONT || y > L.D - FRONT) return false;
  const near = (cx: number, cy: number, d: number) => Math.hypot(clamp(cx, r.x0, r.x1) - cx, clamp(cy, r.y0, r.y1) - cy) < d;
  const h = hub(L);
  if (near(h.x, h.y, 4 + gap) || Math.hypot(x - h.x, y - h.y) < 4) return false;
  for (const p of buildSites(L)) if (near(p.x, p.y, p.r + 2 + gap) || Math.hypot(x - p.x, y - p.y) < p.r + 3) return false;
  const yd = yard(L);
  if (near(yd.x, yd.y, yd.r)) return false;
  for (const o of L.slots) {
    if (overlaps(r, slotRect(o), gap) || inRect(slotRect(o), x, y, 1) || inRect(r, o.spot.x, o.spot.y, 1)) return false;
    if (Math.hypot(o.spot.x - x, o.spot.y - y) < 10) return false;
  }
  return true;
}

const overlaps = (a: Rect, b: Rect, pad: number) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

// idle: in front of the hub, as near the middle of the floor's diagonal
// as it fits; off to one side or further out when it would crowd the hub
// or the yard in front of it.
function idleSlot(L: Layout, wall: 'left' | 'right'): Slot {
  const n = Math.min(L.W, L.D) - L.T;
  const at = (k: number, o: number) => centred('idle', wall, L.T + n * (k + o), L.T + n * (k - o), L.floor);
  const lean = wall === 'right' ? 1 : -1;
  for (const gap of [APRON, 1, 0]) {
    let best: Slot | null = null;
    let cost = Infinity;
    for (let k = IDLE_AT; k < 0.95; k += 0.01) {
      for (const o of [0, 0.03, -0.03, 0.06, -0.06, 0.09, -0.09, 0.12, -0.12, 0.15, -0.15]) {
        const c = k - IDLE_AT + Math.abs(o) * 1.5;
        if (c >= cost) continue;
        const s = at(k, o * lean);
        if (!fits(L, s, gap)) continue;
        best = s;
        cost = c;
      }
    }
    if (best) return best;
  }
  return at(IDLE_AT, 0);
}

// The floor on the diagonal just in front of the hub belongs to life: the
// dance floor, and the critter's home with room to potter about in caves
// that name no spots of their own (see defaultPois).
function yard(L: Layout): { x: number; y: number; r: number } {
  const h = hub(L);
  const g = (Math.min(L.W, L.D) - L.T) * 0.13;
  return { x: h.x + g, y: h.y + g, r: 5 + 6 * clamp((L.W - 72) / 98, 0, 1) };
}

// An island near `angle` round the hub, built facing the middle line of
// the screen (its agent stands toward it): the nearest place that fits,
// keeping off the walkways keepClear() reserves, out of the back third,
// out of line with the other two and out of the way of the view of the
// other free-standing props. Small rooms squeeze: further round or out,
// then with less floor between it and its neighbours.
function islandSlot(L: Layout, kind: SlotKind, angle: number): Slot {
  const h = hub(L);
  const side = Math.min(L.W, L.D) - L.T;
  const keep = keepClear(L);
  const free = L.slots.filter((o) => o.island);
  const ring = free.filter((o) => o.kind !== 'idle');
  const R = RING[0] + (RING[1] - RING[0]) * clamp((L.W - RING_SIDES[0]) / (RING_SIDES[1] - RING_SIDES[0]), 0, 1);
  // Whose view it should keep out of: the wall props' crowds and the
  // builders on the plazas, once the ring is half way out (smaller rooms
  // have no floor to spare for it).
  const roomy = R >= (RING[0] + RING[1]) / 2;
  const walls = roomy ? L.slots.filter((o) => !o.island && o.kind !== 'entrance') : [];
  const plazas = roomy ? buildSites(L) : [];
  for (const gap of [APRON, 1, 0]) {
    let best: Slot | null = null;
    let cost = Infinity;
    for (let dr = -0.12; dr < 0.2; dr += 0.03) {
      for (let da = -Math.PI; da < Math.PI; da += 0.1) {
        const r = side * (R + dr);
        const a = angle + da;
        // Down the diagonal is (1, 1), screen right is (1, -1).
        const cx = h.x + (r * (Math.cos(a) + Math.sin(a))) / Math.SQRT2;
        const cy = h.y + (r * (Math.cos(a) - Math.sin(a))) / Math.SQRT2;
        const s = centred(kind, cx >= cy ? 'right' : 'left', cx, cy, L.floor);
        if (!fits(L, s, gap)) continue;
        const back = Math.max(0, 0.4 - (s.spot.x + s.spot.y - 2 * L.T) / (L.W + L.D - 2 * L.T));
        const lined = ring.length === 2 && area(ring[0].spot, ring[1].spot, s.spot) < (side * 0.12) ** 2;
        const blind = free.filter((o) => hides(s, o) || hides(o, s)).length;
        const masking = walls.filter((o) => masks(s, o.spot, FIGURE / 2)).length + plazas.filter((p) => masks(s, p, p.r * Math.SQRT2)).length;
        const c = crossed(L, keep, s) * 30 + Math.abs(da) * 10 + Math.abs(dr) * 40 + back * 200 + (back > 0.04 ? 60 : 0) + (lined ? 40 : 0) + blind * 40 + masking * 25;
        if (c < cost) {
          cost = c;
          best = s;
        }
      }
    }
    if (best) return best;
  }
  return centred(kind, 'right', h.x + side * R, h.y, L.floor);
}

const area = (a: Spot, b: Spot, c: Spot) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;

// True if `a` stands in front of `b` where the camera would see b past it
// (their screen spans overlap and a is nearer).
function hides(a: Slot, b: Slot): boolean {
  const p = slotRect(a);
  const q = slotRect(b);
  const overlap = p.x0 - p.y1 < q.x1 - q.y0 && q.x0 - q.y1 < p.x1 - p.y0;
  return overlap && p.x0 + p.y0 > q.x0 + q.y0;
}

// True if `s` stands just in front of whoever is at `p`, near enough to
// cover them: their screen spans overlap (`half` either side of p: a
// figure seen zoomed out is about FIGURE voxels across) and it is nearer,
// by less than twice a prop's height.
const FIGURE = 24;
function masks(s: Slot, p: Spot, half: number): boolean {
  const r = slotRect(s);
  const at = p.x - p.y;
  const d = p.x + p.y;
  return r.x0 - r.y1 < at + half && at - half < r.x1 - r.y0 && r.x1 + r.y1 > d && r.x0 + r.y0 - d < 40;
}

// Kept cells under a slot's footprint and apron.
function crossed(L: Layout, keep: Uint8Array, s: Slot): number {
  const r = slotRect(s);
  let n = 0;
  for (let y = r.y0 - APRON; y < r.y1 + APRON; y++) {
    for (let x = r.x0 - APRON; x < r.x1 + APRON; x++) if (keep[x + L.W * y]) n++;
  }
  return n;
}

// ── floor queries ────────────────────────────────────────────────────────
// A slot's floor footprint; x1, y1 exclusive.
export type Rect = { x0: number; y0: number; x1: number; y1: number };

export function slotRect(s: Slot): Rect {
  return s.wall === 'right'
    ? { x0: s.x0, y0: s.y0, x1: s.x0 + s.len, y1: s.y0 + s.dep }
    : { x0: s.x0, y0: s.y0, x1: s.x0 + s.dep, y1: s.y0 + s.len };
}

export function inRect(r: Rect, x: number, y: number, pad = 0): boolean {
  return x >= r.x0 - pad && x < r.x1 + pad && y >= r.y0 - pad && y < r.y1 + pad;
}

// Free stretches [from, to) of a wall's face between its slots, from the
// back corner (T) to the front cut, in the wall's `along` coordinate.
export function wallGaps(L: Layout, wall: 'left' | 'right'): Array<[number, number]> {
  const spans = slotsOn(L, wall)
    .map((s) => [wall === 'right' ? s.x0 : s.y0, s.len] as const)
    .sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let at = L.T;
  for (const [a0, len] of spans) {
    if (a0 > at) out.push([at, a0]);
    at = Math.max(at, a0 + len);
  }
  const end = wall === 'right' ? L.W : L.D;
  if (end > at) out.push([at, end]);
  return out;
}

// The slots backing onto one wall (not the islands built facing its way).
export function slotsOn(L: Layout, wall: 'left' | 'right'): Slot[] {
  return L.slots.filter((s) => s.wall === wall && !s.island);
}

// The open floor in the middle of the cave that agents detour through when
// a straight walk would cut through a prop.
export function hub(L: Layout): { x: number; y: number } {
  return { x: L.T + (L.W - L.T) * 0.55, y: L.T + (L.D - L.T) * 0.55 };
}

// Open plazas where characters build together, one on each side of the
// hub, sized to the world; (x, y) is the centre on the floor, r the radius
// kept flat and clear of decor, pools and fire (see keepClear).
export function buildSites(L: Layout): Array<{ x: number; y: number; r: number }> {
  const r = Math.max(5, Math.min(12, Math.round((Math.min(L.W, L.D) - L.T) * 0.07)));
  const at = (fx: number, fy: number) => ({ x: L.T + (L.W - L.T) * fx, y: L.T + (L.D - L.T) * fy, r });
  return [at(0.32, 0.78), at(0.78, 0.32)];
}

// Floor cells (index x + W * y) to keep clear of decor and pools: every
// slot's footprint padded by a voxel (an island's by its apron, as agents
// walk all round it), a disc around each spot, and the corridors between
// spots where agents walk.
export function keepClear(L: Layout): Uint8Array {
  const { W, D } = L;
  const keep = new Uint8Array(W * D);
  const mark = (cx: number, cy: number, r: number) => {
    for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(D - 1, Math.ceil(cy + r)); y++) {
      for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) keep[x + W * y] = 1;
      }
    }
  };
  for (const s of L.slots) {
    const r = slotRect(s);
    const pad = s.island ? APRON : 1;
    for (let y = Math.max(0, r.y0 - pad); y < Math.min(D, r.y1 + pad); y++) {
      for (let x = Math.max(0, r.x0 - pad); x < Math.min(W, r.x1 + pad); x++) keep[x + W * y] = 1;
    }
    mark(s.spot.x, s.spot.y, 4);
  }
  const spots = L.slots.map((s) => s.spot);
  // Nobody walks straight through a prop (the stage goes round by the hub),
  // so a line that does needs no corridor.
  const rects = L.slots.map(slotRect);
  const blocked = (x: number, y: number) => rects.some((r) => x > r.x0 + 0.5 && x < r.x1 - 0.5 && y > r.y0 + 0.5 && y < r.y1 - 0.5);
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i];
      const b = spots[j];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      const at = (k: number) => [a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n] as const;
      let through = false;
      for (let k = 0; k <= n && !through; k++) through = blocked(...at(k));
      if (!through) for (let k = 0; k <= n; k++) mark(...at(k), 2);
    }
  }
  // The build plazas, and the detour through the middle.
  for (const site of buildSites(L)) mark(site.x, site.y, site.r + 2);
  const h = hub(L);
  mark(h.x, h.y, 4);
  for (const a of spots) {
    const n = Math.ceil(Math.hypot(h.x - a.x, h.y - a.y));
    for (let k = 0; k <= n; k++) mark(a.x + ((h.x - a.x) * k) / n, a.y + ((h.y - a.y) * k) / n, 2);
  }
  return keep;
}

// An elliptical patch of floor centred on (x, y) with radii (rx, ry).
export type Site = { x: number; y: number; rx: number; ry: number };

// Places one patch per requested radius pair (pools, mostly) on open floor
// in front of the work area: clear of `keepClear` cells by `gap` voxels,
// off the walls and the front cuts, apart from each other. Radii shrink
// when nothing fits; a pair that never fits is dropped.
export function openSites(L: Layout, rng: Rng, radii: ReadonlyArray<readonly [number, number]>, gap = 3): Site[] {
  const { W, D, T } = L;
  const keep = keepClear(L);
  // Chebyshev distance from every floor cell to the nearest kept cell.
  const dist = new Int32Array(W * D).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < W * D; i++) {
    if (keep[i] || i % W < T || i < W * T) {
      dist[i] = 0;
      queue.push(i);
    }
  }
  for (let q = 0; q < queue.length; q++) {
    const i = queue[q];
    const x = i % W;
    const y = (i - x) / W;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= D) continue;
        const j = nx + W * ny;
        if (dist[j] < 0) {
          dist[j] = dist[i] + 1;
          queue.push(j);
        }
      }
    }
  }
  // Agents walk inside the hull of their spots; prefer the floor beyond it.
  const reach = Math.max(...L.slots.map((s) => s.spot.x + s.spot.y));
  const out: Site[] = [];
  for (const [rx0, ry0] of radii) {
    for (let shrink = 0; shrink < 4; shrink++) {
      const rx = Math.max(2, rx0 - shrink);
      const ry = Math.max(2, ry0 - shrink);
      const r = Math.max(rx, ry);
      const ok: Array<[number, number]> = [];
      const front: Array<[number, number]> = [];
      for (let y = T + r + 2; y < D - r - 3; y++) {
        for (let x = T + r + 2; x < W - r - 3; x++) {
          if (dist[x + W * y] < r + gap) continue;
          if (out.some((o) => Math.hypot(o.x - x, o.y - y) < Math.max(o.rx, o.ry) + r + 4)) continue;
          ok.push([x, y]);
          if (x + y >= reach + r + 4) front.push([x, y]);
        }
      }
      const pool = front.length ? front : ok;
      if (!pool.length) continue;
      // Near the middle of the free floor, give or take.
      let mx = 0;
      let my = 0;
      for (const [x, y] of pool) {
        mx += x / pool.length;
        my += y / pool.length;
      }
      const spread = Math.max(4, Math.sqrt(pool.length) / 3);
      let best = pool[0];
      let cost = Infinity;
      for (const p of pool) {
        const c = Math.hypot(p[0] - mx, p[1] - my) + rng.range(0, spread);
        if (c < cost) {
          cost = c;
          best = p;
        }
      }
      out.push({ x: best[0], y: best[1], rx, ry });
      break;
    }
  }
  return out;
}
