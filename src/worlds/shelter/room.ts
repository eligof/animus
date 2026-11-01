import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { hashString } from '../../world/rng.ts';
import { defaultPois, footprint, planRoom } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import { lampsOn } from '../../art/scene/light.ts';
import type { RoomArt, RoomLight, RoomView, WorldDef } from '../types.ts';
import { fillPts, hazard, hull, mote, rivets, wheel } from './bits.ts';
import { DECOR, DECOR_ART } from './decor.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, softDot, withAlpha } from './kit.ts';
import { NPCS } from './npcs.ts';
import { STATIONS } from './stations.ts';

// The shelter's shell, deep under the wasteland, in 1950s paint: a deck of
// ochre tiles laid in a checker inside a cream and teal border, ribbed
// rubber mats at the wall stations, a braided rug and a hazard-edged pad
// under the island stations, a riveted steel border along the foot of the
// walls; walls of cream-painted steel panels with an orange pinstripe,
// raised frames and heavy bulkhead ribs over a mint band with a teal
// stripe (pink with a pale aqua band behind the kitchen: the diner's
// corner), a teal frieze along the top under a bundle of pipes (teal,
// copper and grey) on brackets, with orange valve wheels that let off
// steam. Where the room is cut away it shows the earth it is dug into:
// bands of soil and stones round a concrete shell. In the free stretches
// between the stations: a mural of the world up top, capsule lights (their
// cool light pooled on the floor), pipe runs down the wall with a
// hand-wheel valve and a gauge, rounded-corner windows onto the
// hydroponics bay, a chalkboard, framed landscapes, a starburst clock, a
// fuse box, an amber radiation sign and louvred vents. Every piece sits
// where the stage's plan leaves the wall free and hangs over the tallest
// furniture that can be backed against a wall, so nothing hides behind a
// station or a locker. The overlay makes one capsule light flicker (the
// others hum), sends dust drifting down through their light and puffs
// steam off the valves.

type Wall = 'left' | 'right';
type Kind = 'tube' | 'pipes' | 'window' | 'board' | 'picture' | 'clock' | 'fuse' | 'sign' | 'vent' | 'mural';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
// The diner's stretch of wall (behind the kitchen): pink under a pale aqua
// band instead of the mint and teal.
export type Zone = { wall: Wall; a0: number; a1: number };
export type Plan = { L: Layout; features: Feature[]; diner: Zone | null };

const SLAB = 4; // the floor's thickness (concrete over the earth), shown along the front cut
const SKIRT = 0.9;
const DADO = 9; // the pastel band's top (its stripe the last unit of it)
const RAIL = 0.6; // the cap rail on the band
const AQUA = 2.6; // the diner's pale aqua band over its pink
const BAY = 8; // the raised frames between the wall's panels
const COURSE = 12; // the panels' seams across
const PANEL = 16; // the spacing of the deck's worn patches
const EDGE = 2.4; // the steel border along the walls' feet

// Heights on a wall H tall: the middle of the band the wall pieces hang in
// (all of it over the tallest furniture backed against a wall), the
// capsule lights higher up, and the pipe bundle along the top (its lowest
// pipe).
const midZ = (H: number) => Math.max(20, Math.min(30, Math.round(H * 0.45)));
const topPipe = (H: number) => H - 6.2;
const CAP_H = 8; // a capsule light's height
const capZ = (H: number) => Math.min(Math.round((midZ(H) + topPipe(H)) / 2), topPipe(H) - 4.6 - CAP_H / 2);

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// what hangs on the walls between them, and the diner's stretch of wall.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'shelter');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L), diner: diner(L) };
  PLANS.set(key, plan);
  return plan;
}

const WIDTH: Record<Kind, number> = { tube: 4, pipes: 10, window: 12, board: 10, picture: 7, clock: 6, fuse: 5, sign: 4, vent: 4, mural: 18 };
// How many of each a room has, over both walls (the vents fill in): these
// up to the size of a 150-column terminal's, more of all but the board,
// the clock, the fuse box, the sign and the mural in a bigger one, so its
// long walls are not left bare.
export const CAP: Record<Kind, number> = { tube: 6, pipes: 2, window: 3, board: 1, picture: 2, clock: 1, fuse: 1, sign: 1, vent: 3, mural: 1 };
const ONE: ReadonlySet<Kind> = new Set(['board', 'clock', 'fuse', 'sign', 'mural']);
export function capsFor(L: Layout): Record<Kind, number> {
  const f = Math.max(1, (L.W + L.D - 2 * L.T) / 280);
  const out = { ...CAP };
  for (const k of Object.keys(CAP) as Kind[]) if (!ONE.has(k)) out[k] = Math.round(CAP[k] * f);
  return out;
}
const ORDER: Kind[] = ['tube', 'window', 'pipes', 'board', 'tube', 'picture', 'fuse', 'vent', 'clock', 'window', 'tube', 'sign', 'pipes', 'picture', 'tube', 'vent'];
const GAP = 4;

// The room's pieces dealt out over the free stretches of both walls one at
// a time (the mural placed first), the walls taking turns, so the caps, counted over the room, leave
// neither wall bare: a capsule light first on each wall, then the next in
// ORDER (a place in it kept for each wall, cycled) that fits and is not at
// its cap, each wall held to half of each cap until neither can take more.
// What a stretch gets is spread along it with even gaps.
function features(L: Layout): Feature[] {
  type Span = { wall: Wall; a0: number; a1: number; used: number; got: Array<{ kind: Kind; n: number }> };
  const walls: Record<Wall, Span[]> = { right: [], left: [] };
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= WIDTH.tube) walls[wall].push({ wall, a0, a1, used: 0, got: [] });
    }
  }
  // the stretches in turn: the right wall's first, the left's first, the
  // right's second, ...
  const spans: Span[] = [];
  for (let i = 0; i < Math.max(walls.right.length, walls.left.length); i++) spans.push(...[walls.right[i], walls.left[i]].filter((s) => s));
  const zero = (): Record<Kind, number> => ({ tube: 0, pipes: 0, window: 0, board: 0, picture: 0, clock: 0, fuse: 0, sign: 0, vent: 0, mural: 0 });
  const cap = capsFor(L);
  const count = zero();
  const mine = { right: zero(), left: zero() };
  const cursor = { right: 0, left: 5 };
  const fits = (s: Span, k: Kind, half: boolean) => count[k] < cap[k] && (!half || mine[s.wall][k] < Math.ceil(cap[k] / 2)) && s.used + WIDTH[k] + (s.got.length ? GAP : 0) <= s.a1 - s.a0;
  let n = 0;
  // the mural before the rest: in the stretch nearest the back corner
  // with room for it, the right wall's before the left's
  const wall = spans.filter((s) => s.a1 - s.a0 >= WIDTH.mural).sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1))[0];
  if (wall) {
    wall.used = WIDTH.mural;
    wall.got.push({ kind: 'mural', n: n++ });
    count.mural++;
    mine[wall.wall].mural++;
  }
  for (const half of [true, false]) {
    for (let dealt = true; dealt; ) {
      dealt = false;
      for (const s of spans) {
        // the next in ORDER that fits: one this stretch has not got yet if
        // it can be, never the same as the one beside it
        const next = (ok: (k: Kind) => boolean) => ORDER.map((_, i) => ORDER[(cursor[s.wall] + i) % ORDER.length]).find((c) => fits(s, c, half) && ok(c));
        const k = !mine[s.wall].tube && fits(s, 'tube', half) ? 'tube' : (next((c) => !s.got.some((g) => g.kind === c)) ?? next((c) => s.got[s.got.length - 1]?.kind !== c));
        if (!k) continue;
        s.used += WIDTH[k] + (s.got.length ? GAP : 0);
        s.got.push({ kind: k, n: n++ });
        count[k]++;
        mine[s.wall][k]++;
        cursor[s.wall]++;
        dealt = true;
      }
    }
  }
  const out: Feature[] = [];
  for (const s of spans) {
    const gap = (s.a1 - s.a0 - s.got.reduce((m, g) => m + WIDTH[g.kind], 0)) / (s.got.length + 1);
    let at = s.a0 + gap;
    for (const g of s.got) {
      out.push({ wall: s.wall, kind: g.kind, a: at + WIDTH[g.kind] / 2, w: WIDTH[g.kind], k: g.n * 7 + 3 });
      at += WIDTH[g.kind] + gap;
    }
  }
  return out;
}

// Where the kitchen stands (the stage furnishes the room with planRoom
// seeded by the world's id, its locals in, so the shell can find the decor
// as it finds the stations): its wall's band is the diner's for a few units
// either side, within the free stretch it stands in.
function diner(L: Layout): Zone | null {
  if (!L.slots.length) return null;
  const room = planRoom({ id: 'shelter', stations: STATIONS, decor: DECOR, npcs: NPCS } as unknown as WorldDef, L, hashString('shelter'));
  const p = room.props.find((q) => q.art === DECOR_ART.kitchen && !q.island);
  if (!p) return null;
  const end = p.wall === 'right' ? L.W : L.D;
  const at = p.wall === 'right' ? p.x0 : p.y0;
  const [g0, g1] = wallGaps(L, p.wall).find(([a, b]) => at >= a && at + p.len <= b) ?? [L.T, end];
  return { wall: p.wall, a0: Math.max(g0 + 0.5, at - 5), a1: Math.min(g1 - 0.5, end, at + p.len + 5) };
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, two more to dance by the jukebox and a seat at the end
// of the booth (the idle prop), and warm by the valve radio's glow rather
// than at the booth.
export function shelterPois(L: Layout): Poi[] {
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).filter((p) => p.kind !== 'warm');
  const juke = slot('idle');
  const radio = slot('think');
  if (juke) out.push({ ...at(juke, -4, 2), kind: 'dance', face: mid(juke) }, { ...at(juke, 2, 3), kind: 'dance', face: mid(juke) }, { ...at(juke, -9, 1), kind: 'seat', face: mid(juke) });
  if (radio) out.push({ ...at(radio, -5, 1), kind: 'warm', face: mid(radio) }, { ...at(radio, 5, 1), kind: 'warm', face: mid(radio) });
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
    const wild = plan.features.find((f) => f.kind === 'tube');
    v.pen.save();
    for (const f of plan.features) {
      if (f.kind !== 'tube' || !lampsOn(v)) continue;
      flicker(new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s), v, f, f === wild);
    }
    for (const wall of ['right', 'left'] as const) steam(new Kit(v.pen, wallAt(v.at, wall, v.T), v.s), v, wall);
    v.pen.restore();
  },
  // The light the shell gives (the scene lays its pools, washes and
  // glows): the capsule lights, out on the night shift; the amber
  // emergency lamps on the frieze, always on, carrying the room at night;
  // and the windows, the hydroponics bay's grow light coming through them
  // (turned low at night).
  lights(v): RoomLight[] {
    const out: RoomLight[] = [];
    for (const f of planFor(v.W, v.D, v.H, v.T).features) {
      if (f.kind === 'tube') out.push({ kind: 'lamp', wall: f.wall, u: f.a, v: 0.9, z: capZ(v.H), color: '#fff1cf', r: 13, halo: 2.2, strength: 0.85 });
      if (f.kind === 'window') out.push({ kind: 'window', wall: f.wall, u: f.a, w: f.w - 2.8, z0: midZ(v.H) - 3.2, z1: midZ(v.H) + 3.2, color: '#f2f0c4', strength: 0.4, night: '#d8f0a0', moon: 0.25 });
    }
    for (const wall of ['right', 'left'] as const) {
      for (const a of emergencyOf(v.T, wall === 'right' ? v.W : v.D)) out.push({ kind: 'glow', wall, u: a, v: 0.9, z: topPipe(v.H) - 2.2, color: '#ffb347', r: 10, halo: 1.5, strength: 0.45 });
    }
    return out;
  },
};

// The stretch of a wall (along) the pen can see between heights z0..z1.
function visibleAlong(k: Kit, a0: number, a1: number, z0: number, z1: number, n = 1): [number, number] {
  let lo = a1;
  let hi = a0;
  const step = 4;
  for (let a = a0; a <= a1 + step; a += step) {
    const aa = Math.min(a, a1);
    if (k.sees(aa - step, 0, z0, aa + step, n, z1, 16)) {
      lo = Math.min(lo, aa - step);
      hi = Math.max(hi, aa + step);
    }
  }
  return [lo, hi];
}

