// A software Canvas2D: the Pen subset of ./types.ts painted into a
// premultiplied RGBA bitmap, with no dependencies.
//
// Paths are flattened into device-pixel polygons as they are built (curves
// within TOL px after the transform). Filling accumulates each edge's exact
// signed area per pixel (the font-rs / stb_truetype scheme) and integrates
// along the row, so a pixel's coverage is the true area of the shape inside
// it: nonzero clamps |winding area| at 1, evenodd folds it. Interiors get
// exact winding; only pixels crossed by several edges are approximate.
// Strokes become outline polygons (offset sides, joins, caps) filled
// nonzero. A clip is a coverage mask over its bounding box.

import type { Bitmap, Color, Composite, Gradient, Pen } from './types.ts';

const TOL = 0.2; // curve flattening tolerance, device px
const MITER_LIMIT = 10;
const TAU = Math.PI * 2;
const INV255 = 1 / 255;
const BIG = 0x3fffffff;
const LUT_N = 512; // gradient colour table size
const LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;

type Rule = 'nonzero' | 'evenodd';
type Join = Pen['lineJoin'];
type Cap = Pen['lineCap'];

// Straight (not premultiplied) colour: r, g, b 0..255, a 0..1.
export type RGBA = readonly [number, number, number, number];

// ---- colours ---------------------------------------------------------------

const COLORS = new Map<string, RGBA | null>();
const NAMED: Record<string, RGBA> = {
  transparent: [0, 0, 0, 0],
  black: [0, 0, 0, 1],
  white: [255, 255, 255, 1],
};
const RGB_FN = /^rgba?\(([^)]*)\)$/;

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

// '#rgb', '#rgba', '#rrggbb', '#rrggbbaa', 'rgb(r, g, b)', 'rgba(r, g, b, a)'
// (also space / slash separated and percentages), 'transparent', 'black',
// 'white'. Null when unparseable. Cached.
export function parseColor(c: string): RGBA | null {
  let hit = COLORS.get(c);
  if (hit !== undefined) return hit;
  hit = parse(c.trim().toLowerCase());
  if (COLORS.size >= 8192) COLORS.clear();
  COLORS.set(c, hit);
  return hit;
}

function parse(s: string): RGBA | null {
  if (s[0] === '#') {
    const h = s.slice(1);
    if (!/^[0-9a-f]+$/.test(h)) return null;
    if (h.length === 3 || h.length === 4) {
      const d = (i: number) => parseInt(h[i] + h[i], 16);
      return [d(0), d(1), d(2), h.length === 4 ? d(3) / 255 : 1];
    }
    if (h.length === 6 || h.length === 8) {
      const d = (i: number) => parseInt(h.slice(2 * i, 2 * i + 2), 16);
      return [d(0), d(1), d(2), h.length === 8 ? d(3) / 255 : 1];
    }
    return null;
  }
  const m = s.match(RGB_FN);
  if (m) {
    const p = m[1].split(/\s*[,/]\s*|\s+/).filter(Boolean);
    if (p.length !== 3 && p.length !== 4) return null;
    const ch = (v: string) => (v.endsWith('%') ? parseFloat(v) * 2.55 : Number(v));
    const al = p[3] === undefined ? 1 : p[3].endsWith('%') ? parseFloat(p[3]) / 100 : Number(p[3]);
    const r = ch(p[0]);
    const g = ch(p[1]);
    const b = ch(p[2]);
    if (![r, g, b, al].every(Number.isFinite)) return null;
    return [clamp(r, 0, 255), clamp(g, 0, 255), clamp(b, 0, 255), clamp(al, 0, 1)];
  }
  return NAMED[s] ?? null;
}

// ---- shared raster scratch (single-threaded, never re-entered) -------------

let ACC = new Float32Array(0); // signed edge areas, rows of STRIDE cells
let ROWMIN = new Int32Array(0); // first / last cell written per row
let ROWMAX = new Int32Array(0);
let COV = new Float32Array(0); // one row of coverage
let COVX = new Float32Array(0); // column coverage for axis-aligned rects
let SRC = new Float32Array(0); // one row of premultiplied source colour
let BW = 0;
let BH = 0;
let STRIDE = 0;
let LO = 0;
let HI = 0;

function rowScratch(n: number): void {
  if (COV.length < n + 2) {
    COV = new Float32Array(n + 64);
    COVX = new Float32Array(n + 64);
    SRC = new Float32Array((n + 64) * 4);
  }
}

function reserve(w: number, h: number): void {
  BW = w;
  BH = h;
  STRIDE = w + 2;
  if (ACC.length < STRIDE * h) ACC = new Float32Array(Math.max(STRIDE * h, ACC.length * 2));
  if (ROWMIN.length < h) {
    ROWMIN = new Int32Array(Math.max(h, ROWMIN.length * 2)).fill(BIG);
    ROWMAX = new Int32Array(ROWMIN.length).fill(-1);
  }
  rowScratch(w);
}

// Adds one polygon edge, in bounding-box coordinates. Parts left of the box
// collapse onto x = 0 (they still cover everything to their right); parts
// right of it can't touch a visible pixel and are dropped.
function edge(x0: number, y0: number, x1: number, y1: number): void {
  if (y0 === y1) return;
  if ((y0 <= 0 && y1 <= 0) || (y0 >= BH && y1 >= BH)) return;
  if (x0 <= 0 && x1 <= 0) return line(0, y0, 0, y1);
  if (x0 < 0 || x1 < 0) {
    const yc = y0 + ((0 - x0) * (y1 - y0)) / (x1 - x0);
    edge(x0, y0, 0, yc);
    edge(0, yc, x1, y1);
    return;
  }
  if (x0 >= BW && x1 >= BW) return;
  if (x0 > BW || x1 > BW) {
    const yc = y0 + ((BW - x0) * (y1 - y0)) / (x1 - x0);
    edge(x0, y0, BW, yc);
    edge(BW, yc, x1, y1);
    return;
  }
  line(x0, y0, x1, y1);
}

// font-rs's accumulation: for every row the edge crosses, deposit the
// signed area it leaves to its right into the cells it passes, so a running
// sum along the row gives each pixel's covered area.
function line(x0: number, y0: number, x1: number, y1: number): void {
  let dir = 1;
  if (y0 > y1) {
    dir = -1;
    let t = x0;
    x0 = x1;
    x1 = t;
    t = y0;
    y0 = y1;
    y1 = t;
  }
  const dxdy = (x1 - x0) / (y1 - y0);
  let x = x0;
  if (y0 < 0) {
    x -= y0 * dxdy;
    y0 = 0;
  }
  const yEnd = Math.min(BH, Math.ceil(y1));
  for (let y = Math.floor(y0); y < yEnd; y++) {
    const dy = Math.min(y + 1, y1) - Math.max(y, y0);
    const xnext = x + dxdy * dy;
    const d = dy * dir;
    let xa = x < xnext ? x : xnext;
    let xb = x < xnext ? xnext : x;
    if (xa < 0) xa = 0;
    if (xb > BW) xb = BW;
    if (xa > xb) xa = xb;
    const row = y * STRIDE;
    const xaf = Math.floor(xa);
    const xbc = Math.ceil(xb);
    let hi: number;
    if (xbc <= xaf + 1) {
      const xmf = 0.5 * (xa + xb) - xaf;
      ACC[row + xaf] += d - d * xmf;
      ACC[row + xaf + 1] += d * xmf;
      hi = xaf + 1;
    } else {
      const s = 1 / (xb - xa);
      const x0f = xa - xaf;
      const a0 = 0.5 * s * (1 - x0f) * (1 - x0f);
      const x1f = xb - xbc + 1;
      const am = 0.5 * s * x1f * x1f;
      ACC[row + xaf] += d * a0;
      if (xbc === xaf + 2) {
        ACC[row + xaf + 1] += d * (1 - a0 - am);
      } else {
        const a1 = s * (1.5 - x0f);
        ACC[row + xaf + 1] += d * (a1 - a0);
        const ds = d * s;
        for (let xi = xaf + 2; xi < xbc - 1; xi++) ACC[row + xi] += ds;
        const a2 = a1 + (xbc - xaf - 3) * s;
        ACC[row + xbc - 1] += d * (1 - a2 - am);
      }
      ACC[row + xbc] += d * am;
      hi = xbc;
    }
    if (xaf < ROWMIN[y]) ROWMIN[y] = xaf;
    if (hi > ROWMAX[y]) ROWMAX[y] = hi;
    x = xnext;
  }
}

