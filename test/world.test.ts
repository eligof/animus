import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { World } from '../src/world/world.ts';
import { appendFileSync, chmodSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { ClaudeSource } from '../src/claude/source.ts';
import { loadConfig, saveConfig, configPath, updateConfig } from '../src/config.ts';
import { DEFAULT, Screen } from '../src/term/screen.ts';
import { parseKeys } from '../src/term/terminal.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { Activity, AgentSource, AgentInfo, Bubble, Gain, SendResult, Vitals } from '../src/agents.ts';
import { crewKey } from '../src/pet/crew.ts';
import { CrewStore, SAVE_AFTER_MS, crewsText } from '../src/pet/store.ts';
import type { Stage } from '../src/world/stage.ts';
import { covers, room, tempDir } from './helpers.ts';
import { CARD_H, CARD_W, placeCard } from '../src/ui/card.ts';
import type { Side } from '../src/ui/card.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { drawHelp } from '../src/ui/overlays.ts';
import { chatStats } from '../src/ui/chat.ts';
import { FIGURE_H, cellAt, figureBox, project } from '../src/world/frame.ts';

const START = 1_700_000_000_000;
const key = (s: string) => parseKeys(s)[0];

// `images`: the terminal shows images (so the scene by default).
function demoWorld(images = false): World {
  const w = new World({ theme: getTheme('mines')!, live: null, demo: true, account: { name: 'Ada', plan: 'max' }, rootLabel: '~/.claude', start: START, images });
  w.resize(120, 36);
  return w;
}

function advance(w: World, seconds: number, from = START): number {
  let now = from;
  for (let i = 0; i < seconds * 18; i++) {
    now += 1000 / 18;
    w.tick(now);
  }
  return now;
}

test('demo world renders at several sizes', () => {
  const w = demoWorld();
  const now = advance(w, 20);
  for (const [c, r] of [[120, 36], [80, 24], [50, 15], [200, 60]]) {
    const s = new Screen(c, r);
    w.draw(s, now);
    const text = s.toText();
    if (c >= 60 && r >= 20) assert.match(text, /ANIMUS/);
    else assert.match(text, /60.20/);
  }
});

test('t / T / digits switch themes', () => {
  const w = demoWorld();
  const ids = themeIds();
  assert.equal(w.handleKey(key('t')), 'theme');
  assert.equal(w.theme.id, ids[1 % ids.length]);
  w.handleKey(key('T'));
  assert.equal(w.theme.id, ids[0]);
  // The digits reach the first ten (0 is the tenth); worlds past them
  // only t / T and the picker.
  const last = Math.min(THEMES.length, 10);
  w.handleKey(key(last === 10 ? '0' : String(last)));
  assert.equal(w.theme.id, ids[last - 1]);
  // A digit past the last preset does nothing.
  const beyond = THEMES.length < 9 ? String(THEMES.length + 1) : THEMES.length < 10 ? '0' : null;
  if (beyond) assert.equal(w.handleKey(key(beyond)), null);
  // T from the first goes round to the last.
  w.handleKey(key('1'));
  w.handleKey(key('T'));
  assert.equal(w.theme.id, ids[ids.length - 1]);
});

test('picker previews live and closes', () => {
  const w = demoWorld();
  w.handleKey(key('p'));
  assert.equal(w.overlay, 'picker');
  w.handleKey(key('\x1b[B'));
  assert.equal(w.theme.id, themeIds()[1 % THEMES.length]);
  w.handleKey(key('\r'));
  assert.equal(w.overlay, 'none');
});

test('help toggles and escape closes', () => {
  const w = demoWorld();
  w.handleKey(key('?'));
  assert.equal(w.overlay, 'help');
  w.handleKey(key('\x1b'));
  assert.equal(w.overlay, 'none');
});

test('tab cycles selection through actors', () => {
  const w = demoWorld();
  advance(w, 20);
  w.handleKey(key('\t'));
  const first = w.selectedId;
  assert.ok(first);
  w.handleKey(key('\t'));
  assert.notEqual(w.selectedId, first);
  w.handleKey(key('\x1b'));
  assert.equal(w.selectedId, null);
});

test('space pauses, q quits, d toggles demo', () => {
  const w = demoWorld();
  w.handleKey(key(' '));
  assert.equal(w.paused, true);
  assert.equal(w.handleKey(key('q')), 'quit');
  assert.equal(w.handleKey(key('\x03')), 'quit');
  w.handleKey(key('d'));
  assert.equal(w.demoOn, false);
});

test('live world with no agents shows a demo hint', () => {
  const empty: AgentSource = { label: 'live', poll: (): AgentInfo[] => [], drainEvents: () => [] };
  const w = new World({ theme: getTheme('mines')!, live: empty, demo: false, account: null, rootLabel: '/x/.claude', start: START });
  const now = advance(w, 2);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /press d for demo/);
});

test('config round-trips and tolerates garbage', () => {
  const dir = tempDir('animus-cfg');
  const p = join(dir, 'nested', 'config.json');
  assert.deepEqual(loadConfig(p), {});
  saveConfig({ theme: 'club' }, p);
  assert.deepEqual(loadConfig(p), { theme: 'club' });
  assert.equal(configPath({ XDG_CONFIG_HOME: '/cfg' }), '/cfg/animus/config.json');
});

