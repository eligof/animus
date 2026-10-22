import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export type Config = { theme?: string };

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'animus', 'config.json');
}

export function loadConfig(path = configPath()): Config {
  try {
    const d = JSON.parse(readFileSync(path, 'utf8'));
    return typeof d?.theme === 'string' ? { theme: d.theme } : {};
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
