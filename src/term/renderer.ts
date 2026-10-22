import type { Screen } from './screen.ts';
import { rgbTo256 } from './color.ts';
import { BOLD } from './screen.ts';

export type ColorMode = 'truecolor' | '256';

export function detectColorMode(env: NodeJS.ProcessEnv = process.env): ColorMode {
  const ct = (env.COLORTERM ?? '').toLowerCase();
  return ct === 'truecolor' || ct === '24bit' ? 'truecolor' : '256';
}

function sgr(mode: ColorMode, fg: number, bg: number): string {
  if (mode === 'truecolor') {
    return `\x1b[38;2;${(fg >> 16) & 255};${(fg >> 8) & 255};${fg & 255};48;2;${(bg >> 16) & 255};${(bg >> 8) & 255};${bg & 255}m`;
  }
  const f = rgbTo256([(fg >> 16) & 255, (fg >> 8) & 255, fg & 255]);
  const b = rgbTo256([(bg >> 16) & 255, (bg >> 8) & 255, bg & 255]);
  return `\x1b[38;5;${f};48;5;${b}m`;
}

// Whole screen as plain ANSI lines (no cursor addressing), for snapshots
// that are printed or piped rather than drawn into a live terminal.
export function renderLines(s: Screen, mode: ColorMode): string {
  const lines: string[] = [];
  for (let y = 0; y < s.height; y++) {
    const out: string[] = [];
    let curFg = -1;
    let curBg = -1;
    let curAttr = 0;
    for (let x = 0; x < s.width; x++) {
      const i = y * s.width + x;
      if (s.attr[i] !== curAttr) {
        out.push(s.attr[i] & BOLD ? '\x1b[1m' : '\x1b[22m');
        curAttr = s.attr[i];
      }
      if (s.fg[i] !== curFg || s.bg[i] !== curBg) {
        out.push(sgr(mode, s.fg[i], s.bg[i]));
        curFg = s.fg[i];
        curBg = s.bg[i];
      }
      out.push(s.ch[i]);
    }
    lines.push(out.join('') + '\x1b[0m');
  }
  return lines.join('\n');
}

// Terminals known to draw the 2x3 sextant glyphs (U+1FB00..) themselves,
// pixel-exact; everything else gets half blocks.
export function detectPixelMode(env: NodeJS.ProcessEnv = process.env): 'half' | 'sextant' {
  const term = env.TERM ?? '';
  const prog = env.TERM_PROGRAM ?? '';
  if (env.ALACRITTY_WINDOW_ID || env.ALACRITTY_SOCKET || env.KITTY_WINDOW_ID || env.WEZTERM_PANE || env.GHOSTTY_RESOURCES_DIR) return 'sextant';
  if (/^(xterm-kitty|xterm-ghostty|foot|foot-extra|wezterm|alacritty)$/.test(term)) return 'sextant';
  if (prog === 'WezTerm' || prog === 'ghostty') return 'sextant';
  return 'half';
}

const SYNC_ON = '\x1b[?2026h';
const SYNC_OFF = '\x1b[?2026l';

// Turns a Screen into the minimal ANSI needed to update the terminal from the
// previously rendered frame.
export class Renderer {
  private mode: ColorMode;
  private prevCh: string[] | null = null;
  private prevFg: Int32Array | null = null;
  private prevBg: Int32Array | null = null;
  private prevAttr: Uint8Array | null = null;
  private prevW = -1;
  private prevH = -1;

  constructor(mode: ColorMode) {
    this.mode = mode;
  }

  invalidate(): void {
    this.prevCh = null;
  }

  render(s: Screen): string {
    const full = this.prevCh === null || this.prevW !== s.width || this.prevH !== s.height;
    const out: string[] = [];
    let curFg = -1;
    let curBg = -1;
    let curAttr = -1;
    let cx = -1;
    let cy = -1;
    for (let y = 0; y < s.height; y++) {
      for (let x = 0; x < s.width; x++) {
        const i = y * s.width + x;
        if (
          !full &&
          this.prevCh![i] === s.ch[i] &&
          this.prevFg![i] === s.fg[i] &&
          this.prevBg![i] === s.bg[i] &&
          this.prevAttr![i] === s.attr[i]
        ) {
          continue;
        }
        if (cx !== x || cy !== y) out.push(`\x1b[${y + 1};${x + 1}H`);
        const attr = s.attr[i];
        if (attr !== curAttr) {
          out.push(attr & BOLD ? '\x1b[1m' : '\x1b[22m');
          curAttr = attr;
        }
        if (s.fg[i] !== curFg || s.bg[i] !== curBg) {
          out.push(sgr(this.mode, s.fg[i], s.bg[i]));
          curFg = s.fg[i];
          curBg = s.bg[i];
        }
        out.push(s.ch[i]);
        cx = x + 1;
        cy = y;
      }
    }
    this.prevCh = s.ch.slice();
    this.prevFg = s.fg.slice();
    this.prevBg = s.bg.slice();
    this.prevAttr = s.attr.slice();
    this.prevW = s.width;
    this.prevH = s.height;
    if (out.length === 0) return '';
    return SYNC_ON + out.join('') + '\x1b[0m' + SYNC_OFF;
  }
}
