import { Canvas } from '../canvas.ts';
import type { Bitmap, Color, Pen } from '../types.ts';
import { alpha, mix, path, shade } from '../iso.ts';
import { drawHead, hairBehind, star } from './head.ts';
import { GOLD, WHITE, type Look } from './look.ts';
import { apply, move, mul, turn, type Mat, type Sketch } from './paint.ts';
import { drawProp } from './props.ts';
import { FORE, HEAD_UP, HIP, NECK, SH, SHIN, THIGH, UPPER, type Prop, type Rig, type V } from './rig.ts';

// A whole figure from its rig: legs, the costume, arms, head and what is
// held, each recorded in its own frame and ordered back to front for the
// view (from the front arm and leg A are near; from behind, B).

const TAU = Math.PI * 2;
// Lying on its back, head to screen-left: the standing frame turned a
// quarter (its front up), the body centred over the anchor.
const LIE: Mat = mul(move(6.9, -2.75), turn(-Math.PI / 2 + 0.04));

export type View = { back: boolean; item: Color | null; frame: number; bandaged?: boolean };

// Two-bone IK from s toward t: the joint, and the end (pulled in when out
// of reach). bend +1 bends the joint clockwise of the line on screen.
export function ik(s: V, t: V, a: number, b: number, bend: number): [V, V] {
  const dx = t[0] - s[0];
  const dy = t[1] - s[1];
  let d = Math.hypot(dx, dy);
  const max = (a + b) * 0.999;
  const min = Math.abs(a - b) + 1e-3;
  const ux = d > 1e-9 ? dx / d : 0;
  const uy = d > 1e-9 ? dy / d : 1;
  d = Math.max(min, Math.min(max, d));
  const end: V = [s[0] + ux * d, s[1] + uy * d];
  const cos = (a * a + d * d - b * b) / (2 * a * d);
  const al = Math.acos(Math.max(-1, Math.min(1, cos))) * bend;
  const ang = Math.atan2(uy, ux) + al;
  return [[s[0] + a * Math.cos(ang), s[1] + a * Math.sin(ang)], end];
}

const lerp = (p: V, q: V, k: number): V => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];

type ArmRig = { s: V; e: V; h: V; k: 0 | 1 };
type LegRig = { hip: V; kn: V; ft: V; ang: number };

