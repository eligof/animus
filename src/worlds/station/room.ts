import type { At } from '../../art/iso.ts';
import { frame, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import type { Quad } from './bits.ts';
import { crown, fillPts, leaf, on, rivets, sprouts, wallRing } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, softDot, withAlpha } from './kit.ts';

// The station's shell: a deck of blue-grey plates with grating and light
// strips along the walls, pale rounded wall panels between navy ribs, an
// orange livery stripe round the room, conduits and warm light bars along
// the tops of the walls. On the walls, between the stations: one big
// viewport onto the stars with a planet turning past (the planet is the
// overlay, a small piece redrawn as it turns), round portholes with warm
// lamps between them, wall screens, hydroponic planters, mission patches
// and vents. On the floor: a painted emblem at the hub, a cosy rug by the
// sleep pods, hazard rings round the reactor, the holo-table's glow and
// pools of light. Every wall piece sits in the free stretches of wall
// between the stations, worked out from the same plan the stage uses.

type Wall = 'left' | 'right';
type Kind = 'viewport' | 'porthole' | 'screen' | 'planter' | 'patch' | 'vent' | 'lamp';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[]; ribs: Record<Wall, number[]> };

const SLAB = 2.5; // the deck's thickness, shown along the front cut
const KICK = 1.4; // the kick plate along the foot of the walls
const RAIL = 8.6; // the livery stripe's foot
const LIVERY = 1.2;
const GRATE = 3.2; // the grating strip along the foot of each wall
const PLATE = 8; // deck plate side
const RIB = 18; // ribs every so far along the walls
const TRIM = 1.6; // the trim between the panels and the upper hull

const topZ = (H: number) => H - 7; // where the conduit band starts
const midZ = (H: number) => Math.min(32, topZ(H) - 6); // the trim over the panels
const portZ = (H: number) => (RAIL + LIVERY + midZ(H)) / 2; // portholes' centre height

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// what hangs on the walls between them, and where the ribs stand.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'station');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const fs = features(L);
  const plan: Plan = { L, features: fs, ribs: { right: ribs(L, fs, 'right'), left: ribs(L, fs, 'left') } };
  PLANS.set(key, plan);
  return plan;
}

const between = (L: Layout, wall: Wall, a0: number, a1: number) => {
  const on = L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? s.x0 : s.y0));
  return on.some((p) => p < a0) && on.some((p) => p >= a1);
};

// The viewport's width for a wall H tall.
export const viewW = (H: number) => Math.round(Math.max(18, Math.min(34, H * 0.48)));

// The viewport in the longest stretch between two stations (else the
// longest stretch); then portholes with screens, planters, patches and
// vents between them in what is left, lamps between neighbouring portholes.
function features(L: Layout): Feature[] {
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
  const longest = (p: { a0: number; a1: number }, q: { a0: number; a1: number }) => q.a1 - q.a0 - (p.a1 - p.a0);
  // as wide as the wall is tall allows, narrower where no stretch is that
  // long (small rooms), down to 12
  let VIEW = viewW(L.H);
  let fits = spans.filter((s) => s.a1 - s.a0 >= VIEW + 2);
  if (!fits.length) {
    const most = Math.max(0, ...spans.map((s) => s.a1 - s.a0));
    VIEW = Math.floor(most - 2);
    fits = VIEW >= 12 ? spans.filter((s) => s.a1 - s.a0 >= VIEW + 2) : [];
  }
  const pick = fits.filter((s) => between(L, s.wall, s.a0, s.a1)).sort(longest)[0] ?? fits.sort(longest)[0];
  if (pick) {
    const mid = (pick.a0 + pick.a1) / 2;
    out.push({ wall: pick.wall, kind: 'viewport', a: mid, w: VIEW, k: 0 });
    spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: mid - VIEW / 2 - 2.5 }, { wall: pick.wall, a0: mid + VIEW / 2 + 2.5, a1: pick.a1 });
  }
  const WIDTH: Record<Kind, number> = { viewport: VIEW, porthole: 10, screen: 11, planter: 10, patch: 6, vent: 7, lamp: 2 };
  const ORDER: Kind[] = ['porthole', 'screen', 'porthole', 'planter', 'porthole', 'patch', 'porthole', 'vent', 'porthole', 'screen', 'porthole', 'planter'];
  const cap: Partial<Record<Kind, number>> = { screen: 3, planter: 3, patch: 2, vent: 3 };
  const count: Partial<Record<Kind, number>> = {};
  const ports = { left: 0, right: 0 };
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? 5 : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      if (!ports[s.wall] && room('porthole')) k = 'porthole';
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < (cap[c] ?? Infinity) && room(c)) k = c;
      }
      k ??= room('patch') ? 'patch' : undefined;
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? 5 : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      if (k === 'porthole') ports[s.wall]++;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    kinds.forEach((k, i) => {
      out.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    // Lamps between neighbouring portholes with room for them.
    for (let i = 0; i + 1 < kinds.length; i++) {
      if (gap < 3.5 || kinds[i] !== 'porthole' || kinds[i + 1] !== 'porthole') continue;
      const left = out[out.length - kinds.length + i];
      out.push({ wall: s.wall, kind: 'lamp', a: left.a + left.w / 2 + gap / 2, w: 2, k: n + i });
    }
  }
  return out;
}

// Ribs along a wall every RIB units, clear of its wall pieces.
function ribs(L: Layout, fs: Feature[], wall: Wall): number[] {
  const end = wall === 'right' ? L.W : L.D;
  const out: number[] = [];
  for (let a = L.T + RIB / 2; a < end - 3; a += RIB) {
    if (fs.some((f) => f.wall === wall && Math.abs(f.a - a) < f.w / 2 + 1.6)) continue;
    out.push(a);
  }
  return out;
}

