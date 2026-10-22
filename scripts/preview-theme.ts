// Renders a theme's backdrop, every station (active frame) and ambient fx
// without the stage, for checking art while authoring a theme.
//
//   node scripts/preview-theme.ts src/themes/lab.ts [--ansi] [--t 3.3] [--w 110] [--h 30] [--idle]
import { parseArgs } from 'node:util';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Screen } from '../src/term/screen.ts';
import { Renderer } from '../src/term/renderer.ts';
import { drawArt, frameAt } from '../src/themes/art.ts';
import type { Theme } from '../src/themes/types.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    ansi: { type: 'boolean' },
    idle: { type: 'boolean' },
    t: { type: 'string', default: '3.3' },
    w: { type: 'string', default: '110' },
    h: { type: 'string', default: '30' },
  },
});

const file = positionals[0];
if (!file) {
  process.stderr.write('usage: node scripts/preview-theme.ts <theme-file.ts> [--ansi] [--t secs] [--w cols] [--h rows] [--idle]\n');
  process.exit(2);
}
const mod = await import(pathToFileURL(resolve(file)).href);
const theme: Theme = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'drawBackdrop' in (v as object));
const w = Number(values.w);
const h = Number(values.h);
const t = Number(values.t);
const s = new Screen(w, h);
const r = { x: 0, y: 0, w, h };
const floors = h >= 17 ? [Math.floor(h / 2) - 1, h - 2] : [h - 2];
s.clear(theme.palette.bg);
theme.drawBackdrop(s, r, t, floors);
const defs = [theme.entrance, ...theme.stations];
const perLevel = Math.ceil(defs.length / floors.length);
defs.forEach((def, i) => {
  const level = floors.length - 1 - Math.floor(i / perLevel);
  const slot = i % perLevel;
  const a = frameAt(def, t, !values.idle);
  const x = 2 + Math.floor((slot * (w - 14)) / Math.max(1, perLevel - 1 || 1));
  drawArt(s, a, Math.min(x, w - a.w - 1), floors[level] - a.h + 1, def.colors);
});
theme.drawAmbient(s, r, t, floors);
process.stdout.write(values.ansi ? new Renderer('truecolor').render(s) + '\n' : s.toText() + '\n');
process.stdout.write(`\n${theme.name} — ${theme.tagline}\nstations: ${defs.map((d) => `${d.kind}=${d.name}`).join(', ')}\n`);
