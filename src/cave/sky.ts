import { CLEAR } from '../iso/canvas.ts';
import type { PixelCanvas } from '../iso/canvas.ts';
import type { RGB } from '../term/color.ts';

// The void around the diorama, for the biomes that have something out
// there: stars and a cratered moon past the station, embers rising out of
// hell, wind-blown snow over a cold fog, glowing spores over a violet haze
// in the fungal dark, light beams sweeping the club. Each has its own
// silhouette in a still frame: only the station's are pin-points. Painted
// in screen space onto the cleared pixels only (the world stays as it is,
// so the void is exactly the pixels that were CLEAR before), so stars hold
// still while the camera pans — infinitely far away — and nothing here is
// lit.
export type Sky = 'stars' | 'embers' | 'snow' | 'spores' | 'beams';

const unit = (n: number) => {
  let h = Math.imul(n ^ (n >>> 16), 0x7feb352d);
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

// Smooth value noise in [0, 1): hashed lattice corners every `cell` pixels.
function noise(x: number, y: number, cell: number): number {
  const gx = x / cell;
  const gy = y / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  const fx = gx - x0;
  const fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const at = (i: number, j: number) => unit(Math.imul(i, 73856093) ^ Math.imul(j, 19349663));
  const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
  const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
  return top + (bottom - top) * sy;
}

const pack = (r: number, g: number, b: number) => ((r | 0) << 16) | ((g | 0) << 8) | (b | 0);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// Adds `c` scaled by `k` to the pixel at i (clamped), over `base` if cleared.
function add(d: Int32Array, i: number, base: number, c: RGB, k: number): void {
  const v = d[i] === CLEAR ? base : d[i];
  d[i] = pack(
    Math.min(255, ((v >> 16) & 255) + c[0] * k),
    Math.min(255, ((v >> 8) & 255) + c[1] * k),
    Math.min(255, (v & 255) + c[2] * k),
  );
}

// Per canvas size, what never changes: the star list, the moon's pixels,
// every pixel's angle from the beams' source. Only the latest size is kept.
const cache = new Map<string, unknown>();
function once<T>(key: string, make: () => T): T {
  if (!cache.has(key)) {
    for (const k of cache.keys()) if (k.split(':')[0] === key.split(':')[0]) cache.delete(k);
    cache.set(key, make());
  }
  return cache.get(key) as T;
}

// Snow's cold fog and the spores' violet haze, at the bottom edge.
const FOG: RGB = [0x1a, 0x2a, 0x3a];
const HAZE: RGB = [30, 13, 44];
const FLAKE: RGB = [215, 228, 242];
const SPORE_TINTS: RGB[] = [[170, 255, 100], [190, 120, 255]];

// A spore: a soft 3x3 disc in a faint 1-px halo, as [dx, dy, weight].
const SPORE: [number, number, number][] = [];
for (let dy = -2; dy <= 2; dy++) {
  for (let dx = -2; dx <= 2; dx++) {
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ax === 2 && ay === 2) continue;
    SPORE.push([dx, dy, ax === 2 || ay === 2 ? 0.28 : ax + ay === 0 ? 1 : ax + ay === 1 ? 0.92 : 0.7]);
  }
}

