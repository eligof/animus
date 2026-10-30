import type { Costume } from '../../../world/character.ts';
import { METAL, METAL_D, WOOD, WOOD_D, everyone, type Tool } from './tool.ts';

// The run pose's tools: swung, the handle at the hand along +x, the head
// out to about 3.2; `v` is 1 on the strike (marks of the blow, a spill, a
// stamp's print). Raised over the head it shows from behind. Each
// costume's own below.

// A mallet: a wooden handle, a steel head, marks of the blow on the strike.
const mallet: Tool = {
  name: 'mallet',
  draw(sk, v) {
    sk.limb([-0.45, 0, 2.3, 0], 0.42, WOOD, { dark: WOOD_D, line: 0.6 });
    sk.blob((p) => p.roundRect(2.05, -0.82, 1.15, 1.64, 0.3), METAL, { dark: METAL_D, d: 0.25 });
    if (v) {
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
  },
};

export const RUNS: Record<Costume, Tool> = everyone(mallet);
