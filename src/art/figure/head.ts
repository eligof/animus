import type { Pen } from '../types.ts';
import { alpha, mix, shade } from '../iso.ts';
import { GOLD, WHITE, type Look } from './look.ts';
import { hole, move, mul, turn, type Ctx, type Sketch } from './paint.ts';
import type { Eyes, Face } from './rig.ts';

// Heads in the head frame: origin at the head's centre, x toward the
// facing side, y down, units (a head is about 6.6 wide, 6.1 tall). Seen
// from the front the face is turned a little toward +x (a three-quarter
// view); from the back the hair covers it.

const TAU = Math.PI * 2;
export const HEAD_RX = 3.3;
export const HEAD_RY = 3.05;
const F = 0.55; // the face's centre line
const EY = 0.5; // eye row
const EX = [F - 1.2, F + 1.12] as const; // near eye, far eye
const MY = 1.78; // mouth
const MOUTH = '#7a2e3b';
const TONGUE = '#ff8f8f';
const BLUSH = '#ff7d9a';
const DARK_METAL = '#3d4452';
const VISOR = '#1c2230';

const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0) => (p: Pen) => p.ellipse(cx, cy, rx, ry, rot, 0, TAU);
const circ = (cx: number, cy: number, r: number) => (p: Pen) => p.arc(cx, cy, r, 0, TAU);

function lw(c: Ctx, k = 1): number {
  return Math.max(c.line * k, 1 / c.px);
}

// A scalloped run along an ellipse from angle a0 to a1 (n bumps pushed out
// by `amp` of the radius), continuing the current subpath.
function bumpy(p: Pen, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number, amp: number): void {
  const step = (a1 - a0) / n;
  for (let j = 0; j < n; j++) {
    const am = a0 + step * (j + 0.5);
    const ae = a0 + step * (j + 1);
    p.quadraticCurveTo(cx + rx * (1 + amp) * Math.cos(am), cy + ry * (1 + amp) * Math.sin(am), cx + rx * Math.cos(ae), cy + ry * Math.sin(ae));
  }
}

// Spikes along an ellipse from a0 to a1, continuing the current subpath.
function spiky(p: Pen, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number, amp: number): void {
  const step = (a1 - a0) / n;
  for (let j = 0; j < n; j++) {
    const am = a0 + step * (j + 0.55);
    const ae = a0 + step * (j + 1);
    p.lineTo(cx + rx * (1 + amp) * Math.cos(am), cy + ry * (1 + amp) * Math.sin(am));
    p.lineTo(cx + rx * Math.cos(ae), cy + ry * Math.sin(ae));
  }
}

// ---- hair ---------------------------------------------------------------

const HX = 0;
const HY = -0.3;
const HRX = 3.52;
const HRY = 3.32;
const A0 = 2.72; // the cap runs from beside the near ear over the top
const A1 = TAU - 0.12; // to the far temple
const NEAR: [number, number] = [HX + HRX * Math.cos(A0), HY + HRY * Math.sin(A0)];

// The hair over the top of the head and its fringe, seen from the front.
function cap(style: number) {
  return (p: Pen) => {
    p.moveTo(NEAR[0], NEAR[1]);
    if (style === 3) spiky(p, HX, HY, HRX, HRY, A0, A1, 9, 0.17);
    else if (style === 5) bumpy(p, HX, HY - 0.15, HRX + 0.2, HRY + 0.15, A0, A1, 8, 0.12);
    else p.ellipse(HX, HY, HRX, HRY, 0, A0, A1);
    switch (style) {
      case 1: // blunt bangs
        p.quadraticCurveTo(3.1, -0.2, 2.65, -0.3);
        p.lineTo(-1.25, -0.3);
        p.quadraticCurveTo(-2.35, -0.3, -2.55, 0.85);
        break;
      case 2: // a long side-swept fringe
        p.quadraticCurveTo(3.0, -1.6, 0.9, -1.05);
        p.quadraticCurveTo(-1.4, -0.55, -2.35, 1.5);
        p.quadraticCurveTo(-2.75, 1.9, -3.05, 1.3);
        break;
      case 3: // pointed bangs
        p.lineTo(2.7, -0.15);
        p.lineTo(2.2, -0.95);
        p.lineTo(1.55, 0.0);
        p.lineTo(0.95, -0.95);
        p.lineTo(0.25, -0.05);
        p.lineTo(-0.35, -1.0);
        p.lineTo(-1.15, -0.1);
        p.lineTo(-1.55, -0.9);
        p.lineTo(-2.55, 0.65);
        break;
      case 4: // parted in the middle, swept to the sides
      case 7:
        p.quadraticCurveTo(2.9, -0.55, 1.75, -1.0);
        p.quadraticCurveTo(0.95, -1.35, 0.55, -2.25);
        p.quadraticCurveTo(0.05, -1.25, -1.2, -0.95);
        p.quadraticCurveTo(-2.4, -0.55, -2.7, 0.75);
        break;
      case 5: // curls
        p.quadraticCurveTo(3.25, -0.05, 2.55, -0.45);
        p.quadraticCurveTo(2.15, 0.15, 1.55, -0.55);
        p.quadraticCurveTo(1.05, 0.05, 0.5, -0.6);
        p.quadraticCurveTo(-0.05, 0.0, -0.6, -0.65);
        p.quadraticCurveTo(-1.2, -0.05, -1.65, -0.6);
        p.quadraticCurveTo(-2.65, -0.2, -2.65, 0.75);
        break;
      case 6: // swept up into the quiff
        p.quadraticCurveTo(3.1, -0.6, 2.45, -1.0);
        p.quadraticCurveTo(0.7, -1.55, -0.9, -1.15);
        p.quadraticCurveTo(-2.35, -0.75, -2.65, 0.7);
        break;
      default: // short, a soft scalloped fringe
        p.quadraticCurveTo(3.15, -0.15, 2.5, -0.55);
        p.quadraticCurveTo(2.05, -0.12, 1.4, -0.65);
        p.quadraticCurveTo(0.75, -0.1, 0.1, -0.72);
        p.quadraticCurveTo(-0.6, -0.15, -1.25, -0.8);
        p.quadraticCurveTo(-2.25, -0.45, -2.6, 0.55);
    }
    p.closePath();
  };
}

// The back of the head's hair, down to the nape (`low` lower for a bob).
function cover(style: number, low: number) {
  return (p: Pen) => {
    const rx = 3.55;
    const ry = 3.35;
    const cx = -0.2;
    const cy = -0.3;
    const a = Math.asin(Math.max(-0.2, Math.min(0.95, (low - 0.3 - cy) / ry)));
    p.moveTo(cx + rx * Math.cos(a), cy + ry * Math.sin(a));
    // over the top, from the right of the nape to its left
    if (style === 3) spiky(p, cx, cy, rx, ry, a, -Math.PI - a, 11, 0.16);
    else if (style === 5) bumpy(p, cx, cy - 0.2, rx + 0.45, ry + 0.35, a, -Math.PI - a, 11, 0.1);
    else p.ellipse(cx, cy, rx, ry, 0, a, Math.PI - a, true);
    // a soft wavy line at the nape
    const x0 = cx + rx * Math.cos(Math.PI - a);
    const x1 = cx + rx * Math.cos(a);
    const n = 4;
    for (let j = 0; j < n; j++) {
      const xa = x0 + ((x1 - x0) * (j + 0.5)) / n;
      const xb = x0 + ((x1 - x0) * (j + 1)) / n;
      p.quadraticCurveTo(xa, low + 0.45, xb, low);
    }
    p.closePath();
  };
}

// ---- face ---------------------------------------------------------------

