import type { Course } from './types.js';
import { toMinutes } from './time.js';

export interface CalendarOptions {
  title: string;
  startDate: string;
  endDate: string;
  timeZone: string;
}

const DAY = 86_400_000;
const escapeText = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

function parseDate(value: string): number {
  const date = new Date(`${value}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error('Selecciona fechas válidas para el ciclo escolar.');
  }
  return date.getTime();
}

const stamp = (value: number): string =>
  new Date(value).toISOString().replace(/[-:]/g, '').slice(0, 15);

/** Pliega por octetos UTF-8, sin separar caracteres Unicode (RFC 5545). */
function fold(line: string): string {
  const encoder = new TextEncoder();
  let result = '';
  let length = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (length + size > 75) {
      result += '\r\n ';
      length = 1;
    }
    result += char;
    length += size;
  }
  return result;
}

export interface CalendarSeries {
  key: string;
  summary: string;
  description: string;
  location: string;
  start: string;
  end: string;
  recurrence: string;
}

/** Datos comunes para Google Calendar e iCalendar. Un horario vacío permite borrar sus eventos. */
export function calendarSeries(
  courses: readonly Course[],
  options: CalendarOptions,
): CalendarSeries[] {
  const start = parseDate(options.startDate);
  const end = parseDate(options.endDate);
  if (end < start) throw new Error('La fecha final debe ser igual o posterior a la inicial.');
  if (!/^[A-Za-z0-9_+\-/]+$/.test(options.timeZone))
    throw new Error('Selecciona una zona horaria válida.');
  try {
    new Intl.DateTimeFormat('en', { timeZone: options.timeZone });
  } catch {
    throw new Error('Selecciona una zona horaria válida.');
  }
  const series: CalendarSeries[] = [];
  for (const course of courses) {
    for (const [index, session] of course.sessions.entries()) {
      const from = toMinutes(session.start);
      const to = toMinutes(session.end);
      if (
        !course.name.trim() ||
        !Number.isInteger(session.day) ||
        session.day < 0 ||
        session.day > 6 ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from >= to ||
        from >= 1440 ||
        to > 1440
      ) {
        throw new Error('Revisa las materias: cada sesión necesita nombre, día y horas válidas.');
      }
      const weekday = (new Date(start).getUTCDay() + 6) % 7;
      const first = start + ((session.day - weekday + 7) % 7) * DAY;
      if (first > end) continue;
      const repeats = Math.floor((end - first) / (7 * DAY)) + 1;
      const description = [
        course.teacher && `Docente: ${course.teacher}`,
        course.code && `Clave: ${course.code}`,
        'Exportado desde Cronia',
      ]
        .filter(Boolean)
        .join('\n');
      series.push({
        key: `${course.id}:${index}`,
        summary: course.name,
        description,
        location: [course.place, session.room].filter(Boolean).join(' · '),
        start: new Date(first + from * 60_000).toISOString().slice(0, 19),
        end: new Date(first + to * 60_000).toISOString().slice(0, 19),
        recurrence: `RRULE:FREQ=WEEKLY;COUNT=${repeats}`,
      });
    }
  }
  return series;
}

/** Una serie semanal por sesión, limitada al ciclo e independiente del diseño visual. */
export function createCalendar(
  courses: readonly Course[],
  options: CalendarOptions,
  now = new Date(),
): string {
  const series = calendarSeries(courses, options);
  if (!series.length) throw new Error('No hay clases dentro del periodo seleccionado.');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Cronia//Horario escolar//ES',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(options.title)}`,
    `X-WR-TIMEZONE:${options.timeZone}`,
  ];
  for (const event of series) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${encodeURIComponent(event.key)}-${options.startDate}@cronia`,
      `DTSTAMP:${stamp(now.getTime())}Z`,
      `DTSTART;TZID=${options.timeZone}:${event.start.replace(/[-:]/g, '')}`,
      `DTEND;TZID=${options.timeZone}:${event.end.replace(/[-:]/g, '')}`,
      event.recurrence,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      `LOCATION:${escapeText(event.location)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
