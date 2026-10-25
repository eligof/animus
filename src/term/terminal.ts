import { parseCellSize } from './kitty.ts';

// A key, by name: a printable one is its character ('q', 'T', '1'); the
// others are named ('enter', 'ctrl-c', 'up'). Alt with a printable key
// (which terminals send as ESC and the key) is 'alt-' and its name
// ('alt-q', 'alt-space'), Alt+Backspace 'alt-backspace': none of them
// types (`ch` is '').
export type Key = { name: string; ch: string; ctrl: boolean; shift: boolean };

const SEQUENCES: Record<string, string> = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left',
  '\x1b[Z': 'shift-tab', '\x1b[H': 'home', '\x1b[F': 'end',
  '\x1b[5~': 'pageup', '\x1b[6~': 'pagedown', '\x1b[3~': 'delete',
  // A bracketed paste's start and end (see Terminal.enter).
  '\x1b[200~': 'paste-start', '\x1b[201~': 'paste-end',
};

// Puts `text` on the terminal's clipboard (OSC 52: Ghostty, kitty and
// WezTerm take it; others ignore it). Base64 keeps whatever it holds inert.
export function osc52(text: string): string {
  return `\x1b]52;c;${Buffer.from(text, 'utf8').toString('base64')}\x07`;
}

// ECMA-48: a control sequence ends with a byte in 0x40-0x7E. rxvt also ends
// shifted keys with '$' (e.g. ESC [ 2 $ = Shift+Insert); keyboard input never
// carries real intermediate bytes, so '$' counts as final too.
const CSI_FINAL = /[\x40-\x7e$]/;

const key = (name: string, ch = '', ctrl = false, shift = false): Key => ({ name, ch, ctrl, shift });

export function parseKeys(data: string): Key[] {
  const keys: Key[] = [];
  let i = 0;
  while (i < data.length) {
    const c = data[i];
    if (c === '\x1b') {
      const seq = Object.keys(SEQUENCES).find((s) => data.startsWith(s, i));
      if (seq) {
        const name = SEQUENCES[seq];
        keys.push(key(name, '', false, name === 'shift-tab'));
        i += seq.length;
        continue;
      }
      if (data[i + 1] === '[' || data[i + 1] === 'O') {
        // Unknown CSI/SS3 sequence: skip to its final byte.
        let j = i + 2;
        while (j < data.length && !CSI_FINAL.test(data[j])) j++;
        i = j + 1;
        continue;
      }
      // ESC and a printable key (or DEL) together: the key with Alt.
      const cp = data.codePointAt(i + 1);
      if (cp !== undefined && (cp === 0x7f || (cp >= 0x20 && !(cp >= 0x80 && cp < 0xa0)))) {
        const c = String.fromCodePoint(cp);
        const name = cp === 0x7f ? 'backspace' : c === ' ' ? 'space' : c;
        keys.push(key(`alt-${name}`, '', false, c !== c.toLowerCase()));
        i += 1 + c.length;
        continue;
      }
      keys.push(key('escape'));
      i++;
      continue;
    }
    if (c === '\x03') keys.push(key('ctrl-c', '', true));
    else if (c === '\t') keys.push(key('tab'));
    else if (c === '\r' || c === '\n') keys.push(key('enter'));
    else if (c === '\x7f' || c === '\b') keys.push(key('backspace'));
    else if (c === ' ') keys.push(key('space', ' '));
    else if (c < ' ') keys.push(key(`ctrl-${String.fromCharCode(c.charCodeAt(0) + 96)}`, '', true));
    else keys.push(key(c, c, false, c !== c.toLowerCase()));
    i++;
  }
  return keys;
}

// A paste that has sent nothing for this long is over, its end marker lost.
// Long: a stall (a slow ssh link, a busy terminal) of a second or more in the
// middle of a real paste must not end it, or a newline in the rest would
// submit the draft.
export const PASTE_QUIET_MS = 2500;

// True when `tail` (starting at ESC) could still grow into a longer sequence.
function incompleteEscape(tail: string): boolean {
  if (tail === '\x1b') return true;
  if (tail.startsWith('\x1b[')) return !CSI_FINAL.test(tail.slice(2));
  if (tail.startsWith('\x1bO')) return tail.length < 3;
  return false;
}

