import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Canvas } from '../src/art/canvas.ts';
import { render, Sketch } from '../src/art/figure/paint.ts';
import { frame, project } from '../src/art/iso.ts';
import { ACTS, loopOf, puppetOf, type SharedAct } from '../src/art/npc/acts.ts';
import { NPC_BOX, buildNpc } from '../src/art/npc/puppet.ts';
import { AMBIENT_FPS, CYCLE } from '../src/art/scene.ts';
import { PROP_SIZE } from '../src/world/layout.ts';
import { NPC_R, cutOf } from '../src/world/npc-place.ts';
import { hashString } from '../src/world/rng.ts';
import type { Npc, NpcAct, NpcLoop, PropArt, Puppet, WorldDef } from '../src/worlds/types.ts';

// What every world's locals are held to (see Npc in src/worlds/types.ts):
// the world test runs it on each world's, the puppet test on the
// stand-ins.

export const S = 6;
const INK = '#2b2233';
const B = NPC_BOX;
export const hashOf = (c: Canvas) => createHash('sha256').update(c.data).digest('hex');

// Local n posed as puppet p, from behind or not, drawn at scale S on a
// canvas exactly NPC_BOX in size, its feet at the box's origin; and in
// `act` at `frame`.
export function puppetPicture(n: Npc, p: Puppet, back: boolean): Canvas {
  const sk = new Sketch();
  buildNpc(sk, n, p, back);
  const c = new Canvas((B.x1 - B.x0) * S, (B.y1 - B.y0) * S);
  render(c, sk, [S, 0, 0, S, -B.x0 * S, -B.y0 * S], Math.max(1.5, 0.28 * S), INK);
  return c;
}
export const npcPicture = (n: Npc, act: NpcAct, frame: number, back: boolean): Canvas => puppetPicture(n, puppetOf(n, act, frame), back);

// How far a hand reaches out round its forearm (a fist, a mitten, a
// cuff), units: what an arm paints past that is held in it.
const HAND = 1.5;

// How far arm k's fore part, drawn alone in its own frame for puppet p,
// paints out from the forearm (the line from the elbow to the hand), units.
function foreReach(n: Npc, p: Puppet, k: 0 | 1, back: boolean): number {
  const f = n.bones.fore;
  const R = 6;
  const sk = new Sketch();
  n.parts.fore(sk, p, k, back);
  const c = new Canvas(2 * R * S, (2 * R + f) * S);
  render(c, sk, [S, 0, 0, S, R * S, R * S], Math.max(1.5, 0.28 * S), INK);
  let out = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (c.data[(y * c.width + x) * 4 + 3] < 16) continue;
      const [u, v] = [(x + 0.5) / S - R, (y + 0.5) / S - R];
      out = Math.max(out, Math.hypot(u, v - Math.max(0, Math.min(f, v))));
    }
  }
  return out;
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

// Station art worked at time t, backed onto `wall`, seeded as the room
// planner seeds world w's (see planRoom), at scale S on a canvas round its
// box.
export function stationPicture(w: WorldDef, art: PropArt, kind: string, wall: 'left' | 'right', t: number): Canvas {
  const pad = 8 * S;
  const at0 = frame(project(0, 0, S), wall, 0, 0);
  let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const u of [0, art.len]) for (const v of [0, art.dep]) for (const z of [0, art.height]) {
    const [x, y] = at0(u, v, z);
    box = { x0: Math.min(box.x0, x), y0: Math.min(box.y0, y), x1: Math.max(box.x1, x), y1: Math.max(box.y1, y) };
  }
  const c = new Canvas(Math.ceil(box.x1 - box.x0 + 2 * pad), Math.ceil(box.y1 - box.y0 + 2 * pad));
  const at = frame(project(pad - box.x0, pad - box.y0, S), wall, 0, 0);
  art.draw({ pen: c, s: S, at, len: art.len, dep: art.dep, wall, island: true, t, active: true, seed: hashString(`${w.id}:${kind}`) });
  return c;
}

