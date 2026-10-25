import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentInfo, Bubble } from '../src/agents.ts';
import { Screen } from '../src/term/screen.ts';
import type { Rect } from '../src/term/screen.ts';
import { parseKeys } from '../src/term/terminal.ts';
import { isWide } from '../src/term/width.ts';
import { budget } from './helpers.ts';
import { THEMES, getTheme } from '../src/themes/index.ts';
import { placeCard } from '../src/ui/card.ts';
import type { Box } from '../src/ui/card.ts';
import { CHAT_MAX, chatKey, chatSize, chatStats, closeChat, drawChat, newChatView } from '../src/ui/chat.ts';
import type { ChatOpts, ChatPlacement, ChatView } from '../src/ui/chat.ts';

const T = 1_700_000_000_000;
const SCENE: Rect = { x: 0, y: 1, w: 100, h: 30 };
// A character's box with its head at (col, row).
const fig = (col: number, row: number): Box => ({ x0: col - 2, y0: row, x1: col + 2, y1: row + 3 });
const FIG = fig(20, 12);
const pal = getTheme('cafe')!.palette;
const info = (o: Partial<AgentInfo> = {}): AgentInfo => ({ id: 'n', name: 'nova', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: T, lastSeen: T, ...o });
const bubble = (i: number, kind: Bubble['kind'], text: string): Bubble => ({ id: `b${i}`, kind, text, at: T + i });
const opts = (o: Partial<ChatOpts> = {}): ChatOpts => ({ info: info(), log: [bubble(1, 'user', 'Fix the tokenizer'), bubble(2, 'agent', 'On it.')], reach: null, color: [120, 200, 255], palette: pal, ...o });
const keys = (v: ChatView, s: string) => parseKeys(s).map((k) => chatKey(v, k));
// Draws the window for `v` and returns its rows as text.
function shown(v: ChatView, o: Partial<ChatOpts> = {}, scene = SCENE, box: Box | null = FIG): string[] {
  const s = new Screen(100, 32);
  const at = drawChat(s, scene, v, opts(o), box)!;
  const { w, h } = at;
  return s.toText().split('\n').slice(at.y, at.y + h).map((l) => [...l].slice(at.x, at.x + w).join(''));
}

test('the window is some 60% of the scene wide and nearly as tall, within limits', () => {
  assert.deepEqual(chatSize(SCENE), { w: 60, h: 24 });
  assert.deepEqual(chatSize({ x: 0, y: 1, w: 92, h: 33 }), { w: 55, h: 24 });
  assert.deepEqual(chatSize({ x: 0, y: 1, w: 80, h: 21 }), { w: 48, h: 19 });
  assert.deepEqual(chatSize({ x: 0, y: 1, w: 200, h: 60 }), CHAT_MAX);
  assert.deepEqual(chatSize({ x: 0, y: 1, w: 44, h: 8 }), { w: 44, h: 8 });
});

test('it sits beside its character by the card rules, inside the scene', () => {
  const s = new Screen(100, 32);
  const at = drawChat(s, SCENE, newChatView('n'), opts(), FIG)!;
  assert.deepEqual({ x: at.x, y: at.y, side: at.side }, placeCard(SCENE, FIG, null, { w: at.w, h: at.h }));
  assert.equal(at.side, 'right');
  assert.equal(drawChat(new Screen(60, 10), { x: 0, y: 1, w: 40, h: 6 }, newChatView('n'), opts(), FIG), null, 'no room for it');
});

test('the window shows the conversation, the input line and the keys', () => {
  const rows = shown(newChatView('n'));
  const h = rows.length;
  assert.match(rows[0], /^╭─ nova · lead ─+╮$/);
  // Newest at the bottom, next to the input: a short log sits low.
  assert.ok(rows[h - 5].includes('you    Fix the tokenizer'), rows[h - 5]);
  assert.ok(rows[h - 4].includes('nova   On it.'), rows[h - 4]);
  assert.ok(rows.slice(1, h - 5).every((r) => /^│ +│$/.test(r)), 'nothing above it');
  assert.match(rows[h - 3], /^├─+┤$/);
  assert.ok(rows[h - 2].startsWith('│ › ') && rows[h - 2].includes('type a message'), rows[h - 2]);
  assert.ok(rows[h - 1].includes('[↑↓] scroll  [esc] leave') && !rows[h - 1].includes('[⏎]'), rows[h - 1]);
});

