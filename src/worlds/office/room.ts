import { Canvas } from '../../art/canvas.ts';
import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { planLayout, slotRect, slotsOn, wallGaps } from '../../world/layout.ts';
import { defaultPois, footprint, planRoom, toWorld } from '../../world/room.ts';
import type { PlacedProp } from '../../world/room.ts';
import { hashString } from '../../world/rng.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import type { PropArt, RoomArt, RoomView, WorldDef } from '../types.ts';
import { dome, hull, succulent } from './bits.ts';
import { DECOR, DECOR_ART } from './decor.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, circle, hash, withAlpha } from './kit.ts';
import { STATIONS } from './stations.ts';

// The Startup's shell, a loft at dusk: polished concrete in big slabs with
// sawn joints, a warm wood-plank corner under the kitchen island and its
// stools, a flat-woven rug in the meeting corner and a round one in the
// reading nook; walls of exposed red brick in running bond over a dark
// baseboard, a black steel I-beam along the top of each with a galvanised
// duct run under it. In the free stretches between the stations: big
// black-framed industrial windows onto a city skyline turning on its
// lights (a soldier course over each, a deep brick sill), framed abstract
// prints and a cork board, one neon squiggle on a black plate, a bike hung
// on a rack, and pendant lamps hung from the beam between them, their warm
// light pooled on the bricks and the floor. The windows' light lies on the
// concrete in front of them. Every piece sits where the stage's plan
// leaves the wall free, clear of the tall furniture stood against it.
// The overlay drifts clouds past the windows, turns the city's lights on
// and off and lets the neon breathe.

type Wall = 'left' | 'right';
type Kind = 'window' | 'art' | 'neon' | 'bike' | 'pendant';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[] };

// How many of each the room may have, counted over both walls.
export const CAP = { art: 3, neon: 1, bike: 1 } as const;

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const BASE = 1.0; // the baseboard's height
const BEAM = 2.6; // the I-beam along the top of the wall
const COURSE = 1.2; // a course of brick
const BRICK = 3.0; // a brick's length
const JOINT = 16; // the concrete's sawn joints
const PLANK = 2.4; // a floor plank's width
const DEPTH = 1.0; // the windows' glass, set back in the wall
const WIDTH: Record<Kind, number> = { window: 12, art: 5, neon: 7, bike: 10, pendant: 3 };
export const GAP = 4;
// Between two pieces, room for a pendant lamp with GAP either side of it.
const BAY = GAP + WIDTH.pendant + GAP;
// The furniture stood against a wall that the wall's pieces mind (SIDE
// clear of it): solid pieces over a window's sill (LOW: the booth, the
// snack shelf, the fridge, the desks) split the wall's stretches; slim ones
// (a fig, a standing lamp) may stand before a window or the neon, never a
// print or the bike. Lower ones (a potted plant, the sofa) stand under all
// of them.
const LOW = 6;
const SIDE = 1.5;
const SLIM = new Set<PropArt>([DECOR_ART.fig, DECOR_ART.lamp]);
// The pieces a slim piece of furniture may not stand before.
const PICKY = new Set<Kind>(['art', 'bike']);

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// the furniture it stands along the walls (planRoom seeded by the world's
// id, as the stage furnishes it), and what hangs on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'office');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const decor = L.slots.length ? planRoom({ id: 'office', stations: STATIONS, decor: DECOR } as unknown as WorldDef, L, hashString('office')).props.filter((p) => !p.slot) : [];
  const plan = { L, features: features(L, decor) };
  PLANS.set(key, plan);
  return plan;
}

type Span = { wall: Wall; a0: number; a1: number; slim: Array<[number, number]> };

// A wall's free stretches for its pieces: between the stations (2.5 clear
// of them, 2 of the corner and the cut end) and the solid furniture stood
// against it, each with the slim furniture standing in it.
function stretches(L: Layout, wall: Wall, decor: readonly PlacedProp[]): Span[] {
  const end = wall === 'right' ? L.W : L.D;
  let out: Array<[number, number]> = wallGaps(L, wall).map(([g0, g1]) => [g0 + (g0 <= L.T ? 2 : 2.5), Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5)]);
  const slim: Array<[number, number]> = [];
  for (const p of decor) {
    const r = footprint(p);
    const [n0, b0, b1] = wall === 'right' ? [r.y0, r.x0, r.x1] : [r.x0, r.y0, r.y1];
    if (n0 > L.T + 2) continue;
    if (SLIM.has(p.art)) slim.push([b0 - SIDE, b1 + SIDE]);
    else if (p.art.height > LOW) {
      out = out.flatMap(([a0, a1]): Array<[number, number]> => (b1 + SIDE <= a0 || b0 - SIDE >= a1 ? [[a0, a1]] : [[a0, b0 - SIDE], [b1 + SIDE, a1]]));
    }
  }
  return out.filter(([a0, a1]) => a1 - a0 >= WIDTH.pendant).map(([a0, a1]) => ({ wall, a0, a1, slim: slim.filter(([b0, b1]) => b1 > a0 && b0 < a1) }));
}

// The pieces of `kinds` spread along a stretch, a bay between neighbours
// and what is left over shared out evenly between the bays and the ends,
// in the order that keeps the prints and the bike clear of the slim
// furniture with the windows least behind it (the given order first among
// equals); null if no order does.
function arrange(s: Span, kinds: readonly Kind[]): Array<{ kind: Kind; a: number }> | null {
  const used = kinds.reduce((m, k) => m + WIDTH[k], 0) + (kinds.length - 1) * BAY;
  const e = (s.a1 - s.a0 - used) / (kinds.length + 1);
  if (e < 0) return null;
  let best: Array<{ kind: Kind; a: number }> | null = null;
  let cost = Infinity;
  for (const order of orders(kinds)) {
    let at = s.a0 + e;
    let c = 0;
    const out = order.map((kind) => {
      const p = { kind, a: at + WIDTH[kind] / 2 };
      for (const [b0, b1] of s.slim) {
        const over = Math.min(b1, at + WIDTH[kind]) - Math.max(b0, at);
        if (over > 0) c += PICKY.has(kind) ? Infinity : over;
      }
      at += WIDTH[kind] + BAY + e;
      return p;
    });
    if (c < cost) {
      cost = c;
      best = out;
    }
  }
  return best;
}

// Every distinct order of a few kinds, the given one first.
function orders(kinds: readonly Kind[]): Kind[][] {
  if (kinds.length <= 1) return [[...kinds]];
  const out: Kind[][] = [];
  const seen = new Set<Kind>();
  kinds.forEach((k, i) => {
    if (seen.has(k)) return;
    seen.add(k);
    for (const rest of orders([...kinds.slice(0, i), ...kinds.slice(i + 1)])) out.push([k, ...rest]);
  });
  return out;
}

// What hangs where: a window on each wall first (in its roomiest stretch),
// then the bike, a window in each stretch still bare, the neon, then
// windows and prints by turns while any fits, the prints up to their cap;
// each piece into the stretch it leaves the most room in (one without a
// print, the neon or the bike first, for those), and spread along it (see
// arrange); then the pendant lamps between (see lamps).
function features(L: Layout, decor: readonly PlacedProp[]): Feature[] {
  const spans = (['right', 'left'] as const).flatMap((wall) => stretches(L, wall, decor));
  const kinds: Kind[][] = spans.map(() => []);
  const count: Partial<Record<Kind, number>> = {};
  const capOf = (k: Kind) => (k === 'art' || k === 'neon' || k === 'bike' ? CAP[k] : Infinity);
  const plain = (i: number) => kinds[i].every((k) => k === 'window');
  // puts a k in the stretch with the most room left after it, of those
  // `pick` allows; false if none has room (or k is at its cap)
  const put = (k: Kind, pick: (i: number) => boolean = () => true): boolean => {
    if ((count[k] ?? 0) >= capOf(k)) return false;
    let best = -1;
    let most = -Infinity;
    spans.forEach((s, i) => {
      const next = [...kinds[i], k];
      if (!pick(i) || !arrange(s, next)) return;
      const left = s.a1 - s.a0 - next.reduce((m, q) => m + WIDTH[q], 0) - (next.length - 1) * BAY;
      if (left > most) {
        most = left;
        best = i;
      }
    });
    if (best < 0) return false;
    kinds[best].push(k);
    count[k] = (count[k] ?? 0) + 1;
    return true;
  };
  for (const wall of ['right', 'left'] as const) put('window', (i) => spans[i].wall === wall);
  put('bike', plain) || put('bike');
  while (put('window', (i) => !kinds[i].length));
  put('neon', plain) || put('neon');
  for (let more = true; more; ) {
    more = put('window');
    more = put('art', plain) || put('art') || more;
  }
  const pieces = spans.flatMap((s, si) => (kinds[si].length ? arrange(s, kinds[si])!.map(({ kind, a }, i): Feature => ({ wall: s.wall, kind, a, w: WIDTH[kind], k: si * 10 + i })) : []));
  return [...pieces, ...(['right', 'left'] as const).flatMap((wall) => lamps(L, wall, pieces, decor))];
}

