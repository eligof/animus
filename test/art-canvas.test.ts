import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Canvas, blur, parseColor } from '../src/art/canvas.ts';

const px = (c: Canvas, x: number, y: number) => Array.from(c.data.subarray((y * c.width + x) * 4, (y * c.width + x) * 4 + 4));
const alphaAt = (c: Canvas, x: number, y: number) => c.data[(y * c.width + x) * 4 + 3];
const area = (c: Canvas) => {
  let s = 0;
  for (let i = 3; i < c.data.length; i += 4) s += c.data[i] / 255;
  return s;
};
const near = (a: number[], b: number[], tol = 1) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
const assertNear = (a: number[], b: number[], tol = 1) => assert.ok(near(a, b, tol), `${a} vs ${b}`);
const TAU = Math.PI * 2;

test('colours parse in every supported form, cached and validated on assignment', () => {
  assert.deepEqual(parseColor('#f80'), [255, 136, 0, 1]);
  assert.deepEqual(parseColor('#ff8800'), [255, 136, 0, 1]);
  assert.deepEqual(parseColor('#ff880080'), [255, 136, 0, 128 / 255]);
  assert.deepEqual(parseColor('rgb(10, 20, 30)'), [10, 20, 30, 1]);
  assert.deepEqual(parseColor('rgba(10,20,30,0.25)'), [10, 20, 30, 0.25]);
  assert.deepEqual(parseColor('rgb(10 20 30 / 50%)'), [10, 20, 30, 0.5]);
  assert.equal(parseColor('#12'), null);
  assert.equal(parseColor('rgb(1, 2)'), null);
  assert.equal(parseColor('nope'), null);
  assert.equal(parseColor('#f80'), parseColor('#f80')); // cached
  const c = new Canvas(2, 2);
  c.fillStyle = '#123456';
  c.fillStyle = 'not a colour';
  assert.equal(c.fillStyle, '#123456');
});

test('an edge through a pixel centre covers half of it', () => {
  const c = new Canvas(6, 6);
  c.fillStyle = '#000';
  c.fillRect(1.5, 0, 3, 6); // vertical edges through the centres of columns 1 and 4
  assert.ok(Math.abs(alphaAt(c, 1, 2) - 127.5) <= 1);
  assert.equal(alphaAt(c, 2, 2), 255);
  assert.ok(Math.abs(alphaAt(c, 4, 2) - 127.5) <= 1);
  assert.equal(alphaAt(c, 0, 2), 0);
  const d = new Canvas(6, 6);
  d.beginPath();
  d.moveTo(0, 0);
  d.lineTo(4, 0);
  d.lineTo(0, 4);
  d.closePath();
  d.fill(); // the diagonal x + y = 4 passes through the centre of (1, 2)
  assert.ok(Math.abs(alphaAt(d, 1, 2) - 127.5) <= 1);
  assert.equal(alphaAt(d, 0, 0), 255);
});

test('filled areas match the analytic area within 0.5 %', () => {
  for (const [cx, cy, r] of [[100.3, 100.7, 50], [40.5, 30.25, 7.3], [60, 60, 20]]) {
    const c = new Canvas(220, 220);
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fill();
    const a = Math.PI * r * r;
    assert.ok(Math.abs(area(c) / a - 1) < 0.005, `r=${r}: ${area(c)} vs ${a}`);
  }
  // a concave polygon against the shoelace formula
  const pts = [[10.2, 10.7], [90.5, 20.1], [60.3, 50.9], [95.7, 90.2], [20.4, 80.6], [40.1, 45.3]];
  let shoe = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    shoe += x0 * y1 - x1 * y0;
  }
  const c = new Canvas(110, 110);
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.closePath();
  c.fill();
  assert.ok(Math.abs(area(c) / Math.abs(shoe / 2) - 1) < 0.005);
  // a quadratic segment closed by its chord: 2/3 base x height
  const q = new Canvas(120, 80);
  q.beginPath();
  q.moveTo(10, 10);
  q.quadraticCurveTo(60, 110, 110, 10);
  q.closePath();
  q.fill();
  assert.ok(Math.abs(area(q) / ((2 / 3) * 100 * 50) - 1) < 0.005, `${area(q)}`);
  // ellipse and round rect
  const e = new Canvas(120, 80);
  e.beginPath();
  e.ellipse(60, 40, 50, 25, 0.4, 0, TAU);
  e.fill();
  assert.ok(Math.abs(area(e) / (Math.PI * 50 * 25) - 1) < 0.005);
  const rr = new Canvas(120, 80);
  rr.beginPath();
  rr.roundRect(10, 10, 100, 60, 12);
  rr.fill();
  assert.ok(Math.abs(area(rr) / (100 * 60 - (4 - Math.PI) * 144) - 1) < 0.005);
});

