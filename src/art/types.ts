// The drawing surface the illustrated scene is painted with: a subset of
// the browser's CanvasRenderingContext2D, same names and same meaning, so
// art reads like ordinary canvas code. Implemented in ./canvas.ts over a
// premultiplied RGBA bitmap with exact-coverage anti-aliasing.

// '#rgb', '#rrggbb', '#rrggbbaa', 'rgb(r, g, b)' or 'rgba(r, g, b, a)'.
export type Color = string;

export interface Gradient {
  addColorStop(offset: number, color: Color): void;
}

export type Composite = 'source-over' | 'source-atop' | 'destination-out' | 'multiply' | 'screen' | 'lighter';

// Premultiplied RGBA, row-major, 4 bytes a pixel.
export interface Bitmap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface Pen {
  readonly width: number;
  readonly height: number;
  fillStyle: Color | Gradient;
  strokeStyle: Color | Gradient;
  lineWidth: number;
  lineJoin: 'round' | 'miter' | 'bevel';
  lineCap: 'round' | 'butt' | 'square';
  globalAlpha: number;
  globalCompositeOperation: Composite;

  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  rotate(rad: number): void;
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void;
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void;

  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  arc(x: number, y: number, r: number, a0: number, a1: number, ccw?: boolean): void;
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw?: boolean): void;
  rect(x: number, y: number, w: number, h: number): void;
  roundRect(x: number, y: number, w: number, h: number, r: number): void;

  fill(rule?: 'nonzero' | 'evenodd'): void;
  stroke(): void;
  clip(rule?: 'nonzero' | 'evenodd'): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  clearRect(x: number, y: number, w: number, h: number): void;

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient;
  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient;

  drawImage(img: Bitmap, dx: number, dy: number, dw?: number, dh?: number): void;
}
