import type { At } from '../../art/iso.ts';
import { frame, shade } from '../../art/iso.ts';
import type { Color, Gradient } from '../../art/types.ts';
import { hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import { candle, chain, flame, skull, swag } from './bits.ts';
import type { P3, Pt } from './kit.ts';
import { C, INK, Kit, hash, withAlpha } from './kit.ts';

// Hell's shell: a hall of red basalt blocks over an obsidian plinth, lit
// from below by the lava; a frieze of carved skulls under the cornice and
// chains swagged along it with lanterns hung on them. On the walls, between
// the stations: the Maw (a horned demon skull carved huge in the wall,
// lava pouring from its jaws into a basin), barred pointed windows onto the
// burning land outside, crimson banners, ossuary niches of skulls and
// candles, a gibbet cage, shackles and torches; lava glowing through cracks
// in the stone. The floor is dark flagstones crazed with glowing cracks, a
// summoning circle before the throne, a seal at the hub and a red carpet in
// from the gate; the slab it stands on bleeds lava at its edges. Every wall
// piece sits in the free stretches between the stations, worked out from
// the same plan the stage uses.

type Wall = 'left' | 'right';
type Kind = 'maw' | 'window' | 'banner' | 'niche' | 'cage' | 'shackles' | 'torch';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[] };

const SLAB = 3; // the floor slab's thickness, shown along the front cut
const PLINTH = 4.5; // the obsidian base course
const COURSE = 3.4; // a course of blocks
const FRIEZE = 7.5; // the skull frieze's depth under the top
const CORNICE = 2.4;

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell finds the stations without being told),
// and what stands on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'hell');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L) };
  PLANS.set(key, plan);
  return plan;
}

const between = (L: Layout, wall: Wall, a0: number, a1: number) => {
  const on = L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? s.x0 : s.y0));
  return on.some((p) => p < a0) && on.some((p) => p >= a1);
};

export const MAW = 24; // the Maw horn to horn, in a room with the wall for it
const MAW_MIN = 13; // smaller rooms get a smaller Maw, down to this
const MAW_H = 46; // how tall it stands, horns and all
const WIDTH: Record<Kind, number> = { maw: MAW, window: 11, banner: 6, niche: 9, cage: 7, shackles: 5, torch: 2 };
const ORDER: Kind[] = ['window', 'banner', 'niche', 'window', 'cage', 'banner', 'window', 'shackles', 'niche', 'window', 'banner'];

// The Maw in the longest stretch between two stations (else the longest
// stretch); then windows first on each wall, banners, niches, a cage and
// shackles between them, and torches in the gaps between neighbours.
function features(L: Layout): Feature[] {
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
  const fits = spans.filter((s) => s.a1 - s.a0 >= MAW_MIN);
  const longest = (list: typeof spans) => [...list].sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
  const pick = longest(fits.filter((s) => between(L, s.wall, s.a0, s.a1))) ?? longest(fits);
  if (pick) {
    const mid = (pick.a0 + pick.a1) / 2;
    const w = MAW * Math.min(1, (pick.a1 - pick.a0) / MAW, (L.H - FRIEZE - 2) / MAW_H);
    out.push({ wall: pick.wall, kind: 'maw', a: mid, w, k: 0 });
    spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: mid - w / 2 - 3 }, { wall: pick.wall, a0: mid + w / 2 + 3, a1: pick.a1 });
  }
  const windows = { left: 0, right: 0 };
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? 5 : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      if (!windows[s.wall] && room('window')) k = 'window';
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if (room(c)) k = c;
      }
      k ??= room('torch') ? 'torch' : undefined;
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? 5 : 0);
      kinds.push(k);
      if (k === 'window') windows[s.wall]++;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    const placed: Feature[] = [];
    kinds.forEach((k, i) => {
      placed.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    out.push(...placed);
    // Torches between neighbours with room for them.
    for (let i = 0; i + 1 < placed.length; i++) {
      if (gap < 3.5 || placed[i].kind === 'torch' || placed[i + 1].kind === 'torch') continue;
      out.push({ wall: s.wall, kind: 'torch', a: placed[i].a + placed[i].w / 2 + gap / 2, w: 2, k: n + i });
    }
  }
  return out;
}

// Windows: sill and apex (z) for a wall H tall.
function windowZ(H: number): { z0: number; z1: number } {
  const z0 = PLINTH + 7;
  return { z0, z1: Math.min(H - FRIEZE - 6, z0 + 30) };
}

const TORCH_Z = 19; // a torch's cup (its flame above anyone's head)

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but warm by the Maw's basin rather than round the fire
// pit, and a look out of a couple of the windows.
export function hellPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L).filter((p) => p.kind !== 'warm');
  const maw = fs.find((f) => f.kind === 'maw');
  if (maw) {
    const face = pt(maw.wall, maw.a, 0);
    out.push({ ...pt(maw.wall, maw.a - 6, 8), kind: 'warm', face }, { ...pt(maw.wall, maw.a + 6, 8), kind: 'warm', face }, { ...pt(maw.wall, maw.a, 10), kind: 'warm', face });
  }
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
  return out.map((p) => ({ ...p, x: Math.round(p.x), y: Math.round(p.y) }));
}

// ── drawing ────────────────────────────────────────────────────────────────

const wallAt = (P: At, wall: Wall, T: number): At => frame(P, wall, wall === 'right' ? 0 : T, wall === 'right' ? T : 0);

