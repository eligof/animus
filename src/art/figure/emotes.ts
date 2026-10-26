import type { Emote } from '../../world/character.ts';
import type { Pen } from '../types.ts';
import { alpha, mix, shade } from '../iso.ts';
import { heart } from './body.ts';
import { hole, move, mul, zoom, Sketch } from './paint.ts';

// Little outlined icons that pop up over a head: about 5 units across,
// drawn above (0, 0), their bottom centre. They pop in over the first fifth
// of a second (overshooting a little), then bob gently.

const TAU = Math.PI * 2;
const POP = 0.24;
const BOB = 1.6; // seconds a bob
const BOB_N = 8;

// The frame to show `t` seconds after it popped up: a key and the sketch.
export function emoteArt(kind: Emote, t: number): { key: string; draw: () => Sketch } {
  let k: number;
  let y: number;
  let key: string;
  if (t < POP) {
    const i = Math.max(0, Math.floor((t / POP) * 4));
    key = `p${i}`;
    k = [0.45, 0.95, 1.16, 1.06][i];
    y = 0;
  } else {
    const i = Math.floor((((t - POP) % BOB) / BOB) * BOB_N);
    key = `b${i}`;
    k = 1;
    y = -0.28 * Math.sin((i / BOB_N) * TAU);
  }
  return {
    key,
    draw: () => {
      const sk = new Sketch();
      sk.push(mul(move(0, y), zoom(k)));
      icon(sk, kind, key);
      sk.pop();
      return sk;
    },
  };
}

const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

