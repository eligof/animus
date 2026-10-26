import { FIGURE_H } from './frame.ts';
import type { Rect } from './layout.ts';
import { boxCount, buildSites, hub, slotRect, yard } from './layout.ts';
import type { Desk, Layout, Poi, Spot } from './types.ts';

// Workstations: every agent gets one of its own (see Stage), on a place the
// room plans once, here, on the open floor its stations and decor leave
// (see planRoom). Places come in team pods: a row
// of desks side by side (or two rows, one behind the other), all built
// facing the viewer as the islands are, so their agents stand in front of
// them, backs to us; the lead's place first, its subagents' round it. Pods
// keep off the props, the floor just in front of the stations, the way in,
// the plazas and their piles, the yard, the hub, the spots idlers like and
// the ways from the door and the idle prop to the hub; they hide no
// station, spot or plaza from view; a walkway runs round each pod.

// A workstation's footprint (units: `len` along its frame's u, `dep` out
// along v), how tall it may stand, and where its agent stands in its frame:
// a step out from its front, left of its middle as the viewer sees it, so
// the screen on its right stays in view.
export const DESK = { len: 7, dep: 3, height: 10 } as const;
export const DESK_SPOT = { u: 2, v: DESK.dep + 2 } as const;
// Desk to desk along a row of a pod, and a pod's back row to its front
// row: its back row's agents stand between them, in view over the front
// row's desks (see covers).
const PITCH = 10;
const ROW = 13;
// Pod shapes, biggest first: each desk's back corner in its frame (u, v),
// the lead's first, then round it. Five: the lead in the middle of a front
// row of three, two behind in the gaps; or a row of five. Four: two and
// two. Then a row of three, of two, one alone.
const PODS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  [[0, ROW], [-PITCH, ROW], [PITCH, ROW], [-PITCH / 2, 0], [PITCH / 2, 0]],
  [[0, 0], [-PITCH, 0], [PITCH, 0], [-2 * PITCH, 0], [2 * PITCH, 0]],
  [[0, ROW], [PITCH, ROW], [0, 0], [PITCH, 0]],
  [[0, 0], [-PITCH, 0], [PITCH, 0]],
  [[0, 0], [PITCH, 0]],
  [[0, 0]],
];
// In a desk's frame: its footprint, and the floor in front where its
// agent stands (a sharer or two beside it).
const BODY = { u0: 0, v0: 0, u1: DESK.len, v1: DESK.dep };
const STAND = { u0: 0, v0: DESK.dep, u1: DESK.len, v1: DESK_SPOT.v + 1 };
// Floor kept round a pod for walking past it (more in a big room), round
// the spots idlers like, round the plazas and round the way in; how wide
// the ways from the door and the idle prop to the hub are kept; how near
// the front cut a desk's agent stands at most.
const AISLE = [1.5, 4] as const;
const POI_CLEAR = 2;
const PLAZA_CLEAR = 1;
const DOOR_CLEAR = 8;
const WAY = 2;
const FRONT = 2;
// Pods spread out over the floor: each keeps away from those placed
// before, up to this far, as much as it keeps near the front middle.
const SPREAD = 40;

// How many places a room plans at most: a dozen in the smallest room
// (whose floor holds a few), about two dozen in a 150 x 46 terminal's.
export function deskCap(L: Layout): number {
  return Math.round(12 + ((L.W - 72) * 13) / 71);
}

// The desk with its back corner at (x0, y0), built facing `wall`'s way.
export function deskAt(wall: 'left' | 'right', x0: number, y0: number): Omit<Desk, 'pod' | 'lead' | 'index'> {
  const spot = wall === 'right' ? { x: x0 + DESK_SPOT.u, y: y0 + DESK_SPOT.v } : { x: x0 + DESK_SPOT.v, y: y0 + DESK_SPOT.u };
  return { kind: 'desk', wall, island: true, x0, y0, len: DESK.len, dep: DESK.dep, spot };
}

