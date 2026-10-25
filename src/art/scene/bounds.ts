// A pen that paints nothing and notes where it would have: the box round
// every fill, stroke, rectangle and image (device pixels, generous: curves
// by their control points, arcs and ellipses whole, strokes by their widest
// join), and whether any of it was blended other than 'source-over' (light
// laid on with 'screen' or 'lighter', which a picture on its own cannot
// carry; see pixels.ts lift). Drawing something once through it says how
// big a canvas to draw it into for real, and where its separate pieces are.

import type { Bitmap, Color, Composite, Gradient, Pen } from '../types.ts';

// One mark, ends exclusive; `light` when it was not painted 'source-over'.
export type Mark = { x0: number; y0: number; x1: number; y1: number; light: boolean };

type State = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  fillStyle: Color | Gradient;
  strokeStyle: Color | Gradient;
  lineWidth: number;
  lineJoin: 'round' | 'miter' | 'bevel';
  lineCap: 'round' | 'butt' | 'square';
  globalAlpha: number;
  globalCompositeOperation: Composite;
};

const GRADIENT: Gradient = { addColorStop() {} };

export class Bounds implements Pen {
  readonly width: number;
  readonly height: number;
  fillStyle: Color | Gradient = '#000000';
  strokeStyle: Color | Gradient = '#000000';
  lineWidth = 1;
  lineJoin: 'round' | 'miter' | 'bevel' = 'miter';
  lineCap: 'round' | 'butt' | 'square' = 'butt';
  globalAlpha = 1;
  globalCompositeOperation: Composite = 'source-over';
  // Every mark, and their union (empty while x1 <= x0).
  readonly marks: Mark[] = [];
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  light = false;
  private m = [1, 0, 0, 1, 0, 0];
  private stack: State[] = [];
  // The current path's box, device px.
  private px0 = Infinity;
  private py0 = Infinity;
  private px1 = -Infinity;
  private py1 = -Infinity;

  // `width` x `height`: the canvas it stands in for (art may size things by it).
  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
  }

  save(): void {
    const [a, b, c, d, e, f] = this.m;
    this.stack.push({ a, b, c, d, e, f, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, lineJoin: this.lineJoin, lineCap: this.lineCap, globalAlpha: this.globalAlpha, globalCompositeOperation: this.globalCompositeOperation });
  }
  restore(): void {
    const s = this.stack.pop();
    if (!s) return;
    this.m = [s.a, s.b, s.c, s.d, s.e, s.f];
    this.fillStyle = s.fillStyle;
    this.strokeStyle = s.strokeStyle;
    this.lineWidth = s.lineWidth;
    this.lineJoin = s.lineJoin;
    this.lineCap = s.lineCap;
    this.globalAlpha = s.globalAlpha;
    this.globalCompositeOperation = s.globalCompositeOperation;
  }

  translate(x: number, y: number): void {
    this.transform(1, 0, 0, 1, x, y);
  }
  scale(x: number, y: number): void {
    this.transform(x, 0, 0, y, 0, 0);
  }
  rotate(rad: number): void {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    this.transform(cos, sin, -sin, cos, 0, 0);
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    const [A, B, C, D, E, F] = this.m;
    this.m = [A * a + C * b, B * a + D * b, A * c + C * d, B * c + D * d, E + A * e + C * f, F + B * e + D * f];
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.m = [a, b, c, d, e, f];
  }

  beginPath(): void {
    this.px0 = this.py0 = Infinity;
    this.px1 = this.py1 = -Infinity;
  }
  closePath(): void {}
  moveTo(x: number, y: number): void {
    this.add(x, y);
  }
  lineTo(x: number, y: number): void {
    this.add(x, y);
  }
  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    this.add(cx, cy);
    this.add(x, y);
  }
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    this.add(c1x, c1y);
    this.add(c2x, c2y);
    this.add(x, y);
  }
  arc(x: number, y: number, r: number): void {
    this.square(x, y, r);
  }
  ellipse(x: number, y: number, rx: number, ry: number): void {
    this.square(x, y, Math.max(rx, ry));
  }
  rect(x: number, y: number, w: number, h: number): void {
    this.add(x, y);
    this.add(x + w, y);
    this.add(x + w, y + h);
    this.add(x, y + h);
  }
  roundRect(x: number, y: number, w: number, h: number): void {
    this.rect(x, y, w, h);
  }

  fill(): void {
    this.mark(1);
  }
  stroke(): void {
    // Half the pen, scaled by the transform (the Frobenius norm bounds the
    // largest stretch), out to a miter's spike (the canvas caps it at 10).
    const [a, b, c, d] = this.m;
    const k = this.lineJoin === 'miter' ? 10 : 1.5;
    this.mark((this.lineWidth / 2) * Math.sqrt(a * a + b * b + c * c + d * d) * k + 1);
  }
  clip(): void {}
  fillRect(x: number, y: number, w: number, h: number): void {
    this.beginPath();
    this.rect(x, y, w, h);
    this.mark(1);
  }
  clearRect(): void {}

  createLinearGradient(): Gradient {
    return GRADIENT;
  }
  createRadialGradient(): Gradient {
    return GRADIENT;
  }

  drawImage(img: Bitmap, dx: number, dy: number, dw?: number, dh?: number): void {
    this.beginPath();
    this.rect(dx, dy, dw ?? img.width, dh ?? img.height);
    this.mark(1);
  }

  private add(x: number, y: number): void {
    const [a, b, c, d, e, f] = this.m;
    const X = a * x + c * y + e;
    const Y = b * x + d * y + f;
    if (X < this.px0) this.px0 = X;
    if (X > this.px1) this.px1 = X;
    if (Y < this.py0) this.py0 = Y;
    if (Y > this.py1) this.py1 = Y;
  }

  // The four corners of the square r round (x, y), mapped.
  private square(x: number, y: number, r: number): void {
    this.add(x - r, y - r);
    this.add(x + r, y - r);
    this.add(x + r, y + r);
    this.add(x - r, y + r);
  }

  private mark(pad: number): void {
    if (!(this.px1 >= this.px0) || !(this.py1 >= this.py0)) return;
    const mk: Mark = {
      x0: Math.floor(this.px0 - pad),
      y0: Math.floor(this.py0 - pad),
      x1: Math.ceil(this.px1 + pad),
      y1: Math.ceil(this.py1 + pad),
      light: this.globalCompositeOperation !== 'source-over',
    };
    if (!Number.isFinite(mk.x0 + mk.y0 + mk.x1 + mk.y1)) return;
    this.marks.push(mk);
    if (mk.x0 < this.x0) this.x0 = mk.x0;
    if (mk.y0 < this.y0) this.y0 = mk.y0;
    if (mk.x1 > this.x1) this.x1 = mk.x1;
    if (mk.y1 > this.y1) this.y1 = mk.y1;
    this.light ||= mk.light;
  }
}