// About this far apart along bare brick, the pendant lamps.
const PITCH = 18;

// The fillers, pendant lamps hung from the beam: one in each bay between
// the pieces, more along bare brick about PITCH apart. A lamp hangs LAMP_N
// out from the wall, so it is seen LAMP_N back along it (and LAMP_N
// lower): where it is seen it keeps GAP clear of every piece (out of the
// clouds' way), in front of no station and over the furniture (none in
// front of a piece reaching up to it, the booth); where it hangs, inside
// the wall and off the stations.
function lamps(L: Layout, wall: Wall, pieces: readonly Feature[], decor: readonly PlacedProp[]): Feature[] {
  const end = wall === 'right' ? L.W : L.D;
  const h = WIDTH.pendant / 2;
  // where a lamp may be seen (its middle), cut down
  let free: Array<[number, number]> = [[L.T + 1 + h, end - 2 - h - LAMP_N]];
  const cut = (x0: number, x1: number) => {
    free = free.flatMap(([f0, f1]): Array<[number, number]> => (x1 <= f0 || x0 >= f1 ? [[f0, f1]] : ([[f0, Math.min(f1, x0)], [Math.max(f0, x1), f1]] as Array<[number, number]>).filter(([p, q]) => q >= p)));
  };
  for (const q of slotsOn(L, wall)) {
    const [s0, s1] = wall === 'right' ? [q.x0, q.x0 + q.len] : [q.y0, q.y0 + q.len];
    cut(s0 - 1.5 - h - LAMP_N, s1 + 1.5 + h);
  }
  for (const g of pieces) if (g.wall === wall) cut(g.a - g.w / 2 - GAP - h, g.a + g.w / 2 + GAP + h);
  for (const p of decor) {
    const r = footprint(p);
    const [n0, n1, b0, b1] = wall === 'right' ? [r.y0, r.y1, r.x0, r.x1] : [r.x0, r.x1, r.y0, r.y1];
    if (n0 <= L.T + 2 && p.art.height > pendantZ(L.H) - LAMP_N - 2) cut(b0 - (n1 - n0) - 1 - h, b1 + 1 + h);
  }
  const out: Feature[] = [];
  for (const [f0, f1] of free) {
    const m = 1 + Math.floor((f1 - f0) / PITCH);
    for (let i = 0; i < m; i++) out.push({ wall, kind: 'pendant', a: f0 + ((f1 - f0) * (i + 0.5)) / m + LAMP_N, w: WIDTH.pendant, k: 200 + out.length });
  }
  return out;
}

// Windows: sill and top (z) for a wall H tall.
function windowZ(H: number): { z0: number; z1: number } {
  return { z0: 7, z1: Math.min(H - 7, 32) };
}

// A pendant's rim (z) on a wall H tall.
export const pendantZ = (H: number) => Math.min(H - 11, 24);
export const LAMP_N = 3.6; // how far out from the wall the pendants hang

// The galvanised duct along the top of each wall: a little under the beam,
// over the windows' heads (smaller on a low wall, with less room between
// them).
const DUCT = { r: 1.3, n: 1.6 };
function ductAt(H: number): { zc: number; r: number } {
  const top = H - BEAM - 0.2;
  const bottom = windowZ(H).z1 + 1.9;
  const r = Math.max(0.6, Math.min(DUCT.r, (top - bottom) / 2));
  return { zc: Math.max(bottom + r, H - BEAM - 2 - r), r };
}

// The neon's plate (z).
const NEON = { z0: 20, z1: 26 };

// ── points of interest ─────────────────────────────────────────────────────
// The defaults (warm either side of the espresso counter, a look at the
// dashboards and the shelves, a dance at the hub, the dog's spot in the
// yard) less their drink by the run prop (a server rack here) and their
// seat out on the floor: coffee at the espresso counter instead, at either
// end of it, seats at two of its stools (just off the island, by the stools
// along its front), and a look out of up to three windows at the city.
const STOOLS = [7.5, 12.4]; // the stools sat at, along the island (see idle in stations.ts)
const STOOL_OUT = 9.7; // the stools' line, out from the island's back

export function officePois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).filter((p) => p.kind !== 'drink' && p.kind !== 'seat');
  const bar = slot('idle');
  if (bar) {
    out.push({ ...at(bar, -4, 0), kind: 'drink', face: mid(bar) });
    out.push({ ...at(bar, 4, 0), kind: 'drink', face: mid(bar) });
    // a step off the footprint (spots inside a prop or a unit of it are dropped)
    const by = Math.max(STOOL_OUT + 2, bar.dep + 1);
    for (const u of STOOLS) {
      const [x, y] = toWorld(bar, u, by, 0);
      out.push({ x, y, kind: 'seat', face: mid(bar) });
    }
  }
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
    shell(k, v);
    v.pen.restore();
  },
  // The scene draws the overlay once through a pen that only measures (to
  // find its pieces: everything is drawn then, so any pen not a canvas gets
  // it all), then once for each piece onto a canvas just that size: there,
  // what lies off the canvas is skipped, so a piece costs its own window,
  // not every one.
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    const clip = v.pen instanceof Canvas;
    const { z1 } = windowZ(v.H);
    const walls = { right: new Kit(v.pen, wallAt(v.at, 'right', v.T), v.s), left: new Kit(v.pen, wallAt(v.at, 'left', v.T), v.s) };
    v.pen.save();
    for (const f of plan.features) {
      const k = walls[f.wall];
      if (f.kind === 'window') {
        if (clip && !k.sees(f.a - f.w / 2, -1, 20, f.a + f.w / 2, 0, z1)) continue;
        skyLife(k, v, f);
      } else if (f.kind === 'neon') {
        if (clip && !k.sees(f.a - f.w / 2, 0, NEON.z0, f.a + f.w / 2, 1, NEON.z1)) continue;
        neonGlow(k, f, 0.18 + 0.1 * (0.5 + 0.5 * Math.sin(v.t * 1.7) * Math.sin(v.t * 0.63 + 1)));
      }
    }
    v.pen.restore();
  },
};

// ── floor ──────────────────────────────────────────────────────────────────

