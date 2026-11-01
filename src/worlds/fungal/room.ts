import type { At } from '../../art/iso.ts';
import { frame, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, keepClear, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, SlotKind } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import type { Cap } from './bits.ts';
import { boulder, bracket, candle, clump, crystal, crystals, curve, ribbon, root, shroom, vine } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, Kit, hash, withAlpha } from './kit.ts';

// The caverns' shell: a mossy floor in three greens with bare plum earth
// where feet wear it, pebbles, tufts and little mushrooms off the walkways,
// glowing specks; two walls of rough purple-grey rock in strata, boulders
// bulging out of them, cracks and glowing lichen, moss creeping up from the
// floor and draping over the top, stalactites, roots and vines hanging down.
// Between the stations the walls hold a great amethyst geode, shelf fungi,
// crystal clusters, alcoves with jars, roots breaking through, a seep of
// toxic sludge, burrows with eyes in the dark and hanging glow pods; all
// placed in the free stretches of wall worked out from the same plan the
// stage uses, so nothing hangs behind a bookcase or the tunnel mouth.

type Wall = 'left' | 'right';
type Kind = 'geode' | 'grove' | 'seep' | 'brackets' | 'crystals' | 'niche' | 'roots' | 'lichen' | 'burrow' | 'pod' | 'mother';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
type Bits = {
  patches: Array<{ x: number; y: number; rx: number; ry: number; tone: number; seed: number }>;
  pebbles: Array<{ x: number; y: number; r: number }>;
  tufts: Array<{ x: number; y: number; h: number; tone: number; seed: number }>;
  minis: Array<{ x: number; y: number; seed: number }>;
  specks: Array<{ x: number; y: number; seed: number }>;
  trail: Array<[number, number]>; // the worn path, a point every unit or so
  stones: Array<{ x: number; y: number; r: number; seed: number }>;
};
export type Plan = { L: Layout; features: Feature[]; bits: Bits };

const SLAB = 3; // the floor's thickness, shown along the front cut
const HANG = 23; // nothing hangs from the top of a wall below this (the tallest station is 21)

// The rock's top along a wall, not cut but worn: how far below H it dips
// at a, in soft lumps, none near the back corner or the cut end (they keep
// their full height).
function rimDip(a: number, T: number, end: number, wall: Wall): number {
  const ph = wall === 'right' ? 0.7 : 2.3;
  const ease = (d: number) => {
    const t = Math.max(0, Math.min(1, d / 5));
    return t * t * (3 - 2 * t);
  };
  const d = 1.2 + Math.sin(a * 0.29 + ph) * 1.0 + Math.sin(a * 0.71 + ph * 3) * 0.55 + Math.sin(a * 1.9 + ph) * 0.15;
  return Math.max(0, d) * ease(a - T) * ease(end - a);
}

// The top of a wall at a (H less its dip).
const topOf = (v: { W: number; D: number; H: number; T: number }, wall: Wall) => {
  const end = wall === 'right' ? v.W : v.D;
  return (a: number) => v.H - rimDip(a, v.T, end, wall);
};

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// what grows on the walls between them and what lies on the floor.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'fungal');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const fs = features(L);
  const plan = { L, features: fs, bits: scatter(L, fs) };
  PLANS.set(key, plan);
  if (PLANS.size > 16) PLANS.delete(PLANS.keys().next().value!);
  return plan;
}

const between = (L: Layout, wall: Wall, a0: number, a1: number) => {
  const on = L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? s.x0 : s.y0));
  return on.some((p) => p < a0) && on.some((p) => p >= a1);
};

// The geode's size on a wall H tall: half its width and height (units);
// a small one where no stretch of wall takes the big one, set higher up
// the wall (over a ledge) so it shows over what stands in front.
const geodeR = (H: number) => ({ rw: Math.min(9.5, 5 + H * 0.06), rh: Math.min(13, H * 0.2), lift: 0 });
const SMALL_GEODE = { rw: 4.5, rh: 6, lift: 5 };
const G_SMALL = Math.ceil(SMALL_GEODE.rw * 2.3 + 2);
const geodeOf = (f: Feature, H: number) => (f.w === G_SMALL && f.w < width('geode', H) ? SMALL_GEODE : geodeR(H));
const width = (k: Kind, H: number): number =>
  k === 'geode' ? Math.ceil(geodeR(H).rw * 2.3 + 2) : { grove: 17, seep: 8, brackets: 10, crystals: 9, niche: 10, roots: 12, lichen: 8, burrow: 7, pod: 2, mother: 6 }[k];

// The mother mushroom in the back corner when both walls are bare there
// (and a grove still fits elsewhere); the geode in the longest stretch
// between two stations (else the longest stretch, else a small one); a
// grove in the longest stretch left; then the rest in what is left, a few
// units of bare rock round each, and glow pods hung in the wider gaps.
function features(L: Layout, mother = true): Feature[] {
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= 4) spans.push({ wall, a0, a1 });
    }
  }
  const WIDTH = Object.fromEntries((['geode', 'grove', 'seep', 'brackets', 'crystals', 'niche', 'roots', 'lichen', 'burrow', 'pod', 'mother'] as Kind[]).map((k) => [k, width(k, L.H)])) as Record<Kind, number>;
  const G = WIDTH.geode;
  // The mother mushroom in the back corner, when both walls are bare there.
  const first = (wall: Wall) => spans.find((q) => q.wall === wall && q.a0 <= L.T + 2.5);
  const fr = first('right');
  const fl = first('left');
  if (mother && fr && fl && fr.a1 - fr.a0 >= 12 && fl.a1 - fl.a0 >= 9 && L.H >= 30) {
    // (her cap overhangs the wall higher up than anything hung on it)
    out.push({ wall: 'right', kind: 'mother', a: L.T + WIDTH.mother / 2, w: WIDTH.mother, k: 0 });
    fr.a0 = L.T + WIDTH.mother + 1.5;
    fl.a0 = L.T + 5.5;
  }
  const fits = spans.filter((s) => s.a1 - s.a0 >= G + 2);
  const longest = (list: typeof spans) => [...list].sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
  let pick = longest(fits.filter((s) => between(L, s.wall, s.a0, s.a1))) ?? longest(fits);
  let gw = G;
  if (!pick) {
    // a small geode in the shortest stretch that takes it (the longer ones
    // are left for the groves)
    pick = [...spans].filter((s) => s.a1 - s.a0 >= G_SMALL + 2).sort((p, q) => p.a1 - p.a0 - (q.a1 - q.a0))[0];
    gw = G_SMALL;
  }
  if (pick) {
    const mid = (pick.a0 + pick.a1) / 2;
    out.push({ wall: pick.wall, kind: 'geode', a: mid, w: gw, k: 0 });
    spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: mid - gw / 2 - 3 }, { wall: pick.wall, a0: mid + gw / 2 + 3, a1: pick.a1 });
  }
  // one grove for sure, in the middle of the longest stretch left
  const gr = longest(spans.filter((q) => q.a1 - q.a0 >= WIDTH.grove));
  if (gr) {
    const a = (gr.a0 + gr.a1) / 2;
    out.push({ wall: gr.wall, kind: 'grove', a, w: WIDTH.grove, k: 5 });
    spans.splice(spans.indexOf(gr), 1, { wall: gr.wall, a0: gr.a0, a1: a - WIDTH.grove / 2 - 3 }, { wall: gr.wall, a0: a + WIDTH.grove / 2 + 3, a1: gr.a1 });
  } else if (out.some((f) => f.kind === 'mother')) return features(L, false);
  const ORDER: Kind[] = ['grove', 'brackets', 'crystals', 'roots', 'seep', 'grove', 'niche', 'lichen', 'brackets', 'burrow', 'grove', 'crystals', 'roots', 'lichen', 'niche'];
  const cap: Partial<Record<Kind, number>> = { seep: 2, niche: 3, burrow: 2, roots: 3 };
  const count: Partial<Record<Kind, number>> = {};
  const GAP = 5;
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? GAP : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < (cap[c] ?? Infinity) && room(c)) k = c;
      }
      k ??= room('lichen') ? 'lichen' : undefined;
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? GAP : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      n++;
    }
    if (!kinds.length) {
      if (len >= 3) out.push({ wall: s.wall, kind: 'pod', a: (s.a0 + s.a1) / 2, w: 2, k: n++ });
      continue;
    }
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    const first = out.length;
    kinds.forEach((k, i) => {
      const jit = (hash(n, i, 3) - 0.5) * Math.max(0, gap - GAP) * 0.6;
      out.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2 + jit, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    // Glow pods hung in the gaps wide enough for one.
    for (let i = first; i + 1 < out.length; i++) {
      const p = out[i];
      const q = out[i + 1];
      const free = q.a - q.w / 2 - (p.a + p.w / 2);
      if (free >= 7) out.push({ wall: s.wall, kind: 'pod', a: (p.a + p.w / 2 + q.a - q.w / 2) / 2, w: 2, k: n + i });
    }
  }
  return out;
}

// Each feature's height on its wall (z from, to).
function extent(f: Feature, H: number): [number, number] {
  switch (f.kind) {
    case 'geode': {
      const { rh, lift } = geodeOf(f, H);
      return [1, 2 + rh * 2.3 + lift];
    }
    case 'grove':
      return [0, groveH(H) + 7];
    case 'seep':
      return [0, 19];
    case 'brackets':
      return [5, 8 + bracketTop(H)];
    case 'crystals':
      return [7, 23];
    case 'niche':
      return [9, 22];
    case 'roots':
      return [0, H];
    case 'lichen':
      return [6, 20];
    case 'burrow':
      return [0, 6];
    case 'pod':
      return [H - podLen(f, H) - 3, H];
    case 'mother':
      return [0, motherH(H) + 6];
  }
}

