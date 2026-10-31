import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color } from '../../art/types.ts';
import { hub, planLayout, slotRect, wallGaps } from '../../world/layout.ts';
import { defaultPois, footprint } from '../../world/room.ts';
import type { Layout, Poi, Slot, SlotKind } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import type { Quad } from './bits.ts';
import { bulbPlant, coneTree, fillPts, frondPlant, hull, mapOn, mushroom, pips, puffPlant, rflat, rivets, rrect } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, circle, hash, softDot, withAlpha } from './kit.ts';

// The Starfall Base's shell: a prefab base set down on a bright strange
// planet. Underfoot, metal deck plates pressed with hexagon and triangle
// inlays, light strips set in every third seam, grates along the walls and
// a grated section under the refiner, pink pools of the planet's day
// falling in through the glass and a ring of lights round the middle. The
// walls are built of the prefab's modules: grey panels in thick rounded
// frames round darker recesses, orange trim where the frames meet, now and
// then a blue light glowing in a recess, over a dark kick with an amber
// light strip. The right wall is the planet side, mostly glass: between
// the stations big glass bays in grey frames with orange corners look out
// on the planet (a pink sky, teal hills, giant odd flora, cone trees on the
// hills and red-cap mushrooms in the grass, rock islands floating here and
// there, two moons in the first bay and a ringed planet in the last), and
// over the stations a long window carries the same view on along the top
// of the wall. The left wall is the working side, panels and tech: blue
// light panels, wall screens with a planet map, hose reels, vents and
// lamps between its stations, a cable tray over them with cables looping
// under it. The overlay is the air before the glass: slow motes of light,
// and now and then a star falling across one bay. Every bay and wall piece
// sits in the free stretches of wall between the stations, worked out from
// the same plan the stage uses, so nothing hangs behind the rack or the
// airlock (the long windows and the tray run above them, clear of the
// tallest).

type Wall = 'left' | 'right';
type Kind = 'glass' | 'screen' | 'vent' | 'lamp' | 'inset' | 'hose';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[] };

const SLAB = 2.5; // the deck's thickness, shown along the front cut
const TRIM = 6; // the ledge's foot, over the kick
const TRIM_H = 0.9;
const GRATE = 3; // the grate strip along the foot of each wall
const PLATE = 8; // deck plate side
const DEPTH = 1.1; // how far the glass is set back in the wall
const BAND = 4.4; // the lit band along the top of each wall

// A glass bay: the frame's width round the opening, the opening's top and
// bottom corner radii and how far the frame stands out from the wall. Its
// opening is as wide as its stretch of wall allows (bayW, see features);
// bayZ gives its sill and top (z) for a wall H tall: from just over the
// trim to just under the lit band, as tall as the wall lets it be.
const BAY = { frame: 1.35, rTop: 4, rBot: 1.6, out: 0.55 };
const bayW = (f: Feature) => f.w - 2 * BAY.frame - 0.3;
const topR = (ow: number) => Math.min(BAY.rTop, ow / 2 - 0.3);
function bayZ(H: number): { z0: number; z1: number; zh: number } {
  const z0 = TRIM + TRIM_H + 1.8;
  const z1 = H - BAND - 2.8;
  // the horizon a third of the way up the glass
  return { z0, z1, zh: z0 + (z1 - z0) * 0.3 };
}
// The glass over the stations, along the top of a wall between the bays:
// its sill and top (z), over the tallest station (the airlock, 20 tall).
const SKY = { frame: 1, out: 0.45 };
function stripZ(H: number): { z0: number; z1: number } {
  return { z0: 22.6, z1: bayZ(H).z1 };
}
const screenZ = (H: number) => {
  const { z0 } = bayZ(H);
  return { z0: z0 + 6.4, z1: z0 + 12.2 };
};
const ventZ = (H: number) => Math.min(H - BAND - 4, bayZ(H).z1 - 4, stripZ(H).z0 - SKY.frame - 2.3);
const lampZ = (H: number) => {
  const { z0, z1 } = bayZ(H);
  return { z0: z0 + 5, z1: Math.min(z1 - 2, z0 + 17, stripZ(H).z0 - SKY.frame - 1.5) };
};
// The cable tray along the tech wall, over its tallest station (the
// airlock, 20 tall), where the wall is tall enough for one.
const TRAY = { z: 23.2, h: 1.4, out: 0.9 };
const trayZ = (H: number): number | null => (H - BAND - 1.5 >= TRAY.z + TRAY.h ? TRAY.z : null);
// A blue light panel's glass, and the middle of a hose reel.
const insetZ = (H: number) => {
  const { z0 } = bayZ(H);
  return { z0: z0 + 2.2, z1: Math.min(z0 + 13.6, (trayZ(H) ?? H - BAND) - 1.8) };
};
const hoseZ = (H: number) => bayZ(H).z0 + 9.4;

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and what hangs on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'starfall');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L) };
  PLANS.set(key, plan);
  return plan;
}

// The planet side (GLASS_WALL) is mostly glass: bays fill every stretch
// they fit (about GLASS.aim wide, side by side with no wall between them,
// from GLASS.min to GLASS.max), and its stretches too short for glass get
// a screen, a vent or a slim lamp. The other wall is the base's working
// side, panels and tech: blue light panels, wall screens with a planet
// map, hose reels and vents packed along each stretch from TECH (cycled,
// each kind to its CAP), slim lamps filling what is left.
const GLASS_WALL: Wall = 'right';
const GLASS = { min: 7, aim: 20, max: 26 };
const WIDTH: Record<Exclude<Kind, 'glass'>, number> = { screen: 8, vent: 4, lamp: 2, inset: 5, hose: 6 };
const CAP: Partial<Record<Kind, number>> = { screen: 3, vent: 4, hose: 3 };
const PLANET_SIDE: Array<Exclude<Kind, 'glass'>> = ['screen', 'vent'];
const TECH: Array<Exclude<Kind, 'glass'>> = ['inset', 'screen', 'hose', 'vent', 'inset', 'hose', 'screen', 'vent'];
const GAP = 4;

function features(L: Layout): Feature[] {
  const out: Feature[] = [];
  const spans: Array<{ wall: Wall; a0: number; a1: number }> = [];
  for (const wall of ['right', 'left'] as const) {
    const end = wall === 'right' ? L.W : L.D;
    for (const [g0, g1] of wallGaps(L, wall)) {
      const a0 = g0 + (g0 <= L.T ? 2 : 2.5);
      const a1 = Math.min(g1, end - 2) - (g1 >= end ? 0 : 2.5);
      if (a1 - a0 >= WIDTH.lamp) spans.push({ wall, a0, a1 });
    }
  }
  const count: Partial<Record<Kind, number>> = {};
  let n = 0;
  let turn = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    if (s.wall === GLASS_WALL && len >= GLASS.min) {
      let bays = Math.max(1, Math.round(len / GLASS.aim));
      if (len / bays > GLASS.max) bays++;
      const step = len / bays;
      for (let i = 0; i < bays; i++) out.push({ wall: s.wall, kind: 'glass', a: s.a0 + (i + 0.5) * step, w: step - 0.02, k: n++ * 7 + i });
      continue;
    }
    const order = s.wall === GLASS_WALL ? PLANET_SIDE : TECH;
    const kinds: Array<Exclude<Kind, 'glass'>> = [];
    let used = 0;
    const room = (k: Exclude<Kind, 'glass'>) => used + WIDTH[k] + (kinds.length ? GAP : 0) <= len;
    for (;;) {
      let k: Exclude<Kind, 'glass'> | undefined;
      for (let i = 0; i < order.length && !k; i++) {
        const c = order[(turn + i) % order.length];
        if ((count[c] ?? 0) < (CAP[c] ?? Infinity) && room(c)) {
          k = c;
          turn += i + 1;
        }
      }
      k ??= room('lamp') ? 'lamp' : undefined;
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? GAP : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    let at = s.a0 + gap;
    kinds.forEach((k, i) => {
      out.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    n++;
  }
  return out;
}

// The span of wall a feature takes (along), how high it reaches and how
// far it stands out (for culling: what is off the pen is not drawn).
function reach(f: Feature, H: number): { a0: number; a1: number; z0: number; z1: number; n: number } {
  const half = f.w / 2;
  switch (f.kind) {
    case 'glass': {
      const { z0, z1 } = bayZ(H);
      return { a0: f.a - half - 0.5, a1: f.a + half + 0.5, z0: z0 - 2.4, z1: z1 + BAY.frame + 0.5, n: 1.6 };
    }
    case 'screen': {
      const { z0, z1 } = screenZ(H);
      return { a0: f.a - half - 0.5, a1: f.a + half + 0.5, z0: z0 - 2, z1: trayZ(H) ?? z1 + 1, n: 1.4 };
    }
    case 'vent': {
      const z = ventZ(H);
      return { a0: f.a - half - 0.5, a1: f.a + half + 0.5, z0: z - 2.5, z1: z + 2.5, n: 0.8 };
    }
    case 'lamp': {
      const { z0, z1 } = lampZ(H);
      return { a0: f.a - 4, a1: f.a + 4, z0: z0 - 4, z1: z1 + 4, n: 1 };
    }
    case 'inset': {
      const { z0, z1 } = insetZ(H);
      return { a0: f.a - half - 3, a1: f.a + half + 3, z0: z0 - 3, z1: z1 + 3, n: 0.8 };
    }
    case 'hose': {
      return { a0: f.a - half - 0.5, a1: f.a + half + 0.5, z0: 0, z1: trayZ(H) ?? hoseZ(H) + 4, n: 1.6 };
    }
  }
}

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but a drink either side of the food processor on the
// mess bench, warm either side of the refiner's glow (the one on the
// refinery tech's side a step further out, clear of whoever it serves: see
// npcs.ts), and a look out through the glass bays.
export function starfallPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const slot = (k: SlotKind) => L.slots.find((q) => q.kind === k);
  const at = (q: Slot, along: number, outward: number) => (q.wall === 'right' ? { x: q.spot.x + along, y: q.spot.y + outward } : { x: q.spot.x + outward, y: q.spot.y + along });
  const mid = (q: Slot) => {
    const r = footprint(q);
    return { x: (r.x0 + r.x1) / 2, y: (r.y0 + r.y1) / 2 };
  };
  const out = defaultPois(L).filter((p) => p.kind !== 'warm' && p.kind !== 'drink');
  const mess = slot('idle');
  const refiner = slot('run');
  if (mess) out.push({ ...at(mess, -6, 0), kind: 'drink', face: mid(mess) }, { ...at(mess, 6, 0), kind: 'drink', face: mid(mess) });
  if (refiner) out.push({ ...at(refiner, -7, 0), kind: 'warm', face: mid(refiner) }, { ...at(refiner, 7, 3), kind: 'warm', face: mid(refiner) });
  for (const f of fs.filter((g) => g.kind === 'glass').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 7), kind: 'view', face: pt(f.wall, f.a, 0) });
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
    const bays = plan.features.filter((f) => f.kind === 'glass');
    if (!bays.length) return;
    v.pen.save();
    motes(v, bays);
    const star = bays.filter((f) => f.wall === 'right').pop() ?? bays[bays.length - 1];
    fallingStar(new Kit(v.pen, wallAt(v.at, star.wall, v.T), v.s), v, star);
    for (const f of plan.features) {
      if (f.kind === 'screen') blip(new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s), v, f);
    }
    v.pen.restore();
  },
};

