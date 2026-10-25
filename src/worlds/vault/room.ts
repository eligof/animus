import type { At } from '../../art/iso.ts';
import { frame, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import type { Rect } from '../../world/layout.ts';
import { hub, planLayout, wallGaps } from '../../world/layout.ts';
import { hashString } from '../../world/rng.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView, WorldDef } from '../types.ts';
import { barStack, cageLamp, dial, fillPts, hull, rivets, ring } from './bits.ts';
import type { P3 } from './kit.ts';
import { DECOR } from './decor.ts';
import { C, INK, Kit, circle, hash, withAlpha } from './kit.ts';
import { STATIONS } from './stations.ts';

// The vault's shell: polished stone underfoot in a quiet checker with a
// brass border and a brass star at the middle; walls of riveted steel
// plate over a dark wainscot and a brass rail, a girder along the top hung
// with caged amber lamps, a velvet runner in from the way in. In the free
// stretches between the stations: banks of brass deposit boxes (the tall
// ones up to the girder, a library ladder on some), glass niches of gold
// bars lit from within, a bank clock, alarm bells, amber sconces and
// security cameras, and beside the way in, the great round vault door
// itself, swung open against the wall. Every piece sits where the stage's
// plan leaves the wall free, so nothing hangs behind a station.

type Wall = 'left' | 'right';
type Kind = 'door' | 'bank' | 'niche' | 'clock' | 'alarm' | 'cam' | 'sconce';
// `side`: for the door, which way its hinge (and the way in) lies along
// the wall.
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number; side?: -1 | 1 };
// `runner`: how far the velvet runner reaches out from the way in.
export type Plan = { L: Layout; features: Feature[]; runner: number };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const SKIRT = 1.0;
const WAIN = 8; // the dark lower plates' top (the brass rail sits on it)
const RAIL = 0.7;
const TILE = 4; // floor stone
const DOOR_R = 6.9; // the vault door's radius
const DOOR_GAP = 0.5; // between the door's rim and the way in's jamb

const girder = (H: number) => ({ z0: H - 7.5, z1: H - 4.5 });
// A bank's top: up to the girder, or (some) about two thirds of the way.
const bankTop = (f: { k: number }, H: number) => {
  const { z0, z1 } = bankZ(H);
  return hash(f.k, 11) < 0.45 ? z0 + Math.max(10, (z1 - z0) * 0.62) : z1;
};
const bankZ = (H: number) => {
  const z0 = WAIN + RAIL + 1.0;
  return { z0, z1: Math.max(z0 + 10, girder(H).z0 - 4) };
};

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and what hangs on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'vault');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L), runner: runnerLength(L) };
  PLANS.set(key, plan);
  return plan;
}

const along = (s: Slot) => (s.wall === 'right' ? s.x0 : s.y0);

// The door beside the way in (on whichever side has the wall for it), then
// bays along what is left: deposit banks mostly, with gold niches, a clock
// and an alarm between them; sconces and cameras in the gaps.
function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= 2) spans.push({ wall, a0, a1 });
    }
  }
  const ent = L.slots.find((s) => s.kind === 'entrance' && !s.island);
  if (ent) {
    const e0 = along(ent);
    const e1 = e0 + ent.len;
    const dw = 2 * DOOR_R + 1.2;
    for (const side of [1, -1] as const) {
      const lo = side > 0 ? e1 + DOOR_GAP : e0 - DOOR_GAP - dw;
      const hi = lo + dw;
      const span = spans.find((s) => s.wall === ent.wall && s.a0 - 3 <= lo && hi <= s.a1 + (side > 0 ? 0 : 3));
      if (!span) continue;
      out.push({ wall: ent.wall, kind: 'door', a: (lo + hi) / 2, w: dw, k: 1, side: (-side) as -1 | 1 });
      spans.splice(spans.indexOf(span), 1);
      if (side > 0) spans.push({ wall: ent.wall, a0: hi + 2.5, a1: span.a1 });
      else spans.push({ wall: ent.wall, a0: span.a0, a1: lo - 2.5 });
      break;
    }
  }
  const NOMINAL: Record<Kind, number> = { door: 0, bank: 14, niche: 8, clock: 6, alarm: 4, cam: 3, sconce: 2 };
  const ORDER: Kind[] = ['bank', 'niche', 'bank', 'clock', 'bank', 'niche', 'bank', 'alarm', 'bank'];
  const GAP = 5;
  const BANK_MAX = 26;
  // at most so many of a kind on a wall
  const CAP: Partial<Record<Kind, number>> = { clock: 1, alarm: 2 };
  const count = new Map<string, number>();
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    for (let guard = 0; guard < 40; guard++) {
      const fits = (k: Kind) => used + NOMINAL[k] + (kinds.length ? GAP : 0) <= len && (count.get(`${s.wall}:${k}`) ?? 0) < (CAP[k] ?? Infinity);
      let k: Kind | undefined;
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if (fits(c)) k = c;
      }
      if (!k) break;
      used += NOMINAL[k] + (kinds.length ? GAP : 0);
      kinds.push(k);
      count.set(`${s.wall}:${k}`, (count.get(`${s.wall}:${k}`) ?? 0) + 1);
      n++;
    }
    if (!kinds.length) {
      // a stretch too short for a bay: a lamp or a camera
      if (len >= 3) out.push({ wall: s.wall, kind: hash(n++, 5) < 0.5 ? 'cam' : 'sconce', a: (s.a0 + s.a1) / 2, w: 2, k: n });
      continue;
    }
    // Banks take up the slack, up to their widest; the rest is margin.
    const banks = kinds.filter((k) => k === 'bank').length;
    const slack = len - used;
    const grow = banks ? Math.min(BANK_MAX - NOMINAL.bank, slack / banks) : 0;
    const widths = kinds.map((k) => NOMINAL[k] + (k === 'bank' ? grow : 0));
    const total = widths.reduce((m, w) => m + w, 0) + GAP * (kinds.length - 1);
    let at = s.a0 + (len - total) / 2;
    const placed: Feature[] = [];
    kinds.forEach((k, i) => {
      placed.push({ wall: s.wall, kind: k, a: at + widths[i] / 2, w: widths[i], k: n * 7 + i });
      at += widths[i] + GAP;
    });
    out.push(...placed);
    // Between neighbours: sconces, a camera now and then.
    for (let i = 0; i + 1 < placed.length; i++) {
      const a = (placed[i].a + placed[i].w / 2 + placed[i + 1].a - placed[i + 1].w / 2) / 2;
      out.push({ wall: s.wall, kind: hash(placed[i].k, 9) < 0.3 ? 'cam' : 'sconce', a, w: 2, k: placed[i].k + 3 });
    }
  }
  // Each wall watched by at least one camera: the corner's sconce, else one
  // at the back corner itself.
  for (const wall of ['right', 'left'] as const) {
    if (out.some((f) => f.wall === wall && f.kind === 'cam')) continue;
    const sc = out.filter((f) => f.wall === wall && f.kind === 'sconce').sort((p, q) => p.a - q.a)[0];
    if (sc) sc.kind = 'cam';
  }
  return out;
}

