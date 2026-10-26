import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AMBIENT_FPS, Scene } from '../src/art/scene.ts';
import { composite } from '../src/art/plate.ts';
import type { Plate } from '../src/art/plate.ts';
import { addHalo, haloSprite } from '../src/art/scene/fx.ts';
import { Canvas } from '../src/art/canvas.ts';
import { getTheme } from '../src/themes/index.ts';
import type { RGB } from '../src/term/color.ts';
import type { Block } from '../src/world/build.ts';
import { traitsFor } from '../src/world/character.ts';
import type { BuildFrame, Camera, FigureFrame, LabelFrame, SceneFrame } from '../src/world/frame.ts';
import type { NavGrid } from '../src/world/path.ts';
import type { PlacedProp, Room } from '../src/world/room.ts';
import type { Particle } from '../src/world/types.ts';
import type { PropArt, WorldDef } from '../src/worlds/types.ts';

// A small test room with one of everything a plate holds: a grey floor, a
// still prop and an animated one (which lays light round it, blended
// 'screen'), an overlay (a streak of rain that falls with time, and a glow
// blended 'screen'), a build and its pile, figures, the critter, bits,
// labels. Everything stands on whole units, so every point projects to a
// whole pixel and rings need no snapping.
const S = 4;
const W = 60;
const D = 60;
const H = 20;
const T = 4;

type Pt = [number, number];
const box = (v: { at(u: number, w: number, z: number): Pt; pen: { beginPath(): void; moveTo(x: number, y: number): void; lineTo(x: number, y: number): void; closePath(): void; fill(): void; fillStyle: unknown } }, len: number, dep: number, height: number, color: string) => {
  const pts: Pt[] = [];
  for (const u of [0, len]) for (const w of [0, dep]) for (const z of [0, height]) pts.push(v.at(u, w, z));
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const turn = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (q: Pt[]) => {
    const out: Pt[] = [];
    for (const v of q) {
      while (out.length >= 2 && turn(out[out.length - 2], out[out.length - 1], v) <= 0) out.pop();
      out.push(v);
    }
    return out.slice(0, -1);
  };
  const hull = [...half(p), ...half([...p].reverse())];
  v.pen.beginPath();
  hull.forEach(([x, y], i) => (i ? v.pen.lineTo(x, y) : v.pen.moveTo(x, y)));
  v.pen.closePath();
  v.pen.fillStyle = color;
  v.pen.fill();
};

const still: PropArt = { len: 8, dep: 6, height: 6, draw: (v) => box(v, 8, 6, 6, '#00aa00') };
// Changes colour every half second; worked, it turns blue.
const blinker: PropArt = {
  len: 6,
  dep: 4,
  height: 6,
  animated: true,
  draw(v) {
    box(v, 6, 4, 6, v.active ? '#0000ff' : Math.floor(v.t * 2) % 2 ? '#ff8800' : '#aa00aa');
    const [cx, cy] = v.at(3, 6, 0);
    v.pen.save();
    v.pen.globalCompositeOperation = 'screen';
    const g = v.pen.createRadialGradient(cx, cy, 0, cx, cy, 5 * v.s);
    g.addColorStop(0, 'rgba(160, 220, 255, 0.6)');
    g.addColorStop(1, 'rgba(160, 220, 255, 0)');
    v.pen.fillStyle = g;
    v.pen.beginPath();
    v.pen.arc(cx, cy, 5 * v.s, 0, Math.PI * 2);
    v.pen.fill();
    v.pen.restore();
  },
};

