import type { RGB } from '../term/color.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import { CLEAR } from '../iso/canvas.ts';
import type { Grade, Particle, PointLight, View, WizardSprite } from './types.ts';
import { depthOf, project } from './types.ts';

// Light: emit summed into 4x4 cells and blurred there by 4 box passes of
// radius 1 cell (near-Gaussian, sigma ~7 px, reaching ~20 px once
// upsampled); point lights are added on the same cells.
const LIGHT_CELL = 4;
const ILLUM_PASSES = 4;
// Glow light saturates: illum * ILLUM_MAX * k / (1 + k), k = ILLUM_GAIN * e
// / 255, e the blurred emit's brightest channel (hue kept). A torch's
// handful of pixels clearly lights the rock beside it, a lava lake tops out
// instead of blowing the cave out, one spark barely registers.
const ILLUM_GAIN = 32;
const ILLUM_MAX = 1.25;
// Bloom: emit summed into 2x2 cells, two box passes of radius 1 cell (a
// round halo reaching ~4-5 px once upsampled), through the same curve so a
// lone spark still gets a halo and a lava edge does not burn white.
const BLOOM_CELL = 2;
const BLOOM_PASSES = 2;
const BLOOM_GAIN = 12;
const BLOOM_MAX = 200;
// Over the void: part of the bloom plus a faint haze of the light. Below
// VOID_EPS (r + g + b) the pixel stays CLEAR so the terminal shows through.
const VOID_BLOOM = 0.35;
const VOID_HAZE = 0.05 * 255;
const VOID_EPS = 3;
// Sprites and particles show when no more than this behind the surface.
const DEPTH_BIAS = 0.5;
// Glowing particles faster than this (screen px/s) leave a 1 px trail.
const STREAK_SPEED = 8;

const INV255 = 1 / 255;
const pack = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];

// A coarse RGB grid, one cell per f x f pixels (channels interleaved),
// upsampled bilinearly: each cell row is first stretched to the full width
// (`u`), so a pixel only lerps between two of those rows (offsets y0[y],
// y1[y], weight ty[y]). As in the raycaster, pixel p spans screen [p, p + 1)
// so its centre is p + 0.5; cell c's centre is f * c + f / 2.
class Grid {
  readonly f: number;
  cw = 0;
  ch = 0;
  c = new Float32Array(0);
  t = new Float32Array(0);
  u = new Float32Array(0);
  x0 = new Int32Array(0);
  x1 = new Int32Array(0);
  tx = new Float32Array(0);
  y0 = new Int32Array(0);
  y1 = new Int32Array(0);
  ty = new Float32Array(0);
  private dark = true; // u is all zeros

  constructor(f: number) {
    this.f = f;
  }

  resize(w: number, h: number): void {
    const { f } = this;
    const cw = Math.max(2, Math.ceil(w / f));
    const ch = Math.max(2, Math.ceil(h / f));
    this.cw = cw;
    this.ch = ch;
    this.c = new Float32Array(cw * ch * 3);
    this.t = new Float32Array(cw * ch * 3);
    this.u = new Float32Array(ch * w * 3);
    this.dark = true;
    this.x0 = new Int32Array(w);
    this.x1 = new Int32Array(w);
    this.tx = new Float32Array(w);
    for (let x = 0; x < w; x++) {
      const p = cellAt(x, f, cw);
      this.x0[x] = (p | 0) * 3;
      this.x1[x] = Math.min(cw - 1, (p | 0) + 1) * 3;
      this.tx[x] = p - (p | 0);
    }
    this.y0 = new Int32Array(h);
    this.y1 = new Int32Array(h);
    this.ty = new Float32Array(h);
    for (let y = 0; y < h; y++) {
      const p = cellAt(y, f, ch);
      this.y0[y] = (p | 0) * w * 3;
      this.y1[y] = Math.min(ch - 1, (p | 0) + 1) * w * 3;
      this.ty[y] = p - (p | 0);
    }
  }

