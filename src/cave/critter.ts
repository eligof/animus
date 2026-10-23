import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import { Rng, hashString } from '../world/rng.ts';
import type { WizardSprite } from './types.ts';

// A small creature living by a 'pet' spot: it potters about near home,
// sits a while, and holds still for whoever comes to pet it. Drawn as a
// tiny pixel sprite of its own (a few pixels across).

export type CritterKind = 'cat' | 'rat' | 'drone' | 'slime' | 'fox' | 'imp';
export type CritterLook = { kind: CritterKind; body: RGB; glow?: boolean };

type Spot = { x: number; y: number };

// Which creature lives in which scene (a cat anywhere else).
export function critterFor(biomeId: string): CritterLook {
  switch (biomeId) {
    case 'den': return { kind: 'cat', body: hex('#2b2b33') }; // a black cat
    case 'club': return { kind: 'cat', body: hex('#8a7aa8') };
    case 'cafe': return { kind: 'cat', body: hex('#e8913a') };
    case 'lab': return { kind: 'rat', body: hex('#eeeae4') }; // a lab rat
    case 'station': return { kind: 'drone', body: hex('#d8dee6') }; // a maintenance drone
    case 'mines': return { kind: 'rat', body: hex('#8a7462') }; // a mine rat
    case 'fungal': return { kind: 'slime', body: hex('#4fd8a8'), glow: true };
    case 'snowy': return { kind: 'fox', body: hex('#eef3f8') }; // a snow fox
    case 'vault': return { kind: 'drone', body: hex('#a9b3bf') };
    case 'hell': return { kind: 'imp', body: hex('#d2402a') };
    default: return { kind: 'cat', body: hex('#e8913a') };
  }
}

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

  // How high it floats over the ground.
  hover(t: number): number {
    if (this.look.kind === 'drone') return 4 + Math.round(Math.sin(t * 3) * 0.6);
    if (this.look.kind === 'imp') return 3 + Math.round(Math.sin(t * 5) * 0.8);
    return 0;
  }

  sprite(t: number): WizardSprite {
    const { kind, body, glow } = this.look;
    const dark = scale(body, 0.55);
    const step = this.moving && Math.floor(t * 8) % 2 === 1;
    const key: Record<string, RGB> = { o: body, d: dark, k: hex('#141018'), p: hex('#f29bb0'), m: hex('#7d8794') };
    const lit: Record<string, RGB> = { e: kind === 'drone' ? hex('#3ef0ff') : hex('#ffe680'), r: hex('#ff3b3b'), g: mix(body, [255, 255, 255], 0.5) };
    if (kind === 'fox') key.d = hex('#3a3440'); // dark ear and tail tips
    let rows: string[];
    switch (kind) {
      case 'cat':
        rows = this.moving
          ? ['d...o.o', '.d..ooo', '..oooeo', '..oooo.', step ? '..o..o.' : '...o.o.']
          : ['.....o.o', 'd....ooo', 'd.oooeok', '.ooooo..', '.o.o.o..'];
        break;
      case 'rat':
        rows = ['....od.', 'p.oooek', '.p.o.o.'];
        if (step) rows[2] = 'p..o.o.';
        break;
      case 'fox':
        rows = ['.....d.d', 'dl...ooo', '.loooooe', step ? '..o..o..' : '...o.o..'];
        key.l = mix(body, [255, 255, 255], 0.5);
        break;
      case 'imp': {
        // Horns, glowing eyes, and little wings beating up and down.
        const up = Math.floor(t * 8) % 2 === 0;
        rows = ['d...d', '.ooo.', up ? 'deoed' : '.eoe.', up ? '.ooo.' : 'doood', '.o.o.'];
        break;
      }
      case 'drone': {
        const blade = Math.floor(t * 12) % 2 ? 'm.m.m' : '.m.m.';
        const blink = Math.floor(t * 2) % 2 === 0;
        rows = [blade, '.ooo.', 'ooeoo', blink ? '..r..' : '..d..'];
        break;
      }
      default: {
        const squash = Math.sin(t * (this.moving ? 9 : 3)) > 0.3;
        rows = squash ? ['.....', '.ggg.', 'gegeg', 'ooooo'] : ['.ggg.', 'ggggg', 'gegeg', '.ooo.'];
      }
    }
    const h = rows.length;
    const w = Math.max(...rows.map((r) => r.length));
    const px: Array<Array<RGB | null>> = [];
    const gl: Array<Array<RGB | null>> = [];
    for (const r of rows) {
      const prow: Array<RGB | null> = [];
      const grow: Array<RGB | null> = [];
      for (let c = 0; c < w; c++) {
        const ch = r[c] ?? '.';
        const g = lit[ch] ?? (glow && (ch === 'o' || ch === 'g') ? (ch === 'g' ? lit.g : body) : undefined);
        prow.push(g ?? key[ch] ?? null);
        grow.push(g ?? null);
      }
      if (this.flip) {
        prow.reverse();
        grow.reverse();
      }
      px.push(prow);
      gl.push(grow);
    }
    return { w, h, px, glow: gl, ax: Math.floor(w / 2), ay: h - 1, dx: 0, dy: kind === 'slime' || kind === 'drone' ? 0 : step ? -1 : 0 };
  }
}
