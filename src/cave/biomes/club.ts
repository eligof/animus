import type { RGB } from '../../term/color.ts';
import { hex, mix } from '../../term/color.ts';
import type { Palette } from '../../themes/types.ts';
import type { Rng } from '../../world/rng.ts';
import { buildSites, hub, keepClear, slotRect, slotsOn, wallGaps } from '../layout.ts';
import { M } from '../materials.ts';
import { beat, hash3, onWall, puff, wallOf, wx, wy } from '../props.ts';
import type { Biome, BuildStyle, Ctx, Grade, Layout, Poi, Prop, Slot, SlotKind } from '../types.ts';
import type { Voxels } from '../voxels.ts';

// The Underground Club: a brick basement at 128 BPM. A light-up dance
// floor steps with the beat under moving-head beams and a mirror ball, neon
// signs buzz on the walls, the smoke machine hazes the room and now and then
// the confetti comes down. Along the walls: the DJ booth, the VIP booth,
// record crates and the door with its bouncer light; out on the floor the
// lighting desk, a neon phone booth, the open-mic stage and the bar. The
// club cat keeps an eye on it all.

// ── look ─────────────────────────────────────────────────────────────────
const PALETTE: Palette = {
  bg: hex('#06030a'),
  wall: hex('#2a1538'),
  wall2: hex('#21102e'),
  floor: hex('#1d1029'),
  floor2: hex('#150b1f'),
  text: hex('#f3e8ff'),
  dim: hex('#8b78a8'),
  accent: hex('#ff3cac'),
  accent2: hex('#21e6ff'),
  panel: hex('#120a1c'),
  panelText: hex('#f5e9ff'),
  border: hex('#a45bff'),
  bubble: hex('#fde9ff'),
  bubbleText: hex('#1b0b26'),
  good: hex('#b6ff3b'),
  warn: hex('#ffb547'),
  bad: hex('#ff3b5c'),
};

const GRADE: Grade = { ambient: hex('#5a4a78'), illum: 1.1, bloom: 0.85, vignette: 0.4 };

// Purple brick and black mortar, dark polished concrete, black lacquer
// and gear plastic, plum velvet, a red stage curtain, lavender haze.
const COLORS: Partial<Record<number, string>> = {
  [M.BRICK]: '#8a52a8',
  [M.ROCK_DARK]: '#2c1c3c',
  [M.CONCRETE]: '#564c66',
  [M.TILE]: '#5c4c78',
  [M.OBSIDIAN]: '#15101c',
  [M.PLASTIC]: '#25212e',
  [M.CARPET]: '#7c1f5e',
  [M.CLOTH]: '#8e1a3c',
  [M.WOOD]: '#4e2f24',
  [M.METAL]: '#7d7a92',
  [M.SMOKE]: '#6e5e92',
};

const PINK = hex('#ff3cac');
const CYAN = hex('#21e6ff');
const LIME = hex('#b6ff3b');
const VIOLET = hex('#a45bff');
const AMBER = hex('#ffb547');
const WHITE = hex('#ffffff');
const WARM = hex('#ffd9a8');
const RED = hex('#ff3a4a');
const GREEN = hex('#4dff8a');
const SILVER = hex('#efe8ff');
const NEON_RGB: readonly RGB[] = [PINK, CYAN, LIME, VIOLET, AMBER];
const NEON_MAT: readonly number[] = [M.NEON_PINK, M.NEON_CYAN, M.NEON_GREEN, M.NEON_PURPLE, M.LED_AMBER];
const DARK = M.OBSIDIAN; // unlit screens and tubes, grout, speaker cones, the cat
const LIQUORS: readonly number[] = [M.POTION, M.COFFEE, M.WATER, M.SLUDGE, M.POTION];
const SLEEVES: readonly number[] = [M.CARPET, M.CLOTH, M.PAPER, M.GOLD_ORE, M.PLASTIC, M.LEAF, M.METAL, M.CANDLE, M.BRICK];

// ── the beat: 128 BPM, everything moves on it ───────────────────────────
const BEAT = 60 / 128;
const beatOf = (t: number): number => Math.floor(t / BEAT);
const frac = (n: number): number => n - Math.floor(n);
const kick = (t: number): number => (1 - frac(t / BEAT)) ** 3;
const mod = (n: number, m: number): number => ((n % m) + m) % m;
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const ease = (p: number): number => p * p * (3 - 2 * p);

const SIDES = ['left', 'right'] as const;
type Side = (typeof SIDES)[number];

// Heights above the floor: the neon strip runs along both walls over every
// prop; signs go between ZONE0 and the moving heads at the top.
const STRIPE = 18;
const ZONE0 = 20;
const DANCE_BUDGET = 540; // dance-floor voxels rewritten per frame, at most

// ── fixtures ─────────────────────────────────────────────────────────────
// What weather() animates, recorded by generate() per world; prop ticks set
// the flags (DJ playing, lights being run, someone on stage).
type P3 = { x: number; y: number; z: number };
type Dance = { x0: number; y0: number; n: number; p: number; k: number; cx: number; cy: number; cells: Int32Array; cur: Uint8Array; next: number };
type Fx = {
  dance: Dance | null;
  heads: P3[];
  ball: (P3 & { cells: number[] }) | null;
  fog: (P3 & { dx: number; dy: number }) | null;
  strobes: Array<P3 & { cells: number[] }>;
  cones: Array<P3 & { i: number }>; // woofer centres and the cell they pump into
  flaky: { cells: number[]; on: boolean } | null; // the letter with a bad tube
  halos: Array<P3 & { color: RGB; r: number; k: number }>; // signs and the neon strip washing the walls
  cat: { eyes: number[]; tail: [number, number] } | null;
  columns: Array<{ strip: number[]; m: number }>; // neon up the columns' corners
  dj: boolean;
  desk: boolean;
  stage: boolean;
};

const FIXTURES = new WeakMap<Voxels, Fx>();

const blank = (): Fx => ({ dance: null, heads: [], ball: null, fog: null, strobes: [], cones: [], flaky: null, halos: [], cat: null, columns: [], dj: false, desk: false, stage: false });

function fxOf(v: Voxels): Fx {
  let fx = FIXTURES.get(v);
  if (!fx) {
    fx = blank();
    FIXTURES.set(v, fx);
  }
  return fx;
}

// ── slot frame helpers ───────────────────────────────────────────────────
// In a slot's frame (see props.ts): a along the wall, b out, h up.
function sput(v: Voxels, s: Slot, a: number, b: number, h: number, m: number, shade?: number): void {
  v.put(wx(s, a, b), wy(s, a, b), s.z0 + h, m, shade);
}

function sfill(v: Voxels, s: Slot, a0: number, b0: number, h0: number, a1: number, b1: number, h1: number, m: number, shade?: number): void {
  for (let h = h0; h < h1; h++) for (let b = b0; b < b1; b++) for (let a = a0; a < a1; a++) sput(v, s, a, b, h, m, shade);
}

function sidx(v: Voxels, s: Slot, a: number, b: number, h: number): number {
  return v.idx(wx(s, a, b), wy(s, a, b), s.z0 + h);
}

// Sets voxel i to `m` if it holds one of `mine` (so nothing dug or built
// over gets overwritten) and is not already that.
function swap(v: Voxels, i: number, m: number, shade: number, mine: ReadonlySet<number>): void {
  const was = v.mat[i];
  if (was === m && v.shade[i] === shade) return;
  if (mine.has(was)) v.set(i, m, shade);
}

const CAT = new Set<number>([DARK, M.NEON_GREEN, M.AIR]);
const LIT = new Set<number>([DARK, M.TILE, M.GLASS, M.CANDLE, M.METAL, M.SCREEN, M.LAMP, M.LED_RED, ...NEON_MAT]);

// A particle that floats through everything for one frame (or `life`).
function glint(c: Ctx, x: number, y: number, z: number, color: RGB, life = Math.max(0.03, c.dt * 1.5), vx = 0, vy = 0, vz = 0, glow = true): void {
  c.spawn({ kind: 'glint', x, y, z, vx, vy, vz, life, color, glow, gravity: 0 });
}

// A dotted line of light from a to b: a beam through the haze.
function beam(c: Ctx, a: P3, b: P3, color: RGB, step: number): void {
  const n = Math.max(1, Math.floor(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / step));
  const off = frac(c.t * 3);
  for (let k = 1; k < n; k++) {
    const f = (k + off) / n;
    glint(c, a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, a.z + (b.z - a.z) * f, color);
  }
}

