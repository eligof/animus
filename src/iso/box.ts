import type { RGB } from '../term/color.ts';
import { mix, scale } from '../term/color.ts';
import type { PixelCanvas } from './canvas.ts';
import type { Iso } from './projection.ts';

// Faces of a box as seen from the room: `front` faces into the room, `side`
// is the visible end, `top` is the lid.
export type Face = 'top' | 'front' | 'side';

// A box in a station's local frame: `a` runs along the wall, `b` away from
// it (into the room), `z` up. `paint` may texture a face: return a colour,
// `null` to leave the pixel alone, or `undefined` for the shaded base colour.
export type Box = {
  a: number;
  b: number;
  z: number;
  len: number;
  dep: number;
  h: number;
  color: RGB;
  paint?: (face: Face, u: number, v: number) => RGB | null | undefined;
};

// Where a station stands: against the `left` (gx = 0) or `right` (gy = 0)
// back wall, `along` tiles from the back corner, `out` tiles from the wall.
export type Placement = { wall: 'left' | 'right'; along: number; out: number };

const SHADE: Record<Face, number> = { top: 1, front: 0.82, side: 0.66 };

export function shade(c: RGB, face: Face): RGB {
  return scale(c, SHADE[face]);
}

const RIM: RGB = [255, 255, 255];
const SOOT: RGB = [0, 0, 0];

// Default face colour with pixel-art detailing: a one-pixel rim highlight
// along the top edges, a darker seam where front meets side, and a soft
// contact shadow at the base. `ulen`/`vlen` are the face extents.
function detail(c: RGB, face: Face, u: number, v: number, ulen: number, vlen: number, edge: number): RGB {
  const base = shade(c, face);
  if (face === 'top') {
    return u > ulen - edge || v > vlen - edge ? mix(base, RIM, 0.22) : base;
  }
  if (v > vlen - edge) return mix(base, RIM, 0.16);
  if (face === 'front' && u > ulen - edge) return mix(base, SOOT, 0.12);
  if (v < edge * 1.5) return mix(base, SOOT, 0.18);
  return base;
}

// Rasterises a box by mapping every pixel in its screen bounds back onto
// the three visible planes (lid, the gy = y + d plane, the gx = x + w plane).
export function drawBox(c: PixelCanvas, iso: Iso, box: Box, at: Placement): void {
  const right = at.wall === 'right';
  const x = right ? at.along + box.a : at.out + box.b;
  const y = right ? at.out + box.b : at.along + box.a;
  const w = right ? box.len : box.dep;
  const d = right ? box.dep : box.len;
  const z = box.z;
  const h = box.h;
  if (w <= 0 || d <= 0 || h < 0) return;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const gx of [x, x + w]) {
    for (const gy of [y, y + d]) {
      for (const gz of [z, z + h]) {
        const [sx, sy] = iso.toScreen(gx, gy, gz);
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
    }
  }
  const hx = iso.hx;
  const hy = iso.hy;
  const edge = 1 / hy; // about one pixel, in world units
  const x0 = Math.max(0, Math.floor(minX));
  const x1 = Math.min(c.w - 1, Math.ceil(maxX));
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(c.h - 1, Math.ceil(maxY));
  for (let py = y0; py <= y1; py++) {
    const cy = py + 0.5;
    const lidB = (cy - iso.oy + (z + h) * hy) / (hy / 2); // Iso.floorAt, inlined
    const wallV = (iso.oy - cy) / hy;
    for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5;
      let face: Face | null = null;
      let u = 0;
      let v = 0;
      const a = (cx - iso.ox) / hx; // gx - gy
      // Lid.
      const tx = (a + lidB) / 2;
      const ty = (lidB - a) / 2;
      if (tx >= x && tx < x + w && ty >= y && ty < y + d) {
        face = 'top';
        u = right ? tx - x : ty - y;
        v = right ? ty - y : tx - x;
      } else {
        // Plane gy = y + d (front on the right wall, side on the left wall).
        const gxY = a + y + d;
        const gzY = (gxY + y + d) / 2 + wallV;
        if (gxY >= x && gxY < x + w && gzY >= z && gzY < z + h) {
          face = right ? 'front' : 'side';
          u = gxY - x;
          v = gzY - z;
        } else {
          // Plane gx = x + w (side on the right wall, front on the left wall).
          const gyX = x + w - a;
          const gzX = (x + w + gyX) / 2 + wallV;
          if (gyX >= y && gyX < y + d && gzX >= z && gzX < z + h) {
            face = right ? 'side' : 'front';
            u = gyX - y;
            v = gzX - z;
          }
        }
      }
      if (!face) continue;
      const painted = box.paint ? box.paint(face, u, v) : undefined;
      if (painted === null) continue;
      c.set(px, py, painted ?? detail(box.color, face, u, v, face === 'side' ? (right ? d : w) : right ? w : d, face === 'top' ? (right ? d : w) : h, edge));
    }
  }
}