// Points round a rectangle with rounded corners standing on the plane
// v = n, centred on (a, z), hw x hh its half sizes, r its corners' radius
// (r = hw: a capsule), counter-clockwise from the top right.
function rrect(a: number, n: number, z: number, hw: number, hh: number, r: number, steps = 6): P3[] {
  const out: P3[] = [];
  const at: Array<[number, number, number]> = [[a + hw - r, z + hh - r, 0], [a - hw + r, z + hh - r, 0.5], [a - hw + r, z - hh + r, 1], [a + hw - r, z - hh + r, 1.5]];
  for (const [cu, cz, t0] of at) {
    for (let i = 0; i <= steps; i++) {
      const t = (t0 + (i / steps) * 0.5) * Math.PI;
      out.push([cu + Math.cos(t) * r, n, cz + Math.sin(t) * r]);
    }
  }
  return out;
}

// ── floor ──────────────────────────────────────────────────────────────────

// The deck: square tiles laid in a checker of two ochres with pale grout,
// in a border (a cream band, a teal one inside it, orange blocks at its
// corners) round the field, just off the steel at the walls' feet and a
// few units in from the front cuts; plain ochre outside it.
const TILE = 4;
const CHECK = ['#b8894a', '#a67a3e'] as const;
const MARGIN = '#a0763c';
const GROUT = '#e8d8b0';
const RIM = { wall: EDGE + 0.35, cut: 3, cream: 1.2, teal: 0.5 }; // the border: in from the walls, in from the cuts, its bands

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen, s } = k;
  const { W, D, T } = v;
  if (!k.sees(T, T, -SLAB, W, D, 0, 8)) return;
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], MARGIN, 0);
  // The visible stretch of the floor: x - y and x + y ranges on the pen.
  const [ox, oy] = k.p(0, 0, 0);
  const pad = 2 * TILE;
  const dlo = -ox / s - pad;
  const dhi = (pen.width - ox) / s + pad;
  const slo = (2 * -oy) / s - pad;
  const shi = (2 * (pen.height - oy)) / s + pad;
  const seen = (x: number, y: number) => x - y >= dlo && x - y <= dhi && x + y >= slo && x + y <= shi;
  // The border's outside, and the field inside it.
  const [bx0, by0, bx1, by1] = [T + RIM.wall, T + RIM.wall, W - RIM.cut, D - RIM.cut];
  const band = RIM.cream + RIM.teal;
  const [fx0, fy0, fx1, fy1] = [bx0 + band, by0 + band, bx1 - band, by1 - band];
  const rect = (x0: number, y0: number, x1: number, y1: number, z = 0.005): P3[] => [[x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z]];
  // the tiles: the field in the light ochre, every other tile darker
  k.poly(rect(fx0, fy0, fx1, fy1), CHECK[0], 0);
  const cols = Math.ceil((fx1 - fx0) / TILE);
  const rows = Math.ceil((fy1 - fy0) / TILE);
  pen.beginPath();
  for (let j = 0; j < rows; j++) {
    const y0 = fy0 + j * TILE;
    const y1 = Math.min(fy1, y0 + TILE);
    for (let i = (j & 1) ^ 1; i < cols; i += 2) {
      const x0 = fx0 + i * TILE;
      const x1 = Math.min(fx1, x0 + TILE);
      if (seen((x0 + x1) / 2, (y0 + y1) / 2)) k.trace(rect(x0, y0, x1, y1, 0.01));
    }
  }
  pen.fillStyle = CHECK[1];
  pen.fill();
  const grout: Array<[P3, P3]> = [];
  for (let i = 1; i < cols; i++) grout.push([[fx0 + i * TILE, fy0, 0.02], [fx0 + i * TILE, fy1, 0.02]]);
  for (let j = 1; j < rows; j++) grout.push([[fx0, fy0 + j * TILE, 0.02], [fx1, fy0 + j * TILE, 0.02]]);
  k.segs(grout, withAlpha(GROUT, 0.35), Math.max(0.6, 0.06 * s));
  // the border round them: cream, teal inside it, an ink line each side,
  // an orange block at each corner
  const ring = (d0: number, d1: number) => {
    pen.beginPath();
    k.trace(rect(bx0 + d0, by0 + d0, bx1 - d0, by1 - d0, 0.02));
    k.trace(rect(bx0 + d1, by0 + d1, bx1 - d1, by1 - d1, 0.02).reverse());
  };
  ring(0, RIM.cream);
  pen.fillStyle = C.cream;
  pen.fill();
  ring(RIM.cream, band);
  pen.fillStyle = C.teal;
  pen.fill();
  for (const [x, y] of [[bx0, by0], [bx1 - band, by0], [bx0, by1 - band], [bx1 - band, by1 - band]]) k.poly(rect(x, y, x + band, y + band, 0.03), C.orange, k.thin * 0.7);
  const edges: P3[][] = [rect(bx0, by0, bx1, by1, 0.03), rect(fx0, fy0, fx1, fy1, 0.03)];
  for (const e of edges) k.line([...e, e[0]], withAlpha(INK, 0.45), Math.max(0.6, 0.08 * s));
  // A scuff here and there.
  const scuffs: P3[][] = [];
  for (let j = 0; j < Math.ceil((D - T) / PANEL); j++) {
    const y0 = T + j * PANEL;
    const y1 = Math.min(D, y0 + PANEL);
    for (let i = 0; i < Math.ceil((W - T) / PANEL); i++) {
      const x0 = T + i * PANEL;
      const x1 = Math.min(W, x0 + PANEL);
      if (!seen((x0 + x1) / 2, (y0 + y1) / 2)) continue;
      for (let q = 0; q < 2; q++) {
        if (hash(i, j, 40 + q) > 0.14) continue;
        // a worn smudge: a low blob of grime
        const cx = x0 + 2 + hash(i, j, 50 + q) * (x1 - x0 - 4);
        const cy = y0 + 2 + hash(i, j, 60 + q) * (y1 - y0 - 4);
        const r = 0.8 + hash(i, j, 70 + q) * 1.6;
        const blob: P3[] = [];
        for (let m = 0; m < 7; m++) {
          const th = (m / 7) * Math.PI * 2;
          const rr = r * (0.7 + hash(i, j, 80 + m) * 0.5);
          blob.push([cx + Math.cos(th) * rr * 1.4, cy + Math.sin(th) * rr, 0.01]);
        }
        scuffs.push(blob);
      }
    }
  }
  pen.beginPath();
  for (const q of scuffs) k.trace(q, 0.6);
  pen.fillStyle = withAlpha('#5e4220', 0.09);
  pen.fill();
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#140d0455');
  g.addColorStop(0.35, '#140d0418');
  g.addColorStop(0.7, '#140d0400');
  g.addColorStop(1, '#140d0426');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  // Ribbed rubber mats where the workers stand at the wall stations.
  for (const q of plan.L.slots) {
    if (q.island || q.kind === 'entrance') continue;
    mat(new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s), q.len, q.dep);
  }
  // Something under the island stations, so each stands on its own patch
  // of floor: a braided rug under the armchair and the radio, a teal pad
  // edged with hazard stripes under the terminal.
  for (const q of plan.L.slots) {
    if (!q.island || (q.kind !== 'think' && q.kind !== 'web')) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (!qk.sees(-2, -2, 0, q.len + 2, q.dep + 2, 0)) continue;
    if (q.kind === 'think') braided(qk, q.len / 2, q.dep / 2 + 0.3, q.len / 2 + 1.5, q.dep / 2 + 1.6);
    else paintedPad(qk, q.len, q.dep);
  }
  // A drain at the middle of the floor in a painted ring.
  const h = hub(plan.L);
  const rects = plan.L.slots.map(slotRect);
  if (!rects.some((q) => q.x0 < h.x + 6 && h.x - 6 < q.x1 && q.y0 < h.y + 6 && h.y - 6 < q.y1) && k.sees(h.x - 5, h.y - 5, 0, h.x + 5, h.y + 5, 0)) drain(k, h.x, h.y);
  // The steel border along the foot of each wall.
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    const [a0, a1] = visibleAlong(wk, T, end, 0, 0, EDGE + 1);
    if (a1 <= a0) continue;
    const lo = Math.max(T, a0);
    const hi = Math.min(end, a1);
    wk.poly([[lo, 0, 0.02], [hi, 0, 0.02], [hi, EDGE, 0.02], [lo, EDGE, 0.02]], '#7f8a84', 0);
    if (s >= 3) {
      // diamond tread: short dashes leaning each way in turn
      const tread: Array<[P3, P3]> = [];
      for (let a = T + Math.floor((lo - T) / 1.1) * 1.1 + 0.4; a < hi - 0.3; a += 1.1) {
        for (const [w, f] of [[0.55, 1], [1.25, -1], [1.95, 1]] as const) {
          const d = (Math.round((a - T) / 1.1) & 1 ? -f : f) * 0.18;
          tread.push([[a - 0.22, w - d, 0.03], [a + 0.22, w + d, 0.03]]);
        }
      }
      wk.segs(tread, withAlpha('#b4c0bc', 0.5), Math.max(0.6, 0.1 * s), 'round');
    }
    wk.line([[lo, EDGE, 0.03], [hi, EDGE, 0.03]], withAlpha(INK, 0.55), Math.max(0.7, 0.1 * s));
    // the contact shade along the wall's foot
    wk.poly([[lo, 0, 0.04], [hi, 0, 0.04], [hi, 3.5, 0.04], [lo, 3.5, 0.04]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#140d0470'], [0.35, '#140d0424'], [1, '#140d0400']]), 0);
  }
  // A gloss streak on the tiles under each capsule light while it is on
  // (the scene lays the lights' pools).
  if (lampsOn(v)) {
    for (const f of plan.features) {
      if (f.kind !== 'tube') continue;
      const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
      if (!wk.sees(f.a - 3, 0, 0, f.a + 3, 14, 0)) continue;
      wk.pool(f.a, 7, 1.5, 6.5, '#fff8e6', 0.16);
      wk.pool(f.a, 5.5, 0.7, 3.5, '#ffffff', 0.12);
    }
  }
  // Lamp light where the desk lamp and the radio's dial glow (the
  // jukebox and the screens declare theirs).
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  for (const [kind, u, w, r, a, c] of [['write', 0.8, 0.5, 8, 0.14, '#ffd890'], ['think', 0.75, 0.6, 9, 0.16, '#ffb860']] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (qk.sees(-r, -r, 0, q.len + r, q.dep + r, 0)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
}

// A ribbed rubber mat in front of a station len x dep (its frame), where
// its worker stands.
function mat(k: Kit, len: number, dep: number): void {
  const w = Math.min(9, len - 2);
  const u0 = (len - w) / 2;
  const v0 = dep + 0.5;
  const v1 = v0 + 3.4;
  if (!k.sees(u0, v0, 0, u0 + w, v1, 0)) return;
  k.poly([[u0, v0, 0.04], [u0 + w, v0, 0.04], [u0 + w, v1, 0.04], [u0, v1, 0.04]], '#3d4240', k.thin, 0.3);
  if (k.s < 3) return;
  const ribs: Array<[P3, P3]> = [];
  for (let w2 = v0 + 0.45; w2 < v1 - 0.3; w2 += 0.42) ribs.push([[u0 + 0.35, w2, 0.05], [u0 + w - 0.35, w2, 0.05]]);
  k.segs(ribs, withAlpha('#6a716d', 0.7), Math.max(0.6, 0.09 * k.s));
}

// An oval braided rug centred on (cu, cv), ru x rv: rings of mustard,
// teal, cream and orange, the braid's twist across each when zoomed in
// (after the colony's).
function braided(k: Kit, cu: number, cv: number, ru: number, rv: number): void {
  const z = 0.04;
  k.shadow(cu, cv, ru * 1.02, rv * 1.05, 0.12);
  const rings: Color[] = [C.orange, C.cream, C.tealDark, C.mustard, C.cream, C.teal, C.orange];
  const oval = (r: number) => {
    const pts: P3[] = [];
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      pts.push([cu + Math.cos(a) * (ru - (1 - r) * Math.min(ru, rv)), cv + Math.sin(a) * (rv - (1 - r) * Math.min(ru, rv)), z]);
    }
    return pts;
  };
  rings.forEach((c, i) => k.poly(oval(1 - i / rings.length), c, i === 0 ? k.thin : 0));
  if (k.s < 3) return;
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < rings.length; i++) {
    for (const [u, v, w] of oval(1 - (i + 0.5) / rings.length)) {
      const [x, y] = k.p(u, v, w);
      pen.moveTo(x - 0.12 * k.s, y - 0.08 * k.s);
      pen.lineTo(x + 0.12 * k.s, y + 0.08 * k.s);
    }
  }
  pen.strokeStyle = withAlpha(INK, 0.22);
  pen.lineWidth = Math.max(0.6, 0.08 * k.s);
  pen.stroke();
}