// The span of wall a feature takes (along), and how high it reaches.
export function reach(f: Feature, H: number): { a0: number; a1: number; z0: number; z1: number; n: number } {
  const half = f.w / 2;
  switch (f.kind) {
    case 'door':
      return { a0: f.a - half, a1: f.a + half, z0: 0, z1: 2 * DOOR_R + 1, n: 4 };
    case 'bank': {
      const { z0, z1 } = bankZ(H);
      return { a0: f.a - half - 0.7, a1: f.a + half + 0.7, z0: 0, z1: z1 + 1.5, n: 3.6 };
    }
    case 'niche':
      return { a0: f.a - half - 0.6, a1: f.a + half + 0.6, z0: WAIN + 2, z1: WAIN + 17, n: 1 };
    case 'clock':
      return { a0: f.a - 3, a1: f.a + 3, z0: WAIN + 9, z1: WAIN + 16, n: 1 };
    case 'alarm':
      return { a0: f.a - 2, a1: f.a + 2, z0: WAIN + 10, z1: girder(H).z0, n: 1.6 };
    case 'cam':
      return { a0: f.a - 1.5, a1: f.a + 1.5, z0: girder(H).z0 - 4.5, z1: girder(H).z0, n: 3.5 };
    case 'sconce':
      return { a0: f.a - 1.5, a1: f.a + 1.5, z0: WAIN + 11, z1: WAIN + 17, n: 2 };
  }
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, and a look at the great door, a couple of deposit banks
// and the gold in the niches.
export function vaultPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L);
  const door = fs.find((f) => f.kind === 'door');
  if (door) out.push({ ...pt(door.wall, door.a, 9), kind: 'view', face: pt(door.wall, door.a, 0) });
  const shown = [...fs.filter((f) => f.kind === 'niche').slice(0, 2), ...fs.filter((f) => f.kind === 'bank').slice(0, 2)];
  for (const f of shown) out.push({ ...pt(f.wall, f.a, f.kind === 'bank' ? 7 : 5), kind: 'view', face: pt(f.wall, f.a, 0) });
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
      if (f.kind !== 'cam') continue;
      const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
      camLed(k, v, f);
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const STONE = ['#535c68', '#5b6571'] as const;
const GROUT = '#3b424c';

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen, s } = k;
  const { W, D, T } = v;
  if (!k.sees(T, T, -SLAB, W, D, 0, 8)) return;
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], STONE[0], 0);
  // The visible stretch of the floor: x - y and x + y ranges on the pen.
  const [ox, oy] = k.p(0, 0, 0);
  const pad = 2 * TILE;
  const dlo = (-ox) / s - pad;
  const dhi = (pen.width - ox) / s + pad;
  const slo = (2 * -oy) / s - pad;
  const shi = (2 * (pen.height - oy)) / s + pad;
  const cols = Math.ceil((W - T) / TILE);
  const rows = Math.ceil((D - T) / TILE);
  const seen = (x: number, y: number) => x - y >= dlo && x - y <= dhi && x + y >= slo && x + y <= shi;
  // The checker: the other stone in one path; a few slabs a shade off.
  const odd: P3[][] = [];
  const pale: P3[][] = [];
  for (let j = 0; j < rows; j++) {
    const y0 = T + j * TILE;
    const y1 = Math.min(D, y0 + TILE);
    for (let i = 0; i < cols; i++) {
      const x0 = T + i * TILE;
      const x1 = Math.min(W, x0 + TILE);
      if (!seen((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      const q: P3[] = [[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]];
      if ((i + j) & 1) odd.push(q);
      if (hash(i, j, 3) < 0.07) pale.push(q);
    }
  }
  pen.beginPath();
  for (const q of odd) k.trace(q);
  pen.fillStyle = STONE[1];
  pen.fill();
  pen.beginPath();
  for (const q of pale) k.trace(q);
  pen.fillStyle = withAlpha('#c8d2dc', 0.07);
  pen.fill();
  // grout
  const seg: Array<[P3, P3]> = [];
  for (let j = 1; j < rows; j++) seg.push([[T, T + j * TILE, 0], [W, T + j * TILE, 0]]);
  for (let i = 1; i < cols; i++) seg.push([[T + i * TILE, T, 0], [T + i * TILE, D, 0]]);
  k.segs(seg, GROUT, Math.max(0.7, 0.09 * s));
  if (k.fine) {
    // a polish: a soft light line along each slab's lit edge
    const sheen: Array<[P3, P3]> = [];
    for (let j = 0; j < rows; j++) sheen.push([[T, T + j * TILE + 0.18, 0], [W, T + j * TILE + 0.18, 0]]);
    k.segs(sheen, withAlpha('#dfe8f0', 0.12), 0.1 * s);
  }
  // The brass border, a slab in from the walls and the front cuts.
  const b = 3;
  const inlay = (d: number) => {
    k.line([[T + d, D - d, 0], [T + d, T + d, 0], [W - d, T + d, 0], [W - d, D - d, 0], [T + d, D - d, 0]], C.brassDark, Math.max(1, 0.32 * s));
    k.line([[T + d, D - d, 0], [T + d, T + d, 0], [W - d, T + d, 0], [W - d, D - d, 0], [T + d, D - d, 0]], C.brass, Math.max(0.8, 0.16 * s));
  };
  inlay(b);
  inlay(b + 1.2);
  // the brass star at the middle of the room
  const h = hub(plan.L);
  const R = Math.min(10, (W - T) * 0.06);
  if (k.sees(h.x - R, h.y - R, 0, h.x + R, h.y + R, 0)) star(k, h.x, h.y, R);
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#05081050');
  g.addColorStop(0.35, '#05081018');
  g.addColorStop(0.7, '#05081000');
  g.addColorStop(1, '#05081022');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#05081077'], [0.35, '#05081028'], [1, '#05081000']]), 0);
  }
  // A velvet runner in from the way in.
  const ent = plan.L.slots.find((q) => q.kind === 'entrance');
  if (ent) runner(new Kit(pen, frame(v.at, ent.wall, ent.x0, ent.y0), s), ent, plan.runner);
  // Pools of amber light where the stations' lamps shine.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  for (const [kind, u, w, r, a] of [['write', 0.5, 0.75, 9, 0.2], ['read', 0.85, 0.9, 8, 0.16], ['search', 0.45, 0.9, 9, 0.16], ['run', 0.45, 0.5, 12, 0.24], ['web', 0.5, 0.6, 9, 0.16], ['think', 0.5, 0.55, 11, 0.2], ['idle', 0.5, 0.45, 14, 0.26], ['entrance', 0.5, 1.2, 10, 0.22]] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (qk.sees(-r, -r, 0, q.len + r, q.dep + r, 0)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, C.lamp, a);
  }
  // and under the sconces, along the walls' feet
  for (const f of plan.features) {
    if (f.kind !== 'sconce' && f.kind !== 'niche') continue;
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (wk.sees(f.a - 8, 0, 0, f.a + 8, 6, 0)) wk.pool(f.a, 2.5, f.kind === 'niche' ? 6 : 7, 4, C.glow, f.kind === 'niche' ? 0.12 : 0.14);
  }
}

