import { homedir } from 'node:os';
import { sep } from 'node:path';
import { readAccount } from './claude/account.ts';
import { ClaudeSource } from './claude/source.ts';
import { configPath, loadConfig, saveConfig, updateConfig } from './config.ts';
import { Renderer, detectColorMode, renderLines } from './term/renderer.ts';
import { Screen } from './term/screen.ts';
import { Terminal } from './term/terminal.ts';
import { CELL_SIZE_QUERY, deleteImages, frameCommand, imageCommand, supportsFramePatches, supportsImages } from './term/kitty.ts';
import { PixelCanvas } from './iso/canvas.ts';
import { encodePngScaled, tagSize } from './iso/png.ts';
import type { Tag } from './iso/png.ts';
import type { Rect as Box } from './cave/layout.ts';
import type { Theme } from './themes/types.ts';
import { World } from './world/world.ts';
import type { PixelMode } from './world/stage.ts';

export type RunOpts = { theme: Theme; demo: boolean; fps: number; root: string; pixels: PixelMode; lights?: boolean };

// HD frames: the scene image's id, and how often it is re-sent (each frame
// is a compressed PNG, so this caps the bandwidth).
const IMAGE_ID = 1;
const HD_FPS = 10;
// What only ambient animation changed (flicker, fire, weather, the sky)
// goes out with the stage's next ambient step (3 a second) while the
// stream is under RATE bytes a second: motion always goes out at once,
// ambient changes take what room it leaves, but wait no longer than
// AMBIENT_WAIT_MS (and come no sooner than AMBIENT_MS).
const AMBIENT_MS = 250;
const AMBIENT_WAIT_MS = 1000;
const RATE = 1_200_000;
// Where the terminal can patch the image (see supportsFramePatches), only
// the changed TILE x TILE px tiles go out, as at most MAX_PATCHES
// rectangles; the whole frame instead when that is over FULL_SHARE of it,
// and REFRESH_MS after the last whole frame (in case a patch went astray).
const TILE = 32;
const MAX_PATCHES = 6;
const FULL_SHARE = 0.6;
const REFRESH_MS = 5000;

type StageImage = NonNullable<ReturnType<World['hdImage']>>;
// An HD frame; without `hot` (what moves on purpose, see Stage.hdImage)
// every change counts as motion.
type HdImage = Omit<StageImage, 'hot' | 'view' | 'ambient'> & Partial<Pick<StageImage, 'hot' | 'view' | 'ambient'>>;

// One HD frame: the scene canvas blown up to whole pixels, centred in the
// scene's cells and drawn under them, inside a synchronized update.
export function hdFrame(hd: HdImage): string {
  const { canvas, scale, rect, cell, detail, tags } = hd;
  // zlib level 2: 40% smaller than level 1 for the same encode time.
  const png = encodePngScaled(canvas, scale, 0, 2, detail ?? undefined, tags);
  const ox = Math.max(0, Math.floor((rect.w * cell.w - canvas.w * scale) / 2));
  const oy = Math.max(0, Math.floor((rect.h * cell.h - canvas.h * scale) / 2));
  const col = rect.x + Math.floor(ox / cell.w);
  const row = rect.y + Math.floor(oy / cell.h);
  const img = imageCommand(png, { id: IMAGE_ID, dx: ox % cell.w, dy: oy % cell.h });
  return `\x1b[?2026h\x1b[${row + 1};${col + 1}H${img}\x1b[?2026l`;
}

// A cheap fingerprint (FNV-1a over 32-bit words) of everything an HD frame
// is made of: about 0.2 ms for a 576x342 canvas, twice that with detail.
export function hdKey(hd: HdImage): number {
  const { canvas, scale, rect, cell, detail } = hd;
  let h = 0x811c9dc5;
  for (const v of [canvas.w, canvas.h, scale, rect.x, rect.y, rect.w, rect.h, cell.w, cell.h, detail ? 1 : 0]) h = Math.imul(h ^ v, 0x01000193);
  const d = canvas.data;
  for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d[i], 0x01000193);
  if (detail) {
    const idx = detail.idx;
    for (let i = 0; i < idx.length; i++) h = Math.imul(h ^ idx[i], 0x01000193);
  }
  for (const t of hd.tags) {
    for (const v of [t.x, t.y, t.color, t.bg ?? -1, t.shadow ?? -1, Math.round((t.bgAlpha ?? 1) * 255), t.scale ?? 1]) h = Math.imul(h ^ v, 0x01000193);
    for (let i = 0; i < t.text.length; i++) h = Math.imul(h ^ t.text.charCodeAt(i), 0x01000193);
  }
  return h >>> 0;
}

