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

// A point, and a quad (four corners going round, the first at its bottom
// left as the viewer sees it), in a prop's frame (u, v, z).
export type P3 = readonly [number, number, number];
export type Quad = readonly [P3, P3, P3, P3];

// A small thing that may stand on a workstation's top (see
// WorkstationArt.clutter), in the world's style: `r` is the radius of its
// footprint (at most 0.5) and `h` how tall it stands (units, at most 1.5),
// round where it stands. `draw` paints it standing at `at` (u, v on the top,
// z the top's surface) with the desk's view (`v.active` while its screen is
// on: a candle may be lit). It never reads `v.t`: it is drawn once and
// kept. `name` tells it apart (camelCase, unique in its world).
export type Clutter = { name: string; r: number; h: number; draw(v: PropView, at: P3): void };

// Something on a workstation that moves while its agent works (a
// lantern's flame, a cauldron's bubbles, steam off a cup): `frames`
// pictures (4 to 8) shown `fps` a second (at most 8), standing at `at` in
// the desk's frame, inside `r` round it and `h` over it. `draw` paints
// frame `i`; frame 0 is the still one shown while the screen is off
// (`v.active` false: unlit). It never reads `v.t`, and every frame paints
// something, lit or not (a loop of steam draws its cup too). Loops draw the
// same on every look of the desk (they get look 0), and stand clear of the
// clutter's spots. The desk's own draw leaves out what its loops paint.
export type DeskLoop = { name: string; at: P3; r: number; h: number; frames: number; fps: number; draw(v: PropView, i: number): void };

// A world's workstation (see world/desks.ts): a prop DESK.len x DESK.dep
// that stands at most DESK.height tall. Its own picture is never animated
// (it is drawn once a scale, frame, look and pick of clutter, and kept; see
// art/scene/desk.ts); its loops are pictures of their own. Its agent
// stands at DESK_SPOT, in front. It names where its screen is (`screen`, upright on its body, to the right of
// where its agent stands: the shared activity layer draws on it, see
// art/screen.ts) and where a desk upgrade stands on it (`top`, on its top
// surface). `v.active` is true while its screen is on; `v.seed` is 0, 1 or
// 2: the world's few looks of it. `clutter`: things a place's desk picks a
// few of (see clutterOf in ./workstation.ts) and the spots on the top they
// may stand on, clear of the screen, the upgrade and the agent at work;
// `loops`: one or two things that move on it while its agent works, clear
// of the same and of the clutter's spots.
export type WorkstationArt = PropArt & {
  screen: Quad;
  top: P3;
  clutter?: { items: readonly Clutter[]; spots: readonly P3[] };
  loops?: readonly DeskLoop[];
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
  // Each agent's own workstation (a plain desk with a screen in the
  // world's colours when it has none: see worlds/workstation.ts).
  workstation?: WorkstationArt;
  // A colour multiplied over the finished scene (0 = none, 1 = full).
  ambient?: { tint: RGB; strength: number };
  costume: Costume;
  critter: { kind: CritterKind; body: RGB };
  finale: { colors: RGB[] };
  build: { colors: RGB[]; shape: BuildShape };
  pois?(L: Layout): Poi[];
};
