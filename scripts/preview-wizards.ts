// Renders contact sheets of the cave figures (src/cave/wizard.ts) to PNGs
// for checking the art: many characters x every pose, front, back and
// flipped, on a dark lit cave background and on a light one, with pixels
// 3 wide x 4 tall (sextant mode) or square (half blocks), plus a pass
// through the real sextant quantiser. Every costume gets its own sheets
// (front, back, light floor, and box-downsampled 2x as when the scene zooms
// out), and the emotes get a sheet of their own.
//
//   node scripts/preview-wizards.ts [--out dir] [--t secs] [--costume name|all]
//   BIG="0,1,3:idle,walk@front" [BIG_T=0,0.5] [BIG_SEXTANT=1] [BIG_COSTUME=raver] node scripts/preview-wizards.ts --out dir
//     (close-up of CREW rows x poses, written to big.png)
import { parseArgs } from 'node:util';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RGB } from '../src/term/color.ts';
import { hex, mix, scale } from '../src/term/color.ts';
import { PixelCanvas, sextantPattern } from '../src/iso/canvas.ts';
import { encodePng } from '../src/iso/png.ts';
import { Screen } from '../src/term/screen.ts';
import { traitsFor } from '../src/world/character.ts';
import type { Costume, Emote, Pose, Traits } from '../src/world/character.ts';
import { emoteSprite, wizardSprite } from '../src/cave/wizard.ts';
import type { Facing, WizardSprite } from '../src/cave/types.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string', default: '.' },
    t: { type: 'string', default: '1.3' },
    costume: { type: 'string', default: 'all' },
  },
});
const OUT = values.out!;
const T = Number(values.t);
mkdirSync(OUT, { recursive: true });

const WORK: Pose[] = ['idle', 'walk', 'write', 'read', 'search', 'run', 'web', 'think', 'delegate', 'talk', 'done', 'error', 'sleep'];
const LIFE: Pose[] = ['sit', 'carry', 'place', 'cheer', 'wave', 'drink', 'stretch', 'chat', 'flinch', 'dance', 'pet'];
const POSES: Pose[] = [...WORK, ...LIFE];
const COSTUMES: Costume[] = ['wizard', 'scientist', 'raver', 'hacker', 'astronaut', 'casual'];
const EMOTES: Emote[] = ['excl', 'question', 'heart', 'note', 'idea', 'sweat', 'zzz', 'anger', 'star', 'cup'];
// Blocks to carry: sandstone, moss, crystal.
const ITEMS: RGB[] = [hex('#c9a66b'), hex('#5f9e4a'), hex('#8ad8ff')];

// A spread of looks: every hat style, species and accessory.
function look(id: string, o: Partial<Traits>): Traits {
  return { ...traitsFor(id, 'sub'), accessory: 'none', ...o };
}
const CREW: Traits[] = [
  look('a1', { species: 'human', hairStyle: 0 }),
  look('a2', { species: 'human', hairStyle: 0, accessory: 'headset' }),
  look('a3', { species: 'human', hairStyle: 1, accessory: 'glasses' }),
  look('a4', { species: 'human', hairStyle: 2 }),
  look('a5', { species: 'human', hairStyle: 3, accessory: 'bow' }),
  look('a6', { species: 'human', hairStyle: 4, accessory: 'goggles' }),
  look('a7', { species: 'human', hairStyle: 5 }),
  look('a8', { species: 'human', hairStyle: 6 }),
  look('a9', { species: 'human', hairStyle: 7 }),
  look('b1', { species: 'human', hairStyle: 0, accessory: 'lamp' }),
  look('b2', { species: 'human', hairStyle: 3, accessory: 'beret' }),
  look('b3', { species: 'human', hairStyle: 1, accessory: 'hood' }),
  ...['robot', 'cat', 'alien', 'ghost'].map((s, i) => {
    const base = traitsFor(`sp-${s}-${i}`, 'sub');
    return { ...specimen(s as Traits['species']), hairStyle: base.hairStyle, accessory: 'none' as const };
  }),
  { ...specimen('robot'), accessory: 'headset' },
  { ...specimen('cat'), accessory: 'lamp' },
  { ...specimen('ghost'), hairStyle: 1, accessory: 'headset' },
];

// First id whose traits come out as this species (so colours are realistic).
function specimen(s: Traits['species']): Traits {
  for (let i = 0; ; i++) {
    const tr = traitsFor(`spec-${s}-${i}`, 'sub');
    if (tr.species === s) return tr;
  }
}