// ── lettering ────────────────────────────────────────────────────────────
const FONT: Record<string, readonly string[]> = {
  A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'],
  B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'],
  I: ['X', 'X', 'X', 'X', 'X'],
  M: ['X...X', 'XX.XX', 'X.X.X', 'X...X', 'X...X'],
  N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'],
  P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
  S: ['.XX', 'X..', '.X.', '..X', 'XX.'],
  U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'],
  V: ['X.X', 'X.X', 'X.X', 'X.X', '.X.'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XX.', '..X', '.X.', 'X..', 'XXX'],
  '8': ['.X.', 'X.X', '.X.', 'X.X', '.X.'],
  ' ': ['.', '.', '.', '.', '.'],
};

// A martini: glass in one colour (x), the olive in another (o).
const MARTINI: readonly string[] = ['xxxxxxxxx', '.x.....x.', '..x.o.x..', '...x.x...', '....x....', '....x....', '....x....', '..xxxxx..'];

// Lit pixels [column, row, tag] and the picture's size.
type Pic = { w: number; rows: number; px: Array<readonly [number, number, number]> };

function textPic(text: string): Pic {
  const px: Array<readonly [number, number, number]> = [];
  let x = 0;
  [...text].forEach((ch, li) => {
    const g = FONT[ch] ?? FONT[' '];
    if (li > 0) x++;
    for (let r = 0; r < 5; r++) for (let k = 0; k < g[r].length; k++) if (g[r][k] === 'X') px.push([x + k, r, li]);
    x += g[0].length;
  });
  return { w: x, rows: 5, px };
}

function artPic(rows: readonly string[]): Pic {
  const px: Array<readonly [number, number, number]> = [];
  rows.forEach((row, r) => [...row].forEach((ch, k) => ch !== '.' && px.push([k, r, ch.charCodeAt(0)])));
  return { w: rows[0].length, rows: rows.length, px };
}

// A picture in neon on a wall, `s` voxels a pixel, one voxel proud of a
// dark board set into the bricks (with a tube frame `margin` out, if any).
// `left` is its left end as seen from the room: on the left wall that end
// has the larger y, so the picture runs the other way along it. Returns
// every tag's voxels.
function neonOnWall(v: Voxels, L: Layout, wall: Side, left: number, h0: number, pic: Pic, s: number, mat: (tag: number) => number, frame: number | null, margin: number): Map<number, number[]> {
  const dir = wall === 'right' ? 1 : -1;
  const w = pic.w * s;
  const hgt = pic.rows * s;
  const at = (col: number, h: number, o: number): [number, number, number] => {
    const [x, y] = onWall(L, wall, left + dir * col, o);
    return [x, y, L.floor + h];
  };
  for (let col = -margin; col < w + margin; col++) {
    for (let h = h0 - margin; h < h0 + hgt + margin; h++) {
      v.put(...at(col, h, -1), DARK, 2);
      const edge = col === -margin || col === w + margin - 1 || h === h0 - margin || h === h0 + hgt + margin - 1;
      if (frame !== null && margin > 0 && edge) v.put(...at(col, h, 0), frame, 5);
    }
  }
  const out = new Map<number, number[]>();
  for (const [col, row, tag] of pic.px) {
    const m = mat(tag);
    for (let dy = 0; dy < s; dy++) {
      for (let dx = 0; dx < s; dx++) {
        const [x, y, z] = at(col * s + dx, h0 + (pic.rows - 1 - row) * s + dy, 0);
        v.put(x, y, z, m, 6);
        if (!out.has(tag)) out.set(tag, []);
        out.get(tag)!.push(v.idx(x, y, z));
      }
    }
  }
  return out;
}

// Small lettering on a slot's wall, centred over it at height h0 (a dark
// board behind, the tubes one voxel out).
function slotText(v: Voxels, s: Slot, text: string, h0: number, mat: number): void {
  const pic = textPic(text);
  const a0 = Math.floor((s.len - pic.w) / 2);
  const mirror = s.wall === 'left';
  for (const [col, row] of pic.px) {
    const a = a0 + (mirror ? pic.w - 1 - col : col);
    sput(v, s, a, -1, h0 + 4 - row, DARK, 2);
    sput(v, s, a, 0, h0 + 4 - row, mat, 6);
  }
}

// ── the plan ─────────────────────────────────────────────────────────────
// Where everything that is not a prop goes, from the layout alone (so
// pois() agrees with generate()). The floor is laid out in zones round a
// big dance floor on the main diagonal near the hub, clear of the props out
// on the floor: a DJ riser in the back corner, a raised VIP deck in the
// front one, a lounge on the left, booths along the front cuts, neon
// columns, and high tables, plants and light totems scattered over what is
// left.
// Nothing stands on the walkways or the build plazas (keepClear), and
// nothing hangs over open floor (whoever walked under it would stand on
// top), so the mirror ball hangs over the DJ booth.
type Box = { wall: Side; a0: number; w: number; o0: number; dep: number; z?: number };
type Face = 'x+' | 'x-' | 'y+' | 'y-';
type ItemKind = 'table' | 'plant' | 'totem' | 'stool' | 'sofa' | 'lamp' | 'coffee' | 'column' | 'booth';
// [x0, x0 + w) x [y0, y0 + d) on the floor, standing `z` above it (on the
// riser or the deck); `face` is the way a seat, booth or speaker faces.
type Item = { kind: ItemKind; x0: number; y0: number; w: number; d: number; z: number; face: Face };
type Plan = {
  top: number; // wall height above the floor
  zone: number; // sign rows from ZONE0
  s: number; // voxels per sign pixel
  keep: Uint8Array;
  decor: Uint8Array; // floor cells under decor
  dance: { x0: number; y0: number; n: number; p: number; size: number; cx: number; cy: number };
  ball: (P3 & { r: number }) | null;
  riser: number; // the DJ riser covers x + y < riser (0: none)
  deck: { x0: number; y0: number } | null; // out to the front cuts
  rug: { x0: number; y0: number; w: number; d: number } | null;
  speakers: Box[];
  cat: Box | null;
  tables: Box[];
  items: Item[];
  spots: Poi[]; // where to sit and drink in the zones
};

const PLANS = new WeakMap<Layout, Plan>();
const RISER_H = 3;
const DECK_H = 3;

function plan(L: Layout): Plan {
  const hit = PLANS.get(L);
  if (hit) return hit;
  const { W, D, T, floor } = L;
  const S = Math.min(W, D) - T; // the open floor's side
  const top = L.H - floor;
  const zone = top - 4 - ZONE0 + 1;
  const s = zone >= 26 && W >= 200 ? 4 : zone >= 19 && W >= 140 ? 3 : zone >= 12 ? 2 : 1;
  const keep = keepClear(L);
  const free = (x: number, y: number) => x >= T && y >= T && x < W && y < D && !keep[x + W * y];

  // Where nothing new may stand (walkways, plazas, what is already placed)
  // and where decor stands (for the points of interest).
  const blocked = new Uint8Array(W * D);
  const decor = new Uint8Array(W * D);
  for (let y = 0; y < D; y++) for (let x = 0; x < W; x++) if (x < T || y < T || x > W - 2 || y > D - 2 || keep[x + W * y]) blocked[x + W * y] = 1;
  const clear = (x0: number, y0: number, w: number, d: number, pad: number) => {
    for (let y = y0 - pad; y < y0 + d + pad; y++) {
      for (let x = x0 - pad; x < x0 + w + pad; x++) if (x < 0 || y < 0 || x >= W || y >= D || blocked[x + W * y]) return false;
    }
    return true;
  };
  const take = (x0: number, y0: number, w: number, d: number, pad: number, solid = true) => {
    for (let y = Math.max(0, y0 - pad); y < Math.min(D, y0 + d + pad); y++) {
      for (let x = Math.max(0, x0 - pad); x < Math.min(W, x0 + w + pad); x++) {
        blocked[x + W * y] = 1;
        if (solid && x >= x0 && x < x0 + w && y >= y0 && y < y0 + d) decor[x + W * y] = 1;
      }
    }
  };
  const items: Item[] = [];
  const spots: Poi[] = [];
  const place = (it: Item, pad: number) => {
    if (!clear(it.x0, it.y0, it.w, it.d, pad)) return false;
    take(it.x0, it.y0, it.w, it.d, pad);
    items.push(it);
    return true;
  };
  // Inside a zone already claimed: no checks, just record it.
  const add = (it: Item) => {
    take(it.x0, it.y0, it.w, it.d, 0);
    items.push(it);
  };
  // A place to stand: open floor, off the walkways, not under decor.
  const spot = (fx: number, fy: number, kind: Poi['kind'], face: { x: number; y: number }) => {
    const x = Math.round(fx);
    const y = Math.round(fy);
    if (x <= T || y <= T || x >= W - 1 || y >= D - 1 || keep[x + W * y] || decor[x + W * y]) return;
    if (spots.some((q) => Math.hypot(q.x - x, q.y - y) < 2)) return;
    blocked[x + W * y] = 1;
    spots.push({ x, y, kind, face });
  };

  // The dance floor: the biggest square of tiles near the hub, along the
  // diagonal or off to a side, that stays off the plazas, out past the
  // props on the walls and the DJ riser, and clear of the props out on the
  // floor (the nearer the hub the better).
  const p = W >= 120 ? 6 : 5;
  const plazas = buildSites(L);
  const h = hub(L);
  const deep = T + 21;
  const isles = L.slots.filter((k) => k.island).map(slotRect);
  let best = { x0: 0, y0: 0, n: 0, p, size: 0, cx: h.x, cy: h.y };
  let off = Infinity;
  for (const along of [0, -0.03, 0.03, -0.06, 0.06, -0.09, 0.09, -0.12, -0.15]) {
    for (const side of [0, 0.04, -0.04, 0.08, -0.08]) {
      const cx = h.x + S * (along + side);
      const cy = h.y + S * (along - side);
      const far = Math.abs(along) + Math.abs(side);
      for (let n = 15; n >= Math.max(best.n, 2); n--) {
        if (n === best.n && far >= off) break;
        const size = n * p + 1;
        const x0 = Math.round(cx - size / 2);
        const y0 = Math.round(cy - size / 2);
        if (x0 < deep || y0 < deep || x0 + size > W - 3 || y0 + size > D - 3 || x0 + y0 < 2 * T + 0.3 * S + 4) continue;
        const ok = plazas.every((q) => {
          const dx = Math.max(x0 - q.x, 0, q.x - (x0 + size));
          const dy = Math.max(y0 - q.y, 0, q.y - (y0 + size));
          return Math.hypot(dx, dy) > q.r + 3;
        });
        if (ok && isles.every((r) => r.x1 + 4 <= x0 || r.x0 - 4 >= x0 + size || r.y1 + 4 <= y0 || r.y0 - 4 >= y0 + size)) {
          best = { x0, y0, n, p, size, cx: x0 + size / 2, cy: y0 + size / 2 };
          off = far;
          break;
        }
      }
    }
  }
  const dance = best;
  if (dance.n >= 2) take(dance.x0 - 1, dance.y0 - 1, dance.size + 2, dance.size + 2, 3, false);
  const r = W >= 120 ? 3 : 2;
  const dj = L.slots.find((k) => k.kind === 'write');
  const ball = dj
    ? { x: Math.floor(wx(dj, dj.len / 2, 3)), y: Math.floor(wy(dj, dj.len / 2, 3)), z: floor + Math.min(top - 6 - r, Math.max(22, Math.round(top * 0.6))), r }
    : null;

  // The DJ riser: the back corner, as far out as the walkways allow, with
  // a speaker stack against each wall.
  const speakers: Box[] = [];
  let riser = 2 * T;
  const rowFree = (c: number) => {
    for (let x = T; x <= c - T; x++) if (!free(x, c - x)) return false;
    return true;
  };
  while (riser < 2 * T + 0.3 * S && rowFree(riser) && rowFree(riser + 1) && rowFree(riser + 2)) riser++;
  if (riser - 2 * T < 16) riser = 0;
  if (riser) {
    for (let y = T; y < riser - T + 2; y++) for (let x = T; x < riser - y + 2; x++) take(x, y, 1, 1, 0, x + y < riser);
    const a = Math.min(6, Math.floor((riser - 2 * T) / 3));
    speakers.push({ wall: 'left', a0: T + a, w: 6, o0: 0, dep: 4, z: RISER_H }, { wall: 'right', a0: T + a, w: 6, o0: 0, dep: 4, z: RISER_H });
  }

  // Walls: speaker stacks flank the DJ booth, the cat's cushion in a quiet
  // gap (the corner last) with room to stand beside it, cocktail tables in
  // the other gaps.
  const rect = (b: Box): [number, number, number, number] => {
    const [x, y] = onWall(L, b.wall, b.a0, b.o0);
    return b.wall === 'right' ? [x, y, b.w, b.dep] : [x, y, b.dep, b.w];
  };
  const fitBox = (b: Box) => {
    const [x, y, w, d] = rect(b);
    for (let yy = y - 1; yy < y + d + 1; yy++) {
      for (let xx = x - 1; xx < x + w + 1; xx++) if (xx >= T && yy >= T && (xx >= W || yy >= D || blocked[xx + W * yy])) return false;
    }
    return true;
  };
  const takeBox = (b: Box) => take(...rect(b), 1);
  if (dj) {
    const sw = W >= 120 ? 6 : 5;
    const a0 = dj.wall === 'right' ? dj.x0 : dj.y0;
    for (const at of [a0 - 2 - sw, a0 + dj.len + 2]) {
      const b: Box = { wall: dj.wall, a0: at, w: sw, o0: 0, dep: 4 };
      if (at >= T + 1 && fitBox(b)) {
        speakers.push(b);
        takeBox(b);
      }
    }
  }
  let cat: Box | null = null;
  const gapsOf = (wall: Side) => wallGaps(L, wall).sort((g, q) => (g[0] === T ? 1 : 0) - (q[0] === T ? 1 : 0));
  for (const wall of ['left', 'right'] as const) {
    for (const [g0, g1] of gapsOf(wall)) {
      const mid = Math.floor((g0 + g1) / 2) - 3;
      for (let k = 0; k < g1 - g0 && !cat; k++) {
        const a = mid + (k & 1 ? -(k + 1) / 2 : k / 2);
        if (a < g0 + 1 || a + 6 > g1) continue;
        const b: Box = { wall, a0: a, w: 5, o0: 1, dep: 3 };
        const [px, py] = onWall(L, wall, a + 2, b.o0 + b.dep + 1);
        if (fitBox(b) && clear(px, py, 1, 1, 0)) {
          cat = b;
          takeBox(b);
          const [cx, cy] = onWall(L, wall, a + 3, b.o0 + 1);
          spot(px, py, 'pet', { x: cx, y: cy });
        }
      }
      if (cat) break;
    }
    if (cat) break;
  }
  const tables: Box[] = [];
  for (const wall of SIDES) {
    for (const [g0, g1] of wallGaps(L, wall)) {
      if (g0 === T || g1 - g0 < 9) continue;
      const b: Box = { wall, a0: Math.floor((g0 + g1) / 2) - 1, w: 3, o0: 1, dep: 3 };
      if (fitBox(b)) {
        tables.push(b);
        takeBox(b);
      }
    }
  }

  // The VIP deck in the front corner, out to the cuts.
  let deck: Plan['deck'] = null;
  const dk = Math.round(0.19 * S);
  if (dk >= 14) {
    const x0 = W - dk;
    const y0 = D - dk;
    let ok = true;
    for (let y = y0 - 3; y < D && ok; y++) for (let x = x0 - 3; x < W && ok; x++) if (keep[x + W * y] || (blocked[x + W * y] && x < W - 1 && y < D - 1)) ok = false;
    if (ok) {
      deck = { x0, y0 };
      take(x0, y0, dk, dk, 3);
      // a sofa along each cut, a low table and a lamp in the corner, plants
      const len = Math.min(dk - 8, 16);
      add({ kind: 'sofa', x0: W - 4, y0: D - 3 - len, w: 3, d: len, z: DECK_H, face: 'x-' });
      add({ kind: 'sofa', x0: W - 4 - len, y0: D - 4, w: len, d: 3, z: DECK_H, face: 'y-' });
      add({ kind: 'coffee', x0: W - 10, y0: D - 10, w: 4, d: 4, z: DECK_H, face: 'x-' });
      add({ kind: 'lamp', x0: W - 3, y0: D - 3, w: 1, d: 1, z: DECK_H, face: 'x-' });
      add({ kind: 'plant', x0: x0 + 1, y0: D - 4, w: 2, d: 2, z: DECK_H, face: 'x-' });
      add({ kind: 'plant', x0: W - 4, y0: y0 + 1, w: 2, d: 2, z: DECK_H, face: 'x-' });
      add({ kind: 'lamp', x0: x0 + 3, y0: y0 + 3, w: 1, d: 1, z: DECK_H, face: 'x-' });
      add({ kind: 'table', x0: x0 + 6, y0: y0 + 6, w: 3, d: 3, z: DECK_H, face: 'x-' });
      add({ kind: 'stool', x0: x0 + 5, y0: y0 + 10, w: 1, d: 1, z: DECK_H, face: 'x-' });
      add({ kind: 'stool', x0: x0 + 10, y0: y0 + 5, w: 1, d: 1, z: DECK_H, face: 'x-' });
    }
  }

  // Search outward from (fx, fy) of the floor for where a w x d zone fits.
  const near = (fx: number, fy: number, w: number, d: number, pad: number): [number, number] | null => {
    const cx = Math.round(T + fx * S - w / 2);
    const cy = Math.round(T + fy * S - d / 2);
    for (let rr = 0; rr <= S * 0.12; rr++) {
      for (let dy = -rr; dy <= rr; dy++) {
        for (let dx = -rr; dx <= rr; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== rr) continue;
          if (clear(cx + dx, cy + dy, w, d, pad)) return [cx + dx, cy + dy];
        }
      }
    }
    return null;
  };

  // The lounge on the left: a rug, sofas facing over low tables, lamps and
  // plants at its ends.
  let rug: Plan['rug'] = null;
  {
    const w = clamp(Math.round(0.17 * S), 12, 40);
    const d = clamp(Math.round(0.09 * S), 11, 20);
    const at = near(0.6, 0.86, w, d, 2);
    if (at) {
      const [x0, y0] = at;
      rug = { x0, y0, w, d };
      take(x0, y0, w, d, 2, false);
      const groups = w >= 30 ? 2 : 1;
      const gw = Math.floor((w - 2) / groups);
      for (let g = 0; g < groups; g++) {
        const gx = x0 + 1 + g * gw;
        const sl = gw - 4;
        add({ kind: 'sofa', x0: gx + 2, y0: y0 + 1, w: sl, d: 3, z: 0, face: 'y+' });
        add({ kind: 'sofa', x0: gx + 2, y0: y0 + d - 4, w: sl, d: 3, z: 0, face: 'y-' });
        const ty = y0 + Math.floor(d / 2) - 1;
        add({ kind: 'coffee', x0: gx + 4, y0: ty, w: Math.max(2, sl - 4), d: 2, z: 0, face: 'y+' });
        add({ kind: 'lamp', x0: gx, y0: y0 + 1, w: 1, d: 1, z: 0, face: 'y+' });
        for (const a of [gx + 3, gx + sl]) {
          spot(a, y0 + 4, 'seat', { x: a, y: ty });
          if (d >= 13) spot(a, y0 + d - 5, 'seat', { x: a, y: ty + 1 });
        }
      }
      add({ kind: 'plant', x0: x0 + w - 3, y0: y0 + 1, w: 2, d: 2, z: 0, face: 'y+' });
    }
  }

  // Booths along the front cuts, open to the room.
  for (const f of [0.12, 0.3, 0.48]) {
    const bw = 10;
    const bd = 7;
    const x = Math.round(T + f * S);
    const y = Math.round(T + f * S);
    const a: Item = { kind: 'booth', x0: x, y0: D - 2 - bd, w: bw, d: bd, z: 0, face: 'y-' };
    if (place(a, 1)) spot(x + bw / 2, D - 3 - bd, 'seat', { x: x + bw / 2, y: D - 5 });
    const b: Item = { kind: 'booth', x0: W - 2 - bd, y0: y, w: bd, d: bw, z: 0, face: 'x-' };
    if (place(b, 1)) spot(W - 3 - bd, y + bw / 2, 'seat', { x: W - 5, y: y + bw / 2 });
  }

  // Neon columns out on the flanks, where all they stand in front of is
  // the far ends of the walls.
  const cw = S >= 160 ? 3 : 2;
  let columns = 0;
  for (const [fx0, fy0] of [[0.06, 0.78], [0.78, 0.06], [0.14, 0.94], [0.94, 0.14]]) {
    if (columns >= Math.round(S / 60)) break;
    const at = near(fx0, fy0, cw, cw, 3);
    if (at && place({ kind: 'column', x0: at[0], y0: at[1], w: cw, d: cw, z: 0, face: 'x+' }, 3)) columns++;
  }

  // Everything else, a little group to a cell of a jittered grid wherever
  // there is room: a high table with its stools, a clump of plants, a pair
  // of light totems, a lone table.
  const step = clamp(Math.round(S / 15), 9, 16);
  const one = (kind: ItemKind, x: number, y: number, face: Face = 'x+') => {
    const n = kind === 'table' ? 3 : kind === 'plant' ? 2 : 1;
    return place({ kind, x0: x, y0: y, w: n, d: n, z: 0, face }, 1);
  };
  for (let gy = T + 2; gy < D - 3; gy += step) {
    for (let gx = T + 2; gx < W - 3; gx += step) {
      const q = hash3(1201, gx, gy, 0);
      const x = gx + Math.floor(hash3(1202, gx, gy, 0) * Math.max(1, step - 9));
      const y = gy + Math.floor(hash3(1203, gx, gy, 0) * Math.max(1, step - 9));
      if (q < 0.35 && clear(x - 2, y, 9, 3, 1)) {
        one('table', x + 1, y);
        place({ kind: 'stool', x0: x - 1, y0: y + 1, w: 1, d: 1, z: 0, face: 'x+' }, 0);
        place({ kind: 'stool', x0: x + 5, y0: y + 1, w: 1, d: 1, z: 0, face: 'x-' }, 0);
        take(x - 2, y, 9, 3, 1, false);
      } else if (q < 0.55 && clear(x, y, 5, 5, 1)) {
        one('plant', x, y);
        one('plant', x + 3, y + 1) || one('plant', x + 3, y);
        one('plant', x + 1, y + 3) || one('plant', x, y + 3);
      } else if (q < 0.75 && clear(x, y, 4, 4, 1)) {
        one('totem', x, y);
        one('totem', x + 3, y + 3);
      } else if (q < 0.9) {
        one('table', x, y) || one('plant', x, y) || one('totem', x, y);
      } else {
        one('totem', x, y);
      }
    }
  }

  const out: Plan = { top, zone, s, keep, decor, dance, ball, riser, deck, rug, speakers, cat, tables, items, spots };
  PLANS.set(L, out);
  return out;
}