test('in the scene view the crew is in the frame, the scene cells blank for the image and the labels over them', () => {
  const w = demoWorld(true);
  assert.equal(w.view, 'scene');
  const now = advance(w, 20);
  const s = new Screen(120, 36);
  w.draw(s, now);
  const f = w.scene();
  assert.ok(f, 'no frame');
  assert.ok(f.figures.some((g) => g.id === 'demo-atlas'), 'the demo lead is not in the frame');
  assert.deepEqual(f.camera.cells, { x: 0, y: 1, w: 92, h: 33 });
  let blank = 0;
  for (let y = 1; y < 34; y++) for (let x = 0; x < 92; x++) if (s.bg[y * 120 + x] === DEFAULT) blank++;
  assert.equal(blank, 92 * 33, 'scene cells not left for the image');
  assert.ok(f.labels.length > 0);
  const text = s.toText();
  for (const l of f.labels) assert.ok(text.includes(l.text.trim()), `label "${l.text}" not on screen`);
});

test('the dashboard view (no images) has no frame and fills the body with agent cards', () => {
  const w = demoWorld();
  assert.equal(w.view, 'dashboard');
  const now = advance(w, 5);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.equal(w.scene(), null);
  const text = s.toText();
  assert.match(text, /lead · /);
  // The cards repeat the roster, so it gives way to them.
  assert.doesNotMatch(text, /CREW/);
});

test('in the dashboard tab selects the first card', () => {
  const w = demoWorld();
  const now = advance(w, 5);
  const s = new Screen(120, 36);
  w.draw(s, now);
  let corner: [number, number] | null = null;
  for (let y = 1; y < 34 && !corner; y++) for (let x = 0; x < 120 && !corner; x++) if (s.charAt(x, y) === '╭') corner = [x, y];
  assert.ok(corner, 'no card');
  const accent = w.theme.palette.accent;
  assert.notDeepEqual(s.fgAt(...corner!), accent);
  w.handleKey(key('\t'));
  w.draw(s, now);
  assert.deepEqual(s.fgAt(...corner!), accent);
});

test('theme switch plays a wipe transition', { skip: THEMES.length < 2 && 'needs two themes' }, () => {
  const w = demoWorld();
  const now = advance(w, 3);
  w.handleKey(key('t'));
  const s = new Screen(120, 36);
  w.draw(s, now + 150);
  assert.ok(s.toText().includes('▓██▓'), 'no wipe band mid-transition');
  const later = advance(w, 2, now);
  w.draw(s, later);
  const band = s.toText().split('\n').slice(1, 34).map((l) => l.slice(0, 92));
  assert.ok(!band.some((l) => l.includes('▓██▓')), 'wipe still visible');
});

test('empty live scene shows a centered hint', () => {
  const empty: AgentSource = { label: 'live', poll: (): AgentInfo[] => [], drainEvents: () => [] };
  const w = new World({ theme: getTheme('mines')!, live: empty, demo: false, account: null, rootLabel: '~/.claude', start: START });
  w.resize(120, 36);
  const now = advance(w, 1);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /waiting for Claude agents/);
});

test('a failing live source never breaks the world', () => {
  let n = 0;
  const flaky: AgentSource = {
    label: 'live',
    poll: (): AgentInfo[] => {
      if (++n > 3) throw new Error('disk on fire');
      return [{ id: 'L', name: 'lead', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: START, lastSeen: START }];
    },
    drainEvents: () => [],
  };
  const w = new World({ theme: getTheme('mines')!, live: flaky, demo: false, account: null, rootLabel: '~', start: START });
  w.resize(120, 36);
  const now = advance(w, 2);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /lead/);
});

test('without a roster the footer shows the selected agent', () => {
  const w = demoWorld();
  w.resize(100, 30);
  const now = advance(w, 20);
  w.handleKey(key('\t'));
  const s = new Screen(100, 30);
  w.draw(s, now);
  const ticker = s.toText().split('\n')[28];
  assert.match(ticker, /^ ▸ /, ticker);
});

test('picker: moving previews without committing, esc cancels, enter commits', { skip: THEMES.length < 3 && 'needs three themes' }, () => {
  const w = demoWorld();
  const ids = themeIds();
  w.handleKey(key('p'));
  assert.equal(w.handleKey(key('\x1b[B')), null, 'preview must not persist');
  assert.equal(w.theme.id, ids[1]);
  w.handleKey(key('\x1b'));
  assert.equal(w.overlay, 'none');
  assert.equal(w.theme.id, ids[0], 'esc restores the theme from before the picker');
  w.handleKey(key('p'));
  w.handleKey(key('\x1b[B'));
  w.handleKey(key('\x1b[B'));
  assert.equal(w.handleKey(key('\r')), 'theme');
  assert.equal(w.theme.id, ids[2]);
});

test('the paused label stays visible on narrow terminals', () => {
  const w = demoWorld();
  w.resize(80, 24);
  const now = advance(w, 2);
  w.handleKey(key(' '));
  const s = new Screen(80, 24);
  w.draw(s, now);
  assert.match(s.toText().split('\n')[0], /❚❚ paused/);
});

test('r switches between the scene and the dashboard where the terminal shows images', () => {
  const w = demoWorld(true);
  assert.equal(w.view, 'scene');
  assert.equal(w.handleKey(key('r')), 'prefs');
  assert.equal(w.view, 'dashboard');
  const now = advance(w, 2);
  w.draw(new Screen(120, 36), now);
  assert.equal(w.scene(), null);
  w.handleKey(key('r'));
  assert.equal(w.view, 'scene');
  w.draw(new Screen(120, 36), now + 50);
  assert.ok(w.scene());
});

test('without images r keeps the dashboard and says where the scene is, for a moment', () => {
  const w = demoWorld();
  const now = advance(w, 2);
  assert.equal(w.handleKey(key('r')), null);
  assert.equal(w.view, 'dashboard');
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /the scene needs kitty, Ghostty or WezTerm/);
  w.draw(s, now + 3000);
  assert.doesNotMatch(s.toText(), /the scene needs/);
});