// A pad painted teal on the deck round a station len x dep (its frame),
// hazard stripes round its edge.
function paintedPad(k: Kit, len: number, dep: number): void {
  const [u0, v0, u1, v1] = [-1, -1, len + 1, dep + 1.2];
  const e = 0.8;
  k.poly([[u0, v0, 0.03], [u1, v0, 0.03], [u1, v1, 0.03], [u0, v1, 0.03]], withAlpha('#5fb0a2', 0.55), 0);
  // the stripes lie on the floor: a kit whose `out` is the floor's v and
  // whose `up` is height
  const fk = new Kit(k.pen, (u, v, z) => k.at(u, z, v), k.s);
  const pitch = 0.9;
  hazard(fk, u0, v0, u1, v0 + e, 0.04, 0, true, pitch);
  hazard(fk, u0, v1 - e, u1, v1, 0.04, 0, true, pitch);
  const side = new Kit(k.pen, (u, v, z) => k.at(z, u, v), k.s);
  hazard(side, v0 + e, u0, v1 - e, u0 + e, 0.04, 0, true, pitch);
  hazard(side, v0 + e, u1 - e, v1 - e, u1, 0.04, 0, true, pitch);
  k.line([[u0, v0, 0.05], [u1, v0, 0.05], [u1, v1, 0.05], [u0, v1, 0.05], [u0, v0, 0.05]], INK, k.thin);
  k.line([[u0 + e, v0 + e, 0.05], [u1 - e, v0 + e, 0.05], [u1 - e, v1 - e, 0.05], [u0 + e, v1 - e, 0.05], [u0 + e, v0 + e, 0.05]], withAlpha(INK, 0.5), k.thin * 0.7);
}

// A round drain grate at the middle of the floor, a cream ring painted
// round it.
function drain(k: Kit, cx: number, cy: number): void {
  const { pen, s } = k;
  const ring = (r: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i < 40; i++) {
      const t = (i / 40) * Math.PI * 2;
      pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r, 0.02]);
    }
    return pts;
  };
  pen.beginPath();
  k.trace(ring(4.2));
  k.trace(ring(3.6).reverse());
  pen.fillStyle = withAlpha(C.cream, 0.7);
  pen.fill();
  k.shadow(cx, cy, 2.6, 2.6, 0.2);
  k.disc(cx, cy, 0.03, 2.1, '#5c6662', k.thin);
  k.disc(cx, cy, 0.04, 1.75, '#1c201c', 0);
  const bars: Array<[P3, P3]> = [];
  for (let d = -1.4; d <= 1.41; d += 0.47) {
    const half = Math.sqrt(Math.max(0, 1.75 * 1.75 - d * d)) - 0.1;
    bars.push([[cx + d, cy - half, 0.05], [cx + d, cy + half, 0.05]]);
  }
  k.segs(bars, '#8a948f', Math.max(0.8, 0.2 * s));
}

// ── walls ──────────────────────────────────────────────────────────────────

const PLATE: ReadonlyArray<readonly [number, Color]> = [[0, '#d4ccb2'], [0.4, '#c8c0a6'], [1, '#a29a82']];
const FRAME = '#8e9c9a'; // the raised frames' steel

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 4.5, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.16) => (lit ? c : shade(c, -d));
  const mine = plan.features.filter((f) => f.wall === wall);
  const [ax0, ax1] = visibleAlong(k, T, end, 0, H);
  const lo = Math.max(T, ax0);
  const hi = Math.min(end, ax1);
  if (hi <= lo) return;
  plates(k, v, lo, hi, end, mine, tone);
  band(k, lo, hi, plan.diner?.wall === wall ? plan.diner : null, tone);
  bulkheads(k, v, framing(T, end, mine).ribs, plan.diner?.wall === wall ? plan.diner : null, tone);
  // What hangs on the wall.
  for (const f of mine) {
    if (f.kind === 'tube') capsuleArt(k, v, f, tone, lampsOn(v));
    else if (f.kind === 'pipes') pipesArt(k, v, f);
    else if (f.kind === 'window') windowArt(k, v, f, tone);
    else if (f.kind === 'board') boardArt(k, v, f);
    else if (f.kind === 'picture') pictureArt(k, v, f);
    else if (f.kind === 'clock') clockArt(k, v, f);
    else if (f.kind === 'fuse') fuseArt(k, v, f);
    else if (f.kind === 'sign') signArt(k, v, f);
    else if (f.kind === 'vent') ventArt(k, v, f);
    else if (f.kind === 'mural') muralArt(k, v, f);
  }
  // The pipe bundle along the top, and the emergency lamps on the frieze.
  pipeRun(k, v, lo, hi, end);
  for (const a of emergencyOf(T, end)) if (a > lo - 2 && a < hi + 2) emergency(k, a, topPipe(H) - 2.2, lampsOn(v));
}

// Where a wall's raised frames stand (every other panel) and its heavy
// bulkhead ribs (every fourth frame's place, and one in the back corner):
// no rib where anything hangs, no frame behind a piece on the wall but a
// capsule light or a pipe run (which mount over them).
function framing(T: number, end: number, mine: Feature[]): { frames: number[]; ribs: number[] } {
  const clear = (a: number, m: number, all: boolean) => !mine.some((f) => (all || (f.kind !== 'tube' && f.kind !== 'pipes')) && Math.abs(a - f.a) < f.w / 2 + m);
  const frames: number[] = [];
  const ribs: number[] = clear(T + 1.2, 1.8, true) ? [T + 1.2] : [];
  for (let i = 2; T + i * BAY < end - 3; i += 2) {
    const a = T + i * BAY;
    if (i % 8 === 0 && clear(a, 2.8, true)) ribs.push(a);
    else if (clear(a, 0.8, false)) frames.push(a);
  }
  return { frames, ribs };
}

// Riveted steel panels from the band to the top: lit low by the lights,
// deeper going up; an orange pinstripe along them; raised frames every
// other panel (framing()), seams across every COURSE with a row of rivets
// under each, a panel a shade off here and there, a rust streak now and
// then.
function plates(k: Kit, v: RoomView, lo: number, hi: number, end: number, mine: Feature[], tone: (c: Color, d?: number) => Color): void {
  const { pen, s } = k;
  const { T, H } = v;
  const lit = k.lit(0, 1);
  const z0 = DADO;
  k.poly([[lo, 0, z0], [hi, 0, z0], [hi, 0, H], [lo, 0, H]], k.vgrad(T, 0, z0, H, PLATE.map(([t, c]) => [t, tone(c)] as const)), 0);
  const odd: P3[][] = [];
  const seams: Array<[P3, P3]> = [];
  const lights: Array<[P3, P3]> = [];
  const dots: P3[] = [];
  const streaks: Array<[P3, P3]> = [];
  const zTop = topPipe(H) - 0.6;
  let row = 0;
  for (let z = z0 + RAIL; z < zTop; z += COURSE, row++) {
    const z1 = Math.min(zTop, z + COURSE);
    if (z > z0 + RAIL) {
      seams.push([[lo, 0, z], [hi, 0, z]]);
      lights.push([[lo, 0, z - 0.16], [hi, 0, z - 0.16]]);
    }
    for (let a = T; a < hi; a += BAY) {
      const a1 = Math.min(end, a + BAY);
      if (a1 < lo) continue;
      const h = hash(Math.round(a), row, 61);
      if (h < 0.14) odd.push([[a, 0, z], [a1, 0, z], [a1, 0, z1], [a, 0, z1]]);
      if (s >= 3 && z > z0 + RAIL) for (let aa = a + 1.0; aa < a1 - 0.6; aa += 1.5) dots.push([aa, 0, z - 0.55]);
      if (h > 0.92 && z1 - z > 3) {
        const sa = a + 1.5 + hash(row, Math.round(a), 62) * (a1 - a - 3);
        streaks.push([[sa, 0, z1 - 0.6], [sa, 0, z1 - 2.6 - hash(row, 63) * 3]]);
      }
    }
  }
  pen.beginPath();
  for (const q of odd) k.trace(q);
  pen.fillStyle = withAlpha(lit ? '#e8e0c6' : '#8a8270', 0.22);
  pen.fill();
  k.segs(seams, withAlpha(INK, 0.6), Math.max(0.7, 0.11 * s));
  k.segs(lights, withAlpha('#fff8e6', 0.25), Math.max(0.6, 0.08 * s));
  k.segs(streaks, withAlpha('#8a5424', 0.3), Math.max(0.8, 0.22 * s), 'round');
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#0a0d0a50'], [1, '#0a0d0a00']]), 0);
  // an orange pinstripe along the wall at eye height, chrome either side
  // (what hangs on the wall hangs over it)
  const zs = DADO + 11;
  k.rect(lo, zs, hi, zs + 0.5, 0.005, tone(C.orange, 0.14), 0);
  k.segs([[[lo, 0.01, zs - 0.06], [hi, 0.01, zs - 0.06]], [[lo, 0.01, zs + 0.56], [hi, 0.01, zs + 0.56]]], tone(C.chrome, 0.2), Math.max(0.6, 0.12 * s));
  // the raised frames, riveted down both edges
  const zf0 = z0 + RAIL;
  const zf1 = topPipe(H) - 0.3;
  for (const a of framing(T, end, mine).frames) {
    if (a < lo - 1 || a > hi + 1) continue;
    k.box(a - 0.45, 0, zf0, 0.9, 0.24, zf1 - zf0, tone(FRAME, 0.2), { line: k.thin, stripe: false });
    if (s >= 3) for (let z = zf0 + 0.9; z < zf1 - 0.4; z += 1.6) dots.push([a - 0.22, 0.25, z], [a + 0.22, 0.25, z]);
  }
  rivets(k, dots, tone('#e6dfca'), 0.11);
  // a teal frieze under the pipe bundle, a chrome line along each edge
  const f0 = topPipe(H) - 3.4;
  const f1 = topPipe(H) - 1.0;
  k.poly([[lo, 0, f0], [hi, 0, f0], [hi, 0, f1], [lo, 0, f1]], k.vgrad(lo, 0, f0, f1, [[0, tone(shade(C.teal, -0.08), 0.12)], [1, tone(C.teal, 0.12)]]), 0);
  k.segs([[[lo, 0.01, f0], [hi, 0.01, f0]], [[lo, 0.01, f1], [hi, 0.01, f1]]], tone(C.chrome, 0.2), Math.max(0.8, 0.18 * s));
}

