import type { Activity, AgentInfo } from '../agents.ts';
import type { RGB } from '../term/color.ts';
import { mix } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { drawArt, frameAt, noise } from '../themes/art.ts';
import type { StationDef, StationKind, Theme } from '../themes/types.ts';
import { clip } from '../claude/activity.ts';
import { SPRITE_H, SPRITE_W, poseFor, spriteFor, traitsFor } from './character.ts';
import type { Traits } from './character.ts';
import { Rng, hashString } from './rng.ts';

const WALK = 14; // cells per second
const CLIMB = 9; // rows per second
const ENTER_MS = 600;
const BUBBLE_MS = 3000;
const SLOT_OFFSETS = [0, -5, 5, -10, 10, -15, 15, -20, 20];
const UPPER_KINDS: StationKind[] = ['read', 'search', 'web'];
// Scenes at least this tall get a mezzanine (fits 80x24 terminals).
const TWO_LEVEL_MIN_H = 17;

export type Placed = { def: StationDef; x: number; y: number; level: number; center: number; phase: number; users: number };

type Waypoint = { x: number; level: number };

export type Actor = {
  info: AgentInfo;
  traits: Traits;
  phase: number;
  x: number; // sprite left column
  y: number; // feet row
  level: number;
  path: Waypoint[];
  station: Placed | null;
  slot: number;
  state: 'enter' | 'walk' | 'work' | 'leave';
  facing: 1 | -1;
  bornAt: number;
  bubbleUntil: number;
  gone: boolean;
  fx: number;
  order: number;
};

type Particle = { x: number; y: number; vx: number; vy: number; ch: string; fg: RGB; life: number };

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

// The scene simulation: places theme stations on one or two floors, turns
// agents into actors that walk (and climb) to the station matching their
// activity, and draws everything with particles, name tags and bubbles.
export class Stage {
  private theme: Theme;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private floorRows: number[] = [];
  private feet: number[] = [];
  private ladders: number[] = []; // actor x (sprite left col) for each ladder
  private placed: Placed[] = [];
  private cast = new Map<string, Actor>();
  private particles: Particle[] = [];
  private rng = new Rng(1234);
  private seq = 0;

  constructor(theme: Theme) {
    this.theme = theme;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
    this.layout(this.rect);
  }

  floors(): number[] {
    return this.floorRows;
  }

  stations(): Placed[] {
    return this.placed;
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
    const oldLevels = this.feet.length;
    const two = r.h >= TWO_LEVEL_MIN_H;
    this.floorRows = two ? [r.y + Math.floor(r.h / 2) - 1, r.y + r.h - 2] : [r.y + r.h - 2];
    this.feet = this.floorRows.map((f) => f + 1);
    this.ladders = two ? [r.x, r.x + r.w - SPRITE_W] : [];
    const right = two ? r.x + r.w - 7 : r.x + r.w - 1;
    const byLevel: StationDef[][] = two
      ? [
          this.theme.stations.filter((s) => UPPER_KINDS.includes(s.kind as StationKind)),
          [this.theme.entrance, ...this.theme.stations.filter((s) => !UPPER_KINDS.includes(s.kind as StationKind))],
        ]
      : [[this.theme.entrance, ...this.theme.stations]];
    this.placed = [];
    byLevel.forEach((defs, level) => {
      const left = two ? r.x + 6 : r.x + 1;
      const span = Math.max(1, right - left);
      const total = defs.reduce((n, d) => n + d.frames[0].w, 0);
      const gap = (span - total) / (defs.length + 1);
      let cursor = left;
      defs.forEach((def, i) => {
        const w = def.frames[0].w;
        const h = def.frames[0].h;
        let x: number;
        if (gap >= 1) {
          // Everything fits: equal gaps, never overlapping.
          cursor += gap;
          x = Math.round(cursor);
          cursor += w;
        } else {
          const center = Math.round(left + ((i + 0.5) * span) / defs.length);
          x = center - Math.floor(w / 2);
        }
        x = Math.max(r.x, Math.min(r.x + r.w - w, x));
        this.placed.push({ def, x, y: this.floorRows[level] - h + 1, level, center: x + Math.floor(w / 2), phase: noise(i, level + 7) * 10, users: 0 });
      });
    });
    for (const a of this.cast.values()) {
      // Keep the same distance from the ground floor when levels change.
      const fromGround = oldLevels > 0 ? oldLevels - 1 - a.level : 0;
      a.level = Math.max(0, Math.min(this.feet.length - 1, this.feet.length - 1 - fromGround));
      a.x = Math.max(r.x, Math.min(r.x + r.w - SPRITE_W, a.x));
      a.y = this.feet[a.level];
      if (a.state === 'enter') {
        const door = this.entrance();
        a.level = this.feet.length - 1;
        a.y = this.feet[a.level];
        if (door) a.x = door.center - Math.floor(SPRITE_W / 2);
      }
      a.station = null;
      a.path = [];
      if (a.state === 'leave') this.retargetExit(a);
      else this.retarget(a);
    }
  }

