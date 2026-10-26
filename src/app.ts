import { homedir } from 'node:os';
import { performance } from 'node:perf_hooks';
import { sep } from 'node:path';
import { encodeRgb } from './art/png.ts';
import { Scene } from './art/scene.ts';
import { encodeRgba } from './art/scene/front.ts';
import type { Bitmap } from './art/types.ts';
import { readAccount } from './claude/account.ts';
import { ClaudeSource } from './claude/source.ts';
import { loadConfig, saveConfig } from './config.ts';
import { CrewStore } from './pet/store.ts';
import { Renderer, detectColorMode, renderLines } from './term/renderer.ts';
import { Screen } from './term/screen.ts';
import { Terminal, osc52 } from './term/terminal.ts';
import { CELL_SIZE_QUERY, deleteImages, supportsImages } from './term/kitty.ts';
import { PlateStream } from './term/plates.ts';
import type { Theme } from './themes/types.ts';
import type { SceneFrame } from './world/frame.ts';
import { World } from './world/world.ts';
import type { View } from './world/world.ts';

export type RunOpts = { theme: Theme; demo: boolean; fps: number; root: string; view: View; lights?: boolean; officeLife?: boolean };

// Encodes a picture as PNG (`opaque`: every pixel is, so no alpha needed).
export type Encode = (b: Bitmap, opaque: boolean) => Uint8Array;

const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';

// Terminal output as one synchronized update (each part's own markers
// dropped), so the picture and the text over it change together.
export function together(...parts: string[]): string {
  const body = parts.map((p) => (p.startsWith(SYNC_ON) && p.endsWith(SYNC_OFF) ? p.slice(SYNC_ON.length, -SYNC_OFF.length) : p)).join('');
  return body ? SYNC_ON + body + SYNC_OFF : '';
}

// The scene's picture, step by step: draws the text screen, then hands the
// frame's plate (see Scene.plate) to the stream, which sends the terminal
// only what changed: pictures it does not hold yet and the placements that
// moved; when there is no scene, it takes the pictures off the screen.
// With time to spare (until `until`, a performance.now() deadline), it gets
// ready what a keypress would show next (see Scene.warm) and sends it ahead,
// so zooming or picking an agent only moves pictures already there.
// Returns the picture's escapes, to go out with the text.
export class ScenePlayer {
  readonly scene = new Scene();
  readonly stream: PlateStream;

  constructor(o: { encode: Encode }) {
    this.stream = new PlateStream(o);
  }

  // Everything goes out again (resize, cell size, theme, redraw).
  invalidate(): void {
    this.stream.invalidate();
  }

  step(world: { draw(s: Screen, now: number): void; scene(): SceneFrame | null }, screen: Screen, now: number, until?: number): string {
    world.draw(screen, now);
    const f = world.scene();
    const out = this.stream.step(f ? this.scene.plate(f) : null);
    if (!f || until === undefined || performance.now() >= until) return out;
    return together(out, this.stream.preload(this.scene.warm(f, until)));
  }
}

// The share of each frame's time the loop may spend on getting ready what
// a keypress would show (see ScenePlayer).
const WARM = 0.6;

const packRgb = (c: readonly [number, number, number]) => (c[0] << 16) | (c[1] << 8) | c[2];

// Demo snapshots start from a fixed instant so they are reproducible.
const DEMO_EPOCH = Date.UTC(2026, 9, 22, 21, 30, 0);

export function tildify(p: string): string {
  const home = homedir();
  return p === home || p.startsWith(home + sep) ? '~' + p.slice(home.length) : p;
}

