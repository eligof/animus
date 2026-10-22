import type { RGB } from '../term/color.ts';
import { hex, mix, scale } from '../term/color.ts';
import type { Pose, Traits } from '../world/character.ts';
import type { WizardFn, WizardSprite } from './types.ts';

// Tiny Noita-style wizards. The figure is about 9 px wide and 13 tall
// (15 with a lead's tall hat), drawn for pixels about 3 wide by 4 tall
// (sextant cells), standing on the bottom row of a wider frame that leaves
// room for props, raised staffs and lying down.
//
// Body coordinates: row r = 12 is the feet, the hat brim sits on r = 4,
// the eyes on r = 5, the robe spans r = 7..11. Column c = 0 is the centre;
// the figure faces right (+c) and holds its staff on that side.
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
};

// Keys that keep their exact colour (tiny details, glowing bits, wood).
const FLAT = new Set(['E', 'G', 'L', 'l', 'U', 'X', 'V', 'C', 'W', 'w', 'Q', 'D', 'N', 'J']);

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

// ── state for one frame ──────────────────────────────────────────────────
type Rig = {
  tr: Traits;
  pose: Pose;
  tp: number;
  back: boolean;
  p: Pen;
  eye: RGB;
  // Frame [y, x] of the staff tip and of a miner lamp (for the light).
  tip: [number, number] | null;
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

function palette(tr: Traits, eye: RGB): Record<string, RGB> {
  const ghost = tr.species === 'ghost';
  const robe = ghost ? GHOST_ROBE : tr.shirt;
  let skin = tr.skin;
  if (tr.species === 'alien') skin = mix(skin, hex('#5fd35f'), 0.5);
  if (ghost) skin = hex('#e6ecfa');
  const hat = ghost ? mix(tr.trim, GHOST_ROBE, 0.3) : scale(tr.shirt, 0.6);
  return {
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
  };
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

function catHead(rg: Rig): void {
  const { p } = rg;
  // Ears.
  put(p, 1, -3, 'H');
  put(p, 1, 2, 'H');
  row(p, 2, -3, 2, 'H');
  row(p, 3, -3, 3, 'H');
  row(p, 4, -3, 3, 'H');
  for (const r of [5, 6]) {
    put(p, r, -3, 'H');
    put(p, r, 3, 'H');
  }
  row(p, 7, -3, -2, 'H');
  if (!rg.back) put(p, 2, -2, 'V'); // inner ear
}

function head(rg: Rig, look: Look): void {
  onBody(rg.p, () => headParts(rg, look));
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

// Hood-wearing leads get a little crown instead.
function crown(rg: Rig): void {
  const { p } = rg;
  for (const c of [-2, 0, 2]) put(p, 0, c, 'C');
  row(p, 1, -2, 2, 'C');
  put(p, 1, 0, 'G');
  shine(p, 1, 0, brighten(rg.tr.color, 0.2));
  star(rg, 0, 0);
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
    put(p, 11, c, (c + f) % 2 ? 's' : 'S');
    if ((c + f) % 2 === 0) put(p, 12, c, 's');
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
}

// Staff standing beside the wizard (behind it), for poses that need both
// hands. A ghost's staff floats along with it.
function plantedStaff(rg: Rig): void {
  staff(rg, 12, -5, 3, -5);
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

// ── poses ────────────────────────────────────────────────────────────────
function standing(rg: Rig, look: Look): void {
  robe(rg);
  feet(rg, STAND);
  head(rg, look);
}

function idle(rg: Rig, look: Look): void {
  const bob = Math.floor(rg.tp * 1.25) % 2;
  standing(rg, look);
  backArmDown(rg);
  sleeve(rg, [[8, 3]]);
  staff(rg, 12 - bob, 4, 2 - bob, 4);
  hand(rg, 9 - bob, 4);
}

function walk(rg: Rig, look: Look): void {
  const { p } = rg;
  const f = Math.floor(rg.tp * 8) % 4;
  const passing = f % 2 === 1;
  const base = p.y;
  if (passing) {
    // Body up a pixel over the planted foot; the other foot swings through.
    feet(rg, f === 1 ? [[-1, 12], [1, 11]] : [[0, 12], [-2, 11]]);
    if (rg.tr.species !== 'ghost') onBody(p, () => put(p, 11, f === 1 ? -1 : 1, 'K'));
    p.y = base - 1;
  } else {
    feet(rg, [[-3, 12], [2, 12]]);
  }
  robe(rg);
  // The hem swings with the stride.
  if (rg.tr.species !== 'ghost' && !passing) onBody(p, () => put(p, 11, f === 0 ? -5 : 4, 'T'));
  head(rg, look);
  backArmDown(rg, f === 2 ? 1 : 0);
  sleeve(rg, [[8, 3]]);
  // Walking stick: the foot plants ahead, then trails.
  p.y = base;
  const lift = passing ? 1 : 0;
  const lean = f === 0 ? 1 : f === 2 ? -1 : 0;
  staff(rg, 12 - lift, 4 + lean, 2 - lift, 4);
  hand(rg, 9 - lift, 4);
}

function write(rg: Rig, look: Look): void {
  // Hammering at the anvil.
  const { p } = rg;
  const f = Math.floor(rg.tp * 6) % 4;
  plantedStaff(rg);
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

function read(rg: Rig): void {
  const { p, tp } = rg;
  plantedStaff(rg);
  standing(rg, 'down');
  sleeve(rg, [[8, -3], [8, 3]]);
  // Open book held at the chest; a page turns every few seconds.
  row(p, 8, -1, 3, 'N');
  put(p, 8, 1, 'O');
  row(p, 9, -1, 3, 'O');
  hand(rg, 9, -2);
  hand(rg, 9, 4);
  if (rg.back) return;
  const page = mix(FIXED.N, rg.tr.color, 0.4);
  const flick = 0.75 + 0.25 * Math.sin(tp * 3.3);
  for (const c of [-1, 0, 2, 3]) shine(p, 8, c, scale(page, 0.62 * flick));
  if (tp % 3.2 < 0.35) {
    put(p, 7, 2, 'N');
    shine(p, 7, 2, scale(page, 0.7));
  }
}

function search(rg: Rig, look: Look): void {
  // Swinging a pickaxe at the rock face.
  const { p } = rg;
  const f = Math.floor(rg.tp * 4) % 4;
  plantedStaff(rg);
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

function run(rg: Rig, look: Look): void {
  // Stirring the brew in front: both hands on the staff, its glowing end
  // circling in the pot.
  const f = Math.floor(rg.tp * 5) % 4;
  const tr = [11, 11, 12, 12][f];
  const tc = [8, 9, 9, 8][f];
  const hc = [2, 2, 3, 3][f];
  standing(rg, look);
  sleeve(rg, [[8, -3], [8, 3]]);
  staff(rg, 5, hc, tr, tc);
  const [r1, c1] = along(5, hc, tr, tc, 0.2);
  const [r2, c2] = along(5, hc, tr, tc, 0.5);
  hand(rg, r1, c1);
  hand(rg, r2, c2);
  rg.flare = 0.3;
}

function web(rg: Rig, look: Look): void {
  // Both arms up, casting; sparks crackle about the hands.
  const { p } = rg;
  const f = Math.floor(rg.tp * 3) % 2;
  standing(rg, look);
  sleeve(rg, [[8, -3], [7, -4], [8, 3], [7, 4]]);
  hand(rg, 6, -4);
  staff(rg, 9, 5, 0 - f, 5);
  hand(rg, 6 - f, 5);
  rg.flare = 0.4;
  const spark = mix(rg.tr.color, WHITE, 0.3);
  sparkles(rg, 4, -4, 3, spark, 9);
  sparkles(rg, 0 - f, 5, 3, spark, 7);
  shine(p, 6, -4, scale(brighten(rg.tr.color), 0.6));
}

function think(rg: Rig, look: Look): void {
  // Hand to chin; the head tilts slowly from side to side.
  const { p } = rg;
  const tilt = Math.floor(rg.tp / 1.8) % 2 ? -1 : 0;
  robe(rg);
  feet(rg, STAND);
  p.x = tilt;
  head(rg, look);
  p.x = 0;
  sleeve(rg, [[8, -3], [9, -3]]);
  staff(rg, 12, -5, 3, -5);
  hand(rg, 9, -4);
  sleeve(rg, [[8, 3], [7, 3]]);
  hand(rg, 6, 3 + tilt);
}

function delegate(rg: Rig, look: Look): void {
  // Staff thrust forward; the tip flares on the push.
  const push = Math.floor(rg.tp * 2.5) % 2 === 0;
  const reach = push ? 1 : 0;
  standing(rg, look);
  backArmDown(rg, 1);
  sleeve(rg, [[8, 3]]);
  staff(rg, 9, 1 + reach, 7, 9 + reach);
  hand(rg, 8, 4 + reach);
  rg.flare = push ? 1 : 0.4;
}

function talk(rg: Rig, look: Look): void {
  // The free hand gestures; the mouth moves.
  const { p, tp, tr } = rg;
  const f = Math.floor(tp * 2.5) % 2;
  standing(rg, look);
  sleeve(rg, [[8, 3]]);
  staff(rg, 12, 4, 2, 4);
  hand(rg, 9, 4);
  if (f) {
    sleeve(rg, [[8, -3], [7, -4]]);
    hand(rg, 6, -4);
  } else {
    sleeve(rg, [[8, -3], [8, -4]]);
    hand(rg, 9, -5);
  }
  const mouth = !rg.back && Math.floor(tp * 6) % 2 === 0 && tr.accessory !== 'hood' && tr.species !== 'robot';
  if (mouth) onBody(p, () => put(p, 6, 1, 'D'));
}

function done(rg: Rig, look: Look): number {
  // Jumping for joy, staff held high.
  const air = Math.sin(rg.tp * Math.PI * 2.5) > 0.1;
  robe(rg);
  feet(rg, STAND);
  head(rg, look);
  sleeve(rg, [[8, -3], [7, -4], [8, 3], [7, 4]]);
  hand(rg, 6, -4);
  staff(rg, 8, 5, 0, 5);
  hand(rg, 6, 5);
  rg.flare = air ? 1 : 0.5;
  sparkles(rg, 0, 5, 3, mix(rg.tr.color, WHITE, 0.4), 10);
  return air ? -3 : 0;
}

function error(rg: Rig): void {
  // Staggering back, arms flung up, staff knocked askew.
  const { p, tp } = rg;
  const f = Math.floor(tp * 6) % 2;
  robe(rg);
  feet(rg, [[-3, 12], [1, 12]]);
  p.x = -1;
  head(rg, 'open');
  p.x = 0;
  sleeve(rg, [[8, -3], [7, -4], [8, 3], [7, 4]]);
  hand(rg, 6 - f, -5);
  hand(rg, 5 + f, 5);
  staff(rg, 12, 5, 4, 7 + f);
}

// Lying on its back, head to the left, hat tipped off, staff beside.
function sleep(rg: Rig): void {
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

// Dark rim: every empty pixel touching the silhouette (4-way) takes a near
// black tint of what it touches, so the figure reads on bright floors too.
function outline(px: Array<Array<RGB | null>>): Array<Array<RGB | null>> {
  return px.map((r, y) =>
    r.map((c, x) => {
      if (c) return c;
      const n = r[x - 1] ?? r[x + 1] ?? px[y - 1]?.[x] ?? px[y + 1]?.[x];
      return n ? mix(n, INK, 0.8) : null;
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
// blinking and gestures between characters.
export const wizardSprite: WizardFn = (tr, pose, t, facing, phase = 0) => {
  const tp = t + (phase % 97) * 0.37;
  const prop = layer();
  const p: Pen = { body: layer(), prop, cur: prop, x: 0, y: 0 };
  const rg: Rig = { tr, pose, tp, back: facing.back, p, eye: eyeGlow(tr), tip: null, lamp: null, flare: 0 };
  if (pose === 'error') rg.eye = mix(rg.eye, RED, 0.6);
  const look: Look = tp % 3.3 < 0.15 ? 'shut' : 'open';
  let dy = 0;
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
    default: idle(rg, look);
  }
  p.y = baseY;
  const shake = pose === 'error' && tp % 1 < 0.45 ? (Math.floor(tp * 14) % 2 ? 1 : -1) : 0;
  const dx = facing.flip ? -shake : shake;

  const { k, gl } = merge(p, facing.back);
  let px = outline(shade(k, palette(tr, rg.eye)));
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

// The light the figure carries: the miner lamp if it wears one, else the
// staff tip. Offsets are from the anchor, in frame pixels (the sprite's own
// dx/dy applies on top).
function carriedLight(rg: Rig, pose: Pose, flip: boolean): WizardSprite['light'] | undefined {
  const { tr, tp } = rg;
  const src = rg.lamp ?? rg.tip;
  if (!src) return undefined;
  const pulse = Math.sin(tp * 2.7) * 0.5 + Math.sin(tp * 6.1) * 0.2;
  let color: RGB;
  let radius: number;
  let intensity: number;
  if (rg.lamp) {
    // The miner lamp throws a wide warm beam forward.
    color = mix(LAMP, tr.color, 0.35);
    radius = 22 + pulse;
    intensity = 0.95 + 0.05 * pulse;
  } else {
    color = tr.color;
    radius = 13 + 2 * pulse + 9 * rg.flare;
    intensity = 0.75 + 0.08 * pulse + 0.45 * rg.flare;
  }
  if (pose === 'sleep') {
    radius *= 0.7;
    intensity *= 0.6;
  }
  const ox = src[1] - AX;
  return { dx: flip ? -ox : ox, dy: src[0] - AY, color, radius: Math.max(10, Math.min(24, radius)), intensity };
}