const SLABS = [C.concrete, mix(C.concrete, C.concreteLight, 0.45), mix(C.concrete, C.concreteDark, 0.3), mix(C.concrete, '#b3aa9c', 0.5)];

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  if (!k.sees(T, T, 0, W, D, 0, 8)) return;
  // Big slabs, a tone apiece, one path a tone.
  const byTone: P3[][][] = SLABS.map(() => []);
  for (let y = T, j = 0; y < D; y += JOINT, j++) {
    for (let x = T, i = 0; x < W; x += JOINT, i++) {
      const [x1, y1] = [Math.min(W, x + JOINT), Math.min(D, y + JOINT)];
      if (!k.sees(x, y, 0, x1, y1, 0, 4)) continue;
      byTone[Math.floor(hash(i, j, 3) * SLABS.length)].push([[x, y, 0], [x1, y, 0], [x1, y1, 0], [x, y1, 0]]);
    }
  }
  byTone.forEach((qs, ti) => {
    if (!qs.length) return;
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = SLABS[ti];
    pen.fill();
  });
  // A soft cloud or two of trowel marks in some slabs (big, faint).
  if (s >= 3) {
    for (let j = 0; j * JOINT + T < D; j++) {
      for (let i = 0; i * JOINT + T < W; i++) {
        if (hash(i, j, 5) < 0.55) continue;
        const cx = T + (i + 0.25 + hash(i, j, 6) * 0.5) * JOINT;
        const cy = T + (j + 0.25 + hash(i, j, 7) * 0.5) * JOINT;
        if (cx > W - 2 || cy > D - 2 || !k.sees(cx - 6, cy - 6, 0, cx + 6, cy + 6, 0)) continue;
        k.pool(cx, cy, 5 + hash(i, j, 8) * 3, 3.5 + hash(i, j, 9) * 2, hash(i, j, 10) < 0.5 ? '#ffffff' : '#c9c3b6', 0.12, 0, 'screen');
      }
    }
  }
  // The sawn joints, each with a lit lip.
  const joints: Array<[P3, P3]> = [];
  const lips: Array<[P3, P3]> = [];
  for (let x = T + JOINT; x < W - 0.5; x += JOINT) {
    joints.push([[x, T, 0], [x, D, 0]]);
    lips.push([[x + 0.2, T, 0], [x + 0.2, D, 0]]);
  }
  for (let y = T + JOINT; y < D - 0.5; y += JOINT) {
    joints.push([[T, y, 0], [W, y, 0]]);
    lips.push([[T, y + 0.2, 0], [W, y + 0.2, 0]]);
  }
  k.segs(lips, withAlpha(C.concreteLight, 0.6), Math.max(0.6, 0.1 * s));
  k.segs(joints, withAlpha(C.joint, 0.7), Math.max(0.8, 0.13 * s));
  // The warm plank corner round the kitchen island and its stools.
  const bar = plan.L.slots.find((q) => q.kind === 'idle');
  if (bar) planks(k, v, bar);
  rugs(k, v, plan);
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#1a100a40');
  g.addColorStop(0.3, '#1a100a14');
  g.addColorStop(0.7, '#1a100a00');
  g.addColorStop(1, '#1a100a18');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    if (wk.sees(T, 0, 0, end, 3.5, 0)) wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#1a100a66'], [0.35, '#1a100a22'], [1, '#1a100a00']]), 0);
  }
  // Light on the floor: the evening's light in front of each window (and
  // its long reflection in the polish), warm pools under the pendants, a
  // warm one round the kitchen and the screens' cool glow.
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (f.kind === 'window') {
      const w = f.w - 1;
      if (!wk.sees(f.a - w, 0, 0, f.a + w + 5, 15, 0)) continue;
      pen.save();
      pen.globalCompositeOperation = 'screen';
      const spill = wk.lgrad([0, 0.3, 0], [0, 11, 0], [1, 0, 0], [[0, withAlpha(C.skyLow, 0.42)], [0.45, withAlpha(C.skyLow, 0.2)], [1, withAlpha(C.skyLow, 0)]]);
      wk.poly([[f.a - w / 2, 0.3, 0], [f.a + w / 2, 0.3, 0], [f.a + w / 2 + 4.5, 14, 0], [f.a - w / 2 + 4.5, 14, 0]], spill, 0);
      if (k.fine) {
        // the panes' bars in the light, as darker lines
        const bars: Array<[P3, P3]> = [];
        for (const fu of [1 / 3, 2 / 3]) bars.push([[f.a - w / 2 + w * fu, 0.6, 0], [f.a - w / 2 + w * fu + 4.2, 13.4, 0]]);
        pen.globalCompositeOperation = 'source-over';
        wk.segs(bars, withAlpha('#5a4a40', 0.08), 0.3 * s);
      }
      pen.restore();
    } else if (f.kind === 'pendant') {
      if (wk.sees(f.a - 7, 0, 0, f.a + 7, 10, 0)) wk.pool(f.a, LAMP_N + 0.8, 6, 4.2, C.lamp, 0.24);
    }
  }
  for (const [kind, u, w, r, a, c] of [['idle', 0.5, 0.55, 14, 0.26, C.lamp], ['web', 0.5, 0.7, 8, 0.12, C.screenGlow], ['write', 0.5, 0.9, 7, 0.1, C.screenGlow]] as const) {
    const q = plan.L.slots.find((sl) => sl.kind === kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (qk.sees(q.len * u - r, q.dep * w - r, 0, q.len * u + r, q.dep * w + r, 0)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
}

// The kitchen's floor: the island's footprint grown by 7 on every side,
// on the floor, in warm planks along x, butt joints staggered, a darker
// strip round its edge.
const PLANKS = [C.plank, C.plankLight, mix(C.plank, C.plankDark, 0.5), C.plank, mix(C.plank, C.plankLight, 0.5)];

function planks(k: Kit, v: RoomView, bar: Slot): void {
  const { pen, s } = k;
  const r0 = slotRect(bar);
  const z = { x0: Math.max(v.T, r0.x0 - 7), y0: Math.max(v.T, r0.y0 - 7), x1: Math.min(v.W, r0.x1 + 7), y1: Math.min(v.D, r0.y1 + 7) };
  if (!k.sees(z.x0, z.y0, 0, z.x1, z.y1, 0)) return;
  const h = 0.02;
  const byTone: P3[][][] = PLANKS.map(() => []);
  const seams: Array<[P3, P3]> = [];
  const lit: Array<[P3, P3]> = [];
  for (let y = z.y0, r = 0; y < z.y1 - 0.05; y += PLANK, r++) {
    const y1 = Math.min(z.y1, y + PLANK);
    if (r) seams.push([[z.x0, y, h], [z.x1, y, h]]);
    lit.push([[z.x0, y + 0.25, h], [z.x1, y + 0.25, h]]);
    let x = z.x0 - hash(r, 31) * 9;
    for (let i = 0; x < z.x1; i++) {
      const len = 6 + Math.floor(hash(r, i, 32) * 8);
      const x0 = Math.max(z.x0, x);
      const x1 = Math.min(z.x1, x + len);
      if (x1 - x0 > 0.05) byTone[Math.floor(hash(r, i, 33) * PLANKS.length)].push([[x0, y, h], [x1, y, h], [x1, y1, h], [x0, y1, h]]);
      if (x + len < z.x1 && x + len > z.x0) seams.push([[x + len, y, h], [x + len, y1, h]]);
      x += len;
    }
  }
  byTone.forEach((qs, ti) => {
    if (!qs.length) return;
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = PLANKS[ti];
    pen.fill();
  });
  if (k.fine) k.segs(lit, withAlpha(C.plankLight, 0.55), 0.1 * s);
  k.segs(seams, withAlpha(C.plankDark, 0.9), Math.max(0.7, 0.11 * s));
  // the darker strip round the edge, and its ink
  const e = 0.55;
  const band: P3[][] = [
    [[z.x0, z.y0, h], [z.x1, z.y0, h], [z.x1, z.y0 + e, h], [z.x0, z.y0 + e, h]],
    [[z.x0, z.y1 - e, h], [z.x1, z.y1 - e, h], [z.x1, z.y1, h], [z.x0, z.y1, h]],
    [[z.x0, z.y0, h], [z.x0 + e, z.y0, h], [z.x0 + e, z.y1, h], [z.x0, z.y1, h]],
    [[z.x1 - e, z.y0, h], [z.x1, z.y0, h], [z.x1, z.y1, h], [z.x1 - e, z.y1, h]],
  ];
  pen.beginPath();
  for (const q of band) k.trace(q);
  pen.fillStyle = C.plankDark;
  pen.fill();
  pen.beginPath();
  k.trace([[z.x0, z.y0, h], [z.x1, z.y0, h], [z.x1, z.y1, h], [z.x0, z.y1, h]]);
  k.paint(null, k.thin);
}

// ── walls ──────────────────────────────────────────────────────────────────

// Exposed brick in running bond: a course of bricks a little lighter or
// darker by a hash of their place, pale mortar between, each course's top
// edge catching the light; a dark baseboard along the floor and the beam
// along the top. The wall pieces go on over it, the pendants last.
const TONES = [C.brickLight, C.brickDark, mix(C.brick, C.brickDark, 0.5), mix(C.brick, '#c27a52', 0.6)];

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 3, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.13) => (lit ? c : shade(c, -d));
  const top = H - BEAM;
  const [ax0, ax1] = visibleAlong(k, T, end, 0, H);
  const lo = Math.max(T, ax0 - BRICK);
  const hi = Math.min(end, ax1 + BRICK);
  // the brick's own colour, then the odd bricks in theirs
  k.poly([[lo, 0, BASE], [hi, 0, BASE], [hi, 0, top], [lo, 0, top]], tone(C.brick), 0);
  const seed = wall === 'right' ? 41 : 43;
  const byTone: P3[][][] = TONES.map(() => []);
  const beds: Array<[P3, P3]> = [];
  const heads: Array<[P3, P3]> = [];
  const lips: Array<[P3, P3]> = [];
  for (let r = 0, z0 = BASE; z0 < top - 0.01; r++, z0 += COURSE) {
    const z1 = Math.min(top, z0 + COURSE);
    if (!k.sees(lo, 0, z0, hi, 0.2, z1, 4)) continue;
    if (r) beds.push([[lo, 0, z0], [hi, 0, z0]]);
    lips.push([[lo, 0, z1 - 0.2], [hi, 0, z1 - 0.2]]);
    const off = r & 1 ? BRICK / 2 : 0;
    for (let a = T - off, i = 0; a < end; a += BRICK, i++) {
      const a0 = Math.max(T, a);
      const a1 = Math.min(end, a + BRICK);
      if (a1 < lo || a0 > hi || a1 - a0 < 0.1) continue;
      if (a > T) heads.push([[a, 0, z0], [a, 0, z1]]);
      const h = hash(r, i, seed);
      if (h < 0.42) byTone[Math.floor(h / 0.105)].push([[a0, 0, z0], [a1, 0, z0], [a1, 0, z1], [a0, 0, z1]]);
    }
  }
  byTone.forEach((qs, ti) => {
    if (!qs.length) return;
    pen.beginPath();
    for (const q of qs) k.trace(q);
    pen.fillStyle = tone(TONES[ti]);
    pen.fill();
  });
  if (k.fine) k.segs(lips, withAlpha('#3a1a10', 0.22), 0.14 * s);
  const mortar = tone(C.mortar, 0.18);
  k.segs(beds, withAlpha(mortar, 0.85), Math.max(0.6, 0.17 * s));
  k.segs(heads, withAlpha(mortar, 0.85), Math.max(0.6, 0.15 * s));
  // the wall darkens up toward the beam, out of the lamps' reach, and in
  // the far corner
  k.poly([[lo, 0, BASE], [hi, 0, BASE], [hi, 0, top], [lo, 0, top]], k.vgrad(T, 0, BASE, top, [[0, '#1a0c0600'], [0.45, '#1a0c0608'], [1, '#1a0c0648']]), 0);
  if (k.sees(T, 0, 0, T + 12, 0.5, H)) k.poly([[T, 0, 0], [T + 12, 0, 0], [T + 12, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 12, 0, 0], [[0, '#1a0c0658'], [1, '#1a0c0600']]), 0);
  // the baseboard
  k.box(lo, 0, 0, hi - lo, 0.35, BASE, C.base, { line: k.thin, stripe: false });
  k.line([[lo, 0.36, BASE - 0.12], [hi, 0.36, BASE - 0.12]], withAlpha('#7a6a62', 0.8), Math.max(0.7, 0.1 * s));
  // what hangs on it
  for (const f of plan.features) {
    if (f.wall !== wall || f.kind === 'pendant') continue;
    if (f.kind === 'window') {
      const { z0, z1 } = windowZ(H);
      if (k.sees(f.a - f.w / 2 - 1, 0, z0 - 2, f.a + f.w / 2 + 1, 2, z1 + 2.5)) windowArt(k, v, f, lit);
    } else if (f.kind === 'art') {
      if (k.sees(f.a - f.w / 2, 0, 12, f.a + f.w / 2, 1, 21)) artPiece(k, f);
    } else if (f.kind === 'neon') {
      if (k.sees(f.a - f.w / 2, 0, NEON.z0 - 1, f.a + f.w / 2, 1, NEON.z1 + 1)) neonArt(k, f);
    } else if (f.kind === 'bike') {
      if (k.sees(f.a - f.w / 2, 0, 4.5, f.a + f.w / 2, 2.2, 13)) bikeArt(k, f);
    }
  }
  duct(k, v, wall, lo, hi, end, tone);
  beam(k, v, lo, hi);
  for (const f of plan.features) {
    if (f.wall !== wall || f.kind !== 'pendant') continue;
    if (k.sees(f.a - 8, 0, pendantZ(H) - 10, f.a + 8, LAMP_N + 2, H)) pendant(k, v, f);
  }
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

// The black steel I-beam along the top of the wall: its web against the
// bricks between a top and a bottom flange, bolts along it.
function beam(k: Kit, v: RoomView, lo: number, hi: number): void {
  const zb = v.H - BEAM;
  if (!k.sees(lo, 0, zb, hi, 1.8, v.H)) return;
  k.box(lo, 0, zb + 0.35, hi - lo, 0.8, BEAM - 0.7, C.beam, { line: k.thin, stripe: false });
  k.box(lo, 0, zb, hi - lo, 1.6, 0.38, C.beam, { line: k.thin });
  k.box(lo, 0, v.H - 0.38, hi - lo, 1.6, 0.38, C.beam, { line: k.thin });
  k.line([[lo, 1.62, zb + 0.36], [hi, 1.62, zb + 0.36]], C.beamLight, Math.max(0.7, 0.12 * k.s));
  if (k.fine) {
    k.pen.beginPath();
    for (let a = Math.ceil(lo / 8) * 8 + 2; a < hi - 1; a += 8) {
      for (const dz of [0.85, BEAM - 0.85]) {
        const [x, y] = k.p(a, 0.82, zb + dz);
        k.pen.moveTo(x + 0.13 * k.s, y);
        k.pen.arc(x, y, 0.13 * k.s, 0, Math.PI * 2);
      }
    }
    k.pen.fillStyle = C.beamLight;
    k.pen.fill();
  }
}

// The galvanised duct run along the wall under the beam: a long round
// pipe shaded from its lit top down, seams round it, straps up to the beam,
// its shadow on the bricks; on the left wall it starts in front of the
// right wall's, as if teed into it, and each ends short of the wall's cut
// end with a cap.
const DUCT_TONES: ReadonlyArray<readonly [number, Color]> = [[0, '#d8dce1'], [0.25, '#b3b8bf'], [0.7, '#8a8f97'], [1, '#62676f']];

function duct(k: Kit, v: RoomView, wall: Wall, lo: number, hi: number, end: number, tone: (c: Color, d?: number) => Color): void {
  const { n } = DUCT;
  const { zc, r } = ductAt(v.H);
  const a0 = Math.max(lo, wall === 'left' ? v.T + n + r : v.T);
  const a1 = Math.min(hi, end - 1.2);
  if (a1 - a0 < 1 || !k.sees(a0, 0, zc - r - 1.5, a1, n + r, v.H)) return;
  const { pen, s } = k;
  // its shadow on the bricks
  k.poly([[a0, 0.02, zc - r - 1.6], [a1, 0.02, zc - r - 1.6], [a1, 0.02, zc], [a0, 0.02, zc]], k.vgrad(a0, 0.02, zc - r - 1.6, zc, [[0, '#1a0c0600'], [0.6, '#1a0c0640'], [1, '#1a0c0650']]), 0);
  const sil = hull([...ringX(k, a0, n, zc, r), ...ringX(k, a1, n, zc, r)]);
  pen.beginPath();
  sil.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  k.paint(k.lgrad([a0, n, zc + r], [a0, n + r * 0.7, zc - r], [1, 0, 0], DUCT_TONES.map(([t, c]) => [t, tone(c, 0.08)] as const)), k.lw);
  // the seams round it (their near halves) and a bright line along its top
  const seams: Array<[P3, P3]> = [];
  for (let a = Math.ceil(a0 / 6) * 6 + 1; a < a1 - 0.5; a += 6) {
    for (let i = 0; i < 8; i++) {
      const t0 = -Math.PI / 4 + (i / 8) * Math.PI;
      const t1 = -Math.PI / 4 + ((i + 1) / 8) * Math.PI;
      seams.push([[a, n + r * Math.cos(t0), zc + r * Math.sin(t0)], [a, n + r * Math.cos(t1), zc + r * Math.sin(t1)]]);
    }
  }
  k.segs(seams, withAlpha(INK, 0.4), Math.max(0.6, 0.09 * s));
  k.line([[a0 + 0.3, n + r * 0.35, zc + r * 0.9], [a1 - 0.3, n + r * 0.35, zc + r * 0.9]], withAlpha('#ffffff', 0.4), Math.max(0.6, 0.1 * s));
  // straps up to the beam
  const straps: Array<[P3, P3]> = [];
  for (let a = Math.ceil(a0 / 12) * 12 + 4; a < a1 - 1; a += 12) straps.push([[a, n + r * 0.2, zc + r * 0.95], [a, 0.6, v.H - BEAM]]);
  k.segs(straps, INK, Math.max(1.2, 0.2 * s + k.thin));
  k.segs(straps, C.steelLight, Math.max(0.7, 0.2 * s));
  // the cap on its near end
  const cap = ringX(k, a1, n, zc, r);
  pen.beginPath();
  cap.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  k.paint(k.side('#b3b8c0', 1, 0, 0.16), k.lw);
}

// Screen points round the duct's section at a (the plane u = a).
function ringX(k: Kit, a: number, n: number, zc: number, r: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < 24; i++) {
    const th = (i / 24) * Math.PI * 2;
    out.push(k.p(a, n + Math.cos(th) * r, zc + Math.sin(th) * r));
  }
  return out;
}

