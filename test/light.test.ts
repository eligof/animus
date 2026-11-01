import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import { composite } from '../src/art/plate.ts';
import { encodeRgb } from '../src/art/png.ts';
import { Scene } from '../src/art/scene.ts';
import { encodeRgba } from '../src/art/scene/front.ts';
import { gradesOf, paintLights, rigOf, shellLight, tuneOf } from '../src/art/scene/light.ts';
import { PlateStream } from '../src/term/plates.ts';
import { getTheme } from '../src/themes/index.ts';
import type { RGB } from '../src/term/color.ts';
import { traitsFor } from '../src/world/character.ts';
import type { FigureFrame, SceneFrame } from '../src/world/frame.ts';
import type { NavGrid } from '../src/world/path.ts';
import type { PlacedProp, Room } from '../src/world/room.ts';
import type { PropArt, RoomLight, RoomView, WorldDef } from '../src/worlds/types.ts';
import { budget } from './helpers.ts';

// A test room: a flat grey floor and two flat walls of one paler grey, the
// light on (the planes as they come) and lights declared on them. Whole
// units, s 4: every point a whole pixel.
const S = 4;
const W = 60;
const D = 60;
const H = 24;
const T = 4;
const FLOOR = '#808080';
const WALL = '#a0a0a0';

type Pt = [number, number];
const quad = (v: RoomView, pts: Array<[number, number, number]>, color: string) => {
  v.pen.beginPath();
  pts.map((p) => v.at(...p)).forEach(([x, y], i) => (i ? v.pen.lineTo(x, y) : v.pen.moveTo(x, y)));
  v.pen.closePath();
  v.pen.fillStyle = color;
  v.pen.fill();
};

const seen: { room: Array<boolean | undefined>; prop: Array<boolean | undefined> } = { room: [], prop: [] };
const shell = (v: RoomView) => {
  seen.room.push(v.lit);
  quad(v, [[T, T, 0], [W, T, 0], [W, D, 0], [T, D, 0]], FLOOR);
  quad(v, [[T, T, 0], [W, T, 0], [W, T, H], [T, T, H]], WALL);
  quad(v, [[T, T, 0], [T, D, 0], [T, D, H], [T, T, H]], WALL);
};

const base = getTheme('cafe')!;
const world: WorldDef = { ...base, id: 'light-test', backdrop: [20, 20, 30], ink: '#101018', ambient: undefined, light: undefined, room: { draw: shell } };

// A lamp on the right wall, a fire on the left, a window on the right.
const LAMP: RoomLight = { kind: 'lamp', wall: 'right', u: 20, v: 1, z: 14 };
const FIRE: RoomLight = { kind: 'fire', wall: 'left', u: 40, v: 1, z: 3 };
const PANE: RoomLight = { kind: 'window', wall: 'right', u: 44, w: 8, z0: 6, z1: 18, bars: 1 };
const lit = (lights: RoomLight[], o: Partial<WorldDef> = {}): WorldDef => ({ ...world, ...o, room: { draw: shell, lights: () => lights } });

// A still prop the size of a crate that notes whether the lights were on
// for it, and draws its lamp lit or not.
const crate: PropArt = {
  len: 4,
  dep: 4,
  height: 4,
  light: [{ kind: 'lamp', u: 2, v: 2, z: 5 }],
  draw(v) {
    seen.prop.push(v.lit);
    const pts: Pt[] = [];
    for (const u of [0, 4]) for (const w of [0, 4]) for (const z of [0, 4]) pts.push(v.at(u, w, z));
    v.pen.beginPath();
    pts.forEach(([x, y], i) => (i ? v.pen.lineTo(x, y) : v.pen.moveTo(x, y)));
    v.pen.fillStyle = v.lit === false ? '#664422' : '#ffcc66';
    v.pen.fill();
  },
};
const place = (art: PropArt, x0: number, y0: number): PlacedProp => ({ art, wall: 'right', island: true, x0, y0, len: art.len, dep: art.dep, seed: 1 });
const room = (props: PlacedProp[] = []): Room => ({ L: { W, D, H, T, slots: [] }, props, desks: [], keepOut: new Uint8Array(0), nav: null as unknown as NavGrid, pois: [], supply: [], height: new Float32Array(0), npcs: [] });

