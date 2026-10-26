import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANE, Stage, onScreen, stationKindFor } from '../src/world/stage.ts';
import type { Actor } from '../src/world/stage.ts';
import { LIMITS, planLayout, slotRect } from '../src/world/layout.ts';
import { computeLayout } from '../src/ui/layout.ts';
import { THEMES } from '../src/themes/index.ts';
import { footprint, heightAt, toWorld } from '../src/world/room.ts';
import type { Layout, Slot } from '../src/world/types.ts';
import type { SceneFrame } from '../src/world/frame.ts';
import { EMOTE, cellAt, figureBox, figureTop, project } from '../src/world/frame.ts';
import { placeCard } from '../src/ui/card.ts';
import { DEFAULT, Screen } from '../src/term/screen.ts';
import { mines } from '../src/worlds/mines.ts';
import { stubProp } from '../src/worlds/stub.ts';
import type { WorldDef } from '../src/worlds/types.ts';
import type { AgentInfo, Activity, Vitals } from '../src/agents.ts';
import type { Pose } from '../src/world/character.ts';
import { hashString } from '../src/world/rng.ts';
import { emoteSprite, figureSprite } from '../src/art/figure.ts';
import { inkOf } from '../src/art/scene.ts';

const NOW = 1_700_000_000_000;
const RECT = { x: 0, y: 1, w: 120, h: 33 };
const WIDE = { x: 0, y: 1, w: 150, h: 44 };

const agent = (id: string, activity: Activity, extra: Partial<AgentInfo> = {}): AgentInfo => ({
  id, name: id, role: 'sub', project: 'p', activity, detail: `${activity} detail`, since: NOW, lastSeen: NOW, ...extra,
});

function run(stage: Stage, agents: AgentInfo[], seconds: number, start = NOW): number {
  let now = start;
  for (let i = 0; i < seconds * 20; i++) {
    now += 50;
    stage.sync(agents, now);
    stage.update(0.05, now);
  }
  return now;
}

function newStage(r = RECT, world: WorldDef = mines): Stage {
  const stage = new Stage(world);
  stage.layout(r);
  return stage;
}

const slot = (stage: Stage, kind: string) => stage.stations().find((s) => s.kind === kind)!;
const layoutOf = (stage: Stage) => stage.room()!.L;
const footprintOf = (p: Slot) => footprint(p);

// The frame's labels drawn over a blank scene, as text.
function text(stage: Stage, now: number, sel: string | null = null): { s: Screen; f: SceneFrame } {
  const s = new Screen(RECT.w + 30, RECT.h + 2);
  const f = stage.frame(now, sel)!;
  stage.drawLabels(s, f);
  return { s, f };
}

test('stationKindFor groups activities', () => {
  assert.equal(stationKindFor('write'), 'write');
  assert.equal(stationKindFor('talk'), 'think');
  assert.equal(stationKindFor('delegate'), 'think');
  assert.equal(stationKindFor('idle'), 'idle');
  assert.equal(stationKindFor('done'), null);
  assert.equal(stationKindFor('error'), null);
});

test('a writer walks from the entrance to the desk and works', () => {
  const stage = newStage();
  const a = agent('w1', 'write');
  stage.sync([a], NOW);
  const actor = stage.actors()[0];
  const door = slot(stage, 'entrance');
  assert.equal(actor.state, 'enter');
  assert.ok(Math.hypot(actor.x - door.spot.x, actor.y - door.spot.y) < 1e-9, 'spawns at the entrance');
  run(stage, [a], 12);
  const desk = slot(stage, 'write');
  assert.equal(actor.state, 'work');
  assert.equal(actor.station, desk);
  assert.ok(Math.hypot(actor.x - desk.spot.x, actor.y - desk.spot.y) < 1e-6);
});

test('readers go to the left wall', () => {
  const stage = newStage();
  run(stage, [agent('r', 'read')], 12);
  const actor = stage.actors()[0];
  assert.equal(actor.station?.kind, 'read');
  assert.equal(actor.station?.wall, 'left');
});

test('agents at the props out on the floor stand on open floor, in view, backs to us, facing the prop', () => {
  for (const w of THEMES) {
    for (const r of [RECT, WIDE]) {
      const stage = newStage(r, w);
      const crew = [agent('r', 'run'), agent('w', 'web'), agent('t', 'think'), agent('z', 'idle', { since: NOW - 3_600_000 })];
      run(stage, crew, 25);
      const room = stage.room()!;
      for (const a of stage.actors()) {
        const tag = `${w.id} ${r.w}x${r.h}: ${a.info.id}`;
        const st = a.station;
        assert.ok(st?.island, `${tag} not at a prop out on the floor`);
        assert.equal(a.state, 'work', tag);
        for (const p of room.props) {
          const f = footprint(p);
          assert.ok(!(a.x > f.x0 && a.x < f.x1 && a.y > f.y0 && a.y < f.y1), `${tag} inside ${p.slot?.kind ?? 'decor'}`);
        }
        // Nothing tall just in front hides them.
        for (let k = 1; k <= 12; k++) assert.ok(heightAt(room, a.x + k, a.y + k) <= k + 5, `${tag}: hidden behind something ${heightAt(room, a.x + k, a.y + k)} tall`);
        if (a.info.id === 'z') continue;
        // The prop is up-screen of them, and they look its way.
        const f = footprintOf(st);
        const cx = (f.x0 + f.x1) / 2;
        const cy = (f.y0 + f.y1) / 2;
        const look = stage.lookOf(a);
        assert.ok(cx + cy < a.x + a.y, `${tag}: the prop is not behind them`);
        assert.ok(look.facing.back, `${tag}: facing us`);
        assert.equal(look.facing.flip, cx - cy < a.x - a.y, `${tag}: facing away from the prop`);
      }
    }
  }
});

test('agents sharing a prop stand apart', () => {
  const stage = newStage();
  run(stage, [agent('a', 'write'), agent('b', 'write'), agent('c', 'write')], 14);
  const xs = stage.actors().map((a) => [a.x, a.y]);
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) assert.ok(Math.hypot(xs[i][0] - xs[j][0], xs[i][1] - xs[j][1]) >= 4, 'crowded');
});

test('a crowd at a prop lines up a figure apart on screen, close by and turned to it', () => {
  for (const kind of ['write', 'read', 'think', 'run'] as const) {
    const stage = newStage(WIDE);
    const crew = ['a', 'b', 'c'].map((id) => agent(`${kind}-${id}`, kind));
    run(stage, crew, 20);
    const st = slot(stage, kind);
    const f = footprintOf(st);
    const crowd = stage.actors();
    let working = 0;
    for (const a of crowd) {
      const tag = `${kind}: ${a.info.id} at ${a.x.toFixed(0)},${a.y.toFixed(0)}`;
      assert.equal(a.station, st, tag);
      assert.equal(a.state, 'work', tag);
      // Never more than 2.5 lane steps from the prop's own spot.
      assert.ok(Math.hypot(a.x - st.spot.x, a.y - st.spot.y) <= 2.5 * LANE * Math.SQRT2, `${tag}: far from its prop`);
      // At work (not mid-gesture), backs to us and turned the prop's way.
      const look = stage.lookOf(a);
      if (look.pose !== kind) continue;
      working++;
      assert.ok(look.facing.back, `${tag}: facing us`);
      assert.equal(look.facing.flip, (f.x0 + f.x1 - f.y0 - f.y1) / 2 < a.x - a.y, `${tag}: turned away from the prop`);
    }
    assert.ok(working >= 2, `${kind}: ${working} at work`);
    for (let i = 0; i < crowd.length; i++) {
      for (let j = i + 1; j < crowd.length; j++) {
        const d = onScreen(crowd[i], crowd[j]);
        assert.ok(d >= LANE - 1e-9, `${kind}: ${crowd[i].info.id} and ${crowd[j].info.id} ${d.toFixed(1)} units apart on screen`);
      }
    }
  }
});

test('a crowd too big for its lanes never doubles up on one spot', () => {
  // Small rooms clamp lanes to the floor; seven or nine at one prop.
  for (const [r, n] of [[{ x: 0, y: 1, w: 80, h: 21 }, 7], [WIDE, 9]] as const) {
    const stage = newStage(r);
    const crew = Array.from({ length: n }, (_, i) => agent(`d${i}`, i % 2 ? 'write' : 'read'));
    run(stage, crew, 25);
    for (const kind of ['write', 'read']) {
      const there = stage.actors().filter((a) => a.station?.kind === kind);
      assert.ok(there.every((a) => a.state === 'work'), `${r.w}x${r.h} ${kind}: still walking`);
      for (let i = 0; i < there.length; i++) {
        for (let j = i + 1; j < there.length; j++) {
          const d = onScreen(there[i], there[j]);
          assert.ok(d >= LANE / 2, `${r.w}x${r.h} ${kind}: ${there[i].info.id} and ${there[j].info.id} only ${d.toFixed(1)} units apart`);
        }
      }
    }
  }
});

