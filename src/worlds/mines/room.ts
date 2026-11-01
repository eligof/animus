import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi } from '../../world/types.ts';
import { lampsOn } from '../../art/scene/light.ts';
import type { RoomArt, RoomLight, RoomView } from '../types.ts';
import { hangLantern, nugget, pickaxe, rails, rock, ropeCoil, shovel, sparkle } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, wave, withAlpha } from './kit.ts';

// The mine's shell: a gallery cut from layered rock, its floor packed earth
// and gravel. The walls show their strata dipping through the hill, two
// coal seams in them, blocks of harder rock standing proud, and one great
// seam of gold (the motherlode) running up out of the floor beside a drift
// and over it to the roof, with thinner veins here and there; the rock's
// top is broken, not cut. Timber posts carry a wall plate along each wall,
// cap beams reach out over the room from it, lanterns hang off every other
// post, and between them hang tool racks, a notice board with the survey,
// a ladder up to an old working, and on each wall the timbered mouth of a
// drift running off into the dark, its rails coming out across the floor.
// Every piece sits in the free stretches of wall between the stations,
// worked out from the same plan the stage uses, so nothing hangs behind a
// forge or the lift.

type Wall = 'left' | 'right';
type Kind = 'adit' | 'post' | 'lamp' | 'rack' | 'board' | 'ladder' | 'vein' | 'lode';
// dir: which way along the wall the motherlode leans as it climbs (over
// its drift)
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number; dir?: number };
export type Rail = { wall: Wall; a: number; len: number };
export type Scatter = { x: number; y: number; k: number };
export type Puddle = { x: number; y: number; rx: number; ry: number; k: number };
// The broken top of a wall: knots (a, how far below H), a rising.
export type Rim = ReadonlyArray<readonly [number, number]>;
export type Plan = { L: Layout; features: Feature[]; rails: Rail[]; scatter: Scatter[]; puddles: Puddle[]; ruts: P3[][]; rims: Record<Wall, Rim> };

const SLAB = 3; // the floor's thickness, shown along the front cut
const AW = 11; // a drift's opening, wide
const AH = 15; // and high (under the cap)
const ADIT = AW + 4; // the portal, posts and all
const AW_S = 7; // a small drift, for walls too short for a big one
const AH_S = 12;
const ADIT_S = AW_S + 4;
const BAY = 21; // posts at most this far apart
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
  const sc = scatter(L, rails);
  const plan = { L, features: fs, rails, scatter: sc, puddles: puddles(L, fs, rails, sc), ruts: ruts(L, rails), rims: { right: rimOf(L, 'right', fs), left: rimOf(L, 'left', fs) } };
  PLANS.set(key, plan);
  return plan;
}