function eye(p: Pen, c: Ctx, L: Look, x: number, y: number, rx: number, ry: number, kind: Eyes, near: boolean): void {
  const ink = c.ink;
  const w = lw(c, 1.15);
  p.lineCap = 'round';
  p.lineJoin = 'round';
  switch (kind) {
    case 'blink':
    case 'closed':
      p.beginPath();
      p.moveTo(x - rx * 1.05, y + 0.05);
      p.quadraticCurveTo(x, y + (kind === 'closed' ? 0.45 : 0.3), x + rx * 1.05, y + 0.05);
      p.strokeStyle = ink;
      p.lineWidth = w;
      p.stroke();
      if (kind === 'closed') {
        // lashes
        p.beginPath();
        const s = near ? -1 : 1;
        p.moveTo(x + s * rx * 1.0, y + 0.08);
        p.lineTo(x + s * rx * 1.35, y - 0.12);
        p.stroke();
      }
      return;
    case 'happy':
      p.beginPath();
      p.moveTo(x - rx * 1.05, y + 0.22);
      p.quadraticCurveTo(x, y - 0.55, x + rx * 1.05, y + 0.22);
      p.strokeStyle = ink;
      p.lineWidth = w * 1.1;
      p.stroke();
      return;
    case 'squeeze': {
      const s = near ? 1 : -1; // > for the near eye, < for the far
      p.beginPath();
      p.moveTo(x - s * rx * 0.9, y - 0.42);
      p.lineTo(x + s * rx * 0.85, y + 0.02);
      p.lineTo(x - s * rx * 0.9, y + 0.42);
      p.strokeStyle = ink;
      p.lineWidth = w * 1.1;
      p.stroke();
      return;
    }
    case 'drowsy':
    case 'droop': {
      // heavy lids: the lower half of an open eye (or of one cast down,
      // lower still) under a drooping lid
      const lid = kind === 'drowsy' ? y + 0.02 : y + 0.26;
      p.save();
      p.beginPath();
      p.rect(x - rx * 1.6, lid, rx * 3.2, ry * 2);
      p.clip();
      p.beginPath();
      if (kind === 'drowsy') p.ellipse(x, y + 0.05, rx, ry * 0.95, 0, 0, TAU);
      else p.ellipse(x, y + 0.18, rx, ry * 0.62, 0, 0, TAU);
      p.fillStyle = L.eye;
      p.fill();
      p.restore();
      p.beginPath();
      p.moveTo(x - rx * 1.2, lid + 0.12);
      p.quadraticCurveTo(x, lid - 0.1, x + rx * 1.2, lid + 0.12);
      p.strokeStyle = ink;
      p.lineWidth = w;
      p.stroke();
      return;
    }
    case 'wide':
      p.beginPath();
      p.ellipse(x, y - 0.05, rx * 1.3, ry * 1.12, 0, 0, TAU);
      p.fillStyle = WHITE;
      p.fill();
      p.strokeStyle = ink;
      p.lineWidth = lw(c, 0.9);
      p.stroke();
      p.beginPath();
      p.arc(x, y + 0.05, rx * 0.5, 0, TAU);
      p.fillStyle = L.eye;
      p.fill();
      return;
  }
  // open, looking down or up
  const down = kind === 'down';
  p.beginPath();
  if (down) p.ellipse(x, y + 0.18, rx, ry * 0.62, 0, 0, TAU);
  else p.ellipse(x, y, rx, ry, 0, 0, TAU);
  p.fillStyle = L.eye;
  p.fill();
  if (down) {
    p.beginPath();
    p.moveTo(x - rx * 1.15, y - 0.12);
    p.quadraticCurveTo(x, y - 0.32, x + rx * 1.15, y - 0.12);
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
    return;
  }
  // the glint, toward the light
  p.beginPath();
  p.arc(x + c.lx * rx * 0.4, y + c.ly * ry * 0.4, Math.max(rx * 0.42, 0.55 / c.px), 0, TAU);
  p.fillStyle = WHITE;
  p.fill();
  if (c.px > 7) {
    p.beginPath();
    p.arc(x - c.lx * rx * 0.35, y - c.ly * ry * 0.45, rx * 0.17, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.8);
    p.fill();
  }
}

function mouthAt(p: Pen, c: Ctx, kind: Face['mouth'], x: number, y: number, cat: boolean): void {
  const ink = c.ink;
  const w = lw(c, 1.0);
  p.lineCap = 'round';
  p.lineJoin = 'round';
  p.strokeStyle = ink;
  p.lineWidth = w;
  const filled = (shape: () => void, tongue = true) => {
    p.beginPath();
    shape();
    p.fillStyle = MOUTH;
    p.fill();
    if (tongue && c.px > 5) {
      p.save();
      p.clip();
      p.beginPath();
      p.ellipse(x, y + 0.62, 0.42, 0.3, 0, 0, TAU);
      p.fillStyle = TONGUE;
      p.fill();
      p.restore();
    }
    p.beginPath();
    shape();
    p.lineWidth = lw(c, 0.85);
    p.stroke();
  };
  switch (kind) {
    case 'grin':
      filled(() => {
        p.moveTo(x - 0.62, y - 0.12);
        p.quadraticCurveTo(x, y + 0.05, x + 0.62, y - 0.12);
        p.quadraticCurveTo(x + 0.55, y + 0.85, x, y + 0.85);
        p.quadraticCurveTo(x - 0.55, y + 0.85, x - 0.62, y - 0.12);
      });
      return;
    case 'open':
      filled(() => p.ellipse(x, y + 0.2, 0.38, 0.42, 0, 0, TAU));
      return;
    case 'yawn':
      filled(() => p.ellipse(x, y + 0.25, 0.42, 0.62, 0, 0, TAU));
      return;
    case 'o':
      filled(() => p.ellipse(x, y + 0.12, 0.24, 0.29, 0, 0, TAU), false);
      return;
    case 'flat':
      p.beginPath();
      p.moveTo(x - 0.35, y + 0.1);
      p.lineTo(x + 0.35, y + 0.1);
      p.stroke();
      return;
    case 'frown':
      p.beginPath();
      p.moveTo(x - 0.4, y + 0.3);
      p.quadraticCurveTo(x, y - 0.15, x + 0.4, y + 0.3);
      p.stroke();
      return;
    case 'wavy':
      p.beginPath();
      p.moveTo(x - 0.55, y + 0.15);
      p.quadraticCurveTo(x - 0.37, y - 0.15, x - 0.18, y + 0.15);
      p.quadraticCurveTo(x, y + 0.42, x + 0.18, y + 0.15);
      p.quadraticCurveTo(x + 0.37, y - 0.15, x + 0.55, y + 0.15);
      p.stroke();
      return;
  }
  if (cat && (kind === 'smile' || kind === 'small')) {
    p.beginPath();
    p.moveTo(x - 0.5, y - 0.02);
    p.quadraticCurveTo(x - 0.25, y + 0.38, x, y + 0.02);
    p.quadraticCurveTo(x + 0.25, y + 0.38, x + 0.5, y - 0.02);
    p.stroke();
    return;
  }
  const hw = kind === 'small' ? 0.26 : 0.42;
  p.beginPath();
  p.moveTo(x - hw, y - 0.02);
  p.quadraticCurveTo(x, y + hw * 0.95, x + hw, y - 0.02);
  p.stroke();
}

