// The illustrated scene: a SceneFrame (see world/frame.ts) as a plate (see
// plate.ts), a stack of placed pictures the terminal keeps and lays out
// itself, so that a frame where things only move sends no pixels. Bottom
// to top:
//
//   base      per scale: the backdrop with its soft light and the room
//             shell, in tiles on a grid fixed to the world (canvas pixels
//             less the camera's origin), each painted once, when first in
//             view or ahead of time (see warm), and kept while room allows.
//             A pan only moves them and brings in the next ones.
//   floor     what props lay on the floor round them (shadows, pools of
//             light), contact shadows, the selection's ring and the hurt's
//             pulsing one.
//   depth     props, workstations (a body, its screen and its loops),
//             builds, piles, figures, desk upgrades and the critter in depth
//             order (see scene/depth.ts), each particle slotted in among
//             them: the particles of a slot drawn together, a picture per
//             bunch of them, cropped to what it paints (drifting ones again
//             only per ambient step). Animated props are pictures of their
//             own, drawn whole (body and floor) and again only per ambient
//             step or when they are worked or left.
//   emotes    over the heads, so no prop hides them.
//   overlay   the room's (rain on the windows), drawn per ambient step in
//             pieces round what it paints, laid out in small tiles on a grid
//             fixed to the world (a pan moves them).
//   glows     (lit) halos round glowing bits and finished builds.
//   pills     behind the labels, under the terminal's text.
//
// The world's ambient tint is baked into everything below the glows,
// through a cache of tinted copies. Light blended 'screen' (halos, the
// overlay's glow, a lamp on an animated prop) cannot be carried by a
// picture laid over: halos are matched to a mid ground (see haloSprite),
// the rest is lifted off the base it is drawn on (see lift). Everything
// sits on whole pixels: the camera's origin is rounded, so a sprite placed
// again is the same picture. Sprites (tiles, props, workstations, builds,
// figures, desk upgrades, emotes, shadows, rings, halos, pills) are cached
// and keyed by what they show; what is drawn afresh (particles, animated
// props, the overlay) gets a new key only when its pixels change.

import type { RGB } from '../term/color.ts';
import { mix as mixRgb } from '../term/color.ts';
import type { Rect as Cells } from '../term/screen.ts';
import type { Camera, SceneFrame } from '../world/frame.ts';
import { EMOTE, cellBox, figureTop } from '../world/frame.ts';
import { opacity } from '../world/particles.ts';
import { hashString } from '../world/rng.ts';
import type { PlacedProp } from '../world/room.ts';
import { footprint, toWorld } from '../world/room.ts';
import type { Particle } from '../world/types.ts';
import type { CritterKind, NpcAct, RoomView, WorldDef } from '../worlds/types.ts';
import { workstationOf } from '../worlds/workstation.ts';
import { Canvas } from './canvas.ts';
import { critterSprite, emoteSprite, figureSprite, npcSprite, spriteStats, trinketSprite } from './figure.ts';
import { hexOf, ink as inkFrom, inkWidth } from './iso.ts';
import type { Pic, Placed, Plate } from './plate.ts';
import { composite } from './plate.ts';
import { Bounds } from './scene/bounds.ts';
import { buildSprite, pileSprite } from './scene/build.ts';
import { POP_STEPS, type DeskSprite, deskPictures, deskStats, growth, loopSprite, popping } from './scene/desk.ts';
import type { Sprite } from './scene/build.ts';
import { depthOrder, slotOf } from './scene/depth.ts';
import type { Drawable } from './scene/depth.ts';
import { addHalo, ambientBit, drawParticle, floorRing, haloSprite, pill, pillSprite, ringSprite, shadowSprite, tintAll } from './scene/fx.ts';
import type { Project } from './scene/fx.ts';
import { clusters, cropped, hullOf, lift, same, split } from './scene/pixels.ts';
import type { Box } from './scene/pixels.ts';
import type { Bitmap, Pen } from './types.ts';

// One picture of the scene, for screenshots and terminals that take only
// whole pictures: the plate composited (one canvas pixel an image pixel:
// the scene's cells at the terminal's cell size) and where it goes.
export type SceneImage = { bitmap: Bitmap; rect: Cells; cell: { w: number; h: number } };

// How often what only animates in place is drawn again: animated props,
// the room's overlay and drifting bits (steam, embers, smoke, drops, z's).
// Everything else moves at the loop's rate.
export const AMBIENT_FPS = 6;
// An animated prop a local works (see SceneFrame.npcs) goes round a loop of
// CYCLE ambient steps (two seconds), each step's picture drawn once and
// kept (see cyclePic): the step prop i shows at scene time t. Its worked
// motion is seen as that 2 s loop, so it should repeat within 2 s (its
// beats and turns; see PropArt.animated).
export const CYCLE = 12;
export const cycleStep = (t: number, i: number) => Math.floor(t * AMBIENT_FPS + phaseOf(i)) % CYCLE;

// Room round a prop's box for what it paints past it (its shadow, a pool of
// lamp light), in units; the sprite is cropped to what was drawn.
const PROP_PAD = 10;
// What counts as a prop's body (see PropSprite): its box, this many units
// taller, grown by this many units round (overhangs).
const BODY_UP = 2;
const BODY_SLACK = 0.4;
// A heart over the critter shows this many units above its feet: clear of
// its back, or of a hopper's feelers (their glow reaches past 7 mid-hop).
const CRITTER_TOP = 6;
const CRITTER_TALL: Partial<Record<CritterKind, number>> = { hopper: 7.5 };
const critterTop = (kind: CritterKind) => CRITTER_TALL[kind] ?? CRITTER_TOP;
// Scales whose sprites are kept.
const LAYERS = 6;
// A base tile's side, px: a tile paints in about 10 ms, a unit of warming.
const TILE = 256;
// Base tiles kept (64 KiB pixels each), and the share of them warming may
// fill with tiles of the room no camera a key away shows.
const TILES = 400;
const ROOM_SHARE = 0.6;
// Marks of the overlay, or bits of one slot, this close (px) are drawn as
// one piece.
const GAP = 16;
// The overlay is laid out in tiles this big, each cropped: rain on a window
// is a few thin streaks across a slanted pane.
const OVERLAY_TILE = 64;
// How far past the canvas bits are drawn, px, so a pan within an ambient
// step does not cut those kept from its start.
const BITS_MARGIN = 64;
// Steps of the pulses (a hurt figure's ring, a finished build's beacon) and
// of a glowing bit's fade, so their sprites are few; of a pill's alpha (in
// twentieths, which the labels' 0.9 and 0.55 fall on).
const PULSE = 8;
const PILL_ALPHA = 20;

// A depth-sorted thing: a cached sprite, top-left at (x, y) on the canvas,
// or an animated prop (drawn on its own, or live).
type Item = Drawable & { id: string; img?: Bitmap; x: number; y: number; anim?: { p: PlacedProp; i: number; active: boolean; local?: boolean } };
type Build = { sprite: Sprite | null; box: [number, number, number, number, number]; seen: number };
// A prop's picture in two parts: its body (inside the outline of its box),
// drawn in depth order, and what it lays on the floor round it (its
// shadow, a pool of light), drawn under everyone.
type PropSprite = { body: Sprite | null; floor: Sprite | null };

// What one scale keeps besides its tiles: the sprites (per prop idle and
// worked; builds by state; piles by place) and which animated props have
// had their still parts drawn. `scope` is everything but the scale the
// pictures depend on; `no` names the layer in tile keys.
type Layer = {
  key: string;
  scope: string;
  s: number;
  no: number;
  props: Array<[PropSprite | undefined, PropSprite | undefined]>;
  builds: Map<string, Build>;
  piles: Map<string, Sprite>;
  warmed: Set<number>;
  // The steps of the stations the locals work, by prop and step (see
  // cyclePic).
  cycles: Map<string, { pic: Pic; x: number; y: number } | null>;
  used: number;
};

// A base tile: its pixels as painted (the ground light is lifted off) and
// as placed (tinted).
type Tile = { img: Canvas; pic: Pic };

// A picture drawn afresh, kept while `tag` (what it was drawn from) holds;
// (x, y) is its top-left in the space it was drawn in.
type Vol = { tag: string; pic: Pic | null; x: number; y: number; seen: number };
type Drawn = { img: Bitmap; x: number; y: number } | null;
// Pictures drawn together, the pieces of one thing, by their names.
type Group = { tag: string; ids: string[]; seen: number };

