/** Paletas de color para distinguir las materias entre sí. */

export interface Palette {
  name: string;
  colors: readonly string[];
}

export const PALETTES = {
  vivo: {
    name: 'Vivo',
    colors: [
      '#E4572E',
      '#2E86AB',
      '#F2A541',
      '#3BB273',
      '#7768AE',
      '#E15A97',
      '#1B998B',
      '#D1495B',
      '#5C80BC',
      '#A5673F',
    ],
  },
  pastel: {
    name: 'Pastel',
    colors: [
      '#F4A6A6',
      '#9FD3E6',
      '#F9D29D',
      '#B5E2B0',
      '#C9B6E4',
      '#F7B8D2',
      '#9ED9CC',
      '#FFC6A5',
      '#C8D8A8',
      '#B8C4F0',
    ],
  },
  tierra: {
    name: 'Tierra',
    colors: [
      '#B5651D',
      '#6B8E23',
      '#C9A227',
      '#8B5A2B',
      '#A0522D',
      '#4F6D3A',
      '#D08C60',
      '#7B6D4D',
      '#9C4A3C',
      '#5E7F7A',
    ],
  },
  oceano: {
    name: 'Océano',
    colors: [
      '#0B3C8C',
      '#0077B6',
      '#00A6C8',
      '#2A9D8F',
      '#5E60CE',
      '#264653',
      '#4EA8DE',
      '#168AAD',
      '#3D5A80',
      '#48BFA3',
    ],
  },
  neon: {
    name: 'Neón',
    colors: [
      '#FF3CAC',
      '#2BD2FF',
      '#FFE53B',
      '#39E07A',
      '#B26BFF',
      '#FF7A45',
      '#00F5D4',
      '#F15BB5',
      '#8C9EFF',
      '#FEE440',
    ],
  },
  tinta: {
    name: 'Tinta',
    colors: [
      '#1F2933',
      '#8A1C1C',
      '#1D4E89',
      '#2F5D3A',
      '#6B4E16',
      '#4B2E83',
      '#0F5257',
      '#7A3B69',
      '#3E4C59',
      '#8C5A2B',
    ],
  },
} as const satisfies Record<string, Palette>;

export type PaletteKey = keyof typeof PALETTES;

export const PALETTE_KEYS = Object.keys(PALETTES) as PaletteKey[];

export const isPaletteKey = (value: unknown): value is PaletteKey =>
  typeof value === 'string' && value in PALETTES;