const cafe = getTheme('cafe')!;
const world: WorldDef = {
  ...cafe,
  id: 'plate-test',
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
    overlay(v) {
      // A streak on the back wall's line, falling once a second.
      const z = 14 - (v.t % 1) * 4;
      const [x0, y0] = v.at(12, T, z + 2);
      const [x1, y1] = v.at(12, T, z);
      v.pen.beginPath();
      v.pen.moveTo(x0, y0);
      v.pen.lineTo(x1, y1);
      v.pen.strokeStyle = '#d6e6f6';
      v.pen.globalAlpha = 0.55;
      v.pen.lineWidth = 1;
      v.pen.lineCap = 'round';
      v.pen.stroke();
      v.pen.globalAlpha = 1;
      // A warm glow breathing on the floor in the far corner.
      const [cx, cy] = v.at(52, 12, 0);
      const r = (5 + Math.sin(v.t * 3)) * v.s;
      v.pen.save();
      v.pen.globalCompositeOperation = 'screen';
      const g = v.pen.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, 'rgba(255, 154, 72, 0.5)');
      g.addColorStop(1, 'rgba(255, 154, 72, 0)');
      v.pen.fillStyle = g;
      v.pen.beginPath();
      v.pen.arc(cx, cy, r, 0, Math.PI * 2);
      v.pen.fill();
      v.pen.restore();
    },
  },
};

const place = (art: PropArt, x0: number, y0: number): PlacedProp => ({ art, wall: 'right', island: true, x0, y0, len: art.len, dep: art.dep, seed: 1 });
const ROOM: Room = { L: { W, D, H, T, slots: [] }, props: [place(still, 30, 30), place(blinker, 14, 40)], desks: [], nav: null as unknown as NavGrid, pois: [], supply: [], height: new Float32Array(0) };

function figure(id: string, x: number, y: number, o: Partial<FigureFrame> = {}): FigureFrame {
  return { id, x, y, z: 0, traits: traitsFor(id, 'lead'), costume: 'casual', pose: 'idle', poseT: 0, phase: 0, facing: { back: false, flip: false }, selected: false, hurt: false, sleeping: false, walking: false, ...o };
}

const bit = (kind: Particle['kind'], x: number, y: number, z: number, color: RGB = [255, 214, 120], glow = false): Particle => ({ kind, x, y, z, vx: 2, vy: -1, vz: 3, life: 1.5, color, glow, gravity: 0 });

const blocks: Block[] = [];
for (let z = 0; z < 3; z++) for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) blocks.push({ x: 44 + x, y: 40 + y, z, c: (x + z) % 2 });
const build = (complete: boolean): BuildFrame => ({
  shape: 'house',
  blocks: complete ? blocks : blocks.slice(0, 15),
  pending: complete ? [] : blocks.slice(15),
  colors: [[200, 120, 70], [230, 220, 190], [255, 240, 200]],
  progress: complete ? 1 : 15 / 27,
  complete,
  top: { x: 45, y: 41, z: 3 },
  pile: complete ? null : { x0: 50, y0: 50, x1: 53, y1: 53 },
  ghost: [120, 230, 255],
});

const label: LabelFrame = { col: 20, row: 3, w: 8, kind: 'name', color: [30, 24, 18], alpha: 0.55, text: 'atlas', ink: [255, 255, 255], bold: true };

function frame(o: Partial<SceneFrame> = {}, cam: { ox?: number; oy?: number } = {}): SceneFrame {
  const w = (W + D) * S + 40;
  const h = ((W + D) / 2 + H) * S + 40;
  return {
    world,
    room: ROOM,
    t: 0,
    lit: false,
    active: [false, false],
    camera: { s: S, ox: cam.ox ?? D * S + 20, oy: cam.oy ?? H * S + 20, w, h, cell: { w: 10, h: 20 }, cells: { x: 0, y: 0, w: w / 10, h: h / 20 } },
    figures: [figure('a', 24, 46, { emote: { kind: 'idea', t: 1 } }), figure('b', 36, 26, { selected: true })],
    critter: { kind: 'cat', body: [232, 145, 58], x: 40, y: 48, z: 0, flip: false, moving: false },
    builds: [build(false)],
    particles: [bit('steam', 17, 44, 9, [240, 240, 240]), bit('steam', 18, 43, 11, [240, 240, 240]), bit('spark', 33, 34, 7, [255, 214, 120], true), bit('confetti', 26, 30, 5, [200, 80, 60])],
    labels: [label],
    marks: [],
    ...o,
  };
}

