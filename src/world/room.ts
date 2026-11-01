import type { NpcPlace, PropArt, WorldDef } from '../worlds/types.ts';
import { supplyFor } from './build.ts';
import { deskCap, keepOut, planDesks } from './desks.ts';
import type { Rect } from './layout.ts';
import { boxCount, buildSites, hub, keepClear, wallGaps, yard } from './layout.ts';
import { NPC_R, cutOf, facingOf } from './npc-place.ts';
import { NavGrid } from './path.ts';
import { Rng, hashString } from './rng.ts';
import type { Desk, Facing, Layout, Poi, Slot, SlotKind, Spot } from './types.ts';

// The furnished room: every station slot holding its world's prop, decor
// along the walls and on the floor by them and by the stations (clear of
// the walkways, plazas and the yard), the routing grid round all of it,
// the spots idle characters like, the supply piles builders fetch from,
// and the places on the open floor left where workstations go up (see
// desks.ts).

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

// A local placed in the room (see WorldDef.npcs and placeNpcs): which of
// its world's it is (`k`), the station it works and its prop (an index
// into `props`), how it stands there (see NpcPlace) on which wall's frame,
// where (x, y on the floor; z its frame lifted onto a seat), where its
// picture is cut (units over its feet, see cutOf) and which way it faces;
// where whoever it serves stands (`front`) and where the next waits
// (`wait`), each null where the floor is not free; the middle of the ring
// a show's crowd stands round (`ring`).
export type PlacedNpc = {
  k: number;
  station: SlotKind;
  prop: number;
  mode: NpcPlace['mode'];
  wall: 'left' | 'right';
  x: number;
  y: number;
  z: number;
  cut?: number;
  facing: Facing;
  front: Spot | null;
  wait: Spot | null;
  ring: Spot;
};

export type Room = {
  L: Layout;
  props: PlacedProp[]; // the stations in slot order, then the decor
  desks: Desk[]; // where workstations go up, pod by pod, each pod's lead's first
  keepOut: Uint8Array; // floor nobody works on (x + W * y): the way in, the plazas, the yard, the spots idlers like, the stations' fronts
  nav: NavGrid; // routing round the props (builds are the stage's to add)
  pois: Poi[];
  supply: Rect[]; // each build plaza's pile (buildSites order)
  height: Float32Array; // how tall the props stand over each floor cell (x + W * y)
  npcs: PlacedNpc[]; // the locals, where each stands (see placeNpcs)
};

export const NAV_CELL = 2; // units per routing cell
export const NAV_PAD = 2; // routing keeps this far from props and builds

// The floor by a station's ends: a step (DESK_GAP) out from either end, by
// its back and by its front, then `steps` - 1 more steps of 3 units further
// along. The nearest of these are kept clear of floor decor (see planRoom).
const DESK_GAP = 2;
export function deskSpots(s: Slot, steps = 3): Spot[] {
  const g = DESK_GAP;
  const at = (u: number, v: number): Spot => (s.wall === 'right' ? { x: s.x0 + u, y: s.y0 + v } : { x: s.x0 + v, y: s.y0 + u });
  const out: Spot[] = [];
  for (const v of [g, s.dep + g]) for (let j = 0; j < steps; j++) out.push(at(s.len + g + 3 * j, v), at(-g - 3 * j, v));
  return out;
}

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
// Floor decor stands with purpose: within NEAR units of a back wall (in
// its corners too) or of a station or another piece, and wholly behind
// the front band, the floor nearest the viewer past FRONT_BAND of W + D
// down the room (about the front third), where it would only stand about
// in the open. A piece with nowhere like that to go is left out.
const NEAR = 4;
const FRONT_BAND = 2 / 3;