// A drift on each wall in its longest free stretch (a small one where no
// big one fits), the motherlode coming up beside one of them; then posts
// along what is left at most a bay apart, a lamp on every other one, and
// between them a rack of tools, a vein of gold, the notice board or a
// ladder up to an old working.
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
  // where the motherlode could come up: beside a drift, on its roomier side
  let lode: { wall: Wall; a: number; dir: number; room: number; span: (typeof spans)[number] } | null = null;
  for (const wall of ['right', 'left'] as const) {
    const pick = spans.filter((s) => s.wall === wall).sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
    if (!pick) continue;
    const len = pick.a1 - pick.a0;
    const size = len >= ADIT + 6 ? ADIT : len >= ADIT_S + 3 ? ADIT_S : 0;
    if (!size) continue;
    // a little off the middle, toward the back
    const mid = pick.a0 + len * 0.45;
    const a = Math.max(pick.a0 + size / 2 + 1, Math.min(pick.a1 - size / 2 - 1, mid));
    out.push({ wall, kind: 'adit', a, w: size, k: n++ });
    const lo = { wall, a0: pick.a0, a1: a - size / 2 - 1 };
    const hi = { wall, a0: a + size / 2 + 1, a1: pick.a1 };
    spans.splice(spans.indexOf(pick), 1, lo, hi);
    const sides: Array<[number, typeof hi, number]> = [[1, hi, pick.a1 - a - size / 2], [-1, lo, a - size / 2 - pick.a0]];
    for (const [side, span, room] of sides) {
      if (room >= 2.6 && (!lode || room > lode.room)) lode = { wall, a: a + side * (size / 2 + 1.2), dir: -side, room, span };
    }
  }
  if (lode) {
    // its foot keeps the posts off
    out.push({ wall: lode.wall, kind: 'lode', a: lode.a, w: 2.2, k: n++, dir: lode.dir });
    if (lode.dir < 0) lode.span.a0 = Math.max(lode.span.a0, lode.a + 1.8);
    else lode.span.a1 = Math.min(lode.span.a1, lode.a - 1.8);
  } else {
    // no drift: the motherlode in the middle of the longest free stretch
    const pick = [...spans].sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
    if (pick && pick.a1 - pick.a0 >= 5) {
      const a = (pick.a0 + pick.a1) / 2;
      out.push({ wall: pick.wall, kind: 'lode', a, w: 2.2, k: n++, dir: 1 });
      spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: a - 1.8 }, { wall: pick.wall, a0: a + 1.8, a1: pick.a1 });
    }
  }
  const lodeWall = out.find((f) => f.kind === 'lode')?.wall;
  const WIDTH: Record<Kind, number> = { adit: ADIT, post: 1.4, lamp: 2.4, rack: 8, board: 7, ladder: 5, vein: 5, lode: 2.2 };
  const ORDER: Array<Kind | null> = ['vein', 'rack', null, 'board', 'vein', 'ladder', null, 'rack', 'vein', null, 'ladder', 'board', 'vein', null];
  const cap: Partial<Record<Kind, number>> = { board: 1, ladder: 1, rack: 2, vein: 2 };
  const counts = { left: {} as Partial<Record<Kind, number>>, right: {} as Partial<Record<Kind, number>> };
  const tall = L.H >= 44; // room above the wall plate for an upper working
  let bay = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    if (len < 1.4) continue;
    const m = Math.max(1, Math.ceil((len - 1.4) / BAY));
    const at = (i: number) => s.a0 + 0.7 + ((len - 1.4) * i) / m;
    for (let i = 0; i <= m; i++) {
      if (i === m && len - 1.4 < 0.5) break;
      out.push({ wall: s.wall, kind: 'post', a: at(i), w: WIDTH.post, k: n++ });
      out.push({ wall: s.wall, kind: 'lamp', a: at(i), w: WIDTH.lamp, k: n++ });
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
        const most = kind === 'vein' && s.wall === lodeWall ? 1 : (cap[kind] ?? Infinity);
        if (WIDTH[kind] > room || (count[kind] ?? 0) >= most || (kind === 'ladder' && !tall)) continue;
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

// Puddles where the rock drips: out from the feet of the lamps' posts (so
// the lantern shows in them), clear of the stations, the rails and the
// fallen rock; three to five of them.
function puddles(L: Layout, fs: Feature[], rs: Rail[], sc: Scatter[]): Puddle[] {
  const rects = L.slots.map(slotRect);
  const want = Math.max(4, Math.min(8, Math.round((L.W + L.D) / 30)));
  const out: Puddle[] = [];
  const lamps = fs.filter((f) => f.kind === 'lamp');
  for (let i = 0; i < lamps.length * 4 && out.length < want; i++) {
    const f = lamps[Math.floor(hash(i, 241) * lamps.length)];
    const along = f.a + (hash(i, 242) - 0.5) * 5;
    const off = 4.5 + hash(i, 243) * 7;
    const [x, y] = f.wall === 'right' ? [along, L.T + off] : [L.T + off, along];
    const rx = 2 + hash(i, 244) * 1.6;
    const ry = rx * (0.55 + hash(i, 245) * 0.2);
    if (x - rx < L.T + 1 || y - rx < L.T + 1 || x + rx > L.W - 2 || y + rx > L.D - 2) continue;
    if (rects.some((q) => x + rx > q.x0 - 1 && x - rx < q.x1 + 1 && y + rx > q.y0 - 1 && y - rx < q.y1 + 1)) continue;
    if (rs.some((rl) => (rl.wall === 'right' ? Math.abs(x - rl.a) < rx + 3 && y < L.T + rl.len + 3 : Math.abs(y - rl.a) < rx + 3 && x < L.T + rl.len + 3))) continue;
    if (sc.some((p) => Math.hypot(p.x - x, p.y - y) < rx + 4) || out.some((p) => Math.hypot(p.x - x, p.y - y) < 10)) continue;
    out.push({ x, y, rx, ry, k: i });
  }
  return out;
}

// Ruts worn by the carts: from the end of each drift's rails across the
// floor to the middle of the room, and from the first on toward the front
// (flat marks in the earth, leading the eye in to the drifts; whatever
// stands on them stands over them).
function ruts(L: Layout, rs: Rail[]): P3[][] {
  const h = hub(L);
  const front: P3 = [L.W - (L.W - L.T) * 0.12, L.D - (L.D - L.T) * 0.4, 0];
  return rs.map((r, i) => {
    const start: P3 = r.wall === 'right' ? [r.a, L.T + r.len + 1.2, 0] : [L.T + r.len + 1.2, r.a, 0];
    return smooth(i === 0 ? [start, [h.x, h.y, 0], front] : [start, [h.x, h.y, 0]], 10);
  });
}

// The broken top of a wall: knots every couple of units, most a shallow
// lump below H and now and then a deeper notch, none within a few units of
// the back corner or the cut end (they keep the full height) and only a
// little over a ladder's hole.
function rimOf(L: Layout, wall: Wall, fs: Feature[]): Rim {
  const end = wall === 'right' ? L.W : L.D;
  const salt = wall === 'right' ? 601 : 602;
  const ease = (d: number) => {
    const t = Math.max(0, Math.min(1, d / 5));
    return t * t * (3 - 2 * t);
  };
  const holds = fs.filter((f) => f.wall === wall && f.kind === 'ladder').map((f) => [f.a - f.w / 2 - 1.5, f.a + f.w / 2 + 1.5] as const);
  const out: Array<[number, number]> = [[L.T, 0]];
  let a = L.T;
  for (let i = 0; ; i++) {
    a += 1.8 + hash(i, salt) * 2.8;
    if (a >= end - 0.5) break;
    let d = ease(a - L.T) * ease(end - a) * (0.3 + hash(i, salt, 2) * 1.1 + (hash(i, salt, 3) < 0.2 ? 1.0 : 0));
    if (holds.some(([h0, h1]) => a > h0 && a < h1)) d = Math.min(d, 0.8);
    out.push([a, d]);
  }
  out.push([end, 0]);
  return out;
}

// How far below H the rim is at a.
function rimAt(rim: Rim, a: number): number {
  for (let i = 1; i < rim.length; i++) {
    const [a1, d1] = rim[i];
    if (a > a1) continue;
    const [a0, d0] = rim[i - 1];
    return a1 > a0 ? d0 + ((d1 - d0) * (a - a0)) / (a1 - a0) : d1;
  }
  return 0;
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots (warm round the camp fire, a drink by the pump), a look
// down each drift and up at the motherlode.
export function minesPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L);
  for (const f of fs.filter((g) => g.kind === 'adit')) out.push({ ...pt(f.wall, f.a + 4, 7), kind: 'view', face: pt(f.wall, f.a, 0) });
  for (const f of fs.filter((g) => g.kind === 'lode')) out.push({ ...pt(f.wall, f.a - (f.dir ?? 1) * 2, 6), kind: 'view', face: pt(f.wall, f.a + (f.dir ?? 1) * 3, 0) });
  for (const f of fs.filter((g) => g.kind === 'vein').slice(0, 1)) out.push({ ...pt(f.wall, f.a, 5), kind: 'view', face: pt(f.wall, f.a, 0) });
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
      // each face drawn inside its broken top: the room's outline with the
      // rim for this wall's top (what stands out from it into the room is
      // let through, nothing reaches past the corner)
      const wk = new Kit(v.pen, wallAt(v.at, wall, v.T), v.s);
      const end = wall === 'right' ? v.W : v.D;
      const deep = (wall === 'right' ? v.D : v.W) - v.T;
      v.pen.save();
      v.pen.beginPath();
      wk.trace([[v.T, deep, v.H], ...plan.rims[wall].map(([a, d]): P3 => [a, 0, v.H - d]), [end, 0, 0], [end, deep, 0], [v.T, deep, 0]]);
      v.pen.clip();
      wallFace(wk, v, plan, wall);
      v.pen.restore();
    }
    shell(k, v, plan);
    v.pen.restore();
  },
  // The wall lanterns (a third of them left burning at night, as oil
  // lamps), the lantern at each drift's portal, and the gold: the
  // motherlode glinting at its foot, part way up and near the roof, and
  // each vein, all still shining with the lights out.
  lights(v): RoomLight[] {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const out: RoomLight[] = [];
    for (const f of plan.features) {
      if (f.kind === 'lamp') {
        if (burnsAtNight(plan, f)) out.push({ kind: 'fire', wall: f.wall, u: f.a, v: 2.4, z: LAMP_Z - 1.9, color: '#ffc27a', r: 11, strength: 0.55, halo: 2.2 });
        else out.push({ kind: 'lamp', wall: f.wall, u: f.a, v: 2.4, z: LAMP_Z - 1.9, strength: 0.6 });
      } else if (f.kind === 'adit') {
        const ah = f.w === ADIT ? AH : AH_S;
        out.push({ kind: 'lamp', wall: f.wall, u: f.a + (f.w - 4) / 2 + 0.6, v: 1.7, z: ah - 1.2, strength: 0.5, r: 9 });
      } else if (f.kind === 'lode') {
        const pts = lodeLine(v, plan, f);
        for (const [i, r, st] of [[2, 7, 0.9], [7, 6, 0.7], [11, 5, 0.6]] as const) {
          if (pts[i][2] < v.H - 2) out.push({ kind: 'glow', wall: f.wall, u: pts[i][0], v: 0.6, z: pts[i][2], color: '#ffc94a', r, strength: st, halo: 3 });
        }
      } else if (f.kind === 'vein') out.push({ kind: 'glow', wall: f.wall, u: f.a, v: 0.4, z: 13, color: '#ffcf5a', r: 4, strength: 0.35, halo: 1.6 });
    }
    return out;
  },
};

