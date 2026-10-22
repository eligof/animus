// Renders a hand-built test cave through the ray caster to a PNG, each
// pixel drawn 3 wide by 4 tall (the sextant pixel aspect), for checking
// the voxel shading by eye. Albedo plus emission, no lighting.
//
//   node scripts/preview-raycast.ts --out /tmp/cave.png [--w 180] [--h 100]
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { PixelCanvas } from '../src/iso/canvas.ts';
import { encodePng } from '../src/iso/png.ts';
import { Caster } from '../src/cave/raycast.ts';
import { M, buildTables } from '../src/cave/materials.ts';
import { Voxels } from '../src/cave/voxels.ts';

const { values } = parseArgs({
  options: {
    out: { type: 'string' },
    w: { type: 'string', default: '180' },
    h: { type: 'string', default: '100' },
  },
});
if (!values.out) {
  process.stderr.write('usage: node scripts/preview-raycast.ts --out <file.png> [--w px] [--h px]\n');
  process.exit(2);
}

let seed = 3;
const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;

const W = 72;
const D = 56;
const H = 36;
const T = 6;
const v = new Voxels(W, D, H);
// Each voxel gets a random colour variant (the grain).
const put = (x: number, y: number, z: number, m: number) => v.put(x, y, z, m, (rnd() * 8) | 0);
const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, m: number) => {
  for (let z = z0; z < z1; z++) for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, z, m);
};

// Back walls and floor, with a band of dark rock and gold in the walls.
box(0, 0, 0, T, D, H, M.ROCK);
box(0, 0, 0, W, T, H, M.ROCK);
box(0, 0, 0, W, D, T, M.ROCK);
box(0, T - 1, 14, W, T, 17, M.ROCK_DARK);
box(T - 1, 0, 20, T, D, 22, M.ROCK_DARK);
for (let k = 0; k < 40; k++) put(T - 1, 8 + ((rnd() * (D - 10)) | 0), 8 + ((rnd() * 24) | 0), M.GOLD_ORE);
// Bumps and a dirt mound.
for (let k = 0; k < 60; k++) {
  const x = T + ((rnd() * (W - T - 3)) | 0);
  const y = T + ((rnd() * (D - T - 3)) | 0);
  box(x, y, T, x + 2 + ((rnd() * 3) | 0), y + 2 + ((rnd() * 3) | 0), T + 1, M.DIRT);
}
for (let z = 0; z < 6; z++) box(10 + z, 34 + z, T + z, 24 - z, 48 - z, T + z + 1, M.DIRT);
// A sand pile, a pool with a sand bed, a lava pit.
for (let z = 0; z < 7; z++) box(48 + z, 12 + z, T + z, 62 - z, 26 - z, T + z + 1, M.SAND);
box(30, 14, T - 3, 44, 28, T, M.WATER);
box(30, 14, T - 3, 44, 28, T - 2, M.SAND);
box(56, 38, T - 2, 66, 48, T, M.LAVA);
// A table, a glass jar of potion, a crystal, fungus on the wall, a fire with smoke.
box(14, 12, T, 15, 13, T + 4, M.WOOD);
box(22, 12, T, 23, 13, T + 4, M.WOOD);
box(14, 18, T, 15, 19, T + 4, M.WOOD);
box(22, 18, T, 23, 19, T + 4, M.WOOD);
box(13, 11, T + 4, 24, 20, T + 5, M.WOOD);
box(17, 14, T + 5, 20, 17, T + 9, M.GLASS);
box(18, 15, T + 5, 19, 16, T + 8, M.POTION);
box(T, 40, T, T + 2, 43, T + 6, M.CRYSTAL);
for (let k = 0; k < 30; k++) put(T + ((rnd() * 30) | 0), T, T + ((rnd() * 10) | 0), M.FUNGUS);
box(40, 40, T, 44, 44, T + 2, M.COAL);
box(41, 41, T + 2, 43, 43, T + 4, M.FIRE);
for (let k = 0; k < 50; k++) put(40 + ((rnd() * 5) | 0), 40 + ((rnd() * 5) | 0), T + 5 + ((rnd() * 12) | 0), M.SMOKE);

const w = Number(values.w);
const h = Number(values.h);
const tables = buildTables();
const caster = new Caster(v, tables, w, h, { ox: Math.round((w - W - D) / 2) + D, oy: Math.round((h - (W + D) / 2 - H) / 2) + H });
caster.renderAll();

const SX = 3;
const SY = 4;
const BACKDROP = 0x120e14;
const c = new PixelCanvas(w * SX, h * SY);
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const a = caster.albedo[y * w + x];
    const e = caster.emit[y * w + x];
    const base = a < 0 ? BACKDROP : a;
    const ch = (s: number) => Math.min(255, ((base >> s) & 255) + (((e >> s) & 255) >> 1));
    const px = (ch(16) << 16) | (ch(8) << 8) | ch(0);
    for (let j = 0; j < SY; j++) c.data.fill(px, (y * SY + j) * c.w + x * SX, (y * SY + j) * c.w + x * SX + SX);
  }
}
writeFileSync(values.out, encodePng(c, 1));
process.stdout.write(`wrote ${values.out} (${w}x${h} px)\n`);
