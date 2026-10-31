import type { Npc, Puppet } from '../../worlds/types.ts';
import { move, mul, turn, type Sketch } from '../figure/paint.ts';

// A local from its parts and its puppet (see Npc in worlds/types.ts), in
// the figures' units (see art/figure/rig.ts): origin between its feet on
// the floor, x toward where it faces, y down. Its body bobs and leans about
// its feet; its head turns about its neck; each arm swings at the shoulder
// and bends at the elbow; the near hand holds out what it serves. Parts
// are recorded back to front for the view, then painted by the sprites'
// painter (see art/figure/paint.ts): from the front the near arm (0) goes
// over everything, the far one (1) behind the body while it hangs, over it
// once it swings forward (FORE) and over the head once raised (HIGH); from
// behind an arm swung forward is hidden behind the body, and arm 1 is the
// near one.

// Room for any local in any act (units round the point between its feet):
// up to 16 tall, bobbing, arms up, its legs hanging off a seat, what it
// serves held out.
export const NPC_BOX = { x0: -10, x1: 10, y0: -21, y1: 4 } as const;
const FORE = 0.6;
const HIGH = 2.2;

export function buildNpc(sk: Sketch, n: Npc, p: Puppet, back: boolean): void {
  const b = n.bones;
  const parts = n.parts;
  const held = p.hold ? n.serve : undefined;
  sk.push(mul(move(0, -p.bob), turn(p.lean)));
  const arm = (k: 0 | 1) => {
    const [sx, sy] = b.shoulders[k];
    sk.at(mul(move(sx, sy), turn(-p.arms[k].sh)), () => {
      parts.upper(sk, p, k, back);
      sk.at(mul(move(0, b.upper), turn(-p.arms[k].el)), () => {
        parts.fore(sk, p, k, back);
        if (k === 0 && held) sk.at(move(0, b.fore), () => held.draw(sk));
      });
    });
  };
  const body = () => parts.body(sk, p, back);
  const head = () => sk.at(mul(move(b.neck[0], b.neck[1]), turn(p.tilt)), () => parts.head(sk, p, back));
  const far = p.arms[1].sh;
  if (back) {
    // arm 0 is the far one from behind: under the body, forward or not
    if (far >= FORE) arm(1);
    arm(0);
    body();
    head();
    if (far < FORE) arm(1);
  } else {
    if (far < FORE) arm(1);
    body();
    if (far >= FORE && far < HIGH) arm(1);
    head();
    if (far >= HIGH) arm(1);
    arm(0);
  }
  sk.pop();
}