  private entrance(): Placed | undefined {
    return this.placed.find((p) => p.def.kind === 'entrance');
  }

  private route(a: Actor, level: number, x: number): void {
    const r = this.rect;
    const tx = Math.max(r.x, Math.min(r.x + r.w - SPRITE_W, x));
    const midClimb = Math.abs(a.y - this.feet[a.level]) > 1e-6;
    if (midClimb && level !== a.level) {
      // Already on a ladder: keep climbing toward the new level.
      a.path = [{ x: a.x, level }, { x: tx, level }];
      return;
    }
    if (level === a.level || this.ladders.length === 0) {
      a.path = [{ x: tx, level: a.level }];
      return;
    }
    const lx = this.ladders.reduce((best, l) => (Math.abs(a.x - l) + Math.abs(l - tx) < Math.abs(a.x - best) + Math.abs(best - tx) ? l : best));
    a.path = [{ x: lx, level: a.level }, { x: lx, level }, { x: tx, level }];
  }

  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind) return;
    const st = this.placed.find((p) => p.def.kind === kind);
    if (!st) return;
    if (a.station === st && a.path.length === 0 && a.state === 'work') return;
    const taken = new Set([...this.cast.values()].filter((o) => o !== a && o.station === st).map((o) => o.slot));
    let slot = 0;
    while (taken.has(slot) && slot < SLOT_OFFSETS.length - 1) slot++;
    a.station = st;
    a.slot = slot;
    this.route(a, st.level, st.center - Math.floor(SPRITE_W / 2) + SLOT_OFFSETS[slot]);
    if (a.state === 'work') a.state = 'walk';
  }

  private retargetExit(a: Actor): void {
    const door = this.entrance();
    a.station = null;
    this.route(a, this.feet.length - 1, door ? door.center - Math.floor(SPRITE_W / 2) : this.rect.x);
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
      } else if (kindChanged && a.state !== 'enter') {
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
    const door = this.entrance();
    const level = this.feet.length - 1;
    const x = door ? door.center - Math.floor(SPRITE_W / 2) : this.rect.x;
    const a: Actor = {
      info,
      traits: traitsFor(info.id, info.role, info.agentType),
      phase: hashString(info.id) % 997,
      x,
      y: this.feet[level] ?? 0,
      level,
      path: [],
      station: null,
      slot: 0,
      state: 'enter',
      facing: 1,
      bornAt: now,
      bubbleUntil: now + BUBBLE_MS,
      gone: false,
      fx: 0,
      order: this.seq++,
    };
    this.cast.set(info.id, a);
    this.retarget(a);
    this.burst(x + 2, a.y - 2, 10, this.theme.palette.accent);
  }

  update(dt: number, now: number): void {
    for (const a of this.cast.values()) {
      if (a.state === 'enter' && now - a.bornAt < ENTER_MS) continue;
      if (a.state === 'enter') a.state = a.path.length ? 'walk' : 'work';
      this.move(a, dt);
      if (a.path.length === 0) {
        if (a.state === 'leave') {
          a.gone = true;
          this.burst(a.x + 2, a.y - 2, 10, this.theme.palette.accent2);
        } else if (a.state === 'walk') {
          a.state = 'work';
        }
      } else if (a.state === 'work') {
        a.state = 'walk';
      }
      this.emit(a, dt, now);
    }
    for (const [id, a] of this.cast) if (a.gone) this.cast.delete(id);
    for (const p of this.placed) p.users = 0;
    for (const a of this.cast.values()) if (a.station && a.state === 'work') a.station.users++;
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private move(a: Actor, dt: number): void {
    let budget = dt;
    while (a.path.length && budget > 1e-9) {
      const wp = a.path[0];
      if (wp.level !== a.level) {
        const ty = this.feet[wp.level];
        const d = ty - a.y;
        const step = CLIMB * budget;
        if (Math.abs(d) <= step) {
          budget -= Math.abs(d) / CLIMB;
          a.y = ty;
          a.level = wp.level;
          a.path.shift();
        } else {
          a.y += Math.sign(d) * step;
          budget = 0;
        }
      } else if (Math.abs(a.y - this.feet[a.level]) > 1e-6) {
        // Back down (or up) to the floor we came from before walking.
        const ty = this.feet[a.level];
        const d = ty - a.y;
        const step = CLIMB * budget;
        if (Math.abs(d) <= step) {
          budget -= Math.abs(d) / CLIMB;
          a.y = ty;
        } else {
          a.y += Math.sign(d) * step;
          budget = 0;
        }
      } else {
        const d = wp.x - a.x;
        const step = WALK * budget;
        if (d !== 0) a.facing = d > 0 ? 1 : -1;
        if (Math.abs(d) <= step) {
          budget -= Math.abs(d) / WALK;
          a.x = wp.x;
          a.path.shift();
        } else {
          a.x += Math.sign(d) * step;
          budget = 0;
        }
      }
    }
  }

  private climbing(a: Actor): boolean {
    return a.path.length > 0 && (a.path[0].level !== a.level || Math.abs(a.y - this.feet[a.level]) > 1e-6);
  }

  private add(x: number, y: number, vx: number, vy: number, ch: string, fg: RGB, life: number): void {
    if (this.particles.length < 400) this.particles.push({ x, y, vx, vy, ch, fg, life });
  }

  private burst(x: number, y: number, n: number, fg: RGB): void {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this.add(x, y, Math.cos(ang) * 6, Math.sin(ang) * 3, this.rng.pick(['*', '+', '·', '°']), fg, 0.5 + this.rng.next() * 0.3);
    }
  }

  private emit(a: Actor, dt: number, now: number): void {
    a.fx += dt;
    if (a.state !== 'work') return;
    const pal = this.theme.palette;
    const cx = a.x + 2;
    const top = a.y - SPRITE_H + 1;
    const r = this.rng;
    const every = (s: number) => {
      if (a.fx < s) return false;
      a.fx = 0;
      return true;
    };
    const act = a.info.activity;
    const idleFor = (now - a.info.since) / 1000;
    if (act === 'write' && every(0.22)) this.add(cx + r.int(-2, 2), top + 2, r.range(-1, 1), -2.5, r.pick(['·', '*', '+']), pal.accent, 0.5);
    else if (act === 'run' && every(0.18)) this.add(cx + r.int(-3, 3), top + 1, r.range(-3, 3), -3, r.pick(['*', '+', '×']), pal.warn, 0.4);
    else if (act === 'search' && every(1.4)) this.add(cx + 3, top - 1, 0.4, -1.2, '?', pal.accent2, 1.2);
    else if (act === 'web' && every(0.35)) this.add(cx + 3, top + 1, 5 * a.facing, -0.5, r.pick(['≋', ')', '~']), pal.accent, 0.6);
    else if (act === 'think' && every(0.7)) this.add(cx + 1, top - 1, 0.6, -1.4, r.pick(['°', 'o', '·']), pal.dim, 1.1);
    else if (act === 'delegate' && every(0.3)) this.add(cx + 3 * a.facing, top + 2, 9 * a.facing, 0, '»', pal.accent2, 0.5);
    else if (act === 'error' && every(0.5)) this.add(cx, top - 1, 0, -1.5, '!', pal.bad, 0.8);
    else if (act === 'done' && every(0.08)) this.add(cx + r.int(-4, 4), top - 1, r.range(-2, 2), r.range(1.5, 4), r.pick(['*', '+', '·', '•', '°', '♥']), r.pick([pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color]), 1.2);
    else if (act === 'idle' && idleFor >= 20 && every(1.1)) this.add(cx + 2, top, 1.2, -1.2, r.pick(['z', 'Z']), pal.dim, 2);
  }

  private inRect(x: number, y: number): boolean {
    const r = this.rect;
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  }

  draw(s: Screen, t: number, now: number, selectedId: string | null): void {
    const r = this.rect;
    this.theme.drawBackdrop(s, r, t, this.floorRows, now);
    for (const lx of this.ladders) this.drawLadder(s, lx);
    const door = this.entrance();
    const actors = [...this.cast.values()];
    for (const p of this.placed) {
      let active = p.users > 0;
      if (p === door) active = actors.some((a) => (a.state === 'enter' || a.state === 'leave') && Math.abs(a.x + 2 - p.center) < 8 && a.level === p.level);
      drawArt(s, frameAt(p.def, t + p.phase, active), p.x, p.y, p.def.colors, r);
    }
    for (const a of actors.sort((m, n) => m.y - n.y || m.x - n.x)) this.drawActor(s, a, t, now);
    for (const p of this.particles) {
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (this.inRect(x, y)) s.put(x, y, p.ch, p.fg);
    }
    this.theme.drawAmbient(s, r, t, this.floorRows);
    this.drawLabels(s, actors, now, selectedId, t);
  }

  private drawLadder(s: Screen, lx: number): void {
    const c = mix(this.theme.palette.dim, this.theme.palette.wall, 0.15);
    const x = lx + 1;
    for (let y = this.floorRows[0] - 1; y <= this.floorRows[1]; y++) {
      if (!this.inRect(x, y)) continue;
      const rung = (y - this.floorRows[0]) % 2 === 0;
      s.put(x, y, rung ? '╟' : '║', c);
      s.put(x + 1, y, rung ? '─' : ' ', c);
      s.put(x + 2, y, rung ? '╢' : '║', c);
    }
  }

  private drawActor(s: Screen, a: Actor, t: number, now: number): void {
    const idleFor = (now - a.info.since) / 1000;
    const walking = a.path.length > 0 && a.state !== 'enter';
    const pose = this.climbing(a) ? 'walk' : poseFor(a.info.activity, idleFor, walking);
    const sp = spriteFor(a.traits, pose, t, a.facing, a.phase);
    const left = Math.round(a.x) + sp.dx;
    const top = Math.round(a.y) - SPRITE_H + 1 + sp.dy;
    const born = a.state === 'enter' ? Math.min(1, (now - a.bornAt) / ENTER_MS) : 1;
    for (let row = 0; row < SPRITE_H; row++) {
      for (let col = 0; col < SPRITE_W; col++) {
        const cell = sp.cells[row][col];
        if (!cell) continue;
        if (born < 1 && noise(row * 7 + col, a.phase) > born) continue;
        const x = left + col;
        const y = top + row;
        if (this.inRect(x, y)) s.put(x, y, cell.ch, cell.fg, cell.bg);
      }
    }
  }

  // Name tags and speech bubbles, placed so they never overlap: the selected
  // agent claims space first, then the freshest bubbles. A label that
  // collides tries one row higher, otherwise it is skipped (the roster still
  // lists everyone).
  private drawLabels(s: Screen, actors: Actor[], now: number, selectedId: string | null, t: number): void {
    const r = this.rect;
    const pal = this.theme.palette;
    const taken: Array<[number, number, number]> = [];
    const free = (y: number, x0: number, x1: number) =>
      y >= r.y && !taken.some(([ty, a, b]) => ty === y && x0 < b + 1 && a < x1 + 1);
    const order = [...actors].sort((m, n) => {
      if (m.info.id === selectedId) return -1;
      if (n.info.id === selectedId) return 1;
      return n.bubbleUntil - m.bubbleUntil;
    });
    for (const a of order) {
      const selected = a.info.id === selectedId;
      const cx = Math.round(a.x) + 2;
      const top = Math.round(a.y) - SPRITE_H + 1;
      const fit = (w: number) => Math.max(r.x, Math.min(r.x + r.w - w, cx - Math.floor(w / 2)));
      const place = (text: string, ys: number[]): [number, number] | null => {
        const w = [...text].length;
        const x = fit(w);
        for (const y of ys) {
          if (free(y, x, x + w)) {
            taken.push([y, x, x + w]);
            return [x, y];
          }
        }
        return null;
      };
      const name = clip(a.info.name, 10);
      const tag = place(name, selected ? [top - 1, top - 2, top - 3] : [top - 1, top - 2]);
      if (tag) {
        const fg = selected ? pal.panel : a.traits.color;
        const bg = selected ? a.traits.color : pal.panel;
        s.text(tag[0], tag[1], name, fg, bg, BOLD, r.x + r.w);
      }
      if ((selected || now < a.bubbleUntil) && a.info.detail) {
        const text = ` ${clip(a.info.detail, 26)} `;
        const base = tag ? tag[1] : top - 1;
        const spot = place(text, [base - 1, base - 2]);
        if (spot) {
          s.text(spot[0], spot[1], text, pal.bubbleText, pal.bubble, 0, r.x + r.w);
          if (selected && spot[1] - 1 >= r.y && Math.floor(t * 2) % 2 === 0) s.put(cx, spot[1] - 1, '▼', a.traits.color);
        }
      }
    }
  }
}