// Integrates row y into COV[LO..HI) (box coordinates) and clears it. Past
// the last edge the coverage is constant, so a shape running off the box's
// right side fills to its end. False when nothing covers the row.
function cover(y: number, evenodd: boolean): boolean {
  const lo = ROWMIN[y];
  const mx = ROWMAX[y];
  if (mx < 0) return false;
  ROWMIN[y] = BIG;
  ROWMAX[y] = -1;
  const base = y * STRIDE;
  const end = mx + 1 < BW ? mx + 1 : BW;
  let acc = 0;
  let x = lo;
  if (evenodd) {
    for (; x < end; x++) {
      acc += ACC[base + x];
      ACC[base + x] = 0;
      const t = Math.abs(acc) % 2;
      COV[x] = t > 1 ? 2 - t : t;
    }
  } else {
    for (; x < end; x++) {
      acc += ACC[base + x];
      ACC[base + x] = 0;
      const a = acc < 0 ? -acc : acc;
      COV[x] = a > 0.9999 ? 1 : a;
    }
  }
  for (let i = end; i <= mx; i++) ACC[base + i] = 0;
  let r = Math.abs(acc);
  if (evenodd) {
    r %= 2;
    if (r > 1) r = 2 - r;
  } else if (r > 0.9999) r = 1;
  HI = end;
  if (r > 0.001) {
    for (x = end; x < BW; x++) COV[x] = r;
    HI = BW;
  }
  LO = lo;
  return HI > LO;
}

// ---- compositing ------------------------------------------------------------

const OVER = 0;
const ATOP = 1;
const DOUT = 2;
const MULT = 3;
const SCREEN = 4;
const LIGHTER = 5;
const CLEAR = 6;
const OPS: Record<Composite, number> = {
  'source-over': OVER,
  'source-atop': ATOP,
  'destination-out': DOUT,
  multiply: MULT,
  screen: SCREEN,
  lighter: LIGHTER,
};

// Solid premultiplied colour (0..255) over n pixels at byte o, weighted by
// COV[ci + i]. The common case, kept apart for speed.
function overSolid(d: Uint8ClampedArray, o: number, n: number, ci: number, r: number, g: number, b: number, a: number): void {
  const opaque = a >= 255;
  for (let i = 0; i < n; i++, o += 4) {
    const k = COV[ci + i];
    if (k <= 0) continue;
    if (k >= 1 && opaque) {
      d[o] = r;
      d[o + 1] = g;
      d[o + 2] = b;
      d[o + 3] = 255;
      continue;
    }
    const f = 1 - a * k * INV255;
    d[o] = r * k + d[o] * f;
    d[o + 1] = g * k + d[o + 1] * f;
    d[o + 2] = b * k + d[o + 2] * f;
    d[o + 3] = a * k + d[o + 3] * f;
  }
}

// SRC (premultiplied 0..255, 4 a pixel) onto n pixels at byte o with
// operator `op`, the source scaled by COV[ci + i]. Scaling the source by
// coverage equals lerping the result for all of these operators.
function blendRow(op: number, d: Uint8ClampedArray, o: number, n: number, ci: number): void {
  const S = SRC;
  for (let i = 0, j = 0; i < n; i++, j += 4, o += 4) {
    const k = COV[ci + i];
    if (k <= 0) continue;
    if (op === CLEAR) {
      const f = 1 - k;
      d[o] *= f;
      d[o + 1] *= f;
      d[o + 2] *= f;
      d[o + 3] *= f;
      continue;
    }
    const sa = S[j + 3] * k;
    if (sa <= 0 && op !== LIGHTER) continue;
    const sr = S[j] * k;
    const sg = S[j + 1] * k;
    const sb = S[j + 2] * k;
    const f = 1 - sa * INV255;
    switch (op) {
      case OVER:
        d[o] = sr + d[o] * f;
        d[o + 1] = sg + d[o + 1] * f;
        d[o + 2] = sb + d[o + 2] * f;
        d[o + 3] = sa + d[o + 3] * f;
        break;
      case ATOP: {
        const da = d[o + 3] * INV255;
        d[o] = sr * da + d[o] * f;
        d[o + 1] = sg * da + d[o + 1] * f;
        d[o + 2] = sb * da + d[o + 2] * f;
        break;
      }
      case DOUT:
        d[o] *= f;
        d[o + 1] *= f;
        d[o + 2] *= f;
        d[o + 3] *= f;
        break;
      case MULT: {
        const da = d[o + 3];
        const g = 1 - da * INV255;
        const dr = d[o];
        const dg = d[o + 1];
        const db = d[o + 2];
        d[o] = sr * g + dr * f + sr * dr * INV255;
        d[o + 1] = sg * g + dg * f + sg * dg * INV255;
        d[o + 2] = sb * g + db * f + sb * db * INV255;
        d[o + 3] = sa + da - sa * da * INV255;
        break;
      }
      case SCREEN: {
        const dr = d[o];
        const dg = d[o + 1];
        const db = d[o + 2];
        const da = d[o + 3];
        d[o] = sr + dr - sr * dr * INV255;
        d[o + 1] = sg + dg - sg * dg * INV255;
        d[o + 2] = sb + db - sb * db * INV255;
        d[o + 3] = sa + da - sa * da * INV255;
        break;
      }
      case LIGHTER:
        d[o] += sr;
        d[o + 1] += sg;
        d[o + 2] += sb;
        d[o + 3] += sa;
        break;
    }
  }
}

// ---- paints: where a pixel's source colour comes from ------------------------

interface Paint {
  solid: boolean;
  r: number;
  g: number;
  b: number;
  a: number;
  // Premultiplied 0..255 colours (globalAlpha applied) for n pixels of
  // canvas row y from column x, sampled at pixel centres.
  row(x: number, y: number, n: number, out: Float32Array): void;
}

class Solid implements Paint {
  solid = true;
  r = 0;
  g = 0;
  b = 0;
  a = 0;
  row(_x: number, _y: number, n: number, out: Float32Array): void {
    for (let j = 0; j < 4 * n; j += 4) {
      out[j] = this.r;
      out[j + 1] = this.g;
      out[j + 2] = this.b;
      out[j + 3] = this.a;
    }
  }
}
const SOLID = new Solid();

// Inverse of the current transform: device px -> user units.
type Inv = { a: number; b: number; c: number; d: number; e: number; f: number };

function invert(s: State): Inv | null {
  const det = s.a * s.d - s.b * s.c;
  if (!det || !Number.isFinite(det)) return null;
  return {
    a: s.d / det,
    b: -s.b / det,
    c: -s.c / det,
    d: s.a / det,
    e: (s.c * s.f - s.d * s.e) / det,
    f: (s.b * s.e - s.a * s.f) / det,
  };
}

class Grad implements Gradient {
  radial: boolean;
  g: number[]; // x0, y0, x1, y1 or x0, y0, r0, x1, y1, r1 (user units)
  stops: Array<{ o: number; c: RGBA }> = [];
  lut: Float32Array | null = null;

  constructor(radial: boolean, g: number[]) {
    this.radial = radial;
    this.g = g;
  }