export function buildFigure(sk: Sketch, r: Rig, L: Look, v: View): void {
  const back = v.back;
  const ghost = L.sp === 'ghost';
  const root: Mat = r.mode === 'lie' ? LIE : move(r.shake, ghost ? -r.hover : 0);
  sk.push(root);
  const B = mul(move(r.pelvis[0], r.pelvis[1]), turn(r.lean));
  const arms: ArmRig[] = ([0, 1] as const).map((k) => {
    const s: V = [SH[k][0], SH[k][1] - r.chest];
    const [e, h] = ik(s, r.arms[k].hand, UPPER, FORE, r.arms[k].bend);
    return { s, e, h, k };
  });
  const legs: LegRig[] = ([0, 1] as const).map((k) => {
    const hip = apply(B, HIP[k][0], HIP[k][1]);
    const g = r.legs[k];
    const [kn, ft] = ik(hip, g.foot, THIGH, SHIN, g.bend);
    return { hip, kn, ft, ang: g.ang };
  });
  const H = mul(B, mul(move(NECK[0], NECK[1] - r.chest), mul(turn(r.tilt), move(0.1, -HEAD_UP))));
  const top = -4.75 - r.chest;
  // the skirt's hem (robes, coats, sheets), in the body frame: about the
  // floor (a robe), the knee (a coat), floating (a ghost)
  const floorY = -r.pelvis[1];

  // ★10: the aura's twinkles (its glow goes under everything, see auraGlow)
  if (L.aura) twinkles(sk, r.t);

  const parts: Array<[number, () => void]> = [];
  const add = (z: number, fn: () => void, frame: Mat = B) => parts.push([z, () => sk.at(frame, fn)]);

  // ---- arms
  for (const a of arms) {
    const arm = r.arms[a.k];
    const near = back ? a.k === 1 : a.k === 0;
    let z: number;
    if (back) z = arm.fwd ? 0.5 : near ? 8 : 1;
    else if (near) z = 8;
    else z = arm.high ? 8.5 : arm.fwd ? 6 : 1;
    add(z, () => drawArm(sk, L, a, arm.grip));
  }

  // ---- legs, hips and skirts
  const sitting = r.mode !== 'stand';
  if (!ghost) {
    for (const k of [0, 1] as const) {
      const near = back ? k === 1 : k === 0;
      add(near ? 3 : 2, () => drawLeg(sk, L, legs[k], back, sitting), ID_ROOT);
    }
  }
  add(4, () => hips(sk, L, r, floorY, back, sitting));

  // ---- torso and what hangs on it
  add(5, () => torso(sk, L, top, back, r, floorY));
  if (L.badge && !back) add(5.2, () => badge(sk, top));
  if (L.costume === 'astronaut') add(back ? 6 : 0, () => pack(sk, L, top, back));
  if (L.costume === 'astronaut') add(6.9, () => sk.blob((p) => p.ellipse(0.15, top - 0.02, 2.45, 0.72, 0, 0, TAU), '#c3cad6', { dark: '#9aa3b2', d: 0.2 }));
  if (L.costume === 'hacker' && !L.hoodUp) add(back ? 6 : 0, () => hoodDown(sk, L, top, back));
  if (L.sp === 'cat') add(back ? 6 : 0, () => tail(sk, L, r.t));

  // ---- head
  add(back ? 6 : 0, () => hairBehind(sk, L, { back, t: r.t, carry: false, frame: v.frame }), H);
  add(7, () => drawHead(sk, L, r.face, { back, t: r.t, carry: hasBlockOnHead(r), frame: v.frame, bandaged: v.bandaged }), H);

  // ---- props
  for (const pr of r.props) {
    const at: V = pr.hand >= 0 ? [arms[pr.hand].h[0] + pr.x, arms[pr.hand].h[1] + pr.y] : [pr.x, pr.y];
    add(propZ(pr, back), () => drawProp(sk, pr, at, L, v.item));
  }

  parts.sort((a, b) => a[0] - b[0]);
  for (const [, fn] of parts) fn();
  sk.pop();
}

const ID_ROOT: Mat = [1, 0, 0, 1, 0, 0];

const hasBlockOnHead = (r: Rig) => r.props.some((p) => p.kind === 'block' && !p.fwd);

function propZ(pr: Prop, back: boolean): number {
  switch (pr.kind) {
    case 'book':
    case 'notepad':
      return back ? 0.2 : 5.5;
    case 'tablet':
      return back ? 0.2 : 8.7;
    case 'thought':
    case 'sweat':
    case 'spark':
      return 9;
    case 'block':
      return pr.fwd ? (back ? 0.2 : 9) : 9;
    case 'mallet':
      return pr.fwd ? (back ? 0.2 : 9) : back ? 9 : 6.8;
    default:
      return back ? 0.2 : 9;
  }
}

// ---- legs -------------------------------------------------------------------

function shoe(len: number) {
  return (p: Pen) => {
    const h = -0.62;
    p.moveTo(h, 0.62);
    p.lineTo(len - 0.4, 0.62);
    p.quadraticCurveTo(len + 0.12, 0.62, len + 0.1, 0.12);
    p.quadraticCurveTo(len + 0.02, -0.45, len - 0.55, -0.45);
    p.lineTo(h + 0.3, -0.45);
    p.quadraticCurveTo(h - 0.12, -0.45, h - 0.12, 0.1);
    p.quadraticCurveTo(h - 0.12, 0.62, h, 0.62);
    p.closePath();
  };
}

