import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import { hangLantern, nugget, pickaxe, rails, rock, ropeCoil, shovel, sparkle } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, wave, withAlpha } from './kit.ts';

// The mine's shell: a gallery cut from layered rock, its floor packed earth
// and gravel. The walls show their strata, two coal seams running through
// them and veins of gold here and there; timber posts carry a wall plate
// along each wall, lanterns hang off every other post, and between them
// hang tool racks, a notice board with the survey, a ladder up to an old
// working, and on each wall the timbered mouth of a drift running off into
// the dark, its rails coming out across the floor. Every piece sits in the
// free stretches of wall between the stations, worked out from the same
// plan the stage uses, so nothing hangs behind a forge or the lift.

type Wall = 'left' | 'right';
type Kind = 'adit' | 'post' | 'lamp' | 'rack' | 'board' | 'ladder' | 'vein';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Rail = { wall: Wall; a: number; len: number };
export type Scatter = { x: number; y: number; k: number };
export type Plan = { L: Layout; features: Feature[]; rails: Rail[]; scatter: Scatter[] };

const SLAB = 3; // the floor's thickness, shown along the front cut
const AW = 11; // a drift's opening, wide
const AH = 15; // and high (under the cap)
const ADIT = AW + 4; // the portal, posts and all
const BAY = 15; // posts at most this far apart
const LAMP_Z = 20.5; // where a lamp's bracket leaves its post

// The wall plate: the beam the posts carry, its underside (z).
export const plateZ = (H: number) => Math.min(H - 7, 30);

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// what stands along the walls between them and what lies on the floor.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'mines');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const fs = features(L);
  const rails = railsOut(L, fs);
  const plan = { L, features: fs, rails, scatter: scatter(L, rails) };
  PLANS.set(key, plan);
  return plan;
}

// A drift on each wall in its longest free stretch; then posts along what
// is left at most a bay apart, a lamp on every other one, and between them
// a rack of tools, a vein of gold, the notice board or a ladder up to an
// old working.
function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 1.5 : 2);
      const a1 = Math.min(g1, end - 1.5) - (g1 >= end ? 0 : 2);
      if (a1 - a0 >= 1.4) spans.push({ wall, a0, a1 });
    }
  }
  let n = 0;
  for (const wall of ['right', 'left'] as const) {
    const fits = spans.filter((s) => s.wall === wall && s.a1 - s.a0 >= ADIT + 6).sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0));
    const pick = fits[0];
    if (!pick) continue;
    // a little off the middle, toward the back
    const mid = pick.a0 + (pick.a1 - pick.a0) * 0.45;
    const a = Math.max(pick.a0 + ADIT / 2 + 1, Math.min(pick.a1 - ADIT / 2 - 1, mid));
    out.push({ wall, kind: 'adit', a, w: ADIT, k: n++ });
    spans.splice(spans.indexOf(pick), 1, { wall, a0: pick.a0, a1: a - ADIT / 2 - 1 }, { wall, a0: a + ADIT / 2 + 1, a1: pick.a1 });
  }
  const WIDTH: Record<Kind, number> = { adit: ADIT, post: 1.4, lamp: 2.4, rack: 8, board: 7, ladder: 5, vein: 8 };
  const ORDER: Array<Kind | null> = ['vein', 'rack', null, 'board', 'vein', 'ladder', null, 'rack', 'vein', null, 'ladder', 'board', 'vein', null];
  const cap: Partial<Record<Kind, number>> = { board: 1, ladder: 1, rack: 2, vein: 3 };
  const counts = { left: {} as Partial<Record<Kind, number>>, right: {} as Partial<Record<Kind, number>> };
  const tall = L.H >= 44; // room above the wall plate for an upper working
  let bay = 0;
  let lamp = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    if (len < 1.4) continue;
    const m = Math.max(1, Math.ceil((len - 1.4) / BAY));
    const at = (i: number) => s.a0 + 0.7 + ((len - 1.4) * i) / m;
    for (let i = 0; i <= m; i++) {
      if (i === m && len - 1.4 < 0.5) break;
      out.push({ wall: s.wall, kind: 'post', a: at(i), w: WIDTH.post, k: n++ });
      if (lamp++ % 2 === 0) out.push({ wall: s.wall, kind: 'lamp', a: at(i), w: WIDTH.lamp, k: n++ });
    }
    for (let i = 0; i < m; i++) {
      const room = at(i + 1) - at(i) - 1.4 - 2;
      for (let j = 0; j < ORDER.length; j++) {
        const kind = ORDER[(bay + j) % ORDER.length];
        if (kind === null) {
          bay += j + 1;
          break;
        }
        const count = counts[s.wall];
        if (WIDTH[kind] > room || (count[kind] ?? 0) >= (cap[kind] ?? Infinity) || (kind === 'ladder' && !tall)) continue;
        count[kind] = (count[kind] ?? 0) + 1;
        out.push({ wall: s.wall, kind, a: (at(i) + at(i + 1)) / 2, w: WIDTH[kind], k: n++ });
        bay += j + 1;
        break;
      }
    }
  }
  return out;
}

