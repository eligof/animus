import type { Rect } from '../term/screen.ts';

export type Layout = { header: Rect; scene: Rect; roster: Rect | null; footer: Rect; tooSmall: boolean };

export const MIN_COLS = 60;
export const MIN_ROWS = 20;
// The crew sits down the left: it is the index you read first, the room
// the thing it indexes (master, then detail, as in lazygit or k9s).
const ROSTER_W = 28;
const ROSTER_WIDE = 30;
const ROSTER_MIN_COLS = 110;

// `full`: the scene takes the whole terminal (no header, roster or footer).
// `bar`: the crew bar shows where there is room for it (b hides it).
export function computeLayout(cols: number, rows: number, full = false, bar = true): Layout {
  const tooSmall = cols < MIN_COLS || rows < MIN_ROWS;
  if (full) {
    return {
      header: { x: 0, y: 0, w: cols, h: 0 },
      scene: { x: 0, y: 0, w: cols, h: rows },
      roster: null,
      footer: { x: 0, y: rows, w: cols, h: 0 },
      tooSmall,
    };
  }
  const bodyH = Math.max(0, rows - 3);
  const rw = cols >= 150 ? ROSTER_WIDE : ROSTER_W;
  const roster = bar && cols >= ROSTER_MIN_COLS ? { x: 0, y: 1, w: rw, h: bodyH } : null;
  return {
    header: { x: 0, y: 0, w: cols, h: 1 },
    scene: { x: roster ? rw : 0, y: 1, w: roster ? cols - rw : cols, h: bodyH },
    roster,
    footer: { x: 0, y: Math.max(0, rows - 2), w: cols, h: 2 },
    tooSmall,
  };
}