test('the frame stays intact and nothing is drawn outside it', () => {
  const many = (n: number, kind: Bubble['kind']) => Array.from({ length: n }, (_, i) => bubble(i, i % 3 ? kind : 'tool', `message ${i}`));
  const cases: { name: string; o?: Partial<ChatOpts>; v?: (v: ChatView) => void; scene?: Rect; at?: Box | null }[] = [
    { name: 'plain' },
    { name: 'empty log', o: { log: [] } },
    { name: 'long reply', o: { log: [bubble(1, 'agent', 'word '.repeat(400))] } },
    { name: 'many', o: { log: many(200, 'agent') } },
    { name: 'emoji and CJK', o: { log: [bubble(1, 'agent', '🎉 日本語のテキスト 🎉'.repeat(10)), bubble(2, 'tool', '日本語🎉'.repeat(20))], info: info({ name: '日本語🎉日本語🎉日本語🎉' }) } },
    { name: 'escapes', o: { log: [bubble(1, 'agent', 'a\x1b[2Jb\x07c\r\nd‮e')] } },
    { name: 'long draft', v: (v) => { for (let i = 0; i < 300; i++) v.input.type('x'); } },
    { name: 'cannot send', o: { reach: 'a subagent has no session of its own'.repeat(3), info: info({ role: 'sub' }) } },
    { name: 'log focus with a draft', v: (v) => { v.input.type('h'); v.focus = 'log'; } },
    { name: 'scrolled up', o: { log: many(100, 'agent'), reach: 'no live session' }, v: (v) => { v.top = 3; } },
    { name: 'docked', at: null },
    { name: 'right edge', at: fig(99, 12) },
    { name: 'small scene', scene: { x: 3, y: 1, w: 50, h: 12 }, at: fig(10, 5) },
    { name: 'card-sized scene', scene: { x: 2, y: 1, w: 44, h: 8 }, at: null },
  ];
  for (const c of cases) {
    const scene = c.scene ?? SCENE;
    const s = new Screen(100, 32);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 100; i++) s.put(i, j, '¤');
    const v = newChatView('n');
    c.v?.(v);
    const at = drawChat(s, scene, v, opts(c.o), c.at === undefined ? FIG : c.at)!;
    const { w, h } = at;
    assert.ok(at.x >= scene.x && at.y >= scene.y && at.x + w <= scene.x + scene.w && at.y + h <= scene.y + scene.h, `${c.name}: outside the scene`);
    for (let j = 0; j < 32; j++) {
      for (let i = 0; i < 100; i++) {
        const ch = s.ch[j * 100 + i];
        const inside = i >= at.x && i < at.x + w && j >= at.y && j < at.y + h;
        if (!inside) {
          assert.equal(ch, '¤', `${c.name}: wrote outside at ${i},${j}`);
          continue;
        }
        const top = j === at.y;
        const bottom = j === at.y + h - 1;
        const sep = j === at.y + h - 3;
        if (i === at.x) assert.equal(ch, top ? '╭' : bottom ? '╰' : sep ? '├' : '│', `${c.name}: left edge row ${j - at.y}`);
        if (i === at.x + w - 1) assert.equal(ch, top ? '╮' : bottom ? '╯' : sep ? '┤' : '│', `${c.name}: right edge row ${j - at.y}`);
        assert.notEqual(ch, '¤', `${c.name}: unfilled cell ${i},${j}`);
        assert.ok([...ch].length === 1 && ch >= ' ' && !isWide(ch), `${c.name}: cell ${i},${j} holds ${JSON.stringify(ch)}`);
      }
    }
  }
});

