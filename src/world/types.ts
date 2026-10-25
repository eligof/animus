import type { RGB } from '../term/color.ts';

// The shared model types of the room: where the stations stand, where idle
// characters like to go, and the bits flying about. World units throughout:
// x and y on the floor, z up, the floor at z = 0; the two back walls are
// slabs x < T and y < T. Larger x + y is nearer the viewer.

export type Spot = { x: number; y: number };

// ── particles ────────────────────────────────────────────────────────────
// Free-flying bits: sparks off work and finishes, confetti, smoke from a
// bang or a cup, embers and glints that drift, drops, the z's of a sleeper,
// bolts a lead casts at a subagent. Positions in units, velocities in units
// a second. Bits that land (confetti) lie on the floor (`landed`) and fade
// out over their last half second of `life` (see particles.ts).
export type ParticleKind = 'spark' | 'ember' | 'confetti' | 'smoke' | 'steam' | 'drop' | 'glint' | 'bolt' | 'zzz';
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
  glow: boolean; // self-lit (the scene may give it a halo)
  gravity: number; // units/s^2 pulling down (negative floats up)
  target?: { x: number; y: number; z: number }; // bolts home in on this
  landed?: boolean;
};

// ── characters ───────────────────────────────────────────────────────────
// Which way a figure faces on screen: `back` to the viewer, `flip`ped to
// face screen-left.
export type Facing = { back: boolean; flip: boolean };

// ── layout ───────────────────────────────────────────────────────────────
export type StationKind = 'write' | 'read' | 'search' | 'run' | 'web' | 'think' | 'idle';
export type SlotKind = StationKind | 'entrance';

// Where a station stands. Props back onto one of the two back walls: the
// 'right' wall is the plane y = T (props extend +y out into the room,
// `along` runs +x), the 'left' wall the plane x = T (props extend +x,
// `along` runs +y). (x0, y0) is the prop's back corner on the floor; `len`
// along the wall, `dep` out from it. `spot` is where an agent stands to
// work it. An `island` stands free out on the floor, drawn as if it backed
// onto `wall` (the same frame, its front and its agent toward the viewer)
// with nothing behind it.
export type Slot = {
  kind: SlotKind;
  wall: 'left' | 'right';
  island?: boolean;
  x0: number;
  y0: number;
  len: number;
  dep: number;
  spot: Spot;
};

// The room planned for a scene: the floor W x D, wall height H, wall
// thickness T, and the station slots.
export type Layout = {
  W: number;
  D: number;
  H: number;
  T: number;
  slots: Slot[];
};

// Somewhere idle characters like to be: a seat, a view, a drink, a dance
// floor, a warm fire, a critter to pet. (x, y) is where they stand; `face`
// what they look at.
export type Poi = { x: number; y: number; kind: 'seat' | 'view' | 'drink' | 'dance' | 'warm' | 'pet'; face?: Spot };
