import { Canvas } from '../src/art/canvas.ts';
import { frame, project as iso } from '../src/art/iso.ts';
import { DESK_SPOT } from '../src/world/desks.ts';
import { FIGURE_H, FIGURE_HALF_W } from '../src/world/frame.ts';
import type { P3, PropView, WorkstationArt } from '../src/worlds/types.ts';

// What a thing on a desk's top is held to, as pixels: drawn on the canvas at
// scale S in either frame, it stays inside its box, off the screen and (for
// the most part) off the figure of the agent at work. The world test and
// scripts/desk-spots.ts both use it.

export const S = 6;

// Whether canvas point (x, y) is inside the convex polygon q.
export function inQuad(q: ReadonlyArray<readonly [number, number]>, x: number, y: number): boolean {
  let sign = 0;
  for (let k = 0; k < q.length; k++) {
    const [ax, ay] = q[k];
    const [bx, by] = q[(k + 1) % q.length];
    const c = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    if (!c) continue;
    if (!sign) sign = c;
    else if (c !== sign) return false;
  }
  return true;
}

// The desk's view onto canvas `c`, at scale S.
export function viewOf(art: WorkstationArt, wall: 'left' | 'right', c: Canvas, active: boolean, t = 0, seed = 0): PropView {
  const at = frame(iso(80, 100, S), wall, 0, 0);
  return { pen: c, s: S, at, len: art.len, dep: art.dep, wall, island: true, t, active, seed };
}

// Draws a part with `draw` on a fresh canvas and counts its painted pixels
// (`n`), those over the screen (`over`), those inside the agent's figure
// (`behind`), and the first painted pixel outside `box` (centre, radius,
// height; with S of slack), if any.
export function partCheck(
  art: WorkstationArt,
  wall: 'left' | 'right',
  draw: (v: PropView) => void,
  box: [P3, number, number],
  active: boolean,
): { n: number; over: number; behind: number; outside: [number, number] | null } {
  const c = new Canvas(160, 160);
  const v = viewOf(art, wall, c, active);
  const at = v.at;
  const screen = art.screen.map((p) => at(...p));
  const [fx, fy] = at(DESK_SPOT.u, DESK_SPOT.v, 0);
  const fig = { x0: fx - FIGURE_HALF_W * S, x1: fx + FIGURE_HALF_W * S, y0: fy - FIGURE_H * S, y1: fy };
  draw(v);
  const [[u, w, z], r, h] = box;
  let b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const du of [-r, r]) for (const dv of [-r, r]) for (const dz of [0, h]) {
    const [x, y] = at(u + du, w + dv, z + dz);
    b = { x0: Math.min(b.x0, x), y0: Math.min(b.y0, y), x1: Math.max(b.x1, x), y1: Math.max(b.y1, y) };
  }
  let n = 0;
  let over = 0;
  let behind = 0;
  let outside: [number, number] | null = null;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < 16) continue;
      n++;
      if (!outside && !(x >= b.x0 - S && x <= b.x1 + S && y >= b.y0 - S && y <= b.y1 + S)) outside = [x, y];
      if (inQuad(screen, x + 0.5, y + 0.5)) over++;
      if (x >= fig.x0 && x <= fig.x1 && y >= fig.y0 && y <= fig.y1) behind++;
    }
  }
  return { n, over, behind, outside };
}
