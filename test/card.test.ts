import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AgentInfo, Vitals } from '../src/agents.ts';
import { meters } from '../src/pet/meters.ts';
import { DEFAULT, Screen } from '../src/term/screen.ts';
import { THEMES, getTheme } from '../src/themes/index.ts';
import { CARD_H, CARD_W, drawCard, legible, modelName, placeCard, tokens } from '../src/ui/card.ts';
import type { Box, CardOpts, Side } from '../src/ui/card.ts';
import type { Rect } from '../src/term/screen.ts';
import { covers, room } from './helpers.ts';

const NOW = 1_700_000_000_000;
const SCENE = { x: 0, y: 1, w: 100, h: 30 };
// A character's box with its head at (col, row): `half` cells either side,
// `h` rows tall (about its size at the fitted zoom by default).
const fig = (col: number, row: number, half = 2, h = 4): Box => ({ x0: col - half, y0: row, x1: col + half, y1: row + h - 1 });
const FIG = fig(20, 12);
const within = (p: { x: number; y: number }, r: Rect) => p.x >= r.x && p.y >= r.y && p.x + CARD_W <= r.x + r.w && p.y + CARD_H <= r.y + r.h;
// The scenes of an 80x24, a 92x30 and a 60x20 terminal, and of 110 and 119
// columns, where the roster takes 28.
const SCENES: Record<string, Rect> = {
  '80x24': { x: 0, y: 1, w: 80, h: 21 },
  '92x30': { x: 0, y: 1, w: 92, h: 27 },
  '60x20': { x: 0, y: 1, w: 60, h: 17 },
  '110x30': { x: 0, y: 1, w: 82, h: 27 },
  '119x36': { x: 0, y: 1, w: 91, h: 33 },
};
// A character in the middle of the scene.
const central = (r: Rect, half: number, h: number) => fig(r.x + Math.floor(r.w / 2), r.y + Math.floor((r.h - h) / 2), half, h);
const pal = getTheme('cafe')!.palette;
const vitals: Vitals = { model: 'claude-opus-5-5', window: 200_000, context: 156_000, outTokens: 182_400, errors: [], streak: 12, turnEndedAt: 0, busySince: NOW - 9 * 60_000, lastAt: NOW, midTool: false, title: 'Fix the tokenizer edge case', branch: 'main' };
const info = (o: Partial<AgentInfo> = {}): AgentInfo => ({ id: 'n', name: 'nova', role: 'lead', project: 'p', activity: 'write', detail: 'Edit src/parser.ts', since: NOW - 252_000, lastSeen: NOW, vitals, ...o });
const opts = (o: Partial<CardOpts> = {}): CardOpts => ({ info: info(), meters: meters(vitals, NOW), subs: 3, color: [120, 200, 255], palette: pal, now: NOW, ...o });

test('model names and token counts read short', () => {
  assert.equal(modelName('claude-opus-5-5'), 'opus 5.5');
  assert.equal(modelName('claude-haiku-4-5-20251001'), 'haiku 4.5');
  assert.equal(modelName('some-model'), 'some-model');
  assert.equal(tokens(950), '950');
  assert.equal(tokens(182_400), '182k');
  assert.equal(tokens(1_250_000), '1.3M');
});

test('the card sits beside its character, a cell clear, on the side with room, inside the scene', () => {
  assert.deepEqual(placeCard(SCENE, FIG), { x: 24, y: 10, side: 'right' });
  // Near the right edge it goes to the left.
  assert.deepEqual(placeCard(SCENE, fig(80, 12)), { x: 78 - 1 - CARD_W, y: 10, side: 'left' });
  // Never above or below the scene.
  assert.equal(placeCard(SCENE, fig(20, 1)).y, SCENE.y);
  assert.equal(placeCard(SCENE, fig(20, 27)).y, SCENE.y + SCENE.h - CARD_H);
  // With no room either side, above it, else below it, centred on it.
  const narrow = SCENES['92x30'];
  assert.deepEqual(placeCard(narrow, fig(46, 11, 3, 7)), { x: 25, y: 11 - 1 - CARD_H, side: 'above' });
  assert.deepEqual(placeCard(narrow, fig(46, 3, 3, 7)), { x: 25, y: 9 + 2, side: 'below' });
  // No character in view: docked in the bottom-right corner.
  assert.deepEqual(placeCard(SCENE, null), { x: SCENE.x + SCENE.w - CARD_W - 1, y: SCENE.y + SCENE.h - CARD_H - 1, side: null });
});

