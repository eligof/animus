import type { Rect } from '../term/screen.ts';

export type Layout = { header: Rect; scene: Rect; roster: Rect | null; footer: Rect; tooSmall: boolean };

export const MIN_COLS = 60;
export const MIN_ROWS = 20;
const ROSTER_W = 28;
const ROSTER_MIN_COLS = 110;

export function computeLayout(cols: number, rows: number): Layout {
  const tooSmall = cols < MIN_COLS || rows < MIN_ROWS;
  const bodyH = Math.max(0, rows - 3);
  const roster = cols >= ROSTER_MIN_COLS ? { x: cols - ROSTER_W, y: 1, w: ROSTER_W, h: bodyH } : null;
  return {
    header: { x: 0, y: 0, w: cols, h: 1 },
    scene: { x: 0, y: 1, w: roster ? cols - ROSTER_W : cols, h: bodyH },
    roster,
    footer: { x: 0, y: Math.max(0, rows - 2), w: cols, h: 2 },
    tooSmall,
  };
}