// What the loop sends for the HD image each step, at most HD_FPS times a
// second: what changed since the terminal was last sent the picture, or
// the delete once HD is switched off. Changes in the stage's `hot` boxes,
// to the tags or of the camera go out at once; the rest (ambient
// animation) waits for the next ambient step. Terminals that can patch a
// shown image get the changed tiles, the others whole frames.
export class HdStream {
  private readonly patches: boolean;
  private at = -Infinity; // last look
  private up = false; // an image is shown
  private stale = true; // the next frame goes out whole
  // What the terminal was sent: the canvas, its shape, pixels and surface
  // patterns, the tags, the camera, the moving boxes and ambient step.
  private canvas: PixelCanvas | null = null;
  private shape = '';
  private px = new Int32Array(0);
  private idx = new Uint16Array(0);
  private tags: Tag[] = [];
  private view: string | undefined;
  private hot: readonly Box[] = [];
  private ambient = NaN;
  private ambientAt = -Infinity;
  private budget = RATE; // bytes that may go out now (see RATE)
  private fullAt = -Infinity;
  private patched = false; // patches sent since the last whole frame

  // `patches`: whether the terminal can patch a shown image (by default
  // guessed from the environment).
  constructor(o: { patches?: boolean } = {}) {
    this.patches = o.patches ?? supportsFramePatches();
  }

  // The next frame goes out whole even if unchanged (resize, cell size,
  // redraw).
  invalidate(): void {
    this.stale = true;
  }

  step(hd: HdImage | null, now: number): string {
    if (!hd) {
      if (!this.up) return '';
      this.up = false;
      this.invalidate();
      return deleteImages(IMAGE_ID);
    }
    if (now - this.at < 1000 / HD_FPS) return '';
    this.budget = Math.min(RATE, this.budget + (RATE * Math.min(1000, now - this.at)) / 1000);
    this.at = now;
    const { canvas, scale, rect, cell, detail } = hd;
    const shape = [canvas.w, canvas.h, scale, rect.x, rect.y, rect.w, rect.h, cell.w, cell.h, detail ? 1 : 0].join();
    // Without steps of its own, ambient time steps 3 times a second.
    const tick = hd.ambient ?? Math.floor((now * 3) / 1000);
    const refresh = this.patched && now - this.fullAt >= REFRESH_MS;
    if (this.stale || canvas !== this.canvas || shape !== this.shape || refresh) return this.whole(hd, now, shape, tick);
    const g = grid(canvas.w, canvas.h, scale);
    const dirty = new Uint8Array(g.n);
    changed(g, canvas.data, this.px, dirty);
    if (detail) changed(g, detail.idx, this.idx, dirty);
    // A tag that came, went or changed: the tiles under it, then and now,
    // go out at once.
    const hot = new Uint8Array(g.n);
    for (const t of this.tags) if (!hd.tags.some((u) => sameTag(t, u))) markTag(g, [dirty, hot], t, scale);
    for (const t of hd.tags) if (!this.tags.some((u) => sameTag(t, u))) markTag(g, [dirty, hot], t, scale);
    const wait = now - this.ambientAt;
    const ambientDue = wait >= AMBIENT_MS && ((tick !== this.ambient && this.budget > 0) || wait >= AMBIENT_WAIT_MS);
    const all = ambientDue || !hd.hot || hd.view !== this.view;
    if (!all) for (const b of [...this.hot, ...hd.hot!]) mark(g, [hot], b);
    this.hot = hd.hot ?? [];
    this.view = hd.view;
    if (ambientDue) {
      this.ambient = tick;
      this.ambientAt = now;
    }
    let count = 0;
    for (let k = 0; k < g.n; k++) {
      dirty[k] &= all ? 1 : hot[k];
      count += dirty[k];
    }
    if (count === 0) return '';
    if (!this.patches) return this.whole(hd, now, shape, tick);
    const rects = coalesce(dirty, g.tw, g.th, MAX_PATCHES);
    let area = 0;
    for (const r of rects) area += (r.x1 - r.x0) * (r.y1 - r.y0);
    if (area > FULL_SHARE * g.n) return this.whole(hd, now, shape, tick);
    let out = '';
    for (const r of rects) out += this.patch(hd, g, r);
    this.tags = [...hd.tags];
    this.patched = true;
    out = `\x1b[?2026h${out}\x1b[?2026l`;
    this.spend(out.length);
    return out;
  }

