// Builds as one chunky solid, not voxels: the blocks' visible faces are
// filled flat per colour and side (tops lifted, faces toward the lower right
// dropped, sides a touch darker toward the ground), slightly overgrown so
// neighbouring faces meet without seams; one ink outline runs round the
// whole silhouette and a light rim along the tops' front edges. What is
// still to come is a translucent hologram in the ghost hue. The supply pile
// is a few stacked bricks on a pallet. All drawn once per change and cached
// (see Scene) as sprites placed relative to the projected world origin.

import type { RGB } from '../../term/color.ts';
import type { Block } from '../../world/build.ts';
import type { Rect } from '../../world/layout.ts';
import { Canvas } from '../canvas.ts';
import { hexOf, inkWidth, isoBox, mix, shade } from '../iso.ts';
import type { Color } from '../types.ts';

// A cached picture: its top-left (x, y) in canvas px relative to where the
// world origin projects.
export type Sprite = { img: Canvas; x: number; y: number };

type Pt = [number, number];
const key = (x: number, y: number, z: number) => (x + 1024) * 4194304 + (y + 1024) * 2048 + z;

// Unit-cube faces seen from the viewer: corner offsets (dx, dy, dz).
const TOP: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
const PX: ReadonlyArray<readonly [number, number, number]> = [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]];
const PY: ReadonlyArray<readonly [number, number, number]> = [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]];
const HEX: ReadonlyArray<readonly [number, number, number]> = [[0, 0, 1], [1, 0, 1], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 1, 1]];

// A block's fills: its top, the faces toward +x (lower right) and +y
// (lower left), and the light rim along the top's front edges.
type Look = { top: Color; px: Color; py: Color; rim: Color };

// The canvas box (origin-relative px, integers) round `blocks` at `s`.
function bounds(blocks: readonly Block[], s: number, pad: number): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const b of blocks) {
    const u = b.x - b.y;
    const v = (b.x + b.y) / 2 - b.z;
    if (u - 1 < x0) x0 = u - 1;
    if (u + 1 > x1) x1 = u + 1;
    if (v - 1 < y0) y0 = v - 1;
    if (v + 1 > y1) y1 = v + 1;
  }
  const x = Math.floor(x0 * s - pad);
  const y = Math.floor(y0 * s - pad);
  return { x, y, w: Math.ceil(x1 * s + pad) - x, h: Math.ceil(y1 * s + pad) - y };
}

// Fills one face polygon pushed `e` px out from its middle.
function face(pen: Canvas, at: (x: number, y: number, z: number) => Pt, b: Block, corners: ReadonlyArray<readonly [number, number, number]>, e: number): void {
  const p = corners.map(([dx, dy, dz]) => at(b.x + dx, b.y + dy, b.z + dz));
  const cx = (p[0][0] + p[1][0] + p[2][0] + p[3][0]) / 4;
  const cy = (p[0][1] + p[1][1] + p[2][1] + p[3][1]) / 4;
  pen.beginPath();
  for (let i = 0; i < 4; i++) {
    const dx = p[i][0] - cx;
    const dy = p[i][1] - cy;
    const k = 1 + e / (Math.hypot(dx, dy) || 1);
    if (i) pen.lineTo(cx + dx * k, cy + dy * k);
    else pen.moveTo(cx + dx * k, cy + dy * k);
  }
  pen.closePath();
  pen.fill();
}