// Rails out of each drift across the floor, as far as is clear of the
// stations (at most 36 units).
function railsOut(L: Layout, fs: Feature[]): Rail[] {
  const rects = L.slots.map(slotRect);
  const out: Rail[] = [];
  for (const f of fs) {
    if (f.kind !== 'adit') continue;
    let len = 0;
    for (let d = 1; d <= 36; d++) {
      const [x, y] = f.wall === 'right' ? [f.a, L.T + d] : [L.T + d, f.a];
      const r = 2.5;
      const hit = rects.some((q) => x + r > q.x0 - 3 && x - r < q.x1 + 3 && y + r > q.y0 - 3 && y - r < q.y1 + 3);
      if (hit || x > L.W - 4 || y > L.D - 4) break;
      len = d;
    }
    if (len >= 6) out.push({ wall: f.wall, a: f.a, len });
  }
  // Lines out of the two walls would cross near the corner: each stops
  // short of the other.
  const r = out.find((q) => q.wall === 'right');
  const l = out.find((q) => q.wall === 'left');
  if (r && l && r.a - 2.5 < L.T + l.len + 2 && l.a - 2.5 < L.T + r.len + 2) {
    const rl = Math.min(r.len, l.a - L.T - 5);
    const ll = Math.min(l.len, r.a - L.T - 5);
    r.len = rl;
    l.len = ll;
  }
  return out.filter((q) => q.len >= 6);
}

// Little heaps of fallen rock and ore out on the open floor, clear of the
// stations, their walkways and the rails.
function scatter(L: Layout, rs: Rail[]): Scatter[] {
  const rects = L.slots.map(slotRect);
  const out: Scatter[] = [];
  const want = Math.round(((L.W - L.T) * (L.D - L.T)) / 1400);
  for (let i = 0; i < want * 4 && out.length < want; i++) {
    const x = L.T + 5 + hash(i, 211) * (L.W - L.T - 9);
    const y = L.T + 5 + hash(i, 212) * (L.D - L.T - 9);
    if (rects.some((q) => x > q.x0 - 5 && x < q.x1 + 5 && y > q.y0 - 5 && y < q.y1 + 9)) continue;
    if (rs.some((rl) => (rl.wall === 'right' ? Math.abs(x - rl.a) < 5 && y < L.T + rl.len + 4 : Math.abs(y - rl.a) < 5 && x < L.T + rl.len + 4))) continue;
    if (out.some((p) => Math.hypot(p.x - x, p.y - y) < 12)) continue;
    out.push({ x, y, k: i });
  }
  return out;
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots (warm round the camp fire, a drink by the pump), and a
// look down each drift.
export function minesPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L);
  for (const f of fs.filter((g) => g.kind === 'adit')) out.push({ ...pt(f.wall, f.a + 4, 7), kind: 'view', face: pt(f.wall, f.a, 0) });
  for (const f of fs.filter((g) => g.kind === 'vein').slice(0, 2)) out.push({ ...pt(f.wall, f.a, 5), kind: 'view', face: pt(f.wall, f.a, 0) });
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
};

// ── floor ──────────────────────────────────────────────────────────────────

const EARTH = '#725843';
const PATCH = ['#634a37', '#81644b', '#6b503b'];
const PEBBLE = ['#8e8174', '#796c60', '#97806a', '#665b51'];

