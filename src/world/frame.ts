import type { RGB } from '../term/color.ts';
import type { Rect as Cells } from '../term/screen.ts';
import type { BuildShape, CritterKind, WorldDef } from '../worlds/types.ts';
import type { Block } from './build.ts';
import type { Costume, Emote, Feel, Pose, Traits, Wear } from './character.ts';
import type { Rect } from './layout.ts';
import type { Room } from './room.ts';
import type { Facing, Particle } from './types.ts';

// Everything a renderer needs to draw one frame of the scene, as plain data
// (the stage builds it, see Stage.frame). World units throughout (see
// worlds/types.ts), projected to canvas pixels by the camera:
//
//   px = ox + (x - y) * s
//   py = oy + (x + y) * s / 2 - z * s
//
// The canvas is the scene's cells at the terminal's cell size: `cells` (in
// screen cells) times `cell` (pixels a cell), `w` x `h` pixels. Terminal
// cell (col, row) covers canvas pixels from ((col - cells.x) * cell.w,
// (row - cells.y) * cell.h), one cell in size.

// A character's height, and its top: the top of its head, or of a hat
// that stands up off it (see figureTop). Its emote shows over its top, a
// box `size` units across from `gap` units up: label placement keeps clear
// of both, so the scene must draw them there.
export const FIGURE_H = 14;
export const EMOTE = { gap: 1, size: 5 };
// Half a character's width, arms and held tools included.
export const FIGURE_HALF_W = 4;
// How high a happy bounce lifts a character, at most (see FigureFrame.hop).
export const HOP = 0.9;
// How high hats reach, units over the feet (any species, standing,
// walking or at work; a ghost floats): a wizard's own, and the one a level
// brings (★2) in each costume (see art/figure/look.ts).
const WIZARD_HAT = 19.25;
const LEVEL_HAT: Record<Costume, number> = {
  casual: 18.25,
  scientist: 17.5,
  raver: 21.75,
  hacker: 17.5,
  astronaut: 20.75,
  wizard: 20.75,
  drifter: 17.75,
  nord: 17.5,
  exosuit: 17.5,
  jumpsuit: 17.5,
  colonist: 17.5,
  miner: 18.5,
  forager: 17.75,
  parka: 17.5,
  guard: 17.5,
  demon: 17.75,
  startup: 18.25,
};

// Where a character's top is, units over its feet: its hat's, or its
// head's, and as high again as a hop lifts it while it is happy enough to
// bounce and awake, whatever its pose (it hops only standing about or
// walking: a pose of its own between hops must not move its label, card
// or emote).
export function figureTop(g: Pick<FigureFrame, 'costume' | 'wear' | 'feel'> & Partial<Pick<FigureFrame, 'sleeping'>>): number {
  const hat = g.wear?.hat ? LEVEL_HAT[g.costume] : g.costume === 'wizard' ? WIZARD_HAT : FIGURE_H;
  return hat + (g.feel?.bouncy && !g.sleeping ? HOP : 0);
}

export type Camera = {
  s: number; // canvas pixels per unit
  ox: number; // where the world origin (the back corner, z = 0) lands
  oy: number;
  w: number; // the canvas, pixels
  h: number;
  cell: { w: number; h: number }; // a terminal cell, pixels
  cells: Cells; // the scene's rect, in terminal cells
};

// One character. `poseT` is the pose's animation clock (seconds; it runs
// faster while jogging), `phase` a per-character offset (0..1) so idle
// loops and blinks are not in lockstep. `item` is the colour of a block
// carried overhead ('carry') or being set down ('place'). `emote` shows
// over the head, `t` seconds after it popped up (at most a few at once).
// `hurt` while an error is on show; `walking` while on the move. `feel` is
// how its meters say it feels; `hop` how high a happy bounce lifts it this
// frame (units; only the figure is drawn higher: its shadow, label and
// card stay put; while it is happy and awake, figureTop counts the
// highest hop); `wear` what its level lets it wear; `mug` a mug of coffee
// carried in a free hand (see MUG_POSES in art/figure/rig.ts).
export type FigureFrame = {
  id: string;
  x: number;
  y: number;
  z: number;
  traits: Traits;
  costume: Costume;
  pose: Pose;
  poseT: number;
  phase: number;
  facing: Facing;
  item?: RGB;
  emote?: { kind: Emote; t: number };
  selected: boolean;
  hurt: boolean;
  sleeping: boolean;
  walking: boolean;
  feel?: Feel;
  wear?: Wear;
  hop?: number;
  mug?: boolean;
};

// The critter: `heart` is how long a heart has shown over it (absent when
// none), `z` how high it floats.
export type CritterFrame = { kind: CritterKind; body: RGB; x: number; y: number; z: number; flip: boolean; moving: boolean; heart?: number };

