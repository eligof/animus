import type { CritterFrame } from '../../world/frame.ts';
import type { Color, Pen } from '../types.ts';
import { alpha, hexOf, mix, shade } from '../iso.ts';
import { move, mul, turn, Sketch, type Ctx } from './paint.ts';

// The room's critter, facing +x (the sprite flips for screen-left), its
// anchor on the floor under its middle: a cat, a rat, a hovering drone, a
// slime, a fox, a flapping imp, a sand beetle, a fluffy hopper or a husky.
// Idle loops breathe, swish and blink; moving ones trot, hop, scuttle or
// buzz.

const TAU = Math.PI * 2;
const IDLE: readonly [number, number] = [2.4, 8];
const MOVE: readonly [number, number] = [0.4, 4];
const WHITE = '#ffffff';
const EYE = '#1d1822';

const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);

export function critterArt(c: CritterFrame, t: number): { key: string; draw: () => Sketch } {
  const [per, n] = c.moving ? MOVE : IDLE;
  const i = Math.floor(((((t / per) % 1) + 1) % 1) * n);
  const u = i / n;
  const blink = !c.moving && i === 5;
  return {
    key: `${c.moving ? 'm' : 'i'}${i}`,
    draw: () => {
      const sk = new Sketch();
      const b = hexOf(c.body);
      const f = { b, bd: shade(b, -0.22), u, i, moving: c.moving, blink };
      switch (c.kind) {
        case 'cat':
          cat(sk, f, false);
          break;
        case 'fox':
          cat(sk, f, true);
          break;
        case 'rat':
          rat(sk, f);
          break;
        case 'drone':
          drone(sk, f);
          break;
        case 'slime':
          slime(sk, f);
          break;
        case 'imp':
          imp(sk, f);
          break;
        case 'beetle':
          beetle(sk, f);
          break;
        case 'hopper':
          hopper(sk, f);
          break;
        case 'husky':
          husky(sk, f);
          break;
      }
      return sk;
    },
  };
}

type F = { b: Color; bd: Color; u: number; i: number; moving: boolean; blink: boolean };

function eyeDot(x: number, y: number, r: number, blink: boolean) {
  return (p: Pen, c: Ctx) => {
    if (blink) {
      p.beginPath();
      p.moveTo(x - r, y);
      p.quadraticCurveTo(x, y + r * 0.8, x + r, y);
      p.strokeStyle = c.ink;
      p.lineWidth = Math.max(c.line, 1 / c.px);
      p.lineCap = 'round';
      p.stroke();
      return;
    }
    p.beginPath();
    p.ellipse(x, y, r * 0.85, r, 0, 0, TAU);
    p.fillStyle = EYE;
    p.fill();
    p.beginPath();
    p.arc(x + c.lx * r * 0.35, y + c.ly * r * 0.4, Math.max(r * 0.38, 0.5 / c.px), 0, TAU);
    p.fillStyle = WHITE;
    p.fill();
  };
}