// The stretch of a wall (along) the pen can see between heights z0..z1.
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

// ── floor ──────────────────────────────────────────────────────────────────

const PLATES = ['#a3a6b6', '#abaebe'] as const;

// Every third seam carries a recessed light strip, in dashes a plate long.
const STRIP_EVERY = 3;

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen, s } = k;
  const { W, D, T } = v;
  if (!k.sees(T, T, -SLAB, W, D, 0, 8)) return;
  // the seams' colour under everything, then the plates over it
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], C.deckDark, 0);
  const [ox, oy] = k.p(0, 0, 0);
  const pad = 2 * PLATE;
  const dlo = -ox / s - pad;
  const dhi = (pen.width - ox) / s + pad;
  const slo = (2 * -oy) / s - pad;
  const shi = (2 * (pen.height - oy)) / s + pad;
  const seen = (x: number, y: number) => x - y >= dlo && x - y <= dhi && x + y >= slo && x + y <= shi;
  const x0 = T + GRATE;
  const y0 = T + GRATE;
  const cols = Math.ceil((W - x0) / PLATE);
  const rows = Math.ceil((D - y0) / PLATE);
  // The grated section the refiner stands on: the plates round its slot.
  const refiner = plan.L.slots.find((q) => q.kind === 'run');
  const rr = refiner ? slotRect(refiner) : null;
  const grated = (xa: number, ya: number, xb: number, yb: number) => !!rr && xa < rr.x1 + 3 && rr.x0 - 3 < xb && ya < rr.y1 + 3 && rr.y0 - 3 < yb;
  const tones: P3[][][] = [[], []];
  const grates: Array<[number, number, number, number]> = [];
  const hexes: P3[][] = [];
  const tris: Array<[P3, P3]> = [];
  const sheen: Array<[P3, P3]> = [];
  const strips: Array<[P3, P3]> = [];
  const g = 0.16; // half a seam
  for (let j = 0; j < rows; j++) {
    const ya = y0 + j * PLATE;
    const yb = Math.min(D, ya + PLATE);
    for (let i = 0; i < cols; i++) {
      const xa = x0 + i * PLATE;
      const xb = Math.min(W, xa + PLATE);
      if (!seen((xa + xb) / 2, (ya + yb) / 2)) continue;
      // light strips set in the seams along the plate's back edges
      if (i % STRIP_EVERY === 0 && i > 0 && yb - ya > 4) strips.push([[xa, ya + 2, 0], [xa, yb - 2, 0]]);
      if (j % STRIP_EVERY === 0 && j > 0 && xb - xa > 4) strips.push([[xa + 2, ya, 0], [xb - 2, ya, 0]]);
      if (grated(xa, ya, xb, yb)) {
        grates.push([xa + g, ya + g, xb - (xb >= W ? 0 : g), yb - (yb >= D ? 0 : g)]);
        continue;
      }
      tones[(i + j) & 1].push(rflat(xa + g, ya + g, xb - (xb >= W ? 0 : g), yb - (yb >= D ? 0 : g), 0, 0.9, 3));
      // inlays pressed in the plate: a hexagon, or nested triangles, or
      // plain
      const h = hash(i, j, 3);
      const cx = (xa + xb) / 2;
      const cy = (ya + yb) / 2;
      if (xb - xa > 6 && yb - ya > 6) {
        if (h < 0.42) {
          const hx: P3[] = [];
          for (let q = 0; q < 6; q++) hx.push([cx + Math.cos((q / 6) * Math.PI * 2) * 2.5, cy + Math.sin((q / 6) * Math.PI * 2) * 2.5, 0]);
          hexes.push(hx);
        } else if (h < 0.6) {
          // a triangle pointing along one of the plate's sides, a smaller
          // one nested in it
          const flip = hash(i, j, 4) < 0.5;
          const tri = (m: number): Array<[P3, P3]> => {
            const p: P3[] = flip ? [[xa + m, ya + m, 0], [xa + m, yb - m, 0], [xb - m, cy, 0]] : [[xa + m, ya + m, 0], [xb - m, ya + m, 0], [cx, yb - m, 0]];
            return [[p[0], p[1]], [p[1], p[2]], [p[2], p[0]]];
          };
          tris.push(...tri(1.3), ...tri(3.0));
        }
      }
      if (k.fine) sheen.push([[xa + 0.5, ya + 0.32, 0], [xb - 0.5, ya + 0.32, 0]]);
    }
  }
  tones.forEach((list, ti) => {
    if (!list.length) return;
    pen.beginPath();
    for (const q of list) k.trace(q);
    pen.fillStyle = PLATES[ti];
    pen.fill();
  });
  // the inlays: a pressed groove, its lit lip on the far side
  if (hexes.length || tris.length) {
    pen.beginPath();
    for (const q of hexes) k.trace(q);
    for (const [p, q] of tris) {
      const [ax, ay] = k.p(...p);
      const [bx, by] = k.p(...q);
      pen.moveTo(ax, ay);
      pen.lineTo(bx, by);
    }
    pen.strokeStyle = withAlpha('#6c7186', 0.75);
    pen.lineWidth = Math.max(0.7, 0.14 * s);
    pen.lineJoin = 'round';
    pen.stroke();
    if (k.fine) {
      pen.save();
      pen.translate(0, 0.09 * s);
      pen.strokeStyle = withAlpha('#ffffff', 0.3);
      pen.lineWidth = Math.max(0.5, 0.07 * s);
      pen.stroke();
      pen.restore();
    }
  }
  if (sheen.length) k.segs(sheen, withAlpha('#ffffff', 0.18), Math.max(0.6, 0.1 * s));
  // the grated section: dark grating in a frame, slats across
  if (grates.length) {
    pen.beginPath();
    for (const [a0, b0, a1, b1] of grates) k.trace(rflat(a0, b0, a1, b1, 0, 0.5, 2));
    pen.fillStyle = '#5a5f72';
    pen.fill();
    const slats: Array<[P3, P3]> = [];
    for (const [a0, b0, a1, b1] of grates) for (let x = a0 + 0.6; x < a1 - 0.3; x += 0.75) slats.push([[x, b0 + 0.5, 0], [x, b1 - 0.5, 0]]);
    k.segs(slats, '#3b3f50', Math.max(0.6, 0.2 * s));
    pen.beginPath();
    for (const [a0, b0, a1, b1] of grates) k.trace(rflat(a0 + 0.3, b0 + 0.3, a1 - 0.3, b1 - 0.3, 0, 0.4, 2));
    pen.strokeStyle = '#8e93a6';
    pen.lineWidth = Math.max(0.7, 0.18 * s);
    pen.stroke();
  }
  // The grate strips along the foot of each wall.
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    if (!wk.sees(T, 0, 0, end, GRATE, 0)) continue;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, GRATE, 0], [T, GRATE, 0]], C.grate, 0);
    const [va, vb] = visibleAlong(wk, T, end, 0, 0);
    const slats: Array<[P3, P3]> = [];
    for (let a = Math.max(T + 0.4, Math.floor(va)); a < Math.min(end, vb); a += 0.7) slats.push([[a, 0.35, 0], [a, GRATE - 0.35, 0]]);
    wk.segs(slats, '#3f4859', Math.max(0.6, 0.16 * s));
    wk.line([[T, GRATE, 0], [end, GRATE, 0]], shade(C.grate, 0.35), Math.max(0.8, 0.14 * s));
    wk.line([[T, 0.3, 0], [end, 0.3, 0]], withAlpha('#20202e', 0.6), Math.max(0.6, 0.1 * s));
  }
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const sh = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  sh.addColorStop(0, '#2a1f3d44');
  sh.addColorStop(0.35, '#2a1f3d14');
  sh.addColorStop(0.7, '#2a1f3d00');
  sh.addColorStop(1, '#2a1f3d18');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], sh, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    if (!wk.sees(T, 0, 0, end, 3.5, 0)) continue;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#2a1f3d55'], [0.4, '#2a1f3d1c'], [1, '#2a1f3d00']]), 0);
  }
  // A ring of lights round the hub, where the crew gathers (smaller, or
  // none, where a station or the mess bench's mat comes too near), and a
  // soft mat under the mess bench, the crew's corner.
  const h = hub(plan.L);
  const near = plan.L.slots.map((q) => ({ r: slotRect(q), m: q.kind === 'idle' ? 4.6 : 3 }));
  for (const f of [1, 0.85, 0.7, 0.55]) {
    const R = Math.min(9, (W - T) * 0.07) * f;
    const box = { x0: h.x - R, y0: h.y - R, x1: h.x + R, y1: h.y + R };
    if (near.some(({ r: q, m }) => q.x0 < box.x1 + m && box.x0 < q.x1 + m && q.y0 < box.y1 + m && box.y0 < q.y1 + m)) continue;
    if (k.sees(box.x0, box.y0, 0, box.x1, box.y1, 0)) hubRing(k, h.x, h.y, R);
    break;
  }
  const mess = plan.L.slots.find((q) => q.kind === 'idle');
  const MAT = { u0: -1.6, v0: -1.2, du: 3.2, dv: 2.6 };
  if (mess) {
    const mk = new Kit(pen, frame(v.at, mess.wall, mess.x0, mess.y0), s);
    if (mk.sees(-2, -2, 0, mess.len + 2, mess.dep + 2, 0)) mat(mk, MAT.u0, MAT.v0, mess.len + MAT.du, mess.dep + MAT.dv);
  }
  // Light: cool pools of the planet's day falling in through the glass and
  // under the lamps, the refiner's warm glow and the holo desk's.
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (f.kind === 'glass') {
      const ow = bayW(f);
      if (wk.sees(f.a - ow / 2 - 6, 0, 0, f.a + ow / 2 + 6, 22, 0)) {
        wk.pool(f.a + 1.5, 9.5, ow * 0.62 + 3, 12, '#ffb3dc', 0.62);
        wk.pool(f.a + 1, 4, ow * 0.42 + 1.5, 4.4, '#fff0fa', 0.4);
      }
    } else if (f.kind === 'lamp') {
      if (wk.sees(f.a - 6, 0, 0, f.a + 6, 6, 0)) wk.pool(f.a, 3, 5, 3.5, C.amberLight, 0.22);
    }
  }
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  for (const [kind, u, w, r, a, c] of [['run', 0.5, 0.55, 13, 0.3, '#ffb35c'], ['write', 0.5, 0.75, 9, 0.2, '#8ff8ff'], ['read', 0.5, 1.5, 9, 0.16, '#ff9ad6'], ['think', 0.5, 0.4, 9, 0.18, '#8ff8ff'], ['entrance', 0.5, 1.2, 8, 0.2, '#ffc04a']] as const) {
    const q = slot(kind);
    if (!q) continue;
    const qk = new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
    if (qk.sees(-r, -r, 0, q.len + r, q.dep + r, 0)) qk.pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
  // The light strips in the seams (none over the mat or the grating): a
  // soft glow, then the bright strip.
  const onMat = (x: number, y: number) => {
    if (!mess) return false;
    const [mx0, my0] = mess.wall === 'right' ? [mess.x0 + MAT.u0, mess.y0 + MAT.v0] : [mess.x0 + MAT.v0, mess.y0 + MAT.u0];
    const [mw, md] = mess.wall === 'right' ? [mess.len + MAT.du, mess.dep + MAT.dv] : [mess.dep + MAT.dv, mess.len + MAT.du];
    return x > mx0 - 0.5 && x < mx0 + mw + 0.5 && y > my0 - 0.5 && y < my0 + md + 0.5;
  };
  const lit = strips.filter(([p, q]) => !onMat(p[0], p[1]) && !onMat(q[0], q[1]) && !grated(Math.min(p[0], q[0]) - 0.5, Math.min(p[1], q[1]) - 0.5, Math.max(p[0], q[0]) + 0.5, Math.max(p[1], q[1]) + 0.5));
  if (lit.length) {
    pen.save();
    pen.globalCompositeOperation = 'screen';
    k.segs(lit, withAlpha(C.glow, 0.22), Math.max(2, 0.9 * s), 'round');
    pen.restore();
    k.segs(lit, withAlpha(INK, 0.55), Math.max(1.2, 0.3 * s), 'round');
    k.segs(lit, '#c8fbff', Math.max(0.7, 0.18 * s), 'round');
  }
}

