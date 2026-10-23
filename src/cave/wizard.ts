import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import type { Costume, Emote, Pose, Traits } from '../world/character.ts';
import type { EmoteSprite, WizardFn, WizardSprite } from './types.ts';

// Tiny Noita-style figures, dressed for the scene: robed wizards, lab
// coats, party outfits, hoodies, space suits or everyday clothes. The
// figure is about 9 px wide and 13 tall (15 with a lead's tall hat), drawn
// for pixels about 3 wide by 4 tall (sextant cells), standing on the bottom
// row of a wider frame that leaves room for props, raised staffs, a block
// carried overhead and lying down.
//
// Body coordinates: row r = 12 is the feet, the hat brim sits on r = 4,
// the eyes on r = 5, a robe spans r = 7..11 (a shirt r = 7..9 over legs
// r = 10..11). Column c = 0 is the centre; the figure faces right (+c) and
// holds its staff (vial, glow stick, phone, mug, wrench) on that side.
export const WIZARD_W = 25;
export const WIZARD_H = 21;
const AX = 12;
const AY = WIZARD_H - 1;
const FEET = 12;
const OY = AY - FEET;

type Glow = Array<Array<RGB | null>>;
type Layer = { k: string[][]; gl: Glow };
// Two layers: the body (robe, head, feet) and what the hands hold (arms,
// staff, tools, book). Seen from the front the props go over the body,
// from behind under it. (x, y) offsets the part being drawn (lean, bob).
type Pen = { body: Layer; prop: Layer; cur: Layer; x: number; y: number };

const WHITE: RGB = hex('#ffffff');
const INK: RGB = hex('#0c0910');
const RED: RGB = hex('#ff3b3b');
const SPARK: RGB = hex('#ffd27a');
const LAMP: RGB = hex('#fff1b8');
const GHOST_ROBE: RGB = hex('#cfd8ee');
const STONE: RGB = hex('#8e8996'); // a carried block, unless told otherwise
const SCREEN: RGB = hex('#bfe4ff'); // phone and tablet light

const FIXED: Record<string, RGB> = {
  K: hex('#2a2030'), // boots
  W: hex('#a0703e'), // staff wood
  w: hex('#5e3b20'), // dark wood: staff collar, tool handles
  M: hex('#a9b3bf'), // metal: robot hood, tool heads
  Q: hex('#353a46'), // dark iron: visor, antenna
  Y: hex('#f0c419'), // miner helmet
  L: LAMP, // lamp lens
  V: hex('#ff6b9d'), // bow
  X: hex('#17141c'), // glasses frame, goggle strap, shut eyes
  l: hex('#bfeaff'), // glass lens
  U: hex('#ffb347'), // goggle lens
  O: hex('#7a4a2a'), // book cover
  N: hex('#f4ead2'), // pages
  C: hex('#ffd166'), // gold: crown, star, buckle
  Z: hex('#b8323a'), // beret
  J: hex('#4a2f22'), // belt
  D: hex('#0e0b12'), // the dark inside a deep hood, an open mouth
  t: hex('#25262e'), // phone, tablet
  e: hex('#202027'), // headphones
  u: hex('#2c4670'), // visor glass
  g: hex('#dff3ff'), // visor glint
  c: hex('#5a3620'), // coffee
};

// Keys that keep their exact colour (tiny details, glowing bits, wood).
const FLAT = new Set(['E', 'G', 'L', 'l', 'U', 'X', 'V', 'C', 'W', 'w', 'Q', 'D', 'N', 'J', 't', 'e', 'g', 'u', 'n', 'c']);

// ── colour helpers ───────────────────────────────────────────────────────
// Scales a colour up until its brightest channel is full, then lifts it
// toward white: a glowing version of any hue (near-black becomes white).
function brighten(c: RGB, lift = 0.35): RGB {
  const m = Math.max(c[0], c[1], c[2]);
  const full: RGB = m < 24 ? WHITE : scale(c, 255 / m);
  return mix(full, WHITE, lift);
}

const grey = (c: RGB) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) < 40;

function eyeGlow(tr: Traits): RGB {
  if (tr.species === 'robot') return tr.hairStyle % 2 ? hex('#ff4757') : brighten(tr.eye, 0.15);
  if (tr.species === 'ghost') return mix(brighten(tr.eye, 0.1), tr.color, 0.45);
  // Hueless eyes (dark pupils) get a hint of the character's colour.
  return grey(tr.eye) ? mix(brighten(tr.eye), tr.color, 0.25) : brighten(tr.eye);
}

// ── drawing ──────────────────────────────────────────────────────────────
const inFrame = (y: number, x: number) => y >= 0 && y < WIZARD_H && x >= 0 && x < WIZARD_W;

function put(p: Pen, r: number, c: number, key: string): void {
  const y = r + p.y + OY;
  const x = c + p.x + AX;
  if (inFrame(y, x)) p.cur.k[y][x] = key;
}

function row(p: Pen, r: number, c0: number, c1: number, key: string): void {
  for (let c = c0; c <= c1; c++) put(p, r, c, key);
}

function col(p: Pen, c: number, r0: number, r1: number, key: string): void {
  for (let r = r0; r <= r1; r++) put(p, r, c, key);
}

function dots(p: Pen, cells: ReadonlyArray<readonly [number, number]>, key: string): void {
  for (const [r, c] of cells) put(p, r, c, key);
}

function shine(p: Pen, r: number, c: number, color: RGB): void {
  const y = r + p.y + OY;
  const x = c + p.x + AX;
  if (inFrame(y, x)) p.cur.gl[y][x] = color;
}

// Frame [y, x] of body cell (r, c) under the pen's current offset.
function at(p: Pen, r: number, c: number): [number, number] {
  return [r + p.y + OY, c + p.x + AX];
}

// Whether body cell (r, c) is already drawn on either layer.
function solid(p: Pen, r: number, c: number): boolean {
  const [y, x] = at(p, r, c);
  return inFrame(y, x) && (p.body.k[y][x] !== '.' || p.prop.k[y][x] !== '.');
}

// Whether body cell (r, c) is drawn on the body layer.
function bodyAt(p: Pen, r: number, c: number): boolean {
  const [y, x] = at(p, r, c);
  return inFrame(y, x) && p.body.k[y][x] !== '.';
}

// Point a fraction f of the way from (r0, c0) to (r1, c1).
function along(r0: number, c0: number, r1: number, c1: number, f: number): [number, number] {
  return [Math.round(r0 + (r1 - r0) * f), Math.round(c0 + (c1 - c0) * f)];
}

// Straight run of `key` from (r0, c0) to (r1, c1).
function line(p: Pen, r0: number, c0: number, r1: number, c1: number, key: string): void {
  const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  for (let i = 0; i <= n; i++) {
    const [r, c] = along(r0, c0, r1, c1, n === 0 ? 0 : i / n);
    put(p, r, c, key);
  }
}

function onBody(p: Pen, draw: () => void): void {
  const prev = p.cur;
  p.cur = p.body;
  draw();
  p.cur = prev;
}

// Paints `key` over whatever the body layer has in row r: a band round
// the head, whatever its shape.
function across(p: Pen, r: number, key: string, glow?: RGB): void {
  for (let c = -4; c <= 4; c++) {
    if (!bodyAt(p, r, c)) continue;
    put(p, r, c, key);
    if (glow) shine(p, r, c, glow);
  }
}

// Topmost row the body layer has drawn (the top of the head).
function topRow(p: Pen): number {
  for (let r = -8; r <= FEET; r++) for (let c = -4; c <= 4; c++) if (bodyAt(p, r, c)) return r;
  return 2;
}

// ── state for one frame ──────────────────────────────────────────────────
// What a carried light is: the wizard's staff, a vial, a glow stick, a
// glowing headband, a phone or tablet screen, a headphone LED.
type Source = 'staff' | 'vial' | 'stick' | 'band' | 'screen' | 'led';

type Rig = {
  tr: Traits;
  pose: Pose;
  tp: number;
  back: boolean;
  p: Pen;
  eye: RGB;
  cos: Costume;
  item: RGB; // the block carried overhead or set down
  // Frame [y, x] of the staff tip (or held light), of a fallback light
  // worn on the head, and of a miner lamp (for the light).
  tip: [number, number] | null;
  tipKind: Source;
  aux: [number, number] | null;
  auxKind: Source;
  lamp: [number, number] | null;
  flare: number; // 0..1: how hard the staff tip blazes
};

// Hats by hairStyle: 0 classic, 1 tall + beard, 2 round hood, 3 floppy,
// 4 pointed cowl + beard, 5 wide witch hat, 6 pointed hood, 7 bobble cap.
const HOOD_STYLES = new Set([2, 4, 6]);

// Whether the head is wrapped in a hood (no hat brim, no hair showing).
function hooded(tr: Traits): boolean {
  if (tr.accessory === 'hood' || tr.species === 'robot' || tr.species === 'cat') return true;
  return HOOD_STYLES.has(tr.hairStyle) && tr.accessory !== 'lamp' && tr.accessory !== 'beret' && tr.accessory !== 'headset';
}

// A hacker's hoodie is up on even hair styles (and always for a deep hood).
function hoodUp(rg: Rig): boolean {
  return rg.tr.accessory === 'hood' || (rg.cos === 'hacker' && rg.tr.hairStyle % 2 === 0);
}

function palette(tr: Traits, eye: RGB, cos: Costume, item: RGB): Record<string, RGB> {
  const ghost = tr.species === 'ghost';
  const robe = ghost ? GHOST_ROBE : tr.shirt;
  let skin = tr.skin;
  if (tr.species === 'alien') skin = mix(skin, hex('#5fd35f'), 0.5);
  if (ghost) skin = hex('#e6ecfa');
  const hat = ghost ? mix(tr.trim, GHOST_ROBE, 0.3) : scale(tr.shirt, 0.6);
  const base: Record<string, RGB> = {
    ...FIXED,
    R: robe,
    r: scale(robe, ghost ? 0.86 : 0.74), // sleeves
    T: ghost ? mix(tr.trim, GHOST_ROBE, 0.5) : tr.trim,
    H: hat,
    h: tr.trim, // hat band, pompom
    F: ghost ? mix(skin, hex('#262c48'), 0.74) : scale(skin, tr.species === 'alien' ? 0.66 : 0.42), // face in the brim's shadow
    f: scale(skin, ghost ? 0.88 : 0.6), // chin
    A: tr.species === 'robot' ? FIXED.M : skin, // hands
    B: tr.hair,
    G: tr.color,
    E: scale(eye, 0.75),
    S: robe, // ghost sheet
    s: mix(scale(robe, 0.7), hex('#7f9cff'), 0.2), // ghost hem, see-through
    I: item,
    a: scale(skin, ghost ? 0.94 : 0.86), // a face no brim shades
    y: scale(skin, ghost ? 0.8 : 0.58), // its eye row, in the shade of the brow
    d: mix(tr.hair, skin, 0.6), // shaved sides of a mohawk
    n: brighten(tr.color, 0.2), // neon: glow sticks, a glowing headband
    m: hex('#e9e4da'), // mug
  };
  if (cos === 'wizard') return { ...base, m: FIXED.W };
  // Ghosts wear their clothes pale and see-through.
  const g = (c: RGB): RGB => (ghost ? mix(c, GHOST_ROBE, 0.55) : c);
  const pants = g(tr.pants);
  const clothes: Record<string, RGB> = { ...base, P: pants, p: scale(pants, 0.62), f: scale(skin, ghost ? 0.88 : 0.72) };
  switch (cos) {
    case 'scientist': {
      // A white coat washed with the character's colour, and a collar of
      // it, so the figure keeps its colour (and its shape) on a white floor.
      const coat = g(mix(WHITE, tr.color, 0.35));
      return {
        ...clothes,
        R: coat,
        r: scale(coat, 0.88),
        i: g(tr.shirt), // the shirt in the coat's open front
        o: scale(coat, 0.8), // pocket, belt, vent
        j: g(tr.color), // collar
        K: hex('#2e2a36'),
        m: hex('#d4edf5'), // a beaker of coffee
      };
    }
    case 'raver': {
      const top = g(brighten(tr.shirt, 0.08));
      return {
        ...clothes,
        R: top,
        r: scale(skin, ghost ? 0.9 : 0.8), // bare arms
        T: g(tr.trim),
        P: g(hex('#3a3050')), // dark leggings
        p: g(hex('#221c2e')),
        K: hex('#f1f0f4'), // chunky white sneakers
        m: mix(tr.trim, WHITE, 0.2),
      };
    }
    case 'hacker': {
      const hoodie = g(mix(tr.shirt, hex('#17171e'), 0.5));
      const dark = g(mix(tr.pants, hex('#111116'), 0.55));
      return {
        ...clothes,
        R: hoodie,
        r: scale(hoodie, 0.86),
        H: scale(hoodie, 0.92),
        o: scale(hoodie, 0.7), // kangaroo pocket
        T: hex('#d9d9de'), // drawstrings
        P: dark,
        p: scale(dark, 0.62),
        K: hex('#e3e3e8'),
        m: tr.color, // a can of something fizzy
      };
    }
    case 'astronaut': {
      const suit = g(hex('#e2e6ed'));
      return {
        ...clothes,
        R: suit,
        r: g(hex('#cbd2dc')),
        H: g(hex('#f0f2f6')), // helmet
        P: g(hex('#d7dce4')),
        p: g(hex('#a3acb9')),
        K: hex('#6f7a8a'),
        A: g(mix(tr.trim, hex('#c3cad5'), 0.35)), // gloves
        // The pack and a band across the chest wear the character's colour:
        // a white suit alone vanishes on a white deck.
        b: g(tr.color), // life-support pack
        j: g(tr.color), // chest band
        v: mix(tr.species === 'robot' ? FIXED.M : skin, hex('#2d4f80'), 0.45), // the face behind the visor
        m: hex('#c5ccd6'), // a drink pouch
      };
    }
    default: // casual
      return {
        ...clothes,
        R: g(tr.shirt),
        r: g(scale(tr.shirt, 0.84)),
        K: hex('#ece9e2'),
        m: g(mix(tr.trim, WHITE, 0.3)),
      };
  }
}

