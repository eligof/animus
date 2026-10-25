import type { Screen } from './screen.ts';
import { rgbTo256 } from './color.ts';
import { BOLD } from './screen.ts';

export type ColorMode = 'truecolor' | '256';

export function detectColorMode(env: NodeJS.ProcessEnv = process.env): ColorMode {
  const ct = (env.COLORTERM ?? '').toLowerCase();
  return ct === 'truecolor' || ct === '24bit' ? 'truecolor' : '256';
}

// One colour slot of an SGR: `base` 38 (fg) or 48 (bg); -1 (DEFAULT) is the
// terminal's own colour (39 / 49).
function slot(mode: ColorMode, c: number, base: number): string {
  if (c === -1) return String(base + 1);
  const rgb: [number, number, number] = [(c >> 16) & 255, (c >> 8) & 255, c & 255];
  return mode === 'truecolor' ? `${base};2;${rgb[0]};${rgb[1]};${rgb[2]}` : `${base};5;${rgbTo256(rgb)}`;
}

function sgr(mode: ColorMode, fg: number, bg: number): string {
  return `\x1b[${slot(mode, fg, 38)};${slot(mode, bg, 48)}m`;
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
