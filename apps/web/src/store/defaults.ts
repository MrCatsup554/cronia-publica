import type { Course, DayIndex, ParsedCourse } from '@cronia/core';
import type { ScheduleState } from './types.js';

/** Identificador aleatorio y corto para materias y sesiones. */
export const newId = (): string =>
  globalThis.crypto?.randomUUID?.().slice(0, 8) ?? Math.random().toString(36).slice(2, 10);

export const DEFAULT_STATE: Omit<ScheduleState, 'courses'> = {
  title: 'Mi horario',
  subtitle: 'Ejemplo · 7.º semestre · Ciclo 2026-2027',

  theme: 'planner',
  palette: null,
  block: null,
  radius: null,
  font: '',
  bg: null,
  head: null,
  density: 1,

  show: {
    time: true,
    room: true,
    teacher: true,
    code: false,
    place: false,
    legend: true,
    halfHours: false,
  },
  nameCase: 'title',
  hourFormat: '24',
  days: 'auto',
  from: 'auto',
  to: 'auto',

  exportMode: 'sheet',
  orientation: 'landscape',
  paper: 'letter',
  scale: '2.5',
  wallpaperFormat: 'iphone',

  tab: 'load',
};

/** Horario de ejemplo, para que la app nunca arranque vacía. */
const SAMPLE: Array<{
  name: string;
  code: string;
  teacher: string;
  place: string;
  sessions: Array<[DayIndex, string, string, string]>;
}> = [
  {
    name: 'ADMINISTRACIÓN DE REDES',
    code: '001028-1582-23',
    teacher: 'MÉNDEZ GÓNGORA CHRISTIAN JOAQUÍN',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [0, '08:00', '10:00', 'FIB2AUL006'],
      [2, '12:00', '14:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'CALIDAD Y PRUEBAS DE SOFTWARE',
    code: '001028-1163-24',
    teacher: 'NOH PUCH SERGIO ANDRÉS',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [1, '11:00', '13:00', 'FIB2AUL006'],
      [3, '08:00', '10:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'DISEÑO Y ARQUITECTURA DE SOFTWARE',
    code: '001028-1162-26',
    teacher: 'PACHECO ZAPATA ADRIÁN ENRIQUE',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [1, '07:00', '09:00', 'FIB2AUL006'],
      [4, '13:00', '15:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'FÍSICA 2',
    code: '001029-2062-32',
    teacher: 'CHAN BLANCO KAREN SARAÍ',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [2, '16:00', '18:00', 'FIB2AUL008'],
      [4, '15:00', '17:00', 'FIB2AUL008'],
    ],
  },
  {
    name: 'PROYECTO DE DESARROLLO DE VIDEOJUEGOS',
    code: '001028-1167-27',
    teacher: 'RAMÍREZ ORTEGÓN JUSTINO',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [1, '13:00', '14:00', 'FIB2AUL006'],
      [2, '08:00', '10:00', 'FIB2AUL006'],
      [3, '13:00', '14:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'SEGURIDAD INFORMÁTICA',
    code: '001028-1505-25',
    teacher: 'NOH PUCH SERGIO ANDRÉS',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [0, '13:00', '15:00', 'FIB2AUL006'],
      [1, '09:00', '11:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'SISTEMAS INTELIGENTES',
    code: '001028-1166-28',
    teacher: 'RAMÍREZ ORTEGÓN JUSTINO',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [0, '10:00', '12:00', 'FIB2AUL006'],
      [4, '11:00', '13:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'TALLER DE REDES',
    code: '001028-1171-29',
    teacher: 'MÉNDEZ GÓNGORA CHRISTIAN JOAQUÍN',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [3, '11:00', '13:00', 'FIB2AUL006'],
      [4, '09:00', '11:00', 'FIB2AUL006'],
    ],
  },
  {
    name: 'TÓPICOS AVANZADOS DE APLICACIONES MÓVILES',
    code: '001028-1165-22',
    teacher: 'AGUILAR CANEPA JOSÉ CARLOS',
    place: 'FACULTAD DE INGENIERÍA',
    sessions: [
      [0, '12:00', '13:00', 'FIB2AUL006'],
      [2, '10:00', '12:00', 'FIB2AUL006'],
      [3, '10:00', '11:00', 'FIB2AUL006'],
    ],
  },
];

export const sampleCourses = (): Course[] =>
  SAMPLE.map((entry) => ({
    id: newId(),
    name: entry.name,
    code: entry.code,
    teacher: entry.teacher,
    place: entry.place,
    color: null,
    sessions: entry.sessions.map(([day, start, end, room]) => ({ day, start, end, room })),
  }));

/** Convierte lo que devuelve el parser en materias con identidad y color. */
export const toCourses = (parsed: readonly ParsedCourse[]): Course[] =>
  parsed.map((course) => ({ ...course, id: newId(), color: null }));

/** Una materia nueva, vacía, con una sesión de partida. */
export const blankCourse = (): Course => ({
  id: newId(),
  name: 'Nueva materia',
  code: '',
  teacher: '',
  place: '',
  color: null,
  sessions: [{ day: 0, start: '08:00', end: '10:00', room: '' }],
});