// The ambient tint as a cache key.
type Tint = { rgb: RGB; k: number; key: string } | null;

// Keys name pixels for the life of the process (see plate.ts): sprites by
// the identity of their bitmap (and the tint baked in), tiles by their
// layer and place (painted alike every time), what is drawn afresh by a
// serial number.
const ids = new WeakMap<object, number>();
let nextId = 1;
const idOf = (o: object) => {
  let n = ids.get(o);
  if (n === undefined) ids.set(o, (n = nextId++));
  return n;
};
const layerNos = new Map<string, number>();
let serial = 0;
const fresh = (img: Bitmap): Pic => ({ key: `v${++serial}`, img });

const pack = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];

function tintOf(w: WorldDef): Tint {
  const a = w.ambient;
  if (!a || !(a.strength > 0)) return null;
  const k = Math.min(1, a.strength);
  return { rgb: a.tint, k, key: `${pack(a.tint)}*${k}` };
}

const copyOf = (b: Bitmap): Canvas => {
  const c = new Canvas(b.width, b.height);
  c.data.set(b.data);
  return c;
};

const plain = new WeakMap<Bitmap, Pic>();
const tinted = new WeakMap<Bitmap, Map<string, Pic>>();

// A cached sprite as a picture, the tint baked into a copy kept as long as
// the sprite is.
function picOf(img: Bitmap, t: Tint): Pic {
  if (!t) {
    let p = plain.get(img);
    if (!p) plain.set(img, (p = { key: `s${idOf(img)}`, img }));
    return p;
  }
  let m = tinted.get(img);
  if (!m) tinted.set(img, (m = new Map()));
  let p = m.get(t.key);
  if (!p) {
    const c = copyOf(img);
    tintAll(c.data, t.rgb, t.k);
    m.set(t.key, (p = { key: `s${idOf(img)}~${t.key}`, img: c }));
  }
  return p;
}
const hasPic = (img: Bitmap, t: Tint) => (t ? !!tinted.get(img)?.has(t.key) : plain.has(img));

// A small least-recently-used cache.
function memo<V>(m: Map<string, V>, key: string, cap: number, make: () => V): V {
  let v = m.get(key);
  if (v !== undefined) {
    m.delete(key);
    m.set(key, v);
    return v;
  }
  v = make();
  m.set(key, v);
  if (m.size > cap) m.delete(m.keys().next().value as string);
  return v;
}

// A world's outline colour.
export function inkOf(w: WorldDef): string {
  return w.ink ?? inkFrom(hexOf(w.palette.floor));
}

const scopeOf = (f: SceneFrame) => `${f.world.id}|${idOf(f.room)}|${f.lit}|${inkOf(f.world)}`;

// Where a thing's ambient steps fall (0..1), so things drawn per step take
// turns rather than all at once.
const phaseOf = (i: number) => (i * 0.618034) % 1;

// The tiles (inclusive) a camera's canvas covers, grown by `ring` tiles.
function tilesOf(c: Camera, ring = 0): { x0: number; y0: number; x1: number; y1: number } {
  const OX = Math.round(c.ox);
  const OY = Math.round(c.oy);
  const w = Math.max(1, Math.round(c.w));
  const h = Math.max(1, Math.round(c.h));
  return { x0: Math.floor(-OX / TILE) - ring, y0: Math.floor(-OY / TILE) - ring, x1: Math.floor((w - 1 - OX) / TILE) + ring, y1: Math.floor((h - 1 - OY) / TILE) + ring };
}

// A prop's box on a camera's canvas, grown by what it paints round it.
function propBox(p: PlacedProp, s: number, OX: number, OY: number): { sx0: number; sy0: number; sx1: number; sy1: number } {
  const r = footprint(p);
  const pad = Math.ceil(PROP_PAD * s);
  return { sx0: OX + (r.x0 - r.y1) * s - pad, sx1: OX + (r.x1 - r.y0) * s + pad, sy0: OY + ((r.x0 + r.y0) / 2 - p.art.height) * s - pad, sy1: OY + ((r.x1 + r.y1) / 2) * s + pad };
}

export class Scene {
  // Work done, for tests and tuning: base tiles painted, prop and build
  // sprites drawn, animated props and overlays drawn.
  readonly stats = { tiles: 0, props: 0, builds: 0, animated: 0, overlays: 0 };
  private frame: Canvas | null = null;
  private layers: Layer[] = [];
  private tiles = new Map<string, Tile>();
  private shadows = new Map<number, Record<'fig' | 'nap' | 'pet', ReturnType<typeof shadowSprite>>>();
  private faded = new Map<string, Canvas>();
  private rings = new Map<string, ReturnType<typeof ringSprite>>();
  private halos = new Map<string, Canvas>();
  private pills = new Map<string, ReturnType<typeof pillSprite>>();
  private vols = new Map<string, Vol>();
  private groups = new Map<string, Group>();
  // Drifting bits drawn per ambient step: the step, the layer and camera
  // origin they were drawn at, a count that moves on whenever they must all
  // be drawn again, and the slot each bit was drawn in.
  private bits = { tick: NaN, layer: '', ox: 0, oy: 0, epoch: 0, where: new Map<Particle, string>() };
  // The overlay's pieces (world pixels) for `tag`, and each one drawn.
  private over: { tag: string; pieces: Box[]; drawn: Map<number, Canvas | null> } = { tag: '', pieces: [], drawn: new Map() };
  // What warm last finished: for which view and cameras, at which step.
  private warmed = { sig: '', tick: NaN };
  private renders = 0;
  // The props the locals work (see NpcFrame.works), kept while the room
  // and how many locals there are stay the same: worked out once for them,
  // not every frame.
  private worked: { room: SceneFrame['room'] | null; n: number; props: ReadonlySet<number> } = { room: null, n: -1, props: new Set() };

  // The frame as one picture: the plate composited (the canvas is reused
  // from frame to frame).
  render(f: SceneFrame): SceneImage {
    const p = this.plate(f);
    this.frame = composite(p, this.frame);
    return { bitmap: this.frame, rect: p.rect, cell: p.cell };
  }

  // The frame as a stack of pictures (see the top of the file).
  plate(f: SceneFrame): Plate {
    const cam = f.camera;
    const w = Math.max(1, Math.round(cam.w));
    const h = Math.max(1, Math.round(cam.h));
    const layers: Placed[] = [];
    const plate: Plate = { width: w, height: h, rect: { ...cam.cells }, cell: { ...cam.cell }, backdrop: f.world.backdrop, layers };
    this.renders++;
    const s = cam.s;
    const OX = Math.round(cam.ox);
    const OY = Math.round(cam.oy);
    const l = this.layerAt(f, s);
    l.used = this.renders;
    for (const [k, b] of l.builds) if (this.renders - b.seen > 30) l.builds.delete(k);
    const t = tintOf(f.world);
    const P: Project = (x, y, z) => [OX + (x - y) * s, OY + ((x + y) * s) / 2 - z * s];
    const ink = inkOf(f.world);
    // Pictures wholly off the canvas are left out.
    const put = (id: string, pic: Pic | null, x: number, y: number, volatile = false) => {
      if (!pic || x >= w || y >= h || x + pic.img.width <= 0 || y + pic.img.height <= 0) return;
      layers.push(volatile ? { id, pic, x, y, volatile } : { id, pic, x, y });
    };

    const r = tilesOf(cam);
    for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) put(`base:${tx},${ty}`, this.tile(f, l, tx, ty, true).pic, OX + tx * TILE, OY + ty * TILE);
    const floors: Item[] = [];
    const items = this.items(f, l, P, s, OX, OY, ink, w, h, floors);
    for (const it of floors) put(it.id, picOf(it.img!, t), it.x, it.y);
    this.floorPics(f, P, s, t, put);

    const order = depthOrder(items);
    const slots = this.slotted(f, P, items, order, w, h);
    const anchor = (k: number) => `bits:${k ? items[order[k - 1]].id : 'floor'}`;
    this.thaw(f, l, OX, OY, slots, anchor);
    for (let k = 0; k <= order.length; k++) {
      const ps = slots[k];
      if (ps) for (const { id, v } of this.bitsPics(anchor(k), ps, f, P, s, OX, OY, w, h, t)) put(id, v.pic, OX + v.x, OY + v.y, true);
      if (k === order.length) break;
      const it = items[order[k]];
      if (it.anim?.local) {
        const v = this.cyclePic(it, f, l, s, t);
        if (v) put(it.id, v.pic, OX + v.x, OY + v.y);
      } else if (it.anim) {
        const v = this.animPic(it, f, l, s, t);
        put(it.id, v.pic, OX + v.x, OY + v.y, true);
      } else put(it.id, picOf(it.img!, t), it.x, it.y);
    }

