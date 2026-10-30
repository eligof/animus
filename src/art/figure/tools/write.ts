import type { Costume } from '../../../world/character.ts';
import { alpha } from '../../iso.ts';
import { PAGE, PAGE_D, TAU, everyone, type Tool } from './tool.ts';

// The write pose's tools (surface and writer): a surface held in one hand,
// upright in its own frame, about 1.7 across and 2.1 tall, its top toward
// -y; a writer in the other, pointing along +x, its tip at about 1.9. From
// the front a pad before the chest; from behind held out at the side (see
// the write pose in ../rig.ts). Each costume's own below.

// A pad of lined paper on a spiral.
const notepad: Tool = {
  name: 'notepad',
  draw(sk) {
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
  },
};

// A yellow pencil, its rubber at the hand.
const pencil: Tool = {
  name: 'pencil',
  draw(sk) {
    sk.limb([0, 0, 1.55, 0], 0.34, '#f6c544', { line: 0.5 });
    sk.limb([1.55, 0, 1.95, 0], 0.2, '#3a3040', { line: 0.4 });
    sk.limb([-0.25, 0, 0, 0], 0.36, '#ff8fa8', { line: 0.5 });
  },
};

export const SURFACES: Record<Costume, Tool> = everyone(notepad);
export const WRITERS: Record<Costume, Tool> = everyone(pencil);