function figure(id: string, x: number, y: number, o: Partial<FigureFrame> = {}): FigureFrame {
  return { id, x, y, z: 0, traits: traitsFor(id, 'lead'), costume: 'casual', pose: 'idle', poseT: 0, phase: 0, facing: { back: false, flip: false }, selected: false, hurt: false, sleeping: false, walking: false, ...o };
}

function frame(w: WorldDef, r: Room, o: Partial<SceneFrame> = {}): SceneFrame {
  const cw = (W + D) * S + 40;
  const ch = ((W + D) / 2 + H) * S + 40;
  return {
    world: w,
    room: r,
    t: 0,
    lit: true,
    active: r.props.map(() => false),
    camera: { s: S, ox: D * S + 20, oy: H * S + 20, w: cw, h: ch, cell: { w: 10, h: 20 }, cells: { x: 0, y: 0, w: cw / 10, h: ch / 20 } },
    figures: [],
    critter: null,
    builds: [],
    particles: [],
    labels: [],
    marks: [],
    ...o,
  };
}

// The picture of a frame, and its pixel at a world point.
const shot = (f: SceneFrame) => new Scene().render(f).bitmap;
const at = (f: SceneFrame, b: { width: number; data: Uint8ClampedArray }, x: number, y: number, z: number): RGB => {
  const px = Math.round(f.camera.ox + (x - y) * S);
  const py = Math.round(f.camera.oy + ((x + y) * S) / 2 - z * S);
  const o = 4 * (py * b.width + px);
  return [b.data[o], b.data[o + 1], b.data[o + 2]];
};
const lum = (c: RGB) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
// Mean luminance of a wall's face (x or y = T) over its middle.
function wallLum(f: SceneFrame, b: { width: number; data: Uint8ClampedArray }, side: 'left' | 'right'): number {
  let sum = 0;
  let n = 0;
  for (let a = T + 8; a <= W - 8; a += 2) {
    for (let z = 2; z <= H - 2; z += 2) {
      sum += lum(side === 'right' ? at(f, b, a, T + 0.01, z) : at(f, b, T + 0.01, a, z));
      n++;
    }
  }
  return sum / n;
}

const OFF = { ao: 0, falloff: 0, top: 0, turn: 0, backs: 0 };

test('the shell pass shades the seams and the back corner, darkens the left wall toward the rule, and keeps the walkway light', () => {
  const f = frame(world, room());
  const b = shot(f);
  const flat = shot(frame({ ...world, light: OFF }, room()));
  // turned off it leaves the room as drawn
  assert.deepEqual(at(f, flat, 30, 30, 0), [128, 128, 128]);
  assert.deepEqual(at(f, flat, 30, T, 10), [160, 160, 160]);
  // the floor at the seam and in the corner darker than mid-floor
  const mid = lum(at(f, b, 34, 34, 0));
  assert.ok(lum(at(f, b, T + 0.5, 30, 0)) < mid - 15, 'the left seam');
  assert.ok(lum(at(f, b, 30, T + 0.5, 0)) < mid - 15, 'the right seam');
  assert.ok(lum(at(f, b, T + 1, T + 1, 0)) < lum(at(f, b, T + 0.5, 30, 0)), 'the corner deepest');
  // the walkway in front is near as light as the middle
  assert.ok(lum(at(f, b, W - 6, D - 6, 0)) > mid - 15, 'the front');
  assert.ok(mid >= 126, `the middle stays lit: ${mid}`);
  // the walls: the left the darker, toward the art rule's 0.82
  const ratio = wallLum(f, b, 'left') / wallLum(f, b, 'right');
  assert.ok(ratio > 0.78 && ratio < 0.92, `left / right ${ratio.toFixed(3)}`);
  assert.ok(lum(at(f, b, 30, T + 0.01, H - 1)) < lum(at(f, b, 30, T + 0.01, H * 0.4)), 'darker toward the top');
});

