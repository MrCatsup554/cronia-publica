/** Utilidades de color para el render: mezcla, luminancia y contraste. */

export type Rgb = [number, number, number];

const clamp255 = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

/** Convierte `#rgb`, `#rrggbb`, `rgb(...)` o `rgba(...)` a componentes RGB. */
export function toRgb(color: string): Rgb {
  const value = color.trim();

  if (value.startsWith('rgb')) {
    const parts = value.match(/[\d.]+/g)?.map(Number) ?? [];
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
  }

  let hex = value.replace('#', '');
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((char) => char + char)
      .join('');
  }
  if (hex.length < 6) return [0, 0, 0];

  return [
    parseInt(hex.slice(0, 2), 16) || 0,
    parseInt(hex.slice(2, 4), 16) || 0,
    parseInt(hex.slice(4, 6), 16) || 0,
  ];
}

/** Convierte componentes RGB a `#rrggbb`. */
export const toHex = (rgb: Rgb): string =>
  `#${rgb.map((channel) => clamp255(channel).toString(16).padStart(2, '0')).join('')}`;

/** Mezcla dos colores; `amount` es la proporción del primero (0–1). */
export function mix(a: string, b: string, amount: number): string {
  const first = toRgb(a);
  const second = toRgb(b);
  return toHex(
    first.map((channel, i) => channel * amount + second[i]! * (1 - amount)) as unknown as Rgb,
  );
}

/** Luminancia relativa según WCAG 2.1. */
export function luminance(color: string): number {
  const [r, g, b] = toRgb(color).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as Rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razón de contraste WCAG entre dos colores, de 1 a 21. */
export function contrastRatio(a: string, b: string): number {
  const lighter = Math.max(luminance(a), luminance(b));
  const darker = Math.min(luminance(a), luminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Elige tinta clara u oscura sobre un fondo, quedándose con la que más
 * contraste dé. Así el texto de un bloque de color sigue siendo legible sea
 * cual sea el color que elija la persona usuaria.
 */
export function inkOn(background: string, dark = '#161a17', light = '#ffffff'): string {
  return contrastRatio(background, dark) >= contrastRatio(background, light) ? dark : light;
}

/** `true` si el color es lo bastante oscuro como para tratarlo como fondo oscuro. */
export const isDark = (color: string): boolean => luminance(color) < 0.2;
