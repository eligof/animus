import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Dashboard, activityRates, grid, sparkline, CARD_MIN_W } from '../src/ui/dashboard.ts';
import { Screen } from '../src/term/screen.ts';
import type { Rect } from '../src/term/screen.ts';
import { hex } from '../src/term/color.ts';
import type { RGB } from '../src/term/color.ts';
import type { Palette } from '../src/themes/types.ts';
import type { AgentInfo } from '../src/agents.ts';

const NOW = 1_700_000_000_000;

const P: Palette = {
  bg: hex('#1a120d'), wall: hex('#ead9bb'), wall2: hex('#d9c3a0'), floor: hex('#a36a3c'), floor2: hex('#8a5a33'),
  text: hex('#f4e8d4'), dim: hex('#a88d74'), accent: hex('#e0a84a'), accent2: hex('#c8663f'), panel: hex('#24180f'),
  panelText: hex('#f4e8d4'), border: hex('#9a6a44'), bubble: hex('#fff7ea'), bubbleText: hex('#3b2a1e'),
  good: hex('#8fbf7a'), warn: hex('#e8a94e'), bad: hex('#d0583e'),
};

function agent(id: string, over: Partial<AgentInfo> = {}): AgentInfo {
  return { id, name: id, role: 'lead', project: 'animus', activity: 'write', detail: 'Edit cli.ts', since: NOW, lastSeen: NOW, ...over };
}

const sub = (id: string, parentId: string, over: Partial<AgentInfo> = {}) => agent(id, { role: 'sub', parentId, agentType: 'Explore', ...over });

function render(d: Dashboard, w: number, h: number, selectedId: string | null = null, now = NOW): Screen {
  const s = new Screen(w, h);
  d.draw(s, { x: 0, y: 0, w, h }, { palette: P, now, selectedId });
  return s;
}

const lines = (s: Screen) => s.toText().split('\n');
const sum = (c: RGB) => c[0] + c[1] + c[2];

// Where `needle` starts on screen (first match).
function find(s: Screen, needle: string): { x: number; y: number } {
  const y = lines(s).findIndex((l) => l.includes(needle));
  assert.ok(y >= 0, `"${needle}" not on screen:\n${s.toText()}`);
  return { x: lines(s)[y].indexOf(needle), y };
}

test('grid: one to four columns by width, cards at least the minimum wide', () => {
  const cases: Array<[number, number]> = [[20, 1], [34, 1], [69, 1], [72, 2], [100, 2], [110, 3], [122, 3], [150, 4], [300, 4]];
  for (const [w, cols] of cases) {
    const g = grid(w);
    assert.equal(g.cols, cols, `w=${w}`);
    assert.ok(g.left + g.cols * g.cardW + (g.cols - 1) * 2 <= w, `grid overflows w=${w}`);
    if (w >= CARD_MIN_W) assert.ok(g.cardW >= CARD_MIN_W, `cards too narrow at w=${w}`);
  }
  const d = new Dashboard();
  d.observe(['ann', 'bob', 'cat', 'dan'].map((n) => agent(n)), NOW);
  const row = lines(render(d, 150, 12)).find((l) => l.includes('ann')) ?? '';
  for (const n of ['ann', 'bob', 'cat', 'dan']) assert.ok(row.includes(` ${n} `), `${n} not on the first card row`);
});

test('leads come first in first-seen order, each followed by its subagents', () => {
  const d = new Dashboard();
  d.observe([agent('L1'), sub('S1', 'L1')], NOW);
  d.observe([sub('S2', 'L2'), agent('L1'), agent('L2'), sub('S1', 'L1'), sub('S3', 'L1')], NOW + 1000);
  assert.deepEqual(d.order(), ['L1', 'S1', 'S3', 'L2', 'S2']);
  const t = render(d, 40, 40).toText();
  const at = ['L1', 'S1', 'S3', 'L2', 'S2'].map((n) => t.indexOf(`─ ${n} ─`));
  assert.ok(at.every((v, i) => v >= 0 && (i === 0 || v > at[i - 1])), `cards out of order:\n${t}`);
});

test('order is stable: activity changes never move cards; orphans go last; a returning agent keeps its place', () => {
  const d = new Dashboard();
  d.observe([agent('A'), agent('B'), sub('S', 'B')], NOW);
  d.observe([agent('B', { activity: 'error' }), agent('A', { activity: 'idle' }), sub('S', 'B', { activity: 'done' })], NOW + 1000);
  assert.deepEqual(d.order(), ['A', 'B', 'S']);
  d.observe([sub('S', 'B'), agent('A'), sub('O', 'gone')], NOW + 2000);
  assert.deepEqual(d.order(), ['A', 'S', 'O']);
  d.observe([agent('A'), agent('B'), sub('S', 'B')], NOW + 30_000);
  assert.deepEqual(d.order(), ['A', 'B', 'S']);
});