// ── props ────────────────────────────────────────────────────────────────

// write: the DJ booth. A booth with an LED front and a pink lip, two decks
// and a mixer, a laptop, monitors, and a video wall set in the bricks
// behind. Playing, the decks spin, the wall jumps with the spectrum and
// light sparks off the decks on every beat.
function djBooth(): Prop {
  const DESK = 5; // the desk top
  const WALL0 = 7; // the video wall's bottom row
  const ROWS = 9;
  const RING: ReadonlyArray<readonly [number, number]> = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
  type St = { wall: number[]; cols: number; front: number[]; fcols: number; rings: number[][]; shine: number; decks: P3[] };
  const ST = new WeakMap<Voxels, St>();
  const EQ = new Set<number>([DARK, M.NEON_GREEN, M.LED_AMBER, M.NEON_PINK, M.NEON_PURPLE, M.NEON_CYAN]);
  return {
    name: 'DJ booth',
    build(v, s) {
      const L = s.len;
      const B = s.dep;
      sfill(v, s, 0, 2, 0, L, B, DESK, M.PLASTIC, 2);
      sfill(v, s, 0, 2, DESK, L, B, DESK + 1, M.METAL, 5);
      for (let a = 0; a < L; a++) sput(v, s, a, B - 1, DESK - 1, M.NEON_PINK, 6);
      const front: number[] = [];
      for (let h = 1; h < DESK - 1; h++) {
        for (let a = 1; a < L - 1; a++) {
          sput(v, s, a, B - 1, h, DARK, 1);
          front.push(sidx(v, s, a, B - 1, h));
        }
      }
      // decks: dark platters with a lit label, a tonearm; the mixer between
      const rings: number[][] = [];
      const decks: P3[] = [];
      for (const [a0, label] of [[1, M.NEON_CYAN], [L - 4, M.NEON_PINK]] as const) {
        sfill(v, s, a0, 3, DESK + 1, a0 + 3, 6, DESK + 2, DARK, 3);
        sput(v, s, a0 + 1, 4, DESK + 1, label, 7);
        rings.push(RING.map(([da, db]) => sidx(v, s, a0 + 1 + da, 4 + db, DESK + 1)));
        sput(v, s, a0 + 2, 3, DESK + 2, M.METAL, 6);
        decks.push({ x: wx(s, a0 + 1.5, 4.5), y: wy(s, a0 + 1.5, 4.5), z: s.z0 + DESK + 2 });
      }
      sfill(v, s, 4, 3, DESK + 1, L - 4, 6, DESK + 2, M.PLASTIC, 1);
      sput(v, s, 4, 4, DESK + 1, M.METAL, 7);
      sput(v, s, L - 5, 4, DESK + 1, M.METAL, 7);
      sput(v, s, 5, 3, DESK + 1, M.NEON_GREEN, 6);
      // laptop and monitors
      sfill(v, s, 4, 2, DESK + 1, L - 4, 3, DESK + 2, M.PLASTIC, 3);
      sfill(v, s, 4, 2, DESK + 2, L - 4, 3, DESK + 4, M.SCREEN, 5);
      for (const a of [0, L - 1]) {
        sfill(v, s, a, 2, DESK + 1, a + 1, 4, DESK + 4, M.PLASTIC, 1);
        sput(v, s, a, 3, DESK + 2, M.METAL, 6);
      }
      // the video wall: a steel frame flush with the bricks
      const wall: number[] = [];
      for (let a = -1; a <= L; a++) {
        for (let h = WALL0 - 1; h <= WALL0 + ROWS; h++) {
          const rim = a === -1 || a === L || h === WALL0 - 1 || h === WALL0 + ROWS;
          sput(v, s, a, -1, h, rim ? M.METAL : DARK, rim ? 4 : 1);
        }
      }
      // column-major from the screen-left, rows from the bottom
      for (let col = 0; col < L; col++) {
        const a = s.wall === 'left' ? L - 1 - col : col;
        for (let r = 0; r < ROWS; r++) wall.push(sidx(v, s, a, -1, WALL0 + r));
      }
      ST.set(v, { wall, cols: L, front, fcols: L - 2, rings, shine: 0, decks });
    },
    tick(c, s, active) {
      const fx = fxOf(c.v);
      fx.dj = active;
      const st = ST.get(c.v);
      if (!st) return;
      const v = c.v;
      const t = c.t;
      const k = kick(t);
      const b = beatOf(t);
      const bar = b >> 2;
      // the video wall: the spectrum while playing, a slow wave otherwise
      for (let col = 0; col < st.cols; col++) {
        let lvl = 0;
        let one = -1;
        if (active) {
          const bass = 1 - col / st.cols;
          lvl = Math.round(ROWS * clamp(0.1 + k * (0.3 + 0.5 * bass) + hash3(91, col, b, 0) * 0.4 + 0.08 * Math.sin(t * 9 + col * 1.7), 0, 1));
        } else {
          one = Math.round((ROWS - 1) * (0.5 + 0.4 * Math.sin(t * 1.6 - col * 0.55)));
        }
        for (let r = 0; r < ROWS; r++) {
          const f = r / ROWS;
          const m = active ? (r < lvl ? (f < 0.45 ? M.NEON_GREEN : f < 0.75 ? M.LED_AMBER : M.NEON_PINK) : DARK) : r === one ? M.NEON_PURPLE : r === one - 1 ? M.NEON_CYAN : DARK;
          swap(v, st.wall[col * ROWS + r], m, m === DARK ? 1 : 6, EQ);
        }
      }
      // the booth front: a kick meter, or a lone dot running along
      const rows = st.front.length / st.fcols;
      for (let r = 0; r < rows; r++) {
        for (let col = 0; col < st.fcols; col++) {
          const on = active ? r < k * (rows + 0.4) - 0.2 && (col + b) % 3 !== 0 : r === 1 && col === Math.floor(t * 5) % st.fcols;
          swap(v, st.front[r * st.fcols + col], on ? (active ? M.NEON_CYAN : M.NEON_PINK) : DARK, on ? 6 : 1, EQ);
        }
      }
      // the platters spin
      if (active) {
        const shine = Math.floor(t * 7) % 8;
        if (shine !== st.shine) {
          for (const ring of st.rings) {
            swap(v, ring[st.shine], DARK, 3, LIT);
            swap(v, ring[shine], M.METAL, 7, LIT);
          }
          st.shine = shine;
        }
      }
      const col = NEON_RGB[bar % 5];
      c.light({ x: wx(s, s.len / 2, s.dep + 1), y: wy(s, s.len / 2, s.dep + 1), z: s.z0 + DESK + 2, color: col, radius: active ? 24 : 16, intensity: active ? 0.45 + 0.6 * k : 0.3 + 0.15 * k });
      c.light({ x: wx(s, s.len / 2, 0.5), y: wy(s, s.len / 2, 0.5), z: s.z0 + WALL0 + ROWS / 2, color: active ? mix(col, WHITE, 0.3) : VIOLET, radius: 18, intensity: active ? 0.35 + 0.3 * k : 0.2 });
      if (active && beat(c, BEAT)) {
        for (const d of st.decks) {
          for (let n = 0; n < 4; n++) {
            glint(c, d.x, d.y, d.z, c.rng.pick(NEON_RGB), c.rng.range(0.5, 0.9), c.rng.range(-2, 2), c.rng.range(-2, 2), c.rng.range(3, 7));
          }
        }
      }
    },
  };
}

// read: the VIP booth. A tufted plum-velvet banquette with gold trim and
// arms, cushions, and VIP in purple neon over it. Reading there brings the
// champagne out: bubbles rising off the seat, a warmer light.
function vipBooth(): Prop {
  const BACK = 9;
  return {
    name: 'VIP booth',
    build(v, s) {
      const L = s.len;
      const B = s.dep;
      for (let a = 0; a < L; a++) {
        for (let h = 0; h < BACK; h++) sput(v, s, a, 0, h, M.CARPET, a % 3 === 1 && h % 3 === 2 ? 1 : h === BACK - 1 ? 6 : 4 + ((a >> 1) & 1));
        sput(v, s, a, 0, BACK, M.GOLD_ORE, 5);
      }
      sfill(v, s, 1, 1, 0, L - 1, B, 1, M.CARPET, 2);
      sfill(v, s, 1, 1, 1, L - 1, B, 2, M.CARPET, 6);
      for (const a of [0, L - 1]) {
        sfill(v, s, a, 0, 0, a + 1, B, 4, M.CARPET, 3);
        sfill(v, s, a, 0, 4, a + 1, B, 5, M.GOLD_ORE, 6);
      }
      for (const a of [2, L - 3]) {
        sput(v, s, a, 1, 2, M.CLOTH, 6);
        sput(v, s, a, 1, 3, M.CLOTH, 5);
      }
      slotText(v, s, 'VIP', BACK + 2, M.NEON_PURPLE);
    },
    tick(c, s, active) {
      const x = wx(s, s.len / 2, 1.5);
      const y = wy(s, s.len / 2, 1.5);
      c.light({ x, y, z: s.z0 + BACK + 4, color: active ? mix(VIOLET, AMBER, 0.4) : VIOLET, radius: active ? 22 : 16, intensity: active ? 0.55 : 0.3 + 0.05 * Math.sin(c.t * 2) });
      if (!active || !c.rng.chance(c.dt * 6)) return;
      const a = c.rng.range(2, s.len - 2);
      glint(c, wx(s, a, 2), wy(s, a, 2), s.z0 + 3, mix(AMBER, WHITE, 0.6), c.rng.range(0.8, 1.4), 0, 0, c.rng.range(2, 3.5));
    },
  };
}

