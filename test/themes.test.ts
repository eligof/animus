import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { THEMES, getTheme, themeIds } from '../src/themes/index.ts';
import { STATION_KINDS } from '../src/themes/types.ts';
import type { Theme } from '../src/themes/types.ts';
import { PixelCanvas, CLEAR } from '../src/iso/canvas.ts';
import { drawRoom, layoutRoom } from '../src/iso/room.ts';
import { drawBox } from '../src/iso/box.ts';
import { noise, pulse, frac, inside, checker } from '../src/themes/art.ts';

// ANIMUS_THEME_FILE=src/themes/x.ts lints a theme module that is not
// registered yet (its default export).
async function loadTheme(file: string): Promise<Theme> {
  const mod = await import(pathToFileURL(resolve(file)).href);
  const found = mod.default ?? Object.values(mod).find((v) => v && typeof v === 'object' && 'stations' in (v as object));
  if (!found) throw new Error(`${file} exports no theme`);
  return found as Theme;
}
const extraFile = process.env.ANIMUS_THEME_FILE;
const EXTRA: Theme[] = extraFile ? [await loadTheme(extraFile)] : [];

const isRGB = (c: unknown) => Array.isArray(c) && c.length === 3 && c.every((n) => Number.isInteger(n) && n >= 0 && n <= 255);

test('art helpers', () => {
  assert.ok(noise(3) >= 0 && noise(3) < 1);
  assert.equal(noise(3), noise(3));
  assert.equal(pulse(0, 2), 0);
  assert.equal(pulse(1, 2), 1);
  assert.equal(frac(-0.25), 0.75);
  assert.equal(inside(1, 1, 0, 0, 2, 2), true);
  assert.equal(inside(2, 1, 0, 0, 2, 2), false);
  assert.deepEqual(checker(0.5, 0.5, 1, [1, 1, 1], [2, 2, 2]), [1, 1, 1]);
  assert.deepEqual(checker(1.5, 0.5, 1, [1, 1, 1], [2, 2, 2]), [2, 2, 2]);
});

test('registry exposes unique ids', () => {
  const ids = themeIds();
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('lab'));
  assert.equal(getTheme('lab')?.id, 'lab');
  assert.equal(getTheme('nope'), undefined);
});

