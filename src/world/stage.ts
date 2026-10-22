import type { Activity, AgentInfo } from '../agents.ts';
import { clip } from '../claude/activity.ts';
import type { RGB } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { drawBox } from '../iso/box.ts';
import { PixelCanvas } from '../iso/canvas.ts';
import { Shader } from '../iso/light.ts';
import type { ScreenLight } from '../iso/light.ts';
import { drawRoom, layoutRoom } from '../iso/room.ts';
import type { Placed, Room, Spot } from '../iso/room.ts';
import { characterSprite } from '../iso/sprites.ts';
import type { Facing, Rig } from '../iso/sprites.ts';
import { noise } from '../themes/art.ts';
import type { Lamp, StationKind, Theme } from '../themes/types.ts';
import { poseFor, traitsFor } from './character.ts';
import type { Pose, Traits } from './character.ts';
import { Rng, hashString } from './rng.ts';

export type { Placed } from '../iso/room.ts';

// How pixels map to terminal cells: 'half' = 1x2 square pixels per cell
// (upper half block), 'sextant' = 2x3 pixels per cell (2x3 sextant glyphs,
// pixels about 3:4), three times the resolution where the terminal draws
// sextants well.
export type PixelMode = 'half' | 'sextant';
const GRID: Record<PixelMode, { fx: number; fy: number; maxTw: number }> = {
  half: { fx: 1, fy: 2, maxTw: 12 },
  sextant: { fx: 2, fy: 3, maxTw: 24 },
};

const WALK = 3; // tiles per second
const ENTER_MS = 600;
const BUBBLE_MS = 3000;
const SLOT_OFFSETS = [0, -0.9, 0.9, -1.8, 1.8, -2.7, 2.7];
// Poses done with the back to the viewer, facing the furniture.
const FACES_STATION = new Set<Pose>(['write', 'read', 'search', 'web', 'run', 'think']);

export type Actor = {
  info: AgentInfo;
  traits: Traits;
  phase: number;
  gx: number;
  gy: number;
  path: Spot[];
  station: Placed | null;
  slot: number;
  state: 'enter' | 'walk' | 'work' | 'leave';
  facing: Facing;
  bornAt: number;
  bubbleUntil: number;
  gone: boolean;
  fx: number;
  order: number;
};

// World-space particle; `glyph` ones are drawn as text cells, the rest as pixels.
type Particle = { gx: number; gy: number; gz: number; vx: number; vy: number; vz: number; color: RGB; life: number; glyph?: string };

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

// The scene: an isometric room from the theme, with agents as pixel
// characters walking to the furniture for their current activity.
export class Stage {
  private theme: Theme;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private room: Room | null = null;
  private canvas = new PixelCanvas(0, 0);
  private shader = new Shader();
  // Theme lighting (grade, lamps, bloom); off draws the raw art.
  lit = true;
  private cast = new Map<string, Actor>();
  private particles: Particle[] = [];
  private rng = new Rng(1234);
  private seq = 0;
  private mode: PixelMode;
  private placedLabels: Array<{ x: number; y: number; w: number }> = [];

  constructor(theme: Theme, mode: PixelMode = 'half') {
    this.theme = theme;
    this.mode = mode;
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

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.layout(this.rect);
  }

  stations(): Placed[] {
    return this.room?.placed ?? [];
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
    const g = GRID[this.mode];
    this.canvas = new PixelCanvas(r.w * g.fx, r.h * g.fy);
    // Cells are about twice as tall as wide, so a pixel is (1/fx) wide and
    // (2/fy) tall in cell widths.
    const ky = g.fy / (2 * g.fx);
    this.room = r.w > 0 && r.h > 0 ? layoutRoom(r.w * g.fx, r.h * g.fy, this.theme, ky, g.maxTw) : null;
    for (const a of this.cast.values()) {
      if (this.room) {
        a.gx = Math.max(0.3, Math.min(this.room.W - 0.3, a.gx));
        a.gy = Math.max(0.3, Math.min(this.room.D - 0.3, a.gy));
      }
      a.station = null;
      a.path = [];
      if (a.state === 'enter') {
        const door = this.door();
        if (door) Object.assign(a, { gx: door.spot.gx, gy: door.spot.gy });
      }
      if (a.state === 'leave') this.retargetExit(a);
      else this.retarget(a);
    }
  }

  private door(): Placed | undefined {
    return this.room?.placed.find((p) => p.kind === 'entrance');
  }

