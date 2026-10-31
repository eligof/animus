import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sketch } from '../src/art/figure/paint.ts';
import { ACTS, loopOf, puppetOf, rest, type SharedAct } from '../src/art/npc/acts.ts';
import { buildNpc } from '../src/art/npc/puppet.ts';
import { getTheme } from '../src/themes/index.ts';
import { cutOf, facingOf } from '../src/world/npc-place.ts';
import { toWorld } from '../src/world/room.ts';
import type { Npc, Puppet } from '../src/worlds/types.ts';
import { npcContract } from './npc-contract.ts';
import { CUP, standIn, trio } from './npc-fakes.ts';

// The locals' puppet: the shared acts start and end at rest, their last
// frame shown the end, and move what they should; a puppet records its
// parts back to front for the view; a place says where a local is cut and
// which way it faces; the stand-ins meet the contract every world's locals
// are held to.

const SHARED = Object.keys(ACTS) as SharedAct[];
type Pose = Omit<Puppet, 'act' | 'u'>;
// Two puppets alike, but for the act and how far into it.
function alike(p: Pose, q: Pose): boolean {
  const d = Math.abs(p.bob - q.bob) + Math.abs(p.lean - q.lean) + Math.abs(p.tilt - q.tilt) + p.arms.reduce((n, a, k) => n + Math.abs(a.sh - q.arms[k].sh) + Math.abs(a.el - q.arms[k].el), 0);
  return d < 1e-9 && p.eyes === q.eyes && p.mouth === q.mouth && p.hold === q.hold;
}
// Any local: the shared acts are the same for all.
const ANY = standIn('any', 'run', { mode: 'behind', u: 5, v: 2, top: 6, edge: 4 });
// Every frame of shared act `a`, as a local shows it.
const frames = (a: SharedAct) => Array.from({ length: ACTS[a].frames }, (_, i) => puppetOf(ANY, a, i));
const most = (ps: Pose[], f: (p: Pose) => number) => Math.max(...ps.map(f));

test('every shared act starts and ends at rest, its first and last frames shown, a few frames a second', () => {
  assert.deepEqual(SHARED.sort(), ['applaud', 'beckon', 'cheer', 'flinch', 'handOver', 'nod', 'talk', 'wave']);
  for (const a of SHARED) {
    assert.ok(alike(ACTS[a].pose(0), rest()), `${a} does not start at rest`);
    assert.ok(alike(ACTS[a].pose(1), rest()), `${a} does not end at rest`);
    const shown = frames(a);
    assert.ok(alike(shown[0], rest()), `${a}: its first frame is not at rest`);
    assert.ok(alike(shown[shown.length - 1], rest()), `${a}: its last frame is not at rest`);
    assert.ok(ACTS[a].frames >= 6 && ACTS[a].frames <= 10 && ACTS[a].frames / ACTS[a].secs <= 12, `${a}: ${ACTS[a].frames} frames over ${ACTS[a].secs} s`);
  }
});

test('each shared act moves what it should', () => {
  assert.ok(most(frames('wave'), (p) => p.arms[1].sh) > 2.2, 'a wave with the far hand down');
  assert.ok(frames('wave').every((p) => p.arms[0].sh < 0.2), 'a wave with the near hand');
  assert.ok(most(frames('cheer'), (p) => Math.min(p.arms[0].sh, p.arms[1].sh)) > 2.5 && most(frames('cheer'), (p) => p.bob) > 0.3, 'a cheer without both hands up and a hop');
  assert.ok(frames('flinch').some((p) => p.lean < -0.1 && p.eyes === 'shut'), 'a flinch that does not shrink back, eyes shut');
  const claps = frames('applaud').map((p) => p.arms[0].el);
  assert.ok(most(frames('applaud'), (p) => Math.min(p.arms[0].sh, p.arms[1].sh)) > 0.8 && Math.max(...claps) - Math.min(...claps) >= 0.3, 'applause without hands out front, clapping');
  assert.ok(new Set(frames('talk').map((p) => p.mouth)).size >= 3, 'a word with the mouth still');
  assert.ok(most(frames('nod'), (p) => p.tilt) > 0.12, 'a nod that does not nod');
  assert.ok(frames('handOver').some((p) => p.hold && p.arms[0].sh > 1.2), 'a hand-over with nothing held out');
  const curls = frames('beckon').map((p) => p.arms[1].el);
  assert.ok(most(frames('beckon'), (p) => p.arms[1].sh) > 1.2 && Math.max(...curls) - Math.min(...curls) >= 0.5, 'a beckon with no curl of the hand');
});

