import type { Color, Pen } from '../types.ts';
import { alpha, mix, shade } from '../iso.ts';
import type { Look } from './look.ts';
import { hole, move, mul, turn, zoom, type Ctx, type Sketch } from './paint.ts';
import type { Prop, V } from './rig.ts';

// Things in hand, and the little extras a pose shows: a book, a notepad
// and pencil, a magnifying glass, a tablet, a mallet, a mug, the block a
// builder carries, thought bubbles, a spark, a drop of sweat. Each draws
// in its own frame: origin at the hand (or where the rig puts it), +x
// pointing the way it is held.

const TAU = Math.PI * 2;
const WHITE = '#ffffff';
const PAGE = '#fbf4e4';
const PAGE_D = '#e3d6bd';
const COVER = '#a3543f';
const WOOD = '#b07a48';
const WOOD_D = '#875a33';
const METAL = '#9aa3b2';
const METAL_D = '#727b8b';
const BRASS = '#d4a94c';
const SCREEN = '#a8e8ff';
const SLATE = '#2c3140';

const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

export function drawProp(sk: Sketch, pr: Prop, at: V, L: Look, item: Color | null): void {
  sk.push(mul(move(at[0], at[1]), turn(pr.a)));
  switch (pr.kind) {
    case 'book':
      sk.at(zoom(1.15), () => book(sk, pr.v));
      break;
    case 'notepad':
      sk.blob((p) => p.roundRect(-0.85, -1.05, 1.7, 2.1, 0.22), PAGE, { dark: PAGE_D, d: 0.2 });
      sk.draw((p, c) => {
        p.strokeStyle = alpha(c.ink, 0.45);
        p.lineWidth = Math.max(c.line * 0.6, 0.6 / c.px);
        p.beginPath();
        for (const y of [-0.3, 0.15, 0.6]) {
          p.moveTo(-0.55, y);
          p.lineTo(0.55, y);
        }
        p.stroke();
        p.fillStyle = c.ink;
        for (const x of [-0.5, 0, 0.5]) {
          p.beginPath();
          p.arc(x, -1.05, 0.14, 0, TAU);
          p.fill();
        }
      });
      break;
    case 'pencil':
      sk.limb([0, 0, 1.55, 0], 0.34, '#f6c544', { line: 0.5 });
      sk.limb([1.55, 0, 1.95, 0], 0.2, '#3a3040', { line: 0.4 });
      sk.limb([-0.25, 0, 0, 0], 0.36, '#ff8fa8', { line: 0.5 });
      break;
    case 'magnifier':
      sk.limb([-0.3, 0, 1.0, 0], 0.42, '#7a4a2c', { line: 0.6 });
      sk.blob((p) => {
        p.arc(2.05, 0, 1.05, 0, TAU);
        hole(p, 2.05, 0, 0.72, 0.72);
      }, BRASS, { dark: shade(BRASS, -0.2), d: 0.18 });
      sk.draw((p, c) => {
        p.beginPath();
        p.arc(2.05, 0, 0.72, 0, TAU);
        p.fillStyle = alpha('#d6f2ff', 0.45);
        p.fill();
        p.beginPath();
        p.arc(2.05, 0, 0.5, Math.PI * 1.05, Math.PI * 1.5);
        p.strokeStyle = alpha(WHITE, 0.9);
        p.lineWidth = Math.max(0.2, 1 / c.px);
        p.lineCap = 'round';
        p.stroke();
      });
      break;
    case 'tablet': {
      sk.blob((p) => p.roundRect(-1.35, -1.0, 2.7, 2.0, 0.32), SLATE, { line: 0.6 });
      const page = pr.v % 2;
      sk.draw((p, c) => {
        p.beginPath();
        p.arc(0, 0, 2.6, 0, TAU);
        p.fillStyle = alpha(SCREEN, 0.16);
        p.fill();
        p.beginPath();
        p.roundRect(-1.08, -0.75, 2.16, 1.5, 0.14);
        p.fillStyle = SCREEN;
        p.fill();
        if (c.px < 4.5) return;
        p.fillStyle = page ? L.color : '#ff9f6b';
        p.fillRect(-0.9, -0.58, 0.8, 0.55);
        p.fillStyle = alpha(SLATE, 0.45);
        p.fillRect(0.05, -0.55, 0.85, 0.14);
        p.fillRect(0.05, -0.3, 0.6, 0.14);
        p.fillRect(-0.9, 0.12, 1.8, 0.14);
        p.fillRect(-0.9, 0.38, 1.3, 0.14);
      });
      break;
    }
    case 'mallet':
      sk.limb([-0.45, 0, 2.3, 0], 0.42, WOOD, { dark: WOOD_D, line: 0.6 });
      sk.blob((p) => p.roundRect(2.05, -0.82, 1.15, 1.64, 0.3), METAL, { dark: METAL_D, d: 0.25 });
      if (pr.v) {
        sk.draw((p, c) => {
          p.strokeStyle = c.ink;
          p.lineWidth = Math.max(c.line, 1 / c.px);
          p.lineCap = 'round';
          p.beginPath();
          for (const a of [-0.9, 0, 0.9]) {
            const dx = Math.cos(a);
            const dy = Math.sin(a);
            p.moveTo(3.55 + dx * 0.3, dy * 1.2);
            p.lineTo(3.55 + dx * 1.0, dy * 1.9);
          }
          p.stroke();
        });
      }
      break;
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

// An open book, pages toward the viewer; `turn` (0..1) flips a page over
// from right to left.
function book(sk: Sketch, flip: number): void {
  sk.blob((p) => {
    p.moveTo(-1.75, -0.95);
    p.quadraticCurveTo(-0.85, -1.3, 0, -1.0);
    p.quadraticCurveTo(0.85, -1.3, 1.75, -0.95);
    p.lineTo(1.75, 1.05);
    p.quadraticCurveTo(0.85, 0.75, 0, 1.1);
    p.quadraticCurveTo(-0.85, 0.75, -1.75, 1.05);
    p.closePath();
  }, COVER, { dark: shade(COVER, -0.2), d: 0.2 });
  for (const s of [-1, 1]) {
    sk.blob((p) => {
      p.moveTo(0, -0.88);
      p.quadraticCurveTo(s * 0.75, -1.12, s * 1.55, -0.88);
      p.lineTo(s * 1.55, 0.85);
      p.quadraticCurveTo(s * 0.75, 0.62, 0, 0.92);
      p.closePath();
    }, PAGE, { dark: s > 0 ? PAGE_D : null, d: 0.25, sil: false });
  }
  sk.draw((p, c) => {
    if (c.px < 5) return;
    p.strokeStyle = alpha(c.ink, 0.35);
    p.lineWidth = Math.max(c.line * 0.5, 0.5 / c.px);
    p.beginPath();
    for (const s of [-1, 1]) {
      for (const y of [-0.45, -0.05, 0.35]) {
        p.moveTo(s * 0.3, y - 0.05);
        p.quadraticCurveTo(s * 0.75, y - 0.18, s * 1.25, y - 0.05);
      }
    }
    p.stroke();
  });
  if (flip > 0 && flip < 1) {
    const ex = 1.55 * Math.cos(Math.PI * flip);
    const lift = 0.5 * Math.sin(Math.PI * flip);
    sk.blob((p) => {
      p.moveTo(0, -0.88);
      p.lineTo(ex, -0.88 - lift);
      p.lineTo(ex, 0.85 - lift);
      p.lineTo(0, 0.92);
      p.closePath();
    }, mix(PAGE, WHITE, 0.4), { line: 0.6, sil: false });
  }
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