function brows(p: Pen, c: Ctx, L: Look, kind: Face['brows']): void {
  if (kind === 'none') return;
  p.strokeStyle = L.sp === 'human' ? mix(L.hairD, c.ink, 0.35) : c.ink;
  p.lineWidth = lw(c, 1.0);
  p.lineCap = 'round';
  for (const k of [0, 1]) {
    const x = EX[k];
    const y = EY - 1.05;
    const inner = k === 0 ? 1 : -1; // toward the nose
    p.beginPath();
    if (kind === 'up') {
      p.moveTo(x - 0.4, y + 0.02);
      p.quadraticCurveTo(x, y - 0.35, x + 0.4, y + 0.02);
    } else {
      const lift = kind === 'worried' ? -0.28 : 0.3;
      p.moveTo(x - inner * 0.42, y);
      p.lineTo(x + inner * 0.38, y + lift);
    }
    p.stroke();
  }
}

// Eyes, brows, mouth and cheeks for a human, cat or ghost.
function faceOf(L: Look, f: Face) {
  return (p: Pen, c: Ctx) => {
    const cat = L.sp === 'cat';
    const lx = f.look[0] * 0.22;
    const ly = f.look[1] * 0.22;
    const rx = cat ? 0.56 : 0.52;
    const ry = cat ? 0.76 : 0.74;
    if (f.blush || L.sp === 'ghost') {
      p.fillStyle = alpha(BLUSH, L.sp === 'ghost' ? 0.3 : 0.38);
      p.beginPath();
      p.ellipse(F - 2.05, MY - 0.25, 0.62, 0.32, 0, 0, TAU);
      p.ellipse(F + 2.0, MY - 0.3, 0.5, 0.3, 0, 0, TAU);
      p.fill();
    }
    if (cat) {
      // muzzle, nose and whiskers
      p.beginPath();
      p.ellipse(F + 0.1, MY - 0.05, 1.05, 0.68, 0, 0, TAU);
      p.fillStyle = mix(L.skin, '#ffffff', 0.55);
      p.fill();
      p.beginPath();
      p.moveTo(F - 0.2, MY - 0.55);
      p.lineTo(F + 0.4, MY - 0.55);
      p.lineTo(F + 0.1, MY - 0.2);
      p.closePath();
      p.fillStyle = '#ff8fa8';
      p.fill();
      p.strokeStyle = c.ink;
      p.lineWidth = lw(c, 0.6);
      p.beginPath();
      for (const s of [-1, 1]) {
        const x0 = F + 0.1 + s * 1.2;
        p.moveTo(x0, MY - 0.25);
        p.lineTo(x0 + s * 2.3, MY - 0.65);
        p.moveTo(x0, MY + 0.05);
        p.lineTo(x0 + s * 2.35, MY + 0.15);
      }
      p.stroke();
    }
    eye(p, c, L, EX[0] + lx, EY + ly, rx, ry, f.eyes, true);
    eye(p, c, L, EX[1] + lx, EY + ly, rx * 0.9, ry, f.eyes, false);
    brows(p, c, L, f.brows);
    mouthAt(p, c, f.mouth, F + 0.08 + lx * 0.5, MY + (cat ? 0.05 : 0), cat);
  };
}

// A robot's face: LED eyes and mouth on a dark visor.
function robotFace(L: Look, f: Face) {
  return (p: Pen, c: Ctx) => {
    const led = L.eye;
    const lx = f.look[0] * 0.2;
    const ly = f.look[1] * 0.2;
    p.lineCap = 'round';
    p.lineJoin = 'round';
    // glow
    p.beginPath();
    p.ellipse(F, EY + 0.3, 2.1, 1.1, 0, 0, TAU);
    p.fillStyle = alpha(led, 0.18);
    p.fill();
    p.strokeStyle = led;
    p.fillStyle = led;
    p.lineWidth = Math.max(0.32, 1.2 / c.px);
    for (const k of [0, 1]) {
      const x = EX[k] + lx + (k ? -0.05 : 0.1);
      const y = EY + ly + 0.1;
      p.beginPath();
      switch (f.eyes) {
        case 'blink':
        case 'closed':
        case 'down':
          p.moveTo(x - 0.4, y + 0.15);
          p.lineTo(x + 0.4, y + 0.15);
          p.stroke();
          break;
        case 'happy':
          p.moveTo(x - 0.42, y + 0.25);
          p.lineTo(x, y - 0.25);
          p.lineTo(x + 0.42, y + 0.25);
          p.stroke();
          break;
        case 'squeeze': {
          const s = k === 0 ? 1 : -1;
          p.moveTo(x - s * 0.38, y - 0.35);
          p.lineTo(x + s * 0.38, y);
          p.lineTo(x - s * 0.38, y + 0.35);
          p.stroke();
          break;
        }
        case 'wide':
          p.arc(x, y, 0.5, 0, TAU);
          p.stroke();
          break;
        case 'drowsy':
          p.roundRect(x - 0.32, y + 0.04, 0.64, 0.38, 0.17);
          p.fill();
          break;
        case 'droop':
          p.roundRect(x - 0.32, y + 0.24, 0.64, 0.24, 0.1);
          p.fill();
          break;
        default:
          p.roundRect(x - 0.32, y - 0.42, 0.64, 0.84, 0.25);
          p.fill();
      }
    }
    // mouth
    const m = f.mouth;
    const x = F + 0.1;
    const y = EY + 1.25;
    p.beginPath();
    if (m === 'open' || m === 'grin' || m === 'yawn' || m === 'o') {
      p.roundRect(x - 0.4, y - 0.15, 0.8, m === 'o' ? 0.3 : 0.45, 0.12);
      p.fill();
    } else if (m === 'wavy') {
      p.moveTo(x - 0.5, y);
      p.lineTo(x - 0.25, y - 0.15);
      p.lineTo(x, y);
      p.lineTo(x + 0.25, y - 0.15);
      p.lineTo(x + 0.5, y);
      p.stroke();
    } else if (m === 'flat' || m === 'frown') {
      p.moveTo(x - 0.35, y);
      p.lineTo(x + 0.35, y);
      p.stroke();
    } else {
      p.moveTo(x - 0.4, y - 0.08);
      p.quadraticCurveTo(x, y + 0.28, x + 0.4, y - 0.08);
      p.stroke();
    }
  };
}

// Big glossy alien eyes.
function alienFace(L: Look, f: Face) {
  return (p: Pen, c: Ctx) => {
    const lx = f.look[0] * 0.15;
    const ly = f.look[1] * 0.15;
    if (f.blush) {
      p.fillStyle = alpha(BLUSH, 0.32);
      p.beginPath();
      p.ellipse(F - 2.15, MY - 0.05, 0.55, 0.3, 0, 0, TAU);
      p.ellipse(F + 2.05, MY - 0.1, 0.45, 0.28, 0, 0, TAU);
      p.fill();
    }
    const shut = f.eyes === 'blink' || f.eyes === 'closed' || f.eyes === 'happy' || f.eyes === 'squeeze';
    for (const k of [0, 1]) {
      const x = EX[k] + (k ? 0.08 : -0.12) + lx;
      const y = EY + 0.05 + ly;
      const rot = k ? 0.3 : -0.3;
      const rx = k ? 0.72 : 0.82;
      if (shut) {
        p.beginPath();
        const up = f.eyes === 'happy' ? -0.5 : 0.35;
        p.moveTo(x - rx, y + 0.1);
        p.quadraticCurveTo(x, y + up, x + rx, y + 0.1);
        p.strokeStyle = c.ink;
        p.lineWidth = lw(c, 1.2);
        p.lineCap = 'round';
        p.stroke();
        continue;
      }
      const big = f.eyes === 'wide' ? 1.15 : 1;
      const down = f.eyes === 'down' || f.eyes === 'droop';
      // half shut: only what is under the lid shows
      const lid = f.eyes === 'drowsy' ? y : f.eyes === 'droop' ? y + 0.3 : null;
      p.save();
      if (lid !== null) {
        p.beginPath();
        p.rect(x - 2, lid, 4, 2);
        p.clip();
      }
      p.beginPath();
      p.ellipse(x, down ? y + 0.25 : y, rx * big, (down ? 0.7 : 1.05) * big, rot, 0, TAU);
      p.fillStyle = '#16131c';
      p.fill();
      p.beginPath();
      p.ellipse(x + c.lx * 0.32, y + c.ly * 0.5, 0.26, 0.36, rot, 0, TAU);
      p.fillStyle = WHITE;
      p.fill();
      p.beginPath();
      p.arc(x - c.lx * 0.3, y - c.ly * 0.55, 0.12, 0, TAU);
      p.fillStyle = alpha(WHITE, 0.7);
      p.fill();
      p.restore();
      if (lid !== null) {
        p.beginPath();
        p.moveTo(x - rx * 1.05, lid + 0.05);
        p.quadraticCurveTo(x, lid - 0.2, x + rx * 1.05, lid + 0.05);
        p.strokeStyle = c.ink;
        p.lineWidth = lw(c, 1.2);
        p.lineCap = 'round';
        p.stroke();
      }
    }
    brows(p, c, L, f.brows === 'none' ? 'none' : f.brows);
    mouthAt(p, c, f.mouth === 'grin' ? 'open' : f.mouth, F + 0.05 + lx, MY + 0.15, false);
  };
}