// ── head ─────────────────────────────────────────────────────────────────
// Eyes: 'open', 'shut' (blink) or 'down' (reading).
type Look = 'open' | 'shut' | 'down';

function eyes(rg: Rig, look: Look): void {
  const { p, tr } = rg;
  if (rg.back || look === 'shut') return;
  const r = look === 'down' ? 6 : 5;
  const glasses = tr.accessory === 'glasses';
  const big = tr.species === 'alien';
  for (const c of [0, 2]) {
    put(p, r, c, glasses ? 'l' : 'E');
    shine(p, r, c, glasses ? mix(rg.eye, FIXED.l, 0.35) : rg.eye);
    if (big && r === 5) {
      put(p, 6, c, 'E');
      shine(p, 6, c, scale(rg.eye, 0.8));
    }
  }
  if (glasses) {
    put(p, r, 1, 'X');
    put(p, r, -1, 'X');
  }
}

function face(rg: Rig, hood: boolean): void {
  const { p, back } = rg;
  if (back) {
    // Back of the head: hair under a hat, the hood itself otherwise.
    const k = hood ? 'H' : 'B';
    row(p, 5, -2, 2, k);
    row(p, 6, -2, 2, k);
    return;
  }
  const lo = hood ? -2 : -1;
  row(p, 5, lo, 2, 'F');
  row(p, 6, lo, 2, 'f');
  if (!hood) {
    put(p, 5, -2, 'B'); // hair behind the face
    put(p, 6, -2, 'B');
  }
}

function beard(rg: Rig): void {
  if (rg.back) return;
  row(rg.p, 6, -1, 2, 'B');
  row(rg.p, 7, 0, 1, 'B');
}

function hat(rg: Rig, style: number): void {
  const { p } = rg;
  switch (style) {
    case 1: // tall straight cone
      col(p, 0, -1, 0, 'H');
      row(p, 1, -1, 0, 'H');
      row(p, 2, -1, 1, 'H');
      row(p, 3, -2, 2, 'h');
      row(p, 4, -4, 3, 'H');
      break;
    case 3: // floppy: the tip flops over the back
      row(p, 0, -2, 0, 'H');
      put(p, 1, -3, 'H');
      row(p, 1, -1, 1, 'H');
      put(p, 2, -4, 'H');
      row(p, 2, -2, 1, 'H');
      row(p, 3, -2, 2, 'H');
      row(p, 4, -4, 3, 'H');
      break;
    case 5: // wide-brimmed witch hat
      put(p, 1, -2, 'H');
      row(p, 2, -2, 0, 'H');
      row(p, 3, -2, 1, 'h');
      row(p, 4, -5, 4, 'H');
      break;
    case 7: // bobble cap with a pompom
      put(p, 1, 0, 'h');
      row(p, 2, -1, 1, 'H');
      row(p, 3, -2, 2, 'H');
      row(p, 4, -3, 3, 'h');
      break;
    default: // classic: the tip bends back
      put(p, 0, -3, 'H');
      row(p, 1, -2, -1, 'H');
      row(p, 2, -1, 1, 'H');
      row(p, 3, -2, 2, 'h');
      row(p, 4, -4, 3, 'H');
  }
}

// Hood around the face; `peak`: a point on top (true) or flopped back.
function hood(rg: Rig, peak: boolean | 'back'): void {
  const { p } = rg;
  if (peak === 'back') {
    put(p, 0, -3, 'H');
    row(p, 1, -2, -1, 'H');
  } else if (peak) {
    put(p, 1, 0, 'H');
  }
  row(p, 2, -1, 1, 'H');
  row(p, 3, -2, 2, 'H');
  row(p, 4, -3, 3, 'H');
  for (const r of [5, 6]) {
    put(p, r, -3, 'H');
    put(p, r, 3, 'H');
  }
  row(p, 7, -3, -2, 'H'); // drape over the shoulders
}

function robotHead(rg: Rig): void {
  const { p, back } = rg;
  row(p, 2, -1, 1, 'M');
  row(p, 3, -2, 2, 'M');
  for (let r = 4; r <= 6; r++) row(p, r, -3, 3, 'M');
  // Antenna with a blinking light.
  col(p, -1, 0, 1, 'Q');
  if (Math.floor(rg.tp * 1.5) % 2 === 0) shine(p, 0, -1, hex('#ff5a5a'));
  if (back) return;
  row(p, 5, -2, 3, 'Q'); // visor
  put(p, 6, 1, 'Q'); // grille
}

// Cat ears on a hood (`key` 'H') or on a furry head ('B', no drape).
function catHead(rg: Rig, key = 'H', drape = true): void {
  const { p } = rg;
  // Ears.
  put(p, 1, -3, key);
  put(p, 1, 2, key);
  row(p, 2, -3, 2, key);
  row(p, 3, -3, 3, key);
  row(p, 4, -3, 3, key);
  for (const r of [5, 6]) {
    put(p, r, -3, key);
    put(p, r, 3, key);
  }
  if (drape) row(p, 7, -3, -2, key);
  if (!rg.back) put(p, 2, -2, 'V'); // inner ear
}

function head(rg: Rig, look: Look): void {
  onBody(rg.p, () => (rg.cos === 'wizard' ? headParts(rg, look) : bareHead(rg, look)));
}

function headParts(rg: Rig, look: Look): void {
  const { tr, p } = rg;
  const style = tr.hairStyle;
  const acc = tr.accessory;
  const lead = acc === 'headset';
  if (acc === 'hood') {
    // Deep hood and mantle: nothing but the eyes shows inside.
    hood(rg, 'back');
    row(p, 5, -2, 2, rg.back ? 'H' : 'D');
    row(p, 6, -2, 2, rg.back ? 'H' : 'D');
    row(p, 7, -3, 3, 'H');
    dots(p, [[8, -3], [8, 3]], 'H');
    if (!rg.back) put(p, 7, 0, 'C');
    eyes(rg, look);
    return;
  }
  if (tr.species === 'robot' || tr.species === 'cat') {
    if (tr.species === 'robot') robotHead(rg);
    else {
      face(rg, true);
      catHead(rg);
    }
    if (lead) crown(rg);
    accessory(rg);
    eyes(rg, look);
    return;
  }
  const isHood = hooded(tr);
  face(rg, isHood);
  if (lead) tallHat(rg);
  else if (acc === 'lamp') helmet(rg);
  else if (acc === 'beret') beret(rg);
  else if (isHood) hood(rg, style === 2 ? false : style === 4 ? true : 'back');
  else hat(rg, style);
  if ((style === 1 || style === 4) && tr.species !== 'ghost') beard(rg);
  if (style === 5 && !isHood && !lead) col(p, -3, 5, 7, 'B'); // long hair
  accessory(rg);
  eyes(rg, look);
}

// The lead's hat: taller, gold band, a twinkling star (pure glow) on the tip.
function tallHat(rg: Rig): void {
  const { p } = rg;
  put(p, -1, 0, 'H');
  row(p, 0, -1, 0, 'H');
  row(p, 1, -1, 0, 'H');
  row(p, 2, -1, 1, 'H');
  row(p, 3, -2, 2, 'C');
  row(p, 4, -4, 3, 'H');
  star(rg, -2, 0);
}

function star(rg: Rig, r: number, c: number): void {
  const { p } = rg;
  const gold = brighten(FIXED.C, 0.3);
  shine(p, r, c, gold);
  if (Math.floor(rg.tp * 2.2) % 3 === 0) {
    const dim = scale(gold, 0.55);
    shine(p, r, c - 1, dim);
    shine(p, r, c + 1, dim);
    shine(p, r - 1, c, dim);
  }
}

// Hood-wearing leads (and, without hats, every lead) get a little crown;
// `top` is its upper row.
function crown(rg: Rig, top = 0): void {
  const { p } = rg;
  for (const c of [-2, 0, 2]) put(p, top, c, 'C');
  row(p, top + 1, -2, 2, 'C');
  put(p, top + 1, 0, 'G');
  shine(p, top + 1, 0, brighten(rg.tr.color, 0.2));
  star(rg, top, 0);
}

function helmet(rg: Rig): void {
  const { p } = rg;
  row(p, 2, -1, 1, 'Y');
  row(p, 3, -2, 2, 'Y');
  row(p, 4, -3, 3, 'Y');
  lampLens(rg);
}

function lampLens(rg: Rig): void {
  const { p } = rg;
  rg.lamp = at(p, 3, 4);
  if (rg.back) return;
  put(p, 3, 2, 'L');
  put(p, 3, 3, 'Q');
  shine(p, 3, 2, LAMP);
  shine(p, 3, 3, scale(LAMP, 0.75));
}

function beret(rg: Rig): void {
  const { p } = rg;
  put(p, 2, 0, 'Z');
  row(p, 3, -3, 2, 'Z');
  row(p, 4, -4, 2, 'Z');
  put(p, 5, -4, 'Z');
}

// Small additions that sit on whatever head is there.
function accessory(rg: Rig): void {
  const { p, tr, back } = rg;
  const furry = tr.species === 'robot' || tr.species === 'cat';
  switch (tr.accessory) {
    case 'goggles':
      row(p, 4, -3, 3, 'X');
      if (!back) {
        row(p, 4, 0, 1, 'U');
        put(p, 4, 3, 'U');
      }
      break;
    case 'bow':
      dots(p, [[3, 2], [3, 4], [2, 2], [2, 4]], 'V');
      put(p, 3, 3, 'Z');
      break;
    case 'lamp':
      if (furry) lampLens(rg);
      break;
    case 'beret':
      if (furry) {
        row(p, 1, -2, 1, 'Z');
        row(p, 2, -3, 2, 'Z');
      }
      break;
    default:
  }
}

// ── heads without a wizard hat ───────────────────────────────────────────
// Hair (or a hoodie, helmet, sheet...) over a face lit from the front.
function bareHead(rg: Rig, look: Look): void {
  const { tr, p, back } = rg;
  if (rg.cos === 'astronaut') {
    spaceHelmet(rg, look);
    return;
  }
  const up = hoodUp(rg);
  if (tr.accessory === 'hood') {
    // A deep hood: only the eyes show.
    hood(rg, false);
    row(p, 5, -2, 2, back ? 'H' : 'D');
    row(p, 6, -2, 2, back ? 'H' : 'D');
  } else if (tr.species === 'robot') {
    robotHead(rg);
  } else if (tr.species === 'cat') {
    bareFace(rg, -2);
    catHead(rg, up ? 'H' : 'B', up);
  } else if (up) {
    face(rg, true);
    hood(rg, false);
  } else if (tr.species === 'alien') {
    alienHead(rg);
  } else if (tr.species === 'ghost') {
    sheetHead(rg);
  } else {
    bareFace(rg, -1);
    hair(rg, tr.hairStyle);
    if (tr.hairStyle === 1) beard(rg);
  }
  gear(rg, up);
  if (tr.accessory === 'headset') crown(rg, topRow(p) - 2);
  bareAccessory(rg, up);
  eyes(rg, look);
}