  // The whole frame, noted as shown.
  private whole(hd: HdImage, now: number, shape: string, tick: number): string {
    const out = hdFrame(hd);
    this.canvas = hd.canvas;
    this.shape = shape;
    this.px = hd.canvas.data.slice();
    this.idx = hd.detail ? hd.detail.idx.slice() : new Uint16Array(0);
    this.tags = [...hd.tags];
    this.view = hd.view;
    this.hot = hd.hot ?? [];
    this.ambient = tick;
    this.ambientAt = now;
    this.fullAt = now;
    this.stale = false;
    this.patched = false;
    this.up = true;
    this.spend(out.length);
    return out;
  }

  // Bytes out of the budget, which owes at most a second's worth.
  private spend(bytes: number): void {
    this.budget = Math.max(-RATE, this.budget - bytes);
  }

  // One rectangle of tiles `r` patched into the shown image, noted as shown.
  private patch(hd: HdImage, g: Grid, r: Box): string {
    const { canvas, scale, detail } = hd;
    const x0 = r.x0 * g.t;
    const y0 = r.y0 * g.t;
    const w = Math.min(canvas.w, r.x1 * g.t) - x0;
    const h = Math.min(canvas.h, r.y1 * g.t) - y0;
    const sub = new PixelCanvas(w, h);
    const idx = detail ? new Uint16Array(w * h) : null;
    for (let y = y0; y < y0 + h; y++) {
      const from = y * canvas.w + x0;
      const row = canvas.data.subarray(from, from + w);
      sub.data.set(row, (y - y0) * w);
      this.px.set(row, from);
      if (detail && idx) {
        const pats = detail.idx.subarray(from, from + w);
        idx.set(pats, (y - y0) * w);
        this.idx.set(pats, from);
      }
    }
    // Image pixels from here on; tags are clipped to the patch.
    const ox = x0 * scale;
    const oy = y0 * scale;
    const tags = hd.tags
      .filter((t) => {
        const box = tagSize(t.text, t.scale);
        return t.x < ox + w * scale && t.y < oy + h * scale && t.x + box.w + 1 > ox && t.y + box.h + 1 > oy;
      })
      .map((t) => ({ ...t, x: t.x - ox, y: t.y - oy }));
    const png = encodePngScaled(sub, scale, 0, 2, detail && idx ? { idx, pats: detail.pats } : undefined, tags);
    return frameCommand(png, { id: IMAGE_ID, x: ox, y: oy, w: w * scale, h: h * scale });
  }
}

// The image's tiles, in canvas pixels: `t` a side (TILE image pixels, in
// whole canvas pixels), `tw` x `th` of them.
type Grid = { w: number; h: number; t: number; tw: number; th: number; n: number };

function grid(w: number, h: number, scale: number): Grid {
  const t = Math.max(1, Math.round(TILE / scale));
  const tw = Math.ceil(w / t);
  const th = Math.ceil(h / t);
  return { w, h, t, tw, th, n: tw * th };
}

// Marks the tiles where `now` differs from `was` (one entry per canvas
// pixel).
function changed(g: Grid, now: ArrayLike<number>, was: ArrayLike<number>, into: Uint8Array): void {
  for (let ty = 0; ty < g.th; ty++) {
    const y0 = ty * g.t;
    const y1 = Math.min(g.h, y0 + g.t);
    for (let tx = 0; tx < g.tw; tx++) {
      const k = ty * g.tw + tx;
      if (into[k]) continue;
      const x0 = tx * g.t;
      const x1 = Math.min(g.w, x0 + g.t);
      scan: for (let y = y0; y < y1; y++) {
        for (let i = y * g.w + x0, e = y * g.w + x1; i < e; i++) {
          if (now[i] !== was[i]) {
            into[k] = 1;
            break scan;
          }
        }
      }
    }
  }
}

