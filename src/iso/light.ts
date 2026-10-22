import type { RGB } from '../term/color.ts';
import type { PixelCanvas } from './canvas.ts';
import { CLEAR } from './canvas.ts';

// A pool of light in screen pixels: an ellipse (rx, ry) around the spot on
// the floor below the lamp; `up` extends it straight up by that many pixels
// so walls and furniture above the pool are lit too.
export type ScreenLight = { x: number; y: number; rx: number; ry: number; up?: number; color: RGB; intensity: number };

// Scene grade. `ambient` is the light everywhere (255 = unchanged); `haze`
// adds each light's colour to the air even on black pixels; `bloom` makes
// emissive pixels glow onto their surroundings; `vignette` darkens towards
// the corners.
export type Grade = { ambient: RGB; haze?: number; bloom?: number; vignette?: number };

const BLOCK = 4; // bloom is gathered and blurred at 1/4 resolution
// Emissive score: the brightest channel weighted by saturation, so screens,
// neon and flames count and white floors do not. Fully emissive from FULL.
const EMIT_FROM = 170;
const EMIT_FULL = 235;
const BLOOM_GAIN = 3;

// Post-process for a PixelCanvas: lighting, haze, bloom and vignette.
// `capture` marks what glows by itself (call it once the room and furniture
// are drawn, before the characters); `apply` lights the finished frame.
// Emissive pixels that were not drawn over since the capture ignore the
// darkness and feed the bloom. Buffers are kept between frames.
export class Shader {
  private w = 0;
  private h = 0;
  private lr = new Float32Array(0);
  private lg = new Float32Array(0);
  private lb = new Float32Array(0);
  private vig: Float32Array | null = null;
  private vigFor = -1;
  private bw = 0;
  private bh = 0;
  private br = new Float32Array(0);
  private bg = new Float32Array(0);
  private bb = new Float32Array(0);
  private tmp = new Float32Array(0);
  private hot = new Uint8Array(0);
  private base = new Int32Array(0);
  private emit = new Float32Array(0);
  private captured = false;
  private glowing = false;

  capture(c: PixelCanvas): void {
    const { w, h, data } = c;
    this.resize(w, h);
    this.base.set(data);
    const { emit, br, bg, bb, bw } = this;
    br.fill(0);
    bg.fill(0);
    bb.fill(0);
    let glowing = false;
    for (let y = 0, i = 0; y < h; y++) {
      const brow = Math.floor(y / BLOCK) * bw;
      for (let x = 0; x < w; x++, i++) {
        const v = data[i];
        emit[i] = 0;
        if (v === CLEAR) continue;
        const R = (v >> 16) & 255;
        const G = (v >> 8) & 255;
        const B = v & 255;
        const mx = R > G ? (R > B ? R : B) : G > B ? G : B;
        const mn = R < G ? (R < B ? R : B) : G < B ? G : B;
        const score = mx * (0.3 + (0.7 * (mx - mn)) / (mx || 1));
        if (score <= EMIT_FROM) continue;
        const e = Math.min(1, (score - EMIT_FROM) / (EMIT_FULL - EMIT_FROM));
        emit[i] = e;
        const bi = brow + Math.floor(x / BLOCK);
        const k = e / (BLOCK * BLOCK);
        br[bi] += R * k;
        bg[bi] += G * k;
        bb[bi] += B * k;
        glowing = true;
      }
    }
    this.glowing = glowing;
    this.captured = true;
  }

