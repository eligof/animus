import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { PlacedProp } from '../../world/room.ts';
import { hashString } from '../../world/rng.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView, WorldDef } from '../types.ts';
import { candle, flames, frustum, ivy } from './bits.ts';
import { DECOR } from './decor.ts';
import { C, INK, Kit, hash, withAlpha } from './kit.ts';
import { NPCS } from './npcs.ts';
import { STATIONS } from './stations.ts';

// The café's shell on a rainy evening: honey oak boards, sage wainscot
// under warm plaster with the brick showing through here and there, tall
// arched windows onto the wet town, a brick hearth with its fire lit,
// a chalk menu, shelves of mugs, little galleries of pictures, brass
// sconces and string lights along the tops of the walls. Rugs and pools of
// lamp light lie on the floor where the sofa, the armchair and the bar
// stand. Every piece sits in the free stretches of wall between the
// stations, worked out from the same plan the stage uses, so nothing hangs
// behind a bookcase or a door; the hearth slides along its stretch to where
// the furniture the stage stands before it hides least of it. Over the low
// stations (the pastry case, the writing desk) hang the chalk menu and a
// shelf of mugs, high enough to clear what stands on them.

type Wall = 'left' | 'right';
type Kind = 'hearth' | 'window' | 'menu' | 'shelf' | 'art' | 'sconce' | 'clock';
// z: where a piece hung over a station starts (its own height otherwise).
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number; z?: number };
// features: on the bare wall between the stations; over: over the low ones.
export type Plan = { L: Layout; features: Feature[]; over: Feature[] };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const WAIN = 8.5; // the wainscot's top (the chair rail sits on it)
const SKIRT = 1.1;
const BOARD = 3; // floorboard width
const LIGHTS = 4.5; // string lights hang this far under the wall top
const BREAST = 13; // the hearth's chimney breast, its width
const MENU_H = 10; // the chalk menu's height
const TIER = 4.2; // a shelf of mugs: the upper shelf, this far over the lower
const CLOCK_R = 2.2; // the café clock's radius

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// the furniture it stands about the floor (planRoom seeded by the world's
// id, its locals in, as the stage furnishes it), and what hangs on the
// walls between and over the stations.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'cafe');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const decor = L.slots.length ? planRoom({ id: 'cafe', stations: STATIONS, decor: DECOR, npcs: NPCS } as unknown as WorldDef, L, hashString('cafe')).props.filter((p) => !p.slot) : [];
  const up = over(L);
  const plan = { L, features: features(L, decor, up), over: up };
  PLANS.set(key, plan);
  return plan;
}

const between = (L: Layout, wall: Wall, a0: number, a1: number) => {
  const on = L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? s.x0 : s.y0));
  return on.some((p) => p < a0) && on.some((p) => p >= a1);
};

// How much of the wall from a0 to a1 the furniture stood before it hides:
// a piece h tall standing d0..d1 out from the wall is seen against it d
// back along it (toward the corner) and up to h - d0; summed over the
// pieces, each by the stretch it covers times how high.
function hidden(L: Layout, wall: Wall, decor: readonly PlacedProp[], a0: number, a1: number): number {
  let m = 0;
  for (const p of decor) {
    const r = footprint(p);
    const [d0, d1, b0, b1] = wall === 'right' ? [r.y0 - L.T, r.y1 - L.T, r.x0, r.x1] : [r.x0 - L.T, r.x1 - L.T, r.y0, r.y1];
    const up = p.art.height - d0;
    const over = Math.min(a1, b1 - d0) - Math.max(a0, b0 - d1);
    if (up > 0 && over > 0) m += over * up;
  }
  return m;
}

// The hearth in the longest stretch between two stations (the walkway in
// front keeps tables away from it), else the longest stretch, slid along it
// to where the furniture hides least of its breast, the fire counting
// double (the middle among equals); then windows with a menu, shelves and pictures between them in
// what is left (the menu and the shelves fewer by those over the stations).
function features(L: Layout, decor: readonly PlacedProp[], up: readonly Feature[]): Feature[] {
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= 5) spans.push({ wall, a0, a1 });
    }
  }
  const HEARTH = 15;
  const fits = spans.filter((s) => s.a1 - s.a0 >= HEARTH + 2);
  const pick = fits.filter((s) => between(L, s.wall, s.a0, s.a1)).sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0] ?? fits.sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
  if (pick) {
    const mid = (pick.a0 + pick.a1) / 2;
    let at = mid;
    let least = Infinity;
    for (let c = pick.a0 + HEARTH / 2; c <= pick.a1 - HEARTH / 2; c += 0.5) {
      const m = hidden(L, pick.wall, decor, c - BREAST / 2, c + BREAST / 2) + 2 * hidden(L, pick.wall, decor, c - FIRE.w / 2 - 1, c + FIRE.w / 2 + 1) + Math.abs(c - mid) * 0.01;
      if (m < least) {
        least = m;
        at = c;
      }
    }
    out.push({ wall: pick.wall, kind: 'hearth', a: at, w: HEARTH, k: 0 });
    spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: at - HEARTH / 2 - 2 }, { wall: pick.wall, a0: at + HEARTH / 2 + 2, a1: pick.a1 });
  }
  // Bays along what is left: a window first in each stretch with room for
  // one, then mostly windows with one menu, a couple of shelves and
  // pictures between.
  const WIDTH: Record<Kind, number> = { hearth: HEARTH, window: 10, menu: 12, shelf: 10, art: 6, sconce: 2, clock: 2 * CLOCK_R };
  const ORDER: Kind[] = ['window', 'menu', 'window', 'shelf', 'window', 'art', 'window', 'shelf', 'window'];
  const cap: Partial<Record<Kind, number>> = { menu: 1, shelf: 2 };
  const count: Partial<Record<Kind, number>> = {};
  for (const f of up) count[f.kind] = (count[f.kind] ?? 0) + 1;
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? 4 : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      if (!kinds.length && room('window')) k = 'window';
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < (cap[c] ?? Infinity) && room(c)) k = c;
      }
      k ??= room('art') ? 'art' : room('sconce') ? 'sconce' : undefined;
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? 4 : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    kinds.forEach((k, i) => {
      out.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    // Sconces between neighbouring windows with room for them.
    for (let i = 0; i + 1 < kinds.length; i++) {
      if (gap < 3 || kinds[i] !== 'window' || kinds[i + 1] !== 'window') continue;
      const left = out[out.length - kinds.length + i];
      out.push({ wall: s.wall, kind: 'sconce', a: left.a + left.w / 2 + gap / 2, w: 2, k: n + i });
    }
  }
  return out;
}

// Over the stations stood against a wall: the chalk menu over the pastry
// case, two shelves of mugs and tins over the writing desk, each centred on
// its station and hung `gap` over the top of it (higher if it would sit
// lower than its own z), and a café clock over the front door (centred on
// the door, `at` along the station); each where the wall has room under
// the picture rail for it.
const OVER: ReadonlyArray<{ station: 'search' | 'write' | 'entrance'; kind: Kind; w: number; h: number; z: number; gap: number; at?: number }> = [
  { station: 'search', kind: 'menu', w: 12, h: MENU_H, z: WAIN + 7, gap: 3 },
  { station: 'write', kind: 'shelf', w: 10, h: TIER + 2.5, z: WAIN + 9, gap: 3 },
  { station: 'entrance', kind: 'clock', w: 2 * CLOCK_R, h: 2 * CLOCK_R, z: 0, gap: 0.6, at: 7.5 },
];

function over(L: Layout): Feature[] {
  const out: Feature[] = [];
  for (const o of OVER) {
    const s = L.slots.find((q) => q.kind === o.station && !q.island);
    if (!s) continue;
    const z = Math.max(o.z, STATIONS[o.station].height + o.gap);
    if (z + o.h > railZ(L.H) - 0.8) continue;
    out.push({ wall: s.wall, kind: o.kind, a: (s.wall === 'right' ? s.x0 : s.y0) + (o.at ?? s.len / 2), w: Math.min(o.w, s.len), k: 300 + out.length, z });
  }
  return out;
}

// Windows: sill and arch top (z) for a wall H tall.
function windowZ(H: number): { z0: number; z1: number } {
  const z0 = WAIN + 1.6;
  return { z0, z1: Math.min(H - 9, z0 + 30) };
}

// The picture rail, over the windows; above it the wall is a deeper band
// where the string lights hang.
const railZ = (H: number) => Math.min(H - 6, windowZ(H).z1 + 2.2);
const BAND: ReadonlyArray<readonly [number, Color]> = [[0, '#a5704f'], [1, '#7f523b']];