test('walkers detouring through the hub keep to their own side of it', async () => {
  const { hub } = await import('../src/world/layout.ts');
  const { hashString } = await import('../src/world/rng.ts');
  const stage = newStage(WIDE);
  // Two walkers whose ids hash to either side.
  const ids = ['w0', 'w1', 'w2', 'w3', 'w4', 'w5'];
  const left = ids.find((id) => hashString(id) & 1)!;
  const right = ids.find((id) => !(hashString(id) & 1))!;
  run(stage, [agent(left, 'idle'), agent(right, 'idle')], 1);
  const priv = stage as unknown as { walkTo(a: unknown, to: { x: number; y: number }): void; L: Layout };
  const h = hub(priv.L);
  const { W, T } = priv.L;
  // Trips between points round the edge of the floor, every which way.
  const rim: Array<{ x: number; y: number }> = [];
  for (let f = 0.1; f < 0.95; f += 0.1) {
    const a = T + 2 + f * (W - T - 4);
    rim.push({ x: a, y: T + 2 }, { x: T + 2, y: a }, { x: a, y: W - 3 }, { x: W - 3, y: a });
  }
  let offset = 0;
  let pairs = 0;
  for (const from of rim) {
    for (const to of rim) {
      const sides: number[] = [];
      for (const a of stage.actors()) {
        Object.assign(a, from);
        priv.walkTo(a, to);
        const via = a.path[0];
        if (a.path.length !== 2 || Math.hypot(via.x - h.x, via.y - h.y) > 3.5) continue;
        // On the hub itself only where its side of it is blocked; otherwise
        // three units across the way, the side signed by the id. (A route
        // found round the props may turn near the hub too: not across.)
        const off = Math.hypot(via.x - h.x, via.y - h.y);
        if (off < 1e-9) continue;
        if (Math.abs((via.x - h.x) * (to.x - from.x) + (via.y - h.y) * (to.y - from.y)) > 1e-6) continue;
        offset++;
        assert.ok(Math.abs(off - 3) < 1e-6, `${a.info.id}: ${off.toFixed(2)} off the hub`);
        sides.push(Math.sign((to.x - from.x) * (via.y - h.y) - (to.y - from.y) * (via.x - h.x)));
      }
      if (sides.length < 2) continue;
      pairs++;
      assert.notEqual(sides[0], sides[1], `${from.x},${from.y} → ${to.x},${to.y}: both on one side`);
    }
  }
  assert.ok(offset >= 10 && pairs >= 4, `${offset} detours beside the hub, ${pairs} side by side`);
});

test('a big room is crossed at a jog, and the strides keep up', () => {
  const stage = newStage({ x: 0, y: 1, w: 260, h: 80 });
  run(stage, [agent('j', 'write')], 0.05);
  const priv = stage as unknown as { L: Layout; move(a: unknown, dt: number): void };
  assert.equal(priv.L.W, LIMITS.maxSide);
  const a = stage.actors()[0];
  Object.assign(a, { x: priv.L.T + 10, y: priv.L.T + 10, path: [{ x: priv.L.W - 20, y: priv.L.D - 20 }], gait: 0 });
  priv.move(a, 0.1);
  const went = Math.hypot(a.x - priv.L.T - 10, a.y - priv.L.T - 10);
  // A walk is 22 units a second: a long trip goes at a jog, 1.5 times
  // that, and faster again in a room wider than JOG_ROOM (128 units).
  const pace = 1.5 * (priv.L.W / 128);
  assert.ok(went > 0.1 * 22 * pace * 0.97, `${went.toFixed(2)} units in 0.1 s`);
  assert.ok(a.gait > 0, 'the strides did not quicken');
});

test('activity change shows a bubble and retargets', () => {
  const stage = newStage();
  let now = run(stage, [agent('a', 'write')], 10);
  const actor = stage.actors()[0];
  stage.sync([agent('a', 'run', { detail: '$ npm test' })], now + 50);
  assert.ok(actor.bubbleUntil > now + 50);
  now = run(stage, [agent('a', 'run', { detail: '$ npm test' })], 12, now + 50);
  assert.equal(actor.station?.kind, 'run');
  assert.equal(actor.state, 'work');
});

test('agents that vanish walk out through the entrance and are purged', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'idle'), agent('b', 'write')], 10);
  run(stage, [agent('b', 'write')], 16, now);
  assert.deepEqual(stage.actors().map((x) => x.info.id), ['b']);
});

test('leads come first, followed by their subagents', () => {
  const stage = newStage();
  stage.sync([
    agent('s1', 'read', { parentId: 'L2' }),
    agent('L1', 'write', { role: 'lead' }),
    agent('L2', 'write', { role: 'lead' }),
    agent('s2', 'read', { parentId: 'L1' }),
  ], NOW);
  assert.deepEqual(stage.actors().map((a) => a.info.id), ['L1', 's2', 'L2', 's1']);
});

test('late subagent metadata updates the character', () => {
  const stage = newStage();
  stage.sync([agent('m', 'read')], NOW);
  stage.sync([agent('m', 'read', { agentType: 'ecc:code-reviewer' })], NOW + 750);
  assert.equal(stage.actors()[0].traits.accessory, 'glasses');
});

test('actors synced before the first layout land on the floor', () => {
  const stage = new Stage(mines);
  stage.sync([agent('early', 'write')], NOW);
  stage.update(0.05, NOW + 50);
  stage.layout(RECT);
  const L = layoutOf(stage);
  const a = stage.actors()[0];
  assert.ok(a.x > L.T && a.y > L.T && a.x < L.W && a.y < L.D, `${a.x},${a.y}`);
});

test('resizing keeps every actor on the floor', () => {
  const stage = newStage({ x: 0, y: 1, w: 200, h: 57 });
  const now = run(stage, [agent('far', 'idle'), agent('near', 'read')], 10);
  stage.layout({ x: 0, y: 1, w: 80, h: 21 });
  run(stage, [agent('far', 'idle'), agent('near', 'read')], 0.1, now);
  const L = layoutOf(stage);
  for (const a of stage.actors()) assert.ok(a.x > L.T && a.y > L.T && a.x < L.W && a.y < L.D, `${a.info.id} at ${a.x},${a.y}`);
});

test('crowds never stand or walk inside props', () => {
  for (const [w, h] of [[80, 21], [120, 33]]) {
    const stage = newStage({ x: 0, y: 1, w, h });
    const crowd = Array.from({ length: 7 }, (_, i) => agent(`c${i}`, i % 2 ? 'write' : 'read'));
    let now = NOW;
    for (let i = 0; i < 300; i++) {
      now += 50;
      stage.sync(crowd, now);
      stage.update(0.05, now);
      for (const a of stage.actors()) {
        for (const p of stage.room()!.props) {
          if (p.slot?.kind === 'entrance') continue;
          const f = footprint(p);
          const inside = a.x > f.x0 + 0.5 && a.x < f.x1 - 0.5 && a.y > f.y0 + 0.5 && a.y < f.y1 - 0.5;
          assert.ok(!inside, `${w}x${h}: ${a.info.id} inside ${p.slot?.kind ?? 'decor'} at ${a.x.toFixed(1)},${a.y.toFixed(1)}`);
        }
      }
    }
  }
});

test('frames come with 0, 1 and 12 agents at several sizes, and the world can be swapped', () => {
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'delegate', 'think', 'talk', 'done', 'idle', 'error'];
  for (const [w, h] of [[60, 17], [120, 33], [200, 57]]) {
    for (const n of [0, 1, 12]) {
      const stage = newStage({ x: 0, y: 1, w, h });
      const agents = Array.from({ length: n }, (_, i) => agent(`a${i}`, acts[i % acts.length]));
      const now = run(stage, agents, 2);
      const f = stage.frame(now, agents[0]?.id ?? null)!;
      assert.equal(f.world, mines);
      assert.equal(f.figures.length, n);
      assert.equal(f.active.length, f.room.props.length);
      assert.deepEqual([f.camera.w, f.camera.h], [w * 10, h * 20]);
      for (let i = 1; i < f.figures.length; i++) assert.ok(f.figures[i].x + f.figures[i].y >= f.figures[i - 1].x + f.figures[i - 1].y, 'not far to near');
      if (n) assert.equal(f.figures.find((g) => g.id === 'a0')!.selected, true);
      const s = new Screen(w, h + 2);
      stage.drawLabels(s, f);
      const club = THEMES.find((t) => t.id === 'club')!;
      stage.setTheme(club);
      const g = stage.frame(now + 100, null)!;
      assert.equal(g.world, club);
      assert.equal(g.room.props[0].art, club.stations[g.room.props[0].slot!.kind]);
    }
  }
});

