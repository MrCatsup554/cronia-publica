import { hourRange, placeSessions, visibleDays } from '../domain/schedule.js';
import type { GridLayout, RenderOptions } from './layout.js';

/**
 * Disposición para fondo de pantalla de teléfono.
 *
 * A diferencia de la hoja, aquí el lienzo tiene un tamaño fijo —el de la
 * pantalla— y es la cuadrícula la que se adapta. Además hay dos franjas que
 * deben quedar despejadas: arriba el reloj, la fecha y los widgets de la
 * pantalla de bloqueo; abajo los accesos a linterna y cámara junto al
 * indicador de inicio. El horario se centra en la banda que queda libre.
 */

/**
 * Un formato de pantalla.
 *
 * Las medidas van en puntos lógicos, no en píxeles, y es `scale` quien lleva al
 * tamaño real del archivo. Se hace así para que los tamaños de letra del render
 * —pensados para puntos— salgan legibles en el teléfono: 13 px sobre un lienzo
 * de 1290 píxeles serían diminutos, pero 13 puntos a 3× son los mismos 13
 * puntos que ve el ojo.
 */
export interface WallpaperFormat {
  name: string;
  /** Descripción corta de a qué teléfonos les sirve. */
  hint: string;
  /** Ancho en puntos lógicos. */
  width: number;
  /** Alto en puntos lógicos. */
  height: number;
  /** Factor a píxeles del archivo final. */
  scale: number;
}

export const WALLPAPER_FORMATS = {
  iphone: { name: 'iPhone', hint: '19.5:9 · 1290 × 2796', width: 430, height: 932, scale: 3 },
  android: { name: 'Android', hint: '20:9 · 1440 × 3200', width: 360, height: 800, scale: 4 },
  classic: { name: 'Clásico', hint: '16:9 · 1440 × 2560', width: 360, height: 640, scale: 4 },
} as const satisfies Record<string, WallpaperFormat>;

export type WallpaperFormatKey = keyof typeof WALLPAPER_FORMATS;

export const WALLPAPER_FORMAT_KEYS = Object.keys(WALLPAPER_FORMATS) as WallpaperFormatKey[];

export const isWallpaperFormatKey = (value: unknown): value is WallpaperFormatKey =>
  typeof value === 'string' && value in WALLPAPER_FORMATS;

/**
 * Fracción de alto reservada arriba, para el reloj y los widgets.
 *
 * El reloj de iOS es grande y, con un par de widgets debajo, llega a cubrir
 * cerca de un tercio de la pantalla. Se deja algo más de margen que eso.
 */
const SAFE_TOP = 0.35;

/**
 * Fracción de alto reservada abajo, para los botones de linterna y cámara y el
 * indicador de inicio.
 */
const SAFE_BOTTOM = 0.15;

/** Margen lateral, como fracción del ancho. */
const SIDE_MARGIN = 0.045;

/** Topes del alto de cada hora, en puntos, para que la rejilla no se deforme. */
const MIN_ROW_HEIGHT = 18;
const MAX_ROW_HEIGHT = 140;

/** La fila de días ocupa esta fracción de la banda, dentro de unos topes. */
const DAY_ROW_RATIO = 0.075;
const MIN_DAY_ROW = 26;
const MAX_DAY_ROW = 64;

export interface WallpaperLayout extends GridLayout {
  /** Ancho del lienzo en puntos lógicos. */
  width: number;
  /** Alto del lienzo en puntos lógicos. */
  height: number;
  format: WallpaperFormat;
  /** Banda central libre de elementos del sistema, en puntos. */
  safeTop: number;
  safeBottom: number;
  /** `true` si la cuadrícula no cabe entera en la banda y se ha recortado. */
  overflows: boolean;
}

/**
 * Calcula dónde va la cuadrícula dentro de la pantalla.
 *
 * El alto de cada hora sale de repartir la banda disponible entre las horas que
 * haya que mostrar, con topes para que ni se aplaste ni se estire. Si el
 * resultado no llena la banda, la cuadrícula se centra en ella.
 */
export function layoutWallpaper(
  options: RenderOptions,
  format: WallpaperFormat,
): WallpaperLayout {
  const { width, height } = format;

  const sessions = placeSessions(options.courses);
  const days = visibleDays(sessions, options.days);
  const [firstHour, lastHour] = hourRange(sessions, options.from, options.to);
  const hours = Math.max(1, lastHour - firstHour);

  const safeTop = height * SAFE_TOP;
  const safeBottom = height * SAFE_BOTTOM;
  const bandHeight = height - safeTop - safeBottom;

  const dayRowHeight = Math.round(
    Math.min(MAX_DAY_ROW, Math.max(MIN_DAY_ROW, bandHeight * DAY_ROW_RATIO)),
  );

  // El deslizador de densidad sigue mandando, pero acotado: en una pantalla no
  // se puede crecer sin límite, y pasarse sólo conseguiría salir de la banda.
  const available = bandHeight - dayRowHeight;
  const fitted = available / hours;
  const rowHeight = Math.max(
    MIN_ROW_HEIGHT,
    Math.min(MAX_ROW_HEIGHT, fitted * Math.min(1, options.density)),
  );

  const gridHeight = dayRowHeight + hours * rowHeight;
  const gridLeft = Math.round(width * SIDE_MARGIN);
  const gridWidth = width - gridLeft * 2;

  // Centrada en la banda: si sobra sitio queda a media altura, y si falta se
  // reparte el desbordamiento entre arriba y abajo en vez de comerse un extremo.
  const gridTop = safeTop + (bandHeight - gridHeight) / 2;

  // La columna de horas necesita caber «08:00», o «8 p. m.» en formato de 12 h.
  const gutter = Math.round(Math.min(gridWidth * 0.16, options.hourFormat === '12' ? 62 : 46));

  return {
    width,
    height,
    format,
    sessions,
    days,
    firstHour,
    lastHour,
    rowHeight,
    dayRowHeight,
    gutter,
    gridLeft,
    gridTop,
    gridWidth,
    gridHeight,
    safeTop,
    safeBottom,
    overflows: gridHeight > bandHeight + 0.5,
  };
}

/** Tamaño en píxeles del archivo que producirá un formato. */
export const wallpaperPixelSize = (format: WallpaperFormat): { w: number; h: number } => ({
  w: Math.round(format.width * format.scale),
  h: Math.round(format.height * format.scale),
});
