import type { Rng } from '../world/rng.ts';
import type { Layout, Slot, SlotKind } from './types.ts';

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

// Which wall each prop backs onto, from the back corner out to the front.
export const RIGHT_WALL: readonly SlotKind[] = ['write', 'run', 'think', 'idle'];
export const LEFT_WALL: readonly SlotKind[] = ['read', 'search', 'web', 'entrance'];

// World size clamps: the minimum still fits every prop along the walls (the
// stage pans a camera when the canvas is smaller); the maximum keeps the
// simulation cheap on huge terminals.
export const LIMITS = { minSide: 72, maxSide: 170, minH: 34, maxH: 60 } as const;

const MARGIN = 2; // px kept free around the chunk
const STAND = 4; // voxels between a prop's front and its agent's spot
const FRONT = 3; // floor left free between the last prop and the front cut
const CORNER = 2; // gap between a wall's first prop and the other wall's props

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// Wall height for a chunk `side` voxels square.
function heightFor(side: number): number {
  return clamp(Math.round(side * 0.42), LIMITS.minH, LIMITS.maxH);
}

// The cave chunk for a canvas: the biggest square chunk whose screen
// footprint, (W + D) px wide and (W + D) / 2 + H tall, fits with a margin,
// clamped to LIMITS, centred on the canvas.
export function planLayout(canvasW: number, canvasH: number): Layout {
  const fits = (s: number) => 2 * s <= canvasW - 2 * MARGIN && s + heightFor(s) <= canvasH - 2 * MARGIN;
  let side: number = LIMITS.maxSide;
  while (side > LIMITS.minSide && !fits(side)) side--;
  const W = side;
  const D = side;
  const H = heightFor(side);
  const T = clamp(Math.round(side / 16), 6, 8);
  const floor = clamp(Math.round(H * 0.17), 6, 10);
  const slots = [
    ...wallSlots('right', RIGHT_WALL, T, floor, T + PROP_SIZE[LEFT_WALL[0]].dep + CORNER, W - FRONT),
    ...wallSlots('left', LEFT_WALL, T, floor, T + PROP_SIZE[RIGHT_WALL[0]].dep + CORNER, D - FRONT),
  ];
  const view = { ox: Math.round(canvasW / 2 - (W - D) / 2), oy: Math.round(canvasH / 2 - ((W + D) / 2 - H) / 2) };
  return { W, D, H, T, floor, slots, view };
}

// Spaces `kinds` evenly along one wall between `start` and `end`.
function wallSlots(wall: 'left' | 'right', kinds: readonly SlotKind[], T: number, floor: number, start: number, end: number): Slot[] {
  const total = kinds.reduce((n, k) => n + PROP_SIZE[k].len, 0);
  const gap = Math.max(0, (end - start - total) / (kinds.length + 1));
  const out: Slot[] = [];
  let pos = start + gap;
  for (const kind of kinds) {
    const { len, dep, at = Math.floor(len / 2) } = PROP_SIZE[kind];
    const a0 = Math.round(pos);
    const front = T + dep + STAND;
    out.push(
      wall === 'right'
        ? { kind, wall, x0: a0, y0: T, z0: floor, len, dep, spot: { x: a0 + at, y: front } }
        : { kind, wall, x0: T, y0: a0, z0: floor, len, dep, spot: { x: front, y: a0 + at } },
    );
    pos += len + gap;
  }
  return out;
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
  const spans = L.slots
    .filter((s) => s.wall === wall)
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

// Floor cells (index x + W * y) to keep clear of decor and pools: every
// slot's footprint padded by a voxel, a disc around each spot, and the
// corridors between spots where agents walk.
// The open floor in the middle of the cave that agents detour through when
// a straight walk would cut through a prop.
export function hub(L: Layout): { x: number; y: number } {
  return { x: L.T + (L.W - L.T) * 0.55, y: L.T + (L.D - L.T) * 0.55 };
}

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
    for (let y = Math.max(0, r.y0 - 1); y < Math.min(D, r.y1 + 1); y++) {
      for (let x = Math.max(0, r.x0 - 1); x < Math.min(W, r.x1 + 1); x++) keep[x + W * y] = 1;
    }
    mark(s.spot.x, s.spot.y, 4);
  }
  const spots = L.slots.map((s) => s.spot);
  for (let i = 0; i < spots.length; i++) {
    for (let j = i + 1; j < spots.length; j++) {
      const a = spots[i];
      const b = spots[j];
      const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let k = 0; k <= n; k++) mark(a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, 2);
    }
  }
  // The detour through the middle, and the way to it from every spot.
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