// A compass star inlaid in brass and dark stone, r units across.
function star(k: Kit, cx: number, cy: number, r: number): void {
  k.shadow(cx, cy, r * 1.05, r * 1.05, 0.08);
  k.disc(cx, cy, 0, r, '#454d58', k.thin);
  k.disc(cx, cy, 0, r * 0.93, C.brassDark, 0);
  k.disc(cx, cy, 0, r * 0.86, '#4d5560', 0);
  const pts = (n: number, r0: number, r1: number, rot: number): P3[] => {
    const out: P3[] = [];
    for (let i = 0; i < n * 2; i++) {
      const a = rot + (i / (n * 2)) * Math.PI * 2;
      const rr = i & 1 ? r1 : r0;
      out.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 0]);
    }
    return out;
  };
  k.poly(pts(4, r * 0.62, r * 0.2, Math.PI / 4), shade(C.brass, -0.12), 0);
  k.poly(pts(4, r * 0.84, r * 0.17, 0), C.brass, Math.max(0.8, k.thin * 0.7));
  // the lit half of each point
  const half: P3[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    half.push([cx, cy, 0], [cx + Math.cos(a) * r * 0.84, cy + Math.sin(a) * r * 0.84, 0], [cx + Math.cos(a + 0.4) * r * 0.2, cy + Math.sin(a + 0.4) * r * 0.2, 0]);
  }
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < half.length; i += 3) k.trace(half.slice(i, i + 3));
  pen.fillStyle = withAlpha(C.brassLight, 0.75);
  pen.fill();
  k.disc(cx, cy, 0, r * 0.12, C.brassLight, k.thin);
}

// The runner's span across the way in (u) and where it starts (v).
const RUN = { u0: 3.6, u1: 15 - 3.6, v0: 4 - 0.6 };

// How far out the runner reaches (up to 26 units) before it would run
// under a station or a piece of decor. The stage furnishes the room with
// planRoom seeded by the world's id, so the shell can find where the decor
// stands too (as it finds the stations).
function runnerLength(L: Layout): number {
  const ent = L.slots.find((q) => q.kind === 'entrance');
  if (!ent) return 0;
  const room = planRoom({ id: 'vault', stations: STATIONS, decor: DECOR } as unknown as WorldDef, L, hashString('vault'));
  const others = room.props.filter((p) => p.slot !== ent).map(footprint);
  let len = 0;
  for (let l = 1; l <= 26; l++) {
    const r = runnerArea(ent, l);
    if (others.some((q) => q.x0 < r.x1 + 1.5 && r.x0 < q.x1 + 1.5 && q.y0 < r.y1 + 1.5 && r.y0 < q.y1 + 1.5)) break;
    if (r.x1 > L.W - 4 || r.y1 > L.D - 4) break;
    len = l;
  }
  return len;
}

// The floor (world units) the runner covers when it is `len` long.
export function runnerArea(ent: Slot, len: number): Rect {
  const at = (u: number, w: number) => (ent.wall === 'right' ? [ent.x0 + u, ent.y0 + w] : [ent.x0 + w, ent.y0 + u]);
  const [ax, ay] = at(RUN.u0, RUN.v0);
  const [bx, by] = at(RUN.u1, RUN.v0 + len);
  return { x0: Math.min(ax, bx), y0: Math.min(ay, by), x1: Math.max(ax, bx), y1: Math.max(ay, by) };
}

// A velvet runner from the way in, with a gold border.
function runner(k: Kit, ent: Slot, len: number): void {
  if (len < 4) return;
  const { u0, u1, v0 } = RUN;
  const z = 0.05;
  const v1 = v0 + len;
  if (!k.sees(u0, v0, 0, u1, v1, 0)) return;
  k.shadow((u0 + u1) / 2, (v0 + v1) / 2, (u1 - u0) * 0.6, len * 0.55, 0.12);
  k.poly([[u0, v0, z], [u1, v0, z], [u1, v1, z], [u0, v1, z]], '#7e1d2c', k.thin);
  k.poly([[u0 + 0.5, v0, z], [u1 - 0.5, v0, z], [u1 - 0.5, v1 - 0.5, z], [u0 + 0.5, v1 - 0.5, z]], C.gold, 0);
  k.poly([[u0 + 0.85, v0, z], [u1 - 0.85, v0, z], [u1 - 0.85, v1 - 0.85, z], [u0 + 0.85, v1 - 0.85, z]], '#9c2638', 0);
  // a soft nap down the middle and diamonds woven along it
  const cu = (u0 + u1) / 2;
  k.poly([[cu - 1.1, v0, z], [cu + 1.1, v0, z], [cu + 1.1, v1 - 0.85, z], [cu - 1.1, v1 - 0.85, z]], withAlpha('#c43a4c', 0.5), 0);
  const pen = k.pen;
  pen.beginPath();
  for (let w = v0 + 3; w < v1 - 2; w += 4) k.trace([[cu, w - 0.8, z], [cu + 0.6, w, z], [cu, w + 0.8, z], [cu - 0.6, w, z]]);
  pen.fillStyle = withAlpha(C.gold, 0.8);
  pen.fill();
  // the fringe at the far end
  const seg: Array<[P3, P3]> = [];
  for (let u = u0 + 0.3; u < u1; u += 0.5) seg.push([[u, v1, z], [u, v1 + 0.5, z]]);
  k.segs(seg, C.goldLight, Math.max(0.7, 0.1 * k.s));
}

// ── walls ──────────────────────────────────────────────────────────────────

