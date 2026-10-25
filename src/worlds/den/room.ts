import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import type { Quad } from './bits.ts';
import { cable, code, droop, rain, sticker, STICKERS } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, on, withAlpha } from './kit.ts';

// The den's shell: a basement at night. Painted cinder block over a dark
// band with a green line round it, a cable tray and a duct along the tops
// of the walls with a strip of green LEDs under them, high little windows
// onto the moonlit grass. Between the stations hang a video wall of green
// rain, monitors on arms, a whiteboard of diagrams, a cork board strung
// with red thread, a pegboard of tools, shelves of toys, neon signs,
// posters and long banners. Carpet tiles on the floor, cables snaking to
// the free-standing stations, rugs and pools of screen light. Every piece
// sits in the free stretches of wall between the stations, worked out
// from the same plan the stage uses.

type Wall = 'left' | 'right';
type Kind = 'rainwall' | 'screens' | 'whiteboard' | 'cork' | 'pegboard' | 'shelf' | 'neon' | 'posters' | 'panel' | 'guitar' | 'dartboard' | 'clock' | 'sign' | 'window' | 'banner' | 'vent' | 'traces' | 'pipe';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number; z0: number; z1: number };
export type Plan = { L: Layout; features: Feature[] };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const BASE = 0.9; // the rubber skirting
const LOW = 7; // the dark band's top (the green line sits on it)
const COURSE = 1.7; // cinder block courses
const BLOCK = 3.4;
const TILE = 4; // carpet tiles
const HIGH = 48; // walls this tall have an upper row of pieces

// The bands at the top of a wall H tall.
const tops = (H: number) => ({ duct: H - 3.3, tray: H - 5.1, win0: H - 12.4, win1: H - 7.2 });

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and what hangs on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'den');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L) };
  PLANS.set(key, plan);
  return plan;
}

type Span = { wall: Wall; a0: number; a1: number };

function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  const spans: Span[] = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= 5) spans.push({ wall, a0, a1 });
    }
  }
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  const high = L.H >= HIGH;
  const { win0, win1 } = tops(L.H);
  // The video wall of green rain: up high on tall walls, else at eye
  // level, in the longest stretch.
  const longest = [...spans].sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0));
  const rw = longest.find((s) => s.a1 - s.a0 >= (high ? 29 : 14));
  const low: Span[] = [...spans];
  if (rw) {
    const RW = high ? 27 : Math.min(19, rw.a1 - rw.a0 - 2);
    const mid = (rw.a0 + rw.a1) / 2;
    const z0 = high ? 24 : 8.5;
    const z1 = high ? Math.min(L.H - 14.5, z0 + 24) : 19.5;
    out.push({ wall: rw.wall, kind: 'rainwall', a: mid, w: RW, k: 1, z0, z1 });
    if (!high) low.splice(low.indexOf(rw), 1, { wall: rw.wall, a0: rw.a0, a1: mid - RW / 2 - 3 }, { wall: rw.wall, a0: mid + RW / 2 + 3, a1: rw.a1 });
  }
  // Eye level: one of each board, screens, signs, a cluster of posters or
  // two, the odd thing hung up; pipes in the gaps left.
  const ORDER: Kind[] = ['screens', 'posters', 'whiteboard', 'neon', 'guitar', 'cork', 'sign', 'pegboard', 'dartboard', 'posters', 'shelf', 'neon', 'clock', 'panel', 'screens', 'sign', 'shelf', 'posters'];
  const cap: Partial<Record<Kind, number>> = { screens: 2, whiteboard: 1, cork: 1, pegboard: 1, shelf: 2, neon: 2, panel: 1, guitar: 1, dartboard: 1, clock: 1, sign: 2, posters: 3 };
  const count: Partial<Record<Kind, number>> = {};
  let n = 0;
  for (const s of low) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? 5 : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < (cap[c] ?? Infinity) && room(c)) k = c;
      }
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? 5 : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    kinds.forEach((k, i) => {
      const w = WIDTH[k];
      const [z0, z1] = ZS[k];
      out.push({ wall: s.wall, kind: k, a: at + w / 2, w, k: n * 7 + i, z0, z1 });
      // a pipe down the wall in a wide enough gap after it
      if (gap >= 7 && i < kinds.length - 1 && (n + i) % 3 === 0) out.push({ wall: s.wall, kind: 'pipe', a: at + w + gap / 2, w: 1, k: n * 7 + i, z0: 0, z1: L.H });
      at += w + gap;
    });
  }
  // Up high on tall walls: long banners, circuit traces painted on the
  // block, a vent, either side of the video wall.
  if (high) {
    const taken = out.filter((f) => f.kind === 'rainwall');
    const pipes = out.filter((f) => f.kind === 'pipe');
    let m = 0;
    for (const s of spans) {
      let a = s.a0 + 5;
      while (a + 5 <= s.a1) {
        const kind: Kind = (['banner', 'traces', 'banner', 'vent', 'traces'] as const)[m % 5];
        const w = kind === 'traces' ? 18 : kind === 'vent' ? 5 : 7;
        const c = a + w / 2;
        if (c + w / 2 > s.a1) break;
        if (taken.some((f) => f.wall === s.wall && Math.abs(f.a - c) < f.w / 2 + w / 2 + 4) || pipes.some((f) => f.wall === s.wall && Math.abs(f.a - c) < w / 2 + 1.5)) {
          a += 4;
          continue;
        }
        const z1 = kind === 'vent' ? 32 : kind === 'traces' ? Math.min(win0 - 3, 44) : win0 - 1;
        const z0 = kind === 'vent' ? 28.5 : kind === 'traces' ? Math.max(23, z1 - 16) : Math.max(24, z1 - 20);
        out.push({ wall: s.wall, kind, a: c, w, k: 50 + m * 13, z0, z1 });
        m++;
        a += w + 6;
      }
    }
  }
  // Little high windows along the top of each stretch.
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const count2 = Math.max(len >= 12 ? 1 : 0, Math.floor((len + 10) / 32));
    for (let i = 0; i < count2; i++) {
      const a = s.a0 + ((i + 0.5) * len) / count2;
      out.push({ wall: s.wall, kind: 'window', a, w: 8, k: 90 + i * 3 + (s.wall === 'left' ? 40 : 0), z0: win0, z1: win1 });
    }
  }
  return out;
}

// Eye-level pieces: their widths and heights.
const WIDTH: Record<Kind, number> = { rainwall: 19, screens: 14, whiteboard: 16, cork: 10, pegboard: 11, shelf: 10, neon: 8, posters: 12, panel: 4, guitar: 4, dartboard: 4, clock: 3, sign: 5, window: 8, banner: 7, vent: 5, traces: 18, pipe: 1 };
const ZS: Record<Kind, readonly [number, number]> = {
  rainwall: [8.5, 19.5],
  screens: [10, 17.5],
  whiteboard: [8, 18.5],
  cork: [10, 18],
  pegboard: [7.6, 17.5],
  shelf: [11, 19],
  neon: [12.5, 19],
  posters: [9.5, 19],
  panel: [9, 15.5],
  guitar: [8.5, 17.5],
  dartboard: [12, 16],
  clock: [15, 18],
  sign: [11.5, 17],
  window: [0, 0],
  banner: [0, 0],
  vent: [0, 0],
  traces: [0, 0],
  pipe: [0, 0],
};

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but the seats round the lounge rather than warm ones;
// warm by the servers' exhaust; a look at the video wall, the whiteboard
// and the neon.
export function denPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L).map((p) => (p.kind === 'warm' ? { ...p, kind: 'seat' as const } : p));
  const rack = L.slots.find((s) => s.kind === 'search');
  if (rack && !rack.island) {
    const along = rack.wall === 'right' ? rack.x0 : rack.y0;
    const face = pt(rack.wall, along + rack.len / 2, 0);
    out.push({ ...pt(rack.wall, along - 3, rack.dep + 3), kind: 'warm', face }, { ...pt(rack.wall, along + rack.len + 3, rack.dep + 3), kind: 'warm', face });
  }
  for (const f of fs.filter((g) => g.kind === 'rainwall' || g.kind === 'whiteboard' || g.kind === 'neon' || g.kind === 'screens').slice(0, 5)) {
    out.push({ ...pt(f.wall, f.a, f.kind === 'rainwall' ? 12 : 7), kind: 'view', face: pt(f.wall, f.a, 0) });
  }
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
  // The video wall's rain: only the bright heads move, over the still
  // dim glyphs painted with the wall (a few small marks a frame).
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const f = plan.features.find((g) => g.kind === 'rainwall');
    if (!f) return;
    const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
    v.pen.save();
    for (const q of wallPanels(f)) heads(k, q.quad, v.t, q.seed, q.cols, q.rows);
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

