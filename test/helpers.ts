import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import type { Bitmap, Pen } from '../src/art/types.ts';
import type { Rect } from '../src/term/screen.ts';
import { CARD_H, CARD_W } from '../src/ui/card.ts';
import type { Box } from '../src/ui/card.ts';

const made: string[] = [];
let hooked = false;

// A fresh private directory under the OS temp dir, removed when the test
// process exits (node --test runs each file in its own process).
export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), `${prefix}-`));
  made.push(dir);
  if (!hooked) {
    hooked = true;
    process.on('exit', () => {
      for (const d of made) rmSync(d, { recursive: true, force: true });
    });
  }
  return dir;
}

// A Pen that draws nothing but notes what it was asked to: every point of
// every path (in the pen's own coordinates, transforms not applied), how
// many fills and strokes, and how deep save() went (restore() undoes it).
export type RecordingPen = Pen & { points: Array<[number, number]>; fills: number; strokes: number; depth: number; colors: string[] };

export function recordingPen(width = 1000, height = 800): RecordingPen {
  const points: Array<[number, number]> = [];
  const pt = (...xy: number[]) => {
    for (let i = 0; i + 1 < xy.length; i += 2) points.push([xy[i], xy[i + 1]]);
  };
  const gradient = { addColorStop: () => {} };
  const pen: RecordingPen = {
    width,
    height,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    points,
    fills: 0,
    strokes: 0,
    depth: 0,
    colors: [],
    save: () => void pen.depth++,
    restore: () => void pen.depth--,
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    transform: () => {},
    setTransform: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: (x, y) => pt(x, y),
    lineTo: (x, y) => pt(x, y),
    quadraticCurveTo: (cx, cy, x, y) => pt(cx, cy, x, y),
    bezierCurveTo: (a, b, c, d, x, y) => pt(a, b, c, d, x, y),
    arc: (x, y) => pt(x, y),
    ellipse: (x, y) => pt(x, y),
    rect: (x, y, w, h) => pt(x, y, x + w, y + h),
    roundRect: (x, y, w, h) => pt(x, y, x + w, y + h),
    fill: () => {
      pen.fills++;
      if (typeof pen.fillStyle === 'string') pen.colors.push(pen.fillStyle);
    },
    stroke: () => void pen.strokes++,
    clip: () => {},
    fillRect: (x, y, w, h) => {
      pt(x, y, x + w, y + h);
      pen.fills++;
    },
    clearRect: () => {},
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    drawImage: () => {},
  };
  return pen;
}

// ── PNG for tests of what goes over the wire ────────────────────────────
// A plain PNG of a bitmap's colours (alpha ignored: the scene is opaque),
// filter 0 on every row; and back to packed RGB pixels (filters 0 and 2).
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function testPng(b: Bitmap): Uint8Array {
  const { width: w, height: h, data } = b;
  const raw = Buffer.alloc(h * (1 + 3 * w));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = 4 * (y * w + x);
      const o = y * (1 + 3 * w) + 1 + 3 * x;
      raw[o] = data[i];
      raw[o + 1] = data[i + 1];
      raw[o + 2] = data[i + 2];
    }
  }
  const head = Buffer.alloc(13);
  head.writeUInt32BE(w, 0);
  head.writeUInt32BE(h, 4);
  head[8] = 8;
  head[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', head), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))]);
}

export function decodePng(png: Uint8Array): { w: number; h: number; px: Int32Array } {
  const buf = Buffer.from(png);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  const parts: Buffer[] = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    if (buf.subarray(off + 4, off + 8).toString('ascii') === 'IDAT') parts.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = 1 + 3 * w;
  const px = new Int32Array(w * h);
  const line = new Uint8Array(3 * w);
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride];
    for (let i = 0; i < 3 * w; i++) line[i] = (f === 2 ? line[i] : 0) + raw[y * stride + 1 + i];
    for (let x = 0; x < w; x++) px[y * w + x] = (line[3 * x] << 16) | (line[3 * x + 1] << 8) | line[3 * x + 2];
  }
  return { w, h, px };
}