export function paintSky(c: PixelCanvas, sky: Sky, backdrop: RGB, t: number): void {
  const { w, h, data } = c;
  if (w === 0 || h === 0) return;
  // Which pixels are void, before anything is painted on them.
  const open = new Uint8Array(w * h);
  for (let i = 0; i < data.length; i++) open[i] = data[i] === CLEAR ? 1 : 0;
  const base = pack(backdrop[0], backdrop[1], backdrop[2]);
  const dot = (x: number, y: number, col: RGB, k: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
    const i = yi * w + xi;
    if (open[i]) add(data, i, base, col, k);
  };
  switch (sky) {
    case 'stars': {
      for (const st of once(`stars:${w}x${h}`, () => starList(w, h))) {
        const k = st.k * (0.7 + 0.3 * Math.sin(t * st.speed + st.phase));
        dot(st.x, st.y, st.c, k);
        if (st.big) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) dot(st.x + dx, st.y + dy, st.c, k * 0.45);
      }
      // The moon is opaque: it hides the stars behind it.
      const body = once(`moon:${w}x${h}`, () => moon(w, h));
      for (let j = 0; j < body.at.length; j++) if (open[body.at[j]]) data[body.at[j]] = body.col[j];
      break;
    }
    case 'embers': {
      // A warm glow from below, then sparks drifting up through it.
      for (let y = 0; y < h; y++) {
        const k = 0.45 * (y / h) ** 2;
        const r = (base >> 16) & 255;
        const g = (base >> 8) & 255;
        const row = pack(Math.min(255, r + 110 * k), Math.min(255, g + 24 * k), Math.min(255, (base & 255) + 8 * k));
        for (let x = 0; x < w; x++) if (open[y * w + x]) data[y * w + x] = row;
      }
      drift(w, h, t, { n: (w * h) / 700, dir: -1, speed: [6, 16] }, (i, x, y, k) => dot(x, y, unit(i * 7 + 3) < 0.3 ? [255, 220, 120] : [255, 110, 30], k));
      break;
    }
    case 'snow':
      // A cold fog rising from below, and flakes blown down and to the
      // right through it, each trailing a short diagonal streak: near ones
      // 2x2, fast and bright, far ones a slow, dim 2-px dash. None is a
      // pin-point: those are the station's stars.
      haze(w, h, open, data, backdrop, FOG, 0.35);
      drift(w, h, t, { n: (w * h) / 660, dir: 1, speed: [4, 15], lean: 0.4, sway: 1 }, (_, x, y, k, z) => {
        if (z > 0.55) {
          const b = (0.55 + 0.45 * z) * k;
          dot(x, y, FLAKE, b);
          dot(x + 1, y, FLAKE, b * 0.85);
          dot(x, y + 1, FLAKE, b * 0.85);
          dot(x + 1, y + 1, FLAKE, b * 0.7);
          dot(x - 1, y - 1, FLAKE, b * 0.4);
          dot(x - 2, y - 2, FLAKE, b * 0.18);
        } else {
          const b = (0.35 + 0.4 * z) * k;
          dot(x, y, FLAKE, b);
          dot(x - 1, y - 1, FLAKE, b * 0.65);
        }
      });
      break;
    case 'spores':
      // A faint violet haze from below, and soft glowing discs rising slowly
      // through it, wobbling side to side and pulsing.
      haze(w, h, open, data, backdrop, HAZE, 0.4);
      drift(w, h, t, { n: (w * h) / 3600, dir: -1, speed: [1.5, 4], sway: 4, hz: 0.3 }, (i, x, y, k, z) => {
        const col = SPORE_TINTS[unit(i * 3 + 2) < 0.55 ? 0 : 1];
        const glow = k * (0.85 + 0.15 * z) * (0.85 + 0.15 * Math.sin(t * 1.3 + i * 1.7));
        for (const [dx, dy, wt] of SPORE) dot(x + dx, y + dy, col, glow * wt);
      });
      break;
    case 'beams':
      beams(w, h, t, open, data, base, once(`beams:${w}x${h}`, () => angles(w, h)));
      break;
  }
}

// Every open pixel: the backdrop, then over the lower `share` of the
// canvas easing into `to` at the bottom edge. The whole void is filled, as
// hell's glow is, so the haze has no seam where some view would show the
// cleared pixels in another colour (HD shows them black).
function haze(w: number, h: number, open: Uint8Array, data: Int32Array, backdrop: RGB, to: RGB, share: number): void {
  const y0 = Math.floor(h * (1 - share));
  for (let y = 0; y < h; y++) {
    const s = y < y0 ? 0 : (y - y0 + 1) / (h - y0);
    const k = s * s * (3 - 2 * s);
    const row = pack(backdrop[0] + (to[0] - backdrop[0]) * k, backdrop[1] + (to[1] - backdrop[1]) * k, backdrop[2] + (to[2] - backdrop[2]) * k);
    for (let i = y * w, end = i + w; i < end; i++) if (open[i]) data[i] = row;
  }
}

// Fixed stars by pixel hash, each twinkling at its own pace; a rare bright
// one gets a cross.
type Star = { x: number; y: number; k: number; speed: number; phase: number; c: RGB; big: boolean };
function starList(w: number, h: number): Star[] {
  const tints: RGB[] = [[230, 236, 255], [170, 200, 255], [255, 220, 170]];
  const out: Star[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = y * 7919 + x;
      const r = unit(n);
      if (r > 0.006) continue;
      out.push({ x, y, k: 0.3 + 0.7 * unit(n + 3), speed: 1 + unit(n + 1) * 2, phase: unit(n + 2) * 6.28, c: tints[Math.floor(unit(n + 4) * 3)], big: r < 0.0004 });
    }
  }
  return out;
}