// Carpet tiles laid quarter-turned (two tones in a checker, a little
// variation within each) and the odd replacement in another dye lot.
const CARPET = ['#3f4a47', '#414c49', '#3c4744', '#3e4946', '#3f4a50', '#46443f'];

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  // Carpet tiles, one path a tone; the seams between them.
  const tiles: Array<Array<[number, number, number, number]>> = CARPET.map(() => []);
  for (let y = T; y < D; y += TILE) {
    for (let x = T; x < W; x += TILE) {
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      const odd = hash(tx, ty, 4);
      const i = odd < 0.012 ? 4 : odd < 0.022 ? 5 : ((tx + ty) & 1) * 2 + (hash(tx, ty, 3) < 0.5 ? 1 : 0);
      tiles[i].push([x, y, Math.min(W, x + TILE), Math.min(D, y + TILE)]);
    }
  }
  tiles.forEach((list, ti) => {
    pen.beginPath();
    for (const [x0, y0, x1, y1] of list) k.trace([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]);
    pen.fillStyle = CARPET[ti];
    pen.fill();
  });
  pen.beginPath();
  for (let y = T + TILE; y < D; y += TILE) {
    const [a, b] = [k.p(T, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (let x = T + TILE; x < W; x += TILE) {
    const [a, b] = [k.p(x, T, 0), k.p(x, D, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#2a333188';
  pen.lineWidth = Math.max(0.7, 0.08 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  if (k.fine) {
    // the pile's grain, turned tile by tile
    pen.beginPath();
    for (let y = T; y < D; y += TILE) {
      for (let x = T; x < W; x += TILE) {
        const along = (Math.floor(x / TILE) + Math.floor(y / TILE)) & 1;
        for (let i = 1; i < 4; i++) {
          const f = i / 4;
          const [a, b] = along ? [k.p(x + 0.3, y + TILE * f, 0), k.p(Math.min(W, x + TILE) - 0.3, y + TILE * f, 0)] : [k.p(x + TILE * f, y + 0.3, 0), k.p(x + TILE * f, Math.min(D, y + TILE) - 0.3, 0)];
          pen.moveTo(a[0], a[1]);
          pen.lineTo(b[0], b[1]);
        }
      }
    }
    pen.strokeStyle = '#5a68631c';
    pen.lineWidth = 0.14 * s;
    pen.stroke();
  }
  // Stains here and there: a coffee ring, a spill.
  for (let i = 0; i < Math.round((W * D) / 1800); i++) {
    const x = T + 6 + hash(i, 71) * (W - T - 12);
    const y = T + 6 + hash(i, 72) * (D - T - 12);
    const r = 0.8 + hash(i, 73) * 1.6;
    if (hash(i, 74) < 0.5) {
      const e = k.ell(x, y, 0.01, r);
      pen.beginPath();
      pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI * 2);
      pen.strokeStyle = '#2c241c40';
      pen.lineWidth = Math.max(0.7, 0.14 * s);
      pen.stroke();
    } else k.disc(x, y, 0.01, r, '#2a2a2030', 0);
  }
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#05100c70');
  g.addColorStop(0.35, '#05100c26');
  g.addColorStop(0.6, '#05100c00');
  g.addColorStop(0.85, '#05100c1a');
  g.addColorStop(1, '#05100c50');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#05100c77'], [0.35, '#05100c2a'], [1, '#05100c00']]), 0);
  }
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  // Cables from the walls to the stations out on the floor.
  for (const q of plan.L.slots.filter((o) => o.island)) floorCables(k, v, q);
  // Rugs where people gather.
  const idle = slot('idle');
  if (idle) shag(new Kit(pen, frame(v.at, idle.wall, idle.x0, idle.y0), s), -2, -1.5, idle.len + 4, idle.dep + 3.5, 11);
  const think = slot('think');
  if (think) roundRug(new Kit(pen, frame(v.at, think.wall, think.x0, think.y0), s), think.len / 2, think.dep * 0.6 + 1, 7.5);
  const write = slot('write');
  if (write) {
    // the chair mat under the battlestation's chair
    const wk = new Kit(pen, frame(v.at, write.wall, write.x0, write.y0), s);
    wk.poly([[0.2, 4.2, 0.03], [6.0, 4.2, 0.03], [6.0, 9.2, 0.03], [0.2, 9.2, 0.03]], '#cfe6e01e', k.thin * 0.6, 0.6);
  }
  // Screen light on the floor before the stations, and the lounge's lamp.
  for (const [kind, u, w, r, c, a] of [
    ['write', 0.5, 1.3, 12, C.green, 0.26],
    ['think', 0.45, 1.3, 15, C.green, 0.32],
    ['search', 0.5, 1.8, 11, C.cyan, 0.2],
    ['web', 0.5, 0.8, 10, C.amber, 0.2],
    ['run', 0.5, 0.7, 12, C.magenta, 0.18],
    ['idle', 0.6, 0.55, 15, C.lamp, 0.24],
    ['read', 0.85, 1.4, 8, C.lamp, 0.14],
    ['entrance', 0.5, 1.4, 9, C.moon, 0.12],
  ] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    qk.pool(q.len * u, q.dep * w, r, r * 0.75, c, a);
  }
  // Under the wall pieces that glow: the video wall, monitors and neon.
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (f.kind === 'rainwall') wk.pool(f.a, 5, f.w * 0.6, 9, C.green, 0.18);
    else if (f.kind === 'screens') wk.pool(f.a, 4, 8, 6, C.green, 0.12);
    else if (f.kind === 'neon') wk.pool(f.a, 3, 6, 4.5, neonColor(f.k), 0.12);
    else if (f.kind === 'window') wk.pool(f.a, 2.5, 5, 3.5, C.moon, 0.07);
  }
}

// Two or three cables from the foot of the nearer wall to an island's
// back, a strip of gaffer tape across them every so often.
function floorCables(k: Kit, v: RoomView, q: Slot): void {
  const r = slotRect(q);
  const { T } = v;
  const toRight = r.y0 - T <= r.x0 - T; // the right wall (y = T) is nearer
  const pen = k.pen;
  const colors = ['#1b2023', '#2b3a6a'];
  const seed = r.x0 * 31 + r.y0;
  const lines: P3[][] = [];
  // across: along the wall; out: from the wall to the prop's back
  const across = toRight ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2;
  const reach = (toRight ? r.y0 : r.x0) + 1.5 - T;
  const steps = Math.max(4, Math.ceil(reach / 2));
  const L1 = 30 + hash(seed, 1) * 25;
  const amp = Math.min(2.2, reach * 0.06);
  for (let i = 0; i < 2; i++) {
    const pts: P3[] = [];
    for (let j = 0; j <= steps; j++) {
      const f = j / steps;
      const out = 0.4 + (reach - 0.4) * f;
      const bend = Math.sin((out / L1) * Math.PI * 2 + hash(seed, 2) * 6) + 0.35 * Math.sin((out / (L1 * 0.37)) * Math.PI * 2 + hash(seed, 3) * 6);
      const side = across + (i - 0.5) * (0.55 + 0.25 * Math.sin(out * 0.21 + i)) + bend * amp * Math.sin(f * Math.PI);
      pts.push(toRight ? [side, T + out, 0.08] : [T + out, side, 0.08]);
    }
    lines.push(pts);
    k.line(pts, '#0a0f0e55', 0.42 * v.s + 1.2);
    k.line(pts, colors[i], 0.26 * v.s);
  }
  // a strip of gaffer tape here and there
  pen.beginPath();
  for (let j = 4; j < steps - 3; j += 9) {
    const [a, b] = [lines[0][j], lines[1][j]];
    const m: P3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.1];
    const [hw, hd] = [0.9, 0.35];
    if (toRight) k.trace([[m[0] - hw, m[1] - hd, 0.1], [m[0] + hw, m[1] - hd, 0.1], [m[0] + hw, m[1] + hd, 0.1], [m[0] - hw, m[1] + hd, 0.1]]);
    else k.trace([[m[0] - hd, m[1] - hw, 0.1], [m[0] + hd, m[1] - hw, 0.1], [m[0] + hd, m[1] + hw, 0.1], [m[0] - hd, m[1] + hw, 0.1]]);
  }
  pen.fillStyle = '#8a9290';
  pen.fill();
}

// A shaggy rug in its own frame, round cornered, a band near its edge.
function shag(k: Kit, u0: number, v0: number, du: number, dv: number, seed: number): void {
  const z = 0.04;
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.14);
  k.poly([[u0, v0, z], [u0 + du, v0, z], [u0 + du, v0 + dv, z], [u0, v0 + dv, z]], '#3b2a4a', k.thin, 1.2);
  k.poly([[u0 + 0.9, v0 + 0.9, z], [u0 + du - 0.9, v0 + 0.9, z], [u0 + du - 0.9, v0 + dv - 0.9, z], [u0 + 0.9, v0 + dv - 0.9, z]], '#4f3a63', 0, 0.9);
  k.poly([[u0 + 1.8, v0 + 1.8, z], [u0 + du - 1.8, v0 + 1.8, z], [u0 + du - 1.8, v0 + dv - 1.8, z], [u0 + 1.8, v0 + dv - 1.8, z]], '#433155', 0, 0.6);
  if (k.fine) {
    // tufts
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 120; i++) {
      const u = u0 + 0.5 + hash(seed, i, 1) * (du - 1);
      const w = v0 + 0.5 + hash(seed, i, 2) * (dv - 1);
      const [x, y] = k.p(u, w, z);
      pen.moveTo(x, y);
      pen.lineTo(x + (hash(seed, i, 3) - 0.5) * 0.3 * k.s, y - 0.25 * k.s);
    }
    pen.strokeStyle = '#6a5284';
    pen.lineWidth = 0.1 * k.s;
    pen.stroke();
  }
}

// A round rug of rings: dark teal and green.
function roundRug(k: Kit, cu: number, cv: number, r: number): void {
  const z = 0.04;
  k.shadow(cu, cv, r * 1.05, r * 1.05, 0.1);
  const rings: Color[] = ['#20403a', '#2f6e5a', '#24463f', '#3a7a62', '#20403a', '#2a5a4c'];
  rings.forEach((c, i) => k.disc(cu, cv, z, r * (1 - i / rings.length), c, i === 0 ? k.thin : 0));
}

// ── walls ──────────────────────────────────────────────────────────────────