// A rubber mat on the deck in its own frame: a rounded slate-blue field
// with a slate border and rows of little studs.
function mat(k: Kit, u0: number, v0: number, du: number, dv: number): void {
  const z = 0.04;
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.1);
  k.poly(rflat(u0, v0, u0 + du, v0 + dv, z, 1.2), '#55618a', k.thin);
  k.poly(rflat(u0 + 0.7, v0 + 0.7, u0 + du - 0.7, v0 + dv - 0.7, z, 0.8), '#7480a8', 0);
  if (k.s < 3) return;
  const studs: P3[] = [];
  for (let u = u0 + 1.6; u < u0 + du - 1.2; u += 1.4) for (let w = v0 + 1.6; w < v0 + dv - 1.2; w += 1.4) studs.push([u, w, z]);
  pips(k, studs, '#8e99be', 0.14, 0.6);
}

// A ring of round lights set in the deck: a pale band with a dot every so
// often, softly glowing.
function hubRing(k: Kit, cx: number, cy: number, R: number): void {
  const ring = (r: number): P3[] => {
    const out: P3[] = [];
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r, 0]);
    }
    return out;
  };
  const pen = k.pen;
  pen.beginPath();
  k.trace(ring(R + 0.45));
  k.trace(ring(R - 0.45).reverse());
  pen.fillStyle = withAlpha('#d4d8ec', 0.5);
  pen.fill();
  pen.beginPath();
  k.trace(ring(R + 0.45));
  k.trace(ring(R - 0.45));
  pen.strokeStyle = withAlpha(INK, 0.3);
  pen.lineWidth = Math.max(0.6, k.thin * 0.6);
  pen.stroke();
  const dots: P3[] = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    dots.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0]);
  }
  for (const [x, y] of dots) k.halo(x, y, 0, 1.2, C.cyan, 0.4);
  pips(k, dots, '#d8fcff', 0.22, 1);
}

// ── walls ──────────────────────────────────────────────────────────────────
// Both walls are built of the prefab's modules: a grey panel PW wide in a
// thick rounded frame round a darker recess, orange trim on the frame's
// corners where the modules meet, now and then a blue light glowing in the
// recess; a dark kick under a ledge with an amber light strip along it,
// and a band of small lights along the top. The tech wall carries a cable
// tray over its stations, cables looping under it.

const PW = 8; // a module's width along the wall
const PH = 8.5; // and its height, about
const MF = 0.85; // the thickness of a module's frame round its recess

// Which way along the wall the screen's left is (light comes from there).
const leftEnd = (k: Kit): 0 | 1 => (k.p(1, 0, 0)[0] > k.p(0, 0, 0)[0] ? 0 : 1);

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  if (!k.sees(T, 0, -0.5, end, 4.5, H + 1, 8)) return;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const [ax0, ax1] = visibleAlong(k, T, end, 0, H);
  const mine = plan.features.filter((f) => f.wall === wall);
  const glassy = wall === GLASS_WALL;
  const top = H - BAND;
  const strip = glassy ? stripRuns(v, mine, wall) : [];
  const tz = glassy ? null : trayZ(H);
  const z0 = TRIM + TRIM_H;
  // The modules' frames: one fill over the field, warmer low down on the
  // planet side where its light falls.
  k.poly([[T, 0, z0], [end, 0, z0], [end, 0, top], [T, 0, top]], k.vgrad(T, 0, z0, top, [[0, tone(glassy ? '#e3dde3' : '#d0d4da')], [0.5, tone(C.frame)], [1, tone('#dfe3e8')]]), 0);
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 10, 0, 0], [T + 10, 0, H], [T, 0, H]], k.hgrad([T, 0, 0], [T + 10, 0, 0], [[0, '#2a1f3d30'], [1, '#2a1f3d00']]), 0);
  const rows = Math.max(1, Math.round((top - z0) / PH));
  const ph = (top - z0) / rows;
  const { z0: sz0, z1: sz1 } = stripZ(H);
  const under = [...mine.map((f) => reach(f, H)), ...strip.map(([a0, a1]) => ({ a0, a1, z0: sz0 - SKY.frame - 0.5, z1: sz1 + SKY.frame + 0.5 }))];
  if (tz !== null) under.push({ a0: T, a1: end, z0: tz - 1.6, z1: tz + TRAY.h + 0.4 });
  const L0 = leftEnd(k);
  const seams: P3[][] = [];
  const recess: P3[][] = [];
  const dark: P3[][] = [];
  const light: P3[][] = [];
  const corners: P3[][] = [];
  const bolts: P3[] = [];
  const blues: Array<{ a: number; za: number; zb: number }> = [];
  const grilles: Array<[number, number, number]> = [];
  for (let a = T; a < end - 0.5; a += PW) {
    if (a + PW < ax0 || a > ax1) continue;
    const a1 = Math.min(end, a + PW);
    const narrow = a1 - a < PW - 0.5;
    for (let r = 0; r < rows; r++) {
      const za = z0 + r * ph;
      const zb = za + ph;
      seams.push(rrect(a + 0.12, za + 0.12, a1 - 0.12, zb - 0.12, 0, 1.1, 1.1, 3));
      const ra = a + MF;
      const rb = a1 - MF;
      const qa = za + MF;
      const qb = zb - MF;
      if (rb - ra > 1) {
        recess.push(rrect(ra, qa, rb, qb, 0, 0.6, 0.6, 2));
        // the recess's inner walls: dark along its top and its screen-left
        // side, lit along its foot and its other side
        const [sl, sr] = L0 === 0 ? [ra, rb] : [rb, ra];
        dark.push([[sl, 0.01, qa + 0.5], [sl, 0.01, qb - 0.12], [sr, 0.01, qb - 0.12]]);
        light.push([[sl, 0.01, qa + 0.12], [sr, 0.01, qa + 0.12], [sr, 0.01, qb - 0.5]]);
      }
      // orange trim on the frame's corners where four modules meet (and
      // along the ledge and the band)
      if (a > T + 0.5) for (const cz of r === 0 ? [za, zb] : [zb]) if (cz < top - 0.5 || r === rows - 1) corners.push(cornerCap(a, cz));
      if (k.fine) bolts.push([a + 0.45, 0, za + 0.45], [a1 - 0.45, 0, za + 0.45], [a + 0.45, 0, zb - 0.45], [a1 - 0.45, 0, zb - 0.45]);
      // now and then a module with a blue light glowing in its recess, or a
      // grille, where nothing hangs over it
      if (narrow || under.some((q) => a - 1 < q.a1 && q.a0 < a1 + 1 && za < q.z1 && q.z0 < zb)) continue;
      const h = hash(Math.round(a), r, wall === 'right' ? 13 : 14);
      if (h < (glassy ? 0.1 : 0.2)) blues.push({ a: (a + a1) / 2, za, zb });
      else if (h < (glassy ? 0.16 : 0.3)) grilles.push([(a + a1) / 2, za, zb]);
    }
  }
  pen.beginPath();
  for (const q of recess) k.trace(q);
  pen.fillStyle = tone(glassy ? '#bdb9c4' : C.recess);
  pen.fill();
  pen.strokeStyle = withAlpha(INK, 0.35);
  pen.lineWidth = Math.max(0.6, 0.08 * s);
  pen.stroke();
  const edge = (list: P3[][], c: Color, w: number) => {
    if (!list.length) return;
    pen.beginPath();
    for (const q of list) {
      q.forEach(([a, n, z], i) => {
        const [x, y] = k.p(a, n, z);
        if (i) pen.lineTo(x, y);
        else pen.moveTo(x, y);
      });
    }
    pen.strokeStyle = c;
    pen.lineWidth = w;
    pen.lineJoin = 'round';
    pen.lineCap = 'round';
    pen.stroke();
  };
  edge(dark, withAlpha('#3a3550', lit ? 0.28 : 0.34), Math.max(0.8, 0.24 * s));
  edge(light, withAlpha('#ffffff', lit ? 0.55 : 0.32), Math.max(0.6, 0.14 * s));
  // the seams between modules
  pen.beginPath();
  for (const q of seams) k.trace(q);
  pen.strokeStyle = withAlpha(INK, 0.55);
  pen.lineWidth = Math.max(0.7, 0.11 * s);
  pen.stroke();
  if (k.fine) rivets(k, bolts, tone(C.panelLight), 0.11);
  for (const g of grilles) grille(k, g[0], g[1], g[2], tone);
  for (const b of blues) blueInset(k, b.a - 1.3, b.za + MF + 1.1, b.a + 1.3, b.zb - MF - 1.1, 0.02);
  // The kick under the ledge: dark metal plates, seams, a vent slot now
  // and then.
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, TRIM], [T, 0, TRIM]], k.vgrad(T, 0, 0, TRIM, [[0, tone(shade(C.metalDark, -0.1))], [1, tone(C.metal)]]), 0);
  const kick: Array<[P3, P3]> = [];
  const slots: P3[][] = [];
  for (let a = T + 4; a < end - 0.5; a += 4) {
    if (a < ax0 - 4 || a > ax1 + 4) continue;
    kick.push([[a, 0, 0.3], [a, 0, TRIM - 0.2]]);
    if (hash(Math.round(a), wall === 'right' ? 1 : 2, 7) < 0.22) for (let i = 0; i < 3; i++) slots.push(rrect(a - 3.2, 1.6 + i * 1.1, a - 0.8, 2.1 + i * 1.1, 0.01, 0.25));
  }
  k.segs(kick, withAlpha(INK, 0.4), Math.max(0.7, 0.12 * s));
  if (slots.length) {
    pen.beginPath();
    for (const q of slots) k.trace(q);
    pen.fillStyle = tone('#454b58');
    pen.fill();
  }
  // The ledge over the kick, an amber light strip set in its face.
  k.box(T, 0, TRIM, end - T, 0.55, TRIM_H, tone(C.metal, 0.1), { line: k.thin, stripe: false });
  k.line([[T, 0.56, TRIM + TRIM_H * 0.45], [end, 0.56, TRIM + TRIM_H * 0.45]], C.amberLight, Math.max(0.9, 0.2 * s));
  k.line([[T, 0.56, TRIM + TRIM_H * 0.45], [end, 0.56, TRIM + TRIM_H * 0.45]], withAlpha('#fff7e6', 0.9), Math.max(0.5, 0.07 * s));
  // the orange trim over all of it
  if (corners.length) {
    pen.beginPath();
    for (const q of corners) k.trace(q);
    pen.fillStyle = tone(C.trimOrange, 0.1);
    pen.fill();
    pen.strokeStyle = withAlpha(INK, 0.7);
    pen.lineWidth = Math.max(0.6, k.thin * 0.7);
    pen.stroke();
  }
  // The ribbon of sky over the stations, the cable tray, then what hangs
  // on the wall.
  for (const [a0, a1] of strip) if (k.sees(a0, 0, sz0 - SKY.frame, a1, SKY.out, sz1 + SKY.frame)) skyStrip(k, v, wall, a0, a1, lit);
  if (tz !== null && k.sees(T, 0, tz - 2, end, TRAY.out, tz + TRAY.h)) cableTray(k, v, wall, tz, Math.max(T + 1, ax0 - 8), Math.min(end - 1, ax1 + 8), tone);
  const first = mine.filter((f) => f.kind === 'glass').sort((p, q) => p.a - q.a)[0];
  for (const f of mine) {
    const r = reach(f, H);
    if (!k.sees(r.a0, 0, r.z0, r.a1, r.n, r.z1)) continue;
    if (f.kind === 'glass') glassBay(k, v, f, lit, f === first ? (wall === 'right' ? 'moons' : 'planet') : f === mine.filter((g) => g.kind === 'glass').sort((p, q) => q.a - p.a)[0] ? 'planet' : 'none');
    else if (f.kind === 'screen') wallScreen(k, v, f, lit);
    else if (f.kind === 'vent') vent(k, v, f, lit);
    else if (f.kind === 'inset') lightPanel(k, v, f, lit);
    else if (f.kind === 'hose') hoseReel(k, v, f, lit);
    else lamp(k, v, f);
  }
  // The band along the top: a ledge, a strip of small lights, white and
  // amber by turns.
  k.poly([[T, 0, top], [end, 0, top], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, top, H, [[0, tone('#c3c8cf')], [1, tone('#d8dce2')]]), 0);
  k.box(T, 0, top - 0.8, end - T, 0.55, 0.8, tone(C.metal, 0.1), { line: k.thin, stripe: false });
  const dots: P3[] = [];
  const amber: P3[] = [];
  for (let a = T + 2; a < end - 1; a += 4) if (a > ax0 - 4 && a < ax1 + 4) (Math.round((a - T) / 4) % 2 ? amber : dots).push([a, 0.05, top + BAND * 0.52]);
  for (const [a, n, z] of dots) k.halo(a, n, z, 1.4, '#e8fbff', 0.38);
  for (const [a, n, z] of amber) k.halo(a, n, z, 1.4, C.amberLight, 0.4);
  pips(k, dots, '#f4feff', 0.2, 1);
  pips(k, amber, '#fff0d0', 0.2, 1);
  k.line([[T, 0, H - 0.6], [end, 0, H - 0.6]], withAlpha(INK, 0.3), Math.max(0.6, 0.08 * s));
}

