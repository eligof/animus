import type { Activity, AgentInfo } from '../agents.ts';
import { clip } from '../claude/activity.ts';
import type { RGB } from '../term/color.ts';
import { mix, scale } from '../term/color.ts';
import type { Rect, Screen } from '../term/screen.ts';
import { BOLD } from '../term/screen.ts';
import { CLEAR, PixelCanvas } from '../iso/canvas.ts';
import { Works, defaultStyle } from '../cave/build.ts';
import type { Construction, Disc } from '../cave/build.ts';
import { Critter, critterFor } from '../cave/critter.ts';
import { blitSprite, drawParticles, Glow } from '../cave/glow.ts';
import { LIMITS, hub, planLayout, slotRect } from '../cave/layout.ts';
import { contourPatterns } from '../cave/texture.ts';
import { tagSize } from '../iso/png.ts';
import type { Detail, Tag } from '../iso/png.ts';
import { ADVANCE } from '../iso/font.ts';
import { paintSky } from '../cave/sky.ts';
import type { Rect as Box } from '../cave/layout.ts';
import { buildTables, M, MATERIALS } from '../cave/materials.ts';
import type { Tables } from '../cave/materials.ts';
import { updateParticles } from '../cave/particles.ts';
import { Caster } from '../cave/raycast.ts';
import { explode, heal, step } from '../cave/sim.ts';
import { depthOf, project } from '../cave/types.ts';
import type { Biome, Ctx, Facing, Finale, Layout, Particle, Poi, PointLight, Slot, StationKind, View, WizardSprite } from '../cave/types.ts';
import { Voxels } from '../cave/voxels.ts';
import { wizardSprite } from '../cave/wizard.ts';
import { activityColor, activityGlyph } from '../ui/chrome.ts';
import { poseFor, traitsFor } from './character.ts';
import type { Pose, Traits } from './character.ts';
import { Life, SLEEP_AFTER, defaultPois, emoteArt, faceToward, newMind } from './life.ts';
import type { Look, Mind } from './life.ts';
import { NavGrid, smooth } from './path.ts';
import { Rng, hashString } from './rng.ts';

// How pixels map to terminal cells: 'half' = 1x2 square pixels per cell
// (upper half block), 'sextant' = 2x3 pixels per cell (2x3 sextant glyphs,
// pixels about 3:4), three times the resolution where the terminal draws
// sextants well; 'hd' = the scene as a real image (kitty graphics
// protocol), each cell as many pixels as it really has, divided by the
// image's blow-up (see setCell).
export type PixelMode = 'half' | 'sextant' | 'hd';
const GRID: Record<'half' | 'sextant', { fx: number; fy: number }> = {
  half: { fx: 1, fy: 2 },
  sextant: { fx: 2, fy: 3 },
};
// A terminal cell in pixels when the terminal has not said (common sizes).
const CELL = { w: 10, h: 20 };

const WALK = 22; // voxels per second
// Long trips go at up to JOG times a walk, easing back to a walk as the
// last JOG_OVER voxels come up. A world planned bigger and shown zoomed
// out (WORLD_SCALE) is crossed that many times faster, so a trip takes
// about the same time on screen; so is one planned at one voxel per pixel
// but wider than JOG_ROOM (HD's), easing over as far on screen.
const JOG = 1.5;
const JOG_OVER = 20;
const JOG_ROOM = 128;
// Strides quicken with the pace on screen, up to this many times a walk's
// (HD shows 10 frames a second), so a jog doesn't slide the feet.
const GAIT_MAX = 1.6;
const ENTER_MS = 700;
const BUBBLE_MS = 1500; // a detail shows in a bubble this long after it changes
const MAX_BUBBLES = 3;
// Labels keep their row over the head until blocked this long, and drift
// back down once the row under them has been clear as long; loud ones
// (selection, error, change, finish) move at once and drift back sooner.
const LABEL_HOLD_MS = 500;
const LOUD_BACK_MS = 300;
// In a crowd, counted in label columns and rows (text cells, or in HD the
// tags' own characters and rows): a quiet label shrinks to its activity
// glyph when another head is nearer than CROWD, and no more than BAND.max
// names or bubbles stand within BAND of one another (a 16-column band),
// the lowest in priority shrinking to its glyph. Quiet labels use the two
// rows over the head, loud ones three.
const CROWD = { cols: 9, rows: 4 };
const BAND = { cols: 8, rows: 4, max: 3 };
// A finish in the caves showers gold dust that settles.
const GOLD: Finale = { colors: [[255, 211, 74]], mat: M.GOLD_DUST };
const rgb = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];
const ERROR_MS = 5000; // an error stays on show this long, whatever comes next
const SMOKE_MS = 4000;
// A new activity sends its agent to another prop only once it has lasted
// this long, and never before the agent has worked at its prop a while; in
// between the pose changes in place.
const SETTLE_MS = 3000;
const DWELL_MS = 9000;
const SIM_HZ = 36;
const MARGIN = 6; // world-canvas border around the chunk, in pixels
// The world is planned for a canvas this many times the scene, then shown
// zoomed out to fit: more room than one voxel per pixel would allow (the
// figures stay full size). Not on tiny scenes or in half blocks, where the
// zoomed-out room is too few pixels to read.
const WORLD_SCALE = 2;
const SCALE_MIN = { w: 120, h: 60 };
// Zoom steps for + and -; the fitted zoom is always one more step.
const ZOOMS = [1, 0.75, 0.5, 0.33];
// Where a crowd at one prop stands: (along the wall, further out), in lane
// steps. A line along the wall (across the screen in front of a prop out
// on the floor), the middle and then out to either side, the room's front
// side first; then a row a step further out, in the gaps of the first; then
// a third. All within 2.5 steps of the prop's spot, so everyone still reads
// as working there: past these, a crowd overlaps a little.
const LANES: ReadonlyArray<readonly [number, number]> = [[0, 0], [1, 0], [-1, 0], [2, 0], [-2, 0], [0.5, 1], [-0.5, 1], [1.5, 1], [-1.5, 1], [1, 2], [-1, 2]];
// A lane step on screen: about a figure's width (the sprites are 9-12 px
// wide). Zoomed out the figures stay full size, so the step in voxels grows
// as the zoom shrinks (to 1/2 at most).
const LANE_PX = 12;
// A lane closer than this on screen to someone already at the prop (where
// clamping to the floor lands two lanes together) is passed over.
const LANE_APART_PX = 6;
// Walkers detouring through the hub keep this many voxels to one side of it
// (which side hashed from the id), so the traffic forms two lanes.
const HUB_LANE = 3;
// Poses done with the back to the viewer, facing the prop.
const FACES_STATION = new Set<Pose>(['write', 'read', 'search', 'web', 'run', 'think']);
const EMOTE_LIFT = 17; // emote bottom, pixels above the feet
const MAX_EMOTES = 3; // shown at once
// The selected agent's floor ring (13x5, an iso ellipse round the feet).
const RING = ['....#####....', '..##.....##..', '##.........##', '..##.....##..', '....#####....'];
const NAV_CELL = 2; // voxels per routing cell
const NAV_PAD = 2; // routing keeps this far from props and builds
// A build's ghost: a hologram in a cool complement of the world (cyan in a
// warm one, amber in a cold one), shaded per face like the voxels it stands
// for (top, left +y, right +x; see raycast.ts), laid over what is behind it
// at these shares: the lit and unlit halves of its checker, a bright 1 px
// outline round its silhouette, and a band sweeping up it.
const GHOST_HUE: { warm: RGB; cold: RGB } = { warm: [127, 232, 255], cold: [255, 179, 71] };
const GHOST_FACE = [1, 200 / 256, 150 / 256];
const GHOST = 0.5;
const GHOST_DIM = 0.22;
const GHOST_EDGE = 0.85;
const GHOST_SCAN = 0.7;
const SCAN_S = 2; // seconds a sweep takes
const SCAN_H = 3; // the band's height, pixels

