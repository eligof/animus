// 2:1 pixel isometric projection. gx runs right-down on screen, gy
// left-down, gz up. A tile is `tw` pixels wide; `ky` corrects for pixels
// that are not square (pixel width / pixel height: 1 for half blocks, 0.75
// for 2x3 sextant cells), so tiles and voxels keep their shape on screen.
export class Iso {
  readonly tw: number;
  readonly hx: number; // half tile width (pixels)
  readonly hy: number; // one height unit / half tile height x 2 (pixels)
  readonly ky: number;
  ox: number;
  oy: number;

  constructor(tw: number, ox: number, oy: number, ky = 1) {
    this.tw = tw;
    this.ky = ky;
    this.hx = tw / 2;
    this.hy = (tw / 2) * ky;
    this.ox = ox;
    this.oy = oy;
  }

  // Half tile width; kept for callers that size things in square pixels.
  get hh(): number {
    return this.hx;
  }

  toScreen(gx: number, gy: number, gz = 0): [number, number] {
    return [this.ox + (gx - gy) * this.hx, this.oy + ((gx + gy) * this.hy) / 2 - gz * this.hy];
  }

  // Inverse of toScreen on the horizontal plane at height gz.
  floorAt(sx: number, sy: number, gz = 0): [number, number] {
    const a = (sx - this.ox) / this.hx; // gx - gy
    const b = (sy - this.oy + gz * this.hy) / (this.hy / 2); // gx + gy
    return [(a + b) / 2, (b - a) / 2];
  }
}
