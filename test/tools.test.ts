import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { buildFigure } from '../src/art/figure/body.ts';
import { lookOf } from '../src/art/figure/look.ts';
import { Sketch, render } from '../src/art/figure/paint.ts';
import { LOOP, rigFor, type Rig } from '../src/art/figure/rig.ts';
import { ENVELOPE, toolOf, type Slot } from '../src/art/figure/tools/index.ts';
import { COSTUMES, traitsFor, type Costume, type Pose } from '../src/world/character.ts';

// The tools of the work poses: every costume's own (a world's), each kept
// to its slot's room, and seen from behind at the desk.

const INK = '#2b2233';
const SLOTS: Slot[] = ['surface', 'writer', 'read', 'run', 'search', 'web'];
// The design's table (surface, writer, read, run, search, web).
const TABLE: Record<Costume, string[]> = {
  miner: ['slate', 'chalk', 'foldedMap', 'pickaxe', 'lantern', 'crankRadio'],
  scientist: ['clipboard', 'pencil', 'labManual', 'flask', 'geigerCounter', 'plasmaOrb'],
  raver: ['flyer', 'marker', 'vinylSleeve', 'drumstick', 'glowStick', 'phone'],
  hacker: ['stickyNotes', 'marker', 'printout', 'screwdriver', 'flashlight', 'laptop'],
  astronaut: ['datapad', 'stylus', 'dataSlate', 'wrench', 'scanner', 'holoProjector'],
  casual: ['orderPad', 'pen', 'recipeBook', 'whisk', 'magnifier', 'phone'],
  forager: ['leaf', 'quill', 'fieldGuide', 'trowel', 'glowingMushroom', 'sporeOrb'],
  parka: ['notebook', 'pencil', 'map', 'iceAxe', 'lantern', 'radio'],
  guard: ['ledger', 'fountainPen', 'ledgerBook', 'rubberStamp', 'loupe', 'handset'],
  demon: ['scroll', 'quill', 'grimoire', 'trident', 'crystalBall', 'scryingMirror'],
  drifter: ['notebook', 'pencil', 'map', 'spanner', 'dowsingRod', 'radio'],
  nord: ['parchment', 'quill', 'scroll', 'axe', 'torch', 'runeStone'],
  exosuit: ['datapad', 'stylus', 'dataSlate', 'multitool', 'scanner', 'holoProjector'],
  jumpsuit: ['clipboard', 'pencil', 'manual', 'wrench', 'geigerCounter', 'radio'],
  colonist: ['notebook', 'pencil', 'almanac', 'hammer', 'spyglass', 'radio'],
  startup: ['stickyNotes', 'marker', 'printout', 'pingPongPaddle', 'magnifier', 'tablet'],
  wizard: ['notepad', 'pencil', 'book', 'mallet', 'magnifier', 'tablet'],
};
const tr = traitsFor('agent-1', 'sub');
const hash = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

// A tool alone at s, its hand in the middle of a canvas 12 units across.
function alone(slot: Slot, c: Costume, s: number, back: boolean, v = 0): Canvas {
  const sk = new Sketch();
  toolOf(c, slot).draw(sk, v, lookOf(tr, c), back);
  const cv = new Canvas(12 * s, 12 * s);
  render(cv, sk, [s, 0, 0, s, 6 * s, 6 * s], Math.max(1.5, 0.28 * s), INK);
  return cv;
}

// A figure from rig r at s, standing in the middle of its canvas.
function figure(r: Rig, c: Costume, back: boolean, s: number): Canvas {
  const sk = new Sketch();
  buildFigure(sk, r, lookOf(tr, c), { back, item: null, frame: 0 });
  const cv = new Canvas(30 * s, 34 * s);
  render(cv, sk, [s, 0, 0, s, 15 * s, 28 * s], Math.max(1.5, 0.28 * s), INK);
  return cv;
}

// Pixels that differ between two pictures of one size.
function differ(a: Canvas, b: Canvas): number {
  let n = 0;
  for (let o = 0; o < a.data.length; o += 4) {
    const d = Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]);
    if (d > 48 || Math.abs(a.data[o + 3] - b.data[o + 3]) > 32) n++;
  }
  return n;
}

