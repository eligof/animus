import type { At } from '../../art/iso.ts';
import { frame, mix, shade } from '../../art/iso.ts';
import type { Color, Pen } from '../../art/types.ts';
import { planLayout, wallGaps } from '../../world/layout.ts';
import { defaultPois } from '../../world/room.ts';
import type { Layout, Poi, Slot } from '../../world/types.ts';
import type { RoomArt, RoomView } from '../types.ts';
import { bolt, bulb, beaker, erlenmeyer, gauge, hazard, mutant, pilot, pot, ring, fillPts, scrawl, zigzag } from './bits.ts';
import type { P3 } from './kit.ts';
import { C, INK, Kit, hash, withAlpha } from './kit.ts';

// The lab's shell on a stormy night: a checker floor of pale and slate
// tiles, a mint-tiled dado under white subway tile, steel-framed windows
// onto the storm, a painted band up top where pipes run, and between the
// stations the wall's furniture: the generator (a cabinet of dials and a
// knife switch with valves glowing on top and a Jacob's ladder over it),
// a periodic table, shelves of reagents, hazard signs, a first-aid box and
// extinguisher, a cork board of notes, a clock and caged lamps. Mats and
// pools of light lie on the floor where the stations stand. Every piece sits
// in the free stretches of wall between the stations, worked out from the
// same plan the stage uses, so nothing hangs behind a shelf or a door.

type Wall = 'left' | 'right';
type Kind = 'gen' | 'window' | 'periodic' | 'shelf' | 'signs' | 'aid' | 'board' | 'clock' | 'lamp';
export type Feature = { wall: Wall; kind: Kind; a: number; w: number; k: number };
export type Plan = { L: Layout; features: Feature[] };

const SLAB = 2.5; // the floor's thickness, shown along the front cut
const WAIN = 8; // the mint dado's top
const SKIRT = 1; // the cove at the foot of the wall
const CHECK = 6; // floor tile side
const GEN = 17; // the generator's bay

// ── the plan ───────────────────────────────────────────────────────────────

const PLANS = new Map<string, Plan>();

// The stage's layout for a room this size (planLayout is a pure function of
// the room's side, so the shell can find the stations without being told),
// and what hangs on the walls between them.
export function planFor(W: number, D: number, H: number, T: number): Plan {
  const key = `${W}x${D}x${H}x${T}`;
  const hit = PLANS.get(key);
  if (hit) return hit;
  let L = planLayout(2 * W + 12, W + H + 12, 'lab');
  if (L.W !== W || L.D !== D || L.H !== H || L.T !== T) L = { W, D, H, T, slots: [] };
  const plan = { L, features: features(L) };
  PLANS.set(key, plan);
  return plan;
}

const between = (L: Layout, wall: Wall, a0: number, a1: number) => {
  const on = L.slots.filter((s) => s.wall === wall && !s.island).map((s) => (wall === 'right' ? s.x0 : s.y0));
  return on.some((p) => p < a0) && on.some((p) => p >= a1);
};

// The generator in the longest stretch between two stations, else the
// longest stretch; then windows with charts, shelves and signs between
// them in what is left, and caged lamps between neighbouring windows.
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
  // (in a small room's short walls, a tighter bay: the cabinet still fits)
  const longest = (list: typeof spans) => [...list].sort((p, q) => q.a1 - q.a0 - (p.a1 - p.a0))[0];
  for (const bay of [GEN, GEN - 2]) {
    const fits = spans.filter((s) => s.a1 - s.a0 >= bay + 2);
    const pick = longest(fits.filter((s) => between(L, s.wall, s.a0, s.a1))) ?? longest(fits);
    if (!pick) continue;
    const mid = (pick.a0 + pick.a1) / 2;
    out.push({ wall: pick.wall, kind: 'gen', a: mid, w: bay, k: 0 });
    spans.splice(spans.indexOf(pick), 1, { wall: pick.wall, a0: pick.a0, a1: mid - bay / 2 - 2 }, { wall: pick.wall, a0: mid + bay / 2 + 2, a1: pick.a1 });
    break;
  }
  const WIDTH: Record<Kind, number> = { gen: GEN, window: 10, periodic: 13, shelf: 9, signs: 7, aid: 5, board: 9, clock: 4, lamp: 2 };
  const ORDER: Kind[] = ['window', 'periodic', 'window', 'shelf', 'window', 'board', 'window', 'signs', 'window', 'aid', 'window', 'clock', 'window', 'shelf', 'window', 'signs'];
  const cap: Partial<Record<Kind, number>> = { periodic: 1, board: 1, clock: 1, aid: 2, shelf: 2, signs: 3 };
  const count: Partial<Record<Kind, number>> = {};
  const windows = { left: 0, right: 0 };
  let n = 0;
  spans.sort((p, q) => (p.wall === q.wall ? p.a0 - q.a0 : p.wall === 'right' ? -1 : 1));
  for (const s of spans) {
    const len = s.a1 - s.a0;
    const kinds: Kind[] = [];
    let used = 0;
    const room = (k: Kind) => used + WIDTH[k] + (kinds.length ? 4 : 0) <= len;
    for (;;) {
      let k: Kind | undefined;
      if (!windows[s.wall] && room('window')) k = 'window';
      for (let i = 0; !k && i < ORDER.length; i++) {
        const c = ORDER[(n + i) % ORDER.length];
        if ((count[c] ?? 0) < (cap[c] ?? Infinity) && room(c)) k = c;
      }
      k ??= room('signs') && (count.signs ?? 0) < 5 ? 'signs' : room('lamp') ? 'lamp' : undefined;
      if (!k) break;
      used += WIDTH[k] + (kinds.length ? 4 : 0);
      kinds.push(k);
      count[k] = (count[k] ?? 0) + 1;
      if (k === 'window') windows[s.wall]++;
      n++;
    }
    if (!kinds.length) continue;
    const gap = (len - kinds.reduce((m, k) => m + WIDTH[k], 0)) / (kinds.length + 1);
    const first = out.length;
    let at = s.a0 + gap;
    kinds.forEach((k, i) => {
      out.push({ wall: s.wall, kind: k, a: at + WIDTH[k] / 2, w: WIDTH[k], k: n * 7 + i });
      at += WIDTH[k] + gap;
    });
    // Lamps between neighbours with room for them.
    for (let i = 0; i + 1 < kinds.length; i++) {
      if (gap < 4.5 || kinds[i] === 'lamp' || kinds[i + 1] === 'lamp') continue;
      if (kinds[i] !== 'window' && kinds[i + 1] !== 'window') continue;
      const left = out[first + i];
      out.push({ wall: s.wall, kind: 'lamp', a: left.a + left.w / 2 + gap / 2, w: 2, k: n + i });
    }
  }
  return out;
}

// Windows: sill and head (z) for a wall H tall; the tile runs a little
// above them, the painted band from there to the cornice.
export function windowZ(H: number): { z0: number; z1: number } {
  const z0 = WAIN + 3.5;
  return { z0, z1: Math.min(H - 13, z0 + 26) };
}
const tileTop = (H: number) => windowZ(H).z1 + 2.5;
const lampZ = (H: number) => Math.min(windowZ(H).z1 - 2, 26);

// The Jacob's ladder over the generator: its rods' feet and tops.
const LADDER = { u: 4, z0: 17.4, z1: 29, gap0: 0.35, gap1: 2.2 };