const motherH = (H: number) => Math.min(H - 8, 18 + H * 0.2);
const groveH = (H: number) => 12 + Math.max(0, Math.min(1, (H - 34) / 38)) * 13;
const bracketTop = (H: number) => Math.min(20, H * 0.32);
const podLen = (f: Feature, H: number) => Math.min(H - HANG - 2, 6 + hash(f.k, 7) * 9);

// What lies on the floor: one worn trail from the tunnel mouth through the
// middle of the cave to the geode, stepping stones along it; cushions of
// moss off it, thick by the walls and the stations and sparse out in the
// open (the open floor stays a calm stage); pebbles, and off the walkways
// tufts, little mushrooms and glowing specks.
function scatter(L: Layout, fs: Feature[]): Bits {
  const { W, D, T } = L;
  const keep = keepClear(L);
  const kept = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    return ix >= 0 && iy >= 0 && ix < W && iy < D && keep[ix + W * iy] === 1;
  };
  const out: Bits = { patches: [], pebbles: [], tufts: [], minis: [], specks: [], trail: [], stones: [] };
  // the trail
  const pt = (wall: Wall, a: number, o: number): [number, number] => (wall === 'right' ? [a, T + o] : [T + o, a]);
  const door = L.slots.find((q) => q.kind === 'entrance');
  const geo = fs.find((f) => f.kind === 'geode');
  const h = hub(L);
  if (door && geo) {
    const knots: P3[] = [[door.spot.x, door.spot.y, 0], [h.x, h.y, 0], [...pt(geo.wall, geo.a, 6), 0]];
    const len = knots.slice(1).reduce((m, q, i) => m + Math.hypot(q[0] - knots[i][0], q[1] - knots[i][1]), 0);
    for (const [x, y] of curve(knots, Math.ceil(len))) out.trail.push([x, y]);
    // stepping stones every few units along it, to one side and the other
    for (let i = 2, n = 0; i < out.trail.length - 2; i += 4, n++) {
      const [x0, y0] = out.trail[i - 1];
      const [x1, y1] = out.trail[i + 1];
      const l = Math.hypot(x1 - x0, y1 - y0) || 1;
      const side = (n % 2 ? 1 : -1) * (0.4 + hash(n, 41) * 0.5);
      out.stones.push({ x: out.trail[i][0] - ((y1 - y0) / l) * side, y: out.trail[i][1] + ((x1 - x0) / l) * side, r: 0.6 + hash(n, 42) * 0.3, seed: n });
    }
  }
  const onTrail = (x: number, y: number, m: number) => out.trail.some(([tx, ty]) => Math.abs(tx - x) < m && Math.abs(ty - y) < m);
  // near a wall or a station: where moss grows thick
  const rects = L.slots.map(slotRect);
  const sheltered = (x: number, y: number) => x < T + 12 || y < T + 12 || rects.some((q) => x > q.x0 - 8 && x < q.x1 + 8 && y > q.y0 - 8 && y < q.y1 + 8);
  const CELL = 12;
  for (let cy = T, j = 0; cy < D; cy += CELL, j++) {
    for (let cx = T, i = 0; cx < W; cx += CELL, i++) {
      const h = (q: number) => hash(i, j, q);
      const inside = (x: number, y: number, m: number) => x > T + m && y > T + m && x < W - m && y < D - m;
      const x = cx + (h(2) - 0.25) * CELL * 1.5;
      const y = cy + (h(3) - 0.25) * CELL * 1.5;
      if (h(1) < (sheltered(x, y) ? 0.8 : 0.22)) {
        const rx = 4.5 + h(5) * 5;
        if (inside(x, y, 1.5) && !onTrail(x, y, 3)) out.patches.push({ x, y, rx, ry: rx * (0.55 + h(6) * 0.35), tone: h(4) < 0.5 ? 1 : 0, seed: i * 131 + j });
      }
      for (let n = 0; n < 2; n++) {
        if (hash(i, j, 20 + n) > 0.6) continue;
        const px = cx + hash(i, j, 22 + n) * CELL;
        const py = cy + hash(i, j, 24 + n) * CELL;
        if (inside(px, py, 0.6) && !onTrail(px, py, 1.5)) out.pebbles.push({ x: px, y: py, r: 0.22 + hash(i, j, 26 + n) * 0.35 });
      }
      for (let n = 0; n < Math.floor(h(8) * 3.4); n++) {
        const x = cx + hash(i, j, 50 + n) * CELL;
        const y = cy + hash(i, j, 60 + n) * CELL;
        if (inside(x, y, 0.8) && !kept(x, y) && !onTrail(x, y, 2)) out.tufts.push({ x, y, h: 0.7 + hash(i, j, 70 + n) * 0.7, tone: 0, seed: i * 17 + j * 5 + n });
      }
      if (h(9) < 0.28) {
        const x = cx + h(10) * CELL;
        const y = cy + h(11) * CELL;
        if (inside(x, y, 2) && !kept(x, y) && !kept(x + 1.5, y + 1.5) && !kept(x - 1.5, y - 1.5) && !onTrail(x, y, 2.5)) out.minis.push({ x, y, seed: i * 977 + j * 13 });
      }
      if (h(12) < 0.14) {
        const x = cx + h(13) * CELL;
        const y = cy + h(14) * CELL;
        if (inside(x, y, 1.5) && !kept(x, y)) out.specks.push({ x, y, seed: i * 37 + j * 101 });
      }
    }
  }
  return out;
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, and a look at the geode and at a few of the walls' other
// wonders.
export function fungalPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L);
  const geode = fs.find((f) => f.kind === 'geode');
  if (geode) {
    const face = pt(geode.wall, geode.a, 0);
    out.push({ ...pt(geode.wall, geode.a - 4, 8), kind: 'view', face }, { ...pt(geode.wall, geode.a + 4, 8), kind: 'view', face });
  }
  for (const f of fs.filter((g) => g.kind === 'crystals' || g.kind === 'seep' || g.kind === 'burrow').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
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
      // each face drawn inside its worn top: the room's outline with the
      // rim for this wall's top (what stands out from it into the room is
      // let through, nothing reaches past the corner)
      const wk = new Kit(v.pen, wallAt(v.at, wall, v.T), v.s);
      const end = wall === 'right' ? v.W : v.D;
      const deep = (wall === 'right' ? v.D : v.W) - v.T;
      const top = topOf(v, wall);
      const edge: P3[] = [];
      for (let a = v.T; a < end; a += 1) edge.push([a, 0, top(a)]);
      v.pen.save();
      v.pen.beginPath();
      wk.trace([[v.T, deep, v.H], ...edge, [end, 0, v.H], [end, 0, 0], [end, deep, 0], [v.T, deep, 0]]);
      v.pen.clip();
      wallFace(wk, v, plan, wall);
      v.pen.restore();
    }
    const mother = plan.features.find((f) => f.kind === 'mother');
    if (mother) motherShroom(new Kit(v.pen, wallAt(v.at, mother.wall, v.T), v.s), v, mother);
    shell(k, v);
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

// A lumpy blob of n points round (x, y) on the plane z, in the kit's frame.
function blob(k: Kit, x: number, y: number, z: number, rx: number, ry: number, seed: number, n = 10, sc = 1, dx = 0, dy = 0): void {
  const pts: P3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const j = 0.8 + hash(seed, i, 91) * 0.32;
    pts.push([x + dx + Math.cos(th) * rx * j * sc, y + dy + Math.sin(th) * ry * j * sc, z]);
  }
  k.trace(pts, Math.min(rx, ry) * sc * 0.6);
}

