import { hashString, Rng } from '../../world/rng.ts';
import { buildSites, hub, inRect, keepClear, slotRect } from '../layout.ts';
import { noise2 } from '../props.ts';
import type { Layout, Poi } from '../types.ts';

// Floor planning shared by the caves: where the features idle characters
// visit go (from the layout alone, so pois(L) agrees with generate()), the
// walkways out to them, and what floor that leaves for decor.

export type Pt = { x: number; y: number };
export type Disc = { x: number; y: number; r: number; tall?: number }; // tall: how high what stands there rises

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// 0 at the smallest chunk, 1 at the largest.
export function growth(L: Layout): number {
  return clamp((L.W - 72) / 98, 0, 1);
}

// Marks the floor cells within r of (cx, cy).
export function disc(mask: Uint8Array, L: Layout, cx: number, cy: number, r: number): void {
  const { W, D } = L;
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(D - 1, Math.ceil(cy + r)); y++) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, Math.ceil(cx + r)); x++) {
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) mask[x + W * y] = 1;
    }
  }
}

// Marks the floor cells within r of the segment a-b.
export function lane(mask: Uint8Array, L: Layout, a: Pt, b: Pt, r: number): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let k = 0; k <= n; k++) disc(mask, L, a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n, r);
}

// Distance from p to the segment a-b.
export function segDist(a: Pt, b: Pt, p: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1), 0, 1);
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}

// A calm colour variant for open floor: broad patches of the middle
// variants (2..5) rather than per-voxel grain, which turns to noise in
// sextant cells. Worn walkways take `WORN`, a touch lighter.
export function calm(seed: number, x: number, y: number): number {
  return 2 + Math.min(3, Math.floor(noise2(seed, x * 0.13, y * 0.13) * 4));
}
export const WORN = 6;

// A POI by a feature: `d` voxels out from its edge on the side facing
// `toward` (turned by `turn` radians round the feature), looking at it.
export function by(s: Disc, kind: Poi['kind'], d: number, toward: Pt, turn = 0): Poi {
  const a = Math.atan2(toward.y - s.y, toward.x - s.x) + turn;
  return { x: Math.round(s.x + Math.cos(a) * (s.r + d)), y: Math.round(s.y + Math.sin(a) * (s.r + d)), kind, face: { x: Math.round(s.x), y: Math.round(s.y) } };
}

// A POI by a tall feature, turned off the camera's diagonal through it so
// the feature does not hide whoever stands there.
export function aside(s: Disc, kind: Poi['kind'], d: number, toward: Pt): Poi {
  let best = by(s, kind, d, toward);
  let off = -1;
  for (const turn of [0.9, -0.9, 1.3, -1.3]) {
    const p = by(s, kind, d, toward, turn);
    const o = Math.abs(p.x - s.x - (p.y - s.y));
    if (o > off) {
      off = o;
      best = p;
    }
  }
  return best;
}

export type PlaceOpts = {
  gap?: number; // clear floor kept round it
  min?: number; // smallest radius worth placing
  spread?: number; // how loosely it keeps to `prefer`
  pois?: (s: Disc) => Poi[]; // the POIs it brings, all of which must be reachable
  inside?: boolean; // its POIs stand within it, and their walkways may cross it
  tall?: number; // how high it rises: no POI may stand where it would hide them
  ok?: (s: Disc) => boolean; // any other say on where it may go
};

// The floor of one layout: keepClear (props, spots, the corridors between
// them and to the hub, the hub and the build plazas) plus a walkway (r 2)
// from the hub out to each plaza and each POI, so the route through the hub
// is always clear. Features go on the floor left over, apart from each
// other, and no walkway to a POI may cross one.
export class Floor {
  readonly L: Layout;
  readonly rng: Rng;
  readonly hub: Pt;
  readonly plazas: Disc[];
  readonly keep: Uint8Array;
  readonly paths: Uint8Array;
  readonly trails: Uint8Array; // the middle of each walkway, worn by feet
  readonly seen: Uint8Array; // what must stay in view: props, spots, plazas, the hub, POIs
  readonly sites: Disc[] = [];
  readonly pois: Poi[] = [];