// Face rows 5..6 from column `lo`, hair behind it (the hair from behind).
function bareFace(rg: Rig, lo: number): void {
  const { p, back } = rg;
  if (back) {
    row(p, 5, -2, 2, 'B');
    row(p, 6, -2, 2, 'B');
    return;
  }
  row(p, 5, lo, 2, 'y');
  row(p, 6, lo, 2, 'a');
  for (let c = -2; c < lo; c++) {
    put(p, 5, c, 'B');
    put(p, 6, c, 'B');
  }
}

// Hair by hairStyle: 0 short, 1 short + beard, 2 long, 3 spiky, 4 top
// knot, 5 big curls, 6 mohawk, 7 beanie. Front pixels at the brow are skin.
function hair(rg: Rig, style: number): void {
  const { p, back } = rg;
  const brow = back ? 'B' : 'a';
  const crop = () => {
    row(p, 2, -1, 1, 'B');
    row(p, 3, -2, 2, 'B');
    row(p, 4, -2, 0, 'B');
    row(p, 4, 1, 2, brow);
  };
  switch (style) {
    case 2: // long, down the back
      crop();
      put(p, 3, -3, 'B');
      col(p, -3, 4, 7, 'B');
      put(p, 7, -2, 'B');
      if (back) row(p, 7, -2, 2, 'B');
      break;
    case 3: // spiky
      dots(p, [[1, -2], [1, 0], [1, 2]], 'B');
      row(p, 2, -2, 2, 'B');
      row(p, 3, -2, 2, 'B');
      row(p, 4, -2, 1, 'B');
      put(p, 4, 2, brow);
      break;
    case 4: // top knot
      crop();
      row(p, 0, -2, -1, 'B');
      row(p, 1, -2, -1, 'B');
      break;
    case 5: // big curls
      row(p, 1, -2, 1, 'B');
      row(p, 2, -3, 2, 'B');
      row(p, 3, -3, 3, 'B');
      row(p, 4, -3, 0, 'B');
      row(p, 4, 1, 2, brow);
      put(p, 4, 3, 'B');
      col(p, -3, 5, 6, 'B');
      break;
    case 6: // mohawk over shaved sides
      row(p, 2, -2, 1, 'd');
      row(p, 3, -2, 2, 'd');
      row(p, 4, -2, 0, 'd');
      row(p, 4, 1, 2, brow);
      for (let r = 0; r <= 3; r++) row(p, r, -1, 0, 'B');
      break;
    case 7: // beanie
      row(p, 2, -1, 1, 'H');
      row(p, 3, -2, 2, 'H');
      row(p, 4, -2, 2, 'h');
      break;
    default:
      crop();
  }
}

// Green dome with two glowing feelers.
function alienHead(rg: Rig): void {
  const { p, back } = rg;
  row(p, 2, -1, 1, 'a');
  row(p, 3, -2, 2, 'a');
  row(p, 4, -2, 2, 'a');
  row(p, 5, -2, 2, back ? 'a' : 'y');
  row(p, 6, -2, 2, 'a');
  dots(p, [[1, -2], [1, 2]], 'f');
  const tip = scale(brighten(rg.tr.color, 0.2), 0.8);
  for (const c of [-3, 3]) {
    put(p, 0, c, 'G');
    shine(p, 0, c, tip);
  }
}

// A sheet ghost: a pale dome with a dark slot for the eyes.
function sheetHead(rg: Rig): void {
  const { p, back } = rg;
  row(p, 2, -1, 1, 'S');
  row(p, 3, -2, 2, 'S');
  row(p, 4, -2, 2, 'S');
  row(p, 5, -2, 2, 'S');
  if (!back) row(p, 5, -1, 2, 'F');
  row(p, 6, -2, 2, 'S');
}

// What the costume wears on the head: safety goggles pushed up, a glowing
// headband, headphones.
function gear(rg: Rig, up: boolean): void {
  const { p, tr, back } = rg;
  switch (rg.cos) {
    case 'scientist':
      if (tr.accessory === 'goggles' || tr.accessory === 'lamp' || tr.accessory === 'hood') return;
      across(p, 3, 'X');
      if (!back) dots(p, [[3, 0], [3, 2]], 'l');
      return;
    case 'raver': {
      if (tr.accessory === 'lamp') return;
      const r = up ? 4 : 3;
      across(p, r, 'n', brighten(tr.color, 0.25));
      rg.aux = at(p, r, 1);
      rg.auxKind = 'band';
      return;
    }
    case 'hacker': {
      const side = up || tr.species === 'cat' || tr.species === 'robot' ? -3 : -2;
      row(p, 2, -1, 0, 'e');
      put(p, 3, side + 1, 'e');
      col(p, side, 4, 5, 'e');
      shine(p, 5, side, scale(brighten(tr.color, 0.2), 0.85));
      rg.aux = at(p, 5, side);
      rg.auxKind = 'led';
      return;
    }
    default:
  }
}

function bareAccessory(rg: Rig, up: boolean): void {
  const { p, tr } = rg;
  const furry = tr.species === 'robot' || tr.species === 'cat';
  switch (tr.accessory) {
    case 'lamp':
      across(p, 3, 'X');
      lampLens(rg);
      break;
    case 'beret':
      if (up) break;
      if (furry) {
        row(p, 1, -2, 1, 'Z');
        row(p, 2, -3, 2, 'Z');
      } else {
        beret(rg);
      }
      break;
    default:
      accessory(rg);
  }
}

// A round space helmet; the face shows through the visor (dark glass for
// a deep hood) and a lamp sits on its brow.
function spaceHelmet(rg: Rig, look: Look): void {
  const { p, tr, back } = rg;
  if (tr.species === 'cat') dots(p, [[0, -2], [0, 2], [1, -2], [1, 2]], 'H');
  row(p, 1, -1, 1, 'H');
  row(p, 2, -2, 2, 'H');
  for (let r = 3; r <= 6; r++) row(p, r, -3, 3, 'H');
  row(p, 7, -2, 2, 'T'); // collar ring
  if (!back) {
    const glass = tr.accessory === 'hood' ? 'u' : 'v';
    row(p, 4, -1, 2, 'u');
    row(p, 5, -1, 2, glass);
    row(p, 6, -1, 2, glass);
    if (tr.species === 'robot' && glass === 'v') row(p, 5, -1, 2, 'Q');
    put(p, 4, 2, 'g');
  }
  lampLens(rg);
  if (tr.accessory === 'headset') crown(rg, topRow(p) - 2);
  if (tr.accessory === 'bow') accessory(rg);
  eyes(rg, look);
}

// ── body ─────────────────────────────────────────────────────────────────
function robe(rg: Rig): void {
  onBody(rg.p, () => (rg.tr.species === 'ghost' ? ghostRobe(rg) : clothRobe(rg)));
}

function clothRobe(rg: Rig): void {
  const { p, tr, back } = rg;
  row(p, 7, -2, 2, 'R');
  for (let r = 8; r <= 10; r++) row(p, r, -3, 3, 'R');
  row(p, 11, -4, 3, 'T'); // hem, flaring out behind
  if (!back && tr.accessory !== 'hood') put(p, 7, 0, 'T'); // collar
  switch (tr.pattern) {
    case '▓': // stripe
      row(p, 9, -3, 3, 'T');
      break;
    case '▒': // stars
      if (!back) dots(p, [[8, -1], [10, 1]], 'T');
      break;
    case '▼': // V collar
      if (!back) dots(p, [[7, -1], [7, 1], [8, 0]], 'T');
      break;
    case '◆': // star emblem
      if (!back) dots(p, [[8, 0], [9, -1], [9, 1], [10, 0]], 'T');
      break;
    case '║': // open front
      if (!back) col(p, 0, 7, 10, 'T');
      break;
    case '╋': // belt and buckle
      row(p, 9, -3, 3, 'J');
      if (!back) put(p, 9, 0, 'C');
      break;
    case '♥': // sash
      line(p, 7, -2, 10, 1, 'T');
      break;
    default:
  }
}

// Pale robe that fades out at a wavy hem instead of feet.
function ghostRobe(rg: Rig): void {
  const { p, tp } = rg;
  row(p, 7, -2, 2, 'S');
  for (let r = 8; r <= 10; r++) row(p, r, -3, 3, 'S');
  // A dither that thickens toward the hem reads as see-through.
  const f = Math.floor(tp * (rg.pose === 'walk' ? 6 : 2.5)) % 2;
  for (let c = -3; c <= 3; c++) if ((c + f) % 2 === 0) put(p, 10, c, 's');
  for (let c = -4; c <= 3; c++) {
    if (aloft(p, 11)) put(p, 11, c, (c + f) % 2 ? 's' : 'S');
    if ((c + f) % 2 === 0 && aloft(p, 12)) put(p, 12, c, 's');
  }
  put(p, 7, 0, 'T');
}

// Feet: [column, row] of the left end of each 2-px foot.
function feet(rg: Rig, at: ReadonlyArray<readonly [number, number]>): void {
  if (rg.tr.species === 'ghost') return;
  onBody(rg.p, () => {
    for (const [c, r] of at) row(rg.p, r, c, c + 1, 'K');
  });
}

const STAND: ReadonlyArray<readonly [number, number]> = [[-2, 12], [1, 12]];

// How the legs stand. `LIFT` moves the upper body (torso, head, arms):
// up on a passing step or tiptoe, down on a bob, sitting or crouching.
type Stance = 'stand' | 'step0' | 'step1' | 'step2' | 'step3' | 'wide' | 'sway' | 'tiptoe' | 'bob' | 'sit' | 'crouch';
const STEPS: Stance[] = ['step0', 'step1', 'step2', 'step3'];
const LIFT: Record<Stance, number> = { stand: 0, step0: 0, step1: -1, step2: 0, step3: -1, wide: 0, sway: 0, tiptoe: -1, bob: 1, sit: 3, crouch: 2 };

// Ghosts only half sit or crouch: they keep floating clear of the floor.
const lift = (rg: Rig, st: Stance) => (rg.tr.species === 'ghost' ? Math.min(LIFT[st], 1) : LIFT[st]);
// Whether row r (under the pen) clears the floor by a pixel, rim and all.
const aloft = (p: Pen, r: number) => r + p.y <= FEET - 2;

// Legs under clothes, rows 9..12 x columns -4..6: P the near leg, p the far
// one, K shoes.
const LEGS: Record<Stance, readonly string[]> = {
  stand: ['...........', '..PPPPP....', '..pp.PP....', '..KK.KK....'],
  step0: ['...........', '..PPPPP....', '.pp...PP...', '.KK...KK...'],
  step1: ['..PPPPP....', '...PPpp....', '...PPKK....', '...KK......'],
  step2: ['...........', '..PPPPP....', '.PP...pp...', '.KK...KK...'],
  step3: ['..PPPPP....', '..ppPP.....', '..KKPP.....', '....KK.....'],
  wide: ['...........', '..PPPPP....', '.pp..PP....', '.KK..KK....'],
  sway: ['...........', '..PPPPP....', '..pp..PP...', '..KK..KK...'],
  tiptoe: ['..PPPPP....', '..pp.PP....', '..pp.PP....', '...K..K....'],
  bob: ['...........', '..PPPPP....', '..pp.PP....', '..KK.KK....'],
  sit: ['...........', '...........', '.......PP.K', '......PPPPK'],
  crouch: ['...........', '......PP...', '.....PPP...', '..KK..KK...'],
};

function paint(p: Pen, map: readonly string[], keys: string): void {
  map.forEach((ln, i) => {
    for (let j = 0; j < ln.length; j++) if (keys.includes(ln[j])) put(p, 9 + i, j - 4, ln[j]);
  });
}

// Everything below the neck for a stance. Leaves the pen where it was;
// the caller lifts it by LIFT[st] for the head and arms.
function dress(rg: Rig, st: Stance): void {
  if (rg.cos === 'wizard') {
    robed(rg, st);
    return;
  }
  const { p, tr } = rg;
  const base = p.y;
  const ghost = tr.species === 'ghost';
  onBody(p, () => {
    if (!ghost) paint(p, LEGS[st], 'Pp');
    p.y = base + lift(rg, st);
    torso(rg);
    if (ghost) tail(rg);
    p.y = base;
    if (!ghost) paint(p, LEGS[st], 'K');
  });
}

