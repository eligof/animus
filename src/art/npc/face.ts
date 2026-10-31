import type { NpcEyes, NpcMouth } from '../../worlds/types.ts';
import type { Ctx, Sketch } from '../figure/paint.ts';
import type { Color, Pen } from '../types.ts';

// A local's face, front on, in the figures' style (see art/figure/head.ts):
// two eyes `gap` apart on a row at y (the near one, toward -x, a little
// bigger), a mouth `drop` under the row. Open eyes are dark ovals (`r`
// across, a third taller) with a glint toward the light; a blink and shut
// eyes a lid line; happy ones an arc. The mouth: closed, a line; a smile,
// a curve; open, a dark oval with a tongue; o, a small round one.
export type FaceOpts = { x: number; y: number; eyes: NpcEyes; mouth: NpcMouth; gap?: number; r?: number; drop?: number; iris?: Color };

const TAU = Math.PI * 2;
const MOUTH = '#7a2e3b';
const TONGUE = '#ff8f8f';
const WHITE = '#ffffff';
const lw = (c: Ctx, k = 1) => Math.max(c.line * k, 1 / c.px);

export function face(sk: Sketch, o: FaceOpts): void {
  const gap = o.gap ?? 2.3;
  const r = o.r ?? 0.5;
  const drop = o.drop ?? 1.3;
  const iris = o.iris ?? '#2a2030';
  sk.draw((p, c) => {
    p.lineCap = 'round';
    p.lineJoin = 'round';
    p.strokeStyle = c.ink;
    eye(p, c, o.x - gap / 2, o.y, r, o.eyes, iris);
    eye(p, c, o.x + gap / 2, o.y, r * 0.9, o.eyes, iris);
    mouth(p, c, o.x + 0.05, o.y + drop, o.mouth);
  });
}

function eye(p: Pen, c: Ctx, x: number, y: number, r: number, kind: NpcEyes, iris: Color): void {
  const ry = r * 1.4;
  if (kind === 'blink' || kind === 'shut') {
    p.beginPath();
    p.moveTo(x - r * 1.05, y + 0.05);
    p.quadraticCurveTo(x, y + (kind === 'shut' ? 0.42 : 0.28), x + r * 1.05, y + 0.05);
    p.lineWidth = lw(c, 1.15);
    p.stroke();
    return;
  }
  if (kind === 'happy') {
    p.beginPath();
    p.moveTo(x - r * 1.05, y + 0.2);
    p.quadraticCurveTo(x, y - 0.5, x + r * 1.05, y + 0.2);
    p.lineWidth = lw(c, 1.25);
    p.stroke();
    return;
  }
  p.beginPath();
  p.ellipse(x, y, r, ry, 0, 0, TAU);
  p.fillStyle = iris;
  p.fill();
  p.beginPath();
  p.arc(x + c.lx * r * 0.4, y + c.ly * ry * 0.4, Math.max(r * 0.42, 0.55 / c.px), 0, TAU);
  p.fillStyle = WHITE;
  p.fill();
}

function mouth(p: Pen, c: Ctx, x: number, y: number, kind: NpcMouth): void {
  if (kind === 'open' || kind === 'o') {
    const shape = () => {
      p.beginPath();
      if (kind === 'open') p.ellipse(x, y + 0.2, 0.4, 0.44, 0, 0, TAU);
      else p.ellipse(x, y + 0.12, 0.24, 0.29, 0, 0, TAU);
    };
    shape();
    p.fillStyle = MOUTH;
    p.fill();
    if (kind === 'open' && c.px > 5) {
      p.save();
      p.clip();
      p.beginPath();
      p.ellipse(x, y + 0.62, 0.42, 0.3, 0, 0, TAU);
      p.fillStyle = TONGUE;
      p.fill();
      p.restore();
    }
    shape();
    p.lineWidth = lw(c, 0.85);
    p.stroke();
    return;
  }
  p.beginPath();
  if (kind === 'closed') {
    p.moveTo(x - 0.35, y + 0.1);
    p.lineTo(x + 0.35, y + 0.1);
  } else {
    p.moveTo(x - 0.42, y - 0.02);
    p.quadraticCurveTo(x, y + 0.4, x + 0.42, y - 0.02);
  }
  p.lineWidth = lw(c);
  p.stroke();
}