// Where the viewport's glass is (wall frame: a along, z up) and where the
// planet turns in it.
export function viewport(f: Feature, H: number): { a0: number; a1: number; z0: number; z1: number; pa: number; pz: number; pr: number } {
  const z0 = 12;
  const z1 = Math.min(H - 9, z0 + 30);
  const a0 = f.a - f.w / 2 + 1.7;
  const a1 = f.a + f.w / 2 - 1.7;
  const gz0 = z0 + 1.7;
  const gz1 = z1 - 1.7;
  const pr = Math.min(a1 - a0, gz1 - gz0) * 0.33;
  return { a0, a1, z0: gz0, z1: gz1, pa: f.a + (a1 - a0) * 0.12, pz: gz0 + (gz1 - gz0) * 0.52, pr };
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but warm by the reactor rather than round the sleep
// pods, a look out of the viewport and a couple of the portholes.
export function stationPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L).filter((p) => p.kind !== 'warm');
  const core = L.slots.find((s) => s.kind === 'run');
  if (core) {
    const r = slotRect(core);
    const face = { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
    const at = (along: number, outward: number) => (core.wall === 'right' ? { x: core.spot.x + along, y: core.spot.y + outward } : { x: core.spot.x + outward, y: core.spot.y + along });
    out.push({ ...at(-9, -4), kind: 'warm', face }, { ...at(9, -4), kind: 'warm', face });
  }
  const view = fs.find((f) => f.kind === 'viewport');
  if (view) {
    const face = pt(view.wall, view.a, 0);
    out.push({ ...pt(view.wall, view.a - 6, 8), kind: 'view', face }, { ...pt(view.wall, view.a + 6, 8), kind: 'view', face }, { ...pt(view.wall, view.a, 11), kind: 'view', face });
  }
  for (const f of fs.filter((g) => g.kind === 'porthole').slice(0, 2)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
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
    for (const wall of ['right', 'left'] as const) {
      const wk = new Kit(v.pen, wallAt(v.at, wall, v.T), v.s);
      const end = wall === 'right' ? v.W : v.D;
      if (wk.vis(v.T, -v.T, -SLAB, end, 1, v.H)) wallFace(wk, v, plan, wall);
    }
    shell(k, v);
    v.pen.restore();
  },
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const f = plan.features.find((g) => g.kind === 'viewport');
    if (!f) return;
    const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
    v.pen.save();
    planet(k, v, f);
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const PLATES = ['#4b5772', '#505c79', '#46526c', '#4d5a76', '#535f7c', '#4a5873'];

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  const x0 = T + GRATE;
  const y0 = T + GRATE;
  // Deck plates, one path a tone; a hatch here and there.
  const tones: Array<Array<[number, number, number, number]>> = PLATES.map(() => []);
  const hatches: Array<[number, number, number, number]> = [];
  for (let y = y0; y < D; y += PLATE) {
    for (let x = x0; x < W; x += PLATE) {
      const x1 = Math.min(W, x + PLATE);
      const y1 = Math.min(D, y + PLATE);
      if (!k.vis(x, y, 0, x1, y1, 0)) continue;
      const i = Math.floor(hash(x, y, 3) * PLATES.length);
      tones[i].push([x, y, x1, y1]);
      if (x1 - x === PLATE && y1 - y === PLATE && hash(x, y, 4) < 0.04) hatches.push([x, y, x1, y1]);
    }
  }
  tones.forEach((list, ti) => {
    if (!list.length) return;
    pen.beginPath();
    for (const [a, b, c, d] of list) k.trace([[a, b, 0], [c, b, 0], [c, d, 0], [a, d, 0]]);
    pen.fillStyle = PLATES[ti];
    pen.fill();
  });
  // Seams between the plates, a lit bevel along each plate's back edges.
  pen.beginPath();
  for (let y = y0; y <= D; y += PLATE) {
    const [a, b] = [k.p(x0, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (let x = x0; x <= W; x += PLATE) {
    const [a, b] = [k.p(x, y0, 0), k.p(x, D, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#262e44';
  pen.lineWidth = Math.max(0.9, 0.16 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  pen.beginPath();
  for (let y = y0 + 0.3; y < D; y += PLATE) {
    const [a, b] = [k.p(x0, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (let x = x0 + 0.3; x < W; x += PLATE) {
    const [a, b] = [k.p(x, y0, 0), k.p(x, D, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#8fa0c033';
  pen.lineWidth = Math.max(0.7, 0.12 * s);
  pen.stroke();
  // Hatches: an inset lid with a recessed grip.
  for (const [a, b, c, d] of hatches) {
    k.poly([[a + 1.2, b + 1.2, 0], [c - 1.2, b + 1.2, 0], [c - 1.2, d - 1.2, 0], [a + 1.2, d - 1.2, 0]], '#56637f', Math.max(0.8, 0.12 * s), 0.6);
    k.poly([[a + 3, b + 3.4, 0], [c - 3, b + 3.4, 0], [c - 3, b + 4.4, 0], [a + 3, b + 4.4, 0]], '#2c3550', 0, 0.4);
  }
  // Little round lights set in the deck every few plates.
  const lights: P3[] = [];
  for (let y = y0 + PLATE * 2; y < D - 2; y += PLATE * 4) for (let x = x0 + PLATE * 2; x < W - 2; x += PLATE * 4) {
    if (k.vis(x, y, 0, x, y, 0, 8)) lights.push([x, y, 0]);
  }
  if (lights.length) {
    for (const [x, y] of lights) k.pool(x, y, 2.2, 2.2, '#5ce8ff', 0.3);
    pen.beginPath();
    for (const [x, y] of lights) {
      const e = k.ell(x, y, 0, 0.45);
      pen.moveTo(e.cx + e.rx, e.cy);
      pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
    }
    k.paint('#d8fbff', Math.max(0.8, 0.12 * s), '#2a6f8a');
  }
  if (k.fine) {
    // rivets where the plates meet
    const pts: P3[] = [];
    for (let y = y0; y < D; y += PLATE) for (let x = x0; x < W; x += PLATE) {
      for (const [du, dv] of [[0.7, 0.7], [PLATE - 0.7, 0.7], [0.7, PLATE - 0.7], [PLATE - 0.7, PLATE - 0.7]]) {
        if (x + du < W && y + dv < D && k.vis(x + du, y + dv, 0, x + du, y + dv, 0, 2)) pts.push([x + du, y + dv, 0]);
      }
    }
    rivets(k, pts, '#9aa8c4', 0.1);
  }
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#05081840');
  g.addColorStop(0.3, '#05081812');
  g.addColorStop(0.7, '#05081800');
  g.addColorStop(1, '#0508181c');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  // The grating along each wall and the light strip on its edge.
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    if (!wk.vis(T, 0, 0, end, GRATE + 1, 0, 6)) continue;
    grating(wk, T, end);
  }
  // A light strip just inside the front cut.
  k.line([[T + GRATE, D - 1.4, 0], [W - 1.4, D - 1.4, 0], [W - 1.4, T + GRATE, 0]], '#5ce8ff40', Math.max(1.5, 0.6 * s));
  k.line([[T + GRATE, D - 1.4, 0], [W - 1.4, D - 1.4, 0], [W - 1.4, T + GRATE, 0]], '#bff6ff', Math.max(0.8, 0.14 * s));
  marks(k, v, plan);
}

// The grating strip along a wall's foot (wall frame: a along, v out): a
// dark bed under slotted bars, a cyan light strip along its outer edge.
function grating(k: Kit, T: number, end: number): void {
  const { pen, s } = k;
  const g = GRATE;
  k.poly([[T, 0, 0], [end, 0, 0], [end, g, 0], [T, g, 0]], C.grate, 0);
  // the slots
  pen.beginPath();
  const step = 0.8;
  for (let a = T + 0.5; a < end - 0.3; a += step) {
    if (!k.vis(a, 0.4, 0, a, g - 0.4, 0, 2)) continue;
    const [p0, q0] = k.p(a, 0.45, 0);
    const [p1, q1] = k.p(a, g - 0.45, 0);
    pen.moveTo(p0, q0);
    pen.lineTo(p1, q1);
  }
  pen.strokeStyle = '#1b2134';
  pen.lineWidth = Math.max(0.8, 0.32 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  k.line([[T, 0.3, 0], [end, 0.3, 0]], '#5d6a86', Math.max(0.8, 0.14 * s));
  // contact shade at the wall's foot
  k.poly([[T, 0, 0], [end, 0, 0], [end, 2.4, 0], [T, 2.4, 0]], k.lgrad([0, 0, 0], [0, 2.4, 0], [1, 0, 0], [[0, '#05081877'], [1, '#05081800']]), 0);
  // the light strip: a soft glow, then the bright core
  const e = g + 0.15;
  k.line([[T, e, 0], [end, e, 0]], '#5ce8ff38', Math.max(2, 1.3 * s));
  k.line([[T, e, 0], [end, e, 0]], '#5ce8ff70', Math.max(1.2, 0.45 * s));
  k.line([[T, e, 0], [end, e, 0]], '#d8fbff', Math.max(0.8, 0.16 * s));
}

// Paint and light on the deck: the hub emblem, a rug by the sleep pods,
// hazard rings round the reactor, the holo-table's glow ring, a keep-clear
// box at the airlock, pools of light at the stations and the viewport.
function marks(k: Kit, v: RoomView, plan: Plan): void {
  const { pen, s } = k;
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const frameOf = (q: Slot) => new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
  const idle = slot('idle');
  if (idle) {
    const ik = frameOf(idle);
    if (ik.vis(-3, -3, 0, idle.len + 3, idle.dep + 4, 0, 8)) rug(ik, -2, 4.5, idle.len + 4, idle.dep - 2);
  }
  // The emblem at the hub, as big as fits clear of the stations.
  const h = hub(plan.L);
  const rects = plan.L.slots.map(slotRect);
  for (const f of [1, 0.85, 0.7, 0.55]) {
    const r = 10 * f;
    const box = { x0: h.x - r, y0: h.y - r, x1: h.x + r, y1: h.y + r };
    if (rects.some((q, i) => {
      const m = plan.L.slots[i].kind === 'idle' ? 4 : 2;
      return q.x0 < box.x1 + m && box.x0 < q.x1 + m && q.y0 < box.y1 + m && box.y0 < q.y1 + m;
    })) continue;
    if (k.vis(h.x - r, h.y - r, 0, h.x + r, h.y + r, 0, 4)) emblem(k, h.x, h.y, r);
    break;
  }
  const run = slot('run');
  if (run) {
    const rk = frameOf(run);
    if (rk.vis(-3, -3, 0, run.len + 3, run.dep + 3, 0, 8)) {
      rk.pool(run.len / 2, run.dep / 2, 12, 12, '#5ce8ff', 0.22);
      hazardRing(rk, run.len / 2, run.dep / 2, 6.6);
    }
  }
  const think = slot('think');
  if (think) {
    const tk = frameOf(think);
    if (tk.vis(-4, -4, 0, think.len + 4, think.dep + 4, 0, 8)) {
      tk.pool(think.len / 2, think.dep / 2, 9, 7, '#8ff6ff', 0.2);
      const e = tk.ell(think.len / 2, think.dep / 2 + 0.3, 0.02, 7.2);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry * (think.dep / think.len) * 1.6, e.rot, 0, Math.PI * 2);
      pen.strokeStyle = '#8ff6ff55';
      pen.lineWidth = Math.max(1.2, 0.5 * s);
      pen.stroke();
      pen.strokeStyle = '#d8fdff';
      pen.lineWidth = Math.max(0.7, 0.12 * s);
      pen.stroke();
    }
  }
  const door = slot('entrance');
  if (door) {
    const dk = frameOf(door);
    if (dk.vis(0, 3, 0, door.len, 10, 0, 6)) {
      // a dashed keep-clear box in front of the airlock
      const pts: P3[] = [[2.6, 4.6, 0.02], [11.2, 4.6, 0.02], [11.2, 9.4, 0.02], [2.6, 9.4, 0.02]];
      for (let i = 0; i < 4; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % 4];
        const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 1.2));
        pen.beginPath();
        for (let j = 0; j < n; j += 2) {
          const [x0, y0] = dk.p(a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n, 0.02);
          const [x1, y1] = dk.p(a[0] + ((b[0] - a[0]) * (j + 1)) / n, a[1] + ((b[1] - a[1]) * (j + 1)) / n, 0.02);
          pen.moveTo(x0, y0);
          pen.lineTo(x1, y1);
        }
        pen.strokeStyle = '#f2c230cc';
        pen.lineWidth = Math.max(1, 0.32 * s);
        pen.lineCap = 'butt';
        pen.stroke();
      }
      // two chevrons pointing in
      for (const dv of [6.2, 7.8]) dk.poly([[5.4, dv + 0.9, 0.02], [6.9, dv, 0.02], [8.4, dv + 0.9, 0.02], [8.4, dv + 1.5, 0.02], [6.9, dv + 0.6, 0.02], [5.4, dv + 1.5, 0.02]], '#f2c23099', 0);
      dk.pool(6.9, 3, 7, 5, '#ff8a6a', 0.12);
    }
  }
  // Pools of light where people work: warm at the desks, cool at screens.
  for (const [kind, u, w, r, a, c] of [['write', 0.5, 0.75, 9, 0.2, C.lamp], ['read', 0.8, 0.9, 9, 0.2, C.lamp], ['search', 0.35, 1.1, 8, 0.16, '#8fe6ff'], ['web', 0.5, 0.6, 8, 0.16, '#8fe6ff'], ['idle', 0.4, 0.4, 12, 0.22, C.lamp]] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = frameOf(q);
    if (qk.vis(q.len * u - r, q.dep * w - r, 0, q.len * u + r, q.dep * w + r, 0)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, v.T), s);
    if (f.kind === 'viewport' && wk.vis(f.a - 16, 0, 0, f.a + 16, 14, 0, 8)) {
      wk.pool(f.a, 4, f.w * 0.55, 9, '#8fb8ff', 0.16);
    } else if (f.kind === 'porthole' && wk.vis(f.a - 6, 0, 0, f.a + 6, 6, 0, 8)) {
      wk.pool(f.a, 2.5, 4.5, 3, '#8fb8ff', 0.08);
    } else if (f.kind === 'lamp' && wk.vis(f.a - 7, 0, 0, f.a + 7, 6, 0, 8)) {
      wk.pool(f.a, 2.5, 6, 4, C.lamp, 0.14);
    }
  }
}

// A cosy rug in a frame: rounded, a border, stripes across.
function rug(k: Kit, u0: number, v0: number, du: number, dv: number): void {
  const z = 0.04;
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.12);
  k.poly([[u0, v0, z], [u0 + du, v0, z], [u0 + du, v0 + dv, z], [u0, v0 + dv, z]], '#b4553c', k.thin, 1.2);
  const b = 0.9;
  k.poly([[u0 + b, v0 + b, z], [u0 + du - b, v0 + b, z], [u0 + du - b, v0 + dv - b, z], [u0 + b, v0 + dv - b, z]], '#e0a84a', 0, 0.8);
  const c = 1.6;
  k.poly([[u0 + c, v0 + c, z], [u0 + du - c, v0 + c, z], [u0 + du - c, v0 + dv - c, z], [u0 + c, v0 + dv - c, z]], '#c8663f', 0, 0.5);
  // stripes across, and a row of little diamonds
  for (const f of [0.3, 0.7]) {
    const w = v0 + c + (dv - 2 * c) * f;
    k.poly([[u0 + c, w - 0.35, z], [u0 + du - c, w - 0.35, z], [u0 + du - c, w + 0.35, z], [u0 + c, w + 0.35, z]], '#f3e7cf', 0);
  }
  const cv = v0 + dv / 2;
  for (let u = u0 + c + 1.5; u < u0 + du - c - 1; u += 2.2) k.poly([[u - 0.6, cv, z], [u, cv - 0.5, z], [u + 0.6, cv, z], [u, cv + 0.5, z]], '#4f72b0', 0);
}

// The deck emblem: rings of paint with an orbit and a station on it, four
// chevrons round the rim (no lettering).
function emblem(k: Kit, cx: number, cy: number, r: number): void {
  const z = 0.03;
  const ring = (rr: number, c: Color, line = 0) => k.disc(cx, cy, z, rr, c, line);
  ring(r, '#56647f', k.thin);
  ring(r * 0.86, '#f08a3a');
  ring(r * 0.78, '#3a4766');
  ring(r * 0.5, '#2b3754');
  // an orbit and a little planet in the middle
  const e = k.ell(cx, cy, z, r * 0.66);
  k.pen.beginPath();
  k.pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  k.pen.strokeStyle = '#c5cfdd99';
  k.pen.lineWidth = Math.max(0.8, 0.14 * k.s);
  k.pen.stroke();
  ring(r * 0.26, '#5c9fe0');
  k.disc(cx - r * 0.06, cy - r * 0.06, z, r * 0.12, '#7fd07a', 0);
  const [mx, my] = k.p(cx + r * 0.66 * Math.cos(0.8), cy + r * 0.66 * Math.sin(0.8), z);
  k.pen.beginPath();
  k.pen.arc(mx, my, Math.max(1.2, r * 0.07 * k.s), 0, Math.PI * 2);
  k.paint('#e7ecf2', k.thin * 0.8);
  // chevrons on the rim, pointing out
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const p = (rr: number, da: number): P3 => [cx + Math.cos(a + da) * rr, cy + Math.sin(a + da) * rr, z];
    k.poly([p(r * 0.92, -0.12), p(r * 1.12, 0), p(r * 0.92, 0.12), p(r * 0.98, 0)], '#f2c230', 0);
  }
}

// Hazard dashes round a circle on the floor.
function hazardRing(k: Kit, cu: number, cv: number, r: number): void {
  const z = 0.03;
  const n = 28;
  const w = 0.7;
  k.pen.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = a0 + (Math.PI * 2) / n;
    k.trace([[cu + Math.cos(a0) * r, cv + Math.sin(a0) * r, z], [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r, z], [cu + Math.cos(a1) * (r + w), cv + Math.sin(a1) * (r + w), z], [cu + Math.cos(a0) * (r + w), cv + Math.sin(a0) * (r + w), z]]);
  }
  k.pen.fillStyle = '#22232c';
  k.pen.fill();
  k.pen.beginPath();
  for (let i = 0; i < n; i += 2) {
    const a0 = (i / n) * Math.PI * 2 + 0.03;
    const a1 = a0 + (Math.PI * 2) / n - 0.06;
    k.trace([[cu + Math.cos(a0) * r, cv + Math.sin(a0) * r, z], [cu + Math.cos(a1) * r, cv + Math.sin(a1) * r, z], [cu + Math.cos(a1 + 0.08) * (r + w), cv + Math.sin(a1 + 0.08) * (r + w), z], [cu + Math.cos(a0 + 0.08) * (r + w), cv + Math.sin(a0 + 0.08) * (r + w), z]]);
  }
  k.pen.fillStyle = '#f2c230';
  k.pen.fill();
}

// ── walls ──────────────────────────────────────────────────────────────────

const SEAM = '#7f8ca3'; // the wall behind and between the panels

// One wall's modules: [a0, a1) stretches about 9 units wide between ribs.
function modules(k: Kit, plan: Plan, wall: Wall, T: number, end: number, H: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let a = T;
  for (const r of [...plan.ribs[wall], end]) {
    const n = Math.max(1, Math.round((r - a) / 9));
    for (let i = 0; i < n; i++) {
      const m0 = a + ((r - a) * i) / n;
      const m1 = a + ((r - a) * (i + 1)) / n;
      if (k.vis(m0, 0, 0, m1, 0, H)) out.push([m0, m1]);
    }
    a = r;
  }
  return out;
}

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const zt = topZ(H);
  const zl = RAIL + LIVERY;
  const zm = midZ(H);
  const zu = zm + TRIM; // the upper hull's foot
  const mods = modules(k, plan, wall, T, end, H);
  // The wall behind the panels, and the upper hull plating.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, zm], [T, 0, zm]], tone(SEAM), 0);
  if (zt - zu > 1) k.poly([[T, 0, zu], [end, 0, zu], [end, 0, zt], [T, 0, zt]], k.vgrad(T, 0, zu, zt, [[0, tone('#4a5776')], [1, tone('#3a4562')]]), 0);
  // Panels: a low one under the livery and two tall ones over it in each
  // module, rounded, lit from the trim's lights above them.
  const rows: Array<[number, number, number]> = [[KICK + 0.35, RAIL - 0.35, 0.7]];
  const split = zl + (zm - zl) * 0.62;
  rows.push([zl + 0.4, split - 0.2, 0.9], [split + 0.2, zm - 0.4, 0.9]);
  pen.beginPath();
  for (const [m0, m1] of mods) for (const [z0, z1, r] of rows.slice(1)) k.trace([[m0 + 0.35, 0, z0], [m1 - 0.35, 0, z0], [m1 - 0.35, 0, z1], [m0 + 0.35, 0, z1]], r);
  pen.fillStyle = k.vgrad(T, 0, zl, zm, [[0, tone('#b4bfcf')], [0.7, tone('#c3ccda')], [1, tone('#d3dbe6')]]);
  pen.fill();
  pen.beginPath();
  for (const [m0, m1] of mods) k.trace([[m0 + 0.35, 0, rows[0][0]], [m1 - 0.35, 0, rows[0][0]], [m1 - 0.35, 0, rows[0][1]], [m0 + 0.35, 0, rows[0][1]]], 0.7);
  pen.fillStyle = tone('#a7b3c5');
  pen.fill();
  // a lit edge along each panel's top, a dark one along its foot
  if (s >= 3) {
    const edge = (top: boolean, c: Color) => {
      pen.beginPath();
      for (const [m0, m1] of mods) for (const [z0, z1] of rows) {
        const z = top ? z1 - 0.3 : z0 + 0.3;
        const [x0, y0] = k.p(m0 + 1.1, 0, z);
        const [x1, y1] = k.p(m1 - 1.1, 0, z);
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = c;
      pen.lineWidth = Math.max(0.8, 0.15 * s);
      pen.lineCap = 'round';
      pen.stroke();
    };
    edge(true, tone('#f2f6fb'));
    edge(false, tone('#8e9bb2'));
  }
  // Upper hull plates: two to a module, seams and rows of rivets.
  if (zt - zu > 4) {
    const zc = (zu + zt) / 2;
    pen.beginPath();
    for (const [m0, m1] of mods) {
      for (const [z0, z1] of [[zu + 0.5, zc - 0.25], [zc + 0.25, zt - 1.4]]) if (z1 - z0 > 1.5) k.trace([[m0 + 0.3, 0, z0], [m1 - 0.3, 0, z0], [m1 - 0.3, 0, z1], [m0 + 0.3, 0, z1]], 0.4);
    }
    pen.fillStyle = k.vgrad(T, 0, zu, zt, [[0, tone('#566482')], [1, tone('#46526f')]]);
    pen.fill();
    if (k.fine) {
      const pts: P3[] = [];
      for (const [m0, m1] of mods) for (let a = m0 + 1; a < m1 - 0.5; a += 1.4) pts.push([a, 0, zu + 1.0], [a, 0, zt - 1.9]);
      rivets(k, pts, '#7d8bab', 0.1);
    }
  }
  if (k.fine) {
    const pts: P3[] = [];
    for (const [m0, m1] of mods) for (const [z0, z1] of rows.slice(1)) pts.push([m0 + 1.0, 0, z0 + 0.7], [m1 - 1.0, 0, z0 + 0.7], [m0 + 1.0, 0, z1 - 0.7], [m1 - 1.0, 0, z1 - 0.7]);
    rivets(k, pts, '#f4f7fb', 0.11);
  }
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#0a0e2033'], [1, '#0a0e2000']]), 0);
  // Kick plate and the livery stripe.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, KICK], [T, 0, KICK]], tone(C.hullDark), 0);
  k.line([[T, 0, KICK], [end, 0, KICK]], tone('#5d6a86'), Math.max(0.8, 0.14 * s));
  k.box(T, 0, RAIL, end - T, 0.35, LIVERY, C.orange, { line: k.thin, stripe: false, left: tone(C.orange), right: tone(C.orange) });
  k.line([[T, 0.36, RAIL + LIVERY * 0.72], [end, 0.36, RAIL + LIVERY * 0.72]], tone('#ffd2a8'), Math.max(0.7, 0.12 * s));
  // Ribs: navy pilasters up to the conduit band.
  for (const r of plan.ribs[wall]) {
    if (!k.vis(r - 1, 0, 0, r + 1, 1, H)) continue;
    k.box(r - 0.75, 0, 0, 1.5, 0.7, zt, C.hull, { line: k.thin, stripe: false });
    k.line([[r - 0.45, 0.71, KICK + 0.6], [r - 0.45, 0.71, zt - 0.6]], '#6a7ba0', Math.max(0.7, 0.12 * s));
    rivets(k, [[r, 0.71, RAIL + 0.6], [r, 0.71, zt - 1.6], [r, 0.71, (RAIL + zt) / 2]], '#c5cfdd', 0.12);
  }
  // A duct along the upper hull where there is room for it.
  if (zt - zu > 10) {
    const zd = zu + (zt - zu) * 0.42;
    k.box(T, 0, zd, end - T, 1.4, 2.6, tone('#9aa6ba', 0.1), { line: k.lw, stripe: false });
    k.line([[T, 1.41, zd + 1.9], [end, 1.41, zd + 1.9]], tone('#c5cfdd', 0.1), Math.max(0.8, 0.14 * s));
    for (const r of plan.ribs[wall]) {
      if (k.vis(r - 1, 0, zd, r + 1, 2, zd + 3)) k.box(r - 0.4, 0, zd - 0.25, 0.8, 1.6, 3.1, C.steelDark, { line: k.thin, stripe: false });
    }
  }
  midTrim(k, v, end, tone);
  // The conduit band, its pipes, and the light bar under it.
  topBand(k, v, plan, wall, end, tone);
  const pz = portZ(H);
  for (const f of plan.features) {
    if (f.wall !== wall) continue;
    if (!k.vis(f.a - f.w / 2 - 2, 0, 0, f.a + f.w / 2 + 2, 2, H)) continue;
    if (f.kind === 'viewport') viewportArt(k, v, f, lit);
    else if (f.kind === 'porthole') porthole(k, f, lit, pz);
    else if (f.kind === 'screen') wallScreen(k, f, pz);
    else if (f.kind === 'planter') planterArt(k, f, pz);
    else if (f.kind === 'patch') patch(k, f, pz);
    else if (f.kind === 'vent') vent(k, f, lit);
    else if (f.kind === 'lamp') lamp(k, f, pz);
  }
}

// The trim between the panels and the upper hull: a navy ledge with a
// warm light strip under it and a row of little running lights on it.
function midTrim(k: Kit, v: RoomView, end: number, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const { T, H } = v;
  const zm = midZ(H);
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.poly([[T, 0.05, zm - 7], [end, 0.05, zm - 7], [end, 0.05, zm], [T, 0.05, zm]], k.vgrad(T, 0.05, zm - 7, zm, [[0, '#ffd89a00'], [0.7, '#ffd89a18'], [1, '#ffd89a3a']]), 0);
  pen.restore();
  k.box(T, 0, zm, end - T, 0.9, TRIM, tone(C.navy, 0.1), { line: k.thin, stripe: false });
  k.line([[T + 0.2, 0.92, zm + 0.25], [end - 0.2, 0.92, zm + 0.25]], '#ffe6b0', Math.max(1, 0.24 * s));
  // running lights along the ledge, mostly warm, a cyan one now and then
  const warm: P3[] = [];
  const cool: P3[] = [];
  for (let a = T + 1.5, i = 0; a < end - 0.5; a += 2.4, i++) {
    if (!k.vis(a, 0.9, zm + 1, a, 0.9, zm + 1, 4)) continue;
    (i % 7 === 3 ? cool : warm).push([a, 0.92, zm + TRIM * 0.62]);
  }
  for (const [list, c] of [[warm, '#ffcf7a'], [cool, '#8ff6ff']] as const) {
    if (!list.length) continue;
    for (const [a, n, z] of list) k.halo(a, n, z, 1.6, c, 0.35);
    pen.beginPath();
    const r = Math.max(0.9, 0.2 * s);
    for (const [a, n, z] of list) {
      const [x, y] = k.p(a, n, z);
      pen.moveTo(x + r, y);
      pen.arc(x, y, r, 0, Math.PI * 2);
    }
    pen.fillStyle = c === '#ffcf7a' ? '#fff0c8' : '#d8fdff';
    pen.fill();
  }
}

// The band along the top of a wall: hull plate, three pipes clamped at the
// ribs, and a warm light bar washing the plating below.
function topBand(k: Kit, v: RoomView, plan: Plan, wall: Wall, end: number, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const { T, H } = v;
  const zt = topZ(H);
  k.poly([[T, 0, zt], [end, 0, zt], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, zt, H, [[0, tone('#2c3854')], [1, tone('#202a42')]]), 0);
  k.line([[T, 0, zt], [end, 0, zt]], INK, k.thin);
  // the warm wash of the light bar on the plating under it
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.poly([[T, 0.05, zt - 8], [end, 0.05, zt - 8], [end, 0.05, zt], [T, 0.05, zt]], k.vgrad(T, 0.05, zt - 8, zt, [[0, '#ffd89a00'], [0.75, '#ffd89a1c'], [1, '#ffd89a40']]), 0);
  pen.restore();
  // the light bar: a housing with a glowing lens
  k.box(T, 0, zt - 0.9, end - T, 0.7, 0.9, C.steelDark, { line: k.thin, stripe: false });
  k.line([[T + 0.3, 0.72, zt - 0.62], [end - 0.3, 0.72, zt - 0.62]], '#fff1d0', Math.max(1, 0.3 * s));
  // pipes along the band (orange, steel, blue-grey), clamps at the ribs
  const pipes: Array<[number, number, Color]> = [[zt + 1.6, 0.35, C.orange], [zt + 3.0, 0.3, C.steel], [zt + 4.3, 0.42, '#7d8aa3']];
  for (const [z, r, c] of pipes) k.rod([[T, 0.5, z], [end, 0.5, z]], tone(c, 0.1), r);
  for (const [z, , c] of pipes) k.line([[T, 0.62, z + 0.12], [end, 0.62, z + 0.12]], shade(c, 0.4), Math.max(0.6, 0.08 * s));
  for (const r of plan.ribs[wall]) {
    if (!k.vis(r - 1, 0, zt, r + 1, 1, H)) continue;
    k.box(r - 0.45, 0, zt + 0.8, 0.9, 1.0, 4.4, C.steelDark, { line: k.thin, stripe: false });
    k.dot(r + 0.3, 1.0, zt + 4.3, 0.18, '#5ee08f');
  }
}

// A rounded rectangle on the plane v = n, (a0, z0) to (a1, z1), corner r.
function rrect(a0: number, z0: number, a1: number, z1: number, r: number, n: number, steps = 5): P3[] {
  const out: P3[] = [];
  const corner = (ca: number, cz: number, from: number) => {
    for (let i = 0; i <= steps; i++) {
      const th = from + (i / steps) * (Math.PI / 2);
      out.push([ca + Math.cos(th) * r, n, cz + Math.sin(th) * r]);
    }
  };
  corner(a1 - r, z0 + r, -Math.PI / 2);
  corner(a1 - r, z1 - r, 0);
  corner(a0 + r, z1 - r, Math.PI / 2);
  corner(a0 + r, z0 + r, Math.PI);
  return out;
}

// The viewport: a thick rounded frame bolted to the wall, the reveal, and
// deep space beyond: a nebula, stars and a small far moon (the planet is
// drawn over it by the overlay).
function viewportArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const g = viewport(f, v.H);
  const fr = 1.7;
  const r = Math.min(g.a1 - g.a0, g.z1 - g.z0) * 0.22;
  // a mounting plate behind it, then the frame
  k.poly(rrect(g.a0 - fr - 0.9, g.z0 - fr - 0.9, g.a1 + fr + 0.9, g.z1 + fr + 0.9, r + fr + 0.9, 0.02), lit ? '#9aa6ba' : shade('#9aa6ba', -0.14), k.thin);
  k.poly(rrect(g.a0 - fr, g.z0 - fr, g.a1 + fr, g.z1 + fr, r + fr, 0.3), k.vgrad(f.a, 0.3, g.z0 - fr, g.z1 + fr, [[0, lit ? '#d9e0ea' : '#bfc8d6'], [1, lit ? '#eef2f7' : '#d2d9e4']]), k.lw);
  const open = rrect(g.a0, g.z0, g.a1, g.z1, r, 0.32);
  k.poly(open, '#1d2540', 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  const dep = -1.2;
  const glassPts = rrect(g.a0, g.z0, g.a1, g.z1, r, dep);
  k.poly(glassPts, k.vgrad(f.a, dep, g.z0, g.z1, [[0, '#1a2250'], [0.45, C.spaceHi], [1, C.space]]), 0);
  // the nebula: soft clouds of violet and blue
  const W = g.a1 - g.a0;
  const Hh = g.z1 - g.z0;
  for (let i = 0; i < 4; i++) {
    const na = g.a0 + W * (0.15 + hash(f.k, i, 1) * 0.7);
    const nz = g.z0 + Hh * (0.25 + hash(f.k, i, 2) * 0.6);
    k.halo(na, dep, nz, Math.min(W, Hh) * (0.25 + hash(f.k, i, 3) * 0.2), i & 1 ? '#3f5fb0' : C.nebula, 0.32);
  }
  // stars, a few with a sparkle
  stars(k, g.a0, g.a1, g.z0, g.z1, dep, Math.round(W * Hh * 0.22), f.k);
  // a small far moon, upper left
  const [mx, my] = k.p(g.a0 + W * 0.16, dep, g.z1 - Hh * 0.2);
  const mr = Math.max(2, Math.min(W, Hh) * 0.07 * s);
  pen.beginPath();
  pen.arc(mx, my, mr, 0, Math.PI * 2);
  const mg = pen.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, 0, mx, my, mr);
  mg.addColorStop(0, '#f2f0e8');
  mg.addColorStop(0.7, '#b9bccb');
  mg.addColorStop(1, '#6d7290');
  k.paint(mg, k.thin * 0.8);
  if (mr > 4) for (const [dx, dy, rr] of [[0.3, -0.2, 0.22], [-0.3, 0.25, 0.16], [0.1, 0.45, 0.12]]) {
    pen.beginPath();
    pen.arc(mx + dx * mr, my + dy * mr, rr * mr, 0, Math.PI * 2);
    pen.fillStyle = '#8f93a866';
    pen.fill();
  }
  // the reveal's shadow along the top and the lit side
  k.poly(glassPts, k.vgrad(f.a, dep, g.z1 - 3, g.z1, [[0, '#00000000'], [1, '#00000066']]), 0);
  pen.restore();
  // a reflection streak across the glass
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  k.poly([[g.a0 + W * 0.06, 0.33, g.z0], [g.a0 + W * 0.14, 0.33, g.z0], [g.a0 + W * 0.34, 0.33, g.z1], [g.a0 + W * 0.26, 0.33, g.z1]], '#ffffff12', 0);
  k.poly([[g.a0 + W * 0.17, 0.33, g.z0], [g.a0 + W * 0.2, 0.33, g.z0], [g.a0 + W * 0.4, 0.33, g.z1], [g.a0 + W * 0.37, 0.33, g.z1]], '#ffffff0e', 0);
  pen.restore();
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.lw);
  // bolts round the frame
  const bolts: P3[] = [];
  const n = Math.round((W + Hh) / 1.6);
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    bolts.push([f.a + Math.cos(th) * (W / 2 + fr * 0.5), 0.32, (g.z0 + g.z1) / 2 + Math.sin(th) * (Hh / 2 + fr * 0.5)]);
  }
  rivets(k, bolts.filter(([a, , z]) => a > g.a0 - fr && a < g.a1 + fr && z > g.z0 - fr && z < g.z1 + fr), '#ffffff', 0.13);
  // the sill: a ledge with a little console and a plant
  k.box(g.a0 - 0.6, 0, g.z0 - fr - 1.0, W + 1.2, 1.3, 0.6, C.steelDark, { line: k.lw });
  k.box(f.a - 3.2, 0.1, g.z0 - fr - 0.4, 2.6, 1.0, 0.5, C.navy, { line: k.thin });
  for (let i = 0; i < 4; i++) k.dot(f.a - 2.8 + i * 0.6, 1.12, g.z0 - fr - 0.1, 0.12, [C.green, C.amber, C.cyan, C.red][i]);
  const pu = g.a1 - 1.6;
  k.cyl(pu, 0.6, g.z0 - fr - 0.4, 0.55, 1.0, C.white, { line: k.thin });
  crown(k, pu, 0.6, g.z0 - fr + 1.1, 0.6, 0.45, 7, f.k + 3);
}

// Stars on the plane v = n inside a box, a few big ones with a cross.
function stars(k: Kit, a0: number, a1: number, z0: number, z1: number, n: number, count: number, seed: number): void {
  const pen = k.pen;
  const small = Math.max(0.55, 0.07 * k.s);
  pen.beginPath();
  const big: Array<[number, number]> = [];
  for (let i = 0; i < count; i++) {
    const a = a0 + hash(seed, i, 11) * (a1 - a0);
    const z = z0 + hash(seed, i, 12) * (z1 - z0);
    const [x, y] = k.p(a, n, z);
    const r = hash(seed, i, 13);
    if (r > 0.94) big.push([x, y]);
    const rr = small * (r > 0.7 ? 1.5 : 1);
    pen.moveTo(x + rr, y);
    pen.arc(x, y, rr, 0, Math.PI * 2);
  }
  pen.fillStyle = '#f4f0ff';
  pen.fill();
  for (const [x, y] of big) {
    softDot(pen, x, y, 2.2 * small * 2, '#cfe0ff', 0.5);
    const l = small * 4;
    pen.beginPath();
    pen.moveTo(x - l, y);
    pen.lineTo(x + l, y);
    pen.moveTo(x, y - l);
    pen.lineTo(x, y + l);
    pen.strokeStyle = '#f4f0ffcc';
    pen.lineWidth = Math.max(0.6, small * 0.6);
    pen.stroke();
  }
}

// A round porthole: a thick bolted ring, stars beyond, a glint.
function porthole(k: Kit, f: Feature, lit: boolean, z: number): void {
  const { pen } = k;
  const a = f.a;
  const R = 3.8;
  fillPts(k, wallRing(k, a, 0.02, z, R + 1.0), lit ? '#9aa6ba' : shade('#9aa6ba', -0.14), k.thin);
  fillPts(k, wallRing(k, a, 0.3, z, R + 0.6), k.vgrad(a, 0.3, z - R, z + R, [[0, lit ? '#d6dde8' : '#bcc6d4'], [1, lit ? '#f0f3f8' : '#d2d9e4']]), k.lw);
  const glass = wallRing(k, a, 0.32, z, R - 0.15);
  fillPts(k, glass, '#1d2540', 0);
  pen.save();
  fillPts(k, glass, null, 0);
  pen.clip();
  fillPts(k, wallRing(k, a, -0.8, z, R), k.vgrad(a, -0.8, z - R, z + R, [[0, C.space], [1, '#1a2250']]), 0);
  k.halo(a + (hash(f.k, 1) - 0.5) * 2, -0.8, z + (hash(f.k, 2) - 0.5) * 2, R * 0.9, hash(f.k, 3) < 0.5 ? C.nebula : '#3f5fb0', 0.3);
  stars(k, a - R, a + R, z - R, z + R, -0.8, 9, f.k);
  // the reveal's shadow along the top
  fillPts(k, wallRing(k, a, -0.8, z + 0.5, R), '#00000040', 0);
  pen.restore();
  fillPts(k, glass, null, k.thin);
  // a glint
  k.line([[a - R * 0.55, 0.34, z + R * 0.15], [a - R * 0.15, 0.34, z + R * 0.55]], '#ffffff55', Math.max(0.8, 0.25 * k.s));
  const bolts: P3[] = [];
  for (let i = 0; i < 8; i++) bolts.push([a + Math.cos((i / 8) * Math.PI * 2) * (R + 0.3), 0.33, z + Math.sin((i / 8) * Math.PI * 2) * (R + 0.3)]);
  rivets(k, bolts, '#ffffff', 0.13);
}

// A wall screen: a framed display of the station's orbit, glowing.
function wallScreen(k: Kit, f: Feature, pz: number): void {
  const { pen, s } = k;
  const a0 = f.a - f.w / 2;
  const a1 = f.a + f.w / 2;
  const z0 = pz - 3.6;
  const z1 = z0 + 7;
  k.halo(f.a, 0.3, (z0 + z1) / 2, 7, '#5ce8ff', 0.16);
  k.box(a0, 0, z0, f.w, 0.5, z1 - z0, C.navy, { line: k.lw, stripe: false, round: 0.3 });
  const n = 0.52;
  const q: Quad = [[a0 + 0.6, n, z0 + 0.6], [a1 - 0.6, n, z0 + 0.6], [a1 - 0.6, n, z1 - 0.6], [a0 + 0.6, n, z1 - 0.6]];
  k.poly([...q], k.vgrad(f.a, n, z0, z1, [[0, '#0f2a3c'], [1, '#18405a']]), k.thin);
  // a grid, a planet with an orbit and the station on it, a trace
  pen.beginPath();
  for (let i = 1; i < 6; i++) {
    const u = a0 + 0.6 + ((f.w - 1.2) * i) / 6;
    const [x0, y0] = k.p(u, n, z0 + 0.7);
    const [x1, y1] = k.p(u, n, z1 - 0.7);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  for (let i = 1; i < 4; i++) {
    const z = z0 + 0.6 + ((z1 - z0 - 1.2) * i) / 4;
    const [x0, y0] = k.p(a0 + 0.7, n, z);
    const [x1, y1] = k.p(a1 - 0.7, n, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#5ce8ff26';
  pen.lineWidth = Math.max(0.6, 0.06 * s);
  pen.stroke();
  const cu = f.a - f.w * 0.15;
  const cz = (z0 + z1) / 2;
  const orbit: P3[] = [];
  for (let i = 0; i <= 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    orbit.push([cu + Math.cos(th) * 2.6, n + 0.01, cz + Math.sin(th) * 1.4]);
  }
  k.line(orbit, '#8fe6ffaa', Math.max(0.7, 0.1 * s));
  fillPts(k, wallRing(k, cu, n + 0.01, cz, 1.0, 16), '#3a86dc', 0);
  k.dot(cu + 2.6 * Math.cos(0.6), n + 0.02, cz + 1.4 * Math.sin(0.6), 0.25, '#ffd27a');
  const trace: P3[] = [];
  for (let i = 0; i <= 12; i++) trace.push([f.a + 1.2 + i * 0.28, n + 0.01, cz - 1 + Math.sin(i * 0.9 + f.k) * 0.8 + i * 0.12]);
  k.line(trace, '#5ee08f', Math.max(0.7, 0.12 * s));
  for (let i = 0; i < 3; i++) k.poly([[a1 - 1.6 - i * 0.9, n + 0.01, z0 + 0.9], [a1 - 1.0 - i * 0.9, n + 0.01, z0 + 0.9], [a1 - 1.0 - i * 0.9, n + 0.01, z0 + 1.5 + i * 0.5], [a1 - 1.6 - i * 0.9, n + 0.01, z0 + 1.5 + i * 0.5]], '#ffb04a', 0);
  k.poly([on(q, 0.6, 0), on(q, 0.75, 0), on(q, 0.45, 1), on(q, 0.3, 1)], '#ffffff10', 0);
}

// A hydroponic wall planter: a white trough of greens under a grow light.
function planterArt(k: Kit, f: Feature, pz: number): void {
  const a0 = f.a - f.w / 2;
  const z = pz - 4.5;
  k.halo(f.a, 1.2, z + 3, 6.5, C.grow, 0.22);
  // the grow light bar on two arms
  const lz = z + 7.2;
  for (const du of [0.8, f.w - 0.8]) k.rod([[a0 + du, 0.05, lz + 0.4], [a0 + du, 1.4, lz + 0.4]], C.steel, 0.12);
  k.box(a0 + 0.3, 1.0, lz, f.w - 0.6, 0.8, 0.45, C.steelDark, { line: k.thin, stripe: false });
  k.line([[a0 + 0.6, 1.82, lz + 0.05], [a0 + f.w - 0.6, 1.82, lz + 0.05]], '#f2c9ff', Math.max(1, 0.28 * k.s));
  // leaves rising out of the trough, then the trough's front over them
  for (let i = 0; i < 5; i++) {
    const u = a0 + 1.2 + i * ((f.w - 2.4) / 4);
    sprouts(k, u, 1.0, z + 1.9, 5, 2.0 + hash(f.k, i, 5) * 0.8, f.k + i, i & 1 ? [C.leaf, C.leafLight] : [C.leafDark, C.leaf]);
    if (hash(f.k, i, 6) < 0.4) k.dot(u + 0.4, 1.3, z + 3.2, 0.25, '#e8505f', k.thin * 0.6);
  }
  k.box(a0, 0, z, f.w, 2.0, 2.0, C.white, { line: k.lw, round: 0.4 });
  k.line([[a0 + 0.3, 2.01, z + 1.1], [a0 + f.w - 0.3, 2.01, z + 1.1]], C.orange, Math.max(1, 0.3 * k.s));
  // trailing leaves over the front
  for (let i = 0; i < 4; i++) {
    const [x, y] = k.p(a0 + 1 + i * 2.6, 2.05, z + 1.4);
    leaf(k, x, y, Math.PI / 2 + (i - 1.5) * 0.25, 2.4 * k.s, 0.6 * k.s, i & 1 ? C.leaf : C.leafLight, false);
  }
}

// A mission patch: a round emblem with a rocket climbing past a planet.
function patch(k: Kit, f: Feature, pz: number): void {
  const a = f.a;
  const z = pz + 1;
  const R = 3.0;
  const q = R / 2.5;
  fillPts(k, wallRing(k, a, 0.15, z, R + 0.35), C.orange, k.lw);
  fillPts(k, wallRing(k, a, 0.17, z, R - 0.2), '#22305a', k.thin);
  fillPts(k, wallRing(k, a + 0.6 * q, 0.18, z - 0.9 * q, 1.0 * q, 16), '#3a86dc', 0);
  // the rocket: a white body with a red nose and fins, its flame
  const n = 0.19;
  const P = (da: number, dz: number): P3 => [a + da * q, n, z + dz * q];
  k.poly([P(-0.9, -1.2), P(-0.3, -1.2), P(-0.3, 0.6), P(-0.6, 1.4), P(-0.9, 0.6)], C.white, k.thin * 0.8);
  k.poly([P(-0.9, 0.6), P(-0.3, 0.6), P(-0.6, 1.4)], '#e8505f', 0);
  k.poly([P(-1.3, -1.4), P(-0.9, -0.8), P(-0.9, -1.2)], '#e8505f', 0);
  k.poly([P(0.1, -1.4), P(-0.3, -0.8), P(-0.3, -1.2)], '#e8505f', 0);
  k.poly([P(-0.8, -1.25), P(-0.4, -1.25), P(-0.6, -2.0)], '#ffb04a', 0);
  for (let i = 0; i < 5; i++) {
    const th = Math.PI * (0.15 + i * 0.17);
    k.dot(a + Math.cos(th) * (R - 0.7), n, z + Math.sin(th) * (R - 0.7), 0.1, '#fff8ea');
  }
}

// A vent grille low on the wall.
function vent(k: Kit, f: Feature, lit: boolean): void {
  const a0 = f.a - f.w / 2;
  const z0 = KICK + 1.4;
  const z1 = RAIL - 1.6;
  k.box(a0, 0, z0, f.w, 0.4, z1 - z0, lit ? '#7d8aa3' : shade('#7d8aa3', -0.12), { line: k.lw, stripe: false, round: 0.3 });
  const pen = k.pen;
  pen.beginPath();
  for (let z = z0 + 0.7; z < z1 - 0.4; z += 0.7) {
    const [x0, y0] = k.p(a0 + 0.6, 0.41, z);
    const [x1, y1] = k.p(a0 + f.w - 0.6, 0.41, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#2a3148';
  pen.lineWidth = Math.max(0.9, 0.3 * k.s);
  pen.lineCap = 'round';
  pen.stroke();
  rivets(k, [[a0 + 0.35, 0.42, z0 + 0.35], [a0 + f.w - 0.35, 0.42, z0 + 0.35], [a0 + 0.35, 0.42, z1 - 0.35], [a0 + f.w - 0.35, 0.42, z1 - 0.35]]);
}

// A warm wall lamp: a capsule of frosted glass in a steel cage.
function lamp(k: Kit, f: Feature, pz: number): void {
  const a = f.a;
  const z = pz + 0.5;
  k.halo(a, 0.4, z, 8, C.warm, 0.3);
  k.halo(a, 0.4, z, 3.2, '#ffe2a8', 0.32);
  k.box(a - 0.55, 0, z - 1.8, 1.1, 0.4, 3.6, C.steelDark, { line: k.thin, stripe: false, round: 0.3 });
  k.poly(rrect(a - 0.42, z - 1.4, a + 0.42, z + 1.4, 0.42, 0.75), '#fff1cf', k.thin);
  k.line([[a - 0.42, 0.78, z], [a + 0.42, 0.78, z]], C.steelDark, Math.max(0.7, 0.12 * k.s));
}

// ── the shell's edges: wall tops, cut ends, the deck slab ─────────────────

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  // the deck's cut edges, a light line along them
  if (k.vis(T, D, -SLAB, W, D, 0) || k.vis(W, T, -SLAB, W, D, 0)) {
    k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#3a4560', 0, 1), k.lw);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#3a4560', 1, 0), k.lw);
    k.line([[T, D, -0.8], [W, D, -0.8], [W, T, -0.8]], '#5ce8ff99', Math.max(1, 0.22 * k.s));
  }
  // the walls' cut ends: inner panel, the hull's structure, the white skin
  const ends: Array<[P3, P3, number, number]> = [[[0, D, 0], [T, D, 0], 0, 1], [[W, 0, 0], [W, T, 0], 1, 0]];
  for (const [p, q, nu, nv] of ends) {
    if (!k.vis(Math.min(p[0], q[0]), Math.min(p[1], q[1]), -SLAB, Math.max(p[0], q[0]), Math.max(p[1], q[1]), H)) continue;
    const at = (f: number, z: number): P3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z];
    const face = (f0: number, f1: number, c: Color) => k.poly([at(f0, -SLAB), at(f1, -SLAB), at(f1, H), at(f0, H)], k.side(c, nu, nv), 0);
    face(0, 1, '#2c3854');
    face(0, 0.14, '#dfe5ee');
    face(0.86, 1, '#a9b4c6');
    // insulation: an orange quilt between the frames
    face(0.3, 0.7, '#c9773e');
    const pen = k.pen;
    pen.beginPath();
    for (let z = 1; z < H - 0.5; z += 2) {
      const [x0, y0] = k.p(...at(0.3, z));
      const [x1, y1] = k.p(...at(0.7, z + 1));
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#8f4f2a88';
    pen.lineWidth = Math.max(0.6, 0.1 * k.s);
    pen.stroke();
    pen.beginPath();
    k.trace([at(0, -SLAB), at(1, -SLAB), at(1, H), at(0, H)]);
    k.paint(null, k.lw);
  }
  if (k.vis(0, 0, H, W, D, H)) {
    const cap = '#8f9bb0';
    k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
    k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.35), Math.max(1, 0.2 * k.s));
    k.line([[T - 0.5, D, H], [T - 0.5, T - 0.5, H], [W, T - 0.5, H]], withAlpha(INK, 0.35), Math.max(0.8, 0.12 * k.s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

// ── per frame: the planet ─────────────────────────────────────────────────────
// A blue world turning slowly past the viewport, lit from the upper left:
// oceans, continents and clouds on a sphere seen tilted toward us, the
// night side in shadow, a thin bright atmosphere. Its turn steps a pixel
// at a time, so it is redrawn (and sent) only when it moved.

type Blob = { lon: number; lat: number; rl: number; rb: number; c: Color; seed: number };
const LANDS: Blob[] = [
  { lon: 0.2, lat: 0.35, rl: 0.55, rb: 0.32, c: '#6cb852', seed: 1 },
  { lon: 1.3, lat: -0.2, rl: 0.42, rb: 0.45, c: '#7fc25a', seed: 2 },
  { lon: 1.55, lat: 0.15, rl: 0.22, rb: 0.18, c: '#d6b673', seed: 3 },
  { lon: 2.7, lat: 0.5, rl: 0.6, rb: 0.25, c: '#6cb852', seed: 4 },
  { lon: 3.6, lat: -0.35, rl: 0.38, rb: 0.3, c: '#5aa84c', seed: 5 },
  { lon: 4.6, lat: 0.1, rl: 0.5, rb: 0.38, c: '#7fc25a', seed: 6 },
  { lon: 4.75, lat: 0.05, rl: 0.2, rb: 0.16, c: '#d6b673', seed: 7 },
  { lon: 5.6, lat: -0.55, rl: 0.32, rb: 0.2, c: '#6cb852', seed: 8 },
];
const CLOUDS: Array<{ lon: number; lat: number; len: number; w: number }> = [
  { lon: 0.8, lat: 0.15, len: 0.9, w: 0.07 },
  { lon: 2.0, lat: -0.45, len: 1.2, w: 0.06 },
  { lon: 3.1, lat: 0.25, len: 0.8, w: 0.08 },
  { lon: 4.0, lat: 0.62, len: 1.0, w: 0.05 },
  { lon: 5.2, lat: -0.15, len: 1.1, w: 0.07 },
  { lon: 6.0, lat: 0.4, len: 0.7, w: 0.06 },
];
const SPIN = 0.04; // radians a second
const TILT = 0.38; // the north pole leans toward us
const ROLL = -0.32; // and the axis leans on screen

function planet(k: Kit, v: RoomView, f: Feature): void {
  const pen = k.pen;
  const g = viewport(f, v.H);
  const [cx, cy] = k.p(g.pa, -1.2, g.pz);
  const R = g.pr * v.s;
  if (R < 3) return;
  // the turn, stepped so the surface moves a pixel or so a step and steps
  // at most twice a second (each step is a new picture to send)
  const step = Math.max(1 / R, SPIN * 0.5);
  const spin = Math.floor((v.t * SPIN) / step) * step;
  const ct = Math.cos(TILT);
  const st = Math.sin(TILT);
  const cr = Math.cos(ROLL);
  const sr = Math.sin(ROLL);
  // (lon, lat) on the turning sphere to screen px, and its depth (> 0 shows)
  const proj = (lon: number, lat: number): [number, number, number] => {
    const L = lon + spin;
    const cl = Math.cos(lat);
    const x = cl * Math.sin(L);
    const y = -cl * Math.cos(L) * st + Math.sin(lat) * ct;
    const z = cl * Math.cos(L) * ct + Math.sin(lat) * st;
    const sx = x * cr - y * sr;
    const sy = x * sr + y * cr;
    return [cx + sx * R, cy - sy * R, z];
  };
  // the glass clips it, as the window would
  const open = rrect(g.a0, g.z0, g.a1, g.z1, Math.min(g.a1 - g.a0, g.z1 - g.z0) * 0.22, 0.32);
  pen.beginPath();
  k.trace(open);
  pen.clip();
  // the atmosphere's glow round it
  softDot(pen, cx - R * 0.08, cy - R * 0.08, R * 1.32, '#6fb6ff', 0.5, 'source-over');
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  const sea = pen.createRadialGradient(cx - R * 0.4, cy - R * 0.45, 0, cx, cy, R);
  sea.addColorStop(0, '#62b2ff');
  sea.addColorStop(0.6, '#3a86dc');
  sea.addColorStop(1, '#2459a8');
  pen.fillStyle = sea;
  pen.fill();
  pen.save();
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  pen.clip();
  // continents: wobbly blobs, their far parts pressed onto the limb
  for (const b of LANDS) {
    const pts: Array<[number, number]> = [];
    let shown = false;
    for (let i = 0; i < 18; i++) {
      const th = (i / 18) * Math.PI * 2;
      const wob = 0.75 + hash(b.seed, i, 9) * 0.45;
      const [x, y, z] = proj(b.lon + Math.cos(th) * b.rl * wob, b.lat + Math.sin(th) * b.rb * wob);
      if (z > 0) shown = true;
      if (z >= 0) pts.push([x, y]);
      else {
        const dx = x - cx;
        const dy = y - cy;
        const l = Math.hypot(dx, dy) || 1;
        pts.push([cx + (dx / l) * R * 1.02, cy + (dy / l) * R * 1.02]);
      }
    }
    if (!shown) continue;
    pen.beginPath();
    pts.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
    pen.closePath();
    pen.fillStyle = b.c;
    pen.fill();
    pen.strokeStyle = '#2f6a3a66';
    pen.lineWidth = Math.max(0.6, R * 0.025);
    pen.stroke();
  }
  // the ice cap round the north pole
  pen.beginPath();
  for (let i = 0; i <= 24; i++) {
    const [x, y] = proj((i / 24) * Math.PI * 2, 1.2);
    if (i) pen.lineTo(x, y);
    else pen.moveTo(x, y);
  }
  pen.closePath();
  pen.fillStyle = '#f2f6fc';
  pen.fill();
  // clouds: soft streaks along their latitudes, drifting a little faster
  pen.lineCap = 'round';
  for (const c of CLOUDS) {
    pen.beginPath();
    let down = false;
    for (let i = 0; i <= 10; i++) {
      const [x, y, z] = proj(c.lon + spin * 0.3 + (i / 10) * c.len, c.lat + Math.sin(i * 0.9) * 0.04);
      if (z < 0.05) {
        down = false;
        continue;
      }
      if (down) pen.lineTo(x, y);
      else pen.moveTo(x, y);
      down = true;
    }
    pen.strokeStyle = '#f6f9ffdd';
    pen.lineWidth = Math.max(1, c.w * R * 2);
    pen.stroke();
  }
  // the night side
  const night = pen.createRadialGradient(cx - R * 0.55, cy - R * 0.6, 0, cx - R * 0.55, cy - R * 0.6, R * 2.1);
  night.addColorStop(0, '#0b143000');
  night.addColorStop(0.55, '#0b143000');
  night.addColorStop(0.72, '#0b143088');
  night.addColorStop(1, '#0b1430ee');
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  pen.fillStyle = night;
  pen.fill();
  pen.restore();
  // the lit limb, and ink round it
  pen.beginPath();
  pen.arc(cx, cy, R - Math.max(0.6, R * 0.03), Math.PI * 0.75, Math.PI * 1.55);
  pen.strokeStyle = '#c8f0ffcc';
  pen.lineWidth = Math.max(1, R * 0.06);
  pen.stroke();
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  pen.strokeStyle = withAlpha(INK, 0.8);
  pen.lineWidth = Math.max(1, k.thin * 0.8);
  pen.stroke();
}
