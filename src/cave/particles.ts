import type { RGB } from '../term/color.ts';
import type { Rng } from '../world/rng.ts';
import type { Tables } from './materials.ts';
import type { Particle } from './types.ts';
import type { Voxels } from './voxels.ts';
import { KIND, MATERIALS } from './materials.ts';
// sim.ts imports the factories below back; both sides only call each
// other's functions at run time, never while the modules load.
import { ignite, spawn } from './sim.ts';

const SPARK_COLOR: RGB = [255, 214, 120];
const EMBER_COLOR: RGB = [255, 128, 48];
const SPARK_IGNITE = 8; // a spark's chance to light what it hits, x flammability
const BOUNCE = 0.4; // speed a spark keeps when it bounces
const BOLT_SPEED = 10;
const BOLT_STEER = 6; // how hard a bolt turns toward its target, per second

// Sparks that already bounced die on their next hit.
const bounced = new WeakSet<Particle>();

// A hot spark flying off up and outward at about `speed` voxels/s.
export function spark(x: number, y: number, z: number, rng: Rng, speed = 12, ignites = true, color: RGB = SPARK_COLOR): Particle {
  const a = rng.next() * Math.PI * 2;
  const up = rng.range(0.2, 1);
  const h = Math.sqrt(1 - up * up);
  const s = speed * rng.range(0.5, 1);
  return { kind: 'spark', x, y, z, vx: Math.cos(a) * h * s, vy: Math.sin(a) * h * s, vz: up * s, life: rng.range(0.3, 0.8), color, glow: true, gravity: 24, ignites };
}

// A glowing ember drifting slowly up off a fire (does not collide).
export function ember(x: number, y: number, z: number, rng: Rng, color: RGB = EMBER_COLOR): Particle {
  return { kind: 'ember', x, y, z, vx: rng.range(-0.6, 0.6), vy: rng.range(-0.6, 0.6), vz: rng.range(1, 2.5), life: rng.range(0.8, 2), color, glow: true, gravity: -0.5 };
}

// A chunk of `mat` thrown with velocity (vx, vy, vz) plus a little scatter;
// it lands as that material. Coloured like a random grain of it.
export function debris(x: number, y: number, z: number, mat: number, T: Tables, rng: Rng, vx = 0, vy = 0, vz = 0): Particle {
  const sv = (mat << 3) | ((rng.next() * 8) | 0);
  const c = T.color[sv];
  return {
    kind: 'debris',
    x,
    y,
    z,
    vx: vx + rng.range(-1.5, 1.5),
    vy: vy + rng.range(-1.5, 1.5),
    vz: vz + rng.range(0, 2),
    life: 4,
    color: [(c >> 16) & 255, (c >> 8) & 255, c & 255],
    glow: T.glow[sv] !== 0,
    gravity: 30,
    mat,
  };
}

// Moves every particle on by dt seconds and drops the dead ones, compacting
// the array in place. Sparks, debris and drops fly under gravity and hit
// anything that is not air, gas or flame: debris and drops land as their
// material, sparks bounce once (lighting what burns) and die on the next
// hit. Bolts home in on their target; embers, runes, glints and zzz float
// through everything.
export function updateParticles(ps: Particle[], v: Voxels, T: Tables, dt: number, rng: Rng): void {
  let n = 0;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    p.life -= dt;
    if (p.life > 0 && advance(p, v, T, dt, rng)) ps[n++] = p;
  }
  ps.length = n;
}

function advance(p: Particle, v: Voxels, T: Tables, dt: number, rng: Rng): boolean {
  switch (p.kind) {
    case 'spark':
    case 'debris':
    case 'drop':
      return fly(p, v, T, dt, rng);
    case 'bolt':
      return home(p, dt);
    default:
      p.vz -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      return true;
  }
}

// Steps along this frame's path at most one voxel at a time so nothing
// tunnels through a thin wall. Returns false once the particle is done.
function fly(p: Particle, v: Voxels, T: Tables, dt: number, rng: Rng): boolean {
  p.vz -= p.gravity * dt;
  const dx = p.vx * dt;
  const dy = p.vy * dt;
  const dz = p.vz * dt;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz))));
  const { W, D, H } = v;
  for (let s = 0; s < steps; s++) {
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    p.x += dx / steps;
    p.y += dy / steps;
    p.z += dz / steps;
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const cz = Math.floor(p.z);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= W || cy >= D) return false;
    if (cz >= H) continue; // open sky above the world
    const i = cx + W * (cy + D * cz);
    const m = v.mat[i];
    const k = T.kind[m];
    if (k === KIND.air || k === KIND.gas || k === KIND.fire) continue;
    const ocx = Math.floor(ox);
    const ocy = Math.floor(oy);
    const ocz = Math.floor(oz);
    if (p.kind === 'spark') {
      if (p.ignites && rng.next() < (MATERIALS[m]?.flammable ?? 0) * SPARK_IGNITE) ignite(v, i, rng);
      if (k === KIND.liquid || bounced.has(p)) return false;
      bounced.add(p);
      if (cx !== ocx) p.vx = -p.vx;
      if (cy !== ocy) p.vy = -p.vy;
      if (cz !== ocz) p.vz = -p.vz;
      p.vx *= BOUNCE;
      p.vy *= BOUNCE;
      p.vz *= BOUNCE;
      p.x = ox;
      p.y = oy;
      p.z = oz;
      return true;
    }
    // Still rising: stop against what it hit and fall back down.
    if (p.vz > 0) {
      p.x = ox;
      p.y = oy;
      p.z = oz;
      if (cx !== ocx) p.vx = 0;
      if (cy !== ocy) p.vy = 0;
      if (cz !== ocz) p.vz = 0;
      return true;
    }
    if (p.mat !== undefined) land(p.mat, v, T, rng, ox, oy, oz, cx, cy, cz);
    return false;
  }
  return true;
}

// Lands as `m` in the nearest air at or above the hit: the free cell the
// particle came from, else the first free cell up the column it hit.
function land(m: number, v: Voxels, T: Tables, rng: Rng, ox: number, oy: number, oz: number, cx: number, cy: number, cz: number): void {
  const { W, D, H } = v;
  const px = Math.floor(ox);
  const py = Math.floor(oy);
  const pz = Math.floor(oz);
  if (pz >= cz && pz < H && v.inside(px, py, pz)) {
    const i = px + W * (py + D * pz);
    if (free(v, T, i)) return spawn(v, i, m, rng);
  }
  for (let z = cz + 1; z < Math.min(H, cz + 5); z++) {
    const i = cx + W * (cy + D * z);
    if (free(v, T, i)) return spawn(v, i, m, rng);
  }
}

function free(v: Voxels, T: Tables, i: number): boolean {
  const k = T.kind[v.mat[i]];
  return k === KIND.air || k === KIND.gas;
}

function home(p: Particle, dt: number): boolean {
  const t = p.target;
  if (t) {
    const dx = t.x - p.x;
    const dy = t.y - p.y;
    const dz = t.z - p.z;
    const d = Math.hypot(dx, dy, dz);
    const sp = Math.max(BOLT_SPEED, Math.hypot(p.vx, p.vy, p.vz));
    if (d < Math.max(1, sp * dt)) return false;
    const k = Math.min(1, dt * BOLT_STEER);
    p.vx += ((dx / d) * sp - p.vx) * k;
    p.vy += ((dy / d) * sp - p.vy) * k;
    p.vz += ((dz / d) * sp - p.vz) * k;
  }
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
  return true;
}
