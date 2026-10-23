import type { RGB } from '../term/color.ts';
import { hex } from '../term/color.ts';

// Every voxel holds one material. Kinds decide how the simulation moves it:
// solids stay put, powders fall and pile, liquids fall and spread, gases
// rise and fade, fire flickers, spreads to what burns and dies out.
export type Kind = 'air' | 'solid' | 'powder' | 'liquid' | 'gas' | 'fire';

export type Material = {
  id: number;
  name: string;
  kind: Kind;
  // Heavier powders/liquids sink through lighter liquids (gases always rise
  // through air).
  density: number;
  // Eight colour variants; each voxel keeps its own variant (its `shade`
  // byte & 7) as it moves, which gives the grainy Noita look.
  colors: readonly RGB[];
  // 1 = opaque. Translucent materials tint what is behind them.
  alpha: number;
  // Light the material gives off by itself, if any.
  glow?: RGB;
  // Chance per tick to catch fire when next to fire, lava or a spark.
  flammable?: number;
  // What a burning voxel leaves behind once its fire dies (default air).
  burnsTo?: number;
  // Lifetime in ticks for gases and fire: [min, max].
  life?: readonly [number, number];
  // Dissolved by acid.
  soluble?: boolean;
  // Melts into this material next to fire or lava.
  meltsTo?: number;
};

// Material ids. Plain numbers (no enums: Node runs the TypeScript as-is).
export const M = {
  AIR: 0,
  // solids
  ROCK: 1,
  ROCK_DARK: 2,
  DIRT: 3,
  WOOD: 4,
  METAL: 5,
  BRICK: 6,
  ICE: 7,
  GOLD_ORE: 8,
  CRYSTAL: 9,
  OBSIDIAN: 10,
  FUNGUS: 11,
  MOSS: 12,
  BONE: 13,
  GLASS: 14,
  COAL: 15,
  BRIMSTONE: 16,
  CLOTH: 17,
  CANDLE: 18,
  // powders
  SAND: 20,
  GRAVEL: 21,
  SNOW: 22,
  ASH: 23,
  GOLD_DUST: 24,
  GUNPOWDER: 25,
  // liquids
  WATER: 30,
  OIL: 31,
  LAVA: 32,
  ACID: 33,
  SLUDGE: 34,
  POTION: 35,
  // gases
  SMOKE: 40,
  STEAM: 41,
  TOXIC: 42,
  SPORES: 43,
  COFFEE: 36,
  // fire
  FIRE: 50,
  // built interiors (lab, club, den, station, café...)
  PLASTER: 60,
  TILE: 61,
  CARPET: 62,
  CONCRETE: 63,
  PLASTIC: 64,
  LEAF: 65,
  PAPER: 66,
  // self-lit fixtures
  NEON_PINK: 70,
  NEON_CYAN: 71,
  NEON_GREEN: 72,
  NEON_PURPLE: 73,
  LAMP: 74,
  SCREEN: 75,
  LED_RED: 76,
  LED_AMBER: 77,
  // Outside the world: reads as solid rock to the simulation.
  OUT: 255,
} as const;

// Eight variants around a base colour: a fixed spread of lighter and darker
// tones with a little hue drift, so neighbouring voxels read as grain.
export function variants(base: string, spread = 0.12): RGB[] {
  const [r, g, b] = hex(base);
  const steps = [-1, -0.6, -0.3, -0.1, 0.05, 0.2, 0.45, 0.8];
  return steps.map((s, i) => {
    const k = 1 + s * spread;
    const drift = ((i * 37) % 7) - 3;
    const c = (v: number, d: number) => Math.max(0, Math.min(255, Math.round(v * k + d)));
    return [c(r, drift), c(g, 0), c(b, -drift)] as RGB;
  });
}

const mat = (m: Omit<Material, 'colors'> & { colors: RGB[] | string; spread?: number }): Material => ({
  ...m,
  colors: typeof m.colors === 'string' ? variants(m.colors, m.spread) : m.colors,
});

