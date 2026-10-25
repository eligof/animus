// A model kitty terminal for tests (see test/plates.test.ts): it keeps
// pictures, places them over the scene's cells and composites what it
// holds, strictly (whole-number keys, chunking, what is deleted exists).
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { composite } from '../src/art/plate.ts';
import type { Plate } from '../src/art/plate.ts';
import type { Bitmap } from '../src/art/types.ts';
import { UNDER_CELLS } from '../src/term/kitty.ts';

const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';

type Held = { w: number; h: number; data: Uint8ClampedArray };

// A PNG (RGB, or RGBA with straight alpha; filters none, sub and up) back
// to premultiplied pixels, as the terminal composites them.
export function decode(png: Buffer): Held {
  const w = png.readUInt32BE(16);
  const h = png.readUInt32BE(20);
  assert.equal(png[24], 8, 'bit depth');
  assert.ok(png[25] === 2 || png[25] === 6, `colour type ${png[25]}`);
  const bpp = png[25] === 6 ? 4 : 3;
  const parts: Buffer[] = [];
  for (let off = 8; off < png.length; ) {
    const len = png.readUInt32BE(off);
    if (png.subarray(off + 4, off + 8).toString('ascii') === 'IDAT') parts.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(parts));
  const stride = 1 + bpp * w;
  const line = new Uint8Array(bpp * w);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const f = raw[y * stride];
    assert.ok(f <= 2, `filter ${f}`);
    for (let i = 0; i < bpp * w; i++) {
      const v = raw[y * stride + 1 + i];
      line[i] = (v + (f === 1 && i >= bpp ? line[i - bpp] : f === 2 ? line[i] : 0)) & 255;
    }
    for (let x = 0; x < w; x++) {
      const a = bpp === 4 ? line[4 * x + 3] : 255;
      const o = 4 * (y * w + x);
      for (let c = 0; c < 3; c++) data[o + c] = Math.round((line[bpp * x + c] * a) / 255);
      data[o + 3] = a;
    }
  }
  return { w, h, data };
}

// Every key a whole number (Ghostty drops a command with x=1244.5), but
// the action and what to delete.
function keysOf(s: string): Record<string, string> {
  const keys: Record<string, string> = {};
  for (const kv of s.split(',')) {
    const [k, v, more] = kv.split('=');
    assert.ok(k && v !== undefined && more === undefined, `key ${kv}`);
    assert.ok(!(k in keys), `${k} twice`);
    if (k === 'a' || k === 'd') assert.match(v, /^[a-zA-Z]$/);
    else {
      assert.match(v, /^-?\d+$/, `${k}=${v} is not a whole number`);
      assert.ok(+v >= -(2 ** 31) && +v < 2 ** 32, `${k}=${v} out of range`);
    }
    keys[k] = v;
  }
  return keys;
}

type Spot = { i: number; x: number; y: number; sx: number; sy: number; sw: number; sh: number; z: number };

// A model kitty terminal over the scene's cells: it keeps images (a=t,
// a=T), places them at the cursor's cell plus offsets, cut to a source
// rectangle, at a z (a=p, the same image and placement number replacing
// the last), deletes placements and images (a=d, d=i/I/a/A; strict: what
// is deleted must exist), and drops an image's placements when a new
// picture comes under its id, as kitty does. It shows its placements by z
// over the backdrop.
export class Term {
  imgs = new Map<number, Held>();
  spots = new Map<string, Spot>(); // by `image:placement`
  // In the last update: pictures sent and their bytes, placements, deletes.
  sent = 0;
  bytes = 0;
  placed = 0;
  dropped = 0;

  private readonly rect: { x: number; y: number; w: number; h: number };
  private readonly cell: { w: number; h: number };

  // The scene's cells (`rect`) and a cell's size in pixels.
  constructor(rect: { x: number; y: number; w: number; h: number }, cell: { w: number; h: number }) {
    this.rect = rect;
    this.cell = cell;
  }

