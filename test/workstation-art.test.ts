import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { frame, project } from '../src/art/iso.ts';
import { ANIM_FPS, framesFor } from '../src/art/motion.ts';
import { Scene } from '../src/art/scene.ts';
import { POP_STEPS, deskSprite, deskStats, loopFrame, loopSprite, screenSprite } from '../src/art/scene/desk.ts';
import { drawScreen } from '../src/art/screen.ts';
import { StressSource } from '../src/demo/stress.ts';
import { Screen as Term } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Screen } from '../src/world/frame.ts';
import { World } from '../src/world/world.ts';
import type { Quad } from '../src/worlds/types.ts';
import { clutterOf, plainWorkstation, workstationOf } from '../src/worlds/workstation.ts';
import { dressed, looped } from './desk-fakes.ts';

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

test('a workstation is pictures kept for what they show: its body (its clutter, lit or not), its screen (one for every desk), its loops', () => {
  const cafe = getTheme('cafe')!;
  const ink = '#2f1d18';
  const d = { id: 0, wall: 'right' as const, screen: 'write' as Screen, grow: 1, seed: 1 };
  const m = deskStats.misses;
  const body = deskSprite(cafe, d, 4, ink);
  assert.equal(deskStats.misses, m + 1);
  assert.equal(deskSprite(cafe, { ...d }, 4, ink), body, 'drawn again');
  // A change of activity: the same body, another screen.
  assert.equal(deskSprite(cafe, { ...d, screen: 'run' }, 4, ink), body, 'a new body for a new activity');
  const scr = screenSprite(cafe, d, 4, ink);
  const neighbour = { ...d, id: 5 };
  assert.equal(screenSprite(cafe, neighbour, 4, ink), scr, 'a screen for each desk');
  assert.notEqual(hash(screenSprite(cafe, { ...d, screen: 'run' }, 4, ink).img), hash(scr.img));
  assert.ok(scr.img.width * scr.img.height * 2 < body.img.width * body.img.height, 'the screen is not small beside the body');
  // The body is another picture off, in the other frame, at another scale.
  assert.notEqual(deskSprite(cafe, { ...d, screen: 'off' }, 4, ink), body, 'the same body off');
  for (const o of [deskSprite(cafe, { ...d, wall: 'left' }, 4, ink), deskSprite(cafe, d, 8, ink)]) assert.notEqual(hash(o.img), hash(body.img));
  // Popping up: a picture a step (body and screen in one), growing out of
  // the floor and a little past its size; the last is the body.
  const steps = Array.from({ length: POP_STEPS }, (_, k) => deskSprite(cafe, { ...d, grow: (k + 1) / POP_STEPS }, 4, ink));
  assert.equal(steps[POP_STEPS - 1], body);
  assert.ok(steps[0].img.height < body.img.height, 'the first step is not smaller');
  assert.ok(Math.max(...steps.map((p) => p.img.height)) > body.img.height, 'it does not grow past its size');
  assert.equal(new Set(steps).size, POP_STEPS);
  assert.equal(deskSprite(cafe, { ...d, grow: 0.21 }, 4, ink), steps[0], 'a step between steps');
  // A popping picture holds the screen, so it changes with the activity.
  assert.notEqual(deskSprite(cafe, { ...d, grow: 0.6 }, 4, ink), deskSprite(cafe, { ...d, grow: 0.6, screen: 'run' }, 4, ink));
});

test("a desk's body carries its place's clutter: places with other picks, other pictures", () => {
  const w = dressed(getTheme('cafe')!);
  const ink = '#2f1d18';
  const d = { wall: 'right' as const, screen: 'write' as Screen, grow: 1, seed: 1 };
  const pick = (id: number) => clutterOf(w, id).map((c) => `${c.item.name}@${c.spot}`).join();
  const other = Array.from({ length: 12 }, (_, id) => id).find((id) => pick(id) !== pick(0))!;
  assert.notEqual(hash(deskSprite(w, { ...d, id: 0 }, 4, ink).img), hash(deskSprite(w, { ...d, id: other }, 4, ink).img));
});