const PLATE: ReadonlyArray<readonly [number, Color]> = [[0, '#5f6b78'], [0.45, '#55606c'], [1, '#3e4752']];
const LOWER = '#3a414b';
const PW = 8; // plate width along the wall
const PH = 9; // plate height

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 4.5, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  const g = girder(H);
  const mine = plan.features.filter((f) => f.wall === wall);
  const spans = mine.map((f) => ({ f, r: reach(f, H) }));
  // Steel plate up to the girder: lit low by the lamps, darker going up.
  k.poly([[T, 0, WAIN], [end, 0, WAIN], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, WAIN, H, PLATE.map(([t, c]) => [t, tone(c)] as const)), 0);
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#0508104a'], [1, '#05081000']]), 0);
  // Plate seams with rivets, skipping what hangs over them.
  const covered = (a: number, z: number) => spans.some(({ f, r }) => f.kind !== 'sconce' && f.kind !== 'cam' && a > r.a0 - 0.5 && a < r.a1 + 0.5 && z > r.z0 - 0.5 && z < r.z1 + 0.5);
  const [ax0, ax1] = visibleAlong(k, T, end, WAIN, g.z0);
  const seams: Array<[P3, P3]> = [];
  const lights: Array<[P3, P3]> = [];
  const dots: P3[] = [];
  const zTop = g.z0;
  for (let a = T + PW; a < end - 0.5; a += PW) {
    if (a < ax0 - PW || a > ax1 + PW) continue;
    for (let z = WAIN + RAIL; z < zTop; z += PH) {
      const z1 = Math.min(zTop, z + PH);
      if (covered(a, (z + z1) / 2)) continue;
      seams.push([[a, 0, z], [a, 0, z1]]);
      lights.push([[a + (lit ? 0.12 : -0.12), 0, z], [a + (lit ? 0.12 : -0.12), 0, z1]]);
      if (s >= 3) for (let zz = z + 0.9; zz < z1 - 0.5; zz += 1.5) dots.push([a - 0.45, 0, zz], [a + 0.45, 0, zz]);
    }
  }
  for (let z = WAIN + RAIL + PH; z < zTop - 1; z += PH) {
    for (let a = Math.max(T, Math.floor((ax0 - T) / PW) * PW + T); a < Math.min(end, ax1 + PW); a += PW) {
      const a1 = Math.min(end, a + PW);
      if (covered((a + a1) / 2, z)) continue;
      seams.push([[a, 0, z], [a1, 0, z]]);
      lights.push([[a, 0, z - 0.14], [a1, 0, z - 0.14]]);
      if (s >= 3) for (let aa = a + 0.8; aa < a1 - 0.5; aa += 1.5) dots.push([aa, 0, z + 0.45], [aa, 0, z - 0.45]);
    }
  }
  k.segs(seams, withAlpha('#1b1f27', 0.75), Math.max(0.7, 0.12 * s));
  k.segs(lights, withAlpha('#c3ccd6', 0.18), Math.max(0.6, 0.08 * s));
  rivets(k, dots, tone('#8994a0'), 0.12);
  // The dark lower plates, a skirting, the brass rail.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, WAIN], [T, 0, WAIN]], k.vgrad(T, 0, 0, WAIN, [[0, tone(shade(LOWER, -0.15))], [1, tone(LOWER)]]), 0);
  const low: Array<[P3, P3]> = [];
  const lowLit: Array<[P3, P3]> = [];
  const ldots: P3[] = [];
  for (let a = T + 6; a < end - 0.5; a += 6) {
    if (a < ax0 - 6 || a > ax1 + 6) continue;
    low.push([[a, 0, SKIRT], [a, 0, WAIN]]);
    lowLit.push([[a + (lit ? 0.12 : -0.12), 0, SKIRT], [a + (lit ? 0.12 : -0.12), 0, WAIN]]);
    if (s >= 3) for (const z of [SKIRT + 0.7, WAIN - 0.7]) for (const da of [-0.5, 0.5]) ldots.push([a + da, 0, z]);
  }
  k.segs(low, withAlpha('#11141a', 0.8), Math.max(0.7, 0.12 * s));
  k.segs(lowLit, withAlpha('#9aa6b2', 0.16), Math.max(0.6, 0.08 * s));
  rivets(k, ldots, tone('#6e7884'), 0.12);
  // hazard paint along the foot, worn
  hazardBand(k, T, end, ax0, ax1, tone);
  k.box(T, 0, WAIN, end - T, 0.45, RAIL, C.brass, { line: k.thin, stripe: false });
  k.line([[T, 0.46, WAIN + RAIL - 0.12], [end, 0.46, WAIN + RAIL - 0.12]], withAlpha(C.brassLight, 0.8), Math.max(0.6, 0.08 * s));
  // What hangs on the wall.
  for (const { f, r } of spans) {
    if (!k.sees(r.a0, 0, r.z0, r.a1, r.n, r.z1)) continue;
    if (f.kind === 'bank') bank(k, v, f, lit);
    else if (f.kind === 'niche') niche(k, f);
    else if (f.kind === 'clock') clock(k, f);
    else if (f.kind === 'alarm') alarm(k, v, f);
    else if (f.kind === 'cam') camera(k, v, f);
    else if (f.kind === 'sconce') sconce(k, f);
    else if (f.kind === 'door') vaultDoor(k, f, lit);
  }
  // The girder along the top, the cornice, and caged lamps under it.
  k.box(T, 0, g.z0, end - T, 1.1, g.z1 - g.z0, C.gunmetal, { line: k.lw, stripe: false });
  const gd: P3[] = [];
  if (s >= 3) for (let a = Math.max(T + 1, ax0 - 2); a < Math.min(end - 0.5, ax1 + 2); a += 1.6) gd.push([a, 1.12, g.z0 + 0.6], [a, 1.12, g.z1 - 0.6]);
  rivets(k, gd, tone('#8a94a0'), 0.13);
  k.box(T, 0, H - 1.6, end - T, 0.6, 1.6, tone('#4a525d', 0.1), { line: k.thin, stripe: false });
  lamps(k, v, T, end, ax0, ax1);
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

// Yellow and black chevrons along the wall's foot, scuffed.
function hazardBand(k: Kit, a0: number, a1: number, ax0: number, ax1: number, tone: (c: Color, d?: number) => Color): void {
  k.rect(a0, 0, a1, SKIRT, 0.01, tone('#20242b'));
  const pen = k.pen;
  pen.beginPath();
  for (let a = Math.max(a0, Math.floor(ax0)); a < Math.min(a1 - 0.6, ax1); a += 1.6) {
    k.trace([[a, 0.02, 0.15], [a + 0.6, 0.02, 0.15], [a + 1.2, 0.02, SKIRT - 0.15], [a + 0.6, 0.02, SKIRT - 0.15]]);
  }
  pen.fillStyle = withAlpha(tone(C.hazard, 0.2), 0.75);
  pen.fill();
}

