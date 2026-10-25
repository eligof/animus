import type { At } from '../../art/iso.ts';
import { frame, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, keepClear, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import { crystal, heap, icicles, lantern, rock } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, SPOT, hash, softDot, sparkle, wave, withAlpha } from './kit.ts';

// Snowy Depths' shell: a cavern in a glacier. Packed snow underfoot, rippled
// by the draught and trodden into trails, a pond frozen over round the
// fishing hole and bare rock melted clear round the fire; walls of blue
// glacier ice over a footing of rock, banded and scalloped, hung with
// frozen flows and a fringe of icicles under a cornice of snow; snow
// drifted deep along their feet. Between the stations the walls hold
// frozen waterfalls, ice windows with a fish caught in them, crystals,
// skis, a stretched pelt, shelves and warm iron lanterns. Every piece sits
// in the free stretches of wall between the stations, worked out from the
// same plan the stage uses, so nothing hangs behind a bookcase or the gate.

type Wall = 'left' | 'right';
type Kind = 'falls' | 'window' | 'crystals' | 'skis' | 'pelt' | 'shelf' | 'lantern';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[]; scatter: Bit[] };
// A low thing lying out on the open floor: rocks under snow, or shards of
// ice pushed up through it.
type Bit = { x: number; y: number; r: number; kind: 'rocks' | 'shards'; k: number };

const SLAB = 4; // the floor's thickness, shown along the front cut
const FLOOR = '#b3c3d8'; // the packed snow
const GLACIER: ReadonlyArray<readonly [number, Color]> = [[0, '#7cc2e8'], [0.22, '#5ea5d8'], [0.6, '#3f78b6'], [1, '#233f70']];

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and what stands against the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'snowy');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const fs = features(L);
  const plan = { L, features: fs, scatter: scatter(L, fs) };
  PLANS.set(key, plan);
  return plan;
}

const between = (L: Layout, wall: Wall, a0: number, a1: number) => {
  const on = L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? s.x0 : s.y0));
  return on.some((p) => p < a0) && on.some((p) => p >= a1);
};

const FALLS = 16;
const GAP = 9; // the least wall between two pieces
const WIDTH: Record<Kind, number> = { falls: FALLS, window: 9, crystals: 7, skis: 6, pelt: 7, shelf: 10, lantern: 2 };

// A frozen waterfall in the longest stretch between two stations (else the
// longest), and one on the other wall too when it has the room; then ice
// windows, crystals, skis, a pelt and shelves in what is left, with iron
// lanterns between neighbours.
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
  const len = (s: { a0: number; a1: number }) => s.a1 - s.a0;
  const falls = (pick: { wall: Wall; a0: number; a1: number }) => {
    const mid = (pick.a0 + pick.a1) / 2;
    out.push({ wall: pick.wall, kind: 'falls', a: mid, w: FALLS, k: out.length });
    spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: mid - FALLS / 2 - 2 }, { wall: pick.wall, a0: mid + FALLS / 2 + 2, a1: pick.a1 });
  };
  const fits = spans.filter((s) => len(s) >= FALLS + 2);
  const first = fits.filter((s) => between(L, s.wall, s.a0, s.a1)).sort((p, q) => len(q) - len(p))[0] ?? fits.sort((p, q) => len(q) - len(p))[0];
  if (first) {
    falls(first);
    const second = spans.filter((s) => s.wall !== first.wall && len(s) >= FALLS + 14).sort((p, q) => len(q) - len(p))[0];
    if (second) falls(second);
  }
  const ORDER: Kind[] = ['window', 'crystals', 'pelt', 'skis', 'shelf', 'window', 'crystals', 'skis', 'pelt', 'window', 'shelf'];
  const cap: Partial<Record<Kind, number>> = { window: 4, shelf: 3, pelt: 4, skis: 3, crystals: 6 };
  const count: Partial<Record<Kind, number>> = {};
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? GAP : 0) <= len(s);
    for (;;) {
      let k: Kind | undefined;
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < (cap[c] ?? Infinity) && room(c)) k = c;
      }
      if (!k && !kinds.length && room('lantern')) k = 'lantern';
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? GAP : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len(s) - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    const placed: Feature[] = [];
    kinds.forEach((k, i) => {
      placed.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    out.push(...placed);
    // Lanterns between neighbours with room for them (crystals light
    // themselves).
    for (let i = 0; i + 1 < placed.length; i++) {
      const [p, q] = [placed[i], placed[i + 1]];
      if (gap < 5 || p.kind === 'lantern' || q.kind === 'lantern' || (p.kind === 'crystals' && q.kind === 'crystals')) continue;
      out.push({ wall: s.wall, kind: 'lantern', a: p.a + p.w / 2 + gap / 2, w: 2, k: n + i });
    }
  }
  return out;
}