// Heavy bulkhead ribs up the wall at `ribs` from the band to the frieze:
// a steel post standing out of the panels with rivets down its face, a
// curved bracket either side of its head where it meets the frieze and a
// chrome shoe over the band (the one in the back corner in its shade).
const RIB = '#7f8c89';
function bulkheads(k: Kit, v: RoomView, ribs: number[], diner: Zone | null, tone: (c: Color, d?: number) => Color): void {
  const f0 = topPipe(v.H) - 3.4;
  const r = 1.5;
  const dots: P3[] = [];
  for (const a of ribs) {
    if (!k.sees(a - 1 - r, 0, 0, a + 1 + r, 1.2, f0)) continue;
    const zb = (diner && a > diner.a0 - 1.5 && a < diner.a1 + 1.5 ? DADO + AQUA : DADO) + RAIL;
    const c = tone(a < v.T + 2 ? shade(RIB, -0.14) : RIB, 0.2);
    for (const d of [-1, 1]) {
      const pts: P3[] = [[a + d, 0.4, f0], [a + d * (1 + r), 0.4, f0]];
      for (let i = 0; i <= 8; i++) {
        const t = (i / 8) * (Math.PI / 2);
        pts.push([a + d * (1 + r) - d * r * Math.sin(t), 0.4, f0 - r + r * Math.cos(t)]);
      }
      k.poly(pts, shade(c, -0.06), k.thin);
    }
    k.box(a - 1, 0, zb, 2, 0.8, f0 - zb, c, { line: k.lw, stripe: false });
    k.box(a - 1.25, 0, zb - 1.6, 2.5, 1.0, 1.6, tone(C.chrome, 0.2), { line: k.thin, stripe: false });
    if (k.s >= 3) for (let z = zb + 0.9; z < f0 - 0.5; z += 1.2) dots.push([a - 0.55, 0.81, z], [a + 0.55, 0.81, z]);
  }
  rivets(k, dots, tone('#c6cfcb'), 0.11);
}

// The pastel band along the foot of the wall: mint, with a teal stripe for
// its last unit; in the diner's stretch pink under a pale aqua band, chrome
// strips at its ends. A cap rail on top, the skirting under it, seams and
// rivets every BAY.
function band(k: Kit, lo: number, hi: number, diner: Zone | null, tone: (c: Color, d?: number) => Color): void {
  const { s } = k;
  const lit = k.lit(0, 1);
  const parts: Array<[number, number, boolean]> = [];
  if (diner && diner.a1 > lo && diner.a0 < hi) {
    const d0 = Math.max(lo, diner.a0);
    const d1 = Math.min(hi, diner.a1);
    if (d0 > lo) parts.push([lo, d0, false]);
    parts.push([d0, d1, true]);
    if (d1 < hi) parts.push([d1, hi, false]);
  } else parts.push([lo, hi, false]);
  const seams: Array<[P3, P3]> = [];
  const dots: P3[] = [];
  for (const [a0, a1, pink] of parts) {
    const base = tone(pink ? C.pink : C.mint, 0.14);
    const top = pink ? DADO : DADO - 1;
    k.poly([[a0, 0, 0], [a1, 0, 0], [a1, 0, top], [a0, 0, top]], k.vgrad(a0, 0, 0, top, [[0, shade(base, -0.16)], [0.45, base], [1, shade(base, 0.05)]]), 0);
    if (pink) k.poly([[a0, 0, DADO], [a1, 0, DADO], [a1, 0, DADO + AQUA], [a0, 0, DADO + AQUA]], tone(C.aqua, 0.14), 0);
    else k.poly([[a0, 0, DADO - 1], [a1, 0, DADO - 1], [a1, 0, DADO], [a0, 0, DADO]], tone(C.teal, 0.12), 0);
    const zr = pink ? DADO + AQUA : DADO;
    // the cap rail
    k.box(a0, 0, zr, a1 - a0, 0.35, RAIL, tone(C.steelLight, 0.12), { line: k.thin, stripe: false });
    k.line([[a0, 0.36, zr + RAIL - 0.12], [a1, 0.36, zr + RAIL - 0.12]], withAlpha('#ffffff', lit ? 0.35 : 0.18), Math.max(0.6, 0.08 * s));
    for (let a = Math.ceil(a0 / BAY) * BAY; a < a1; a += BAY) {
      seams.push([[a, 0, SKIRT], [a, 0, top - 0.2]]);
      if (s >= 3) for (const z of [SKIRT + 0.7, top - 0.8]) dots.push([a - 0.45, 0, z], [a + 0.45, 0, z]);
    }
  }
  k.segs(seams, withAlpha(INK, 0.4), Math.max(0.7, 0.1 * s));
  rivets(k, dots, withAlpha('#ffffff', 0.45), 0.1);
  k.poly([[lo, 0, 0], [hi, 0, 0], [hi, 0, SKIRT], [lo, 0, SKIRT]], tone('#2f3a38'), 0);
  // grime along the foot
  k.poly([[lo, 0.01, SKIRT], [hi, 0.01, SKIRT], [hi, 0.01, SKIRT + 2.2], [lo, 0.01, SKIRT + 2.2]], k.vgrad(lo, 0, SKIRT, SKIRT + 2.2, [[0, '#0a0d0a38'], [1, '#0a0d0a00']]), 0);
  // chrome strips at the diner's ends
  if (diner) {
    for (const a of [diner.a0, diner.a1]) {
      if (a < lo - 1 || a > hi + 1) continue;
      k.box(a - 0.25, 0, SKIRT, 0.5, 0.3, DADO + AQUA + RAIL - SKIRT, C.chrome, { line: k.thin, stripe: false });
    }
  }
}

// Valve wheels on the bundle's main, one stretch in three (where the
// overlay lets off steam).
function valvesOn(T: number, end: number): number[] {
  const out: number[] = [];
  for (let a = T + 20; a < end - 4; a += 30) out.push(a);
  return out;
}

// Three pipes along the top of the wall on brackets: a teal main, a copper
// line and a grey conduit, flanges along them, an orange hand-wheel valve on
// the main now and then and a gauge beside every other one.
function pipeRun(k: Kit, v: RoomView, lo: number, hi: number, end: number): void {
  const { H, T } = v;
  const z0 = topPipe(H);
  if (!k.sees(lo, 0, z0 - 2, hi, 2.5, H, 6)) return;
  const pipes: Array<[number, number, number, Color]> = [
    [z0 + 3.6, 1.0, 0.62, C.teal],
    [z0 + 2.0, 0.85, 0.42, C.copper],
    [z0 + 0.7, 0.6, 0.28, C.pipe],
  ];
  // brackets: flat straps from the wall under each pipe
  const straps: Array<[P3, P3]> = [];
  for (let a = T + 3; a < end - 1; a += 7) {
    if (a < lo - 2 || a > hi + 2) continue;
    straps.push([[a, 0, z0 + 4.4], [a, 0, z0]]);
  }
  k.segs(straps, INK, 0.36 * k.s + k.lw);
  k.segs(straps, C.steelDark, 0.36 * k.s);
  for (const [z, n, r, c] of pipes) {
    k.segs([[[lo, n, z], [hi, n, z]]], INK, 2 * r * k.s + k.lw * 1.3);
    k.segs([[[lo, n, z], [hi, n, z]]], shade(c, -0.08), 2 * r * k.s);
    k.segs([[[lo, n, z + r * 0.35], [hi, n, z + r * 0.35]]], shade(c, 0.2), r * 0.7 * k.s);
    k.segs([[[lo, n, z + r * 0.55], [hi, n, z + r * 0.55]]], withAlpha('#ffffff', 0.35), Math.max(0.6, r * 0.22 * k.s));
  }
  // flanges on the main and the copper line
  const fl: Array<[P3, P3]> = [];
  const fc: Array<[P3, P3]> = [];
  for (let a = T + 6.5; a < end - 1; a += 14) {
    if (a < lo - 2 || a > hi + 2) continue;
    fl.push([[a, 1.05, z0 + 3.6 - 0.8], [a, 1.05, z0 + 3.6 + 0.8]]);
    fc.push([[a + 4, 0.9, z0 + 2.0 - 0.55], [a + 4, 0.9, z0 + 2.0 + 0.55]]);
  }
  k.segs(fl, INK, 0.5 * k.s + k.lw);
  k.segs(fl, shade(C.teal, 0.12), 0.5 * k.s);
  k.segs(fc, INK, 0.4 * k.s + k.lw);
  k.segs(fc, shade(C.copper, 0.15), 0.4 * k.s);
  valvesOn(T, end).forEach((a, i) => {
    if (a < lo - 3 || a > hi + 3) return;
    const z = z0 + 3.6;
    k.box(a - 0.6, 0.6, z - 0.75, 1.2, 1.0, 1.5, C.steelDark, { line: k.thin, stripe: false });
    k.rod([[a, 1.6, z], [a, 2.1, z]], C.steelDark, 0.16);
    wheel(k, a, 2.15, z, 1.0, hash(a, 71) * 1.5, C.orange, 4);
    if (i % 2 === 0) {
      // a little gauge on a stub off the copper line
      k.rod([[a + 3, 0.9, z0 + 2.0], [a + 3, 1.5, z0 + 2.0], [a + 3, 1.5, z0 + 1.1]], C.copper, 0.12);
      k.face(a + 3, 1.55, z0 + 0.5, 0.62, C.brass, k.thin, 18);
      k.face(a + 3, 1.6, z0 + 0.5, 0.46, C.cream, 0, 18);
      k.line([[a + 3, 1.65, z0 + 0.5], [a + 3 + 0.3, 1.65, z0 + 0.75]], C.red, Math.max(0.6, 0.07 * k.s));
    }
  });
}

// A capsule light: a steel mounting plate, a rounded chrome housing standing
// out of it round a tall ribbed lens lit from inside, its light washed over
// the plates round it (the overlay makes it hum or flicker).
function capsuleArt(k: Kit, v: RoomView, f: Feature, tone: (c: Color, d?: number) => Color, on: boolean): void {
  const z = capZ(v.H);
  const a = f.a;
  const hh = CAP_H / 2;
  if (!k.sees(a - 6, 0, z - hh - 6, a + 6, 1.5, z + hh + 3)) return;
  if (on) k.wash(a, 0.02, z - 0.8, 6, 10, '#e6fff4', 0.18);
  k.shadow(a + 0.3, 0.05, 1.4, 0.5, 0.18, z - hh - 0.6);
  // the plate
  k.poly(rrect(a, 0.02, z, 1.6, hh + 0.6, 1.4), tone(FRAME, 0.12), k.thin);
  // the housing: its side (back outline to front) then its chrome face
  const back = rrect(a, 0.1, z, 1.05, hh, 1.05).map(([u, n, zz]) => k.p(u, n, zz));
  const front = rrect(a, 0.8, z, 1.05, hh, 1.05).map(([u, n, zz]) => k.p(u, n, zz));
  fillPts(k, hull([...back, ...front]), shade(C.chrome, -0.3), k.lw);
  k.poly(rrect(a, 0.8, z, 1.05, hh, 1.05), C.chrome, k.thin);
  if (on) lens(k, a, z, '#f4fff9', '#bfe8d8');
  else lens(k, a, z, '#8a9a92', '#5f6d66');
}

// The amber emergency lamps along the frieze: one every 24 units from 12
// in, each wall.
function emergencyOf(T: number, end: number): number[] {
  const out: number[] = [];
  for (let a = T + 12; a < end - 4; a += 24) out.push(a);
  return out;
}

// An emergency lamp on the frieze at `a`, its lens's middle at `z`: a
// steel housing, a caged amber lens (bright on the night shift, steady
// and low by day).
function emergency(k: Kit, a: number, z: number, on: boolean): void {
  if (!k.sees(a - 1.2, 0, z - 1.4, a + 1.2, 1.2, z + 1.4)) return;
  k.box(a - 0.85, 0, z - 1.1, 1.7, 0.45, 2.2, C.steelDark, { line: k.thin, stripe: false });
  k.poly(rrect(a, 0.85, z, 0.55, 0.8, 0.5), on ? '#e89a48' : '#ffd27a', k.thin);
  if (k.s >= 3) k.segs([[[a - 0.55, 0.9, z], [a + 0.55, 0.9, z]], [[a, 0.9, z - 0.8], [a, 0.9, z + 0.8]]], C.steelDark, Math.max(0.6, 0.08 * k.s));
}

// A capsule's ribbed lens, light at its middle, `dark` at its ends.
function lens(k: Kit, a: number, z: number, light: Color, dark: Color): void {
  const hh = CAP_H / 2 - 0.4;
  k.poly(rrect(a, 0.82, z, 0.72, hh, 0.72), k.vgrad(a, 0.82, z - hh, z + hh, [[0, dark], [0.5, light], [1, dark]]), 0);
  if (k.s < 3) return;
  const ribs: Array<[P3, P3]> = [];
  for (let zz = z - hh + 0.8; zz < z + hh - 0.6; zz += 0.6) ribs.push([[a - 0.58, 0.83, zz], [a + 0.58, 0.83, zz]]);
  k.segs(ribs, withAlpha('#7fb8a6', 0.45), Math.max(0.5, 0.06 * k.s));
}

