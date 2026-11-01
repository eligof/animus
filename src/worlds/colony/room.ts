import { Canvas } from '../../art/canvas.ts';
import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Rect } from '../../world/layout.ts';
import { planLayout, slotsOn, wallGaps } from '../../world/layout.ts';
import { hashString } from '../../world/rng.ts';
import type { PlacedProp } from '../../world/room.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import { lampsOn } from '../../art/scene/light.ts';
import type { PropArt, RoomArt, RoomLight, RoomView, WorldDef } from '../types.ts';
import { ball, dusk } from './bits.ts';
import { DECOR, DECOR_ART } from './decor.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, circle, hash, withAlpha } from './kit.ts';
import { NPCS } from './npcs.ts';
import { STATIONS } from './stations.ts';

// The colony's shell at dusk, after the frontier colony games: the walls
// are warm dressed fieldstone under a timber wall plate (the joists' ends
// out under it; in a tall room a girt over the windows, the harvest
// hanging from it to dry), four-pane windows onto green hills under a big
// evening sky, and between them what the colonists hung up: a shelf of
// preserves, a board of tools, a hide on a hoop. The floor is
// zoned the way a colony zones it: warm planks for living and eating,
// white tile under the research bench and the sick bay's bed, smooth stone
// slabs under the smithy and the tailoring bench, and a dashed yellow
// stockpile outline round the stores and each stack of logs or steel. The
// campfire warms the boards round it and the standing lamps pool light on
// them; at night the fire's light breathes and fireflies blink out in the
// hills. The windows sit in the free stretches of wall between the
// stations, worked out from the same plan the stage uses, and the zones
// under the decor from the same furnishing the stage makes.

type Wall = 'left' | 'right';
type Kind = 'window' | 'shelf' | 'rack' | 'pelt';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[] };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const SILL = 12; // the windows' sill
const BOARD = 3.2; // floorboard width
const BLOCK_L = 6; // a wall block's length
const BLOCK_H = 3; // a wall course's height

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and the windows on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'colony');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L) };
  PLANS.set(key, plan);
  return plan;
}

// Windows along each free stretch, spread evenly with a good stretch of
// stone between them; in the stone between (and in a stretch too short
// for a window) now and then something the colonists hung up: a shelf of
// preserves, a board of tools, a hide on a hoop, a couple of each to a
// wall (more on a long one), each in the middle of its stretch, clear of
// the windows. Over a station that stands low (the stockpile), the wall
// above it gets one too, hung well clear of its top.
const WINDOW = 10;
const BETWEEN = 14;
const PIECE: Record<Exclude<Kind, 'window'>, number> = { shelf: 7, rack: 8, pelt: 5.5 };
const PIECES = ['shelf', 'pelt', 'rack'] as const;
export const LOW = 6; // a station no taller than this has a piece hung over it
const CLEAR = 1.5; // from a window

function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  let hung = 0;
  let n = 0;
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    const hungOf: Partial<Record<Kind, number>> = {};
    const cap = Math.max(2, Math.round(end / 50));
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      const len = a1 - a0;
      if (len < 3) continue;
      const count = len < WINDOW ? 0 : Math.max(1, Math.floor((len + BETWEEN) / (WINDOW + BETWEEN)));
      const gap = (len - count * WINDOW) / (count + 1);
      const at: number[] = [];
      for (let i = 0; i < count; i++) {
        at.push(a0 + gap + i * (WINDOW + gap) + WINDOW / 2);
        out.push({ wall, kind: 'window', a: at[i], w: WINDOW, k: n++ * 7 + i });
      }
      // the stone either side of each window (the whole stretch when it
      // has none), the windows' clearance taken off
      const free: Array<[number, number]> = [];
      let from = a0;
      for (const a of at) {
        free.push([from, a - WINDOW / 2 - CLEAR]);
        from = a + WINDOW / 2 + CLEAR;
      }
      free.push([from, a1]);
      for (const [f0, f1] of free) {
        const kind = PIECES.map((_, i) => PIECES[(hung + i) % PIECES.length]).find((p) => (hungOf[p] ?? 0) < cap && PIECE[p] <= f1 - f0);
        if (!kind) continue;
        out.push({ wall, kind, a: (f0 + f1) / 2, w: PIECE[kind], k: n++ * 7 + 3 });
        hungOf[kind] = (hungOf[kind] ?? 0) + 1;
        hung++;
      }
    }
    // a board of tools (or a shelf) over the low stations
    for (const q of slotsOn(L, wall)) {
      if (STATIONS[q.kind].height > LOW) continue;
      const a0 = (wall === 'right' ? q.x0 : q.y0) + 1;
      const kind = (['rack', 'shelf'] as const).find((p) => PIECE[p] <= q.len - 2);
      if (kind) out.push({ wall, kind, a: a0 + (q.len - 2) / 2, w: PIECE[kind], k: n++ * 7 + 5 });
    }
  }
  return out;
}

// Windows: sill and top (z) for a wall H tall.
function windowZ(H: number): { z0: number; z1: number } {
  return { z0: SILL, z1: Math.min(H - 9, 30) };
}

// ── the floor's zones ────────────────────────────────────────────────────────
// Where the stage furnishes the room (planRoom, seeded by the world's id,
// with the colony's stations, decor and locals), and so which floor goes
// where: white tile under the research bench and the sick bay (one stretch
// of it when they stand near each other on a wall), stone slabs under the
// smithy and the tailoring bench, a stockpile outline round the stores and
// each stack.

export type ZoneKind = 'tile' | 'stone' | 'carpet' | 'stock';
export type Zone = Rect & { kind: ZoneKind };
type Furnished = { zones: Zone[] };

const FURNISHED = new Map<string, Furnished>();

// The floor's zones for a room this size (for the tests).
export function zonesFor(W: number, D: number, H: number, T: number): Zone[] {
  return furnished({ W, D, H, T }).zones;
}
const NAMES = new Map<PropArt, string>(Object.entries(DECOR_ART).map(([n, a]) => [a, n]));

function furnished(v: { W: number; D: number; H: number; T: number }): Furnished {
  const key = `${v.W}x${v.D}x${v.H}x${v.T}`;
  const hit = FURNISHED.get(key);
  if (hit) return hit;
  const { L } = planFor(v.W, v.D, v.H, v.T);
  const out: Furnished = { zones: [] };
  FURNISHED.set(key, out);
  if (!L.slots.length) return out;
  const world = { id: 'colony', stations: STATIONS, decor: DECOR, npcs: NPCS } as unknown as WorldDef;
  const room = planRoom(world, L, hashString('colony'));
  const decor = (name: string) => room.props.filter((p) => !p.slot && NAMES.get(p.art) === name);
  const slot = (k: SlotKind) => room.props.find((p) => p.slot?.kind === k);
  const clip = (r: Rect): Rect => ({ x0: Math.max(L.T, r.x0), y0: Math.max(L.T, r.y0), x1: Math.min(L.W, r.x1), y1: Math.min(L.D, r.y1) });
  const add = (kind: ZoneKind, r: Rect) => out.zones.push({ kind, ...clip(r) });
  const others = (r: Rect, mine: PlacedProp[]) => room.props.some((p) => !mine.includes(p) && !!p.slot && overlaps(footprint(p), r));
  // the lab and the sick bay, on tile
  const lab = slot('read');
  const beds = decor('hospital');
  const near = lab ? beds.filter((b) => !b.island && b.wall === lab.wall) : [];
  const merged = lab && near.length ? union([backed(lab, 3, 6), ...near.map((b) => backed(b, 2, 3))]) : null;
  if (lab && merged && others(merged, [lab, ...near]) === false && span(merged, lab.wall) - lab.len - near[0].len <= 30) add('tile', merged);
  else {
    if (lab) add('tile', backed(lab, 3, 6));
    for (const b of beds) add('tile', b.island ? grown(b, 2) : backed(b, 2, 3));
  }
  // the workshop, on stone
  const forge = slot('run');
  if (forge) add('stone', forge.island ? grown(forge, 2.5) : backed(forge, 2.5, 5));
  const bench = slot('write');
  if (bench) add('stone', bench.island ? grown(bench, 2) : backed(bench, 2, 5.5));
  for (const p of [...decor('workbench'), ...decor('stove')]) add('stone', p.island ? grown(p, 1.5) : backed(p, 1.5, 3));
  // a red carpet by the colonist's bed
  for (const p of decor('bed')) add('carpet', p.island ? grown(p, 1.5) : backed(p, 1, 4));
  // the stockpiles
  const stores = slot('search');
  if (stores) add('stock', stores.island ? grown(stores, 1) : backed(stores, 1, 1.5));
  for (const p of decor('stack')) add('stock', grown(p, 1));
  return out;
}

