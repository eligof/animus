import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELL_SIZE_QUERY, UNDER_CELLS, deleteImages, imageCommand, parseCellSize, supportsImages } from '../src/term/kitty.ts';
import { DEFAULT, Screen } from '../src/term/screen.ts';
import { Renderer, renderLines } from '../src/term/renderer.ts';

test('kitty images go out in base64 chunks of at most 4096, flagged until the last', () => {
  const data = new Uint8Array(10_000).map((_, i) => (i * 37) & 255);
  const cmd = imageCommand(data, { id: 7, dx: 3, dy: 5 });
  const parts = cmd.split('\x1b\\').filter(Boolean);
  assert.ok(parts.length >= 3);
  assert.match(parts[0], /^\x1b_Ga=T,f=100,i=7,p=1,q=2,C=1,z=-1073741825,X=3,Y=5,m=1;/);
  for (const p of parts.slice(1, -1)) assert.match(p, /^\x1b_Gm=1;/);
  assert.match(parts[parts.length - 1], /^\x1b_Gm=0;/);
  const b64 = parts.map((p) => p.slice(p.indexOf(';') + 1)).join('');
  for (const p of parts) assert.ok(p.slice(p.indexOf(';') + 1).length <= 4096);
  assert.deepEqual(new Uint8Array(Buffer.from(b64, 'base64')), data);
  assert.equal(UNDER_CELLS < -(2 ** 30), true, 'drawn under cell backgrounds');
});

test('a tiny image is still one complete command', () => {
  const cmd = imageCommand(new Uint8Array([1, 2, 3]), { id: 1 });
  assert.equal(cmd.split('\x1b\\').filter(Boolean).length, 1);
  assert.match(cmd, /m=0;AQID\x1b\\$/);
});

test('images can be deleted one by one or all at once', () => {
  assert.equal(deleteImages(3), '\x1b_Ga=d,d=I,i=3,q=2\x1b\\');
  assert.equal(deleteImages(), '\x1b_Ga=d,d=A,q=2\x1b\\');
});

test('image-capable terminals are recognised from their environment', () => {
  assert.equal(supportsImages({ TERM: 'xterm-kitty' }), true);
  assert.equal(supportsImages({ KITTY_WINDOW_ID: '1' }), true);
  assert.equal(supportsImages({ TERM_PROGRAM: 'ghostty' }), true);
  assert.equal(supportsImages({ WEZTERM_PANE: '0' }), true);
  assert.equal(supportsImages({ TERM: 'alacritty', ALACRITTY_WINDOW_ID: '1' }), false);
  assert.equal(supportsImages({ TERM: 'xterm-256color' }), false);
});

test('the cell-size report is parsed out of terminal input', () => {
  assert.equal(CELL_SIZE_QUERY, '\x1b[16t');
  assert.deepEqual(parseCellSize('abc\x1b[6;20;10tq'), { w: 10, h: 20 });
  assert.equal(parseCellSize('\x1b[6;0;10t'), null);
  assert.equal(parseCellSize('nothing'), null);
});

test('punched cells use the terminal default colours', () => {
  const s = new Screen(6, 2);
  s.clear([10, 20, 30]);
  s.punch({ x: 1, y: 0, w: 3, h: 2 });
  assert.equal(s.bg[1], DEFAULT);
  assert.equal(s.bg[0], (10 << 16) | (20 << 8) | 30);
  const out = new Renderer('truecolor').render(s);
  assert.ok(out.includes('39;49m'), 'no default-colour SGR');
  assert.ok(renderLines(s, '256').includes('39;49m'));
  assert.ok(out.includes('48;2;10;20;30'), 'normal cells keep their colour');
});