test('a prop against a wall casts a soft shadow on it, an island none', () => {
  const tall: PropArt = { len: 6, dep: 3, height: 12, draw: () => {} };
  const against: PlacedProp = { art: tall, wall: 'right', island: false, x0: 24, y0: T, len: 6, dep: 3, seed: 1 };
  const f = frame(world, room([against]));
  const g = frame(world, room([{ ...against, island: true, y0: 20 }]));
  const point: [number, number, number] = [28, T + 0.01, 8];
  assert.ok(lum(at(f, shot(f), ...point)) < lum(at(g, shot(g), ...point)) - 4);
});

test('declared lights pool on the floor, wash their wall and glow; at night the lamp is off and the fire burns on', () => {
  const none = frame(world, room([place({ ...crate, light: undefined }, 40, 40)]));
  const on = frame(lit([LAMP, FIRE]), room([place(crate, 40, 40)]));
  const [a, b] = [shot(none), shot(on)];
  // the lamp's pool, thrown out from its wall, and its wash above it
  const pool: [number, number, number] = [20, T + 1 + 0.3 * 14 * (1 - 1 / 6), 0];
  assert.ok(lum(at(on, b, ...pool)) > lum(at(none, a, ...pool)) + 20, 'a pool on the floor');
  assert.ok(lum(at(on, b, 20, T + 0.01, 13)) > lum(at(none, a, 20, T + 0.01, 13)) + 10, 'a wash on its wall');
  // visible on a bright floor too: warmer, not only lighter
  const [p, q] = [at(none, a, ...pool), at(on, b, ...pool)];
  assert.ok(q[0] - q[2] > p[0] - p[2] + 10, `warm: ${p} -> ${q}`);
  // the crate's own lamp pools round it on the floor
  assert.ok(lum(at(on, b, 42 + 4, 42, 0)) > lum(at(none, a, 42 + 4, 42, 0)) + 10, 'the prop light');
  // halos: one a light that shines, in the glows layer, none at night but the fire's
  const halos = (f: SceneFrame) => new Scene().plate(f).layers.filter((l) => l.id.startsWith('light:')).length;
  assert.equal(halos(on), 3);
  assert.equal(halos({ ...on, lit: false }), 1);
  // at night: no pool where the lamp was, the fire's still there
  const dark = { ...on, lit: false };
  const nd = { ...none, lit: false };
  const [c, d] = [shot(nd), shot(dark)];
  assert.ok(Math.abs(lum(at(dark, d, ...pool)) - lum(at(nd, c, ...pool))) <= 2, 'the lamp off');
  const fire: [number, number, number] = [T + 1 + 0.3 * 3 * (1 - 1 / 6), 40, 0];
  assert.ok(lum(at(dark, d, ...fire)) > lum(at(nd, c, ...fire)) + 30, 'the fire lights the night');
});

test('a window throws its panes on the floor away from the light (from the upper left), cut by its bars; moonlight at night', () => {
  const none = frame(world, room());
  const on = frame(lit([PANE]), room());
  const [a, b] = [shot(none), shot(on)];
  // the opening (44 +- 4, z 6..18) thrown along the light: x by z / 1.6,
  // y by z / 3.2; its middle row, z 12
  const inPatch = (u: number): [number, number, number] => [u + 12 / 1.6, T + 12 / 3.2, 0];
  for (const u of [41.5, 46.5]) assert.ok(lum(at(on, b, ...inPatch(u))) > lum(at(none, a, ...inPatch(u))) + 12, `lit at ${u}`);
  // under the bar (u 44), less
  assert.ok(lum(at(on, b, ...inPatch(44))) < lum(at(on, b, ...inPatch(41.5))) - 6, 'the bar');
  // fading out to nothing at its far end (z near 18)
  const far: [number, number, number] = [41.5 + 17.6 / 1.6, T + 17.6 / 3.2, 0];
  assert.ok(Math.abs(lum(at(on, b, ...far)) - lum(at(none, a, ...far))) <= 4, 'no hard far edge');
  // nothing on the floor straight out in front of it
  const front: [number, number, number] = [44 - 4, T + 6, 0];
  assert.ok(Math.abs(lum(at(on, b, ...front)) - lum(at(none, a, ...front))) <= 2);
  // at night the patch is cool
  const dark = { ...on, lit: false };
  const c = at(dark, shot(dark), ...inPatch(41.5));
  assert.ok(c[2] > c[0] + 8, `moonlight ${c}`);
});