test('the card keeps the side it took while it still fits there', () => {
  // Both sides fit: the right one first, the one it had if any.
  assert.equal(placeCard(SCENE, fig(50, 12)).side, 'right');
  assert.equal(placeCard(SCENE, fig(50, 12), 'left').side, 'left');
  // A side with no room is no choice.
  assert.equal(placeCard(SCENE, fig(20, 12), 'left').side, 'right');
  // A character drifting a few cells about where the right side runs out
  // of room: its card goes left once and stays.
  let side: Side | null = null;
  let flips = 0;
  for (let i = 0; i < 200; i++) {
    const p = placeCard(SCENE, fig(53 + Math.round(3 * Math.sin(i / 5)), 12), side);
    assert.ok(p.side, `docked at frame ${i}`);
    if (side && p.side !== side) flips++;
    side = p.side;
  }
  assert.ok(flips <= 1, `${flips} flips`);
});

test('the card never covers its character while any spot keeps clear of it', () => {
  // Sizes at the fitted zoom, the close-up on a selection and zoomed in.
  const sizes: Array<[number, number]> = [[1, 2], [2, 4], [3, 7], [6, 14]];
  for (const [name, r] of Object.entries(SCENES)) {
    for (const [half, h] of sizes) {
      const boxes = [central(r, half, h)];
      for (let row = r.y - h + 1; row < r.y + r.h; row += 2) for (let col = r.x; col < r.x + r.w; col += 3) boxes.push(fig(col, row, half, h));
      for (const b of boxes) {
        const p = placeCard(r, b);
        assert.ok(within(p, r), `${name}: card outside the scene for ${JSON.stringify(b)}`);
        if (room(r, b)) assert.ok(!covers(p, b), `${name}: card at ${p.x},${p.y} covers ${JSON.stringify(b)}`);
      }
    }
  }
});

test('at 80x24 and 92x30 a character in the middle keeps clear of its card, zoomed in too', () => {
  for (const [name, half, h] of [['80x24', 2, 4], ['92x30', 2, 4], ['92x30', 3, 7]] as const) {
    const b = central(SCENES[name], half, h);
    const p = placeCard(SCENES[name], b);
    assert.ok(!covers(p, b), `${name} ${half}x${h}: ${JSON.stringify(p)} covers ${JSON.stringify(b)}`);
  }
});

test('with no room beside, above or below, the card docks in the farthest corner that keeps clear', () => {
  const r = SCENES['92x30'];
  // Twelve rows tall in the middle: seven rows over it and eight under it,
  // too few with a gap; flush with the bottom, the card keeps clear.
  const b = { x0: 41, y0: 8, x1: 51, y1: 19 };
  assert.deepEqual(placeCard(r, b), { x: r.x, y: r.y + r.h - CARD_H, side: null });
});

test('where nothing keeps clear, the card covers the least it can, and its feet rather than its head', () => {
  // An 80x24 scene, its character centred at the close-up: seven rows
  // tall, with seven rows above and below it and 36 columns either side.
  const r = SCENES['80x24'];
  const b = central(r, 3, 7);
  assert.ok(!room(r, b));
  const p = placeCard(r, b);
  assert.ok(within(p, r));
  assert.equal(p.y, b.y1, `card at row ${p.y}, the feet at ${b.y1}`);
});