// A rect of a desk's frame (u0..u1, v0..v1 off its back corner), grown by
// `pad`, on the floor in whole cells.
function onFloor(d: Pick<Desk, 'wall' | 'x0' | 'y0'>, z: { u0: number; v0: number; u1: number; v1: number }, pad = 0): Rect {
  const [a0, a1, b0, b1] = [Math.floor(z.u0 - pad), Math.ceil(z.u1 + pad), Math.floor(z.v0 - pad), Math.ceil(z.v1 + pad)];
  return d.wall === 'right' ? { x0: d.x0 + a0, y0: d.y0 + b0, x1: d.x0 + a1, y1: d.y0 + b1 } : { x0: d.x0 + b0, y0: d.y0 + a0, x1: d.x0 + b1, y1: d.y0 + a1 };
}

// The floor a workstation on desk `d` takes: its footprint and where its
// agent stands in front of it.
export function deskZone(d: Pick<Desk, 'wall' | 'x0' | 'y0'>): Rect {
  return onFloor(d, { u0: BODY.u0, v0: BODY.v0, u1: STAND.u1, v1: STAND.v1 });
}

// The floor cells a desk standing there would hide someone at `p` behind:
// in front of them (toward the viewer), across the middle of the figure,
// near enough for a desk DESK.height tall to cover most of it (as the
// stage's `level` judges a spot).
export function covers(p: Spot, each: (x: number, y: number) => void): void {
  const reach = 2 * (DESK.height - 5);
  const px = Math.round(p.x);
  const py = Math.round(p.y);
  for (let dy = 0; dy < reach; dy++) {
    for (let dx = Math.max(0, dy - 3); dx <= dy + 3 && dx + dy < reach; dx++) each(px + dx, py + dy);
  }
}

// Whether someone at `p` is in view: nothing just in front (toward the
// viewer, across the middle of the figure) tall enough to hide most of
// them, as the stage's `level` judges it; `tall` says how tall what stands
// over a floor point is.
function inView(p: Spot, tall: (x: number, y: number) => number): boolean {
  for (let dy = 0; dy <= FIGURE_H; dy++) {
    for (let dx = dy ? 0 : 1; dx <= FIGURE_H; dx++) {
      if (Math.abs(dx - dy) <= 3 && tall(p.x + dx, p.y + dy) > (dx + dy) / 2 + 5) return false;
    }
  }
  return true;
}

// Marking floor cells (x + W * y) of room L: a rect, every cell any of
// which lies within r of c, and a way r wide from a to b.
function marker(L: Layout) {
  const { W, D } = L;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < D;
  const box = (into: Uint8Array, r: Rect) => {
    for (let y = Math.max(0, r.y0); y < Math.min(D, r.y1); y++) for (let x = Math.max(0, r.x0); x < Math.min(W, r.x1); x++) into[x + W * y] = 1;
  };
  const disc = (into: Uint8Array, c: Spot, r: number) => {
    for (let y = Math.floor(c.y - r) - 1; y <= Math.ceil(c.y + r); y++) {
      for (let x = Math.floor(c.x - r) - 1; x <= Math.ceil(c.x + r); x++) {
        if (inside(x, y) && Math.hypot(Math.max(0, x - c.x, c.x - x - 1), Math.max(0, y - c.y, c.y - y - 1)) <= r) into[x + W * y] = 1;
      }
    }
  };
  const way = (into: Uint8Array, a: Spot, b: Spot, r: number) => {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
    for (let k = 0; k <= n; k++) disc(into, { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }, r);
  };
  return { box, disc, way };
}

