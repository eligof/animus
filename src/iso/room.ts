import type { RGB } from '../term/color.ts';
import { mix, scale } from '../term/color.ts';
import type { IsoStation, IsoTheme, StationKind } from '../themes/types.ts';
import { drawBox } from './box.ts';
import type { Placement } from './box.ts';
import type { PixelCanvas } from './canvas.ts';
import { Iso } from './projection.ts';

export type Spot = { gx: number; gy: number };

export type Placed = {
  kind: StationKind | 'entrance';
  station: IsoStation;
  at: Placement;
  spot: Spot; // where an agent stands to work here
  depth: number; // painter's order (gx + gy of the front edge)
  users: number;
};

export type Room = { iso: Iso; W: number; D: number; wallH: number; cw: number; ch: number; placed: Placed[] };

const RIGHT_WALL: StationKind[] = ['write', 'run', 'think', 'idle'];
const LEFT_WALL: Array<StationKind | 'entrance'> = ['read', 'search', 'web', 'entrance'];
const SLAB = 0.5; // thickness of the floor slab under the room (height units)
const SPOT_OUT = 1.5; // how far in front of a piece its work spot is

// Chooses tile size and room size so the whole diorama (walls, floor, slab)
// fits the canvas, preferring large tiles, then places the furniture.
// `ky` is the pixel aspect (width / height: 1 for half blocks, 0.75 for
// sextants) and `maxTw` the largest tile width tried.
export function layoutRoom(cw: number, ch: number, theme: IsoTheme, ky = 1, maxTw = 12): Room {
  // What each wall's furniture needs (tiles along the wall).
  const lenSum = (kinds: Array<StationKind | 'entrance'>) => kinds.reduce((n, k) => n + theme.stations[k].size.len, 0);
  const rightDepth = Math.max(...RIGHT_WALL.map((k) => theme.stations[k].size.dep));
  const needW = Math.ceil(0.4 + lenSum(RIGHT_WALL));
  const needD = Math.ceil(rightDepth + 0.5 + lenSum(LEFT_WALL));
  // Tiles stop at 12 px: big terminals get a bigger room rather than
  // blockier characters. Prefer a roomy floor, then one that fits the
  // furniture, then whatever fits at all.
  const tws: number[] = [];
  for (let tw = maxTw; tw >= 4; tw -= 2) tws.push(tw);
  const options = tws.map((tw) => {
    const hx = tw / 2;
    const hy = hx * ky;
    const sumW = Math.floor((cw - 4) / hx);
    const sumH = Math.floor(((ch - 3 - (theme.wallH + SLAB) * hy) * 2) / hy);
    return { tw, sum: Math.min(sumW, sumH) };
  });
  const need = needW + needD;
  const pick = options.find((o) => o.sum >= Math.max(16, need)) ?? options.find((o) => o.sum >= need) ?? options[options.length - 1];
  const hx = pick.tw / 2;
  const hy = hx * ky;
  let W = Math.max(needW, Math.round(pick.sum * 0.55));
  let D = pick.sum - W;
  if (D < needD) {
    D = needD;
    W = Math.max(needW, pick.sum - D);
  }
  const totalH = (theme.wallH + SLAB) * hy + ((W + D) * hy) / 2;
  const ox = Math.round((cw - (W + D) * hx) / 2 + D * hx);
  const oy = Math.round(Math.max(1, (ch - totalH) / 2) + theme.wallH * hy);
  const iso = new Iso(pick.tw, ox, oy, ky);
  const placed: Placed[] = [];
  placeAlong(placed, theme, RIGHT_WALL, 'right', 0.2, W);
  placeAlong(placed, theme, LEFT_WALL, 'left', rightDepth + 0.3, D);
  return { iso, W, D, wallH: theme.wallH, cw, ch, placed };
}

