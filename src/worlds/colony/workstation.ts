import { shade } from '../../art/iso.ts';
import { DESK } from '../../world/desks.ts';
import type { PropView, WorkstationArt } from '../types.ts';
import { ball, oilLamp, sprout } from './bits.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, kitOf, withAlpha } from './kit.ts';

// Frontier Colony's workstation (see WorkstationArt in ../types.ts): a plank work table.
// Drawn once a scale, frame, look and screen, and kept: it never looks
// at v.t; v.active (its screen on) may light it; v.seed (0, 1 or 2)
// picks one of its three looks. The shared activity layer paints over
// `screen`; a desk upgrade stands at `top`.
//
// Three planks on a pair of trestles, a stretcher between them. At the
// right back a slate in a wooden frame leans on a little easel, a stick
// of chalk on its ledge; at the front left an oil lamp, lit while the
// screen is on; a tin mug and a pencil on a sheet of paper before the
// slate; at the front right corner a jar of wildflowers, a bundle of
// plain seed packets or a whittled bird, by look.

const ZT = 5.4; // the table's top
// The slate, leaning back on its easel: its foot at v0, its head at v1.
const SLATE = { u0: 2.95, u1: 6.0, v0: 1.45, v1: 0.95, z0: 6.9, z1: 9.5 };

// A point on the slate's plane: fu across from its left edge, fz up from
// its foot (outside 0..1 for its frame).
function onSlate(fu: number, fz: number): P3 {
  const s = SLATE;
  return [s.u0 + (s.u1 - s.u0) * fu, s.v0 + (s.v1 - s.v0) * fz, s.z0 + (s.z1 - s.z0) * fz];
}