test('history of agents gone for over a minute is dropped', () => {
  const d = new Dashboard();
  d.observe([agent('B'), agent('A')], NOW);
  d.observe([agent('A')], NOW + 1000);
  d.observe([agent('A')], NOW + 70_000);
  d.observe([agent('B'), agent('A')], NOW + 71_000);
  // B is new again, so it now sorts after A.
  assert.deepEqual(d.order(), ['A', 'B']);
});

test('a card shows name, role, status, detail and context inside a rounded border', () => {
  const d = new Dashboard();
  d.observe([agent('atlas', { since: NOW - 12_000 }), sub('Review auth', 'atlas', { agentType: 'code-reviewer', activity: 'read', detail: 'Read auth.ts' })], NOW);
  const s = render(d, 60, 20);
  const t = s.toText();
  assert.match(t, /╭─ atlas ─+╮/);
  assert.match(t, /│ ✎ writing +12s │/);
  assert.match(t, /│ Edit cli\.ts +│/);
  assert.match(t, /╰─ lead · animus · 1 sub ─+╯/);
  assert.match(t, /╭─ Review auth ─+╮/);
  assert.match(t, /▤ reading/);
  assert.match(t, /╰─ code-reviewer · sub of atlas ─+╯/);
  const name = find(s, 'atlas');
  assert.equal(s.attr[name.y * s.width + name.x], 1, 'name is bold');
  const status = find(s, 'writing');
  assert.deepEqual(s.fgAt(status.x, status.y), P.accent);
  assert.deepEqual(s.fgAt(status.x - 2, status.y), P.accent);
});

test('long names and details are clipped with an ellipsis inside the card', () => {
  const d = new Dashboard();
  d.observe([agent('a-really-long-agent-name-that-goes-on-and-on', { activity: 'run', detail: `$ ${'x'.repeat(200)}` })], NOW);
  const s = render(d, 40, 8);
  const detail = lines(s).find((l) => l.includes('$ xxx')) ?? '';
  assert.match(detail, /^ *│ \$ x+… *│ *$/);
  const top = lines(s).find((l) => l.includes('╭')) ?? '';
  assert.match(top, /^ *╭─ a-really-long[^ ]*… ─+╮ *$/);
});

test('activityRates counts the events in the minute before each sample', () => {
  const times: number[] = [];
  for (let t = NOW - 170_000; t <= NOW; t += 10_000) times.push(t);
  assert.deepEqual(activityRates(times, NOW, 10), [0, 0, 0, 0, 0, 0, 0, 6, 6, 6]);
  // Before the agent was first seen there is no history (-1).
  assert.deepEqual(activityRates(times, NOW, 10, NOW - 200_000), [-1, -1, -1, -1, -1, -1, 0, 6, 6, 6]);
  assert.deepEqual(activityRates([], NOW, 3), [0, 0, 0]);
  assert.equal(sparkline([-1, 0, 1, 3, 6, 12], 12), ' ▁▁▂▄█');
  assert.equal(sparkline([0, 50], 10), '▁█');
});

test('the card shows the last-minute rate and a sparkline of observed changes', () => {
  const d = new Dashboard();
  const start = NOW - 180_000;
  for (let t = start; t <= NOW; t += 1000) d.observe([agent('A', { detail: `Edit f${Math.floor((t - start) / 10_000)}.ts` })], t);
  const s = render(d, 40, 8);
  const row = lines(s).find((l) => l.includes('/min')) ?? '';
  assert.match(row, / 6\/min │/);
  const bars = row.trim().slice(2).split(' ')[0];
  assert.match(bars, /^·+[▁▂▃▄▅▆▇█]+$/, 'unseen time, then bars');
  assert.ok(bars.endsWith('█'), 'the busiest moment fills the bar');
});

test('the selected card gets the accent border and stays visible when the grid scrolls', () => {
  const d = new Dashboard();
  d.observe(Array.from({ length: 12 }, (_, i) => agent(`agent${String(i).padStart(2, '0')}`)), NOW);
  let s = render(d, 40, 20, 'agent11');
  let t = s.toText();
  assert.match(t, /agent11/);
  assert.doesNotMatch(t, /agent00/);
  assert.match(t, /▲ \+9 more/);
  assert.doesNotMatch(t, /▼/);
  const sel = find(s, 'agent11');
  const corner = lines(s)[sel.y].indexOf('╭');
  assert.deepEqual(s.fgAt(corner, sel.y), P.accent);
  assert.deepEqual(s.fgAt(sel.x, sel.y), P.accent);
  const other = find(s, 'agent10');
  assert.deepEqual(s.fgAt(lines(s)[other.y].indexOf('╭'), other.y), P.border);

  s = render(d, 40, 20, 'agent00');
  t = s.toText();
  assert.match(t, /agent00/);
  assert.match(t, /▼ \+9 more/);
  assert.doesNotMatch(t, /▲/);
});

