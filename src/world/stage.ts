import type { Activity, AgentInfo } from '../agents.ts';
import { clip } from '../claude/activity.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { CLEAR, PixelCanvas } from '../iso/canvas.ts';
import { blitSprite, drawParticles, Glow } from '../cave/glow.ts';
import { hub, planLayout } from '../cave/layout.ts';
import { buildTables, M } from '../cave/materials.ts';
import type { Tables } from '../cave/materials.ts';
import { updateParticles } from '../cave/particles.ts';
import { Caster } from '../cave/raycast.ts';
import { explode, heal, step } from '../cave/sim.ts';
import { depthOf, project } from '../cave/types.ts';
import type { Biome, Ctx, Facing, Layout, Particle, PointLight, Slot, StationKind, View } from '../cave/types.ts';
import { Voxels } from '../cave/voxels.ts';
import { wizardSprite } from '../cave/wizard.ts';
import { poseFor, traitsFor } from './character.ts';
import type { Pose, Traits } from './character.ts';
import { Rng, hashString } from './rng.ts';

// How pixels map to terminal cells: 'half' = 1x2 square pixels per cell
// (upper half block), 'sextant' = 2x3 pixels per cell (2x3 sextant glyphs,
// pixels about 3:4), three times the resolution where the terminal draws
// sextants well.
export type PixelMode = 'half' | 'sextant';
const GRID: Record<PixelMode, { fx: number; fy: number }> = {
  half: { fx: 1, fy: 2 },
  sextant: { fx: 2, fy: 3 },
};

const WALK = 14; // voxels per second
const ENTER_MS = 700;
const BUBBLE_MS = 3000;
const SIM_HZ = 36;
const MARGIN = 6; // world-canvas border around the chunk, in pixels
// Where a crowd at one prop stands: (along the wall, further out), voxels.
const LANES: ReadonlyArray<readonly [number, number]> = [[0, 0], [-6, 0], [6, 0], [0, 6], [-6, 6], [6, 6], [-12, 0], [12, 0], [0, 12], [-12, 6], [12, 6]];
// Poses done with the back to the viewer, facing the prop.
const FACES_STATION = new Set<Pose>(['write', 'read', 'search', 'web', 'run', 'think']);

type Spot = { x: number; y: number };

export type Actor = {
  info: AgentInfo;
  traits: Traits;
  phase: number;
  x: number;
  y: number;
  z: number; // standing height, eased toward the ground under the feet; -1 = unknown
  path: Spot[];
  station: Slot | null;
  lane: number;
  state: 'enter' | 'walk' | 'work' | 'leave';
  facing: Facing;
  bornAt: number;
  bubbleUntil: number;
  gone: boolean;
  fx: number; // seconds since the last activity effect
  order: number;
  boomed: number; // `since` of the error that last exploded
  cheered: number; // `since` of the finish last celebrated
};

// Letters drifting up in text cells (z's of a sleeper, a '!' on errors).
type Glyph = { x: number; y: number; z: number; vz: number; ch: string; color: RGB; life: number };

export function stationKindFor(a: Activity): StationKind | null {
  switch (a) {
    case 'talk':
    case 'delegate':
      return 'think';
    case 'done':
    case 'error':
      return null;
    default:
      return a;
  }
}

// The scene: an isometric chunk of a Noita-style cave, every voxel
// simulated, with agents as tiny wizards walking to the prop for their
// current activity — where their work has physical effects.
export class Stage {
  private biome: Biome;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private mode: PixelMode;
  // Lighting (grade, glow, bloom); off draws the flat materials.
  lit = true;

  private L: Layout | null = null;
  private v: Voxels | null = null;
  private T: Tables;
  private caster: Caster | null = null;
  private glow = new Glow();
  private view: View = { ox: 0, oy: 0 };
  private world = new PixelCanvas(0, 0); // the whole chunk, lit
  private screen = new PixelCanvas(0, 0); // the part shown in the scene rect
  private albedo = new Int32Array(0);
  private emit = new Int32Array(0);
  private depth = new Float32Array(0);
  private cam = { x: 0, y: 0, set: false };
  private worldKey = '';