const GROUND = { mid: '#4f7559', hub: '#5a8262', edge: '#3e5f4c', light: '#5f8a63', dark: '#456b55', earth: '#5d4a5c', bump: '#76a06c', stone: '#8d86a0' };

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  const L = plan.L;
  const vis = (x: number, y: number, pad: number) => {
    const [px, py] = k.p(x, y, 0);
    return px + pad >= 0 && py + pad >= 0 && px - pad <= pen.width && py - pad <= pen.height;
  };
  // The ground: moss, a little lighter round the middle of the room, dark
  // toward the back corner and the walls' feet.
  const h = hub(L);
  const [hx, hy] = k.p(h.x, h.y, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(hx, hy, 0, hx, hy, Math.hypot(far[0] - hx, far[1] - hy) * 1.15);
  g.addColorStop(0, GROUND.hub);
  g.addColorStop(0.55, GROUND.mid);
  g.addColorStop(1, GROUND.edge);
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  const { patches, pebbles, tufts, minis, specks } = plan.bits;
  // Broad soft cushions of moss, darker and lighter.
  const pad = 26 * s;
  const tones: Array<[number, Color]> = [[1, withAlpha(GROUND.dark, 0.6)], [0, withAlpha(GROUND.light, 0.7)]];
  for (const [tone, c] of tones) {
    pen.beginPath();
    for (const p of patches) if (p.tone === tone && vis(p.x, p.y, pad)) blob(k, p.x, p.y, 0, p.rx, p.ry, p.seed);
    pen.fillStyle = c;
    pen.fill();
  }
  // the moss's cushions: little cupped arcs, lit on top
  pen.beginPath();
  for (const p of patches) {
    if (!vis(p.x, p.y, pad)) continue;
    for (let i = 0; i < 4; i++) {
      const x = p.x + (hash(p.seed, i, 1) - 0.5) * p.rx * 2.2;
      const y = p.y + (hash(p.seed, i, 2) - 0.5) * p.ry * 2.2;
      const r = (0.45 + hash(p.seed, i, 3) * 0.5) * s;
      const [px, py] = k.p(x, y, 0);
      pen.moveTo(px - r, py);
      pen.quadraticCurveTo(px, py - r * 0.9, px + r, py);
    }
  }
  pen.strokeStyle = withAlpha(GROUND.bump, 0.55);
  pen.lineWidth = Math.max(0.8, 0.13 * s);
  pen.lineCap = 'round';
  pen.stroke();
  // The worn trail: a rim of trodden moss, bare plum earth inside it,
  // stepping stones set along it.
  const { trail, stones } = plan.bits;
  for (const [w, c] of [[2.3, withAlpha(GROUND.bump, 0.4)], [1.8, withAlpha(GROUND.earth, 0.62)]] as const) {
    pen.beginPath();
    trail.forEach(([x, y], i) => {
      if (i % 2 || !vis(x, y, (w * 3 + 2) * s)) return;
      blob(k, x, y, 0, w * (0.9 + hash(i, 43) * 0.25), w * (0.85 + hash(i, 44) * 0.25), i * 3 + 7, 9);
    });
    pen.fillStyle = c;
    pen.fill();
  }
  for (const st of stones) {
    if (!vis(st.x, st.y, 3 * s)) continue;
    k.shadow(st.x + 0.15, st.y + 0.15, st.r * 1.05, st.r * 0.9, 0.2);
    pen.beginPath();
    blob(k, st.x, st.y, 0.12, st.r * 1.2, st.r, st.seed * 5 + 1, 8);
    k.paint(GROUND.stone, k.thin);
    k.line([[st.x - st.r * 0.85, st.y + st.r * 0.1, 0.13], [st.x - st.r * 0.55, st.y - st.r * 0.6, 0.13], [st.x + st.r * 0.1, st.y - st.r * 0.85, 0.13]], '#b9b2cc', Math.max(0.8, 0.14 * s));
  }
  // Worn earth where agents stand to work and round the tunnel mouth.
  for (const sl of L.slots) {
    const kind: SlotKind = sl.kind;
    const r = kind === 'entrance' ? 5.5 : 3.4;
    if (!vis(sl.spot.x, sl.spot.y, r * 2 * s)) continue;
    pen.beginPath();
    blob(k, sl.spot.x, sl.spot.y, 0, r, r * 0.8, sl.x0 * 7 + sl.y0, 12);
    pen.fillStyle = withAlpha(GROUND.earth, 0.6);
    pen.fill();
  }
  // contact shade along the foot of each wall
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 5, 0], [T, 5, 0]], wk.lgrad([0, 0, 0], [0, 5, 0], [1, 0, 0], [[0, '#14081c80'], [0.35, '#14081c30'], [1, '#14081c00']]), 0);
  }
  // Pebbles: one path, a grey-violet line round them.
  pen.beginPath();
  const pe = Math.max(4, s * 2);
  for (const p of pebbles) {
    if (!vis(p.x, p.y, pe)) continue;
    const e = k.ell(p.x, p.y, 0, p.r);
    pen.moveTo(e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy - e.ry * 0.3, e.rx, e.ry * 1.25, 0, 0, Math.PI * 2);
  }
  k.paint(GROUND.stone, Math.max(0.7, k.thin * 0.6), '#4a4458');
  // Tufts of grass off the walkways.
  pen.beginPath();
  for (const t of tufts) {
    if (!vis(t.x, t.y, 3 * s)) continue;
    const [x, y] = k.p(t.x, t.y, 0);
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.42 + (hash(t.seed, i) - 0.5) * 0.25;
      const Lb = t.h * s * (0.7 + hash(t.seed, i, 2) * 0.45);
      const bx = x + (i - 1) * 0.16 * s;
      pen.moveTo(bx - 0.14 * s, y);
      pen.quadraticCurveTo(bx + Math.cos(a) * Lb * 0.4, y + Math.sin(a) * Lb * 0.6, bx + Math.cos(a) * Lb, y + Math.sin(a) * Lb);
      pen.quadraticCurveTo(bx + Math.cos(a) * Lb * 0.5, y + Math.sin(a) * Lb * 0.5, bx + 0.14 * s, y);
      pen.closePath();
    }
  }
  k.paint(C.mossLight, Math.max(0.7, k.thin * 0.55), '#2f5238');
  // Little mushrooms in twos and threes.
  for (const m of minis) {
    if (!vis(m.x, m.y, 6 * s)) continue;
    const kind = hash(m.seed, 1);
    const colors = kind < 0.35 ? [C.capRed] : kind < 0.6 ? [C.capTan, '#d9b27a'] : kind < 0.8 ? [C.capViolet] : [C.glow];
    k.shadow(m.x, m.y, 1.4, 1.2, 0.2);
    clump(k, m.x, m.y, 0, 2 + Math.floor(hash(m.seed, 2) * 2), 0.9, 0.62, colors, m.seed, colors[0] === C.glow);
  }
  // Specks of glowing fungus.
  for (const sp of specks) {
    if (!vis(sp.x, sp.y, 4 * s)) continue;
    k.halo(sp.x, sp.y, 0.1, 2.2, C.glow, 0.26);
    pen.beginPath();
    for (let i = 0; i < 5; i++) {
      const [x, y] = k.p(sp.x + (hash(sp.seed, i) - 0.5) * 1.6, sp.y + (hash(sp.seed, i, 2) - 0.5) * 1.6, 0);
      const r = Math.max(0.9, (0.16 + hash(sp.seed, i, 3) * 0.19) * s);
      pen.moveTo(x + r, y);
      pen.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = C.glowHot;
    pen.fill();
  }
  // Light on the ground: a lantern's warm pool where each agent works, the
  // walls' wonders spilling their glow.
  for (const sl of L.slots) {
    const r = sl.kind === 'idle' ? 12 : sl.kind === 'entrance' ? 9 : 8;
    if (!vis(sl.spot.x, sl.spot.y, r * 2 * s)) continue;
    k.pool(sl.spot.x, sl.spot.y, r, r * 0.85, C.lantern, sl.kind === 'entrance' ? 0.16 : 0.22);
  }
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    const spill: Partial<Record<Kind, [number, number, Color, number]>> = { geode: [16, 11, C.crystal, 0.32], seep: [7, 6, C.sludge, 0.3], crystals: [7, 5, C.crystal, 0.16], lichen: [7, 5, C.glow, 0.14], pod: [5, 4, C.glow, 0.1], grove: [9, 6, C.glow, 0.1] };
    const sp = spill[f.kind];
    if (!sp || !wk.seen([[f.a - sp[0], -sp[1], 0], [f.a + sp[0], -sp[1], 0], [f.a - sp[0], sp[1] * 2, 0], [f.a + sp[0], sp[1] * 2, 0]], 2 * s)) continue;
    wk.pool(f.a, sp[1] * 0.4, sp[0], sp[1], sp[2], sp[3]);
  }
}

// ── walls ──────────────────────────────────────────────────────────────────

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.seen([[T, 0, -1], [end, 0, -1], [end, 12, H + 1], [T, 12, H + 1]], 4 * s)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  const mine = plan.features.filter((f) => f.wall === wall);
  const boxes = mine.map((f) => {
    const [z0, z1] = extent(f, H);
    return { a0: f.a - f.w / 2 - 1, a1: f.a + f.w / 2 + 1, z0: z0 - 1, z1: z1 + 1 };
  });
  const clear = (a: number, z: number, ra: number, rz: number) => !boxes.some((b) => a + ra > b.a0 && a - ra < b.a1 && z + rz > b.z0 && z - rz < b.z1);
  // only the stretch of wall the pen shows
  const [a0, a1] = span(k, T, end, H, s);
  if (a1 <= a0) return;
  // The recesses' dark behind the rock.
  k.poly([[a0, 0, 0], [a1, 0, 0], [a1, 0, H], [a0, 0, H]], k.vgrad(T, 0, 0, H, [[0, tone(C.rockDeep)], [0.6, tone('#221a33')], [1, tone('#160f22')]]), 0);
  const gaps = rock(k, T, end, a0, a1, H, wall, tone);
  // the far corner in shadow
  if (a0 < T + 12) k.poly([[T, 0, 0], [T + 12, 0, 0], [T + 12, 0, H], [T, 0, H]], k.grad([T, 0, 0], [T + 12, 0, 0], [[0, '#14081c60'], [1, '#14081c00']]), 0);
  cracks(k, T, end, a0, a1, H, wall, clear);
  // the dark under the roof, from below halfway up: the upper walls fall
  // into darkness and the glow reads against them
  k.poly([[a0, 0, H * 0.45], [a1, 0, H * 0.45], [a1, 0, H], [a0, 0, H]], k.vgrad(T, 0, H * 0.45, H, [[0, '#120a1a00'], [0.5, '#120a1a70'], [1, '#120a1ad0']]), 0);
  lichenDots(k, T, end, a0, a1, H, wall, gaps, clear);
  rivulets(k, T, end, a0, a1, H, wall, gaps, clear);
  footMoss(k, a0, a1, wall, tone);
  const standing = (f: Feature) => (f.kind === 'grove' ? 1 : 0);
  for (const f of [...mine].sort((p, q) => standing(p) - standing(q))) {
    const [z0, z1] = extent(f, H);
    // how far its pieces and its light reach past its box
    const glow = f.kind === 'geode' ? geodeOf(f, H).rw * 1.6 : f.kind === 'grove' ? 12 : 7;
    const reach = f.kind === 'grove' ? 20 : 9;
    if (!k.seen([[f.a - f.w / 2 - glow, 0, z0 - glow], [f.a + f.w / 2 + glow, reach, z1 + glow], [f.a + f.w / 2 + glow, reach, -1], [f.a - f.w / 2 - glow, reach, -1]], 2 * s)) continue;
    if (f.kind === 'geode') geode(k, v, f, tone);
    else if (f.kind === 'grove') grove(k, v, f);
    else if (f.kind === 'seep') seep(k, f, tone);
    else if (f.kind === 'brackets') brackets(k, v, f);
    else if (f.kind === 'crystals') crystalShelf(k, f, tone);
    else if (f.kind === 'niche') niche(k, f, tone);
    else if (f.kind === 'roots') bigRoots(k, v, f, tone);
    else if (f.kind === 'lichen') lichen(k, f);
    else if (f.kind === 'burrow') burrow(k, f, tone);
  }
  topEdge(k, v, a0, a1, wall, mine, tone);
  for (const f of mine) if (f.kind === 'pod' && k.seen([[f.a - 8, 0, H - podLen(f, H) - 9], [f.a + 8, 3, H]], 2 * s)) pod(k, v, f);
}

