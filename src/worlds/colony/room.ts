import { Canvas } from '../../art/canvas.ts';
import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Rect } from '../../world/layout.ts';
import { planLayout, wallGaps } from '../../world/layout.ts';
import { hashString } from '../../world/rng.ts';
import type { PlacedProp } from '../../world/room.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import type { PropArt, RoomArt, RoomView, WorldDef } from '../types.ts';
import { dusk } from './bits.ts';
import { DECOR, DECOR_ART } from './decor.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, withAlpha } from './kit.ts';
import { NPCS } from './npcs.ts';
import { STATIONS } from './stations.ts';

// The colony's shell at dusk, after the frontier colony games: the walls
// are plain thick blocks of cut stone in offset courses, bare but for
// four-pane windows onto green hills under a big evening sky. The floor is
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
type Kind = 'window';
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
// bare stone between them (the walls are plain; the floor and the
// furniture say what each corner is for).
const WINDOW = 10;
const BETWEEN = 9;

function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  let n = 0;
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      const len = a1 - a0;
      if (len < WINDOW) continue;
      const count = Math.max(1, Math.floor((len + BETWEEN) / (WINDOW + BETWEEN)));
      const gap = (len - count * WINDOW) / (count + 1);
      for (let i = 0; i < count; i++) out.push({ wall, kind: 'window', a: a0 + gap + i * (WINDOW + gap) + WINDOW / 2, w: WINDOW, k: n++ * 7 + i });
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
// each stack; and where the standing lamps stand, for their light.