const BLOCKS: ReadonlyArray<readonly [number, Color]> = [[0, '#40504b'], [0.35, '#4c5c57'], [0.8, '#455550'], [1, '#3a4844']];

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  const { duct, tray } = tops(H);
  // Painted block: a little lighter in the middle, darker toward the top.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, LOW, H, BLOCKS.map(([t, c]) => [t, tone(c)] as const)), 0);
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.lgrad([T, 0, 0], [T + 10, 0, 0], [0, 0, 1], [[0, '#03080640'], [1, '#03080600']]), 0);
  blocks(k, v, end, lit);
  // the dark band, the green line on it, the rubber skirting
  k.rect(T, 0, end, LOW, 0, tone('#2e3836'));
  k.rect(T, LOW, end, LOW + 0.45, 0.01, tone(C.stripe, 0.12));
  k.line([[T, 0.02, LOW + 0.45], [end, 0.02, LOW + 0.45]], shade(C.stripe, 0.35), Math.max(0.7, 0.08 * s));
  k.rect(T, 0, end, BASE, 0.02, C.rubber);
  k.line([[T, 0.03, BASE], [end, 0.03, BASE]], '#3a4542', Math.max(0.7, 0.1 * s));
  for (const f of plan.features) {
    if (f.wall !== wall) continue;
    if (f.kind === 'window') windowArt(k, v, f, lit);
  }
  // The LED strip's green wash down the wall under the tray.
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.poly([[T, 0.02, tray - 9], [end, 0.02, tray - 9], [end, 0.02, tray], [T, 0.02, tray]], k.vgrad(T, 0.02, tray - 9, tray, [[0, '#39ff6e00'], [0.75, '#39ff6e1c'], [1, '#39ff6e40']]), 0);
  pen.restore();
  for (const f of plan.features) {
    if (f.wall !== wall) continue;
    if (f.kind === 'rainwall') rainWall(k, v, f);
    else if (f.kind === 'screens') screens(k, v, f);
    else if (f.kind === 'whiteboard') whiteboard(k, f);
    else if (f.kind === 'cork') cork(k, f);
    else if (f.kind === 'pegboard') pegboard(k, f);
    else if (f.kind === 'shelf') shelf(k, f);
    else if (f.kind === 'neon') neon(k, v, f);
    else if (f.kind === 'posters') posters(k, f);
    else if (f.kind === 'guitar') guitar(k, f);
    else if (f.kind === 'dartboard') dartboard(k, f);
    else if (f.kind === 'clock') clock(k, f);
    else if (f.kind === 'sign') sign(k, f);
    else if (f.kind === 'traces') traces(k, f);
    else if (f.kind === 'pipe') pipe(k, v, f);
    else if (f.kind === 'panel') panel(k, v, f);
    else if (f.kind === 'banner') banner(k, f);
    else if (f.kind === 'vent') vent(k, f);
  }
  // Cable bundles drop from the tray to the stations against this wall.
  for (const q of plan.L.slots) {
    if (q.island || q.wall !== wall || q.kind === 'entrance' || q.kind === 'read') continue;
    const a0 = wall === 'right' ? q.x0 : q.y0;
    const zb = q.kind === 'search' ? 17 : 10;
    for (let i = 0; i < 3; i++) {
      const a = a0 + q.len * (0.3 + i * 0.2);
      cable(k, droop([a, 0.5, tray], [a + 0.6, 0.6, zb], -0.3, 4), ['#1c2226', '#2b3a6a', '#1c2226'][i], 0.2);
    }
  }
  // The tray: wire mesh with cables in it, the LEDs under it.
  trayArt(k, v, end, tray, lit);
  // The duct along the very top.
  k.box(T, 0, duct, end - T, 2.2, 2.6, C.galv, { line: k.lw, stripe: true });
  pen.beginPath();
  for (let a = T + 9; a < end - 1; a += 9) {
    for (const [p0, p1] of [[[a, 2.21, duct], [a, 2.21, duct + 2.6]], [[a, 0, duct + 2.61], [a, 2.2, duct + 2.61]]] as Array<[P3, P3]>) {
      const [x0, y0] = k.p(...p0);
      const [x1, y1] = k.p(...p1);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = withAlpha(INK, 0.5);
  pen.lineWidth = k.thin * 0.8;
  pen.stroke();
  // hangers
  for (let a = T + 4.5; a < end - 1; a += 18) k.rod([[a, 1.1, duct + 2.6], [a, 1.1, H - 0.1]], C.steelDark, 0.12);
}

// The mortar between the blocks, and a few blocks a shade off.
function blocks(k: Kit, v: RoomView, end: number, lit: boolean): void {
  const { pen, s } = k;
  const { T, H } = v;
  const top = tops(H).tray;
  pen.beginPath();
  let r = 0;
  for (let z = LOW + 0.45 + COURSE; z < top; z += COURSE, r++) {
    const [a, b] = [k.p(T, 0, z), k.p(end, 0, z)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  r = 0;
  for (let z = LOW + 0.45; z < top - 0.2; z += COURSE, r++) {
    for (let a = T + (r & 1 ? BLOCK / 2 : 0) + BLOCK; a < end; a += BLOCK) {
      const [p0, q0] = k.p(a, 0, z);
      const [p1, q1] = k.p(a, 0, Math.min(top, z + COURSE));
      pen.moveTo(p0, q0);
      pen.lineTo(p1, q1);
    }
  }
  pen.strokeStyle = lit ? '#2a35328c' : '#202a278c';
  pen.lineWidth = Math.max(0.6, 0.1 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  if (k.fine) {
    // the lip of each course catching the light
    pen.beginPath();
    for (let z = LOW + 0.45 + COURSE - 0.14; z < top; z += COURSE) {
      const [a, b] = [k.p(T, 0, z), k.p(end, 0, z)];
      pen.moveTo(a[0], a[1]);
      pen.lineTo(b[0], b[1]);
    }
    pen.strokeStyle = lit ? '#6a7b7530' : '#5a6a6428';
    pen.lineWidth = 0.1 * s;
    pen.stroke();
  }
  // blocks a shade off, here and there
  for (const [tint, salt] of [['#22302c22', 1], ['#7a8a8414', 2]] as const) {
    pen.beginPath();
    r = 0;
    for (let z = LOW + 0.45; z < top - COURSE; z += COURSE, r++) {
      for (let a = T + (r & 1 ? BLOCK / 2 : 0); a + BLOCK < end; a += BLOCK) {
        if (hash(Math.floor(a * 10), r, 30 + salt) > 0.1) continue;
        k.trace([[a + 0.05, 0, z + 0.05], [a + BLOCK - 0.05, 0, z + 0.05], [a + BLOCK - 0.05, 0, z + COURSE - 0.05], [a + 0.05, 0, z + COURSE - 0.05]]);
      }
    }
    pen.fillStyle = tint;
    pen.fill();
  }
}

// The cable tray along a wall: a wire basket on brackets, cables lying in
// it and drooping out of it here and there, green LEDs under it.
function trayArt(k: Kit, v: RoomView, end: number, z: number, lit: boolean): void {
  const { T } = v;
  const pen = k.pen;
  // the LED strip and its glow
  k.line([[T, 0.25, z - 0.12], [end, 0.25, z - 0.12]], '#c8ffd8', Math.max(1, 0.18 * k.s));
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.line([[T, 0.25, z - 0.12], [end, 0.25, z - 0.12]], '#39ff6e55', Math.max(2, 0.7 * k.s));
  pen.restore();
  // cables bunched in the basket: humps above its lip
  const humps: P3[] = [];
  for (let a = T + 0.5; a <= end - 0.5; a += 1.2) humps.push([a, 0.8, z + 0.9 + hash(Math.floor(a * 3), 41) * 0.35]);
  k.poly([[T, 0.8, z + 0.5], ...humps, [end, 0.8, z + 0.5]], '#1c2226', k.thin);
  k.line(humps.map(([a, n, zz]) => [a, n + 0.1, zz - 0.15] as P3), '#2b3a6a', Math.max(0.8, 0.14 * k.s));
  k.line(humps.map(([a, n, zz]) => [a, n + 0.2, zz - 0.35] as P3), '#7a2a2a', Math.max(0.8, 0.12 * k.s));
  // the basket's front: wire mesh
  k.poly([[T, 1.6, z], [end, 1.6, z], [end, 1.6, z + 0.9], [T, 1.6, z + 0.9]], withAlpha(lit ? '#9aa5a1' : '#7e8985', 0.35), 0);
  pen.beginPath();
  for (let a = T + 0.6; a < end; a += 0.6) {
    const [x0, y0] = k.p(a, 1.6, z);
    const [x1, y1] = k.p(a, 1.6, z + 0.9);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#a9b3af99';
  pen.lineWidth = Math.max(0.6, 0.06 * k.s);
  pen.stroke();
  k.line([[T, 1.6, z + 0.9], [end, 1.6, z + 0.9]], '#c3ccc8', Math.max(1, 0.14 * k.s));
  k.line([[T, 1.6, z], [end, 1.6, z]], '#8a9692', Math.max(1, 0.12 * k.s));
  // brackets, and a cable drooping out now and then
  for (let a = T + 3; a < end - 1; a += 12) {
    k.poly([[a, 0, z - 0.4], [a, 1.7, z - 0.05], [a, 1.7, z + 0.05], [a, 0, z + 0.05]], C.steelDark, k.thin * 0.8);
    if (hash(Math.floor(a), 42) < 0.45) {
      const sag = 1.5 + hash(Math.floor(a), 43) * 2.5;
      cable(k, droop([a + 1.5, 1.7, z + 0.4], [a + 6 + hash(Math.floor(a), 44) * 3, 1.7, z + 0.4], sag), hash(Math.floor(a), 45) < 0.5 ? '#1c2226' : '#c8a028', 0.13);
    }
  }
}

// A high basement window: a deep concrete reveal, the night outside (a
// strip of grass against the sky, a star or two), bars, a cobweb.
function windowArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { a, w, z0, z1 } = f;
  const u0 = a - w / 2;
  const u1 = a + w / 2;
  // moonlight down the wall under it
  k.wash(a, 0.02, z0 - 4, w * 0.75, 8, C.moon, 0.1);
  k.rect(u0 - 0.6, z0 - 0.6, u1 + 0.6, z1 + 0.5, 0.03, lit ? '#6a7470' : shade('#6a7470', -0.16), k.lw);
  const back = -1.6;
  pen.save();
  pen.beginPath();
  k.trace([[u0, 0.04, z0], [u1, 0.04, z0], [u1, 0.04, z1], [u0, 0.04, z1]]);
  pen.clip();
  k.rect(u0 - 1, z0 - 1, u1 + 1, z1 + 1, back, k.vgrad(a, back, z0, z1, [[0, '#3b4f7a'], [0.6, '#22305a'], [1, '#141c38']]));
  k.halo(a + (hash(f.k, 1) - 0.5) * w * 0.5, back, z1 - 1.2, 2.2, '#dfe8ff', 0.4);
  // grass blades against the sky
  const blades: P3[] = [[u0 - 1, back, z0]];
  for (let u = u0 - 1; u <= u1 + 1; u += 0.32) blades.push([u, back, z0 + 1.1 + hash(Math.floor(u * 10), f.k, 2) * 1.4], [u + 0.16, back, z0 + 0.9]);
  blades.push([u1 + 1, back, z0]);
  k.poly(blades, '#16241e', 0);
  pen.beginPath();
  for (let i = 0; i < 4; i++) {
    const [x, y] = k.p(u0 + 0.6 + hash(f.k, i, 3) * (w - 1.2), back, z0 + 3 + hash(f.k, i, 4) * (z1 - z0 - 3.4));
    pen.moveTo(x + 1, y);
    pen.arc(x, y, Math.max(0.6, 0.08 * s), 0, Math.PI * 2);
  }
  pen.fillStyle = '#e8eeff';
  pen.fill();
  // the reveal's lit underside
  k.poly([[u0, 0.04, z0], [u1, 0.04, z0], [u1, back, z0], [u0, back, z0]], '#7c8682', 0);
  k.poly([[u0, 0.04, z1], [u1, 0.04, z1], [u1, back, z1], [u0, back, z1]], '#2a3230', 0);
  pen.restore();
  // bars
  for (let u = u0 + w / 4; u < u1 - 0.1; u += w / 4) k.rod([[u, -0.3, z0], [u, -0.3, z1]], '#3a4045', 0.14);
  pen.beginPath();
  k.trace([[u0, 0.05, z0], [u1, 0.05, z0], [u1, 0.05, z1], [u0, 0.05, z1]]);
  k.paint(null, k.thin);
  if (k.fine && hash(f.k, 5) < 0.6) {
    // a cobweb in the top corner
    const cu = hash(f.k, 6) < 0.5 ? u0 : u1;
    const dir = cu === u0 ? 1 : -1;
    pen.beginPath();
    for (let i = 0; i < 4; i++) {
      const ang = (i / 3) * (Math.PI / 2);
      const [x0, y0] = k.p(cu, 0.06, z1);
      const [x1, y1] = k.p(cu + dir * Math.cos(ang) * 1.6, 0.06, z1 - Math.sin(ang) * 1.6);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    for (const r of [0.6, 1.1]) {
      for (let i = 0; i <= 3; i++) {
        const ang = (i / 3) * (Math.PI / 2);
        const [x, y] = k.p(cu + dir * Math.cos(ang) * r, 0.06, z1 - Math.sin(ang) * r);
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      }
    }
    pen.strokeStyle = '#d8e0e866';
    pen.lineWidth = 0.05 * s;
    pen.stroke();
  }
}

// The video wall's panels: their quads (on the plane v = 0.55) and rain.
type Panel = { quad: Quad; seed: number; cols: number; rows: number };
function wallPanels(f: Feature): Panel[] {
  const nx = 3;
  const ny = f.z1 - f.z0 > 18 ? 3 : 2;
  const gap = 0.25;
  const pw = (f.w - gap * (nx - 1)) / nx;
  const ph = (f.z1 - f.z0 - gap * (ny - 1)) / ny;
  const out: Panel[] = [];
  const n = 0.62;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const u0 = f.a - f.w / 2 + i * (pw + gap) + 0.35;
      const u1 = u0 + pw - 0.7;
      const z0 = f.z0 + j * (ph + gap) + 0.35;
      const z1 = z0 + ph - 0.7;
      out.push({ quad: [[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]], seed: f.k * 31 + j * 7 + i, cols: Math.max(4, Math.round((u1 - u0) / 0.95)), rows: Math.max(4, Math.round((z1 - z0) / 1.05)) });
    }
  }
  return out;
}

// A wall of flat panels showing one green rain, bezels between them, its
// glow on the wall and cables to the tray.
function rainWall(k: Kit, v: RoomView, f: Feature): void {
  const { a, w, z0, z1 } = f;
  k.wash(a, 0.02, (z0 + z1) / 2, w * 0.85, (z1 - z0) * 0.9, C.green, 0.22);
  k.shadow(a + 0.3, 0.4, w * 0.5, 0.8, 0.2, z0 - 0.4);
  // the mount and the cables up to the tray
  const { tray } = tops(v.H);
  for (const du of [-w / 3, 0, w / 3]) cable(k, droop([a + du, 0.4, z1], [a + du + 1.2, 0.5, tray], -0.2, 4), '#1c2226', 0.18);
  k.box(a - w / 2, 0, z0, w, 0.5, z1 - z0, C.graphite, { line: k.lw, stripe: false });
  for (const p of wallPanels(f)) {
    k.poly(p.quad, k.vgrad(a, 0.6, p.quad[0][2], p.quad[2][2], [[0, '#03140b'], [1, '#062a16']]), 0);
    rain(k, p.quad, 3.7 + p.seed, p.seed, p.cols, p.rows, 0.4);
  }
  // the glass's sheen, top left
  k.poly([[a - w / 2 + 0.6, 0.63, z1 - 0.6], [a - w / 2 + 6, 0.63, z1 - 0.6], [a - w / 2 + 2.5, 0.63, z0 + 0.8], [a - w / 2 + 0.6, 0.63, z0 + 0.8]], '#ffffff0c', 0);
}

// The bright heads of the rain on a panel (the overlay): each column's
// head and a short tail, moving down.
function heads(k: Kit, q: Quad, t: number, seed: number, cols: number, rows: number): void {
  const pen = k.pen;
  const lists: Array<Array<[number, number, number, number]>> = [[], [], []];
  for (let c = 0; c < cols; c++) {
    if (hash(seed, c, 8) < 0.3) continue;
    const sp = 2 + hash(seed, c, 1) * 3.5;
    const span = rows + 6;
    const head = Math.floor((t * sp + hash(seed, c, 3) * span) % span);
    for (let i = 0; i < 3; i++) {
      const r = head - i;
      if (r < 0 || r >= rows) continue;
      const g = hash(seed + c * 131, r, Math.floor(t * 4));
      const gw = 0.42 + g * 0.36;
      lists[i].push([(c + 0.5 - gw / 2) / cols, 1 - (r + 0.86) / rows, (c + 0.5 + gw / 2) / cols, 1 - (r + 0.12) / rows]);
    }
  }
  const tones: Color[] = ['#eaffef', '#90ffb0', '#44e07a'];
  lists.forEach((list, i) => {
    if (!list.length) return;
    pen.beginPath();
    for (const [f0, z0, f1, z1] of list) k.trace([on(q, f0, z0), on(q, f1, z0), on(q, f1, z1), on(q, f0, z1)]);
    pen.fillStyle = tones[i];
    pen.fill();
  });
}

// Three monitors on arms: a rain, a page of code, a radar sweep.
function screens(k: Kit, v: RoomView, f: Feature): void {
  const { a, w, z0 } = f;
  const pw = 3.9;
  const ph = 2.6;
  k.wash(a, 0.02, z0 + 3, w * 0.6, 5, C.green, 0.14);
  const { tray } = tops(v.H);
  for (let i = 0; i < 3; i++) {
    const cu = a - w / 2 + 0.6 + pw / 2 + i * (pw + 0.85);
    const zz = z0 + 1.2 + (i === 1 ? 1 : 0);
    // a cable up to the tray, the arm
    cable(k, droop([cu + 0.8, 0.3, zz + ph], [cu + 1.6, 0.4, tray], -0.3, 4), '#1c2226', 0.14);
    k.box(cu - 0.35, 0, zz + ph / 2 - 0.5, 0.7, 0.2, 1.0, C.steelDark, { line: k.thin, stripe: false });
    k.rod([[cu, 0.2, zz + ph / 2], [cu, 0.9, zz + ph / 2]], C.steelDark, 0.22);
    k.box(cu - pw / 2, 0.9, zz, pw, 0.32, ph, C.graphite, { line: k.lw });
    const n = 1.23;
    const q: Quad = [[cu - pw / 2 + 0.2, n, zz + 0.2], [cu + pw / 2 - 0.2, n, zz + 0.2], [cu + pw / 2 - 0.2, n, zz + ph - 0.2], [cu - pw / 2 + 0.2, n, zz + ph - 0.2]];
    k.poly(q, '#05140c', 0);
    if (i === 0) rain(k, q, 2.3 + f.k, f.k, 6, 5, 0.6);
    else if (i === 1) code(k, q, 1.7 + f.k, f.k, 7);
    else radar(k, q, f.k);
    k.halo(cu, n + 0.4, zz + ph / 2, 3, C.green, 0.1);
  }
}

// A green radar on a screen: rings, a sweep and a couple of blips.
function radar(k: Kit, q: Quad, seed: number): void {
  const c = on(q, 0.5, 0.5);
  const hz = (q[3][2] - q[0][2]) * 0.42;
  const pen = k.pen;
  pen.beginPath();
  for (const r of [0.33, 0.66, 1]) {
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      const [x, y] = k.p(c[0] + Math.cos(th) * hz * r, c[1], c[2] + Math.sin(th) * hz * r);
      if (i) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    }
  }
  pen.strokeStyle = '#1f8f45';
  pen.lineWidth = Math.max(0.6, 0.06 * k.s);
  pen.stroke();
  const a = hash(seed, 3) * Math.PI * 2;
  k.poly([c, [c[0] + Math.cos(a) * hz, c[1], c[2] + Math.sin(a) * hz], [c[0] + Math.cos(a + 0.6) * hz, c[1], c[2] + Math.sin(a + 0.6) * hz]], '#39ff6e66', 0);
  for (let i = 0; i < 3; i++) {
    const b = hash(seed, i, 4) * Math.PI * 2;
    const r = 0.3 + hash(seed, i, 5) * 0.6;
    k.dot(c[0] + Math.cos(b) * hz * r, c[1], c[2] + Math.sin(b) * hz * r, 0.1, '#b8ffcc');
  }
}

// A whiteboard of diagrams: boxes and arrows, a graph, scribbled notes,
// a sticky note, markers in the tray.
function whiteboard(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const { a, w, z0, z1 } = f;
  const u0 = a - w / 2;
  k.shadow(a + 0.3, 0.3, w * 0.5, 0.6, 0.18, z0 - 0.3);
  k.box(u0, 0, z0, w, 0.4, z1 - z0, '#c3ccc8', { line: k.lw, stripe: false });
  const n = 0.42;
  k.rect(u0 + 0.35, z0 + 0.35, a + w / 2 - 0.35, z1 - 0.35, n, k.vgrad(a, n, z0, z1, [[0, '#d6dcda'], [0.5, '#eef2f0'], [1, '#e2e8e6']]), k.thin);
  const ln = Math.max(0.8, 0.12 * s);
  const blue = '#2b5fb8';
  const red = '#c0392f';
  const green = '#1f8a4a';
  const black = '#2a2f33';
  const box = (bu: number, bz: number, bw: number, bh: number, c: Color) => k.line([[bu, n, bz], [bu + bw, n, bz], [bu + bw, n, bz + bh], [bu, n, bz + bh], [bu, n, bz]], c, ln);
  const arrow = (pts: P3[], c: Color) => {
    k.line(pts, c, ln);
    const [p, q] = [pts[pts.length - 2], pts[pts.length - 1]];
    const du = q[0] - p[0];
    const dz = q[2] - p[2];
    const l = Math.hypot(du, dz) || 1;
    const [ux, uz] = [du / l, dz / l];
    k.line([[q[0] - ux * 0.5 - uz * 0.3, n, q[2] - uz * 0.5 + ux * 0.3], q, [q[0] - ux * 0.5 + uz * 0.3, n, q[2] - uz * 0.5 - ux * 0.3]], c, ln);
  };
  const scrib = (bu: number, bz: number, len: number, c: Color) => {
    const pts: P3[] = [];
    for (let u = bu; u <= bu + len; u += 0.2) pts.push([u, n, bz + Math.sin(u * 6.3 + bz * 2) * 0.12]);
    k.line(pts, c, Math.max(0.7, 0.08 * s));
  };
  // a flow: three boxes and arrows, a diamond
  const zt = z1 - 2.6;
  box(u0 + 1.2, zt, 2.4, 1.4, blue);
  box(u0 + 5.2, zt, 2.4, 1.4, blue);
  k.line([[u0 + 10.3, n, zt + 1.6], [u0 + 11.6, n, zt + 0.7], [u0 + 10.3, n, zt - 0.2], [u0 + 9.0, n, zt + 0.7], [u0 + 10.3, n, zt + 1.6]], red, ln);
  arrow([[u0 + 3.6, n, zt + 0.7], [u0 + 5.1, n, zt + 0.7]], black);
  arrow([[u0 + 7.6, n, zt + 0.7], [u0 + 8.9, n, zt + 0.7]], black);
  arrow([[u0 + 10.3, n, zt - 0.2], [u0 + 10.3, n, zt - 1.6], [u0 + 6.6, n, zt - 1.6]], black);
  box(u0 + 4.2, zt - 2.4, 2.4, 1.4, green);
  // a graph: axes and a rising curve
  const gu = u0 + 1.2;
  const gz = z0 + 1.2;
  k.line([[gu, n, gz + 3.4], [gu, n, gz], [gu + 4.2, n, gz]], black, ln);
  const curve: P3[] = [];
  for (let i = 0; i <= 12; i++) curve.push([gu + 0.3 + i * 0.3, n, gz + 0.3 + Math.pow(i / 12, 2.2) * 2.8 + Math.sin(i * 1.9) * 0.15]);
  k.line(curve, red, ln);
  // notes
  for (let r = 0; r < 3; r++) scrib(a + 1.6, z0 + 3.4 - r * 1.0, 2.2 + hash(f.k, r, 5) * 2.5, r === 0 ? blue : black);
  k.line([[a + 1.2, n, z0 + 3.4], [a + 1.2, n, z0 + 3.41]], black, ln * 1.6);
  // a sticky note
  k.poly([[a + w / 2 - 2.6, n + 0.02, z1 - 3.0], [a + w / 2 - 1.0, n + 0.02, z1 - 3.0], [a + w / 2 - 1.0, n + 0.02, z1 - 1.4], [a + w / 2 - 2.6, n + 0.02, z1 - 1.4]], '#ffe066', k.thin * 0.6);
  // the tray and markers
  k.box(u0 + 1, 0.4, z0 - 0.2, w - 2, 0.7, 0.3, '#aab4b0', { line: k.thin, stripe: false });
  for (const [du, c] of [[2, blue], [3.2, red], [4.1, black], [5.0, green]] as const) k.rod([[u0 + du, 0.75, z0 + 0.25], [u0 + du + 0.9, 0.75, z0 + 0.25]], c, 0.2);
  k.box(u0 + w - 4, 0.45, z0 + 0.1, 1.6, 0.5, 0.45, '#2a2f33', { line: k.thin, stripe: false });
}

// A cork board: papers, photos and cards pinned up, red thread pin to pin.
function cork(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const { a, w, z0, z1 } = f;
  const u0 = a - w / 2;
  k.shadow(a + 0.3, 0.3, w * 0.5, 0.6, 0.18, z0 - 0.3);
  k.box(u0, 0, z0, w, 0.35, z1 - z0, '#6b4a33', { line: k.lw, stripe: false });
  const n = 0.37;
  k.rect(u0 + 0.45, z0 + 0.45, a + w / 2 - 0.45, z1 - 0.45, n, C.cork, k.thin);
  if (k.fine) {
    pen.beginPath();
    for (let i = 0; i < 40; i++) {
      const [x, y] = k.p(u0 + 0.6 + hash(f.k, i, 1) * (w - 1.2), n, z0 + 0.6 + hash(f.k, i, 2) * (z1 - z0 - 1.2));
      pen.moveTo(x + 0.5, y);
      pen.arc(x, y, 0.5, 0, Math.PI * 2);
    }
    pen.fillStyle = '#8a603a66';
    pen.fill();
  }
  const pins: P3[] = [];
  const items = 7;
  for (let i = 0; i < items; i++) {
    const cu = u0 + 1.3 + ((i % 4) + hash(f.k, i, 3) * 0.4) * ((w - 2.6) / 3.4);
    const cz = z0 + 1.6 + (i < 4 ? 3.2 : 0.4) + hash(f.k, i, 4) * 1.2;
    const kind = Math.floor(hash(f.k, i, 5) * 3);
    const tilt = (hash(f.k, i, 6) - 0.5) * 0.5;
    const pw = kind === 1 ? 1.5 : 1.8;
    const ph = kind === 1 ? 1.8 : kind === 2 ? 1.1 : 2.2;
    const P = (du: number, dz: number): P3 => [cu + du + dz * tilt * 0.3, n + 0.02, cz + dz - du * tilt * 0.3];
    if (kind === 1) {
      // a photo
      k.poly([P(-pw / 2, -ph / 2), P(pw / 2, -ph / 2), P(pw / 2, ph / 2), P(-pw / 2, ph / 2)], '#f2f0e8', k.thin * 0.6);
      k.poly([P(-pw / 2 + 0.15, -ph / 2 + 0.45), P(pw / 2 - 0.15, -ph / 2 + 0.45), P(pw / 2 - 0.15, ph / 2 - 0.15), P(-pw / 2 + 0.15, ph / 2 - 0.15)], ['#3f6f8a', '#8a5a3a', '#4f7a4a'][i % 3], 0);
    } else {
      k.poly([P(-pw / 2, -ph / 2), P(pw / 2, -ph / 2), P(pw / 2, ph / 2), P(-pw / 2, ph / 2)], kind === 2 ? '#f6e6a0' : C.paper, k.thin * 0.6);
      pen.beginPath();
      for (let r = 0; r < (kind === 2 ? 2 : 4); r++) {
        const zz = ph / 2 - 0.45 - r * 0.4;
        const [x0, y0] = k.p(...P(-pw / 2 + 0.25, zz));
        const [x1, y1] = k.p(...P(-pw / 2 + 0.25 + (pw - 0.5) * (0.5 + hash(f.k, i * 5 + r, 7) * 0.5), zz));
        pen.moveTo(x0, y0);
        pen.lineTo(x1, y1);
      }
      pen.strokeStyle = '#6a6e70';
      pen.lineWidth = Math.max(0.6, 0.06 * s);
      pen.stroke();
    }
    pins.push(P(0, ph / 2 - 0.2));
  }
  // the thread, then the pins over it
  const order = [0, 5, 2, 6, 3, 1, 4];
  k.line(order.map((i) => [pins[i][0], n + 0.05, pins[i][2]] as P3), '#d0302a', Math.max(0.8, 0.09 * s));
  for (const [i, p] of pins.entries()) k.dot(p[0], n + 0.06, p[2], 0.16, ['#d0302a', '#2b5fb8', '#ffd23e', '#39ff6e'][i % 4]);
}

// A pegboard of tools: pliers, screwdrivers, a soldering iron, coils of
// cable, a roll of tape, a multimeter.
function pegboard(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const { a, w, z0, z1 } = f;
  const u0 = a - w / 2;
  k.shadow(a + 0.3, 0.3, w * 0.5, 0.6, 0.18, z0 - 0.3);
  k.box(u0, 0, z0, w, 0.3, z1 - z0, '#a07a52', { line: k.lw, stripe: false });
  const n = 0.31;
  if (k.fine) {
    pen.beginPath();
    for (let z = z0 + 0.6; z < z1 - 0.3; z += 0.7) {
      for (let u = u0 + 0.5; u < a + w / 2 - 0.3; u += 0.7) {
        const [x, y] = k.p(u, n, z);
        pen.moveTo(x + 0.06 * s, y);
        pen.arc(x, y, 0.06 * s, 0, Math.PI * 2);
      }
    }
    pen.fillStyle = '#5a3e26';
    pen.fill();
  }
  const zm = (z0 + z1) / 2;
  // screwdrivers
  for (const [i, c] of (['#c0392f', '#ffd23e', '#2b5fb8', '#39a85a'] as const).entries()) {
    const u = u0 + 1.2 + i * 0.75;
    k.rod([[u, n + 0.2, zm + 3.2], [u, n + 0.2, zm + 1.8]], c, 0.32);
    k.line([[u, n + 0.2, zm + 1.8], [u, n + 0.2, zm - 0.2]], '#c3ccc8', Math.max(0.8, 0.1 * s));
  }
  // pliers
  const pu = u0 + 4.6;
  k.rod([[pu - 0.3, n + 0.2, zm + 3.4], [pu, n + 0.2, zm + 2.2], [pu + 0.35, n + 0.2, zm + 0.6]], '#c0392f', 0.22);
  k.rod([[pu + 0.3, n + 0.2, zm + 3.4], [pu, n + 0.2, zm + 2.2], [pu - 0.35, n + 0.2, zm + 0.6]], '#c0392f', 0.22);
  // a coil of cable and a roll of tape
  for (const [cu, cz, r, c] of [[u0 + 6.6, zm + 2.0, 1.1, '#2b3a6a'], [u0 + 8.8, zm + 2.3, 0.8, '#1c2226']] as const) {
    pen.beginPath();
    for (const rr of [r, r * 0.8, r * 0.62]) {
      for (let i = 0; i <= 18; i++) {
        const th = (i / 18) * Math.PI * 2;
        const [x, y] = k.p(cu + Math.cos(th) * rr, n + 0.25, cz + Math.sin(th) * rr);
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      }
    }
    pen.strokeStyle = INK;
    pen.lineWidth = 0.22 * s + k.thin;
    pen.stroke();
    pen.strokeStyle = c;
    pen.lineWidth = 0.22 * s;
    pen.stroke();
  }
  const tu = u0 + 2.3;
  const tz = z0 + 1.8;
  for (const [r, c] of [[0.9, '#8a9290'], [0.45, '#5a6260']] as const) {
    pen.beginPath();
    for (let i = 0; i <= 18; i++) {
      const th = (i / 18) * Math.PI * 2;
      const [x, y] = k.p(tu + Math.cos(th) * r, n + 0.3, tz + Math.sin(th) * r);
      if (i) pen.lineTo(x, y);
      else pen.moveTo(x, y);
    }
    k.paint(c, k.thin);
  }
  // the multimeter, the soldering iron
  k.box(u0 + 5.2, n, z0 + 0.8, 1.6, 0.5, 2.2, '#e8b030', { line: k.thin });
  k.rect(u0 + 5.45, z0 + 2.0, u0 + 6.55, z0 + 2.75, n + 0.52, '#9fb59a', k.thin * 0.6);
  k.dot(u0 + 6, n + 0.52, z0 + 1.35, 0.3, '#2a2f33');
  k.rod([[u0 + 8.0, n + 0.25, z0 + 0.9], [u0 + 8.6, n + 0.25, z0 + 3.4]], '#c0392f', 0.3);
  k.line([[u0 + 8.6, n + 0.25, z0 + 3.4], [u0 + 8.85, n + 0.25, z0 + 4.4]], '#c3ccc8', Math.max(0.8, 0.12 * s));
  cable(k, droop([u0 + 8.0, n + 0.25, z0 + 0.9], [u0 + 9.8, n + 0.25, z0 + 0.8], 0.8), '#1c2226', 0.1);
}

// Two floating shelves: a console, game boxes, a robot figure, a stack of
// floppies, a cactus, a trailing pothos.
function shelf(k: Kit, f: Feature): void {
  const { a, w, z0, z1 } = f;
  const u0 = a - w / 2;
  for (const [j, z] of [z0, z1 - 4].entries()) {
    k.shadow(a, 0.5, w * 0.5, 0.9, 0.16, z - 0.5);
    for (const du of [1.2, w - 1.2]) k.poly([[u0 + du, 0.05, z], [u0 + du, 1.3, z], [u0 + du, 0.05, z - 1.3]], C.steelDark, k.thin);
    k.box(u0, 0, z, w, 1.6, 0.35, '#3a3230', { line: k.lw });
    const zt = z + 0.35;
    const seed = f.k + j * 17;
    if (j === 0) {
      // a console and its controller, a row of game boxes, a cactus
      k.box(u0 + 0.6, 0.2, zt, 2.6, 1.3, 0.8, '#c9c4b8', { line: k.thin });
      k.rect(u0 + 0.9, zt + 0.25, u0 + 2.0, zt + 0.5, 1.51, '#2a2f33', 0);
      k.dot(u0 + 2.7, 1.51, zt + 0.4, 0.12, '#c0392f');
      bookRowFlat(k, u0 + 3.6, u0 + 7.4, 1.4, zt, 2.6, seed);
      k.cyl(u0 + 8.6, 0.8, zt, 0.55, 0.8, '#c66a42', { line: k.thin });
      k.cyl(u0 + 8.6, 0.8, zt + 0.8, 0.38, 1.6, '#4f8a4a', { line: k.thin });
      k.rod([[u0 + 8.95, 0.8, zt + 1.6], [u0 + 9.35, 0.8, zt + 1.7], [u0 + 9.35, 0.8, zt + 2.3]], '#4f8a4a', 0.28);
    } else {
      // a robot figure, floppies, a pothos trailing off the end
      k.box(u0 + 0.8, 0.5, zt, 1.0, 0.8, 1.2, '#9aa5a1', { line: k.thin });
      k.box(u0 + 0.9, 0.55, zt + 1.2, 0.8, 0.7, 0.8, '#b8c2be', { line: k.thin });
      k.dot(u0 + 1.15, 1.26, zt + 1.6, 0.08, C.cyan);
      k.dot(u0 + 1.45, 1.26, zt + 1.6, 0.08, C.cyan);
      k.line([[u0 + 1.3, 0.9, zt + 2.0], [u0 + 1.3, 0.9, zt + 2.5]], INK, k.thin);
      for (let i = 0; i < 5; i++) k.box(u0 + 2.6 + (hash(seed, i, 2) - 0.5) * 0.2, 0.3, zt + i * 0.2, 1.1, 1.1, 0.2, ['#2a2f33', '#c0392f', '#2b5fb8', '#e8b030', '#39a85a'][i], { line: k.thin * 0.6, stripe: false });
      k.box(u0 + 4.4, 0.3, zt, 2.0, 1.1, 1.5, C.cardboard, { line: k.thin });
      const pu = u0 + w - 1.4;
      k.cyl(pu, 0.8, zt, 0.6, 0.9, '#e9ecea', { line: k.thin });
      for (let s2 = 0; s2 < 3; s2++) {
        const pts: P3[] = [];
        const l = 3 + hash(seed, s2, 3) * 4;
        for (let i = 0; i <= 6; i++) pts.push([pu + 0.5 + s2 * 0.35 + Math.sin(i * 1.3 + s2) * 0.25, 1.4, zt + 0.8 - (l * i) / 6]);
        k.line(pts, C.leafDark, Math.max(0.8, 0.1 * k.s));
        for (let i = 1; i <= 6; i++) {
          const [x, y] = k.p(pts[i][0] + (i & 1 ? 0.25 : -0.25), 1.5, pts[i][2]);
          k.pen.beginPath();
          k.pen.ellipse(x, y, 0.36 * k.s, 0.25 * k.s, i & 1 ? 0.5 : -0.5, 0, Math.PI * 2);
          k.paint(i % 3 ? C.leaf : C.leafLight, k.thin * 0.8);
        }
      }
    }
  }
}

// Game boxes standing on a shelf: spines on the plane v.
function bookRowFlat(k: Kit, u0: number, u1: number, v: number, z: number, h: number, seed: number): void {
  const cols = ['#2b5fb8', '#c0392f', '#2a2f33', '#39a85a', '#9a5ad8', '#e8b030'];
  let u = u0;
  for (let i = 0; u < u1 - 0.3; i++) {
    const w = 0.35 + hash(seed, i, 1) * 0.15;
    k.poly([[u, v, z], [u + w, v, z], [u + w, v, z + h * (0.85 + hash(seed, i, 2) * 0.15)], [u, v, z + h * (0.85 + hash(seed, i, 2) * 0.15)]], k.side(cols[Math.floor(hash(seed, i, 3) * cols.length)], 0, 1, 0.12), Math.max(0.7, k.thin * 0.6));
    u += w + 0.03;
  }
}

const neonColor = (k: number) => [C.magenta, C.green, C.cyan, C.amber][Math.floor(hash(k, 11) * 4)];

// A neon sign: a cat's head, a lightning bolt, a little ghost or a
// diamond, bent tube on a clear backing, its glow on the block.
function neon(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const { a, z0, z1 } = f;
  const c = neonColor(f.k);
  const cz = (z0 + z1) / 2;
  const r = Math.min(f.w, z1 - z0) * 0.42;
  const n = 0.5;
  const P = (du: number, dz: number): P3 => [a + du * r, n, cz + dz * r];
  const shape = Math.floor(hash(f.k, 12) * 4);
  let pts: P3[];
  if (shape === 0) pts = [P(-0.85, -0.8), P(-0.95, 0.2), P(-0.75, 1), P(-0.3, 0.55), P(0.3, 0.55), P(0.75, 1), P(0.95, 0.2), P(0.85, -0.8), P(-0.85, -0.8)];
  else if (shape === 1) pts = [P(0.25, 1), P(-0.55, -0.05), P(-0.02, -0.05), P(-0.3, -1), P(0.6, 0.18), P(0.05, 0.18), P(0.25, 1)];
  else if (shape === 2) {
    pts = [];
    for (let i = 0; i <= 10; i++) {
      const th = Math.PI * (i / 10);
      pts.push(P(Math.cos(th) * 0.75, 0.15 + Math.sin(th) * 0.75));
    }
    pts.push(P(-0.75, -0.9), P(-0.4, -0.6), P(-0.1, -0.9), P(0.2, -0.6), P(0.5, -0.9), P(0.75, -0.6), P(0.75, 0.15));
  } else pts = [P(0, 1), P(0.8, 0), P(0, -1), P(-0.8, 0), P(0, 1)];
  k.wash(a, 0.02, cz, r * 2.6, r * 2.2, c, 0.3);
  // the backing and its standoffs
  k.poly([P(-1.15, -1.15), P(1.15, -1.15), P(1.15, 1.2), P(-1.15, 1.2)], '#ffffff10', k.thin * 0.5, 0.2);
  // the tube: a wide soft glow, the colour, a hot core
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.line(pts, withAlpha(c, 0.35), 0.75 * s);
  pen.restore();
  k.line(pts, c, Math.max(1.6, 0.26 * s));
  k.line(pts, mix(c, '#ffffff', 0.7), Math.max(0.7, 0.09 * s));
  if (shape === 0 || shape === 2) {
    // eyes
    for (const du of [-0.32, 0.32]) {
      const e = P(du, shape === 0 ? 0 : 0.2);
      k.halo(e[0], n, e[2], 0.9, c, 0.5);
      k.dot(e[0], n, e[2], 0.15, mix(c, '#ffffff', 0.6));
    }
  }
  // its cable to the tray
  cable(k, droop([a + r * 0.9, 0.3, cz + r * 1.2], [a + r * 0.9 + 0.6, 0.35, tops(v.H).tray], -0.2, 3), '#1c2226', 0.12);
}

// A poster taped up: a retro computer, a ringed planet, a cat on the moon,
// a skull and wrenches, a pixel alien or a rocket.
function poster(k: Kit, f: { a: number; w: number; k: number; z0: number }, h: number): void {
  const { pen } = k;
  const { a, w } = f;
  const z0 = f.z0;
  const pw = w - 0.4;
  const u0 = a - pw / 2;
  const n = 0.06;
  const P = (fu: number, fz: number): P3 => [u0 + fu * pw, n, z0 + fz * h];
  const kind = Math.floor(hash(f.k, 82) * 6);
  const bg = ['#e8873a', '#2a2050', '#203048', '#a83232', '#141a1a', '#3a6a8a'][kind];
  k.shadow(a + 0.2, 0.15, pw * 0.55, 0.4, 0.12, z0 - 0.2);
  k.poly([P(0, 0), P(1, 0), P(1, 1), P(0, 1)], k.vgrad(a, n, z0, z0 + h, [[0, shade(bg, -0.12)], [1, shade(bg, 0.08)]]), k.thin);
  const disc = (fu: number, fz: number, r: number, c: Color) => {
    const pts: P3[] = [];
    for (let i = 0; i < 16; i++) pts.push(P(fu + (Math.cos((i / 16) * Math.PI * 2) * r) / pw, fz + (Math.sin((i / 16) * Math.PI * 2) * r) / h));
    k.poly(pts, c, 0);
  };
  if (kind === 0) {
    // a beige computer with a smiling green screen
    k.poly([P(0.2, 0.32), P(0.8, 0.32), P(0.8, 0.78), P(0.2, 0.78)], C.beige, k.thin * 0.6);
    k.poly([P(0.28, 0.42), P(0.72, 0.42), P(0.72, 0.72), P(0.28, 0.72)], '#103a20', 0);
    k.line([P(0.4, 0.52), P(0.5, 0.48), P(0.6, 0.52)], C.glyph, Math.max(0.8, 0.12 * k.s));
    for (const fu of [0.4, 0.6]) k.line([P(fu, 0.63), P(fu, 0.64)], C.glyph, Math.max(1, 0.18 * k.s));
    k.poly([P(0.15, 0.16), P(0.85, 0.16), P(0.8, 0.27), P(0.2, 0.27)], C.beigeDark, k.thin * 0.6);
  } else if (kind === 1) {
    // a ringed planet among stars
    disc(0.5, 0.55, pw * 0.26, '#e8873a');
    k.line([P(0.08, 0.5), P(0.5, 0.62), P(0.92, 0.6)], '#ffd28a', Math.max(1, 0.2 * k.s));
    for (let i = 0; i < 7; i++) disc(0.1 + hash(f.k, i, 83) * 0.8, 0.1 + hash(f.k, i, 84) * 0.85, 0.08, '#f2f0e8');
  } else if (kind === 2) {
    // a black cat on a yellow moon
    disc(0.5, 0.6, pw * 0.32, '#f2d26a');
    k.poly([P(0.38, 0.3), P(0.62, 0.3), P(0.6, 0.5), P(0.64, 0.6), P(0.58, 0.57), P(0.52, 0.6), P(0.46, 0.57), P(0.4, 0.6), P(0.42, 0.5)], '#14181a', 0);
    k.line([P(0.62, 0.32), P(0.75, 0.36), P(0.72, 0.46)], '#14181a', Math.max(1, 0.16 * k.s));
  } else if (kind === 3) {
    // a skull over crossed wrenches
    k.line([P(0.2, 0.2), P(0.8, 0.62)], '#e9ecea', Math.max(1, 0.28 * k.s));
    k.line([P(0.8, 0.2), P(0.2, 0.62)], '#e9ecea', Math.max(1, 0.28 * k.s));
    disc(0.5, 0.58, pw * 0.22, '#e9ecea');
    k.poly([P(0.4, 0.38), P(0.6, 0.38), P(0.6, 0.48), P(0.4, 0.48)], '#e9ecea', 0);
    disc(0.42, 0.58, pw * 0.06, bg);
    disc(0.58, 0.58, pw * 0.06, bg);
  } else if (kind === 4) {
    // a pixel alien
    const grid = ['00100100', '00011000', '00111100', '01011010', '11111111', '10111101', '10100101', '00011000'];
    pen.beginPath();
    grid.forEach((row, r) => {
      for (let c = 0; c < 8; c++) {
        if (row[c] !== '1') continue;
        const fu = 0.14 + c * 0.09;
        const fz = 0.78 - r * 0.07;
        k.trace([P(fu, fz), P(fu + 0.085, fz), P(fu + 0.085, fz + 0.065), P(fu, fz + 0.065)]);
      }
    });
    pen.fillStyle = C.green;
    pen.fill();
  } else {
    // a rocket climbing
    k.poly([P(0.5, 0.86), P(0.62, 0.62), P(0.62, 0.3), P(0.38, 0.3), P(0.38, 0.62)], '#e9ecea', k.thin * 0.6);
    k.poly([P(0.38, 0.38), P(0.26, 0.24), P(0.38, 0.3)], '#c0392f', 0);
    k.poly([P(0.62, 0.38), P(0.74, 0.24), P(0.62, 0.3)], '#c0392f', 0);
    disc(0.5, 0.58, pw * 0.07, '#5fb8e8');
    k.poly([P(0.42, 0.3), P(0.58, 0.3), P(0.5, 0.1)], '#ffb000', 0);
  }
  // tape on the corners
  for (const [fu, fz] of [[0, 1], [1, 1], [0, 0], [1, 0]] as const) {
    const c = P(fu, fz);
    k.poly([[c[0] - 0.3, n + 0.01, c[2] - 0.2], [c[0] + 0.3, n + 0.01, c[2] - 0.2], [c[0] + 0.3, n + 0.01, c[2] + 0.2], [c[0] - 0.3, n + 0.01, c[2] + 0.2]], '#d8dcd0b0', 0);
  }
}

// A grey fuse box with its conduit up to the tray, a hazard sticker.
function panel(k: Kit, v: RoomView, f: Feature): void {
  const { a, w, z0, z1 } = f;
  const { tray } = tops(v.H);
  k.rod([[a + 0.6, 0.35, z1], [a + 0.6, 0.35, tray]], '#8a9692', 0.32);
  for (let z = z1 + 3; z < tray - 1; z += 5) k.box(a + 0.3, 0, z, 0.6, 0.6, 0.3, C.steelDark, { line: k.thin, stripe: false });
  k.shadow(a + 0.2, 0.3, w * 0.5, 0.5, 0.16, z0 - 0.3);
  k.box(a - w / 2, 0, z0, w, 0.9, z1 - z0, '#8a9692', { line: k.lw });
  k.line([[a - w / 2 + 0.3, 0.92, z0 + 0.3], [a + w / 2 - 0.3, 0.92, z0 + 0.3], [a + w / 2 - 0.3, 0.92, z1 - 0.3], [a - w / 2 + 0.3, 0.92, z1 - 0.3], [a - w / 2 + 0.3, 0.92, z0 + 0.3]], '#6a7672', Math.max(0.7, k.thin * 0.7));
  k.poly([[a - 0.7, 0.93, z1 - 2.6], [a + 0.7, 0.93, z1 - 2.6], [a, 0.93, z1 - 1.3]], '#ffd23e', k.thin * 0.6);
  k.line([[a, 0.94, z1 - 2.35], [a, 0.94, z1 - 1.9]], INK, Math.max(0.7, 0.08 * k.s));
  k.rod([[a + w / 2 - 0.6, 1.0, z0 + 2.4], [a + w / 2 - 0.6, 1.0, z0 + 3.4]], '#3a4045', 0.14);
  // a few stickers on the door
  for (let i = 0; i < 2; i++) sticker(k, [a - 0.8 + i * 1.3, 0.93, z0 + 1.4 + i * 0.5], [1, 0], 0.45, Math.floor(hash(f.k, i, 9) * 6), STICKERS[Math.floor(hash(f.k, i, 10) * STICKERS.length)]);
}

// A long banner hung from the tray: a dark cloth with a big green mark (a
// circuit tree, a cat's head, a skull, a crescent and stars), tassels.
function banner(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const { a, w, z0, z1 } = f;
  const u0 = a - w / 2;
  const n = 0.12;
  const cloth = ['#1a1f2a', '#2a1a2e', '#14201a'][Math.floor(hash(f.k, 1) * 3)];
  const mark = [C.green, C.magenta, C.cyan, C.amber][Math.floor(hash(f.k, 2) * 4)];
  // the hem cut in a point
  k.poly([[u0, n, z1], [u0 + w, n, z1], [u0 + w, n, z0 + 1.6], [a, n, z0], [u0, n, z0 + 1.6]], k.vgrad(a, n, z0, z1, [[0, shade(cloth, -0.1)], [1, shade(cloth, 0.14)]]), k.lw);
  k.line([[u0 + 0.5, n + 0.01, z1 - 0.5], [u0 + 0.5, n + 0.01, z0 + 1.9], [a, n + 0.01, z0 + 0.5], [u0 + w - 0.5, n + 0.01, z0 + 1.9], [u0 + w - 0.5, n + 0.01, z1 - 0.5]], withAlpha(mark, 0.55), Math.max(0.7, 0.1 * s));
  // folds
  pen.beginPath();
  for (const fu of [0.3, 0.7]) {
    const [x0, y0] = k.p(u0 + w * fu, n, z1 - 0.3);
    const [x1, y1] = k.p(u0 + w * fu, n, z0 + 2);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#00000030';
  pen.lineWidth = 0.3 * s;
  pen.stroke();
  // the mark
  const cz = z0 + (z1 - z0) * 0.58;
  const r = w * 0.32;
  const kind = Math.floor(hash(f.k, 3) * 3);
  if (kind === 0) {
    // a circuit tree: a trunk and branches ending in pads
    const lines: P3[][] = [[[a, n, cz - r * 1.6], [a, n, cz + r]]];
    for (const [du, z] of [[-1, 0.6], [1, 0.2], [-1, -0.4], [1, -0.9]] as const) lines.push([[a, n, cz + z * r], [a + du * r * 0.5, n, cz + z * r + r * 0.5], [a + du * r, n, cz + z * r + r * 0.5]]);
    for (const l of lines) k.line(l, mark, Math.max(1, 0.2 * s));
    for (const l of lines.slice(1)) k.dot(l[2][0], n, l[2][2], 0.28, mark);
    k.dot(a, n, cz + r, 0.32, mark);
  } else if (kind === 1) {
    // a cat's head
    const P = (du: number, dz: number): P3 => [a + du * r, n, cz + dz * r];
    k.poly([P(-0.85, -0.8), P(-0.95, 0.2), P(-0.75, 1), P(-0.3, 0.55), P(0.3, 0.55), P(0.75, 1), P(0.95, 0.2), P(0.85, -0.8)], mark, 0, 0.1);
    for (const du of [-0.35, 0.35]) k.poly([P(du - 0.15, -0.05), P(du + 0.15, -0.05), P(du, 0.25)], cloth, 0);
  } else {
    // a crescent and stars
    const P = (du: number, dz: number): P3 => [a + du * r, n, cz + dz * r];
    const pts: P3[] = [];
    for (let i = 0; i <= 16; i++) {
      const th = -Math.PI / 2 + (i / 16) * Math.PI * 2 * 0.5 + Math.PI;
      pts.push(P(Math.cos(th), Math.sin(th)));
    }
    for (let i = 16; i >= 0; i--) {
      const th = -Math.PI / 2 + (i / 16) * Math.PI + Math.PI;
      pts.push(P(Math.cos(th) * 0.45 - 0.2, Math.sin(th) * 0.85));
    }
    k.poly(pts, mark, 0);
    for (let i = 0; i < 3; i++) k.dot(a + (0.3 + i * 0.3) * r, n, cz + (0.9 - i * 0.7) * r, 0.18, mark);
  }
  // the rod and its cords, the tassels at the point
  k.rod([[u0 - 0.5, 0.4, z1 + 0.1], [u0 + w + 0.5, 0.4, z1 + 0.1]], '#2a2f33', 0.2);
  k.line([[u0 + 0.3, 0.3, z1 + 0.2], [a, 0.3, z1 + 2.2], [u0 + w - 0.3, 0.3, z1 + 0.2]], '#3a4045', Math.max(0.7, 0.08 * s));
  k.rod([[a, n + 0.1, z0], [a, n + 0.1, z0 - 1.2]], mark, 0.16);
}

// A wall vent: a louvred grille.
function vent(k: Kit, f: Feature): void {
  const { a, w, z0, z1 } = f;
  k.box(a - w / 2, 0, z0, w, 0.3, z1 - z0, '#8a9692', { line: k.lw, stripe: false });
  k.rect(a - w / 2 + 0.4, z0 + 0.4, a + w / 2 - 0.4, z1 - 0.4, 0.31, '#2a3230', 0);
  for (let z = z0 + 0.7; z < z1 - 0.5; z += 0.55) k.line([[a - w / 2 + 0.4, 0.33, z], [a + w / 2 - 0.4, 0.33, z]], '#a9b3af', Math.max(0.8, 0.18 * k.s));
}

// Two or three posters taped up together at different heights and sizes.
function posters(k: Kit, f: Feature): void {
  const n = hash(f.k, 91) < 0.5 ? 2 : 3;
  const u0 = f.a - f.w / 2;
  if (n === 2) {
    poster(k, { a: u0 + 3.6, w: 6.4, k: f.k, z0: f.z0 }, 8.6);
    poster(k, { a: u0 + 9.6, w: 4.2, k: f.k + 3, z0: f.z0 + 2.6 + hash(f.k, 92) * 1.5 }, 5.6);
  } else {
    poster(k, { a: u0 + 2.4, w: 4.2, k: f.k, z0: f.z0 + 3 }, 5.6);
    poster(k, { a: u0 + 6.6, w: 3.6, k: f.k + 5, z0: f.z0 }, 4.8);
    poster(k, { a: u0 + 9.9, w: 4.0, k: f.k + 9, z0: f.z0 + 1.6 + hash(f.k, 93) * 2 }, 5.4);
  }
}

// An electric guitar on a wall hook: a two-horned body, the neck up to a
// headstock, strings and a coiled lead.
function guitar(k: Kit, f: Feature): void {
  const { a, z0 } = f;
  const n = 0.6;
  const body = [C.red, C.teal, '#e9ecea', C.mustard][Math.floor(hash(f.k, 1) * 4)];
  const P = (du: number, dz: number): P3 => [a + du, n, z0 + dz];
  k.shadow(a + 0.3, 0.4, 1.6, 0.5, 0.18, z0 + 0.2);
  // the hook and the headstock
  k.rod([P(0, 9.2), [a, 0.1, z0 + 9.4]], '#3a4045', 0.12);
  k.poly([P(-0.35, 7.6), P(0.35, 7.6), P(0.45, 9.0), P(-0.1, 9.3), P(-0.45, 9.0)], '#2a2f33', k.thin, 0.1);
  // the neck, frets
  k.poly([P(-0.25, 3.6), P(0.25, 3.6), P(0.25, 7.7), P(-0.25, 7.7)], '#8a5a35', k.thin);
  if (k.fine) for (let z = 4.2; z < 7.6; z += 0.45) k.line([P(-0.24, z), P(0.24, z)], '#c3ccc8', 0.04 * k.s);
  // the body
  const pts: P3[] = [P(-1.5, 0.4), P(-1.7, 1.6), P(-1.2, 2.6), P(-1.1, 3.8), P(-0.5, 3.3), P(0.4, 3.3), P(0.9, 4.2), P(1.2, 3.0), P(1.6, 1.7), P(1.4, 0.4), P(0, -0.1)];
  k.poly(pts, k.vgrad(a, n, z0, z0 + 4, [[0, shade(body, -0.12)], [1, shade(body, 0.1)]]), k.lw, 0.5);
  k.poly([P(-0.9, 0.8), P(0.9, 0.8), P(0.7, 2.6), P(-0.4, 2.8), P(-0.8, 2.0)], '#e9ecea', k.thin * 0.6, 0.3);
  for (const z of [1.5, 2.4]) k.rect(a - 0.6, z0 + z, a + 0.6, z0 + z + 0.3, n + 0.02, '#2a2f33', 0);
  k.line([P(-0.1, 1.0), P(-0.1, 7.6)], '#d8dcd0', Math.max(0.5, 0.04 * k.s));
  k.line([P(0.1, 1.0), P(0.1, 7.6)], '#d8dcd0', Math.max(0.5, 0.04 * k.s));
  cable(k, droop([a + 1.3, n, z0 + 0.6], [a + 2.2, 0.4, z0 - 1.5], 0.8, 5), '#1c2226', 0.1);
}

// A dartboard: rings round a bullseye, a few darts in it.
function dartboard(k: Kit, f: Feature): void {
  const { a } = f;
  const cz = (f.z0 + f.z1) / 2;
  const n = 0.45;
  const ringAt = (r: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i < 24; i++) pts.push([a + Math.cos((i / 24) * Math.PI * 2) * r, n, cz + Math.sin((i / 24) * Math.PI * 2) * r]);
    return pts;
  };
  k.shadow(a + 0.3, 0.4, 1.9, 0.5, 0.16, cz - 1.9);
  k.poly(ringAt(2.0), '#3a2a20', k.lw);
  for (const [r, c] of [[1.8, '#1c1f20'], [1.6, '#e8dcc0'], [1.42, '#1c1f20'], [1.05, '#c0392f'], [0.88, '#e8dcc0'], [0.55, '#2f8a4a'], [0.24, '#c0392f']] as const) k.poly(ringAt(r), c, r === 1.8 ? k.thin : 0);
  if (k.fine) {
    const pen = k.pen;
    pen.beginPath();
    for (let i = 0; i < 10; i++) {
      const th = (i / 10) * Math.PI * 2;
      const [x0, y0] = k.p(a + Math.cos(th) * 0.22, n + 0.01, cz + Math.sin(th) * 0.22);
      const [x1, y1] = k.p(a + Math.cos(th) * 1.4, n + 0.01, cz + Math.sin(th) * 1.4);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#1c1f2088';
    pen.lineWidth = 0.05 * k.s;
    pen.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const th = hash(f.k, i, 1) * Math.PI * 2;
    const r = 0.2 + hash(f.k, i, 2) * 1.0;
    const [du, dz] = [Math.cos(th) * r, Math.sin(th) * r];
    k.rod([[a + du, n, cz + dz], [a + du + 0.3, n + 0.9, cz + dz + 0.2]], ['#ffd23e', '#2b5fb8', '#39a85a'][i], 0.1);
  }
}

// A round wall clock: a white face, two hands, no numbers.
function clock(k: Kit, f: Feature): void {
  const { a } = f;
  const cz = (f.z0 + f.z1) / 2;
  const n = 0.4;
  const ringAt = (r: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i < 20; i++) pts.push([a + Math.cos((i / 20) * Math.PI * 2) * r, n, cz + Math.sin((i / 20) * Math.PI * 2) * r]);
    return pts;
  };
  k.shadow(a + 0.2, 0.3, 1.3, 0.4, 0.14, cz - 1.3);
  k.poly(ringAt(1.3), '#2a2f33', k.lw);
  k.poly(ringAt(1.05), '#eef0ea', k.thin * 0.6);
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2;
    k.dot(a + Math.cos(th) * 0.85, n + 0.01, cz + Math.sin(th) * 0.85, 0.05, '#2a2f33');
  }
  const h = hash(f.k, 3) * Math.PI * 2;
  k.line([[a, n + 0.02, cz], [a + Math.cos(h) * 0.5, n + 0.02, cz + Math.sin(h) * 0.5]], '#2a2f33', Math.max(0.9, 0.12 * k.s));
  k.line([[a, n + 0.02, cz], [a + Math.cos(h * 3) * 0.8, n + 0.02, cz + Math.sin(h * 3) * 0.8]], '#2a2f33', Math.max(0.7, 0.08 * k.s));
  k.dot(a, n + 0.03, cz, 0.08, C.red);
}

// A road sign on the block: a yellow diamond with a lightning bolt, or a
// red disc with a white bar.
function sign(k: Kit, f: Feature): void {
  const { a } = f;
  const cz = (f.z0 + f.z1) / 2;
  const n = 0.2;
  const r = 2.4;
  k.shadow(a + 0.3, 0.3, r * 0.8, 0.4, 0.14, cz - r);
  if (hash(f.k, 1) < 0.6) {
    k.poly([[a, n, cz + r], [a + r, n, cz], [a, n, cz - r], [a - r, n, cz]], '#2a2f33', k.lw, 0.2);
    k.poly([[a, n + 0.01, cz + r - 0.3], [a + r - 0.3, n + 0.01, cz], [a, n + 0.01, cz - r + 0.3], [a - r + 0.3, n + 0.01, cz]], '#ffd23e', 0, 0.15);
    k.poly([[a + 0.3, n + 0.02, cz + 1.4], [a - 0.6, n + 0.02, cz - 0.1], [a, n + 0.02, cz - 0.1], [a - 0.3, n + 0.02, cz - 1.4], [a + 0.7, n + 0.02, cz + 0.2], [a + 0.1, n + 0.02, cz + 0.2]], '#1c1f20', 0);
  } else {
    const pts: P3[] = [];
    for (let i = 0; i < 24; i++) pts.push([a + Math.cos((i / 24) * Math.PI * 2) * r * 0.85, n, cz + Math.sin((i / 24) * Math.PI * 2) * r * 0.85]);
    k.poly(pts, '#c0392f', k.lw);
    k.rect(a - 1.3, cz - 0.3, a + 1.3, cz + 0.3, n + 0.02, '#f2f0e8', 0);
  }
  for (const dz of [-1, 1]) k.dot(a, n + 0.03, cz + dz * (r - 0.8), 0.07, '#8a9692');
}

// Circuit traces painted on the block up high: runs that turn at 45
// degrees and end in pads, a chip or two, a faint glow.
function traces(k: Kit, f: Feature): void {
  const { pen, s } = k;
  const { a, w, z0, z1 } = f;
  const n = 0.02;
  const paint = '#2f9a5a';
  const runs: P3[][] = [];
  const pads: P3[] = [];
  const rows = Math.max(4, Math.floor((z1 - z0) / 2.2));
  for (let i = 0; i < rows; i++) {
    const zz = z0 + 1 + (i / (rows - 1)) * (z1 - z0 - 2);
    const left = hash(f.k, i, 1) < 0.5;
    const u0 = a - w / 2 + hash(f.k, i, 2) * 3;
    const u1 = a + w / 2 - hash(f.k, i, 3) * 3;
    const bend = u0 + (u1 - u0) * (0.3 + hash(f.k, i, 4) * 0.4);
    const dz = (hash(f.k, i, 5) - 0.5) * 3;
    const run: P3[] = left ? [[u0, n, zz], [bend, n, zz], [bend + Math.abs(dz), n, zz + dz], [u1, n, zz + dz]] : [[u0, n, zz + dz], [bend, n, zz + dz], [bend + Math.abs(dz), n, zz], [u1, n, zz]];
    runs.push(run);
    pads.push(run[0], run[run.length - 1]);
  }
  pen.save();
  pen.globalCompositeOperation = 'screen';
  for (const r of runs) k.line(r, '#39ff6e22', 0.7 * s);
  pen.restore();
  for (const r of runs) k.line(r, paint, Math.max(0.8, 0.16 * s));
  for (const p of pads) {
    k.dot(p[0], n, p[2], 0.32, paint);
    k.dot(p[0], n, p[2], 0.14, '#1c2a24');
  }
  // a chip painted in the middle
  const cz = (z0 + z1) / 2;
  k.rect(a - 1.6, cz - 1.2, a + 1.6, cz + 1.2, n + 0.01, '#1c2a24', k.thin * 0.6);
  k.rect(a - 1.6, cz - 1.2, a + 1.6, cz + 1.2, n + 0.01, '#00000000', 0);
  for (let i = 0; i < 5; i++) for (const side of [-1, 1]) k.line([[a - 1.2 + i * 0.6, n, cz + side * 1.2], [a - 1.2 + i * 0.6, n, cz + side * 1.7]], paint, Math.max(0.7, 0.12 * s));
}

// A pipe down the wall from the duct to the floor, clamps, a valve wheel.
function pipe(k: Kit, v: RoomView, f: Feature): void {
  const { a } = f;
  const { duct } = tops(v.H);
  const c = hash(f.k, 1) < 0.5 ? '#b87a4a' : '#8a9692';
  k.rod([[a, 0.45, 0], [a, 0.45, duct]], c, 0.42);
  k.line([[a - 0.1, 0.62, 0.2], [a - 0.1, 0.62, duct - 0.2]], shade(c, 0.35), Math.max(0.7, 0.07 * k.s));
  for (let z = 4; z < duct - 1; z += 8) k.box(a - 0.35, 0, z, 0.7, 0.75, 0.3, C.steelDark, { line: k.thin, stripe: false });
  const vz = 5 + hash(f.k, 2) * 3;
  const pts: P3[] = [];
  for (let i = 0; i < 16; i++) pts.push([a + Math.cos((i / 16) * Math.PI * 2) * 0.75, 0.95, vz + Math.sin((i / 16) * Math.PI * 2) * 0.75]);
  k.rod([[a, 0.6, vz], [a, 0.95, vz]], '#5d6864', 0.14);
  k.line([...pts, pts[0]], INK, 0.18 * k.s + k.thin);
  k.line([...pts, pts[0]], '#c0392f', 0.18 * k.s);
  k.line([[a - 0.75, 0.95, vz], [a + 0.75, 0.95, vz]], '#c0392f', Math.max(0.8, 0.12 * k.s));
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen } = k;
  const { W, D, H, T } = v;
  const cap = '#5d6864';
  // the floor's cut edges: carpet over a concrete slab
  k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#4a5150', 0, 1), k.lw);
  k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#4a5150', 1, 0), k.lw);
  k.line([[T, D, -0.3], [W, D, -0.3], [W, T, -0.3]], '#2c3634', Math.max(1, 0.3 * k.s));
  // the walls' cut ends and tops
  k.poly([[0, D, -SLAB], [T, D, -SLAB], [T, D, H], [0, D, H]], k.side('#56625e', 0, 1), k.lw);
  k.poly([[W, 0, -SLAB], [W, T, -SLAB], [W, T, H], [W, 0, H]], k.side('#56625e', 1, 0), k.lw);
  // block courses in the cut ends
  for (const [p, q] of [[[0, D], [T, D]], [[W, 0], [W, T]]] as const) {
    pen.beginPath();
    let r = 0;
    for (let z = COURSE; z < H - 0.5; z += COURSE, r++) {
      const [x0, y0] = k.p(p[0], p[1], z);
      const [x1, y1] = k.p(q[0], q[1], z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
      const f = r & 1 ? 0.5 : 0.25;
      const [a0, b0] = k.p(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z);
      const [a1, b1] = k.p(p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z + COURSE);
      pen.moveTo(a0, b0);
      pen.lineTo(a1, b1);
    }
    pen.strokeStyle = '#2a333044';
    pen.lineWidth = Math.max(0.6, 0.08 * k.s);
    pen.stroke();
  }
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.3), Math.max(1, 0.2 * k.s));
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}