  play(out: string): void {
    this.sent = this.bytes = this.placed = this.dropped = 0;
    const body = out.startsWith(SYNC_ON) && out.endsWith(SYNC_OFF) ? out.slice(SYNC_ON.length, -SYNC_OFF.length) : out;
    let row = 0;
    let col = 0;
    let pos = 0;
    let open: { keys: Record<string, string>; b64: string } | null = null;
    for (const m of body.matchAll(/\x1b\[(\d+);(\d+)H|\x1b_G([^;\x1b]*)(?:;([^\x1b]*))?\x1b\\/g)) {
      assert.equal(m.index, pos, `stray bytes at ${pos}: ${JSON.stringify(body.slice(pos, pos + 20))}`);
      pos = m.index + m[0].length;
      if (m[1]) {
        assert.equal(open, null, 'the cursor moved inside a chunked command');
        row = +m[1];
        col = +m[2];
        continue;
      }
      const keys = keysOf(m[3]);
      const payload = m[4] ?? '';
      assert.ok(payload.length <= 4096, `a chunk of ${payload.length} bytes`);
      if (open) assert.deepEqual(Object.keys(keys), ['m'], 'a later chunk carries only m');
      else open = { keys, b64: '' };
      open.b64 += payload;
      if (keys.m === '1') continue;
      this.run(open.keys, Buffer.from(open.b64, 'base64'), row, col);
      open = null;
    }
    assert.equal(pos, body.length, 'stray bytes at the end');
    assert.equal(open, null, 'unfinished chunked command');
  }

  private run(k: Record<string, string>, data: Buffer, row: number, col: number): void {
    assert.equal(k.q, '2', 'replies suppressed');
    const i = Number(k.i ?? 0);
    if (k.a === 't' || k.a === 'T') {
      assert.equal(k.f, '100', 'PNG');
      assert.ok(i > 0, 'an image id');
      this.drop(i);
      this.imgs.set(i, decode(data));
      this.sent++;
      this.bytes += data.length;
      if (k.a === 'T') this.place(k, row, col);
    } else if (k.a === 'p') {
      assert.equal(data.length, 0);
      this.place(k, row, col);
    } else if (k.a === 'd') {
      this.dropped++;
      if (k.d === 'a' || k.d === 'A') {
        this.spots.clear();
        if (k.d === 'A') this.imgs.clear();
        return;
      }
      assert.ok(k.d === 'i' || k.d === 'I', `d=${k.d}`);
      assert.ok(this.imgs.has(i), `delete of image ${i}, which is not held`);
      if (k.d === 'i' && k.p) assert.ok(this.spots.delete(`${i}:${k.p}`), `no placement ${i}:${k.p} to delete`);
      else this.drop(i);
      if (k.d === 'I') this.imgs.delete(i);
    } else assert.fail(`a=${k.a}`);
  }

  private drop(i: number): void {
    for (const [key, s] of this.spots) if (s.i === i) this.spots.delete(key);
  }

  private place(k: Record<string, string>, row: number, col: number): void {
    const i = Number(k.i);
    const img = this.imgs.get(i);
    assert.ok(img, `placement of image ${i}, which is not held`);
    assert.ok(Number(k.p) > 0, 'a placement number');
    assert.ok(row > 0 && col > 0, 'the cursor was put first');
    assert.equal(k.C, '1', 'the cursor stays');
    const X = Number(k.X ?? 0);
    const Y = Number(k.Y ?? 0);
    assert.ok(X >= 0 && X < this.cell.w && Y >= 0 && Y < this.cell.h, `offsets ${X}, ${Y} inside a cell`);
    const sx = Number(k.x ?? 0);
    const sy = Number(k.y ?? 0);
    const sw = Number(k.w ?? 0) || img.w - sx;
    const sh = Number(k.h ?? 0) || img.h - sy;
    assert.ok(sx >= 0 && sy >= 0 && sw > 0 && sh > 0 && sx + sw <= img.w && sy + sh <= img.h, 'source rectangle inside the image');
    const x = (col - 1 - this.rect.x) * this.cell.w + X;
    const y = (row - 1 - this.rect.y) * this.cell.h + Y;
    assert.ok(x >= 0 && y >= 0 && x + sw <= this.rect.w * this.cell.w && y + sh <= this.rect.h * this.cell.h, `${sw}x${sh} at ${x}, ${y} leaves the scene`);
    const z = Number(k.z);
    assert.ok(z <= UNDER_CELLS && z >= -(2 ** 31), `z ${z} is not under the text`);
    this.spots.set(`${i}:${k.p}`, { i, x, y, sx, sy, sw, sh, z });
    this.placed++;
  }

  // What shows: the placements by z, each its cut of its image.
  view(p: Plate): Uint8ClampedArray {
    const spots = [...this.spots.values()].sort((a, b) => a.z - b.z);
    for (let k = 1; k < spots.length; k++) assert.notEqual(spots[k].z, spots[k - 1].z, 'two placements share a z');
    const layers = spots.map((s, n) => ({ id: `${n}`, pic: { key: `${n}`, img: this.cut(s) }, x: s.x, y: s.y }));
    return composite({ ...p, layers }).data;
  }

  private cut(s: Spot): Bitmap {
    const img = this.imgs.get(s.i)!;
    const data = new Uint8ClampedArray(s.sw * s.sh * 4);
    for (let y = 0; y < s.sh; y++) {
      const from = 4 * ((s.sy + y) * img.w + s.sx);
      data.set(img.data.subarray(from, from + 4 * s.sw), 4 * y * s.sw);
    }
    return { width: s.sw, height: s.sh, data };
  }
}

export function same(got: Uint8ClampedArray, want: Uint8ClampedArray, width: number, why: string): void {
  if (Buffer.from(got.buffer, got.byteOffset, got.byteLength).equals(Buffer.from(want.buffer, want.byteOffset, want.byteLength))) return;
  let i = 0;
  while (got[i] === want[i]) i++;
  const px = i >> 2;
  assert.fail(`${why}: pixel ${px % width}, ${Math.floor(px / width)} is ${[...got.subarray(4 * px, 4 * px + 4)]}, not ${[...want.subarray(4 * px, 4 * px + 4)]}`);
}