  // `passes` separable box blurs of radius 1 cell; outside the grid is dark.
  blur(passes: number): void {
    const { c, t } = this;
    const row = this.cw * 3;
    const n = c.length;
    const k = 1 / 3;
    for (let p = 0; p < passes; p++) {
      for (let o = 0; o < n; o += row) {
        const e = o + row - 3;
        t[o] = (c[o] + c[o + 3]) * k;
        t[o + 1] = (c[o + 1] + c[o + 4]) * k;
        t[o + 2] = (c[o + 2] + c[o + 5]) * k;
        for (let j = o + 3; j < e; j++) t[j] = (c[j - 3] + c[j] + c[j + 3]) * k;
        t[e] = (c[e - 3] + c[e]) * k;
        t[e + 1] = (c[e - 2] + c[e + 1]) * k;
        t[e + 2] = (c[e - 1] + c[e + 2]) * k;
      }
      for (let j = 0; j < row; j++) c[j] = (t[j] + t[j + row]) * k;
      for (let j = row; j < n - row; j++) c[j] = (t[j - row] + t[j] + t[j + row]) * k;
      for (let j = n - row; j < n; j++) c[j] = (t[j - row] + t[j]) * k;
    }
  }

  // Cells hold sums of f*f pixels' emit. Each becomes top * k / (1 + k) in
  // its own hue, k = gain * e / 255 with e its brightest channel as a pixel
  // average.
  saturate(gain: number, top: number): void {
    const { c } = this;
    const g = gain / (this.f * this.f * 255);
    for (let j = 0; j < c.length; j += 3) {
      const R = c[j];
      const G = c[j + 1];
      const B = c[j + 2];
      const s = (top * g) / (1 + g * Math.max(R, Math.max(G, B)));
      c[j] = R * s;
      c[j + 1] = G * s;
      c[j + 2] = B * s;
    }
  }

  stretch(w: number): void {
    const { cw, ch, c, u, x0, x1, tx } = this;
    this.dark = false;
    for (let cy = 0; cy < ch; cy++) {
      const src = cy * cw * 3;
      for (let x = 0, j = cy * w * 3; x < w; x++, j += 3) {
        const a = src + x0[x];
        const b = src + x1[x];
        const t = tx[x];
        const R = c[a];
        const G = c[a + 1];
        const B = c[a + 2];
        u[j] = R + (c[b] - R) * t;
        u[j + 1] = G + (c[b + 1] - G) * t;
        u[j + 2] = B + (c[b + 2] - B) * t;
      }
    }
  }

  // Nothing to add this frame.
  off(): void {
    if (this.dark) return;
    this.u.fill(0);
    this.dark = true;
  }
}

// Pixel p's centre in cell units (cell centres at integers), clamped to
// the grid.
function cellAt(p: number, f: number, n: number): number {
  const c = (p + 0.5) / f - 0.5;
  return c < 0 ? 0 : c > n - 1 ? n - 1 : c;
}

// Lights the raycast frame into a PixelCanvas: ambient, the wide blur of
// everything that glows (fire and lava light the rock around them), point
// lights, bloom and vignette. Buffers are kept between frames.
export class Glow {
  private w = -1;
  private h = -1;
  private light = new Grid(LIGHT_CELL);
  private bloom = new Grid(BLOOM_CELL);
  private vig = new Float32Array(0);
  private vigFor = NaN;
  // The lights as they were when the current hold began (see compose).
  private held: PointLight[] = [];
  private heldAt: number | null = null;

  // `hold` (HD): the step of ambient time this frame is in. A light that
  // stays put (same place and colour) keeps the intensity and radius it
  // had when the step began, so flicker changes the picture a few times a
  // second, all at once, instead of every frame; lights that move (the
  // ones characters carry) follow every frame. Null: every frame as is.
  compose(
    out: PixelCanvas,
    albedo: Int32Array,
    emit: Int32Array,
    view: View,
    lights: readonly PointLight[],
    grade: Grade,
    lit: boolean,
    backdrop: RGB,
    hold: number | null = null,
  ): void {
    const { w, h, data } = out;
    lights = this.hold(lights, hold);
    if (!lit) {
      raw(data, albedo, emit, w * h);
      return;
    }
    this.resize(w, h);
    const { light, bloom } = this;
    const glowing = this.gather(emit);
    let lightOn = glowing && grade.illum > 0;
    const bloomOn = glowing && grade.bloom > 0;
    if (lightOn) {
      light.blur(ILLUM_PASSES);
      light.saturate(ILLUM_GAIN, ILLUM_MAX * grade.illum);
    } else {
      light.c.fill(0);
    }
    for (const l of lights) if (this.addLight(view, l)) lightOn = true;
    if (lightOn) light.stretch(w);
    else light.off();
    if (bloomOn) {
      bloom.blur(BLOOM_PASSES);
      bloom.saturate(BLOOM_GAIN, BLOOM_MAX * grade.bloom);
      bloom.stretch(w);
    } else {
      bloom.off();
    }
    shade(data, w, h, albedo, emit, this.vignette(grade.vignette), light, bloom, grade.ambient, backdrop);
  }