// The part [a0, a1] of a wall's run [T, end] that can reach the pen, give
// or take a few units (pieces past it are skipped).
function span(k: Kit, T: number, end: number, H: number, s: number): [number, number] {
  const pen = k.pen;
  const pad = 10 * s;
  let a0 = end;
  let a1 = T;
  const step = Math.max(2, Math.floor(64 / s));
  for (let a = T; a <= end + step; a += step) {
    const u = Math.min(a, end);
    const [x0, y0] = k.p(u, 0, H + 2);
    const [x1, y1] = k.p(u, 14, -1);
    const hit = Math.max(x0, x1) + pad >= 0 && Math.min(x0, x1) - pad <= pen.width && Math.max(y0, y1) + pad >= 0 && Math.min(y0, y1) - pad <= pen.height;
    if (hit) {
      a0 = Math.min(a0, u - step);
      a1 = Math.max(a1, u + step);
    }
  }
  return [Math.max(T, a0), Math.min(end, a1)];
}

// Which way along a wall frame's u runs on screen (+1: screen right).
const rightward = (k: Kit) => (k.p(1, 0, 0)[0] > k.p(0, 0, 0)[0] ? 1 : -1);

// The rock in great bulging lobes from the floor to the roof, the way a
// cavern's walls flow rather than stack: each lobe rounded out (lighter on
// its screen-left side, darker on its right), fluted down its face, its
// foot curving up off the moss, some split part way up into two masses;
// deep dark recesses between them where the cave's darkness lives. Laid
// out the same for every tile (a pure function of the wall), drawn only
// where they can reach the pen.
type Lobe = { e0: number; e1: number; z0: number; z1: number; b0: number; b1: number; top: boolean; tone: number; seed: number };
const LOBES = new Map<string, { lobes: Lobe[]; gaps: number[] }>();

function lobesOf(T: number, end: number, H: number, wall: Wall): { lobes: Lobe[]; gaps: number[] } {
  const key = `${T}|${end}|${H}|${wall}`;
  const hit = LOBES.get(key);
  if (hit) return hit;
  const salt = wall === 'right' ? 1 : 2;
  const lobes: Lobe[] = [];
  const gaps: number[] = [];
  let a = T - 1.5 - hash(salt, 3) * 3;
  for (let j = 0; a < end; j++) {
    const h = (q: number) => hash(j, salt, q);
    const w = 6 + h(10) * 8;
    const gap = 0.8 + h(11) * 0.8;
    const e0 = a;
    const e1 = a + w - gap;
    if (e1 < end) gaps.push(e1 + gap / 2);
    const foot = 0.4 + h(12) * 2.1;
    const bulge = () => 0.4 + h(16) * 0.5;
    const seed = j * 7 + salt;
    if (H > 24 && h(13) < 0.4) {
      // two masses, the upper set over a little
      const zs = H * (0.3 + h(14) * 0.3);
      const sh = (h(15) - 0.5) * 3;
      lobes.push({ e0, e1, z0: foot, z1: zs, b0: bulge(), b1: 0.3 + h(17) * 0.4, top: true, tone: j & 1, seed });
      lobes.push({ e0: e0 + sh, e1: e1 + sh * 0.5, z0: zs + 0.6, z1: H + 1, b0: 0.3 + h(18) * 0.5, b1: 0.3 + h(19) * 0.4, top: false, tone: (j + 1) & 1, seed: seed + 3 });
    } else lobes.push({ e0, e1, z0: foot, z1: H + 1, b0: bulge(), b1: 0.3 + h(17) * 0.4, top: false, tone: j & 1, seed });
    a += w;
  }
  const out = { lobes, gaps };
  LOBES.set(key, out);
  if (LOBES.size > 32) LOBES.delete(LOBES.keys().next().value!);
  return out;
}

// A lobe's outline (up its left side, over its top, down its right side,
// round its rounded foot) and the runs to light and to flute.
function lobeShape(l: Lobe): { pts: P3[]; left: P3[]; right: P3[] } {
  const n = 12;
  const hw = (l.e1 - l.e0) / 2;
  const mid = (l.e0 + l.e1) / 2;
  const foot = Math.min(2.2, hw * 0.5);
  const dome = l.top ? Math.min(2.6, hw * 0.6) : 0;
  const bulge = (t: number) => Math.sin(Math.PI * t) ** 0.7;
  const wob = (t: number, q: number) => Math.sin(t * 6.3 + l.seed * 1.7 + q) * 0.22;
  const z = (t: number) => l.z0 + foot + t * (l.z1 - l.z0 - foot - dome);
  const left: P3[] = [];
  const right: P3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    left.push([l.e0 - l.b0 * bulge(t) + wob(t, 0), 0.02, z(t)]);
    right.push([l.e1 + l.b1 * bulge(t) + wob(t, 2), 0.02, z(t)]);
  }
  const pts: P3[] = [...left];
  for (let i = 1; dome && i < 6; i++) {
    const th = Math.PI - (i / 6) * Math.PI;
    pts.push([mid + Math.cos(th) * hw, 0.02, l.z1 - dome + Math.sin(th) * dome]);
  }
  pts.push(...[...right].reverse());
  for (let i = 1; i < 6; i++) {
    const th = (i / 6) * Math.PI;
    pts.push([mid + Math.cos(th) * hw, 0.02, l.z0 + foot - Math.sin(th) * foot]);
  }
  return { pts, left, right };
}

function rock(k: Kit, T: number, end: number, a0: number, a1: number, H: number, wall: Wall, tone: (c: Color, d?: number) => Color): number[] {
  const { pen, s } = k;
  const r = rightward(k);
  const { lobes, gaps } = lobesOf(T, end, H, wall);
  const FILL = ['#6f6188', '#62567c'];
  for (const l of lobes) {
    if (l.e1 + 2 < a0 || l.e0 - 2 > a1) continue;
    const { pts, left, right } = lobeShape(l);
    // rounded: lit toward the screen-left edge, in shade toward the right
    const [sl, sr] = r > 0 ? [l.e0, l.e1] : [l.e1, l.e0];
    const zm = (l.z0 + l.z1) / 2;
    const base = FILL[l.tone];
    pen.beginPath();
    k.trace(pts, 1.3);
    k.paint(k.hgrad([sl, 0, zm], [sr, 0, zm], [[0, tone(shade(base, 0.1))], [0.4, tone(base)], [1, tone(shade(base, -0.22))]]), k.thin, withAlpha(INK, 0.85));
    // the lit edge
    const lit = r > 0 ? left : right;
    pen.beginPath();
    k.open(lit.slice(1, -1).map(([u, n, z]): P3 => [u + r * 0.32, n, z]));
    pen.strokeStyle = tone(withAlpha('#a598bf', 0.5));
    pen.lineWidth = Math.max(1, 0.3 * s);
    pen.lineCap = 'round';
    pen.lineJoin = 'round';
    pen.stroke();
    // flutes running down its face, and a faint bed of slate across it
    pen.beginPath();
    const nf = l.e1 - l.e0 > 9 ? 3 : 2;
    for (let f = 1; f <= nf; f++) {
      const fr = f / (nf + 1) + (hash(l.seed, f, 21) - 0.5) * 0.12;
      const line: P3[] = [];
      const lo = l.z0 + 2.2 + hash(l.seed, f, 22) * 2;
      const hi = l.z1 - (l.top ? 3 : 2) - hash(l.seed, f, 23) * 4;
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const zz = lo + (hi - lo) * t;
        const li = left[Math.round(((zz - left[0][2]) / (left[left.length - 1][2] - left[0][2] || 1)) * (left.length - 1))] ?? left[0];
        const ri = right[Math.round(((zz - right[0][2]) / (right[right.length - 1][2] - right[0][2] || 1)) * (right.length - 1))] ?? right[0];
        line.push([li[0] + (ri[0] - li[0]) * fr + Math.sin(t * 5 + l.seed + f) * 0.35, 0.03, zz]);
      }
      if (hi - lo > 3) k.open(line);
    }
    pen.strokeStyle = withAlpha(INK, 0.32);
    pen.lineWidth = Math.max(0.8, k.thin * 0.8);
    pen.stroke();
    const zb = H * 0.35 + Math.sin(l.e0 * 0.21) * 1.2;
    if (zb > l.z0 + 2 && zb < l.z1 - 2) k.line([[l.e0 + 0.4, 0.03, zb], [(l.e0 + l.e1) / 2, 0.03, zb - 0.4 + Math.sin(l.seed) * 0.3], [l.e1 - 0.4, 0.03, zb + 0.2]], tone(withAlpha(C.slate, 0.35)), Math.max(1, 0.35 * s));
  }
  return gaps;
}

