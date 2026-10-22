import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
import { PixelCanvas, CLEAR, sextantPattern } from '../src/iso/canvas.ts';
import { Iso } from '../src/iso/projection.ts';
import { encodePng } from '../src/iso/png.ts';
import { drawBox, shade } from '../src/iso/box.ts';
import type { Box, Face } from '../src/iso/box.ts';
import { Screen } from '../src/term/screen.ts';
import type { RGB } from '../src/term/color.ts';

const RED: RGB = [255, 0, 0];
const BLUE: RGB = [0, 0, 255];
const GREEN: RGB = [0, 200, 0];

test('canvas set/get ignores out of bounds', () => {
  const c = new PixelCanvas(3, 2);
  c.set(1, 1, RED);
  c.set(-1, 0, RED);
  c.set(3, 0, RED);
  assert.deepEqual(c.get(1, 1), RED);
  assert.equal(c.get(0, 0), null);
  assert.equal(c.get(9, 9), null);
});

test('canvas blend mixes toward a colour', () => {
  const c = new PixelCanvas(1, 1);
  c.clear([0, 0, 0]);
  c.blend(0, 0, [200, 100, 50], 0.5);
  assert.deepEqual(c.get(0, 0), [100, 50, 25]);
});

test('sprite blit honours anchor and transparency', () => {
  const c = new PixelCanvas(5, 5);
  c.clear(BLUE);
  c.sprite({ w: 2, h: 2, px: [[RED, null], [null, RED]], ax: 1, ay: 1 }, 2, 2);
  assert.deepEqual(c.get(1, 1), RED);
  assert.deepEqual(c.get(2, 1), BLUE);
  assert.deepEqual(c.get(2, 2), RED);
});

test('blit packs two pixels per cell with the upper half block', () => {
  const c = new PixelCanvas(2, 4);
  c.clear(GREEN);
  c.set(0, 0, RED);
  c.set(0, 1, BLUE);
  const s = new Screen(4, 3);
  c.blit(s, { x: 1, y: 1, w: 2, h: 2 });
  assert.equal(s.charAt(1, 1), '▀');
  assert.deepEqual(s.fgAt(1, 1), RED);
  assert.deepEqual(s.bgAt(1, 1), BLUE);
  assert.equal(s.charAt(2, 1), ' ');
  assert.deepEqual(s.bgAt(2, 1), GREEN);
  assert.equal(s.charAt(0, 0), ' ');
});

test('cleared pixels blit as the fallback colour', () => {
  const c = new PixelCanvas(1, 2);
  c.data.fill(CLEAR);
  const s = new Screen(1, 1);
  c.blit(s, { x: 0, y: 0, w: 1, h: 1 }, [9, 9, 9]);
  assert.deepEqual(s.bgAt(0, 0), [9, 9, 9]);
});

test('iso projection axes and inverse', () => {
  const iso = new Iso(8, 20, 10);
  assert.equal(iso.hh, 4);
  assert.deepEqual(iso.toScreen(1, 0, 0), [24, 12]);
  assert.deepEqual(iso.toScreen(0, 1, 0), [16, 12]);
  assert.deepEqual(iso.toScreen(0, 0, 1), [20, 6]);
  for (const [gx, gy, gz] of [[0, 0, 0], [3.5, 1.25, 0], [2, 7, 1.5]]) {
    const [sx, sy] = iso.toScreen(gx, gy, gz);
    const [bx, by] = iso.floorAt(sx, sy, gz);
    assert.ok(Math.abs(bx - gx) < 1e-9 && Math.abs(by - gy) < 1e-9);
  }
});