// A blob of `n` points round (x, y) in the floor plane, radii rx, ry.
function blob(k: Kit, x: number, y: number, rx: number, ry: number, seed: number, z = 0, n = 9): void {
  const pts: P3[] = [];
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const j = 0.7 + hash(seed, i, 5) * 0.5;
    pts.push([x + Math.cos(th) * rx * j, y + Math.sin(th) * ry * j, z]);
  }
  k.trace(pts, Math.min(rx, ry) * 0.5);
}

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  // Packed earth: lighter where it is trodden in the middle.
  const [cx, cy] = k.p((W + T) / 2, (D + T) / 2, 0);
  const far = k.p(W, D, 0);
  const R = Math.hypot(far[0] - cx, far[1] - cy) * 1.3;
  const g = pen.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, shade(EARTH, 0.06));
  g.addColorStop(0.55, EARTH);
  g.addColorStop(1, shade(EARTH, -0.12));
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  // Patches of darker and lighter earth (only those on this tile).
  const area = (W - T) * (D - T);
  const patches = Math.round(area / 200);
  PATCH.forEach((tone, ti) => {
    pen.beginPath();
    for (let i = ti; i < patches; i += PATCH.length) {
      const x = T + 2 + hash(i, 301) * (W - T - 4);
      const y = T + 2 + hash(i, 302) * (D - T - 4);
      const r = 3 + hash(i, 303) * 6;
      if (!k.vis(x, y, 0, r * 1.5)) continue;
      blob(k, x, y, r * 1.3, r, i);
    }
    pen.fillStyle = withAlpha(tone, 0.2);
    pen.fill();
  });
  // Gravel: a shadow under each pebble, then the pebbles by tone.
  const pebbles = Math.round(area / 70);
  const vis: number[] = [];
  for (let i = 0; i < pebbles; i++) {
    const x = T + 1 + hash(i, 311) * (W - T - 2);
    const y = T + 1 + hash(i, 312) * (D - T - 2);
    if (k.vis(x, y, 0, 1)) vis.push(i);
  }
  const peb = (i: number, dz: number, grow: number) => {
    const x = T + 1 + hash(i, 311) * (W - T - 2);
    const y = T + 1 + hash(i, 312) * (D - T - 2);
    const r = (0.22 + hash(i, 313) * 0.42) * grow;
    const [px, py] = k.p(x, y, 0);
    pen.moveTo(px + r * s * 1.2, py + dz * s);
    pen.ellipse(px, py + dz * s, r * s * 1.2, r * s * 0.75, 0, 0, Math.PI * 2);
  };
  pen.beginPath();
  for (const i of vis) peb(i, 0.12, 1.15);
  pen.fillStyle = '#3a261838';
  pen.fill();
  PEBBLE.forEach((tone, ti) => {
    pen.beginPath();
    for (const i of vis) if (Math.floor(hash(i, 314) * PEBBLE.length) === ti) peb(i, -0.05, 1);
    pen.fillStyle = tone;
    pen.fill();
  });
  if (k.fine) {
    pen.beginPath();
    for (const i of vis) {
      const x = T + 1 + hash(i, 311) * (W - T - 2);
      const y = T + 1 + hash(i, 312) * (D - T - 2);
      const r = 0.22 + hash(i, 313) * 0.42;
      const [px, py] = k.p(x, y, 0);
      pen.moveTo(px - r * s * 0.7, py - r * s * 0.35);
      pen.quadraticCurveTo(px - r * s * 0.3, py - r * s * 0.75, px + r * s * 0.3, py - r * s * 0.65);
    }
    pen.strokeStyle = '#f3e6d066';
    pen.lineWidth = Math.max(0.6, 0.06 * s);
    pen.stroke();
  }
  // Darker toward the walls' feet, the far corner and the front edges.
  const corner = k.p(T, T, 0);
  const cg = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  cg.addColorStop(0, '#24130844');
  cg.addColorStop(0.3, '#24130814');
  cg.addColorStop(0.7, '#24130800');
  cg.addColorStop(1, '#24130830');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], cg, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 5, 0], [T, 5, 0]], wk.lgrad([0, 0, 0], [0, 5, 0], [1, 0, 0], [[0, '#1e100670'], [0.4, '#1e100628'], [1, '#1e100600']]), 0);
    rubble(wk, v, plan, wall, end);
  }
  // Fallen rock and ore lying about, then the rails out of the drifts.
  for (const sc of plan.scatter) {
    if (!k.vis(sc.x, sc.y, 0, 4)) continue;
    const n = 2 + Math.floor(hash(sc.k, 221) * 3);
    const lumps: Array<[number, number, number]> = [];
    for (let j = 0; j < n; j++) lumps.push([sc.x + (hash(sc.k, j, 222) - 0.5) * 3, sc.y + (hash(sc.k, j, 223) - 0.5) * 2.4, j]);
    lumps.sort((p, q) => p[0] + p[1] - (q[0] + q[1]));
    for (const [x, y, j] of lumps) {
      const r = 0.35 + hash(sc.k, j, 224) * 0.55;
      const gold = hash(sc.k, j, 225) < 0.12;
      if (gold) nugget(k, x, y, 0, r * 0.6, sc.k + j);
      else rock(k, x, y, 0, r, r * 0.75, hash(sc.k, j, 226) < 0.6 ? C.stone : hash(sc.k, j, 227) < 0.5 ? C.rockLight : C.coal, sc.k * 5 + j, k.thin);
    }
  }
  // The rails out of the drifts.
  for (const r of plan.rails) {
    const wk = new Kit(pen, wallAt(v.at, r.wall, T), s);
    if (!wk.vis(r.a, r.len / 2, 0, r.len / 2 + 4)) continue;
    // a frame with u out of the wall, v along it
    const rk = new Kit(pen, (u, w, z) => wk.p(w, u, z), s);
    rails(rk, -0.4, r.len, r.a, 0.02);
    // the stop at the end: a timber chock across the rails, a lump of ore by it
    rk.box(r.len - 0.9, r.a - 1.5, 0.02, 0.8, 3, 0.75, C.timberOld, { line: rk.thin });
    rk.box(r.len - 0.8, r.a - 1.3, 0.77, 0.6, 2.6, 0.55, C.timber, { line: rk.thin });
    nugget(rk, r.len + 0.8, r.a + 2.4, 0, 0.45, r.len);
    rock(rk, r.len + 1.2, r.a - 2.6, 0, 0.7, 0.6, C.stone, r.len + 3, rk.thin);
  }
  // Light on the floor: round the stations' lamps and fires, under the
  // lanterns on the walls, at the mouths of the drifts.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  for (const [kind, u, w, r, c, a] of POOLS) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (qk.vis(q.len * u, q.dep * w, 0, r * 1.5)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (f.kind === 'lamp' && wk.vis(f.a, 4, 0, 14)) wk.pool(f.a, 3.5, 12, 9, C.lamp, 0.6);
    else if (f.kind === 'adit' && wk.vis(f.a, 3, 0, 10)) wk.pool(f.a + 4, 2.5, 7, 5, '#ffb050', 0.3);
  }
}

// The stations' own light, in their frames: kind, where (as a share of the
// prop's len and dep), radius, colour, strength.
const POOLS: ReadonlyArray<readonly [Slot['kind'], number, number, number, Color, number]> = [
  ['write', 0.4, 0.7, 13, '#ff9a48', 0.55],
  ['idle', 0.45, 0.55, 17, '#ff9a48', 0.6],
  ['run', 0.3, 0.5, 12, '#ffa050', 0.42],
  ['think', 0.6, 0.5, 12, C.lamp, 0.5],
  ['read', 0.85, 0.8, 10, C.lamp, 0.45],
  ['search', 0.5, 1, 10, C.lamp, 0.42],
  ['entrance', 0.1, 1, 10, C.lamp, 0.42],
  ['web', 0.2, 0.4, 9, C.lamp, 0.4],
];

// Loose rock fallen at the foot of the wall, in its free stretches.
function rubble(k: Kit, v: RoomView, plan: Plan, wall: Wall, end: number): void {
  const taken = plan.L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? [s.x0 - 1.5, s.x0 + s.len + 1.5] : [s.y0 - 1.5, s.y0 + s.len + 1.5]));
  for (const f of plan.features) if (f.wall === wall && f.kind === 'adit') taken.push([f.a - f.w / 2 - 0.5, f.a + f.w / 2 + 0.5]);
  const n = Math.round((end - v.T) / 2.2);
  for (let i = 0; i < n; i++) {
    const a = v.T + 1 + hash(i, wall === 'right' ? 321 : 322) * (end - v.T - 3);
    if (taken.some(([a0, a1]) => a > a0 && a < a1)) continue;
    const out = 0.6 + hash(i, 323) * hash(i, 324) * 3.2;
    const r = 0.35 + hash(i, 325) * 0.7 * (1.2 - out / 4);
    if (!k.vis(a, out, 0, 2)) continue;
    rock(k, a, out, 0, r, r * 0.8, hash(i, 326) < 0.7 ? C.stone : C.rockLight, i * 7 + (wall === 'right' ? 1 : 2), k.thin);
  }
}

