import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { POP_STEPS, deskSprite, deskStats } from '../src/art/scene/desk.ts';
import { drawScreen } from '../src/art/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Screen } from '../src/world/frame.ts';
import type { Quad } from '../src/worlds/types.ts';
import { plainWorkstation } from '../src/worlds/workstation.ts';

// The shared activity layer on a workstation's screen, and workstations as
// sprites: drawn once for what they show, kept, placed again for free.

const SCREENS: Screen[] = ['write', 'read', 'search', 'run', 'web', 'think', 'talk', 'off'];
const QUAD: Quad = [[1, 1, 1], [9, 1, 1], [9, 1, 7], [1, 1, 7]];
const hash = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

test('the activity layer draws each activity its own way, inside the screen', () => {
  const s = 8;
  const seen = new Map<string, Screen>();
  for (const kind of SCREENS) {
    for (const wall of ['right', 'left'] as const) {
      const c = new Canvas(200, 200);
      const at = frame(project(100, 60, s), wall, 0, 0);
      drawScreen(c, at, QUAD, kind, '#2b2233');
      // Inside the screen's outline on the canvas, a pixel of ink allowed.
      const pts = QUAD.map((p) => at(...p));
      const [x0, x1] = [Math.min(...pts.map((p) => p[0])) - 2, Math.max(...pts.map((p) => p[0])) + 2];
      const [y0, y1] = [Math.min(...pts.map((p) => p[1])) - 2, Math.max(...pts.map((p) => p[1])) + 2];
      let n = 0;
      for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
          if (!c.data[(y * c.width + x) * 4 + 3]) continue;
          n++;
          assert.ok(x >= x0 && x <= x1 && y >= y0 && y <= y1, `${kind} ${wall}: painted at ${x},${y}, off the screen`);
        }
      }
      assert.ok(n > 100, `${kind} ${wall}: ${n} pixels`);
      if (wall === 'right') {
        const h = hash(c);
        assert.ok(!seen.has(h), `${kind} looks like ${seen.get(h)}`);
        seen.set(h, kind);
      }
    }
  }
});

test('a workstation sprite is drawn once for what it shows and kept: the same key, the same pixels', () => {
  const cafe = getTheme('cafe')!;
  const ink = '#2f1d18';
  const d = { wall: 'right' as const, screen: 'write' as Screen, grow: 1, seed: 1 };
  const m = deskStats.misses;
  const a = deskSprite(cafe, d, 4, ink);
  assert.equal(deskStats.misses, m + 1);
  assert.equal(deskSprite(cafe, { ...d }, 4, ink), a, 'drawn again');
  assert.equal(deskStats.misses, m + 1);
  // What it shows makes another picture: its screen, its frame, its scale
  // (and its look, where the world draws more than one).
  const others = [{ ...d, screen: 'run' as Screen }, { ...d, wall: 'left' as const }].map((o) => deskSprite(cafe, o, 4, ink));
  others.push(deskSprite(cafe, d, 8, ink));
  for (const o of others) assert.notEqual(hash(o.img), hash(a.img));
  // Popping up: a picture a step, growing out of the floor and a little
  // past its size; all of them alike for every workstation.
  const steps = Array.from({ length: POP_STEPS }, (_, k) => deskSprite(cafe, { ...d, grow: (k + 1) / POP_STEPS }, 4, ink));
  assert.equal(steps[POP_STEPS - 1], a);
  assert.ok(steps[0].img.height < a.img.height, 'the first step is not smaller');
  assert.ok(Math.max(...steps.map((p) => p.img.height)) > a.img.height, 'it does not grow past its size');
  assert.equal(new Set(steps).size, POP_STEPS);
  assert.equal(deskSprite(cafe, { ...d, grow: 0.21 }, 4, ink), steps[0], 'a step between steps');
});

test('the plain workstation, for a world with none of its own, takes the world\'s colours', () => {
  const cafe = getTheme('cafe')!;
  const mines = getTheme('mines')!;
  const draw = (w: typeof cafe) => {
    const c = new Canvas(160, 160);
    plainWorkstation(w).draw({ pen: c, s: 8, at: frame(project(80, 50, 8), 'right', 0, 0), len: 7, dep: 3, wall: 'right', island: true, t: 0, active: true, seed: 0 });
    return hash(c);
  };
  assert.notEqual(draw(cafe), draw(mines));
});