// ---- the head -----------------------------------------------------------

// `bandaged`: its health is low, a plaster shows (see plaster).
export type HeadOpts = { back: boolean; t: number; carry: boolean; frame: number; bandaged?: boolean };

// Hair that hangs behind the shoulders (drawn before the body).
export function hairBehind(sk: Sketch, L: Look, o: HeadOpts): void {
  if (L.sp !== 'human' || o.back || hooded(L) || L.costume === 'astronaut') return;
  if (L.style === 2) {
    sk.blob((p) => {
      p.moveTo(-3.45, -1.0);
      p.quadraticCurveTo(-4.25, 3.0, -3.7, 6.2);
      p.quadraticCurveTo(-0.5, 7.0, 2.55, 6.0);
      p.quadraticCurveTo(3.6, 3.0, 3.35, -0.9);
      p.closePath();
    }, L.hairD, { dark: shade(L.hairD, -0.1), d: 0.5 });
  }
}

// Long hair down the back, seen from behind (drawn over the body).
function hairDownBack(sk: Sketch, L: Look): void {
  if (L.style !== 2) return;
  sk.blob((p) => {
    p.moveTo(-3.55, -0.5);
    p.quadraticCurveTo(-4.0, 3.5, -3.3, 6.3);
    p.quadraticCurveTo(-0.3, 6.9, 2.9, 6.1);
    p.quadraticCurveTo(3.7, 3.4, 3.4, -0.5);
    p.closePath();
  }, L.hair, { dark: L.hairD, d: 0.7 });
}

const hooded = (L: Look) => L.hoodUp && L.costume !== 'astronaut' && L.acc !== 'lamp' && L.acc !== 'beret';

function wizardHat(L: Look) {
  return !hooded(L) && L.costume === 'wizard' && L.acc !== 'lamp' && L.acc !== 'beret';
}

// Everything of the head: ears and antennae behind it, the head, the face
// (from the front), hair, headwear and accessories, a space helmet last.
export function drawHead(sk: Sketch, L: Look, face: Face, o: HeadOpts): void {
  const back = o.back;
  const human = L.sp === 'human';
  const hood = hooded(L);

  // behind the head (a space helmet keeps it all inside)
  const loose = human && !hood && L.costume !== 'astronaut';
  if (loose && !back) hairBack(sk, L);
  if (loose && back) hairBackSides(sk, L);
  if (L.sp === 'robot') robotAntenna(sk, L, o);
  if (L.sp === 'alien') alienAntennae(sk, L, o);
  if (L.sp === 'cat' && !hood) catEars(sk, L, back);
  if (human && !hood) {
    const ex = back ? 2.95 : -2.95;
    sk.blob(ell(ex, 0.65, 0.62, 0.78), L.skin, { dark: L.skinD, d: 0.25 });
  }

  // the head
  if (L.sp === 'robot') {
    sk.blob((p) => p.roundRect(-3.25, -2.95, 6.5, 5.95, 1.75), L.skin, { dark: shade(L.skin, -0.28), d: 0.7 });
    if (!back) {
      sk.blob((p) => p.roundRect(F - 2.5, -0.8, 4.85, 3.05, 1.0), VISOR, { line: 0.6, sil: false });
      sk.draw(robotFace(L, face));
    } else {
      sk.draw((p, c) => {
        p.strokeStyle = c.ink;
        p.lineWidth = lw(c, 0.8);
        p.lineCap = 'round';
        p.beginPath();
        for (const y of [-0.2, 0.55, 1.3]) {
          p.moveTo(-1.8, y);
          p.lineTo(1.0, y);
        }
        p.stroke();
      });
    }
    // ear bolt
    sk.blob(circ(back ? 3.2 : -3.2, 0.35, 0.62), DARK_METAL, { line: 0.6 });
  } else {
    const rx = L.sp === 'cat' ? 3.4 : HEAD_RX;
    const ry = L.sp === 'alien' ? 3.25 : L.sp === 'cat' ? 2.95 : HEAD_RY;
    const cy = L.sp === 'alien' ? -0.2 : 0;
    sk.blob(ell(0, cy, rx, ry), L.skin, { dark: L.skinD, d: 0.62 });
    if (!back) {
      if (L.sp === 'alien') sk.draw(alienFace(L, face));
      else sk.draw(faceOf(L, face));
    }
    if (L.sp === 'cat' && L.style % 2 === 1) catStripes(sk, L, back);
    if (L.sp === 'alien' && L.style % 2 === 1) alienSpots(sk, L, back);
  }

  // hair (a bun or a quiff won't fit in a space helmet)
  if (human && !hood) {
    const tall = L.costume !== 'astronaut';
    if (back) {
      const low = L.style === 1 ? 3.0 : L.style === 2 ? 3.2 : 2.45;
      if (L.style === 4 && tall) sk.blob(circ(-0.5, -3.85, 1.3), L.hair, { dark: L.hairD, d: 0.45 });
      sk.blob(cover(L.style, low), L.hair, { dark: L.hairD, d: 0.75 });
      if (L.style === 6 && tall) sk.blob(quiffBack, L.hair, { dark: L.hairD, d: 0.45 });
      hairShine(sk, L, true);
    } else {
      if (L.style === 4 && tall) {
        sk.blob(circ(-0.55, -3.85, 1.3), L.hair, { dark: L.hairD, d: 0.45 });
        sk.limb([-1.5, -2.95, -0.1, -2.75], 0.42, L.trim, { line: 0.5 });
      }
      sk.blob(cap(L.style), L.hair, { dark: L.hairD, d: 0.62 });
      if (L.style === 6 && tall) sk.blob(quiff, L.hair, { dark: L.hairD, d: 0.5 });
      hairShine(sk, L, false);
    }
  }
  if (!human && !hood && L.costume !== 'astronaut') headShine(sk, L, back);
  if (L.sp === 'ghost' && L.style % 3 === 0 && !back) {
    // a little curl on top
    sk.limb([0.2, -3.0, 0.4, -3.7, 1.0, -3.75, 0.95, -3.35], 0.32, L.skin, { line: 0.6 });
  }

  // a plaster, under whatever goes on the head
  if (o.bandaged && plastered(L, back, o.carry)) plaster(sk, back);

  // a headset goes on under a hat, anything else over it
  if (L.acc === 'headset' && (wizardHat(L) || L.prize)) {
    accessory(sk, L, o, face);
    headwear(sk, L, o);
  } else {
    headwear(sk, L, o);
    accessory(sk, L, o, face);
  }

  if (L.costume === 'astronaut') helmet(sk, L, back);
  if (L.prize === 'antenna' && !o.carry) antenna(sk, L, back);
}

