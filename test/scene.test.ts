import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { clearSprites, spriteStats } from '../src/art/figure.ts';
import { Scene } from '../src/art/scene.ts';
import { buildSprite } from '../src/art/scene/build.ts';
import { compare, depthOrder } from '../src/art/scene/depth.ts';
import type { Drawable } from '../src/art/scene/depth.ts';
import { Canvas } from '../src/art/canvas.ts';
import { isoBox } from '../src/art/iso.ts';
import type { Plate } from '../src/art/plate.ts';
import type { Bitmap } from '../src/art/types.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Block } from '../src/world/build.ts';
import { traitsFor } from '../src/world/character.ts';
import type { CritterFrame, FigureFrame, LabelFrame, SceneFrame } from '../src/world/frame.ts';
import { cellBox } from '../src/world/frame.ts';
import type { NavGrid } from '../src/world/path.ts';
import type { PlacedProp, Room } from '../src/world/room.ts';
import type { Particle } from '../src/world/types.ts';
import { World } from '../src/world/world.ts';
import type { PropArt, WorldDef } from '../src/worlds/types.ts';
import { budget } from './helpers.ts';

// A test room: a flat grey floor in a 60 x 60 room, props filled flat in
// one colour each (their whole silhouette), so a pixel of that colour is a
// pixel of the prop.
const S = 6;
const W = 60;
const D = 60;
const H = 20;
const T = 4;

