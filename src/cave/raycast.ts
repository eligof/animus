import { KIND } from './materials.ts';
import type { Tables } from './materials.ts';
import type { View } from './types.ts';
import type { Voxels } from './voxels.ts';

// Light per face, x/256, indexed by the axis the face looks along. The
// light comes from the upper left: tops brightest, +y faces (a block's
// left-hand side on screen) mid, +x faces (its right-hand side) darkest.
// Loose stuff (powders, liquids, gases, fire) is shaded softly so a sand
// pile reads as grain rather than as a checkerboard of steps.
const FACE = [150, 200, 256];
const SOFT = [204, 228, 256];
// A rock top whose front edge drops away catches a rim of light. A face
// loses AO for every solid voxel hemming in the cell in front of it, which
// draws the dark contact line where a floor meets a wall.
const RIM = 36;
const AO = 26;
const SOFT_AO = 14;
// Translucent voxels stop being added once this little light gets through.
const CUTOFF = 0.04;

// The six orders in which a ray meets x, y and z boundaries within each
// unit of travel; POS is where each axis comes in that order.
const PERM = Int8Array.of(0, 1, 2, 0, 2, 1, 1, 0, 2, 1, 2, 0, 2, 0, 1, 2, 1, 0);
const POS = new Int8Array(18);
for (let q = 0; q < 6; q++) for (let k = 0; k < 3; k++) POS[q * 3 + PERM[q * 3 + k]] = k;

// Offsets from a hit voxel to the voxels its shading reads: the cells in
// front of its top edges (rim) and the cells around the one in front of
// each face (AO).
const DEPS = [
  [1, 0, 0], [0, 1, 0],
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, 0], [1, -1, 0], [1, 0, -1],
  [-1, 1, 0], [0, 1, -1],
];

const clamp = (v: number) => (v >= 255 ? 255 : v <= 0 ? 0 : (v + 0.5) | 0);

// Ray caster for the 2:1 isometric view (see types.ts): one ray per pixel
// along (1, 1, 1) toward the viewer, marched away from it through the grid.
// The pixel centre fixes a = x - y and c = x - z along the ray, so the ray
// is (t, t - a, t - c) and it crosses an x, y or z boundary at integer t,
// integer t - a and integer t - c: within every unit of t the three
// crossings come in the same order, worked out once per pixel. Ties (a
// ray through an edge) are broken as if the ray were nudged an
// infinitesimal amount, z before y before x, so the walk stays
// face-connected and solid surfaces never show cracks.
//
// Per pixel it writes the albedo (shaded voxel colour, translucent voxels
// composited front to back), the emitted light and the depth x + y + z of
// the hit point. `update` re-casts only pixels whose ray or shading can
// involve a changed voxel and gives exactly what `renderAll` would.
//
// Material `alpha` is the opacity of one voxel of thickness; a ray crosses
// three voxels per unit it sinks, so each crossing takes the cube root.
//
// The canvas size and view are fixed: make a new Caster when they change,
// and call `renderAll` after changing the tables or `backdrop`.
export class Caster {
  readonly w: number;
  readonly h: number;
  readonly albedo: Int32Array; // packed RGB; -1 = backdrop
  readonly emit: Int32Array; // packed RGB; 0 = none
  readonly depth: Float32Array; // x + y + z of the hit; -Infinity = none
  readonly hit: Int32Array; // voxel index of the opaque hit; -1 = none
  // Packed RGB that translucent voxels in front of the void are laid over.
  backdrop = 0;

