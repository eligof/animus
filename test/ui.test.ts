import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout } from '../src/ui/layout.ts';
import { alertsOf, drawHeader, drawRoster, drawFooter, activityGlyph, fitWords, stateGlyph, statusOf, stepAge } from '../src/ui/chrome.ts';
import type { ChromeCtx } from '../src/ui/chrome.ts';
import { drawHelp, drawPicker, drawTooSmall, drawBox } from '../src/ui/overlays.ts';
import { Screen } from '../src/term/screen.ts';
import { isWide } from '../src/term/width.ts';
import { mines } from '../src/worlds/mines.ts';
import { THEMES } from '../src/themes/index.ts';
import { Stage } from '../src/world/stage.ts';
import { ACTIVITIES } from '../src/agents.ts';
import type { AgentEvent, AgentInfo } from '../src/agents.ts';

const NOW = 1_700_000_000_000;

test('wide layout has the crew bar on the left, the scene after it', () => {
  const L = computeLayout(120, 36);
  assert.equal(L.tooSmall, false);
  assert.deepEqual(L.header, { x: 0, y: 0, w: 120, h: 1 });
  assert.deepEqual(L.footer, { x: 0, y: 34, w: 120, h: 2 });
  assert.deepEqual(L.roster, { x: 0, y: 1, w: 28, h: 33 });
  assert.deepEqual(L.scene, { x: 28, y: 1, w: 92, h: 33 });
  // From 150 columns it has two more, for whole names.
  const W = computeLayout(150, 46);
  assert.deepEqual(W.roster, { x: 0, y: 1, w: 30, h: 43 });
  assert.deepEqual(W.scene, { x: 30, y: 1, w: 120, h: 43 });
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

const lead = (o: Partial<AgentInfo> = {}): AgentInfo => ({ id: 'L', name: 'atlas', role: 'lead', project: 'animus', activity: 'write', detail: 'Edit cli.ts', since: NOW - 65000, lastSeen: NOW, ...o });
const sub = (o: Partial<AgentInfo> = {}): AgentInfo => ({ id: 'S', name: 'Review auth', role: 'sub', parentId: 'L', project: 'animus', agentType: 'code-reviewer', activity: 'read', detail: 'Read auth.ts', since: NOW, lastSeen: NOW, ...o });

function ctxOf(agents: AgentInfo[], o: Partial<ChromeCtx> = {}): ChromeCtx {
  const stage = new Stage(mines);
  stage.layout({ x: 28, y: 1, w: 92, h: 33 });
  stage.sync(agents, NOW);
  return {
    theme: mines,
    actors: stage.actors(),
    selectedId: null,
    account: { name: 'Ada', plan: 'max' },
    mode: 'live',
    events: [],
    notice: '',
    t: 1.5,
    now: NOW,
    paused: false,
    ...o,
  };
}

function ctx(): ChromeCtx {
  return ctxOf([lead(), sub()], { selectedId: 'S', events: [{ at: NOW, agentId: 'L', name: 'atlas', activity: 'write', detail: 'Edit cli.ts' }] });
}

const rows = (s: Screen) => s.toText().split('\n');

// A crew with something of every kind: two leads waiting on you (one
// longer), a subagent failing, one asking you, one at work, one done.
function troubled(): AgentInfo[] {
  return [
    lead({ id: 'A', name: 'atlas', activity: 'idle', detail: 'waiting for you', needs: 'turn', since: NOW - 20_000 }),
    sub({ id: 'A1', parentId: 'A', name: 'Map the API', activity: 'error', detail: 'tool failed', since: NOW - 3_000 }),
    sub({ id: 'A2', parentId: 'A', name: 'Audit secrets', activity: 'search', detail: 'Grep "password"', since: NOW - 4_000 }),
    lead({ id: 'B', name: 'nova', activity: 'idle', detail: 'waiting for you', needs: 'turn', since: NOW - 40_000 }),
    sub({ id: 'B1', parentId: 'B', name: 'Plan migration', activity: 'talk', detail: 'asking you…', needs: 'input', since: NOW - 8_000 }),
    sub({ id: 'B2', parentId: 'B', name: 'Draft roadmap', activity: 'done', detail: 'finished', since: NOW - 2_000 }),
  ];
}

test('state: the source says what an agent waits on you for; a lead at rest is your turn even without it', () => {
  assert.equal(statusOf(lead({ activity: 'error' })), 'error');
  assert.equal(statusOf(sub({ activity: 'talk', needs: 'input' })), 'input');
  assert.equal(statusOf(sub({ activity: 'talk', needs: 'plan' })), 'input');
  assert.equal(statusOf(lead({ activity: 'idle', needs: 'turn' })), 'turn');
  assert.equal(statusOf(lead({ activity: 'idle' })), 'turn');
  // Words in the detail are not read: talk is talk unless the source says.
  assert.equal(statusOf(sub({ activity: 'talk', detail: 'asking you…' })), 'working');
  assert.equal(statusOf(sub({ activity: 'idle', detail: 'waiting for atlas' })), 'idle');
  assert.equal(statusOf(sub({ activity: 'done' })), 'done');
  // Each state its own shape, so the column reads without colour.
  const shapes = (['error', 'input', 'turn', 'working', 'idle', 'done'] as const).map(stateGlyph);
  assert.deepEqual(shapes, ['✖', '▲', '◆', '●', '○', '✔']);
  assert.equal(new Set(shapes).size, shapes.length);
});

test('NEEDS YOU: failing first, then blocked on you, then your turn, the longest waiting first', () => {
  const c = ctxOf(troubled());
  assert.deepEqual(alertsOf(c.actors).map((al) => `${stateGlyph(al.st)} ${al.a.info.name} ${al.why}`), [
    '✖ Map the API failed',
    '▲ Plan migration asks you',
    '◆ nova your turn',
    '◆ atlas your turn',
  ]);
  const s = new Screen(30, 30);
  drawRoster(s, { x: 0, y: 0, w: 30, h: 30 }, c);
  const r = rows(s);
  assert.match(r[1], /^ {2}NEEDS YOU 4/);
  assert.match(r[2], /^ {2}✖ Map the API +failed now /);
  // Too long to sit beside its reason: the name stays whole, the shape
  // says why.
  assert.match(r[3], /^ {2}▲ Plan migration +now /);
  assert.match(r[4], /^ {2}◆ nova +your turn 40s /);
  assert.match(r[5], /^ {2}◆ atlas +your turn 20s /);
  assert.equal(r[6].trim(), '', 'a blank row before the crew');
});

test('NEEDS YOU, the header and the crew agree, state for state', () => {
  const c = ctxOf(troubled());
  const head = new Screen(150, 1);
  drawHeader(head, { x: 0, y: 0, w: 150, h: 1 }, c);
  // 3 need you (two turns, one asking), 1 failing, 1 working, the done
  // one idle; no zero counts.
  assert.match(head.toText(), /1 working · 3 need you · 1 failing · 1 idle · Ada · live · \d\d:\d\d/);
  const s = new Screen(30, 30);
  drawRoster(s, { x: 0, y: 0, w: 30, h: 30 }, c);
  const r = rows(s);
  const crew = r.slice(r.findIndex((l, i) => i > 1 && l.trim() === '') + 1);
  const shapeOf = (name: string) => crew.find((l) => l.includes(name))?.trim()[0];
  assert.equal(shapeOf('atlas'), '◆');
  assert.equal(shapeOf('nova'), '◆');
  assert.equal(shapeOf('Map the API'), '✖');
  assert.equal(shapeOf('Plan migration'), '▲');
  assert.equal(shapeOf('Audit secrets'), '●');
  assert.equal(shapeOf('Draft roadmap'), '✔');
  const alerts = alertsOf(c.actors).length;
  assert.equal(crew.filter((l) => /^\s*[✖▲◆]/.test(l)).length, alerts);
  // A working agent with an old failure on record is working: no
  // lingering alarm anywhere.
  const recovered = ctxOf([lead({ vitals: { model: '', window: 200_000, context: 0, outTokens: 0, errors: [NOW - 5_000], streak: 0, turnEndedAt: 0, busySince: NOW - 9_000, lastAt: NOW, midTool: true, title: '', branch: '' } })]);
  assert.equal(alertsOf(recovered.actors).length, 0);
  const s2 = new Screen(30, 10);
  drawRoster(s2, { x: 0, y: 0, w: 30, h: 10 }, recovered);
  assert.doesNotMatch(s2.toText(), /NEEDS YOU|✖/);
  const h2 = new Screen(120, 1);
  drawHeader(h2, { x: 0, y: 0, w: 120, h: 1 }, recovered);
  assert.doesNotMatch(h2.toText(), /failing|need/);
});

test('NEEDS YOU is hidden while nothing needs you, and caps its rows with +N', () => {
  const calm = new Screen(28, 20);
  drawRoster(calm, { x: 0, y: 0, w: 28, h: 20 }, ctx());
  assert.doesNotMatch(calm.toText(), /NEEDS YOU/);
  assert.match(rows(calm)[1], /^ {2}● atlas/);
  const many = [lead({ id: 'L', activity: 'write' }), ...Array.from({ length: 9 }, (_, i) => sub({ id: `E${i}`, name: `broke ${i}`, activity: 'error', detail: 'tool failed', since: NOW - i * 1000 }))];
  const s = new Screen(28, 40);
  drawRoster(s, { x: 0, y: 0, w: 28, h: 40 }, ctxOf(many));
  const r = rows(s);
  assert.match(r[1], /NEEDS YOU 9/);
  assert.equal(r.slice(2, 8).filter((l) => /✖ broke/.test(l)).length, 5, 'six rows: five alerts and the rest');
  assert.match(r[7], /\+4 more/);
});

test('header shows brand, world, account and only the counts that are there', () => {
  const s = new Screen(120, 1);
  drawHeader(s, { x: 0, y: 0, w: 120, h: 1 }, ctx());
  const text = s.toText();
  assert.match(text, /◆ animus {2}The Mines/);
  assert.match(text, /Ada/);
  assert.match(text, /2 working · Ada · live/);
  assert.doesNotMatch(text, /\b0 |idle|need|failing/);
  // Short of room the account goes first, the alarms last.
  const narrow = new Screen(60, 1);
  drawHeader(narrow, { x: 0, y: 0, w: 60, h: 1 }, ctxOf(troubled()));
  assert.match(narrow.toText(), /3 need you · 1 failing/);
  assert.doesNotMatch(narrow.toText(), /Ada/);
});

test('roster lists every actor, a working one with what it is doing, and its time once it is a while', () => {
  const s = new Screen(28, 20);
  drawRoster(s, { x: 0, y: 0, w: 28, h: 20 }, ctx());
  const r = rows(s);
  assert.match(r[1], /^ {2}● atlas +1m ✎ $/);
  assert.match(r[2], /^ {4}Edit cli\.ts/);
  // The selected subagent: two cells in, its bar, its line; no seconds.
  assert.match(r[3], /^▌ {3}● Review auth +▤ $/);
  assert.match(r[4], /^▌ {5}Read auth\.ts/);
  assert.doesNotMatch(s.toText(), /\d+s\b/);
});

test('roster: when the crew does not fit, the lines go first, then the gaps, then a window keeps the selected in view', () => {
  const crew = [lead(), ...Array.from({ length: 12 }, (_, i) => sub({ id: `S${i}`, name: `helper ${i}` }))];
  const sel = 'S10';
  const s = new Screen(28, 10);
  drawRoster(s, { x: 0, y: 0, w: 28, h: 10 }, ctxOf(crew, { selectedId: sel }));
  const text = s.toText();
  assert.match(text, /helper 10/);
  assert.match(text, /▌ {5}Read auth\.ts/, 'the selected keeps its line');
  assert.match(text, /\+\d+ more/);
  // Room for one line each: only the selected has a second.
  const t = new Screen(28, 16);
  drawRoster(t, { x: 0, y: 0, w: 28, h: 16 }, ctxOf(crew, { selectedId: sel }));
  assert.equal(t.toText().match(/Read auth\.ts/g)?.length, 1);
  assert.doesNotMatch(t.toText(), /more/);
});

test('fitWords cuts only between words; a single long word is the one exception', () => {
  assert.equal(fitWords('Find entry points', 17), 'Find entry points');
  assert.equal(fitWords('Find entry points', 16), 'Find entry…');
  assert.equal(fitWords('Find entry points', 11), 'Find entry…');
  assert.equal(fitWords('Find entry points', 10), 'Find…');
  assert.equal(fitWords('supercalifragilistic', 8), 'superca…');
  assert.equal(fitWords('a · b', 4), 'a…');
  assert.equal(fitWords('anything', 0), '');
  for (let n = 1; n < 30; n++) assert.ok([...fitWords('Research options for the cache layer', n)].length <= n, `${n}`);
});

test('stepAge moves in ten-second steps, then minutes', () => {
  assert.deepEqual([0, 9_999, 10_000, 59_000, 60_000, 3_600_000].map(stepAge), ['now', 'now', '10s', '50s', '1m', '1h']);
});

const ev = (o: Partial<AgentEvent>): AgentEvent => ({ at: NOW, agentId: 'L', name: 'atlas', activity: 'write', detail: 'Edit cli.ts', ...o });

test('the log row holds milestones only, newest first, each with its age', () => {
  const c = ctxOf(troubled(), {
    events: [
      ev({ at: NOW - 50_000, agentId: 'A2', name: 'Audit secrets', activity: 'run', detail: '$ npm test' }),
      ev({ at: NOW - 40_000, agentId: 'A2', name: 'Audit secrets', activity: 'read', detail: 'Read auth.ts' }),
      ev({ at: NOW - 30_000, agentId: 'B', name: 'nova', activity: 'idle', detail: 'waiting for you', needs: 'turn' }),
      ev({ at: NOW - 20_000, agentId: 'A2', name: 'Audit secrets', activity: 'run', detail: '$ git status' }),
      ev({ at: NOW - 12_000, agentId: 'B1', name: 'Plan migration', activity: 'talk', detail: 'asking you…', needs: 'input' }),
      ev({ at: NOW - 2_000, agentId: 'B2', name: 'Draft roadmap', activity: 'done', detail: 'finished' }),
      ev({ at: NOW - 1_000, agentId: 'A1', name: 'Map the API', activity: 'error', detail: 'tool failed' }),
      ev({ at: NOW, agentId: 'A2', name: 'Audit secrets', activity: 'search', detail: 'Grep "password"' }),
    ],
  });
  const s = new Screen(200, 2);
  drawFooter(s, { x: 0, y: 0, w: 200, h: 2 }, c);
  const log = rows(s)[0];
  assert.equal(log.trimEnd(), '  ✖ Map the API failed now   ✔ Draft roadmap finished now   ▲ Plan migration asks you 10s   ◆ nova your turn 30s   ▶ Audit secrets npm test 50s');
  assert.doesNotMatch(log, /Read|Grep|git status/);
});

test('the log row never cuts mid-word or runs to the edge: whole items only', () => {
  const events = Array.from({ length: 10 }, (_, i) => ev({ at: NOW - i * 1000, agentId: `X${i}`, name: `agent number ${i}`, activity: 'done', detail: 'finished' }));
  for (const w of [60, 80, 100, 137]) {
    const s = new Screen(w, 2);
    drawFooter(s, { x: 0, y: 0, w, h: 2 }, ctxOf([lead()], { events }));
    const log = rows(s)[0];
    assert.ok(log.endsWith('  '), `${w}: air at the end`);
    const items = log.trim().split(/ {3}/);
    for (const it of items) assert.match(it, /^✔ agent number \d finished (now|\d+s)$/, `${w}: "${it}"`);
  }
});

test('a tip or a notice leads the log row; with nothing to tell, it says so quietly', () => {
  const c = ctx();
  c.tip = 'the scene needs kitty, Ghostty or WezTerm';
  const s = new Screen(120, 2);
  drawFooter(s, { x: 0, y: 0, w: 120, h: 2 }, c);
  assert.match(rows(s)[0], /^ {2}the scene needs kitty, Ghostty or WezTerm {3}no news yet/);
  const n = ctx();
  n.notice = 'no live claude agents in ~/.claude — press d for demo';
  const t = new Screen(120, 2);
  drawFooter(t, { x: 0, y: 0, w: 120, h: 2 }, n);
  assert.match(rows(t)[0], /^ {2}no live claude agents in ~\/\.claude — press d for demo\s*$/);
  assert.match(rows(t)[1], /enter talk/);
});

test('with no crew bar, the log row pins what needs you, whole items and +N for the rest', () => {
  const c = ctxOf(troubled(), { pinNeeds: true, events: [ev({ agentId: 'B2', name: 'Draft roadmap', activity: 'done', detail: 'finished' })] });
  const wide = new Screen(150, 2);
  drawFooter(wide, { x: 0, y: 0, w: 150, h: 2 }, c);
  assert.equal(rows(wide)[0].trimEnd(), '  needs you   ✖ Map the API failed now   ▲ Plan migration asks you now   ◆ nova your turn 40s   ◆ atlas your turn 20s');
  const narrow = new Screen(80, 2);
  drawFooter(narrow, { x: 0, y: 0, w: 80, h: 2 }, c);
  assert.equal(rows(narrow)[0].trimEnd(), '  needs you   ✖ Map the API failed now   ▲ Plan migration asks you now   +2');
  // All clear: the log again.
  const calm = ctxOf([lead()], { pinNeeds: true, events: c.events });
  const s = new Screen(80, 2);
  drawFooter(s, { x: 0, y: 0, w: 80, h: 2 }, calm);
  assert.match(rows(s)[0], /✔ Draft roadmap finished/);
});

test('the selection stays out of the log row: it means one thing at every width', () => {
  const c = ctxOf([lead(), sub()], { selectedId: 'S', pinNeeds: true });
  const s = new Screen(80, 2);
  drawFooter(s, { x: 0, y: 0, w: 80, h: 2 }, c);
  assert.doesNotMatch(rows(s)[0], /Review auth|Read auth/);
});

test('the hint row follows the moment, least needed first out', () => {
  const hints = (o: Partial<ChromeCtx>, w = 120) => {
    const s = new Screen(w, 2);
    drawFooter(s, { x: 0, y: 0, w, h: 2 }, { ...ctx(), selectedId: null, ...o });
    return rows(s)[1].trimEnd();
  };
  assert.equal(hints({}), '  tab pick an agent   p worlds   r dashboard   space pause   ? keys   q quit');
  assert.equal(hints({ view: 'dashboard' }), '  tab pick an agent   p worlds   r scene   space pause   ? keys   q quit');
  assert.doesNotMatch(hints({ canScene: false }), /\br /);
  assert.equal(hints({ paused: true }), '  space resume   tab pick an agent   p worlds   r dashboard   ? keys   q quit');
  assert.equal(hints({ selectedId: 'S' }), '  enter talk   c cheer   tab next   i hide card   esc back   ? keys');
  assert.match(hints({ selectedId: 'S', card: false }), /i show card/);
  assert.equal(hints({ selectedId: 'S', chat: 'input' }), '  enter send   esc stop typing   ↑↓ scroll   ctrl-c quit');
  assert.equal(hints({ selectedId: 'S', chat: 'log' }), '  enter write   ↑↓ scroll   esc close   q quit');
  assert.equal(hints({ overlay: 'picker' }), '  ↑↓ try a world   enter keep   esc put back   1-9 jump');
  assert.equal(hints({ overlay: 'help' }), '  esc close   q quit');
  // The smallest screen: whole hints, the least needed gone.
  assert.equal(hints({}, 60), '  tab pick an agent   p worlds   r dashboard   ? keys');
});

test('the chrome is all narrow glyphs, and none of it runs to the last column', () => {
  for (const [w, hgt] of [[60, 20], [80, 24], [100, 30], [120, 36], [150, 46]]) {
    const L = computeLayout(w, hgt);
    const s = new Screen(w, hgt);
    const c = ctxOf(troubled(), { pinNeeds: !L.roster, selectedId: 'A2' });
    drawHeader(s, L.header, c);
    if (L.roster) drawRoster(s, L.roster, c);
    drawFooter(s, L.footer, c);
    for (const ch of s.ch) assert.ok(!isWide(ch), `${w}x${hgt}: ${ch}`);
    for (const y of [0, hgt - 2, hgt - 1]) assert.equal(s.charAt(w - 1, y), ' ', `${w}x${hgt} row ${y}`);
  }
});

test('overlays draw inside the screen', () => {
  const s = new Screen(100, 30);
  drawBox(s, { x: 2, y: 2, w: 10, h: 4 }, [1, 1, 1], [2, 2, 2], 'hi');
  assert.equal(s.charAt(2, 2), '╭');
  drawHelp(s, { x: 0, y: 1, w: 100, h: 27 }, mines);
  assert.match(s.toText(), /quit/);
  const p = new Screen(100, 30);
  drawPicker(p, { x: 0, y: 1, w: 100, h: 27 }, THEMES, 0, 0);
  for (const t of THEMES) assert.ok(p.toText().includes(t.name), t.name);
  const tiny = new Screen(40, 10);
  drawTooSmall(tiny, mines);
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

test('help offers r for the scene only where the terminal shows images, and says where it is elsewhere', () => {
  const plain = new Screen(100, 30);
  drawHelp(plain, { x: 0, y: 1, w: 100, h: 27 }, mines, false);
  assert.match(plain.toText(), /the scene needs kitty, Ghostty or WezTerm/);
  assert.doesNotMatch(plain.toText(), /scene \/ agent dashboard/);
  assert.match(plain.toText(), /quit/);
  const kitty = new Screen(100, 30);
  drawHelp(kitty, { x: 0, y: 1, w: 100, h: 27 }, mines, true);
  assert.doesNotMatch(kitty.toText(), /needs/);
  assert.match(kitty.toText(), /scene \/ agent dashboard/);
  assert.doesNotMatch(kitty.toText(), /pixels|sextant|HD/);
});

test('help offers o for office life and n for the locals, beside the lighting', () => {
  const s = new Screen(100, 30);
  drawHelp(s, { x: 0, y: 1, w: 100, h: 27 }, mines, true);
  assert.match(s.toText(), /l \/ o \/ n +lights, office life, locals on\/off/);
});

test('help says when the crews are not being saved, under the keys, from the smallest screen but one up', () => {
  const note = 'crews.json unreadable (EACCES): progress not saved this run';
  for (const [w, h] of [[100, 30], [80, 24]]) {
    const s = new Screen(w, h);
    drawHelp(s, { x: 0, y: 1, w, h: h - 3 }, mines, true, note);
    const text = s.toText();
    assert.match(text, /quit/, `${w}×${h}`);
    assert.match(text, /crews\.json unreadable \(EACCES\):/, `${w}×${h}`);
    assert.match(text, /progress not saved this run/, `${w}×${h}`);
    const rows = text.split('\n');
    assert.ok(rows.findIndex((r) => r.includes('quit')) < rows.findIndex((r) => r.includes('crews.json')), 'under the keys');
  }
  const none = new Screen(100, 30);
  drawHelp(none, { x: 0, y: 1, w: 100, h: 27 }, mines, true);
  assert.doesNotMatch(none.toText(), /crews/);
});