  constructor(L: Layout, salt: string) {
    this.L = L;
    this.rng = new Rng(hashString(`${salt}:${L.W}x${L.D}x${L.H}`));
    this.hub = hub(L);
    this.plazas = buildSites(L);
    this.keep = keepClear(L);
    this.paths = this.keep.slice();
    this.trails = new Uint8Array(L.W * L.D);
    for (const p of this.plazas) {
      lane(this.paths, L, this.hub, p, 2);
      lane(this.trails, L, this.hub, p, 1.2);
    }
    for (const s of L.slots) lane(this.trails, L, s.spot, this.hub, 1.2);
    this.seen = new Uint8Array(L.W * L.D);
    for (const s of L.slots) {
      const r = slotRect(s);
      for (let y = r.y0 - 1; y <= r.y1; y++) for (let x = r.x0 - 1; x <= r.x1; x++) if (x >= 0 && y >= 0 && x < L.W && y < L.D) this.seen[x + L.W * y] = 1;
      disc(this.seen, L, s.spot.x, s.spot.y, 4);
    }
    for (const p of this.plazas) disc(this.seen, L, p.x, p.y, p.r + 2);
    disc(this.seen, L, this.hub.x, this.hub.y, 4);
  }

  // A point at fractions (fx, fy) of the room.
  at(fx: number, fy: number): Pt {
    const { W, D, T } = this.L;
    return { x: T + (W - T) * fx, y: T + (D - T) * fy };
  }

  // A feature of radius r (shrinking to `min` if need be) as near `prefer`
  // as the floor allows, `gap` clear of walkways, other features, the walls
  // and the front cuts. Null if none fits.
  place(r0: number, prefer: Pt, o: PlaceOpts = {}): Disc | null {
    const { W, D, T } = this.L;
    const gap = o.gap ?? 2;
    const min = o.min ?? Math.max(2, r0 * 0.6);
    const dist = this.distance();
    const radii: number[] = [];
    for (let r = r0; r > min; r--) radii.push(r);
    radii.push(Math.min(r0, min));
    for (const r of radii) {
      const need = r + gap;
      const cand: Array<[number, number, number]> = [];
      for (let y = T; y < D; y++) {
        for (let x = T; x < W; x++) {
          if (dist[x + W * y] >= need) cand.push([x, y, Math.hypot(x - prefer.x, y - prefer.y) + this.rng.range(0, o.spread ?? 6)]);
        }
      }
      cand.sort((a, b) => a[2] - b[2]);
      // The nearest few, then ever further afield: a walkway may be blocked
      // for every spot near the one preferred.
      for (let k = 0; k < cand.length; k += k < 24 ? 1 : 1 + (k >> 3)) {
        const s: Disc = { x: cand[k][0], y: cand[k][1], r, tall: o.tall };
        if (o.ok && !o.ok(s)) continue;
        const pois = o.pois?.(s) ?? [];
        if (!pois.every((p) => this.reachable(p, o.inside ? null : s))) continue;
        this.sites.push(s);
        for (const p of pois) this.addPoi(p);
        return s;
      }
    }
    return null;
  }

  // A POI with walkways out to it.
  addPoi(p: Poi): void {
    this.pois.push(p);
    disc(this.paths, this.L, p.x, p.y, 3);
    disc(this.seen, this.L, p.x, p.y, 2.5);
    lane(this.paths, this.L, this.hub, p, 2);
    lane(this.trails, this.L, this.hub, p, 1.2);
  }

