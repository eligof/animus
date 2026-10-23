import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CLEAR, PixelCanvas } from '../src/iso/canvas.ts';
import { paintSky } from '../src/cave/sky.ts';
import type { Sky } from '../src/cave/sky.ts';

const SKIES: Sky[] = ['stars', 'embers', 'snow', 'spores', 'beams'];
// The skies with a glow or haze rising from below, which fill the whole void.
const FILLED: Sky[] = ['embers', 'snow', 'spores'];

// A canvas with a solid block in the middle standing for the world.
function scene(): PixelCanvas {
  const c = new PixelCanvas(160, 90);
  for (let y = 30; y < 60; y++) for (let x = 50; x < 110; x++) c.data[y * c.w + x] = 0x405060;
  return c;
}

test('every sky paints some of the void and never the world', () => {
  for (const sky of SKIES) {
    const c = scene();
    paintSky(c, sky, [4, 6, 8], 3.2);
    let painted = 0;
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const v = c.data[y * c.w + x];
        if (y >= 30 && y < 60 && x >= 50 && x < 110) assert.equal(v, 0x405060, `${sky} painted over the world`);
        else if (v !== CLEAR) painted++;
      }
    }
    const share = painted / (c.w * c.h - 60 * 30);
    const ok = FILLED.includes(sky) ? share === 1 : share > 0.001 && share < 0.5;
    assert.ok(ok, `${sky}: ${(share * 100).toFixed(2)} % painted`);
  }
});

test('skies are the same for the same time and move over time, stars excepted', () => {
  for (const sky of SKIES) {
    const a = scene();
    const b = scene();
    const later = scene();
    paintSky(a, sky, [4, 6, 8], 5);
    paintSky(b, sky, [4, 6, 8], 5);
    paintSky(later, sky, [4, 6, 8], 7.5);
    assert.deepEqual(a.data, b.data, `${sky} is not deterministic`);
    const moved = a.data.some((v, i) => v !== later.data[i]);
    assert.ok(moved, `${sky} is frozen`);
  }
  // Stars only twinkle: the set of lit pixels holds still.
  const a = scene();
  const b = scene();
  paintSky(a, 'stars', [0, 0, 0], 1);
  paintSky(b, 'stars', [0, 0, 0], 9);
  const lit = (c: PixelCanvas) => [...c.data.keys()].filter((i) => c.data[i] !== CLEAR && c.data[i] !== 0);
  const la = new Set(lit(a));
  const lb = lit(b).filter((i) => i < 160 * 40); // above the moon
  assert.ok(lb.length > 5 && lb.every((i) => la.has(i)), 'stars moved');
});

test('an empty canvas is left alone', () => {
  for (const sky of SKIES) paintSky(new PixelCanvas(0, 0), sky, [0, 0, 0], 1);
});

type Px = [number, number, number];
const rgb = (v: number): Px => [(v >> 16) & 255, (v >> 8) & 255, v & 255];
const lum = (v: number) => ((v >> 16) & 255) + ((v >> 8) & 255) + (v & 255);

// A sky painted on a canvas that is all void.
function empty(sky: Sky, backdrop: Px, t: number): PixelCanvas {
  const c = new PixelCanvas(160, 90);
  paintSky(c, sky, backdrop, t);
  return c;
}

// Each row's middle colour by brightness (cleared pixels as `fill`): the
// haze, not the motes in it.
function medians(c: PixelCanvas, fill: number): number[] {
  return Array.from({ length: c.h }, (_, y) => {
    const row = Array.from(c.data.subarray(y * c.w, (y + 1) * c.w), (v) => (v === CLEAR ? fill : v));
    return row.sort((a, b) => lum(a) - lum(b))[row.length >> 1];
  });
}

test('snow rises into a cold fog and spores into a faint violet haze, from the bottom edge', () => {
  for (const sky of ['snow', 'spores'] as Sky[]) {
    const m = medians(empty(sky, [4, 6, 8], 3), 0x040608);
    // The backdrop down to the lower part, then brightening row by row.
    for (let y = 0; y < 50; y++) assert.equal(m[y], 0x040608, `${sky}: row ${y} is not the backdrop`);
    for (let y = 60; y < 89; y++) assert.ok(lum(m[y + 1]) >= lum(m[y]), `${sky}: row ${y + 1} is darker than row ${y}`);
    const [r, g, b] = rgb(m[89]);
    if (sky === 'snow') assert.ok(b > g && g > r && b >= 50, `snow's fog is not cold: ${[r, g, b]}`);
    else assert.ok(b > r && r > g && b >= 30 && b < 50, `the spores' haze is not a faint violet: ${[r, g, b]}`);
  }
});

test("the station's moon is grey and cratered, lit from the top left, with no blue in it", () => {
  const c = empty('stars', [0, 0, 0], 2);
  const at = (x: number, y: number) => c.data[y * c.w + x];
  // A patch low in the bottom-right corner, well inside the disc: opaque
  // (no stars through it), grey, never blue, and not one flat tone.
  const patch: number[] = [];
  for (let y = 80; y < 90; y++) for (let x = 128; x < 160; x++) patch.push(at(x, y));
  assert.ok(patch.every((v) => v !== CLEAR && v !== 0), 'the moon does not cover its corner');
  for (const v of patch) {
    const [r, g, b] = rgb(v);
    assert.ok(b <= g && g <= r && r - b < 24, `a blue or coloured moon pixel: ${[r, g, b]}`);
  }
  assert.ok(new Set(patch).size > 20, 'the moon is flat');
  // Its upper-left shoulder is lit; the upper right turns away.
  const near = (x: number, y: number) => {
    let s = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) s += lum(at(x + dx, y + dy));
    return s / 25;
  };
  assert.ok(near(124, 74) > 1.3 * near(155, 70), `not lit from the top left: ${near(124, 74)} vs ${near(155, 70)}`);
});

test("only the station's sky is pin-points: flakes trail a streak, spores are discs", () => {
  // Pixels standing out from their row with nothing lit around them.
  const pins = (sky: Sky) => {
    const c = empty(sky, [0, 0, 0], 4);
    const m = medians(c, 0);
    const lift = (x: number, y: number) => {
      const v = c.data[y * c.w + x];
      return v === CLEAR ? 0 : lum(v) - lum(m[y]);
    };
    let n = 0;
    for (let y = 1; y < c.h - 1; y++) {
      for (let x = 1; x < c.w - 1; x++) {
        if (lift(x, y) < 60) continue;
        let alone = true;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && lift(x + dx, y + dy) > 6) alone = false;
        if (alone) n++;
      }
    }
    return n;
  };
  assert.ok(pins('stars') > 20, 'the station lost its stars');
  assert.equal(pins('snow'), 0, 'snow has pin-points');
  assert.equal(pins('spores'), 0, 'spores have pin-points');
});