type Pt = [number, number];
function hull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && turn(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (const q of [...p].reverse()) {
    while (up.length >= 2 && turn(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

function flat(len: number, dep: number, height: number, color: string, animated = false): PropArt {
  return {
    len,
    dep,
    height,
    animated,
    draw(v) {
      const pts: Pt[] = [];
      for (const u of [0, len]) for (const w of [0, dep]) for (const z of [0, height]) pts.push(v.at(u, w, z));
      const h = hull(pts);
      v.pen.beginPath();
      h.forEach(([x, y], i) => (i ? v.pen.lineTo(x, y) : v.pen.moveTo(x, y)));
      v.pen.closePath();
      v.pen.fillStyle = v.active ? '#0000ff' : color;
      v.pen.fill();
    },
  };
}

const cafe = getTheme('cafe')!;
const world: WorldDef = {
  ...cafe,
  id: 'test',
  backdrop: [20, 20, 30],
  ink: '#101018',
  ambient: undefined,
  room: {
    draw(v) {
      v.pen.beginPath();
      [v.at(T, T, 0), v.at(W, T, 0), v.at(W, D, 0), v.at(T, D, 0)].forEach(([x, y], i) => (i ? v.pen.lineTo(x, y) : v.pen.moveTo(x, y)));
      v.pen.closePath();
      v.pen.fillStyle = '#808080';
      v.pen.fill();
    },
  },
};

const place = (art: PropArt, wall: 'left' | 'right', island: boolean, x0: number, y0: number): PlacedProp => ({ art, wall, island, x0, y0, len: art.len, dep: art.dep, seed: 1 });
const room = (props: PlacedProp[]): Room => ({ L: { W, D, H, T, slots: [] }, props, nav: null as unknown as NavGrid, pois: [], supply: [], height: new Float32Array(0) });

function figure(id: string, x: number, y: number, o: Partial<FigureFrame> = {}): FigureFrame {
  return { id, x, y, z: 0, traits: traitsFor(id, 'lead'), costume: 'casual', pose: 'idle', poseT: 0, phase: 0, facing: { back: false, flip: false }, selected: false, hurt: false, sleeping: false, walking: false, ...o };
}

function frame(r: Room, o: Partial<SceneFrame> = {}, cam: { ox?: number; oy?: number } = {}): SceneFrame {
  const w = (W + D) * S + 40;
  const h = ((W + D) / 2 + H) * S + 40;
  return {
    world,
    room: r,
    t: 0,
    lit: false,
    active: r.props.map(() => false),
    camera: { s: S, ox: cam.ox ?? D * S + 20, oy: cam.oy ?? H * S + 20, w, h, cell: { w: 10, h: 20 }, cells: { x: 0, y: 0, w: w / 10, h: h / 20 } },
    figures: [],
    critter: null,
    builds: [],
    particles: [],
    labels: [],
    marks: [],
    ...o,
  };
}

const px = (b: Bitmap, x: number, y: number) => {
  const o = 4 * (Math.round(y) * b.width + Math.round(x));
  return [b.data[o], b.data[o + 1], b.data[o + 2]];
};
const copy = (b: Bitmap) => b.data.slice();
// Pixels of `rgb` in `before` that are something else in `after`.
function covered(before: Uint8ClampedArray, after: Uint8ClampedArray, rgb: [number, number, number]): number {
  let n = 0;
  for (let o = 0; o < before.length; o += 4) {
    if (before[o] !== rgb[0] || before[o + 1] !== rgb[1] || before[o + 2] !== rgb[2]) continue;
    if (after[o] !== rgb[0] || after[o + 1] !== rgb[1] || after[o + 2] !== rgb[2]) n++;
  }
  return n;
}
// Pixels that differ between two pictures inside a box.
function changes(a: Uint8ClampedArray, b: Uint8ClampedArray, w: number, box: { x0: number; y0: number; x1: number; y1: number }): number {
  let n = 0;
  for (let y = Math.max(0, box.y0); y < box.y1; y++) {
    for (let x = Math.max(0, box.x0); x < Math.min(w, box.x1); x++) {
      const o = 4 * (y * w + x);
      if (a[o] !== b[o] || a[o + 1] !== b[o + 1] || a[o + 2] !== b[o + 2]) n++;
    }
  }
  return n;
}

const GREEN: [number, number, number] = [0, 255, 0];
const RED: [number, number, number] = [255, 0, 0];

const tilesOf = (p: Plate) => p.layers.filter((l) => l.id.startsWith('base:'));
const worst = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};

test('the base is tiles fixed to the world: a pan moves them and paints only those it brings in', () => {
  const r = room([place(flat(8, 6, 6, '#00ff00'), 'right', true, 30, 30)]);
  const scene = new Scene();
  const f0 = frame(r);
  const a = scene.plate(f0);
  const t0 = tilesOf(a);
  assert.equal(scene.stats.tiles, t0.length, 'the tiles in view, painted once');
  scene.plate(frame(r, { t: 3, figures: [figure('a', 20, 40)] }));
  assert.equal(scene.stats.tiles, t0.length);
  assert.equal(scene.stats.props, 1, 'the prop sprite is drawn once');
  const { ox, oy } = f0.camera;
  for (const l of t0) {
    const [tx, ty] = l.id.slice(5).split(',').map(Number);
    assert.deepEqual([l.x, l.y, l.pic.img.width, l.pic.img.height, !!l.pic.opaque, !!l.volatile], [ox + tx * 256, oy + ty * 256, 256, 256, true, false], l.id);
  }
  assert.ok(t0.some((l) => l.x <= 0 && l.y <= 0) && t0.some((l) => l.x + 256 >= f0.camera.w && l.y + 256 >= f0.camera.h), 'they cover the canvas');
  // A pan: the tiles still in view move under their keys; only the tiles
  // it brings into view are painted; the picture is the one painted whole.
  for (const [dx, dy] of [[3, -2], [-140, 90], [700, -300]]) {
    const before = new Map(tilesOf(scene.plate(f0)).map((l) => [l.id, l]));
    const painted = scene.stats.tiles;
    const panned = frame(r, {}, { ox: ox + dx, oy: oy + dy });
    const after = tilesOf(scene.plate(panned));
    let brought = 0;
    for (const l of after) {
      const was = before.get(l.id);
      if (!was) brought++;
      else assert.deepEqual([l.pic.key, l.x - was.x, l.y - was.y], [was.pic.key, dx, dy], l.id);
    }
    assert.ok(scene.stats.tiles - painted <= brought, `${scene.stats.tiles - painted} painted for ${brought} brought in`);
    assert.ok(worst(scene.render(panned).bitmap.data.slice(), new Scene().render(panned).bitmap.data) <= 2);
  }
  // A zoom goes straight to the tiles at the new scale; back at a scale
  // seen, nothing is painted.
  const zoomed = { ...f0, camera: { ...f0.camera, s: S * 1.5 } };
  const z = scene.plate(zoomed);
  assert.ok(tilesOf(z).length > 0 && z.layers.every((l) => l.id !== 'whole'));
  assert.ok(worst(scene.render(zoomed).bitmap.data.slice(), new Scene().render(zoomed).bitmap.data) <= 2);
  const painted = scene.stats.tiles;
  assert.deepEqual(tilesOf(scene.plate(f0)).map((l) => l.pic.key), t0.map((l) => l.pic.key));
  assert.equal(scene.stats.tiles, painted, 'the first scale was kept');
});

test('a figure behind an island is hidden by it, one in front is not', () => {
  const isle = place(flat(10, 6, 8, '#00ff00'), 'right', true, 30, 30);
  const r = room([isle]);
  const f0 = frame(r);
  const bare = new Scene().render(f0).bitmap;
  const was = copy(bare);
  // Where a figure's legs are, just over its feet (dx px aside).
  const legs = (x: number, y: number, dx = 0): [number, number] => [f0.camera.ox + (x - y) * S + dx, f0.camera.oy + ((x + y) * S) / 2 - 2];
  const behind = new Scene().render(frame(r, { figures: [figure('a', 35, 27)] })).bitmap;
  const front = new Scene().render(frame(r, { figures: [figure('a', 35, 39)] })).bitmap.data;
  assert.deepEqual(px(bare, ...legs(35, 27)), GREEN, 'the island stands over its legs on screen');
  assert.ok(changes(was, behind.data, bare.width, { x0: 0, y0: 0, x1: bare.width, y1: bare.height }) > 20, 'its head shows over the island');
  assert.equal(covered(was, behind.data, GREEN), 0, 'nothing of the island is covered from behind');
  assert.ok(covered(was, front, GREEN) > 50, 'the figure in front covers the island');
  // Walked round to its side (beyond its +x face): in front again.
  const side = new Scene().render(frame(r, { figures: [figure('a', 43, 31)] })).bitmap.data;
  assert.ok(covered(was, side, GREEN) > 20);
  // Behind its far side (-x): hidden.
  const far = new Scene().render(frame(r, { figures: [figure('a', 27, 33)] })).bitmap.data;
  assert.deepEqual(px(bare, ...legs(27, 33, 6)), GREEN);
  assert.equal(covered(was, far, GREEN), 0);
});

test('a wall prop hides only who is actually behind it', () => {
  // Tall shelves on the right wall (y = T), along x from 20 to 32.
  const shelf = place(flat(12, 4, 16, '#ff0000'), 'right', false, 20, T);
  const r = room([shelf]);
  const f0 = frame(r);
  const pic = new Scene().render(f0).bitmap;
  const bare = copy(pic);
  const at = (x: number, y: number) => new Scene().render(frame(r, { figures: [figure('a', x, y)] })).bitmap.data;
  assert.ok(covered(bare, at(26, 12), RED) > 50, 'in front of it');
  assert.ok(covered(bare, at(34, 7), RED) > 10, 'beside it, further along the wall');
  // Its right half overlaps the shelf's near end on screen.
  assert.deepEqual(px(pic, f0.camera.ox + 11 * S + 12, f0.camera.oy + 12.5 * S - 2), RED);
  assert.equal(covered(bare, at(18, 7), RED), 0, 'beside it, between it and the corner: behind');
});

test("what a prop lays on the floor round it stays under the figures beside it", () => {
  // An island with a wide flat shadow (pure blue, to spot) round its foot.
  const art = flat(10, 6, 8, '#00ff00');
  const shady: PropArt = {
    ...art,
    draw(v) {
      const [cx, cy] = v.at(5, 3, 0);
      const [ex] = v.at(5 + 9, 3 - 9, 0);
      v.pen.beginPath();
      v.pen.ellipse(cx, cy, Math.abs(ex - cx), Math.abs(ex - cx) / 2, 0, 0, Math.PI * 2);
      v.pen.fillStyle = '#0000ff';
      v.pen.fill();
      art.draw(v);
    },
  };
  const r = room([place(shady, 'right', true, 30, 30)]);
  const f0 = frame(r);
  const bare = new Scene().render(f0).bitmap;
  // Off its corner, a little further back than out: behind it by depth,
  // standing in its shadow.
  const [x, y] = [26, 39];
  const feet: [number, number] = [f0.camera.ox + (x - y) * S, f0.camera.oy + ((x + y) * S) / 2 - 3];
  assert.deepEqual(px(bare, ...feet), [0, 0, 255]);
  const pic = new Scene().render(frame(r, { figures: [figure('a', x, y)] })).bitmap;
  assert.notDeepEqual(px(pic, ...feet), [0, 0, 255], 'the shadow is not painted over its feet');
});

test('depth order follows the floor, not one point per thing', () => {
  const box = (x0: number, y0: number, x1: number, y1: number, h = 8): Drawable => ({ x0, y0, x1, y1, h, point: false, sx0: 0, sy0: 0, sx1: 100, sy1: 100 });
  const pt = (x: number, y: number): Drawable => ({ x0: x, y0: y, x1: x, y1: y, h: 0, point: true, sx0: 0, sy0: 0, sx1: 100, sy1: 100 });
  // A long wall prop whose centre is nearer than a figure standing in front
  // of its near end: by the footprint the figure is in front.
  const wall = box(4, 4, 60, 8);
  assert.equal(compare(pt(10, 12), wall), 1);
  assert.equal(compare(wall, pt(10, 12)), -1);
  // Round a corner: further out than back is in front.
  assert.equal(compare(pt(64, 6), wall), 1);
  assert.equal(compare(pt(2, 9), box(4, 4, 8, 60)), -1);
  // Boxes by their separating face; points by depth.
  assert.equal(compare(box(0, 0, 4, 4), box(5, 0, 9, 4)), -1);
  assert.equal(compare(pt(3, 3), pt(4, 4)), -1);
  // Off each other on screen: no constraint.
  assert.equal(compare({ ...pt(1, 1), sx0: 200, sx1: 210 }, wall), 0);
  const items = [box(20, 20, 30, 26), pt(25, 30), pt(25, 16), box(4, 4, 60, 8)];
  const order = depthOrder(items);
  assert.ok(order.indexOf(2) < order.indexOf(0) && order.indexOf(0) < order.indexOf(1), `order ${order}`);
  assert.ok(order.indexOf(3) < order.indexOf(2));
});

test('an emote shows over a prop that hides its figure', () => {
  const big = place(flat(30, 10, 24, '#00ff00'), 'right', true, 20, 30);
  const r = room([big]);
  const f0 = frame(r);
  const pic = new Scene().render(f0).bitmap;
  const bare = copy(pic);
  const still = copy(new Scene().render(frame(r, { figures: [figure('a', 35, 26)] })).bitmap);
  assert.deepEqual(px(pic, f0.camera.ox + 9 * S, f0.camera.oy + 30.5 * S - 40), GREEN, 'the prop stands over the figure on screen');
  assert.equal(covered(bare, still, GREEN), 0, 'the figure is hidden');
  const popped = new Scene().render(frame(r, { figures: [figure('a', 35, 26, { emote: { kind: 'idea', t: 1 } })] })).bitmap.data;
  assert.ok(covered(bare, popped, GREEN) > 20, 'its emote is not');
});

test('a label pill lies under its cells', () => {
  const r = room([]);
  const f = frame(r);
  const label: LabelFrame = { col: 30, row: 6, w: 8, kind: 'name', color: [240, 40, 200], alpha: 0.9, text: '✎ atlas ', ink: [255, 255, 255], bold: true };
  const bare = copy(new Scene().render(f).bitmap);
  const pic = new Scene().render({ ...f, labels: [label] }).bitmap;
  const b = cellBox(f.camera, label.col, label.row, label.w);
  const mid = px(pic, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  assert.ok(Math.abs(mid[0] - 240) < 40 && mid[1] < 90 && Math.abs(mid[2] - 200) < 40, `pill ${mid}`);
  for (const x of [b.x0 + 3, b.x1 - 4]) assert.notDeepEqual(px(pic, x, (b.y0 + b.y1) / 2), px({ ...pic, data: bare }, x, (b.y0 + b.y1) / 2), 'the pill spans the cells');
  // Nothing a cell's height above or below, or a few cells aside.
  assert.equal(changes(bare, pic.data, pic.width, { x0: b.x0 - 40, y0: b.y0 - 20, x1: b.x1 + 40, y1: b.y0 - 2 }), 0);
  assert.equal(changes(bare, pic.data, pic.width, { x0: b.x0 - 40, y0: b.y1 + 3, x1: b.x1 + 40, y1: b.y1 + 20 }), 0);
  assert.equal(changes(bare, pic.data, pic.width, { x0: b.x1 + 8, y0: b.y0, x1: b.x1 + 60, y1: b.y1 }), 0);
});

test("a level-up's word lays its dark pill over a label's it rises through, and keeps its sprite as it rises", () => {
  const r = room([]);
  const f = frame(r);
  const name: LabelFrame = { col: 30, row: 6, w: 8, kind: 'name', color: [240, 40, 200], alpha: 0.9, text: '✎ atlas ', ink: [255, 255, 255], bold: true };
  const word = (row: number): LabelFrame => ({ col: 32, row, w: 3, kind: 'word', color: [18, 12, 8], alpha: 0.9, text: '★3!', ink: [255, 177, 59], bold: true });
  const pic = new Scene().render({ ...f, labels: [name, word(6)] }).bitmap;
  const b = cellBox(f.camera, 32, 6, 3);
  const mid = px(pic, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
  assert.ok(mid.every((v) => v < 60), `the word's pill on top: ${mid}`);
  // Risen a row: the same pill sprite, placed a cell higher.
  const scene = new Scene();
  const at = (row: number) => scene.plate({ ...f, labels: [name, word(row)] }).layers.find((l) => l.id === 'pill:1')!;
  const [p, q] = [at(6), at(5)];
  assert.equal(q.pic.key, p.pic.key);
  assert.deepEqual([q.x - p.x, p.y - q.y], [0, f.camera.cell.h]);
});

test("the world's ambient tint is multiplied over the scene, not over the label pills", () => {
  const r = room([]);
  const label: LabelFrame = { col: 30, row: 6, w: 8, kind: 'name', color: [240, 240, 240], alpha: 1, text: 'x', ink: [0, 0, 0], bold: false };
  const f = frame(r, { labels: [label] });
  const blue = { ...f, world: { ...world, ambient: { tint: [40, 60, 255] as [number, number, number], strength: 0.5 } } };
  const plain = new Scene().render(f).bitmap;
  const tinted = new Scene().render(blue).bitmap;
  // The floor in the middle of the room: red and green pulled down.
  const [x, y] = [f.camera.ox + 0, f.camera.oy + 40 * S];
  const [p, q] = [px(plain, x, y), px(tinted, x, y)];
  assert.ok(Math.abs(q[0] - p[0] * (0.5 + 0.5 * (40 / 255))) <= 2 && q[2] === p[2], `${p} -> ${q}`);
  const b = cellBox(f.camera, label.col, label.row, label.w);
  assert.deepEqual(px(tinted, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2), px(plain, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2));
});

test('the screenshot script renders the demo crew to a PNG of the scene', async () => {
  const { shot } = await import('../scripts/scene-shot.ts');
  const { png } = shot({ world: 'cafe', at: 3, cols: 80, rows: 24, cell: { w: 8, h: 16 }, zoom: 0, select: -1, full: true, dark: false });
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 384]);
});

test('the screenshot script takes a world by its id or by its module file, so a world not registered yet can be looked at', async () => {
  const { loadWorld, shot } = await import('../scripts/scene-shot.ts');
  const cafe = await loadWorld('cafe');
  assert.equal(cafe.id, 'cafe');
  assert.equal(await loadWorld('src/worlds/cafe.ts'), cafe);
  await assert.rejects(loadWorld('nope'), /unknown world "nope"/);
  await assert.rejects(loadWorld('src/worlds/types.ts'), /exports no world/);
  const { png } = shot({ world: { ...cafe, id: 'unlisted' }, at: 1, cols: 80, rows: 24, cell: { w: 8, h: 16 }, zoom: 0, select: -1, full: true, dark: false });
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [640, 384]);
});

test('the screenshot script says what is wrong with a world module: no file, no world, or which of its id, stations and room it lacks', async () => {
  const { loadWorld } = await import('../scripts/scene-shot.ts');
  const dir = mkdtempSync(join(tmpdir(), 'animus-worlds-'));
  try {
    const put = (name: string, src: string) => {
      writeFileSync(join(dir, name), src);
      // a path relative to the current directory, as typed
      return relative(process.cwd(), join(dir, name));
    };
    await assert.rejects(loadWorld('src/worlds/nowhere.ts'), (e: Error) => e.message.startsWith('no world module at ') && e.message.endsWith(join(process.cwd(), 'src/worlds/nowhere.ts')));
    await assert.rejects(loadWorld(put('none.ts', 'export const n = 1;\n')), /none\.ts exports no world/);
    await assert.rejects(loadWorld(put('bare.ts', "export default { id: 'bare' };\n")), /bare\.ts: its world has no stations, room$/);
    await assert.rejects(loadWorld(put('half.ts', 'export const half = { stations: {}, room: {} };\n')), /half\.ts: its world has no id, room$/);
    const ok = put('ok.ts', "export const ok = { id: 'ok', stations: {}, room: { draw() {} } };\n");
    assert.equal((await loadWorld(ok)).id, 'ok');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// A cheer's heart shows over the critter, clear of it: over a hopper mid-
// hop too, whose feelers' glow reaches past 7 units.
test('a heart over the critter shows above it, whatever kind it is, in every frame, on the move or not', () => {
  const r = room([]);
  const scene = new Scene();
  const at = (t: number, c: CritterFrame | null) => copy(scene.render(frame(r, { t, critter: c })).bitmap);
  const width = frame(r).camera.w;
  // The rows a change between two pictures spans.
  const rows = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
    let [y0, y1] = [Infinity, -1];
    for (let o = 0; o < a.length; o += 4) {
      if (a[o] === b[o] && a[o + 1] === b[o + 1] && a[o + 2] === b[o + 2]) continue;
      const y = Math.floor(o / 4 / width);
      [y0, y1] = [Math.min(y0, y), Math.max(y1, y)];
    }
    return [y0, y1];
  };
  const bare = at(0, null);
  for (const kind of ['cat', 'rat', 'drone', 'slime', 'fox', 'imp', 'beetle', 'hopper', 'husky'] as const) {
    // every frame of its loops: eight idling, four on the move
    for (const [moving, per, n] of [[false, 2.4, 8], [true, 0.4, 4]] as const) {
      for (let i = 0; i < n; i++) {
        const t = ((i + 0.5) * per) / n;
        const cr: CritterFrame = { kind, body: [150, 200, 120], x: 30, y: 30, z: 0, flip: false, moving };
        const plain = at(t, cr);
        const [top] = rows(bare, plain);
        // the heart at the bottom of its bob: their soft edges may share a
        // row, no more
        const [, bottom] = rows(plain, at(t, { ...cr, heart: 1.54 }));
        assert.ok(bottom <= top, `${kind}${moving ? ' on the move' : ''} at ${t.toFixed(2)} s: the heart down to row ${bottom}, the critter up to ${top}`);
      }
    }
  }
});

test('the selected figure stands in a ring of its colour, the hurt in a pulsing red one', () => {
  const r = room([]);
  const g = figure('a', 30, 30);
  const f = frame(r);
  const [fx, fy] = [f.camera.ox + (g.x - g.y) * S, f.camera.oy + ((g.x + g.y) * S) / 2];
  // The ring's nearest point on screen, below the feet (r 3.6 units).
  const ringY = fy + (3.6 * S) / Math.SQRT2;
  const plain = new Scene().render({ ...f, figures: [g] }).bitmap;
  const sel = new Scene().render({ ...f, figures: [{ ...g, selected: true }] }).bitmap;
  const c = g.traits.color;
  const near = (p: number[], q: readonly number[], d: number) => p.every((v, i) => Math.abs(v - q[i]) <= d);
  const ringPx = [-1, 0, 1].map((k) => px(sel, fx, ringY + k));
  assert.ok(ringPx.some((p) => near(p, c, 40)), `ring ${JSON.stringify(ringPx)} vs ${c}`);
  assert.ok(!near(px(plain, fx, ringY), c, 40));
  const bad = world.palette.bad;
  const hurtAt = (t: number) => new Scene().render({ ...f, t, figures: [{ ...g, hurt: true }] }).bitmap;
  const h1 = hurtAt(0.2);
  const h2 = hurtAt(0.65);
  const redRow = (b: Bitmap) => [-3, -2, -1, 0, 1, 2, 3].map((k) => px(b, fx, fy + (3.2 * S) / Math.SQRT2 + k));
  assert.ok(redRow(h1).some((p) => p[0] > p[1] + 40 && near(p, bad, 90)), `hurt ring ${JSON.stringify(redRow(h1))}`);
  assert.notDeepEqual(redRow(h1), redRow(h2), 'it pulses');
});

test('a build is one merged shape: far less outline than cube by cube', () => {
  const blocks: Block[] = [];
  for (let z = 0; z < 6; z++) for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) blocks.push({ x: 20 + x, y: 20 + y, z, c: (x + z) % 2 });
  const colors: Array<[number, number, number]> = [[200, 120, 70], [230, 220, 190]];
  const sp = buildSprite(blocks, [], colors, [120, 230, 255], S, '#101018')!;
  const inky = (b: Bitmap) => {
    let n = 0;
    for (let o = 0; o < b.data.length; o += 4) if (b.data[o + 3] > 200 && b.data[o] < 40 && b.data[o + 1] < 40 && b.data[o + 2] < 50) n++;
    return n;
  };
  // The same blocks as outlined cubes, back to front.
  const cubes = new Canvas(sp.img.width, sp.img.height);
  const at = (x: number, y: number, z: number): [number, number] => [(x - y) * S - sp.x, ((x + y) * S) / 2 - z * S - sp.y];
  for (const b of [...blocks].sort((p, q) => p.x + p.y + p.z - (q.x + q.y + q.z))) isoBox(cubes, at, b.x, b.y, b.z, 1, 1, 1, b.c ? '#e6dcbe' : '#c87846', { ink: '#101018' });
  const merged = inky(sp.img);
  const each = inky(cubes);
  assert.ok(merged > 0, 'it has an outline');
  assert.ok(merged * 3 < each, `${merged} ink pixels merged vs ${each} cube by cube`);
  // Its pending part is a translucent hologram over it.
  const ghost = buildSprite(blocks.slice(0, 108), blocks.slice(108), colors, [120, 230, 255], S, '#101018')!;
  let soft = 0;
  for (let o = 3; o < ghost.img.data.length; o += 4) if (ghost.img.data[o] > 0 && ghost.img.data[o] < 200) soft++;
  assert.ok(soft > 500, `${soft} translucent pixels`);
});

test('particles fade out over the end of their life', () => {
  const r = room([]);
  const f = frame(r);
  const bare = copy(new Scene().render(f).bitmap);
  const spark = (life: number): Particle => ({ kind: 'spark', x: 30, y: 30, z: 5, vx: 0, vy: 0, vz: 0, life, color: [255, 220, 120], glow: true, gravity: 0 });
  const [x, y] = [f.camera.ox, f.camera.oy + 30 * S - 5 * S];
  const box = { x0: x - 8, y0: y - 8, x1: x + 8, y1: y + 8 };
  const diff = (life: number) => {
    const d = new Scene().render({ ...f, particles: [spark(life)] }).bitmap.data;
    let sum = 0;
    for (let yy = box.y0; yy < box.y1; yy++) for (let xx = box.x0; xx < box.x1; xx++) for (let c = 0; c < 3; c++) sum += Math.abs(d[4 * (yy * f.camera.w + xx) + c] - bare[4 * (yy * f.camera.w + xx) + c]);
    return sum;
  };
  const full = diff(1);
  const half = diff(0.25);
  assert.ok(full > 0 && half > 0.3 * full && half < 0.75 * full, `full ${full}, half-faded ${half}`);
  assert.equal(diff(0.001), 0);
  // Every kind draws something.
  for (const kind of ['ember', 'confetti', 'smoke', 'steam', 'drop', 'glint', 'bolt', 'zzz'] as const) {
    const d = new Scene().render({ ...f, particles: [{ ...spark(1), kind, vx: 3, vy: 1, vz: 2 }] }).bitmap.data;
    assert.ok(changes(bare, d, f.camera.w, { x0: x - 30, y0: y - 30, x1: x + 30, y1: y + 30 }) > 0, kind);
  }
});

test('a picture keeps its key while its pixels stay the same: frame to frame, through pans, the same sprite', () => {
  const r = room([place(flat(8, 6, 6, '#00ff00'), 'right', true, 30, 30)]);
  const scene = new Scene();
  const keys = (p: Plate) => Object.fromEntries(p.layers.map((l) => [l.id, l.pic.key]));
  const at = (p: Plate, id: string) => p.layers.find((l) => l.id === id)!;
  const label: LabelFrame = { col: 3, row: 3, w: 4, kind: 'name', color: [1, 2, 3], alpha: 0.5, text: 'abcd', ink: [0, 0, 0], bold: false };
  const f = frame(r, { figures: [figure('a', 20, 40)], labels: [label] });
  const a = scene.plate(f);
  assert.deepEqual(keys(scene.plate(frame(r, { figures: [figure('a', 20, 40)], labels: [label] }))), keys(a), 'a new frame of the same scene');
  // A step: the figure's sprite placed further on, under its key.
  const b = scene.plate(frame(r, { figures: [figure('a', 21, 40)], labels: [label] }));
  assert.deepEqual(keys(b), keys(a));
  assert.deepEqual([at(b, 'fig:a').x - at(a, 'fig:a').x, at(b, 'fig:a').y - at(a, 'fig:a').y], [S, S / 2]);
  // A pan: every picture moves with it, none changes (but for base tiles
  // coming into view or leaving it).
  const c = scene.plate(frame(r, { figures: [figure('a', 20, 40)], labels: [label] }, { ox: D * S + 25, oy: H * S + 12 }));
  for (const l of a.layers) {
    const now = at(c, l.id);
    if (!now && l.id.startsWith('base:')) continue;
    assert.equal(now.pic.key, l.pic.key, l.id);
    if (l.id !== 'pill:0') assert.deepEqual([now.x - l.x, now.y - l.y], [5, -8], l.id);
  }
  for (const l of c.layers) assert.ok(at(a, l.id) || l.id.startsWith('base:'), l.id);
  // Breathing: a loop frame shown again is the same sprite, the same key.
  const breath = (t: number) => at(scene.plate(frame(r, { t, figures: [figure('a', 20, 40, { poseT: t })] })), 'fig:a').pic.key;
  const seen = new Map<string, number>();
  for (let t = 0; t < 6; t += 0.1) seen.set(breath(t), (seen.get(breath(t)) ?? 0) + 1);
  assert.ok(seen.size > 1 && seen.size < 30, `${seen.size} sprites in 60 frames`);
  // Selected, the ring is a new picture under the figure.
  const d = scene.plate(frame(r, { figures: [figure('a', 20, 40, { selected: true })] }));
  assert.ok(at(d, 'ring:a'));
  assert.equal(at(d, 'fig:a').pic.key, at(a, 'fig:a').pic.key);
});

test('a plate of the café at 1500 x 920 with 9 figures and 80 bits fits the budget', () => {
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('cafe')!, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.full = true;
  w.resize(150, 46);
  const screen = new Screen(150, 46);
  let now = start;
  for (let i = 0; i < 40 * 18; i++) {
    now = start + i * (1000 / 18);
    w.tick(now);
  }
  w.draw(screen, now);
  const f = w.scene()!;
  assert.equal(f.camera.w, 1500);
  assert.equal(f.camera.h, 920);
  const figs = [...f.figures];
  for (let k = 0; figs.length < 9; k++) figs.push(figure(`extra-${k}`, 40 + 12 * k, 90 - 7 * k));
  const kinds = ['spark', 'confetti', 'smoke', 'steam', 'glint', 'ember', 'bolt', 'drop'] as const;
  const bits: Particle[] = Array.from({ length: 80 }, (_, i) => ({ kind: kinds[i % kinds.length], x: 30 + (i * 37) % 90, y: 30 + (i * 53) % 90, z: 2 + (i % 9), vx: 2, vy: -1, vz: 3, life: 1.5, color: [255, 200, 120], glow: i % 2 === 0, gravity: 0 }));
  const busy: SceneFrame = { ...f, figures: figs.slice(0, 9), particles: bits, lit: true };
  const scene = new Scene();
  scene.plate(busy);
  const times: number[] = [];
  for (let k = 0; k < 5; k++) {
    const t0 = performance.now();
    scene.plate({ ...busy, t: busy.t + k / 30 });
    times.push(performance.now() - t0);
  }
  // 8 ms is the budget (every bit moved, so every bit is drawn again); the
  // bound is generous as files run in parallel.
  assert.ok(Math.min(...times) < 16, `best of 5: ${Math.min(...times).toFixed(1)} ms`);
});


test('a desk upgrade stands on the floor, in front of a prop or hidden behind it like a figure', () => {
  const isle = place(flat(10, 6, 8, '#00ff00'), 'right', true, 30, 30);
  const r = room([isle]);
  const bare = copy(new Scene().render(frame(r)).bitmap);
  const tk = (x: number, y: number) => frame(r, { trinkets: [{ id: 'lead', kind: 'trophy', x, y, color: [200, 40, 160] }] });
  assert.ok(covered(bare, new Scene().render(tk(35, 39)).bitmap.data, GREEN) > 20, 'in front: covers the island');
  assert.equal(covered(bare, new Scene().render(tk(35, 27)).bitmap.data, GREEN), 0, 'behind: hidden');
  const plate = new Scene().plate(tk(35, 39));
  assert.ok(plate.layers.some((l) => l.id === 'trinket:lead'));
});

test('a hop lifts the figure, not its shadow', () => {
  const r = room([]);
  const at = (hop: number) => new Scene().plate(frame(r, { figures: [figure('a', 30, 30, { hop })] })).layers;
  const still = at(0);
  const up = at(1);
  const y = (ls: typeof still, id: string) => ls.find((l) => l.id === id)!.y;
  assert.equal(y(still, 'fig:a') - y(up, 'fig:a'), S, 'a unit higher');
  assert.equal(y(up, 'shadow:a'), y(still, 'shadow:a'));
});

test('a busy plate where everyone wears everything, feels something and hops, with desk upgrades, fits the budget', () => {
  const start = Date.UTC(2026, 9, 22, 21, 30, 0);
  const w = new World({ theme: getTheme('cafe')!, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~', start, images: true });
  w.full = true;
  w.resize(150, 46);
  let now = start;
  for (let i = 0; i < 20 * 18; i++) {
    now = start + i * (1000 / 18);
    w.tick(now);
  }
  w.draw(new Screen(150, 46), now);
  const f = w.scene()!;
  const all = { wear: { hat: true, badge: true, outfit: true, aura: true }, feel: { drowsy: true, bandaged: true, bouncy: true } };
  const figs = [...f.figures];
  for (let k = 0; figs.length < 9; k++) figs.push(figure(`extra-${k}`, 40 + 12 * k, 90 - 7 * k));
  const trinkets = (['plant', 'mug', 'trophy'] as const).map((kind, i) => ({ id: `t${i}`, kind, x: 30 + 20 * i, y: 40, color: [200, 60, 160] as [number, number, number] }));
  // A second of it at 30 frames a second, from no sprites at all: each
  // figure goes through its loop frames, drawing each the first time.
  const busy = (k: number): SceneFrame => ({ ...f, figures: figs.slice(0, 9).map((g, i) => ({ ...g, ...all, poseT: g.poseT + k / 30, hop: (k + i) % 3 === 0 ? 0.6 : 0 })), trinkets, lit: true, t: f.t + k / 30 });
  const scene = new Scene();
  scene.plate(busy(0));
  const m = spriteStats.misses;
  for (let k = 1; k <= 30; k++) scene.plate(busy(k));
  assert.ok(spriteStats.misses - m > 30, `the figures drew ${spriteStats.misses - m} new sprites in a second`);
  // As the plate above: 8 ms is the budget; generous, files run in parallel.
  budget(
    'busy plate with growth',
    (k) => {
      if (k === 0) clearSprites();
      scene.plate(busy(k + 1));
    },
    16,
    { runs: 5, calls: 30 },
  );
});