// The pipes down a wall, in the wall's frame: for each of the copper line,
// the teal main and a thin drain, how far along from the run's middle, how
// far out from the wall and how thick; a collar or a flange stands `lip`
// proud of its pipe. Below `clear` nothing stands further out than `flat`,
// so furniture backed against the wall stands in front of the pipes; the
// hand-wheel valve and the gauge stand further out, so they hang above
// `clear`, over the tallest thing that can stand there (the lockers, 15).
export const PIPES = {
  copper: { a: -2.8, n: 0.5, r: 0.36 },
  main: { a: 0.6, n: 0.66, r: 0.5 },
  drain: { a: 3.6, n: 0.36, r: 0.22 },
  lip: 0.18,
  flat: 1.4,
  clear: 17,
  valve: { z: 19.2, n: 1.9, r: 1.3 },
  gauge: { z: 22.4, n: 1.35, r: 1.15 },
} as const;

// Pipes down the wall from the bundle along the top to the floor: a copper
// line and a teal main with flanges, a thin drain, held by clamps; up out
// of reach, an orange hand-wheel valve on the main and a pressure gauge on
// a stub off the copper line.
function pipesArt(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  const top = topPipe(v.H) + 3.6;
  const { copper, main, drain, lip, valve: vv, gauge: gg } = PIPES;
  if (!k.sees(a - f.w / 2, 0, 0, a + f.w / 2, vv.n + vv.r, top + 1)) return;
  const cu = a + copper.a;
  const mu = a + main.a;
  const tu = a + drain.a;
  const runs: Array<[number, number, number, Color, number]> = [
    [cu, copper.n, copper.r, C.copper, topPipe(v.H) + 2.0],
    [mu, main.n, main.r, C.teal, top],
    [tu, drain.n, drain.r, C.pipe, topPipe(v.H) + 0.7],
  ];
  k.shadow(a, 0.8, f.w * 0.45, 0.9, 0.2);
  for (const [u, n, r, c, zt] of runs) {
    k.line([[u, n, 0], [u, n, zt]], INK, 2 * r * k.s + k.lw * 1.3);
    k.line([[u, n, 0], [u, n, zt]], c, 2 * r * k.s);
    k.line([[u - r * 0.4, n, 0], [u - r * 0.4, n, zt]], shade(c, 0.25), r * 0.6 * k.s);
    // where it goes into the floor: a collar
    k.cyl(u, n, 0, r + lip, 0.5, shade(c, -0.1), { line: k.thin });
  }
  // clamps holding them to the wall
  const clamps: Array<[P3, P3]> = [];
  for (const z of [3.5, top - 9, top - 18]) {
    if (z < 2 || z > top - 2) continue;
    clamps.push([[cu - 0.6, 0.75, z], [tu + 0.4, 0.75, z]]);
  }
  k.segs(clamps, INK, 0.38 * k.s + k.lw);
  k.segs(clamps, C.steelDark, 0.38 * k.s);
  // flanges on the main
  for (const z of [6.2, 13.4]) k.cyl(mu, main.n, z - 0.3, main.r + lip, 0.6, shade(C.teal, 0.08), { line: k.thin });
  // the hand-wheel valve on the main
  const vz = vv.z;
  k.box(mu - 0.85, 0.25, vz - 0.95, 1.7, 1.15, 1.9, C.steelDark, { line: k.lw, round: 0.2 });
  k.rod([[mu, 1.4, vz], [mu, vv.n - 0.05, vz]], C.steelDark, 0.2);
  wheel(k, mu, vv.n, vz, vv.r, 0.4 + f.k * 0.37, C.orange, 5);
  // the gauge on a stub off the copper line, its stem up from below
  const gz = gg.z;
  const sz = gz - gg.r - 0.55;
  k.rod([[cu, copper.n, sz], [cu, gg.n - 0.15, sz], [cu, gg.n - 0.15, gz - gg.r * 0.7]], C.copper, 0.16);
  k.box(cu - 0.3, gg.n - 0.4, sz - 0.3, 0.6, 0.5, 0.6, C.brass, { line: k.thin, stripe: false });
  pressureGauge(k, cu, gg.n, gz, gg.r, 0.5 + hash(f.k, 3) * 1.6);
  // a tag of hazard tape round the drain
  if (k.fine) hazard(k, tu - 0.3, 7.6, tu + 0.3, 8.6, drain.n + drain.r + 0.02, k.thin * 0.6, k.lit(0, 1), 0.3);
}

// A pressure gauge on the plane v = n, nothing like the clock: a deep brass
// case, a dark face with pale ticks and a broad red zone at the top of the
// scale (no digits), a pale needle at angle `needle` (radians, 0 pointing
// right, pi/2 up) and a glint across the glass.
function pressureGauge(k: Kit, a: number, n: number, z: number, r: number, needle: number): void {
  k.face(a, n - 0.25, z, r, shade(C.brass, -0.3), k.lw, 22);
  k.face(a, n, z, r, C.brass, k.lw, 22);
  k.face(a, n + 0.02, z, r * 0.76, '#1b211d', 0, 22);
  const arc = (r0: number, t0: number, t1: number): P3[] => {
    const pts: P3[] = [];
    for (let i = 0; i <= 8; i++) {
      const th = Math.PI * (t0 + ((t1 - t0) * i) / 8);
      pts.push([a + Math.cos(th) * r * r0, n + 0.04, z + Math.sin(th) * r * r0]);
    }
    return pts;
  };
  k.line(arc(0.6, 0.12, -0.18), C.red, Math.max(1, r * 0.2 * k.s));
  if (k.s * r >= 3.5) {
    const seg: Array<[P3, P3]> = [];
    const m = k.s * r >= 8 ? 9 : 5;
    for (let i = 0; i < m; i++) {
      const th = Math.PI * (1.18 - (1.36 * i) / (m - 1));
      seg.push([[a + Math.cos(th) * r * 0.5, n + 0.05, z + Math.sin(th) * r * 0.5], [a + Math.cos(th) * r * 0.68, n + 0.05, z + Math.sin(th) * r * 0.68]]);
    }
    k.segs(seg, withAlpha(C.cream, 0.85), Math.max(0.6, 0.06 * k.s));
  }
  k.line([[a, n + 0.07, z], [a + Math.cos(needle) * r * 0.62, n + 0.07, z + Math.sin(needle) * r * 0.62]], '#f6efd6', Math.max(0.8, 0.1 * k.s));
  k.face(a, n + 0.08, z, Math.max(0.12, r * 0.15), C.brass, 0, 10);
  if (k.fine) k.line(arc(0.62, 0.62, 0.9), withAlpha('#ffffff', 0.5), Math.max(0.6, 0.08 * k.s));
}

// A window with rounded corners in a thick riveted steel frame onto the
// hydroponics bay beyond: two tiers of planters full of leaves and
// tomatoes under a warm grow light, two glints across the glass.
function windowArt(k: Kit, v: RoomView, f: Feature, tone: (c: Color, d?: number) => Color): void {
  const { pen } = k;
  const zc = midZ(v.H);
  const a = f.a;
  const hw = f.w / 2 - 0.4;
  const hh = 4.2;
  if (!k.sees(a - hw - 1, 0, zc - hh - 2, a + hw + 1, 1, zc + hh + 1)) return;
  const iw = hw - 1.0;
  const ih = hh - 1.0;
  k.shadow(a + 0.3, 0.1, hw, 0.6, 0.2, zc - hh - 0.2);
  // the frame's depth, under the view (which shows through its opening)
  const outer0 = rrect(a, 0.0, zc, hw, hh, 2.0);
  const outer = rrect(a, 0.55, zc, hw, hh, 2.0);
  const inner = rrect(a, 0.55, zc, iw, ih, 1.2);
  fillPts(k, hull([...outer0, ...outer].map(([u, n, z]) => k.p(u, n, z))), tone(C.steelDark, 0.12), k.lw);
  // the glass: the hydroponics bay beyond, clipped to the opening
  const hole = rrect(a, 0.08, zc, iw, ih, 1.2);
  pen.save();
  pen.beginPath();
  k.trace(hole);
  pen.clip();
  k.poly(hole, k.vgrad(a, 0.08, zc - ih, zc + ih, [[0, '#2a4a40'], [0.55, '#3a6052'], [1, '#5a8468']]), 0);
  // the warm floor back there
  k.poly([[a - iw, 0.09, zc - ih], [a + iw, 0.09, zc - ih], [a + iw, 0.09, zc - ih * 0.8], [a - iw, 0.09, zc - ih * 0.8]], '#7a6034', 0);
  // the grow light along the top, its glow on the plants under it
  const zl = zc + ih * 0.62;
  k.halo(a, 0.1, zl - 0.8, iw * 0.9, '#fff3c4', 0.6);
  k.rect(a - iw, zl, a + iw, zl + 0.8, 0.1, '#fff3c4', 0);
  k.line([[a - iw, 0.1, zl], [a + iw, 0.1, zl]], C.steelDark, Math.max(0.8, 0.12 * k.s));
  // two tiers of planters, leafy rows in them, a few tomatoes
  for (const [zt, row] of [[zc - ih * 0.7, 0], [zc - ih * 0.12, 1]] as const) {
    const leaves: Array<[number, number, number, Color]> = [];
    for (let u = a - iw + 0.7, i = 0; u < a + iw - 0.3; u += 0.95, i++) {
      leaves.push([u, zt + 0.95 + hash(f.k, row * 31 + i, 77) * 0.35, 0.55 + hash(f.k, row * 31 + i, 78) * 0.25, (i + row) % 3 ? C.leaf : C.leafOdd]);
    }
    for (const [u, z, r, c] of leaves) k.face(u, 0.1, z, r, c, k.thin * 0.7, 12);
    for (const [i, [u, z, r]] of leaves.entries()) if (hash(f.k, row * 31 + i, 79) < 0.35) k.face(u + r * 0.3, 0.11, z - r * 0.2, 0.22, '#e05040', 0, 10);
    k.rect(a - iw + 0.2, zt, a + iw - 0.2, zt + 0.9, 0.12, C.steelDark, k.thin);
    k.line([[a - iw + 0.2, 0.13, zt + 0.75], [a + iw - 0.2, 0.13, zt + 0.75]], C.steelLight, Math.max(0.6, 0.1 * k.s));
  }
  // glints
  k.segs([[[a - iw * 0.7, 0.11, zc - ih * 0.2], [a - iw * 0.2, 0.11, zc + ih * 0.9]], [[a - iw * 0.45, 0.11, zc - ih * 0.5], [a - iw * 0.05, 0.11, zc + ih * 0.35]]], withAlpha('#ffffff', 0.22), Math.max(0.8, 0.35 * k.s), 'round');
  pen.restore();
  // the frame's face round the opening
  pen.beginPath();
  k.trace(outer);
  k.trace([...inner].reverse());
  k.paint(tone(C.steelLight, 0.14), k.lw);
  // the reveal inside the opening, and a chrome lip round it
  k.line([...inner, inner[0]], C.chrome, Math.max(0.8, 0.16 * k.s));
  if (k.s >= 3) {
    const dots: P3[] = [];
    for (let u = a - hw + 1.4; u <= a + hw - 1.4; u += 1.6) dots.push([u, 0.56, zc + hh - 0.5], [u, 0.56, zc - hh + 0.5]);
    for (let z = zc - hh + 1.6; z <= zc + hh - 1.6; z += 1.6) dots.push([a - hw + 0.5, 0.56, z], [a + hw - 0.5, 0.56, z]);
    rivets(k, dots, tone(C.rivet), 0.1);
  }
}

