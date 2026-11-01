// The scene's light: what every room gets from the engine, all of it drawn
// once (into the base tiles, or as sprites kept and only placed), so it
// costs nothing per frame. Three parts:
//
//   shell     a pass over the room's own drawing (see shellLight): shade
//             where the floor meets the walls and deeper in the back
//             corner, the floor a little darker toward its far corners but
//             kept light where the crew walks, the walls darker toward
//             their tops, the left wall (turned from the light, which
//             comes from the upper left) a shade darker than the right,
//             and a soft shadow on the wall behind what stands against it.
//   lights    what a world declares (RoomArt.lights, PropArt.light; see
//             worlds/types.ts): a pool on the floor, a wash on a wall it
//             stands near, a window's patch of sun or moonlight, painted
//             over the graded room (see paintLights); and the glow round
//             each light itself, a halo sprite over everything (see
//             halosOf). Lamps are off at night; fire, lava, glows and
//             screens shine on and light the room.
//   grades    the evening tint (WorldDef.ambient) and the night (the lights
//             off) multiplied over the room, its props and builds; less
//             over what glows and over the crew and the locals; not over
//             emotes and labels (see gradesOf).
//
// It all works in world units on the room's planes (see plane): the floor
// (x, y), the right wall's face (x, z at y = T) and the left wall's (y, z at
// x = T), each an affine map onto the canvas, so a round gradient comes
// out as a true ellipse lying on the floor or a wall.

import type { RGB } from '../../term/color.ts';
import type { PlacedProp, Room } from '../../world/room.ts';
import { footprint, toWorld } from '../../world/room.ts';
import { hashString } from '../../world/rng.ts';
import type { LightKind, PropArt, RoomLight, PropLight, WorldDef, WorldLight } from '../../worlds/types.ts';
import { rgbOf } from '../iso.ts';
import { Canvas } from '../canvas.ts';
import type { Pen } from '../types.ts';
import { tintAll } from './fx.ts';

type Box = { W: number; D: number; H: number; T: number };

// Whether lamps are on in a view (a view made without `lit` is lit).
export const lampsOn = (v: { lit?: boolean }): boolean => v.lit !== false;

const rgba = (c: RGB, a: number) => `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${Math.max(0, Math.min(1, a)).toFixed(3)})`;
const near = (d: number) => Math.max(0, 1 - Math.max(0, d) / WASH_REACH);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// One of the room's planes as the pen's transform, for a projection whose
// world origin lands at (ox, oy): 'floor' takes (x, y) at z = 0, 'right'
// (x, z) on the right wall's face (y = T), 'left' (y, z) on the left's.
type Plane = 'floor' | 'right' | 'left';
export function plane(c: Pen, p: Plane, s: number, ox: number, oy: number, T: number): void {
  if (p === 'floor') c.setTransform(s, s / 2, -s, s / 2, ox, oy);
  else if (p === 'right') c.setTransform(s, s / 2, 0, -s, ox - T * s, oy + (T * s) / 2);
  else c.setTransform(-s, s / 2, 0, -s, ox + T * s, oy + (T * s) / 2);
}

// The plane's own part of the room (the floor inside the walls, a wall's
// face up to its top) as the clip.
function clipTo(c: Pen, p: Plane, L: Box): void {
  c.beginPath();
  if (p === 'floor') c.rect(L.T, L.T, L.W - L.T, L.D - L.T);
  else c.rect(L.T, 0, (p === 'right' ? L.W : L.D) - L.T, L.H);
  c.clip();
}

// ── the shell pass ───────────────────────────────────────────────────────

// The shared rule's strengths (alpha of the world's ink), each scaled by
// its share in WorldDef.light: occlusion at the floor's edge by the walls
// (over AO_REACH units), in the back corner (radius CORNER) and at the
// foot of a wall (over WALL_FOOT units), the wall's inner corner (over
// INNER units); the floor's falloff at its far corners; the walls' tops;
// the left wall's turn; the wall shadows behind props.
const AO = { floor: 0.34, corner: 0.22, foot: 0.3, inner: 0.26 };
const AO_REACH = 5.5;
const CORNER = 14;
const WALL_FOOT = 3.2;
const INNER = 6;
const FALLOFF = 0.2;
const TOP = 0.2;
const TURN = 0.12;
const BACKS = 0.24;

