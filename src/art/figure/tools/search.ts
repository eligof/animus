import type { Costume } from '../../../world/character.ts';
import { alpha, shade } from '../../iso.ts';
import { hole } from '../paint.ts';
import { BRASS, TAU, WHITE, everyone, type Tool } from './tool.ts';

// The search pose's tools: held out at arm's length, the handle at the
// hand along +x, the business end round x 2 (it sweeps in small circles);
// out at the side, so it shows from behind too. Each costume's own below.

// A magnifying glass with a brass rim.
const magnifier: Tool = {
  name: 'magnifier',
  draw(sk) {
    sk.limb([-0.3, 0, 1.0, 0], 0.42, '#7a4a2c', { line: 0.6 });
    sk.blob((p) => {
      p.arc(2.05, 0, 1.05, 0, TAU);
      hole(p, 2.05, 0, 0.72, 0.72);
    }, BRASS, { dark: shade(BRASS, -0.2), d: 0.18 });
    sk.draw((p, c) => {
      p.beginPath();
      p.arc(2.05, 0, 0.72, 0, TAU);
      p.fillStyle = alpha('#d6f2ff', 0.45);
      p.fill();
      p.beginPath();
      p.arc(2.05, 0, 0.5, Math.PI * 1.05, Math.PI * 1.5);
      p.strokeStyle = alpha(WHITE, 0.9);
      p.lineWidth = Math.max(0.2, 1 / c.px);
      p.lineCap = 'round';
      p.stroke();
    });
  },
};

export const SEARCHES: Record<Costume, Tool> = everyone(magnifier);