  private hold(lights: readonly PointLight[], at: number | null): readonly PointLight[] {
    if (at === null || at !== this.heldAt) {
      this.heldAt = at;
      this.held = at === null ? [] : lights.slice();
      return lights;
    }
    const out = lights.slice();
    const held = this.held;
    for (let i = 0; i < out.length; i++) {
      const l = out[i];
      const was = held[i];
      const c = l.color;
      if (was && was.x === l.x && was.y === l.y && was.z === l.z && was.color[0] === c[0] && was.color[1] === c[1] && was.color[2] === c[2]) out[i] = was;
      else held[i] = l;
    }
    held.length = out.length;
    return out;
  }

  private resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.light.resize(w, h);
    this.bloom.resize(w, h);
    this.vig = new Float32Array(w * h);
    this.vigFor = NaN;
  }

  // Sums emit into the bloom cells (2x2 pixels), then those into the light
  // cells (2x2 bloom cells). False when nothing glows.
  private gather(emit: Int32Array): boolean {
    const { w, h, bloom, light } = this;
    const { cw, ch, c } = bloom;
    let any = 0;
    for (let cy = 0, j = 0; cy < ch; cy++) {
      const y = 2 * cy;
      const down = y + 1 < h ? w : 0;
      for (let cx = 0; cx < cw; cx++, j += 3) {
        const x = 2 * cx;
        if (y >= h || x >= w) {
          c[j] = c[j + 1] = c[j + 2] = 0;
          continue;
        }
        const i = y * w + x;
        const right = x + 1 < w ? 1 : 0;
        const e0 = emit[i];
        const e1 = right ? emit[i + 1] : 0;
        const e2 = down ? emit[i + w] : 0;
        const e3 = right && down ? emit[i + w + 1] : 0;
        any |= e0 | e1 | e2 | e3;
        c[j] = ((e0 >> 16) & 255) + ((e1 >> 16) & 255) + ((e2 >> 16) & 255) + ((e3 >> 16) & 255);
        c[j + 1] = ((e0 >> 8) & 255) + ((e1 >> 8) & 255) + ((e2 >> 8) & 255) + ((e3 >> 8) & 255);
        c[j + 2] = (e0 & 255) + (e1 & 255) + (e2 & 255) + (e3 & 255);
      }
    }
    if (any === 0) return false;
    const { cw: qw, ch: qh, c: q } = light;
    const row = cw * 3;
    for (let qy = 0, j = 0; qy < qh; qy++) {
      const a = 2 * qy * row;
      const down = 2 * qy + 1 < ch ? row : 0;
      for (let qx = 0; qx < qw; qx++, j += 3) {
        if (2 * qy >= ch || 2 * qx >= cw) {
          q[j] = q[j + 1] = q[j + 2] = 0;
          continue;
        }
        const p = a + 6 * qx;
        const right = 2 * qx + 1 < cw ? 3 : 0;
        let R = c[p];
        let G = c[p + 1];
        let B = c[p + 2];
        if (right) {
          R += c[p + 3];
          G += c[p + 4];
          B += c[p + 5];
        }
        if (down) {
          const d = p + down;
          R += c[d];
          G += c[d + 1];
          B += c[d + 2];
          if (right) {
            R += c[d + 3];
            G += c[d + 4];
            B += c[d + 5];
          }
        }
        q[j] = R;
        q[j + 1] = G;
        q[j + 2] = B;
      }
    }
    return true;
  }

  // A round pool around the light's projected position, (1 - d^2/r^2)^2,
  // added to the light cells. False if it lit nothing.
  private addLight(view: View, l: PointLight): boolean {
    const rad = l.radius;
    if (!(rad > 0 && l.intensity > 0)) return false;
    const [sx, sy] = project(view, l.x, l.y, l.z);
    if (!Number.isFinite(sx) || !Number.isFinite(sy)) return false;
    const { cw, ch, c } = this.light;
    const f = LIGHT_CELL;
    const o = f / 2; // cell centres, in screen units
    const y0 = Math.max(0, Math.ceil((sy - rad - o) / f));
    const y1 = Math.min(ch - 1, Math.floor((sy + rad - o) / f));
    const k = l.intensity * INV255;
    const r = l.color[0] * k;
    const g = l.color[1] * k;
    const b = l.color[2] * k;
    const inv = 1 / (rad * rad);
    let hit = false;
    for (let cy = y0; cy <= y1; cy++) {
      const dy = f * cy + o - sy;
      const span = Math.sqrt(Math.max(0, rad * rad - dy * dy));
      const x0 = Math.max(0, Math.ceil((sx - span - o) / f));
      const x1 = Math.min(cw - 1, Math.floor((sx + span - o) / f));
      const qy = dy * dy * inv;
      for (let cx = x0, j = (cy * cw + x0) * 3; cx <= x1; cx++, j += 3) {
        const dx = f * cx + o - sx;
        const q = 1 - dx * dx * inv - qy;
        if (q <= 0) continue;
        const s = q * q;
        c[j] += r * s;
        c[j + 1] += g * s;
        c[j + 2] += b * s;
        hit = true;
      }
    }
    return hit;
  }

  // 1 inside an ellipse covering most of the frame, easing down to
  // 1 - amount in the corners.
  private vignette(amount: number): Float32Array {
    const { w, h, vig } = this;
    if (this.vigFor === amount) return vig;
    for (let y = 0, i = 0; y < h; y++) {
      const ny = (y + 0.5 - h / 2) / (h / 2);
      for (let x = 0; x < w; x++, i++) {
        const nx = (x + 0.5 - w / 2) / (w / 2);
        const d = Math.min(1, Math.max(0, (nx * nx + ny * ny - 0.4) / 1.6));
        vig[i] = 1 - amount * d * d * (3 - 2 * d);
      }
    }
    this.vigFor = amount;
    return vig;
  }
}

