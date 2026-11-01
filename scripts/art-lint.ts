// Measures the art rules a room is judged by, with numbers, for art
// reviews (not a test: nothing here fails, it reads alongside the renders).
//
//   node scripts/art-lint.ts [<world>] [--size 100x30] [--cell 19x42]
//     [--at 6]
//
// <world>: a registered world's id, or a world's module file
// (src/worlds/<id>.ts) to look at one not registered yet; all of them when
// left out. --size: the terminal in cells; --cell: a cell in pixels; --at:
// seconds of demo time before the frame is taken.
//
// Per world, from one frame of the demo crew:
//   L/R    the left wall's mean luminance over the right's, the room's own
//          shell only (no props or figures): the art rule puts the left
//          wall about 18 % darker, so 0.82 or under (ok, else hi);
//   floor  the floor's mean luminance in its back third, its front third,
//          and back over front (under 1: the back corner is the darker);
//   dark   lights off against on (the same frame with `lit` false): the
//          share of the room's pixels whose luminance moves by more than
//          DARK_STEP, and the mean move over the room;
//   figure the characters against what is behind them: the WCAG contrast
//          of their pixels' mean luminance against the same box's with
//          them left out, the median over the figures (and the lowest);
//   decor  how many pieces of decor the room planner places in a room
//          this many units across (80 x 24 is 72, 100 x 30 86 and 97 full
//          screen, 120 x 36 108, 150 x 46 143 and 153 full screen, 200 x 60
//          160; see moreDecor in world/room.ts).
import { parseArgs } from 'node:util';
import { composite } from '../src/art/plate.ts';
import { Scene } from '../src/art/scene.ts';
import { Screen } from '../src/term/screen.ts';
import { themeIds } from '../src/themes/index.ts';
import { FIGURE_H, FIGURE_HALF_W, project } from '../src/world/frame.ts';
import type { SceneFrame } from '../src/world/frame.ts';
import { planLayout } from '../src/world/layout.ts';
import { planRoom } from '../src/world/room.ts';
import { hashString } from '../src/world/rng.ts';
import { World } from '../src/world/world.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import { loadWorld } from './scene-shot.ts';

const DEMO_EPOCH = Date.UTC(2026, 9, 22, 21, 30, 0);
const FPS = 18;
const RULE_LR = 0.82; // the left wall over the right, at most
const DARK_STEP = 4; // a pixel moved by lights off: more than this luminance
const FIGURE_STEP = 12; // a figure's own pixel: a channel off what is behind by more than this
const SIDES = [72, 86, 97, 108, 120, 143, 153, 160];