// Stateful wrapper around parseKeys: holds back a trailing, unfinished
// escape sequence until the next read (terminals may split them), and lets
// the caller flush a lone ESC after a short pause. It knows when it is
// inside a bracketed paste, where what it holds is never flushed early:
// it is most likely the paste's end marker, split.
export class KeyDecoder {
  private held = '';
  private inPaste = false;

  push(data: string): Key[] {
    const buf = this.held + data;
    const esc = buf.lastIndexOf('\x1b');
    let keys: Key[];
    if (esc >= 0 && incompleteEscape(buf.slice(esc))) {
      this.held = buf.slice(esc);
      keys = parseKeys(buf.slice(0, esc));
    } else {
      this.held = '';
      keys = parseKeys(buf);
    }
    for (const k of keys) if (k.name === 'paste-start' || k.name === 'paste-end') this.inPaste = k.name === 'paste-start';
    return keys;
  }

  pending(): boolean {
    return this.held !== '';
  }

  // Inside a bracketed paste (its start read, its end not yet).
  get pasting(): boolean {
    return this.inPaste;
  }

  flush(): Key[] {
    const held = this.held;
    this.held = '';
    if (!held) return [];
    return held.startsWith('\x1b') ? [key('escape')] : parseKeys(held);
  }

  // A paste gone quiet is over: what is held (part of a lost end marker)
  // goes, and its end is given.
  quiet(): Key[] {
    if (!this.inPaste) return [];
    this.held = '';
    this.inPaste = false;
    return [key('paste-end')];
  }
}

// Owns the TTY while animus runs: alternate screen, hidden cursor, raw input.
// restore() is idempotent so it can run from every exit path.
export class Terminal {
  private out: NodeJS.WriteStream;
  private inp: NodeJS.ReadStream;
  private active = false;

  constructor(out: NodeJS.WriteStream = process.stdout, inp: NodeJS.ReadStream = process.stdin) {
    this.out = out;
    this.inp = inp;
  }

  get cols(): number {
    return this.out.columns || 80;
  }

  get rows(): number {
    return this.out.rows || 24;
  }

  enter(): void {
    if (this.active) return;
    this.active = true;
    // Bracketed paste on (2004): a paste arrives marked, so the chat can
    // take it as text.
    this.out.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[?2004h\x1b[2J');
    if (this.inp.isTTY) this.inp.setRawMode(true);
    this.inp.setEncoding('utf8');
    this.inp.resume();
  }

  restore(): void {
    if (!this.active) return;
    this.active = false;
    this.out.write('\x1b[0m\x1b[?2004l\x1b[?7h\x1b[?25h\x1b[?1049l');
    if (this.inp.isTTY) this.inp.setRawMode(false);
    this.inp.pause();
  }

  get congested(): boolean {
    return Boolean(this.out.writableNeedDrain);
  }

  write(s: string): void {
    if (s) this.out.write(s);
  }

  // Called with the cell size in pixels when the terminal answers
  // CELL_SIZE_QUERY (the answer arrives mixed into the key input).
  onCellSize(cb: (size: { w: number; h: number }) => void): void {
    this.cellCb = cb;
  }

  private cellCb: ((size: { w: number; h: number }) => void) | undefined;

  onKey(cb: (k: Key) => void): void {
    const decoder = new KeyDecoder();
    let timer: NodeJS.Timeout | undefined;
    this.inp.on('data', (d: string | Buffer) => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const size = parseCellSize(String(d));
      if (size) this.cellCb?.(size);
      for (const k of decoder.push(String(d))) cb(k);
      // A lone ESC is Esc after a moment; inside a paste nothing is
      // flushed, and a paste that goes quiet ends.
      if (decoder.pasting) {
        timer = setTimeout(() => {
          for (const k of decoder.quiet()) cb(k);
        }, PASTE_QUIET_MS);
      } else if (decoder.pending()) {
        timer = setTimeout(() => {
          for (const k of decoder.flush()) cb(k);
        }, 30);
      }
    });
  }

  onResize(cb: () => void): void {
    this.out.on('resize', cb);
  }
}