// search: record crates, sleeves of every colour sticking out of them, and
// album covers on the wall under a picture light. Digging pulls one sleeve
// up after another.
function recordCrates(): Prop {
  type Sleeve = { a: number; b: number; m: number };
  type St = { sleeves: Sleeve[]; up: number };
  const ST = new WeakMap<Voxels, St>();
  // A sleeve stands at (a..a+1, b) from h 1 to 4; raised, from 3 to 6.
  const move = (v: Voxels, s: Slot, sl: Sleeve, up: boolean) => {
    const [from, to] = up ? [[1, 2], [5, 6]] : [[5, 6], [1, 2]];
    for (let a = sl.a; a < sl.a + 2; a++) {
      const ok = to.every((h) => v.get(wx(s, a, sl.b), wy(s, a, sl.b), s.z0 + h) === M.AIR) && from.every((h) => v.get(wx(s, a, sl.b), wy(s, a, sl.b), s.z0 + h) === sl.m);
      if (!ok) continue;
      for (const h of from) sput(v, s, a, sl.b, h, M.AIR);
      for (const h of to) sput(v, s, a, sl.b, h, sl.m, 4);
    }
  };
  return {
    name: 'record crates',
    build(v, s, rng) {
      const sleeves: Sleeve[] = [];
      const n = Math.floor(s.len / 4);
      for (let k = 0; k < n; k++) {
        const a0 = k * 4;
        const crate = k === 1 ? M.WOOD : M.PLASTIC;
        for (let h = 0; h < 4; h++) {
          for (let b = 0; b < 4; b++) {
            for (let a = a0; a < a0 + 4; a++) {
              const wallCell = h === 0 || a === a0 || a === a0 + 3 || b === 0 || b === 3;
              if (wallCell) sput(v, s, a, b, h, crate, h === 2 ? 1 : h === 3 ? 6 : 3);
            }
          }
        }
        for (const b of [1, 2]) {
          const m = rng.pick(SLEEVES);
          for (let a = a0 + 1; a < a0 + 3; a++) for (let h = 1; h <= 4; h++) sput(v, s, a, b, h, m, b === 2 ? 5 : 3);
          sleeves.push({ a: a0 + 1, b, m });
        }
      }
      // album covers on the wall, a picture light over them
      for (let k = 0; k < n; k++) {
        const a0 = k * 4 + 1;
        const h0 = k & 1 ? 11 : 8;
        const bg = rng.pick(SLEEVES);
        const fg = rng.pick(SLEEVES);
        for (let a = a0; a < a0 + 3; a++) {
          for (let h = h0; h < h0 + 3; h++) sput(v, s, a, -1, h, a === a0 + 1 && h === h0 + 1 ? fg : bg, a === a0 + 1 && h === h0 + 1 ? 6 : 3);
        }
      }
      sfill(v, s, 2, 0, 15, s.len - 2, 1, 16, M.METAL, 3);
      sfill(v, s, 3, 0, 14, s.len - 3, 1, 15, M.LAMP, 6);
      ST.set(v, { sleeves, up: -1 });
    },
    tick(c, s, active) {
      c.light({ x: wx(s, s.len / 2, 2), y: wy(s, s.len / 2, 2), z: s.z0 + 12, color: WARM, radius: 14, intensity: 0.3 });
      const st = ST.get(c.v);
      if (!st || !st.sleeves.length) return;
      if (!active) {
        if (st.up >= 0) move(c.v, s, st.sleeves[st.up], false);
        st.up = -1;
        return;
      }
      if (!beat(c, BEAT)) return;
      if (st.up >= 0) move(c.v, s, st.sleeves[st.up], false);
      st.up = c.rng.int(0, st.sleeves.length - 1);
      const sl = st.sleeves[st.up];
      move(c.v, s, sl, true);
      glint(c, wx(s, sl.a + 1, sl.b + 0.5), wy(s, sl.a + 1, sl.b + 0.5), s.z0 + 7, mix(PINK, WHITE, 0.5), 0.5, 0, 0, 1.5);
    },
  };
}

// run: the lighting desk, out front of house. A console with a cue screen,
// faders and a row of flash buttons, a flight case of blinking gear beside
// it, a truss behind with a row of par cans, and a little moving head on a
// stand. Running it chases the buttons and the cans and drives the whole
// rig harder: faster beams, more strobe.
function lightingDesk(): Prop {
  type St = { leds: Array<{ i: number; m: number; period: number; phase: number }>; screen: number[]; buttons: number[]; cans: number[]; lens: P3 };
  const ST = new WeakMap<Voxels, St>();
  const TRUSS = 13; // the truss's top bar
  return {
    name: 'lighting desk',
    build(v, s, rng) {
      const L = s.len;
      // the truss: a post at each end, a box bar across, par cans under it
      for (const a of [3, L - 1]) for (let h = 0; h < TRUSS; h++) sput(v, s, a, 0, h, M.METAL, h % 3 === 0 ? 6 : 3);
      for (let a = 3; a < L; a++) {
        sput(v, s, a, 0, TRUSS, M.METAL, a & 1 ? 5 : 3);
        sput(v, s, a, 1, TRUSS, M.METAL, a & 1 ? 3 : 5);
      }
      const cans: number[] = [];
      for (let a = 5; a < L - 1; a += 2) {
        sput(v, s, a, 1, TRUSS - 1, M.PLASTIC, 1);
        sput(v, s, a, 2, TRUSS - 1, DARK, 1);
        cans.push(sidx(v, s, a, 2, TRUSS - 1));
      }
      // the flight case
      const leds: St['leds'] = [];
      for (let h = 0; h < 10; h++) {
        for (let b = 1; b < 4; b++) {
          for (let a = 0; a < 3; a++) {
            const face = b === 3;
            const rim = h === 0 || h === 9 || (face && h % 3 === 0);
            sput(v, s, a, b, h, rim ? M.METAL : M.PLASTIC, rim ? 4 : 1);
            if (face && h % 3 === 2) {
              const m = rng.pick([M.LED_RED, M.LED_AMBER, M.NEON_GREEN, M.NEON_CYAN]);
              sput(v, s, a, b, h, m, 6);
              leds.push({ i: sidx(v, s, a, b, h), m, period: rng.range(0.4, 2.2), phase: rng.range(0, 3) });
            }
          }
        }
      }
      // the desk
      sfill(v, s, 3, 5, 0, L, 9, 4, M.PLASTIC, 2);
      sfill(v, s, 3, 4, 4, L, 9, 5, M.METAL, 5);
      for (let a = 3; a < L; a++) sput(v, s, a, 8, 4, M.NEON_PURPLE, 5);
      sfill(v, s, 3, 4, 5, L, 5, 9, M.PLASTIC, 1);
      const screen: number[] = [];
      for (let a = 4; a < L - 1; a++) {
        for (let h = 6; h < 9; h++) {
          sput(v, s, a, 5, h, M.SCREEN, 4);
          screen.push(sidx(v, s, a, 5, h));
        }
      }
      for (let a = 4; a < L - 1; a++) sput(v, s, a, 6, 5, M.METAL, a & 1 ? 7 : 3);
      const buttons: number[] = [];
      for (let a = 3; a < L; a++) {
        sput(v, s, a, 7, 5, DARK, 1);
        buttons.push(sidx(v, s, a, 7, 5));
      }
      // the moving head on its stand
      for (let h = 0; h < 7; h++) sput(v, s, 1, 8, h, M.METAL, h === 0 ? 2 : 4);
      sfill(v, s, 0, 7, 7, 2, 9, 9, M.PLASTIC, 2);
      sput(v, s, 1, 9, 8, M.LAMP, 7);
      ST.set(v, { leds, screen, buttons, cans, lens: { x: wx(s, 1.5, 9.5), y: wy(s, 1.5, 9.5), z: s.z0 + 8.5 } });
    },
    tick(c, s, active) {
      const fx = fxOf(c.v);
      fx.desk = active;
      const st = ST.get(c.v);
      if (!st) return;
      const v = c.v;
      const t = c.t;
      const b = beatOf(t);
      for (const l of st.leds) {
        const on = (t + l.phase) % l.period < l.period * (active ? 0.3 : 0.6);
        swap(v, l.i, on ? l.m : DARK, on ? 6 : 1, LIT);
      }
      if (c.rng.chance(c.dt * (active ? 40 : 4))) {
        const i = c.rng.pick(st.screen);
        swap(v, i, c.rng.chance(active ? 0.6 : 0.8) ? M.SCREEN : DARK, c.rng.int(3, 7), LIT);
      }
      const e = Math.floor(t / (BEAT / 2));
      st.buttons.forEach((i, n) => {
        const on = active ? (n + e) % 4 === 0 || kick(t) > 0.8 : n % 3 === 0;
        const m = NEON_MAT[(n + (b >> 2)) % 5];
        swap(v, i, on ? m : DARK, on ? 7 : 1, LIT);
      });
      // the cans: one colour a bar, chasing on the half beat when run
      st.cans.forEach((i, n) => {
        const on = active ? (n + e) % 2 === 0 : (n + (b >> 3)) % 3 === 0;
        swap(v, i, on ? NEON_MAT[mod((b >> 2) + n, 5)] : DARK, on ? 6 : 1, LIT);
      });
      const col = NEON_RGB[mod(b, 5)];
      c.light({ x: st.lens.x, y: st.lens.y, z: st.lens.z, color: col, radius: active ? 16 : 10, intensity: active ? 0.75 : 0.3 });
      c.light({ x: wx(s, s.len / 2 + 1, 7), y: wy(s, s.len / 2 + 1, 7), z: s.z0 + 8, color: CYAN, radius: 14, intensity: active ? 0.4 : 0.22 });
      if (active) {
        const a = Math.sin(t * 2.3) * 4;
        beam(c, st.lens, { x: wx(s, s.len / 2 + a, s.dep + 6), y: wy(s, s.len / 2 + a, s.dep + 6), z: s.z0 }, mix(col, [0, 0, 0], 0.4), 2);
      }
    },
  };
}

// web: a neon phone booth. Glass on two sides, neon down its front edges
// and round its roof, a lit sign on top, the phone inside. A call makes it
// ring: the neon flips colour on every half beat and rings spread out.
function phoneBooth(): Prop {
  type St = { posts: number[]; roof: number[]; phone: P3; flip: number };
  const ST = new WeakMap<Voxels, St>();
  const A0 = 2;
  const A1 = 6; // the booth spans a, b in A0..A1
  const TOP = 14;
  return {
    name: 'neon phone booth',
    build(v, s) {
      sfill(v, s, A0, A0, 0, A1 + 1, A1 + 1, 1, M.METAL, 3);
      const posts: number[] = [];
      for (let h = 1; h < TOP; h++) {
        sput(v, s, A0, A0, h, M.METAL, 3);
        sput(v, s, A1, A0, h, M.METAL, 3);
        for (const a of [A0, A1]) {
          sput(v, s, a, A1, h, M.NEON_PINK, 6);
          posts.push(sidx(v, s, a, A1, h));
        }
        for (let a = A0 + 1; a < A1; a++) sput(v, s, a, A0, h, M.PLASTIC, 2);
        for (let b = A0 + 1; b < A1; b++) {
          for (const a of [A0, A1]) sput(v, s, a, b, h, h === 1 || h === 7 ? M.METAL : M.GLASS, h === 7 ? 5 : 4);
        }
      }
      for (let a = A0 + 1; a < A1; a++) sput(v, s, a, A1, TOP - 1, M.METAL, 5);
      const roof: number[] = [];
      for (let b = A0; b <= A1; b++) {
        for (let a = A0; a <= A1; a++) {
          const edge = a === A0 || a === A1 || b === A0 || b === A1;
          sput(v, s, a, b, TOP, edge ? M.NEON_CYAN : M.METAL, edge ? 6 : 4);
          if (edge) roof.push(sidx(v, s, a, b, TOP));
        }
      }
      sfill(v, s, A0 + 1, A1 - 1, TOP + 1, A1, A1, TOP + 2, M.NEON_PINK, 7);
      sfill(v, s, A0 + 1, A0 + 1, TOP + 1, A1, A1 - 1, TOP + 2, M.PLASTIC, 2);
      sput(v, s, 4, 4, TOP - 1, M.LAMP, 6);
      // the phone
      for (let h = 6; h < 9; h++) sput(v, s, 4, A0 + 1, h, M.METAL, 5);
      sput(v, s, 4, A0 + 1, 8, M.LED_AMBER, 6);
      sput(v, s, 3, A0 + 1, 7, M.PLASTIC, 1);
      sput(v, s, 3, A0 + 1, 8, M.PLASTIC, 1);
      ST.set(v, { posts, roof, phone: { x: wx(s, 4.5, A0 + 2), y: wy(s, 4.5, A0 + 2), z: s.z0 + 7.5 }, flip: -1 });
    },
    tick(c, s, active) {
      const st = ST.get(c.v);
      if (!st) return;
      const flip = active ? Math.floor(c.t / (BEAT / 2)) & 1 : 0;
      if (flip !== st.flip) {
        for (const i of st.posts) swap(c.v, i, flip ? M.NEON_CYAN : M.NEON_PINK, 6, LIT);
        for (const i of st.roof) swap(c.v, i, flip ? M.NEON_PINK : M.NEON_CYAN, 6, LIT);
        st.flip = flip;
      }
      const k = kick(c.t);
      c.light({ x: st.phone.x, y: st.phone.y, z: s.z0 + 10, color: flip ? CYAN : PINK, radius: active ? 20 : 14, intensity: active ? 0.5 + 0.5 * k : 0.35 });
      if (active && beat(c, BEAT / 2)) {
        for (let n = 0; n < 10; n++) {
          const th = (n / 10) * Math.PI * 2;
          glint(c, st.phone.x, st.phone.y, st.phone.z, flip ? CYAN : PINK, 0.45, Math.cos(th) * 6, Math.sin(th) * 6, 0);
        }
      }
    },
  };
}