type Tune = Required<Omit<WorldLight, 'night'>>;
export function tuneOf(w: WorldDef): Tune {
  const l = w.light ?? {};
  const k = (v: number | undefined) => clamp(v ?? 1, 0, 2);
  return { ao: k(l.ao), falloff: k(l.falloff), top: k(l.top), turn: k(l.turn), backs: k(l.backs), pools: k(l.pools) };
}

// The shell pass over a room just drawn into `c` (its world origin at
// (ox, oy), s px a unit), in the world's ink `ink`: laid 'source-atop', so
// it shades the room's own pixels only.
export function shellLight(c: Pen, L: Box, props: readonly PlacedProp[], ink: RGB, s: number, ox: number, oy: number, k: Tune): void {
  const { W, D, H, T } = L;
  c.save();
  c.globalCompositeOperation = 'source-atop';
  // the floor: shade along both walls, deeper in the corner, and a gentle
  // falloff toward the far corners, light down the middle and in front
  plane(c, 'floor', s, ox, oy, T);
  clipTo(c, 'floor', L);
  if (k.ao > 0) {
    const edge = (x0: number, y0: number, x1: number, y1: number) => {
      const g = c.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, rgba(ink, AO.floor * k.ao));
      g.addColorStop(0.45, rgba(ink, 0.12 * k.ao));
      g.addColorStop(1, rgba(ink, 0));
      return g;
    };
    c.fillStyle = edge(0, T, 0, T + AO_REACH);
    c.fillRect(T, T, W - T, AO_REACH);
    c.fillStyle = edge(T, 0, T + AO_REACH, 0);
    c.fillRect(T, T, AO_REACH, D - T);
    const g = c.createRadialGradient(T, T, 0, T, T, CORNER);
    g.addColorStop(0, rgba(ink, AO.corner * k.ao));
    g.addColorStop(1, rgba(ink, 0));
    c.fillStyle = g;
    c.fillRect(T, T, CORNER, CORNER);
  }
  if (k.falloff > 0) {
    // round the middle of the floor a little toward the front, so the
    // side corners darken most and the front walkway least
    const cx = T + (W - T) * 0.55;
    const cy = T + (D - T) * 0.55;
    const r = Math.hypot(W - T, D - T) * 0.56;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, rgba(ink, 0));
    g.addColorStop(0.5, rgba(ink, 0));
    g.addColorStop(1, rgba(ink, FALLOFF * k.falloff));
    c.fillStyle = g;
    c.fillRect(T, T, W - T, D - T);
  }
  c.restore();
  // the walls: shade at the foot and in the inner corner, darker toward
  // the top, the left one turned from the light
  for (const side of ['right', 'left'] as const) {
    const len = side === 'right' ? W : D;
    c.save();
    c.globalCompositeOperation = 'source-atop';
    plane(c, side, s, ox, oy, T);
    clipTo(c, side, L);
    if (k.ao > 0) {
      let g = c.createLinearGradient(0, 0, 0, WALL_FOOT);
      g.addColorStop(0, rgba(ink, AO.foot * k.ao));
      g.addColorStop(1, rgba(ink, 0));
      c.fillStyle = g;
      c.fillRect(T, 0, len - T, WALL_FOOT);
      g = c.createLinearGradient(T, 0, T + INNER, 0);
      g.addColorStop(0, rgba(ink, AO.inner * k.ao));
      g.addColorStop(1, rgba(ink, 0));
      c.fillStyle = g;
      c.fillRect(T, 0, INNER, H);
    }
    if (k.top > 0) {
      const g = c.createLinearGradient(0, H * 0.45, 0, H);
      g.addColorStop(0, rgba(ink, 0));
      g.addColorStop(1, rgba(ink, TOP * k.top));
      c.fillStyle = g;
      c.fillRect(T, H * 0.45, len - T, H * 0.55);
    }
    if (side === 'left' && k.turn > 0) {
      c.fillStyle = rgba(ink, TURN * k.turn);
      c.fillRect(T, 0, len - T, H);
    }
    if (k.backs > 0) backShadows(c, side, L, props, ink, k.backs);
    c.restore();
  }
}