// ── compositing ──────────────────────────────────────────────────────────
type Px = RGB;
type Img = { w: number; h: number; px: Px[] };

const img = (w: number, h: number, c: Px): Img => ({ w, h, px: Array.from({ length: w * h }, () => c) });

function rockBg(w: number, h: number, seed: number): Img {
  const out = img(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = (Math.imul(x * 73856093 ^ y * 19349663 ^ seed, 2654435761) >>> 0) / 4294967296;
      const floor = y >= h - 4;
      const base = floor ? hex('#2b2333') : hex('#16111c');
      out.px[y * w + x] = scale(base, 0.85 + 0.3 * n);
    }
  }
  return out;
}

// Draws a sprite with its anchor at (x, y). `lit`: cave lighting (dim
// ambient, the carried light's pool, glow on top with a little bloom).
function compose(dst: Img, sp: WizardSprite, x: number, y: number, lit: boolean): void {
  const left = x + sp.dx - sp.ax;
  const top = y + sp.dy - sp.ay;
  const L = sp.light;
  const lx = x + sp.dx + (L?.dx ?? 0);
  const ly = y + sp.dy + (L?.dy ?? 0);
  const pool = (px: number, py: number): number => {
    if (!L || !lit) return 0;
    const q = ((px - lx) ** 2 + (py - ly) ** 2) / (L.radius * L.radius);
    return q >= 1 ? 0 : (1 - q) * (1 - q) * L.intensity;
  };
  if (lit && L) {
    for (let py = 0; py < dst.h; py++) {
      for (let px = 0; px < dst.w; px++) {
        const f = pool(px, py);
        if (f > 0) {
          const i = py * dst.w + px;
          const c = dst.px[i];
          dst.px[i] = [Math.min(255, c[0] + L.color[0] * f * 0.25), Math.min(255, c[1] + L.color[1] * f * 0.25), Math.min(255, c[2] + L.color[2] * f * 0.25)];
        }
      }
    }
  }
  for (let r = 0; r < sp.h; r++) {
    for (let c = 0; c < sp.w; c++) {
      const X = left + c;
      const Y = top + r;
      if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
      const g = sp.glow[r][c];
      const p = sp.px[r][c];
      if (g) {
        dst.px[Y * dst.w + X] = g;
      } else if (p) {
        if (!lit) {
          dst.px[Y * dst.w + X] = p;
        } else {
          const f = pool(X, Y);
          const k = 0.62;
          const lc = L?.color ?? [0, 0, 0];
          dst.px[Y * dst.w + X] = [
            Math.min(255, p[0] * (k + (lc[0] / 255) * f * 0.7)),
            Math.min(255, p[1] * (k + (lc[1] / 255) * f * 0.7)),
            Math.min(255, p[2] * (k + (lc[2] / 255) * f * 0.7)),
          ];
        }
      }
    }
  }
  if (!lit) return;
  // Bloom: glow bleeds a little into its 8 neighbours.
  for (let r = 0; r < sp.h; r++) {
    for (let c = 0; c < sp.w; c++) {
      const g = sp.glow[r][c];
      if (!g) continue;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const X = left + c + dx;
          const Y = top + r + dy;
          if ((dx === 0 && dy === 0) || X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue;
          if (sp.glow[r + dy]?.[c + dx]) continue;
          const i = Y * dst.w + X;
          dst.px[i] = mix(dst.px[i], g, dx && dy ? 0.12 : 0.22);
        }
      }
    }
  }
}

// Upscales into a canvas, each pixel sx x sy.
function toCanvas(src: Img, sx: number, sy: number): PixelCanvas {
  const c = new PixelCanvas(src.w * sx, src.h * sy);
  for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) for (let j = 0; j < sy; j++) for (let i = 0; i < sx; i++) c.set(x * sx + i, y * sy + j, src.px[y * src.w + x]);
  return c;
}

// Box filter to half size, as the scene draws when zoomed out.
function half(src: Img): Img {
  const w = Math.floor(src.w / 2);
  const h = Math.floor(src.h / 2);
  const out = img(w, h, [0, 0, 0]);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = [0, 0, 0];
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const c = src.px[(y * 2 + dy) * src.w + x * 2 + dx];
        s[0] += c[0];
        s[1] += c[1];
        s[2] += c[2];
      }
      out.px[y * w + x] = [Math.round(s[0] / 4), Math.round(s[1] / 4), Math.round(s[2] / 4)];
    }
  }
  return out;
}