// think: the open-mic stage. A low platform edged with marquee bulbs, a
// truss frame of its own with a red velvet curtain hung from it under a
// fringed valance, a mic stand, a monitor wedge, a stool, the smoke
// machine, and a spotlight up on the truss. On stage the spotlight comes up
// full, the bulbs chase and notes drift off the mic.
function stage(): Prop {
  type St = { bulbs: number[]; lens: P3; mic: P3 };
  const ST = new WeakMap<Voxels, St>();
  const BULB = new Set<number>([M.LAMP, M.CANDLE]);
  const TOP = 14; // the truss's top bar
  return {
    name: 'open-mic stage',
    build(v, s) {
      const L = s.len;
      const B = s.dep;
      for (let a = 0; a < L; a++) {
        for (let b = 0; b < B; b++) {
          sput(v, s, a, b, 0, M.WOOD, 2);
          sput(v, s, a, b, 1, M.WOOD, a & 1 ? 5 : 4);
        }
      }
      const bulbs: number[] = [];
      for (let a = 1; a < L; a += 2) {
        sput(v, s, a, B - 1, 1, M.LAMP, 7);
        bulbs.push(sidx(v, s, a, B - 1, 1));
      }
      // the truss: a post at each end, a box bar across the top
      for (const a of [0, L - 1]) for (let h = 2; h < TOP; h++) sput(v, s, a, 0, h, M.METAL, h % 3 === 0 ? 6 : 3);
      for (let a = 0; a < L; a++) {
        sput(v, s, a, 0, TOP, M.METAL, a & 1 ? 5 : 3);
        sput(v, s, a, 1, TOP, M.METAL, a & 1 ? 3 : 5);
      }
      // the curtain, drawn back either side of a star cloth, and the valance
      const side = 3;
      for (let a = 1; a < L - 1; a++) {
        const drape = a < side || a >= L - side;
        for (let h = 2; h < TOP - 2; h++) {
          if (drape) {
            sput(v, s, a, 0, h, M.CLOTH, [2, 5, 3, 6][a & 3]);
            if (a === side - 1 || a === L - side) sput(v, s, a, 1, h, M.CLOTH, h & 1 ? 4 : 5);
          } else {
            const star = hash3(31, a, h, 0) < 0.08;
            sput(v, s, a, 0, h, star ? M.LAMP : DARK, star ? 3 : 1);
          }
        }
        sput(v, s, a, 0, TOP - 2, M.CLOTH, 6);
        sput(v, s, a, 1, TOP - 2, M.CLOTH, 7);
        sput(v, s, a, 0, TOP - 1, M.CLOTH, 5);
        sput(v, s, a, 1, TOP - 1, M.CLOTH, 6);
        if (!(a & 1)) sput(v, s, a, 1, TOP - 3, M.GOLD_ORE, 6);
      }
      // mic, wedge, stool
      const ma = L >> 1;
      sput(v, s, ma, 4, 2, M.METAL, 3);
      for (let h = 3; h < 9; h++) sput(v, s, ma, 4, h, M.METAL, 5);
      sput(v, s, ma, 4, 9, M.METAL, 6);
      sput(v, s, ma, 5, 9, M.METAL, 7);
      sfill(v, s, ma + 2, 5, 2, ma + 4, 6, 3, M.PLASTIC, 2);
      for (let h = 2; h < 5; h++) sput(v, s, 2, 3, h, M.METAL, 4);
      sput(v, s, 2, 3, 5, M.CARPET, 6);
      // the smoke machine, nozzle out to the room
      sfill(v, s, L - 2, 3, 2, L, 5, 4, M.METAL, 2);
      sput(v, s, L - 2, 5, 2, M.METAL, 6);
      sput(v, s, L - 1, 4, 3, M.LED_RED, 6);
      const out = s.wall === 'right' ? [0, 1] : [1, 0];
      fxOf(v).fog = { x: wx(s, L - 2, 6), y: wy(s, L - 2, 6), z: s.z0 + 2, dx: out[0], dy: out[1] };
      // the spotlight, clamped on the truss
      sfill(v, s, L - 3, 1, TOP + 1, L - 1, 2, TOP + 3, M.METAL, 3);
      sfill(v, s, L - 3, 2, TOP + 1, L - 1, 3, TOP + 2, M.LAMP, 7);
      ST.set(v, {
        bulbs,
        lens: { x: wx(s, L - 2, 3), y: wy(s, L - 2, 3), z: s.z0 + TOP + 1.5 },
        mic: { x: wx(s, ma + 0.5, 5.5), y: wy(s, ma + 0.5, 5.5), z: s.z0 + 9.5 },
      });
    },
    tick(c, s, active) {
      const fx = fxOf(c.v);
      fx.stage = active;
      const st = ST.get(c.v);
      if (!st) return;
      const e = Math.floor(c.t / (BEAT / 2));
      st.bulbs.forEach((i, n) => {
        const on = active ? (n + e) % 3 !== 0 : (n + Math.floor(c.t * 0.7)) % 7 !== 0;
        swap(c.v, i, on ? M.LAMP : M.CANDLE, on ? 7 : 2, BULB);
      });
      c.light({ x: st.mic.x, y: st.mic.y, z: s.z0 + 6, color: WARM, radius: active ? 22 : 14, intensity: active ? 1.0 : 0.35 });
      if (!active) return;
      beam(c, st.lens, { x: st.mic.x, y: st.mic.y, z: s.z0 + 2 }, mix(WARM, [0, 0, 0], 0.45), 1.6);
      if (c.rng.chance(c.dt * 4)) {
        const o = s.wall === 'right' ? [0, 1] : [1, 0];
        glint(c, st.mic.x, st.mic.y, st.mic.z, c.rng.chance(0.5) ? PINK : CYAN, c.rng.range(1.2, 2), o[0] * 1.5 + c.rng.range(-0.5, 0.5), o[1] * 1.5 + c.rng.range(-0.5, 0.5), c.rng.range(1.5, 2.5));
      }
    },
  };
}

// idle: the bar, an island out on the floor. A wooden counter all round
// with a steel top, a pink lip and a cyan glow along its foot, a glass case
// in the middle with a shelf of bottles showing over the counter under a
// pink neon crown, taps, glasses and a shaker on the front, and stools
// before it. Low enough to see the floor past. In use the shaker rattles
// and drinks get poured.
function bar(): Prop {
  type St = { bottles: number[]; tap: P3; shaker: P3 };
  const ST = new WeakMap<Voxels, St>();
  const FRONT = 5; // the counter's front run starts here; the case is behind it
  const SHELF = 5; // the case's bottle shelf, level with the counter top
  const CASE = 8; // the case's top
  return {
    name: 'bar',
    build(v, s, rng) {
      const L = s.len;
      // the counter: two deep at the back and sides, three at the front
      for (let a = 0; a < L; a++) {
        for (let b = 0; b < FRONT + 3; b++) {
          const ring = a < 2 || a >= L - 2 || b < 2 || b >= FRONT;
          const flap = b < 2 && a >= 6 && a < 9; // the way in, round the back
          if (!ring || flap) continue;
          const outer = a === 0 || a === L - 1 || b === 0 || b === FRONT + 2;
          for (let h = 0; h < 5; h++) sput(v, s, a, b, h, outer && h === 0 ? M.NEON_CYAN : M.WOOD, outer && h === 0 ? 5 : outer && a % 3 === 0 ? 1 : 3);
          if (b === FRONT + 2) sput(v, s, a, b, 4, M.NEON_PINK, 4);
          sput(v, s, a, b, 5, M.METAL, 6);
        }
      }
      // the case: steel shelves, glass all round, bottles sealed inside
      for (let a = 4; a < L - 4; a++) {
        for (let b = 2; b < FRONT; b++) {
          for (let h = 0; h <= CASE; h++) {
            const shelf = h === 0 || h === SHELF || h === CASE;
            sput(v, s, a, b, h, shelf ? M.METAL : M.GLASS, shelf ? 5 : 6);
          }
          sput(v, s, a, b, CASE + 1, M.NEON_PINK, 6);
        }
      }
      const bottles: number[] = [];
      for (let a = 5; a < L - 5; a += 2) {
        const m = rng.pick(LIQUORS);
        for (let h = SHELF + 1; h < SHELF + 1 + rng.int(1, 2); h++) {
          sput(v, s, a, 3, h, m);
          bottles.push(sidx(v, s, a, 3, h));
        }
      }
      // on the front run: glasses, the taps, the shaker
      sput(v, s, 2, FRONT + 1, 6, M.GLASS, 6);
      sput(v, s, 4, FRONT + 1, 6, M.GLASS, 6);
      for (let h = 6; h < 9; h++) sput(v, s, 6, FRONT, h, M.METAL, 4);
      sput(v, s, 6, FRONT + 1, 8, M.METAL, 6);
      sput(v, s, 6, FRONT, 9, M.GOLD_ORE, 6);
      sput(v, s, 9, FRONT + 1, 6, M.METAL, 7);
      sput(v, s, 9, FRONT + 1, 7, M.METAL, 6);
      // stools
      for (const a of [2, 5, L - 6, L - 3]) {
        for (let h = 0; h < 3; h++) sput(v, s, a, FRONT + 4, h, M.METAL, 4);
        sput(v, s, a, FRONT + 4, 3, M.CARPET, 6);
      }
      ST.set(v, {
        bottles,
        tap: { x: wx(s, 6.5, FRONT + 1.5), y: wy(s, 6.5, FRONT + 1.5), z: s.z0 + 8 },
        shaker: { x: wx(s, 9.5, FRONT + 1.5), y: wy(s, 9.5, FRONT + 1.5), z: s.z0 + 8 },
      });
    },
    tick(c, s, active) {
      const st = ST.get(c.v);
      const v = c.v;
      c.light({ x: wx(s, s.len / 2, 4), y: wy(s, s.len / 2, 4), z: s.z0 + 10, color: mix(AMBER, PINK, 0.5), radius: 22, intensity: 0.3 + 0.03 * Math.sin(c.t * 1.3) });
      if (!st) return;
      // liquor catches the light
      if (st.bottles.length && c.rng.chance(c.dt * 6)) {
        const i = c.rng.pick(st.bottles);
        const m = v.mat[i];
        if (m !== M.AIR && LIQUORS.includes(m)) v.set(i, m, c.rng.int(2, 7));
      }
      if (!active) return;
      if (beat(c, BEAT / 2)) {
        for (let n = 0; n < 3; n++) glint(c, st.shaker.x, st.shaker.y, st.shaker.z, SILVER, 0.3, c.rng.range(-2, 2), c.rng.range(-2, 2), c.rng.range(1, 3));
      }
      if (c.rng.chance(c.dt * 6)) {
        c.spawn({ kind: 'drop', x: st.tap.x, y: st.tap.y, z: st.tap.z - 0.6, vx: 0, vy: 0, vz: 0, life: 0.4, color: AMBER, glow: false, gravity: 20 });
      }
    },
  };
}

// entrance: the club door. Black double doors set back in the bricks under
// a pink neon frame, a red carpet out of the recess, a velvet rope on brass
// posts and the bouncer's light: red, green while someone comes or goes,
// when the doors swing open on a lamp-lit corridor.
function clubDoor(): Prop {
  type St = { leaf: Array<[number, number, number]>; lamp: number; mid: P3 };
  const ST = new WeakMap<Voxels, St>();
  const A0 = 2;
  const A1 = 10; // the opening, inclusive
  const TALL = 14;
  const SIGNAL = new Set<number>([M.LED_RED, M.NEON_GREEN]);
  return {
    name: 'club door',
    build(v, s) {
      const deep = wallOf(s) - 2; // carve no deeper than this
      for (let a = A0; a <= A1; a++) {
        for (let h = 0; h < TALL; h++) for (let b = -1; b >= -deep; b--) sput(v, s, a, b, h, M.AIR);
        for (let b = -deep; b < 4; b++) sput(v, s, a, b, -1, M.CARPET, b >= 0 ? 3 : 2);
      }
      // the corridor's lamps at the far end
      for (let a = A0 + 1; a < A1; a++) for (let h = 9; h < 12; h++) sput(v, s, a, -deep - 1, h, M.LAMP, 5);
      // the doors
      const leaf: St['leaf'] = [];
      const lb = -Math.min(3, deep);
      for (let a = A0; a <= A1; a++) {
        for (let h = 0; h < TALL; h++) {
          let m: number = M.PLASTIC;
          let sh = 2 + ((a + h) & 1);
          if (a === 6) [m, sh] = [DARK, 0];
          else if (h === 6 && a !== A0 && a !== A1) [m, sh] = [M.METAL, 6];
          else if ((h === 10 || h === 11) && (a === 4 || a === 8)) [m, sh] = [M.GLASS, 5];
          sput(v, s, a, lb, h, m, sh);
          leaf.push([sidx(v, s, a, lb, h), m, sh]);
        }
      }
      // steel frame in the recess, neon round the opening
      for (let b = lb + 1; b < 0; b++) {
        for (let h = 0; h <= TALL; h++) {
          sput(v, s, A0 - 1, b, h, M.METAL, 4);
          sput(v, s, A1 + 1, b, h, M.METAL, 4);
        }
        for (let a = A0; a <= A1; a++) sput(v, s, a, b, TALL, M.METAL, 5);
      }
      for (let h = 0; h <= TALL + 1; h++) {
        sput(v, s, A0 - 1, 0, h, M.NEON_PINK, 6);
        sput(v, s, A1 + 1, 0, h, M.NEON_PINK, 6);
      }
      for (let a = A0; a <= A1; a++) sput(v, s, a, 0, TALL + 1, M.NEON_PINK, 6);
      // the bouncer's light
      const la = A1 + 3;
      sfill(v, s, la - 1, -1, 10, la + 2, 0, 13, M.METAL, 3);
      sput(v, s, la, 0, 11, M.LED_RED, 7);
      // the velvet rope
      for (const a of [A1 + 2, s.len - 1]) {
        for (let h = 0; h < 4; h++) sput(v, s, a, 3, h, M.GOLD_ORE, 4);
        sput(v, s, a, 3, 4, M.GOLD_ORE, 7);
      }
      for (let a = A1 + 3; a < s.len - 1; a++) sput(v, s, a, 3, a === A1 + 3 || a === s.len - 2 ? 3 : 2, M.CARPET, 5);
      ST.set(v, { leaf, lamp: sidx(v, s, la, 0, 11), mid: { x: wx(s, 6.5, 0), y: wy(s, 6.5, 0), z: s.z0 + 7 } });
    },
    tick(c, s, active) {
      const st = ST.get(c.v);
      if (!st) return;
      const v = c.v;
      for (const [i, m, sh] of st.leaf) {
        if (active && v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
        else if (!active && v.mat[i] === M.AIR) v.set(i, m, sh);
      }
      swap(v, st.lamp, active ? M.NEON_GREEN : M.LED_RED, 7, SIGNAL);
      const lx = wx(s, 13, 1);
      const ly = wy(s, 13, 1);
      c.light({ x: lx, y: ly, z: s.z0 + 11, color: active ? GREEN : RED, radius: 12, intensity: 0.55 });
      c.light({ x: st.mid.x, y: st.mid.y, z: st.mid.z, color: active ? WARM : PINK, radius: active ? 22 : 16, intensity: active ? 0.8 : 0.3 + 0.1 * kick(c.t) });
    },
  };
}

const PROPS: Record<SlotKind, Prop> = {
  write: djBooth(),
  read: vipBooth(),
  search: recordCrates(),
  run: lightingDesk(),
  web: phoneBooth(),
  think: stage(),
  idle: bar(),
  entrance: clubDoor(),
};

// ── generate ─────────────────────────────────────────────────────────────
function generate(v: Voxels, L: Layout, rng: Rng): void {
  clear(v);
  const fx = blank();
  FIXTURES.set(v, fx);
  const P = plan(L);
  const seed = rng.int(0, 0x3fffffff);
  shell(v, L, seed);
  danceFloor(v, L, P, fx);
  for (const s of L.slots) PROPS[s.kind].build(v, s, rng);
  signs(v, L, P, rng, fx);
  rig(v, L, P, fx);
  stripe(v, L, fx);
  zones(v, L, P, fx);
  speakers(v, L, P, fx);
  housecat(v, L, P, fx);
  for (const t of P.tables) table(v, L, t);
  mirrorBall(v, L, P, fx);
  litter(v, L, rng, P);
}

// Empties a reused world.
function clear(v: Voxels): void {
  for (let i = 0; i < v.size; i++) if (v.mat[i] !== M.AIR) v.set(i, M.AIR, 0, 0);
}

// Brickwork in running bond, 5 x 2 bricks in black mortar.
function brick(seed: number, a: number, z: number): [number, number] {
  const course = Math.floor(z / 3);
  const off = (course & 1) * 3;
  if (z % 3 === 0 || (a + off) % 6 === 0) return [M.ROCK_DARK, 2];
  return [M.BRICK, 1 + Math.floor(hash3(seed, Math.floor((a + off) / 6), course, 7) * 6)];
}

// The walls in brick all through (so the cut ends show it too) with a
// concrete cap and a black skirting; the floor polished concrete, scored
// into big slabs.
function shell(v: Voxels, L: Layout, seed: number): void {
  const { W, D, H, T, floor } = L;
  for (let z = 0; z < H; z++) {
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        const wall = x < T || y < T;
        if (!wall && z >= floor) continue;
        const i = v.idx(x, y, z);
        if (wall) {
          if (z === H - 1) {
            v.set(i, M.CONCRETE, 2 + ((x + y) & 1));
            continue;
          }
          const face = (x === T - 1 && y >= T - 1) || (y === T - 1 && x >= T - 1);
          if (face && z >= floor && z < floor + 2) {
            v.set(i, M.PLASTIC, z === floor ? 1 : 3);
            continue;
          }
          const [m, sh] = brick(seed, x < T ? y + (T - 1 - x) : x + (T - 1 - y), z);
          v.set(i, m, sh);
        } else if (z === floor - 1) {
          const seam = (x - T) % 16 === 0 || (y - T) % 16 === 0;
          v.set(i, M.CONCRETE, seam ? 0 : 3 + Math.floor(hash3(seed, x >> 2, y >> 2, 3) * 3));
        } else {
          v.set(i, M.CONCRETE, 1);
        }
      }
    }
  }
}