// Whether a plaster shows: always on the cheek, but on the back of the
// head only when no hood or level's hat covers it (one carrying a block on
// its head has its hat off).
export function plastered(L: Look, back: boolean, carry: boolean): boolean {
  return !back || !(hooded(L) || (L.prize !== null && L.prize !== 'antenna' && !carry));
}

// Two strips of sticking plaster crossed: on the far cheek from the front,
// on the back of the head from behind.
function plaster(sk: Sketch, back: boolean): void {
  const tape = '#f4d6ab';
  const [x, y] = back ? [-0.9, -0.7] : [F + 2.1, 1.45];
  for (const a of [-0.62, 0.62]) {
    sk.at(mul(move(x, y), turn(a)), () => sk.blob((p) => p.roundRect(-0.95, -0.3, 1.9, 0.6, 0.28), tape, { dark: shade(tape, -0.14), d: 0.12, line: 0.55 }));
  }
  sk.draw((p) => {
    p.fillStyle = shade(tape, -0.3);
    for (const [dx, dy] of [[-0.14, -0.1], [0.14, 0.1], [0.12, -0.12], [-0.12, 0.12]]) {
      p.beginPath();
      p.arc(x + dx, y + dy, 0.055, 0, TAU);
      p.fill();
    }
  });
}

function hairShine(sk: Sketch, L: Look, back: boolean): void {
  sk.draw((p, c) => {
    if (c.px < 5) return;
    p.beginPath();
    const cx = back ? -0.2 : 0;
    p.ellipse(cx, -0.3, 2.65, 2.45, 0, Math.PI * 1.12, Math.PI * 1.38);
    p.strokeStyle = alpha(mix(L.hair, '#fff6e0', 0.55), 0.75);
    p.lineWidth = 0.32;
    p.lineCap = 'round';
    p.stroke();
  });
}

// A gloss on a bare dome (or a glint on metal), toward the light.
function headShine(sk: Sketch, L: Look, back: boolean): void {
  sk.draw((p, c) => {
    if (c.px < 5) return;
    p.lineCap = 'round';
    p.strokeStyle = alpha(mix(L.skin, '#fffaf0', 0.7), 0.8);
    p.lineWidth = 0.34;
    p.beginPath();
    if (L.sp === 'robot') {
      p.moveTo(-2.55, -1.2);
      p.lineTo(-2.55, -1.75);
      p.quadraticCurveTo(-2.55, -2.3, -2.0, -2.3);
    } else {
      p.ellipse(back ? -0.15 : 0, L.sp === 'alien' ? -0.4 : -0.2, 2.55, 2.35, 0, Math.PI * 1.13, Math.PI * 1.36);
    }
    p.stroke();
  });
}

// Hair that frames the face from behind the head: a bob's sides, curls,
// pigtails, a long fringe's side lock.
function hairBack(sk: Sketch, L: Look): void {
  const h = L.hair;
  const d = L.hairD;
  switch (L.style) {
    case 1:
      sk.blob((p) => p.roundRect(-3.95, -2.7, 7.6, 5.75, 2.0), d, { dark: shade(d, -0.12), d: 0.4 });
      break;
    case 2:
      sk.blob((p) => {
        p.moveTo(-3.3, -1.2);
        p.quadraticCurveTo(-4.3, 1.5, -3.95, 4.3);
        p.quadraticCurveTo(-3.2, 4.6, -2.6, 3.9);
        p.quadraticCurveTo(-2.6, 1.0, -2.0, -1.0);
        p.closePath();
      }, h, { dark: d, d: 0.4 });
      break;
    case 5: {
      // a puff of curls round the whole head
      const a = 0.42;
      sk.blob((p) => {
        p.moveTo(-0.25 + 4.25 * Math.cos(a), -0.75 + 3.85 * Math.sin(a));
        bumpy(p, -0.25, -0.75, 4.25, 3.85, a, -Math.PI - a, 12, 0.1);
        p.closePath();
      }, h, { dark: d, d: 0.75 });
      break;
    }
    case 7:
      for (const [x, y, r] of [[-3.95, 1.55, 0.35], [3.7, 1.35, -0.35]] as const) {
        sk.blob(ell(x, y, 0.95, 1.6, r), h, { dark: d, d: 0.4 });
      }
      for (const [x, y] of [[-3.25, -0.2], [3.15, -0.35]] as const) sk.blob(circ(x, y, 0.42), L.trim, { line: 0.6 });
      break;
  }
}

// The same seen from behind: what shows round the sides of the head.
function hairBackSides(sk: Sketch, L: Look): void {
  if (L.style === 7) {
    for (const [x, y, r] of [[-3.75, 1.45, 0.35], [3.65, 1.4, -0.35]] as const) {
      sk.blob(ell(x, y, 0.95, 1.6, r), L.hair, { dark: L.hairD, d: 0.4 });
    }
  }
}

function quiff(p: Pen): void {
  p.moveTo(-1.9, -2.55);
  p.quadraticCurveTo(-1.2, -4.75, 1.4, -4.85);
  p.quadraticCurveTo(3.55, -4.85, 3.35, -3.2);
  p.quadraticCurveTo(3.0, -2.2, 2.4, -1.7);
  p.quadraticCurveTo(2.45, -3.35, 0.9, -3.3);
  p.quadraticCurveTo(-0.3, -3.2, -1.9, -2.55);
  p.closePath();
}

function quiffBack(p: Pen): void {
  p.moveTo(-1.0, -3.2);
  p.quadraticCurveTo(0.6, -4.7, 2.6, -3.9);
  p.quadraticCurveTo(3.4, -3.3, 3.2, -2.3);
  p.quadraticCurveTo(1.2, -3.0, -1.0, -3.2);
  p.closePath();
}

function catEars(sk: Sketch, L: Look, back: boolean): void {
  const inner = '#ffa3b8';
  const ears: Array<[number, number, number, number, number, number]> = back
    ? [[-3.0, -1.4, -2.6, -4.55, -0.85, -2.85], [0.75, -2.85, 2.45, -4.55, 3.0, -1.4]]
    : [[-3.05, -1.25, -2.55, -4.45, -0.85, -2.8], [0.95, -2.9, 2.6, -4.5, 3.1, -1.2]];
  for (const e of ears) {
    sk.blob((p) => {
      p.moveTo(e[0], e[1]);
      p.quadraticCurveTo(e[2] - 0.2, e[3] + 0.2, e[2], e[3]);
      p.quadraticCurveTo(e[2] + 0.3, e[3] + 0.3, e[4], e[5]);
      p.closePath();
    }, L.skin, { dark: L.skinD, d: 0.35 });
    if (!back) {
      sk.draw((p) => {
        const cx = (e[0] + e[2] + e[4]) / 3;
        const cy = (e[1] + e[3] + e[5]) / 3;
        const k = 0.5;
        p.beginPath();
        p.moveTo(cx + (e[0] - cx) * k, cy + (e[1] - cy) * k);
        p.lineTo(cx + (e[2] - cx) * k, cy + (e[3] - cy) * k);
        p.lineTo(cx + (e[4] - cx) * k, cy + (e[5] - cy) * k);
        p.closePath();
        p.fillStyle = inner;
        p.fill();
      });
    }
  }
}