// Rooms up to BASE units across (a 100 x 30 terminal's whole screen) get a
// world's decor as it asks; a bigger one gets more (see moreDecor).
export const BASE = 97;
// A piece this many units long or more is a set piece (a hearth, a
// kitchen), and one against a wall that the world asks for once a fixture
// (a sick bay, a phone booth, a snack shelf): a room has the one the world
// asks for, which its shell may dress round (see moreDecor).
const SET = 15;
// The middle of a big room's floor, kept for life, and the floor kept
// clear in front of a piece of decor (see planRoom).
const MIDDLE = 0.3;
const FACE = 8;

// The decor a room bigger than BASE gets over what its world asks for, in
// step with what it has more of: free wall, for the pieces that stand
// against one (the free stretches grow one for one with the side), and
// floor for the rest (by the walls and the stations: a little faster than
// the side). The more go round the world's pieces in turn, in the order it
// lists them, one of each before a second of any, so a big room is
// furnished rather than the same sofa four times; and none more than
// doubles (a sign it asks for once is at most two), so the room keeps its
// world's mix; set pieces and fixtures stay one a room. Pieces for the
// walls first, so the floor's go round them.
export function moreDecor(world: Pick<WorldDef, 'decor'>, L: Layout): Array<{ art: PropArt; place: 'wall' | 'floor' }> {
  const decor = world.decor ?? [];
  if (L.W <= BASE || !decor.length) return [];
  const free = (['left', 'right'] as const).reduce((n, wall) => wallGaps(L, wall).reduce((m, [a, b]) => m + b - a, n), 0);
  const grow = { wall: free / Math.max(1, free - 2 * (L.W - BASE)), floor: (L.W / BASE) ** 1.5 };
  const out: Array<{ art: PropArt; place: 'wall' | 'floor' }> = [];
  for (const place of ['wall', 'floor'] as const) {
    // each piece and how many more it may have (as many as it is asked for)
    const kinds: Array<{ art: PropArt; left: number }> = [];
    let asked = 0;
    for (const d of decor) {
      if (d.place !== place || d.count <= 0) continue;
      asked += d.count;
      if (d.art.len >= SET) continue;
      const k = kinds.find((q) => q.art === d.art);
      if (k) k.left += d.count;
      else kinds.push({ art: d.art, left: d.count });
    }
    if (place === 'wall') for (const q of kinds) if (q.left < 2) q.left = 0;
    let more = Math.round(asked * (grow[place] - 1));
    while (more > 0 && kinds.some((q) => q.left > 0)) {
      for (const q of kinds) {
        if (more <= 0 || q.left <= 0) continue;
        out.push({ art: q.art, place });
        q.left--;
        more--;
      }
    }
  }
  return out;
}

// A stretch of wall, or a patch of floor, kept clear of decor (see
// WorldDef.reserve).
export type Reserve = ReturnType<NonNullable<WorldDef['reserve']>>[number];

// Whether a piece `h` tall on floor `r` stands in front of what a world
// keeps clear: on a kept patch of floor; or before a kept stretch of wall,
// out to its `out`, where it hides the wall over its `z` or, for a stretch
// kept from the floor up (z 0), on the floor before it. In the wall's frame
// (u along it, v out from its face), a piece from v0 to v1 out hides the
// wall from u0 - v1 to u1 - v0, up to h - v0 (see WorldDef.reserve).
export function veils(L: Layout, kept: readonly Reserve[], r: Rect, h: number): boolean {
  for (const k of kept) {
    if (!('wall' in k)) {
      if (clash(r, k, 0)) return true;
      continue;
    }
    const [u0, u1, v0, v1] = k.wall === 'right' ? [r.x0, r.x1, r.y0 - L.T, r.y1 - L.T] : [r.y0, r.y1, r.x0 - L.T, r.x1 - L.T];
    const z = k.z ?? 0;
    if (v0 >= k.out) continue;
    if (z <= 0 && u0 < k.a1 && k.a0 < u1) return true;
    if (u0 - v1 < k.a1 && k.a0 < u1 - v0 && h - v0 > z) return true;
  }
  return false;
}