test('every figure stands on the floor where the camera says, inside the canvas at fit', () => {
  const stage = newStage(WIDE);
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think', 'idle'];
  const crew = acts.map((a, i) => agent(`f${i}`, a));
  const now = run(stage, crew, 20);
  const f = stage.frame(now)!;
  assert.equal(f.figures.length, crew.length);
  for (const g of f.figures) {
    assert.equal(g.z, 0);
    const [px, py] = project(f.camera, g.x, g.y, g.z);
    const [, top] = project(f.camera, g.x, g.y, 14);
    assert.ok(px > 0 && px < f.camera.w && top > 0 && py < f.camera.h, `${g.id} at ${px.toFixed(0)},${py.toFixed(0)}`);
    assert.equal(g.costume, mines.costume);
    assert.ok(g.poseT >= 0 && g.phase >= 0 && g.phase < 1);
  }
  const L = f.room.L;
  // The whole room shows, at about 4 canvas pixels a unit, centred.
  const corners = [[0, 0, L.H], [L.W, 0, 0], [0, L.D, 0], [L.W, L.D, 0], [L.W, 0, L.H], [0, L.D, L.H]].map(([x, y, z]) => project(f.camera, x, y, z));
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  assert.ok(Math.min(...xs) >= 0 && Math.max(...xs) <= f.camera.w && Math.min(...ys) >= 0 && Math.max(...ys) <= f.camera.h, 'the room is cut off');
  assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - f.camera.w / 2) <= 2, 'not centred across');
  assert.ok(f.camera.s >= 3 && f.camera.s <= 5.5, `${f.camera.s.toFixed(2)} px a unit`);
});

test('the cell size sets the canvas; the room stays as it is, refitted', () => {
  const stage = newStage(WIDE);
  const a = stage.frame(NOW)!;
  stage.setCell(8, 16);
  const b = stage.frame(NOW)!;
  assert.deepEqual([b.camera.w, b.camera.h, b.camera.cell.w, b.camera.cell.h], [WIDE.w * 8, WIDE.h * 16, 8, 16]);
  assert.deepEqual(b.room.L, a.room.L, 'smaller cells, another room');
  assert.ok(b.camera.s < a.camera.s, 'smaller cells, the room not refitted');
  assert.deepEqual(stage.cellSize, { w: 8, h: 16 });
});

test('the room is planned from the terminal\'s cells, not its pixels: a HiDPI screen shows the same room, sharper', () => {
  const scene = computeLayout(150, 46).scene;
  const staged = (cell: { w: number; h: number }, r = scene) => {
    const stage = new Stage(mines);
    stage.setCell(cell.w, cell.h);
    stage.layout(r);
    return stage;
  };
  const lo = staged({ w: 10, h: 20 });
  const hi = staged({ w: 19, h: 42 });
  // A 10 x 20 cell at 4 canvas pixels a unit.
  const want = planLayout((scene.w * 10) / 4, (scene.h * 20) / 4, 'mines');
  assert.deepEqual([layoutOf(lo).W, layoutOf(lo).D, layoutOf(lo).H], [want.W, want.D, want.H]);
  assert.deepEqual(layoutOf(hi), layoutOf(lo), 'a 2x screen gets another room');
  // The fit maps the room to the real pixels: about twice as many a unit.
  const s = (st: Stage) => st.frame(NOW)!.camera.s;
  assert.ok(s(hi) > 1.8 * s(lo), `${s(hi).toFixed(2)} vs ${s(lo).toFixed(2)} px a unit`);
  // A huge terminal's room stays lively.
  for (const cell of [{ w: 10, h: 20 }, { w: 19, h: 42 }]) {
    const big = layoutOf(staged(cell, computeLayout(300, 90).scene));
    assert.ok(big.W <= 160 && big.D <= 160, `${big.W} x ${big.D} units for 300 x 90 cells of ${cell.w} x ${cell.h}`);
    assert.equal(big.W, LIMITS.maxSide);
  }
});

test('zoom steps in and out, never past fitting the room, and the selection gets a close-up', () => {
  const stage = newStage(WIDE);
  const now = run(stage, [agent('a', 'write'), agent('b', 'read')], 12);
  const settle = (sel: string | null = null) => {
    let f: SceneFrame | null = null;
    for (let i = 0; i < 40; i++) f = stage.frame(now, sel);
    return f!;
  };
  assert.equal(settle().camera.s, settle().camera.s);
  const fit = settle().camera.s;
  assert.equal(stage.zoomLevel, 1);
  stage.zoomBy(-1);
  assert.equal(settle().camera.s, fit, 'zoomed out past the fit');
  stage.zoomBy(1);
  assert.ok(Math.abs(settle().camera.s - 1.5 * fit) < 1e-6);
  stage.zoomBy(1);
  stage.zoomBy(1);
  settle();
  assert.equal(stage.zoomLevel, 3);
  stage.zoomAuto();
  assert.equal(settle().camera.s, fit);
  // A selected agent: a close-up following it, the agent in view.
  const f = settle('b');
  assert.equal(stage.zoomLevel, 2);
  const b = f.figures.find((g) => g.id === 'b')!;
  const [px, py] = project(f.camera, b.x, b.y, 7);
  assert.ok(Math.abs(px - f.camera.w / 2) < f.camera.w / 4 && Math.abs(py - f.camera.h / 2) < f.camera.h / 4, `${b.id} off centre at ${px.toFixed(0)},${py.toFixed(0)}`);
  assert.ok(stage.labels().length > 0, 'the selected agent has no label');
});

test('the cameras one keypress away are where the keys take the camera', () => {
  const stage = newStage(WIDE);
  const now = run(stage, [agent('a', 'write'), agent('b', 'read'), agent('c', 'run')], 12);
  const ids = stage.actors().map((a) => a.info.id);
  const settle = (sel: string | null) => {
    let f: SceneFrame | null = null;
    for (let i = 0; i < 60; i++) f = stage.frame(now, sel);
    return f!;
  };
  const same = (got: SceneFrame, want: { s: number; ox: number; oy: number } | undefined, why: string) => {
    assert.ok(want, `no camera for ${why}`);
    assert.ok(Math.abs(got.camera.s - want.s) < 1e-9 && Math.abs(got.camera.ox - want.ox) < 0.5 && Math.abs(got.camera.oy - want.oy) < 0.5, `${why}: ${JSON.stringify(got.camera)} vs ${JSON.stringify(want)}`);
  };
  // Nothing selected: Tab picks the first agent, in a close-up.
  let f = settle(null);
  const tab = f.next![0];
  same(settle(ids[0]), tab, 'tab');
  // From there: Tab again, + and -, shift-Tab, Esc.
  f = settle(ids[0]);
  const [next, zin, zout, prev, back] = f.next!;
  same(settle(ids[1]), next, 'the next agent');
  same(settle(ids[2]), prev, 'the previous agent');
  stage.zoomBy(1);
  same(settle(ids[0]), zin, 'zoom in');
  stage.zoomBy(-1);
  stage.zoomBy(-1);
  same(settle(ids[0]), zout, 'zoom out');
  stage.zoomAuto();
  same(settle(null), back, 'back to the room');
  // None of them is where the camera already is.
  const here = settle(null).camera;
  for (const c of settle(null).next!) assert.ok(c.s !== here.s || Math.abs(c.ox - here.ox) >= 0.5 || Math.abs(c.oy - here.oy) >= 0.5);
});

test('name tags and bubbles never overlap', () => {
  const stage = newStage();
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const crowd = Array.from({ length: 12 }, (_, i) => agent(`l${i}`, acts[i % acts.length]));
  const now = run(stage, crowd, 8);
  stage.frame(now, 'l3');
  const labels = stage.labels();
  assert.ok(labels.length > 3);
  for (let i = 0; i < labels.length; i++) {
    for (let j = i + 1; j < labels.length; j++) {
      const a = labels[i];
      const b = labels[j];
      assert.ok(a.y !== b.y || a.x + a.w <= b.x || b.x + b.w <= a.x, `labels overlap: ${JSON.stringify(a)} ${JSON.stringify(b)}`);
    }
  }
});

