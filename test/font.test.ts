import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADVANCE, GLYPH_H, GLYPH_W, drawText, glyph, textWidth } from '../src/iso/font.ts';
import { PixelCanvas, CLEAR } from '../src/iso/canvas.ts';

const SYMBOLS = [...'✎▤◎▶≋⇢…»✔◌✖·'];
const PRINTABLE = Array.from({ length: 94 }, (_, i) => String.fromCharCode(33 + i));

test('every printable character and activity mark has a glyph inside its cell', () => {
  for (const ch of [...PRINTABLE, ...SYMBOLS]) {
    const g = glyph(ch);
    assert.ok(g, `no glyph for ${ch}`);
    assert.equal(g.length, GLYPH_H);
    assert.ok(g.some((r) => r !== 0), `${ch} is blank`);
    for (const r of g) assert.equal(r & ~((1 << GLYPH_W) - 1), 0, `${ch} spills out of ${GLYPH_W} columns`);
    // Only descenders reach below the baseline, and marks stay above it.
    if (g[GLYPH_H - 1]) assert.ok('gjpqy,;_'.includes(ch), `${ch} has a descender`);
  }
  assert.ok(glyph(' ')!.every((r) => r === 0));
  assert.equal(glyph('é'), null);
  assert.equal(glyph('ab'), null);
});

test('look-alike characters are told apart', () => {
  const key = (ch: string) => glyph(ch)!.join(',');
  const groups = ['l1I|i', 'O0oQD', 'S5$', 'B8', 'Z2', 'G6', 'gq9y', 'pP', 'xX✖', '.·…', ',;'];
  for (const group of groups) {
    const shapes = new Set([...group].map(key));
    assert.equal(shapes.size, [...group].length, `${group} has duplicate shapes`);
  }
  // Lowercase is shorter than capitals: no top-row pixels.
  for (const ch of 'acemnorsuvwxz') assert.equal(glyph(ch)![0] | glyph(ch)![1], 0, ch);
});

test('text width is 6 px a character without the trailing gap', () => {
  assert.equal(ADVANCE, 6);
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('a'), 5);
  assert.equal(textWidth('abc'), 17);
  assert.equal(textWidth('✎ atlas'), 41, 'symbols count as one character');
});

// Lit pixels of a canvas as "x,y" strings.
function lit(c: PixelCanvas, v: number): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) if (c.data[y * c.w + x] === v) out.add(`${x},${y}`);
  return out;
}

test('drawText draws glyph pixels, a down-right shadow and a padded box', () => {
  const c = new PixelCanvas(20, 14);
  drawText(c, 2, 3, 'T', 0xffffff, { shadow: 0x000001, bg: 0x202020, pad: 2 });
  // 'T': a full top bar and a centre stem.
  const ink = lit(c, 0xffffff);
  assert.equal(ink.size, 5 + 6);
  for (let x = 2; x < 7; x++) assert.ok(ink.has(`${x},3`));
  for (let y = 4; y < 10; y++) assert.ok(ink.has(`4,${y}`));
  // The shadow shows wherever a pixel up-left is lit but it isn't.
  const shade = lit(c, 0x000001);
  assert.ok(shade.has('7,4') && shade.has('5,10') && shade.has('5,5'));
  assert.ok(!shade.has('4,4'), 'text wins over its shadow');
  // Box: 5 px of text + 2 px pad either side, glyph height + 2 px pad.
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      const inBox = x >= 0 && x < 9 && y >= 1 && y < 1 + GLYPH_H + 4;
      assert.equal(c.data[y * c.w + x] !== CLEAR, inBox, `${x},${y}`);
    }
  }
});

test('unknown characters draw as a box', () => {
  const a = new PixelCanvas(6, 8);
  const b = new PixelCanvas(6, 8);
  drawText(a, 0, 0, '☃', 0xffffff);
  drawText(b, 0, 0, '\u{1f600}', 0xffffff);
  assert.ok(lit(a, 0xffffff).size > 8);
  assert.deepEqual(a.data, b.data, 'astral characters too, one box each');
  assert.equal(textWidth('\u{1f600}'), 5);
});

test('drawText clips at every edge', () => {
  const c = new PixelCanvas(12, 6);
  const text = 'Hey, gjpqy ✖ · ok';
  for (const [x, y] of [[-20, -5], [-3, -2], [8, 3], [11, 5], [-100, 0], [0, 100], [5.7, -1.2]]) {
    drawText(c, x, y, text, 0xffffff, { shadow: 0, bg: 0x404040, pad: 3 });
  }
  assert.equal(c.data.length, 12 * 6);
  // Drawn half off the left edge, the visible part matches the same text
  // drawn whole on a wider canvas.
  const part = new PixelCanvas(12, 9);
  const whole = new PixelCanvas(24, 9);
  drawText(part, -6, 0, 'AB', 0xffffff, { shadow: 1 });
  drawText(whole, 0, 0, 'AB', 0xffffff, { shadow: 1 });
  for (let y = 0; y < 9; y++) for (let x = 0; x < 12; x++) assert.equal(part.data[y * 12 + x], whole.data[y * 24 + x + 6], `${x},${y}`);
});