  addColorStop(offset: number, color: Color): void {
    if (!(offset >= 0 && offset <= 1)) throw new RangeError(`colour stop offset ${offset} is outside 0..1`);
    const c = parseColor(color);
    if (!c) throw new SyntaxError(`unparseable colour '${color}'`);
    let i = this.stops.length;
    while (i > 0 && this.stops[i - 1].o > offset) i--;
    this.stops.splice(i, 0, { o: offset, c });
    this.lut = null;
  }

  // Premultiplied 0..255 colour per t step, interpolated in straight sRGB.
  table(): Float32Array {
    if (this.lut) return this.lut;
    const lut = new Float32Array(LUT_N * 4);
    const st = this.stops;
    for (let k = 0, i = 0; k < LUT_N; k++) {
      const t = k / (LUT_N - 1);
      while (i < st.length && st[i].o <= t) i++;
      let c: RGBA;
      if (i === 0) c = st[0].c;
      else if (i === st.length) c = st[st.length - 1].c;
      else {
        const p = st[i - 1];
        const q = st[i];
        const f = (t - p.o) / (q.o - p.o);
        c = [p.c[0] + (q.c[0] - p.c[0]) * f, p.c[1] + (q.c[1] - p.c[1]) * f, p.c[2] + (q.c[2] - p.c[2]) * f, p.c[3] + (q.c[3] - p.c[3]) * f];
      }
      lut[4 * k] = c[0] * c[3];
      lut[4 * k + 1] = c[1] * c[3];
      lut[4 * k + 2] = c[2] * c[3];
      lut[4 * k + 3] = c[3] * 255;
    }
    this.lut = lut;
    return lut;
  }

  paint(s: State): Paint | null {
    if (!this.stops.length) return null;
    const inv = invert(s);
    if (!inv) return null;
    const g = this.g;
    if (this.radial) {
      if (g[0] === g[3] && g[1] === g[4] && g[2] === g[5]) return null;
      return new RadialPaint(this.table(), inv, g, s.alpha);
    }
    if (g[0] === g[2] && g[1] === g[3]) return null;
    return new LinearPaint(this.table(), inv, g, s.alpha);
  }
}

class LinearPaint implements Paint {
  solid = false;
  r = 0;
  g = 0;
  b = 0;
  a = 0;
  lut: Float32Array;
  inv: Inv;
  gr: number[];
  ga: number;
  k: number;
  constructor(lut: Float32Array, inv: Inv, gr: number[], ga: number) {
    this.lut = lut;
    this.inv = inv;
    this.gr = gr;
    this.ga = ga;
    const dx = gr[2] - gr[0];
    const dy = gr[3] - gr[1];
    this.k = 1 / (dx * dx + dy * dy);
  }
  row(x: number, y: number, n: number, out: Float32Array): void {
    const { inv: m, gr, lut, ga, k } = this;
    const gx = gr[2] - gr[0];
    const gy = gr[3] - gr[1];
    const X = x + 0.5;
    const Y = y + 0.5;
    const u = m.a * X + m.c * Y + m.e - gr[0];
    const v = m.b * X + m.d * Y + m.f - gr[1];
    let t = (u * gx + v * gy) * k;
    const dt = (m.a * gx + m.b * gy) * k;
    const N = LUT_N - 1;
    for (let j = 0; j < 4 * n; j += 4, t += dt) {
      const q = t <= 0 ? 0 : t >= 1 ? 4 * N : ((t * N + 0.5) | 0) * 4;
      out[j] = lut[q] * ga;
      out[j + 1] = lut[q + 1] * ga;
      out[j + 2] = lut[q + 2] * ga;
      out[j + 3] = lut[q + 3] * ga;
    }
  }
}

// Two-circle radial gradient as the HTML spec defines it: a pixel takes the
// colour of the largest ω whose circle (c0 + ω(c1 - c0), r0 + ω(r1 - r0))
// passes through it with a non-negative radius, ω clamped to 0..1; pixels
// no circle reaches stay untouched.
class RadialPaint implements Paint {
  solid = false;
  r = 0;
  g = 0;
  b = 0;
  a = 0;
  lut: Float32Array;
  inv: Inv;
  gr: number[];
  ga: number;
  constructor(lut: Float32Array, inv: Inv, gr: number[], ga: number) {
    this.lut = lut;
    this.inv = inv;
    this.gr = gr;
    this.ga = ga;
  }
  row(x: number, y: number, n: number, out: Float32Array): void {
    const { inv: m, gr, lut, ga } = this;
    const [x0, y0, r0, x1, y1, r1] = gr;
    const cdx = x1 - x0;
    const cdy = y1 - y0;
    const dr = r1 - r0;
    const A = cdx * cdx + cdy * cdy - dr * dr;
    const N = LUT_N - 1;
    const X = x + 0.5;
    const Y = y + 0.5;
    let px = m.a * X + m.c * Y + m.e - x0;
    let py = m.b * X + m.d * Y + m.f - y0;
    for (let j = 0; j < 4 * n; j += 4, px += m.a, py += m.b) {
      const B = px * cdx + py * cdy + r0 * dr;
      const C = px * px + py * py - r0 * r0;
      let w = NaN;
      if (Math.abs(A) < 1e-9) {
        if (B !== 0) {
          w = C / (2 * B);
          if (r0 + w * dr < 0) w = NaN;
        }
      } else {
        const disc = B * B - A * C;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const wa = (B + sq) / A;
          const wb = (B - sq) / A;
          const hi = wa > wb ? wa : wb;
          const lo = wa > wb ? wb : wa;
          if (r0 + hi * dr >= 0) w = hi;
          else if (r0 + lo * dr >= 0) w = lo;
        }
      }
      if (w !== w) {
        out[j] = out[j + 1] = out[j + 2] = out[j + 3] = 0;
        continue;
      }
      const q = w <= 0 ? 0 : w >= 1 ? 4 * N : ((w * N + 0.5) | 0) * 4;
      out[j] = lut[q] * ga;
      out[j + 1] = lut[q + 1] * ga;
      out[j + 2] = lut[q + 2] * ga;
      out[j + 3] = lut[q + 3] * ga;
    }
  }
}

// An image under an affine map, sampled bilinearly at pixel centres (edge
// texels clamp; the drawn quad's own edges are anti-aliased by coverage).
// With `shift` set the map is an integer translation and rows are copied.
class ImagePaint implements Paint {
  solid = false;
  r = 0;
  g = 0;
  b = 0;
  a = 0;
  src: Uint8ClampedArray;
  w: number;
  h: number;
  inv: Inv;
  ga: number;
  shift: boolean;
  constructor(src: Uint8ClampedArray, w: number, h: number, inv: Inv, ga: number, shift: boolean) {
    this.src = src;
    this.w = w;
    this.h = h;
    this.inv = inv;
    this.ga = ga;
    this.shift = shift;
  }
  row(x: number, y: number, n: number, out: Float32Array): void {
    const { src, w, h, inv: m, ga } = this;
    if (this.shift) {
      let so = ((y + m.f) * w + x + m.e) * 4;
      for (let j = 0; j < 4 * n; j++) out[j] = src[so++] * ga;
      return;
    }
    const X = x + 0.5;
    const Y = y + 0.5;
    let u = m.a * X + m.c * Y + m.e - 0.5;
    let v = m.b * X + m.d * Y + m.f - 0.5;
    const W1 = w - 1;
    const H1 = h - 1;
    for (let j = 0; j < 4 * n; j += 4, u += m.a, v += m.b) {
      const uu = u < 0 ? 0 : u > W1 ? W1 : u;
      const vv = v < 0 ? 0 : v > H1 ? H1 : v;
      const ix = uu | 0;
      const iy = vv | 0;
      const fx = uu - ix;
      const fy = vv - iy;
      const o00 = (iy * w + ix) * 4;
      const o10 = ix < W1 ? o00 + 4 : o00;
      const o01 = iy < H1 ? o00 + 4 * w : o00;
      const o11 = ix < W1 ? o01 + 4 : o01;
      const w00 = (1 - fx) * (1 - fy) * ga;
      const w10 = fx * (1 - fy) * ga;
      const w01 = (1 - fx) * fy * ga;
      const w11 = fx * fy * ga;
      for (let c = 0; c < 4; c++) out[j + c] = src[o00 + c] * w00 + src[o10 + c] * w10 + src[o01 + c] * w01 + src[o11 + c] * w11;
    }
  }
}