// Per pixel, the largest channel difference.
function diff(a: Uint8ClampedArray, b: Uint8ClampedArray): Uint8Array {
  const d = new Uint8Array(a.length / 4);
  for (let i = 0; i < d.length; i++) d[i] = Math.max(Math.abs(a[4 * i] - b[4 * i]), Math.abs(a[4 * i + 1] - b[4 * i + 1]), Math.abs(a[4 * i + 2] - b[4 * i + 2]));
  return d;
}
const most = (d: Uint8Array) => d.reduce((m, v) => (v > m ? v : m), 0);
const keys = (p: Plate) => Object.fromEntries(p.layers.map((l) => [l.id, l.pic.key]));
const layer = (p: Plate, id: string) => p.layers.find((l) => l.id === id);

test('the plate composites to the picture painted straight, but for rounding', () => {
  const f = frame();
  const p = new Scene().plate(f);
  const d = diff(composite(p).data, new Scene().flat(f).data);
  let off = 0;
  for (const v of d) if (v) off++;
  assert.ok(most(d) <= 2, `worst ${most(d)}`);
  assert.ok(off < 0.02 * d.length, `${off} px off by 1 or 2`);
  // One of everything, bottom to top.
  const ids = p.layers.map((l) => l.id);
  const first = (pre: string) => ids.findIndex((id) => id.startsWith(pre));
  for (const pre of ['base', 'shadow:a', 'ring:b', 'prop:0', 'prop:1', 'build:0', 'pile:0', 'fig:a', 'critter', 'bits:', 'emote:a', 'overlay#', 'pill:0']) assert.ok(first(pre) >= 0, pre);
  assert.ok(ids[0].startsWith('base:'));
  assert.ok(first('ring:b') < first('prop:0') && first('emote:a') > first('fig:a') && first('overlay#') > first('emote:a') && first('pill:0') > first('overlay#'));
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const l of p.layers) assert.ok(Number.isInteger(l.x) && Number.isInteger(l.y), `${l.id} at ${l.x}, ${l.y}`);
  assert.deepEqual(
    p.layers.filter((l) => l.volatile).map((l) => l.id.replace(/[:#].*/, '')).filter((k, i, a) => a.indexOf(k) === i).sort(),
    ['bits', 'overlay', 'prop'],
    'what is drawn afresh: bits, the animated prop, the overlay',
  );
});

test('with the lights on it differs only round the glows, and the glows lighten', () => {
  const glowing = [bit('spark', 33, 34, 7, [255, 214, 120], true), bit('bolt', 22, 30, 9, [80, 140, 255], true), bit('glint', 40, 36, 12, [255, 241, 184], true)];
  const f = frame({ lit: true, particles: glowing, builds: [build(true)], labels: [] });
  const scene = new Scene();
  const p = scene.plate(f);
  const now = composite(p).data;
  const d = diff(now, new Scene().flat(f).data);
  const halos = p.layers.filter((l) => l.id.startsWith('glow:') || l.id.startsWith('beacon'));
  assert.equal(halos.length, 5, 'a halo a glowing bit, two on the finished build');
  const width = p.width;
  let far = 0;
  let near = 0;
  d.forEach((v, i) => {
    if (v <= 2) return;
    const x = i % width;
    const y = Math.floor(i / width);
    if (halos.some((l) => x >= l.x && y >= l.y && x < l.x + l.pic.img.width && y < l.y + l.pic.img.height)) near++;
    else far++;
  });
  assert.equal(far, 0, 'nothing differs away from the glows');
  assert.ok(near > 0);
  // Light, not smudges: over the floor (a mid grey) no pixel comes out
  // darker than with the glows left out, and all of them brighten. (Over
  // near-white things a strongly coloured halo greys them a little: one
  // alpha cannot lift each channel by its own share, see haloSprite.)
  const dark = composite(scene.plate({ ...f, particles: glowing.map((b) => ({ ...b, glow: false })) })).data;
  const lum = (px: Uint8ClampedArray, o: number) => 0.3 * px[o] + 0.59 * px[o + 1] + 0.11 * px[o + 2];
  let floor = 0;
  let lifted = 0;
  for (const l of halos.filter((h) => h.id.startsWith('glow:'))) {
    for (let y = l.y; y < l.y + l.pic.img.height; y++) {
      for (let x = l.x; x < l.x + l.pic.img.width; x++) {
        const o = 4 * (y * width + x);
        if (Math.abs(dark[o] - 128) > 1 || Math.abs(dark[o + 1] - 128) > 1 || Math.abs(dark[o + 2] - 128) > 1) continue;
        floor++;
        assert.ok(lum(now, o) >= lum(dark, o) - 1, `${l.id} darkens (${x}, ${y})`);
        if (lum(now, o) > lum(dark, o) + 1) lifted++;
      }
    }
  }
  assert.ok(floor > 500 && lifted > 0.5 * floor, `${lifted} of ${floor} floor px lifted`);
  // Over a mid grey a halo laid over comes out as blending it 'screen' does.
  const over = new Canvas(41, 41);
  over.clear('#808080');
  over.drawImage(haloSprite(20, [80, 140, 255], 0.7), 0, 0);
  const screened = new Canvas(41, 41);
  screened.clear('#808080');
  addHalo(screened.data, 41, 41, 20, 20, 20, [80, 140, 255], 0.7);
  assert.ok(most(diff(over.data, screened.data)) <= 2);
});

test('a pan moves every picture and redraws none', () => {
  const scene = new Scene();
  const a = scene.plate(frame({ t: 0.01 }));
  const b = scene.plate(frame({ t: 0.01 }, { ox: D * S + 20 + 7, oy: H * S + 20 - 5 }));
  for (const l of a.layers) {
    const now = layer(b, l.id);
    if (!now && l.id.startsWith('base:')) continue;
    assert.equal(now?.pic.key, l.pic.key, l.id);
    if (!l.id.startsWith('pill:')) assert.deepEqual([now!.x - l.x, now!.y - l.y], [7, -5], l.id);
  }
  for (const l of b.layers) assert.ok(layer(a, l.id) || l.id.startsWith('base:'), l.id);
});

test('what animates in place is drawn again per ambient step, and keeps its key when it comes out the same', () => {
  const scene = new Scene();
  const dt = 1 / AMBIENT_FPS;
  const steam = () => [bit('steam', 26, 54, 9, [240, 240, 240])];
  const at = (t: number, o: Partial<SceneFrame> = {}) => scene.plate(frame({ t, particles: steam(), ...o }));
  // The steam rises a little every frame; within a step its picture is
  // kept, the next step draws it again.
  const puff = (p: Plate) => {
    const l = p.layers.filter((q) => q.id.startsWith('bits:'));
    assert.deepEqual(l.map((q) => q.id), ['bits:floor#0'], 'one puff, in front of the floor');
    return l[0].pic.key;
  };
  const moved = (t: number, z: number) => scene.plate(frame({ t, particles: [{ ...steam()[0], z }] }));
  const s0 = puff(at(0.01));
  assert.equal(puff(moved(0.02, 9.2)), s0, 'within the step');
  assert.notEqual(puff(moved(dt + 0.01, 9.4)), s0, 'the next step');
  // A spark is drawn again every frame it moves.
  const spark = (t: number, z: number) => scene.plate(frame({ t, particles: [bit('spark', 33, 34, z)] })).layers.find((l) => l.id.startsWith('bits:'))!.pic.key;
  assert.notEqual(spark(0.03, 7), spark(0.04, 7.3), 'moved by part of a pixel');
  // The animated prop: drawn per step; the same pixels keep the key, new
  // ones (half a second on, or worked) take a new one.
  const before = scene.stats.animated;
  const p0 = layer(at(2.01), 'prop:1')!.pic.key;
  at(2.02);
  at(2.03);
  assert.ok(scene.stats.animated - before <= 2, 'not every frame');
  assert.equal(layer(at(2.01 + 2 * dt), 'prop:1')!.pic.key, p0, 'drawn again, the same');
  assert.notEqual(layer(at(2.51 + 2 * dt), 'prop:1')!.pic.key, p0, 'half a second on');
  assert.notEqual(layer(at(2.52 + 2 * dt, { active: [false, true] }), 'prop:1')!.pic.key, layer(at(2.52 + 2 * dt), 'prop:1')!.pic.key, 'worked');
});

test('the overlay comes in pieces round what it paints, and its light is right over the base', () => {
  const scene = new Scene();
  const f = frame({ figures: [], critter: null, builds: [], particles: [], labels: [] });
  const p = scene.plate(f);
  const pieces = p.layers.filter((l) => l.id.startsWith('overlay#'));
  assert.ok(pieces.length >= 2, 'the streak and the glow apart');
  const area = pieces.reduce((n, l) => n + l.pic.img.width * l.pic.img.height, 0);
  assert.ok(area < 0.05 * p.width * p.height, `${area} px`);
  // The glow was blended 'screen': laid over the base it gives what
  // blending it there gives (a picture of it on its own would darken).
  const d = diff(composite(p).data, new Scene().flat(f).data);
  assert.ok(most(d) <= 2, `worst ${most(d)}`);
  // It falls with time, drawn per ambient step.
  const later = scene.plate({ ...f, t: 0.5 });
  assert.notDeepEqual(
    later.layers.filter((l) => l.id.startsWith('overlay#')).map((l) => l.pic.key),
    pieces.map((l) => l.pic.key),
  );
});

test("the world's tint is baked into copies of the sprites, kept from frame to frame", () => {
  const tinted: WorldDef = { ...world, id: 'plate-tint', ambient: { tint: [40, 60, 255], strength: 0.5 } };
  const f = frame({ world: tinted, lit: true, particles: [bit('steam', 17, 44, 9, [240, 240, 240])] });
  const scene = new Scene();
  const a = scene.plate(f);
  const b = scene.plate({ ...f, t: 0.01 });
  assert.equal(layer(b, 'fig:a')!.pic.key, layer(a, 'fig:a')!.pic.key);
  assert.notEqual(layer(a, 'fig:a')!.pic.key, layer(new Scene().plate(frame()), 'fig:a')!.pic.key, 'a tinted copy');
  const d = diff(composite(a).data, new Scene().flat(f).data);
  assert.ok(most(d) <= 3, `worst ${most(d)}`);
});

test('warm gets the cameras a key away ready: the plate there places what it returned, painting nothing', () => {
  const scene = new Scene();
  // Desk upgrades too.
  const f = frame({ lit: false, trinkets: [{ id: 'lead', kind: 'mug', x: 26, y: 44, color: [200, 40, 160] }, { id: 'sub', kind: 'trophy', x: 38, y: 28, color: [40, 160, 200] }] });
  const zoomed: Camera = { ...f.camera, s: S * 1.5, ox: f.camera.ox - 100, oy: f.camera.oy - 60 };
  const g: SceneFrame = { ...f, next: [zoomed] };
  scene.plate(g);
  // A deadline already past: nothing is started.
  const idle = { ...scene.stats };
  assert.deepEqual(scene.warm(g, performance.now() - 1), []);
  assert.deepEqual(scene.stats, idle);
  const pics = scene.warm(g, Infinity);
  assert.ok(pics.length > 10, `${pics.length} pictures`);
  // Done: nothing more until the view or the cameras change.
  const done = { ...scene.stats };
  assert.deepEqual(scene.warm(g, Infinity), []);
  assert.deepEqual(scene.stats, done);
  // The key pressed: no tile painted, no sprite drawn; every tile, sprite,
  // shadow, ring and emote placed is one warm returned.
  const keys = new Set(pics.map((p) => p.key));
  const z = scene.plate({ ...g, camera: zoomed });
  assert.equal(scene.stats.tiles, done.tiles);
  assert.equal(scene.stats.props, done.props);
  const kept = z.layers.filter((l) => /^(base|prop|floor|build|pile|fig|critter|shadow|ring|emote|trinket)\b/.test(l.id) && !l.volatile);
  assert.ok(kept.filter((l) => l.id.startsWith('base:')).length > 4);
  assert.equal(kept.filter((l) => l.id.startsWith('trinket:')).length, 2);
  for (const l of kept) assert.ok(keys.has(l.pic.key), `${l.id} was not warmed`);
  // Tiles keep their keys for as long as they are kept.
  const again = scene.plate({ ...g, t: 0.5, camera: zoomed });
  for (const l of kept.filter((q) => q.id.startsWith('base:'))) assert.equal(layer(again, l.id)?.pic.key, l.pic.key, l.id);
});
