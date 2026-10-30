import type { Color, Pen } from '../types.ts';
import { alpha, mix, shade } from '../iso.ts';
import type { Look } from './look.ts';
import { hole, move, mul, turn, type Ctx, type Sketch } from './paint.ts';
import type { Prop, V } from './rig.ts';
import { SLOT_OF, toolOf } from './tools/index.ts';

// Things in hand, and the little extras a pose shows: the work poses'
// tools (a costume's own, see ./tools/), a mug, the block a builder
// carries, thought bubbles, a spark, a drop of sweat. Each draws in its
// own frame: origin at the hand (or where the rig puts it), +x pointing
// the way it is held.

const TAU = Math.PI * 2;
const WHITE = '#ffffff';

const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

export function drawProp(sk: Sketch, pr: Prop, at: V, L: Look, item: Color | null, back: boolean): void {
  sk.push(mul(move(at[0], at[1]), turn(pr.a)));
  const slot = SLOT_OF[pr.kind];
  if (slot) toolOf(L.costume, slot).draw(sk, pr.v, L, back);
  else {
    switch (pr.kind) {
      case 'mug':
        mug(sk, L, pr.v, pr.a);
        break;
      case 'block':
        cube(sk, item ?? '#8e8996', 2.0);
        break;
      case 'thought':
        thought(sk, pr.v);
        break;
      case 'spark':
        sk.draw((p) => {
          p.beginPath();
          p.arc(0, 0, 1.4, 0, TAU);
          p.fillStyle = alpha(L.color, 0.3);
          p.fill();
        });
        sk.blob((p) => starPath(p, 0, 0, 0.95, 4), mix(L.color, '#ffffff', 0.45), { line: 0.6 });
        break;
      case 'sweat':
        sk.at(move(0, 0.6 * pr.v), () => {
          sk.blob((p) => {
            p.moveTo(0, -0.75);
            p.quadraticCurveTo(0.55, 0.05, 0.45, 0.3);
            p.arc(0, 0.3, 0.45, 0, Math.PI);
            p.quadraticCurveTo(-0.55, 0.05, 0, -0.75);
            p.closePath();
          }, '#8fd3ff', { dark: '#5fb2e8', d: 0.15 });
        });
        break;
    }
  }
  sk.pop();
}

function starPath(p: Pen, x: number, y: number, r: number, points: number): void {
  for (let k = 0; k < points * 2; k++) {
    const a = (k / (points * 2)) * TAU - Math.PI / 2;
    const rr = k % 2 ? r * 0.38 : r;
    if (k === 0) p.moveTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
    else p.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  p.closePath();
}

function mug(sk: Sketch, L: Look, u: number, tilt: number): void {
  const body = '#f3ede2';
  sk.blob((p) => {
    p.arc(0.25, -0.2, 0.5, 0, TAU);
    hole(p, 0.25, -0.2, 0.24, 0.24);
  }, body, { line: 0.6 });
  sk.blob((p) => p.roundRect(0.55, -0.85, 1.25, 1.4, 0.28), body, { dark: shade(body, -0.16), d: 0.22 });
  sk.draw((p) => {
    p.fillStyle = L.color;
    p.fillRect(0.6, -0.3, 1.15, 0.32);
  });
  if (tilt > -0.2) {
    sk.draw((p, c) => {
      // steam
      p.strokeStyle = alpha(WHITE, 0.7);
      p.lineWidth = Math.max(0.22, 1 / c.px);
      p.lineCap = 'round';
      for (const [x, k] of [[0.95, 0], [1.4, 0.5]] as const) {
        const w = Math.sin((u + k) * TAU) * 0.18;
        p.beginPath();
        p.moveTo(x, -1.05);
        p.quadraticCurveTo(x + 0.25 + w, -1.45, x + w, -1.85);
        p.quadraticCurveTo(x - 0.25 + w, -2.2, x + 0.05, -2.55);
        p.stroke();
      }
    });
  }
}

// A block in the scene's projection, `c` units to a side's half: top face
// lifted, the face toward the light at base, the other dropped.
export function cube(sk: Sketch, base: Color, c: number): void {
  const top = shade(base, 0.12);
  const dark = shade(base, -0.2);
  const sil = (p: Pen, k: Ctx) => {
    p.beginPath();
    p.moveTo(0, -2 * c);
    p.lineTo(c, -1.5 * c);
    p.lineTo(c, -0.5 * c);
    p.lineTo(0, 0);
    p.lineTo(-c, -0.5 * c);
    p.lineTo(-c, -1.5 * c);
    p.closePath();
    p.lineJoin = 'round';
    p.lineWidth = 2 * (k.line / 0.6);
    p.stroke();
  };
  sk.at(move(0, c), () => {
    sk.draw((p, k) => {
      const litLeft = k.lx < 0;
      const face = (pts: number[], fill: Color) => {
        p.beginPath();
        p.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
        p.closePath();
        p.fillStyle = fill;
        p.fill();
      };
      face([0, -c, 0, 0, -c, -0.5 * c, -c, -1.5 * c], litLeft ? base : dark);
      face([0, -c, c, -1.5 * c, c, -0.5 * c, 0, 0], litLeft ? dark : base);
      face([0, -2 * c, c, -1.5 * c, 0, -c, -c, -1.5 * c], top);
      // highlight along the top's front edges
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.beginPath();
      p.moveTo(-c * 0.75, -1.45 * c);
      p.lineTo(0, -1.08 * c);
      p.lineTo(c * 0.75, -1.45 * c);
      p.strokeStyle = mix(top, '#fffdf4', 0.5);
      p.lineWidth = Math.max(0.2, k.line * 0.9);
      p.stroke();
      p.beginPath();
      p.moveTo(-c, -1.5 * c);
      p.lineTo(0, -c);
      p.lineTo(c, -1.5 * c);
      p.moveTo(0, -c);
      p.lineTo(0, 0);
      p.strokeStyle = k.ink;
      p.lineWidth = k.line;
      p.stroke();
      p.beginPath();
      p.moveTo(0, -2 * c);
      p.lineTo(c, -1.5 * c);
      p.lineTo(c, -0.5 * c);
      p.lineTo(0, 0);
      p.lineTo(-c, -0.5 * c);
      p.lineTo(-c, -1.5 * c);
      p.closePath();
      p.stroke();
    }, sil);
  });
}

// Three bubbles rising beside the head, one more every third of the loop.
function thought(sk: Sketch, u: number): void {
  const n = 1 + Math.floor(u * 3);
  const bubbles: Array<[number, number, number]> = [[0, 0, 0.32], [0.75, -1.05, 0.5], [1.8, -2.25, 0.85]];
  for (let k = 0; k < n; k++) {
    const [x, y, r] = bubbles[k];
    sk.blob(circ(x, y, r), '#ffffff', { dark: '#dfe6f2', d: r * 0.25 });
  }
}
