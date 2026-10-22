import type { Rng } from '../world/rng.ts';
import type { Tables } from './materials.ts';
import type { Particle } from './types.ts';
import { KIND, M, MATERIALS } from './materials.ts';
// particles.ts imports ignite/spawn back from here; both sides only call
// each other's functions at run time, never while the modules load.
import { debris, ember, spark } from './particles.ts';
import { Voxels } from './voxels.ts';

// The falling-sand rules, Noita style: one cellular-automaton tick over the
// chunks that changed recently. Powders fall and pile, liquids fall and
// level out (heavier ones sinking through lighter ones), gases rise, drift
// and fade, fire flickers, spreads to what burns, smokes and dies out.
// Water and lava make obsidian and steam, acid eats what is soluble and
// burning gunpowder explodes.
//
// A burning voxel is FIRE and remembers what is burning in its shade byte:
// `shade & 7` is the flicker variant (the renderer only reads those bits)
// and `shade >> 3` a fuel code, 0 for a bare flame or else one code per
// flammable material (FUEL_MAT). `life` is the ticks it has left. When it
// runs out the voxel leaves the fuel's `burnsTo` (or smoke or air); water
// smothers it, leaving solid fuel (wet wood) or air.

const AIR_K = KIND.air;
const SOLID = KIND.solid;
const POWDER = KIND.powder;
const LIQUID = KIND.liquid;
const GAS = KIND.gas;
const FIRE_K = KIND.fire;

const SINK = 0.4; // powder sinking through a lighter liquid, per tick
const MIX = 0.5; // heavier liquid swapping down through a lighter one
const FIRE_MELT = 0.01; // fire melting a neighbouring ice/snow voxel
const LAVA_MELT = 0.08;
const LAVA_IGNITE = 0.02; // added to flammability next to lava
const TONGUE = 0.12; // burning fuel puts a short flame above it
const FUEL_SMOKE = 0.06; // ...or a puff of smoke
const FLAME_RISE = 0.35; // bare flames lick upward
const FLAME_SMOKE = 0.03;
const DOWNWARD = 0.1; // fire spreads down into a liquid this much slower, so pools burn from the top
const RESIDUE = 0.5; // burnt fuel leaves its `burnsTo` (else smoke or air)
const EMBER = 0.004;
const DISSOLVE = 0.12; // acid eating a soluble neighbour
const ACID_TOXIC = 0.35; // ...which turns to toxic gas
const ACID_SPENT = 0.3; // ...and the acid is used up
const CONDENSE = 0.15; // steam dying under a ceiling drips back as water
const HARD = 0.2; // metal/obsidian near a blast's core breaking anyway

// Healing, per sampled voxel.
const REGROW = 0.15;
const DECAY = 0.2;
const EVAPORATE = 0.3;
const SPRING = 0.3;

