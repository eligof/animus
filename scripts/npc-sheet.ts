// A world's locals on one sheet, for an art review:
//
//   node scripts/npc-sheet.ts <world> <out.png> [--s 8]
//
// <world>: a registered world's id, or a world's module file (see
// loadWorld in ./scene-shot.ts). A row a local, drawn as the scene draws
// it but uncut, facing screen right: every frame of its work, every other
// frame of its show and of its own cheer, then each shared act at its
// middle frame. Under the rows, each local at work at its station (drawn
// worked, in the right wall's frame), cut at its counter and drawn over or
// under the station as the scene draws them. Prints each local's place and
// cut.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { Canvas } from '../src/art/canvas.ts';
import { npcSprite } from '../src/art/figure.ts';
import { frame, project } from '../src/art/iso.ts';
import { ACTS, loopOf } from '../src/art/npc/acts.ts';
import { encodeRgb } from '../src/art/png.ts';
import { inkOf, propParts } from '../src/art/scene.ts';
import { compare } from '../src/art/scene/depth.ts';
import type { NpcFrame } from '../src/world/frame.ts';
import { cutOf, facingOf } from '../src/world/npc-place.ts';
import type { Facing } from '../src/world/types.ts';
import type { NpcAct, WorldDef } from '../src/worlds/types.ts';
import { loadWorld } from './scene-shot.ts';

export function sheet(world: WorldDef, s: number): { img: Canvas; notes: string[] } {
  const ink = inkOf(world);
  const npcs = world.npcs ?? [];
  const shared = Object.keys(ACTS) as NpcAct[];
  const cell = { w: 20 * s, h: 26 * s, feet: 22 * s };
  const bay = 40 * s;
  const at = (k: number, act: NpcAct, i: number, facing: Facing, cut?: number): NpcFrame => {
    const f: NpcFrame = { k, x: 0, y: 0, z: 0, top: npcs[k].tall, facing, act, frame: i, prop: 0, on: false, works: true, shadow: false };
    if (cut !== undefined) f.cut = { h: cut, slope: 0.5 };
    return f;
  };
  const rows = npcs.map((n) => {
    const pics: Array<[NpcAct, number]> = [];
    for (let i = 0; i < n.work.frames; i++) pics.push(['work', i]);
    if (n.show) for (let i = 0; i < n.show.frames; i += 2) pics.push(['show', i]);
    if (n.celebrate) for (let i = 0; i < n.celebrate.frames; i += 2) pics.push(['celebrate', i]);
    for (const a of shared) pics.push([a, Math.floor(loopOf(n, a).frames / 2)]);
    return pics;
  });
  const img = new Canvas(Math.max(1, ...rows.map((r) => r.length * cell.w), npcs.length * bay), Math.max(1, rows.length * cell.h + bay));
  rows.forEach((pics, k) =>
    pics.forEach(([act, i], j) => {
      const sp = npcSprite(world, at(k, act, i, { back: npcs[k].place.look === 'back', flip: false }), s, ink);
      img.drawImage(sp.img, j * cell.w + Math.round(cell.w / 2) - sp.ax, k * cell.h + cell.feet - sp.ay);
    }),
  );
  const notes: string[] = [];
  npcs.forEach((n, k) => {
    const art = world.stations[n.station];
    const pl = n.place;
    const P = frame(project(k * bay + (art.dep + 3) * s, rows.length * cell.h + (Math.min(art.height, 24) + 3) * s, s), 'right', 0, 0);
    // The station split as the scene splits it (what it paints on the
    // floor goes under everything), and the local and the station's body
    // in the scene's depth order (see art/scene/depth.ts): one behind its
    // counter or seated stands on it; one standing beside it goes under it
    // where the station is nearer. In the right wall's frame u and v are
    // the floor's x and y.
    const pic = new Canvas(img.width, img.height);
    art.draw({ pen: pic, s, at: P, len: art.len, dep: art.dep, wall: 'right', island: false, t: 0.5, active: true, seed: 1 });
    const parts = propParts(pic, P, art.len, art.dep, art.height, s);
    const cut = cutOf(pl);
    const sp = npcSprite(world, at(k, 'work', 0, facingOf('right', pl.look), cut), s, ink);
    const z = pl.mode === 'seated' ? pl.z : 0;
    const [x, y] = P(pl.u, pl.v, z);
    const dx = Math.round(x) - sp.ax;
    const dy = Math.round(y) - sp.ay;
    const me = { x0: pl.u, y0: pl.v, x1: pl.u, y1: pl.v, h: z, point: true, sx0: dx, sy0: dy, sx1: dx + sp.img.width, sy1: dy + sp.img.height };
    // (the whole sheet as the station's box on screen: where the two do not
    // overlap, their order shows nothing)
    const box = { x0: 0, y0: 0, x1: art.len, y1: art.dep, h: art.height, point: false, sx0: 0, sy0: 0, sx1: img.width, sy1: img.height };
    const under = compare(me, box) < 0;
    img.drawImage(parts.outside, 0, 0);
    if (!under) img.drawImage(parts.inside, 0, 0);
    img.drawImage(sp.img, dx, dy);
    if (under) img.drawImage(parts.inside, 0, 0);
    notes.push(`${n.name}: ${n.station}, ${pl.mode} at u ${pl.u}, v ${pl.v}${cut === undefined ? '' : `, cut ${cut.toFixed(2)} over its feet`}${under ? ', behind it' : ''}`);
  });
  return { img, notes };
}

if (import.meta.main) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { s: { type: 'string', default: '8' } } });
  const [id, out] = positionals;
  if (!id || !out) {
    console.error('usage: node scripts/npc-sheet.ts <world> <out.png> [--s 8]');
    process.exit(2);
  }
  const { img, notes } = sheet(await loadWorld(id), Number(values.s));
  writeFileSync(out, encodeRgb(img, 0xf4f0e8));
  for (const n of notes) console.log(n);
  console.log(`${out}: ${img.width} x ${img.height}`);
}
