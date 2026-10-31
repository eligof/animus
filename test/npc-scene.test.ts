import { test } from 'node:test';
import assert from 'node:assert/strict';
import { npcSprite, spriteStats } from '../src/art/figure.ts';
import { AMBIENT_FPS, CYCLE, Scene, inkOf } from '../src/art/scene.ts';
import { Screen } from '../src/term/screen.ts';
import { getTheme } from '../src/themes/index.ts';
import type { NpcFrame, SceneFrame } from '../src/world/frame.ts';
import { World } from '../src/world/world.ts';
import { trio } from './npc-fakes.ts';

// The locals in the scene: each a sprite drawn once for what it shows (its
// local, act, frame, facing, scale and cut), cut along its counter's top
// edge; a point standing on its station's box, drawn over it; its station
// a loop of kept pictures, placed again, never sent again; a shadow under
// one standing, an emote over its head; its work warmed at the scales a
// key away.

const START = Date.UTC(2026, 9, 22, 21, 30, 0);

// The club with three stand-in locals and the demo crew, `secs` in.
function scene(secs = 8): SceneFrame {
  const w = new World({ theme: trio(getTheme('club')!), live: null, demo: true, account: { name: 'you', plan: '' }, rootLabel: '~', start: START, images: true, view: 'scene' });
  w.resize(150, 46);
  let t = START;
  for (let i = 0; i < secs * 18; i++) w.tick((t = START + (i * 1000) / 18));
  w.draw(new Screen(150, 46), t);
  return w.scene()!;
}

test('a local is a sprite drawn once for what it shows: its local, act, frame, facing, scale and cut', () => {
  const f = scene();
  const n: NpcFrame = { ...f.npcs![0], act: 'work', frame: 0, cut: { h: 5, slope: 0.5 } };
  const ink = inkOf(f.world);
  const m = spriteStats.misses;
  const a = npcSprite(f.world, n, 7, ink);
  assert.equal(npcSprite(f.world, { ...n }, 7, ink), a, 'drawn again');
  assert.equal(spriteStats.misses, m + 1);
  const others: Array<Partial<NpcFrame>> = [{ frame: 1 }, { act: 'wave' }, { facing: { back: false, flip: !n.facing.flip } }, { cut: { h: 4, slope: 0.5 } }, { cut: undefined }];
  for (const o of others) assert.notEqual(npcSprite(f.world, { ...n, ...o }, 7, ink), a, JSON.stringify(o));
  assert.notEqual(npcSprite(f.world, n, 8, ink), a, 'the same at another scale');
});

test("cut at its counter: nothing under the counter's edge shows, and what shows stays where it was", () => {
  const f = scene();
  const ink = inkOf(f.world);
  const n: NpcFrame = { ...f.npcs![0], act: 'work', frame: 2, facing: { back: false, flip: false } };
  delete n.cut;
  const s = 8;
  const h = 5;
  const whole = npcSprite(f.world, n, s, ink);
  const alpha = (sp: typeof whole, x: number, y: number) => (x < 0 || y < 0 || x >= sp.img.width || y >= sp.img.height ? 0 : sp.img.data[(y * sp.img.width + x) * 4 + 3]);
  for (const slope of [0.5, -0.5]) {
    const cut = npcSprite(f.world, { ...n, cut: { h, slope } }, s, ink);
    const line = (sp: typeof whole, x: number) => sp.ay - h * s + slope * (x + 0.5 - sp.ax);
    let above = 0;
    let below = 0;
    for (let y = 0; y < cut.img.height; y++) {
      for (let x = 0; x < cut.img.width; x++) {
        if (!alpha(cut, x, y)) continue;
        assert.ok(y + 0.5 <= line(cut, x) + 1, `painted at ${x}, ${y}, under the counter`);
        assert.equal(alpha(cut, x, y), alpha(whole, x - cut.ax + whole.ax, y - cut.ay + whole.ay), `moved at ${x}, ${y}`);
        above++;
      }
    }
    for (let y = 0; y < whole.img.height; y++) for (let x = 0; x < whole.img.width; x++) if (alpha(whole, x, y) && y + 0.5 > line(whole, x) + 1) below++;
    assert.ok(above > 0 && below > 0, `slope ${slope}: ${above} pixels over the counter, ${below} under it uncut`);
  }
});

test('in the plate a local is drawn over the station it stands on, a point in depth order', () => {
  const f = scene();
  const ids = new Scene().plate(f).layers.map((l) => l.id);
  for (const n of f.npcs!) {
    const me = ids.indexOf(`npc:${n.k}`);
    assert.ok(me >= 0, `npc:${n.k} not in the plate`);
    if (n.on) assert.ok(ids.indexOf(`prop:${n.prop}`) < me, `local ${n.k} under its station`);
  }
});

test('a station its local works goes round a loop of kept pictures: placed, not sent afresh; once round, the same pictures again', () => {
  const f = scene();
  const n = f.npcs!.find((q) => q.works && f.room.props[q.prop].art.animated);
  assert.ok(n, 'no animated station a local works');
  const sc = new Scene();
  const at = (t: number) => sc.plate({ ...f, t }).layers.find((l) => l.id === `prop:${n.prop}`)!;
  assert.equal(at(f.t).volatile, undefined, 'sent afresh every step');
  const round = Array.from({ length: CYCLE }, (_, k) => at(f.t + k / AMBIENT_FPS).pic.key);
  assert.ok(new Set(round).size >= 3, 'it does not move');
  assert.deepEqual(Array.from({ length: CYCLE }, (_, k) => at(f.t + (CYCLE + k) / AMBIENT_FPS).pic.key), round, 'new pictures the second time round');
});

test("a local standing on the floor casts a shadow; an emote shows over a local's head", () => {
  const f = scene();
  const n: NpcFrame = { ...f.npcs![0], shadow: true, emote: { kind: 'note', t: 0.5 } };
  const ids = new Scene().plate({ ...f, npcs: [n] }).layers.map((l) => l.id);
  assert.ok(ids.includes(`shadow:npc:${n.k}`), 'no shadow');
  assert.ok(ids.indexOf(`emote:npc:${n.k}`) > ids.indexOf(`npc:${n.k}`), 'no emote over it');
});

test("warm gets a local's work ready at the scales a key away", () => {
  const f = scene();
  const s = f.next?.find((c) => c.s !== f.camera.s)?.s;
  assert.ok(s, 'no camera a key away at another scale');
  new Scene().warm(f, Infinity);
  const ink = inkOf(f.world);
  const m = spriteStats.misses;
  for (const n of f.npcs!) for (let i = 0; i < f.world.npcs![n.k].work.frames; i++) npcSprite(f.world, { ...n, act: 'work', frame: i }, s, ink);
  assert.equal(spriteStats.misses, m, 'drawn on a key press');
});