  private readonly v: Voxels;
  private readonly T: Tables;
  private readonly ox: number;
  private readonly oy: number;
  private readonly stride: Int32Array;
  // Per pixel ray: first voxel inside the grid (-1 if the ray misses it),
  // its coordinates, the crossing order and entry face (order * 4 + face),
  // and how many crossings it makes before leaving the grid.
  private readonly start: Int32Array;
  private readonly x0: Int16Array;
  private readonly y0: Int16Array;
  private readonly z0: Int16Array;
  private readonly ord: Uint8Array;
  private readonly steps: Int32Array;
  // Crossings before the first non-air voxel: a re-cast resumes there.
  private readonly first: Int32Array;
  private readonly resume: Int32Array;
  private readonly dirty: Uint8Array;
  private readonly queue: Int32Array;
  // Per parity of x + y: pixel offsets a voxel covers ([dx, dy] pairs), and
  // the pixels its shading neighbours cover ([dx, dy, nx, ny, nz] rows).
  private readonly foot: Int8Array[] = [];
  private readonly deps: Int8Array[] = [];
  private readonly opaque = new Uint8Array(256);
  private readonly opacity = new Float32Array(256);
  private readonly soft = new Uint8Array(256);

  constructor(v: Voxels, T: Tables, w: number, h: number, view: View) {
    this.v = v;
    this.T = T;
    this.w = Math.max(0, w | 0);
    this.h = Math.max(0, h | 0);
    // Snapped to 1/256 px so every boundary test below is exact.
    this.ox = Math.round(view.ox * 256) / 256;
    this.oy = Math.round(view.oy * 256) / 256;
    this.stride = Int32Array.of(1, v.W, v.W * v.D);
    const n = this.w * this.h;
    this.albedo = new Int32Array(n).fill(-1);
    this.emit = new Int32Array(n);
    this.depth = new Float32Array(n).fill(-Infinity);
    this.hit = new Int32Array(n).fill(-1);
    this.start = new Int32Array(n);
    this.x0 = new Int16Array(n);
    this.y0 = new Int16Array(n);
    this.z0 = new Int16Array(n);
    this.ord = new Uint8Array(n);
    this.steps = new Int32Array(n);
    this.first = new Int32Array(n);
    this.resume = new Int32Array(n).fill(0x7fffffff);
    this.dirty = new Uint8Array(n);
    this.queue = new Int32Array(n);
    this.setupRays();
    this.setupFootprints();
    this.readTables();
  }

  // Casts every pixel.
  renderAll(): void {
    this.readTables();
    for (let p = 0, n = this.w * this.h; p < n; p++) this.cast(p, 0);
  }

  // Re-casts the pixels that can see a changed voxel or whose shading reads
  // one (pass `v.takeChanges()`).
  update(changes: Int32Array): void {
    const { W, D, H } = this.v;
    const WD = W * D;
    const { w, h, hit, first, resume, dirty, queue } = this;
    const fox = Math.floor(this.ox);
    const foy = Math.floor(this.oy);
    const x0 = this.x0;
    const y0 = this.y0;
    const z0 = this.z0;
    let queued = 0;
    for (let q = 0; q < changes.length; q++) {
      const vi = changes[q];
      const X = vi % W;
      const r = (vi - X) / W;
      const Y = r % D;
      const Z = (r - Y) / D;
      const par = (X + Y) & 1;
      const ax = fox + X - Y;
      const ay = foy + ((X + Y - par) >> 1) - Z;
      const sum = X + Y + Z;
      // Pixels whose ray may pass through the voxel: resume them no later
      // than where they reach it (each crossing lowers x + y + z by one).
      const f = this.foot[par];
      for (let k = 0; k < f.length; k += 2) {
        const px = ax + f[k];
        const py = ay + f[k + 1];
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const p = py * w + px;
        const at = x0[p] + y0[p] + z0[p] - sum;
        if (!dirty[p]) {
          dirty[p] = 1;
          queue[queued++] = p;
          resume[p] = at;
        } else if (at < resume[p]) resume[p] = at;
      }
      // Pixels showing a neighbour whose shading reads this voxel.
      const d = this.deps[par];
      for (let k = 0; k < d.length; k += 5) {
        const nx = X - d[k + 2];
        const ny = Y - d[k + 3];
        const nz = Z - d[k + 4];
        if (nx < 0 || ny < 0 || nz < 0 || nx >= W || ny >= D || nz >= H) continue;
        const px = ax + d[k];
        const py = ay + d[k + 1];
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const p = py * w + px;
        if (dirty[p] || hit[p] !== nx + W * ny + WD * nz) continue;
        dirty[p] = 1;
        queue[queued++] = p;
      }
    }
    for (let k = 0; k < queued; k++) {
      const p = queue[k];
      const s = resume[p] < first[p] ? resume[p] : first[p];
      this.cast(p, s > 0 ? s : 0);
      dirty[p] = 0;
      resume[p] = 0x7fffffff;
    }
  }