test('config keeps the view and lighting, and drops the old pixel keys', () => {
  const p = join(tempDir('animus-cfg2'), 'c.json');
  saveConfig({ theme: 'den', view: 'dashboard', lights: false }, p);
  assert.deepEqual(loadConfig(p), { theme: 'den', view: 'dashboard', lights: false });
  writeFileSync(p, JSON.stringify({ theme: 'den', pixels: 'sextant', hdTipSeen: true, view: 'huge' }));
  assert.deepEqual(loadConfig(p), { theme: 'den' });
});

test('l turns the lighting off and on', () => {
  const w = demoWorld(true);
  const now = advance(w, 2);
  w.draw(new Screen(120, 36), now);
  assert.equal(w.lights, true);
  assert.equal(w.scene()!.lit, true);
  assert.equal(w.handleKey(key('l')), 'prefs');
  assert.equal(w.lights, false);
  w.draw(new Screen(120, 36), now);
  assert.equal(w.scene()!.lit, false);
});

test('only preferences the user changed are saved', () => {
  const w = demoWorld(true);
  assert.deepEqual(w.prefs(), {});
  w.handleKey(key('t'));
  assert.deepEqual(w.prefs(), {});
  w.handleKey(key('r'));
  assert.deepEqual(w.prefs(), { view: 'dashboard' });
  w.handleKey(key('l'));
  assert.deepEqual(w.prefs(), { view: 'dashboard', lights: false });
});

test('f gives the whole terminal to the scene and back', () => {
  const w = demoWorld();
  const now = advance(w, 2);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText().split('\n')[0], /ANIMUS/);
  w.handleKey(key('f'));
  w.draw(s, now + 50);
  const text = s.toText();
  assert.doesNotMatch(text.split('\n')[0], /ANIMUS/);
  assert.doesNotMatch(text, /CREW/);
  w.handleKey(key('f'));
  w.draw(s, now + 100);
  assert.match(s.toText().split('\n')[0], /ANIMUS/);
});

test('a passing tip shows in the ticker row, then goes', () => {
  const w = demoWorld();
  const now = advance(w, 2);
  w.flash('psst: try the café', now + 8000);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /psst: try the café/);
  w.draw(s, now + 8000);
  assert.doesNotMatch(s.toText(), /psst/);
});

test('updateConfig sets one key, keeps the rest and leaves garbage alone', () => {
  const dir = tempDir('animus-cfg3');
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify({ theme: 'club', future: [1, 2] }));
  assert.equal(updateConfig({ view: 'scene' }, p), true);
  assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), { theme: 'club', future: [1, 2], view: 'scene' });
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assert.equal(updateConfig({ view: 'scene' }, bad), false);
  assert.equal(readFileSync(bad, 'utf8'), '{ not json');
  writeFileSync(bad, '[1]');
  assert.equal(updateConfig({ view: 'scene' }, bad), false);
  assert.equal(updateConfig({ view: 'scene' }, join(dir, 'bad.json', 'x.json')), false, 'unwritable path: no throw');
});

// A world in the scene view (images on), run until the crew is in.
function sceneWorld(): { w: World; now: number } {
  const w = demoWorld(true);
  const now = advance(w, 20);
  return { w, now };
}

test('selecting an agent in the scene shows its card beside it; i hides and shows it', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  let text = s.toText();
  assert.match(text, /╭─/);
  assert.match(text, /context\s+[━─]/);
  w.handleKey(key('i'));
  w.draw(s, now);
  text = s.toText();
  assert.doesNotMatch(text, /context\s+[━─]/);
  assert.ok(w.selectedId, 'i keeps the selection');
  w.handleKey(key('i'));
  w.draw(s, now);
  assert.match(s.toText(), /context\s+[━─]/);
});

test('no card without a selection, nor in the dashboard view', () => {
  const { w, now } = sceneWorld();
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.doesNotMatch(s.toText(), /context\s+[━─]/);
  const d = demoWorld(false);
  const t = advance(d, 20);
  d.handleKey(key('\t'));
  d.draw(s, t);
  assert.doesNotMatch(s.toText(), /context\s+[━─]/);
});

test('c cheers the selected agent: a heart over it', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const id = w.selectedId!;
  w.handleKey(key('c'));
  let t = now;
  for (let i = 0; i < 4; i++) {
    t += 1000 / 18;
    w.tick(t);
  }
  const s = new Screen(120, 36);
  w.draw(s, t);
  const fig = w.scene()!.figures.find((g) => g.id === id);
  assert.equal(fig?.emote?.kind, 'heart');
});

test('the card floats beside the selected character, not docked', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  const f = w.scene()!;
  const g = f.figures.find((x) => x.id === w.selectedId)!;
  const [px, py] = project(f.camera, g.x, g.y, g.z + FIGURE_H);
  const [col, row] = cellAt(f.camera, px, py);
  const lines = s.toText().split('\n');
  const r = lines.findIndex((l) => l.includes('╭'));
  assert.ok(r >= 0);
  const c = lines[r].indexOf('╭');
  assert.ok(Math.abs(c - col) <= CARD_W + 4, `column ${c} near ${col}`);
  assert.ok(Math.abs(r - row) <= CARD_H, `row ${r} near ${row}`);
});

// Where the pet card is on screen (its top-left cell), or null.
function cardOn(s: Screen): { x: number; y: number } | null {
  const lines = s.toText().split('\n').map((l) => [...l]);
  for (let y = 0; y + CARD_H <= lines.length; y++)
    for (let x = 0; x + CARD_W <= lines[y].length; x++)
      if (lines[y][x] === '╭' && lines[y][x + CARD_W - 1] === '╮' && lines[y + CARD_H - 1][x] === '╰') return { x, y };
  return null;
}

