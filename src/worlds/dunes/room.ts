import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { planLayout, slotRect, slotsOn, wallGaps } from '../../world/layout.ts';
import { defaultPois, footprint } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import { bottle, claypot, dunesView, fillPts, gear, hull, jar, lantern, pipe, ring, rivets, ropeCoil, tube, tubeLamp } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, Kit, hash, withAlpha } from './kit.ts';

// The outpost's shell, a squat drum of poured adobe under a ribbed steel
// dome: a deck of sun-bleached planks in the cool of the shade, sand
// blown in along the walls' feet and through the door, a deck plate under
// the workbench and a kilim before the bar; walls of terracotta adobe
// poured in courses (soft slumped seams, patches plastered over), patched
// with riveted scrap plates rusting at their edges, an exposed pipe run
// along them at shoulder height; a steel ring beam on top, then the dome:
// rusty ribs with sails of hide and striped canvas lashed between them,
// backlit, a scallop of turquoise sky under each. In the free stretches
// between the stations: small windows with slatted shutters (hard white
// daylight through the slats, in shafts down to the floor, a wind turbine
// turning far off), plank shelves on pipe brackets, a bounty board of
// pinned papers, a rack of tools, a big beast's skull, cold tube lamps and
// the one warm lantern; high up, little square vents. Every piece sits
// where the stage's plan leaves the wall free, so nothing hangs behind a
// station.

type Wall = 'left' | 'right';
type Kind = 'window' | 'skull' | 'shelf' | 'board' | 'rack' | 'lantern' | 'tube';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[] };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const POUR = 4; // the adobe's courses
const PIPE_Z = 12; // the pipe run's axis
const PIPE_N = 0.6; // out from the wall
const PIPE_W = 0.8; // its thickness
const SILL = 13.5; // a window's opening, from here
const WTOP = 22.5; // to here
const LOUVRE = 17.8; // the fixed louvres below this, the shutters above
const OPEN = 7; // a window's opening, along the wall
const BACK = -0.9; // the view behind it
const HZ = 18.9; // the dunes' horizon in it
const TUBE_Z = 16.2; // a wall tube lamp's foot
const TUBE_H = 4.6;
const BAND = 1.8; // the steel ring beam's depth
const RIM = 1.3; // the dome's rim at the top
const RIB = 12; // the dome's ribs, about this far apart
// The ring beam's foot: the adobe stands to here.
const bandZ = (H: number) => (H < 48 ? H - 7 : Math.round(H * 0.66));
// Sun through a window falls this far along and out per unit down.
const SUN_U = 0.2;
const SUN_V = 0.45;

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and what hangs on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'dunes');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L) };
  PLANS.set(key, plan);
  return plan;
}

const WIDTH: Record<Kind, number> = { window: 12, skull: 9, shelf: 10, board: 8, rack: 9, lantern: 2, tube: 3 };
const ORDER: Kind[] = ['window', 'shelf', 'board', 'tube', 'skull', 'rack', 'window', 'tube', 'shelf', 'lantern', 'window', 'board', 'rack', 'tube', 'shelf', 'window'];
const CAP: Record<Kind, number> = { window: 5, skull: 1, shelf: 3, board: 2, rack: 2, lantern: 1, tube: 4 };
const GAP = 4;

// Bays along the free stretches: a window first on each wall, then the
// order above (cycled), skipping what is at its cap or does not fit; what
// fits with 4 units between the pieces is then spread with even gaps, the
// ends too. When every kind is at its cap the rest of the wall stays bare
// adobe (its plates and pipe are company enough).
function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= WIDTH.lantern) spans.push({ wall, a0, a1 });
    }
  }
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  const count: Partial<Record<Kind, number>> = {};
  const windows = { left: 0, right: 0 };
  let n = 0;
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? GAP : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      if (!windows[s.wall] && room('window')) k = 'window';
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < CAP[c] && room(c)) k = c;
      }
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? GAP : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      if (k === 'window') windows[s.wall]++;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    kinds.forEach((k, i) => {
      out.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
  }
  return out;
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but the two by the bar for a drink rather than to warm
// up, tea for two on the rug by the teapot, and a look out of the windows.
export function dunesPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).map((p): Poi => (p.kind === 'warm' ? { ...p, kind: 'drink' } : p));
  const rug = slot('think');
  if (rug) out.push({ ...at(rug, -4, 1), kind: 'warm', face: mid(rug) }, { ...at(rug, 4, 1), kind: 'warm', face: mid(rug) });
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
    for (const wall of ['right', 'left'] as const) drift(new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), v, wall);
    doorSand(v, plan.L);
    light(v, plan);
    shell(k, v);
    v.pen.restore();
  },
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    for (const f of plan.features) {
      if (f.kind !== 'window' && f.kind !== 'tube') continue;
      const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
      if (f.kind === 'window') gusts(k, v, f);
      else flicker(k, v, f);
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

// A deck of planks bleached by the sun, a clear step lighter than a
// drifter's sand coat, so the figures read against it (the test checks the
// step).
export const FLOOR = '#e6d3ae';
export const BOARDS = ['#ead8b4', '#e2cda5', '#eedfbf', '#e4d0aa'] as const;
const BOARD_W = 2.4; // a board's width

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen, s } = k;
  const { W, D, T } = v;
  if (!k.sees(T, T, -SLAB, W, D, 0, 8)) return;
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], FLOOR, 0);
  // The visible stretch of the floor: x - y and x + y ranges on the pen.
  const [ox, oy] = k.p(0, 0, 0);
  const pad = 18;
  const dlo = -ox / s - pad;
  const dhi = (pen.width - ox) / s + pad;
  const slo = (2 * -oy) / s - pad;
  const shi = (2 * (pen.height - oy)) / s + pad;
  const seen = (x: number, y: number) => x - y >= dlo && x - y <= dhi && x + y >= slo && x + y <= shi;
  // Boards along x in rows BOARD_W wide, 7-15 long, their ends staggered;
  // now and then one a shade off.
  const tones: P3[][][] = BOARDS.map(() => []);
  const rows: Array<[P3, P3]> = [];
  const ends: Array<[P3, P3]> = [];
  const nails: P3[] = [];
  for (let r = 0; T + r * BOARD_W < D; r++) {
    const y0 = T + r * BOARD_W;
    const y1 = Math.min(D, y0 + BOARD_W);
    let x0 = T - hash(r, 2) * 12;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; x0 < W; i++) {
      const x1 = x0 + 7 + Math.floor(hash(r, i, 3) * 9);
      const cx = Math.max(T, x0);
      const ex = Math.min(W, x1);
      if (ex - cx > 0.5 && (seen(cx, y0) || seen(ex, y1) || seen((cx + ex) / 2, (y0 + y1) / 2))) {
        lo = Math.min(lo, cx);
        hi = Math.max(hi, ex);
        const t = Math.floor(hash(r, i, 5) * 9);
        if (t < BOARDS.length - 1) tones[t + 1].push([[cx, y0 + 0.05, 0], [ex, y0 + 0.05, 0], [ex, y1 - 0.05, 0], [cx, y1 - 0.05, 0]]);
        if (x1 < W - 0.5) {
          ends.push([[x1, y0, 0], [x1, y1, 0]]);
          if (k.fine) nails.push([x1 - 0.4, (y0 + y1) / 2, 0], [x1 + 0.4, (y0 + y1) / 2, 0]);
        }
      }
      x0 = x1;
    }
    if (r > 0 && hi > lo) rows.push([[lo, y0, 0], [hi, y0, 0]]);
  }
  tones.forEach((list, ti) => {
    if (!list.length) return;
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = BOARDS[ti];
    pen.fill();
  });
  if (k.fine) {
    // the lit (upper left) edge of each row
    k.segs(rows.map(([a, b]): [P3, P3] => [[a[0], a[1] + 0.22, 0], [b[0], b[1] + 0.22, 0]]), withAlpha('#fff6e2', 0.5), Math.max(0.6, 0.09 * s));
  }
  k.segs(rows, withAlpha('#8a6a44', 0.4), Math.max(0.7, 0.1 * s));
  k.segs(ends, withAlpha('#8a6a44', 0.45), Math.max(0.7, 0.1 * s));
  if (nails.length) rivets(k, nails, withAlpha('#7a6650', 0.7), 0.09);
  // The room is in the shade of its walls and its sails, the sun only
  // where it comes through the windows: a cool lavender cast over the
  // deck, which keeps the bleached boards' step over a coat but sets them
  // under the white of the shafts and apart from the warm adobe.
  pen.save();
  pen.globalCompositeOperation = 'multiply';
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], withAlpha('#cfc8d6', 0.36), 0);
  pen.restore();
  // What the islands stand on: the workbench on a deck plate, a kilim
  // runner before the bar.
  for (const q of plan.L.slots) {
    if (!q.island || (q.kind !== 'run' && q.kind !== 'idle')) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (!qk.sees(-2, -2, 0, q.len + 2, q.dep + 2, 0)) continue;
    if (q.kind === 'run') deckPlate(qk, -1.2, -1.2, q.len + 1.2, q.dep + 1.4, q.x0 + q.y0);
    else kilim(qk, -0.6, 4.2, q.len + 0.6, q.dep + 1.4);
  }
  // Shade: darker toward the walls' feet and the far corner, sunlit middle.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#5a2e1030');
  g.addColorStop(0.35, '#5a2e100a');
  g.addColorStop(0.7, '#5a2e1000');
  g.addColorStop(1, '#5a2e1014');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
}

// ── the walls' feet ────────────────────────────────────────────────────────

// Sand blown up against the foot of a wall: a soft ridge, lit along its
// crest, rippled by the wind.
function drift(k: Kit, v: RoomView, wall: Wall): void {
  const { T } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, 0, end, 5, 2)) return;
  const salt = wall === 'right' ? 3 : 7;
  const ph = [hash(salt, 1) * 6.3, hash(salt, 2) * 6.3, hash(salt, 3) * 6.3, hash(salt, 4) * 6.3];
  const n = (a: number, i: number) => 0.5 + 0.28 * Math.sin(a * 0.19 + ph[i]) + 0.14 * Math.sin(a * 0.47 + ph[i + 1]) + 0.08 * Math.sin(a * 1.13 + ph[i]);
  const crest: P3[] = [];
  const toe: P3[] = [];
  const step = 1.5;
  for (let a = T; a <= end + 0.01; a += step) {
    const aa = Math.min(a, end);
    const h = 0.5 + 1.1 * n(aa, 0);
    const r = 1.6 + 2.6 * n(aa + 40, 1);
    crest.push([aa, 0, h]);
    toe.push([aa, r, 0]);
  }
  const lit = k.lit(0, 1);
  k.poly([...crest, ...toe.slice().reverse()], k.lgrad([T, 0, 0], [T, 4, 0], [1, 0, 0], [[0, lit ? '#f4dcae' : '#e8cc98'], [0.55, '#ebcf9c'], [1, '#dcb680']]), 0);
  k.line(toe, withAlpha('#b88a54', 0.45), Math.max(0.7, 0.12 * k.s));
  if (k.fine) {
    // wind ripples along the drift
    const rip: Array<[P3, P3]> = [];
    for (let i = 0; i < crest.length - 2; i += 2) {
      const a = crest[i][0];
      const r = toe[i][1];
      rip.push([[a + 0.3, r * 0.45, 0.35], [a + 2.4, r * 0.5, 0.3]]);
    }
    k.segs(rip, withAlpha('#c99a62', 0.4), Math.max(0.6, 0.06 * k.s), 'round');
  }
}

