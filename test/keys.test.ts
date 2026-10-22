import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKeys } from '../src/term/terminal.ts';

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
