import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutRoom, drawRoom, wallToScreen, localToScreen } from '../src/iso/room.ts';
import type { Room, Placed } from '../src/iso/room.ts';
import { PixelCanvas } from '../src/iso/canvas.ts';
import { lab } from '../src/themes/lab.ts';

const SIZES: Array<[number, number]> = [[60, 34], [80, 42], [92, 66], [120, 80], [172, 114], [300, 160]];

function footprint(p: Placed): { x0: number; x1: number; y0: number; y1: number } {
  const { len, dep } = p.station.size;
  return p.at.wall === 'right'
    ? { x0: p.at.along, x1: p.at.along + len, y0: p.at.out, y1: p.at.out + dep }
    : { x0: p.at.out, x1: p.at.out + dep, y0: p.at.along, y1: p.at.along + len };
}

test('the room fits the canvas at many sizes', () => {
  for (const [cw, ch] of SIZES) {
    const r = layoutRoom(cw, ch, lab);
    assert.ok(r.W >= 6 && r.D >= 5, `${cw}x${ch}: ${r.W}x${r.D}`);
    const pts = [r.iso.toScreen(0, 0, lab.wallH), r.iso.toScreen(r.W, 0, 0), r.iso.toScreen(0, r.D, 0), r.iso.toScreen(r.W, r.D, -0.5)];
    for (const [sx, sy] of pts) assert.ok(sx >= 0 && sx <= cw && sy >= 0 && sy <= ch, `${cw}x${ch}: point ${sx},${sy} outside`);
  }
});

test('bigger canvases get bigger tiles or rooms', () => {
  const small = layoutRoom(92, 66, lab);
  const big = layoutRoom(172, 114, lab);
  assert.ok(big.iso.tw * (big.W + big.D) > small.iso.tw * (small.W + small.D));
});

test('every station is placed on the floor against its wall without overlaps', () => {
  for (const [cw, ch] of SIZES.slice(2)) {
    const r: Room = layoutRoom(cw, ch, lab);
    const kinds = r.placed.map((p) => p.kind).sort();
    assert.deepEqual(kinds, ['entrance', 'idle', 'read', 'run', 'search', 'think', 'web', 'write']);
    for (const p of r.placed) {
      const f = footprint(p);
      assert.ok(f.x0 >= 0 && f.y0 >= 0 && f.x1 <= r.W + 1e-9 && f.y1 <= r.D + 1e-9, `${p.kind} outside floor`);
      assert.equal(p.at.out, 0, `${p.kind} not against its wall`);
    }
    for (const wall of ['left', 'right'] as const) {
      const on = r.placed.filter((p) => p.at.wall === wall).sort((a, b) => a.at.along - b.at.along);
      for (let i = 1; i < on.length; i++) {
        assert.ok(on[i].at.along >= on[i - 1].at.along + on[i - 1].station.size.len - 1e-9, `${on[i - 1].kind} overlaps ${on[i].kind}`);
      }
    }
  }
});

test('work spots are on free floor in front of their station', () => {
  const r = layoutRoom(120, 80, lab);
  for (const p of r.placed) {
    assert.ok(p.spot.gx > 0 && p.spot.gx < r.W && p.spot.gy > 0 && p.spot.gy < r.D, `${p.kind} spot off floor`);
    for (const q of r.placed) {
      const f = footprint(q);
      assert.ok(!(p.spot.gx > f.x0 && p.spot.gx < f.x1 && p.spot.gy > f.y0 && p.spot.gy < f.y1), `${p.kind} spot inside ${q.kind}`);
    }
  }
  const door = r.placed.find((p) => p.kind === 'entrance')!;
  assert.equal(door.at.wall, 'left');
  const leftAlong = r.placed.filter((p) => p.at.wall === 'left').map((p) => p.at.along);
  assert.equal(door.at.along, Math.max(...leftAlong), 'the door is nearest the viewer');
});

test('drawRoom paints walls and floor', () => {
  const r = layoutRoom(120, 80, lab);
  const c = new PixelCanvas(120, 80);
  c.clear(lab.backdrop);
  drawRoom(c, r, lab, 1.5, Date.now());
  const [fx, fy] = r.iso.toScreen(r.W / 2, r.D / 2, 0);
  assert.notDeepEqual(c.get(Math.floor(fx), Math.floor(fy)), lab.backdrop, 'floor centre');
  const [wx, wy] = wallToScreen(r, 'right', r.W / 2, lab.wallH / 2);
  assert.notDeepEqual(c.get(Math.floor(wx), Math.floor(wy)), lab.backdrop, 'right wall');
  const [lx, ly] = wallToScreen(r, 'left', r.D / 2, lab.wallH / 2);
  assert.notDeepEqual(c.get(Math.floor(lx), Math.floor(ly)), lab.backdrop, 'left wall');
  assert.deepEqual(c.get(0, c.h - 1), lab.backdrop, 'corner outside the room');
});

test('localToScreen follows the wall orientation', () => {
  const r = layoutRoom(120, 80, lab);
  const right = r.placed.find((p) => p.at.wall === 'right')!;
  const [ax, ay] = localToScreen(r, right, 0, 0, 0);
  const [bx, by] = localToScreen(r, right, 1, 0, 0);
  assert.ok(bx > ax && by > ay, 'along the right wall goes right-down');
  const left = r.placed.find((p) => p.at.wall === 'left')!;
  const [cx, cy] = localToScreen(r, left, 0, 0, 0);
  const [dx, dy] = localToScreen(r, left, 1, 0, 0);
  assert.ok(dx < cx && dy > cy, 'along the left wall goes left-down');
});

test('small rooms split the floor by what each wall needs', () => {
  for (const [cw, ch] of [[60, 34], [80, 42]]) {
    const r = layoutRoom(cw, ch, lab);
    for (const p of r.placed) {
      const f = footprint(p);
      assert.ok(f.x1 <= r.W + 1e-9 && f.y1 <= r.D + 1e-9, `${cw}x${ch}: ${p.kind} overflows ${r.W}x${r.D}`);
    }
  }
});

test('rooms fit sextant canvases with non-square pixels', () => {
  for (const [cols, rows] of [[60, 17], [92, 33], [172, 57]]) {
    const cw = cols * 2;
    const ch = rows * 3;
    const r = layoutRoom(cw, ch, lab, 0.75, 24);
    assert.equal(r.iso.ky, 0.75);
    const pts = [r.iso.toScreen(0, 0, lab.wallH), r.iso.toScreen(r.W, 0, 0), r.iso.toScreen(0, r.D, 0), r.iso.toScreen(r.W, r.D, -0.5)];
    for (const [sx, sy] of pts) assert.ok(sx >= 0 && sx <= cw && sy >= 0 && sy <= ch, `${cols}x${rows}: ${sx},${sy}`);
    for (const p of r.placed) {
      const f = footprint(p);
      assert.ok(f.x1 <= r.W + 1e-9 && f.y1 <= r.D + 1e-9, `${p.kind} overflows`);
    }
  }
  assert.ok(layoutRoom(184, 99, lab, 0.75, 24).iso.tw > layoutRoom(92, 66, lab).iso.tw, 'sextant tiles are finer-grained');
});