// Rocks and shards of ice out on the floor, off the walkways and the
// plazas (see keepClear), clear of the stations, the pond and the falls'
// pools, each kept apart from the others.
function scatter(L: Layout, fs: Feature[]): Bit[] {
  if (!L.slots.length) return [];
  const keep = keepClear(L);
  const rects = L.slots.map(slotRect);
  const out: Bit[] = [];
  const pools = fs.filter((f) => f.kind === 'falls').map((f) => (f.wall === 'right' ? { x: f.a, y: L.T + 6 } : { x: L.T + 6, y: f.a }));
  const think = L.slots.find((q) => q.kind === 'think');
  const want = Math.round((L.W * L.D) / 2600);
  for (let i = 0; i < want * 8 && out.length < want; i++) {
    const x = L.T + 10 + hash(i, 101) * (L.W - L.T - 14);
    const y = L.T + 10 + hash(i, 102) * (L.D - L.T - 14);
    const r = 1.3 + hash(i, 103) * 1.5;
    let blocked = false;
    for (let yy = Math.floor(y - r - 1); yy <= y + r + 1 && !blocked; yy++) for (let xx = Math.floor(x - r - 1); xx <= x + r + 1 && !blocked; xx++) blocked = !!keep[xx + L.W * yy];
    if (blocked) continue;
    if (rects.some((q) => x + r > q.x0 - 4 && x - r < q.x1 + 4 && y + r > q.y0 - 4 && y - r < q.y1 + 4)) continue;
    if (pools.some((p) => Math.hypot(p.x - x, p.y - y) < 14)) continue;
    if (think && Math.hypot(think.x0 + 6 - x, think.y0 + 5 - y) < 16) continue;
    if (out.some((b) => Math.hypot(b.x - x, b.y - y) < 12)) continue;
    out.push({ x, y, r, kind: hash(i, 104) < 0.6 ? 'rocks' : 'shards', k: i });
  }
  return out.sort((p, q) => p.x + p.y - (q.x + q.y));
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots (warm by the fire pit, a seat by it, a drink by the
// stove...), and a look at the frozen falls and into the ice windows.
export function snowyPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L);
  for (const f of fs.filter((g) => g.kind === 'falls')) {
    const face = pt(f.wall, f.a, 0);
    out.push({ ...pt(f.wall, f.a - 5, 12), kind: 'view', face }, { ...pt(f.wall, f.a + 5, 12), kind: 'view', face });
  }
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 2)) out.push({ ...pt(f.wall, f.a, 7), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

// ── drawing ────────────────────────────────────────────────────────────────

const wallAt = (P: At, wall: Wall, T: number): At => frame(P, wall, wall === 'right' ? 0 : T, wall === 'right' ? T : 0);
const slotAt = (P: At, q: Slot): At => frame(P, q.wall, q.x0, q.y0);

export const room: RoomArt = {
  draw(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const k = new Kit(v.pen, v.at, v.s);
    const walls = (['right', 'left'] as const).map((wall) => ({ wall, k: new Kit(v.pen, wallAt(v.at, wall, v.T), v.s) }));
    v.pen.save();
    floor(k, v, plan);
    for (const w of walls) wallFace(w.k, v, plan, w.wall);
    for (const w of walls) drift(w.k, v, plan, w.wall);
    for (const w of walls) for (const f of plan.features) if (f.wall === w.wall) standing(w.k, f);
    for (const w of walls) for (const f of plan.features) if (f.wall === w.wall) glows(w.k, f);
    shell(k, v);
    v.pen.restore();
  },
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    for (const wall of ['right', 'left'] as const) twinkles(new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), v, plan, wall);
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], FLOOR, 0);
  // Shade: the back corner in the cave's gloom, a paler middle.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#22386a55');
  g.addColorStop(0.3, '#22386a1c');
  g.addColorStop(0.65, '#22386a00');
  g.addColorStop(1, '#22386a14');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  // Broad dunes: a pale crest toward the light, a blue hollow behind.
  for (let i = 0; i < Math.round(((W - T) * (D - T)) / 700); i++) {
    const cx = T + hash(i, 21) * (W - T);
    const cy = T + hash(i, 22) * (D - T);
    const r = 6 + hash(i, 23) * 12;
    const e = 0.55 + hash(i, 24) * 0.3;
    if (!k.seen([[cx - r * 1.2, cy - r * 1.2, 0], [cx + r * 1.6, cy + r * 1.6, 0], [cx - r * 1.2, cy + r * 1.6, 0], [cx + r * 1.6, cy - r * 1.2, 0]])) continue;
    k.pool(cx + r * 0.35, cy + r * 0.35, r * 1.1, r * e, '#6f86aa', 0.2, 0, 'source-over');
    k.pool(cx - r * 0.15, cy - r * 0.15, r, r * e * 0.9, '#f4f8fd', 0.3, 0, 'source-over');
  }
  // Ripples the draught has blown into the snow: long soft crests, a blue
  // shadow under each, all in two paths.
  const n = Math.round(((W - T) * (D - T)) / 320);
  const crests: P3[][] = [];
  for (let i = 0; i < n; i++) {
    const cx = T + 4 + hash(i, 31) * (W - T - 8);
    const cy = T + 4 + hash(i, 32) * (D - T - 8);
    const len = 7 + hash(i, 33) * 9;
    const ang = -0.75 + (hash(i, 34) - 0.5) * 0.35;
    const du = Math.cos(ang);
    const dv = Math.sin(ang);
    const bend = 0.6 + hash(i, 35) * 0.8;
    const pts: P3[] = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8 - 0.5;
      const b = Math.sin(t * Math.PI * 2) * bend * 0.5 - (1 - 4 * t * t) * bend * 0.4;
      pts.push([cx + du * len * t - dv * b, cy + dv * len * t + du * b, 0]);
    }
    if (k.seen([pts[0], pts[8]], 2 * s)) crests.push(pts);
  }
  const strokes = (off: number, color: Color, w: number) => {
    pen.beginPath();
    for (const pts of crests) k.run(pts.map(([x, y]) => [x + off, y + off, 0] as P3));
    pen.strokeStyle = color;
    pen.lineWidth = w;
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    pen.stroke();
  };
  strokes(0.3, '#8ea3c04d', Math.max(1, 0.3 * s));
  strokes(0, '#f4f8fd90', Math.max(0.8, 0.14 * s));
  const rects = plan.L.slots.map(slotRect);
  const clear = (x: number, y: number, r: number) => x - r > T + 3 && y - r > T + 3 && x + r < W - 2 && y + r < D - 2 && !rects.some((q) => x + r > q.x0 - 3 && x - r < q.x1 + 3 && y + r > q.y0 - 3 && y - r < q.y1 + 3);
  // Glazed patches where meltwater froze again.
  const want = Math.max(3, Math.round((W * D) / 9000));
  for (let i = 0, placed = 0; i < 60 && placed < want; i++) {
    const cx = T + hash(i, 41) * (W - T);
    const cy = T + hash(i, 42) * (D - T);
    const r = 2.2 + hash(i, 43) * 3.4;
    if (!clear(cx, cy, r)) continue;
    placed++;
    if (!k.seen([[cx - r, cy - r, 0], [cx + r, cy + r, 0], [cx - r, cy + r, 0], [cx + r, cy - r, 0]])) continue;
    glaze(k, cx, cy, r, r * (0.6 + hash(i, 44) * 0.3), i);
  }
  // Pebbles poking through.
  const stones: Array<[number, number, number]> = [];
  for (let i = 0; i < Math.round((W * D) / 1300); i++) {
    const x = T + 2 + hash(i, 51) * (W - T - 4);
    const y = T + 2 + hash(i, 52) * (D - T - 4);
    if (clear(x, y, 0.5) && k.seen([[x, y, 0]], s)) stones.push([x, y, 0.25 + hash(i, 53) * 0.35]);
  }
  pen.beginPath();
  for (const [x, y, r] of stones) {
    const e = k.ell(x, y, 0, r);
    pen.moveTo(e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.ry * 1.25, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = C.rockDark;
  pen.fill();
  if (k.fine) {
    pen.strokeStyle = withAlpha(INK, 0.7);
    pen.lineWidth = k.thin * 0.7;
    pen.stroke();
  }
  pen.beginPath();
  for (const [x, y, r] of stones) {
    const e = k.ell(x - r * 0.25, y - r * 0.25, 0.1, r * 0.45);
    pen.moveTo(e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, 0, 0, Math.PI * 2);
  }
  pen.fillStyle = '#eef4fb';
  pen.fill();
  // Trails trodden in: in from the gate to the middle, and from there to
  // the fire.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const h = hub(plan.L);
  const gate = slot('entrance');
  const idle = slot('idle');
  const trail: Array<[{ x: number; y: number }, { x: number; y: number }, number]> = [];
  if (gate) trail.push([gate.spot, h, 1]);
  if (idle) trail.push([h, idle.spot, 2]);
  pen.beginPath();
  for (const [a, b, sd] of trail) footprints(k, a.x, a.y, b.x, b.y, sd);
  pen.fillStyle = '#8297b6a0';
  pen.fill();
  // The ground round the stations: the pond under the fishing hole, rock
  // melted bare round the fire.
  const think = slot('think');
  if (think) {
    const tk = new Kit(pen, slotAt(v.at, think), s);
    pond(tk, SPOT.hole[0] + 1.6, SPOT.hole[1] + 0.2, 10.5, 7.6, 3);
  }
  if (idle) {
    const ik = new Kit(pen, slotAt(v.at, idle), s);
    hearthGround(ik, SPOT.fire[0], SPOT.fire[1]);
  }
  // The light the stations lay on the snow.
  const lights: ReadonlyArray<readonly [Slot['kind'], number, number, number, number, Color, number]> = [
    ['idle', SPOT.fire[0], SPOT.fire[1], 16, 13, '#ff8a3a', 0.42],
    ['run', SPOT.stove[0], SPOT.stove[1] + 3, 11, 9, '#ff8a3a', 0.34],
    ['write', 9.2, 4.5, 7, 5.5, '#ffb44a', 0.26],
    ['read', 11.4, 3, 6.5, 5, '#ffb44a', 0.24],
    ['search', 11, 3, 6, 5, '#ffb44a', 0.26],
    ['search', 5, 4, 8, 4, '#e6f8ff', 0.3],
    ['web', 4.5, 6, 6, 5, '#c8ffe0', 0.22],
    ['think', 1.2, 5.6, 6, 5, '#ffb44a', 0.26],
    ['think', 11.8, 2.2, 5, 4, '#ffb44a', 0.22],
    ['entrance', 7, 3, 9, 6, '#e6f0ff', 0.32],
    ['entrance', 2.5, 2.6, 6, 5, '#ffb44a', 0.26],
  ];
  for (const [kind, u, w, ru, rv, color, a] of lights) {
    const q = slot(kind);
    if (!q) continue;
    new Kit(pen, slotAt(v.at, q), s).pool(u, w, ru, rv, color, a, 0, 'source-over');
  }
  for (const b of plan.scatter) if (k.seen([[b.x - b.r - 1, b.y - b.r - 1, 0], [b.x + b.r + 1, b.y + b.r + 1, 0], [b.x - b.r, b.y + b.r, 2.5]])) bit(k, b);
}

// Rocks under snow, or ice shards on a lump of snow, low on the floor.
function bit(k: Kit, b: Bit): void {
  k.shadow(b.x, b.y, b.r * 1.2, b.r * 1.1, 0.16);
  if (b.kind === 'rocks') {
    rock(k, b.x - b.r * 0.3, b.y - b.r * 0.2, 0, b.r, b.r * 0.85, b.k, true, C.rock);
    rock(k, b.x + b.r * 0.6, b.y + b.r * 0.55, 0, b.r * 0.5, b.r * 0.45, b.k + 1, true, C.rockDark);
    return;
  }
  heap(k, b.x, b.y, 0, b.r * 0.9, 0.7, b.k, C.snow, k.thin);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + b.k;
    crystal(k, b.x + Math.cos(a) * 0.45, b.y + Math.sin(a) * 0.45, 0.2, 0.22 + hash(b.k, i) * 0.1, 0.6 + hash(b.k, i, 2) * 0.9, Math.cos(a) * 0.3, Math.sin(a) * 0.3, a);
  }
}

