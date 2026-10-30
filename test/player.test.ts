import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScenePlayer, together } from '../src/app.ts';
import { composite } from '../src/art/plate.ts';
import type { Plate } from '../src/art/plate.ts';
import { encodeRgb } from '../src/art/png.ts';
import { encodeRgba } from '../src/art/scene/front.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import { World } from '../src/world/world.ts';
import { StressSource } from '../src/demo/stress.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import { looped } from './desk-fakes.ts';
import { Term, same } from './kitty-term.ts';

const START = Date.UTC(2026, 9, 22, 21, 30, 0);
const FPS = 30;

test('the picture and the text over it go out as one synchronized update', () => {
  const pic = '\x1b[?2026h<pic>\x1b[?2026l';
  const text = '\x1b[?2026h<text>\x1b[0m\x1b[?2026l';
  assert.equal(together(pic, text), '\x1b[?2026h<pic><text>\x1b[0m\x1b[?2026l');
  assert.equal(together('', text), text);
  assert.equal(together('', ''), '');
});

// The demo crew in the café, played into a model terminal: after every
// step the terminal shows exactly the frame's plate.
function play() {
  const world = new World({ theme: getTheme('cafe')!, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~', start: START, images: true, view: 'scene' });
  world.setCell(8, 16);
  world.resize(90, 28);
  const screen = new Screen(90, 28);
  const player = new ScenePlayer({ encode: (b, opaque) => (opaque ? encodeRgb(b, 0, 1) : encodeRgba(b, 1)) });
  // The plate of the last step (null: no scene).
  const last: { plate: Plate | null } = { plate: null };
  const build = player.scene.plate.bind(player.scene);
  player.scene.plate = (f) => (last.plate = build(f));
  let term: Term | null = null;
  let i = 0;
  const step = () => {
    const now = START + (i++ * 1000) / FPS;
    last.plate = null;
    world.tick(now);
    const out = player.step(world, screen, now);
    const plate = last.plate as Plate | null; // set by the call above
    term ??= new Term(plate!.rect, plate!.cell);
    term.play(out);
    if (plate) same(term.view(plate), composite(plate).data, plate.width, `step ${i}`);
    return { out, plate, term };
  };
  return { world, step };
}

test('the terminal shows exactly the scene, for a small part of a whole picture a step', () => {
  const { step } = play();
  let bytes = 0;
  let whole = 0;
  const steps = 8 * FPS;
  for (let k = 0; k < steps; k++) {
    const { out, plate } = step();
    if (k < FPS) continue; // the room going out at first
    bytes += out.length;
    whole = Math.max(whole, encodeRgb(composite(plate!), 0, 1).length);
  }
  const n = steps - FPS;
  // Things that move are placements; only what animates in place sends
  // pictures, small ones (base64 makes 4 bytes of 3, and still).
  assert.ok(bytes / n < whole / 20, `${(bytes / n).toFixed(0)} bytes a step against ${whole} for a whole picture`);
});

test('leaving the scene takes the pictures off, and coming back places the kept ones again', () => {
  const { world, step } = play();
  for (let k = 0; k < 2 * FPS; k++) step();
  const key = (name: string) => world.handleKey({ name, ch: name, ctrl: false, shift: false });
  key('r'); // the dashboard
  const off = step();
  assert.equal(off.plate, null);
  assert.equal(off.term.spots.size, 0, 'pictures left on screen');
  key('r');
  const back = step();
  assert.ok(back.plate && back.term.spots.size > 0);
  assert.ok(back.term.sent < back.plate.layers.length / 2, `${back.term.sent} pictures sent again for ${back.plate.layers.length} layers`);
});

// Twenty at work in a world, played into the terminal: the bytes a step
// once every workstation is up (after 15 seconds, over the next 3).
function bytesAStep(theme: WorldDef): number {
  const rate = 18;
  const world = new World({ theme, live: new StressSource(4, 4, START), demo: false, account: { name: 'you', plan: '' }, rootLabel: '~', start: START, images: true, view: 'scene' });
  world.setCell(8, 16);
  world.resize(150, 46);
  const screen = new Screen(150, 46);
  const player = new ScenePlayer({ encode: (b, opaque) => (opaque ? encodeRgb(b, 0, 1) : encodeRgba(b, 1)) });
  let bytes = 0;
  for (let k = 0; k < 18 * rate; k++) {
    const now = START + (k * 1000) / rate;
    world.tick(now);
    const out = player.step(world, screen, now);
    if (k >= 15 * rate) bytes += out.length;
  }
  return bytes / (3 * rate);
}

test('two loops on every one of twenty workstations cost at most 4 KiB a step more than none', () => {
  const cafe = getTheme('cafe')!;
  const none = bytesAStep(cafe);
  const two = bytesAStep(looped(cafe));
  assert.ok(two <= none + 4096, `${two.toFixed(0)} bytes a step with loops, ${none.toFixed(0)} without`);
});
