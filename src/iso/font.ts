// A 5x7 pixel font for drawing name tags straight into HD frames: classic
// LCD/terminal shapes, caps and ascenders 7 rows tall, lowercase 5. Glyphs
// have an 8th row for descenders (g j p q y , ; _), whose bodies sit a row
// higher to make room, C64 style. Monospaced: 6 px per character.

export const GLYPH_W = 5;
export const GLYPH_H = 8;
export const ADVANCE = 6;

// One glyph per space-separated word, from ' ' (32) to '~' (126). Each
// character of a word is a row, top first, as a base-32 digit whose bit 4
// is the left column; rows left off the end are blank.
const ASCII =
  '0 4444404 aa aavavaa 4fke5u4 op248j3 cik8lid 44 2488842 8422248 04lel4 044v44 00000448 000e 0000004 11248gg ' +
  'ehjlphe 4ck444v eh1248v eh161he 26aiv22 vgu11he 68guhhe v124888 ehhehhe ehhf12c 004004 00400448 024842 00v0v 084248 eh12404 ' +
  'ehnlnge ehhvhhh uhhuhhu ehggghe sihhhis vgguggv vgguggg ehgnhhf hhhvhhh e44444e 72222ic hikokih ggggggv hrllhhh hhpljhh ehhhhhe ' +
  'uhhuggg ehhhlid uhhukih ehge1he v444444 hhhhhhe hhhhha4 hhhllla hha4ahh hha4444 v1248gv e88888e gg84211 e22222e 4ah 0000000v ' +
  '84 00e1fhf ggmphhu 00egghe 11djhhf 00ehvge 68u8888 00fhhf1e ggmphhh 40c444e 206222ic ggikoki c444443 00qllll 00mphhh 00ehhhe ' +
  '00uhhugg 00fhhf11 00mpggg 00fge1u 08u8896 00hhhjd 00hhha4 00hhlla 00ha4ah 00hhhf1e 00v248v 3448443 4444444 o44244o 00di';

// The activity marks shown in tags, as little icons in the same format.
const SYMBOLS = '✎▤◎▶≋⇢…»✔◌✖·';
const SYMBOL_ROWS = '035akog vhvhvhv 0ehlhe 8cefec8 0di0di 042n24 000000l 0ka5ak 013ms8 0ah0ha 0re4er 0004';

function rows(word: string): Uint8Array {
  const g = new Uint8Array(GLYPH_H);
  for (let r = 0; r < word.length; r++) g[r] = parseInt(word[r], 32);
  return g;
}

const GLYPHS = new Map<string, Uint8Array>();
ASCII.split(' ').forEach((w, i) => GLYPHS.set(String.fromCharCode(32 + i), rows(w)));
const symbolRows = SYMBOL_ROWS.split(' ');
[...SYMBOLS].forEach((ch, i) => GLYPHS.set(ch, rows(symbolRows[i])));
// Stands in for anything the font lacks.
const BOX = rows('0vhhhv');

// The rows of a character's glyph as bitmasks (0x10 = left column), or
// null if the font lacks it. Shared: don't modify.
export function glyph(ch: string): Uint8Array | null {
  return GLYPHS.get(ch) ?? null;
}

// Width in pixels of `text` set in the font (no gap after the last glyph).
export function textWidth(text: string): number {
  let n = 0;
  for (const _ of text) n++;
  return n === 0 ? 0 : n * ADVANCE - 1;
}

// Calls `plot` for every lit pixel of `text` with its first glyph's
// top-left at (x, y). The building block for drawing into any pixel store.
export function plotText(x: number, y: number, text: string, plot: (x: number, y: number) => void): void {
  for (const ch of text) {
    const g = GLYPHS.get(ch) ?? BOX;
    for (let r = 0; r < GLYPH_H; r++) {
      const bits = g[r];
      if (bits) for (let c = 0; c < GLYPH_W; c++) if (bits & (0x10 >> c)) plot(x + c, y + r);
    }
    x += ADVANCE;
  }
}

export type TextTarget = { w: number; h: number; data: Int32Array };
export type TextOpts = { shadow?: number; bg?: number; pad?: number };

// Draws `text` in `color` (0xRRGGBB) with its top-left at (x, y) into a
// packed-RGB canvas, clipped to its edges. `shadow` adds a 1 px drop shadow
// down-right; `bg` fills the text's box (glyph height, descenders included)
// grown by `pad` px on each side.
export function drawText(target: TextTarget, x: number, y: number, text: string, color: number, opts: TextOpts = {}): void {
  const { w, h, data } = target;
  x = Math.floor(x);
  y = Math.floor(y);
  if (opts.bg !== undefined) {
    const pad = opts.pad ?? 1;
    const x0 = Math.max(0, x - pad);
    const x1 = Math.min(w, x + textWidth(text) + pad);
    const y1 = Math.min(h, y + GLYPH_H + pad);
    if (x0 < x1) for (let py = Math.max(0, y - pad); py < y1; py++) data.fill(opts.bg, py * w + x0, py * w + x1);
  }
  const ink = (v: number) => (px: number, py: number) => {
    if (px >= 0 && py >= 0 && px < w && py < h) data[py * w + px] = v;
  };
  if (opts.shadow !== undefined) plotText(x + 1, y + 1, text, ink(opts.shadow));
  plotText(x, y, text, ink(color));
}
