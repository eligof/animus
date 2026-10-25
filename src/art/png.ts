// PNG frames for the terminal: a premultiplied bitmap flattened onto an
// opaque background and written as 8-bit RGB. Every row uses the "sub"
// filter (each byte minus the pixel to its left): flat cartoon fills become
// runs of zeros and soft gradients small deltas. Measured on 1500x920
// illustrated rooms it is within 3 % of the best filter at zlib level 1
// and 7-8 % smaller than "up" at level 2, for the same cost.

import { crc32, deflateSync } from 'node:zlib';
import type { Bitmap } from './types.ts';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// `bg` is 0xRRGGBB; `level` the zlib level (2 is ~25 % smaller than 1 on
// lit scenes for ~1.5 ms more at 1500x920).
export function encodeRgb(b: Bitmap, bg: number, level = 1): Buffer {
  const { width: w, height: h, data } = b;
  const stride = 1 + 3 * w;
  const raw = Buffer.allocUnsafe(h * stride);
  const br = (bg >> 16) & 255;
  const bgG = (bg >> 8) & 255;
  const bb = bg & 255;
  for (let y = 0, s = 0; y < h; y++) {
    let o = y * stride;
    raw[o++] = 1; // sub
    let pr = 0;
    let pg = 0;
    let pb = 0;
    for (let x = 0; x < w; x++, s += 4, o += 3) {
      const a = data[s + 3];
      let r = br;
      let g = bgG;
      let bl = bb;
      if (a === 255) {
        r = data[s];
        g = data[s + 1];
        bl = data[s + 2];
      } else if (a !== 0) {
        const k = (255 - a) / 255;
        r = Math.min(255, (data[s] + br * k + 0.5) | 0);
        g = Math.min(255, (data[s + 1] + bgG * k + 0.5) | 0);
        bl = Math.min(255, (data[s + 2] + bb * k + 0.5) | 0);
      }
      raw[o] = r - pr;
      raw[o + 1] = g - pg;
      raw[o + 2] = bl - pb;
      pr = r;
      pg = g;
      pb = bl;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}
