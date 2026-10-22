// Renders a biome (a module file or a registered id) with the demo crew to
// a PNG of the scene as the terminal shows it: each cell decoded back to its
// pixels (text cells become flat blocks), each pixel drawn `scale` wide and,
// in sextant mode, 4/3 as tall, for checking art while authoring a preset.
//
//   node scripts/preview-theme.ts src/cave/biomes/mines.ts --out /tmp/mines.png [--w 150] [--h 46] [--t 8] [--scale 3] [--pixels half|sextant]
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PixelCanvas, sextantPattern } from '../src/iso/canvas.ts';
import { encodePng } from '../src/iso/png.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { Theme } from '../src/themes/types.ts';
import { World } from '../src/world/world.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    w: { type: 'string', default: '150' },
    h: { type: 'string', default: '46' },
    t: { type: 'string', default: '8' },
    scale: { type: 'string', default: '3' },
    pixels: { type: 'string', default: 'sextant' },
  },
});

const file = positionals[0];
const pixels = values.pixels;
if (!file || !values.out || (pixels !== 'half' && pixels !== 'sextant')) {
  process.stderr.write('usage: node scripts/preview-theme.ts <biome-file.ts | biome id> --out <file.png> [--w cols] [--h rows] [--t secs] [--scale n] [--pixels half|sextant]\n');
  process.exit(2);
}
const theme: Theme | undefined = file.endsWith('.ts')
  ? await import(pathToFileURL(resolve(file)).href).then((mod) => mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'generate' in (v as object)))
  : getTheme(file);
if (!theme) {
  process.stderr.write(`no biome in ${file}\n`);
  process.exit(2);
}
const cols = Number(values.w);
const rows = Number(values.h);
const start = Date.UTC(2026, 9, 22, 21, 30);
const world = new World({ theme, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~/.claude', start, pixels });
world.resize(cols, rows);
let now = start;
for (let i = 0; i * (1000 / 18) < Number(values.t) * 1000; i++) {
  now = start + i * (1000 / 18);
  world.tick(now);
}
const s = new Screen(cols, rows);
world.draw(s, now);

// Cells back to pixels: '▀' cells carry 1x2 pixels and sextant cells 2x3;
// text cells become a flat block of their foreground so labels and chrome
// still show up.
const [fx, fy] = pixels === 'sextant' ? [2, 3] : [1, 2];
const c = new PixelCanvas(cols * fx, rows * fy);
for (let y = 0; y < rows; y++) {
  for (let x = 0; x < cols; x++) {
    const i = y * cols + x;
    const ch = s.ch[i];
    const bits = pixels === 'sextant' ? sextantPattern(ch) : ch === '▀' ? 0b01 : ch === ' ' ? 0 : -1;
    for (let k = 0; k < fx * fy; k++) {
      const on = bits < 0 || (bits & (1 << k)) !== 0;
      c.data[(y * fy + Math.floor(k / fx)) * c.w + x * fx + (k % fx)] = on ? s.fg[i] : s.bg[i];
    }
  }
}
// Sextant pixels are about 3:4, half-block pixels square.
const sx = Number(values.scale);
const sy = pixels === 'sextant' ? Math.round((sx * 4) / 3) : sx;
const big = new PixelCanvas(c.w * sx, c.h * sy);
for (let y = 0; y < big.h; y++) for (let x = 0; x < big.w; x++) big.data[y * big.w + x] = c.data[Math.floor(y / sy) * c.w + Math.floor(x / sx)];
writeFileSync(values.out, encodePng(big, 1));
const props = Object.entries(theme.props).map(([k, p]) => `${k}=${p.name}`).join(', ');
process.stdout.write(`${theme.name} — ${theme.tagline}\nprops: ${props}\nwrote ${values.out}\n`);