type RGBA = Uint8ClampedArray;
const lum = (d: RGBA, o: number) => 0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2];
// WCAG relative luminance of a luminance in 0..255 (as if grey).
const rel = (l: number) => {
  const c = l / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const contrast = (a: number, b: number) => (Math.max(rel(a), rel(b)) + 0.05) / (Math.min(rel(a), rel(b)) + 0.05);

// One frame of the demo crew in `world`, as the terminal would get it.
function frameOf(world: WorldDef, cols: number, rows: number, cell: { w: number; h: number }, at: number): SceneFrame {
  const w = new World({ theme: world, live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~/.claude', start: DEMO_EPOCH, images: true, view: 'scene', lights: true });
  w.setCell(cell.w, cell.h);
  w.resize(cols, rows);
  const screen = new Screen(cols, rows);
  for (let i = 0, n = Math.max(1, Math.round(at * FPS)); i < n; i++) {
    const now = DEMO_EPOCH + (i * 1000) / FPS;
    w.tick(now);
    w.draw(screen, now);
  }
  const f = w.scene();
  if (!f) throw new Error('no scene to show (terminal too small?)');
  return f;
}

// The frame composited to RGBA (a copy: the scene reuses its canvas).
const pixels = (scene: Scene, f: SceneFrame): RGBA => composite(scene.plate(f)).data.slice();

type Lint = { lr: number; back: number; front: number; dark: number; darkMean: number; figure: number; figureMin: number; figures: number };

function lint(world: WorldDef, f: SceneFrame): Lint {
  const cam = f.camera;
  const W = Math.max(1, Math.round(cam.w));
  const H = Math.max(1, Math.round(cam.h));
  const { L } = f.room;
  const P = (x: number, y: number, z: number) => project({ s: cam.s, ox: Math.round(cam.ox), oy: Math.round(cam.oy) }, x, y, z);
  const scene = new Scene();
  // The shell alone: no props, workstations, locals, builds, figures.
  const bare: SceneFrame = { ...f, room: { ...f.room, props: [] }, active: [], figures: [], critter: null, trinkets: [], desks: [], npcs: [], builds: [], particles: [], labels: [], marks: [] };
  const shell = pixels(scene, bare);
  const lit = pixels(scene, f);
  const unlit = pixels(scene, { ...f, lit: false });
  const nobody = pixels(scene, { ...f, figures: [], labels: [] });
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : (Math.round(y) * W + Math.round(x)) * 4);
  const mean = (d: RGBA, pts: Array<[number, number, number]>) => {
    let n = 0;
    let t = 0;
    for (const [x, y, z] of pts) {
      const o = at(...P(x, y, z));
      if (o < 0) continue;
      t += lum(d, o);
      n++;
    }
    return n ? t / n : NaN;
  };
  const grid = (g: (a: number, b: number) => [number, number, number]) => {
    const out: Array<[number, number, number]> = [];
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) out.push(g(i / 40, j / 40));
    return out;
  };
  const { T } = L;
  const right = mean(shell, grid((a, b) => [T + (L.W - T) * (0.1 + 0.8 * a), T + 0.01, L.H * (0.05 + 0.9 * b)]));
  const left = mean(shell, grid((a, b) => [T + 0.01, T + (L.D - T) * (0.1 + 0.8 * a), L.H * (0.05 + 0.9 * b)]));
  const back = mean(shell, grid((a, b) => [T + (L.W - T) * (0.02 + 0.3 * a), T + (L.D - T) * (0.02 + 0.3 * b), 0]));
  const front = mean(shell, grid((a, b) => [T + (L.W - T) * (0.68 + 0.3 * a), T + (L.D - T) * (0.68 + 0.3 * b), 0]));
  // The room on screen (the floor and both walls): a convex hexagon.
  const hex = [P(0, 0, L.H), P(L.W, 0, L.H), P(L.W, 0, 0), P(L.W, L.D, 0), P(0, L.D, 0), P(0, L.D, L.H)];
  const inRoom = (x: number, y: number) => hex.every(([ax, ay], i) => {
    const [bx, by] = hex[(i + 1) % hex.length];
    return (bx - ax) * (y - ay) - (by - ay) * (x - ax) >= 0;
  });
  let room = 0;
  let moved = 0;
  let moves = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!inRoom(x, y)) continue;
      const o = (y * W + x) * 4;
      const d = Math.abs(lum(lit, o) - lum(unlit, o));
      room++;
      moves += d;
      if (d > DARK_STEP) moved++;
    }
  }
  // Each figure's box (its feet up to FIGURE_H, FIGURE_HALF_W either side):
  // its own pixels against what is there without it.
  const ratios: number[] = [];
  for (const g of f.figures) {
    const [cx, feet] = P(g.x, g.y, g.z);
    const [, top] = P(g.x, g.y, g.z + FIGURE_H);
    const half = FIGURE_HALF_W * cam.s;
    let n = 0;
    let fig = 0;
    let behind = 0;
    for (let y = Math.max(0, Math.floor(top)); y < Math.min(H, Math.ceil(feet)); y++) {
      for (let x = Math.max(0, Math.floor(cx - half)); x < Math.min(W, Math.ceil(cx + half)); x++) {
        const o = (y * W + x) * 4;
        if (Math.max(Math.abs(lit[o] - nobody[o]), Math.abs(lit[o + 1] - nobody[o + 1]), Math.abs(lit[o + 2] - nobody[o + 2])) <= FIGURE_STEP) continue;
        fig += lum(lit, o);
        behind += lum(nobody, o);
        n++;
      }
    }
    if (n > 20) ratios.push(contrast(fig / n, behind / n));
  }
  ratios.sort((p, q) => p - q);
  return {
    lr: left / right,
    back,
    front,
    dark: room ? (100 * moved) / room : 0,
    darkMean: room ? moves / room : 0,
    figure: ratios.length ? ratios[ratios.length >> 1] : NaN,
    figureMin: ratios.length ? ratios[0] : NaN,
    figures: ratios.length,
  };
}

// Pieces of decor placed in a room `side` units across.
function decorCounts(world: WorldDef): number[] {
  return SIDES.map((side) => {
    const L = planLayout(2 * side + 12, 1000, world.id);
    return planRoom(world, L, hashString(world.id)).props.filter((p) => !p.slot).length;
  });
}

function pair(s: string, name: string): [number, number] {
  const m = s.match(/^(\d+)x(\d+)$/);
  if (!m) throw new Error(`--${name} wants WxH, not "${s}"`);
  return [Number(m[1]), Number(m[2])];
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { size: { type: 'string' }, cell: { type: 'string' }, at: { type: 'string' } } });
  const [cols, rows] = pair(values.size ?? '100x30', 'size');
  const [cw, ch] = pair(values.cell ?? '19x42', 'cell');
  const at = Number(values.at ?? 6);
  const names = positionals.length ? positionals : themeIds();
  const worlds = await Promise.all(
    names.map((n) =>
      loadWorld(n).catch((e: Error) => {
        process.stderr.write(`${e.message}\n`);
        process.exit(2);
      }),
    ),
  );
  const fx = (n: number, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : '-');
  const pad = (s: string, n: number) => s.padStart(n);
  process.stdout.write(`art lint at ${cols}x${rows}, cell ${cw}x${ch}, ${at} s in (rules: L/R <= ${RULE_LR}; dark = % of the room's pixels moving > ${DARK_STEP})\n`);
  process.stdout.write(`${'world'.padEnd(9)}${pad('L/R', 7)}    ${pad('floor back/front', 21)}${pad('dark %', 8)}${pad('mean', 6)}${pad('figure', 8)}${pad('min', 6)}   decor at ${SIDES.join(' ')}\n`);
  for (const world of worlds) {
    const f = frameOf(world, cols, rows, { w: cw, h: ch }, at);
    const r = lint(world, f);
    const ok = r.lr <= RULE_LR ? 'ok' : 'hi';
    const floor = `${fx(r.back, 0)}/${fx(r.front, 0)} ${fx(r.back / r.front)}`;
    process.stdout.write(`${world.id.padEnd(9)}${pad(fx(r.lr), 7)} ${ok} ${pad(floor, 21)}${pad(fx(r.dark, 1), 8)}${pad(fx(r.darkMean, 1), 6)}${pad(fx(r.figure), 8)}${pad(fx(r.figureMin), 6)}   ${decorCounts(world).join(' ')}\n`);
  }
}