// An orange corner cap where four modules meet at (a, z): a rounded
// diamond of trim over the frames' corners.
function cornerCap(a: number, z: number): P3[] {
  const r = 0.75;
  return [[a - r, 0.03, z], [a - 0.22, 0.03, z - r + 0.22], [a, 0.03, z - r], [a + 0.22, 0.03, z - r + 0.22], [a + r, 0.03, z], [a + 0.22, 0.03, z + r - 0.22], [a, 0.03, z + r], [a - 0.22, 0.03, z + r - 0.22]];
}

// A blue light in a recess, (a0, z0) to (a1, z1) on the plane v = n: a
// deep blue pane, brighter toward its rim, a glow round it.
function blueInset(k: Kit, a0: number, z0: number, a1: number, z1: number, n: number): void {
  if (a1 - a0 < 0.6 || z1 - z0 < 0.6) return;
  const am = (a0 + a1) / 2;
  const zm = (z0 + z1) / 2;
  k.wash(am, n, zm, (a1 - a0) * 0.9 + 0.8, (z1 - z0) * 0.62 + 0.8, C.glow, 0.22);
  k.poly(rrect(a0 - 0.28, z0 - 0.28, a1 + 0.28, z1 + 0.28, n, 0.5), C.metalDark, k.thin);
  k.poly(rrect(a0, z0, a1, z1, n + 0.01, 0.35), k.vgrad(am, n, z0, z1, [[0, '#5fe6ff'], [0.25, C.inset], [0.75, '#2a4fc0'], [1, '#6fdcff']]), 0);
  k.poly(rrect(a0 + 0.3, z0 + 0.3, a1 - 0.3, z1 - 0.3, n + 0.02, 0.2), k.vgrad(am, n, z0, z1, [[0, '#2f5ad8'], [0.5, '#1f3a9e'], [1, '#2f5ad8']]), 0);
  // a sheen across it
  k.poly([[a0 + 0.35, n + 0.03, z1 - 0.4], [a0 + 0.75, n + 0.03, z1 - 0.4], [a0 + 0.35, n + 0.03, z1 - 1.4]], withAlpha('#ffffff', 0.5), 0);
}

// A grille in a recess: a dark slot with bars across.
function grille(k: Kit, a: number, za: number, zb: number, tone: (c: Color, d?: number) => Color): void {
  const z0 = za + MF + 1.6;
  const z1 = Math.min(zb - MF - 1.6, z0 + 3.2);
  if (z1 - z0 < 1) return;
  k.poly(rrect(a - 2.2, z0, a + 2.2, z1, 0.02, 0.4), tone('#4a5060'), k.thin);
  const bars: Array<[P3, P3]> = [];
  for (let z = z0 + 0.55; z < z1 - 0.3; z += 0.6) bars.push([[a - 2.0, 0.03, z], [a + 2.0, 0.03, z]]);
  k.segs(bars, tone('#9aa1ab'), Math.max(0.6, 0.18 * k.s));
}

// The cable tray along the tech wall at height z, from a0 to a1: a metal
// trough on brackets and three cables looping under it between them.
function cableTray(k: Kit, v: RoomView, wall: Wall, z: number, a0: number, a1: number, tone: (c: Color, d?: number) => Color): void {
  const T = v.T;
  const end = wall === 'right' ? v.W : v.D;
  const b0 = T + 1;
  const b1 = end - 1;
  // the cables first, sagging between the brackets (every two modules)
  const cols: readonly Color[] = [C.prefab, C.inset, C.trimOrange];
  const brk: number[] = [];
  for (let a = T + PW; a < end - 1; a += 2 * PW) if (a > a0 - 2 * PW && a < a1 + 2 * PW) brk.push(a);
  cols.forEach((c, i) => {
    const lines: P3[][] = [];
    for (let j = 0; j + 1 < brk.length; j++) {
      const pa = brk[j];
      const pb = brk[j + 1];
      const sag = 1.1 + i * 0.55 + hash(j, i, 17) * 0.5;
      const pts: P3[] = [];
      for (let t = 0; t <= 1.0001; t += 0.125) pts.push([pa + (pb - pa) * t, 0.35 + i * 0.12, z - 0.1 - sag * 4 * t * (1 - t)]);
      lines.push(pts);
    }
    for (const q of lines) {
      k.line(q, INK, Math.max(1.4, 0.3 * k.s + k.thin));
      k.line(q, tone(c, 0.1), Math.max(0.8, 0.3 * k.s));
    }
  });
  // the trough
  k.box(b0, 0, z, b1 - b0, TRAY.out, TRAY.h, tone(C.metal, 0.1), { line: k.thin, stripe: true });
  k.line([[b0, TRAY.out + 0.01, z + TRAY.h * 0.5], [b1, TRAY.out + 0.01, z + TRAY.h * 0.5]], withAlpha(INK, 0.35), Math.max(0.6, 0.08 * k.s));
  // brackets under it
  for (const a of brk) k.box(a - 0.35, 0, z - 1.2, 0.7, TRAY.out, 1.2, tone(C.metalDark), { line: k.thin, stripe: false });
}

// ── a glass bay onto the planet ──────────────────────────────────────────────

// The opening (frame points on the plane v = n), and the frame round it.
// (ow the opening's width)
const opening = (a: number, ow: number, z0: number, z1: number, n: number) => rrect(a - ow / 2, z0, a + ow / 2, z1, n, topR(ow), BAY.rBot, 7);
const outer = (a: number, ow: number, z0: number, z1: number, n: number) => rrect(a - ow / 2 - BAY.frame, z0 - BAY.frame, a + ow / 2 + BAY.frame, z1 + BAY.frame, n, topR(ow) + BAY.frame, BAY.rBot + BAY.frame, 7);

// How high the opening reaches at `d` along from its middle.
function openTop(d: number, ow: number, z1: number): number {
  const r = topR(ow);
  const x = Math.abs(d) - (ow / 2 - r);
  if (x <= 0) return z1;
  return z1 - r + Math.sqrt(Math.max(0, r * r - x * x));
}

type Sky = 'moons' | 'planet' | 'none';

