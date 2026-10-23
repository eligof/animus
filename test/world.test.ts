import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { World } from '../src/world/world.ts';
import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig, saveConfig, configPath, updateConfig } from '../src/config.ts';
import { HD_TIP, hdTipOnce } from '../src/app.ts';
import { Screen } from '../src/term/screen.ts';
import { parseKeys } from '../src/term/terminal.ts';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import type { AgentSource, AgentInfo } from '../src/agents.ts';
import { traitsFor } from '../src/world/character.ts';
import { wizardSprite } from '../src/cave/wizard.ts';
import { tempDir } from './helpers.ts';

const START = 1_700_000_000_000;
const key = (s: string) => parseKeys(s)[0];

function demoWorld(): World {
  const w = new World({ theme: getTheme('mines')!, live: null, demo: true, account: { name: 'Ada', plan: 'max' }, rootLabel: '~/.claude', start: START });
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
  w.handleKey(key(THEMES.length === 10 ? '0' : String(THEMES.length)));
  assert.equal(w.theme.id, ids[THEMES.length - 1]);
  // A digit past the last preset does nothing (0 is the tenth).
  const beyond = THEMES.length < 9 ? String(THEMES.length + 1) : THEMES.length < 10 ? '0' : null;
  if (beyond) assert.equal(w.handleKey(key(beyond)), null);
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

test('characters are visible in the scene after ticking', () => {
  const w = demoWorld();
  w.resize(120, 36);
  const now = advance(w, 20);
  const s = new Screen(120, 36);
  w.draw(s, now);
  // With the lighting off, colours from the demo lead's own sprite must
  // appear among the scene's pixels.
  w.handleKey(key('l'));
  w.draw(s, now);
  const tr = traitsFor('demo-atlas', 'lead');
  const palette = new Set<number>();
  for (const pose of ['idle', 'walk', 'write', 'read', 'think', 'run', 'search', 'web'] as const) {
    for (const back of [false, true]) {
      for (const row of wizardSprite(tr, pose, 1, { back, flip: false }).px) for (const c of row) if (c) palette.add((c[0] << 16) | (c[1] << 8) | c[2]);
    }
  }
  const near = (n: number) => palette.has(n);
  let found = false;
  for (let y = 1; y < 34; y++) for (let x = 0; x < 92; x++) {
    const i = y * 120 + x;
    if (near(s.fg[i]) || near(s.bg[i])) found = true;
  }
  assert.ok(found, 'the lead character is not drawn in the scene');
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

test('r switches between half-block and sextant pixels', () => {
  const w = demoWorld();
  assert.equal(w.pixels, 'half');
  assert.equal(w.handleKey(key('r')), 'prefs');
  assert.equal(w.pixels, 'sextant');
  const now = advance(w, 2);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.ok(s.ch.some((ch) => { const cp = ch.codePointAt(0)!; return cp >= 0x1fb00 && cp <= 0x1fb3b; }));
  w.handleKey(key('r'));
  assert.equal(w.pixels, 'half');
});

test('config keeps the pixel mode and lighting', () => {
  const p = join(tempDir('animus-cfg2'), 'c.json');
  saveConfig({ theme: 'den', pixels: 'sextant', lights: false }, p);
  assert.deepEqual(loadConfig(p), { theme: 'den', pixels: 'sextant', lights: false });
});

test('l turns the lighting off and on', () => {
  const w = demoWorld();
  const now = advance(w, 2);
  const lit = new Screen(120, 36);
  w.draw(lit, now);
  assert.equal(w.lights, true);
  assert.equal(w.handleKey(key('l')), 'prefs');
  assert.equal(w.lights, false);
  const flat = new Screen(120, 36);
  w.draw(flat, now);
  let diff = 0;
  for (let i = 0; i < lit.fg.length; i++) if (lit.fg[i] !== flat.fg[i] || lit.bg[i] !== flat.bg[i]) diff++;
  assert.ok(diff > 500, `only ${diff} cells changed`);
});

test('only preferences the user changed are saved', () => {
  const w = demoWorld();
  assert.deepEqual(w.prefs(), {});
  w.handleKey(key('t'));
  assert.deepEqual(w.prefs(), {});
  w.handleKey(key('r'));
  assert.deepEqual(w.prefs(), { pixels: 'sextant' });
  w.handleKey(key('l'));
  assert.deepEqual(w.prefs(), { pixels: 'sextant', lights: false });
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

test('the HD tip shows once in the ticker row, then goes', () => {
  const w = demoWorld();
  const now = advance(w, 2);
  w.flash(HD_TIP, now + 8000);
  const s = new Screen(120, 36);
  w.draw(s, now);
  assert.match(s.toText(), /HD mode: run animus in kitty, Ghostty or WezTerm/);
  w.draw(s, now + 8000);
  assert.doesNotMatch(s.toText(), /HD mode/);
});

test('the HD tip is offered once ever, only without images', () => {
  const p = join(tempDir('animus-tip'), 'animus', 'config.json');
  assert.equal(hdTipOnce('hd', false, p), '');
  assert.equal(hdTipOnce('sextant', true, p), '');
  assert.equal(loadConfig(p).hdTipSeen, undefined, 'nothing written');
  assert.equal(hdTipOnce('sextant', false, p), HD_TIP);
  assert.equal(loadConfig(p).hdTipSeen, true);
  assert.equal(hdTipOnce('half', false, p), '');
  // Saving the theme later keeps it.
  saveConfig({ ...loadConfig(p), theme: 'den' }, p);
  assert.equal(hdTipOnce('half', false, p), '');
});

test('updateConfig sets one key, keeps the rest and leaves garbage alone', () => {
  const dir = tempDir('animus-cfg3');
  const p = join(dir, 'config.json');
  writeFileSync(p, JSON.stringify({ theme: 'club', future: [1, 2] }));
  assert.equal(updateConfig({ hdTipSeen: true }, p), true);
  assert.deepEqual(JSON.parse(readFileSync(p, 'utf8')), { theme: 'club', future: [1, 2], hdTipSeen: true });
  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{ not json');
  assert.equal(updateConfig({ hdTipSeen: true }, bad), false);
  assert.equal(readFileSync(bad, 'utf8'), '{ not json');
  writeFileSync(bad, '[1]');
  assert.equal(updateConfig({ hdTipSeen: true }, bad), false);
  assert.equal(updateConfig({ hdTipSeen: true }, join(dir, 'bad.json', 'x.json')), false, 'unwritable path: no throw');
});