// A bank of deposit boxes in a steel frame: brass doors in rows, the big
// ones low, each with a name plate and a keyhole; a few stand open. Tall
// banks have a brass rail along the top and a library ladder on it.
function bank(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1: full } = bankZ(v.H);
  const z1 = bankTop(f, v.H);
  const a0 = f.a - f.w / 2;
  const a1 = f.a + f.w / 2;
  const n = 0.75;
  k.shadow(f.a, 0.6, f.w * 0.55, 1.6, 0.18);
  k.box(a0 - 0.6, 0, z0 - 0.7, f.w + 1.2, n, z1 - z0 + 1.4, C.steelDark, { line: k.lw, stripe: false });
  // the base the bank stands on, down to the rail
  k.box(a0 - 0.6, 0, WAIN + RAIL, f.w + 1.2, n + 0.2, z0 - 0.7 - WAIN - RAIL, C.gunmetal, { line: k.thin, stripe: false });
  // brass, lit warm at the foot and toward the lamps at the top
  const tone = (c: Color) => (lit ? c : shade(c, -0.12));
  k.rect(a0, z0, a1, z1, n + 0.01, k.vgrad(a0, n, z0, full, [[0, tone('#a8792f')], [0.3, tone('#c4933f')], [0.75, tone('#a67a34')], [1, tone('#c49444')]]));
  // the rows: two of big boxes at the foot, the rest small
  const cols = Math.max(2, Math.round(f.w / 2.2));
  const cw = f.w / cols;
  const heights: number[] = [3, 2.2];
  let sum = 5.2;
  while (sum + 1.6 <= z1 - z0 + 0.4) {
    heights.push(1.6);
    sum += 1.6;
  }
  const scale = (z1 - z0) / sum;
  const rows: Array<[number, number, number]> = []; // z0, z1, span (columns a door spans)
  let z = z0;
  heights.forEach((h, i) => {
    rows.push([z, z + h * scale, i === 0 ? 2 : 1]);
    z += h * scale;
  });
  const lightSide = k.lit(-1, 0); // the door edge toward lower u is lit
  const nn = n + 0.02;
  const seams: Array<[P3, P3]> = [];
  const bevel: Array<P3[]> = [];
  const plates: P3[][] = [];
  const holes: P3[] = [];
  const dark: P3[][] = [];
  const open: Array<{ a: number; w: number; z0: number; z1: number; r: number }> = [];
  const [vx0, vx1] = visibleAlong(k, a0, a1, z0, z1);
  for (const [r0, r1, span] of rows) {
    seams.push([[a0, nn, r0], [a1, nn, r0]]);
    for (let c = 0; c < cols; c += span) {
      const da = a0 + c * cw;
      const db = a0 + Math.min(cols, c + span) * cw;
      if (db < vx0 - 2 || da > vx1 + 2) continue;
      if (c > 0) seams.push([[da, nn, r0], [da, nn, r1]]);
      const i = Math.round(r0 * 7 + c * 13);
      if (hash(f.k, i, 1) < 0.022 && span === 1 && r1 - r0 < 2.5) {
        open.push({ a: da, w: db - da, z0: r0, z1: r1, r: hash(f.k, i, 2) });
        continue;
      }
      const e = 0.14;
      bevel.push(lightSide ? [[da + e, nn, r0 + e], [da + e, nn, r1 - e], [db - e, nn, r1 - e]] : [[db - e, nn, r0 + e], [db - e, nn, r1 - e], [da + e, nn, r1 - e]]);
      if (hash(f.k, i, 3) < 0.18) dark.push([[da, nn, r0], [db, nn, r0], [db, nn, r1], [da, nn, r1]]);
      if (s * cw >= 6) {
        const pm = (da + db) / 2;
        const ph = Math.min(0.32, (r1 - r0) * 0.18);
        const pz = r1 - (r1 - r0) * 0.32;
        plates.push([[pm - cw * 0.22, nn, pz - ph], [pm + cw * 0.22, nn, pz - ph], [pm + cw * 0.22, nn, pz + ph], [pm - cw * 0.22, nn, pz + ph]]);
        if (s >= 5) holes.push([pm, nn, r0 + (r1 - r0) * 0.32]);
      }
    }
  }
  seams.push([[a0, nn, z1], [a1, nn, z1]]);
  pen.beginPath();
  for (const q of dark) k.trace(q);
  pen.fillStyle = withAlpha('#5a3a10', 0.16);
  pen.fill();
  pen.beginPath();
  for (const q of bevel) {
    q.forEach(([a, w, zz], i) => {
      const [x, y] = k.p(a, w, zz);
      if (i) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
  }
  pen.strokeStyle = withAlpha('#ffeab0', 0.55);
  pen.lineWidth = Math.max(0.6, 0.09 * s);
  pen.lineJoin = 'round';
  pen.stroke();
  k.segs(seams, withAlpha(INK, 0.85), Math.max(0.7, 0.11 * s));
  pen.beginPath();
  for (const q of plates) k.trace(q);
  pen.fillStyle = withAlpha('#f7e7b8', 0.85);
  pen.fill();
  rivets(k, holes, '#3a2a14', 0.1);
  // open boxes: the dark inside, something kept there, the door swung out
  for (const o of open) {
    k.rect(o.a, o.z0, o.a + o.w, o.z1, nn, '#24180c', k.thin);
    if (o.r < 0.5) k.rect(o.a + 0.3, o.z0 + 0.1, o.a + o.w - 0.3, o.z0 + 0.45, nn + 0.01, C.gold);
    else k.rect(o.a + 0.4, o.z0 + 0.1, o.a + o.w - 0.6, o.z0 + 0.6, nn + 0.01, C.paper);
    const ha = lightSide ? o.a : o.a + o.w;
    const out = o.w * 0.6;
    k.poly([[ha, nn, o.z0], [ha, nn + out, o.z0 + 0.05], [ha, nn + out, o.z1 - 0.05], [ha, nn, o.z1]], k.side('#d6a84e', lightSide ? 1 : -1, 0, 0.2), k.thin);
  }
  // the frame's lit inner edge
  k.line([[a0, nn, z0], [a0, nn, z1], [a1, nn, z1]], withAlpha('#0e1116', 0.5), Math.max(0.8, 0.14 * s));
  // a rail and the ladder on it
  if (z1 - z0 > 18 && hash(f.k, 12) < 0.6) {
    const rz = z1 + 0.25;
    k.rod([[a0 - 0.3, n + 0.5, rz], [a1 + 0.3, n + 0.5, rz]], C.brass, 0.18);
    for (const a of [a0 + 0.4, a1 - 0.4]) k.rod([[a, n, rz], [a, n + 0.5, rz]], C.brass, 0.14);
    const la = a0 + 1.5 + hash(f.k, 7) * Math.max(0.5, f.w - 5);
    const foot = 3.4;
    const at = (side: number, zz: number): P3 => [la + side, n + 0.5 + (foot - 0.5) * (1 - zz / rz), zz];
    k.shadow(la + 0.7, foot, 1.2, 0.5, 0.22);
    for (const sd of [0, 1.4]) k.rod([at(sd, 0), at(sd, rz + 0.4)], C.walnut, 0.18);
    const rungs: Array<[P3, P3]> = [];
    for (let zz = 1.4; zz < rz - 0.5; zz += 1.5) rungs.push([at(0, zz), at(1.4, zz)]);
    k.segs(rungs, INK, Math.max(1.2, 0.14 * s + k.lw), 'round');
    k.segs(rungs, shade(C.walnut, 0.15), Math.max(0.8, 0.14 * s), 'round');
    for (const sd of [0, 1.4]) k.rod([at(sd, rz - 0.2), at(sd, rz + 0.5), [la + sd, n + 0.5, rz + 0.5]], C.brass, 0.1);
  }
}

// A glass niche of gold bars lit from inside: a steel frame round a
// recess, two shelves of bars, a strip lamp along the top, the glass
// catching the light.
function niche(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const a0 = f.a - f.w / 2;
  const a1 = f.a + f.w / 2;
  const z0 = WAIN + 2.6;
  const z1 = WAIN + 16;
  const depth = 2.2;
  k.box(a0 - 0.6, 0, z0 - 0.6, f.w + 1.2, 0.5, z1 - z0 + 1.2, C.gunmetal, { line: k.lw, stripe: false });
  const open: P3[] = [[a0, 0.51, z0], [a1, 0.51, z0], [a1, 0.51, z1], [a0, 0.51, z1]];
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  // the back, warm under the strip lamp
  k.rect(a0 - 2, z0 - 1, a1 + 2, z1 + 1, -depth, k.vgrad(f.a, -depth, z0, z1, [[0, '#3a2a1a'], [0.6, '#6a4a24'], [1, '#a8742e']]));
  // the reveal: the lit side's wall and the ceiling
  const side = k.lit(1, 0) ? a0 : a1;
  k.poly([[side, 0.5, z0], [side, -depth, z0], [side, -depth, z1], [side, 0.5, z1]], k.lit(1, 0) ? '#5a4024' : '#2c2018', 0);
  k.poly([[a0, 0.5, z1], [a1, 0.5, z1], [a1, -depth, z1], [a0, -depth, z1]], '#1c1712', 0);
  // two shelves of bars
  const shelves = [z0, z0 + (z1 - z0) * 0.48];
  for (const [i, sz] of shelves.entries()) {
    k.poly([[a0, 0.5, sz], [a1, 0.5, sz], [a1, -depth, sz], [a0, -depth, sz]], i ? '#3b3f46' : '#2a2620', 0);
    if (i) k.line([[a0, 0.5, sz], [a1, 0.5, sz]], withAlpha('#dbe6f0', 0.6), Math.max(0.8, 0.1 * s));
    const cols = Math.max(1, Math.floor((f.w - 0.8) / 1.95));
    barStack(k, f.a - (cols * 1.95) / 2 + 0.05, -depth + 0.3, sz + 0.05, cols, 2, 3, 1.85, 0.85, 0.45);
  }
  k.halo(f.a, -0.5, z1 - 0.6, f.w * 0.7, C.glow, 0.45);
  pen.restore();
  // the strip lamp, the glass
  k.rect(a0 + 0.3, z1 - 0.45, a1 - 0.3, z1 - 0.1, 0.52, '#fff2c8', 0);
  pen.beginPath();
  k.trace([[a0 + 0.8, 0.53, z0 + 0.4], [a0 + 2.2, 0.53, z0 + 0.4], [a0 + 4.6, 0.53, z1 - 0.6], [a0 + 3.2, 0.53, z1 - 0.6]]);
  k.trace([[a0 + 3.0, 0.53, z0 + 0.4], [a0 + 3.5, 0.53, z0 + 0.4], [a0 + 5.9, 0.53, z1 - 0.6], [a0 + 5.4, 0.53, z1 - 0.6]]);
  pen.fillStyle = withAlpha('#ffffff', 0.13);
  pen.fill();
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  // a brass plate under it (no words)
  k.box(f.a - 1.4, 0.5, z0 - 2.0, 2.8, 0.15, 0.9, C.brass, { line: k.thin, stripe: false });
}

// The bank clock: a brass bezel, a cream face with hour marks, hands.
function clock(k: Kit, f: Feature): void {
  const z = WAIN + 12.5;
  const r = 2.6;
  k.shadow(f.a + 0.2, 0.25, r * 0.9, 0.5, 0.12, z - r - 0.2);
  k.face(f.a, 0.15, z, r + 0.15, C.brassDark, k.lw, 32);
  k.face(f.a, 0.35, z, r, C.brass, k.thin, 32);
  k.face(f.a, 0.45, z, r * 0.84, C.cream, k.thin, 32);
  const seg: Array<[P3, P3]> = [];
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    const r0 = r * (i % 3 === 0 ? 0.56 : 0.66);
    seg.push([[f.a + Math.cos(th) * r0, 0.47, z + Math.sin(th) * r0], [f.a + Math.cos(th) * r * 0.76, 0.47, z + Math.sin(th) * r * 0.76]]);
  }
  k.segs(seg, INK, Math.max(0.7, 0.1 * k.s));
  const hh = 0.9 + hash(f.k, 3) * 4;
  k.line([[f.a, 0.5, z], [f.a + Math.cos(hh) * r * 0.42, 0.5, z + Math.sin(hh) * r * 0.42]], INK, Math.max(1, 0.18 * k.s));
  k.line([[f.a, 0.5, z], [f.a + Math.cos(hh * 5.3) * r * 0.66, 0.5, z + Math.sin(hh * 5.3) * r * 0.66]], INK, Math.max(0.8, 0.11 * k.s));
  k.face(f.a, 0.52, z, 0.18, C.brassDark, 0, 10);
}