test('nonzero and evenodd differ on a pentagram and on overlapping squares', () => {
  const star = (c: Canvas) => {
    c.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
      c.lineTo(50 + 45 * Math.cos(a), 50 + 45 * Math.sin(a));
    }
    c.closePath();
  };
  const nz = new Canvas(100, 100);
  star(nz);
  nz.fill('nonzero');
  const eo = new Canvas(100, 100);
  star(eo);
  eo.fill('evenodd');
  assert.equal(alphaAt(nz, 50, 50), 255);
  assert.equal(alphaAt(eo, 50, 50), 0);
  assert.equal(alphaAt(nz, 50, 12), 255); // a point of the star
  assert.equal(alphaAt(eo, 50, 12), 255);

  // two squares, same direction, overlapping in 10..20
  const squares = (c: Canvas, flip: boolean) => {
    c.beginPath();
    c.rect(0, 0, 20, 20);
    if (flip) {
      c.moveTo(10, 10);
      c.lineTo(10, 30);
      c.lineTo(30, 30);
      c.lineTo(30, 10);
      c.closePath();
    } else c.rect(10, 10, 20, 20);
  };
  const a = new Canvas(40, 40);
  squares(a, false);
  a.fill();
  assert.equal(alphaAt(a, 15, 15), 255);
  assert.ok(Math.abs(area(a) - 700) < 0.5);
  const b = new Canvas(40, 40);
  squares(b, false);
  b.fill('evenodd');
  assert.equal(alphaAt(b, 15, 15), 0);
  assert.ok(Math.abs(area(b) - 600) < 0.5);
  const c = new Canvas(40, 40);
  squares(c, true); // opposite winding: nonzero leaves the overlap empty too
  c.fill();
  assert.equal(alphaAt(c, 15, 15), 0);
  assert.equal(alphaAt(c, 5, 5), 255);
});

test('strokes have the line width, and caps extend as specified', () => {
  const line = (cap: 'butt' | 'round' | 'square') => {
    const c = new Canvas(80, 40);
    c.beginPath();
    c.moveTo(20, 20);
    c.lineTo(60, 20);
    c.lineWidth = 10;
    c.lineCap = cap;
    c.stroke();
    return c;
  };
  const butt = line('butt');
  assert.ok(Math.abs(area(butt) - 400) < 0.5);
  assert.equal(alphaAt(butt, 40, 15), 255);
  assert.equal(alphaAt(butt, 40, 14), 0);
  assert.equal(alphaAt(butt, 40, 24), 255);
  assert.equal(alphaAt(butt, 40, 25), 0);
  assert.equal(alphaAt(butt, 62, 20), 0);
  const square = line('square');
  assert.ok(Math.abs(area(square) - 500) < 0.5);
  assert.equal(alphaAt(square, 64, 24), 255);
  const round = line('round');
  assert.ok(Math.abs(area(round) / (400 + Math.PI * 25) - 1) < 0.01);
  assert.equal(alphaAt(round, 62, 20), 255);
  assert.equal(alphaAt(round, 64, 24), 0);
  // a thin line still deposits its full area
  const thin = new Canvas(80, 40);
  thin.beginPath();
  thin.moveTo(10, 10.3);
  thin.lineTo(70, 30.8);
  thin.lineWidth = 0.5;
  thin.stroke();
  assert.ok(Math.abs(area(thin) / (0.5 * Math.hypot(60, 20.5)) - 1) < 0.01);
});

