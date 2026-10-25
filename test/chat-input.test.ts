import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys } from '../src/term/terminal.ts';
import { ChatInput, MAX_INPUT } from '../src/ui/chat-input.ts';

const typed = (input: ChatInput, s: string) => {
  for (const k of parseKeys(s)) input.key(k);
};

test('every printable key types itself, the app keys too', () => {
  const i = new ChatInput();
  typed(i, 'q t r c i 1 0 ? + - z f l d p T');
  assert.equal(i.text, 'q t r c i 1 0 ? + - z f l d p T');
  assert.equal(i.cursor, i.text.length);
});

test('the editing keys move and delete', () => {
  const i = new ChatInput();
  typed(i, 'helo');
  typed(i, '\x1b[Dl'); // left, l
  assert.equal(i.text, 'hello');
  typed(i, '\x1b[H\x1b[3~'); // home, delete
  assert.equal(i.text, 'ello');
  typed(i, '\x1b[F\x7f'); // end, backspace
  assert.equal(i.text, 'ell');
  typed(i, '\x01X\x05Y'); // ctrl-a, X, ctrl-e, Y
  assert.equal(i.text, 'XellY');
  typed(i, '\x1b[D\x15'); // left, ctrl-u: clears up to the cursor
  assert.deepEqual([i.text, i.cursor], ['Y', 0]);
  i.clear();
  assert.deepEqual([i.text, i.cursor], ['', 0]);
});

test('an emoji typed as two halves is one character; tab and control keys type nothing', () => {
  const i = new ChatInput();
  typed(i, 'a🎉b\t\x02');
  assert.equal(i.text, 'a🎉b');
  typed(i, '\x1b[D\x7f'); // left, backspace: the emoji goes whole
  assert.equal(i.text, 'ab');
  // Shown a cell per character, a wide one as '?'.
  typed(i, '日');
  assert.deepEqual(i.shown, ['a', '?', 'b']);
  assert.equal(i.text, 'a日b', 'sent as typed');
});

test('the line holds at most MAX_INPUT characters', () => {
  const i = new ChatInput();
  for (let k = 0; k < MAX_INPUT + 50; k++) i.type('x');
  assert.equal(i.text.length, MAX_INPUT);
});

test('alt-b and alt-f move a word left and right, alt-backspace deletes the word before the cursor; other alt keys type nothing', () => {
  const i = new ChatInput();
  typed(i, 'fix  the parser');
  typed(i, '\x1bb');
  assert.equal(i.cursor, 9, 'to the start of parser');
  typed(i, '\x1bb\x1bb');
  assert.equal(i.cursor, 0);
  typed(i, '\x1bf');
  assert.equal(i.cursor, 3, 'to the end of fix');
  typed(i, '\x1bf');
  assert.equal(i.cursor, 8, 'over the spaces, to the end of the');
  typed(i, '\x1b\x7f');
  assert.deepEqual([i.text, i.cursor], ['fix   parser', 5]);
  typed(i, '\x1bq\x1bd\x1b1');
  assert.equal(i.text, 'fix   parser');
});

test('combining marks and joiners are kept in the text, each with its character: a cell each, deleted whole', () => {
  const i = new ChatInput();
  // A decomposed é, a Thai vowel sign over its consonant, an emoji joined by ZWJ.
  typed(i, 'cafe\u0301 \u0e01\u0e34\u0e19 \ud83d\udc69\u200d\ud83d\udcbb!');
  assert.equal(i.text, 'cafe\u0301 \u0e01\u0e34\u0e19 \ud83d\udc69\u200d\ud83d\udcbb!');
  assert.deepEqual(i.shown, ['c', 'a', 'f', 'e', ' ', '\u0e01', '\u0e19', ' ', '?', '!'], 'drawn through cellSafe, a cell per character');
  assert.equal(i.cursor, 10);
  typed(i, '\x7f\x7f'); // backspace twice: the !, then the joined emoji whole
  assert.equal(i.text, 'cafe\u0301 \u0e01\u0e34\u0e19 ');
  typed(i, '\x1b[H\x1b[C\x1b[C\x1b[C\x1b[3~'); // home, right x3, delete: the é with its accent
  assert.equal(i.text, 'caf \u0e01\u0e34\u0e19 ');
  for (const c of ['\x07', '\x1b', '\u0085', '\u009b', '\t']) i.type(c);
  assert.equal(i.text, 'caf \u0e01\u0e34\u0e19 ', 'C0 and C1 controls are still dropped');
});

test('the line holds at most MAX_INPUT code points, marks included', () => {
  const i = new ChatInput();
  i.type('e');
  for (let k = 0; k < MAX_INPUT + 50; k++) i.type('\u0301');
  assert.equal([...i.text].length, MAX_INPUT);
  assert.deepEqual(i.shown, ['e']);
});

const tags = (s: string) => [...s].map((c) => String.fromCodePoint(0xe0000 + c.charCodeAt(0))).join('');
const WALES = `\u{1F3F4}${tags('gbwls')}\u{E007F}`;

test('invisible characters that could hide instructions never enter the input', () => {
  const i = new ChatInput();
  typed(i, `hi${tags('IGN')}`);
  assert.equal(i.text, 'hi');
  i.clear();
  typed(i, 'a‮b⁦c⁧d⁨e⁩f‪‬  g\u{E0100}\u{E01EF}h');
  assert.equal(i.text, 'abcdefgh');
  i.clear();
  typed(i, `x\u{1F3F4}${tags('IGN')}\u{E007F}`);
  assert.equal(i.text, 'x\u{1F3F4}', 'a flag with letters that are no subdivision code');
});

test('an unfinished flag keeps its flag and loses its hidden tags in the text taken', () => {
  const i = new ChatInput();
  typed(i, `hi \u{1F3F4}${tags('gbw')}`);
  assert.equal(i.text, 'hi \u{1F3F4}');
  typed(i, `${tags('ls')}\u{E007F}`);
  assert.equal(i.text, `hi ${WALES}`, 'finishing the flag restores it');
});

test('subdivision flags, accents, vowel signs, joiners and variation selectors still type', () => {
  const i = new ChatInput();
  typed(i, `${WALES}éกิ\u{1F468}‍\u{1F469}❤️`);
  assert.equal(i.text, `${WALES}éกิ\u{1F468}‍\u{1F469}❤️`);
});
