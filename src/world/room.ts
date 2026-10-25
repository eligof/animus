import type { PropArt, WorldDef } from '../worlds/types.ts';
import { supplyFor } from './build.ts';
import type { Rect } from './layout.ts';
import { buildSites, hub, keepClear, openSites, wallGaps, yard } from './layout.ts';
import { NavGrid } from './path.ts';
import { Rng, hashString } from './rng.ts';
import type { Layout, Poi, Slot, SlotKind, Spot } from './types.ts';

// The furnished room: every station slot holding its world's prop, decor
// along the walls and out on the floor (clear of the stations, walkways,
// plazas and the yard), the routing grid round all of it, the spots idle
// characters like, and the supply piles builders fetch from.

// A prop placed in the room. Its frame is its wall's (see Slot): on the
// right wall u runs +x along the wall and v +y out from it, on the left wall
// u runs +y and v +x; islands use their wall's frame. (x0, y0) is the back
// corner, `len` x `dep` the footprint, `slot` the station it serves.
export type PlacedProp = {
  art: PropArt;
  wall: 'left' | 'right';
  island: boolean;
  x0: number;
  y0: number;
  len: number;
  dep: number;
  seed: number;
  slot?: Slot;
};

export type Room = {
  L: Layout;
  props: PlacedProp[]; // the stations in slot order, then the decor
  nav: NavGrid; // routing round the props (builds are the stage's to add)
  pois: Poi[];
  supply: Rect[]; // each build plaza's pile (buildSites order)
  height: Float32Array; // how tall the props stand over each floor cell (x + W * y)
};

export const NAV_CELL = 2; // units per routing cell
export const NAV_PAD = 2; // routing keeps this far from props and builds

// Prop-local (u, v, z) to world (x, y, z).
export function toWorld(p: { wall: 'left' | 'right'; x0: number; y0: number }, u: number, v: number, z: number): [number, number, number] {
  return p.wall === 'right' ? [p.x0 + u, p.y0 + v, z] : [p.x0 + v, p.y0 + u, z];
}

// A placed prop's floor footprint; x1, y1 exclusive.
export function footprint(p: { wall: 'left' | 'right'; x0: number; y0: number; len: number; dep: number }): Rect {
  return p.wall === 'right' ? { x0: p.x0, y0: p.y0, x1: p.x0 + p.len, y1: p.y0 + p.dep } : { x0: p.x0, y0: p.y0, x1: p.x0 + p.dep, y1: p.y0 + p.len };
}

const within = (r: Rect, x: number, y: number, m: number) => x > r.x0 - m && x < r.x1 + m && y > r.y0 - m && y < r.y1 + m;
const clash = (a: Rect, b: Rect, pad: number) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

// Tall floor decor (over this many units) stays out of the view of the
// crowds and the plazas.
const TALL = 6;

export function planRoom(world: WorldDef, L: Layout, seed: number): Room {
  const rng = new Rng(seed ^ 0xdec0);
  const props: PlacedProp[] = L.slots.map((s) => ({
    art: world.stations[s.kind],
    wall: s.wall,
    island: !!s.island,
    x0: s.x0,
    y0: s.y0,
    len: s.len,
    dep: s.dep,
    seed: hashString(`${world.id}:${s.kind}`),
    slot: s,
  }));
  const { W, D } = L;
  // Floor kept clear of decor: the stations' walkways and plazas, the yard
  // in front of the hub, and the supply piles.
  const keep = keepClear(L);
  const mark = (r: Rect, pad: number) => {
    for (let y = Math.max(0, Math.floor(r.y0 - pad)); y < Math.min(D, Math.ceil(r.y1 + pad)); y++) {
      for (let x = Math.max(0, Math.floor(r.x0 - pad)); x < Math.min(W, Math.ceil(r.x1 + pad)); x++) keep[x + W * y] = 1;
    }
  };
  const yd = yard(L);
  mark({ x0: yd.x - yd.r, y0: yd.y - yd.r, x1: yd.x + yd.r, y1: yd.y + yd.r }, 1);
  const rects = () => props.map(footprint);
  const supply = buildSites(L).map((p) => supplyFor(L, p, (r) => !rects().some((q) => clash(q, r, 1))));
  for (const r of supply) mark(r, 1);
  const free = (r: Rect) => {
    if (r.x0 < L.T || r.y0 < L.T || r.x1 > W - 2 || r.y1 > D - 2) return false;
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (keep[x + W * y]) return false;
    return !rects().some((q) => clash(q, r, 1));
  };
  // Who tall floor decor must not stand in front of.
  const watched: Array<Spot & { r: number }> = [...L.slots.filter((s) => s.kind !== 'entrance').map((s) => ({ ...s.spot, r: 4 })), ...buildSites(L)];
  const hides = (r: Rect) => watched.some((p) => r.x0 - r.y1 < p.x - p.y + p.r + 6 && p.x - p.y - p.r - 6 < r.x1 - r.y0 && r.x0 + r.y0 > p.x + p.y && r.x0 + r.y0 - (p.x + p.y) < 40);
  let k = 0;
  for (const d of world.decor ?? []) {
    for (let n = 0; n < d.count; n++, k++) {
      const pseed = hashString(`${world.id}:decor:${k}`);
      const placed = d.place === 'wall' ? onWall(L, d.art, free, rng, k) : onFloor(L, d.art, keep, free, d.art.height > TALL ? hides : () => false, rng);
      if (!placed) continue;
      const p: PlacedProp = { art: d.art, ...placed, len: d.art.len, dep: d.art.dep, seed: pseed };
      props.push(p);
      mark(footprint(p), 1);
    }
  }
  const height = new Float32Array(W * D);
  for (const p of props) {
    const r = footprint(p);
    for (let y = Math.max(0, r.y0); y < Math.min(D, r.y1); y++) {
      for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) height[x + W * y] = Math.max(height[x + W * y], p.art.height);
    }
  }
  const all = props.map(footprint);
  const inside = (x: number, y: number, m: number) => all.some((r) => within(r, x, y, m));
  const nav = new NavGrid(L.T, L.T, W - 1, D - 1, NAV_CELL, (x, y) => (inside(x, y, 0.8) ? 2 : inside(x, y, NAV_PAD) ? 1 : 0));
  const pois = (world.pois?.(L) ?? defaultPois(L, props.filter((p) => !p.slot)))
    .filter((p) => p.x > L.T && p.y > L.T && p.x < W - 1 && p.y < D - 1 && !inside(p.x, p.y, 1));
  return { L, props, nav, pois, supply, height };
}