test('labels are terminal text over the scene; their cells keep the background for the pill', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'write', { detail: 'Edit app.ts' })], 6);
  const s = new Screen(120, 35);
  s.punch({ x: 0, y: 1, w: 120, h: 33 });
  const f = stage.frame(now, 'a')!;
  stage.drawLabels(s, f);
  const [l] = f.labels;
  assert.equal(f.labels.length, 1);
  assert.equal(l.kind, 'bubble');
  assert.match(s.toText(), /a · Edit app\.ts/);
  for (let k = 0; k < l.w; k++) assert.equal(s.bg[l.row * 120 + l.col + k], DEFAULT, 'a label set a background');
  // The pill: the agent's own colour for the selection.
  assert.deepEqual(l.color, stage.actors()[0].traits.color);
});

test('labels are cleared when there is nothing to draw', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'write')], 6);
  stage.frame(now, 'a');
  assert.ok(stage.labels().length > 0);
  stage.layout({ x: 0, y: 1, w: 0, h: 0 });
  assert.equal(stage.frame(now, 'a'), null);
  assert.deepEqual(stage.labels(), []);
});

const particlesOf = (stage: Stage) => (stage as unknown as { particles: Array<{ kind: string; x: number; y: number; z: number; color: readonly number[]; landed?: boolean }> }).particles;

test('an error goes bang beside the agent, once per error, and keeps smoking a while', () => {
  const stage = newStage();
  const now = run(stage, [agent('e', 'think')], 10);
  const a = stage.actors()[0];
  const err = agent('e', 'error', { since: now, detail: 'npm test failed' });
  stage.sync([err], now + 50);
  stage.update(0.05, now + 50);
  assert.ok(a.error, 'no error on show');
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - a.error!.x, p.y - a.error!.y) < 12;
  const bang = particlesOf(stage).filter((p) => near(p));
  assert.ok(bang.filter((p) => p.kind === 'spark').length >= 10 && bang.filter((p) => p.kind === 'smoke').length >= 8, 'no bang');
  assert.ok(Math.hypot(a.error.x - a.x, a.error.y - a.y) < 10, 'the bang is far off');
  const once = a.error;
  run(stage, [err], 2, now + 50);
  assert.equal(a.error, once, 'went bang again for the same error');
  assert.ok(particlesOf(stage).some((p) => p.kind === 'smoke'), 'the smoke stopped');
  assert.ok(stage.frame(now + 2100)!.figures[0].hurt);
});

test('props at work are marked active in the frame, the entrance while someone comes through', () => {
  const stage = newStage();
  stage.sync([agent('s', 'search')], NOW);
  const door = stage.room()!.props.findIndex((p) => p.slot?.kind === 'entrance');
  stage.update(0.05, NOW + 50);
  assert.equal(stage.frame(NOW + 50)!.active[door], true, 'the entrance is not busy');
  const now = run(stage, [agent('s', 'search'), agent('r', 'run')], 20);
  const f = stage.frame(now)!;
  f.room.props.forEach((p, i) => assert.equal(f.active[i], p.slot?.kind === 'search' || p.slot?.kind === 'run', p.slot?.kind ?? 'decor'));
});

test('finishing showers the world\'s confetti, which lies on the floor a moment and is gone', () => {
  for (const w of [mines, THEMES.find((t) => t.id === 'cafe')!]) {
    const stage = newStage(RECT, w);
    let now = run(stage, [agent('d', 'write')], 10);
    const done = [agent('d', 'done', { since: now })];
    stage.sync(done, now + 50);
    stage.update(0.05, now + 50);
    const bits = particlesOf(stage).filter((p) => p.kind === 'confetti');
    assert.ok(bits.length > 5, 'no shower');
    assert.ok(bits.every((p) => w.finale.colors.some((c) => c.join() === p.color.join())), `${w.id}: confetti not in the world's colours`);
    let landed = false;
    for (let i = 0; i < 80; i++) {
      now = run(stage, done, 0.05, now + 50);
      if (particlesOf(stage).some((p) => p.kind === 'confetti' && p.landed && p.z === 0)) landed = true;
    }
    assert.ok(landed, 'nothing landed');
    run(stage, done, 4, now);
    assert.equal(particlesOf(stage).filter((p) => p.kind === 'confetti').length, 0, 'confetti left lying');
  }
});

test('props give off their bits in their own frame, which the room turns into its own', () => {
  const steam = { ...stubProp(15, 11, 5, [100, 100, 100]) };
  steam.emit = (v, _dt, spawn) => {
    if (v.active) spawn({ kind: 'steam', x: 1, y: 2, z: 3, vx: 1, vy: 0, vz: 0.5, life: 1, color: [200, 200, 200], glow: false, gravity: 0 });
  };
  const w: WorldDef = { ...mines, stations: { ...mines.stations, idle: steam } };
  const stage = newStage(RECT, w);
  const idle = stage.room()!.props.find((p) => p.slot?.kind === 'idle')!;
  // Someone asleep at the idle prop makes it active.
  const now = run(stage, [agent('z', 'idle', { since: NOW - 3_600_000 })], 20);
  const bits = particlesOf(stage).filter((p) => p.kind === 'steam') as unknown as Array<{ x: number; y: number; z: number; vx: number; vy: number }>;
  assert.ok(bits.length > 0, 'no steam');
  const [x, y, z] = toWorld(idle, 1, 2, 3);
  const fresh = bits[bits.length - 1];
  assert.ok(Math.abs(fresh.x - x) < 0.2 && Math.abs(fresh.y - y) < 0.2 && fresh.z >= z, `steam at ${fresh.x},${fresh.y} not ${x},${y}`);
  // u runs along the wall: +x on the right wall, +y on the left.
  assert.deepEqual(idle.wall === 'right' ? [fresh.vx > 0, fresh.vy] : [fresh.vy > 0, fresh.vx], [true, 0]);
  void now;
});

test('lighting can be switched off', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'run')], 6);
  assert.equal(stage.frame(now)!.lit, true);
  stage.lit = false;
  assert.equal(stage.frame(now)!.lit, false);
});

test('the world stays bounded over a long busy session', () => {
  const stage = newStage();
  const acts: Activity[] = ['write', 'search', 'run', 'web', 'think', 'error', 'done'];
  let now = NOW;
  for (let round = 0; round < 12; round++) {
    const crowd = Array.from({ length: 6 }, (_, i) => agent(`b${i}`, acts[(i + round) % acts.length], { since: now }));
    now = run(stage, crowd, 5, now);
  }
  assert.ok(particlesOf(stage).length <= 1500);
  assert.ok((stage as unknown as { glyphs: unknown[] }).glyphs.length < 200);
  assert.ok(stage.builds().length <= 2);
});

test('a big frame with a busy crew stays within budget', () => {
  const stage = newStage({ x: 0, y: 1, w: 200, h: 57 });
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  const agents = Array.from({ length: 12 }, (_, i) => agent(`p${i}`, acts[i % acts.length]));
  let now = run(stage, agents, 5);
  stage.frame(now);
  const t0 = performance.now();
  for (let i = 0; i < 40; i++) {
    now += 55;
    stage.sync(agents, now);
    stage.update(0.055, now);
    stage.frame(now);
  }
  const ms = (performance.now() - t0) / 40;
  // The model's share of a frame: a few ms, leaving the scene its 25.
  assert.ok(ms < 10, `${ms.toFixed(2)} ms per frame`);
});

test('a zero-size layout pauses the frames but keeps the stage alive', () => {
  const stage = newStage();
  const now = run(stage, [agent('a', 'write')], 4);
  stage.layout({ x: 0, y: 1, w: 0, h: 0 });
  // Errors and naps while hidden neither crash nor pile up letters.
  run(stage, [agent('a', 'error', { since: now }), agent('b', 'idle', { since: now - 60_000 })], 6, now);
  assert.ok((stage as unknown as { glyphs: unknown[] }).glyphs.length < 20);
  stage.layout(RECT);
  const later = run(stage, [agent('a', 'write')], 1, now + 6000);
  const f = stage.frame(later);
  assert.ok(f && f.figures.length > 0, 'nothing to show after coming back');
});