// A wobbly ring of frame points round (cu, cv), ru x rv, at z.
function oval(cu: number, cv: number, ru: number, rv: number, z: number, seed: number, n = 24, wob = 0.07): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const f = 1 + wob * Math.sin(a * 3 + seed) + wob * 0.6 * Math.sin(a * 5 + seed * 2.3);
    pts.push([cu + Math.cos(a) * ru * f, cv + Math.sin(a) * rv * f, z]);
  }
  return pts;
}

// A glazed patch of ice in the snow.
function glaze(k: Kit, cx: number, cy: number, ru: number, rv: number, seed: number): void {
  const pts = oval(cx, cy, ru, rv, 0.02, seed, 16, 0.14);
  k.poly(pts, k.lgrad([cx - ru, cy - rv, 0], [cx + ru, cy + rv, 0], [1, -1, 0], [[0, '#d5f0fb'], [1, '#93c9e8']]), 0);
  k.pen.beginPath();
  k.trace(pts);
  k.pen.strokeStyle = '#6f9cc8';
  k.pen.lineWidth = Math.max(0.7, 0.08 * k.s);
  k.pen.stroke();
  k.line([[cx - ru * 0.45, cy - rv * 0.1, 0.03], [cx + ru * 0.05, cy - rv * 0.55, 0.03]], '#ffffffc0', Math.max(0.8, 0.12 * k.s));
  k.line([[cx - ru * 0.1, cy + rv * 0.2, 0.03], [cx + ru * 0.25, cy - rv * 0.15, 0.03]], '#ffffff90', Math.max(0.7, 0.09 * k.s));
}

// Pairs of boot prints from (x0, y0) toward (x1, y1), fading out of the
// path (added to the current path).
function footprints(k: Kit, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const len = Math.hypot(x1 - x0, y1 - y0);
  if (len < 4) return;
  const du = (x1 - x0) / len;
  const dv = (y1 - y0) / len;
  for (let d = 2, i = 0; d < len - 3; d += 1.5, i++) {
    const side = i & 1 ? 0.45 : -0.45;
    const wig = Math.sin(d * 0.21 + seed) * 1.2;
    const cx = x0 + du * d - dv * (side + wig);
    const cy = y0 + dv * d + du * (side + wig);
    const pts: P3[] = [];
    for (let j = 0; j < 8; j++) {
      const a = (j / 8) * Math.PI * 2;
      pts.push([cx + du * Math.cos(a) * 0.5 - dv * Math.sin(a) * 0.26, cy + dv * Math.cos(a) * 0.5 + du * Math.sin(a) * 0.26, 0.02]);
    }
    k.trace(pts);
  }
}

// The frozen pond the fishing hole is cut in: a bank of snow round clear
// blue ice, darker where it is deep, cracked, a few bubbles caught in it.
function pond(k: Kit, cu: number, cv: number, ru: number, rv: number, seed: number): void {
  const { pen, s } = k;
  k.shadow(cu, cv, ru * 1.05, rv * 1.05, 0.14);
  k.poly(oval(cu, cv, ru + 1.1, rv + 1.0, 0.04, seed, 28, 0.06), C.snow, k.thin);
  const ice = oval(cu, cv, ru, rv, 0.06, seed, 28, 0.06);
  k.poly(ice, k.lgrad([cu - ru, cv - rv, 0], [cu + ru, cv + rv, 0], [1, -1, 0], [[0, '#c9edfb'], [0.5, '#8fcbec'], [1, '#5c9fd6']]), k.thin);
  pen.save();
  pen.beginPath();
  k.trace(ice);
  pen.clip();
  // deep water under clear ice
  k.poly(oval(cu + ru * 0.12, cv + rv * 0.1, ru * 0.55, rv * 0.5, 0.07, seed + 1, 18, 0.12), '#3f7fbf88', 0);
  k.poly(oval(cu + ru * 0.18, cv + rv * 0.12, ru * 0.3, rv * 0.26, 0.07, seed + 2, 14, 0.12), '#2b5f9c77', 0);
  // cracks
  pen.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = hash(seed, i, 61) * Math.PI * 2;
    let u = cu + Math.cos(a) * ru * 0.25;
    let w = cv + Math.sin(a) * rv * 0.25;
    const pts: P3[] = [[u, w, 0.08]];
    for (let j = 0; j < 4; j++) {
      u += Math.cos(a + (hash(seed, i, j) - 0.5) * 1.2) * ru * 0.2;
      w += Math.sin(a + (hash(seed, i, j + 9) - 0.5) * 1.2) * rv * 0.2;
      pts.push([u, w, 0.08]);
    }
    k.run(pts);
  }
  pen.strokeStyle = '#eaf8ffc0';
  pen.lineWidth = Math.max(0.7, 0.08 * s);
  pen.stroke();
  // bubbles
  pen.beginPath();
  for (let i = 0; i < 9; i++) {
    const e = k.ell(cu + (hash(seed, i, 71) - 0.5) * ru * 1.4, cv + (hash(seed, i, 72) - 0.5) * rv * 1.2, 0.08, 0.18 + hash(seed, i, 73) * 0.22);
    pen.moveTo(e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.rx, 0, 0, Math.PI * 2);
  }
  pen.strokeStyle = '#e6f7fdb0';
  pen.lineWidth = Math.max(0.6, 0.06 * s);
  pen.stroke();
  // gloss
  for (const [f, a] of [[-0.3, 0.75], [0.05, 0.5]] as const) k.line([[cu - ru * 0.55, cv + rv * f, 0.08], [cu - ru * 0.05, cv + rv * (f - 0.55), 0.08]], `#ffffff${Math.round(a * 255).toString(16)}`, Math.max(0.9, 0.18 * s));
  pen.restore();
  // snow blown over the ice at the edge
  for (let i = 0; i < 3; i++) {
    const a = 2.2 + i * 1.7 + hash(seed, i, 81);
    k.poly(oval(cu + Math.cos(a) * ru * 0.8, cv + Math.sin(a) * rv * 0.8, 1.6, 0.9, 0.09, seed + i, 10, 0.2), C.snow, 0);
  }
}

// Rock melted bare round the fire, wet and dark near it.
function hearthGround(k: Kit, cu: number, cv: number): void {
  k.poly(oval(cu, cv, 6.2, 5.6, 0.03, 5, 22, 0.1), k.lgrad([cu - 6, cv - 6, 0], [cu + 6, cv + 6, 0], [1, -1, 0], [[0, '#a8b2c2'], [1, '#848ea2']]), 0);
  k.poly(oval(cu, cv, 4.3, 3.9, 0.04, 6, 18, 0.12), '#6f7789', 0);
  k.pen.beginPath();
  k.trace(oval(cu, cv, 6.2, 5.6, 0.03, 5, 22, 0.1));
  k.pen.strokeStyle = '#eef4fbc0';
  k.pen.lineWidth = Math.max(0.8, 0.2 * k.s);
  k.pen.stroke();
}

