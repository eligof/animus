import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';

export type StationKind = 'write' | 'read' | 'search' | 'run' | 'web' | 'think' | 'idle';

export const STATION_KINDS: readonly StationKind[] = ['write', 'read', 'search', 'run', 'web', 'think', 'idle'];

export type Palette = {
  bg: RGB; // outside the scene / letterbox
  wall: RGB;
  wall2: RGB;
  floor: RGB;
  floor2: RGB;
  text: RGB;
  dim: RGB;
  accent: RGB;
  accent2: RGB;
  panel: RGB; // header/footer/roster background
  panelText: RGB;
  border: RGB;
  bubble: RGB; // speech bubbles
  bubbleText: RGB;
  good: RGB;
  warn: RGB;
  bad: RGB;
};

// Station art: `rows` are glyphs, `fg`/`bg` are same-shaped grids of single
// character keys into StationDef.colors. A space glyph with no bg key is
// transparent. Use art()/byChar() from art.ts to build these.
export type Art = {
  rows: string[];
  fg: string[];
  bg: string[] | null;
  w: number;
  h: number;
  cells: Array<Array<{ ch: string; f: string; b: string }>>;
};

export type StationDef = {
  kind: StationKind | 'entrance';
  name: string;
  frames: Art[]; // idle animation, max 11 wide x 6 tall
  active?: Art[]; // animation while an agent works here
  fps: number;
  colors: Record<string, RGB>;
};

// `floors` lists the top row of each 2-row floor band, top level first. The
// stage stands station art on the first band row and characters' feet on the
// second. Everything a theme draws must stay inside `r`. `now` (ms epoch) is
// the scene's clock for anything showing the time of day; it follows the
// simulation, so demo snapshots stay reproducible.
export type Theme = {
  id: string;
  name: string;
  tagline: string;
  palette: Palette;
  stations: StationDef[];
  entrance: StationDef;
  drawBackdrop(s: Screen, r: Rect, t: number, floors: number[], now?: number): void;
  drawAmbient(s: Screen, r: Rect, t: number, floors: number[]): void;
};
