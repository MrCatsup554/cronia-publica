import type { DayIndex, TimeString } from './types.js';

/** Nombres completos de los días, empezando en lunes. */
export const DAYS = [
  'Lunes',
  'Martes',
  'Miércoles',
  'Jueves',
  'Viernes',
  'Sábado',
  'Domingo',
] as const;

/**
 * Abreviaturas de tres letras. Llevan tilde porque en español la abreviatura
 * conserva la tilde de la palabra completa: «Mié.», «Sáb.».
 */
export const DAYS_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;

export const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Convierte `HH:MM` a minutos desde la medianoche. Devuelve `NaN` si no es válido. */
export function toMinutes(time: TimeString): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(time).trim());
  if (!match) return Number.NaN;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 24 || m > 59) return Number.NaN;
  return h * 60 + m;
}

/** Convierte minutos desde la medianoche a `HH:MM`. */
export const toTimeString = (minutes: number): TimeString =>
  `${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`;

/**
 * Normaliza una hora escrita de cualquier forma razonable a `HH:MM`.
 * Acepta `7`, `7:00`, `7.00`, `7h00`, `07:00 hrs`. Devuelve `''` si no se entiende.
 */
export function normalizeTime(raw: unknown): TimeString {
  const match = /(\d{1,2})\s*[:.h]?\s*(\d{2})?/.exec(String(raw ?? ''));
  if (!match) return '';
  const h = Number(match[1]);
  const m = Number(match[2] ?? 0);
  if (h > 24 || m > 59) return '';
  return `${pad2(h)}:${pad2(m)}`;
}

export type HourFormat = '12' | '24';

/** Da formato a `HH:MM` en 24 h o 12 h («1:30 p. m.», con el espacio fino que pide la RAE). */
export function formatTime(time: TimeString, format: HourFormat): string {
  if (format === '24') return time;
  const [rawH = '0', rawM = '00'] = time.split(':');
  const h = Number(rawH);
  const suffix = h >= 12 && h < 24 ? 'p. m.' : 'a. m.';
  return `${h % 12 || 12}:${rawM} ${suffix}`;
}

/** Da formato a una hora en punto para la columna lateral de la cuadrícula. */
export function formatHour(hour: number, format: HourFormat): string {
  if (format === '24') return `${pad2(hour)}:00`;
  const suffix = hour >= 12 && hour < 24 ? 'p. m.' : 'a. m.';
  return `${hour % 12 || 12} ${suffix}`;
}

/**
 * Da formato a un rango horario para un bloque de clase.
 *
 * En modo compacto se omiten los minutos en punto y, en 12 h, el «a. m.» o
 * «p. m.» se escribe una sola vez cuando ambos extremos caen en la misma mitad
 * del día: «7–9 a. m.» en vez de «7:00 a. m.–9:00 a. m.». Es lo que permite
 * que el rango quepa en una columna del ancho de un teléfono.
 */
export function formatTimeRange(
  start: TimeString,
  end: TimeString,
  format: HourFormat,
  compact = false,
): string {
  if (!compact) return `${formatTime(start, format)}\u2013${formatTime(end, format)}`;

  const [startH = 0, startM = 0] = start.split(':').map(Number);
  const [endH = 0, endM = 0] = end.split(':').map(Number);

  if (format === '24') {
    const short = (h: number, m: number): string => (m === 0 ? String(h) : `${h}:${pad2(m)}`);
    return `${short(startH, startM)}\u2013${short(endH, endM)}`;
  }

  const suffixOf = (h: number): string => (h >= 12 && h < 24 ? 'p. m.' : 'a. m.');
  const short = (h: number, m: number): string =>
    m === 0 ? String(h % 12 || 12) : `${h % 12 || 12}:${pad2(m)}`;

  const startSuffix = suffixOf(startH);
  const endSuffix = suffixOf(endH);

  return startSuffix === endSuffix
    ? `${short(startH, startM)}\u2013${short(endH, endM)} ${endSuffix}`
    : `${short(startH, startM)} ${startSuffix}\u2013${short(endH, endM)} ${endSuffix}`;
}

export const dayName = (day: DayIndex): string => DAYS[day];
export const dayNameShort = (day: DayIndex): string => DAYS_SHORT[day];
