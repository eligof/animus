import type { Theme } from './types.ts';
import { WORLDS } from '../worlds/index.ts';

export const THEMES: readonly Theme[] = WORLDS;

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function themeIds(): string[] {
  return THEMES.map((t) => t.id);
}