  private readTables(): void {
    const { alpha: a, kind } = this.T;
    for (let m = 0; m < 256; m++) {
      this.opaque[m] = a[m] >= 1 ? 1 : 0;
      this.soft[m] = kind[m] >= KIND.powder ? 1 : 0;
      this.opacity[m] = a[m] >= 1 ? 1 : a[m] <= 0 ? 0 : 1 - Math.cbrt(1 - a[m]);
    }
  }

  // Where each pixel's ray enters the grid and in which order it crosses
  // boundaries. The ray is nudged to (t, t - a - e, t - c - 2e) for an
  // infinitesimal e > 0, which settles every tie.
  private setupRays(): void {
    const { W, D, H } = this.v;
    const { w, h, ox, oy } = this;
    const t3 = [0, 0, 0];
    const co = [0, 0, 0];
    for (let py = 0, p = 0; py < h; py++) {
      const b = 2 * (py + 0.5 - oy);
      for (let px = 0; px < w; px++, p++) {
        const a = px + 0.5 - ox;
        const c = (a + b) / 2;
        // Entry: the largest t inside every upper bound (ties: x, y, z).
        let ent = 0;
        let t = W;
        if (D + a < t) {
          t = D + a;
          ent = 1;
        }
        if (H + c < t) {
          t = H + c;
          ent = 2;
        }
        // The cell just below the entry point. On a boundary, the nudge
        // decides: axis k sits at its value plus (e_ent - e_k) with e = 0, 1, 2.
        const cell = (val: number, k: number) => {
          const f = Math.floor(val);
          return f !== val ? f : ent > k ? val : val - 1;
        };
        co[0] = ent === 0 ? W - 1 : cell(t, 0);
        co[1] = ent === 1 ? D - 1 : cell(t - a, 1);
        co[2] = ent === 2 ? H - 1 : cell(t - c, 2);
        if (co[0] < 0 || co[1] < 0 || co[2] < 0) {
          this.start[p] = -1;
          continue;
        }
        // Next crossing per axis, latest first (ties: z, y, x).
        t3[0] = co[0];
        t3[1] = co[1] + a;
        t3[2] = co[2] + c;
        const later = (i: number, j: number) => t3[i] > t3[j] || (t3[i] === t3[j] && i > j);
        let A = 0;
        let B = 1;
        let C = 2;
        if (later(B, A)) [A, B] = [B, A];
        if (later(C, B)) [B, C] = [C, B];
        if (later(B, A)) [A, B] = [B, A];
        let q = 0;
        while (PERM[q * 3] !== A || PERM[q * 3 + 1] !== B) q++;
        // Axis k at position j of the order makes its (n+1)th crossing, the
        // one that leaves the grid, at crossing 3n + j + 1.
        this.steps[p] = Math.min(3 * co[A], 3 * co[B] + 1, 3 * co[C] + 2);
        this.start[p] = co[0] + W * (co[1] + D * co[2]);
        this.x0[p] = co[0];
        this.y0[p] = co[1];
        this.z0[p] = co[2];
        this.ord[p] = q * 4 + ent;
      }
    }
  }