// ── per-material rule tables ─────────────────────────────────────────────
const FLAMMABLE = new Float32Array(256);
const BURNS_TO = new Uint8Array(256);
const BURN = new Uint8Array(256); // average ticks a fuel burns
const MELTS = new Uint8Array(256);
const SOLUBLE = new Uint8Array(256);
const LIFE_LO = new Uint8Array(256);
const LIFE_HI = new Uint8Array(256);
const FUEL = new Uint8Array(256); // material → fuel code
const FUEL_MAT = new Uint8Array(32); // fuel code → material (0 = bare flame)
const DEBRIS = new Uint8Array(256); // the powder a broken voxel flies off as
const REACH = new Uint8Array(256); // liquids: cells they spread per tick
const FLOW = new Float32Array(256); // liquids: chance to move per tick
const RISE = new Float32Array(256); // gases: chance to rise per tick
{
  let code = 1;
  for (let id = 0; id < 256; id++) {
    const m = MATERIALS[id];
    if (!m) continue;
    if (m.flammable) {
      FLAMMABLE[id] = m.flammable;
      // Easy to light, quick to burn: oil ~24 ticks, wood ~70, coal ~150.
      BURN[id] = id === M.GUNPOWDER ? 3 : Math.max(4, Math.min(200, Math.round(12 / Math.sqrt(m.flammable))));
      if (code < 32) {
        FUEL[id] = code;
        FUEL_MAT[code++] = id;
      }
    }
    BURNS_TO[id] = m.burnsTo ?? M.AIR;
    MELTS[id] = m.meltsTo ?? 0;
    SOLUBLE[id] = m.soluble ? 1 : 0;
    if (m.life) {
      LIFE_LO[id] = m.life[0];
      LIFE_HI[id] = m.life[1];
    }
    if (m.kind === 'powder') DEBRIS[id] = id;
    else if (m.kind === 'solid') DEBRIS[id] = m.flammable ? M.ASH : M.GRAVEL;
    if (m.kind === 'liquid') {
      REACH[id] = 5;
      FLOW[id] = 1;
    }
    if (m.kind === 'gas') RISE[id] = 0.6;
  }
  DEBRIS[M.GOLD_ORE] = M.GOLD_DUST;
  DEBRIS[M.ICE] = M.SNOW;
  DEBRIS[M.DIRT] = M.SAND;
  DEBRIS[M.GLASS] = M.SAND;
  REACH[M.WATER] = 8;
  REACH[M.OIL] = 6;
  REACH[M.ACID] = 6;
  REACH[M.POTION] = 6;
  REACH[M.SLUDGE] = 4;
  REACH[M.LAVA] = 3;
  FLOW[M.LAVA] = 0.35;
  FLOW[M.SLUDGE] = 0.6;
  RISE[M.SMOKE] = 0.75;
  RISE[M.STEAM] = 0.9;
  RISE[M.TOXIC] = 0.35;
  RISE[M.SPORES] = 0.25;
}

// The four horizontal directions, and all 24 orders to try them in.
const HX = [1, -1, 0, 0];
const HY = [0, 0, 1, -1];
const PERM = new Uint8Array(96);
{
  let n = 0;
  for (let a = 0; a < 4; a++)
    for (let b = 0; b < 4; b++)
      for (let c = 0; c < 4; c++) {
        if (a === b || a === c || b === c) continue;
        PERM.set([a, b, c, 6 - a - b - c], n);
        n += 4;
      }
}

function lifeOf(m: number, rng: Rng): number {
  const hi = LIFE_HI[m];
  if (hi === 0) return 0;
  const lo = LIFE_LO[m];
  return lo + ((rng.next() * (hi - lo + 1)) | 0);
}

function burnTime(m: number, rng: Rng): number {
  return Math.max(1, Math.min(255, Math.round(BURN[m] * (0.7 + 0.6 * rng.next()))));
}

// Writes material m at voxel i with a random colour variant, seeding the
// lifetime of gases and fire (a bare flame) from the material's range.
export function spawn(v: Voxels, i: number, m: number, rng: Rng): void {
  v.set(i, m, (rng.next() * 8) | 0, lifeOf(m, rng));
}

// Sets voxel i on fire if what is there burns; returns whether it caught.
export function ignite(v: Voxels, i: number, rng: Rng): boolean {
  const m = v.mat[i];
  if (FLAMMABLE[m] === 0) return false;
  v.set(i, M.FIRE, (FUEL[m] << 3) | ((rng.next() * 4) | 0), burnTime(m, rng));
  return true;
}

// What a FIRE voxel with this shade is burning; AIR for a bare flame.
export function fuelOf(shade: number): number {
  return FUEL_MAT[shade >> 3];
}

// ── the tick ─────────────────────────────────────────────────────────────
// The hot loop reads the world through these bindings, set once per tick,
// rather than threading a dozen arguments through every rule.
let vox: Voxels;
let tables: Tables;
let R: Rng;
let emit: (p: Particle) => void;
let mat: Uint8Array;
let shade: Uint8Array;
let life: Uint8Array;
let stamp: Uint8Array;
let kind: Uint8Array;
let dens: Uint8Array;
let next: Uint8Array;
let W = 0;
let D = 0;
let H = 0;
let WD = 0;
let tk = 0; // tick & 255, the stamp of whatever moved this tick
let cur = 0; // chunk being scanned
const HO = new Int32Array(4); // index offsets of HX/HY

