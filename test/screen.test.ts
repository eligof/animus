import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hex, mix, scale, hsl, rgbTo256 } from '../src/term/color.ts';
import { isWide } from '../src/term/width.ts';
import { Screen } from '../src/term/screen.ts';

test('hex parses long and short forms', () => {
  assert.deepEqual(hex('#ff8000'), [255, 128, 0]);
  assert.deepEqual(hex('#0af'), [0, 170, 255]);
  assert.deepEqual(hex('102030'), [16, 32, 48]);
});

test('mix interpolates and clamps t', () => {
  assert.deepEqual(mix([0, 0, 0], [200, 100, 50], 0), [0, 0, 0]);
  assert.deepEqual(mix([0, 0, 0], [200, 100, 50], 1), [200, 100, 50]);
  assert.deepEqual(mix([0, 0, 0], [200, 100, 50], 0.5), [100, 50, 25]);
  assert.deepEqual(mix([0, 0, 0], [200, 100, 50], 7), [200, 100, 50]);
});

test('scale multiplies and clamps', () => {
  assert.deepEqual(scale([100, 200, 50], 2), [200, 255, 100]);
  assert.deepEqual(scale([100, 200, 50], 0), [0, 0, 0]);
});

test('hsl produces primary colors', () => {
  assert.deepEqual(hsl(0, 1, 0.5), [255, 0, 0]);
  assert.deepEqual(hsl(120, 1, 0.5), [0, 255, 0]);
  assert.deepEqual(hsl(240, 1, 0.5), [0, 0, 255]);
});

test('rgbTo256 maps to xterm cube and grays', () => {
  assert.equal(rgbTo256([255, 0, 0]), 196);
  assert.equal(rgbTo256([0, 0, 0]), 16);
  const gray = rgbTo256([128, 128, 128]);
  assert.ok(gray >= 232 && gray <= 255, `gray index ${gray}`);
});

test('isWide flags emoji and wide symbols only', () => {
  for (const ch of ['☕', '😀', '⚡', '✨', '⭐', '✅', '漢']) assert.equal(isWide(ch), true, ch);
  for (const ch of ['a', '█', '▄', '─', '╭', '•', 'ᴗ', '≋', '♪', '○']) assert.equal(isWide(ch), false, ch);
});

test('put ignores out-of-bounds writes', () => {
  const s = new Screen(4, 2);
  s.put(-1, 0, 'x');
  s.put(4, 0, 'x');
  s.put(0, 2, 'x');
  assert.equal(s.charAt(0, 0), ' ');
});

test('put with undefined bg keeps existing background', () => {
  const s = new Screen(4, 2);
  s.clear([10, 20, 30]);
  s.put(1, 1, 'a', [255, 255, 255]);
  assert.equal(s.charAt(1, 1), 'a');
  assert.deepEqual(s.bgAt(1, 1), [10, 20, 30]);
  assert.deepEqual(s.fgAt(1, 1), [255, 255, 255]);
  s.put(1, 1, 'b', undefined, [1, 2, 3]);
  assert.deepEqual(s.fgAt(1, 1), [255, 255, 255]);
  assert.deepEqual(s.bgAt(1, 1), [1, 2, 3]);
});

test('text clips at screen width and maxX and returns next x', () => {
  const s = new Screen(6, 1);
  assert.equal(s.text(3, 0, 'hello'), 8);
  assert.equal(s.charAt(5, 0), 'l');
  const t = new Screen(10, 1);
  t.text(0, 0, 'abcdef', undefined, undefined, 0, 3);
  assert.equal(t.charAt(2, 0), 'c');
  assert.equal(t.charAt(3, 0), ' ');
});

test('fill paints a rect', () => {
  const s = new Screen(5, 5);
  s.fill({ x: 1, y: 1, w: 2, h: 2 }, '#', [1, 1, 1], [2, 2, 2]);
  assert.equal(s.charAt(1, 1), '#');
  assert.equal(s.charAt(2, 2), '#');
  assert.equal(s.charAt(3, 3), ' ');
});

test('blendBg and blendFg move toward color', () => {
  const s = new Screen(2, 1);
  s.clear([0, 0, 0], [0, 0, 0]);
  s.blendBg(0, 0, [200, 100, 50], 0.5);
  assert.deepEqual(s.bgAt(0, 0), [100, 50, 25]);
  s.blendFg(0, 0, [200, 200, 200], 0.25);
  assert.deepEqual(s.fgAt(0, 0), [50, 50, 50]);
});

test('text never writes control or wide characters into cells', () => {
  const s = new Screen(10, 1);
  s.text(0, 0, 'a\x1bb\t漢\u200b!');
  assert.equal(s.toText(), 'ab ?!     ');
});

test('isWide covers less common double-width blocks', () => {
  for (const ch of ['\u{17000}', '\u{1B000}', 'ꥠ', '\u{18B00}', '\u{1B170}']) assert.equal(isWide(ch), true, ch.codePointAt(0)!.toString(16));
});
