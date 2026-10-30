import type { Activity, AgentInfo } from '../agents.ts';
import type { Pen } from '../art/types.ts';
import { clip } from '../claude/activity.ts';
import { roleOf, unlocks } from '../pet/crew.ts';
import { feelOf, meters } from '../pet/meters.ts';
import type { RGB } from '../term/color.ts';
import { mix, scale } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { activityColor, activityGlyph } from '../ui/chrome.ts';
import type { WorldDef } from '../worlds/types.ts';
import { workstationOf } from '../worlds/workstation.ts';
import { Works } from './build.ts';
import type { Construction, Disc } from './build.ts';
import { poseFor, traitsFor } from './character.ts';
import type { Feel, Pose, Traits, Wear } from './character.ts';
import { Critter } from './critter.ts';
import type { BuildFrame, Camera, DeskFrame, FigureFrame, LabelFrame, SceneFrame, Screen as DeskScreen, Trinket, TrinketFrame } from './frame.ts';
import { EMOTE, FIGURE_H, HOP, MUG_TOP, figureTop, project } from './frame.ts';
import { hub, planLayout, slotRect, yard } from './layout.ts';
import type { Rect as Box } from './layout.ts';
import { Life, SLEEP_AFTER, faceToward, newMind } from './life.ts';
import type { Look, Mind } from './life.ts';
import { smoke, updateParticles } from './particles.ts';
import { NavGrid, smooth } from './path.ts';
import { Rng, hashString } from './rng.ts';
import { NAV_CELL, NAV_PAD, footprint, heightAt, planRoom, toWorld } from './room.ts';
import type { Room } from './room.ts';
import type { Desk, Facing, Layout, Particle, Poi, Slot, Spot, StationKind } from './types.ts';

// A terminal cell in pixels when the terminal has not said (common sizes);
// also the nominal cell rooms are planned for (see layout).
const CELL = { w: 10, h: 20 };
// The room is planned so that, fitted to a scene of nominal cells, a unit
// is about this many canvas pixels.
const PX_PER_UNIT = 4;
const FIT_MARGIN = 4; // units round the room when it is fitted to the scene
// Zoom steps for + and -, times the fitted scale; never past MAX_S.
const ZOOMS = [1, 1.5, 2, 3, 4];
const MAX_S = 24; // canvas pixels per unit at most
const CLOSE_UP = 2; // the zoom on a selected agent

const WALK = 22; // units per second
// Long trips go at up to JOG times a walk, easing back to a walk as the
// last JOG_OVER units come up; rooms wider than JOG_ROOM are crossed that
// many times faster again, so a trip takes about the same time on screen.
const JOG = 1.5;
const JOG_OVER = 20;
const JOG_ROOM = 128;
// Strides quicken with the pace, up to this many times a walk's, so a jog
// doesn't slide the feet.
const GAIT_MAX = 1.6;
const ENTER_MS = 700;
const BUBBLE_MS = 1500; // a detail shows in a bubble this long after it changes
const MAX_BUBBLES = 3;
// Labels keep their row over the head until blocked this long, and drift
// back down once the row under them has been clear as long; loud ones
// (selection, error, change, finish) move at once and drift back sooner.
const LABEL_HOLD_MS = 500;
const LOUD_BACK_MS = 300;
// In a crowd, counted in terminal columns and rows: a quiet label shrinks
// to its activity glyph when another head is nearer than CROWD, and no
// more than BAND.max names or bubbles stand within BAND of one another (a
// 16-column band), the lowest in priority shrinking to its glyph. Quiet
// labels use the two rows over the head, loud ones three.
const CROWD = { cols: 9, rows: 4 };
const BAND = { cols: 8, rows: 4, max: 3 };
const ERROR_MS = 5000; // an error stays on show this long, whatever comes next
const SMOKE_MS = 4000;
// A working activity sends a roaming agent to its workstation only once it
// has lasted this long; in between the pose changes in place.
const SETTLE_MS = 3000;
// A workstation grows out of the floor, or shrinks back into it, this long
// (seconds); one left empty stands this long before it goes.
export const POP_S = 0.5;
export const EMPTY_S = 4;
// Where one sharing a workstation stands (every place taken): (along it,
// out from it) off its owner's spot, in units, the first free one; a step
// past either end (halfway to the next desk of a row), then half a step
// further out, in front of the gaps, then further out again; all those
// taken, on rings round it further out, the front half first. Free: on
// the floor, in view and WORK_APART from where anyone else stands or is
// going (see share).
const RING = (r: number, from: number, to: number) =>
  Array.from({ length: 9 }, (_, i) => {
    const a = from + ((to - from) * i) / 8;
    return [Math.round(r * Math.cos(a) * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10] as const;
  });
const SIDES: ReadonlyArray<readonly [number, number]> = [
  [5, 0], [-5, 0], [2.5, 4], [-2.5, 4], [7.5, 4], [-7.5, 4], [0, 8], [5, 8], [-5, 8],
  ...[6, 8, 10, 12].flatMap((r) => RING(r, 0, Math.PI)),
  ...[8, 10, 12].flatMap((r) => RING(r, Math.PI, 2 * Math.PI).slice(1, -1)),
];
export const WORK_APART = 4;
// Where a crowd at one prop stands (those asleep at the idle prop): (along
// the wall, further out), in lane steps. A line along the wall (across the
// screen in front of a prop out on the floor), the middle and then out to
// either side; then a row a step further out, in the gaps of the first;
// then a third. All within 2.5 steps of the prop's spot, so everyone still
// reads as there: past these, a crowd overlaps a little.
const LANES: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0.5, 1], [-0.5, 1], [1.5, 1], [-1.5, 1], [1, 2], [-1, 2]];
// A lane step: about a figure's width on screen, in units.
export const LANE = 10;
// A lane closer than this on screen to someone already at the prop (where
// clamping to the floor lands two lanes together) is passed over.
const LANE_APART = 5;
// Walkers detouring through the hub keep this many units to one side of it
// (which side hashed from the id), so the traffic forms two lanes.
const HUB_LANE = 3;
// Poses done with the back to the viewer, facing the prop: the work, and
// the beats at it that look its way (a glance, a lean, a tap; a scratch
// and a stretch turn to us).
const FACES_STATION = new Set<Pose>(['write', 'read', 'search', 'web', 'run', 'think', 'glance', 'lean', 'tap']);
const MAX_EMOTES = 3; // shown at once
// A happy agent's bounce: HOP high (units), a hop a step while walking,
// one every HOP_IDLE seconds standing about.
const HOP_WALK = 0.25;
const HOP_IDLE = 0.5;
// Desk upgrades by role (picked by a hash of crew and role), and how often
// they are worked out again (seconds) when nothing says so sooner.
const TRINKETS: readonly Trinket[] = ['plant', 'mug', 'trophy'];
const TRINKETS_EVERY = 0.5;
// A level-up's ★N! rises this long (seconds), its figure's emotes kept
// down meanwhile; how opaque its pill is.
const WORD_S = 3;
const WORD_PILL = 0.9;
// A build's ghost: a cool complement of the world (cyan in a warm one,
// amber in a cold one).
const GHOST_HUE: { warm: RGB; cold: RGB } = { warm: [127, 232, 255], cold: [255, 179, 71] };

export type Actor = {
  info: AgentInfo;
  traits: Traits;
  phase: number;
  x: number;
  y: number;
  path: Spot[];
  station: Slot | Desk | null; // where it works: a station of the room's (asleep at the idle prop), or a workstation
  lane: number; // which spot there (see LANES; at a workstation, 0 its own, k the k-th of SIDES)
  state: 'enter' | 'walk' | 'work' | 'leave';
  facing: Facing;
  bornAt: number;
  bubbleUntil: number;
  gone: boolean;
  fx: number; // seconds since the last activity effect
  order: number;
  boomed: number; // `since` of the error that last went bang
  error: { until: number; text: string; x: number; y: number } | null; // the last error, on show for a while
  cheered: number; // `since` of the finish last celebrated
  gait: number; // seconds its strides have run ahead of the clock (jogging)
  mind: Mind; // what it is up to between the work (see life.ts)
  hush: number; // no emote shows over it until then (stage clock: a level-up's word rises)
};

// Letters drifting up as terminal text (z's of a sleeper, a '!' on errors,
// ★N! on a level-up, on a pill: see wordOf).
type Glyph = { x: number; y: number; z: number; vz: number; ch: string; color: RGB; life: number };

// A crew role's key: its crew and role (see pet/crew.ts).
const roleKey = (a: AgentInfo) => `${a.crew}\n${roleOf(a)}`;

// The team an agent is in: its lead's id (its own for a lead, or for one
// whose lead is not known).
const teamOf = (a: AgentInfo) => (a.role === 'lead' ? a.id : (a.parentId ?? a.id));

// A workstation up on a desk (see desks.ts): whose it is (null once left
// empty), who had it last, when it went up and when it was left (stage
// clock; Infinity while it is someone's).
export type Workstation = { desk: Desk; owner: string | null; was: string; born: number; left: number };

// What a workstation's screen shows for its agent's activity.
export function screenFor(a: Activity): DeskScreen {
  switch (a) {
    case 'write':
    case 'read':
    case 'search':
    case 'run':
    case 'web':
    case 'think':
      return a;
    case 'talk':
    case 'delegate':
      return 'talk';
    default:
      return 'off';
  }
}

// What a level lets one wear (nothing at ★1), one object a level.
const wears = new Map<number, Wear | undefined>();
function wearAt(level: number): Wear | undefined {
  if (!wears.has(level)) {
    const u = unlocks(level);
    wears.set(level, level < 2 ? undefined : { hat: u.hat, badge: u.badge, outfit: u.outfit, aura: u.aura });
  }
  return wears.get(level);
}

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

// The scene's model: an illustrated room with agents as characters, each
// with a workstation of its own that pops up when it walks in (on a place
// the room planned, see desks.ts; at a teammate's side when every place is
// taken), where it does all its work, living a little in between (see
// life.ts): wandering, chatting, building, napping at the idle prop.
// Nothing is drawn here but the labels (terminal text); `frame` hands a
// renderer everything else.
export class Stage {
  private world: WorldDef;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cell = { ...CELL };
  // Lighting (lamp light, glows); off asks the scene for flat colours.
  lit = true;

