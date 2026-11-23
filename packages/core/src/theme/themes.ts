import type { PaletteKey } from './palettes.js';

/** Estilo de los bloques de clase. */
export type BlockStyle = 'solid' | 'soft' | 'outline';

/** Un tema completo del horario exportado (no de la interfaz de la app). */
export interface Theme {
  name: string;
  /** Fondo de la hoja. */
  bg: string;
  /** Fondo de la cuadrícula. */
  surface: string;
  /** Líneas suaves de la cuadrícula. */
  grid: string;
  /** Líneas marcadas: bordes y separadores. */
  gridStrong: string;
  text: string;
  muted: string;
  /** Fondo de la fila de días. */
  head: string;
  /** Texto de la fila de días. */
  headText: string;
  font: string;
  block: BlockStyle;
  radius: number;
  palette: PaletteKey;
}

export const THEMES = {
  planner: {
    name: 'Planner',
    bg: '#F6F5EF',
    surface: '#FFFFFF',
    grid: '#E6E3D9',
    gridStrong: '#CCC8BA',
    text: '#1E1F1C',
    muted: '#7A786F',
    head: '#1E1F1C',
    headText: '#F6F5EF',
    font: 'Schibsted Grotesk',
    block: 'soft',
    radius: 8,
    palette: 'vivo',
  },
  pizarra: {
    name: 'Pizarra',
    bg: '#1E3A2F',
    surface: '#23443A',
    grid: 'rgba(255,255,255,0.07)',
    gridStrong: 'rgba(255,255,255,0.2)',
    text: '#F1EFE3',
    muted: '#A7BDB0',
    head: '#17302A',
    headText: '#F4D35E',
    font: 'Space Grotesk',
    block: 'outline',
    radius: 6,
    palette: 'pastel',
  },
  medianoche: {
    name: 'Medianoche',
    bg: '#0D1224',
    surface: '#131A33',
    grid: '#212949',
    gridStrong: '#343D63',
    text: '#E9ECFA',
    muted: '#8B93B6',
    head: '#1B2448',
    headText: '#E9ECFA',
    font: 'Space Grotesk',
    block: 'solid',
    radius: 10,
    palette: 'neon',
  },
  pastel: {
    name: 'Pastel',
    bg: '#FFF6F1',
    surface: '#FFFFFF',
    grid: '#F2E4DD',
    gridStrong: '#E5D0C6',
    text: '#4B3A3A',
    muted: '#A08782',
    head: '#FBDCCF',
    headText: '#4B3A3A',
    font: 'Nunito',
    block: 'solid',
    radius: 14,
    palette: 'pastel',
  },
  clasico: {
    name: 'Clásico',
    bg: '#FFFFFF',
    surface: '#FFFFFF',
    grid: '#E2E2E2',
    gridStrong: '#161616',
    text: '#161616',
    muted: '#6A6A6A',
    head: '#FFFFFF',
    headText: '#161616',
    font: 'Source Serif 4',
    block: 'outline',
    radius: 0,
    palette: 'tinta',
  },
  marea: {
    name: 'Marea',
    bg: '#E8F2F6',
    surface: '#FFFFFF',
    grid: '#D5E5EC',
    gridStrong: '#A9C4D0',
    text: '#0E2A3A',
    muted: '#5D7A89',
    head: '#0B3C8C',
    headText: '#FFFFFF',
    font: 'Schibsted Grotesk',
    block: 'soft',
    radius: 8,
    palette: 'oceano',
  },
} as const satisfies Record<string, Theme>;

export type ThemeKey = keyof typeof THEMES;

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export const isThemeKey = (value: unknown): value is ThemeKey =>
  typeof value === 'string' && value in THEMES;

/** Familias tipográficas que la app precarga antes de dibujar. */
export const FONT_FAMILIES = [
  'Schibsted Grotesk',
  'Space Grotesk',
  'Nunito',
  'Source Serif 4',
  'IBM Plex Mono',
] as const;