// A build: the blocks standing so far, the blocks still to come (drawn as
// a ghost in `ghost`, a hue that stands out from the world), the colours
// blocks index, how far along it is (0..1), the pile builders fetch from
// while it goes up, and the top (a beacon glows there once complete).
export type BuildFrame = {
  shape: BuildShape;
  blocks: readonly Block[];
  pending: readonly Block[];
  colors: readonly RGB[];
  progress: number;
  complete: boolean;
  top: { x: number; y: number; z: number };
  pile: Rect | null;
  ghost: RGB;
};

// A label the terminal shows over the scene: the `w` cells from (col, row)
// it takes, where the scene draws a soft rounded pill in `color` at
// `alpha` behind the terminal text (`text` in `ink`, its activity glyph
// `mark` recoloured). 'glyph' is a lone activity glyph, 'error' a bubble
// for an error on show, 'word' a level-up's rising ★N! (last, so it goes
// over any label it rises through, its pill and its text).
export type LabelFrame = { col: number; row: number; w: number; kind: 'name' | 'bubble' | 'error' | 'glyph' | 'word'; color: RGB; alpha: number; text: string; ink: RGB; bold: boolean; mark?: { col: number; ch: string; ink: RGB } };

// A desk upgrade (★5; see Stage.trinkets): a plant, a steaming mug or a
// trophy standing on its owner's workstation, `z` up (on the floor without
// one), in its owner's colour.
export type Trinket = 'plant' | 'mug' | 'trophy';
// Steam rises off a mug's rim this high (units) over where it stands.
export const MUG_TOP = 1.75;
export type TrinketFrame = { id: string; kind: Trinket; x: number; y: number; z?: number; color: RGB };

// What a workstation's screen shows (the shared activity layer, see
// art/screen.ts): the work of the agent at it, or dim ('off') while it
// waits or is away and once it is left empty.
export type Screen = 'write' | 'read' | 'search' | 'run' | 'web' | 'think' | 'talk' | 'off';
// A workstation standing in the room (see Stage): its desk's place and
// frame, what its screen shows, how far it has grown out of the floor (0
// to 1: popping up, or shrinking away once left) and which of the world's
// few looks of it (0 to 2) it wears.
export type DeskFrame = { id: number; wall: 'left' | 'right'; x0: number; y0: number; len: number; dep: number; screen: Screen; grow: number; seed: number };

export type SceneFrame = {
  world: WorldDef;
  room: Room;
  t: number; // scene clock, seconds
  lit: boolean; // lighting on (pools of lamp light, glows)
  active: boolean[]; // per room prop: an agent is working it (or passing through the entrance)
  camera: Camera;
  figures: FigureFrame[]; // far to near (by x + y)
  critter: CritterFrame | null;
  trinkets?: TrinketFrame[];
  desks?: DeskFrame[]; // the workstations, by desk index
  builds: BuildFrame[];
  particles: readonly Particle[];
  labels: LabelFrame[];
  // Letters the terminal shows over the scene with no pill: the z's
  // drifting off a sleeper, the !'s off an error.
  marks: Array<{ col: number; row: number; ch: string; ink: RGB }>;
  // The cameras one keypress away (the next agent, zooming in or out, the
  // previous agent, back to the whole room), most likely first: what to
  // get ready while nothing else needs doing.
  next?: Camera[];
};

// World point to canvas pixels.
export function project(c: Pick<Camera, 's' | 'ox' | 'oy'>, x: number, y: number, z: number): [number, number] {
  return [c.ox + (x - y) * c.s, c.oy + ((x + y) * c.s) / 2 - z * c.s];
}

// The terminal cell over a canvas pixel.
export function cellAt(c: Camera, px: number, py: number): [number, number] {
  return [c.cells.x + Math.floor(px / c.cell.w), c.cells.y + Math.floor(py / c.cell.h)];
}

// The terminal cells a character covers, ends inclusive: from the row
// just over its top (see figureTop) to the row of its feet, its half-width
// either side (in cells, so it grows with the zoom).
export function figureBox(c: Camera, g: Pick<FigureFrame, 'x' | 'y' | 'z' | 'costume' | 'wear' | 'feel' | 'sleeping'>): { x0: number; y0: number; x1: number; y1: number } {
  const { x, y, z } = g;
  const [px, top] = project(c, x, y, z + figureTop(g) + 1);
  const [, feet] = project(c, x, y, z);
  const half = FIGURE_HALF_W * c.s;
  const [x0, y0] = cellAt(c, px - half, top);
  const [x1, y1] = cellAt(c, px + half, feet);
  return { x0, y0, x1, y1 };
}

// The canvas box (pixels, ends exclusive) under a run of terminal cells.
export function cellBox(c: Camera, col: number, row: number, w: number): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = (col - c.cells.x) * c.cell.w;
  const y0 = (row - c.cells.y) * c.cell.h;
  return { x0, y0, x1: x0 + w * c.cell.w, y1: y0 + c.cell.h };
}