// The band and the rail across a face square to v = n from a0 to a1.
function band(k: Kit, H: number, a0: number, a1: number, n: number, lit: boolean): void {
  const zr = railZ(H);
  const tone = (c: Color) => (lit ? c : shade(c, -0.14));
  k.poly([[a0, n, zr], [a1, n, zr], [a1, n, H - 2.4], [a0, n, H - 2.4]], k.vgrad(a0, n, zr, H - 2.4, BAND.map(([t, c]) => [t, tone(c)] as const)), 0);
  k.box(a0, n - 0.05, zr - 0.25, a1 - a0, 0.45, 0.5, C.walnut, { line: k.thin, stripe: false });
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but warm by the hearth rather than round the sofa, and a
// look out of a couple of the windows.
export function cafePois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L).filter((p) => p.kind !== 'warm');
  const hearth = fs.find((f) => f.kind === 'hearth');
  if (hearth) {
    const face = pt(hearth.wall, hearth.a, 0);
    out.push({ ...pt(hearth.wall, hearth.a - 5, 7), kind: 'warm', face }, { ...pt(hearth.wall, hearth.a + 5, 7), kind: 'warm', face }, { ...pt(hearth.wall, hearth.a, 9), kind: 'warm', face });
  }
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
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    for (const f of plan.features) {
      const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
      if (f.kind === 'window') rain(k, v, f);
      else if (f.kind === 'hearth') flicker(k, v, f);
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const BOARDS = ['#a96e3e', '#af7442', '#a46a3a', '#b37946', '#a06637'];

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  // Boards along x, butt joints staggered row by row; one path a tone.
  const rows = Math.ceil((D - T) / BOARD);
  const runs: Array<Array<[number, number, number, number]>> = BOARDS.map(() => []);
  const joints: Array<[number, number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const y0 = T + r * BOARD;
    const y1 = Math.min(D, y0 + BOARD);
    let x = T - hash(r, 3) * 14;
    let i = 0;
    while (x < W) {
      const len = 12 + Math.floor(hash(r, i, 5) * 14);
      const x0 = Math.max(T, x);
      const x1 = Math.min(W, x + len);
      if (x1 > x0) runs[Math.floor(hash(r, i, 9) * BOARDS.length)].push([x0, y0, x1, y1]);
      if (x + len < W) joints.push([x + len, y0, y1]);
      x += len;
      i++;
    }
  }
  runs.forEach((list, ti) => {
    pen.beginPath();
    for (const [x0, y0, x1, y1] of list) k.trace([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
    pen.fillStyle = BOARDS[ti];
    pen.fill();
  });
  // Seams: the long ones between rows and the butt joints.
  pen.beginPath();
  for (let r = 1; r < rows; r++) {
    const y = T + r * BOARD;
    const [a, b] = [k.p(T, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (const [x, y0, y1] of joints) {
    const [a, b] = [k.p(x, y0, 0), k.p(x, y1, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#7d4a2899';
  pen.lineWidth = Math.max(0.8, 0.11 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  if (k.fine) {
    // a soft sheen along each board's lit edge
    pen.beginPath();
    for (let r = 0; r < rows; r++) {
      const y = T + r * BOARD + 0.35;
      const [a, b] = [k.p(T, y, 0), k.p(W, y, 0)];
      pen.moveTo(a[0], a[1]);
      pen.lineTo(b[0], b[1]);
    }
    pen.strokeStyle = '#e0a66a40';
    pen.lineWidth = 0.12 * s;
    pen.stroke();
  }
  // Shade: darker toward the walls' feet and the far corner, a warm middle.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#2a120640');
  g.addColorStop(0.3, '#2a120612');
  g.addColorStop(0.7, '#2a120600');
  g.addColorStop(1, '#2a12061c');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  // contact shade along the foot of each wall
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#2a120666'], [0.35, '#2a120622'], [1, '#2a120600']]), 0);
  }
  // Rugs where people sit and gather, then the light that falls on the floor.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const idle = slot('idle');
  if (idle) rug(new Kit(pen, frame(v.at, idle.wall, idle.x0, idle.y0), s), -2.5, -2, idle.len + 5, idle.dep + 3.5, RED);
  const h = hub(plan.L);
  const rects = plan.L.slots.map(slotRect);
  for (const f of [1, 0.85, 0.7, 0.55]) {
    const [rw, rd] = [22 * f, 15 * f];
    const r = { x0: h.x - rw / 2, y0: h.y - rd / 2, x1: h.x + rw / 2, y1: h.y + rd / 2 };
    if (rects.some((q, i) => {
      const m = plan.L.slots[i].kind === 'idle' ? 4 : 2;
      return q.x0 < r.x1 + m && r.x0 < q.x1 + m && q.y0 < r.y1 + m && r.y0 < q.y1 + m;
    })) continue;
    rug(k, r.x0, r.y0, rw, rd, TEAL);
    break;
  }
  const think = slot('think');
  if (think) roundRug(new Kit(pen, frame(v.at, think.wall, think.x0, think.y0), s), think.len / 2 - 1, think.dep / 2, 6.5);
  const hearth = plan.features.find((f) => f.kind === 'hearth');
  if (hearth) {
    const hk = new Kit(pen, wallAt(v.at, hearth.wall, T), s);
    rug(hk, hearth.a - 6, 5, 12, 5.5, RED);
    hk.pool(hearth.a, 4, 14, 10, '#ff9a48', 0.34);
  }
  for (const [kind, u, w, r, a] of [['think', 0.8, 0.35, 11, 0.3], ['idle', 0.9, 0.3, 13, 0.26], ['run', 0.5, 0.6, 12, 0.28], ['write', 0.3, 1, 9, 0.18], ['read', 0.85, 0.5, 9, 0.2], ['web', 0.5, 0.5, 9, 0.16]] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    qk.pool(q.len * u, q.dep * w, r, r * 0.8, C.lamp, a);
  }
  for (const f of plan.features) {
    if (f.kind !== 'window') continue;
    // a cool spill of evening light under each window
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    wk.pool(f.a, 3, 6, 4, '#8aa4d6', 0.08);
  }
}

// A rug's colours: edge, border band, field, then the medallion's rings.
type RugColors = readonly [Color, Color, Color, Color, Color, Color];
const RED: RugColors = ['#9c3b32', '#c9873f', '#b4473a', '#e3b25e', '#7d2a2a', '#f1d9a8'];
const TEAL: RugColors = ['#2f5f5a', '#d9b46a', '#3f726b', '#e6d2a4', '#9c3b32', '#f1d9a8'];

// A woven rug with a border, in its own frame: u along, v across.
function rug(k: Kit, u0: number, v0: number, du: number, dv: number, c6: RugColors): void {
  const { pen, s } = k;
  const z = 0.05;
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.12);
  k.poly([[u0, v0, z], [u0 + du, v0, z], [u0 + du, v0 + dv, z], [u0, v0 + dv, z]], c6[0], k.thin, 0.4);
  const b = 1.1;
  k.poly([[u0 + b, v0 + b, z], [u0 + du - b, v0 + b, z], [u0 + du - b, v0 + dv - b, z], [u0 + b, v0 + dv - b, z]], c6[1], 0);
  const c = 1.8;
  k.poly([[u0 + c, v0 + c, z], [u0 + du - c, v0 + c, z], [u0 + du - c, v0 + dv - c, z], [u0 + c, v0 + dv - c, z]], c6[2], 0);
  // a row of diamonds down the middle and a medallion
  const cu = u0 + du / 2;
  const cv = v0 + dv / 2;
  const d = (u: number, w: number, r: number, fill: Color) => k.poly([[u - r, w, z], [u, w - r * 0.75, z], [u + r, w, z], [u, w + r * 0.75, z]], fill, 0);
  d(cu, cv, Math.min(du, dv) * 0.28, c6[3]);
  d(cu, cv, Math.min(du, dv) * 0.17, c6[4]);
  d(cu, cv, Math.min(du, dv) * 0.07, c6[5]);
  for (const side of [-1, 1]) {
    const u = cu + side * du * 0.32;
    d(u, cv, Math.min(du, dv) * 0.12, c6[3]);
    d(u, cv, Math.min(du, dv) * 0.05, c6[4]);
  }
  if (k.fine) {
    // a dotted inner line
    pen.beginPath();
    k.trace([[u0 + 1.45, v0 + 1.45, z], [u0 + du - 1.45, v0 + 1.45, z], [u0 + du - 1.45, v0 + dv - 1.45, z], [u0 + 1.45, v0 + dv - 1.45, z]]);
    pen.strokeStyle = '#f1d9a8aa';
    pen.lineWidth = 0.12 * s;
    pen.stroke();
  }
  // fringe on the short ends
  pen.beginPath();
  for (const uu of [u0, u0 + du]) {
    for (let w = v0 + 0.4; w < v0 + dv - 0.2; w += 0.7) {
      const [x0, y0] = k.p(uu, w, z);
      const [x1, y1] = k.p(uu + (uu === u0 ? -0.7 : 0.7), w, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = '#ead6b0';
  pen.lineWidth = Math.max(0.8, 0.13 * s);
  pen.stroke();
}

// A round braided rug: rings of colour.
function roundRug(k: Kit, cu: number, cv: number, r: number): void {
  const z = 0.05;
  k.shadow(cu, cv, r * 1.05, r * 1.05, 0.1);
  const rings: Color[] = ['#3f6f68', '#d9b46a', '#4f8379', '#e6d2a4', '#3f6f68', '#c8873f'];
  rings.forEach((c, i) => k.disc(cu, cv, z, r * (1 - i / rings.length), c, i === 0 ? k.thin : 0));
}

// ── walls ──────────────────────────────────────────────────────────────────

const PLASTER_LIT = '#d9b385';
const PLASTER: ReadonlyArray<readonly [number, Color]> = [[0, '#e2bf8e'], [0.3, PLASTER_LIT], [0.75, '#bd9067'], [1, '#9c7253']];

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  // Plaster: warm under the lamps, falling off to a deep ochre at the top.
  const plaster = k.vgrad(T, 0, WAIN, H, PLASTER.map(([t, c]) => [t, tone(c)] as const));
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, H], [T, 0, H]], plaster, 0);
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 9, 0, 0], [T + 9, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 9, 0, 0], [[0, '#3a1d0e30'], [1, '#3a1d0e00']]), 0);
  bricks(k, v, plan, wall, end, tone);
  // Wainscot: sage panels in a frame, a dark skirting below.
  const sage = tone(C.sage, 0.12);
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, WAIN], [T, 0, WAIN]], sage, 0);
  const pw = 6;
  const hi: Array<[number, number, number, number]> = [];
  for (let a = T + 1.2; a + pw <= end - 0.6; a += pw + 1.2) hi.push([a, SKIRT + 1, a + pw, WAIN - 1.2]);
  pen.beginPath();
  for (const [a0, z0, a1, z1] of hi) k.trace([[a0, 0, z0], [a1, 0, z0], [a1, 0, z1], [a0, 0, z1]]);
  pen.fillStyle = shade(sage, -0.07);
  pen.fill();
  // bevels: light along the panels' top and left edges, dark along the rest
  const edge = (pts: Array<[number, number, number, number]>, which: 'hi' | 'lo') => {
    pen.beginPath();
    for (const [a0, z0, a1, z1] of pts) {
      const seg = which === 'hi' ? [[a0, 0, z0], [a0, 0, z1], [a1, 0, z1]] : [[a0, 0, z0], [a1, 0, z0], [a1, 0, z1]];
      seg.forEach(([a, n, z], i) => {
        const [x, y] = k.p(a, n, z);
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      });
    }
    pen.strokeStyle = which === 'hi' ? shade(sage, 0.3) : shade(sage, -0.35);
    pen.lineWidth = Math.max(0.8, 0.16 * s);
    pen.lineJoin = 'round';
    pen.stroke();
  };
  edge(hi, 'lo');
  edge(hi, 'hi');
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, SKIRT], [T, 0, SKIRT]], tone(C.walnutDark), 0);
  k.line([[T, 0, SKIRT], [end, 0, SKIRT]], shade(C.walnut, 0.25), Math.max(0.8, 0.14 * s));
  // chair rail, the band under the cornice, the crown moulding
  k.box(T, 0, WAIN, end - T, 0.55, 0.75, C.walnut, { line: k.thin, stripe: false });
  band(k, H, T, end, 0, lit);
  k.poly([[T, 0, H - 2.4], [end, 0, H - 2.4], [end, 0, H], [T, 0, H]], tone('#d9c19a'), 0);
  k.box(T, 0, H - 1.3, end - T, 0.5, 0.9, '#efe0c2', { line: k.thin, stripe: false });
  k.line([[T, 0, H - 2.4], [end, 0, H - 2.4]], shade('#d9c19a', -0.3), Math.max(0.8, 0.12 * s));
  for (const f of [...plan.features, ...plan.over]) {
    if (f.wall !== wall) continue;
    if (f.kind === 'window') windowArt(k, v, f, lit);
    else if (f.kind === 'hearth') hearthArt(k, v, f);
    else if (f.kind === 'menu') menuBoard(k, f);
    else if (f.kind === 'shelf') mugShelf(k, f);
    else if (f.kind === 'art') gallery(k, f);
    else if (f.kind === 'sconce') sconce(k, f);
    else if (f.kind === 'clock') clock(k, f);
  }
  stringLights(k, v, end);
}