// What the workbench stands on: a deck plate of riveted scrap, a seam
// across it, rust in at its corners and edges, an old oil stain (u0..u1,
// v0..v1 in the island's frame).
function deckPlate(k: Kit, u0: number, v0: number, u1: number, v1: number, seed: number): void {
  const q: P3[] = [[u0, v0, 0.02], [u1, v0, 0.02], [u1, v1, 0.02], [u0, v1, 0.02]];
  k.shadow((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) * 0.55, (v1 - v0) * 0.55, 0.12);
  k.poly(q, '#a8a498', k.thin);
  const um = u0 + (u1 - u0) * (0.45 + hash(seed, 3) * 0.1);
  // rust at the corners and in from the edges
  for (const [cu, cv] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]] as const) {
    const du = cu === u0 ? 1 : -1;
    const dv = cv === v0 ? 1 : -1;
    const r = 1.1 + hash(seed, cu, cv) * 0.8;
    k.poly([[cu + du * 0.08, cv + dv * 0.08, 0.03], [cu + du * r, cv + dv * 0.08, 0.03], [cu + du * r * 0.5, cv + dv * r * 0.45, 0.03], [cu + du * 0.08, cv + dv * r, 0.03]], withAlpha(C.rust, 0.4), 0, 0.3);
  }
  // an oil stain
  k.shadow(u0 + (u1 - u0) * 0.7, v0 + (v1 - v0) * 0.7, 1.6, 1.1, 0.16, 0.03);
  // the seam, its lit lip, and the rivets round both plates
  k.line([[um, v0, 0.03], [um, v1, 0.03]], withAlpha(INK, 0.6), Math.max(0.7, k.thin * 0.8));
  k.line([[um + 0.15, v0 + 0.1, 0.03], [um + 0.15, v1 - 0.1, 0.03]], withAlpha('#eef0ea', 0.5), Math.max(0.6, 0.07 * k.s));
  k.line([[u0 + 0.15, v0 + 0.15, 0.03], [u1 - 0.15, v0 + 0.15, 0.03]], withAlpha('#eef0ea', 0.45), Math.max(0.6, 0.07 * k.s));
  if (k.s >= 3) {
    const dots: P3[] = [];
    for (const [a, b] of [[u0, um], [um, u1]] as const) {
      const nu = Math.max(2, Math.round((b - a) / 1.6));
      for (let i = 0; i <= nu; i++) dots.push([a + 0.45 + (i * (b - a - 0.9)) / nu, v0 + 0.45, 0.03], [a + 0.45 + (i * (b - a - 0.9)) / nu, v1 - 0.45, 0.03]);
      const nv = Math.max(2, Math.round((v1 - v0) / 1.6));
      for (let i = 1; i < nv; i++) dots.push([a + 0.45, v0 + 0.45 + (i * (v1 - v0 - 0.9)) / nv, 0.03], [b - 0.45, v0 + 0.45 + (i * (v1 - v0 - 0.9)) / nv, 0.03]);
    }
    rivets(k, dots, '#6f6b62', 0.11);
  }
}

// A kilim runner before the bar (u0..u1, v0..v1 in the island's frame):
// a cream ground in a rust border, a row of stepped turquoise and rust
// lozenges down it, a fringe at either end.
function kilim(k: Kit, u0: number, v0: number, u1: number, v1: number): void {
  const z = 0.03;
  const q = (a0: number, b0: number, a1: number, b1: number, h = z): P3[] => [[a0, b0, h], [a1, b0, h], [a1, b1, h], [a0, b1, h]];
  k.shadow((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) * 0.52, (v1 - v0) * 0.6, 0.1);
  k.poly(q(u0, v0, u1, v1), C.cloth, k.thin);
  const b = 0.7;
  k.poly(q(u0 + b, v0 + b, u1 - b, v1 - b, z + 0.01), '#efe0c2', 0);
  k.pen.beginPath();
  k.trace(q(u0 + b + 0.3, v0 + b + 0.3, u1 - b - 0.3, v1 - b - 0.3, z + 0.02));
  k.paint(null, Math.max(0.7, 0.12 * k.s), withAlpha('#6a3a22', 0.7));
  // the lozenges, stepped, alternately turquoise and rust
  const vm = (v0 + v1) / 2;
  const rv = Math.min(1.6, (v1 - v0) / 2 - b - 0.7);
  const ru = rv * 0.9;
  const n = Math.max(1, Math.floor((u1 - u0 - 2 * b - 1) / (ru * 2 + 0.6)));
  const gap = (u1 - u0 - n * ru * 2) / (n + 1);
  for (let i = 0; i < n; i++) {
    const cu = u0 + gap * (i + 1) + ru * (2 * i + 1);
    const c = i % 2 ? C.cloth : C.turquoise;
    k.poly([[cu - ru, vm, z + 0.02], [cu, vm - rv, z + 0.02], [cu + ru, vm, z + 0.02], [cu, vm + rv, z + 0.02]], c, 0);
    k.poly([[cu - ru * 0.45, vm, z + 0.03], [cu, vm - rv * 0.45, z + 0.03], [cu + ru * 0.45, vm, z + 0.03], [cu, vm + rv * 0.45, z + 0.03]], i % 2 ? '#efe0c2' : '#6a3a22', 0);
  }
  // the fringe at the ends
  if (k.s >= 3) {
    const fr: Array<[P3, P3]> = [];
    for (let w = v0 + 0.3; w < v1 - 0.2; w += 0.45) fr.push([[u0, w, z], [u0 - 0.5, w, z]], [[u1, w, z], [u1 + 0.5, w, z]]);
    k.segs(fr, '#e8d6b2', Math.max(0.6, 0.09 * k.s), 'round');
  }
}

// Sand blown in at the door: a lobed fan spilling from under the
// threshold into the room, its lit crest and its ripples, and a trail of
// footprints through it toward the bar.
function doorSand(v: RoomView, L: Layout): void {
  const q = L.slots.find((p) => p.kind === 'entrance');
  if (!q) return;
  const k = new Kit(v.pen, frame(v.at, q.wall, q.x0, q.y0), v.s);
  const cu = 6.5; // the doorway's middle (stations.ts DOOR)
  const cv = 1.0;
  if (!k.sees(cu - 7, 0, 0, cu + 7, 9, 0.5)) return;
  const ph = hash(q.x0, q.y0, 7) * 6.3;
  const lobe = (th: number) => 1 + 0.13 * Math.sin(th * 3 + ph) + 0.07 * Math.sin(th * 7 + ph * 2);
  const fan = (ru: number, rv: number, z: number): P3[] => {
    const out: P3[] = [];
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * Math.PI;
      const r = lobe(th);
      out.push([cu + Math.cos(th) * ru * r, cv + Math.sin(th) * rv * r, z]);
    }
    return out;
  };
  const outer = fan(5.2, 6.4, 0.02);
  k.poly(outer, withAlpha('#e3c48e', 0.92), 0);
  k.line(outer, withAlpha('#b88a54', 0.4), Math.max(0.7, 0.1 * k.s));
  k.poly(fan(3.2, 3.9, 0.04), withAlpha('#f3dcae', 0.85), 0);
  if (k.s >= 3) {
    // ripples across it, curving round the doorway
    const rip: Array<[P3, P3]> = [];
    for (const f of [0.55, 0.78]) {
      for (let i = 2; i < 22; i += 3) {
        const a = (i / 24) * Math.PI;
        const b = ((i + 1.6) / 24) * Math.PI;
        rip.push([[cu + Math.cos(a) * 5.2 * f * lobe(a), cv + Math.sin(a) * 6.4 * f * lobe(a), 0.05], [cu + Math.cos(b) * 5.2 * f * lobe(b), cv + Math.sin(b) * 6.4 * f * lobe(b), 0.05]]);
      }
    }
    k.segs(rip, withAlpha('#c99a62', 0.45), Math.max(0.6, 0.08 * k.s), 'round');
  }
  // footprints, from the doorway toward the bar (or out into the room)
  const bar = L.slots.find((p) => p.kind === 'idle');
  const [sx, sy] = [q.wall === 'right' ? q.x0 + cu : q.x0 + 2.5, q.wall === 'right' ? q.y0 + 2.5 : q.y0 + cu];
  let [dx, dy] = bar ? [bar.x0 + (bar.wall === 'right' ? bar.len : bar.dep) / 2 - sx, bar.y0 + (bar.wall === 'right' ? bar.dep : bar.len) / 2 - sy] : q.wall === 'right' ? [0, 1] : [1, 0];
  const l = Math.hypot(dx, dy) || 1;
  [dx, dy] = [dx / l, dy / l];
  const wk = new Kit(v.pen, v.at, v.s);
  const pen = v.pen;
  pen.beginPath();
  for (let i = 0; i < 8; i++) {
    const side = i % 2 ? 1 : -1;
    const x = sx + dx * (0.9 + i * 0.85) - dy * side * 0.32;
    const y = sy + dy * (0.9 + i * 0.85) + dx * side * 0.32;
    const pts: P3[] = [];
    for (let j = 0; j < 10; j++) {
      const t = (j / 10) * Math.PI * 2;
      pts.push([x + dx * Math.cos(t) * 0.32 - dy * Math.sin(t) * 0.17, y + dy * Math.cos(t) * 0.32 + dx * Math.sin(t) * 0.17, 0.06]);
    }
    wk.trace(pts);
  }
  pen.fillStyle = withAlpha('#b8905a', 0.45);
  pen.fill();
}

// ── light ──────────────────────────────────────────────────────────────────

// Hard white daylight through the windows: a shaft from each down to the
// floor, striped where it came through the louvres, solid through the open
// shutters; the tube lamps' cold pools under them, the lantern's warm one.
function light(v: RoomView, plan: Plan): void {
  for (const f of plan.features) {
    if (f.kind !== 'window' && f.kind !== 'lantern' && f.kind !== 'tube') continue;
    const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
    const end = f.wall === 'right' ? v.W : v.D;
    if (!k.sees(f.a - 9, 0, 0, f.a + 14, 14, WTOP)) continue;
    if (f.kind === 'window') shaft(k, f, end);
    else if (f.kind === 'tube') k.pool(f.a, 3.2, 4.5, 3.2, C.tubeGlow, 0.16);
    else k.pool(f.a, 2.5, 5, 3.5, C.lamp, 0.18);
  }
}