const ignore = (): void => {};

// One simulation tick over the active chunks, bottom layer first, with the
// x/y scan direction flipped at random so nothing drifts one way. `emit`
// receives the sparks and debris of gunpowder explosions.
export function step(v: Voxels, T: Tables, rng: Rng, tick: number, emitParticle: (p: Particle) => void = ignore): void {
  const act = v.beginTick();
  vox = v;
  tables = T;
  R = rng;
  emit = emitParticle;
  mat = v.mat;
  shade = v.shade;
  life = v.life;
  stamp = v.stamp;
  kind = T.kind;
  dens = T.density;
  next = v.next;
  W = v.W;
  D = v.D;
  H = v.H;
  WD = W * D;
  tk = tick & 255;
  for (let d = 0; d < 4; d++) HO[d] = HX[d] + W * HY[d];
  const C = Voxels.CHUNK;
  const { cw, cd, ch } = v;
  const layer = cw * cd;
  const fx = rng.next() < 0.5;
  const fy = rng.next() < 0.5;
  for (let cz = 0; cz < ch; cz++) {
    let any = false;
    for (let c = cz * layer, e = c + layer; c < e; c++) {
      if (act[c]) {
        any = true;
        break;
      }
    }
    if (!any) continue;
    const z1 = Math.min(H, cz * C + C);
    for (let z = cz * C; z < z1; z++) {
      for (let a = 0; a < cd; a++) {
        const cy = fy ? a : cd - 1 - a;
        const ya = cy * C;
        const yb = Math.min(D, ya + C);
        for (let b = 0; b < cw; b++) {
          const cx = fx ? b : cw - 1 - b;
          const c = cx + cw * (cy + cd * cz);
          if (act[c] === 0) continue;
          cur = c;
          const xa = cx * C;
          const xb = Math.min(W, xa + C);
          for (let q = ya; q < yb; q++) {
            const y = fy ? q : ya + yb - 1 - q;
            const row = W * (y + D * z);
            for (let p = xa; p < xb; p++) {
              const x = fx ? p : xa + xb - 1 - p;
              const i = row + x;
              const m = mat[i];
              const k = kind[m];
              if (k <= SOLID) continue;
              // Moved here this tick (or a stale stamp from 256 ticks ago:
              // look again next tick).
              if (stamp[i] === tk) {
                next[c] = 1;
                continue;
              }
              if (k === POWDER) powder(i, x, y, z, m);
              else if (k === LIQUID) {
                if (m === M.LAVA ? lava(i, x, y, z) : m === M.ACID && acid(i, x, y, z)) continue;
                liquid(i, x, y, z, m);
              } else if (k === GAS) gas(i, x, y, z, m);
              else fire(i, x, y, z);
            }
          }
        }
      }
    }
  }
}

function move(i: number, j: number): void {
  vox.swap(i, j);
  stamp[j] = tk;
}

function place(j: number, m: number): void {
  vox.set(j, m, (R.next() * 8) | 0, lifeOf(m, R));
  stamp[j] = tk;
}

function clear(j: number): void {
  vox.set(j, M.AIR, 0, 0);
  stamp[j] = tk;
}

// Could have moved but the dice said no: keep the chunk awake.
function hold(): void {
  next[cur] = 1;
}

// Neighbour d of voxel i (+x, -x, +y, -y, +z, -z), or -1 outside the world.
function near(i: number, x: number, y: number, z: number, d: number): number {
  switch (d) {
    case 0:
      return x + 1 < W ? i + 1 : -1;
    case 1:
      return x > 0 ? i - 1 : -1;
    case 2:
      return y + 1 < D ? i + W : -1;
    case 3:
      return y > 0 ? i - W : -1;
    case 4:
      return z + 1 < H ? i + WD : -1;
    default:
      return z > 0 ? i - WD : -1;
  }
}

// Horizontal neighbour d of voxel i, or -1 outside the world.
function side(i: number, x: number, y: number, d: number): number {
  const nx = x + HX[d];
  const ny = y + HY[d];
  return nx < 0 || ny < 0 || nx >= W || ny >= D ? -1 : i + HO[d];
}