// `crews`: where the live crews are kept (an interactive run saves them;
// a snapshot only reads its transcripts' tails, in memory).
function makeWorld(o: RunOpts, start: number, liveInterval?: number, crews?: CrewStore): World {
  return new World({
    theme: o.theme,
    view: o.view,
    lights: o.lights,
    officeLife: o.officeLife,
    images: supportsImages(),
    live: o.demo ? null : new ClaudeSource(o.root, liveInterval === undefined ? {} : { intervalMs: liveInterval }),
    demo: o.demo,
    account: readAccount(o.root),
    rootLabel: tildify(o.root),
    start,
    crews: o.demo ? undefined : crews,
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

// On the way out: the scene's pictures off the screen (`images`), the
// terminal put back as it was, then what is due to be written (the theme,
// the crews), so a slow or failing write never leaves the terminal raw.
// Each save is tried, whatever the others do. Last, `note` (what was not
// saved, see World.crewsNote) goes to stderr (`say`), where it stays once
// the screen is back.
export function leave(
  term: { write(s: string): void; restore(): void },
  saves: ReadonlyArray<() => void>,
  o: { images?: boolean; note?: string | null; say?: (s: string) => void } = {},
): void {
  if (o.images ?? true) term.write(deleteImages());
  term.restore();
  for (const save of saves) {
    try {
      save();
    } catch {
      // Best effort: the next one still goes.
    }
  }
  if (o.note) (o.say ?? ((s) => process.stderr.write(s)))(`animus: ${o.note}\n`);
}

export function runInteractive(o: RunOpts): Promise<number> {
  if (!process.stdout.isTTY || !process.stdin.isTTY) {
    process.stderr.write('animus: needs an interactive terminal (try --snapshot to print a frame)\n');
    return Promise.resolve(1);
  }
  const term = new Terminal();
  const world = makeWorld(o, Date.now(), undefined, new CrewStore());
  const renderer = new Renderer(detectColorMode());
  // The scene as pictures under its (blank) cells: opaque ones flattened
  // onto the world's backdrop, the rest with alpha (zlib level 2: see
  // png.ts).
  const player = new ScenePlayer({ encode: (b, opaque) => (opaque ? encodeRgb(b, packRgb(world.theme.backdrop), 2) : encodeRgba(b, 2)) });
  let screen = new Screen(term.cols, term.rows);
  world.resize(term.cols, term.rows);

  return new Promise((resolve) => {
    let finished = false;
    let stopLoop = () => {};
    let flushSave = () => {};
    // What is due to be written; both no-ops once written, so a direct
    // process.exit (the exit hook) cannot skip them, nor do them twice.
    const saves = [() => flushSave(), () => world.flushCrews()];
    const restoreOnExit = () => leave(term, saves, { images: false, note: world.crewsNote() });
    const finish = (code: number, err?: unknown) => {
      if (finished) return;
      finished = true;
      stopLoop();
      leave(term, saves, { note: world.crewsNote() });
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
    // The scene's canvas is its cells at their size in pixels; terminals
    // that know it answer.
    term.onCellSize((c) => {
      // Every resize asks again and mostly gets the same size back (the
      // resize invalidated already): only a new size starts afresh.
      if (!world.setCell(c.w, c.h)) return;
      renderer.invalidate();
      player.invalidate();
    });
    term.write(CELL_SIZE_QUERY);
    term.onResize(() => {
      term.write(CELL_SIZE_QUERY);
      screen = new Screen(term.cols, term.rows);
      world.resize(term.cols, term.rows);
      renderer.invalidate();
      player.invalidate();
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
      // A message for an agent that takes none goes to the clipboard.
      const clip = world.takeClipboard();
      if (clip) term.write(osc52(clip));
      if (r === 'quit') finish(0);
      else if (r === 'theme' || r === 'prefs') {
        if (r === 'theme') player.invalidate();
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(persist, 500);
      }
    });
    stopLoop = startLoop(
      () => {
        const start = performance.now();
        const now = Date.now();
        world.tick(now);
        if (term.congested) return; // slow link: skip drawing until stdout drains
        // The picture under the scene's (blank) cells and the text over
        // them, changed together; up to WARM of the frame's time getting
        // ready what a keypress would show.
        const picture = player.step(world, screen, now, start + (WARM * 1000) / o.fps);
        term.write(together(picture, renderer.render(screen)));
      },
      o.fps,
      (err) => finish(1, err),
    );
  });
}