test('joins: miter fills the corner, bevel cuts it, round rounds it, sharp miters fall back', () => {
  const corner = (join: 'miter' | 'round' | 'bevel') => {
    const c = new Canvas(80, 80);
    c.beginPath();
    c.moveTo(20, 50);
    c.lineTo(50, 50);
    c.lineTo(50, 20);
    c.lineWidth = 10;
    c.lineJoin = join;
    c.stroke();
    return c;
  };
  const miter = corner('miter');
  const bevel = corner('bevel');
  const round = corner('round');
  assert.equal(alphaAt(miter, 54, 54), 255);
  assert.equal(alphaAt(bevel, 54, 54), 0);
  assert.equal(alphaAt(round, 54, 54), 0);
  assert.equal(alphaAt(round, 52, 52), 255);
  assert.ok(Math.abs(alphaAt(bevel, 52, 52) - 127.5) < 3);
  // inner corner filled once, no gaps
  assert.equal(alphaAt(miter, 46, 46), 255);
  // a needle-sharp turn exceeds the miter limit (10) and is bevelled
  const sharp = new Canvas(200, 60);
  sharp.beginPath();
  sharp.moveTo(10, 20);
  sharp.lineTo(100, 30);
  sharp.lineTo(10, 40);
  sharp.lineWidth = 6;
  sharp.lineJoin = 'miter';
  sharp.stroke();
  assert.equal(alphaAt(sharp, 130, 30), 0);
  assert.equal(alphaAt(sharp, 101, 30), 255);
});

test('closed strokes join at the start; curves stroke smoothly', () => {
  const c = new Canvas(60, 60);
  c.beginPath();
  c.rect(10, 10, 40, 40);
  c.lineWidth = 4;
  c.stroke();
  assert.equal(alphaAt(c, 8, 8), 255); // the start corner is mitred like the rest
  assert.equal(alphaAt(c, 30, 30), 0);
  // a ring: area of the annulus
  const r = new Canvas(120, 120);
  r.beginPath();
  r.arc(60, 60, 40, 0, TAU);
  r.lineWidth = 8;
  r.stroke();
  const want = Math.PI * (44 * 44 - 36 * 36);
  assert.ok(Math.abs(area(r) / want - 1) < 0.01, `${area(r)} vs ${want}`);
  assert.equal(alphaAt(r, 60, 60), 0);
});

test('transforms map paths, rects and stroke widths like the browser', () => {
  const c = new Canvas(100, 100);
  c.translate(50, 50);
  c.rotate(Math.PI / 4);
  c.fillRect(-10, -10, 20, 20); // a diamond of the same area
  assert.ok(Math.abs(area(c) - 400) < 0.5);
  assert.equal(alphaAt(c, 50, 40), 255); // the top tip is at y = 50 - 14.1
  assert.ok(alphaAt(c, 50, 36) > 100 && alphaAt(c, 50, 36) < 255); // and cuts its pixel
  assert.equal(alphaAt(c, 39, 39), 0);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.save();
  c.scale(2, 3);
  c.restore();
  c.fillStyle = '#f00';
  c.fillRect(0, 0, 2, 2);
  assert.deepEqual(px(c, 1, 1), [255, 0, 0, 255]);
  assert.equal(alphaAt(c, 2, 2), 0);
  // a non-uniform scale stretches the pen: 4 px across, 1 px down
  const e = new Canvas(120, 60);
  e.translate(60, 30);
  e.scale(4, 1);
  e.beginPath();
  e.arc(0, 0, 10, 0, TAU);
  e.lineWidth = 1;
  e.stroke();
  e.setTransform(1, 0, 0, 1, 0, 0);
  assert.equal(alphaAt(e, 61, 30) + alphaAt(e, 58, 30), 0);
  assert.equal(alphaAt(e, 99, 30), 255); // [98, 102] covered at the right
  assert.ok(alphaAt(e, 60, 19) >= 120 && alphaAt(e, 60, 19) <= 136); // [19.5, 20.5] covers half of row 19
});

