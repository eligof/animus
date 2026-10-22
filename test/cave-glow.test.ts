import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PixelCanvas, CLEAR } from '../src/iso/canvas.ts';
import { Glow, blitSprite, drawParticles } from '../src/cave/glow.ts';
import { depthOf, project } from '../src/cave/types.ts';
import type { Grade, Particle, PointLight, View, WizardSprite } from '../src/cave/types.ts';
import type { RGB } from '../src/term/color.ts';

const pack = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];
const unpack = (v: number): RGB => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const GREY: RGB = [160, 160, 160];
const BACK: RGB = [10, 8, 14];
const VIEW: View = { ox: 0, oy: 0 };
const DARK: Grade = { ambient: [40, 40, 40], illum: 0, bloom: 0, vignette: 0 };

type Frame = { w: number; h: number; albedo: Int32Array; emit: Int32Array; depth: Float32Array; out: PixelCanvas };

function frame(w: number, h: number, fill: RGB | null = GREY): Frame {
  return {
    w,
    h,
    albedo: new Int32Array(w * h).fill(fill ? pack(fill) : CLEAR),
    emit: new Int32Array(w * h),
    depth: new Float32Array(w * h).fill(-Infinity),
    out: new PixelCanvas(w, h),
  };
}

function lightUp(f: Frame, grade: Grade, lights: PointLight[] = [], lit = true, view = VIEW): void {
  new Glow().compose(f.out, f.albedo, f.emit, view, lights, grade, lit, BACK);
}

const at = (f: Frame, x: number, y: number) => f.out.data[y * f.w + x];
const rgb = (f: Frame, x: number, y: number) => unpack(at(f, x, y));

test('ambient scales the albedo', () => {
  const f = frame(40, 30);
  lightUp(f, { ...DARK, ambient: [128, 255, 64] });
  assert.deepEqual(rgb(f, 20, 15), [80, 160, 40]);
  assert.deepEqual(rgb(f, 0, 0), [80, 160, 40]);
});

test('a glowing pixel lights the rock around it, fading with distance', () => {
  const f = frame(120, 80);
  const fire: RGB = [255, 160, 60];
  f.albedo[40 * 120 + 60] = pack(fire);
  f.emit[40 * 120 + 60] = pack(fire);
  lightUp(f, { ...DARK, illum: 1 });
  const base = rgb(f, 5, 5)[0];
  assert.equal(base, 25);
  const r = (dx: number) => rgb(f, 60 + dx, 40)[0];
  assert.ok(r(2) > r(8) && r(8) > r(14) && r(14) >= base, `falloff ${r(2)} ${r(8)} ${r(14)} base ${base}`);
  assert.ok(r(2) > base + 8, `near ${r(2)}`);
  assert.equal(r(40), base);
  // Warm light: red rises more than blue.
  const near = rgb(f, 62, 40);
  assert.ok(near[0] - 25 > 2 * (near[2] - 25), `tint ${near}`);
  // The glowing pixel itself stays at full brightness.
  assert.deepEqual(rgb(f, 60, 40), [255, 185, 69]);
});

test('glowing pixels keep their hue instead of washing out to white', () => {
  const f = frame(80, 60);
  for (let y = 10; y < 50; y++) {
    for (let x = 20; x < 60; x++) {
      f.albedo[y * 80 + x] = pack([255, 106, 26]);
      f.emit[y * 80 + x] = pack([255, 90, 16]);
    }
  }
  lightUp(f, { ambient: [40, 40, 40], illum: 1.5, bloom: 1, vignette: 0 });
  const [r, g, b] = rgb(f, 40, 30);
  assert.equal(r, 255);
  assert.ok(g < 130 && b < 40, `lava ${r},${g},${b}`);
  // The rock next to it is lit orange.
  const rock = rgb(f, 62, 30);
  assert.ok(rock[0] > 100 && rock[0] > rock[2] + 60, `rock ${rock}`);
});

