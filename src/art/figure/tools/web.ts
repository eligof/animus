import type { Costume } from '../../../world/character.ts';
import { alpha } from '../../iso.ts';
import { SCREEN, SLATE, TAU, everyone, type Tool } from './tool.ts';

// The web pose's tools: held at the chest in both hands (from behind, held
// up and out at the side, see ../rig.ts), about 2.7 across, a glow round
// it allowed; `v` is the page (0 or 1) a swipe turns. Each costume's own
// below.

// A tablet: a slate case, a glowing screen with a picture and lines on it.
const tablet: Tool = {
  name: 'tablet',
  draw(sk, v, L) {
    sk.blob((p) => p.roundRect(-1.35, -1.0, 2.7, 2.0, 0.32), SLATE, { line: 0.6 });
    const page = v % 2;
    sk.draw((p, c) => {
      p.beginPath();
      p.arc(0, 0, 2.6, 0, TAU);
      p.fillStyle = alpha(SCREEN, 0.16);
      p.fill();
      p.beginPath();
      p.roundRect(-1.08, -0.75, 2.16, 1.5, 0.14);
      p.fillStyle = SCREEN;
      p.fill();
      if (c.px < 4.5) return;
      p.fillStyle = page ? L.color : '#ff9f6b';
      p.fillRect(-0.9, -0.58, 0.8, 0.55);
      p.fillStyle = alpha(SLATE, 0.45);
      p.fillRect(0.05, -0.55, 0.85, 0.14);
      p.fillRect(0.05, -0.3, 0.6, 0.14);
      p.fillRect(-0.9, 0.12, 1.8, 0.14);
      p.fillRect(-0.9, 0.38, 1.3, 0.14);
    });
  },
};

export const WEBS: Record<Costume, Tool> = everyone(tablet);