// A soft shadow on wall `side` (its plane the pen's transform, clipped)
// behind each prop standing against it at least 3 units tall, the light
// from the upper left pushing it a little toward the screen's right.
function backShadows(c: Pen, side: 'left' | 'right', L: Box, props: readonly PlacedProp[], ink: RGB, k: number): void {
  for (const p of props) {
    if (p.island || p.wall !== side) continue;
    const h = Math.min(L.H - 1, p.art.height);
    if (h < 3) continue;
    const r = footprint(p);
    if ((side === 'right' ? r.y0 : r.x0) > L.T + 0.6) continue;
    const a0 = side === 'right' ? r.x0 : r.y0;
    const len = side === 'right' ? r.x1 - r.x0 : r.y1 - r.y0;
    // screen-right is +x along the right wall, -y along the left
    const cx = a0 + len / 2 + (side === 'right' ? 1.1 : -0.6);
    const rx = len / 2 + 1.6;
    c.save();
    c.translate(cx, 0);
    c.scale(1, (h * 0.95) / rx);
    const g = c.createRadialGradient(0, 0, rx * 0.35, 0, 0, rx);
    g.addColorStop(0, rgba(ink, BACKS * k));
    g.addColorStop(1, rgba(ink, 0));
    c.fillStyle = g;
    c.fillRect(-rx, 0, 2 * rx, rx);
    c.restore();
  }
}

// ── declared lights ──────────────────────────────────────────────────────

// Each kind's colour, reach on the floor (units, from how high it hangs),
// glow round itself (radius, units, and strength).
const KINDS: Record<LightKind, { color: string; reach: (z: number) => number; halo: number; glow: number }> = {
  lamp: { color: '#ffd08a', reach: (z) => clamp(0.85 * z, 7, 15), halo: 2.6, glow: 0.5 },
  fire: { color: '#ff9a48', reach: () => 14, halo: 5, glow: 0.42 },
  lava: { color: '#ff6a2a', reach: () => 12, halo: 4.5, glow: 0.4 },
  glow: { color: '#8ff0d8', reach: () => 8, halo: 3, glow: 0.42 },
  screen: { color: '#a8d4ff', reach: () => 5, halo: 2, glow: 0.32 },
};
const WINDOW_SUN = '#ffe2a6';
const WINDOW_MOON = '#9fb6ee';
// What always shines shines this much more at night; a window's moon
// shines this much as it comes.
const NIGHT_GLOW = 1.25;
const MOON = 0.85;
// A light washes a wall it stands within this many units of.
const WASH_REACH = 6;
// The light's direction, from the upper left (units across per unit down):
// a window's patch on the floor is the window thrown along it.
const SUN = { x: 1 / 1.6, y: 0.5 / 1.6 };

// A light as the scene draws it, in world units: where it is, its colour,
// its pool's radius, its strength, its glow's radius.
export type Glow = { kind: LightKind; x: number; y: number; z: number; color: RGB; r: number; k: number; halo: number };
// A window as the scene draws it: on wall `wall` (its face at `face`: y on
// the right wall, x on the left), from a0 to a1 along it, z0 to z1 up.
export type Pane = { wall: 'left' | 'right'; face: number; a0: number; a1: number; z0: number; z1: number; bars: number; rails: number; color: RGB; k: number };
export type Rig = { glows: Glow[]; panes: Pane[] };

// Whether a point light shines with the lights `lit`.
const shines = (kind: LightKind, lit: boolean) => lit || kind !== 'lamp';

// Whether prop art gives light that is on (it then takes the lighter grade:
// what glows is not dimmed as much).
export function glowsIn(art: PropArt, lit: boolean): boolean {
  return !!art.light?.some((l) => l.kind !== 'window' && shines(l.kind, lit));
}

function resolve(l: PropLight, to: (u: number, v: number, z: number) => [number, number, number], wall: 'left' | 'right', face: number, lit: boolean, rig: Rig): void {
  if (l.kind === 'window') {
    const [ax, ay] = to(l.u - l.w / 2, 0, 0);
    const [bx, by] = to(l.u + l.w / 2, 0, 0);
    const a0 = wall === 'right' ? Math.min(ax, bx) : Math.min(ay, by);
    const a1 = wall === 'right' ? Math.max(ax, bx) : Math.max(ay, by);
    if (!(a1 > a0) || !(l.z1 > l.z0)) return;
    const k = lit ? clamp(l.strength ?? 1, 0, 2) : clamp(l.moon ?? MOON, 0, 2);
    if (k <= 0) return;
    rig.panes.push({ wall, face, a0, a1, z0: Math.max(0, l.z0), z1: l.z1, bars: Math.max(0, Math.round(l.bars ?? 0)), rails: Math.max(0, Math.round(l.rails ?? 0)), color: rgbOf(lit ? (l.color ?? WINDOW_SUN) : (l.night ?? WINDOW_MOON)), k });
    return;
  }
  if (!shines(l.kind, lit)) return;
  const d = KINDS[l.kind];
  const [x, y, z] = to(l.u, l.v, l.z);
  const k = clamp(l.strength ?? 1, 0, 2) * (lit || l.kind === 'lamp' ? 1 : NIGHT_GLOW);
  rig.glows.push({ kind: l.kind, x, y, z: Math.max(0, z), color: rgbOf(l.color ?? d.color), r: Math.max(1, l.r ?? d.reach(Math.max(0, z))), k, halo: Math.max(0, l.halo ?? d.halo) });
}