const overlaps = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
const union = (rs: Rect[]): Rect => ({ x0: Math.min(...rs.map((r) => r.x0)), y0: Math.min(...rs.map((r) => r.y0)), x1: Math.max(...rs.map((r) => r.x1)), y1: Math.max(...rs.map((r) => r.y1)) });
const span = (r: Rect, wall: Wall) => (wall === 'right' ? r.x1 - r.x0 : r.y1 - r.y0);

// A wall prop's floor, `pad` past either end along the wall and `out` past
// its front, back to the wall.
function backed(p: PlacedProp, pad: number, out: number): Rect {
  const r = footprint(p);
  return p.wall === 'right' ? { x0: r.x0 - pad, y0: r.y0, x1: r.x1 + pad, y1: r.y1 + out } : { x0: r.x0, y0: r.y0 - pad, x1: r.x1 + out, y1: r.y1 + pad };
}

// An island's floor, `pad` all round.
function grown(p: PlacedProp, pad: number): Rect {
  const r = footprint(p);
  return { x0: r.x0 - pad, y0: r.y0 - pad, x1: r.x1 + pad, y1: r.y1 + pad };
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots round the campfire (warm either side, a log seat in
// front), a second log seat, and a look out of the windows at the hills.
export function colonyPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L);
  const fire = slot('idle');
  if (fire) out.push({ ...at(fire, -4, 9), kind: 'seat', face: mid(fire) });
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

// ── drawing ────────────────────────────────────────────────────────────────

const wallAt = (P: At, wall: Wall, T: number): At => frame(P, wall, wall === 'right' ? 0 : T, wall === 'right' ? T : 0);

export const room: RoomArt = {
  draw(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const k = new Kit(v.pen, v.at, v.s);
    v.pen.save();
    floor(k, v, plan);
    for (const wall of ['right', 'left'] as const) wallFace(new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), v, plan, wall);
    shell(k, v);
    v.pen.restore();
  },
  // The light the shell gives: the golden evening through each window, its
  // cross of glazing bars cut out of the patch on the floor; moonlight at
  // night. (The fire, the forge and the lamps give theirs as props.)
  lights(v): RoomLight[] {
    const { z0, z1 } = windowZ(v.H);
    return planFor(v.W, v.D, v.H, v.T).features.filter((f) => f.kind === 'window').map((f) => ({ kind: 'window', wall: f.wall, u: f.a, w: f.w - 2.4, z0, z1, bars: 1, rails: 1, color: '#ffd29a', strength: 1.35, night: '#9fb6ee', moon: 0.6 }));
  },
  // The scene draws the overlay once through a pen that only measures
  // (to find its pieces: everything must be drawn then, so any pen not a
  // canvas gets it all), then once for each piece onto a canvas just that
  // size: there, what lies off the canvas is skipped, so a piece costs its
  // own window, not every one.
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const clip = v.pen instanceof Canvas;
    const { z0, z1 } = windowZ(v.H);
    const walls = { right: new Kit(v.pen, wallAt(v.at, 'right', v.T), v.s), left: new Kit(v.pen, wallAt(v.at, 'left', v.T), v.s) };
    v.pen.save();
    firelight(v, plan, clip);
    for (const f of plan.features) {
      if (f.kind !== 'window') continue;
      const k = walls[f.wall];
      if (clip && !k.sees(f.a - f.w / 2, -1, z0, f.a + f.w / 2, 0, z1)) continue;
      fireflies(k, v, f);
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const BOARDS = [C.board, '#aa6a40', '#9a5a36', '#a66640', '#965834'];
const RED = '#8e5030'; // a board now and then from another tree

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  if (!k.sees(T, T, 0, W, D, 0, 8)) return;
  // Wide boards along x, butt joints staggered row by row; one path a tone.
  const rows = Math.ceil((D - T) / BOARD);
  const runs: Array<Array<[number, number, number, number]>> = [...BOARDS, RED].map(() => []);
  const seams: Array<[P3, P3]> = [];
  const knots: Array<[number, number, number]> = [];
  const nails: Array<[number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const y0 = T + r * BOARD;
    const y1 = Math.min(D, y0 + BOARD);
    if (!k.sees(T, y0, 0, W, y1, 0, 8)) continue;
    let x = T - hash(r, 3) * 16;
    let i = 0;
    if (r > 0) seams.push([[T, y0, 0], [W, y0, 0]]);
    while (x < W) {
      const len = 10 + Math.floor(hash(r, i, 5) * 16);
      const x0 = Math.max(T, x);
      const x1 = Math.min(W, x + len);
      if (x1 > x0 && k.sees(x0, y0, 0, x1, y1, 0, 4)) {
        runs[hash(r, i, 10) < 0.08 ? BOARDS.length : Math.floor(hash(r, i, 9) * BOARDS.length)].push([x0, y0, x1, y1]);
        if (hash(r, i, 11) < 0.35) knots.push([x0 + (x1 - x0) * (0.2 + hash(r, i, 12) * 0.6), y0 + BOARD * (0.3 + hash(r, i, 13) * 0.4), hash(r, i, 14)]);
        if (x + len < W) {
          seams.push([[x + len, y0, 0], [x + len, y1, 0]]);
          // a pair of nails either side of the butt joint
          if (s >= 4) for (const dx of [-0.45, 0.45]) nails.push([x + len + dx, y0 + 0.75], [x + len + dx, y1 - 0.75]);
        }
      }
      x += len;
      i++;
    }
  }
  runs.forEach((list, ti) => {
    if (!list.length) return;
    pen.beginPath();
    for (const [x0, y0, x1, y1] of list) k.trace([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
    pen.fillStyle = BOARDS[ti] ?? RED;
    pen.fill();
  });
  // the grain: a long line down each board, then the seams and the knots
  if (s >= 3) {
    const grain: Array<[P3, P3]> = [];
    for (const list of runs) {
      for (const [x0, y0, x1] of list) {
        const n = hash(Math.round(x0 * 7), Math.round(y0 * 3), 15);
        grain.push([[x0 + 0.6, y0 + 0.9 + n * 0.5, 0], [x1 - 0.8 - n * 2, y0 + 0.9 + n * 0.5, 0]]);
        if (k.fine) grain.push([[x0 + 1.4 + n * 2, y0 + 2.1 + n * 0.4, 0], [x1 - 0.6, y0 + 2.1 + n * 0.4, 0]]);
      }
    }
    k.segs(grain, withAlpha(C.boardSeam, 0.22), Math.max(0.6, 0.08 * s));
  }
  k.segs(seams, withAlpha(C.boardSeam, 0.8), Math.max(0.8, 0.13 * s));
  pen.beginPath();
  for (const [x, y, h] of knots) {
    const [cx, cy] = k.p(x, y, 0);
    const r = (0.26 + h * 0.18) * s;
    pen.moveTo(cx + r, cy);
    pen.ellipse(cx, cy, r, r * 0.5, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha('#6a3a1e', 0.55);
  pen.fill();
  if (nails.length) {
    pen.beginPath();
    for (const [x, y] of nails) {
      const [cx, cy] = k.p(x, y, 0);
      const r = 0.11 * s;
      pen.moveTo(cx + r, cy);
      pen.ellipse(cx, cy, r, r * 0.6, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = withAlpha('#3a2414', 0.6);
    pen.fill();
  }
  // a few specks of dirt trodden in
  pen.beginPath();
  for (let i = 0; i < Math.round(((W - T) * (D - T)) / 900); i++) {
    const x = T + 3 + hash(i, 97) * (W - T - 6);
    const y = T + 3 + hash(i, 98) * (D - T - 6);
    if (!k.sees(x - 1, y - 1, 0, x + 1, y + 1, 0)) continue;
    const [cx, cy] = k.p(x, y, 0);
    const r = (0.3 + hash(i, 99) * 0.3) * s;
    pen.moveTo(cx + r, cy);
    pen.ellipse(cx, cy, r, r * 0.45, 0, 0, Math.PI * 2);
    pen.moveTo(cx + r * 1.4, cy + r * 0.3);
    pen.ellipse(cx + r, cy + r * 0.3, r * 0.4, r * 0.2, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha('#4a2e1a', 0.35);
  pen.fill();
  if (k.fine) {
    const sheen: Array<[P3, P3]> = [];
    for (let r = 0; r < rows; r++) sheen.push([[T, T + r * BOARD + 0.3, 0], [W, T + r * BOARD + 0.3, 0]]);
    k.segs(sheen, '#f0b07a30', 0.12 * s);
  }
  // The zones laid over the planks: tile, then stone, then the stockpiles'
  // outlines.
  const { zones } = furnished(v);
  for (const z of zones) if (z.kind === 'tile') tiles(k, z);
  for (const z of zones) if (z.kind === 'stone') slabs(k, z);
  for (const z of zones) if (z.kind === 'carpet') carpet(k, z);
  for (const z of zones) if (z.kind === 'stock') stockpile(k, z);
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#1a100640');
  g.addColorStop(0.3, '#1a100614');
  g.addColorStop(0.7, '#1a100600');
  g.addColorStop(1, '#1a10061c');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    if (wk.sees(T, 0, 0, end, 3.5, 0)) wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#1a100670'], [0.35, '#1a100624'], [1, '#1a100600']]), 0);
  }
  // A braided rug under the chess table.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const think = slot('think');
  if (think) {
    const tk = new Kit(pen, frame(v.at, think.wall, think.x0, think.y0), s);
    if (tk.sees(-3, -3, 0, think.len + 3, think.dep + 3, 0)) braided(tk, think.len / 2, think.dep / 2, 7.2, 4.8);
  }
  // The light round the fire, the forge, the lamps, the door's sun lamp and
  // under each window is the scene's (see room.lights and the props'
  // `light`).
}

// The zone's corners on the floor, a hair over the planks.
const quad = (z: Rect, h = 0.01): P3[] => [[z.x0, z.y0, h], [z.x1, z.y0, h], [z.x1, z.y1, h], [z.x0, z.y1, h]];

// Sterile white tile: a square grid, a lit edge along each tile's back
// sides, crisp ink round the whole.
const TILE = 2.5;

function tiles(k: Kit, z: Zone): void {
  if (!k.sees(z.x0, z.y0, 0, z.x1, z.y1, 0)) return;
  k.poly(quad(z), C.tile, 0);
  const grid: Array<[P3, P3]> = [];
  for (let x = z.x0 + TILE; x < z.x1 - 0.2; x += TILE) grid.push([[x, z.y0, 0.02], [x, z.y1, 0.02]]);
  for (let y = z.y0 + TILE; y < z.y1 - 0.2; y += TILE) grid.push([[z.x0, y, 0.02], [z.x1, y, 0.02]]);
  k.segs(grid, C.tileGrid, Math.max(0.8, 0.14 * k.s));
  // a few tiles a shade off, so it reads as tile and not a sheet
  k.pen.beginPath();
  for (let x = z.x0, i = 0; x < z.x1 - 0.2; x += TILE, i++) {
    for (let y = z.y0, j = 0; y < z.y1 - 0.2; y += TILE, j++) {
      if (hash(i, j, 91) < 0.82) continue;
      k.trace([[x + 0.12, y + 0.12, 0.02], [Math.min(z.x1, x + TILE) - 0.12, y + 0.12, 0.02], [Math.min(z.x1, x + TILE) - 0.12, Math.min(z.y1, y + TILE) - 0.12, 0.02], [x + 0.12, Math.min(z.y1, y + TILE) - 0.12, 0.02]]);
    }
  }
  k.pen.fillStyle = '#d6dcd9';
  k.pen.fill();
  k.pen.beginPath();
  k.trace(quad(z, 0.03));
  k.paint(null, k.thin);
}

// Smooth stone slabs in a running bond: three close tones, dark joints,
// each slab's back edges catching the light.
const SLABS = [C.slab, '#979388', '#868278'];
const SLAB_L = 4;

function slabs(k: Kit, z: Zone): void {
  if (!k.sees(z.x0, z.y0, 0, z.x1, z.y1, 0)) return;
  const byTone: P3[][][] = SLABS.map(() => []);
  const lit: Array<[P3, P3]> = [];
  const joints: Array<[P3, P3]> = [];
  for (let y = z.y0, r = 0; y < z.y1 - 0.1; y += SLAB_L, r++) {
    const y1 = Math.min(z.y1, y + SLAB_L);
    if (r) joints.push([[z.x0, y, 0.02], [z.x1, y, 0.02]]);
    for (let x = z.x0 - (r & 1 ? SLAB_L / 2 : 0), i = 0; x < z.x1 - 0.1; x += SLAB_L, i++) {
      const x0 = Math.max(z.x0, x);
      const x1 = Math.min(z.x1, x + SLAB_L);
      if (x1 - x0 < 0.1) continue;
      byTone[Math.floor(hash(r, i, 93) * SLABS.length)].push([[x0, y, 0.01], [x1, y, 0.01], [x1, y1, 0.01], [x0, y1, 0.01]]);
      if (x > z.x0) joints.push([[x, y, 0.02], [x, y1, 0.02]]);
      lit.push([[x0 + 0.25, y + 0.22, 0.02], [x1 - 0.3, y + 0.22, 0.02]], [[x0 + 0.22, y + 0.25, 0.02], [x0 + 0.22, y1 - 0.3, 0.02]]);
    }
  }
  byTone.forEach((qs, ti) => {
    if (!qs.length) return;
    k.pen.beginPath();
    for (const q of qs) k.trace(q);
    k.pen.fillStyle = SLABS[ti];
    k.pen.fill();
  });
  k.segs(lit, withAlpha('#d8d2c4', 0.45), Math.max(0.6, 0.1 * k.s));
  k.segs(joints, withAlpha(C.slabDark, 0.9), Math.max(0.8, 0.14 * k.s));
  k.pen.beginPath();
  k.trace(quad(z, 0.03));
  k.paint(null, k.thin);
}

// A red carpet: a darker border band round a warm red field, a pale
// stitched line inside the border.
function carpet(k: Kit, z: Zone): void {
  if (!k.sees(z.x0, z.y0, 0, z.x1, z.y1, 0)) return;
  k.poly(quad(z), '#7a2620', 0);
  const b = 0.7;
  const inner: Rect = { x0: z.x0 + b, y0: z.y0 + b, x1: z.x1 - b, y1: z.y1 - b };
  k.poly(quad(inner, 0.02), '#9a3a2e', 0);
  const i2: Rect = { x0: inner.x0 + 0.35, y0: inner.y0 + 0.35, x1: inner.x1 - 0.35, y1: inner.y1 - 0.35 };
  k.pen.beginPath();
  k.trace(quad(i2, 0.03));
  k.paint(null, Math.max(0.7, 0.08 * k.s), withAlpha('#e8b878', 0.6));
  k.pen.beginPath();
  k.trace(quad(z, 0.03));
  k.paint(null, k.thin);
}

// A stockpile zone: a yellow wash and a dashed yellow line just inside
// its edge.
function stockpile(k: Kit, z: Zone): void {
  if (!k.sees(z.x0, z.y0, 0, z.x1, z.y1, 0)) return;
  k.poly(quad(z), withAlpha(C.zone, 0.2), 0);
  const i = 0.5;
  const [x0, y0, x1, y1] = [z.x0 + i, z.y0 + i, z.x1 - i, z.y1 - i];
  const dashes: Array<[P3, P3]> = [];
  const run = (a: P3, b: P3) => {
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(1, Math.round(len / 1.6));
    for (let j = 0; j < n; j++) {
      const t0 = j / n;
      const t1 = t0 + (0.6 / n);
      dashes.push([[a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0, 0.03], [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1, 0.03]]);
    }
  };
  run([x0, y0, 0], [x1, y0, 0]);
  run([x1, y0, 0], [x1, y1, 0]);
  run([x1, y1, 0], [x0, y1, 0]);
  run([x0, y1, 0], [x0, y0, 0]);
  k.segs(dashes, withAlpha('#4a2a08', 0.5), Math.max(2, 0.42 * k.s), 'round');
  k.segs(dashes, '#f4e08a', Math.max(1.3, 0.28 * k.s), 'round');
}

// An oval rag rug, braided in rings of colour, ru x rv units.
function braided(k: Kit, cu: number, cv: number, ru: number, rv: number): void {
  const z = 0.04;
  k.shadow(cu, cv, ru * 1.02, rv * 1.05, 0.1);
  const rings: Color[] = ['#8a3a2e', '#d9a440', '#3f6a9a', '#e6d6b0', '#a8443a', '#5f8a4a', '#e6d6b0', '#c06a3a'];
  const oval = (r: number) => {
    const pts: P3[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      pts.push([cu + Math.cos(a) * (ru - (1 - r) * Math.min(ru, rv)), cv + Math.sin(a) * (rv - (1 - r) * Math.min(ru, rv)), z]);
    }
    return pts;
  };
  rings.forEach((c, i) => k.poly(oval(1 - i / rings.length), c, i === 0 ? k.thin : 0));
  if (k.fine) {
    // the braid's twist round each ring
    for (let i = 0; i < rings.length; i++) {
      const pts = oval(1 - (i + 0.5) / rings.length);
      const pen = k.pen;
      pen.beginPath();
      for (let j = 0; j < pts.length; j += 1) {
        const [x, y] = k.p(...pts[j]);
        pen.moveTo(x - 0.12 * k.s, y - 0.08 * k.s);
        pen.lineTo(x + 0.12 * k.s, y + 0.08 * k.s);
      }
      pen.strokeStyle = '#2a221640';
      pen.lineWidth = 0.08 * k.s;
      pen.stroke();
    }
  }
}

// ── walls ──────────────────────────────────────────────────────────────────

// Warm fieldstone, dressed square: five close tones, the bottom course a
// shade darker; the mortar between soft, so the wall steps back and the
// windows and the figures step forward.
const BLOCKS = ['#a08c70', '#968268', '#a99478', '#8f7c63', '#9c8a6e'];
const FOOTING = '#7e6c56';
const LENGTHS = [4.5, 6, 7.5]; // a block's length, by its hash
const PLATE = 2.4; // the timber wall plate along the top
const JOIST = 10; // the joist ends under it, about this far apart
const GIRT = 1.6; // a tall wall's girt over the window heads
// The girt's foot for a wall H tall (over the window heads), or null when
// the wall is not tall enough to want one.
const girtZ = (H: number): number | null => {
  const z = windowZ(H).z1 + 3.2;
  return H - PLATE - (z + GIRT) >= 8 ? z : null;
};

// Blocks of dressed fieldstone in courses, each block its own length
// (never a joint over the joint below), a soft mortar joint round it and
// a lit top edge; now and then one standing a little proud (lit along its
// top, a shadow under it and down its far end) or chipped at a corner. Over the stone a squared timber wall plate with the joists'
// ends under it; the windows and what hangs between them let into it.
function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 3, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const [ax0, ax1] = visibleAlong(k, T, end, 0, H);
  const seed = wall === 'right' ? 41 : 43;
  const mine = plan.features.filter((f) => f.wall === wall);
  const { z1: wz1 } = windowZ(H);
  const covered = (a0: number, a1: number, z0: number, z1: number) => mine.some((f) => a1 > f.a - f.w / 2 - 1 && a0 < f.a + f.w / 2 + 1 && z1 > SILL - 1.5 && z0 < (f.kind === 'window' ? wz1 + 1.5 : SILL + 10));
  const byTone: P3[][][] = BLOCKS.map(() => []);
  const footing: P3[][] = [];
  const joints: Array<[P3, P3]> = [];
  const tops: Array<[P3, P3]> = [];
  const feet: Array<[P3, P3]> = [];
  const proud: Array<[number, number, number, number]> = [];
  const chips: P3[][] = [];
  const lo = Math.max(T, ax0 - 8);
  const hi = Math.min(end, ax1 + 8);
  const zs = H - PLATE; // the stone stops under the plate
  // Every course is laid from the corner (whatever the pen sees), so each
  // tile of the shell finds the same blocks.
  let below: number[] = [];
  for (let r = 0, z0 = 0; z0 < zs - 0.01; r++, z0 += BLOCK_H) {
    const z1 = Math.min(zs, z0 + BLOCK_H);
    const show = k.sees(lo, 0, z0, hi, 0.2, z1, 4);
    if (show && r) joints.push([[lo, 0, z0], [hi, 0, z0]]);
    const here: number[] = [];
    let a = T - hash(r, seed, 1) * 4;
    for (let i = 0; a < end; i++) {
      let len = LENGTHS[Math.floor(hash(r, i, seed) * LENGTHS.length)];
      for (let t = 0; t < 3 && below.some((b) => Math.abs(b - (a + len)) < 1.2); t++) len = LENGTHS[(LENGTHS.indexOf(len) + 1) % LENGTHS.length];
      const a0 = Math.max(T, a);
      const a1 = Math.min(end, a + len);
      if (a + len < end) here.push(a + len);
      if (show && a1 >= lo && a0 <= hi && a1 - a0 >= 0.2) {
        const q: P3[] = [[a0, 0, z0], [a1, 0, z0], [a1, 0, z1], [a0, 0, z1]];
        const t = Math.floor(hash(r, i, seed + 2) * BLOCKS.length);
        (r ? byTone[t] : footing).push(q);
        if (a > T) joints.push([[a, 0, z0], [a, 0, z1]]);
        tops.push([[a0 + 0.3, 0, z1 - 0.32], [a1 - 0.3, 0, z1 - 0.32]]);
        feet.push([[a0 + 0.3, 0, z0 + 0.25], [a1 - 0.3, 0, z0 + 0.25]]);
        const h = hash(r, i, seed + 3);
        if (r && z1 < zs - 0.5 && a0 > T + 1 && a1 < end - 1 && !covered(a0, a1, z0, z1)) {
          if (h < 0.08) proud.push([a0, a1, z0, z1]);
          else if (h > 0.9) {
            // a corner knocked off: which of the block's corners by its hash
            const cu = hash(r, i, seed + 4) < 0.5 ? a0 : a1;
            const cz = hash(r, i, seed + 5) < 0.5 ? z0 : z1;
            const du = cu === a0 ? 1 : -1;
            const dz = cz === z0 ? 1 : -1;
            chips.push([[cu, 0.01, cz], [cu + du * 0.9, 0.01, cz], [cu + du * 0.25, 0.01, cz + dz * 0.25], [cu, 0.01, cz + dz * 0.7]]);
          }
        }
      }
      a += len;
    }
    below = here;
  }
  [...byTone, footing].forEach((qs, ti) => {
    if (!qs.length) return;
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = tone(BLOCKS[ti] ?? FOOTING);
    pen.fill();
  });
  k.segs(tops, withAlpha(C.blockTop, 0.4), Math.max(0.8, 0.2 * s));
  k.segs(feet, withAlpha('#3a3228', 0.14), Math.max(0.6, 0.14 * s));
  k.segs(joints, withAlpha(INK, 0.4), Math.max(0.8, 0.11 * s));
  if (chips.length) {
    pen.beginPath();
    for (const q of chips) k.trace(q);
    pen.fillStyle = tone('#7a6a55');
    pen.fill();
  }
  // the proud ones: a block standing out a little, its face a shade
  // lighter, its top catching the light and a shadow under it and down
  // its far end
  if (proud.length) {
    pen.beginPath();
    for (const [a0, a1, z0, z1] of proud) k.trace([[a0 + 0.1, 0.01, z0 + 0.1], [a1 - 0.1, 0.01, z0 + 0.1], [a1 - 0.1, 0.01, z1 - 0.1], [a0 + 0.1, 0.01, z1 - 0.1]]);
    pen.fillStyle = withAlpha('#fff2dc', 0.1);
    pen.fill();
    const tops2: Array<[P3, P3]> = [];
    const under: P3[][] = [];
    for (const [a0, a1, z0, z1] of proud) {
      tops2.push([[a0 + 0.15, 0.02, z1 - 0.15], [a1 - 0.15, 0.02, z1 - 0.15]]);
      under.push([[a0 + 0.1, 0.02, z0 + 0.1], [a1 - 0.1, 0.02, z0 + 0.1], [a1 - 0.1, 0.02, z1 - 0.1]]);
    }
    k.segs(tops2, withAlpha('#f4e6c8', 0.75), Math.max(0.9, 0.18 * s), 'round');
    pen.beginPath();
    for (const q of under) q.forEach(([u, w, z], j) => {
      const [x, y] = k.p(u, w, z);
      if (j) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
    pen.strokeStyle = withAlpha('#2a1e10', 0.4);
    pen.lineWidth = Math.max(1, 0.2 * s);
    pen.lineJoin = 'round';
    pen.stroke();
  }
  // the blocks darken up toward the top, out of the lamps' reach, and in
  // the far corner
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, 0, H, [[0, '#1a100600'], [0.5, '#1a100608'], [1, '#1a100638']]), 0);
  if (k.sees(T, 0, 0, T + 10, 0.5, H)) k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#1a100650'], [1, '#1a100600']]), 0);
  wallPlate(k, T, end, H, lo, hi, seed, tone);
  if (girtZ(H) === null) pegRail(k, T, end, H, lo, hi, seed, tone, mine);
  else girt(k, T, end, H, lo, hi, seed, tone, mine);
  for (const f of mine) {
    if (f.kind === 'window') {
      if (k.sees(f.a - f.w / 2 - 1, 0, SILL - 3, f.a + f.w / 2 + 1, 2.5, wz1 + 2)) windowArt(k, v, f, lit);
    } else if (k.sees(f.a - f.w / 2 - 1, 0, SILL - 1, f.a + f.w / 2 + 1, 3, SILL + 11)) {
      if (f.kind === 'shelf') shelfArt(k, f, tone);
      else if (f.kind === 'rack') rackArt(k, f, tone);
      else peltArt(k, f, tone);
    }
  }
}

// The wall plate: a squared timber laid along the top of the stone, butt
// joints along it and its grain, its top edge lit; under it the joists'
// ends stand out of the wall, their end grain toward the room.
function wallPlate(k: Kit, T: number, end: number, H: number, lo: number, hi: number, seed: number, tone: Tone): void {
  const z0 = H - PLATE;
  if (!k.sees(lo, 0, z0 - 2, hi, 1.5, H)) return;
  k.box(T, 0, z0, end - T, 0.35, PLATE, tone(C.log), { line: k.lw, stripe: false });
  const n = 0.36;
  const butts: Array<[P3, P3]> = [];
  for (let a = T + 9 + hash(seed, 51) * 6; a < end - 2; a += 12) if (a > lo - 1 && a < hi + 1) butts.push([[a, n, z0 + 0.05], [a, n, H - 0.05]]);
  k.segs(butts, withAlpha(INK, 0.6), Math.max(0.8, k.thin * 0.8));
  if (k.s >= 3) {
    const grain: Array<[P3, P3]> = [];
    for (const [f, d] of [[0.35, 0.1], [0.62, 0.35]] as const) grain.push([[Math.max(T, lo) + d, n, z0 + PLATE * f], [Math.min(end, hi) - d, n, z0 + PLATE * f]]);
    k.segs(grain, withAlpha(C.bark, 0.35), Math.max(0.6, 0.07 * k.s));
  }
  k.line([[T, n, H - 0.18], [end, n, H - 0.18]], withAlpha(C.plankLight, 0.5), Math.max(0.7, 0.12 * k.s));
  // the joists' ends, every JOIST along, clear of the corner
  const ends: P3[] = [];
  for (let a = T + 4 + hash(seed, 52) * 2; a < end - 2; a += JOIST) {
    if (a < lo - 2 || a > hi + 2) continue;
    k.box(a - 0.6, 0, z0 - 1.3, 1.2, 1.2, 1.3, tone(C.plankDark), { line: k.thin, stripe: false });
    ends.push([a, 1.21, z0 - 0.65]);
  }
  for (const [u, w, z] of ends) {
    k.face(u, w, z, 0.42, tone(C.plankLight), Math.max(0.6, k.thin * 0.6), 14);
    if (k.s < 4) continue;
    // a growth ring
    k.pen.beginPath();
    k.trace(circle(u, w + 0.01, z, 0.2, 10));
    k.paint(null, Math.max(0.6, 0.06 * k.s), withAlpha(C.bark, 0.8));
  }
}

// The stretch of the wall (along) the pen can see between heights z0..z1.
function visibleAlong(k: Kit, a0: number, a1: number, z0: number, z1: number): [number, number] {
  let lo = a1;
  let hi = a0;
  const step = 4;
  for (let a = a0; a <= a1 + step; a += step) {
    const aa = Math.min(a, a1);
    if (k.sees(aa - step, 0, z0, aa + step, 1, z1, 16)) {
      lo = Math.min(lo, aa - step);
      hi = Math.max(hi, aa + step);
    }
  }
  return [lo, hi];
}

// A four-pane window in a plank frame: the reveal, glass onto the hills
// at dusk, a cross of glazing bars, a stone sill with a little pot on it.
function windowArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const a = f.a;
  const w = f.w - 2.4; // the opening, inside the casing
  const depth = 0.9;
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  // the low sun warm on the stone round the opening, down toward the
  // floor (in the evening; not at night)
  if (lampsOn(v)) k.wash(a, 0.03, z0 + (z1 - z0) * 0.25, w * 0.95, (z1 - z0) * 0.9, '#ffcf9a', 0.16);
  // the casing: plank jambs
  k.box(a - w / 2 - 1.2, 0, z0 - 0.2, 1.2, 0.5, z1 - z0 + 0.6, C.plankLight, { line: k.lw, stripe: false });
  k.box(a + w / 2, 0, z0 - 0.2, 1.2, 0.5, z1 - z0 + 0.6, C.plankLight, { line: k.lw, stripe: false });
  // the reveal (the wall's thickness), then the glass set back in it
  const open: P3[] = [[a - w / 2, 0.02, z0], [a + w / 2, 0.02, z0], [a + w / 2, 0.02, z1], [a - w / 2, 0.02, z1]];
  k.poly(open, tone('#6e665a'), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  dusk(k, a - w / 2 - 0.5, a + w / 2 + 0.5, z0, z1, -depth, f.k, !lampsOn(v));
  // the reveal: the stone's inner face (seen past the -u side), the sill's
  // inside at the foot, and a shadow under the head
  k.poly([[a - w / 2, 0.02, z0], [a - w / 2, -depth, z0], [a - w / 2, -depth, z1], [a - w / 2, 0.02, z1]], k.side('#a49a88', 1, 0, 0.2), 0);
  k.poly([[a - w / 2, 0.02, z0], [a + w / 2, 0.02, z0], [a + w / 2, -depth, z0], [a - w / 2, -depth, z0]], tone('#b8ae9c'), 0);
  k.poly([[a - w / 2, -depth, z1 - 0.8], [a + w / 2, -depth, z1 - 0.8], [a + w / 2, 0.02, z1], [a - w / 2, 0.02, z1]], withAlpha('#2a1a0a', 0.35), 0);
  pen.restore();
  // glazing bars: a cross
  const bw = Math.max(1.2, 0.3 * s);
  const zm = z0 + (z1 - z0) * 0.5;
  const bars: P3[][] = [
    [[a, -depth * 0.5, z0], [a, -depth * 0.5, z1]],
    [[a - w / 2, -depth * 0.5, zm], [a + w / 2, -depth * 0.5, zm]],
  ];
  for (const b of bars) k.line(b, INK, bw + k.thin * 1.4);
  for (const b of bars) k.line(b, tone('#c8945a'), bw);
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  // the head over it (a plank lintel), and a stone sill with a pot on it
  k.box(a - w / 2 - 1.6, 0, z1 + 0.4, w + 3.2, 0.8, 0.9, C.plank, { line: k.lw });
  k.box(a - w / 2 - 1.5, 0, z0 - 1.0, w + 3.0, 1.3, 0.8, '#b0a692', { line: k.lw });
  // the dusk catching the sill's front edge
  k.line([[a - w / 2 - 1.3, 1.31, z0 - 0.32], [a + w / 2 + 1.3, 1.31, z0 - 0.32]], withAlpha('#ffd8a8', 0.55), Math.max(0.7, 0.12 * s));
  if (hash(f.k, 31) < 0.6) {
    const pu = a + (hash(f.k, 32) < 0.5 ? -1 : 1) * (w / 2 - 0.9);
    k.cyl(pu, 0.7, z0 - 0.2, 0.55, 1.0, '#b8643a');
    k.disc(pu, 0.7, z0 + 0.78, 0.45, '#4a3122', 0);
    const [x, y] = k.p(pu, 0.7, z0 + 0.85);
    for (let i = 0; i < 5; i++) {
      const th = -Math.PI / 2 + (i - 2) * 0.5;
      const L = (1.0 + hash(f.k, i, 33) * 0.6) * s;
      pen.beginPath();
      pen.ellipse(x + Math.cos(th) * L * 0.5, y + Math.sin(th) * L * 0.5, L * 0.5, L * 0.22, th, 0, Math.PI * 2);
      k.paint(i & 1 ? C.leaf : C.green, k.thin * 0.8);
    }
  }
}

// In a tall room a second timber, a girt, runs along the wall over the
// window heads, and the harvest hangs from it to dry between the windows:
// strings of onions, bunches of herbs, corn cobs with their husks pulled
// back.
function girt(k: Kit, T: number, end: number, H: number, lo: number, hi: number, seed: number, tone: Tone, mine: Feature[]): void {
  const z0 = girtZ(H);
  if (z0 === null || !k.sees(lo, 0, z0 - 5, hi, 1.5, z0 + GIRT)) return;
  k.box(T, 0, z0, end - T, 0.35, GIRT, tone(C.log), { line: k.lw, stripe: false });
  const n = 0.36;
  const butts: Array<[P3, P3]> = [];
  for (let a = T + 5 + hash(seed, 53) * 8; a < end - 2; a += 14) if (a > lo - 1 && a < hi + 1) butts.push([[a, n, z0 + 0.05], [a, n, z0 + GIRT - 0.05]]);
  k.segs(butts, withAlpha(INK, 0.6), Math.max(0.8, k.thin * 0.8));
  k.line([[T, n, z0 + GIRT - 0.15], [end, n, z0 + GIRT - 0.15]], withAlpha(C.plankLight, 0.5), Math.max(0.7, 0.12 * k.s));
  // the harvest, every few units along, clear of the window heads
  for (let a = T + 4 + hash(seed, 54) * 3, i = 0; a < end - 3; a += 4 + hash(seed, i, 55) * 2.5, i++) {
    if (a < lo - 2 || a > hi + 2 || hash(seed, i, 56) < 0.15) continue;
    if (mine.some((f) => f.kind === 'window' && Math.abs(a - f.a) < f.w / 2 + 1.2)) continue;
    const kind = Math.floor(hash(seed, i, 57) * 3);
    k.face(a, n + 0.05, z0 + 0.5, 0.18, C.bark, k.thin, 8);
    if (kind === 0) onions(k, a, n + 0.3, z0 + 0.5, i, tone);
    else if (kind === 1) herbs(k, a, n + 0.3, z0 + 0.5, i, tone);
    else corn(k, a, n + 0.3, z0 + 0.5, tone);
  }
}

// In a room too low for a girt, a peg rail runs along the stone under the
// window heads instead, across each stretch of 7 units or more between the
// windows, the harvest hung from its pegs (none over what hangs below).
function pegRail(k: Kit, T: number, end: number, H: number, lo: number, hi: number, seed: number, tone: Tone, mine: Feature[]): void {
  const z = windowZ(H).z1 - 2;
  if (!k.sees(lo, 0, z - 4.5, hi, 1.5, z + 1)) return;
  const wins = mine.filter((f) => f.kind === 'window').map((f) => [f.a - f.w / 2 - 0.8, f.a + f.w / 2 + 0.8] as const).sort((p, q) => p[0] - q[0]);
  const gaps: Array<[number, number]> = [];
  let from = T + 1.5;
  for (const [w0, w1] of wins) {
    gaps.push([from, w0]);
    from = w1;
  }
  gaps.push([from, end - 1.5]);
  const pieces = mine.filter((f) => f.kind !== 'window');
  for (const [g0, g1] of gaps) {
    if (g1 - g0 < 7 || g1 < lo - 2 || g0 > hi + 2) continue;
    k.box(g0, 0, z - 0.4, g1 - g0, 0.3, 0.8, tone(C.plankDark), { line: k.thin, stripe: false });
    k.line([[g0 + 0.1, 0.31, z + 0.3], [g1 - 0.1, 0.31, z + 0.3]], withAlpha(C.plankLight, 0.5), Math.max(0.6, 0.1 * k.s));
    const n = Math.max(1, Math.floor((g1 - g0 - 1) / 3));
    const step = (g1 - g0) / (n + 1);
    for (let i = 1; i <= n; i++) {
      const a = g0 + i * step;
      const j = Math.round(a * 7) + seed;
      k.rod([[a, 0.3, z], [a, 0.8, z + 0.1]], tone(C.iron), 0.12);
      if (hash(j, 58) < 0.2 || pieces.some((f) => Math.abs(a - f.a) < f.w / 2 + 0.8)) continue;
      const kind = Math.floor(hash(j, 59) * 3);
      if (kind === 0) onions(k, a, 0.66, z, j, tone);
      else if (kind === 1) herbs(k, a, 0.66, z, j, tone);
      else corn(k, a, 0.66, z, tone);
    }
  }
}

// A string of onions hung from a peg at (a, n, z).
function onions(k: Kit, a: number, n: number, z: number, seed: number, tone: Tone): void {
  const len = 2.8 + hash(seed, 61) * 0.8;
  k.line([[a, n - 0.25, z], [a, n, z - len]], '#6a5434', Math.max(0.7, 0.08 * k.s));
  for (let i = 0; i < 6; i++) {
    const t = 0.18 + (i / 6) * 0.8;
    const side = i % 2 ? 1 : -1;
    const zz = z - len * t;
    ball(k, a + side * 0.28, n + 0.05, zz, 0.36 - i * 0.015, tone(i % 3 === 1 ? '#b8603a' : '#c88a4a'), k.thin);
  }
}

// A bunch of herbs, tied and hung head down.
function herbs(k: Kit, a: number, n: number, z: number, seed: number, tone: Tone): void {
  k.line([[a, n - 0.2, z], [a, n, z - 0.8]], '#d9c9a0', Math.max(0.6, 0.07 * k.s));
  const stalks: Array<[P3, P3]> = [];
  for (let i = 0; i < 7; i++) {
    const t = (i - 3) / 3;
    stalks.push([[a, n, z - 0.8], [a + t * 0.8, n, z - 3.0 + Math.abs(t) * 0.4]]);
  }
  const green = hash(seed, 62) < 0.5 ? '#8a9a52' : '#a0985a';
  k.segs(stalks, INK, Math.max(1.5, 0.2 * k.s + k.thin), 'round');
  k.segs(stalks, tone(green), Math.max(0.9, 0.2 * k.s), 'round');
  k.rod([[a - 0.3, n, z - 0.95], [a + 0.3, n, z - 0.95]], C.cloth, 0.12);
}

// Three corn cobs, their husks pulled back and tied over the peg.
function corn(k: Kit, a: number, n: number, z: number, tone: Tone): void {
  for (const [du, dz] of [[-0.55, -0.3], [0.55, -0.4], [0, -0.1]] as const) {
    const cu = a + du;
    const top = z - 0.6 + dz;
    // the husks, back up over the tie
    k.poly([[cu, n, top], [cu - 0.55, n, top + 0.8], [cu - 0.2, n, top + 0.2]], tone('#e2d2a2'), k.thin);
    k.poly([[cu, n, top], [cu + 0.5, n, top + 0.9], [cu + 0.15, n, top + 0.15]], tone('#d6c48e'), k.thin);
    // the cob
    const pts: P3[] = [];
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2;
      pts.push([cu + Math.cos(th) * 0.36, n + 0.02, top - 1.15 + Math.sin(th) * 1.15]);
    }
    k.poly(pts, tone(du === 0 ? '#d8862e' : '#e8b840'), k.thin);
    if (k.s >= 4) k.segs([[[cu - 0.12, n + 0.03, top - 0.3], [cu - 0.12, n + 0.03, top - 2.0]], [[cu + 0.12, n + 0.03, top - 0.3], [cu + 0.12, n + 0.03, top - 2.0]]], withAlpha('#8a5a20', 0.5), Math.max(0.6, 0.05 * k.s));
  }
}

// ── what hangs between the windows ─────────────────────────────────────────

type Tone = (c: Color, d?: number) => Color;

// A piece's soft shadow on the stone behind it, down and to the right.
function cast(k: Kit, a0: number, a1: number, z0: number, z1: number, alpha = 0.22): void {
  k.poly([[a0 + 0.35, 0.02, z0 - 0.4], [a1 + 0.35, 0.02, z0 - 0.4], [a1 + 0.35, 0.02, z1 - 0.4], [a0 + 0.35, 0.02, z1 - 0.4]], withAlpha('#1a1006', alpha), 0, 0.4);
}

// A plank shelf on two iron brackets: a clay crock, a jar of apricot
// preserves under a cloth cap, a tall jar of gherkins and a tin; a bunch
// of herbs hung under it to dry.
function shelfArt(k: Kit, f: Feature, tone: Tone): void {
  const a = f.a;
  const w = f.w;
  const z = SILL + 5.5;
  const d = 1.5;
  cast(k, a - w / 2, a + w / 2, z - 0.6, z + 2.0, 0.18);
  for (const u of [a - w / 2 + 0.8, a + w / 2 - 0.8]) k.rod([[u, 0.05, z - 1.4], [u, d - 0.3, z - 0.05]], tone(C.iron), 0.15);
  // the herbs, under the front edge
  const hu = a - 0.6;
  k.line([[hu, d - 0.3, z], [hu, d - 0.3, z - 0.7]], withAlpha('#d9c9a0', 0.9), Math.max(0.6, 0.06 * k.s));
  const stalks: Array<[P3, P3]> = [];
  for (let i = 0; i < 6; i++) {
    const t = (i - 2.5) / 2.5;
    stalks.push([[hu, d - 0.3, z - 0.7], [hu + t * 0.7, d - 0.3 - Math.abs(t) * 0.2, z - 2.4 + Math.abs(t) * 0.3]]);
  }
  k.segs(stalks, INK, Math.max(1.4, 0.16 * k.s + k.thin), 'round');
  k.segs(stalks, tone('#8a9a52'), Math.max(0.8, 0.16 * k.s), 'round');
  k.rod([[hu - 0.25, d - 0.3, z - 0.85], [hu + 0.25, d - 0.3, z - 0.85]], C.cloth, 0.12);
  // the plank
  k.box(a - w / 2, 0, z, w, d, 0.4, C.plankLight, { line: k.lw });
  const zt = z + 0.4;
  // the crock, the preserves, the gherkins and a tin
  const crock = a - w / 2 + 1.05;
  k.cyl(crock, 0.75, zt, 0.6, 1.4, '#c8794a');
  k.disc(crock, 0.75, zt + 1.4, 0.45, '#7a3e22', 0);
  k.line([[crock - 0.6, 1.35, zt + 1.0], [crock + 0.55, 1.2, zt + 1.0]], withAlpha('#f0d0a0', 0.6), Math.max(0.6, 0.08 * k.s));
  const jam = a + 0.2;
  k.cyl(jam, 0.8, zt, 0.46, 1.1, '#e8a050');
  k.cyl(jam, 0.8, zt + 1.1, 0.54, 0.25, C.cloth, { line: k.thin });
  const pickles = a + 1.35;
  k.cyl(pickles, 0.8, zt, 0.42, 1.55, '#9ab868');
  if (k.s >= 4) {
    for (const [dz, du] of [[0.35, -0.12], [0.75, 0.1], [1.15, -0.05]] as const) k.disc(pickles + du, 1.15, zt + dz, 0.16, C.leaf, 0);
  }
  k.cyl(pickles, 0.8, zt + 1.55, 0.44, 0.2, C.steelDark, { line: k.thin });
  k.cyl(a + w / 2 - 0.75, 0.75, zt, 0.38, 0.8, C.steel, { line: k.thin });
  // a glint down the glass
  k.segs([[[jam - 0.25, 1.2, zt + 0.25], [jam - 0.25, 1.2, zt + 0.85]], [[pickles - 0.22, 1.18, zt + 0.25], [pickles - 0.22, 1.18, zt + 1.25]]], withAlpha('#fff8e0', 0.65), Math.max(0.6, 0.1 * k.s), 'round');
}

// A board of tools by the work: a saw, a hammer, a pair of tongs and a
// coil of rope, each hung on its pegs.
function rackArt(k: Kit, f: Feature, tone: Tone): void {
  const a = f.a;
  const w = f.w;
  const z0 = SILL + 1.6;
  const z1 = z0 + 6.4;
  cast(k, a - w / 2, a + w / 2, z0, z1);
  k.box(a - w / 2, 0, z0, w, 0.3, z1 - z0, C.plankLight, { line: k.lw, stripe: false });
  const n = 0.32;
  k.segs([[[a - w / 6, n, z0 + 0.1], [a - w / 6, n, z1 - 0.1]], [[a + w / 6, n, z0 + 0.1], [a + w / 6, n, z1 - 0.1]]], withAlpha(INK, 0.35), Math.max(0.6, k.thin * 0.7));
  // the saw, handle up
  const su = a - 2.7;
  k.poly([[su - 0.6, n, z1 - 1.3], [su + 0.65, n, z1 - 1.3], [su + 0.3, n, z0 + 0.8], [su - 0.35, n, z0 + 0.8]], k.side(C.steel, 0, 1), k.thin);
  k.poly([[su - 0.75, n + 0.02, z1 - 1.35], [su + 0.8, n + 0.02, z1 - 1.35], [su + 0.7, n + 0.02, z1 - 0.35], [su - 0.65, n + 0.02, z1 - 0.35]], C.log, k.thin, 0.2);
  if (k.s >= 4) {
    const teeth: Array<[P3, P3]> = [];
    for (let z = z0 + 0.95; z < z1 - 1.4; z += 0.38) {
      const e = su - 0.35 - ((z - z0 - 0.8) / (z1 - z0 - 2.1)) * 0.25;
      teeth.push([[e, n + 0.01, z], [e - 0.18, n + 0.01, z + 0.18]]);
    }
    k.segs(teeth, withAlpha(INK, 0.6), Math.max(0.6, 0.06 * k.s));
  }
  // the hammer, head up
  const hm = a - 0.4;
  k.rod([[hm, n + 0.08, z0 + 1.2], [hm, n + 0.08, z1 - 1.5]], C.log, 0.22);
  k.box(hm - 0.85, n, z1 - 1.6, 1.5, 0.3, 0.6, tone(C.iron), { line: k.thin, stripe: false });
  // the tongs, crossed
  const tg = a + 1.25;
  k.rod([[tg - 0.45, n + 0.08, z0 + 0.8], [tg + 0.35, n + 0.08, z1 - 2.6], [tg + 0.1, n + 0.08, z1 - 1.5]], tone(C.iron), 0.13);
  k.rod([[tg + 0.45, n + 0.08, z0 + 0.8], [tg - 0.35, n + 0.08, z1 - 2.6], [tg - 0.1, n + 0.08, z1 - 1.5]], tone(C.iron), 0.13);
  // the rope, coiled on its peg
  const ru = a + w / 2 - 1.35;
  const rz = z0 + 3.3;
  k.face(ru, n + 0.1, rz, 1.05, '#c8a870', k.thin, 20);
  k.face(ru, n + 0.12, rz, 0.45, tone(C.plankLight), k.thin, 14);
  k.pen.beginPath();
  k.trace(circle(ru, n + 0.13, rz, 0.75, 18));
  k.paint(null, Math.max(0.6, 0.07 * k.s), withAlpha('#8a6a40', 0.8));
  // the pegs
  const pegs: P3[] = [[su, n + 0.1, z1 - 0.15], [hm, n + 0.1, z1 - 0.85], [tg, n + 0.1, z1 - 1.25], [ru, n + 0.1, rz + 0.95]];
  for (const [u, w2, z] of pegs) k.face(u, w2 + 0.05, z, 0.16, C.bark, 0, 8);
}

// A hide stretched to dry on a willow hoop, laced to it all round, hung
// from a peg on a cord.
function peltArt(k: Kit, f: Feature, tone: Tone): void {
  const a = f.a;
  const zc = SILL + 5;
  const r = 2.25;
  const n = 0.4;
  cast(k, a - r, a + r, zc - r, zc + r, 0.16);
  // the cord up to its peg
  k.line([[a - 1.0, n, zc + r * 0.86], [a, 0.15, zc + r + 1.0], [a + 1.0, n, zc + r * 0.86]], '#4a3a26', Math.max(0.7, 0.08 * k.s));
  k.face(a, 0.2, zc + r + 1.0, 0.2, C.bark, k.thin, 8);
  // the hide: four legs, a neck and a tail, the hair side lighter at the
  // middle
  const pts: P3[] = [];
  const R = (th: number) => r * 0.66 * (1 + 0.2 * Math.cos(4 * (th - Math.PI / 4)) + 0.06 * Math.sin(th * 3 + 1));
  for (let i = 0; i < 32; i++) {
    const th = (i / 32) * Math.PI * 2;
    pts.push([a + Math.cos(th) * R(th) * 0.92, n + 0.02, zc + Math.sin(th) * R(th)]);
  }
  const g = k.pen.createRadialGradient(...k.p(a - 0.3, n, zc + 0.4), 0, ...k.p(a, n, zc), r * 0.8 * k.s);
  g.addColorStop(0, tone('#e2c08e'));
  g.addColorStop(1, tone('#b08458'));
  k.poly(pts, g, k.thin, 0.3);
  k.line([[a, n + 0.03, zc + R(Math.PI / 2) * 0.85], [a + 0.1, n + 0.03, zc], [a, n + 0.03, zc - R(-Math.PI / 2) * 0.85]], withAlpha('#8a5a32', 0.6), Math.max(0.6, 0.1 * k.s));
  // the lacing, edge to hoop
  if (k.s >= 3) {
    const lace: Array<[P3, P3]> = [];
    for (let i = 0; i < 14; i++) {
      const th = (i / 14) * Math.PI * 2 + 0.2;
      lace.push([[a + Math.cos(th) * R(th) * 0.92, n + 0.03, zc + Math.sin(th) * R(th)], [a + Math.cos(th) * r * 0.97, n + 0.03, zc + Math.sin(th) * r * 0.97]]);
    }
    k.segs(lace, withAlpha('#5a4630', 0.8), Math.max(0.6, 0.07 * k.s));
  }
  // the hoop of bent willow
  const hoop = circle(a, n + 0.04, zc, r, 32);
  hoop.push(hoop[0]);
  k.line(hoop, INK, Math.max(1.4, 0.24 * k.s + k.lw * 1.2));
  k.line(hoop, tone(C.log), Math.max(0.9, 0.24 * k.s));
  if (k.s >= 3) {
    const tie: P3 = [a + r * 0.71, n + 0.05, zc + r * 0.71];
    k.face(tie[0], tie[1], tie[2], 0.18, '#d9c9a0', k.thin, 8);
  }
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen } = k;
  const { W, D, H, T } = v;
  // the wall tops: dark weathered stone, so the room's frame stays quiet
  const cap = '#7a6a56';
  // the floor's cut edges
  if (k.sees(T, D - 1, -SLAB, W, D, 0) || k.sees(W - 1, T, -SLAB, W, D, 0)) {
    k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side(C.floorDark, 0, 1), k.lw);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side(C.floorDark, 1, 0), k.lw);
    k.line([[T, D, -0.4], [W, D, -0.4], [W, T, -0.4]], '#c07a4a', Math.max(1, 0.22 * k.s));
  }
  // the walls' cut ends: the stone's courses
  for (const [p, q, nu, nv] of [[[0, D], [T, D], 0, 1], [[W, 0], [W, T], 1, 0]] as const) {
    if (!k.sees(Math.min(p[0], q[0]), Math.min(p[1], q[1]), -SLAB, Math.max(p[0], q[0]), Math.max(p[1], q[1]), H)) continue;
    const pt = (f: number, z: number): P3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z];
    k.poly([pt(0, -SLAB), pt(1, -SLAB), pt(1, H), pt(0, H)], k.side(mix(BLOCKS[0], '#5e5a53', 0.35), nu, nv), k.lw);
    // the wall plate's end (and the girt's), toward the cut
    k.poly([pt(0, H - PLATE), pt(1, H - PLATE), pt(1, H), pt(0, H)], k.side(C.log, nu, nv), k.thin);
    const gz = girtZ(H);
    if (gz !== null) k.poly([pt(0, gz), pt(1, gz), pt(1, gz + GIRT), pt(0, gz + GIRT)], k.side(C.log, nu, nv), k.thin);
    pen.beginPath();
    for (let z = BLOCK_H, r = 1; z < H - PLATE - 0.4; z += BLOCK_H, r++) {
      if (gz !== null && z > gz - 0.2 && z < gz + GIRT + 0.2) continue;
      const [x0, y0] = k.p(...pt(0, z));
      const [x1, y1] = k.p(...pt(1, z));
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
      const f = r & 1 ? 0.35 : 0.7;
      const [x2, y2] = k.p(...pt(f, z));
      const [x3, y3] = k.p(...pt(f, Math.min(H - PLATE, z + BLOCK_H)));
      pen.moveTo(x2, y2);
      pen.lineTo(x3, y3);
    }
    pen.strokeStyle = withAlpha(INK, 0.45);
    pen.lineWidth = Math.max(0.7, 0.12 * k.s);
    pen.stroke();
  }
  if (k.sees(0, 0, H - 1, W, D, H + 1)) {
    k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
    k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.3), Math.max(1, 0.2 * k.s));
    k.line([[T - 0.3, D, H], [T - 0.3, T - 0.3, H], [W, T - 0.3, H]], '#8f7e68', Math.max(1, 0.16 * k.s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.6), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

// The campfire's light breathing on the boards round it: one warm pool,
// close round the ring of stones (the seats at its rim), brightening and
// dimming with the flames and swaying a little as they lean. Off the pen
// (`clip`), it is skipped.
function firelight(v: RoomView, plan: Plan, clip: boolean): void {
  const fire = plan.L.slots.find((s) => s.kind === 'idle');
  if (!fire) return;
  const t = v.t;
  const n = 0.5 + 0.5 * (0.6 * Math.sin(t * 5.3) + 0.4 * Math.sin(t * 8.9 + 1.3));
  const k = new Kit(v.pen, frame(v.at, fire.wall, fire.x0, fire.y0), v.s);
  const cu = fire.len / 2 + Math.sin(t * 2.1) * 0.35;
  const cv = fire.dep * 0.47;
  const [ru, rv] = [10, 8.5];
  if (clip && !k.sees(cu - ru, cv - rv, 0, cu + ru, cv + rv, 0)) return;
  k.pool(cu, cv, ru, rv, C.fire, 0.05 + 0.15 * n);
}

// Fireflies drifting and blinking over the hills outside a window (in the
// upper glass, above anyone's head, so they never paint over a figure).
function fireflies(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const w = f.w - 2.4;
  const lo = Math.max(z0 + 1, 17.5);
  const hi = z1 - 0.8;
  if (hi - lo < 1.5) return;
  const n = 3 + Math.floor(hash(f.k, 71) * 3);
  for (let i = 0; i < n; i++) {
    const ph = hash(f.k, i, 72) * 6.28;
    const sp = 0.25 + hash(f.k, i, 73) * 0.35;
    const blink = Math.sin(v.t * (1.3 + hash(f.k, i, 74)) + ph);
    if (blink < -0.2) continue;
    const u = f.a - w / 2 + 0.6 + ((hash(f.k, i, 75) * (w - 1.2) + Math.sin(v.t * sp + ph) * 1.2) % (w - 1.2) + (w - 1.2)) % (w - 1.2);
    const z = lo + 0.3 + hash(f.k, i, 76) * (hi - lo - 0.6) + Math.sin(v.t * sp * 1.7 + ph * 2) * 0.6;
    const zz = Math.max(lo, Math.min(hi, z));
    const a = Math.min(1, (blink + 0.2) / 0.8);
    const [x, y] = k.p(u, -0.85, zz);
    const r = Math.max(2, 0.8 * s);
    const g = pen.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, withAlpha(C.firefly, 0.75 * a));
    g.addColorStop(0.4, withAlpha('#c8f060', 0.3 * a));
    g.addColorStop(1, withAlpha('#c8f060', 0));
    pen.fillStyle = g;
    pen.beginPath();
    pen.arc(x, y, r, 0, Math.PI * 2);
    pen.fill();
    // the bright body
    pen.fillStyle = withAlpha('#fbffd0', a);
    pen.beginPath();
    pen.arc(x, y, Math.max(0.7, 0.16 * s), 0, Math.PI * 2);
    pen.fill();
  }
}
