import type { At } from '../../art/iso.ts';
import { frame, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { planLayout, slotRect, slotsOn } from '../../world/layout.ts';
import { hashString } from '../../world/rng.ts';
import type { PlacedProp } from '../../world/room.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import type { RoomArt, RoomView, WorldDef } from '../types.ts';
import { blot, flame, horn, shieldFace, zigzag } from './bits.ts';
import { DECOR, DECOR_ART } from './decor.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, softDot, withAlpha } from './kit.ts';
import { STATIONS } from './stations.ts';

// The Longhall's shell at night, after the great timber halls of the
// north: dark flagstones underfoot with crimson runners on them and rushes
// strewn about; walls of upright planks on a footing of fieldstones, heavy
// carved posts every dozen units holding curved knee braces up to a carved
// beam, crimson swags with gold trim hung along it from post to post and a
// horn sconce with a candle on each post; above the beam, plaster between
// the posts' studs going dark with smoke toward the roof, and a row of
// small high lattice windows onto snow falling on the pines. Between the
// stations hang round shields in plain colours, long plain banners, an elk
// head on a plaque, iron candle rings on wall brackets and bundles of
// drying herbs. The firelight from the hearth, the braziers, the forge and
// the candles lies warm on the floor round them and on the walls nearest
// them; the far stretches fall dark. Every piece sits in a bay between two
// posts, clear of the stations and of what stands against the wall below
// it, worked out from the same plan the stage uses.

type Wall = 'left' | 'right';
type Kind = 'window' | 'hanging' | 'shield' | 'banner' | 'elk' | 'herbs' | 'chandelier';
type Low = Exclude<Kind, 'window' | 'hanging'>;
// A piece on a wall: `a` its middle along the wall, `w` the width it takes
// there (everything it draws on the wall lies within a ± w / 2), z0..z1 how
// high it reaches, `k` a seed.
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number; z0: number; z1: number };
// A crimson runner on the floor, x0..x1 by y0..y1, its length along `along`.
type Runner = { x0: number; y0: number; x1: number; y1: number; along: 'x' | 'y' };
export type Plan = { L: Layout; features: Feature[]; posts: Record<Wall, number[]>; lamps: Record<Wall, number[]>; runners: Runner[] };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const BASE = 5; // the fieldstone footing's top
const PLATE = 0.7; // the sill plate on the footing
const PLANK = 1.7; // an upright wall plank, wide
const PW = 1.8; // a post, wide
const PD = 1.2; // how far a post stands out from the planks
const BAY = 13; // posts about this far apart
const GIRT = 2.2; // the carved beam, tall
const KNEE = 2.9; // a curved knee brace's reach along the beam and down the post
const SAG = 2.4; // a swag's sag under the beam (its foot SAG + 0.6 down)
const CAP = 2.4; // the wall plate along the top, tall
const BEAM_D = 1.8; // how far the carved beam stands out from the planks
const BAND = 6; // a course of flagstones, deep

// The carved beam's underside, by the wall's height.
export const girtZ = (H: number) => Math.min(31, Math.max(22, Math.round(H * 0.46)));
// A post's horn sconce: the horn's middle.
const lampZ = (G: number) => G - 10.6;

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// the decor the stage puts in it, and what hangs on the walls round them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'meadhall');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const decor = decorOf(L);
  const posts = { right: postsOf(T, W), left: postsOf(T, D) };
  const { features, lamps } = hang(L, posts, decor);
  const plan = { L, features, posts, lamps, runners: runners(L, decor) };
  PLANS.set(key, plan);
  return plan;
}

// The posts along a wall from the back corner to the front cut, about BAY
// apart: where each one starts along the wall (each PW wide).
export function postsOf(T: number, end: number): number[] {
  const n = Math.max(2, Math.round((end - T - PW) / BAY));
  const step = (end - T - PW) / n;
  return Array.from({ length: n + 1 }, (_, i) => T + i * step);
}

const WIDTH: Record<Kind, number> = { window: 5.6, hanging: 5.4, shield: 5, banner: 5.6, elk: 8.4, herbs: 4.6, chandelier: 5.2 };
// The hall's caps on the pieces below the beam (over it, windows and long
// banners take turns in every bay).
const CAP_OF: Record<Low, number> = { shield: 6, banner: 4, elk: 1, herbs: 3, chandelier: 3 };
const ORDER: Low[] = ['shield', 'herbs', 'shield', 'banner', 'chandelier', 'shield', 'herbs', 'banner'];

// How high each kind reaches, by the beam's underside G.
function reach(kind: Kind, G: number, H: number): [number, number] {
  if (kind === 'window') return [G + GIRT + 1.6, G + GIRT + 2.5 + WIN.h + 0.6];
  if (kind === 'hanging') return [hangingZ(G, H).bottom - 0.4, hangingZ(G, H).top + 0.5];
  if (kind === 'shield') return [G - 9.8, G - 5.0];
  if (kind === 'banner') return [bannerZ(G).bottom - 0.4, G - 3.2];
  if (kind === 'elk') return [G - 12.6, G - 3.5];
  if (kind === 'herbs') return [G - 9.8, G - 3.8];
  return [G - 9.4, G - 3.4];
}
// A banner's pole, and how far down its cloth reaches.
const bannerZ = (G: number) => ({ top: G - 3.6, bottom: Math.min(14, Math.max(9.5, G - 17)) });
// A long banner's pole under the wall plate, and its foot over the beam.
const hangingZ = (G: number, H: number) => ({ top: H - CAP - 0.9, bottom: Math.max(G + GIRT + 2, H - CAP - 21) });

// What stands against a wall below its pieces: each piece of decor at the
// wall (or on the floor within a few units of it), along a0..a1, as high as
// it hides the wall.
function against(L: Layout, decor: readonly PlacedProp[], wall: Wall): Array<{ a0: number; a1: number; h: number }> {
  const out: Array<{ a0: number; a1: number; h: number }> = [];
  for (const p of decor) {
    const r = footprint(p);
    const off = (wall === 'right' ? r.y0 : r.x0) - L.T;
    if (off > 4) continue;
    out.push({ a0: wall === 'right' ? r.x0 : r.y0, a1: wall === 'right' ? r.x1 : r.y1, h: p.art.height - off / 2 });
  }
  return out;
}

// What hangs in the bays between the posts. Over the beam, out of reach
// of everything standing below, every bay has a small high window or a
// long banner, the two taking turns. Under it, a bay clear of the stations
// (a unit's margin) gets one piece if what stands against the wall there
// is low enough (candle rings and herbs hang clear over anything that
// stands under them): the elk head in the bay nearest the middle of a wall
// with a banner either side of it, a candle ring near the middle of each
// wall, then shields, herbs, banners and more rings in turn (a shield first
// on each wall) up to the hall's caps, the walls taking turns bay by bay. A horn sconce on every post between, clear of
// the stations and of tall pieces against the wall.
function hang(L: Layout, posts: Record<Wall, number[]>, decor: readonly PlacedProp[]): { features: Feature[]; lamps: Record<Wall, number[]> } {
  const G = girtZ(L.H);
  const out: Feature[] = [];
  const lamps: Record<Wall, number[]> = { right: [], left: [] };
  type Bay = { wall: Wall; i: number; c: number; mid: number };
  const bays: Bay[] = [];
  const stations = { right: [] as Array<[number, number]>, left: [] as Array<[number, number]> };
  const stands = { right: against(L, decor, 'right'), left: against(L, decor, 'left') };
  for (const wall of ['right', 'left'] as const) {
    for (const s of slotsOn(L, wall)) {
      const r = slotRect(s);
      stations[wall].push(wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1]);
    }
    const p = posts[wall];
    const end = wall === 'right' ? L.W : L.D;
    for (let i = 0; i + 1 < p.length; i++) bays.push({ wall, i, c: (p[i] + PW + p[i + 1]) / 2, mid: Math.abs((p[i] + PW + p[i + 1]) / 2 - (L.T + end) / 2) });
    // the sconces: posts clear of the stations and of anything tall
    for (let i = 1; i + 1 < p.length; i++) {
      const [a0, a1] = [p[i] - 0.4, p[i] + PW + 0.4];
      if (stations[wall].some(([s0, s1]) => a1 > s0 - 1 && a0 < s1 + 1)) continue;
      if (stands[wall].some((d) => a1 > d.a0 && a0 < d.a1 && d.h > lampZ(G) - 2.6)) continue;
      lamps[wall].push(p[i] + PW / 2);
    }
  }
  const clear = (b: Bay, kind: Kind) => stations[b.wall].every(([s0, s1]) => b.c + WIDTH[kind] / 2 <= s0 - 1 || b.c - WIDTH[kind] / 2 >= s1 + 1);
  const lowEnough = (b: Bay, kind: Kind) => {
    const [z0] = reach(kind, G, L.H);
    const w = WIDTH[kind] / 2 + 0.5;
    const h = stands[b.wall].reduce((m, d) => (d.a1 > b.c - w && d.a0 < b.c + w ? Math.max(m, d.h) : m), 0);
    // candle rings and herbs hang clear over anything below them; the rest
    // want the wall under them bare or nearly
    return h + 1 <= z0 && (kind === 'chandelier' || kind === 'herbs' || h <= 9.5);
  };
  const put = (b: Bay, kind: Kind) => {
    const [z0, z1] = reach(kind, G, L.H);
    out.push({ wall: b.wall, kind, a: b.c, w: WIDTH[kind], k: (b.wall === 'right' ? 100 : 200) + b.i * 7 + out.length, z0, z1 });
  };
  // over the beam: windows and long banners by turns, a window first
  for (const b of bays) put(b, b.i % 2 ? 'hanging' : 'window');
  // under it: the elk head and its banners first
  const left: Record<Low, number> = { ...CAP_OF };
  const taken = new Set<Bay>();
  const can = (b: Bay | undefined, kind: Low): b is Bay => !!b && !taken.has(b) && left[kind] > 0 && clear(b, kind) && lowEnough(b, kind);
  const take = (b: Bay, kind: Low) => {
    put(b, kind);
    taken.add(b);
    left[kind]--;
  };
  const head = [...bays].filter((b) => can(b, 'elk')).sort((p, q) => (p.wall === q.wall ? p.mid - q.mid : p.wall === 'right' ? -1 : 1))[0];
  if (head) {
    take(head, 'elk');
    for (const d of [-1, 1]) {
      const b = bays.find((q) => q.wall === head.wall && q.i === head.i + d);
      if (can(b, 'banner')) take(b, 'banner');
    }
  }
  // a candle ring on each wall, near its middle
  for (const wall of ['right', 'left'] as const) {
    const b = bays.filter((q) => q.wall === wall && can(q, 'chandelier')).sort((p, q) => p.mid - q.mid)[0];
    if (b) take(b, 'chandelier');
  }
  // then the rest, the walls taking turns
  const turns = [...bays].sort((p, q) => p.i - q.i || (p.wall === 'right' ? -1 : 1));
  const first = { right: true, left: true };
  let n = 0;
  for (const b of turns) {
    if (taken.has(b)) continue;
    let kind: Low | undefined;
    if (first[b.wall] && can(b, 'shield')) kind = 'shield';
    for (let j = 0; !kind && j < ORDER.length; j++) {
      const c = ORDER[(n + j) % ORDER.length];
      if (can(b, c)) kind = c;
    }
    if (!kind) continue;
    take(b, kind);
    first[b.wall] = false;
    n++;
  }
  return { features: out, lamps };
}

