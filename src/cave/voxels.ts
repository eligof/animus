import { M, MATERIALS } from './materials.ts';

// Materials something can stand on: solids and powders.
const FOOTING = new Uint8Array(256);
for (const m of MATERIALS) if (m && (m.kind === 'solid' || m.kind === 'powder')) FOOTING[m.id] = 1;

// Colour variant 0..7 for voxel i: a well-mixed hash, so neighbours along
// every axis differ (a plain multiplicative hash streaks along layers).
export function grain(i: number): number {
  let h = Math.imul(i ^ (i >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) & 7;
}

// The cave: a W x D x H grid of voxels. x runs along the right-hand back
// wall, y along the left-hand one, z up; voxel (x, y, z) fills the unit
// cube [x, x+1) x [y, y+1) x [z, z+1). Index = x + W * (y + D * z), so a
// horizontal layer is contiguous.
//
// Per voxel: `mat` (material id), `shade` (colour variant & 7 in the low
// bits; moves with the voxel so grains keep their colour), `life` (ticks
// left for gas/fire, free for other use by the simulation), `stamp` (last
// tick the simulation moved it, so nothing moves twice per tick).
//
// Every write through `set`/`swap` is logged for the renderer (which
// re-casts only the pixels that can see a changed voxel) and wakes the
// voxel's 8x8x8 chunk and its neighbours for the simulation.
export class Voxels {
  readonly W: number;
  readonly D: number;
  readonly H: number;
  readonly size: number;
  readonly mat: Uint8Array;
  readonly shade: Uint8Array;
  readonly life: Uint8Array;
  readonly stamp: Uint8Array;
  // The world as generated: what healing slowly restores.
  readonly base: Uint8Array;
  readonly baseShade: Uint8Array;

  static readonly CHUNK = 8;
  readonly cw: number;
  readonly cd: number;
  readonly ch: number;
  // Chunks to simulate this tick / woken for the next one.
  active: Uint8Array;
  next: Uint8Array;

  private log: Int32Array;
  private logged = 0;
  private marked: Uint8Array;

  constructor(W: number, D: number, H: number) {
    this.W = W;
    this.D = D;
    this.H = H;
    this.size = W * D * H;
    this.mat = new Uint8Array(this.size);
    this.shade = new Uint8Array(this.size);
    this.life = new Uint8Array(this.size);
    this.stamp = new Uint8Array(this.size);
    this.base = new Uint8Array(this.size);
    this.baseShade = new Uint8Array(this.size);
    const C = Voxels.CHUNK;
    this.cw = Math.ceil(W / C);
    this.cd = Math.ceil(D / C);
    this.ch = Math.ceil(H / C);
    this.active = new Uint8Array(this.cw * this.cd * this.ch);
    this.next = new Uint8Array(this.cw * this.cd * this.ch);
    this.log = new Int32Array(4096);
    this.marked = new Uint8Array(this.size);
  }

  idx(x: number, y: number, z: number): number {
    return x + this.W * (y + this.D * z);
  }

  inside(x: number, y: number, z: number): boolean {
    return x >= 0 && y >= 0 && z >= 0 && x < this.W && y < this.D && z < this.H;
  }

  // Material at (x, y, z); M.OUT outside the grid.
  get(x: number, y: number, z: number): number {
    return this.inside(x, y, z) ? this.mat[this.idx(x, y, z)] : M.OUT;
  }

  xOf(i: number): number {
    return i % this.W;
  }

  yOf(i: number): number {
    return Math.floor(i / this.W) % this.D;
  }

  zOf(i: number): number {
    return Math.floor(i / (this.W * this.D));
  }

  // Writes voxel i. `shade` defaults to a pseudo-random variant per voxel.
  set(i: number, m: number, shade = grain(i), life = 0): void {
    if (this.mat[i] === m && this.shade[i] === shade && this.life[i] === life) return;
    this.mat[i] = m;
    this.shade[i] = shade;
    this.life[i] = life;
    this.touch(i);
  }

  put(x: number, y: number, z: number, m: number, shade?: number, life?: number): void {
    if (this.inside(x, y, z)) this.set(this.idx(x, y, z), m, shade, life);
  }

  // Swaps two voxels with everything they carry (material, shade, life).
  swap(i: number, j: number): void {
    const m = this.mat[i];
    const s = this.shade[i];
    const l = this.life[i];
    this.mat[i] = this.mat[j];
    this.shade[i] = this.shade[j];
    this.life[i] = this.life[j];
    this.mat[j] = m;
    this.shade[j] = s;
    this.life[j] = l;
    this.touch(i);
    this.touch(j);
  }

  // Logs a change at voxel i (without writing) and wakes its chunk.
  touch(i: number): void {
    if (!this.marked[i]) {
      this.marked[i] = 1;
      if (this.logged === this.log.length) {
        const grown = new Int32Array(this.log.length * 2);
        grown.set(this.log);
        this.log = grown;
      }
      this.log[this.logged++] = i;
    }
    this.wake(i);
  }

  // Wakes the chunk holding voxel i for the next tick, plus the neighbouring
  // chunk across any chunk face voxel i sits on.
  wake(i: number): void {
    const C = Voxels.CHUNK;
    const x = this.xOf(i);
    const y = this.yOf(i);
    const z = this.zOf(i);
    const cx = (x / C) | 0;
    const cy = (y / C) | 0;
    const cz = (z / C) | 0;
    this.wakeChunk(cx, cy, cz);
    const fx = x % C;
    const fy = y % C;
    const fz = z % C;
    if (fx === 0) this.wakeChunk(cx - 1, cy, cz);
    else if (fx === C - 1) this.wakeChunk(cx + 1, cy, cz);
    if (fy === 0) this.wakeChunk(cx, cy - 1, cz);
    else if (fy === C - 1) this.wakeChunk(cx, cy + 1, cz);
    if (fz === 0) this.wakeChunk(cx, cy, cz - 1);
    else if (fz === C - 1) this.wakeChunk(cx, cy, cz + 1);
  }

  private wakeChunk(cx: number, cy: number, cz: number): void {
    if (cx < 0 || cy < 0 || cz < 0 || cx >= this.cw || cy >= this.cd || cz >= this.ch) return;
    this.next[cx + this.cw * (cy + this.cd * cz)] = 1;
  }

  // Starts a simulation tick: chunks woken since the last tick become the
  // active set, and the wake set is cleared for this tick's changes.
  beginTick(): Uint8Array {
    const t = this.active;
    this.active = this.next;
    this.next = t;
    this.next.fill(0);
    return this.active;
  }

  // Changed voxel indices since the last call (deduplicated), for the
  // renderer. The returned view is only valid until the next write.
  takeChanges(): Int32Array {
    const out = this.log.subarray(0, this.logged);
    for (let k = 0; k < this.logged; k++) this.marked[this.log[k]] = 0;
    this.logged = 0;
    return out;
  }

  // Snapshot the current world as the generated base (healing target),
  // drop the change log and wake every chunk once so loose material settles.
  commitBase(): void {
    this.base.set(this.mat);
    this.baseShade.set(this.shade);
    this.takeChanges();
    this.next.fill(1);
  }

  // Top (exclusive z) of the highest solid or powder voxel in column (x, y)
  // at or below `from`: where something standing there rests. 0 if none.
  ground(x: number, y: number, from = this.H - 1): number {
    if (x < 0 || y < 0 || x >= this.W || y >= this.D) return 0;
    for (let z = Math.min(from, this.H - 1); z >= 0; z--) {
      if (FOOTING[this.mat[this.idx(x, y, z)]]) return z + 1;
    }
    return 0;
  }
}
