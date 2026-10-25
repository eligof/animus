import type { RGB } from '../term/color.ts';
import type { CritterKind } from '../worlds/types.ts';
import { Rng } from './rng.ts';
import type { Spot } from './types.ts';

// A small creature living by a 'pet' spot: it potters about near home,
// sits a while, and holds still for whoever comes to pet it. The scene
// draws it (kind and body colour from the world).

export type CritterLook = { kind: CritterKind; body: RGB };

const SPEED: Record<CritterKind, number> = { cat: 5, rat: 6, drone: 4, slime: 2.4, fox: 6, imp: 3.5 };

export class Critter {
  readonly look: CritterLook;
  readonly home: Spot;
  readonly radius: number;
  x: number;
  y: number;
  flip = false; // facing screen-left
  claimedBy: string | null = null; // who is on the way to pet it
  heartUntil = 0; // clock time a heart shows over it until
  moving = false;
  private target: Spot | null = null;
  private wait = 1;
  private rng: Rng;

  constructor(look: CritterLook, home: Spot, radius: number, seed: number) {
    this.look = look;
    this.home = { x: home.x, y: home.y };
    this.radius = radius;
    this.x = home.x;
    this.y = home.y;
    this.rng = new Rng(seed);
  }

  // Wanders between spots within `radius` of home that `ok` allows, with
  // pauses; stays put while someone is coming to pet it.
  update(dt: number, ok: (x: number, y: number) => boolean): void {
    this.moving = false;
    if (this.claimedBy) return;
    if (!this.target) {
      this.wait -= dt;
      if (this.wait > 0) return;
      for (let tries = 0; tries < 6 && !this.target; tries++) {
        const a = this.rng.next() * Math.PI * 2;
        const d = this.rng.range(1, this.radius);
        const t = { x: this.home.x + Math.cos(a) * d, y: this.home.y + Math.sin(a) * d };
        if (ok(t.x, t.y) && ok((t.x + this.x) / 2, (t.y + this.y) / 2)) this.target = t;
      }
      this.wait = this.rng.range(1, 4);
      return;
    }
    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const d = Math.hypot(dx, dy);
    const step = SPEED[this.look.kind] * dt;
    if (d > 1e-6) this.flip = dx - dy < 0;
    if (d <= step) {
      this.x = this.target.x;
      this.y = this.target.y;
      this.target = null;
    } else {
      this.x += (dx / d) * step;
      this.y += (dy / d) * step;
      this.moving = true;
    }
  }

  // Turns to look at a spot (whoever is petting it).
  face(s: Spot): void {
    const dx = s.x - this.x;
    const dy = s.y - this.y;
    if (Math.abs(dx) + Math.abs(dy) > 1e-6) this.flip = dx - dy < 0;
  }

  // How high it floats over the floor (drones hover, imps flutter).
  hover(t: number): number {
    if (this.look.kind === 'drone') return 4 + Math.sin(t * 3) * 0.6;
    if (this.look.kind === 'imp') return 3 + Math.sin(t * 5) * 0.8;
    return 0;
  }
}