// ---- strokes: polyline -> outline polygons -----------------------------------

const PX: number[] = [];
const PY: number[] = [];
const PF: number[] = [];
const UX: number[] = [];
const UY: number[] = [];
const LN: number[] = [];
const LS: number[] = []; // left (+normal) side, in path order
const RS: number[] = []; // right side, in path order
const OUT: number[] = []; // outline polygons, x, y pairs
const STARTS: number[] = []; // polygon i is points STARTS[i]..ENDS[i]
const ENDS: number[] = [];
const TMP: number[] = [];

// Angle step that keeps a radius-R arc within tol (and at least 16 steps a
// turn, so small dots stay round).
function arcStep(R: number, tol: number): number {
  return R > 0 ? 2 * Math.acos(1 - Math.min(tol / R, 0.02)) : TAU;
}

function sigmaMax(a: number, b: number, c: number, d: number): number {
  const T = a * a + b * b + c * c + d * d;
  const D = a * d - b * c;
  return Math.sqrt((T + Math.sqrt(Math.max(0, T * T - 4 * D * D))) / 2);
}

// The join at point k between segment a (in) and b (out). The outer side
// gets the join shape; the inner side meets at the offset lines' crossing
// when that lies well inside both segments, else it goes through the
// vertex (a small loop that nonzero filling absorbs).
function joint(k: number, a: number, b: number, hw: number, kind: Join, step: number): void {
  const x = PX[k];
  const y = PY[k];
  const ax = UX[a];
  const ay = UY[a];
  const bx = UX[b];
  const by = UY[b];
  const cross = ax * by - ay * bx;
  const dot = ax * bx + ay * by;
  const n0x = -ay;
  const n0y = ax;
  const n1x = -by;
  const n1y = bx;
  if (Math.abs(cross) < 1e-9 && dot > 0) {
    LS.push(x + hw * n1x, y + hw * n1y);
    RS.push(x - hw * n1x, y - hw * n1y);
    return;
  }
  const th = Math.atan2(cross, dot);
  const so = th > 0 ? -1 : 1; // the outer side: away from the turn
  const outer = so > 0 ? LS : RS;
  const inner = so > 0 ? RS : LS;
  const den = 1 + dot;
  const t = den > 1e-9 ? (hw * Math.abs(cross)) / den : Infinity;
  const hi = -so * hw;
  if (t <= 0.5 * Math.min(LN[a], LN[b])) {
    const f = hi / den;
    inner.push(x + f * (n0x + n1x), y + f * (n0y + n1y));
  } else {
    inner.push(x + hi * n0x, y + hi * n0y, x, y, x + hi * n1x, y + hi * n1y);
  }
  const ho = so * hw;
  outer.push(x + ho * n0x, y + ho * n0y);
  if (kind === 'round') {
    const m = Math.ceil(Math.abs(th) / step);
    const a0 = Math.atan2(so * n0y, so * n0x);
    for (let i = 1; i < m; i++) {
      const g = a0 + (th * i) / m;
      outer.push(x + hw * Math.cos(g), y + hw * Math.sin(g));
    }
  } else if (kind === 'miter' && den > 1e-9 && 2 / den <= MITER_LIMIT * MITER_LIMIT) {
    const f = ho / den;
    outer.push(x + f * (n0x + n1x), y + f * (n0y + n1y));
  }
  outer.push(x + ho * n1x, y + ho * n1y);
}

// Cap at (x, y) heading along u: from the +normal side round to the other.
function capPts(x: number, y: number, ux: number, uy: number, hw: number, cap: Cap, step: number): void {
  const nx = -uy;
  const ny = ux;
  if (cap === 'square') {
    OUT.push(x + hw * (nx + ux), y + hw * (ny + uy), x + hw * (ux - nx), y + hw * (uy - ny));
  } else if (cap === 'round') {
    const m = Math.ceil(Math.PI / step);
    const a0 = Math.atan2(ny, nx);
    for (let i = 1; i < m; i++) {
      const g = a0 - (Math.PI * i) / m;
      OUT.push(x + hw * Math.cos(g), y + hw * Math.sin(g));
    }
  }
}

function ring(side: number[], reverse: boolean): void {
  const s = OUT.length >> 1;
  if (reverse) for (let i = side.length - 2; i >= 0; i -= 2) OUT.push(side[i], side[i + 1]);
  else for (let i = 0; i < side.length; i++) OUT.push(side[i]);
  STARTS.push(s);
  ENDS.push(OUT.length >> 1);
}

// Appends the outline of points i0..i1 of `pts` (stroke space) to OUT.
// `soft` flags points inside flattened curves: those always join round.
function outline(pts: ArrayLike<number>, soft: ArrayLike<number>, i0: number, i1: number, closed: boolean, hw: number, join: Join, cap: Cap, tol: number): void {
  let n = 0;
  for (let i = i0; i < i1; i++) {
    const x = pts[2 * i];
    const y = pts[2 * i + 1];
    if (n && Math.abs(x - PX[n - 1]) < 1e-7 && Math.abs(y - PY[n - 1]) < 1e-7) {
      if (!soft[i]) PF[n - 1] = 0;
      continue;
    }
    PX[n] = x;
    PY[n] = y;
    PF[n] = soft[i];
    n++;
  }
  if (closed && n > 2 && Math.abs(PX[n - 1] - PX[0]) < 1e-7 && Math.abs(PY[n - 1] - PY[0]) < 1e-7) n--;
  if (n < 2) return;
  const segs = closed ? n : n - 1;
  for (let k = 0; k < segs; k++) {
    const j = k + 1 === n ? 0 : k + 1;
    const dx = PX[j] - PX[k];
    const dy = PY[j] - PY[k];
    const l = Math.hypot(dx, dy);
    UX[k] = dx / l;
    UY[k] = dy / l;
    LN[k] = l;
  }
  const step = arcStep(hw, tol);
  LS.length = 0;
  RS.length = 0;
  if (closed) {
    for (let k = 0; k < n; k++) joint(k, k === 0 ? n - 1 : k - 1, k, hw, PF[k] ? 'round' : join, step);
    ring(LS, false);
    ring(RS, true);
    return;
  }
  const e = n - 1;
  const l = segs - 1;
  LS.push(PX[0] - hw * UY[0], PY[0] + hw * UX[0]);
  RS.push(PX[0] + hw * UY[0], PY[0] - hw * UX[0]);
  for (let k = 1; k < e; k++) joint(k, k - 1, k, hw, PF[k] ? 'round' : join, step);
  LS.push(PX[e] - hw * UY[l], PY[e] + hw * UX[l]);
  RS.push(PX[e] + hw * UY[l], PY[e] - hw * UX[l]);
  const s = OUT.length >> 1;
  for (let i = 0; i < LS.length; i++) OUT.push(LS[i]);
  capPts(PX[e], PY[e], UX[l], UY[l], hw, cap, step);
  for (let i = RS.length - 2; i >= 0; i -= 2) OUT.push(RS[i], RS[i + 1]);
  capPts(PX[0], PY[0], -UX[0], -UY[0], hw, cap, step);
  STARTS.push(s);
  ENDS.push(OUT.length >> 1);
}

// ---- state --------------------------------------------------------------------

type Clip = { x0: number; y0: number; x1: number; y1: number; m: Uint8Array };

class State {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  fill: Color | Gradient = '#000000';
  stroke: Color | Gradient = '#000000';
  lineWidth = 1;
  lineJoin: Join = 'miter';
  lineCap: Cap = 'butt';
  alpha = 1;
  op: Composite = 'source-over';
  clip: Clip | null = null;
  copy(): State {
    return Object.assign(new State(), this);
  }
}