// The runners: one from the doors straight out into the hall, one along
// the floor before the hearth, one under the long table and one leading
// out from the high seat; each stops short of a station in its way.
function runners(L: Layout, decor: readonly PlacedProp[]): Runner[] {
  const out: Runner[] = [];
  const rects = L.slots.map((s) => ({ s, r: slotRect(s) }));
  const hits = (q: Runner, but?: Slot) => rects.some(({ s, r }) => s !== but && r.x0 < q.x1 + 1 && q.x0 < r.x1 + 1 && r.y0 < q.y1 + 1 && q.y0 < r.y1 + 1);
  const inside = (q: Runner) => q.x0 >= L.T && q.y0 >= L.T && q.x1 <= L.W - 2 && q.y1 <= L.D - 2;
  // a runner in a prop's frame, u0..u1 along it by v0..v1 out from it
  const framed = (p: { wall: Wall; x0: number; y0: number }, u0: number, u1: number, v0: number, v1: number): Runner =>
    p.wall === 'right' ? { x0: p.x0 + u0, x1: p.x0 + u1, y0: p.y0 + v0, y1: p.y0 + v1, along: u1 - u0 >= v1 - v0 ? 'x' : 'y' } : { x0: p.x0 + v0, x1: p.x0 + v1, y0: p.y0 + u0, y1: p.y0 + u1, along: u1 - u0 >= v1 - v0 ? 'y' : 'x' };
  // out from a prop's front, as long as it goes clear (at most len)
  const lead = (p: Slot, u0: number, u1: number, len: number) => {
    for (let l = len; l >= 8; l -= 2) {
      const q = framed(p, u0, u1, p.dep + 0.8, p.dep + 0.8 + l);
      if (inside(q) && !hits(q, p)) return q;
    }
    return null;
  };
  const door = L.slots.find((s) => s.kind === 'entrance');
  const fromDoor = door && lead(door, 4.3, 8.7, Math.round((L.W - L.T) * 0.36));
  if (fromDoor) out.push(fromDoor);
  const pit = decor.find((p) => p.art === DECOR_ART.hearth);
  if (pit) {
    const q = framed(pit, 1, pit.len - 4, pit.dep + 1.6, pit.dep + 5.6);
    if (inside(q) && !hits(q)) out.push(q);
  }
  const table = L.slots.find((s) => s.kind === 'idle');
  if (table) {
    const q = framed(table, -3.5, table.len + 3.5, 3.4, 7.6);
    if (inside(q) && !hits(q, table)) out.push(q);
  }
  const seat = L.slots.find((s) => s.kind === 'think');
  const fromSeat = seat && lead(seat, 4, 8, 14);
  if (fromSeat) out.push(fromSeat);
  return out;
}

// The decor the stage puts in a room this size (planRoom seeded by the
// world's id, as the stage furnishes it).
const FURNISHED = new Map<string, PlacedProp[]>();
function decorOf(L: Layout): PlacedProp[] {
  const key = `${L.W}x${L.D}x${L.H}x${L.T}`;
  let hit = FURNISHED.get(key);
  if (!hit) {
    hit = L.slots.length ? planRoom({ id: 'meadhall', stations: STATIONS, decor: DECOR } as unknown as WorldDef, L, hashString('meadhall')).props.filter((p) => !p.slot) : [];
    FURNISHED.set(key, hit);
  }
  return hit;
}

// What lights the walls: the hearth and the braziers, the forge's coals,
// the candles at the stations and the torch by the doors; each a point
// (world units), how bright it is and how far its light carries.
type Light = { x: number; y: number; z: number; a: number; reach: number; color: Color };
const GLOWS: ReadonlyArray<readonly [SlotKind, number, number, number, number, number]> = [
  ['run', 4.1, 2.9, 4.5, 0.75, 24],
  ['write', 1.6, 2.4, 12, 0.4, 10],
  ['search', 10.6, 2.0, 8.5, 0.4, 10],
  ['read', 11.6, 1.9, 16, 0.36, 9],
  ['think', 1.6, 2.2, 11, 0.36, 9],
  ['idle', 7.5, 5.1, 7, 0.4, 12],
  ['entrance', 2.1, 1.1, 12.6, 0.42, 9],
];
const LIGHTS = new Map<string, Light[]>();
function lightsOf(L: Layout): Light[] {
  const key = `${L.W}x${L.D}x${L.H}x${L.T}`;
  let hit = LIGHTS.get(key);
  if (hit) return hit;
  const at = (p: { wall: Wall; x0: number; y0: number }, u: number, w: number) => (p.wall === 'right' ? { x: p.x0 + u, y: p.y0 + w } : { x: p.x0 + w, y: p.y0 + u });
  hit = [];
  for (const p of decorOf(L)) {
    if (p.art === DECOR_ART.hearth) hit.push({ ...at(p, 8, 4.3), z: 3, a: 0.95, reach: 34, color: '#ff8a3a' });
    else if (p.art === DECOR_ART.brazier) hit.push({ ...at(p, p.len / 2, p.dep / 2), z: 4, a: 0.5, reach: 16, color: '#ff8a3a' });
  }
  for (const [kind, u, w, z, a, reach] of GLOWS) {
    const q = L.slots.find((sl) => sl.kind === kind);
    if (q) hit.push({ ...at(q, u, w), z, a, reach, color: kind === 'run' ? '#ff8a3a' : '#ffa848' });
  }
  LIGHTS.set(key, hit);
  return hit;
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but a drink at either end of the long table rather than
// by the forge; warm before the hearth, found where the stage puts it
// (planRoom seeded by the world's id, as the vault finds its decor), or by
// the table if the room had no wall for the hearth; a look up at a couple
// of the windows.
export function meadhallPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  let out = defaultPois(L).filter((p) => p.kind !== 'drink');
  const table = slot('idle');
  if (table) out.push({ ...at(table, -6, 0), kind: 'drink', face: mid(table) }, { ...at(table, 6, 0), kind: 'drink', face: mid(table) });
  const furnished = planRoom({ id: 'meadhall', stations: STATIONS, decor: DECOR } as unknown as WorldDef, L, hashString('meadhall'));
  const pit = furnished.props.find((p) => p.art === DECOR_ART.hearth);
  if (pit) {
    const r = footprint(pit);
    const face = pit.wall === 'right' ? { x: r.x0 + 8, y: (r.y0 + r.y1) / 2 } : { x: (r.x0 + r.x1) / 2, y: r.y0 + 8 };
    const spots = pit.wall === 'right'
      ? [{ x: face.x - 5, y: r.y1 + 3 }, { x: face.x + 5, y: r.y1 + 3 }, { x: face.x, y: r.y1 + 7 }]
      : [{ x: r.x1 + 3, y: face.y - 5 }, { x: r.x1 + 3, y: face.y + 5 }, { x: r.x1 + 7, y: face.y }];
    out = out.filter((p) => p.kind !== 'warm');
    for (const s of spots) out.push({ ...s, kind: 'warm', face });
  }
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 2)) out.push({ ...pt(f.wall, f.a, 7), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

// ── drawing ────────────────────────────────────────────────────────────────

const wallAt = (P: At, wall: Wall, T: number): At => frame(P, wall, wall === 'right' ? 0 : T, wall === 'right' ? T : 0);
const propAt = (P: At, p: { wall: Wall; x0: number; y0: number }): At => frame(P, p.wall, p.x0, p.y0);

export const room: RoomArt = {
  draw(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const k = new Kit(v.pen, v.at, v.s);
    const walls = (['right', 'left'] as const).map((wall) => ({ wall, k: new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), end: wall === 'right' ? v.W : v.D }));
    v.pen.save();
    floor(k, v, plan);
    for (const w of walls) wallFace(w.k, v, w.end);
    for (const w of walls) frameUp(w.k, v, w.wall, plan);
    for (const w of walls) for (const f of plan.features) if (f.wall === w.wall && w.k.sees(f.a - f.w / 2, -1, f.z0, f.a + f.w / 2, 6, f.z1)) piece(w.k, v, f);
    for (const w of walls) beam(w.k, v, w.wall, w.end, plan);
    for (const w of walls) wallLight(w.k, v, w.wall, w.end, plan);
    for (const w of walls) candles(w.k, v, w.wall, plan);
    shell(k, v);
    v.pen.restore();
  },
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    firelight(v, plan.L);
    for (const f of plan.features) if (f.kind === 'window') snow(new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s), v, f);
    flicker(v, plan);
    v.pen.restore();
  },
};

// The stretch [a0, a1] of a wall the pen can see between z0 and z1 (in
// steps of 8 units), or null: the shell is painted a tile at a time.
function seenAlong(k: Kit, a0: number, a1: number, z0: number, z1: number): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (let a = a0; a < a1; a += 8) {
    const b = Math.min(a1, a + 8);
    if (!k.sees(a, -1, z0, b, 3, z1)) continue;
    lo = Math.min(lo, a);
    hi = Math.max(hi, b);
  }
  return lo < hi ? [lo, hi] : null;
}

// ── floor ──────────────────────────────────────────────────────────────────