// What the furniture keeps clear of: the motherlode's foot beside its
// drift (a bookcase in front of it hid the room's signature).
export function minesReserve(L: Layout): Array<{ wall: Wall; a0: number; a1: number; out: number }> {
  const f = planFor(L.W, L.D, L.H, L.T).features.find((g) => g.kind === 'lode');
  return f ? [{ wall: f.wall, a0: f.a - 3.5, a1: f.a + 3.5, out: 9 }] : [];
}

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
  // Packed earth: lit like a stage in the middle where the work is, falling
  // away to the edges.
  const [cx, cy] = k.p((W + T) / 2, (D + T) / 2, 0);
  const far = k.p(W, D, 0);
  const R = Math.hypot(far[0] - cx, far[1] - cy) * 1.3;
  const g = pen.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, shade(EARTH, 0.14));
  g.addColorStop(0.5, EARTH);
  g.addColorStop(1, shade(EARTH, -0.22));
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
  // The carts' ruts: a band of earth packed paler between them, a pair of
  // grooves, a pale lip on the far side of each.
  for (const rut of plan.ruts) {
    k.line(rut, withAlpha(shade(EARTH, 0.18), 0.22), 2.6 * s);
    for (const side of [-0.85, 0.85]) {
      const line = rut.map(([x, y], i): P3 => {
        const [x0, y0] = rut[Math.max(0, i - 1)];
        const [x1, y1] = rut[Math.min(rut.length - 1, i + 1)];
        const l = Math.hypot(x1 - x0, y1 - y0) || 1;
        return [x - ((y1 - y0) / l) * side, y + ((x1 - x0) / l) * side, 0];
      });
      k.line(line.map(([x, y]): P3 => [x - 0.25, y - 0.25, 0]), withAlpha('#b8946c', 0.3), Math.max(0.8, 0.2 * s));
      k.line(line, withAlpha('#2e2016', 0.38), Math.max(1, 0.42 * s));
    }
  }
  // A duckboard walk laid along each rut from the rails to the middle of
  // the room: planks across it, light and dark timber, a gap between.
  for (const rut of plan.ruts) {
    const path = rut.slice(0, 11);
    let carry = 0;
    let n = 0;
    for (let i = 1; i < path.length; i++) {
      const [x0, y0] = path[i - 1];
      const [x1, y1] = path[i];
      const l = Math.hypot(x1 - x0, y1 - y0);
      if (!l) continue;
      const [dx, dy] = [(x1 - x0) / l, (y1 - y0) / l];
      for (let d = carry; d < l; d += 1.05) {
        const [cx, cy] = [x0 + dx * d, y0 + dy * d];
        if (k.vis(cx, cy, 0, 3)) {
          const q = (a: number, b: number): P3 => [cx + dx * a - dy * b, cy + dy * a + dx * b, 0.06];
          k.poly([q(-0.45, -1.5), q(0.45, -1.5), q(0.45, 1.5), q(-0.45, 1.5)], n % 2 ? C.timber : C.plank, k.thin);
        }
        n++;
        carry = d + 1.05 - l;
      }
    }
  }
  // Gravel: a shadow under each pebble, then the pebbles by tone.
  const pebbles = Math.round(area / 120);
  const vis: number[] = [];
  for (let i = 0; i < pebbles; i++) {
    const x = T + 1 + hash(i, 311) * (W - T - 2);
    const y = T + 1 + hash(i, 312) * (D - T - 2);
    if (k.vis(x, y, 0, 1)) vis.push(i);
  }
  const peb = (i: number, dz: number, grow: number) => {
    const x = T + 1 + hash(i, 311) * (W - T - 2);
    const y = T + 1 + hash(i, 312) * (D - T - 2);
    const r = (0.29 + hash(i, 313) * 0.55) * grow;
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
      const r = 0.29 + hash(i, 313) * 0.55;
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
  for (const p of plan.puddles) if (k.vis(p.x, p.y, 0, p.rx + 2)) puddle(k, p);
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
}

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