// An opaque bitmap; `put` sets pixel i to packed RGB.
export function bitmap(w: number, h: number): Bitmap & { put(i: number, rgb: number): void } {
  const data = new Uint8ClampedArray(w * h * 4);
  const b = {
    width: w,
    height: h,
    data,
    put(i: number, rgb: number) {
      data[4 * i] = (rgb >> 16) & 255;
      data[4 * i + 1] = (rgb >> 8) & 255;
      data[4 * i + 2] = rgb & 255;
      data[4 * i + 3] = 255;
    },
  };
  for (let i = 0; i < w * h; i++) b.put(i, 0);
  return b;
}

// The pet card at (x, y) covers a cell of the box.
export function covers(p: { x: number; y: number }, b: Box): boolean {
  return p.x <= b.x1 && p.x + CARD_W - 1 >= b.x0 && p.y <= b.y1 && p.y + CARD_H - 1 >= b.y0;
}

// Some spot in the scene keeps the pet card clear of the box.
export function room(r: Rect, b: Box): boolean {
  for (let y = r.y; y + CARD_H <= r.y + r.h; y++) for (let x = r.x; x + CARD_W <= r.x + r.w; x++) if (!covers({ x, y }, b)) return true;
  return false;
}

// ---- time budgets -------------------------------------------------------
// The world tests assert time budgets that exist to catch a real slowdown (a
// 5-10x one), not to measure a loaded machine; node runs the test files in
// parallel, so a CPU-heavy neighbour can slow any timing several-fold for a
// while. So a budget is judged against the machine's speed right now: a small
// fixed CPU workload is timed and compared with the fastest it has ever run in
// this process, and the limit is scaled by that slowdown (never below 1).

// A fixed, deterministic bit of CPU work (float math, typed-array writes, small
// allocations: the same sort of thing the drawing code does), timed in ms.
function workload(): number {
  const t = performance.now();
  const a = new Float64Array(1024);
  let acc = 0;
  for (let i = 0; i < 150000; i++) {
    const p = { x: Math.sin(i * 0.01), y: Math.cos(i * 0.013) };
    a[i & 1023] += p.x * p.y;
    acc += a[(i * 7) & 1023];
  }
  if (acc === 0.123) throw new Error('unreachable'); // keeps the loop alive
  return performance.now() - t;
}

// The fastest the workload has run so far, ms (a few warmed runs at load).
let fastest = Infinity;
function calibrate(runs: number): number {
  let now = Infinity;
  for (let k = 0; k < runs; k++) now = Math.min(now, workload());
  fastest = Math.min(fastest, now);
  return now;
}
calibrate(8);

// The best of `runs` timings of `fn`, in ms a call: `fn(i)` is called `calls`
// times (i = 0..calls-1) per timing. A busy machine only ever makes a run
// slower, so the minimum is the honest figure.
export function bestOf(fn: (i: number) => void, runs = 5, calls = 1): number {
  let min = Infinity;
  for (let k = 0; k < runs; k++) {
    const t = performance.now();
    for (let i = 0; i < calls; i++) fn(i);
    min = Math.min(min, (performance.now() - t) / calls);
  }
  return min;
}

// Asserts that `fn` takes at most `limitMs` a call (see bestOf), returning the
// best time measured. Before failing it re-measures, with the limit scaled by
// how much slower the machine is now than at its fastest; it fails only if
// the code is slow relative to the machine's speed right now.
export function budget(label: string, fn: (i: number) => void, limitMs: number, opts: { runs?: number; calls?: number } = {}): number {
  const { runs = 5, calls = 1 } = opts;
  let ms = bestOf(fn, runs, calls);
  if (ms <= limitMs) return ms;
  let factor = 1;
  for (let attempt = 0; attempt < 3; attempt++) {
    factor = Math.max(1, calibrate(3) / fastest);
    ms = Math.min(ms, bestOf(fn, runs, calls));
    if (ms <= limitMs * factor) return ms;
  }
  throw new assert.AssertionError({
    message: `${label}: ${ms.toFixed(2)} ms, over the ${limitMs} ms budget scaled to ${(limitMs * factor).toFixed(2)} ms (the machine runs ${factor.toFixed(2)}x slower than at its fastest)`,
  });
}