  private clampToFloor(s: Spot): Spot {
    if (!this.room) return s;
    return { gx: Math.max(0.3, Math.min(this.room.W - 0.3, s.gx)), gy: Math.max(0.3, Math.min(this.room.D - 0.3, s.gy)) };
  }

  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind || !this.room) return;
    const st = this.room.placed.find((p) => p.kind === kind);
    if (!st) return;
    if (a.station === st && a.path.length === 0 && a.state === 'work') return;
    const taken = new Set([...this.cast.values()].filter((o) => o !== a && o.station === st).map((o) => o.slot));
    // First free slot whose spot is clear of every piece of furniture.
    const spotFor = (k: number): Spot => {
      const off = SLOT_OFFSETS[k];
      return this.clampToFloor(st.at.wall === 'right' ? { gx: st.spot.gx + off, gy: st.spot.gy } : { gx: st.spot.gx, gy: st.spot.gy + off });
    };
    let slot = 0;
    while (slot < SLOT_OFFSETS.length - 1 && (taken.has(slot) || this.blocked(spotFor(slot)))) slot++;
    if (this.blocked(spotFor(slot))) slot = 0;
    a.station = st;
    a.slot = slot;
    this.walkTo(a, spotFor(slot));
    if (a.state === 'work') a.state = 'walk';
  }

  private retargetExit(a: Actor): void {
    const door = this.door();
    a.station = null;
    if (door) this.walkTo(a, door.spot);
    else a.path = [];
  }

  private inside(s: Spot, margin: number): boolean {
    return this.stations().some((p) => {
      const { len, dep } = p.station.size;
      const [x0, x1, y0, y1] = p.at.wall === 'right'
        ? [p.at.along, p.at.along + len, p.at.out, p.at.out + dep]
        : [p.at.out, p.at.out + dep, p.at.along, p.at.along + len];
      return s.gx > x0 - margin && s.gx < x1 + margin && s.gy > y0 - margin && s.gy < y1 + margin;
    });
  }

  private blocked(s: Spot): boolean {
    return this.inside(s, 0.3);
  }

  // Straight there, or through the middle of the room when the straight
  // line would cut through furniture (it all stands against the walls).
  private walkTo(a: Actor, to: Spot): void {
    const from = { gx: a.gx, gy: a.gy };
    const clips = (p: Spot, q: Spot) => {
      const n = Math.ceil(Math.hypot(q.gx - p.gx, q.gy - p.gy) / 0.15);
      for (let i = 1; i < n; i++) {
        const k = i / n;
        if (this.inside({ gx: p.gx + (q.gx - p.gx) * k, gy: p.gy + (q.gy - p.gy) * k }, 0.05)) return true;
      }
      return false;
    };
    if (!this.room || !clips(from, to)) {
      a.path = [to];
      return;
    }
    const mid = { gx: this.room.W * 0.55, gy: this.room.D * 0.55 };
    a.path = [mid, to];
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
    const door = this.door();
    const at = door?.spot ?? { gx: 1, gy: 1 };
    const a: Actor = {
      info,
      traits: traitsFor(info.id, info.role, info.agentType),
      phase: hashString(info.id) % 997,
      gx: at.gx,
      gy: at.gy,
      path: [],
      station: null,
      slot: 0,
      state: 'enter',
      facing: { back: false, flip: false },
      bornAt: now,
      bubbleUntil: now + BUBBLE_MS,
      gone: false,
      fx: 0,
      order: this.seq++,
    };
    this.cast.set(info.id, a);
    this.retarget(a);
    this.burst(a, 12, this.theme.palette.accent);
  }

  update(dt: number, now: number): void {
    for (const a of this.cast.values()) {
      if (a.state === 'enter' && now - a.bornAt < ENTER_MS) continue;
      if (a.state === 'enter') a.state = a.path.length ? 'walk' : 'work';
      this.move(a, dt);
      if (a.path.length === 0) {
        if (a.state === 'leave') {
          a.gone = true;
          this.burst(a, 12, this.theme.palette.accent2);
        } else if (a.state === 'walk') {
          a.state = 'work';
        }
      } else if (a.state === 'work') {
        a.state = 'walk';
      }
      this.emit(a, dt, now);
    }
    for (const [id, a] of this.cast) if (a.gone) this.cast.delete(id);
    for (const p of this.stations()) p.users = 0;
    for (const a of this.cast.values()) if (a.station && a.state === 'work') a.station.users++;
    for (const p of this.particles) {
      p.gx += p.vx * dt;
      p.gy += p.vy * dt;
      p.gz += p.vz * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private move(a: Actor, dt: number): void {
    let budget = WALK * dt;
    while (a.path.length && budget > 1e-9) {
      const wp = a.path[0];
      const dx = wp.gx - a.gx;
      const dy = wp.gy - a.gy;
      const dist = Math.hypot(dx, dy);
      if (dist > 1e-6) {
        // Screen direction decides the view: up-screen walks away from us.
        a.facing = { back: dx + dy < 0, flip: dx - dy < 0 };
      }
      if (dist <= budget) {
        a.gx = wp.gx;
        a.gy = wp.gy;
        budget -= dist;
        a.path.shift();
      } else {
        a.gx += (dx / dist) * budget;
        a.gy += (dy / dist) * budget;
        budget = 0;
      }
    }
  }

  private add(p: Particle): void {
    if (this.particles.length < 400) this.particles.push(p);
  }

  private burst(a: Actor, n: number, color: RGB): void {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this.add({ gx: a.gx, gy: a.gy, gz: 1.2, vx: Math.cos(ang) * 1.2, vy: Math.sin(ang) * 1.2, vz: 1 + this.rng.next(), color, life: 0.5 + this.rng.next() * 0.3 });
    }
  }

  private emit(a: Actor, dt: number, now: number): void {
    a.fx += dt;
    if (a.state !== 'work') return;
    const pal = this.theme.palette;
    const r = this.rng;
    const every = (s: number) => {
      if (a.fx < s) return false;
      a.fx = 0;
      return true;
    };
    const head = 2.6;
    const at = (vz: number, color: RGB, life: number, glyph?: string, spread = 0.3): Particle => ({
      gx: a.gx + r.range(-spread, spread),
      gy: a.gy + r.range(-spread, spread),
      gz: head,
      vx: 0,
      vy: 0,
      vz,
      color,
      life,
      glyph,
    });
    const act = a.info.activity;
    const idleFor = (now - a.info.since) / 1000;
    if (act === 'write' && every(0.25)) this.add({ ...at(1.5, pal.accent, 0.5), gz: 1.6 });
    else if (act === 'run' && every(0.15)) this.add({ ...at(2.5, pal.warn, 0.4, undefined, 0.5), gz: 1.8 });
    else if (act === 'search' && every(1.4)) this.add(at(0.6, pal.accent2, 1.2, '?', 0));
    else if (act === 'web' && every(0.3)) this.add({ ...at(0.4, pal.accent, 0.6), vx: 0.8, vy: -0.8 });
    else if (act === 'think' && every(0.6)) this.add(at(0.9, pal.dim, 1.1));
    else if (act === 'delegate' && every(0.5)) this.add({ ...at(0, pal.accent2, 0.5, '»', 0), vx: 1.5, vy: 1.5 });
    else if (act === 'error' && every(0.5)) this.add(at(0.8, pal.bad, 0.8, '!', 0));
    else if (act === 'done' && every(0.06)) this.add({ ...at(-1.2, r.pick([pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color]), 1.2, undefined, 0.6), gz: 3 });
    else if (act === 'idle' && idleFor >= 20 && every(1.1)) this.add({ ...at(0.6, pal.dim, 2, r.pick(['z', 'Z']), 0), vx: 0.2, vy: -0.2 });
  }

  draw(s: Screen, t: number, now: number, selectedId: string | null): void {
    this.placedLabels = [];
    const room = this.room;
    const r = this.rect;
    if (!room || r.w <= 0 || r.h <= 0) return;
    const c = this.canvas;
    const iso = room.iso;
    c.clear(this.theme.backdrop);
    drawRoom(c, room, this.theme, t, now);
    const door = this.door();
    const actors = [...this.cast.values()];
    for (const p of [...room.placed].sort((m, n) => m.depth - n.depth)) {
      let active = p.users > 0;
      if (p === door) {
        // The door counts as in use while someone comes or goes, so themes
        // can light it up (users) like any other station.
        active = actors.some((a) => (a.state === 'enter' || a.state === 'leave') && Math.hypot(a.gx - p.spot.gx, a.gy - p.spot.gy) < 1.2);
        p.users = active ? 1 : 0;
      }
      // One shared clock, so themes can keep every piece on the same beat.
      for (const b of p.station.model(t, active)) drawBox(c, iso, b, p.at);
    }
    // Bigger tiles get more detailed characters.
    const rig: Rig = this.mode === 'sextant' ? (iso.hx >= 9 ? 'XL' : iso.hx >= 6 ? 'L' : 'S') : iso.hx >= 5 ? 'L' : 'S';
    // Contact shadows belong to the floor: drawn before the capture so the
    // lamps light them like the floor around them.
    for (const a of actors) this.drawShadow(c, a, rig);
    // What glows by itself is marked before anyone walks in front of it.
    const lighting = this.lit ? this.theme.lighting : undefined;
    if (lighting) this.shader.capture(c);
    const sprites = new Map<Actor, { sx: number; sy: number; top: number }>();
    const items: Array<{ depth: number; draw: () => void }> = [];
    for (const a of actors) {
      items.push({ depth: a.gx + a.gy, draw: () => sprites.set(a, this.drawActor(c, a, t, now, rig)) });
    }
    for (const p of this.particles) {
      if (p.glyph) continue;
      items.push({ depth: p.gx + p.gy, draw: () => { const [x, y] = iso.toScreen(p.gx, p.gy, p.gz); c.set(x, y, p.color); } });
    }
    for (const it of items.sort((m, n) => m.depth - n.depth)) it.draw();
    this.theme.ambient?.(c, room, t);
    if (lighting) this.shader.apply(c, this.lights(room, t, now), lighting);
    const g = GRID[this.mode];
    if (this.mode === 'sextant') c.blitSextant(s, r, this.theme.backdrop);
    else c.blit(s, r, this.theme.backdrop);
    for (const p of this.particles) {
      if (!p.glyph) continue;
      const [x, y] = iso.toScreen(p.gx, p.gy, p.gz);
      const cx = r.x + Math.floor(Math.round(x) / g.fx);
      const cy = r.y + Math.floor(Math.round(y) / g.fy);
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) s.put(cx, cy, p.glyph, p.color);
    }
    this.drawLabels(s, actors, sprites, now, selectedId, t);
  }

  // Station and room lamps as pools on the screen. A floor circle of radius
  // R projects to an ellipse with half-axes R*hx*√2 by R*hy/√2.
  private lights(room: Room, t: number, now: number): ScreenLight[] {
    const iso = room.iso;
    const out: ScreenLight[] = [];
    const add = (gx: number, gy: number, gz: number, l: Lamp) => {
      const [x, y] = iso.toScreen(gx, gy, 0);
      out.push({ x, y, rx: l.radius * iso.hx * Math.SQRT2, ry: l.radius * iso.hy * Math.SQRT1_2, up: gz * iso.hy, color: l.color, intensity: l.intensity });
    };
    for (const p of room.placed) {
      const got = p.station.light?.(t, p.users > 0);
      if (!got) continue;
      for (const l of Array.isArray(got) ? got : [got]) {
        if (p.at.wall === 'right') add(p.at.along + l.a, p.at.out + l.b, l.z, l);
        else add(p.at.out + l.b, p.at.along + l.a, l.z, l);
      }
    }
    for (const l of this.theme.lighting?.lights?.(room, t, now) ?? []) add(l.gx, l.gy, l.gz, l);
    return out;
  }

  private drawShadow(c: PixelCanvas, a: Actor, rig: Rig): void {
    const iso = this.room!.iso;
    const [sx, sy] = iso.toScreen(a.gx, a.gy, 0);
    const rx = rig === 'XL' ? 8 : rig === 'L' ? 4 : 3;
    const ry = Math.max(1, rx * 0.42 * iso.ky);
    for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
      for (let dx = -rx; dx <= rx; dx++) {
        if ((dx / rx) ** 2 + (dy / ry) ** 2 <= 1) c.blend(sx + dx, sy + dy, [0, 0, 0], 0.28);
      }
    }
  }

  private drawActor(c: PixelCanvas, a: Actor, t: number, now: number, rig: Rig): { sx: number; sy: number; top: number } {
    const iso = this.room!.iso;
    const [sx, sy] = iso.toScreen(a.gx, a.gy, 0);
    const idleFor = (now - a.info.since) / 1000;
    const walking = a.path.length > 0 && a.state !== 'enter';
    const pose = poseFor(a.info.activity, idleFor, walking);
    let facing = a.facing;
    if (!walking && a.station) {
      // At the furniture: backs to us for desk work, faces us otherwise.
      facing = FACES_STATION.has(pose) ? { back: true, flip: a.station.at.wall === 'left' } : { back: false, flip: a.station.at.wall === 'left' };
    } else if (!walking) {
      facing = { back: false, flip: a.facing.flip };
    }
    const sp = characterSprite(a.traits, pose, t, facing, a.phase, rig);
    const left = Math.round(sx) - sp.ax + sp.dx;
    const top = Math.round(sy) - sp.ay + sp.dy;
    const born = a.state === 'enter' ? Math.min(1, (now - a.bornAt) / ENTER_MS) : 1;
    for (let y = 0; y < sp.h; y++) {
      for (let x = 0; x < sp.w; x++) {
        const p = sp.px[y][x];
        if (!p) continue;
        if (born < 1 && noise(y * 11 + x, a.phase) > born) continue;
        c.set(left + x, top + y, p);
      }
    }
    return { sx, sy, top };
  }

  // Name tags and speech bubbles in text cells, placed so they never
  // overlap: the selected agent first, then the freshest bubbles. A label
  // that collides tries one row higher, otherwise it is skipped.
  private drawLabels(s: Screen, actors: Actor[], sprites: Map<Actor, { sx: number; sy: number; top: number }>, now: number, selectedId: string | null, t: number): void {
    const r = this.rect;
    const pal = this.theme.palette;
    const g = GRID[this.mode];
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
      const cx = r.x + Math.floor(Math.round(at.sx) / g.fx);
      const headRow = r.y + Math.floor(at.top / g.fy);
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
