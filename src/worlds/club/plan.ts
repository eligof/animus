import { buildSites, hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import type { Rect } from '../../world/layout.ts';
import { defaultPois, footprint, planRoom, toWorld } from '../../world/room.ts';
import type { PlacedProp } from '../../world/room.ts';
import { hashString } from '../../world/rng.ts';
import type { Layout, Poi } from '../../world/types.ts';
import type { WorldDef } from '../types.ts';
import { DECOR } from './decor.ts';
import { hash } from './kit.ts';
import { NPCS } from './npcs.ts';
import { STATIONS } from './stations.ts';

// Where the club's shell puts things, from the room's size alone (so the
// shell, the overlay and the points of interest agree with the stage): the
// stations (planLayout), the furniture (planRoom, with the stage's seed
// and the club's locals, which it goes round),
// the light-up dance floor on the open floor round the hub, and what goes
// on the free stretches of wall: a mural, a fire exit, and bays of a neon
// sign over posters, a tag or a fuse box.

export type Wall = 'left' | 'right';
export type Low = 'posters' | 'tag' | 'fuse' | 'none';
export type Feature = { wall: Wall; kind: 'mural' | 'exit' | 'bay'; a: number; w: number; k: number; sign: number; low: Low; flaky: boolean };
// The dance floor: n x n tiles of TILE units from (x0, y0).
export type Dance = { x0: number; y0: number; n: number };
export type Plan = { L: Layout; features: Feature[]; dance: Dance | null; decor: PlacedProp[]; sign: { r: number; z: number } };

export const TILE = 4; // a dance-floor tile, units
export const STRIP = 17.5; // the neon strip along the walls, just over the heads
export const PAINT = 6.5; // the black band along the walls' feet
export const TRUSS = 6; // the lighting truss hangs this far under the wall top
// The mural's top on a wall H tall.
export const muralTop = (H: number) => Math.max(STRIP - 1.6, Math.min(28, H * 0.42));

const PLANS = new Map<string, Plan>();

export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'club');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  // The stage plans the room with the world's id as the seed, its locals in.
  const decor = L.slots.length ? planRoom({ id: 'club', stations: STATIONS, decor: DECOR, npcs: NPCS } as WorldDef, L, hashString('club')).props.filter((p) => !p.slot) : [];
  const r = Math.max(3, Math.min(6, 3 + (H - 34) * 0.08));
  const sign = { r, z: STRIP + 3 + r + Math.min(6, Math.max(0, (H - 34) * 0.25)) };
  const plan: Plan = { L, features: [], dance: null, decor, sign };
  plan.dance = danceFloor(L, decor);
  plan.features = features(plan);
  PLANS.set(key, plan);
  return plan;
}

const overlap = (a: Rect, b: Rect, pad: number) => a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;

// The biggest square of tiles that fits round the hub, clear of the
// stations, the furniture and the build plazas, as near the hub as it goes.
function danceFloor(L: Layout, decor: readonly PlacedProp[]): Dance | null {
  if (!L.slots.length) return null;
  const h = hub(L);
  const side = Math.min(L.W, L.D) - L.T;
  const blocks: Array<[Rect, number]> = [
    ...L.slots.map((s) => [slotRect(s), 2] as [Rect, number]),
    ...decor.map((p) => [footprint(p), 1.5] as [Rect, number]),
    ...buildSites(L).map((b) => [{ x0: b.x - b.r, y0: b.y - b.r, x1: b.x + b.r, y1: b.y + b.r }, 1] as [Rect, number]),
  ];
  for (let n = Math.max(3, Math.min(13, Math.floor((side * 0.24) / TILE))); n >= 3; n--) {
    const size = n * TILE;
    let best: Dance | null = null;
    let cost = Infinity;
    for (let dy = -12; dy <= 12; dy++) {
      for (let dx = -12; dx <= 12; dx++) {
        const c = dx * dx + dy * dy;
        if (c >= cost) continue;
        const x0 = Math.round(h.x - size / 2 + dx);
        const y0 = Math.round(h.y - size / 2 + dy);
        const r = { x0, y0, x1: x0 + size, y1: y0 + size };
        if (x0 < L.T + 4 || y0 < L.T + 4 || r.x1 > L.W - 4 || r.y1 > L.D - 4) continue;
        if (blocks.some(([b, pad]) => overlap(r, b, pad))) continue;
        best = { x0, y0, n };
        cost = c;
      }
    }
    if (best) return best;
  }
  return null;
}