test('a point light lights a tinted pool around its projected position', () => {
  const f = frame(80, 60);
  const view: View = { ox: 10, oy: 20 };
  const light: PointLight = { x: 30, y: 10, z: 5, color: [255, 80, 20], radius: 16, intensity: 1 };
  const [sx, sy] = project(view, light.x, light.y, light.z);
  assert.deepEqual([sx, sy], [30, 35]);
  lightUp(f, DARK, [light], true, view);
  const base = rgb(f, 75, 5);
  assert.deepEqual(base, [25, 25, 25]);
  const centre = rgb(f, 30, 35);
  const mid = rgb(f, 38, 35);
  const edge = rgb(f, 30, 47);
  assert.ok(centre[0] > 150, `centre ${centre}`);
  assert.ok(centre[0] > mid[0] && mid[0] > edge[0] && edge[0] >= base[0], `falloff ${centre} ${mid} ${edge}`);
  assert.ok(centre[0] > centre[2] + 100 && centre[1] > centre[2], `tint ${centre}`);
  assert.deepEqual(rgb(f, 30, 55), base);
  assert.deepEqual(rgb(f, 52, 35), base);
});

test('unlit, a frame is just albedo plus emit', () => {
  const f = frame(10, 4);
  f.albedo[0] = pack([100, 50, 20]);
  f.emit[0] = pack([200, 100, 50]);
  f.albedo[1] = CLEAR;
  f.albedo[2] = CLEAR;
  f.emit[2] = pack([30, 40, 50]);
  const light: PointLight = { x: 2, y: 0, z: 0, color: [255, 0, 0], radius: 20, intensity: 1 };
  lightUp(f, { ambient: [10, 10, 10], illum: 2, bloom: 2, vignette: 1 }, [light], false);
  assert.deepEqual(rgb(f, 0, 0), [255, 150, 70]);
  assert.equal(at(f, 1, 0), CLEAR);
  assert.deepEqual(rgb(f, 2, 0), [30, 40, 50]);
  assert.deepEqual(rgb(f, 5, 2), GREY);
});

test('the void stays clear away from anything that glows', () => {
  // Rock on the left third, void elsewhere; a fire on the far left, a lamp
  // over the rock.
  const w = 150;
  const f = frame(w, 60, null);
  for (let y = 0; y < 60; y++) for (let x = 0; x < 50; x++) f.albedo[y * w + x] = pack(GREY);
  for (let y = 28; y < 32; y++) {
    for (let x = 4; x < 8; x++) {
      f.albedo[y * w + x] = pack([255, 200, 80]);
      f.emit[y * w + x] = pack([255, 160, 40]);
    }
  }
  const lamp: PointLight = { x: 30, y: 0, z: -15, color: [255, 220, 160], radius: 12, intensity: 1 };
  lightUp(f, { ambient: [60, 60, 60], illum: 1, bloom: 1, vignette: 0.3 }, [lamp]);
  for (let y = 0; y < 60; y += 3) for (let x = 80; x < w; x += 3) assert.equal(at(f, x, y), CLEAR, `void at ${x},${y}`);
  assert.notEqual(at(f, 20, 30), CLEAR);
});

test('glow spills a little into the void next to a bright edge', () => {
  const w = 60;
  const f = frame(w, 40, null);
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 30; x++) {
      f.albedo[y * w + x] = pack([255, 106, 26]);
      f.emit[y * w + x] = pack([255, 90, 16]);
    }
  }
  lightUp(f, { ambient: [40, 40, 40], illum: 1, bloom: 1, vignette: 0 });
  const near = rgb(f, 31, 20);
  assert.notEqual(at(f, 31, 20), CLEAR);
  assert.ok(near[0] > BACK[0] + 10 && near[0] < 160, `spill ${near}`);
  assert.ok(near[1] >= BACK[1] && near[2] >= BACK[2], `spill keeps the backdrop ${near}`);
  assert.equal(at(f, 59, 20), CLEAR);
});