// Paints `blocks` into `pen` as one solid: the outline under everything,
// then the faces back to front (x + y + z), each block's rim after it.
function solid(pen: Canvas, at: (x: number, y: number, z: number) => Pt, blocks: readonly Block[], s: number, look: (b: Block) => Look, outline: Color, ow: number): void {
  const filled = new Set<number>();
  for (const b of blocks) filled.add(key(b.x, b.y, b.z));
  const open = (x: number, y: number, z: number) => !filled.has(key(x, y, z));
  // A block whose top's edge toward +x (+y) is a rim: open above, beside
  // and beside above.
  const rimX = (x: number, y: number, z: number) => !open(x, y, z) && open(x, y, z + 1) && open(x + 1, y, z) && open(x + 1, y, z + 1);
  const rimY = (x: number, y: number, z: number) => !open(x, y, z) && open(x, y, z + 1) && open(x, y + 1, z) && open(x, y + 1, z + 1);
  const shown =blocks.filter((b) => open(b.x + 1, b.y, b.z) || open(b.x, b.y + 1, b.z) || open(b.x, b.y, b.z + 1));
  // The silhouette, grown by the outline width: every visible block's
  // hexagon pushed out from its middle, filled as one path (a union).
  pen.beginPath();
  const grow = ow * 1.15;
  for (const b of shown) {
    const [cx, cy] = at(b.x + 0.5, b.y + 0.5, b.z + 0.5);
    HEX.forEach(([dx, dy, dz], i) => {
      const [x, y] = at(b.x + dx, b.y + dy, b.z + dz);
      const k = 1 + grow / (Math.hypot(x - cx, y - cy) || 1);
      if (i) pen.lineTo(cx + (x - cx) * k, cy + (y - cy) * k);
      else pen.moveTo(cx + (x - cx) * k, cy + (y - cy) * k);
    });
    pen.closePath();
  }
  pen.fillStyle = outline;
  pen.fill();
  const order = [...shown].sort((p, q) => p.x + p.y + p.z - (q.x + q.y + q.z) || p.z - q.z);
  const e = Math.min(0.7, 0.12 * s);
  const rimW = Math.max(1, 0.16 * s);
  for (const b of order) {
    const lk = look(b);
    if (open(b.x + 1, b.y, b.z)) {
      pen.fillStyle = lk.px;
      face(pen, at, b, PX, e);
    }
    if (open(b.x, b.y + 1, b.z)) {
      pen.fillStyle = lk.py;
      face(pen, at, b, PY, e);
    }
    if (!open(b.x, b.y, b.z + 1)) continue;
    pen.fillStyle = lk.top;
    face(pen, at, b, TOP, e);
    // The light rim along the top's edges that face the viewer, where
    // nothing stands beside it at this height: running on into the next
    // block's rim, rounded off where the run ends.
    const ex = rimX(b.x, b.y, b.z);
    const ey = rimY(b.x, b.y, b.z);
    if (!ex && !ey) continue;
    const z = b.z + 1;
    const i = rimW / s;
    pen.beginPath();
    if (ex) {
      pen.moveTo(...at(b.x + 1 - i, b.y + (rimX(b.x, b.y - 1, b.z) ? 0 : 0.15), z));
      pen.lineTo(...at(b.x + 1 - i, b.y + (ey || !rimX(b.x, b.y + 1, b.z) ? 1 - i : 1), z));
    } else pen.moveTo(...at(b.x + (rimY(b.x + 1, b.y, b.z) ? 1 : 1 - i), b.y + 1 - i, z));
    if (ey) pen.lineTo(...at(b.x + (rimY(b.x - 1, b.y, b.z) ? 0 : 0.15), b.y + 1 - i, z));
    pen.strokeStyle = lk.rim;
    pen.lineWidth = rimW;
    pen.stroke();
  }
}