// What hangs on the walls between the stations.
function features(plan: Plan): Feature[] {
  const { L } = plan;
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    // furniture against the wall takes its stretch too
    const taken = plan.decor.filter((p) => !p.island && p.wall === wall).map((p) => [wall === 'right' ? p.x0 : p.y0, (wall === 'right' ? p.x0 : p.y0) + p.len] as const);
    for (const [g0, g1] of wallGaps(L, wall)) {
      const cuts = [g0, ...taken.filter(([p0, p1]) => p1 > g0 && p0 < g1).flatMap(([p0, p1]) => [p0, p1]), g1].sort((p, q) => p - q);
      for (let i = 0; i + 1 < cuts.length; i += 2) {
        const a0 = cuts[i] + (cuts[i] <= L.T ? 2 : 2.5);
        const a1 = Math.min(cuts[i + 1], end - 2) - (cuts[i + 1] >= end ? 0 : 2.5);
        if (a1 - a0 >= 6) spans.push({ wall, a0, a1 });
      }
    }
  }
  const split = (s: (typeof spans)[number], c0: number, c1: number) => {
    spans.splice(spans.indexOf(s), 1, { wall: s.wall, a0: s.a0, a1: c0 }, { wall: s.wall, a0: c1, a1: s.a1 });
  };
  // The mural on the longest stretch.
  const long = [...spans].sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
  if (long && long.a1 - long.a0 >= 22) {
    const w = Math.min(22, Math.max(16, (long.a1 - long.a0) * 0.35));
    const mid = (long.a0 + long.a1) / 2;
    out.push({ wall: long.wall, kind: 'mural', a: mid, w, k: 1, sign: 0, low: 'none', flaky: false });
    split(long, mid - w / 2 - 3, mid + w / 2 + 3);
  }
  // A fire exit near the front of the wall without the way in.
  const way = L.slots.find((s) => s.kind === 'entrance')?.wall ?? 'left';
  const exits = spans.filter((s) => s.a1 - s.a0 >= 11).sort((p, q) => (p.wall === q.wall ? q.a1 - p.a1 : p.wall !== way ? -1 : 1));
  if (exits[0]) {
    const s = exits[0];
    const a = s.a1 - 4.5;
    out.push({ wall: s.wall, kind: 'exit', a, w: 8, k: 2, sign: 0, low: 'none', flaky: false });
    split(s, a - 4 - 3, a + 4);
  }
  // Bays: a sign over something low, as many as fit, spread evenly.
  const bay = 2 * plan.sign.r + 3;
  const gap = Math.max(5, plan.sign.r * 1.6);
  const LOWS: Low[] = ['posters', 'tag', 'posters', 'fuse', 'posters', 'none', 'tag', 'posters'];
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const count = Math.floor((len + gap) / (bay + gap));
    if (count < 1) {
      if (len >= 6) out.push({ wall: s.wall, kind: 'bay', a: (s.a0 + s.a1) / 2, w: Math.min(len, 8), k: 50 + n, sign: -1, low: 'posters', flaky: false });
      continue;
    }
    const step = len / count;
    for (let i = 0; i < count; i++, n++) {
      const a = s.a0 + step * (i + 0.5);
      out.push({ wall: s.wall, kind: 'bay', a, w: bay, k: 10 + n, sign: (n * 5 + 3) % 12, low: LOWS[n % LOWS.length], flaky: n === 2 });
    }
  }
  return out;
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but the dancing on the dance floor, and a look at the DJ
// from its edge.
export function clubPois(L: Layout): Poi[] {
  const plan = planFor(L.W, L.D, L.H, L.T);
  const out = defaultPois(L, plan.decor);
  const d = plan.dance;
  const kept = d ? out.filter((p) => p.kind !== 'dance') : out;
  if (d) {
    const size = d.n * TILE;
    const c = (fx: number, fy: number) => ({ x: d.x0 + size * fx, y: d.y0 + size * fy, kind: 'dance' as const });
    kept.push(c(0.35, 0.3), c(0.68, 0.38), c(0.3, 0.66), c(0.62, 0.7), c(0.5, 0.5));
    if (d.n >= 6) kept.push(c(0.18, 0.45), c(0.82, 0.58), c(0.45, 0.85));
  }
  const dj = L.slots.find((s) => s.kind === 'write');
  if (dj) {
    const [x, y] = toWorld(dj, dj.len / 2 + 3, dj.dep + 11, 0);
    kept.push({ x, y, kind: 'view', face: { x: toWorld(dj, dj.len / 2, 0, 0)[0], y: toWorld(dj, dj.len / 2, 0, 0)[1] } });
  }
  return kept.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

// Deterministic per-feature noise.
export const fh = (f: Feature, i: number, j = 0) => hash(f.k * 131 + 7, i, j);
