import type { Theme } from './types.ts';
import { BIOMES } from '../cave/biomes/index.ts';

export const THEMES: readonly Theme[] = BIOMES;

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function themeIds(): string[] {
  return THEMES.map((t) => t.id);
}