test('the card keeps clear of its character wherever there is room, and spares its head where there is none', () => {
  for (const [cols, rows] of [[80, 24], [92, 30], [120, 36]]) {
    const w = demoWorld(true);
    w.resize(cols, rows);
    let now = advance(w, 20);
    w.handleKey(key('\t'));
    const scene = computeLayout(cols, rows).scene;
    let seen = 0;
    for (let i = 0; i < 60; i++) {
      now = advance(w, 0.5, now);
      if (i % 15 === 14) w.handleKey(key('\t'));
      const s = new Screen(cols, rows);
      w.draw(s, now);
      const f = w.scene()!;
      const g = f.figures.find((x) => x.id === w.selectedId);
      const p = cardOn(s);
      if (!g || !p) continue;
      seen++;
      const b = figureBox(f.camera, g);
      if (room(scene, b)) assert.ok(!covers(p, b), `${cols}x${rows}: card at ${p.x},${p.y} covers ${JSON.stringify(b)}`);
      else assert.ok(!covers(p, { ...b, y1: b.y0 }), `${cols}x${rows}: card at ${p.x},${p.y} covers the head of ${JSON.stringify(b)}`);
    }
    assert.ok(seen > 30, `${cols}x${rows}: the card showed ${seen} times`);
  }
});

test('the card keeps its side while it fits there, until the selection changes', () => {
  const w = demoWorld(true);
  let now = advance(w, 20);
  w.handleKey(key('\t'));
  // Zoomed out the characters are small, so most have room on more than
  // one side as they walk about.
  w.handleKey(key('-'));
  const scene = computeLayout(120, 36).scene;
  let side: Side | null = null;
  let mattered = 0;
  for (let i = 0; i < 160; i++) {
    now = advance(w, 0.25, now);
    if (i % 40 === 39) {
      w.handleKey(key('\t'));
      side = null;
    }
    const s = new Screen(120, 36);
    w.draw(s, now);
    const f = w.scene()!;
    const g = f.figures.find((x) => x.id === w.selectedId);
    const p = cardOn(s);
    if (!g || !p) {
      side = null;
      continue;
    }
    const b = figureBox(f.camera, g);
    const inView = b.x1 >= scene.x && b.x0 < scene.x + scene.w && b.y1 >= scene.y && b.y0 < scene.y + scene.h;
    const want = placeCard(scene, inView ? b : null, side);
    if (inView && placeCard(scene, b).side !== want.side) mattered++;
    assert.deepEqual(p, { x: want.x, y: want.y }, `frame ${i}: the card left its ${side} side`);
    side = want.side;
  }
  assert.ok(mattered > 0, 'the run never tested the remembered side');
});

test('the card counts only live subagents: not the finished, nor those on their way out', () => {
  const vitals: Vitals = { model: 'claude-opus-5-5', window: 200_000, context: 50_000, outTokens: 0, errors: [], streak: 0, turnEndedAt: 0, busySince: START, lastAt: START, midTool: false, title: '', branch: '' };
  const sub = (id: string, activity: Activity): AgentInfo => ({ id, name: id, role: 'sub', parentId: 'L', project: 'p', agentType: 'Explore', activity, detail: 'Read a.ts', since: START, lastSeen: START });
  let gone = false;
  const src: AgentSource = {
    label: 'live',
    poll: (): AgentInfo[] => [
      { id: 'L', name: 'lead', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: START, lastSeen: START, vitals },
      sub('S1', 'write'),
      sub('S2', 'done'),
      ...(gone ? [] : [sub('S3', 'read')]),
    ],
    drainEvents: () => [],
  };
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true });
  w.resize(120, 36);
  let now = advance(w, 5);
  w.handleKey(key('\t'));
  assert.equal(w.selectedId, 'L');
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /· 2 subagents/);
  gone = true;
  now = advance(w, 0.5, now);
  w.draw(s, now);
  assert.ok(w.scene()!.figures.some((g) => g.id === 'S3'), 'S3 is still on its way out');
  assert.match(s.toText(), /· 1 subagent /);
});

test('the card replaces the selected agent\'s own label; i brings it back', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  // The name as the card's title shows it, after its ★N (tags clip long
  // names).
  const name = /╭─ (?:★\d+ )?(\S+) ·/.exec(s.toText())?.[1].slice(0, 5) ?? '';
  assert.notEqual(name, '');
  const mine = () => w.scene()!.labels.filter((l) => l.text.includes(name));
  assert.equal(mine().length, 0);
  assert.ok(w.scene()!.labels.length > 0, 'other labels stay');
  w.handleKey(key('i'));
  w.draw(s, now);
  assert.ok(mine().length > 0);
});

test('the help overlay fits the smallest screen', () => {
  const s = new Screen(60, 20);
  drawHelp(s, computeLayout(60, 20, false).scene, getTheme('mines')!);
  assert.match(s.toText(), /quit/);
});

test('enter grows the card into the chat; esc leaves the input, esc again goes back to the card', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  assert.equal(w.chatFocus, 'input');
  const s = new Screen(120, 36);
  w.draw(s, now);
  let text = s.toText();
  assert.match(text, /\[↑↓\] scroll  \[esc\] leave/); // no ⏎ hint: an empty input has nothing to send
  assert.doesNotMatch(text, /context\s+[━─]/, 'the card gave way to the chat');
  assert.match(text, /[✓✗]|thinking…/, 'the demo conversation shows');
  w.handleKey(key('\x1b'));
  assert.equal(w.chatFocus, 'log');
  w.handleKey(key('\x1b'));
  assert.equal(w.chatFocus, null);
  w.draw(s, now);
  text = s.toText();
  assert.match(text, /context\s+[━─]/, 'back to the card');
  assert.match(text, /\[⏎\]talk/);
  assert.ok(w.selectedId, 'the selection stays');
});