function drawLeg(sk: Sketch, L: Look, g: LegRig, back: boolean, sitting: boolean): void {
  const w = L.costume === 'astronaut' ? 1.8 : 1.5;
  const robe = L.costume === 'wizard';
  const c = robe && sitting ? L.top : L.legs;
  const cd = robe && sitting ? L.topD : L.legsD;
  sk.limb([g.hip[0], g.hip[1], g.kn[0], g.kn[1], g.ft[0], g.ft[1]], robe && sitting ? 1.85 : w, c, { dark: cd });
  if (L.costume === 'raver' && !back) {
    // a neon stripe down the leggings
    sk.draw((p, k) => {
      p.beginPath();
      p.moveTo(g.hip[0] + 0.35, g.hip[1] + 0.3);
      p.lineTo(g.kn[0] + 0.4, g.kn[1]);
      p.lineTo(g.ft[0] + 0.35, g.ft[1] - 0.3);
      p.strokeStyle = L.color;
      p.lineWidth = Math.max(0.22, 0.9 / k.px);
      p.lineCap = 'round';
      p.lineJoin = 'round';
      p.stroke();
    });
  }
  const big = L.costume === 'astronaut' ? 1.18 : L.costume === 'raver' ? 1.1 : 1;
  sk.at(mul(move(g.ft[0], g.ft[1]), mul(turn(g.ang), [big, 0, 0, big, 0, 0])), () => {
    const s = shoe(back ? 0.55 : 1.1);
    sk.blob(s, L.shoe, { dark: L.shoeD, d: 0.25 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      s(p);
      p.clip();
      p.fillStyle = L.sole;
      p.fillRect(-1, 0.3, 3, 0.5);
      p.restore();
    });
  });
}

// The seat of the trousers, or the skirt of a robe, coat or sheet.
function hips(sk: Sketch, L: Look, r: Rig, floorY: number, back: boolean, sitting: boolean): void {
  const cx = 0.1;
  if (L.sp === 'ghost') return;
  if (L.costume === 'wizard' && !sitting) {
    const hem = Math.min(floorY - 0.7, 3.3);
    const sw = r.sway * 0.3;
    const robe = (p: Pen) => path(p, [[cx - 2.15, -1.2], [cx + 2.2, -1.2], [cx + 2.85 + sw, hem], [cx - 2.75 + sw, hem]], 0.55);
    sk.blob(robe, L.top, { dark: L.topD, d: 0.7 });
    sk.draw((p) => {
      p.save();
      p.beginPath();
      robe(p);
      p.clip();
      p.fillStyle = L.trim;
      p.fillRect(cx - 4, hem - 0.6, 8, 0.6);
      if (!back) {
        p.fillStyle = shade(L.top, -0.1);
        p.beginPath();
        p.moveTo(cx + 0.6, -1.2);
        p.lineTo(cx + 1.2 + sw, hem - 0.6);
        p.lineTo(cx + 0.2 + sw, hem - 0.6);
        p.closePath();
        p.fill();
      }
      p.restore();
    });
    return;
  }
  if (L.costume === 'scientist') {
    const hem = sitting ? 0.9 : Math.min(floorY - 1.4, 1.95);
    const coat = (p: Pen) => path(p, [[cx - 2.15, -1.5], [cx + 2.25, -1.5], [cx + 2.55, hem], [cx - 2.45, hem]], 0.45);
    sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
    sk.blob(coat, L.top, { dark: L.topD, d: 0.6 });
    sk.draw((p, k) => {
      p.strokeStyle = k.ink;
      p.lineWidth = k.line;
      p.lineCap = 'round';
      p.beginPath();
      if (back) {
        p.moveTo(cx - 0.4, -0.2);
        p.lineTo(cx - 0.4, hem);
      } else {
        p.moveTo(cx + 0.6, -1.4);
        p.lineTo(cx + 0.7, hem);
      }
      p.stroke();
    });
    return;
  }
  sk.blob((p) => p.roundRect(-2.0, -0.8, 4.25, 1.4, 0.6), L.legs, { dark: L.legsD, d: 0.3 });
}

