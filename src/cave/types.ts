import type { RGB } from '../term/color.ts';
import type { Sky } from './sky.ts';
import type { Palette } from '../themes/types.ts';
import type { Costume, Emote, Pose, Traits } from '../world/character.ts';
import type { Rng } from '../world/rng.ts';
import type { Voxels } from './voxels.ts';

// ── projection ───────────────────────────────────────────────────────────
// Pixel-exact 2:1 isometric view of the voxel grid, one voxel per pixel:
// moving +1 in x goes 1 px right and 0.5 px down, +1 in y 1 px left and
// 0.5 px down, +1 in z 1 px up. (ox, oy) is where the world origin (the
// back corner at z = 0) lands on the canvas.
//
//   sx = ox + (x - y)
//   sy = oy + (x + y) / 2 - z
//
// Depth along a view ray is x + y + z: larger is nearer the viewer.
export type View = { ox: number; oy: number };

export function project(v: View, x: number, y: number, z: number): [number, number] {
  return [v.ox + (x - y), v.oy + (x + y) / 2 - z];
}

export function depthOf(x: number, y: number, z: number): number {
  return x + y + z;
}

// ── light ────────────────────────────────────────────────────────────────
// A point light in world coordinates; `radius` in pixels.
export type PointLight = { x: number; y: number; z: number; color: RGB; radius: number; intensity: number };

// Scene grade: `ambient` light everywhere (255 = full), `illum` how far
// glowing things (fire, lava, crystals, sparks) light their surroundings,
// `bloom` the soft halo around them, `vignette` corner darkening (0..1).
export type Grade = { ambient: RGB; illum: number; bloom: number; vignette: number };

// ── particles ────────────────────────────────────────────────────────────
// Free-flying bits that are not (yet) voxels: sparks, embers, debris
// flung by an explosion (which lands and becomes `mat`), drips, runes
// drifting off a book, spell bolts. Positions in voxel units, velocities
// in voxels per second.
export type ParticleKind = 'spark' | 'ember' | 'debris' | 'drop' | 'rune' | 'bolt' | 'glint' | 'zzz';
export type Particle = {
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number; // seconds left
  color: RGB;
  glow: boolean; // emissive (lights its surroundings)
  gravity: number; // voxels/s^2 pulling down (negative floats up)
  mat?: number; // becomes this material where it lands (debris, drops)
  ignites?: boolean; // sets flammable voxels it touches on fire
  target?: { x: number; y: number; z: number }; // bolts home in on this
};

// ── characters ───────────────────────────────────────────────────────────
export type Facing = { back: boolean; flip: boolean };

// A tiny Noita-style figure (about 12 px tall). `px` is the albedo, `glow`
// the self-lit pixels (eyes, staff tip, lamp) drawn on top and added to
// the emissive buffer; (ax, ay) is the anchor (between the feet);
// (dx, dy) a per-frame offset (hop, shake); `light` an optional light the
// figure carries (staff, miner lamp), offset in pixels from the anchor.
export type WizardSprite = {
  w: number;
  h: number;
  px: Array<Array<RGB | null>>;
  glow: Array<Array<RGB | null>>;
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  light?: { dx: number; dy: number; color: RGB; radius: number; intensity: number };
};

// `costume` dresses the figure for the scene (default 'wizard'); `item` is
// the colour of a block it carries overhead ('carry') or sets down ('place').
export type FigureOpts = { costume?: Costume; item?: RGB };
export type WizardFn = (tr: Traits, pose: Pose, t: number, facing: Facing, phase?: number, opts?: FigureOpts) => WizardSprite;

// A small picture over a head (see Emote); (ax, ay) is its bottom centre.
export type EmoteSprite = { w: number; h: number; px: Array<Array<RGB | null>>; glow: Array<Array<RGB | null>>; ax: number; ay: number };

// ── layout ───────────────────────────────────────────────────────────────
export type StationKind = 'write' | 'read' | 'search' | 'run' | 'web' | 'think' | 'idle';
export type SlotKind = StationKind | 'entrance';

// Where a prop stands. Props back onto one of the two back walls: the
// 'right' wall is the plane y = T (props extend +y out into the room,
// `along` runs +x), the 'left' wall the plane x = T (props extend +x,
// `along` runs +y). (x0, y0) is the prop's back corner on the floor, z0 the
// floor height there; `len` along the wall, `dep` out from it. `spot` is
// where an agent stands to work it (floor coordinates, voxel units).
// An `island` stands free out on the floor, built as if it backed onto
// `wall` (the same frame, its front and its agent toward the viewer) with
// nothing behind it.
export type Slot = {
  kind: SlotKind;
  wall: 'left' | 'right';
  island?: boolean;
  x0: number;
  y0: number;
  z0: number;
  len: number;
  dep: number;
  spot: { x: number; y: number };
};

// The cave chunk sized for a canvas: world dims, wall thickness T (the two
// back walls are solid rock slabs x < T and y < T, up to H), floor level
// (top of the floor slab, z), the station slots and the projection.
export type Layout = {
  W: number;
  D: number;
  H: number;
  T: number;
  floor: number;
  slots: Slot[];
  view: View;
};

// ── biomes ───────────────────────────────────────────────────────────────
// What a prop or the weather may do each frame.
export type Ctx = {
  v: Voxels;
  rng: Rng;
  t: number; // seconds
  dt: number; // seconds since the last frame
  spawn(p: Particle): void;
  light(l: PointLight): void; // a light for this frame only
};

export type Prop = {
  name: string;
  // Carve/build the prop into the world (runs once at generation).
  build(v: Voxels, s: Slot, rng: Rng): void;
  // Per frame: idle animation and, while an agent works here (`active`),
  // the work's effects (sparks, fire under the cauldron, digging...).
  tick?(c: Ctx, s: Slot, active: boolean): void;
};

// Somewhere idle characters like to be: a seat, a view, a drink, a dance
// floor, a warm fire, a critter to pet. (x, y) is where they stand (floor
// coordinates); `face` what they look at.
export type Poi = { x: number; y: number; kind: 'seat' | 'view' | 'drink' | 'dance' | 'warm' | 'pet'; face?: { x: number; y: number } };

// What characters build together in the open floor, block by block:
// materials to build with (frame first) and the overall shape.
export type BuildStyle = { mats: readonly number[]; shape: 'tower' | 'house' | 'pyramid' | 'statue' | 'machine' };

export type Finale = { colors: RGB[]; mat?: number; glow?: boolean; gravity?: number };

export type Biome = {
  id: string;
  name: string;
  tagline: string;
  palette: Palette; // UI chrome colours
  backdrop: RGB; // the void around the chunk
  sky?: Sky; // something out in that void (see sky.ts)
  grade: Grade;
  // Material colour overrides for this biome (e.g. bluish rock).
  colors?: Partial<Record<number, string>>;
  // Fill the world: rock slabs, floor, strata, pools, decor, and every
  // slot's prop (via `props`).
  generate(v: Voxels, L: Layout, rng: Rng): void;
  props: Record<SlotKind, Prop>;
  // Ambient life each frame: drips, falling sand, lava falls, snow, spores.
  weather?(c: Ctx, L: Layout): void;
  // How characters dress here (default 'wizard').
  costume?: Costume;
  // What a finish showers down (default: glowing gold dust that settles as
  // voxels). Indoors leave out `mat`: the bits vanish where they land.
  finale?: Finale;
  // What they build together, and where idle characters like to go.
  build?: BuildStyle;
  pois?(L: Layout): Poi[];
};
