import { deflateSync } from 'node:zlib';
import { CLEAR } from './canvas.ts';
import type { PixelCanvas } from './canvas.ts';
import { GLYPH_H, plotText, textWidth } from './font.ts';

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

function png(w: number, h: number, raw: Buffer, level?: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, level === undefined ? {} : { level })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Fast PNG of the canvas blown up `scale` times (nearest neighbour), for
// streaming frames to the terminal: repeated rows use the PNG "up" filter
// (all zero bytes), so a 2x or 3x image costs barely more to compress than
// the canvas itself. Cleared pixels take `bg`.
// `detail` (optional): a pattern index per canvas pixel and the s x s
// brightness patterns it points at (see src/cave/texture.ts), so blown-up
// blocks on a silhouette edge get a crisp outline and rim light.
export type Detail = { idx: Uint16Array; pats: ReadonlyArray<Float32Array | null> };

// A text tag painted over the blown-up image at full resolution (see
// src/iso/font.ts). (x, y) is the image pixel at the top-left of its box,
// textWidth + 2 * TAG_PAD by GLYPH_H + 2 * TAG_PAD px; the text sits TAG_PAD
// px in. `bg` fills the box, blended at `bgAlpha` (0..1) when given;
// `shadow` drops a 1 px shadow down-right of each lit pixel. `scale`
// (default 1) draws every font pixel as scale x scale image pixels, the
// padding, shadow and box growing with it (see tagSize).
export type Tag = { x: number; y: number; text: string; color: number; shadow?: number; bg?: number; bgAlpha?: number; scale?: number };
export const TAG_PAD = 1;

// A tag's box in image pixels, at its font scale.
export function tagSize(text: string, scale = 1): { w: number; h: number } {
  const s = Math.max(1, Math.floor(scale));
  return { w: (textWidth(text) + 2 * TAG_PAD) * s, h: (GLYPH_H + 2 * TAG_PAD) * s };
}

// `overlay` (optional): tags painted over the image after the blow-up.
export function encodePngScaled(c: PixelCanvas, scale: number, bg = 0, level = 1, detail?: Detail, overlay?: ReadonlyArray<Tag>): Buffer {
  const s = Math.max(1, Math.floor(scale));
  const w = c.w * s;
  const h = c.h * s;
  const stride = 1 + 3 * w;
  const raw = Buffer.alloc(h * stride);
  // Rows under a tag are written out in full so it can be painted on them,
  // and so is the row below each tag: it can't repeat a painted row.
  let full: Uint8Array | null = null;
  if (overlay?.length) {
    full = new Uint8Array(h);
    for (const t of overlay) {
      const x = Math.floor(t.x);
      const y = Math.floor(t.y);
      const box = tagSize(t.text, t.scale);
      if (x >= w || x + box.w <= 0) continue;
      full.fill(1, Math.max(0, y), Math.max(0, Math.min(h, y + box.h + 1)));
    }
  }
  let textured = false;
  for (let y = 0; y < h; y++) {
    const row = y * stride;
    const ky = y % s;
    const src = Math.floor(y / s) * c.w;
    if (ky === 0 && detail) {
      textured = false;
      for (let x = 0; x < c.w && !textured; x++) if (detail.idx[src + x]) textured = true;
    }
    if (ky !== 0 && !textured) {
      // Same as the row above, or under a tag a copy of the block's first
      // row, which holds the bare pixels until the tags go on at the end.
      const first = row - ky * stride;
      if (full?.[y]) raw.copy(raw, row + 1, first + 1, first + stride);
      else raw[row] = 2;
      continue;
    }
    for (let x = 0, o = row + 1; x < c.w; x++) {
      const v = c.data[src + x];
      const p = v === CLEAR ? bg : v;
      const r = (p >> 16) & 255;
      const g = (p >> 8) & 255;
      const b = p & 255;
      const pat = textured ? detail!.pats[detail!.idx[src + x]] : null;
      for (let k = 0; k < s; k++, o += 3) {
        if (pat) {
          const m = pat[ky * s + k];
          raw[o] = Math.min(255, r * m) | 0;
          raw[o + 1] = Math.min(255, g * m) | 0;
          raw[o + 2] = Math.min(255, b * m) | 0;
        } else {
          raw[o] = r;
          raw[o + 1] = g;
          raw[o + 2] = b;
        }
      }
    }
  }
  if (overlay) for (const t of overlay) paintTag(raw, w, h, t);
  return png(w, h, raw, level);
}

// Paints a tag into unfiltered RGB rows (filter byte first), clipped to the
// image. Only touches its box, which encodePngScaled wrote out in full.
function paintTag(raw: Buffer, w: number, h: number, t: Tag): void {
  const stride = 1 + 3 * w;
  const x = Math.floor(t.x);
  const y = Math.floor(t.y);
  const s = Math.max(1, Math.floor(t.scale ?? 1));
  if (t.bg !== undefined) {
    const a = t.bgAlpha === undefined ? 1 : Math.max(0, Math.min(1, t.bgAlpha));
    const r = ((t.bg >> 16) & 255) * a;
    const g = ((t.bg >> 8) & 255) * a;
    const b = (t.bg & 255) * a;
    const keep = 1 - a;
    const box = tagSize(t.text, s);
    const x0 = Math.max(0, x);
    const x1 = Math.min(w, x + box.w);
    const y1 = Math.min(h, y + box.h);
    for (let py = Math.max(0, y); py < y1; py++) {
      for (let px = x0, o = py * stride + 1 + 3 * x0; px < x1; px++, o += 3) {
        raw[o] = raw[o] * keep + r + 0.5;
        raw[o + 1] = raw[o + 1] * keep + g + 0.5;
        raw[o + 2] = raw[o + 2] * keep + b + 0.5;
      }
    }
  }
  // Font pixel (fx, fy), counted from the box's top-left, as an s x s block.
  const ink = (v: number) => (fx: number, fy: number) => {
    for (let py = y + fy * s; py < y + (fy + 1) * s; py++) {
      if (py < 0 || py >= h) continue;
      for (let px = x + fx * s; px < x + (fx + 1) * s; px++) {
        if (px < 0 || px >= w) continue;
        const o = py * stride + 1 + 3 * px;
        raw[o] = (v >> 16) & 255;
        raw[o + 1] = (v >> 8) & 255;
        raw[o + 2] = v & 255;
      }
    }
  };
  if (t.shadow !== undefined) plotText(TAG_PAD + 1, TAG_PAD + 1, t.text, ink(t.shadow));
  plotText(TAG_PAD, TAG_PAD, t.text, ink(t.color));
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