// ---- torso ------------------------------------------------------------------

// ★3: a gold star badge pinned on the chest.
function badge(sk: Sketch, top: number): void {
  const x = 1.45;
  const y = top + 1.35;
  sk.blob((p) => p.arc(x, y, 0.62, 0, TAU), GOLD, { dark: shade(GOLD, -0.22), d: 0.16, line: 0.6, sil: false });
  sk.draw((p) => star(p, x - 0.02, y + 0.02, 0.4, '#fff8dc'));
}

// ★10: a soft glow in its own colour round it, and a twinkle or two. The
// glow is a gradient over most of the sprite, the dearest thing a figure
// draws: it is painted once a scale and colour, a picture laid under the
// figure (its centre and picture here, in the root frame's units; a
// sleeper's lies along the floor with it).
const AURA = { x: 0.1, y: -6.6, rx: 6.0, ry: 8.4 };
const glows = new Map<string, Canvas>();

export function auraGlow(r: Rig, L: Look, s: number): { img: Bitmap; x: number; y: number } {
  const lie = r.mode === 'lie';
  const [x, y] = lie ? apply(LIE, AURA.x, AURA.y) : [AURA.x + r.shake, AURA.y - (L.sp === 'ghost' ? r.hover : 0)];
  const key = `${s}|${L.color}|${lie ? 1 : 0}`;
  let img = glows.get(key);
  if (!img) {
    const [rx, ry] = lie ? [AURA.ry, AURA.rx] : [AURA.rx, AURA.ry];
    img = new Canvas(Math.ceil(2 * rx * s) + 2, Math.ceil(2 * ry * s) + 2);
    img.setTransform(s, 0, 0, s, img.width / 2, img.height / 2);
    const g = img.createRadialGradient(0, 0, 0.5, 0, 0, AURA.ry);
    g.addColorStop(0, alpha(L.color, 0.38));
    g.addColorStop(0.55, alpha(L.color, 0.18));
    g.addColorStop(1, alpha(L.color, 0));
    img.beginPath();
    img.ellipse(0, 0, rx, ry, 0, 0, TAU);
    img.fillStyle = g;
    img.fill();
    if (glows.size >= 32) glows.delete(glows.keys().next().value!);
    glows.set(key, img);
  }
  return { img, x, y };
}

function twinkles(sk: Sketch, t: number): void {
  sk.draw((p) => {
    for (const [x, y, ph] of [[-4.3, -11.2, 0], [4.2, -4.4, 2.1], [3.6, -12.6, 4.2]]) {
      const k = 0.5 + 0.5 * Math.sin(t * 5 + ph);
      const r = 0.35 + 0.35 * k;
      p.beginPath();
      p.moveTo(x, y - r * 2);
      p.quadraticCurveTo(x, y, x + r, y);
      p.quadraticCurveTo(x, y, x, y + r * 2);
      p.quadraticCurveTo(x, y, x - r, y);
      p.quadraticCurveTo(x, y, x, y - r * 2);
      p.closePath();
      p.fillStyle = alpha(WHITE, 0.55 + 0.4 * k);
      p.fill();
    }
  });
}

function torso(sk: Sketch, L: Look, top: number, back: boolean, r: Rig, floorY: number): void {
  const cx = 0.1;
  const xF = back ? cx - 0.45 : cx + 0.55;
  if (L.sp === 'ghost') {
    ghostSheet(sk, L, top, r, back, Math.min(2.35, floorY - 0.9));
    return;
  }
  const astro = L.costume === 'astronaut';
  const wt = astro ? 2.15 : 1.95;
  const wb = astro ? 2.4 : 2.2;
  const bot = L.costume === 'wizard' ? 0.1 : 0.35;
  const shape = (p: Pen) => path(p, [[cx - wt, top], [cx + wt, top], [cx + wb, bot], [cx - wb, bot]], 1.0);
  sk.blob(shape, L.top, { dark: L.topD, d: 0.65 });
  sk.draw((p, k) => {
    p.save();
    p.beginPath();
    shape(p);
    p.clip();
    dress(p, k.ink, k.line, k.px, L, top, bot, xF, back);
    // the head's shadow on the shoulders
    p.beginPath();
    p.ellipse(back ? -0.1 : 0.4, top - 0.3, 2.2, 0.95, 0, 0, TAU);
    p.fillStyle = alpha('#1a1030', 0.17);
    p.fill();
    p.restore();
  });
}

