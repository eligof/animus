import { shade } from '../src/art/iso.ts';
import { rest } from '../src/art/npc/acts.ts';
import { face } from '../src/art/npc/face.ts';
import type { Pen } from '../src/art/types.ts';
import { PROP_SIZE } from '../src/world/layout.ts';
import type { SlotKind } from '../src/world/types.ts';
import type { Bones, Npc, NpcLoop, NpcPlace, NpcServe, WorldDef } from '../src/worlds/types.ts';

// Stand-in locals for tests that must not hang on how a world draws its
// own: a block of a body on two legs, a round head with a face, stick
// arms. At work the far arm swings and the head nods; a show raises both
// arms; a celebration jumps.

const TAU = Math.PI * 2;
const SKIN = '#e0a074';
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

export const BONES: Bones = { neck: [0.1, -7.9], shoulders: [[-1.6, -7.3], [1.7, -7.3]], upper: 1.7, fore: 1.6 };

// Something to drink, and something not.
export const CUP: NpcServe = {
  name: 'cup',
  drink: true,
  draw(sk) {
    sk.blob((p) => p.roundRect(-0.5, -0.3, 1.0, 1.2, 0.25), '#f4efe6', { dark: '#d8cfc0', d: 0.2 });
  },
};
export const TICKET: NpcServe = {
  name: 'ticket',
  drink: false,
  draw(sk) {
    sk.blob((p) => p.rect(-0.4, -0.1, 0.8, 1.1), '#ffd34a', { line: 0.6 });
  },
};

export type StandIn = { color?: string; serve?: NpcServe; show?: 'dance' | 'watch'; celebrate?: boolean; tall?: number };

export function standIn(name: string, station: SlotKind, place: NpcPlace, o: StandIn = {}): Npc {
  const color = o.color ?? '#5a8ad8';
  const work: NpcLoop = {
    secs: 1,
    frames: 8,
    pose: (u) => ({ ...rest(), tilt: 0.1 * Math.sin(u * TAU), arms: [{ sh: 0.12, el: 0.2 }, { sh: 0.6 + 0.5 * Math.sin(u * TAU), el: 0.6 }] }),
  };
  const n: Npc = {
    name,
    station,
    place,
    tall: o.tall ?? 14,
    bones: BONES,
    parts: {
      body(sk) {
        for (const x of [0.8, -0.8]) sk.limb([x, -3.4, x, -0.4], 1.1, '#3a3f66');
        sk.blob((p) => p.roundRect(-2.0, -7.8, 4.2, 4.6, 1.2), color, { dark: shade(color, -0.25), d: 0.4 });
      },
      head(sk, p, back) {
        sk.blob(circ(0.1, -2.95, 3.2), SKIN, { dark: shade(SKIN, -0.2), d: 0.4 });
        if (!back) face(sk, { x: 0.65, y: -2.15, eyes: p.eyes, mouth: p.mouth });
      },
      upper(sk) {
        sk.limb([0, 0, 0, BONES.upper], 1.0, color);
      },
      fore(sk) {
        sk.limb([0, 0, 0, BONES.fore], 0.9, SKIN);
        sk.blob(circ(0, BONES.fore, 0.55), SKIN);
      },
    },
    work,
  };
  if (o.serve) n.serve = o.serve;
  if (o.show) {
    n.show = {
      secs: 2,
      frames: 12,
      crowd: o.show,
      pose: (u) => ({ ...rest(), bob: 0.3 * Math.abs(Math.sin(u * TAU * 2)), arms: [{ sh: 2.6, el: 0.3 }, { sh: 2.6 + 0.3 * Math.sin(u * TAU * 2), el: 0.3 }], eyes: 'happy', mouth: 'open' }),
    };
  }
  if (o.celebrate) n.celebrate = { secs: 1, frames: 6, pose: (u) => ({ ...rest(), bob: 0.5 * Math.sin(u * Math.PI), eyes: 'happy', mouth: 'open' }) };
  return n;
}

export const withLocals = (w: WorldDef, npcs: readonly Npc[]): WorldDef => ({ ...w, npcs });

// Three stand-ins any world has room for, inside their stations: one
// behind the run station pouring drinks (it has a show), a clerk seated at
// the think station handing out tickets, a smith behind the write station
// (with its own way of celebrating).
export function trio(w: WorldDef): WorldDef {
  return withLocals(w, [
    standIn('pourer', 'run', { mode: 'behind', u: 5.5, v: 2, top: 6, edge: 4 }, { color: '#d85a5a', serve: CUP, show: 'watch' }),
    standIn('clerk', 'think', { mode: 'seated', u: 6, v: 3, z: 2 }, { color: '#5ad87a', serve: TICKET }),
    standIn('smith', 'write', { mode: 'behind', u: 5.5, v: 1.5, top: 5, edge: 3 }, { color: '#d8c85a', celebrate: true }),
  ]);
}

// Stand-ins standing round the run and write stations, a few units apart,
// beside them and out in front, and one inside the run station: the
// planner keeps those it can (see placeNpcs), for tests of a local on the
// floor.
export function standers(w: WorldDef): WorldDef {
  const out: Npc[] = [];
  for (const station of ['run', 'write'] as const) {
    const { len, dep } = PROP_SIZE[station];
    const spots: Array<[number, number]> = [[-2.5, dep - 1], [len + 2.5, dep - 1], [-2.5, dep + 3], [len + 2.5, dep + 3], [len / 2 - 4, dep + 3.5], [len / 2 + 4, dep + 3.5]];
    for (const [u, v] of spots) out.push(standIn(`stander${out.length}`, station, { mode: 'standing', u, v }));
  }
  out.push(standIn('insider', 'run', { mode: 'standing', u: 5, v: 5 }));
  return withLocals(w, out);
}
