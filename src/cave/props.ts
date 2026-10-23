import type { RGB } from '../term/color.ts';
import { hex, mix } from '../term/color.ts';
import type { Rng } from '../world/rng.ts';
import { slotsOn } from './layout.ts';
import type { Site } from './layout.ts';
import type { Ctx, Layout, Prop, Slot, SlotKind } from './types.ts';
import type { Voxels } from './voxels.ts';
import { M, MATERIALS, material } from './materials.ts';

// ── materials ────────────────────────────────────────────────────────────
// What a biome builds its props from. Every prop is generic; a biome hands
// it this palette (wood or bone frames, iron or gold fittings...).
export type PropMats = {
  frame: number; // timber: shelves, stump, door frame, torch sticks, beams
  metal: number; // anvil, pot, rails, torch cups, claws
  cloth: number; // bedroll, altar runner
  stone: number; // altar, pedestal, fire-pit stones
  stone2: number; // darker stone: plinths, hearth bed
  glow: number; // the orb
  liquid: number; // the brew in the cauldron
  quench: number; // the anvil's bucket
  candle: number; // wax
  ore: number; // veins at the dig face
  seam: number; // a second, darker seam at the dig face (coal)
  rubble: number; // what digging knocks loose (a powder)
  fuel: number; // the campfire's bed of embers (burns slowly)
  trim: number; // inlays: the altar band, the pedestal ring
  bone: number; // skulls
  books: readonly number[]; // book spines
  rune: RGB; // runes drifting off the books
};

const FLAMMABLE = new Uint8Array(256);
const SOLID = new Uint8Array(256);
for (let id = 0; id < 256; id++) {
  const m = MATERIALS[id];
  if (m?.flammable) FLAMMABLE[id] = 1;
  if (m?.kind === 'solid') SOLID[id] = 1;
}

export const isFlammable = (m: number): boolean => FLAMMABLE[m] === 1;
export const isSolid = (m: number): boolean => SOLID[m] === 1;

// A colour of a material (variant 0 darkest .. 7 lightest).
export function tone(m: number, variant = 5): RGB {
  return material(m).colors[variant];
}

// ── noise ────────────────────────────────────────────────────────────────
// Hash of a lattice point to [0, 1).
export function hash3(seed: number, x: number, y: number, z: number): number {
  let h = (seed ^ Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x1b873593)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth 2D value noise in [0, 1).
export function noise2(seed: number, x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let fx = x - xi;
  let fy = y - yi;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash3(seed, xi, yi, 0);
  const b = hash3(seed, xi + 1, yi, 0);
  const c = hash3(seed, xi, yi + 1, 0);
  const d = hash3(seed, xi + 1, yi + 1, 0);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

// A colour variant 0..7 in 2-voxel clumps plus fine speckle, so stone reads
// as texture rather than salt and pepper.
export function grain(seed: number, x: number, y: number, z: number): number {
  return Math.min(7, (hash3(seed, x >> 1, y >> 1, z >> 1) * 5 + hash3(seed ^ 0x5bd1e995, x, y, z) * 3) | 0);
}

// ── terrain kit ──────────────────────────────────────────────────────────
// Shared world-building steps; a biome's generate() strings them together
// with its own materials.

// One rock layer: material, how often it comes up, thickness range.
export type Band = readonly [mat: number, weight: number, min: number, max: number];

export type Strata = {
  bands: readonly Band[]; // the body of the rock
  topsoil?: readonly Band[]; // the top `soilDepth` levels
  soilDepth?: number;
  seam?: number; // thin lenses running along the layers (coal)
  seams?: number;
  warp?: number; // how far the layers undulate, in voxels
};

// Fills each column (x, y) from z = 0 up to top[x + W * y] with rock in
// noisy, undulating horizontal strata, so the cut faces read as layers.
export function fillStrata(v: Voxels, L: Layout, rng: Rng, spec: Strata, top: Uint8Array): void {
  const { W, D, H } = L;
  const seed = rng.int(0, 0x3fffffff);
  const amp = spec.warp ?? 3;
  const OFF = 3;
  const n = H + Math.ceil(amp) + OFF + 4;
  const bands = new Uint8Array(n);
  const soilFrom = spec.topsoil && spec.soilDepth ? H - spec.soilDepth + OFF : n;
  let prev = -1;
  for (let i = 0; i < n; ) {
    const table = i >= soilFrom ? spec.topsoil! : spec.bands;
    const pick = () => rng.weighted(table.map((b) => [b, b[1]] as const));
    let b = pick();
    for (let k = 0; k < 4 && b[0] === prev; k++) b = pick();
    const t = rng.int(b[2], b[3]);
    bands.fill(b[0], i, i + t);
    prev = b[0];
    i += t;
  }
  const seams = Array.from({ length: spec.seam === undefined ? 0 : (spec.seams ?? 2) }, () => rng.range(2, H - 4));
  const warp = new Float32Array(W * D);
  const lens = seams.map(() => new Float32Array(W * D));
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < W; x++) {
      const c = x + W * y;
      warp[c] = amp * (0.7 * noise2(seed, x * 0.05, y * 0.05) + 0.3 * noise2(seed + 1, x * 0.15, y * 0.15));
      for (let k = 0; k < seams.length; k++) lens[k][c] = noise2(seed + 10 + k, x * 0.08, y * 0.08);
    }
  }
  for (let z = 0; z < H; z++) {
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        const c = x + W * y;
        if (z >= top[c]) continue;
        const s = z + warp[c] + (hash3(seed, x, y, z) - 0.5) * 0.9;
        let m = bands[Math.max(0, Math.min(n - 1, Math.floor(s) + OFF))];
        for (let k = 0; k < seams.length; k++) {
          if (lens[k][c] > 0.6 && Math.abs(s - seams[k]) < 0.8) m = spec.seam!;
        }
        v.set(v.idx(x, y, z), m, grain(seed, x, y, z));
      }
    }
  }
}