// A cat (or, `fox`, a fox: pointed snout, bushy white-tipped tail).
function cat(sk: Sketch, f: F, fox: boolean): void {
  const a = f.u * TAU;
  const step = f.moving ? Math.sin(a) : 0;
  const bob = f.moving ? -0.18 * Math.abs(Math.cos(a)) : 0.06 * Math.sin(a);
  const sway = f.moving ? 0.3 * Math.sin(a) : 0.45 * Math.sin(a);
  const light = mix(f.b, WHITE, 0.6);
  // tail
  if (fox) {
    sk.at(mul(move(-2.0, -2.0 + bob), turn(-0.5 + sway * 0.25)), () => {
      const tail = (p: Pen) => {
        p.moveTo(0, 0.3);
        p.quadraticCurveTo(-1.6, 0.9, -2.8, -0.2);
        p.quadraticCurveTo(-3.5, -1.2, -2.9, -1.5);
        p.quadraticCurveTo(-1.4, -1.0, 0, -0.4);
        p.closePath();
      };
      sk.blob(tail, f.b, { dark: f.bd, d: 0.4 });
      sk.draw((p) => {
        p.save();
        p.beginPath();
        tail(p);
        p.clip();
        p.beginPath();
        p.arc(-3.2, -1.0, 0.95, 0, TAU);
        p.fillStyle = light;
        p.fill();
        p.restore();
      });
    });
  } else {
    sk.limb([-1.9, -2.1 + bob, -2.8, -2.5 + bob, -3.0, -3.6 + bob, -2.55 + sway, -4.35 + bob], 0.58, f.b, { dark: f.bd });
  }
  // far legs, body, near legs
  const leg = (x: number, ph: number, near: boolean) => {
    const sw = f.moving ? 0.45 * Math.sin(a + ph) : 0;
    const lift = f.moving ? Math.max(0, Math.cos(a + ph)) * 0.35 : 0;
    sk.limb([x, -1.5 + bob, x + sw, -0.35 - lift], 0.62, near ? f.b : f.bd, { dark: near ? f.bd : null });
  };
  leg(1.25, Math.PI, false);
  leg(-1.55, 0, false);
  sk.blob(ell(-0.3, -1.95 + bob, 1.95, 1.12), f.b, { dark: f.bd, d: 0.45 });
  if (fox) sk.blob(ell(1.0, -1.85 + bob, 0.75, 0.75), light, { line: 0.5, sil: false });
  leg(1.0, 0, true);
  leg(-1.85, Math.PI, true);
  // head
  sk.at(move(1.75 + step * 0.05, -3.0 + bob), () => {
    for (const [x0, x1] of [[-0.95, -0.15], [0.25, 0.95]] as const) {
      const tip = fox ? -2.15 : -1.85;
      sk.blob((p) => {
        p.moveTo(x0, -0.6);
        p.lineTo((x0 + x1) / 2 - 0.05, tip);
        p.lineTo(x1, -0.75);
        p.closePath();
      }, f.b, { dark: f.bd, d: 0.2 });
      sk.draw((p) => {
        p.beginPath();
        p.moveTo(x0 + 0.25, -0.75);
        p.lineTo((x0 + x1) / 2 - 0.05, tip + 0.45);
        p.lineTo(x1 - 0.2, -0.85);
        p.closePath();
        p.fillStyle = '#ffa3b8';
        p.fill();
      });
    }
    sk.blob(ell(0, 0, 1.25, 1.1), f.b, { dark: f.bd, d: 0.35 });
    if (fox) {
      sk.blob((p) => {
        p.moveTo(0.2, -0.05);
        p.quadraticCurveTo(1.0, -0.2, 1.75, 0.35);
        p.quadraticCurveTo(1.1, 0.95, 0.15, 0.75);
        p.closePath();
      }, light, { line: 0.6 });
      sk.blob(circ(1.72, 0.35, 0.22), EYE, { line: 0 , sil: false });
    }
    sk.draw(eyeDot(0.45, -0.1, 0.24, f.blink));
    sk.draw(eyeDot(-0.35, -0.1, 0.22, f.blink));
    if (!fox) {
      sk.draw((p, c) => {
        p.beginPath();
        p.moveTo(0.0, 0.35);
        p.lineTo(0.3, 0.35);
        p.lineTo(0.15, 0.52);
        p.closePath();
        p.fillStyle = '#ff8fa8';
        p.fill();
        if (c.px < 5) return;
        p.strokeStyle = c.ink;
        p.lineWidth = Math.max(c.line * 0.6, 0.6 / c.px);
        p.beginPath();
        p.moveTo(0.6, 0.45);
        p.lineTo(1.7, 0.25);
        p.moveTo(0.6, 0.6);
        p.lineTo(1.7, 0.75);
        p.stroke();
      });
    }
  });
}