// The robe for each stance; standing and walking exactly as they always were.
function robed(rg: Rig, st: Stance): void {
  const { p, tr } = rg;
  const base = p.y;
  const ghost = tr.species === 'ghost';
  const hem = (c0: number, c1: number) => {
    if (!ghost) onBody(p, () => row(p, FEET, c0, c1, 'T'));
  };
  switch (st) {
    case 'step0':
    case 'step1':
    case 'step2':
    case 'step3': {
      const f = STEPS.indexOf(st);
      const passing = f % 2 === 1;
      if (passing) {
        // Body up a pixel over the planted foot; the other foot swings through.
        feet(rg, f === 1 ? [[-1, 12], [1, 11]] : [[0, 12], [-2, 11]]);
        if (!ghost) onBody(p, () => put(p, 11, f === 1 ? -1 : 1, 'K'));
        p.y = base - 1;
      } else {
        feet(rg, [[-3, 12], [2, 12]]);
      }
      robe(rg);
      if (!ghost && !passing) {
        onBody(p, () => {
          // The hem swings with the stride and parts between the legs.
          put(p, 11, f === 0 ? -5 : 4, 'T');
          row(p, 11, -1, 0, '.');
        });
      }
      break;
    }
    case 'wide':
      robe(rg);
      feet(rg, [[-3, 12], [1, 12]]);
      break;
    case 'sway':
      robe(rg);
      feet(rg, [[-2, 12], [2, 12]]);
      break;
    case 'tiptoe':
      p.y = base - 1;
      robe(rg);
      p.y = base;
      feet(rg, [[-2, 11], [1, 11]]);
      if (!ghost) onBody(p, () => dots(p, [[12, -1], [12, 2]], 'K'));
      break;
    case 'bob':
      p.y = base + lift(rg, st);
      robe(rg);
      p.y = base;
      hem(-4, 3);
      feet(rg, STAND);
      break;
    case 'sit':
      // Robe pooled on the floor, feet poking out in front.
      p.y = base + lift(rg, st);
      robe(rg);
      p.y = base;
      hem(-4, 3);
      feet(rg, [[4, 12]]);
      if (!ghost) onBody(p, () => put(p, 11, 5, 'K'));
      break;
    case 'crouch':
      p.y = base + lift(rg, st);
      robe(rg);
      p.y = base;
      hem(-4, 3);
      feet(rg, [[3, 12]]);
      break;
    default:
      robe(rg);
      feet(rg, STAND);
  }
  p.y = base;
}

// Clothes from the neck down to the waist (a lab coat to the knee).
function torso(rg: Rig): void {
  const { p, back } = rg;
  switch (rg.cos) {
    case 'scientist':
      for (let r = 7; r <= 10; r++) row(p, r, -2, 2, 'R');
      put(p, 10, -3, 'R'); // the coat flares behind
      if (back) {
        row(p, 7, 0, 1, 'j'); // collar
        row(p, 9, -1, 1, 'o'); // half belt
        put(p, 10, 0, 'o'); // vent
        break;
      }
      col(p, 1, 7, 9, 'i'); // shirt in the open front
      put(p, 7, 0, 'i');
      dots(p, [[7, -1], [7, 2]], 'j'); // collar either side of it
      put(p, 8, 1, 'T'); // tie
      put(p, 8, -1, 'o'); // breast pocket
      break;
    case 'raver':
      for (let r = 7; r <= 9; r++) row(p, r, -2, 2, 'R');
      if (!back) put(p, 7, 0, 'a'); // scoop neck
      print(rg);
      row(p, 10, -2, 2, 'T'); // shorts
      break;
    case 'hacker':
      for (let r = 7; r <= 9; r++) row(p, r, -2, 2, 'R');
      if (back) {
        if (!hoodUp(rg)) row(p, 7, -1, 1, 'H'); // the hood hanging down the back
        break;
      }
      if (!hoodUp(rg)) col(p, -3, 6, 7, 'H'); // hood bunched behind the neck
      dots(p, [[8, 0], [8, 2]], 'T'); // drawstrings
      row(p, 9, -1, 1, 'o'); // kangaroo pocket
      break;
    case 'astronaut':
      for (let r = 7; r <= 9; r++) row(p, r, -2, 2, 'R');
      if (back) {
        // Life-support pack over the back.
        for (let r = 7; r <= 9; r++) row(p, r, -2, 2, 'b');
        dots(p, [[8, -1], [8, 1]], 'Q');
        break;
      }
      col(p, -4, 6, 9, 'b');
      col(p, -3, 6, 7, 'b');
      dots(p, [[8, -2], [8, 2]], 'T'); // shoulder patches
      row(p, 8, -1, 1, 'j'); // chest band, its status light blinking
      if (Math.floor(rg.tp * 1.3) % 2 === 0) shine(p, 8, 1, brighten(rg.tr.color, 0.1));
      row(p, 9, -2, 2, 'T'); // belt
      break;
    default: // casual
      for (let r = 7; r <= 9; r++) row(p, r, -2, 2, 'R');
      if (!back) put(p, 7, 0, 'a'); // crew neck
      print(rg);
  }
}

// The pattern as a print on the shirt.
function print(rg: Rig): void {
  const { p, tr, back } = rg;
  if (tr.pattern === '▓') row(p, 8, -2, 2, 'T'); // stripes go all the way round
  if (back) return;
  switch (tr.pattern) {
    case '▒':
      dots(p, [[8, -1], [9, 1]], 'T');
      break;
    case '▼':
      dots(p, [[8, -1], [8, 1], [9, 0]], 'T');
      break;
    case '◆':
      dots(p, [[8, 0], [9, -1], [9, 1]], 'T');
      break;
    case '║':
      col(p, 0, 8, 9, 'T');
      break;
    case '╋':
      row(p, 8, -2, 2, 'T');
      put(p, 9, 0, 'T');
      break;
    case '♥':
      dots(p, [[8, -1], [8, 1], [9, 0]], 'T');
      break;
    default:
  }
}

// A ghost's see-through tail below its clothes, under the current pen.
function tail(rg: Rig): void {
  const { p, tp } = rg;
  const top = rg.cos === 'scientist' ? 11 : 10;
  const f = Math.floor(tp * (rg.pose === 'walk' || rg.pose === 'carry' ? 6 : 2.5)) % 2;
  for (let c = -2; c <= 2; c++) if (aloft(p, top)) put(p, top, c, (c + f) % 2 === 0 ? 's' : 'S');
  for (let c = -3; c <= 2; c++) {
    if (aloft(p, top + 1)) put(p, top + 1, c, (c + f) % 2 ? 's' : 'S');
    if ((c + f) % 2 === 0 && aloft(p, top + 2)) put(p, top + 2, c, 's');
  }
}

// ── arms and props ───────────────────────────────────────────────────────
function hand(rg: Rig, r: number, c: number): void {
  put(rg.p, r, c, rg.tr.species === 'ghost' ? 'r' : 'A');
}

function sleeve(rg: Rig, cells: ReadonlyArray<readonly [number, number]>): void {
  dots(rg.p, cells, 'r');
}

// Back arm hanging at the side; `swing` raises it a little.
function backArmDown(rg: Rig, swing = 0): void {
  sleeve(rg, [[8, -3], [9, -3]]);
  hand(rg, 10 - swing, -3 - (swing > 0 ? 1 : 0));
}

// Staff from its foot (r0, c0) to its tip (r1, c1), where the gem glows.
function staff(rg: Rig, r0: number, c0: number, r1: number, c1: number): void {
  const { p } = rg;
  line(p, r0, c0, r1, c1, 'W');
  const n = Math.max(Math.abs(r1 - r0), Math.abs(c1 - c0));
  if (n > 0) {
    const [r, c] = along(r0, c0, r1, c1, (n - 1) / n);
    put(p, r, c, 'w');
  }
  put(p, r1, c1, 'G');
  shine(p, r1, c1, brighten(rg.tr.color, 0.25 + 0.3 * rg.flare));
  const twinkle = Math.floor(rg.tp * 3.1) % 5 === 0;
  if (rg.flare > 0 || twinkle) {
    const halo = scale(mix(rg.tr.color, WHITE, 0.2), rg.flare > 0.5 ? 0.8 : 0.5);
    for (const [dr, dc] of [[-1, 0], [0, -1], [0, 1], [1, 0]] as const) {
      if (!solid(p, r1 + dr, c1 + dc)) shine(p, r1 + dr, c1 + dc, halo);
    }
    if (rg.flare > 0.5) {
      for (const [dr, dc] of [[-2, 0], [0, 2], [0, -2], [2, 0]] as const) {
        if (!solid(p, r1 + dr, c1 + dc)) shine(p, r1 + dr, c1 + dc, scale(halo, 0.6));
      }
    }
  }
  rg.tip = at(p, r1, c1);
  rg.tipKind = 'staff';
}

// Staff standing beside the wizard (behind it), for poses that need both
// hands. A ghost's staff floats along with it.
function plantedStaff(rg: Rig): void {
  staff(rg, 12, -5, 3, -5);
}

// What each costume holds where the wizard holds its staff.
type Held = 'vial' | 'stick' | 'phone' | 'mug' | 'wrench';

function heldBy(rg: Rig): Held {
  switch (rg.cos) {
    case 'scientist': return 'vial';
    case 'raver': return 'stick';
    case 'hacker': return 'phone';
    case 'astronaut': return 'wrench';
    default: return rg.pose === 'web' ? 'phone' : 'mug';
  }
}

// The staff (r0, c0)..(r1, c1) gripped at (hr, hc); other costumes hold
// their own thing there, pointing toward where the staff's tip would be.
// Returns the far end of what is held.
function wield(rg: Rig, r0: number, c0: number, r1: number, c1: number, hr: number, hc: number): [number, number] {
  if (rg.cos === 'wizard') {
    staff(rg, r0, c0, r1, c1);
    hand(rg, hr, hc);
    return [r1, c1];
  }
  const end = holdItem(rg, heldBy(rg), hr, hc, r1, c1);
  hand(rg, hr, hc);
  return end;
}

// Draws a held thing from the hand (hr, hc) toward (tr, tc).
function holdItem(rg: Rig, kind: Held, hr: number, hc: number, tr: number, tc: number): [number, number] {
  const { p, tp } = rg;
  const n = Math.max(1, Math.abs(tr - hr), Math.abs(tc - hc));
  const pt = (k: number) => along(hr, hc, tr, tc, Math.min(1, k / Math.max(n, 3)));
  const [a, b, c] = [pt(1), pt(2), pt(3)];
  switch (kind) {
    case 'vial': {
      // A test tube: glowing brew, glass at the top.
      put(p, a[0], a[1], 'G');
      put(p, b[0], b[1], 'G');
      put(p, c[0], c[1], 'l');
      const brew = brighten(rg.tr.color, 0.25 + 0.3 * rg.flare);
      shine(p, a[0], a[1], scale(brew, 0.85));
      shine(p, b[0], b[1], brew);
      rg.tip = at(p, b[0], b[1]);
      rg.tipKind = 'vial';
      return c;
    }
    case 'stick': {
      const neon = brighten(rg.tr.color, 0.3 + 0.2 * rg.flare);
      for (const [r, cc] of [a, b, c]) {
        put(p, r, cc, 'n');
        shine(p, r, cc, neon);
      }
      rg.tip = at(p, c[0], c[1]);
      rg.tipKind = 'stick';
      return c;
    }
    case 'phone': {
      put(p, a[0], a[1], 't');
      put(p, b[0], b[1], 't');
      shine(p, a[0], a[1], scale(mix(SCREEN, rg.tr.color, 0.25), 0.8 + 0.2 * Math.sin(tp * 5)));
      rg.tip = at(p, a[0], a[1]);
      rg.tipKind = 'screen';
      return b;
    }
    case 'mug':
      cup(rg, hr - 1, hc + 1);
      return [hr - 2, hc + 1];
    default: {
      // Wrench: a grey bar with a jaw at the far end.
      put(p, a[0], a[1], 'M');
      put(p, b[0], b[1], 'M');
      put(p, c[0], c[1], 'M');
      const vertical = Math.abs(tr - hr) >= Math.abs(tc - hc);
      put(p, c[0] + (vertical ? 0 : -1), c[1] + (vertical ? 1 : 0), 'M');
      return c;
    }
  }
}