export const MATERIALS: readonly (Material | undefined)[] = (() => {
  const t: (Material | undefined)[] = Array(256).fill(undefined);
  const add = (m: Material) => (t[m.id] = m);
  add(mat({ id: M.AIR, name: 'air', kind: 'air', density: 0, colors: '#000000', alpha: 0 }));
  add(mat({ id: M.ROCK, name: 'rock', kind: 'solid', density: 9, colors: '#5b4a3c', alpha: 1, spread: 0.22, soluble: true }));
  add(mat({ id: M.ROCK_DARK, name: 'dark rock', kind: 'solid', density: 9, colors: '#3a2f27', alpha: 1, spread: 0.25, soluble: true }));
  add(mat({ id: M.DIRT, name: 'dirt', kind: 'solid', density: 8, colors: '#6e4f33', alpha: 1, spread: 0.2, soluble: true }));
  add(mat({ id: M.WOOD, name: 'wood', kind: 'solid', density: 6, colors: '#7a5230', alpha: 1, spread: 0.18, flammable: 0.03, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.METAL, name: 'metal', kind: 'solid', density: 10, colors: '#6f7884', alpha: 1, spread: 0.14 }));
  add(mat({ id: M.BRICK, name: 'brick', kind: 'solid', density: 9, colors: '#7d4a3a', alpha: 1, spread: 0.18, soluble: true }));
  add(mat({ id: M.ICE, name: 'ice', kind: 'solid', density: 7, colors: '#9fd3f0', alpha: 0.7, spread: 0.08, meltsTo: M.WATER }));
  add(mat({ id: M.GOLD_ORE, name: 'gold ore', kind: 'solid', density: 10, colors: '#e2b03a', alpha: 1, spread: 0.25, glow: hex('#3a2a08'), soluble: true }));
  add(mat({ id: M.CRYSTAL, name: 'crystal', kind: 'solid', density: 8, colors: '#9a7bff', alpha: 0.85, spread: 0.2, glow: hex('#6a4cff') }));
  add(mat({ id: M.OBSIDIAN, name: 'obsidian', kind: 'solid', density: 10, colors: '#241c2e', alpha: 1, spread: 0.3 }));
  add(mat({ id: M.FUNGUS, name: 'glowing fungus', kind: 'solid', density: 5, colors: '#4fd8a8', alpha: 1, spread: 0.2, glow: hex('#1f8a6a'), flammable: 0.01, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.MOSS, name: 'moss', kind: 'solid', density: 5, colors: '#4f7a2e', alpha: 1, spread: 0.22, flammable: 0.04, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.BONE, name: 'bone', kind: 'solid', density: 7, colors: '#d8d0b8', alpha: 1, spread: 0.1, soluble: true }));
  add(mat({ id: M.GLASS, name: 'glass', kind: 'solid', density: 8, colors: '#bfe8ff', alpha: 0.3, spread: 0.05 }));
  add(mat({ id: M.COAL, name: 'coal', kind: 'solid', density: 7, colors: '#26221f', alpha: 1, spread: 0.3, flammable: 0.006, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.BRIMSTONE, name: 'brimstone', kind: 'solid', density: 9, colors: '#8a6a18', alpha: 1, spread: 0.25, flammable: 0.005, soluble: true }));
  add(mat({ id: M.CLOTH, name: 'cloth', kind: 'solid', density: 4, colors: '#8a3b4a', alpha: 1, spread: 0.12, flammable: 0.08, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.CANDLE, name: 'wax', kind: 'solid', density: 5, colors: '#efe2c0', alpha: 1, spread: 0.06, soluble: true }));
  add(mat({ id: M.SAND, name: 'sand', kind: 'powder', density: 5, colors: '#c9a45c', alpha: 1, spread: 0.18, soluble: true }));
  add(mat({ id: M.GRAVEL, name: 'gravel', kind: 'powder', density: 6, colors: '#6d655c', alpha: 1, spread: 0.3, soluble: true }));
  add(mat({ id: M.SNOW, name: 'snow', kind: 'powder', density: 2, colors: '#e8f2fb', alpha: 1, spread: 0.05, meltsTo: M.WATER }));
  add(mat({ id: M.ASH, name: 'ash', kind: 'powder', density: 2, colors: '#5a5652', alpha: 1, spread: 0.2, soluble: true }));
  add(mat({ id: M.GOLD_DUST, name: 'gold dust', kind: 'powder', density: 7, colors: '#ffd34a', alpha: 1, spread: 0.3, glow: hex('#4a3508') }));
  add(mat({ id: M.GUNPOWDER, name: 'gunpowder', kind: 'powder', density: 4, colors: '#2b2a30', alpha: 1, spread: 0.3, flammable: 1 }));
  add(mat({ id: M.WATER, name: 'water', kind: 'liquid', density: 3, colors: '#2a6fb0', alpha: 0.55, spread: 0.06 }));
  add(mat({ id: M.OIL, name: 'oil', kind: 'liquid', density: 2, colors: '#3b2a1c', alpha: 0.85, spread: 0.08, flammable: 0.25 }));
  add(mat({ id: M.LAVA, name: 'lava', kind: 'liquid', density: 6, colors: '#ff6a1a', alpha: 1, spread: 0.2, glow: hex('#ff5a10') }));
  add(mat({ id: M.ACID, name: 'acid', kind: 'liquid', density: 3, colors: '#7dff3a', alpha: 0.65, spread: 0.1, glow: hex('#2f7a10') }));
  add(mat({ id: M.SLUDGE, name: 'toxic sludge', kind: 'liquid', density: 4, colors: '#9fbf2a', alpha: 0.8, spread: 0.1, glow: hex('#2a3a06') }));
  add(mat({ id: M.POTION, name: 'potion', kind: 'liquid', density: 3, colors: '#d34cff', alpha: 0.6, spread: 0.12, glow: hex('#5a1a7a') }));
  add(mat({ id: M.COFFEE, name: 'coffee', kind: 'liquid', density: 3, colors: '#4a2a16', alpha: 0.9, spread: 0.08 }));
  add(mat({ id: M.SMOKE, name: 'smoke', kind: 'gas', density: 0, colors: '#3c3a3e', alpha: 0.3, spread: 0.15, life: [40, 120] }));
  add(mat({ id: M.STEAM, name: 'steam', kind: 'gas', density: 0, colors: '#c8d4dc', alpha: 0.22, spread: 0.06, life: [30, 90] }));
  add(mat({ id: M.TOXIC, name: 'toxic gas', kind: 'gas', density: 0, colors: '#7ad83a', alpha: 0.28, spread: 0.12, life: [60, 160], glow: hex('#14300a') }));
  add(mat({ id: M.SPORES, name: 'spores', kind: 'gas', density: 0, colors: '#c8ff9a', alpha: 0.2, spread: 0.2, life: [80, 200], glow: hex('#2a4a1a') }));
  add(mat({ id: M.FIRE, name: 'fire', kind: 'fire', density: 0, colors: [hex('#fff3a0'), hex('#ffe066'), hex('#ffc23a'), hex('#ffa024'), hex('#ff7a18'), hex('#ff5410'), hex('#e83a10'), hex('#b0240c')], alpha: 0.85, glow: hex('#ff8a20'), life: [8, 30] }));
  add(mat({ id: M.PLASTER, name: 'plaster', kind: 'solid', density: 8, colors: '#c9c2b5', alpha: 1, spread: 0.06, soluble: true }));
  add(mat({ id: M.TILE, name: 'tile', kind: 'solid', density: 9, colors: '#d8dde2', alpha: 1, spread: 0.05 }));
  add(mat({ id: M.CARPET, name: 'carpet', kind: 'solid', density: 4, colors: '#7a2e3a', alpha: 1, spread: 0.1, flammable: 0.02, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.CONCRETE, name: 'concrete', kind: 'solid', density: 9, colors: '#7d7f80', alpha: 1, spread: 0.12, soluble: true }));
  add(mat({ id: M.PLASTIC, name: 'plastic', kind: 'solid', density: 5, colors: '#3d6fb5', alpha: 1, spread: 0.06 }));
  add(mat({ id: M.LEAF, name: 'leaves', kind: 'solid', density: 3, colors: '#3f8f3a', alpha: 1, spread: 0.25, flammable: 0.05, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.PAPER, name: 'paper', kind: 'solid', density: 3, colors: '#efe8d6', alpha: 1, spread: 0.05, flammable: 0.15, burnsTo: M.ASH, soluble: true }));
  add(mat({ id: M.NEON_PINK, name: 'pink neon', kind: 'solid', density: 6, colors: '#ff5cbc', alpha: 1, spread: 0.08, glow: hex('#ff2a9a') }));
  add(mat({ id: M.NEON_CYAN, name: 'cyan neon', kind: 'solid', density: 6, colors: '#5ceeff', alpha: 1, spread: 0.08, glow: hex('#20c8ff') }));
  add(mat({ id: M.NEON_GREEN, name: 'green neon', kind: 'solid', density: 6, colors: '#8dff6a', alpha: 1, spread: 0.08, glow: hex('#40e040') }));
  add(mat({ id: M.NEON_PURPLE, name: 'purple neon', kind: 'solid', density: 6, colors: '#c07bff', alpha: 1, spread: 0.08, glow: hex('#8a40ff') }));
  add(mat({ id: M.LAMP, name: 'lamp', kind: 'solid', density: 6, colors: '#fff2c8', alpha: 1, spread: 0.04, glow: hex('#ffd890') }));
  add(mat({ id: M.SCREEN, name: 'screen', kind: 'solid', density: 6, colors: '#7fe0ff', alpha: 1, spread: 0.1, glow: hex('#3aa8d8') }));
  add(mat({ id: M.LED_RED, name: 'red light', kind: 'solid', density: 6, colors: '#ff5050', alpha: 1, spread: 0.06, glow: hex('#ff2020') }));
  add(mat({ id: M.LED_AMBER, name: 'amber light', kind: 'solid', density: 6, colors: '#ffb84a', alpha: 1, spread: 0.06, glow: hex('#ff9010') }));
  return t;
})();