// One patch a wall where the plaster has come away from the brick, low,
// just over the chair rail where chair backs knock it, in the widest
// stretch of plaster clear of the stations and of what hangs on the wall:
// a ragged edge, flatter along its bottom like plaster fallen away.
function bricks(k: Kit, v: RoomView, plan: Plan, wall: Wall, end: number, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  let free: Array<[number, number]> = [[v.T + 3, end - 3]];
  const cut = (x0: number, x1: number) => {
    free = free.flatMap(([f0, f1]): Array<[number, number]> => (x1 <= f0 || x0 >= f1 ? [[f0, f1]] : ([[f0, x0], [x1, f1]] as Array<[number, number]>).filter(([p, q]) => q > p)));
  };
  for (const f of [...plan.features, ...plan.over]) if (f.wall === wall) cut(f.a - f.w / 2 - 3, f.a + f.w / 2 + 3);
  for (const q of plan.L.slots) if (q.wall === wall && !q.island) cut((wall === 'right' ? q.x0 : q.y0) - 1, (wall === 'right' ? q.x0 : q.y0) + q.len + 1);
  const [f0, f1] = free.sort((p, q) => q[1] - q[0] - (p[1] - p[0]))[0] ?? [0, 0];
  const seed = wall === 'right' ? 11 : 12;
  const rw = Math.min(3 + hash(seed, 13) * 0.8, (f1 - f0) / 2 - 0.5);
  if (rw < 2.2) return;
  const rz = 2.1 + hash(seed, 15) * 0.5;
  const a = f0 + rw + 0.5 + hash(seed, 16) * (f1 - f0 - 2 * rw - 1);
  const z = WAIN + 1.6 + rz + hash(seed, 14) * 1.2;
  const blob: Array<[number, number, number]> = [];
  for (let j = 0; j < 16; j++) {
    const th = (j / 16) * Math.PI * 2;
    const r = (0.65 + hash(seed, j, 17) * 0.5) * (Math.sin(th) < -0.01 ? 0.8 : 1);
    blob.push([a + Math.cos(th) * rw * r, 0, z + Math.sin(th) * rz * r]);
  }
  pen.save();
  pen.beginPath();
  k.trace(blob);
  pen.fillStyle = tone(C.mortar);
  pen.fill();
  pen.clip();
  // the courses in running bond, a brick here and there a shade darker
  const by: [Array<Array<[number, number, number]>>, Array<Array<[number, number, number]>>] = [[], []];
  for (let zz = Math.floor(z - rz - 1); zz < z + rz + 1; zz += 1) {
    const off = Math.floor(zz) & 1;
    for (let aa = Math.floor(a - rw - 2) + off; aa < a + rw + 2; aa += 2) {
      by[hash(Math.floor(aa), Math.floor(zz), 17) < 0.6 ? 0 : 1].push([[aa + 0.12, 0, zz + 0.12], [aa + 1.88, 0, zz + 0.12], [aa + 1.88, 0, zz + 0.9], [aa + 0.12, 0, zz + 0.9]]);
    }
  }
  by.forEach((list, i) => {
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = tone(i ? shade(C.brick, -0.12) : C.brick);
    pen.fill();
  });
  // the plaster's broken edge throws a little shadow down onto the brick
  pen.beginPath();
  k.trace(blob.map(([u, n, zz]) => [a + (u - a) * 1.08, n, z + (zz - z) * 1.08 + 0.3] as [number, number, number]));
  pen.strokeStyle = withAlpha('#3a1d0e', 0.28);
  pen.lineWidth = Math.max(1, 0.35 * s);
  pen.stroke();
  pen.restore();
  // the broken plaster's lip, lit along the bottom where it catches light
  pen.beginPath();
  k.trace(blob);
  pen.strokeStyle = tone('#f6e6c6');
  pen.lineWidth = Math.max(1, 0.22 * s);
  pen.stroke();
  pen.beginPath();
  k.trace(blob);
  pen.strokeStyle = withAlpha(INK, 0.45);
  pen.lineWidth = Math.max(0.7, 0.08 * s);
  pen.stroke();
}