function icon(sk: Sketch, kind: Emote, key: string): void {
  switch (kind) {
    case 'excl': {
      const c = '#ff5a4f';
      sk.blob((p) => {
        p.moveTo(-1.0, -5.0);
        p.quadraticCurveTo(0, -5.45, 1.0, -5.0);
        p.lineTo(0.5, -2.0);
        p.quadraticCurveTo(0, -1.6, -0.5, -2.0);
        p.closePath();
      }, c, { dark: shade(c, -0.22), d: 0.3 });
      sk.blob(circ(0, -0.75, 0.68), c, { dark: shade(c, -0.22), d: 0.2 });
      shine(sk, -0.35, -4.5, -0.2, -3.2);
      break;
    }
    case 'question': {
      const c = '#5aa9ff';
      sk.limb([-1.05, -3.85, -0.75, -4.6, 0.15, -4.95, 1.0, -4.55, 1.15, -3.7, 0.55, -3.05, 0.05, -2.6, 0.05, -1.95], 0.95, c, { dark: shade(c, -0.22) });
      sk.blob(circ(0.05, -0.72, 0.6), c, { dark: shade(c, -0.22), d: 0.2 });
      break;
    }
    case 'heart': {
      const c = '#ff5a7a';
      sk.blob((p) => heart(p, 0, -2.55, 2.3), c, { dark: shade(c, -0.2), d: 0.5 });
      shine(sk, -1.6, -3.45, -1.0, -4.05);
      break;
    }
    case 'note': {
      const c = '#9b6bff';
      sk.limb([-0.55, -1.0, -0.55, -4.45, 1.55, -4.95, 1.55, -1.5], 0.42, c, { line: 0.6 });
      sk.limb([-0.55, -4.0, 1.55, -4.5], 0.55, c, { line: 0 });
      sk.blob((p) => p.ellipse(-1.15, -0.85, 0.8, 0.6, -0.35, 0, TAU), c, { dark: shade(c, -0.22), d: 0.2 });
      sk.blob((p) => p.ellipse(0.95, -1.35, 0.8, 0.6, -0.35, 0, TAU), c, { dark: shade(c, -0.22), d: 0.2 });
      break;
    }
    case 'idea': {
      const c = '#ffd23f';
      sk.draw((p) => {
        p.beginPath();
        p.arc(0, -3.3, 2.5, 0, TAU);
        p.fillStyle = alpha('#fff3a0', 0.35);
        p.fill();
      });
      rays(sk, 0, -3.3, 2.1, 2.75, key);
      sk.blob((p) => p.roundRect(-0.72, -1.55, 1.44, 1.2, 0.3), '#a8b0bd', { dark: '#828a98', d: 0.2 });
      sk.blob((p) => {
        p.moveTo(-0.75, -1.5);
        p.quadraticCurveTo(-1.65, -2.45, -1.65, -3.35);
        p.arc(0, -3.35, 1.65, Math.PI, 0);
        p.quadraticCurveTo(1.65, -2.45, 0.75, -1.5);
        p.closePath();
      }, c, { dark: shade(c, -0.15), d: 0.4 });
      sk.draw((p, k) => {
        p.beginPath();
        p.moveTo(-0.4, -1.6);
        p.lineTo(-0.3, -2.7);
        p.lineTo(0.3, -2.7);
        p.lineTo(0.4, -1.6);
        p.strokeStyle = shade(c, -0.45);
        p.lineWidth = Math.max(k.line, 0.18);
        p.lineJoin = 'round';
        p.stroke();
      });
      shine(sk, -0.9, -3.6, -0.55, -4.25);
      break;
    }
    case 'sweat': {
      const c = '#8fd3ff';
      drop(sk, 0.2, -0.6, 1.25, c);
      drop(sk, -1.45, -3.0, 0.65, c);
      break;
    }
    case 'zzz': {
      const c = '#8fb8ff';
      zed(sk, -1.25, -0.7, 0.75, c);
      zed(sk, 0.15, -2.35, 1.0, c);
      zed(sk, 1.45, -4.2, 1.3, c);
      break;
    }
    case 'anger': {
      const c = '#ff4757';
      // four brackets round a gap, the cross-popping vein
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const x = sx * 0.8;
        const y = -2.5 + sy * 0.8;
        sk.limb([x + sx * 1.15, y + sy * 0.05, x + sx * 0.2, y + sy * 0.2, x + sx * 0.05, y + sy * 1.15], 0.68, c, { dark: shade(c, -0.2) });
      }
      break;
    }
    case 'star': {
      const c = '#ffd23f';
      sk.blob((p) => {
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU - Math.PI / 2;
          const r = i % 2 ? 1.0 : 2.3;
          if (i === 0) p.moveTo(r * Math.cos(a), -2.4 + r * Math.sin(a));
          else p.lineTo(r * Math.cos(a), -2.4 + r * Math.sin(a));
        }
        p.closePath();
      }, c, { dark: shade(c, -0.18), d: 0.4 });
      shine(sk, -0.45, -3.4, -0.1, -3.9);
      break;
    }
    case 'cup': {
      const cup = '#f3ede2';
      sk.blob((p) => {
        p.arc(1.45, -1.85, 0.75, 0, TAU);
        hole(p, 1.45, -1.85, 0.4, 0.4);
      }, cup, { line: 0.6 });
      sk.blob((p) => {
        p.moveTo(-1.55, -3.0);
        p.lineTo(1.55, -3.0);
        p.lineTo(1.3, -0.75);
        p.quadraticCurveTo(1.25, -0.2, 0.7, -0.2);
        p.lineTo(-0.7, -0.2);
        p.quadraticCurveTo(-1.25, -0.2, -1.3, -0.75);
        p.closePath();
      }, cup, { dark: shade(cup, -0.16), d: 0.35 });
      sk.blob((p) => p.ellipse(0, -3.0, 1.55, 0.42, 0, 0, TAU), '#6b4a33', { line: 0.6, sil: false });
      sk.draw((p) => {
        p.fillStyle = '#e4572e';
        p.fillRect(-1.45, -2.05, 2.85, 0.5);
      });
      sk.draw((p, k) => {
        const i = Number(key.slice(1)) || 0;
        p.strokeStyle = alpha('#ffffff', 0.85);
        p.lineCap = 'round';
        p.lineWidth = Math.max(0.3, 1.2 / k.px);
        for (const x of [-0.6, 0.55]) {
          const w = Math.sin(i * 0.8 + x * 3) * 0.2;
          p.beginPath();
          p.moveTo(x, -3.6);
          p.quadraticCurveTo(x + 0.4 + w, -4.1, x + w, -4.6);
          p.quadraticCurveTo(x - 0.35 + w, -5.05, x + 0.05, -5.5);
          p.stroke();
        }
      });
      break;
    }
    case 'speech': {
      // a speech balloon, its tail down to the speaker, three dots in it
      const c = '#f7f5f0';
      sk.blob((p) => {
        p.moveTo(-0.1, -1.8);
        p.lineTo(1.1, -1.8);
        p.quadraticCurveTo(2.3, -1.8, 2.3, -3.0);
        p.lineTo(2.3, -3.9);
        p.quadraticCurveTo(2.3, -5.1, 1.1, -5.1);
        p.lineTo(-1.1, -5.1);
        p.quadraticCurveTo(-2.3, -5.1, -2.3, -3.9);
        p.lineTo(-2.3, -3.0);
        p.quadraticCurveTo(-2.3, -1.8, -1.15, -1.8);
        p.quadraticCurveTo(-1.25, -0.9, -1.75, -0.35);
        p.quadraticCurveTo(-0.6, -0.7, -0.1, -1.8);
        p.closePath();
      }, c, { dark: shade(c, -0.14), d: 0.35 });
      sk.draw((p) => {
        // the dots light up one after another
        const i = key.startsWith('b') ? Number(key.slice(1)) : -1;
        for (let k = 0; k < 3; k++) {
          p.beginPath();
          p.arc(-1.15 + 1.15 * k, -3.45, 0.38, 0, TAU);
          p.fillStyle = i >= 0 && Math.floor(i / 2) % 4 === k ? '#8a7fa8' : '#4a4458';
          p.fill();
        }
      });
      break;
    }
  }
}

