import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/ui/layout.ts';
import { drawHeader, drawRoster, drawFooter, activityGlyph } from '../src/ui/chrome.ts';
import type { ChromeCtx } from '../src/ui/chrome.ts';
import { drawHelp, drawPicker, drawTooSmall, drawBox } from '../src/ui/overlays.ts';
import { Screen } from '../src/term/screen.ts';
import { isWide } from '../src/term/width.ts';
import { lab } from '../src/themes/lab.ts';
import { THEMES } from '../src/themes/index.ts';
import { Stage } from '../src/world/stage.ts';
import { ACTIVITIES } from '../src/agents.ts';
import type { AgentInfo } from '../src/agents.ts';

const NOW = 1_700_000_000_000;

test('wide layout has a roster column', () => {
  const L = computeLayout(120, 36);
  assert.equal(L.tooSmall, false);
  assert.deepEqual(L.header, { x: 0, y: 0, w: 120, h: 1 });
  assert.deepEqual(L.footer, { x: 0, y: 34, w: 120, h: 2 });
  assert.deepEqual(L.roster, { x: 92, y: 1, w: 28, h: 33 });
  assert.deepEqual(L.scene, { x: 0, y: 1, w: 92, h: 33 });
});

test('narrow layout drops the roster', () => {
  const L = computeLayout(100, 30);
  assert.equal(L.roster, null);
  assert.deepEqual(L.scene, { x: 0, y: 1, w: 100, h: 27 });
});

test('tiny terminals are flagged', () => {
  assert.equal(computeLayout(50, 15).tooSmall, true);
  assert.equal(computeLayout(60, 20).tooSmall, false);
});

test('activity glyphs are single narrow characters', () => {
  for (const a of ACTIVITIES) {
    const g = activityGlyph(a);
    assert.equal([...g].length, 1, a);
    assert.ok(!isWide(g), a);
  }
});

function ctx(): ChromeCtx {
  const stage = new Stage(lab);
  stage.layout({ x: 0, y: 1, w: 92, h: 33 });
  const agents: AgentInfo[] = [
    { id: 'L', name: 'atlas', role: 'lead', project: 'animus', activity: 'write', detail: 'Edit cli.ts', since: NOW - 65000, lastSeen: NOW },
    { id: 'S', name: 'Review auth', role: 'sub', parentId: 'L', project: 'animus', agentType: 'code-reviewer', activity: 'read', detail: 'Read auth.ts', since: NOW, lastSeen: NOW },
  ];
  stage.sync(agents, NOW);
  return {
    theme: lab,
    actors: stage.actors(),
    selectedId: 'S',
    account: { name: 'Ada', plan: 'max' },
    mode: 'live',
    events: [{ at: NOW, agentId: 'L', name: 'atlas', activity: 'write', detail: 'Edit cli.ts' }],
    notice: '',
    t: 1.5,
    now: NOW,
    paused: false,
  };
}

test('header shows brand, theme, account and counts', () => {
  const s = new Screen(120, 1);
  drawHeader(s, { x: 0, y: 0, w: 120, h: 1 }, ctx());
  const text = s.toText();
  assert.match(text, /ANIMUS/);
  assert.match(text, /Mad Science Lab/);
  assert.match(text, /Ada/);
  assert.match(text, /2 working/);
});

test('roster lists every actor with detail', () => {
  const s = new Screen(28, 20);
  drawRoster(s, { x: 0, y: 0, w: 28, h: 20 }, ctx());
  const text = s.toText();
  assert.match(text, /atlas/);
  assert.match(text, /Review auth/);
  assert.match(text, /Edit cli\.ts/);
  assert.match(text, /1m/);
});

test('roster truncates when out of room', () => {
  const c = ctx();
  const s = new Screen(28, 4);
  drawRoster(s, { x: 0, y: 0, w: 28, h: 4 }, c);
  assert.match(s.toText(), /more/);
});

test('footer shows ticker, keys and notice', () => {
  const c = ctx();
  c.notice = 'press d for demo';
  const s = new Screen(120, 2);
  drawFooter(s, { x: 0, y: 0, w: 120, h: 2 }, c);
  const text = s.toText();
  assert.match(text, /Edit cli\.ts/);
  assert.match(text, /theme/);
  assert.match(text, /press d for demo/);
});

test('overlays draw inside the screen', () => {
  const s = new Screen(100, 30);
  drawBox(s, { x: 2, y: 2, w: 10, h: 4 }, [1, 1, 1], [2, 2, 2], 'hi');
  assert.equal(s.charAt(2, 2), '╭');
  drawHelp(s, { x: 0, y: 1, w: 100, h: 27 }, lab);
  assert.match(s.toText(), /quit/);
  const p = new Screen(100, 30);
  drawPicker(p, { x: 0, y: 1, w: 100, h: 27 }, THEMES, 0, 0);
  for (const t of THEMES) assert.ok(p.toText().includes(t.name), t.name);
  const tiny = new Screen(40, 10);
  drawTooSmall(tiny, lab);
  assert.match(tiny.toText(), /60.20/);
  for (const sc of [s, p, tiny]) for (const ch of sc.ch) assert.ok(!isWide(ch), ch);
});

test('the wipe dims both pixels of every cell behind the curtain', async () => {
  const { drawWipe } = await import('../src/ui/overlays.ts');
  const s = new Screen(40, 6);
  s.clear([200, 200, 200], [200, 200, 200]);
  for (let i = 0; i < s.ch.length; i++) s.ch[i] = '▀';
  drawWipe(s, { x: 0, y: 0, w: 40, h: 6 }, 0.25, [255, 0, 0], [0, 0, 0]);
  const behind = 35;
  for (let y = 0; y < 6; y++) {
    assert.ok(s.fgAt(behind, y)[0] < 100, `fg ${s.fgAt(behind, y)}`);
    assert.ok(s.bgAt(behind, y)[0] < 100, `bg ${s.bgAt(behind, y)}`);
  }
  assert.ok(s.ch.join('').includes('▓██▓'));
});