  private cast = new Map<string, Actor>();
  private particles: Particle[] = [];
  private glyphs: Glyph[] = [];
  private lights: PointLight[] = [];
  private rng = new Rng(1234);
  private simRng = new Rng(4321);
  private tick = 0;
  private simAcc = 0;
  private clock = 0;
  private seq = 0;
  private placedLabels: Array<{ x: number; y: number; w: number }> = [];

  constructor(biome: Biome, mode: PixelMode = 'half') {
    this.biome = biome;
    this.mode = mode;
    this.T = buildTables(biome.colors);
  }

  get pixels(): PixelMode {
    return this.mode;
  }

  setMode(mode: PixelMode): void {
    this.mode = mode;
    this.layout(this.rect);
  }

  // Cells taken by name tags, bubbles and the selection arrow in the last draw.
  labels(): Array<{ x: number; y: number; w: number }> {
    return this.placedLabels;
  }

  setTheme(biome: Biome): void {
    this.biome = biome;
    this.T = buildTables(biome.colors);
    this.worldKey = '';
    this.layout(this.rect);
  }

  stations(): Slot[] {
    return this.L?.slots ?? [];
  }

  // The live voxel world (for tests and tools).
  voxels(): Voxels | null {
    return this.v;
  }

  actors(): Actor[] {
    const all = [...this.cast.values()];
    const leads = all.filter((a) => a.info.role === 'lead').sort((a, b) => a.order - b.order);
    const out: Actor[] = [];
    for (const l of leads) {
      out.push(l);
      out.push(...all.filter((a) => a.info.role !== 'lead' && a.info.parentId === l.info.id).sort((a, b) => a.order - b.order));
    }
    out.push(...all.filter((a) => !out.includes(a)).sort((a, b) => a.order - b.order));
    return out;
  }

  layout(r: Rect): void {
    this.rect = r;
    // Nothing to show: keep the world as it is and skip drawing.
    if (r.w <= 0 || r.h <= 0) return;
    const g = GRID[this.mode];
    const cw = r.w * g.fx;
    const ch = r.h * g.fy;
    this.screen = new PixelCanvas(cw, ch);
    const L = planLayout(cw, ch);
    const key = `${this.biome.id}:${L.W}x${L.D}x${L.H}`;
    if (key !== this.worldKey) this.build(L, key);
    else this.L = L;
    this.cam.set = false;
    for (const a of this.cast.values()) {
      Object.assign(a, this.clampToFloor(a));
      a.z = -1;
      a.station = null;
      a.path = [];
      if (a.state === 'enter') Object.assign(a, this.door()?.spot ?? {});
      if (a.state === 'leave') this.retargetExit(a);
      else this.retarget(a);
    }
  }

  // Generates the biome into a fresh world sized for the layout and casts
  // every pixel once.
  private build(L: Layout, key: string): void {
    this.worldKey = key;
    this.L = L;
    const v = new Voxels(L.W, L.D, L.H);
    this.biome.generate(v, L, new Rng(hashString(this.biome.id)));
    v.commitBase();
    this.v = v;
    const w = L.W + L.D + 2 * MARGIN;
    const h = Math.ceil((L.W + L.D) / 2) + L.H + 2 * MARGIN;
    this.view = { ox: L.D + MARGIN, oy: L.H + MARGIN };
    this.world = new PixelCanvas(w, h);
    this.albedo = new Int32Array(w * h);
    this.emit = new Int32Array(w * h);
    this.depth = new Float32Array(w * h);
    this.caster = new Caster(v, this.T, w, h, this.view);
    const b = this.biome.backdrop;
    // Translucent edges against the void blend over the biome's backdrop.
    this.caster.backdrop = (b[0] << 16) | (b[1] << 8) | b[2];
    this.caster.renderAll();
    this.particles = [];
    this.glyphs = [];
    this.lights = [];
  }

  private door(): Slot | undefined {
    return this.L?.slots.find((s) => s.kind === 'entrance');
  }

