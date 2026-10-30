import type { Clutter, DeskLoop, P3, WorldDef } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';

// Stand-ins for a world's desk art, for tests that must not hang on how a
// world draws: clutter that is a square of colour, a loop that is a dot
// rising a step a frame (dim while off).

const COLORS = ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#fabebe'];

export function square(name: string, color: string): Clutter {
  return {
    name,
    r: 0.4,
    h: 0.6,
    draw(v, at) {
      const [x, y] = v.at(at[0], at[1], at[2] + 0.3);
      v.pen.fillStyle = color;
      v.pen.fillRect(x - 0.2 * v.s, y - 0.2 * v.s, 0.4 * v.s, 0.4 * v.s);
    },
  };
}

export function blink(name: string, at: P3, frames = 8, fps = 8): DeskLoop {
  return {
    name,
    at,
    r: 0.5,
    h: 1.2,
    frames,
    fps,
    draw(v, i) {
      const [x, y] = v.at(at[0], at[1], at[2] + 0.2 + (0.8 * i) / frames);
      v.pen.fillStyle = v.active ? '#ffd34a' : '#7a6a3a';
      v.pen.beginPath();
      v.pen.arc(x, y, 0.2 * v.s, 0, Math.PI * 2);
      v.pen.fill();
    },
  };
}

// `w` with ten squares of clutter to pick from, on five spots in front of
// its screen (`id` names it apart: the pick is seeded by it).
export function dressed(w: WorldDef, id = w.id): WorldDef {
  const ws = workstationOf(w);
  const z = ws.top[2];
  const spots: P3[] = [[3.0, 2.1, z], [4.7, 2.1, z], [6.3, 2.2, z], [3.4, 1.3, z], [5.0, 1.3, z]];
  return { ...w, id, workstation: { ...ws, clutter: { items: COLORS.map((c, k) => square(`thing${k}`, c)), spots } } };
}

// `w` with two loops on every desk, eight frames at eight a second each.
export function looped(w: WorldDef): WorldDef {
  const ws = workstationOf(w);
  const z = ws.top[2];
  return { ...w, workstation: { ...ws, loops: [blink('a', [6.2, 2.0, z]), blink('b', [3.2, 2.3, z])] } };
}