// A world's station a local works, worked, is shown as a loop of two
// seconds (see CYCLE in art/scene.ts): what moves on it repeats within 2 s
// (flicker too: seeded and periodic), so the loop has no jump where it
// comes round. The way in is not worked.
export function stationLoops(w: WorldDef, n: Npc): void {
  const art = w.stations[n.station];
  if (n.station === 'entrance' || !art.animated) return;
  for (const wall of ['right', 'left'] as const) {
    for (let i = 0; i < CYCLE; i++) {
      const t = i / AMBIENT_FPS;
      const a = stationPicture(w, art, n.station, wall, t);
      const d = differ(a, stationPicture(w, art, n.station, wall, t + 2));
      assert.ok(d <= Math.max(6, 0.002 * painted(a).n), `${w.id} ${n.name}: its ${n.station} worked (${wall} wall) ${d} pixels off at ${t.toFixed(2)} s and 2 s on`);
    }
  }
}

// Pixels not the same in two pictures of one size.
function unlike(a: Canvas, b: Canvas): number {
  let n = 0;
  for (let o = 0; o < a.data.length; o += 4) {
    if (a.data[o] !== b.data[o] || a.data[o + 1] !== b.data[o + 1] || a.data[o + 2] !== b.data[o + 2] || a.data[o + 3] !== b.data[o + 3]) n++;
  }
  return n;
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

// In a shared act a local's hands are empty of its tools (see NpcParts in
// src/worlds/types.ts). Frame i of `act` (`pic`) draws as its pose does
// handed over (whose near hand holds only what it serves, which the puppet
// draws from `hold`), so nothing in a hand comes and goes with the act; and
// each forearm paints no more than a hand round it, so nothing stays in one
// either. A heuristic: a thing no bigger than a hand, drawn in every act,
// gets past both.
function emptyHanded(what: string, n: Npc, act: SharedAct, i: number, back: boolean, pic: Canvas): void {
  const p = puppetOf(n, act, i);
  const at = `${act} ${i}${back ? ' from behind' : ''}`;
  if (act !== 'handOver') {
    const d = unlike(pic, puppetPicture(n, { ...p, act: 'handOver' }, back));
    assert.equal(d, 0, `${what}: ${at} draws ${d} pixels unlike its pose handed over (a tool in a hand?)`);
  }
  for (const k of [0, 1] as const) {
    const r = foreReach(n, p, k, back);
    assert.ok(r <= HAND, `${what}: ${at}, arm ${k} paints ${r.toFixed(2)} out from its forearm (a tool in its hand?)`);
  }
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
  if (pl.mode === 'seated') {
    assert.ok(pl.z >= 0 && pl.z <= 8, `${what}: seated ${pl.z} up`);
    assert.equal(pl.top === undefined, pl.edge === undefined, `${what}: seated with a counter's top or its edge, not both`);
  }
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
  } else {
    // with none of its own it cheers as everyone does, empty-handed
    for (const back of pl.look === 'back' ? [false, true] : [false]) {
      for (let i = 0; i < ACTS.cheer.frames; i++) {
        const d = unlike(npcPicture(n, 'celebrate', i, back), npcPicture(n, 'cheer', i, back));
        assert.equal(d, 0, `${what}: celebrate ${i}${back ? ' from behind' : ''} draws ${d} pixels unlike its cheer (a tool in a hand?)`);
      }
    }
  }
  // Every frame of every act inside its box, as it is seen (from behind
  // too if it faces away; the other way round is the mirror image); in a
  // shared act, empty-handed.
  for (const back of pl.look === 'back' ? [false, true] : [false]) {
    for (const act of actsOf(n)) {
      const lp = loopOf(n, act);
      for (let i = 0; i < lp.frames; i++) {
        const pic = npcPicture(n, act, i, back);
        const p = painted(pic);
        assert.ok(p.n > 0, `${what}: ${act} ${i}${back ? ' from behind' : ''} draws nothing`);
        assert.ok(!p.edge, `${what}: ${act} ${i}${back ? ' from behind' : ''} reaches out of its box`);
        if (act in ACTS) emptyHanded(what, n, act as SharedAct, i, back, pic);
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