// Marks the tiles under a box of canvas pixels (ends exclusive).
function mark(g: Grid, into: Uint8Array[], b: Box): void {
  const x0 = Math.max(0, Math.floor(b.x0 / g.t));
  const y0 = Math.max(0, Math.floor(b.y0 / g.t));
  const x1 = Math.min(g.tw - 1, Math.floor((b.x1 - 1) / g.t));
  const y1 = Math.min(g.th - 1, Math.floor((b.y1 - 1) / g.t));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) for (const m of into) m[y * g.tw + x] = 1;
}

// Marks the tiles under a tag (its box and shadow, in image pixels).
function markTag(g: Grid, into: Uint8Array[], t: Tag, scale: number): void {
  const box = tagSize(t.text, t.scale);
  const x = Math.floor(t.x);
  const y = Math.floor(t.y);
  mark(g, into, { x0: Math.floor(x / scale), y0: Math.floor(y / scale), x1: Math.ceil((x + box.w + 1) / scale), y1: Math.ceil((y + box.h + 1) / scale) });
}

function sameTag(a: Tag, b: Tag): boolean {
  return a.x === b.x && a.y === b.y && a.text === b.text && a.color === b.color && a.shadow === b.shadow && a.bg === b.bg && a.bgAlpha === b.bgAlpha && a.scale === b.scale;
}

// The marked tiles of a `tw` x `th` mask as at most `max` rectangles (tile
// units, ends exclusive): runs along each row (bridging one-tile gaps),
// stacked where the row above has a run of the same span, then the pairs
// that add the fewest unmarked tiles merged until `max` are left.
export function coalesce(mask: Uint8Array, tw: number, th: number, max: number): Box[] {
  let rects: Box[] = [];
  let above: Box[] = [];
  for (let y = 0; y < th; y++) {
    const row: Box[] = [];
    for (let x = 0, o = y * tw; x < tw; x++) {
      if (!mask[o + x]) continue;
      let e = x + 1;
      while (e < tw && (mask[o + e] || (e + 1 < tw && mask[o + e + 1]))) e++;
      let r = above.find((a) => a.x0 === x && a.x1 === e);
      if (r) r.y1 = y + 1;
      else rects.push((r = { x0: x, y0: y, x1: e, y1: y + 1 }));
      row.push(r);
      x = e;
    }
    above = row;
  }
  const area = (r: Box) => (r.x1 - r.x0) * (r.y1 - r.y0);
  while (rects.length > Math.max(1, max)) {
    let best = Infinity;
    let pick: [number, number] = [0, 1];
    for (let i = 0; i < rects.length; i++) {
      const a = rects[i];
      for (let j = i + 1; j < rects.length; j++) {
        const b = rects[j];
        const waste = (Math.max(a.x1, b.x1) - Math.min(a.x0, b.x0)) * (Math.max(a.y1, b.y1) - Math.min(a.y0, b.y0)) - area(a) - area(b);
        if (waste < best) {
          best = waste;
          pick = [i, j];
        }
      }
    }
    const [a, b] = [rects[pick[0]], rects[pick[1]]];
    const u = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
    // The union replaces both, and whatever else it covers.
    rects = [u, ...rects.filter((r) => r.x0 < u.x0 || r.y0 < u.y0 || r.x1 > u.x1 || r.y1 > u.y1)];
  }
  return rects;
}

// Terminals without images never offer HD, so say once (ever) where it is.
export const HD_TIP = 'HD mode: run animus in kitty, Ghostty or WezTerm';
const HD_TIP_MS = 8000;

// The tip to show at startup ('' for none); remembered in the config, so
// it only ever shows once.
export function hdTipOnce(pixels: PixelMode, images: boolean, path = configPath()): string {
  if (pixels === 'hd' || images || loadConfig(path).hdTipSeen) return '';
  updateConfig({ hdTipSeen: true }, path);
  return HD_TIP;
}

// Demo snapshots start from a fixed instant so they are reproducible.
const DEMO_EPOCH = Date.UTC(2026, 9, 22, 21, 30, 0);

export function tildify(p: string): string {
  const home = homedir();
  return p === home || p.startsWith(home + sep) ? '~' + p.slice(home.length) : p;
}

function makeWorld(o: RunOpts, start: number, liveInterval?: number): World {
  return new World({
    theme: o.theme,
    pixels: o.pixels,
    lights: o.lights,
    images: supportsImages(),
    live: o.demo ? null : new ClaudeSource(o.root, liveInterval === undefined ? {} : { intervalMs: liveInterval }),
    demo: o.demo,
    account: readAccount(o.root),
    rootLabel: tildify(o.root),
    start,
  });
}