// A puddle on the packed earth: a rim of wet mud, dark water (the mine's
// one cool colour) and a streak of lantern light across it.
function puddle(k: Kit, p: Puddle): void {
  const { pen, s } = k;
  pen.beginPath();
  blob(k, p.x + 0.2, p.y + 0.2, p.rx * 1.18, p.ry * 1.22, p.k + 70, 0, 11);
  pen.fillStyle = withAlpha('#2e2016', 0.42);
  pen.fill();
  pen.beginPath();
  blob(k, p.x, p.y, p.rx, p.ry, p.k + 71, 0.02, 11);
  k.paint(k.grad([p.x - p.rx, p.y - p.ry, 0], [p.x + p.rx, p.y + p.ry, 0], [[0, '#465a6b'], [0.6, '#5f7889'], [1, '#86a0b2']]), Math.max(0.8, k.thin * 0.8), withAlpha(INK, 0.6));
  k.line([[p.x - p.rx * 0.55, p.y - p.ry * 0.05, 0.03], [p.x - p.rx * 0.05, p.y - p.ry * 0.5, 0.03]], withAlpha('#ffe0a0', 0.8), Math.max(1, 0.24 * s));
  k.line([[p.x + p.rx * 0.1, p.y + p.ry * 0.05, 0.03], [p.x + p.rx * 0.35, p.y - p.ry * 0.2, 0.03]], withAlpha('#ffe6b8', 0.35), Math.max(0.8, 0.16 * s));
}

// ── walls ──────────────────────────────────────────────────────────────────

// The strata from the floor up, repeating: colour and thickness; the coal
// seams are bands of COAL, and one pale marker bed runs through. Dark
// enough that the walls fall back behind the lit floor and the lanterns'
// light reads on them.
const COAL = '#241d1b';
const MARKER = '#c49a5e';
const STRATA: ReadonlyArray<readonly [Color, number]> = [
  ['#6d5443', 4.5],
  ['#8e6f52', 4],
  ['#584539', 3.2],
  [COAL, 3.4],
  ['#7d614a', 6],
  [MARKER, 2.2],
  ['#614d3f', 6.5],
  ['#514136', 4.5],
  [COAL, 2.2],
  ['#826750', 5.5],
  ['#a28462', 3.5],
  ['#58463c', 7],
];

// How the beds dip: one plane through the hill, rising toward the right
// wall's front end and falling toward the left wall's (z per unit along the
// wall from the back corner), so the two walls' beds meet in the corner.
const DIP: Record<Wall, number> = { right: 0.1, left: -0.075 };

type Band = { c: Color; z0: (a: number) => number; z1: (a: number) => number; coal: boolean };

// The bands of one wall, tilted by its dip, their boundaries wavy (the
// same waves on both walls, so they meet in the corner). The sequence
// starts well below the floor so it covers the wall at every tilt.
function strata(H: number, T: number, wall: Wall): Band[] {
  const dip = DIP[wall];
  const edge = (i: number, base: number) => (a: number) => base + dip * (a - T) + wave(a / 11 + i * 3.1, 11 + i) * 0.9 + wave(a / 4.3, 61 + i) * 0.25;
  const out: Band[] = [];
  let z = -SLAB - 26;
  let i = 0;
  let prev = (a: number) => -SLAB - 99 + 0 * a;
  while (z < H + 26) {
    const [c, t] = STRATA[i % STRATA.length];
    z += t;
    const top = z >= H + 26 ? (a: number) => H + 99 + 0 * a : edge(i, z);
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
  const bands = strata(H, T, wall);
  // where the beds' boundaries are sampled: every 2 units, and the end
  const as: number[] = [];
  for (let a = T; a < end; a += 2) as.push(a);
  as.push(end);
  for (const b of bands) {
    if ((b.z1(T) <= 0 && b.z1(end) <= 0) || (b.z0(T) >= H && b.z0(end) >= H)) continue;
    const pts: P3[] = as.map((a): P3 => [a, 0, Math.max(0, Math.min(H, b.z0(a)))]);
    for (let i = as.length - 1; i >= 0; i--) pts.push([as[i], 0, Math.max(0, Math.min(H, b.z1(as[i])))]);
    k.poly(pts, tone(b.c), 0);
  }
  // a dark line along the foot of each coal seam and the marker bed, so
  // the beds read crisp across the room
  for (const b of bands) {
    if (!b.coal && b.c !== MARKER) continue;
    const pts: P3[] = [];
    for (const a of as) {
      const z = b.z0(a);
      if (z > 0 && z < H) pts.push([a, 0.01, z]);
    }
    if (pts.length > 1) k.line(pts, withAlpha(INK, 0.35), Math.max(0.8, 0.12 * s));
  }
  texture(k, v, wall, end, bands, tone);
  blocks(k, v, plan, wall, end, bands, tone);
  // the far corner in shadow, the top fading into the dark, the foot damp
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#1a0e0650'], [1, '#1a0e0600']]), 0);
  const pz = plateZ(H);
  k.poly([[T, 0, pz - 4], [end, 0, pz - 4], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, pz - 4, H, [[0, '#140b0600'], [0.35, '#140b0640'], [1, '#140b06a8']]), 0);
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, 3], [T, 0, 3]], k.vgrad(T, 0, 0, 3, [[0, '#140b0650'], [1, '#140b0600']]), 0);
  // the motherlode, bright against the dark (it climbs to the roof, so it
  // is looked for along the whole wall)
  for (const f of plan.features) if (f.wall === wall && f.kind === 'lode' && k.vis(f.a + (f.dir ?? 1) * H * 0.5, 0, H / 2, H * 0.7)) lode(k, v, plan, f);
  // (looked for over the wall's whole height: beams and corbels sit up by
  // the plate, ladders reach past it)
  const mine = plan.features.filter((f) => f.wall === wall && k.vis(f.a, 0, H / 2, f.w / 2 + H / 2 + 6));
  for (const f of mine) {
    if (f.kind === 'adit') adit(k, v, f, lit);
    else if (f.kind === 'vein') vein(k, v, f);
  }
  for (const f of mine) if (f.kind === 'post') post(k, v, f);
  // the wall plate along the whole wall, on the posts, and a cap beam
  // reaching out over the room from it above each post
  k.box(T, 0, pz, end - T, 1.4, 1.5, C.timberOld, { stripe: false });
  if (k.fine) k.line([[T, 1.41, pz + 0.75], [end, 1.41, pz + 0.75]], shade(C.timberOld, -0.25), Math.max(0.6, 0.06 * s));
  // (over every other post: fewer timbers, so the rock shows)
  const posts = plan.features.filter((g) => g.kind === 'post');
  for (const f of mine) if (f.kind === 'post' && posts.indexOf(f) % 2 === 0) beam(k, v, f);
  for (const f of mine) {
    if (f.kind === 'rack') rack(k, f);
    else if (f.kind === 'board') board(k, f);
    else if (f.kind === 'ladder') ladder(k, v, f, tone);
  }
  for (const f of mine) if (f.kind === 'lamp') lamp(k, f, lampsOn(v) || burnsAtNight(plan, f));
}