  private L: Layout | null = null;
  private plan: Room | null = null;
  private worldKey = '';
  // The camera: the view's top-left in screen units (x - y, (x + y) / 2 - z),
  // eased; the zoom (times the fitted scale, eased) and the one asked for
  // with +/- (null = auto: fit the room, or a close-up on the selection).
  private cam = { u: 0, v: 0, set: false };
  private zoom = 1;
  private zoomWant: number | null = null;
  private camera: Camera | null = null; // as of the last frame

  private cast = new Map<string, Actor>();
  private particles: Particle[] = [];
  private glyphs: Glyph[] = [];
  private rng = new Rng(1234);
  private clock = 0;
  private now = 0;
  private seq = 0;
  private placedLabels: Array<{ x: number; y: number; w: number }> = [];
  // Emotes over heads in the last frame.
  emotesShown = 0;
  // Each label's row above the head, and since when it has been blocked.
  private rows = new Map<string, { off: number; blocked: number; clear?: number }>();

  readonly life: Life;
  private works: Works | null = null;
  private critter: Critter | null = null;
  // The workstations up, by desk index, and a count that moves on whenever
  // one goes up or down (walkers re-plan round it).
  private desks = new Map<number, Workstation>();
  private desksVer = 0;
  private desksSeen = 0;
  // The desk upgrades as they stand.
  private trinkets: TrinketFrame[] = [];
  // The upgrades are due to be worked out again (the cast, a level or the
  // room changed), and when they last were.
  private trinketsDue = true;
  private trinketsAt = -Infinity;
  // The steam off mugs draws on its own chance, so whether one stands
  // shifts nothing else the stage draws.
  private steam = new Rng(0x57ea);
  private spots: Poi[] = [];
  private nav: NavGrid | null = null;
  private navKey = '';
  private blocks: { discs: Disc[]; rects: Box[] } = { discs: [], rects: [] };
  private blocksAt = -1;

  constructor(world: WorldDef) {
    this.world = world;
    this.life = new Life({
      walk: (a, to) => this.walkOff(a, to),
      standable: (s) => this.standable(s),
      nap: (a) => this.retarget(a),
      leave: (a) => {
        a.state = 'leave';
        this.retargetExit(a);
      },
      idleFor: (a) => this.idleFor(a),
      spawn: (p) => this.add(p),
      occupied: (x, y, z) => this.occupied(x, y, z),
      back: (a) => this.retarget(a),
      yard: () => (this.L ? yard(this.L) : null),
    });
  }

  // Office life (huddles, coffee runs, high-fives, stand-ups; see life.ts)
  // on or off.
  get office(): boolean {
    return this.life.office;
  }

  set office(on: boolean) {
    this.life.setOffice(on);
  }

  // The terminal's cell size in pixels (the canvas is the scene's cells at
  // this size): the room stays as it is (see layout), refitted to the
  // canvas. Whether the size changed.
  setCell(w: number, h: number): boolean {
    if (w === this.cell.w && h === this.cell.h) return false;
    this.cell = { w, h };
    this.layout(this.rect);
    return true;
  }

  get cellSize(): { w: number; h: number } {
    return { ...this.cell };
  }

  // Cells taken by labels and bubbles in the last frame.
  labels(): Array<{ x: number; y: number; w: number }> {
    return this.placedLabels;
  }

  setTheme(world: WorldDef): void {
    this.world = world;
    this.worldKey = '';
    this.layout(this.rect);
  }

  stations(): Slot[] {
    return this.L?.slots ?? [];
  }

  // The workstations up, in desk order.
  workstations(): Workstation[] {
    return [...this.desks.values()].sort((a, b) => a.desk.index - b.desk.index);
  }

  // The furnished room (for renderers, tests and tools).
  room(): Room | null {
    return this.plan;
  }

  // What characters build, where idle ones like to go, and the critter.
  builds(): Construction[] {
    return this.works?.builds ?? [];
  }

  pois(): Poi[] {
    return this.spots;
  }

  pet(): Critter | null {
    return this.critter;
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

  // The user cheers an agent on: it throws its arms up, a heart over it.
  cheer(id: string): void {
    const a = this.cast.get(id);
    if (!a) return;
    this.life.gesture(a, 'cheer', 1.2);
    this.life.emote(a, 'heart', 2);
  }

  // Its role reached `level`: a shower of the world's confetti, as a
  // finish has, ★N! rising over its head (where an emote would be: none
  // shows over it while the word rises, so nothing hides it), and it
  // cheers, unless it is hauling a block (it keeps hold of that).
  levelUp(id: string, level: number): void {
    const a = this.cast.get(id);
    if (!a || !this.L) return;
    this.burst(a);
    this.glyphs.push({ x: a.x, y: a.y, z: this.top(a) + 3, vz: 2.2, ch: `★${level}!`, color: this.world.palette.warn, life: WORD_S });
    a.mind.emote = null;
    a.hush = this.clock + WORD_S;
    if (!this.life.carrying(a)) this.life.gesture(a, 'cheer', 1.4);
  }

  layout(r: Rect): void {
    this.rect = r;
    // Nothing to show: keep the room as it is.
    if (r.w <= 0 || r.h <= 0) return;
    // The room goes by the terminal's size in cells, not its pixels: it is
    // planned for nominal cells (CELL), so a HiDPI screen (cells of 19 x 42
    // pixels, say) shows the same room as a 10 x 20 one, just sharper; the
    // fit (fitScale) maps it to the real pixels. Planned from the pixels,
    // a 2x screen got a room twice the size, too big and empty.
    const L = planLayout((r.w * CELL.w) / PX_PER_UNIT, (r.h * CELL.h) / PX_PER_UNIT, this.world.id);
    const key = `${this.world.id}:${L.W}x${L.D}x${L.H}`;
    if (key !== this.worldKey) {
      this.build(L, key);
      // A new room: everyone's workstation is up in it already, in order
      // of arrival.
      for (const a of [...this.cast.values()].sort((p, q) => p.order - q.order)) if (a.state !== 'leave') this.claim(a, true);
    }
    this.trinketsDue = true;
    this.cam.set = false;
    this.camera = this.aim([], null, false);
    for (const a of this.cast.values()) {
      Object.assign(a, this.clampToFloor(a));
      a.station = null;
      a.path = [];
      this.life.end(a);
      if (a.state === 'enter') Object.assign(a, this.door()?.spot ?? {});
      if (a.state === 'leave') this.retargetExit(a);
      else this.retarget(a);
    }
  }

  // Furnishes a fresh room for the layout and plans where life goes on in it.
  private build(L: Layout, key: string): void {
    this.worldKey = key;
    this.L = L;
    const seed = hashString(this.world.id);
    this.plan = planRoom(this.world, L, seed);
    this.particles = [];
    this.glyphs = [];
    this.works = new Works(L, { colors: this.world.build.colors, shape: this.world.build.shape }, new Rng(seed ^ 0xb111d), this.plan.supply);
    this.blocksAt = -1;
    this.nav = null;
    this.desks.clear();
    this.desksVer++;
    this.spots = this.plan.pois;
    const home = this.spots.find((p) => p.kind === 'pet');
    const g = Math.max(0, Math.min(1, (L.W - 72) / 98));
    this.critter = home ? new Critter({ kind: this.world.critter.kind, body: this.world.critter.body }, home, 6 + 4 * g, seed ^ 0xca7) : null;
    this.life.setWorld(this.spots, this.works, this.critter, this.cast.values());
  }

  private door(): Slot | undefined {
    return this.L?.slots.find((s) => s.kind === 'entrance');
  }

  private clampToFloor(s: Spot): Spot {
    const L = this.L;
    if (!L) return { x: s.x, y: s.y };
    return { x: Math.max(L.T + 1, Math.min(L.W - 2, s.x)), y: Math.max(L.T + 1, Math.min(L.D - 2, s.y)) };
  }

  // Builds and material piles to walk round (refreshed when they change).
  private obstacles(): { discs: Disc[]; rects: Box[] } {
    const ver = this.works?.version ?? -1;
    if (ver !== this.blocksAt) {
      this.blocksAt = ver;
      this.blocks = this.works?.obstacles() ?? { discs: [], rects: [] };
    }
    return this.blocks;
  }

  // Inside some prop's footprint (a station or decor), a workstation, a
  // build or a pile (grown by `margin`).
  private inside(s: Spot, margin: number): boolean {
    for (const p of this.plan?.props ?? []) {
      const r = footprint(p);
      if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    }
    for (const w of this.desks.values()) {
      const r = slotRect(w.desk);
      if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    }
    const o = this.obstacles();
    for (const d of o.discs) if (Math.hypot(s.x - d.x, s.y - d.y) < d.r + margin) return true;
    for (const r of o.rects) if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    return false;
  }

  // A build, a pile or a workstation appeared (or went): walkers re-plan
  // round it (one bound for where it now stands stops beside it), those
  // still coming in too (a crowd in one poll set off before the last of
  // their workstations went up), and anyone standing where it now is
  // steps out of the way.
  private makeWay(): void {
    this.desksSeen = this.desksVer;
    for (const a of this.cast.values()) {
      if (a.path.length) {
        const to = a.path[a.path.length - 1];
        this.walkTo(a, this.inside(to, 0.3) ? (this.nearestStandable(to) ?? to) : to);
      } else if (a.state !== 'enter' && this.inside(a, 0.3)) {
        const out = this.nearestStandable(a);
        if (out) a.path = [out];
      }
    }
  }

  // The closest spot round `s` where a character may stand.
  private nearestStandable(s: Spot): Spot | null {
    for (let d = 1; d <= 16; d += 1) {
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2;
        const p = { x: s.x + Math.cos(ang) * d, y: s.y + Math.sin(ang) * d };
        if (this.standable(p)) return p;
      }
    }
    return null;
  }