// A chalkboard in a wooden frame, chalk on it (an atom, boxes and arrows,
// tally marks, a wavy line; never letters or digits), a tray of chalk and
// an eraser under it.
function boardArt(k: Kit, v: RoomView, f: Feature): void {
  const zc = midZ(v.H) - 0.3;
  const a = f.a;
  const bw = f.w / 2 - 0.4;
  const bh = 3.4;
  if (!k.sees(a - bw - 0.5, 0, zc - bh - 2, a + bw + 0.5, 1, zc + bh + 0.5)) return;
  k.shadow(a + 0.3, 0.1, bw, 0.6, 0.2, zc - bh - 0.3);
  k.box(a - bw, 0, zc - bh, 2 * bw, 0.35, 2 * bh, C.wood, { stripe: false });
  const n = 0.36;
  k.rect(a - bw + 0.45, zc - bh + 0.45, a + bw - 0.45, zc + bh - 0.45, n, k.vgrad(a, n, zc - bh, zc + bh, [[0, '#26332d'], [1, '#34443c']]), k.thin);
  // old smudges of wiped chalk
  k.poly([[a - bw + 1.0, n + 0.01, zc - 1.6], [a - 0.5, n + 0.01, zc - 2.2], [a + 0.4, n + 0.01, zc - 1.0], [a - bw + 1.6, n + 0.01, zc - 0.6]], withAlpha('#ffffff', 0.07), 0, 0.6);
  const chalk = withAlpha('#f4f2e8', 0.85);
  const w = Math.max(0.6, 0.09 * k.s);
  // an atom: three orbits round a nucleus
  const ax = a - bw * 0.5;
  const az = zc + 0.6;
  for (const t of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
    const pts: P3[] = [];
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * Math.PI * 2;
      const x = Math.cos(th) * 1.45;
      const y = Math.sin(th) * 0.5;
      pts.push([ax + x * Math.cos(t) - y * Math.sin(t), n + 0.02, az + x * Math.sin(t) + y * Math.cos(t)]);
    }
    k.line(pts, chalk, w);
  }
  k.face(ax, n + 0.02, az, 0.22, chalk, 0, 10);
  // two boxes and an arrow between them, a line down to a third
  const bx = (u: number, z: number): P3[] => [[u - 0.6, n + 0.02, z - 0.4], [u + 0.6, n + 0.02, z - 0.4], [u + 0.6, n + 0.02, z + 0.4], [u - 0.6, n + 0.02, z + 0.4], [u - 0.6, n + 0.02, z - 0.4]];
  k.line(bx(a + 0.7, zc + 1.6), chalk, w);
  k.line(bx(a + bw - 1.3, zc + 1.6), chalk, w);
  k.line(bx(a + bw - 1.3, zc - 0.4), chalk, w);
  k.segs([[[a + 1.3, n + 0.02, zc + 1.6], [a + bw - 1.9, n + 0.02, zc + 1.6]], [[a + bw - 2.2, n + 0.02, zc + 1.85], [a + bw - 1.9, n + 0.02, zc + 1.6]], [[a + bw - 2.2, n + 0.02, zc + 1.35], [a + bw - 1.9, n + 0.02, zc + 1.6]], [[a + bw - 1.3, n + 0.02, zc + 1.2], [a + bw - 1.3, n + 0.02, zc]]], chalk, w, 'round');
  // tally marks: two groups of four struck through
  const tally: Array<[P3, P3]> = [];
  for (let g = 0; g < 2; g++) {
    const u0 = a + 0.1 + g * 1.5;
    for (let i = 0; i < 4; i++) tally.push([[u0 + i * 0.25, n + 0.02, zc - 2.3], [u0 + i * 0.25, n + 0.02, zc - 1.4]]);
    tally.push([[u0 - 0.15, n + 0.02, zc - 2.1], [u0 + 0.9, n + 0.02, zc - 1.6]]);
  }
  k.segs(tally, chalk, w, 'round');
  // a wavy line along the bottom left
  const wave: P3[] = [];
  for (let i = 0; i <= 16; i++) wave.push([a - bw + 1.0 + i * 0.22, n + 0.02, zc - 2.0 + Math.sin(i * 0.9) * 0.3]);
  k.line(wave, withAlpha('#ffd8a8', 0.8), w);
  // the tray, chalk and an eraser on it
  k.box(a - bw + 0.3, 0.35, zc - bh - 0.25, 2 * bw - 0.6, 0.6, 0.3, C.woodDark, { line: k.thin, stripe: false });
  k.box(a - bw + 1.2, 0.5, zc - bh + 0.05, 0.9, 0.18, 0.18, '#f4f2e8', { line: k.thin * 0.7, stripe: false });
  k.box(a + 0.5, 0.5, zc - bh + 0.05, 0.7, 0.18, 0.18, '#f2b8b0', { line: k.thin * 0.7, stripe: false });
  k.box(a + bw - 2.2, 0.42, zc - bh + 0.05, 1.4, 0.45, 0.35, '#7a6a58', { line: k.thin, stripe: false });
}

// A framed landscape in a gilt frame: hills, a lake and a low orange sun
// under a pale sky.
function pictureArt(k: Kit, v: RoomView, f: Feature): void {
  const { pen } = k;
  const zc = midZ(v.H) + 1;
  const a = f.a;
  const fw = f.w / 2 - 0.3;
  const fh = 2.5;
  if (!k.sees(a - fw - 0.5, 0, zc - fh - 1, a + fw + 0.5, 1, zc + fh + 0.5)) return;
  k.shadow(a + 0.3, 0.1, fw, 0.5, 0.2, zc - fh - 0.2);
  k.box(a - fw, 0, zc - fh, 2 * fw, 0.3, 2 * fh, C.brass, { stripe: false });
  const n = 0.31;
  const u0 = a - fw + 0.45;
  const u1 = a + fw - 0.45;
  const z0 = zc - fh + 0.45;
  const z1 = zc + fh - 0.45;
  const pic: P3[] = [[u0, n, z0], [u1, n, z0], [u1, n, z1], [u0, n, z1]];
  pen.save();
  pen.beginPath();
  k.trace(pic);
  pen.clip();
  k.poly(pic, k.vgrad(a, n, z0, z1, [[0, '#f6dcae'], [0.45, '#f4e6c4'], [1, '#9ed4e0']]), 0);
  k.face(a + 0.8, n + 0.01, zc + 0.1, 0.55, '#f0a050', 0, 16);
  k.poly([[u0, n + 0.01, z0], [u0, n + 0.01, zc - 0.2], [a - 1.0, n + 0.01, zc + 0.9], [a + 0.2, n + 0.01, zc - 0.3], [a + 0.9, n + 0.01, zc + 0.3], [u1, n + 0.01, zc - 0.6], [u1, n + 0.01, z0]], '#5f8f8a', 0);
  k.poly([[u0, n + 0.02, z0], [u0, n + 0.02, zc - 0.9], [a - 0.4, n + 0.02, zc - 0.5], [u1, n + 0.02, zc - 1.0], [u1, n + 0.02, z0]], '#4a7a62', 0);
  k.poly([[u0, n + 0.03, z0], [u1, n + 0.03, z0], [u1, n + 0.03, zc - 1.25], [u0, n + 0.03, zc - 1.15]], '#6fb0b8', 0);
  k.line([[a - 0.2, n + 0.04, zc - 1.45], [a + 1.2, n + 0.04, zc - 1.45]], withAlpha('#ffffff', 0.5), Math.max(0.6, 0.08 * k.s));
  pen.restore();
  pen.beginPath();
  k.trace(pic);
  k.paint(null, k.thin);
}

// A mural of the world up top as it was, painted like a travel poster in a
// chrome frame with rounded corners: a big orange sun rising with cream
// rays behind stepped red mesas, a teal river winding out of them across a
// sandy valley, two round clouds in a pale sky; no words on it.
function muralArt(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const zc = midZ(v.H) + 0.5;
  const a = f.a;
  const hw = f.w / 2 - 0.3;
  const hh = 4.5;
  if (!k.sees(a - hw - 1, 0, zc - hh - 2, a + hw + 1, 1, zc + hh + 1)) return;
  k.shadow(a + 0.3, 0.1, hw, 0.6, 0.2, zc - hh - 0.2);
  const n = 0.35;
  const outer = rrect(a, n, zc, hw, hh, 1.4);
  fillPts(k, hull([...rrect(a, 0, zc, hw, hh, 1.4), ...outer].map(([u, w, z]) => k.p(u, w, z))), shade(C.chrome, -0.32), k.lw);
  k.poly(outer, C.chrome, k.lw);
  const iw = hw - 0.55;
  const ih = hh - 0.55;
  const m = n + 0.01;
  const pic = rrect(a, m, zc, iw, ih, 0.9);
  const U = (f: number) => a + f * iw; // across, -1..1
  const zh = zc - ih * 0.12; // the horizon
  const zb = zc - ih - 0.1;
  pen.save();
  pen.beginPath();
  k.trace(pic);
  pen.clip();
  // the sky, and the sun's rays fanning up from behind the mesas
  k.poly(pic, k.vgrad(a, m, zh, zc + ih, [[0, '#f6e6c4'], [0.45, '#bfe6dc'], [1, '#7fd0d0']]), 0);
  const su = U(0.22);
  const sz = zh + 1.1;
  pen.beginPath();
  for (let i = 0; i < 9; i++) {
    const t0 = Math.PI * (i / 9) + 0.04;
    const t1 = t0 + Math.PI / 18;
    k.trace([[su, m, sz], [su + Math.cos(t0) * 14, m, sz + Math.sin(t0) * 14], [su + Math.cos(t1) * 14, m, sz + Math.sin(t1) * 14]]);
  }
  pen.fillStyle = withAlpha('#fff6dc', 0.55);
  pen.fill();
  // round clouds
  for (const [cu, cz] of [[U(-0.62), zc + ih * 0.6], [U(0.7), zc + ih * 0.42]]) {
    for (const [du, dz, r] of [[-0.7, 0, 0.55], [0, 0.3, 0.75], [0.75, 0, 0.5]] as const) k.face(cu + du, m + 0.01, cz + dz, r, '#fbf6e8', 0, 16);
    k.line([[cu - 1.2, m + 0.02, cz - 0.42], [cu + 1.2, m + 0.02, cz - 0.42]], withAlpha('#9ccfc8', 0.8), Math.max(0.6, 0.08 * s));
  }
  // the sun
  k.face(su, m + 0.02, sz, 2.0, C.orange, k.thin, 24);
  k.face(su - 0.35, m + 0.03, sz + 0.35, 1.2, '#f6a25a', 0, 18);
  // the valley floor, then the far mesas, low in the middle so the sun
  // shows between them
  k.poly([[U(-1.1), m + 0.03, zh], [U(1.1), m + 0.03, zh], [U(1.1), m + 0.03, zb], [U(-1.1), m + 0.03, zb]], k.vgrad(a, m, zb, zh, [[0, '#c99a58'], [1, '#e6c48a']]), 0);
  const far: Array<[number, number]> = [[-1.1, 0.9], [-0.8, 0.9], [-0.76, 1.7], [-0.5, 1.7], [-0.46, 0.7], [-0.08, 0.7], [-0.04, 0.3], [0.5, 0.3], [0.54, 1.2], [0.64, 1.2], [0.68, 2.1], [0.9, 2.1], [0.94, 1.0], [1.1, 1.0]];
  k.poly([[U(1.1), m + 0.04, zh - 0.05], [U(-1.1), m + 0.04, zh - 0.05], ...far.map(([u, z]): P3 => [U(u), m + 0.04, zh + z])], '#c8794a', k.thin);
  // the river from the sun's foot, widening toward us
  const left: P3[] = [];
  const right: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const cu = su - t * iw * 0.35 + Math.sin(t * 5) * 0.9 * t;
    const w = 0.12 + t * 1.5;
    const z = zh - t * (zh - zb);
    left.push([cu - w, m + 0.05, z]);
    right.push([cu + w, m + 0.05, z]);
  }
  k.poly([...left, ...right.reverse()], C.teal, k.thin);
  k.line(left.slice(3).map(([u, w, z]): P3 => [u + 0.45, w + 0.01, z]), withAlpha('#bfe6dc', 0.8), Math.max(0.6, 0.1 * s));
  // the near mesas at the sides, darker
  k.poly([[U(-1.1), m + 0.06, zb], [U(-1.1), m + 0.06, zh + 2.6], [U(-0.84), m + 0.06, zh + 2.6], [U(-0.8), m + 0.06, zh + 1.3], [U(-0.64), m + 0.06, zh + 1.3], [U(-0.6), m + 0.06, zh - 0.5], [U(-0.42), m + 0.06, zh - 0.7], [U(-0.34), m + 0.06, zb]], '#a85a34', k.thin);
  k.poly([[U(1.1), m + 0.06, zb], [U(1.1), m + 0.06, zh + 0.9], [U(0.8), m + 0.06, zh + 0.9], [U(0.76), m + 0.06, zh - 0.3], [U(0.56), m + 0.06, zh - 0.55], [U(0.48), m + 0.06, zb]], '#a85a34', k.thin);
  k.segs([[[U(-1.1), m + 0.07, zh + 2.45], [U(-0.84), m + 0.07, zh + 2.45]], [[U(-0.8), m + 0.07, zh + 1.15], [U(-0.64), m + 0.07, zh + 1.15]], [[U(0.8), m + 0.07, zh + 0.75], [U(1.1), m + 0.07, zh + 0.75]]], withAlpha('#e6a070', 0.8), Math.max(0.6, 0.14 * s));
  pen.restore();
  pen.beginPath();
  k.trace(pic);
  k.paint(null, k.thin);
  k.line(rrect(a, n + 0.02, zc, hw - 0.2, hh - 0.2, 1.2).slice(5, 13), withAlpha('#ffffff', 0.6), Math.max(0.6, 0.1 * s));
  // a chrome picture lamp over it on two arms, its light down the
  // painting while the lights are on
  const zl = zc + hh + 0.9;
  for (const du of [-hw * 0.45, hw * 0.45]) k.rod([[a + du, 0.05, zl + 0.6], [a + du, 1.3, zl + 0.2]], C.steelDark, 0.14);
  k.box(a - hw * 0.62, 0.9, zl - 0.25, hw * 1.24, 0.9, 0.55, C.chrome, { line: k.thin, round: 0.25 });
  if (lampsOn(v)) {
    k.wash(a, n + 0.05, zc + hh * 0.35, hw * 0.95, hh * 1.1, '#fff3d8', 0.28);
    k.line([[a - hw * 0.55, 1.35, zl - 0.3], [a + hw * 0.55, 1.35, zl - 0.3]], '#fff8e0', Math.max(0.8, 0.14 * s));
  }
}