// ── walls ──────────────────────────────────────────────────────────────────

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const seed = wall === 'right' ? 1 : 2;
  const fs = plan.features.filter((f) => f.wall === wall);
  // Glacier ice: pale low down where the snow and the lamps light it, a
  // deep blue up in the dark.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, 0, H, GLACIER.map(([t, c]) => [t, tone(c)] as const)), 0);
  k.poly([[T, 0, 0], [T + 12, 0, 0], [T + 12, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 12, 0, 0], [[0, '#0b163040'], [1, '#0b163000']]), 0);
  // light seen through the ice in tall soft bands
  pen.save();
  pen.globalCompositeOperation = 'screen';
  for (let i = 0; i < Math.round((end - T) / 18); i++) {
    const a = T + 4 + hash(i, seed, 1) * (end - T - 8);
    const w = 3 + hash(i, seed, 2) * 6;
    const z1 = H * (0.45 + hash(i, seed, 3) * 0.45);
    if (!k.seen([[a - w / 2, 0, 0], [a + w / 2 + w * 0.3, 0, z1]])) continue;
    k.poly([[a - w / 2, 0, 0], [a + w / 2, 0, 0], [a + w / 2 + w * 0.3, 0, z1], [a - w / 2 + w * 0.3, 0, z1]], k.hgrad([a - w / 2, 0, 0], [a + w / 2, 0, 0], [[0, '#9fdcff00'], [0.5, '#9fdcff26'], [1, '#9fdcff00']]), 0);
  }
  pen.restore();
  facets(k, v, end, seed);
  // A footing of rock along the bottom.
  const top: P3[] = [];
  for (let a = end; a >= T - 0.01; a -= 1.5) top.push([Math.max(T, a), 0, 2.4 + wave(a * 0.33, seed * 5) * 4.8]);
  k.poly([[T, 0, 0], [end, 0, 0], ...top], k.vgrad(T, 0, 0, 7, [[0, tone(C.rockDark)], [1, tone(C.rock)]]), 0);
  pen.beginPath();
  for (let i = 0; i < Math.round((end - T) / 6); i++) {
    const a = T + 1 + hash(i, seed, 15) * (end - T - 2);
    const zt = 2.4 + wave(a * 0.33, seed * 5) * 4.8;
    k.run([[a, 0, zt], [a + (hash(i, seed, 16) - 0.5) * 1.5, 0, zt * 0.55], [a + (hash(i, seed, 17) - 0.5) * 2, 0, 0]]);
  }
  pen.strokeStyle = withAlpha(INK, 0.55);
  pen.lineWidth = Math.max(0.7, 0.08 * s);
  pen.stroke();
  k.line(top.map(([a, n, z]) => [a, n, z - 0.4] as P3), tone(C.rockHi), Math.max(0.8, 0.16 * s));
  k.line(top, INK, k.thin);
  // Frozen flows hanging from the top, clear of the falls.
  const busy = fs.filter((f) => f.kind === 'falls').map((f) => [f.a - f.w / 2 - 3, f.a + f.w / 2 + 3] as const);
  let a = T + 3 + hash(seed, 21) * 6;
  for (let i = 0; a < end - 4; i++) {
    const w = 3 + hash(i, seed, 22) * 4;
    if (!busy.some(([a0, a1]) => a + w / 2 > a0 && a - w / 2 < a1) && k.seen([[a - w, 0, H], [a + w, 0, H * 0.5]])) drape(k, a, w, H - 0.6, H * (0.12 + hash(i, seed, 23) * 0.3), seed * 100 + i, tone);
    a += w + 7 + hash(i, seed, 24) * 14;
  }
  for (const f of fs) {
    if (!near(k, v, f)) continue;
    if (f.kind === 'falls') fallsFace(k, v, f, tone);
    else if (f.kind === 'window') iceWindow(k, f, tone);
    else if (f.kind === 'pelt') pelt(k, f);
    else if (f.kind === 'shelf') shelf(k, f);
    else if (f.kind === 'lantern') wallLantern(k, f);
  }
  cornice(k, v, end, seed, busy, tone);
  // Frost glinting here and there on the ice.
  for (let i = 0; i < Math.round((end - T) / 9); i++) {
    const [x, y] = k.p(T + 2 + hash(i, seed, 31) * (end - T - 4), 0, 9 + hash(i, seed, 32) * (H - 14));
    sparkle(pen, x, y, (0.35 + hash(i, seed, 33) * 0.45) * s, '#f2fbffd0');
  }
}

// The glacier's face in big flat facets, as ice breaks: each a shade
// lighter or darker than the ice round it, frost along its edges.
function facets(k: Kit, v: RoomView, end: number, seed: number): void {
  const { pen, s } = k;
  const { T, H } = v;
  const cw = 11;
  const ch = 9;
  const cols = Math.ceil((end - T) / cw);
  const rows = Math.ceil(H / ch);
  const node = (i: number, j: number): P3 => {
    const a = T + i * cw + (i > 0 && i < cols ? (hash(i, j, seed * 5) - 0.5) * cw * 0.7 : 0);
    const z = j * ch + (j > 0 && j < rows ? (hash(i, j, seed * 5 + 1) - 0.5) * ch * 0.6 : 0);
    return [Math.min(end, a), 0, Math.min(H, z)];
  };
  const tints: Array<[Color, P3[][]]> = [['#ffffff14', []], ['#ffffff09', []], ['#0a1a4012', []], ['#0a1a4020', []]];
  const edges: P3[][] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const [p, q, r, t] = [node(i, j), node(i + 1, j), node(i + 1, j + 1), node(i, j + 1)];
      if (!k.seen([p, q, r, t])) continue;
      const flip = hash(i, j, seed * 5 + 2) < 0.5;
      const tris = flip ? [[p, q, r], [p, r, t]] : [[p, q, t], [q, r, t]];
      tris.forEach((tri, n) => {
        const h = hash(i, j * 2 + n, seed * 5 + 3);
        if (h < 0.6) tints[Math.floor(h / 0.15)][1].push(tri);
      });
      edges.push(flip ? [p, r] : [q, t], [t, p], [p, q]);
    }
  }
  for (const [c, list] of tints) {
    pen.beginPath();
    for (const tri of list) k.trace(tri);
    pen.fillStyle = c;
    pen.fill();
  }
  pen.beginPath();
  for (const e of edges) k.run(e);
  pen.strokeStyle = '#d6f2ff30';
  pen.lineWidth = Math.max(0.7, 0.1 * s);
  pen.stroke();
  // a couple of bands of old snow caught in the ice, low down
  for (const [z0, c] of [[13 + (seed & 1) * 3, '#c4ecfa40'], [24 + (seed & 1) * 2, '#17325e40']] as const) {
    if (z0 > H - 6) continue;
    const pts: P3[] = [];
    for (let a = T; a <= end; a += 4) pts.push([a, 0, z0 + (wave(a * 0.3, seed + z0) - 0.5) * 1.4]);
    k.line(pts, c, Math.max(0.9, 0.3 * s));
  }
}

// True if a wall piece (or what it lays on the floor before it) touches
// the canvas.
function near(k: Kit, v: RoomView, f: Feature): boolean {
  const z1 = f.kind === 'falls' ? v.H + 1 : 22;
  return k.seen([[f.a - f.w / 2 - 3, 0, 0], [f.a + f.w / 2 + 3, 0, 0], [f.a - f.w / 2 - 3, 0, z1], [f.a + f.w / 2 + 3, 0, z1], [f.a, 12, 0]]);
}