// Air, gas and flames give way to anything falling.
function open(k: number): boolean {
  return k === AIR_K || k === GAS || k === FIRE_K;
}

function powder(i: number, x: number, y: number, z: number, m: number): void {
  if (z === 0) return;
  const b = i - WD;
  const bm = mat[b];
  const bk = kind[bm];
  if (open(bk)) return move(i, b);
  const dm = dens[m];
  if (bk === LIQUID && dens[bm] < dm) {
    if (R.next() < SINK) move(i, b);
    else hold();
    return;
  }
  const o = ((R.next() * 24) | 0) << 2;
  for (let k = 0; k < 4; k++) {
    const s = side(i, x, y, PERM[o + k]);
    if (s < 0) continue;
    const sk = kind[mat[s]];
    if (sk === SOLID || sk === POWDER) continue;
    const j = s - WD;
    const jm = mat[j];
    const jk = kind[jm];
    if (open(jk)) return move(i, j);
    if (jk === LIQUID && dens[jm] < dm) {
      if (R.next() < SINK * 0.5) return move(i, j);
      hold();
    }
  }
}

// A liquid voxel's `life` is its restlessness: ticks it may still wander
// along a surface looking for somewhere lower. Real flow (falling, sinking,
// being squeezed out, heading for a drop) refills it; wandering does not,
// so a pool with a partial top layer still comes to rest.
const RESTLESS = 48;

function flowTo(i: number, j: number): void {
  move(i, j);
  life[j] = RESTLESS;
}

function liquid(i: number, x: number, y: number, z: number, m: number): void {
  const flow = FLOW[m];
  if (flow < 1 && R.next() >= flow) return hold();
  if (z > 0) {
    const b = i - WD;
    const bm = mat[b];
    const bk = kind[bm];
    if (open(bk)) return flowTo(i, b);
    if (bk === LIQUID && dens[bm] < dens[m]) {
      if (R.next() < MIX) flowTo(i, b);
      else hold();
      return;
    }
    const o = ((R.next() * 24) | 0) << 2;
    for (let k = 0; k < 4; k++) {
      const s = side(i, x, y, PERM[o + k]);
      if (s < 0) continue;
      const sk = kind[mat[s]];
      if (sk === SOLID || sk === POWDER) continue;
      if (open(kind[mat[s - WD]])) return flowTo(i, s - WD);
    }
  }
  // Sideways: straight to a drop within reach if there is one; squeezed by
  // liquid above, as far as the free cells go; still restless, a random
  // way along the surface.
  const reach = REACH[m];
  let farD = 0;
  let farN = 0;
  const o = ((R.next() * 24) | 0) << 2;
  for (let k = 0; k < 4; k++) {
    const d = PERM[o + k];
    const dx = HX[d];
    const dy = HY[d];
    const dj = HO[d];
    let nx = x;
    let ny = y;
    let j = i;
    let n = 0;
    while (n < reach) {
      nx += dx;
      ny += dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= D) break;
      j += dj;
      const ck = kind[mat[j]];
      if (ck !== AIR_K && ck !== GAS) break;
      if (z > 0 && open(kind[mat[j - WD]])) return flowTo(i, j);
      n++;
    }
    if (farN === 0) {
      farD = dj;
      farN = n;
    }
  }
  if (z + 1 < H && kind[mat[i + WD]] === LIQUID) {
    if (farN > 0) flowTo(i, i + farD * farN);
    return;
  }
  const l = life[i];
  if (l === 0) return;
  if (farN === 0) {
    life[i] = 0;
    return;
  }
  const j = i + farD * (1 + ((R.next() * farN) | 0));
  move(i, j);
  life[j] = l - 1;
}