function shaft(k: Kit, f: Feature, end: number): void {
  const u0 = f.a - OPEN / 2 + 0.3;
  const u1 = f.a + OPEN / 2 - 0.3;
  const fl = (u: number, z: number): P3 => [Math.min(end - 0.5, u + SUN_U * z), SUN_V * z, 0];
  const pen = k.pen;
  pen.save();
  pen.globalCompositeOperation = 'screen';
  // the shaft in the air, brightest at the window
  const pts: Pt[] = [k.p(u0, 0.2, WTOP), k.p(u1, 0.2, WTOP), k.p(u0, 0.2, SILL), k.p(u1, 0.2, SILL), k.p(...fl(u0, SILL)), k.p(...fl(u1, SILL)), k.p(...fl(u0, WTOP)), k.p(...fl(u1, WTOP))];
  const sil = hull(pts);
  const [wx, wy] = k.p(f.a, 0, (SILL + WTOP) / 2);
  const [fx, fy] = k.p(...fl(f.a, (SILL + WTOP) / 2));
  const g = pen.createLinearGradient(wx, wy, fx, fy);
  g.addColorStop(0, withAlpha('#fff8e8', 0.3));
  g.addColorStop(0.6, withAlpha('#fff8e8', 0.12));
  g.addColorStop(1, withAlpha('#fff8e8', 0.05));
  pen.beginPath();
  sil.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  pen.fillStyle = g;
  pen.fill();
  // on the floor: solid from the open shutters, slats from the louvres
  pen.beginPath();
  k.trace([fl(u0, LOUVRE + 0.3), fl(u1, LOUVRE + 0.3), fl(u1, WTOP), fl(u0, WTOP)], 0.4);
  for (let z = SILL + 0.5; z < LOUVRE - 0.3; z += 0.85) k.trace([fl(u0, z), fl(u1, z), fl(u1, z + 0.45), fl(u0, z + 0.45)]);
  pen.fillStyle = withAlpha('#fff3d8', 0.55);
  pen.fill();
  pen.restore();
}

// ── walls ──────────────────────────────────────────────────────────────────

// The adobe's pours, a batch a course: warm terracotta earth, a clear
// step lighter than a drifter's coat (the test checks the step) and
// warmer than the bleached deck, so wall and floor part by hue as well as
// value; the plates patched onto it.
export const ADOBE: readonly Color[] = ['#c4946a', '#b8895f', '#c99d72', '#b08259'];
export const PLATES: readonly Color[] = [C.plate, '#8a857a', '#5f9a92', '#93664a'];
const DOME: readonly Color[] = ['#7d7972', '#76726b'];
const RIBC = '#8a6446';

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

type Tone = (c: Color, d?: number) => Color;
type Span = readonly [number, number];

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 4.5, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone: Tone = (c, d = 0.15) => (lit ? c : shade(c, -d));
  const mine = plan.features.filter((f) => f.wall === wall);
  // the stretches the stations stand in front of
  const busy: Span[] = slotsOn(plan.L, wall).map((q) => {
    const r = slotRect(q);
    return wall === 'right' ? [r.x0, r.x1] : [r.y0, r.y1];
  });
  const [ax0, ax1] = visibleAlong(k, T, end, 0, H);
  if (ax1 <= ax0) return;
  const salt = wall === 'right' ? 1 : 2;
  const zb = bandZ(H);
  if (k.sees(T, 0, 0, end, 1, zb, 8)) {
    adobe(k, T, end, zb, ax0, ax1, salt, tone, mine);
    plates(k, T, end, zb, ax0, ax1, salt, tone, mine, busy);
    if (zb - 7.5 >= 25) vents(k, T, end, zb, ax0, ax1, salt, tone, mine);
    pipeRun(k, T, end, ax0, ax1, salt, tone, mine, busy);
  }
  dome(k, T, end, zb, H, ax0, ax1, salt, tone);
  // What hangs on the wall.
  for (const f of mine) {
    if (!k.sees(f.a - f.w / 2, 0, 11, f.a + f.w / 2, 4, zb)) continue;
    if (f.kind === 'window') windowArt(k, f, lit);
    else if (f.kind === 'skull') skull(k, f);
    else if (f.kind === 'shelf') shelf(k, f);
    else if (f.kind === 'board') board(k, f);
    else if (f.kind === 'rack') rack(k, f);
    else if (f.kind === 'tube') tubeArt(k, f, zb);
    else lanternArt(k, f);
  }
}

// Within a feature's stretch (and height band), or a station's.
const under = (mine: Feature[], a0: number, a1: number, z0: number, z1: number) => mine.some((f) => a1 > f.a - f.w / 2 - 0.5 && a0 < f.a + f.w / 2 + 0.5 && z1 > 11 && z0 < 28);
const behind = (busy: Span[], a0: number, a1: number) => busy.some(([b0, b1]) => a1 > b0 - 0.5 && a0 < b1 + 0.5);