// Jagged cracks running down the rock.
function cracks(k: Kit, T: number, end: number, a0: number, a1: number, H: number, wall: Wall, clear: (a: number, z: number, ra: number, rz: number) => boolean): void {
  const { pen } = k;
  const salt = wall === 'right' ? 3 : 4;
  pen.beginPath();
  const CA = 14;
  for (let ia = Math.floor(a0 / CA); ia * CA < a1; ia++) {
    if (hash(ia, salt, 1) < 0.5) continue;
    let a = ia * CA + hash(ia, salt, 2) * CA;
    let z = 4 + hash(ia, salt, 3) * (H - 10);
    if (a < T + 3 || a > end - 4 || !clear(a, z - 3, 1.5, 3.5)) continue;
    const pts: P3[] = [[a, 0.06, z]];
    const n = 3 + Math.floor(hash(ia, salt, 4) * 3);
    for (let i = 0; i < n; i++) {
      a += (hash(ia, i, 5 + salt) - 0.5) * 2.2;
      z -= 0.8 + hash(ia, i, 6 + salt) * 1.6;
      pts.push([a, 0.06, z]);
    }
    k.open(pts);
    const m = pts[1 + Math.floor(n / 2)];
    k.open([m, [m[0] + (hash(ia, salt, 7) < 0.5 ? -1 : 1) * 1.3, 0.06, m[2] - 0.9]]);
  }
  pen.strokeStyle = withAlpha(INK, 0.7);
  pen.lineWidth = Math.max(0.8, k.thin * 0.8);
  pen.lineJoin = 'round';
  pen.lineCap = 'round';
  pen.stroke();
}

// Colonies of glowing lichen, most of them in the recesses between the
// lobes where the damp is, big enough to read across the room.
function lichenDots(k: Kit, T: number, end: number, a0: number, a1: number, H: number, wall: Wall, gaps: number[], clear: (a: number, z: number, ra: number, rz: number) => boolean): void {
  const { pen, s } = k;
  const salt = wall === 'right' ? 5 : 6;
  const dots: Array<[number, number, number]> = [];
  gaps.forEach((g, ia) => {
    if (hash(ia, salt, 1) < 0.4) return;
    const a = g + (hash(ia, salt, 4) - 0.5) * 1.2;
    const z = 4 + hash(ia, salt, 3) * Math.max(2, H - 12);
    if (a < a0 - 6 || a > a1 + 6 || a < T + 2 || a > end - 3 || !clear(a, z, 2, 2)) return;
    k.halo(a, 0.2, z, 4.5, C.glow, 0.34);
    for (let i = 0; i < 9; i++) dots.push([...k.p(a + (hash(ia, i, 7) - 0.5) * 3, 0.08, z + (hash(ia, i, 8) - 0.5) * 3.2), i]);
  });
  pen.beginPath();
  for (const [x, y, i] of dots) {
    const r = Math.max(1, (0.28 + (i % 3) * 0.06) * s);
    pen.moveTo(x + r, y);
    pen.arc(x, y, r, 0, Math.PI * 2);
  }
  pen.fillStyle = C.glowHot;
  pen.fill();
}

// Glowing seeps: thin runs of teal light trickling down a recess, here and
// there (about one in four).
function rivulets(k: Kit, T: number, end: number, a0: number, a1: number, H: number, wall: Wall, gaps: number[], clear: (a: number, z: number, ra: number, rz: number) => boolean): void {
  const { s } = k;
  const salt = wall === 'right' ? 15 : 16;
  gaps.forEach((g, ia) => {
    if (hash(ia, salt, 1) > 0.28 || g < T + 3 || g > end - 3 || g < a0 - 4 || g > a1 + 4) return;
    const top = H * (0.3 + hash(ia, salt, 2) * 0.25);
    const line: P3[] = [];
    for (let z = top; z > 1.2; z -= 0.6) line.push([g + Math.sin(z * 0.55 + ia) * 0.45 + Math.sin(z * 1.7 + ia * 3) * 0.15, 0.05, z]);
    if (line.some(([a, , z]) => !clear(a, z, 0.6, 0.6))) return;
    for (let i = 0; i < line.length; i += 4) k.halo(line[i][0], 0.1, line[i][2], 1.4, C.glow, 0.22);
    k.line(line, withAlpha(C.glowSoft, 0.9), Math.max(1, 0.24 * s));
    k.line(line, C.glowHot, Math.max(0.7, 0.09 * s));
    // beads of it caught on the way down, and where it pools at the foot
    for (let i = 3; i < line.length - 2; i += 5) k.disc(line[i][0], 0.1, line[i][2], 0.22, C.glowHot, 0);
    k.halo(line[line.length - 1][0], 0.3, 0.8, 2.4, C.glow, 0.3);
  });
}

// Moss creeping up from the floor, with tongues of it here and there.
function footMoss(k: Kit, a0: number, a1: number, wall: Wall, tone: (c: Color, d?: number) => Color): void {
  const salt = wall === 'right' ? 7 : 8;
  const top = (a: number) => {
    const i = Math.floor(a / 6);
    const tongue = hash(i, salt) < 0.25 ? Math.sin(((a % 6) / 6) * Math.PI) * (2 + hash(i, salt, 2) * 3.5) : 0;
    return 1.5 + Math.sin(a * 0.33 + salt) * 0.7 + Math.sin(a * 0.11) * 0.6 + tongue;
  };
  const pts: P3[] = [[a0, 0.05, 0], [a0, 0.05, top(a0)]];
  for (let a = Math.ceil(a0 / 0.75) * 0.75; a < a1; a += 0.75) pts.push([a, 0.05, top(a)]);
  pts.push([a1, 0.05, top(a1)]);
  pts.push([a1, 0.05, 0]);
  k.poly(pts, tone(C.mossDark), k.thin);
  const hi = pts.slice(1, -1).map(([a, n, z]): P3 => [a, n, z - 0.35]);
  k.line(hi, tone(C.moss), Math.max(0.8, 0.25 * k.s));
}

// The top of a wall: moss draping over the edge, stalactites, hanging roots
// and vines (never down past HANG, over the stations).
function topEdge(k: Kit, v: RoomView, a0: number, a1: number, wall: Wall, mine: Feature[], tone: (c: Color, d?: number) => Color): void {
  const { pen } = k;
  const { T } = v;
  const salt = wall === 'right' ? 9 : 10;
  const top = topOf(v, wall);
  const maxHang = (a: number) => Math.max(2, top(a) - HANG);
  // stalactites
  pen.beginPath();
  const lit: P3[][] = [];
  const r = rightward(k);
  for (let i = Math.floor(a0 / 5); i * 5 < a1; i++) {
    if (hash(i, salt, 1) < 0.5) continue;
    const a = i * 5 + hash(i, salt, 2) * 5;
    if (a < T + 1) continue;
    const w = 0.8 + hash(i, salt, 3) * 1.1;
    // longer where the rim dips (the drips gather there)
    const l = Math.min(maxHang(a), 2 + hash(i, salt, 4) * 4.5 + (v.H - top(a)) * 0.8);
    const z = Math.min(top(a - w), top(a + w)) - 0.6;
    const tri: P3[] = [[a - w, 0.1, z], [a + w, 0.1, z], [a + w * 0.1, 0.1, z - l]];
    k.trace(tri, 0.2);
    lit.push([[a - w * r, 0.1, z], [a + w * 0.1, 0.1, z - l], [a - w * 0.1 * r, 0.1, z]]);
  }
  k.paint(tone('#4c4164'), k.thin);
  pen.beginPath();
  for (const t of lit) k.trace(t);
  pen.fillStyle = tone('#6d6087');
  pen.fill();
  // the moss lip
  const drop = (a: number) => {
    const i = Math.floor(a / 4);
    const drip = hash(i, salt, 5) < 0.3 ? Math.sin(((a % 4) / 4) * Math.PI) * (0.8 + hash(i, salt, 6) * 1.8) : 0;
    return 0.8 + Math.sin(a * 0.4 + salt) * 0.35 + drip;
  };
  const pts: P3[] = [[a0, 0.15, v.H + 1]];
  pts.push([a0, 0.15, top(a0) - drop(a0)]);
  for (let a = Math.ceil(a0 / 0.6) * 0.6; a < a1; a += 0.6) pts.push([a, 0.15, top(a) - drop(a)]);
  pts.push([a1, 0.15, top(a1) - drop(a1)]);
  pts.push([a1, 0.15, v.H + 1]);
  k.poly(pts, tone(C.mossDark), k.thin);
  // hanging roots, then vines
  const near = (a: number, kinds: Kind[], m: number) => mine.some((f) => kinds.includes(f.kind) && Math.abs(a - f.a) < f.w / 2 + m);
  for (let i = Math.floor(a0 / 11); i * 11 < a1; i++) {
    if (hash(i, salt, 7) < 0.35) continue;
    const a = i * 11 + hash(i, salt, 8) * 11;
    if (a < T + 2 || near(a, ['roots', 'pod'], 2)) continue;
    const l = Math.min(maxHang(a), 3 + hash(i, salt, 9) * 11);
    const sw = (hash(i, salt, 10) - 0.5) * 3;
    const z = top(a);
    root(k, [a, 0.3, z - 0.4], [a + sw, 0.5, z - l * 0.5], [a + sw * 0.4, 0.6, z - l], 0.4 + hash(i, salt, 11) * 0.35, tone(C.root, 0.12));
  }
  for (let i = Math.floor(a0 / 4); i * 4 < a1; i++) {
    if (hash(i, salt, 12) < 0.45) continue;
    const a = i * 4 + hash(i, salt, 13) * 4;
    if (a < T + 1 || near(a, ['geode', 'pod'], 1)) continue;
    const l = Math.min(maxHang(a), 2 + hash(i, salt, 14) * 10);
    vine(k, a, 0.25, top(a) - 0.6, l, i * 3 + salt, tone(C.mossDark, 0.1), tone(C.moss, 0.1));
  }
}

// ── wall wonders ───────────────────────────────────────────────────────────

