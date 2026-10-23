import { parseCellSize } from './kitty.ts';

export type Key = { name: string; ch: string; ctrl: boolean; shift: boolean };

const SEQUENCES: Record<string, string> = {
  '\x1b[A': 'up', '\x1b[B': 'down', '\x1b[C': 'right', '\x1b[D': 'left',
  '\x1bOA': 'up', '\x1bOB': 'down', '\x1bOC': 'right', '\x1bOD': 'left',
  '\x1b[Z': 'shift-tab', '\x1b[H': 'home', '\x1b[F': 'end',
  '\x1b[5~': 'pageup', '\x1b[6~': 'pagedown', '\x1b[3~': 'delete',
};

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

// True when `tail` (starting at ESC) could still grow into a longer sequence.
function incompleteEscape(tail: string): boolean {
  if (tail === '\x1b') return true;
  if (tail.startsWith('\x1b[')) return !CSI_FINAL.test(tail.slice(2));
  if (tail.startsWith('\x1bO')) return tail.length < 3;
  return false;
}

// Stateful wrapper around parseKeys: holds back a trailing, unfinished
// escape sequence until the next read (terminals may split them), and lets
// the caller flush a lone ESC after a short pause.
export class KeyDecoder {
  private held = '';

  push(data: string): Key[] {
    const buf = this.held + data;
    const esc = buf.lastIndexOf('\x1b');
    if (esc >= 0 && incompleteEscape(buf.slice(esc))) {
      this.held = buf.slice(esc);
      return parseKeys(buf.slice(0, esc));
    }
    this.held = '';
    return parseKeys(buf);
  }

  pending(): boolean {
    return this.held !== '';
  }

  flush(): Key[] {
    const held = this.held;
    this.held = '';
    if (!held) return [];
    return held.startsWith('\x1b') ? [key('escape')] : parseKeys(held);
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
    this.out.write('\x1b[?1049h\x1b[?25l\x1b[?7l\x1b[2J');
    if (this.inp.isTTY) this.inp.setRawMode(true);
    this.inp.setEncoding('utf8');
    this.inp.resume();
  }

  restore(): void {
    if (!this.active) return;
    this.active = false;
    this.out.write('\x1b[0m\x1b[?7h\x1b[?25h\x1b[?1049l');
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
      const size = parseCellSize(String(d));
      if (size) this.cellCb?.(size);
      for (const k of decoder.push(String(d))) cb(k);
      if (decoder.pending()) {
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
