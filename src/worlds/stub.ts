import type { Pen } from '../art/types.ts';
import type { RGB } from '../term/color.ts';
import { mix, scale } from '../term/color.ts';
import type { Palette } from '../themes/types.ts';
import { PROP_SIZE } from '../world/layout.ts';
import type { SlotKind } from '../world/types.ts';
import type { PropArt, PropView, RoomArt, RoomView, WorldDef } from './types.ts';

// PLACEHOLDER art, until each world gets its own: the room as a flat floor
// diamond and two flat back walls, every prop as a flat-shaded box over its
// footprint (top lifted, the face toward the lower right dropped, as the
// art direction lights them), thinly inked. Worlds keep their metadata and
// swap these for real art.

const css = (c: RGB) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
const lift = (c: RGB, k: number): RGB => mix(c, [255, 255, 255], k);

function poly(pen: Pen, pts: ReadonlyArray<readonly [number, number]>, fill: RGB): void {
  pen.beginPath();
  pts.forEach(([x, y], i) => (i ? pen.lineTo(x, y) : pen.moveTo(x, y)));
  pen.closePath();
  pen.fillStyle = css(fill);
  pen.fill();
  pen.stroke();
}

// The floor and the two back walls (inner faces, tops and front ends).
export function stubRoom(p: Palette): RoomArt {
  return {
    draw(v: RoomView): void {
      const { pen, at, W, D, H, T } = v;
      pen.save();
      pen.lineJoin = 'round';
      pen.lineWidth = Math.max(1, 0.3 * v.s);
      pen.strokeStyle = css(scale(p.wall, 0.4));
      const wall = lift(p.wall2, 0.25);
      poly(pen, [at(T, T, 0), at(W, T, 0), at(W, D, 0), at(T, D, 0)], p.floor);
      poly(pen, [at(T, T, 0), at(W, T, 0), at(W, T, H), at(T, T, H)], scale(wall, 0.82)); // the right wall's face
      poly(pen, [at(T, T, 0), at(T, D, 0), at(T, D, H), at(T, T, H)], wall); // the left wall's face
      poly(pen, [at(0, 0, H), at(W, 0, H), at(W, T, H), at(T, T, H), at(T, D, H), at(0, D, H)], lift(wall, 0.12)); // their tops
      poly(pen, [at(W, 0, 0), at(W, T, 0), at(W, T, H), at(W, 0, H)], scale(wall, 0.7));
      poly(pen, [at(0, D, 0), at(T, D, 0), at(T, D, H), at(0, D, H)], scale(wall, 0.85));
      pen.restore();
    },
  };
}

// A box `height` tall over the prop's footprint, in `base`: the top, and
// the two faces toward the viewer (u = len and v = dep).
export function stubProp(len: number, dep: number, height: number, base: RGB): PropArt {
  return {
    len,
    dep,
    height,
    draw(v: PropView): void {
      const { pen, at } = v;
      const L = v.len;
      const D = v.dep;
      const h = height;
      // The face toward +y is lit (lower left), the one toward +x is not.
      const [uFace, vFace] = v.wall === 'right' ? [scale(base, 0.82), base] : [base, scale(base, 0.82)];
      pen.save();
      pen.lineJoin = 'round';
      pen.lineWidth = Math.max(1, 0.3 * v.s);
      pen.strokeStyle = css(scale(base, 0.3));
      poly(pen, [at(L, 0, 0), at(L, D, 0), at(L, D, h), at(L, 0, h)], uFace);
      poly(pen, [at(0, D, 0), at(L, D, 0), at(L, D, h), at(0, D, h)], vFace);
      poly(pen, [at(0, 0, h), at(L, 0, h), at(L, D, h), at(0, D, h)], lift(base, 0.12));
      pen.restore();
    },
  };
}

// How tall each station's box stands (units): a desk, shelves, a door.
const HEIGHT: Record<SlotKind, number> = { write: 7, read: 16, search: 9, run: 10, web: 9, think: 8, idle: 5, entrance: 18 };

export function stubStations(p: Palette): Record<SlotKind, PropArt> {
  const hue: Record<SlotKind, RGB> = { write: p.accent, read: p.accent2, search: p.warn, run: p.bad, web: p.good, think: p.border, idle: p.dim, entrance: p.wall2 };
  const out = {} as Record<SlotKind, PropArt>;
  for (const k of Object.keys(PROP_SIZE) as SlotKind[]) {
    const { len, dep } = PROP_SIZE[k];
    out[k] = stubProp(len, dep, HEIGHT[k], mix(hue[k], p.floor, 0.35));
  }
  return out;
}

// A couple of cabinets along the walls and a few low crates on the floor.
export function stubDecor(p: Palette): NonNullable<WorldDef['decor']> {
  return [
    { art: stubProp(6, 3, 12, mix(p.border, p.floor, 0.4)), count: 2, place: 'wall' },
    { art: stubProp(4, 4, 5, mix(p.accent2, p.floor, 0.55)), count: 2, place: 'floor' },
  ];
}