test('an error stays on show after the next tool call starts, ahead of other bubbles', () => {
  const stage = newStage();
  const crowd = ['p', 'q', 'r', 's'].map((id) => agent(id, 'write'));
  let now = run(stage, [...crowd, agent('e', 'think')], 8);
  now = run(stage, [...crowd, agent('e', 'error', { since: now, detail: 'npm test failed' })], 0.5, now);
  // The next call starts at once, and everyone else just changed too.
  const next = agent('e', 'write', { since: now, detail: 'Edit app.ts' });
  const busy = crowd.map((a) => ({ ...a, detail: 'Edit other.ts', since: now }));
  now = run(stage, [...busy, next], 1, now);
  const { s, f } = text(stage, now);
  assert.match(s.toText(), /npm test failed/);
  assert.ok(f.labels.some((l) => l.kind === 'error'), 'not an error bubble');
  now = run(stage, [...busy, next], 5, now);
  assert.doesNotMatch(text(stage, now).s.toText(), /npm test failed/);
});

// Stands the actors still round the middle of the room, the i-th
// `cells[i]` (columns, rows) of terminal cells from it on screen: a crowd,
// wherever the lanes would put them.
function gather(stage: Stage, cells: ReadonlyArray<readonly [number, number]>, now: number): void {
  const crowd = stage.actors();
  const cam = stage.frame(now)!.camera;
  const L = layoutOf(stage);
  const x = L.W / 2;
  const y = L.D / 2;
  crowd.forEach((a, i) => {
    const [c, r] = cells[i % cells.length];
    const across = (c * cam.cell.w) / cam.s; // screen x is (x - y) * s
    const down = (r * cam.cell.h) / cam.s; // screen y is (x + y) * s / 2
    a.x = x + across / 2 + down;
    a.y = y - across / 2 + down;
    a.path = [];
  });
}

test('a loud label moves rows at once: an error bubble shows in every frame from the bang on', () => {
  for (const sel of ['p', null]) {
    const stage = newStage();
    const crowd = ['p', 'q', 'r', 's', 't'].map((id) => agent(id, 'write'));
    let now = run(stage, [...crowd, agent('e', 'write')], 8);
    // p (the selection, its bubble placed first) and e a dozen columns
    // apart on one row, the rest off to the side; e's short name fits
    // beside p's bubble.
    const cells = [[0, 0], [-26, 2], [-24, 0], [-22, 2], [-20, 0], [12, 0]] as const;
    const frame = (agents: AgentInfo[]) => {
      now = run(stage, agents, 0.05, now);
      gather(stage, cells, now);
      return text(stage, now, sel).s;
    };
    for (let i = 0; i < 20; i++) frame([...crowd, agent('e', 'write')]);
    // Then e fails, and its bubble, far wider than its name, runs into p's.
    const failed = agent('e', 'error', { since: now, detail: 'npm test failed' });
    let frames = 0;
    let missed = 0;
    for (let i = 0; i < 100; i++) {
      const s = frame([...crowd, failed]);
      if (!stage.actors().find((a) => a.info.id === 'e')!.error) continue;
      frames++;
      if (!s.ch.join('').includes('npm test failed')) missed++;
    }
    assert.ok(frames > 60, `${frames} frames after the bang`);
    assert.equal(missed, 0, `selection ${sel}: the error bubble was missing from ${missed} of ${frames} frames`);
  }
});

// Names and bubbles (not glyph marks) whose middles are within 8 columns
// and 4 rows of each other, at most, round any one of them.
function tallestStack(ls: ReadonlyArray<{ x: number; y: number; w: number }>): number {
  let most = 0;
  for (const l of ls) most = Math.max(most, ls.filter((m) => Math.abs(m.x + m.w / 2 - (l.x + l.w / 2)) < 8 && Math.abs(m.y - l.y) <= 4).length);
  return most;
}

test('no more than three names or bubbles stack in a 16-column band', () => {
  const acts: Activity[] = ['write', 'read', 'search', 'run', 'web', 'think'];
  // Ten heads within a dozen columns and three rows.
  const cells = Array.from({ length: 10 }, (_, i) => [((i * 5) % 13) - 6, (i % 3) * 1.5] as const);
  for (const r of [RECT, WIDE]) {
    const stage = newStage(r);
    let crowd = Array.from({ length: 10 }, (_, i) => agent(`l${i}`, acts[i % acts.length]));
    let now = run(stage, crowd, 6);
    stage.frame(now);
    let most = 0;
    for (let k = 0; k < 30; k++) {
      // Everyone just changed, so all are loud and none shrinks for the
      // crowd alone.
      crowd = crowd.map((a) => ({ ...a, detail: `step ${k}` }));
      now = run(stage, crowd, 0.1, now);
      gather(stage, cells, now);
      stage.frame(now, k < 20 ? null : 'l4');
      most = Math.max(most, tallestStack(stage.labels().filter((l) => l.w > 1)));
    }
    assert.ok(most >= 2, `labels never met (${most})`);
    assert.ok(most <= 3, `${r.w}x${r.h}: ${most} labels stacked in one band`);
  }
});

test('in a crowd, quiet labels shrink to their activity glyph and keep to the two rows over the head', async () => {
  const { activityGlyph } = await import('../src/ui/chrome.ts');
  const stage = newStage();
  // A huddle, long past their last change.
  const crowd = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => agent(id, 'read', { since: NOW - 60_000 }));
  const now = run(stage, crowd, 12);
  stage.frame(now);
  gather(stage, [[0, 0], [-3, 0], [3, 0], [-2, 1], [2, 1], [0, -1]], now);
  const { s, f } = text(stage, now + 50);
  const marks = stage.labels().filter((l) => l.w === 1);
  const names = stage.labels().filter((l) => l.w > 1);
  assert.ok(marks.length >= 2, `${marks.length} glyph marks, ${names.length} names`);
  assert.ok(names.length < crowd.length - 1, `${names.length} of ${crowd.length} still show their names`);
  assert.equal(f.labels.filter((l) => l.kind === 'glyph').length, marks.length);
  for (const m of marks) assert.equal(s.ch[m.y * s.width + m.x], activityGlyph('read'), `mark at ${m.x},${m.y}`);
  const rows = (stage as unknown as { rows: Map<string, { off: number }> }).rows;
  for (const [id, memo] of rows) assert.ok(memo.off <= 2, `${id}'s quiet label on row ${memo.off}`);
});

test('names that clip alike are told apart', async () => {
  const { tagNames } = await import('../src/world/stage.ts');
  type A = Parameters<typeof tagNames>[0][number];
  const crew = ['Check injections', 'atlas', 'Check injections', 'Explore codebase', 'Explore tests', 'Map the API'].map((name, order) => ({ info: { id: `x${order}`, name }, order }) as unknown as A);
  const short = tagNames(crew, 8);
  const shown = crew.map((a) => short.get(a));
  // Same name twice: numbered in the order they came.
  assert.deepEqual(shown.slice(0, 3), ['Check…', 'atlas', 'Check…2']);
  // Different names cut alike: first word and the second's initial.
  assert.deepEqual(shown.slice(3), ['Explo c…', 'Explo t…', 'Map the…']);
  assert.equal(new Set(shown).size, shown.length);
  // At bubble length too.
  assert.deepEqual(crew.map((a) => tagNames(crew, 10).get(a)), ['Check inj…', 'atlas', 'Check inj…2', 'Explore c…', 'Explore t…', 'Map the…']);
});

const MIN = 60_000;
// Vitals for an agent that feels a certain way at NOW (see pet/meters.ts).
const vitals = (o: Partial<Vitals> = {}): Vitals => ({
  model: 'claude-opus-5-5', window: 200_000, context: 0, outTokens: 0, errors: [], streak: 0, turnEndedAt: 0, busySince: NOW, lastAt: NOW, midTool: true, title: '', branch: '', ...o,
});

test("a level-up showers the world's confetti and pops ★N! over the agent, who cheers", () => {
  for (const w of [mines, THEMES.find((t) => t.id === 'cafe')!]) {
    const stage = newStage(RECT, w);
    const crew = [agent('a', 'idle', { crew: '/p', level: 3 })];
    let now = run(stage, crew, 3);
    // A heart over it from a cheer just before: it goes.
    stage.cheer('a');
    stage.levelUp('a', 3);
    now = run(stage, crew, 0.1, now);
    const bits = particlesOf(stage).filter((p) => p.kind === 'confetti');
    assert.ok(bits.length > 5 && bits.every((p) => w.finale.colors.some((c) => c.join() === p.color.join())), `${w.id}: confetti in the world's colours`);
    const { s, f } = text(stage, now);
    const mark = f.labels.find((l) => l.text === '★3!');
    assert.ok(mark, 'the mark');
    assert.deepEqual(mark.ink, w.palette.warn);
    assert.ok(s.toText().split('\n')[mark.row].includes('★3!'), 'drawn as text');
    // No emote pops up over it, so nothing hides the mark.
    assert.equal(f.figures.find((g) => g.id === 'a')!.emote, undefined);
    const a = stage.actors()[0];
    assert.equal(stage.lookOf(a, now).pose, 'cheer');
    // It rises and is gone in a few seconds.
    now = run(stage, crew, 3.5, now);
    assert.ok(!stage.frame(now)!.labels.some((l) => l.text === '★3!'));
  }
  // Nobody by that id: nothing happens.
  newStage().levelUp('nobody', 2);
});