test('clip intersects, nests, and restore() lifts it', () => {
  const c = new Canvas(40, 40);
  c.save();
  c.beginPath();
  c.rect(0, 0, 20, 40);
  c.clip();
  c.fillStyle = '#f00';
  c.fillRect(0, 0, 40, 40);
  assert.equal(alphaAt(c, 10, 10), 255);
  assert.equal(alphaAt(c, 30, 10), 0);
  c.save();
  c.beginPath();
  c.rect(10, 0, 30, 20);
  c.clip();
  c.fillStyle = '#00f';
  c.fillRect(0, 0, 40, 40);
  assert.deepEqual(px(c, 15, 10), [0, 0, 255, 255]); // inside both
  assert.deepEqual(px(c, 5, 10), [255, 0, 0, 255]); // outside the inner clip
  assert.deepEqual(px(c, 15, 30), [255, 0, 0, 255]);
  c.restore();
  c.fillStyle = '#0f0';
  c.fillRect(0, 30, 40, 10);
  assert.deepEqual(px(c, 15, 35), [0, 255, 0, 255]);
  assert.equal(alphaAt(c, 30, 35), 0);
  c.restore();
  assert.equal(c.fillStyle, '#000000'); // restore() brings back the styles too
  c.fillStyle = '#0f0';
  c.fillRect(30, 30, 10, 10);
  assert.deepEqual(px(c, 35, 35), [0, 255, 0, 255]);
  // an anti-aliased clip edge scales coverage; clearRect obeys the clip
  const d = new Canvas(20, 20);
  d.beginPath();
  d.rect(0, 0, 10.5, 20);
  d.clip();
  d.fillRect(0, 0, 20, 20);
  assert.ok(Math.abs(alphaAt(d, 10, 5) - 127.5) <= 1);
  d.clearRect(0, 0, 5, 20);
  assert.equal(alphaAt(d, 2, 2), 0);
  assert.equal(alphaAt(d, 7, 2), 255);
});

test('linear and radial gradients hit their stops, interpolating straight colour', () => {
  const c = new Canvas(101, 10);
  const g = c.createLinearGradient(0.5, 0, 100.5, 0);
  g.addColorStop(0, '#ff0000');
  g.addColorStop(1, '#0000ff');
  c.fillStyle = g;
  c.fillRect(0, 0, 101, 10);
  assertNear(px(c, 0, 5), [255, 0, 0, 255]);
  assertNear(px(c, 100, 5), [0, 0, 255, 255]);
  assertNear(px(c, 50, 5), [128, 0, 128, 255], 2);
  // a transparent stop does not darken: straight interpolation, then premultiply
  const a = new Canvas(101, 4);
  const ga = a.createLinearGradient(0.5, 0, 100.5, 0);
  ga.addColorStop(0, 'rgba(255, 255, 255, 0)');
  ga.addColorStop(1, '#ffffff');
  a.fillStyle = ga;
  a.fillRect(0, 0, 101, 4);
  assertNear(px(a, 50, 1), [128, 128, 128, 128], 2);
  // padding beyond the ends
  const p = new Canvas(40, 4);
  const gp = p.createLinearGradient(10, 0, 30, 0);
  gp.addColorStop(0, '#ff0000');
  gp.addColorStop(1, '#00ff00');
  p.fillStyle = gp;
  p.fillRect(0, 0, 40, 4);
  assertNear(px(p, 2, 1), [255, 0, 0, 255]);
  assertNear(px(p, 37, 1), [0, 255, 0, 255]);
  // concentric radial
  const r = new Canvas(101, 101);
  const gr = r.createRadialGradient(50.5, 50.5, 0, 50.5, 50.5, 40);
  gr.addColorStop(0, '#ffffff');
  gr.addColorStop(0.5, '#ff0000');
  gr.addColorStop(1, '#000000');
  r.fillStyle = gr;
  r.fillRect(0, 0, 101, 101);
  assertNear(px(r, 50, 50), [255, 255, 255, 255], 2);
  assertNear(px(r, 70, 50), [255, 0, 0, 255], 4);
  assertNear(px(r, 95, 50), [0, 0, 0, 255]);
  // two-circle (focal): the inner circle's centre takes stop 0
  const f = new Canvas(101, 101);
  const gf = f.createRadialGradient(40.5, 40.5, 0, 50.5, 50.5, 45);
  gf.addColorStop(0, '#00ff00');
  gf.addColorStop(1, '#0000ff');
  f.fillStyle = gf;
  f.fillRect(0, 0, 101, 101);
  assertNear(px(f, 40, 40), [0, 255, 0, 255], 3);
  assertNear(px(f, 2, 98), [0, 0, 255, 255], 3);
  // gradients follow the transform at fill time
  const t = new Canvas(100, 10);
  t.translate(50, 0);
  const gt = t.createLinearGradient(0, 0, 10, 0);
  gt.addColorStop(0, '#000000');
  gt.addColorStop(1, '#ffffff');
  t.fillStyle = gt;
  t.setTransform(1, 0, 0, 1, 0, 0);
  t.fillRect(0, 0, 100, 10);
  assertNear(px(t, 5, 5), [255 * 0.55, 255 * 0.55, 255 * 0.55, 255], 3);
  assert.throws(() => gt.addColorStop(1.5, '#fff'), RangeError);
});