function gas(i: number, x: number, y: number, z: number, m: number): void {
  let l = life[i];
  if (l === 0) l = lifeOf(m, R) || 1; // placed without a lifetime
  if (l <= 1) {
    if (m === M.STEAM && z + 1 < H && kind[mat[i + WD]] === SOLID && R.next() < CONDENSE) place(i, M.WATER);
    else clear(i);
    return;
  }
  // The renderer ignores `life`, so the countdown is not logged as a change.
  life[i] = l - 1;
  hold();
  if (z + 1 < H && R.next() < RISE[m]) {
    const u = i + WD;
    if (mat[u] === M.AIR) return move(i, u);
    const o = ((R.next() * 24) | 0) << 2;
    for (let k = 0; k < 4; k++) {
      const s = side(i, x, y, PERM[o + k]);
      if (s < 0) continue;
      const sk = kind[mat[s]];
      if (sk !== AIR_K && sk !== GAS) continue;
      if (mat[s + WD] === M.AIR) return move(i, s + WD);
    }
  }
  const s = side(i, x, y, (R.next() * 4) | 0);
  if (s >= 0 && mat[s] === M.AIR) move(i, s);
}

// Flicker variant: young flames burn bright, dying ones dark red.
function flicker(s: number, l: number): number {
  return (s & 0xf8) | Math.min(7, (l > 16 ? 0 : l > 8 ? 2 : 4) + ((R.next() * 4) | 0));
}

function fire(i: number, x: number, y: number, z: number): void {
  const s = shade[i];
  const f = s >> 3;
  const fm = FUEL_MAT[f];
  let l = life[i];
  if (l === 0) l = f ? burnTime(fm, R) : lifeOf(M.FIRE, R); // placed without a lifetime
  for (let d = 0; d < 6; d++) {
    const j = near(i, x, y, z, d);
    if (j < 0) continue;
    const nm = mat[j];
    if (nm === M.AIR || nm === M.FIRE) continue;
    if (nm === M.WATER) {
      if (f !== 0 && kind[fm] === SOLID) place(i, fm);
      else clear(i);
      place(j, M.STEAM);
      return;
    }
    const p = FLAMMABLE[nm];
    if (p > 0) {
      if (R.next() < (d === 5 && kind[nm] === LIQUID ? p * DOWNWARD : p)) {
        ignite(vox, j, R);
        stamp[j] = tk;
      }
    } else if (MELTS[nm] !== 0 && R.next() < FIRE_MELT) place(j, MELTS[nm]);
  }
  if (--l === 0) return burnOut(i, x, y, z, fm);
  const up = z + 1 < H ? i + WD : -1;
  if (f !== 0) {
    // Burning powder or liquid keeps falling.
    const fk = kind[fm];
    if (z > 0 && (fk === POWDER || fk === LIQUID)) {
      const bk = kind[mat[i - WD]];
      if (bk === AIR_K || bk === GAS) {
        vox.set(i, M.FIRE, flicker(s, l), l);
        return move(i, i - WD);
      }
    }
    if (up >= 0 && mat[up] === M.AIR) {
      const q = R.next();
      if (q < TONGUE) {
        vox.set(up, M.FIRE, flicker(0, 4), 3 + ((R.next() * 6) | 0));
        stamp[up] = tk;
      } else if (q < TONGUE + FUEL_SMOKE) place(up, M.SMOKE);
      else if (q > 1 - EMBER) emit(ember(x + 0.5, y + 0.5, z + 1, R));
    }
  } else if (up >= 0 && mat[up] === M.AIR) {
    const q = R.next();
    if (q < FLAME_RISE) {
      vox.set(i, M.FIRE, flicker(s, l), l);
      return move(i, up);
    }
    if (q < FLAME_RISE + FLAME_SMOKE) place(up, M.SMOKE);
  }
  vox.set(i, M.FIRE, flicker(s, l), l);
}

function burnOut(i: number, x: number, y: number, z: number, fm: number): void {
  if (fm === M.GUNPOWDER) {
    clear(i);
    explode(vox, tables, x, y, z, 1.6 + R.next(), R, emit);
    return;
  }
  const q = R.next();
  const res = BURNS_TO[fm];
  if (res !== M.AIR && q < RESIDUE) place(i, res);
  else if (q > 0.75) place(i, M.SMOKE);
  else clear(i);
}

