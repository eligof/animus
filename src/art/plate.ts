// A scene frame as a stack of pictures that the terminal composites itself
// (see docs/superpowers/specs/2026-10-24-sprite-compositor-design.md).
// Pictures are sent once and kept; a frame where things only move is then a
// handful of placements, not pixels. The same plate composited here (for
// screenshots, tests and terminals that only take whole pictures) is
// exactly what the terminal shows.

import type { RGB } from '../term/color.ts';
import type { Rect as Cells } from '../term/screen.ts';
import { Canvas } from './canvas.ts';
import { hexOf } from './iso.ts';
import type { Bitmap } from './types.ts';

// A picture the terminal keeps. `key` names its pixels: the same key, the
// same pixels, for as long as the process runs. `img` is premultiplied
// RGBA; `opaque` when every pixel is (it may go out without alpha).
export type Pic = { key: string; img: Bitmap; opaque?: boolean };

// One placement: `pic` with its top-left at canvas pixel (x, y), whole
// pixels; what falls outside the canvas is cut off. `id` names the
// placement from frame to frame (the base, prop 3, a figure). `volatile`:
// the pic changes often (animated in place: particles, an animated prop,
// the overlay), so a new one replaces the last under this id instead of
// being kept for reuse.
export type Placed = { id: string; pic: Pic; x: number; y: number; volatile?: boolean };

// A frame: a stack of placed pictures, bottom first, over the backdrop.
// `width` x `height` is the canvas (the scene's cells, `rect`, at `cell`
// pixels each).
export type Plate = {
  width: number;
  height: number;
  rect: Cells;
  cell: { w: number; h: number };
  backdrop: RGB;
  layers: Placed[];
};

// The plate as one picture, into `into` when it is the right size.
export function composite(p: Plate, into?: Canvas | null): Canvas {
  const c = into && into.width === p.width && into.height === p.height ? into : new Canvas(p.width, p.height);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  c.globalCompositeOperation = 'source-over';
  c.clear(hexOf(p.backdrop));
  for (const l of p.layers) c.drawImage(l.pic.img, l.x, l.y);
  return c;
}
