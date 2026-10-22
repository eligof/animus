import { homedir } from 'node:os';
import { sep } from 'node:path';
import { readAccount } from './claude/account.ts';
import { ClaudeSource } from './claude/source.ts';
import { loadConfig, saveConfig } from './config.ts';
import { Renderer, detectColorMode, renderLines } from './term/renderer.ts';
import { Screen } from './term/screen.ts';
import { Terminal } from './term/terminal.ts';
import type { Theme } from './themes/types.ts';
import { World } from './world/world.ts';
import type { PixelMode } from './world/stage.ts';

export type RunOpts = { theme: Theme; demo: boolean; fps: number; root: string; pixels: PixelMode; lights?: boolean };

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
  let screen = new Screen(term.cols, term.rows);
  world.resize(term.cols, term.rows);

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
    term.onResize(() => {
      screen = new Screen(term.cols, term.rows);
      world.resize(term.cols, term.rows);
      renderer.invalidate();
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
      },
      o.fps,
      (err) => finish(1, err),
    );
  });
}