test('bloom puts a halo around a bright pixel', () => {
  const f = frame(60, 40, [0, 0, 0]);
  const spark: RGB = [255, 220, 120];
  f.albedo[20 * 60 + 30] = pack(spark);
  f.emit[20 * 60 + 30] = pack(spark);
  lightUp(f, { ambient: [0, 0, 0], illum: 0, bloom: 1, vignette: 0 });
  const r = (dx: number) => rgb(f, 30 + dx, 20)[0];
  assert.equal(r(0), 255);
  assert.ok(r(1) > 30, `halo ${r(1)}`);
  assert.ok(r(1) >= r(3) && r(3) > r(5), `falloff ${r(1)} ${r(3)} ${r(5)}`);
  assert.equal(r(12), 0);
  assert.ok(rgb(f, 30, 22)[0] > 15, 'halo below too');
  // No bloom, no halo.
  lightUp(f, { ambient: [0, 0, 0], illum: 0, bloom: 0, vignette: 0 });
  assert.equal(r(1), 0);
  assert.equal(r(0), 255);
});

test('the vignette darkens the corners, not the centre', () => {
  const f = frame(80, 40);
  lightUp(f, { ambient: [255, 255, 255], illum: 0, bloom: 0, vignette: 0.6 });
  assert.deepEqual(rgb(f, 40, 20), GREY);
  const corner = rgb(f, 0, 0)[0];
  assert.ok(corner < 90, `corner ${corner}`);
  assert.ok(rgb(f, 20, 20)[0] > corner, 'eases in');
});

test('a Glow reused across sizes resizes its buffers', () => {
  const g = new Glow();
  for (const [w, h] of [[30, 20], [64, 41], [7, 5], [64, 41]]) {
    const f = frame(w, h);
    f.emit[0] = pack([255, 255, 255]);
    const light: PointLight = { x: w / 2, y: 0, z: 0, color: [255, 255, 255], radius: 8, intensity: 1 };
    g.compose(f.out, f.albedo, f.emit, VIEW, [light], { ambient: [80, 80, 80], illum: 1, bloom: 1, vignette: 0.3 }, true, BACK);
    for (const v of f.out.data) assert.ok(v >= 0 && v <= 0xffffff, `${w}x${h}: ${v}`);
  }
});

function wizard(): WizardSprite {
  const robe: RGB = [70, 60, 140];
  const eye: RGB = [255, 255, 180];
  const px = Array.from({ length: 4 }, () => [robe, robe, robe] as Array<RGB | null>);
  const glow = Array.from({ length: 4 }, () => [null, null, null] as Array<RGB | null>);
  glow[1][1] = eye;
  return { w: 3, h: 4, px, glow, ax: 1, ay: 3, dx: 0, dy: 0 };
}

test('blitSprite hides a character behind a nearer wall and shows it in front', () => {
  const w = 20;
  const h = 10;
  const albedo = new Int32Array(w * h).fill(pack(GREY));
  const emit = new Int32Array(w * h).fill(pack([200, 80, 20])); // glowing floor
  const depth = new Float32Array(w * h).fill(2);
  for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) depth[y * w + x] = 10; // wall on the left
  const sp = wizard();
  // Behind the wall: nothing drawn.
  blitSprite(albedo, emit, depth, w, h, sp, 5, 6, 5);
  for (let y = 3; y <= 6; y++) for (let x = 4; x <= 6; x++) assert.equal(albedo[y * w + x], pack(GREY));
  // In front of the floor: anchor at (15, 6), so rows 3..6 and columns 14..16.
  blitSprite(albedo, emit, depth, w, h, sp, 15.4, 5.6, 5);
  assert.equal(albedo[6 * w + 15], pack([70, 60, 140]));
  assert.equal(emit[6 * w + 15], 0, 'the robe hides the glow behind it');
  assert.equal(albedo[3 * w + 14], pack([70, 60, 140]));
  assert.equal(albedo[2 * w + 15], pack(GREY));
  // The eye glows.
  assert.equal(albedo[4 * w + 15], pack([255, 255, 180]));
  assert.equal(emit[4 * w + 15], pack([255, 255, 180]));
  // Depth is untouched unless asked for.
  assert.equal(depth[6 * w + 15], 2);
  blitSprite(albedo, emit, depth, w, h, sp, 15, 6, 5, true);
  assert.equal(depth[6 * w + 15], 5);
  // Within half a unit behind the surface still shows (standing on it).
  const d2 = new Float32Array(w * h).fill(5.4);
  const a2 = new Int32Array(w * h);
  blitSprite(a2, new Int32Array(w * h), d2, w, h, sp, 10, 6, 5);
  assert.equal(a2[6 * w + 10], pack([70, 60, 140]));
});