// A grey moon rising out of the bottom-right corner — the station's window
// already shows the Earth — lit from the top left, mostly from the side,
// so it dims towards the right. Dusty highlands, dark maria and a scatter
// of craters, foreshortened towards the limb, each with a shadowed near
// wall and a bright far one. No air, so no halo, and no blue anywhere.
// Its visible pixels as canvas indices and colours.
type Crater = { x: number; y: number; r: number; ux: number; uy: number; squash: number };
function moon(w: number, h: number): { at: Int32Array; col: Int32Array } {
  const R = Math.max(w, h) * 0.22;
  const cx = w * 0.9;
  const cy = h + R * 0.1;
  const ln = Math.hypot(-0.72, -0.58, 0.38);
  const [lx, ly, lz] = [-0.72 / ln, -0.58 / ln, 0.38 / ln];
  // The light's direction across the face, for the crater walls.
  const sl = Math.hypot(lx, ly);
  const [sx, sy] = [lx / sl, ly / sl];
  const pits: Crater[] = [];
  for (let k = 0; k < 18; k++) {
    const a = unit(k * 31 + 1) * Math.PI * 2;
    const d = Math.sqrt(unit(k * 31 + 2)) * 0.92;
    const x = Math.cos(a) * d * R;
    const y = -Math.abs(Math.sin(a) * d * R);
    const rr = Math.hypot(x, y) || 1;
    pits.push({ x, y, r: R * (0.035 + 0.1 * unit(k * 31 + 3) ** 2), ux: x / rr, uy: y / rr, squash: Math.sqrt(Math.max(0.05, 1 - d * d)) });
  }
  // Fine grain only where there are pixels enough to show it; on a small
  // canvas it is just noise.
  const grain = 0.1 * clamp01((R - 40) / 60);
  const at: number[] = [];
  const col: number[] = [];
  for (let y = Math.max(0, Math.floor(cy - R)); y < h; y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x < Math.min(w, Math.ceil(cx + R)); x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 > R * R) continue;
      const nx = dx / R;
      const ny = dy / R;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      // Maria where two octaves of noise run high; grain everywhere.
      const mare = clamp01((noise(dx + 400, dy + 400, R * 0.42) * 0.65 + noise(dx, dy, R * 0.16) * 0.35 - 0.5) * 9);
      let albedo = 0.8 - 0.32 * mare + (noise(dx, dy, 2.2) - 0.5) * grain;
      let shade = 1;
      for (const p of pits) {
        const ox = dx - p.x;
        const oy = dy - p.y;
        if (Math.abs(ox) > p.r * 1.4 + 1 || Math.abs(oy) > p.r * 1.4 + 1) continue;
        // Foreshortened along the radius: squashed near the limb.
        const along = (ox * p.ux + oy * p.uy) / p.squash;
        const across = ox * -p.uy + oy * p.ux;
        const q = Math.hypot(along, across) / p.r;
        if (q > 1.35) continue;
        const o = Math.hypot(ox, oy) || 1;
        const facing = (ox * sx + oy * sy) / o;
        if (q < 1) {
          // The bowl: the wall nearest the light falls into shadow.
          albedo *= 0.94;
          shade *= 1 - 0.6 * Math.max(0, facing) * q ** 1.5 + 0.25 * Math.max(0, -facing) * q;
        } else {
          // The raised rim, bright where it faces the light.
          const rim = 1 - (q - 1) / 0.35;
          albedo += 0.06 * rim;
          shade *= 1 + 0.3 * facing * rim;
        }
      }
      const lit = Math.max(0, nx * lx + ny * ly + nz * lz);
      const v = clamp01(albedo * (0.05 + 0.95 * lit) * shade);
      at.push(y * w + x);
      col.push(pack(176 * v + 4, 171 * v + 4, 161 * v + 3));
    }
  }
  return { at: Int32Array.from(at), col: Int32Array.from(col) };
}

// `n` motes rising (dir -1) or falling (dir 1) at a speed in `speed`
// (pixels a second), leaning `lean` pixels sideways for each one they
// travel, swaying `sway` pixels either way (`hz` times a second, or
// lazily), wrapping round. `draw` gets `k`, which fades them near the
// ends, and `z` in [0, 1), how fast — so how near — each one is.
type Drift = { n: number; dir: 1 | -1; speed: [number, number]; lean?: number; sway?: number; hz?: number };
function drift(w: number, h: number, t: number, o: Drift, draw: (i: number, x: number, y: number, k: number, z: number) => void): void {
  const span = h + 8;
  const { lean = 0, sway = 2.5, hz } = o;
  for (let i = 0; i < Math.round(o.n); i++) {
    const z = unit(i * 13 + 5);
    const sp = o.speed[0] + (o.speed[1] - o.speed[0]) * z;
    const p = (unit(i * 13 + 6) * span + t * sp) % span;
    const y = o.dir > 0 ? p - 4 : h + 4 - p;
    const rate = hz === undefined ? 0.6 + unit(i * 13 + 8) : hz * Math.PI * 2 * (0.85 + 0.3 * unit(i * 13 + 8));
    const x = ((unit(i * 13 + 7) * w + lean * p) % w) + Math.sin(t * rate + i) * sway;
    const k = Math.min(1, p / 12, (span - p) / 12);
    draw(i, x, y, k, z);
  }
}

// Every pixel's angle from the beams' source, below the middle of the floor.
function angles(w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out[y * w + x] = Math.atan2(y - h * 1.1, x - w / 2);
  return out;
}

// Three soft beams fanning out from below the floor, sweeping slowly in
// the club's neon colours.
function beams(w: number, h: number, t: number, open: Uint8Array, data: Int32Array, base: number, at: Float32Array): void {
  const cols: RGB[] = [[255, 60, 190], [60, 240, 255], [190, 110, 255]];
  const dirs = cols.map((_, k) => -Math.PI / 2 + Math.sin(t * (0.35 + 0.12 * k) + k * 2.1) * 0.75);
  for (let i = 0; i < at.length; i++) {
    if (!open[i]) continue;
    const a = at[i];
    for (let k = 0; k < 3; k++) {
      const off = Math.abs(a - dirs[k]);
      if (off < 0.06) add(data, i, base, cols[k], 0.16 * (1 - off / 0.06) * (0.4 + 0.6 * (Math.floor(i / w) / h)));
    }
  }
}