test('png encoder writes a valid RGB image', () => {
  const c = new PixelCanvas(3, 2);
  c.clear(RED);
  const png = encodePng(c, 2);
  assert.deepEqual([...png.subarray(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(png.readUInt32BE(16), 6);
  assert.equal(png.readUInt32BE(20), 4);
  let off = 8;
  const idat: Buffer[] = [];
  while (off < png.length) {
    const len = png.readUInt32BE(off);
    const type = png.subarray(off + 4, off + 8).toString('ascii');
    if (type === 'IDAT') idat.push(png.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  assert.equal(raw.length, 4 * (1 + 3 * 6));
  assert.deepEqual([...raw.subarray(1, 4)], [255, 0, 0]);
});

const BOX: Box = { a: 0, b: 0, z: 0, len: 1, dep: 1, h: 1, color: [200, 100, 50] };

test('boxes shade top, front and side on the right wall', () => {
  const c = new PixelCanvas(40, 40);
  const iso = new Iso(8, 20, 20);
  drawBox(c, iso, BOX, { wall: 'right', along: 2, out: 2 });
  assert.deepEqual(c.get(20, 26), shade(BOX.color, 'top'));
  assert.deepEqual(c.get(17, 28), shade(BOX.color, 'front'));
  assert.deepEqual(c.get(22, 28), shade(BOX.color, 'side'));
  assert.notDeepEqual(shade(BOX.color, 'front'), shade(BOX.color, 'side'));
});

test('on the left wall the room-facing side is screen-right', () => {
  const c = new PixelCanvas(40, 40);
  const iso = new Iso(8, 20, 20);
  drawBox(c, iso, BOX, { wall: 'left', along: 2, out: 2 });
  assert.deepEqual(c.get(22, 28), shade(BOX.color, 'front'));
  assert.deepEqual(c.get(17, 28), shade(BOX.color, 'side'));
});

test('paint receives face coordinates and null leaves pixels clear', () => {
  const c = new PixelCanvas(40, 40);
  c.data.fill(CLEAR);
  const iso = new Iso(8, 20, 20);
  const seen: Array<[Face, number, number]> = [];
  drawBox(c, iso, { ...BOX, len: 2, h: 2, paint: (f, u, v) => { seen.push([f, u, v]); return f === 'side' ? null : undefined; } }, { wall: 'right', along: 2, out: 2 });
  const front = seen.filter(([f]) => f === 'front');
  assert.ok(front.length > 0);
  for (const [, u, v] of front) assert.ok(u >= 0 && u < 2 && v >= 0 && v < 2, `${u},${v}`);
  assert.ok(seen.some(([f]) => f === 'top') && seen.some(([f]) => f === 'side'));
  assert.equal(c.get(26, 28), null, 'side pixels painted null stay clear');
});

test('boxes draw only inside their projected bounds', () => {
  const c = new PixelCanvas(60, 60);
  c.data.fill(CLEAR);
  const iso = new Iso(8, 30, 30);
  drawBox(c, iso, { ...BOX, len: 2, dep: 1, h: 1.5 }, { wall: 'right', along: 1, out: 1 });
  const corners = [];
  for (const gx of [1, 3]) for (const gy of [1, 2]) for (const gz of [0, 1.5]) corners.push(iso.toScreen(gx, gy, gz));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 60; x++) {
    if (c.get(x, y) === null) continue;
    assert.ok(x >= Math.floor(Math.min(...xs)) && x <= Math.ceil(Math.max(...xs)) && y >= Math.floor(Math.min(...ys)) && y <= Math.ceil(Math.max(...ys)), `${x},${y}`);
  }
});

test('plain boxes get rim highlights and a contact shadow, not one flat tone', () => {
  const c = new PixelCanvas(80, 80);
  c.data.fill(CLEAR);
  const iso = new Iso(16, 40, 30);
  drawBox(c, iso, { a: 0, b: 0, z: 0, len: 2, dep: 1, h: 2, color: [160, 120, 90] }, { wall: 'right', along: 1, out: 1 });
  const tones = new Set<string>();
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) { const p = c.get(x, y); if (p) tones.add(p.join(',')); }
  assert.ok(tones.size >= 6, `${tones.size} tones`);
});

test('iso projection honours a vertical pixel aspect', () => {
  const iso = new Iso(16, 50, 40, 0.75);
  assert.equal(iso.hx, 8);
  assert.equal(iso.hy, 6);
  assert.deepEqual(iso.toScreen(1, 0, 0), [58, 43]);
  assert.deepEqual(iso.toScreen(0, 0, 1), [50, 34]);
  for (const [gx, gy, gz] of [[0, 0, 0], [3.5, 1.25, 0.7], [2, 7, 1.5]]) {
    const [sx, sy] = iso.toScreen(gx, gy, gz);
    const [bx, by] = iso.floorAt(sx, sy, gz);
    assert.ok(Math.abs(bx - gx) < 1e-9 && Math.abs(by - gy) < 1e-9);
  }
});

test('boxes keep their faces under a vertical pixel aspect', () => {
  const c = new PixelCanvas(80, 80);
  c.data.fill(CLEAR);
  const iso = new Iso(16, 40, 30, 0.75);
  drawBox(c, iso, { ...BOX, len: 1, dep: 1, h: 1 }, { wall: 'right', along: 1, out: 1 });
  const [tx, ty] = iso.toScreen(1.5, 1.5, 1);
  assert.deepEqual(c.get(Math.floor(tx), Math.floor(ty)), shade(BOX.color, 'top'));
  const [fx, fy] = iso.toScreen(1.5, 2, 0.5);
  assert.deepEqual(c.get(Math.floor(fx) - 1, Math.floor(fy)), shade(BOX.color, 'front'));
  const [sx, sy] = iso.toScreen(2, 1.5, 0.5);
  assert.deepEqual(c.get(Math.floor(sx) + 1, Math.floor(sy)), shade(BOX.color, 'side'));
});

function sextantCell(c: PixelCanvas, s: Screen, cx: number, cy: number): void {
  const bits = sextantPattern(s.charAt(cx, cy));
  assert.ok(bits >= 0, `cell ${cx},${cy} is not a sextant`);
  for (let k = 0; k < 6; k++) {
    const want = c.get(cx * 2 + (k % 2), cy * 3 + Math.floor(k / 2));
    const got = bits & (1 << k) ? s.fgAt(cx, cy) : s.bgAt(cx, cy);
    assert.deepEqual(got, want, `cell ${cx},${cy} sub-pixel ${k}`);
  }
}

test('sextant blit reproduces two-colour cells exactly', () => {
  const c = new PixelCanvas(8, 6);
  c.clear(BLUE);
  c.set(0, 0, RED); // top-left only
  c.set(2, 0, RED); c.set(2, 1, RED); c.set(2, 2, RED); // left column
  c.set(5, 1, RED); c.set(4, 2, RED); // diagonal-ish
  for (let x = 6; x < 8; x++) for (let y = 0; y < 3; y++) c.set(x, y, GREEN); // full
  const s = new Screen(4, 2);
  c.blitSextant(s, { x: 0, y: 0, w: 4, h: 2 });
  assert.equal(s.charAt(0, 0), '\u{1fb00}');
  for (let cx = 0; cx < 4; cx++) for (let cy = 0; cy < 2; cy++) sextantCell(c, s, cx, cy);
  assert.equal(s.charAt(3, 0), ' ');
  assert.deepEqual(s.bgAt(3, 0), GREEN);
});

test('sextant blit keeps the two dominant colours of busy cells', () => {
  const c = new PixelCanvas(2, 3);
  const DARK: RGB = [10, 10, 10];
  c.clear([220, 180, 150]);
  c.set(0, 0, DARK); c.set(0, 1, DARK); c.set(1, 2, [200, 40, 40]);
  const s = new Screen(1, 1);
  c.blitSextant(s, { x: 0, y: 0, w: 1, h: 1 });
  const used = [s.fgAt(0, 0), s.bgAt(0, 0)].map((x) => x.join(','));
  assert.ok(used.includes('220,180,150') && used.includes('10,10,10'), used.join(' / '));
});

test('every sextant glyph is a single narrow character', async () => {
  const { isWide } = await import('../src/term/width.ts');
  for (let cp = 0x1fb00; cp <= 0x1fb3b; cp++) assert.equal(isWide(String.fromCodePoint(cp)), false);
});

test('sextantPattern inverts every sextant glyph and rejects text', () => {
  const s = new Screen(64, 1);
  const c = new PixelCanvas(128, 3);
  for (let p = 0; p < 64; p++) for (let k = 0; k < 6; k++) c.set(p * 2 + (k % 2), Math.floor(k / 2), p & (1 << k) ? [255, 255, 255] : [0, 0, 0]);
  c.blitSextant(s, { x: 0, y: 0, w: 64, h: 1 });
  for (let p = 0; p < 64; p++) sextantCell(c, s, p, 0);
  assert.equal(sextantPattern('a'), -1);
  assert.equal(sextantPattern('▀'), -1);
});

test('sextantPattern rejects the empty string', () => {
  assert.equal(sextantPattern(''), -1);
});