// True while a world says what it keeps clear (see keptBy): a room planned
// meanwhile (a shell looking where the furniture stands, to place its hero
// piece clear of it) is planned without anything kept clear, so planRoom
// and a world's reserve never ask each other round and round.
let reserving = false;

// What `world` keeps clear in room L (none while one is being asked for).
function keptBy(world: WorldDef, L: Layout): readonly Reserve[] {
  if (!world.reserve || reserving) return [];
  reserving = true;
  try {
    return world.reserve(L);
  } finally {
    reserving = false;
  }
}

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
  const mark = (r: Rect, pad: number, into = keep) => {
    for (let y = Math.max(0, Math.floor(r.y0 - pad)); y < Math.min(D, Math.ceil(r.y1 + pad)); y++) {
      for (let x = Math.max(0, Math.floor(r.x0 - pad)); x < Math.min(W, Math.ceil(r.x1 + pad)); x++) into[x + W * y] = 1;
    }
  };
  const yd = yard(L);
  mark({ x0: yd.x - yd.r, y0: yd.y - yd.r, x1: yd.x + yd.r, y1: yd.y + yd.r }, 1);
  // Kept clear of floor decor too: the way in, across its width out past
  // where arrivals stand, and the floor a step from each station's ends
  // (floor decor likes to stand by the stations, not against them).
  const aside = new Uint8Array(W * D);
  for (const s of L.slots) {
    if (s.kind === 'entrance') {
      mark(s.wall === 'right' ? { x0: s.x0, y0: s.y0, x1: s.x0 + s.len, y1: s.spot.y + 4 } : { x0: s.x0, y0: s.y0, x1: s.spot.x + 4, y1: s.y0 + s.len }, 0, aside);
    } else {
      for (const p of deskSpots(s, 1)) mark({ x0: p.x, y0: p.y, x1: p.x, y1: p.y }, 1.5, aside);
    }
  }
  const rects = () => props.map(footprint);
  const supply = buildSites(L).map((p) => supplyFor(L, p, (r) => !rects().some((q) => clash(q, r, 1))));
  for (const r of supply) mark(r, 1);
  // The locals, before the decor and the spots idlers like, which keep off
  // the floor where one stands and where whoever one serves stands and
  // waits (`held`), as off a station's lanes. Workstations keep off it too,
  // and routing goes round one standing. A piece of decor that would stand
  // there goes to the next place it likes (see onWall and onFloor).
  const arts = world.npcs ?? [];
  const npcs = placeNpcs(world, L, props, supply);
  const stands = npcs.filter((n) => n.mode === 'standing').map((n) => cells(n, NPC_R));
  const served = npcs.filter((n) => arts[n.k].serve).flatMap((n) => [n.front, n.wait]).filter((s): s is Spot => !!s);
  const held = new Uint8Array(W * D);
  for (const r of stands) mark(r, 0, held);
  for (const s of served) mark(cells(s, SERVE_M), 0, held);
  const clearOf = (mask: Uint8Array, r: Rect) => {
    for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (mask[x + W * y]) return false;
    return true;
  };
  const free = (r: Rect) => {
    if (r.x0 < L.T || r.y0 < L.T || r.x1 > W - 2 || r.y1 > D - 2) return false;
    return clearOf(keep, r) && !rects().some((q) => clash(q, r, 1));
  };
  const open = (r: Rect) => clearOf(held, r);
  // Who tall floor decor must not stand in front of.
  const watched: Array<Spot & { r: number }> = [...L.slots.filter((s) => s.kind !== 'entrance').map((s) => ({ ...s.spot, r: 4 })), ...buildSites(L)];
  const hides = (r: Rect) => watched.some((p) => r.x0 - r.y1 < p.x - p.y + p.r + 6 && p.x - p.y - p.r - 6 < r.x1 - r.y0 && r.x0 + r.y0 > p.x + p.y && r.x0 + r.y0 - (p.x + p.y) < 40);
  // The world's hero walls and floor, kept clear (see veils).
  const kept = keptBy(world, L);
  let k = 0;
  const put = (art: PropArt, place: 'wall' | 'floor', open: (r: Rect) => boolean, by = props) => {
    const pseed = hashString(`${world.id}:decor:${k}`);
    const fine = (r: Rect) => free(r) && !veils(L, kept, r, art.height);
    const placed = place === 'wall' ? onWall(L, art, fine, open, rng, k) : onFloor(L, art, keep.map((c, i) => c | aside[i]), fine, open, art.height > TALL ? hides : () => false, props, rng, by);
    k++;
    if (!placed) return;
    const p: PlacedProp = { art, ...placed, len: art.len, dep: art.dep, seed: pseed };
    props.push(p);
    mark(footprint(p), 1);
  };
  for (const d of world.decor ?? []) for (let n = 0; n < d.count; n++) put(d.art, d.place, open);
  // A big room's more (see moreDecor), after all the world asks for, so
  // that stands where it would in a room BASE across. These line the back
  // walls: by a wall, or by a station or a piece backed onto one (never
  // out by the islands, or by a piece out on the floor, where they would
  // only stand about or be hidden), and keep off where a local that
  // serves nobody is come up to for a word; off the floor FACE units in
  // front of each piece already down (where one goes up to it: the spots
  // by a hearth, a look at a cabinet), so none hides another; and off the
  // middle of the floor (MIDDLE of it across, round the hub), where a big
  // room's life goes on: a club's dance floor, the crowds at the islands.
  const more = moreDecor(world, L);
  if (more.length) {
    const word = held.slice();
    for (const n of npcs) for (const s of [n.front, n.wait]) if (s && !arts[n.k].serve) mark(cells(s, SERVE_M), 0, word);
    for (const p of props) if (!p.slot) mark(footprint({ ...p, y0: p.wall === 'right' ? p.y0 + p.dep : p.y0, x0: p.wall === 'right' ? p.x0 : p.x0 + p.dep, dep: FACE }), 0, word);
    const h = hub(L);
    const m = (MIDDLE / 2) * (Math.min(W, D) - L.T);
    mark({ x0: h.x - m, y0: h.y - m, x1: h.x + m, y1: h.y + m }, 0, word);
    for (const d of more) put(d.art, d.place, (r) => clearOf(word, r), props.filter((p) => !p.island));
  }
  const height = new Float32Array(W * D);
  for (const p of props) {
    const r = footprint(p);
    for (let y = Math.max(0, r.y0); y < Math.min(D, r.y1); y++) {
      for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) height[x + W * y] = Math.max(height[x + W * y], p.art.height);
    }
  }
  const all = props.map(footprint);
  const inside = (x: number, y: number, m: number, rs = all) => rs.some((r) => within(r, x, y, m));
  // Where one that serves nobody is come up to for a word (see Locals.near)
  // is not kept clear: none where the decor took it.
  for (const n of npcs) {
    if (arts[n.k].serve) continue;
    if (n.wait && inside(n.wait.x, n.wait.y, SERVE_M)) n.wait = null;
    if (n.front && inside(n.front.x, n.front.y, SERVE_M)) {
      n.front = null;
      n.wait = null;
    }
  }
  // The spots idlers like, on open floor off the props, IDLE_APART from a
  // standing local and off the floor (SERVE_M round each) where whoever one
  // serves stands and waits; the critter's home kept whatever. One that
  // the decor took, in a room over BASE across (with floor to spare, and
  // more decor), moves to the nearest such floor within NUDGE units (else
  // it is left out too), so a big room keeps the spots a smaller one has.
  const apart = (p: Spot, s: Spot, d: number) => Math.hypot(p.x - s.x, p.y - s.y) >= d;
  const fit = (p: Poi, rs = all) =>
    p.x > L.T &&
    p.y > L.T &&
    p.x < W - 1 &&
    p.y < D - 1 &&
    !inside(p.x, p.y, 1, rs) &&
    (p.kind === 'pet' || (npcs.every((n) => n.mode !== 'standing' || apart(p, n, IDLE_APART)) && served.every((s) => apart(p, s, 2 * SERVE_M))));
  const stations = all.slice(0, L.slots.length);
  const pois = (world.pois?.(L) ?? defaultPois(L, props.filter((p) => !p.slot))).flatMap((p) => {
    if (fit(p)) return [p];
    if (L.W <= BASE || !fit(p, stations)) return [];
    const q = NUDGES.map(([dx, dy]) => ({ ...p, x: p.x + dx, y: p.y + dy })).find((s) => fit(s));
    return q ? [q] : [];
  });
  const serves = served.map((s) => cells(s, 0));
  const blocks = [...all, ...stands];
  const blocked = (x: number, y: number, m: number) => blocks.some((r) => within(r, x, y, m));
  const nav = new NavGrid(L.T, L.T, W - 1, D - 1, NAV_CELL, (x, y) => (blocked(x, y, 0.8) ? 2 : blocked(x, y, NAV_PAD) ? 1 : 0));
  const taken = [...all, ...supply, ...stands, ...serves];
  // The places for workstations, their pods turned the room's own way; in
  // a room too small for all of them, turned the other way if that fits
  // more.
  const plan = (s: number) => planDesks(L, taken, height, pois, s);
  let desks = plan(seed);
  if (desks.length < deskCap(L)) {
    const other = plan(seed ^ 1);
    if (other.length > desks.length) desks = other;
  }
  return { L, props, desks, keepOut: keepOut(L, taken, pois), nav, pois, supply, height, npcs };
}