// Somewhere along a wall's free stretches for `art`, against the wall.
// Walls alternate piece by piece; the place is picked at random among those
// that fit, preferring the middle of a stretch.
function onWall(L: Layout, art: PropArt, free: (r: Rect) => boolean, rng: Rng, k: number): { wall: 'left' | 'right'; island: boolean; x0: number; y0: number } | null {
  const first: 'left' | 'right' = (k + (rng.chance(0.5) ? 1 : 0)) % 2 ? 'left' : 'right';
  for (const wall of [first, first === 'left' ? 'right' : 'left'] as const) {
    const fits: Array<{ at: number; c: number }> = [];
    for (const [a0, a1] of wallGaps(L, wall)) {
      for (let at = a0 + 1; at + art.len <= a1 - 1; at++) {
        const p = { wall, x0: wall === 'right' ? at : L.T, y0: wall === 'right' ? L.T : at, len: art.len, dep: art.dep };
        if (!free(footprint(p))) continue;
        fits.push({ at, c: Math.abs(at + art.len / 2 - (a0 + a1) / 2) / (a1 - a0) + rng.next() * 0.6 });
      }
    }
    if (!fits.length) continue;
    const best = fits.reduce((m, f) => (f.c < m.c ? f : m));
    return { wall, island: false, x0: wall === 'right' ? best.at : L.T, y0: wall === 'right' ? L.T : best.at };
  }
  return null;
}

// Somewhere out on open floor for `art` (see openSites), turned toward the
// middle line of the screen like the islands; tall pieces out of the view
// of the crowds and plazas.
function onFloor(L: Layout, art: PropArt, keep: Uint8Array, free: (r: Rect) => boolean, hides: (r: Rect) => boolean, rng: Rng): { wall: 'left' | 'right'; island: boolean; x0: number; y0: number } | null {
  const r = Math.ceil(Math.max(art.len, art.dep) / 2) + 1;
  const tried = keep.slice();
  for (let tries = 0; tries < 6; tries++) {
    const [site] = openSites(L, rng, [[r, r]], 2, tried);
    if (!site) return null;
    const wall: 'left' | 'right' = site.x >= site.y ? 'right' : 'left';
    const [w, d] = wall === 'right' ? [art.len, art.dep] : [art.dep, art.len];
    const p = { wall, island: true, x0: Math.round(site.x - w / 2), y0: Math.round(site.y - d / 2) };
    const fp = footprint({ ...p, len: art.len, dep: art.dep });
    if (free(fp) && !hides(fp)) return p;
    // Not there: block the patch off and look again.
    for (let y = Math.max(0, site.y - r); y <= Math.min(L.D - 1, site.y + r); y++) {
      for (let x = Math.max(0, site.x - r); x <= Math.min(L.W - 1, site.x + r); x++) tried[x + L.W * y] = 1;
    }
  }
  return null;
}

// ── points of interest for worlds that name none ─────────────────────────
// Warm spots and a seat by the idle prop, views of the web prop and the
// shelves, a drink by the run prop, a look at a few pieces of decor, a
// dance floor at the hub and the critter's spot in the yard in front of it.
export function defaultPois(L: Layout, decor: readonly PlacedProp[] = []): Poi[] {
  const out: Poi[] = [];
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number): Spot => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: { wall: 'left' | 'right'; x0: number; y0: number; len: number; dep: number }): Spot => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const fire = slot('idle');
  if (fire) {
    out.push({ ...at(fire, -9, 2), kind: 'warm', face: mid(fire) });
    out.push({ ...at(fire, 9, 2), kind: 'warm', face: mid(fire) });
    out.push({ ...at(fire, 4, 9), kind: 'seat', face: mid(fire) });
  }
  const web = slot('web');
  if (web) out.push({ ...at(web, 4, 10), kind: 'view', face: mid(web) });
  const shelf = slot('read');
  if (shelf) out.push({ ...at(shelf, -5, 10), kind: 'view', face: mid(shelf) });
  const pot = slot('run');
  if (pot) out.push({ ...at(pot, 10, 3), kind: 'drink', face: mid(pot) });
  for (const p of decor.slice(0, 4)) {
    const [x, y] = toWorld(p, p.len / 2, p.dep + 5, 0);
    out.push({ x, y, kind: 'view', face: mid(p) });
  }
  const h = hub(L);
  const yd = yard(L);
  out.push({ x: h.x + 2, y: h.y - 3, kind: 'dance' });
  out.push({ x: h.x - 3, y: h.y + 2, kind: 'dance' });
  out.push({ x: yd.x, y: yd.y, kind: 'pet' });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

// The tallest prop over (x, y), or 0 on bare floor.
export function heightAt(room: Room, x: number, y: number): number {
  const { W, D } = room.L;
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  return ix < 0 || iy < 0 || ix >= W || iy >= D ? 0 : room.height[ix + W * iy];
}