// ── rugs ────────────────────────────────────────────────────────────────────
// A flat-woven rug in the meeting corner round the whiteboard, and a round
// one in the reading nook in front of the bookshelf; none over the kitchen's
// planks.
function rugs(k: Kit, v: RoomView, plan: Plan): void {
  const slot = (kind: SlotKind) => plan.L.slots.find((q) => q.kind === kind);
  const bar = slot('idle');
  const kitchen = bar ? slotRect(bar) : null;
  const clear = (x0: number, y0: number, x1: number, y1: number) => {
    if (x0 < v.T + 0.5 || y0 < v.T + 0.5 || x1 > v.W - 1 || y1 > v.D - 1) return false;
    return !kitchen || x1 < kitchen.x0 - 7.5 || x0 > kitchen.x1 + 7.5 || y1 < kitchen.y0 - 7.5 || y0 > kitchen.y1 + 7.5;
  };
  const world = (q: Slot, u: number, w: number): [number, number] => (q.wall === 'right' ? [q.x0 + u, q.y0 + w] : [q.x0 + w, q.y0 + u]);
  const think = slot('think');
  if (think) {
    const [u0, w0, u1, w1] = [-2.5, -1.5, think.len + 2.5, think.dep + 3.5];
    const [x0, y0] = world(think, u0, w0);
    const [x1, y1] = world(think, u1, w1);
    if (clear(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1))) {
      const tk = new Kit(k.pen, frame(v.at, think.wall, think.x0, think.y0), v.s);
      if (tk.sees(u0, w0, 0, u1, w1, 0)) blockRug(tk, u0, w0, u1 - u0, w1 - w0);
    }
  }
  const read = slot('read');
  if (read) {
    const [cu, cw, r] = [read.len * 0.55, read.dep + 4.2, 5.2];
    const [x, y] = world(read, cu, cw);
    if (clear(x - r, y - r, x + r, y + r)) {
      const rk = new Kit(k.pen, frame(v.at, read.wall, read.x0, read.y0), v.s);
      if (rk.sees(cu - r, cw - r, 0, cu + r, cw + r, 0)) roundRug(rk, cu, cw, r);
    }
  }
}