  // True if a POI by feature `own` (if any) can stand at p: on the room's
  // floor, off the plazas and the props, out of every placed feature, and
  // every walkway to it misses every placed feature (and only grazes its own).
  reachable(p: Poi, own: Disc | null): boolean {
    const { W, D, T } = this.L;
    if (p.x < T + 2 || p.y < T + 2 || p.x > W - 3 || p.y > D - 3) return false;
    if (this.plazas.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < q.r + 4)) return false;
    if (this.L.slots.some((s) => inRect(slotRect(s), p.x, p.y, 2))) return false;
    if (this.pois.some((q) => Math.hypot(p.x - q.x, p.y - q.y) < 5)) return false;
    const all = own ? [...this.sites, own] : this.sites;
    if (all.some((s) => s.tall && shadows(s, p))) return false;
    for (const s of all) {
      const pad = s === own ? -1.5 : 1.5;
      if (Math.hypot(p.x - s.x, p.y - s.y) < s.r + 1) return false;
      if (segDist(this.hub, p, s) < s.r + pad) return false;
    }
    return true;
  }

  // True if something standing at (x, y), r across and `tall` high, would
  // hide what must stay in view: the camera looks in along -x -y, so a
  // thing hides whatever stands up to its own height behind it on that
  // diagonal.
  hides(x: number, y: number, r: number, tall: number): boolean {
    const { W, D } = this.L;
    const side = Math.ceil(r * 0.75);
    for (let k = 1 - Math.ceil(r * 0.7); k <= tall + r; k++) {
      for (let o = -side; o <= side; o++) {
        const px = Math.round(x - k + o);
        const py = Math.round(y - k - o);
        if (px >= 0 && py >= 0 && px < W && py < D && this.seen[px + W * py]) return true;
      }
    }
    return false;
  }

  // Floor cells free for decor: in the room, off every walkway and
  // feature (features padded by `pad`).
  free(pad = 1): Uint8Array {
    const { W, D, T } = this.L;
    const out = new Uint8Array(W * D);
    for (let y = T; y < D; y++) for (let x = T; x < W; x++) out[x + W * y] = this.paths[x + W * y] ? 0 : 1;
    const taken = new Uint8Array(W * D);
    for (const s of this.sites) disc(taken, this.L, s.x, s.y, s.r + pad);
    for (let i = 0; i < W * D; i++) if (taken[i]) out[i] = 0;
    return out;
  }

  // Chebyshev distance from every floor cell to the nearest walkway,
  // feature, wall or front cut.
  private distance(): Int32Array {
    const { W, D, T } = this.L;
    const blocked = this.paths.slice();
    for (const s of this.sites) disc(blocked, this.L, s.x, s.y, s.r);
    const dist = new Int32Array(W * D).fill(-1);
    const queue = new Int32Array(W * D);
    let n = 0;
    for (let y = 0; y < D; y++) {
      for (let x = 0; x < W; x++) {
        const i = x + W * y;
        if (blocked[i] || x < T || y < T || x >= W - 1 || y >= D - 1) {
          dist[i] = 0;
          queue[n++] = i;
        }
      }
    }
    for (let q = 0; q < n; q++) {
      const i = queue[q];
      const x = i % W;
      const y = (i - x) / W;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= D) continue;
          const j = nx + W * ny;
          if (dist[j] < 0) {
            dist[j] = dist[i] + 1;
            queue[n++] = j;
          }
        }
      }
    }
    return dist;
  }
}

// True if a tall feature hides p from the camera (see Floor.hides).
function shadows(s: Disc, p: Pt): boolean {
  const k = -(p.x - s.x + (p.y - s.y)) / 2; // how far behind it along the diagonal
  const o = (p.x - s.x - (p.y - s.y)) / 2; // and off to the side
  return k >= 1 - s.r * 0.7 && k <= (s.tall ?? 0) + s.r && Math.abs(o) <= s.r * 0.75 + 2.5;
}

// A warm spot by the campfire of the idle prop (every cave has one), for
// a cave too small for a fire of its own out on the floor.
export function campfirePoi(L: Layout): Poi | null {
  const s = L.slots.find((k) => k.kind === 'idle');
  if (!s) return null;
  // The flames are at (len - 3, dep / 2 + 2) in the slot's frame (see props.ts).
  const fire = (a: number, b: number): Pt => (s.wall === 'right' ? { x: s.x0 + a, y: s.y0 + b } : { x: s.x0 + b, y: s.y0 + a });
  const p = fire(s.len - 1, s.dep + 3);
  return { ...p, kind: 'warm', face: fire(s.len - 3, Math.floor(s.dep / 2) + 2) };
}

// Scatters up to n points over cells `ok` accepts, at least `apart` from
// each other (and from `avoid`), in a few random tries each.
export function scatter(L: Layout, rng: Rng, n: number, apart: number, ok: (x: number, y: number) => boolean, avoid: readonly Pt[] = []): Pt[] {
  const { W, D, T } = L;
  const out: Pt[] = [];
  for (let k = 0; k < n; k++) {
    for (let tries = 0; tries < 12; tries++) {
      const x = rng.int(T + 2, W - 3);
      const y = rng.int(T + 2, D - 3);
      if (!ok(x, y)) continue;
      if (out.some((p) => Math.hypot(p.x - x, p.y - y) < apart) || avoid.some((p) => Math.hypot(p.x - x, p.y - y) < apart)) continue;
      out.push({ x, y });
      break;
    }
  }
  return out;
}
