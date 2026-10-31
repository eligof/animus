import type { RGB } from '../term/color.ts';
import type { CritterFrame, FigureFrame, NpcFrame, Trinket } from '../world/frame.ts';
import type { Costume, Emote, Traits, Wear } from '../world/character.ts';
import { Canvas } from './canvas.ts';
import { hexOf } from './iso.ts';
import type { Bitmap } from './types.ts';
import { auraGlow, buildFigure } from './figure/body.ts';
import { critterArt } from './figure/critters.ts';
import { emoteArt } from './figure/emotes.ts';
import { plastered } from './figure/head.ts';
import { lookOf, type Look } from './figure/look.ts';
import { render, Sketch, type Mat } from './figure/paint.ts';
import { blinkAt, eyesAt, frameOf, LOOP, MUG_POSES, rigFor, type Eyes } from './figure/rig.ts';
import { drawTrinket } from './figure/trinkets.ts';
import type { Npc, WorldDef } from '../worlds/types.ts';
import { puppetOf } from './npc/acts.ts';
import { NPC_BOX, buildNpc } from './npc/puppet.ts';

// Characters, the critter, emotes and desk upgrades as outlined cartoon
// sprites (see the art direction in
// docs/superpowers/specs/2026-10-24-illustrated-design.md). Each returns a
// bitmap and its anchor: (ax, ay) in the bitmap's pixels is the point
// between the feet (figures, critter), the bottom centre (emotes) or the
// foot (desk upgrades), to be placed where the camera projects the world
// point. `s` is canvas pixels per unit; `ink` the world's outline colour.
// Sprites are cached; contact shadows and selection rings are the scene's
// (they lie on the floor).
//
// A standing figure is about 14 units tall and 8 wide; a block carried on
// the head or a cheer reaches about 18, hats up to about 21 (a level's
// party cone; see figureTop in world/frame.ts); a sleeper lies about 14
// long. Anchors are whole pixels, so sprites blit unscaled.
export type Sprite = { img: Bitmap; ax: number; ay: number };

// ---- the cache ----------------------------------------------------------------

// Animation is quantized to loop frames (15 a second: see art/motion.ts)
// and `s` to eighths, so a figure redraws only when what it shows changes.
// Least recently used sprites go first past MAX entries or MAX_BYTES of
// pixels (a room of twenty busy agents and its locals keeps about this
// many in use).
const MAX = 3000;
const MAX_BYTES = 128 << 20;
const cache = new Map<string, Sprite>();
let bytes = 0;
export const spriteStats = { hits: 0, misses: 0 };

function cached(key: string, make: () => Sprite): Sprite {
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    spriteStats.hits++;
    return hit;
  }
  spriteStats.misses++;
  const sp = make();
  cache.set(key, sp);
  bytes += sp.img.data.length;
  while (cache.size > MAX || bytes > MAX_BYTES) {
    const [k, old] = cache.entries().next().value as [string, Sprite];
    cache.delete(k);
    bytes -= old.img.data.length;
  }
  return sp;
}

export function clearSprites(): void {
  cache.clear();
  bytes = 0;
}

export const spriteCount = () => cache.size;

const quant = (s: number) => Math.max(0.5, Math.round(s * 8) / 8);
const outline = (s: number) => Math.max(1.5, 0.28 * s);