// A frozen flow hanging from the top of the wall: a curtain of ice with
// drips of different lengths along its foot.
function drape(k: Kit, a: number, w: number, ztop: number, len: number, seed: number, tone: (c: Color, d?: number) => Color): void {
  const n = 0.15;
  const drips = 2 + Math.floor(hash(seed, 1) * 3);
  const bottom: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const x = a - w / 2 + w * t;
    let d = 0.25;
    for (let j = 0; j < drips; j++) {
      const c = (j + 0.5) / drips + (hash(seed, j, 2) - 0.5) * 0.15;
      const r = 0.6 / drips;
      const q = 1 - ((t - c) / r) ** 2;
      if (q > 0) d = Math.max(d, (0.45 + hash(seed, j, 3) * 0.55) * Math.sqrt(q));
    }
    const edge = Math.min(1, t * 6, (1 - t) * 6);
    bottom.push([x, n, ztop - len * d * edge - 0.4]);
  }
  k.poly([[a - w / 2 - 0.3, n, ztop], ...bottom, [a + w / 2 + 0.3, n, ztop]], k.vgrad(a, n, ztop - len, ztop, [[0, tone(C.iceHi)], [1, tone('#7fc0e6')]]), k.thin);
  k.line([[a - w * 0.25, n, ztop - 0.5], [a - w * 0.22, n, ztop - len * 0.55]], '#ffffff70', Math.max(0.8, 0.16 * k.s));
}

// Snow lying along the top of the wall, its lumpy edge over the face, and
// icicles under it (the falls pour over in a gap).
function cornice(k: Kit, v: RoomView, end: number, seed: number, gaps: ReadonlyArray<readonly [number, number]>, tone: (c: Color, d?: number) => Color): void {
  const { T, H } = v;
  const runs: Array<[number, number]> = [];
  let a0 = T;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 + 3 > a0) runs.push([a0, g0 + 3]);
    a0 = Math.max(a0, g1 - 3);
  }
  if (end > a0) runs.push([a0, end]);
  const lip = (a: number) => H - 1.0 - 0.9 * wave(a * 0.7, seed * 3);
  for (const [r0, r1] of runs) {
    icicles(k, r0 + 0.4, r1 - 0.4, 0.4, H - 1.3, 4.8, seed * 31 + Math.round(r0), 1.0);
    const pts: P3[] = [[r0, 0.45, H + 0.05], [r1, 0.45, H + 0.05]];
    for (let a = r1; a >= r0 - 0.01; a -= 0.8) pts.push([Math.max(r0, a), 0.45, lip(a)]);
    k.poly(pts, k.vgrad(r0, 0.45, H - 2, H, [[0, tone(C.snowMid)], [1, tone(C.snowHi, 0.08)]]), k.thin);
  }
}

// ── wall pieces ────────────────────────────────────────────────────────────

// A frozen waterfall: the water came over the top of the wall and froze as
// it fell, in fat columns of pale ice down a dark cleft.
function fallsFace(k: Kit, v: RoomView, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const H = v.H;
  const { a, w } = f;
  const left: P3[] = [];
  const right: P3[] = [];
  for (let z = H; z >= -0.01; z -= 2) {
    const t = z / H;
    left.push([a - w * (0.32 + 0.12 * t) - (wave(z, f.k) - 0.5) * 1.2, 0.03, Math.max(0, z)]);
    right.push([a + w * (0.32 + 0.12 * t) + (wave(z, f.k + 3) - 0.5) * 1.2, 0.03, Math.max(0, z)]);
  }
  k.poly([...left, ...right.reverse()], k.vgrad(a, 0, 0, H, [[0, '#2a4f86'], [1, '#132548']]), k.thin);
  const cols: Array<{ c: number; cw: number; n: number; zb: number; i: number }> = [];
  const nc = 6;
  for (let i = 0; i < nc; i++) {
    const c = a - w * 0.36 + ((i + 0.5) * (w * 0.72)) / nc + (hash(f.k, i, 1) - 0.5) * 0.8;
    cols.push({ c, cw: ((w * 0.72) / nc) * (1.15 + hash(f.k, i, 2) * 0.5), n: 0.3 + hash(f.k, i, 3) * 1.1, zb: 0.6 + hash(f.k, i, 4) * 2.2, i });
  }
  cols.sort((p, q) => p.n - q.n);
  for (const { c, cw, n, zb, i } of cols) {
    const l: P3[] = [];
    const r: P3[] = [];
    for (let z = H + 0.2; z >= zb + 0.5; z -= 1.2) {
      const b = 1 + 0.16 * Math.sin(z * 0.45 + i * 1.3) + 0.08 * Math.sin(z * 1.3 + i);
      l.push([c - (cw / 2) * b, n, z]);
      r.push([c + (cw / 2) * b * (1 - 0.06 * Math.sin(z * 0.7 + i)), n, z]);
    }
    const foot: P3[] = [];
    for (let j = 1; j < 6; j++) {
      const th = Math.PI * (j / 6);
      foot.push([c - (cw / 2) * Math.cos(th), n, zb + 0.5 - Math.sin(th) * 0.9]);
    }
    k.poly([...l, ...foot, ...r.reverse()], k.hgrad([c - cw / 2, n, zb], [c + cw / 2, n, zb], [[0, tone('#eaf8fd', 0.06)], [0.3, tone('#b8e4f7')], [0.75, tone('#80c2e9')], [1, tone('#5d9fd6')]]), k.thin);
    k.line([[c - cw * 0.22, n, H - 0.6], [c - cw * 0.18, n, zb + 1.4]], '#ffffff80', Math.max(0.8, 0.14 * k.s));
  }
  // the ice lip where it pours over the top
  k.poly([[a - w * 0.46, 0.5, H + 0.05], [a + w * 0.46, 0.5, H + 0.05], [a + w * 0.4, 0.5, H - 1.4], [a, 0.5, H - 0.9], [a - w * 0.4, 0.5, H - 1.5]], tone(C.iceHi), k.thin, 0.3);
}

// An ice window: a porthole of clear deep ice in a rim of frost, a fish
// caught swimming in it, bubbles round it.
function iceWindow(k: Kit, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const a = f.a;
  const cz = 11.5;
  const rw = 3.6;
  const rh = 4.3;
  k.shadow(a, 0.2, rw + 0.6, 0.8, 0.12, cz - rh - 0.8);
  const rim: P3[] = [];
  const inner: P3[] = [];
  for (let i = 0; i < 26; i++) {
    const th = (i / 26) * Math.PI * 2;
    const j = 1 + 0.06 * Math.sin(th * 5 + f.k);
    rim.push([a + Math.cos(th) * (rw + 1.0) * j, 0.04, cz + Math.sin(th) * (rh + 1.0) * j]);
    inner.push([a + Math.cos(th) * rw, 0.06, cz + Math.sin(th) * rh]);
  }
  k.poly(rim, tone(C.frost, 0.1), k.lw);
  const [x, y] = k.p(a, 0.06, cz);
  const g = pen.createRadialGradient(x - rw * 0.2 * s, y - rh * 0.2 * s, 0, x, y, rh * s * 1.1);
  g.addColorStop(0, '#2e5f9a');
  g.addColorStop(0.7, '#1d3d6e');
  g.addColorStop(1, '#3d76b2');
  k.poly(inner, g, k.thin);
  pen.save();
  pen.beginPath();
  k.trace(inner);
  pen.clip();
  // the fish, nose to -u, caught mid-turn
  const fz = cz + 0.4;
  const fu = a + 0.3;
  const P = (du: number, dz: number): P3 => [fu + du, 0.07, fz + dz];
  k.poly([P(2.0, 0), P(2.9, 0.9), P(2.75, 0), P(2.9, -0.9)], '#7d9cba', k.thin * 0.8);
  k.poly([P(-2.1, 0.1), P(-1.4, 0.75), P(0.2, 0.95), P(1.6, 0.5), P(2.1, 0), P(1.6, -0.45), P(0.2, -0.75), P(-1.4, -0.6)], k.vgrad(fu, 0.07, fz - 0.8, fz + 0.9, [[0, '#b9cddd'], [0.6, '#8eaac4'], [1, '#6c8cad']]), k.thin * 0.8, 0.2);
  k.poly([P(-0.2, 0.9), P(0.6, 1.5), P(1.0, 0.75)], '#6c8cad', k.thin * 0.7);
  const [ex, ey] = k.p(...P(-1.35, 0.2));
  pen.beginPath();
  pen.arc(ex, ey, Math.max(0.8, 0.17 * s), 0, Math.PI * 2);
  pen.fillStyle = INK;
  pen.fill();
  // bubbles
  pen.beginPath();
  for (let i = 0; i < 7; i++) {
    const [bx, by] = k.p(a - 2.6 + hash(f.k, i, 1) * 1.6, 0.07, cz + 1 + i * 0.45 + hash(f.k, i, 2) * 0.3);
    const r = (0.12 + hash(f.k, i, 3) * 0.16) * s;
    pen.moveTo(bx + r, by);
    pen.arc(bx, by, r, 0, Math.PI * 2);
  }
  pen.strokeStyle = '#cfefffc0';
  pen.lineWidth = Math.max(0.6, 0.06 * s);
  pen.stroke();
  // gloss across the glassy ice
  k.line([[a - rw * 0.7, 0.08, cz + rh * 0.1], [a - rw * 0.15, 0.08, cz + rh * 0.8]], '#ffffff55', Math.max(1, 0.32 * s));
  k.line([[a - rw * 0.25, 0.08, cz - rh * 0.4], [a + rw * 0.2, 0.08, cz + rh * 0.25]], '#ffffff30', Math.max(0.8, 0.18 * s));
  pen.restore();
  // frost feathering the rim
  icicles(k, a - rw * 0.8, a + rw * 0.8, 0.3, cz - rh - 0.6, 1.6, f.k, 0.7);
}

