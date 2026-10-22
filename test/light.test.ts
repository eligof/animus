import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelCanvas, CLEAR } from '../src/iso/canvas.ts';
import { Shader } from '../src/iso/light.ts';
import type { RGB } from '../src/term/color.ts';

const GREY: RGB = [160, 160, 160];

function canvas(w = 60, h = 40, fill: RGB = GREY): PixelCanvas {
  const c = new PixelCanvas(w, h);
  c.clear(fill);
  return c;
}

test('ambient light scales every pixel by its colour', () => {
  const c = canvas();
  new Shader().apply(c, [], { ambient: [128, 255, 64] });
  const [r, g, b] = c.get(30, 20)!;
  assert.ok(Math.abs(r - 80) <= 1, `r ${r}`);
  assert.ok(Math.abs(g - 160) <= 1, `g ${g}`);
  assert.ok(Math.abs(b - 40) <= 1, `b ${b}`);
});

test('a light brightens and tints a pool that fades with distance', () => {
  const c = canvas();
  new Shader().apply(c, [{ x: 30, y: 20, rx: 16, ry: 8, color: [255, 120, 40], intensity: 1 }], { ambient: [100, 100, 100] });
  const centre = c.get(30, 20)!;
  const mid = c.get(38, 20)!;
  const out = c.get(50, 20)!;
  assert.ok(centre[0] > mid[0] && mid[0] > out[0], `falloff ${centre[0]} ${mid[0]} ${out[0]}`);
  assert.ok(centre[0] > centre[2] + 40, `tinted ${centre}`);
  assert.deepEqual(out, [63, 63, 63]);
  // The pool is an ellipse: 8 px down is its edge, 8 px across is not.
  assert.ok(c.get(30, 28)![0] < mid[0]);
});

test('lights above the floor also light what is above the pool', () => {
  const c = canvas();
  new Shader().apply(c, [{ x: 30, y: 30, rx: 10, ry: 5, up: 20, color: [255, 255, 255], intensity: 1 }], { ambient: [100, 100, 100] });
  assert.ok(c.get(30, 15)![0] > 70, 'nothing lit above the pool');
  assert.deepEqual(c.get(30, 2), [63, 63, 63]);
});

test('clear pixels stay clear', () => {
  const c = new PixelCanvas(20, 20);
  c.set(5, 5, GREY);
  new Shader().apply(c, [{ x: 10, y: 10, rx: 30, ry: 30, color: [255, 0, 0], intensity: 1 }], { ambient: [50, 50, 50], haze: 1, bloom: 1, vignette: 1 });
  assert.equal(c.data[0], CLEAR);
  assert.notEqual(c.data[5 * 20 + 5], CLEAR);
});

test('haze tints even black pixels inside a pool', () => {
  const c = canvas(60, 40, [0, 0, 0]);
  new Shader().apply(c, [{ x: 30, y: 20, rx: 16, ry: 8, color: [0, 200, 255], intensity: 1 }], { ambient: [80, 80, 80], haze: 0.5 });
  const p = c.get(30, 20)!;
  assert.ok(p[2] > 30 && p[0] < 10, `haze ${p}`);
  assert.deepEqual(c.get(2, 2), [0, 0, 0]);
});

test('bloom spreads glow from bright coloured pixels, not from white floors', () => {
  const dark: RGB = [20, 20, 30];
  const c = canvas(60, 40, dark);
  for (let y = 18; y < 22; y++) for (let x = 28; x < 32; x++) c.set(x, y, [255, 40, 200]);
  new Shader().apply(c, [], { ambient: [255, 255, 255], bloom: 1 });
  const near = c.get(34, 20)!;
  assert.ok(near[0] > dark[0] + 15, `no glow next to neon: ${near}`);
  assert.deepEqual(c.get(2, 2), dark);

  const w = canvas(60, 40, dark);
  for (let y = 10; y < 30; y++) for (let x = 10; x < 50; x++) w.set(x, y, [235, 235, 235]);
  new Shader().apply(w, [], { ambient: [255, 255, 255], bloom: 1 });
  assert.deepEqual(w.get(8, 20), dark, 'white floor bloomed');
});

test('vignette darkens the corners, not the centre', () => {
  const c = canvas(80, 40);
  new Shader().apply(c, [], { ambient: [255, 255, 255], vignette: 0.6 });
  assert.deepEqual(c.get(40, 20), GREY);
  assert.ok(c.get(0, 0)![0] < 120, `corner ${c.get(0, 0)}`);
});

test('a frame of lighting is cheap at sextant size', () => {
  const c = canvas(400, 171);
  const sh = new Shader();
  const lights = Array.from({ length: 8 }, (_, i) => ({ x: 40 + i * 40, y: 90, rx: 60, ry: 22, up: 40, color: [255, 200, 120] as RGB, intensity: 0.8 }));
  sh.apply(c, lights, { ambient: [120, 110, 140], haze: 0.2, bloom: 0.6, vignette: 0.3 });
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) sh.apply(c, lights, { ambient: [120, 110, 140], haze: 0.2, bloom: 0.6, vignette: 0.3 });
  const ms = (performance.now() - t0) / 20;
  assert.ok(ms < 12, `${ms.toFixed(2)} ms`);
});

test('emissive pixels keep their glow in the dark; pixels drawn after capture are lit normally', () => {
  const neon: RGB = [255, 50, 190];
  const helmet: RGB = [241, 196, 15];
  const c = canvas(60, 40, [40, 40, 50]);
  for (let y = 10; y < 14; y++) for (let x = 10; x < 14; x++) c.set(x, y, neon);
  const sh = new Shader();
  sh.capture(c);
  for (let y = 30; y < 34; y++) for (let x = 40; x < 44; x++) c.set(x, y, helmet); // an actor
  sh.apply(c, [], { ambient: [90, 90, 90], bloom: 1 });
  const lit = c.get(11, 11)!;
  assert.ok(lit[0] > 230 && lit[2] > 160, `neon dimmed: ${lit}`);
  const h = c.get(41, 31)!;
  assert.ok(h[0] < 100, `actor not lit by the grade: ${h}`);
  assert.ok(c.get(46, 31)![0] < 20, `actor bloomed: ${c.get(46, 31)}`);
  assert.ok(c.get(16, 11)![0] > 30, `no glow next to neon: ${c.get(16, 11)}`);
});

test('degenerate lamps are ignored instead of poisoning the light buffer', () => {
  const c = canvas();
  new Shader().apply(c, [{ x: 30, y: 20.5, rx: 0, ry: 0, color: [255, 255, 255], intensity: 1 }, { x: NaN, y: 20, rx: 5, ry: 5, color: [255, 255, 255], intensity: 1 }], { ambient: [255, 255, 255] });
  assert.deepEqual(c.get(30, 20), GREY);
});
