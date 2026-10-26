import type { Pen } from '../types.ts';
import { alpha, mix, shade } from '../iso.ts';
import { FUR, FUR_D, GOLD, LEATHER, WHITE, type Look } from './look.ts';
import { CLOTHES, STARTUP } from './look.ts';
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
const LIGHT = '#8ff8ff'; // the lights in an exosuit helmet's side discs

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

// The game and setting worlds' hats (★2; a devil's horns are no hat) are
// worn down over the head: a bun, a quiff and a cat's ears go under them
// (unless the hat is off, a block carried on the head), so nothing pokes
// out through a cone or a helm.
const TUCKS: ReadonlySet<string> = new Set(['straw', 'helm', 'visor', 'flatcap', 'rancher', 'lampcap', 'mushroom', 'trapper', 'peaked']);
const tucked = (L: Look, o: HeadOpts) => L.prize !== null && TUCKS.has(L.prize) && !o.carry;

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
  if (L.sp === 'cat' && !hood && !tucked(L, o)) catEars(sk, L, back);
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
  if (L.costume === 'miner' && !back && L.sp !== 'robot' && L.sp !== 'ghost') soot(sk);

  // hair (a bun or a quiff won't fit in a space helmet)
  if (human && !hood) {
    const tall = L.costume !== 'astronaut' && !tucked(L, o);
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
  if (human && !hood && L.costume === 'nord') braids(sk, L, back);
  if (!human && !hood && L.costume !== 'astronaut') headShine(sk, L, back);
  if (L.sp === 'ghost' && L.style % 3 === 0 && !back) {
    // a little curl on top
    sk.limb([0.2, -3.0, 0.4, -3.7, 1.0, -3.75, 0.95, -3.35], 0.32, L.skin, { line: 0.6 });
  }

  // a plaster, under whatever goes on the head
  if (o.bandaged && plastered(L, back, o.carry)) plaster(sk, back);

  // a headset goes on under a hat, anything else over it; a helmet's shell
  // or a helm's cheek plates cover the ears, so its cup goes on over those
  if (L.acc === 'headset' && (wizardHat(L) || L.prize)) {
    accessory(sk, L, o, face);
    headwear(sk, L, o);
    if ((L.prize === 'visor' || L.prize === 'helm') && !o.carry) earCup(sk, L, back);
  } else {
    headwear(sk, L, o);
    accessory(sk, L, o, face);
  }

  if (L.costume === 'demon' && (L.prize !== 'horns' || o.carry) && L.acc !== 'lamp') nubs(sk, L, back);
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

// A nord's two braids, tied at the ends in its trim: over the shoulders
// from the front, down the back from behind.
function braids(sk: Sketch, L: Look, back: boolean): void {
  const ends: ReadonlyArray<readonly [number, number, number, number]> = back
    ? [[-1.95, 1.7, -2.15, 5.4], [1.65, 1.7, 1.85, 5.4]]
    : [[-3.0, 0.8, -3.2, 5.0], [3.15, 1.6, 3.35, 5.0]];
  for (const [x0, y0, x1, y1] of ends) {
    sk.limb([x0, y0, (x0 + x1) / 2 + 0.12, (y0 + y1) / 2, x1, y1], 0.9, L.hair, { dark: L.hairD });
    sk.draw((p, c) => {
      if (c.px < 4) return;
      // the plait
      p.strokeStyle = alpha(c.ink, 0.45);
      p.lineWidth = c.line * 0.7;
      p.lineCap = 'round';
      p.beginPath();
      for (let k = 1; k < 6; k++) {
        const t = k / 6.5;
        const x = x0 + (x1 - x0) * t;
        const y = y0 + (y1 - y0) * t;
        p.moveTo(x - 0.35, y - 0.12);
        p.lineTo(x + 0.3, y + 0.2);
      }
      p.stroke();
    });
    sk.blob(circ(x1, y1 - 0.35, 0.42), L.trim, { dark: L.trimD, d: 0.12, line: 0.5 });
  }
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
    case 'straw': {
      // a low, wide cone of straw sat at the brow, its weave in rings, a
      // cord under the chin (from the front)
      const straw = '#d9b25e';
      const strawD = '#a9843d';
      const cx = sx + 0.1;
      const cy = -1.95;
      const rx = 5.4;
      const ry = 0.85;
      const ax = sx + 0.25;
      const ay = -5.3;
      const cone = (p: Pen) => {
        p.moveTo(ax - 0.25, ay + 0.12);
        p.quadraticCurveTo(ax, ay - 0.08, ax + 0.25, ay + 0.12);
        p.lineTo(cx + rx, cy);
        p.ellipse(cx, cy, rx, ry, 0, 0, Math.PI);
        p.closePath();
      };
      sk.blob(cone, straw, { dark: strawD, d: 0.55 });
      sk.draw((p, k) => {
        // the weave: rings round the cone, and its bound rim
        p.save();
        p.beginPath();
        cone(p);
        p.clip();
        p.strokeStyle = '#8c6a2e';
        p.lineWidth = k.line * 0.8;
        for (const t of [0.36, 0.66, 0.93]) {
          p.beginPath();
          p.ellipse(ax + (cx - ax) * t, ay + (cy - ay) * t, rx * t, ry * t, 0, 0.04, Math.PI - 0.04);
          p.stroke();
        }
        p.restore();
      });
      if (!back) {
        sk.draw((p, k) => {
          p.beginPath();
          p.moveTo(-3.0, -1.3);
          p.quadraticCurveTo(-2.75, 2.3, F, 3.02);
          p.quadraticCurveTo(3.0, 2.4, 3.15, -1.3);
          p.strokeStyle = '#3a2a1e';
          p.lineWidth = lw(k, 0.85);
          p.lineCap = 'round';
          p.stroke();
        });
      }
      return;
    }
    case 'helm': {
      // a rounded iron cap with a raised ridge from front to back, a
      // riveted band, a fur rim at the brow, two short cheek plates and (in
      // front) a nose bar; no horns, no grille
      const iron = '#8e908c';
      const ironD = '#66696a';
      const plate = (x0: number, x1: number) => (p: Pen) => {
        const m = (x0 + x1) / 2;
        p.moveTo(x0, -1.3);
        p.lineTo(x1, -1.3);
        p.quadraticCurveTo(x1 + 0.05, 0.2, m + (x1 - m) * 0.3, 0.8);
        p.quadraticCurveTo(x0 - 0.05, 0.4, x0, -1.3);
        p.closePath();
      };
      for (const [x0, x1] of back ? [[-3.75, -2.75], [2.75, 3.75]] : [[-3.75, -2.6], [2.65, 3.7]]) sk.blob(plate(x0, x1), iron, { dark: ironD, d: 0.25 });
      const dome = (p: Pen) => {
        p.moveTo(-3.75, -1.4);
        p.quadraticCurveTo(-3.95, -4.65, sx, -4.75);
        p.quadraticCurveTo(3.95, -4.65, 3.8, -1.4);
        p.quadraticCurveTo(sx, -1.9, -3.75, -1.4);
        p.closePath();
      };
      sk.blob(dome, iron, { dark: ironD, d: 0.6 });
      // the ridge, raised, from the brow over the crown (or the nape)
      const rx = back ? -0.25 : F + 0.05;
      sk.limb([rx, -2.0, (rx + sx) / 2 + (back ? -0.2 : 0.3), -4.0, sx, -4.78], 0.5, shade(iron, 0.14), { dark: iron });
      const band = (p: Pen) => p.roundRect(-3.95, -2.3, 7.9, 0.85, 0.35);
      sk.blob(band, shade(iron, -0.08), { dark: ironD, d: 0.2 });
      sk.draw((p) => {
        p.fillStyle = '#c9c8c0';
        for (let x = -3.15; x <= 3.3; x += 1.05) {
          if (Math.abs(x - rx) < 0.45) continue;
          p.beginPath();
          p.arc(x, -1.87, 0.16, 0, TAU);
          p.fill();
        }
      });
      // the fur rim, tufted along its lower edge
      sk.blob((p) => {
        p.moveTo(-3.85, -1.6);
        p.quadraticCurveTo(sx, -1.95, 3.9, -1.6);
        p.lineTo(3.85, -1.0);
        bumpy(p, sx, -1.45, 3.85, 0.55, 0, Math.PI, 7, 0.28);
        p.closePath();
      }, FUR, { dark: FUR_D, d: 0.2 });
      if (!back) sk.blob((p) => p.roundRect(F - 0.26, -2.1, 0.52, 3.15, 0.24), iron, { dark: ironD, d: 0.12 });
      return;
    }
    case 'visor': {
      // a round helmet in the suit's colour, open at the face, its rim a
      // shade darker, its visor flipped up over the brow (dark glass, one
      // streak of light), a disc in its second colour at each side with a
      // light in it; no crest, no antenna
      const suit = L.hat;
      const suitD = L.hatD;
      const disc = (x: number, y: number, rx: number, ry: number) => {
        sk.blob(ell(x, y, rx, ry), L.accent, { dark: L.accentD, d: 0.12 });
        sk.blob(ell(x, y, rx * 0.42, ry * 0.42), LIGHT, { line: 0.4, sil: false });
      };
      if (back) {
        sk.blob((p) => {
          p.moveTo(-3.75, 1.5);
          p.quadraticCurveTo(-4.3, -4.8, -0.1, -5.0);
          p.quadraticCurveTo(4.2, -4.8, 3.75, 1.5);
          p.quadraticCurveTo(0.0, 2.2, -3.75, 1.5);
          p.closePath();
        }, suit, { dark: suitD, d: 0.7 });
        sk.blob((p) => p.roundRect(-3.9, 0.15, 7.8, 0.7, 0.3), shade(suit, -0.14), { dark: suitD, d: 0.15 });
        for (const x of [-3.75, 3.75]) disc(x, -0.6, 0.5, 0.85);
        return;
      }
      sk.blob((p) => {
        p.moveTo(-3.85, 1.6);
        p.quadraticCurveTo(-4.4, -4.75, 0.1, -5.0);
        p.quadraticCurveTo(4.35, -4.75, 4.0, -0.35);
        p.quadraticCurveTo(F + 0.6, -2.05, -1.55, -1.15);
        p.quadraticCurveTo(-2.45, 0.2, -2.2, 1.85);
        p.quadraticCurveTo(-3.05, 2.15, -3.85, 1.6);
        p.closePath();
      }, suit, { dark: suitD, d: 0.6 });
      // the rim round the face
      sk.draw((p, k) => {
        p.beginPath();
        p.moveTo(3.85, -0.5);
        p.quadraticCurveTo(F + 0.6, -1.85, -1.4, -1.0);
        p.quadraticCurveTo(-2.25, 0.2, -2.05, 1.7);
        p.lineCap = 'round';
        p.strokeStyle = k.ink;
        p.lineWidth = 0.42 + k.line;
        p.stroke();
        p.strokeStyle = shade(suit, -0.16);
        p.lineWidth = 0.42;
        p.stroke();
      });
      // the visor, flipped up over the brow: dark glass, one streak
      sk.blob(ell(F + 0.2, -2.65, 3.0, 0.92, -0.04), '#1e2a4a', { line: 0.6 });
      sk.draw((p) => {
        p.beginPath();
        p.moveTo(F - 1.75, -2.9);
        p.lineTo(F - 0.35, -3.1);
        p.lineCap = 'round';
        p.strokeStyle = alpha(WHITE, 0.85);
        p.lineWidth = 0.24;
        p.stroke();
      });
      // (a headset's cup goes over the near ear instead, see drawHead)
      if (L.acc !== 'headset') disc(-3.45, 0.55, 0.78, 0.82);
      disc(3.88, -0.45, 0.42, 0.75);
      return;
    }
    case 'flatcap': {
      // a newsboy cap of rust tweed: a soft crown of panels puffed out
      // over a short stiff peak, a button on top
      const tweed = '#8a5a3c';
      const tweedD = '#6a4430';
      if (!back) sk.blob(ell(F + 1.8, -1.5, 1.95, 0.52, 0.14), shade(tweed, -0.2), { dark: tweedD, d: 0.15 });
      const crown = (p: Pen) => {
        if (back) {
          p.moveTo(-3.7, -1.3);
          p.quadraticCurveTo(-4.4, -4.65, sx, -4.9);
          p.quadraticCurveTo(4.4, -4.65, 3.7, -1.3);
          p.quadraticCurveTo(sx, -1.85, -3.7, -1.3);
        } else {
          p.moveTo(-3.6, -1.35);
          p.quadraticCurveTo(-4.45, -4.15, -1.5, -4.75);
          p.quadraticCurveTo(1.6, -5.25, 3.7, -3.75);
          p.quadraticCurveTo(4.75, -2.75, 3.95, -2.1);
          p.quadraticCurveTo(sx, -1.9, -3.6, -1.35);
        }
        p.closePath();
      };
      sk.blob(crown, tweed, { dark: tweedD, d: 0.55 });
      const bx = back ? sx : -0.2;
      sk.draw((p, k) => {
        // its panels' seams, and the band round it
        p.save();
        p.beginPath();
        crown(p);
        p.clip();
        p.strokeStyle = alpha(k.ink, 0.4);
        p.lineWidth = k.line * 0.7;
        p.lineCap = 'round';
        p.beginPath();
        for (const [x1, c1] of (back ? [[-2.6, -2.0], [sx, sx], [2.7, 2.1]] : [[-2.7, -2.3], [0.6, 0.2], [3.4, 2.4]]) as Array<[number, number]>) {
          p.moveTo(bx, -4.75);
          p.quadraticCurveTo(c1, -3.6, x1, -2.1);
        }
        p.stroke();
        p.fillStyle = alpha(tweedD, 0.85);
        p.fillRect(-4.5, back ? -1.95 : -1.95, 9, 1.0);
        p.restore();
      });
      sk.blob(circ(bx, -4.82, 0.32), LEATHER, { line: 0.5 });
      return;
    }
    case 'rancher': {
      // a cowboy hat of tan felt: the brim curled up at the sides, a creased
      // crown with two lobes on top, a band (dark; the trim at ★8)
      const felt = '#c49a63';
      const feltD = '#9c7646';
      const brim = (p: Pen) => {
        p.moveTo(-5.25, -3.2);
        p.quadraticCurveTo(-4.4, -2.45, sx, -2.6);
        p.quadraticCurveTo(4.5, -2.45, 5.35, -3.2);
        p.quadraticCurveTo(5.0, -1.55, sx, -1.45);
        p.quadraticCurveTo(-4.9, -1.55, -5.25, -3.2);
        p.closePath();
      };
      sk.blob(brim, shade(felt, -0.05), { dark: feltD, d: 0.3 });
      const crown = (p: Pen) => {
        p.moveTo(-2.45, -2.4);
        p.lineTo(-2.3, -4.4);
        p.quadraticCurveTo(-1.35, -5.3, sx - 0.15, -4.6);
        p.quadraticCurveTo(sx + 1.05, -5.3, 2.4, -4.4);
        p.lineTo(2.6, -2.4);
        p.quadraticCurveTo(sx, -1.95, -2.45, -2.4);
        p.closePath();
      };
      sk.blob(crown, felt, { dark: feltD, d: 0.5 });
      sk.draw((p, k) => {
        p.save();
        p.beginPath();
        crown(p);
        p.clip();
        p.fillStyle = L.accent;
        p.fillRect(-3.0, -3.15, 6.0, 0.8);
        p.beginPath();
        p.moveTo(-3.0, -3.15);
        p.lineTo(3.0, -3.15);
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.7;
        p.stroke();
        p.restore();
        // the crease down the crown
        p.beginPath();
        p.moveTo(sx - 0.15, -4.55);
        p.quadraticCurveTo(sx + 0.05, -4.0, sx - 0.05, -3.4);
        p.strokeStyle = k.ink;
        p.lineWidth = k.line * 0.8;
        p.lineCap = 'round';
        p.stroke();
      });
      return;
    }
    case 'lampcap':
      lampCap(sk, L, back, sx);
      return;
    case 'mushroom':
      toadstool(sk, L, back, sx);
      return;
    case 'trapper':
      trapperHat(sk, L, back, sx);
      return;
    case 'peaked':
      peakedCap(sk, L, back, sx);
      return;
    case 'horns':
      grandHorns(sk, back);
      return;
    case 'snapback':
      snapback(sk, L, back, sx);
      return;
  }
}