test('while the input has focus every key types: q, t, digits and the rest never reach the app', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const id = w.selectedId;
  const theme = w.theme.id;
  w.handleKey(key('\r'));
  for (const k of parseKeys('qtTr1c\t i?dpf+-z ')) assert.equal(w.handleKey(k), null, k.name);
  assert.deepEqual(
    [w.theme.id, w.overlay, w.view, w.selectedId, w.demoOn, w.paused, w.full, w.card],
    [theme, 'none', 'scene', id, true, false, false, true],
  );
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /› qtTr1c i\?dpf\+-z /);
  assert.equal(w.handleKey(key('\x03')), 'quit', 'ctrl-c still quits');
});

test('in the log the app keys work again; tab moves on and the chat closes', () => {
  const { w } = sceneWorld();
  w.handleKey(key('\t'));
  const first = w.selectedId;
  w.handleKey(key('\r'));
  w.handleKey(key('\x1b'));
  assert.equal(w.handleKey(key('t')), 'theme');
  w.handleKey(key('\t'));
  assert.notEqual(w.selectedId, first);
  assert.equal(w.chatFocus, null, 'the chat was the other agent\'s');
  assert.equal(w.handleKey(key('q')), 'quit');
});

test('the chat opens in the dashboard too, docked', () => {
  const w = demoWorld(false);
  const now = advance(w, 20);
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /\[↑↓\] scroll/);
});

test('the chat stands in for the selected agent\'s label, as the card does', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('i')); // the card off: its label is back
  const s = new Screen(120, 36);
  w.draw(s, now);
  const all = w.scene()!.labels.length;
  w.handleKey(key('\r'));
  w.draw(s, now);
  assert.ok(w.scene()!.labels.length < all);
});

// A live source of one lead that keeps a conversation (none with
// `transcript: false`) and takes messages: each send waits until the test
// settles it.
function talkingSource(o: { reach?: string | null; transcript?: boolean } = {}) {
  const log: Bubble[] = [{ id: 'p1', kind: 'user', text: 'Fix the tokenizer', at: START }];
  const sends: string[] = [];
  const pending: Array<(r: SendResult) => void> = [];
  const src: AgentSource = {
    label: 'live',
    poll: (): AgentInfo[] => [{ id: 'L', name: 'lead', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: START, lastSeen: START }],
    drainEvents: () => [],
    chat: (id) => (id === 'L' && o.transcript !== false ? log : null),
    reach: () => o.reach ?? null,
    send: (_id, text) => {
      sends.push(text);
      return new Promise((res) => pending.push(res));
    },
  };
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true });
  w.resize(120, 36);
  const now = advance(w, 3);
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  const type = (s: string) => {
    for (const k of parseKeys(s)) w.handleKey(k);
  };
  const shows = (t: number) => {
    const s = new Screen(120, 36);
    w.draw(s, t);
    return s.toText();
  };
  // Lets a settled send's callback run.
  const settle = async (r: SendResult) => {
    pending.shift()!(r);
    await new Promise((res) => setImmediate(res));
  };
  return { w, now, log, sends, type, shows, settle };
}

test('enter sends the draft to the agent: sending, then sent, then delivered when its transcript shows it', async () => {
  const t = talkingSource();
  t.type('add a test\r');
  assert.deepEqual(t.sends, ['add a test']);
  assert.match(t.shows(t.now), /you → +add a test +sending…/);
  assert.match(t.shows(t.now), /› +type a message/, 'the input is empty again');
  await t.settle({ ok: true });
  let now = advance(t.w, 0.1, t.now);
  assert.match(t.shows(now), /you → +add a test +sent, waiting/);
  t.log.push({ id: 'm1', kind: 'sent', text: 'add a test', at: now });
  now = advance(t.w, 0.1, now);
  assert.match(t.shows(now), /you → +add a test +✓ delivered/);
});

test('a send that fails says why; one its transcript never shows is not seen after a minute', async () => {
  const t = talkingSource();
  t.type('hello\r');
  await t.settle({ ok: false, reason: 'timed out' });
  let now = advance(t.w, 0.1, t.now);
  assert.match(t.shows(now), /you → +hello +✗ not sent: timed out/);
  t.type('\x15again\r'); // ctrl-u: the failed text is back in the input
  await t.settle({ ok: true });
  t.w.tick(now + 61_000);
  assert.match(t.shows(now + 61_000), /you → +again +not seen/);
});

test('a message reported not sent that its transcript shows after all is delivered', async () => {
  const t = talkingSource();
  t.type('hello\r');
  await t.settle({ ok: false, reason: 'timed out' });
  let now = advance(t.w, 0.1, t.now);
  assert.match(t.shows(now), /you → +hello +✗ not sent: timed out/);
  t.log.push({ id: 'm1', kind: 'sent', text: 'hello', at: now });
  now = advance(t.w, 0.1, now);
  assert.match(t.shows(now), /you → +hello +✓ delivered/);
});

test('an agent that takes no messages: enter copies the draft for the clipboard instead', () => {
  const t = talkingSource({ reach: 'messaging is off in its session' });
  t.type('psst\r');
  assert.deepEqual(t.sends, [], 'nothing sent');
  assert.equal(t.w.takeClipboard(), 'psst');
  assert.equal(t.w.takeClipboard(), null, 'taken once');
  const text = t.shows(t.now);
  assert.match(text, /you → +psst +copied \(if your terminal allows it\)/);
  assert.match(text, /can't send: messaging is off in its session/);
});

test('a lead with no transcript yet can still be sent to', () => {
  const t = talkingSource({ transcript: false });
  assert.match(t.shows(t.now), /nothing said yet/);
  t.type('hello\r');
  assert.deepEqual(t.sends, ['hello']);
});

test('demo agents take no messages either: their text is copied', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  for (const k of parseKeys('hi there\r')) w.handleKey(k);
  assert.equal(w.takeClipboard(), 'hi there');
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /can't send: demo agents take no messages/);
});

