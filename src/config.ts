import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

// view: the scene (an image, where the terminal shows images) or the agent
// dashboard (text); auto picks by the terminal. lights: the scene's
// lighting; officeLife: office life (huddles, coffee runs, high-fives and
// stand-ups; not `office`, the Startup's theme id). Keys from older
// versions (pixels, hdTipSeen) are ignored.
export type ViewPref = 'auto' | 'scene' | 'dashboard';
export type Config = { theme?: string; view?: ViewPref; lights?: boolean; officeLife?: boolean };

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'animus', 'config.json');
}

export function loadConfig(path = configPath()): Config {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    const cfg: Config = {};
    if (typeof d?.theme === 'string') cfg.theme = d.theme;
    if (d?.view === 'auto' || d?.view === 'scene' || d?.view === 'dashboard') cfg.view = d.view;
    if (typeof d?.lights === 'boolean') cfg.lights = d.lights;
    if (typeof d?.officeLife === 'boolean') cfg.officeLife = d.officeLife;
    return cfg;
  } catch {
    return {};
  }
}

// Best effort: a read-only config dir must not break the app.
export function saveConfig(cfg: Config, path = configPath()): boolean {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
    return true;
  } catch {
    return false;
  }
}

// Sets just these keys and leaves the rest of the file as it is; written to
// a temp file and renamed into place, so a crash never leaves half a config.
// Best effort, and a file that is not a JSON object is left alone.
export function updateConfig(patch: Config, path = configPath()): boolean {
  const tmp = `${path}.${process.pid}.tmp`;
  try {
    let d: unknown = {};
    try {
      d = JSON.parse(readFileSync(path, 'utf8'));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') return false;
    }
    if (typeof d !== 'object' || d === null || Array.isArray(d)) return false;
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(tmp, JSON.stringify({ ...d, ...patch }, null, 2) + '\n');
    renameSync(tmp, path);
    return true;
  } catch {
    try {
      rmSync(tmp, { force: true });
    } catch {
      // Nothing more to do.
    }
    return false;
  }
}