const rigs = new WeakMap<Room, WeakMap<WorldDef, [Rig?, Rig?]>>();

// The lights of a world's room that shine with the lights `lit`: the
// shell's (asked once a room) and its props'. Kept per room.
export function rigOf(w: WorldDef, room: Room, lit: boolean): Rig {
  let m = rigs.get(room);
  if (!m) rigs.set(room, (m = new WeakMap()));
  let pair = m.get(w);
  if (!pair) m.set(w, (pair = [undefined, undefined]));
  const i = lit ? 1 : 0;
  const had = pair[i];
  if (had) return had;
  const rig: Rig = { glows: [], panes: [] };
  const { W, D, H, T } = room.L;
  for (const l of w.room.lights?.({ W, D, H, T, seed: hashString(w.id) }) ?? []) {
    const place = { wall: l.wall, x0: l.wall === 'right' ? 0 : T, y0: l.wall === 'right' ? T : 0 };
    resolve(l, (u, v, z) => toWorld(place, u, v, z), l.wall, T, lit, rig);
  }
  for (const p of room.props) {
    for (const l of p.art.light ?? []) {
      if (l.kind === 'window' && p.island) continue;
      resolve(l, (u, v, z) => toWorld(p, u, v, z), p.wall, p.wall === 'right' ? p.y0 : p.x0, lit, rig);
    }
  }
  pair[i] = rig;
  return rig;
}

// A light's falloff: a plateau that holds most of its strength across the
// middle and fades to nothing at its edge (stop, share).
const PLATEAU: ReadonlyArray<[number, number]> = [
  [0, 1],
  [0.3, 0.86],
  [0.62, 0.42],
  [0.85, 0.12],
  [1, 0],
];

// How much light (0..1 at the middle) a pool, a wall's wash and a
// window's patch put on.
const POOL = 0.8;
const WASH = 0.6;
const SPILL = 0.75;
// How light falls on a surface (see lightUp): it brightens it by its own
// colour, as light does (GAIN: the warm floor stays warm and its grain
// shows; near white or black there is little to gain), and glows over it a
// little (BLOOM: a fire still shows on a black floor).
const GAIN = 1.4;
const BLOOM = 0.28;

// Light round (cx, cy) of the pen's plane, radius r (stretched by `sy`
// across), `color` times `a` added to the light map.
function blob(c: Canvas, cx: number, cy: number, r: number, sy: number, color: RGB, a: number): void {
  if (a <= 0) return;
  c.save();
  c.translate(cx, cy);
  c.scale(1, sy);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [t, k] of PLATEAU) g.addColorStop(t, rgba(color, a * k));
  c.fillStyle = g;
  c.fillRect(-r, -r, 2 * r, 2 * r);
  c.restore();
}

// The rig's pools, washes and windows' patches laid on `c` (the room
// drawn and graded; its world origin at (ox, oy), s px a unit): drawn as a
// map of the light falling on each pixel (added up, each clipped to its
// plane), then lit by it (see lightUp). `k` scales them all
// (WorldDef.light.pools).
export function paintLights(c: Canvas, L: Box, rig: Rig, s: number, ox: number, oy: number, k: number): void {
  if (k <= 0 || (!rig.glows.length && !rig.panes.length)) return;
  const { T } = L;
  const map = new Canvas(c.width, c.height);
  map.globalCompositeOperation = 'lighter';
  map.save();
  plane(map, 'floor', s, ox, oy, T);
  clipTo(map, 'floor', L);
  for (const p of rig.panes) spill(map, p, k);
  for (const g of rig.glows) {
    // a light on or by a wall throws its pool out into the room
    const out = 0.3 * g.z;
    const x = g.x + out * near(g.x - T);
    const y = g.y + out * near(g.y - T);
    blob(map, x, y, g.r, 1, g.color, POOL * g.k * k);
  }
  map.restore();
  for (const side of ['right', 'left'] as const) {
    const walls = rig.glows.filter((g) => near((side === 'right' ? g.y : g.x) - T) > 0);
    if (!walls.length) continue;
    map.save();
    plane(map, side, s, ox, oy, T);
    clipTo(map, side, L);
    for (const g of walls) blob(map, side === 'right' ? g.x : g.y, g.z + 0.1 * g.r, 0.85 * g.r, 0.7, g.color, WASH * near((side === 'right' ? g.y : g.x) - T) * g.k * k);
    map.restore();
  }
  lightUp(c.data, map.data);
}