function rat(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const bob = f.moving ? -0.12 * Math.abs(Math.sin(a)) : 0.05 * Math.sin(a);
  const sniff = f.moving ? 0 : 0.08 * Math.sin(a * 3);
  const pink = '#ffa3b8';
  sk.limb([-1.6, -0.95 + bob, -2.7, -0.55, -3.6, -0.75 + 0.2 * Math.sin(a), -4.1, -1.35], 0.26, pink, { line: 0.6 });
  for (const x of [-0.9, 0.8]) {
    const sw = f.moving ? 0.3 * Math.sin(a + x) : 0;
    sk.limb([x, -0.6 + bob, x + sw, -0.15], 0.38, f.bd, { line: 0.6 });
  }
  sk.blob(ell(-0.25, -1.15 + bob, 1.6, 0.95), f.b, { dark: f.bd, d: 0.35 });
  sk.at(move(1.3 + sniff, -1.35 + bob), () => {
    sk.blob(circ(-0.3, -0.75, 0.55), f.b, { dark: f.bd, d: 0.15 });
    sk.draw((p) => {
      p.beginPath();
      p.arc(-0.3, -0.75, 0.3, 0, TAU);
      p.fillStyle = pink;
      p.fill();
    });
    sk.blob((p) => {
      p.moveTo(-0.6, -0.55);
      p.quadraticCurveTo(0.4, -0.75, 1.15, 0.05);
      p.quadraticCurveTo(0.4, 0.6, -0.6, 0.5);
      p.closePath();
    }, f.b, { dark: f.bd, d: 0.2 });
    sk.blob(circ(1.12, 0.05, 0.18), pink, { line: 0.5, sil: false });
    sk.draw(eyeDot(0.25, -0.12, 0.17, f.blink));
  });
}

function drone(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const tilt = f.moving ? 0.12 + 0.03 * Math.sin(a) : 0.03 * Math.sin(a);
  const body = f.b;
  sk.push(mul(move(0, f.moving ? -0.15 * Math.cos(a) : 0), turn(tilt)));
  // landing struts
  sk.limb([-0.9, -1.0, -1.2, -0.25], 0.22, '#4a5160', { line: 0.5 });
  sk.limb([0.9, -1.0, 1.2, -0.25], 0.22, '#4a5160', { line: 0.5 });
  // arms and rotors
  for (const s of [-1, 1]) {
    sk.limb([s * 1.2, -1.9, s * 2.35, -2.35], 0.32, '#4a5160', { line: 0.6 });
    sk.limb([s * 2.35, -2.35, s * 2.35, -2.75], 0.3, '#4a5160', { line: 0.5 });
  }
  sk.blob((p) => p.roundRect(-1.55, -2.6, 3.1, 1.75, 0.7), body, { dark: shade(body, -0.25), d: 0.4 });
  sk.blob(circ(0.75, -1.75, 0.5), '#1d2230', { line: 0.6 });
  sk.draw((p) => {
    p.beginPath();
    p.arc(0.75, -1.75, 0.95, 0, TAU);
    p.fillStyle = alpha('#ff5d6c', 0.25);
    p.fill();
    p.beginPath();
    p.arc(0.75, -1.75, 0.27, 0, TAU);
    p.fillStyle = '#ff5d6c';
    p.fill();
    p.beginPath();
    p.arc(0.66, -1.86, 0.09, 0, TAU);
    p.fillStyle = WHITE;
    p.fill();
  });
  const spin = f.i % 2;
  for (const s of [-1, 1]) {
    sk.draw((p, c) => {
      p.beginPath();
      p.ellipse(s * 2.35, -2.85, 1.25, 0.28, 0, 0, TAU);
      p.fillStyle = alpha('#d8dde6', 0.45);
      p.fill();
      p.beginPath();
      const w = spin ? 1.1 : 0.55;
      p.moveTo(s * 2.35 - w, -2.85 + (spin ? 0.05 : 0.18));
      p.lineTo(s * 2.35 + w, -2.85 - (spin ? 0.05 : 0.18));
      p.strokeStyle = c.ink;
      p.lineWidth = 0.28 + c.line;
      p.lineCap = 'round';
      p.stroke();
      p.strokeStyle = '#8b93a3';
      p.lineWidth = 0.28;
      p.stroke();
    });
  }
  sk.pop();
}