// The floor of room L nobody works on (x + W * y): the stations and the
// floor just in front of them (3 units round their spots), the way in (8
// round its spot and its approach), the plazas, the yard, the props in
// `taken` and the supply piles, and the spots idlers like (2 round each).
// Neither a workstation's agent stands there nor one sharing it (see
// Stage.share). `wide`: a step further off the islands (where a desk may
// stand, see planDesks).
export function keepOut(L: Layout, taken: readonly Rect[], pois: readonly Poi[], wide = false): Uint8Array {
  const { W, D } = L;
  const { box, disc } = marker(L);
  const m = new Uint8Array(W * D);
  for (const s of L.slots) {
    const r = slotRect(s);
    const pad = wide && s.island ? 2 : 1;
    box(m, { x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad });
    disc(m, s.spot, 3);
    if (s.kind === 'entrance') {
      box(m, { x0: r.x0 - 2, y0: r.y0 - 2, x1: Math.max(r.x1, s.spot.x) + 6, y1: Math.max(r.y1, s.spot.y) + 6 });
      disc(m, s.spot, DOOR_CLEAR);
    }
  }
  for (const r of taken) box(m, { x0: r.x0 - 1, y0: r.y0 - 1, x1: r.x1 + 1, y1: r.y1 + 1 });
  for (const b of buildSites(L)) disc(m, b, b.r + PLAZA_CLEAR);
  const yd = yard(L);
  disc(m, yd, yd.r + 1);
  for (const p of pois) disc(m, p, POI_CLEAR);
  return m;
}