test('the lights off: the room cool and dim, the crew dimmed less, emotes and labels not at all; the views told so', () => {
  const r = room([place(crate, 40, 40)]);
  const f = frame(world, r, { figures: [figure('a', 30, 46, { emote: { kind: 'idea', t: 1 } })] });
  const g = gradesOf(world, false);
  assert.ok(g.room && g.fig && g.emit, 'graded at night');
  assert.equal(gradesOf(world, true).room, null, 'not with the lights on');
  const [rf, ff, ef] = [g.room!.rgb, g.fig!.rgb, g.emit!.rgb];
  assert.ok(rf[2] > rf[0] && rf[0] < 200, `cool and dim: ${rf}`);
  assert.ok(ff[0] > rf[0] && ef[0] > rf[0], 'the crew and what glows less');
  seen.room.length = 0;
  seen.prop.length = 0;
  const day = shot(f);
  const night = shot({ ...f, lit: false });
  assert.ok(seen.room.includes(true) && seen.room.includes(false), 'the room view knows');
  assert.ok(seen.prop.includes(true) && seen.prop.includes(false), 'the prop view knows');
  // the whole room changes, clearly: the floor and both walls
  let changed = 0;
  let n = 0;
  for (let x = T + 1; x < W; x += 3) {
    for (let y = T + 1; y < D; y += 3) {
      if (x >= 39 && x <= 45 && y >= 39 && y <= 45) continue;
      n++;
      const [d, e] = [at(f, day, x, y, 0), at(f, night, x, y, 0)];
      if (lum(d) - lum(e) > 20 && e[2] - e[0] > d[2] - d[0]) changed++;
    }
  }
  assert.ok(changed > 0.9 * n, `${changed} of ${n} floor points darker and cooler`);
  assert.ok(wallLum(f, night, 'right') < wallLum(f, day, 'right') - 25, 'the walls dimmer');
  // the emote is the same picture lit or not
  const key = (p: SceneFrame) => new Scene().plate(p).layers.find((l) => l.id === 'emote:a')!.pic.key;
  assert.equal(key({ ...f, lit: false }), key(f));
});

test('the evening tint lies over the room and its props in full, over the crew by half (or as the world says)', () => {
  const amb: WorldDef = { ...world, ambient: { tint: [80, 90, 200], strength: 0.4 } };
  const g = gradesOf(amb, true);
  const k = (c: number) => 1 - 0.4 + (0.4 * c) / 255;
  assert.ok(Math.abs(g.room!.rgb[0] - 255 * k(80)) < 0.01);
  assert.ok(Math.abs(g.fig!.rgb[0] - 255 * (1 - 0.2 + (0.2 * 80) / 255)) < 0.01, 'half on the crew');
  assert.equal(gradesOf({ ...amb, ambient: { ...amb.ambient!, figures: 0 } }, true).fig, null, 'none if it says');
  // at night the evening gives way to the night (by as much as it is
  // strong), not multiplied whole under it
  const n = gradesOf(amb, false).room!.rgb[0] / 255;
  const night = 1 - 0.5 + (0.5 * 62) / 255;
  assert.ok(Math.abs(n - night * (1 - 0.2 + (0.2 * 80) / 255)) < 0.002, `${n}`);
  // the crew takes 0.45 of the night as it comes
  assert.ok(Math.abs(gradesOf(world, false).fig!.rgb[0] / 255 - (1 - 0.225 + (0.225 * 62) / 255)) < 0.002);
  // a lamp's pool shines over it: warmer than the tinted floor round it
  const f = frame(lit([LAMP], { ambient: amb.ambient }), room());
  const b = shot(f);
  const c = at(f, b, 20, T + 4.5, 0);
  const far = at(f, b, 40, 40, 0);
  assert.ok(c[0] - c[2] > far[0] - far[2] + 20, `${c} by ${far}`);
});

