import { deflateSync } from 'node:zlib';
import { CLEAR } from './canvas.ts';
import type { PixelCanvas } from './canvas.ts';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

// 8-bit RGB PNG of the canvas, each pixel scaled to `scale` x `scale`
// (cleared pixels come out black). Used for previews and docs.
export function encodePng(c: PixelCanvas, scale = 1): Buffer {
  const w = c.w * scale;
  const h = c.h * scale;
  const raw = Buffer.alloc(h * (1 + 3 * w));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + 3 * w);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const v = c.data[Math.floor(y / scale) * c.w + Math.floor(x / scale)];
      const p = v === CLEAR ? 0 : v;
      const o = row + 1 + 3 * x;
      raw[o] = (p >> 16) & 255;
      raw[o + 1] = (p >> 8) & 255;
      raw[o + 2] = p & 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