export function snapshot(o: RunOpts & { width: number; height: number; at: number }): string {
  // Live snapshots replay the last `at` seconds so they end at the real now.
  const start = o.demo ? DEMO_EPOCH : Date.now() - o.at * 1000;
  const world = makeWorld(o, start);
  world.resize(o.width, o.height);
  const step = 1000 / o.fps;
  let now = start;
  for (let i = 0; i * step < o.at * 1000; i++) {
    now = start + i * step;
    world.tick(now);
  }
  const screen = new Screen(o.width, o.height);
  world.draw(screen, now);
  return renderLines(screen, detectColorMode());
}

// Runs `step` now and then at `fps`. Any throw stops the loop for good
// (including on the very first frame) and is reported once via `fail`.
export function startLoop(step: () => void, fps: number, fail: (err: unknown) => void): () => void {
  let timer: NodeJS.Timeout | undefined;
  let stopped = false;
  const stop = () => {
    stopped = true;
    if (timer) clearInterval(timer);
  };
  const run = () => {
    if (stopped) return;
    try {
      step();
    } catch (err) {
      stop();
      fail(err);
    }
  };
  run();
  if (!stopped) timer = setInterval(run, 1000 / fps);
  return stop;
}

export function runInteractive(o: RunOpts): Promise<number> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    process.stderr.write('animus: needs an interactive terminal (try --snapshot to print a frame)\n');
    return Promise.resolve(1);
  }
  const term = new Terminal();
  const world = makeWorld(o, Date.now());
  const renderer = new Renderer(detectColorMode());
  const hdStream = new HdStream();
  let screen = new Screen(term.cols, term.rows);
  world.resize(term.cols, term.rows);
  const tip = hdTipOnce(o.pixels, supportsImages());
  if (tip) world.flash(tip, Date.now() + HD_TIP_MS);

  return new Promise((resolve) => {
    let finished = false;
    let stopLoop = () => {};
    let flushSave = () => {};
    const restoreOnExit = () => term.restore();
    const finish = (code: number, err?: unknown) => {
      if (finished) return;
      finished = true;
      stopLoop();
      flushSave();
      term.write(deleteImages());
      term.restore();
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('SIGHUP', onSignal);
      process.off('uncaughtException', onCrash);
      process.off('exit', restoreOnExit);
      if (err) process.stderr.write(`animus crashed: ${err instanceof Error ? err.stack : String(err)}\n`);
      resolve(code);
    };
    const onSignal = () => finish(0);
    const onCrash = (err: unknown) => finish(1, err);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('SIGHUP', onSignal);
    process.on('uncaughtException', onCrash);
    process.on('exit', restoreOnExit);

    term.enter();
    // HD mode needs the cell size in pixels; terminals that know it answer.
    term.onCellSize((c) => {
      world.setCell(c.w, c.h);
      renderer.invalidate();
      hdStream.invalidate();
    });
    term.write(CELL_SIZE_QUERY);
    term.onResize(() => {
      term.write(CELL_SIZE_QUERY);
      screen = new Screen(term.cols, term.rows);
      world.resize(term.cols, term.rows);
      renderer.invalidate();
      hdStream.invalidate();
    });
    // Theme changes are saved after a short pause, so key repeat does not
    // rewrite the config file many times a second.
    let saveTimer: NodeJS.Timeout | undefined;
    const persist = () => {
      saveTimer = undefined;
      saveConfig({ ...loadConfig(), theme: world.theme.id, ...world.prefs() });
    };
    flushSave = () => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        persist();
      }
    };
    term.onKey((k) => {
      const r = world.handleKey(k);
      if (r === 'quit') finish(0);
      else if (r === 'theme' || r === 'prefs') {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, 500);
      }
    });
    stopLoop = startLoop(
      () => {
        const now = Date.now();
        world.tick(now);
        if (term.congested) return; // slow link: skip drawing until stdout drains
        world.draw(screen, now);
        term.write(renderer.render(screen));
        // HD: the scene as an image under the (blank) scene cells.
        term.write(hdStream.step(world.hdImage(), now));
      },
      o.fps,
      (err) => finish(1, err),
    );
  });
}
