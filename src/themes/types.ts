import type { RGB } from '../term/color.ts';
import type { WorldDef } from '../worlds/types.ts';

export type { StationKind } from '../world/types.ts';

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

// A scene preset: one illustrated world (see src/worlds/types.ts).
export type Theme = WorldDef;