// Poured adobe: courses POUR deep, each of its own batch (a tone), the
// seams between them wavy where the pour slumped (soft, so they read as
// earth and not as boards), a faint lit lip over each; patches where it
// was plastered over again, a few hairline cracks; darker at the foot and
// up under the dome.
function adobe(k: Kit, a0: number, a1: number, z1: number, ax0: number, ax1: number, salt: number, tone: Tone, mine: Feature[]): void {
  const lo = Math.max(a0, ax0 - 4);
  const hi = Math.min(a1, ax1 + 4);
  if (hi <= lo) return;
  k.rect(a0, 0, a1, z1, 0, tone(ADOBE[0]));
  const n = Math.ceil(z1 / POUR);
  const seam = (i: number, a: number) => (i <= 0 ? 0 : i >= n ? z1 : Math.min(z1, i * POUR + 0.55 * Math.sin(a * 0.11 + i * 1.7 + salt) + 0.3 * Math.sin(a * 0.37 + i * 2.9)));
  const xs: number[] = [];
  for (let a = lo; a < hi; a += 2) xs.push(a);
  xs.push(hi);
  const fills: P3[][][] = ADOBE.map(() => []);
  for (let i = 0; i < n; i++) {
    const t = Math.floor(hash(i, salt, 5) * ADOBE.length);
    if (!t) continue;
    fills[t].push([...xs.map((a): P3 => [a, 0, seam(i, a)]), ...xs.slice().reverse().map((a): P3 => [a, 0, seam(i + 1, a)])]);
  }
  const pen = k.pen;
  fills.forEach((list, t) => {
    if (!list.length) return;
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = tone(ADOBE[t]);
    pen.fill();
  });
  // seams: a shadow under each course's lip, the lip lit
  const dark: P3[][] = [];
  const lip: P3[][] = [];
  for (let i = 1; i < n; i++) {
    dark.push(xs.map((a): P3 => [a, 0.01, seam(i, a) - 0.1]));
    lip.push(xs.map((a): P3 => [a, 0.01, seam(i, a) + 0.16]));
  }
  const lines = (list: P3[][], c: Color, w: number) => {
    pen.beginPath();
    for (const q of list) q.forEach(([u, n2, z], j) => {
      const [x, y] = k.p(u, n2, z);
      if (j) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
    pen.strokeStyle = c;
    pen.lineWidth = w;
    pen.lineJoin = 'round';
    pen.stroke();
  };
  lines(dark, withAlpha('#4a2e18', 0.2), Math.max(0.6, 0.1 * k.s));
  lines(lip, withAlpha('#f6dfbc', 0.12), Math.max(0.6, 0.1 * k.s));
  // patches plastered over again: soft rounded blots a shade lighter or
  // darker than the wall, here and there (whole units, so a tile finds
  // the same ones)
  const blots: P3[][][] = [[], []];
  for (let a = Math.floor(lo / 3) * 3; a < hi; a += 3) {
    const h = hash(a, salt, 16);
    if (h > 0.42) continue;
    const cu = a + hash(a, salt, 17) * 3;
    const cz = 1.5 + hash(a, salt, 18) * (z1 - 3);
    const ru = 1.0 + hash(a, salt, 19) * 1.2;
    const rz = ru * (0.45 + hash(a, salt, 20) * 0.25);
    if (under(mine, cu - ru, cu + ru, cz - rz, cz + rz)) continue;
    const pts: P3[] = [];
    for (let j = 0; j < 14; j++) {
      const th = (j / 14) * Math.PI * 2;
      const r = 1 + 0.18 * Math.sin(th * 3 + a);
      pts.push([cu + Math.cos(th) * ru * r, 0.01, cz + Math.sin(th) * rz * r]);
    }
    blots[h < 0.24 ? 0 : 1].push(pts);
  }
  blots.forEach((list, i) => {
    if (!list.length) return;
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = withAlpha(tone(i ? '#9e7650' : '#e0b88e'), i ? 0.12 : 0.16);
    pen.fill();
  });
  // hairline cracks down from a seam here and there
  const cracks: P3[][] = [];
  for (let a = a0 + 7 + hash(salt, 11) * 6; a < a1 - 3; a += 9 + hash(Math.floor(a), salt, 12) * 10) {
    if (a < lo || a > hi || hash(Math.floor(a), salt, 13) < 0.45) continue;
    const i = 1 + Math.floor(hash(Math.floor(a), salt, 14) * (n - 1));
    const z = seam(i, a) - 0.15;
    if (under(mine, a - 1.5, a + 1.5, z - 4, z)) continue;
    const len = 1.8 + hash(Math.floor(a), salt, 15) * 2.2;
    const j = (q: number) => (hash(Math.floor(a), q, salt) - 0.5) * 0.9;
    cracks.push([[a, 0.01, z], [a + j(1), 0.01, z - len * 0.35], [a + j(2) + 0.2, 0.01, z - len * 0.7], [a + j(3), 0.01, z - len]]);
  }
  lines(cracks, withAlpha(INK, 0.38), Math.max(0.6, 0.07 * k.s));
  // light and shade: the foot dark with sand and shadow, a sheen at
  // shoulder height, dim up under the dome, the far corner dimmer still
  k.rect(a0, 0, a1, z1, 0, k.vgrad(a0, 0, 0, z1, [[0, '#2a140a30'], [0.1, '#2a140a00'], [0.42, '#fff4dc0c'], [0.7, '#2a140a08'], [1, '#2a140a40']]));
  k.rect(a0, 0, a0 + 12, z1, 0, k.hgrad([a0, 0, 0], [a0 + 12, 0, 0], [[0, '#2a140a40'], [1, '#2a140a00']]));
}

// Riveted scrap plates patched onto the adobe, rust eating in from their
// edges and running down below them; low down between the stations, and
// high up where the wall is tall. Now and then one painted turquoise once.
function plates(k: Kit, a0: number, a1: number, zb: number, ax0: number, ax1: number, salt: number, tone: Tone, mine: Feature[], busy: Span[]): void {
  for (let a = a0 + 5 + hash(salt, 21) * 8, i = 0; a < a1 - 7; a += 11 + hash(i, salt, 22) * 12, i++) {
    const w = 4.2 + hash(i, salt, 23) * 1.8;
    const h = 3.2 + hash(i, salt, 24) * 1.3;
    if (a + w < ax0 - 2 || a > ax1 + 2 || behind(busy, a, a + w)) continue;
    const high = zb - 9 > 25 && hash(i, salt, 25) < 0.45;
    const z = high ? 25 + hash(i, salt, 26) * (zb - 9 - 25) : 2 + hash(i, salt, 26) * 3.2;
    if (under(mine, a, a + w, z, z + h)) continue;
    plate(k, a, z, w, h, tone, PLATES[Math.floor(hash(i, salt, 27) * PLATES.length)], i * 13 + salt);
  }
}

function plate(k: Kit, a: number, z: number, w: number, h: number, tone: Tone, paint: Color, seed: number): void {
  const n = 0.06;
  const j = (q: number) => (hash(seed, q, 31) - 0.5) * 0.5;
  // rust runs down the adobe from its foot
  const runs: P3[][] = [];
  for (let i = 0; i < 2; i++) {
    const ra = a + 0.6 + hash(seed, i, 32) * (w - 1.2);
    const len = 1 + hash(seed, i, 33) * 2.2;
    runs.push([[ra - 0.22, 0.02, z + 0.1], [ra + 0.22, 0.02, z + 0.1], [ra + 0.08, 0.02, z - len], [ra - 0.06, 0.02, z - len * 0.7]]);
  }
  k.pen.beginPath();
  for (const q of runs) k.trace(q);
  k.pen.fillStyle = withAlpha(tone(C.rust), 0.4);
  k.pen.fill();
  // its shadow on the wall, the plate in rust, then its paint inset
  const q: P3[] = [[a, n, z], [a + w, n, z + 0.06], [a + w + 0.04, n, z + h], [a - 0.04, n, z + h - 0.05]];
  k.poly(q.map(([u, , zz]): P3 => [u + 0.22, 0.03, zz - 0.25]), withAlpha('#2a140a', 0.22), 0);
  k.poly(q, tone(mix(C.rust, paint, 0.35)), k.thin);
  const r = (u: number, zz: number, q2: number): P3 => [u + j(q2) * 0.6, n + 0.01, zz + j(q2 + 1) * 0.6];
  k.poly([r(a + 0.35, z + 0.4, 1), r(a + w * 0.5, z + 0.3, 3), r(a + w - 0.35, z + 0.45, 5), r(a + w - 0.3, z + h * 0.5, 7), r(a + w - 0.4, z + h - 0.35, 9), r(a + w * 0.45, z + h - 0.3, 11), r(a + 0.35, z + h - 0.4, 13), r(a + 0.3, z + h * 0.45, 15)], tone(paint), 0, 0.3);
  k.line([[a + 0.1, n + 0.02, z + h - 0.12], [a + w - 0.1, n + 0.02, z + h - 0.08]], withAlpha('#fff2d8', 0.4), Math.max(0.6, 0.09 * k.s));
  if (k.s >= 3) {
    const dots: P3[] = [];
    const nu = Math.max(2, Math.round(w / 1.3));
    for (let i = 0; i <= nu; i++) dots.push([a + 0.3 + (i * (w - 0.6)) / nu, n + 0.02, z + 0.3], [a + 0.3 + (i * (w - 0.6)) / nu, n + 0.02, z + h - 0.3]);
    for (const u of [a + 0.3, a + w - 0.3]) dots.push([u, n + 0.02, z + h * 0.5]);
    rivets(k, dots, tone(C.plateDark), 0.11);
  }
}

// Little square vents up high, as on a drum tower, the haze bright in
// them, a lintel over each.
function vents(k: Kit, a0: number, a1: number, zb: number, ax0: number, ax1: number, salt: number, tone: Tone, mine: Feature[]): void {
  const z0 = zb - 7.5;
  const z1 = z0 + 3;
  for (let a = a0 + 9 + hash(salt, 41) * 5, i = 0; a < a1 - 5; a += 15 + hash(i, salt, 42) * 4, i++) {
    if (a + 3 < ax0 - 2 || a > ax1 + 2 || hash(i, salt, 43) < 0.25) continue;
    if (mine.some((f) => f.kind === 'skull' && Math.abs(f.a - a - 1.5) < f.w / 2 + 2)) continue;
    const u0 = a;
    const u1 = a + 3;
    k.poly([[u0, 0, z0], [u1, 0, z0], [u1, 0, z1], [u0, 0, z1]], tone('#4a3424'), 0);
    k.poly([[u0 + 0.7, 0, z0 + 0.25], [u1 - 0.1, 0, z0 + 0.25], [u1 - 0.1, 0, z1 - 0.75], [u0 + 0.7, 0, z1 - 0.75]], k.vgrad(u0, 0, z0, z1, [[0, '#f6e6c4'], [1, C.sky]]), 0);
    k.segs([[[u0 + 1.4, 0.02, z0], [u0 + 1.4, 0.02, z1]], [[u0 + 2.2, 0.02, z0], [u0 + 2.2, 0.02, z1]]], tone(C.steelDark), Math.max(0.8, 0.18 * k.s));
    k.poly([[u0, 0, z0], [u1, 0, z0], [u1, 0.5, z0 - 0.1], [u0, 0.5, z0 - 0.1]], tone(C.adobeLight), 0);
    k.pen.beginPath();
    k.trace([[u0, 0, z0], [u1, 0, z0], [u1, 0, z1], [u0, 0, z1]]);
    k.paint(null, k.thin);
    k.box(u0 - 0.5, 0, z1, 4, 0.5, 0.5, tone(C.plankDark), { line: k.thin, stripe: false });
  }
}

// One pipe along the wall at shoulder height, clamped to it, a flange at
// each joint; once a wall it drops to the floor through a valve wheel
// where nothing stands in front of it.
function pipeRun(k: Kit, a0: number, a1: number, ax0: number, ax1: number, salt: number, tone: Tone, mine: Feature[], busy: Span[]): void {
  const lo = Math.max(a0, ax0 - 3);
  const hi = Math.min(a1, ax1 + 3);
  if (hi <= lo) return;
  // the drop: the free stretch nearest the middle of the wall
  let drop: number | null = null;
  const mid = (a0 + a1) / 2 + (hash(salt, 51) - 0.5) * 20;
  for (let d = 0; d < (a1 - a0) / 2 && drop === null; d += 1.5) {
    for (const a of [mid + d, mid - d]) {
      if (a < a0 + 6 || a > a1 - 4 || behind(busy, a - 3, a + 3) || under(mine, a - 2, a + 2, 12, 13)) continue;
      drop = a;
      break;
    }
  }
  const c = tone(C.pipe, 0.12);
  pipe(k, [[lo, PIPE_N, PIPE_Z], [hi, PIPE_N, PIPE_Z]], PIPE_W, c);
  // clamps and flanges
  for (let a = a0 + 3, i = 0; a < a1; a += 6.5, i++) {
    if (a < lo || a > hi) continue;
    if (i % 4 === 2) {
      fillPts(k, ring(k, [a, PIPE_N, PIPE_Z], [1, 0, 0], 0.62, 16), tone(C.steel), k.thin);
      if (k.s >= 4) rivets(k, [[a + 0.05, PIPE_N + 0.3, PIPE_Z + 0.4], [a + 0.05, PIPE_N + 0.3, PIPE_Z - 0.4]], C.steelDark, 0.08);
    } else {
      k.box(a - 0.2, 0, PIPE_Z - 0.55, 0.4, PIPE_N + 0.5, 1.1, tone(C.steelDark), { line: k.thin, stripe: false });
    }
  }
  if (drop === null || drop < lo || drop > hi) return;
  // down to the floor, a valve on the way
  pipe(k, [[drop, PIPE_N, PIPE_Z], [drop, PIPE_N, 0.2]], PIPE_W * 0.8, c);
  k.box(drop - 0.6, 0, 0, 1.2, PIPE_N + 0.7, 0.35, tone(C.steelDark), { line: k.thin, stripe: false });
  const vz = 6.2;
  k.cyl(drop, PIPE_N, vz - 0.6, 0.55, 1.2, tone(C.steel), { line: k.thin });
  k.rod([[drop, PIPE_N, vz], [drop, PIPE_N + 1.1, vz]], C.steelDark, 0.14);
  const wheel = tone(salt === 1 ? C.turquoise : C.rust);
  const n = PIPE_N + 1.15;
  const ringPts: P3[] = [];
  for (let i = 0; i <= 20; i++) ringPts.push([drop + Math.cos((i / 20) * Math.PI * 2) * 0.95, n, vz + Math.sin((i / 20) * Math.PI * 2) * 0.95]);
  k.line(ringPts, INK, Math.max(1.6, 0.22 * k.s + k.lw * 1.4));
  k.line(ringPts, wheel, Math.max(1, 0.22 * k.s));
  k.segs([[[drop - 0.9, n, vz], [drop + 0.9, n, vz]], [[drop, n, vz - 0.9], [drop, n, vz + 0.9]]], wheel, Math.max(0.8, 0.12 * k.s));
  k.face(drop, n + 0.02, vz, 0.22, C.steelDark, k.thin, 10);
}

// The steel ring beam on the adobe, then the dome: rusty ribs with the
// sky between them, and across each bay a sail lashed against the sun,
// hide or striped canvas by turns, glowing where the sun comes through
// it, its lattice brace only a shadow behind; each sags at its foot, so a
// scallop of sky shows under it. A cable swagged along under the beam;
// the rim at the top.
function dome(k: Kit, a0: number, a1: number, zb: number, H: number, ax0: number, ax1: number, salt: number, tone: Tone): void {
  const z0 = zb + BAND;
  const z1 = H - RIM;
  const lo = Math.max(a0, ax0 - RIB);
  const hi = Math.min(a1, ax1 + RIB);
  const ribs: number[] = [a0];
  for (let a = a0 + 7 + hash(salt, 61) * 4; a < a1 - 4; a += RIB) ribs.push(a);
  ribs.push(a1);
  if (z1 > z0 + 0.5 && k.sees(a0, 0, z0, a1, 1, z1, 8)) {
    // the sky behind, deepening up the dome
    k.rect(lo, z0, hi, z1, 0, k.vgrad(lo, 0, z0, z1, [[0, mix(C.sky, '#ffe9bf', 0.35)], [0.5, C.sky], [1, C.skyHigh]]), 0);
    // the sails, each bay by its number along the whole wall (so every
    // tile of the shell finds the same one)
    for (let i = 0; i + 1 < ribs.length; i++) if (ribs[i + 1] > lo && ribs[i] < hi) sail(k, ribs[i], ribs[i + 1], z0, z1, i + salt * 5, tone);
    // under the rim it is dimmer
    k.rect(lo, z0, hi, z1, 0, k.vgrad(lo, 0, z0, z1, [[0, '#2a140a00'], [0.6, '#2a140a0c'], [1, '#2a140a38']]));
    // the ribs, riveted
    const dots: P3[] = [];
    for (const a of ribs) {
      if (a <= a0 || a >= a1 || a < lo || a > hi) continue;
      k.box(a - 0.45, 0, z0, 0.9, 0.55, z1 - z0, tone(RIBC), { line: k.thin, stripe: false });
      if (k.s >= 4) for (let z = z0 + 1; z < z1 - 0.5; z += 2) dots.push([a, 0.56, z]);
    }
    rivets(k, dots, tone(shade(RIBC, -0.3)), 0.1);
  }
  // the ring beam: a steel band bolted round the top of the adobe
  k.box(a0, 0, zb, a1 - a0, 0.8, BAND, tone(C.steel), { line: k.lw, stripe: false });
  k.line([[a0, 0.81, zb + BAND - 0.15], [a1, 0.81, zb + BAND - 0.15]], withAlpha('#eef2f6', 0.4), Math.max(0.6, 0.1 * k.s));
  if (k.s >= 3) {
    const dots: P3[] = [];
    for (let a = Math.max(a0 + 0.8, Math.floor(lo)); a < Math.min(a1, hi); a += 1.6) dots.push([a, 0.81, zb + 0.45], [a, 0.81, zb + BAND - 0.5]);
    rivets(k, dots, tone(C.steelDark), 0.1);
  }
  // the cable, swagged from bracket to bracket under the beam
  const cz = zb - 0.5;
  const cable: P3[] = [];
  const hooks: P3[] = [];
  for (let i = 1; i < ribs.length - 1; i++) {
    const p = ribs[i];
    const q = ribs[i + 1];
    if (q < lo || p > hi) continue;
    if (i === 1 || cable.length === 0) hooks.push([p, 0.5, cz]);
    const span = Math.min(q, a1 - 1) - p;
    for (let j = 0; j <= 8; j++) {
      const f = j / 8;
      cable.push([p + span * f, 0.5, cz - 1.1 * 4 * f * (1 - f)]);
    }
    hooks.push([p + span, 0.5, cz]);
  }
  if (cable.length > 1) {
    k.line(cable, '#2e2620', Math.max(0.9, 0.13 * k.s));
    for (const [u, w, z] of hooks) k.cyl(u, w, z - 0.25, 0.2, 0.5, tone('#e8e0cc'), { line: k.thin });
  }
  // the rim at the top
  k.box(a0, 0, H - RIM, a1 - a0, 0.9, RIM, tone(C.steelDark), { line: k.lw, stripe: false });
}

// The sails' cloths: tanned hide, and pale canvas striped in rust (now
// and then turquoise), each backlit, brighter up where the sun is.
const HIDE: readonly [Color, Color] = ['#c08e55', '#efc892'];
const CANVAS: readonly [Color, Color] = ['#e2cfa8', '#f8ecd2'];

// One sail across the bay b0..b1 of the dome (z0..z1), number j: lashed
// at its four corners to the ribs, its top a little slack, its foot
// sagging to a scallop over the ring beam; folds running from the corners
// down into the sag, the lattice brace behind it a soft shadow through
// it, and the lashings. One bay in five has its sail rolled up and tied
// under the rim, the sky open behind the brace.
function sail(k: Kit, b0: number, b1: number, z0: number, z1: number, j: number, tone: Tone): void {
  const u0 = b0 + 0.75;
  const u1 = b1 - 0.75;
  const w = u1 - u0;
  const h = z1 - z0;
  if (w < 2 || h < 1.5) return;
  const n = 0.3;
  if (j % 5 === 3) {
    if (h >= 3 && w >= 4) {
      const br: Array<[P3, P3]> = [[[b0 + 0.8, 0.25, z0 + 0.5], [b1 - 0.8, 0.25, z1 - 0.5]], [[b1 - 0.8, 0.25, z0 + 0.5], [b0 + 0.8, 0.25, z1 - 0.5]]];
      k.segs(br, INK, Math.max(1.2, 0.2 * k.s + k.lw), 'round');
      k.segs(br, tone('#6e5a48'), Math.max(0.8, 0.2 * k.s), 'round');
    }
    const r = Math.min(0.55, h * 0.13);
    const zr = z1 - r - 0.15;
    tube(k, [u0, n + 0.2, zr], [u1, n + 0.2, zr], r, r, tone(j % 2 ? CANVAS[0] : HIDE[1]), tone(j % 2 ? CANVAS[1] : HIDE[0]), k.thin);
    const rope = tone('#8a6a44');
    for (const f of [0.22, 0.78]) {
      const u = u0 + w * f;
      k.rod([[u, n + 0.2 + r + 0.05, zr - r * 0.2], [u, n + 0.2 + r * 0.6, zr - r * 0.95], [u + 0.1, n + 0.2, zr - r - 0.05]], rope, 0.1);
    }
    return;
  }
  // its corners: the foot lashed well up the ribs, sagging to near the
  // beam in the middle; every other one set lower than the rim, so the
  // sky shows over it too
  const lift = Math.max(1.8, Math.min(4.5, h * 0.3));
  const top = z1 - (j % 2 ? Math.min(0.6, h * 0.12) : 0.12);
  const foot = (f: number) => z0 + lift - (lift - 0.4) * 4 * f * (1 - f);
  const head = (f: number) => top - Math.min(0.35, h * 0.05) * 4 * f * (1 - f);
  const m = 12;
  const edge = (zf: (f: number) => number, f0 = 0, f1 = 1): P3[] => {
    const out: P3[] = [];
    for (let i = 0; i <= m; i++) {
      const f = f0 + ((f1 - f0) * i) / m;
      out.push([u0 + w * f, n, zf(f)]);
    }
    return out;
  };
  const shape = [...edge(foot), ...edge(head).reverse()];
  const hide = j % 2 === 0;
  const [dim, bright] = hide ? HIDE : CANVAS;
  k.poly(shape, k.vgrad(u0, n, z0, z1, [[0, tone(dim)], [1, tone(bright)]]), 0);
  // the strips of a canvas sail: rust, a turquoise one every third
  if (!hide) {
    const stripe = j % 3 === 1 ? C.turquoise : C.cloth;
    const sw = Math.min(0.7, w * 0.08);
    const pen = k.pen;
    pen.beginPath();
    for (const fc of [0.3, 0.7]) {
      const f0 = fc - sw / w / 2;
      const f1 = fc + sw / w / 2;
      k.trace([...edge(foot, f0, f1), ...edge(head, f0, f1).reverse()]);
    }
    pen.fillStyle = withAlpha(tone(stripe), 0.85);
    pen.fill();
  } else if (k.s >= 3) {
    // a hide is pieced: a stitched seam across it
    const zs = z0 + lift + (top - z0 - lift) * 0.45;
    if (zs < head(0.5) - 0.6) k.line([[u0 + 0.2, n, zs + 0.15], [u0 + w * 0.5, n, zs - 0.2], [u1 - 0.2, n, zs + 0.1]], withAlpha('#7a5430', 0.55), Math.max(0.6, 0.07 * k.s));
  }
  // backlit: the sun brightest across the middle, the cloth dimmer toward
  // the ribs it is lashed to
  k.poly(shape, k.hgrad([u0, n, z0], [u1, n, z0], [[0, '#4a2a1030'], [0.22, '#4a2a1000'], [0.78, '#4a2a1000'], [1, '#4a2a1030']]), 0);
  // the brace behind, seen through it as a shadow
  if (h >= 4 && w >= 4) {
    k.segs([[[u0 + 0.1, n - 0.1, z0 + 0.5], [u1 - 0.1, n - 0.1, z1 - 0.5]], [[u1 - 0.1, n - 0.1, z0 + 0.5], [u0 + 0.1, n - 0.1, z1 - 0.5]]], withAlpha('#4a2a10', 0.16), Math.max(1, 0.24 * k.s));
  }
  // folds from the foot's corners down into the sag
  if (h >= 3 && k.s >= 3) {
    const folds: Array<[P3, P3]> = [];
    const zl = foot(0);
    folds.push([[u0 + 0.3, n, zl + 0.2], [u0 + w * 0.32, n, foot(0.32) + Math.min(1.2, h * 0.12)]], [[u1 - 0.3, n, zl + 0.2], [u0 + w * 0.68, n, foot(0.68) + Math.min(1.2, h * 0.12)]]);
    k.segs(folds, withAlpha(INK, 0.22), Math.max(0.6, 0.07 * k.s), 'round');
  }
  // its edge, and the lashings to the ribs at its corners
  k.pen.beginPath();
  k.trace(shape);
  k.paint(null, k.thin);
  const rope = tone('#8a6a44');
  for (const [u, du] of [[u0, -1], [u1, 1]] as const) {
    for (const z of [foot(0), head(0)]) k.rod([[u, n, z], [u + du * 0.75, n - 0.1, z + 0.15]], rope, 0.12);
  }
}

// ── wall pieces ──────────────────────────────────────────────────────────────

// Some windows have a wind turbine far off over the dunes; its blades turn
// in the overlay.
const turbine = (f: Feature) => hash(f.k, 17) < 0.65;
const hub = (f: Feature): P3 => [f.a - 1.2, BACK + 0.02, 20.1];

// A small window in the adobe, slatted, not glazed: the view of the hazy
// dunes set back in the wall's thickness, a plank frame and sill, fixed
// louvres across its lower half, and two louvred shutters swung open into
// the room from its upper half.
function windowArt(k: Kit, f: Feature, lit: boolean): void {
  const a = f.a;
  const u0 = a - OPEN / 2;
  const u1 = a + OPEN / 2;
  const z0 = SILL;
  const z1 = WTOP;
  dunesView(k, u0, u1, z0, z1, BACK, HZ, f.k);
  if (turbine(f)) {
    const [u, n, z] = hub(f);
    const far = withAlpha('#7a6a5c', 0.8);
    k.line([[u, n, HZ - 0.9], [u, n, z]], far, Math.max(0.8, 0.12 * k.s));
    k.segs([[[u - 0.4, n, HZ - 0.9], [u, n, z - 1.2]], [[u + 0.4, n, HZ - 0.9], [u, n, z - 1.2]]], far, Math.max(0.6, 0.07 * k.s));
    k.poly([[u - 0.12, n, z - 0.2], [u + 0.5, n, z - 0.15], [u + 0.5, n, z + 0.15], [u - 0.12, n, z + 0.2]], far, 0);
  }
  // the reveal the viewer sees: the adobe's thickness at the near side and
  // the sill
  const ad = (c: Color) => (lit ? c : shade(c, -0.15));
  k.poly([[u0, 0, z0], [u0, BACK, z0], [u0, BACK, z1], [u0, 0, z1]], ad(C.adobeDark), 0);
  k.poly([[u0, 0, z0], [u1, 0, z0], [u1, BACK, z0], [u0, BACK, z0]], ad(C.adobeLight), 0);
  // the plank frame and the sill
  const fw = 0.6;
  k.box(u0 - fw, 0, z0, fw, 0.35, z1 - z0 + fw, C.plankDark, { line: k.thin, stripe: false });
  k.box(u1, 0, z0, fw, 0.35, z1 - z0 + fw, C.plankDark, { line: k.thin, stripe: false });
  k.box(u0 - fw - 0.3, 0, z1, OPEN + 2 * fw + 0.6, 0.45, fw + 0.1, C.plank, { line: k.thin });
  k.box(u0 - fw - 0.3, 0, z0 - 0.7, OPEN + 2 * fw + 0.6, 1.1, 0.7, C.plankLight, { line: k.lw });
  // the fixed louvres: a frame, slats tilted down toward the room, the
  // daylight between them
  const lz = LOUVRE;
  const slat = lit ? C.plankLight : shade(C.plankLight, -0.1);
  const slats: P3[][] = [];
  for (let z = z0 + 0.35; z < lz - 0.45; z += 0.72) slats.push([[u0 + 0.3, 0.34, z], [u1 - 0.3, 0.34, z], [u1 - 0.3, 0.04, z + 0.46], [u0 + 0.3, 0.04, z + 0.46]]);
  k.pen.beginPath();
  for (const q of slats) k.trace(q);
  k.paint(slat, Math.max(0.7, k.thin * 0.8));
  k.box(u0, 0, z0, 0.3, 0.4, lz - z0, C.plank, { line: k.thin, stripe: false });
  k.box(u1 - 0.3, 0, z0, 0.3, 0.4, lz - z0, C.plank, { line: k.thin, stripe: false });
  k.box(u0, 0, lz - 0.35, OPEN, 0.4, 0.35, C.plank, { line: k.thin, stripe: false });
  k.pen.beginPath();
  k.trace([[u0, 0, z0], [u1, 0, z0], [u1, 0, z1], [u0, 0, z1]]);
  k.paint(null, k.thin);
  // the shutters, swung open into the room
  for (const side of [-1, 1] as const) shutter(k, side < 0 ? u0 - fw : u1 + fw, side, lz - 0.1, z1 + 0.3, f.k + side);
}

// A louvred shutter hinged on the frame at u = hinge, swung open on the
// `side` (-1 toward lower u) into the room, from z0 to z1.
function shutter(k: Kit, hinge: number, side: -1 | 1, z0: number, z1: number, seed: number): void {
  const w = OPEN / 2 - 0.2;
  const th = 1.02;
  const du = side * Math.cos(th);
  const dv = Math.sin(th);
  const P = (f: number, z: number): P3 => [hinge + du * w * f, 0.2 + dv * w * f, z];
  // the face the viewer sees, and its shade
  const nu = -dv * side;
  const nv = du * side;
  const [fu, fv] = nu + nv > 0 ? [nu, nv] : [-nu, -nv];
  const paint = hash(seed, 9) < 0.5 ? mix('#3fa7a0', C.plankLight, 0.3) : C.plank;
  const face = k.side(paint, fu, fv, 0.16);
  k.poly([P(0, z0), P(1, z0), P(1, z1), P(0, z1)], face, k.lw);
  // the stiles, and louvres across between them
  const dark: Array<[P3, P3]> = [];
  const lite: Array<[P3, P3]> = [];
  for (let z = z0 + 0.5; z < z1 - 0.35; z += 0.55) {
    dark.push([P(0.14, z), P(0.86, z)]);
    lite.push([P(0.14, z + 0.14), P(0.86, z + 0.14)]);
  }
  k.segs(lite, withAlpha('#fff4dc', 0.4), Math.max(0.6, 0.07 * k.s));
  k.segs(dark, withAlpha(INK, 0.55), Math.max(0.6, k.thin * 0.6));
  k.segs([[P(0.12, z0), P(0.12, z1)], [P(0.88, z0), P(0.88, z1)]], withAlpha(INK, 0.5), Math.max(0.6, k.thin * 0.7));
  // an iron hinge strap
  for (const z of [z0 + 0.6, z1 - 0.6]) {
    k.line([P(0, z), P(0.35, z)], INK, Math.max(1.2, 0.2 * k.s + k.thin));
    k.line([P(0, z), P(0.35, z)], C.scrapDark, Math.max(0.8, 0.2 * k.s));
  }
}

// A big beast's skull on a plank: a broad brow with deep eye holes, a long
// jaw running down and out toward the room, two great tusks sweeping out
// from it and curling up past its cheeks.
function skull(k: Kit, f: Feature): void {
  const a = f.a;
  const zc = 20;
  // the plank, two boards on a batten, hung on nails
  const board: P3[] = [[a - 2.6, 0.05, zc - 5.6], [a + 2.6, 0.05, zc - 5.6], [a + 2.9, 0.05, zc + 3.6], [a + 1.6, 0.05, zc + 4.6], [a - 1.6, 0.05, zc + 4.6], [a - 2.9, 0.05, zc + 3.6]];
  k.poly(board.map(([u, n, z]): P3 => [u + 0.4, n - 0.02, z - 0.4]), withAlpha('#2a140a', 0.25), 0);
  k.poly(board, k.side(C.wood, 0, 1), k.lw);
  k.segs([[[a, 0.06, zc - 5.6], [a, 0.06, zc + 4.6]]], withAlpha(INK, 0.5), k.thin * 0.8);
  rivets(k, [[a - 1.9, 0.07, zc + 3.4], [a + 1.9, 0.07, zc + 3.4], [a - 1.9, 0.07, zc - 4.9], [a + 1.9, 0.07, zc - 4.9]], C.scrapDark, 0.16);
  // the skull: the brow wide, the jaw long and reaching out
  const n0 = 0.5;
  const bone: P3[] = [
    [a - 1.5, n0, zc + 3.4],
    [a + 1.5, n0, zc + 3.4],
    [a + 2.5, n0, zc + 2.4],
    [a + 2.6, n0, zc + 1.0],
    [a + 1.9, n0 + 0.4, zc - 0.5],
    [a + 1.45, n0 + 1.0, zc - 2.2],
    [a + 1.25, n0 + 1.6, zc - 4.0],
    [a + 0.85, n0 + 2.1, zc - 5.3],
    [a - 0.85, n0 + 2.1, zc - 5.3],
    [a - 1.25, n0 + 1.6, zc - 4.0],
    [a - 1.45, n0 + 1.0, zc - 2.2],
    [a - 1.9, n0 + 0.4, zc - 0.5],
    [a - 2.6, n0, zc + 1.0],
    [a - 2.5, n0, zc + 2.4],
  ];
  k.shadow(a + 0.3, 1.2, 2.2, 1.2, 0.18, zc - 5.6);
  k.poly(bone.map(([u, n, z]): P3 => [u + 0.3, Math.max(0.06, n - 0.4), z - 0.35]), withAlpha('#2a140a', 0.22), 0, 0.6);
  const lo = k.p(a, n0 + 2.1, zc - 5.3);
  const hi = k.p(a - 1.2, n0, zc + 3.0);
  const g = k.pen.createLinearGradient(hi[0], hi[1], lo[0], lo[1]);
  g.addColorStop(0, '#fffbf0');
  g.addColorStop(0.35, C.bone);
  g.addColorStop(1, C.boneDark);
  k.poly(bone, g, k.lw, 0.7);
  // the brow ridge over the eyes and the bridge down the jaw
  k.poly([[a - 2.3, n0 + 0.02, zc + 1.6], [a - 0.4, n0 + 0.02, zc + 1.3], [a, n0 + 0.02, zc + 1.0], [a + 0.4, n0 + 0.02, zc + 1.3], [a + 2.3, n0 + 0.02, zc + 1.6], [a + 2.4, n0 + 0.02, zc + 2.2], [a, n0 + 0.02, zc + 1.9], [a - 2.4, n0 + 0.02, zc + 2.2]], withAlpha('#fffaf0', 0.8), 0, 0.2);
  k.line([[a, n0 + 0.3, zc + 0.2], [a, n0 + 1.2, zc - 2.4], [a, n0 + 1.9, zc - 4.4]], withAlpha('#b8a684', 0.9), Math.max(0.8, 0.16 * k.s));
  // the eye holes, deep and slanted
  for (const side of [-1, 1]) {
    k.poly([[a + side * 0.55, n0 + 0.05, zc + 0.55], [a + side * 1.85, n0 + 0.05, zc + 1.2], [a + side * 2.0, n0 + 0.05, zc + 0.35], [a + side * 1.2, n0 + 0.1, zc - 0.25]], '#3a1e0e', k.thin, 0.3);
  }
  // the nostrils at the jaw's end, and its blunt teeth
  for (const side of [-1, 1]) k.poly([[a + side * 0.2, n0 + 1.85, zc - 4.2], [a + side * 0.6, n0 + 1.85, zc - 3.9], [a + side * 0.55, n0 + 1.95, zc - 4.7], [a + side * 0.25, n0 + 1.95, zc - 4.75]], '#4a2a14', 0, 0.1);
  const teeth: P3[][] = [];
  for (let i = 0; i < 4; i++) {
    const u = a - 0.75 + i * 0.4;
    teeth.push([[u, n0 + 2.12, zc - 5.25], [u + 0.34, n0 + 2.12, zc - 5.25], [u + 0.3, n0 + 2.12, zc - 5.85], [u + 0.04, n0 + 2.12, zc - 5.85]]);
  }
  k.pen.beginPath();
  for (const q of teeth) k.trace(q);
  k.paint(C.bone, k.thin * 0.8);
  // cracks
  if (k.s >= 5) k.line([[a + 1.4, n0 + 0.02, zc + 3.2], [a + 1.0, n0 + 0.02, zc + 2.6], [a + 1.35, n0 + 0.02, zc + 2.2]], withAlpha(INK, 0.6), k.thin * 0.7);
  // the tusks, out of their sockets in the jaw
  for (const side of [-1, 1]) tusk(k, a, zc, side);
}

// One tusk: out from the side of the jaw, sweeping down and out, then
// curling up to a point beside the brow. Its width is laid off in screen
// space, so it tapers evenly however the frame turns.
function tusk(k: Kit, a: number, zc: number, side: number): void {
  const P0: P3 = [a + side * 1.0, 1.9, zc - 3.5];
  const P1: P3 = [a + side * 3.1, 1.7, zc - 5.4];
  const P2: P3 = [a + side * 4.6, 1.2, zc - 2.4];
  const P3_: P3 = [a + side * 3.5, 0.9, zc + 2.3];
  const m = 16;
  const ctr: Array<[number, number]> = [];
  for (let i = 0; i <= m; i++) {
    const t = i / m;
    const b = [(1 - t) ** 3, 3 * (1 - t) ** 2 * t, 3 * (1 - t) * t * t, t ** 3];
    const q: P3 = [0, 1, 2].map((j) => b[0] * P0[j] + b[1] * P1[j] + b[2] * P2[j] + b[3] * P3_[j]) as unknown as P3;
    ctr.push(k.p(...q));
  }
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  for (let i = 0; i <= m; i++) {
    const p = ctr[Math.max(0, i - 1)];
    const q = ctr[Math.min(m, i + 1)];
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const l = Math.hypot(dx, dy) || 1;
    const w = (0.62 * (1 - i / m) ** 0.75 + 0.04) * k.s;
    left.push([ctr[i][0] - (dy / l) * w, ctr[i][1] + (dx / l) * w]);
    right.push([ctr[i][0] + (dy / l) * w, ctr[i][1] - (dx / l) * w]);
  }
  const pen = k.pen;
  pen.beginPath();
  [...left, ...right.reverse()].forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  const g = pen.createLinearGradient(ctr[0][0], ctr[0][1], ctr[m][0], ctr[m][1]);
  g.addColorStop(0, C.boneDark);
  g.addColorStop(0.5, C.bone);
  g.addColorStop(1, '#fffbf0');
  k.paint(g, k.lw);
  // growth rings near the root
  pen.beginPath();
  for (const i of [2, 4]) {
    pen.moveTo(left[i][0], left[i][1]);
    pen.lineTo(right[m - i][0], right[m - i][1]);
  }
  pen.strokeStyle = withAlpha('#a8946c', 0.8);
  pen.lineWidth = Math.max(0.6, 0.08 * k.s);
  pen.stroke();
}

// Plank shelves on pipe brackets, two tiers: jars of this and that, a gear
// or two, a tin; up top a clay pot, a coil of rope, bottles.
function shelf(k: Kit, f: Feature): void {
  const a = f.a;
  const w = f.w - 1;
  const us = [a - w / 2 + 0.9, a + w / 2 - 0.9];
  const tiers = [14.6, 18.9];
  // the uprights, flanged to the wall top and bottom
  for (const u of us) {
    for (const z of [tiers[0] - 1.2, tiers[1] + 0.9]) k.box(u - 0.4, 0, z - 0.25, 0.8, 0.2, 0.5, C.steelDark, { line: k.thin, stripe: false });
    pipe(k, [[u, 0.45, tiers[0] - 1.2], [u, 0.45, tiers[1] + 0.9]], 0.3);
  }
  for (const z of tiers) {
    k.shadow(a, 0.6, w * 0.5, 0.9, 0.14, z - 0.4);
    for (const u of us) pipe(k, [[u, 0.45, z - 0.25], [u, 1.45, z - 0.25]], 0.26);
    k.box(a - w / 2, 0, z, w, 1.8, 0.45, C.plankLight, { line: k.lw });
  }
  const s = f.k;
  // the lower tier
  let zt = tiers[0] + 0.45;
  jar(k, a - w / 2 + 1.2, 0.9, zt, 0.5, 1.5, ['#c98a3a', '#7aa86a', '#b8584a'][s % 3]);
  jar(k, a - w / 2 + 2.4, 0.95, zt, 0.42, 1.15, ['#e0c27a', '#c98a3a', '#7aa86a'][s % 3]);
  gear(k, a + 0.2, 0.55, zt + 1.0, 0.95, 9, C.scrap);
  gear(k, a + 1.55, 0.75, zt + 0.6, 0.55, 7, C.brassDark);
  k.cyl(a + w / 2 - 1.2, 0.95, zt, 0.5, 0.95, shade(C.scrap, 0.1), { line: k.thin });
  k.disc(a + w / 2 - 1.2, 0.95, zt + 0.95, 0.4, '#5a5048', 0);
  // the upper tier
  zt = tiers[1] + 0.45;
  if (s % 2) {
    claypot(k, a - w / 2 + 1.3, 0.85, zt, 0.7, 2.0, C.clay, C.cream);
    ropeCoil(k, a + 0.6, 0.9, zt, 0.9);
  } else {
    ropeCoil(k, a - w / 2 + 1.5, 0.9, zt, 0.9);
    claypot(k, a + 0.4, 0.85, zt, 0.62, 1.7, '#b8784a', C.turquoise);
  }
  bottle(k, a + w / 2 - 2.0, 0.9, zt, 1.9, '#4f8a5a', 0.3);
  bottle(k, a + w / 2 - 1.2, 0.95, zt, 1.6, '#c07a2a', 0.28);
}

// The bounty board: planks under a little hood, papers pinned all over it,
// blank but for scrawled rows and the odd sketch of a face (no writing).
function board(k: Kit, f: Feature): void {
  const a = f.a;
  const w = f.w - 1;
  const z0 = 13.8;
  const z1 = 21.4;
  k.poly([[a - w / 2 + 0.4, 0.02, z0 - 0.4], [a + w / 2 + 0.4, 0.02, z0 - 0.4], [a + w / 2 + 0.4, 0.02, z1 - 0.4], [a - w / 2 + 0.4, 0.02, z1 - 0.4]], withAlpha('#2a140a', 0.22), 0);
  k.box(a - w / 2, 0, z0, w, 0.35, z1 - z0, C.plank, { line: k.lw, stripe: false });
  k.segs([[[a - w / 6, 0.36, z0 + 0.1], [a - w / 6, 0.36, z1 - 0.1]], [[a + w / 6, 0.36, z0 + 0.1], [a + w / 6, 0.36, z1 - 0.1]]], withAlpha(INK, 0.45), k.thin * 0.8);
  k.box(a - w / 2 - 0.5, 0, z1, w + 1, 1.0, 0.5, C.plankDark, { line: k.lw });
  const papers = ['#f3e8cf', '#ece0c2', '#f7f0de', '#e6d6b0'] as const;
  const pins = [C.cloth, C.turquoise, C.brass] as const;
  const marks: Array<[P3, P3]> = [];
  const faces: Array<{ u: number; z: number; r: number }> = [];
  const heads: P3[] = [];
  const n = 0.38;
  let i = 0;
  for (const [cu, cz] of [[-2.1, 18.9], [0.1, 19.3], [2.2, 18.7], [-1.2, 15.8], [1.2, 15.9], [2.6, 15.5]] as const) {
    i++;
    if (hash(f.k, i, 71) < 0.18) continue;
    const pw = 1.5 + hash(f.k, i, 72) * 0.5;
    const ph = 1.9 + hash(f.k, i, 73) * 0.6;
    const t = (hash(f.k, i, 74) - 0.5) * 0.25;
    const u = a + cu;
    const P = (x: number, z: number): P3 => [u + x * Math.cos(t) - z * Math.sin(t), n, cz + x * Math.sin(t) + z * Math.cos(t)];
    k.poly([P(-pw / 2, -ph / 2), P(pw / 2, -ph / 2), P(pw / 2, ph / 2), P(-pw / 2, ph / 2)], papers[Math.floor(hash(f.k, i, 75) * papers.length)], k.thin);
    heads.push(P(0, ph / 2 - 0.25));
    if (k.s < 4) continue;
    if (hash(f.k, i, 76) < 0.35) {
      // a sketch of a face: a head and shoulders, then rows under it
      faces.push({ u, z: cz + 0.25, r: 0.32 });
      marks.push([P(-0.5, -0.4), P(0.5, -0.4)], [P(-0.45, -0.7), P(0.3, -0.7)]);
    } else {
      for (let j = 0; j < 4; j++) marks.push([P(-pw / 2 + 0.3, ph / 2 - 0.6 - j * 0.38), P(-pw / 2 + 0.3 + (pw - 0.6) * (0.5 + hash(f.k, i * 9 + j, 77) * 0.5), ph / 2 - 0.6 - j * 0.38)]);
    }
  }
  k.segs(marks, withAlpha('#6a5a4a', 0.7), Math.max(0.6, 0.07 * k.s));
  for (const { u, z, r } of faces) {
    k.face(u, n + 0.01, z, r, withAlpha('#8a7a66', 0.55), 0, 12);
    k.poly([[u - 0.55, n + 0.01, z - 0.75], [u + 0.55, n + 0.01, z - 0.75], [u + 0.35, n + 0.01, z - 0.35], [u - 0.35, n + 0.01, z - 0.35]], withAlpha('#8a7a66', 0.45), 0, 0.15);
  }
  heads.forEach((p, j) => rivets(k, [[p[0], n + 0.02, p[2]]], pins[(j + f.k) % pins.length], 0.16));
}

// A rack of tools on two rails: a shovel, a pick, a long staff with a
// blade, a saw on a peg, and somebody's straw hat.
function rack(k: Kit, f: Feature): void {
  const a = f.a;
  const n = 0.6;
  const iron = shade(C.scrap, -0.05);
  for (const z of [14.6, 20.4]) k.box(a - 4.2, 0, z, 8.4, 0.45, 0.7, C.plankDark, { line: k.thin });
  // the shovel
  k.rod([[a - 3.2, n, 13.6], [a - 3.2, n, 21.4]], C.woodLight, 0.24);
  k.rod([[a - 3.55, n, 21.4], [a - 2.85, n, 21.4]], C.woodLight, 0.18);
  k.poly([[a - 3.85, n, 13.7], [a - 2.55, n, 13.7], [a - 2.6, n, 12.4], [a - 3.2, n, 11.8], [a - 3.8, n, 12.4]], k.side(iron, 0, 1), k.thin, 0.15);
  // the pick
  k.rod([[a - 1.4, n, 13.2], [a - 1.4, n, 20.9]], C.wood, 0.22);
  const head: P3[] = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    head.push([a - 2.7 + t * 2.6, n + 0.05, 20.7 + Math.sin(t * Math.PI) * 0.55]);
  }
  k.line(head, INK, Math.max(1.6, 0.34 * k.s + k.lw));
  k.line(head, iron, Math.max(1, 0.34 * k.s));
  // the staff, its blade up top
  k.rod([[a + 0.6, n, 12.6], [a + 0.6, n, 23.2]], C.woodDark, 0.2);
  k.poly([[a + 0.6, n + 0.05, 25.0], [a + 0.95, n + 0.05, 23.9], [a + 0.75, n + 0.05, 23.1], [a + 0.45, n + 0.05, 23.1], [a + 0.25, n + 0.05, 23.9]], k.side(shade(C.scrap, 0.15), 0, 1), k.thin);
  k.rod([[a + 0.3, n + 0.05, 23.1], [a + 0.9, n + 0.05, 23.1]], C.cloth, 0.12);
  // the saw on a peg
  k.poly([[a + 1.75, n, 15.3], [a + 2.65, n, 15.3], [a + 2.5, n, 19.6], [a + 1.9, n, 19.6]], k.side(shade(C.scrap, 0.18), 0, 1), k.thin);
  k.poly([[a + 1.65, n, 19.5], [a + 2.75, n, 19.5], [a + 2.75, n, 20.9], [a + 1.65, n, 20.9]], C.wood, k.thin, 0.15);
  if (k.s >= 4) {
    const teeth: Array<[P3, P3]> = [];
    for (let z = 15.5; z < 19.4; z += 0.4) teeth.push([[a + 1.75 - (z - 15.3) * 0.035, n + 0.01, z], [a + 1.9 - (z - 15.3) * 0.035, n + 0.01, z + 0.2]]);
    k.segs(teeth, withAlpha(INK, 0.6), Math.max(0.6, 0.06 * k.s));
  }
  // the straw hat
  const hu = a + 3.4;
  k.face(hu, n, 18.9, 1.15, k.side('#d8bc7a', 0, 1, 0.12), k.thin, 20);
  k.face(hu, n + 0.05, 19.0, 0.62, k.side('#e6cc8c', 0, 1, 0.12), k.thin, 16);
  k.line([[hu - 0.6, n + 0.07, 18.75], [hu + 0.6, n + 0.07, 18.75]], C.cloth, Math.max(0.8, 0.16 * k.s));
  rivets(k, [[a - 3.2, n + 0.3, 21.0], [a + 2.2, n + 0.3, 20.75], [hu, n + 0.3, 20.75]], C.woodDark, 0.12);
}

// The one warm light: a tin lantern on a hook; its glow on the wall.
function lanternArt(k: Kit, f: Feature): void {
  const z = 18;
  k.wash(f.a, 0.05, z - 2, 6, 7, C.lamp, 0.26);
  k.poly([[f.a - 0.35, 0.02, z + 0.4], [f.a + 0.35, 0.02, z + 0.4], [f.a + 0.35, 0.02, z + 1.9], [f.a - 0.35, 0.02, z + 1.9]], C.scrapDark, k.thin);
  k.rod([[f.a, 0.05, z + 1.4], [f.a, 1.2, z + 1.4], [f.a, 1.35, z + 0.9]], C.scrapDark, 0.14);
  lantern(k, f.a, 1.35, z + 0.9, true, 0.45, 1.45);
}

// A cold tube lamp on two arms, its cable run up to the ring beam.
function tubeArt(k: Kit, f: Feature, zb: number): void {
  const a = f.a;
  const top = TUBE_Z + TUBE_H;
  k.wash(a, 0.05, TUBE_Z + TUBE_H / 2, 3, 4.5, C.tubeGlow, 0.32);
  k.line([[a + 0.25, 0.25, top + 0.3], [a + 0.25, 0.25, zb - 0.2]], '#2e2620', Math.max(0.8, 0.1 * k.s));
  k.box(a - 0.35, 0, TUBE_Z - 0.4, 0.7, 0.2, TUBE_H + 0.8, C.steelDark, { line: k.thin, stripe: false });
  for (const z of [TUBE_Z - 0.15, top + 0.15]) k.rod([[a, 0.15, z], [a, 0.8, z]], C.steelDark, 0.14);
  tubeLamp(k, a, 0.8, TUBE_Z, TUBE_H, 0.25);
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  const zb = bandZ(H);
  // the floor's cut edges: the deck's planks on an adobe footing
  if (k.sees(T, D - 1, -SLAB, W, D, 0) || k.sees(W - 1, T, -SLAB, W, D, 0)) {
    k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side(C.adobeDark, 0, 1), k.lw);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side(C.adobeDark, 1, 0), k.lw);
    k.poly([[T, D, 0], [W, D, 0], [W, D, -0.8], [T, D, -0.8]], k.side(C.plankLight, 0, 1), k.thin);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -0.8], [W, T, -0.8]], k.side(C.plankLight, 1, 0), k.thin);
    const joints: Array<[P3, P3]> = [];
    for (let y = T + BOARD_W; y < D - 0.5; y += BOARD_W) joints.push([[W, y, 0], [W, y, -0.8]]);
    k.segs(joints, withAlpha('#7a5a38', 0.55), Math.max(0.6, 0.08 * k.s));
  }
  // the walls' cut ends: adobe in its pours, the ring beam, the dome's steel
  for (const [p, q] of [[[0, D], [T, D]], [[W, 0], [W, T]]] as const) {
    const at = (f: number, z: number): P3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z];
    const nu = p[0] === q[0] ? 1 : 0;
    const nv = 1 - nu;
    k.poly([at(0, -SLAB), at(1, -SLAB), at(1, zb), at(0, zb)], k.side(C.adobe, nu, nv), k.lw);
    k.poly([at(0, zb), at(1, zb), at(1, H), at(0, H)], k.side(C.adobe, nu, nv), k.lw);
    k.poly([at(0.82, zb), at(1, zb), at(1, H), at(0.82, H)], k.side(DOME[0], nu, nv), 0);
    k.poly([at(0.82, zb), at(1, zb), at(1, zb + BAND), at(0.82, zb + BAND)], k.side(C.steel, nu, nv), 0);
    const lines: Array<[P3, P3]> = [];
    for (let z = POUR; z < zb - 0.5; z += POUR) lines.push([at(0, z), at(1, z)]);
    k.segs(lines, withAlpha('#4a2e18', 0.25), Math.max(0.6, 0.1 * k.s));
    k.segs([[at(0.82, zb), at(1, zb)], [at(0.82, zb + BAND), at(1, zb + BAND)], [at(0.82, zb), at(0.82, H)]], withAlpha('#4a2e18', 0.5), Math.max(0.6, 0.1 * k.s));
  }
  const capC = mix(C.adobeDark, C.adobe, 0.3);
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], capC, k.lw);
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(capC, 0.35), Math.max(1, 0.2 * k.s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.6), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.45), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