const fin = (...v: number[]) => v.every(Number.isFinite);
const JOINS = new Set(['round', 'miter', 'bevel']);
const CAPS = new Set(['round', 'butt', 'square']);

// ---- the canvas -----------------------------------------------------------------

export class Canvas implements Pen, Bitmap {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
  private u32: Uint32Array;
  private st = new State();
  private stack: State[] = [];
  // The path, already in device px: points, curve-interior flags, subpath
  // starts and closed flags.
  private P: number[] = [];
  private F: number[] = [];
  private subs: number[] = [];
  private shut: boolean[] = [];
  private open = false;
  // The path's box, device px: a path that cannot reach the canvas (or the
  // clip) is dropped before any paint or outline is made for it.
  private px0 = Infinity;
  private py0 = Infinity;
  private px1 = -Infinity;
  private py1 = -Infinity;
  private bx = 0; // last scanned box origin
  private by = 0;

  constructor(w: number, h: number) {
    this.width = Math.max(0, Math.floor(w));
    this.height = Math.max(0, Math.floor(h));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
    this.u32 = new Uint32Array(this.data.buffer);
  }

  // Fills every pixel with `color` (transparent when omitted), ignoring
  // transform, clip, alpha and composite.
  clear(color?: Color): void {
    const c = color === undefined ? null : parseColor(color);
    if (!c || c[3] === 0) {
      this.data.fill(0);
      return;
    }
    const a = c[3];
    const px = [c[0] * a, c[1] * a, c[2] * a, a * 255].map(Math.round);
    if (LE) this.u32.fill((px[0] | (px[1] << 8) | (px[2] << 16) | (px[3] << 24)) >>> 0);
    else for (let o = 0; o < this.data.length; o += 4) this.data.set(px, o);
  }

  // ---- styles

  get fillStyle(): Color | Gradient {
    return this.st.fill;
  }
  set fillStyle(v: Color | Gradient) {
    if (typeof v === 'string' ? parseColor(v) : v instanceof Grad) this.st.fill = v;
  }
  get strokeStyle(): Color | Gradient {
    return this.st.stroke;
  }
  set strokeStyle(v: Color | Gradient) {
    if (typeof v === 'string' ? parseColor(v) : v instanceof Grad) this.st.stroke = v;
  }
  get lineWidth(): number {
    return this.st.lineWidth;
  }
  set lineWidth(v: number) {
    if (v > 0 && Number.isFinite(v)) this.st.lineWidth = v;
  }
  get lineJoin(): Join {
    return this.st.lineJoin;
  }
  set lineJoin(v: Join) {
    if (JOINS.has(v)) this.st.lineJoin = v;
  }
  get lineCap(): Cap {
    return this.st.lineCap;
  }
  set lineCap(v: Cap) {
    if (CAPS.has(v)) this.st.lineCap = v;
  }
  get globalAlpha(): number {
    return this.st.alpha;
  }
  set globalAlpha(v: number) {
    if (v >= 0 && v <= 1) this.st.alpha = v;
  }
  get globalCompositeOperation(): Composite {
    return this.st.op;
  }
  set globalCompositeOperation(v: Composite) {
    if (Object.hasOwn(OPS, v)) this.st.op = v;
  }

  save(): void {
    this.stack.push(this.st.copy());
  }
  restore(): void {
    const s = this.stack.pop();
    if (s) this.st = s;
  }

  // ---- transform (each multiplies the current matrix on the right)