  apply(c: PixelCanvas, lights: readonly ScreenLight[], g: Grade): void {
    const { w, h, data } = c;
    if (!this.captured || w !== this.w || h !== this.h) this.capture(c);
    this.captured = false;
    const ar = g.ambient[0] / 255;
    const ag = g.ambient[1] / 255;
    const ab = g.ambient[2] / 255;
    const { lr, lg, lb } = this;
    lr.fill(ar);
    lg.fill(ag);
    lb.fill(ab);
    for (const l of lights) this.addLight(l);
    const vig = g.vignette ? this.vignette(g.vignette) : null;
    const hz = (g.haze ?? 0) * 255;
    const { base, emit } = this;
    for (let i = 0; i < w * h; i++) {
      const v = data[i];
      if (v === CLEAR) continue;
      const k = vig ? vig[i] : 1;
      const still = v === base[i];
      // Characters and effects drawn since the capture take half of each
      // lamp: lit, but not blown out when they stand right in a pool.
      const m = still ? 1 : 0.5;
      let kr = (ar + (lr[i] - ar) * m) * k;
      let kg = (ag + (lg[i] - ag) * m) * k;
      let kb = (ab + (lb[i] - ab) * m) * k;
      const e = still ? emit[i] : 0;
      if (e > 0) {
        if (kr < 1) kr += (1 - kr) * e;
        if (kg < 1) kg += (1 - kg) * e;
        if (kb < 1) kb += (1 - kb) * e;
      }
      let R = ((v >> 16) & 255) * kr + (lr[i] - ar) * hz;
      let G = ((v >> 8) & 255) * kg + (lg[i] - ag) * hz;
      let B = (v & 255) * kb + (lb[i] - ab) * hz;
      R = R > 255 ? 255 : R < 0 ? 0 : R;
      G = G > 255 ? 255 : G < 0 ? 0 : G;
      B = B > 255 ? 255 : B < 0 ? 0 : B;
      data[i] = (((R + 0.5) | 0) << 16) | (((G + 0.5) | 0) << 8) | ((B + 0.5) | 0);
    }
    if (this.glowing && g.bloom) this.addBloom(c, g.bloom * BLOOM_GAIN);
  }