// True if the screen box round the frame-aligned box holding `pts` (grown
// by m units) meets the canvas: the shell is painted a tile at a time, so
// pieces off the tile are skipped.
function seen(k: Kit, pts: ReadonlyArray<P3>, m = 0): boolean {
  let u0 = Infinity;
  let v0 = Infinity;
  let z0 = Infinity;
  let u1 = -Infinity;
  let v1 = -Infinity;
  let z1 = -Infinity;
  for (const [u, v, z] of pts) {
    u0 = Math.min(u0, u);
    u1 = Math.max(u1, u);
    v0 = Math.min(v0, v);
    v1 = Math.max(v1, v);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const u of [u0, u1]) {
    for (const v of [v0, v1]) {
      for (const z of [z0, z1]) {
        const [x, y] = k.p(u, v, z);
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const g = m * k.s + 4;
  return x1 + g > 0 && y1 + g > 0 && x0 - g < k.pen.width && y0 - g < k.pen.height;
}

// The box round a wall piece from a0 to a1, n0 to n1 out, z0 to z1 up.
const boxPts = (a0: number, a1: number, n0: number, n1: number, z0: number, z1: number): P3[] => [
  [a0, n0, z0], [a1, n0, z0], [a0, n1, z0], [a1, n1, z0], [a0, n0, z1], [a1, n0, z1], [a0, n1, z1], [a1, n1, z1],
];

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
      if (f.kind === 'maw') mawFlicker(k, v, f);
      else if (f.kind === 'torch') torchFlicker(k, v, f);
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const STONES = ['#553538', '#5e3c3c', '#4f3134', '#654342', '#58383a'];
const ROW = 4.2; // flagstone rows along x

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  // Flagstones in rows along x, joints staggered; one path a tone.
  const rows = Math.ceil((D - T) / ROW);
  const runs: Array<Array<[number, number, number, number]>> = STONES.map(() => []);
  const joints: Array<[number, number, number]> = [];
  for (let r = 0; r < rows; r++) {
    const y0 = T + r * ROW;
    const y1 = Math.min(D, y0 + ROW);
    let x = T - hash(r, 3) * 6;
    let i = 0;
    while (x < W) {
      const len = 4 + Math.floor(hash(r, i, 5) * 5);
      const x0 = Math.max(T, x);
      const x1 = Math.min(W, x + len);
      if (x1 > x0 && seen(k, [[x0, y0, 0], [x1, y1, 0]])) {
        runs[Math.floor(hash(r, i, 9) * STONES.length)].push([x0, y0, x1, y1]);
        if (x + len < W) joints.push([x + len, y0, y1]);
      }
      x += len;
      i++;
    }
  }
  runs.forEach((list, ti) => {
    pen.beginPath();
    for (const [x0, y0, x1, y1] of list) k.trace([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
    pen.fillStyle = STONES[ti];
    pen.fill();
  });
  // The lit edge of each stone (toward the upper left), then the seams.
  if (s >= 3) {
    pen.beginPath();
    for (const list of runs) {
      for (const [x0, y0, x1, y1] of list) {
        const a = k.p(x0 + 0.25, y1 - 0.2, 0);
        const b = k.p(x0 + 0.25, y0 + 0.25, 0);
        const c = k.p(x1 - 0.2, y0 + 0.25, 0);
        pen.moveTo(a[0], a[1]);
        pen.lineTo(b[0], b[1]);
        pen.lineTo(c[0], c[1]);
      }
    }
    pen.strokeStyle = '#8a6a6a40';
    pen.lineWidth = Math.max(0.7, 0.14 * s);
    pen.lineJoin = 'round';
    pen.stroke();
  }
  pen.beginPath();
  for (let r = 1; r < rows; r++) {
    const y = T + r * ROW;
    if (!seen(k, [[T, y, 0], [W, y, 0]])) continue;
    const [a, b] = [k.p(T, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (const [x, y0, y1] of joints) {
    const [a, b] = [k.p(x, y0, 0), k.p(x, y1, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#1e0a0ecc';
  pen.lineWidth = Math.max(0.8, 0.16 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  // Light and shade: dark in the far corner and along the walls' feet, warm
  // in the middle where the lava's light reaches.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#12040650');
  g.addColorStop(0.3, '#12040618');
  g.addColorStop(0.7, '#12040600');
  g.addColorStop(1, '#12040628');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  const h = hub(plan.L);
  k.pool(h.x, h.y, (W - T) * 0.55, (D - T) * 0.55, '#ff7a3a', 0.14);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#14040670'], [0.35, '#14040628'], [1, '#14040600']]), 0);
  }
  cracks(k, v, plan);
  // Inlays and rugs where people gather, then the light on the floor.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const rects = plan.L.slots.map(slotRect);
  for (const f of [1, 0.85, 0.7, 0.55]) {
    const r = 9 * f;
    const box = { x0: h.x - r, y0: h.y - r, x1: h.x + r, y1: h.y + r };
    if (rects.some((q) => q.x0 < box.x1 + 2 && box.x0 < q.x1 + 2 && q.y0 < box.y1 + 2 && box.y0 < q.y1 + 2)) continue;
    if (seen(k, [[box.x0, box.y0, 0], [box.x1, box.y1, 0]], 2)) seal(k, h.x, h.y, r);
    break;
  }
  const think = slot('think');
  if (think) {
    const tk = new Kit(pen, frame(v.at, think.wall, think.x0, think.y0), s);
    if (seen(tk, [[-4, -2, 0], [think.len + 4, think.dep + 8, 0]], 4)) circle(tk, think.len / 2, think.dep + 1.5, 4.6);
  }
  const door = slot('entrance');
  if (door) {
    const dk = new Kit(pen, frame(v.at, door.wall, door.x0, door.y0), s);
    if (seen(dk, [[0, 0, 0], [door.len, 22, 0]], 4)) carpet(dk, 7.5, 0.3, 4.8, 20);
  }
  const idle = slot('idle');
  if (idle) {
    const ik = new Kit(pen, frame(v.at, idle.wall, idle.x0, idle.y0), s);
    if (seen(ik, [[-3, -3, 0], [idle.len + 3, idle.dep + 3, 0]], 6)) {
      ik.disc(idle.len / 2, idle.dep / 2, 0.02, 7.6, '#3a2628', 0);
      ik.disc(idle.len / 2, idle.dep / 2, 0.02, 6.2, '#2c1c1e', 0);
      ik.pool(idle.len / 2, idle.dep / 2, 12, 10, '#ff8a3a', 0.3);
    }
  }
  for (const [kind, u, w, r, a, c] of [['think', 0.5, 0.6, 12, 0.22, '#ff7a3a'], ['run', 0.5, 0.6, 13, 0.3, '#ff8a3a'], ['web', 0.5, 0.5, 9, 0.22, '#5fe0b0'], ['write', 0.5, 0.8, 8, 0.16, '#ffb060'], ['read', 0.6, 0.8, 8, 0.14, '#ffb060'], ['search', 0.5, 1, 8, 0.16, '#ffd060'], ['entrance', 0.5, 1, 10, 0.26, '#ff6a2a']] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (seen(qk, [[q.len * u - r, q.dep * w - r, 0], [q.len * u + r, q.dep * w + r, 0]])) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
  const maw = plan.features.find((f) => f.kind === 'maw');
  if (maw) {
    const mk = mawKit(new Kit(pen, wallAt(v.at, maw.wall, T), s), maw);
    if (seen(mk, [[maw.a - 16, 0, 0], [maw.a + 16, 14, 0]], 2)) {
      mk.pool(maw.a, 4, 15, 11, '#ff6a20', 0.42);
      // scorch round the basin
      mk.pool(maw.a, 3, 10, 6, '#100204', 0.3, 0, 'screen');
    }
  }
}

// Cracks across the floor with lava glowing in them: jagged runs with a
// branch or two, clear of the stations, the hub and the walkways.
function cracks(k: Kit, v: RoomView, plan: Plan): void {
  const { W, D, T } = v;
  const pen = k.pen;
  const rects = plan.L.slots.map(slotRect);
  const h = hub(plan.L);
  const n = Math.round(((W - T) * (D - T)) / 2600);
  const lines: P3[][] = [];
  const near = (px: number, py: number) => rects.some((r) => px > r.x0 - 3 && px < r.x1 + 3 && py > r.y0 - 3 && py < r.y1 + 3) || Math.hypot(px - h.x, py - h.y) < 12;
  let made = 0;
  for (let i = 0; i < n * 3 && made < n; i++) {
    let x = T + 6 + hash(i, 71) * (W - T - 12);
    let y = T + 6 + hash(i, 72) * (D - T - 12);
    if (near(x, y)) continue;
    const pts: P3[] = [[x, y, 0.02]];
    let a = hash(i, 73) * Math.PI * 2;
    const len = 5 + Math.floor(hash(i, 74) * 6);
    for (let j = 0; j < len; j++) {
      a += (hash(i, j, 75) - 0.5) * 1.1;
      const step = 0.9 + hash(i, j, 76) * 1.6;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      if (x < T + 2 || y < T + 2 || x > W - 2 || y > D - 2 || near(x, y)) break;
      pts.push([x, y, 0.02]);
    }
    if (pts.length < 3) continue;
    made++;
    if (!seen(k, pts, 3)) continue;
    lines.push(pts);
    // a short branch off the middle
    const [bx, by] = pts[Math.floor(pts.length / 2)];
    const ba = a + (hash(i, 77) < 0.5 ? 1 : -1) * 0.9;
    lines.push([[bx, by, 0.02], [bx + Math.cos(ba) * 1.2, by + Math.sin(ba) * 1.2, 0.02], [bx + Math.cos(ba + 0.3) * 2.2, by + Math.sin(ba + 0.3) * 2.2, 0.02]]);
  }
  if (!lines.length) return;
  const s = k.s;
  // glow under, the dark lip, the hot line
  pen.save();
  pen.globalCompositeOperation = 'screen';
  for (const pts of lines) k.line(pts, '#ff5a1a2a', Math.max(3, 1.5 * s));
  pen.restore();
  for (const pts of lines) k.line(pts, '#1a0608', Math.max(1.6, 0.4 * s));
  for (const pts of lines) k.line(pts, C.lava, Math.max(0.8, 0.18 * s));
  if (k.fine) for (const pts of lines) k.line(pts.slice(0, -1), C.lavaHot, 0.07 * s);
}

// The seal at the hub: a ring of obsidian inlaid with gold, flames round it.
function seal(k: Kit, cu: number, cv: number, r: number): void {
  const z = 0.03;
  k.shadow(cu, cv, r * 1.05, r * 1.05, 0.12);
  k.disc(cu, cv, z, r, C.obsidian, k.thin);
  k.disc(cu, cv, z, r * 0.9, '#3a2c44', 0);
  const pen = k.pen;
  const ringAt = (rr: number, c: Color, w: number) => {
    const e = k.ell(cu, cv, z, rr);
    pen.beginPath();
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    pen.strokeStyle = c;
    pen.lineWidth = w;
    pen.stroke();
  };
  ringAt(r * 0.82, C.gold, Math.max(1, 0.3 * k.s));
  ringAt(r * 0.42, C.gold, Math.max(1, 0.24 * k.s));
  // flames between the rings, pointing out
  pen.beginPath();
  const n = 12;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const b = a + Math.PI / n;
    const p0 = k.p(cu + Math.cos(a - 0.12) * r * 0.46, cv + Math.sin(a - 0.12) * r * 0.46, z);
    const p1 = k.p(cu + Math.cos(b) * r * 0.78, cv + Math.sin(b) * r * 0.78, z);
    const p2 = k.p(cu + Math.cos(a + Math.PI * 2 / n + 0.12) * r * 0.46, cv + Math.sin(a + Math.PI * 2 / n + 0.12) * r * 0.46, z);
    pen.moveTo(p0[0], p0[1]);
    pen.quadraticCurveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 + 0.5, p1[0], p1[1]);
    pen.quadraticCurveTo((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 + 0.5, p2[0], p2[1]);
    pen.closePath();
  }
  pen.fillStyle = '#c0401e';
  pen.fill();
  k.disc(cu, cv, z, r * 0.3, '#2a1e30', 0);
  ringAt(r * 0.16, C.gold, Math.max(1, 0.2 * k.s));
  k.pool(cu, cv, r * 0.9, r * 0.9, '#ff9a4a', 0.14, z);
}

// A summoning circle in glowing lines before the throne: two rings, runes
// between them, a six-pointed star inside.
function circle(k: Kit, cu: number, cv: number, r: number): void {
  const z = 0.03;
  const pen = k.pen;
  k.pool(cu, cv, r * 1.5, r * 1.5, '#ff4a1a', 0.3, z);
  const ringAt = (rr: number) => {
    const e = k.ell(cu, cv, z, rr);
    pen.moveTo(e.cx + e.rx * Math.cos(e.rot), e.cy + e.rx * Math.sin(e.rot));
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
  };
  const lines = () => {
    pen.beginPath();
    ringAt(r);
    ringAt(r * 0.8);
    for (let t = 0; t < 2; t++) {
      for (let i = 0; i <= 3; i++) {
        const a = ((i % 3) / 3) * Math.PI * 2 + t * (Math.PI / 3) - Math.PI / 2;
        const [x, y] = k.p(cu + Math.cos(a) * r * 0.8, cv + Math.sin(a) * r * 0.8, z);
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      }
    }
    // runes: little marks round the band
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const [x0, y0] = k.p(cu + Math.cos(a) * r * 0.86, cv + Math.sin(a) * r * 0.86, z);
      const [x1, y1] = k.p(cu + Math.cos(a + 0.12) * r * 0.94, cv + Math.sin(a + 0.12) * r * 0.94, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
      if (i & 1) pen.lineTo(x1 - (x1 - x0) * 0.2, y0);
    }
  };
  lines();
  pen.strokeStyle = '#ff5a1a55';
  pen.lineWidth = Math.max(2.5, 0.6 * k.s);
  pen.lineJoin = 'round';
  pen.stroke();
  lines();
  pen.strokeStyle = '#ffb04a';
  pen.lineWidth = Math.max(1, 0.18 * k.s);
  pen.stroke();
}

// A red carpet in from the gate: crimson with gold borders, u along the
// wall, running out along v.
function carpet(k: Kit, cu: number, v0: number, w: number, len: number): void {
  const z = 0.04;
  const [a, b] = [cu - w / 2, cu + w / 2];
  k.shadow(cu, v0 + len / 2, w * 0.6, len * 0.5, 0.15);
  k.poly([[a, v0, z], [b, v0, z], [b, v0 + len, z], [a, v0 + len, z]], C.velvet, k.thin, 0.2);
  for (const d of [0.45, 0.75]) k.line([[a + d, v0, z], [a + d, v0 + len - d, z], [b - d, v0 + len - d, z], [b - d, v0, z]], d < 0.5 ? C.gold : '#e2b03a80', Math.max(0.8, 0.15 * k.s));
  // a pattern of small diamonds down the middle
  for (let w2 = v0 + 2.5; w2 < v0 + len - 1.5; w2 += 3) k.poly([[cu - 0.7, w2, z], [cu, w2 - 0.7, z], [cu + 0.7, w2, z], [cu, w2 + 0.7, z]], C.velvetDark, 0);
  // fringe at the far end
  const pen = k.pen;
  pen.beginPath();
  for (let u = a + 0.3; u < b - 0.1; u += 0.6) {
    const [x0, y0] = k.p(u, v0 + len, z);
    const [x1, y1] = k.p(u, v0 + len + 0.7, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = C.gold;
  pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  pen.stroke();
}

// ── walls ──────────────────────────────────────────────────────────────────

const ROCK: ReadonlyArray<readonly [number, Color]> = [[0, '#9a4232'], [0.25, '#7e3428'], [0.65, '#5a2420'], [1, '#3c1618']];

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  // The rock: lit warm from below by the lava, falling off to a deep
  // maroon under the frieze.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, 0, H, ROCK.map(([t, c]) => [t, tone(c)] as const)), 0);
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#14040640'], [1, '#14040600']]), 0);
  masonry(k, v, wall, end, lit);
  glowCracks(k, v, plan, wall, end);
  // The obsidian plinth: blocks with a bevel catching the light.
  const ob = tone(C.obsidian, 0.1);
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, PLINTH], [T, 0, PLINTH]], ob, 0);
  pen.beginPath();
  for (let a = T + 3 + hash(wall === 'right' ? 1 : 2, 81) * 4; a < end - 1; a += 7 + hash(Math.floor(a), 82) * 3) {
    const [x0, y0] = k.p(a, 0.02, 0);
    const [x1, y1] = k.p(a, 0.02, PLINTH - 0.4);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#140c1a';
  pen.lineWidth = Math.max(0.8, 0.14 * s);
  pen.stroke();
  k.box(T, 0, PLINTH - 0.6, end - T, 0.6, 0.6, tone('#3e3048', 0.1), { line: k.thin, stripe: false });
  k.line([[T, 0.62, PLINTH - 0.05], [end, 0.62, PLINTH - 0.05]], tone('#7a6a8c'), Math.max(0.8, 0.14 * s));
  // The lava's glow on the wall's foot.
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.poly([[T, 0.03, 0], [end, 0.03, 0], [end, 0.03, 16], [T, 0.03, 16]], k.vgrad(T, 0.03, 0, 16, [[0, '#ff6a2a30'], [0.4, '#ff6a2a12'], [1, '#ff6a2a00']]), 0);
  pen.restore();
  frieze(k, v, end, lit);
  for (const f of plan.features) {
    if (f.wall !== wall) continue;
    const hgt = f.kind === 'banner' ? H - FRIEZE : f.kind === 'maw' ? 46 : f.kind === 'cage' ? 38 : windowZ(H).z1 + 3;
    if (!seen(k, boxPts(f.a - f.w / 2 - 4, f.a + f.w / 2 + 4, -2, f.kind === 'maw' ? 7 : 4, 0, hgt), 6)) continue;
    if (f.kind === 'maw') mawArt(k, v, f);
    else if (f.kind === 'window') windowArt(k, v, f, lit);
    else if (f.kind === 'banner') banner(k, v, f, lit);
    else if (f.kind === 'niche') niche(k, v, f, lit);
    else if (f.kind === 'cage') cage(k, v, f);
    else if (f.kind === 'shackles') shackles(k, f);
    else if (f.kind === 'torch') torch(k, f);
  }
  lanterns(k, v, end);
}

// Courses of big blocks, joints staggered, a few blocks lighter or darker.
function masonry(k: Kit, v: RoomView, wall: Wall, end: number, lit: boolean): void {
  const { pen, s } = k;
  const { T, H } = v;
  const top = H - FRIEZE;
  const light: P3[][] = [];
  const dark: P3[][] = [];
  const seams: Array<[Pt, Pt]> = [];
  const edges: Array<[Pt, Pt]> = [];
  let r = 0;
  for (let z = PLINTH; z < top - 0.5; z += COURSE, r++) {
    const z1 = Math.min(top, z + COURSE);
    if (!seen(k, [[T, 0, z], [end, 0, z1]])) continue;
    seams.push([k.p(T, 0, z1), k.p(end, 0, z1)]);
    if (z1 < top) edges.push([k.p(T, 0, z1 - 0.35), k.p(end, 0, z1 - 0.35)]);
    let a = T + hash(r, wall === 'right' ? 91 : 92) * 6;
    let i = 0;
    while (a < end) {
      const a1 = Math.min(end, a + 5.5 + hash(r, i, 93) * 4.5);
      if (seen(k, [[a, 0, z], [a1, 0, z1]])) {
        if (a1 < end) seams.push([k.p(a1, 0, z), k.p(a1, 0, z1)]);
        const hv = hash(r, i, 94);
        if (hv < 0.12) light.push([[a, 0, z], [a1, 0, z], [a1, 0, z1], [a, 0, z1]]);
        else if (hv > 0.86) dark.push([[a, 0, z], [a1, 0, z], [a1, 0, z1], [a, 0, z1]]);
      }
      a = a1;
      i++;
    }
  }
  for (const [list, c] of [[light, lit ? '#ffb08a16' : '#ffb08a0e'], [dark, '#14040628']] as const) {
    if (!list.length) continue;
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = c;
    pen.fill();
  }
  const stroke = (segs: Array<[Pt, Pt]>, c: Color, w: number) => {
    if (!segs.length) return;
    pen.beginPath();
    for (const [a, b] of segs) {
      pen.moveTo(a[0], a[1]);
      pen.lineTo(b[0], b[1]);
    }
    pen.strokeStyle = c;
    pen.lineWidth = w;
    pen.lineCap = 'butt';
    pen.stroke();
  };
  // a highlight along each course's top edge, catching the light from above
  if (s >= 3) stroke(edges, lit ? '#e0806020' : '#e0806014', Math.max(0.8, 0.22 * s));
  stroke(seams, '#24080cb0', Math.max(0.8, 0.2 * s));
}

// Cracks in the wall with lava showing through, clear of what hangs there.
function glowCracks(k: Kit, v: RoomView, plan: Plan, wall: Wall, end: number): void {
  const taken = plan.features.filter((f) => f.wall === wall).map((f) => [f.a - f.w / 2 - 3, f.a + f.w / 2 + 3] as const);
  const slots = plan.L.slots.filter((q) => q.wall === wall && !q.island).map((q): readonly [number, number] => (wall === 'right' ? [q.x0 - 2, q.x0 + q.len + 2] : [q.y0 - 2, q.y0 + q.len + 2]));
  const n = Math.round((end - v.T) / 40);
  let placed = 0;
  for (let i = 0; i < 40 && placed < n; i++) {
    const a = v.T + 8 + hash(i, wall === 'right' ? 101 : 102) * (end - v.T - 16);
    if ([...taken, ...slots].some(([a0, a1]) => a + 4 > a0 && a - 4 < a1)) continue;
    placed++;
    const pts: P3[] = [];
    let z = PLINTH + 0.2;
    let u = a;
    const top = PLINTH + 8 + hash(i, 103) * 22;
    while (z < top) {
      pts.push([u, 0.02, z]);
      z += 1.2 + hash(i, pts.length, 104) * 1.6;
      u += (hash(i, pts.length, 105) - 0.5) * 2.2;
    }
    if (!seen(k, pts, 4)) continue;
    k.pen.save();
    k.pen.globalCompositeOperation = 'screen';
    k.line(pts, '#ff5a1a28', Math.max(4, 2.2 * k.s));
    k.pen.restore();
    k.line(pts, '#1a0608', Math.max(1.6, 0.5 * k.s));
    k.line(pts, C.lava, Math.max(0.8, 0.22 * k.s));
    // a branch
    const j = Math.floor(pts.length / 2);
    if (pts[j]) {
      const [bu, , bz] = pts[j];
      const br: P3[] = [[bu, 0.02, bz], [bu + 1.4, 0.02, bz + 1.2], [bu + 2.2, 0.02, bz + 1.6]];
      k.line(br, '#1a0608', Math.max(1.2, 0.4 * k.s));
      k.line(br, C.lava, Math.max(0.7, 0.16 * k.s));
    }
    k.halo(pts[0][0], 0.3, PLINTH + 1, 4, '#ff6a2a', 0.25);
  }
}

// Under the cornice: a band of dark stone with a row of carved skulls, and
// the cornice over it.
function frieze(k: Kit, v: RoomView, end: number, lit: boolean): void {
  const { pen, s } = k;
  const { T, H } = v;
  const z0 = H - FRIEZE;
  const z1 = H - CORNICE;
  const tone = (c: Color) => (lit ? c : shade(c, -0.16));
  if (!seen(k, [[T, 0, z0 - 1], [end, 0.8, H]])) return;
  k.box(T, 0, z0 - 0.8, end - T, 0.7, 0.8, tone('#4a1c1e'), { line: k.thin, stripe: false });
  k.poly([[T, 0, z0], [end, 0, z0], [end, 0, z1], [T, 0, z1]], tone('#30121a'), 0);
  // the skulls, in relief
  const step = 4.2;
  const r = 1.15;
  for (let a = T + step / 2 + 1; a < end - 1.5; a += step) {
    if (!seen(k, [[a - 2, 0, z0], [a + 2, 0, z1]])) continue;
    skull(k, a, 0.3, z0 + 0.6, r, { base: tone('#cdb48c'), line: k.thin });
  }
  k.box(T, 0, z1, end - T, 1.0, CORNICE, tone('#3a1a22'), { line: k.thin, stripe: false });
  k.line([[T, 1.02, H - 0.15], [end, 1.02, H - 0.15]], tone('#8a4a4a'), Math.max(0.8, 0.16 * s));
}

// Chains swagged along under the frieze, an iron lantern at every other hook.
function lanterns(k: Kit, v: RoomView, end: number): void {
  const z = v.H - FRIEZE - 1.6;
  const span = 16;
  const n = 0.4;
  for (let a = v.T + 2, i = 0; a + span <= end; a += span, i++) {
    if (!seen(k, [[a, 0, z - 6], [a + span, 2, z + 1]], 4)) continue;
    chain(k, swag([a, n, z], [a + span, n, z], 2.2, 10), 0.55, '#5a4e52');
    if (i % 2 === 0) continue;
    // a lantern hanging from the hook at a
    const hz = z - 0.2;
    k.halo(a, 0.8, hz - 3, 5.5, '#ff9a4a', 0.28);
    k.line([[a, n, hz], [a, n + 0.4, hz - 1.2]], INK, Math.max(1, 0.12 * k.s));
    k.box(a - 0.55, n - 0.15, hz - 3.4, 1.1, 1.1, 1.9, C.iron, { line: k.thin, stripe: false });
    k.poly([[a - 0.38, n + 0.96, hz - 3.2], [a + 0.38, n + 0.96, hz - 3.2], [a + 0.38, n + 0.96, hz - 1.7], [a - 0.38, n + 0.96, hz - 1.7]], '#ffc260', 0);
    k.line([[a, n + 0.98, hz - 3.2], [a, n + 0.98, hz - 1.7]], C.iron, Math.max(0.7, 0.1 * k.s));
    k.poly([[a - 0.7, n - 0.3, hz - 1.5], [a + 0.7, n - 0.3, hz - 1.5], [a, n + 0.4, hz - 0.8]], C.iron, k.thin);
    k.halo(a, n + 1, hz - 2.4, 1.6, '#ffd890', 0.5);
  }
}

// ── wall pieces ──────────────────────────────────────────────────────────────

// A pointed (gothic) arch: from the sill z0 to the apex z1, w wide, in the
// plane n.
function arch(a: number, w: number, z0: number, z1: number, n: number, steps = 10): P3[] {
  const r = w / 2;
  const R = r * 1.4;
  const th = Math.acos((R - r) / R);
  const rise = R * Math.sin(th);
  const spring = z1 - rise;
  const pts: P3[] = [[a - r, n, z0], [a + r, n, z0]];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * th;
    pts.push([a + r - R + R * Math.cos(t), n, spring + R * Math.sin(t)]);
  }
  for (let i = steps - 1; i >= 0; i--) {
    const t = (i / steps) * th;
    pts.push([a - r + R - R * Math.cos(t), n, spring + R * Math.sin(t)]);
  }
  return pts;
}

// A barred window onto the burning land: a sky going from smoke to fire,
// jagged ridges, a volcano spilling lava, a river of it below; iron bars,
// a stone casing with a skull for a keystone, a sill with a candle.
function windowArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const w = f.w - 2;
  const a = f.a;
  const depth = 1.2;
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  // the casing and the reveal
  k.halo(a, 0.2, (z0 + z1) / 2, 12, '#ff6a2a', 0.18);
  k.poly(arch(a, w + 2.2, z0 - 0.5, z1 + 1.4, 0.05, 12), tone('#5e2a26'), k.lw);
  const open = arch(a, w, z0, z1, 0.08, 12);
  k.poly(open, tone('#3a1414'), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  const n = -depth;
  k.poly(arch(a, w, z0, z1, n, 12), k.vgrad(a, n, z0, z1, [[0, '#ffb04a'], [0.18, '#f0602a'], [0.45, '#a0281e'], [0.75, '#5a1418'], [1, '#2a0a12']]), 0);
  // the far ridges, a volcano, the near ground and the lava river
  const ridge: P3[] = [[a - w / 2 - 1, n, z0]];
  const seg = 7;
  for (let i = 0; i <= seg; i++) {
    const u = a - w / 2 + (w * i) / seg;
    ridge.push([u, n, z0 + 7 + hash(f.k, i, 21) * 5]);
  }
  ridge.push([a + w / 2 + 1, n, z0]);
  k.poly(ridge, '#6a1a1a', 0);
  const vu = a + (hash(f.k, 22) - 0.5) * w * 0.4;
  const vz = z0 + 15 + hash(f.k, 23) * 4;
  k.halo(vu, n, vz + 1, 6, '#ffb04a', 0.45);
  k.poly([[vu - 7, n, z0 + 3], [vu - 1.2, n, vz], [vu + 1.2, n, vz], [vu + 7, n, z0 + 3]], '#3a0e12', 0);
  for (const [du, l] of [[-0.6, 7], [0.5, 9], [0.1, 5]] as const) {
    const pts: P3[] = [];
    for (let i = 0; i <= 6; i++) pts.push([vu + du + du * i * 0.9 + Math.sin(i * 1.7) * 0.3, n, vz - (l * i) / 6]);
    k.line(pts, C.lava, Math.max(0.8, 0.3 * s));
  }
  k.poly([[vu - 1.3, n, vz], [vu + 1.3, n, vz], [vu + 0.9, n, vz + 0.5], [vu - 0.9, n, vz + 0.5]], C.lavaHot, 0);
  // a plume of smoke off the crater
  for (let i = 0; i < 4; i++) k.dot(vu + i * 0.8 + 0.3, n, vz + 2 + i * 2.2, (1.1 + i * 0.45) * s, (0.8 + i * 0.35) * s, '#2a0a10a0');
  const near: P3[] = [[a - w / 2 - 1, n, z0]];
  for (let i = 0; i <= seg; i++) near.push([a - w / 2 + (w * i) / seg, n, z0 + 3 + hash(f.k, i, 24) * 2.5]);
  near.push([a + w / 2 + 1, n, z0]);
  k.poly(near, '#1e080c', 0);
  k.poly([[a - w / 2 - 1, n, z0 + 0.6], [a + w / 2 + 1, n, z0 + 1.3], [a + w / 2 + 1, n, z0 + 2.3], [a - w / 2 - 1, n, z0 + 1.7]], k.vgrad(a, n, z0 + 0.6, z0 + 2.3, [[0, C.lavaHot], [1, C.lava]]), 0);
  // the reveal's inner shadow
  k.poly(arch(a, w, z0, z1, n, 12), k.vgrad(a, n, z1 - 6, z1, [[0, '#00000000'], [1, '#14040670']]), 0);
  pen.restore();
  // the bars
  const bw = Math.max(1.2, 0.3 * s);
  const bars: P3[][] = [];
  for (let i = 1; i < 4; i++) bars.push([[a - w / 2 + (w * i) / 4, -0.3, z0], [a - w / 2 + (w * i) / 4, -0.3, z1]]);
  const zb = z0 + (z1 - z0) * 0.55;
  bars.push([[a - w / 2, -0.3, zb], [a + w / 2, -0.3, zb]]);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  for (const b of bars) k.line(b, INK, bw + k.thin * 1.4);
  for (const b of bars) k.line(b, tone(C.ironLight), bw);
  pen.restore();
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  // the skull keystone, the sill and a candle on it
  skull(k, a, 0.5, z1 - 0.9, 1.1, { base: tone('#d8c49c') });
  k.box(a - w / 2 - 1.1, 0, z0 - 1.1, w + 2.2, 1.3, 0.8, tone('#5e2a26'), { line: k.lw });
  if (hash(f.k, 31) < 0.7) {
    const cu = a + (hash(f.k, 32) < 0.5 ? -1 : 1) * (w / 2 - 0.8);
    candle(k, cu, 0.7, z0 - 0.3, 1.2 + hash(f.k, 33) * 0.8, 0.3);
    if (hash(f.k, 34) < 0.5) candle(k, cu + (cu < a ? 0.8 : -0.8), 0.75, z0 - 0.3, 0.7, 0.26);
  }
  // fire's light spilling in under it
  k.pool(a, 3, 7, 4, '#ff7a3a', 0.1);
}

// A crimson banner from an iron rod, a gold flame on it, swallowtailed.
function banner(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const a = f.a;
  const w = f.w - 1;
  const zt = v.H - FRIEZE - 4.5;
  const len = Math.min(26, zt - 12);
  const n = 0.4;
  const cloth = lit ? C.velvet : shade(C.velvet, -0.14);
  const bot = zt - len;
  k.shadow(a + 0.4, 0.1, w * 0.5, 0.4, 0.12, bot + 2);
  const pts: P3[] = [[a - w / 2, n, zt], [a + w / 2, n, zt], [a + w / 2, n, bot], [a + w / 4, n, bot + 1.6], [a, n, bot + 3], [a - w / 4, n, bot + 1.6], [a - w / 2, n, bot]];
  k.poly(pts, k.hgrad([a - w / 2, n, zt], [a + w / 2, n, zt], [[0, shade(cloth, 0.12)], [0.5, cloth], [1, shade(cloth, -0.2)]]), k.lw);
  // gold border and folds
  const g = 0.55;
  k.line([[a - w / 2 + g, n, zt - 0.6], [a - w / 2 + g, n, bot + 0.9], [a, n, bot + 3 - 0.5], [a + w / 2 - g, n, bot + 0.9], [a + w / 2 - g, n, zt - 0.6]], C.gold, Math.max(0.8, 0.18 * k.s));
  for (const du of [-w / 6, w / 6]) k.line([[a + du, n, zt - 1], [a + du, n, bot + 2.4]], withAlpha(shade(cloth, -0.35), 0.6), Math.max(0.7, 0.12 * k.s));
  // the emblem: a gold flame in a ring
  const ez = zt - len * 0.38;
  const pen = k.pen;
  const [cx, cy] = k.p(a, n, ez);
  const R = (w / 2 - 0.9) * k.s;
  pen.beginPath();
  pen.arc(cx, cy, R, 0, Math.PI * 2);
  pen.strokeStyle = C.gold;
  pen.lineWidth = Math.max(1, 0.24 * k.s);
  pen.stroke();
  flame(k, a, n + 0.05, ez - (w / 2 - 1.4), (w / 2 - 1.6) * 0.75, (w / 2 - 1.2) * 1.5, 0, [C.gold, C.goldLight, '#fff6d0']);
  // the rod and its finials
  k.rod([[a - w / 2 - 0.8, n + 0.2, zt + 0.2], [a + w / 2 + 0.8, n + 0.2, zt + 0.2]], C.iron, 0.25);
  for (const d of [-1, 1]) k.dot(a + d * (w / 2 + 0.9), n + 0.2, zt + 0.2, 0.32 * k.s, 0.32 * k.s, C.gold, k.thin);
}

// An ossuary niche: an arched recess with skulls on two shelves and black
// candles burning between them.
function niche(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const a = f.a;
  const w = f.w - 1;
  const z0 = PLINTH + 9;
  const z1 = Math.min(z0 + 16, v.H - FRIEZE - 3);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  k.poly(arch(a, w + 1.6, z0 - 0.8, z1 + 1, 0.05, 10), tone('#5e2a26'), k.lw);
  const open = arch(a, w, z0, z1, 0.08, 10);
  k.poly(open, k.vgrad(a, 0.08, z0, z1, [[0, '#2a0e10'], [1, '#160608']]), 0);
  k.halo(a, -0.5, z0 + 4, 6, '#ff9a4a', 0.35);
  const shelf = z0 + 7;
  for (const [zs, row] of [[z0, 0], [shelf, 1]] as const) {
    if (row) k.box(a - w / 2, -1.5, zs - 0.5, w, 1.6, 0.5, tone('#4a2020'), { line: k.thin, stripe: false });
    const n = 3;
    for (let i = 0; i < n; i++) {
      const u = a - w / 2 + (w * (i + 0.5)) / n;
      skull(k, u, -0.4, zs, 0.95 + hash(f.k, i, row) * 0.12, { base: tone(C.bone, 0.12) });
    }
    for (const d of [-1, 1]) candle(k, a + d * (w / 6), -0.2, zs, 1.1 + hash(f.k, d, row + 5) * 0.8, 0.24);
  }
  k.pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  k.box(a - w / 2 - 0.8, 0, z0 - 1.2, w + 1.6, 1.2, 0.7, tone('#5e2a26'), { line: k.lw });
}

// A gibbet cage hung from an iron arm, a skeleton slumped inside.
function cage(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  const zArm = Math.min(38, v.H - FRIEZE - 2);
  const out = 3.4;
  const cz1 = zArm - 7.5;
  const cz0 = cz1 - 8.5;
  const r = 1.9;
  // the arm and its brace
  k.rod([[a, 0, zArm], [a, out, zArm], [a, out, zArm - 0.6]], C.iron, 0.3);
  k.rod([[a, 0, zArm - 4], [a, out * 0.7, zArm]], C.iron, 0.22);
  k.box(a - 0.6, -0.1, zArm - 4.6, 1.2, 0.4, 5.2, C.iron, { line: k.thin, stripe: false });
  chain(k, [[a, out, zArm - 0.6], [a, out, cz1 + 1.6]], 0.5);
  // its shadow on the wall
  k.shadow(a + 0.6, 0.1, r * 1.1, 0.5, 0.16, cz0 + 1);
  const bars = (front: boolean) => {
    for (let i = 0; i < 10; i++) {
      const t = (i / 10) * Math.PI * 2;
      const du = Math.cos(t) * r;
      const dv = Math.sin(t) * r;
      // front bars face the viewer (+u, +v side)
      const isFront = du + dv > 0;
      if (isFront !== front) continue;
      k.line([[a + du, out + dv, cz0], [a + du, out + dv, cz1 - 0.3], [a + du * 0.4, out + dv * 0.4, cz1 + 1.2]], INK, Math.max(1.4, 0.2 * k.s + k.thin));
      k.line([[a + du, out + dv, cz0], [a + du, out + dv, cz1 - 0.3], [a + du * 0.4, out + dv * 0.4, cz1 + 1.2]], C.ironLight, Math.max(0.7, 0.18 * k.s));
    }
  };
  k.disc(a, out, cz0, r, C.iron, k.thin);
  bars(false);
  // the skeleton: ribs, arm bones, a skull lolling
  for (let i = 0; i < 3; i++) k.line([[a - 0.7, out, cz0 + 1.6 + i * 0.7], [a + 0.7, out, cz0 + 1.6 + i * 0.7]], C.bone, Math.max(1, 0.24 * k.s));
  k.line([[a, out, cz0 + 0.6], [a, out, cz0 + 3.8]], C.boneShade, Math.max(1, 0.26 * k.s));
  k.line([[a - 0.9, out + 0.2, cz0 + 3.6], [a - 1.3, out + 0.6, cz0 + 1.2]], C.bone, Math.max(1, 0.22 * k.s));
  skull(k, a + 0.25, out + 0.3, cz0 + 3.9, 0.95, { tilt: 0.35 });
  bars(true);
  for (const z of [cz0 + 0.1, cz1 - 0.3]) {
    const e = k.ell(a, out, z, r);
    const p = k.pen;
    p.beginPath();
    p.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
    p.strokeStyle = INK;
    p.lineWidth = Math.max(1.6, 0.26 * k.s + k.thin);
    p.stroke();
    p.strokeStyle = C.ironLight;
    p.lineWidth = Math.max(0.8, 0.24 * k.s);
    p.stroke();
  }
}

// Two iron rings in the wall, chains down to open manacles.
function shackles(k: Kit, f: Feature): void {
  const a = f.a;
  const z = PLINTH + 13;
  for (const d of [-1.4, 1.4]) {
    const u = a + d;
    k.dot(u, 0.1, z, 0.4 * k.s, 0.4 * k.s, C.iron, k.thin);
    const end: P3 = [u + d * 0.3, 0.6, z - 4.2 - (d > 0 ? 0.8 : 0)];
    chain(k, [[u, 0.2, z - 0.3], end], 0.5);
    const [x, y] = k.p(...end);
    const R = 0.55 * k.s;
    const p = k.pen;
    p.beginPath();
    p.ellipse(x, y + R * 0.8, R, R * 0.7, 0, 0, Math.PI * 2);
    p.strokeStyle = INK;
    p.lineWidth = Math.max(1.6, 0.28 * k.s + k.thin);
    p.stroke();
    p.strokeStyle = C.ironLight;
    p.lineWidth = Math.max(0.8, 0.26 * k.s);
    p.stroke();
  }
}

// An iron torch bracket with a burning cup, its light on the wall.
function torch(k: Kit, f: Feature): void {
  const a = f.a;
  const z = TORCH_Z;
  k.halo(a, 0.2, z + 2, 9, '#ff8a3a', 0.24);
  k.poly([[a - 0.45, 0.02, z - 3], [a + 0.45, 0.02, z - 3], [a + 0.45, 0.02, z - 0.6], [a - 0.45, 0.02, z - 0.6]], C.iron, k.thin, 0.2);
  k.rod([[a, 0.1, z - 2.2], [a, 1.0, z - 1.4], [a, 1.2, z - 0.3]], C.iron, 0.2);
  k.pen.beginPath();
  const e0 = k.ell(a, 1.2, z - 0.4, 0.45);
  const e1 = k.ell(a, 1.2, z + 0.6, 0.85);
  k.fill([[e0.cx - e0.rx, e0.cy], [e0.cx + e0.rx, e0.cy], [e1.cx + e1.rx, e1.cy], [e1.cx - e1.rx, e1.cy]], C.iron, k.thin);
  k.disc(a, 1.2, z + 0.6, 0.85, C.lava, k.thin);
  flame(k, a, 1.2, z + 0.6, 0.62, 2.2, 0);
  k.halo(a, 1.2, z + 1.4, 2.6, '#ffc060', 0.45);
}

// The Maw: a horned demon's skull carved huge in the wall, eyes burning,
// lava spilling over its lower teeth into a stone basin on the floor.
const MOUTH = { z0: 13.5, z1: 19.5, w: 7.5 };

// The Maw drawn smaller than life where the wall is short: its frame
// scaled about its foot, the ink kept.
function mawKit(k: Kit, f: Feature): Kit {
  const m = f.w / MAW;
  return m >= 0.999 ? k : new Kit(k.pen, (u, n, z) => k.at(f.a + (u - f.a) * m, n * m, z * m), k.s * m, k.lw);
}

function mawArt(k0: Kit, v: RoomView, f: Feature): void {
  const k = mawKit(k0, f);
  const { pen, s } = k;
  const a = f.a;
  const lit = k.lit(0, 1);
  const bone = (c: Color) => (lit ? c : shade(c, -0.12));
  const R = 1.2; // the relief's depth
  // the glow round it on the wall
  k.halo(a, 0.2, 18, 18, '#ff5a1a', 0.22);
  // relief: a shape drawn twice, its side then its face
  const relief = (pts: P3[], face: Color | Gradient, side: Color, line = k.lw) => {
    k.poly(pts.map(([u, , z]) => [u, 0.05, z] as P3), side, line);
    k.poly(pts.map(([u, , z]) => [u, R * 0.5, z] as P3), side, 0);
    k.poly(pts.map(([u, , z]) => [u, R, z] as P3), face, line);
  };
  // horns sweeping up and out from the temples
  for (const d of [-1, 1]) {
    const pts: P3[] = [];
    const steps = 9;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = a + d * (5.2 + t * 5.5 + Math.sin(t * Math.PI) * 1.2);
      const z = 30 + t * 10 - Math.sin(t * Math.PI) * 1.5 + t * t * 3;
      const wd = 2.1 * (1 - t) + 0.15;
      pts.push([x - d * wd * 0.3, 0, z + wd]);
    }
    const back: P3[] = [];
    for (let i = steps; i >= 0; i--) {
      const t = i / steps;
      const x = a + d * (5.2 + t * 5.5 + Math.sin(t * Math.PI) * 1.2);
      const z = 30 + t * 10 - Math.sin(t * Math.PI) * 1.5 + t * t * 3;
      const wd = 2.1 * (1 - t) + 0.15;
      back.push([x + d * wd * 0.3, 0, z - wd]);
    }
    relief([...pts, ...back], k.hgrad([a - 11, R, 30], [a + 11, R, 30], [[0, bone('#e8d6b0')], [1, bone('#b89a6a')]]), bone('#7a5a3a'));
    // ridges round the horn
    for (let i = 1; i < 5; i++) {
      const t = i / 6;
      const x = a + d * (5.2 + t * 5.5 + Math.sin(t * Math.PI) * 1.2);
      const z = 30 + t * 10 - Math.sin(t * Math.PI) * 1.5 + t * t * 3;
      const wd = 2.1 * (1 - t) + 0.15;
      k.line([[x - d * wd * 0.3, R + 0.02, z + wd * 0.9], [x + d * wd * 0.3, R + 0.02, z - wd * 0.9]], withAlpha('#7a5a3a', 0.8), Math.max(0.7, 0.14 * s));
    }
  }
  // the skull: a broad cranium narrowing to the jaw
  // (the dome from +u over to -u, then down the -u cheek, along the jaw
  // and up the +u cheek)
  const outline: P3[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = Math.PI * (i / 16);
    outline.push([a + Math.cos(t) * 7.2, 0, 27 + Math.sin(t) * 9]);
  }
  outline.push([a - 7.0, 0, 21], [a - 5.6, 0, 17], [a - 4.6, 0, 12], [a + 4.6, 0, 12], [a + 5.6, 0, 17], [a + 7.0, 0, 21]);
  relief(outline, k.lgrad([a - 6, R, 34], [a + 6, R, 16], [0, 1, 0], [[0, bone('#efe0bc')], [0.55, bone('#d8c49a')], [1, bone('#a88c62')]]), bone('#7a5a3a'));
  // brow ridges, angry
  for (const d of [-1, 1]) k.poly([[a + d * 0.6, R + 0.05, 28.2], [a + d * 5.8, R + 0.05, 30.4], [a + d * 6.0, R + 0.05, 29.2], [a + d * 1.0, R + 0.05, 27.0]], bone('#a88c62'), k.thin);
  // the sockets, burning
  for (const d of [-1, 1]) {
    const eye: P3[] = [[a + d * 1.1, R + 0.06, 27.0], [a + d * 5.4, R + 0.06, 29.0], [a + d * 5.0, R + 0.06, 25.0], [a + d * 2.6, R + 0.06, 24.2]];
    k.poly(eye, '#1a0608', k.thin, 0.4);
    k.halo(a + d * 3.4, R + 0.3, 26.4, 3.2, '#ffb030', 0.6);
    k.poly([[a + d * 2.2, R + 0.08, 26.2], [a + d * 4.4, R + 0.08, 27.4], [a + d * 4.2, R + 0.08, 25.4], [a + d * 2.8, R + 0.08, 25.0]], '#ffd24a', 0, 0.3);
    k.line([[a + d * 3.3, R + 0.1, 27.0], [a + d * 3.3, R + 0.1, 25.2]], '#2a0a0a', Math.max(0.8, 0.3 * s));
  }
  // the nose: two slits
  for (const d of [-1, 1]) k.poly([[a + d * 0.25, R + 0.06, 23.4], [a + d * 1.2, R + 0.06, 22.0], [a + d * 0.35, R + 0.06, 21.3]], '#1a0608', 0);
  // cheekbone cracks
  k.line([[a + 4.6, R + 0.06, 22], [a + 5.4, R + 0.06, 20.4], [a + 5.0, R + 0.06, 19.2]], '#7a5a3a', Math.max(0.7, 0.12 * s));
  // the mouth: dark, glowing inside, fangs above and below
  const { z0, z1, w } = MOUTH;
  const mouth: P3[] = [[a - w / 2, R + 0.06, z1], [a + w / 2, R + 0.06, z1], [a + w / 2 - 0.6, R + 0.06, z0 + 0.6], [a + w / 2 - 1.6, R + 0.06, z0], [a - w / 2 + 1.6, R + 0.06, z0], [a - w / 2 + 0.6, R + 0.06, z0 + 0.6]];
  k.poly(mouth, k.vgrad(a, R, z0, z1, [[0, '#ff8a2a'], [0.35, '#a0280e'], [1, '#2a0606']]), k.lw, 0.4);
  pen.beginPath();
  for (let i = 0; i < 5; i++) {
    const u = a - w / 2 + 1.0 + i * ((w - 2) / 4);
    const big = i === 0 || i === 4 ? 1.7 : 0.9;
    k.trace([[u - 0.55, R + 0.08, z1 + 0.05], [u + 0.55, R + 0.08, z1 + 0.05], [u, R + 0.08, z1 - big]]);
  }
  for (let i = 0; i < 4; i++) {
    const u = a - w / 2 + 1.8 + i * ((w - 3.6) / 3);
    const big = i === 0 || i === 3 ? 1.4 : 0.7;
    k.trace([[u - 0.5, R + 0.08, z0 + 0.4], [u + 0.5, R + 0.08, z0 + 0.4], [u, R + 0.08, z0 + 0.4 + big]]);
  }
  k.paint(bone('#f2e6c8'), k.thin);
  // the lava: over the lower teeth and down into the basin
  const lip = z0 + 0.6;
  const fall: P3[] = [[a - 1.7, R + 0.1, lip], [a + 1.7, R + 0.1, lip], [a + 1.9, R + 1.0, lip - 3], [a + 2.0, R + 1.8, 1.6], [a - 2.0, R + 1.8, 1.6], [a - 1.9, R + 1.0, lip - 3]];
  k.halo(a, R + 2, 7, 8, '#ff6a1a', 0.4);
  k.poly(fall, k.hgrad([a - 2, R + 1, 6], [a + 2, R + 1, 6], [[0, C.lava], [0.35, C.lavaHot], [0.6, '#ffe07a'], [1, C.lavaDeep]]), k.lw);
  if (s >= 2.5) {
    for (const du of [-1.0, -0.2, 0.7]) k.line([[a + du, R + 0.3, lip - 0.4], [a + du * 1.1, R + 1.05, lip - 3.4], [a + du * 1.15, R + 1.75, 2.4]], '#fff3c080', Math.max(0.7, 0.16 * s));
  }
  // the basin: an obsidian trough brimming with lava
  const b0 = a - 8;
  const b1 = a + 8;
  k.shadow(a, 3.5, 9.5, 4.5, 0.25);
  k.box(b0, 0, 0, b1 - b0, 5.6, 1.8, C.obsidian, { round: 0.5 });
  k.poly([[b0 + 0.7, 0.6, 1.81], [b1 - 0.7, 0.6, 1.81], [b1 - 0.7, 4.9, 1.81], [b0 + 0.7, 4.9, 1.81]], k.rgrad(a, 2.6, 1.81, 8, [[0, '#ffe07a'], [0.35, C.lavaHot], [0.8, C.lava], [1, C.lavaDeep]]), k.thin, 0.4);
  // crust plates drifting on it
  for (let i = 0; i < 5; i++) {
    const u = b0 + 1.6 + hash(f.k, i, 41) * (b1 - b0 - 3.2);
    const w2 = 0.9 + hash(f.k, i, 42) * 1.1;
    if (Math.abs(u - a) < 2.4) continue;
    k.poly([[u - w2, 1.4 + hash(f.k, i, 43) * 2, 1.83], [u, 1.0 + hash(f.k, i, 44) * 2, 1.83], [u + w2, 1.6 + hash(f.k, i, 45) * 2, 1.83], [u + w2 * 0.3, 2.4 + hash(f.k, i, 46) * 2, 1.83]], C.crustLight, 0, 0.2);
  }
  // the splash where it lands
  for (const [du, dv, r] of [[-1.6, 2.6, 0.7], [1.4, 2.4, 0.6], [0, 3.2, 0.9]] as const) k.dot(a + du, dv, 2.0, r * s, r * s * 0.55, '#ffe9a0');
  k.halo(a, 2.6, 2.5, 6, '#ffb040', 0.5);
  k.line([[b0 + 0.6, 5.62, 1.6], [b1 - 0.6, 5.62, 1.6]], '#6a5a7a', Math.max(0.8, 0.14 * s));
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen, s } = k;
  const { W, D, H, T } = v;
  // the slab's cut edges: dark rock, veined with lava, dripping it
  const slabFace = (p: P3, q: P3, nu: number, nv: number, salt: number) => {
    const base = k.side('#3e1a1c', nu, nv);
    k.poly([[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], -SLAB], [p[0], p[1], -SLAB]], k.vgrad(p[0], p[1], -SLAB, 0, [[0, shade(base, -0.2)], [1, base]]), k.lw);
    const len = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const at = (t: number, z: number): P3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, z];
    // veins
    const veins: P3[][] = [];
    for (let i = 0; i < len / 14; i++) {
      const t0 = hash(i, salt, 111);
      const pts: P3[] = [];
      let t = t0;
      let z = -0.5 - hash(i, salt, 112) * 1.4;
      for (let j = 0; j < 7; j++) {
        pts.push(at(Math.min(1, t), z));
        t += (1.2 + hash(i, j, 113) * 1.6) / len;
        z = Math.max(-SLAB + 0.5, Math.min(-0.5, z + (hash(i, j, 114) - 0.5) * 1.2));
      }
      if (seen(k, pts, 2)) veins.push(pts);
    }
    pen.save();
    pen.globalCompositeOperation = 'screen';
    for (const pts of veins) k.line(pts, '#ff5a1a30', Math.max(3, 1.4 * s));
    pen.restore();
    for (const pts of veins) k.line(pts, '#1a0608', Math.max(1.4, 0.4 * s));
    for (const pts of veins) k.line(pts, C.lava, Math.max(0.7, 0.18 * s));
    // drips off the bottom edge
    for (let i = 0; i < len / 9; i++) {
      const t = hash(i, salt, 115);
      const [x, y] = k.p(...at(t, -SLAB));
      if (x < -10 || y < -10 || x > pen.width + 10 || y > pen.height + 10) continue;
      const l = (0.4 + hash(i, salt, 116) * 0.9) * s;
      const r = Math.max(0.8, 0.28 * s);
      pen.beginPath();
      pen.moveTo(x - r, y - 0.5);
      pen.quadraticCurveTo(x - r * 0.6, y + l * 0.6, x, y + l);
      pen.quadraticCurveTo(x + r * 0.6, y + l * 0.6, x + r, y - 0.5);
      pen.closePath();
      pen.fillStyle = C.lava;
      pen.fill();
      k.halo(...at(t, -SLAB - 0.3), 1.2, '#ff6a2a', 0.35);
    }
  };
  if (seen(k, [[T, D, 0], [W, D, -SLAB - 2]], 2)) slabFace([T, D, 0], [W, D, 0], 0, 1, 1);
  if (seen(k, [[W, T, 0], [W, D, -SLAB - 2]], 2)) slabFace([W, T, 0], [W, D, 0], 1, 0, 2);
  k.line([[T, D, -0.35], [W, D, -0.35], [W, T, -0.35]], '#7a4a4a', Math.max(1, 0.22 * s));
  // the walls' cut ends: blocks of the same rock
  const cap = '#4a2228';
  for (const [p, q, nu, nv] of [[[0, D], [T, D], 0, 1], [[W, 0], [W, T], 1, 0]] as const) {
    if (!seen(k, [[p[0], p[1], -SLAB], [q[0], q[1], H]])) continue;
    k.poly([[p[0], p[1], -SLAB], [q[0], q[1], -SLAB], [q[0], q[1], H], [p[0], p[1], H]], k.vgrad(p[0], p[1], -SLAB, H, [[0, k.side('#7a3026', nu, nv)], [1, k.side('#3e1618', nu, nv)]]), k.lw);
    pen.beginPath();
    for (let z = PLINTH; z < H - 0.5; z += COURSE) {
      const [x0, y0] = k.p(p[0], p[1], z);
      const [x1, y1] = k.p(q[0], q[1], z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#24080c90';
    pen.lineWidth = Math.max(0.6, 0.14 * s);
    pen.stroke();
    k.poly([[p[0], p[1], 0], [q[0], q[1], 0], [q[0], q[1], PLINTH], [p[0], p[1], PLINTH]], k.side(C.obsidian, nu, nv, 0.1), k.thin);
  }
  // the tops
  if (seen(k, [[0, 0, H], [W, D, H]])) {
    k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
    k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.3), Math.max(1, 0.2 * s));
    k.line([[T - 0.3, D, H], [T - 0.3, T - 0.3, H], [W, T - 0.3, H]], '#2a0e14', Math.max(0.8, 0.14 * s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

// The Maw's eyes and throat breathing (high on the wall, above anyone's head).
function mawFlicker(k0: Kit, v: RoomView, f: Feature): void {
  const k = mawKit(k0, f);
  const t = v.t;
  const n = 0.5 + 0.5 * (0.6 * Math.sin(t * 5.3) + 0.4 * Math.sin(t * 11.7 + 0.8));
  for (const d of [-1, 1]) k.halo(f.a + d * 3.4, 1.6, 26.4, 2.4 + n * 0.8, '#ffc040', 0.18 + 0.22 * n);
}

// A torch's flame licking up (its cup is above anyone's head).
function torchFlicker(k: Kit, v: RoomView, f: Feature): void {
  const t = v.t + f.k * 0.37;
  const sway = Math.sin(t * 6.1) * 0.25 + Math.sin(t * 13.3) * 0.12;
  const h = 2.2 + 0.4 * Math.sin(t * 8.7 + 1.1);
  flame(k, f.a, 1.25, TORCH_Z + 0.65, 0.5, h, sway);
}