// A big glass bay: a chunky grey frame standing out from the wall, orange
// trim on its corners, the glass set back in the wall's thickness and cut
// into tall panes by frame bars (a transom across a tall one), a blue
// light over it, and the planet beyond.
function glassBay(k: Kit, v: RoomView, f: Feature, lit: boolean, sky: Sky): void {
  const { pen, s } = k;
  const { z0, z1 } = bayZ(v.H);
  const a = f.a;
  const ow = bayW(f);
  const FR = BAY.out;
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  // a soft spill of pink light on the panels round the bay
  k.wash(a, 0.02, (z0 + z1) / 2, ow / 2 + 4, (z1 - z0) * 0.62, '#ffc2e2', 0.26);
  // the frame's thickness: its outline at the wall and at its face, hulled
  const back = outer(a, ow, z0, z1, 0).map((p) => k.p(...p));
  const face = outer(a, ow, z0, z1, FR);
  fillPts(k, hull([...back, ...face.map((p) => k.p(...p))]), tone(C.metal, 0.1), k.lw);
  // the reveal (the wall's thickness), then the planet beyond the glass
  const open = opening(a, ow, z0, z1, FR + 0.01);
  k.poly(open, k.vgrad(a, FR, z0, z1, [[0, tone('#c9ced6')], [1, tone('#9ea5b0')]]), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  pen.beginPath();
  k.trace(opening(a, ow, z0, z1, -DEPTH));
  pen.clip();
  planetView(k, f, z0, z1, sky);
  // the frame bars between the panes: posts about every nine units, a
  // transom across a tall bay
  const n = -DEPTH + 0.05;
  const panes = Math.max(1, Math.round(ow / 9));
  const bars: Array<[P3, P3]> = [];
  if (z1 - z0 > 24) bars.push([[a - ow, n, z0 + (z1 - z0) * 0.36], [a + ow, n, z0 + (z1 - z0) * 0.36]]);
  for (let i = 1; i < panes; i++) bars.push([[a - ow / 2 + (i * ow) / panes, n, z0 - 1], [a - ow / 2 + (i * ow) / panes, n, z1 + 1]]);
  const bw = Math.max(1.6, 0.62 * s);
  k.segs(bars, INK, bw + k.thin * 2);
  k.segs(bars, tone(C.frame, 0.1), bw);
  if (k.fine) k.segs(bars.map(([p, q]): [P3, P3] => (p[0] === q[0] ? [[p[0] - 0.2, n, p[2]], [q[0] - 0.2, n, q[2]]] : [[p[0], n, p[2] + 0.2], [q[0], n, q[2] + 0.2]])), withAlpha('#ffffff', 0.6), Math.max(0.6, 0.1 * s));
  pen.restore();
  // the frame's face: grey, lit from the left, a dark gasket round the glass
  pen.beginPath();
  k.trace(face);
  k.trace(open);
  pen.fillStyle = k.hgrad([a - ow / 2 - BAY.frame, FR, z1], [a + ow / 2 + BAY.frame, FR, z1], [[0, tone('#eef0f3')], [0.45, tone(C.frame)], [1, tone('#b9bec6')]]);
  pen.fill('evenodd');
  pen.beginPath();
  k.trace(opening(a, ow, z0 - 0.28, z1 + 0.28, FR + 0.02).map(([u, n, z]): P3 => [a + (u - a) * (1 + 0.56 / ow), n, z]));
  pen.strokeStyle = tone(C.metalDark, 0.1);
  pen.lineWidth = Math.max(1, 0.2 * s);
  pen.stroke();
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  pen.beginPath();
  k.trace(face);
  k.paint(null, k.lw);
  // orange trim round the frame's four corners
  const ca = ow / 2 + BAY.frame;
  const tr = topR(ow) + BAY.frame;
  const br = BAY.rBot + BAY.frame;
  const arcs: P3[][] = [];
  const arc = (cu: number, cz: number, r: number, from: number): P3[] => Array.from({ length: 7 }, (_, i) => [cu + Math.cos(from + (i / 6) * (Math.PI / 2)) * r, FR + 0.02, cz + Math.sin(from + (i / 6) * (Math.PI / 2)) * r]);
  arcs.push(arc(a + ca - tr, z1 + BAY.frame - tr, tr - 0.35, 0), arc(a - ca + tr, z1 + BAY.frame - tr, tr - 0.35, Math.PI / 2));
  arcs.push(arc(a - ca + br, z0 - BAY.frame + br, br - 0.35, Math.PI), arc(a + ca - br, z0 - BAY.frame + br, br - 0.35, Math.PI * 1.5));
  for (const q of arcs) {
    k.line(q, INK, Math.max(1.6, 0.62 * s) + k.thin * 1.6);
    k.line(q, tone(C.trimOrange, 0.1), Math.max(1.6, 0.62 * s));
  }
  if (s >= 3) {
    // clamps on the frame's sides
    for (const da of [-1, 1]) {
      const cu = a + da * (ow / 2 + BAY.frame / 2);
      for (const cz of [z0 + (z1 - z0) * 0.3, z0 + (z1 - z0) * 0.7]) k.box(cu - 0.35, FR, cz - 0.7, 0.7, 0.22, 1.4, tone(C.metal), { line: k.thin, stripe: false });
    }
  }
  // a blue light over the bay
  blueInset(k, a - 1.6, z1 + 0.35, a + 1.6, z1 + BAY.frame - 0.35, FR + 0.03);
  // a sill under it, with a cyan light strip along its lip
  k.box(a - ow / 2 - BAY.frame - 0.1, 0, z0 - BAY.frame - 0.7, ow + 2 * BAY.frame + 0.2, FR + 0.8, 0.7, tone(C.frame, 0.1), { line: k.lw });
  k.line([[a - ow / 2 - 0.6, FR + 0.82, z0 - BAY.frame - 0.5], [a + ow / 2 + 0.6, FR + 0.82, z0 - BAY.frame - 0.5]], C.cyan, Math.max(0.8, 0.14 * s));
}

// ── a ribbon of glass along the top of the wall ───────────────────────────────

// The stretches (along) of a wall the ribbon of glass runs: the wall's
// length less its corners and the glass bays, none shorter than 4.
function stripRuns(v: RoomView, mine: ReadonlyArray<Feature>, wall: Wall): Array<[number, number]> {
  if (stripZ(v.H).z1 - stripZ(v.H).z0 < 3) return [];
  const end = wall === 'right' ? v.W : v.D;
  const bays = mine.filter((f) => f.kind === 'glass').map((f) => [f.a - f.w / 2 - 0.3, f.a + f.w / 2 + 0.3] as const);
  bays.sort((p, q) => p[0] - q[0]);
  const runs: Array<[number, number]> = [];
  let at = v.T + 2;
  for (const [b0, b1] of bays) {
    if (b0 - at >= 4) runs.push([at, b0]);
    at = Math.max(at, b1);
  }
  if (end - 2 - at >= 4) runs.push([at, end - 2]);
  return runs;
}

// A long window from a0 to a1 (its frame's outer edge) high on the wall,
// over the stations: a white frame like the bays', the glass set back,
// slim mullions, and the top of the same view the bays show.
function skyStrip(k: Kit, v: RoomView, wall: Wall, a0: number, a1: number, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1 } = stripZ(v.H);
  const bz = bayZ(v.H);
  const F = SKY.frame;
  const FR = SKY.out;
  const u0 = a0 + F;
  const u1 = a1 - F;
  const a = (u0 + u1) / 2;
  const tone = (c: Color, d = 0.14) => (lit ? c : shade(c, -d));
  const open = (n: number) => rrect(u0, z0, u1, z1, n, 1.2, 1.2, 4);
  const outer = (n: number) => rrect(u0 - F, z0 - F, u1 + F, z1 + F, n, 1.2 + F, 1.2 + F, 4);
  k.wash(a, 0.02, (z0 + z1) / 2, (u1 - u0) / 2 + 2, (z1 - z0) * 0.9, '#ffc2e2', 0.18);
  const face = outer(FR);
  fillPts(k, hull([...outer(0), ...face].map((p) => k.p(...p))), tone(C.metal, 0.1), k.lw);
  const hole = open(FR + 0.01);
  k.poly(hole, k.vgrad(a, FR, z0, z1, [[0, tone('#d3dae6')], [1, tone('#aab4c6')]]), 0);
  pen.save();
  pen.beginPath();
  k.trace(hole);
  pen.clip();
  pen.beginPath();
  k.trace(open(-DEPTH));
  pen.clip();
  const n = -DEPTH;
  planetView(k, { wall, kind: 'glass', a, w: u1 - u0 + 3, k: Math.round(a0) * 13 + 5 }, bz.z0, bz.z1, 'none');
  const panes = Math.max(1, Math.round((u1 - u0) / 8));
  const bars: Array<[P3, P3]> = [];
  for (let i = 1; i < panes; i++) bars.push([[u0 + (i * (u1 - u0)) / panes, n + 0.05, z0 - 1], [u0 + (i * (u1 - u0)) / panes, n + 0.05, z1 + 1]]);
  if (bars.length) {
    k.segs(bars, INK, Math.max(1.6, 0.5 * s) + k.thin * 2);
    k.segs(bars, tone(C.frame, 0.1), Math.max(1.6, 0.5 * s));
  }
  pen.restore();
  // the frame's face, the gasket, the outlines
  pen.beginPath();
  k.trace(face);
  k.trace(hole);
  pen.fillStyle = k.vgrad(a, FR, z0 - F, z1 + F, [[0, tone('#c3c8cf')], [1, tone('#e9ecf0')]]);
  pen.fill('evenodd');
  pen.beginPath();
  k.trace(open(FR + 0.02).map(([u, nn, z]): P3 => [a + (u - a) * (1 + 0.5 / (u1 - u0)), nn, z + (z - (z0 + z1) / 2) * (0.5 / (z1 - z0))]));
  pen.strokeStyle = tone(C.metalDark, 0.1);
  pen.lineWidth = Math.max(1, 0.18 * s);
  pen.stroke();
  pen.beginPath();
  k.trace(hole);
  k.paint(null, k.thin);
  pen.beginPath();
  k.trace(face);
  k.paint(null, k.lw);
}

// The ground's height (z) at `a` along the wall: three ridges, continuous
// along a wall so neighbouring bays look out on one landscape.
function ridge(a: number, base: number, amp: number, f1: number, f2: number, ph: number): number {
  return base + amp * (0.6 * Math.sin(a * f1 + ph) + 0.4 * Math.sin(a * f2 + ph * 1.7));
}

const HAZE = mix(C.hill, C.skyLow, 0.55);

function planetView(k: Kit, f: Feature, z0: number, z1: number, sky: Sky): void {
  const { pen } = k;
  const n = -DEPTH;
  const a = f.a;
  const ow = bayW(f);
  const half = ow / 2 + 0.6;
  const a0 = a - half;
  const a1 = a + half;
  const zh = z0 + (z1 - z0) * 0.3;
  const ph = f.wall === 'right' ? 0.7 : 2.9;
  // the sky: deep pink high up, peach at the horizon
  k.poly([[a0, n, z0], [a1, n, z0], [a1, n, z1 + 1], [a0, n, z1 + 1]], k.vgrad(a, n, zh, z1, [[0, C.skyLow], [0.45, '#ffb0c8'], [0.8, C.skyTop], [1, '#f77cbc']]), 0);
  // a glow low in the sky
  k.wash(a + 2, n, zh + 1, 9, 6, '#fff2d8', 0.45);
  // a few faint stars in the high pink
  const stars: P3[] = [];
  for (let i = 0; i < 5; i++) {
    const sa = a0 + 0.8 + hash(f.k, i, 31) * (a1 - a0 - 1.6);
    const sz = zh + (z1 - zh) * (0.55 + hash(f.k, i, 32) * 0.4);
    if (sz < openTop(sa - a, ow, z1) - 0.6) stars.push([sa, n, sz]);
  }
  pips(k, stars, '#fff6fbcc', 0.1, 0.6);
  // what hangs in the sky: two moons, or a ringed planet low over the hills
  const tall = (z1 - zh) / 25; // how much sky there is, against a tall room's
  if (sky === 'moons') moons(k, a, n, z1);
  else if (sky === 'planet') ringedPlanet(k, a - 0.4, n, zh + Math.max(5, 9 * tall));
  else if (hash(f.k, 33) < 0.5) {
    // a pale crescent of a far moon
    const ma = a + (hash(f.k, 34) - 0.5) * 6;
    const mz = z1 - 4 - hash(f.k, 35) * 3;
    const [x, y] = k.p(ma, n, mz);
    const R = 1.1 * k.s;
    pen.beginPath();
    pen.arc(x, y, R, 0, Math.PI * 2);
    pen.fillStyle = withAlpha(C.moon, 0.8);
    pen.fill();
    pen.beginPath();
    pen.arc(x + R * 0.45, y - R * 0.2, R * 0.9, 0, Math.PI * 2);
    pen.fillStyle = withAlpha('#ff9fcc', 0.85);
    pen.fill();
  }
  // a rock island floating in the sky now and then, a plant on its back
  if (sky === 'none' && hash(f.k, 36) < 0.6) island(k, a + (hash(f.k, 37) - 0.5) * 3, n, zh + (z1 - zh) * (0.55 + hash(f.k, 38) * 0.15), (2.2 + hash(f.k, 39) * 1.0) * Math.max(0.6, Math.min(1, tall)), f.k);
  // the hills: a hazy far ridge, teal hills, the near grass
  const line = (base: number, amp: number, f1: number, f2: number, p: number, bottom: number): P3[] => {
    const pts: P3[] = [[a0, n, bottom]];
    for (let u = a0; u <= a1 + 0.01; u += 0.5) pts.push([u, n, ridge(u, base, amp, f1, f2, p)]);
    pts.push([a1, n, bottom]);
    return pts;
  };
  k.poly(line(zh + 3.4, 1.9, 0.19, 0.47, ph, z0 - 1), HAZE, 0);
  // far flora: little silhouettes on the far ridge
  farFlora(k, f, a0, a1, n, zh + 3.4, ph);
  const mid = line(zh + 1.2, 1.5, 0.29, 0.71, ph + 1.3, z0 - 1);
  k.poly(mid, k.vgrad(a, n, zh - 1, zh + 3, [[0, shade(C.hill, -0.08)], [1, shade(C.hill, 0.12)]]), 0);
  k.line(mid.slice(1, -1), withAlpha(INK, 0.45), Math.max(0.6, k.thin * 0.6));
  // the giant flora, standing in the grass and on the hills
  bigFlora(k, f, a0, a1, n, zh, ph, 'back', tall);
  const near = line(zh - 1.6, 0.7, 0.53, 1.1, ph + 2.1, z0 - 1);
  k.poly(near, k.vgrad(a, n, z0, zh, [[0, C.grassDark], [1, C.grass]]), 0);
  k.line(near.slice(1, -1), withAlpha(INK, 0.55), Math.max(0.6, k.thin * 0.7));
  // grass tufts and pebbles on the near ground
  tufts(k, f, a0, a1, n, z0, zh, ph);
  bigFlora(k, f, a0, a1, n, zh, ph, 'front', tall);
  // the glass: a sheen, and shade under the top of the frame
  k.poly([[a - 3.4, n, z0], [a - 1.8, n, z0], [a + 1.6, n, z1], [a, n, z1]], '#ffffff1c', 0);
  k.poly([[a - 0.9, n, z0], [a - 0.3, n, z0], [a + 3.1, n, z1], [a + 2.5, n, z1]], '#ffffff14', 0);
  k.poly([[a0, n, z1 - 2.5], [a1, n, z1 - 2.5], [a1, n, z1 + 1], [a0, n, z1 + 1]], k.vgrad(a, n, z1 - 2.5, z1, [[0, '#2a1f3d00'], [1, '#2a1f3d40']]), 0);
}

