import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas } from '../src/art/canvas.ts';
import {
  alpha,
  boxFaces,
  contactShadow,
  floorQuad,
  frame,
  glow,
  hexOf,
  ink,
  inkWidth,
  isoBox,
  isoCylinder,
  mix,
  project,
  rgbOf,
  scaleOf,
  shade,
  type At,
} from '../src/art/iso.ts';

const px = (c: Canvas, x: number, y: number) => {
  const o = (Math.floor(y) * c.width + Math.floor(x)) * 4;
  return [...c.data.subarray(o, o + 4)];
};
const centroid = (pts: Array<[number, number]>) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];

test('colour helpers', () => {
  assert.deepEqual(rgbOf('#ff8000'), [255, 128, 0]);
  assert.equal(hexOf([255, 128, 0]), '#ff8000');
  assert.equal(hexOf([255, 128, 0], 0.5), '#ff800080');
  assert.equal(alpha('#ff8000', 0.25), '#ff800040');
  assert.equal(mix('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mix('#ff000000', '#ff0000', 0.5), '#ff000080');
  const base = '#6080a0';
  const [r, g, b] = rgbOf(base);
  const lit = rgbOf(shade(base, 0.12));
  const dark = rgbOf(shade(base, -0.18));
  assert.ok(lit[0] > r && lit[1] > g && lit[2] > b);
  assert.ok(dark[0] < r && dark[1] < g && dark[2] < b);
  assert.equal(shade(base, 0), base);
  const k = rgbOf(ink('#c03030'));
  assert.ok(k[0] < 60 && k[0] > k[2]); // dark, still warm
  assert.equal(inkWidth(2), 1.5);
  assert.equal(inkWidth(10), 3);
  assert.throws(() => shade('bogus', 0.1), TypeError);
});

test('project and frame follow the spec projection and wall axes', () => {
  const P = project(100, 50, 4);
  assert.deepEqual(P(0, 0, 0), [100, 50]);
  assert.deepEqual(P(1, 0, 0), [104, 52]);
  assert.deepEqual(P(0, 1, 0), [96, 52]);
  assert.deepEqual(P(0, 0, 1), [100, 46]);
  assert.equal(scaleOf(P), 4);
  const L = frame(P, 'left', 2, 10);
  const R = frame(P, 'right', 10, 2);
  assert.deepEqual(L(3, 1, 5), P(3, 13, 5)); // u -> +y, v -> +x
  assert.deepEqual(R(3, 1, 5), P(13, 3, 5)); // u -> +x, v -> +y
});

test('boxFaces keeps the top and the two room-facing sides, in both wall frames', () => {
  const P = project(200, 100, 5);
  const right = boxFaces(frame(P, 'right', 10, 2), 0, 0, 0, 8, 5, 6);
  assert.deepEqual(right.map((f) => `${f.side}:${f.kind}`).sort(), ['+u:right', '+v:left', '+z:top']);
  const left = boxFaces(frame(P, 'left', 2, 10), 0, 0, 0, 8, 5, 6);
  assert.deepEqual(left.map((f) => `${f.side}:${f.kind}`).sort(), ['+u:left', '+v:right', '+z:top']);
  // negative extents describe the same box
  const neg = boxFaces(frame(P, 'right', 10, 2), 8, 5, 6, -8, -5, -6);
  assert.deepEqual(neg.map((f) => f.side).sort(), right.map((f) => f.side).sort());
  // a flat box shows only its top
  assert.deepEqual(boxFaces(P, 0, 0, 0, 4, 4, 0).map((f) => f.side), ['+z']);
});

test('isoBox paints each visible face its shade, culled by winding in either frame', () => {
  const P = project(160, 60, 6);
  for (const wall of ['left', 'right'] as const) {
    const at: At = wall === 'left' ? frame(P, 'left', 2, 4) : frame(P, 'right', 4, 2);
    const c = new Canvas(320, 220);
    isoBox(c, at, 0, 0, 0, 10, 6, 8, '#808080', { line: 0, top: '#ff0000', left: '#00ff00', right: '#0000ff' });
    for (const f of boxFaces(at, 0, 0, 0, 10, 6, 8)) {
      const [x, y] = centroid(f.pts);
      const want = { top: [255, 0, 0, 255], left: [0, 255, 0, 255], right: [0, 0, 255, 255] }[f.kind];
      assert.deepEqual(px(c, x, y), want, `${wall} ${f.side}`);
    }
    // the hidden back corner lies inside the silhouette: covered by visible faces only
    const back = at(0, 0, 0);
    assert.equal(px(c, back[0], back[1] - 6)[3], 255);
    // nothing outside the silhouette
    const far = at(12, 8, 0);
    assert.equal(px(c, far[0], far[1] + 4)[3], 0);
  }
});

test('isoBox outlines the silhouette in ink and the inner edges thinner', () => {
  const P = project(160, 40, 6);
  const at = frame(P, 'right', 4, 2);
  const c = new Canvas(320, 220);
  c.clear('#ffffff');
  isoBox(c, at, 0, 0, 0, 10, 6, 8, '#d0a060', { ink: '#000000' });
  // bottom-most corner of the silhouette is outlined
  const [bx, by] = at(10, 6, 0);
  const ink = px(c, bx, by - 0.5);
  assert.ok(ink[0] < 60 && ink[1] < 60 && ink[2] < 60, `${ink}`);
  // the near vertical edge (between the two visible sides) is inked
  const [ex, ey] = at(10, 6, 4);
  assert.ok(px(c, ex, ey)[0] < 120);
  // the face interior is not
  const [fx, fy] = centroid(boxFaces(at, 0, 0, 0, 10, 6, 8).find((f) => f.kind === 'left')!.pts);
  assert.ok(px(c, fx, fy)[0] > 150);
  // rounded corners pull the silhouette in at a corner
  const r = new Canvas(320, 220);
  isoBox(r, at, 0, 0, 0, 10, 6, 8, '#d0a060', { line: 0, round: 1.5 });
  const [tx, ty] = at(0, 0, 8); // the top-back corner
  assert.equal(px(r, tx, ty + 1)[3], 0);
});

test('isoCylinder: top ellipse, shaded side, ink silhouette', () => {
  const P = project(100, 40, 6);
  const c = new Canvas(200, 160);
  c.clear('#ffffff');
  isoCylinder(c, P, 4, 4, 0, 4, 8, '#3080d0', { top: '#ff0000', ink: '#000000' });
  const [tx, ty] = P(4, 4, 8);
  assert.deepEqual(px(c, tx, ty), [255, 0, 0, 255]);
  const [sx, sy] = P(4, 4, 4);
  const r = 4 * 6 * Math.SQRT2; // screen half-width
  const leftSide = px(c, sx - r * 0.6, sy + 4);
  const rightSide = px(c, sx + r * 0.6, sy + 4);
  assert.ok(leftSide[2] > rightSide[2], `${leftSide} vs ${rightSide}`); // lit left, dark right
  const edge = px(c, sx - r, sy);
  assert.ok(edge[0] < 80 && edge[2] < 80, `${edge}`);
  assert.deepEqual(px(c, sx - r - 4, sy), [255, 255, 255, 255]);
  // the same cylinder through the left wall frame lands in the same place
  const d = new Canvas(200, 160);
  d.clear('#ffffff');
  isoCylinder(d, frame(P, 'left', 0, 0), 4, 4, 0, 4, 8, '#3080d0', { top: '#ff0000', ink: '#000000' });
  let diff = 0;
  for (let i = 0; i < c.data.length; i++) diff += Math.abs(c.data[i] - d.data[i]);
  assert.ok(diff / c.data.length < 0.5, `${diff / c.data.length}`);
});

test('floorQuad covers its projected parallelogram', () => {
  const P = project(100, 20, 5);
  const c = new Canvas(200, 120);
  floorQuad(c, P, 2, 2, 10, 6, 0, '#000000');
  let a = 0;
  for (let i = 3; i < c.data.length; i += 4) a += c.data[i] / 255;
  // |e_x x e_y| = s * s / 2 + s * s / 2 = s^2 per unit square
  assert.ok(Math.abs(a / (60 * 25) - 1) < 0.005, `${a}`);
});

test('contactShadow is a soft ellipse; glow brightens with screen', () => {
  const P = project(100, 20, 5);
  const c = new Canvas(200, 120);
  contactShadow(c, P, 10, 10, 4, 4, 0.25);
  const [cx, cy] = P(10, 10, 0);
  const mid = px(c, cx, cy)[3];
  assert.ok(Math.abs(mid - 64) <= 3, `${mid}`);
  const r = 4 * 5 * Math.SQRT2;
  assert.ok(px(c, cx + r * 0.9, cy)[3] < mid / 2);
  assert.equal(px(c, cx + r + 2, cy)[3], 0);
  assert.equal(px(c, cx, cy + r * 0.6)[3], 0); // squashed vertically
  assert.ok(px(c, cx + r * 0.6, cy)[3] > 0);
  const g = new Canvas(100, 100);
  g.clear('#102030');
  glow(g, 50, 50, 30, '#ffcc66', 0.6);
  const hot = px(g, 50, 50);
  assert.ok(hot[0] > 0x10 + 100 && hot[3] === 255, `${hot}`);
  assert.deepEqual(px(g, 50, 85), [0x10, 0x20, 0x30, 255]);
  assert.ok(px(g, 65, 50)[0] < hot[0]);
});