test('the card shows the agent, its meters and the facts', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), FIG);
  const text = s.toText();
  for (const want of ['nova · lead', '4m', 'Edit src/parser.ts', '"Fix the tokenizer edge case"', 'main', 'context', '78%', 'energy', 'health', 'mood', '▲12', 'opus 5.5 · 9m on task · 3 subagents', '[⏎]talk', '[c]heer', '[esc]']) {
    assert.ok(text.includes(want), `missing "${want}" in\n${text}`);
  }
  // The card sets a background, so the scene's image does not show through.
  const { x, y } = placeCard(SCENE, FIG);
  assert.notEqual(s.bg[y * 100 + x + 5], DEFAULT);
});

test('the facts say the time on task, not the output tokens', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), FIG);
  assert.doesNotMatch(s.toText(), /\bout\b/);
  // No working stretch yet: no time on task.
  const fresh: Vitals = { ...vitals, busySince: 0 };
  const s2 = new Screen(100, 32);
  drawCard(s2, SCENE, opts({ info: info({ vitals: fresh }), meters: meters(fresh, NOW), subs: 1 }), FIG);
  assert.match(s2.toText(), /opus 5\.5 · 1 subagent /);
  assert.doesNotMatch(s2.toText(), /on task/);
});

test('the mood\'s streak tops out at 99+', () => {
  const text = (streak: number) => {
    const v: Vitals = { ...vitals, streak };
    const s = new Screen(100, 32);
    drawCard(s, SCENE, opts({ info: info({ vitals: v }), meters: meters(v, NOW) }), FIG);
    return s.toText();
  };
  assert.match(text(99), /mood ▲99 /);
  assert.match(text(100), /mood ▲99\+ /);
  assert.match(text(12345), /mood ▲99\+ /);
});

test('a resting agent shows no time on task', () => {
  const text = (v: Vitals) => {
    const s = new Screen(100, 32);
    drawCard(s, SCENE, opts({ info: info({ vitals: v }), meters: meters(v, NOW) }), FIG);
    return s.toText();
  };
  // Ten quiet minutes since its turn stopped, three hours after it began.
  const resting: Vitals = { ...vitals, busySince: NOW - 3 * 3600_000, lastAt: NOW - 10 * 60_000, midTool: false };
  assert.doesNotMatch(text(resting), /on task/);
  // The same quiet in a long tool run is work.
  assert.match(text({ ...resting, midTool: true }), /opus 5\.5 · 3h on task/);
});

test('without vitals the card says so instead of showing meters', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts({ info: info({ vitals: undefined }), meters: null }), FIG);
  const text = s.toText();
  assert.ok(text.includes('no vitals yet'));
  assert.ok(!text.includes('context'));
});

test('meters colour by level; a critical one pulses in the bad colour', () => {
  const { x, y } = placeCard(SCENE, FIG);
  const row = y + 3; // the context row
  const bar = x + 10; // its first bar cell
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), FIG);
  assert.deepEqual(s.fgAt(bar, row), pal.warn, '78% full: amber');
  const full: Vitals = { ...vitals, context: 195_000 };
  const s2 = new Screen(100, 32);
  // Even half-seconds show the bad colour, odd ones dim: a gentle pulse.
  drawCard(s2, SCENE, opts({ meters: meters(full, NOW), now: 1_000 }), FIG);
  assert.deepEqual(s2.fgAt(bar, row), pal.bad);
});

test('tokens never print 1000k', () => {
  assert.equal(tokens(999_499), '999k');
  assert.equal(tokens(999_500), '1.0M');
  assert.equal(tokens(999_999), '1.0M');
});

test('a non-finite position docks', () => {
  const dock = placeCard(SCENE, null);
  assert.deepEqual(placeCard(SCENE, { ...FIG, x0: NaN }), dock);
  assert.deepEqual(placeCard(SCENE, { ...FIG, y1: Infinity }), dock);
});