test('end to end: typed in the chat, posted to a live session, seen in its transcript, delivered', async () => {
  // A Claude root with one live session whose inbox is a fake: on a frame
  // it records the message in the transcript as Claude Code does.
  const root = tempDir('animus-e2e');
  mkdirSync(join(root, 'sessions'));
  mkdirSync(join(root, 'projects', '-w'), { recursive: true });
  const transcript = join(root, 'projects', '-w', 'S1.jsonl');
  let clock = START;
  const at = () => new Date(clock).toISOString();
  writeFileSync(transcript, JSON.stringify({ type: 'user', uuid: 'u0', timestamp: at(), message: { content: 'Fix the tokenizer' } }) + '\n');
  const sock = join(root, 'in.sock');
  const got: string[] = [];
  const server = createServer((c) => {
    let buf = '';
    c.setEncoding('utf8');
    c.on('data', (d) => (buf += d));
    c.on('end', () => {
      got.push(buf);
      const content: string = JSON.parse(buf).message.content;
      const body = content.match(/\n([\s\S]*)\n<\/cross-session-message>$/)![1];
      const rec = { type: 'user', uuid: 'p1', isMeta: true, timestamp: at(), turnOrigin: 'peer', origin: { kind: 'peer', from: 'unknown', verifiedPeerPid: process.pid, name: 'animus', body }, message: { content: `Another Claude session sent a message:\n${content}` } };
      appendFileSync(transcript, JSON.stringify(rec) + '\n');
    });
  });
  await new Promise<void>((res) => server.listen(sock, res));
  chmodSync(sock, 0o600); // as Claude Code makes it
  writeFileSync(join(root, 'sessions', '777.json'), JSON.stringify({ pid: 777, sessionId: 'S1', cwd: '/w', status: 'busy', updatedAt: START, kind: 'interactive', messagingSocketPath: sock, peerProtocol: 1 }));
  const w = new World({ theme: getTheme('mines')!, live: new ClaudeSource(root, { alive: () => true, intervalMs: 0 }), demo: false, account: null, rootLabel: '~', start: START, images: true });
  w.resize(120, 36);
  const tick = (n: number) => {
    for (let i = 0; i < n; i++) w.tick((clock += 1000 / 18));
  };
  const text = () => {
    const s = new Screen(120, 36);
    w.draw(s, clock);
    return s.toText();
  };
  tick(90);
  w.handleKey(key('\t'));
  assert.equal(w.selectedId, 'S1');
  w.handleKey(key('\r'));
  for (const k of parseKeys('ship it\r')) w.handleKey(k);
  // The send runs on the event loop while the frames go on.
  for (let i = 0; i < 200 && !/✓ delivered/.test(text()); i++) {
    await new Promise((res) => setTimeout(res, 5));
    tick(1);
  }
  server.close();
  assert.match(text(), /you → +ship it +✓ delivered/);
  assert.equal(got.length, 1);
  assert.equal(JSON.parse(got[0]).session_id, 'S1');
});

test('a paste types into the input as one line, never sending; pasted anywhere else it does nothing', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  const theme = w.theme.id;
  for (const k of parseKeys('\x1b[200~tq\x1b[201~')) assert.equal(w.handleKey(k), null, k.name);
  assert.equal(w.theme.id, theme, 'pasted letters are no keys');
  w.handleKey(key('\r'));
  for (const k of parseKeys('\x1b[200~line one\nline two\r\x1b[201~')) w.handleKey(k);
  assert.equal(w.takeClipboard(), null, 'nothing submitted');
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /› line one line two /);
});

test('a reopened chat sizes to its conversation again, not to the tallest it has been', () => {
  const t = talkingSource();
  const height = () => {
    const rows = t.shows(t.now).split('\n');
    return rows.findLastIndex((r) => r.includes('╰')) - rows.findIndex((r) => r.includes('╭')) + 1;
  };
  const short = height();
  for (let i = 0; i < 30; i++) t.log.push({ id: `a${i}`, kind: 'agent', text: `line ${i}`, at: START });
  const tall = height();
  assert.ok(tall > short, 'a long conversation grows the window');
  t.log.length = 1;
  assert.equal(height(), tall, 'while open it never shrinks');
  t.w.handleKey(key('\x1b'));
  t.w.handleKey(key('\x1b'));
  t.w.handleKey(key('\r'));
  assert.equal(height(), short, 'reopened, it fits the conversation again');
});

test('a closed chat lets its layout go: reopened, or after the selection moved on, it is laid out afresh', () => {
  const { w, now } = sceneWorld();
  const draw = () => w.draw(new Screen(120, 36), now);
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  draw();
  const n = chatStats.layouts;
  draw();
  assert.equal(chatStats.layouts, n, 'kept while open');
  w.handleKey(key('\x1b'));
  w.handleKey(key('\x1b'));
  w.handleKey(key('\r'));
  draw();
  assert.ok(chatStats.layouts > n, 'esc closed it: laid out again');
  const m = chatStats.layouts;
  w.handleKey(key('\x1b'));
  w.handleKey(key('\t')); // the selection moves on: the chat closes
  draw();
  w.handleKey(key('\x1b[Z'));
  w.handleKey(key('\r'));
  draw();
  assert.ok(chatStats.layouts > m, 'closed by the selection moving on: laid out again');
});

