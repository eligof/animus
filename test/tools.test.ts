import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { buildFigure } from '../src/art/figure/body.ts';
import { lookOf } from '../src/art/figure/look.ts';
import { Sketch, render } from '../src/art/figure/paint.ts';
import { LOOP, rigFor, type Rig } from '../src/art/figure/rig.ts';
import { ENVELOPE, SLOT_OF, toolOf, type Slot } from '../src/art/figure/tools/index.ts';
import { COSTUMES, traitsFor, type Costume, type Pose, type Species, type Traits } from '../src/world/character.ts';

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
// The first agent id that rolls each species.
const idOf = (sp: Species): string => {
  for (let i = 0; i < 3000; i++) if (traitsFor(`agent-${i}`, 'sub').species === sp) return `agent-${i}`;
  throw new Error(sp);
};
const hash = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

// A tool alone at s, its hand in the middle of a canvas 16 units across.
function alone(slot: Slot, c: Costume, s: number, back: boolean, v = 0): Canvas {
  const sk = new Sketch();
  toolOf(c, slot).draw(sk, v, lookOf(tr, c), back);
  const cv = new Canvas(16 * s, 16 * s);
  render(cv, sk, [s, 0, 0, s, 8 * s, 8 * s], Math.max(1.5, 0.28 * s), INK);
  return cv;
}

// A figure from rig r at s, standing in the middle of its canvas.
function figure(r: Rig, c: Costume, back: boolean, s: number, t: Traits = tr): Canvas {
  const sk = new Sketch();
  buildFigure(sk, r, lookOf(t, c), { back, item: null, frame: 0 });
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

// Opaque pixels (alpha 192 and up) of a picture.
function solid(c: Canvas): number {
  let n = 0;
  for (let o = 3; o < c.data.length; o += 4) if (c.data[o] >= 192) n++;
  return n;
}

// Opaque pixels of a that differ from b (same size): what a shows that b
// does not, not counting a glow.
function opaqueChange(a: Canvas, b: Canvas): number {
  let n = 0;
  for (let o = 0; o < a.data.length; o += 4) {
    if (a.data[o + 3] < 192) continue;
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
              const ux = x / s - 8;
              const uy = y / s - 8;
              assert.ok(ux >= e.x0 - 0.5 && ux <= e.x1 + 0.5 && uy >= e.y0 - 0.5 && uy <= e.y1 + 0.5, `${what}: painted at ${ux.toFixed(2)}, ${uy.toFixed(2)}`);
            }
          }
          assert.ok(n >= s * s, `${what}: ${n} pixels`);
        }
      }
    }
  }
});

test("seen from behind at its desk, a figure at work shows each tool it holds, at least 40% of its own opaque area, beside the body: in every frame of writing, reading, browsing and searching, in a quarter of the frames of swinging", () => {
  const s = 6;
  const WORK: Array<[Pose, number]> = [['write', 1], ['read', 1], ['web', 1], ['search', 1], ['run', 0.25]];
  for (const sp of ['human', 'robot'] as const) {
    const t = traitsFor(idOf(sp), 'sub');
    for (const c of COSTUMES) {
      for (const [pose, share] of WORK) {
        // per tool held (a prop that fills a slot): the frames it shows in
        const shown = new Map<string, number>();
        const own = new Map<string, number>();
        const n = LOOP[pose][1];
        for (let i = 0; i < n; i++) {
          const r = rigFor(pose, i, { back: true, walking: false, walkU: 0, item: false, mug: false });
          const all = figure(r, c, true, s, t);
          for (const pr of r.props) {
            const slot = SLOT_OF[pr.kind];
            if (!slot) continue;
            const key = `${slot} ${toolOf(c, slot).name}`;
            if (!own.has(key)) own.set(key, 0);
            const painted = solid(alone(slot, c, s, true, pr.v));
            const change = opaqueChange(all, figure({ ...r, props: r.props.filter((q) => q !== pr) }, c, true, s, t));
            if (change >= 0.4 * painted) shown.set(key, (shown.get(key) ?? 0) + 1);
            own.set(key, own.get(key)! + 1);
          }
        }
        assert.ok(own.size > 0, `${c} ${pose}: holds no tool`);
        for (const [key, frames] of own) {
          const k = shown.get(key) ?? 0;
          assert.ok(k >= share * frames, `${sp} ${c} ${pose}: the ${key} shows in ${k} of ${frames} frames from behind`);
        }
      }
    }
  }
});

test("each world works with its own tools, as the design's table says, and tools of other names look other", () => {
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