// An arched sash window set into the wall: the reveal, glass onto the
// evening town, glazing bars, a sill and a café curtain on a brass rod.
function arch(a: number, w: number, z0: number, z1: number, n: number, steps = 12): Array<[number, number, number]> {
  const r = w / 2;
  const spring = z1 - r;
  const pts: Array<[number, number, number]> = [[a - r, n, z0], [a + r, n, z0], [a + r, n, spring]];
  for (let i = 1; i < steps; i++) {
    const th = (i / steps) * Math.PI;
    pts.push([a + r * Math.cos(th), n, spring + r * Math.sin(th)]);
  }
  pts.push([a - r, n, spring]);
  return pts;
}

function windowArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const w = f.w - 1.6;
  const a = f.a;
  const depth = 0.9;
  // casing round the opening
  k.poly(arch(a, w + 1.6, z0 - 0.3, z1 + 0.8, 0.05, 16), lit ? '#f1e4c8' : shade('#f1e4c8', -0.14), k.lw);
  // the reveal (the wall's thickness), then the glass set back in it
  const open = arch(a, w, z0, z1, 0.06, 16);
  k.poly(open, lit ? '#cdb592' : shade('#cdb592', -0.16), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  const glass = arch(a, w, z0, z1, -depth, 16);
  const sky = k.vgrad(a, -depth, z0, z1, [[0, '#56688c'], [0.35, '#3a4b6e'], [1, '#222c45']]);
  k.poly(glass, sky, 0);
  // the town: roofs with a lit window or two, a street lamp's glow
  const roofs: Array<[number, number, number]> = [[a - w / 2 - 1, -depth, z0]];
  const seg = 6;
  const roofAt: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const u = a - w / 2 + (w * i) / seg;
    const hgt = z0 + 6.5 + hash(f.k, i, 21) * 5;
    roofAt.push(hgt);
    const peak = hash(f.k, i, 22) < 0.4;
    roofs.push([u - w / seg / 2, -depth, hgt], ...(peak ? [[u, -depth, hgt + 1.3] as [number, number, number]] : []), [u + w / seg / 2, -depth, hgt]);
  }
  roofs.push([a + w / 2 + 1, -depth, z0]);
  k.poly(roofs, '#1b2131', 0);
  // a shop across the street still open, just over the curtain: a wide lit
  // window under its own dark awning
  const su = a - w / 2 + 0.6 + hash(f.k, 36) * Math.max(0, w - 4.3);
  const sz = z0 + 5.5;
  k.poly([[su, -depth, sz], [su + 2.5, -depth, sz], [su + 2.5, -depth, sz + 1.6], [su, -depth, sz + 1.6]], '#ffcf7a', 0);
  k.poly([[su - 0.25, -depth, sz + 1.6], [su + 2.75, -depth, sz + 1.6], [su + 2.6, -depth, sz + 2.1], [su - 0.1, -depth, sz + 2.1]], '#6a2a26', 0);
  k.line([[su + 1.25, -depth, sz], [su + 1.25, -depth, sz + 1.6]], '#c08a4a', Math.max(0.6, 0.08 * s));
  pen.beginPath();
  for (let i = 0; i < 10; i++) {
    if (hash(f.k, i, 23) < 0.4) continue;
    const col = Math.floor(hash(f.k, i, 24) * seg);
    const u = a - w / 2 + (w * (col + 0.25)) / seg;
    const zz = z0 + 5.6 + hash(f.k, i, 25) * Math.max(0.5, roofAt[col] - z0 - 7);
    k.trace([[u, -depth, zz], [u + 0.6, -depth, zz], [u + 0.6, -depth, zz + 0.8], [u, -depth, zz + 0.8]]);
  }
  pen.fillStyle = '#ffcf7a';
  pen.fill();
  // a street lamp on the pavement: a slim post, a lantern and its glow
  const lu = a + (hash(f.k, 26) < 0.5 ? -1 : 1) * w * (0.22 + hash(f.k, 37) * 0.12);
  const lz = z0 + 9.4;
  k.halo(lu, -depth, lz + 0.5, 3.6, '#ffc070', 0.36);
  k.line([[lu, -depth, z0], [lu, -depth, lz]], '#323c55', Math.max(1, 0.32 * s));
  k.poly([[lu - 0.45, -depth, lz], [lu + 0.45, -depth, lz], [lu + 0.32, -depth, lz + 1.1], [lu - 0.32, -depth, lz + 1.1]], '#ffe2a0', 0);
  k.poly([[lu - 0.5, -depth, lz + 1.1], [lu + 0.5, -depth, lz + 1.1], [lu, -depth, lz + 1.6]], '#323c55', 0);
  k.halo(lu, -depth, lz + 0.5, 1.2, '#fff2c8', 0.5);
  // the café's own awning seen from inside: a striped valance with a
  // scalloped edge across the top of the glass, under the arch
  const spring0 = z1 - w / 2;
  const vz = spring0 - 1.5;
  const stripes = Math.max(4, Math.round(w / 0.8));
  const sw = w / stripes;
  const valance: Array<Array<Array<[number, number, number]>>> = [[], []];
  for (let i = 0; i < stripes; i++) {
    const u = a - w / 2 + i * sw;
    const pts: Array<[number, number, number]> = [[u, -depth, spring0 + 0.6], [u + sw, -depth, spring0 + 0.6], [u + sw, -depth, vz]];
    for (let j = 1; j < 6; j++) pts.push([u + sw - (sw * j) / 6, -depth, vz - 0.42 * Math.sin((j / 6) * Math.PI)]);
    pts.push([u, -depth, vz]);
    valance[i & 1].push(pts);
  }
  valance.forEach((list, i) => {
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = i ? '#e9dcc0' : '#a8433a';
    pen.fill();
  });
  k.poly([[a - w / 2, -depth, spring0 + 0.6], [a + w / 2, -depth, spring0 + 0.6], [a + w / 2, -depth, vz], [a - w / 2, -depth, vz]], k.vgrad(a, -depth, vz, spring0 + 0.6, [[0, '#2a120600'], [1, '#2a120655']]), 0);
  // rain already on the glass: still streaks and beads
  pen.beginPath();
  for (let i = 0; i < 9; i++) {
    const u = a - w / 2 + 0.5 + hash(f.k, i, 27) * (w - 1);
    const zt = z0 + 3 + hash(f.k, i, 28) * (z1 - z0 - 5);
    const len = 1.2 + hash(f.k, i, 29) * 2.5;
    const [x0, y0] = k.p(u, -depth, zt);
    const [x1, y1] = k.p(u, -depth, zt - len);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#c8dcf060';
  pen.lineWidth = Math.max(0.8, 0.1 * s);
  pen.stroke();
  // inner shadow along the top and the lit side of the reveal
  k.poly(glass, k.vgrad(a, -depth, z1 - 3, z1, [[0, '#00000000'], [1, '#0a0a1a55']]), 0);
  pen.restore();
  // glazing bars: a centre mullion and two transoms
  const bar = '#efe2c4';
  const bw = Math.max(1.2, 0.32 * s);
  const spring = z1 - w / 2;
  const bars: Array<Array<[number, number, number]>> = [
    [[a, -depth * 0.6, z0], [a, -depth * 0.6, z1]],
    [[a - w / 2, -depth * 0.6, z0 + (spring - z0) * 0.45], [a + w / 2, -depth * 0.6, z0 + (spring - z0) * 0.45]],
    [[a - w / 2, -depth * 0.6, spring], [a + w / 2, -depth * 0.6, spring]],
  ];
  for (const b of bars) k.line(b, INK, bw + k.thin * 1.4);
  for (const b of bars) k.line(b, lit ? bar : shade(bar, -0.12), bw);
  // the opening's outline over the bars' ends
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  // sill and the curtain
  k.box(a - w / 2 - 0.9, 0, z0 - 0.9, w + 1.8, 1.1, 0.7, '#efe0c2', { line: k.lw });
  // wet from the rain where the sash leaks: a few bright beads on the sill
  if (k.fine) {
    pen.beginPath();
    for (let i = 0; i < 3; i++) k.trace([[a - w / 2 + 0.6 + hash(f.k, i, 38) * (w - 1.2), 0.75, z0 - 0.19], [a - w / 2 + 1.3 + hash(f.k, i, 38) * (w - 1.2), 0.75, z0 - 0.19], [a - w / 2 + 1.3 + hash(f.k, i, 38) * (w - 1.2), 0.95, z0 - 0.19], [a - w / 2 + 0.6 + hash(f.k, i, 38) * (w - 1.2), 0.95, z0 - 0.19]]);
    pen.fillStyle = '#ffffff55';
    pen.fill();
  }
  curtain(k, a, w, z0 + 0.2, z0 + 5.2, f.k);
  if (hash(f.k, 31) < 0.6) sillPot(k, a + (hash(f.k, 32) < 0.5 ? -1 : 1) * (w / 2 - 1.1), 0.55, z0 - 0.2, f.k);
}