// ★2 at the startup: a snapback worn backwards, a tall structured crown in
// its colour with a button on top, its flat charcoal brim out over the nape;
// from the front, the strap's opening over the brow with the hair showing
// through and the snap strap across it; from behind, the crown's front
// panel and the flat brim toward us. No logo.
function snapback(sk: Sketch, L: Look, back: boolean, sx: number): void {
  const c = L.color;
  const cd = shade(c, -0.24);
  const crown = (p: Pen) => {
    p.moveTo(-3.6, -1.3);
    p.lineTo(-3.8, -3.55);
    p.quadraticCurveTo(-3.55, -5.25, sx, -5.3);
    p.quadraticCurveTo(3.6, -5.25, 3.8, -3.55);
    p.lineTo(3.6, -1.35);
    p.quadraticCurveTo(sx, -1.95, -3.6, -1.3);
    p.closePath();
  };
  // the brim out behind the head, flat and stiff (from the front)
  if (!back) {
    sk.blob((p) => {
      p.moveTo(-2.4, -2.05);
      p.lineTo(-6.15, -2.3);
      p.quadraticCurveTo(-6.45, -2.05, -6.2, -1.75);
      p.lineTo(-2.4, -1.4);
      p.closePath();
    }, STARTUP.brim, { dark: STARTUP.brimD, d: 0.15 });
  }
  sk.blob(crown, c, { dark: cd, d: 0.55 });
  sk.draw((p, k) => {
    // the panels' seams from the button down
    p.save();
    p.beginPath();
    crown(p);
    p.clip();
    p.strokeStyle = alpha(k.ink, 0.45);
    p.lineWidth = k.line * 0.7;
    p.lineCap = 'round';
    p.beginPath();
    for (const [x1, c1] of (back ? [[-2.3, -1.6], [2.2, 1.5]] : [[-2.0, -1.5], [2.6, 1.9]]) as Array<[number, number]>) {
      p.moveTo(sx, -5.25);
      p.quadraticCurveTo(c1, -4.4, x1, -1.6);
    }
    p.stroke();
    p.restore();
  });
  if (back) {
    // the flat brim toward us, its top seen over the nape
    sk.blob((p) => {
      p.moveTo(-3.3, -1.55);
      p.quadraticCurveTo(sx, -2.05, 3.3, -1.6);
      p.quadraticCurveTo(3.55, 0.05, sx, 0.4);
      p.quadraticCurveTo(-3.55, 0.05, -3.3, -1.55);
      p.closePath();
    }, STARTUP.brim, { dark: STARTUP.brimD, d: 0.35 });
  } else {
    // the strap's opening over the brow, the hair through it, the strap
    // with its snaps across
    const gap = (p: Pen) => {
      p.moveTo(F - 0.95, -1.55);
      p.quadraticCurveTo(F - 0.9, -2.75, F + 0.05, -2.8);
      p.quadraticCurveTo(F + 1.0, -2.75, F + 1.05, -1.6);
      p.closePath();
    };
    sk.blob(gap, L.sp === 'human' ? L.hair : L.skin, { line: 0.6, sil: false });
    sk.blob((p) => p.roundRect(F - 1.1, -2.05, 2.2, 0.5, 0.2), STARTUP.brim, { line: 0.5, sil: false });
    sk.draw((p) => {
      p.fillStyle = '#d8dbe2';
      for (const dx of [-0.55, 0.05, 0.6]) {
        p.beginPath();
        p.arc(F + dx, -1.8, 0.11, 0, TAU);
        p.fill();
      }
    });
  }
  sk.blob(circ(sx, -5.3, 0.36), STARTUP.brim, { line: 0.5 });
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
  const c = L.costume === 'hacker' || L.costume === 'startup' || L.sp === 'ghost' ? L.hat : L.topD;
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

// A headset's ear cup with its light in its colour: on the near ear from
// in front, the far one from behind.
function earCup(sk: Sketch, L: Look, back: boolean): void {
  const ex = back ? 3.3 : -3.35;
  sk.blob((p) => p.roundRect(ex - 0.6, -0.55, 1.2, 1.75, 0.5), '#3c3a48', { line: 0.6 });
  sk.blob(circ(ex, 0.32, 0.38), L.color, { line: 0.4, sil: false });
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
      earCup(sk, L, back);
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

// ---- the setting worlds' headwear ---------------------------------------

// A little soot on a miner's near cheek.
function soot(sk: Sketch): void {
  sk.draw((p) => {
    p.fillStyle = alpha('#3a302c', 0.3);
    p.beginPath();
    p.ellipse(F - 2.2, 1.1, 0.62, 0.3, -0.25, 0, TAU);
    p.fill();
    p.beginPath();
    p.ellipse(F - 1.7, 1.48, 0.3, 0.15, -0.25, 0, TAU);
    p.fill();
  });
}

// ★2 in the mines: an old-time miner's soft leather cap, its short peak
// over the brow, and on its front a brass lamp: a little can on a bracket,
// a round reflector dish and a small flame before it, glowing. From
// behind, the rim of the dish shows over the crown.
function lampCap(sk: Sketch, L: Look, back: boolean, sx: number): void {
  const { leather, leatherD, brass, reflector, flame, glow } = CLOTHES;
  const brassD = shade(brass, -0.28);
  const lx = back ? sx - 0.3 : F + 0.3; // the lamp's centre line
  const dy = -4.4; // the dish's centre
  const halo = (r: number, a: number) =>
    sk.draw((p) => {
      const g = p.createRadialGradient(lx, dy, 0.2, lx, dy, r);
      g.addColorStop(0, alpha(glow, a));
      g.addColorStop(1, alpha(glow, 0));
      p.beginPath();
      p.arc(lx, dy, r, 0, TAU);
      p.fillStyle = g;
      p.fill();
    });
  if (back) {
    halo(1.9, 0.45);
    sk.blob(circ(lx, dy, 1.0), brass, { dark: brassD, d: 0.14 });
  }
  const crown = (p: Pen) => {
    p.moveTo(-3.6, -1.2);
    p.quadraticCurveTo(-3.9, -4.4, sx, -4.5);
    p.quadraticCurveTo(3.9, -4.4, 3.65, -1.2);
    p.quadraticCurveTo(sx, -1.9, -3.6, -1.2);
    p.closePath();
  };
  sk.blob(crown, leather, { dark: leatherD, d: 0.5 });
  sk.draw((p, k) => {
    // a band round the brow, a seam over the soft crown
    p.save();
    p.beginPath();
    crown(p);
    p.clip();
    const band = (q: Pen) => {
      q.moveTo(-4, -2.1);
      q.quadraticCurveTo(sx, back ? -2.6 : -2.75, 4, -2.1);
    };
    p.beginPath();
    band(p);
    p.lineTo(4, -1);
    p.lineTo(-4, -1);
    p.closePath();
    p.fillStyle = leatherD;
    p.fill();
    p.beginPath();
    band(p);
    p.strokeStyle = k.ink;
    p.lineWidth = k.line * 0.8;
    p.stroke();
    p.beginPath();
    p.moveTo(sx + (back ? -0.15 : 0.25), -4.45);
    p.quadraticCurveTo(sx + (back ? -0.5 : 0.75), -3.6, sx + (back ? -0.45 : 0.7), -2.7);
    p.lineWidth = k.line * 0.7;
    p.stroke();
    p.restore();
  });
  if (back) return;
  // the peak, out over the brow toward the face
  sk.blob(ell(F + 2.1, -1.4, 1.9, 0.5, 0.12), leather, { dark: leatherD, d: 0.18 });
  // the lamp: its glow, the bracket on the crown, the dish, the can and
  // its flame
  halo(2.4, 0.6);
  sk.blob((p) => p.roundRect(lx - 0.34, -3.05, 0.68, 0.9, 0.18), brass, { dark: brassD, d: 0.12 });
  sk.blob((p) => p.roundRect(lx - 0.45, -3.6, 0.9, 0.7, 0.22), brass, { dark: brassD, d: 0.12 });
  sk.blob(circ(lx, dy, 1.05), brass, { dark: brassD, d: 0.14 });
  sk.blob(circ(lx, dy, 0.7), reflector, { dark: shade(reflector, -0.12), d: 0.12, line: 0.45, sil: false });
  // the flame, out of the dish's centre
  const tongue = (y0: number, h: number, w: number) => (p: Pen) => {
    p.moveTo(lx, y0 - h);
    p.quadraticCurveTo(lx + w, y0 - h * 0.3, lx, y0);
    p.quadraticCurveTo(lx - w, y0 - h * 0.3, lx, y0 - h);
    p.closePath();
  };
  sk.blob(tongue(-3.92, 1.3, 0.95), flame, { line: 0.45, sil: false });
  sk.draw((p) => {
    p.beginPath();
    tongue(-4.02, 0.5, 0.26)(p);
    p.fillStyle = glow;
    p.fill();
  });
}

// ★2 in the caverns: a toadstool's cap, a wide round dome (no point, no
// droop) spotted in cream, its gills showing under the front edge.
function toadstool(sk: Sketch, L: Look, back: boolean, sx: number): void {
  const cap = L.hat;
  const capD = L.hatD;
  const cx = back ? sx : sx + 0.1;
  if (!back) {
    // the gills, under the rim
    const gills = (p: Pen) => {
      p.moveTo(cx - 3.75, -1.45);
      p.quadraticCurveTo(cx, 0.05, cx + 3.75, -1.45);
      p.lineTo(cx + 3.75, -1.8);
      p.lineTo(cx - 3.75, -1.8);
      p.closePath();
    };
    sk.blob(gills, CLOTHES.gills);
    sk.draw((p, k) => {
      if (k.px < 5) return;
      p.save();
      p.beginPath();
      gills(p);
      p.clip();
      p.strokeStyle = alpha(k.ink, 0.35);
      p.lineWidth = k.line * 0.6;
      p.beginPath();
      for (let x = -2.8; x <= 3.0; x += 0.8) {
        p.moveTo(cx + x * 0.92, -1.2);
        p.lineTo(cx + x, -0.6);
      }
      p.stroke();
      p.restore();
    });
  }
  const dome = (p: Pen) => {
    p.moveTo(cx - 4.2, -1.3);
    p.bezierCurveTo(cx - 4.5, -4.65, cx - 2.35, -5.5, cx, -5.5);
    p.bezierCurveTo(cx + 2.35, -5.5, cx + 4.5, -4.65, cx + 4.2, -1.3);
    p.quadraticCurveTo(cx, back ? -1.95 : -1.1, cx - 4.2, -1.3);
    p.closePath();
  };
  sk.blob(dome, cap, { dark: capD, d: 0.6 });
  sk.draw((p, k) => {
    p.save();
    p.beginPath();
    dome(p);
    p.clip();
    // the spots, flat on the dome
    const m = back ? -1 : 1;
    const spots: ReadonlyArray<readonly [number, number, number, number]> = [
      [-2.6, -3.15, 0.62, 0.46], [-0.4, -4.6, 0.56, 0.36], [1.55, -3.55, 0.74, 0.54],
      [3.3, -2.3, 0.44, 0.4], [-1.15, -2.2, 0.42, 0.33], [0.75, -1.85, 0.3, 0.24],
    ];
    for (const [x, y, rx, ry] of spots) {
      p.beginPath();
      p.ellipse(cx + m * x, y, rx, ry, m * x * 0.08, 0, TAU);
      p.fillStyle = CLOTHES.spots;
      p.fill();
      p.strokeStyle = k.ink;
      p.lineWidth = k.line * 0.55;
      p.stroke();
    }
    // a gloss toward the light
    if (k.px >= 5) {
      p.beginPath();
      p.ellipse(cx - 0.2, -2.9, 3.35, 2.25, 0, Math.PI * 1.1, Math.PI * 1.32);
      p.strokeStyle = alpha(WHITE, 0.55);
      p.lineWidth = 0.32;
      p.lineCap = 'round';
      p.stroke();
    }
    p.restore();
  });
}

// ★2 in the snows: a trapper hat: a rounded crown, its fur front flap
// turned up (a fur band all round, from behind), two fur ear flaps hanging
// to the jaw with little ties. No pom-pom.
function trapperHat(sk: Sketch, L: Look, back: boolean, sx: number): void {
  const crown = CLOTHES.trapper;
  const crownD = shade(crown, -0.26);
  const fur = CLOTHES.snowFur;
  const furD = CLOTHES.snowFurD;
  // the ear flaps and their ties
  for (const x of back ? [-3.5, 3.45] : [-3.4, 3.6]) {
    sk.blob((p) => {
      p.moveTo(x - 0.82, -2.1);
      p.lineTo(x + 0.78, -2.1);
      p.quadraticCurveTo(x + 0.82, 1.15, x + 0.5, 1.7);
      p.quadraticCurveTo(x, 2.2, x - 0.5, 1.7);
      p.quadraticCurveTo(x - 0.86, 1.15, x - 0.82, -2.1);
      p.closePath();
    }, fur, { dark: furD, d: 0.3 });
    sk.draw((p, k) => {
      if (k.px < 4) return;
      p.strokeStyle = k.ink;
      p.lineWidth = k.line * 0.7;
      p.lineCap = 'round';
      p.beginPath();
      p.moveTo(x, 1.95);
      p.quadraticCurveTo(x + 0.18, 2.3, x + 0.02, 2.65);
      p.stroke();
      p.beginPath();
      p.arc(x + 0.02, 2.7, 0.12, 0, TAU);
      p.fillStyle = k.ink;
      p.fill();
    });
  }
  const dome = (p: Pen) => {
    p.moveTo(-3.6, -1.6);
    p.quadraticCurveTo(-3.95, -5.25, sx, -5.25);
    p.quadraticCurveTo(4.05, -5.25, 3.7, -1.6);
    p.quadraticCurveTo(sx, -2.2, -3.6, -1.6);
    p.closePath();
  };
  sk.blob(dome, crown, { dark: crownD, d: 0.55 });
  sk.draw((p, k) => {
    // the crown's seam
    p.beginPath();
    p.moveTo(sx + (back ? -0.1 : 0.2), -5.1);
    p.quadraticCurveTo(sx + (back ? -0.35 : 0.55), -4.2, sx + (back ? -0.3 : 0.5), -3.4);
    p.strokeStyle = k.ink;
    p.lineWidth = k.line * 0.7;
    p.lineCap = 'round';
    p.stroke();
  });
  // the fur flap turned up over the brow (the back flap, from behind)
  // its top edge in tufts, rising to `top` over the middle
  const top = back ? -3.15 : -3.6;
  const edge = (u: number) => -2.55 + (top + 2.55) * Math.sin(Math.PI * u);
  const flap = (p: Pen) => {
    p.moveTo(-3.85, -1.0);
    p.lineTo(-3.8, -2.55);
    const n = 6;
    const x0 = -3.8;
    const x1 = 3.95;
    for (let j = 0; j < n; j++) {
      const ua = (j + 0.5) / n;
      const ub = (j + 1) / n;
      p.quadraticCurveTo(x0 + (x1 - x0) * ua, edge(ua) - 0.32, x0 + (x1 - x0) * ub, edge(ub));
    }
    p.lineTo(3.95, -1.2);
    p.quadraticCurveTo(sx, back ? -0.7 : -0.6, -3.85, -1.0);
    p.closePath();
  };
  sk.blob(flap, fur, { dark: furD, d: 0.3 });
  sk.draw((p, k) => {
    if (k.px < 5) return;
    // the fur's lie
    p.save();
    p.beginPath();
    flap(p);
    p.clip();
    p.strokeStyle = alpha(k.ink, 0.22);
    p.lineWidth = k.line * 0.6;
    p.lineCap = 'round';
    p.beginPath();
    for (let x = -3.1; x <= 3.4; x += 0.85) {
      p.moveTo(x, -1.25);
      p.lineTo(x + 0.15, -1.85);
    }
    p.stroke();
    p.restore();
  });
  // (a headset's cup goes over the ear flap)
  if (L.acc === 'headset') earCup(sk, L, back);
}

// ★2 in the vault: a peaked cap: a flat crown wider than its dark band, a
// glossy black peak, a gold cord across the front and a small plain brass
// oval (no emblem, no words) over it.
function peakedCap(sk: Sketch, L: Look, back: boolean, sx: number): void {
  const c = L.hat;
  const cd = L.hatD;
  const cx = back ? sx : sx + 0.15;
  const band = (p: Pen) => p.roundRect(-3.5, -2.65, 7.1, 1.35, 0.4);
  sk.blob(band, CLOTHES.capBand, { dark: shade(CLOTHES.capBand, -0.25), d: 0.2 });
  const crown = (p: Pen) => {
    p.moveTo(-3.4, -2.35);
    p.lineTo(cx - 4.3, -3.95);
    p.ellipse(cx, -4.0, 4.4, 1.05, 0, Math.PI, Math.PI * 2);
    p.lineTo(3.55, -2.35);
    p.closePath();
  };
  sk.blob(crown, c, { dark: cd, d: 0.4 });
  sk.draw((p, k) => {
    // the front edge of the flat top
    p.beginPath();
    p.ellipse(cx, -4.0, 4.4, 1.05, 0, Math.PI * 0.05, Math.PI * 0.95);
    p.strokeStyle = k.ink;
    p.lineWidth = k.line * 0.8;
    p.stroke();
    if (back) return;
    // the gold cord across the band's front
    p.beginPath();
    p.moveTo(-2.9, -2.2);
    p.quadraticCurveTo(F, -2.0, 3.2, -2.25);
    p.lineCap = 'round';
    p.lineWidth = 0.24 + k.line;
    p.stroke();
    p.strokeStyle = CLOTHES.goldCord;
    p.lineWidth = 0.24;
    p.stroke();
  });
  if (back) return;
  sk.blob(ell(F + 0.2, -3.2, 0.5, 0.36), CLOTHES.oval, { dark: shade(CLOTHES.oval, -0.22), d: 0.1, line: 0.5 });
  // the peak, glossy, out over the brow
  const peak = ell(F + 1.2, -1.3, 2.95, 0.66, 0.08);
  sk.blob(peak, CLOTHES.peak, { dark: '#0d0e14', d: 0.15 });
  sk.draw((p) => {
    p.beginPath();
    p.ellipse(F + 0.9, -1.48, 2.0, 0.26, 0.08, Math.PI * 1.05, Math.PI * 1.75);
    p.strokeStyle = alpha(WHITE, 0.7);
    p.lineWidth = 0.18;
    p.lineCap = 'round';
    p.stroke();
  });
}

// A ram's horn from its root on the head: up, out over a curl round
// (cx, cy) and down, narrowing to its tip (s: -1 the screen-left horn, +1
// the right). Its outline, and points across it for the ridges.
function ramHorn(cx: number, cy: number, root: readonly [number, number], s: number): { shape: (p: Pen) => void; ridges: Array<[number, number, number, number]> } {
  const ky = 1.25; // the curl a little taller than wide
  const r0 = Math.hypot(root[0] - cx, (root[1] - cy) / ky);
  const a0 = Math.atan2((root[1] - cy) / ky, root[0] - cx);
  const T = 5.4;
  const n = 30;
  const at = (t: number): [number, number] => {
    const r = r0 * (1 - 0.6 * t);
    const a = a0 + s * t * T;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a) * ky];
  };
  const left: Array<[number, number]> = [];
  const right: Array<[number, number]> = [];
  const ridges: Array<[number, number, number, number]> = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const [x, y] = at(t);
    const [x1, y1] = at(Math.min(1, t + 0.01));
    const [x0, y0] = at(Math.max(0, t - 0.01));
    const tl = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / tl;
    const ny = (x1 - x0) / tl;
    const w = (1.15 - 0.8 * t) / 2;
    left.push([x + nx * w, y + ny * w]);
    right.push([x - nx * w, y - ny * w]);
    if (i % 3 === 1 && t < 0.9) ridges.push([x + nx * w * 0.85, y + ny * w * 0.85, x - nx * w * 0.85, y - ny * w * 0.85]);
  }
  const shape = (p: Pen) => {
    p.moveTo(left[0][0], left[0][1]);
    for (const [x, y] of left.slice(1)) p.lineTo(x, y);
    for (const [x, y] of right.reverse()) p.lineTo(x, y);
    right.reverse();
    p.closePath();
  };
  return { shape, ridges };
}