// A rectangular rug: a dark border, a slate field, a pattern of offset
// blocks in muted sunflower, coral and cream.
function blockRug(k: Kit, u0: number, v0: number, du: number, dv: number): void {
  const z = 0.04;
  const q = (a0: number, b0: number, a1: number, b1: number): P3[] => [[a0, b0, z], [a1, b0, z], [a1, b1, z], [a0, b1, z]];
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.1);
  k.poly(q(u0, v0, u0 + du, v0 + dv), '#3c4656', k.thin, 0.3);
  k.poly(q(u0 + 0.7, v0 + 0.7, u0 + du - 0.7, v0 + dv - 0.7), '#56707f', 0);
  const blocks: Array<[number, number, number, number, Color]> = [
    [0.12, 0.2, 0.34, 0.45, '#d9a648'],
    [0.42, 0.55, 0.62, 0.82, '#d07a62'],
    [0.7, 0.18, 0.86, 0.4, '#e8dcc0'],
    [0.2, 0.62, 0.3, 0.8, '#e8dcc0'],
  ];
  for (const [a, b, c, d, col] of blocks) k.poly(q(u0 + du * a, v0 + dv * b, u0 + du * c, v0 + dv * d), col, 0);
  const lines: Array<[P3, P3]> = [
    [[u0 + du * 0.08, v0 + dv * 0.5, z + 0.01], [u0 + du * 0.92, v0 + dv * 0.5, z + 0.01]],
    [[u0 + du * 0.66, v0 + dv * 0.1, z + 0.01], [u0 + du * 0.66, v0 + dv * 0.9, z + 0.01]],
  ];
  k.segs(lines, '#e8dcc0', Math.max(0.8, 0.14 * k.s));
}

// A round rug of rings: sunflower, cream, coral and teal, muted.
function roundRug(k: Kit, cu: number, cv: number, r: number): void {
  k.shadow(cu, cv, r * 1.02, r * 1.02, 0.1);
  const rings: Color[] = ['#3f6f74', '#e8dcc0', '#d9a648', '#e8dcc0', '#d07a62', '#e8dcc0', '#3f6f74'];
  rings.forEach((c, i) => k.disc(cu, cv, 0.04, r * (1 - i / rings.length), c, i === 0 ? k.thin : 0));
}

// ── the windows ─────────────────────────────────────────────────────────────

type Tower = { u0: number; u1: number; top: number };
type Skyline = { far: Tower[]; near: Tower[]; tank: number | null; lights: Array<{ u: number; z: number; n: number }> };
const SKYLINES = new Map<string, Skyline>();

// The city through a window: far towers behind near ones, flat-topped,
// their heights by the window's seed, a water tower on one near roof;
// and where its lights come on (in the far towers, over anyone's head).
// Kept by where the window is as well as its seed: the towers stand at
// places along the wall, and a seed comes round again in another room.
function skyline(f: Feature, z0: number, z1: number): Skyline {
  const key = `${f.wall}:${f.a}:${f.w}:${f.k}:${z0}:${z1}`;
  const hit = SKYLINES.get(key);
  if (hit) return hit;
  const w = f.w - 1;
  const a0 = f.a - w / 2 - 1;
  const a1 = f.a + w / 2 + 1;
  const hgt = z1 - z0;
  const row = (salt: number, wmin: number, wmax: number, hmin: number, hmax: number): Tower[] => {
    const out: Tower[] = [];
    for (let u = a0 - hash(f.k, salt) * 2, i = 0; u < a1; i++) {
      const tw = wmin + hash(f.k, i, salt + 1) * (wmax - wmin);
      out.push({ u0: u, u1: u + tw, top: z0 + hgt * (hmin + hash(f.k, i, salt + 2) * (hmax - hmin)) });
      u += tw + (hash(f.k, i, salt + 3) < 0.3 ? 0.4 : 0);
    }
    return out;
  };
  const far = row(11, 1.4, 2.8, 0.42, 0.86);
  const near = row(21, 2.0, 3.6, 0.16, 0.46);
  const tank = hash(f.k, 31) < 0.7 ? Math.floor(hash(f.k, 32) * near.length) : null;
  const lights: Skyline['lights'] = [];
  const zl = 20.6;
  for (const [i, t] of far.entries()) {
    if (t.top < zl + 1 || t.u1 < f.a - w / 2 + 0.6 || t.u0 > f.a + w / 2 - 0.6) continue;
    for (let j = 0; j < 2 && lights.length < 6; j++) {
      const u = Math.max(f.a - w / 2 + 0.6, Math.min(f.a + w / 2 - 1.0, t.u0 + 0.35 + hash(f.k, i, 40 + j) * (t.u1 - t.u0 - 0.9)));
      const z = zl + hash(f.k, i, 50 + j) * (t.top - zl - 1);
      lights.push({ u, z, n: i * 2 + j });
    }
  }
  const out = { far, near, tank, lights };
  SKYLINES.set(key, out);
  return out;
}