    for (const g of f.figures) {
      if (!g.emote) continue;
      const sp = emoteSprite(g.emote.kind, g.emote.t, s, ink);
      const [x, y] = P(g.x, g.y, g.z + figureTop(g) + EMOTE.gap);
      put(`emote:${g.id}`, picOf(sp.img, t), Math.round(x) - sp.ax, Math.round(y) - sp.ay);
    }
    const cr = f.critter;
    if (cr && cr.heart !== undefined) {
      const sp = emoteSprite('heart', cr.heart, s, ink);
      const [x, y] = P(cr.x, cr.y, cr.z + critterTop(cr.kind));
      put('emote:critter', picOf(sp.img, t), Math.round(x) - sp.ax, Math.round(y) - sp.ay);
    }
    for (const n of f.npcs ?? []) {
      if (!n.emote) continue;
      const sp = emoteSprite(n.emote.kind, n.emote.t, s, ink);
      const [x, y] = P(n.x, n.y, n.top + EMOTE.gap);
      put(`emote:npc:${n.k}`, picOf(sp.img, t), Math.round(x) - sp.ax, Math.round(y) - sp.ay);
    }
    if (f.world.room.overlay) for (const { id, v } of this.overlayPics(f, l, t, OX, OY, w, h)) put(id, v.pic, OX + v.x, OY + v.y, true);
    if (f.lit) this.glowPics(f, P, s, put);
    f.labels.forEach((lb, n) => {
      const b = cellBox(cam, lb.col, lb.row, lb.w);
      const strong = lb.kind === 'error';
      const a = Math.round(lb.alpha * PILL_ALPHA) / PILL_ALPHA;
      const sp = memo(this.pills, `${b.x1 - b.x0}x${b.y1 - b.y0}|${lb.color.join()}|${a}|${ink}|${strong}`, 64, () => pillSprite(b.x1 - b.x0, b.y1 - b.y0, lb.color, a, ink, strong));
      put(`pill:${n}`, picOf(sp.img, null), b.x0 - sp.dx, b.y0 - sp.dy);
    });
    this.sweep();
    return plate;
  }

  // Gets pictures ready that a coming frame will likely need, a unit at a
  // time (a base tile, a prop's sprites, a figure's), starting none once
  // performance.now() is past `until`; returns the new pictures kept, the
  // very ones a later plate will place (for the terminal to have in hand).
  // Most likely first: the tiles round the view; then for each camera a
  // key away (f.next) its tiles, its props' sprites at its scale and the
  // figures as they stand at it; then the rest of the room at this scale.
  // Once all that is done for this view and these cameras it does nothing
  // until they change, but for the figures' poses once an ambient step.
  warm(f: SceneFrame, until: number): Pic[] {
    const out: Pic[] = [];
    const sig = this.warmSig(f);
    const tick = Math.floor(f.t * AMBIENT_FPS);
    if (sig === this.warmed.sig && tick === this.warmed.tick) return out;
    for (const unit of this.chores(f, sig !== this.warmed.sig, out)) {
      if (performance.now() >= until) return out;
      unit();
    }
    this.warmed = { sig, tick };
    return out;
  }

  // The frame painted straight into one picture, layer by layer, the way
  // the scene was drawn before plates: what the plate composites to but for
  // rounding, the glows (here blended 'screen') and what the plate snaps to
  // whole pixels or takes in steps (rings, pulses, fades). For tests.
  flat(f: SceneFrame): Canvas {
    const cam = f.camera;
    const w = Math.max(1, Math.round(cam.w));
    const h = Math.max(1, Math.round(cam.h));
    const OX = Math.round(cam.ox);
    const OY = Math.round(cam.oy);
    const s = cam.s;
    const l = this.layerAt(f, s);
    const P: Project = (x, y, z) => [OX + (x - y) * s, OY + ((x + y) * s) / 2 - z * s];
    const ink = inkOf(f.world);
    const c = this.ground(f, l, -OX, -OY, w, h);
    const floors: Item[] = [];
    const items = this.items(f, l, P, s, OX, OY, ink, w, h, floors);
    const draw = (it: Item) => {
      if (!it.anim) return c.drawImage(it.img!, it.x, it.y);
      const { p, i, active, local } = it.anim;
      this.drawProp(c, p, (u, v, z) => P(...toWorld(p, u, v, z)), s, local ? cycleStep(f.t, i) / AMBIENT_FPS : f.t, active);
    };
    for (const it of floors) draw(it);
    this.decals(c, f, P, s);
    const order = depthOrder(items);
    const slots = this.slotted(f, P, items, order, w, h);
    const bits = (k: number) => {
      const ps = slots[k];
      if (!ps) return;
      c.save();
      for (const p of ps) drawParticle(c, P, p, s, f.t);
      c.restore();
    };
    for (let k = 0; k < order.length; k++) {
      bits(k);
      draw(items[order[k]]);
    }
    bits(order.length);
    for (const g of f.figures) {
      if (!g.emote) continue;
      const sp = emoteSprite(g.emote.kind, g.emote.t, s, ink);
      const [x, y] = P(g.x, g.y, g.z + figureTop(g) + EMOTE.gap);
      c.drawImage(sp.img, Math.round(x) - sp.ax, Math.round(y) - sp.ay);
    }
    const cr = f.critter;
    if (cr && cr.heart !== undefined) {
      const sp = emoteSprite('heart', cr.heart, s, ink);
      const [x, y] = P(cr.x, cr.y, cr.z + critterTop(cr.kind));
      c.drawImage(sp.img, Math.round(x) - sp.ax, Math.round(y) - sp.ay);
    }
    for (const n of f.npcs ?? []) {
      if (!n.emote) continue;
      const sp = emoteSprite(n.emote.kind, n.emote.t, s, ink);
      const [x, y] = P(n.x, n.y, n.top + EMOTE.gap);
      c.drawImage(sp.img, Math.round(x) - sp.ax, Math.round(y) - sp.ay);
    }
    if (f.world.room.overlay) {
      c.save();
      f.world.room.overlay(this.roomView(f, c, P, s));
      c.restore();
    }
    const t = tintOf(f.world);
    if (t) tintAll(c.data, t.rgb, t.k);
    if (f.lit) this.glows(c, f, P, s, w, h);
    for (const lb of f.labels) {
      const b = cellBox(f.camera, lb.col, lb.row, lb.w);
      pill(c, b.x0, b.y0, b.x1, b.y1, lb.color, lb.alpha, ink, lb.kind === 'error');
    }
    return c;
  }

  // Drops what was drawn afresh for things no longer in the frame.
  private sweep(): void {
    for (const [id, v] of this.vols) if (v.seen !== this.renders) this.vols.delete(id);
    for (const [id, g] of this.groups) if (g.seen !== this.renders) this.groups.delete(id);
  }

  // Picture `id` as last drawn while `tag` holds, else drawn again by
  // `draw`: new pixels take a new key, the same pixels keep the old one.
  private vol(id: string, tag: string, draw: () => Drawn): Vol {
    let v = this.vols.get(id);
    if (!v || v.tag !== tag) {
      const d = draw();
      const pic = !d ? null : v?.pic && same(v.pic.img, d.img) ? v.pic : fresh(d.img);
      v = { tag, pic, x: d ? d.x : 0, y: d ? d.y : 0, seen: 0 };
      this.vols.set(id, v);
    }
    v.seen = this.renders;
    return v;
  }

  // The pieces of group `id` (named `<id>#<name>`) as last drawn while
  // `tag` holds, else drawn again by `draw`; each piece keeps its key when
  // its pixels came out the same.
  private group(id: string, tag: string, draw: () => Array<{ name: string; img: Bitmap; x: number; y: number }>): Array<{ id: string; v: Vol }> {
    let g = this.groups.get(id);
    if (!g || g.tag !== tag) {
      const pieces = draw();
      g = { tag, ids: pieces.map((d) => `${id}#${d.name}`), seen: 0 };
      pieces.forEach((d, k) => this.vol(g!.ids[k], tag, () => d));
      this.groups.set(id, g);
    }
    g.seen = this.renders;
    return g.ids.map((pid) => ({ id: pid, v: this.vol(pid, tag, () => null) }));
  }

  private roomView(f: SceneFrame, pen: Pen, at: Project, s: number): RoomView {
    const L = f.room.L;
    return { pen, s, at, W: L.W, D: L.D, H: L.H, T: L.T, t: f.t, seed: hashString(f.world.id) };
  }

  // ── layers and tiles ──────────────────────────────────────────────────

  // The layer of this world, room and lighting at scale s.
  private layerAt(f: SceneFrame, s: number): Layer {
    const scope = scopeOf(f);
    const key = `${scope}|${s}`;
    let l = this.layers.find((q) => q.key === key);
    if (l) return l;
    this.layers = this.layers.filter((q) => q.scope === scope);
    if (this.layers.length >= LAYERS) {
      const old = this.layers.reduce((a, b) => (b.used < a.used ? b : a));
      this.layers.splice(this.layers.indexOf(old), 1);
    }
    let no = layerNos.get(key);
    if (no === undefined) layerNos.set(key, (no = layerNos.size + 1));
    l = { key, scope, s, no, props: [], builds: new Map(), piles: new Map(), warmed: new Set(), cycles: new Map(), used: this.renders };
    this.layers.push(l);
    return l;
  }

  // Base tile (tx, ty) of layer l, painted if it is not kept. `use` marks
  // it as in view (kept longest).
  private tile(f: SceneFrame, l: Layer, tx: number, ty: number, use: boolean): Tile {
    const key = `${l.no}:${tx},${ty}`;
    let tl = this.tiles.get(key);
    if (tl) {
      if (use) {
        this.tiles.delete(key);
        this.tiles.set(key, tl);
      }
      return tl;
    }
    const img = new Canvas(TILE, TILE);
    this.paintStatic(img, f, l.s, tx * TILE, ty * TILE);
    this.stats.tiles++;
    const t = tintOf(f.world);
    let shown: Canvas = img;
    if (t) {
      shown = copyOf(img);
      tintAll(shown.data, t.rgb, t.k);
    }
    tl = { img, pic: { key: `b${l.no}.${tx}.${ty}`, img: shown, opaque: true } };
    this.tiles.set(key, tl);
    while (this.tiles.size > TILES) this.tiles.delete(this.tiles.keys().next().value as string);
    return tl;
  }

  // The base (untinted) under world pixels (x, y, w, h), from its tiles.
  private ground(f: SceneFrame, l: Layer, x: number, y: number, w: number, h: number): Canvas {
    const c = new Canvas(w, h);
    for (let ty = Math.floor(y / TILE); ty * TILE < y + h; ty++) for (let tx = Math.floor(x / TILE); tx * TILE < x + w; tx++) c.drawImage(this.tile(f, l, tx, ty, false).img, tx * TILE - x, ty * TILE - y);
    return c;
  }

  // The backdrop with a soft light behind the room, and the room shell, at
  // scale s, into `c`, whose (0, 0) is world pixel (x, y).
  private paintStatic(c: Canvas, f: SceneFrame, s: number, x: number, y: number): void {
    const L = f.room.L;
    const P: Project = (wx, wy, wz) => [-x + (wx - wy) * s, -y + ((wx + wy) * s) / 2 - wz * s];
    const back = f.world.backdrop;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = hexOf(back);
    c.fillRect(0, 0, c.width, c.height);
    const [cx, cy] = P(L.W / 2, L.D / 2, L.H / 2);
    const R = (L.W + L.D) * s * 0.8;
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, hexOf(mixRgb(back, f.world.palette.wall, f.lit ? 0.16 : 0.08)));
    g.addColorStop(0.6, hexOf(mixRgb(back, f.world.palette.wall, f.lit ? 0.05 : 0.02)));
    g.addColorStop(1, hexOf(back, 0));
    c.fillStyle = g;
    c.fillRect(0, 0, c.width, c.height);
    c.save();
    f.world.room.draw({ pen: c, s, at: P, W: L.W, D: L.D, H: L.H, T: L.T, t: 0, seed: hashString(f.world.id) });
    c.restore();
  }

  // ── warming ───────────────────────────────────────────────────────────

  // What warm's work depends on: the scope, the tiles in view, each camera
  // a key away, which props are worked, the figures and builds.
  private warmSig(f: SceneFrame): string {
    const span = (c: Camera) => {
      const r = tilesOf(c);
      return `${c.s}:${r.x0},${r.y0},${r.x1},${r.y1}`;
    };
    let act = '';
    for (const a of f.active) act += a ? '1' : '0';
    let desks = '';
    for (const d of f.desks ?? []) desks += `${d.id}${d.screen}${Math.round(d.grow * POP_STEPS)};`;
    return `${scopeOf(f)}|${span(f.camera)}|${(f.next ?? []).map(span).join(';')}|${act}|${f.figures.length}|${f.builds.map((b) => b.blocks.length).join()}|${desks}|n${f.npcs?.length ?? 0}`;
  }

  // The units of warming still to do, most likely needed first; each puts
  // the pictures it made into `out`. `whole`: all of it, else only the
  // figures (their poses move on).
  private *chores(f: SceneFrame, whole: boolean, out: Pic[]): Generator<() => void> {
    const next = f.next ?? [];
    const here = this.layerAt(f, f.camera.s);
    if (whole) {
      yield* this.tileChores(f, here, tilesOf(f.camera, 1), out);
      for (const cam of next) {
        const l = this.layerAt(f, cam.s);
        yield* this.tileChores(f, l, tilesOf(cam), out);
        yield* this.propChores(f, l, cam, out);
        yield* this.figureChores(f, cam.s, out);
      }
      if (this.tiles.size < TILES * ROOM_SHARE) yield* this.tileChores(f, here, this.roomTiles(f, here.s), out, true);
      return;
    }
    const done = new Set([f.camera.s]);
    for (const cam of next) {
      if (done.has(cam.s)) continue;
      done.add(cam.s);
      yield* this.figureChores(f, cam.s, out);
    }
  }

  // Tiles of l in r not yet painted, nearest the middle of r first. Kept
  // ones are marked recently used, so that warming does not push out what
  // it is warming for. `room`: stop once the room's share is full.
  private *tileChores(f: SceneFrame, l: Layer, r: { x0: number; y0: number; x1: number; y1: number }, out: Pic[], room = false): Generator<() => void> {
    const cx = (r.x0 + r.x1) / 2;
    const cy = (r.y0 + r.y1) / 2;
    const all: Array<[number, number]> = [];
    for (let ty = r.y0; ty <= r.y1; ty++) for (let tx = r.x0; tx <= r.x1; tx++) all.push([tx, ty]);
    all.sort((a, b) => Math.hypot(a[0] - cx, a[1] - cy) - Math.hypot(b[0] - cx, b[1] - cy));
    for (const [tx, ty] of all) {
      const key = `${l.no}:${tx},${ty}`;
      const tl = this.tiles.get(key);
      if (tl) {
        if (!room) {
          this.tiles.delete(key);
          this.tiles.set(key, tl);
        }
        continue;
      }
      if (room && this.tiles.size >= TILES * ROOM_SHARE) return;
      yield () => out.push(this.tile(f, l, tx, ty, false).pic);
    }
  }

  // The tiles the room (floor, walls and a tile round them) covers at s.
  private roomTiles(f: SceneFrame, s: number): { x0: number; y0: number; x1: number; y1: number } {
    const L = f.room.L;
    const xs = [0, L.W, -L.D, L.W - L.D].map((v) => v * s);
    const ys = [-L.H * s, ((L.W + L.D) * s) / 2];
    return { x0: Math.floor(Math.min(...xs) / TILE) - 1, y0: Math.floor(Math.min(...ys) / TILE) - 1, x1: Math.floor(Math.max(...xs) / TILE) + 1, y1: Math.floor(Math.max(...ys) / TILE) + 1 };
  }

  // Sprites at camera c's scale for the props, builds and piles in its view:
  // still props idle or worked as they are now; animated props only their
  // still parts (drawn through a pen that paints nothing; their pictures
  // are drawn per frame).
  private *propChores(f: SceneFrame, l: Layer, c: Camera, out: Pic[]): Generator<() => void> {
    const s = c.s;
    const OX = Math.round(c.ox);
    const OY = Math.round(c.oy);
    const w = Math.round(c.w);
    const h = Math.round(c.h);
    const t = tintOf(f.world);
    const ink = inkOf(f.world);
    const seen = (b: { sx0: number; sy0: number; sx1: number; sy1: number }) => b.sx1 > 0 && b.sy1 > 0 && b.sx0 < w && b.sy0 < h;
    for (let i = 0; i < f.room.props.length; i++) {
      const p = f.room.props[i];
      if (!seen(propBox(p, s, OX, OY))) continue;
      const active = !!f.active[i];
      if (p.art.animated) {
        if (l.warmed.has(i)) continue;
        yield () => {
          l.warmed.add(i);
          this.drawProp(new Bounds(w, h), p, (u, v, z) => {
            const [x, y, zz] = toWorld(p, u, v, z);
            return [(x - y) * s, ((x + y) * s) / 2 - zz * s];
          }, s, f.t, active);
        };
        continue;
      }
      if (l.props[i]?.[active ? 1 : 0]) continue;
      yield () => {
        const sp = this.propSprite(l, i, p, active);
        for (const part of [sp.body, sp.floor]) if (part) out.push(picOf(part.img, t));
      };
    }
    for (const b of f.builds) {
      if ((b.blocks.length || b.pending.length) && !l.builds.has(this.buildKey(b))) {
        yield () => {
          const e = this.buildAt(l, b, ink);
          if (e.sprite) out.push(picOf(e.sprite.img, t));
        };
      }
      if (b.pile && !l.piles.has(this.pileKey(b.pile))) {
        yield () => out.push(picOf(this.pileAt(l, b, ink).img, t));
      }
    }
  }

  // The figures and the critter as they stand, at scale s, with their
  // contact shadows, the ring each would have if picked, and their emotes;
  // the workstations and the desk upgrades.
  private *figureChores(f: SceneFrame, s: number, out: Pic[]): Generator<() => void> {
    const t = tintOf(f.world);
    const ink = inkOf(f.world);
    const made = (img: Bitmap, fresh: boolean) => {
      if (fresh || !hasPic(img, t)) out.push(picOf(img, t));
    };
    if (!this.shadows.has(s)) {
      yield () => {
        const sh = this.shadowsAt(s);
        for (const d of [sh.fig, sh.nap, sh.pet]) made(d.img, true);
      };
    }
    for (const g of f.figures) {
      yield () => {
        const m = spriteStats.misses;
        const sp = figureSprite(g, s, ink);
        made(sp.img, spriteStats.misses > m);
        if (g.emote) {
          const e = spriteStats.misses;
          const es = emoteSprite(g.emote.kind, g.emote.t, s, ink);
          made(es.img, spriteStats.misses > e);
        }
        const key = `${s}|3.6|${pack(g.traits.color)}|1`;
        if (!this.rings.has(key)) made(memo(this.rings, key, 64, () => ringSprite(3.6, s, g.traits.color, 1)).img, true);
      };
    }
    const cr = f.critter;
    if (cr) {
      yield () => {
        const m = spriteStats.misses;
        const sp = critterSprite(cr, f.t, s, ink);
        made(sp.img, spriteStats.misses > m);
      };
    }
    for (const n of f.npcs ?? []) {
      // a local as it stands, and every frame of its work (it goes round
      // them all the time it is on duty)
      const art = f.world.npcs?.[n.k];
      if (!art) continue;
      const one = (act: NpcAct, frame: number) => () => {
        const m = spriteStats.misses;
        const sp = npcSprite(f.world, { ...n, act, frame }, s, ink);
        made(sp.img, spriteStats.misses > m);
      };
      yield one(n.act, n.frame);
      for (let i = 0; i < art.work.frames; i++) yield one('work', i);
    }
    const warmed = new Set<string>();
    for (const d of f.desks ?? []) {
      if (d.grow <= 0) continue;
      yield () => {
        for (const { sp, fresh } of deskPictures(f.world, d, f.t, s, ink)) made(sp.img, fresh);
      };
      // Every frame of its loops at s, lit, and the still one unlit. This
      // runs only at the scales of the cameras a key away (see chores), so
      // a view moved to one finds every step of a loop kept; at a scale
      // none of them has, a frame is drawn when it first shows.
      if (popping(d.grow)) continue;
      for (const [k, lp] of (workstationOf(f.world).loops ?? []).entries()) {
        const mark = `${d.wall}|${k}`;
        if (warmed.has(mark)) continue;
        warmed.add(mark);
        for (let i = 0; i <= lp.frames; i++) {
          yield () => {
            const m = deskStats.misses;
            const sp = loopSprite(f.world, k, i % lp.frames, i < lp.frames, d.wall, s, ink);
            made(sp.img, deskStats.misses > m);
          };
        }
      }
    }
    for (const tk of f.trinkets ?? []) {
      yield () => {
        const m = spriteStats.misses;
        const sp = trinketSprite(tk.kind, tk.color, s, ink);
        made(sp.img, spriteStats.misses > m);
      };
    }
  }

  // ── what lies on the floor ────────────────────────────────────────────

  private shadowsAt(s: number) {
    let sh = this.shadows.get(s);
    if (!sh) {
      if (this.shadows.size >= 8) this.shadows.clear();
      const round = (r: number, a: number) => shadowSprite(Math.SQRT2 * r * s, (Math.SQRT2 * r * s) / 2, a);
      // A sleeper lies on its back, about a figure's height long.
      this.shadows.set(s, (sh = { fig: round(2.4, 0.3), nap: shadowSprite(5 * s, 2 * s, 0.28), pet: round(1.5, 0.26) }));
    }
    return sh;
  }

  // Contact shadows and rings, painted (the old way).
  private decals(c: Canvas, f: SceneFrame, P: Project, s: number): void {
    const sh = this.shadowsAt(s);
    for (const g of f.figures) {
      const [x, y] = P(g.x, g.y, 0);
      const d = g.pose === 'sleep' ? sh.nap : sh.fig;
      c.drawImage(d.img, Math.round(x - d.cx), Math.round(y - d.cy));
      if (g.hurt) {
        const k = 0.5 + 0.5 * Math.sin(f.t * 7);
        floorRing(c, P, g.x, g.y, 3 * (1 + 0.12 * k), s, f.world.palette.bad, 0.55 + 0.45 * k);
      }
      if (g.selected) floorRing(c, P, g.x, g.y, 3.6, s, g.traits.color, 1);
    }
    const cr = f.critter;
    if (cr) {
      const [x, y] = P(cr.x, cr.y, 0);
      c.globalAlpha = Math.max(0.35, 1 - cr.z / 12);
      c.drawImage(sh.pet.img, Math.round(x - sh.pet.cx), Math.round(y - sh.pet.cy));
      c.globalAlpha = 1;
    }
    for (const n of f.npcs ?? []) {
      if (!n.shadow) continue;
      const [x, y] = P(n.x, n.y, 0);
      c.drawImage(sh.fig.img, Math.round(x - sh.fig.cx), Math.round(y - sh.fig.cy));
    }
  }

  // Contact shadows and rings as sprites: a ring snapped to the pixel under
  // its figure's feet, the hurt pulse and a floating critter's fading
  // shadow in steps.
  private floorPics(f: SceneFrame, P: Project, s: number, t: Tint, put: (id: string, pic: Pic, x: number, y: number) => void): void {
    const sh = this.shadowsAt(s);
    const ring = (id: string, x: number, y: number, r: number, color: RGB, a: number) => {
      const rg = memo(this.rings, `${s}|${r}|${pack(color)}|${a}`, 64, () => ringSprite(r, s, color, a));
      put(id, picOf(rg.img, t), Math.round(x) - rg.cx, Math.round(y) - rg.cy);
    };
    for (const g of f.figures) {
      const [x, y] = P(g.x, g.y, 0);
      const d = g.pose === 'sleep' ? sh.nap : sh.fig;
      put(`shadow:${g.id}`, picOf(d.img, t), Math.round(x - d.cx), Math.round(y - d.cy));
      if (g.hurt) {
        const k = Math.round((0.5 + 0.5 * Math.sin(f.t * 7)) * (PULSE - 1)) / (PULSE - 1);
        ring(`hurt:${g.id}`, x, y, 3 * (1 + 0.12 * k), f.world.palette.bad, 0.55 + 0.45 * k);
      }
      if (g.selected) ring(`ring:${g.id}`, x, y, 3.6, g.traits.color, 1);
    }
    const cr = f.critter;
    if (cr) {
      const [x, y] = P(cr.x, cr.y, 0);
      const a = Math.round(Math.max(0.35, 1 - cr.z / 12) * 32) / 32;
      const img =
        a >= 1
          ? sh.pet.img
          : memo(this.faded, `${s}|${a}`, 16, () => {
              const c = copyOf(sh.pet.img);
              for (let o = 0; o < c.data.length; o++) c.data[o] *= a;
              return c;
            });
      put('shadow:critter', picOf(img, t), Math.round(x - sh.pet.cx), Math.round(y - sh.pet.cy));
    }
    for (const n of f.npcs ?? []) {
      if (!n.shadow) continue;
      const [x, y] = P(n.x, n.y, 0);
      put(`shadow:npc:${n.k}`, picOf(sh.fig.img, t), Math.round(x - sh.fig.cx), Math.round(y - sh.fig.cy));
    }
  }

  // ── the depth-sorted things ───────────────────────────────────────────

  private buildKey(b: SceneFrame['builds'][number]): string {
    return `${b.shape}:${b.top.x},${b.top.y}:${b.blocks.length}:${b.pending.length}`;
  }

  private pileKey(pr: { x0: number; y0: number; x1: number; y1: number }): string {
    return `${pr.x0},${pr.y0},${pr.x1},${pr.y1}`;
  }

  // A build as it stands, drawn at the layer's scale (once per state).
  private buildAt(l: Layer, b: SceneFrame['builds'][number], ink: string): Build {
    const key = this.buildKey(b);
    let e = l.builds.get(key);
    if (!e) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      let z1 = 0;
      for (const q of [...b.blocks, ...b.pending]) {
        x0 = Math.min(x0, q.x);
        y0 = Math.min(y0, q.y);
        x1 = Math.max(x1, q.x + 1);
        y1 = Math.max(y1, q.y + 1);
        z1 = Math.max(z1, q.z + 1);
      }
      e = { sprite: buildSprite(b.blocks, b.pending, b.colors, b.ghost, l.s, ink), box: [x0, y0, x1, y1, z1], seen: this.renders };
      l.builds.set(key, e);
      this.stats.builds++;
    }
    return e;
  }

  private pileAt(l: Layer, b: SceneFrame['builds'][number], ink: string): Sprite {
    const pr = b.pile!;
    const key = this.pileKey(pr);
    let sp = l.piles.get(key);
    if (!sp) l.piles.set(key, (sp = pileSprite(pr, b.colors, l.s, ink, Math.abs(pr.x0 * 31 + pr.y0 * 17))));
    return sp;
  }

  // The depth-sorted things, and the floor parts of the props (`floors`,
  // to draw first).
  private items(f: SceneFrame, l: Layer, P: Project, s: number, OX: number, OY: number, ink: string, w: number, h: number, floors: Item[]): Item[] {
    const out: Item[] = [];
    const seen = (b: { sx0: number; sy0: number; sx1: number; sy1: number }) => b.sx1 > 0 && b.sy1 > 0 && b.sx0 < w && b.sy0 < h;
    const sprite = (id: string, sp: Sprite, box: Omit<Drawable, 'sx0' | 'sy0' | 'sx1' | 'sy1'>): Item => {
      const x = OX + sp.x;
      const y = OY + sp.y;
      return { ...box, id, img: sp.img, x, y, sx0: x, sy0: y, sx1: x + sp.img.width, sy1: y + sp.img.height };
    };
    // Each station's own item (what a local behind its counter or seated
    // stands on, see below), and those its locals work (round a loop: see
    // cyclePic).
    const propItem = new Map<number, Item>();
    const worked = this.workedOf(f);
    f.room.props.forEach((p, i) => {
      const r = footprint(p);
      const box = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, h: p.art.height, point: false };
      const vol = propBox(p, s, OX, OY);
      if (!seen(vol)) return;
      const active = !!f.active[i];
      if (p.art.animated) {
        const it: Item = { ...box, ...vol, id: `prop:${i}`, x: 0, y: 0, anim: { p, i, active, local: worked.has(i) } };
        out.push(it);
        propItem.set(i, it);
        return;
      }
      const sp = this.propSprite(l, i, p, active);
      if (sp.floor) floors.push(sprite(`floor:${i}`, sp.floor, box));
      if (sp.body) {
        const it = sprite(`prop:${i}`, sp.body, box);
        out.push(it);
        propItem.set(i, it);
      }
    });
    const bodies: Item[] = [];
    for (const d of f.desks ?? []) {
      // A workstation stands on the floor like a prop, as tall as it has
      // grown: its body, then its screen over it (one box, so in that
      // order), and its loops as points at their anchors, sorted among
      // what stands on it.
      if (d.grow <= 0) continue;
      const [x, y] = P(d.x0, d.y0, 0);
      const r = footprint(d);
      const box = { x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, h: workstationOf(f.world).height * growth(d.grow), point: false };
      // The screen is as wide as the body for the depth (particles are
      // slotted by it): a bit of one at its edge does not slip under it.
      let body: DeskSprite | undefined;
      let bodyItem: Item | undefined;
      for (const { sp, at, sortAs, id } of deskPictures(f.world, d, f.t, s, ink)) {
        body ??= sp;
        const dx = Math.round(x) - sp.ax;
        const dy = Math.round(y) - sp.ay;
        const own = { sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height };
        let it: Item;
        if (at) {
          const [px, py] = toWorld(d, at[0], at[1], 0);
          it = { x0: px, y0: py, x1: px, y1: py, h: at[2], point: true, ...own, on: bodyItem, id, img: sp.img, x: dx, y: dy };
        } else {
          const bx = Math.round(x) - body.ax;
          const by = Math.round(y) - body.ay;
          const sz = { sx0: bx, sy0: by, sx1: bx + body.img.width, sy1: by + body.img.height };
          it = { ...box, ...(sortAs ? sz : own), id, img: sp.img, x: dx, y: dy };
        }
        if (seen(it)) {
          out.push(it);
          if (!at && !bodyItem) bodyItem = it;
          if (!at && it.id === `desk:${d.id}`) bodies.push(it);
        }
      }
    }
    f.builds.forEach((b, j) => {
      if (b.blocks.length || b.pending.length) {
        const e = this.buildAt(l, b, ink);
        e.seen = this.renders;
        if (e.sprite) {
          const [x0, y0, x1, y1, z1] = e.box;
          const it = sprite(`build:${j}`, e.sprite, { x0, y0, x1, y1, h: z1, point: false });
          if (seen(it)) out.push(it);
        }
      }
      if (b.pile) {
        const pr = b.pile;
        const it = sprite(`pile:${j}`, this.pileAt(l, b, ink), { x0: pr.x0, y0: pr.y0, x1: pr.x1, y1: pr.y1, h: 1.5, point: false });
        if (seen(it)) out.push(it);
      }
    });
    for (const g of f.figures) {
      // Anchors are whole pixels: whole-pixel blits (the fast path). A
      // hop lifts the figure only, not where it stands.
      const sp = figureSprite(g, s, ink);
      const [x, y] = P(g.x, g.y, g.z + (g.hop ?? 0));
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const it: Item = { x0: g.x, y0: g.y, x1: g.x, y1: g.y, h: g.z, point: true, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: `fig:${g.id}`, img: sp.img, x: dx, y: dy };
      if (seen(it)) out.push(it);
    }
    for (const n of f.npcs ?? []) {
      // A local is a point like a figure; one behind its counter or seated
      // stands on its station's box (see depth.ts): drawn over it, behind
      // whatever is behind it.
      const sp = npcSprite(f.world, n, s, ink);
      const [x, y] = P(n.x, n.y, n.z);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const it: Item = { x0: n.x, y0: n.y, x1: n.x, y1: n.y, h: n.z, point: true, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: `npc:${n.k}`, img: sp.img, x: dx, y: dy };
      if (n.on) it.on = propItem.get(n.prop);
      if (seen(it)) out.push(it);
    }
    for (const tk of f.trinkets ?? []) {
      // Desk upgrades stand on their workstation, sorted like a figure (on
      // top of the desk it stands on).
      const sp = trinketSprite(tk.kind, tk.color, s, ink);
      const [x, y] = P(tk.x, tk.y, tk.z ?? 0);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const on = bodies.find((b) => tk.x >= b.x0 && tk.x <= b.x1 && tk.y >= b.y0 && tk.y <= b.y1);
      const it: Item = { x0: tk.x, y0: tk.y, x1: tk.x, y1: tk.y, h: tk.z ?? 0, point: true, on, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: `trinket:${tk.id}`, img: sp.img, x: dx, y: dy };
      if (seen(it)) out.push(it);
    }
    const cr = f.critter;
    if (cr) {
      // Lifted by its hover height (a drone, an imp).
      const sp = critterSprite(cr, f.t, s, ink);
      const [x, y] = P(cr.x, cr.y, cr.z);
      const dx = Math.round(x) - sp.ax;
      const dy = Math.round(y) - sp.ay;
      const it: Item = { x0: cr.x, y0: cr.y, x1: cr.x, y1: cr.y, h: cr.z, point: true, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height, id: 'critter', img: sp.img, x: dx, y: dy };
      if (seen(it)) out.push(it);
    }
    return out;
  }

  // The particles near the canvas, by the slot they go in (slot k is drawn
  // just before order[k]).
  private slotted(f: SceneFrame, P: Project, items: Item[], order: number[], w: number, h: number): Particle[][] {
    const slots: Particle[][] = [];
    for (const p of f.particles) {
      const [x, y] = P(p.x, p.y, p.z);
      if (x < -BITS_MARGIN || y < -BITS_MARGIN || x > w + BITS_MARGIN || y > h + BITS_MARGIN || opacity(p) <= 0.02) continue;
      (slots[slotOf(p.x, p.y, p.z, x, y, items, order)] ??= []).push(p);
    }
    return slots;
  }

  // Drifting bits are drawn again per ambient step; in between, a slot of
  // them only is kept as it was. That holds while no bit has changed slot
  // since (one that did would show twice or not at all) and the camera has
  // not moved far (bits are drawn only a margin past the canvas).
  private thaw(f: SceneFrame, l: Layer, OX: number, OY: number, slots: Particle[][], anchor: (k: number) => string): void {
    const b = this.bits;
    const tick = Math.floor(f.t * AMBIENT_FPS);
    let stale = b.tick !== tick || b.layer !== l.key || Math.abs(OX - b.ox) * 2 > BITS_MARGIN || Math.abs(OY - b.oy) * 2 > BITS_MARGIN;
    for (let k = 0; k < slots.length && !stale; k++) {
      const ps = slots[k];
      if (!ps) continue;
      const id = anchor(k);
      for (const p of ps) {
        const was = b.where.get(p);
        if (was !== undefined && was !== id) {
          stale = true;
          break;
        }
      }
    }
    if (!stale) return;
    b.tick = tick;
    b.layer = l.key;
    b.ox = OX;
    b.oy = OY;
    b.epoch++;
    b.where.clear();
  }

  // The particles of one slot as pictures (origin-relative), one per bunch
  // of them close together, each cropped to what it paints.
  private bitsPics(id: string, ps: Particle[], f: SceneFrame, P: Project, s: number, OX: number, OY: number, w: number, h: number, t: Tint): Array<{ id: string; v: Vol }> {
    const drifting = ps.every(ambientBit);
    return this.group(id, drifting ? `a${this.bits.epoch}` : `e${this.renders}`, () => {
      for (const p of ps) if (ambientBit(p)) this.bits.where.set(p, id);
      // Each bit's box, and the bunches they make.
      const M = BITS_MARGIN;
      const boxes = ps.map((p) => {
        const B = new Bounds(w, h);
        drawParticle(B, P, p, s, f.t);
        return { x0: Math.max(-M, B.x0), y0: Math.max(-M, B.y0), x1: Math.min(w + M, B.x1), y1: Math.min(h + M, B.y1), light: false };
      });
      const bunches = clusters(
        boxes.filter((b) => b.x1 > b.x0 && b.y1 > b.y0),
        GAP,
      );
      const out: Array<{ name: string; img: Bitmap; x: number; y: number }> = [];
      for (const b of bunches) {
        const c = new Canvas(b.x1 - b.x0, b.y1 - b.y0);
        const Q: Project = (x, y, z) => {
          const q = P(x, y, z);
          return [q[0] - b.x0, q[1] - b.y0];
        };
        ps.forEach((p, k) => {
          const q = boxes[k];
          if (q.x1 > b.x0 && q.x0 < b.x1 && q.y1 > b.y0 && q.y0 < b.y1) drawParticle(c, Q, p, s, f.t);
        });
        const crop = cropped(c);
        if (!crop) continue;
        if (t) tintAll(crop.img.data, t.rgb, t.k);
        out.push({ name: `${out.length}`, img: crop.img, x: b.x0 + crop.x - OX, y: b.y0 + crop.y - OY });
      }
      return out;
    });
  }

  // The props frame f's locals work (see worked).
  private workedOf(f: SceneFrame): ReadonlySet<number> {
    const n = f.npcs?.length ?? 0;
    const w = this.worked;
    if (w.room !== f.room || w.n !== n) this.worked = { room: f.room, n, props: new Set((f.npcs ?? []).filter((q) => q.works).map((q) => q.prop)) };
    return this.worked.props;
  }

  // An animated prop drawn whole on its own (world pixels), again per
  // ambient step (each prop at its own phase) or when worked or left.
  private animPic(it: Item, f: SceneFrame, l: Layer, s: number, t: Tint): Vol {
    const { p, i, active } = it.anim!;
    const tick = Math.floor(f.t * AMBIENT_FPS + phaseOf(i));
    return this.vol(it.id, `${l.key}|${tick}|${active ? 1 : 0}`, () => this.animDrawn(p, i, f, l, s, f.t, active, t));
  }

  // An animated prop a local works (see SceneFrame.npcs): its motion goes
  // round a loop of CYCLE steps, each drawn once at this scale and kept, a
  // picture the terminal keeps too. Worked all the time, it would send a
  // new picture every ambient step; this way, once round, it is only
  // placed.
  private cyclePic(it: Item, f: SceneFrame, l: Layer, s: number, t: Tint): { pic: Pic; x: number; y: number } | null {
    const { p, i } = it.anim!;
    const step = cycleStep(f.t, i);
    const key = `${i}|${step}`;
    let c = l.cycles.get(key);
    if (c === undefined) {
      const d = this.animDrawn(p, i, f, l, s, step / AMBIENT_FPS, true, t);
      l.cycles.set(key, (c = d ? { pic: fresh(d.img), x: d.x, y: d.y } : null));
    }
    return c;
  }

  // Prop p (the i-th) drawn whole at clock `time`, worked or not (world
  // pixels), cropped: light it lays on with 'screen' is lifted off the base
  // under it (see lift); tinted.
  private animDrawn(p: PlacedProp, i: number, f: SceneFrame, l: Layer, s: number, time: number, active: boolean, t: Tint): Drawn {
    this.stats.animated++;
    l.warmed.add(i);
    const rel = (u: number, v: number, z: number): [number, number] => {
      const [x, y, zz] = toWorld(p, u, v, z);
      return [(x - y) * s, ((x + y) * s) / 2 - zz * s];
    };
    const B = new Bounds(TILE, TILE);
    this.drawProp(B, p, rel, s, time, active);
    if (!(B.x1 > B.x0 && B.y1 > B.y0)) return null;
    const { x0, y0, x1, y1 } = B;
    const at = (u: number, v: number, z: number): [number, number] => {
      const q = rel(u, v, z);
      return [q[0] - x0, q[1] - y0];
    };
    let img = new Canvas(x1 - x0, y1 - y0);
    this.drawProp(img, p, at, s, time, active);
    if (B.light) {
      const under = this.ground(f, l, x0, y0, x1 - x0, y1 - y0);
      const onto = copyOf(under);
      this.drawProp(onto, p, at, s, time, active);
      img = lift(img, onto, under);
    }
    const crop = cropped(img);
    if (!crop) return null;
    if (t) tintAll(crop.img.data, t.rgb, t.k);
    return { img: crop.img, x: x0 + crop.x, y: y0 + crop.y };
  }

  // The room's overlay (world pixels) per ambient step: found in pieces
  // round what it paints, each piece drawn when first in view (light it
  // lays on lifted off the base under it), laid out in tiles on a grid
  // fixed to the world, each cropped. A pan only moves them.
  private overlayPics(f: SceneFrame, l: Layer, t: Tint, OX: number, OY: number, w: number, h: number): Array<{ id: string; v: Vol }> {
    const draw = f.world.room.overlay!;
    const s = l.s;
    const tag = `${l.key}|${Math.floor(f.t * AMBIENT_FPS + 0.5)}`;
    const P0: Project = (x, y, z) => [(x - y) * s, ((x + y) * s) / 2 - z * s];
    if (this.over.tag !== tag) {
      this.stats.overlays++;
      const B = new Bounds(TILE, TILE);
      B.save();
      draw(this.roomView(f, B, P0, s));
      B.restore();
      this.over = { tag, pieces: clusters(B.marks, GAP), drawn: new Map() };
    }
    const { pieces, drawn } = this.over;
    const piece = (n: number): Canvas | null => {
      if (drawn.has(n)) return drawn.get(n)!;
      const b = pieces[n];
      const at: Project = (x, y, z) => {
        const q = P0(x, y, z);
        return [q[0] - b.x0, q[1] - b.y0];
      };
      const paint = (c: Canvas) => {
        c.save();
        draw(this.roomView(f, c, at, s));
        c.restore();
      };
      let img = new Canvas(b.x1 - b.x0, b.y1 - b.y0);
      paint(img);
      if (b.light) {
        const under = this.ground(f, l, b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
        const onto = copyOf(under);
        paint(onto);
        img = lift(img, onto, under);
      }
      if (t) tintAll(img.data, t.rgb, t.k);
      drawn.set(n, img);
      return img;
    };
    const T = OVERLAY_TILE;
    const out: Array<{ id: string; v: Vol }> = [];
    const done = new Set<string>();
    pieces.forEach((b, n) => {
      const x0 = Math.max(b.x0, -OX);
      const y0 = Math.max(b.y0, -OY);
      const x1 = Math.min(b.x1, w - OX);
      const y1 = Math.min(b.y1, h - OY);
      if (x1 <= x0 || y1 <= y0) return;
      for (let gy = Math.floor(y0 / T); gy * T < y1; gy++) {
        for (let gx = Math.floor(x0 / T); gx * T < x1; gx++) {
          const name = `${gx},${gy}`;
          if (done.has(name)) continue;
          done.add(name);
          const id = `overlay#${name}`;
          out.push({
            id,
            v: this.vol(id, tag, () => {
              // Every piece over this tile (pieces do not overlap).
              const c = new Canvas(T, T);
              pieces.forEach((q, m) => {
                if (q.x1 <= gx * T || q.x0 >= (gx + 1) * T || q.y1 <= gy * T || q.y0 >= (gy + 1) * T) return;
                const img = piece(m);
                if (img) c.drawImage(img, q.x0 - gx * T, q.y0 - gy * T);
              });
              const crop = cropped(c);
              return crop ? { img: crop.img, x: gx * T + crop.x, y: gy * T + crop.y } : null;
            }),
          });
        }
      }
    });
    return out;
  }

  private drawProp(pen: Pen, p: PlacedProp, at: (u: number, v: number, z: number) => [number, number], s: number, t: number, active: boolean): void {
    pen.save();
    p.art.draw({ pen, s, at, len: p.len, dep: p.dep, wall: p.wall, island: p.island, t, active, seed: p.seed });
    pen.restore();
  }

  // Prop i drawn on its own at the layer's scale (idle or worked), split
  // into body and floor (see PropSprite), each cropped to what it painted.
  private propSprite(l: Layer, i: number, p: PlacedProp, active: boolean): PropSprite {
    const slot = (l.props[i] ??= [undefined, undefined]);
    const k = active ? 1 : 0;
    const had = slot[k];
    if (had) return had;
    const s = l.s;
    const r = footprint(p);
    const pad = Math.ceil(PROP_PAD * s) + 4;
    const bx = Math.floor((r.x0 - r.y1) * s) - pad;
    const by = Math.floor(((r.x0 + r.y0) / 2 - p.art.height - BODY_UP) * s) - pad;
    const cw = Math.ceil((r.x1 - r.y0) * s) + pad - bx;
    const ch = Math.ceil(((r.x1 + r.y1) / 2) * s) + pad - by;
    const tmp = new Canvas(cw, ch);
    const at = (u: number, v: number, z: number): [number, number] => {
      const [x, y, zz] = toWorld(p, u, v, z);
      return [(x - y) * s - bx, ((x + y) * s) / 2 - zz * s - by];
    };
    this.drawProp(tmp, p, at, s, 0, active);
    this.stats.props++;
    // The body: the outline of its box (a little taller, and grown by its
    // ink and a little slack for overhangs).
    const box: Array<[number, number]> = [];
    for (const u of [0, p.len]) for (const v of [0, p.dep]) for (const z of [0, p.art.height + BODY_UP]) box.push(at(u, v, z));
    const mask = new Canvas(cw, ch);
    mask.beginPath();
    hullOf(box).forEach(([x, y], j) => (j ? mask.lineTo(x, y) : mask.moveTo(x, y)));
    mask.closePath();
    mask.fillStyle = '#ffffff';
    mask.fill();
    mask.strokeStyle = '#ffffff';
    mask.lineJoin = 'round';
    mask.lineWidth = 2 * (inkWidth(s) + 1 + BODY_SLACK * s);
    mask.stroke();
    const parts = split(tmp, mask);
    const place = (c: Canvas): Sprite | null => {
      const crop = cropped(c);
      return crop ? { img: crop.img, x: bx + crop.x, y: by + crop.y } : null;
    };
    return (slot[k] = { body: place(parts.inside), floor: place(parts.outside) });
  }

  // ── light ─────────────────────────────────────────────────────────────

  // A glowing bit's halo: its radius in units per scale unit, and strength.
  private static glowOf(p: Particle): { r: number; a: number } {
    return { r: p.kind === 'bolt' ? 3 : p.kind === 'glint' ? 2.4 : p.kind === 'ember' ? 2.2 : 1.8, a: p.kind === 'bolt' ? 0.7 : 0.5 };
  }

  // Halos blended 'screen' into the picture (the old way).
  private glows(c: Canvas, f: SceneFrame, P: Project, s: number, w: number, h: number): void {
    const d = c.data;
    for (const p of f.particles) {
      if (!p.glow) continue;
      const a = opacity(p);
      if (a <= 0.05) continue;
      const [x, y] = P(p.x, p.y, p.z);
      const g = Scene.glowOf(p);
      addHalo(d, w, h, x, y, g.r * s, p.color, g.a * a);
    }
    for (const b of f.builds) {
      if (!b.complete) continue;
      const cap = b.colors[b.colors.length - 1] ?? [255, 230, 160];
      const [x, y] = P(b.top.x, b.top.y, b.top.z + 0.6);
      const k = 0.5 + 0.5 * Math.sin(f.t * 2.4);
      addHalo(d, w, h, x, y, (5 + 1.5 * k) * s, mixRgb(cap, [255, 255, 255], 0.3), 0.45 + 0.2 * k);
      addHalo(d, w, h, x, y, 1.6 * s, [255, 255, 255], 0.5);
    }
  }

  // Halos as sprites, untinted: a bit's fade and the beacon's pulse in
  // steps.
  private glowPics(f: SceneFrame, P: Project, s: number, put: (id: string, pic: Pic, x: number, y: number) => void): void {
    const halo = (id: string, x: number, y: number, r: number, c: RGB, a: number) => {
      const R = Math.max(1, Math.round(r));
      const img = memo(this.halos, `${R}|${pack(c)}|${a}`, 256, () => haloSprite(R, c, a));
      put(id, picOf(img, null), Math.round(x) - R, Math.round(y) - R);
    };
    for (const p of f.particles) {
      if (!p.glow) continue;
      const a = opacity(p);
      if (a <= 0.05) continue;
      const q = Math.round(a * PULSE) / PULSE;
      if (!q) continue;
      const [x, y] = P(p.x, p.y, p.z);
      const g = Scene.glowOf(p);
      halo(`glow:${idOf(p)}`, x, y, g.r * s, p.color, g.a * q);
    }
    f.builds.forEach((b, j) => {
      if (!b.complete) return;
      const cap = b.colors[b.colors.length - 1] ?? [255, 230, 160];
      const [x, y] = P(b.top.x, b.top.y, b.top.z + 0.6);
      const k = Math.round((0.5 + 0.5 * Math.sin(f.t * 2.4)) * (PULSE - 1)) / (PULSE - 1);
      halo(`beacon:${j}`, x, y, (5 + 1.5 * k) * s, mixRgb(cap, [255, 255, 255], 0.3), 0.45 + 0.2 * k);
      halo(`beacon-core:${j}`, x, y, 1.6 * s, [255, 255, 255], 0.5);
    });
  }
}