test('conversation text cannot break the frame or reach the terminal as escapes', () => {
  // A reply, a prompt and a sent message, each with a screen-clear, a bell
  // and wide text; the sender's name too.
  const evil = 'start \x1b[2J\x1b]52;c;AAAA\x07 日本語のテキスト end';
  const v = newChatView('n');
  v.sent.push({ id: 'o1', text: evil, at: T + 10, status: 'waiting', reason: '' });
  v.input.type('d');
  const log = [bubble(1, 'user', evil), bubble(2, 'agent', evil), bubble(3, 'sent', evil)];
  const s = new Screen(100, 32);
  const at = drawChat(s, SCENE, v, opts({ log, info: info({ name: '日本\x1b[2J' }) }), FIG)!;
  const { w, h } = at;
  const all = s.toText();
  assert.ok(!all.includes('\x1b') && !all.includes('\x07'), 'no escape or bell byte reaches the screen');
  assert.ok(!/[぀-鿿]/.test(all), 'no wide character is drawn');
  const rows = all.split('\n').slice(at.y, at.y + h).map((l) => [...l].slice(at.x, at.x + w));
  for (const [j, r] of rows.entries()) {
    assert.equal(r.length, w, `row ${j} width`);
    const edge = j === 0 ? ['╭', '╮'] : j === h - 1 ? ['╰', '╯'] : j === h - 3 ? ['├', '┤'] : ['│', '│'];
    assert.deepEqual([r[0], r[w - 1]], edge, `row ${j} edges`);
  }
  assert.ok(rows.some((r) => r.join('').includes('start [2J')), 'the text is there, defanged');
});

test('up and down scroll the log; it holds still as messages arrive and follows again at the bottom', () => {
  const log = Array.from({ length: 50 }, (_, i) => bubble(i, 'agent', `message ${i}`));
  const more = (n: number) => [...log, ...Array.from({ length: n }, (_, i) => bubble(50 + i, 'agent', `message ${50 + i}`))];
  const v = newChatView('n');
  let rows = shown(v, { log });
  const bottom = rows.length - 4; // the log's last row
  assert.ok(rows[bottom].includes('message 49'), 'the newest at the bottom');
  keys(v, '\x1b[A\x1b[A'); // up, up
  rows = shown(v, { log });
  assert.ok(rows[bottom].includes('message 47'), rows[bottom]);
  assert.ok(rows[rows.length - 3].includes('↓ 2 more'), rows[rows.length - 3]);
  rows = shown(v, { log: more(1) });
  assert.ok(rows[bottom].includes('message 47'), 'a new message does not move the view');
  keys(v, '\x1b[B\x1b[B\x1b[B'); // down to the bottom: following again
  rows = shown(v, { log: more(2) });
  assert.ok(rows[bottom].includes('message 51'), rows[bottom]);
  keys(v, '\x1b[5~'); // page up: the log's rows less one
  rows = shown(v, { log: more(2) });
  assert.ok(rows[bottom].includes(`message ${51 - (bottom - 1)}`), rows[bottom]);
});

test('enter with an empty input opens the folded message marked [⏎] more; with a draft it submits', () => {
  const long = Array.from({ length: 12 }, (_, i) => `para ${i}`).join('\n');
  const log = [bubble(1, 'agent', long), bubble(2, 'agent', long)];
  const v = newChatView('n');
  let text = shown(v, { log }).join('\n');
  assert.equal((text.match(/… 6 more lines/g) ?? []).length, 2);
  assert.equal((text.match(/… 6 more lines {2}\[⏎\] more/g) ?? []).length, 1, 'one fold is marked');
  assert.match(text, /╰─ \[⏎\] more/, 'and the keys say so');
  assert.equal(v.more, 'b2', 'the lowest in view');
  assert.deepEqual(keys(v, '\r'), [null]);
  text = shown(v, { log }).join('\n');
  assert.equal((text.match(/… 6 more lines/g) ?? []).length, 1);
  assert.match(text, /para 11/);
  keys(v, 'hi');
  assert.deepEqual(keys(v, '\r'), ['submit']);
});