// A pelt stretched on a frame of lashed poles, hung on a peg.
function pelt(k: Kit, f: Feature): void {
  const a = f.a;
  const n = 0.45;
  const z0 = 7.5;
  const z1 = 16;
  const hw = 3.1;
  k.shadow(a + 0.3, 0.3, hw + 0.5, 0.6, 0.12, z0 - 0.5);
  // the hide: head up, four legs out to the corners, the tail down
  const P = (du: number, z: number): P3 => [a + du, n, z];
  const hide: P3[] = [P(0, z1 - 0.3), P(0.9, z1 - 1.0), P(1.4, z1 - 2.2), P(2.6, z1 - 1.6), P(2.2, z1 - 3.4), P(1.7, z0 + 3.4), P(2.5, z0 + 1.6), P(1.4, z0 + 1.4), P(0.4, z0 + 0.8), P(0.1, z0 - 0.2), P(-0.4, z0 + 0.8), P(-1.4, z0 + 1.4), P(-2.5, z0 + 1.6), P(-1.7, z0 + 3.4), P(-2.2, z1 - 3.4), P(-2.6, z1 - 1.6), P(-1.4, z1 - 2.2), P(-0.9, z1 - 1.0)];
  const [cx, cy] = k.p(a, n, (z0 + z1) / 2);
  const g = k.pen.createRadialGradient(cx - 0.4 * k.s, cy - 0.8 * k.s, 0, cx, cy, 4.6 * k.s);
  const tawny = hash(f.k, 1) < 0.5;
  g.addColorStop(0, tawny ? C.furLight : C.furWhite);
  g.addColorStop(0.55, tawny ? C.fur : '#cfc9bf');
  g.addColorStop(1, tawny ? C.furDark : C.furGrey);
  k.poly(hide, g, k.lw, 0.35);
  // lacing to the frame
  const lace: Array<[P3, P3]> = [
    [P(2.5, z1 - 1.7), P(hw, z1 - 0.6)],
    [P(-2.5, z1 - 1.7), P(-hw, z1 - 0.6)],
    [P(2.4, z0 + 1.7), P(hw, z0 + 0.6)],
    [P(-2.4, z0 + 1.7), P(-hw, z0 + 0.6)],
    [P(0, z1 - 0.4), P(0, z1 + 0.1)],
  ];
  for (const [p, q] of lace) k.line([p, q], C.rope, Math.max(0.8, 0.1 * k.s));
  // the frame
  k.rod([P(-hw - 0.4, z1 + 0.1), P(hw + 0.4, z1 + 0.1)], C.woodDark, 0.22);
  k.rod([P(-hw - 0.4, z0 + 0.6), P(hw + 0.4, z0 + 0.6)], C.woodDark, 0.22);
  k.rod([P(-hw, z0 + 0.1), P(-hw, z1 + 0.6)], C.wood, 0.22);
  k.rod([P(hw, z0 + 0.1), P(hw, z1 + 0.6)], C.wood, 0.22);
  // hung from a peg in the ice
  k.line([P(-1.2, z1 + 0.1), P(0, z1 + 1.6), P(1.2, z1 + 0.1)], C.rope, Math.max(0.8, 0.1 * k.s));
  k.rod([[a, 0, z1 + 1.7], [a, 0.6, z1 + 1.6]], C.iron, 0.18);
}

// A plank shelf on pegs: tins, a jar of jam, a folded blanket and a candle,
// mittens and a scarf hung on hooks under it.
function shelf(k: Kit, f: Feature): void {
  const a = f.a;
  const w = f.w;
  const z = 12;
  k.shadow(a, 0.4, w * 0.5, 0.8, 0.14, z - 0.5);
  for (const du of [-w / 2 + 1.2, w / 2 - 1.2]) k.rod([[a + du, 0, z - 0.2], [a + du, 1.2, z - 0.2]], C.woodDark, 0.25);
  k.box(a - w / 2, 0, z, w, 1.6, 0.45, C.wood);
  const zt = z + 0.45;
  let u = a - w / 2 + 0.9;
  const tins = [C.wool, C.teal, C.mustard];
  for (let i = 0; i < 3; i++) {
    k.cyl(u, 0.8, zt, 0.45, 1.0 + hash(f.k, i, 1) * 0.5, tins[(i + f.k) % 3]);
    u += 1.05;
  }
  k.cyl(u + 0.2, 0.8, zt, 0.55, 1.4, '#d6e6ea');
  k.cyl(u + 0.2, 0.8, zt + 0.1, 0.45, 0.95, C.woolDark, { line: 0 });
  k.cyl(u + 0.2, 0.8, zt + 1.4, 0.6, 0.25, C.canvas);
  u += 1.6;
  k.box(u, 0.25, zt, 2.4, 1.2, 0.9, C.wool, { round: 0.15 });
  k.line([[u, 1.45, zt + 0.45], [u + 2.4, 1.45, zt + 0.45], [u + 2.4, 0.25, zt + 0.45]], C.mustard, Math.max(0.8, 0.14 * k.s));
  const cu = a + w / 2 - 0.8;
  k.cyl(cu, 0.8, zt, 0.28, 0.9, '#f3ead6');
  const [fx, fy] = k.p(cu, 0.8, zt + 1.3);
  k.pen.beginPath();
  k.pen.ellipse(fx, fy, 0.15 * k.s, 0.3 * k.s, 0, 0, Math.PI * 2);
  k.pen.fillStyle = C.flame;
  k.pen.fill();
  k.halo(cu, 0.8, zt + 1.3, 1.8, '#ffc070', 0.45);
  // under it: a pair of mittens and a striped scarf
  const hz = z - 0.6;
  for (const du of [-1.6, -0.4]) {
    k.rod([[a + du, 0, hz], [a + du, 0.5, hz]], C.iron, 0.1);
    k.poly([[a + du - 0.45, 0.5, hz - 0.1], [a + du + 0.45, 0.5, hz - 0.1], [a + du + 0.55, 0.5, hz - 1.6], [a + du + 0.1, 0.5, hz - 2.2], [a + du - 0.5, 0.5, hz - 1.8]], C.wool, k.thin, 0.25);
    k.line([[a + du - 0.45, 0.52, hz - 0.45], [a + du + 0.45, 0.52, hz - 0.45]], C.furWhite, Math.max(0.8, 0.2 * k.s));
  }
  k.rod([[a + 1.6, 0, hz], [a + 1.6, 0.5, hz]], C.iron, 0.1);
  k.poly([[a + 1.2, 0.5, hz], [a + 2.0, 0.5, hz], [a + 2.1, 0.5, hz - 4.2], [a + 1.3, 0.5, hz - 4.0]], C.teal, k.thin, 0.15);
  for (let i = 0; i < 4; i++) k.line([[a + 1.24, 0.52, hz - 0.8 - i * 0.85], [a + 2.03, 0.52, hz - 0.8 - i * 0.85]], C.furWhite, Math.max(0.8, 0.18 * k.s));
}