// A red alarm bell on a box, its conduit running up to the girder.
function alarm(k: Kit, v: RoomView, f: Feature): void {
  const z = WAIN + 12;
  const top = girder(v.H).z0;
  k.rod([[f.a + 0.5, 0.35, z + 1.2], [f.a + 0.5, 0.35, Math.min(top, z + 7)]], C.steelDark, 0.2);
  k.box(f.a, 0, Math.min(top, z + 7) - 0.2, 1.0, 0.5, 1.0, C.gunmetal, { line: k.thin, stripe: false });
  k.box(f.a - 0.9, 0, z - 1.4, 1.8, 0.6, 1.6, C.red, { line: k.thin });
  // the bell: a red dome facing out, a striker under it
  const pts = ring(k, [f.a, 0.9, z + 0.7], [0, 1, 0], 1.25, 24);
  const back = ring(k, [f.a, 0.6, z + 0.7], [0, 1, 0], 1.25, 24);
  const sil = hull([...pts, ...back]);
  fillPts(k, sil, C.red, k.lw);
  const [cx, cy] = k.p(f.a, 1.1, z + 0.7);
  const g = k.pen.createRadialGradient(cx - 0.5 * k.s, cy - 0.5 * k.s, 0, cx, cy, 1.3 * k.s);
  g.addColorStop(0, '#ff9a8a');
  g.addColorStop(0.5, C.red);
  g.addColorStop(1, '#8a1f1a');
  fillPts(k, pts, g, k.thin);
  k.face(f.a, 1.15, z + 0.7, 0.25, C.chrome, k.thin, 10);
}