  private clampToFloor(s: Spot): Spot {
    const L = this.L;
    if (!L) return { x: s.x, y: s.y };
    return { x: Math.max(L.T + 1, Math.min(L.W - 2, s.x)), y: Math.max(L.T + 1, Math.min(L.D - 2, s.y)) };
  }

  // Inside some prop's footprint (grown by `margin`).
  private inside(s: Spot, margin: number): boolean {
    return this.stations().some((p) => {
      const [x0, x1, y0, y1] = p.wall === 'right' ? [p.x0, p.x0 + p.len, p.y0, p.y0 + p.dep] : [p.x0, p.x0 + p.dep, p.y0, p.y0 + p.len];
      return s.x > x0 - margin && s.x < x1 + margin && s.y > y0 - margin && s.y < y1 + margin;
    });
  }

  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind || !this.L) return;
    const st = this.L.slots.find((p) => p.kind === kind);
    if (!st) return;
    if (a.station === st && a.path.length === 0 && a.state === 'work') return;
    const taken = new Set([...this.cast.values()].filter((o) => o !== a && o.station === st).map((o) => o.lane));
    const spotFor = (k: number): Spot => {
      const [along, out] = LANES[k % LANES.length];
      return this.clampToFloor(st.wall === 'right' ? { x: st.spot.x + along, y: st.spot.y + out } : { x: st.spot.x + out, y: st.spot.y + along });
    };
    // The first free lane clear of every prop; past those, any free lane.
    const free = [...LANES.keys()].filter((k) => !taken.has(k));
    const lane = free.find((k) => !this.inside(spotFor(k), 1.5)) ?? free[0] ?? 0;
    a.station = st;
    a.lane = lane;
    this.walkTo(a, spotFor(lane));
    if (a.state === 'work') a.state = 'walk';
  }

  private retargetExit(a: Actor): void {
    const door = this.door();
    a.station = null;
    if (door) this.walkTo(a, door.spot);
    else a.path = [];
  }

  // Straight there, or through the middle of the cave when the straight
  // line would cut through a prop (they all stand against the walls).
  private walkTo(a: Actor, to: Spot): void {
    const L = this.L;
    const from = { x: a.x, y: a.y };
    const clips = (p: Spot, q: Spot) => {
      const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.5);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        if (this.inside({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }, 0.5)) return true;
      }
      return false;
    };
    if (!L || !clips(from, to)) {
      a.path = [to];
      return;
    }
    a.path = [hub(L), to];
  }

  sync(agents: AgentInfo[], now: number): void {
    const ids = new Set<string>();
    for (const info of agents) {
      ids.add(info.id);
      const a = this.cast.get(info.id);
      if (!a) {
        this.spawn(info, now);
        continue;
      }
      if (a.info.agentType !== info.agentType || a.info.role !== info.role) {
        // Subagent metadata can arrive after the first sighting.
        a.traits = traitsFor(info.id, info.role, info.agentType);
      }
      const changed = a.info.activity !== info.activity || a.info.detail !== info.detail;
      const kindChanged = stationKindFor(a.info.activity) !== stationKindFor(info.activity);
      a.info = info;
      if (changed) a.bubbleUntil = now + BUBBLE_MS;
      if (a.state === 'leave') {
        a.state = 'walk';
        this.retarget(a);
      } else if (kindChanged) {
        this.retarget(a);
      }
    }
    for (const a of this.cast.values()) {
      if (!ids.has(a.info.id) && a.state !== 'leave') {
        a.state = 'leave';
        this.retargetExit(a);
      }
    }
  }

  private spawn(info: AgentInfo, now: number): void {
    const at = this.door()?.spot ?? { x: 12, y: 12 };
    const a: Actor = {
      info,
      traits: traitsFor(info.id, info.role, info.agentType),
      phase: hashString(info.id) % 997,
      x: at.x,
      y: at.y,
      z: -1,
      path: [],
      station: null,
      lane: 0,
      state: 'enter',
      facing: { back: false, flip: false },
      bornAt: now,
      bubbleUntil: now + BUBBLE_MS,
      gone: false,
      fx: 0,
      order: this.seq++,
      boomed: -1,
      cheered: -1,
    };
    this.cast.set(info.id, a);
    this.retarget(a);
    this.sparkle(a, 16, a.traits.color);
  }

  update(dt: number, now: number): void {
    this.clock += dt;
    for (const a of this.cast.values()) {
      if (a.state === 'enter' && now - a.bornAt < ENTER_MS) continue;
      if (a.state === 'enter') a.state = a.path.length ? 'walk' : 'work';
      this.move(a, dt);
      if (a.path.length === 0) {
        if (a.state === 'leave') {
          a.gone = true;
          this.sparkle(a, 16, a.traits.color);
        } else if (a.state === 'walk') {
          a.state = 'work';
        }
      } else if (a.state === 'work') {
        a.state = 'walk';
      }
      this.settle(a, dt);
      this.effects(a, dt, now);
    }
    for (const [id, a] of this.cast) if (a.gone) this.cast.delete(id);
    for (const g of this.glyphs) {
      g.z += g.vz * dt;
      g.life -= dt;
    }
    this.glyphs = this.glyphs.filter((g) => g.life > 0);
    this.simulate(dt);
  }

  // Eases the standing height toward the ground under the feet. The ground
  // is looked for at most a step above the current height, so a wizard
  // never pops onto a mound or a falling grain above their head.
  private settle(a: Actor, dt: number): void {
    const v = this.v;
    if (!v) return;
    const x = Math.floor(a.x);
    const y = Math.floor(a.y);
    const target = v.ground(x, y, a.z < 0 ? v.H - 1 : Math.floor(a.z) + 3);
    if (a.z < 0) a.z = target;
    else a.z += Math.max(-40 * dt, Math.min(20 * dt, target - a.z));
  }

  // Props and weather, then the physics at a fixed rate, healing, and the
  // free particles.
  private simulate(dt: number): void {
    const v = this.v;
    const L = this.L;
    if (!v || !L) return;
    this.lights = [];
    const c: Ctx = {
      v,
      rng: this.simRng,
      t: this.clock,
      dt,
      spawn: (p) => this.add(p),
      light: (l) => this.lights.push(l),
    };
    const actors = [...this.cast.values()];
    for (const s of L.slots) {
      const active = s.kind === 'entrance'
        ? actors.some((a) => (a.state === 'enter' || a.state === 'leave') && Math.hypot(a.x - s.spot.x, a.y - s.spot.y) < 8)
        : actors.some((a) => a.station === s && a.state === 'work');
      this.biome.props[s.kind].tick?.(c, s, active);
    }
    this.biome.weather?.(c, L);
    this.simAcc = Math.min(this.simAcc + dt, 3 / SIM_HZ);
    while (this.simAcc >= 1 / SIM_HZ) {
      step(v, this.T, this.simRng, this.tick++, (p) => this.add(p));
      this.simAcc -= 1 / SIM_HZ;
    }
    heal(v, this.T, this.simRng, 1500, (x, y, z) => actors.some((a) => Math.abs(x + 0.5 - a.x) < 3 && Math.abs(y + 0.5 - a.y) < 3 && z < a.z + 14));
    updateParticles(this.particles, v, this.T, dt, this.simRng);
  }

  private move(a: Actor, dt: number): void {
    let budget = WALK * dt;
    while (a.path.length && budget > 1e-9) {
      const wp = a.path[0];
      const dx = wp.x - a.x;
      const dy = wp.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) {
        // Screen direction decides the view: up-screen walks away from us.
        a.facing = { back: dx + dy < 0, flip: dx - dy < 0 };
      }
      if (dist <= budget) {
        a.x = wp.x;
        a.y = wp.y;
        budget -= dist;
        a.path.shift();
      } else {
        a.x += (dx / dist) * budget;
        a.y += (dy / dist) * budget;
        budget = 0;
      }
    }
  }

  private add(p: Particle): void {
    if (this.particles.length < 1500) this.particles.push(p);
  }

  private groundAt(x: number, y: number): number {
    return this.v ? this.v.ground(Math.floor(x), Math.floor(y)) : 0;
  }

  // Where an actor's feet are (eased), or the ground below if not yet known.
  private zOf(a: Actor): number {
    return a.z >= 0 ? a.z : this.groundAt(a.x, a.y);
  }

  private sparkle(a: { x: number; y: number }, n: number, color: RGB): void {
    const z = this.groundAt(a.x, a.y);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this.add({ kind: 'spark', x: a.x, y: a.y, z: z + 4 + this.rng.next() * 6, vx: Math.cos(ang) * 6, vy: Math.sin(ang) * 6, vz: 4 + this.rng.next() * 6, life: 0.6 + this.rng.next() * 0.4, color, glow: true, gravity: 10 });
    }
  }

  // What an agent's state does to the world beyond its prop: errors blow a
  // crater, finishing sets off fireworks, delegating casts a bolt at the
  // subagent, long naps drift z's.
  private effects(a: Actor, dt: number, now: number): void {
    a.fx += dt;
    const v = this.v;
    const L = this.L;
    if (!v || !L) return;
    const r = this.rng;
    const act = a.info.activity;
    const every = (s: number) => {
      if (a.fx < s) return false;
      a.fx = 0;
      return true;
    };
    const z = this.zOf(a);
    const head = z + 12;
    const pal = this.biome.palette;
    if (act === 'error' && a.boomed !== a.info.since && a.state !== 'enter') {
      a.boomed = a.info.since;
      // Toward the middle of the cave, so the crater opens in front of them.
      const kx = Math.sign(L.W * 0.55 - a.x) * 6;
      const ky = Math.sign(L.D * 0.55 - a.y) * 6;
      explode(v, this.T, Math.round(a.x + kx), Math.round(a.y + ky), z, 4, this.simRng, (p) => this.add(p));
    }
    if (act === 'error' && every(0.7)) this.glyphs.push({ x: a.x, y: a.y, z: head + 2, vz: 4, ch: '!', color: pal.bad, life: 0.8 });
    if (act === 'done' && a.cheered !== a.info.since) {
      a.cheered = a.info.since;
      const colors = [pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color];
      for (let i = 0; i < 46; i++) {
        const ang = r.next() * Math.PI * 2;
        const sp = 4 + r.next() * 8;
        this.add({ kind: 'spark', x: a.x, y: a.y, z: head + 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 10 + r.next() * 12, life: 0.8 + r.next() * 0.8, color: r.pick(colors), glow: true, gravity: 14 });
      }
      for (let i = 0; i < 10; i++) {
        this.add({ kind: 'debris', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 6, vx: r.range(-4, 4), vy: r.range(-4, 4), vz: 6 + r.next() * 6, life: 4, color: [255, 211, 74], glow: true, gravity: 24, mat: M.GOLD_DUST });
      }
    }
    if (act === 'delegate' && every(1.2)) {
      const sub = [...this.cast.values()].find((o) => o.info.parentId === a.info.id && o.state !== 'leave');
      if (sub) {
        const tz = this.zOf(sub) + 8;
        this.add({ kind: 'bolt', x: a.x, y: a.y, z: head, vx: 0, vy: 0, vz: 6, life: 3, color: a.traits.color, glow: true, gravity: 0, target: { x: sub.x, y: sub.y, z: tz } });
      }
    }
    if (act === 'talk' && every(0.5)) this.add({ kind: 'glint', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 2, vx: 0, vy: 0, vz: 3, life: 0.5, color: a.traits.color, glow: true, gravity: 0 });
    const idleFor = (now - a.info.since) / 1000;
    if (act === 'idle' && idleFor >= 20 && every(1.1)) this.glyphs.push({ x: a.x, y: a.y, z: head + 2, vz: 5, ch: r.pick(['z', 'Z']), color: pal.dim, life: 2 });
  }

  draw(s: Screen, t: number, now: number, selectedId: string | null): void {
    this.placedLabels = [];
    const r = this.rect;
    const v = this.v;
    const caster = this.caster;
    if (!this.L || !v || !caster || r.w <= 0 || r.h <= 0) return;
    caster.update(v.takeChanges());
    const { w, h } = this.world;
    this.albedo.set(caster.albedo);
    this.emit.set(caster.emit);
    this.depth.set(caster.depth);
    const lights = [...this.lights];
    const actors = [...this.cast.values()].sort((m, n) => m.x + m.y - (n.x + n.y));
    const sprites = new Map<Actor, { sx: number; sy: number; top: number }>();
    for (const a of actors) {
      const z = this.zOf(a);
      const idleFor = (now - a.info.since) / 1000;
      const walking = a.path.length > 0 && a.state !== 'enter';
      const pose = poseFor(a.info.activity, idleFor, walking);
      let facing = a.facing;
      if (!walking && a.station) {
        // At the prop: backs to us for the work, facing us otherwise.
        facing = FACES_STATION.has(pose) ? { back: true, flip: a.station.wall === 'left' } : { back: false, flip: a.station.wall === 'left' };
      } else if (!walking) {
        facing = { back: false, flip: a.facing.flip };
      }
      const sp = wizardSprite(a.traits, pose, t, facing, a.phase);
      const [sx, sy] = project(this.view, a.x, a.y, z);
      // Fading in at the door: drawn only once the entrance flash is over.
      if (a.state !== 'enter' || now - a.bornAt > ENTER_MS * 0.5) blitSprite(this.albedo, this.emit, this.depth, w, h, sp, sx, sy, depthOf(a.x, a.y, z) + 1);
      sprites.set(a, { sx, sy, top: Math.round(sy) - sp.ay + sp.dy });
      if (sp.light) {
        // Offsets are pixels from the anchor (before the sprite's own hop);
        // a pixel right is half a voxel along +x and -y, a pixel up one z.
        const l = sp.light;
        const lx = l.dx + sp.dx;
        const ly = l.dy + sp.dy;
        lights.push({ x: a.x + lx / 2, y: a.y - lx / 2, z: z - ly, color: l.color, radius: l.radius, intensity: l.intensity });
      }
    }
    drawParticles(this.albedo, this.emit, this.depth, w, h, this.particles, this.view);
    this.glow.compose(this.world, this.albedo, this.emit, this.view, lights, this.biome.grade, this.lit, this.biome.backdrop);
    this.crop(actors, sprites, selectedId);
    const g = GRID[this.mode];
    if (this.mode === 'sextant') this.screen.blitSextant(s, r, this.biome.backdrop);
    else this.screen.blit(s, r, this.biome.backdrop);
    for (const p of this.glyphs) {
      const [x, y] = project(this.view, p.x, p.y, p.z);
      const cx = r.x + Math.floor(Math.round(x - this.cam.x) / g.fx);
      const cy = r.y + Math.floor(Math.round(y - this.cam.y) / g.fy);
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) s.put(cx, cy, p.ch, p.color);
    }
    this.drawLabels(s, actors, sprites, now, selectedId, t);
  }

  // Copies the visible window of the lit chunk into the screen canvas:
  // centred when it fits, otherwise following the selected agent (or the
  // crowd) with a smooth pan.
  private crop(actors: Actor[], sprites: Map<Actor, { sx: number; sy: number; top: number }>, selectedId: string | null): void {
    const W = this.world;
    const S = this.screen;
    const focus = (len: number, view: number, at: number) => (len <= view ? (len - view) / 2 : Math.max(0, Math.min(len - view, at - view / 2)));
    let fx = W.w / 2;
    let fy = W.h / 2;
    const sel = actors.find((a) => a.info.id === selectedId);
    const pts = sel ? [sprites.get(sel)!] : actors.map((a) => sprites.get(a)!);
    if (pts.length) {
      fx = pts.reduce((sum, p) => sum + p.sx, 0) / pts.length;
      fy = pts.reduce((sum, p) => sum + p.sy - 8, 0) / pts.length;
    }
    const tx = focus(W.w, S.w, fx);
    const ty = focus(W.h, S.h, fy);
    if (!this.cam.set) Object.assign(this.cam, { x: tx, y: ty, set: true });
    this.cam.x += (tx - this.cam.x) * 0.15;
    this.cam.y += (ty - this.cam.y) * 0.15;
    const ox = Math.round(this.cam.x);
    const oy = Math.round(this.cam.y);
    S.data.fill(CLEAR);
    for (let y = 0; y < S.h; y++) {
      const wy = y + oy;
      if (wy < 0 || wy >= W.h) continue;
      const x0 = Math.max(0, -ox);
      const x1 = Math.min(S.w, W.w - ox);
      if (x1 > x0) S.data.set(W.data.subarray(wy * W.w + x0 + ox, wy * W.w + x1 + ox), y * S.w + x0);
    }
  }

  // Name tags and speech bubbles in text cells, placed so they never
  // overlap: the selected agent first, then the freshest bubbles. A label
  // that collides tries one row higher, otherwise it is skipped.
  private drawLabels(s: Screen, actors: Actor[], sprites: Map<Actor, { sx: number; sy: number; top: number }>, now: number, selectedId: string | null, t: number): void {
    const r = this.rect;
    const pal = this.biome.palette;
    const g = GRID[this.mode];
    const ox = Math.round(this.cam.x);
    const oy = Math.round(this.cam.y);
    const taken: Array<[number, number, number]> = [];
    const free = (y: number, x0: number, x1: number) => y >= r.y && !taken.some(([ty, a, b]) => ty === y && x0 < b + 1 && a < x1 + 1);
    const order = [...actors].sort((m, n) => {
      if (m.info.id === selectedId) return -1;
      if (n.info.id === selectedId) return 1;
      return n.bubbleUntil - m.bubbleUntil;
    });
    for (const a of order) {
      const at = sprites.get(a);
      if (!at) continue;
      const selected = a.info.id === selectedId;
      // Sprites are anchored on the rounded pixel column.
      const cx = r.x + Math.floor((Math.round(at.sx) - ox) / g.fx);
      const headRow = r.y + Math.floor((at.top - oy) / g.fy);
      if (cx < r.x || cx >= r.x + r.w || headRow <= r.y || headRow > r.y + r.h) continue;
      const fit = (w: number) => Math.max(r.x, Math.min(r.x + r.w - w, cx - Math.floor(w / 2)));
      const place = (text: string, ys: number[]): [number, number] | null => {
        const w = [...text].length;
        const x = fit(w);
        for (const y of ys) {
          if (y < r.y + r.h && free(y, x, x + w)) {
            taken.push([y, x, x + w]);
            return [x, y];
          }
        }
        return null;
      };
      const name = clip(a.info.name, 10);
      const tag = place(name, selected ? [headRow - 1, headRow - 2, headRow - 3] : [headRow - 1, headRow - 2]);
      if (tag) {
        const fg = selected ? pal.panel : a.traits.color;
        const bg = selected ? a.traits.color : pal.panel;
        s.text(tag[0], tag[1], name, fg, bg, BOLD, r.x + r.w);
      }
      if ((selected || now < a.bubbleUntil) && a.info.detail) {
        const text = ` ${clip(a.info.detail, 26)} `;
        const base = tag ? tag[1] : headRow - 1;
        const spot = place(text, [base - 1, base - 2]);
        if (spot) {
          s.text(spot[0], spot[1], text, pal.bubbleText, pal.bubble, 0, r.x + r.w);
          // The selection arrow claims its cell even while it blinks off.
          if (selected && spot[1] - 1 >= r.y && free(spot[1] - 1, cx, cx + 1)) {
            taken.push([spot[1] - 1, cx, cx + 1]);
            if (Math.floor(t * 2) % 2 === 0) s.put(cx, spot[1] - 1, '▼', a.traits.color);
          }
        }
      }
    }
    this.placedLabels = taken.map(([y, x0, x1]) => ({ x: x0, y, w: x1 - x0 }));
  }
}
