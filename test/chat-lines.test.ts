import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Bubble } from '../src/agents.ts';
import type { Outgoing } from '../src/claude/inbox.ts';
import { FOLD, GUTTER, layoutChat, wrap } from '../src/ui/chat-lines.ts';
import type { Line } from '../src/ui/chat-lines.ts';

const T = 1_700_000_000_000;
const names = { agent: 'nova', prompter: 'you' };
const text = (l: Line) => l.map((s) => s.text).join('');
const lay = (log: Bubble[], o: { sent?: Outgoing[]; width?: number; open?: Set<string> } = {}) => layoutChat(log, o.sent ?? [], o.width ?? 40, o.open ?? new Set(), names);
const b = (id: string, kind: Bubble['kind'], text: string, at = T, more: Partial<Bubble> = {}): Bubble => ({ id, kind, text, at, ...more });

test('wrap breaks at spaces, mid-word only where it must, and keeps paragraphs', () => {
  assert.deepEqual(wrap('the quick brown fox', 10), ['the quick', 'brown fox']);
  assert.deepEqual(wrap('abcdefghijkl', 5), ['abcde', 'fghij', 'kl']);
  assert.deepEqual(wrap('one\n\n\n\ntwo\n', 10), ['one', '', 'two']);
  assert.deepEqual(wrap('\n\nlead', 10), ['lead']);
});

test('wrap makes text cell-safe: a wide glyph is one ?, controls and escapes are gone', () => {
  assert.deepEqual(wrap('日本 ok', 10), ['?? ok']);
  assert.deepEqual(wrap('a\x1b[31mb\tc​d', 20), ['a[31mb cd']);
  for (const line of wrap('🎉'.repeat(30), 7)) assert.ok([...line].length <= 7, line);
});

test('each message opens with its speaker; tool steps are rows with their outcome; thinking is a mark', () => {
  const { lines } = lay([
    b('1', 'user', 'Fix the tokenizer'),
    b('2', 'agent', 'On it.'),
    b('3', 'tool', '$ npm test', T, { activity: 'run', outcome: 'ok' }),
    b('4', 'tool', 'Edit parser.ts', T, { activity: 'write', outcome: 'failed' }),
    b('5', 'tool', '$ rm -rf build', T, { activity: 'run', outcome: 'refused' }),
    b('6', 'tool', 'Read a.ts', T, { activity: 'read', outcome: 'pending' }),
    b('7', 'thinking', ''),
  ]);
  assert.deepEqual(lines.map(text), [
    'you    Fix the tokenizer',
    'nova   On it.',
    '  ▶ $ npm test ✓',
    '  ✎ Edit parser.ts ✗',
    '  ▶ $ rm -rf build refused',
    '  ▤ Read a.ts',
    '  thinking…',
  ]);
});

test('a long message folds after six lines until opened', () => {
  const long = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n');
  const shut = lay([b('m', 'agent', long)]);
  assert.equal(shut.lines.length, FOLD + 1);
  assert.equal(text(shut.lines[FOLD]), `${' '.repeat(GUTTER)}… 4 more lines`);
  assert.deepEqual(shut.folds, [{ line: FOLD, id: 'm' }]);
  const opened = lay([b('m', 'agent', long)], { open: new Set(['m']) });
  assert.equal(opened.lines.length, 10);
  assert.deepEqual(opened.folds, []);
});

test('a message an earlier animus run sent is shown as animus, not as yours', () => {
  const log = [b('m', 'sent', 'mine', T, { peerPid: process.pid }), b('f', 'sent', 'earlier', T + 1, { peerPid: process.pid + 1 }), b('n', 'sent', 'no pid', T + 2)];
  const { lines } = lay(log);
  assert.deepEqual(lines.map(text), ['you →  mine', 'animus earlier', 'you →  no pid']);
  assert.equal(lines[1][0].tone, 'dim');
});

test('sent messages: a delivered one in its place with a tick, the rest by time with their state', () => {
  const sent: Outgoing[] = [
    { id: 'o1', text: 'add a test', at: T + 1000, status: 'delivered', reason: '', bubble: 's1' },
    { id: 'o2', text: 'and docs', at: T + 2500, status: 'waiting', reason: '' },
    { id: 'o3', text: 'hello?', at: T + 9000, status: 'failed', reason: 'no live session' },
    { id: 'o4', text: 'psst', at: T + 9500, status: 'copied', reason: 'demo agents take no messages' },
  ];
  const log = [b('old', 'sent', 'from before', T - 5000), b('s1', 'sent', 'add a test', T + 1200), b('a', 'agent', 'Sure.', T + 3000)];
  assert.deepEqual(lay(log, { sent, width: 60 }).lines.map(text), [
    'you →  from before',
    'you →  add a test  ✓ delivered',
    'you →  and docs  sent, waiting',
    'nova   Sure.',
    'you →  hello?  ✗ not sent: no live session',
    'you →  psst  copied (if your terminal allows it)',
  ]);
});