test('each composite operator on a known pixel', () => {
  const run = (op: 'source-over' | 'source-atop' | 'destination-out' | 'multiply' | 'screen' | 'lighter', dst = '#ff0000') => {
    const c = new Canvas(2, 2);
    c.fillStyle = dst;
    c.fillRect(0, 0, 1, 2);
    c.globalCompositeOperation = op;
    c.fillStyle = 'rgba(0, 0, 255, 0.5)';
    c.fillRect(0, 0, 2, 2);
    return [px(c, 0, 0), px(c, 1, 0)];
  };
  const h = 127.5;
  let [onRed, onClear] = run('source-over');
  assertNear(onRed, [h, 0, h, 255]);
  assertNear(onClear, [0, 0, h, h]);
  [onRed, onClear] = run('source-atop');
  assertNear(onRed, [h, 0, h, 255]);
  assertNear(onClear, [0, 0, 0, 0]);
  [onRed, onClear] = run('destination-out');
  assertNear(onRed, [h, 0, 0, h]);
  assertNear(onClear, [0, 0, 0, 0]);
  [onRed, onClear] = run('multiply');
  assertNear(onRed, [h, 0, 0, 255]);
  assertNear(onClear, [0, 0, h, h]);
  [onRed, onClear] = run('screen');
  assertNear(onRed, [255, 0, h, 255]);
  assertNear(onClear, [0, 0, h, h]);
  [onRed, onClear] = run('lighter');
  assertNear(onRed, [255, 0, h, 255]);
  assertNear(onClear, [0, 0, h, h]);
  // multiply on grey
  const [g] = run('multiply', '#808080');
  assertNear(g, [64, 64, 128, 255], 2);
});

test('globalAlpha scales every paint, and is part of saved state', () => {
  const c = new Canvas(4, 4);
  c.fillStyle = '#ff0000';
  c.save();
  c.globalAlpha = 0.5;
  c.fillRect(0, 0, 2, 4);
  c.globalAlpha = 7; // ignored, like the browser
  assert.equal(c.globalAlpha, 0.5);
  c.restore();
  assert.equal(c.globalAlpha, 1);
  assertNear(px(c, 1, 1), [128, 0, 0, 128]);
  c.globalAlpha = 0.25;
  c.fillRect(2, 0, 2, 4);
  assertNear(px(c, 3, 1), [64, 0, 0, 64]);
});

