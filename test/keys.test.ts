import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { KeyDecoder, PASTE_QUIET_MS, Terminal, osc52, parseKeys } from '../src/term/terminal.ts';

const names = (s: string) => parseKeys(s).map((k) => k.name);

test('control keys', () => {
  assert.deepEqual(names('\x03'), ['ctrl-c']);
  assert.deepEqual(names('\t'), ['tab']);
  assert.deepEqual(names('\r'), ['enter']);
  assert.deepEqual(names('\x7f'), ['backspace']);
});

test('escape sequences', () => {
  assert.deepEqual(names('\x1b[Z'), ['shift-tab']);
  assert.deepEqual(names('\x1b[C\x1b[D'), ['right', 'left']);
  assert.deepEqual(names('\x1b[A\x1b[B'), ['up', 'down']);
  assert.deepEqual(names('\x1bOC'), ['right']);
  assert.deepEqual(names('\x1b'), ['escape']);
});

test('printable keys keep their character', () => {
  assert.deepEqual(names('t1 '), ['t', '1', 'space']);
  const [big] = parseKeys('T');
  assert.equal(big.name, 'T');
  assert.equal(big.shift, true);
  assert.equal(big.ch, 'T');
});

test('escape sequences split across reads are reassembled', async () => {
  const { KeyDecoder } = await import('../src/term/terminal.ts');
  const d = new KeyDecoder();
  assert.deepEqual(d.push('\x1b[').map((k) => k.name), []);
  assert.deepEqual(d.push('C').map((k) => k.name), ['right']);
  assert.deepEqual(d.push('a\x1b').map((k) => k.name), ['a']);
  assert.deepEqual(d.push('[Z').map((k) => k.name), ['shift-tab']);
});

test('a lone escape is delivered on flush', async () => {
  const { KeyDecoder } = await import('../src/term/terminal.ts');
  const d = new KeyDecoder();
  assert.deepEqual(d.push('\x1b'), []);
  assert.equal(d.pending(), true);
  assert.deepEqual(d.flush().map((k) => k.name), ['escape']);
  assert.equal(d.pending(), false);
  assert.deepEqual(d.push('\x1b[1;5').map((k) => k.name), []);
  assert.deepEqual(d.flush().map((k) => k.name), ['escape']);
});

test('CSI sequences end at any final byte 0x40-0x7E', async () => {
  const { KeyDecoder } = await import('../src/term/terminal.ts');
  assert.deepEqual(names('\x1b[11^q'), ['q']);
  assert.deepEqual(names('\x1b[2$x'), ['x']);
  const d = new KeyDecoder();
  assert.deepEqual(d.push('\x1b[11^'), []);
  assert.equal(d.pending(), false);
  assert.deepEqual(d.push('q').map((k) => k.name), ['q']);
});

test('osc52 puts text on the clipboard, base64 so nothing in it reaches the terminal raw', () => {
  assert.equal(osc52('hi'), '\x1b]52;c;aGk=\x07');
  const s = osc52('a\x1b[2J\x07b');
  assert.equal(s.split('\x1b').length, 2, 'one escape: its own');
  assert.equal(Buffer.from(s.slice(7, -1), 'base64').toString('utf8'), 'a\x1b[2J\x07b');
});

test('a bracketed paste is marked at both ends', () => {
  assert.deepEqual(names('\x1b[200~ab\x1b[201~'), ['paste-start', 'a', 'b', 'paste-end']);
});

test('escape then a printable key in one read is that key with alt, escape then DEL alt-backspace', async () => {
  assert.deepEqual(names('\x1bf\x1bq\x1bD\x1b1\x1b \x1b\x7f'), ['alt-f', 'alt-q', 'alt-D', 'alt-1', 'alt-space', 'alt-backspace']);
  assert.deepEqual(names('\x1bé\x1b🎉x'), ['alt-é', 'alt-🎉', 'x'], 'a whole character');
  const [k] = parseKeys('\x1bq');
  assert.deepEqual([k.ch, k.ctrl], ['', false], 'it types nothing');
  assert.deepEqual(names('\x1b\r\x1b\x1b[A'), ['escape', 'enter', 'escape', 'up'], 'escape before a control key or a sequence is still escape');
  const { KeyDecoder } = await import('../src/term/terminal.ts');
  const d = new KeyDecoder();
  assert.deepEqual(d.push('\x1b'), []);
  assert.deepEqual(d.flush().map((x) => x.name), ['escape'], 'a lone escape still goes through the flush');
});

test('a paste\'s end marker split across reads is held, however long the gap, and then ends the paste', () => {
  const d = new KeyDecoder();
  assert.deepEqual(d.push('\x1b[200~ab\x1b[20').map((k) => k.name), ['paste-start', 'a', 'b']);
  assert.deepEqual([d.pasting, d.pending()], [true, true]);
  assert.deepEqual(d.push('1~x').map((k) => k.name), ['paste-end', 'x']);
  assert.equal(d.pasting, false);
});

// A terminal reading keys from a fake input (no TTY), under mocked timers.
function fakeTerminal() {
  const inp = new EventEmitter();
  const term = new Terminal(new EventEmitter() as unknown as NodeJS.WriteStream, inp as unknown as NodeJS.ReadStream);
  const got: string[] = [];
  term.onKey((k) => got.push(k.name));
  return { got, read: (s: string) => inp.emit('data', s) };
}

test('inside a paste a held escape is never flushed as Esc; a paste gone quiet ends', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { got, read } = fakeTerminal();
  assert.ok(PASTE_QUIET_MS >= 2500, 'a stall of a second or two does not end a paste');
  read('\x1b[200~ab\x1b[20');
  t.mock.timers.tick(100);
  assert.deepEqual(got, ['paste-start', 'a', 'b'], 'the marker held past the escape flush');
  read('1~');
  assert.deepEqual(got.splice(0), ['paste-start', 'a', 'b', 'paste-end']);
  // Its end marker never comes: a quiet spell ends it, and what was held goes.
  read('\x1b[200~cd\x1b[2');
  t.mock.timers.tick(PASTE_QUIET_MS - 1);
  assert.deepEqual(got, ['paste-start', 'c', 'd']);
  t.mock.timers.tick(1);
  assert.deepEqual(got.splice(0), ['paste-start', 'c', 'd', 'paste-end']);
  read('q');
  assert.deepEqual(got.splice(0), ['q'], 'keys are keys again');
  // Outside a paste a lone escape is still flushed after a moment.
  read('\x1b');
  t.mock.timers.tick(30);
  assert.deepEqual(got.splice(0), ['escape']);
});