test('a scene smaller than the card gets no card; a small one docks inside', () => {
  const s = new Screen(60, 10);
  const before = s.toText();
  drawCard(s, { x: 0, y: 1, w: 40, h: 6 }, opts(), fig(10, 3));
  assert.equal(s.toText(), before);
  const small = { x: 3, y: 1, w: 50, h: 12 };
  const p = placeCard(small, fig(10, 5));
  assert.ok(p.x >= small.x && p.x + CARD_W <= small.x + small.w && p.y >= small.y && p.y + CARD_H <= small.y + small.h);
  const tiny = { x: 2, y: 1, w: 44, h: 8 };
  const q = placeCard(tiny, null);
  assert.deepEqual(q, { x: 2, y: 1, side: null });
});

test('a long branch is capped and does not erase the title', () => {
  const long: Vitals = { ...vitals, branch: 'feature/'.padEnd(40, 'x') };
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts({ info: info({ vitals: long }), meters: meters(long, NOW) }), FIG);
  const text = s.toText();
  assert.ok(text.includes('"Fix the tokenizer edge'), text);
  assert.ok(/feature\/x+…/.test(text), text);
});

const lumOf = (c: ArrayLike<number>) => {
  const f = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
};
const ratio = (a: ArrayLike<number>, b: ArrayLike<number>) => {
  const [hi, lo] = [lumOf(a), lumOf(b)].sort((m, n) => n - m);
  return (hi + 0.05) / (lo + 0.05);
};

test('in every theme the frame reads at 3:1 and the dim text at 4.5:1', () => {
  const { x, y } = placeCard(SCENE, FIG);
  for (const th of THEMES) {
    const s = new Screen(100, 32);
    drawCard(s, SCENE, opts({ palette: th.palette }), FIG);
    const corner = s.fgAt(x, y);
    const role = s.fgAt(x + 8, y); // the '·' before the role
    assert.ok(ratio(corner, th.palette.panel) >= 3, `${th.id} frame ${ratio(corner, th.palette.panel)}`);
    assert.ok(ratio(role, th.palette.panel) >= 4.5, `${th.id} dim ${ratio(role, th.palette.panel)}`);
  }
});

test('the frame stays intact and nothing is drawn outside it', () => {
  const longV = (o: Partial<Vitals>): Vitals => ({ ...vitals, ...o });
  const cases: { name: string; o: Partial<CardOpts>; at: Box }[] = [
    { name: 'long name', o: { info: info({ name: 'n'.repeat(40) }) }, at: FIG },
    { name: 'long detail and title', o: { info: info({ detail: 'd'.repeat(100), vitals: longV({ title: 't'.repeat(100) }) }) }, at: FIG },
    { name: 'emoji and CJK', o: { info: info({ detail: '🎉 日本語のテキスト 🎉', vitals: longV({ title: '日本語🎉日本語🎉日本語🎉日本語🎉日本語🎉日本語🎉日本語🎉' }) }) }, at: FIG },
    { name: 'long branch', o: { info: info({ vitals: longV({ branch: 'b'.repeat(40) }) }) }, at: FIG },
    { name: 'hours', o: { info: info({ since: NOW - 30 * 3600_000 }) }, at: FIG },
    { name: 'empty model', o: { info: info({ vitals: longV({ model: '' }) }) }, at: FIG },
    { name: 'one sub', o: { subs: 1 }, at: FIG },
    { name: 'long model', o: { info: info({ vitals: longV({ model: 'm'.repeat(80) }) }) }, at: FIG },
    { name: 'a level and a long name', o: { info: info({ name: 'n'.repeat(40), level: 120 }) }, at: FIG },
    { name: 'left edge', o: {}, at: fig(0, 12) },
    { name: 'right edge', o: {}, at: fig(99, 12) },
  ];
  for (const c of cases) {
    const s = new Screen(100, 32);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 100; i++) s.put(i, j, '¤');
    drawCard(s, SCENE, opts(c.o), c.at);
    const { x, y } = placeCard(SCENE, c.at);
    for (let j = 0; j < 32; j++) {
      for (let i = 0; i < 100; i++) {
        const ch = s.ch[j * 100 + i];
        const inside = i >= x && i < x + CARD_W && j >= y && j < y + CARD_H;
        if (!inside) {
          assert.equal(ch, '¤', `${c.name}: wrote outside at ${i},${j}`);
          continue;
        }
        const top = j === y;
        const bottom = j === y + CARD_H - 1;
        if (i === x) assert.equal(ch, top ? '╭' : bottom ? '╰' : '│', `${c.name}: left edge row ${j - y}`);
        if (i === x + CARD_W - 1) assert.equal(ch, top ? '╮' : bottom ? '╯' : '│', `${c.name}: right edge row ${j - y}`);
        assert.notEqual(ch, '¤', `${c.name}: unfilled cell ${i},${j} (card at ${x},${y})`);
      }
    }
  }
});