test('drawImage copies at integer offsets and samples when scaled', () => {
  const img = new Canvas(2, 2);
  img.fillStyle = '#ff0000';
  img.fillRect(0, 0, 1, 1);
  img.fillStyle = '#00ff00';
  img.fillRect(1, 0, 1, 1);
  img.fillStyle = '#0000ff';
  img.fillRect(0, 1, 1, 1);
  img.fillStyle = 'rgba(255, 255, 255, 0.5)';
  img.fillRect(1, 1, 1, 1);
  const c = new Canvas(30, 30);
  c.drawImage(img, 3, 4);
  assert.deepEqual(px(c, 3, 4), [255, 0, 0, 255]);
  assert.deepEqual(px(c, 4, 4), [0, 255, 0, 255]);
  assert.deepEqual(px(c, 3, 5), [0, 0, 255, 255]);
  assertNear(px(c, 4, 5), [128, 128, 128, 128]);
  assert.equal(alphaAt(c, 5, 5), 0);
  // translated through the transform, with alpha
  c.translate(10, 0);
  c.globalAlpha = 0.5;
  c.drawImage(img, 0, 0);
  assertNear(px(c, 10, 0), [128, 0, 0, 128]);
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.globalAlpha = 1;
  // scaled 10x: corners keep their colour, total coverage is the quad
  const s = new Canvas(30, 30);
  s.drawImage(img, 5, 5, 20, 20);
  assertNear(px(s, 6, 6), [255, 0, 0, 255]);
  assertNear(px(s, 23, 6), [0, 255, 0, 255]);
  const mid = px(s, 14, 6); // between red and green
  assert.ok(mid[0] > 60 && mid[1] > 60 && mid[3] === 255);
  assert.equal(alphaAt(s, 4, 10), 0);
  // fractional placement anti-aliases the image's edge
  const f = new Canvas(10, 4);
  const solid = new Canvas(4, 4);
  solid.clear('#000000');
  f.drawImage(solid, 2.5, 0);
  assert.ok(Math.abs(alphaAt(f, 2, 1) - 127.5) <= 1);
  assert.equal(alphaAt(f, 3, 1), 255);
});

test('blur spreads but preserves total alpha', () => {
  const c = new Canvas(80, 80);
  c.beginPath();
  c.arc(40, 40, 6, 0, TAU);
  c.fill();
  const before = area(c);
  const centre = alphaAt(c, 40, 40);
  blur(c, 4);
  assert.ok(Math.abs(area(c) / before - 1) < 0.01, `${area(c)} vs ${before}`);
  assert.ok(alphaAt(c, 40, 40) < centre);
  assert.ok(alphaAt(c, 40, 50) > 0); // spread past the old edge
  // premultiplied: colour never exceeds alpha
  for (let i = 0; i < c.data.length; i += 4) assert.ok(c.data[i] <= c.data[i + 3]);
});

test('arcs follow the browser angle rules', () => {
  const half = (ccw: boolean) => {
    const c = new Canvas(40, 40);
    c.beginPath();
    c.moveTo(20, 20);
    c.arc(20, 20, 15, 0, Math.PI, ccw);
    c.closePath();
    c.fill();
    return c;
  };
  assert.equal(alphaAt(half(false), 20, 28), 255); // clockwise on screen: the lower half
  assert.equal(alphaAt(half(false), 20, 12), 0);
  assert.equal(alphaAt(half(true), 20, 12), 255);
  // a full turn in either direction, and beyond
  for (const [a0, a1, ccw] of [[0, TAU, false], [1, 1 + 3 * TAU, false], [TAU, 0, true]] as const) {
    const c = new Canvas(40, 40);
    c.beginPath();
    c.arc(20, 20, 10, a0, a1, ccw);
    c.fill();
    assert.ok(Math.abs(area(c) / (Math.PI * 100) - 1) < 0.01);
  }
});

test('fill keeps the path; beginPath clears it; degenerate input is ignored', () => {
  const c = new Canvas(20, 20);
  c.beginPath();
  c.rect(0, 0, 10, 10);
  c.fill();
  c.fillStyle = '#f00';
  c.fill();
  assert.deepEqual(px(c, 5, 5), [255, 0, 0, 255]);
  c.beginPath();
  c.fill();
  c.moveTo(NaN, 0);
  c.lineTo(5, Infinity);
  c.arc(5, 5, -1, 0, 1);
  c.fill();
  c.stroke();
  assert.equal(alphaAt(c, 15, 15), 0);
  c.lineWidth = -3;
  assert.equal(c.lineWidth, 1);
});