// A 2 x 2 cup with its top-left at (r, c), held by the handle at (r + 1,
// c - 1); hot drinks steam.
function cup(rg: Rig, r: number, c: number): void {
  const { p, tp, cos } = rg;
  row(p, r, c, c + 1, cos === 'wizard' ? 'N' : 'm');
  row(p, r + 1, c, c + 1, 'm');
  if (cos === 'wizard' || cos === 'casual' || cos === 'scientist') {
    const f = Math.floor(tp * 2.2) % 3;
    if (f < 2 && !solid(p, r - 1 - f, c + f)) shine(p, r - 1 - f, c + f, hex('#6d7480'));
  }
}

// Puts away what the hands hold: the wizard's staff stands beside it, a
// scientist's vial goes in the breast pocket (still glowing).
function stow(rg: Rig): void {
  const { p, tr } = rg;
  if (rg.cos === 'wizard') {
    plantedStaff(rg);
  } else if (rg.cos === 'scientist') {
    put(p, 7, -1, 'l');
    put(p, 8, -1, 'G');
    shine(p, 8, -1, scale(brighten(tr.color, 0.25), 0.8));
    rg.tip = at(p, 8, -1);
    rg.tipKind = 'vial';
  }
}

// The wizard's staff slung across its back while both hands are busy.
function slung(rg: Rig): void {
  onBody(rg.p, () => staff(rg, 11, 3, 3, -5));
}

// A block (the colour of opts.item) with its top-left at (r, c).
function block(rg: Rig, r: number, c: number, w = 4, h = 3): void {
  const { p } = rg;
  for (let i = 0; i < h; i++) row(p, r + i, c, c + w - 1, 'I');
}

// A few pseudo-random sparkles around (r, c), reshuffled `step` times a second.
function sparkles(rg: Rig, r: number, c: number, n: number, color: RGB, step: number): void {
  const f = Math.floor(rg.tp * step);
  for (let i = 0; i < n; i++) {
    const h = Math.imul(f * 7 + i * 13 + 5, 2654435761) >>> 0;
    const dr = (h % 5) - 2;
    const dc = ((h >>> 8) % 5) - 2;
    if ((dr === 0 && dc === 0) || solid(rg.p, r + dr, c + dc)) continue;
    shine(rg.p, r + dr, c + dc, (h >>> 16) % 3 === 0 ? WHITE : color);
  }
}

// An open mouth (talking, cheering, yawning) where there is a face to show it.
function mouth(rg: Rig): void {
  const { p, tr } = rg;
  if (rg.back || tr.accessory === 'hood' || tr.species === 'robot') return;
  onBody(p, () => put(p, 6, 1, 'D'));
}

// ── poses ────────────────────────────────────────────────────────────────
function standing(rg: Rig, look: Look): void {
  dress(rg, 'stand');
  head(rg, look);
}

function idle(rg: Rig, look: Look): void {
  const { p, tp } = rg;
  const bob = Math.floor(tp * 1.25) % 2;
  // Now and then the weight shifts onto the back foot.
  const shift = tp % 4 > 3 ? -1 : 0;
  dress(rg, 'stand');
  p.x = shift;
  head(rg, look);
  backArmDown(rg);
  p.x = 0;
  sleeve(rg, [[8, 3]]);
  wield(rg, 12 - bob, 4, 2 - bob, 4, 9 - bob, 4);
}

function walk(rg: Rig, look: Look): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 8) % 4;
  const st = STEPS[f];
  const base = p.y;
  dress(rg, st);
  p.y = base + lift(rg, st);
  head(rg, look);
  backArmDown(rg, f === 2 ? 1 : 0);
  sleeve(rg, [[8, 3]]);
  if (rg.cos === 'wizard') {
    // Walking stick: the foot plants ahead, then trails.
    p.y = base;
    const lift = f % 2;
    const lean = f === 0 ? 1 : f === 2 ? -1 : 0;
    staff(rg, 12 - lift, 4 + lean, 2 - lift, 4);
    hand(rg, 9 - lift, 4);
    return;
  }
  // The free arm swings against the stride, holding the thing up.
  const hc = f === 0 ? 3 : f === 2 ? 5 : 4;
  if (f === 2) sleeve(rg, [[9, 4]]);
  wield(rg, 12, hc, 2, hc, 9, hc);
  p.y = base;
}

function write(rg: Rig, look: Look): void {
  if (rg.cos === 'raver') return dj(rg, look, 6);
  if (rg.cos !== 'wizard' && rg.cos !== 'astronaut') return typing(rg, look, 7, 1.2);
  // Hammering at the anvil.
  const { p } = rg;
  const f = Math.floor(rg.tp * 6) % 4;
  stow(rg);
  standing(rg, look);
  backArmDown(rg);
  if (f < 2) {
    // Hammer raised overhead.
    sleeve(rg, [[8, 3], [7, 3]]);
    hand(rg, 6, 4);
    col(p, 4, 3, 5, 'w');
    row(p, 1, 3, 5, 'M');
    row(p, 2, 3, 5, 'M');
  } else if (f === 2) {
    sleeve(rg, [[8, 3]]);
    hand(rg, 8, 4);
    line(p, 7, 5, 6, 6, 'w');
    dots(p, [[4, 6], [4, 7], [5, 7], [5, 8], [6, 8]], 'M');
  } else {
    // Strike: the head comes down in front; sparks fly.
    sleeve(rg, [[8, 3]]);
    hand(rg, 9, 4);
    row(p, 9, 5, 6, 'w');
    col(p, 7, 8, 10, 'M');
    col(p, 8, 8, 10, 'M');
    const hot = mix(SPARK, rg.tr.color, 0.25);
    sparkles(rg, 10, 9, 4, hot, 12);
    shine(p, 11, 9, hot);
  }
}

// Pecking at a keyboard in front, the elbows bobbing from behind; at the
// end of every `beat` seconds the near hand winds up three pixels and
// comes down hard on Enter.
function typing(rg: Rig, look: Look, speed: number, beat: number): void {
  const f = Math.floor(rg.tp * speed) % 4;
  const left = beat - (rg.tp % beat); // seconds to the end of the beat
  stow(rg);
  standing(rg, f === 3 ? 'open' : look);
  sleeve(rg, [[8, -3], [9 - (f === 0 ? 1 : 0), -3]]);
  hand(rg, 9, -1);
  if (left < 0.15) {
    // Enter.
    sleeve(rg, [[8, 3], [8, 4]]);
    hand(rg, 9, 5);
  } else if (left < 0.3) {
    // Held high a beat.
    sleeve(rg, [[8, 3], [7, 4]]);
    hand(rg, 6, 5);
  } else if (left < 0.4) {
    sleeve(rg, [[8, 3]]);
    hand(rg, 7, 4);
  } else {
    sleeve(rg, [[8, 3], [9 - (f === 2 ? 1 : 0), 3]]);
    hand(rg, 9 - (f === 2 ? 1 : 0), 4);
  }
}

// Spinning records: one hand scratching, the other pumping a glow stick
// three pixels up and down on the beat.
function dj(rg: Rig, look: Look, speed: number): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * speed) % 4;
  const base = p.y;
  dress(rg, 'stand');
  p.y = base + (f % 2);
  head(rg, look);
  p.y = base;
  sleeve(rg, [[8, 3]]);
  hand(rg, 9, 4 + (f >> 1));
  const hr = f < 2 ? 6 : 9;
  sleeve(rg, f < 2 ? [[8, -3], [7, -4]] : [[8, -3]]);
  holdItem(rg, heldBy(rg), hr, -4, hr - 6, -5);
  hand(rg, hr, -4);
}

function read(rg: Rig): void {
  if (rg.cos === 'scientist') return clipboard(rg);
  if (rg.cos !== 'wizard' && rg.cos !== 'casual') return tablet(rg);
  const { p, tp } = rg;
  stow(rg);
  standing(rg, 'down');
  sleeve(rg, [[8, -3], [8, 3]]);
  // Open book held at the chest.
  row(p, 8, -1, 3, 'N');
  put(p, 8, 1, 'O');
  row(p, 9, -1, 3, 'O');
  hand(rg, 9, -2);
  hand(rg, 9, 4);
  // A page turns every 0.8 s: up off the right side (peeking past the head
  // from behind), over, and down on the left.
  const turn = tp % 0.8;
  const leaf = turn < 0.12 ? [7, 3] : turn < 0.24 ? [6, 3] : turn < 0.36 ? [6, 1] : turn < 0.48 ? [7, -1] : null;
  if (leaf) put(p, leaf[0], leaf[1], 'N');
  if (rg.back) return;
  const page = mix(FIXED.N, rg.tr.color, 0.4);
  const flick = 0.75 + 0.25 * Math.sin(tp * 3.3);
  // Only a wizard's book glows.
  if (rg.cos === 'wizard') {
    for (const c of [-1, 0, 2, 3]) shine(p, 8, c, scale(page, 0.62 * flick));
    if (leaf) shine(p, leaf[0], leaf[1], scale(page, 0.7));
  }
}

// A clipboard held up in one hand, the other ticking boxes with a pen;
// every 0.8 s the pen hand lifts the sheet's corner and flips it up over
// the clip.
function clipboard(rg: Rig): void {
  const { p, tp } = rg;
  const turn = tp % 0.8;
  stow(rg);
  standing(rg, 'down');
  row(p, 7, 1, 3, 'O');
  put(p, 7, 2, 'M'); // clip
  row(p, 8, 1, 3, 'N');
  row(p, 9, 1, 3, 'N');
  put(p, 9, 2, 'X');
  sleeve(rg, [[8, 4]]);
  hand(rg, 9, 4);
  sleeve(rg, [[8, -3], [9, -2]]);
  // The leaf goes up off the corner, over the top and down behind.
  const leaf = turn < 0.1 ? [7, 4] : turn < 0.2 ? [6, 4] : turn < 0.3 ? [6, 3] : null;
  if (leaf) put(p, leaf[0], leaf[1], 'N');
  const [hr, hc] = turn < 0.3 ? [8, 3] : turn < 0.55 ? [8, 1] : [9, 2];
  hand(rg, hr, hc);
  put(p, hr - 1, hc, 'X'); // pen
}

// A glowing tablet held in both hands; every 0.8 s a thumb swipes three
// pixels across the screen to the next page.
function tablet(rg: Rig): void {
  const { p, tp, tr } = rg;
  const turn = tp % 0.8;
  const thumb = turn < 0.3 ? 3 - Math.floor(turn / 0.1) : null; // its column, mid-swipe
  stow(rg);
  standing(rg, 'down');
  sleeve(rg, [[8, -3], [8, 3]]);
  row(p, 8, -1, 3, 't');
  row(p, 9, -1, 3, 't');
  hand(rg, 9, -2);
  if (thumb === null) hand(rg, 9, 4);
  else hand(rg, 8, thumb);
  const lit = mix(SCREEN, tr.color, 0.3);
  const s = Math.floor(tp / 0.8) % 3; // the page on show
  for (let c = 0; c <= 2; c++) if (c !== thumb) shine(p, 8, c, scale(lit, (c + s) % 3 === 0 ? 0.55 : 0.85));
  rg.tip = at(p, 8, 1);
  rg.tipKind = 'screen';
}

function search(rg: Rig, look: Look): void {
  if (rg.cos !== 'wizard' && rg.cos !== 'astronaut') return magnify(rg);
  // Swinging a pickaxe at the rock face.
  const { p } = rg;
  const f = Math.floor(rg.tp * 4) % 4;
  stow(rg);
  standing(rg, look);
  backArmDown(rg);
  if (f < 2) {
    // Wound up: the pick high over the shoulder.
    sleeve(rg, [[8, 3], [7, 3]]);
    hand(rg, 6, 4);
    col(p, 5, 2, 5, 'w');
    row(p, 1, 4, 6, 'M');
    dots(p, [[2, 3], [2, 7]], 'M');
  } else if (f === 2) {
    sleeve(rg, [[8, 3]]);
    hand(rg, 8, 4);
    line(p, 7, 5, 5, 7, 'w');
    dots(p, [[3, 6], [4, 7], [4, 8], [5, 8], [6, 9]], 'M');
  } else {
    // Strike: the point bites the ground in front; grit flies.
    sleeve(rg, [[8, 3]]);
    hand(rg, 9, 4);
    line(p, 9, 5, 10, 7, 'w');
    dots(p, [[8, 7], [9, 8], [10, 8], [11, 8], [12, 9]], 'M');
    sparkles(rg, 11, 10, 3, SPARK, 8);
  }
}