function catStripes(sk: Sketch, L: Look, back: boolean): void {
  sk.draw((p, c) => {
    p.strokeStyle = shade(L.skin, -0.32);
    p.lineWidth = Math.max(0.3, 1 / c.px);
    p.lineCap = 'round';
    p.beginPath();
    const cx = back ? -0.3 : F - 0.1;
    for (const dx of [-0.75, 0, 0.75]) {
      p.moveTo(cx + dx, -2.95 + Math.abs(dx) * 0.15);
      p.lineTo(cx + dx * 0.8, -2.0 + Math.abs(dx) * 0.1);
    }
    p.stroke();
  });
}

function alienSpots(sk: Sketch, L: Look, back: boolean): void {
  sk.draw((p) => {
    p.fillStyle = shade(L.skin, -0.16);
    p.beginPath();
    const cx = back ? -0.4 : -0.6;
    p.ellipse(cx, -2.2, 0.45, 0.3, 0, 0, TAU);
    p.ellipse(cx + 1.3, -2.55, 0.32, 0.22, 0, 0, TAU);
    p.ellipse(cx - 1.4, -1.4, 0.3, 0.24, 0, 0, TAU);
    p.fill();
  });
}

function robotAntenna(sk: Sketch, L: Look, o: HeadOpts): void {
  if (o.carry) return;
  sk.limb([0.2, -2.8, 0.25, -4.3], 0.3, DARK_METAL, { line: 0.6 });
  const on = o.frame % 2 === 0;
  sk.blob(circ(0.25, -4.55, 0.5), on ? L.color : shade(L.color, -0.35), { line: 0.6 });
  if (on) {
    sk.draw((p) => {
      p.beginPath();
      p.arc(0.25, -4.55, 1.2, 0, TAU);
      p.fillStyle = alpha(L.color, 0.22);
      p.fill();
      p.beginPath();
      p.arc(0.1, -4.72, 0.16, 0, TAU);
      p.fillStyle = WHITE;
      p.fill();
    });
  }
}

function alienAntennae(sk: Sketch, L: Look, o: HeadOpts): void {
  if (o.carry) return;
  const w = Math.sin(o.t * 4) * 0.15;
  for (const [x0, x1] of [[-0.9, -1.75], [1.2, 2.1]] as const) {
    sk.limb([x0, -2.9, (x0 + x1) / 2 + w, -4.0, x1 + w, -4.85], 0.32, L.skin, { line: 0.6 });
    sk.blob(circ(x1 + w, -5.1, 0.5), L.color, { line: 0.6 });
    sk.draw((p) => {
      p.beginPath();
      p.arc(x1 + w, -5.1, 1.05, 0, TAU);
      p.fillStyle = alpha(L.color, 0.2);
      p.fill();
    });
  }
}

// ---- headwear -------------------------------------------------------------

function headwear(sk: Sketch, L: Look, o: HeadOpts): void {
  const back = o.back;
  if (hooded(L)) {
    hoodUp(sk, L, back);
    return;
  }
  if (L.prize === 'grand' && !o.carry) {
    grandHat(sk, L, back);
    return;
  }
  if (wizardHat(L) && !o.carry && !L.prize) {
    const hat = L.hat;
    sk.blob(ell(back ? -0.1 : 0.15, -2.4, 4.0, 1.05), hat, { dark: L.hatD, d: 0.35 });
    const cone = (p: Pen) => {
      p.moveTo(-2.35, -2.55);
      p.quadraticCurveTo(-1.35, -4.6, -0.8, -6.15);
      p.quadraticCurveTo(-1.6, -6.4, -2.55, -6.15);
      p.quadraticCurveTo(-1.0, -7.75, 0.55, -6.2);
      p.quadraticCurveTo(1.6, -4.4, 2.6, -2.55);
      p.quadraticCurveTo(0.1, -2.05, -2.35, -2.55);
      p.closePath();
    };
    sk.blob(cone, hat, { dark: L.hatD, d: 0.55 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      cone(p);
      p.clip();
      p.beginPath();
      p.moveTo(-2.6, -3.3);
      p.quadraticCurveTo(0.1, -2.75, 2.8, -3.3);
      p.lineTo(2.8, -2.0);
      p.lineTo(-2.6, -2.0);
      p.closePath();
      p.fillStyle = L.trim;
      p.fill();
      p.restore();
      if (!back) star(p, 0.55, -4.6, 0.55, L.trim);
    });
    return;
  }
  if (L.costume === 'scientist' && L.acc !== 'glasses' && L.acc !== 'goggles' && L.acc !== 'lamp' && L.acc !== 'beret') goggles(sk, back);
  if (L.costume === 'raver') {
    sk.draw((p, c) => {
      p.beginPath();
      p.moveTo(-3.35, -0.75);
      p.quadraticCurveTo(back ? -0.4 : F, -2.6, 3.3, -1.1);
      p.lineCap = 'round';
      p.strokeStyle = alpha(L.color, 0.3);
      p.lineWidth = 1.2;
      p.stroke();
      p.strokeStyle = c.ink;
      p.lineWidth = 0.5 + c.line;
      p.stroke();
      p.strokeStyle = mix(L.color, '#ffffff', 0.4);
      p.lineWidth = 0.5;
      p.stroke();
    });
  }
  if (L.prize && L.prize !== 'grand' && L.prize !== 'antenna' && !o.carry) prizeHat(sk, L, back);
}