// ── walls ──────────────────────────────────────────────────────────────────

// The strata from the floor up, repeating: colour and thickness; the coal
// seams are bands of COAL.
const COAL = '#2c2421';
const STRATA: ReadonlyArray<readonly [Color, number]> = [
  ['#836b56', 4.5],
  ['#977c61', 4],
  ['#76604f', 3.2],
  [COAL, 2.6],
  ['#8c7059', 6],
  ['#a8865f', 2.6],
  ['#7b6352', 6.5],
  ['#6f5b4c', 4.5],
  [COAL, 1.6],
  ['#8a725c', 5.5],
  ['#9e8264', 3.5],
  ['#745f50', 7],
];

type Band = { c: Color; z0: (a: number) => number; z1: (a: number) => number; coal: boolean };

// The bands of one wall (their wavy boundaries depend on the wall).
function strata(H: number, seed: number): Band[] {
  const edge = (i: number, base: number) => (a: number) => base + wave(a / 11 + i * 3.1, seed + i) * 0.9 + wave(a / 4.3, seed + i + 50) * 0.25;
  const out: Band[] = [];
  let z = -SLAB;
  let i = 0;
  let prev = (a: number) => -SLAB + 0 * a;
  while (z < H) {
    const [c, t] = STRATA[i % STRATA.length];
    z += t;
    const top = z >= H ? (a: number) => H + 0 * a : edge(i, z);
    out.push({ c, z0: prev, z1: top, coal: c === COAL });
    prev = top;
    i++;
  }
  return out;
}

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const bands = strata(H, wall === 'right' ? 11 : 23);
  const step = 2;
  for (const b of bands) {
    const pts: P3[] = [];
    for (let a = T; a <= end + 0.01; a += step) pts.push([Math.min(a, end), 0, Math.max(0, Math.min(H, b.z0(a)))]);
    for (let a = end; a >= T - 0.01; a -= step) pts.push([Math.max(a, T), 0, Math.max(0, Math.min(H, b.z1(a)))]);
    if (b.z1(T) <= 0 && b.z1(end) <= 0) continue;
    k.poly(pts, tone(b.c), 0);
  }
  texture(k, v, wall, end, bands, tone);
  // the far corner in shadow, the top fading into the dark, the foot damp
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#1a0e0650'], [1, '#1a0e0600']]), 0);
  const pz = plateZ(H);
  k.poly([[T, 0, pz - 4], [end, 0, pz - 4], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, pz - 4, H, [[0, '#140b0600'], [0.35, '#140b0640'], [1, '#140b06a8']]), 0);
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, 3], [T, 0, 3]], k.vgrad(T, 0, 0, 3, [[0, '#140b0650'], [1, '#140b0600']]), 0);
  // lantern light washing the rock round each lamp
  for (const f of plan.features) if (f.wall === wall && f.kind === 'lamp' && k.vis(f.a, 0, LAMP_Z - 3, 14)) k.halo(f.a, 0.2, LAMP_Z - 2, 14, '#ffbf6a', 0.4);
  const mine = plan.features.filter((f) => f.wall === wall && k.vis(f.a, 0, 12, f.w / 2 + 14));
  for (const f of mine) {
    if (f.kind === 'adit') adit(k, v, f, lit);
    else if (f.kind === 'vein') vein(k, f);
  }
  for (const f of mine) if (f.kind === 'post') post(k, v, f);
  // the wall plate along the whole wall, on the posts
  k.box(T, 0, pz, end - T, 1.4, 1.5, C.timberOld, { stripe: false });
  if (k.fine) k.line([[T, 1.41, pz + 0.75], [end, 1.41, pz + 0.75]], shade(C.timberOld, -0.25), Math.max(0.6, 0.06 * s));
  for (const f of mine) {
    if (f.kind === 'rack') rack(k, f);
    else if (f.kind === 'board') board(k, f);
    else if (f.kind === 'ladder') ladder(k, v, f, tone);
  }
  for (const f of mine) if (f.kind === 'lamp') lamp(k, f);
}