// A starburst wall clock: brass spikes round a cream face, balls on the
// long ones, two hands and ticks (no digits).
function clockArt(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  const z = midZ(v.H) + 1.5;
  const r = 1.2;
  if (!k.sees(a - 3, 0, z - 3, a + 3, 1, z + 3)) return;
  k.shadow(a + 0.2, 0.1, 2.2, 0.5, 0.18, z - 2.4);
  const spikes: Array<[P3, P3]> = [];
  const balls: P3[] = [];
  for (let i = 0; i < 12; i++) {
    const th = (i / 12) * Math.PI * 2 + Math.PI / 12;
    const L = i % 2 ? 2.0 : 2.6;
    spikes.push([[a + Math.cos(th) * r, 0.12, z + Math.sin(th) * r], [a + Math.cos(th) * L, 0.12, z + Math.sin(th) * L]]);
    if (!(i % 2)) balls.push([a + Math.cos(th) * L, 0.13, z + Math.sin(th) * L]);
  }
  k.segs(spikes, INK, 0.16 * k.s + k.lw, 'round');
  k.segs(spikes, C.brass, 0.16 * k.s, 'round');
  for (const [u, n, zz] of balls) k.face(u, n, zz, 0.22, C.orange, k.thin, 10);
  k.face(a, 0.15, z, r + 0.16, shade(C.brass, -0.1), k.lw, 24);
  k.face(a, 0.2, z, r, C.cream, 0, 24);
  const ticks: Array<[P3, P3]> = [];
  for (let i = 0; i < 4; i++) {
    const th = (i / 4) * Math.PI * 2;
    ticks.push([[a + Math.cos(th) * r * 0.62, 0.22, z + Math.sin(th) * r * 0.62], [a + Math.cos(th) * r * 0.82, 0.22, z + Math.sin(th) * r * 0.82]]);
  }
  k.segs(ticks, INK, Math.max(0.6, 0.08 * k.s));
  const hr = Math.PI / 2 - hash(f.k, 91) * Math.PI * 2;
  const mn = Math.PI / 2 - hash(f.k, 92) * Math.PI * 2;
  k.line([[a, 0.24, z], [a + Math.cos(hr) * r * 0.45, 0.24, z + Math.sin(hr) * r * 0.45]], INK, Math.max(0.9, 0.14 * k.s));
  k.line([[a, 0.25, z], [a + Math.cos(mn) * r * 0.7, 0.25, z + Math.sin(mn) * r * 0.7]], INK, Math.max(0.8, 0.09 * k.s));
  k.face(a, 0.26, z, 0.12, C.orange, 0, 10);
  if (k.fine) k.line([[a - r * 0.5, 0.27, z + r * 0.1], [a - r * 0.1, 0.27, z + r * 0.55]], withAlpha('#ffffff', 0.6), 0.12 * k.s);
}

// A square louvred vent with a frame and four screws.
function ventArt(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  const r = 1.75;
  const z = midZ(v.H) + (hash(f.k, 81) < 0.5 ? -1 : 2.5);
  if (!k.sees(a - 2, 0, z - r - 2, a + 2, 1, z + r + 1)) return;
  k.shadow(a, 0.2, r + 0.3, 0.6, 0.18, z - r - 0.2);
  k.box(a - r, 0, z - r, 2 * r, 0.4, 2 * r, C.steelLight, { line: k.lw, stripe: false });
  k.rect(a - r + 0.35, z - r + 0.35, a + r - 0.35, z + r - 0.35, 0.41, '#202822');
  for (let zz = z - r + 0.7; zz < z + r - 0.4; zz += 0.62) {
    k.poly([[a - r + 0.35, 0.42, zz], [a + r - 0.35, 0.42, zz], [a + r - 0.35, 0.6, zz + 0.38], [a - r + 0.35, 0.6, zz + 0.38]], k.side(C.steel, 0, 1, 0.1), 0);
    k.line([[a - r + 0.35, 0.6, zz + 0.38], [a + r - 0.35, 0.6, zz + 0.38]], withAlpha('#e6eee8', 0.6), Math.max(0.6, 0.07 * k.s));
  }
  if (k.fine) for (const [du, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) k.disc(a + du * (r - 0.2), 0.42, z + dz * (r - 0.18), 0.1, C.rivet, 0);
  k.poly([[a - r, 0.01, z - r - 1.6], [a + r, 0.01, z - r - 1.6], [a + r, 0.01, z - r], [a - r, 0.01, z - r]], k.vgrad(a, 0, z - r - 1.6, z - r, [[0, '#0a0d0a00'], [1, '#0a0d0a30']]), 0);
}

// A fuse box: a steel cabinet with an amber-striped door, a lever down its
// side, an indicator lamp and a conduit up to the pipes along the top.
function fuseArt(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  const w = 3.6;
  const z0 = midZ(v.H) - 3;
  const h = 5.2;
  if (!k.sees(a - f.w / 2, 0, z0 - 1, a + f.w / 2, 2, topPipe(v.H) + 1)) return;
  k.rod([[a - 0.8, 0.5, z0 + h], [a - 0.8, 0.5, topPipe(v.H) + 0.7]], C.steelDark, 0.22);
  k.shadow(a, 0.4, w * 0.6, 0.8, 0.2, z0 - 0.3);
  k.box(a - w / 2, 0, z0, w, 1.0, h, C.steel, { line: k.lw });
  const on = k.lit(0, 1);
  hazard(k, a - w / 2 + 0.35, z0 + 0.35, a + w / 2 - 0.35, z0 + h - 0.35, 1.01, k.thin, on, 0.55);
  // a plain plate on the door (no lettering) and the latch
  k.rect(a - 0.8, z0 + h - 1.6, a + 0.8, z0 + h - 0.8, 1.03, on ? C.cream : shade(C.cream, -0.14), k.thin);
  k.box(a + w / 2 - 0.85, 1.0, z0 + h / 2 - 0.35, 0.4, 0.25, 0.7, C.chrome, { line: k.thin, stripe: false });
  // the lever on its side, thrown up
  const lu = a + w / 2 + 0.15;
  k.box(lu - 0.1, 0.2, z0 + 1.2, 0.3, 0.7, 1.4, C.steelDark, { line: k.thin, stripe: false });
  k.rod([[lu + 0.05, 0.6, z0 + 1.9], [lu + 0.2, 0.6, z0 + 3.9]], C.chrome, 0.16);
  k.disc(lu + 0.2, 0.6, z0 + 4.1, 0.22, C.red, k.thin);
  // the indicator over it
  k.halo(a + 1.2, 1.0, z0 + h + 0.6, 1.2, C.radar, 0.4);
  k.box(a + 0.9, 0.2, z0 + h, 0.6, 0.6, 0.6, C.steelDark, { line: k.thin, stripe: false });
  k.disc(a + 1.2, 0.5, z0 + h + 0.62, 0.22, C.radar, k.thin);
}

// An amber plate with rounded corners, a black border and the plain
// three-bladed radiation sign on it.
function signArt(k: Kit, v: RoomView, f: Feature): void {
  const a = f.a;
  const z = midZ(v.H) + 1;
  const r = 1.55;
  if (!k.sees(a - r - 0.5, 0, z - r - 1, a + r + 0.5, 1, z + r + 0.5)) return;
  k.shadow(a + 0.2, 0.1, r, 0.4, 0.18, z - r - 0.2);
  const n = 0.22;
  const plate = rrect(a, n, z, r, r, 0.45);
  const back = rrect(a, 0, z, r, r, 0.45).map(([u, w, zz]) => k.p(u, w, zz));
  fillPts(k, hull([...back, ...plate.map(([u, w, zz]) => k.p(u, w, zz))]), shade(C.hazard, -0.45), k.lw);
  k.poly(plate, k.side(C.hazard, 0, 1, 0.12), k.lw);
  k.line([...rrect(a, n + 0.01, z, r - 0.3, r - 0.3, 0.3), rrect(a, n + 0.01, z, r - 0.3, r - 0.3, 0.3)[0]], C.black, Math.max(0.7, 0.12 * k.s));
  const R = r * 0.68;
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 3; i++) {
    const t0 = Math.PI / 2 + (i * 2 * Math.PI) / 3 - Math.PI / 6;
    const pts: P3[] = [];
    for (let j = 0; j <= 6; j++) {
      const t = t0 + (j / 6) * (Math.PI / 3);
      pts.push([a + Math.cos(t) * R, n + 0.02, z + Math.sin(t) * R]);
    }
    for (let j = 6; j >= 0; j--) {
      const t = t0 + (j / 6) * (Math.PI / 3);
      pts.push([a + Math.cos(t) * R * 0.3, n + 0.02, z + Math.sin(t) * R * 0.3]);
    }
    k.trace(pts);
  }
  pen.fillStyle = C.black;
  pen.fill();
  k.face(a, n + 0.02, z, R * 0.18, C.black, 0, 12);
}

// ── the shell's edges: the earth round the shelter ───────────────────────────

// The ground the shelter is dug into, seen where the room is cut away:
// bands of soil, ochre and red clay a few units deep with wavy feet (the same
// bands at every cut, so they meet at the front corners), stones bedded in
// them and a root near the top. The shelter is a concrete shell in it: the
// walls' last CRETE units, faced inside with the steel plate, and the slab
// under the deck; the wall tops show the soil over the concrete.
const STRATA = ['#5b4a3a', '#8a6c4a', '#463a2e', '#9a7a52', '#3e3329', '#6e5c48', '#7a5038'];
const SOIL = '#6b5440';
const STONE = '#8a8478';
const CONCRETE = '#8f918a';
const CRETE = 2; // the walls' concrete, thick
const SLAB_C = 1.2; // the slab's concrete under the deck