test('a state that does not fit goes on a line of its own', () => {
  const sent: Outgoing[] = [{ id: 'o', text: 'x'.repeat(30), at: T, status: 'failed', reason: "can't connect (ECONNREFUSED)" }];
  const { lines } = lay([], { sent, width: 40 });
  assert.equal(text(lines[0]), `you →  ${'x'.repeat(30)}`);
  assert.equal(text(lines[1]), `${' '.repeat(GUTTER)}✗ not sent: can't connect (ECONN…`);
  assert.ok(lines.every((l) => [...text(l)].length <= 40));
});

test("a subagent's prompter is its task; a long name is cut to the gutter", () => {
  const { lines } = layoutChat([b('1', 'user', 'map the API'), b('2', 'agent', 'ok')], [], 40, new Set(), { agent: 'Explore codebase', prompter: 'task' });
  assert.deepEqual(lines.map(text), ['task   map the API', 'Explo… ok']);
});

test('every speaker and message text is cell-safe, in a reply, a prompt and a sent message', () => {
  const evil = 'x\x1b[2Jy 日本語 z';
  const sent: Outgoing[] = [{ id: 'o', text: evil, at: T + 5, status: 'waiting', reason: '' }];
  const { lines } = layoutChat([b('1', 'user', evil), b('2', 'agent', evil)], sent, 40, new Set(), { agent: '日本\x1b[2J', prompter: 'you' });
  for (const l of lines) {
    const t = text(l);
    assert.ok(!t.includes('\x1b'), JSON.stringify(t));
    assert.ok(!/[日本語]/.test(t), t);
    assert.ok([...t].length <= 40, t);
  }
});

test('a message one line over the fold shows in full; the fold hides at least two lines and says so', () => {
  const para = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`).join('\n');
  assert.equal(lay([b('1', 'agent', para(FOLD + 1))]).folds.length, 0, 'seven lines: no fold');
  assert.equal(lay([b('1', 'agent', para(FOLD + 1))]).lines.length, FOLD + 1);
  const two = lay([b('1', 'agent', para(FOLD + 2))]);
  assert.equal(two.folds.length, 1);
  assert.equal(text(two.lines[FOLD]).trim(), '… 2 more lines');
  const one = lay([b('1', 'agent', para(FOLD + 1))], { open: new Set() });
  assert.ok(!one.lines.some((l) => /more line/.test(text(l))));
});

test('a delivered message whose bubble is not in the log is shown as a sent line', () => {
  const o = (id: string, bubble?: string): Outgoing => ({ id, text: `msg ${id}`, at: T + 5, status: 'delivered', reason: '', bubble });
  const { lines } = lay([b('1', 'agent', 'hi', T)], { sent: [o('o1', 'gone'), o('o2')] });
  const all = lines.map(text);
  assert.ok(all.some((l) => l.includes('msg o1') && l.includes('✓ delivered')), all.join('\n'));
  assert.ok(all.some((l) => l.includes('msg o2')), all.join('\n'));
  // One whose bubble is in the log is drawn there, once.
  const t = lay([b('1', 'sent', 'msg o3', T + 1)], { sent: [o('o3', '1')] }).lines.map(text);
  assert.equal(t.filter((l) => l.includes('msg o3')).length, 1);
});

test('wrap with a limit gives the first lines of the whole', () => {
  const t = '  one two three four\n\n\nfive six   seven     \neightnineten\n\n';
  const all = wrap(t, 8);
  assert.ok(all.length > 4);
  for (let k = 0; k <= all.length + 1; k++) assert.deepEqual(wrap(t, 8, k), all.slice(0, k), `limit ${k}`);
});

test('a folded message is wrapped only as far as the fold; its fold line still counts the rest', () => {
  const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
  const r = layoutChat([b('m', 'agent', long)], [], 40, new Set(), names);
  assert.equal(r.wraps.get('m')!.lines.length, FOLD + 2, 'a line past the fold, no more');
  assert.equal(text(r.lines[FOLD]).trim(), '… 494 more lines');
});

test("a message wrapped before at the same width is taken as it was; one changed, narrower or opened is wrapped again", () => {
  const log = [b('1', 'agent', 'hello there'), b('2', 'agent', 'bye')];
  const one = layoutChat(log, [], 40, new Set(), names);
  const again = (l: Bubble[], width = 40, open = new Set<string>()) => layoutChat(l, [], width, open, names, undefined, one.wraps);
  const two = again([...log, b('3', 'agent', 'new')]);
  assert.equal(two.wraps.get('1'), one.wraps.get('1'));
  assert.deepEqual([...two.wraps.keys()], ['1', '2', '3']);
  const changed = again([b('1', 'agent', 'hello there, more'), log[1]]);
  assert.notEqual(changed.wraps.get('1'), one.wraps.get('1'));
  assert.equal(text(changed.lines[0]), 'nova   hello there, more');
  assert.notEqual(again(log, 30).wraps.get('1'), one.wraps.get('1'));
  assert.notEqual(again(log, 40, new Set(['1'])).wraps.get('1'), one.wraps.get('1'));
  assert.deepEqual([...again([log[1]]).wraps.keys()], ['2'], 'one gone from the log is not kept');
});