// A security camera on a bracket under the girder, looking down at the
// room. Its light blinks (see the overlay).
const CAM_Z = (H: number) => girder(H).z0 - 2.4;

function camera(k: Kit, v: RoomView, f: Feature): void {
  const z = CAM_Z(v.H);
  k.box(f.a - 0.5, 0, z + 0.6, 1.0, 0.3, 1.6, C.gunmetal, { line: k.thin, stripe: false });
  k.rod([[f.a, 0.3, z + 1.2], [f.a, 1.2, z + 1.2], [f.a, 1.2, z + 0.7]], C.gunmetal, 0.18);
  // the body, tipped down toward the room
  const tip = (a: number, n: number, zz: number): P3 => [a, n, zz - (n - 0.7) * 0.35];
  const a0 = f.a - 0.6;
  const a1 = f.a + 0.6;
  const n0 = 0.7;
  const n1 = 3.3;
  const zb = z - 0.4;
  const zt = z + 0.5;
  const body = '#d9dee3';
  k.poly([tip(a0, n0, zt), tip(a1, n0, zt), tip(a1, n1, zt), tip(a0, n1, zt)], shade(body, 0.08), k.thin);
  k.poly([tip(a0, n1, zb), tip(a1, n1, zb), tip(a1, n1, zt), tip(a0, n1, zt)], k.side(body, 0, 1), k.thin);
  const end = k.lit(1, 0) ? a1 : a0;
  k.poly([tip(end, n0, zb), tip(end, n1, zb), tip(end, n1, zt), tip(end, n0, zt)], k.side(body, k.lit(1, 0) ? 1 : -1, 0, 0.22), k.thin);
  // the hood and the lens
  k.poly([tip(a0 - 0.1, n0 + 0.5, zt + 0.15), tip(a1 + 0.1, n0 + 0.5, zt + 0.15), tip(a1 + 0.1, n1 + 0.5, zt + 0.15), tip(a0 - 0.1, n1 + 0.5, zt + 0.15)], C.gunmetal, k.thin);
  const [lx, ly] = k.p(...tip(f.a, n1 + 0.01, (zb + zt) / 2));
  k.pen.beginPath();
  k.pen.ellipse(lx, ly, 0.36 * k.s, 0.32 * k.s, 0, 0, Math.PI * 2);
  k.paint('#1a2230', k.thin);
  k.pen.beginPath();
  k.pen.arc(lx - 0.1 * k.s, ly - 0.1 * k.s, Math.max(0.6, 0.1 * k.s), 0, Math.PI * 2);
  k.pen.fillStyle = '#7fa8d6';
  k.pen.fill();
}

// The camera's tally light, on for a beat every couple of seconds.
function camLed(k: Kit, v: RoomView, f: Feature): void {
  const ph = (v.t * 0.55 + hash(f.k, 1)) % 1;
  if (ph > 0.3) return;
  const z = CAM_Z(v.H);
  const n = 2.9;
  const zz = z + 0.5 - (n - 0.7) * 0.35 + 0.18;
  const a = f.a + (k.lit(1, 0) ? -0.3 : 0.3);
  if (!k.sees(a - 1, n - 1, zz - 1, a + 1, n + 1, zz + 1)) return;
  k.halo(a, n, zz, 1.4, '#ff4a3a', 0.5);
  const [x, y] = k.p(a, n, zz);
  k.pen.beginPath();
  k.pen.arc(x, y, Math.max(1, 0.16 * k.s), 0, Math.PI * 2);
  k.pen.fillStyle = '#ffd0c8';
  k.pen.fill();
}

// An amber cage lamp on a curled bracket, washing the wall round it.
function sconce(k: Kit, f: Feature): void {
  const z = WAIN + 14;
  k.wash(f.a, 0.05, z - 1, 6, 7, C.glow, 0.2);
  k.poly([[f.a - 0.45, 0.02, z - 1.8], [f.a + 0.45, 0.02, z - 1.8], [f.a + 0.45, 0.02, z + 0.4], [f.a - 0.45, 0.02, z + 0.4]], C.brass, k.thin, 0.3);
  k.rod([[f.a, 0.05, z - 0.9], [f.a, 0.8, z - 1.0], [f.a, 1.3, z - 0.4], [f.a, 1.3, z + 0.5]], C.brass, 0.16);
  cageLamp(k, f.a, 1.3, z + 1.3, 0.62, true, 0.42);
}

// Caged lamps hanging under the girder all along a wall.
function lamps(k: Kit, v: RoomView, a0: number, a1: number, ax0: number, ax1: number): void {
  const g = girder(v.H);
  const z = g.z0 - 1.6;
  const pitch = 13;
  const list: number[] = [];
  for (let a = a0 + 6; a < a1 - 3; a += pitch) if (a > ax0 - 10 && a < ax1 + 10) list.push(a);
  if (!list.length) return;
  for (const a of list) k.wash(a, 0.05, z - 6, 7, 9, C.glow, 0.16);
  for (const a of list) {
    k.rod([[a, 0.6, g.z0], [a, 0.6, z + 0.9]], INK, 0.08);
    cageLamp(k, a, 0.6, z, 0.5, true, 0.32);
  }
}