test('blitSprite applies the per-frame offset and clips at the edges', () => {
  const w = 8;
  const h = 6;
  const albedo = new Int32Array(w * h);
  const emit = new Int32Array(w * h);
  const depth = new Float32Array(w * h).fill(-Infinity);
  const sp = { ...wizard(), dx: 2, dy: -1 };
  blitSprite(albedo, emit, depth, w, h, sp, 0, 2, 0);
  // Anchor lands at (2, 1): rows -2..1, columns 1..3.
  assert.equal(albedo[1 * w + 2], pack([70, 60, 140]));
  assert.equal(albedo[0 * w + 1], pack([70, 60, 140]));
  assert.equal(albedo[2 * w + 2], 0);
  assert.equal(albedo[0 * w + 4], 0);
  blitSprite(albedo, emit, depth, w, h, sp, -10, -10, 0);
  blitSprite(albedo, emit, depth, w, h, sp, 50, 50, 0);
});

function particle(p: Partial<Particle>): Particle {
  return { kind: 'spark', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 1, color: [255, 200, 80], glow: true, gravity: 0, ...p };
}

test('drawParticles projects, depth-tests and writes albedo and emit', () => {
  const w = 40;
  const h = 30;
  const view: View = { ox: 20, oy: 10 };
  const albedo = new Int32Array(w * h).fill(pack(GREY));
  const emit = new Int32Array(w * h).fill(pack([90, 30, 0]));
  const depth = new Float32Array(w * h).fill(0);
  const spark = particle({ x: 10, y: 5, z: 3 });
  const [sx, sy] = project(view, spark.x, spark.y, spark.z);
  assert.deepEqual([sx, sy], [25, 14.5]);
  const i = 14 * w + 25;
  // A pebble in front: albedo, and it hides the glow behind it.
  const pebble = particle({ kind: 'debris', x: 8, y: 2, z: 1, color: [120, 110, 100], glow: false });
  const [px, py] = project(view, pebble.x, pebble.y, pebble.z);
  const j = Math.floor(py) * w + Math.floor(px);
  // Behind a wall at the spark's pixel.
  const hidden = particle({ x: 4, y: -1, z: -2.5, color: [0, 255, 0] });
  const [hx, hy] = project(view, hidden.x, hidden.y, hidden.z);
  assert.deepEqual([Math.floor(hx), Math.floor(hy)], [25, 14]);
  depth[i] = depthOf(spark.x, spark.y, spark.z) - 0.2;
  drawParticles(albedo, emit, depth, w, h, [spark, pebble, hidden], view);
  assert.equal(albedo[i], pack([255, 200, 80]));
  assert.equal(emit[i], pack([255, 200, 80]));
  assert.equal(albedo[j], pack([120, 110, 100]));
  assert.equal(emit[j], 0);
  // Something nearer than the particle hides it.
  const k = 20 * w + 20;
  const deep = particle({ x: 15, y: 15, z: 5 });
  const [dx, dy] = project(view, deep.x, deep.y, deep.z);
  assert.equal(Math.floor(dy) * w + Math.floor(dx), k);
  depth[k] = 40;
  drawParticles(albedo, emit, depth, w, h, [deep], view);
  assert.equal(albedo[k], pack(GREY));
  // Off-canvas particles are skipped.
  drawParticles(albedo, emit, depth, w, h, [particle({ x: 500, y: 0, z: 0 }), particle({ x: 0, y: 0, z: 900 })], view);
});