function placeAlong(out: Placed[], theme: IsoTheme, kinds: Array<StationKind | 'entrance'>, wall: 'left' | 'right', start: number, end: number): void {
  const lens = kinds.map((k) => theme.stations[k].size.len);
  const total = lens.reduce((a, b) => a + b, 0);
  const span = end - start;
  const gap = Math.max(0, (span - total) / (kinds.length + 1));
  let cursor = start + gap;
  kinds.forEach((kind, i) => {
    const station = theme.stations[kind];
    const along = cursor;
    cursor += lens[i] + gap;
    const mid = along + lens[i] / 2;
    const front = station.size.dep + SPOT_OUT;
    out.push({
      kind,
      station,
      at: { wall, along, out: 0 },
      spot: wall === 'right' ? { gx: mid, gy: front } : { gx: front, gy: mid },
      depth: mid + station.size.dep,
      users: 0,
    });
  });
}

export function wallToScreen(room: Room, side: 'left' | 'right', u: number, v: number): [number, number] {
  return side === 'left' ? room.iso.toScreen(0, u, v) : room.iso.toScreen(u, 0, v);
}

export function localToScreen(room: Room, p: Placed, a: number, b: number, z: number): [number, number] {
  return p.at.wall === 'right'
    ? room.iso.toScreen(p.at.along + a, p.at.out + b, z)
    : room.iso.toScreen(p.at.out + b, p.at.along + a, z);
}

// Floor (with a slab underneath) and the two back walls, painted by the theme.
export function drawRoom(c: PixelCanvas, room: Room, theme: IsoTheme, t: number, now: number): void {
  const { iso, W, D, wallH } = room;
  const { hx, hy } = iso;
  // Sampled at a fixed tile and time so animated floors don't flicker the base.
  const slab = scale(theme.floor(0.5, 0.5, 0), 0.45);
  drawBox(c, iso, { a: 0, b: 0, z: -SLAB, len: W, dep: D, h: SLAB, color: slab, paint: (f) => (f === 'top' ? null : undefined) }, { wall: 'right', along: 0, out: 0 });
  const x0 = Math.max(0, Math.floor(iso.ox - D * hx));
  const x1 = Math.min(c.w - 1, Math.ceil(iso.ox + W * hx));
  const y0 = Math.max(0, Math.floor(iso.oy - wallH * hy));
  const y1 = Math.min(c.h - 1, Math.ceil(iso.oy + ((W + D) * hy) / 2));
  const shadow: RGB = [0, 0, 0];
  for (let py = y0; py <= y1; py++) {
    const cy = py + 0.5;
    const b = (cy - iso.oy) / (hy / 2); // gx + gy on the floor (Iso.floorAt, inlined)
    for (let px = x0; px <= x1; px++) {
      const cx = px + 0.5;
      const a = (cx - iso.ox) / hx; // gx - gy
      const gx = (a + b) / 2;
      const gy = (b - a) / 2;
      if (gx >= 0 && gx < W && gy >= 0 && gy < D) {
        let col = theme.floor(gx, gy, t);
        const nearWall = Math.min(gx, gy);
        if (nearWall < 0.35) col = mix(col, shadow, 0.22 * (1 - nearWall / 0.35));
        c.set(px, py, col);
        continue;
      }
      // Right wall: plane gy = 0, so gx = a.
      if (a >= 0 && a < W) {
        const v = a / 2 + (iso.oy - cy) / hy;
        if (v >= 0 && v < wallH) {
          c.set(px, py, wallShade(theme.wall('right', a, v, t, now), v, wallH, 1));
          continue;
        }
      }
      // Left wall: plane gx = 0, so gy = -a.
      if (-a >= 0 && -a < D) {
        const v = -a / 2 + (iso.oy - cy) / hy;
        if (v >= 0 && v < wallH) c.set(px, py, wallShade(theme.wall('left', -a, v, t, now), v, wallH, 0.86));
      }
    }
  }
}

// Left wall a touch darker than the right (light from the right), and a
// soft contact shadow where the wall meets the floor.
function wallShade(c: RGB, v: number, wallH: number, k: number): RGB {
  const base = k === 1 ? c : scale(c, k);
  return v < 0.3 ? mix(base, [0, 0, 0], 0.18 * (1 - v / 0.3)) : v > wallH - 0.08 ? scale(base, 0.8) : base;
}