// The per-pixel pass: albedo * (ambient + light) + emit + bloom, then the
// vignette. Void pixels get the backdrop plus a little of the glow, or stay
// CLEAR.
function shade(
  data: Int32Array,
  w: number,
  h: number,
  albedo: Int32Array,
  emit: Int32Array,
  vig: Float32Array,
  light: Grid,
  bloom: Grid,
  ambient: RGB,
  backdrop: RGB,
): void {
  const ar = ambient[0] * INV255;
  const ag = ambient[1] * INV255;
  const ab = ambient[2] * INV255;
  const kr = backdrop[0];
  const kg = backdrop[1];
  const kb = backdrop[2];
  const lu = light.u;
  const fu = bloom.u;
  for (let y = 0, i = 0; y < h; y++) {
    const l0 = light.y0[y];
    const l1 = light.y1[y];
    const lt = light.ty[y];
    const f0 = bloom.y0[y];
    const f1 = bloom.y1[y];
    const ft = bloom.ty[y];
    for (let x3 = 0; x3 < w * 3; x3 += 3, i++) {
      const a = albedo[i];
      const e = emit[i];
      let p = l0 + x3;
      let q = l1 + x3;
      const lr = lu[p] + (lu[q] - lu[p]) * lt;
      const lg = lu[p + 1] + (lu[q + 1] - lu[p + 1]) * lt;
      const lb = lu[p + 2] + (lu[q + 2] - lu[p + 2]) * lt;
      p = f0 + x3;
      q = f1 + x3;
      const fr = fu[p] + (fu[q] - fu[p]) * ft;
      const fg = fu[p + 1] + (fu[q + 1] - fu[p + 1]) * ft;
      const fb = fu[p + 2] + (fu[q + 2] - fu[p + 2]) * ft;
      const er = (e >> 16) & 255;
      const eg = (e >> 8) & 255;
      const eb = e & 255;
      const v = vig[i];
      let R: number;
      let G: number;
      let B: number;
      if (a === CLEAR) {
        R = (er + fr * VOID_BLOOM + lr * VOID_HAZE) * v;
        G = (eg + fg * VOID_BLOOM + lg * VOID_HAZE) * v;
        B = (eb + fb * VOID_BLOOM + lb * VOID_HAZE) * v;
        if (R + G + B < VOID_EPS) {
          data[i] = CLEAR;
          continue;
        }
        R += kr;
        G += kg;
        B += kb;
      } else {
        // A glowing pixel is already as bright as it is: light and bloom
        // would wash it out to white, so they fade with its emit.
        const s = 1 - Math.max(er, Math.max(eg, eb)) * INV255;
        R = (((a >> 16) & 255) * (ar + lr * s) + er + fr * s) * v;
        G = (((a >> 8) & 255) * (ag + lg * s) + eg + fg * s) * v;
        B = ((a & 255) * (ab + lb * s) + eb + fb * s) * v;
      }
      R = Math.min(255, R);
      G = Math.min(255, G);
      B = Math.min(255, B);
      data[i] = (((R + 0.5) | 0) << 16) | (((G + 0.5) | 0) << 8) | ((B + 0.5) | 0);
    }
  }
}

