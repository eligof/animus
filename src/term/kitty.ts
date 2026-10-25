// The kitty graphics protocol (kitty, Ghostty, WezTerm): an image sent as
// base64 in APC escape chunks and placed at the cursor. animus uses it for
// the scene: the illustrated room as a real true-colour image under the
// terminal's cells.

// Terminals known to speak the protocol (env inherited by multiplexers is
// a heuristic; --view picks explicitly).
export function supportsImages(env: NodeJS.ProcessEnv = process.env): boolean {
  const term = env.TERM ?? '';
  const prog = env.TERM_PROGRAM ?? '';
  if (env.KITTY_WINDOW_ID || env.GHOSTTY_RESOURCES_DIR || env.WEZTERM_PANE) return true;
  if (term === 'xterm-kitty' || term === 'xterm-ghostty') return true;
  return prog === 'ghostty' || prog === 'WezTerm';
}

// Below every cell with a non-default background: the scene's cells are
// left at the default background so the image shows through them, while
// labels and the UI (which set a background) stay on top. (No terminal is
// sent part of an image: Ghostty cannot patch one, WezTerm only within one
// escape; the scene stacks a still back and a mostly clear front instead.)
export const UNDER_CELLS = -1_073_741_825;

const CHUNK = 4096; // base64 bytes per escape, the protocol's limit

// Transmits `png` and shows it at the cursor (`dx`, `dy`: pixel offsets
// inside that first cell; `cols` x `rows`: the cells it is fitted to, else
// its own size), replacing any earlier image with the same id (and its
// placements). The cursor stays put; the terminal's replies are suppressed.
// Only the first chunk carries the keys: the rest inherit them.
export function imageCommand(png: Uint8Array, o: { id: number; dx?: number; dy?: number; cols?: number; rows?: number; z?: number }): string {
  const fit = `${o.cols ? `,c=${o.cols}` : ''}${o.rows ? `,r=${o.rows}` : ''}`;
  return escapes(png, `a=T,f=100,i=${o.id},p=1,q=2,C=1,z=${o.z ?? UNDER_CELLS}${o.dx ? `,X=${o.dx}` : ''}${o.dy ? `,Y=${o.dy}` : ''}${fit},`);
}

// `data` as base64 in escapes of at most CHUNK bytes, the first with the
// `first` keys, each flagged m=1 until the last.
function escapes(data: Uint8Array, first: string): string {
  const b64 = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
  const out: string[] = [];
  for (let i = 0; i < b64.length || i === 0; i += CHUNK) {
    const more = i + CHUNK < b64.length ? 1 : 0;
    out.push(`\x1b_G${i === 0 ? first : ''}m=${more};${b64.slice(i, i + CHUNK)}\x1b\\`);
  }
  return out.join('');
}

// Deletes one image (and frees its data), or every image when no id.
export function deleteImages(id?: number): string {
  return id === undefined ? '\x1b_Ga=d,d=A,q=2\x1b\\' : `\x1b_Ga=d,d=I,i=${id},q=2\x1b\\`;
}

// Asks for the size of a character cell in pixels (CSI 16 t); the answer,
// CSI 6 ; height ; width t, arrives on stdin.
export const CELL_SIZE_QUERY = '\x1b[16t';

export function parseCellSize(data: string): { w: number; h: number } | null {
  const m = /\x1b\[6;(\d+);(\d+)t/.exec(data);
  if (!m) return null;
  const h = Number(m[1]);
  const w = Number(m[2]);
  return w > 0 && h > 0 && w < 200 && h < 400 ? { w, h } : null;
}
