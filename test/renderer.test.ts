import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Screen } from '../src/term/screen.ts';
import { Renderer, detectColorMode } from '../src/term/renderer.ts';

function sample(): Screen {
  const s = new Screen(3, 2);
  s.clear([0, 0, 0], [255, 255, 255]);
  s.text(0, 0, 'abc');
  s.text(0, 1, 'def');
  return s;
}

test('first render paints every cell in truecolor', () => {
  const out = new Renderer('truecolor').render(sample());
  for (const ch of 'abcdef') assert.ok(out.includes(ch), ch);
  assert.ok(out.includes('38;2;255;255;255'));
  assert.ok(out.includes('48;2;0;0;0'));
});

test('identical frame renders nothing', () => {
  const r = new Renderer('truecolor');
  r.render(sample());
  assert.equal(r.render(sample()), '');
});

test('single changed cell is addressed and emitted alone', () => {
  const r = new Renderer('truecolor');
  r.render(sample());
  const next = sample();
  next.put(2, 1, 'Z');
  const out = r.render(next);
  assert.ok(out.includes('\x1b[2;3H'), JSON.stringify(out));
  assert.ok(out.includes('Z'));
  for (const ch of 'abcdef') assert.ok(!out.includes(ch), `unexpected ${ch}`);
});

test('256 color mode uses palette SGR', () => {
  const out = new Renderer('256').render(sample());
  assert.ok(out.includes('38;5;'));
  assert.ok(!out.includes('38;2;'));
});

test('size change or invalidate forces full render', () => {
  const r = new Renderer('truecolor');
  r.render(sample());
  const bigger = new Screen(4, 2);
  bigger.text(0, 0, 'wxyz');
  assert.ok(r.render(bigger).includes('wxyz'));
  r.invalidate();
  assert.ok(r.render(bigger).includes('wxyz'));
});

test('detectColorMode reads COLORTERM', () => {
  assert.equal(detectColorMode({ COLORTERM: 'truecolor' }), 'truecolor');
  assert.equal(detectColorMode({ COLORTERM: '24bit' }), 'truecolor');
  assert.equal(detectColorMode({ TERM: 'xterm-256color' }), '256');
});

test('renderLines emits one ANSI line per row without cursor moves', async () => {
  const { renderLines } = await import('../src/term/renderer.ts');
  const out = renderLines(sample(), 'truecolor');
  const lines = out.split('\n');
  assert.equal(lines.length, 2);
  assert.ok(!/\x1b\[\d+;\d+H/.test(out));
  assert.equal(lines[0].replace(/\x1b\[[0-9;]*m/g, ''), 'abc');
  assert.ok(lines[1].endsWith('\x1b[0m'));
});

test('detectPixelMode picks sextants only where terminals draw them', async () => {
  const { detectPixelMode } = await import('../src/term/renderer.ts');
  assert.equal(detectPixelMode({ ALACRITTY_WINDOW_ID: '1' }), 'sextant');
  assert.equal(detectPixelMode({ TERM: 'xterm-kitty' }), 'sextant');
  assert.equal(detectPixelMode({ TERM_PROGRAM: 'WezTerm' }), 'sextant');
  assert.equal(detectPixelMode({ GHOSTTY_RESOURCES_DIR: '/x' }), 'sextant');
  assert.equal(detectPixelMode({ TERM: 'foot' }), 'sextant');
  assert.equal(detectPixelMode({ TERM: 'xterm-256color' }), 'half');
  assert.equal(detectPixelMode({ TERM_PROGRAM: 'Apple_Terminal' }), 'half');
});