function moons(k: Kit, a: number, n: number, z1: number): void {
  const pen = k.pen;
  // the big one, pearly with two craters, and its little sister
  const big: P3 = [a - 1.6, n, z1 - 5.6];
  const R = 2.5;
  k.halo(big[0], n, big[2], R * 2.2, '#fff4fb', 0.5);
  const [x, y] = k.p(...big);
  const r = R * k.s;
  pen.beginPath();
  pen.arc(x, y, r, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - r * 0.35, y - r * 0.35, 0, x, y, r * 1.05);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.6, C.moon);
  g.addColorStop(1, '#e2d6f4');
  k.paint(g, k.thin);
  pen.beginPath();
  for (const [dx, dy, cr] of [[0.3, 0.25, 0.42], [-0.35, -0.1, 0.26], [0.1, -0.45, 0.18]] as const) {
    pen.moveTo(x + dx * r + cr * r, y + dy * r);
    pen.arc(x + dx * r, y + dy * r, cr * r, 0, Math.PI * 2);
  }
  pen.fillStyle = withAlpha('#d9cdee', 0.9);
  pen.fill();
  const small: P3 = [a + 2.4, n, z1 - 3.6];
  k.halo(small[0], n, small[2], 2, '#eaf6ff', 0.4);
  const [sx, sy] = k.p(...small);
  const sr = 1.05 * k.s;
  pen.beginPath();
  pen.arc(sx, sy, sr, 0, Math.PI * 2);
  const g2 = pen.createRadialGradient(sx - sr * 0.35, sy - sr * 0.35, 0, sx, sy, sr * 1.05);
  g2.addColorStop(0, '#ffffff');
  g2.addColorStop(1, C.moon2);
  k.paint(g2, k.thin);
}