export const WORKSTATION: WorkstationArt = {
  len: DESK.len,
  dep: DESK.dep,
  height: 10,
  draw(v: PropView): void {
    const k = kitOf(v);
    const look = ((v.seed % 3) + 3) % 3;
    k.shadow(DESK.len / 2, DESK.dep / 2, DESK.len / 2 + 0.4, DESK.dep / 2 + 0.4, 0.28);
    // the trestles: two splayed legs and a cross beam each, a stretcher
    // between them low down
    k.box(0.85, 1.3, 1.1, 5.3, 0.4, 0.4, C.plankDark, { line: k.thin, stripe: false });
    for (const u of [0.75, 6.25]) {
      k.rod([[u, 0.75, ZT - 0.6], [u, 0.2, 0.05]], C.plankDark, 0.36);
      k.rod([[u, 2.25, ZT - 0.6], [u, 2.8, 0.05]], C.plankDark, 0.36);
      k.box(u - 0.3, 0.15, ZT - 1.05, 0.6, 2.7, 0.55, C.plank, { line: k.thin, stripe: false });
    }
    // the top: three planks, nail heads at their ends
    for (let i = 0; i < 3; i++) k.box(0, i, ZT - 0.5, DESK.len, 1, 0.5, i === 1 ? shade(C.plankLight, -0.06) : C.plankLight, { stripe: i === 2 });
    if (k.fine) {
      const nails: Array<[P3, P3]> = [];
      for (const u of [0.75, 6.25]) for (const w of [0.5, 1.5, 2.5]) nails.push([[u - 0.06, w, ZT + 0.01], [u + 0.06, w, ZT + 0.01]]);
      k.segs(nails, INK, Math.max(1, 0.16 * k.s), 'round');
      // the grain, a line or two down each plank
      const grain: Array<[P3, P3]> = [[[0.4, 0.45, ZT + 0.01], [2.6, 0.5, ZT + 0.01]], [[3.4, 1.55, ZT + 0.01], [6.3, 1.5, ZT + 0.01]], [[1.1, 2.6, ZT + 0.01], [3.2, 2.55, ZT + 0.01]]];
      k.segs(grain, withAlpha(INK, 0.3), Math.max(0.6, 0.07 * k.s), 'round');
    }
    // the easel: a back leg, the frame leaning on it, two short front legs
    // under the ledge and a stick of chalk on it
    k.rod([[4.48, 0.2, ZT], [4.48, 0.85, SLATE.z1 + 0.2]], C.plankDark, 0.22);
    slate(k);
    for (const u of [SLATE.u0 + 0.1, SLATE.u1 - 0.1]) k.rod([[u, SLATE.v0 + 0.25, ZT], [u, SLATE.v0 + 0.15, SLATE.z0 - 0.42]], C.plankDark, 0.2);
    k.box(SLATE.u0 - 0.35, SLATE.v0, SLATE.z0 - 0.42, SLATE.u1 - SLATE.u0 + 0.7, 0.4, 0.2, C.plankLight, { line: k.thin, stripe: false });
    k.box(3.3, SLATE.v0 + 0.1, SLATE.z0 - 0.22, 0.6, 0.18, 0.14, C.white, { line: k.thin * 0.8, stripe: false });
    // a sheet of paper and a pencil on it, the tin mug
    k.poly([[3.9, 2.0, ZT + 0.02], [5.5, 1.9, ZT + 0.02], [5.6, 2.85, ZT + 0.02], [4.0, 2.9, ZT + 0.02]], C.paper, k.thin);
    if (k.fine) k.segs([0, 1, 2].map((i): [P3, P3] => [[4.15, 2.15 + i * 0.22, ZT + 0.03], [4.9 + (i % 2) * 0.35, 2.12 + i * 0.22, ZT + 0.03]]), '#8a8f9a', Math.max(0.6, 0.06 * k.s));
    k.rod([[4.4, 2.75, ZT + 0.1], [5.6, 2.35, ZT + 0.1]], '#e8c040', 0.12);
    k.line([[5.6, 2.35, ZT + 0.1], [5.8, 2.28, ZT + 0.1]], INK, Math.max(1, 0.12 * k.s));
    k.cyl(3.2, 2.35, ZT, 0.36, 0.75, C.steel, { top: shade(C.steelDark, -0.1) });
    k.rod([[2.86, 2.35, ZT + 0.6], [2.62, 2.4, ZT + 0.42], [2.86, 2.35, ZT + 0.2]], C.steel, 0.08);
    // this look's keepsake at the front right corner
    if (look === 0) {
      // a jar of wildflowers
      k.cyl(6.35, 2.35, ZT, 0.36, 0.85, '#cfe6e0', { top: '#9ac8c0' });
      sprout(k, 6.35, 2.35, ZT + 0.8, 0.9, 7);
      for (const [du, dz, c] of [[-0.3, 1.55, C.white], [0.05, 1.75, '#e8c040'], [0.3, 1.45, '#d06a9a']] as const) ball(k, 6.35 + du, 2.35, ZT + dz, 0.2, c, k.thin);
    } else if (look === 1) {
      // a bundle of plain seed packets standing in a row, tied with string,
      // a patch of colour on each for what grows from it
      const packs = [[C.canvas, C.cloth], ['#e8d27a', C.green], [C.paper, '#7a4a6a']] as const;
      packs.forEach(([paper, patch], i) => {
        const u = 5.65 + i * 0.4;
        const w = 2.1 + i * 0.14;
        k.box(u, w, ZT, 0.85, 0.14, 1.2 - i * 0.1, paper, { line: k.thin, stripe: false });
        k.rect(u + 0.15, ZT + 0.4, u + 0.7, ZT + 0.9 - i * 0.1, w + 0.15, patch, 0);
      });
      k.line([[5.6, 2.55, ZT + 0.3], [6.95, 2.55, ZT + 0.3]], C.cloth, Math.max(0.8, 0.1 * k.s));
    } else {
      // a whittled bird on a little block: a plump body, a round head
      // turned toward the slate, a beak and its tail cocked up
      k.box(5.85, 2.0, ZT, 0.95, 0.7, 0.3, C.plankDark, { line: k.thin, stripe: false });
      bird(k, 6.3, 2.35, ZT + 0.3);
    }
    // the oil lamp at the front left, lit while the screen is on
    oilLamp(k, 0.9, 2.1, ZT, v.active ? 1 : 0, 1.05);
  },
  screen: [onSlate(0, 0), onSlate(1, 0), onSlate(1, 1), onSlate(0, 1)],
  top: [1.1, 0.9, ZT],
};