// Stones set in the rock, cracks, and glints in the coal seams; only what
// falls on this tile.
function texture(k: Kit, v: RoomView, wall: Wall, end: number, bands: Band[], tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const { T, H } = v;
  const salt = wall === 'right' ? 400 : 500;
  const n = Math.round(((end - T) * H) / 30);
  const bandAt = (a: number, z: number) => bands.find((b) => z >= b.z0(a) && z < b.z1(a)) ?? bands[bands.length - 1];
  const stones: Array<[number, number, number, number, Color]> = [];
  const cracks: P3[][] = [];
  const glints: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = T + 0.8 + hash(i, salt + 1) * (end - T - 1.6);
    const z = 0.6 + hash(i, salt + 2) * (H - 1.2);
    if (!k.vis(a, 0, z, 3)) continue;
    const b = bandAt(a, z);
    const kind = hash(i, salt + 3);
    if (b.coal) {
      if (kind < 0.5) glints.push([a, z]);
      continue;
    }
    if (kind < 0.5) {
      const r = 0.5 + hash(i, salt + 4) * 1.0;
      stones.push([a, z, r * (1.2 + hash(i, salt + 8) * 0.8), r * 0.8, b.c]);
    } else {
      const len = 1 + hash(i, salt + 5) * 2.2;
      const dz = (hash(i, salt + 6) - 0.5) * 1.6;
      cracks.push([[a, 0, z], [a + len * 0.5, 0, z + dz * 0.6 + (hash(i, salt + 7) - 0.5) * 0.5], [a + len, 0, z + dz]]);
    }
  }
  // Chunks of harder rock standing proud of the face: angular, a shade
  // lighter than their band, lit along the top, a dark lip underneath.
  const corners = (a: number, z: number, ra: number, rz: number, seed: number): P3[] => {
    const out: P3[] = [];
    for (let j = 0; j < 6; j++) {
      const th = ((j + hash(seed, j, 9) * 0.5) / 6) * Math.PI * 2;
      const r = 0.75 + hash(seed, j, 8) * 0.35;
      out.push([a + Math.cos(th) * ra * r, 0, z + Math.sin(th) * rz * r]);
    }
    return out;
  };
  const groups = new Map<Color, typeof stones>();
  for (const st of stones) {
    const c = shade(st[4], hash(Math.round(st[0] * 10), Math.round(st[1] * 10)) < 0.6 ? 0.07 : -0.06);
    (groups.get(c) ?? groups.set(c, []).get(c)!).push(st);
  }
  for (const [c, list] of groups) {
    pen.beginPath();
    for (const [a, z, ra, rz] of list) k.trace(corners(a, z, ra, rz, Math.round(a * 31 + z * 7)));
    pen.fillStyle = tone(c);
    pen.fill();
  }
  const edge = (from: number, to: number) => {
    pen.beginPath();
    for (const [a, z, ra, rz] of stones) {
      const pts = corners(a, z, ra, rz, Math.round(a * 31 + z * 7));
      for (let j = from; j <= to; j++) {
        const [x, y] = k.p(...pts[j % 6]);
        if (j === from) pen.moveTo(x, y);
        else pen.lineTo(x, y);
      }
    }
  };
  // corners 1..3 are the top (z above the middle), 4..6 the bottom
  edge(1, 3);
  pen.strokeStyle = tone('#f6e3c2', 0.2) + '70';
  pen.lineWidth = Math.max(0.7, 0.13 * s);
  pen.lineCap = 'round';
  pen.lineJoin = 'round';
  pen.stroke();
  edge(3, 6);
  pen.strokeStyle = withAlpha(INK, 0.4);
  pen.lineWidth = Math.max(0.7, 0.1 * s);
  pen.stroke();
  // cracks
  pen.beginPath();
  for (const c of cracks) {
    c.forEach(([a, w, z], j) => {
      const [x, y] = k.p(a, w, z);
      if (j) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    });
  }
  pen.strokeStyle = withAlpha(INK, 0.38);
  pen.lineWidth = Math.max(0.7, 0.1 * s);
  pen.lineJoin = 'round';
  pen.stroke();
  // the coal's glassy glints
  pen.beginPath();
  for (const [a, z] of glints) {
    const [x, y] = k.p(a, 0, z);
    const r = Math.max(0.8, 0.22 * s);
    pen.moveTo(x - r, y);
    pen.lineTo(x, y - r * 0.7);
    pen.lineTo(x + r, y);
    pen.lineTo(x, y + r * 0.7);
    pen.closePath();
  }
  pen.fillStyle = tone('#8c8ca0');
  pen.fill();
}

// ── wall pieces ────────────────────────────────────────────────────────────