// Lava boils water into steam (cooling to obsidian), lights what burns and
// melts ice and snow. Returns whether the lava is gone.
function lava(i: number, x: number, y: number, z: number): boolean {
  for (let d = 0; d < 6; d++) {
    const j = near(i, x, y, z, d);
    if (j < 0) continue;
    const nm = mat[j];
    if (nm === M.AIR || nm === M.LAVA) continue;
    if (nm === M.WATER) {
      place(j, M.STEAM);
      place(i, M.OBSIDIAN);
      return true;
    }
    const p = FLAMMABLE[nm];
    if (p > 0) {
      if (R.next() < p + LAVA_IGNITE) {
        ignite(vox, j, R);
        stamp[j] = tk;
      } else hold();
    } else if (MELTS[nm] !== 0) {
      if (R.next() < LAVA_MELT) place(j, MELTS[nm]);
      else hold();
    }
  }
  return false;
}

// Acid eats one soluble neighbour now and then, fuming, and is slowly used
// up doing it. Returns whether the acid is gone.
function acid(i: number, x: number, y: number, z: number): boolean {
  const r = (R.next() * 6) | 0;
  for (let k = 0; k < 6; k++) {
    const j = near(i, x, y, z, (r + k) % 6);
    if (j < 0) continue;
    const nm = mat[j];
    const nk = kind[nm];
    if (!SOLUBLE[nm] || (nk !== SOLID && nk !== POWDER)) continue;
    if (R.next() >= DISSOLVE) {
      hold();
      return false;
    }
    if (R.next() < ACID_TOXIC) place(j, M.TOXIC);
    else clear(j);
    if (R.next() >= ACID_SPENT) return false;
    if (R.next() < ACID_TOXIC) place(i, M.TOXIC);
    else clear(i);
    return true;
  }
  return false;
}

// ── explosions, digging, healing ─────────────────────────────────────────

// Blasts a rough sphere of radius r around voxel (x, y, z): solids and
// powders break (metal and obsidian only near the core, rarely), oil and
// wood at the rim catch fire, gunpowder goes off in turn, water flashes to
// steam. Leaves flames and smoke, flings debris and sparks to `emit`.
export function explode(v: Voxels, T: Tables, x: number, y: number, z: number, r: number, rng: Rng, emit: (p: Particle) => void): void {
  const { W, D, H } = v;
  const vm = v.mat;
  const kind = T.kind;
  const r2 = r * r;
  const most = 8 + Math.round(r2 * 2);
  let flung = 0;
  const z0 = Math.max(0, Math.floor(z - r));
  const z1 = Math.min(H - 1, Math.ceil(z + r));
  const y0 = Math.max(0, Math.floor(y - r));
  const y1 = Math.min(D - 1, Math.ceil(y + r));
  const x0 = Math.max(0, Math.floor(x - r));
  const x1 = Math.min(W - 1, Math.ceil(x + r));
  for (let zz = z0; zz <= z1; zz++) {
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const dx = xx - x;
        const dy = yy - y;
        const dz = zz - z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2 * (0.6 + 0.5 * rng.next())) continue;
        const i = xx + W * (yy + D * zz);
        const m = vm[i];
        const k = kind[m];
        if (k === FIRE_K) continue;
        if (m === M.GUNPOWDER) {
          ignite(v, i, rng);
          continue;
        }
        if (k === LIQUID) {
          if (FLAMMABLE[m] > 0) ignite(v, i, rng);
          else if (m === M.WATER && rng.next() < 0.4) spawn(v, i, M.STEAM, rng);
          continue;
        }
        if (m === M.METAL || m === M.OBSIDIAN) {
          if (d2 > r2 * 0.3 || rng.next() >= HARD) continue;
        } else if (FLAMMABLE[m] > 0 && d2 > r2 * 0.4) {
          ignite(v, i, rng);
          continue;
        }
        if ((k === SOLID || k === POWDER) && DEBRIS[m] !== 0 && flung < most && rng.next() < 0.35) {
          const len = Math.sqrt(d2) || 1;
          const sp = rng.range(5, 12);
          emit(debris(xx + 0.5, yy + 0.5, zz + 0.5, DEBRIS[m], T, rng, (dx / len) * sp, (dy / len) * sp, (dz / len) * sp + rng.range(4, 9)));
          flung++;
        }
        const q = rng.next();
        if (q < 0.1) spawn(v, i, M.FIRE, rng);
        else if (q < 0.22) spawn(v, i, M.SMOKE, rng);
        else if (m !== M.AIR) v.set(i, M.AIR, 0, 0);
      }
    }
  }
  const n = 4 + Math.round(r * 2);
  for (let k = 0; k < n; k++) emit(spark(x + 0.5, y + 0.5, z + 0.5, rng, 10 + r * 3));
}