test("a level-up's ★N! rises on a dark pill of its own, over any label it passes, in the word's ink, inside the scene", () => {
  for (const w of [mines, THEMES.find((t) => t.id === 'cafe')!]) {
    const stage = newStage(RECT, w);
    const crew = [agent('a', 'idle', { crew: '/p', level: 3 }), agent('b', 'read'), agent('c', 'write')];
    let now = run(stage, crew, 4);
    stage.levelUp('a', 3);
    let rising = 0;
    let through = 0;
    const rows = new Set<number>();
    for (let i = 0; i < 50; i++) {
      now = run(stage, crew, 0.05, now);
      const { s, f } = text(stage, now);
      const k = f.labels.findIndex((l) => l.text === '★3!');
      if (k < 0) continue;
      rising++;
      const word = f.labels[k];
      rows.add(word.row);
      // A pill in the world's panel colour, near opaque, just under the word.
      assert.deepEqual(word.color, w.palette.panel, `${w.id}: the pill's colour`);
      assert.ok(word.alpha >= 0.85, `${w.id}: alpha ${word.alpha}`);
      assert.equal(word.w, 3);
      assert.ok(word.bold);
      assert.deepEqual(word.ink, w.palette.warn);
      const r = f.camera.cells;
      assert.ok(word.col >= r.x && word.col + word.w <= r.x + r.w && word.row >= r.y && word.row < r.y + r.h, `${w.id}: outside the scene`);
      // Over every label that shares its cells: those come before it (so
      // the scene lays its pill over theirs, and its text goes on last).
      const overlaps = (l: (typeof f.labels)[number]) => l.row === word.row && l.col < word.col + word.w && word.col < l.col + l.w;
      assert.ok(f.labels.slice(k + 1).every((l) => !overlaps(l)), `${w.id}: a label over the word`);
      if (f.labels.slice(0, k).some(overlaps)) through++;
      // Its cells hold the word, in its ink.
      [...'★3!'].forEach((ch, j) => {
        assert.equal(s.ch[word.row * s.width + word.col + j], ch, `${w.id}: cell ${j}`);
        assert.deepEqual(s.fgAt(word.col + j, word.row), w.palette.warn, `${w.id}: ink of cell ${j}`);
      });
      // It is not drawn again as a bare mark.
      assert.ok(!f.marks.some((m) => m.ch.includes('★')));
    }
    assert.ok(rising > 30, `${w.id}: ${rising} frames of the word`);
    assert.ok(rows.size > 1, `${w.id}: it never rose`);
    assert.ok(through > 0, `${w.id}: it never passed through a label`);
  }
});

test("a level-up's word by the scene's edge stays inside it, pill and all", () => {
  const stage = newStage();
  const crew = [agent('a', 'idle', { crew: '/p', level: 3 })];
  const now = run(stage, crew, 3);
  for (let i = 0; i < 40; i++) stage.frame(now); // the camera settled
  for (const [edge, level] of [['left', 12], ['right', 13]] as const) {
    stage.levelUp('a', level);
    const g = (stage as unknown as { glyphs: Array<{ x: number; y: number }> }).glyphs.at(-1)!;
    // Moved along the screen (its row kept) to the scene's first or last column.
    const cam = stage.frame(now)!.camera;
    const px = edge === 'left' ? cam.cell.w / 2 : cam.w - cam.cell.w / 2;
    const u = (px - cam.ox) / cam.s;
    const sum = g.x + g.y;
    [g.x, g.y] = [(sum + u) / 2, (sum - u) / 2];
    const f = stage.frame(now)!;
    const word = f.labels.find((l) => l.text === `★${level}!`);
    assert.ok(word, `${edge}: the word`);
    assert.ok(word.col >= RECT.x && word.col + word.w <= RECT.x + RECT.w, `${edge}: cols ${word.col}..${word.col + word.w}`);
    assert.equal(word.col, edge === 'left' ? RECT.x : RECT.x + RECT.w - word.w, `${edge}: against the edge`);
  }
});

test('figures show how their meters say they feel, and what their level lets them wear', () => {
  const stage = newStage();
  const tired = agent('tired', 'write', { vitals: vitals({ busySince: NOW - 44 * MIN }) });
  const hurt = agent('hurt', 'read', { vitals: vitals({ errors: [NOW, NOW, NOW] }) });
  const glad = agent('glad', 'idle', { vitals: vitals({ streak: 12, midTool: false }), level: 10, crew: '/p' });
  const plain = agent('plain', 'search', { level: 1, crew: '/p' });
  let now = run(stage, [tired, hurt, glad, plain], 4);
  const fig = (id: string) => stage.frame(now)!.figures.find((g) => g.id === id)!;
  assert.deepEqual(fig('tired').feel, { drowsy: true, bandaged: false, bouncy: false });
  assert.deepEqual(fig('hurt').feel, { drowsy: false, bandaged: true, bouncy: false });
  assert.equal(fig('glad').feel?.bouncy, true);
  assert.deepEqual(fig('glad').wear, { hat: true, badge: true, outfit: true, aura: true });
  assert.equal(fig('plain').feel, undefined, 'no vitals, no feelings shown');
  assert.equal(fig('plain').wear, undefined, 'nothing to wear at ★1');
  // The happy one bounces from frame to frame; the others stand on the floor.
  const hops = new Set<number>();
  for (let i = 0; i < 20; i++) {
    now = run(stage, [tired, hurt, glad, plain], 0.05, now);
    const g = fig('glad');
    if (g.pose === 'idle' || g.pose === 'walk') hops.add(Math.round((g.hop ?? 0) * 10));
    assert.equal(fig('tired').hop, undefined);
  }
  assert.ok(hops.size >= 3 && Math.max(...hops) <= 9, `hops ${[...hops]}`);
});

test('at ★5 a crew role gets a desk upgrade by the station it worked at most; below, none', () => {
  const stage = newStage(WIDE);
  const writer = agent('w', 'write', { crew: '/p', role: 'lead', level: 5 });
  const junior = agent('j', 'write', { crew: '/p', agentType: 'Explore', level: 4 });
  let now = run(stage, [writer, junior], 30);
  let f = stage.frame(now)!;
  assert.equal(f.trinkets!.length, 1);
  const tk = f.trinkets![0];
  assert.equal(tk.id, '/p\nlead');
  assert.ok(['plant', 'mug', 'trophy'].includes(tk.kind));
  const desk = slot(stage, 'write');
  const r = footprintOf(desk);
  const away = Math.max(r.x0 - tk.x, tk.x - r.x1, r.y0 - tk.y, tk.y - r.y1);
  assert.ok(away > 0 && away < 12, `beside the desk (${away.toFixed(1)} units off it)`);
  // Reading for longer than it wrote: the shelves are its favourite now.
  now = run(stage, [{ ...writer, activity: 'read', since: now }, junior], 70, now);
  f = stage.frame(now)!;
  const shelves = footprintOf(slot(stage, 'read'));
  const t2 = f.trinkets![0];
  assert.ok(Math.max(shelves.x0 - t2.x, t2.x - shelves.x1, shelves.y0 - t2.y, t2.y - shelves.y1) < 12, 'moved to the shelves');
  // Gone with its agent.
  now = run(stage, [junior], 20, now);
  assert.deepEqual(stage.frame(now)!.trinkets, []);
});

test('two upgrades at one station stand apart; a mug steams', () => {
  const stage = newStage(WIDE);
  // Roles whose upgrade is a mug, and another.
  const roles = Array.from({ length: 40 }, (_, i) => `type-${i}`);
  const mugRole = roles.find((t) => hashString(`/p\n${t}`) % 3 === 1)!;
  const other = roles.find((t) => hashString(`/p\n${t}`) % 3 !== 1)!;
  const crew = [agent('m', 'write', { crew: '/p', agentType: mugRole, level: 6 }), agent('o', 'write', { crew: '/p', agentType: other, level: 6 })];
  let now = run(stage, crew, 30);
  const [a, b] = stage.frame(now)!.trinkets!;
  assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= 3, 'apart');
  const mug = [a, b].find((t) => t.kind === 'mug')!;
  let steam = 0;
  for (let i = 0; i < 40; i++) {
    now = run(stage, crew, 0.05, now);
    steam = Math.max(steam, particlesOf(stage).filter((p) => p.kind === 'steam' && Math.hypot(p.x - mug.x, p.y - mug.y) < 3).length);
  }
  assert.ok(steam > 0, 'steam off the mug');
});