// The places for workstations in room L, furnished with `taken` (every
// prop's footprint and the supply piles; `height`: how tall the props
// stand over each floor cell, x + W * y) and its points of interest named:
// pods placed one at a time, the biggest shape that fits first, each where
// it is cheapest (away from the pods placed before, near the middle of the
// front of the floor, in the room's own frame, snug against what is
// there), up to deskCap. A pod's lead's place is its first.
export function planDesks(L: Layout, taken: readonly Rect[], height: Float32Array, pois: readonly Poi[], seed: number): Desk[] {
  const { W, D, T } = L;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < D;
  const { box, disc, way } = marker(L);
  // Where a desk may not stand (`ground`), and where its agent may not
  // (`floor`, see keepOut); desks keep off the hub and the ways from the
  // door and the idle prop to it too, and a step further off the islands.
  const ground = keepOut(L, taken, pois, true);
  const floor = keepOut(L, taken, pois);
  const both = [ground, floor];
  const h = hub(L);
  for (const s of L.slots) if (s.kind === 'entrance' || s.kind === 'idle') way(ground, s.spot, h, WAY);
  disc(ground, h, 4);
  // Where a desk may not stand either: in front of a station's front
  // corner, a spot idlers like, a plaza or another desk's agent.
  const cover = new Uint8Array(W * D);
  const hide = (p: Spot) =>
    covers(p, (x, y) => {
      if (inside(x, y)) cover[x + W * y] = 1;
    });
  for (const s of L.slots) {
    const r = slotRect(s);
    hide({ x: r.x1, y: r.y1 });
  }
  for (const p of pois) hide(p);
  for (const b of buildSites(L)) hide(b);
  // How tall what stands on the floor is so far, desks too: no desk's
  // agent may be hidden.
  const stood = height.slice();
  const aisle = AISLE[0] + (AISLE[1] - AISLE[0]) * Math.max(0, Math.min(1, (W - 72) / 71));
  const out: Desk[] = [];
  const cap = deskCap(L);
  // The middle of the front of the floor, and the room's own frame (every
  // pod turned alike reads tidiest).
  const goal = { x: T + (W - T) * 0.62, y: T + (D - T) * 0.62 };
  const own: 'left' | 'right' = seed & 1 ? 'left' : 'right';
  type Pod = { wall: 'left' | 'right'; at: Array<[number, number]>; cost: number };
  // Where each pod placed so far stands, about.
  const centres: Spot[] = [];
  // Each place a lone desk fits (its back corner at x + W * y), by wall,
  // and how snug it stands there (0: it does not fit); worked out afresh
  // where a pod has just gone down.
  const fit = { right: new Float32Array(W * D), left: new Float32Array(W * D) };
  let stale = { x0: T, y0: T, x1: W, y1: D };
  for (let pod = 0; out.length < cap; pod++) {
    const free = boxCount(ground, W, D);
    const open = boxCount(floor, W, D);
    const hidden = boxCount(cover, W, D);
    for (const wall of ['right', 'left'] as const) {
      for (let y = Math.max(T, stale.y0); y < Math.min(D, stale.y1); y++) {
        for (let x = Math.max(T, stale.x0); x < Math.min(W, stale.x1); x++) {
          const d = { wall, x0: x, y0: y };
          const s = onFloor(d, STAND);
          const ok = s.x1 <= W - FRONT && s.y1 <= D - FRONT && !free(onFloor(d, BODY, 0.5)) && !hidden(onFloor(d, BODY)) && !open(s);
          fit[wall][x + W * y] = ok ? 1 + free(onFloor(d, BODY, 1.5)) : 0;
        }
      }
    }
    let found: Pod | null = null;
    for (const shape of PODS) {
      if (out.length + shape.length > cap) continue;
      const fits: Pod[] = [];
      for (const wall of ['right', 'left'] as const) {
        const one = fit[wall];
        // Each desk's offset on the floor from the pod's anchor, and where
        // the pod's agents stand on average from it.
        const offs = shape.map(([u, v]) => (wall === 'right' ? [u, v] : [v, u]));
        const sx = offs.reduce((n, [x]) => n + x, 0) / offs.length + (wall === 'right' ? DESK_SPOT.u : DESK_SPOT.v);
        const sy = offs.reduce((n, [, y]) => n + y, 0) / offs.length + (wall === 'right' ? DESK_SPOT.v : DESK_SPOT.u);
        for (let ay = T; ay < D; ay++) {
          for (let ax = T; ax < W; ax++) {
            let snug = 0;
            for (const [dx, dy] of offs) {
              const x = ax + dx;
              const y = ay + dy;
              const k = x >= T && y >= T && x < W && y < D ? one[x + W * y] : 0;
              if (!k) {
                snug = -1;
                break;
              }
              snug += k - 1;
            }
            if (snug < 0) continue;
            const cx = ax + sx;
            const cy = ay + sy;
            let alone = SPREAD;
            for (const c of centres) alone = Math.min(alone, Math.hypot(c.x - cx, c.y - cy));
            const cost = Math.hypot(cx - goal.x, cy - goal.y) / 2 - 2 * alone + (wall === own ? 0 : 12) - snug / offs.length;
            fits.push({ wall, at: offs.map(([dx, dy]) => [ax + dx, ay + dy]), cost });
          }
        }
      }
      fits.sort((a, b) => a.cost - b.cost);
      // The cheapest whose agents nothing hides: no desk standing, nor one
      // of its own.
      found =
        fits.find((p) => {
          const mine = new Uint8Array(W * D);
          for (const [x, y] of p.at) box(mine, onFloor({ wall: p.wall, x0: x, y0: y }, BODY));
          const tall = (x: number, y: number) => {
            const i = Math.floor(x) + W * Math.floor(y);
            return !inside(Math.floor(x), Math.floor(y)) ? 0 : mine[i] ? Math.max(DESK.height, stood[i]) : stood[i];
          };
          return p.at.every(([x, y]) => inView(deskAt(p.wall, x, y).spot, tall));
        }) ?? null;
      if (found) break;
    }
    if (!found) break;
    const wall = found.wall;
    centres.push(found.at.map(([x, y]) => deskAt(wall, x, y).spot).reduce((c, p, k, all) => ({ x: c.x + p.x / all.length, y: c.y + p.y / all.length }), { x: 0, y: 0 }));
    // What changed: the pod, its aisle and the reach of its cover, and a
    // desk's length further back (a desk there may no longer fit).
    const far = DESK.len + 2 * (DESK.height - 5) + AISLE[1] + 4;
    const xs = found.at.map(([x]) => x);
    const ys = found.at.map(([, y]) => y);
    stale = { x0: Math.min(...xs) - far, y0: Math.min(...ys) - far, x1: Math.max(...xs) + far, y1: Math.max(...ys) + far };
    found.at.forEach(([x, y], k) => {
      const d = deskAt(wall, x, y);
      out.push({ ...d, pod, lead: k === 0, index: out.length });
      const r = onFloor(d, BODY);
      for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) stood[x + W * y] = Math.max(stood[x + W * y], DESK.height);
      for (const m of both) {
        box(m, onFloor(d, BODY, aisle));
        box(m, onFloor(d, STAND, aisle));
      }
      hide(d.spot);
    });
  }
  return out;
}