// A pickaxe strike: breaks a small blob of solid (not metal) around voxel
// (x, y, z), throwing a little debris that lands as gravel. Returns how
// many voxels it removed.
export function dig(v: Voxels, T: Tables, x: number, y: number, z: number, r: number, rng: Rng, emit: (p: Particle) => void): number {
  const { W, D, H } = v;
  const vm = v.mat;
  const kind = T.kind;
  const r2 = r * r;
  let n = 0;
  for (let zz = Math.max(0, Math.floor(z - r)); zz <= Math.min(H - 1, Math.ceil(z + r)); zz++) {
    for (let yy = Math.max(0, Math.floor(y - r)); yy <= Math.min(D - 1, Math.ceil(y + r)); yy++) {
      for (let xx = Math.max(0, Math.floor(x - r)); xx <= Math.min(W - 1, Math.ceil(x + r)); xx++) {
        const dx = xx - x;
        const dy = yy - y;
        const dz = zz - z;
        if (dx * dx + dy * dy + dz * dz > r2 * (0.5 + 0.7 * rng.next())) continue;
        const i = xx + W * (yy + D * zz);
        const m = vm[i];
        if (kind[m] !== SOLID || m === M.METAL) continue;
        v.set(i, M.AIR, 0, 0);
        n++;
        const dm = DEBRIS[m];
        if (dm !== 0 && rng.next() < 0.6) emit(debris(xx + 0.5, yy + 0.5, zz + 0.5, dm, T, rng, rng.range(-2, 2), rng.range(-2, 2), rng.range(1, 4)));
      }
    }
  }
  return n;
}

// Keeps a long-running world bounded by checking `samples` random voxels:
// carved rock grows back from its walls, loose powder and liquid that the
// generated world did not have crumbles away (liquid sometimes as steam),
// and generated pools refill like springs. `protect` vetoes growing or
// refilling inside a volume (where characters stand).
export function heal(v: Voxels, T: Tables, rng: Rng, samples: number, protect?: (x: number, y: number, z: number) => boolean): void {
  const { W, D, H, size } = v;
  const WD = W * D;
  const vm = v.mat;
  const base = v.base;
  const kind = T.kind;
  for (let n = 0; n < samples; n++) {
    const i = (rng.next() * size) | 0;
    const m = vm[i];
    const b = base[i];
    if (m === b) continue;
    const k = kind[m];
    if (k === POWDER || k === LIQUID) {
      if (rng.next() >= DECAY) continue;
      if (k === LIQUID && rng.next() < EVAPORATE) spawn(v, i, M.STEAM, rng);
      else v.set(i, M.AIR, 0, 0);
      continue;
    }
    if (k !== AIR_K && k !== GAS) continue;
    const bk = kind[b];
    const x = i % W;
    const y = ((i / W) | 0) % D;
    const z = (i / WD) | 0;
    if (bk === SOLID) {
      if (rng.next() >= REGROW) continue;
      let walls = 0;
      for (let d = 0; d < 6; d++) {
        const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
        const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
        const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
        // Outside the world reads as rock.
        if (nx < 0 || ny < 0 || nz < 0 || nx >= W || ny >= D || nz >= H || kind[vm[nx + W * (ny + D * nz)]] === SOLID) walls++;
      }
      if (walls < 2 || protect?.(x, y, z)) continue;
      v.set(i, b, v.baseShade[i], 0);
    } else if (bk === LIQUID && k === AIR_K) {
      if (rng.next() >= SPRING || protect?.(x, y, z)) continue;
      v.set(i, b, v.baseShade[i], 0);
    }
  }
}