export type ZoneKind = 'tile' | 'stone' | 'carpet' | 'stock';
export type Zone = Rect & { kind: ZoneKind };
type Furnished = { zones: Zone[]; lamps: Array<{ x: number; y: number }> };

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
  const out: Furnished = { zones: [], lamps: [] };
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
  for (const p of decor('lamp')) {
    const r = footprint(p);
    out.lamps.push({ x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 });
  }
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
      const k = walls[f.wall];
      if (clip && !k.sees(f.a - f.w / 2, -1, z0, f.a + f.w / 2, 0, z1)) continue;
      fireflies(k, v, f);
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const BOARDS = [C.board, '#aa6a40', '#9a5a36', '#a66640', '#965834'];

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  if (!k.sees(T, T, 0, W, D, 0, 8)) return;
  // Wide boards along x, butt joints staggered row by row; one path a tone.
  const rows = Math.ceil((D - T) / BOARD);
  const runs: Array<Array<[number, number, number, number]>> = BOARDS.map(() => []);
  const seams: Array<[P3, P3]> = [];
  const knots: Array<[number, number, number]> = [];
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
        runs[Math.floor(hash(r, i, 9) * BOARDS.length)].push([x0, y0, x1, y1]);
        if (hash(r, i, 11) < 0.35) knots.push([x0 + (x1 - x0) * (0.2 + hash(r, i, 12) * 0.6), y0 + BOARD * (0.3 + hash(r, i, 13) * 0.4), hash(r, i, 14)]);
        if (x + len < W) seams.push([[x + len, y0, 0], [x + len, y1, 0]]);
      }
      x += len;
      i++;
    }
  }
  runs.forEach((list, ti) => {
    if (!list.length) return;
    pen.beginPath();
    for (const [x0, y0, x1, y1] of list) k.trace([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
    pen.fillStyle = BOARDS[ti];
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
  const { zones, lamps } = furnished(v);
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
  // Warm light only round the fire, the forge, the lamps and the door's sun
  // lamp; the dusk's rosy light under each window.
  const fire = slot('idle');
  if (fire) {
    const fk = new Kit(pen, frame(v.at, fire.wall, fire.x0, fire.y0), s);
    if (fk.sees(-14, -14, 0, fire.len + 14, fire.dep + 14, 0)) {
      fk.pool(fire.len / 2, fire.dep * 0.45, 24, 20, '#ff8a3a', 0.42);
      fk.pool(fire.len / 2, fire.dep * 0.45, 13, 11, '#ffb060', 0.28);
    }
  }
  for (const [kind, u, w, r, a] of [['run', 0.3, 0.6, 12, 0.26], ['entrance', 0.82, 1.4, 10, 0.3]] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    const c = kind === 'entrance' ? C.sun : '#ff9a50';
    if (qk.sees(-r, -r, 0, q.len + r, q.dep + r, 0)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
  for (const p of lamps) {
    if (!k.sees(p.x - 9, p.y - 9, 0, p.x + 9, p.y + 9, 0)) continue;
    k.pool(p.x, p.y, 9, 9, '#ffd27a', 0.3);
    k.pool(p.x, p.y, 4.5, 4.5, '#fff0b0', 0.22);
  }
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (wk.sees(f.a - 8, 0, 0, f.a + 8, 7, 0)) wk.pool(f.a + 1, 3.5, 6, 4.5, '#f8b890', 0.12);
  }
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

const BLOCKS = [C.block, '#928370', '#8a7b66', '#968773', '#8b7c69'];
const FOOTING = '#776a57'; // the bottom course, a shade darker

// Plain thick blocks of cut stone in offset courses, each with a bold dark
// joint round it and a lighter top edge; the windows let into them.
function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 3, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const [ax0, ax1] = visibleAlong(k, T, end, 0, H);
  const seed = wall === 'right' ? 41 : 43;
  const byTone: P3[][][] = BLOCKS.map(() => []);
  const footing: P3[][] = [];
  const joints: Array<[P3, P3]> = [];
  const tops: Array<[P3, P3]> = [];
  const feet: Array<[P3, P3]> = [];
  const lo = Math.max(T, ax0 - BLOCK_L);
  const hi = Math.min(end, ax1 + BLOCK_L);
  for (let r = 0, z0 = 0; z0 < H - 0.01; r++, z0 += BLOCK_H) {
    const z1 = Math.min(H, z0 + BLOCK_H);
    if (!k.sees(lo, 0, z0, hi, 0.2, z1, 4)) continue;
    if (r) joints.push([[lo, 0, z0], [hi, 0, z0]]);
    const off = r & 1 ? BLOCK_L / 2 : 0;
    for (let a = T - off, i = 0; a < end; a += BLOCK_L, i++) {
      const a0 = Math.max(T, a);
      const a1 = Math.min(end, a + BLOCK_L);
      if (a1 < lo || a0 > hi || a1 - a0 < 0.2) continue;
      (r ? byTone[Math.floor(hash(r, i, seed) * BLOCKS.length)] : footing).push([[a0, 0, z0], [a1, 0, z0], [a1, 0, z1], [a0, 0, z1]]);
      if (a > T) joints.push([[a, 0, z0], [a, 0, z1]]);
      tops.push([[a0 + 0.3, 0, z1 - 0.32], [a1 - 0.3, 0, z1 - 0.32]]);
      feet.push([[a0 + 0.3, 0, z0 + 0.25], [a1 - 0.3, 0, z0 + 0.25]]);
    }
  }
  [...byTone, footing].forEach((qs, ti) => {
    if (!qs.length) return;
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = tone(BLOCKS[ti] ?? FOOTING);
    pen.fill();
  });
  k.segs(tops, withAlpha(C.blockTop, lit ? 0.6 : 0.4), Math.max(0.8, 0.2 * s));
  k.segs(feet, withAlpha('#3a3228', 0.18), Math.max(0.6, 0.14 * s));
  k.segs(joints, withAlpha(INK, 0.7), Math.max(1, 0.16 * s));
  // the blocks darken up toward the top, out of the lamps' reach, and in
  // the far corner
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, 0, H, [[0, '#1a100600'], [0.5, '#1a100608'], [1, '#1a100638']]), 0);
  if (k.sees(T, 0, 0, T + 10, 0.5, H)) k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#1a100650'], [1, '#1a100600']]), 0);
  for (const f of plan.features) {
    if (f.wall !== wall || !k.sees(f.a - f.w / 2 - 1, 0, SILL - 3, f.a + f.w / 2 + 1, 2.5, windowZ(H).z1 + 2)) continue;
    windowArt(k, v, f, lit);
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
  dusk(k, a - w / 2 - 0.5, a + w / 2 + 0.5, z0, z1, -depth, f.k);
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

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen } = k;
  const { W, D, H, T } = v;
  const cap = '#a89e8c';
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
    k.poly([pt(0, -SLAB), pt(1, -SLAB), pt(1, H), pt(0, H)], k.side(mix(C.block, '#5e5a53', 0.35), nu, nv), k.lw);
    pen.beginPath();
    for (let z = BLOCK_H, r = 1; z < H - 0.4; z += BLOCK_H, r++) {
      const [x0, y0] = k.p(...pt(0, z));
      const [x1, y1] = k.p(...pt(1, z));
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
      const f = r & 1 ? 0.35 : 0.7;
      const [x2, y2] = k.p(...pt(f, z));
      const [x3, y3] = k.p(...pt(f, Math.min(H, z + BLOCK_H)));
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
    k.line([[T - 0.3, D, H], [T - 0.3, T - 0.3, H], [W, T - 0.3, H]], shade(cap, 0.18), Math.max(1, 0.16 * k.s));
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
  k.pool(cu, cv, ru, rv, C.fire, 0.1 + 0.2 * n);
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
