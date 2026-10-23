// Contours for HD mode: when each voxel becomes an s x s block of image
// pixels, a block on a silhouette edge gets a pattern per edge combination
// (bit 1 right, 2 bottom, 4 left, 8 top: the neighbour that way is much
// farther away). The far side of a voxel block (right, bottom) darkens a
// half-voxel line, the near side (top, left) catches a rim of light — crisp
// outlines and edges at the blow-up's finer grain. Entry 0 (no edge) is null.
const contourCache = new Map<number, Array<Float32Array | null>>();

export function contourPatterns(s: number): Array<Float32Array | null> {
  const hit = contourCache.get(s);
  if (hit) return hit;
  const out: Array<Float32Array | null> = [null];
  for (let f = 1; f < 16; f++) {
    const p = new Float32Array(s * s).fill(1);
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        let k = 1;
        if (f & 1 && x === s - 1) k *= 0.62;
        if (f & 2 && y === s - 1) k *= 0.62;
        if (f & 4 && x === 0) k *= 1.12;
        if (f & 8 && y === 0) k *= 1.2;
        p[y * s + x] = k;
      }
    }
    out.push(p);
  }
  contourCache.set(s, out);
  return out;
}
