import type { Pen } from '../art/types.ts';
import type { Layout, Particle, Poi, SlotKind } from '../world/types.ts';
import type { RGB } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import type { Costume } from '../world/character.ts';

// An illustrated world: a room drawn as outlined cartoon art in 2:1
// isometric, its props, and how the characters live in it.
//
// World units: x and y on the floor, z up; the floor is z = 0 and the two
// back walls are slabs x < T and y < T. The scene projects a unit point to
// canvas pixels with `s` pixels per unit:
//
//   px = ox + (x - y) * s
//   py = oy + (x + y) * s / 2 - z * s
//
// Larger x + y is nearer the viewer.
export type Project = (x: number, y: number, z: number) => [number, number];

// What a prop draws with. `at(u, v, z)` maps prop-local units to canvas
// pixels: u runs along its wall (0..len), v out from the wall into the
// room (0..dep), z up from the floor. One drawing serves both walls and
// free-standing islands (which are drawn as if backed onto `wall`, front
// toward the viewer). `t` is the scene clock in seconds; `active` is true
// while an agent works the prop; `seed` varies the details per placement.
export type PropView = {
  pen: Pen;
  s: number;
  at(u: number, v: number, z: number): [number, number];
  len: number;
  dep: number;
  wall: 'left' | 'right';
  island: boolean;
  t: number;
  active: boolean;
  seed: number;
};

// A piece of furniture or machinery. `len` x `dep` is its footprint on the
// floor (units), `height` how tall it stands (units); characters walk
// around the footprint. Props that are not `animated` are drawn once and
// cached; animated ones are redrawn every frame (keep them small). `emit`
// may spawn particles each frame (steam off a cup, sparks while active).
export type PropArt = {
  len: number;
  dep: number;
  height: number;
  animated?: boolean;
  draw(v: PropView): void;
  emit?(v: PropView, dt: number, spawn: (p: Particle) => void): void;
};

// What the room shell draws with: the floor and the two back walls.
// `W` x `D` is the floor (units), `H` the wall height, `T` the wall
// thickness.
export type RoomView = {
  pen: Pen;
  s: number;
  at: Project;
  W: number;
  D: number;
  H: number;
  T: number;
  t: number;
  seed: number;
};

// `draw` paints the static shell once; `overlay`, when given, paints over
// the finished frame every frame (rain on the windows, a flicker).
export type RoomArt = {
  draw(v: RoomView): void;
  overlay?(v: RoomView): void;
};

export type CritterKind = 'cat' | 'rat' | 'drone' | 'slime' | 'fox' | 'imp' | 'beetle' | 'hopper' | 'husky' | 'corgi';
export type BuildShape = 'tower' | 'house' | 'pyramid' | 'statue' | 'machine';

export type WorldDef = {
  id: string;
  name: string;
  tagline: string;
  palette: Palette; // UI chrome colours
  backdrop: RGB; // around the room
  ink?: string; // the one outline colour of its art (default: derived from the palette)
  room: RoomArt;
  // The prop at each station slot (and the entrance).
  stations: Record<SlotKind, PropArt>;
  // Extra furniture scattered by the room planner along the walls or on
  // the open floor, clear of the stations and walkways.
  decor?: ReadonlyArray<{ art: PropArt; count: number; place: 'wall' | 'floor' }>;
  // A colour multiplied over the finished scene (0 = none, 1 = full).
  ambient?: { tint: RGB; strength: number };
  costume: Costume;
  critter: { kind: CritterKind; body: RGB };
  finale: { colors: RGB[] };
  build: { colors: RGB[]; shape: BuildShape };
  pois?(L: Layout): Poi[];
};
