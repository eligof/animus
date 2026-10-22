import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type Config = { theme?: string; pixels?: 'half' | 'sextant'; lights?: boolean };

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'animus', 'config.json');
}

export function loadConfig(path = configPath()): Config {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    const cfg: Config = {};
    if (typeof d?.theme === 'string') cfg.theme = d.theme;
    if (d?.pixels === 'half' || d?.pixels === 'sextant') cfg.pixels = d.pixels;
    if (typeof d?.lights === 'boolean') cfg.lights = d.lights;
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