// Sweeping a magnifying glass over something in front.
function magnify(rg: Rig): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 2.5) % 4;
  const [lr, lc] = ([[6, 7], [7, 8], [7, 7], [6, 6]] as const)[f];
  stow(rg);
  standing(rg, 'down');
  backArmDown(rg);
  sleeve(rg, [[8, 3]]);
  line(p, 8, 5, lr + 1, lc - 1, 'w');
  dots(p, [[lr - 1, lc], [lr + 1, lc], [lr, lc - 1], [lr, lc + 1]], 'M');
  put(p, lr, lc, 'l');
  if (f === 1) shine(p, lr, lc, scale(WHITE, 0.8));
  hand(rg, 9, 4);
}

function run(rg: Rig, look: Look): void {
  if (rg.cos === 'raver') return dj(rg, look, 9);
  if (rg.cos === 'hacker' || rg.cos === 'casual') return typing(rg, look, 10, 0.9);
  // Stirring the brew in front: both hands on the staff (a glass rod, a
  // crank), its glowing end circling in the pot.
  const f = Math.floor(rg.tp * 5) % 4;
  const tr = [11, 11, 12, 12][f];
  const tc = [8, 9, 9, 8][f];
  const hc = [2, 2, 3, 3][f];
  standing(rg, look);
  sleeve(rg, [[8, -3], [8, 3]]);
  if (rg.cos === 'wizard') {
    staff(rg, 5, hc, tr, tc);
  } else {
    line(rg.p, 6, hc, tr, tc, rg.cos === 'scientist' ? 'l' : 'M');
    if (rg.cos === 'scientist') {
      put(rg.p, tr, tc, 'G');
      shine(rg.p, tr, tc, brighten(rg.tr.color, 0.4));
      rg.tip = at(rg.p, tr, tc);
      rg.tipKind = 'vial';
    }
  }
  const [r1, c1] = along(5, hc, tr, tc, 0.2);
  const [r2, c2] = along(5, hc, tr, tc, 0.5);
  hand(rg, r1, c1);
  hand(rg, r2, c2);
  rg.flare = 0.3;
}

function web(rg: Rig, look: Look): void {
  // Both arms up, casting, pumping in turn; sparks crackle about the hands.
  const { p } = rg;
  const f = Math.floor(rg.tp * 3) % 2;
  const br = 5 + f; // the back hand is up while the staff hand is down
  standing(rg, look);
  sleeve(rg, [[8, -3], [7, -4], [8, 3], [7, 4]]);
  if (br === 5) sleeve(rg, [[6, -4]]);
  hand(rg, br, -4);
  const [er, ec] = wield(rg, 9, 5, 0 - f, 5, 6 - f, 5);
  rg.flare = 0.4;
  const spark = mix(rg.tr.color, WHITE, 0.3);
  sparkles(rg, br - 2, -4, 3, spark, 9);
  sparkles(rg, er, ec, 3, spark, 7);
  shine(p, br, -4, scale(brighten(rg.tr.color), 0.6));
}

function think(rg: Rig, look: Look): void {
  // Hand to chin; the head tilts slowly from side to side.
  const { p } = rg;
  const tilt = Math.floor(rg.tp / 1.8) % 2 ? -1 : 0;
  dress(rg, 'stand');
  p.x = tilt;
  head(rg, look);
  p.x = 0;
  sleeve(rg, [[8, -3], [9, -3]]);
  wield(rg, 12, -5, 3, -5, 9, -4);
  sleeve(rg, [[8, 3], [7, 3]]);
  hand(rg, 6, 3 + tilt);
  puff(rg);
}

// A thought rising beside the head every 2 s: a dot, two, then a cloud.
function puff(rg: Rig): void {
  const { p } = rg;
  const k = Math.floor((rg.tp % 2) / 0.5);
  onBody(p, () => {
    if (k >= 1) put(p, 3, 5, 'N');
    if (k >= 2) put(p, 1, 6, 'N');
    if (k >= 3) {
      row(p, -1, 6, 7, 'N');
      row(p, 0, 6, 8, 'N');
    }
  });
}

function delegate(rg: Rig, look: Look): void {
  // Staff thrust forward at arm's length, the head leaning into the push;
  // the tip flares on the push.
  const { p } = rg;
  const push = Math.floor(rg.tp * 2.5) % 2 === 0;
  const reach = push ? 1 : 0;
  dress(rg, 'stand');
  p.x = reach;
  head(rg, look);
  p.x = 0;
  backArmDown(rg, 1);
  sleeve(rg, push ? [[8, 3], [8, 4]] : [[8, 3]]);
  // A held vial or glow stick blazes too; the staff's flare only feeds its light.
  if (rg.cos !== 'wizard') rg.flare = push ? 1 : 0.4;
  wield(rg, 9, 1 + reach, 7, 9 + reach, 8, 4 + reach);
  rg.flare = push ? 1 : 0.4;
}

function talk(rg: Rig, look: Look): void {
  // Arms raised in turn (the staff hand lifts its staff); the mouth moves.
  const { tp } = rg;
  const f = Math.floor(tp * 3) % 2;
  standing(rg, look);
  if (f) {
    sleeve(rg, [[8, 3]]);
    wield(rg, 12, 4, 2, 4, 9, 4);
    sleeve(rg, [[8, -3], [7, -4], [6, -4]]);
    hand(rg, 5, -5);
  } else {
    sleeve(rg, [[8, 3], [7, 3]]);
    wield(rg, 10, 4, 0, 4, 7, 4);
    sleeve(rg, [[8, -3], [8, -4]]);
    hand(rg, 9, -5);
  }
  if (Math.floor(tp * 6) % 2 === 0) mouth(rg);
}

function done(rg: Rig, look: Look): number {
  // Jumping for joy, staff held high.
  const air = Math.sin(rg.tp * Math.PI * 2.5) > 0.1;
  dress(rg, 'stand');
  head(rg, look);
  sleeve(rg, [[8, -3], [7, -4], [8, 3], [7, 4]]);
  hand(rg, 6, -4);
  if (rg.cos !== 'wizard') rg.flare = air ? 1 : 0.5;
  const [er, ec] = wield(rg, 8, 5, 0, 5, 6, 5);
  rg.flare = air ? 1 : 0.5;
  sparkles(rg, er, ec, 3, mix(rg.tr.color, WHITE, 0.4), 10);
  return air ? -3 : 0;
}

function error(rg: Rig): void {
  // Staggering back, arms flung up, staff knocked askew.
  const { p, tp } = rg;
  const f = Math.floor(tp * 6) % 2;
  dress(rg, 'wide');
  p.x = -1;
  head(rg, 'open');
  p.x = 0;
  sleeve(rg, [[8, -3], [7, -4], [8, 3], [7, 4]]);
  hand(rg, 6 - f, -5);
  hand(rg, 5 + f, 5);
  if (rg.cos === 'wizard') {
    staff(rg, 12, 5, 4, 7 + f);
  } else {
    holdItem(rg, heldBy(rg), 5 + f, 5, 0, 7 + f);
    hand(rg, 5 + f, 5);
  }
}

// Lying on its back, head to the left, hat tipped off, staff beside.
function sleep(rg: Rig): void {
  if (rg.cos !== 'wizard') {
    nap(rg);
    return;
  }
  const { p, tr, back, tp } = rg;
  const ghost = tr.species === 'ghost';
  const breath = Math.floor(tp / 1.6) % 2;
  onBody(p, () => {
    const body = ghost ? 'S' : 'R';
    // Robe: rows 9..11, cols -3..4; hem column 5; feet column 6.
    row(p, 10, -3, 4, body);
    row(p, 11, -3, 4, body);
    row(p, 9, -2, 3, body);
    if (breath) row(p, 8, -1, 1, body);
    col(p, 5, 9, 11, ghost ? 's' : 'T');
    if (ghost) {
      dots(p, [[9, 6], [11, 6], [10, 7]], 's');
    } else {
      col(p, 6, 8, 9, 'K');
      put(p, 8, 7, 'K');
      put(p, 10, 6, 'K');
    }
    // Head: face up, eyes shut, hood or hair around it.
    const hd = tr.species === 'robot' ? 'M' : hooded(tr) ? 'H' : 'B';
    col(p, -6, 9, 11, hd);
    row(p, 9, -5, -4, hd);
    const deep = tr.accessory === 'hood';
    // No brim shades the face when lying down.
    row(p, 10, -5, -4, back ? hd : deep ? 'D' : 'A');
    row(p, 11, -5, -4, back ? hd : deep ? 'D' : 'f');
    if (tr.species === 'robot' && !back) row(p, 10, -5, -4, 'Q');
    if (!back && tr.species !== 'robot' && !deep) put(p, 10, -4, 'X');
    // Hat tipped off behind the head.
    if (tr.species === 'cat') {
      dots(p, [[8, -6], [8, -4]], 'H');
    } else if (tr.species === 'robot') {
      put(p, 8, -5, 'Q');
    } else if (tr.accessory === 'lamp') {
      dots(p, [[8, -6], [8, -5], [8, -4], [9, -7]], 'Y');
    } else if (tr.accessory === 'beret') {
      row(p, 8, -6, -4, 'Z');
    } else if (!hooded(tr)) {
      row(p, 8, -8, -6, tr.accessory === 'headset' ? 'C' : 'h');
      col(p, -7, 7, 11, 'H');
      row(p, 9, -10, -8, 'H');
      row(p, 10, -9, -8, 'H');
      put(p, 11, -9, 'H');
    } else {
      put(p, 9, -7, 'H');
      put(p, 10, -7, 'H');
    }
    if (tr.accessory === 'headset' && hooded(tr)) put(p, 8, -5, 'C');
  });
  // Arm folded over the chest.
  sleeve(rg, [[9, 0], [9, 1]]);
  hand(rg, 9, 2);
  // Staff on the ground in front, its tip glowing softly.
  put(p, 12, -4, 'W');
  staff(rg, 12, -3, 12, 7);
}

// Sleeping in clothes: shirt, legs out to the right, shoes up; whatever
// was held lies on the floor in front, still glowing.
function nap(rg: Rig): void {
  const { p, tr, back, tp, cos } = rg;
  const ghost = tr.species === 'ghost';
  const breath = Math.floor(tp / 1.6) % 2;
  onBody(p, () => {
    const coat = cos === 'scientist' ? 2 : 0;
    row(p, 9, -2, coat, 'R');
    row(p, 10, -3, coat, 'R');
    row(p, 11, -3, coat, 'R');
    if (breath) row(p, 8, -2, -1, 'R');
    if (cos === 'raver') col(p, 1, 10, 11, 'T');
    if (cos === 'scientist') col(p, -3, 10, 11, 'j'); // collar
    if (cos === 'astronaut') col(p, -2, 9, 11, 'j'); // chest band
    if (ghost) {
      for (let c = 1; c <= 5; c++) {
        put(p, 10, c, c % 2 ? 'S' : 's');
        if (c % 2) put(p, 11, c, 's');
      }
    } else {
      row(p, 10, coat + 1, 5, 'p');
      row(p, 11, coat + 1, 5, 'P');
      col(p, 6, 9, 10, 'K');
      put(p, 11, 6, 'K');
    }
    // Head, face up and eyes shut.
    const space = cos === 'astronaut';
    const up = hoodUp(rg);
    let hd = 'B';
    if (space || up) hd = 'H';
    else if (tr.species === 'robot') hd = 'M';
    else if (tr.species === 'alien') hd = 'a';
    else if (tr.species === 'ghost') hd = 'S';
    col(p, -6, 9, 11, hd);
    row(p, 9, -5, -4, hd);
    const dark = tr.accessory === 'hood';
    const skin = space ? 'v' : 'a';
    row(p, 10, -5, -4, back ? hd : dark ? 'D' : skin);
    row(p, 11, -5, -4, back ? hd : dark ? 'D' : space ? 'v' : 'f');
    if (tr.species === 'robot' && !back && !space) row(p, 10, -5, -4, 'Q');
    if (!back && tr.species !== 'robot' && !dark) put(p, 10, -4, 'X');
    if (tr.species === 'cat' && !space) dots(p, [[8, -6], [8, -4]], 'B');
    if (space) {
      col(p, -7, 9, 11, 'H');
      row(p, 8, -6, -4, 'H');
      row(p, 12, -6, -4, 'T');
      // The helmet lamp points at the ceiling.
      put(p, 8, -5, 'L');
      if (!back) shine(p, 8, -5, scale(LAMP, 0.8));
      rg.lamp = at(p, 7, -5);
    }
    if (cos === 'raver' && tr.accessory !== 'lamp') {
      col(p, -6, 9, 11, 'n');
      for (let r = 9; r <= 11; r++) shine(p, r, -6, scale(brighten(tr.color, 0.25), 0.7));
      rg.aux = at(p, 10, -6);
      rg.auxKind = 'band';
    }
    if (tr.accessory === 'headset') {
      put(p, 8, -6, 'C');
      put(p, 8, -4, 'C');
    }
  });
  sleeve(rg, [[9, -1], [9, 0]]);
  hand(rg, 9, 1);
  // What was held lies on the floor in front.
  const kind = heldBy(rg);
  if (kind === 'mug') return;
  holdItem(rg, kind, 12, 3, 12, 7);
  if (kind === 'phone') put(p, 12, 3, 't');
}