// Random-walk veins of `mat` through the rock, starting on faces the camera
// sees (inner wall faces, cut faces). Only replaces what `into` accepts.
export function veins(v: Voxels, L: Layout, rng: Rng, mat: number, count: number, into: (m: number) => boolean, steps: readonly [number, number] = [6, 14]): void {
  const { W, D, H, T, floor } = L;
  const grow = (x: number, y: number, z: number) => {
    if (into(v.get(x, y, z))) v.put(x, y, z, mat);
  };
  for (let k = 0; k < count; k++) {
    let x: number;
    let y: number;
    let z = rng.int(0, H - 1);
    switch (rng.int(0, 4)) {
      case 0: // left wall, inner face
        x = T - 1 - rng.int(0, 2);
        y = rng.int(0, D - 1);
        break;
      case 1: // right wall, inner face
        x = rng.int(0, W - 1);
        y = T - 1 - rng.int(0, 2);
        break;
      case 2: // left wall, cut end
        x = rng.int(0, T - 1);
        y = D - 1 - rng.int(0, 2);
        break;
      case 3: // right wall, cut end
        x = W - 1 - rng.int(0, 2);
        y = rng.int(0, T - 1);
        break;
      default: // floor, cut faces
        if (rng.chance(0.5)) {
          x = W - 1 - rng.int(0, 2);
          y = rng.int(T, D - 1);
        } else {
          x = rng.int(T, W - 1);
          y = D - 1 - rng.int(0, 2);
        }
        z = rng.int(0, Math.max(0, floor - 2));
    }
    for (let s = rng.int(steps[0], steps[1]); s > 0; s--) {
      grow(x, y, z);
      if (rng.chance(0.4)) grow(x + rng.int(-1, 1), y + rng.int(-1, 1), z + rng.int(-1, 1));
      const r = rng.next();
      if (r < 0.38) x += rng.chance(0.5) ? 1 : -1;
      else if (r < 0.76) y += rng.chance(0.5) ? 1 : -1;
      else z += rng.chance(0.5) ? 1 : -1;
    }
  }
}

// Where a point on a wall face is: `along` the wall, `out` from its face
// (0 = the first voxel of open floor, negative = into the slab).
export function onWall(L: Layout, wall: 'left' | 'right', along: number, out: number): [number, number] {
  return wall === 'left' ? [L.T + out, along] : [along, L.T + out];
}

// Bulges and hollows on the inner wall faces, so they read as hewn rock
// rather than a ruler-straight slab. Spares the stretch behind each slot up
// to `clearH` above the floor.
export function roughenWalls(v: Voxels, L: Layout, rng: Rng, clearH = 24): void {
  const { W, D, H, T, floor } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    const spans = slotsOn(L, wall).map((s) => (wall === 'left' ? s.y0 : s.x0));
    const lens = slotsOn(L, wall).map((s) => s.len);
    const behind = (a: number) => spans.some((p, k) => a >= p - 2 && a < p + lens[k] + 2);
    for (let a = T; a < end; a++) {
      const spared = behind(a);
      for (let z = floor; z < H; z++) {
        if (spared && z < floor + clearH) continue;
        const n = noise2(seed + (wall === 'left' ? 0 : 7), a * 0.13, z * 0.17);
        if (n > 0.64) {
          const [bx, by] = onWall(L, wall, a, -1);
          const rock = v.get(bx, by, z);
          if (!isSolid(rock)) continue;
          for (let o = 0; o < (n > 0.8 ? 2 : 1); o++) {
            const [x, y] = onWall(L, wall, a, o);
            if (v.get(x, y, z) === M.AIR) v.put(x, y, z, rock, grain(seed, x, y, z));
          }
        } else if (n < 0.22) {
          for (let o = 1; o <= (n < 0.12 ? 2 : 1); o++) {
            const [x, y] = onWall(L, wall, a, -o);
            v.put(x, y, z, M.AIR);
          }
        }
      }
    }
  }
}

// Digs a bowl `depth` voxels into the floor at `site` and fills it with
// `liquid` to a voxel below the rim. No layer is wider than the one above,
// so the liquid has solid ground under it and beside it everywhere.
export function pit(v: Voxels, L: Layout, site: Site, depth: number, liquid: number): void {
  for (let k = 0; k < depth; k++) {
    const z = L.floor - 1 - k;
    if (z < 1) break;
    const f = 1 - k * 0.2;
    const rx = site.rx * f;
    const ry = site.ry * f;
    for (let y = Math.floor(site.y - ry); y <= Math.ceil(site.y + ry); y++) {
      for (let x = Math.floor(site.x - rx); x <= Math.ceil(site.x + rx); x++) {
        if (((x - site.x) / rx) ** 2 + ((y - site.y) / ry) ** 2 <= 1) v.put(x, y, z, k === 0 ? M.AIR : liquid);
      }
    }
  }
}

// Timber on a wall face: 2 x 2 posts at `posts` (along the wall) from the
// floor up to `top`, and a header beam across their tops.
export function beams(v: Voxels, L: Layout, wall: 'left' | 'right', posts: readonly number[], top: number, mat: number): void {
  if (!posts.length) return;
  const at = (a: number, o: number, z: number, shade: number) => {
    const [x, y] = onWall(L, wall, a, o);
    v.put(x, y, z, mat, shade);
  };
  for (const p of posts) {
    for (let z = L.floor; z < top + 2; z++) {
      for (let o = 0; o < 2; o++) {
        at(p, o, z, 2);
        at(p + 1, o, z, 4);
      }
    }
  }
  const a1 = Math.max(...posts) + 2;
  for (let a = Math.min(...posts); a < a1; a++) {
    at(a, 0, top, 3);
    at(a, 0, top + 1, 5);
  }
}