// A ringed planet: an orange ball with a band, its ring tilted, the far
// half of the ring behind the ball and the near half in front.
function ringedPlanet(k: Kit, a: number, n: number, z: number): void {
  const pen = k.pen;
  const R = 2.4;
  const tilt = -0.32;
  const ringPts = (r: number, from: number, to: number): P3[] => {
    const out: P3[] = [];
    for (let i = 0; i <= 24; i++) {
      const th = from + ((to - from) * i) / 24;
      const x = Math.cos(th) * r;
      const y = Math.sin(th) * r * 0.24;
      out.push([a + x * Math.cos(tilt) - y * Math.sin(tilt), n, z + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
    return out;
  };
  const halfRing = (from: number, to: number, fill: Color) => {
    pen.beginPath();
    k.trace([...ringPts(R * 1.85, from, to), ...ringPts(R * 1.35, from, to).reverse()]);
    k.paint(fill, k.thin);
  };
  k.halo(a, n, z, R * 1.9, '#ffe2c0', 0.4);
  halfRing(0, Math.PI, shade(C.ring, -0.1));
  const [x, y] = k.p(a, n, z);
  const r = R * k.s;
  pen.beginPath();
  pen.arc(x, y, r, 0, Math.PI * 2);
  const g = pen.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r * 1.05);
  g.addColorStop(0, '#ffe0b0');
  g.addColorStop(0.55, C.planet);
  g.addColorStop(1, '#e88a5a');
  k.paint(g, k.thin);
  // bands across the ball
  pen.save();
  pen.beginPath();
  pen.arc(x, y, r, 0, Math.PI * 2);
  pen.clip();
  pen.beginPath();
  for (const [dz, w] of [[0.9, 0.45], [-0.5, 0.35], [-1.6, 0.3]] as const) {
    k.trace([[a - R, n, z + dz + (a - R - a) * Math.tan(tilt) * 0.5], [a + R, n, z + dz + R * Math.tan(tilt) * 0.5], [a + R, n, z + dz + w + R * Math.tan(tilt) * 0.5], [a - R, n, z + dz + w - R * Math.tan(tilt) * 0.5]]);
  }
  pen.fillStyle = withAlpha('#e9795a', 0.45);
  pen.fill();
  pen.restore();
  halfRing(Math.PI, Math.PI * 2, C.ring);
}

// Small silhouettes of flora along the far ridge (no ink: haze).
function farFlora(k: Kit, f: Feature, a0: number, a1: number, n: number, base: number, ph: number): void {
  const pen = k.pen;
  const SP = 2.2;
  const col = mix(C.flora2, C.skyLow, 0.45);
  pen.beginPath();
  for (let i = Math.floor(a0 / SP) - 1; i <= Math.ceil(a1 / SP) + 1; i++) {
    const salt = f.wall === 'right' ? 41 : 42;
    if (hash(i, salt, 1) < 0.45) continue;
    const u = i * SP + hash(i, salt, 2) * SP;
    const zb = ridge(u, base, 1.9, 0.19, 0.47, ph) - 0.2;
    const h = 1 + hash(i, salt, 3) * 1.8;
    const [x0, y0] = k.p(u, n, zb);
    const [x1, y1] = k.p(u, n, zb + h);
    const r = (0.35 + hash(i, salt, 4) * 0.3) * k.s;
    pen.moveTo(x0 - 0.1 * k.s, y0);
    pen.lineTo(x1 - 0.1 * k.s, y1);
    pen.lineTo(x1 + 0.1 * k.s, y1);
    pen.lineTo(x0 + 0.1 * k.s, y0);
    pen.closePath();
    pen.moveTo(x1 + r, y1 - r * 0.6);
    pen.arc(x1, y1 - r * 0.6, r, 0, Math.PI * 2);
  }
  pen.fillStyle = col;
  pen.fill();
}

const FLORA_COLORS: readonly Color[] = [C.flora, C.flora2, C.flora3, C.flora, C.cyan];
const CONE = '#6a4f86'; // the cone trees' bark, a dusky violet

// The giant flora: bulb-topped stalks, spiral fronds, puffball trees, stands
// of ribbed cone trees on the hills and rings of red-cap mushrooms in the
// grass, set along the wall by a fixed spacing so they carry on bay to bay.
// 'back' ones stand on the teal hills, 'front' ones in the near grass,
// some of them nearly as tall as the glass; `tall` scales them to the sky.
function bigFlora(k: Kit, f: Feature, a0: number, a1: number, n: number, zh: number, ph: number, layer: 'back' | 'front', tall: number): void {
  const front = layer === 'front';
  const SP = front ? 3.9 : 2.9;
  const salt = (f.wall === 'right' ? 51 : 52) + (front ? 10 : 0);
  const g = Math.max(0.45, Math.min(1.1, tall));
  for (let i = Math.floor(a0 / SP) - 2; i <= Math.ceil(a1 / SP) + 1; i++) {
    if (hash(i, salt, 1) < (front ? 0.22 : 0.35)) continue;
    const u = i * SP + hash(i, salt, 2) * SP * 0.6;
    if (u < a0 - 5 || u > a1 + 5) continue;
    const foot = front ? ridge(u, zh - 1.6, 0.7, 0.53, 1.1, ph + 2.1) - 1.4 : ridge(u, zh + 1.2, 1.5, 0.29, 0.71, ph + 1.3) - 0.4;
    const kind = hash(i, salt, 3);
    const color = FLORA_COLORS[Math.floor(hash(i, salt, 4) * FLORA_COLORS.length)];
    const h = (front ? 8 + hash(i, salt, 5) * 12 : 3.5 + hash(i, salt, 5) * 5) * g;
    const r = (front ? 1.3 + hash(i, salt, 7) * 1.0 : 0.6 + hash(i, salt, 7) * 0.45) * Math.max(0.7, g);
    const line = front ? k.thin : Math.max(0.6, k.thin * 0.6);
    const tint = (c: Color) => (front ? c : mix(c, C.skyLow, 0.3));
    if (!front && kind > 0.58) {
      // a stand of cone trees on the hills
      const cw = r * 2.6;
      const ch = h * 1.5 + 2;
      coneTree(k, u - cw * 0.6, n, foot, ch, cw, tint(CONE), line, -cw * 0.3);
      coneTree(k, u + cw * 0.55, n, foot - 0.3, ch * 0.75, cw * 0.85, tint(shade(CONE, 0.1)), line, cw * 0.25);
      if (hash(i, salt, 8) < 0.5) coneTree(k, u, n, foot - 0.5, ch * 0.55, cw * 0.75, tint(shade(CONE, -0.06)), line);
    } else if (front && kind > 0.74) {
      // a ring of red-cap mushrooms in the grass
      const m = Math.min(1.6, r);
      mushroom(k, u - m * 1.3, n, foot + 0.9, m * 1.0, line);
      mushroom(k, u + m * 0.5, n, foot + 0.6, m * 1.45, line);
      mushroom(k, u + m * 2.0, n, foot + 1.1, m * 0.75, line);
    } else if (kind < 0.36) bulbPlant(k, u, n, foot, h, (hash(i, salt, 6) - 0.5) * (front ? 5 : 2), r, tint(color), line, front ? 0.3 : 0.12);
    else if (kind < 0.6) frondPlant(k, u, n, foot, h, hash(i, salt, 6) < 0.5 ? -1 : 1, r * 0.95, tint(C.flora2), line);
    else puffPlant(k, u, n, foot, h, r * 1.15, tint(color === C.cyan ? C.flora3 : color), line, i);
  }
}

// A rock island floating in the sky: lavender rock tapering in rounded
// steps below, a domed grassy top, a bulb plant on it and vines trailing
// down from its edge.
function island(k: Kit, a: number, n: number, z: number, w: number, seed: number): void {
  const top: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    top.push([a - w + 2 * w * t, n, z + Math.sin(t * Math.PI) * w * 0.28]);
  }
  const under: P3[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const d = Math.sin(t * Math.PI) ** 0.8 * w * (0.95 + (hash(seed, i, 41) - 0.5) * 0.3);
    under.push([a + w - 2 * w * t, n, z - d]);
  }
  k.poly([...top, ...under], k.vgrad(a, n, z - w, z, [[0, '#8a66c0'], [1, '#c9a8ef']]), k.thin, 0.15);
  // strata on the rock
  if (k.fine) k.line([[a - w * 0.6, n, z - w * 0.32], [a, n, z - w * 0.42], [a + w * 0.55, n, z - w * 0.3]], withAlpha('#5e4890', 0.6), k.thin * 0.7);
  // the grass cap over the top, a lip hanging over the rock
  const cap: P3[] = [...top, ...top.slice().reverse().map(([u, nn, zz], i): P3 => [u, nn, zz - 0.35 - (i % 2) * 0.2])];
  k.poly(cap, k.vgrad(a, n, z - 0.5, z + w * 0.3, [[0, C.grassDark], [1, C.grass]]), k.thin);
  for (const da of [-0.75, 0.6]) k.line([[a + w * da, n, z - 0.3], [a + w * da + 0.15, n, z - w * 0.5], [a + w * da - 0.1, n, z - w * 0.9]], C.grassDark, Math.max(0.7, 0.14 * k.s));
  bulbPlant(k, a + w * 0.25, n, z + w * 0.2, w * 1.2, 0.5, w * 0.3, C.flora3, k.thin * 0.8, 0.2);
  puffPlant(k, a - w * 0.4, n, z + w * 0.15, w * 0.7, w * 0.22, C.flora, k.thin * 0.8, seed);
}

// Tufts of grass and round pebbles on the near ground.
function tufts(k: Kit, f: Feature, a0: number, a1: number, n: number, z0: number, zh: number, ph: number): void {
  const blades: Array<[P3, P3]> = [];
  const pebbles: P3[] = [];
  const SP = 1.3;
  const salt = f.wall === 'right' ? 61 : 62;
  for (let i = Math.floor(a0 / SP); i <= Math.ceil(a1 / SP); i++) {
    const u = i * SP + hash(i, salt, 1) * SP;
    const top = ridge(u, zh - 1.6, 0.7, 0.53, 1.1, ph + 2.1);
    const z = z0 + 0.5 + hash(i, salt, 2) * Math.max(0.5, top - z0 - 1.5);
    const pick = hash(i, salt, 3);
    if (pick < 0.1) {
      mushroom(k, u, n, z - 0.3, 0.42 + hash(i, salt, 5) * 0.25, Math.max(0.6, k.thin * 0.7));
      continue;
    }
    if (pick < 0.25) {
      pebbles.push([u, n, z]);
      continue;
    }
    for (const d of [-0.25, 0, 0.25]) blades.push([[u + d * 0.6, n, z], [u + d * 1.8, n, z + 0.7 + hash(i, salt, 4) * 0.6]]);
  }
  k.segs(blades, shade(C.grass, 0.25), Math.max(0.6, 0.1 * k.s), 'round');
  if (pebbles.length) {
    const pen = k.pen;
    pen.beginPath();
    for (const [u, nn, z] of pebbles) {
      const [x, y] = k.p(u, nn, z);
      pen.moveTo(x + 0.45 * k.s, y);
      pen.ellipse(x, y, 0.45 * k.s, 0.28 * k.s, 0, 0, Math.PI * 2);
    }
    pen.fillStyle = '#c9b6e8';
    pen.fill();
    pen.strokeStyle = withAlpha(INK, 0.5);
    pen.lineWidth = Math.max(0.6, k.thin * 0.5);
    pen.stroke();
  }
}

// ── a wall screen with a planet map ─────────────────────────────────────────
// A grey bezel with orange corners on a bracket, a dark blue screen with a
// map of the planet (land, contours, a grid; the blip is the overlay's),
// a conduit up to the cable tray.

function wallScreen(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { z0, z1 } = screenZ(v.H);
  const a = f.a;
  const w = f.w - 0.6;
  const tone = (c: Color) => (lit ? c : shade(c, -0.12));
  const tz = f.wall === GLASS_WALL ? null : trayZ(v.H);
  if (tz !== null) conduit(k, a + w / 2 - 1.1, z1, tz, tone);
  k.shadow(a + 0.3, 0.3, w * 0.55, 0.6, 0.12, z0 - 0.5);
  k.box(a - 0.6, 0, z0 - 1.6, 1.2, 0.5, 1.7, tone(C.metal), { line: k.thin, stripe: false });
  k.poly(rrect(a - w / 2, z0, a + w / 2, z1, 0.02, 0.9), tone(C.metal), k.lw);
  k.poly(rrect(a - w / 2, z0, a + w / 2, z1, 0.55, 0.9), k.vgrad(a, 0.55, z0, z1, [[0, tone('#c3c8cf')], [1, tone('#eef0f3')]]), k.lw);
  for (const [ca, cz, th] of [[a - w / 2, z0, Math.PI], [a + w / 2, z0, Math.PI * 1.5], [a + w / 2, z1, 0], [a - w / 2, z1, Math.PI / 2]] as const) {
    const pts: P3[] = Array.from({ length: 5 }, (_, i) => {
      const t = th + (i / 4) * (Math.PI / 2);
      return [ca - Math.cos(th + Math.PI / 4) * 0.62 * Math.SQRT2 + Math.cos(t) * 0.62, 0.56, cz - Math.sin(th + Math.PI / 4) * 0.62 * Math.SQRT2 + Math.sin(t) * 0.62];
    });
    k.line(pts, tone(C.trimOrange), Math.max(1.2, 0.36 * k.s));
  }
  const g0 = a - w / 2 + 0.55;
  const g1 = a + w / 2 - 0.55;
  const q: Quad = [[g0, 0.57, z0 + 0.55], [g1, 0.57, z0 + 0.55], [g1, 0.57, z1 - 0.55], [g0, 0.57, z1 - 0.55]];
  k.poly([...q], k.vgrad(a, 0.57, z0, z1, [[0, '#14245a'], [1, '#22388a']]), k.thin);
  mapOn(k, q, f.k);
  k.halo(a, 0.8, (z0 + z1) / 2, 3.4, C.glow, 0.16);
  k.poly([[g0 + 0.6, 0.58, z0 + 0.6], [g0 + 1.3, 0.58, z0 + 0.6], [g0 + 2.4, 0.58, z1 - 0.6], [g0 + 1.7, 0.58, z1 - 0.6]], '#ffffff14', 0);
}

// A conduit up the wall at `a` from z0 to the tray at z1, clipped to it.
function conduit(k: Kit, a: number, z0: number, z1: number, tone: (c: Color) => Color): void {
  if (z1 - z0 < 0.5) return;
  k.rod([[a, 0.3, z0], [a, 0.3, z1]], tone(C.metal), 0.34);
  for (let z = z0 + 1.5; z < z1 - 0.6; z += 3) k.box(a - 0.4, 0, z, 0.8, 0.45, 0.4, tone(C.metalDark), { line: k.thin * 0.8, stripe: false });
}

// ── a blue light panel ──────────────────────────────────────────────────────
// A tall grey frame with orange corners round a deep blue pane of light,
// like the base's window and door insets; a glow on the panels round it.

function lightPanel(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { z0, z1 } = insetZ(v.H);
  const a = f.a;
  const half = f.w / 2 - 0.2;
  const tone = (c: Color) => (lit ? c : shade(c, -0.12));
  k.wash(a, 0.02, (z0 + z1) / 2, half + 2.2, (z1 - z0) * 0.6 + 1, C.glow, 0.2);
  k.poly(rrect(a - half, z0, a + half, z1, 0.02, 1.0), tone(C.metal), k.lw);
  k.poly(rrect(a - half, z0, a + half, z1, 0.45, 1.0), k.hgrad([a - half, 0.45, z0], [a + half, 0.45, z0], [[0, tone('#eef0f3')], [1, tone('#b9bec6')]]), k.lw);
  for (const [ca, cz] of [[a - half + 0.55, z0 + 0.55], [a + half - 0.55, z0 + 0.55], [a + half - 0.55, z1 - 0.55], [a - half + 0.55, z1 - 0.55]] as const) {
    k.poly(rrect(ca - 0.45, cz - 0.45, ca + 0.45, cz + 0.45, 0.47, 0.2), tone(C.trimOrange), k.thin * 0.8);
  }
  blueInset(k, a - half + 1.15, z0 + 1.2, a + half - 1.15, z1 - 1.2, 0.47);
  // light bars across the pane
  const bars: Array<[P3, P3]> = [];
  for (let z = z0 + 3; z < z1 - 2; z += 2.6) bars.push([[a - half + 1.6, 0.5, z], [a + half - 1.6, 0.5, z]]);
  k.segs(bars, withAlpha('#9ff4ff', 0.55), Math.max(0.6, 0.12 * k.s));
}

// ── a hose reel ─────────────────────────────────────────────────────────────
// A backing plate with orange corners, a dark hose coiled three times on a
// hook, its nozzle hanging, a red valve wheel on the pipe under it that
// runs down into the kick, and a conduit up to the tray.

function hoseReel(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const a = f.a;
  const zc = hoseZ(v.H);
  const tone = (c: Color) => (lit ? c : shade(c, -0.12));
  const tz = trayZ(v.H);
  const pa = a + 1.6;
  // the pipe from the kick up past the valve, and the conduit to the tray
  k.rod([[pa, 0.45, TRIM + TRIM_H], [pa, 0.45, zc - 3.6], [a + 0.6, 0.45, zc - 3.6]], tone(C.metal), 0.42);
  if (tz !== null) conduit(k, a - 2.0, zc + 3.2, tz, tone);
  // the backing plate
  k.poly(rrect(a - 2.8, zc - 3.1, a + 2.8, zc + 3.1, 0.25, 0.8), tone(C.metal), k.lw);
  for (const [ca, cz] of [[a - 2.3, zc - 2.6], [a + 2.3, zc - 2.6], [a + 2.3, zc + 2.6], [a - 2.3, zc + 2.6]] as const) k.poly(rrect(ca - 0.4, cz - 0.4, ca + 0.4, cz + 0.4, 0.27, 0.18), tone(C.trimOrange), k.thin * 0.8);
  // the valve wheel
  const vz = zc - 3.6;
  k.face(pa, 0.95, vz, 0.75, tone(C.prefab), k.thin);
  k.face(pa, 0.97, vz, 0.32, tone('#7a2a2a'), 0);
  // the coils: three loops of hose on the hook, back to front
  for (let i = 0; i < 3; i++) {
    const r = 2.05 - i * 0.12;
    const loop = circle(a + (i - 1) * 0.28, 0.6 + i * 0.25, zc - i * 0.18, r, 28);
    loop.push(loop[0]);
    k.line(loop, INK, Math.max(1.8, 0.5 * k.s) + k.thin * 2);
    k.line(loop, tone(i === 2 ? '#4a5164' : '#3c4253'), Math.max(1.8, 0.5 * k.s));
    if (k.fine) k.line(circle(a + (i - 1) * 0.28, 0.62 + i * 0.25, zc - i * 0.18, r, 28, Math.PI * 0.55, Math.PI * 0.95), withAlpha('#ffffff', 0.35), Math.max(0.6, 0.1 * k.s));
  }
  // the hook over them, and the nozzle hanging off the front coil
  k.box(a - 0.5, 0, zc + 1.4, 1.0, 1.4, 0.6, tone(C.metalDark), { line: k.thin, stripe: false });
  k.rod([[a + 1.5, 1.1, zc - 1.2], [a + 2.1, 1.15, zc - 2.6], [a + 2.2, 1.15, zc - 3.4]], '#3c4253', 0.4);
  k.box(a + 1.85, 1.0, zc - 4.4, 0.7, 0.4, 1.0, tone(C.trimOrange), { line: k.thin, stripe: false });
}

// ── a round vent with slats ─────────────────────────────────────────────────

function vent(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const pen = k.pen;
  const z = ventZ(v.H);
  const a = f.a;
  const R = 1.75;
  const tone = (c: Color) => (lit ? c : shade(c, -0.12));
  const circ = (r: number, n: number): P3[] => {
    const out: P3[] = [];
    for (let i = 0; i < 28; i++) {
      const th = (i / 28) * Math.PI * 2;
      out.push([a + Math.cos(th) * r, n, z + Math.sin(th) * r]);
    }
    return out;
  };
  k.poly(circ(R, 0.3), k.hgrad([a - R, 0.3, z], [a + R, 0.3, z], [[0, tone('#eef0f3')], [1, tone(C.metal)]]), k.lw);
  const inner = circ(R * 0.72, 0.32);
  k.poly(inner, tone('#454b58'), k.thin);
  pen.save();
  pen.beginPath();
  k.trace(inner);
  pen.clip();
  const slats: Array<[P3, P3]> = [];
  for (let dz = -R; dz <= R; dz += 0.42) slats.push([[a - R, 0.33, z + dz], [a + R, 0.33, z + dz]]);
  k.segs(slats, tone('#c2c7cf'), Math.max(0.7, 0.16 * k.s));
  pen.restore();
  rivets(k, [[a - R * 0.86, 0.32, z], [a + R * 0.86, 0.32, z], [a, 0.32, z + R * 0.86], [a, 0.32, z - R * 0.86]], tone(C.trimOrange), 0.12);
}

// ── a slim strip lamp ───────────────────────────────────────────────────────
// A white light bar in a grey frame, warm white, its glow on the panels.

function lamp(k: Kit, v: RoomView, f: Feature): void {
  const { z0, z1 } = lampZ(v.H);
  const a = f.a;
  k.wash(a, 0.05, (z0 + z1) / 2, 3.2, (z1 - z0) * 0.75, C.amberLight, 0.32);
  k.poly(rrect(a - 0.75, z0, a + 0.75, z1, 0.4, 0.75), k.hgrad([a - 0.75, 0.4, z0], [a + 0.75, 0.4, z0], [[0, '#eef0f3'], [1, C.metal]]), k.lw);
  k.poly(rrect(a - 0.35, z0 + 0.5, a + 0.35, z1 - 0.5, 0.42, 0.35), k.vgrad(a, 0.42, z0, z1, [[0, '#ffe7c2'], [0.5, '#fffaf0'], [1, '#ffe7c2']]), 0);
  k.halo(a, 0.6, (z0 + z1) / 2, 2.2, '#fff3dc', 0.4);
}

// ── the shell's edges: wall tops, cut ends, the deck slab ────────────────────

function shell(k: Kit, v: RoomView): void {
  const { W, D, H, T } = v;
  const cap = '#e9eef5';
  // the deck's cut edges: a white skin over dark plate
  if (k.sees(T, D - 1, -SLAB, W, D, 0) || k.sees(W - 1, T, -SLAB, W, D, 0)) {
    k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side(C.deckDark, 0, 1), k.lw);
    k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side(C.deckDark, 1, 0), k.lw);
    k.line([[T, D, -0.45], [W, D, -0.45], [W, T, -0.45]], withAlpha(C.cyan, 0.8), Math.max(1, 0.22 * k.s));
    k.line([[T, D, -SLAB + 0.5], [W, D, -SLAB + 0.5], [W, T, -SLAB + 0.5]], withAlpha('#ffffff', 0.25), Math.max(0.8, 0.12 * k.s));
  }
  // the walls' cut ends: white skin, a grey core ribbed in orange
  for (const [p, q, nu, nv] of [[[0, D], [T, D], 0, 1], [[W, 0], [W, T], 1, 0]] as const) {
    if (!k.sees(Math.min(p[0], q[0]), Math.min(p[1], q[1]), -SLAB, Math.max(p[0], q[0]), Math.max(p[1], q[1]), H)) continue;
    k.poly([[p[0], p[1], -SLAB], [q[0], q[1], -SLAB], [q[0], q[1], H], [p[0], p[1], H]], k.side('#dfe5ee', nu, nv), k.lw);
    const at = (f: number, z: number): P3 => [p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f, z];
    k.poly([at(0.22, 0.6), at(0.78, 0.6), at(0.78, H - 0.6), at(0.22, H - 0.6)], k.side('#a9afb9', nu, nv, 0.14), k.thin);
    const ribs: Array<[P3, P3]> = [];
    for (let z = 3; z < H - 1; z += 3) ribs.push([at(0.22, z), at(0.78, z)]);
    k.segs(ribs, withAlpha(C.trimOrange, 0.8), Math.max(0.8, 0.16 * k.s));
  }
  if (k.sees(0, 0, H - 1, W, D, H)) {
    k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
    k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], '#ffffff', Math.max(1, 0.2 * k.s));
    k.line([[T - 0.5, D, H], [T - 0.5, T - 0.5, H], [W, T - 0.5, H]], withAlpha(C.metal, 0.7), Math.max(0.8, 0.14 * k.s));
  }
  // inner edges: wall to floor, and the corner
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.4), k.thin);
}