test('alt and a letter while typing stays in the input: alt-q never quits and the draft stays; in the log the app ignores them', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  for (const k of parseKeys('hi\x1bq\x1bd\x1bf\x1bt')) assert.equal(w.handleKey(k), null, k.name);
  assert.deepEqual([w.chatFocus, w.demoOn, w.full, w.theme.id], ['input', true, false, 'mines']);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /› hi/, 'the draft stays');
  w.handleKey(key('\x1b'));
  for (const k of parseKeys('\x1bq\x1bd\x1bf\x1bt')) assert.equal(w.handleKey(k), null, k.name);
  assert.deepEqual([w.chatFocus, w.demoOn, w.full, w.theme.id], ['log', true, false, 'mines']);
});

test('on the too-small screen keys do not go to the chat it hides: enter sends nothing, q quits; back in view the draft is as it was', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  for (const k of parseKeys('hi')) w.handleKey(k);
  w.resize(50, 15);
  w.draw(new Screen(50, 15), now);
  assert.equal(w.chatFocus, null, 'no keys go to it');
  w.handleKey(key('\r'));
  assert.equal(w.takeClipboard(), null, 'the unseen draft is not submitted');
  assert.equal(w.handleKey(key('q')), 'quit');
  w.resize(120, 36);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.equal(w.chatFocus, 'input');
  assert.equal(w.handleKey(key('q')), null, 'q types again');
  w.draw(s, now);
  assert.match(s.toText(), /› hiq/);
});

test('while the chat input has focus the footer lists its keys, not the app keys it types', () => {
  const { w, now } = sceneWorld();
  const footer = () => {
    const s = new Screen(120, 36);
    w.draw(s, now);
    return s.toText().split('\n').at(-1)!;
  };
  assert.match(footer(), /t +theme.*q +quit/);
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  const f = footer();
  assert.match(f, /⏎ +send +esc +log +ctrl-c +quit/);
  assert.doesNotMatch(f, /theme|pause|\bq +quit/);
  w.handleKey(key('\x1b')); // to the log: the app keys work again
  assert.match(footer(), /t +theme.*q +quit/);
});

test('a send that fails puts its text back in an empty input to try again; a draft begun since stays', async () => {
  const t = talkingSource();
  t.type('hello\r');
  assert.match(t.shows(t.now), /› +type a message/);
  await t.settle({ ok: false, reason: 'timed out' });
  const now = advance(t.w, 0.1, t.now);
  assert.match(t.shows(now), /› hello /, 'back, ready to send again');
  t.type('\r');
  assert.deepEqual(t.sends, ['hello', 'hello']);
  t.type('other');
  await t.settle({ ok: false, reason: 'timed out' });
  assert.match(t.shows(advance(t.w, 0.1, now)), /› other /, 'the new draft is not replaced');
});

test('a decomposed accent and a Thai vowel sign typed in the chat reach the text sent', () => {
  const t = talkingSource();
  t.type('cafe\u0301 \u0e01\u0e34\r');
  assert.deepEqual(t.sends, ['cafe\u0301 \u0e01\u0e34']);
});

test('inside a paste an escape does not edit: no cursor move, no word delete', () => {
  const { w, now } = sceneWorld();
  w.handleKey(key('\t'));
  w.handleKey(key('\r'));
  for (const k of parseKeys('\x1b[200~one two\x1bb three\x1b\x7f four\x1b[201~')) w.handleKey(k);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /› one two three four /);
});

// A live source of one lead in crew '/p' whose gains the test hands out.
function growingSource() {
  const gains: Gain[] = [];
  const src: AgentSource = {
    label: 'live',
    poll: (): AgentInfo[] => [{ id: 'L', name: 'lead', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: START, lastSeen: START, crew: '/p' }],
    drainEvents: () => [],
    drainGains: () => gains.splice(0),
  };
  return { src, gains };
}
const turn = (at: number, key = `t${at}`): Gain => ({ agent: 'L', at, key, crew: '/p', role: 'lead', kind: 'turn' });

test('live gains grow the crew, saved to crews.json once a change is ten seconds old, and the card shows ★N', () => {
  const path = join(tempDir('animus-world-crews'), 'crews.json');
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true, crews: new CrewStore(path) });
  w.resize(120, 36);
  for (let i = 0; i < 10; i++) gains.push(turn(START + 100 + i));
  let now = advance(w, 2);
  assert.equal(existsSync(path), false, 'not yet');
  now = advance(w, 9, now);
  const d = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(d.crews[crewKey('/p')].lead.xp, 100);
  w.handleKey(key('\t'));
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /★2 lead · lead/);
});

test('a level-up bursts over the agent with ★N!; one read from before the start does not', () => {
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true });
  w.resize(120, 36);
  let now = advance(w, 3);
  const marks = (t: number) => {
    const s = new Screen(120, 36);
    w.draw(s, t);
    return s.toText();
  };
  // Ten turns from before animus started: ★2, quietly.
  for (let i = 0; i < 10; i++) gains.push(turn(START - 60_000 + i));
  now = advance(w, 0.5, now);
  assert.doesNotMatch(marks(now), /★2!/);
  // Fifteen more, now: ★3, celebrated.
  for (let i = 0; i < 15; i++) gains.push(turn(now + i));
  let seen = false;
  for (let i = 0; i < 18 && !seen; i++) {
    now = advance(w, 1 / 18, now);
    seen = /★3!/.test(marks(now));
  }
  assert.ok(seen, 'the ★3! mark');
});