for (const theme of [...THEMES, ...EXTRA.filter((e) => !THEMES.some((t) => t.id === e.id))]) {
  test(`theme ${theme.id}: identity and palette`, () => {
    assert.ok(theme.name && theme.tagline);
    assert.ok(isRGB(theme.backdrop));
    assert.ok(theme.wallH >= 2.4 && theme.wallH <= 4.5, `wallH ${theme.wallH}`);
    for (const [k, v] of Object.entries(theme.palette)) assert.ok(isRGB(v), `palette.${k}`);
  });

  test(`theme ${theme.id}: every station kind has a model inside its footprint`, () => {
    for (const kind of [...STATION_KINDS, 'entrance' as const]) {
      const st = theme.stations[kind];
      assert.ok(st, `missing ${kind}`);
      assert.ok(st.name);
      const { len, dep, h } = st.size;
      assert.ok(len >= 0.5 && len <= 2.5 && dep > 0 && dep <= 1.5 && h > 0 && h <= theme.wallH, `${kind} size ${len}x${dep}x${h}`);
      for (const t of [0, 0.37, 1.9, 7.3, 61.2]) {
        for (const active of [false, true]) {
          const boxes = st.model(t, active);
          assert.ok(boxes.length > 0, `${kind} empty`);
          for (const b of boxes) {
            const where = `${theme.id}/${kind} box ${JSON.stringify({ a: b.a, b: b.b, z: b.z, len: b.len, dep: b.dep, h: b.h })}`;
            assert.ok(b.a >= -1e-9 && b.b >= -1e-9 && b.z >= -1e-9, where);
            assert.ok(b.a + b.len <= len + 1e-9 && b.b + b.dep <= dep + 1e-9 && b.z + b.h <= h + 1e-9, where);
            assert.ok(b.len > 0 && b.dep > 0 && b.h > 0, where);
            assert.ok(isRGB(b.color), where);
            if (b.paint) {
              for (const face of ['top', 'front', 'side'] as const) {
                for (const [u, v] of [[0, 0], [b.len / 2, b.h / 2], [b.len * 0.99, b.h * 0.99]]) {
                  const c = b.paint(face, u, v);
                  assert.ok(c === null || c === undefined || isRGB(c), `${where} paints ${JSON.stringify(c)}`);
                }
              }
            }
          }
        }
      }
    }
  });

  test(`theme ${theme.id}: floor and wall painters return colours`, () => {
    for (const [gx, gy] of [[0, 0], [0.5, 3.2], [9.9, 7.7], [15, 12]]) assert.ok(isRGB(theme.floor(gx, gy, 1.3)), `floor ${gx},${gy}`);
    for (const side of ['left', 'right'] as const) {
      for (let u = 0; u < 14; u += 0.37) {
        for (let v = 0; v < theme.wallH; v += 0.23) {
          assert.ok(isRGB(theme.wall(side, u, v, 2.2, Date.UTC(2026, 0, 1))), `wall ${side} ${u},${v}`);
        }
      }
    }
  });

  test(`theme ${theme.id}: lighting grade and lamps are sane`, () => {
    const L = theme.lighting;
    assert.ok(L, 'no lighting');
    assert.ok(isRGB(L.ambient) && Math.max(...L.ambient) >= 60, `ambient ${L.ambient}`);
    for (const k of ['haze', 'bloom', 'vignette'] as const) assert.ok(L[k] === undefined || (L[k]! >= 0 && L[k]! <= 1), `${k} ${L[k]}`);
    const sane = (l: { color: unknown; radius: number; intensity: number }, where: string) => {
      assert.ok(isRGB(l.color), `${where} colour`);
      assert.ok(l.radius > 0 && l.radius <= 6, `${where} radius ${l.radius}`);
      assert.ok(l.intensity >= 0 && l.intensity <= 2, `${where} intensity ${l.intensity}`);
    };
    let lit = 0;
    for (const kind of [...STATION_KINDS, 'entrance' as const]) {
      const st = theme.stations[kind];
      if (!st.light) continue;
      lit++;
      for (const t of [0, 0.37, 1.9, 7.3, 61.2]) {
        for (const active of [false, true]) {
          const got = st.light(t, active);
          for (const l of got ? (Array.isArray(got) ? got : [got]) : []) {
            sane(l, `${kind} light`);
            assert.ok(l.a >= 0 && l.a <= st.size.len && l.b >= 0 && l.b <= st.size.dep + 2 && l.z >= 0 && l.z <= theme.wallH, `${kind} light at ${l.a},${l.b},${l.z}`);
          }
        }
      }
    }
    assert.ok(lit >= 3, `only ${lit} stations cast light`);
    const room = layoutRoom(200, 120, theme);
    for (const t of [0, 3.3, 61.2]) {
      for (const l of L.lights?.(room, t, Date.UTC(2026, 0, 1, 21)) ?? []) {
        sane(l, 'room light');
        assert.ok(l.gx >= -0.5 && l.gx <= room.W + 0.5 && l.gy >= -0.5 && l.gy <= room.D + 0.5 && l.gz >= 0 && l.gz <= theme.wallH + 1, `room light at ${l.gx},${l.gy},${l.gz}`);
      }
    }
  });

  test(`theme ${theme.id}: the whole room draws at many sizes and times`, () => {
    for (const [w, h] of [[60, 34], [92, 66], [172, 114], [300, 160]]) {
      const room = layoutRoom(w, h, theme);
      for (const t of [0, 1.7, 13.3, 600.05]) {
        const c = new PixelCanvas(w, h);
        c.data.fill(CLEAR);
        drawRoom(c, room, theme, t, Date.UTC(2026, 0, 1, 12));
        for (const p of room.placed) for (const b of p.station.model(t, true)) drawBox(c, room.iso, b, p.at);
        theme.ambient?.(c, room, t);
        assert.equal(c.data.length, w * h);
      }
    }
  });
}

test('wall clocks follow the scene clock', () => {
  for (const id of ['lab', 'cafe', 'den']) {
    const theme = getTheme(id)!;
    const paint = (now: number) => {
      const out: string[] = [];
      for (const side of ['left', 'right'] as const) {
        for (let u = 0; u < 12; u += 0.05) for (let v = 0; v < theme.wallH; v += 0.05) out.push(String(theme.wall(side, u, v, 0, now)));
      }
      return out;
    };
    const a = paint(Date.UTC(2026, 0, 1, 9, 5));
    const b = paint(Date.UTC(2026, 0, 1, 14, 47));
    assert.ok(a.some((c, i) => c !== b[i]), `${id}: the clock ignores the time`);
  }
});