// ── per frame ────────────────────────────────────────────────────────────────

const MOTE_COLORS: readonly Color[] = [C.cyan, C.magenta, C.gold];

// Motes of light drifting before the glass bays, each on its own slow
// loop, high enough to float over the crew's heads.
function motes(v: RoomView, bays: ReadonlyArray<Feature>): void {
  const { z0, z1 } = bayZ(v.H);
  const lo = Math.max(z0 + 4, 16);
  const hi = Math.max(lo + 2, z1 - 2);
  const N = Math.min(12, Math.max(8, bays.length * 2));
  for (let i = 0; i < N; i++) {
    const f = bays[i % bays.length];
    const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
    const per = 9 + hash(i, 71) * 7;
    const th = (v.t / per) * Math.PI * 2 + hash(i, 72) * 6.28;
    const a = f.a + (hash(i, 73) - 0.5) * f.w * 0.8 + Math.sin(th) * 1.6;
    const n = 1.5 + hash(i, 74) * 3 + Math.cos(th * 0.7) * 0.8;
    const z = lo + hash(i, 75) * (hi - lo) + Math.sin(th * 1.3 + 1) * 1.8;
    const r = 0.3 + hash(i, 76) * 0.3;
    const c = MOTE_COLORS[i % MOTE_COLORS.length];
    // breathing a little as they go (never past half opaque)
    const a0 = 0.42 + 0.08 * Math.sin(th * 2.1);
    const [x, y] = k.p(a, n, z);
    mote(v.pen, x, y, Math.max(1.6, r * v.s), c, a0);
  }
}

// A mote of light: a soft round dot r px across, its middle at alpha a,
// its edge melting into a faint halo twice as wide.
function mote(pen: RoomView['pen'], x: number, y: number, r: number, c: Color, a: number): void {
  const g = pen.createRadialGradient(x, y, 0, x, y, r * 2.4);
  g.addColorStop(0, withAlpha(mix(c, '#ffffff', 0.55), a));
  g.addColorStop(0.3, withAlpha(c, a * 0.85));
  g.addColorStop(0.45, withAlpha(c, a * 0.35));
  g.addColorStop(1, withAlpha(c, 0));
  pen.fillStyle = g;
  pen.beginPath();
  pen.arc(x, y, r * 2.4, 0, Math.PI * 2);
  pen.fill();
}

// Now and then (about every seven seconds) a star falls across the upper
// glass of one bay: a bright head and a fading tail, over in a second.
function fallingStar(k: Kit, v: RoomView, f: Feature): void {
  const PERIOD = 7;
  const LIFE = 1.1;
  const t = (v.t + hash(f.k, 81) * PERIOD) % PERIOD;
  if (t > LIFE) return;
  const p = t / LIFE;
  const { z1 } = bayZ(v.H);
  const lo = Math.max(19, bayZ(v.H).zh + 4);
  if (z1 - lo < 3) return;
  const pen = k.pen;
  const n = -DEPTH;
  const cycle = Math.floor((v.t + hash(f.k, 81) * PERIOD) / PERIOD);
  const dir = hash(cycle, 82) < 0.5 ? -1 : 1;
  const ow = bayW(f);
  const sa = f.a - dir * (ow / 2 + 1);
  const sz = z1 - 1 - hash(cycle, 83) * 2.5;
  const len = ow + 3;
  const drop = Math.min(z1 - lo - 1, 5 + hash(cycle, 84) * 3);
  const head: P3 = [sa + dir * len * p, n, sz - drop * p];
  const tailF = Math.max(0, p - 0.38);
  const tail: P3 = [sa + dir * len * tailF, n, sz - drop * tailF];
  pen.save();
  pen.beginPath();
  k.trace(opening(f.a, ow, Math.max(bayZ(v.H).z0, lo), z1, 0.03));
  pen.clip();
  const fade = p < 0.8 ? 1 : (1 - p) / 0.2;
  const [hx, hy] = k.p(...head);
  const [tx, ty] = k.p(...tail);
  // a soft wide glow along the streak, then its bright core
  for (const [w, a, c] of [[0.9, 0.35, '#ffd6ec'], [0.3, 0.95, '#fffbe8']] as const) {
    const g = pen.createLinearGradient(tx, ty, hx, hy);
    g.addColorStop(0, withAlpha(c, 0));
    g.addColorStop(1, withAlpha(c, a * fade));
    pen.beginPath();
    pen.moveTo(tx, ty);
    pen.lineTo(hx, hy);
    pen.strokeStyle = g;
    pen.lineWidth = Math.max(1.2, w * v.s);
    pen.lineCap = 'round';
    pen.stroke();
  }
  softDot(pen, hx, hy, 2.2 * v.s, '#fff4c8', 0.85 * fade);
  softDot(pen, hx, hy, 0.6 * v.s, '#ffffff', fade, 'source-over');
  pen.restore();
}

// The map's position dot on each wall screen, blinking.
function blip(k: Kit, v: RoomView, f: Feature): void {
  const { z0, z1 } = screenZ(v.H);
  const on = (v.t * 1.3 + hash(f.k, 91)) % 1 < 0.55;
  const u = f.a + (hash(f.k, 92) - 0.5) * (f.w - 2.5);
  const z = z0 + 1.1 + hash(f.k, 93) * (z1 - z0 - 2.2);
  const [x, y] = k.p(u, 0.6, z);
  softDot(k.pen, x, y, 1.1 * v.s, C.magenta, on ? 0.7 : 0.25);
  const pen = k.pen;
  pen.beginPath();
  pen.arc(x, y, Math.max(1, 0.2 * v.s), 0, Math.PI * 2);
  pen.fillStyle = on ? '#ffe2f2' : '#b04a86';
  pen.fill();
}