// A café curtain: gathered fabric from a brass rod across the lower glass.
function curtain(k: Kit, a: number, w: number, z0: number, z1: number, seed: number): void {
  const { pen, s } = k;
  const n = 0.25;
  const top: Array<[number, number, number]> = [];
  const bot: Array<[number, number, number]> = [];
  const folds = Math.max(4, Math.round(w * 1.1));
  for (let i = 0; i <= folds; i++) {
    const u = a - w / 2 + (w * i) / folds;
    top.push([u, n, z1]);
    bot.push([u, n + (i & 1 ? 0.25 : 0), z0 + (i & 1 ? 0.35 : 0)]);
  }
  const fabric = hash(seed, 33) < 0.5 ? '#f3e7cf' : '#e9d6b4';
  k.poly([...top, ...bot.reverse()], k.vgrad(a, n, z0, z1, [[0, shade(fabric, -0.1)], [1, fabric]]), k.thin);
  // folds and a gingham band near the hem
  pen.beginPath();
  for (let i = 1; i < folds; i++) {
    const u = a - w / 2 + (w * i) / folds;
    const [x0, y0] = k.p(u, n, z1 - 0.3);
    const [x1, y1] = k.p(u, n, z0 + 0.6);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#b8936a88';
  pen.lineWidth = Math.max(0.7, 0.09 * s);
  pen.stroke();
  k.poly([[a - w / 2, n, z0 + 0.9], [a + w / 2, n, z0 + 0.9], [a + w / 2, n, z0 + 1.6], [a - w / 2, n, z0 + 1.6]], '#c0503f99', 0);
  k.rod([[a - w / 2 - 0.4, n, z1 + 0.15], [a + w / 2 + 0.4, n, z1 + 0.15]], C.brass, 0.22);
}

// A little pot of herbs on a sill.
function sillPot(k: Kit, u: number, n: number, z: number, seed: number): void {
  k.cyl(u, n, z, 0.6, 1.1, C.terracotta);
  const leaf = hash(seed, 34) < 0.5 ? C.leaf : '#6fa35a';
  for (let i = 0; i < 5; i++) {
    const th = (i / 5) * Math.PI * 2 + seed;
    const [x, y] = k.p(u + Math.cos(th) * 0.45, n + Math.sin(th) * 0.35, z + 1.6 + hash(seed, i, 35) * 0.7);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.55 * k.s, 0.4 * k.s, th, 0, Math.PI * 2);
    k.paint(i & 1 ? leaf : shade(leaf, 0.12), k.thin);
  }
}

// The hearth: a brick chimney breast with a mantel, the fire in an arched
// firebox, a hearth stone on the floor, logs and fire irons to the sides
// and a gilt mirror above.
const FIRE = { w: 7, z1: 7.4 }; // the firebox opening
const MANTEL = 9.6;

function hearthArt(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const bw = BREAST;
  const out = 1.4;
  const lit = k.lit(0, 1);
  // a soft glow on the wall round the breast
  k.halo(a, 0.1, 6, 15, '#ff9a48', 0.16);
  // hearth stone
  k.box(a - bw / 2 - 1.2, 0, 0, bw + 2.4, out + 2.6, 0.45, '#a89d90', { line: k.lw });
  // the breast: plaster to the cornice, brick round the fire
  // (its two faces the viewer sees, each in the wall's plaster as lit)
  const ztop = v.H - 1.75;
  const tone = (on: boolean) => PLASTER.map(([t, c]) => [t, on ? shade(c, 0.05) : shade(c, -0.14)] as const);
  const [l, r] = [a - bw / 2, a + bw / 2];
  k.poly([[r, 0, 0.45], [r, out, 0.45], [r, out, ztop], [r, 0, ztop]], k.lgrad([r, 0, WAIN], [r, 0, v.H], [0, 1, 0], tone(k.lit(1, 0))), k.lw);
  k.poly([[l, out, 0.45], [r, out, 0.45], [r, out, ztop], [l, out, ztop]], k.vgrad(a, out, WAIN, v.H, tone(lit)), k.lw);
  // the band and the rail carry on round the breast
  const zr = railZ(v.H);
  const endFace = (c: Color) => (k.lit(1, 0) ? c : shade(c, -0.14));
  k.poly([[a + bw / 2, 0, zr], [a + bw / 2, out, zr], [a + bw / 2, out, v.H - 2.4], [a + bw / 2, 0, v.H - 2.4]], k.lgrad([a + bw / 2, 0, zr], [a + bw / 2, 0, v.H - 2.4], [0, 1, 0], BAND.map(([t, c]) => [t, endFace(c)] as const)), k.thin);
  band(k, v.H, a - bw / 2, a + bw / 2, out, lit);
  k.box(a - bw / 2 - 0.2, 0, v.H - 2.4, bw + 0.4, out + 0.5, 1.1, '#efe0c2', { line: k.thin, stripe: false });
  const front = (u: number, z: number): [number, number, number] => [u, out, z];
  const sw = bw - 1.6;
  k.poly([front(a - sw / 2, 0.45), front(a + sw / 2, 0.45), front(a + sw / 2, MANTEL), front(a - sw / 2, MANTEL)], k.side(C.brick, 0, 1, 0.12), k.thin);
  brickCourses(k, a - sw / 2, a + sw / 2, out + 0.01, 0.45, MANTEL, a, FIRE.w + 1.6, FIRE.z1 + 1.2);
  // a ring of soldier bricks round the arch, then the opening
  k.poly(arch(a, FIRE.w + 1.6, 0.45, FIRE.z1 + 0.8, out + 0.02, 14), k.side('#c86a48', 0, 1, 0.12), k.thin);
  const open = arch(a, FIRE.w, 0.45, FIRE.z1, out + 0.04, 14);
  k.poly(open, k.vgrad(a, out, 0.45, FIRE.z1, [[0, '#2a130b'], [1, '#120806']]), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  // the back of the firebox, lit by the fire
  k.halo(a, out - 1, 1.5, 4.5, '#ff7a2a', 0.65);
  // logs and the flames on them
  const log = (u0: number, u1: number, z0: number, z1: number) => {
    k.poly([[u0, out - 0.6, z0], [u1, out - 0.6, z1], [u1, out - 0.6, z1 + 0.9], [u0, out - 0.6, z0 + 0.9]], '#5a3420', k.thin, 0.3);
  };
  log(a - 2.9, a + 1.3, 0.6, 1.0);
  log(a - 0.9, a + 3, 1.1, 0.6);
  flames(k, a, out - 0.4, 1.4, 1.15);
  pen.restore();
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.lw);
  // embers glowing on the stone
  k.halo(a, out + 0.2, 0.9, 4, '#ff8a2a', 0.5);
  // mantel on two corbels, and what stands on it
  for (const du of [-sw / 2 + 0.4, sw / 2 - 1.2]) k.box(a + du, out, MANTEL - 1.4, 0.8, 0.6, 1.4, C.walnut, { line: k.thin });
  k.box(a - bw / 2 - 1, 0, MANTEL, bw + 2, out + 1.1, 1, C.walnut, { line: k.lw });
  const mz = MANTEL + 1;
  for (const [du, hgt] of [[-4.6, 1.8], [-3.7, 1.2]] as const) candle(k, a + du, out + 0.5, mz, hgt);
  candle(k, a + 4.3, out + 0.5, mz, 1.5);
  // a squat clock, its face blank
  k.box(a + 1.2, out - 0.3, mz, 1.8, 0.9, 1.9, C.walnutDark, { line: k.thin, round: 0.3 });
  k.disc(a + 2.1, out + 0.62, mz + 1.05, 0.55, C.cream, k.thin);
  // ivy trailing off the end of the mantel
  ivy(k, a - bw / 2 - 0.5, out + 0.6, mz, 5, f.k);
  // the mirror above
  const mz0 = mz + 3.2;
  const mh = Math.min(7, v.H - mz0 - 9);
  if (mh > 3) {
    k.poly(arch(a, 7.6, mz0, mz0 + mh + 0.6, out + 0.05, 14), C.brass, k.lw);
    k.poly(arch(a, 6.4, mz0 + 0.6, mz0 + mh, out + 0.08, 14), k.vgrad(a, out, mz0, mz0 + mh, [[0, '#c9a77e'], [0.6, '#e9d7b8'], [1, '#b99a78']]), k.thin);
    k.line([front(a - 2.2, mz0 + 1.5), front(a + 0.8, mz0 + mh - 1)], '#ffffff70', Math.max(1, 0.35 * s));
  }
  // logs in a basket and the fire irons
  const bu = a + bw / 2 + 1.9;
  k.shadow(bu, 1.6, 1.8, 1.4, 0.25);
  k.cyl(bu, 1.5, 0, 1.4, 1.9, '#b98a4e');
  for (const [du, dv] of [[-0.6, -0.2], [0.4, 0.2], [0, -0.5]] as const) k.cyl(bu + du, 1.5 + dv, 1.6, 0.42, 0.9, '#8a5a35', { top: '#d8b080' });
  const iu = a - bw / 2 - 1.8;
  k.shadow(iu, 1.2, 1, 0.8, 0.2);
  k.disc(iu, 1.2, 0.2, 0.7, C.iron, k.thin);
  for (const du of [-0.25, 0.05, 0.3]) k.rod([[iu + du, 1.2, 0.2], [iu + du * 1.6, 1.2, 4.6]], C.iron, 0.12);
  k.disc(iu, 1.2, 4.7, 0.25, C.brass, k.thin);
}