  // Somewhere a character may stand: on the floor, clear of everything.
  private standable(s: Spot): boolean {
    const L = this.L;
    if (!L || s.x < L.T + 1 || s.y < L.T + 1 || s.x > L.W - 2 || s.y > L.D - 2) return false;
    return !this.inside(s, 1.2);
  }

  // In view: nothing just in front (toward the camera, along +x +y) tall
  // enough to hide most of whoever stands there. A lane spot can land
  // anywhere along the wall.
  private level(s: Spot): boolean {
    const room = this.plan;
    if (!room) return true;
    for (let dy = 0; dy <= FIGURE_H; dy++) {
      for (let dx = dy ? 0 : 1; dx <= FIGURE_H; dx++) {
        // Across the middle of the figure, taller than a third of it.
        if (Math.abs(dx - dy) > 3) continue;
        if (this.tall(s.x + dx, s.y + dy) > (dx + dy) / 2 + 5) return false;
      }
    }
    return true;
  }

  // How tall what stands over (x, y) is: a prop, or a workstation.
  private tall(x: number, y: number): number {
    let h = heightAt(this.plan!, x, y);
    for (const w of this.desks.values()) {
      const r = slotRect(w.desk);
      if (x >= r.x0 && x < r.x1 && y >= r.y0 && y < r.y1) h = Math.max(h, workstationOf(this.world).height);
    }
    return h;
  }

  private idleFor(a: Actor): number {
    return (this.now - a.info.since) / 1000;
  }

  // Someone stands in the unit block at (x, y, z).
  private occupied(x: number, y: number, z: number): boolean {
    if (z < -1 || z >= FIGURE_H) return false;
    for (const a of this.cast.values()) {
      if (Math.abs(x + 0.5 - a.x) < 1.3 && Math.abs(y + 0.5 - a.y) < 1.3) return true;
    }
    return false;
  }

  // Due at its workstation: at work a moment (the activity has lasted),
  // and not at a workstation (its own, or a teammate's) nor on its way.
  private moving(a: Actor, now: number): boolean {
    if (a.state === 'leave' || !this.L || this.life.huddled(a)) return false;
    const kind = stationKindFor(a.info.activity);
    if (!kind || kind === 'idle' || a.station?.kind === 'desk') return false;
    return now - a.info.since >= SETTLE_MS;
  }

