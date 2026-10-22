import { test } from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import { STATION_KINDS } from '../src/themes/types.ts';
import type { Art, StationDef } from '../src/themes/types.ts';
import { art, byChar, frameAt, drawArt, wallBands } from '../src/themes/art.ts';
import { Screen } from '../src/term/screen.ts';
import { isWide } from '../src/term/width.ts';
import type { Theme } from '../src/themes/types.ts';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ANIMUS_THEME_FILE=src/themes/x.ts lints a theme module that is not
// registered yet (its default export).
const extraFile = process.env.ANIMUS_THEME_FILE;
async function loadTheme(file: string): Promise<Theme> {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const found = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'drawBackdrop' in (v as object));
  if (!found) throw new Error(`${file} exports no theme`);
  return found as Theme;
}
const EXTRA: Theme[] = extraFile ? [await loadTheme(extraFile)] : [];

test('art pads rows and fg grids to a rectangle', () => {
  const a = art(['ab', 'c'], ['xx', 'x']);
  assert.equal(a.w, 2);
  assert.equal(a.h, 2);
  assert.deepEqual(a.rows, ['ab', 'c ']);
  assert.deepEqual(a.fg, ['xx', 'x ']);
  assert.equal(a.bg, null);
});

test('byChar builds a key grid from a char map', () => {
  assert.deepEqual(byChar(['█▒ ', ' x'], { '█': 'a', '▒': 'b' }, 'z'), ['ab ', ' z']);
});

test('drawArt treats unkeyed spaces as transparent', () => {
  const s = new Screen(4, 1);
  s.clear([1, 1, 1]);
  s.put(1, 0, 'Q');
  drawArt(s, art(['A B'], ['a a'], ['  k']), 0, 0, { a: [9, 9, 9], k: [7, 7, 7] });
  assert.equal(s.charAt(0, 0), 'A');
  assert.equal(s.charAt(1, 0), 'Q');
  assert.equal(s.charAt(2, 0), 'B');
  assert.deepEqual(s.bgAt(2, 0), [7, 7, 7]);
});

test('frameAt cycles frames and prefers active frames', () => {
  const f1 = art(['1'], ['a']);
  const f2 = art(['2'], ['a']);
  const act = art(['A'], ['a']);
  const def: StationDef = { kind: 'write', name: 'x', frames: [f1, f2], active: [act], fps: 2, colors: { a: [0, 0, 0] } };
  assert.equal(frameAt(def, 0, false), f1);
  assert.equal(frameAt(def, 0.6, false), f2);
  assert.equal(frameAt(def, 0.6, true), act);
});

test('wallBands splits the scene above each floor', () => {
  const bands = wallBands({ x: 0, y: 1, w: 80, h: 30 }, [14, 29]);
  assert.deepEqual(bands, [
    { x: 0, y: 1, w: 80, h: 13 },
    { x: 0, y: 16, w: 80, h: 13 },
  ]);
});

test('registry exposes unique ids', () => {
  const ids = themeIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('lab'));
  assert.equal(getTheme('lab')?.id, 'lab');
  assert.equal(getTheme('nope'), undefined);
});

function lintArt(themeId: string, def: StationDef, a: Art): void {
  const where = `${themeId}/${def.kind}/${def.name}`;
  assert.ok(a.w <= 11 && a.h <= 6, `${where} too big ${a.w}x${a.h}`);
  assert.equal(a.rows.length, a.h, where);
  assert.equal(a.fg.length, a.h, where);
  if (a.bg) assert.equal(a.bg.length, a.h, where);
  for (let y = 0; y < a.h; y++) {
    const row = [...a.rows[y]];
    const fg = [...a.fg[y]];
    const bg = a.bg ? [...a.bg[y]] : null;
    assert.equal(row.length, a.w, `${where} row ${y} width`);
    assert.equal(fg.length, a.w, `${where} fg ${y} width`);
    if (bg) assert.equal(bg.length, a.w, `${where} bg ${y} width`);
    for (let x = 0; x < a.w; x++) {
      assert.ok(!isWide(row[x]), `${where} wide glyph '${row[x]}'`);
      if (row[x] !== ' ') {
        assert.notEqual(fg[x], ' ', `${where} '${row[x]}' at ${x},${y} has no fg key`);
        assert.ok(def.colors[fg[x]], `${where} unknown fg key '${fg[x]}'`);
      }
      if (bg && bg[x] !== ' ') assert.ok(def.colors[bg[x]], `${where} unknown bg key '${bg[x]}'`);
    }
  }
}

for (const theme of [...THEMES, ...EXTRA.filter((e) => !THEMES.some((t) => t.id === e.id))]) {
  test(`theme ${theme.id}: stations cover every kind with valid art`, () => {
    assert.ok(theme.name && theme.tagline);
    const kinds = theme.stations.map((s) => s.kind).sort();
    assert.deepEqual(kinds, [...STATION_KINDS].sort());
    assert.equal(theme.entrance.kind, 'entrance');
    for (const def of [...theme.stations, theme.entrance]) {
      assert.ok(def.frames.length > 0, `${def.name} has no frames`);
      assert.ok(def.fps > 0);
      for (const a of [...def.frames, ...(def.active ?? [])]) lintArt(theme.id, def, a);
    }
  });

  test(`theme ${theme.id}: palette is complete`, () => {
    for (const [k, v] of Object.entries(theme.palette)) {
      assert.equal(v.length, 3, k);
      for (const n of v) assert.ok(Number.isInteger(n) && n >= 0 && n <= 255, `${k}=${v}`);
    }
  });

  test(`theme ${theme.id}: backdrop and ambient draw at many sizes`, () => {
    const cases: Array<[number, number, number[]]> = [
      [60, 14, [12]],
      [120, 33, [15, 32]],
      [200, 50, [24, 48]],
      [40, 8, [6]],
    ];
    for (const [w, h, floors] of cases) {
      for (const t of [0, 1.7, 13.3, 600.05]) {
        const s = new Screen(w + 4, h + 3);
        const r = { x: 2, y: 1, w, h };
        s.clear([0, 0, 0]);
        theme.drawBackdrop(s, r, t, floors.map((f) => f + 1));
        theme.drawAmbient(s, r, t, floors.map((f) => f + 1));
        for (const ch of s.ch) assert.ok(!isWide(ch), `${theme.id} drew wide '${ch}'`);
        for (const [x, y] of [[0, 0], [1, 5], [w + 3, h + 2], [w + 2, 3], [10, 0], [10, h + 1]]) {
          assert.equal(s.charAt(x, y), ' ', `${theme.id} drew outside its rect at ${x},${y}`);
          assert.deepEqual(s.bgAt(x, y), [0, 0, 0], `${theme.id} painted outside its rect at ${x},${y}`);
        }
      }
    }
  });
}

test('wall clocks in themes follow the scene clock', () => {
  const now = new Date(2026, 0, 1, 3, 7, 0).getTime();
  for (const id of ['lab', 'club']) {
    const theme = getTheme(id)!;
    const s = new Screen(200, 50);
    s.clear([0, 0, 0]);
    theme.drawBackdrop(s, { x: 0, y: 0, w: 200, h: 50 }, 0.6, [24, 48], now);
    assert.match(s.toText(), /03:07/, `${id} clock ignores the scene time`);
  }
});