// In each window, sand on the wind: thin pale streaks blowing sideways
// across the open top of the view, a faint shimmer over the dunes, the far
// turbine's blades turning; and dust motes drifting in the sunbeam just
// inside. The overlay paints over the finished frame, so every mark keeps
// above anyone's head: a point (u, v, z) lies over the wall at u - v,
// z - v (in either wall's frame), and that stays above z = 17 and clear of
// the frame and the near shutter.
function gusts(k: Kit, v: RoomView, f: Feature): void {
  const n = BACK + 0.05;
  const lo = 17.3;
  const hi = WTOP - 1.1;
  const u0 = f.a - OPEN / 2 + 0.1;
  const u1 = f.a + OPEN / 2 - 1.9;
  if (!k.sees(u0, n, lo, u1 + 2, 2, WTOP)) return;
  const span = u1 - u0;
  const groups: Array<Array<[P3, P3]>> = [[], [], []];
  for (let i = 0; i < 8; i++) {
    const speed = 10 + hash(f.k, i, 91) * 4;
    const len = 1 + hash(f.k, i, 92) * 2;
    const z = lo + 0.2 + hash(f.k, i, 93) * (hi - lo - 0.4);
    const wrap = span + len;
    const head = u0 + ((v.t * speed + hash(f.k, i, 94) * wrap) % wrap);
    const a0 = Math.max(u0, head - len);
    const a1 = Math.min(u1, head);
    if (a1 - a0 < 0.15) continue;
    groups[i % 3].push([[a0, n, z + (head - a0) * 0.04], [a1, n, z + (head - a1) * 0.04]]);
  }
  const alphas = [0.6, 0.45, 0.35];
  groups.forEach((g, i) => k.segs(g, withAlpha('#fff1d2', alphas[i]), Math.max(0.8, (0.14 - i * 0.02) * k.s), 'round'));
  // the shimmer over the dune line
  const pts: P3[] = [];
  for (let u = u0; u <= u1 + 0.01; u += 0.5) pts.push([Math.min(u, u1), n, lo + 0.3 + Math.sin(u * 2.2 + v.t * 3.1) * 0.15]);
  k.line(pts, withAlpha('#fff8e6', 0.08), Math.max(1, 0.5 * k.s));
  // the turbine's blades
  if (turbine(f)) {
    const [hu, hn, hz] = hub(f);
    const spin = v.t * 1.7 + f.k;
    const blades: Array<[P3, P3]> = [];
    for (let i = 0; i < 3; i++) {
      const a = spin + (i * Math.PI * 2) / 3;
      blades.push([[hu, hn, hz], [hu + Math.cos(a) * 0.95, hn, hz + Math.sin(a) * 0.95]]);
    }
    k.segs(blades, withAlpha('#6e6052', 0.85), Math.max(0.8, 0.13 * k.s), 'round');
  }
  // motes in the beam, drifting and glinting
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 6; i++) {
    const w = 0.3 + hash(f.k, i, 95) * 1.5;
    const zlo = 17.1 + w;
    const zhi = WTOP - w / SUN_V - 0.2;
    if (zhi <= zlo) continue;
    const ph = (v.t * (0.05 + hash(f.k, i, 96) * 0.05) + hash(f.k, i, 97)) % 1;
    const z = zlo + (zhi - zlo) * (0.5 + 0.5 * Math.sin(v.t * 0.4 + i * 1.3));
    const u = f.a - OPEN / 2 + 0.6 + ph * (OPEN - 1.2) + SUN_U * (WTOP - z);
    const [x, y] = k.p(u, w, z);
    const r = Math.max(0.7, 0.09 * k.s);
    pen.moveTo(x + r, y);
    pen.arc(x, y, r, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha('#fffaf0', 0.55);
  pen.fill();
}

// A tube lamp's faint hum of light, and now and then a flicker.
function flicker(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  if (!k.sees(a - 3, 0, TUBE_Z - 1, a + 3, 1.5, TUBE_Z + TUBE_H + 1)) return;
  const off = hash(Math.floor(v.t * 9), f.k, 98) < 0.05;
  if (off) {
    k.line([[a, 0.8, TUBE_Z + 0.3], [a, 0.8, TUBE_Z + TUBE_H - 0.3]], withAlpha('#9a9a90', 0.8), Math.max(0.8, 0.3 * k.s));
    return;
  }
  k.halo(a, 0.8, TUBE_Z + TUBE_H / 2, 2.4, C.tubeGlow, 0.07 + 0.05 * Math.sin(v.t * 2.3 + f.k));
}