// Costume and print details over the torso (clipped to it).
function dress(p: Pen, ink: Color, line: number, px: number, L: Look, top: number, bot: number, xF: number, back: boolean): void {
  p.lineCap = 'round';
  p.lineJoin = 'round';
  const stroke = (w = line) => {
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
  };
  switch (L.costume) {
    case 'scientist':
      if (back) {
        p.fillStyle = shade(L.top, -0.08);
        p.fillRect(xF - 0.9, -0.85, 1.8, 0.35);
        p.beginPath();
        p.rect(xF - 0.9, -0.85, 1.8, 0.35);
        stroke(line * 0.8);
        return;
      }
      // the shirt and tie in the coat's open front, lapels, a pocket and pen
      p.beginPath();
      p.moveTo(xF - 0.95, top - 0.2);
      p.lineTo(xF + 0.95, top - 0.2);
      p.lineTo(xF + 0.05, top + 2.35);
      p.closePath();
      p.fillStyle = L.under;
      p.fill();
      stroke();
      p.beginPath();
      p.moveTo(xF - 0.12, top + 0.35);
      p.lineTo(xF + 0.22, top + 0.35);
      p.lineTo(xF + 0.2, top + 1.55);
      p.lineTo(xF + 0.04, top + 1.85);
      p.lineTo(xF - 0.12, top + 1.55);
      p.closePath();
      p.fillStyle = L.trimD;
      p.fill();
      p.beginPath();
      p.moveTo(xF + 0.05, top + 2.35);
      p.lineTo(xF + 0.15, bot + 1);
      stroke();
      p.beginPath();
      p.roundRect(xF - 1.95, top + 1.45, 0.95, 0.85, 0.15);
      stroke(line * 0.8);
      p.fillStyle = L.color;
      p.fillRect(xF - 1.75, top + 1.05, 0.22, 0.6);
      return;
    case 'hacker':
      if (back) return;
      p.beginPath();
      p.roundRect(xF - 1.35, -1.75, 2.6, 1.35, 0.5);
      p.fillStyle = shade(L.top, -0.12);
      p.fill();
      stroke(line * 0.9);
      p.strokeStyle = '#e8e6ee';
      p.lineWidth = Math.max(0.2, 1 / px);
      p.beginPath();
      p.moveTo(xF - 0.45, top + 0.35);
      p.lineTo(xF - 0.55, top + 1.6);
      p.moveTo(xF + 0.45, top + 0.35);
      p.lineTo(xF + 0.5, top + 1.55);
      p.stroke();
      if (L.pattern === '║') {
        p.beginPath();
        p.moveTo(xF, top);
        p.lineTo(xF, -1.75);
        stroke(line * 0.8);
      }
      return;
    case 'astronaut':
      if (back) return;
      p.beginPath();
      p.roundRect(xF - 1.05, top + 1.05, 2.05, 1.4, 0.35);
      p.fillStyle = L.color;
      p.fill();
      stroke(line * 0.9);
      for (const [dx, c] of [[-0.55, '#ff5d5d'], [0, '#ffd166'], [0.55, '#5dffb0']] as const) {
        p.beginPath();
        p.arc(xF + dx, top + 1.75, 0.2, 0, TAU);
        p.fillStyle = c;
        p.fill();
      }
      p.fillStyle = '#9aa4b4';
      p.fillRect(xF - 4, -0.45, 8, 0.5);
      p.beginPath();
      p.moveTo(-4, -0.45);
      p.lineTo(4, -0.45);
      stroke(line * 0.8);
      return;
    case 'raver':
      if (!back) {
        p.beginPath();
        p.ellipse(xF, top - 0.15, 0.95, 0.75, 0, 0, Math.PI);
        p.fillStyle = L.skin;
        p.fill();
        stroke(line * 0.9);
      }
      // a glowing belt
      p.fillStyle = alpha(L.color, 0.45);
      p.fillRect(-4, -0.75, 8, 0.85);
      p.fillStyle = mix(L.color, '#ffffff', 0.35);
      p.fillRect(-4, -0.55, 8, 0.4);
      break;
    case 'wizard':
      if (!back) {
        // a V collar in the trim
        p.beginPath();
        p.moveTo(xF - 1.0, top - 0.1);
        p.lineTo(xF + 0.05, top + 1.25);
        p.lineTo(xF + 1.0, top - 0.1);
        p.lineTo(xF + 0.55, top - 0.1);
        p.lineTo(xF + 0.05, top + 0.6);
        p.lineTo(xF - 0.55, top - 0.1);
        p.closePath();
        p.fillStyle = L.trim;
        p.fill();
        stroke(line * 0.8);
      }
      break;
  }
  print(p, ink, line, px, L, top, bot, xF, back);
}

