// The kitty graphics protocol (kitty, Ghostty, WezTerm): an image sent as
// base64 in APC escape chunks and placed at the cursor. animus uses it for
// its HD mode: the scene as a real true-colour image instead of two colours
// per character cell.

// Terminals known to speak the protocol (env inherited by multiplexers is
// a heuristic; --pixels picks the mode explicitly).
export function supportsImages(env: NodeJS.ProcessEnv = process.env): boolean {
  const term = env.TERM ?? '';
  const prog = env.TERM_PROGRAM ?? '';
  if (env.KITTY_WINDOW_ID || env.GHOSTTY_RESOURCES_DIR || env.WEZTERM_PANE) return true;
  if (term === 'xterm-kitty' || term === 'xterm-ghostty') return true;
  return prog === 'ghostty' || prog === 'WezTerm';
}

// Terminals that can patch part of an image already shown (frame editing:
// a=f on the root frame), so HD sends only what changed; the rest get
// whole frames. Only kitty: WezTerm handles a frame edit only when it fits
// one escape (it does not gather a=f chunks), and Ghostty gained frame
// editing after its latest release (1.3.1).
export function supportsFramePatches(env: NodeJS.ProcessEnv = process.env): boolean {
  const term = env.TERM ?? '';
  const prog = env.TERM_PROGRAM ?? '';
  if (env.GHOSTTY_RESOURCES_DIR || env.WEZTERM_PANE || term === 'xterm-ghostty' || prog === 'ghostty' || prog === 'WezTerm') return false;
  return Boolean(env.KITTY_WINDOW_ID) || term === 'xterm-kitty';
}

// Below every cell with a non-default background: the scene's cells are
// left at the default background so the image shows through them, while
// labels and the UI (which set a background) stay on top.
export const UNDER_CELLS = -1_073_741_825;

const CHUNK = 4096; // base64 bytes per escape, the protocol's limit

// Transmits `png` and shows it at the cursor (`dx`, `dy`: pixel offsets
// inside that first cell), replacing any earlier image with the same id.
// The cursor stays put; the terminal's replies are suppressed.
export function imageCommand(png: Uint8Array, o: { id: number; dx?: number; dy?: number; z?: number }): string {
  return escapes(png, `a=T,f=100,i=${o.id},p=1,q=2,C=1,z=${o.z ?? UNDER_CELLS}${o.dx ? `,X=${o.dx}` : ''}${o.dy ? `,Y=${o.dy}` : ''},`, '');
}

// Paints `png` (w x h px) over image `id` with its top-left at pixel
// (x, y): an edit of the image's root frame (r=1), overwriting (X=1), which
// the terminal shows at once. Frame data needs a=f on every chunk.
export function frameCommand(png: Uint8Array, o: { id: number; x: number; y: number; w: number; h: number }): string {
  return escapes(png, `a=f,r=1,f=100,i=${o.id},x=${o.x},y=${o.y},s=${o.w},v=${o.h},X=1,q=2,`, 'a=f,q=2,');
}

// `data` as base64 in escapes of at most CHUNK bytes, the first with the
// `first` keys, the rest with `rest`, each flagged m=1 until the last.
function escapes(data: Uint8Array, first: string, rest: string): string {
  const b64 = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString('base64');
  const out: string[] = [];
  for (let i = 0; i < b64.length || i === 0; i += CHUNK) {
    const more = i + CHUNK < b64.length ? 1 : 0;
    out.push(`\x1b_G${i === 0 ? first : rest}m=${more};${b64.slice(i, i + CHUNK)}\x1b\\`);
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