// Dark with the night, so the cloaks and fur collars of anyone on them
// read lighter than the stones.
const FLAGS = ['#4d473c', '#534c40', '#474135', '#585145', '#4f4a3c'];

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  if (!k.sees(T, T, 0, W, D, 0)) return;
  // the mortar under it all
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], '#2c2924', 0);
  // Big irregular flagstones in courses along x: a stone the full course
  // deep, or two across it, the near one split again now and then.
  const groups: P3[][][] = FLAGS.map(() => []);
  const g = 0.2;
  for (let r = 0, y0 = T; y0 < D; r++) {
    const y1 = Math.min(D, y0 + BAND - 1 + hash(r, 2) * 2.4);
    const seen = k.sees(T, y0, 0, W, y1, 0);
    const yy = y0;
    y0 = y1;
    if (!seen) continue;
    let x = T - hash(r, 3) * 6;
    let i = 0;
    while (x < W) {
      const len = 3.8 + hash(r, i, 5) * 4.4;
      const x0 = Math.max(T, x);
      const x1 = Math.min(W, x + len);
      if (x1 - x0 > 0.6 && k.sees(x0, yy, 0, x1, y1, 0)) {
        const j = (q: number) => (hash(r, i, q) - 0.5) * 0.5;
        const quad = (a0: number, a1: number, b0: number, b1: number, q: number): P3[] => [
          [Math.max(T, a0 + g + j(q)), Math.max(T, b0 + g + j(q + 1)), 0.01],
          [Math.min(W, a1 - g + j(q + 2)), Math.max(T, b0 + g + j(q + 3)), 0.01],
          [Math.min(W, a1 - g + j(q + 4)), Math.min(D, b1 - g + j(q + 5)), 0.01],
          [Math.max(T, a0 + g + j(q + 6)), Math.min(D, b1 - g + j(q + 7)), 0.01],
        ];
        const ym = yy + (y1 - yy) * (0.38 + hash(r, i, 8) * 0.24);
        // a stone the course deep, or two across it, each of those split
        // again along it now and then (not at the same place)
        const half = (b0: number, b1: number, q: number): P3[][] => {
          if (x1 - x0 < 4.2 || hash(r, i, q + 9) < 0.25) return [quad(x0, x1, b0, b1, q)];
          const xm = x0 + (x1 - x0) * (0.35 + hash(r, i, q + 8) * 0.3);
          return [quad(x0, xm, b0, b1, q), quad(xm, x1, b0, b1, q + 50)];
        };
        const quads = hash(r, i, 7) < 0.5 ? [quad(x0, x1, yy, y1, 10)] : [...half(yy, ym, 10), ...half(ym, y1, 20)];
        for (const [qi, q] of quads.entries()) groups[Math.floor(hash(r, i, 40 + qi) * FLAGS.length)].push(q);
      }
      x += len;
      i++;
    }
  }
  for (const [gi, list] of groups.entries()) {
    if (!list.length) continue;
    pen.beginPath();
    for (const q of list) k.trace(q, 0.4);
    pen.fillStyle = FLAGS[gi];
    pen.fill();
  }
  pen.beginPath();
  for (const list of groups) for (const q of list) k.trace(q, 0.4);
  pen.strokeStyle = withAlpha(INK, 0.6);
  pen.lineWidth = Math.max(0.8, k.thin * 0.7);
  pen.lineJoin = 'round';
  pen.stroke();
  // the worn, lit far edge of each stone
  pen.beginPath();
  for (const list of groups) {
    for (const q of list) {
      const [x0, y0] = k.p(q[0][0] + 0.5, q[0][1] + 0.22, 0.01);
      const [x1, y1] = k.p(q[1][0] - 0.5, q[1][1] + 0.22, 0.01);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = '#9a947f3a';
  pen.lineWidth = Math.max(0.8, 0.16 * s);
  pen.stroke();
  if (k.fine) {
    // cracks across a few stones
    pen.beginPath();
    for (const list of groups) {
      for (const [n, q] of list.entries()) {
        if (hash(n, q.length, Math.round(q[0][0] * 7 + q[0][1] * 13)) > 0.08) continue;
        const [a, b] = [q[0], q[2]];
        const m: P3 = [(a[0] + b[0]) / 2 + 0.4, (a[1] + b[1]) / 2 - 0.3, 0.01];
        const p0 = k.p(a[0] + (b[0] - a[0]) * 0.2, a[1] + (b[1] - a[1]) * 0.15, 0.01);
        const p1 = k.p(...m);
        const p2 = k.p(a[0] + (b[0] - a[0]) * 0.75, a[1] + (b[1] - a[1]) * 0.85, 0.01);
        pen.moveTo(p0[0], p0[1]);
        pen.lineTo(p1[0], p1[1]);
        pen.lineTo(p2[0], p2[1]);
      }
    }
    pen.strokeStyle = withAlpha(INK, 0.45);
    pen.lineWidth = Math.max(0.6, 0.07 * s);
    pen.stroke();
  }
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const sh = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  sh.addColorStop(0, '#1a0e0866');
  sh.addColorStop(0.35, '#1a0e0822');
  sh.addColorStop(0.7, '#1a0e0800');
  sh.addColorStop(1, '#1a0e0826');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], sh, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    if (seenAlong(wk, T, end, 0, 0)) wk.poly([[T, 0, 0.02], [end, 0, 0.02], [end, 3, 0.02], [T, 0 + 3, 0.02]], wk.lgrad([0, 0, 0], [0, 3, 0], [1, 0, 0], [[0, '#1a0e0870'], [0.4, '#1a0e0826'], [1, '#1a0e0800']]), 0);
  }
  for (const r of plan.runners) runner(k, r);
  rushes(k, v, plan);
  // The light on the floor: warm before the hearth and round the braziers,
  // a pool at each lit station, a small one under each sconce.
  for (const p of decorOf(plan.L)) {
    const pk = new Kit(pen, propAt(v.at, p), s);
    if (p.art === DECOR_ART.hearth) {
      if (!pk.sees(-14, -4, 0, p.len + 14, p.dep + 22, 0)) continue;
      pk.pool(8, 5, 22, 20, '#ff8a3a', 0.42);
      pk.pool(8, 6, 12, 9, '#ffb050', 0.4);
    } else if (p.art === DECOR_ART.brazier) {
      if (!pk.sees(-9, -9, 0, p.len + 9, p.dep + 9, 0)) continue;
      pk.pool(p.len / 2, p.dep / 2, 9, 9, '#ff9a48', 0.32);
    }
  }
  const lights: ReadonlyArray<readonly [SlotKind, number, number, number, number, Color, number]> = [
    ['run', 4.5, 4.5, 14, 12, '#ff8a3a', 0.42],
    ['write', 2.4, 4.2, 8, 6.5, '#ffb44a', 0.3],
    ['search', 9.5, 3.2, 8, 6, '#ffb44a', 0.3],
    ['read', 11.5, 3, 7, 5, '#ffb44a', 0.24],
    ['think', 4, 3.5, 9, 7, '#ffb44a', 0.22],
    ['idle', 7.5, 5.5, 13, 9, '#ffb44a', 0.26],
    ['entrance', 1.5, 2.5, 7, 5, '#ffb44a', 0.26],
    ['entrance', 6.5, 3, 8, 5, '#9fc8e8', 0.14],
  ];
  for (const [kind, u, w, ru, rv, color, a] of lights) {
    const q = plan.L.slots.find((sl) => sl.kind === kind);
    if (!q) continue;
    const qk = new Kit(pen, propAt(v.at, q), s);
    if (qk.sees(u - ru, w - rv, 0, u + ru, w + rv, 0)) qk.pool(u, w, ru, rv, color, a);
  }
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    for (const a of plan.lamps[wall]) if (wk.sees(a - 5, 0, 0, a + 5, 6, 0)) wk.pool(a, 2.5, 5, 3.5, '#ffb050', 0.22);
  }
}