function slime(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const k = f.moving ? 0.22 * Math.sin(a) : 0.06 * Math.sin(a);
  const lift = f.moving ? Math.max(0, Math.sin(a)) * 0.9 : 0;
  const w = 2.2 * (1 - k * 0.6);
  const h = 2.9 * (1 + k);
  const blob = (p: Pen) => {
    p.moveTo(-w, -lift);
    p.quadraticCurveTo(-w * 1.05, -h * 0.75 - lift, -w * 0.35, -h * 0.95 - lift);
    p.quadraticCurveTo(0, -h * 1.05 - lift, w * 0.35, -h * 0.95 - lift);
    p.quadraticCurveTo(w * 1.05, -h * 0.75 - lift, w, -lift);
    p.quadraticCurveTo(0, 0.25 - lift, -w, -lift);
    p.closePath();
  };
  sk.blob(blob, f.b, { dark: f.bd, d: 0.6 });
  sk.draw((p, c) => {
    p.beginPath();
    p.ellipse(-w * 0.45, -h * 0.68 - lift, w * 0.22, h * 0.12, -0.6, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.6);
    p.fill();
    eyeDot(w * 0.22, -h * 0.5 - lift, 0.3, f.blink)(p, c);
    eyeDot(w * 0.72, -h * 0.48 - lift, 0.27, f.blink)(p, c);
    p.beginPath();
    p.moveTo(w * 0.32, -h * 0.3 - lift);
    p.quadraticCurveTo(w * 0.5, -h * 0.2 - lift, w * 0.66, -h * 0.3 - lift);
    p.strokeStyle = c.ink;
    p.lineWidth = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.stroke();
  });
}

function imp(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const flap = f.moving ? [1, 0.35, -0.9, -0.1][f.i % 4] : Math.sin(a);
  const wing = '#4a2a3a';
  for (const s of [-1, 1]) {
    sk.at(mul(move(-0.4, -2.6), turn(s * (0.35 + 0.35 * flap) - (s > 0 ? 0 : Math.PI))), () => {
      sk.blob((p) => {
        p.moveTo(0, 0);
        p.quadraticCurveTo(1.0, -1.5, 2.4, -1.3);
        p.quadraticCurveTo(2.0, -0.6, 2.3, 0.0);
        p.quadraticCurveTo(1.7, -0.1, 1.5, 0.45);
        p.quadraticCurveTo(0.9, 0.1, 0, 0.4);
        p.closePath();
      }, wing, { dark: shade(wing, -0.2), d: 0.2 });
    });
  }
  sk.limb([-1.0, -1.4, -2.0, -1.0, -2.4, -1.8], 0.25, f.bd, { line: 0.6 });
  sk.blob((p) => {
    p.moveTo(-2.4, -2.25);
    p.lineTo(-2.05, -1.65);
    p.lineTo(-2.75, -1.65);
    p.closePath();
  }, f.bd, { line: 0.6 });
  for (const x of [-0.5, 0.5]) sk.limb([x, -1.0, x + 0.1, -0.3], 0.38, f.bd, { line: 0.6 });
  for (const x of [-0.75, 0.55]) {
    sk.blob((p) => {
      p.moveTo(x - 0.25, -3.2);
      p.quadraticCurveTo(x - 0.1, -4.2, x + 0.35, -4.45);
      p.quadraticCurveTo(x + 0.2, -3.8, x + 0.4, -3.25);
      p.closePath();
    }, '#f3e7c9', { line: 0.6 });
  }
  sk.blob(circ(0, -2.15, 1.45), f.b, { dark: f.bd, d: 0.45 });
  sk.draw((p, c) => {
    eyeDot(0.55, -2.45, 0.28, f.blink)(p, c);
    eyeDot(-0.25, -2.45, 0.26, f.blink)(p, c);
    p.beginPath();
    p.moveTo(-0.1, -1.7);
    p.quadraticCurveTo(0.3, -1.25, 0.8, -1.75);
    p.strokeStyle = c.ink;
    p.lineWidth = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.stroke();
  });
}