// ── points of interest ─────────────────────────────────────────────────────
// The usual spots, but warm by the generator (its valves glow) rather than
// round the sofa, a look at its sparks and out of a couple of the windows,
// coffee at the break corner.
export function labPois(L: Layout): Poi[] {
  const { features: fs } = planFor(L.W, L.D, L.H, L.T);
  const pt = (wall: Wall, a: number, out: number) => (wall === 'right' ? { x: a, y: L.T + out } : { x: L.T + out, y: a });
  const out = defaultPois(L).filter((p) => p.kind !== 'warm' && p.kind !== 'drink');
  const gen = fs.find((f) => f.kind === 'gen');
  if (gen) {
    const face = pt(gen.wall, gen.a + LADDER.u, 0);
    // the valves keep it warm: somewhere to sit by it, and to watch the arc
    out.push({ ...pt(gen.wall, gen.a - 4, 7), kind: 'warm', face }, { ...pt(gen.wall, gen.a + 7, 7), kind: 'warm', face }, { ...pt(gen.wall, gen.a + 1, 10), kind: 'view', face });
  }
  for (const f of fs.filter((g) => g.kind === 'window').slice(0, 3)) out.push({ ...pt(f.wall, f.a, 6), kind: 'view', face: pt(f.wall, f.a, 0) });
  const idle = L.slots.find((q) => q.kind === 'idle');
  if (idle) {
    const at = (u: number, v: number) => (idle.wall === 'right' ? { x: idle.x0 + u, y: idle.y0 + v } : { x: idle.x0 + v, y: idle.y0 + u });
    out.push({ ...at(idle.len + 3, 8), kind: 'drink', face: at(idle.len / 2, 8) }, { ...at(-3, 7), kind: 'seat', face: at(idle.len / 2, 6) });
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
  overlay(v: RoomView): void {
    const plan = planFor(v.W, v.D, v.H, v.T);
    v.pen.save();
    for (const f of plan.features) {
      if (f.kind !== 'window' && f.kind !== 'gen') continue;
      const k = new Kit(v.pen, wallAt(v.at, f.wall, v.T), v.s);
      if (f.kind === 'window') lightning(k, v, f);
      else ladderArc(k, v, f);
    }
    v.pen.restore();
  },
};

// Whether a screen point is on (or within m px of) the pen's canvas: tiles
// of the base are painted one at a time, so repeated small marks skip what
// a tile cannot show.
const near = (pen: Pen, x: number, y: number, m: number) => x > -m && y > -m && x < pen.width + m && y < pen.height + m;

// ── floor ──────────────────────────────────────────────────────────────────

function floor(k: Kit, v: RoomView, plan: Plan): void {
  const { pen } = k;
  const { W, D, T, s } = v;
  // The light tiles over the whole floor, the slate ones on top: one path.
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], C.floorA, 0);
  const m = CHECK * s * 1.6;
  pen.beginPath();
  for (let y = T; y < D; y += CHECK) {
    for (let x = T; x < W; x += CHECK) {
      if ((Math.round((x - T) / CHECK) + Math.round((y - T) / CHECK)) % 2 === 0) continue;
      const [cx, cy] = k.p(x + CHECK / 2, y + CHECK / 2, 0);
      if (!near(pen, cx, cy, m)) continue;
      const x1 = Math.min(W, x + CHECK);
      const y1 = Math.min(D, y + CHECK);
      k.trace([[x, y, 0], [x1, y, 0], [x1, y1, 0], [x, y1, 0]]);
    }
  }
  pen.fillStyle = C.floorB;
  pen.fill();
  // grout between the tiles, and a glaze sheen along each light tile's
  // lit edge when zoomed in
  pen.beginPath();
  for (let y = T + CHECK; y < D; y += CHECK) {
    const [a, b] = [k.p(T, y, 0), k.p(W, y, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  for (let x = T + CHECK; x < W; x += CHECK) {
    const [a, b] = [k.p(x, T, 0), k.p(x, D, 0)];
    pen.moveTo(a[0], a[1]);
    pen.lineTo(b[0], b[1]);
  }
  pen.strokeStyle = '#5e7a7e80';
  pen.lineWidth = Math.max(0.7, 0.09 * s);
  pen.lineCap = 'butt';
  pen.stroke();
  if (k.fine) {
    pen.beginPath();
    for (let y = T; y < D; y += CHECK) {
      for (let x = T; x < W; x += CHECK) {
        if ((Math.round((x - T) / CHECK) + Math.round((y - T) / CHECK)) % 2 !== 0) continue;
        const [cx, cy] = k.p(x + CHECK / 2, y + CHECK / 2, 0);
        if (!near(pen, cx, cy, m)) continue;
        const a = k.p(x + 0.4, y + CHECK - 0.4, 0);
        const b = k.p(x + 0.4, y + 0.4, 0);
        const c = k.p(x + CHECK - 0.4, y + 0.4, 0);
        pen.moveTo(a[0], a[1]);
        pen.lineTo(b[0], b[1]);
        pen.lineTo(c[0], c[1]);
      }
    }
    pen.strokeStyle = '#ffffff40';
    pen.lineWidth = 0.12 * s;
    pen.lineJoin = 'round';
    pen.stroke();
  }
  // Shade: darker toward the walls' feet and the far corner.
  const corner = k.p(T, T, 0);
  const far = k.p(W, D, 0);
  const g = pen.createRadialGradient(corner[0], corner[1], 0, corner[0], corner[1], Math.hypot(far[0] - corner[0], far[1] - corner[1]));
  g.addColorStop(0, '#0a1e2440');
  g.addColorStop(0.3, '#0a1e2414');
  g.addColorStop(0.7, '#0a1e2400');
  g.addColorStop(1, '#0a1e241c');
  k.poly([[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], g, 0);
  for (const wall of ['right', 'left'] as const) {
    const wk = new Kit(pen, wallAt(v.at, wall, T), s);
    const end = wall === 'right' ? W : D;
    wk.poly([[T, 0, 0], [end, 0, 0], [end, 3.5, 0], [T, 3.5, 0]], wk.lgrad([0, 0, 0], [0, 3.5, 0], [1, 0, 0], [[0, '#0a1e2466'], [0.35, '#0a1e2422'], [1, '#0a1e2400']]), 0);
  }
  // Mats where people stand and work, the break corner's rug, then light.
  const slot = (kind: Slot['kind']) => plan.L.slots.find((q) => q.kind === kind);
  const sk = (q: Slot) => new Kit(pen, frame(v.at, q.wall, q.x0, q.y0), s);
  const write = slot('write');
  if (write) mat(sk(write), 1, write.dep + 0.6, write.len - 2, 4.6);
  const search = slot('search');
  if (search) mat(sk(search), 1.5, search.dep + 0.8, search.len - 3, 4.2);
  const web = slot('web');
  if (web) mat(sk(web), 1, web.dep + 0.6, web.len - 2, 4.2);
  const idle = slot('idle');
  if (idle) oval(sk(idle), idle.len / 2, idle.dep / 2 + 0.5, idle.len / 2 + 2.5, idle.dep / 2 + 2);
  const gen = plan.features.find((f) => f.kind === 'gen');
  if (gen) {
    const gk = new Kit(pen, wallAt(v.at, gen.wall, T), s);
    hazard(gk, [[gen.a - 7.5, 2.6, 0.04], [gen.a + 7.5, 2.6, 0.04], [gen.a + 7.5, 5.4, 0.04], [gen.a - 7.5, 5.4, 0.04]], 0.7);
    gk.pool(gen.a + LADDER.u, 4, 12, 9, '#a68cff', 0.22);
  }
  for (const [kind, u, w, r, c, a] of [
    ['write', 0.55, 0.6, 10, '#a8ff8a', 0.22],
    ['run', 0.45, 0.45, 15, '#a68cff', 0.3],
    ['web', 0.5, 0.6, 9, '#7ff0d0', 0.2],
    ['idle', 0.85, 0.3, 11, C.warm, 0.26],
    ['search', 0.4, 0.8, 9, '#9fe0ff', 0.18],
    ['read', 0.5, 0.8, 9, C.lamp, 0.16],
    ['think', 0.5, 0.9, 9, C.lamp, 0.14],
  ] as const) {
    const q = slot(kind);
    if (!q) continue;
    sk(q).pool(q.len * u, q.dep * w, r, r * 0.8, c, a);
  }
  for (const f of plan.features) {
    const wk = new Kit(pen, wallAt(v.at, f.wall, T), s);
    if (f.kind === 'lamp') wk.pool(f.a, 4, 8, 6, C.lamp, 0.2);
    else if (f.kind === 'window') wk.pool(f.a, 3, 6, 4, '#8aa4d6', 0.1);
  }
}

// A rubber anti-fatigue mat: dark, round-cornered, dotted.
function mat(k: Kit, u0: number, v0: number, du: number, dv: number): void {
  const z = 0.04;
  k.shadow(u0 + du / 2, v0 + dv / 2, du * 0.55, dv * 0.6, 0.1);
  k.poly([[u0, v0, z], [u0 + du, v0, z], [u0 + du, v0 + dv, z], [u0, v0 + dv, z]], '#3b4a50', k.thin, 0.5);
  k.poly([[u0 + 0.5, v0 + 0.5, z], [u0 + du - 0.5, v0 + 0.5, z], [u0 + du - 0.5, v0 + dv - 0.5, z], [u0 + 0.5, v0 + dv - 0.5, z]], '#45565c', 0, 0.3);
  if (!k.fine) return;
  const pen = k.pen;
  pen.beginPath();
  for (let a = u0 + 1; a < u0 + du - 0.7; a += 0.9) {
    for (let b = v0 + 1; b < v0 + dv - 0.7; b += 0.9) {
      const [x, y] = k.p(a, b, z);
      const r = 0.13 * k.s;
      pen.moveTo(x + r, y);
      pen.ellipse(x, y, r, r * 0.5, 0, 0, Math.PI * 2);
    }
  }
  pen.fillStyle = '#2e3b40';
  pen.fill();
}

// A braided oval rug: rings of warm colour.
function oval(k: Kit, cu: number, cv: number, ru: number, rv: number): void {
  const z = 0.05;
  k.shadow(cu, cv, ru * 1.05, rv * 1.05, 0.1);
  const rings: Color[] = ['#a8552e', '#e3a64a', '#c86a3a', '#3f8a80', '#e8c27a', '#b4582f', '#e3a64a'];
  const pen = k.pen;
  rings.forEach((c, i) => {
    const f = 1 - i / rings.length;
    pen.beginPath();
    const pts: P3[] = [];
    for (let j = 0; j < 32; j++) {
      const a = (j / 32) * Math.PI * 2;
      pts.push([cu + Math.cos(a) * ru * f, cv + Math.sin(a) * rv * f, z]);
    }
    k.trace(pts);
    k.paint(c, i === 0 ? k.thin : 0);
  });
}

// ── walls ──────────────────────────────────────────────────────────────────

// The painted band above the tile, darker toward the cornice.
const BAND: ReadonlyArray<readonly [number, Color]> = [[0, '#9fc2bd'], [0.45, '#7ea6a2'], [1, '#5a807f']];

function wallFace(k: Kit, v: RoomView, plan: Plan, wall: Wall): void {
  const { pen, s } = k;
  const { T, H } = v;
  const end = wall === 'right' ? v.W : v.D;
  const lit = k.lit(0, 1);
  const tone = (c: Color, d = 0.12) => (lit ? c : shade(c, -d));
  const top = tileTop(H);
  // The painted band, the white subway tile, the mint dado.
  k.poly([[T, 0, top], [end, 0, top], [end, 0, H], [T, 0, H]], k.vgrad(T, 0, top, H, BAND.map(([t, c]) => [t, tone(c)] as const)), 0);
  k.poly([[T, 0, WAIN], [end, 0, WAIN], [end, 0, top], [T, 0, top]], k.vgrad(T, 0, WAIN, top, [[0, tone('#e3eeea')], [0.5, tone(C.tile)], [1, tone('#e6efec')]]), 0);
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, WAIN], [T, 0, WAIN]], tone(C.mint), 0);
  grout(k, T, end, WAIN, top, 3, 1.5, withAlpha(lit ? '#7fa29c' : '#6d8f8a', 0.5));
  grout(k, T, end, SKIRT, WAIN, 2, 2, withAlpha('#4f9a85', 0.55));
  // the far corner in shadow
  k.poly([[T, 0, 0], [T + 9, 0, 0], [T + 9, 0, H], [T, 0, H]], k.grad([T, 0, 0], [T + 9, 0, 0], [[0, '#0a1e2430'], [1, '#0a1e2400']]), 0);
  // cove, the dado's cap, the trim over the tile, the cornice
  k.poly([[T, 0, 0], [end, 0, 0], [end, 0, SKIRT], [T, 0, SKIRT]], tone(C.tealDark), 0);
  k.box(T, 0, WAIN, end - T, 0.4, 0.55, C.teal, { line: k.thin, stripe: false });
  k.box(T, 0, top - 0.5, end - T, 0.3, 0.5, C.teal, { line: k.thin, stripe: false });
  k.poly([[T, 0, H - 2.4], [end, 0, H - 2.4], [end, 0, H], [T, 0, H]], tone('#dbe6e3'), 0);
  k.box(T, 0, H - 1.3, end - T, 0.5, 0.9, '#eef4f2', { line: k.thin, stripe: false });
  k.line([[T, 0, H - 2.4], [end, 0, H - 2.4]], shade('#dbe6e3', -0.3), Math.max(0.8, 0.12 * s));
  pipes(k, v, end, lit);
  for (const f of plan.features) {
    if (f.wall !== wall) continue;
    if (f.kind === 'window' && hash(f.k, 81) < 0.6) vent(k, v, f.a, f.k);
    if (f.kind === 'window') windowArt(k, v, f, lit);
    else if (f.kind === 'gen') generator(k, v, f);
    else if (f.kind === 'periodic') periodic(k, v, f);
    else if (f.kind === 'shelf') shelf(k, f);
    else if (f.kind === 'signs') signs(k, f);
    else if (f.kind === 'aid') aid(k, f);
    else if (f.kind === 'board') board(k, v, f);
    else if (f.kind === 'clock') clock(k, v, f);
    else if (f.kind === 'lamp') lamp(k, v, f);
  }
}

