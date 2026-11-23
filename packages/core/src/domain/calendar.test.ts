import { describe, expect, it } from 'vitest';
import { createCalendar, type CalendarOptions } from './calendar.js';
import type { Course } from './types.js';

const options: CalendarOptions = {
  title: 'Mi horario',
  startDate: '2026-09-22',
  endDate: '2026-10-05',
  timeZone: 'America/Merida',
};
const course: Course = {
  id: 'one',
  name: 'Álgebra',
  teacher: 'Ana',
  code: 'MAT',
  place: 'Edificio A',
  color: null,
  sessions: [{ day: 0, start: '07:00', end: '09:00', room: '12' }],
};
const build = (changes: Partial<CalendarOptions> = {}, courses = [course]) =>
  createCalendar(courses, { ...options, ...changes }, new Date('2026-09-21T12:00:00Z'));

describe('calendar export', () => {
  it('starts on the first matching weekday and includes the final date', () => {
    const result = build();
    expect(result).toContain('DTSTART;TZID=America/Merida:20260928T070000');
    expect(result).toContain('DTEND;TZID=America/Merida:20260928T090000');
    expect(result).toContain('RRULE:FREQ=WEEKLY;COUNT=2');
    expect(result).toContain('DESCRIPTION:Docente: Ana\\nClave: MAT\\nExportado desde Cronia');
    expect(result).toContain('LOCATION:Edificio A · 12');
    expect(result).toContain('DTSTAMP:20260921T120000Z');
    expect(result).toMatch(/END:VCALENDAR\r\n$/);
  });
  it('handles Sunday and midnight at the end of the session', () => {
    const result = build({}, [
      { ...course, sessions: [{ day: 6, start: '23:00', end: '24:00', room: '' }] },
    ]);
    expect(result).toContain('20260927T230000');
    expect(result).toContain('20260928T000000');
  });
  it('escapes text and folds by UTF-8 bytes without corrupting Unicode', () => {
    const name = 'Á😀'.repeat(40) + ',;\\\nEND:VEVENT';
    const result = build({}, [{ ...course, name }]);
    for (const line of result.split('\r\n'))
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(result.replace(/\r\n /g, '')).toContain(
      'SUMMARY:' + 'Á😀'.repeat(40) + '\\,\\;\\\\\\nEND:VEVENT',
    );
    expect(result.match(/\r\nEND:VEVENT/g)).toHaveLength(1);
  });
  it('rejects invalid periods and time zones', () => {
    for (const changes of [
      { startDate: '' },
      { startDate: '2026-02-30' },
      { endDate: '2026-01-01' },
      { timeZone: 'Fake/Zone' },
      { timeZone: 'UTC\r\nINJECT' },
    ])
      expect(() => build(changes)).toThrow();
  });
  it('does not silently export invalid sessions or an empty calendar', () => {
    expect(() => build({}, [])).toThrow('No hay clases');
    expect(() => build({ endDate: '2026-09-23' })).toThrow('No hay clases');
    for (const end of ['06:00', '25:00', '24:30', ''])
      expect(() => build({}, [{ ...course, sessions: [{ ...course.sessions[0]!, end }] }])).toThrow(
        'Revisa las materias',
      );
  });
  it('keeps event identities stable between downloads', () => {
    const first = build().match(/UID:.*/g);
    const second = createCalendar([course], options).match(/UID:.*/g);
    expect(first).toEqual(second);
  });
});