// Round trip through the terminal's sextant quantiser (2x3 px per cell,
// two colours each).
function sextant(src: Img): Img {
  const cv = new PixelCanvas(src.w, src.h);
  for (let i = 0; i < src.px.length; i++) cv.set(i % src.w, Math.floor(i / src.w), src.px[i]);
  const cols = Math.ceil(src.w / 2);
  const rows = Math.ceil(src.h / 3);
  const s = new Screen(cols, rows);
  cv.blitSextant(s, { x: 0, y: 0, w: cols, h: rows });
  const out = img(cols * 2, rows * 3, [0, 0, 0]);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const bits = sextantPattern(s.ch[i]);
      for (let k = 0; k < 6; k++) {
        const on = bits < 0 || (bits & (1 << k)) !== 0;
        const v = on ? s.fg[i] : s.bg[i];
        out.px[(y * 3 + (k >> 1)) * out.w + x * 2 + (k & 1)] = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
      }
    }
  }
  return out;
}

const CELL_W = 26;
const CELL_H = 24;

// Rows of characters x columns of (pose, facing, time); `lit` for cave
// lighting, `light` for a light floor instead of rock.
type Col = { pose: Pose; facing: Facing; t: number };
type Sheet = { rows: Traits[]; cols: Col[]; lit: boolean; light?: boolean; costume?: Costume };

function lightBg(w: number, h: number, ch: number): Img {
  const out = img(w, h, hex('#d9d2c3'));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (y % ch >= ch - 4) out.px[y * w + x] = hex('#bfb3a0');
  return out;
}

function sheet(s: Sheet): Img {
  const w = s.cols.length * CELL_W;
  const h = s.rows.length * CELL_H;
  const out = s.light ? lightBg(w, h, CELL_H) : rockBg(w, h, 7);
  s.rows.forEach((tr, ri) => {
    s.cols.forEach((cl, ci) => {
      const sp = wizardSprite(tr, cl.pose, cl.t, cl.facing, ri * 3, { costume: s.costume, item: ITEMS[ri % ITEMS.length] });
      compose(out, sp, ci * CELL_W + Math.floor(CELL_W / 2), ri * CELL_H + CELL_H - 3, s.lit);
    });
  });
  return out;
}

const front: Facing = { back: false, flip: false };
const back: Facing = { back: true, flip: false };
const flip: Facing = { back: false, flip: true };
const allPoses = (facing: Facing, t = T, poses = POSES) => poses.map((pose) => ({ pose, facing, t }));

function save(name: string, im: Img, sx: number, sy: number): void {
  const file = join(OUT, name);
  writeFileSync(file, encodePng(toCanvas(im, sx, sy)));
  process.stdout.write(`${file}\n`);
}

const half1 = Math.ceil(CREW.length / 2);
const A = CREW.slice(0, half1);
const B = CREW.slice(half1);
const wanted = values.costume === 'all' ? COSTUMES : COSTUMES.filter((c) => c === values.costume);

// The classic wizard sheets.
if (wanted.includes('wizard')) {
  save('wizards-front-a.png', sheet({ rows: A, cols: allPoses(front, T, WORK), lit: true }), 3, 4);
  save('wizards-front-b.png', sheet({ rows: B, cols: allPoses(front, T, WORK), lit: true }), 3, 4);
  save('wizards-back.png', sheet({ rows: CREW, cols: allPoses(back, T, WORK), lit: true }), 2, 3);
  save('wizards-flip.png', sheet({ rows: A, cols: allPoses(flip, T, WORK), lit: true }), 3, 4);
  save('wizards-light.png', sheet({ rows: CREW, cols: allPoses(front, T, WORK), lit: false, light: true }), 2, 3);
  save('wizards-flat.png', sheet({ rows: A, cols: allPoses(front, T, WORK), lit: false }), 3, 4);
  // Square pixels (half-block mode) and the sextant round trip.
  save('wizards-square.png', sheet({ rows: A, cols: allPoses(front, T, WORK), lit: true }), 3, 3);
  save('wizards-sextant.png', sextant(sheet({ rows: A, cols: allPoses(front, T, WORK), lit: true })), 3, 4);
}

