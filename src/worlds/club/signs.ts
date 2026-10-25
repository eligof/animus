import type { Color } from '../../art/types.ts';
import type { Kit, P3 } from './kit.ts';
import { C, INK, withAlpha } from './kit.ts';

// Neon signs without a word on them: pictures bent in glass tube (a
// martini, notes, a bolt, a heart, a star, a moon, lips, a palm, an eye, a
// record, the club's cat, a smiley). Each is strokes in a unit box
// (x along the wall, y up, both -1..1) in its first or second colour.

type Pt2 = [number, number];
type Stroke = { pts: Pt2[]; c: 0 | 1; closed?: boolean };
export type Shape = { colors: readonly [Color, Color]; strokes: Stroke[] };

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 16): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

const circle = (cx: number, cy: number, r: number, n = 18): Pt2[] => arc(cx, cy, r, r, 0, Math.PI * 2, n);

function star(cx: number, cy: number, r0: number, r1: number, n = 5, rot = Math.PI / 2): Pt2[] {
  const out: Pt2[] = [];
  for (let i = 0; i <= n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const r = i % 2 ? r1 : r0;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return out;
}

const heart = (): Pt2[] => {
  const out: Pt2[] = [];
  for (let i = 0; i <= 28; i++) {
    const t = (i / 28) * Math.PI * 2;
    const x = 16 * Math.sin(t) ** 3;
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    out.push([x / 17, (y + 2.5) / 16]);
  }
  return out;
};

export const SHAPES: readonly Shape[] = [
  // a martini with an olive on a pick
  {
    colors: [C.pink, C.lime],
    strokes: [
      { pts: [[-0.85, 0.8], [0.85, 0.8], [0, -0.05]], c: 0, closed: true },
      { pts: [[0, -0.05], [0, -0.78]], c: 0 },
      { pts: [[-0.45, -0.82], [0.45, -0.82]], c: 0 },
      { pts: circle(0.2, 0.5, 0.15, 10), c: 1 },
      { pts: [[-0.1, 0.25], [0.55, 1.0]], c: 1 },
    ],
  },
  // two beamed notes
  {
    colors: [C.cyan, C.violet],
    strokes: [
      { pts: arc(-0.55, -0.62, 0.3, 0.22, 0, Math.PI * 2, 14), c: 0, closed: true },
      { pts: arc(0.5, -0.42, 0.3, 0.22, 0, Math.PI * 2, 14), c: 0, closed: true },
      { pts: [[-0.27, -0.58], [-0.27, 0.62]], c: 0 },
      { pts: [[0.78, -0.38], [0.78, 0.84]], c: 0 },
      { pts: [[-0.27, 0.62], [0.78, 0.84]], c: 1 },
      { pts: [[-0.27, 0.38], [0.78, 0.6]], c: 1 },
    ],
  },
  // a bolt
  {
    colors: [C.amber, C.pink],
    strokes: [
      { pts: [[0.2, 1], [-0.6, -0.08], [-0.05, -0.08], [-0.3, -1], [0.6, 0.18], [0.05, 0.18]], c: 0, closed: true },
      { pts: star(0.72, 0.78, 0.2, 0.08, 4, 0), c: 1, closed: true },
    ],
  },
  // a heart with a smaller one inside
  {
    colors: [C.hot, C.pink],
    strokes: [
      { pts: heart(), c: 0, closed: true },
      { pts: heart().map(([x, y]) => [x * 0.5, y * 0.5 + 0.06] as Pt2), c: 1, closed: true },
    ],
  },
  // a star with a tail of sparks
  {
    colors: [C.violet, C.cyan],
    strokes: [
      { pts: star(0.2, 0.15, 0.85, 0.36), c: 0, closed: true },
      { pts: [[-0.6, -0.6], [-0.95, -0.95]], c: 1 },
      { pts: [[-0.45, -0.75], [-0.62, -1.0]], c: 1 },
      { pts: [[-0.75, -0.45], [-1.0, -0.62]], c: 1 },
    ],
  },
  // a crescent moon and a star
  {
    colors: [C.cyan, C.amber],
    strokes: [
      { pts: [...arc(0, 0, 0.9, 0.9, Math.PI * 0.35, Math.PI * 1.65, 18), ...arc(0.32, 0, 0.66, 0.72, Math.PI * 1.55, Math.PI * 0.45, 16)], c: 0, closed: true },
      { pts: star(0.62, 0.5, 0.28, 0.11), c: 1, closed: true },
    ],
  },
  // lips
  {
    colors: [C.hot, C.white],
    strokes: [
      { pts: [[-1, 0.05], [-0.55, 0.45], [-0.18, 0.3], [0, 0.42], [0.18, 0.3], [0.55, 0.45], [1, 0.05], [0.55, -0.4], [0, -0.52], [-0.55, -0.4]], c: 0, closed: true },
      { pts: [[-0.9, 0.05], [-0.4, 0.0], [0, 0.08], [0.4, 0.0], [0.9, 0.05]], c: 1 },
    ],
  },
  // a palm on an island
  {
    colors: [C.lime, C.pink],
    strokes: [
      { pts: [[-0.1, -0.85], [0.0, -0.3], [0.08, 0.2], [0.05, 0.55]], c: 1 },
      { pts: [[0.05, 0.55], [-0.35, 0.8], [-0.85, 0.6]], c: 0 },
      { pts: [[0.05, 0.55], [0.45, 0.85], [0.9, 0.62]], c: 0 },
      { pts: [[0.05, 0.55], [-0.4, 0.35], [-0.7, -0.05]], c: 0 },
      { pts: [[0.05, 0.55], [0.5, 0.35], [0.75, -0.05]], c: 0 },
      { pts: arc(0, -0.95, 0.8, 0.25, Math.PI, 0, 10), c: 1 },
    ],
  },
  // an eye
  {
    colors: [C.violet, C.cyan],
    strokes: [
      { pts: [...arc(0, -0.75, 1.2, 1.15, Math.PI * 0.21, Math.PI * 0.79, 12), ...arc(0, 0.75, 1.2, 1.15, Math.PI * 1.21, Math.PI * 1.79, 12)], c: 0, closed: true },
      { pts: circle(0, 0, 0.36, 14), c: 1, closed: true },
      { pts: circle(0, 0, 0.1, 8), c: 1, closed: true },
      { pts: [[-0.55, 0.62], [-0.68, 0.85]], c: 0 },
      { pts: [[0, 0.72], [0, 0.98]], c: 0 },
      { pts: [[0.55, 0.62], [0.68, 0.85]], c: 0 },
    ],
  },
  // a record
  {
    colors: [C.pink, C.amber],
    strokes: [
      { pts: circle(0, 0, 0.92, 24), c: 0, closed: true },
      { pts: arc(0, 0, 0.66, 0.66, Math.PI * 0.15, Math.PI * 0.85, 10), c: 0 },
      { pts: arc(0, 0, 0.66, 0.66, Math.PI * 1.15, Math.PI * 1.6, 8), c: 0 },
      { pts: circle(0, 0, 0.3, 12), c: 1, closed: true },
    ],
  },
  // the club's cat
  {
    colors: [C.lime, C.pink],
    strokes: [
      { pts: [[-0.75, 0.15], [-0.7, 0.95], [-0.3, 0.55], [0.3, 0.55], [0.7, 0.95], [0.75, 0.15], [0.6, -0.45], [0, -0.75], [-0.6, -0.45]], c: 0, closed: true },
      { pts: arc(-0.3, 0.05, 0.14, 0.2, 0, Math.PI * 2, 10), c: 1, closed: true },
      { pts: arc(0.3, 0.05, 0.14, 0.2, 0, Math.PI * 2, 10), c: 1, closed: true },
      { pts: [[-0.12, -0.25], [0, -0.35], [0.12, -0.25]], c: 1 },
      { pts: [[-0.4, -0.3], [-1.0, -0.2]], c: 0 },
      { pts: [[0.4, -0.3], [1.0, -0.2]], c: 0 },
    ],
  },
  // a smiley
  {
    colors: [C.amber, C.lime],
    strokes: [
      { pts: circle(0, 0, 0.92, 24), c: 0, closed: true },
      { pts: [[-0.3, 0.2], [-0.3, 0.42]], c: 1 },
      { pts: [[0.3, 0.2], [0.3, 0.42]], c: 1 },
      { pts: arc(0, 0.05, 0.55, 0.5, Math.PI * 1.15, Math.PI * 1.85, 10), c: 1 },
    ],
  },
];

// Sign `i` on the plane v = n centred on (a, z), r units from the middle
// to its edge. `on` lights it; `only` draws just strokes of one colour
// (a tube that flickers, drawn again over the sign).
export function sign(k: Kit, i: number, a: number, n: number, z: number, r: number, on = true, only?: 0 | 1): void {
  const sh = SHAPES[((i % SHAPES.length) + SHAPES.length) % SHAPES.length];
  const w = Math.max(0.26, r * 0.075);
  const pts = (st: Stroke, dz = 0, dn = 0): P3[] => {
    const out: P3[] = st.pts.map(([x, y]) => [a + x * r, n + dn, z + y * r + dz]);
    if (st.closed) out.push(out[0]);
    return out;
  };
  // the tubes' shadow on the wall behind, then the glass
  if (only === undefined) {
    for (const st of sh.strokes) k.line(pts(st, -w * 0.9, -n + 0.02), withAlpha(INK, 0.5), Math.max(1.2, w * k.s));
  }
  for (const st of sh.strokes) {
    if (only !== undefined && st.c !== only) continue;
    k.neon(pts(st), sh.colors[st.c], w, on ? 1 : 0);
  }
}

// The colour a sign throws on what is round it.
export function signColor(i: number): Color {
  return SHAPES[((i % SHAPES.length) + SHAPES.length) % SHAPES.length].colors[0];
}