// A crimson runner with a gold border and a chain of lozenges down its
// middle, fringed at the ends.
function runner(k: Kit, r: Runner): void {
  if (!k.sees(r.x0, r.y0, 0, r.x1, r.y1, 0)) return;
  const { pen, s } = k;
  const z = 0.04;
  // (along, across) on the runner to the floor
  const P = (a: number, c: number): P3 => (r.along === 'x' ? [a, c, z] : [c, a, z]);
  const [a0, a1, c0, c1] = r.along === 'x' ? [r.x0, r.x1, r.y0, r.y1] : [r.y0, r.y1, r.x0, r.x1];
  const cm = (c0 + c1) / 2;
  k.shadow((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2, (r.x1 - r.x0) * 0.52, (r.y1 - r.y0) * 0.52, 0.16);
  k.poly([P(a0, c0), P(a1, c0), P(a1, c1), P(a0, c1)], C.redDark, k.thin);
  k.poly([P(a0 + 0.3, c0 + 0.3), P(a1 - 0.3, c0 + 0.3), P(a1 - 0.3, c1 - 0.3), P(a0 + 0.3, c1 - 0.3)], '#962e26', 0);
  const bw = Math.max(0.9, 0.22 * s);
  for (const c of [c0 + 0.55, c1 - 0.55]) k.line([P(a0 + 0.55, c), P(a1 - 0.55, c)], '#c99a3a', bw);
  for (const a of [a0 + 0.55, a1 - 0.55]) k.line([P(a, c0 + 0.55), P(a, c1 - 0.55)], '#c99a3a', bw);
  // the lozenges, or a plain stripe when small
  if (k.fine) {
    pen.beginPath();
    const h = (c1 - c0) * 0.22;
    for (let a = a0 + 1.6; a + 1.4 < a1 - 1; a += 2.2) k.trace([P(a, cm), P(a + 1.1, cm - h), P(a + 2.2, cm), P(a + 1.1, cm + h)]);
    pen.fillStyle = '#b57a35';
    pen.fill();
    pen.strokeStyle = '#6a1c16';
    pen.lineWidth = Math.max(0.6, 0.07 * s);
    pen.stroke();
    // the fringe
    pen.beginPath();
    for (const [a, d] of [[a0, -1], [a1, 1]] as const) {
      for (let c = c0 + 0.25; c <= c1 - 0.2; c += 0.35) {
        const [x0, y0] = k.p(...P(a, c));
        const [x1, y1] = k.p(...P(a + d * 0.45, c));
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = '#d8c090';
    pen.lineWidth = Math.max(0.6, 0.07 * s);
    pen.stroke();
  } else k.line([P(a0 + 1.2, cm), P(a1 - 1.2, cm)], '#b57a35', bw);
}

// Rushes strewn on the floor: little drifts of straw (short strokes when
// zoomed in, soft patches when not), kept off the stations and runners.
function rushes(k: Kit, v: RoomView, plan: Plan): void {
  const { pen, s } = k;
  const { W, D, T } = v;
  const rects = [...plan.L.slots.map((q) => footprint(q)), ...plan.runners];
  const n = Math.round(((W - T) * (D - T)) / 380);
  const spots: Array<[number, number, number]> = [];
  for (let i = 0; i < n; i++) {
    const x = T + 2 + hash(i, 61) * (W - T - 4);
    const y = T + 2 + hash(i, 62) * (D - T - 4);
    if (rects.some((r) => x > r.x0 - 1 && x < r.x1 + 1 && y > r.y0 - 1 && y < r.y1 + 1)) continue;
    if (!k.sees(x - 2, y - 2, 0, x + 2, y + 2, 0)) continue;
    spots.push([x, y, i]);
  }
  if (!k.fine) {
    pen.beginPath();
    for (const [x, y, i] of spots) {
      if (hash(i, 63) < 0.45) continue;
      for (let j = 0; j < 2; j++) {
        const a = hash(i, j, 65) * Math.PI;
        const cx = x + (j - 0.5) * 0.8;
        const [x0, y0] = k.p(cx - Math.cos(a) * 0.7, y - Math.sin(a) * 0.7, 0);
        const [x1, y1] = k.p(cx + Math.cos(a) * 0.7, y + Math.sin(a) * 0.7, 0);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = withAlpha(C.rushes, 0.35);
    pen.lineWidth = Math.max(0.7, 0.12 * s);
    pen.lineCap = 'round';
    pen.stroke();
    return;
  }
  for (const [color, alpha] of [[C.rushes, 0.75], ['#a88a46', 0.7]] as const) {
    pen.beginPath();
    for (const [x, y, i] of spots) {
      const m = 2 + Math.floor(hash(i, 66) * 4);
      for (let j = 0; j < m; j++) {
        if ((j & 1) !== (color === C.rushes ? 0 : 1)) continue;
        const a = hash(i, j, 67) * Math.PI;
        const l = 0.6 + hash(i, j, 68) * 0.9;
        const cx = x + (hash(i, j, 69) - 0.5) * 1.6;
        const cy = y + (hash(i, j, 70) - 0.5) * 1.6;
        const [x0, y0] = k.p(cx - Math.cos(a) * l, cy - Math.sin(a) * l, 0);
        const [x1, y1] = k.p(cx + Math.cos(a) * l, cy + Math.sin(a) * l, 0);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = withAlpha(color, alpha);
    pen.lineWidth = Math.max(0.8, 0.12 * s);
    pen.lineCap = 'round';
    pen.stroke();
  }
}

// ── walls ──────────────────────────────────────────────────────────────────

const STONES = [C.stone, C.stoneLight, C.stoneDark, '#76766e'];
const PLANKS = ['#5f4530', '#664a33', '#5a412d', '#6b4f36', '#624731'];

// A wall's face: the fieldstone footing, upright planks up to the beam,
// plaster above it going dark with smoke toward the roof.
function wallFace(k: Kit, v: RoomView, end: number): void {
  const { pen, s } = k;
  const { T, H } = v;
  const G = girtZ(H);
  const span = seenAlong(k, T, end, 0, H);
  if (!span) return;
  const [s0, s1] = [Math.max(T, span[0] - 2), Math.min(end, span[1] + 2)];
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.12) => (lit ? c : shade(c, -d));
  // The footing: rounded grey stones in dark mortar, two courses.
  if (k.sees(s0, -1, 0, s1, 1, BASE)) {
    k.poly([[s0, 0, 0], [s1, 0, 0], [s1, 0, BASE], [s0, 0, BASE]], tone(C.mortar), 0);
    const seed = lit ? 3 : 4;
    const groups: P3[][][] = STONES.map(() => []);
    const rows = [[0.15, 2.45], [2.6, 4.9]] as const;
    for (const [r, [z0, z1]] of rows.entries()) {
      let a = T + (r & 1 ? -1.2 : 0) + hash(seed, r, 71) * 1.5;
      let i = 0;
      while (a < end) {
        const w = 2.2 + hash(seed, r * 97 + i, 72) * 2.4;
        const b = a + w;
        if (b > s0 && a < s1) {
          const j = (q: number) => (hash(seed, r * 97 + i, q) - 0.5) * 0.3;
          const lo = Math.max(T, a + 0.12);
          const hi = Math.min(end, b - 0.12);
          if (hi - lo > 0.6) groups[Math.floor(hash(seed, r * 97 + i, 73) * STONES.length)].push([[lo, 0, z0 + 0.1 + j(1)], [hi, 0, z0 + 0.1 + j(2)], [hi, 0, z1 + j(3)], [lo, 0, z1 + j(4)]]);
        }
        a = b;
        i++;
      }
    }
    for (const [gi, list] of groups.entries()) {
      if (!list.length) continue;
      pen.beginPath();
      for (const q of list) k.trace(q, 0.75);
      pen.fillStyle = tone(STONES[gi]);
      pen.fill();
    }
    pen.beginPath();
    for (const list of groups) {
      for (const q of list) {
        const [x0, y0] = k.p(q[3][0] + 0.45, 0, q[3][2] - 0.35);
        const [x1, y1] = k.p(q[2][0] - 0.55, 0, q[2][2] - 0.35);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = tone('#c9c3ba', 0.2);
    pen.lineWidth = Math.max(0.8, 0.2 * s);
    pen.lineCap = 'round';
    pen.stroke();
    pen.beginPath();
    for (const list of groups) for (const q of list) k.trace(q, 0.75);
    pen.strokeStyle = withAlpha(INK, 0.85);
    pen.lineWidth = k.thin * 0.85;
    pen.lineJoin = 'round';
    pen.stroke();
  }
  // The planks: upright boards from the sill plate to the beam, each its
  // own tone, a dark seam and a lit left edge between them.
  const z0 = BASE + PLATE;
  if (k.sees(s0, -1, z0, s1, 1, G)) {
    const groups: Array<Array<[number, number]>> = PLANKS.map(() => []);
    const seams: number[] = [];
    for (let a = T, i = 0; a < end; a += PLANK, i++) {
      const b = Math.min(end, a + PLANK);
      if (b < s0 || a > s1) continue;
      groups[Math.floor(hash(i, lit ? 5 : 6, 74) * PLANKS.length)].push([a, b]);
      if (a > T) seams.push(a);
    }
    for (const [gi, list] of groups.entries()) {
      if (!list.length) continue;
      pen.beginPath();
      for (const [a, b] of list) k.trace([[a, 0, z0], [b, 0, z0], [b, 0, G], [a, 0, G]]);
      pen.fillStyle = tone(PLANKS[gi]);
      pen.fill();
    }
    // darker at the foot and under the beam
    k.poly([[s0, 0, z0], [s1, 0, z0], [s1, 0, G], [s0, 0, G]], k.vgrad(s0, 0, z0, G, [[0, '#1a0e0855'], [0.25, '#1a0e0800'], [0.8, '#1a0e0800'], [1, '#1a0e0850']]), 0);
    pen.beginPath();
    for (const a of seams) {
      const [x0, y0] = k.p(a, 0, z0);
      const [x1, y1] = k.p(a, 0, G);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = withAlpha(INK, 0.7);
    pen.lineWidth = Math.max(0.9, 0.14 * s);
    pen.lineCap = 'butt';
    pen.stroke();
    pen.beginPath();
    for (const a of seams) {
      const [x0, y0] = k.p(a + 0.2, 0, z0 + 0.3);
      const [x1, y1] = k.p(a + 0.2, 0, G - 0.3);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#c8a07a24';
    pen.lineWidth = Math.max(0.8, 0.16 * s);
    pen.stroke();
    if (k.fine) {
      // knots and pegs
      pen.beginPath();
      for (let a = T + PLANK / 2, i = 0; a < end; a += PLANK, i++) {
        if (a < s0 || a > s1) continue;
        for (const z of [z0 + 1.6, G - 1.6]) {
          const [x, y] = k.p(a, 0, z);
          pen.moveTo(x + 0.14 * s, y);
          pen.arc(x, y, 0.14 * s, 0, Math.PI * 2);
        }
        if (hash(i, 77) < 0.35) {
          const [x, y] = k.p(a + (hash(i, 78) - 0.5) * 0.6, 0, z0 + 3 + hash(i, 79) * (G - z0 - 6));
          pen.moveTo(x + 0.3 * s, y);
          pen.ellipse(x, y, 0.22 * s, 0.38 * s, 0, 0, Math.PI * 2);
        }
      }
      pen.fillStyle = '#2e2017cc';
      pen.fill();
    }
  }
  // The sill plate on the footing.
  k.box(s0, 0, BASE, s1 - s0, 0.6, PLATE, tone(C.timberDark), { line: k.thin, stripe: false });
  // The plaster above the beam, warm low, smoky high.
  const zp = G + GIRT;
  if (k.sees(s0, -1, zp, s1, 1, H)) {
    k.poly([[s0, 0, zp], [s1, 0, zp], [s1, 0, H], [s0, 0, H]], k.vgrad(s0, 0, zp, H, [[0, tone(C.plaster)], [0.5, tone(shade(C.plaster, -0.12))], [1, tone(shade(C.plaster, -0.3))]]), 0);
    if (k.fine) {
      // a few patches where the plaster was mended
      for (let i = 0; i < (end - T) / 14; i++) {
        const a = T + (i + hash(i, 81)) * 14;
        if (a < s0 || a > s1 - 3) continue;
        const z = zp + 2 + hash(i, 82) * (H - zp - 6);
        k.poly([[a, 0, z], [a + 1.6 + hash(i, 83), 0, z + 0.2], [a + 1.9, 0, z + 1.1], [a + 0.2, 0, z + 0.9]], withAlpha(shade(C.plaster, 0.08), 0.5), 0, 0.3);
      }
    }
    // smoke darkening it toward the roof
    k.poly([[s0, 0, zp], [s1, 0, zp], [s1, 0, H], [s0, 0, H]], k.vgrad(s0, 0, zp, H, [[0, '#120a0600'], [0.35, '#120a0660'], [1, '#0e0805d0']]), 0);
  }
  // the far corner in shadow
  if (s0 < T + 10) k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#120a0650'], [1, '#120a0600']]), 0);
}

// The wall's frame under its pieces: the studs over the beam, and the
// posts.
function frameUp(k: Kit, v: RoomView, wall: Wall, plan: Plan): void {
  const { H } = v;
  const G = girtZ(H);
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.12) => (lit ? c : shade(c, -d));
  const posts = plan.posts[wall];
  const zp = G + GIRT;
  const zt = H - CAP;
  // the studs over the beam, dark with the smoke
  for (const p of posts) if (k.sees(p - 1, -1, zp, p + PW + 1, 1, zt)) k.box(p + 0.15, 0, zp, PW - 0.3, 0.35, zt - zp, tone('#4a3220'), { line: k.thin, stripe: false });
  // the posts
  for (const [i, p] of posts.entries()) if (k.sees(p - 1, -1, 0, p + PW + 1, PD + 1, G)) post(k, p, G, i === 0 ? 1 : i === posts.length - 1 ? -1 : 0, tone);
}

// A curved knee brace from a post's side at `e` toward `dir`: a solid
// bracket filling the corner under the beam, its underside cut in an arch
// from the post (KNEE down it) to the beam (KNEE along it).
function knee(k: Kit, e: number, dir: 1 | -1, G: number, tone: (c: Color, d?: number) => Color): void {
  const n = BEAM_D - 0.15;
  const t = 0.75; // its ends, thick
  const r = KNEE - t;
  const pts: P3[] = [[e, n, G - KNEE], [e, n, G], [e + dir * KNEE, n, G], [e + dir * KNEE, n, G - t]];
  for (let i = 0; i <= 10; i++) {
    const th = Math.PI / 2 + (i / 10) * (Math.PI / 2);
    pts.push([e + dir * KNEE + dir * Math.cos(th) * r, n, G - KNEE + Math.sin(th) * r]);
  }
  k.poly(pts, tone(C.timber), k.thin);
  if (k.fine) {
    const arc: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const th = Math.PI / 2 + (i / 8) * (Math.PI / 2);
      arc.push([e + dir * KNEE + dir * Math.cos(th) * (r + 0.4), n + 0.01, G - KNEE + Math.sin(th) * (r + 0.4)]);
    }
    k.line(arc, tone(C.carving), Math.max(0.7, 0.1 * k.s));
  }
}

// A heavy carved post from the floor to the beam: two carved bands round
// it, low and high, standing out on the side toward the room's middle only
// at the wall's ends (`edge`), so nothing passes them.
function post(k: Kit, a0: number, G: number, edge: -1 | 0 | 1, tone: (c: Color, d?: number) => Color): void {
  const a1 = a0 + PW;
  k.box(a0, 0, 0, PW, PD, G, tone(C.timber), { line: k.lw, stripe: false });
  k.line([[a0 + 0.3, PD, 0.4], [a0 + 0.3, PD, G - 0.4]], tone(shade(C.timber, 0.16)), Math.max(0.8, 0.16 * k.s));
  for (const [z0, z1] of [[BASE + 0.4, BASE + 2.4], [G - 6.8, G - 4.8]] as const) {
    const u0 = edge > 0 ? a0 : a0 - 0.15;
    const u1 = edge < 0 ? a1 : a1 + 0.15;
    k.box(u0, 0, z0, u1 - u0, PD + 0.15, z1 - z0, tone(C.timberDark), { line: k.thin, stripe: false });
    if (k.s * (z1 - z0) < 5) continue;
    const m = (z0 + z1) / 2;
    const amp = (z1 - z0) * 0.26;
    const w = Math.max(0.7, 0.14 * k.s);
    if (k.fine) {
      // two cords braided across the band
      for (const ph of [0, Math.PI]) {
        const pts: P3[] = [];
        for (let u = a0 + 0.1; u <= a1 - 0.05; u += 0.1) pts.push([u, PD + 0.16, m + Math.sin(((u - a0) / PW) * Math.PI * 3 + ph) * amp]);
        k.line(pts, tone(C.carving), w);
      }
    } else zigzag(k, a0 + 0.15, a1 - 0.05, PD + 0.16, m, amp * 2, tone(C.carving), w);
  }
}

// The carved beam along the wall over the posts, crimson swags hung under
// it post to post, a curved knee brace either side of each post in front of
// them, and the wall plate along the top.
function beam(k: Kit, v: RoomView, wall: Wall, end: number, plan: Plan): void {
  const { T, H } = v;
  const G = girtZ(H);
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.12) => (lit ? c : shade(c, -d));
  const span = seenAlong(k, T, end, G - SAG - 2, H);
  if (!span) return;
  const [s0, s1] = [Math.max(T, span[0] - 2), Math.min(end, span[1] + 2)];
  // the wall plate
  if (k.sees(s0, -1, H - CAP, s1, 1, H)) k.box(s0, 0, H - CAP, s1 - s0, 0.9, CAP - 0.05, tone('#3e2a1a'), { line: k.thin, stripe: false });
  // the beam, a braid of two cords carved along its face
  k.box(s0, 0, G, s1 - s0, BEAM_D, GIRT, tone(C.timberDark), { line: k.lw });
  if (k.s * GIRT >= 7) {
    const n = BEAM_D + 0.01;
    const mid = G + GIRT / 2;
    const amp = GIRT * 0.24;
    const step = GIRT * 1.6;
    const cord = (ph: number) => {
      const pts: P3[] = [];
      const first = s0 - ((s0 - T) % (step / 8));
      for (let a = first; a <= s1 + 1e-6; a += step / 8) pts.push([a, n, mid + Math.sin(((a - T) / step) * Math.PI * 2 + ph) * amp]);
      return pts;
    };
    const w = Math.max(0.8, 0.26 * k.s);
    for (const ph of [0, Math.PI]) k.line(cord(ph), tone(shade(C.timberDark, -0.25), 0.1), w + k.thin);
    for (const ph of [0, Math.PI]) k.line(cord(ph), tone(C.carving), w * 0.55);
  }
  k.line([[s0, BEAM_D, G + GIRT - 0.25], [s1, BEAM_D, G + GIRT - 0.25]], tone(shade(C.timberDark, 0.25)), Math.max(0.8, 0.14 * k.s));
  // the swags, post to post
  const posts = plan.posts[wall];
  for (let i = 0; i + 1 < posts.length; i++) {
    const a0 = posts[i] + PW / 2;
    const a1 = posts[i + 1] + PW / 2;
    if (a1 < s0 - 1 || a0 > s1 + 1 || !k.sees(a0, 0, G - SAG - 1, a1, BEAM_D + 1, G)) continue;
    swag(k, a0, a1, G, lit);
  }
  for (const [i, p] of posts.entries()) {
    if (!k.sees(p - KNEE - 1, 0, G - KNEE - 1, p + PW + KNEE + 1, BEAM_D + 1, G)) continue;
    if (i > 0) knee(k, p, -1, G, tone);
    if (i < posts.length - 1) knee(k, p + PW, 1, G, tone);
  }
}

// A crimson swag hung under the beam from a0 to a1: folds following its
// sag, a gold zigzag along its foot, a gold knot at each end.
function swag(k: Kit, a0: number, a1: number, G: number, lit: boolean): void {
  const n = PD + 0.3;
  const top = G - 0.05;
  const foot = (f: number) => G - 0.6 - SAG * (1 - (2 * f - 1) ** 2);
  const steps = 16;
  const pts: P3[] = [];
  for (let i = 0; i <= steps; i++) pts.push([a0 + ((a1 - a0) * i) / steps, n, top]);
  for (let i = steps; i >= 0; i--) pts.push([a0 + ((a1 - a0) * i) / steps, n, foot(i / steps)]);
  const red = lit ? C.red : shade(C.red, -0.1);
  k.poly(pts, k.vgrad(a0, n, G - SAG - 0.6, G, [[0, shade(red, -0.25)], [0.6, red], [1, shade(red, 0.1)]]), k.thin);
  const at = (f: number, up: number): P3 => [a0 + (a1 - a0) * f, n + 0.01, foot(f) + up * (top - foot(f))];
  const w = Math.max(0.8, 0.2 * k.s);
  if (k.fine) {
    // the folds
    for (const up of [0.35, 0.68]) {
      const line: P3[] = [];
      for (let i = 1; i < steps; i++) line.push(at(i / steps, up));
      k.line(line, shade(red, -0.3), Math.max(0.6, 0.08 * k.s));
    }
    // the zigzag trim along the foot
    const zz: P3[] = [];
    const m = Math.max(6, Math.round((a1 - a0) / 0.7));
    for (let i = 0; i <= m; i++) {
      const f = i / m;
      zz.push([a0 + (a1 - a0) * f, n + 0.02, foot(f) + (i & 1 ? 0.62 : 0.22)]);
    }
    k.line(zz, C.gold, w * 0.8);
  } else {
    const line: P3[] = [];
    for (let i = 0; i <= steps; i++) line.push(at(i / steps, 0.12));
    k.line(line, C.gold, w);
  }
  for (const a of [a0, a1]) k.disc(a, n + 0.05, top - 0.35, 0.42, C.gold, k.thin);
}

// The firelight on a wall, over the planks and what hangs on them: the hall
// falls dark away from the fires, and each light warms the wall nearest it,
// the more the nearer it stands (a wide faint wash from far off, a bright
// pool close by); each sconce warms the planks round it.
function wallLight(k: Kit, v: RoomView, wall: Wall, end: number, plan: Plan): void {
  const { T, H } = v;
  const G = girtZ(H);
  const span = seenAlong(k, T, end, 0, H);
  if (!span) return;
  const [s0, s1] = [Math.max(T, span[0] - 2), Math.min(end, span[1] + 2)];
  // the night's dark over the whole wall
  k.poly([[s0, 0, 0], [s1, 0, 0], [s1, 0, H], [s0, 0, H]], '#0c070466', 0);
  const top = G + GIRT + 8;
  for (const l of lightsOf(plan.L)) {
    const d = wall === 'right' ? l.y - T : l.x - T;
    const along = wall === 'right' ? l.x : l.y;
    if (d < 0) continue;
    const a = l.a / (1 + (d / l.reach) ** 2);
    if (a < 0.025) continue;
    glow(k, along, Math.min(l.z, G - 4), 6 + d * 0.9 + l.reach * 0.5, 5 + d * 0.45 + l.reach * 0.35, T, end, 0, top, l.color, a);
  }
  const lz = lampZ(G);
  for (const a of plan.lamps[wall]) glow(k, a, lz + 1.6, 6, 5.5, T, end, 0, top, '#ffa848', 0.3);
  // the night's cold light round the windows
  for (const f of plan.features) if (f.wall === wall && f.kind === 'window') glow(k, f.a, f.z0 + 4, 5, 5, T, end, f.z0 - 2, f.z1 + 3, C.frost, 0.16);
}

// A soft light (screen) on the wall's plane round (cu, cz), ru along by rz
// up, kept to the stretch [u0, u1] x [z0, z1] of the wall.
function glow(k: Kit, cu: number, cz: number, ru: number, rz: number, u0: number, u1: number, z0: number, z1: number, color: Color, a: number): void {
  const p0 = Math.max(-1, (u0 - cu) / ru);
  const p1 = Math.min(1, (u1 - cu) / ru);
  const q0 = Math.max(-1, (z0 - cz) / rz);
  const q1 = Math.min(1, (z1 - cz) / rz);
  if (p1 <= p0 || q1 <= q0 || !k.sees(cu + p0 * ru, 0, cz + q0 * rz, cu + p1 * ru, 0, cz + q1 * rz)) return;
  const [cx, cy] = k.p(cu, 0, cz);
  const [ux, uy] = k.p(cu + ru, 0, cz);
  const [zx, zy] = k.p(cu, 0, cz + rz);
  const pen = k.pen;
  pen.save();
  pen.globalCompositeOperation = 'screen';
  pen.transform(ux - cx, uy - cy, zx - cx, zy - cy, cx, cy);
  const g = pen.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (let i = 0; i <= 4; i++) {
    const t = i / 4;
    g.addColorStop(t, withAlpha(color, a * (1 - t) * (1 - t)));
  }
  pen.fillStyle = g;
  pen.beginPath();
  pen.moveTo(p0, q0);
  pen.lineTo(p1, q0);
  pen.lineTo(p1, q1);
  pen.lineTo(p0, q1);
  pen.closePath();
  pen.fill();
  pen.restore();
}

// The candles over the dark: a horn sconce on each lit post, the flames of
// the candle rings.
function candles(k: Kit, v: RoomView, wall: Wall, plan: Plan): void {
  const G = girtZ(v.H);
  const lz = lampZ(G);
  for (const a of plan.lamps[wall]) if (k.sees(a - 1.5, 0, lz - 3, a + 1.5, PD + 2, lz + 3)) sconce(k, a, lz);
  for (const f of plan.features) {
    if (f.wall !== wall || f.kind !== 'chandelier' || !k.sees(f.a - 3, 0, f.z0, f.a + 3, 7, f.z1)) continue;
    for (const [u, w, z] of ringCandles(f, G)) flame(k, u, w, z + 1.25, 0.85, 0.5, 0.4);
  }
}

// A drinking horn held out from the post at `a` on an iron strap, its mouth
// up holding a lit candle.
function sconce(k: Kit, a: number, z: number): void {
  const n = PD;
  k.rod([[a, n - 0.05, z - 1.75], [a, n + 0.35, z - 1.75], [a + 0.05, n + 0.75, z - 1.0]], C.ironDark, 0.18);
  k.disc(a, n + 0.02, z - 1.75, 0.18, C.ironLight, 0);
  horn(k, [[a + 0.2, n + 1.2, z + 0.9], [a + 0.15, n + 1.15, z + 0.1], [a + 0.05, n + 0.85, z - 0.8], [a, n + 0.45, z - 1.5], [a, n + 0.15, z - 1.9]], 0.46, false);
  k.cyl(a + 0.2, n + 1.2, z + 0.7, 0.2, 0.75, C.wax);
  flame(k, a + 0.2, n + 1.2, z + 1.85, 0.9, 0.5, 0.5);
}

// ── wall pieces ──────────────────────────────────────────────────────────────

function piece(k: Kit, v: RoomView, f: Feature): void {
  const G = girtZ(v.H);
  if (f.kind === 'window') windowArt(k, f);
  else if (f.kind === 'hanging') {
    const { top, bottom } = hangingZ(G, v.H);
    banner(k, top, bottom, f);
  } else if (f.kind === 'shield') {
    k.rod([[f.a, 0.02, G - 5.0], [f.a, 0.5, G - 5.0]], C.timberDark, 0.22);
    shieldFace(k, f.a, 0.45, G - 7.4 + (hash(f.k, 13) - 0.5) * 0.4, 2.3, f.k);
  } else if (f.kind === 'banner') banner(k, bannerZ(G).top, bannerZ(G).bottom, f);
  else if (f.kind === 'elk') elk(k, G, f);
  else if (f.kind === 'chandelier') chandelier(k, G, f);
  else herbs(k, G, f);
}

// A small high window under the eaves: a heavy frame round a lattice of
// diamond panes, the night beyond with a snowy slope and pines, snow
// drifted on the outer sill; a cold blue light round it.
const WIN = { w: 4.6, h: 5.6 }; // the opening
const FRAME = 0.5;
const FACE = 0.31; // the frame's face, where the opening is cut
const DEPTH = 1.0; // how far behind the wall's face the night is seen
const sillOf = (f: Feature) => f.z0 + 0.9;

// A window's opening in the plane v = n: at the frame's face (FACE) by
// default, or where the night is seen through it (-DEPTH).
export function opening(f: Feature, n = FACE): P3[] {
  const [u0, u1] = [f.a - WIN.w / 2, f.a + WIN.w / 2];
  const z0 = sillOf(f);
  return [[u0, n, z0], [u1, n, z0], [u1, n, z0 + WIN.h], [u0, n, z0 + WIN.h]];
}

function windowArt(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const [u0, u1] = [a - WIN.w / 2, a + WIN.w / 2];
  const z0 = sillOf(f);
  const z1 = z0 + WIN.h;
  blot(k, a + 0.3, 0.02, (z0 + z1) / 2 - 0.3, 3.6, 3.8, '#120a06', 0.36);
  // the frame
  k.box(u0 - FRAME, 0, z0 - FRAME, WIN.w + 2 * FRAME, 0.3, WIN.h + 2 * FRAME, C.timberDark, { line: k.lw, stripe: false });
  const open = opening(f);
  k.poly(open, '#3a281a', 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  // the view, set back in the wall's depth
  const n = -DEPTH;
  k.poly([[u0 - 1, n, z0 - 1], [u1 + 1, n, z0 - 1], [u1 + 1, n, z1 + 1], [u0 - 1, n, z1 + 1]], k.vgrad(a, n, z0, z1, [[0, C.nightLow], [0.55, '#2e3a5c'], [1, C.night]]), 0);
  if (hash(f.k, 3) < 0.5) k.halo(a + (hash(f.k, 4) - 0.5) * 2, n, z1 - 1.2, 2.0, C.frost, 0.34);
  pen.beginPath();
  for (let i = 0; i < 3; i++) {
    const [x, y] = k.p(u0 + 0.4 + hash(f.k, i, 5) * (WIN.w - 0.8), n, z1 - 0.6 - hash(f.k, i, 6) * 1.6);
    pen.moveTo(x + Math.max(0.7, 0.11 * s), y);
    pen.arc(x, y, Math.max(0.7, 0.11 * s), 0, Math.PI * 2);
  }
  pen.fillStyle = '#dfe8f4';
  pen.fill();
  // a far slope of snow, then pines with snow on their boughs
  const slope: P3[] = [[u0 - 1, n, z0 - 1]];
  for (let i = 0; i <= 6; i++) slope.push([u0 - 1 + ((WIN.w + 2) * i) / 6, n, z0 + 1.5 + Math.sin(i * 1.3 + f.k) * 0.4 + (hash(f.k, 7) - 0.5) * 0.8]);
  slope.push([u1 + 1, n, z0 - 1]);
  k.poly(slope, k.vgrad(a, n, z0, z0 + 2, [[0, '#b9c8dc'], [1, '#d6e2ee']]), 0);
  for (let i = 0; i < 3; i++) {
    const pu = u0 + 0.2 + ((i + 0.3 + hash(f.k, i, 8) * 0.4) / 3) * WIN.w;
    pine(k, pu, n, z0 + 0.4 + hash(f.k, i, 10) * 0.8, 1.9 + hash(f.k, i, 9) * 1.4, 0.7 + hash(f.k, i, 11) * 0.3);
  }
  k.poly([[u0 - 1, n, z0 - 1], [u1 + 1, n, z0 - 1], [u1 + 1, n, z0 + 0.6], [a, n, z0 + 0.9], [u0 - 1, n, z0 + 0.5]], '#e6eef6', 0);
  // the reveal's lit side and its sill, inside the wall
  k.poly([[u0, FACE, z0], [u0, n, z0], [u0, n, z1], [u0, FACE, z1]], '#5a4030', 0);
  k.poly([[u0, FACE, z0], [u1, FACE, z0], [u1, n, z0], [u0, n, z0]], '#6e5038', 0);
  // the lattice: two sets of diagonal bars, set halfway back
  const bn = -0.45;
  const bars: P3[][] = [];
  const step = 1.3;
  for (let c = -WIN.h; c <= WIN.w + WIN.h; c += step) {
    bars.push([[u0 + c, bn, z0], [u0 + c - WIN.h, bn, z1]]);
    bars.push([[u0 + c - WIN.h, bn, z0], [u0 + c, bn, z1]]);
  }
  const bw = Math.max(0.9, 0.17 * s);
  k.segs(bars.map((b) => [b[0], b[1]] as [P3, P3]), INK, bw + k.thin);
  k.segs(bars.map((b) => [b[0], b[1]] as [P3, P3]), '#4a3422', bw);
  k.poly(open, k.vgrad(a, FACE, z1 - 1.5, z1, [[0, '#00000000'], [1, '#0a0a1a66']]), 0);
  pen.restore();
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  // the inner sill board, a little snow blown onto it
  k.box(u0 - 0.7, 0, z0 - 0.85, WIN.w + 1.4, 0.8, 0.6, C.timber, { line: k.lw });
  k.poly([[u0 + 0.3, 0.2, z0 - 0.25], [u0 + 1.4, 0.15, z0 - 0.25], [u0 + 1.2, 0.5, z0 - 0.12], [u0 + 0.5, 0.55, z0 - 0.15]], C.snow, k.thin * 0.7, 0.2);
}

// A pine in the plane v = n: tiers of boughs, snow on each.
function pine(k: Kit, u: number, n: number, z: number, h: number, w: number): void {
  k.line([[u, n, z], [u, n, z + 0.5]], '#1a2028', Math.max(1, 0.2 * k.s));
  const tiers = 3;
  for (let i = 0; i < tiers; i++) {
    const zb = z + 0.3 + (i * h) / (tiers + 0.6);
    const zt = zb + h * 0.5;
    const r = w * (1 - i * 0.24);
    k.poly([[u - r, n, zb], [u + r, n, zb], [u, n, zt]], C.pine, 0);
    k.poly([[u - r * 0.85, n, zb + 0.1], [u - r * 0.2, n, zb + h * 0.18], [u + r * 0.1, n, zb + 0.25], [u + r * 0.85, n, zb + 0.1], [u + r * 0.3, n, zb + 0.24]], '#dbe6f0', 0);
  }
}

// A long cloth banner from a pole on two pegs, from `top` down to `bottom`:
// one plain colour with a gold border down its sides and round its foot, a
// band across near the top, a swallow-tail, pointed or fringed end; soft
// folds, lit from the left.
function banner(k: Kit, top: number, bottom: number, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const n = 0.55;
  const hw = 2.1;
  const c = (f.kind === 'hanging' ? [C.red, C.red, C.redDark, C.red, C.blue, C.red] : [C.red, C.blue, C.green, C.redDark, C.red, C.green])[Math.floor(hash(f.k, 21) * 6)];
  const trim = C.gold;
  const end = Math.floor(hash(f.k, 23) * 3); // 0 swallow-tail, 1 point, 2 fringe
  const z1 = top - 0.25;
  const z0 = bottom;
  blot(k, a + 0.5, 0.02, (z0 + z1) / 2, hw * 1.1, (z1 - z0) * 0.55, '#0c0604', 0.42);
  const notch = Math.min(2.0, (z1 - z0) * 0.14);
  const foot: P3[] = end === 0
    ? [[a + hw, n, z0], [a, n, z0 + notch], [a - hw, n, z0]]
    : end === 1
      ? [[a + hw, n, z0 + notch], [a, n, z0], [a - hw, n, z0 + notch]]
      : [[a + hw, n, z0 + 0.6], [a - hw, n, z0 + 0.6]];
  const cloth: P3[] = [[a - hw, n, z1], [a + hw, n, z1], ...foot];
  k.poly(cloth, k.hgrad([a - hw, n, z1], [a + hw, n, z1], [[0, shade(c, 0.12)], [0.4, c], [1, shade(c, -0.2)]]), k.lw);
  pen.save();
  pen.beginPath();
  k.trace(cloth);
  pen.clip();
  pen.beginPath();
  for (const du of [-1.0, 0.2, 1.2]) k.trace([[a + du - 0.25, n, z1], [a + du + 0.25, n, z1], [a + du + 0.32, n, z0 - 1], [a + du - 0.18, n, z0 - 1]]);
  pen.fillStyle = withAlpha(shade(c, -0.4), 0.28);
  pen.fill();
  const zb = z1 - 1.3;
  k.rect(a - hw, zb - 0.55, a + hw, zb, n, trim, 0);
  const bw = Math.max(0.8, 0.22 * s);
  const inset = 0.5;
  const edge: P3[] = [[a - hw + inset, n, zb - 1.0], ...foot.map(([u, w, z]): P3 => [a + (u - a) * ((hw - inset) / hw), w, z + inset * 1.2]).reverse(), [a + hw - inset, n, zb - 1.0]];
  k.line(edge, trim, bw);
  if (k.fine) zigzag(k, a - hw + 0.9, a + hw - 0.9, n, zb - 1.0, 0.45, trim, bw * 0.7);
  pen.restore();
  pen.beginPath();
  k.trace(cloth);
  k.paint(null, k.lw);
  if (end === 2) {
    pen.beginPath();
    for (let i = 0; i <= 8; i++) {
      const u = a - hw + 0.25 + ((2 * hw - 0.5) * i) / 8;
      const [x0, y0] = k.p(u, n, z0 + 0.6);
      const [x1, y1] = k.p(u, n, z0 - 0.3);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = trim;
    pen.lineWidth = Math.max(0.9, 0.18 * s);
    pen.lineCap = 'round';
    pen.stroke();
  }
  for (const du of [-1.5, 1.5]) k.rod([[a + du, 0.05, top + 0.25], [a + du, n + 0.25, top + 0.25]], C.timberDark, 0.25);
  k.rod([[a - 2.35, n, top], [a + 2.35, n, top]], C.timberDark, 0.32);
  for (const du of [-2.45, 2.45]) {
    const [x, y] = k.p(a + du, n, top);
    pen.beginPath();
    pen.arc(x, y, Math.max(1.2, 0.27 * s), 0, Math.PI * 2);
    k.paint(C.gold, k.thin);
  }
  k.line([[a - hw + 0.2, n + 0.02, z0 + (end === 1 ? notch : end === 0 ? 0.3 : 0.7)], [a + hw - 0.2, n + 0.02, z0 + (end === 1 ? notch : 0.7)]], '#ffa04a66', Math.max(0.8, 0.14 * s));
}

// An elk's head mounted on a carved plaque: a long brown face with a pale
// muzzle, ears out to the sides, eyes shut in a doze, and a great spread
// of antlers sweeping up and out, three tines on each beam.
function elk(k: Kit, G: number, f: Feature): void {
  const { s } = k;
  const a = f.a;
  const z = G - 9.2; // the plaque's middle
  blot(k, a + 0.6, 0.02, z + 0.4, 3.8, 4.6, '#0c0604', 0.42);
  const plaque: P3[] = [[a - 1.7, 0.3, z + 1.9], [a + 1.7, 0.3, z + 1.9], [a + 1.7, 0.3, z - 0.7], [a, 0.3, z - 2.6], [a - 1.7, 0.3, z - 0.7]];
  k.poly(plaque, k.hgrad([a - 1.7, 0.3, z], [a + 1.7, 0.3, z], [[0, C.timberLight], [1, C.timberDark]]), k.lw, 0.5);
  if (k.fine) k.line([[a - 1.3, 0.31, z + 1.5], [a + 1.3, 0.31, z + 1.5], [a + 1.3, 0.31, z - 0.55], [a, 0.31, z - 2.1], [a - 1.3, 0.31, z - 0.55], [a - 1.3, 0.31, z + 1.5]], C.carving, Math.max(0.7, 0.1 * s));
  const n = 1.0;
  // the antlers behind the head (rods: ink under horn)
  for (const side of [-1, 1] as const) {
    const P = (du: number, dz: number): P3 => [a + side * du, n - 0.1, z + dz];
    k.rod([P(0.55, 1.6), P(1.4, 2.3), P(2.3, 2.9), P(3.0, 3.9), P(3.3, 5.0), P(3.1, 5.6)], C.horn, 0.34);
    k.rod([P(1.35, 2.25), P(1.15, 3.3), P(1.3, 4.1)], C.horn, 0.24);
    k.rod([P(2.3, 2.9), P(2.05, 4.0), P(2.2, 4.8)], C.horn, 0.22);
    k.rod([P(3.05, 4.2), P(2.55, 4.9), P(2.4, 5.5)], C.horn, 0.2);
  }
  if (k.fine) for (const side of [-1, 1] as const) k.line([[a + side * 1.4, n, z + 2.45], [a + side * 2.3, n, z + 3.05], [a + side * 2.95, n, z + 3.9]], '#fff6e080', Math.max(0.7, 0.09 * s));
  // the ears
  for (const side of [-1, 1] as const) {
    k.poly([[a + side * 0.75, n + 0.1, z + 1.2], [a + side * 2.1, n + 0.1, z + 1.75], [a + side * 1.9, n + 0.1, z + 1.1], [a + side * 0.95, n + 0.1, z + 0.75]], C.elkDark, k.thin, 0.15);
    if (k.fine) k.poly([[a + side * 1.05, n + 0.12, z + 1.15], [a + side * 1.8, n + 0.12, z + 1.48], [a + side * 1.7, n + 0.12, z + 1.15]], '#c8a07a', 0);
  }
  // the face, long and tapering to the muzzle
  const face: P3[] = [[a - 1.0, n + 0.2, z + 1.7], [a + 1.0, n + 0.2, z + 1.7], [a + 0.95, n + 0.25, z + 0.5], [a + 0.6, n + 0.4, z - 1.4], [a + 0.48, n + 0.5, z - 2.4], [a, n + 0.55, z - 2.75], [a - 0.48, n + 0.5, z - 2.4], [a - 0.6, n + 0.4, z - 1.4], [a - 0.95, n + 0.25, z + 0.5]];
  k.poly(face, k.hgrad([a - 1, n, z], [a + 1, n, z], [[0, shade(C.elk, 0.12)], [0.5, C.elk], [1, C.elkDark]]), k.lw, 0.35);
  // the burrs at the antlers' feet
  for (const side of [-1, 1] as const) k.disc(a + side * 0.6, n + 0.25, z + 1.65, 0.32, '#b49a70', k.thin);
  // the pale muzzle and the dark nose
  k.poly([[a - 0.55, n + 0.5, z - 1.4], [a + 0.55, n + 0.5, z - 1.4], [a + 0.46, n + 0.55, z - 2.35], [a, n + 0.6, z - 2.7], [a - 0.46, n + 0.55, z - 2.35]], '#a8865e', 0, 0.3);
  k.poly([[a - 0.36, n + 0.62, z - 2.15], [a + 0.36, n + 0.62, z - 2.15], [a + 0.2, n + 0.62, z - 2.55], [a - 0.2, n + 0.62, z - 2.55]], '#2a1e1a', k.thin * 0.6, 0.15);
  // eyes shut, a light on the brow
  for (const side of [-1, 1] as const) k.line([[a + side * 0.75, n + 0.3, z + 0.35], [a + side * 0.5, n + 0.32, z + 0.2], [a + side * 0.28, n + 0.32, z + 0.35]], INK, Math.max(0.9, 0.12 * s));
  if (k.fine) k.line([[a - 0.6, n + 0.3, z + 1.3], [a - 0.2, n + 0.35, z - 0.6]], '#c89a6a88', 0.12 * s);
  // the fire's light under the plaque
  k.line([[a - 1.4, 0.32, z - 0.85], [a, 0.32, z - 2.5], [a + 1.4, 0.32, z - 0.85]], '#ffa04a77', Math.max(0.8, 0.14 * s));
}

// An iron candle ring hung from a wall bracket: a strap on the wall, an arm
// out from its top on a brace, three chains down to a hoop with five
// candles round it (their flames are lit over the dark: candles()).
const RING = { out: 3.4, r: 2.1 };
function ringCandles(f: Feature, G: number): P3[] {
  const zr = G - 8.6;
  return Array.from({ length: 5 }, (_, i): P3 => {
    const th = (i / 5) * Math.PI * 2 + 0.35;
    return [f.a + Math.cos(th) * RING.r, RING.out + Math.sin(th) * RING.r * 0.95, zr + 0.15];
  });
}

function chandelier(k: Kit, G: number, f: Feature): void {
  const a = f.a;
  const { out, r } = RING;
  const zr = G - 8.6;
  const zt = G - 3.7;
  // the bracket
  k.rod([[a, 0.1, zt + 0.1], [a, 0.1, zt - 3.4]], C.ironDark, 0.24);
  k.rod([[a, 0.1, zt], [a, out + 0.3, zt], [a, out + 0.5, zt - 0.4]], C.ironDark, 0.26);
  k.rod([[a, 0.1, zt - 2.6], [a, out * 0.55, zt - 0.1]], C.ironDark, 0.16);
  k.disc(a, out + 0.3, zt + 0.2, 0.22, C.ironDark, k.thin);
  // the hoop: its far half, the chains and candles, its near half
  const hoop = (th0: number, th1: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i <= 12; i++) {
      const th = th0 + ((th1 - th0) * i) / 12;
      pts.push([a + Math.cos(th) * r, out + Math.sin(th) * r * 0.95, zr]);
    }
    return pts;
  };
  const w = Math.max(1, 0.28 * k.s);
  const band = (pts: P3[]) => {
    k.line(pts, INK, w + k.lw);
    k.line(pts, C.ironDark, w);
  };
  band(hoop(Math.PI, Math.PI * 2));
  for (const th of [0.5, 2.6, 4.7]) k.line([[a, out, zt - 0.3], [a + Math.cos(th) * r * 0.97, out + Math.sin(th) * r * 0.92, zr]], '#2a2420', Math.max(0.8, 0.09 * k.s));
  const cs = ringCandles(f, G);
  for (const [u, v, z] of cs.filter(([, v]) => v < out)) {
    k.disc(u, v, z, 0.32, C.ironDark, k.thin);
    k.cyl(u, v, z + 0.05, 0.2, 0.9, C.wax);
  }
  band(hoop(0, Math.PI));
  for (const [u, v, z] of cs.filter(([, v]) => v >= out)) {
    k.disc(u, v, z, 0.32, C.ironDark, k.thin);
    k.cyl(u, v, z + 0.05, 0.2, 0.9, C.wax);
  }
}

// Bundles of herbs drying from a peg rail: tied at the top with twine,
// leaves and flower heads hanging down.
function herbs(k: Kit, G: number, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const z = G - 4.4;
  blot(k, a + 0.4, 0.02, z - 2.2, 2.2, 3, '#0c0604', 0.36);
  k.box(a - 1.9, 0, z, 3.8, 0.5, 0.6, C.timberDark, { line: k.thin, stripe: false });
  const kinds: Color[] = [C.herb, C.rushes, '#55703c', '#8aa058'];
  const blooms: Color[] = ['#9a7ab4', '#e8c84a', '#d8d0c0', '#c8603f'];
  for (let i = 0; i < 3; i++) {
    const u = a - 1.25 + i * 1.25;
    const c = kinds[Math.floor(hash(f.k, i, 25) * kinds.length)];
    const len = 3.0 + hash(f.k, i, 26) * 1.4;
    const n = 0.7;
    const sway = (hash(f.k, i, 27) - 0.5) * 0.3;
    k.rod([[u, 0.4, z + 0.3], [u, n + 0.2, z + 0.3]], C.timber, 0.14);
    k.line([[u, n, z + 0.2], [u, n, z - 0.35]], '#c8b080', Math.max(0.8, 0.1 * s));
    k.poly([[u - 0.18, n, z - 0.3], [u + 0.18, n, z - 0.3], [u + 0.62 + sway, n, z - len + 0.2], [u + sway, n, z - len - 0.35], [u - 0.62 + sway, n, z - len + 0.2]], k.hgrad([u - 0.6, n, z], [u + 0.6, n, z], [[0, shade(c, 0.18)], [1, shade(c, -0.22)]]), k.thin);
    k.line([[u - 0.22, n + 0.02, z - 0.6], [u + 0.22, n + 0.02, z - 0.6]], '#b58a50', Math.max(0.9, 0.18 * s));
    const bloom = blooms[Math.floor(hash(f.k, i, 28) * blooms.length)];
    pen.beginPath();
    for (let j = 0; j < 4; j++) {
      const du = (j - 1.5) * 0.3 + sway;
      const [x, y] = k.p(u + du, n + 0.05, z - len + 0.15 + (j & 1) * 0.35);
      const r = Math.max(0.9, 0.17 * s);
      pen.moveTo(x + r, y);
      pen.arc(x, y, r, 0, Math.PI * 2);
    }
    pen.fillStyle = bloom;
    pen.fill();
    if (k.fine) {
      pen.strokeStyle = withAlpha(INK, 0.6);
      pen.lineWidth = k.thin * 0.5;
      pen.stroke();
      for (let j = 0; j < 4; j++) {
        const zz = z - 1.0 - (j * (len - 1.4)) / 4;
        const [x, y] = k.p(u + sway * 0.5 + (j & 1 ? 0.3 : -0.3), n + 0.05, zz);
        pen.beginPath();
        pen.ellipse(x, y, 0.22 * s, 0.13 * s, j & 1 ? 0.6 : -0.6, 0, Math.PI * 2);
        k.paint(shade(c, j & 1 ? 0.1 : -0.1), k.thin * 0.5);
      }
    }
  }
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen, s } = k;
  const { W, D, H, T } = v;
  // the floor's cut edges: flagstones on a bed of rubble
  k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#3e3b34', 0, 1), k.lw);
  k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#3e3b34', 1, 0), k.lw);
  pen.beginPath();
  const [la, lb] = [k.p(T, D, -0.9), k.p(W, D, -0.9)];
  pen.moveTo(la[0], la[1]);
  pen.lineTo(lb[0], lb[1]);
  pen.lineTo(...k.p(W, T, -0.9));
  for (let x = T + 4; x < W; x += 5 + hash(Math.round(x), 1) * 3) {
    const [x0, y0] = k.p(x, D, 0);
    const [x1, y1] = k.p(x, D, -0.9);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  for (let y = T + 4; y < D; y += 5 + hash(Math.round(y), 2) * 3) {
    const [x0, y0] = k.p(W, y, 0);
    const [x1, y1] = k.p(W, y, -0.9);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = withAlpha(INK, 0.6);
  pen.lineWidth = k.thin * 0.8;
  pen.stroke();
  k.line([[T, D, -0.15], [W, D, -0.15], [W, T, -0.15]], '#6e6a5e', Math.max(1, 0.2 * s));
  // the walls' cut ends: fieldstones at the foot, turf above with the plank
  // lining at the inner face
  cutEnd(k, v, [[0, D], [T, D]], [0, 1]);
  cutEnd(k, v, [[W, 0], [W, T]], [1, 0]);
  // the tops: dark turf, the wall plate's top along the inner edge
  const top: P3[] = [[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]];
  k.poly(top, k.grad([0, 0, H], [T, T, H], [[0, '#3c2f22'], [1, '#2e2419']]), k.lw);
  if (k.fine) {
    pen.beginPath();
    for (const right of [true, false]) {
      for (let i = 0; 2 + i * 2.2 < (right ? W : D) - 1; i++) {
        const a = 2 + i * 2.2 + hash(i, right ? 1 : 2, 96) * 1.2;
        const b = 0.6 + hash(i, right ? 1 : 2, 95) * (T - 3);
        const [x, y] = right ? [a, b] : [b, a];
        const [x0, y0] = k.p(x, y, H);
        const [x1, y1] = k.p(x + 0.5, y + 0.15, H);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
    }
    pen.strokeStyle = '#4a4a2c';
    pen.lineWidth = Math.max(0.7, 0.1 * s);
    pen.lineCap = 'round';
    pen.stroke();
  }
  const rim = 1.2;
  k.poly([[W, T - rim, H], [T - rim, T - rim, H], [T - rim, D, H], [T, D, H], [T, T, H], [W, T, H]], C.timberDark, k.thin);
  k.line([[0.4, D, H], [0.4, 0.4, H], [W, 0.4, H]], '#5a4630', Math.max(1, 0.2 * s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, BASE], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

// One wall's cut end, from `p` (outer) to `q` (inner) on the floor plan,
// facing `nrm`.
function cutEnd(k: Kit, v: RoomView, [p, q]: [[number, number], [number, number]], nrm: [number, number]): void {
  const { pen, s } = k;
  const { H } = v;
  const G = girtZ(H);
  const at = (f: number, z: number): P3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z];
  const lit = (c: Color) => k.side(c, nrm[0], nrm[1], 0.16);
  if (!k.sees(Math.min(p[0], q[0]), Math.min(p[1], q[1]), -SLAB, Math.max(p[0], q[0]), Math.max(p[1], q[1]), H)) return;
  // turf, in layers of sod
  k.poly([at(0, -SLAB), at(1, -SLAB), at(1, H), at(0, H)], k.vgrad(0, 0, 0, H, [[0, lit('#5c4630')], [1, lit('#4a3a28')]]), k.lw);
  pen.beginPath();
  for (let z = BASE + 1.6; z < H - 0.8; z += 1.6) {
    const [x0, y0] = k.p(...at(0.04, z));
    const [x1, y1] = k.p(...at(0.7, z + 0.2));
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = lit('#3a2c1e');
  pen.lineWidth = Math.max(0.8, 0.12 * s);
  pen.stroke();
  pen.beginPath();
  for (let z = BASE + 1.0; z < H - 0.8; z += 1.6) {
    const [x0, y0] = k.p(...at(0.06, z));
    const [x1, y1] = k.p(...at(0.6, z + 0.15));
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = lit('#6b7a48');
  pen.lineWidth = Math.max(0.7, 0.1 * s);
  pen.stroke();
  // the stone footing
  const wide = Math.hypot(q[0] - p[0], q[1] - p[1]);
  pen.beginPath();
  for (let r = 0; r < 4; r++) {
    const z0 = -SLAB + 0.1 + r * 2.35;
    if (z0 > BASE - 0.5) break;
    let f = (r & 1) * 0.12;
    while (f < 1) {
      const g = Math.min(1, f + (1.8 + hash(r, f * 10, 91) * 1.4) / wide);
      k.trace([at(f + 0.02, z0), at(g - 0.02, z0), at(g - 0.02, Math.min(BASE, z0 + 2.2)), at(f + 0.02, Math.min(BASE, z0 + 2.2))], 0.6);
      f = g;
    }
  }
  pen.fillStyle = lit(C.stone);
  pen.fill();
  pen.strokeStyle = withAlpha(INK, 0.8);
  pen.lineWidth = k.thin * 0.8;
  pen.stroke();
  // the plank lining at the inner face, the beam and the wall plate cut
  const fr = 0.9 / wide;
  k.poly([at(1 - fr, BASE), at(1, BASE), at(1, H), at(1 - fr, H)], lit('#b08a5a'), k.thin);
  k.poly([at(1 - fr * 1.6, G), at(1, G), at(1, G + GIRT), at(1 - fr * 1.6, G + GIRT)], lit('#c8975e'), k.thin);
  k.poly([at(1 - fr * 1.2, H - CAP), at(1, H - CAP), at(1, H), at(1 - fr * 1.2, H)], lit('#a87a48'), k.thin);
  k.poly([at(0, H - 0.9), at(1 - fr, H - 0.9), at(1 - fr, H), at(0, H)], lit('#3a2e20'), k.thin);
  pen.beginPath();
  k.trace([at(0, -SLAB), at(1, -SLAB), at(1, H), at(0, H)]);
  k.paint(null, k.lw);
}

// ── per frame ────────────────────────────────────────────────────────────────

// Snow falling past a window, only where the night shows through it (not
// on the frame, the reveal's side or sill, or the wall round it), drifting
// sideways and wrapping round the glass. The flakes are placed in the plane
// of the frame's face, inside what of the night shows there (the reveal's
// depth hides DEPTH + FACE of it on the left and at the foot), and clipped
// to it.
function snow(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const hid = FACE + DEPTH;
  const u0 = f.a - WIN.w / 2 + hid + 0.15;
  const w = f.a + WIN.w / 2 - 0.15 - u0;
  const lo = sillOf(f) + hid + 0.2;
  const hi = sillOf(f) + WIN.h - 0.3;
  if (hi - lo < 1.5) return; // (no culling: the scene finds the overlay's pieces on a pen of its own size)
  pen.save();
  pen.beginPath();
  k.trace(opening(f));
  pen.clip();
  pen.beginPath();
  k.trace(opening(f, -DEPTH));
  pen.clip();
  const n = 6 + Math.floor(hash(f.k, 31) * 4);
  pen.beginPath();
  for (let i = 0; i < n; i++) {
    const speed = 0.8 + hash(f.k, i, 32) * 0.8;
    const span = hi - lo;
    const z = hi - ((v.t * speed + hash(f.k, i, 33) * span) % span);
    const drift = (v.t * (0.25 + hash(f.k, i, 34) * 0.3) + hash(f.k, i, 35) * w + Math.sin(v.t * 1.3 + i) * 0.25) % w;
    const u = u0 + (drift < 0 ? drift + w : drift);
    const r = Math.max(0.8, (0.12 + hash(f.k, i, 36) * 0.1) * s);
    const [x, y] = k.p(u, FACE, z);
    pen.moveTo(x + r, y);
    pen.arc(x, y, r, 0, Math.PI * 2);
  }
  pen.fillStyle = '#eef4faee';
  pen.fill();
  pen.restore();
}

// The hearth's light breathing on the floor and anyone round it.
function firelight(v: RoomView, L: Layout): void {
  const pit = decorOf(L).find((p) => p.art === DECOR_ART.hearth);
  if (!pit) return;
  const t = v.t;
  const n = 0.5 + 0.5 * (0.6 * Math.sin(t * 5.3) + 0.4 * Math.sin(t * 9.1 + 1.3));
  const pk = new Kit(v.pen, propAt(v.at, pit), v.s);
  pk.pool(8 + Math.sin(t * 2.3) * 0.4, 7, 16, 14, C.ember, 0.06 + 0.06 * n);
}

// The candles' flicker: a soft breath of light round each sconce and each
// candle ring.
function flicker(v: RoomView, plan: Plan): void {
  const G = girtZ(v.H);
  const lz = lampZ(G);
  const t = v.t;
  for (const wall of ['right', 'left'] as const) {
    const k = new Kit(v.pen, wallAt(v.at, wall, v.T), v.s);
    for (const [i, a] of plan.lamps[wall].entries()) {
      const f = 0.5 + 0.5 * Math.sin(t * (6.3 + (i % 3)) + i * 2.1) * Math.sin(t * 2.9 + i);
      const [x, y] = k.p(a + 0.2, PD + 1.2, lz + 2.0);
      softDot(v.pen, x, y, 1.7 * v.s, '#ffc070', 0.1 + 0.12 * f);
    }
    for (const f of plan.features) {
      if (f.wall !== wall || f.kind !== 'chandelier') continue;
      const q = 0.5 + 0.5 * Math.sin(t * 7.1 + f.k);
      const [x, y] = k.p(f.a, RING.out, G - 6.8);
      softDot(v.pen, x, y, 3.2 * v.s, '#ffc070', 0.08 + 0.1 * q);
    }
  }
}