// Paints a sketch into a canvas big enough for anything a pose does (x, y
// in units round the anchor), over a picture laid `under` it (centred at
// its x, y), then crops to what was drawn, a clear pixel all round.
type Under = { img: Bitmap; x: number; y: number };
function paint(sk: Sketch, s: number, ink: string, flip: boolean, box: { x0: number; x1: number; y0: number; y1: number }, fade = 1, under?: Under): Sprite {
  const pad = 2;
  if (flip) box = { ...box, x0: -box.x1, x1: -box.x0 };
  const ax = Math.round(-box.x0 * s) + pad;
  const ay = Math.round(-box.y0 * s) + pad;
  const c = new Canvas(Math.ceil((box.x1 - box.x0) * s) + 2 * pad, Math.ceil((box.y1 - box.y0) * s) + 2 * pad);
  if (under) {
    // On whole pixels, into a canvas still clear: its rows copied as they are.
    const u = under.img;
    const x = Math.round(ax + (flip ? -under.x : under.x) * s - u.width / 2);
    const y = Math.round(ay + under.y * s - u.height / 2);
    const x0 = Math.max(0, x);
    const x1 = Math.min(c.width, x + u.width);
    for (let r = Math.max(0, y); r < Math.min(c.height, y + u.height) && x0 < x1; r++) {
      c.data.set(u.data.subarray(((r - y) * u.width + x0 - x) * 4, ((r - y) * u.width + x1 - x) * 4), (r * c.width + x0) * 4);
    }
  }
  const base: Mat = [flip ? -s : s, 0, 0, s, ax, ay];
  render(c, sk, base, outline(s), ink);
  if (fade < 1) {
    const d = c.data;
    for (let o = 0; o < d.length; o++) d[o] = d[o] * fade;
  }
  return crop(c, ax, ay);
}