  // Where the activity takes it: at work, to its workstation; waiting,
  // free to roam, or once asleep to the idle prop.
  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind || !this.L) return;
    if (kind !== 'idle') {
      this.toDesk(a);
      return;
    }
    if (this.idleFor(a) < SLEEP_AFTER) {
      // Awake and waiting: free to roam (life.ts decides where).
      if (a.station) {
        a.station = null;
        a.path = [];
      }
      return;
    }
    const st = this.L.slots.find((p) => p.kind === kind);
    if (!st) return;
    if (a.station === st && a.path.length === 0 && a.state === 'work') return;
    const others = [...this.cast.values()].filter((o) => o !== a && o.station === st);
    const taken = new Set(others.map((o) => o.lane));
    // Where the others stand, or are on the way to: at this prop, and at
    // the rest.
    const dest = (o: Actor): Spot => o.path[o.path.length - 1] ?? o;
    const there = others.map(dest);
    const near = [...this.cast.values()].filter((o) => o !== a && o.station && o.station !== st).map(dest);
    // Along the wall; out on the floor, across the screen in front of the
    // prop (along +x -y), a row further out a step down the screen, so no
    // one stands beside or behind it.
    const spotFor = (k: number): Spot => this.laneSpot(st, k);
    const gap = (s: Spot, to: Spot[]) => Math.min(Infinity, ...to.map((o) => onScreen(s, o)));
    // The first free lane on bare floor clear of every prop that keeps a
    // step from everyone round it and off the other props' own spots; then
    // the first a step from the others there and off those spots; then a
    // step from the others there; then one not on top of them (LANE_APART:
    // clamping to the floor lands lanes together); then the one furthest
    // from them, clear if any is. With every lane taken, any.
    const free = [...LANES.keys()].filter((k) => !taken.has(k));
    const lanes = (free.length ? free : [...LANES.keys()]).map((k) => ({ k, s: spotFor(k) }));
    // (Clamped to the floor, an island's lane can end up beside it.)
    const before = (s: Spot) => !st.island || s.x + s.y >= st.spot.x + st.spot.y - 1;
    const clear = lanes.filter((l) => !this.inside(l.s, 1.5) && this.level(l.s) && before(l.s));
    const props = this.L.slots.filter((p) => p !== st).map((p) => p.spot);
    const mates = (l: { k: number; s: Spot }) => gap(l.s, there) >= LANE;
    const own = (l: { k: number; s: Spot }) => l.k === 0 || gap(l.s, props) >= LANE;
    const pick =
      clear.find((l) => mates(l) && own(l) && gap(l.s, near) >= LANE) ??
      clear.find((l) => mates(l) && own(l)) ??
      clear.find(mates) ??
      clear.find((l) => gap(l.s, there) >= LANE_APART) ??
      [...(clear.length ? clear : lanes)].sort((p, q) => gap(q.s, there) - gap(p.s, there))[0];
    a.station = st;
    a.lane = pick.k;
    this.walkTo(a, pick.s);
    if (a.state === 'work') a.state = 'walk';
  }

  // ── workstations ──────────────────────────────────────────────────────
  // Whether desk d is free to take: no workstation on it, or one left
  // empty that has not begun to go.
  private open(d: Desk): boolean {
    const w = this.desks.get(d.index);
    return !w || (w.owner === null && this.clock - w.left < EMPTY_S);
  }

  private ownDesk(a: Actor): Workstation | null {
    for (const w of this.desks.values()) if (w.owner === a.info.id) return w;
    return null;
  }

  // A place for a's workstation (see claim): the one it left a moment ago
  // if it is still there; for a lead (or a subagent whose lead is not in
  // the room), the lead's place of a pod nobody is in (with more in the
  // room than places, one with room in front for its team to share it
  // first, see roomy), else of any pod, else the free place nearest the
  // way in; for a subagent, the place in its lead's pod nearest its
  // lead's, else the free place nearest its lead's (sparing the lead's
  // places of pods nobody is in); null when every place is taken.
  private placeFor(a: Actor): Desk | null {
    const all = this.plan?.desks ?? [];
    const free = all.filter((d) => this.open(d));
    if (!free.length) return null;
    const back = free.find((d) => this.desks.get(d.index)?.was === a.info.id);
    if (back) return back;
    const empty = (pod: number) => all.every((d) => d.pod !== pod || this.open(d));
    const by = (p: Spot) => (x: Desk, y: Desk) => Math.hypot(x.spot.x - p.x, x.spot.y - p.y) - Math.hypot(y.spot.x - p.x, y.spot.y - p.y);
    const door = this.door()?.spot ?? { x: 0, y: 0 };
    const lead = this.cast.get(teamOf(a.info));
    if (!lead || lead === a) {
      const pods = free.filter((d) => d.lead && empty(d.pod));
      const short = [...this.cast.values()].filter((o) => o.state !== 'leave' && !o.gone).length > all.length;
      return (short ? pods.find((d) => this.roomy(d)) : undefined) ?? pods[0] ?? free.find((d) => d.lead) ?? [...free].sort(by(door))[0];
    }
    const home = this.ownDesk(lead)?.desk;
    const from: Spot = home?.spot ?? lead;
    const pod = home ? free.filter((d) => d.pod === home.pod) : [];
    if (pod.length) return [...pod].sort(by(from))[0];
    const spare = free.filter((d) => !(d.lead && empty(d.pod)));
    return [...(spare.length ? spare : free)].sort(by(from))[0];
  }

  // Whether desk d leaves room in front for those sharing it: the first
  // row out beside it (see SIDES) on the floor, not past the front cut (a
  // place right at the front has only its ends).
  private roomy(d: Desk): boolean {
    const L = this.L!;
    const [, out] = SIDES[2];
    return d.wall === 'right' ? d.spot.y + out <= L.D - 2 : d.spot.x + out <= L.W - 2;
  }

  // Puts up a workstation for `a` on a free place, if it has none and there
  // is one: it pops up out of the floor with a puff (at once if `quick`).
  // Its own, or null.
  private claim(a: Actor, quick = false): Workstation | null {
    const had = this.ownDesk(a);
    if (had || !this.plan) return had;
    const d = this.placeFor(a);
    if (!d) return null;
    let w = this.desks.get(d.index);
    if (!w) {
      w = { desk: d, owner: null, was: '', born: quick ? -Infinity : this.clock, left: Infinity };
      this.desks.set(d.index, w);
      this.deskMoved(d);
      if (!quick) this.poof(d);
    }
    w.owner = a.info.id;
    w.left = Infinity;
    this.trinketsDue = true;
    return w;
  }

  // A workstation went up or down: routes round it again (only its cells).
  private deskMoved(d: Desk): void {
    this.desksVer++;
    const r = slotRect(d);
    const pad = NAV_PAD + NAV_CELL;
    this.nav?.rerate(r.x0 - pad, r.y0 - pad, r.x1 + pad, r.y1 + pad, (x, y) => this.rate(x, y));
  }

  // Workstations follow their agents: one whose agent is leaving or gone
  // is left empty; one left empty for EMPTY_S shrinks away with a puff and
  // is gone POP_S later. Those without one of their own then take a place
  // come free (a sharer walks over to its own); those sharing one whose
  // agent left find another.
  private upkeep(dt: number): void {
    let freed = false;
    for (const [i, w] of this.desks) {
      if (w.owner) {
        const o = this.cast.get(w.owner);
        if (o && o.state !== 'leave' && !o.gone) continue;
        w.was = w.owner;
        w.owner = null;
        w.left = this.clock;
        this.trinketsDue = true;
        freed = true;
        continue;
      }
      const t = this.clock - w.left;
      if (t >= EMPTY_S && t - dt < EMPTY_S) this.poof(w.desk);
      if (t >= EMPTY_S + POP_S) {
        this.desks.delete(i);
        this.deskMoved(w.desk);
        freed = true;
      }
    }
    if (!freed) return;
    for (const a of [...this.cast.values()].sort((p, q) => p.order - q.order)) {
      if (a.state === 'leave' || a.gone) continue;
      const own = this.ownDesk(a) ?? this.claim(a);
      const at = a.station?.kind === 'desk' ? this.desks.get(a.station.index) : undefined;
      // working elsewhere than its own, or at one nobody has now
      if (a.station?.kind === 'desk' && (own ? a.station !== own.desk : !at?.owner)) this.retarget(a);
    }
  }

  // To its workstation: its own (put up now if a place is free), else at a
  // teammate's side (see share).
  private toDesk(a: Actor): void {
    const own = this.ownDesk(a) ?? this.claim(a);
    const to = own ? { desk: own.desk, spot: own.desk.spot, lane: 0 } : this.share(a);
    if (!to) return;
    if (a.station === to.desk && a.lane === to.lane && (a.path.length || a.state === 'work')) return;
    a.station = to.desk;
    a.lane = to.lane;
    this.walkTo(a, to.spot);
    if (a.state === 'work') a.state = 'walk';
  }

  // Where `a` stands sharing a workstation: beside a teammate's (the one
  // with the fewest at its side, nearest its lead) on the first of SIDES
  // free there in view, else out of view (see beside); else the same by
  // anyone's; where it shares already, while that still holds; with none
  // free at all, the workable one furthest from everyone. Null when no
  // workstation is up.
  private share(a: Actor): { desk: Desk; spot: Spot; lane: number } | null {
    const team = teamOf(a.info);
    const up = [...this.desks.values()].filter((w) => w.owner && w.owner !== a.info.id);
    if (!up.length) return null;
    const teamAt = (w: Workstation) => {
      const o = this.cast.get(w.owner!);
      return o ? teamOf(o.info) : w.owner;
    };
    const sharers = (w: Workstation) => [...this.cast.values()].filter((o) => o !== a && o.station === w.desk && o.lane > 0).length;
    const lead = this.cast.get(team) ?? a;
    const far = (w: Workstation) => Math.hypot(w.desk.spot.x - lead.x, w.desk.spot.y - lead.y);
    const by = (p: Workstation, q: Workstation) => sharers(p) - sharers(q) || far(p) - far(q);
    const mates = up.filter((w) => teamAt(w) === team).sort(by);
    const others = up.filter((w) => teamAt(w) !== team).sort(by);
    const now = a.station?.kind === 'desk' ? up.find((w) => w.desk === a.station) : undefined;
    if (now && a.lane > 0 && this.beside(now.desk, a, a.lane, true)) return { desk: now.desk, spot: this.sideSpot(now.desk, a.lane), lane: a.lane };
    for (const pool of [mates, others]) {
      for (const seen of [true, false]) {
        for (const w of pool) {
          for (let k = 1; k <= SIDES.length; k++) if (this.beside(w.desk, a, k, seen)) return { desk: w.desk, spot: this.sideSpot(w.desk, k), lane: k };
        }
      }
    }
    // None free: the workable spot furthest from everyone, by a
    // teammate's if there is one there.
    for (const pool of [mates, others]) {
      let best: { desk: Desk; k: number; clear: number } | null = null;
      for (const w of pool) {
        for (let k = 1; k <= SIDES.length; k++) {
          if (!this.workable(w.desk, k)) continue;
          const clear = this.clearance(this.sideSpot(w.desk, k), a);
          if (!best || clear > best.clear) best = { desk: w.desk, k, clear };
        }
      }
      if (best) return { desk: best.desk, spot: this.sideSpot(best.desk, best.k), lane: best.k };
    }
    const first = mates[0] ?? others[0];
    return { desk: first.desk, spot: this.sideSpot(first.desk, 1), lane: 1 };
  }

  // The k-th spot beside workstation d (see SIDES), on the floor.
  private sideSpot(d: Desk, k: number): Spot {
    const [du, dv] = SIDES[k - 1];
    return this.clampToFloor(d.wall === 'right' ? { x: d.spot.x + du, y: d.spot.y + dv } : { x: d.spot.x + dv, y: d.spot.y + du });
  }

  // Whether `a` may stand at the k-th spot beside d: workable (see below), in
  // view (if `seen`), and WORK_APART from where anyone else stands or is
  // going.
  private beside(d: Desk, a: Actor, k: number, seen: boolean): boolean {
    const p = this.sideSpot(d, k);
    return this.workable(d, k) && (!seen || this.level(p)) && this.clearance(p, a) >= WORK_APART;
  }

  // Whether the k-th spot beside d is somewhere to work: clear of
  // everything, and not on the floor nobody works on (the way in, the
  // plazas, the yard, the spots idlers like, the stations' fronts: see
  // Room.keepOut).
  private workable(d: Desk, k: number): boolean {
    const p = this.sideSpot(d, k);
    const L = this.L!;
    return this.standable(p) && !this.plan!.keepOut[Math.floor(p.x) + L.W * Math.floor(p.y)];
  }

  // How far from `p` the nearest of the others stands, or is going.
  private clearance(p: Spot, a: Actor): number {
    let near = Infinity;
    for (const o of this.cast.values()) {
      if (o === a || o.state === 'leave' || o.gone) continue;
      const at = o.path[o.path.length - 1] ?? o;
      near = Math.min(near, Math.hypot(at.x - p.x, at.y - p.y));
    }
    return near;
  }

  // A puff of dust and a few sparkles where a workstation pops up or goes.
  private poof(d: Desk): void {
    const r = slotRect(d);
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const rng = this.rng;
    for (let i = 0; i < 8; i++) {
      this.add({ ...smoke(cx + rng.range(-3, 3), cy + rng.range(-1.5, 1.5), 0.5 + rng.next(), rng, [214, 206, 196]), life: 0.6 + rng.next() * 0.4 });
    }
    for (let i = 0; i < 10; i++) {
      const ang = (i / 10) * Math.PI * 2;
      this.add({ kind: 'glint', x: cx + Math.cos(ang) * 2, y: cy + Math.sin(ang) * 2, z: 3 + rng.next() * 4, vx: Math.cos(ang) * 3, vy: Math.sin(ang) * 3, vz: 3 + rng.next() * 3, life: 0.5 + rng.next() * 0.3, color: [255, 241, 184], glow: true, gravity: 0 });
    }
  }

  // Where the k-th of a crowd at `st` stands (see LANES and retarget).
  private laneSpot(st: Slot, k: number): Spot {
    const along = LANES[k][0] * LANE;
    const out = LANES[k][1] * LANE;
    if (st.island) return this.clampToFloor({ x: st.spot.x + along / 2 + out, y: st.spot.y - along / 2 + out });
    return this.clampToFloor(st.wall === 'right' ? { x: st.spot.x + along, y: st.spot.y + out } : { x: st.spot.x + out, y: st.spot.y + along });
  }

  private retargetExit(a: Actor): void {
    const door = this.door();
    a.station = null;
    if (door) this.walkTo(a, door.spot);
    else a.path = [];
  }

  // Life's errands: away from the station, on the way somewhere.
  private walkOff(a: Actor, to: Spot): void {
    a.station = null;
    a.lane = 0;
    this.walkTo(a, this.clampToFloor(to));
    if (a.state === 'work' && a.path.length) a.state = 'walk';
  }

  // Straight there; or through the hub when the straight line would cut
  // through a prop or a build; or, when that is blocked too, along a route
  // found round them.
  private walkTo(a: Actor, to: Spot): void {
    const L = this.L;
    const from = { x: a.x, y: a.y };
    if (!L || !this.clips(from, to)) {
      a.path = [to];
      return;
    }
    // Each walker passes the hub on its own side, across its way: two lanes
    // of traffic, not one file.
    const h = hub(L);
    const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const side = hashString(a.info.id) & 1 ? HUB_LANE : -HUB_LANE;
    const via = { x: h.x - ((to.y - from.y) / len) * side, y: h.y + ((to.x - from.x) / len) * side };
    for (const p of [via, h]) {
      if (!this.clips(from, p) && !this.clips(p, to)) {
        a.path = [p, to];
        return;
      }
    }
    a.path = this.route(from, to) ?? [to];
  }

  private clips(p: Spot, q: Spot): boolean {
    const n = Math.ceil(Math.hypot(q.x - p.x, q.y - p.y) / 0.5);
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (this.inside({ x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k }, 0.5)) return true;
    }
    return false;
  }

  // Round the props, the workstations, the builds and the piles, on a grid
  // of the room's floor built afresh when the builds change and re-rated
  // round a workstation as it goes up or down (see deskMoved).
  private route(from: Spot, to: Spot): Spot[] | null {
    const L = this.L;
    if (!L || !this.plan) return null;
    this.obstacles();
    const key = `${this.worldKey}:${this.works?.version ?? 0}`;
    if (!this.nav || this.navKey !== key) {
      this.navKey = key;
      this.nav = new NavGrid(L.T, L.T, L.W - 1, L.D - 1, NAV_CELL, (x, y) => this.rate(x, y));
    }
    const cells = this.nav.find(from, to);
    if (!cells) return null;
    return smooth(from, [...cells.slice(1, -1), to], (p, q) => !this.clips(p, q));
  }

  // A routing cell's rating (see NavGrid): inside something, near it, or open.
  private rate(x: number, y: number): number {
    return this.inside({ x, y }, 0.8) ? 2 : this.inside({ x, y }, NAV_PAD) ? 1 : 0;
  }

  sync(agents: AgentInfo[], now: number): void {
    this.now = now;
    const ids = new Set<string>();
    // Newcomers in order of arrival, leads before their subagents (a lead's
    // workstation goes up first, its team's round it); subagents that come
    // in together, a team at a time in turn (the first of each team, then
    // the second, ...), so where places run short each team has some. All
    // are in before any workstation goes up (see placeFor), and all theirs
    // are up before any of them sets off, so none plans its way (or a spot
    // at a teammate's side) where the next one's is about to stand.
    const fresh: Actor[] = [];
    for (const info of agents) if (!this.cast.has(info.id) && info.role === 'lead') fresh.push(this.spawn(info, now));
    const teams = new Map<string, AgentInfo[]>();
    for (const info of agents) {
      ids.add(info.id);
      const a = this.cast.get(info.id);
      if (!a) {
        teams.set(teamOf(info), [...(teams.get(teamOf(info)) ?? []), info]);
        continue;
      }
      if (a.info.agentType !== info.agentType || a.info.role !== info.role) {
        // Subagent metadata can arrive after the first sighting.
        a.traits = traitsFor(info.id, info.role, info.agentType);
      }
      const prev = a.info;
      if (prev.level !== info.level || roleKey(prev) !== roleKey(info)) this.trinketsDue = true;
      const changed = prev.activity !== info.activity || prev.detail !== info.detail;
      const kindChanged = stationKindFor(prev.activity) !== stationKindFor(info.activity);
      a.info = info;
      a.mind.exit = 0;
      if (changed) a.bubbleUntil = now + BUBBLE_MS;
      if (a.state === 'leave') {
        // Back after all: its workstation again (the one it left, if it
        // still stands).
        a.state = 'walk';
        this.life.end(a);
        this.claim(a);
        this.retarget(a);
        continue;
      }
      if (prev.activity !== info.activity) this.life.changed(a);
      else if (prev.detail !== info.detail) this.life.detail(a);
      // Off to the new prop once the change has lasted (see update).
      if (kindChanged && stationKindFor(info.activity) === 'idle') this.retarget(a);
    }
    const each = [...teams.values()];
    for (let k = 0; each.some((t) => k < t.length); k++) for (const t of each) if (k < t.length) fresh.push(this.spawn(t[k], now));
    for (const a of fresh) this.claim(a);
    for (const a of fresh) this.welcome(a);
    for (const a of this.cast.values()) {
      if (!ids.has(a.info.id) && a.state !== 'leave') {
        // Someone carrying a block sets it down before going.
        if (this.life.vanish(a)) continue;
        this.life.end(a);
        a.state = 'leave';
        this.retargetExit(a);
      }
    }
  }

  // A newcomer at the door.
  private spawn(info: AgentInfo, now: number): Actor {
    const at = this.door()?.spot ?? { x: 12, y: 12 };
    const a: Actor = {
      info,
      traits: traitsFor(info.id, info.role, info.agentType),
      phase: hashString(info.id) % 997,
      x: at.x,
      y: at.y,
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
      error: null,
      cheered: -1,
      gait: 0,
      mind: newMind(info.id, this.life.clock),
      hush: 0,
    };
    this.cast.set(info.id, a);
    this.trinketsDue = true;
    return a;
  }

  // A newcomer sets off (its workstation up, if a place was free), with a
  // sparkle at the door.
  private welcome(a: Actor): void {
    this.retarget(a);
    this.sparkle(a, 16, a.traits.color);
    this.life.arrived(a, this.cast.values());
  }

  update(dt: number, now: number): void {
    this.clock += dt;
    this.now = now;
    for (const a of this.cast.values()) {
      if (a.state === 'enter' && now - a.bornAt < ENTER_MS) continue;
      if (a.state === 'enter') a.state = a.path.length ? 'walk' : 'work';
      if (this.moving(a, now)) this.retarget(a);
      if (!this.life.holding(a)) this.move(a, dt);
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
      this.effects(a, dt, now);
    }
    this.life.update([...this.cast.values()], dt);
    this.upkeep(dt);
    this.tally();
    this.steamUp(dt);
    if ((this.works?.version ?? -1) !== this.blocksAt || this.desksVer !== this.desksSeen) this.makeWay();
    for (const [id, a] of this.cast) {
      if (!a.gone) continue;
      this.cast.delete(id);
      this.trinketsDue = true;
    }
    for (const g of this.glyphs) {
      g.z += g.vz * dt;
      g.life -= dt;
    }
    this.glyphs = this.glyphs.filter((g) => g.life > 0);
    this.emit(dt);
    updateParticles(this.particles, dt, this.L ?? undefined);
  }

  // The desk upgrades (worked out again when the cast, a level or the room
  // changed, else now and then), and a mug's steam.
  private tally(): void {
    const dt = this.clock - this.trinketsAt;
    if (this.trinketsDue || dt >= TRINKETS_EVERY) {
      this.trinkets = this.placeTrinkets();
      this.trinketsDue = false;
      this.trinketsAt = this.clock;
    }
  }

  // The desk upgrades (★5): one for each crew role here at that level, on
  // the workstation of the first of its agents that has one up (where the
  // world's workstation says, see WorkstationArt.top), a plant, a mug or a
  // trophy by its role, in that agent's colour.
  private placeTrinkets(): TrinketFrame[] {
    if (!this.L) return [];
    const out: TrinketFrame[] = [];
    const done = new Set<string>();
    const top = workstationOf(this.world).top;
    for (const a of this.actors()) {
      if (!a.info.crew || !unlocks(a.info.level ?? 1).desk) continue;
      const key = roleKey(a.info);
      const w = this.ownDesk(a);
      if (done.has(key) || !w || this.clock - w.born < POP_S) continue;
      done.add(key);
      const [x, y, z] = toWorld(w.desk, top[0], top[1], top[2]);
      out.push({ id: key, kind: TRINKETS[hashString(key) % TRINKETS.length], x, y, z, color: a.traits.color });
    }
    return out;
  }

  // Steam off the mugs (on their own chance, so whether one stands shifts
  // nothing else the stage draws).
  private steamUp(dt: number): void {
    const r = this.steam;
    for (const tk of this.trinkets) {
      if (tk.kind === 'mug' && r.next() < dt / 0.45) this.add({ ...smoke(tk.x, tk.y, (tk.z ?? 0) + MUG_TOP, r, [236, 232, 228], 'steam'), vz: 2.5, life: 1.3 });
    }
  }

  // Each prop that gives off bits (steam off a cup, sparks while worked)
  // spawns them in its own frame (u, v, z); they go into the room's.
  private emit(dt: number): void {
    const room = this.plan;
    const cam = this.camera;
    if (!room || !cam) return;
    const active = this.activeProps();
    room.props.forEach((p, i) => {
      const art = p.art;
      if (!art.emit) return;
      const view = {
        pen: QUIET_PEN,
        s: cam.s,
        at: (u: number, v: number, z: number) => project(cam, ...toWorld(p, u, v, z)),
        len: p.len,
        dep: p.dep,
        wall: p.wall,
        island: p.island,
        t: this.clock,
        active: active[i],
        seed: p.seed,
      };
      art.emit(view, dt, (q) => {
        const [x, y, z] = toWorld(p, q.x, q.y, q.z);
        const [vx, vy] = p.wall === 'right' ? [q.vx, q.vy] : [q.vy, q.vx];
        this.add({ ...q, x, y, z, vx, vy });
      });
    });
  }

  // Per room prop: someone works it (or, at the entrance, comes or goes).
  private activeProps(): boolean[] {
    const actors = [...this.cast.values()];
    return (this.plan?.props ?? []).map((p) => {
      const s = p.slot;
      if (!s) return false;
      if (s.kind === 'entrance') return actors.some((a) => (a.state === 'enter' || a.state === 'leave') && Math.hypot(a.x - s.spot.x, a.y - s.spot.y) < 8);
      return actors.some((a) => a.station === s && a.state === 'work');
    });
  }

  private move(a: Actor, dt: number): void {
    let left = 0;
    let at: Spot = a;
    for (const p of a.path) {
      left += Math.hypot(p.x - at.x, p.y - at.y);
      at = p;
    }
    const big = Math.max(1, (this.L?.W ?? 0) / JOG_ROOM);
    const jog = Math.max(1, Math.min(JOG * big, (left * big) / JOG_OVER));
    let budget = WALK * this.life.pace(a) * jog * dt;
    if (a.path.length) a.gait += dt * (Math.max(1, Math.min(GAIT_MAX, jog)) - 1);
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

  private sparkle(a: Spot, n: number, color: RGB): void {
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2;
      this.add({ kind: 'spark', x: a.x, y: a.y, z: 4 + this.rng.next() * 6, vx: Math.cos(ang) * 6, vy: Math.sin(ang) * 6, vz: 4 + this.rng.next() * 6, life: 0.6 + this.rng.next() * 0.4, color, glow: true, gravity: 10 });
    }
  }

  // What an agent's state does round it: an error goes bang (sparks and a
  // puff of smoke that keeps smoking), finishing sets off fireworks and a
  // shower of the world's confetti, delegating casts a bolt at the
  // subagent, long naps drift z's. Those around react (see life.ts).
  private effects(a: Actor, dt: number, now: number): void {
    a.fx += dt;
    const L = this.L;
    if (!L) return;
    const r = this.rng;
    const act = a.info.activity;
    const every = (s: number) => {
      if (a.fx < s) return false;
      a.fx = 0;
      return true;
    };
    const head = FIGURE_H - 2;
    const pal = this.world.palette;
    if (act === 'error' && a.boomed !== a.info.since && a.state !== 'enter') {
      a.boomed = a.info.since;
      // Toward the middle of the room, so the bang is in front of them; at
      // a prop out on the floor, behind them, away from the prop.
      const isle = a.station?.island ? a.station : null;
      const kx = isle ? (isle.wall === 'left' ? 7 : 0) : Math.sign(L.W * 0.55 - a.x) * 6;
      const ky = isle ? (isle.wall === 'right' ? 7 : 0) : Math.sign(L.D * 0.55 - a.y) * 6;
      const x = a.x + kx;
      const y = a.y + ky;
      for (let i = 0; i < 18; i++) {
        const ang = r.next() * Math.PI * 2;
        const sp = 5 + r.next() * 9;
        this.add({ kind: 'spark', x, y, z: 1, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 6 + r.next() * 10, life: 0.5 + r.next() * 0.5, color: r.pick<RGB>([[255, 214, 120], [255, 128, 48], pal.bad]), glow: true, gravity: 24 });
      }
      for (let i = 0; i < 10; i++) this.add(smoke(x + r.range(-2, 2), y + r.range(-2, 2), 1 + r.next() * 3, r, [96, 92, 98]));
      this.life.boom(x, y, a, this.cast.values());
      a.error = { until: now + ERROR_MS, text: a.info.detail || 'tool failed', x, y };
    }
    // A real error is followed at once by the next tool call: the spot
    // smokes and '!'s keep rising for a while anyway.
    const err = a.error && now < a.error.until ? a.error : null;
    if (err && now < err.until - ERROR_MS + SMOKE_MS && r.next() < dt * 14) {
      const grey = 70 + r.int(0, 40);
      this.add({ ...smoke(err.x + r.range(-1.5, 1.5), err.y + r.range(-1.5, 1.5), 1, r, [grey, grey - 4, grey + 2]), life: 1.6 + r.next() });
    }
    if ((act === 'error' || err) && r.next() < dt / 0.7) this.glyphs.push({ x: a.x, y: a.y, z: head + 4, vz: 4, ch: '!', color: pal.bad, life: 0.8 });
    // (after a high-five, if it is giving one: see life.ts)
    if (act === 'done' && a.cheered !== a.info.since && !this.life.fiving(a)) {
      a.cheered = a.info.since;
      this.burst(a);
      this.life.finished(a, this.cast.values());
    }
    if (act === 'delegate' && every(1.2)) {
      const sub = [...this.cast.values()].find((o) => o.info.parentId === a.info.id && o.state !== 'leave');
      if (sub) {
        this.add({ kind: 'bolt', x: a.x, y: a.y, z: head, vx: 0, vy: 0, vz: 6, life: 3, color: a.traits.color, glow: true, gravity: 0, target: { x: sub.x, y: sub.y, z: FIGURE_H * 0.6 } });
        this.life.cast(a, sub);
      }
    }
    if (act === 'talk' && every(0.5)) this.add({ kind: 'glint', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 2, vx: 0, vy: 0, vz: 3, life: 0.5, color: a.traits.color, glow: true, gravity: 0 });
    if (this.life.sleeping(a) && every(1.1)) this.glyphs.push({ x: a.x, y: a.y, z: head + 2, vz: 5, ch: r.pick(['z', 'Z']), color: pal.dim, life: 2 });
  }

  // Fireworks in the world's colours over `a`, and a shower of its confetti.
  private burst(a: Actor): void {
    const r = this.rng;
    const pal = this.world.palette;
    const head = FIGURE_H - 2;
    const colors = [pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color];
    for (let i = 0; i < 46; i++) {
      const ang = r.next() * Math.PI * 2;
      const sp = 4 + r.next() * 8;
      this.add({ kind: 'spark', x: a.x, y: a.y, z: head + 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 10 + r.next() * 12, life: 0.8 + r.next() * 0.8, color: r.pick(colors), glow: true, gravity: 14 });
    }
    const fin = this.world.finale.colors;
    for (let i = 0; i < 14; i++) {
      this.add({ kind: 'confetti', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 6, vx: r.range(-4, 4), vy: r.range(-4, 4), vz: 6 + r.next() * 6, life: 4, color: r.pick(fin), glow: false, gravity: 16 });
    }
  }

  // How it feels, from its meters (none without vitals), and what its
  // level lets it wear (nothing at ★1).
  private feel(a: Actor, now: number): Feel | undefined {
    const v = a.info.vitals;
    return v ? feelOf(meters(v, now)) : undefined;
  }

  private wear(a: Actor): Wear | undefined {
    return wearAt(a.info.level ?? 1);
  }

  // How high it stands (see figureTop), as its frame will say.
  private top(a: Actor, now = this.now): number {
    return figureTop({ costume: this.world.costume, wear: this.wear(a), feel: this.feel(a, now), sleeping: this.life.sleeping(a) });
  }

  // What an actor shows this frame: its pose, facing and anything it holds.
  lookOf(a: Actor, now = this.now): Look & { facing: Facing } {
    const idleFor = (now - a.info.since) / 1000;
    const walking = a.path.length > 0 && a.state !== 'enter' && !this.life.holding(a);
    const look = this.life.look(a, walking, poseFor(a.info.activity, idleFor, walking));
    let facing = a.facing;
    if (!walking && a.station) {
      // At the prop: backs to us for the work, turned its way (from a lane
      // along it, in at it); facing us otherwise.
      const r = slotRect(a.station);
      const left = (r.x0 + r.x1 - r.y0 - r.y1) / 2 < a.x - a.y;
      facing = FACES_STATION.has(look.pose) ? { back: true, flip: left } : { back: false, flip: a.station.wall === 'left' };
    } else if (!walking) {
      facing = { back: false, flip: a.facing.flip };
    }
    if (look.face) facing = faceToward(a, look.face, facing);
    return { ...look, facing };
  }

  // The scene as it stands, for a renderer; null when there is nothing to
  // show. Moves the camera on (zoom and pan ease from frame to frame) and
  // places the labels.
  frame(now: number, selectedId: string | null = null, opts: { card?: boolean } = {}): SceneFrame | null {
    this.placedLabels = [];
    const r = this.rect;
    const L = this.L;
    const room = this.plan;
    if (!L || !room || r.w <= 0 || r.h <= 0) return null;
    const actors = [...this.cast.values()].sort((m, n) => m.x + m.y - (n.x + n.y));
    const sel = actors.find((a) => a.info.id === selectedId) ?? null;
    const cam = this.aim(actors, sel, true);
    this.camera = cam;
    const t = this.clock;
    const c = this.life.clock;
    const errNow = (a: Actor) => !!a.error && now < a.error.until;
    // A few emotes at once: the selection's first, then the newest.
    const emoting = actors
      .filter((a) => a.mind.emote && a.mind.emote.born <= c && a.state !== 'enter' && a.hush <= t)
      .sort((m, n) => (m === sel ? -1 : n === sel ? 1 : n.mind.emote!.born - m.mind.emote!.born))
      .slice(0, MAX_EMOTES);
    this.emotesShown = emoting.length;
    const figures: FigureFrame[] = [];
    // How high each one shown stands (see figureTop): its labels and emote go over that.
    const tops = new Map<Actor, number>();
    for (const a of actors) {
      // Fading in at the door: shown once the entrance flash is over.
      if (a.state === 'enter' && now - a.bornAt <= ENTER_MS * 0.5) continue;
      const look = this.lookOf(a, now);
      // A beat's pose runs from its first frame (see Look.since).
      const fig: FigureFrame = {
        id: a.info.id,
        x: a.x,
        y: a.y,
        z: 0,
        traits: a.traits,
        costume: this.world.costume,
        pose: look.pose,
        poseT: look.since !== undefined ? c - look.since : t + a.gait,
        phase: look.since !== undefined ? 0 : a.phase / 997,
        facing: look.facing,
        selected: a === sel,
        hurt: errNow(a),
        sleeping: this.life.sleeping(a),
        walking: a.path.length > 0 && a.state !== 'enter' && !this.life.holding(a),
      };
      if (look.item !== undefined) fig.item = this.world.build.colors[look.item] ?? this.world.build.colors[0];
      if (look.mug) fig.mug = true;
      const feel = this.feel(a, now);
      const wear = this.wear(a);
      if (feel) fig.feel = feel;
      if (wear) fig.wear = wear;
      // A happy one bounces: a hop a step walking, now and then standing about.
      if (feel?.bouncy && !fig.sleeping && (look.pose === 'idle' || look.pose === 'walk')) {
        const per = look.pose === 'walk' ? HOP_WALK : HOP_IDLE;
        fig.hop = HOP * Math.abs(Math.sin((Math.PI * (fig.poseT + fig.phase)) / per));
      }
      const e = a.mind.emote;
      if (e && emoting.includes(a)) fig.emote = { kind: e.e, t: c - e.born };
      figures.push(fig);
      tops.set(a, figureTop(fig));
    }
    const cr = this.critter;
    const critter = cr
      ? { kind: cr.look.kind, body: cr.look.body, x: cr.x, y: cr.y, z: cr.hover(t), flip: cr.flip, moving: cr.moving, ...(cr.heartUntil > c && emoting.length < MAX_EMOTES ? { heart: c - (cr.heartUntil - 1.8) } : {}) }
      : null;
    const ghost = this.ghostHue();
    const builds: BuildFrame[] = (this.works?.builds ?? []).map((b) => ({
      shape: b.shape,
      blocks: b.built(),
      pending: b.complete ? [] : b.ghost(),
      colors: this.world.build.colors,
      progress: b.count ? Math.min(1, b.placed / b.count) : 1,
      complete: b.complete,
      top: b.top,
      pile: b.complete ? null : b.pile,
      ghost,
    }));
    const f: SceneFrame = {
      world: this.world,
      room,
      t,
      lit: this.lit,
      active: this.activeProps(),
      camera: cam,
      figures,
      critter,
      trinkets: this.trinkets,
      desks: this.workstations().map((w) => this.deskFrame(w)),
      builds,
      particles: this.particles,
      labels: [],
      marks: [],
      next: this.reach(actors, sel),
    };
    this.place(f, actors, emoting, tops, now, selectedId, opts.card ?? false);
    return f;
  }

  // A workstation as the frame shows it: its screen (its agent's activity,
  // dim once left) and how far it has grown out of the floor (popping up,
  // or shrinking away once left empty a while).
  private deskFrame(w: Workstation): DeskFrame {
    const d = w.desk;
    const o = w.owner ? this.cast.get(w.owner) : undefined;
    const gone = this.clock - w.left - EMPTY_S;
    const grow = gone > 0 ? Math.max(0, 1 - gone / POP_S) : Math.min(1, (this.clock - w.born) / POP_S);
    return { id: d.index, wall: d.wall, x0: d.x0, y0: d.y0, len: d.len, dep: d.dep, screen: o ? screenFor(o.info.activity) : 'off', grow, seed: d.index % 3 };
  }

  // The ghost's hue: cyan where the world is warm (its floor and backdrop
  // redder than blue), amber where it is cold.
  ghostHue(): RGB {
    const a = this.world.palette.floor;
    const b = this.world.backdrop;
    return a[0] + b[0] > a[2] + b[2] ? GHOST_HUE.warm : GHOST_HUE.cold;
  }

  // Zoom: + and - step through ZOOMS (never past fitting the whole room);
  // `zoomAuto` hands it back to the stage.
  zoomBy(dir: 1 | -1): void {
    const levels = this.levels();
    this.zoomWant = this.stepZoom(dir) ?? (dir > 0 ? levels[levels.length - 1] : levels[0]);
  }

  // The zoom steps that keep a unit under MAX_S pixels.
  private levels(): number[] {
    const fit = this.fitScale();
    return ZOOMS.filter((z) => z === 1 || z * fit <= MAX_S);
  }

  // The zoom one step in or out from the current one (null at either end).
  private stepZoom(dir: 1 | -1): number | null {
    const levels = this.levels();
    const at = this.zoomWant ?? this.zoom;
    return (dir > 0 ? levels.find((z) => z > at + 1e-6) : [...levels].reverse().find((z) => z < at - 1e-6)) ?? null;
  }

  zoomAuto(): void {
    this.zoomWant = null;
  }

  // Times the fitted scale (1 = the whole room in view).
  get zoomLevel(): number {
    return this.zoom;
  }

  // Canvas pixels per unit that fit the whole room in the scene.
  private fitScale(): number {
    const L = this.L;
    if (!L) return PX_PER_UNIT;
    const cw = this.rect.w * this.cell.w;
    const ch = this.rect.h * this.cell.h;
    const m = 2 * FIT_MARGIN;
    return Math.max(0.5, Math.min(cw / (L.W + L.D + m), ch / ((L.W + L.D) / 2 + L.H + m)));
  }

  // Sets the zoom (fit, or as asked; a close-up on a selected agent) and
  // pans the camera: centred where the room fits, otherwise following the
  // selected agent (or the crowd). The zoom jumps: every scale's pictures
  // are drawn and sent afresh (see Scene.plate), so a zoom eased through
  // many scales would send whole pictures for each. The pan eases (it only
  // moves pictures already sent), except with the zoom: a new zoom cuts
  // straight to what it frames. Without `ease`, the pan always jumps.
  private aim(actors: Actor[], sel: Actor | null, ease: boolean): Camera {
    const want = this.wantZoom(sel, this.zoomWant);
    const cut = want !== this.zoom;
    this.zoom = want;
    const { s, u: tu, v: tv } = this.target(actors, sel, want);
    if (!this.cam.set || !ease || cut) Object.assign(this.cam, { u: tu, v: tv, set: true });
    this.cam.u += (tu - this.cam.u) * 0.15;
    this.cam.v += (tv - this.cam.v) * 0.15;
    return this.cameraAt(s, this.cam.u, this.cam.v);
  }

  // The zoom for `sel` selected and `asked` (from + and -, or none): the
  // fit, or a close-up on a selected agent, never past MAX_S.
  private wantZoom(sel: Actor | null, asked: number | null): number {
    return Math.min(asked ?? (sel ? CLOSE_UP : 1), Math.max(1, MAX_S / this.fitScale()));
  }

  // Where the camera settles at `zoom`: the scale, and the view's corner
  // (u, v in units) centred where the room fits, otherwise on `sel` (or
  // the crowd), from the feet to the top of the hat (see figureTop; a hop
  // left out, so a mood does not pan the view).
  private target(actors: Actor[], sel: Actor | null, zoom: number): { s: number; u: number; v: number } {
    const L = this.L!;
    const s = this.fitScale() * zoom;
    const vw = (this.rect.w * this.cell.w) / s;
    const vh = (this.rect.h * this.cell.h) / s;
    const M = FIT_MARGIN;
    const focus = (lo: number, hi: number, view: number, at: number) => (hi - lo <= view ? lo - (view - (hi - lo)) / 2 : Math.max(lo, Math.min(hi - view, at - view / 2)));
    const pts = sel ? [sel] : actors;
    let fu = (L.W - L.D) / 2;
    let fv = (L.W + L.D) / 4 - L.H / 2;
    if (pts.length) {
      fu = pts.reduce((n, a) => n + a.x - a.y, 0) / pts.length;
      fv = pts.reduce((n, a) => n + (a.x + a.y) / 2 - figureTop({ costume: this.world.costume, wear: this.wear(a) }) / 2, 0) / pts.length;
    }
    return { s, u: focus(-L.D - M, L.W + M, vw, fu), v: focus(-L.H - M, (L.W + L.D) / 2 + M, vh, fv) };
  }

  private cameraAt(s: number, u: number, v: number): Camera {
    return { s, ox: -u * s, oy: -v * s, w: this.rect.w * this.cell.w, h: this.rect.h * this.cell.h, cell: { ...this.cell }, cells: { ...this.rect } };
  }

  // The cameras one keypress away (see SceneFrame.next), most likely
  // first: Tab to the next agent, + and -, shift-Tab, Esc back to the
  // whole room; none twice, none where the camera already settles.
  private reach(actors: Actor[], sel: Actor | null): Camera[] {
    const order = this.actors();
    const i = sel ? order.indexOf(sel) : -1;
    const tab = (d: number) => (order.length ? order[i < 0 ? (d > 0 ? 0 : order.length - 1) : (i + d + order.length) % order.length] : undefined);
    const zin = this.stepZoom(1);
    const zout = this.stepZoom(-1);
    const asks: Array<[Actor | null | undefined, number | null]> = [
      [tab(1), this.zoomWant],
      [zin === null ? undefined : sel, zin],
      [zout === null ? undefined : sel, zout],
      [tab(-1), this.zoomWant],
      [null, null],
    ];
    const here = this.target(actors, sel, this.zoom);
    const seen = new Set([`${here.s}|${here.u}|${here.v}`]);
    const out: Camera[] = [];
    for (const [who, asked] of asks) {
      if (who === undefined) continue;
      const t = this.target(actors, who, this.wantZoom(who, asked));
      const key = `${t.s}|${t.u}|${t.v}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(this.cameraAt(t.s, t.u, t.v));
    }
    return out;
  }

  // Places the labels in terminal cells over the scene: an activity glyph
  // and the name in the agent's colour; a one-line bubble ("glyph name ·
  // detail") for the selected agent, for a moment after a change, and on
  // errors and finishes — a few at most. Nothing overlaps another label or
  // an emote; a quiet label keeps its row unless blocked for a while, so
  // they do not jitter, while a loud one moves at once and so never blinks
  // out. In a crowd, quiet labels shrink to their glyph (see CROWD and
  // BAND), and names that clip alike are told apart (tagNames). With a
  // selection, the others' labels dim. Labels and emotes go over each
  // one's top (`tops`, see figureTop), clear of its hat. Also places the
  // drifting '!' and z marks, and a level-up's rising word on a dark pill
  // of its own, over the labels (see wordOf).
  private place(f: SceneFrame, actors: Actor[], emoting: Actor[], tops: Map<Actor, number>, now: number, selectedId: string | null, card: boolean): void {
    const r = this.rect;
    const cam = f.camera;
    const pal = this.world.palette;
    const cellOf = (x: number, y: number, z: number): [number, number] => {
      const [px, py] = project(cam, x, y, z);
      return [r.x + Math.floor(px / cam.cell.w), r.y + Math.floor(py / cam.cell.h)];
    };
    const topOf = (a: Actor) => tops.get(a) ?? this.top(a, now);
    const taken: Array<[number, number, number]> = [];
    // Cells an emote shows in: [row, x0, x1).
    const shown: Array<[number, number, number]> = [];
    // Each emote's top row, by actor.
    const emoteTop = new Map<Actor, number>();
    for (const a of emoting) {
      const half = EMOTE.size / 2;
      const lift = topOf(a) + EMOTE.gap;
      const [px, py0] = project(cam, a.x, a.y, lift + EMOTE.size);
      const [, py1] = project(cam, a.x, a.y, lift);
      const x0 = px - half * cam.s;
      const x1 = px + half * cam.s;
      const c0 = r.x + Math.floor(x0 / cam.cell.w);
      const c1 = r.x + Math.floor((x1 - 1e-6) / cam.cell.w) + 1;
      const row0 = r.y + Math.floor(py0 / cam.cell.h);
      emoteTop.set(a, row0);
      for (let row = row0; row <= r.y + Math.floor((py1 - 1e-6) / cam.cell.h); row++) shown.push([row, c0, c1]);
    }
    const free = (y: number, x0: number, x1: number, overEmotes = false) =>
      y >= r.y && y < r.y + r.h && !taken.some(([ty, a, b]) => ty === y && x0 < b + 1 && a < x1 + 1) && (overEmotes || !shown.some(([ty, a, b]) => ty === y && x0 < b && a < x1));
    const erring = (a: Actor) => !!a.error && now < a.error.until;
    const loud = (a: Actor) => a.info.id === selectedId || now < a.bubbleUntil || a.info.activity === 'error' || a.info.activity === 'done' || erring(a);
    // The selection, then errors (so they are never crowded out), then the
    // newest changes.
    const order = [...actors].sort((m, n) => {
      if (m.info.id === selectedId) return -1;
      if (n.info.id === selectedId) return 1;
      return (erring(n) ? 1 : 0) - (erring(m) ? 1 : 0) || (loud(n) ? 1 : 0) - (loud(m) ? 1 : 0) || n.bubbleUntil - m.bubbleUntil;
    });
    // Heads, in terminal columns and rows: the column over the feet, the
    // row of the top of the head.
    const heads = new Map<Actor, [number, number]>();
    for (const a of actors) {
      const [px, py] = project(cam, a.x, a.y, FIGURE_H);
      heads.set(a, [px / cam.cell.w, py / cam.cell.h]);
    }
    const crowded = (a: Actor) => {
      const [x, y] = heads.get(a)!;
      for (const [o, [ox, oy]] of heads) if (o !== a && Math.abs(ox - x) < CROWD.cols && Math.abs(oy - y) <= CROWD.rows) return true;
      return false;
    };
    const named: Array<[number, number]> = [];
    const near = (p: [number, number], q: [number, number]) => Math.abs(p[0] - q[0]) < BAND.cols && Math.abs(p[1] - q[1]) <= BAND.rows;
    // Would one more here stack more than BAND.max anywhere?
    const towers = (p: [number, number]) => {
      const by = named.filter((q) => near(p, q));
      return by.length >= BAND.max || by.some((q) => named.filter((o) => near(q, o)).length >= BAND.max);
    };
    const short = tagNames(actors, 8);
    const long = tagNames(actors, 10);
    let bubbles = 0;
    const seen = new Set<string>();
    for (const a of order) {
      seen.add(a.info.id);
      const selected = a.info.id === selectedId;
      if (selected && card) continue; // its card says it all
      const [cx, hr] = cellOf(a.x, a.y, topOf(a));
      const [, feet] = cellOf(a.x, a.y, 0);
      const top = emoteTop.get(a);
      // With its top out of view over the scene (close up, a hat reaching
      // past the edge), its label goes on the scene's top row, if that is
      // clear, rather than nowhere.
      const headRow = Math.max(r.y + 1, top === undefined ? hr : Math.min(hr, top));
      if (cx < r.x || cx >= r.x + r.w || feet < r.y || headRow > r.y + r.h) continue;
      const act = erring(a) ? 'error' : a.info.activity;
      const detail = erring(a) ? a.error!.text : a.info.detail;
      const glyph = activityGlyph(act);
      const hurry = loud(a);
      const memo = this.rows.get(a.info.id) ?? { off: 1, blocked: -Infinity };
      // The row to use (1 = just over the head; -1 = none) and the memo
      // after it: the row last used unless it has been blocked a while
      // (a loud label moves at once), back down once the one under it has
      // been clear a while; quiet labels never above row 2.
      const most = hurry ? 3 : 2;
      const pick = (fits: (k: number) => boolean): [number, typeof memo] => {
        const m = { ...memo };
        let off = -1;
        if (m.off <= most && fits(m.off)) {
          off = m.off;
          m.blocked = -Infinity;
          if (m.off > 1 && fits(1)) {
            m.clear = m.clear ?? now;
            if (now - m.clear > (hurry ? LOUD_BACK_MS : LABEL_HOLD_MS)) off = 1;
          } else m.clear = undefined;
        } else {
          if (m.blocked === -Infinity) m.blocked = now;
          if (now - m.blocked > LABEL_HOLD_MS || hurry || m.off > most) {
            for (let k = 1; k <= most && off < 0; k++) if (fits(k)) off = k;
            if (off > 0) m.blocked = -Infinity;
          }
        }
        if (off > 0 && off !== m.off) {
          m.off = off;
          m.clear = undefined;
        }
        return [off, m];
      };
      // Where `label` would go: its row, the memo after it, and its cells. A
      // loud label that fits no row over the head slides aside, up to half
      // its width, rather than blink out; an error's, as a last resort,
      // covers a neighbour's emote (never a label).
      const spot = (label: string) => {
        const w = [...label].length;
        const x0 = cx - Math.floor(w / 2);
        const fits = (x: number, k: number, over: boolean) => free(headRow - k, x, x + w, over);
        let first: { off: number; m: typeof memo; x: number; y: number; w: number } | null = null;
        for (const over of erring(a) ? [false, true] : [false]) {
          for (const k of hurry ? [0, -1, 1, -2, 2] : [0]) {
            const x = Math.max(r.x, Math.min(r.x + r.w - w, x0 + k * Math.ceil(w / 4)));
            const [off, m] = pick((row) => fits(x, row, over));
            const p = { off, m, x, y: headRow - off, w };
            if (off > 0) return p;
            first ??= p;
          }
        }
        return first!;
      };
      const mid = (p: { x: number; y: number; w: number }): [number, number] => [p.x + p.w / 2, p.y];
      // A bubble, a name tag, or in a crowd (or atop a stack) just the glyph.
      let kind: 'bubble' | 'name' | 'glyph' = hurry && !!detail && (selected || bubbles < MAX_BUBBLES) ? 'bubble' : !hurry && crowded(a) ? 'glyph' : 'name';
      const textOf = () => (kind === 'bubble' ? ` ${glyph} ${long.get(a)} · ${clip(detail, 22)} ` : kind === 'name' ? `${glyph} ${short.get(a)}` : glyph);
      let p = spot(textOf());
      if (kind !== 'glyph' && p.off > 0 && towers(mid(p))) {
        kind = 'glyph';
        p = spot(glyph);
      }
      this.rows.set(a.info.id, p.m);
      if (p.off < 0) continue;
      if (kind !== 'glyph') named.push(mid(p));
      if (kind === 'bubble') bubbles++;
      const { x, y, w } = p;
      taken.push([y, x, x + w]);
      const fade = selectedId && !selected ? 0.6 : 1;
      const ink = scale(activityColor(act, this.world), fade);
      const col = act === 'error' ? pal.bad : a.traits.color;
      let label: LabelFrame;
      if (kind === 'bubble') {
        const pill = selected ? a.traits.color : mix(pal.panel, act === 'error' ? pal.bad : a.traits.color, 0.22);
        label = { col: x, row: y, w, kind: act === 'error' ? 'error' : 'bubble', color: scale(pill, fade), alpha: 0.9, text: textOf(), ink: scale(selected ? pal.panel : pal.panelText, fade), bold: selected, mark: { col: x + 1, ch: glyph, ink: selected ? pal.panel : ink } };
      } else if (kind === 'name') {
        label = { col: x, row: y, w, kind: 'name', color: pal.panel, alpha: 0.55, text: textOf(), ink: scale(col, fade), bold: true, mark: { col: x, ch: glyph, ink } };
      } else {
        label = { col: x, row: y, w, kind: 'glyph', color: pal.panel, alpha: 0.55, text: glyph, ink, bold: true };
      }
      f.labels.push(label);
    }
    for (const id of this.rows.keys()) if (!seen.has(id)) this.rows.delete(id);
    this.placedLabels = taken.map(([y, x0, x1]) => ({ x: x0, y, w: x1 - x0 }));
    for (const g of this.glyphs) {
      const [col, row] = cellOf(g.x, g.y, g.z);
      if (col < r.x || col >= r.x + r.w || row < r.y || row >= r.y + r.h) continue;
      if (g.ch.length > 1) f.labels.push(this.wordOf(g.ch, col, row, g.color));
      else f.marks.push({ col, row, ch: g.ch, ink: g.color });
    }
  }

  // A level-up's ★N! as a label: centred on its column (kept inside the
  // scene), in bold in its ink, on a near-opaque pill in the world's panel
  // colour, so it reads over a light wall as over a dark one. It rises a
  // whole row at a time (it is terminal text), and its pill's sprite goes
  // by its size and colours, not its place, so rising makes no new one.
  // (One UTF-16 unit a character: ★ is.)
  private wordOf(ch: string, col: number, row: number, ink: RGB): LabelFrame {
    const r = this.rect;
    const w = ch.length;
    const x = Math.max(r.x, Math.min(r.x + r.w - w, col - (w >> 1)));
    return { col: x, row, w, kind: 'word', color: this.world.palette.panel, alpha: WORD_PILL, text: ch, ink, bold: true };
  }

  // The frame's labels and marks as terminal text over the scene's cells.
  // Their cells keep whatever background they have (the terminal's
  // default over an image, so the scene's pill shows through). Marks (z, Z
  // or !) go under the labels; a level-up's word, the last label, over
  // the rest.
  drawLabels(s: Screen, f: SceneFrame): void {
    const end = f.camera.cells.x + f.camera.cells.w;
    for (const m of f.marks) s.put(m.col, m.row, m.ch, m.ink);
    for (const l of f.labels) {
      s.text(l.col, l.row, l.text, l.ink, undefined, l.bold ? BOLD : 0, end);
      if (l.mark) s.put(l.mark.col, l.row, l.mark.ch, l.mark.ink, undefined, BOLD);
    }
  }
}

// How far apart two floor spots are on screen, in units.
export function onScreen(p: Spot, q: Spot): number {
  return Math.hypot(p.x - q.x - (p.y - q.y), (p.x - q.x + p.y - q.y) / 2);
}

// Each actor's name as its tag shows it, clipped to `n` characters. Names
// that would read alike ("Check…" twice) are told apart: by the first word
// and the second's initial ("Check i…") where that helps, and any still
// alike are numbered in the order they came ("Check…2").
export function tagNames(actors: readonly Actor[], n: number): Map<Actor, string> {
  const out = new Map<Actor, string>();
  const alike = new Map<string, Actor[]>();
  for (const a of actors) {
    const t = clip(a.info.name, n);
    out.set(a, t);
    alike.set(t, [...(alike.get(t) ?? []), a]);
  }
  for (const [t, group] of alike) {
    if (group.length < 2) continue;
    group.sort((p, q) => p.order - q.order);
    const initials = group.map((a) => {
      const [first, second] = a.info.name.trim().split(/\s+/);
      return second ? `${first.slice(0, Math.max(1, n - 3))} ${second[0]}…` : t;
    });
    const texts = new Set(initials).size > 1 ? initials : group.map(() => t);
    const count = new Map<string, number>();
    group.forEach((a, i) => {
      const k = (count.get(texts[i]) ?? 0) + 1;
      count.set(texts[i], k);
      out.set(a, k > 1 ? `${texts[i]}${k}` : texts[i]);
    });
  }
  return out;
}

// A pen that draws nothing: what props get to `emit` with (they only
// spawn particles there).
const noop = () => {};
const NO_GRADIENT = { addColorStop: noop };
const QUIET_PEN: Pen = {
  width: 0,
  height: 0,
  fillStyle: '#000',
  strokeStyle: '#000',
  lineWidth: 1,
  lineJoin: 'round',
  lineCap: 'round',
  globalAlpha: 1,
  globalCompositeOperation: 'source-over',
  save: noop,
  restore: noop,
  translate: noop,
  scale: noop,
  rotate: noop,
  transform: noop,
  setTransform: noop,
  beginPath: noop,
  closePath: noop,
  moveTo: noop,
  lineTo: noop,
  quadraticCurveTo: noop,
  bezierCurveTo: noop,
  arc: noop,
  ellipse: noop,
  rect: noop,
  roundRect: noop,
  fill: noop,
  stroke: noop,
  clip: noop,
  fillRect: noop,
  clearRect: noop,
  createLinearGradient: () => NO_GRADIENT,
  createRadialGradient: () => NO_GRADIENT,
  drawImage: noop,
};
