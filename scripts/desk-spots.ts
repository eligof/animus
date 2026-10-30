// Shows where a small thing may stand on a world's desk, for drawing its
// clutter: a map of the desk's top, one cell for each place a thing of the
// given size could stand, as the world test judges it (test/desk-contract.ts).
//
//   node scripts/desk-spots.ts <world> [r=0.4] [h=0.8]
//
// <world>: a registered world's id, or a world's module file. A plain
// cylinder of radius r and height h (units) is drawn at the height of the
// desk's top, in both frames, over u 0.75..6.25 (across) and v 0.75..2.25
// (down) in steps of 0.25. Cells: `.` ok, `S` over the screen, `A` behind the
// agent at work, `U` too near the desk upgrade, `X` off the top.
import { fileURLToPath } from 'node:url';
import { DESK } from '../src/world/desks.ts';
import type { P3 } from '../src/worlds/types.ts';
import { workstationOf } from '../src/worlds/workstation.ts';
import { S, partCheck } from '../test/desk-contract.ts';
import { loadWorld } from './scene-shot.ts';

async function main(): Promise<void> {
  const [id, rArg, hArg] = process.argv.slice(2);
  if (!id) {
    console.error('usage: node scripts/desk-spots.ts <world> [r=0.4] [h=0.8]');
    process.exit(2);
  }
  const r = Number(rArg ?? 0.4);
  const h = Number(hArg ?? 0.8);
  const w = await loadWorld(id);
  const art = workstationOf(w);
  const z = art.top[2];
  const mark = (u: number, v: number): string => {
    if (u < r || u > DESK.len - r || v < r || v > DESK.dep - r || z < 2 || z > art.height - 1) return 'X';
    if (Math.hypot(u - art.top[0], v - art.top[1]) < 1.75) return 'U';
    const p: P3 = [u, v, z];
    let found = '.';
    for (const wall of ['right', 'left'] as const) {
      const draw = (view: Parameters<typeof partCheck>[2] extends (v: infer V) => void ? V : never): void => {
        const [x, y] = view.at(u, v, z);
        const [, ty] = view.at(u, v, z + h);
        const rx = r * S * Math.SQRT2;
        view.pen.fillStyle = '#888';
        view.pen.beginPath();
        view.pen.ellipse(x, y, rx, rx / 2, 0, 0, Math.PI * 2);
        view.pen.rect(x - rx, ty, 2 * rx, y - ty);
        view.pen.ellipse(x, ty, rx, rx / 2, 0, 0, Math.PI * 2);
        view.pen.fill();
      };
      const c = partCheck(art, wall, draw, [p, r, h], false);
      if (c.over > S) return 'S';
      if (c.behind > 0.1 * c.n) found = 'A';
    }
    return found;
  };
  console.log(`${w.id}: r ${r}, h ${h} (u 0.75..6.25 across, v 0.75..2.25 down; . ok, S over the screen, A behind the agent, U near the upgrade, X off the top)`);
  for (let v = 0.75; v <= 2.25 + 1e-9; v += 0.25) {
    let row = `v ${v.toFixed(2)} `;
    for (let u = 0.75; u <= 6.25 + 1e-9; u += 0.25) row += mark(u, v);
    console.log(row);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