// Courses of brick across a face, skipping the firebox's surround.
function brickCourses(k: Kit, a0: number, a1: number, n: number, z0: number, z1: number, ca: number, hw: number, hz: number): void {
  const { pen, s } = k;
  pen.beginPath();
  for (let z = z0 + 0.8, r = 0; z < z1 - 0.2; z += 0.8, r++) {
    const [x0, y0] = k.p(a0, n, z);
    const [x1, y1] = k.p(a1, n, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
    for (let a = a0 + (r & 1 ? 1 : 0.2); a < a1; a += 1.8) {
      if (Math.abs(a - ca) < hw / 2 && z < hz) continue;
      const [p0, q0] = k.p(a, n, z);
      const [p1, q1] = k.p(a, n, z + 0.8);
      pen.moveTo(p0, q0);
      pen.lineTo(p1, q1);
    }
  }
  pen.strokeStyle = k.lit(0, 1) ? '#e2c7a466' : '#c8a98666';
  pen.lineWidth = Math.max(0.6, 0.09 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  if (!k.fine) return;
  // a few bricks a shade darker
  pen.beginPath();
  for (let i = 0; i < 26; i++) {
    const a = a0 + 0.3 + hash(i, 41) * (a1 - a0 - 2);
    const z = z0 + 0.8 * Math.floor(hash(i, 42) * ((z1 - z0) / 0.8 - 1));
    if (Math.abs(a - ca) < hw / 2 + 1 && z < hz) continue;
    k.trace([[a, n, z + 0.1], [a + 1.6, n, z + 0.1], [a + 1.6, n, z + 0.7], [a, n, z + 0.7]]);
  }
  pen.fillStyle = '#7a2c1a30';
  pen.fill();
}

// The menu: a slate in a walnut frame, chalked with lines and doodles (no
// words: scribbles that read as writing).
function menuBoard(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const w = f.w;
  const z0 = f.z ?? WAIN + 6;
  const h = MENU_H;
  k.shadow(a, 0.3, w * 0.5, 0.6, 0.1, z0 - 0.4);
  k.box(a - w / 2, 0, z0, w, 0.45, h, C.walnut, { line: k.lw, stripe: false });
  k.poly([[a - w / 2 + 0.6, 0.47, z0 + 0.6], [a + w / 2 - 0.6, 0.47, z0 + 0.6], [a + w / 2 - 0.6, 0.47, z0 + h - 0.6], [a - w / 2 + 0.6, 0.47, z0 + h - 0.6]], k.vgrad(a, 0.47, z0, z0 + h, [[0, '#26302d'], [1, '#34403c']]), k.thin);
  // chalk: a heading flourish, rows of scribble, a cup with steam
  const n = 0.5;
  const scribble = (u0: number, u1: number, z: number, amp: number, color: Color, wpx: number) => {
    const pts: Array<[number, number, number]> = [];
    for (let u = u0; u <= u1; u += 0.25) pts.push([u, n, z + Math.sin(u * 5.1 + z * 3) * amp]);
    k.line(pts, color, wpx);
  };
  const cw = Math.max(0.8, 0.13 * s);
  scribble(a - 3, a + 3, z0 + h - 1.5, 0.25, '#f3d27a', Math.max(1, 0.2 * s));
  for (let r = 0; r < 4; r++) {
    const z = z0 + h - 3 - r * 1.15;
    const l = 3.2 + hash(f.k, r, 61) * 2;
    scribble(a - w / 2 + 1.2, a - w / 2 + 1.2 + l, z, 0.12, C.chalk, cw);
    if (k.fine) scribble(a + 0.6, a + 1.4, z, 0.08, '#f2a7a0', cw);
  }
  // the cup
  const cu = a + w / 2 - 2.6;
  const cz = z0 + 1.4;
  pen.beginPath();
  k.trace([[cu - 0.9, n, cz + 1.6], [cu + 0.9, n, cz + 1.6], [cu + 0.6, n, cz], [cu - 0.6, n, cz]]);
  pen.strokeStyle = C.chalk;
  pen.lineWidth = cw;
  pen.stroke();
  for (const du of [-0.4, 0.3]) scribble(cu + du, cu + du + 0.01, cz + 2.4, 0.3, C.chalk, cw);
  k.line([[cu - 0.35, n, cz + 2], [cu - 0.15, n, cz + 2.6], [cu - 0.4, n, cz + 3.1]], C.chalk, cw);
  k.line([[cu + 0.3, n, cz + 2], [cu + 0.5, n, cz + 2.6], [cu + 0.25, n, cz + 3.1]], C.chalk, cw);
}

// Two floating shelves (TIER apart): mugs and a jar on the lower one, a
// pothos trailing off its end; coffee tins, a stack of saucers and a teapot
// on the upper.

function mugShelf(k: Kit, f: Feature): void {
  const a = f.a;
  const w = f.w;
  const z = f.z ?? WAIN + 9;
  const board = (zz: number) => {
    k.shadow(a, 0.4, w * 0.5, 0.8, 0.14, zz - 0.5);
    for (const du of [-w / 2 + 1.2, w / 2 - 1.2]) k.poly([[a + du, 0.05, zz], [a + du, 1.2, zz], [a + du, 0.05, zz - 1.4]], C.iron, k.thin);
    k.box(a - w / 2, 0, zz, w, 1.5, 0.4, C.walnut, { line: k.lw });
  };
  // the upper shelf first: the lower one's plant trails down in front
  const zu = z + TIER;
  board(zu);
  const tins: Color[] = ['#2f6e6a', '#b4473a', '#e3d6bd', '#dba640'];
  let tu = a - w / 2 + 1.3;
  for (let i = 0; i < 3; i++) {
    const c = tins[Math.floor(hash(f.k, i, 72) * tins.length)];
    const th = 1.5 + hash(f.k, i, 73) * 0.9;
    k.cyl(tu, 0.75, zu + 0.4, 0.62, th, c, { top: shade(c, 0.2) });
    k.line([[tu - 0.62, 0.75, zu + 0.4 + th * 0.55], [tu + 0.62, 0.75, zu + 0.4 + th * 0.55]], withAlpha('#f6efe0', 0.8), Math.max(0.7, 0.12 * k.s));
    tu += 1.45;
  }
  for (let i = 0; i < 3; i++) k.cyl(tu + 0.5, 0.75, zu + 0.4 + i * 0.22, 0.85, 0.2, C.china, { line: k.thin });
  const pu0 = a + w / 2 - 1.6;
  k.cyl(pu0, 0.75, zu + 0.4, 0.75, 1.2, '#4f8379', { top: '#5f9a8c' });
  k.rod([[pu0 - 0.7, 0.75, zu + 1.2], [pu0 - 1.3, 0.75, zu + 1.75]], '#4f8379', 0.14);
  k.disc(pu0, 0.75, zu + 1.75, 0.3, '#3f6f68', k.thin);
  // the lower shelf
  board(z);
  const mugs: Color[] = ['#e8d9bf', '#c8603f', '#4f8379', '#e3b25e', '#f2ece0'];
  let u = a - w / 2 + 1.6;
  for (let i = 0; i < 4; i++) {
    const c = mugs[Math.floor(hash(f.k, i, 71) * mugs.length)];
    k.cyl(u, 0.75, z + 0.4, 0.5, 1.1, c);
    k.rod([[u + 0.55, 0.75, z + 1.25], [u + 0.85, 0.75, z + 1.0], [u + 0.55, 0.75, z + 0.65]], c, 0.12);
    u += 1.55;
  }
  // a jar of beans
  k.cyl(u + 0.6, 0.75, z + 0.4, 0.65, 2, '#c6d6d4');
  k.cyl(u + 0.6, 0.75, z + 0.55, 0.5, 1.4, C.coffee, { line: 0 });
  k.cyl(u + 0.6, 0.75, z + 2.4, 0.7, 0.35, C.walnut);
  // a pot with a trailing plant at the far end
  const pu = a + w / 2 - 0.9;
  k.cyl(pu, 0.75, z + 0.4, 0.7, 1.1, C.terracotta);
  ivy(k, pu + 0.3, 0.9, z + 1.5, 6, f.k);
  for (let i = 0; i < 4; i++) {
    const [x, y] = k.p(pu - 0.4 + i * 0.3, 0.8, z + 1.9 + (i & 1) * 0.4);
    k.pen.beginPath();
    k.pen.ellipse(x, y, 0.5 * k.s, 0.32 * k.s, i - 1.5, 0, Math.PI * 2);
    k.paint(i & 1 ? C.leaf : C.leafLight, k.thin * 0.8);
  }
}

// A little gallery hung salon-style: a framed print of a painted landscape
// with two small ones over it, an oval of a steaming cup and a pressed
// sprig of leaves, side by side (which side by the seed).
function gallery(k: Kit, f: Feature): void {
  const a = f.a + (hash(f.k, 85) - 0.5) * 0.6;
  const z0 = WAIN + 5 + hash(f.k, 81) * 1.2;
  const [w, h] = [4.6, 5.8];
  k.shadow(a + 0.2, 0.2, w * 0.6, 0.6, 0.1, z0 - 0.3);
  const n = 0.32;
  const wood = hash(f.k, 82) < 0.5 ? C.brass : C.walnutDark;
  k.box(a - w / 2, 0, z0, w, 0.3, h, wood, { line: k.lw, stripe: false });
  const p = (u: number, z: number): [number, number, number] => [a - w / 2 + u, n, z0 + z];
  // a cream mat, then the painting: sky, two hills, a sun
  k.poly([p(0.45, 0.45), p(w - 0.45, 0.45), p(w - 0.45, h - 0.45), p(0.45, h - 0.45)], '#efe0c2', k.thin);
  const [u0, u1, q0, q1] = [0.85, w - 0.85, 0.85, h - 0.85];
  const sky: ReadonlyArray<readonly [number, Color]> = hash(f.k, 86) < 0.5 ? [[0, '#e9cf96'], [1, '#9fb7c2']] : [[0, '#f0b98a'], [1, '#c98f9a']];
  k.poly([p(u0, q0), p(u1, q0), p(u1, q1), p(u0, q1)], k.vgrad(a, n, z0 + q0, z0 + q1, sky), k.thin * 0.8);
  const iw = u1 - u0;
  k.poly([p(u0, q0), p(u1, q0), p(u1, q0 + 1.6), p(u0 + iw * 0.65, q0 + 2.3), p(u0 + iw * 0.3, q0 + 1.5), p(u0, q0 + 2)], '#6d8f5b', 0);
  k.poly([p(u0, q0), p(u1, q0), p(u1, q0 + 0.8), p(u0 + iw * 0.4, q0 + 1.1), p(u0, q0 + 0.7)], '#4f6f45', 0);
  k.disc(a + iw * 0.2, n, z0 + q1 - 1.1, 0.42, '#f6e2a8', 0);
  // the two small ones over it
  const zs = z0 + h + 0.6;
  const side = hash(f.k, 87) < 0.5 ? -1 : 1;
  oval(k, a + side * 1.25, n, zs + 1.3, f.k);
  sprig(k, a - side * 1.25, n, zs, f.k);
}

// A small oval frame in brass round a cream mat, a cup steaming on it.
function oval(k: Kit, a: number, n: number, zc: number, seed: number): void {
  const ring = (rx: number, rz: number, nn: number): Array<[number, number, number]> => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      out.push([a + Math.cos(th) * rx, nn, zc + Math.sin(th) * rz]);
    }
    return out;
  };
  k.shadow(a + 0.15, 0.15, 1.2, 0.4, 0.08, zc - 1.45);
  k.poly(ring(1.05, 1.3, n - 0.3), shade(C.brass, -0.18), k.lw);
  k.poly(ring(1.05, 1.3, n), C.brass, k.thin);
  k.poly(ring(0.78, 1.02, n + 0.02), hash(seed, 88) < 0.5 ? '#f3e7cf' : '#e6d6c0', k.thin * 0.8);
  // the cup: a bowl, its handle, a saucer and two wisps
  const cz = zc - 0.55;
  k.poly([[a - 0.42, n + 0.04, cz + 0.62], [a + 0.42, n + 0.04, cz + 0.62], [a + 0.3, n + 0.04, cz + 0.08], [a - 0.3, n + 0.04, cz + 0.08]], C.walnut, 0);
  k.line([[a + 0.4, n + 0.04, cz + 0.52], [a + 0.6, n + 0.04, cz + 0.4], [a + 0.36, n + 0.04, cz + 0.22]], C.walnut, Math.max(0.7, 0.09 * k.s));
  k.line([[a - 0.6, n + 0.04, cz], [a + 0.6, n + 0.04, cz]], C.walnut, Math.max(0.8, 0.1 * k.s));
  for (const du of [-0.15, 0.15]) k.line([[a + du, n + 0.04, cz + 0.8], [a + du + 0.12, n + 0.04, cz + 1.05], [a + du - 0.05, n + 0.04, cz + 1.35]], '#b99a78', Math.max(0.6, 0.07 * k.s));
}

