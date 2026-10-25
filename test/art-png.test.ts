import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { Canvas } from '../src/art/canvas.ts';
import { encodeRgb } from '../src/art/png.ts';

// Minimal PNG reader for 8-bit RGB: chunks, inflate, undo the row filters.
function decode(png: Buffer): { w: number; h: number; rgb: Uint8Array } {
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let o = 8;
  let w = 0;
  let h = 0;
  const idat: Buffer[] = [];
  while (o < png.length) {
    const len = png.readUInt32BE(o);
    const type = png.toString('ascii', o + 4, o + 8);
    const body = png.subarray(o + 8, o + 8 + len);
    if (type === 'IHDR') {
      w = body.readUInt32BE(0);
      h = body.readUInt32BE(4);
      assert.equal(body[8], 8);
      assert.equal(body[9], 2);
    }
    if (type === 'IDAT') idat.push(body);
    o += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = 3 * w;
  const rgb = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    for (let i = 0; i < stride; i++) {
      const v = raw[y * (stride + 1) + 1 + i];
      const a = i >= 3 ? rgb[y * stride + i - 3] : 0;
      const b = y ? rgb[(y - 1) * stride + i] : 0;
      const c = i >= 3 && y ? rgb[(y - 1) * stride + i - 3] : 0;
      let p = 0;
      if (f === 1) p = a;
      else if (f === 2) p = b;
      else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a);
        const pb = Math.abs(q - b);
        const pc = Math.abs(q - c);
        p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      rgb[y * stride + i] = (v + p) & 255;
    }
  }
  return { w, h, rgb };
}

test('encodeRgb round-trips through inflate, flattening onto the background', () => {
  const c = new Canvas(7, 5);
  c.fillStyle = '#ff8000';
  c.fillRect(0, 0, 3, 5);
  c.fillStyle = 'rgba(0, 0, 255, 0.5)';
  c.fillRect(3, 0, 2, 5);
  c.fillStyle = '#123456';
  c.fillRect(6, 4, 1, 1);
  const { w, h, rgb } = decode(encodeRgb(c, 0x204060));
  assert.equal(w, 7);
  assert.equal(h, 5);
  const at = (x: number, y: number) => [...rgb.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];
  assert.deepEqual(at(1, 2), [255, 128, 0]);
  // half blue over the background
  const half = at(3, 1);
  assert.ok(Math.abs(half[0] - 16) <= 1 && Math.abs(half[1] - 32) <= 1 && Math.abs(half[2] - (128 + 48)) <= 1, `${half}`);
  assert.deepEqual(at(5, 0), [0x20, 0x40, 0x60]); // transparent -> bg
  assert.deepEqual(at(6, 4), [0x12, 0x34, 0x56]);
});

test('encodeRgb on a large frame is quick and decodes exactly', (t) => {
  const c = new Canvas(1500, 920);
  c.clear('#1d1a26');
  for (let i = 0; i < 200; i++) {
    c.fillStyle = `rgb(${(i * 37) % 256}, ${(i * 91) % 256}, ${(i * 53) % 256})`;
    c.beginPath();
    c.arc((i * 97) % 1500, (i * 61) % 920, 10 + (i % 30), 0, Math.PI * 2);
    c.fill();
  }
  encodeRgb(c, 0); // warm up
  const t0 = performance.now();
  const png = encodeRgb(c, 0, 1);
  const ms = performance.now() - t0;
  t.diagnostic(`encodeRgb 1500x920 level 1: ${ms.toFixed(1)} ms, ${(png.length / 1024).toFixed(0)} KiB`);
  assert.ok(ms < 80, `${ms} ms`);
  const { rgb } = decode(png);
  for (const [x, y] of [[0, 0], [97, 61], [750, 460], [1499, 919], [333, 777]]) {
    const o = (y * 1500 + x) * 4;
    const k = (255 - c.data[o + 3]) / 255;
    const want = [0, 1, 2].map((i) => Math.min(255, Math.floor(c.data[o + i] + 0 * k + 0.5)));
    assert.deepEqual([...rgb.subarray((y * 1500 + x) * 3, (y * 1500 + x) * 3 + 3)], want);
  }
});
