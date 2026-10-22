// Renders a theme module with the demo crew to a PNG (one image pixel per
// scene pixel, scaled up), for checking art while authoring a preset.
//
//   node scripts/preview-theme.ts src/themes/lab.ts --out /tmp/lab.png [--w 120] [--h 36] [--t 8] [--scale 4] [--pixels half|sextant]
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PixelCanvas, sextantPattern } from '../src/iso/canvas.ts';
import { encodePng } from '../src/iso/png.ts';
import { Screen } from '../src/term/screen.ts';
import type { Theme } from '../src/themes/types.ts';
import { World } from '../src/world/world.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    out: { type: 'string' },
    w: { type: 'string', default: '120' },
    h: { type: 'string', default: '36' },
    t: { type: 'string', default: '8' },
    scale: { type: 'string', default: '4' },
    pixels: { type: 'string', default: 'half' },
  },
});

const file = positionals[0];
const pixels = values.pixels;
if (!file || !values.out || (pixels !== 'half' && pixels !== 'sextant')) {
  process.stderr.write('usage: node scripts/preview-theme.ts <theme-file.ts> --out <file.png> [--w cols] [--h rows] [--t secs] [--scale n] [--pixels half|sextant]\n');
  process.exit(2);
}
const mod = await import(pathToFileURL(resolve(file)).href);
const theme: Theme = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'stations' in (v as object));
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
writeFileSync(values.out, encodePng(c, Number(values.scale)));
const kinds = Object.entries(theme.stations).map(([k, st]) => `${k}=${st.name}`).join(', ');
process.stdout.write(`${theme.name} — ${theme.tagline}\nstations: ${kinds}\nwrote ${values.out}\n`);
