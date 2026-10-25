// Codepoints that terminals draw two cells wide (East Asian Wide/Fullwidth and
// emoji-presentation symbols). Animus only draws width-1 glyphs, so art and UI
// strings are linted against this list in tests.
const WIDE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0],
  [0x23f3, 0x23f3], [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f],
  [0x2693, 0x2693], [0x26a1, 0x26a1], [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5],
  [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea], [0x26f2, 0x26f3], [0x26f5, 0x26f5],
  [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b], [0x2728, 0x2728],
  [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55],
  [0x2e80, 0x303e], [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf],
  [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x16fe0, 0x16fe4], [0x17000, 0x18cff], [0x18d00, 0x18d8f],
  [0x1aff0, 0x1b2ff], [0x1f000, 0x1faff], [0x20000, 0x3fffd],
];

const cache = new Map<string, boolean>();

export function isWide(ch: string): boolean {
  const hit = cache.get(ch);
  if (hit !== undefined) return hit;
  const cp = ch.codePointAt(0);
  let wide = false;
  if (cp !== undefined && cp >= 0x1100) {
    for (const [lo, hi] of WIDE_RANGES) {
      if (cp >= lo && cp <= hi) {
        wide = true;
        break;
      }
    }
  }
  if (cache.size < 4096) cache.set(ch, wide);
  return wide;
}

// Zero-width code points (format/bidi controls, combining marks, tag
// characters, medial Hangul jamo) would shift or reorder the cells after
// them, so drawn text drops them.
export const INVISIBLE = /[\p{Cf}\p{M}\u1160-\u11ff\ud7b0-\ud7ff\u{e0000}-\u{e0fff}\u2028\u2029]/u;
// C0 and C1 controls, DEL among them.
export const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

// The one rule for putting untrusted text into cells: tab becomes a space,
// control and zero-width characters are dropped ('' ), anything two cells
// wide becomes '?', everything else passes through.
export function cellSafe(ch: string): string {
  if (ch === '\t') return ' ';
  if (CONTROL.test(ch) || INVISIBLE.test(ch)) return '';
  return isWide(ch) ? '?' : ch;
}