// A round sand beetle: a domed shell split down the back, a little head
// with feelers poking out in front, six stubby legs that scuttle in threes.
function beetle(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const bob = f.moving ? -0.08 * Math.abs(Math.sin(a)) : 0;
  const breathe = f.moving ? 0 : 0.06 * Math.sin(a);
  const tw = f.moving ? 0 : 0.18 * Math.sin(a * 2);
  const leg = (x: number, ph: number, near: boolean) => {
    const sw = f.moving ? 0.35 * Math.sin(a + ph) : 0;
    const lift = f.moving ? Math.max(0, Math.cos(a + ph)) * 0.2 : 0;
    sk.limb([x, -0.75 + bob, x + 0.25 + sw, -0.15 - lift], 0.34, near ? f.bd : shade(f.bd, -0.15), { line: 0.6 });
  };
  for (const [x, ph] of [[-1.0, Math.PI], [0.3, 0], [1.5, Math.PI]] as const) leg(x, ph, false);
  const top = -3.05 - breathe + bob;
  const shell = (p: Pen) => {
    p.moveTo(-2.3, -0.55 + bob);
    p.quadraticCurveTo(-2.45, top + 0.05, -0.05, top);
    p.quadraticCurveTo(2.3, top + 0.05, 2.2, -0.55 + bob);
    p.quadraticCurveTo(0, -0.2 + bob, -2.3, -0.55 + bob);
    p.closePath();
  };
  sk.blob(shell, f.b, { dark: f.bd, d: 0.5 });
  sk.draw((p, c) => {
    // the split down its back, a few spots and a gloss
    p.save();
    p.beginPath();
    shell(p);
    p.clip();
    p.strokeStyle = c.ink;
    p.lineWidth = c.line;
    p.lineCap = 'round';
    p.beginPath();
    p.moveTo(0.3, top + 0.05);
    p.quadraticCurveTo(0.6, -1.7 + bob, 0.45, -0.3 + bob);
    p.stroke();
    p.fillStyle = shade(f.b, -0.3);
    for (const [x, y] of [[-1.3, -1.5], [-0.55, -2.35], [1.35, -1.8]] as const) {
      p.beginPath();
      p.arc(x, y + bob, 0.24, 0, TAU);
      p.fill();
    }
    p.restore();
    p.beginPath();
    p.ellipse(-0.95, top + 0.7, 0.75, 0.3, -0.35, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.55);
    p.fill();
  });
  // the head and its feelers, in front of the shell
  sk.at(move(2.3, -1.05 + bob), () => {
    sk.limb([0.3, -0.4, 0.85, -1.05 + tw, 1.35, -1.2 + tw], 0.17, f.bd, { line: 0.5 });
    sk.limb([0.0, -0.5, 0.4, -1.3 - tw, 0.8, -1.55 - tw], 0.17, f.bd, { line: 0.5 });
    sk.blob(ell(0.15, 0, 0.82, 0.68), shade(f.b, -0.35), { dark: shade(f.b, -0.5), d: 0.15 });
    sk.draw(eyeDot(0.5, -0.12, 0.2, f.blink));
  });
  for (const [x, ph] of [[-1.4, 0], [-0.1, Math.PI], [1.1, 0]] as const) leg(x, ph, true);
}

// A fur ball's outline: tufts round an ellipse.
function fluff(p: Pen, cx: number, cy: number, rx: number, ry: number, n: number, amp: number): void {
  p.moveTo(cx + rx, cy);
  for (let j = 1; j <= n; j++) {
    const t = (j / n) * TAU;
    const m = ((j - 0.5) / n) * TAU;
    p.quadraticCurveTo(cx + (rx + amp) * Math.cos(m), cy + (ry + amp) * Math.sin(m), cx + rx * Math.cos(t), cy + ry * Math.sin(t));
  }
  p.closePath();
}