// The great geode: a broken rock egg split open in the wall, its rough
// crust thick in places and thin in others, bands of agate, and inside a
// lumpy hollow (wider at the foot) of amethyst points round a violet glow;
// big crystals break out over the rim, and more step out onto the floor
// below it.
function geode(k: Kit, v: RoomView, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const a = f.a;
  const { rw, rh, lift } = geodeOf(f, v.H);
  const zc = 2 + rh * 1.15 + lift;
  // a lumpy closed outline at scale sc: low waves round it (their phase
  // set by q, so the crust and the hollow lump differently), a little
  // wider and flatter toward the foot
  const lump = (t: number, q: number, jag: number) => 1 + jag * (Math.sin(2 * t + q * 1.3 + f.k) * 0.55 + Math.sin(3 * t + q * 2.9) * 0.3 + Math.sin(5 * t + q * 0.7) * 0.15);
  const at = (t: number, sc: number, q: number, jag: number, n: number): P3 => {
    const j = sc * lump(t, q, jag);
    const low = Math.max(0, -Math.sin(t));
    return [a + Math.cos(t) * rw * j * (1 + 0.12 * low), n, zc + Math.sin(t) * rh * j * (1 - 0.08 * low)];
  };
  const oval = (sc: number, n: number, q: number, jag: number, steps = 36): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i < steps; i++) pts.push(at((i / steps) * Math.PI * 2, sc, q, jag, n));
    return pts;
  };
  k.halo(a, 0.3, zc, rw * 2.4, C.crystal, 0.32);
  // the crust round the opening, bulging from the rock, broken unevenly
  k.poly(oval(1.16, 0.1, 1, 0.13), tone('#8f84a6'), k.lw, 0.8);
  k.poly(oval(1.0, 0.12, 4, 0.1), tone('#ddd4e6'), k.thin, 0.5);
  // bands of agate
  k.poly(oval(0.92, 0.12, 6, 0.09), k.vgrad(a, 0.12, zc - rh, zc + rh, [[0, '#6c4aa8'], [1, '#a689d8']]), k.thin);
  const band = oval(0.86, 0.12, 6, 0.09);
  k.line([...band, band[0]], withAlpha('#efe4ff', 0.75), Math.max(0.8, 0.14 * s));
  // the hollow, glowing
  const HQ = 9;
  const hollow = oval(0.79, 0.12, HQ, 0.1);
  const [cx, cy] = k.p(a, 0.12, zc - rh * 0.1);
  const g = pen.createRadialGradient(cx, cy, 0, cx, cy, rw * 0.8 * s * 1.42);
  g.addColorStop(0, '#fbf4ff');
  g.addColorStop(0.28, '#c8a4ff');
  g.addColorStop(0.7, '#6a43ac');
  g.addColorStop(1, '#3a2266');
  k.poly(hollow, g, 0);
  // points round the rim, pointing in: lit halves and dark halves
  const n = 30;
  const litP: P3[][] = [];
  const darkP: P3[][] = [];
  const r = rightward(k);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2 + hash(f.k, i, 32) * 0.12;
    const dt = 0.11 + hash(f.k, i, 33) * 0.07;
    const L = 0.22 + hash(f.k, i, 34) * 0.3;
    const P = (tt: number, sc: number): P3 => at(tt, sc, HQ, 0.1, 0.13);
    const b0 = P(t - dt, 0.8);
    const b1 = P(t + dt, 0.8);
    const mid = P(t, 0.81);
    const tip = P(t, 0.79 - L);
    const leftFirst = (b0[0] - b1[0]) * r < 0;
    (leftFirst ? litP : darkP).push([b0, mid, tip]);
    (leftFirst ? darkP : litP).push([mid, b1, tip]);
  }
  pen.beginPath();
  for (const q of darkP) k.trace(q);
  pen.fillStyle = '#8159cc';
  pen.fill();
  pen.beginPath();
  for (const q of litP) k.trace(q);
  pen.fillStyle = '#d2bcff';
  pen.fill();
  pen.beginPath();
  for (const q of [...litP, ...darkP]) k.trace(q);
  pen.strokeStyle = withAlpha(INK, 0.5);
  pen.lineWidth = Math.max(0.7, k.thin * 0.6);
  pen.stroke();
  pen.beginPath();
  k.trace(hollow);
  k.paint(null, k.thin);
  k.halo(a, 0.4, zc, rw * 0.9, '#e6d2ff', 0.5);
  // big crystals breaking out over the rim, so the outline is spiky, not
  // a ring
  // (bunched, not evenly round it: two together up on the left, one up on
  // the right, a small one low down)
  const spikes: ReadonlyArray<readonly [number, number, number]> = [[0.6, 0.5, 0.11], [0.78, 0.36, 0.09], [0.16, 0.4, 0.1], [1.3, 0.26, 0.08]];
  spikes.slice(0, rw > 6 ? 4 : 3).forEach(([at0, len, r0], i) => {
    const t = Math.PI * at0 + (hash(f.k, i, 35) - 0.5) * 0.2;
    const base = at(t, 0.86, HQ, 0.1, 0.4);
    const out: P3 = [Math.cos(t) * rw, 1.4 + hash(f.k, i, 36), Math.sin(t) * rh];
    crystal(k, base, out, rw * len * (0.9 + hash(f.k, i, 37) * 0.25), rw * r0, i % 2 ? C.crystal : '#b99af6', k.thin);
  });
  if (lift) {
    // the ledge it sits over, crystals grown on it
    outcrop(k, a, zc - rh * 1.02, rw * 0.85, 2.2, 1.8, f.k + 7, tone);
    crystals(k, a - rw * 0.3, 0.9, zc - rh * 1.02, 1.8, [0.1, 0.5, 1], C.crystal, f.k + 3, 4);
    return;
  }
  // crystals stepping out of the foot of it onto the floor
  crystals(k, a - rw * 0.35, 1.8, 0, Math.min(3.2, rw * 0.44), [0.1, 0.5, 1], C.crystal, f.k + 3, 5);
  crystals(k, a + rw * 0.45, 2.4, 0, Math.min(2.2, rw * 0.3), [-0.2, 0.4, 1], C.crystal, f.k + 4, 3);
  boulder(k, a + rw * 0.95, 1.6, 0, 1.3, 1.4, tone('#6a5d82'), f.k + 5, true);
  boulder(k, a - rw * 0.95, 1.4, 0, 1.0, 1.0, tone('#5e5276'), f.k + 6);
}

// The mother mushroom: one giant grown up in the back corner, its stalk
// pale, its cap glowing teal over everything (above the tallest station
// and every head), a light under it and her small ones round her foot.
function motherShroom(k: Kit, v: RoomView, f: Feature): void {
  const h = motherH(v.H);
  const u = v.T + 3.2;
  const w = 2.6;
  if (!k.seen([[u - 9, w - 9, 0], [u + 9, w - 9, 0], [u - 9, w + 9, 0], [u + 9, w + 9, 0], [u - 9, w - 9, h + 6], [u + 9, w + 9, h + 6]], 4 * k.s)) return;
  k.shadow(u + 0.4, w + 0.4, 3.4, 2.8, 0.32);
  clump(k, u + 3.2, w + 2.4, 0, 3, 1.0, 0.75, [C.glow], f.k + 31, true);
  shroom(k, u, w, 0, h, 6.6, C.glow, { cap: 'dome', glow: true, spots: C.glowHot, skirt: true, lean: [1.4, 1.2], rb: 2.1, seed: f.k + 33 });
  k.halo(u + 1.4, w + 1.2, h - 1.2, 9, C.glow, 0.3);
  clump(k, u + 0.8, w + 3.8, 0, 4, 1.2, 0.8, [C.capViolet, '#a974d6'], f.k + 32);
  clump(k, u - 0.6, w + 5.2, 0, 2, 0.8, 0.6, [C.glow], f.k + 34, true);
}

// A grove of giant mushrooms grown up against the rock.
function grove(k: Kit, v: RoomView, f: Feature): void {
  const top = groveH(v.H);
  const kind = Math.floor(hash(f.k, 101) * 3);
  const caps: readonly [Color, Cap, boolean, Color | null][] = [
    [C.capRed, 'dome', false, C.spot],
    [C.glow, 'dome', true, null],
    [C.capViolet, 'bun', false, '#e6d6ff'],
  ];
  const n = 3;
  const items: Array<{ u: number; v: number; h: number; r: number; c: (typeof caps)[number] }> = [];
  for (let i = 0; i < n; i++) {
    const big = i === 1;
    const h = big ? top * 0.85 : top * (0.4 + hash(f.k, i, 102) * 0.2);
    const r = big ? 4.6 + top * 0.05 : 2.6 + hash(f.k, i, 103) * 1.0;
    const u = f.a + (i - 1) * 5.2 + (hash(f.k, i, 104) - 0.5) * 1.2;
    const c = caps[(kind + (big ? 0 : i + 1)) % caps.length];
    items.push({ u, v: big ? 3.2 : 5.5 + hash(f.k, i, 105) * 1.5, h, r, c });
  }
  items.sort((p, q) => p.u + p.v - (q.u + q.v));
  // behind and between them, small ones and moss
  for (const m of items) k.shadow(m.u, m.v, m.r * 0.9, m.r * 0.7, 0.28);
  for (const m of items) {
    const lean: [number, number] = [0, Math.min(1.2, m.r * 0.3)];
    shroom(k, m.u, m.v - lean[1], 0, m.h, m.r, m.c[0], { cap: m.c[1], glow: m.c[2], spots: m.c[3], skirt: m.r > 3, lean, seed: f.k + Math.floor(m.u) });
  }
  clump(k, f.a + 6.5, 4.5, 0, 4, 1.1, 0.75, [C.capTan, '#d9b27a'], f.k + 12);
  clump(k, f.a - 6.8, 5.5, 0, 3, 0.9, 0.7, [C.glow], f.k + 13, true);
}