// The whole floor cells within r of s (x1, y1 exclusive): what is handed to
// the floor marks, which count whole cells.
const cells = (s: Spot, r: number): Rect => ({ x0: Math.floor(s.x - r), y0: Math.floor(s.y - r), x1: Math.floor(s.x + r) + 1, y1: Math.floor(s.y + r) + 1 });

// How far out a show's crowd gathers, past where a local serves.
const RING_OUT = 7;
// Whoever a local serves keeps this far from every prop and pile, and
// NPC_R and this from a standing local: the stage's floor to stand on
// (see Stage.standable).
const SERVE_M = 1.2;
// The spots idlers like keep this far from a standing local, as agents keep
// from each other.
const IDLE_APART = 3;
// How far a spot idlers like moves off a big room's more decor (see
// planRoom): the steps it tries, nearest first.
const NUDGE = 6;
const NUDGES: ReadonlyArray<readonly [number, number]> = (() => {
  const out: Array<[number, number]> = [];
  for (let dy = -NUDGE; dy <= NUDGE; dy++) for (let dx = -NUDGE; dx <= NUDGE; dx++) if ((dx || dy) && Math.hypot(dx, dy) <= NUDGE) out.push([dx, dy]);
  return out.sort((a, b) => Math.hypot(...a) - Math.hypot(...b));
})();