// An iron lantern hung from a bracket driven into the ice.
function wallLantern(k: Kit, f: Feature): void {
  const a = f.a;
  const z = 12;
  k.poly([[a - 0.35, 0.02, z - 1.2], [a + 0.35, 0.02, z - 1.2], [a + 0.35, 0.02, z + 0.6], [a - 0.35, 0.02, z + 0.6]], C.iron, k.thin, 0.2);
  k.rod([[a, 0.05, z], [a, 1.3, z], [a, 1.3, z - 0.5]], C.iron, 0.14);
  lantern(k, a, 1.3, z - 2.9, true, 0.85);
}

// What stands at the foot of the wall, on the drifted snow: the falls'
// frozen splash and pool, crystals, skis and poles.
function standing(k: Kit, f: Feature): void {
  if (f.kind !== 'falls' && f.kind !== 'crystals' && f.kind !== 'skis') return;
  if (!k.seen([[f.a - f.w, 0, 0], [f.a + f.w, 12, 0], [f.a - f.w, 0, 16], [f.a + f.w, 0, 16]])) return;
  if (f.kind === 'falls') fallsFoot(k, f);
  else if (f.kind === 'crystals') crystals(k, f);
  else if (f.kind === 'skis') skis(k, f);
}

function fallsFoot(k: Kit, f: Feature): void {
  const { a, w } = f;
  // the pool it froze into
  const cv = 6;
  k.poly(oval(a, cv, w * 0.58 + 0.8, 4.6, 0.03, f.k, 24, 0.07), C.snow, k.thin);
  const ice = oval(a, cv, w * 0.58, 3.8, 0.05, f.k, 24, 0.07);
  k.poly(ice, k.lgrad([a - w * 0.6, cv - 4, 0], [a + w * 0.6, cv + 4, 0], [1, -1, 0], [[0, '#d9f3fc'], [0.55, '#9ad2ef'], [1, '#6aaedd']]), k.thin);
  k.line([[a - w * 0.3, cv - 0.6, 0.06], [a - w * 0.05, cv - 2.6, 0.06]], '#ffffffb0', Math.max(0.9, 0.2 * k.s));
  k.line([[a - w * 0.12, cv + 0.6, 0.06], [a + w * 0.08, cv - 1.0, 0.06]], '#ffffff80', Math.max(0.8, 0.12 * k.s));
  // the splash, heaped up where it landed
  heap(k, a - 2.6, 1.5, 0, 3.3, 3.0, f.k, '#bfe6f8');
  heap(k, a + 2.8, 1.7, 0, 2.8, 2.3, f.k + 1, '#a6daf2');
  heap(k, a + 0.2, 2.4, 0, 2.4, 1.8, f.k + 2, C.iceHi);
  crystal(k, a + 5.4, 1.4, 0.4, 0.45, 2.6, 0.3, 0.15, 0.4);
  crystal(k, a - 5.6, 1.8, 0.4, 0.4, 1.8, -0.35, 0.1, 1.1);
}

// A cluster of ice crystals growing up out of the snow.
function crystals(k: Kit, f: Feature): void {
  const a = f.a;
  const list: Array<{ u: number; v: number; h: number; r: number }> = [];
  for (let i = 0; i < 6; i++) {
    const u = a + (i - 2.5) * 1.05 + (hash(f.k, i, 1) - 0.5) * 0.6;
    const mid = 1 - Math.abs(i - 2.5) / 3;
    list.push({ u, v: 0.9 + hash(f.k, i, 2) * 1.4, h: 1.6 + mid * 4.5 + hash(f.k, i, 3) * 1.5, r: 0.45 + hash(f.k, i, 4) * 0.3 });
  }
  list.sort((p, q) => p.u + p.v - (q.u + q.v));
  heap(k, a, 1.4, 0, 3.6, 1.6, f.k, C.snow, k.thin);
  for (const c of list) crystal(k, c.u, c.v, 0.5, c.r, c.h, (c.u - a) * 0.1, 0.22, c.u);
}

// Two skis and their poles leaning on the wall, snowshoes on a peg above.
function skis(k: Kit, f: Feature): void {
  const a = f.a;
  const ski = (u0: number, color: Color) => {
    const top: P3 = [u0 + 0.7, 0.35, 11];
    const pts: P3[] = [[u0, 2.4, 0.3], [u0 + 0.6, 2.4, 0.3], [top[0] + 0.6, top[1], top[2]], [top[0] + 0.45, top[1] + 0.55, top[2] + 1.0], [top[0], top[1] + 0.2, top[2] + 0.3]];
    k.poly(pts, k.side(color, 0, 1, 0.14), k.lw, 0.2);
    k.line([[u0 + 0.3, 2.35, 0.5], [top[0] + 0.3, top[1] + 0.05, top[2] - 0.2]], shade(color, 0.3), Math.max(0.7, 0.08 * k.s));
    k.poly([[u0 + 0.05, 1.5, 4.2], [u0 + 0.75, 1.5, 4.2], [u0 + 0.8, 1.3, 5.2], [u0 + 0.1, 1.3, 5.2]], C.iron, k.thin);
  };
  ski(a - 2.2, C.wool);
  ski(a - 1.2, C.teal);
  for (const du of [1.1, 2.0]) {
    k.rod([[a + du, 2.6, 0.2], [a + du + 0.45, 0.3, 10.2]], C.ironLight, 0.12);
    k.disc(a + du + 0.05, 2.35, 1.2, 0.45, '#00000000', k.thin);
    k.rod([[a + du + 0.4, 0.4, 9.4], [a + du + 0.45, 0.3, 10.4]], C.woodDeep, 0.22);
  }
  // snowshoes on a peg
  k.rod([[a + 0.4, 0, 14.2], [a + 0.4, 0.7, 14.2]], C.iron, 0.14);
  for (const du of [-0.9, 0.5]) {
    const c: P3 = [a + du + 0.4, 0.5, 12.2];
    const rim: P3[] = [];
    for (let i = 0; i < 16; i++) {
      const th = (i / 16) * Math.PI * 2;
      rim.push([c[0] + Math.cos(th) * 0.8, c[1], c[2] + Math.sin(th) * 1.7 * (Math.sin(th) > 0 ? 1 : 0.8)]);
    }
    k.poly(rim, '#d8c39a', k.lw);
    k.pen.beginPath();
    for (let j = -2; j <= 2; j++) k.run([[c[0] - 0.6, c[1], c[2] + j * 0.5 - 0.3], [c[0] + 0.6, c[1], c[2] + j * 0.5 + 0.3]]);
    k.pen.strokeStyle = withAlpha(C.woodDark, 0.8);
    k.pen.lineWidth = Math.max(0.6, 0.06 * k.s);
    k.pen.stroke();
  }
}

// The light the wall pieces give: lanterns warm on the ice and the snow
// under them, the falls and crystals a cold glow.
function glows(k: Kit, f: Feature): void {
  if (!k.seen([[f.a - f.w - 8, 0, 0], [f.a + f.w + 8, 12, 0], [f.a - f.w - 8, 0, 20], [f.a + f.w + 8, 0, 20]])) return;
  if (f.kind === 'lantern') {
    k.halo(f.a, 1.3, 10.4, 8, '#ffb862', 0.3);
    k.halo(f.a, 1.3, 10.4, 2.6, '#ffe0a0', 0.45);
    k.pool(f.a, 4, 7.5, 5.5, '#ffb44a', 0.24, 0, 'source-over');
  } else if (f.kind === 'falls') {
    k.halo(f.a, 1.5, 7, f.w * 0.7, '#9fdcff', 0.2);
    k.pool(f.a, 6, f.w * 0.7, 6, '#e6f8ff', 0.3, 0, 'source-over');
  } else if (f.kind === 'crystals') {
    k.halo(f.a, 1.5, 3.5, 6, '#8fe0ff', 0.28);
    k.pool(f.a, 3, 6, 4, '#c8f2ff', 0.3, 0, 'source-over');
  }
}