// A drift: a timbered portal round a dark opening, the tunnel running off
// into the wall with its sets and rails, a lantern far down it.
function adit(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const a = f.a;
  const a0 = a - AW / 2;
  const a1 = a + AW / 2;
  const lean = 0.5;
  const open: P3[] = [[a0, 0.02, 0], [a1, 0.02, 0], [a1 - lean, 0.02, AH], [a0 + lean, 0.02, AH]];
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.fillStyle = '#0c0705';
  pen.fill();
  pen.clip();
  const L = 22;
  const DARK = '#0c0705';
  const fade = (c: Color, d: number) => mix(c, DARK, Math.min(1, 0.35 + (d / L) * 0.75));
  // the tunnel's floor and its near side, darkening fast with depth
  k.poly([[a0, 0, 0], [a1, 0, 0], [a1, -L, 0], [a0, -L, 0]], k.lgrad([a, 0, 0], [a, -L, 0], [1, 0, 0], [[0, '#4a3826'], [0.35, '#24170e'], [1, DARK]]), 0);
  k.poly([[a0 + lean, 0, 0], [a0 + lean, -L, 0], [a0 + lean, -L, AH], [a0 + lean, 0, AH]], k.lgrad([a0, 0, 0], [a0, -L, 0], [0, 0, 1], [[0, '#3e3027'], [0.3, '#1e140d'], [1, DARK]]), 0);
  // rails running in
  const rk = new Kit(pen, (u, w, z) => k.p(w, u, z), s);
  for (let d = -L; d < 0; d += 1.5) rk.box(d, a - 1.6, 0, 0.55, 3.2, 0.2, fade(C.timberOld, -d), { line: 0, stripe: false });
  pen.beginPath();
  for (const side of [-0.9, 0.9]) {
    const [x0, y0] = rk.p(-L, a + side, 0.35);
    const [x1, y1] = rk.p(0, a + side, 0.35);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = k.lgrad([a, 0, 0], [a, -L, 0], [1, 0, 0], [[0, '#8a8c90'], [0.5, '#3a3430'], [1, DARK]]);
  pen.lineWidth = Math.max(0.8, 0.2 * s);
  pen.stroke();
  // sets of timber receding, deepest first, a lantern on the third
  for (const d of [-19, -15, -11, -7, -3]) {
    const c = fade(C.timber, -d);
    k.box(a0 + lean, d - 0.8, 0, 0.8, 0.8, AH - 0.6, c, { line: k.thin * 0.8, stripe: false, ink: DARK });
    k.box(a1 - lean - 0.8, d - 0.8, 0, 0.8, 0.8, AH - 0.6, c, { line: k.thin * 0.8, stripe: false, ink: DARK });
    k.box(a0 + lean, d - 0.8, AH - 1.4, AW - 2 * lean, 0.8, 1, c, { line: k.thin * 0.8, stripe: false, ink: DARK });
    if (d === -11) {
      k.halo(a, d + 1, 6, 6, '#ffb050', 0.3);
      hangLantern(k, a0 + lean + 1.6, d + 0.4, AH - 1.4, 0.6, 0.9, 0.85);
    }
  }
  // the mouth's own shadow, deepest under the cap
  k.poly(open, k.vgrad(a, 0.02, 0, AH, [[0, '#0c070500'], [0.6, '#0c070540'], [1, '#0c0705b0']]), 0);
  pen.restore();
  // the portal: posts, the cap on them, lagging over it
  const post = (u: number) => {
    k.box(u, 0, 0, 1.2, 1.4, AH + 0.3, C.timber, { stripe: false });
    if (k.fine) k.line([[u + 0.4, 1.41, 1.5], [u + 0.45, 1.41, AH - 2]], shade(C.timber, -0.25), Math.max(0.6, 0.06 * s));
  };
  post(a0 - 1.1);
  post(a1 - 0.1);
  for (const [u0, u1] of [[a0 + 0.1, a0 + 1.6], [a1 - 1.6, a1 - 0.1]]) {
    // knee braces in the top corners
    k.poly([[u0, 0.5, AH], [u1, 0.5, AH], [u0 === a0 + 0.1 ? u0 : u1, 0.5, AH - 1.5]], C.timberOld, k.thin);
  }
  k.box(a0 - 1.8, 0, AH + 0.3, AW + 3.6, 1.7, 1.5, C.timberOld);
  k.box(a0 - 0.8, 0, AH + 1.8, AW + 1.6, 1.2, 0.9, C.timber, { line: k.thin });
  // rocks fallen onto the cap's ends, a lantern on a nail
  rock(k, a0 - 1.3, 0.9, AH + 1.8, 0.7, 0.6, C.stone, f.k + 1, k.thin);
  rock(k, a + 1.5, 0.7, AH + 2.7, 0.5, 0.4, C.rockLight, f.k + 3, k.thin);
  rock(k, a1 + 1.1, 0.8, AH + 1.8, 0.55, 0.5, C.rockLight, f.k + 2, k.thin);
  hangLantern(k, a1 + 0.6, 1.7, AH + 0.3, 0.3, 1);
  void v;
  void lit;
}

// A timber post up to the wall plate, a corbel on its head.
function post(k: Kit, v: RoomView, f: Feature): void {
  const pz = plateZ(v.H);
  k.box(f.a - 0.7, 0, 0, 1.4, 1.2, pz, C.timber, { stripe: false });
  k.box(f.a - 1.2, 0, pz - 1.1, 2.4, 1.35, 1.1, C.timberOld, { line: k.thin });
  if (k.fine) {
    for (let i = 0; i < 3; i++) {
      const z0 = 2 + hash(f.k, i, 41) * (pz - 6);
      k.line([[f.a - 0.3 + i * 0.25, 1.21, z0], [f.a - 0.25 + i * 0.25, 1.21, z0 + 2.5 + hash(f.k, i, 42) * 2]], shade(C.timber, -0.28), Math.max(0.6, 0.06 * k.s));
    }
  }
}

// A lantern hung from an iron bracket on a post.
function lamp(k: Kit, f: Feature): void {
  const z = LAMP_Z;
  k.rod([[f.a, 1.2, z], [f.a, 2.4, z], [f.a, 2.4, z - 0.3]], C.iron, 0.14);
  k.rod([[f.a, 1.2, z - 1], [f.a, 2.0, z]], C.iron, 0.1);
  hangLantern(k, f.a, 2.4, z - 0.3, 0.4, 1);
}

// A vein of gold through the rock: a branching seam, nuggets bedded in it,
// glints where the lamp light catches it.
function vein(k: Kit, f: Feature): void {
  const { s } = k;
  const a = f.a;
  const pts: P3[] = [];
  const z0 = 3 + hash(f.k, 51) * 3;
  const z1 = z0 + 11 + hash(f.k, 52) * 6;
  const dir = hash(f.k, 53) < 0.5 ? 1 : -1;
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    pts.push([a + dir * (t - 0.5) * (f.w - 2) + (hash(f.k, i, 54) - 0.5) * 1.2, 0.03, z0 + (z1 - z0) * t]);
  }
  // a ribbon of quartz and gold, pinching and swelling, with stringers
  // branching off it
  const ribbon = (line: P3[], w0: number, seed: number): P3[] => {
    const l: P3[] = [];
    const r: P3[] = [];
    line.forEach((p, i) => {
      const q = line[Math.min(line.length - 1, i + 1)];
      const o = line[Math.max(0, i - 1)];
      const da = q[0] - o[0];
      const dz = q[2] - o[2];
      const len = Math.hypot(da, dz) || 1;
      const w = w0 * (0.45 + hash(seed, i, 58) * 0.9) * (i === 0 || i === line.length - 1 ? 0.25 : 1);
      l.push([p[0] - (dz / len) * w, p[1], p[2] + (da / len) * w]);
      r.push([p[0] + (dz / len) * w, p[1], p[2] - (da / len) * w]);
    });
    return [...l, ...r.reverse()];
  };
  const stringers: P3[][] = [];
  for (const [from, len, turn] of [[5, 2, -1]] as const) {
    const st: P3[] = [pts[from]];
    for (let i = 1; i <= len; i++) st.push([pts[from][0] - dir * turn * i * 0.9 + (hash(f.k, i + from, 55) - 0.5) * 0.5, 0.03, pts[from][2] + turn * i * 0.5 + (hash(f.k, i + from, 59) - 0.5) * 0.6]);
    stringers.push(st);
  }
  // the fracture it fills, then milky quartz with gold through it
  for (const line of [pts, ...stringers]) k.line(line, withAlpha(INK, 0.55), Math.max(1.2, (line === pts ? 0.8 : 0.45) * s));
  for (const line of [pts, ...stringers]) {
    const w = line === pts ? 0.42 : 0.2;
    k.poly(ribbon(line, w, f.k + line.length), '#cbbb9a', 0, 0.1);
    k.poly(ribbon(line, w * 0.5, f.k + 9), C.goldDark, 0, 0.05);
  }
  for (const i of [2, 5, 8]) nugget(k, pts[i][0], 0.1, pts[i][2] - 0.4, 0.4 + hash(f.k, i, 56) * 0.2, f.k + i, false);
  for (const i of [1, 5]) sparkle(k, pts[i][0] + 0.3, 0.2, pts[i][2] + 0.2, 0.5 + hash(f.k, i, 57) * 0.25, 0.85);
  k.halo(a, 0.2, (z0 + z1) / 2, 7, '#ffd36a', 0.12);
}