// A big industrial window: a soldier course over the opening, the brick
// reveal, the city at dusk through glass set back in it, a black steel
// frame in a grid of three by four panes, a deep brick sill, a pot on it
// now and then.
function windowArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const a = f.a;
  const w = f.w - 1; // the opening
  const tone = (c: Color, d = 0.13) => (lit ? c : shade(c, -d));
  // the soldier course over it: upright bricks
  const sw = w / 2 + 0.6;
  k.poly([[a - sw, 0.03, z1], [a + sw, 0.03, z1], [a + sw, 0.03, z1 + 1.7], [a - sw, 0.03, z1 + 1.7]], tone(C.brickDark), k.thin);
  const soldiers: Array<[P3, P3]> = [];
  for (let u = a - sw + 0.75; u < a + sw - 0.2; u += 0.75) soldiers.push([[u, 0.04, z1], [u, 0.04, z1 + 1.7]]);
  k.segs(soldiers, withAlpha(tone(C.mortar, 0.18), 0.8), Math.max(0.6, 0.13 * s));
  // the opening: the reveal, the city through the glass
  const open: P3[] = [[a - w / 2, 0.02, z0], [a + w / 2, 0.02, z0], [a + w / 2, 0.02, z1], [a - w / 2, 0.02, z1]];
  k.poly(open, tone(C.brickDark), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  city(k, f, a, w, z0, z1);
  // the reveal's faces: the jamb seen past the -u side, the sill's inside,
  // a shadow under the head
  k.poly([[a - w / 2, 0.02, z0], [a - w / 2, -DEPTH, z0], [a - w / 2, -DEPTH, z1], [a - w / 2, 0.02, z1]], k.side(C.brickDark, 1, 0, 0.2), 0);
  k.poly([[a - w / 2, 0.02, z0], [a + w / 2, 0.02, z0], [a + w / 2, -DEPTH, z0], [a - w / 2, -DEPTH, z0]], tone(C.brick), 0);
  k.poly([[a - w / 2, -DEPTH, z1 - 0.9], [a + w / 2, -DEPTH, z1 - 0.9], [a + w / 2, 0.02, z1], [a - w / 2, 0.02, z1]], withAlpha('#1a0c06', 0.35), 0);
  pen.restore();
  // the steel: the frame round the glass, two mullions and three transoms
  const n = -DEPTH * 0.5;
  const bw = Math.max(1.2, 0.34 * s);
  const bars: P3[][] = [];
  for (const fu of [0, 1 / 3, 2 / 3, 1]) bars.push([[a - w / 2 + w * fu, n, z0], [a - w / 2 + w * fu, n, z1]]);
  for (const fz of [0, 0.25, 0.5, 0.75, 1]) bars.push([[a - w / 2, n, z0 + (z1 - z0) * fz], [a + w / 2, n, z0 + (z1 - z0) * fz]]);
  for (const b of bars) k.line(b, INK, bw + k.thin * 1.2);
  for (const b of bars) k.line(b, C.frame, bw);
  // a glint along the lit edges of the bars
  const glint: Array<[P3, P3]> = [];
  const lu = k.lit(-1, 0) ? -1 : 1;
  for (const fu of [1 / 3, 2 / 3]) glint.push([[a - w / 2 + w * fu + (lu * 0.09 * bw) / s, n, z0 + 0.2], [a - w / 2 + w * fu + (lu * 0.09 * bw) / s, n, z1 - 0.2]]);
  for (const fz of [0.25, 0.5, 0.75]) glint.push([[a - w / 2 + 0.2, n, z0 + (z1 - z0) * fz + (0.09 * bw) / s], [a + w / 2 - 0.2, n, z0 + (z1 - z0) * fz + (0.09 * bw) / s]]);
  k.segs(glint, withAlpha(C.steelLight, 0.9), Math.max(0.6, bw * 0.28));
  if (k.fine) {
    // a latch on the middle row
    const [x, y] = k.p(a - w / 2 + w / 3 + 0.35, n + 0.1, z0 + (z1 - z0) * 0.5 + 0.5);
    pen.beginPath();
    pen.roundRect(x - 0.12 * s, y - 0.3 * s, 0.24 * s, 0.6 * s, 0.1 * s);
    k.paint(C.chrome, k.thin * 0.7);
  }
  // the sill: deep brick on edge, a row of headers
  k.box(a - w / 2 - 0.7, 0, z0 - 1.0, w + 1.4, 1.3, 1.0, tone(C.brickDark, 0.08), { line: k.lw });
  const heads: Array<[P3, P3]> = [];
  for (let u = a - w / 2 - 0.7 + 0.9; u < a + w / 2 + 0.6; u += 0.9) heads.push([[u, 1.31, z0 - 1.0], [u, 1.31, z0]]);
  k.segs(heads, withAlpha(C.mortar, 0.6), Math.max(0.6, 0.11 * s));
  if (hash(f.k, 71) < 0.55) {
    const pu = a + (hash(f.k, 72) < 0.5 ? -1 : 1) * (w / 2 - 1.0);
    succulent(k, pu, 0.65, z0, 0.55);
  }
}

// The city at dusk behind the glass (n = -DEPTH): a sky from the deep blue
// overhead down to peach at the horizon, a low sun's glow, far towers and
// near ones with a few windows lit, a water tower on a roof.
function city(k: Kit, f: Feature, a: number, w: number, z0: number, z1: number): void {
  const { pen, s } = k;
  const n = -DEPTH;
  const sky = skyline(f, z0, z1);
  k.poly([[a - w / 2 - 1, n, z0], [a + w / 2 + 1, n, z0], [a + w / 2 + 1, n, z1], [a - w / 2 - 1, n, z1]], k.vgrad(a, n, z0, z1, [[0, C.skyLow], [0.35, '#d98a86'], [0.7, '#7d6a9e'], [1, C.skyTop]]), 0);
  k.halo(a + (hash(f.k, 61) - 0.5) * w * 0.6, n, z0 + (z1 - z0) * 0.22, (z1 - z0) * 0.3, '#ffd2a0', 0.35);
  const towers = (list: Tower[], c: Color) => {
    pen.beginPath();
    for (const t of list) k.trace([[t.u0, n, z0 - 0.5], [t.u1, n, z0 - 0.5], [t.u1, n, t.top], [t.u0, n, t.top]]);
    pen.fillStyle = c;
    pen.fill();
  };
  towers(sky.far, C.towerFar);
  // far roofs' antennas and a lit edge on their sunward side
  const masts: Array<[P3, P3]> = [];
  const edges: Array<[P3, P3]> = [];
  for (const [i, t] of sky.far.entries()) {
    if (hash(f.k, i, 13) < 0.3) masts.push([[(t.u0 + t.u1) / 2, n, t.top], [(t.u0 + t.u1) / 2, n, t.top + 1.4]]);
    edges.push([[t.u0 + 0.08, n, z0], [t.u0 + 0.08, n, t.top]]);
  }
  k.segs(edges, withAlpha('#f0b49a', 0.35), Math.max(0.6, 0.14 * s));
  k.segs(masts, C.towerFar, Math.max(0.6, 0.12 * s));
  // the far towers' dim windows (the overlay lights more of them)
  const dim: P3[][] = [];
  for (const [i, t] of sky.far.entries()) {
    for (let j = 0; j < 4; j++) {
      if (hash(f.k, i, j + 70) < 0.6) continue;
      const u = t.u0 + 0.3 + hash(f.k, i, j + 80) * Math.max(0.1, t.u1 - t.u0 - 0.8);
      const z = z0 + 1 + hash(f.k, i, j + 90) * Math.max(0.5, Math.min(t.top, 20) - z0 - 2);
      dim.push([[u, n, z], [u + 0.4, n, z], [u + 0.4, n, z + 0.5], [u, n, z + 0.5]]);
    }
  }
  pen.beginPath();
  for (const q of dim) k.trace(q);
  pen.fillStyle = withAlpha(C.lit, 0.55);
  pen.fill();
  towers(sky.near, C.tower);
  // the near towers' windows: rows of them, some lit
  const on: P3[][] = [];
  const off: P3[][] = [];
  for (const [i, t] of sky.near.entries()) {
    for (let z = z0 + 0.8, r = 0; z < t.top - 0.9; z += 1.3, r++) {
      for (let u = t.u0 + 0.35, c = 0; u < t.u1 - 0.6; u += 0.85, c++) {
        const q: P3[] = [[u, n, z], [u + 0.4, n, z], [u + 0.4, n, z + 0.55], [u, n, z + 0.55]];
        (hash(f.k, i * 31 + r, c + 100) < 0.42 ? on : off).push(q);
      }
    }
  }
  pen.beginPath();
  for (const q of off) k.trace(q);
  pen.fillStyle = shade(C.tower, 0.12);
  pen.fill();
  pen.beginPath();
  for (const q of on) k.trace(q);
  pen.fillStyle = C.lit;
  pen.fill();
  // a water tower on a near roof: legs, a barrel, a cone
  if (sky.tank !== null) {
    const t = sky.near[sky.tank];
    const cu = (t.u0 + t.u1) / 2;
    const zt = t.top;
    k.segs([[[cu - 0.7, n, zt], [cu - 0.55, n, zt + 1.2]], [[cu + 0.7, n, zt], [cu + 0.55, n, zt + 1.2]], [[cu, n, zt], [cu, n, zt + 1.2]]], C.tower, Math.max(0.7, 0.14 * s));
    k.poly([[cu - 0.75, n, zt + 1.2], [cu + 0.75, n, zt + 1.2], [cu + 0.75, n, zt + 2.4], [cu - 0.75, n, zt + 2.4]], C.tower, 0);
    k.poly([[cu - 0.85, n, zt + 2.4], [cu + 0.85, n, zt + 2.4], [cu, n, zt + 3.1]], C.tower, 0);
  }
  // the glass: a soft sheen across each column of panes
  if (k.fine) {
    const sheen: P3[][] = [];
    for (const fu of [0, 1 / 3, 2 / 3]) {
      const u = a - w / 2 + w * fu;
      sheen.push([[u + w * 0.05, n + 0.3, z0 + (z1 - z0) * 0.55], [u + w * 0.12, n + 0.3, z0 + (z1 - z0) * 0.55], [u + w * 0.24, n + 0.3, z1], [u + w * 0.17, n + 0.3, z1]]);
    }
    pen.beginPath();
    for (const q of sheen) k.trace(q);
    pen.fillStyle = withAlpha('#ffffff', 0.09);
    pen.fill();
  }
}

// ── prints, the cork board, the neon, the bike, the pendants ─────────────────

