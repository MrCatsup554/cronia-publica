import { describe, expect, it } from 'vitest';
import type { Course, DayIndex } from './types.js';
import { findConflicts, hourRange, placeSessions, visibleDays } from './schedule.js';
import { formatHour, formatTime, formatTimeRange, normalizeTime, toMinutes } from './time.js';

const course = (id: string, sessions: Array<[DayIndex, string, string]>): Course => ({
  id,
  name: id,
  code: '',
  teacher: '',
  place: '',
  color: null,
  sessions: sessions.map(([day, start, end]) => ({ day, start, end, room: '' })),
});

describe('toMinutes', () => {
  it('convierte horas válidas', () => {
    expect(toMinutes('08:00')).toBe(480);
    expect(toMinutes('13:30')).toBe(810);
  });

  it('rechaza lo que no es una hora', () => {
    expect(toMinutes('')).toBeNaN();
    expect(toMinutes('25:00')).toBeNaN();
    expect(toMinutes('08:70')).toBeNaN();
    expect(toMinutes('abc')).toBeNaN();
  });
});

describe('normalizeTime', () => {
  it('acepta las formas que aparecen en los documentos', () => {
    expect(normalizeTime('7')).toBe('07:00');
    expect(normalizeTime('7:00')).toBe('07:00');
    expect(normalizeTime('7.30')).toBe('07:30');
    expect(normalizeTime('13h00')).toBe('13:00');
  });

  it('descarta valores imposibles', () => {
    expect(normalizeTime('99:99')).toBe('');
    expect(normalizeTime(null)).toBe('');
  });
});

describe('formatTime', () => {
  it('deja intacto el formato de 24 horas', () => {
    expect(formatTime('13:30', '24')).toBe('13:30');
  });

  it('usa la abreviatura española en 12 horas', () => {
    expect(formatTime('13:30', '12')).toBe('1:30 p. m.');
    expect(formatTime('00:15', '12')).toBe('12:15 a. m.');
    expect(formatTime('12:00', '12')).toBe('12:00 p. m.');
  });
});

describe('formatHour', () => {
  it('formatea horas en punto', () => {
    expect(formatHour(8, '24')).toBe('08:00');
    expect(formatHour(20, '12')).toBe('8 p. m.');
  });
});

describe('formatTimeRange', () => {
  it('escribe el rango completo cuando no se pide compacto', () => {
    expect(formatTimeRange('08:00', '10:00', '24')).toBe('08:00\u201310:00');
  });

  it('en compacto de 24 h quita los minutos en punto', () => {
    expect(formatTimeRange('08:00', '10:00', '24', true)).toBe('8\u201310');
    expect(formatTimeRange('07:30', '09:00', '24', true)).toBe('7:30\u20139');
    expect(formatTimeRange('13:00', '15:30', '24', true)).toBe('13\u201315:30');
  });

  it('en compacto de 12 h escribe el sufijo una sola vez si no cambia', () => {
    expect(formatTimeRange('07:00', '09:00', '12', true)).toBe('7\u20139 a. m.');
    expect(formatTimeRange('13:00', '15:00', '12', true)).toBe('1\u20133 p. m.');
  });

  it('en compacto de 12 h repite el sufijo al cruzar el mediodía', () => {
    expect(formatTimeRange('11:00', '13:00', '12', true)).toBe('11 a. m.\u20131 p. m.');
  });
});

describe('placeSessions', () => {
  it('descarta sesiones con horas inválidas o invertidas', () => {
    const courses = [
      course('a', [
        [0, '08:00', '10:00'],
        [1, '10:00', '08:00'],
        [2, '', ''],
      ]),
    ];
    expect(placeSessions(courses)).toHaveLength(1);
  });
});

describe('visibleDays', () => {
  it('crece hasta el último día usado, con mínimo de lunes a viernes', () => {
    expect(visibleDays(placeSessions([course('a', [[0, '08:00', '09:00']])]), 'auto')).toHaveLength(5);
    expect(visibleDays(placeSessions([course('a', [[5, '08:00', '09:00']])]), 'auto')).toHaveLength(6);
    expect(visibleDays(placeSessions([course('a', [[6, '08:00', '09:00']])]), 'auto')).toHaveLength(7);
  });

  it('respeta la elección manual', () => {
    expect(visibleDays([], '7')).toHaveLength(7);
  });
});

describe('hourRange', () => {
  it('ajusta el rango a las clases', () => {
    const sessions = placeSessions([
      course('a', [
        [0, '08:00', '10:00'],
        [1, '15:00', '17:30'],
      ]),
    ]);
    expect(hourRange(sessions, 'auto', 'auto')).toEqual([8, 18]);
  });

  it('nunca muestra menos de cuatro horas', () => {
    const sessions = placeSessions([course('a', [[0, '08:00', '09:00']])]);
    const [from, to] = hourRange(sessions, 'auto', 'auto');
    expect(to - from).toBeGreaterThanOrEqual(4);
  });

  it('no deja que los límites manuales inviertan el rango', () => {
    const sessions = placeSessions([course('a', [[0, '08:00', '10:00']])]);
    const [from, to] = hourRange(sessions, '20', '6');
    expect(to).toBeGreaterThan(from);
  });
});

describe('findConflicts', () => {
  it('detecta traslapes el mismo día', () => {
    const sessions = placeSessions([
      course('a', [[0, '08:00', '10:00']]),
      course('b', [[0, '09:00', '11:00']]),
    ]);
    expect(findConflicts(sessions)).toHaveLength(1);
  });

  it('no marca clases contiguas ni de días distintos', () => {
    const sessions = placeSessions([
      course('a', [[0, '08:00', '10:00']]),
      course('b', [[0, '10:00', '12:00']]),
      course('c', [[1, '09:00', '11:00']]),
    ]);
    expect(findConflicts(sessions)).toHaveLength(0);
  });
});