// ★2: a level's hat (see look.ts), over the hair, the goggles of a lab
// coat or a raver's headband.
function prizeHat(sk: Sketch, L: Look, back: boolean): void {
  const c = L.color;
  const cd = shade(c, -0.24);
  const sx = back ? -0.1 : 0.1; // its crown, a little toward the face
  switch (L.prize) {
    case 'beanie': {
      sk.blob((p) => {
        p.moveTo(-3.45, -1.35);
        p.quadraticCurveTo(-3.6, -4.4, sx, -4.5);
        p.quadraticCurveTo(3.65, -4.4, 3.5, -1.35);
        p.closePath();
      }, c, { dark: cd, d: 0.55 });
      const brim = (p: Pen) => p.roundRect(-3.75, -2.1, 7.5, 1.2, 0.55);
      sk.blob(brim, shade(c, -0.1), { dark: cd, d: 0.2 });
      sk.draw((p, k) => {
        // the knit's ribs
        p.save();
        p.beginPath();
        brim(p);
        p.clip();
        p.strokeStyle = alpha(k.ink, 0.35);
        p.lineWidth = k.line * 0.8;
        p.beginPath();
        for (let x = -3.2; x < 3.6; x += 0.8) {
          p.moveTo(x, -2.05);
          p.lineTo(x, -0.95);
        }
        p.stroke();
        p.restore();
      });
      sk.blob(circ(sx, -4.85, 1.0), mix(c, WHITE, 0.55), { dark: mix(c, WHITE, 0.25), d: 0.3 });
      return;
    }
    case 'mortarboard': {
      const black = '#34324a';
      sk.blob((p) => {
        p.moveTo(-3.2, -1.9);
        p.quadraticCurveTo(-3.1, -3.75, sx, -3.85);
        p.quadraticCurveTo(3.25, -3.75, 3.2, -1.9);
        p.quadraticCurveTo(sx, -2.5, -3.2, -1.9);
        p.closePath();
      }, black, { dark: shade(black, -0.25), d: 0.35 });
      // the board, seen a little from above, and its tassel
      sk.blob((p) => {
        p.moveTo(-4.6, -3.75);
        p.lineTo(sx, -5.05);
        p.lineTo(4.7, -3.75);
        p.lineTo(sx, -2.75);
        p.closePath();
      }, '#45425c', { dark: black, d: 0.18 });
      sk.limb([sx, -3.95, 2.6, -3.55, 3.15, -1.9], 0.24, GOLD, { line: 0.5 });
      sk.blob((p) => p.roundRect(2.85, -2.05, 0.6, 1.05, 0.25), GOLD, { dark: shade(GOLD, -0.2), d: 0.15, line: 0.5 });
      sk.blob(circ(sx, -3.95, 0.34), GOLD, { line: 0.5 });
      return;
    }
    case 'party': {
      const cone = (p: Pen) => {
        p.moveTo(-2.1, -2.55);
        p.lineTo(0.95, -8.3);
        p.lineTo(2.45, -2.4);
        p.quadraticCurveTo(0.2, -1.85, -2.1, -2.55);
        p.closePath();
      };
      sk.blob(cone, c, { dark: cd, d: 0.45 });
      sk.draw((p) => {
        // stripes
        p.save();
        p.beginPath();
        cone(p);
        p.clip();
        p.strokeStyle = alpha(WHITE, 0.75);
        p.lineWidth = 0.55;
        p.beginPath();
        for (const y of [-3.6, -5.2, -6.8]) {
          p.moveTo(-3, y + 0.9);
          p.lineTo(3, y - 0.6);
        }
        p.stroke();
        p.restore();
      });
      sk.blob(circ(0.95, -8.5, 0.8), mix(c, WHITE, 0.6), { dark: mix(c, WHITE, 0.3), d: 0.25 });
      return;
    }
    case 'cap': {
      sk.blob((p) => {
        p.moveTo(-3.45, -1.25);
        p.quadraticCurveTo(-3.55, -4.25, sx, -4.3);
        p.quadraticCurveTo(3.6, -4.25, 3.45, -1.25);
        p.quadraticCurveTo(sx, -1.95, -3.45, -1.25);
        p.closePath();
      }, c, { dark: cd, d: 0.55 });
      sk.draw((p, k) => {
        // a seam over the crown
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.7;
        p.lineCap = 'round';
        p.beginPath();
        p.moveTo(sx, -4.25);
        p.quadraticCurveTo(sx + 0.25, -2.8, sx + 0.1, -1.6);
        p.stroke();
      });
      // the peak, turned to the back: off the back of the head, or toward
      // us when we see it from behind
      if (back) sk.blob(ell(sx, -1.55, 2.5, 0.8), shade(c, -0.12), { dark: cd, d: 0.2 });
      else sk.blob(ell(-3.85, -1.75, 1.85, 0.6, 0.18), shade(c, -0.12), { dark: cd, d: 0.2 });
      sk.blob(circ(sx, -4.3, 0.36), shade(c, -0.15), { line: 0.5 });
      return;
    }
  }
}

// ★2 for a wizard: a grander hat, taller, with a gold band and stars.
function grandHat(sk: Sketch, L: Look, back: boolean): void {
  const hat = L.hat;
  sk.blob(ell(back ? -0.1 : 0.15, -2.4, 4.35, 1.15), hat, { dark: L.hatD, d: 0.35 });
  const cone = (p: Pen) => {
    p.moveTo(-2.5, -2.55);
    p.quadraticCurveTo(-1.55, -5.4, -1.0, -7.3);
    p.quadraticCurveTo(-2.0, -7.7, -3.2, -7.3);
    p.quadraticCurveTo(-1.2, -9.4, 0.65, -7.4);
    p.quadraticCurveTo(1.75, -4.9, 2.8, -2.55);
    p.quadraticCurveTo(0.1, -2.0, -2.5, -2.55);
    p.closePath();
  };
  sk.blob(cone, hat, { dark: L.hatD, d: 0.55 });
  sk.draw((p) => {
    p.save();
    p.beginPath();
    cone(p);
    p.clip();
    p.beginPath();
    p.moveTo(-2.8, -3.55);
    p.quadraticCurveTo(0.1, -2.95, 3.0, -3.55);
    p.lineTo(3.0, -2.0);
    p.lineTo(-2.8, -2.0);
    p.closePath();
    p.fillStyle = GOLD;
    p.fill();
    p.restore();
    if (back) return;
    star(p, 0.45, -4.75, 0.62, GOLD);
    star(p, -0.75, -6.35, 0.38, '#fff3c4');
    star(p, 1.25, -6.05, 0.3, '#fff3c4');
  });
}

// ★2 on a space helmet: an antenna with a glowing bulb.
function antenna(sk: Sketch, L: Look, back: boolean): void {
  const x = back ? -0.4 : 0.6;
  sk.limb([x, -4.35, x + 0.3, -5.6, x + 0.75, -6.8], 0.24, '#9aa3b0', { line: 0.6 });
  sk.draw((p) => {
    const g = p.createRadialGradient(x + 0.8, -7.2, 0.3, x + 0.8, -7.2, 1.7);
    g.addColorStop(0, alpha(L.color, 0.5));
    g.addColorStop(1, alpha(L.color, 0));
    p.beginPath();
    p.arc(x + 0.8, -7.2, 1.7, 0, TAU);
    p.fillStyle = g;
    p.fill();
  });
  sk.blob(circ(x + 0.8, -7.2, 0.72), L.color, { dark: shade(L.color, -0.22), d: 0.2 });
  sk.draw((p) => {
    p.beginPath();
    p.arc(x + 0.6, -7.42, 0.2, 0, TAU);
    p.fillStyle = alpha(WHITE, 0.9);
    p.fill();
  });
}

export function star(p: Pen, x: number, y: number, r: number, fill: string): void {
  p.beginPath();
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU - Math.PI / 2;
    const rr = k % 2 ? r * 0.4 : r;
    p.lineTo(x + rr * Math.cos(a), y + rr * Math.sin(a));
  }
  p.closePath();
  p.fillStyle = fill;
  p.fill();
}

function hoodUp(sk: Sketch, L: Look, back: boolean): void {
  const c = L.costume === 'hacker' || L.sp === 'ghost' ? L.hat : L.topD;
  const cd = shade(c, -0.2);
  if (back) {
    sk.blob((p) => {
      p.moveTo(-3.75, 2.6);
      p.quadraticCurveTo(-4.3, -3.1, -0.6, -4.05);
      p.quadraticCurveTo(-0.9, -4.6, -0.2, -4.35);
      p.quadraticCurveTo(3.95, -3.4, 3.7, 2.4);
      p.quadraticCurveTo(0.0, 3.4, -3.75, 2.6);
      p.closePath();
    }, c, { dark: cd, d: 0.8 });
    sk.draw((p, k) => {
      p.beginPath();
      p.moveTo(-0.4, -4.1);
      p.quadraticCurveTo(-0.9, -1.0, -0.6, 2.5);
      p.strokeStyle = k.ink;
      p.lineWidth = k.line;
      p.stroke();
    });
    return;
  }
  const shape = (p: Pen) => {
    p.moveTo(-3.85, 2.9);
    p.quadraticCurveTo(-4.4, -3.4, -0.2, -4.0);
    p.quadraticCurveTo(-0.6, -4.55, 0.25, -4.25);
    p.quadraticCurveTo(4.1, -3.4, 3.85, 2.3);
    p.quadraticCurveTo(3.0, 3.5, 1.5, 3.4);
    p.closePath();
    hole(p, F + 0.15, 0.85, 2.55, 2.55);
  };
  sk.blob(shape, c, { dark: cd, d: 0.6 });
  // shadow under the hood's rim
  sk.draw((p) => {
    p.save();
    p.beginPath();
    p.ellipse(F + 0.15, 0.85, 2.55, 2.55, 0, 0, TAU);
    p.clip();
    p.beginPath();
    p.ellipse(F + 0.15, -1.6, 3.2, 1.75, 0, 0, TAU);
    p.fillStyle = alpha('#1a1424', 0.28);
    p.fill();
    p.restore();
  });
}