// A rack of tools on pegs: two picks and a pair of shovels, a coil of rope.
function rack(k: Kit, f: Feature): void {
  const a = f.a;
  const z = 11;
  k.shadow(a, 0.4, f.w * 0.5, 0.7, 0.14, z - 0.6);
  k.box(a - f.w / 2, 0, z, f.w, 0.5, 1.0, C.timberOld, { line: k.lw });
  const pegs = [a - 3, a - 1.3, a + 0.6, a + 2.6];
  for (const u of pegs) k.rod([[u, 0.5, z + 0.5], [u, 1.2, z + 0.6]], C.timberDark, 0.14);
  // the picks hang by their heads, the shovels by their grips
  pickaxe(k, [a - 3, 0.9, z - 4.6], [a - 3, 0.9, z + 0.55], [1, 0, 0], 0.85);
  shovel(k, [a - 1.3, 1.0, z + 0.55], [a - 1.3, 1.1, z - 5.6], [1, 0, 0], 0.85);
  shovel(k, [a + 0.6, 1.0, z + 0.55], [a + 0.6, 1.1, z - 5.2], [1, 0, 0], 0.8);
  pickaxe(k, [a + 2.6, 0.9, z - 4.2], [a + 2.6, 0.9, z + 0.55], [1, 0, 0], 0.8, C.timberOld);
  ropeCoil(k, a + 3.6, 0.9, z - 2.4, 0.7);
}

// The notice board: planks, the survey of the workings pinned to it (lines
// and a cross for the strike, no words), a scrap of notes, a pencil on a
// string.
function board(k: Kit, f: Feature): void {
  const { s } = k;
  const a = f.a;
  const z0 = 8.5;
  const h = 7;
  const w = f.w;
  k.shadow(a, 0.3, w * 0.5, 0.6, 0.12, z0 - 0.4);
  k.box(a - w / 2, 0, z0, w, 0.4, h, C.timberOld, { stripe: false });
  if (k.fine) for (let z = z0 + 1.4; z < z0 + h; z += 1.4) k.line([[a - w / 2, 0.41, z], [a + w / 2, 0.41, z]], shade(C.timberOld, -0.3), Math.max(0.6, 0.06 * s));
  const n = 0.43;
  const map: P3[] = [[a - w / 2 + 0.6, n, z0 + 0.8], [a + 1.2, n, z0 + 0.6], [a + 1.3, n, z0 + h - 0.7], [a - w / 2 + 0.5, n, z0 + h - 0.9]];
  k.poly(map, C.paper, k.thin, 0.1);
  // the survey: drifts as lines, the shaft a square, a red cross
  const P = (fu: number, fz: number): P3 => [a - w / 2 + 0.9 + fu * (w / 2 + 0.2), n + 0.01, z0 + 1.1 + fz * (h - 2.2)];
  const ink = '#6a4a2e';
  const lw = Math.max(0.8, 0.12 * s);
  k.line([P(0, 0.75), P(0.45, 0.72), P(0.55, 0.4), P(1, 0.35)], ink, lw);
  k.line([P(0.45, 0.72), P(0.5, 1)], ink, lw);
  k.line([P(0.55, 0.4), P(0.35, 0.05)], ink, lw);
  k.pen.beginPath();
  k.trace([P(0.08, 0.85), P(0.18, 0.85), P(0.18, 0.65), P(0.08, 0.65)]);
  k.paint(null, Math.max(0.7, 0.1 * s), ink);
  k.line([P(0.78, 0.25), P(0.9, 0.45)], C.red, lw * 1.3);
  k.line([P(0.9, 0.25), P(0.78, 0.45)], C.red, lw * 1.3);
  // pins, a scrap of notes, the pencil
  for (const p of [map[0], map[1], map[2], map[3]]) k.disc(p[0] + (p[0] < a ? 0.25 : -0.25), n + 0.02, p[2] + (p[2] < z0 + 2 ? 0.25 : -0.25), 0.16, C.red, 0);
  k.poly([[a + 1.7, n, z0 + 2.2], [a + w / 2 - 0.5, n, z0 + 2.0], [a + w / 2 - 0.6, n, z0 + 5.6], [a + 1.6, n, z0 + 5.5]], '#e6dcc4', k.thin, 0.1);
  for (let i = 0; i < 4; i++) k.line([[a + 2.0, n + 0.01, z0 + 4.9 - i * 0.7], [a + 2.0 + 0.6 + hash(f.k, i, 61) * 0.8, n + 0.01, z0 + 4.9 - i * 0.7]], '#7a6a5a', Math.max(0.6, 0.07 * s));
  k.line([[a + w / 2 - 0.7, n, z0 + 0.6], [a + w / 2 - 0.4, 0.8, z0 - 1.6]], '#5a4a3a', Math.max(0.6, 0.05 * s));
  k.rod([[a + w / 2 - 0.5, 0.85, z0 - 1.5], [a + w / 2 - 0.2, 0.9, z0 - 3.1]], '#d9a94e', 0.12);
}

