import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NavGrid, smooth } from '../src/world/path.ts';

// A wall across the middle of a 40x40 floor with a gap at the far end.
const wall = (x: number, y: number) => x > 18 && x < 22 && y < 32;

test('routes round a wall through the gap', () => {
  const g = new NavGrid(0, 0, 40, 40, 2, wall);
  const path = g.find({ x: 5, y: 5 }, { x: 35, y: 5 });
  assert.ok(path && path.length > 2);
  assert.ok(path.some((p) => p.y > 32), 'never went round the end of the wall');
  for (const p of path.slice(1, -1)) assert.ok(!wall(p.x, p.y), `through the wall at ${p.x},${p.y}`);
});

test('no route when the goal is walled in', () => {
  const box = (x: number, y: number) => (x > 26 && x < 30 && y > 10 && y < 30) || (y > 26 && y < 30 && x > 26) || (y > 10 && y < 14 && x > 26);
  const g = new NavGrid(0, 0, 40, 40, 2, (x, y) => box(x, y) || (x > 36 && y > 10 && y < 30));
  assert.equal(g.find({ x: 5, y: 20 }, { x: 33, y: 20 }), null);
});

test('string pulling keeps only the corners a straight walk needs', () => {
  const g = new NavGrid(0, 0, 40, 40, 2, wall);
  const from = { x: 5, y: 5 };
  const to = { x: 35, y: 5 };
  const cells = g.find(from, to)!;
  const clear = (p: { x: number; y: number }, q: { x: number; y: number }) => {
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.5);
    for (let i = 1; i < n; i++) if (wall(p.x + ((q.x - p.x) * i) / n, p.y + ((q.y - p.y) * i) / n)) return false;
    return true;
  };
  const pts = smooth(from, [...cells.slice(1, -1), to], clear);
  assert.ok(pts.length < cells.length / 2, `${pts.length} of ${cells.length} kept`);
  assert.deepEqual(pts[pts.length - 1], to);
  let at = from;
  for (const p of pts) {
    assert.ok(clear(at, p), `leg ${JSON.stringify(at)} → ${JSON.stringify(p)} cuts the wall`);
    at = p;
  }
});