  translate(x: number, y: number): void {
    if (!fin(x, y)) return;
    const s = this.st;
    s.e += s.a * x + s.c * y;
    s.f += s.b * x + s.d * y;
  }
  scale(x: number, y: number): void {
    if (!fin(x, y)) return;
    const s = this.st;
    s.a *= x;
    s.b *= x;
    s.c *= y;
    s.d *= y;
  }
  rotate(rad: number): void {
    if (!fin(rad)) return;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    this.transform(cos, sin, -sin, cos, 0, 0);
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    if (!fin(a, b, c, d, e, f)) return;
    const s = this.st;
    const [A, B, C, D] = [s.a, s.b, s.c, s.d];
    s.a = A * a + C * b;
    s.b = B * a + D * b;
    s.c = A * c + C * d;
    s.d = B * c + D * d;
    s.e += A * e + C * f;
    s.f += B * e + D * f;
  }
  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    if (!fin(a, b, c, d, e, f)) return;
    Object.assign(this.st, { a, b, c, d, e, f });
  }

  // ---- path

  beginPath(): void {
    this.P.length = 0;
    this.F.length = 0;
    this.subs.length = 0;
    this.shut.length = 0;
    this.open = false;
    this.px0 = this.py0 = Infinity;
    this.px1 = this.py1 = -Infinity;
  }

  private grow(X: number, Y: number): void {
    if (X < this.px0) this.px0 = X;
    if (X > this.px1) this.px1 = X;
    if (Y < this.py0) this.py0 = Y;
    if (Y > this.py1) this.py1 = Y;
  }

  // Whether the box (device px) grown by `pad` misses the canvas and clip.
  private misses(x0: number, y0: number, x1: number, y1: number, pad: number): boolean {
    const cl = this.st.clip;
    const w = cl ? Math.min(this.width, cl.x1) : this.width;
    const h = cl ? Math.min(this.height, cl.y1) : this.height;
    const l = cl ? Math.max(0, cl.x0) : 0;
    const t = cl ? Math.max(0, cl.y0) : 0;
    return !(x1 + pad > l && y1 + pad > t && x0 - pad < w && y0 - pad < h);
  }

  private start(X: number, Y: number): void {
    const n = this.P.length >> 1;
    const k = this.subs.length;
    if (k && this.subs[k - 1] === n - 1) {
      // the last subpath is a lone point: move it
      this.P[2 * n - 2] = X;
      this.P[2 * n - 1] = Y;
      this.shut[k - 1] = false;
    } else {
      this.subs.push(n);
      this.shut.push(false);
      this.P.push(X, Y);
      this.F.push(0);
    }
    this.grow(X, Y);
    this.open = true;
  }

  private add(X: number, Y: number, soft: number): void {
    this.P.push(X, Y);
    this.F.push(soft);
    this.grow(X, Y);
  }

  moveTo(x: number, y: number): void {
    if (!fin(x, y)) return;
    const s = this.st;
    this.start(s.a * x + s.c * y + s.e, s.b * x + s.d * y + s.f);
  }

  lineTo(x: number, y: number): void {
    if (!fin(x, y)) return;
    if (!this.open) return this.moveTo(x, y);
    const s = this.st;
    this.add(s.a * x + s.c * y + s.e, s.b * x + s.d * y + s.f, 0);
  }

  closePath(): void {
    if (!this.open) return;
    const k = this.subs.length - 1;
    const i = this.subs[k];
    this.shut[k] = true;
    this.start(this.P[2 * i], this.P[2 * i + 1]);
  }

  quadraticCurveTo(cx: number, cy: number, x: number, y: number): void {
    if (!fin(cx, cy, x, y)) return;
    if (!this.open) this.moveTo(cx, cy);
    const s = this.st;
    const n = this.P.length;
    const x0 = this.P[n - 2];
    const y0 = this.P[n - 1];
    const x1 = s.a * cx + s.c * cy + s.e;
    const y1 = s.b * cx + s.d * cy + s.f;
    const x2 = s.a * x + s.c * y + s.e;
    const y2 = s.b * x + s.d * y + s.f;
    // chord error of n uniform steps is |p0 - 2p1 + p2| / (4n^2)
    const dd = Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2);
    const m = Math.min(500, Math.max(1, Math.ceil(Math.sqrt(dd / (4 * TOL)))));
    for (let i = 1; i <= m; i++) {
      const t = i / m;
      const u = 1 - t;
      this.add(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2, i < m ? 1 : 0);
    }
  }

  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void {
    if (!fin(c1x, c1y, c2x, c2y, x, y)) return;
    if (!this.open) this.moveTo(c1x, c1y);
    const s = this.st;
    const n = this.P.length;
    const x0 = this.P[n - 2];
    const y0 = this.P[n - 1];
    const x1 = s.a * c1x + s.c * c1y + s.e;
    const y1 = s.b * c1x + s.d * c1y + s.f;
    const x2 = s.a * c2x + s.c * c2y + s.e;
    const y2 = s.b * c2x + s.d * c2y + s.f;
    const x3 = s.a * x + s.c * y + s.e;
    const y3 = s.b * x + s.d * y + s.f;
    // |B''| <= 6 max(second differences); chord error <= |B''| h^2 / 8
    const M = Math.max(Math.hypot(x0 - 2 * x1 + x2, y0 - 2 * y1 + y2), Math.hypot(x1 - 2 * x2 + x3, y1 - 2 * y2 + y3));
    const m = Math.min(1000, Math.max(1, Math.ceil(Math.sqrt((0.75 * M) / TOL))));
    for (let i = 1; i <= m; i++) {
      const t = i / m;
      const u = 1 - t;
      const a = u * u * u;
      const b = 3 * u * u * t;
      const c = 3 * u * t * t;
      const d = t * t * t;
      this.add(a * x0 + b * x1 + c * x2 + d * x3, a * y0 + b * y1 + c * y2 + d * y3, i < m ? 1 : 0);
    }
  }

  arc(x: number, y: number, r: number, a0: number, a1: number, ccw = false): void {
    this.ellipse(x, y, r, r, 0, a0, a1, ccw);
  }

  // Angles as in the browser: clockwise on screen from the (rotated) x
  // axis; a sweep of 2π or more in the drawing direction is a full turn.
  // Interior points sit on a slightly larger ellipse so the polygon keeps
  // the true area.
  ellipse(x: number, y: number, rx: number, ry: number, rot: number, a0: number, a1: number, ccw = false): void {
    if (!fin(x, y, rx, ry, rot, a0, a1) || rx < 0 || ry < 0) return;
    let sweep: number;
    if (!ccw && a1 - a0 >= TAU) sweep = TAU;
    else if (ccw && a0 - a1 >= TAU) sweep = -TAU;
    else {
      let d = (a1 - a0) % TAU;
      if (d < 0) d += TAU;
      sweep = ccw ? (d === 0 ? 0 : d - TAU) : d;
    }
    const s = this.st;
    const R = Math.max(rx, ry) * sigmaMax(s.a, s.b, s.c, s.d);
    const m = Math.min(8192, Math.max(1, Math.ceil(Math.abs(sweep) / arcStep(R, TOL))));
    const phi = Math.abs(sweep) / m;
    const grow = phi > 1e-4 ? Math.sqrt(phi / Math.sin(phi)) : 1;
    const cr = Math.cos(rot);
    const sr = Math.sin(rot);
    for (let i = 0; i <= m; i++) {
      const t = a0 + (sweep * i) / m;
      const k = i > 0 && i < m ? grow : 1;
      const ex = rx * k * Math.cos(t);
      const ey = ry * k * Math.sin(t);
      const ux = x + ex * cr - ey * sr;
      const uy = y + ex * sr + ey * cr;
      const X = s.a * ux + s.c * uy + s.e;
      const Y = s.b * ux + s.d * uy + s.f;
      if (i > 0) this.add(X, Y, i < m ? 1 : 0);
      else if (this.open) this.add(X, Y, 0);
      else this.start(X, Y);
    }
  }

  rect(x: number, y: number, w: number, h: number): void {
    if (!fin(x, y, w, h)) return;
    this.moveTo(x, y);
    this.lineTo(x + w, y);
    this.lineTo(x + w, y + h);
    this.lineTo(x, y + h);
    this.closePath();
  }

  // Same corner order as rect(); r is clamped to half the shorter side.
  roundRect(x: number, y: number, w: number, h: number, r: number): void {
    if (!fin(x, y, w, h, r)) return;
    const rr = Math.min(Math.max(0, r), Math.abs(w) / 2, Math.abs(h) / 2);
    if (rr <= 0) return this.rect(x, y, w, h);
    const sx = w < 0 ? -1 : 1;
    const sy = h < 0 ? -1 : 1;
    const q = (sx * sy * Math.PI) / 2;
    const ccw = q < 0;
    const corner = (cx: number, cy: number, a: number) => this.ellipse(cx, cy, rr, rr, 0, a, a + q, ccw);
    this.moveTo(x + sx * rr, y);
    corner(x + w - sx * rr, y + sy * rr, Math.atan2(-sy, 0));
    corner(x + w - sx * rr, y + h - sy * rr, Math.atan2(0, sx));
    corner(x + sx * rr, y + h - sy * rr, Math.atan2(sy, 0));
    corner(x + sx * rr, y + sy * rr, Math.atan2(0, -sx));
    this.closePath();
  }

  // ---- painting

  private paintOf(style: Color | Gradient): Paint | null {
    const s = this.st;
    if (typeof style === 'string') {
      const c = parseColor(style);
      if (!c) return null;
      const a = c[3] * s.alpha;
      if (a <= 0) return null;
      SOLID.r = c[0] * a;
      SOLID.g = c[1] * a;
      SOLID.b = c[2] * a;
      SOLID.a = a * 255;
      return SOLID;
    }
    return style instanceof Grad ? style.paint(s) : null;
  }

  // STARTS / ENDS <- the current path's subpaths that can enclose area.
  private polys(): void {
    STARTS.length = 0;
    ENDS.length = 0;
    const n = this.subs.length;
    for (let k = 0; k < n; k++) {
      const a = this.subs[k];
      const b = k + 1 < n ? this.subs[k + 1] : this.P.length >> 1;
      if (b - a >= 3) {
        STARTS.push(a);
        ENDS.push(b);
      }
    }
  }

  // Accumulates the polygons' edges over their bounding box (cut to the
  // canvas and clip). False when nothing can be painted.
  private scan(pts: ArrayLike<number>, starts: number[], ends: number[]): boolean {
    let minx = Infinity;
    let miny = Infinity;
    let maxx = -Infinity;
    let maxy = -Infinity;
    for (let k = 0; k < starts.length; k++) {
      for (let i = starts[k]; i < ends[k]; i++) {
        const x = pts[2 * i];
        const y = pts[2 * i + 1];
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
    if (!Number.isFinite(minx + maxx + miny + maxy)) return false;
    let x0 = Math.max(0, Math.floor(minx));
    let y0 = Math.max(0, Math.floor(miny));
    let x1 = Math.min(this.width, Math.floor(maxx) + 1);
    let y1 = Math.min(this.height, Math.ceil(maxy));
    const cl = this.st.clip;
    if (cl) {
      x0 = Math.max(x0, cl.x0);
      y0 = Math.max(y0, cl.y0);
      x1 = Math.min(x1, cl.x1);
      y1 = Math.min(y1, cl.y1);
    }
    if (x1 <= x0 || y1 <= y0) return false;
    reserve(x1 - x0, y1 - y0);
    this.bx = x0;
    this.by = y0;
    for (let k = 0; k < starts.length; k++) {
      const s = starts[k];
      const e = ends[k];
      let px = pts[2 * e - 2] - x0;
      let py = pts[2 * e - 1] - y0;
      for (let i = s; i < e; i++) {
        const qx = pts[2 * i] - x0;
        const qy = pts[2 * i + 1] - y0;
        edge(px, py, qx, qy);
        px = qx;
        py = qy;
      }
    }
    return true;
  }

  // Composites n pixels of row y from column x, coverage COV[ci..].
  private span(y: number, x: number, n: number, ci: number, p: Paint | null, op: number): void {
    const cl = this.st.clip;
    if (cl) {
      const m = cl.m;
      const mo = (y - cl.y0) * (cl.x1 - cl.x0) + (x - cl.x0);
      for (let i = 0; i < n; i++) COV[ci + i] *= m[mo + i] * INV255;
    }
    const o = (y * this.width + x) * 4;
    if (p && p.solid && op === OVER) return overSolid(this.data, o, n, ci, p.r, p.g, p.b, p.a);
    if (p && op !== CLEAR) p.row(x, y, n, SRC);
    blendRow(op, this.data, o, n, ci);
  }

  private fillPolys(pts: ArrayLike<number>, starts: number[], ends: number[], rule: Rule, p: Paint | null, op: number): void {
    if (!this.scan(pts, starts, ends)) return;
    const eo = rule === 'evenodd';
    const x0 = this.bx;
    const y0 = this.by;
    for (let y = 0; y < BH; y++) {
      if (cover(y, eo)) this.span(y0 + y, x0 + LO, HI - LO, LO, p, op);
    }
  }

  fill(rule: Rule = 'nonzero'): void {
    if (this.misses(this.px0, this.py0, this.px1, this.py1, 1)) return;
    const p = this.paintOf(this.st.fill);
    if (!p) return;
    this.polys();
    this.fillPolys(this.P, STARTS, ENDS, rule, p, OPS[this.st.op]);
  }

  // Strokes in the space of the current transform: a uniform scale just
  // widens the pen; anything else (e.g. scale(1, 0.5)) strokes the path
  // mapped back through the inverse, then maps the outline forward.
  stroke(): void {
    const s = this.st;
    // Half the pen, stretched by the transform at most by its Frobenius
    // norm, out to a miter's spike (a square cap reaches 1.42 half widths).
    const reach = (s.lineWidth / 2) * Math.sqrt(s.a * s.a + s.b * s.b + s.c * s.c + s.d * s.d) * (s.lineJoin === 'miter' ? MITER_LIMIT : 1.5);
    if (this.misses(this.px0, this.py0, this.px1, this.py1, reach + 2)) return;
    const p = this.paintOf(s.stroke);
    if (!p || !this.subs.length) return;
    const { a, b, c, d } = s;
    const det = a * d - b * c;
    if (!(Math.abs(det) > 1e-12)) return;
    const sim = (Math.abs(a - d) < 1e-9 && Math.abs(b + c) < 1e-9) || (Math.abs(a + d) < 1e-9 && Math.abs(b - c) < 1e-9);
    let pts: number[] = this.P;
    let hw = s.lineWidth / 2;
    let tol = TOL;
    if (sim) hw *= Math.sqrt(Math.abs(det));
    else {
      const ia = d / det;
      const ib = -b / det;
      const ic = -c / det;
      const id = a / det;
      TMP.length = this.P.length;
      for (let i = 0; i < this.P.length; i += 2) {
        const x = this.P[i];
        const y = this.P[i + 1];
        TMP[i] = ia * x + ic * y;
        TMP[i + 1] = ib * x + id * y;
      }
      pts = TMP;
      tol = TOL / sigmaMax(a, b, c, d);
    }
    OUT.length = 0;
    STARTS.length = 0;
    ENDS.length = 0;
    const n = this.subs.length;
    for (let k = 0; k < n; k++) {
      const i1 = k + 1 < n ? this.subs[k + 1] : this.P.length >> 1;
      outline(pts, this.F, this.subs[k], i1, this.shut[k], hw, s.lineJoin, s.lineCap, tol);
    }
    if (!sim) {
      for (let i = 0; i < OUT.length; i += 2) {
        const x = OUT[i];
        const y = OUT[i + 1];
        OUT[i] = a * x + c * y;
        OUT[i + 1] = b * x + d * y;
      }
    }
    this.fillPolys(OUT, STARTS, ENDS, 'nonzero', p, OPS[s.op]);
  }

  // Intersects the clip with the current path; restore() undoes it.
  clip(rule: Rule = 'nonzero'): void {
    const old = this.st.clip;
    this.polys();
    if (!this.scan(this.P, STARTS, ENDS)) {
      this.st.clip = { x0: 0, y0: 0, x1: 0, y1: 0, m: new Uint8Array(0) };
      return;
    }
    const w = BW;
    const x0 = this.bx;
    const y0 = this.by;
    const m = new Uint8Array(w * BH);
    const eo = rule === 'evenodd';
    for (let y = 0; y < BH; y++) {
      if (!cover(y, eo)) continue;
      const row = y * w;
      if (old) {
        const om = old.m;
        const oo = (y + y0 - old.y0) * (old.x1 - old.x0) + (x0 - old.x0);
        for (let x = LO; x < HI; x++) m[row + x] = COV[x] * om[oo + x] + 0.5;
      } else {
        for (let x = LO; x < HI; x++) m[row + x] = COV[x] * 255 + 0.5;
      }
    }
    this.st.clip = { x0, y0, x1: x0 + w, y1: y0 + BH, m };
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    if (!fin(x, y, w, h) || !w || !h) return;
    const s = this.st;
    const xs = [s.a * x + s.c * y, s.a * (x + w) + s.c * y, s.a * x + s.c * (y + h), s.a * (x + w) + s.c * (y + h)];
    const ys = [s.b * x + s.d * y, s.b * (x + w) + s.d * y, s.b * x + s.d * (y + h), s.b * (x + w) + s.d * (y + h)];
    if (this.misses(Math.min(...xs) + s.e, Math.min(...ys) + s.f, Math.max(...xs) + s.e, Math.max(...ys) + s.f, 1)) return;
    const p = this.paintOf(this.st.fill);
    if (p) this.box(x, y, w, h, p, OPS[this.st.op]);
  }

  // Clears to transparent black under the clip, ignoring alpha and composite.
  clearRect(x: number, y: number, w: number, h: number): void {
    if (!fin(x, y, w, h) || !w || !h) return;
    this.box(x, y, w, h, null, CLEAR);
  }

  // A rectangle in user units. Axis-aligned transforms get exact
  // per-row/column coverage and, for opaque solid source-over (or clear)
  // without a clip, 32-bit fills of the inner pixels.
  private box(x: number, y: number, w: number, h: number, p: Paint | null, op: number): void {
    const s = this.st;
    if (s.b !== 0 || s.c !== 0) {
      const q = [x, y, x + w, y, x + w, y + h, x, y + h];
      for (let i = 0; i < 8; i += 2) {
        const u = q[i];
        const v = q[i + 1];
        q[i] = s.a * u + s.c * v + s.e;
        q[i + 1] = s.b * u + s.d * v + s.f;
      }
      return this.fillPolys(q, [0], [4], 'nonzero', p, op);
    }
    let X0 = s.a * x + s.e;
    let X1 = s.a * (x + w) + s.e;
    let Y0 = s.d * y + s.f;
    let Y1 = s.d * (y + h) + s.f;
    if (X0 > X1) [X0, X1] = [X1, X0];
    if (Y0 > Y1) [Y0, Y1] = [Y1, Y0];
    const cl = s.clip;
    const ix0 = Math.max(0, Math.floor(X0), cl ? cl.x0 : 0);
    const ix1 = Math.min(this.width, Math.ceil(X1), cl ? cl.x1 : Infinity);
    const iy0 = Math.max(0, Math.floor(Y0), cl ? cl.y0 : 0);
    const iy1 = Math.min(this.height, Math.ceil(Y1), cl ? cl.y1 : Infinity);
    if (ix1 <= ix0 || iy1 <= iy0) return;
    const n = ix1 - ix0;
    rowScratch(n);
    for (let i = 0; i < n; i++) COVX[i] = Math.max(0, Math.min(ix0 + i + 1, X1) - Math.max(ix0 + i, X0));
    let fast = -1;
    if (LE && !cl && op === CLEAR) fast = 0;
    if (LE && !cl && op === OVER && p && p.solid && p.a >= 255) {
      fast = (Math.round(p.r) | (Math.round(p.g) << 8) | (Math.round(p.b) << 16) | (255 << 24)) >>> 0;
    }
    const f0 = Math.max(ix0, Math.ceil(X0));
    const f1 = Math.min(ix1, Math.floor(X1));
    for (let yy = iy0; yy < iy1; yy++) {
      const cy = Math.min(yy + 1, Y1) - Math.max(yy, Y0);
      if (fast >= 0 && cy >= 1 && f1 > f0) {
        this.u32.fill(fast, yy * this.width + f0, yy * this.width + f1);
        if (f0 > ix0) {
          COV[0] = COVX[0];
          this.span(yy, ix0, 1, 0, p, op);
        }
        if (ix1 > f1) {
          COV[0] = COVX[n - 1];
          this.span(yy, f1, 1, 0, p, op);
        }
        continue;
      }
      for (let i = 0; i < n; i++) COV[i] = COVX[i] * cy;
      this.span(yy, ix0, n, 0, p, op);
    }
  }

  createLinearGradient(x0: number, y0: number, x1: number, y1: number): Gradient {
    if (!fin(x0, y0, x1, y1)) throw new TypeError('non-finite gradient coordinates');
    return new Grad(false, [x0, y0, x1, y1]);
  }

  createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): Gradient {
    if (!fin(x0, y0, r0, x1, y1, r1)) throw new TypeError('non-finite gradient coordinates');
    if (r0 < 0 || r1 < 0) throw new RangeError('negative gradient radius');
    return new Grad(true, [x0, y0, r0, x1, y1, r1]);
  }

  // Draws img (premultiplied) into (dx, dy, dw, dh) under the transform.
  // An integer translation copies pixels; anything else samples bilinearly.
  drawImage(img: Bitmap, dx: number, dy: number, dw?: number, dh?: number): void {
    const iw = img.width;
    const ih = img.height;
    const w = dw ?? iw;
    const h = dh ?? ih;
    if (!iw || !ih || !fin(dx, dy, w, h) || !w || !h) return;
    const s = this.st;
    const op = OPS[s.op];
    const ga = s.alpha;
    if (ga <= 0) return;
    let src = img.data;
    if (src.buffer === this.data.buffer) src = src.slice();
    const sx = w / iw;
    const sy = h / ih;
    const A = s.a * sx;
    const B = s.b * sx;
    const C = s.c * sy;
    const D = s.d * sy;
    const E = s.a * dx + s.c * dy + s.e;
    const F = s.b * dx + s.d * dy + s.f;
    if (A === 1 && B === 0 && C === 0 && D === 1 && Number.isInteger(E) && Number.isInteger(F)) {
      return this.blit(src, iw, ih, E, F, ga, op);
    }
    const det = A * D - B * C;
    if (!det) return;
    const inv = { a: D / det, b: -B / det, c: -C / det, d: A / det, e: (C * F - D * E) / det, f: (B * E - A * F) / det };
    const q = [E, F, A * iw + E, B * iw + F, A * iw + C * ih + E, B * iw + D * ih + F, C * ih + E, D * ih + F];
    this.fillPolys(q, [0], [4], 'nonzero', new ImagePaint(src, iw, ih, inv, ga, false), op);
  }

  private blit(src: Uint8ClampedArray, iw: number, ih: number, X: number, Y: number, ga: number, op: number): void {
    const cl = this.st.clip;
    const x0 = Math.max(0, X, cl ? cl.x0 : 0);
    const y0 = Math.max(0, Y, cl ? cl.y0 : 0);
    const x1 = Math.min(this.width, X + iw, cl ? cl.x1 : Infinity);
    const y1 = Math.min(this.height, Y + ih, cl ? cl.y1 : Infinity);
    if (x1 <= x0 || y1 <= y0) return;
    const n = x1 - x0;
    const d = this.data;
    if (op === OVER && ga === 1 && !cl && LE && src.byteOffset % 4 === 0) {
      // opaque pixels move as one 32-bit word, clear ones are skipped
      const s32 = new Uint32Array(src.buffer, src.byteOffset, iw * ih);
      const d32 = this.u32;
      for (let y = y0; y < y1; y++) {
        const si = (y - Y) * iw + (x0 - X);
        const di = y * this.width + x0;
        for (let i = 0; i < n; i++) {
          const v = s32[si + i];
          const a = v >>> 24;
          if (a === 255) d32[di + i] = v;
          else if (a !== 0) {
            const so = (si + i) * 4;
            const o = (di + i) * 4;
            const f = 1 - a * INV255;
            d[o] = src[so] + d[o] * f;
            d[o + 1] = src[so + 1] + d[o + 1] * f;
            d[o + 2] = src[so + 2] + d[o + 2] * f;
            d[o + 3] = a + d[o + 3] * f;
          }
        }
      }
      return;
    }
    rowScratch(n);
    const p = new ImagePaint(src, iw, ih, { a: 1, b: 0, c: 0, d: 1, e: -X, f: -Y }, ga, true);
    for (let y = y0; y < y1; y++) {
      COV.fill(1, 0, n);
      this.span(y, x0, n, 0, p, op);
    }
  }
}