// Each pixel of `px` (opaque) lit by the light map `map` (the light's
// colour times how much of it falls there, 0..255 a channel).
export function lightUp(px: Uint8ClampedArray, map: Uint8ClampedArray): void {
  for (let o = 0, n = px.length; o < n; o += 4) {
    if (map[o + 3] === 0) continue;
    for (let j = 0; j < 3; j++) {
      const l = map[o + j] / 255;
      if (l <= 0) continue;
      const d = px[o + j];
      px[o + j] = d + l * ((GAIN * d * (255 - d)) / 255 + BLOOM * (255 - d)) + 0.5;
    }
  }
}

// A window's patch on the floor (the pen's plane, clipped): the opening
// thrown along the light onto the floor, a parallelogram, brightest by the
// wall, its glazing bars cut out of it, its edges a little soft.
function spill(c: Canvas, p: Pane, k: number): void {
  const dz = p.z1 - p.z0;
  const da = p.a1 - p.a0;
  // (u, v) in the unit square, u along the opening and v up it, to the
  // floor: x = A u + C v + E, y = B u + D v + F
  const [A, B, C, Dd, E, F] =
    p.wall === 'right'
      ? [da, 0, dz * SUN.x, dz * SUN.y, p.a0 + p.z0 * SUN.x, p.face + p.z0 * SUN.y]
      : [0, da, dz * SUN.x, dz * SUN.y, p.face + p.z0 * SUN.x, p.a0 + p.z0 * SUN.y];
  const bar = 0.5;
  const bu = Math.min(0.3, bar / da);
  const bv = Math.min(0.3, bar / dz);
  const cols = p.bars + 1;
  const rows = p.rails + 1;
  c.save();
  c.transform(A, B, C, Dd, E, F);
  // a soft rim a little wider, then the panes
  for (const [a, grow] of [
    [0.3, 0.18],
    [0.7, 0],
  ] as const) {
    const g = c.createLinearGradient(0, 0, 0, 1);
    g.addColorStop(0, rgba(p.color, SPILL * a * p.k * k));
    g.addColorStop(1, rgba(p.color, SPILL * a * p.k * k * 0.35));
    c.fillStyle = g;
    const gu = grow / da;
    const gv = grow / dz;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const u0 = i ? i / cols + bu / 2 : 0;
        const u1 = i < cols - 1 ? (i + 1) / cols - bu / 2 : 1;
        const v0 = j ? j / rows + bv / 2 : 0;
        const v1 = j < rows - 1 ? (j + 1) / rows - bv / 2 : 1;
        c.fillRect(u0 - gu, v0 - gv, u1 - u0 + 2 * gu, v1 - v0 + 2 * gv);
      }
    }
  }
  c.restore();
}

// What a light that shines lights round itself keeps its own colour under
// the grade (a fire stays bright in an evening room, a sconce's glass at
// night): in `px` (graded) the pixels round each, out to a little past its
// glow, taken back toward `orig` (as drawn), all the way in the middle.
// `px` is a w-wide canvas whose world origin is at (ox, oy).
export function keepGlows(px: Uint8ClampedArray, orig: Uint8ClampedArray, w: number, h: number, rig: Rig, s: number, ox: number, oy: number): void {
  for (const g of rig.glows) {
    const R = (1.3 * g.halo + 1) * s;
    if (g.halo <= 0 || R < 1) continue;
    const cx = ox + (g.x - g.y) * s;
    const cy = oy + ((g.x + g.y) * s) / 2 - g.z * s;
    const k = Math.min(1, g.k);
    const x0 = Math.max(0, Math.floor(cx - R));
    const x1 = Math.min(w, Math.ceil(cx + R));
    const y0 = Math.max(0, Math.floor(cy - R));
    const y1 = Math.min(h, Math.ceil(cy + R));
    for (let y = y0; y < y1; y++) {
      for (let x = x0, o = (y * w + x0) * 4; x < x1; x++, o += 4) {
        const q = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / R;
        if (q >= 1) continue;
        const m = Math.min(1, 1.6 * (1 - q)) * k;
        for (let j = 0; j < 3; j++) if (orig[o + j] > px[o + j]) px[o + j] += (orig[o + j] - px[o + j]) * m;
      }
    }
  }
}

