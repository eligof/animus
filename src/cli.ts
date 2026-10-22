import { parseArgs } from 'node:util';
import { readFileSync } from 'node:fs';
import { runInteractive, snapshot } from './app.ts';
import { claudeRoot } from './claude/paths.ts';
import { loadConfig } from './config.ts';
import { detectPixelMode } from './term/renderer.ts';
import { THEMES, getTheme, themeIds } from './themes/index.ts';

export const USAGE = `usage: animus [options]

  Watch your Claude Code agents work as pixel characters in an isometric room.

options:
  -t, --theme <id>      scene preset (see --list-themes)
      --demo            simulated crew instead of live Claude data
      --fps <n>         frames per second (default 18)
      --pixels <mode>   auto, half or sextant (2x3 pixels per cell; default auto)
      --claude-dir <p>  Claude config dir (default $CLAUDE_CONFIG_DIR or ~/.claude)
      --list-themes     list scene presets
      --snapshot        render one frame to stdout and exit
      --width <n>       snapshot width (default 120)
      --height <n>      snapshot height (default 36)
      --at <seconds>    snapshot simulation time (default 12)
  -h, --help            show this help
  -v, --version         show version
`;

function version(): string {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return String(pkg.version);
}

export async function main(argv: string[]): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      strict: true,
      allowPositionals: false,
      options: {
        theme: { type: 'string', short: 't' },
        demo: { type: 'boolean' },
        fps: { type: 'string' },
        pixels: { type: 'string' },
        'claude-dir': { type: 'string' },
        'list-themes': { type: 'boolean' },
        snapshot: { type: 'boolean' },
        width: { type: 'string' },
        height: { type: 'string' },
        at: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
    }));
  } catch (err) {
    process.stderr.write(`animus: ${(err as Error).message}\n\n${USAGE}`);
    return 2;
  }

  if (values.help) {
    process.stdout.write(USAGE);
    return 0;
  }
  if (values.version) {
    process.stdout.write(`animus ${version()}\n`);
    return 0;
  }
  if (values['list-themes']) {
    for (const t of THEMES) process.stdout.write(`${t.id.padEnd(9)}${t.name} — ${t.tagline}\n`);
    return 0;
  }

  const fail = (msg: string) => {
    process.stderr.write(`animus: ${msg}\n`);
    return 2;
  };
  const num = (name: string, raw: string | undefined, def: number, min: number, max: number): number | null => {
    if (raw === undefined) return def;
    const n = Number(raw);
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
  };

  let theme = values.theme ? getTheme(values.theme) : undefined;
  if (values.theme && !theme) return fail(`unknown theme "${values.theme}" (try: ${themeIds().join(', ')})`);
  theme ??= getTheme(loadConfig().theme ?? '') ?? THEMES[0];

  const fps = num('fps', values.fps, 18, 1, 60);
  if (fps === null) return fail('--fps must be a number from 1 to 60');
  const root = claudeRoot(values['claude-dir']);
  const demo = Boolean(values.demo);
  const want = values.pixels ?? loadConfig().pixels ?? 'auto';
  if (want !== 'auto' && want !== 'half' && want !== 'sextant') return fail('--pixels must be auto, half or sextant');
  const pixels = want === 'auto' ? detectPixelMode() : want;
  const lights = loadConfig().lights ?? true;

  if (values.snapshot) {
    const width = num('width', values.width, 120, 20, 1000);
    const height = num('height', values.height, 36, 8, 500);
    const at = num('at', values.at, 12, 0, 3600);
    if (width === null || height === null || at === null) return fail('--width/--height/--at must be positive numbers');
    process.stdout.write(snapshot({ theme, demo, fps, root, pixels, lights, width: Math.floor(width), height: Math.floor(height), at }) + '\n');
    return 0;
  }
  return runInteractive({ theme, demo, fps, root, pixels, lights });
}