const GLOW = '#fff3a0';

// A small fluffy alien that gets about in hops: a round tuft of fur that
// squashes and stretches, big eyes, two feelers with glowing tips, tiny
// feet.
function hopper(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const hop = f.moving ? Math.max(0, Math.sin(a)) * 1.4 : 0;
  const k = f.moving ? 0.18 * Math.cos(a) : 0.05 * Math.sin(a);
  const w = 1.75 * (1 + k * 0.5);
  const h = 1.6 * (1 - k * 0.6);
  const cy = -h - 0.3 - hop;
  for (const x of [-0.7, 0.75]) sk.blob(ell(x, -0.2 - hop * 0.6, 0.45, 0.25), f.bd, { line: 0.6 });
  const sway = f.moving ? -0.3 * Math.cos(a) : 0.2 * Math.sin(a * 2);
  for (const [x, s] of [[-0.35, -1], [0.75, 1]] as const) {
    const tx = x + s * 0.5 + sway;
    const ty = cy - h - 1.35;
    sk.limb([x, cy - h * 0.7, x + s * 0.2 + sway * 0.5, cy - h - 0.55, tx, ty], 0.18, f.bd, { line: 0.5 });
    sk.draw((p) => {
      const g = p.createRadialGradient(tx, ty, 0.1, tx, ty, 0.95);
      g.addColorStop(0, alpha(GLOW, 0.6));
      g.addColorStop(1, alpha(GLOW, 0));
      p.beginPath();
      p.arc(tx, ty, 0.95, 0, TAU);
      p.fillStyle = g;
      p.fill();
    });
    sk.blob(circ(tx, ty, 0.3), GLOW, { line: 0.5 });
  }
  sk.blob((p) => fluff(p, 0.1, cy, w, h, 12, 0.32), f.b, { dark: f.bd, d: 0.45 });
  sk.draw((p, c) => {
    eyeDot(0.6, cy - 0.15, 0.38, f.blink)(p, c);
    eyeDot(-0.3, cy - 0.15, 0.34, f.blink)(p, c);
    p.beginPath();
    p.moveTo(0.05, cy + 0.55);
    p.quadraticCurveTo(0.2, cy + 0.75, 0.4, cy + 0.55);
    p.strokeStyle = c.ink;
    p.lineWidth = Math.max(c.line, 1 / c.px);
    p.lineCap = 'round';
    p.stroke();
    p.fillStyle = alpha('#ff8fb0', 0.45);
    for (const x of [-0.85, 1.15]) {
      p.beginPath();
      p.ellipse(x, cy + 0.35, 0.3, 0.18, 0, 0, TAU);
      p.fill();
    }
  });
}