// A small walnut frame round a pressed sprig: a stem and its leaves.
function sprig(k: Kit, a: number, n: number, z0: number, seed: number): void {
  const [w, h] = [2.1, 2.6];
  k.shadow(a + 0.15, 0.15, 1.2, 0.4, 0.08, z0 - 0.2);
  k.box(a - w / 2, 0, z0, w, 0.3, h, C.walnut, { line: k.lw, stripe: false });
  k.poly([[a - w / 2 + 0.3, n, z0 + 0.3], [a + w / 2 - 0.3, n, z0 + 0.3], [a + w / 2 - 0.3, n, z0 + h - 0.3], [a - w / 2 + 0.3, n, z0 + h - 0.3]], '#efe6d2', k.thin * 0.8);
  const lean = (hash(seed, 89) - 0.5) * 0.4;
  k.line([[a - lean, n + 0.02, z0 + 0.55], [a + lean, n + 0.02, z0 + h - 0.6]], C.leafDark, Math.max(0.7, 0.07 * k.s));
  for (let i = 0; i < 4; i++) {
    const t = 0.25 + i * 0.18;
    const [x, y] = k.p(a - lean + 2 * lean * t, n + 0.02, z0 + 0.55 + (h - 1.15) * t);
    const side = i & 1 ? 1 : -1;
    k.pen.beginPath();
    k.pen.ellipse(x + side * 0.22 * k.s, y, 0.26 * k.s, 0.13 * k.s, side * -0.5, 0, Math.PI * 2);
    k.paint(i & 1 ? C.leaf : '#7aa866', 0);
  }
}

