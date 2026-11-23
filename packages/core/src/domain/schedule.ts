import type { Course, DayIndex, PlacedSession, Session } from './types.js';
import { toMinutes } from './time.js';

/** `true` si la sesión tiene horas válidas y el fin es posterior al inicio. */
export function isValidSession(session: Session): boolean {
  const start = toMinutes(session.start);
  const end = toMinutes(session.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/**
 * Aplana las materias en una lista de sesiones ubicadas en el tiempo,
 * descartando las que estén incompletas o mal capturadas.
 */
export function placeSessions(courses: readonly Course[]): PlacedSession[] {
  const placed: PlacedSession[] = [];
  courses.forEach((course, courseIndex) => {
    course.sessions.forEach((session, sessionIndex) => {
      if (!isValidSession(session)) return;
      placed.push({
        course,
        courseIndex,
        session,
        sessionIndex,
        startMin: toMinutes(session.start),
        endMin: toMinutes(session.end),
      });
    });
  });
  return placed;
}

export type DaysSetting = 'auto' | '5' | '6' | '7';

/**
 * Decide qué columnas de día mostrar.
 *
 * En modo automático se crece hasta el último día con clases, con un mínimo de
 * lunes a viernes, para que un horario de 5 días no arrastre columnas vacías.
 */
export function visibleDays(sessions: readonly PlacedSession[], setting: DaysSetting): DayIndex[] {
  if (setting !== 'auto') {
    return Array.from({ length: Number(setting) }, (_, i) => i as DayIndex);
  }
  const used = new Set(sessions.map((s) => s.session.day));
  const count = used.has(6) ? 7 : used.has(5) ? 6 : 5;
  return Array.from({ length: count }, (_, i) => i as DayIndex);
}

/** `'auto'` o una hora en punto (`0`–`24`) expresada como cadena. */
export type HourBound = 'auto' | string;

/**
 * Calcula el rango de horas visible como `[desde, hasta)`, en horas en punto.
 *
 * Los límites manuales nunca pueden invertir el rango, y siempre se muestran al
 * menos cuatro horas para que la cuadrícula no quede aplastada.
 */
export function hourRange(
  sessions: readonly PlacedSession[],
  from: HourBound,
  to: HourBound,
): [number, number] {
  let start = sessions.length ? Math.floor(Math.min(...sessions.map((s) => s.startMin)) / 60) : 7;
  let end = sessions.length ? Math.ceil(Math.max(...sessions.map((s) => s.endMin)) / 60) : 15;

  if (from !== 'auto') start = Math.min(Number(from), end - 1);
  if (to !== 'auto') end = Math.max(Number(to), start + 1);

  start = Math.max(0, Math.min(23, start));
  end = Math.min(24, Math.max(start + 1, end));
  if (end - start < 4) end = Math.min(24, start + 4);
  if (end - start < 4) start = Math.max(0, end - 4);

  return [start, end];
}

/** Pares de sesiones que se traslapan el mismo día. */
export function findConflicts(
  sessions: readonly PlacedSession[],
): Array<[PlacedSession, PlacedSession]> {
  const conflicts: Array<[PlacedSession, PlacedSession]> = [];
  const byDay = new Map<DayIndex, PlacedSession[]>();
  for (const session of sessions) {
    const bucket = byDay.get(session.session.day);
    if (bucket) bucket.push(session);
    else byDay.set(session.session.day, [session]);
  }
  for (const bucket of byDay.values()) {
    const sorted = [...bucket].sort((a, b) => a.startMin - b.startMin);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const a = sorted[i]!;
        const b = sorted[j]!;
        // Al estar ordenado por inicio, en cuanto uno no traslapa ninguno posterior lo hará.
        if (b.startMin >= a.endMin) break;
        conflicts.push([a, b]);
      }
    }
  }
  return conflicts;
}

/** Minutos de clase a la semana de una materia. */
export const courseMinutes = (course: Course): number =>
  course.sessions.reduce(
    (total, session) =>
      total + (isValidSession(session) ? toMinutes(session.end) - toMinutes(session.start) : 0),
    0,
  );

/** Minutos de clase a la semana en total. */
export const totalMinutes = (sessions: readonly PlacedSession[]): number =>
  sessions.reduce((total, s) => total + (s.endMin - s.startMin), 0);

/** Formatea una duración en minutos como «3 h» o «2.5 h». */
export function formatHours(minutes: number): string {
  const hours = minutes / 60;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
}