// Where each of the world's locals stands (see WorldDef.npcs), in the room
// with only its stations and supply piles in (the decor goes round them):
// one behind its counter or seated, inside its station where its art
// says; one standing, where its art says if that floor is free (on the
// floor NPC_R in from its front cut, NPC_R clear of every station and
// supply pile and off the plazas, 3 from the stations' spots (8 from the
// way in's), no more than NPC_R into the yard (a station may stand at its
// edge), 5 off the hub, apart from the other standing ones and off where
// those placed before it serve), else left out. Whoever it serves stands a
// step out in front of it (past its station's front for one inside it),
// the next a step along, each where the floor is free and off every
// standing local placed before it (else none): no local's counter is
// blocked by another's. A show's crowd rings a point further out.
function placeNpcs(world: WorldDef, L: Layout, props: readonly PlacedProp[], supply: readonly Rect[]): PlacedNpc[] {
  const rects = [...props.map(footprint), ...supply];
  const plazas = buildSites(L);
  const h = hub(L);
  const yd = yard(L);
  const arts = world.npcs ?? [];
  // On the floor, `edge` in from its front cut, m clear of every station
  // and pile and `plaza` off the plazas.
  const clear = (s: Spot, m: number, plaza: number, edge: number) =>
    s.x >= L.T + 1 && s.y >= L.T + 1 && s.x <= L.W - edge && s.y <= L.D - edge && !rects.some((r) => within(r, s.x, s.y, m)) && plazas.every((b) => Math.hypot(b.x - s.x, b.y - s.y) >= b.r + plaza);
  const out: PlacedNpc[] = [];
  // Where those placed so far serve (those that do).
  const serves = () => out.filter((o) => arts[o.k].serve).flatMap((o) => [o.front, o.wait]).filter((s): s is Spot => !!s);
  const free = (s: Spot) =>
    clear(s, NPC_R, 2, NPC_R) &&
    L.slots.every((q) => Math.hypot(q.spot.x - s.x, q.spot.y - s.y) >= (q.kind === 'entrance' ? 8 : 3)) &&
    Math.hypot(yd.x - s.x, yd.y - s.y) >= yd.r - NPC_R &&
    Math.hypot(h.x - s.x, h.y - s.y) >= 5 &&
    out.every((o) => o.mode !== 'standing' || Math.hypot(o.x - s.x, o.y - s.y) >= 2 * NPC_R + 1) &&
    serves().every((q) => Math.hypot(q.x - s.x, q.y - s.y) >= NPC_R + SERVE_M);
  arts.forEach((n, k) => {
    const prop = props.findIndex((p) => p.slot?.kind === n.station);
    if (prop < 0) return;
    const p = props[prop];
    const pl = n.place;
    const [x, y] = toWorld(p, pl.u, pl.v, 0);
    if (pl.mode === 'standing' && !free({ x, y })) return;
    const fv = pl.mode === 'standing' ? Math.max(pl.v, p.dep) + 3 : p.dep + 2.5;
    const spot = (u: number): Spot | null => {
      const [sx, sy] = toWorld(p, u, fv, 0);
      const s = { x: sx, y: sy };
      return clear(s, SERVE_M, 1, 2) && out.every((o) => o.mode !== 'standing' || Math.hypot(o.x - sx, o.y - sy) >= NPC_R + SERVE_M) ? s : null;
    };
    // (a step along toward its station's middle where in front of it is
    // not free: past a station's end by the room's front cut, say)
    const fu = [pl.u, pl.u + (pl.u > p.len / 2 ? -4 : 4)].find((u) => spot(u));
    const front = fu === undefined ? null : spot(fu);
    const wait = fu === undefined ? null : (spot(fu + 4) ?? spot(fu - 4));
    const [rx, ry] = toWorld(p, pl.u, fv + RING_OUT, 0);
    const placed: PlacedNpc = { k, station: n.station, prop, mode: pl.mode, wall: p.wall, x, y, z: pl.mode === 'seated' ? pl.z : 0, facing: facingOf(p.wall, pl.look), front, wait, ring: { x: rx, y: ry } };
    const cut = cutOf(pl);
    if (cut !== undefined) placed.cut = cut;
    out.push(placed);
  });
  return out;
}

