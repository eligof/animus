// A picture with alpha as the PNG a terminal is sent it as: the scene's
// sprites (see plate.ts) go out this way, kept by the terminal and placed
// frame after frame. Mostly clear, they compress well.

import { crc32, deflateSync } from 'node:zlib';
import type { Bitmap } from '../types.ts';

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// A premultiplied bitmap as an 8-bit RGBA PNG (straight alpha), every row
// "sub" filtered (runs of clear pixels become runs of zeros).
export function encodeRgba(b: Bitmap, level = 2): Buffer {
  const { width: w, height: h, data } = b;
  const stride = 1 + 4 * w;
  const raw = Buffer.allocUnsafe(h * stride);
  for (let y = 0, s = 0; y < h; y++) {
    let o = y * stride;
    raw[o++] = 1; // sub
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let pa = 0;
    for (let x = 0; x < w; x++, s += 4, o += 4) {
      const a = data[s + 3];
      let r = data[s];
      let g = data[s + 1];
      let bl = data[s + 2];
      if (a !== 255 && a !== 0) {
        r = Math.min(255, Math.round((r * 255) / a));
        g = Math.min(255, Math.round((g * 255) / a));
        bl = Math.min(255, Math.round((bl * 255) / a));
      }
      raw[o] = r - pr;
      raw[o + 1] = g - pg;
      raw[o + 2] = bl - pb;
      raw[o + 3] = a - pa;
      pr = r;
      pg = g;
      pb = bl;
      pa = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  return Buffer.concat([SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level })), chunk('IEND', Buffer.alloc(0))]);
}