test('all of it is drawn once: frame to frame, lit or not, only placements go to the terminal; the switch paints the base once', () => {
  const w = lit([LAMP, FIRE, PANE], { ambient: { tint: [120, 112, 168], strength: 0.3 } });
  const r = room([place(crate, 40, 40)]);
  const scene = new Scene();
  const stream = new PlateStream({ encode: (b, opaque) => (opaque ? encodeRgb(b, 0) : encodeRgba(b, 1)) });
  const sent = (out: string) => (out.match(/a=[tT]/g) ?? []).length;
  for (const [lights, fresh] of [[true, true], [false, true], [true, false]]) {
    const f = frame(w, r, { lit: lights, figures: [figure('a', 30, 46)] });
    const tiles = scene.stats.tiles;
    const first = stream.step(scene.plate(f));
    const painted = scene.stats.tiles - tiles;
    // switched for the first time the base is painted and sent; switched
    // back, its tiles are kept
    if (fresh) assert.ok(painted > 0 && sent(first) > 0, 'the new look painted and sent');
    else assert.equal(painted, 0, 'switched back: the base kept');
    for (let k = 1; k <= 5; k++) {
      const out = stream.step(scene.plate({ ...f, t: k * 0.07 }));
      assert.equal(sent(out), 0, `frame ${k}: no pixels`);
    }
    assert.equal(scene.stats.tiles - tiles, painted, 'and not again');
  }
});

test('a small light hung high (a string bulb) lights the floor little, close under it', () => {
  const bulb: RoomLight = { kind: 'glow', wall: 'right', u: 30, v: 0.5, z: 20, r: 1, color: '#ffcf7a' };
  const none = frame(world, room());
  const on = frame(lit([bulb]), room());
  const [a, b] = [shot(none), shot(on)];
  for (let y = T + 2; y < 20; y += 1) assert.ok(Math.abs(lum(at(on, b, 30, y, 0)) - lum(at(none, a, 30, y, 0))) <= 3, `a spot on the floor at y ${y}`);
});

test('lights declared on a room are found once a room, in world units, on their wall', () => {
  let asked = 0;
  const w: WorldDef = { ...world, room: { draw: shell, lights: () => (asked++, [LAMP, FIRE, PANE]) } };
  const r = room([place(crate, 40, 40)]);
  const rig = rigOf(w, r, true);
  assert.equal(rigOf(w, r, true), rig);
  rigOf(w, r, false);
  assert.equal(asked, 2, 'once each way');
  assert.deepEqual(rig.glows.map((g) => [g.kind, g.x, g.y, g.z]), [['lamp', 20, T + 1, 14], ['fire', T + 1, 40, 3], ['lamp', 42, 42, 5]]);
  assert.deepEqual(rig.panes.map((p) => [p.wall, p.a0, p.a1, p.z0, p.z1]), [['right', 40, 48, 6, 18]]);
  assert.deepEqual(rigOf(w, r, false).glows.map((g) => g.kind), ['fire'], 'lamps off at night');
});

test('the light pass costs little on a base tile', () => {
  const cafe = getTheme('cafe')!;
  const L = { W: 97, D: 97, H: 40, T: 6 };
  const tile = new Canvas(256, 256);
  const w = { ...cafe, room: { ...cafe.room, lights: () => [LAMP, FIRE, PANE, { ...LAMP, u: 60 }, { ...FIRE, wall: 'right' as const, u: 70 }] } };
  const r = { ...room(), L: { ...L, slots: [] } };
  const rig = rigOf(w, r, true);
  const k = tuneOf(w);
  // a tile where the corner, both walls and the floor meet, at the café's
  // scale at zoom 2: about 1.5 ms on a fast desktop and up to 6 on a CI
  // runner; the budget catches a pass that gets several times slower
  const s = 19;
  budget('the shell pass and the lights on a tile', () => {
    shellLight(tile, L, [], [40, 30, 20], s, 128, 200, k);
    paintLights(tile, L, rig, s, 128, 200, k.pools);
  }, 10, { runs: 10 });
});
