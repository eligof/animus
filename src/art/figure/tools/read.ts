import type { Costume } from '../../../world/character.ts';
import { alpha, mix, shade } from '../../iso.ts';
import { zoom, type Sketch } from '../paint.ts';
import { COVER, PAGE, PAGE_D, WHITE, everyone, type Tool } from './tool.ts';

// The read pose's tools: held open in both hands, about 4 across and 2.6
// tall, pages toward the viewer; `v` (0 to 1) turns a page over from right
// to left. From the front before the chest; from behind at the side (see
// the read pose in ../rig.ts). Each costume's own below.

// An open book.
const book: Tool = { name: 'book', draw: (sk, v) => sk.at(zoom(1.15), () => openBook(sk, v)) };

// An open book, pages toward the viewer; `turn` (0..1) flips a page over
// from right to left.
function openBook(sk: Sketch, flip: number): void {
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

export const READS: Record<Costume, Tool> = everyone(book);