// The dance floor: tiles in dark grout, a cyan edge round it. Each tile's
// middle lights up in neon when the pattern says so (see stepDance).
function danceFloor(v: Voxels, L: Layout, P: Plan, fx: Fx): void {
  const d = P.dance;
  if (d.n < 2) return;
  const z = L.floor - 1;
  for (let y = d.y0 - 1; y <= d.y0 + d.size; y++) {
    for (let x = d.x0 - 1; x <= d.x0 + d.size; x++) {
      const edge = x === d.x0 - 1 || y === d.y0 - 1 || x === d.x0 + d.size || y === d.y0 + d.size;
      if (edge) {
        v.put(x, y, z, M.NEON_CYAN, 5);
        continue;
      }
      const gx = (x - d.x0) % d.p;
      const gy = (y - d.y0) % d.p;
      v.put(x, y, z, gx === 0 || gy === 0 ? DARK : M.TILE, gx === 0 || gy === 0 ? 2 : gx === 1 || gy === 1 ? 3 : 5);
    }
  }
  const k = d.p - 3;
  const cells = new Int32Array(d.n * d.n * k * k);
  let q = 0;
  for (let iy = 0; iy < d.n; iy++) {
    for (let ix = 0; ix < d.n; ix++) {
      for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) cells[q++] = v.idx(d.x0 + ix * d.p + 2 + dx, d.y0 + iy * d.p + 2 + dy, z);
    }
  }
  fx.dance = { x0: d.x0, y0: d.y0, n: d.n, p: d.p, k, cx: d.cx, cy: d.cy, cells, cur: new Uint8Array(d.n * d.n), next: 0 };
}

// Neon on the walls: ANIMUS big on the right wall in a purple frame,
// 128 BPM on the left one, and a martini out toward the front of a wall
// where there is room.
function signs(v: Voxels, L: Layout, P: Plan, rng: Rng, fx: Fx): void {
  const { T, W, D, floor } = L;
  const s = P.s;
  const fit = (pic: Pic, sc: number) => {
    const hgt = pic.rows * sc;
    const margin = Math.max(0, Math.min(sc, Math.floor((P.zone - hgt) / 2)));
    return { h0: ZONE0 + Math.floor((P.zone - hgt) / 2), margin, w: pic.w * sc, hgt };
  };
  const spans: Array<[Side, number, number]> = [];

  const name = textPic('ANIMUS');
  if (P.zone >= 5) {
    const f = fit(name, s);
    const left = Math.round((T + W) / 2 - f.w / 2);
    const cells = neonOnWall(v, L, 'right', left, f.h0, name, s, () => M.NEON_PINK, M.NEON_PURPLE, f.margin);
    const pick = [...cells.values()];
    if (pick.length) fx.flaky = { cells: rng.pick(pick), on: true };
    spans.push(['right', left - f.margin - 2, left + f.w + f.margin + 2]);
    const [x, y] = onWall(L, 'right', left + f.w / 2, 2);
    fx.halos.push({ x, y, z: floor + f.h0 + f.hgt / 2, color: PINK, r: Math.min(40, 10 + f.w / 2), k: 0.16 });
  }

  const bpm = textPic('128 BPM');
  if (P.zone >= 5) {
    const bs = Math.max(1, s - 1);
    const f = fit(bpm, bs);
    const left = Math.round((T + D) / 2 + f.w / 2);
    neonOnWall(v, L, 'left', left, f.h0, bpm, bs, () => M.NEON_CYAN, M.NEON_PINK, f.margin);
    spans.push(['left', left - f.w - f.margin - 2, left + f.margin + 2]);
    const [x, y] = onWall(L, 'left', left - f.w / 2, 2);
    fx.halos.push({ x, y, z: floor + f.h0 + f.hgt / 2, color: CYAN, r: Math.min(36, 8 + f.w / 2), k: 0.16 });
  }

  // the martini: the free stretch nearest the front of either wall
  const glass = artPic(MARTINI);
  const ms = Math.min(3, s);
  if (P.zone >= glass.rows * ms) {
    const f = fit(glass, ms);
    let at: [Side, number] | null = null;
    for (const wall of SIDES) {
      const end = wall === 'right' ? W : D;
      for (let lo = end - f.w - 4; lo > T + 2; lo--) {
        if (spans.some(([w, s0, s1]) => w === wall && lo < s1 && lo + f.w > s0)) continue;
        if (!at || lo > at[1]) at = [wall, lo];
        break;
      }
    }
    if (at) {
      const [wall, lo] = at;
      const left = wall === 'right' ? lo : lo + f.w - 1;
      neonOnWall(v, L, wall, left, f.h0, glass, ms, (tag) => (tag === 'o'.charCodeAt(0) ? M.NEON_GREEN : M.NEON_CYAN), null, 0);
    }
  }
}

// Moving heads hung at the top of the walls, over the props there (where
// nobody walks underneath) but the DJ's (the mirror ball hangs there), and
// a strobe flat on each wall near the back corner.
function rig(v: Voxels, L: Layout, P: Plan, fx: Fx): void {
  const hb = P.top - 1; // brackets
  for (const s of [...slotsOn(L, 'left'), ...slotsOn(L, 'right')]) {
    if (s.kind === 'write' || s.dep < 4) continue;
    const a = Math.floor(s.len / 2);
    for (let b = 0; b < 3; b++) sput(v, s, a, b, hb, M.METAL, 4);
    for (let da = -1; da <= 1; da++) for (let b = 1; b < 3; b++) sput(v, s, a + da, b, hb - 1, M.PLASTIC, 2);
    sput(v, s, a, 3, hb - 1, M.PLASTIC, 1);
    sput(v, s, a, 3, hb - 2, M.LAMP, 7);
    fx.heads.push({ x: wx(s, a + 0.5, 3.5), y: wy(s, a + 0.5, 3.5), z: s.z0 + hb - 1.5 });
  }
  for (const wall of SIDES) {
    const a = L.T + 3;
    const cells: number[] = [];
    for (let da = 0; da < 2; da++) {
      for (let dh = 0; dh < 2; dh++) {
        const [bx, by] = onWall(L, wall, a + da, -1);
        const [lx, ly] = onWall(L, wall, a + da, 0);
        v.put(bx, by, L.floor + hb - 1 - dh, M.METAL, 3);
        v.put(lx, ly, L.floor + hb - 1 - dh, M.METAL, 5);
        cells.push(v.idx(lx, ly, L.floor + hb - 1 - dh));
      }
    }
    const [x, y] = onWall(L, wall, a + 1, 1);
    fx.strobes.push({ x, y, z: L.floor + hb - 1, cells });
  }
}

// A neon strip along both walls at STRIPE, wherever the face is bare:
// purple on the right wall, cyan on the left, washing the bricks.
function stripe(v: Voxels, L: Layout, fx: Fx): void {
  for (const wall of SIDES) {
    const end = wall === 'left' ? L.D : L.W;
    const m = wall === 'right' ? M.NEON_PURPLE : M.NEON_CYAN;
    const z = L.floor + STRIPE;
    for (let a = L.T + 12; a < end - 6; a += 26) {
      const [x, y] = onWall(L, wall, a, 3);
      fx.halos.push({ x, y, z: z - 4, color: wall === 'right' ? VIOLET : mix(CYAN, VIOLET, 0.5), r: 30, k: 0.14 });
    }
    for (let a = L.T; a < end; a++) {
      const [x, y] = onWall(L, wall, a, 0);
      const [fx, fy] = onWall(L, wall, a, -1);
      const [ox, oy] = onWall(L, wall, a, 1);
      const bare = v.get(x, y, z) === M.AIR && v.get(x, y, z + 1) === M.AIR && v.get(x, y, z - 1) === M.AIR && v.get(ox, oy, z) === M.AIR;
      const face = v.get(fx, fy, z);
      if (bare && (face === M.BRICK || face === M.ROCK_DARK)) v.put(x, y, z, m, 5);
    }
  }
}

// Speaker stacks either side of the DJ: a sub and a top, woofers in black
// with steel caps that pump on the kick.
function speakers(v: Voxels, L: Layout, P: Plan, fx: Fx): void {
  for (const b of P.speakers) {
    const tall = L.W >= 120 ? 13 : 10;
    const split = Math.floor(tall / 2);
    const front = b.o0 + b.dep - 1;
    const z0 = L.floor + (b.z ?? 0);
    const put = (a: number, o: number, h: number, m: number, sh: number) => {
      const [x, y] = onWall(L, b.wall, a, o);
      v.put(x, y, z0 + h, m, sh);
    };
    for (let h = 0; h < tall; h++) {
      for (let o = b.o0; o <= front; o++) for (let a = b.a0; a < b.a0 + b.w; a++) put(a, o, h, M.PLASTIC, h === split ? 0 : 2);
    }
    const mid = b.a0 + (b.w - 1) / 2;
    const rad = (b.w - 1) / 2 - 0.4;
    for (const hc of [Math.floor(split / 2) + 0.5, split + Math.floor((tall - split) / 2) - 0.5]) {
      for (let a = b.a0; a < b.a0 + b.w; a++) {
        for (let h = Math.floor(hc - rad - 1); h <= Math.ceil(hc + rad + 1); h++) {
          const d = Math.hypot(a - mid, h - hc);
          if (d <= rad) put(a, front, h, d < 1 ? M.METAL : DARK, d < 1 ? 6 : 1 + Math.round(d));
        }
      }
      const [x, y] = onWall(L, b.wall, Math.round(mid), front + 1);
      const z = z0 + Math.round(hc);
      fx.cones.push({ x: x + 0.5, y: y + 0.5, z: z + 0.5, i: v.idx(x, y, z) });
    }
    put(Math.round(mid), front, tall - 2, M.METAL, 7);
  }
}

// The club cat: black, green-eyed, lying with its tail out behind it,
// facing +a in whatever frame `put` draws in (origin at its tail end).
function drawCat(put: (a: number, b: number, h: number, m: number, sh: number) => number): { eyes: number[]; tail: [number, number] } {
  for (let a = 1; a < 4; a++) for (let b = 0; b < 2; b++) put(a, b, 0, DARK, 2);
  for (let a = 2; a < 4; a++) for (let b = 0; b < 2; b++) put(a, b, 1, DARK, 3);
  put(3, 0, 2, DARK, 4);
  put(3, 1, 2, DARK, 4);
  put(4, 0, 0, DARK, 3);
  put(4, 1, 0, DARK, 3);
  const eyes = [put(4, 0, 1, M.NEON_GREEN, 6), put(4, 1, 1, M.NEON_GREEN, 6)];
  put(0, 1, 0, DARK, 2);
  const tail: [number, number] = [put(0, 2, 0, DARK, 3), put(0, 2, 1, M.AIR, 0)];
  return { eyes, tail };
}

// The cat's spot: a plum pouf in a quiet gap of the wall with a ball of
// yarn, or failing that the far end of the bar counter.
function housecat(v: Voxels, L: Layout, P: Plan, fx: Fx): void {
  const b = P.cat;
  if (b) {
    for (let a = b.a0; a < b.a0 + b.w; a++) {
      for (let o = b.o0; o < b.o0 + b.dep; o++) {
        const [x, y] = onWall(L, b.wall, a, o);
        const rim = a === b.a0 || a === b.a0 + b.w - 1 || o === b.o0 || o === b.o0 + b.dep - 1;
        v.put(x, y, L.floor, M.CARPET, rim ? 3 : 6);
      }
    }
    const [yx, yy] = onWall(L, b.wall, b.a0 + b.w, b.o0 + b.dep - 1);
    v.put(yx, yy, L.floor, M.CLOTH, 6);
    fx.cat = drawCat((a, o, h, m, sh) => {
      const [x, y] = onWall(L, b.wall, b.a0 + a, b.o0 + o);
      const z = L.floor + 1 + h;
      v.put(x, y, z, m, sh);
      return v.idx(x, y, z);
    });
    return;
  }
  const s = L.slots.find((k) => k.kind === 'idle');
  if (!s) return;
  fx.cat = drawCat((a, b2, h, m, sh) => {
    sput(v, s, s.len - 5 + a, 5 + b2, 6 + h, m, sh);
    return sidx(v, s, s.len - 5 + a, 5 + b2, 6 + h);
  });
}