// ── the little life between jobs ─────────────────────────────────────────
// Sitting on the floor, legs out in front, breathing; now and then a look
// over the shoulder.
function sit(rg: Rig, look: Look): void {
  const { p, tp } = rg;
  const base = p.y;
  const breath = Math.floor(tp / 1.7) % 2;
  const glance = tp % 5.3 > 4.4;
  // Stowed things sit as low as the seated body, not at standing height.
  const low = lift(rg, 'sit');
  p.y = base + low;
  stow(rg);
  p.y = base;
  dress(rg, 'sit');
  p.y = base + low;
  p.x = glance ? -1 : 0;
  p.y += breath;
  head(rg, glance ? 'open' : look);
  p.y -= breath;
  p.x = 0;
  sleeve(rg, [[8, -3]]);
  hand(rg, 9, -4); // leaning back on a hand
  sleeve(rg, [[8, 3]]);
  // The other rests on a knee (holding the mug, the vial...).
  if (rg.cos === 'wizard') hand(rg, 8, 4);
  else wield(rg, 12, 4, 2, 4, 8, 4);
  p.y = base;
}

// Walking with a block held up over the head.
function carry(rg: Rig, look: Look): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 8) % 4;
  const st = STEPS[f];
  const base = p.y;
  p.y = base + lift(rg, st);
  // The staff rides on its back: behind the body from the front...
  if (rg.cos === 'wizard' && !rg.back) slung(rg);
  if (rg.cos !== 'wizard') stow(rg);
  p.y = base;
  dress(rg, st);
  p.y = base + lift(rg, st);
  head(rg, look);
  // ...over it from behind.
  if (rg.cos === 'wizard' && rg.back) slung(rg);
  onBody(p, () => block(rg, -1, -2));
  sleeve(rg, [[7, -3], [6, -3], [5, -3], [4, -3], [3, -3], [2, -3]]);
  sleeve(rg, [[7, 3], [6, 3], [5, 3], [4, 3], [3, 3], [2, 3]]);
  hand(rg, 1, -3);
  hand(rg, 1, 2);
  p.y = base;
}

// Crouching to set the block down in front, then patting it into place.
function place(rg: Rig, look: Look): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 2.5) % 4;
  const base = p.y;
  const drop = f === 0 ? 1 : 0; // held a pixel off the ground, then set down
  const low = lift(rg, 'crouch');
  p.y = base + low;
  stow(rg);
  p.y = base;
  dress(rg, 'crouch');
  p.y = base + low;
  head(rg, f === 0 ? look : 'down');
  backArmDown(rg);
  p.y = base;
  block(rg, 10 - drop, 4);
  p.y = base + low;
  if (f < 3) {
    // Hands on the block's sides.
    sleeve(rg, [[8, 3], [8, 4]]);
    hand(rg, 9 - drop, 5);
  } else {
    // Letting go.
    sleeve(rg, [[8, 3], [7, 4]]);
    hand(rg, 6, 5);
  }
  p.y = base;
}

// Arms up, wiggling, with a little hop on the beat (returns dy).
function cheer(rg: Rig, look: Look): number {
  const f = Math.floor(rg.tp * 4) % 4;
  stow(rg);
  standing(rg, look);
  const hi = f % 2 === 0;
  sleeve(rg, [[8, -3], [7, -4], [6, -4]]);
  sleeve(rg, [[8, 3], [7, 4], [6, 4]]);
  hand(rg, hi ? 5 : 6, -5);
  hand(rg, hi ? 5 : 6, 5);
  if (hi) mouth(rg);
  sparkles(rg, 3, 0, 3, mix(rg.tr.color, WHITE, 0.4), 8);
  return f === 0 ? -2 : f === 2 ? -1 : 0;
}

// One arm up, the hand waving side to side; the other keeps the staff.
function wave(rg: Rig, look: Look): void {
  const f = Math.floor(rg.tp * 4.5) % 2;
  standing(rg, look);
  sleeve(rg, [[8, -3], [9, -3]]);
  wield(rg, 12, -5, 3, -5, 9, -4);
  sleeve(rg, [[8, 3], [7, 4], [6, 4 + f]]);
  hand(rg, 5, 4 + 2 * f);
}

// Holding a cup at the chest, now and then a slow sip (eyes shut).
function drink(rg: Rig, look: Look): void {
  const { p } = rg;
  const sip = rg.tp % 2.8 > 1.75;
  const base = p.y;
  if (rg.cos !== 'wizard') stow(rg);
  dress(rg, 'stand');
  p.x = sip ? -1 : 0; // head tipped back
  head(rg, sip ? 'shut' : look);
  p.x = 0;
  sleeve(rg, [[8, -3], [9, -3]]);
  if (rg.cos === 'wizard') wield(rg, 12, -5, 3, -5, 9, -4);
  else hand(rg, 10, -3);
  if (sip) {
    sleeve(rg, [[8, 3], [7, 3]]);
    cup(rg, 5, 1);
    hand(rg, 6, 3);
  } else {
    sleeve(rg, [[8, 3]]);
    cup(rg, 8, 4);
    hand(rg, 9, 3);
  }
  p.y = base;
}

// Up on its toes, arms high, yawning; a lean to one side; arms down again.
function stretch(rg: Rig, look: Look): void {
  const { p } = rg;
  const cyc = rg.tp % 3.4;
  const base = p.y;
  stow(rg);
  if (cyc < 1.5) {
    // Hands meet high over the head.
    dress(rg, 'tiptoe');
    p.y = base - 1;
    head(rg, 'shut');
    mouth(rg);
    const top = Math.min(1, topRow(p) - 1);
    sleeve(rg, [[7, -3], [6, -4], [5, -4], [4, -4], [3, -4], [2, -3]]);
    sleeve(rg, [[7, 3], [6, 4], [5, 4], [4, 4], [3, 4], [2, 3]]);
    line(p, 2, -3, top, -1, 'r');
    line(p, 2, 3, top, 1, 'r');
    hand(rg, top - 1, -1);
    hand(rg, top - 1, 0);
  } else if (cyc < 2.4) {
    dress(rg, 'stand');
    p.x = -1;
    head(rg, look);
    sleeve(rg, [[7, -3], [6, -4], [5, -4]]);
    sleeve(rg, [[7, 3], [6, 2], [5, 2], [4, 1]]);
    hand(rg, 4, -5);
    hand(rg, 3, 0);
    p.x = 0;
  } else {
    dress(rg, 'stand');
    head(rg, look);
    backArmDown(rg);
    sleeve(rg, [[8, 3], [9, 3]]);
    hand(rg, 10, 3);
  }
  p.y = base;
}

// Easy conversation: a slow hand, a nod now and then, the mouth going.
function chat(rg: Rig, look: Look): void {
  const { p, tp } = rg;
  const f = Math.floor(tp * 1.6) % 4;
  const base = p.y;
  dress(rg, 'stand');
  p.y = base + (f === 2 ? 1 : 0);
  head(rg, look);
  if (f === 1 || (f === 3 && Math.floor(tp * 5) % 2 === 0)) mouth(rg);
  p.y = base;
  sleeve(rg, [[8, -3], [9, -3]]);
  wield(rg, 12, -5, 3, -5, 9, -4);
  const [hr, hc] = ([[9, 4], [8, 5], [8, 4], [9, 4]] as const)[f];
  sleeve(rg, hr === 8 ? [[8, 3], [8, 4]] : [[8, 3]]);
  hand(rg, hr, hc);
}

// Startled: a jump back with arms flung up, then a shiver (returns [dx, dy]).
function flinch(rg: Rig): [number, number] {
  const { p, tp } = rg;
  const air = tp % 1.4 < 0.22;
  const s = Math.floor(tp * 12) % 2;
  dress(rg, air ? 'tiptoe' : 'wide');
  p.y += air ? -1 : 0;
  p.x = -1;
  head(rg, 'open');
  if (!air) mouth(rg);
  p.x = 0;
  sleeve(rg, [[8, -3], [7, -4]]);
  hand(rg, 6 - s, -5);
  sleeve(rg, [[8, 3], [7, 4]]);
  wield(rg, 11, 3, 3, 6, 6 - (1 - s), 5);
  p.y -= air ? -1 : 0;
  return [-1, air ? -2 : 0];
}

// Four counts: arms up and bob, point right, hands down and bob, point left.
function dance(rg: Rig, look: Look): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 3) % 4;
  const st: Stance = (['bob', 'wide', 'bob', 'sway'] as const)[f];
  const base = p.y;
  stow(rg);
  dress(rg, st);
  p.y = base + lift(rg, st);
  p.x = f === 1 ? 1 : f === 3 ? -1 : 0;
  head(rg, look);
  p.x = 0;
  const sticks = rg.cos === 'raver';
  const grip = (hr: number, hc: number, tr: number, tc: number) => {
    if (sticks) holdItem(rg, 'stick', hr, hc, tr, tc);
    hand(rg, hr, hc);
  };
  switch (f) {
    case 0:
      sleeve(rg, [[8, -3], [7, -4]]);
      sleeve(rg, [[8, 3], [7, 4]]);
      grip(6, -5, 0, -7);
      grip(6, 5, 0, 7);
      break;
    case 1:
      sleeve(rg, [[8, 3], [7, 4], [6, 5]]);
      sleeve(rg, [[8, -3], [9, -4]]);
      grip(5, 6, 0, 9);
      grip(10, -5, 10, -9);
      break;
    case 2:
      sleeve(rg, [[8, -3], [9, -4]]);
      sleeve(rg, [[8, 3], [9, 4]]);
      grip(9, -5, 6, -7);
      grip(9, 5, 6, 7);
      break;
    default:
      sleeve(rg, [[8, -3], [7, -4], [6, -5]]);
      sleeve(rg, [[8, 3], [9, 4]]);
      grip(5, -6, 0, -9);
      grip(10, 5, 10, 9);
  }
  p.y = base;
}

// Crouching with a hand out low in front, stroking something small.
function pet(rg: Rig): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 2.5) % 2;
  const base = p.y;
  const low = lift(rg, 'crouch');
  p.y = base + low;
  stow(rg);
  p.y = base;
  dress(rg, 'crouch');
  p.y = base + low;
  head(rg, 'down');
  sleeve(rg, [[8, -3]]);
  hand(rg, 9, -3);
  sleeve(rg, [[8, 3], [9, 4]]);
  hand(rg, 9, 5 + f);
  p.y = base;
}

// ── shading ──────────────────────────────────────────────────────────────
// Light from the top left: each material gets a highlight where its top or
// left edge meets something else and a shadow along its bottom and right
// edges (where both apply they cancel to the base tone).
function shade(k: string[][], pal: Record<string, RGB>): Array<Array<RGB | null>> {
  return k.map((rowK, y) =>
    rowK.map((key, x) => {
      if (key === '.') return null;
      const base = pal[key] ?? FIXED.Q;
      if (FLAT.has(key)) return base;
      const up = y > 0 ? k[y - 1][x] : '.';
      const down = y < k.length - 1 ? k[y + 1][x] : '.';
      const left = x > 0 ? rowK[x - 1] : '.';
      const right = x < rowK.length - 1 ? rowK[x + 1] : '.';
      const s = (up !== key ? 1 : 0) + (left !== key ? 1 : 0) - (down !== key ? 1 : 0) - (right !== key ? 1 : 0);
      if (s > 0) return mix(base, WHITE, 0.22);
      if (s < 0) return scale(base, 0.7);
      return base;
    }),
  );
}

