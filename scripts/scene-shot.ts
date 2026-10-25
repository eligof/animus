// Renders the demo crew in a world to a PNG of the scene, as the terminal
// would be sent it (labels are terminal text, so only their pills show),
// for docs and art reviews.
//
//   node scripts/scene-shot.ts <world> <out.png> [--at 20] [--size 150x46]
//     [--cell 10x20] [--zoom 0] [--select -1] [--full] [--dark]
//
// --at: seconds of demo time; --size: the terminal in cells; --cell: a
// cell in pixels; --zoom: + presses; --select: tab presses + 1 (the n-th
// agent picked, with its close-up); --full: the scene fills the terminal;
// --dark: lighting off. Prints the PNG size, the first render's time (the
// base painted, the sprites drawn), the next frame's plate (its time and
// how many pictures it stacks) and the encode time.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { composite } from '../src/art/plate.ts';
import { encodeRgb } from '../src/art/png.ts';
import { Scene } from '../src/art/scene.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import { World } from '../src/world/world.ts';

const DEMO_EPOCH = Date.UTC(2026, 9, 22, 21, 30, 0);
const FPS = 18;

export function shot(o: { world: string; at: number; cols: number; rows: number; cell: { w: number; h: number }; zoom: number; select: number; full: boolean; dark: boolean }): { png: Buffer; pictures: number; ms: { first: number; frame: number; encode: number } } {
  const theme = getTheme(o.world);
  if (!theme) throw new Error(`unknown world "${o.world}"`);
  const w = new World({ theme, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~/.claude', start: DEMO_EPOCH, images: true, view: 'scene', lights: !o.dark });
  w.full = o.full;
  w.setCell(o.cell.w, o.cell.h);
  w.resize(o.cols, o.rows);
  const screen = new Screen(o.cols, o.rows);
  const steps = Math.max(1, Math.round(o.at * FPS));
  for (let i = 0; i < steps; i++) {
    const now = DEMO_EPOCH + (i * 1000) / FPS;
    w.tick(now);
    // Zoom and pick two seconds before the end, so the camera has settled.
    if (i === Math.max(0, steps - 2 * FPS)) {
      for (let k = 0; k < o.zoom; k++) w.handleKey({ name: '+', ch: '+', ctrl: false, shift: false });
      for (let k = 0; k <= o.select; k++) w.handleKey({ name: 'tab', ch: '\t', ctrl: false, shift: false });
    }
    w.draw(screen, now);
  }
  const f = w.scene();
  if (!f) throw new Error('no scene to show (terminal too small?)');
  const scene = new Scene();
  let t = performance.now();
  scene.render(f);
  const first = performance.now() - t;
  t = performance.now();
  const plate = scene.plate({ ...f, t: f.t + 0.01 });
  const frame = performance.now() - t;
  const [r, g, b] = f.world.backdrop;
  t = performance.now();
  const png = encodeRgb(composite(plate), (r << 16) | (g << 8) | b, 2);
  return { png, pictures: plate.layers.length, ms: { first, frame, encode: performance.now() - t } };
}

function pair(s: string, name: string): [number, number] {
  const m = s.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`--${name} wants WxH, not "${s}"`);
  return [Number(m[1]), Number(m[2])];
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { at: { type: 'string' }, size: { type: 'string' }, cell: { type: 'string' }, zoom: { type: 'string' }, select: { type: 'string' }, full: { type: 'boolean' }, dark: { type: 'boolean' } },
  });
  const [world, out] = positionals;
  if (!world || !out) {
    process.stderr.write('usage: node scripts/scene-shot.ts <world> <out.png> [--at s] [--size 150x46] [--cell 10x20] [--zoom n] [--select n] [--full] [--dark]\n');
    process.exit(2);
  }
  const [cols, rows] = pair(values.size ?? '150x46', 'size');
  const [cw, ch] = pair(values.cell ?? '10x20', 'cell');
  const { png, pictures, ms } = shot({ world, at: Number(values.at ?? 20), cols, rows, cell: { w: cw, h: ch }, zoom: Number(values.zoom ?? 0), select: Number(values.select ?? -1), full: !!values.full, dark: !!values.dark });
  writeFileSync(out, png);
  process.stdout.write(`${out}: ${(png.length / 1024).toFixed(0)} KB; first render ${ms.first.toFixed(0)} ms, next plate ${ms.frame.toFixed(1)} ms (${pictures} pictures), encode ${ms.encode.toFixed(1)} ms\n`);
}
