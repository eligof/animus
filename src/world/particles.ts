import type { RGB } from '../term/color.ts';
import type { Rng } from './rng.ts';
import type { Layout, Particle } from './types.ts';

// The bits flying about the room, moved on without any world to hit but
// the floor (z = 0) and the back walls: sparks bounce once off the floor
// and die on the next touch; confetti flutters down and lies where it
// lands, fading out; drops vanish where they land; smoke and steam rise
// and slow; embers, glints and z's drift through everything; bolts home in
// on their target.

const SPARK_COLOR: RGB = [255, 214, 120];
const EMBER_COLOR: RGB = [255, 128, 48];
const BOUNCE = 0.4; // speed a spark keeps when it bounces
const BOLT_SPEED = 10;
const BOLT_STEER = 6; // how hard a bolt turns toward its target, per second
const FLUTTER = 1.6; // drag on falling confetti, per second
const RISE_DRAG = 0.8; // drag on rising smoke and steam, per second
export const LIE = 1.5; // seconds landed confetti lies before it is gone
export const FADE = 0.5; // the last seconds of a bit's life, fading out

// Sparks that already bounced die on their next hit.
const bounced = new WeakSet<Particle>();

// A hot spark flying off up and outward at about `speed` units/s.
export function spark(x: number, y: number, z: number, rng: Rng, speed = 12, color: RGB = SPARK_COLOR): Particle {
  const a = rng.next() * Math.PI * 2;
  const up = rng.range(0.2, 1);
  const h = Math.sqrt(1 - up * up);
  const s = speed * rng.range(0.5, 1);
  return { kind: 'spark', x, y, z, vx: Math.cos(a) * h * s, vy: Math.sin(a) * h * s, vz: up * s, life: rng.range(0.3, 0.8), color, glow: true, gravity: 24 };
}

// A glowing ember drifting slowly up off a fire.
export function ember(x: number, y: number, z: number, rng: Rng, color: RGB = EMBER_COLOR): Particle {
  return { kind: 'ember', x, y, z, vx: rng.range(-0.6, 0.6), vy: rng.range(-0.6, 0.6), vz: rng.range(1, 2.5), life: rng.range(0.8, 2), color, glow: true, gravity: -0.5 };
}

// A wisp of smoke (or steam) rising.
export function smoke(x: number, y: number, z: number, rng: Rng, color: RGB, kind: 'smoke' | 'steam' = 'smoke'): Particle {
  return { kind, x, y, z, vx: rng.range(-0.6, 0.6), vy: rng.range(-0.6, 0.6), vz: rng.range(3, 5), life: rng.range(1.2, 2.2), color, glow: false, gravity: 0 };
}

// Moves every particle on by dt seconds and drops the dead ones, compacting
// the array in place. With a layout, bits that fly into a back wall or out
// of the room are gone.
export function updateParticles(ps: Particle[], dt: number, L?: Layout): void {
  let n = 0;
  for (let k = 0; k < ps.length; k++) {
    const p = ps[k];
    p.life -= dt;
    if (p.life > 0 && advance(p, dt) && inside(p, L)) ps[n++] = p;
  }
  ps.length = n;
}

function inside(p: Particle, L?: Layout): boolean {
  if (!L || p.kind === 'bolt') return true;
  return p.x >= L.T && p.y >= L.T && p.x <= L.W && p.y <= L.D;
}

function advance(p: Particle, dt: number): boolean {
  if (p.landed) return true;
  switch (p.kind) {
    case 'spark':
      return fall(p, dt, () => {
        if (bounced.has(p)) return false;
        bounced.add(p);
        p.vz = -p.vz * BOUNCE;
        p.vx *= BOUNCE;
        p.vy *= BOUNCE;
        return true;
      });
    case 'confetti':
      return fall(p, dt, () => {
        p.landed = true;
        p.vx = p.vy = p.vz = 0;
        p.life = Math.min(p.life, LIE);
        return true;
      });
    case 'drop':
      return fall(p, dt, () => false);
    case 'bolt':
      return home(p, dt);
    case 'smoke':
    case 'steam': {
      const k = Math.max(0, 1 - RISE_DRAG * dt);
      p.vx *= k;
      p.vy *= k;
      p.vz = p.vz * k - p.gravity * dt;
      move(p, dt);
      return true;
    }
    default:
      p.vz -= p.gravity * dt;
      move(p, dt);
      return true;
  }
}

function move(p: Particle, dt: number): void {
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.z += p.vz * dt;
}

// Under gravity (confetti flutters), until it reaches the floor: then
// `land` says what happens (false: gone).
function fall(p: Particle, dt: number, land: () => boolean): boolean {
  p.vz -= p.gravity * dt;
  if (p.kind === 'confetti') {
    const k = Math.max(0, 1 - FLUTTER * dt);
    p.vx *= k;
    p.vy *= k;
    if (p.vz < 0) p.vz *= k;
  }
  move(p, dt);
  if (p.z > 0) return true;
  p.z = 0;
  return land();
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
  move(p, dt);
  return true;
}

// How opaque a particle is now: 1, fading to 0 over its last FADE seconds.
export function opacity(p: Particle): number {
  return Math.max(0, Math.min(1, p.life / FADE));
}