test('in the input every key types; esc leaves it for the log, where enter comes back and esc closes', () => {
  const v = newChatView('n');
  assert.deepEqual(keys(v, 'q1t\t?'), [null, null, null, null, null]);
  assert.equal(v.input.text, 'q1t?');
  assert.deepEqual(keys(v, '\x1b'), [null]);
  assert.equal(v.focus, 'log');
  assert.ok(shown(v).at(-1)!.includes('[⏎] write'));
  assert.deepEqual(keys(v, 'q'), ['pass'], 'in the log the app has its keys');
  assert.deepEqual(keys(v, '\t'), ['pass']);
  assert.deepEqual(keys(v, '\r'), [null]);
  assert.equal(v.focus, 'input');
  assert.equal(v.input.text, 'q1t?', 'the draft stays');
  keys(v, '\x1b');
  assert.deepEqual(keys(v, '\x1b'), ['close']);
});

test('an agent that cannot be sent to says why, and enter copies instead', () => {
  const v = newChatView('n');
  const text = shown(v, { reach: 'a subagent has no session of its own', info: info({ role: 'sub' }) }).join('\n');
  assert.match(text, /can't send: a subagent has no session of its own/);
  assert.match(text, /type here; ⏎ copies it/);
  v.input.type('x');
  assert.match(shown(v, { reach: 'no session', info: info({ role: 'sub' }) }).join('\n'), /\[⏎\] copy/);
  assert.match(text, /task {3}Fix the tokenizer/, 'a subagent was given a task');
});

test('a long draft scrolls to keep the cursor in view; the cursor cell is inverted', () => {
  const s = new Screen(100, 32);
  const v = newChatView('n');
  for (const ch of 'abcdefghij'.repeat(10)) v.input.type(ch);
  const at = drawChat(s, SCENE, v, opts(), FIG)!;
  const { w, h } = at;
  const row = s.toText().split('\n')[at.y + h - 2];
  assert.ok(row.includes('ghij ') && !row.includes('abcdefghij'.repeat(6)), row);
  const cur = at.x + w - 3; // the last content cell
  assert.deepEqual(s.bgAt(cur, at.y + h - 2), pal.panelText);
  assert.deepEqual(s.fgAt(cur, at.y + h - 2), pal.panel);
});

const lumOf = (c: ArrayLike<number>) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  const [hi, lo] = [lumOf(a), lumOf(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

test('in every theme the agent name reads on the panel at 4.5:1, whatever its colour', () => {
  for (const th of THEMES) {
    for (const color of [th.palette.panel, [0, 0, 0], [255, 255, 255], [120, 200, 255]] as [number, number, number][]) {
      const s = new Screen(100, 32);
      const at = drawChat(s, SCENE, newChatView('n'), opts({ palette: th.palette, color }), FIG)!;
      const { h } = at;
      const top = s.fgAt(at.x + 3, at.y); // 'n' of nova on the top edge
      const row = s.fgAt(at.x + 2, at.y + h - 4); // 'n' of nova in the log
      assert.ok(ratio(top, th.palette.panel) >= 4.5, `${th.id} ${color} top ${ratio(top, th.palette.panel)}`);
      assert.ok(ratio(row, th.palette.panel) >= 4.5, `${th.id} ${color} log ${ratio(row, th.palette.panel)}`);
    }
  }
});

test('the [⏎] hint shows only when enter would do something', () => {
  const keysLine = (v: ChatView, o: Partial<ChatOpts> = {}) => shown(v, o).at(-1)!;
  const v = newChatView('n');
  assert.ok(!keysLine(v).includes('[⏎]'), 'empty input, nothing folded: enter does nothing');
  assert.ok(!keysLine(v, { reach: 'no session' }).includes('[⏎]'));
  v.input.type('h');
  assert.ok(keysLine(v).includes('[⏎] send'));
  assert.ok(keysLine(v, { reach: 'no session' }).includes('[⏎] copy'));
  v.input.clear();
  const long = Array.from({ length: 12 }, (_, i) => `para ${i}`).join('\n');
  assert.ok(keysLine(v, { log: [bubble(1, 'agent', long)] }).includes('[⏎] more'));
  v.focus = 'log';
  assert.ok(keysLine(v).includes('[⏎] write'), 'in the log enter goes back to the input');
});

test('a long draft keeps its view still until the cursor leaves it, so text right of the cursor shows', () => {
  const s = new Screen(100, 32);
  const v = newChatView('n');
  for (const ch of 'abcdefghij'.repeat(10)) v.input.type(ch);
  const row = () => {
    const at = drawChat(s, SCENE, v, opts(), FIG)!;
    return s.toText().split('\n')[at.y + at.h - 2];
  };
  const end = row();
  keys(v, '\x1b[D'.repeat(5)); // five left: still inside the view
  assert.equal(row(), end, 'the view holds still while the cursor is in it');
  keys(v, '\x1b[D'.repeat(60)); // cursor at 35: left of the view
  assert.ok(row().includes('│ › fghij'), row());
  keys(v, '\x1b[C'.repeat(10)); // right again, inside: still
  assert.ok(row().includes('│ › fghij'), row());
});

const many = (n: number, len = 30) => Array.from({ length: n }, (_, i) => bubble(i + 1, 'agent', `m${i} ${'x'.repeat(len)}`));

test('the window narrows rather than cover a character mid-scene; it docks only when no width fits', () => {
  const log = many(40);
  let narrowed = 0;
  for (let col = 3; col <= 97; col++) {
    const box = fig(col, 12);
    const s = new Screen(100, 32);
    const at = drawChat(s, SCENE, newChatView('n'), opts({ log }), box)!;
    let fits = false;
    for (let w = 60; w >= 44; w--) if (placeCard(SCENE, box, null, { w, h: at.h }).side !== null) fits = true;
    const overlap = at.x <= box.x1 && at.x + at.w - 1 >= box.x0 && at.y <= box.y1 && at.y + at.h - 1 >= box.y0;
    if (fits) {
      assert.ok(!overlap, `col ${col}: window ${at.x},${at.y} ${at.w}x${at.h} covers the figure`);
      assert.notEqual(at.side, null, `col ${col}`);
      if (at.w < 60) narrowed++;
    }
  }
  assert.ok(narrowed > 0, 'some columns needed a narrower window');
});

test('a character drifting about the middle does not flip the window between sides', () => {
  const log = many(30);
  for (const sw of [100, 103]) {
    const scene: Rect = { x: 0, y: 1, w: sw, h: 31 };
    for (const centre of [40, 46, 50, 52, 55, 58]) {
      const v = newChatView('n');
      const s = new Screen(sw + 31, 34);
      let side: ChatPlacement['side'] | null = null;
      let flips = 0;
      for (let i = 0; i < 200; i++) {
        const box = fig(centre + Math.round(3 * Math.sin(i / 5)), 12);
        const at = drawChat(s, scene, v, opts({ log }), box, side);
        if (side && at?.side !== side) flips++;
        side = at?.side ?? null;
      }
      assert.ok(flips <= 1, `${sw} cols, centre ${centre}: ${flips} flips`);
    }
  }
});

test('a layout is kept while nothing changes, and redone when a bubble arrives or the state changes', () => {
  const v = newChatView('n');
  const log = many(30);
  const draw = (o: Partial<ChatOpts>) => drawChat(new Screen(100, 32), SCENE, v, opts(o), FIG);
  const n0 = chatStats.layouts;
  draw({ log });
  const n1 = chatStats.layouts;
  assert.ok(n1 > n0);
  draw({ log });
  assert.equal(chatStats.layouts, n1, 'a steady second draw does not lay out again');
  draw({ log: [...log, bubble(99, 'agent', 'new')] });
  assert.ok(chatStats.layouts > n1, 'a new bubble does');
  const n2 = chatStats.layouts;
  v.sent.push({ id: 'o1', text: 'hello', at: T + 1e6, status: 'sending', reason: '' });
  draw({ log: [...log, bubble(99, 'agent', 'new')] });
  assert.ok(chatStats.layouts > n2, 'a sent message does');
  const n3 = chatStats.layouts;
  v.sent[0].status = 'delivered';
  draw({ log: [...log, bubble(99, 'agent', 'new')] });
  assert.ok(chatStats.layouts > n3, 'and so does its state changing');
  const n4 = chatStats.layouts;
  v.open.add('b1');
  draw({ log: [...log, bubble(99, 'agent', 'new')] });
  assert.ok(chatStats.layouts > n4, 'and opening a fold');
});

test('300 bubbles of 1500 characters: the cached draw is under 2 ms', () => {
  const v = newChatView('n');
  const log = many(300, 1500);
  const s = new Screen(100, 32);
  drawChat(s, SCENE, v, opts({ log }), FIG);
  const t0 = performance.now();
  drawChat(s, SCENE, v, opts({ log }), FIG);
  const ms = performance.now() - t0;
  assert.ok(ms < 2, `${ms} ms`);
});

test('the window is as tall as its conversation needs, grows with it to the maximum, and never shrinks while open', () => {
  const v = newChatView('n');
  const draw = (log: Bubble[]) => drawChat(new Screen(100, 32), SCENE, v, opts({ log }), FIG)!;
  const short = draw(many(2));
  assert.equal(short.h, 8, 'two messages need less than the card: the card size');
  const mid = draw(many(8));
  assert.equal(mid.h, 12, 'eight rows, the separator, the input and the frame');
  const big = draw(many(100));
  assert.equal(big.h, chatSize(SCENE).h);
  assert.equal(draw(many(2)).h, big.h, 'it does not shrink');
  const fresh = newChatView('n');
  assert.equal(drawChat(new Screen(100, 32), SCENE, fresh, opts({ log: many(1) }), FIG)!.h, 8, 'at least the card height');
});

test('a cached chat redraws when a step settles in place: pending, then its mark', () => {
  const v = newChatView('n');
  // The transcript reader settles a step by updating its bubble in place.
  const step: Bubble = { ...bubble(2, 'tool', '$ npm test'), activity: 'run', outcome: 'pending' };
  const log = [bubble(1, 'user', 'go'), step];
  const row = () => shown(v, { log }).find((r) => r.includes('$ npm test'))!;
  assert.ok(!/[✓✗]|refused/.test(row()), row());
  for (const [outcome, mark] of [['ok', '✓'], ['failed', '✗'], ['refused', 'refused']] as const) {
    step.outcome = outcome;
    assert.ok(row().includes(`$ npm test ${mark}`), `${outcome}: ${row()}`);
  }
});

test('the view keeps only the layout it drew, and closing it lets that go', () => {
  const v = newChatView('n');
  // Mid-scene the window narrows: several widths are laid out on the way.
  const at = drawChat(new Screen(100, 32), SCENE, v, opts({ log: many(40) }), fig(50, 12))!;
  assert.ok(at.w < chatSize(SCENE).w, `narrowed to ${at.w}`);
  assert.equal(v.cache!.w, at.w);
  assert.deepEqual([...v.cache!.wraps.keys()], many(40).map((b) => b.id), 'its messages\' wrapping, once each');
  assert.equal(new Set([...v.cache!.wraps.values()].map((e) => e.width)).size, 1, 'at the width drawn only');
  v.input.type('d');
  v.open.add('b1');
  closeChat(v);
  assert.equal(v.cache, null);
  assert.deepEqual([v.input.text, [...v.open]], ['d', ['b1']], 'the draft and the folds opened stay');
});

const prose = (n: number) => 'the parser drops the last token when the input ends in a comment, so '.repeat(Math.ceil(n / 70)).slice(0, n);

test('300 messages of 1500 characters, the window narrowed mid-scene: a new message redraws in under 10 ms', () => {
  const scene: Rect = { x: 0, y: 1, w: 120, h: 38 };
  const box = fig(60, 18);
  const log = Array.from({ length: 300 }, (_, i) => bubble(i + 1, i % 2 ? 'agent' : 'user', prose(1500)));
  const v = newChatView('n');
  const s = new Screen(120, 40);
  const at = drawChat(s, scene, v, opts({ log }), box)!;
  assert.ok(at.w < chatSize(scene).w && at.side !== null, `narrowed beside its character: ${at.w} ${at.side}`);
  let n = 1000;
  budget('a new message, narrowed', () => {
    log.push(bubble(n++, 'agent', 'new'));
    drawChat(s, scene, v, opts({ log }), box);
  }, 10);
});