// A cone of powder heaped on the floor around (cx, cy), r voxels to its
// foot. `skip` keeps it off floor cells that must stay clear.
export function heap(v: Voxels, L: Layout, cx: number, cy: number, r: number, mat: number, skip?: (x: number, y: number) => boolean): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const d = Math.hypot(x - cx, y - cy);
      const h = Math.floor((r - d) * 0.8);
      if (h <= 0 || x < L.T || y < L.T || x >= L.W || y >= L.D || skip?.(x, y)) continue;
      const g = v.ground(x, y, L.floor + 3);
      for (let z = g; z < g + h; z++) if (v.get(x, y, z) === M.AIR) v.put(x, y, z, mat);
    }
  }
}

// Roots dangling from the top of the inner wall faces (down to `minZ`),
// and moss patches on the face rock up there.
export function hangers(v: Voxels, L: Layout, rng: Rng, root: number, moss: number, count: number, minZ: number): void {
  const { W, D, H, T } = L;
  const seed = rng.int(0, 0x3fffffff);
  for (let k = 0; k < count; k++) {
    const wall = rng.chance(0.5) ? 'left' : 'right';
    let a = rng.int(T + 1, (wall === 'left' ? D : W) - 2);
    const len = rng.int(3, 9);
    for (let i = 0, z = H - 1; i < len && z >= minZ; i++, z--) {
      const [x, y] = onWall(L, wall, a, 0);
      if (v.get(x, y, z) !== M.AIR) break;
      v.put(x, y, z, root, rng.int(0, 2));
      if (rng.chance(0.2)) a += rng.chance(0.5) ? 1 : -1;
    }
  }
  for (const wall of ['left', 'right'] as const) {
    const end = wall === 'left' ? D : W;
    for (let a = T; a < end; a++) {
      for (let z = H - 7; z < H; z++) {
        const n = noise2(seed + (wall === 'left' ? 3 : 4), a * 0.22, z * 0.3);
        if (n < 0.75 - (z - (H - 7)) * 0.04) continue;
        for (const o of [-1, 0]) {
          const [x, y] = onWall(L, wall, a, o);
          const m = v.get(x, y, z);
          if (o === -1 ? isSolid(m) : m === M.AIR && n > 0.8) v.put(x, y, z, moss);
        }
      }
    }
  }
}

// True if anything flammable lies within the box around (x, y) spanning
// z0..z1, padded by r sideways (and r below, `up` above).
export function fuelNear(v: Voxels, x: number, y: number, z0: number, z1: number, r: number, up = r): boolean {
  for (let z = z0 - r; z <= z1 + up; z++) {
    for (let yy = y - r; yy <= y + r; yy++) {
      for (let xx = x - r; xx <= x + r; xx++) if (isFlammable(v.get(xx, yy, z))) return true;
    }
  }
  return false;
}

// ── fire and effects ─────────────────────────────────────────────────────
export const FLAME: RGB = hex('#ff9a3c');
const CANDLELIGHT: RGB = hex('#ffc277');
const HOT_IRON: RGB = hex('#ff7a2a');
const SPARKS: readonly RGB[] = [hex('#fff6c8'), hex('#ffd25e'), hex('#ffa035')];
const GOLD_GLINT: RGB = hex('#fff0a0');
const WISP: RGB = hex('#cfe0ff');

// Flame lifetimes in sim ticks. A bare flame climbs at most one voxel per
// tick, so the lifetime also caps how high its tongue can reach.
export const TORCH_LIFE = 6;
const CANDLE_LIFE = 4;
const HEARTH_LIFE = 20; // under the pot: nowhere to climb
const CAMPFIRE_LIFE = 9;

// Keeps a bare flame at (x, y, z): lights it in air or smoke, tops up a
// dying one, leaves anything else (a burning log, a stone) alone.
export function keepFire(c: Ctx, x: number, y: number, z: number, life: number): void {
  const v = c.v;
  if (!v.inside(x, y, z)) return;
  const i = v.idx(x, y, z);
  const m = v.mat[i];
  const bare = m === M.FIRE && v.shade[i] < 8 && v.life[i] < life >> 1;
  if (m === M.AIR || m === M.SMOKE || bare) v.set(i, M.FIRE, c.rng.int(0, 4), life);
}

// Puffs a voxel of gas (smoke, steam) into air at (x, y, z).
export function puff(c: Ctx, x: number, y: number, z: number, m: number = M.SMOKE, life = 50): void {
  if (c.v.get(x, y, z) === M.AIR) c.v.put(x, y, z, m, c.rng.int(0, 7), life);
}

// True on the frame a `period`-second beat ticks over.
export function beat(c: Ctx, period: number, phase = 0): boolean {
  const t = c.t + phase;
  return Math.floor(t / period) !== Math.floor((t - c.dt) / period);
}

// About 0.8..1.1: firelight flicker; `k` decorrelates neighbouring fires.
export function flicker(t: number, k = 0): number {
  return 0.95 + 0.1 * Math.sin(t * 11 + k) * Math.sin(t * 6.7 + k * 2.3) + 0.05 * Math.sin(t * 23 + k * 0.7);
}

// A wall torch with its cup at height z: a timber stick, a metal cup and a
// flame. The flame starts two voxels above the timber, so it never lights it.
export function buildTorch(v: Voxels, x: number, y: number, z: number, m: Pick<PropMats, 'frame' | 'metal'>): void {
  for (let k = 1; k <= 3; k++) v.put(x, y, z - k, m.frame, k === 3 ? 1 : 3);
  v.put(x, y, z, m.metal, 6);
  v.put(x, y, z + 2, M.AIR);
  v.put(x, y, z + 1, M.FIRE, 2, TORCH_LIFE);
}

// Keeps a torch burning and lit while its cup and stick are there; false
// once it is gone (dug out, burnt, never built).
export function tendTorch(c: Ctx, x: number, y: number, z: number, m: Pick<PropMats, 'frame' | 'metal'>): boolean {
  if (c.v.get(x, y, z) !== m.metal || c.v.get(x, y, z - 1) !== m.frame) return false;
  keepFire(c, x, y, z + 1, TORCH_LIFE);
  c.light({ x: x + 0.5, y: y + 0.5, z: z + 1.5, color: FLAME, radius: 22, intensity: 0.85 * flicker(c.t, x * 7 + y) });
  return true;
}