// ---- blur ------------------------------------------------------------------------

// Box radii whose three passes approximate a Gaussian of deviation sigma
// (Kovesi's method).
function boxes(sigma: number): number[] {
  const ideal = Math.sqrt((12 * sigma * sigma) / 3 + 1);
  let wl = Math.floor(ideal);
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
  return [0, 1, 2].map((i) => ((i < m ? wl : wl + 2) - 1) / 2);
}

// In-place Gaussian blur of a premultiplied bitmap; `radius` is the
// standard deviation in px (as CSS blur()). Three box passes each way;
// outside the bitmap counts as transparent.
export function blur(b: Bitmap, radius: number): void {
  if (!(radius > 0) || !b.width || !b.height) return;
  const w = b.width;
  const h = b.height;
  let f = Float32Array.from(b.data);
  let g = new Float32Array(f.length);
  const sum = new Float64Array(w * 4);
  for (const r of boxes(radius)) {
    if (r < 1) continue;
    const k = 1 / (2 * r + 1);
    // horizontal: running window per row
    for (let y = 0; y < h; y++) {
      const base = y * w * 4;
      let s0 = 0;
      let s1 = 0;
      let s2 = 0;
      let s3 = 0;
      for (let i = 0; i <= r && i < w; i++) {
        const o = base + 4 * i;
        s0 += f[o];
        s1 += f[o + 1];
        s2 += f[o + 2];
        s3 += f[o + 3];
      }
      for (let x = 0; x < w; x++) {
        const o = base + 4 * x;
        g[o] = s0 * k;
        g[o + 1] = s1 * k;
        g[o + 2] = s2 * k;
        g[o + 3] = s3 * k;
        if (x + r + 1 < w) {
          const a = o + 4 * (r + 1);
          s0 += f[a];
          s1 += f[a + 1];
          s2 += f[a + 2];
          s3 += f[a + 3];
        }
        if (x - r >= 0) {
          const a = o - 4 * r;
          s0 -= f[a];
          s1 -= f[a + 1];
          s2 -= f[a + 2];
          s3 -= f[a + 3];
        }
      }
    }
    [f, g] = [g, f];
    // vertical: running window per column, a row at a time
    sum.fill(0);
    const rw = w * 4;
    for (let i = 0; i <= r && i < h; i++) for (let j = 0; j < rw; j++) sum[j] += f[i * rw + j];
    for (let y = 0; y < h; y++) {
      const o = y * rw;
      for (let j = 0; j < rw; j++) g[o + j] = sum[j] * k;
      if (y + r + 1 < h) {
        const a = (y + r + 1) * rw;
        for (let j = 0; j < rw; j++) sum[j] += f[a + j];
      }
      if (y - r >= 0) {
        const a = (y - r) * rw;
        for (let j = 0; j < rw; j++) sum[j] -= f[a + j];
      }
    }
    [f, g] = [g, f];
  }
  b.data.set(f);
}
