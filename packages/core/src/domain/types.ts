/**
 * Tipos de dominio de Cronia.
 *
 * Un {@link Course} (materia) agrupa varias {@link Session} (sesiones). Una sesión es
 * un bloque continuo de clase en un día concreto de la semana.
 */

/** Índice de día de la semana: 0 = lunes … 6 = domingo (ISO-8601, no el domingo-primero de JS). */
export type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Hora local en formato 24 h `HH:MM`. */
export type TimeString = string;

export interface Session {
  /** Día de la semana en el que ocurre la sesión. */
  day: DayIndex;
  /** Hora de inicio, `HH:MM`. */
  start: TimeString;
  /** Hora de fin, `HH:MM`. Siempre posterior a {@link Session.start}. */
  end: TimeString;
  /** Aula o código de salón, si el documento lo indica. */
  room: string;
}

export interface Course {
  /** Identificador estable en cliente; no proviene del documento original. */
  id: string;
  name: string;
  /** Clave o código de la materia, por ejemplo `001028-1582-23`. */
  code: string;
  teacher: string;
  /** Edificio o facultad, cuando aparece por separado del salón. */
  place: string;
  /** Color fijado por la persona usuaria; `null` = tomar el color de la paleta. */
  color: string | null;
  sessions: Session[];
}

/** Metadatos detectados en el documento (ciclo escolar, periodo…). */
export interface ScheduleMeta {
  subtitle?: string;
}

/** Una materia tal como sale del parser, todavía sin `id` ni `color`. */
export type ParsedCourse = Omit<Course, 'id' | 'color'>;

export interface ParseResult {
  courses: ParsedCourse[];
  meta: ScheduleMeta;
  /** `true` si se localizó una cuadrícula con encabezados de día. */
  found: boolean;
}

/** Una sesión resuelta y ubicada en el tiempo, lista para dibujarse. */
export interface PlacedSession {
  course: Course;
  courseIndex: number;
  session: Session;
  sessionIndex: number;
  /** Minutos desde la medianoche en que inicia. */
  startMin: number;
  /** Minutos desde la medianoche en que termina. */
  endMin: number;
  /** Carril horizontal asignado cuando hay empalmes; lo llena el render. */
  lane?: number;
}