// ── drifts ─────────────────────────────────────────────────────────────────
// Snow banked along the foot of a wall: a slope from a lumpy crest against
// the ice down to the floor, cut away at the gate and the falls.
function drift(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { T } = v;
  const end = wall === 'right' ? v.W : v.D;
  const seed = wall === 'right' ? 7 : 8;
  const cuts: Array<[number, number]> = [];
  for (const q of plan.L.slots) {
    if (q.wall !== wall || q.island || q.kind !== 'entrance') continue;
    const at = wall === 'right' ? q.x0 : q.y0;
    cuts.push([at + SPOT.gate[0] - 0.5, at + SPOT.gate[1] + 0.5]);
  }
  for (const f of plan.features) if (f.wall === wall && f.kind === 'falls') cuts.push([f.a - f.w / 2 + 1, f.a + f.w / 2 - 1]);
  const ease = (a: number) => {
    let m = 1;
    for (const [c0, c1] of cuts) {
      if (a > c0 && a < c1) return 0;
      m = Math.min(m, a <= c0 ? (c0 - a) / 4 : (a - c1) / 4);
    }
    return Math.min(1, Math.max(0, m));
  };
  const hgt = (a: number) => (1.2 + 3.4 * wave(a * 0.21, seed * 3)) * Math.sqrt(ease(a));
  const out = (a: number) => 0.4 + hgt(a) * 1.7;
  // contiguous runs where there is snow
  const runs: Array<[number, number]> = [];
  let start = NaN;
  for (let a = T; a < end + 0.75; a += 0.75) {
    const x = Math.min(a, end);
    const on = x < end && hgt(x) > 0.05;
    if (on && Number.isNaN(start)) start = x;
    if (!on && !Number.isNaN(start)) {
      runs.push([start, x]);
      start = NaN;
    }
  }
  const { pen, s } = k;
  for (const [r0, r1] of runs) {
    const ridge: P3[] = [];
    const foot: P3[] = [];
    for (let a = r0; a <= r1 + 0.01; a += 0.75) {
      const x = Math.min(a, r1);
      ridge.push([x, 0, hgt(x)]);
      foot.push([x, out(x), 0]);
    }
    k.poly([...ridge, ...foot.reverse()], k.vgrad(r0, 0, 0, 4.2, [[0, C.snowMid], [0.55, C.snow], [1, C.snowHi]]), 0);
    // a bright crest halfway down, a blue hollow under it
    k.line(ridge.map(([a, , z]) => [a, out(a) * 0.45, z * 0.55] as P3), '#f4f8fdd0', Math.max(0.8, 0.16 * s));
    k.line(ridge.map(([a, , z]) => [a, out(a) * 0.62, z * 0.4] as P3), '#a7b9d080', Math.max(0.8, 0.2 * s));
    pen.beginPath();
    k.run(foot);
    pen.strokeStyle = withAlpha(INK, 0.5);
    pen.lineWidth = k.thin;
    pen.stroke();
    k.line(ridge, withAlpha(INK, 0.35), k.thin * 0.8);
  }
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen, s } = k;
  const { W, D, H, T } = v;
  // the floor's cut edges: rock under a band of old ice under the snow
  const side = new Kit(pen, frame(v.at, 'left', W, 0), s); // u along y at x = W
  for (const [kk, a0, a1, n, nu, nv] of [[k, T, W, D, 0, 1], [side, T, D, 0, 0, 1]] as const) {
    const face = (z0: number, z1: number, color: Color) => kk.poly([[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]], kk.side(color, nu, nv, 0.2), 0);
    face(-SLAB, 0, C.rockDark);
    face(-1.9, -0.9, C.iceDeep);
    kk.line([[a0, n, -1.9], [a1, n, -1.9]], withAlpha(INK, 0.6), kk.thin * 0.8);
    icicles(kk, a0 + 0.5, a1 - 0.5, n + 0.05, -0.9, 2.2, a1 * 3 + 1, 1.3, C.iceHi);
    const lip: P3[] = [[a0, n + 0.06, 0.05], [a1, n + 0.06, 0.05]];
    for (let a = a1; a >= a0 - 0.01; a -= 1) lip.push([Math.max(a0, a), n + 0.06, -0.55 - 0.55 * wave(a * 0.6, n + 3)]);
    kk.poly(lip, kk.side(C.snow, nu, nv, 0.12), kk.thin);
    kk.poly([[a0, n, -SLAB], [a1, n, -SLAB], [a1, n, 0], [a0, n, 0]], null, k.lw);
  }
  // the walls' cut ends: rock at the foot, the glacier's bands, snow on top
  for (const [kk, n, a0, a1] of [[side, 0, 0, T], [k, D, 0, T]] as const) {
    const lit = kk.lit(0, 1);
    const tone = (c: Color) => (lit ? c : shade(c, -0.2));
    const pts = (z0: number, z1: number): P3[] => [[a0, n, z0], [a1, n, z0], [a1, n, z1], [a0, n, z1]];
    kk.poly(pts(-SLAB, H), kk.vgrad(a0, n, 0, H, GLACIER.map(([t, c]) => [t, tone(shade(c, 0.06))] as const)), 0);
    kk.poly(pts(-SLAB, 4.5), tone(C.rock), 0);
    pen.beginPath();
    for (let z = 9; z < H - 3; z += 6.5) kk.run([[a0, n, z], [a1, n, z + 0.6]]);
    pen.strokeStyle = withAlpha('#17325e', 0.45);
    pen.lineWidth = Math.max(0.8, 0.13 * s);
    pen.stroke();
    kk.poly(pts(H - 1.6, H), tone(C.snow), 0);
    kk.poly(pts(-SLAB, H), null, k.lw);
  }
  // the wall tops, under snow
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], C.snow, k.lw);
  k.line([[0.4, D, H], [0.4, 0.4, H], [W, 0.4, H]], C.snowHi, Math.max(1, 0.25 * s));
  k.line([[T - 0.5, D, H], [T - 0.5, T - 0.5, H], [W, T - 0.5, H]], '#a7b9d0a0', Math.max(1, 0.3 * s));
  // inner edges: the corner
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.45), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

// Frost twinkling high on the walls (above anyone's head, so it never
// paints over a figure), and meltwater glinting down the frozen falls.
function twinkles(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H, t } = v;
  const end = wall === 'right' ? v.W : v.D;
  const seed = wall === 'right' ? 3 : 4;
  const lo = 18;
  if (H - 3 <= lo) return;
  for (let i = 0; i < Math.round((end - T) / 16); i++) {
    const period = 2.6 + hash(i, seed, 1) * 3.4;
    const f = ((t + hash(i, seed, 2) * 10) / period) % 1;
    if (f > 0.2) continue;
    const amp = Math.sin((f / 0.2) * Math.PI);
    const [x, y] = k.p(T + 3 + hash(i, seed, 3) * (end - T - 6), 0.1, lo + hash(i, seed, 4) * (H - 3 - lo));
    const r = (0.7 + hash(i, seed, 5) * 0.6) * s * amp;
    softDot(pen, x, y, r * 2.2, '#bfefff', 0.5 * amp);
    sparkle(pen, x, y, r, '#ffffff');
  }
  for (const f of plan.features) {
    if (f.wall !== wall || f.kind !== 'falls') continue;
    for (let j = 0; j < 3; j++) {
      const span = H - lo;
      const z = H - 1 - ((t * (2.2 + j * 0.7) + hash(f.k, j) * span) % span);
      if (z - 2 < lo) continue;
      const a = f.a + (j - 1) * f.w * 0.22 + 0.4;
      k.line([[a, 1.3, z], [a + 0.05, 1.3, z - 2]], '#ffffffa0', Math.max(0.9, 0.16 * s));
    }
  }
}