// Somewhere along a wall's free stretches for `art`, against the wall.
// Walls alternate piece by piece; the place is picked at random among those
// that fit and are `open`, preferring the middle of a stretch (one that
// fits takes its draw, open or not).
function onWall(L: Layout, art: PropArt, free: (r: Rect) => boolean, open: (r: Rect) => boolean, rng: Rng, k: number): { wall: 'left' | 'right'; island: boolean; x0: number; y0: number } | null {
  const first: 'left' | 'right' = (k + (rng.chance(0.5) ? 1 : 0)) % 2 ? 'left' : 'right';
  for (const wall of [first, first === 'left' ? 'right' : 'left'] as const) {
    const fits: Array<{ at: number; c: number }> = [];
    for (const [a0, a1] of wallGaps(L, wall)) {
      for (let at = a0 + 1; at + art.len <= a1 - 1; at++) {
        const p = { wall, x0: wall === 'right' ? at : L.T, y0: wall === 'right' ? L.T : at, len: art.len, dep: art.dep };
        if (!free(footprint(p))) continue;
        const c = Math.abs(at + art.len / 2 - (a0 + a1) / 2) / (a1 - a0) + rng.next() * 0.6;
        if (open(footprint(p))) fits.push({ at, c });
      }
    }
    if (!fits.length) continue;
    const best = fits.reduce((m, f) => (f.c < m.c ? f : m));
    return { wall, island: false, x0: wall === 'right' ? best.at : L.T, y0: wall === 'right' ? L.T : best.at };
  }
  return null;
}