// Dark rim: every empty pixel touching the silhouette (8-way, a closed
// ring like the emotes') takes a near black tint of what it touches, so the
// figure keeps its edge on any floor and through the sextant quantiser.
function outline(px: Array<Array<RGB | null>>): Array<Array<RGB | null>> {
  return px.map((r, y) =>
    r.map((c, x) => {
      if (c) return c;
      const up = px[y - 1];
      const down = px[y + 1];
      const n = r[x - 1] ?? r[x + 1] ?? up?.[x] ?? down?.[x] ?? up?.[x - 1] ?? up?.[x + 1] ?? down?.[x - 1] ?? down?.[x + 1];
      return n ? mix(n, INK, 0.88) : null;
    }),
  );
}

// Stacks the prop layer over the body (front) or under it (back). A solid
// pixel on top hides whatever glowed beneath it.
function merge(p: Pen, back: boolean): Layer {
  const [lo, hi] = back ? [p.prop, p.body] : [p.body, p.prop];
  const k = lo.k.map((r, y) => r.map((key, x) => (hi.k[y][x] !== '.' ? hi.k[y][x] : key)));
  const gl = lo.gl.map((r, y) => r.map((g, x) => (hi.k[y][x] !== '.' || hi.gl[y][x] ? hi.gl[y][x] : g)));
  return { k, gl };
}

const layer = (): Layer => ({
  k: Array.from({ length: WIZARD_H }, () => Array<string>(WIZARD_W).fill('.')),
  gl: Array.from({ length: WIZARD_H }, () => Array<RGB | null>(WIZARD_W).fill(null)),
});

// ── entry point ──────────────────────────────────────────────────────────
// Sprite for a character in a pose at time t (seconds); `phase` desyncs
// blinking and gestures between characters; `opts` picks the costume and
// the colour of a carried block.
export const wizardSprite: WizardFn = (tr, pose, t, facing, phase = 0, opts = {}) => {
  const tp = t + (phase % 97) * 0.37;
  const cos = opts.costume ?? 'wizard';
  const prop = layer();
  const p: Pen = { body: layer(), prop, cur: prop, x: 0, y: 0 };
  const rg: Rig = {
    tr,
    pose,
    tp,
    back: facing.back,
    p,
    eye: eyeGlow(tr),
    cos,
    item: opts.item ?? STONE,
    tip: null,
    tipKind: 'staff',
    aux: null,
    auxKind: 'band',
    lamp: null,
    flare: 0,
  };
  if (pose === 'error') rg.eye = mix(rg.eye, RED, 0.6);
  const look: Look = tp % 3.3 < 0.15 ? 'shut' : 'open';
  let dy = 0;
  let move = 0;
  // Ghosts float clear of the ground (outline and all), bobbing gently.
  if (tr.species === 'ghost' && pose !== 'sleep') p.y = Math.sin(tp * 2.2) > 0 ? -3 : -2;
  const baseY = p.y;
  switch (pose) {
    case 'walk': walk(rg, look); break;
    case 'write': write(rg, look); break;
    case 'read': read(rg); break;
    case 'search': search(rg, look); break;
    case 'run': run(rg, look); break;
    case 'web': web(rg, look); break;
    case 'think': think(rg, look); break;
    case 'delegate': delegate(rg, look); break;
    case 'talk': talk(rg, look); break;
    case 'done': dy = done(rg, look); break;
    case 'error': error(rg); break;
    case 'sleep': sleep(rg); break;
    case 'sit': sit(rg, look); break;
    case 'carry': carry(rg, look); break;
    case 'place': place(rg, look); break;
    case 'cheer': dy = cheer(rg, look); break;
    case 'wave': wave(rg, look); break;
    case 'drink': drink(rg, look); break;
    case 'stretch': stretch(rg, look); break;
    case 'chat': chat(rg, look); break;
    case 'flinch': [move, dy] = flinch(rg); break;
    case 'dance': dance(rg, look); break;
    case 'pet': pet(rg); break;
    default: idle(rg, look);
  }
  p.y = baseY;
  const shake = pose === 'error' && tp % 1 < 0.45 ? (Math.floor(tp * 14) % 2 ? 1 : -1) : 0;
  const dx = facing.flip ? -(shake + move) : shake + move;

  const { k, gl } = merge(p, facing.back);
  let px = outline(shade(k, palette(tr, rg.eye, cos, rg.item)));
  // Error: a red flash on one beat in three.
  if (pose === 'error' && Math.floor(tp * 5) % 3 === 0) {
    px = px.map((r) => r.map((c) => (c ? mix(c, RED, 0.4) : c)));
  }
  if (facing.flip) {
    for (const r of px) r.reverse();
    for (const r of gl) r.reverse();
  }
  const sp: WizardSprite = { w: WIZARD_W, h: WIZARD_H, px, glow: gl, ax: AX, ay: AY, dx, dy };
  const light = carriedLight(rg, pose, facing.flip);
  if (light) sp.light = light;
  return sp;
};

// The light the figure carries: a lamp if it wears one, else the staff tip
// (or the vial, glow stick, screen it holds), else a glow it wears on the
// head. Offsets are from the anchor, in frame pixels (the sprite's own
// dx/dy applies on top).
function carriedLight(rg: Rig, pose: Pose, flip: boolean): WizardSprite['light'] | undefined {
  const { tr, tp } = rg;
  const src = rg.lamp ?? rg.tip ?? rg.aux;
  if (!src) return undefined;
  const helmet = rg.cos === 'astronaut' && tr.accessory !== 'lamp';
  const kind = rg.lamp ? (helmet ? 'helmet' : 'lamp') : rg.tip ? rg.tipKind : rg.auxKind;
  const pulse = Math.sin(tp * 2.7) * 0.5 + Math.sin(tp * 6.1) * 0.2;
  let color: RGB = tr.color;
  let radius: number;
  let intensity: number;
  switch (kind) {
    case 'lamp':
      // The miner lamp throws a wide warm beam forward.
      color = mix(LAMP, tr.color, 0.35);
      radius = 22 + pulse;
      intensity = 0.95 + 0.05 * pulse;
      break;
    case 'helmet':
      // A space helmet's lamp: cooler and tighter than a miner's.
      color = mix(mix(LAMP, hex('#dff3ff'), 0.5), tr.color, 0.2);
      radius = 17 + pulse;
      intensity = 0.85 + 0.05 * pulse;
      break;
    case 'staff':
      radius = 13 + 2 * pulse + 9 * rg.flare;
      intensity = 0.75 + 0.08 * pulse + 0.45 * rg.flare;
      break;
    case 'vial':
      radius = 11 + 1.5 * pulse + 7 * rg.flare;
      intensity = 0.7 + 0.08 * pulse + 0.4 * rg.flare;
      break;
    case 'stick':
      radius = 13 + 2 * pulse + 8 * rg.flare;
      intensity = 0.8 + 0.1 * pulse + 0.4 * rg.flare;
      break;
    case 'band': {
      // Pulses with the beat.
      const beat = Math.floor(tp * 2) % 2;
      radius = 12 + pulse + beat;
      intensity = 0.65 + 0.15 * beat;
      break;
    }
    case 'screen':
      color = mix(SCREEN, tr.color, 0.25);
      radius = 10 + pulse;
      intensity = 0.6 + 0.05 * pulse;
      break;
    default: // led
      radius = 10;
      intensity = 0.45 + 0.05 * pulse;
  }
  if (pose === 'sleep') {
    radius *= 0.7;
    intensity *= 0.6;
  }
  const ox = src[1] - AX;
  return { dx: flip ? -ox : ox, dy: src[0] - AY, color, radius: Math.max(10, Math.min(24, radius)), intensity };
}

// ── emotes ───────────────────────────────────────────────────────────────
// Little pictures over a head, 2..7 px with a dark rim. `alt` is the
// second frame (same size); `bob` moves the picture down a pixel on the
// second beat instead; `soft` letters (steam) get no rim. They are UI, not
// lights: bright colours and no glow, so they never tint the floor.
type EmoteArt = { art: string[]; alt?: string[]; pal: Record<string, RGB>; soft?: string; bob?: boolean };

const EMOTES: Record<Emote, EmoteArt> = {
  excl: { art: ['ab', 'ab', 'ab', '..', 'ab'], pal: { a: hex('#ffe066'), b: hex('#f2a72e') }, bob: true },
  question: { art: ['.aa.', 'a..b', '..b.', '.b..', '....', '.b..'], pal: { a: hex('#e3f7ff'), b: hex('#8fd3ff') }, bob: true },
  heart: {
    art: ['.aa.aa.', 'awaaaaa', 'aaaaaab', '.aaaab.', '..aab..', '...b...'],
    pal: { a: hex('#ff5c8a'), b: hex('#d93a6a'), w: hex('#ffd6e2') },
    bob: true,
  },
  note: { art: ['..aa.', '..a.a', '..a..', 'bba..', 'bb...'], pal: { a: hex('#c6f3ff'), b: hex('#8ad8f5') }, bob: true },
  idea: {
    art: ['.aaa.', 'awaaa', 'aaaaa', '.aaa.', '.mmm.', '..m..'],
    alt: ['.aaa.', 'aaaaa', 'aawaa', '.aaa.', '.mmm.', '..m..'],
    pal: { a: hex('#ffe680'), w: hex('#fffbe6'), m: hex('#8d939e') },
  },
  sweat: { art: ['.a.', '.a.', 'aaa', 'waa', '.a.'], pal: { a: hex('#6cc4ff'), w: hex('#e0f5ff') }, bob: true },
  zzz: {
    art: ['...aaa', '....a.', '...aaa', 'bbbb..', '..b...', '.b....', 'bbbb..'],
    alt: ['...bbb', '....b.', '...bbb', 'aaaa..', '..a...', '.a....', 'aaaa..'],
    pal: { a: hex('#e4e9ff'), b: hex('#9aa6dd') },
  },
  anger: { art: ['.a.a.', 'aa.aa', '.....', 'aa.aa', '.a.a.'], pal: { a: hex('#ff4a3d') }, bob: true },
  star: {
    art: ['..a..', '.aaa.', 'aawaa', '.aaa.', '.a.a.'],
    alt: ['..a..', '.awa.', 'awwwa', '.awa.', '.a.a.'],
    pal: { a: hex('#ffd84a'), w: hex('#fffbe0') },
  },
  cup: {
    art: ['s.s..', '.s.s.', 'mccm.', 'mmmmh', 'mmmmh', '.mm..'],
    alt: ['.s.s.', 's.s..', 'mccm.', 'mmmmh', 'mmmmh', '.mm..'],
    pal: { m: hex('#f1ede4'), c: hex('#6b4226'), h: hex('#d8d2c6'), s: hex('#c9d0da') },
    soft: 's',
  },
};

// An emote at time t: a 2-frame bob or blink.
export function emoteSprite(e: Emote, t: number): EmoteSprite {
  const def = EMOTES[e];
  const f = Math.floor(t * 2.4) % 2;
  const art = f && def.alt ? def.alt : def.art;
  const bob = def.bob ? 1 : 0;
  const w = art[0].length + 2;
  const h = art.length + 2 + bob;
  const oy = 1 + (bob && f ? 1 : 0);
  const px: Array<Array<RGB | null>> = Array.from({ length: h }, () => Array<RGB | null>(w).fill(null));
  const glow: Array<Array<RGB | null>> = Array.from({ length: h }, () => Array<RGB | null>(w).fill(null));
  const rim: boolean[][] = Array.from({ length: h }, () => Array<boolean>(w).fill(false));
  art.forEach((ln, i) => {
    for (let j = 0; j < ln.length; j++) {
      const ch = ln[j];
      if (ch === '.') continue;
      const c = def.pal[ch];
      px[i + oy][j + 1] = c;
      if (!def.soft?.includes(ch)) rim[i + oy][j + 1] = true;
    }
  });
  // Dark rim all round (8-way), tinted by what it touches.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[y][x]) continue;
      let n: RGB | null = null;
      for (let dy = -1; dy <= 1 && !n; dy++) for (let dx = -1; dx <= 1 && !n; dx++) if (rim[y + dy]?.[x + dx]) n = px[y + dy][x + dx];
      if (n) px[y][x] = mix(n, INK, 0.9);
    }
  }
  return { w, h, px, glow, ax: Math.floor(w / 2), ay: h - 1 };
}