// A cocktail table: a steel post, a round top, a glass and a tea light.
function table(v: Voxels, L: Layout, b: Box): void {
  const ca = b.a0 + 1;
  const co = b.o0 + 1;
  const at = (a: number, o: number, h: number, m: number, sh: number) => {
    const [x, y] = onWall(L, b.wall, a, o);
    v.put(x, y, L.floor + h, m, sh);
  };
  at(ca, co, 0, M.METAL, 2);
  for (let h = 1; h < 6; h++) at(ca, co, h, M.METAL, 4);
  for (let da = -1; da <= 1; da++) for (let d = -1; d <= 1; d++) if (da * d === 0 || Math.abs(da) + Math.abs(d) < 2) at(ca + da, co + d, 6, M.METAL, 6);
  for (const [da, d] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) at(ca + da, co + d, 6, M.METAL, 5);
  at(ca, co, 7, M.LAMP, 6);
  at(ca + 1, co - 1, 7, M.GLASS, 6);
}

// The mirror ball over the DJ booth, on a chain from the dark above.
function mirrorBall(v: Voxels, L: Layout, P: Plan, fx: Fx): void {
  if (!P.ball) return;
  const { x, y, z, r } = P.ball;
  const cells: number[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy + dz * dz > (r + 0.4) * (r + 0.4)) continue;
        v.put(x + dx, y + dy, z + dz, M.METAL, 3 + Math.floor(hash3(5, dx, dy, dz) * 5));
        cells.push(v.idx(x + dx, y + dy, z + dz));
      }
    }
  }
  for (let zz = z + r + 1; zz < L.H; zz++) v.put(x, y, zz, M.METAL, zz & 1 ? 2 : 6);
  fx.ball = { x: x + 0.5, y: y + 0.5, z: z + 0.5, cells };
}

// Last night's leftovers on the open floor: flyers, a plastic cup, a
// glow stick still glowing. Never on the walkways, plazas or dance floor.
function litter(v: Voxels, L: Layout, rng: Rng, P: Plan): void {
  const { W, D, T, floor } = L;
  const d = P.dance;
  const spots = new Set(pois(L).map((p) => Math.round(p.x) + W * Math.round(p.y)));
  const open = (x: number, y: number) => {
    if (x < T + 1 || y < T + 1 || x >= W - 1 || y >= D - 1 || P.keep[x + W * y] || P.decor[x + W * y]) return false;
    const r = P.rug;
    if (r && x >= r.x0 - 1 && x <= r.x0 + r.w && y >= r.y0 - 1 && y <= r.y0 + r.d) return false;
    if (x >= d.x0 - 2 && x <= d.x0 + d.size + 1 && y >= d.y0 - 2 && y <= d.y0 + d.size + 1) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (spots.has(x + dx + W * (y + dy))) return false;
    return v.get(x, y, floor) === M.AIR && v.get(x, y, floor - 1) !== M.AIR;
  };
  for (let n = Math.round((W * D) / 1200); n > 0; n--) {
    const x = rng.int(T + 1, W - 2);
    const y = rng.int(T + 1, D - 2);
    if (!open(x, y)) continue;
    const r = rng.next();
    if (r < 0.45) {
      v.put(x, y, floor, M.PAPER, rng.int(2, 7));
    } else if (r < 0.7) {
      v.put(x, y, floor, M.GLASS, 6);
    } else {
      const m = rng.pick([M.NEON_GREEN, M.NEON_PINK, M.NEON_CYAN]);
      v.put(x, y, floor, m, 4);
      if (open(x + 1, y)) v.put(x + 1, y, floor, m, 4);
    }
  }
}

// ── zones ────────────────────────────────────────────────────────────────
// The furniture of the floor plan (see plan()), in world coordinates.
function box(v: Voxels, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number, shade?: number): void {
  for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) v.put(x, y, z, m, shade);
}

function zones(v: Voxels, L: Layout, P: Plan, fx: Fx): void {
  const f = L.floor;
  // The DJ riser: a black stage deck in the back corner, lit along its edge.
  if (P.riser) {
    const c = P.riser;
    for (let y = L.T; y < c - L.T; y++) {
      for (let x = L.T; x < c - y; x++) {
        const edge = x + y === c - 1;
        box(v, x, y, f, x + 1, y + 1, f + RISER_H - 1, M.PLASTIC, 1);
        const seam = (x - L.T) % 6 === 0 || (y - L.T) % 6 === 0;
        v.put(x, y, f + RISER_H - 1, edge ? M.NEON_CYAN : M.PLASTIC, edge ? 6 : seam ? 1 : 3);
      }
    }
    const m = (c - 2 * L.T) / 3;
    fx.halos.push({ x: L.T + m, y: L.T + m, z: f + RISER_H + 4, color: CYAN, r: 26, k: 0.22 });
  }
  // The VIP deck: plum carpet a few voxels up on a dark plinth, a pink
  // neon edge and a brass rail.
  if (P.deck) {
    const { x0, y0 } = P.deck;
    for (let y = y0; y < L.D; y++) {
      for (let x = x0; x < L.W; x++) {
        box(v, x, y, f, x + 1, y + 1, f + DECK_H - 1, M.PLASTIC, 1);
        const edge = x === x0 || y === y0;
        const band = x === x0 + 1 || y === y0 + 1;
        v.put(x, y, f + DECK_H - 1, edge ? M.NEON_PINK : band ? M.GOLD_ORE : M.CARPET, edge ? 6 : band ? 4 : 3 + ((x + y) % 5 === 0 ? 3 : 0));
        if (!edge) continue;
        if ((x - x0 + y - y0) % 3 === 0) for (let h = 0; h < 2; h++) v.put(x, y, f + DECK_H + h, M.GOLD_ORE, 3);
        v.put(x, y, f + DECK_H + 2, M.GOLD_ORE, 6);
      }
    }
    fx.halos.push({ x: (x0 + L.W) / 2, y: (y0 + L.D) / 2, z: f + DECK_H + 6, color: mix(PINK, AMBER, 0.35), r: 30, k: 0.25 });
  }
  // The lounge rug: plum, a red border, a purple neon edge set in the floor.
  if (P.rug) {
    const { x0, y0, w, d } = P.rug;
    for (let y = y0; y < y0 + d; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const e = Math.min(x - x0, y - y0, x0 + w - 1 - x, y0 + d - 1 - y);
        v.put(x, y, f - 1, e === 0 ? M.NEON_PURPLE : e === 1 ? M.CLOTH : M.CARPET, e === 0 ? 4 : e === 1 ? 3 : 2 + ((x + y) % 4 === 0 ? 2 : 0));
      }
    }
    fx.halos.push({ x: x0 + w / 2, y: y0 + d / 2, z: f + 8, color: VIOLET, r: Math.min(40, 10 + w / 2), k: 0.2 });
  }
  for (const it of P.items) item(v, L, it, fx);
}

// A local frame for an item that faces somewhere: `a` across its face,
// `b` from its back towards the way it faces.
function facing(it: Item): (a: number, b: number) => [number, number] {
  switch (it.face) {
    case 'y+':
      return (a, b) => [it.x0 + a, it.y0 + b];
    case 'y-':
      return (a, b) => [it.x0 + a, it.y0 + it.d - 1 - b];
    case 'x+':
      return (a, b) => [it.x0 + b, it.y0 + a];
    default:
      return (a, b) => [it.x0 + it.w - 1 - b, it.y0 + a];
  }
}

function item(v: Voxels, L: Layout, it: Item, fx: Fx): void {
  const z = L.floor + it.z;
  const { x0, y0, w, d } = it;
  const across = it.face[0] === 'y' ? w : d;
  const deep = it.face[0] === 'y' ? d : w;
  const at = facing(it);
  const put = (a: number, b: number, h: number, m: number, sh: number) => {
    const [x, y] = at(a, b);
    v.put(x, y, z + h, m, sh);
  };
  const tone = Math.floor(hash3(77, x0, y0, 1) * 5);
  switch (it.kind) {
    case 'table':
      v.put(x0 + 1, y0 + 1, z, M.METAL, 2);
      for (let h = 1; h < 5; h++) v.put(x0 + 1, y0 + 1, z + h, M.METAL, 4);
      box(v, x0, y0, z + 5, x0 + 3, y0 + 3, z + 6, M.METAL, 6);
      if (tone < 2) v.put(x0 + 1, y0 + 1, z + 6, M.LED_AMBER, 3);
      v.put(x0 + 2, y0, z + 6, M.GLASS, 6);
      if (tone > 2) v.put(x0, y0 + 2, z + 6, M.GLASS, 5);
      return;
    case 'plant':
      box(v, x0, y0, z, x0 + 2, y0 + 2, z + 2, M.PLASTIC, 2);
      box(v, x0, y0, z + 2, x0 + 2, y0 + 2, z + 5, M.LEAF, 2);
      for (const [dx, dy, dh] of [[-1, 0, 3], [2, 1, 4], [1, -1, 4], [0, 2, 3], [1, 1, 5], [0, 0, 5]] as const) {
        if (hash3(78, x0 + dx, y0 + dy, dh) < 0.75) v.put(x0 + dx, y0 + dy, z + dh, M.LEAF, 3 + dh - 2);
      }
      return;
    case 'totem': {
      for (let h = 0; h < 5; h++) v.put(x0, y0, z + h, M.METAL, h === 0 ? 2 : 4);
      const m = NEON_MAT[tone];
      v.put(x0, y0, z + 5, m, 6);
      v.put(x0, y0, z + 6, m, 7);
      return;
    }
    case 'stool':
      for (let h = 0; h < 3; h++) v.put(x0, y0, z + h, M.METAL, 4);
      v.put(x0, y0, z + 3, M.CARPET, 6);
      return;
    case 'lamp':
      for (let h = 0; h < 7; h++) v.put(x0, y0, z + h, M.METAL, h ? 4 : 2);
      v.put(x0, y0, z + 7, M.LAMP, 6);
      v.put(x0, y0, z + 8, M.CLOTH, 6);
      return;
    case 'coffee':
      for (const [dx, dy] of [[0, 0], [w - 1, 0], [0, d - 1], [w - 1, d - 1]]) box(v, x0 + dx, y0 + dy, z, x0 + dx + 1, y0 + dy + 1, z + 2, M.METAL, 3);
      box(v, x0, y0, z + 2, x0 + w, y0 + d, z + 3, M.GLASS, 5);
      v.put(x0 + (w >> 1), y0 + (d >> 1), z + 3, M.LAMP, 4);
      return;
    case 'sofa':
      for (let a = 0; a < across; a++) {
        const arm = a === 0 || a === across - 1;
        for (let h = 0; h < 4; h++) put(a, 0, h, M.CARPET, h === 3 ? 6 : a % 3 === 1 && h === 2 ? 1 : 4);
        for (let b = 1; b < deep; b++) {
          put(a, b, 0, M.CARPET, 2);
          put(a, b, 1, M.CARPET, arm ? 3 : 6);
          if (arm) put(a, b, 2, M.CARPET, 4);
        }
      }
      return;
    case 'booth':
      for (let a = 0; a < across; a++) {
        for (let h = 0; h < 5; h++) put(a, 0, h, M.CARPET, h === 4 ? 6 : a % 3 === 1 && h % 2 ? 1 : 4);
        put(a, 0, 5, M.NEON_PINK, 5);
        for (let b = 1; b < deep - 1; b++) {
          const side = a === 0 || a === across - 1;
          if (side) {
            for (let h = 0; h < 3; h++) put(a, b, h, M.CARPET, h === 2 ? 5 : 3);
          } else if (b < 3) {
            put(a, b, 0, M.CARPET, 2);
            put(a, b, 1, M.CARPET, 6);
          }
        }
      }
      for (let a = (across >> 1) - 2; a < (across >> 1) + 2; a++) for (let b = 3; b < 5; b++) put(a, b, 3, M.METAL, 6);
      for (let h = 0; h < 3; h++) put(across >> 1, 4, h, M.METAL, 3);
      put(across >> 1, 4, 4, M.LAMP, 5);
      return;
    case 'column': {
      const tall = Math.min(L.H - L.floor - 4, 26);
      const neon = tone & 1 ? M.NEON_CYAN : M.NEON_PINK;
      const strip: number[] = [];
      for (let h = 0; h < tall; h++) {
        for (let y = y0; y < y0 + d; y++) {
          for (let x = x0; x < x0 + w; x++) {
            const corner = x === x0 + w - 1 && y === y0 + d - 1;
            if (corner && h > 1 && h < tall - 1) {
              v.put(x, y, z + h, neon, 6);
              strip.push(v.idx(x, y, z + h));
            } else {
              v.put(x, y, z + h, h % 4 === 0 ? M.ROCK_DARK : M.BRICK, h % 4 === 0 ? 2 : 2 + ((x + y + (h >> 2)) % 3));
            }
          }
        }
      }
      box(v, x0, y0, z + tall, x0 + w, y0 + d, z + tall + 1, neon, 5);
      fx.columns.push({ strip, m: neon });
      return;
    }
  }
}