// Somewhere on the floor for `art` by a back wall or a prop (see NEAR and
// FRONT_BAND; one of `by`, if given), turned toward the middle line of the
// screen like the islands; tall pieces out of the view of the crowds and
// plazas. Snug places win, away from the decor already down, give or take,
// among those `open`; null if none fits.
function onFloor(L: Layout, art: PropArt, keep: Uint8Array, free: (r: Rect) => boolean, open: (r: Rect) => boolean, hides: (r: Rect) => boolean, props: readonly PlacedProp[], rng: Rng, by: readonly PlacedProp[] = props): { wall: 'left' | 'right'; island: boolean; x0: number; y0: number } | null {
  const { W, D, T } = L;
  const rects = by.map(footprint);
  const kept = boxCount(keep, W, D);
  // The floor a step past NEAR of a prop (a box round each), for a first
  // look.
  const close = new Uint8Array(W * D);
  const m = NEAR + 1;
  for (const q of rects) {
    for (let y = Math.max(0, q.y0 - m); y < Math.min(D, q.y1 + m); y++) {
      for (let x = Math.max(0, q.x0 - m); x < Math.min(W, q.x1 + m); x++) close[x + W * y] = 1;
    }
  }
  const nearby = boxCount(close, W, D);
  const decor = props.filter((p) => !p.slot).map((p) => {
    const r = footprint(p);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  });
  const band = FRONT_BAND * (W + D);
  let best: { wall: 'left' | 'right'; island: boolean; x0: number; y0: number } | null = null;
  let cost = Infinity;
  for (const wall of ['right', 'left'] as const) {
    const [w, d] = wall === 'right' ? [art.len, art.dep] : [art.dep, art.len];
    for (let y0 = T; y0 + d <= D - 2; y0++) {
      for (let x0 = T; x0 + w <= W - 2; x0++) {
        const r = { x0, y0, x1: x0 + w, y1: y0 + d };
        if (r.x1 + r.y1 > band || (2 * x0 + w >= 2 * y0 + d) !== (wall === 'right') || kept(r)) continue;
        let snug = Math.min(x0, y0) - T;
        if (snug > NEAR && !nearby(r)) continue;
        for (const q of rects) snug = Math.min(snug, gap(r, q));
        if (snug > NEAR) continue;
        const cx = x0 + w / 2;
        const cy = y0 + d / 2;
        let crowd = 0;
        for (const o of decor) crowd += Math.max(0, 1 - Math.hypot(o.x - cx, o.y - cy) / CROWD);
        const c = snug / NEAR + crowd * 3 + rng.next() * 2;
        if (c < cost && free(r) && open(r) && !hides(r)) {
          cost = c;
          best = { wall, island: true, x0, y0 };
        }
      }
    }
  }
  return best;
}

// Decor this many units apart or nearer crowds each other (see onFloor).
const CROWD = 16;

// Units between two footprints (0 if they touch or overlap).
const gap = (a: Rect, b: Rect) => Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));

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