// ── prop frames ──────────────────────────────────────────────────────────
// Props build in their slot's frame: `a` along the wall, `b` out into the
// room (negative digs into the wall slab), `h` up from the floor.
export function wx(s: Slot, a: number, b: number): number {
  return s.wall === 'right' ? s.x0 + a : s.x0 + b;
}

export function wy(s: Slot, a: number, b: number): number {
  return s.wall === 'right' ? s.y0 + b : s.y0 + a;
}

// Thickness of the wall slab behind a slot.
export function wallOf(s: Slot): number {
  return s.wall === 'right' ? s.y0 : s.x0;
}

// Unit step out from the wall, in world (x, y).
function outward(s: Slot): [number, number] {
  return s.wall === 'right' ? [0, 1] : [1, 0];
}

function put(v: Voxels, s: Slot, a: number, b: number, h: number, m: number, shade?: number, life?: number): void {
  v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, m, shade, life);
}

function get(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.get(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

// Fills [a0, a1) x [b0, b1) x [h0, h1).
function fill(v: Voxels, s: Slot, a0: number, b0: number, h0: number, a1: number, b1: number, h1: number, m: number, shade?: number): void {
  for (let h = h0; h < h1; h++) {
    for (let b = b0; b < b1; b++) {
      for (let a = a0; a < a1; a++) put(v, s, a, b, h, m, shade);
    }
  }
}

// ── props ────────────────────────────────────────────────────────────────

// write: an anvil on a stump, a hammer on the floor and a quench bucket.
// Working it rings out sparks on every blow.
export function anvil(m: PropMats): Prop {
  const STRIKE = 0.55; // seconds between blows
  const centre = (s: Slot) => [Math.floor(s.len / 2), Math.floor(s.dep / 2)] as const;
  return {
    name: 'anvil',
    build(v, s) {
      const [ca, cb] = centre(s);
      for (let a = ca - 3; a <= ca + 3; a++) {
        for (let b = cb - 3; b <= cb + 3; b++) {
          const d2 = (a - ca) ** 2 + (b - cb) ** 2;
          if (d2 > 5.3) continue;
          put(v, s, a, b, 0, m.frame, 1);
          put(v, s, a, b, 1, m.frame, (a + b) & 1 ? 3 : 2);
          put(v, s, a, b, 2, m.frame, d2 < 2 ? 6 : d2 < 4 ? 5 : 3); // growth rings on top
        }
      }
      fill(v, s, ca - 2, cb - 1, 3, ca + 3, cb + 2, 4, m.metal, 2); // foot
      fill(v, s, ca - 1, cb - 1, 4, ca + 2, cb + 2, 5, m.metal, 0); // waist
      fill(v, s, ca - 4, cb - 1, 5, ca + 4, cb + 2, 6, m.metal, 6); // face
      put(v, s, ca + 4, cb, 5, m.metal, 5); // horn
      // hammer
      put(v, s, 1, s.dep - 1, 0, m.metal, 3);
      put(v, s, 2, s.dep - 1, 0, m.metal, 4);
      fill(v, s, 3, s.dep - 1, 0, 6, s.dep, 1, m.frame, 5);
      // quench bucket: staves round a voxel of water
      const qa = s.len - 2;
      for (let a = qa - 1; a <= qa + 1; a++) {
        for (let b = 0; b <= 2; b++) {
          for (let h = 0; h < 3; h++) if (a !== qa || b !== 1 || h === 0) put(v, s, a, b, h, m.frame, h === 1 ? 1 : 4);
        }
      }
      put(v, s, qa, 1, 1, m.quench);
    },
    tick(c, s, active) {
      if (!active) return;
      const [ca, cb] = centre(s);
      const x = wx(s, ca, cb) + 0.5;
      const y = wy(s, ca, cb) + 0.5;
      const z = s.z0 + 6.3;
      const since = c.t % STRIKE;
      c.light({ x, y, z, color: HOT_IRON, radius: 12, intensity: 0.4 });
      if (since < 0.15) c.light({ x, y, z: z + 1, color: SPARKS[0], radius: 20, intensity: 1 - (since / 0.15) * 0.6 });
      const n = beat(c, STRIKE) ? c.rng.int(5, 9) : c.rng.chance(c.dt * 3) ? 1 : 0;
      for (let k = 0; k < n; k++) {
        c.spawn({ kind: 'spark', x, y, z, vx: c.rng.range(-5, 5), vy: c.rng.range(-5, 5), vz: c.rng.range(3, 9), life: c.rng.range(0.2, 0.55), color: c.rng.pick(SPARKS), glow: true, gravity: 28 });
      }
    },
  };
}

// read: a tall bookshelf, books of every binding, a skull keeping watch.
// Reading lifts faint runes off the spines.
export function bookshelf(m: PropMats): Prop {
  const BOARDS = [0, 5, 10, 15, 18];
  const TOP = BOARDS[BOARDS.length - 1];
  return {
    name: 'bookshelf',
    build(v, s, rng) {
      const L = s.len;
      const B = s.dep;
      fill(v, s, 1, 0, 0, L - 1, 1, TOP, m.frame, 0); // back panel
      for (const a of [0, L - 1]) fill(v, s, a, 0, 0, a + 1, B, TOP + 1, m.frame, 3);
      for (const h of BOARDS) fill(v, s, 0, 0, h, L, B, h + 1, m.frame, 5);
      for (const a of [0, L - 1]) put(v, s, a, B - 1, TOP + 1, m.frame, 6);
      let skull = false;
      for (let k = 0; k + 1 < BOARDS.length; k++) {
        const h0 = BOARDS[k] + 1;
        const room = BOARDS[k + 1] - h0;
        for (let a = 1; a < L - 1; ) {
          const r = rng.next();
          if (r < 0.08) {
            a++;
          } else if (r < 0.14 && !skull && room >= 2 && a + 2 < L) {
            fill(v, s, a, 1, h0, a + 2, B - 1, h0 + 2, m.bone, 6);
            fill(v, s, a, B - 2, h0 + 1, a + 2, B - 1, h0 + 2, m.stone2, 0); // eye sockets
            skull = true;
            a += 2;
          } else if (r < 0.24 && room >= 2) {
            // a stack lying flat
            const w = Math.min(rng.int(2, 3), L - 1 - a);
            for (let i = rng.int(1, Math.min(3, room)) - 1; i >= 0; i--) fill(v, s, a, 1, h0 + i, a + w, B - 1, h0 + i + 1, rng.pick(m.books), rng.int(1, 6));
            a += w;
          } else {
            fill(v, s, a, 1, h0, a + 1, B - 1, h0 + Math.max(1, room - rng.int(0, 1)), rng.pick(m.books), rng.int(1, 6));
            a++;
          }
        }
      }
    },
    tick(c, s, active) {
      if (!active) return;
      const [ox, oy] = outward(s);
      const mid = s.len / 2;
      c.light({ x: wx(s, mid, s.dep + 1), y: wy(s, mid, s.dep + 1), z: s.z0 + 9, color: m.rune, radius: 14, intensity: 0.3 + 0.08 * Math.sin(c.t * 3) });
      if (!c.rng.chance(c.dt * 7)) return;
      const a = c.rng.range(1, s.len - 1);
      const sp = c.rng.range(0.4, 1.4);
      c.spawn({
        kind: 'rune',
        x: wx(s, a, s.dep),
        y: wy(s, a, s.dep),
        z: s.z0 + c.rng.range(2, 16),
        vx: ox * sp + c.rng.range(-0.3, 0.3),
        vy: oy * sp + c.rng.range(-0.3, 0.3),
        vz: c.rng.range(1.5, 3),
        life: c.rng.range(1.2, 2.2),
        color: m.rune,
        glow: true,
        gravity: -0.6,
      });
    },
  };
}

// search: a timbered niche in the wall whose craggy face is shot through
// with ore. Working it chips the face back, a voxel or three per swing,
// deeper over time but never through the slab's last two voxels.
export function digFace(m: PropMats): Prop {
  const TOP = 12; // height of the niche
  const SWING = 0.6; // seconds per pickaxe swing
  const back = (s: Slot) => -(wallOf(s) - 2); // deepest b it may reach
  const hard = (x: number) => x === m.frame || x === m.metal;
  // The front-most solid voxel in the face at (a, h), if it may be dug.
  const faceAt = (v: Voxels, s: Slot, a: number, h: number): number | null => {
    for (let b = s.dep - 1; b >= back(s); b--) {
      const x = get(v, s, a, b, h);
      if (!isSolid(x)) continue;
      return hard(x) ? null : b;
    }
    return null;
  };
  return {
    name: 'dig face',
    build(v, s, rng) {
      const L = s.len;
      const seed = rng.int(0, 0x3fffffff);
      for (let a = 1; a < L - 1; a++) {
        for (let h = 0; h < TOP; h++) {
          const edge = Math.min(a - 1, L - 2 - a, TOP - 1 - h);
          let f = Math.round(-2.2 + noise2(seed, a * 0.45, h * 0.35) * 3.6);
          if (edge < 1) f = Math.max(f, -1);
          f = Math.max(-2, Math.min(1, f));
          const rock = get(v, s, a, -1, h);
          for (let b = f + 1; b < 0; b++) put(v, s, a, b, h, M.AIR);
          for (let b = 0; b <= f; b++) put(v, s, a, b, h, isSolid(rock) ? rock : m.stone2);
        }
      }
      // ore through the face and the rock behind it, for later swings too
      for (let k = 0; k < 6; k++) {
        const ore = k < 4 ? m.ore : m.seam;
        let a = rng.int(1, L - 2);
        let h = rng.int(0, TOP - 1);
        let b = rng.int(back(s), 0);
        for (let i = rng.int(6, 12); i > 0; i--) {
          const x = get(v, s, a, b, h);
          if (isSolid(x) && !hard(x)) put(v, s, a, b, h, ore);
          const r = rng.next();
          if (r < 0.45) a = Math.max(1, Math.min(L - 2, a + (rng.chance(0.5) ? 1 : -1)));
          else if (r < 0.75) h = Math.max(0, Math.min(TOP - 1, h + (rng.chance(0.5) ? 1 : -1)));
          else b = Math.max(back(s), Math.min(1, b + (rng.chance(0.5) ? 1 : -1)));
        }
      }
      // timber frame: two posts and a cap
      for (const a of [0, L - 1]) fill(v, s, a, 0, 0, a + 1, 2, TOP + 2, m.frame, 3);
      fill(v, s, 0, 0, TOP + 2, L, 2, TOP + 3, m.frame, 5);
      // rubble at its foot
      for (let a = 2; a < L - 2; a++) {
        for (let b = 0; b < s.dep - 1; b++) if (get(v, s, a, b, 0) === M.AIR && rng.chance(0.3)) put(v, s, a, b, 0, m.rubble);
      }
    },
    tick(c, s, active) {
      const [ox, oy] = outward(s);
      if (!active) {
        // now and then exposed ore catches the light
        if (!c.rng.chance(c.dt * 0.8)) return;
        const a = c.rng.int(1, s.len - 2);
        const h = c.rng.int(0, TOP - 1);
        const b = faceAt(c.v, s, a, h);
        if (b !== null && get(c.v, s, a, b, h) === m.ore) {
          c.spawn({ kind: 'glint', x: wx(s, a + 0.5, b + 1), y: wy(s, a + 0.5, b + 1), z: s.z0 + h + 0.5, vx: 0, vy: 0, vz: 0.3, life: 0.5, color: GOLD_GLINT, glow: true, gravity: 0 });
        }
        return;
      }
      if (!beat(c, SWING)) return;
      let n = c.rng.int(1, 3);
      for (let tries = 0; n > 0 && tries < 16; tries++) {
        const a = c.rng.int(1, s.len - 2);
        const h = c.rng.int(0, TOP - 2);
        const b = faceAt(c.v, s, a, h);
        if (b === null) continue;
        const was = get(c.v, s, a, b, h);
        put(c.v, s, a, b, h, M.AIR);
        n--;
        const x = wx(s, a + 0.5, b + 0.5);
        const y = wy(s, a + 0.5, b + 0.5);
        const z = s.z0 + h + 0.5;
        const sp = c.rng.range(1, 3);
        c.spawn({ kind: 'debris', x: x + ox * 0.6, y: y + oy * 0.6, z, vx: ox * sp + c.rng.range(-1, 1), vy: oy * sp + c.rng.range(-1, 1), vz: c.rng.range(1, 3), life: 3, color: tone(m.rubble, c.rng.int(2, 6)), glow: false, gravity: 30, mat: m.rubble });
        if (was === m.ore) c.spawn({ kind: 'glint', x: x + ox, y: y + oy, z, vx: ox, vy: oy, vz: 1, life: 0.6, color: GOLD_GLINT, glow: true, gravity: 0 });
      }
    },
  };
}

// run: a pot of brew on three legs over a stone-ringed fire pit. Running it
// keeps the fire going under the pot; the brew bubbles and steams.
export function cauldron(m: PropMats): Prop {
  // Outer radius of the pot at each height (h = 2 is its bottom, 8 the lip).
  const POT: ReadonlyArray<readonly [number, number]> = [[2, 2.2], [3, 3.4], [4, 4.2], [5, 4.4], [6, 4.2], [7, 3.5], [8, 3.9]];
  const SHELL = 1.5; // thick enough that no brew voxel touches the outside
  const BREW = 6; // the brew's top layer
  const HEARTH: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  const centre = (s: Slot) => [Math.floor(s.len / 2), Math.floor(s.dep / 2)] as const;
  return {
    name: 'cauldron',
    build(v, s, rng) {
      const [ca, cb] = centre(s);
      for (let a = 0; a < s.len; a++) {
        for (let b = 0; b < s.dep; b++) {
          const d = Math.hypot(a - ca, b - cb);
          if (d <= 3.3) {
            put(v, s, a, b, 0, m.stone2, 1 + ((a + b) & 1));
          } else if (d <= 5 && rng.chance(0.8)) {
            put(v, s, a, b, 0, m.stone, rng.int(2, 6));
            if (d > 4.2 && rng.chance(0.3)) put(v, s, a, b, 1, m.stone, rng.int(3, 7));
          }
          for (const [h, r] of POT) {
            if (d >= r) continue;
            if (h === 2 || d >= r - SHELL) put(v, s, a, b, h, m.metal, h === 8 ? 6 : h === 2 ? 1 : 2 + (h & 1));
            else if (h <= BREW) put(v, s, a, b, h, m.liquid);
          }
        }
      }
      for (const [da, db] of [[2, 1], [-2, 1], [0, -2]]) {
        put(v, s, ca + da, cb + db, 1, m.metal, 2); // legs, up to the belly
        put(v, s, ca + da, cb + db, 2, m.metal, 3);
      }
    },
    tick(c, s, active) {
      const [ca, cb] = centre(s);
      const v = c.v;
      const cx = wx(s, ca, cb) + 0.5;
      const cy = wy(s, ca, cb) + 0.5;
      if (active) {
        let lit = 0;
        for (const [da, db] of HEARTH) {
          const i = v.idx(wx(s, ca + da, cb + db), wy(s, ca + da, cb + db), s.z0 + 1);
          if (v.mat[i] === M.FIRE) lit++;
        }
        const want = 2 + (Math.floor(c.t * 1.7) % 3);
        for (let k = 0; k < 8 && lit < want; k++) {
          const [da, db] = c.rng.pick(HEARTH);
          const x = wx(s, ca + da, cb + db);
          const y = wy(s, ca + da, cb + db);
          if (v.get(x, y, s.z0 + 1) !== M.AIR) continue;
          v.put(x, y, s.z0 + 1, M.FIRE, c.rng.int(0, 4), HEARTH_LIFE);
          lit++;
        }
        for (const [da, db] of HEARTH) keepFireIfLit(c, wx(s, ca + da, cb + db), wy(s, ca + da, cb + db), s.z0 + 1, HEARTH_LIFE);
        c.light({ x: cx, y: cy, z: s.z0 + 1.5, color: FLAME, radius: 20, intensity: 0.8 * flicker(c.t, 3) });
        c.light({ x: cx, y: cy, z: s.z0 + 7.5, color: tone(m.liquid, 7), radius: 12, intensity: 0.45 });
        if (c.rng.chance(c.dt * 5)) {
          const a = ca + c.rng.int(-2, 2);
          const b = cb + c.rng.int(-2, 2);
          puff(c, wx(s, a, b), wy(s, a, b), s.z0 + 9, M.SMOKE, 60);
        }
      }
      // the brew bubbles, faster over a fire
      if (!c.rng.chance(c.dt * (active ? 8 : 1.5))) return;
      const a = ca + c.rng.int(-1, 1);
      const b = cb + c.rng.int(-1, 1);
      const x = wx(s, a, b);
      const y = wy(s, a, b);
      const z = s.z0 + BREW;
      if (v.get(x, y, z) !== m.liquid) return;
      v.put(x, y, z, m.liquid, c.rng.int(6, 7));
      if (c.rng.chance(0.5)) {
        c.spawn({ kind: 'drop', x: x + 0.5, y: y + 0.5, z: z + 1.2, vx: c.rng.range(-0.6, 0.6), vy: c.rng.range(-0.6, 0.6), vz: c.rng.range(2, 4), life: 0.5, color: tone(m.liquid, 7), glow: material(m.liquid).glow !== undefined, gravity: 20 });
      }
    },
  };
}

// Tops up a flame that is already burning at (x, y, z) (never lights one).
function keepFireIfLit(c: Ctx, x: number, y: number, z: number, life: number): void {
  if (c.v.get(x, y, z) === M.FIRE) keepFire(c, x, y, z, life);
}

// web: a crystal orb on a stone pedestal, held in metal claws. It pulses
// softly; in use it brightens and throws off sparkles.
export function orb(m: PropMats): Prop {
  const BALL = 12; // the ball's centre height
  const R = 2.3;
  const centre = (s: Slot) => [Math.floor(s.len / 2), Math.floor(s.dep / 2)] as const;
  return {
    name: 'orb',
    build(v, s) {
      const [ca, cb] = centre(s);
      const square = (r: number, h: number, mat: number, shade?: number) => fill(v, s, ca - r, cb - r, h, ca + r + 1, cb + r + 1, h + 1, mat, shade);
      square(3, 0, m.stone2, 2);
      for (const [da, db] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) put(v, s, ca + da, cb + db, 0, M.AIR);
      square(2, 1, m.stone, 3);
      for (let h = 2; h < 9; h++) square(1, h, h === 5 ? m.trim : m.stone, h === 5 ? 5 : 4);
      square(2, 9, m.stone, 6);
      for (const [da, db] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) {
        put(v, s, ca + da, cb + db, 10, m.metal, 3);
        put(v, s, ca + da, cb + db, 11, m.metal, 5);
      }
      for (let dh = -3; dh <= 3; dh++) {
        for (let db = -3; db <= 3; db++) {
          for (let da = -3; da <= 3; da++) {
            if (da * da + db * db + dh * dh <= R * R) put(v, s, ca + da, cb + db, BALL + dh, m.glow, Math.min(7, 4 + dh));
          }
        }
      }
    },
    tick(c, s, active) {
      const [ca, cb] = centre(s);
      const x = wx(s, ca, cb) + 0.5;
      const y = wy(s, ca, cb) + 0.5;
      const z = s.z0 + BALL + 0.5;
      const pulse = 0.5 + 0.5 * Math.sin(c.t * (active ? 3.2 : 1.4));
      const color = tone(m.glow, 7);
      c.light({ x, y, z, color, radius: active ? 24 + 4 * pulse : 14 + 2 * pulse, intensity: active ? 0.7 + 0.3 * pulse : 0.3 + 0.12 * pulse });
      if (!active) return;
      if (c.rng.chance(c.dt * 10)) {
        const th = c.rng.range(0, Math.PI * 2);
        const ph = c.rng.range(-1, 1);
        const k = Math.sqrt(1 - ph * ph);
        const dx = Math.cos(th) * k;
        const dy = Math.sin(th) * k;
        c.spawn({ kind: 'glint', x: x + dx * 3, y: y + dy * 3, z: z + ph * 3, vx: dx * 1.2, vy: dy * 1.2, vz: ph * 1.2 + 0.4, life: c.rng.range(0.6, 1.1), color: mix(color, [255, 255, 255], 0.5), glow: true, gravity: -0.3 });
      }
      if (c.rng.chance(c.dt * 4)) {
        // shimmer: a ball voxel changes its shade
        const da = c.rng.int(-1, 1);
        const db = c.rng.int(-1, 1);
        const dh = c.rng.int(-2, 2);
        if (get(c.v, s, ca + da, cb + db, BALL + dh) === m.glow) put(c.v, s, ca + da, cb + db, BALL + dh, m.glow, c.rng.int(3, 7));
      }
    },
  };
}

// think: a stone altar with an inlaid band, a runner, a skull and candles
// that never go out. Thinking sends up smoke and pale wisps.
export function altar(m: PropMats): Prop {
  // Candles: a, b, height in wax.
  const candles = (len: number): ReadonlyArray<readonly [number, number, number]> => [[1, 1, 3], [3, 2, 2], [len - 4, 2, 2], [len - 2, 1, 3]];
  const SLAB = 4; // the altar top
  return {
    name: 'altar',
    build(v, s) {
      const L = s.len;
      const mid = Math.floor(L / 2);
      fill(v, s, 0, 0, 0, L, 6, 1, m.stone2, 2); // plinth
      fill(v, s, 1, 0, 1, L - 1, 5, SLAB, m.stone); // body
      fill(v, s, 2, 4, 2, L - 2, 5, 3, m.trim, 5); // inlaid band
      fill(v, s, 0, 0, SLAB, L, 6, SLAB + 1, m.stone, 6); // top slab
      fill(v, s, mid - 1, 5, 1, mid + 1, 6, SLAB, m.cloth, 2); // runner
      fill(v, s, mid - 1, 1, SLAB + 1, mid + 1, 3, SLAB + 3, m.bone, 6); // skull
      fill(v, s, mid - 1, 2, SLAB + 2, mid + 1, 3, SLAB + 3, m.stone2, 0); // eye sockets
      for (const [a, b, n] of candles(L)) {
        for (let h = SLAB + 1; h <= SLAB + n; h++) put(v, s, a, b, h, m.candle, h === SLAB + n ? 6 : 4);
        put(v, s, a, b, SLAB + n + 1, M.FIRE, 1, CANDLE_LIFE);
      }
    },
    tick(c, s, active) {
      for (const [a, b, n] of candles(s.len)) {
        const x = wx(s, a, b);
        const y = wy(s, a, b);
        const z = s.z0 + SLAB + n + 1;
        if (c.v.get(x, y, z - 1) === m.candle) keepFire(c, x, y, z, CANDLE_LIFE);
        if (active && c.rng.chance(c.dt * 1.5)) puff(c, x, y, z + 2, M.SMOKE, 40);
      }
      const mid = s.len / 2;
      const x = wx(s, mid, 2);
      const y = wy(s, mid, 2);
      c.light({ x, y, z: s.z0 + 8, color: CANDLELIGHT, radius: active ? 20 : 16, intensity: (active ? 0.75 : 0.55) * flicker(c.t, 5) });
      if (active && c.rng.chance(c.dt * 3)) {
        c.spawn({ kind: 'ember', x, y, z: s.z0 + SLAB + 3, vx: c.rng.range(-0.4, 0.4), vy: c.rng.range(-0.4, 0.4), vz: c.rng.range(0.8, 1.6), life: c.rng.range(1, 1.8), color: WISP, glow: true, gravity: -0.4 });
      }
    },
  };
}

// idle: a bedroll along the wall, a log to sit on and a stone-ringed
// campfire, kept three voxels clear of anything that burns. It always burns.
export function campfire(m: PropMats): Prop {
  const FLAMES: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const fireAt = (s: Slot) => [s.len - 3, Math.floor(s.dep / 2) + 2] as const;
  return {
    name: 'campfire',
    build(v, s, rng) {
      const [fa, fb] = fireAt(s);
      fill(v, s, 1, 1, 0, 9, 5, 1, m.cloth, 3); // bedroll
      fill(v, s, 1, 1, 1, 3, 5, 2, m.cloth, 7); // pillow
      fill(v, s, 6, 1, 1, 9, 5, 2, m.cloth, 1); // folded blanket
      fill(v, s, 3, s.dep - 3, 0, 7, s.dep - 1, 2, m.frame, 3); // log seat
      for (let a = fa - 3; a <= fa + 3; a++) {
        for (let b = fb - 3; b <= fb + 3; b++) {
          const d = Math.hypot(a - fa, b - fb);
          if (d <= 1.5) {
            put(v, s, a, b, 0, m.fuel);
          } else if (d <= 2.6) {
            put(v, s, a, b, 0, m.stone, rng.int(1, 6));
            if (rng.chance(0.35)) put(v, s, a, b, 1, m.stone, rng.int(3, 7));
          }
        }
      }
      for (const [da, db] of FLAMES) put(v, s, fa + da, fb + db, 1, M.FIRE, 2, CAMPFIRE_LIFE);
    },
    tick(c, s, active) {
      const [fa, fb] = fireAt(s);
      for (const [da, db] of FLAMES) keepFire(c, wx(s, fa + da, fb + db), wy(s, fa + da, fb + db), s.z0 + 1, CAMPFIRE_LIFE);
      const x = wx(s, fa, fb);
      const y = wy(s, fa, fb);
      if (c.rng.chance(c.dt * 3)) keepFire(c, x, y, s.z0 + 2, CAMPFIRE_LIFE);
      c.light({ x: x + 0.5, y: y + 0.5, z: s.z0 + 2.5, color: FLAME, radius: active ? 28 : 26, intensity: (active ? 1 : 0.9) * flicker(c.t, 11) });
      if (c.rng.chance(c.dt * 2.5)) {
        c.spawn({ kind: 'ember', x: x + c.rng.range(0, 1), y: y + c.rng.range(0, 1), z: s.z0 + 2.5, vx: c.rng.range(-0.6, 0.6), vy: c.rng.range(-0.6, 0.6), vz: c.rng.range(1.5, 3), life: c.rng.range(0.8, 1.8), color: HOT_IRON, glow: true, gravity: -0.5 });
      }
      if (c.rng.chance(c.dt * 0.8)) puff(c, x, y, s.z0 + 5, M.SMOKE, 60);
    },
  };
}

// entrance: a tunnel mouth cut into the wall slab, with rails running out
// of the dark over timber sleepers, a timber frame and a torch beside it.
export function entrance(m: PropMats): Prop {
  const OPEN = 10; // opening width
  const TALL = 18; // opening height
  const TORCH = 12; // the torch cup's height
  const torchAt = (s: Slot) => [wx(s, s.len - 1, 0), wy(s, s.len - 1, 0), s.z0 + TORCH] as const;
  return {
    name: 'tunnel',
    build(v, s) {
      const deep = -(wallOf(s) - 1); // the slab's last voxel stays as the tunnel's back
      const a0 = 1;
      const a1 = a0 + OPEN;
      for (let h = 0; h < TALL; h++) {
        const inset = h >= TALL - 1 ? 2 : h >= TALL - 2 ? 1 : 0; // arched top
        for (let a = a0 + inset; a < a1 - inset; a++) {
          for (let b = deep; b < 0; b++) put(v, s, a, b, h, M.AIR);
        }
      }
      for (let b = deep; b < s.dep - 1; b++) {
        if ((b & 1) === 0) fill(v, s, a0 + 1, b, -1, a1 - 1, b + 1, 0, m.frame, 2); // sleepers
        put(v, s, a0 + 2, b, 0, m.metal, 5);
        put(v, s, a1 - 3, b, 0, m.metal, 5);
      }
      for (const a of [a0 - 1, a1]) fill(v, s, a, -1, 0, a + 1, 1, TALL, m.frame, 3);
      fill(v, s, a0 - 1, -1, TALL, a1 + 1, 1, TALL + 2, m.frame, 5); // lintel
      for (const a of [a0, a1 - 1]) put(v, s, a, -1, TALL - 1, m.frame, 4); // knee braces
      if (deep <= -4) {
        // a second frame further in, for depth
        for (const a of [a0, a1 - 1]) fill(v, s, a, -3, 0, a + 1, -2, TALL - 2, m.frame, 1);
        fill(v, s, a0, -3, TALL - 2, a1, -2, TALL - 1, m.frame, 2);
      }
      // nothing that burns in the wall behind the torch's flame
      for (let h = TORCH; h <= TORCH + TORCH_LIFE; h++) {
        for (let a = s.len - 2; a <= s.len; a++) if (isFlammable(get(v, s, a, -1, h))) put(v, s, a, -1, h, m.stone2);
      }
      const [x, y, z] = torchAt(s);
      buildTorch(v, x, y, z, m);
    },
    tick(c, s) {
      const [x, y, z] = torchAt(s);
      tendTorch(c, x, y, z, m);
    },
  };
}

// Every prop, built from one material palette.
export function makeProps(m: PropMats): Record<SlotKind, Prop> {
  return {
    write: anvil(m),
    read: bookshelf(m),
    search: digFace(m),
    run: cauldron(m),
    web: orb(m),
    think: altar(m),
    idle: campfire(m),
    entrance: entrance(m),
  };
}