export function material(id: number): Material {
  return MATERIALS[id] ?? (MATERIALS[M.ROCK] as Material);
}

// Flat lookup tables the simulation and renderer index per voxel.
export type Tables = {
  // packed RGB colour for (material << 3 | variant)
  color: Int32Array;
  // packed RGB glow for (material << 3 | variant); 0 = none
  glow: Int32Array;
  alpha: Float32Array; // per material
  kind: Uint8Array; // per material, see KIND
  density: Uint8Array; // per material
};

export const KIND = { air: 0, solid: 1, powder: 2, liquid: 3, gas: 4, fire: 5 } as const;

const pack = (c: RGB) => (c[0] << 16) | (c[1] << 8) | c[2];

// Builds the lookup tables, with optional per-biome colour overrides
// (e.g. bluish rock in the snowy depths): material id → base colour or
// eight explicit variants.
export function buildTables(overrides: Partial<Record<number, string | RGB[]>> = {}): Tables {
  const color = new Int32Array(256 * 8);
  const glow = new Int32Array(256 * 8);
  const alpha = new Float32Array(256);
  const kind = new Uint8Array(256);
  const density = new Uint8Array(256);
  for (let id = 0; id < 256; id++) {
    const m = id === M.OUT ? MATERIALS[M.ROCK]! : MATERIALS[id];
    if (!m) {
      kind[id] = KIND.solid;
      alpha[id] = 1;
      continue;
    }
    const o = overrides[id];
    const cols = o === undefined ? m.colors : typeof o === 'string' ? variants(o, 0.18) : o;
    for (let v = 0; v < 8; v++) {
      color[(id << 3) | v] = pack(cols[v % cols.length]);
      if (m.glow) {
        // Brighter variants glow a little more.
        const k = 0.75 + v * 0.06;
        glow[(id << 3) | v] = pack([Math.min(255, Math.round(m.glow[0] * k)), Math.min(255, Math.round(m.glow[1] * k)), Math.min(255, Math.round(m.glow[2] * k))]);
      }
    }
    alpha[id] = m.alpha;
    kind[id] = KIND[m.kind];
    density[id] = m.density;
  }
  return { color, glow, alpha, kind, density };
}
