import {
  isPaletteKey,
  isThemeKey,
  isWallpaperFormatKey,
  normalizeTime,
  type Course,
  type DayIndex,
  type Session,
} from '@cronia/core';
import { DEFAULT_STATE, newId } from './defaults.js';
import type { ScheduleState } from './types.js';

/**
 * Saneado del estado que viene de `localStorage`.
 *
 * El original confiaba en que lo guardado tuviera la forma correcta y hacía un
 * simple `JSON.parse`; bastaba una entrada corrupta —o guardada por una versión
 * anterior— para que la app reventara al arrancar. Aquí cada campo se valida
 * contra el valor por defecto, así que lo peor que puede pasar es perder una
 * preferencia, nunca quedarse con una pantalla en blanco.
 */

const pickString = (value: unknown, fallback: string): string =>
  typeof value === 'string' ? value : fallback;

const pickNumber = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(min, value))
    : fallback;

const pickBool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

const pickFrom = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;

/** Igual que {@link pickFrom}, pero admite ausencia: devuelve `null` si no encaja. */
const pickOptional = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;

const pickColor = (value: unknown): string | null =>
  typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : null;

/** Una hora en punto (`'0'`–`'24'`) o `'auto'`. */
function pickHourBound(value: unknown): string {
  if (value === 'auto') return 'auto';
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 && n <= 24 ? String(n) : 'auto';
}

function sanitizeSession(raw: unknown): Session | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const day = Number(value['day']);
  const start = normalizeTime(value['start']);
  const end = normalizeTime(value['end']);
  if (!Number.isInteger(day) || day < 0 || day > 6) return null;
  if (!start || !end) return null;

  return { day: day as DayIndex, start, end, room: pickString(value['room'], '') };
}

function sanitizeCourse(raw: unknown): Course | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;

  const sessions = Array.isArray(value['sessions'])
    ? value['sessions'].map(sanitizeSession).filter((s): s is Session => s !== null)
    : [];

  return {
    // Un identificador repetido rompería el resaltado al hacer clic, así que
    // se regenera cuando no es una cadena utilizable.
    id: typeof value['id'] === 'string' && value['id'] ? value['id'] : newId(),
    name: pickString(value['name'], ''),
    code: pickString(value['code'], ''),
    teacher: pickString(value['teacher'], ''),
    place: pickString(value['place'], ''),
    color: pickColor(value['color']),
    sessions,
  };
}

/** Reconstruye un estado válido a partir de datos de origen desconocido. */
export function sanitizeState(raw: unknown, fallbackCourses: Course[]): ScheduleState {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const show = (
    typeof value['show'] === 'object' && value['show'] !== null ? value['show'] : {}
  ) as Record<string, unknown>;

  const courses = Array.isArray(value['courses'])
    ? value['courses'].map(sanitizeCourse).filter((c): c is Course => c !== null)
    : null;

  return {
    title: pickString(value['title'], DEFAULT_STATE.title).slice(0, 80),
    subtitle: pickString(value['subtitle'], DEFAULT_STATE.subtitle).slice(0, 120),
    courses: courses ?? fallbackCourses,

    theme: isThemeKey(value['theme']) ? value['theme'] : DEFAULT_STATE.theme,
    palette: isPaletteKey(value['palette']) ? value['palette'] : null,
    block: pickOptional(value['block'], ['solid', 'soft', 'outline'] as const),
    radius:
      typeof value['radius'] === 'number' ? pickNumber(value['radius'], 8, 0, 18) : null,
    font: pickString(value['font'], DEFAULT_STATE.font),
    bg: pickColor(value['bg']),
    head: pickColor(value['head']),
    density: pickNumber(value['density'], DEFAULT_STATE.density, 0.7, 1.6),

    show: {
      time: pickBool(show['time'], DEFAULT_STATE.show.time),
      room: pickBool(show['room'], DEFAULT_STATE.show.room),
      teacher: pickBool(show['teacher'], DEFAULT_STATE.show.teacher),
      code: pickBool(show['code'], DEFAULT_STATE.show.code),
      place: pickBool(show['place'], DEFAULT_STATE.show.place),
      legend: pickBool(show['legend'], DEFAULT_STATE.show.legend),
      halfHours: pickBool(show['halfHours'], DEFAULT_STATE.show.halfHours),
    },
    nameCase: pickFrom(value['nameCase'], ['title', 'original'] as const, DEFAULT_STATE.nameCase),
    hourFormat: pickFrom(value['hourFormat'], ['12', '24'] as const, DEFAULT_STATE.hourFormat),
    days: pickFrom(value['days'], ['auto', '5', '6', '7'] as const, DEFAULT_STATE.days),
    from: pickHourBound(value['from']),
    to: pickHourBound(value['to']),

    exportMode: pickFrom(value['exportMode'], ['sheet', 'wallpaper'] as const, DEFAULT_STATE.exportMode),
    wallpaperFormat: isWallpaperFormatKey(value['wallpaperFormat'])
      ? value['wallpaperFormat']
      : DEFAULT_STATE.wallpaperFormat,
    orientation: pickFrom(
      value['orientation'],
      ['landscape', 'portrait'] as const,
      DEFAULT_STATE.orientation,
    ),
    paper: pickFrom(value['paper'], ['letter', 'a4', 'fit'] as const, DEFAULT_STATE.paper),
    scale: pickFrom(value['scale'], ['1.5', '2.5', '4'] as const, DEFAULT_STATE.scale),

    tab: pickFrom(value['tab'], ['load', 'courses', 'design', 'export'] as const, DEFAULT_STATE.tab),
  };
}