function crop(c: Canvas, ax: number, ay: number): Sprite {
  const { width: w, height: h, data } = c;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    let o = y * w * 4 + 3;
    for (let x = 0; x < w; x++, o += 4) {
      if (data[o] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  if (x1 < 0) return { img: new Canvas(1, 1), ax: 0, ay: 0 };
  // a clear pixel all round, and the anchor kept inside (a hop leaves it
  // under the feet)
  x0 = Math.max(0, Math.min(x0 - 1, ax - 1));
  y0 = Math.max(0, Math.min(y0 - 1, ay - 1));
  x1 = Math.min(w - 1, Math.max(x1 + 1, ax));
  y1 = Math.min(h - 1, Math.max(y1 + 1, ay));
  const out = new Canvas(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = y0; y <= y1; y++) out.data.set(data.subarray((y * w + x0) * 4, (y * w + x1 + 1) * 4), (y - y0) * out.width * 4);
  return { img: out, ax: ax - x0, ay: ay - y0 };
}

// ---- figures ----------------------------------------------------------------

const looks = new WeakMap<Traits, Map<string, { look: Look; key: string }>>();

// What it wears as key letters: hat, badge, outfit, aura.
const wearKey = (w?: Wear) => (w ? `${w.hat ? 'h' : ''}${w.badge ? 'b' : ''}${w.outfit ? 'o' : ''}${w.aura ? 'a' : ''}` : '');

function lookFor(tr: Traits, costume: Costume, wear?: Wear): { look: Look; key: string } {
  let m = looks.get(tr);
  if (!m) looks.set(tr, (m = new Map()));
  const wk = wearKey(wear);
  let hit = m.get(`${costume}|${wk}`);
  if (!hit) {
    const key = [tr.species, hexOf(tr.skin), hexOf(tr.hair), tr.hairStyle, hexOf(tr.shirt), hexOf(tr.trim), hexOf(tr.pants), tr.pattern, tr.accessory, hexOf(tr.eye), hexOf(tr.color), costume, wk].join(',');
    hit = { look: lookOf(tr, costume, wear), key };
    m.set(`${costume}|${wk}`, hit);
  }
  return hit;
}

// Room for any pose (x, y in units round the anchor), with a level's hat:
// on a hop for joy, or lying down asleep.
const FIG_BOX = { x0: -14, x1: 12, y0: -24, y1: 5 };
// Poses that keep their own eyes (no blinking or heavy lids over them);
// the eyes a blink shuts (a robot's cast down are a line already, as shut
// ones are), and those heavy lids droop over.
const OWN_EYES = new Set(['done', 'sleep', 'flinch', 'cheer', 'dance', 'pet', 'error', 'wave', 'highfive']);
const BLINKS = new Set<Eyes>(['open', 'up', 'down']);
const ROBOT_BLINKS = new Set<Eyes>(['open', 'up']);
const LIDS = new Set<Eyes>(['open', 'up', 'wide', 'down']);

export function figureSprite(f: FigureFrame, s: number, ink: string): Sprite {
  const q = quant(s);
  const { look, key: lk } = lookFor(f.traits, f.costume, f.wear);
  const pose = f.pose;
  const moving = f.walking && pose !== 'walk' && pose !== 'sit' && pose !== 'sleep' && pose !== 'place' && pose !== 'pet';
  // a carry's own loop is only a breath: on the move the stride is enough
  const i = moving && pose === 'carry' ? 0 : frameOf(pose, f.poseT, f.phase);
  const wi = moving ? frameOf('walk', f.poseT, f.phase) : -1;
  const item = f.item && (pose === 'carry' || pose === 'place') ? hexOf(f.item) : '';
  // a mug of coffee, in the poses that show one
  const mug = !!f.mug && MUG_POSES.has(pose);
  const back = f.facing.back && pose !== 'sleep'; // a sleeper rolls over to face us
  const flip = f.facing.flip;
  // Each of these is in the key only where it changes what is drawn (a key
  // that changes for nothing costs a redraw and a send): a blink where the
  // eyes are open, facing us; how it feels: heavy lids over its eyes (open,
  // or cast down at work) unless they blink, are asleep or are the pose's
  // own, a plaster unless a hat covers it (see plastered), a grin standing
  // about or walking, awake, unless hurt (an error on show wins over it); a
  // hurt look standing about or walking. No face from behind.
  const eyes = eyesAt(pose, i);
  const own = OWN_EYES.has(pose) || f.sleeping;
  const blink = !own && !back && (look.sp === 'robot' ? ROBOT_BLINKS : BLINKS).has(eyes) && blinkAt(f.poseT, f.phase);
  const feel = f.feel;
  const about = !back && (pose === 'idle' || pose === 'walk');
  const hurt = f.hurt && about;
  const drowsy = !!feel?.drowsy && !back && !own && !blink && LIDS.has(eyes);
  const bouncy = !!feel?.bouncy && about && !f.sleeping && !hurt;
  const bandaged = !!feel?.bandaged && plastered(look, back, pose === 'carry');
  const fk = `${drowsy ? 1 : 0}${bandaged ? 1 : 0}${bouncy ? 1 : 0}`;
  const key = `f|${lk}|${pose}|${i}|${wi}|${blink ? 1 : 0}${back ? 1 : 0}${flip ? 1 : 0}${hurt ? 1 : 0}${f.sleeping ? 1 : 0}${mug ? 1 : 0}|${fk}|${item}|${q}|${ink}`;
  return cached(key, () => {
    const rig = rigFor(pose, i, { back, walking: moving, walkU: wi / LOOP.walk[1], item: !!item, mug });
    const face = rig.face;
    if (f.sleeping && pose !== 'sleep') face.eyes = 'closed';
    else if (blink) face.eyes = 'blink';
    if (drowsy) face.eyes = face.eyes === 'down' ? 'droop' : 'drowsy';
    if (bouncy) {
      face.mouth = 'grin';
      face.blush = true;
    }
    if (hurt) {
      face.brows = 'worried';
      face.mouth = 'frown';
    }
    const sk = new Sketch();
    buildFigure(sk, rig, look, { back, item: item || null, frame: i, bandaged });
    return paint(sk, q, ink, flip, FIG_BOX, look.sp === 'ghost' ? 0.86 : 1, look.aura ? auraGlow(rig, look, q) : undefined);
  });
}

// ---- the critter and emotes ---------------------------------------------------

const CRIT_BOX = { x0: -6, x1: 6, y0: -9, y1: 1.5 };

export function critterSprite(c: CritterFrame, t: number, s: number, ink: string): Sprite {
  const q = quant(s);
  const art = critterArt(c, t);
  return cached(`c|${c.kind}|${hexOf(c.body)}|${art.key}|${c.flip ? 1 : 0}|${q}|${ink}`, () => paint(art.draw(), q, ink, c.flip, CRIT_BOX));
}

const EMOTE_BOX = { x0: -4, x1: 4, y0: -7.5, y1: 1 };

export function emoteSprite(kind: Emote, t: number, s: number, ink: string): Sprite {
  const q = quant(s);
  const art = emoteArt(kind, t);
  const sp = cached(`e|${kind}|${art.key}|${q}|${ink}`, () => paint(art.draw(), q, ink, false, EMOTE_BOX));
  return sp;
}

// ---- the locals ---------------------------------------------------------------

// Each local's art a number of its own for the keys (a test may hand in a
// stand-in under a world's id).
const npcIds = new WeakMap<Npc, number>();
let npcSerial = 0;
function npcId(n: Npc): number {
  let k = npcIds.get(n);
  if (k === undefined) npcIds.set(n, (k = ++npcSerial));
  return k;
}

// What shows for a local its world does not have: nothing, one picture
// for all.
let noNpc: Sprite | null = null;

// A local (see world/npcs.ts) as it shows: a frame of an act, facing its
// way, at scale s, cut along its counter's top edge if it stands behind
// one (its height to a hundredth of a unit, the same in the key and the
// picture). The anchor is the point between its feet.
export function npcSprite(world: WorldDef, n: NpcFrame, s: number, ink: string): Sprite {
  const art = world.npcs?.[n.k];
  if (!art) return (noNpc ??= { img: new Canvas(1, 1), ax: 0, ay: 0 });
  const q = quant(s);
  const cut = n.cut ? { h: Math.round(n.cut.h * 100) / 100, slope: n.cut.slope } : null;
  return cached(`n|${npcId(art)}|${n.act}|${n.frame}|${n.facing.back ? 1 : 0}${n.facing.flip ? 1 : 0}|${cut ? `${cut.h}/${cut.slope}` : ''}|${q}|${ink}`, () => {
    const sk = new Sketch();
    buildNpc(sk, art, puppetOf(art, n.act, n.frame), n.facing.back);
    const sp = paint(sk, q, ink, n.facing.flip, NPC_BOX);
    return cut ? cutAt(sp, cut.h * q, cut.slope) : sp;
  });
}

// Sprite sp with all it paints under a counter's top edge cleared (the
// line `h` pixels over the anchor, falling `slope` pixels a pixel to the
// right), cropped again round what is left, the anchor kept.
function cutAt(sp: Sprite, h: number, slope: number): Sprite {
  const { width: w, height: H } = sp.img;
  const c = new Canvas(w, H);
  c.data.set(sp.img.data);
  for (let x = 0; x < w; x++) {
    const from = Math.max(0, Math.ceil(sp.ay - h + slope * (x + 0.5 - sp.ax) - 0.5));
    for (let y = from; y < H; y++) c.data.fill(0, (y * w + x) * 4, (y * w + x) * 4 + 4);
  }
  return crop(c, sp.ax, sp.ay);
}

// ---- desk upgrades -------------------------------------------------------------

// Room round a desk upgrade (x, y in units round its foot).
export const TRINKET_BOX = { x0: -3, x1: 3, y0: -7, y1: 1 };

export function trinketSprite(kind: Trinket, color: RGB, s: number, ink: string): Sprite {
  const q = quant(s);
  const c = hexOf(color);
  return cached(`t|${kind}|${c}|${q}|${ink}`, () => {
    const sk = new Sketch();
    drawTrinket(sk, kind, c);
    return paint(sk, q, ink, false, TRINKET_BOX);
  });
}