test('coverage matches 16x16 supersampling on random self-intersecting polygons', () => {
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const winding = (px: number, py: number, pts: number[][]) => {
    let w = 0;
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      const side = (x1 - x0) * (py - y0) - (px - x0) * (y1 - y0);
      if (y0 <= py) {
        if (y1 > py && side > 0) w++;
      } else if (y1 <= py && side < 0) w--;
    }
    return w;
  };
  for (const rule of ['nonzero', 'evenodd'] as const) {
    let sum = 0;
    let outliers = 0;
    let n = 0;
    for (let trial = 0; trial < 4; trial++) {
      const pts = Array.from({ length: 6 + trial }, () => [1 + rnd() * 30, 1 + rnd() * 30]);
      const c = new Canvas(32, 32);
      c.beginPath();
      pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
      c.fill(rule);
      for (let y = 0; y < 32; y++) {
        for (let x = 0; x < 32; x++) {
          let hits = 0;
          for (let j = 0; j < 16; j++) {
            for (let i = 0; i < 16; i++) {
              const w = winding(x + (i + 0.5) / 16, y + (j + 0.5) / 16, pts);
              if (rule === 'nonzero' ? w !== 0 : w & 1) hits++;
            }
          }
          const e = Math.abs(hits / 256 - alphaAt(c, x, y) / 255);
          sum += e;
          if (e > 0.1) outliers++; // pixels where opposite-winding edges cross
          n++;
        }
      }
    }
    assert.ok(sum / n < 0.003, `${rule}: mean error ${sum / n}`);
    assert.ok(outliers / n < 0.005, `${rule}: ${outliers} outliers of ${n}`);
  }
});

test('performance: random circles, full-canvas rect, stroke-heavy art', (t) => {
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const big = new Canvas(1500, 920);
  const circles = () => {
    for (let k = 0; k < 1000; k++) {
      big.fillStyle = `rgb(${(rnd() * 255) | 0}, ${(rnd() * 255) | 0}, ${(rnd() * 255) | 0})`;
      big.beginPath();
      big.arc(rnd() * 1500, rnd() * 920, 4 + rnd() * 16, 0, TAU);
      big.fill();
    }
  };
  // Best of three runs: the suite runs files in parallel, and one slow run
  // under that load says nothing about the rasterizer.
  const best = (f: () => void) => {
    let ms = Infinity;
    for (let k = 0; k < 3; k++) {
      const t0 = performance.now();
      f();
      ms = Math.min(ms, performance.now() - t0);
    }
    return ms;
  };
  circles(); // warm up
  const circleMs = best(circles);
  const rectMs = best(() => {
    for (let k = 0; k < 10; k++) {
      big.fillStyle = k & 1 ? '#336699' : '#996633';
      big.fillRect(0, 0, 1500, 920);
    }
  }) / 10;
  const blendMs = best(() => {
    big.globalAlpha = 0.5;
    big.fillRect(0, 0, 1500, 920);
    big.globalAlpha = 1;
  });
  const small = new Canvas(400, 400);
  const strokes = () => {
    small.lineJoin = 'round';
    small.lineCap = 'round';
    for (let k = 0; k < 200; k++) {
      small.beginPath();
      small.moveTo(rnd() * 400, rnd() * 400);
      small.bezierCurveTo(rnd() * 400, rnd() * 400, rnd() * 400, rnd() * 400, rnd() * 400, rnd() * 400);
      small.lineTo(rnd() * 400, rnd() * 400);
      small.lineWidth = 1.5 + rnd() * 6;
      small.strokeStyle = '#2b2233';
      small.stroke();
    }
  };
  strokes();
  const strokeMs = best(strokes);
  t.diagnostic(`1000 circles r 4..20 on 1500x920: ${circleMs.toFixed(1)} ms`);
  t.diagnostic(`opaque full-canvas fillRect: ${rectMs.toFixed(2)} ms; 50 % alpha: ${blendMs.toFixed(1)} ms`);
  t.diagnostic(`200 bezier strokes w 1.5..7.5 on 400x400: ${strokeMs.toFixed(1)} ms`);
  assert.ok(circleMs < 150, `circles ${circleMs}`);
  assert.ok(rectMs < 15, `rect ${rectMs}`);
  assert.ok(blendMs < 60, `blend ${blendMs}`);
  assert.ok(strokeMs < 250, `strokes ${strokeMs}`);
});