// The standing blocks (`blocks`) and the ghost of the rest (`pending`) as
// one sprite at `s` px per unit; null when there is nothing to draw.
export function buildSprite(blocks: readonly Block[], pending: readonly Block[], colors: readonly RGB[], ghost: RGB, s: number, ink: Color): Sprite | null {
  const all = [...blocks, ...pending];
  if (!all.length) return null;
  const ow = inkWidth(s);
  const box = bounds(all, s, ow * 2 + 2);
  const img = new Canvas(box.w, box.h);
  const at = (x: number, y: number, z: number): Pt => [(x - y) * s - box.x, ((x + y) * s) / 2 - z * s - box.y];
  const topZ = Math.max(1, ...all.map((b) => b.z));
  const looks = new Map<number, Look>();
  const lookOf = (c: number, z: number): Look => {
    const k = c * 256 + z;
    let lk = looks.get(k);
    if (!lk) {
      const base = hexOf(colors[c] ?? colors[0] ?? [200, 200, 200]);
      // Sides deepen toward the ground (a soft occlusion), tops stay lit.
      const low = 0.14 * (1 - Math.min(1, z / Math.max(4, topZ * 0.6)));
      lk = { top: shade(base, 0.12), py: shade(base, -low), px: shade(shade(base, -0.18), -low), rim: mix(shade(base, 0.12), '#fffdf4', 0.55) };
      looks.set(k, lk);
    }
    return lk;
  };
  if (blocks.length) solid(img, at, blocks, s, (b) => lookOf(b.c, b.z), ink, ow + 0.5);
  if (pending.length) {
    // The hologram: drawn solid on its own, then laid over at low alpha
    // with every third row brighter, like scan lines.
    const holo = new Canvas(box.w, box.h);
    const g = hexOf(ghost);
    const lk: Look = { top: mix(g, '#ffffff', 0.45), py: g, px: shade(g, -0.25), rim: '#ffffff' };
    solid(holo, at, pending, s, () => lk, mix(g, '#ffffff', 0.25), Math.max(1, ow * 0.6));
    const d = holo.data;
    const rowPeriod = Math.max(3, Math.round(s * 0.75));
    for (let y = 0; y < box.h; y++) {
      const k = y % rowPeriod === 0 ? 0.6 : 0.3;
      for (let o = y * box.w * 4, e = o + box.w * 4; o < e; o++) d[o] = d[o] * k;
    }
    img.drawImage(holo, 0, 0);
  }
  return { img, x: box.x, y: box.y };
}

// The supply pile: a pallet with a few bricks stacked on it, in the build's
// colours (not the cap), laid differently per pile.
export function pileSprite(pile: Rect, colors: readonly RGB[], s: number, ink: Color, seed: number): Sprite {
  const plain = colors.length > 1 ? colors.slice(0, -1) : colors;
  const pad = Math.ceil(inkWidth(s) * 2 + 2);
  const w = pile.x1 - pile.x0;
  const d = pile.y1 - pile.y0;
  const box = bounds([{ x: pile.x0, y: pile.y0, z: 0, c: 0 }, { x: pile.x1 - 1, y: pile.y1 - 1, z: 2, c: 0 }], s, pad);
  const img = new Canvas(box.w, box.h);
  const at = (x: number, y: number, z: number): Pt => [(x - y) * s - box.x, ((x + y) * s) / 2 - z * s - box.y];
  const local = (u: number, v: number, z: number): Pt => at(pile.x0 + u, pile.y0 + v, z);
  const line = inkWidth(s) * 0.8;
  isoBox(img, local, 0.15, 0.15, 0, w - 0.3, d - 0.3, 0.35, '#8a6440', { ink, line, round: 0.15, stripe: false });
  // Bricks: two courses crosswise, back to front.
  const bricks: Array<[number, number, number, number, number, number]> = [];
  const bw = (w - 0.6) / 2;
  const bd = (d - 0.6) / 3;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 3; j++) bricks.push([0.3 + i * bw, 0.3 + j * bd, 0.35, bw - 0.08, bd - 0.08, 0.55]);
  const top = seed % 3;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 3; i++) if ((i + j + top) % 3) bricks.push([0.35 + i * ((w - 0.7) / 3), 0.35 + j * ((d - 0.7) / 2), 0.9, (w - 0.7) / 3 - 0.08, (d - 0.7) / 2 - 0.08, 0.55]);
  bricks.sort((p, q) => p[0] + p[1] + p[2] - (q[0] + q[1] + q[2]));
  bricks.forEach(([u, v, z, du, dv, dz], k) => {
    const c = plain[(k + seed) % plain.length] ?? [200, 120, 80];
    isoBox(img, local, u, v, z, du, dv, dz, hexOf(c), { ink, line, round: 0.12 });
  });
  return { img, x: box.x, y: box.y };
}