function goggles(sk: Sketch, back: boolean): void {
  sk.draw((p, c) => {
    p.beginPath();
    p.ellipse(back ? -0.2 : 0.05, -1.05, 3.42, 1.45, 0, Math.PI * 1.02, Math.PI * 1.98);
    p.lineCap = 'butt';
    p.strokeStyle = c.ink;
    p.lineWidth = 0.55 + c.line;
    p.stroke();
    p.strokeStyle = '#4a4252';
    p.lineWidth = 0.55;
    p.stroke();
  });
  if (back) return;
  for (const [x, r] of [[F - 1.05, 0.68], [F + 1.0, 0.6]] as const) {
    sk.blob(circ(x, -1.55, r), '#9aa3b0', { line: 0.6 });
    sk.blob(circ(x, -1.55, r * 0.68), '#ffbf5e', { line: 0.4, sil: false });
    sk.draw((p) => {
      p.beginPath();
      p.arc(x - 0.15, -1.72, r * 0.22, 0, TAU);
      p.fillStyle = alpha(WHITE, 0.85);
      p.fill();
    });
  }
}

function accessory(sk: Sketch, L: Look, o: HeadOpts, f: Face): void {
  const back = o.back;
  switch (L.acc) {
    case 'headset': {
      sk.draw((p, c) => {
        p.beginPath();
        p.ellipse(back ? -0.15 : 0, -0.15, 3.55, 3.4, 0, Math.PI * 1.08, Math.PI * 1.92);
        p.lineCap = 'round';
        p.strokeStyle = c.ink;
        p.lineWidth = 0.48 + 2 * c.line;
        p.stroke();
        p.strokeStyle = '#3c3a48';
        p.lineWidth = 0.48;
        p.stroke();
      });
      const ex = back ? 3.3 : -3.35;
      sk.blob((p) => p.roundRect(ex - 0.6, -0.55, 1.2, 1.75, 0.5), '#3c3a48', { line: 0.6 });
      sk.blob(circ(ex, 0.32, 0.38), L.color, { line: 0.4, sil: false });
      if (!back) {
        sk.limb([-3.2, 0.9, -2.6, 2.3, F - 0.75, 2.45], 0.22, '#3c3a48', { line: 0.5 });
        sk.blob(circ(F - 0.65, 2.42, 0.32), '#3c3a48', { line: 0.5 });
      }
      break;
    }
    case 'glasses':
      if (back || L.sp === 'robot') break;
      sk.draw((p, c) => {
        const blink = f.eyes !== 'open' && f.eyes !== 'wide' && f.eyes !== 'up' && f.eyes !== 'down';
        p.lineWidth = lw(c, 1.05);
        p.strokeStyle = c.ink;
        p.beginPath();
        p.arc(EX[0], EY + 0.05, 0.8, 0, TAU);
        p.fillStyle = alpha('#d8f1ff', blink ? 0.2 : 0.28);
        p.fill();
        p.stroke();
        p.beginPath();
        p.ellipse(EX[1], EY + 0.05, 0.7, 0.8, 0, 0, TAU);
        p.fill();
        p.stroke();
        p.beginPath();
        p.moveTo(EX[0] + 0.8, EY - 0.05);
        p.quadraticCurveTo(F, EY - 0.3, EX[1] - 0.7, EY - 0.05);
        p.moveTo(EX[0] - 0.8, EY);
        p.lineTo(-3.1, EY - 0.3);
        p.stroke();
      });
      break;
    case 'lamp': {
      if (o.carry) break;
      const yel = '#f2c230';
      sk.blob((p) => {
        p.moveTo(-3.75, -0.85);
        p.quadraticCurveTo(-3.8, -4.5, 0.0, -4.4);
        p.quadraticCurveTo(3.8, -4.5, 3.75, -0.85);
        p.quadraticCurveTo(0, -1.5, -3.75, -0.85);
        p.closePath();
      }, yel, { dark: shade(yel, -0.24), d: 0.6 });
      sk.limb([-3.9, -0.85, 3.9, -0.85], 0.42, shade(yel, -0.12), { line: 0.6 });
      if (!back) {
        sk.draw((p) => {
          p.beginPath();
          p.arc(F + 0.35, -2.45, 2.0, 0, TAU);
          p.fillStyle = alpha('#fff3b0', 0.22);
          p.fill();
        });
        sk.blob(circ(F + 0.35, -2.45, 0.85), '#8a8f99', { line: 0.6 });
        sk.blob(circ(F + 0.35, -2.45, 0.58), '#fff6cf', { line: 0.4, sil: false });
      }
      break;
    }
    case 'beret': {
      if (o.carry) break;
      const red = '#b8364a';
      sk.blob(ell(back ? 0.2 : -0.35, -2.65, 3.05, 1.2, back ? 0.18 : -0.18), red, { dark: shade(red, -0.22), d: 0.45 });
      sk.limb([back ? 0.3 : -0.3, -3.75, back ? 0.5 : -0.5, -4.25], 0.32, shade(red, -0.15), { line: 0.6 });
      break;
    }
    case 'goggles':
      goggles(sk, back);
      break;
    case 'bow': {
      if (o.carry) break;
      const pink = '#ff6b9d';
      const bx = back ? 1.6 : -1.7;
      const by = -2.75;
      for (const s of [-1, 1]) {
        sk.blob((p) => {
          p.moveTo(bx, by);
          p.quadraticCurveTo(bx + s * 0.6, by - 1.35, bx + s * 1.3, by - 0.75);
          p.quadraticCurveTo(bx + s * 1.5, by + 0.25, bx + s * 1.25, by + 0.75);
          p.quadraticCurveTo(bx + s * 0.6, by + 0.75, bx, by);
          p.closePath();
        }, pink, { dark: shade(pink, -0.2), d: 0.3 });
      }
      sk.blob(circ(bx, by, 0.42), shade(pink, -0.1), { line: 0.6 });
      break;
    }
  }
}

function helmet(sk: Sketch, L: Look, back: boolean): void {
  const R = 4.2;
  const cx = 0.1;
  const cy = -0.25;
  sk.draw(
    (p, c) => {
      p.beginPath();
      p.arc(cx, cy, R, 0, TAU);
      p.fillStyle = alpha('#bfe6ff', back ? 0.24 : 0.16);
      p.fill();
      // glints toward the light
      p.lineCap = 'round';
      p.beginPath();
      p.arc(cx, cy, R * 0.8, Math.PI * 1.08, Math.PI * 1.42);
      p.strokeStyle = alpha(WHITE, 0.8);
      p.lineWidth = 0.45;
      p.stroke();
      p.beginPath();
      p.arc(cx - R * 0.08, cy - R * 0.58, 0.22, 0, TAU);
      p.fillStyle = alpha(WHITE, 0.85);
      p.fill();
      p.beginPath();
      p.arc(cx, cy, R, 0, TAU);
      p.strokeStyle = c.ink;
      p.lineWidth = c.line;
      p.stroke();
      p.beginPath();
      p.arc(cx, cy, R - c.line * 0.5 - 0.12, Math.PI * 0.1, Math.PI * 0.55);
      p.strokeStyle = alpha('#7fa6c8', 0.6);
      p.lineWidth = 0.3;
      p.stroke();
    },
    (p, c) => {
      p.beginPath();
      p.arc(cx, cy, R, 0, TAU);
      p.lineWidth = 2 * (c.line / 0.6);
      p.stroke();
    },
  );
  void L;
}