// Grout across a wall from a0 to a1 between z0 and z1: courses `th` tall,
// tiles `tw` long, every other course offset by half a tile.
function grout(k: Kit, a0: number, a1: number, z0: number, z1: number, tw: number, th: number, color: Color): void {
  const { pen, s } = k;
  const m = tw * s * 2;
  pen.beginPath();
  for (let z = z0 + th; z < z1 - 0.2; z += th) {
    const [x0, y0] = k.p(a0, 0.01, z);
    const [x1, y1] = k.p(a1, 0.01, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  let r = 0;
  for (let z = z0; z < z1 - 0.2; z += th, r++) {
    const zt = Math.min(z1, z + th);
    for (let a = a0 + (r & 1 ? tw / 2 : tw); a < a1; a += tw) {
      const [x0, y0] = k.p(a, 0.01, z);
      if (!near(pen, x0, y0, m)) continue;
      const [x1, y1] = k.p(a, 0.01, zt);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
  }
  pen.strokeStyle = color;
  pen.lineWidth = Math.max(0.6, 0.07 * s);
  pen.lineCap = 'butt';
  pen.stroke();
}

// Two pipes along the top band on standoffs, a copper one and a steel one,
// with flanges, valve wheels and now and then a glass section where a green
// reagent glows through.
function pipes(k: Kit, v: RoomView, end: number, lit: boolean): void {
  const { T, H } = v;
  const z0 = H - 5.2;
  const z1 = H - 7.2;
  if (z1 < tileTop(H) + 1) return;
  const n = 0.75;
  // standoff brackets
  for (let a = T + 4; a < end - 1; a += 12) {
    k.poly([[a - 0.25, 0.02, z1 - 0.7], [a + 0.25, 0.02, z1 - 0.7], [a + 0.25, 0.02, z0 + 0.5], [a - 0.25, 0.02, z0 + 0.5]], C.steelDark, k.thin * 0.8);
  }
  const pipe = (z: number, color: Color, w: number) => {
    k.rod([[T, n, z], [end, n, z]], color, w);
    k.line([[T, n, z + w * 0.22], [end, n, z + w * 0.22]], shade(color, lit ? 0.45 : 0.3), Math.max(0.7, w * 0.22 * k.s));
  };
  pipe(z1, C.steel, 1.0);
  pipe(z0, C.copper, 0.7);
  for (let a = T + 10, i = 0; a < end - 3; a += 24, i++) {
    k.cyl(a, n, z1 - 0.55, 0.62, 1.1, C.steelDark, { line: k.thin });
    // flange on the copper pipe
    k.rod([[a + 6, n, z0 - 0.45], [a + 6, n, z0 + 0.45]], C.copperDark, 0.25);
    if (hash(i, 7) < 0.45) {
      // a glass run with the reagent glowing in it
      const g0 = a + 13;
      const g1 = g0 + 4;
      if (g1 < end - 2) {
        k.line([[g0, n, z0], [g1, n, z0]], INK, 0.55 * k.s + k.lw * 1.4);
        k.line([[g0, n, z0], [g1, n, z0]], C.green, 0.55 * k.s);
        k.line([[g0, n, z0 + 0.12], [g1, n, z0 + 0.12]], '#e8ffd0', Math.max(0.7, 0.12 * k.s));
        k.halo((g0 + g1) / 2, n + 0.3, z0, 3.5, C.greenGlow, 0.35);
        for (const g of [g0, g1]) k.rod([[g, n, z0 - 0.42], [g, n, z0 + 0.42]], C.copperDark, 0.25);
      }
    } else if (hash(i, 8) < 0.5) {
      // a valve wheel
      const c: P3 = [a + 15, n + 0.6, z0];
      k.rod([[a + 15, n, z0], c], C.brass, 0.18);
      fillPts(k, ring(k, c, [0, 1, 0], 0.75, 16), C.red, k.thin);
      fillPts(k, ring(k, [c[0], c[1] + 0.02, c[2]], [0, 1, 0], 0.4, 12), shade(C.red, -0.3), 0);
    }
  }
}

// A steel-framed window onto the storm: the reveal, the night beyond (clouds,
// a hill with a tower or a town, rain), a grid of glazing bars and a sill
// with something left on it.
function windowArt(k: Kit, v: RoomView, f: Feature, lit: boolean): void {
  const { pen, s } = k;
  const { z0, z1 } = windowZ(v.H);
  const w = f.w - 1.6;
  const a = f.a;
  const u0 = a - w / 2;
  const u1 = a + w / 2;
  const depth = 0.9;
  // casing and reveal
  k.poly([[u0 - 0.8, 0.05, z0 - 0.3], [u1 + 0.8, 0.05, z0 - 0.3], [u1 + 0.8, 0.05, z1 + 0.8], [u0 - 0.8, 0.05, z1 + 0.8]], lit ? '#dfe9e6' : shade('#dfe9e6', -0.12), k.lw);
  const open: P3[] = [[u0, 0.06, z0], [u1, 0.06, z0], [u1, 0.06, z1], [u0, 0.06, z1]];
  k.poly(open, lit ? '#b9cbc8' : shade('#b9cbc8', -0.14), 0);
  pen.save();
  pen.beginPath();
  k.trace(open);
  pen.clip();
  const back = (u: number, z: number): P3 => [u, -depth, z];
  k.poly([back(u0 - 1, z0), back(u1 + 1, z0), back(u1 + 1, z1), back(u0 - 1, z1)], k.vgrad(a, -depth, z0, z1, [[0, '#4a5d8c'], [0.4, '#2c3866'], [1, '#161c3c']]), 0);
  // clouds: dark rolls with a lit rim
  for (let i = 0; i < 4; i++) {
    const cz = z1 - 2 - hash(f.k, i, 11) * (z1 - z0) * 0.45;
    const cu = u0 + hash(f.k, i, 12) * w;
    const [x, y] = k.p(cu, -depth, cz);
    const rx = (2.4 + hash(f.k, i, 13) * 2.4) * s;
    pen.beginPath();
    pen.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
    pen.fillStyle = i & 1 ? '#232c55' : '#2a3460';
    pen.fill();
    pen.beginPath();
    pen.ellipse(x - rx * 0.1, y - rx * 0.12, rx * 0.8, rx * 0.12, 0, Math.PI * 1.05, Math.PI * 1.95);
    pen.strokeStyle = '#6f7fb066';
    pen.lineWidth = Math.max(0.7, 0.1 * s);
    pen.stroke();
  }
  // the moon behind the clouds, on some windows
  if (hash(f.k, 14) < 0.35) {
    k.halo(u0 + w * 0.7, -depth, z1 - 4, 3, '#dfe8ff', 0.35);
    const [mx, my] = k.p(u0 + w * 0.7, -depth, z1 - 4);
    pen.beginPath();
    pen.arc(mx, my, 1.1 * s, 0, Math.PI * 2);
    pen.fillStyle = '#eef2ff';
    pen.fill();
  }
  // a hill, and on it a crooked tower with a lit window, or a dark town
  const hz = z0 + 4 + hash(f.k, 15) * 3;
  const hill: P3[] = [back(u0 - 1, z0)];
  for (let i = 0; i <= 8; i++) {
    const u = u0 - 1 + ((w + 2) * i) / 8;
    hill.push(back(u, hz + Math.sin(i * 0.9 + f.k) * 1.4 + (i === 4 ? 1.2 : 0)));
  }
  hill.push(back(u1 + 1, z0));
  k.poly(hill, '#121935', 0);
  if (hash(f.k, 16) < 0.5) {
    const tu = u0 + w * (0.3 + hash(f.k, 17) * 0.4);
    const tb = hz + 1;
    k.poly([back(tu - 0.9, tb - 1), back(tu + 0.9, tb - 1), back(tu + 0.7, tb + 6), back(tu + 1.0, tb + 6), back(tu + 1.0, tb + 6.8), back(tu - 1.0, tb + 6.8), back(tu - 1.0, tb + 6), back(tu - 0.7, tb + 6)], '#0d1229', 0);
    k.poly([back(tu - 1.1, tb + 6.8), back(tu + 1.1, tb + 6.8), back(tu, tb + 8.6)], '#0d1229', 0);
    k.poly([back(tu - 0.25, tb + 4), back(tu + 0.25, tb + 4), back(tu + 0.25, tb + 4.8), back(tu - 0.25, tb + 4.8)], '#ffd27a', 0);
    k.halo(tu, -depth, tb + 4.4, 1.4, '#ffc070', 0.35);
  } else {
    pen.beginPath();
    for (let i = 0; i < 6; i++) {
      const u = u0 + 0.3 + hash(f.k, i, 18) * (w - 0.6);
      const hh = 1 + hash(f.k, i, 19) * 2.5;
      k.trace([back(u - 0.6, z0), back(u + 0.6, z0), back(u + 0.6, hz - 1 + hh), back(u, hz + hh), back(u - 0.6, hz - 1 + hh)]);
    }
    pen.fillStyle = '#0d1229';
    pen.fill();
    pen.beginPath();
    for (let i = 0; i < 5; i++) {
      if (hash(f.k, i, 20) < 0.4) continue;
      const u = u0 + 0.5 + hash(f.k, i, 21) * (w - 1);
      const z = z0 + 1 + hash(f.k, i, 22) * (hz - z0 - 1.5);
      k.trace([back(u, z), back(u + 0.35, z), back(u + 0.35, z + 0.5), back(u, z + 0.5)]);
    }
    pen.fillStyle = '#ffcf7a';
    pen.fill();
  }
  // rain on the glass, still
  pen.beginPath();
  for (let i = 0; i < 8; i++) {
    const u = u0 + 0.4 + hash(f.k, i, 23) * (w - 0.8);
    const zt = z0 + 2 + hash(f.k, i, 24) * (z1 - z0 - 4);
    const len = 1 + hash(f.k, i, 25) * 2.2;
    const [x0, y0] = k.p(u, -depth * 0.5, zt);
    const [x1, y1] = k.p(u - 0.1, -depth * 0.5, zt - len);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#c8dcf055';
  pen.lineWidth = Math.max(0.7, 0.09 * s);
  pen.stroke();
  // inner shadow under the head of the reveal
  k.poly([back(u0 - 1, z1 - 2.5), back(u1 + 1, z1 - 2.5), back(u1 + 1, z1), back(u0 - 1, z1)], k.vgrad(a, -depth, z1 - 2.5, z1, [[0, '#00000000'], [1, '#0a0a1a66']]), 0);
  pen.restore();
  // glazing bars: three lights across, a pivoting middle band
  const bar = '#4f6f78';
  const bw = Math.max(1, 0.24 * s);
  const n = -depth * 0.5;
  const bars: P3[][] = [];
  for (const f2 of [1 / 3, 2 / 3]) bars.push([[u0 + w * f2, n, z0], [u0 + w * f2, n, z1]]);
  const rows = Math.max(2, Math.round((z1 - z0) / 5));
  for (let r = 1; r < rows; r++) bars.push([[u0, n, z0 + ((z1 - z0) * r) / rows], [u1, n, z0 + ((z1 - z0) * r) / rows]]);
  for (const b of bars) k.line(b, INK, bw + k.thin * 1.2);
  for (const b of bars) k.line(b, lit ? bar : shade(bar, -0.15), bw);
  pen.beginPath();
  k.trace(open);
  k.paint(null, k.thin);
  // the steel sill and what is on it
  k.box(u0 - 0.9, 0, z0 - 0.8, w + 1.8, 1.1, 0.6, '#c8d6d4', { line: k.lw });
  const kind = Math.floor(hash(f.k, 31) * 4);
  const su = a + (hash(f.k, 32) < 0.5 ? -1 : 1) * (w / 2 - 1.2);
  if (kind === 0) erlenmeyer(k, su, 0.55, z0 - 0.2, 1.6, C.magenta, 0.4);
  else if (kind === 1) {
    pot(k, su, 0.55, z0 - 0.2, 0.6, 1.1);
    mutant(k, su, 0.55, z0 + 0.8, 0.45, f.k);
  } else if (kind === 2) {
    beaker(k, su, 0.55, z0 - 0.2, 0.5, 1.2, C.blue, 0.5);
    beaker(k, su + 1.1, 0.55, z0 - 0.2, 0.4, 0.9, null);
  }
}

// ── the generator ─────────────────────────────────────────────────────────
// A steel cabinet against the wall: a knife switch on a slate panel, two big
// dials and a row of pilot lights; valves glowing in a row on top, a
// Jacob's ladder over it (its arc climbs in the overlay) and fat cables up
// to the pipes.

function generator(k: Kit, v: RoomView, f: Feature): void {
  const { pen, s } = k;
  const a = f.a;
  const out = 1.7;
  const z1 = 15;
  const steel = '#57767f';
  // the cables first, behind everything: up the wall to the pipes
  const top = v.H - 6.5;
  if (top > z1 + 4) {
    for (const [du, w] of [[-6.2, 0.5], [-5.3, 0.4], [6.3, 0.45]] as const) {
      k.rod([[a + du, 0.35, z1 - 0.5], [a + du, 0.35, z1 + 2], [a + du * 1.06, 0.35, top - 3], [a + du * 1.15, 0.35, top]], '#2a3034', w);
    }
    for (const du of [-6.2, -5.3]) for (let z = z1 + 4; z < top - 2; z += 6) k.box(a + du * (1 + ((z - z1) / (top - z1)) * 0.1) - 0.35, 0.02, z, 0.7, 0.6, 0.4, C.steelDark, { line: k.thin, stripe: false });
  }
  // a glow on the wall round it
  k.halo(a + LADDER.u, 0.1, 22, 12, '#a68cff', 0.14);
  k.shadow(a, 1.2, 8.5, 2.2, 0.3);
  k.box(a - 7.4, 0, 0, 14.8, out + 0.3, 0.8, C.iron, { stripe: false });
  k.box(a - 7, 0, 0.8, 14, out, z1 - 0.8, steel, { stripe: false });
  k.box(a - 7.3, 0, z1, 14.6, out + 0.25, 0.5, shade(steel, -0.1));
  const F = out + 0.02;
  // vents near the foot
  pen.beginPath();
  for (let z = 1.6; z < 3.4; z += 0.45) {
    const [x0, y0] = k.p(a - 6.3, F, z);
    const [x1, y1] = k.p(a - 2.5, F, z);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.8, 0.12 * s);
  pen.stroke();
  // the knife switch on its slate
  k.face(a - 6.3, a - 1.3, F, 4.2, 12.2, '#2a3236', k.thin, 0.2);
  for (const du of [-5.1, -2.5]) {
    // jaws at the top, hinge at the bottom, blade up in the jaws
    k.box(a + du - 0.25, F, 10.4, 0.5, 0.35, 0.9, C.copper, { line: k.thin, stripe: false });
    k.box(a + du - 0.3, F, 5.0, 0.6, 0.35, 0.7, C.copper, { line: k.thin, stripe: false });
    k.rod([[a + du, F + 0.3, 5.4], [a + du, F + 0.45, 10.8]], C.copper, 0.28);
  }
  k.rod([[a - 5.1, F + 0.55, 10.2], [a - 2.5, F + 0.55, 10.2]], C.iron, 0.2);
  k.rod([[a - 3.8, F + 0.55, 10.2], [a - 3.8, F + 1.5, 10.5]], C.red, 0.42);
  // the dials and the pilot lights
  gauge(k, a + 1.6, F, 11.6, 1.55, -0.7);
  gauge(k, a + 5.1, F, 11.6, 1.55, 0.9);
  const lights: Color[] = [C.red, C.amber, C.green, C.amber, C.red];
  lights.forEach((c, i) => pilot(k, a + 0.7 + i * 1.1, F, 8.4, 0.28, c, i !== 3));
  // two knobs and a little screen
  for (const du of [1.2, 2.8]) {
    fillPts(k, ring(k, [a + du, F, 6.1], [0, 1, 0], 0.5, 14), C.iron, k.thin);
    k.dot(a + du, F + 0.05, 6.4, Math.max(0.8, 0.09 * s), C.chrome);
  }
  k.face(a + 4.0, a + 6.3, F, 5.2, 7.0, '#16302b', k.thin, 0.15);
  k.line([[a + 4.2, F + 0.03, 6.1], [a + 4.7, F + 0.03, 6.6], [a + 5.1, F + 0.03, 5.6], [a + 5.6, F + 0.03, 6.5], [a + 6.1, F + 0.03, 6.0]], C.screen, Math.max(0.8, 0.1 * s));
  k.halo(a + 5.15, F + 0.2, 6.1, 1.6, C.screen, 0.3);
  // rivets round the panel's edge
  if (k.fine) {
    pen.beginPath();
    for (let u = a - 6.6; u <= a + 6.6; u += 1.1) {
      for (const z of [1.2, z1 - 0.4]) {
        const [x, y] = k.p(u, F, z);
        pen.moveTo(x + 0.08 * s, y);
        pen.arc(x, y, 0.08 * s, 0, Math.PI * 2);
      }
    }
    pen.fillStyle = shade(steel, 0.35);
    pen.fill();
  }
  // valves glowing on top
  for (let i = 0; i < 4; i++) {
    const u = a - 5.6 + i * 1.5;
    k.cyl(u, 0.9, z1 + 0.5, 0.45, 0.5, C.iron, { line: k.thin });
    k.halo(u, 0.9, z1 + 2.2, 1.6, '#ffae5a', 0.45);
    k.glass(u, 0.9, [[z1 + 1, 0.4], [z1 + 2.6, 0.4], [z1 + 3.1, 0.25], [z1 + 3.25, 0.06]], null);
    k.line([[u - 0.15, 0.9, z1 + 1.4], [u - 0.15, 0.9, z1 + 2.4], [u + 0.15, 0.9, z1 + 2.4], [u + 0.15, 0.9, z1 + 1.4]], '#ffcf7a', Math.max(0.8, 0.1 * s));
  }
  // the Jacob's ladder: two insulators and the rods in a V
  const L = LADDER;
  const lu = a + L.u;
  for (const sgn of [-1, 1]) {
    const u = lu + sgn * 0.9;
    for (let j = 0; j < 3; j++) k.cyl(u, 0.9, z1 + 0.5 + j * 0.6, 0.5 - j * 0.04, 0.45, '#efe8dc', { line: k.thin });
    k.rod([[u, 0.9, z1 + 2.2], [lu + sgn * L.gap0, 0.9, L.z0], [lu + sgn * (L.gap0 + (L.gap1 - L.gap0) * 0.4), 0.9, L.z0 + (L.z1 - L.z0) * 0.5], [lu + sgn * L.gap1, 0.9, L.z1]], C.copper, 0.16);
  }
}

// The arc on the Jacob's ladder, climbing from the rods' feet to their tops
// and breaking off, over and over.
function ladderArc(k: Kit, v: RoomView, f: Feature): void {
  const L = LADDER;
  const ph = (v.t * 0.55 + hash(f.k, 3)) % 1;
  if (ph > 0.85) return;
  const q = ph / 0.85;
  const z = L.z0 + (L.z1 - L.z0) * q * q * 0.95 + 0.2;
  const t = (z - L.z0) / (L.z1 - L.z0);
  const gap = L.gap0 + (L.gap1 - L.gap0) * t;
  const lu = f.a + L.u;
  const tick = Math.floor(v.t * 6);
  const pts = zigzag([lu - gap, 0.9, z], [lu + gap, 0.9, z], 6, 0.35 + q * 0.5, tick);
  // bowed upward as it climbs
  const bowed = pts.map(([u, n, zz], i) => [u, n, zz + Math.sin((i / (pts.length - 1)) * Math.PI) * (0.3 + q * 1.2)] as P3);
  k.halo(lu, 1.2, z + 0.6, 2 + q * 2, '#b9a8ff', 0.5);
  bolt(k, bowed, 0.8);
}

// Lightning, now and then, in each window: the glass flashes and a fork
// runs down the sky (above anyone's head).
function lightning(k: Kit, v: RoomView, f: Feature): void {
  const { z0, z1 } = windowZ(v.H);
  const period = 7 + hash(f.k, 41) * 9;
  const off = hash(f.k, 42) * period;
  const ph = (v.t + off) % period;
  if (ph > 0.5) return;
  const lo = Math.max(z0 + 1, 17);
  if (z1 - lo < 3) return;
  const w = f.w - 1.6;
  const strike = Math.floor((v.t + off) / period);
  const depth = 0.85;
  const flash = ph < 0.17 ? 0.5 : ph < 0.33 ? 0.15 : 0.32;
  k.poly([[f.a - w / 2, -depth, lo], [f.a + w / 2, -depth, lo], [f.a + w / 2, -depth, z1], [f.a - w / 2, -depth, z1]], withAlpha('#dfe8ff', flash * 0.6), 0);
  const u = f.a + (hash(f.k, strike, 43) - 0.5) * w * 0.6;
  const pts = zigzag([u, -depth, z1 - 0.3], [u + (hash(f.k, strike, 44) - 0.5) * 3, -depth, lo + 0.3], 7, 0.9, f.k + strike * 13);
  k.line(pts, '#ffffffd0', Math.max(1, 0.18 * k.s));
  const mid = pts[3];
  k.line([mid, [mid[0] + 1.3, -depth, mid[2] - 1.4], [mid[0] + 1.6, -depth, mid[2] - 2.6]], '#ffffffa0', Math.max(0.8, 0.12 * k.s));
}

// ── charts, shelves, signs ───────────────────────────────────────────────────

// The periodic table: a white chart in a thin frame, its cells in the
// familiar shape, coloured by family (no symbols, only the colour).
const FAMILY: Record<string, Color> = { a: '#f08a6a', e: '#f5c26b', t: '#8fc7e8', p: '#9fd69a', n: '#7fd6c4', h: '#e6e07a', g: '#c0a8f0', l: '#f2a7c8', c: '#e8b4e0' };
// Eighteen columns a period; '.' is an empty cell.
const TABLE = [
  'n................g',
  'ae..........pnnnhg',
  'ae..........ppnnhg',
  'aettttttttttpppnhg',
  'aettttttttttpppphg',
  'aeltttttttttpppphg',
  'aectttttttttpppphg',
];

function periodic(k: Kit, v: RoomView, f: Feature): void {
  const w = f.w;
  const z0 = Math.min(WAIN + 8, windowZ(v.H).z0 + 4);
  const cell = (w - 1.2) / 18;
  const h = cell * 10 + 1.2;
  const u0 = f.a - w / 2;
  k.shadow(f.a, 0.3, w * 0.5, 0.6, 0.12, z0 - 0.4);
  k.box(u0, 0, z0, w, 0.3, h, '#d9e2e0', { line: k.lw, stripe: false });
  const n = 0.32;
  k.face(u0 + 0.35, u0 + w - 0.35, n, z0 + 0.35, z0 + h - 0.35, C.paper, 0);
  const groups = new Map<Color, P3[][]>();
  const add = (c: Color, cu: number, cz: number) => {
    const q: P3[] = [[cu + 0.06, n + 0.01, cz + 0.06], [cu + cell - 0.06, n + 0.01, cz + 0.06], [cu + cell - 0.06, n + 0.01, cz + cell - 0.06], [cu + 0.06, n + 0.01, cz + cell - 0.06]];
    (groups.get(c) ?? groups.set(c, []).get(c)!).push(q);
  };
  const left = u0 + 0.6;
  const topZ = z0 + h - 0.6 - cell;
  TABLE.forEach((row, r) => {
    for (let c = 0; c < 18; c++) if (row[c] !== '.') add(FAMILY[row[c]], left + c * cell, topZ - r * cell);
  });
  for (let r = 0; r < 2; r++) for (let c = 2; c < 17; c++) add(FAMILY[r ? 'c' : 'l'], left + c * cell, topZ - (7.6 + r) * cell);
  for (const [c, qs] of groups) {
    k.pen.beginPath();
    for (const q of qs) k.trace(q);
    k.pen.fillStyle = c;
    k.pen.fill();
  }
  // a title bar of scribble
  if (k.fine) scrawl(k, left + 3 * cell, left + 10 * cell, n + 0.02, topZ + cell * 0.3, cell * 0.5, f.k, '#8a9a9a', Math.max(0.6, 0.06 * k.s));
}

// A steel wall shelf, two tiers of reagent bottles, beakers and flasks.
function shelf(k: Kit, f: Feature): void {
  const w = f.w;
  const a = f.a;
  const zs = [WAIN + 5.5, WAIN + 10];
  for (const [i, z] of zs.entries()) {
    k.shadow(a, 0.5, w * 0.5, 0.9, 0.16, z - 0.5);
    for (const du of [-w / 2 + 0.8, w / 2 - 0.8]) k.poly([[a + du, 0.05, z], [a + du, 1.5, z], [a + du, 0.05, z - 1.3]], C.steelDark, k.thin);
    k.box(a - w / 2, 0, z, w, 1.7, 0.3, C.steel, { line: k.lw });
    let u = a - w / 2 + 0.9;
    let j = 0;
    while (u < a + w / 2 - 0.8) {
      const kind = Math.floor(hash(f.k, i * 9 + j, 51) * 5);
      const zz = z + 0.3;
      if (kind === 0) {
        k.cyl(u, 0.85, zz, 0.45, 1.6, '#8a4a22', { line: k.thin });
        k.face(u - 0.35, u + 0.25, 1.31, zz + 0.4, zz + 1.0, C.paper, 0);
        k.cyl(u, 0.85, zz + 1.6, 0.22, 0.35, '#2d363b', { line: k.thin });
        u += 1.1;
      } else if (kind === 1) {
        beaker(k, u, 0.85, zz, 0.48, 1.25, [C.blue, C.green, C.magenta, C.amber][j % 4], 0.6);
        u += 1.15;
      } else if (kind === 2) {
        erlenmeyer(k, u + 0.1, 0.85, zz, 1.7, [C.green, C.magenta, C.blue][j % 3], 0.4);
        u += 1.35;
      } else if (kind === 3) {
        k.cyl(u, 0.85, zz, 0.4, 1.3, '#d9e8ec', { line: k.thin });
        k.cyl(u, 0.85, zz + 1.3, 0.25, 0.3, C.red, { line: k.thin });
        u += 1.0;
      } else {
        bulb(k, u + 0.15, 0.85, zz, 0.55, 0.5, C.amber, 0.45);
        u += 1.4;
      }
      j++;
    }
  }
}

// Hazard signs: yellow triangles with a bolt or a trefoil, a blue goggles
// sign; two or three by the bay's seed.
function signs(k: Kit, f: Feature): void {
  const n = 0.06;
  const z = WAIN + 6.5 + hash(f.k, 61) * 2;
  const count = f.w >= 7 ? 2 : 1;
  for (let i = 0; i < count; i++) {
    const u = f.a + (count === 1 ? 0 : (i - 0.5) * 3.4);
    const kind = Math.floor(hash(f.k, i, 62) * 4);
    if (kind === 3) {
      // blue disc: goggles
      fillPts(k, ring(k, [u, n, z + 1.3], [0, 1, 0], 1.35, 24), '#2f6fb0', k.lw);
      const g = (du: number) => fillPts(k, ring(k, [u + du, n + 0.02, z + 1.3], [0, 1, 0], 0.42, 14), '#ffffff', 0);
      g(-0.5);
      g(0.5);
      k.line([[u - 1.0, n + 0.02, z + 1.3], [u + 1.0, n + 0.02, z + 1.3]], '#ffffff', Math.max(0.7, 0.12 * k.s));
      continue;
    }
    k.poly([[u - 1.6, n, z], [u + 1.6, n, z], [u, n, z + 2.8]], C.hazard, k.lw, 0.25);
    k.poly([[u - 1.15, n + 0.01, z + 0.3], [u + 1.15, n + 0.01, z + 0.3], [u, n + 0.01, z + 2.3]], C.hazard, Math.max(0.8, k.thin * 0.9), 0.1);
    const c = n + 0.02;
    if (kind === 0) {
      // a lightning bolt
      k.poly([[u + 0.15, c, z + 2.0], [u - 0.45, c, z + 1.05], [u - 0.05, c, z + 1.05], [u - 0.3, c, z + 0.45], [u + 0.45, c, z + 1.3], [u + 0.05, c, z + 1.3]], C.hazardInk, 0);
    } else if (kind === 1) {
      // the radiation trefoil
      const zc = z + 1.05;
      for (let j = 0; j < 3; j++) {
        const a0 = -Math.PI / 2 + (j * Math.PI * 2) / 3 - 0.5;
        const pts: P3[] = [];
        for (let q = 0; q <= 6; q++) {
          const aa = a0 + (q / 6) * 1.0;
          pts.push([u + Math.cos(aa) * 0.7, c, zc - Math.sin(aa) * 0.7]);
        }
        for (let q = 6; q >= 0; q--) {
          const aa = a0 + (q / 6) * 1.0;
          pts.push([u + Math.cos(aa) * 0.22, c, zc - Math.sin(aa) * 0.22]);
        }
        k.poly(pts, C.hazardInk, 0);
      }
      k.dot(u, c, zc, Math.max(0.8, 0.13 * k.s), C.hazardInk);
    } else {
      // a flame
      k.poly([[u - 0.5, c, z + 0.45], [u + 0.5, c, z + 0.45], [u + 0.45, c, z + 1.0], [u + 0.1, c, z + 1.9], [u, c, z + 1.3], [u - 0.25, c, z + 1.6], [u - 0.5, c, z + 1.0]], C.hazardInk, 0, 0.12);
    }
  }
}

// A first-aid box over a fire extinguisher on its bracket.
function aid(k: Kit, f: Feature): void {
  const a = f.a;
  const z = WAIN + 6;
  k.shadow(a, 0.4, 2.4, 0.7, 0.14, z - 0.4);
  k.box(a - 1.9, 0, z, 3.8, 1.1, 3.2, '#f2f4f0', { line: k.lw, round: 0.15 });
  const F = 1.12;
  k.poly([[a - 0.3, F, z + 0.8], [a + 0.3, F, z + 0.8], [a + 0.3, F, z + 1.3], [a + 0.8, F, z + 1.3], [a + 0.8, F, z + 1.9], [a + 0.3, F, z + 1.9], [a + 0.3, F, z + 2.4], [a - 0.3, F, z + 2.4], [a - 0.3, F, z + 1.9], [a - 0.8, F, z + 1.9], [a - 0.8, F, z + 1.3], [a - 0.3, F, z + 1.3]], '#2fa65a', 0);
  // the extinguisher
  k.poly([[a - 0.6, 0.03, 2.2], [a + 0.6, 0.03, 2.2], [a + 0.6, 0.03, 2.6], [a - 0.6, 0.03, 2.6]], C.steelDark, k.thin);
  k.shadow(a, 0.8, 1.0, 0.8, 0.2, 0);
  k.lathe(a, 0.75, [[0.9, 0.6], [1.0, 0.65], [5.2, 0.65], [5.6, 0.5], [5.9, 0.25]], C.red, k.lw, false);
  k.cyl(a, 0.75, 5.85, 0.2, 0.5, C.iron, { line: k.thin });
  k.rod([[a, 0.75, 6.25], [a + 0.7, 0.85, 6.3], [a + 0.9, 0.95, 5.5], [a + 0.75, 1.3, 3.0]], '#2a3034', 0.14);
  k.face(a - 0.35, a + 0.3, 1.41, 2.6, 4.0, '#f6f2e6', 0);
}

// A cork board: pinned notes of scribble, a graph, a photo of a rat, red
// string between some of the pins.
function board(k: Kit, v: RoomView, f: Feature): void {
  const w = f.w;
  const a = f.a;
  const z0 = WAIN + 6;
  const h = 7;
  const u0 = a - w / 2;
  k.shadow(a, 0.3, w * 0.5, 0.6, 0.12, z0 - 0.4);
  k.box(u0, 0, z0, w, 0.35, h, C.woodDark, { line: k.lw, stripe: false });
  const n = 0.37;
  k.face(u0 + 0.5, u0 + w - 0.5, n, z0 + 0.5, z0 + h - 0.5, k.vgrad(a, n, z0, z0 + h, [[0, '#b98a52'], [1, '#d0a46a']]), k.thin);
  const pins: P3[] = [];
  const note = (cu: number, cz: number, nw: number, nh: number, paper: Color, i: number) => {
    const c = n + 0.02 + i * 0.005;
    const tilt = (hash(f.k, i, 71) - 0.5) * 0.3;
    k.poly([[cu - nw / 2, c, cz - nh / 2 + tilt], [cu + nw / 2, c, cz - nh / 2 - tilt], [cu + nw / 2, c, cz + nh / 2 - tilt], [cu - nw / 2, c, cz + nh / 2 + tilt]], paper, k.thin * 0.8);
    pins.push([cu, c + 0.02, cz + nh / 2 - 0.25]);
    return c;
  };
  // notes with lines of writing
  for (const [i, [du, dz, nw, nh]] of ([[-2.6, 4.3, 2.2, 2.6], [0.2, 5.0, 2.0, 1.8], [2.6, 4.2, 2.0, 2.4]] as const).entries()) {
    const c = note(a + du, z0 + dz, nw, nh, i === 1 ? '#fff3a0' : C.paper, i);
    if (k.fine) for (let r = 0; r < 3; r++) scrawl(k, a + du - nw / 2 + 0.3, a + du + nw / 2 - 0.3, c + 0.01, z0 + dz + nh / 2 - 0.7 - r * 0.5, 0.15, f.k + i * 5 + r, '#5a6a7a', Math.max(0.6, 0.05 * k.s));
  }
  // a graph going up
  const gc = note(a - 1.4, z0 + 1.7, 2.6, 2.0, C.paper, 3);
  k.line([[a - 2.5, gc + 0.01, z0 + 0.9], [a - 1.9, gc + 0.01, z0 + 1.3], [a - 1.4, gc + 0.01, z0 + 1.1], [a - 0.8, gc + 0.01, z0 + 1.9], [a - 0.3, gc + 0.01, z0 + 2.4]], C.red, Math.max(0.8, 0.1 * k.s));
  // a photo of a rat
  const pc = note(a + 1.8, z0 + 1.7, 2.0, 2.0, '#fbfbf6', 4);
  k.face(a + 1.0, a + 2.6, pc + 0.01, z0 + 1.05, z0 + 2.45, '#7fa5b0', 0);
  k.pen.beginPath();
  const [rx, ry] = k.p(a + 1.8, pc + 0.02, z0 + 1.5);
  k.pen.ellipse(rx, ry, 0.5 * k.s, 0.32 * k.s, 0, 0, Math.PI * 2);
  k.paint('#eeeae4', k.thin * 0.6);
  k.dot(a + 2.25, pc + 0.03, z0 + 1.6, Math.max(0.6, 0.06 * k.s), '#ff9aa8');
  // red string between pins, then the pins
  const string: P3[] = [pins[0], pins[3], pins[1], pins[4], pins[2]];
  k.line(string, '#c8323a', Math.max(0.7, 0.07 * k.s));
  for (const p of pins) k.dot(p[0], p[1], p[2], Math.max(1, 0.14 * k.s), C.red, k.thin * 0.5);
}

// A round wall clock, its hands at ten past ten.
function clock(k: Kit, v: RoomView, f: Feature): void {
  const z = Math.min(windowZ(v.H).z1 - 4, WAIN + 14);
  const c: P3 = [f.a, 0.3, z];
  k.shadow(f.a + 0.2, 0.25, 1.8, 0.4, 0.12, z - 1.8);
  fillPts(k, ring(k, c, [0, 1, 0], 1.7, 28), C.iron, k.lw);
  fillPts(k, ring(k, [f.a, 0.32, z], [0, 1, 0], 1.4, 28), '#f8f8f2', 0);
  const pen = k.pen;
  pen.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r0 = i % 3 ? 1.15 : 1.0;
    const [x0, y0] = k.p(f.a + Math.sin(a) * r0, 0.33, z + Math.cos(a) * r0);
    const [x1, y1] = k.p(f.a + Math.sin(a) * 1.3, 0.33, z + Math.cos(a) * 1.3);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.6, 0.07 * k.s);
  pen.stroke();
  const hand = (a: number, r: number, color: Color, w: number) => k.line([[f.a, 0.34, z], [f.a + Math.sin(a) * r, 0.34, z + Math.cos(a) * r]], color, w);
  hand(-Math.PI * 2 * (2 / 12), 0.75, INK, Math.max(1, 0.18 * k.s));
  hand(Math.PI * 2 * (2 / 12), 1.1, INK, Math.max(0.9, 0.13 * k.s));
  hand(Math.PI * 0.8, 1.15, C.red, Math.max(0.6, 0.05 * k.s));
  k.dot(f.a, 0.35, z, Math.max(0.8, 0.1 * k.s), C.red);
}

// A caged bulkhead lamp on a bracket, its light washing the tile under it.
function lamp(k: Kit, v: RoomView, f: Feature): void {
  const z = lampZ(v.H);
  const a = f.a;
  const pen = k.pen;
  const n = 1.6;
  pen.save();
  pen.globalCompositeOperation = 'screen';
  k.poly([[a - 0.7, 0.05, z - 0.8], [a + 0.7, 0.05, z - 0.8], [a + 4.5, 0.05, z - 12], [a - 4.5, 0.05, z - 12]], k.vgrad(a, 0.05, z - 12, z, [[0, '#e9fbff00'], [1, '#e9fbff38']]), 0);
  pen.restore();
  k.halo(a, 0.6, z, 7, C.lamp, 0.4);
  // the backplate and the arm
  k.poly([[a - 0.7, 0.02, z + 0.9], [a + 0.7, 0.02, z + 0.9], [a + 0.7, 0.02, z + 2.9], [a - 0.7, 0.02, z + 2.9]], C.iron, k.thin, 0.25);
  k.rod([[a, 0.05, z + 2.2], [a, n * 0.7, z + 2.2], [a, n, z + 1.6]], C.iron, 0.24);
  k.cyl(a, n, z + 0.9, 0.95, 0.6, C.iron, { line: k.thin });
  // the bulb in its glass, glowing, and the cage over it
  k.halo(a, n, z, 2.6, '#ffffff', 0.55);
  k.lathe(a, n, [[z - 1.4, 0.05], [z - 1.25, 0.5], [z - 0.6, 0.8], [z + 0.9, 0.72]], '#f6feff', k.thin, false);
  k.dot(a - 0.15, n, z - 0.4, Math.max(1, 0.35 * k.s), '#ffffff');
  pen.beginPath();
  for (const du of [-0.75, -0.25, 0.25, 0.75]) {
    const [x0, y0] = k.p(a + du, n + 0.55, z + 0.9);
    const [x1, y1] = k.p(a + du * 0.6, n + 0.7, z - 1.2);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  for (const [zz, r] of [[z - 0.1, 0.85], [z - 0.9, 0.7]] as const) {
    const e = k.ell(a, n, zz, r);
    pen.moveTo(e.cx + e.rx, e.cy);
    pen.ellipse(e.cx, e.cy, e.rx, e.ry, e.rot, 0, Math.PI);
  }
  pen.strokeStyle = INK;
  pen.lineWidth = Math.max(0.9, k.thin * 0.9);
  pen.stroke();
}

// A round louvred vent up in the band, a fan behind its grille.
function vent(k: Kit, v: RoomView, a: number, seed: number): void {
  const z = tileTop(v.H) + 7 + hash(seed, 82) * 3;
  if (z + 3 > v.H - 8) return;
  const c: P3 = [a, 0.15, z];
  k.box(a - 2.2, 0, z - 2.2, 4.4, 0.25, 4.4, '#c8d6d4', { line: k.lw, stripe: false });
  fillPts(k, ring(k, c, [0, 1, 0], 1.75, 28), '#2c3a3f', k.thin);
  const pen = k.pen;
  // the fan's blades
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * Math.PI * 2 + hash(seed, 83) * 2;
    const pts: P3[] = [];
    for (let j = 0; j <= 6; j++) {
      const aa = a0 + (j / 6) * 1.2;
      pts.push([a + Math.cos(aa) * 1.5, 0.2, z + Math.sin(aa) * 1.5]);
    }
    pts.push([a, 0.2, z]);
    k.poly(pts, '#5f7479', 0);
  }
  k.dot(a, 0.22, z, Math.max(1, 0.3 * k.s), '#8a9aa0');
  // the grille's bars
  pen.beginPath();
  for (let d = -1.4; d <= 1.41; d += 0.47) {
    const h = Math.sqrt(Math.max(0, 1.75 * 1.75 - d * d));
    const [x0, y0] = k.p(a - h, 0.26, z + d);
    const [x1, y1] = k.p(a + h, 0.26, z + d);
    pen.moveTo(x0, y0);
    pen.lineTo(x1, y1);
  }
  pen.strokeStyle = '#c8d6d4';
  pen.lineWidth = Math.max(0.8, 0.12 * k.s);
  pen.stroke();
  pen.beginPath();
  path2(pen, ring(k, [a, 0.27, z], [0, 1, 0], 1.75, 28));
  k.paint(null, k.thin);
}

const path2 = (pen: Pen, pts: ReadonlyArray<readonly [number, number]>) => {
  pts.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
};

// ── the shell's edges: wall tops, cut ends, the floor slab ───────────────────

function shell(k: Kit, v: RoomView): void {
  const { pen } = k;
  const { W, D, H, T } = v;
  const cap = '#d6e2df';
  const cut = '#8fa3a3';
  // the floor's cut edges, a band of tile on top
  k.poly([[T, D, 0], [W, D, 0], [W, D, -SLAB], [T, D, -SLAB]], k.side('#5a6c70', 0, 1), k.lw);
  k.poly([[W, T, 0], [W, D, 0], [W, D, -SLAB], [W, T, -SLAB]], k.side('#5a6c70', 1, 0), k.lw);
  k.line([[T, D, -0.4], [W, D, -0.4], [W, T, -0.4]], '#b9cbc9', Math.max(1, 0.28 * k.s));
  // the walls' cut ends and tops
  k.poly([[0, D, -SLAB], [T, D, -SLAB], [T, D, H], [0, D, H]], k.side(mix(cap, cut, 0.5), 0, 1), k.lw);
  k.poly([[W, 0, -SLAB], [W, T, -SLAB], [W, T, H], [W, 0, H]], k.side(mix(cap, cut, 0.5), 1, 0), k.lw);
  for (const [p, q] of [[[0, D], [T, D]], [[W, 0], [W, T]]] as const) {
    pen.beginPath();
    for (let z = 1; z < H - 0.5; z += 1) {
      const [x0, y0] = k.p(p[0] + (q[0] - p[0]) * 0.18, p[1] + (q[1] - p[1]) * 0.18, z);
      const [x1, y1] = k.p(p[0] + (q[0] - p[0]) * 0.82, p[1] + (q[1] - p[1]) * 0.82, z);
      pen.moveTo(x0, y0);
      pen.lineTo(x1, y1);
    }
    pen.strokeStyle = '#4a5e6244';
    pen.lineWidth = Math.max(0.6, 0.08 * k.s);
    pen.stroke();
  }
  k.poly([[0, 0, H], [W, 0, H], [W, T, H], [T, T, H], [T, D, H], [0, D, H]], cap, k.lw);
  k.line([[0.35, D, H], [0.35, 0.35, H], [W, 0.35, H]], shade(cap, 0.35), Math.max(1, 0.2 * k.s));
  k.line([[T, D, 0], [T, T, 0], [W, T, 0]], withAlpha(INK, 0.7), k.thin);
  k.line([[T, T, 0], [T, T, H]], withAlpha(INK, 0.5), k.thin);
}