test('fast glowing particles leave a dimmer pixel behind them', () => {
  const w = 40;
  const h = 30;
  const view: View = { ox: 20, oy: 10 };
  const albedo = new Int32Array(w * h);
  const emit = new Int32Array(w * h);
  const depth = new Float32Array(w * h).fill(-Infinity);
  // Moving +x at 20 voxels/s: on screen right and down (vx - vy = 20,
  // (vx + vy) / 2 = 10).
  const fast = particle({ x: 10, y: 5, z: 3, vx: 20 });
  drawParticles(albedo, emit, depth, w, h, [fast], view);
  const lit = [...albedo.keys()].filter((i) => albedo[i] !== 0);
  assert.equal(lit.length, 2);
  const head = 14 * w + 25;
  assert.equal(albedo[head], pack([255, 200, 80]));
  const tail = lit.find((i) => i !== head)!;
  assert.equal(tail, 14 * w + 24, 'one pixel back along the motion');
  assert.equal(albedo[tail], pack([127, 100, 40]));
  assert.equal(emit[tail], albedo[tail]);
  // Slow ones are a single pixel.
  albedo.fill(0);
  drawParticles(albedo, emit, depth, w, h, [particle({ x: 10, y: 5, z: 3, vx: 2 })], view);
  assert.equal(albedo.filter((v) => v !== 0).length, 1);
});

test('a busy frame composes within budget', () => {
  const w = 400;
  const h = 180;
  const f = frame(w, h, null);
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - 200) / 180;
      const ny = (y - 90) / 85;
      if (nx * nx + ny * ny > 1) continue;
      const v = 0.8 + rnd() * 0.4;
      f.albedo[y * w + x] = pack([(90 * v) | 0, (80 * v) | 0, (76 * v) | 0]);
      // Lava along the bottom, fungus and crystal patches, sparks anywhere.
      const k = 0.8 + rnd() * 0.2;
      if (y > 140) f.emit[y * w + x] = pack([(255 * k) | 0, (90 * k) | 0, (16 * k) | 0]);
      else if ((x >> 5) % 3 === 0 && (y >> 4) % 2 === 0) f.emit[y * w + x] = pack([31, (138 * k) | 0, 106]);
      else if ((x >> 4) % 5 === 1 && (y >> 3) % 3 === 1) f.emit[y * w + x] = pack([106, 76, (255 * k) | 0]);
      else if (rnd() < 0.05) f.emit[y * w + x] = pack([255, 190, 90]);
    }
  }
  const lights: PointLight[] = Array.from({ length: 20 }, (_, i) => ({
    x: 40 + i * 9,
    y: 10 + (i % 5) * 7,
    z: (i % 3) * 5,
    color: [255, 170 + (i % 4) * 20, 90] as RGB,
    radius: 18 + (i % 4) * 8,
    intensity: 0.8,
  }));
  const view: View = { ox: 180, oy: 30 };
  const grade: Grade = { ambient: [40, 36, 48], illum: 1, bloom: 0.6, vignette: 0.4 };
  const g = new Glow();
  for (let i = 0; i < 60; i++) g.compose(f.out, f.albedo, f.emit, view, lights, grade, true, BACK);
  const runs: number[] = [];
  for (let b = 0; b < 6; b++) {
    const t0 = performance.now();
    for (let i = 0; i < 30; i++) g.compose(f.out, f.albedo, f.emit, view, lights, grade, true, BACK);
    runs.push((performance.now() - t0) / 30);
  }
  runs.sort((a, b) => a - b);
  console.log(`compose 400x180, 20 lights, busy emit: best ${runs[0].toFixed(2)} ms, median ${runs[3].toFixed(2)} ms`);
  // Budget is ~4 ms; the threshold leaves room for busy CI machines.
  assert.ok(runs[0] < 12, `${runs[0].toFixed(2)} ms per frame`);
});
