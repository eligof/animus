import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { render, Sketch } from '../src/art/figure/paint.ts';
import { ACTS, loopOf, puppetOf } from '../src/art/npc/acts.ts';
import { NPC_BOX, buildNpc } from '../src/art/npc/puppet.ts';
import { PROP_SIZE } from '../src/world/layout.ts';
import { NPC_R, cutOf } from '../src/world/npc-place.ts';
import type { Npc, NpcAct, NpcLoop, WorldDef } from '../src/worlds/types.ts';

// What every world's locals are held to (see Npc in src/worlds/types.ts):
// the world test runs it on each world's, the puppet test on the
// stand-ins.

export const S = 6;
const INK = '#2b2233';
const B = NPC_BOX;
export const hashOf = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

// Local n in `act` at `frame`, from behind or not, drawn at scale S on a
// canvas exactly NPC_BOX in size, its feet at the box's origin.
export function npcPicture(n: Npc, act: NpcAct, frame: number, back: boolean): Canvas {
  const sk = new Sketch();
  buildNpc(sk, n, puppetOf(n, act, frame), back);
  const c = new Canvas((B.x1 - B.x0) * S, (B.y1 - B.y0) * S);
  render(c, sk, [S, 0, 0, S, -B.x0 * S, -B.y0 * S], Math.max(1.5, 0.28 * S), INK);
  return c;
}

// Its painted pixels, whether any lies on the canvas's edge (the box was
// too small for it), and how high it reaches over its feet (units).
export function painted(c: Canvas): { n: number; edge: boolean; top: number } {
  let n = 0;
  let edge = false;
  let row = c.height;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < 16) continue;
      n++;
      row = Math.min(row, y);
      if (x === 0 || y === 0 || x === c.width - 1 || y === c.height - 1) edge = true;
    }
  }
  return { n, edge, top: (-B.y0 * S - row) / S };
}

// Pixels that differ between two pictures of one size.
export function differ(a: Canvas, b: Canvas): number {
  let n = 0;
  for (let o = 0; o < a.data.length; o += 4) {
    const d = Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]);
    if (d > 48 || Math.abs(a.data[o + 3] - b.data[o + 3]) > 32) n++;
  }
  return n;
}

// The acts a local plays: its own and the shared ones.
export function actsOf(n: Npc): NpcAct[] {
  const own: NpcAct[] = ['work'];
  if (n.show) own.push('show');
  if (n.celebrate) own.push('celebrate');
  return [...own, ...(Object.keys(ACTS) as NpcAct[])];
}