type Spot = { x: number; y: number };
type Placed = { sx: number; sy: number; top: number };
// A figure to draw this frame: sprite, anchor (world pixels), depth.
type Fig = { sp: WizardSprite; sx: number; sy: number; d: number; shown: boolean; outline: boolean };

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
  error: { until: number; text: string; x: number; y: number; z: number } | null; // the last error, on show for a while
  cheered: number; // `since` of the finish last celebrated
  settledAt: number; // when it last arrived at its prop
  gait: number; // seconds its strides have run ahead of the clock (jogging)
  mind: Mind; // what it is up to between the work (see life.ts)
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
// current activity — where their work has physical effects — and living
// a little in between (see life.ts): wandering, chatting, building.
export class Stage {
  private biome: Biome;
  private rect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private mode: PixelMode;
  private cell = { ...CELL };
  // HD surface patterns per screen pixel (valid when detailOn).
  private detail = new Uint16Array(0);
  private detailOn = false;
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
  // Per pixel, the nearest ghost voxel this frame: its depth and colour.
  private ghostD = new Float32Array(0);
  private ghostC = new Int32Array(0);
  private cam = { x: 0, y: 0, set: false };
  // Current zoom (eased), and the one asked for with +/- (null = auto: fit
  // the whole world, or full detail on the selected agent).
  private zoom = 1;
  private zoomWant: number | null = null;
  private k = 1; // world pixels planned per screen pixel
  private colsAt = new Int32Array(0);
  private rowsAt = new Int32Array(0);
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
  private now = 0;
  private seq = 0;
  private placedLabels: Array<{ x: number; y: number; w: number }> = [];
  private tags: Tag[] = []; // HD: name tags drawn into the image (see png.ts)
  // Emotes over heads in the last draw.
  emotesShown = 0;
  // Pixels of build ghosts in the last draw.
  ghostShown = 0;
  // Each label's row above the head, and since when it has been blocked.
  private rows = new Map<string, { off: number; blocked: number; clear?: number }>();

  readonly life: Life;
  private works: Works | null = null;
  private critter: Critter | null = null;
  private spots: Poi[] = [];
  private nav: NavGrid | null = null;
  private navKey = '';
  private blocks: { discs: Disc[]; rects: Box[] } = { discs: [], rects: [] };
  private blocksAt = -1;