// The stage's level-ups, as [id, level], as the world calls them; and the
// order of its updates and level-ups.
function levelUps(w: World): { ups: Array<[string, number]>; calls: string[] } {
  const stage = (w as unknown as { stage: Stage }).stage;
  const ups: Array<[string, number]> = [];
  const calls: string[] = [];
  const levelUp = stage.levelUp.bind(stage);
  const update = stage.update.bind(stage);
  stage.levelUp = (id, level) => {
    ups.push([id, level]);
    calls.push(`levelUp ${level}`);
    levelUp(id, level);
  };
  stage.update = (dt, now) => {
    calls.push('update');
    update(dt, now);
  };
  return { ups, calls };
}

test('the demo crew starts some way along and earns XP as it works: nova reaches ★4', () => {
  const w = demoWorld(true);
  const { ups } = levelUps(w);
  let now = START;
  let up = false;
  for (let i = 0; i < 90 * 6 && !up; i++) {
    now = advance(w, 1 / 6, now);
    const s = new Screen(120, 36);
    w.draw(s, now);
    up = /★4!/.test(s.toText());
  }
  assert.ok(up, 'a ★4! within a minute and a half');
  assert.deepEqual(ups, [['demo-nova', 4]], 'nova levelled up');
  assert.equal(w.scene()!.figures.find((g) => g.id === 'demo-nova')?.wear?.badge, true, 'and wears its badge');
  const atlas = w.scene()!.figures.find((g) => g.id === 'demo-atlas')!;
  assert.deepEqual(atlas.wear, { hat: true, badge: true, outfit: true, aura: true });
});

test('two level-ups of one role in one tick are celebrated once, the higher, after the stage moves on', () => {
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true });
  w.resize(120, 36);
  let now = advance(w, 3);
  const { ups, calls } = levelUps(w);
  // 25 turns at once: ★2 and ★3 in one tick.
  for (let i = 0; i < 25; i++) gains.push(turn(now + i));
  let two = false;
  let three = false;
  for (let i = 0; i < 36; i++) {
    now = advance(w, 1 / 18, now);
    const s = new Screen(120, 36);
    w.draw(s, now);
    two ||= /★2!/.test(s.toText());
    three ||= /★3!/.test(s.toText());
  }
  assert.ok(three && !two, `★2! ${two}, ★3! ${three}`);
  assert.deepEqual(ups, [['L', 3]]);
  // In its tick, after the stage's update: whatever that update set off
  // (an emote a finish brings a moment later) is there to be kept down.
  const at = calls.indexOf('levelUp 3');
  assert.equal(calls[at - 1], 'update');
});

test('an agent that turns up in a crew with XP already wears its level, with no burst', () => {
  const path = join(tempDir('animus-world-crews'), 'crews.json');
  writeFileSync(path, crewsText({ [crewKey('/p')]: { lead: { xp: 300, seen: START - 60_000 } } }));
  let here = false;
  const src: AgentSource = {
    label: 'live',
    poll: (): AgentInfo[] => (here ? [{ id: 'L', name: 'lead', role: 'lead', project: 'p', activity: 'write', detail: 'Edit a.ts', since: START, lastSeen: START, crew: '/p' }] : []),
    drainEvents: () => [],
    drainGains: () => [],
  };
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true, crews: new CrewStore(path) });
  w.resize(120, 36);
  const { ups } = levelUps(w);
  let now = advance(w, 2);
  here = true;
  for (let i = 0; i < 18 * 3; i++) {
    now = advance(w, 1 / 18, now);
    const s = new Screen(120, 36);
    w.draw(s, now);
    assert.doesNotMatch(s.toText(), /★\d+!/);
  }
  assert.deepEqual(ups, []);
  assert.deepEqual(w.scene()!.figures.find((g) => g.id === 'L')?.wear, { hat: true, badge: true, outfit: false, aura: false });
});

test('on the way out the crews are saved at once; a crews file it cannot read is moved aside', () => {
  const dir = tempDir('animus-world-crews');
  const path = join(dir, 'crews.json');
  writeFileSync(path, 'not json');
  const { src, gains } = growingSource();
  const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true, crews: new CrewStore(path) });
  w.resize(120, 36);
  assert.equal(readdirSync(dir).filter((f) => f.startsWith('crews.json.bad-')).length, 1);
  gains.push(turn(START + 10));
  advance(w, 1);
  w.flushCrews();
  assert.equal(JSON.parse(readFileSync(path, 'utf8')).crews[crewKey('/p')].lead.xp, 10);
});

test('a crews file it cannot read: the help says the crews are not being saved; otherwise it says nothing of them', () => {
  const dir = tempDir('animus-world-crews');
  const path = join(dir, 'crews.json');
  const { src, gains } = growingSource();
  const make = (crews?: CrewStore) => {
    const w = new World({ theme: getTheme('mines')!, live: src, demo: false, account: null, rootLabel: '~', start: START, images: true, crews });
    w.resize(120, 36);
    return w;
  };
  const help = (w: World) => {
    const s = new Screen(120, 36);
    w.handleKey(key('?'));
    w.draw(s, START);
    w.handleKey(key('\x1b'));
    return s.toText();
  };
  const w = make(new CrewStore(path, SAVE_AFTER_MS, () => 'EACCES'));
  assert.equal(w.crewsNote(), 'crews.json unreadable (EACCES): progress not saved this run');
  const text = help(w);
  assert.match(text, /crews\.json unreadable \(EACCES\):/);
  assert.match(text, /progress not saved this run/);
  gains.push(turn(START + 10));
  advance(w, 1);
  w.flushCrews();
  assert.ok(!existsSync(path), 'nothing written');
  // One read as it should be, or no store at all: nothing to say.
  for (const ok of [make(new CrewStore(path)), make()]) {
    assert.equal(ok.crewsNote(), null);
    assert.doesNotMatch(help(ok), /crews\.json/);
  }
});