// A husky: its colour over the back, white on its mask, chest, belly and
// legs, pricked ears, a longer muzzle and its tail curled up over its back
// (it wags; it pants at rest now and then).
function husky(sk: Sketch, f: F): void {
  const a = f.u * TAU;
  const step = f.moving ? Math.sin(a) : 0;
  const bob = f.moving ? -0.2 * Math.abs(Math.cos(a)) : 0.06 * Math.sin(a);
  const wag = f.moving ? 0.2 * Math.sin(a * 2) : 0.35 * Math.sin(a * 2);
  const white = mix(f.b, WHITE, 0.85);
  const whiteD = shade(white, -0.14);
  // the tail, curled over the back
  sk.at(mul(move(-2.05, -2.55 + bob), turn(wag)), () => {
    const tail = (p: Pen) => {
      p.moveTo(0.15, 0.3);
      p.quadraticCurveTo(-1.45, -0.15, -1.25, -1.5);
      p.quadraticCurveTo(-0.85, -2.45, 0.55, -1.95);
      p.quadraticCurveTo(-0.25, -1.4, 0.45, -0.45);
      p.closePath();
    };
    sk.blob(tail, f.b, { dark: f.bd, d: 0.35 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      tail(p);
      p.clip();
      p.beginPath();
      p.arc(0.45, -1.95, 0.6, 0, TAU);
      p.fillStyle = white;
      p.fill();
      p.restore();
    });
  });
  const leg = (x: number, ph: number, near: boolean) => {
    const sw = f.moving ? 0.5 * Math.sin(a + ph) : 0;
    const lift = f.moving ? Math.max(0, Math.cos(a + ph)) * 0.4 : 0;
    sk.limb([x, -1.55 + bob, x + sw, -0.35 - lift], 0.66, near ? white : whiteD, { dark: near ? whiteD : null });
  };
  leg(1.3, Math.PI, false);
  leg(-1.6, 0, false);
  const body = ell(-0.3, -2.05 + bob, 2.15, 1.18);
  sk.blob(body, f.b, { dark: f.bd, d: 0.45 });
  sk.draw((p) => {
    // the white belly and chest
    p.save();
    p.beginPath();
    body(p);
    p.clip();
    p.beginPath();
    p.ellipse(0.2, -1.05 + bob, 2.3, 0.62, 0, 0, TAU);
    p.ellipse(1.55, -1.9 + bob, 0.7, 1.0, 0, 0, TAU);
    p.fillStyle = white;
    p.fill();
    p.restore();
  });
  leg(1.05, 0, true);
  leg(-1.9, Math.PI, true);
  // the head
  sk.at(move(1.95 + step * 0.05, -3.25 + bob), () => {
    for (const [x0, x1] of [[-0.95, -0.2], [0.2, 0.95]] as const) {
      sk.blob((p) => {
        p.moveTo(x0, -0.55);
        p.lineTo((x0 + x1) / 2, -2.05);
        p.lineTo(x1, -0.7);
        p.closePath();
      }, f.b, { dark: f.bd, d: 0.2 });
      sk.draw((p) => {
        p.beginPath();
        p.moveTo(x0 + 0.25, -0.75);
        p.lineTo((x0 + x1) / 2, -1.6);
        p.lineTo(x1 - 0.2, -0.85);
        p.closePath();
        p.fillStyle = white;
        p.fill();
      });
    }
    const head = ell(0, 0, 1.22, 1.08);
    sk.blob(head, f.b, { dark: f.bd, d: 0.35 });
    sk.draw((p) => {
      // the mask: white round the eyes and down the face
      p.save();
      p.beginPath();
      head(p);
      p.clip();
      p.beginPath();
      p.ellipse(0.35, 0.45, 1.05, 0.8, 0, 0, TAU);
      p.ellipse(0.05, -0.55, 0.22, 0.35, 0, 0, TAU);
      p.fillStyle = white;
      p.fill();
      p.restore();
    });
    sk.blob((p) => {
      p.moveTo(0.45, -0.05);
      p.quadraticCurveTo(1.3, -0.15, 1.95, 0.3);
      p.quadraticCurveTo(1.9, 0.85, 1.2, 0.85);
      p.quadraticCurveTo(0.6, 0.9, 0.35, 0.65);
      p.closePath();
    }, white, { dark: whiteD, d: 0.15, line: 0.6 });
    sk.blob(circ(1.9, 0.3, 0.24), EYE, { line: 0, sil: false });
    sk.draw(eyeDot(0.5, -0.12, 0.22, f.blink));
    sk.draw(eyeDot(-0.3, -0.12, 0.2, f.blink));
    if (f.moving || f.i % 4 < 2) {
      sk.draw((p) => {
        p.beginPath();
        p.ellipse(1.35, 0.95, 0.24, 0.32, 0.2, 0, TAU);
        p.fillStyle = '#ff8fa8';
        p.fill();
      });
    }
  });
}