export function npcContract(w: WorldDef, n: Npc): void {
  const what = `${w.id} ${n.name}`;
  const art = w.stations[n.station];
  const { len, dep } = PROP_SIZE[n.station];
  assert.ok(/^[a-z][a-zA-Z0-9]*$/.test(n.name), `${what}: a name in camelCase`);
  assert.ok(n.tall >= 11 && n.tall <= 16, `${what}: ${n.tall} tall`);
  assert.ok(n.bones.upper > 0 && n.bones.fore > 0 && n.bones.upper + n.bones.fore <= 5, `${what}: arms ${n.bones.upper} and ${n.bones.fore} long`);
  // Where its job puts it, in its station's frame.
  const pl = n.place;
  if (pl.mode === 'standing') {
    assert.ok(pl.u <= -NPC_R || pl.u >= len + NPC_R || pl.v >= dep + NPC_R, `${what}: standing at ${pl.u}, ${pl.v}, on its station`);
  } else {
    assert.ok(pl.u >= 0.5 && pl.u <= len - 0.5 && pl.v >= 0.3 && pl.v <= dep - 0.3, `${what}: at ${pl.u}, ${pl.v}, not inside its station`);
  }
  if (pl.mode === 'seated') assert.ok(pl.z >= 0 && pl.z <= 8, `${what}: seated ${pl.z} up`);
  const cut = cutOf(pl);
  if (pl.mode === 'behind') assert.ok(cut !== undefined, `${what}: behind nothing`);
  if (cut !== undefined && pl.mode !== 'standing') {
    assert.ok(pl.edge! > pl.v && pl.edge! <= dep && pl.top! > 0 && pl.top! <= art.height, `${what}: a counter ${pl.top} high from ${pl.edge} out`);
    assert.ok(cut >= 2.5 && cut <= 9, `${what}: cut ${cut.toFixed(2)} over its feet (its legs hidden, its head and shoulders shown)`);
  }
  // Its loops.
  const loop = (name: string, lp: NpcLoop, frames: readonly [number, number], secs: readonly [number, number]) => {
    assert.ok(Number.isInteger(lp.frames) && lp.frames >= frames[0] && lp.frames <= frames[1], `${what}: ${name} in ${lp.frames} frames`);
    assert.ok(lp.secs >= secs[0] && lp.secs <= secs[1] && lp.frames / lp.secs <= 12, `${what}: ${name} in ${lp.frames} frames over ${lp.secs} s`);
  };
  loop('work', n.work, [4, 12], [0.5, 4]);
  if (n.show) {
    loop('show', n.show, [6, 16], [1, 6]);
    assert.ok(n.show.crowd === 'dance' || n.show.crowd === 'watch', `${what}: a show's crowd`);
  }
  if (n.celebrate) {
    loop('celebrate', n.celebrate, [4, 12], [0.6, 2.5]);
    // played once, it ends as it starts (its last frame shown posed as its
    // first), so it slots back into its work
    const [p, q] = [puppetOf(n, 'celebrate', 0), puppetOf(n, 'celebrate', n.celebrate.frames - 1)];
    const off = Math.abs(p.bob - q.bob) + Math.abs(p.lean - q.lean) + Math.abs(p.tilt - q.tilt) + p.arms.reduce((s, a, k) => s + Math.abs(a.sh - q.arms[k].sh) + Math.abs(a.el - q.arms[k].el), 0);
    assert.ok(off < 0.05, `${what}: its celebration ends ${off.toFixed(2)} off where it starts`);
  }
  // Every frame of every act inside its box, as it is seen (from behind
  // too if it faces away; the other way round is the mirror image).
  for (const back of pl.look === 'back' ? [false, true] : [false]) {
    for (const act of actsOf(n)) {
      const lp = loopOf(n, act);
      for (let i = 0; i < lp.frames; i++) {
        const p = painted(npcPicture(n, act, i, back));
        assert.ok(p.n > 0, `${what}: ${act} ${i}${back ? ' from behind' : ''} draws nothing`);
        assert.ok(!p.edge, `${what}: ${act} ${i}${back ? ' from behind' : ''} reaches out of its box`);
      }
    }
  }
  // The same frame the same pixels; its work moves; as tall as it says.
  const work = Array.from({ length: n.work.frames }, (_, i) => npcPicture(n, 'work', i, false));
  assert.deepEqual(Array.from({ length: n.work.frames }, (_, i) => hashOf(npcPicture(n, 'work', i, false))), work.map(hashOf), `${what}: a work frame drawn two ways`);
  assert.ok(new Set(work.map(hashOf)).size >= 3, `${what}: its work does not move`);
  const top = Math.max(...work.map((c) => painted(c).top));
  assert.ok(top >= n.tall - 2 && top <= n.tall + 0.75, `${what}: ${top.toFixed(2)} tall at work, says ${n.tall}`);
  // What it serves draws, small, at its hand.
  if (n.serve) {
    assert.ok(/^[a-z][a-zA-Z0-9]*$/.test(n.serve.name), `${what}: its serve item's name`);
    const sk = new Sketch();
    n.serve.draw(sk);
    const c = new Canvas(6 * S, 6 * S);
    render(c, sk, [S, 0, 0, S, 3 * S, 3 * S], Math.max(1.5, 0.28 * S), INK);
    const p = painted(c);
    assert.ok(p.n >= S * S && !p.edge, `${what}: its ${n.serve.name} draws nothing, or reaches 3 units from its hand`);
  }
}