// The glow round each light itself (canvas pixels via `at`, radius in px),
// for the glows layer.
export function halosOf(rig: Rig, s: number): Array<{ x: number; y: number; z: number; R: number; color: RGB; a: number }> {
  const out = [];
  for (const g of rig.glows) {
    if (g.halo <= 0) continue;
    out.push({ x: g.x, y: g.y, z: g.z, R: g.halo * s, color: g.color, a: Math.min(0.9, KINDS[g.kind].glow * g.k) });
  }
  return out;
}

// ── grades ───────────────────────────────────────────────────────────────

// A multiply per channel (each 0..1, times 255: a tint at full strength,
// see tintAll), and a key naming it.
export type Grade = { rgb: RGB; key: string };
// What a picture is, for its grade: the room and what stands in it, what
// glows (lamps lit, fire, screens), the crew, the locals and the critter.
export type Tone = 'room' | 'emit' | 'fig';
export type Grades = Record<Tone, Grade | null> & { key: string };

// The night as it comes: cool and dim, the crew dimmed a little of it.
const NIGHT: { tint: RGB; strength: number; figures: number } = { tint: [62, 82, 150], strength: 0.5, figures: 0.3 };
// The crew takes this share of the evening tint as it comes; what glows
// half of either.
const AMBIENT_FIGURES = 0.5;
const EMIT = 0.5;

function gradeOf(parts: ReadonlyArray<readonly [RGB, number]>): Grade | null {
  const f = [1, 1, 1];
  for (const [tint, k] of parts) {
    if (!(k > 0)) continue;
    for (let i = 0; i < 3; i++) f[i] *= 1 - Math.min(1, k) + (Math.min(1, k) * tint[i]) / 255;
  }
  if (f.every((v) => v >= 0.999)) return null;
  const rgb: RGB = [f[0] * 255, f[1] * 255, f[2] * 255];
  return { rgb, key: rgb.map((v) => v.toFixed(2)).join(',') };
}

const grades = new WeakMap<WorldDef, [Grades?, Grades?]>();

// The grades of world w with the lights `lit` (kept per world).
export function gradesOf(w: WorldDef, lit: boolean): Grades {
  let pair = grades.get(w);
  if (!pair) grades.set(w, (pair = [undefined, undefined]));
  const i = lit ? 1 : 0;
  const had = pair[i];
  if (had) return had;
  const a = w.ambient && w.ambient.strength > 0 ? w.ambient : null;
  const n = w.light?.night;
  const night: readonly [RGB, number] = [n?.tint ?? NIGHT.tint, lit ? 0 : clamp(n?.strength ?? NIGHT.strength, 0, 1)];
  const amb: readonly [RGB, number] = a ? [a.tint, a.strength] : [[255, 255, 255], 0];
  const fa = clamp(a?.figures ?? AMBIENT_FIGURES, 0, 1);
  const fn = clamp(n?.figures ?? NIGHT.figures, 0, 1);
  const room = gradeOf([amb, night]);
  const emit = gradeOf([[amb[0], amb[1] * EMIT], [night[0], night[1] * EMIT]]);
  const fig = gradeOf([[amb[0], amb[1] * fa], [night[0], night[1] * fn]]);
  const key = [room, emit, fig].map((g) => g?.key ?? '-').join('/');
  return (pair[i] = { room, emit, fig, key });
}

// Multiplies a picture's colour by grade g (premultiplied stays so).
export function gradeAll(px: Uint8ClampedArray, g: Grade): void {
  tintAll(px, g.rgb, 1);
}

// Undoes gradeAll on an opaque picture, near enough (what a grade took to
// black stays black): what it was before the grade, to paint over as if
// ungraded and grade again (see Scene's animated props and overlay).
export function ungradeAll(px: Uint8ClampedArray, g: Grade): void {
  const lut = g.rgb.map((c) => {
    const t = new Uint8ClampedArray(256);
    const f = Math.max(1e-3, c / 255);
    for (let v = 0; v < 256; v++) t[v] = v / f + 0.5;
    return t;
  });
  const [lr, lg, lb] = lut;
  for (let o = 0, n = px.length; o < n; o += 4) {
    px[o] = lr[px[o]];
    px[o + 1] = lg[px[o + 1]];
    px[o + 2] = lb[px[o + 2]];
  }
}