// A little carved bird standing on (u, v, z), facing -u, about a unit
// tall: drawn flat to the screen, so it reads the same in either frame.
function bird(k: Kit, u: number, v: number, z: number): void {
  const wood = '#dcb47e';
  const [x0] = k.p(0, 0, 0);
  const d = k.p(1, 0, 0)[0] > x0 ? -1 : 1; // which way -u lies on the screen
  const [cx, cy] = k.p(u, v, z + 0.52);
  const s = k.s * 1.25;
  const pen = k.pen;
  const shape = (pts: ReadonlyArray<readonly [number, number]>, fill: string, line: number) => {
    pen.beginPath();
    pts.forEach(([x, y], i) => (i ? pen.lineTo(cx + d * x * s, cy + y * s) : pen.moveTo(cx + d * x * s, cy + y * s)));
    pen.closePath();
    k.paint(fill, line);
  };
  // the tail, then the body, the head and its beak over it
  shape([[-0.25, -0.05], [-0.95, -0.55], [-1.0, -0.35], [-0.4, 0.2]], shade(wood, -0.15), k.lw);
  pen.beginPath();
  pen.ellipse(cx, cy, 0.62 * s, 0.42 * s, 0, 0, Math.PI * 2);
  k.paint(wood, k.lw);
  pen.beginPath();
  pen.arc(cx + d * 0.42 * s, cy - 0.45 * s, 0.3 * s, 0, Math.PI * 2);
  k.paint(wood, k.lw);
  shape([[0.66, -0.52], [0.98, -0.44], [0.68, -0.36]], '#e8a040', k.thin);
  pen.beginPath();
  pen.arc(cx + d * 0.48 * s, cy - 0.5 * s, Math.max(0.7, 0.06 * s), 0, Math.PI * 2);
  k.paint(INK, 0);
  if (k.fine) {
    // a carved wing
    pen.beginPath();
    pen.moveTo(cx - d * 0.25 * s, cy - 0.1 * s);
    pen.quadraticCurveTo(cx + d * 0.05 * s, cy + 0.2 * s, cx + d * 0.3 * s, cy - 0.02 * s);
    pen.strokeStyle = shade(wood, -0.35);
    pen.lineWidth = Math.max(0.6, 0.06 * s);
    pen.stroke();
  }
}

// The slate's wooden frame, a board thick, leaning back on the easel (the
// shared layer paints the slate itself over `screen`).
function slate(k: Kit): void {
  const mu = 0.4 / (SLATE.u1 - SLATE.u0); // the frame's width, as shares of the slate
  const mz = 0.38 / (SLATE.z1 - SLATE.z0);
  const wood = shade(C.plankLight, 0.12);
  const fr = [onSlate(-mu, -mz), onSlate(1 + mu, -mz), onSlate(1 + mu, 1 + mz), onSlate(-mu, 1 + mz)];
  const back = fr.map(([u, w, z]): P3 => [u, w - 0.18, z]);
  // its thickness: the top and the right end
  k.poly([fr[3], fr[2], back[2], back[3]], shade(wood, 0.1), k.thin);
  k.poly([fr[1], back[1], back[2], fr[2]], k.side(wood, 1, 0, 0.2), k.thin);
  k.poly(fr, wood, k.lw);
  k.poly([onSlate(0, 0), onSlate(1, 0), onSlate(1, 1), onSlate(0, 1)], '#3a423c', 0);
}