// ── weather ──────────────────────────────────────────────────────────────
function weather(c: Ctx, L: Layout): void {
  const fx = FIXTURES.get(c.v);
  if (!fx) return;
  const t = c.t;
  const k = kick(t);
  const b = beatOf(t);
  const bar = b >> 2;
  const strobe = fx.desk ? bar % 4 === 3 : bar % 8 === 7;

  stepDance(c, fx, b, bar);
  const d = fx.dance;
  if (d) {
    const size = d.n * d.p;
    c.light({ x: d.cx, y: d.cy, z: L.floor + 1, color: NEON_RGB[bar % 5], radius: clamp(size * 0.8, 10, 40), intensity: 0.2 + 0.4 * k });
  }

  // Moving heads: each steps round the dance floor on the beat, its beam a
  // dotted line through the haze and a pool of colour where it lands.
  if (d && !strobe) {
    const reach = (d.n * d.p) / 2;
    const ph = b + ease(Math.min(1, frac(t / BEAT) * (fx.desk ? 3 : 2)));
    fx.heads.forEach((h, n) => {
      const dir = n & 1 ? 1 : -1;
      const ang = ph * (Math.PI / 4) * dir + n * 1.7;
      const rr = reach * (0.35 + 0.45 * (0.5 + 0.5 * Math.sin(ph * 0.5 + n * 2.1)));
      const to = { x: d.cx + Math.cos(ang) * rr, y: d.cy + Math.sin(ang) * rr, z: L.floor + 0.2 };
      const col = NEON_RGB[mod((fx.desk ? b : bar) + n, 5)];
      beam(c, h, to, mix(col, [0, 0, 0], 0.5), fx.desk ? 2 : 2.6);
      c.light({ x: to.x, y: to.y, z: to.z + 0.5, color: col, radius: L.W >= 120 ? 18 : 12, intensity: 0.75 + 0.45 * k });
    });
  }

  // Strobes: one bar in eight (four while someone runs the lights).
  const flash = strobe && frac(t / (BEAT / 2)) < 0.3;
  for (const s of fx.strobes) {
    for (const i of s.cells) swap(c.v, i, flash ? M.LAMP : M.METAL, flash ? 7 : 5, LIT);
    if (flash) c.light({ x: s.x, y: s.y, z: s.z, color: WHITE, radius: 40, intensity: 1.2 });
  }
  if (flash && d) c.light({ x: d.cx, y: d.cy, z: L.floor + 8, color: WHITE, radius: 40, intensity: 1.3 });

  ball(c, L, fx, strobe);
  fog(c, fx, b);
  confetti(c, L, fx, bar);

  // The bad tube in the big sign stutters every few seconds.
  if (fx.flaky) {
    const w = (t + 2.1) % 6.3;
    const on = !(w < 0.8 && Math.sin(t * 43) * Math.sin(t * 17) > -0.1);
    if (on !== fx.flaky.on) {
      for (const i of fx.flaky.cells) swap(c.v, i, on ? M.NEON_PINK : M.GLASS, on ? 6 : 5, LIT);
      fx.flaky.on = on;
    }
  }
  for (const h of fx.halos) c.light({ x: h.x, y: h.y, z: h.z, color: h.color, radius: h.r, intensity: h.k * (1 + 0.8 * k) });

  // The cat blinks, and flicks its tail now and then.
  if (fx.cat) {
    const blink = (t + 1.3) % 4.7 < 0.18;
    for (const i of fx.cat.eyes) swap(c.v, i, blink ? DARK : M.NEON_GREEN, blink ? 3 : 6, CAT);
    const up = (t % 3.1 < 0.5) !== (t % 1.7 < 0.25);
    swap(c.v, fx.cat.tail[0], up ? M.AIR : DARK, up ? 0 : 3, CAT);
    swap(c.v, fx.cat.tail[1], up ? DARK : M.AIR, up ? 3 : 0, CAT);
  }

  // A dark gap runs up each column's neon, four voxels a beat.
  fx.columns.forEach((col, n) => {
    const len = col.strip.length;
    const g = Math.floor((t / BEAT) * 4 + n * 7) % (len + 8);
    col.strip.forEach((i, h) => {
      const off = h >= g - 3 && h < g;
      swap(c.v, i, off ? DARK : col.m, off ? 1 : 6, LIT);
    });
  });

  // Woofers pump.
  for (const s of fx.cones) {
    const out = k > 0.55;
    const m = c.v.mat[s.i];
    if (out && m === M.AIR) c.v.set(s.i, M.METAL, 6);
    else if (!out && m === M.METAL) c.v.set(s.i, M.AIR, 0, 0);
    c.light({ x: s.x, y: s.y, z: s.z, color: VIOLET, radius: 10, intensity: 0.1 + 0.5 * k });
  }
}

// The dance-floor tiles want a pattern that changes every two bars and
// steps on the beat (every other beat while nobody is playing). Rewrites
// at most DANCE_BUDGET voxels a frame, carrying on where it left off.
function stepDance(c: Ctx, fx: Fx, b: number, bar: number): void {
  const d = fx.dance;
  if (!d) return;
  const v = c.v;
  const hot = fx.dj;
  const st = hot ? b : b >> 1;
  const n = d.n;
  const mid = (n - 1) / 2;
  const mode = (bar >> 1) & 3;
  const want = (ix: number, iy: number): number => {
    let on = false;
    let ci = 0;
    switch (mode) {
      case 0:
        on = ((ix + iy + st) & 1) === 0 && ((ix + st) & 2) === 0;
        ci = mod((ix >> 1) + (iy >> 1) + bar, 5);
        break;
      case 1: {
        const q = ix + iy - st;
        on = mod(q, 4) === 0;
        ci = mod(Math.floor(q / 4) + bar, 5);
        break;
      }
      case 2:
        on = hash3(77, ix, iy, st) > (hot ? 0.55 : 0.68);
        ci = Math.floor(hash3(78, ix, iy, st) * 5);
        break;
      default: {
        const q = Math.round(Math.max(Math.abs(ix - mid), Math.abs(iy - mid))) - st;
        on = mod(q, 3) === 0;
        ci = mod(Math.floor(q / 3) + bar, 5);
      }
    }
    return on ? ci + 1 : 0;
  };
  const kk = d.k * d.k;
  const N = n * n;
  let budget = DANCE_BUDGET;
  let q = 0;
  for (; q < N && budget > 0; q++) {
    const ti = (d.next + q) % N;
    const w = want(ti % n, Math.floor(ti / n));
    if (w === d.cur[ti]) continue;
    const m = w ? NEON_MAT[w - 1] : M.TILE;
    for (let j = 0; j < kk; j++) {
      const i = d.cells[ti * kk + j];
      const was = v.mat[i];
      if (was !== M.TILE && !NEON_MAT.includes(was)) continue;
      const centre = j === (kk >> 1);
      v.set(i, m, w ? (centre ? 7 : 5) : 5);
    }
    d.cur[ti] = w;
    budget -= kk;
  }
  d.next = (d.next + q) % N;
}

// The mirror ball turns: its facets twinkle and a ring of light specks
// sweeps the floor and walls.
function ball(c: Ctx, L: Layout, fx: Fx, strobe: boolean): void {
  const bl = fx.ball;
  if (!bl) return;
  const v = c.v;
  if (bl.cells.length && c.rng.chance(c.dt * 20)) {
    const i = c.rng.pick(bl.cells);
    if (v.mat[i] === M.METAL) v.set(i, M.METAL, c.rng.int(3, 7));
  }
  if (strobe) return;
  const rot = (c.t / (BEAT * 8)) * Math.PI * 2 * (fx.desk ? 2 : 1);
  const N = 18;
  for (let k = 0; k < N; k++) {
    const az = rot + k * 2.39996;
    const el = -0.85 + 1.1 * frac(k * 0.618034);
    const ce = Math.cos(el);
    const dx = Math.cos(az) * ce;
    const dy = Math.sin(az) * ce;
    const dz = Math.sin(el);
    let tt = Infinity;
    if (dz < -1e-3) tt = Math.min(tt, (L.floor - bl.z) / dz);
    if (dx < -1e-3) tt = Math.min(tt, (L.T - bl.x) / dx);
    if (dy < -1e-3) tt = Math.min(tt, (L.T - bl.y) / dy);
    if (!Number.isFinite(tt)) continue;
    const x = bl.x + dx * tt;
    const y = bl.y + dy * tt;
    const z = bl.z + dz * tt;
    if (x < L.T || y < L.T || x > L.W - 1 || y > L.D - 1 || z < L.floor || z > L.H - 1) continue;
    glint(c, Math.max(L.T + 0.3, x), Math.max(L.T + 0.3, y), Math.max(L.floor + 0.3, z), SILVER);
  }
  c.light({ x: bl.x, y: bl.y, z: bl.z, color: SILVER, radius: 8, intensity: 0.5 });
}

// The smoke machine on the stage puffs a jet of haze out over the floor:
// two beats every four bars, every two bars while someone is on stage.
function fog(c: Ctx, fx: Fx, b: number): void {
  const f = fx.fog;
  if (!f) return;
  const on = mod(b, fx.stage ? 8 : 16) < 2;
  if (!on) return;
  for (let n = 0; n < 6; n++) {
    const d = c.rng.range(1, 14);
    const x = Math.round(f.x + f.dx * d + c.rng.range(-1, 1) * (1 + d / 4));
    const y = Math.round(f.y + f.dy * d + c.rng.range(-1, 1) * (1 + d / 4));
    puff(c, x, y, f.z + c.rng.int(0, 2), M.SMOKE, c.rng.int(90, 160));
  }
}

// Confetti: two bars of it falling over the dance floor every sixteen bars
// (every eight while the DJ plays).
function confetti(c: Ctx, L: Layout, fx: Fx, bar: number): void {
  const d = fx.dance;
  if (!d) return;
  const every = fx.dj ? 8 : 16;
  if (mod(bar, every) < 4 || mod(bar, every) > 5) return;
  const top = Math.min(L.H - 2, L.floor + 34);
  const half = (d.n * d.p) / 2 + 4;
  let n = Math.floor(c.dt * 40 + c.rng.next());
  while (n-- > 0) {
    const vz = -c.rng.range(4, 7);
    const life = Math.min(9.5, (top - L.floor - 0.5) / -vz);
    const col = c.rng.pick([PINK, CYAN, LIME, VIOLET, AMBER, WHITE, SILVER]);
    glint(c, clamp(d.cx + c.rng.range(-half, half), L.T + 1, L.W - 1), clamp(d.cy + c.rng.range(-half, half), L.T + 1, L.D - 1), top, col, life, c.rng.range(-0.8, 0.8), c.rng.range(-0.8, 0.8), vz, c.rng.chance(0.5));
  }
}

// ── life ─────────────────────────────────────────────────────────────────
// Where idle characters like to be: dancing on the tiles (facing the DJ),
// at the bar, on the VIP banquette, watching the stage, petting the cat.
// Every one on open floor, clear of the walkways.
function pois(L: Layout): Poi[] {
  const P = plan(L);
  const { W, D, T } = L;
  const out: Poi[] = [];
  const ok = (x: number, y: number) =>
    x > T && y > T && x < W - 1 && y < D - 1 && !P.keep[x + W * y] && !P.decor[x + W * y] && !out.some((p) => Math.hypot(p.x - x, p.y - y) < 3);
  const add = (x: number, y: number, kind: Poi['kind'], face: { x: number; y: number }) => {
    if (!ok(x, y)) return false;
    out.push({ x, y, kind, face });
    return true;
  };
  // The free cell nearest (a, b) in a slot's frame, out past its footprint.
  const near = (s: Slot, a: number, b: number, reach: number, kind: Poi['kind'], face: { x: number; y: number }) => {
    let best: [number, number] | null = null;
    let bd = Infinity;
    for (let db = -reach; db <= reach; db++) {
      for (let da = -reach; da <= reach; da++) {
        if (b + db < s.dep + 1) continue;
        const x = Math.round(wx(s, a + da, b + db));
        const y = Math.round(wy(s, a + da, b + db));
        const dd = Math.hypot(da, db * 1.3);
        if (dd < bd && ok(x, y)) [best, bd] = [[x, y], dd];
      }
    }
    if (best) add(best[0], best[1], kind, face);
  };
  const slot = (k: SlotKind) => L.slots.find((s) => s.kind === k);
  const at = (s: Slot, a: number, b: number) => ({ x: wx(s, a, b), y: wy(s, a, b) });

  // the dance floor: tile middles, spread out, facing the DJ
  const d = P.dance;
  const dj = slot('write');
  const toDj = dj ? at(dj, dj.len / 2, dj.dep / 2) : { x: d.cx, y: d.cy };
  const free: Array<[number, number]> = [];
  for (let iy = 0; iy < d.n; iy++) {
    for (let ix = 0; ix < d.n; ix++) {
      const x = d.x0 + ix * d.p + Math.ceil(d.p / 2);
      const y = d.y0 + iy * d.p + Math.ceil(d.p / 2);
      if (ok(x, y)) free.push([x, y]);
    }
  }
  const picked: Array<[number, number]> = [];
  while (picked.length < 8 && free.length) {
    let bi = 0;
    let bd = -Infinity;
    free.forEach(([x, y], i) => {
      const dd = picked.length ? Math.min(...picked.map(([px, py]) => Math.hypot(px - x, py - y))) : -Math.hypot(x - d.cx, y - d.cy);
      if (dd > bd) [bd, bi] = [dd, i];
    });
    const [x, y] = free.splice(bi, 1)[0];
    if (add(x, y, 'dance', toDj)) picked.push([x, y]);
  }

  // the bar, by the stools
  const bs = slot('idle');
  if (bs) for (const a of [2, 5, bs.len - 6, bs.len - 3]) near(bs, a, bs.dep + 1, 4, 'drink', at(bs, a, 7));
  // the VIP banquette: on its front edge, looking out over the floor
  const vip = slot('read');
  if (vip) for (const a of [3, vip.len - 4]) near(vip, a, vip.dep + 1, 4, 'seat', { x: d.cx, y: d.cy });
  // the stage, from out front either side
  const st = slot('think');
  if (st) {
    const mic = at(st, st.len >> 1, 5);
    for (const a of [-2, st.len + 1]) near(st, a, st.dep + 8, 14, 'view', mic);
  }
  // the zones: the bar island, the lounge and the booths, the cat's pouf;
  // the cat on the bar when it has no pouf
  for (const q of P.spots) if (q.face) add(q.x, q.y, q.kind, q.face);
  if (!P.cat && bs) near(bs, bs.len - 3, bs.dep + 1, 6, 'pet', at(bs, bs.len - 3, 6));
  return out;
}

const BUILD: BuildStyle = { mats: [M.METAL, M.PLASTIC, M.NEON_PINK, M.NEON_CYAN], shape: 'tower' };

export const club: Biome = {
  id: 'club',
  name: 'Underground Club',
  tagline: 'Neon on brick, a floor that lights up and 128 BPM till dawn',
  palette: PALETTE,
  backdrop: hex('#07040c'),
  sky: 'beams',
  grade: GRADE,
  colors: COLORS,
  generate,
  props: PROPS,
  weather,
  costume: 'raver',
  finale: { colors: [[255, 60, 190], [60, 240, 255], [120, 255, 120], [190, 110, 255]], glow: true }, // confetti, gone where it lands
  build: BUILD,
  pois,
};

export default club;