// By its seed: a framed abstract print (a circle, a bar and a triangle on
// white), or a cork board of plain cards and one photo of shapes. No words.
function artPiece(k: Kit, f: Feature): void {
  const a = f.a;
  const n = 0.32;
  if (hash(f.k, 80) < 0.6) {
    const portrait = hash(f.k, 81) < 0.6;
    const [w, h] = portrait ? [3.8, 5.0] : [4.6, 3.6];
    const z0 = 13.5 + hash(f.k, 82) * 2;
    k.shadow(a + 0.2, 0.2, w * 0.55, 0.5, 0.12, z0 - 0.3);
    k.box(a - w / 2, 0, z0, w, 0.3, h, hash(f.k, 83) < 0.5 ? C.frame : C.birch, { line: k.lw, stripe: false });
    const p = (u: number, z: number): P3 => [a - w / 2 + u, n, z0 + z];
    k.poly([p(0.35, 0.35), p(w - 0.35, 0.35), p(w - 0.35, h - 0.35), p(0.35, h - 0.35)], C.white, k.thin);
    k.poly([p(0.75, 0.75), p(w - 0.75, 0.75), p(w - 0.75, h - 0.75), p(0.75, h - 0.75)], '#f4ede0', 0);
    const iw = w - 1.5;
    const ih = h - 1.5;
    const q = (fu: number, fz: number): P3 => p(0.75 + fu * iw, 0.75 + fz * ih);
    const flip = hash(f.k, 84) < 0.5;
    const X = (fu: number) => (flip ? 1 - fu : fu);
    // a big circle, a bar across, a triangle
    const [cx, , cz] = q(X(0.38), 0.62);
    const r = Math.min(iw, ih) * 0.3;
    k.face(cx, n, cz, r, C.chart, 0, 20);
    k.poly([q(X(0.1), 0.26), q(X(0.9), 0.26), q(X(0.9), 0.36), q(X(0.1), 0.36)], C.chartWarm, 0);
    k.poly([q(X(0.55), 0.38), q(X(0.92), 0.38), q(X(0.74), 0.75)], C.chartHot, 0);
    return;
  }
  // the cork board
  const [w, h] = [4.6, 3.6];
  const z0 = 13.8;
  k.shadow(a + 0.2, 0.2, w * 0.55, 0.5, 0.12, z0 - 0.3);
  k.box(a - w / 2, 0, z0, w, 0.3, h, C.birch, { line: k.lw, stripe: false });
  const p = (u: number, z: number): P3 => [a - w / 2 + u, n, z0 + z];
  k.poly([p(0.3, 0.3), p(w - 0.3, 0.3), p(w - 0.3, h - 0.3), p(0.3, h - 0.3)], '#c99a62', k.thin);
  const cards: Array<[number, number, number, number, Color]> = [
    [0.55, 1.9, 1.3, 1.2, C.white],
    [2.05, 2.15, 1.0, 1.0, C.noteYellow],
    [3.2, 1.75, 0.95, 1.3, C.white],
    [0.75, 0.55, 1.1, 0.95, C.noteTeal],
    [3.0, 0.5, 1.15, 0.9, C.notePink],
  ];
  const pins: P3[] = [];
  for (const [u, z, cw, ch, c] of cards) {
    k.poly([p(u, z), p(u + cw, z), p(u + cw, z + ch), p(u, z + ch)], c, k.thin * 0.8);
    if (k.fine) k.segs([[p(u + 0.2, z + ch * 0.6), p(u + cw - 0.25, z + ch * 0.6)], [p(u + 0.2, z + ch * 0.35), p(u + cw * 0.6, z + ch * 0.35)]], withAlpha('#5a5f7a', 0.5), 0.07 * k.s);
    pins.push(p(u + cw / 2, z + ch - 0.18));
  }
  // the photo: a peak under a sun
  const [pu, pz] = [1.95, 0.45];
  k.poly([p(pu, pz), p(pu + 1.05, pz), p(pu + 1.05, pz + 1.35), p(pu, pz + 1.35)], C.white, k.thin * 0.8);
  k.poly([p(pu + 0.12, pz + 0.12), p(pu + 0.93, pz + 0.12), p(pu + 0.93, pz + 1.0), p(pu + 0.12, pz + 1.0)], '#9fc6dc', 0);
  k.poly([p(pu + 0.12, pz + 0.12), p(pu + 0.93, pz + 0.12), p(pu + 0.6, pz + 0.75), p(pu + 0.4, pz + 0.5), p(pu + 0.12, pz + 0.6)], C.leaf, 0);
  const sun = p(pu + 0.72, pz + 0.82);
  k.face(sun[0], n, sun[2], 0.12, C.chartWarm, 0, 12);
  for (const [i, q] of pins.entries()) k.face(q[0], n + 0.05, q[2], 0.13, [C.chartHot, C.penBlue, C.chartWarm][i % 3], 0, 10);
}

// The neon's squiggle: one tube along the plate in an even wave, two and a
// half crests of one height (a wave, no letter in it).
function squiggle(a: number): P3[] {
  const pts: P3[] = [];
  for (let i = 0; i <= 50; i++) {
    const t = i / 50;
    pts.push([a - 2.6 + 5.2 * t, 0.5, 23 + 0.8 * Math.sin(t * Math.PI * 5)]);
  }
  return pts;
}

// A neon squiggle on a black backplate held off the wall: no letters, no
// symbol; its own soft glow (the overlay lets it breathe).
function neonArt(k: Kit, f: Feature): void {
  const a = f.a;
  const plate: P3[] = [[a - 3.3, 0.3, NEON.z0 + 0.2], [a + 3.3, 0.3, NEON.z0 + 0.2], [a + 3.3, 0.3, NEON.z1 - 0.2], [a - 3.3, 0.3, NEON.z1 - 0.2]];
  k.wash(a, 0.05, 23, 5.5, 4.5, C.neon, 0.22);
  k.poly(plate, '#1c1a1f', k.lw, 0.5);
  if (k.fine) for (const du of [-2.9, 2.9]) for (const dz of [0.6, 5.4]) k.face(a + du, 0.32, NEON.z0 + dz, 0.12, C.chrome, 0, 10);
  neonGlow(k, f, 0.22);
  const pts = squiggle(a);
  k.line(pts, shade(C.neon, -0.25), 0.5 * k.s);
  k.line(pts, C.neon, 0.34 * k.s);
  k.line(pts, C.neonGlow, 0.13 * k.s);
}

// The neon's glow round its tube, alpha a.
function neonGlow(k: Kit, f: Feature, a: number): void {
  const pen = k.pen;
  pen.save();
  pen.globalCompositeOperation = 'lighter';
  k.line(squiggle(f.a), withAlpha(C.neonGlow, a * 0.5), 1.3 * k.s);
  k.line(squiggle(f.a), withAlpha(C.neon, a), 0.8 * k.s);
  pen.restore();
}

