import type { Course } from '../domain/types.js';
import { inkOn, isDark, mix } from './color.js';
import { PALETTES, type PaletteKey } from './palettes.js';
import { THEMES, type BlockStyle, type Theme, type ThemeKey } from './themes.js';

/** Personalizaciones que se aplican encima de un tema base. `null` = usar el tema. */
export interface ThemeOverrides {
  theme: ThemeKey;
  palette: PaletteKey | null;
  block: BlockStyle | null;
  radius: number | null;
  font: string;
  bg: string | null;
  head: string | null;
}

/** Un tema ya resuelto, con la paleta expandida y listo para dibujar. */
export interface ResolvedTheme extends Theme {
  colors: readonly string[];
}

/**
 * Combina el tema base con las personalizaciones.
 *
 * Cambiar el fondo obliga a recalcular texto y cuadrícula: si no, un fondo
 * oscuro elegido a mano dejaría el texto negro sobre negro. Los tonos derivados
 * se obtienen mezclando con el propio fondo para que todo siga siendo coherente.
 */
export function resolveTheme(overrides: ThemeOverrides): ResolvedTheme {
  const base = THEMES[overrides.theme] ?? THEMES.planner;
  const theme: Theme = { ...base };

  if (overrides.bg) {
    const dark = isDark(overrides.bg);
    theme.bg = overrides.bg;
    theme.surface = dark ? mix(overrides.bg, '#ffffff', 0.94) : mix(overrides.bg, '#ffffff', 0.6);
    theme.text = dark ? '#EEF0EC' : '#1C1E1B';
    theme.muted = dark ? '#A5ACA6' : '#747870';
    theme.grid = dark ? 'rgba(255,255,255,0.08)' : mix(overrides.bg, '#000000', 0.9);
    theme.gridStrong = dark ? 'rgba(255,255,255,0.2)' : mix(overrides.bg, '#000000', 0.78);
  }

  if (overrides.head) {
    theme.head = overrides.head;
    theme.headText = inkOn(overrides.head);
  }

  if (overrides.font) theme.font = overrides.font;
  if (overrides.block) theme.block = overrides.block;
  if (overrides.radius !== null) theme.radius = overrides.radius;

  const paletteKey = overrides.palette ?? base.palette;
  const palette = PALETTES[paletteKey] ?? PALETTES.vivo;

  return { ...theme, palette: paletteKey, colors: palette.colors };
}

/**
 * Color de una materia: el que se haya fijado a mano, o el que le toca por
 * posición en la paleta.
 */
export const colorOf = (course: Course, index: number, theme: ResolvedTheme): string =>
  course.color ?? theme.colors[index % theme.colors.length]!;
