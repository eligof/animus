export type RGB = readonly [number, number, number];

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

const HEX_CACHE = new Map<string, RGB>();

// Parsed colours are cached and frozen, so painters may call hex() per pixel.
export function hex(h: string): RGB {
  const hit = HEX_CACHE.get(h);
  if (hit) return hit;
  let v = h.startsWith('#') ? h.slice(1) : h;
  if (v.length === 3) v = v.split('').map((c) => c + c).join('');
  const n = parseInt(v, 16);
  const c = Object.freeze([(n >> 16) & 255, (n >> 8) & 255, n & 255] as const);
  if (HEX_CACHE.size < 4096) HEX_CACHE.set(h, c);
  return c;
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  const k = Math.max(0, Math.min(1, t));
  return [
    clamp255(a[0] + (b[0] - a[0]) * k),
    clamp255(a[1] + (b[1] - a[1]) * k),
    clamp255(a[2] + (b[2] - a[2]) * k),
  ];
}

export function scale(c: RGB, f: number): RGB {
  return [clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f)];
}

export function hsl(h: number, s: number, l: number): RGB {
  const hh = (((h % 360) + 360) % 360) / 360;
  if (s === 0) return [clamp255(l * 255), clamp255(l * 255), clamp255(l * 255)];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [clamp255(channel(hh + 1 / 3) * 255), clamp255(channel(hh) * 255), clamp255(channel(hh - 1 / 3) * 255)];
}

const CUBE = [0, 95, 135, 175, 215, 255];

function nearestCube(v: number): number {
  let best = 0;
  for (let i = 1; i < CUBE.length; i++) if (Math.abs(CUBE[i] - v) < Math.abs(CUBE[best] - v)) best = i;
  return best;
}

const dist = (a: RGB, b: RGB) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

export function rgbTo256(c: RGB): number {
  const [ri, gi, bi] = [nearestCube(c[0]), nearestCube(c[1]), nearestCube(c[2])];
  const cube: RGB = [CUBE[ri], CUBE[gi], CUBE[bi]];
  const avg = (c[0] + c[1] + c[2]) / 3;
  const gi2 = Math.max(0, Math.min(23, Math.round((avg - 8) / 10)));
  const gv = 8 + gi2 * 10;
  const gray: RGB = [gv, gv, gv];
  return dist(c, gray) < dist(c, cube) ? 232 + gi2 : 16 + 36 * ri + 6 * gi + bi;
}