test('the top edge has a space before the name', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), FIG);
  const { x, y } = placeCard(SCENE, FIG);
  const top = s.toText().split('\n')[y].slice(x);
  assert.ok(top.startsWith('╭─ nova · lead'), top);
});

test('the bars are thin lines: a heavy line filled, a light one empty', () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts(), FIG);
  const { x, y } = placeCard(SCENE, FIG);
  const row = s.toText().split('\n')[y + 3];
  // 78% full: eight of ten cells filled.
  assert.ok(row.slice(x).includes('━━━━━━━━──'), row);
});

test('a box of another size is placed by the same rules', () => {
  const big = { w: 50, h: 20 };
  // Room on the right: beside its character, centred on it, a cell clear.
  assert.deepEqual(placeCard(SCENE, FIG, null, big), { x: 24, y: 4, side: 'right' });
  // No character in view: docked a cell in from the bottom-right corner.
  assert.deepEqual(placeCard(SCENE, null, null, big), { x: SCENE.x + SCENE.w - big.w - 1, y: SCENE.y + SCENE.h - big.h - 1, side: null });
  // No room on any side: a corner, inside the scene.
  const p = placeCard(SCENE, fig(50, 12), null, big);
  assert.equal(p.side, null);
  assert.ok(p.x >= SCENE.x && p.x + big.w <= SCENE.x + SCENE.w && p.y >= SCENE.y && p.y + big.h <= SCENE.y + SCENE.h, JSON.stringify(p));
});

test('in every theme the agent name reads on the panel at 4.5:1, whatever its colour', () => {
  const { x, y } = placeCard(SCENE, FIG);
  for (const th of THEMES) {
    for (const color of [th.palette.panel, [0, 0, 0], [255, 255, 255], [120, 200, 255]] as [number, number, number][]) {
      const s = new Screen(100, 32);
      drawCard(s, SCENE, opts({ palette: th.palette, color }), FIG);
      const name = s.fgAt(x + 3, y); // 'n' of nova on the top edge
      assert.ok(ratio(name, th.palette.panel) >= 4.5, `${th.id} ${color} ${ratio(name, th.palette.panel)}`);
    }
  }
});

test("the top edge shows the agent's level in its crew, ★N in gold, when it has one", () => {
  const s = new Screen(100, 32);
  drawCard(s, SCENE, opts({ info: info({ level: 3 }) }), FIG);
  const { x, y } = placeCard(SCENE, FIG);
  const top = s.toText().split('\n')[y].slice(x);
  assert.ok(top.startsWith('╭─ ★3 nova · lead'), top);
  const fg = s.fgAt(x + 3, y);
  assert.deepEqual(fg, legible(pal.warn, pal.panel, pal.panelText, 4.5));
  const t = new Screen(100, 32);
  drawCard(t, SCENE, opts({ info: info({ level: 140 }) }), FIG);
  assert.ok(t.toText().split('\n')[y].slice(x).startsWith('╭─ ★99 nova · lead'), 'capped at 99');
});