// ★2 in hell: grand gold ram's horns in place of the nubs, rising off the
// crown and curling back and down beside the head.
function grandHorns(sk: Sketch, back: boolean): void {
  const x0 = back ? -0.15 : 0.25;
  for (const s of [-1, 1]) {
    const { shape, ridges } = ramHorn(x0 + s * 3.2, -2.6, [x0 + s * 1.35, -3.15], s);
    sk.blob(shape, CLOTHES.horn, { dark: CLOTHES.hornD, d: 0.2 });
    sk.draw((p, k) => {
      if (k.px < 4) return;
      p.strokeStyle = alpha(k.ink, 0.45);
      p.lineWidth = k.line * 0.6;
      p.lineCap = 'round';
      p.beginPath();
      for (const [ax, ay, bx, by] of ridges) {
        p.moveTo(ax, ay);
        p.lineTo(bx, by);
      }
      p.stroke();
    });
  }
}

// A devil's little bone horns: a cone either side of the crown, curving a
// little outward (between a cat's ears, beside an alien's antennae).
function nubs(sk: Sketch, L: Look, back: boolean): void {
  const x0 = back ? -0.15 : 0.25;
  const [dx, ry] = L.sp === 'cat' ? [0.55, -2.75] : L.sp === 'alien' ? [1.95, -2.75] : [1.55, -2.8];
  for (const s of [-1, 1]) {
    const bx = x0 + s * dx;
    const tip: [number, number] = [bx + s * 0.42, ry - 1.12];
    const horn = (p: Pen) => {
      p.moveTo(bx - 0.38, ry + 0.1);
      p.quadraticCurveTo(bx - 0.3 + s * 0.05, ry - 0.7, tip[0], tip[1]);
      p.quadraticCurveTo(bx + 0.42 + s * 0.12, ry - 0.55, bx + 0.38, ry + 0.1);
      p.closePath();
    };
    sk.blob(horn, CLOTHES.bone, { dark: CLOTHES.boneD, d: 0.14 });
  }
}