// A café clock: a round walnut case with a brass bezel, a cream face with
// its hour marks (no numbers) and the hands at ten past ten.
function clock(k: Kit, f: Feature): void {
  const a = f.a;
  const zc = (f.z ?? WAIN + 12) + CLOCK_R;
  const ring = (r: number, n: number): Array<[number, number, number]> => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i < 32; i++) {
      const th = (i / 32) * Math.PI * 2;
      out.push([a + Math.cos(th) * r, n, zc + Math.sin(th) * r]);
    }
    return out;
  };
  k.shadow(a + 0.3, 0.2, CLOCK_R * 0.9, 0.6, 0.12, zc - CLOCK_R - 0.2);
  k.poly(ring(CLOCK_R, 0.05), C.walnutDark, k.lw);
  k.poly(ring(CLOCK_R, 0.6), C.walnut, k.lw);
  k.poly(ring(CLOCK_R - 0.3, 0.66), C.brass, k.thin);
  k.poly(ring(CLOCK_R - 0.6, 0.7), k.vgrad(a, 0.7, zc - CLOCK_R, zc + CLOCK_R, [[0, '#eadcc0'], [1, '#f8f0de']]), k.thin);
  const { pen, s } = k;
  pen.beginPath();
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    const r0 = CLOCK_R - (i % 3 ? 0.85 : 1.15);
    const [x0, y0] = k.p(a + Math.cos(th) * r0, 0.72, zc + Math.sin(th) * r0);
    const [x1, y1] = k.p(a + Math.cos(th) * (CLOCK_R - 0.72), 0.72, zc + Math.sin(th) * (CLOCK_R - 0.72));
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, 0.11 * s);
  pen.lineCap = 'round';
  pen.stroke();
  // ten past ten
  const hand = (th: number, r: number, wpx: number) => k.line([[a, 0.74, zc], [a + Math.cos(th) * r, 0.74, zc + Math.sin(th) * r]], INK, wpx);
  hand(Math.PI * (0.5 + 2 / 6), CLOCK_R * 0.45, Math.max(1, 0.2 * s));
  hand(Math.PI * (0.5 - 2 / 6), CLOCK_R * 0.68, Math.max(0.9, 0.13 * s));
  const [cx, cy] = k.p(a, 0.76, zc);
  pen.beginPath();
  pen.arc(cx, cy, Math.max(1, 0.2 * s), 0, Math.PI * 2);
  k.paint(C.brass, k.thin * 0.7);
  // a glint across the glass
  k.line([[a - CLOCK_R * 0.5, 0.78, zc + CLOCK_R * 0.25], [a - CLOCK_R * 0.15, 0.78, zc + CLOCK_R * 0.55]], '#ffffff80', Math.max(0.8, 0.16 * s));
}

// A brass wall lamp with a cream glass shade, glowing.
function sconce(k: Kit, f: Feature): void {
  const a = f.a;
  const z = WAIN + 9;
  k.halo(a, 0.3, z + 1.5, 9, '#ffc77a', 0.32);
  k.halo(a, 0.3, z + 1.5, 4, '#ffd89a', 0.3);
  // backplate and a curled arm
  k.poly([[a - 0.4, 0.02, z - 1.6], [a + 0.4, 0.02, z - 1.6], [a + 0.4, 0.02, z + 0.2], [a - 0.4, 0.02, z + 0.2]], C.brass, k.thin, 0.3);
  k.rod([[a, 0.05, z - 0.8], [a, 0.7, z - 0.9], [a, 1.1, z - 0.5], [a, 1.1, z + 0.1]], C.brass, 0.16);
  // a frosted glass shade opening upward, lit from inside
  frustum(k, a, 1.1, z, 0.45, z + 2, 1.15, '#ffe9bc', '#fff8e4');
  k.halo(a, 1.1, z + 1.2, 2.2, '#ffe2a0', 0.55);
}

// String lights along the top of a wall: wire in swags between hooks, a
// warm bulb every couple of units.
function stringLights(k: Kit, v: RoomView, end: number): void {
  const { pen, s } = k;
  const z = v.H - LIGHTS;
  const span = 12;
  const sag = 1.4;
  const n = 0.25;
  // their warm wash on the plaster
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.poly([[v.T, 0.05, z - 6], [end, 0.05, z - 6], [end, 0.05, z + 2], [v.T, 0.05, z + 2]], k.vgrad(v.T, 0.05, z - 6, z + 2, [[0, '#ffc07a00'], [0.65, '#ffc07a2a'], [1, '#ffc07a00']]), 0);
  pen.restore();
  const pts: Array<[number, number, number]> = [];
  for (let a = v.T + 1; a <= end - 1; a += 0.5) {
    const ph = ((a - v.T - 1) % span) / span;
    pts.push([a, n, z - sag * 4 * ph * (1 - ph)]);
  }
  k.line(pts, '#3a2a22', Math.max(0.8, 0.1 * s));
  const bulbs: Array<[number, number, number]> = [];
  for (let i = 2; i < pts.length; i += 5) bulbs.push(pts[i]);
  for (const [a, nn, zz] of bulbs) k.halo(a, nn, zz - 0.5, 2.6, '#ffcf7a', 0.36);
  pen.beginPath();
  const br = Math.max(1.3, 0.34 * s);
  for (const [a, nn, zz] of bulbs) {
    const [x, y] = k.p(a, nn, zz - 0.5);
    pen.moveTo(x + br, y);
    pen.ellipse(x, y, br, br * 1.3, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = '#ffe6a8';
  pen.fill();
  if (k.fine) {
    pen.strokeStyle = withAlpha(INK, 0.6);
    pen.lineWidth = k.thin * 0.6;
    pen.stroke();
  }
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen } = k;
  const { W, D, H, T } = v;
  const cap = '#cfb38c';
  // the floor's cut edges
  k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#6b3f22', 0, 1), k.lw);
  k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#6b3f22', 1, 0), k.lw);
  k.line([[T, D, -0.35], [W, D, -0.35], [W, T, -0.35]], '#a8693a', Math.max(1, 0.25 * k.s));
  // the walls' cut ends and tops
  k.poly([[0, D, -SLAB], [T, D, -SLAB], [T, D, H], [0, D, H]], k.side(mix(cap, '#b98f68', 0.5), 0, 1), k.lw);
  k.poly([[W, 0, -SLAB], [W, T, -SLAB], [W, T, H], [W, 0, H]], k.side(mix(cap, '#b98f68', 0.5), 1, 0), k.lw);
  // brick showing in the cut ends
  for (const [p, q] of [[[0, D], [T, D]], [[W, 0], [W, T]]] as const) {
    pen.beginPath();
    for (let z = 0.8; z < H - 0.5; z += 0.8) {
      const [x0, y0] = k.p(p[0] + (q[0] - p[0]) * 0.18, p[1] + (q[1] - p[1]) * 0.18, z);
      const [x1, y1] = k.p(p[0] + (q[0] - p[0]) * 0.82, p[1] + (q[1] - p[1]) * 0.82, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#7a4a3044';
    pen.lineWidth = Math.max(0.6, 0.08 * k.s);
    pen.stroke();
  }
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.35), Math.max(1, 0.2 * k.s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

// Rain running down the upper glass (above anyone's head, so it never
// paints over a figure in front of the window).
function rain(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const w = f.w - 1.6;
  const lo = Math.max(z0 + 1, 17);
  const hi = z1 - w / 2 - 0.3;
  if (hi - lo < 2) return;
  pen.beginPath();
  const n = Math.round(w * 1.1);
  for (let i = 0; i < n; i++) {
    const u = f.a - w / 2 + 0.4 + ((i + 0.5) / n) * (w - 0.8) + (hash(f.k, i, 91) - 0.5) * 0.5;
    if (Math.abs(u - f.a) < 0.35) continue;
    const speed = 5 + hash(f.k, i, 92) * 5;
    const len = 0.8 + hash(f.k, i, 93) * 1.4;
    const span = hi - lo + len;
    const zt = hi - ((v.t * speed + hash(f.k, i, 94) * span) % span);
    const zb = Math.max(lo, zt - len);
    const za = Math.min(hi, zt);
    if (za - zb < 0.2) continue;
    const [x0, y0] = k.p(u, -0.85, za);
    const [x1, y1] = k.p(u, -0.85, zb);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#d6e6f6';
  pen.globalAlpha = 0.55;
  pen.lineWidth = Math.max(0.9, 0.11 * s);
  pen.lineCap = 'round';
  pen.stroke();
  pen.globalAlpha = 1;
}

// The fire's light breathing on the breast above the mantel.
function flicker(k: Kit, v: RoomView, f: Feature): void {
  const t = v.t;
  const n = 0.5 + 0.5 * (0.6 * Math.sin(t * 7.3) + 0.4 * Math.sin(t * 12.9 + 1.3));
  k.halo(f.a + Math.sin(t * 3.1) * 0.4, 1.6, FIRE.z1 + 7.5, 7, '#ff9a48', 0.06 + 0.07 * n);
}