// A seep: toxic sludge oozing from a crack, running down the rock into a
// puddle on the floor.
function seep(k: Kit, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const a = f.a;
  const zc = 13 + hash(f.k, 41) * 4;
  k.halo(a, 0.1, zc - 4, 6, '#5a8a20', 0.38);
  // the crack
  const crack: P3[] = [];
  for (let i = 0; i < 14; i++) {
    const t = (i / 14) * Math.PI * 2;
    const j = i & 1 ? 0.5 : 1;
    crack.push([a + Math.cos(t) * 2.4 * j, 0.08, zc + Math.sin(t) * 1.4 * j]);
  }
  k.poly(crack, tone('#1c1428'), k.lw, 0.1);
  // the ooze: a run widening as it falls
  const left: P3[] = [];
  const right: P3[] = [];
  const steps = 12;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const z = zc - 0.4 - (zc - 0.4) * t;
    const c = a + Math.sin(t * 5 + f.k) * 0.5;
    const w = 0.55 + t * t * 1.2;
    left.push([c - w, 0.2 + t * 0.5, z]);
    right.push([c + w, 0.2 + t * 0.5, z]);
  }
  // the puddle at the foot
  const pud: P3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = (i / 16) * Math.PI;
    pud.push([a + Math.cos(t) * 4 * (0.9 + hash(f.k, i, 42) * 0.2), 0.3 + Math.sin(t) * 3.8 * (0.85 + hash(f.k, i, 43) * 0.25), 0.03]);
  }
  k.poly(pud, C.sludgeDark, k.lw, 0.3);
  const inner = pud.map(([u, vv, z]): P3 => [a + (u - a) * 0.75, 0.4 + (vv - 0.3) * 0.72, z + 0.01]);
  k.poly(inner, k.lgrad([a, 0.3, 0], [a, 3.8, 0], [1, 0, 0], [[0, C.sludge], [1, C.sludgeHot]]), 0, 0.3);
  k.poly([...left, ...right.reverse()], k.hgrad([a - 1.6, 0, zc], [a + 1.6, 0, zc], [[0, C.sludgeHot], [0.5, C.sludge], [1, C.sludgeDark]]), k.lw, 0.2);
  k.line(left.slice(1, -1).map(([u, vv, z]): P3 => [u + 0.32, vv + 0.05, z]), withAlpha('#f4ffc0', 0.85), Math.max(0.8, 0.16 * s));
  // bubbles sitting on the puddle
  pen.beginPath();
  for (let i = 0; i < 5; i++) {
    const e = k.ell(a + (hash(f.k, i, 44) - 0.5) * 4.4, 1.2 + hash(f.k, i, 45) * 2, 0.06, 0.2 + hash(f.k, i, 46) * 0.25);
    pen.moveTo(e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.rx * 0.8, 0, 0, Math.PI * 2);
  }
  k.paint(C.sludgeHot, Math.max(0.7, k.thin * 0.6), C.sludgeDark);
  k.halo(a, 1.8, 0.4, 5, C.sludge, 0.42);
}

// Shelf fungi stacked up the rock, one or two of them glowing.
function brackets(k: Kit, v: RoomView, f: Feature): void {
  const top = bracketTop(v.H);
  const n = 7 + Math.floor(hash(f.k, 51) * 3);
  const glowAt = Math.floor(hash(f.k, 52) * n);
  const cols: readonly Color[] = ['#c98f55', '#e2c48c', '#b5643f', '#d8a66a'];
  const items: Array<{ u: number; z: number; r: number; c: Color; glow: boolean }> = [];
  for (let i = 0; i < n; i++) {
    const z = 6 + (top * i) / n + hash(f.k, i, 53) * 1.5;
    const u = f.a + Math.sin(i * 1.9 + f.k) * (f.w / 2 - 2.6);
    const r = 1.2 + hash(f.k, i, 55) * 1.1;
    const glow = i === glowAt || (n > 7 && i === (glowAt + 4) % n);
    items.push({ u, z, r, c: glow ? C.glowSoft : cols[Math.floor(hash(f.k, i, 56) * cols.length)], glow });
  }
  // lower ones first: a higher one is nearer the eye where they overlap
  items.sort((p, q) => p.z - q.z);
  for (const b of items) bracket(k, b.u, 0.05, b.z, b.r, b.c, b.glow, 0.35 + b.r * 0.15);
}

// A rocky outcrop bulging from the face at (a, z), ru across, rz tall,
// with a flat top jutting out `out` units: lit top, shaded front.
function outcrop(k: Kit, a: number, z: number, ru: number, rz: number, out: number, seed: number, tone: (c: Color, d?: number) => Color): void {
  const face: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = Math.PI + (i / 12) * Math.PI;
    const j = 0.85 + hash(seed, i, 3) * 0.25;
    face.push([a + Math.cos(t) * ru * j, 0.04 + out * 0.6, z + Math.sin(t) * rz * j]);
  }
  // the underside bulge, then the top
  k.poly([[a - ru, 0.04, z], ...face, [a + ru, 0.04, z]], k.vgrad(a, 0, z - rz, z, [[0, tone('#3e3452')], [1, tone('#5e5276')]]), k.lw, 0.5);
  const top: P3[] = [];
  for (let i = 0; i <= 12; i++) {
    const t = (i / 12) * Math.PI;
    top.push([a + Math.cos(t) * ru, 0.04 + Math.sin(t) * out, z]);
  }
  k.poly(top, tone('#8a7ca3'), k.lw, 0.4);
  k.line(top.slice(2, -2).map(([u, n, zz]): P3 => [u, n - 0.25, zz]), tone('#a99cc4'), Math.max(1, 0.25 * k.s));
}

// A cluster of crystals growing out of a rocky outcrop.
function crystalShelf(k: Kit, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const z = 11 + hash(f.k, 61) * 3;
  const blue = hash(f.k, 62) < 0.4;
  outcrop(k, f.a, z, 3.6, 3.2, 2.2, f.k, tone);
  crystals(k, f.a, 0.9, z - 0.1, 4.8, [0.05, 0.45, 1], blue ? '#6fb0f0' : C.crystal, f.k + 7, 7);
}

// An alcove cut in the rock: a shelf of jars of glowing spores, a candle
// and a pile of old books.
function niche(k: Kit, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const a = f.a;
  const w = 7;
  const z0 = 10.5;
  const z1 = 20;
  const arch = (sc: number, n: number): P3[] => {
    const r = (w / 2) * sc;
    const spring = z1 - r;
    const pts: P3[] = [[a - r, n, z0 - (sc - 1) * 2], [a + r, n, z0 - (sc - 1) * 2], [a + r, n, spring]];
    for (let i = 1; i < 12; i++) {
      const th = (i / 12) * Math.PI;
      pts.push([a + r * Math.cos(th), n, spring + r * Math.sin(th)]);
    }
    pts.push([a - r, n, spring]);
    return pts;
  };
  k.poly(arch(1.2, 0.06), tone('#82769a'), k.lw);
  k.poly(arch(1, 0.08), k.vgrad(a, 0.08, z0, z1, [[0, '#2a1e3a'], [1, '#160f20']]), k.thin);
  k.halo(a, 0.5, z0 + 2.5, 4, '#ffc070', 0.3);
  k.box(a - w / 2 - 0.5, 0, z0 - 0.7, w + 1, 1.3, 0.7, tone(C.wood), { line: k.thin });
  const z = z0;
  const jar = (u: number, h: number, c: Color) => {
    k.cyl(u, 0.3, z, 0.65, h, withAlpha(C.glass, 0.5), { line: k.thin });
    k.cyl(u, 0.3, z + 0.05, 0.52, h * 0.7, c, { line: 0 });
    k.cyl(u, 0.3, z + h, 0.7, 0.3, C.wood, { line: k.thin });
    k.halo(u, 0.4, z + h * 0.4, 1.8, c, 0.45);
  };
  jar(a - 2.1, 1.9, C.glow);
  jar(a - 0.6, 2.6, C.sludge);
  candle(k, a + 0.9, 0.4, z, 1.3, 0.3);
  k.box(a + 1.6, -0.1, z, 1.5, 1.0, 0.4, '#5a3f7a', { line: k.thin, stripe: false });
  k.box(a + 1.7, -0.05, z + 0.4, 1.3, 0.9, 0.35, '#a0583a', { line: k.thin, stripe: false });
}

// Great roots breaking through from above and snaking down to the floor,
// mushrooms and a glow pod on them.
function bigRoots(k: Kit, v: RoomView, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const a = f.a;
  const H = topOf(v, f.wall)(a);
  // the hole they come through
  k.poly([[a - 4.5, 0.04, v.H + 1], [a + 4.5, 0.04, v.H + 1], [a + 4.5, 0.04, H], [a + 3.2, 0.04, H - 2.6], [a + 0.5, 0.04, H - 3.6], [a - 3.4, 0.04, H - 2.4], [a - 4.5, 0.04, H]], tone('#1c1428'), k.thin, 0.5);
  const n = 3;
  for (let i = 0; i < n; i++) {
    const u0 = a + (i - 1) * 2.4;
    const sw = (hash(f.k, i, 73) - 0.5) * 5 + (i - 1) * 1.5;
    const w = (i === 1 ? 2.4 : 1.5) + hash(f.k, i, 74) * 0.4;
    const path = curve([[u0, 0.5, H - 0.5], [u0 + sw, 0.9, H * 0.7], [u0 - sw * 0.6, 1.2, H * 0.38], [u0 + sw * 0.3, 1.6 + i * 0.3, 2.2], [u0 + sw * 0.3 + (i - 1) * 2.5, 2.8 + i * 0.5, 0.2]], 22);
    ribbon(k, path, w, w * 0.35, i === 1 ? tone(C.rootLit, 0.1) : tone(C.root, 0.1));
    // a side root
    const at = path[8 + i * 3];
    ribbon(k, curve([at, [at[0] + (i - 1 || 1) * 2.5, at[1] + 0.2, at[2] - 2], [at[0] + (i - 1 || 1) * 3.5, at[1] + 0.3, at[2] - 5]], 8), w * 0.45, w * 0.12, tone(C.root, 0.1));
  }
  clump(k, a - 2.2, 2.6, 0, 4, 1.2, 0.85, [C.capTan, '#d9b27a', C.capRed], f.k + 9);
  bracket(k, a + 1.6, 1.2, H * 0.42, 1.3, C.glowSoft, true, 0.5);
  bracket(k, a + 0.4, 1.0, H * 0.3, 1.0, '#d8a66a', false, 0.45);
}