test("a name or an emote shows over its figure's hat, never on it", () => {
  for (const id of ['club', 'station']) {
    const w = THEMES.find((t) => t.id === id)!;
    const stage = newStage(RECT, w);
    // Hats on at ★2; some at work, some about the room, one happy (it hops).
    const acts: Activity[] = ['write', 'read', 'search', 'idle', 'web', 'idle'];
    const crew = ['ada', 'bo', 'cy', 'di', 'ed', 'flo'].map((n, i) =>
      agent(n, acts[i], { crew: '/p', level: 2, agentType: `t${i}`, since: NOW - 60_000, ...(i === 5 ? { vitals: vitals({ streak: 12, midTool: false }) } : {}) }),
    );
    let now = run(stage, crew, 8);
    const ink = inkOf(w);
    let names = 0;
    let emotes = 0;
    for (let k = 0; k < 60; k++) {
      now = run(stage, crew, 0.2, now);
      if (k % 10 === 0) stage.cheer(crew[k % crew.length].id);
      const f = stage.frame(now)!;
      const cam = f.camera;
      const P = (x: number, y: number, z: number) => [Math.round(cam.ox) + (x - y) * cam.s, Math.round(cam.oy) + ((x + y) * cam.s) / 2 - z * cam.s];
      for (const g of f.figures) {
        // A hop for joy (or a cheer's) lifts it higher for a moment.
        if (!g.wear?.hat || g.pose === 'done' || g.pose === 'cheer') continue;
        // Its topmost drawn pixel, as the scene places the sprite.
        const sp = figureSprite(g, cam.s, ink);
        let y0 = 0;
        while (y0 < sp.img.height && !sp.img.data.subarray(y0 * sp.img.width * 4, (y0 + 1) * sp.img.width * 4).some((v, j) => j % 4 === 3 && v > 0)) y0++;
        const top = Math.round(P(g.x, g.y, g.z + (g.hop ?? 0))[1]) - sp.ay + y0;
        const row = cam.cells.y + Math.floor(top / cam.cell.h);
        const pill = f.labels.find((l) => (l.kind === 'name' ? l.text.endsWith(` ${g.id}`) : l.text.includes(` ${g.id} · `)));
        if (pill) {
          names++;
          assert.ok(pill.row < row, `${id}: ${g.id}'s name on row ${pill.row}, its ${g.pose} sprite's top on row ${row}`);
        }
        if (g.emote) {
          emotes++;
          const es = emoteSprite(g.emote.kind, g.emote.t, cam.s, ink);
          const [, ey] = P(g.x, g.y, g.z + figureTop(g) + EMOTE.gap);
          assert.ok(Math.round(ey) - es.ay + es.img.height <= top, `${id}: ${g.id}'s emote over its hat`);
        }
      }
    }
    assert.ok(names > 100, `${id}: ${names} names checked`);
    assert.ok(emotes > 5, `${id}: ${emotes} emotes checked`);
  }
});

test('a happy figure keeps its top, its label and its card where they are as it changes pose', () => {
  const stage = newStage();
  const glad = agent('glad', 'idle', { vitals: vitals({ streak: 12, midTool: false }), level: 2, crew: '/p', since: NOW - 60_000 });
  let now = run(stage, [glad], 4);
  const a = stage.actors()[0];
  // A pose of its own every so often, between hops standing about.
  const poses: Pose[] = ['cheer', 'drink', 'stretch', 'wave', 'sit'];
  type Shown = { at: string; top: number; box: string; row: number; card: string; pose: Pose };
  let last: Shown | null = null;
  const seen = new Set<string>();
  for (let i = 0; i < 400; i++) {
    if (i % 20 === 0) stage.life.gesture(a, poses[(i / 20) % poses.length], 0.6);
    now = run(stage, [glad], 0.05, now);
    const f = stage.frame(now)!;
    const g = f.figures[0];
    const label = f.labels.find((l) => l.text.includes('glad'));
    assert.equal(g.feel?.bouncy, true);
    // Standing still, nothing over its head.
    if (g.walking || g.emote || !label) {
      last = null;
      continue;
    }
    const box = figureBox(f.camera, g);
    const here: Shown = { at: `${g.x},${g.y}`, top: figureTop(g), box: JSON.stringify(box), row: label.row, card: JSON.stringify(placeCard(RECT, box)), pose: g.pose };
    if (last && last.at === here.at) {
      const what: string = `${last.pose} to ${here.pose}`;
      assert.equal(here.top, last.top, `${what}: its top`);
      assert.equal(here.box, last.box, `${what}: the cells it covers`);
      assert.equal(here.row, last.row, `${what}: its label's row`);
      assert.equal(here.card, last.card, `${what}: its card`);
      if (here.pose !== last.pose) seen.add([last.pose, here.pose].sort().join('/'));
    }
    last = here;
  }
  assert.ok([...seen].some((s) => s.includes('idle') && s !== 'idle'), `pose changes seen in place: ${[...seen]}`);
});

// A crew at ★2 (hats on), some at work, some about the room.
const hatted = () => ['ada', 'bo', 'cy', 'di'].map((n, i) => agent(n, (['idle', 'write', 'read', 'idle'] as Activity[])[i], { crew: '/p', level: 2, agentType: `t${i}`, since: NOW - 60_000 }));

test('a close-up frames its agent from its feet to the top of its hat', () => {
  const stage = newStage(WIDE, THEMES.find((t) => t.id === 'club')!);
  const now = run(stage, hatted(), 15);
  for (const id of ['bo', 'cy']) {
    let f: SceneFrame | null = null;
    for (let i = 0; i < 80; i++) f = stage.frame(now, id);
    const g = f!.figures.find((x) => x.id === id)!;
    const [, feet] = project(f!.camera, g.x, g.y, 0);
    const [, top] = project(f!.camera, g.x, g.y, figureTop(g));
    assert.ok(Math.abs((feet + top) / 2 - f!.camera.h / 2) < f!.camera.s, `${id}: its middle at ${((feet + top) / 2).toFixed(0)}, the view's at ${f!.camera.h / 2}`);
  }
});

test("close up, a figure whose hat reaches over the scene's top keeps its label, on the top rows", () => {
  for (const [id, r] of [['vault', RECT], ['snowy', { x: 0, y: 1, w: 80, h: 22 }]] as const) {
    const stage = newStage(r, THEMES.find((t) => t.id === id)!);
    const crew = hatted();
    let now = run(stage, crew, 15);
    let over = 0;
    let shown = 0;
    for (let k = 0; k < 400; k++) {
      now = run(stage, crew, 0.05, now);
      const f = stage.frame(now, 'ada')!;
      const cam = f.camera;
      for (const g of f.figures) {
        const [col, feet] = cellAt(cam, ...project(cam, g.x, g.y, 0));
        const [, top] = cellAt(cam, ...project(cam, g.x, g.y, figureTop(g)));
        if (g.id === 'ada' || col < r.x || col >= r.x + r.w || feet < r.y + 2 || feet >= r.y + r.h || top > r.y) continue;
        over++;
        const label = f.labels.find((l) => l.text.includes(g.id) || (l.kind === 'glyph' && Math.abs(l.col - col) <= 1));
        if (!label) continue;
        shown++;
        assert.ok(label.row >= r.y && label.row <= r.y + 1, `${id}: ${g.id}'s label on row ${label.row}`);
      }
    }
    assert.ok(over > 40, `${id}: ${over} figures with their tops out of view`);
    assert.ok(shown >= over * 0.8, `${id}: ${shown} of ${over} figures with their tops out of view labelled`);
  }
});

// How far a spot is from a rect (0 inside it).
const off = (p: { x: number; y: number }, r: { x0: number; y0: number; x1: number; y1: number }) => Math.hypot(Math.max(r.x0 - p.x, 0, p.x - r.x1), Math.max(r.y0 - p.y, 0, p.y - r.y1));