  // A voxel's cube covers the pixels whose centre lies in its projected
  // hexagon, given relative to the voxel's anchor pixel
  // (floor(ox) + x - y, floor(oy) + floor((x + y) / 2) - z); the shape
  // depends only on the parity of x + y.
  private setupFootprints(): void {
    const fx = this.ox - Math.floor(this.ox);
    const eps = 1e-9;
    for (let par = 0; par < 2; par++) {
      const fy = this.oy - Math.floor(this.oy) + par / 2;
      const f: number[] = [];
      for (let j = -3; j <= 3; j++) {
        for (let i = -2; i <= 2; i++) {
          // Pixel centre relative to the projected corner (x, y, z).
          const u = i + 0.5 - fx;
          const s = j + 0.5 - fy;
          if (Math.abs(u) <= 1 + eps && Math.abs(u + 2 * s) <= 2 + eps && Math.abs(u - 2 * s) <= 2 + eps) f.push(i, j);
        }
      }
      this.foot.push(Int8Array.from(f));
    }
    for (let par = 0; par < 2; par++) {
      const d: number[] = [];
      for (const [dx, dy, dz] of DEPS) {
        // The neighbour (x - dx, y - dy, z - dz) and its anchor offset.
        const npar = (par - dx - dy) & 1;
        const oi = dy - dx;
        const oj = (-(dx + dy) - npar + par) / 2 + dz;
        const f = this.foot[npar];
        for (let k = 0; k < f.length; k += 2) d.push(oi + f[k], oj + f[k + 1], dx, dy, dz);
      }
      this.deps.push(Int8Array.from(d));
    }
  }

  // Casts pixel p, skipping its first `from` crossings (all known air).
  private cast(p: number, from: number): void {
    const i0 = this.start[p];
    if (i0 < 0) {
      this.albedo[p] = -1;
      this.emit[p] = 0;
      this.depth[p] = -Infinity;
      this.hit[p] = -1;
      this.first[p] = 0;
      return;
    }
    const { mat, shade } = this.v;
    const { color, glow } = this.T;
    const { opaque, opacity, stride } = this;
    const o = this.ord[p];
    const q = (o >> 2) * 3;
    const A0 = PERM[q];
    const A1 = PERM[q + 1];
    const A2 = PERM[q + 2];
    const d0 = stride[A0];
    const d1 = stride[A1];
    const d2 = stride[A2];
    const n = this.steps[p];
    let k = from;
    let i = i0 - (((k + 2) / 3) | 0) * d0 - (((k + 1) / 3) | 0) * d1 - ((k / 3) | 0) * d2;
    let ph = k % 3;
    let m = mat[i];
    let first = -1;
    let prev = 0;
    let tr = 1;
    let r = 0;
    let g = 0;
    let b = 0;
    let er = 0;
    let eg = 0;
    let eb = 0;
    let depth = -Infinity;
    let hit = -1;
    march: for (;;) {
      if (m === 0) {
        prev = 0;
        for (;;) {
          if (ph === 0) {
            if (k === n) break march;
            i -= d0;
            k++;
            ph = 1;
            if ((m = mat[i]) !== 0) break;
          }
          if (ph === 1) {
            if (k === n) break march;
            i -= d1;
            k++;
            ph = 2;
            if ((m = mat[i]) !== 0) break;
          }
          if (k === n) break march;
          i -= d2;
          k++;
          ph = 0;
          if ((m = mat[i]) !== 0) break;
        }
      }
      if (first < 0) first = k;
      // The face the ray came in through: the axis of the last crossing.
      const face = k === 0 ? o & 3 : ph === 1 ? A0 : ph === 2 ? A1 : A2;
      const sv = (m << 3) | (shade[i] & 7);
      const col = color[sv];
      const gl = glow[sv];
      if (opaque[m] || depth === -Infinity) {
        const X = this.x0[p] - (((k - POS[q + 0] + 2) / 3) | 0);
        const Y = this.y0[p] - (((k - POS[q + 1] + 2) / 3) | 0);
        const Z = this.z0[p] - (((k - POS[q + 2] + 2) / 3) | 0);
        const px = p % this.w;
        const a = px + 0.5 - this.ox;
        const c = (a + 2 * ((p - px) / this.w + 0.5 - this.oy)) / 2;
        const t = face === 0 ? X + 1 : face === 1 ? Y + 1 + a : Z + 1 + c;
        depth = 3 * t - a - c;
        if (opaque[m]) {
          hit = i;
          const f = this.light(i, m, X, Y, Z, face);
          r += tr * clamp((((col >> 16) & 255) * f) / 256);
          g += tr * clamp((((col >> 8) & 255) * f) / 256);
          b += tr * clamp(((col & 255) * f) / 256);
          if (gl !== 0) {
            er += tr * ((gl >> 16) & 255);
            eg += tr * ((gl >> 8) & 255);
            eb += tr * (gl & 255);
          }
          tr = 0;
          break;
        }
      }
      // Translucent: surfaces take the face light, the inside of a body
      // its plain colour.
      const wt = tr * opacity[m];
      const f = prev === m ? 1 : SOFT[face] / 256;
      r += wt * f * ((col >> 16) & 255);
      g += wt * f * ((col >> 8) & 255);
      b += wt * f * (col & 255);
      if (gl !== 0) {
        er += wt * ((gl >> 16) & 255);
        eg += wt * ((gl >> 8) & 255);
        eb += wt * (gl & 255);
      }
      tr -= wt;
      prev = m;
      if (tr < CUTOFF) break;
      if (k === n) break;
      if (ph === 0) {
        i -= d0;
        ph = 1;
      } else if (ph === 1) {
        i -= d1;
        ph = 2;
      } else {
        i -= d2;
        ph = 0;
      }
      k++;
      m = mat[i];
    }
    this.first[p] = first < 0 ? n : first;
    this.hit[p] = hit;
    this.depth[p] = depth;
    if (first < 0) this.albedo[p] = -1;
    else {
      if (hit < 0) {
        if (tr < CUTOFF) {
          // Nearly opaque: let what got through stand for the rest.
          const s = 1 / (1 - tr);
          r *= s;
          g *= s;
          b *= s;
        } else {
          const bg = this.backdrop;
          r += tr * ((bg >> 16) & 255);
          g += tr * ((bg >> 8) & 255);
          b += tr * (bg & 255);
        }
      }
      this.albedo[p] = (clamp(r) << 16) | (clamp(g) << 8) | clamp(b);
    }
    this.emit[p] = er + eg + eb > 0 ? (clamp(er) << 16) | (clamp(eg) << 8) | clamp(eb) : 0;
  }