// The bands from the top of the cut down: each one's top and colour (the
// next one's top its foot), no colour twice running.
function strata(H: number): Array<{ z: number; c: Color }> {
  const out: Array<{ z: number; c: Color }> = [];
  let last = -1;
  for (let i = 0, z = H; z > -SLAB; i++) {
    const c = (last + 1 + Math.floor(hash(i, 43) * (STRATA.length - 1))) % STRATA.length;
    out.push({ z, c: STRATA[c] });
    last = c;
    z -= 2 + hash(i, 41) * 2;
  }
  return out;
}

// A band's top at `a` along a cut: wavy, but the cut's top is level.
const topOf = (b: { z: number }, i: number, a: number) => (i === 0 ? b.z : b.z + 0.4 * Math.sin(a * 0.7 + i * 1.9));

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  cut(k, v, 'y');
  cut(k, v, 'x');
  // the wall tops: soil over the concrete, pebbles in it, a lit lip on the
  // outer edge
  if (k.sees(0, 0, H, W, D, H, 6)) {
    k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], SOIL, k.lw);
    const pebbles: P3[] = [];
    for (const right of [true, false]) {
      const end = right ? W : D;
      for (let i = 0; 1 + i * 1.9 < end - 1; i++) {
        const a = 1 + i * 1.9 + hash(i, right ? 1 : 2, 97) * 1.2;
        const b = 0.6 + hash(i, right ? 1 : 2, 98) * (T - CRETE - 1.2);
        pebbles.push(right ? [a, b, H] : [b, a, H]);
      }
    }
    const { pen } = k;
    pen.beginPath();
    for (const [x, y, z] of pebbles) {
      const [px, py] = k.p(x, y, z);
      const r = Math.max(0.7, 0.16 * k.s);
      pen.moveTo(px + r * 1.4, py);
      pen.ellipse(px, py, r * 1.4, r * 0.8, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = shade(STONE, -0.1);
    pen.fill();
    k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], '#8a7056', Math.max(1, 0.2 * k.s));
    k.poly([[T - CRETE, T - CRETE, H], [W, T - CRETE, H], [W, T, H], [T, T, H], [T, D, H], [T - CRETE, D, H]], CONCRETE, k.thin);
    k.poly([[T - 0.6, T - 0.6, H], [W, T - 0.6, H], [W, T, H], [T, T, H], [T, D, H], [T - 0.6, D, H]], C.steelLight, k.thin);
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

// One side's cut through the earth: the plane y = D (the left wall's end
// and the floor's front edge, `a` along x) or x = W (the right wall's end
// and the floor's right edge, `a` along y); the wall's end 0..T stands to
// the top, the floor's T..end reaches down to -SLAB.
function cut(k: Kit, v: RoomView, plane: 'x' | 'y'): void {
  const { pen, s } = k;
  const { W, D, H, T } = v;
  const end = plane === 'y' ? W : D;
  const P = (a: number, z: number): P3 => (plane === 'y' ? [a, D, z] : [W, a, z]);
  const tone = (c: Color) => (plane === 'y' ? k.side(c, 0, 1, 0.16) : k.side(c, 1, 0, 0.16));
  const face: P3[] = [P(0, -SLAB), P(end, -SLAB), P(end, 0), P(T, 0), P(T, H), P(0, H)];
  const [x0, y0, x1, y1] = plane === 'y' ? [0, D, end, D] : [W, 0, W, end];
  if (!k.sees(x0, y0, -SLAB, x1, y1, H, 6)) return;
  pen.save();
  pen.beginPath();
  k.trace(face);
  pen.clip();
  // the bands (those above the floor only across the wall's end), a dark
  // line along each one's top
  const bands = strata(H);
  const tops: P3[][] = [];
  for (const [i, b] of bands.entries()) {
    const foot = bands[i + 1];
    const a1 = foot && foot.z > 0.5 ? T : end;
    const top: P3[] = [];
    for (let a = 0; a < a1 + 1; a++) top.push(P(Math.min(a, a1), topOf(b, i, Math.min(a, a1))));
    const bottom: P3[] = [];
    for (let a = a1 + 1; a > -1; a--) bottom.push(P(Math.max(0, Math.min(a, a1)), foot ? topOf(foot, i + 1, Math.max(0, Math.min(a, a1))) : -SLAB - 1));
    k.poly([...top, ...bottom], tone(b.c), 0);
    if (i) tops.push(top);
  }
  for (const t of tops) k.line(t, withAlpha(INK, 0.3), Math.max(0.6, 0.08 * s));
  // stones bedded in the earth (the concrete is laid over any it meets),
  // a lit top on each
  const n = Math.round(((T - CRETE) * (H + SLAB) + (end - T) * (SLAB - SLAB_C)) / 10);
  const salt = plane === 'y' ? 3 : 4;
  const stones: P3[][] = [];
  const lips: P3[][] = [];
  for (let i = 0; i < n; i++) {
    const wall = hash(i, 45, salt) < ((T - CRETE) * (H + SLAB)) / ((T - CRETE) * (H + SLAB) + (end - T) * (SLAB - SLAB_C));
    const a = wall ? 0.3 + hash(i, 46, salt) * (T - CRETE - 0.6) : T + 1 + hash(i, 46, salt) * (end - T - 2);
    const z = wall ? -SLAB + 0.4 + hash(i, 47, salt) * (H + SLAB - 1.4) : -SLAB + 0.5 + hash(i, 47, salt) * (SLAB - SLAB_C - 1);
    const ra = wall ? 0.6 + hash(i, 48, salt) * 0.8 : 0.5 + hash(i, 48, salt) * 0.7;
    const rz = ra * (0.5 + hash(i, 49, salt) * 0.25);
    const ring: P3[] = [];
    for (let j = 0; j < 12; j++) {
      const t = (j / 12) * Math.PI * 2;
      const w = 1 + (hash(i, j, 50 + salt) - 0.5) * 0.25;
      ring.push(P(a + Math.cos(t) * ra * w, z + Math.sin(t) * rz * w));
    }
    stones.push(ring);
    const lip: P3[] = [];
    for (let j = 0; j <= 6; j++) {
      const t = Math.PI * (0.15 + (j / 6) * 0.7);
      lip.push(P(a + Math.cos(t) * ra * 0.75, z + Math.sin(t) * rz * 0.7));
    }
    lips.push(lip);
  }
  pen.beginPath();
  for (const q of stones) k.trace(q, 0.3);
  pen.fillStyle = tone(STONE);
  pen.fill();
  pen.strokeStyle = INK;
  pen.lineWidth = k.thin;
  pen.lineJoin = 'round';
  pen.stroke();
  if (s >= 3) for (const q of lips) k.line(q, tone('#a8a296'), Math.max(0.6, 0.1 * s));
  // a root down from the top
  if (s >= 3) {
    const ra = 0.8 + hash(salt, 51) * (T - CRETE - 1.8);
    const root: P3[] = [];
    for (let j = 0; j <= 10; j++) root.push(P(ra + Math.sin(j * 1.3 + salt) * 0.35, H - 0.2 - j * 0.4));
    k.line(root, tone('#8a6a44'), Math.max(0.7, 0.12 * s));
    k.line([root[4], P(ra + 0.9, H - 2.6), P(ra + 1.1, H - 3.4)], tone('#8a6a44'), Math.max(0.6, 0.07 * s));
  }
  // the concrete shell: the wall's inner CRETE units and the slab under
  // the deck, lines where its forms were tied
  k.poly([P(T - CRETE, -SLAB_C), P(end, -SLAB_C), P(end, 0), P(T, 0), P(T, H), P(T - CRETE, H)], tone(CONCRETE), k.thin);
  const ties: Array<[P3, P3]> = [];
  for (let z = 4; z < H - 1; z += 6) ties.push([P(T - CRETE + 0.2, z), P(T - 0.8, z)]);
  k.segs(ties, withAlpha('#2c302a', 0.35), Math.max(0.6, 0.08 * s));
  // the steel facing on the room side, mint at the foot, and the deck's
  // tiles on the slab
  k.poly([P(T - 0.6, 0), P(T, 0), P(T, H), P(T - 0.6, H)], tone(mix(C.steel, CONCRETE, 0.3)), 0);
  k.poly([P(T - 0.6, 0), P(T, 0), P(T, DADO), P(T - 0.6, DADO)], tone(shade(C.mint, -0.2)), 0);
  k.poly([P(T - 0.6, 0), P(end, 0), P(end, -0.35), P(T - 0.6, -0.35)], tone(C.deckDark), 0);
  pen.restore();
  pen.beginPath();
  k.trace(face);
  k.paint(null, k.lw);
}

// ── per frame ────────────────────────────────────────────────────────────────

// A capsule light's hum or flicker and the dust in its light. Each is on
// nearly all the time (a soft cool glow round it); the wild one goes dim or
// off for a few frames at moments of its own. Under each a few pale motes
// drift slowly down and wrap.
function flicker(k: Kit, v: RoomView, f: Feature, wild: boolean): void {
  const z = capZ(v.H);
  if (!k.sees(f.a - 4, 0, z - 14, f.a + 4, 5, z + 5)) return;
  const h = hash(f.k, Math.floor(v.t * 8), 5);
  const state = wild ? (h < 0.12 ? 'off' : h < 0.26 ? 'dim' : 'on') : h < 0.015 ? 'dim' : 'on';
  if (state === 'on') {
    k.halo(f.a, 1.0, z, 3.4, '#e8fff4', 0.24 + 0.05 * Math.sin(v.t * 40 + f.k));
    k.halo(f.a, 0.9, z, 1.2, '#ffffff', 0.2);
  } else {
    lens(k, f.a, z, state === 'dim' ? '#b8d0c4' : '#8a9a92', state === 'dim' ? '#7f948a' : '#5f6d66');
    if (state === 'dim') for (const dz of [-CAP_H / 2 + 0.8, CAP_H / 2 - 0.8]) k.halo(f.a, 0.9, z + dz, 1.0, '#e8fff4', 0.35);
  }
  // dust drifting down through the light, wrapping at the bottom
  const n = 5 + Math.floor(hash(f.k, 7) * 4);
  const fall = 10;
  for (let i = 0; i < n; i++) {
    const sp = 0.35 + hash(f.k, i, 11) * 0.45;
    const ph = (v.t * sp / fall + hash(f.k, i, 12)) % 1;
    const dz = ph * fall;
    const du = (hash(f.k, i, 13) - 0.5) * 5 + Math.sin(v.t * 0.7 + i * 2.1) * 0.5;
    const out = 1.4 + hash(f.k, i, 14) * 2.2;
    const fade = Math.min(1, ph * 6, (1 - ph) * 3);
    const a = (state === 'off' ? 0.25 : 0.6) * fade;
    if (a > 0.02) mote(k, f.a + du, out, z - 2.5 - dz, 0.09 + hash(f.k, i, 15) * 0.06, a);
  }
}

// Steam let off the bundle's valves now and then: a puff of a few soft
// wisps rising and spreading off the wheel, each valve on its own clock.
function steam(k: Kit, v: RoomView, wall: Wall): void {
  const end = wall === 'right' ? v.W : v.D;
  const z = topPipe(v.H) + 3.6;
  valvesOn(v.T, end).forEach((a, i) => {
    const salt = i * 2 + (wall === 'right' ? 0 : 1);
    const period = 4.5 + hash(salt, 17) * 3;
    const ph = (v.t + hash(salt, 18) * period) % period;
    if (ph > 2.6) return;
    if (!k.sees(a - 4, 0, z - 1, a + 4, 5, z + 7)) return;
    for (let j = 0; j < 7; j++) {
      const p = (ph - j * 0.17) / 1.6;
      if (p < 0 || p > 1) continue;
      const [x, y] = k.p(a + 0.8 + (hash(salt, j, 19) - 0.3) * p * 2.2, 2.4 + p * 1.4, z + 0.3 + p * 4.2);
      softDot(k.pen, x, y, (0.9 + p * 1.5) * k.s, '#ffffff', 1 - p * 0.75, 'source-over');
    }
  });
}