// Per costume: every pose, front and back, dark and light, and at half size.
for (const costume of wanted) {
  const at = (rows: Traits[], cols: Col[], o: Partial<Sheet> = {}) => sheet({ rows, cols, lit: true, costume, ...o });
  save(`${costume}-front-a.png`, at(A, allPoses(front)), 3, 4);
  save(`${costume}-front-b.png`, at(B, allPoses(front)), 3, 4);
  save(`${costume}-back.png`, at(CREW, allPoses(back)), 2, 3);
  save(`${costume}-light.png`, at(CREW, allPoses(front), { lit: false, light: true }), 2, 3);
  save(`${costume}-half.png`, half(at(A, allPoses(front))), 6, 8);
  save(`${costume}-half-light.png`, half(at(A, allPoses(front), { lit: false, light: true })), 6, 8);
  save(`${costume}-sextant.png`, sextant(at(A, allPoses(front, T, LIFE))), 3, 4);
  // Animation: one character, each pose through 8 time steps.
  const frames = 8;
  const tr = CREW[0];
  const out = rockBg(frames * CELL_W, POSES.length * CELL_H, 3);
  POSES.forEach((pose, ri) => {
    for (let i = 0; i < frames; i++) {
      compose(out, wizardSprite(tr, pose, i * 0.13, front, 0, { costume, item: ITEMS[0] }), i * CELL_W + 13, ri * CELL_H + CELL_H - 3, true);
    }
  });
  save(`${costume}-anim.png`, out, 3, 4);
}

// Every costume side by side: rows of characters, (costume x front/back) columns.
{
  const rows = [CREW[0], CREW[1], CREW[3], CREW[6], CREW[7], CREW[8], CREW[11], ...CREW.slice(12, 16)];
  const w = COSTUMES.length * 2 * CELL_W;
  const h = rows.length * CELL_H;
  for (const light of [false, true]) {
    const out = light ? lightBg(w, h, CELL_H) : rockBg(w, h, 9);
    rows.forEach((tr, ri) =>
      COSTUMES.forEach((costume, ci) =>
        [front, back].forEach((facing, fi) =>
          compose(out, wizardSprite(tr, 'idle', 1.1, facing, ri, { costume }), (ci * 2 + fi) * CELL_W + 13, ri * CELL_H + CELL_H - 3, !light),
        ),
      ),
    );
    save(light ? 'costumes-light.png' : 'costumes.png', out, 3, 4);
    save(light ? 'costumes-light-half.png' : 'costumes-half.png', half(out), 6, 8);
  }
}

// Emotes: each in both frames, over dark and light ground, above a head.
{
  const cw = 12;
  const ch = 12;
  const w = EMOTES.length * 2 * cw;
  const out = img(w, ch * 2, hex('#16111c'));
  for (let y = ch; y < ch * 2; y++) for (let x = 0; x < w; x++) out.px[y * w + x] = hex('#d9d2c3');
  EMOTES.forEach((e, i) =>
    [0, 0.45].forEach((t, k) =>
      [0, 1].forEach((band) => {
        const sp = emoteSprite(e, t);
        const left = (i * 2 + k) * cw + 6 - sp.ax;
        const top = band * ch + ch - 2 - sp.ay;
        for (let r = 0; r < sp.h; r++) {
          for (let c = 0; c < sp.w; c++) {
            const p = sp.glow[r][c] ?? sp.px[r][c];
            if (p) out.px[(top + r) * w + left + c] = p;
          }
        }
      }),
    ),
  );
  save('emotes.png', out, 12, 16);
  save('emotes-small.png', out, 3, 4);
}

// Big close-ups: tight cells at 12 x 16 per pixel.
function big(name: string, rows: Traits[], cols: Col[], costume?: Costume): void {
  const cw = 22;
  const ch = 22;
  const out = rockBg(cols.length * cw, rows.length * ch, 5);
  rows.forEach((tr, ri) => cols.forEach((cl, ci) => compose(out, wizardSprite(tr, cl.pose, cl.t, cl.facing, 0, { costume, item: ITEMS[0] }), ci * cw + 11, ri * ch + ch - 2, true)));
  save(name, process.env.BIG_SEXTANT ? sextant(out) : out, 12, 16);
}
const bigArg = process.env.BIG;
if (bigArg) {
  // BIG="0,1,2:idle,walk,write@front" etc.
  const [who, what] = bigArg.split(':');
  const [poses, side] = what.split('@');
  const facing = side === 'back' ? back : side === 'flip' ? flip : front;
  const ts = (process.env.BIG_T ?? String(T)).split(',').map(Number);
  const cols = poses.split(',').flatMap((pose) => ts.map((t) => ({ pose: pose as Pose, facing, t })));
  big('big.png', who.split(',').map((i) => CREW[Number(i)]), cols, process.env.BIG_COSTUME as Costume | undefined);
}