test('a desk upgrade stands by its own station, nearer it than any other, clear of the props and of the entrance, off where anyone works or stands; with no such spot, none', () => {
  let shown = 0;
  for (const id of ['snowy', 'cafe']) {
    const w = THEMES.find((t) => t.id === id)!;
    for (const act of ['write', 'read', 'search', 'run', 'web', 'think'] as Activity[]) {
      // A 90x26 terminal's scene; four roles at one station, at ★5.
      const stage = newStage({ x: 0, y: 1, w: 90, h: 23 }, w);
      const crew = [0, 1, 2, 3].map((i) => agent(`a${i}`, act, { crew: '/p', agentType: `t${i}`, level: 5 }));
      const now = run(stage, crew, 12);
      const slots = stage.stations();
      const own = slotRect(slots.find((s) => s.kind === stationKindFor(act))!);
      const door = slots.find((s) => s.kind === 'entrance')!;
      for (const tk of stage.frame(now)!.trinkets!) {
        shown++;
        const what = `${id}/${act}/${tk.id.split('\n')[1]} at ${tk.x.toFixed(1)},${tk.y.toFixed(1)}`;
        for (const s of slots) if (s.kind !== stationKindFor(act)) assert.ok(off(tk, slotRect(s)) > off(tk, own), `${what}: nearer the ${s.kind}`);
        for (const p of stage.room()!.props) assert.ok(off(tk, footprint(p)) >= 1, `${what}: in a prop`);
        for (const p of [...slots.map((s) => s.spot), ...stage.pois()]) assert.ok(Math.hypot(p.x - tk.x, p.y - tk.y) >= 2, `${what}: on a spot someone stands at`);
        assert.ok(off(tk, slotRect(door)) >= 4, `${what}: in the way in`);
      }
    }
  }
  assert.ok(shown >= 12, `${shown} desk upgrades`);
});

test('in a small room a desk upgrade stands nearer where anyone works rather than not at all, never on a spot or a lane, nor by the way in', () => {
  let roles = 0;
  let shown = 0;
  for (const w of THEMES) {
    // An 80x24 terminal's scene; a role at each station, at ★5.
    const stage = newStage({ x: 0, y: 1, w: 80, h: 22 }, w);
    const crew = (['write', 'read', 'search', 'run', 'web', 'think'] as Activity[]).map((act, i) => agent(`a${i}`, act, { crew: '/p', agentType: `t${i}`, level: 5, since: NOW - 60_000 }));
    const now = run(stage, crew, 15);
    roles += crew.length;
    const slots = stage.stations();
    const door = slots.find((s) => s.kind === 'entrance')!;
    // Where anyone stands: the spots idlers like, the way in, and a crowd's first lanes at each station.
    const lanes = stage as unknown as { laneSpot(s: Slot, k: number): { x: number; y: number } };
    const stands = [...stage.pois(), door.spot, ...slots.filter((s) => s !== door).flatMap((s) => [0, 1, 2, 3, 4].map((k) => lanes.laneSpot(s, k)))];
    for (const tk of stage.frame(now)!.trinkets!) {
      shown++;
      const what = `${w.id}/${tk.id.split('\n')[1]} at ${tk.x.toFixed(1)},${tk.y.toFixed(1)}`;
      for (const p of stage.room()!.props) assert.ok(off(tk, footprint(p)) >= 1, `${what}: in a prop`);
      for (const p of stands) assert.ok(Math.hypot(p.x - tk.x, p.y - tk.y) >= 2, `${what}: on a spot someone stands at`);
      assert.ok(off(tk, slotRect(door)) >= 4, `${what}: in the way in`);
    }
  }
  assert.ok(shown >= roles - 1, `${shown} of ${roles} roles have a desk upgrade`);
});

test("a mug's steam leaves the rest of the stage's chance alone", () => {
  // The same crew twice, but in one its mug role is at ★6 (a mug) and in
  // the other at ★4 (none); then the other agent's error goes bang.
  const roles = Array.from({ length: 40 }, (_, i) => `type-${i}`);
  const mugRole = roles.find((t) => hashString(`/p\n${t}`) % 3 === 1)!;
  const crew = (level: number, act: Activity, since = NOW) => [agent('m', 'write', { crew: '/p', agentType: mugRole, level }), agent('e', act, { since, detail: 'npm test failed' })];
  const [a, b] = [newStage(WIDE), newStage(WIDE)];
  let now = run(a, crew(6, 'write'), 10);
  run(b, crew(4, 'write'), 10);
  assert.ok(particlesOf(a).some((p) => p.kind === 'steam'), 'steam');
  run(a, crew(6, 'error', now), 1.5, now);
  now = run(b, crew(4, 'error', now), 1.5, now);
  const rest = (s: Stage) => particlesOf(s).filter((p) => p.kind !== 'steam').map((p) => `${p.kind} ${p.x} ${p.y} ${p.z}`);
  assert.ok(rest(b).filter((p) => p.startsWith('spark')).length > 5, 'the bang');
  assert.deepEqual(rest(a), rest(b));
});

test("while its ★N! rises a figure shows no emote, not even one a neighbour's finish sets off just after", () => {
  const stage = newStage();
  const crew = [agent('a', 'idle', { crew: '/p', level: 3, since: NOW - 5000 }), agent('b', 'write')];
  let now = run(stage, crew, 4);
  const a = stage.actors().find((x) => x.info.id === 'a')!;
  stage.levelUp('a', 3);
  // b finishes: those round it cheer, a heart or a star over them a moment later.
  const done = [crew[0], { ...crew[1], activity: 'done' as Activity, since: now }];
  let hushed = 0;
  let rising = 0;
  for (let i = 0; i < 50; i++) {
    now = run(stage, done, 0.05, now);
    const f = stage.frame(now)!;
    if (!f.labels.some((l) => l.text === '★3!')) continue;
    rising++;
    assert.equal(f.figures.find((g) => g.id === 'a')!.emote, undefined, `frame ${i}: an emote over the ★3!`);
    if (a.mind.emote && a.mind.emote.born <= stage.life.clock) hushed++;
  }
  assert.ok(rising > 30, `${rising} frames of the word`);
  assert.ok(hushed > 0, 'the finish never set off an emote to keep down');
  // The word gone, emotes show again.
  now = run(stage, done, 2, now);
  stage.cheer('a');
  now = run(stage, done, 0.1, now);
  assert.equal(stage.frame(now)!.figures.find((g) => g.id === 'a')!.emote?.kind, 'heart');
});

test('a level-up bursts over one hauling a block, who keeps carrying it rather than stop to cheer', () => {
  const stage = newStage();
  const crew = [agent('d', 'done', { crew: '/p', level: 3 })];
  let now = run(stage, crew, 3);
  const d = stage.actors()[0] as Actor;
  const carrying = () => d.mind.errand?.kind === 'haul' && d.mind.errand.step === 'carry';
  for (let i = 0; i < 400 && !carrying(); i++) now = run(stage, crew, 0.05, now);
  assert.ok(carrying(), 'never carried a block');
  stage.levelUp('d', 3);
  let word = false;
  for (let i = 0; i < 28 && carrying(); i++) {
    now = run(stage, crew, 0.05, now);
    const f = stage.frame(now)!;
    word ||= f.labels.some((l) => l.text === '★3!');
    if (carrying()) assert.equal(f.figures[0].pose, 'carry', `frame ${i}`);
  }
  assert.ok(word, 'the word');
  assert.ok(particlesOf(stage).some((p) => p.kind === 'confetti'), 'the burst');
});

test('desk upgrades are worked out again when the cast or a level changes, else twice a second; what one wears is one object a level', () => {
  const stage = newStage(WIDE);
  const crew = [agent('w', 'write', { crew: '/p', role: 'lead', level: 5 }), agent('j', 'read', { crew: '/p', agentType: 'Explore', level: 6 })];
  let now = run(stage, crew, 10);
  const s = stage as unknown as { placeTrinkets(): unknown };
  const place = s.placeTrinkets.bind(stage);
  let calls = 0;
  s.placeTrinkets = () => {
    calls++;
    return place();
  };
  now = run(stage, crew, 5, now);
  assert.ok(calls >= 8 && calls <= 12, `${calls} times in 5 seconds`);
  assert.equal(stage.frame(now)!.trinkets!.length, 2);
  // Down a level (a crews file put back, say): gone in the next frame.
  now = run(stage, [{ ...crew[0], level: 4 }, crew[1]], 0.05, now);
  assert.deepEqual(stage.frame(now)!.trinkets!.map((t) => t.id), ['/p\nExplore']);
  const wear = (t: number) => stage.frame(t)!.figures.find((g) => g.id === 'j')!.wear;
  const was = wear(now);
  now = run(stage, crew, 0.5, now);
  assert.equal(wear(now), was);
});