// A ladder up the rock to an old working above the wall plate: a dark hole
// in a small timber frame with a plank ledge.
function ladder(k: Kit, v: RoomView, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const { pen } = k;
  const a = f.a;
  const pz = plateZ(v.H);
  const hz0 = pz + 3.5;
  const hz1 = Math.min(v.H - 3, hz0 + 6);
  const hw = 2;
  // the hole, dark inside, its frame
  k.poly([[a - hw, 0.02, hz0], [a + hw, 0.02, hz0], [a + hw - 0.2, 0.02, hz1], [a - hw + 0.2, 0.02, hz1]], k.vgrad(a, 0.02, hz0, hz1, [[0, '#2a1a10'], [1, '#0c0705']]), 0);
  pen.save();
  pen.beginPath();
  k.trace([[a - hw, 0.03, hz0], [a + hw, 0.03, hz0], [a + hw - 0.2, 0.03, hz1], [a - hw + 0.2, 0.03, hz1]]);
  pen.clip();
  k.poly([[a - hw + 0.2, 0, hz0], [a - hw + 0.2, -6, hz0], [a - hw + 0.2, -6, hz1], [a - hw + 0.2, 0, hz1]], k.lgrad([a, 0, 0], [a, -6, 0], [0, 0, 1], [[0, tone('#4a3c32')], [1, '#0c0705']]), 0);
  pen.restore();
  k.box(a - hw - 0.7, 0, hz0, 0.7, 0.8, hz1 - hz0 + 0.6, C.timber, { line: k.thin, stripe: false });
  k.box(a + hw, 0, hz0, 0.7, 0.8, hz1 - hz0 + 0.6, C.timber, { line: k.thin, stripe: false });
  k.box(a - hw - 1, 0, hz1, 2 * hw + 2, 0.9, 0.7, C.timberOld, { line: k.thin });
  k.box(a - hw - 0.6, 0, hz0 - 0.5, 2 * hw + 1.2, 2.0, 0.5, C.plank, { line: k.thin });
  // the ladder from the floor to the ledge
  const top = hz0 + 1.2;
  const foot = 2.6;
  const at = (z: number) => foot - ((foot - 0.6) * z) / top;
  for (const du of [-0.85, 0.85]) k.rod([[a + du, at(0), 0], [a + du, at(top), top]], C.pine, 0.2);
  for (let z = 1.2; z < top - 0.3; z += 1.5) k.rod([[a - 0.85, at(z), z], [a + 0.85, at(z), z]], C.timber, 0.13);
  rock(k, a + 1.7, 1.2, 0, 0.5, 0.4, C.stone, f.k, k.thin);
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  // the floor's cut edges: earth over rock
  for (const [p0, p1, nu, nv] of [[[T, D], [W, D], 0, 1], [[W, T], [W, D], 1, 0]] as const) {
    k.poly([[p0[0], p0[1], 0], [p1[0], p1[1], 0], [p1[0], p1[1], -SLAB], [p0[0], p0[1], -SLAB]], k.side('#5e4632', nu, nv), k.lw);
    k.poly([[p0[0], p0[1], -1.1], [p1[0], p1[1], -1.1], [p1[0], p1[1], -SLAB], [p0[0], p0[1], -SLAB]], k.side('#4e4038', nu, nv), 0);
  }
  k.line([[T, D, -0.35], [W, D, -0.35], [W, T, -0.35]], '#a58363', Math.max(1, 0.25 * k.s));
  // the walls' cut ends, banded like the faces
  for (const wall of ['left', 'right'] as const) {
    const bands = strata(H, wall === 'right' ? 11 : 23);
    const [p, q, nu, nv] = wall === 'left' ? ([[0, D], [T, D], 0, 1] as const) : ([[W, 0], [W, T], 1, 0] as const);
    const a = wall === 'right' ? W : D;
    for (const b of bands) {
      const z0 = b.z0(a);
      const z1 = b.z1(a);
      k.poly([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], k.side(shade(b.c, -0.06), nu, nv), 0);
    }
    k.poly([[p[0], p[1], -SLAB], [q[0], q[1], -SLAB], [q[0], q[1], H], [p[0], p[1], H]], k.vgrad(p[0], p[1], H * 0.4, H, [[0, '#140b0600'], [1, '#140b0688']]), 0);
    k.pen.beginPath();
    k.trace([[p[0], p[1], -SLAB], [q[0], q[1], -SLAB], [q[0], q[1], H], [p[0], p[1], H]]);
    k.paint(null, k.lw);
  }
  // the tops: dark rock, a lit lip along the inside
  const cap = '#4a3e35';
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
  k.line([[T - 0.4, D, H], [T - 0.4, T - 0.4, H], [W, T - 0.4, H]], shade(cap, 0.3), Math.max(1, 0.22 * k.s));
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.18), Math.max(1, 0.18 * k.s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}