// Stones set in the rock, cracks, and glints in the coal seams; only what
// falls on this tile.
function texture(k: Kit, v: RoomView, wall: Wall, end: number, bands: Band[], tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const { T, H } = v;
  const salt = wall === 'right' ? 400 : 500;
  const n = Math.round(((end - T) * H) / 42);
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

// Blocks of harder rock standing proud of the face, big enough to read
// across the room: angular lumps a shade lighter than their bed, the top
// lit, the lower right in shade, a shadow under them on the rock. Kept off
// the posts, the drifts, the motherlode's foot and what hangs on the wall;
// placed the same on every tile, drawn only where they fall on it.
function blocks(k: Kit, v: RoomView, plan: Plan, wall: Wall, end: number, bands: Band[], tone: (c: Color, d?: number) => Color): void {
  const { T, H } = v;
  const pz = plateZ(H);
  const salt = wall === 'right' ? 700 : 800;
  const r = k.p(1, 0, 0)[0] > k.p(0, 0, 0)[0] ? 1 : -1; // +1: u runs screen-right
  const keep: Array<readonly [number, number, number]> = [];
  for (const f of plan.features) {
    if (f.wall !== wall || f.kind === 'lamp') continue;
    if (f.kind === 'post') keep.push([f.a - 2.2, f.a + 2.2, H]);
    else if (f.kind === 'adit') keep.push([f.a - f.w / 2 - 1, f.a + f.w / 2 + 1, (f.w === ADIT ? AH : AH_S) + 4]);
    else if (f.kind === 'lode') keep.push([f.a - 2.6, f.a + 2.6, H]);
    else keep.push([f.a - f.w / 2 - 0.6, f.a + f.w / 2 + 0.6, H]);
  }
  // (in a tall room, up the bare rock over the plate too)
  const top = H >= 44 ? H - 5 : pz - 2.5;
  const want = Math.round(((end - T) / 8) * ((top - 2.5) / (pz - 5)));
  const placed: Array<{ a: number; z: number; w: number; h: number; i: number }> = [];
  for (let i = 0; i < want * 5 && placed.length < want; i++) {
    const w = 2.8 + hash(i, salt + 3) * 3.4;
    const h = 1.8 + hash(i, salt + 4) * 1.7;
    const a = T + 2 + w / 2 + hash(i, salt + 1) * (end - T - 4 - w);
    const z = 2.5 + h / 2 + hash(i, salt + 2) * (top - 2.5 - h);
    if (z + h / 2 > pz - 1.5 && z - h / 2 < pz + 4) continue;
    if (keep.some(([a0, a1, zt]) => a + w / 2 > a0 && a - w / 2 < a1 && z - h / 2 < zt)) continue;
    if (placed.some((p) => Math.abs(p.a - a) < (p.w + w) / 2 + 1.5 && Math.abs(p.z - z) < (p.h + h) / 2 + 1.2)) continue;
    placed.push({ a, z, w, h, i });
  }
  const bandAt = (a: number, z: number) => bands.find((b) => z >= b.z0(a) && z < b.z1(a)) ?? bands[bands.length - 1];
  for (const { a, z, w, h, i } of placed) {
    if (!k.vis(a, 0, z, w)) continue;
    const j = (q: number) => (hash(i, q, salt + 5) - 0.5) * 0.14;
    // corners round from screen-left, mirrored on the left wall
    const P = (fu: number, fz: number, q: number): P3 => [a + r * (fu + j(q)) * w, 0.05, z + (fz + j(q + 1)) * h];
    const pts = [P(-0.5, -0.08, 1), P(-0.34, 0.42, 3), P(0.1, 0.52, 5), P(0.5, 0.14, 7), P(0.42, -0.44, 9), P(-0.06, -0.5, 11), P(-0.42, -0.4, 13)];
    const base = shade(bandAt(a, z).c, 0.03);
    // the shadow it casts on the rock, down and to the right
    k.poly(pts.map(([u, n, zz]): P3 => [u + r * 0.35, n - 0.01, zz - 0.45]), tone(withAlpha('#140b06', 0.4)), 0, 0.15);
    k.poly(pts, tone(base), 0, 0.12);
    const mTop: P3 = [a + r * 0.12 * w, 0.05, z + 0.1 * h];
    const mLow: P3 = [a + r * 0.04 * w, 0.05, z - 0.2 * h];
    k.poly([pts[0], pts[1], pts[2], pts[3], mTop], tone(shade(base, 0.14)), 0, 0.08);
    k.poly([pts[3], pts[4], pts[5], mLow, mTop], tone(shade(base, -0.16)), 0, 0.08);
    k.pen.beginPath();
    k.trace(pts, 0.12);
    k.paint(null, k.thin);
  }
}

// ── wall pieces ────────────────────────────────────────────────────────────

// A drift: a timbered portal round a dark opening, the tunnel running off
// into the wall with its sets and rails, a lantern far down it.
function adit(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const a = f.a;
  const aw = f.w - 4;
  const ah = f.w === ADIT ? AH : AH_S;
  const a0 = a - aw / 2;
  const a1 = a + aw / 2;
  const lean = 0.5;
  const open: P3[] = [[a0, 0.02, 0], [a1, 0.02, 0], [a1 - lean, 0.02, ah], [a0 + lean, 0.02, ah]];
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
  k.poly([[a0 + lean, 0, 0], [a0 + lean, -L, 0], [a0 + lean, -L, ah], [a0 + lean, 0, ah]], k.lgrad([a0, 0, 0], [a0, -L, 0], [0, 0, 1], [[0, '#3e3027'], [0.3, '#1e140d'], [1, DARK]]), 0);
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
    k.box(a0 + lean, d - 0.8, 0, 0.8, 0.8, ah - 0.6, c, { line: k.thin * 0.8, stripe: false, ink: DARK });
    k.box(a1 - lean - 0.8, d - 0.8, 0, 0.8, 0.8, ah - 0.6, c, { line: k.thin * 0.8, stripe: false, ink: DARK });
    k.box(a0 + lean, d - 0.8, ah - 1.4, aw - 2 * lean, 0.8, 1, c, { line: k.thin * 0.8, stripe: false, ink: DARK });
    if (d === -11) {
      k.halo(a, d + 1, 6, 6, '#ffb050', 0.3);
      hangLantern(k, a0 + lean + 1.6, d + 0.4, ah - 1.4, 0.6, 0.9, 0.85);
    }
  }
  // the mouth's own shadow, deepest under the cap
  k.poly(open, k.vgrad(a, 0.02, 0, ah, [[0, '#0c070500'], [0.6, '#0c070540'], [1, '#0c0705b0']]), 0);
  pen.restore();
  // the portal: posts, the cap on them, lagging over it
  const post = (u: number) => {
    k.box(u, 0, 0, 1.2, 1.4, ah + 0.3, C.timber, { stripe: false });
    if (k.fine) k.line([[u + 0.4, 1.41, 1.5], [u + 0.45, 1.41, ah - 2]], shade(C.timber, -0.25), Math.max(0.6, 0.06 * s));
  };
  post(a0 - 1.1);
  post(a1 - 0.1);
  for (const [u0, u1] of [[a0 + 0.1, a0 + 1.6], [a1 - 1.6, a1 - 0.1]]) {
    // knee braces in the top corners
    k.poly([[u0, 0.5, ah], [u1, 0.5, ah], [u0 === a0 + 0.1 ? u0 : u1, 0.5, ah - 1.5]], C.timberOld, k.thin);
  }
  k.box(a0 - 1.8, 0, ah + 0.3, aw + 3.6, 1.7, 1.5, C.timberOld);
  k.box(a0 - 0.8, 0, ah + 1.8, aw + 1.6, 1.2, 0.9, C.timber, { line: k.thin });
  // rocks fallen onto the cap's ends, a lantern on a nail
  rock(k, a0 - 1.3, 0.9, ah + 1.8, 0.7, 0.6, C.stone, f.k + 1, k.thin);
  rock(k, a + 1.5, 0.7, ah + 2.7, 0.5, 0.4, C.rockLight, f.k + 3, k.thin);
  rock(k, a1 + 1.1, 0.8, ah + 1.8, 0.55, 0.5, C.rockLight, f.k + 2, k.thin);
  hangLantern(k, a1 + 0.6, 1.7, ah + 0.3, 0.3, lampsOn(v) ? 1 : 0);
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

// A cap beam over a post, sitting on the plate and reaching out over the
// room (the roof's timbering, cut away with the roof), its sawn end paler.
function beam(k: Kit, v: RoomView, f: Feature): void {
  const z = plateZ(v.H) + 1.5;
  const out = 4;
  k.box(f.a - 0.7, 0, z, 1.4, out, 1.2, C.timberOld, { stripe: false });
  k.poly([[f.a - 0.7, out, z], [f.a + 0.7, out, z], [f.a + 0.7, out, z + 1.2], [f.a - 0.7, out, z + 1.2]], k.side('#a77a4c', 0, 1), k.thin);
  if (k.fine) {
    for (const rr of [0.42, 0.22]) {
      const ring: P3[] = [];
      for (let i = 0; i <= 10; i++) ring.push([f.a + 0.05 + Math.cos((i / 10) * Math.PI * 2) * rr, out + 0.01, z + 0.6 + Math.sin((i / 10) * Math.PI * 2) * rr * 0.8]);
      k.line(ring, shade('#a77a4c', -0.3), Math.max(0.6, 0.05 * k.s));
    }
  }
}

// A lantern hung from an iron bracket on a post, dark when it is out.
function lamp(k: Kit, f: Feature, on: boolean): void {
  const z = LAMP_Z;
  k.rod([[f.a, 1.2, z], [f.a, 2.4, z], [f.a, 2.4, z - 0.3]], C.iron, 0.14);
  k.rod([[f.a, 1.2, z - 1], [f.a, 2.0, z]], C.iron, 0.1);
  hangLantern(k, f.a, 2.4, z - 0.3, 0.4, on ? 1 : 0);
}

// Every third lantern on the walls is left burning through the night (the
// rest go out with the lights).
function burnsAtNight(plan: Plan, f: Feature): boolean {
  return plan.features.filter((g) => g.kind === 'lamp').indexOf(f) % 3 === 1;
}

// A line through pts, each stretch cut into n (a Catmull-Rom curve).
function smooth(pts: ReadonlyArray<P3>, n: number): P3[] {
  const out: P3[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    for (let j = 0; j < n; j++) {
      const t = j / n;
      const c = (q: number) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * t + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * t * t + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * t * t * t);
      out.push([c(0), c(1), c(2)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// A ribbon round a line on the wall, pinching and swelling (half-width
// about w0), tapering at its ends; fall > 0 makes it thicker at the start
// than at the end.
function ribbon(line: ReadonlyArray<P3>, w0: number, seed: number, swell = 0.9, fall = 0): P3[] {
  const l: P3[] = [];
  const r: P3[] = [];
  line.forEach((p, i) => {
    const q = line[Math.min(line.length - 1, i + 1)];
    const o = line[Math.max(0, i - 1)];
    const da = q[0] - o[0];
    const dz = q[2] - o[2];
    const len = Math.hypot(da, dz) || 1;
    const w = w0 * (1 - swell * 0.55 + hash(seed, i, 58) * swell) * (1 + fall * (0.5 - i / Math.max(1, line.length - 1))) * (i === 0 || i === line.length - 1 ? 0.25 : 1);
    l.push([p[0] - (dz / len) * w, p[1], p[2] + (da / len) * w]);
    r.push([p[0] + (dz / len) * w, p[1], p[2] - (da / len) * w]);
  });
  return [...l, ...r.reverse()];
}

// The motherlode's line up the wall: up beside the portal from the floor,
// then leaning over the cap to the roof, short of the corner or the cut
// end (the drawing and its light share it).
function lodeLine(v: { W: number; D: number; H: number; T: number }, plan: Plan, f: Feature): P3[] {
  const H = v.H;
  const a = f.a;
  const dir = f.dir ?? 1;
  const drift = plan.features.find((g) => g.wall === f.wall && g.kind === 'adit' && Math.abs(g.a - a) < g.w);
  const rise = (drift ? (drift.w === ADIT ? AH : AH_S) : 10) + 2.4;
  // how far it leans as it climbs, short of the corner or the cut end
  const room = (dir < 0 ? a - v.T : (f.wall === 'right' ? v.W : v.D) - a) - 3;
  const lean = Math.max(0.2, Math.min(1, room / ((H + 1 - rise) * 1.05)));
  const pts: P3[] = [];
  for (let i = 0; i <= 5; i++) {
    const t = i / 5;
    pts.push([a + dir * (t * 0.7 + (hash(f.k, i, 71) - 0.5) * 0.6), 0.03, 0.3 + t * (rise - 0.3)]);
  }
  for (let i = 1; i <= 8; i++) {
    const t = i / 8;
    const z = rise + t * (H + 1 - rise);
    pts.push([a + dir * (0.7 + (z - rise) * (0.75 + 0.3 * t) * lean) + (hash(f.k, i, 72) - 0.5) * 0.6, 0.03, z]);
  }
  return pts;
}

// The motherlode: a great seam of quartz and gold coming up out of the
// floor beside a drift (driven along it), climbing beside the portal,
// leaning over its cap and on up across the beds to the roof, bright
// against the dark up there. Stringers branch off it, nuggets stand out of
// it, glints catch the lamplight, and lumps of it lie at its foot.
function lode(k: Kit, v: RoomView, plan: Plan, f: Feature): void {
  const { s } = k;
  const a = f.a;
  const dir = f.dir ?? 1;
  const r = k.p(1, 0, 0)[0] > k.p(0, 0, 0)[0] ? 1 : -1;
  const pts = lodeLine(v, plan, f);
  // short stringers off it, curling up and away
  const stringers: P3[][] = [];
  for (const [from, side, len] of [[3, 1, 2], [7, -1, 3], [10, 1, 2]] as const) {
    const p = pts[from];
    const st: P3[] = [p];
    for (let i = 1; i <= len; i++) st.push([p[0] + side * dir * i * 0.9, 0.03, p[2] + i * (0.5 + i * 0.25)]);
    stringers.push(smooth(st, 3));
  }
  // the fracture it fills, then milky quartz swelling and pinching along
  // it, the gold in lenses down its middle with their lit edge
  const fine = smooth(pts, 3);
  for (const line of stringers) k.line(line, withAlpha(INK, 0.6), Math.max(1.2, 0.8 * s));
  k.poly(ribbon(fine, 1.75, f.k + 1, 0.5, 0.6), withAlpha(INK, 0.55), 0, 0.2);
  for (const line of stringers) k.poly(ribbon(line, 0.36, f.k + line.length), '#e8dcc0', 0, 0.05);
  k.poly(ribbon(fine, 1.35, f.k, 0.7, 0.6), '#e8dcc0', k.thin, 0.15);
  k.line(fine.slice(1, -1).map(([u, n, z]): P3 => [u - r * 0.75, n + 0.01, z + 0.2]), withAlpha('#fff8e6', 0.8), Math.max(0.8, 0.14 * s));
  for (const line of stringers) k.poly(ribbon(line, 0.17, f.k + 3), C.gold, 0, 0.03);
  k.poly(ribbon(fine, 0.72, f.k + 5, 1.1, 0.6), C.gold, k.thin * 0.7, 0.08);
  k.line(fine.slice(1, -1).map(([u, n, z]): P3 => [u - r * 0.26, n + 0.01, z + 0.12]), C.goldHi, Math.max(0.8, 0.2 * s));
  for (const [i, rr] of [[1, 0.75], [3, 0.95], [5, 0.7], [7, 1.0], [9, 0.75], [11, 0.85], [12, 0.6]] as const) nugget(k, pts[i][0] + (hash(f.k, i, 74) - 0.5) * 0.8, 0.14, pts[i][2] - 0.3, rr, f.k + i, false);
  for (const i of [2, 6, 10, 12]) sparkle(k, pts[i][0] + 0.5, 0.25, pts[i][2] + 0.4, 0.8 + hash(f.k, i, 75) * 0.35, 0.95);
  // what has broken off it, lying at its foot
  rock(k, a - 1.6, 1.1, 0, 0.6, 0.45, C.stone, f.k + 21, k.thin);
  rock(k, a + 1.7, 0.9, 0, 0.5, 0.4, C.rockLight, f.k + 22, k.thin);
  nugget(k, a - 0.4, 1.3, 0, 0.42, f.k + 23);
  rock(k, a + 0.6, 1.8, 0, 0.45, 0.35, C.stone, f.k + 24, k.thin);
  nugget(k, a + 1.1, 1.5, 0, 0.32, f.k + 25);
}

// A vein of gold through the rock: a branching seam, nuggets bedded in it,
// glints where the lamp light catches it.
function vein(k: Kit, v: RoomView, f: Feature): void {
  const { s } = k;
  const a = f.a;
  const pts: P3[] = [];
  const z0 = 8 + hash(f.k, 51) * 4;
  const z1 = Math.min(plateZ(v.H) - 2, z0 + 11 + hash(f.k, 52) * 6);
  const dir = hash(f.k, 53) < 0.5 ? 1 : -1;
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    pts.push([a + dir * (t - 0.5) * (f.w - 1) + (hash(f.k, i, 54) - 0.5) * 1.2, 0.03, z0 + (z1 - z0) * t]);
  }
  // a ribbon of quartz and gold with a stringer branching off it
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
  void z0;
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

function shell(k: Kit, v: RoomView, plan: Plan): void {
  const { W, D, H, T } = v;
  // the floor's cut edges: earth over rock
  for (const [p0, p1, nu, nv] of [[[T, D], [W, D], 0, 1], [[W, T], [W, D], 1, 0]] as const) {
    k.poly([[p0[0], p0[1], 0], [p1[0], p1[1], 0], [p1[0], p1[1], -SLAB], [p0[0], p0[1], -SLAB]], k.side('#5e4632', nu, nv), k.lw);
    k.poly([[p0[0], p0[1], -1.1], [p1[0], p1[1], -1.1], [p1[0], p1[1], -SLAB], [p0[0], p0[1], -SLAB]], k.side('#4e4038', nu, nv), 0);
  }
  k.line([[T, D, -0.35], [W, D, -0.35], [W, T, -0.35]], '#a58363', Math.max(1, 0.25 * k.s));
  // the walls' cut ends, banded like the faces
  for (const wall of ['left', 'right'] as const) {
    const bands = strata(H, T, wall);
    const [p, q, nu, nv] = wall === 'left' ? ([[0, D], [T, D], 0, 1] as const) : ([[W, 0], [W, T], 1, 0] as const);
    const a = wall === 'right' ? W : D;
    for (const b of bands) {
      const z0 = Math.max(-SLAB, b.z0(a));
      const z1 = Math.min(H, b.z1(a));
      if (z1 <= z0) continue;
      k.poly([[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], k.side(shade(b.c, -0.06), nu, nv), 0);
    }
    k.poly([[p[0], p[1], -SLAB], [q[0], q[1], -SLAB], [q[0], q[1], H], [p[0], p[1], H]], k.vgrad(p[0], p[1], H * 0.4, H, [[0, '#140b0600'], [1, '#140b0688']]), 0);
    k.pen.beginPath();
    k.trace([[p[0], p[1], -SLAB], [q[0], q[1], -SLAB], [q[0], q[1], H], [p[0], p[1], H]]);
    k.paint(null, k.lw);
  }
  // the tops: broken dark rock following each wall's rim, a lit lip along
  // the inside
  const cap = '#4a3e35';
  const tops = (['left', 'right'] as const).map((wall) => {
    const wk = new Kit(k.pen, wallAt(v.at, wall, T), k.s);
    const rim = plan.rims[wall];
    return { wall, wk, top: (n: number) => rim.map(([a, d]): P3 => [a, n, H - d]) };
  });
  k.poly([[0, 0, H], [T, 0, H], [T, T, H], [0, T, H]], cap, 0);
  for (const { wk, top } of tops) wk.poly([...top(0), ...top(-T).reverse()], cap, 0);
  // ink round it: the inside edge, the outside, the corner square's back
  const world = ({ wall, top }: (typeof tops)[number], n: number): P3[] => top(n).map(([a, o, z]): P3 => (wall === 'right' ? [a, T + o, z] : [T + o, a, z]));
  const [lt, rt] = tops;
  k.line([...world(lt, 0).reverse(), ...world(rt, 0)], INK, k.lw);
  k.line([...world(lt, -T).reverse(), [0, 0, H], ...world(rt, -T)], INK, k.lw);
  for (const t of tops) {
    t.wk.line(t.top(-0.4), shade(cap, 0.3), Math.max(1, 0.22 * k.s));
    t.wk.line(t.top(-T + 0.35), shade(cap, 0.18), Math.max(1, 0.18 * k.s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}