test("a desk's loops run while its agent works, a step apart from desk to desk, and stand on their first frame while it is off", () => {
  const w = looped(getTheme('cafe')!);
  const lp = workstationOf(w).loops![0];
  for (let k = 0; k < 40; k++) assert.equal(loopFrame(lp, 0, 3, false, k * 0.1), 0, 'off, yet moving');
  const n = framesFor(lp.secs);
  const shown = new Set(Array.from({ length: n }, (_, k) => loopFrame(lp, 0, 3, true, (k + 0.5) / ANIM_FPS)));
  assert.equal(shown.size, n, 'a frame skipped');
  assert.ok(new Set(Array.from({ length: 6 }, (_, id) => loopFrame(lp, 0, id, true, 2))).size >= 3, 'neighbours in step');
  const ink = '#2f1d18';
  const a = loopSprite(w, 0, 2, true, 'right', 4, ink);
  assert.equal(loopSprite(w, 0, 2, true, 'right', 4, ink), a, 'drawn again');
  assert.notEqual(hash(loopSprite(w, 0, 3, true, 'right', 4, ink).img), hash(a.img), 'two frames alike');
  assert.notEqual(hash(loopSprite(w, 0, 0, true, 'right', 4, ink).img), hash(loopSprite(w, 0, 0, false, 'right', 4, ink).img), 'lit and unlit alike');
});

// The mines with two at work on each of two leads' teams, settled.
function settled() {
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('mines')!, live: new StressSource(2, 2, start), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.resize(150, 46);
  let t = start;
  for (let i = 0; i < 10 * 18; i++) w.tick((t = start + i * (1000 / 18)));
  w.draw(new Term(150, 46), t);
  return w.scene()!;
}

test('in the plate a standing workstation keeps its pictures from frame to frame; a change of activity changes its screen only', () => {
  const f = settled();
  assert.equal(f.desks!.length, 6);
  const scene = new Scene();
  const keys = (fr: typeof f) => new Map(scene.plate(fr).layers.filter((l) => /^(desk|screen):/.test(l.id)).map((l) => [l.id, l.pic.key]));
  const first = keys(f);
  assert.equal(first.size, 12);
  assert.deepEqual(keys({ ...f, t: f.t + 0.5 }), first, 'a picture changed with nothing to change it');
  const d = f.desks!.find((x) => x.screen !== 'off')!;
  const next = keys({ ...f, desks: f.desks!.map((x) => (x === d ? { ...x, screen: x.screen === 'web' ? 'read' : 'web' } : x)) });
  for (const [id, key] of first) assert.equal(next.get(id) === key, id !== `screen:${d.id}`, id);
});

test('in the plate each desk shows its loops, their pictures moving on with time only while its screen is on', () => {
  const f = settled();
  const g = { ...f, world: looped(f.world) };
  const scene = new Scene();
  const keys = (fr: typeof g) => new Map(scene.plate(fr).layers.filter((l) => l.id.startsWith('loop:')).map((l) => [l.id, l.pic.key]));
  const now = keys(g);
  assert.equal(now.size, 2 * g.desks!.length);
  const later = keys({ ...g, t: g.t + 1 / 8 });
  for (const d of g.desks!) for (const k of [0, 1]) assert.equal(later.get(`loop:${d.id}:${k}`) !== now.get(`loop:${d.id}:${k}`), d.screen !== 'off', `desk ${d.id} loop ${k}`);
  // One desk's screen turned off: its loops stand still, the others' move.
  const on = g.desks!.filter((x) => x.screen !== 'off');
  assert.ok(on.length >= 2, 'two at work');
  const off = (fr: typeof g) => ({ ...fr, desks: fr.desks!.map((x) => (x === on[0] ? { ...x, screen: 'off' as Screen } : x)) });
  const a = keys(off(g));
  const b = keys(off({ ...g, t: g.t + 1 / 8 }));
  for (const k of [0, 1]) {
    assert.equal(b.get(`loop:${on[0].id}:${k}`), a.get(`loop:${on[0].id}:${k}`), 'a loop moves with its screen off');
    assert.notEqual(b.get(`loop:${on[1].id}:${k}`), a.get(`loop:${on[1].id}:${k}`), 'a loop stopped with its screen on');
  }
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
