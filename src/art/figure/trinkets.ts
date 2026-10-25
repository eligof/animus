import { MUG_TOP, type Trinket } from '../../world/frame.ts';
import { alpha, shade } from '../iso.ts';
import type { Color, Pen } from '../types.ts';
import { GOLD, WHITE } from './look.ts';
import type { Sketch } from './paint.ts';

// A level's desk upgrade (★5), standing on the floor by its owner's
// favourite station, (0, 0) at its foot, 4 to 6 units tall: a potted plant
// with a band in its owner's colour, a mug of its colour on a stool (the
// stage sends steam up off it, see MUG_TOP), a gold trophy on a plinth
// with a plate of its colour.

const TAU = Math.PI * 2;

export function drawTrinket(sk: Sketch, kind: Trinket, color: Color): void {
  if (kind === 'plant') plant(sk, color);
  else if (kind === 'mug') mug(sk, color);
  else trophy(sk, color);
}

function plant(sk: Sketch, color: Color): void {
  const green = '#4caf62';
  const leaf = (a: number, len: number, w: number) => (p: Pen) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const tx = s * len;
    const ty = -2.3 - c * len;
    p.moveTo(0, -2.3);
    p.quadraticCurveTo(s * len * 0.5 + c * w, -2.3 - c * len * 0.5 + s * w, tx, ty);
    p.quadraticCurveTo(s * len * 0.5 - c * w, -2.3 - c * len * 0.5 - s * w, 0, -2.3);
    p.closePath();
  };
  for (const [a, len] of [[-1.0, 2.6], [1.05, 2.5], [-0.35, 3.4], [0.4, 3.2]] as const) sk.blob(leaf(a, len, 0.95), green, { dark: shade(green, -0.25), d: 0.3 });
  const pot = (p: Pen) => {
    p.moveTo(-1.1, 0);
    p.lineTo(1.1, 0);
    p.lineTo(1.4, -2.0);
    p.lineTo(-1.4, -2.0);
    p.closePath();
  };
  const clay = '#c8693e';
  sk.blob(pot, clay, { dark: shade(clay, -0.22), d: 0.35 });
  sk.draw((p) => {
    p.save();
    p.beginPath();
    pot(p);
    p.clip();
    p.fillStyle = color;
    p.fillRect(-2, -1.35, 4, 0.5);
    p.restore();
  });
  sk.blob((p) => p.roundRect(-1.6, -2.45, 3.2, 0.6, 0.25), shade(clay, 0.08), { dark: shade(clay, -0.15), d: 0.15 });
}

function mug(sk: Sketch, color: Color): void {
  const wood = '#a8743f';
  for (const x of [-1.2, 1.2]) sk.limb([x, -1.9, x * 1.1, 0], 0.45, shade(wood, -0.15), { line: 0.6 });
  sk.blob((p) => p.roundRect(-1.7, -2.3, 3.4, 0.6, 0.25), wood, { dark: shade(wood, -0.22), d: 0.2 });
  sk.limb([0.75, -3.25, 1.35, -3.0, 0.75, -2.55], 0.3, color, { line: 0.6 });
  sk.blob((p) => p.roundRect(-0.8, -MUG_TOP, 1.6, 1.45, 0.3), color, { dark: shade(color, -0.22), d: 0.25 });
  sk.draw((p) => {
    p.beginPath();
    p.ellipse(0, -MUG_TOP + 0.12, 0.62, 0.17, 0, 0, TAU);
    p.fillStyle = '#5b3a24';
    p.fill();
  });
}

function trophy(sk: Sketch, color: Color): void {
  const dark = '#4a3f52';
  sk.blob((p) => p.roundRect(-1.35, -1.05, 2.7, 1.05, 0.2), dark, { dark: shade(dark, -0.2), d: 0.2 });
  sk.draw((p) => {
    p.fillStyle = color;
    p.fillRect(-0.6, -0.75, 1.2, 0.45);
  });
  sk.limb([0, -1.05, 0, -2.3], 0.5, GOLD, { dark: shade(GOLD, -0.2), line: 0.6 });
  sk.blob((p) => p.ellipse(0, -1.15, 0.8, 0.25, 0, 0, TAU), GOLD, { dark: shade(GOLD, -0.2), d: 0.1 });
  for (const s of [-1, 1]) sk.limb([s * 1.05, -4.3, s * 1.55, -3.85, s * 0.85, -3.2], 0.28, GOLD, { line: 0.6 });
  const cup = (p: Pen) => {
    p.moveTo(-1.2, -4.75);
    p.lineTo(1.2, -4.75);
    p.quadraticCurveTo(1.15, -2.55, 0, -2.35);
    p.quadraticCurveTo(-1.15, -2.55, -1.2, -4.75);
    p.closePath();
  };
  sk.blob(cup, GOLD, { dark: shade(GOLD, -0.22), d: 0.4 });
  sk.draw((p) => {
    p.beginPath();
    p.ellipse(0, -4.75, 1.2, 0.28, 0, 0, TAU);
    p.fillStyle = shade(GOLD, -0.4);
    p.fill();
    // a glint
    p.beginPath();
    p.ellipse(-0.55, -3.9, 0.16, 0.5, 0.2, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.8);
    p.fill();
  });
}