// Unlit: albedo plus emit, nothing else.
function raw(data: Int32Array, albedo: Int32Array, emit: Int32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = albedo[i];
    const e = emit[i];
    if (e === 0) {
      data[i] = a;
      continue;
    }
    if (a === CLEAR) {
      data[i] = e;
      continue;
    }
    const R = Math.min(255, ((a >> 16) & 255) + ((e >> 16) & 255));
    const G = Math.min(255, ((a >> 8) & 255) + ((e >> 8) & 255));
    const B = Math.min(255, (a & 255) + (e & 255));
    data[i] = (R << 16) | (G << 8) | B;
  }
}

// Draws a character with its anchor at (sx, sy), behind anything nearer
// than depth `d`. Body pixels hide whatever glowed there; glow pixels (eyes,
// staff tip) go into albedo and emit both. With `writeDepth` the sprite also
// occludes what is drawn after it.
export function blitSprite(
  albedo: Int32Array,
  emit: Int32Array,
  depth: Float32Array,
  w: number,
  h: number,
  sp: WizardSprite,
  sx: number,
  sy: number,
  d: number,
  writeDepth = false,
): void {
  const left = Math.round(sx + sp.dx) - sp.ax;
  const top = Math.round(sy + sp.dy) - sp.ay;
  for (let r = 0; r < sp.h; r++) {
    const y = top + r;
    if (y < 0 || y >= h) continue;
    const prow = sp.px[r];
    const grow = sp.glow[r];
    for (let c = 0; c < sp.w; c++) {
      const x = left + c;
      if (x < 0 || x >= w) continue;
      const g = grow?.[c];
      const p = prow?.[c];
      if (!g && !p) continue;
      const i = y * w + x;
      if (d < depth[i] - DEPTH_BIAS) continue;
      if (g) {
        const v = pack(g);
        albedo[i] = v;
        emit[i] = v;
      } else {
        albedo[i] = pack(p!);
        emit[i] = 0;
      }
      if (writeDepth) depth[i] = d;
    }
  }
}

// Draws each particle into the pixel its projection falls in, depth-tested
// at its own position. Glowing ones also go into emit; fast ones leave a
// dimmer pixel one step back along their screen velocity (a 2 px streak).
export function drawParticles(
  albedo: Int32Array,
  emit: Int32Array,
  depth: Float32Array,
  w: number,
  h: number,
  ps: readonly Particle[],
  view: View,
): void {
  for (const p of ps) {
    const c = pack(p.color);
    if (p.glow) {
      const vx = p.vx - p.vy;
      const vy = (p.vx + p.vy) / 2 - p.vz;
      const v2 = vx * vx + vy * vy;
      if (v2 >= STREAK_SPEED * STREAK_SPEED) {
        // Where it was one screen pixel ago.
        const t = 1 / Math.sqrt(v2);
        const x = p.x - p.vx * t;
        const y = p.y - p.vy * t;
        const z = p.z - p.vz * t;
        const [tx, ty] = project(view, x, y, z);
        plot(albedo, emit, depth, w, h, tx, ty, depthOf(x, y, z), (c >> 1) & 0x7f7f7f, true);
      }
    }
    const [sx, sy] = project(view, p.x, p.y, p.z);
    plot(albedo, emit, depth, w, h, sx, sy, depthOf(p.x, p.y, p.z), c, p.glow);
  }
}

function plot(
  albedo: Int32Array,
  emit: Int32Array,
  depth: Float32Array,
  w: number,
  h: number,
  sx: number,
  sy: number,
  d: number,
  c: number,
  glow: boolean,
): void {
  const x = Math.floor(sx);
  const y = Math.floor(sy);
  if (!(x >= 0 && y >= 0 && x < w && y < h)) return;
  const i = y * w + x;
  if (d < depth[i] - DEPTH_BIAS) return;
  albedo[i] = c;
  emit[i] = glow ? c : 0;
}
