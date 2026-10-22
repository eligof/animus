import type { Theme } from './types.ts';
import { lab } from './lab.ts';
import { club } from './club.ts';
import { den } from './den.ts';
import { station } from './station.ts';
import { cafe } from './cafe.ts';

export const THEMES: readonly Theme[] = [lab, club, den, station, cafe];

export function getTheme(id: string): Theme | undefined {
  return THEMES.find((t) => t.id === id);
}

export function themeIds(): string[] {
  return THEMES.map((t) => t.id);
}