function shine(sk: Sketch, x0: number, y0: number, x1: number, y1: number): void {
  sk.draw((p, k) => {
    if (k.px < 4) return;
    p.beginPath();
    p.moveTo(x0, y0);
    p.lineTo(x1, y1);
    p.strokeStyle = alpha('#ffffff', 0.8);
    p.lineWidth = 0.32;
    p.lineCap = 'round';
    p.stroke();
  });
}

function rays(sk: Sketch, cx: number, cy: number, r0: number, r1: number, key: string): void {
  const on = key.startsWith('p') || Number(key.slice(1)) % 4 < 2;
  sk.draw((p, k) => {
    p.lineCap = 'round';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      const e = on ? r1 : r1 - 0.25;
      p.beginPath();
      p.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a));
      p.lineTo(cx + e * Math.cos(a), cy + e * Math.sin(a));
      p.strokeStyle = k.ink;
      p.lineWidth = 0.42 + k.line;
      p.stroke();
      p.strokeStyle = '#ffe680';
      p.lineWidth = 0.42;
      p.stroke();
    }
  });
}

function drop(sk: Sketch, x: number, y: number, r: number, c: string): void {
  sk.blob((p) => {
    p.moveTo(x, y - r * 2.1);
    p.quadraticCurveTo(x + r * 1.1, y - r * 0.6, x + r, y);
    p.arc(x, y, r, 0, Math.PI);
    p.quadraticCurveTo(x - r * 1.1, y - r * 0.6, x, y - r * 2.1);
    p.closePath();
  }, c, { dark: shade(c, -0.2), d: r * 0.25 });
  sk.draw((p) => {
    p.beginPath();
    p.ellipse(x - r * 0.4, y - r * 0.2, r * 0.22, r * 0.35, -0.3, 0, TAU);
    p.fillStyle = alpha('#ffffff', 0.85);
    p.fill();
  });
}

function zed(sk: Sketch, x: number, y: number, h: number, c: string): void {
  const w = h * 0.85;
  sk.limb([x - w / 2, y - h, x + w / 2, y - h, x - w / 2, y, x + w / 2, y], Math.max(0.42, h * 0.36), mix(c, '#ffffff', 0.2), { dark: shade(c, -0.2) });
}