  // Light (x/256) on a face of opaque voxel i (material m) at (X, Y, Z):
  // the face's light, a rim where a top's front edge drops away, less AO
  // for solid voxels around the cell in front of the face.
  private light(i: number, m: number, X: number, Y: number, Z: number, face: number): number {
    const { W, D, H } = this.v;
    const WD = W * D;
    const mat = this.v.mat;
    const solid = this.opaque;
    const soft = this.soft[m];
    let f = soft ? SOFT[face] : FACE[face];
    let ao = 0;
    if (face === 2) {
      if (!soft && (X + 1 >= W || !solid[mat[i + 1]] || Y + 1 >= D || !solid[mat[i + W]])) f += RIM;
      if (Z + 1 < H) {
        const c = i + WD;
        if (X > 0 && solid[mat[c - 1]]) ao++;
        if (X + 1 < W && solid[mat[c + 1]]) ao++;
        if (Y > 0 && solid[mat[c - W]]) ao++;
        if (Y + 1 < D && solid[mat[c + W]]) ao++;
      }
    } else if (face === 0) {
      if (X + 1 < W) {
        const c = i + 1;
        if (Y > 0 && solid[mat[c - W]]) ao++;
        if (Y + 1 < D && solid[mat[c + W]]) ao++;
        if (Z > 0 && solid[mat[c - WD]]) ao++;
        if (Z + 1 < H && solid[mat[c + WD]]) ao++;
      }
    } else if (Y + 1 < D) {
      const c = i + W;
      if (X > 0 && solid[mat[c - 1]]) ao++;
      if (X + 1 < W && solid[mat[c + 1]]) ao++;
      if (Z > 0 && solid[mat[c - WD]]) ao++;
      if (Z + 1 < H && solid[mat[c + WD]]) ao++;
    }
    return f - ao * (soft ? SOFT_AO : AO);
  }
}
