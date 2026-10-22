import type { RGB } from '../term/color.ts';
import type { Box } from '../iso/box.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import type { Grade } from '../iso/light.ts';
import type { Room } from '../iso/room.ts';

export type StationKind = 'write' | 'read' | 'search' | 'run' | 'web' | 'think' | 'idle';

export const STATION_KINDS: readonly StationKind[] = ['write', 'read', 'search', 'run', 'web', 'think', 'idle'];

// UI colours (header, roster, footer, bubbles).
export type Palette = {
  bg: RGB;
  wall: RGB;
  wall2: RGB;
  floor: RGB;
  floor2: RGB;
  text: RGB;
  dim: RGB;
  accent: RGB;
  accent2: RGB;
  panel: RGB;
  panelText: RGB;
  border: RGB;
  bubble: RGB;
  bubbleText: RGB;
  good: RGB;
  warn: RGB;
  bad: RGB;
};

// A lamp: a pool of `color` light `radius` tiles wide on the floor below
// it, also lighting whatever stands above the pool up to its height.
export type Lamp = { color: RGB; radius: number; intensity: number };
// A lamp in the room, in tile coordinates (gx, gy on the floor, gz up).
export type RoomLight = Lamp & { gx: number; gy: number; gz: number };
// A lamp on a piece of furniture, in the station's frame (see IsoStation).
export type StationLight = Lamp & { a: number; b: number; z: number };

// A piece of furniture: a voxel model in its own frame (`a` along the wall,
// `b` out into the room, `z` up; all in tile units) that fits inside `size`.
// `active` is true while an agent works at it. `light` is what it casts
// (screens, flames, lamps), if anything.
export type IsoStation = {
  name: string;
  size: { len: number; dep: number; h: number };
  model(t: number, active: boolean): Box[];
  light?(t: number, active: boolean): StationLight | StationLight[] | null;
};

// The scene's light: a grade (ambient light, haze, bloom, vignette) over
// the finished room, plus room lamps not tied to furniture.
export type Lighting = Grade & { lights?(room: Room, t: number, now: number): RoomLight[] };

// A scene preset drawn as an isometric room. `floor` paints floor pixels at
// tile coordinates; `wall` paints the two back walls (`u` along the wall in
// tiles from the back corner, `v` up in height units, `now` is the scene
// clock for anything showing the time of day). `ambient` draws effects over
// the finished scene.
export type IsoTheme = {
  id: string;
  name: string;
  tagline: string;
  palette: Palette;
  backdrop: RGB;
  wallH: number;
  floor(gx: number, gy: number, t: number): RGB;
  wall(side: 'left' | 'right', u: number, v: number, t: number, now: number): RGB;
  stations: Record<StationKind | 'entrance', IsoStation>;
  ambient?(c: PixelCanvas, room: Room, t: number): void;
  lighting?: Lighting;
};

export type Theme = IsoTheme;
