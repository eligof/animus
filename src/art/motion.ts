// How fast what moves in place moves: every loop (a pose, a local's act, a
// desk loop, a prop worked or giving off steam) is drawn at this many
// pictures a second, each drawn once and kept. It divides the default 30
// fps, so each picture shows for two frames, evenly.
export const ANIM_FPS = 15;

// The pictures a loop of `secs` seconds is drawn in.
export const framesFor = (secs: number): number => Math.max(2, Math.round(secs * ANIM_FPS));

// A smooth loop through `keys`, evenly spaced round it: at u = j / n it is
// keys[j], and between them a curve (Catmull-Rom, closed: from the last
// back to the first) that never stops at a key. For motion once drawn as a
// table of frames.
export function through(keys: readonly number[], u: number): number {
  const n = keys.length;
  const x = (((u % 1) + 1) % 1) * n;
  const j = Math.floor(x);
  const t = x - j;
  const [a, b, c, d] = [keys[(j + n - 1) % n], keys[j], keys[(j + 1) % n], keys[(j + 2) % n]];
  return b + 0.5 * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}