// The `pattern` trait as a print on the shirt (stripes go all the way round;
// the rest show from the front).
function print(p: Pen, ink: Color, line: number, px: number, L: Look, top: number, bot: number, xF: number, back: boolean): void {
  const trim = L.trim;
  const stroke = (w = line) => {
    p.strokeStyle = ink;
    p.lineWidth = w;
    p.stroke();
  };
  switch (L.pattern) {
    case '▓':
      p.fillStyle = trim;
      for (const y of [top + 1.35, top + 2.6]) p.fillRect(-4, y, 8, 0.55);
      return;
    case '▒':
      if (back) return;
      p.fillStyle = trim;
      for (const [dx, dy] of [[-0.9, 1.3], [0.6, 0.9], [1.2, 2.4], [-0.3, 2.8], [-1.4, 3.6]] as const) {
        p.beginPath();
        if (L.costume === 'wizard') {
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            const r = k % 2 ? 0.14 : 0.36;
            p.lineTo(xF + dx + r * Math.cos(a), top + dy + r * Math.sin(a));
          }
          p.closePath();
        } else p.arc(xF + dx, top + dy, 0.2, 0, TAU);
        p.fill();
      }
      return;
    case '▼':
      if (back || L.costume === 'wizard') return;
      p.beginPath();
      p.moveTo(xF - 0.8, top - 0.1);
      p.lineTo(xF + 0.05, top + 1.3);
      p.lineTo(xF + 0.85, top - 0.1);
      p.closePath();
      p.fillStyle = L.skin;
      p.fill();
      p.strokeStyle = trim;
      p.lineWidth = 0.32;
      p.stroke();
      return;
    case '◆':
      if (back) return;
      p.beginPath();
      p.moveTo(xF + 0.1, top + 1.05);
      p.lineTo(xF + 0.65, top + 1.75);
      p.lineTo(xF + 0.1, top + 2.45);
      p.lineTo(xF - 0.45, top + 1.75);
      p.closePath();
      p.fillStyle = trim;
      p.fill();
      stroke(line * 0.8);
      return;
    case '║':
      if (back || L.costume === 'hacker') return;
      p.beginPath();
      p.moveTo(xF, top);
      p.lineTo(xF + 0.05, bot);
      stroke(line * 0.9);
      p.beginPath();
      p.roundRect(xF - 0.16, top + 0.45, 0.36, 0.6, 0.1);
      p.fillStyle = trim;
      p.fill();
      return;
    case '╋':
      p.fillStyle = '#4a2f22';
      p.fillRect(-4, -0.7, 8, 0.6);
      if (back) return;
      p.beginPath();
      p.roundRect(xF - 0.35, -0.8, 0.7, 0.8, 0.12);
      p.fillStyle = '#ffd166';
      p.fill();
      stroke(line * 0.8);
      return;
    case '♥':
      if (back) return;
      p.beginPath();
      heart(p, xF + 0.05, top + 1.85, 0.62);
      p.fillStyle = trim;
      p.fill();
      stroke(line * 0.8);
      return;
  }
  void px;
}