// The great round vault door, swung open flat against the wall beside the
// way in: a steel slab with chrome bolts round its rim, rings turned into
// its face, a brass handwheel and two dials, hung on a massive hinge on
// the way in's side.
function vaultDoor(k: Kit, f: Feature, lit: boolean): void {
  const { pen } = k;
  const R = DOOR_R;
  const a = f.a;
  const zc = R + 0.15;
  const n0 = 0.9;
  const n1 = 3.0;
  const side = f.side ?? -1; // toward the hinge
  const steel = lit ? '#8a96a3' : shade('#8a96a3', -0.12);
  // its shadow on the wall and the floor
  k.shadow(a, n1 * 0.6, R * 0.9, 2.2, 0.3);
  pen.beginPath();
  k.trace(circle(a + 0.8, 0.03, zc - 0.6, R + 0.6, 32));
  pen.fillStyle = withAlpha('#05070c', 0.3);
  pen.fill();
  // the hinge: two knuckles on a post, arms to the door's rim
  const ha = a + side * (R + 0.6);
  for (const dz of [-3.2, 2.2]) {
    k.box(ha - 0.4 * side - 0.4, 0, zc + dz, 0.8, 1.6, 1.0, C.steelDark, { line: k.thin });
    k.box(Math.min(ha, a + side * (R - 1.2)), n0 + 0.4, zc + dz + 0.1, Math.abs(ha - (a + side * (R - 1.2))), 1.2, 0.8, C.steel, { line: k.thin });
  }
  k.cyl(ha, 1.6, zc - 4.4, 0.55, 8.4, C.chrome);
  // bolts round the rim (not the bottom), behind the slab
  const nm = (n0 + n1) / 2;
  for (let i = 0; i < 14; i++) {
    const th = (i / 14) * Math.PI * 2 + 0.11;
    if (Math.sin(th) < -0.55) continue;
    const c = Math.cos(th);
    const sn = Math.sin(th);
    k.rod([[a + c * (R - 0.4), nm, zc + sn * (R - 0.4)], [a + c * (R + 0.9), nm, zc + sn * (R + 0.9)]], C.chrome, 0.62);
  }
  // the slab: its rim band, then the face
  const back = ring(k, [a, n0, zc], [0, 1, 0], R, 40);
  const front = ring(k, [a, n1, zc], [0, 1, 0], R, 40);
  const sil = hull([...back, ...front]);
  const xs = sil.map((p) => p[0]);
  const gr = pen.createLinearGradient(Math.min(...xs), 0, Math.max(...xs), 0);
  gr.addColorStop(0, shade(steel, 0.1));
  gr.addColorStop(0.4, steel);
  gr.addColorStop(1, shade(steel, -0.35));
  fillPts(k, sil, gr, k.lw);
  const [cx, cy] = k.p(a, n1, zc);
  const fg = pen.createRadialGradient(cx - R * 0.45 * k.s, cy - R * 0.5 * k.s, 0, cx, cy, R * 1.25 * k.s);
  fg.addColorStop(0, shade(steel, 0.3));
  fg.addColorStop(0.55, steel);
  fg.addColorStop(1, shade(steel, -0.18));
  fillPts(k, front, fg, k.lw);
  // turned rings in the face
  for (const [r, c, w] of [[R * 0.9, shade(steel, -0.22), 0.6], [R * 0.86, shade(steel, 0.25), 0.4], [R * 0.62, shade(steel, -0.25), 0.6], [R * 0.58, shade(steel, 0.22), 0.4]] as const) {
    pen.beginPath();
    k.trace(circle(a, n1 + 0.02, zc, r, 40));
    pen.strokeStyle = c;
    pen.lineWidth = Math.max(0.7, w * 0.25 * k.s);
    pen.stroke();
  }
  // a ring of bolt heads between the rings
  const heads: P3[] = [];
  for (let i = 0; i < 20; i++) {
    const th = (i / 20) * Math.PI * 2;
    heads.push([a + Math.cos(th) * R * 0.74, n1 + 0.03, zc + Math.sin(th) * R * 0.74]);
  }
  rivets(k, heads, shade(steel, 0.35), 0.24);
  // two dials over the wheel
  for (const da of [-1.6, 1.6]) dial(k, a + da, n1 + 0.05, zc + R * 0.42, 0.9, da, '#e8e2d2', C.chrome);
  // the handwheel: a hub, three spokes, a rim with knobs
  const wz = zc - 0.4;
  const wn = n1 + 0.7;
  k.rod([[a, n1, wz], [a, wn, wz]], C.chrome, 0.45);
  const rimR = R * 0.38;
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * Math.PI * 2 + 0.5;
    k.rod([[a, wn, wz], [a + Math.cos(th) * rimR, wn, wz + Math.sin(th) * rimR]], C.brass, 0.3);
  }
  pen.beginPath();
  k.trace(circle(a, wn, wz, rimR, 32));
  pen.strokeStyle = INK;
  pen.lineWidth = 0.32 * k.s + k.lw * 1.4;
  pen.stroke();
  pen.strokeStyle = C.brass;
  pen.lineWidth = 0.32 * k.s;
  pen.stroke();
  pen.beginPath();
  k.trace(circle(a - 0.05, wn, wz + 0.05, rimR, 32).slice(8, 20));
  pen.strokeStyle = withAlpha(C.brassLight, 0.9);
  pen.lineWidth = Math.max(0.6, 0.1 * k.s);
  pen.stroke();
  for (let i = 0; i < 3; i++) {
    const th = (i / 3) * Math.PI * 2 + 0.5 + Math.PI / 3;
    const [x, y] = k.p(a + Math.cos(th) * rimR, wn, wz + Math.sin(th) * rimR);
    pen.beginPath();
    pen.arc(x, y, 0.32 * k.s, 0, Math.PI * 2);
    k.paint(C.brassLight, k.thin);
  }
  k.face(a, wn + 0.05, wz, 0.65, C.brass, k.thin, 16);
  k.face(a, wn + 0.1, wz, 0.25, C.brassLight, 0, 10);
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  const cap = '#7e858e';
  const cut = '#5c636c';
  // the floor's cut edges
  if (k.sees(T, D - 1, -SLAB, W, D, 0) || k.sees(W - 1, T, -SLAB, W, D, 0)) {
    k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#3c424a', 0, 1), k.lw);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#3c424a', 1, 0), k.lw);
    k.line([[T, D, -0.35], [W, D, -0.35], [W, T, -0.35]], '#6b737d', Math.max(1, 0.22 * k.s));
  }
  // the walls' cut ends: concrete with steel lining and rebar
  k.poly([[0, D, -SLAB], [T, D, -SLAB], [T, D, H], [0, D, H]], k.side(cut, 0, 1), k.lw);
  k.poly([[W, 0, -SLAB], [W, T, -SLAB], [W, T, H], [W, 0, H]], k.side(cut, 1, 0), k.lw);
  for (const [p, q] of [[[0, D], [T, D]], [[W, 0], [W, T]]] as const) {
    const at = (f: number, z: number): P3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z];
    k.poly([at(0.86, -SLAB), at(1, -SLAB), at(1, H), at(0.86, H)], withAlpha('#2b3038', 0.6), 0);
    const dots: P3[] = [];
    for (let z = 2; z < H - 1; z += 3) for (const f of [0.25, 0.55]) dots.push(at(f, z + (f > 0.4 ? 1.5 : 0)));
    rivets(k, dots, withAlpha('#2b3038', 0.55), 0.2);
  }
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.35), Math.max(1, 0.2 * k.s));
  k.line([[T - 0.35, D, H], [T - 0.35, T - 0.35, H], [W, T - 0.35, H]], withAlpha('#2b3038', 0.45), Math.max(1, 0.16 * k.s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}