test('every costume holds a tool in each slot of the work poses; the wizard, the first five ever drawn', () => {
  for (const c of COSTUMES) for (const slot of SLOTS) assert.ok(toolOf(c, slot)?.name, `${c} ${slot}`);
  assert.deepEqual(SLOTS.map((slot) => toolOf('wizard', slot).name), TABLE.wizard);
});

test("each tool draws something inside its slot's room, front and back, whatever its value", () => {
  const s = 8;
  const done = new Set<string>();
  for (const slot of SLOTS) {
    const e = ENVELOPE[slot];
    for (const c of COSTUMES) {
      const t = toolOf(c, slot);
      if (done.has(`${slot}:${t.name}`)) continue;
      done.add(`${slot}:${t.name}`);
      for (const back of [false, true]) {
        for (const v of [0, 0.5, 1]) {
          const what = `${slot} ${t.name}${back ? ' (back)' : ''} at ${v}`;
          const cv = alone(slot, c, s, back, v);
          let n = 0;
          for (let y = 0; y < cv.height; y++) {
            for (let x = 0; x < cv.width; x++) {
              if (cv.data[(y * cv.width + x) * 4 + 3] < 16) continue;
              n++;
              const ux = x / s - 6;
              const uy = y / s - 6;
              assert.ok(ux >= e.x0 - 0.5 && ux <= e.x1 + 0.5 && uy >= e.y0 - 0.5 && uy <= e.y1 + 0.5, `${what}: painted at ${ux.toFixed(2)}, ${uy.toFixed(2)}`);
            }
          }
          assert.ok(n >= s * s, `${what}: ${n} pixels`);
        }
      }
    }
  }
});

test('seen from behind at its desk, a figure at work shows its tool beside the body: writing, reading, browsing and searching in every frame, swinging in a quarter of them', () => {
  const s = 6;
  const WORK: Array<[Pose, number]> = [['write', 1], ['read', 1], ['web', 1], ['search', 1], ['run', 0.25]];
  for (const c of COSTUMES) {
    for (const [pose, share] of WORK) {
      const n = LOOP[pose][1];
      let frames = 0;
      let shown = 0;
      let writers = 0;
      let writerShown = 0;
      for (let i = 0; i < n; i += 2) {
        const r = rigFor(pose, i, { back: true, walking: false, walkU: 0, item: false, mug: false });
        frames++;
        if (differ(figure(r, c, true, s), figure({ ...r, props: [] }, c, true, s)) >= 1.5 * s * s) shown++;
        // the write pose's writer shows over its surface, not only the surface
        if (pose === 'write') {
          writers++;
          if (differ(figure(r, c, true, s), figure({ ...r, props: r.props.filter((p) => p.kind === 'notepad') }, c, true, s)) >= 0.5 * s * s) writerShown++;
        }
      }
      assert.ok(shown >= share * frames, `${c} ${pose}: the tool shows in ${shown} of ${frames} frames from behind`);
      if (pose === 'write') assert.ok(writerShown >= writers, `${c} write: the writer shows in ${writerShown} of ${writers} frames from behind`);
    }
  }
});

test("each world works with its own tools, as the design's table says, and tools of other names look other", { todo: 'the tool art' }, () => {
  const wrong: string[] = [];
  for (const c of COSTUMES) SLOTS.forEach((slot, k) => toolOf(c, slot).name !== TABLE[c][k] && wrong.push(`${c} ${slot}: ${toolOf(c, slot).name}, not ${TABLE[c][k]}`));
  assert.deepEqual(wrong, []);
  for (const slot of SLOTS) {
    const looks = new Map<string, string>();
    for (const c of COSTUMES) {
      const name = toolOf(c, slot).name;
      const h = hash(alone(slot, c, 8, false));
      const was = looks.get(h);
      assert.ok(!was || was === name, `${slot}: ${name} looks like ${was}`);
      looks.set(h, name);
    }
  }
});