export function heart(p: Pen, x: number, y: number, r: number): void {
  p.moveTo(x, y + r * 0.95);
  p.bezierCurveTo(x - r * 1.5, y, x - r * 0.95, y - r * 1.15, x, y - r * 0.4);
  p.bezierCurveTo(x + r * 0.95, y - r * 1.15, x + r * 1.5, y, x, y + r * 0.95);
  p.closePath();
}

function ghostSheet(sk: Sketch, L: Look, top: number, r: Rig, back: boolean, hem: number): void {
  const sw = r.sway * 0.35;
  const ph = r.t * 5;
  const sheet = (p: Pen) => {
    p.moveTo(-1.9, top);
    p.lineTo(2.0, top);
    p.quadraticCurveTo(2.6, top + 2.5, 2.95 + sw, hem - 0.2);
    const n = 4;
    const x0 = 2.95 + sw;
    const x1 = -2.8 + sw;
    for (let j = 0; j < n; j++) {
      const xa = x0 + ((x1 - x0) * (j + 0.5)) / n;
      const xb = x0 + ((x1 - x0) * (j + 1)) / n;
      const wob = 0.15 * Math.sin(ph + j * 1.7);
      p.quadraticCurveTo(xa, hem + 0.75 + wob, xb, hem - 0.05 * (j % 2));
    }
    p.quadraticCurveTo(-2.5, top + 2.5, -1.9, top);
    p.closePath();
  };
  sk.blob(sheet, L.top, { dark: L.topD, d: 0.7 });
  if (L.costume === 'raver' && !back) {
    sk.draw((p) => {
      p.save();
      p.beginPath();
      sheet(p);
      p.clip();
      p.fillStyle = alpha(L.color, 0.5);
      p.fillRect(-4, -0.6, 8, 0.6);
      p.restore();
    });
  }
}

function pack(sk: Sketch, L: Look, top: number, back: boolean): void {
  const c = L.color;
  if (back) {
    sk.blob((p) => p.roundRect(-1.95, top + 0.35, 3.5, 4.0, 0.8), c, { dark: shade(c, -0.22), d: 0.55 });
    sk.draw((p, k) => {
      p.strokeStyle = k.ink;
      p.lineWidth = k.line;
      p.lineCap = 'round';
      p.beginPath();
      for (const y of [top + 1.4, top + 2.1, top + 2.8]) {
        p.moveTo(-1.1, y);
        p.lineTo(0.7, y);
      }
      p.stroke();
    });
  } else {
    sk.blob((p) => p.roundRect(-3.15, top + 0.3, 2.4, 4.0, 0.8), c, { dark: shade(c, -0.22), d: 0.5 });
  }
}

function hoodDown(sk: Sketch, L: Look, top: number, back: boolean): void {
  if (back) {
    sk.blob((p) => {
      p.moveTo(-2.0, top + 0.1);
      p.quadraticCurveTo(-0.35, top - 0.5, 1.3, top + 0.1);
      p.quadraticCurveTo(1.0, top + 2.4, -0.35, top + 2.7);
      p.quadraticCurveTo(-1.7, top + 2.4, -2.0, top + 0.1);
      p.closePath();
    }, shade(L.top, -0.08), { dark: L.topD, d: 0.4 });
  } else {
    sk.blob((p) => p.ellipse(-0.55, top + 0.1, 2.15, 0.95, -0.1, 0, TAU), shade(L.top, -0.08), { dark: L.topD, d: 0.3 });
  }
}

