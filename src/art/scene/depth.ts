// Depth order for the scene's drawables in 2:1 isometric (larger x + y is
// nearer; the view looks down along (-1, -1, -1), so x + y + z is depth).
//
// Props, builds and piles are boxes standing on the floor; figures and the
// critter are upright points (their feet). Two things are only ordered when
// their screen boxes overlap:
//   box   vs box:   A is behind B when a face plane separates them toward the
//                   viewer (A.x1 <= B.x0 or A.y1 <= B.y0);
//   point vs box:   the point is in front when it is nearer than the closest
//                   point of the box's footprint (beyond a front face, or
//                   round a corner further out than back), else behind; a
//                   point inside the footprint stands on top (in front);
//   point vs point: by x + y.
// The order is a topological sort of those constraints, nearest-last, the
// shallowest item first among the free ones; a cycle (rare: overlapping
// footprints) is broken by depth.

export type Drawable = {
  // The floor footprint in units (a point: x0 = x1, y0 = y1) and how tall.
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  h: number;
  point: boolean;
  // Its box on the canvas, pixels, ends exclusive.
  sx0: number;
  sy0: number;
  sx1: number;
  sy1: number;
};

const EPS = 1e-6;

const overlap = (a: Drawable, b: Drawable) => a.sx0 < b.sx1 && b.sx0 < a.sx1 && a.sy0 < b.sy1 && b.sy0 < a.sy1;

// How deep an item is, for ties and for picking among free items.
export function depthOf(d: Drawable): number {
  return d.point ? d.x0 + d.y0 : (d.x0 + d.x1 + d.y0 + d.y1) / 2;
}

// Where `p` (a point) stands against box `b`: > 0 in front, < 0 behind.
export function pointVsBox(px: number, py: number, b: Drawable): number {
  const qx = px < b.x0 ? b.x0 : px > b.x1 ? b.x1 : px;
  const qy = py < b.y0 ? b.y0 : py > b.y1 ? b.y1 : py;
  const d = px + py - (qx + qy);
  return Math.abs(d) > EPS ? d : 1; // inside the footprint: on top of it
}

// < 0: a is drawn before b; > 0: after; 0: no constraint.
export function compare(a: Drawable, b: Drawable): number {
  if (!overlap(a, b)) return 0;
  if (!a.point && !b.point) {
    if (a.x1 <= b.x0 + EPS || a.y1 <= b.y0 + EPS) return -1;
    if (b.x1 <= a.x0 + EPS || b.y1 <= a.y0 + EPS) return 1;
    return Math.sign(depthOf(a) - depthOf(b)) || -1;
  }
  if (a.point && b.point) return Math.sign(a.x0 + a.y0 - (b.x0 + b.y0)) || Math.sign(a.h - b.h);
  return a.point ? (pointVsBox(a.x0, a.y0, b) > 0 ? 1 : -1) : pointVsBox(b.x0, b.y0, a) > 0 ? -1 : 1;
}

// Indices of `items` in drawing order (back to front).
export function depthOrder(items: readonly Drawable[]): number[] {
  const n = items.length;
  const succ: number[][] = Array.from({ length: n }, () => []);
  const indeg = new Int32Array(n);
  const key = items.map(depthOf);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const c = compare(items[i], items[j]);
      if (c < 0) {
        succ[i].push(j);
        indeg[j]++;
      } else if (c > 0) {
        succ[j].push(i);
        indeg[i]++;
      }
    }
  }
  const done = new Uint8Array(n);
  const out: number[] = [];
  while (out.length < n) {
    let best = -1;
    for (let k = 0; k < n; k++) if (!done[k] && indeg[k] === 0 && (best < 0 || key[k] < key[best])) best = k;
    // A cycle: the shallowest of what is left goes first.
    if (best < 0) for (let k = 0; k < n; k++) if (!done[k] && (best < 0 || key[k] < key[best])) best = k;
    done[best] = 1;
    out.push(best);
    for (const s of succ[best]) indeg[s]--;
  }
  return out;
}

// Where a small point at (x, y, z) goes among items already in `order`:
// after everything it is in front of (boxes by a ray toward the viewer,
// points by x + y), as a slot k = drawn after order[k - 1].
export function slotOf(x: number, y: number, z: number, sx: number, sy: number, items: readonly Drawable[], order: readonly number[]): number {
  let slot = 0;
  for (let k = 0; k < order.length; k++) {
    const d = items[order[k]];
    if (sx < d.sx0 || sx >= d.sx1 || sy < d.sy0 || sy >= d.sy1) continue;
    if (d.point ? x + y > d.x0 + d.y0 : behindRay(x, y, z, d)) slot = k + 1;
  }
  return slot;
}

// Box `b` is behind the point when the ray from it away from the viewer,
// (x, y, z) - t (1, 1, 1) for t > 0 (the line every pixel looks along),
// passes through the box.
function behindRay(x: number, y: number, z: number, b: Drawable): boolean {
  let lo = EPS;
  let hi = Infinity;
  const span = (p: number, a: number, c: number) => {
    // p - t in [a, c]  <=>  t in [p - c, p - a]
    lo = Math.max(lo, p - c);
    hi = Math.min(hi, p - a);
  };
  span(x, b.x0, b.x1);
  span(y, b.y0, b.y1);
  span(z, 0, b.h);
  return lo <= hi;
}