test("a local's own loops or the shared acts give its puppet, the act and how far into it set: round a loop for work and a show, through to the end for the rest", () => {
  const [pourer, clerk, smith] = trio(getTheme('mines')!).npcs!;
  assert.equal(loopOf(smith, 'work'), smith.work);
  assert.equal(loopOf(smith, 'celebrate'), smith.celebrate);
  assert.equal(loopOf(clerk, 'celebrate'), ACTS.cheer, 'no way of its own: the shared cheer');
  const p = puppetOf(smith, 'wave', 4);
  assert.equal(p.act, 'wave');
  assert.equal(p.u, 4 / (ACTS.wave.frames - 1));
  assert.ok(alike(p, ACTS.wave.pose(4 / (ACTS.wave.frames - 1))));
  // work and a show go round: their last frame is not their first
  assert.equal(puppetOf(smith, 'work', 3).u, 3 / smith.work.frames);
  assert.equal(puppetOf(pourer, 'show', pourer.show!.frames - 1).u, (pourer.show!.frames - 1) / pourer.show!.frames);
  // a celebration plays once: its last frame is its end
  const cel = smith.celebrate!;
  assert.equal(puppetOf(smith, 'celebrate', cel.frames - 1).u, 1);
  assert.ok(alike(puppetOf(smith, 'celebrate', cel.frames - 1), cel.pose(1)));
});

test('a puppet records its parts back to front for the view: the near arm over everything; the far one behind the body hanging, over it reaching forward, over the head raised; from behind the other way round', () => {
  const calls: string[] = [];
  const n: Npc = {
    ...standIn('rec', 'run', { mode: 'behind', u: 5, v: 2, top: 6, edge: 4 }, { serve: { ...CUP, draw: () => void calls.push('cup') } }),
    parts: {
      body: () => void calls.push('body'),
      head: () => void calls.push('head'),
      upper: (_sk, _p, k) => void calls.push(`upper${k}`),
      fore: (_sk, _p, k) => void calls.push(`fore${k}`),
    },
  };
  const order = (far: number, back: boolean, hold = false) => {
    calls.length = 0;
    buildNpc(new Sketch(), n, { ...rest(), arms: [{ sh: 0.12, el: 0.2 }, { sh: far, el: 0.2 }], hold }, back);
    return calls.join(' ');
  };
  assert.equal(order(0.12, false), 'upper1 fore1 body head upper0 fore0');
  assert.equal(order(1.2, false), 'body upper1 fore1 head upper0 fore0');
  assert.equal(order(2.6, false), 'body head upper1 fore1 upper0 fore0');
  assert.equal(order(0.12, true), 'upper0 fore0 body head upper1 fore1');
  assert.equal(order(1.2, true), 'upper1 fore1 upper0 fore0 body head');
  assert.equal(order(0.12, false, true), 'upper1 fore1 body head upper0 fore0 cup', 'what it serves, in its near hand');
});

test('a local is cut where its counter top crosses it, and faces into the room, along its station or away, on either wall', () => {
  assert.ok(Math.abs(cutOf({ mode: 'behind', u: 5, v: 1.3, top: 5.6, edge: 2.4 })! - 4.5) < 1e-9);
  assert.equal(cutOf({ mode: 'seated', u: 5, v: 3, z: 2 }), undefined);
  assert.equal(cutOf({ mode: 'seated', u: 5, v: 3, z: 2, top: 9, edge: 4 }), 6);
  assert.equal(cutOf({ mode: 'standing', u: -2, v: 3 }), undefined);
  assert.deepEqual(facingOf('right'), { back: false, flip: true });
  assert.deepEqual(facingOf('left'), { back: false, flip: false });
  assert.deepEqual(facingOf('right', 'along'), { back: false, flip: false });
  assert.deepEqual(facingOf('left', 'along'), { back: false, flip: true });
  assert.deepEqual(facingOf('right', 'back'), { back: true, flip: false });
  assert.deepEqual(facingOf('left', 'back'), { back: true, flip: true });
});

test("the stand-ins meet the contract every world's locals are held to", () => {
  const w = trio(getTheme('mines')!);
  for (const n of w.npcs!) npcContract(w, n);
});

test("a local behind its counter is cut where the counter's back edge crosses it on screen, in either frame", () => {
  const pl = { mode: 'behind' as const, u: 4, v: 1.2, top: 6, edge: 2.5 };
  const cut = cutOf(pl)!;
  for (const wall of ['right', 'left'] as const) {
    const at = (u: number, v: number, z: number) => {
      const [x, y, zz] = toWorld({ wall, x0: 0, y0: 0 }, u, v, z);
      return [x - y, (x + y) / 2 - zz];
    };
    const [fx, fy] = at(pl.u, pl.v, cut);
    // the point of the edge in the local's column of the screen
    const [ex, ey] = at(pl.u + pl.edge - pl.v, pl.edge, pl.top);
    assert.ok(Math.abs(ex - fx) < 1e-9, `${wall}: not the local's column`);
    assert.ok(Math.abs(ey - fy) < 1e-9, `${wall}: the cut is ${(ey - fy).toFixed(2)} off the edge`);
  }
});