test('a team with subagents starts on a fresh row when there is room, and packs when there is not', () => {
  const d = new Dashboard();
  d.observe([agent('L1'), sub('S1', 'L1'), agent('L2')], NOW);
  const roomy = render(d, 150, 20);
  assert.notEqual(find(roomy, ' L1 ').y, find(roomy, ' L2 ').y);
  assert.equal(find(roomy, ' L1 ').y, find(roomy, ' S1 ').y);
  const tight = render(d, 150, 6);
  assert.equal(find(tight, ' L1 ').y, find(tight, ' L2 ').y);
});

test('errors get a red marker and the error text; past errors stay flagged for a minute', () => {
  const d = new Dashboard();
  d.observe([agent('A')], NOW - 5000);
  d.observe([agent('A', { activity: 'error', detail: 'tool failed: ENOENT', since: NOW - 2000 })], NOW - 2000);
  let s = render(d, 60, 10);
  const mark = find(s, '✖ error');
  assert.deepEqual(s.fgAt(mark.x, mark.y), P.bad);
  const text = find(s, 'tool failed: ENOENT');
  assert.deepEqual(s.fgAt(text.x, text.y), P.bad);
  assert.deepEqual(s.fgAt(lines(s)[mark.y - 1].indexOf('╭'), mark.y - 1), P.bad, 'red border');

  d.observe([agent('A', { activity: 'read', detail: 'Read x.ts' })], NOW);
  s = render(d, 60, 10);
  const flag = find(s, '✖ tool failed: ENOENT · 2s ago');
  assert.deepEqual(s.fgAt(flag.x, flag.y), P.bad);
  assert.doesNotMatch(render(d, 60, 10, null, NOW + 61_000).toText(), /✖/);
});

test('done and idle cards are dimmed', () => {
  const d = new Dashboard();
  d.observe([agent('busy'), agent('rest', { activity: 'idle' }), agent('fin', { activity: 'done' })], NOW);
  const s = render(d, 40, 30);
  const fg = (n: string) => {
    const at = find(s, ` ${n} `);
    return s.fgAt(at.x + 1, at.y);
  };
  assert.deepEqual(fg('busy'), P.panelText);
  assert.ok(sum(fg('rest')) < sum(P.panelText) * 0.8);
  assert.ok(sum(fg('fin')) < sum(P.panelText) * 0.8);
});

test('no agents: a friendly centred line', () => {
  const s = render(new Dashboard(), 100, 20);
  const line = lines(s).find((l) => l.includes('no agents yet')) ?? '';
  assert.match(line, /no agents yet — start Claude Code in another terminal/);
  const left = line.length - line.trimStart().length;
  const right = line.length - line.trimEnd().length;
  assert.ok(Math.abs(left - right) <= 1, 'centred');
  const narrow = render(new Dashboard(), 30, 10).toText();
  assert.match(narrow, /no agents yet/);
  assert.match(narrow, /start Claude Code in/);
});

test('tiny rects list one agent per line; nothing is ever drawn outside the rect', () => {
  const d = new Dashboard();
  d.observe([
    agent('atlas'),
    sub('helper', 'atlas', { detail: 'Read a-very-long-file-name-for-clipping.ts' }),
    agent('nova', { activity: 'error', detail: 'boom' }),
  ], NOW);
  const rects: Rect[] = [
    { x: 5, y: 3, w: 0, h: 0 }, { x: 5, y: 3, w: 1, h: 1 }, { x: 5, y: 3, w: 10, h: 2 }, { x: 5, y: 3, w: 30, h: 4 },
    { x: 5, y: 3, w: 20, h: 12 }, { x: 5, y: 3, w: 36, h: 6 }, { x: 5, y: 3, w: 70, h: 7 }, { x: 5, y: 3, w: 120, h: 30 },
    { x: -3, y: -2, w: 50, h: 10 }, { x: 100, y: 30, w: 80, h: 40 },
  ];
  const mark: RGB = [1, 2, 3];
  for (const r of rects) {
    for (const empty of [false, true]) {
      const s = new Screen(140, 40);
      s.fill({ x: 0, y: 0, w: 140, h: 40 }, '#', mark, mark);
      (empty ? new Dashboard() : d).draw(s, r, { palette: P, now: NOW, selectedId: 'nova' });
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          if (x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) continue;
          assert.equal(s.charAt(x, y), '#', `drew outside ${JSON.stringify(r)} at ${x},${y}`);
          assert.deepEqual(s.bgAt(x, y), mark);
        }
      }
    }
  }
  const s = new Screen(30, 2);
  d.draw(s, { x: 0, y: 0, w: 30, h: 2 }, { palette: P, now: NOW, selectedId: null });
  assert.match(s.toText(), /✎ atlas Edit cli\.ts/);
  assert.match(s.toText(), /\+2 more/);
  const list = new Screen(30, 4);
  d.draw(list, { x: 0, y: 0, w: 30, h: 4 }, { palette: P, now: NOW, selectedId: 'nova' });
  assert.match(list.toText(), /✖ nova boom/);
  assert.match(list.toText(), /^ {2}✎ helper Read a-very/m);
});