  private resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.lr = new Float32Array(w * h);
    this.lg = new Float32Array(w * h);
    this.lb = new Float32Array(w * h);
    this.vig = null;
    this.vigFor = -1;
    this.bw = Math.ceil(w / BLOCK);
    this.bh = Math.ceil(h / BLOCK);
    const n = this.bw * this.bh;
    this.br = new Float32Array(n);
    this.bg = new Float32Array(n);
    this.bb = new Float32Array(n);
    this.tmp = new Float32Array(n);
    this.hot = new Uint8Array(n);
    this.base = new Int32Array(w * h);
    this.emit = new Float32Array(w * h);
    this.captured = false;
  }

  private addLight(l: ScreenLight): void {
    if (!(l.rx > 0 && l.ry > 0 && Number.isFinite(l.x) && Number.isFinite(l.y))) return;
    const { w, h, lr, lg, lb } = this;
    const up = l.up ?? 0;
    const x0 = Math.max(0, Math.floor(l.x - l.rx));
    const x1 = Math.min(w - 1, Math.ceil(l.x + l.rx));
    const y0 = Math.max(0, Math.floor(l.y - l.ry - up));
    const y1 = Math.min(h - 1, Math.ceil(l.y + l.ry));
    const r = (l.color[0] / 255) * l.intensity;
    const g = (l.color[1] / 255) * l.intensity;
    const b = (l.color[2] / 255) * l.intensity;
    for (let y = y0; y <= y1; y++) {
      let dy = y + 0.5 - l.y;
      if (dy < 0) dy = Math.min(0, dy + up);
      const qy = (dy * dy) / (l.ry * l.ry);
      if (qy >= 1) continue;
      for (let x = x0, i = y * w + x0; x <= x1; x++, i++) {
        const dx = (x + 0.5 - l.x) / l.rx;
        const q = dx * dx + qy;
        if (q >= 1) continue;
        const f = (1 - q) * (1 - q);
        lr[i] += r * f;
        lg[i] += g * f;
        lb[i] += b * f;
      }
    }
  }

  private vignette(v: number): Float32Array {
    if (this.vig && this.vigFor === v) return this.vig;
    const { w, h } = this;
    const m = new Float32Array(w * h);
    for (let y = 0, i = 0; y < h; y++) {
      const ny = (y + 0.5 - h / 2) / (h / 2);
      for (let x = 0; x < w; x++, i++) {
        const nx = (x + 0.5 - w / 2) / (w / 2);
        const d = Math.min(1, Math.max(0, (nx * nx + ny * ny - 0.4) / 1.6));
        m[i] = 1 - v * d * d * (3 - 2 * d);
      }
    }
    this.vig = m;
    this.vigFor = v;
    return m;
  }

  // Blurs the gathered glow (two 3x3 box passes) and adds it back with
  // bilinear upsampling, only over blocks with glow nearby.
  private addBloom(c: PixelCanvas, gain: number): void {
    for (const buf of [this.br, this.bg, this.bb]) {
      this.blur(buf);
      this.blur(buf);
    }
    const { w, h, data } = c;
    const { bw, bh, br, bg, bb, hot } = this;
    for (let j = 0; j < bw * bh; j++) hot[j] = (br[j] + bg[j] + bb[j]) * gain >= 0.5 ? 1 : 0;
    for (let by = 0; by < bh; by++) {
      for (let bx = 0; bx < bw; bx++) {
        let near = 0;
        for (let yy = Math.max(0, by - 1); yy <= Math.min(bh - 1, by + 1); yy++) {
          for (let xx = Math.max(0, bx - 1); xx <= Math.min(bw - 1, bx + 1); xx++) near |= hot[yy * bw + xx];
        }
        if (near) this.bloomBlock(data, w, h, bx, by, gain);
      }
    }
  }

  private bloomBlock(data: Int32Array, w: number, h: number, bx: number, by: number, gain: number): void {
    const { bw, bh, br, bg, bb } = this;
    for (let y = by * BLOCK; y < Math.min(h, by * BLOCK + BLOCK); y++) {
      const fy = Math.max(0, Math.min(bh - 1, (y + 0.5) / BLOCK - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(bh - 1, y0 + 1);
      const ty = fy - y0;
      for (let x = bx * BLOCK, i = y * w + x; x < Math.min(w, bx * BLOCK + BLOCK); x++, i++) {
        const v = data[i];
        if (v === CLEAR) continue;
        const fx = Math.max(0, Math.min(bw - 1, (x + 0.5) / BLOCK - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(bw - 1, x0 + 1);
        const tx = fx - x0;
        const a = y0 * bw + x0;
        const b = y0 * bw + x1;
        const cc = y1 * bw + x0;
        const d = y1 * bw + x1;
        const w00 = (1 - tx) * (1 - ty);
        const w10 = tx * (1 - ty);
        const w01 = (1 - tx) * ty;
        const w11 = tx * ty;
        const gr = (br[a] * w00 + br[b] * w10 + br[cc] * w01 + br[d] * w11) * gain;
        const gg = (bg[a] * w00 + bg[b] * w10 + bg[cc] * w01 + bg[d] * w11) * gain;
        const gb = (bb[a] * w00 + bb[b] * w10 + bb[cc] * w01 + bb[d] * w11) * gain;
        if (gr + gg + gb < 0.5) continue;
        const R = Math.min(255, ((v >> 16) & 255) + gr);
        const G = Math.min(255, ((v >> 8) & 255) + gg);
        const B = Math.min(255, (v & 255) + gb);
        data[i] = (((R + 0.5) | 0) << 16) | (((G + 0.5) | 0) << 8) | ((B + 0.5) | 0);
      }
    }
  }

  private blur(buf: Float32Array): void {
    const { bw, bh, tmp } = this;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        tmp[i] = (buf[i] + (x > 0 ? buf[i - 1] : 0) + (x < bw - 1 ? buf[i + 1] : 0)) / 3;
      }
    }
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        buf[i] = (tmp[i] + (y > 0 ? tmp[i - bw] : 0) + (y < bh - 1 ? tmp[i + bw] : 0)) / 3;
      }
    }
  }
}
