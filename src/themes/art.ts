import type { RGB } from '../term/color.ts';

// Deterministic hash noise in [0, 1) for integer inputs.
export function noise(n: number, seed = 0): number {
  let h = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(seed | 0, 0xc2b2ae35);
  h ^= h >>> 13;
  h = Math.imul(h, 0x27d4eb2f);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

// 0..1 triangle wave with the given period (seconds).
export function pulse(t: number, period: number, offset = 0): number {
  const p = ((((t + offset) % period) + period) % period) / period;
  return p < 0.5 ? p * 2 : 2 - p * 2;
}

// Fractional part, always in [0, 1).
export const frac = (v: number): number => v - Math.floor(v);

// True inside the rectangle [u0, u1) x [v0, v1) of a face or wall.
export const inside = (u: number, v: number, u0: number, v0: number, u1: number, v1: number): boolean =>
  u >= u0 && u < u1 && v >= v0 && v < v1;

// Picks one of two colours in a checkerboard of `size`-unit squares.
export function checker(u: number, v: number, size: number, a: RGB, b: RGB): RGB {
  return (Math.floor(u / size) + Math.floor(v / size)) % 2 === 0 ? a : b;
}