// A big colony of glowing lichen and a few glowing caps on a ledge.
function lichen(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const zc = 12 + hash(f.k, 81) * 4;
  k.halo(a, 0.2, zc, 6.5, C.glow, 0.34);
  const rosettes: Array<[number, number, number]> = [];
  for (let i = 0; i < 7; i++) rosettes.push([a + (hash(f.k, i, 82) - 0.5) * 5, zc + (hash(f.k, i, 83) - 0.5) * 5, 0.9 + hash(f.k, i, 84) * 1.1]);
  const scallop = (u: number, z: number, r: number) => {
    const pts: P3[] = [];
    for (let i = 0; i < 16; i++) {
      const t = (i / 16) * Math.PI * 2;
      const j = i & 1 ? 0.8 : 1;
      pts.push([u + Math.cos(t) * r * j, 0.08, z + Math.sin(t) * r * j]);
    }
    return pts;
  };
  for (const [u, z, r] of rosettes) k.poly(scallop(u, z, r), '#4fbf9a', k.thin);
  for (const [u, z, r] of rosettes) k.poly(scallop(u - r * 0.15, z + r * 0.15, r * 0.55), '#a8f5dc', 0);
  pen.beginPath();
  for (let i = 0; i < 16; i++) {
    const [x, y] = k.p(a + (hash(f.k, i, 85) - 0.5) * 7, 0.1, zc + (hash(f.k, i, 86) - 0.5) * 7);
    const r = Math.max(0.8, 0.16 * s);
    pen.moveTo(x + r, y);
    pen.arc(x, y, r, 0, Math.PI * 2);
  }
  pen.fillStyle = C.glowHot;
  pen.fill();
  const z = zc - 4.5;
  outcrop(k, a, z, 2.8, 2.2, 1.9, f.k + 1, (c) => c);
  clump(k, a, 0.8, z, 4, 1.0, 0.7, [C.glow], f.k + 11, true);
}

// A burrow at the foot of the rock: a dark hole ringed with roots, a heap
// of dug earth, two eyes shining inside.
function burrow(k: Kit, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const a = f.a;
  const hole = (sc: number, n: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i <= 14; i++) {
      const t = (i / 14) * Math.PI;
      pts.push([a + Math.cos(t) * 2.6 * sc, n, Math.sin(t) * 3.2 * sc]);
    }
    return pts;
  };
  k.poly(hole(1.28, 0.06), tone('#5e4a62'), k.lw);
  k.poly(hole(1, 0.08), k.vgrad(a, 0.08, 0, 3.2, [[0, '#120a18'], [1, '#22162c']]), k.thin);
  for (const du of [-0.55, 0.55]) {
    const [x, y] = k.p(a + du, 0.1, 1.5);
    pen.beginPath();
    pen.ellipse(x, y, Math.max(1, 0.24 * s), Math.max(1.2, 0.34 * s), 0, 0, Math.PI * 2);
    pen.fillStyle = '#ffe27a';
    pen.fill();
  }
  k.halo(a, 0.2, 1.5, 2, '#ffe27a', 0.3);
  root(k, [a - 3.4, 0.2, 4.4], [a - 1.8, 0.3, 4.2], [a - 0.2, 0.3, 3.8], 0.35);
  root(k, [a + 3.5, 0.2, 2.6], [a + 2.9, 0.3, 4.1], [a + 1.2, 0.3, 4.0], 0.3);
  boulder(k, a + 2, 1.8, 0, 1.5, 0.8, C.soil, f.k + 13);
  boulder(k, a - 1.7, 2.1, 0, 1.0, 0.55, '#6a5068', f.k + 14);
}

// A glow pod hanging off a root from the top of the wall.
function pod(k: Kit, v: RoomView, f: Feature): void {
  const H = topOf(v, f.wall)(f.a);
  const l = podLen(f, H);
  const sw = (hash(f.k, 91) - 0.5) * 1.5;
  root(k, [f.a, 0.3, H - 0.3], [f.a + sw, 0.6, H - l * 0.5], [f.a, 0.9, H - l], 0.25, C.root);
  const z = H - l - 1.1;
  k.halo(f.a, 1.0, z, 5.5, C.glow, 0.38);
  const [x, y] = k.p(f.a, 1.0, z);
  const r = 1.05 * k.s;
  const pen = k.pen;
  pen.beginPath();
  pen.ellipse(x, y, r, r * 1.25, 0, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r * 1.2);
  g.addColorStop(0, C.glowHot);
  g.addColorStop(0.6, C.glow);
  g.addColorStop(1, C.glowSoft);
  k.paint(g, k.thin);
  pen.beginPath();
  pen.ellipse(x, y - r * 0.95, r * 1.1, r * 0.5, 0, Math.PI, Math.PI * 2);
  pen.closePath();
  k.paint(C.capViolet, k.thin);
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen, s } = k;
  const { W, D, H, T } = v;
  // the floor's cut edges: moss, a band of earth, rock below
  const cut = (pts: (t: number, z: number) => P3, nu: number, nv: number) => {
    k.poly([pts(0, 0), pts(1, 0), pts(1, -SLAB), pts(0, -SLAB)], k.side('#4a3d5c', nu, nv), k.lw);
    k.poly([pts(0, 0), pts(1, 0), pts(1, -1.1), pts(0, -1.1)], k.side(C.soil, nu, nv), 0);
    // stones in the rock band
    pen.beginPath();
    for (let i = 0; i < 40; i++) {
      const t = hash(i, nu * 3 + nv, 1);
      const [x, y] = k.p(...pts(t, -1.6 - hash(i, nu * 3 + nv, 2) * (SLAB - 2)));
      const r = (0.25 + hash(i, nu + nv * 5, 3) * 0.3) * s;
      if (x + r < 0 || x - r > pen.width || y + r < 0 || y - r > pen.height) continue;
      pen.moveTo(x + r, y);
      pen.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = k.side('#6a5d80', nu, nv);
    pen.fill();
    // the moss lip over the edge, dripping
    const lip: P3[] = [pts(0, 0.02)];
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      const drip = hash(i, nu, 4) < 0.25 ? 0.35 + hash(i, nu, 5) * 0.5 : 0.15;
      lip.push(pts(t, -drip));
    }
    lip.push(pts(1, 0.02));
    k.poly(lip, k.side(C.mossDark, nu, nv), k.thin);
  };
  cut((t, z) => [T + (W - T) * t, D, z], 0, 1);
  cut((t, z) => [W, T + (D - T) * t, z], 1, 0);
  // the walls' cut ends: rock in layers on earth
  const end = (p: (t: number, z: number) => P3, nu: number, nv: number) => {
    k.poly([p(0, -SLAB), p(1, -SLAB), p(1, H), p(0, H)], k.side('#5d5076', nu, nv), k.lw);
    pen.beginPath();
    for (let i = 0; i < 4; i++) {
      const z = H * (0.16 + i * 0.22);
      const [x0, y0] = k.p(...p(0, z + Math.sin(i * 2.1) * 1.2));
      const [x1, y1] = k.p(...p(1, z + Math.sin(i * 2.1 + 0.6) * 1.2));
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = withAlpha(INK, 0.4);
    pen.lineWidth = Math.max(0.8, 0.12 * s);
    pen.stroke();
    k.poly([p(0, -SLAB), p(1, -SLAB), p(1, -1.1), p(0, -1.1)], k.side('#4a3d5c', nu, nv), 0);
  };
  end((t, z) => [T * t, D, z], 0, 1);
  end((t, z) => [W, T * t, z], 1, 0);
  // the tops: worn rock following each wall's rim, moss along the inner
  // edge, a lit line along the outer
  const cap = '#5a4e70';
  const tops = (['left', 'right'] as const).map((wall) => {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    const top = topOf(v, wall);
    const as: number[] = [];
    for (let a = T; a < end; a += 1) as.push(a);
    as.push(end);
    const line = (n: (a: number) => number): P3[] => as.map((a): P3 => [a, n(a), top(a)]);
    const world = (pts: P3[]): P3[] => pts.map(([a, o, z]): P3 => (wall === 'right' ? [a, T + o, z] : [T + o, a, z]));
    return { wk, line, world };
  });
  k.poly([[0, 0, H], [T, 0, H], [T, T, H], [0, T, H]], cap, 0);
  for (const t of tops) t.wk.poly([...t.line(() => 0), ...t.line(() => -T).reverse()], cap, 0);
  const [lt, rt] = tops;
  k.line([...lt.world(lt.line(() => 0)).reverse(), ...rt.world(rt.line(() => 0))], INK, k.lw);
  k.line([...lt.world(lt.line(() => -T)).reverse(), [0, 0, H], ...rt.world(rt.line(() => -T))], INK, k.lw);
  for (const t of tops) {
    const lip = (a: number) => -(1.0 + Math.sin(a * 0.37) * 0.45 + hash(Math.round(a), 9) * 0.5);
    t.wk.poly([...t.line(() => 0), ...t.line(lip).reverse()], C.mossDark, k.thin);
    t.wk.line(t.line(() => -T + 0.35), shade(cap, 0.3), Math.max(1, 0.2 * s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.6), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.45), k.thin);
}
