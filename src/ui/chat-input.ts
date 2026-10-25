import type { Key } from '../term/terminal.ts';
import { CONTROL, INVISIBLE, cellSafe } from '../term/width.ts';

// The chat window's input line: one line of text and a cursor. Every
// printable key types itself (q types q, 1 types 1); the editing keys move
// and delete, readline's way: Home/End and ctrl-a/ctrl-e to the ends,
// ctrl-u deletes to the start, alt-b/alt-f move a word left/right and
// alt-backspace deletes the word before the cursor (a word: a run of
// non-spaces). Other alt keys type nothing. Enter and Esc are the window's
// (see chat.ts).

export const MAX_INPUT = 2000; // code points

const blank = (c: string) => /^\s/.test(c);

const points = (c: string) => [...c].length;

// Characters that never display yet reach the agent: bidi controls, line and
// paragraph separators, variation selectors 17-256 (U+E0100-E01EF).
const HIDDEN = /^[\u202a-\u202e\u2066-\u2069\u2028\u2029\u{e0100}-\u{e01ef}]$/u;
// Tag characters (U+E0000-E007F) can spell hidden instructions. Only the
// tail of a subdivision flag survives: a black flag, 2-7 tag letters or
// digits, then CANCEL TAG.
const TAG = /^[\u{e0000}-\u{e007f}]$/u;
const flagOpen = (before: string, c: string): boolean => {
  const body = /^\u{1f3f4}([\u{e0030}-\u{e0039}\u{e0061}-\u{e007a}]*)$/u.exec(before)?.[1];
  if (body === undefined) return false;
  const n = [...body].length;
  return c === '\u{e007f}' ? n >= 2 : n < 7 && /[\u{e0030}-\u{e0039}\u{e0061}-\u{e007a}]/u.test(c);
};

const FLAG_OR_TAG = /(\u{1f3f4}[\u{e0030}-\u{e0039}\u{e0061}-\u{e007a}]{2,7}\u{e007f})|[\u{e0000}-\u{e007f}]/gu;

export class ChatInput {
  // A character each, so the cursor never splits one: a code point, with
  // the zero-width ones typed after it (combining marks, a joiner and what
  // it joins), kept as typed.
  private chars: string[] = [];
  private size = 0; // code points in all
  cursor = 0;
  // The first half of a character that arrives as two keys (an emoji is
  // two UTF-16 halves, and the terminal reader makes a key of each).
  private high = '';

  // The text taken for sending or copying: tags that are not part of a
  // complete flag (a flag still being typed) are dropped, its flag stays.
  get text(): string {
    return this.chars.join('').replace(FLAG_OR_TAG, (m, flag?: string) => flag ?? '');
  }

  // The line as the screen draws it: a cell per character, through
  // cellSafe (its marks take none); '?' for a wide one, a joined sequence,
  // or one that would draw nothing.
  get shown(): string[] {
    return this.chars.map((c) => {
      const cells = [...c].map(cellSafe).filter(Boolean);
      return cells.length === 1 ? cells[0] : '?';
    });
  }

  clear(): void {
    this.chars = [];
    this.size = 0;
    this.cursor = 0;
    this.high = '';
  }

  // Deletes the characters from `from` up to `to`.
  private cut(from: number, to: number): void {
    for (const c of this.chars.splice(from, Math.max(0, to - from))) this.size -= points(c);
  }

  key(k: Key): void {
    switch (k.name) {
      case 'backspace':
        if (this.cursor > 0) this.cut(--this.cursor, this.cursor + 1);
        return;
      case 'delete':
        this.cut(this.cursor, this.cursor + 1);
        return;
      case 'left':
        this.cursor = Math.max(0, this.cursor - 1);
        return;
      case 'right':
        this.cursor = Math.min(this.chars.length, this.cursor + 1);
        return;
      case 'home':
      case 'ctrl-a':
        this.cursor = 0;
        return;
      case 'end':
      case 'ctrl-e':
        this.cursor = this.chars.length;
        return;
      case 'ctrl-u':
        this.cut(0, this.cursor);
        this.cursor = 0;
        return;
      case 'alt-b':
        this.cursor = this.wordLeft();
        return;
      case 'alt-f': {
        let i = this.cursor;
        while (i < this.chars.length && blank(this.chars[i])) i++;
        while (i < this.chars.length && !blank(this.chars[i])) i++;
        this.cursor = i;
        return;
      }
      case 'alt-backspace': {
        const i = this.wordLeft();
        this.cut(i, this.cursor);
        this.cursor = i;
        return;
      }
    }
    if (k.ch) this.type(k.ch);
  }

  // Where the word before the cursor starts (spaces before the cursor
  // skipped first).
  private wordLeft(): number {
    let i = this.cursor;
    while (i > 0 && blank(this.chars[i - 1])) i--;
    while (i > 0 && !blank(this.chars[i - 1])) i--;
    return i;
  }

  // Types one key's character at the cursor: a zero-width one (or one
  // after a joiner) joins the character before it. Controls are dropped;
  // the line holds at most MAX_INPUT code points.
  type(ch: string): void {
    if (/^[\ud800-\udbff]$/.test(ch)) {
      this.high = ch;
      return;
    }
    const c = /^[\udc00-\udfff]$/.test(ch) ? this.high + ch : ch;
    this.high = '';
    if (points(c) !== 1 || /^[\ud800-\udfff]$/.test(c) || CONTROL.test(c) || HIDDEN.test(c) || this.size >= MAX_INPUT) return;
    const before = this.chars[this.cursor - 1];
    if (TAG.test(c) && !(before !== undefined && flagOpen(before, c))) return;
    if (before !== undefined && (INVISIBLE.test(c) || before.endsWith('\u200d'))) this.chars[this.cursor - 1] = before + c;
    else this.chars.splice(this.cursor++, 0, c);
    this.size++;
  }
}