// A red-framed bike hung side on from a rail of two hooks, wheels between
// z 5 and 12: black tyres on spoked rims, a chainring and crank, a black
// saddle and straight bars, its shadow on the bricks; no maker's name.
function bikeArt(k: Kit, f: Feature): void {
  const o = f.a - 4.5;
  const n = 1.1;
  const R = [o + 2.1, 7.3] as const;
  const F = [o + 6.9, 7.3] as const;
  const BB = [o + 4.2, 6.9] as const;
  const S = [o + 3.6, 10.2] as const;
  const HT = [o + 6.15, 10.35] as const;
  const HB = [o + 6.35, 9.5] as const;
  const P = (q: readonly [number, number], dn = 0): P3 => [q[0], n + dn, q[1]];
  const tubes: ReadonlyArray<readonly [P3, P3, number, Color]> = [
    [P(R), P(BB), 0.22, C.bikeRed],
    [P(R), P(S), 0.22, C.bikeRed],
    [P(BB), P(S), 0.32, C.bikeRed],
    [P(BB), P(HB), 0.36, C.bikeRed],
    [P(S), P(HT), 0.32, C.bikeRed],
    [P(HB), P(F), 0.24, C.steel],
    [P(HT), P(HB), 0.4, C.bikeRed],
  ];
  // its shadow on the bricks, down and away from the light
  const du = k.lit(-1, 0) ? 0.45 : -0.45;
  const flat = (q: P3): P3 => [q[0] + du, 0.03, q[2] - 0.5];
  const dark = withAlpha('#1a0c06', 0.22);
  for (const c of [R, F]) {
    const tire = circle(c[0] + du, 0.03, c[1] - 0.5, 2.0, 32);
    k.line([...tire, tire[0]], dark, 0.55 * k.s);
  }
  k.segs(tubes.map(([a, b]) => [flat(a), flat(b)] as [P3, P3]), dark, 0.35 * k.s);
  // the rack: a rail on the wall, two hooks off it
  k.box(o + 1.6, 0, 11.6, 5.8, 0.3, 0.6, C.steel, { line: k.thin });
  for (const u of [o + 3.0, o + 5.6]) k.rod([[u, 0.3, 11.9], [u, n, 11.9], [u, n, 11.0]], C.steelLight, 0.14);
  // the wheels
  for (const [u, z] of [R, F]) {
    const tire = circle(u, n, z, 2.0, 32);
    const loop = [...tire, tire[0]];
    k.line(loop, INK, 0.5 * k.s + k.lw);
    k.line(loop, C.tire, 0.5 * k.s);
    const rim = circle(u, n + 0.02, z, 1.65, 28);
    k.line([...rim, rim[0]], C.chrome, Math.max(0.7, 0.1 * k.s));
    if (k.fine) {
      const spokes: Array<[P3, P3]> = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        spokes.push([[u, n + 0.02, z], [u + Math.cos(a) * 1.6, n + 0.02, z + Math.sin(a) * 1.6]]);
      }
      k.segs(spokes, withAlpha(C.chrome, 0.8), 0.04 * k.s);
    }
    k.face(u, n + 0.03, z, 0.22, C.steel, k.thin, 10);
  }
  // the frame: stays, seat tube, top and down tubes, the fork
  const tube = (a: P3, b: P3, w = 0.32, c: Color = C.bikeRed) => {
    k.line([a, b], INK, w * k.s + k.lw);
    k.line([a, b], c, w * k.s);
  };
  for (const [a, b, w, c] of tubes) tube(a, b, w, c);
  // the chainring and crank
  k.face(BB[0], n + 0.05, BB[1], 0.62, C.chrome, k.thin, 18);
  k.face(BB[0], n + 0.06, BB[1], 0.25, C.steel, 0, 10);
  tube([BB[0], n + 0.08, BB[1]], [BB[0] + 0.6, n + 0.08, BB[1] - 0.75], 0.16, C.steel);
  // the seat post and saddle, the stem and bars
  tube(P(S), [S[0] - 0.2, n, S[1] + 0.7], 0.18, C.steel);
  k.poly([[S[0] - 0.95, n, S[1] + 0.75], [S[0] + 0.55, n, S[1] + 0.85], [S[0] + 0.5, n, S[1] + 1.15], [S[0] - 0.85, n, S[1] + 1.2]], '#26272c', k.thin, 0.2);
  tube(P(HT), [HT[0] + 0.25, n, HT[1] + 0.75], 0.18, C.steel);
  k.rod([[HT[0] + 0.2, n - 0.6, HT[1] + 0.8], [HT[0] + 0.3, n + 0.7, HT[1] + 0.8]], '#26272c', 0.2);
}

// A pendant lamp hung from the beam on a black cord: a black dome shade,
// the warm bulb under it, its halo, and its light washing the bricks.
function pendant(k: Kit, v: RoomView, f: Feature): void {
  const zs = pendantZ(v.H);
  const a = f.a;
  const n = LAMP_N;
  // its light on the bricks it is seen against, LAMP_N back along the wall
  k.wash(a - n, 0.05, zs - n - 1, 4.5, 8, C.lamp, 0.32);
  k.line([[a, n, v.H - BEAM], [a, n, zs + 1.7]], INK, Math.max(0.9, 0.14 * k.s));
  k.cyl(a, n, zs + 1.2, 0.22, 0.6, C.beam, { line: k.thin });
  dome(k, a, n, zs, 1.55, C.beam, C.lamp);
  k.halo(a, n, zs - 0.4, 4, C.lamp, 0.45);
  k.halo(a, n, zs - 0.4, 1.5, C.bulb, 0.6);
}

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  const cap = '#6a5048';
  // the floor's cut edges
  if (k.sees(T, D - 1, -SLAB, W, D, 0) || k.sees(W - 1, T, -SLAB, W, D, 0)) {
    k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side(C.concreteDark, 0, 1), k.lw);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side(C.concreteDark, 1, 0), k.lw);
    k.line([[T, D, -0.4], [W, D, -0.4], [W, T, -0.4]], C.concreteLight, Math.max(1, 0.22 * k.s));
  }
  // the walls' cut ends: brick in section
  for (const [p, q, nu, nv] of [[[0, D], [T, D], 0, 1], [[W, 0], [W, T], 1, 0]] as const) {
    if (!k.sees(Math.min(p[0], q[0]), Math.min(p[1], q[1]), -SLAB, Math.max(p[0], q[0]), Math.max(p[1], q[1]), H)) continue;
    const pt = (fr: number, z: number): P3 => [p[0] + (q[0] - p[0]) * fr, p[1] + (q[1] - p[1]) * fr, z];
    k.poly([pt(0, -SLAB), pt(1, -SLAB), pt(1, H), pt(0, H)], k.side(C.brickDark, nu, nv), k.lw);
    const lines: Array<[P3, P3]> = [];
    for (let z = BASE, r = 0; z < H - 0.4; z += COURSE, r++) {
      lines.push([pt(0, z), pt(1, z)]);
      const fr = r & 1 ? 0.3 : 0.65;
      lines.push([pt(fr, z), pt(fr, Math.min(H, z + COURSE))]);
    }
    k.segs(lines, withAlpha(C.mortar, 0.45), Math.max(0.6, 0.11 * k.s));
  }
  if (k.sees(0, 0, H - 1, W, D, H + 1)) {
    k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
    k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.3), Math.max(1, 0.2 * k.s));
    k.line([[T - 0.3, D, H], [T - 0.3, T - 0.3, H], [W, T - 0.3, H]], shade(cap, 0.18), Math.max(1, 0.16 * k.s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.6), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

// Through a window, over anyone's head (z 20 and up): a cloud or two
// drifting slowly past (a crossing in about forty seconds), clipped to the
// panes, and the city's lights coming on and going off a few seconds apart.
function skyLife(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const w = f.w - 1;
  const n = -DEPTH * 0.5;
  const lo = Math.max(20, z0);
  if (z1 - lo < 1.5) return;
  const bar = (0.17 * Math.max(1.2, 0.34 * s)) / s + 0.05;
  // the panes above lo
  const panes: P3[][] = [];
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 4; r++) {
      const u0 = a0(f, w) + (w * c) / 3 + bar;
      const u1 = a0(f, w) + (w * (c + 1)) / 3 - bar;
      const pz0 = Math.max(lo, z0 + ((z1 - z0) * r) / 4 + bar);
      const pz1 = z0 + ((z1 - z0) * (r + 1)) / 4 - bar;
      if (pz1 - pz0 > 0.2) panes.push([[u0, n, pz0], [u1, n, pz0], [u1, n, pz1], [u0, n, pz1]]);
    }
  }
  if (!panes.length) return;
  pen.save();
  pen.beginPath();
  for (const q of panes) k.trace(q);
  pen.clip();
  // clouds
  const nc = 1 + (hash(f.k, 91) < 0.5 ? 1 : 0);
  pen.beginPath();
  for (let i = 0; i < nc; i++) {
    const cw = 3 + hash(f.k, i, 92) * 2;
    const span = w + 2 * cw;
    const ph = (v.t / (36 + hash(f.k, i, 93) * 10) + hash(f.k, i, 94)) % 1;
    const cu = a0(f, w) - cw + ph * span;
    const cz = lo + 0.8 + hash(f.k, i, 95) * Math.max(0.2, z1 - lo - 2.4);
    for (const [du, dz, r] of [[-0.3, 0, 0.55], [0.15, 0.25, 0.7], [0.55, 0.05, 0.5], [-0.65, -0.05, 0.4]] as const) {
      const [x, y] = k.p(cu + du * cw, n, cz + dz * 1.4);
      const rx = r * cw * 0.55 * s;
      pen.moveTo(x + rx, y);
      pen.ellipse(x, y, rx, rx * 0.5, 0, 0, Math.PI * 2);
    }
  }
  pen.fillStyle = withAlpha(C.cloud, 0.8);
  pen.fill();
  // lights in the far towers: on or off, each in its own time
  pen.beginPath();
  for (const l of skyline(f, z0, z1).lights) {
    const ph = hash(f.k, l.n, 97) * 6.28;
    const rate = 0.25 + hash(f.k, l.n, 98) * 0.35;
    if (Math.sin(v.t * rate + ph) < -0.1) continue;
    k.trace([[l.u, -DEPTH, l.z], [l.u + 0.4, -DEPTH, l.z], [l.u + 0.4, -DEPTH, l.z + 0.5], [l.u, -DEPTH, l.z + 0.5]]);
  }
  pen.fillStyle = C.lit;
  pen.fill();
  pen.restore();
}

const a0 = (f: Feature, w: number) => f.a - w / 2;