function tail(sk: Sketch, L: Look, t: number): void {
  const w = Math.sin(t * 2.6) * 0.5;
  sk.limb([-1.6, -0.3, -3.0, -0.6, -3.7 + w * 0.3, -2.0, -3.3 + w, -3.6], 0.85, L.skin, { dark: L.skinD });
}

// ---- arms ---------------------------------------------------------------------

function drawArm(sk: Sketch, L: Look, a: ArmRig, grip: 'fist' | 'open' | 'point'): void {
  const pts = [a.s[0], a.s[1], a.e[0], a.e[1], a.h[0], a.h[1]];
  const ghost = L.sp === 'ghost';
  if (ghost) {
    sk.limb(pts, 1.1, L.top, { dark: L.topD });
    return;
  }
  switch (L.sleeve) {
    case 'tee': {
      sk.limb(pts, 1.0, L.skin, { dark: L.skinD });
      const m = lerp(a.s, a.e, 0.62);
      sk.limb([a.s[0], a.s[1], m[0], m[1]], 1.42, L.top, { dark: L.topD });
      break;
    }
    case 'bare': {
      sk.limb(pts, 1.0, L.skin, { dark: L.skinD });
      const b0 = lerp(a.e, a.h, 0.55);
      const b1 = lerp(a.e, a.h, 0.72);
      sk.draw((p, k) => {
        p.beginPath();
        p.moveTo(b0[0], b0[1]);
        p.lineTo(b1[0], b1[1]);
        p.lineCap = 'round';
        p.strokeStyle = alpha(L.color, 0.35);
        p.lineWidth = 1.9;
        p.stroke();
        p.strokeStyle = k.ink;
        p.lineWidth = 1.12 + k.line;
        p.stroke();
        p.strokeStyle = mix(L.color, '#ffffff', 0.35);
        p.lineWidth = 1.12;
        p.stroke();
      });
      break;
    }
    case 'wide': {
      sk.limb(pts, 1.3, L.top, { dark: L.topD });
      const c0 = lerp(a.e, a.h, 0.5);
      const c1 = lerp(a.e, a.h, 0.8);
      sk.limb([c0[0], c0[1], c1[0], c1[1]], 1.65, L.trim, { dark: L.trimD });
      break;
    }
    default: {
      const astro = L.costume === 'astronaut';
      sk.limb(pts, astro ? 1.4 : 1.18, L.top, { dark: L.topD });
      const c0 = lerp(a.e, a.h, 0.62);
      const c1 = lerp(a.e, a.h, 0.82);
      const cuff = L.costume === 'hacker' ? shade(L.top, -0.12) : astro ? L.color : shade(L.top, -0.06);
      sk.limb([c0[0], c0[1], c1[0], c1[1]], astro ? 1.5 : 1.28, cuff, { line: 0.6 });
    }
  }
  hand(sk, L, a, grip);
}

function hand(sk: Sketch, L: Look, a: ArmRig, grip: 'fist' | 'open' | 'point'): void {
  const dx = a.h[0] - a.e[0];
  const dy = a.h[1] - a.e[1];
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const r = L.costume === 'astronaut' ? 0.68 : 0.6;
  if (grip === 'point') {
    sk.limb([a.h[0], a.h[1], a.h[0] + ux * 0.95, a.h[1] + uy * 0.95], 0.38, L.hand, { line: 0.6 });
  }
  if (grip === 'open') {
    // a thumb sticking up off the hand
    const tx = -uy;
    const ty = ux;
    const s = ty > 0 ? -1 : 1;
    sk.limb([a.h[0], a.h[1], a.h[0] + (ux * 0.35 + s * tx * 0.55), a.h[1] + (uy * 0.35 + s * ty * 0.55)], 0.36, L.hand, { line: 0.6 });
  }
  sk.blob((p) => p.arc(a.h[0], a.h[1], grip === 'open' ? r * 1.05 : r, 0, TAU), L.hand, { dark: L.handD, d: 0.2 });
}