  constructor(biome: Biome, mode: PixelMode = 'half') {
    this.biome = biome;
    this.mode = mode;
    this.T = buildTables(biome.colors);
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
    });
  }

  get pixels(): PixelMode {
    return this.mode;
  }

  setMode(mode: PixelMode): void {
    this.mode = mode;
    this.layout(this.rect);
  }

  // The terminal's cell size in pixels, for HD mode.
  setCell(w: number, h: number): void {
    if (w === this.cell.w && h === this.cell.h) return;
    this.cell = { w, h };
    if (this.mode === 'hd') this.layout(this.rect);
  }

  // HD mode: how many image pixels each canvas pixel becomes (crisp, whole
  // numbers: 2 on common screens, 3 on dense ones).
  hdScale(): number {
    if (this.cell.h < 12) return 1;
    // As big as the biggest room still fits the scene: 2 on most screens,
    // 3 or 4 on large or dense ones.
    const room = { w: 2 * LIMITS.maxSide + 2 * MARGIN, h: LIMITS.maxSide + LIMITS.maxH + 2 * MARGIN };
    const fit = Math.min((this.rect.w * this.cell.w) / room.w, (this.rect.h * this.cell.h) / room.h);
    return Math.max(2, Math.min(4, Math.floor(fit)));
  }

  // Canvas pixels per terminal cell.
  private grid(): { fx: number; fy: number } {
    if (this.mode !== 'hd') return GRID[this.mode];
    const k = this.hdScale();
    return { fx: Math.max(1, Math.floor(this.cell.w / k)), fy: Math.max(1, Math.floor(this.cell.h / k)) };
  }

  // HD: ambient animation (light flicker, the sky) is held for steps of
  // 1 / AMBIENT_HZ s; the step of the last draw (null outside HD).
  private static readonly AMBIENT_HZ = 3;
  private ambient: number | null = null;
  private drawnFigs: Fig[] = []; // the characters as last drawn

  // The finished scene in HD mode: the canvas to blow up by `scale` and
  // show over the scene's cells (left blank by draw), or null.
  // For streaming it (see HdStream in app.ts), what changes it on purpose
  // rather than as ambient animation: `hot`, boxes in canvas pixels round
  // each figure (with its emote and the light it carries), the critter and
  // every bolt; `view`, the camera (a change moves everything); `ambient`,
  // the step of ambient time drawn.
  hdImage(): { canvas: PixelCanvas; scale: number; rect: Rect; cell: { w: number; h: number }; detail: Detail | null; tags: readonly Tag[]; hot: Box[]; view: string; ambient: number | null } | null {
    if (this.mode !== 'hd' || !this.L || this.rect.w <= 0 || this.rect.h <= 0) return null;
    const scale = this.hdScale();
    const detail = this.detailOn && scale > 1 ? { idx: this.detail, pats: contourPatterns(scale) } : null;
    const z = this.zoom;
    const zf = z >= 0.999 ? Math.round(z) : z; // screen pixels per world pixel
    const m = z >= 0.999 ? zf : 1; // per sprite pixel (zoomed out, figures stay full size)
    const hot: Box[] = [];
    const around = (x: number, y: number, at: number, half: number, up: number, down: number) => {
      const [fx, fy] = this.toScreen(...project(this.view, x, y, at));
      hot.push({ x0: Math.floor(fx - half), y0: Math.floor(fy - up), x1: Math.ceil(fx + half), y1: Math.ceil(fy + down) });
    };
    // Each figure as drawn: its sprite with the glow its lit pixels spread
    // (the light grid's 4 blur passes of a 4 px cell, plus a cell gathering
    // and one upsampling: 24 px), the pool of the light it carries (its
    // radius plus a cell), and its emote above. Nothing it changes, by even
    // one level, lies outside (see glow.ts).
    const glow = 24;
    for (const f of this.drawnFigs) {
      const sp = f.sp;
      const [fx, fy] = this.toScreen(f.sx, f.sy);
      const b = { x0: fx + (sp.dx - sp.ax) * m - glow * zf, y0: Math.min(fy + (sp.dy - sp.ay) * m - glow * zf, fy - EMOTE_LIFT - 17), x1: fx + (sp.dx - sp.ax + sp.w) * m + glow * zf, y1: fy + (sp.dy - sp.ay + sp.h) * m + glow * zf };
      if (sp.light) {
        const r = (sp.light.radius + 5) * zf;
        const cx = fx + (sp.light.dx + sp.dx) * zf;
        const cy = fy + (sp.light.dy + sp.dy) * zf;
        Object.assign(b, { x0: Math.min(b.x0, cx - r), y0: Math.min(b.y0, cy - r), x1: Math.max(b.x1, cx + r), y1: Math.max(b.y1, cy + r) });
      }
      hot.push({ x0: Math.floor(b.x0) - 1, y0: Math.floor(b.y0) - 1, x1: Math.ceil(b.x1) + 1, y1: Math.ceil(b.y1) + 1 });
    }
    const cr = this.critter;
    // The critter while it trots or shows a heart; sitting, it is scenery.
    if (cr && (cr.moving || cr.heartUntil > this.life.clock)) around(cr.x, cr.y, this.L.floor, Math.max(8 * m, 6 * zf) + 2, Math.max(28, 12 * m), 4 * m + 2);
    for (const p of this.particles) if (p.target) around(p.x, p.y, p.z, 4 * zf + 2, 4 * zf + 2, 4 * zf + 2);
    const view = z >= 0.999 ? `${zf},${Math.round(this.cam.x)},${Math.round(this.cam.y)}` : `${z.toFixed(3)},${Math.round(this.cam.x * z * 4)},${Math.round(this.cam.y * z * 4)}`;
    return { canvas: this.screen, scale, rect: this.rect, cell: this.cell, detail, tags: this.tags, hot, view, ambient: this.ambient };
  }

  // Cells taken by labels and bubbles in the last draw.
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

  layout(r: Rect): void {
    this.rect = r;
    // Nothing to show: keep the world as it is and skip drawing.
    if (r.w <= 0 || r.h <= 0) return;
    const g = this.grid();
    const cw = r.w * g.fx;
    const ch = r.h * g.fy;
    this.screen = new PixelCanvas(cw, ch);
    // HD has pixels to spare: the world is planned at one voxel per pixel.
    const k = this.mode !== 'sextant' || cw < SCALE_MIN.w || ch < SCALE_MIN.h ? 1 : WORLD_SCALE;
    this.k = k;
    const L = planLayout(cw * k, ch * k, this.biome.id);
    const key = `${this.biome.id}:${L.W}x${L.D}x${L.H}`;
    if (key !== this.worldKey) this.build(L, key);
    else this.L = L;
    this.cam.set = false;
    for (const a of this.cast.values()) {
      Object.assign(a, this.clampToFloor(a));
      a.z = -1;
      a.station = null;
      a.path = [];
      this.life.end(a);
      if (a.state === 'enter') Object.assign(a, this.door()?.spot ?? {});
      if (a.state === 'leave') this.retargetExit(a);
      else this.retarget(a);
    }
  }

  // Generates the biome into a fresh world sized for the layout and casts
  // every pixel once; plans where life goes on in it.
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
    this.ghostD = new Float32Array(w * h).fill(-Infinity);
    this.ghostC = new Int32Array(w * h);
    this.caster = new Caster(v, this.T, w, h, this.view);
    const b = this.biome.backdrop;
    // Translucent edges against the void blend over the biome's backdrop.
    this.caster.backdrop = (b[0] << 16) | (b[1] << 8) | b[2];
    this.caster.renderAll();
    this.particles = [];
    this.glyphs = [];
    this.lights = [];
    const seed = hashString(this.biome.id);
    this.works = new Works(v, L, this.biome.build ?? defaultStyle(v, L), new Rng(seed ^ 0xb111d));
    this.blocksAt = -1;
    this.nav = null;
    this.spots = (this.biome.pois?.(L) ?? defaultPois(L, v)).filter((p) => p.x > L.T && p.y > L.T && p.x < L.W - 1 && p.y < L.D - 1);
    const home = this.spots.find((p) => p.kind === 'pet');
    const g = Math.max(0, Math.min(1, (L.W - 72) / 98));
    this.critter = home ? new Critter(critterFor(this.biome.id), home, 6 + 4 * g, seed ^ 0xca7) : null;
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

  // Inside some prop's footprint, a build or a pile (grown by `margin`).
  private inside(s: Spot, margin: number): boolean {
    for (const p of this.stations()) {
      const r = slotRect(p);
      if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    }
    const o = this.obstacles();
    for (const d of o.discs) if (Math.hypot(s.x - d.x, s.y - d.y) < d.r + margin) return true;
    for (const r of o.rects) if (s.x > r.x0 - margin && s.x < r.x1 + margin && s.y > r.y0 - margin && s.y < r.y1 + margin) return true;
    return false;
  }

  // A build or pile appeared (or went): walkers re-plan round it, and anyone
  // standing where it now is steps out of the way.
  private makeWay(): void {
    for (const a of this.cast.values()) {
      if (a.state === 'enter') continue;
      if (a.path.length) {
        const to = a.path[a.path.length - 1];
        this.walkTo(a, to);
      } else if (this.inside(a, 0.3)) {
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

  // Bare floor with headroom, in view: no decor, pool or furniture
  // underfoot or overhead, nor anything just in front (toward the camera,
  // along +x +y) tall enough to hide most of whoever stands there. A lane
  // spot can land anywhere along the wall.
  private level(s: Spot): boolean {
    const v = this.v;
    const L = this.L;
    if (!v || !L) return true;
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    const g = v.ground(x, y);
    if (Math.abs(g - L.floor) > 2) return false;
    for (let z = g; z < g + 12; z++) if (v.get(x, y, z) !== M.AIR) return false;
    // Zoomed out a figure stays full size, so it spans more of the world.
    const z = Math.max(this.fitZoom(), 0.5);
    for (let dy = 0; dy <= 14; dy++) {
      for (let dx = dy ? 0 : 1; dx <= 14; dx++) {
        // Across the middle of the figure, taller than a third of it.
        if (Math.abs(dx - dy) > 3 / z) continue;
        if (v.ground(x + dx, y + dy, L.floor + 32) - L.floor > (dx + dy) / 2 + 5 / z) return false;
      }
    }
    return true;
  }

  private idleFor(a: Actor): number {
    return (this.now - a.info.since) / 1000;
  }

  // Someone stands in voxel (x, y, z).
  private occupied(x: number, y: number, z: number): boolean {
    for (const a of this.cast.values()) {
      if (Math.abs(x + 0.5 - a.x) >= 1.3 || Math.abs(y + 0.5 - a.y) >= 1.3) continue;
      const az = this.zOf(a);
      if (z >= az - 1 && z < az + 14) return true;
    }
    return false;
  }

  // Due at another prop: the activity wants a different one, has lasted a
  // moment, and the agent has worked at its current one a while.
  private moving(a: Actor, now: number): boolean {
    if (a.state === 'leave' || !this.L) return false;
    const kind = stationKindFor(a.info.activity);
    if (!kind || kind === 'idle' || a.station?.kind === kind) return false;
    if (now - a.info.since < SETTLE_MS) return false;
    return !a.station || a.state !== 'work' || now - a.settledAt >= DWELL_MS;
  }

  private retarget(a: Actor): void {
    const kind = stationKindFor(a.info.activity);
    if (!kind || !this.L) return;
    if (kind === 'idle' && this.idleFor(a) < SLEEP_AFTER) {
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
    const zoom = Math.max(this.fitZoom(), 0.5);
    const step = Math.ceil(LANE_PX / zoom);
    // Along the wall; out on the floor, across the screen in front of the
    // prop (along +x -y), a row further out a step down the screen, so no
    // one stands beside or behind it.
    const spotFor = (k: number): Spot => {
      const along = LANES[k][0] * step;
      const out = LANES[k][1] * step;
      if (st.island) return this.clampToFloor({ x: st.spot.x + along / 2 + out, y: st.spot.y - along / 2 + out });
      return this.clampToFloor(st.wall === 'right' ? { x: st.spot.x + along, y: st.spot.y + out } : { x: st.spot.x + out, y: st.spot.y + along });
    };
    // How far apart two spots are on screen, in pixels.
    const px = (p: Spot, q: Spot) => Math.hypot(p.x - q.x - (p.y - q.y), (p.x - q.x + p.y - q.y) / 2) * zoom;
    const gap = (s: Spot, to: Spot[]) => Math.min(Infinity, ...to.map((o) => px(s, o)));
    // The first free lane on bare floor clear of every prop that keeps a
    // step from everyone round it and off the other props' own spots; then
    // the first a step from the others there and off those spots; then a
    // step from the others there; then one not on top of them
    // (LANE_APART_PX: clamping to the floor lands lanes together); then the
    // one furthest from them, clear if any is. With every lane taken, any.
    const free = [...LANES.keys()].filter((k) => !taken.has(k));
    const lanes = (free.length ? free : [...LANES.keys()]).map((k) => ({ k, s: spotFor(k) }));
    // (Clamped to the floor, an island's lane can end up beside it.)
    const before = (s: Spot) => !st.island || s.x + s.y >= st.spot.x + st.spot.y - 1;
    const clear = lanes.filter((l) => !this.inside(l.s, 1.5) && this.level(l.s) && before(l.s));
    const props = this.L.slots.filter((p) => p !== st).map((p) => p.spot);
    const mates = (l: { k: number; s: Spot }) => gap(l.s, there) >= LANE_PX;
    const own = (l: { k: number; s: Spot }) => l.k === 0 || gap(l.s, props) >= LANE_PX;
    const pick =
      clear.find((l) => mates(l) && own(l) && gap(l.s, near) >= LANE_PX) ??
      clear.find((l) => mates(l) && own(l)) ??
      clear.find(mates) ??
      clear.find((l) => gap(l.s, there) >= LANE_APART_PX) ??
      [...(clear.length ? clear : lanes)].sort((p, q) => gap(q.s, there) - gap(p.s, there))[0];
    a.station = st;
    a.lane = pick.k;
    this.walkTo(a, pick.s);
    if (a.state === 'work') a.state = 'walk';
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

  private route(from: Spot, to: Spot): Spot[] | null {
    const L = this.L;
    if (!L) return null;
    const key = `${this.worldKey}:${this.works?.version ?? 0}`;
    if (!this.nav || this.navKey !== key) {
      this.navKey = key;
      this.nav = new NavGrid(L.T, L.T, L.W - 1, L.D - 1, NAV_CELL, (x, y) => (this.inside({ x, y }, 0.8) ? 2 : this.inside({ x, y }, NAV_PAD) ? 1 : 0));
    }
    const cells = this.nav.find(from, to);
    if (!cells) return null;
    return smooth(from, [...cells.slice(1, -1), to], (p, q) => !this.clips(p, q));
  }

  sync(agents: AgentInfo[], now: number): void {
    this.now = now;
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
      const prev = a.info;
      const changed = prev.activity !== info.activity || prev.detail !== info.detail;
      const kindChanged = stationKindFor(prev.activity) !== stationKindFor(info.activity);
      a.info = info;
      a.mind.exit = 0;
      if (changed) a.bubbleUntil = now + BUBBLE_MS;
      if (a.state === 'leave') {
        a.state = 'walk';
        this.life.end(a);
        this.retarget(a);
        continue;
      }
      if (prev.activity !== info.activity) this.life.changed(a);
      else if (prev.detail !== info.detail) this.life.detail(a);
      // Off to the new prop once the change has lasted (see update).
      if (kindChanged && stationKindFor(info.activity) === 'idle') this.retarget(a);
    }
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
      error: null,
      cheered: -1,
      settledAt: now,
      gait: 0,
      mind: newMind(info.id, this.life.clock),
    };
    this.cast.set(info.id, a);
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
          a.settledAt = now;
        }
      } else if (a.state === 'work') {
        a.state = 'walk';
      }
      this.settle(a, dt);
      this.effects(a, dt, now);
    }
    this.life.update([...this.cast.values()], dt);
    if ((this.works?.version ?? -1) !== this.blocksAt) this.makeWay();
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
    // Finished builds shine from the top.
    for (const b of this.works?.beacons() ?? []) {
      const g = MATERIALS[b.mat]?.glow ?? [255, 216, 144];
      this.lights.push({ x: b.x, y: b.y, z: b.z + 1, color: g, radius: 20, intensity: 0.85 + 0.1 * Math.sin(this.clock * 2.3) });
    }
    this.simAcc = Math.min(this.simAcc + dt, 3 / SIM_HZ);
    while (this.simAcc >= 1 / SIM_HZ) {
      step(v, this.T, this.simRng, this.tick++, (p) => this.add(p));
      this.simAcc -= 1 / SIM_HZ;
    }
    heal(v, this.T, this.simRng, Math.round(1500 * Math.max(1, v.size / 1_734_000)), (x, y, z) => actors.some((a) => Math.abs(x + 0.5 - a.x) < 3 && Math.abs(y + 0.5 - a.y) < 3 && z < a.z + 14));
    updateParticles(this.particles, v, this.T, dt, this.simRng);
  }

  private move(a: Actor, dt: number): void {
    let left = 0;
    let at: Spot = a;
    for (const p of a.path) {
      left += Math.hypot(p.x - at.x, p.y - at.y);
      at = p;
    }
    const big = Math.max(this.k, (this.L?.W ?? 0) / JOG_ROOM);
    const jog = Math.max(1, Math.min(JOG * big, (left * big) / (JOG_OVER * this.k)));
    let budget = WALK * this.life.pace(a) * jog * dt;
    // Zoomed out the figures stay full size: a jog is slower beside them.
    if (a.path.length) a.gait += dt * (Math.max(1, Math.min(GAIT_MAX, jog * Math.min(1, this.zoom))) - 1);
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
  // subagent, long naps drift z's. Those around react (see life.ts).
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
      // Toward the middle of the cave, so the crater opens in front of them;
      // at a prop out on the floor, behind them, away from the prop.
      const isle = a.station?.island ? a.station : null;
      const kx = isle ? (isle.wall === 'left' ? 7 : 0) : Math.sign(L.W * 0.55 - a.x) * 6;
      const ky = isle ? (isle.wall === 'right' ? 7 : 0) : Math.sign(L.D * 0.55 - a.y) * 6;
      explode(v, this.T, Math.round(a.x + kx), Math.round(a.y + ky), z, 4, this.simRng, (p) => this.add(p));
      this.life.boom(a.x + kx, a.y + ky, a, this.cast.values());
      a.error = { until: now + ERROR_MS, text: a.info.detail || 'tool failed', x: a.x + kx, y: a.y + ky, z };
    }
    // A real error is followed at once by the next tool call: the crater
    // smokes and '!'s keep rising for a while anyway.
    const err = a.error && now < a.error.until ? a.error : null;
    if (err && now < err.until - ERROR_MS + SMOKE_MS && r.next() < dt * 14) {
      const grey = 70 + r.int(0, 40);
      this.add({ kind: 'spark', x: err.x + r.range(-1.5, 1.5), y: err.y + r.range(-1.5, 1.5), z: err.z + 1, vx: r.range(-0.6, 0.6), vy: r.range(-0.6, 0.6), vz: 5 + r.next() * 3, life: 1.6 + r.next(), color: [grey, grey - 4, grey + 2], glow: false, gravity: -1 });
    }
    if ((act === 'error' || err) && r.next() < dt / 0.7) this.glyphs.push({ x: a.x, y: a.y, z: head + 2, vz: 4, ch: '!', color: pal.bad, life: 0.8 });
    if (act === 'done' && a.cheered !== a.info.since) {
      a.cheered = a.info.since;
      const colors = [pal.accent, pal.accent2, pal.good, pal.warn, a.traits.color];
      for (let i = 0; i < 46; i++) {
        const ang = r.next() * Math.PI * 2;
        const sp = 4 + r.next() * 8;
        this.add({ kind: 'spark', x: a.x, y: a.y, z: head + 4, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, vz: 10 + r.next() * 12, life: 0.8 + r.next() * 0.8, color: r.pick(colors), glow: true, gravity: 14 });
      }
      const fin = this.biome.finale ?? GOLD;
      for (let i = 0; i < 10; i++) {
        this.add({ kind: 'debris', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 6, vx: r.range(-4, 4), vy: r.range(-4, 4), vz: 6 + r.next() * 6, life: 4, color: r.pick(fin.colors), glow: fin.glow ?? true, gravity: fin.gravity ?? 24, mat: fin.mat });
      }
      this.life.finished(a, this.cast.values());
    }
    if (act === 'delegate' && every(1.2)) {
      const sub = [...this.cast.values()].find((o) => o.info.parentId === a.info.id && o.state !== 'leave');
      if (sub) {
        const tz = this.zOf(sub) + 8;
        this.add({ kind: 'bolt', x: a.x, y: a.y, z: head, vx: 0, vy: 0, vz: 6, life: 3, color: a.traits.color, glow: true, gravity: 0, target: { x: sub.x, y: sub.y, z: tz } });
        this.life.cast(a, sub);
      }
    }
    if (act === 'talk' && every(0.5)) this.add({ kind: 'glint', x: a.x + r.range(-2, 2), y: a.y + r.range(-2, 2), z: head + 2, vx: 0, vy: 0, vz: 3, life: 0.5, color: a.traits.color, glow: true, gravity: 0 });
    if (this.life.sleeping(a) && every(1.1)) this.glyphs.push({ x: a.x, y: a.y, z: head + 2, vz: 5, ch: r.pick(['z', 'Z']), color: pal.dim, life: 2 });
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

  private colorOf(mat: number): RGB {
    const c = this.T.color[(mat << 3) | 4];
    return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
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
    const ghost = this.ghosts();
    const lights = [...this.lights];
    const actors = [...this.cast.values()].sort((m, n) => m.x + m.y - (n.x + n.y));
    const sprites = new Map<Actor, Placed>();
    const figs: Fig[] = [];
    const costume = this.biome.costume ?? 'wizard';
    for (const a of actors) {
      const z = this.zOf(a);
      const look = this.lookOf(a, now);
      const opts = look.item !== undefined ? { costume, item: this.colorOf(look.item) } : { costume };
      const sp = wizardSprite(a.traits, look.pose, t + a.gait, look.facing, a.phase, opts);
      const [sx, sy] = project(this.view, a.x, a.y, z);
      // Fading in at the door: drawn only once the entrance flash is over.
      const shown = a.state !== 'enter' || now - a.bornAt > ENTER_MS * 0.5;
      figs.push({ sp, sx, sy, d: depthOf(a.x, a.y, z) + 1, shown, outline: true });
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
    const cr = this.critter;
    let crAt: Placed | null = null;
    if (cr) {
      // On the floor (never up on a ledge or a cap overhead).
      const cz = v.ground(Math.floor(cr.x), Math.floor(cr.y), this.L.floor + 4) + cr.hover(t);
      const csp = cr.sprite(t);
      const [cx, cy] = project(this.view, cr.x, cr.y, cz);
      figs.push({ sp: csp, sx: cx, sy: cy, d: depthOf(cr.x, cr.y, cz) + 1, shown: true, outline: true });
      crAt = { sx: cx, sy: cy, top: Math.round(cy) - csp.ay };
    }
    this.aim(actors, sprites, selectedId);
    const sel = actors.find((a) => a.info.id === selectedId);
    const pulse = 0.8 + 0.2 * Math.sin(t * Math.PI * 2);
    // Zoomed out, figures are drawn full size over the world after it is
    // scaled (billboards); at full detail, into the world itself, lit.
    const board = this.zoom < 0.999;
    // Errors flash a red ring for a while.
    const hurt = actors.filter((a) => a !== sel && a.error && now < a.error.until);
    const flash = 0.6 + 0.4 * Math.abs(Math.sin(t * Math.PI * 3));
    if (!board) {
      if (sel) this.ringInWorld(sel, pulse);
      for (const a of hurt) this.ringInWorld(a, flash, this.biome.palette.bad);
      for (const f of figs) if (f.shown) blitSprite(this.albedo, this.emit, this.depth, w, h, f.sp, f.sx, f.sy, f.d);
    } else {
      for (const [a, at] of sprites) {
        const f = figs[actors.indexOf(a)];
        at.top = at.sy + (f.sp.dy - f.sp.ay) / this.zoom;
      }
      if (crAt) crAt.top = crAt.sy - 6 / this.zoom;
    }
    drawParticles(this.albedo, this.emit, this.depth, w, h, this.particles, this.view);
    // HD holds the light flicker and the sky for an ambient step, so the
    // streamed image changes there a few times a second, all at once.
    this.ambient = this.mode === 'hd' ? Math.floor(t * Stage.AMBIENT_HZ) : null;
    this.glow.compose(this.world, this.albedo, this.emit, this.view, lights, this.biome.grade, this.lit, this.biome.backdrop, this.ambient);
    this.ghostShown = this.overlayGhosts(ghost, caster.albedo);
    this.crop();
    if (this.biome.sky) paintSky(this.screen, this.biome.sky, this.biome.backdrop, this.ambient === null ? t : this.ambient / Stage.AMBIENT_HZ);
    this.drawnFigs = figs.slice(0, actors.length);
    if (board) {
      if (sel) this.ringOnScreen(sel, pulse);
      for (const a of hurt) this.ringOnScreen(a, flash, this.biome.palette.bad);
      for (const f of figs) if (f.shown) this.billboard(f);
    }
    const bubbles = this.drawEmotes(actors, sprites, crAt, t, selectedId);
    const g = this.grid();
    if (this.mode === 'hd') s.punch(r);
    else if (this.mode === 'sextant') this.screen.blitSextant(s, r, this.biome.backdrop);
    else this.screen.blit(s, r, this.biome.backdrop);
    for (const p of this.glyphs) {
      const [x, y] = this.toScreen(...project(this.view, p.x, p.y, p.z));
      const cx = r.x + Math.floor(Math.round(x) / g.fx);
      const cy = r.y + Math.floor(Math.round(y) / g.fy);
      if (cx >= r.x && cx < r.x + r.w && cy >= r.y && cy < r.y + r.h) s.put(cx, cy, p.ch, p.color);
    }
    this.drawLabels(s, actors, sprites, bubbles, now, selectedId);
  }

  // Each build under way shows what it will be: the voxels still to lay as
  // a hologram (see GHOST_HUE), every other voxel lit (a 3D checker), with
  // a band sweeping up it. Drawn into the frame, never into the world, so
  // nothing walks, casts or simulates against it. Each pixel shows only the
  // nearest ghost voxel, so the far side stays hidden behind the near, and
  // only where it is in front of the world. Returns [pixel, code, rise,
  // span] runs, flat: the code is the face (0 top, 1 left, 2 right), +4 on
  // the lit half of the checker; `rise` the pixel's height above the foot
  // of its build's ghost, `span` that ghost's height (for the band).
  private ghosts(): number[] {
    const { w, h } = this.world;
    const D = this.ghostD;
    const C = this.ghostC;
    const out: number[] = [];
    for (const c of this.works?.builds ?? []) {
      if (c.complete) continue;
      const hit: number[] = [];
      const mark = (x: number, y: number, d: number, code: number) => {
        if (x < 0 || y < 0 || x >= w || y >= h) return;
        const i = y * w + x;
        if (d <= D[i]) return;
        if (D[i] === -Infinity) hit.push(i);
        D[i] = d;
        C[i] = code;
      };
      for (const b of c.ghost()) {
        // The voxel covers a hexagon round the projection of its near
        // corner: the pixels whose centres fall in it are a 2x2 block (top
        // face above, the two side faces below) when that point is on a
        // pixel corner, else the two side faces on its row.
        const [sx, sy] = project(this.view, b.x, b.y, b.z);
        const d = depthOf(b.x, b.y, b.z) + 1.5;
        const on = ((b.x + b.y + b.z) & 1) === 0 ? 4 : 0;
        const x = Math.round(sx);
        const y = Math.floor(sy);
        if (y === sy) {
          mark(x - 1, y - 1, d, on);
          mark(x, y - 1, d, on);
        }
        mark(x - 1, y, d, on | 1);
        mark(x, y, d, on | 2);
      }
      // With the particles' depth bias.
      const front = hit.filter((i) => D[i] >= this.depth[i] - 0.5);
      let top = Infinity;
      let foot = -Infinity;
      for (const i of front) {
        top = Math.min(top, Math.floor(i / w));
        foot = Math.max(foot, Math.floor(i / w));
      }
      for (const i of front) out.push(i, C[i], foot - Math.floor(i / w), foot - top);
      for (const i of hit) D[i] = -Infinity;
    }
    return out;
  }

  // The ghost's hue: cyan where the world is warm (its ambient light and
  // backdrop redder than blue), amber where it is cold.
  ghostHue(): RGB {
    const a = this.biome.grade.ambient;
    const b = this.biome.backdrop;
    return a[0] + b[0] > a[2] + b[2] ? GHOST_HUE.warm : GHOST_HUE.cold;
  }

  // Lays the ghost over the lit frame as light of its own that lights
  // nothing else (a whole blueprint of glow would flood the plaza), except
  // where a figure or a particle was drawn over the world since: what is
  // behind it tinted toward the hue, strongly on the lit half of the
  // checker, faintly on the unlit half, and a little whiter in the band
  // and on the outline (silhouette pixels with a side off it), so it reads
  // on any floor. The band rises from the foot to past the top once every
  // SCAN_S, in HD on the ambient step (so a still room stays still between
  // steps). Returns the pixels shown.
  private overlayGhosts(found: number[], bare: Int32Array): number {
    const data = this.world.data;
    const w = this.world.w;
    const b = this.biome.backdrop;
    const back = (b[0] << 16) | (b[1] << 8) | b[2];
    const hue = this.ghostHue();
    const rim = mix(hue, [255, 255, 255], 0.4);
    const time = this.ambient === null ? this.clock : this.ambient / Stage.AMBIENT_HZ;
    const phase = (time % SCAN_S) / SCAN_S;
    const inside = new Set<number>();
    for (let n = 0; n < found.length; n += 4) inside.add(found[n]);
    let shown = 0;
    for (let n = 0; n < found.length; n += 4) {
      const i = found[n];
      if (this.albedo[i] !== bare[i]) continue;
      const code = found[n + 1];
      const at = phase * (found[n + 3] + SCAN_H + 1);
      const band = found[n + 2] >= at && found[n + 2] < at + SCAN_H;
      const p = data[i] === CLEAR ? back : data[i];
      const edge = !inside.has(i - 1) || !inside.has(i + 1) || !inside.has(i - w) || !inside.has(i + w);
      const lit = edge || band;
      const f = lit ? 1 : GHOST_FACE[code & 3];
      const c = lit ? rim : hue;
      const k = edge ? GHOST_EDGE : band ? GHOST_SCAN : code & 4 ? GHOST : GHOST_DIM;
      const keep = 1 - k;
      data[i] =
        ((((p >> 16) & 255) * keep + c[0] * f * k) << 16) |
        ((((p >> 8) & 255) * keep + c[1] * f * k) << 8) |
        (((p & 255) * keep + c[2] * f * k) | 0);
      shown++;
    }
    return shown;
  }

  // A figure drawn 1:1 on the scaled screen: a soft shadow at the feet, a
  // dark outline, hidden where something in the world stands in front.
  private billboard(f: Fig): void {
    const S = this.screen;
    const W = this.world;
    const z = this.zoom;
    const sp = f.sp;
    const [fx, fy] = this.toScreen(f.sx, f.sy);
    const left = Math.round(fx + sp.dx) - sp.ax;
    const top = Math.round(fy + sp.dy) - sp.ay;
    const behind = (x: number, y: number) => {
      const wx = Math.floor(this.cam.x + (x + 0.5) / z);
      const wy = Math.floor(this.cam.y + (y + 0.5) / z);
      if (wx < 0 || wy < 0 || wx >= W.w || wy >= W.h) return false;
      return f.d < this.depth[wy * W.w + wx] - 0.5;
    };
    const dim = (x: number, y: number, k: number) => {
      if (x < 0 || y < 0 || x >= S.w || y >= S.h) return;
      const i = y * S.w + x;
      const c = S.data[i];
      if (c === CLEAR) return;
      S.data[i] = ((((c >> 16) & 255) * k) << 16) | ((((c >> 8) & 255) * k) << 8) | ((c & 255) * k);
    };
    const cx = Math.round(fx);
    const cy = Math.round(fy);
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = -3; dx <= 3; dx++) if (!(dy === 1 && Math.abs(dx) === 3) && !behind(cx + dx, cy + dy)) dim(cx + dx, cy + dy, 0.55);
    }
    const on = (r: number, c: number) => r >= 0 && c >= 0 && r < sp.h && c < sp.w && (sp.px[r]?.[c] || sp.glow[r]?.[c]);
    if (f.outline) {
      for (let r = -1; r <= sp.h; r++) {
        for (let c = -1; c <= sp.w; c++) {
          if (on(r, c) || !(on(r - 1, c) || on(r + 1, c) || on(r, c - 1) || on(r, c + 1))) continue;
          if (!behind(left + c, top + r)) dim(left + c, top + r, 0.25);
        }
      }
    }
    for (let r = 0; r < sp.h; r++) {
      const y = top + r;
      if (y < 0 || y >= S.h) continue;
      for (let c = 0; c < sp.w; c++) {
        const x = left + c;
        if (x < 0 || x >= S.w) continue;
        const gl = sp.glow[r]?.[c];
        const p = sp.px[r]?.[c];
        if ((!gl && !p) || behind(x, y)) continue;
        S.data[y * S.w + x] = gl ? (gl[0] << 16) | (gl[1] << 8) | gl[2] : (((p![0] * 0.92) | 0) << 16) | (((p![1] * 0.92) | 0) << 8) | ((p![2] * 0.92) | 0);
      }
    }
  }

  // A ring on the floor under an agent (the selection, or an error),
  // glowing (full detail).
  private ringInWorld(a: Actor, pulse: number, c: RGB = a.traits.color): void {
    const { w, h } = this.world;
    const z = this.zOf(a);
    const [sx, sy] = project(this.view, a.x, a.y, z);
    const d = depthOf(a.x, a.y, z) + 1;
    const v = (((c[0] * pulse) | 0) << 16) | (((c[1] * pulse) | 0) << 8) | ((c[2] * pulse) | 0);
    RING.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        if (row[rx] !== '#') continue;
        const x = Math.round(sx) - 6 + rx;
        const y = Math.round(sy) - 2 + ry;
        if (x < 0 || y < 0 || x >= w || y >= h) continue;
        const i = y * w + x;
        if (d + 2 < this.depth[i] - 0.5) continue;
        this.albedo[i] = v;
        this.emit[i] = v;
      }
    });
  }

  // The same ring, drawn over the scaled world.
  private ringOnScreen(a: Actor, pulse: number, c: RGB = a.traits.color): void {
    const S = this.screen;
    const [fx, fy] = this.toScreen(...project(this.view, a.x, a.y, this.zOf(a)));
    const v = (((c[0] * pulse) | 0) << 16) | (((c[1] * pulse) | 0) << 8) | ((c[2] * pulse) | 0);
    RING.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        const x = Math.round(fx) - 6 + rx;
        const y = Math.round(fy) - 2 + ry;
        if (row[rx] === '#' && x >= 0 && y >= 0 && x < S.w && y < S.h) S.data[y * S.w + x] = v;
      }
    });
  }

  // Little pictures over heads (and over the critter), drawn full size on
  // the screen like the labels' pictures: not lights, and never more than
  // a few at once (the selected agent's first, then the newest). Returns
  // the screen-pixel box each covers, for the labels to keep clear of.
  private drawEmotes(actors: Actor[], sprites: Map<Actor, Placed>, crAt: Placed | null, t: number, selectedId: string | null): Map<Actor, Box> {
    const out = new Map<Actor, Box>();
    const S = this.screen;
    const c = this.life.clock;
    const put = (e: Parameters<typeof emoteArt>[0], born: number, sx: number, sy: number, lift: number): Box => {
      const art = emoteArt(e, t);
      const [fx, fy] = this.toScreen(sx, sy);
      const x0 = Math.round(fx) - art.ax;
      const y0 = Math.round(fy) - lift - art.ay + (c - born < 0.15 ? 1 : 0);
      for (let r = 0; r < art.h; r++) {
        for (let k = 0; k < art.w; k++) {
          const p = art.px[r]?.[k] ?? art.glow[r]?.[k];
          const x = x0 + k;
          const y = y0 + r;
          if (p && x >= 0 && y >= 0 && x < S.w && y < S.h) S.data[y * S.w + x] = (p[0] << 16) | (p[1] << 8) | p[2];
        }
      }
      return { x0, y0, x1: x0 + art.w, y1: y0 + art.h };
    };
    const showing = actors
      .filter((a) => a.mind.emote && a.mind.emote.born <= c && sprites.has(a) && a.state !== 'enter')
      .sort((m, n) => (m.info.id === selectedId ? -1 : n.info.id === selectedId ? 1 : n.mind.emote!.born - m.mind.emote!.born))
      .slice(0, MAX_EMOTES);
    for (const a of showing) {
      const at = sprites.get(a)!;
      out.set(a, put(a.mind.emote!.e, a.mind.emote!.born, at.sx, at.sy, EMOTE_LIFT));
    }
    const cr = this.critter;
    if (cr && crAt && cr.heartUntil > c && out.size < MAX_EMOTES) put('heart', cr.heartUntil - 1.8, crAt.sx, crAt.sy, 8);
    this.emotesShown = out.size;
    return out;
  }

  // Zoom: + and - step through ZOOMS (never past fitting the whole world);
  // `zoomAuto` hands it back to the stage.
  zoomBy(dir: 1 | -1): void {
    const fit = this.fitZoom();
    const top = this.mode === 'hd' ? 3 : 1;
    const levels = [...new Set([...ZOOMS, 2, 3, fit])].filter((z) => z >= fit - 1e-9 && z <= top).sort((m, n) => m - n);
    const at = this.zoomWant ?? this.zoom;
    const next = dir > 0 ? levels.find((z) => z > at + 1e-6) : [...levels].reverse().find((z) => z < at - 1e-6);
    this.zoomWant = next ?? (dir > 0 ? levels[levels.length - 1] : levels[0]);
  }

  zoomAuto(): void {
    this.zoomWant = null;
  }

  get zoomLevel(): number {
    return this.zoom;
  }

  // The zoom that shows the whole lit world in the scene (at most 1),
  // snapped down to 1/2 or 1/3 where those fit, so iso edges step evenly.
  private fitZoom(): number {
    const W = this.world;
    const S = this.screen;
    if (W.w === 0 || W.h === 0) return 1;
    const fit = Math.min(1, S.w / W.w, S.h / W.h);
    // A world planned at screen size that only just misses (the smallest
    // room in a small scene) stays at full detail, the camera following.
    if (this.k === 1 && fit >= 0.75) return 1;
    return [1, 1 / 2, 1 / 3].find((z) => z <= fit + 1e-9) ?? fit;
  }

  // World-canvas pixel → screen-canvas pixel at the current camera.
  private toScreen(x: number, y: number): [number, number] {
    // At full detail and magnified the window sits on whole pixels (see crop).
    if (this.zoom >= 0.999) {
      const k = Math.round(this.zoom);
      return [(x - Math.round(this.cam.x)) * k, (y - Math.round(this.cam.y)) * k];
    }
    return [(x - this.cam.x) * this.zoom, (y - this.cam.y) * this.zoom];
  }

  // Eases the zoom (fit, or as asked; full detail on a selected agent) and
  // pans the camera: centred where the world fits, otherwise following the
  // selected agent (or the crowd).
  private aim(actors: Actor[], sprites: Map<Actor, Placed>, selectedId: string | null): void {
    const W = this.world;
    const S = this.screen;
    const sel = actors.find((a) => a.info.id === selectedId);
    // HD has pixels to spare: a selected agent gets a 2x close-up.
    const want = this.zoomWant ?? (sel ? (this.mode === 'hd' ? 2 : 1) : this.fitZoom());
    const z0 = this.cam.set ? this.zoom : want;
    // Magnified steps are whole numbers and snap; zooming out eases.
    this.zoom = want > 1 || z0 > 1 || Math.abs(want - z0) < 0.004 ? want : z0 + (want - z0) * 0.2;
    const z = this.zoom;
    const vw = S.w / z;
    const vh = S.h / z;
    const focus = (len: number, view: number, at: number) => (len <= view ? (len - view) / 2 : Math.max(0, Math.min(len - view, at - view / 2)));
    let fx = W.w / 2;
    let fy = W.h / 2;
    const pts = sel ? [sprites.get(sel)!] : actors.map((a) => sprites.get(a)!);
    if (pts.length) {
      fx = pts.reduce((sum, p) => sum + p.sx, 0) / pts.length;
      fy = pts.reduce((sum, p) => sum + p.sy - 8, 0) / pts.length;
    }
    const tx = focus(W.w, vw, fx);
    const ty = focus(W.h, vh, fy);
    if (!this.cam.set) Object.assign(this.cam, { x: tx, y: ty, set: true });
    this.cam.x += (tx - this.cam.x) * 0.15;
    this.cam.y += (ty - this.cam.y) * 0.15;
  }

  // HD at full detail: which surface pattern each screen pixel gets, from
  // the voxel its ray hit — none where a character, particle or effect was
  // drawn over the world (its colour no longer matches the raw cast).
  private surfaces(ox: number, oy: number): void {
    const W = this.world;
    const S = this.screen;
    const caster = this.caster!;
    if (this.detail.length !== S.w * S.h) this.detail = new Uint16Array(S.w * S.h);
    this.detail.fill(0);
    for (let y = 0; y < S.h; y++) {
      const wy = y + oy;
      if (wy < 0 || wy >= W.h) continue;
      for (let x = Math.max(0, -ox); x < Math.min(S.w, W.w - ox); x++) {
        const wi = wy * W.w + x + ox;
        const hit = caster.hit[wi];
        if (hit < 0 || this.albedo[wi] !== caster.albedo[wi]) continue;
        // Silhouette edges: a neighbour much farther along its ray (or the
        // void) on that side.
        const d = caster.depth[wi];
        const wx = x + ox;
        const far = (j: number, ok: boolean) => !ok || d - caster.depth[j] > 3;
        let f = 0;
        if (far(wi + 1, wx + 1 < W.w)) f |= 1;
        if (far(wi + W.w, wy + 1 < W.h)) f |= 2;
        if (far(wi - 1, wx > 0)) f |= 4;
        if (far(wi - W.w, wy > 0)) f |= 8;
        this.detail[y * S.w + x] = f;
      }
    }
    this.detailOn = true;
  }

  // Shows the lit world in the screen canvas at the camera. Zoomed out,
  // every screen pixel stands for the block of world pixels under it.
  private crop(): void {
    const W = this.world;
    const S = this.screen;
    const z = this.zoom;
    S.data.fill(CLEAR);
    this.detailOn = false;
    if (z > 1.5) {
      // Magnified (HD close-up): every world pixel becomes a k x k block.
      const k = Math.round(z);
      const ox = Math.round(this.cam.x);
      const oy = Math.round(this.cam.y);
      for (let y = 0; y < S.h; y++) {
        const wy = oy + Math.floor(y / k);
        if (wy < 0 || wy >= W.h) continue;
        for (let x = 0; x < S.w; x++) {
          const wx = ox + Math.floor(x / k);
          if (wx >= 0 && wx < W.w) S.data[y * S.w + x] = W.data[wy * W.w + wx];
        }
      }
      return;
    }
    if (z >= 0.999) {
      const ox = Math.round(this.cam.x);
      const oy = Math.round(this.cam.y);
      for (let y = 0; y < S.h; y++) {
        const wy = y + oy;
        if (wy < 0 || wy >= W.h) continue;
        const x0 = Math.max(0, -ox);
        const x1 = Math.min(S.w, W.w - ox);
        if (x1 > x0) S.data.set(W.data.subarray(wy * W.w + x0 + ox, wy * W.w + x1 + ox), y * S.w + x0);
      }
      if (this.mode === 'hd') this.surfaces(ox, oy);
      return;
    }
    // Source span [at[i], at[i+1]) of every screen column and row.
    if (this.colsAt.length !== S.w + 1) this.colsAt = new Int32Array(S.w + 1);
    if (this.rowsAt.length !== S.h + 1) this.rowsAt = new Int32Array(S.h + 1);
    const cols = this.colsAt;
    const rows = this.rowsAt;
    for (let i = 0; i <= S.w; i++) cols[i] = Math.floor(this.cam.x + i / z);
    for (let i = 0; i <= S.h; i++) rows[i] = Math.floor(this.cam.y + i / z);
    const bd = this.biome.backdrop;
    const src = W.data;
    for (let y = 0; y < S.h; y++) {
      const y0 = rows[y];
      const y1 = Math.max(y0 + 1, rows[y + 1]);
      for (let x = 0; x < S.w; x++) {
        const x0 = cols[x];
        const x1 = Math.max(x0 + 1, cols[x + 1]);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        let all = 0;
        for (let sy = y0; sy < y1; sy++) {
          for (let sx = x0; sx < x1; sx++) {
            all++;
            if (sx < 0 || sy < 0 || sx >= W.w || sy >= W.h) continue;
            const v = src[sy * W.w + sx];
            if (v === CLEAR) continue;
            r += (v >> 16) & 255;
            g += (v >> 8) & 255;
            b += v & 255;
            n++;
          }
        }
        if (n === 0) continue;
        if (n === all) {
          // Inside the world: the block's own colour nearest its mean, so
          // small things stay crisp instead of blending into new tones.
          const mr = r / n;
          const mg = g / n;
          const mb = b / n;
          let best = 0;
          let bestD = Infinity;
          for (let sy = y0; sy < y1; sy++) {
            for (let sx = x0; sx < x1; sx++) {
              const v = src[sy * W.w + sx];
              const d = (((v >> 16) & 255) - mr) ** 2 + (((v >> 8) & 255) - mg) ** 2 + ((v & 255) - mb) ** 2;
              if (d < bestD) {
                bestD = d;
                best = v;
              }
            }
          }
          S.data[y * S.w + x] = best;
          continue;
        }
        // Edges against the void fade into the backdrop instead of haloing.
        const k = all - n;
        S.data[y * S.w + x] = ((((r + k * bd[0]) / all) | 0) << 16) | ((((g + k * bd[1]) / all) | 0) << 8) | (((b + k * bd[2]) / all) | 0);
      }
    }
  }

  // Labels in text cells, slim: an activity glyph and the name in the
  // agent's colour over the scene. A one-line bubble ("glyph name · detail")
  // shows for the selected agent (inverted), for a moment after a change,
  // and on errors and finishes — a few at most. Nothing overlaps another
  // label or an emote; a quiet label keeps its row unless blocked for a
  // while, so they do not jitter, while a loud one moves at once and so
  // never blinks out. In a crowd, quiet labels shrink to their glyph (see
  // CROWD and BAND), and names that clip alike are told apart (tagNames).
  // With a selection, the others' labels dim.
  // HD draws the same labels as tags in a small pixel font into the image
  // itself, a few pixels over the head, instead of a line of text cells
  // four times the agent's size; they grow with the picture: font pixels
  // the size of world pixels or a little under (x1 at fit, x2 in the x4
  // close-up, x3 at x6).
  private drawLabels(s: Screen, actors: Actor[], sprites: Map<Actor, Placed>, emotes: Map<Actor, Box>, now: number, selectedId: string | null): void {
    const r = this.rect;
    const pal = this.biome.palette;
    const g = this.grid();
    const hd = this.mode === 'hd';
    const S = hd ? this.hdScale() : 1;
    const imgW = this.screen.w * S;
    const fs = hd ? Math.max(1, Math.floor((S * this.zoom) / 2)) : 1;
    const tagH = tagSize('', fs).h;
    // Big tags keep bubbles to a few figures wide.
    const detailMax = fs >= 2 ? 16 : 22;
    this.tags = [];
    // Tags placed so far, and emotes, in image pixels (HD).
    const boxes: Array<[number, number, number, number]> = [];
    const emoteBoxes = [...emotes.values()].map((box) => [box.x0 * S, box.y0 * S, box.x1 * S, box.y1 * S]);
    const hits = (list: number[][], x0: number, y0: number, x1: number, y1: number) => list.some(([a, b, c, d]) => x0 < c + 1 && a < x1 + 1 && y0 < d + 1 && b < y1 + 1);
    // `overEmotes`: an error's last resort, over a neighbour's emote.
    const clearPx = (x0: number, y0: number, x1: number, y1: number, overEmotes = false) => y0 >= 0 && !hits(boxes, x0, y0, x1, y1) && (overEmotes || !hits(emoteBoxes, x0, y0, x1, y1));
    const taken: Array<[number, number, number]> = [];
    // Cells an emote shows in: [row, x0, x1).
    const shown: Array<[number, number, number]> = [];
    for (const box of emotes.values()) {
      const c0 = r.x + Math.floor(box.x0 / g.fx);
      const c1 = r.x + Math.floor((box.x1 - 1e-6) / g.fx) + 1;
      for (let row = r.y + Math.floor(box.y0 / g.fy); row <= r.y + Math.floor((box.y1 - 1e-6) / g.fy); row++) shown.push([row, c0, c1]);
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
    // Heads, and the names and bubbles placed so far, in label columns and
    // rows (see CROWD).
    const perCol = hd ? S / (ADVANCE * fs) : 1 / g.fx;
    const perRow = hd ? S / (tagH + fs) : 1 / g.fy;
    const heads = new Map<Actor, [number, number]>();
    for (const [a, at] of sprites) {
      const [x, y] = this.toScreen(Math.round(at.sx), at.top);
      heads.set(a, [Math.round(x) * perCol, y * perRow]);
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
      const at = sprites.get(a);
      if (!at) continue;
      seen.add(a.info.id);
      const selected = a.info.id === selectedId;
      const box = emotes.get(a);
      // Sprites are anchored on the rounded pixel column.
      const [hx, hy0] = this.toScreen(Math.round(at.sx), at.top);
      const hy = box ? Math.min(hy0, box.y0) : hy0;
      const cx = r.x + Math.floor(Math.round(hx) / g.fx);
      const headRow = r.y + Math.floor(hy / g.fy);
      if (cx < r.x || cx >= r.x + r.w || headRow <= r.y || headRow > r.y + r.h) continue;
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
      const place = (fits: (k: number) => boolean): [number, typeof memo] => {
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
      // Where `label` would go: its row, the memo after it, and its box (text
      // cells, or image pixels in HD). A loud label that fits no row over
      // the head slides aside, up to half its width, rather than blink out;
      // an error's, as a last resort, covers a neighbour's emote (never a
      // label).
      const spot = (label: string) => {
        const w = hd ? tagSize(label, fs).w : [...label].length;
        const x0 = hd ? Math.round(hx * S - w / 2) : cx - Math.floor(w / 2);
        const [lo, hi] = hd ? [0, imgW - w] : [r.x, r.x + r.w - w];
        const top = (k: number) => (hd ? Math.round(hy * S) - 2 * fs - tagH - (k - 1) * (tagH + fs) : headRow - k);
        const fits = (x: number, k: number, over: boolean) => (hd ? clearPx(x, top(k), x + w, top(k) + tagH, over) : free(top(k), x, x + w, over));
        let first: { off: number; m: typeof memo; x: number; y: number; w: number } | null = null;
        for (const over of erring(a) ? [false, true] : [false]) {
          for (const k of hurry ? [0, -1, 1, -2, 2] : [0]) {
            const x = Math.max(lo, Math.min(hi, x0 + k * Math.ceil(w / 4)));
            const [off, m] = place((row) => fits(x, row, over));
            const p = { off, m, x, y: top(off), w };
            if (off > 0) return p;
            first ??= p;
          }
        }
        return first!;
      };
      // A placed label's middle, in label columns and rows.
      const mid = (p: { x: number; y: number; w: number }): [number, number] => (hd ? [(p.x + p.w / 2) / (ADVANCE * fs), p.y / (tagH + fs)] : [p.x + p.w / 2, p.y]);
      // A bubble, a name tag, or in a crowd (or atop a stack) just the glyph.
      let kind: 'bubble' | 'name' | 'glyph' = hurry && !!detail && (selected || bubbles < MAX_BUBBLES) ? 'bubble' : !hurry && crowded(a) ? 'glyph' : 'name';
      const textOf = () => (kind === 'bubble' ? ` ${glyph} ${long.get(a)} · ${clip(detail, detailMax)} ` : kind === 'name' ? `${glyph} ${short.get(a)}` : glyph);
      let p = spot(hd ? textOf().trim() : textOf());
      if (kind !== 'glyph' && p.off > 0 && towers(mid(p))) {
        kind = 'glyph';
        p = spot(glyph);
      }
      this.rows.set(a.info.id, p.m);
      if (p.off < 0) continue;
      if (kind !== 'glyph') named.push(mid(p));
      const text = textOf();
      const { x, y, w } = p;
      const fade = selectedId && !selected ? 0.6 : 1;
      const ink = activityColor(act, this.biome);
      const bg = selected ? a.traits.color : mix(pal.panel, act === 'error' ? pal.bad : a.traits.color, 0.22);
      const col = act === 'error' ? pal.bad : a.traits.color;
      if (kind === 'bubble') bubbles++;
      if (hd) {
        boxes.push([x, y, x + w, y + tagH]);
        const label = text.trim();
        if (kind === 'bubble') {
          this.tags.push({ x, y, text: label, color: rgb(scale(selected ? pal.panel : pal.panelText, fade)), bg: rgb(scale(bg, fade)), bgAlpha: 0.85, scale: fs });
          this.tags.push({ x, y, text: glyph, color: rgb(selected ? pal.panel : scale(ink, fade)), scale: fs });
        } else {
          const mark: Tag = { x, y, text: glyph, color: rgb(scale(ink, fade)), shadow: 0, scale: fs };
          if (kind === 'name') this.tags.push({ x, y, text: label, color: rgb(scale(col, fade)), bg: rgb(pal.panel), bgAlpha: 0.45, shadow: 0, scale: fs });
          this.tags.push(kind === 'glyph' ? { ...mark, bg: rgb(pal.panel), bgAlpha: 0.45 } : mark);
        }
        continue;
      }
      taken.push([y, x, x + w]);
      if (kind === 'bubble') {
        const fg = selected ? pal.panel : pal.panelText;
        s.text(x, y, text, scale(fg, fade), scale(bg, fade), selected ? BOLD : 0, r.x + r.w);
        s.put(x + 1, y, glyph, selected ? pal.panel : scale(ink, fade), undefined, BOLD);
      } else {
        // Over the scene, on a darkened cell for contrast.
        for (let k = 0; k < w; k++) s.blendBg(x + k, y, pal.panel, 0.55);
        s.text(x, y, text, scale(col, fade), undefined, BOLD, r.x + r.w);
        s.put(x, y, glyph, scale(ink, fade), undefined, BOLD);
      }
    }
    for (const id of this.rows.keys()) if (!seen.has(id)) this.rows.delete(id);
    this.placedLabels = taken.map(([y, x0, x1]) => ({ x: x0, y, w: x1 - x0 }));
  }
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
