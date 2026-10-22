import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { World } from '../src/world/world.ts';
import { loadConfig, saveConfig, configPath } from '../src/config.ts';
import { Screen } from '../src/term/screen.ts';
import { parseKeys } from '../src/term/terminal.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { AgentSource, AgentInfo } from '../src/agents.ts';
import { tempDir } from './helpers.ts';

const START = 1_700_000_000_000;
const key = (s: string) => parseKeys(s)[0];

function demoWorld(): World {
  const w = new World({ theme: getTheme('lab')!, live: null, demo: true, account: { name: 'Ada', plan: 'max' }, rootLabel: '~/.claude', start: START });
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
  w.handleKey(key(String(THEMES.length)));
  assert.equal(w.theme.id, ids[THEMES.length - 1]);
  assert.equal(w.handleKey(key('9')), null);
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
  const w = new World({ theme: getTheme('lab')!, live: empty, demo: false, account: null, rootLabel: '/x/.claude', start: START });
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

test('characters are visible in the scene after ticking', () => {
  const w = demoWorld();
  w.resize(120, 36);
  const now = advance(w, 20);
  const s = new Screen(120, 36);
  w.draw(s, now);
  const scene = s.toText().split('\n').slice(1, 34).map((l) => l.slice(0, 92)).join('\n');
  assert.match(scene, /[•°^×\-.o▪■◎][ᴗ_~.ωo▿\-][•°^×\-.o▪■◎]/, 'no character faces drawn in the scene');
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
  const w = new World({ theme: getTheme('lab')!, live: empty, demo: false, account: null, rootLabel: '~/.claude', start: START });
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
  const w = new World({ theme: getTheme('lab')!, live: flaky, demo: false, account: null, rootLabel: '~', start: START });
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

test('picker: moving previews without committing, esc cancels, enter commits', () => {
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
