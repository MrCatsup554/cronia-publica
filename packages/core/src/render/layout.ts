import type { Course, DayIndex, PlacedSession } from '../domain/types.js';
import type { HourFormat } from '../domain/time.js';
import type { NameCase } from '../domain/text.js';
import { hourRange, placeSessions, visibleDays, type DaysSetting, type HourBound } from '../domain/schedule.js';
import type { ResolvedTheme } from '../theme/resolve.js';

export type Orientation = 'landscape' | 'portrait';

/** Qué datos se muestran en los bloques y en la lista de materias. */
export interface ShowOptions {
  time: boolean;
  room: boolean;
  teacher: boolean;
  code: boolean;
  place: boolean;
  legend: boolean;
  halfHours: boolean;
}

/** Todo lo que el render necesita saber. No depende del estado de la interfaz. */
export interface RenderOptions {
  title: string;
  subtitle: string;
  courses: readonly Course[];
  theme: ResolvedTheme;
  orientation: Orientation;
  /** Multiplicador del alto de cada hora; 1 = normal. */
  density: number;
  hourFormat: HourFormat;
  nameCase: NameCase;
  days: DaysSetting;
  from: HourBound;
  to: HourBound;
  show: ShowOptions;
  /**
   * Adapta los bloques a columnas muy estrechas, como las de un teléfono.
   *
   * Abrevia los rangos horarios («7–9» en vez de «07:00–09:00»), reduce algo la
   * letra del nombre y le da prioridad sobre el salón y el resto de datos
   * cuando no cabe todo.
   */
  compact?: boolean;
}

/**
 * Geometría de la cuadrícula, independiente de dónde se coloque.
 *
 * Es lo único que necesita el dibujo de la rejilla y de los bloques, así que
 * una hoja y un fondo de pantalla pueden compartir todo el código de render
 * limitándose a situar el rectángulo en otro sitio.
 */
export interface GridLayout {
  sessions: PlacedSession[];
  days: DayIndex[];
  firstHour: number;
  lastHour: number;
  rowHeight: number;
  dayRowHeight: number;
  /** Ancho de la columna lateral de horas, dentro del rectángulo. */
  gutter: number;
  /** Borde izquierdo del rectángulo de la cuadrícula. */
  gridLeft: number;
  /** Borde superior del rectángulo de la cuadrícula. */
  gridTop: number;
  /** Ancho total del rectángulo, incluida la columna de horas. */
  gridWidth: number;
  /** Alto total del rectángulo, incluida la fila de días. */
  gridHeight: number;
}

/** Medidas calculadas de la hoja, en unidades de diseño (sin escalar). */
export interface ScheduleLayout extends GridLayout {
  width: number;
  height: number;
  padding: number;
  headerHeight: number;
  legendHeight: number;
  legendColumns: number;
  legendItemHeight: number;
  legendCourses: Course[];
  footerHeight: number;
  landscape: boolean;
}

/** Anchos de hoja en unidades de diseño. */
const SHEET_WIDTH = { landscape: 1280, portrait: 900 } as const;

/**
 * Calcula las medidas de la hoja.
 *
 * Es una función pura y barata: se llama tanto para dibujar como para saber de
 * antemano el tamaño en píxeles de la exportación.
 */
export function layoutSchedule(options: RenderOptions): ScheduleLayout {
  const landscape = options.orientation === 'landscape';
  const width = SHEET_WIDTH[options.orientation];
  const padding = landscape ? 44 : 36;

  const sessions = placeSessions(options.courses);
  const days = visibleDays(sessions, options.days);
  const [firstHour, lastHour] = hourRange(sessions, options.from, options.to);

  const rowHeight = Math.round((landscape ? 50 : 60) * options.density);
  const headerHeight = options.subtitle ? 92 : 70;
  const dayRowHeight = 42;
  const gutter = landscape ? 66 : 58;
  const gridTop = padding + headerHeight;
  const gridHeight = dayRowHeight + (lastHour - firstHour) * rowHeight;
  // La cuadrícula ocupa el ancho de la hoja menos los márgenes laterales.
  const gridLeft = padding;
  const gridWidth = width - padding * 2;

  const legendColumns = landscape ? 3 : 2;
  const legendItemHeight = 54;
  const legendCourses = options.courses.filter((course) => course.name || course.sessions.length);
  const legendHeight =
    options.show.legend && legendCourses.length
      ? 34 + Math.ceil(legendCourses.length / legendColumns) * legendItemHeight
      : 0;

  const footerHeight = 44;
  const height = gridTop + gridHeight + (legendHeight ? 26 + legendHeight : 0) + footerHeight;

  return {
    width,
    height,
    padding,
    sessions,
    days,
    firstHour,
    lastHour,
    rowHeight,
    headerHeight,
    dayRowHeight,
    gutter,
    gridLeft,
    gridTop,
    gridWidth,
    gridHeight,
    legendHeight,
    legendColumns,
    legendItemHeight,
    legendCourses,
    footerHeight,
    landscape,
  };
}

/** Zona sensible al clic dentro del lienzo, en unidades de diseño. */
export interface HitRegion {
  x: number;
  y: number;
  w: number;
  h: number;
  courseId: string;
}

/**
 * Reparte en carriles las sesiones de un día que se traslapan, para que
 * ninguna quede tapada.
 *
 * Las sesiones se agrupan en racimos de solapamiento encadenado; dentro de cada
 * racimo se busca el primer carril libre. Devuelve el número de carriles que
 * necesita cada sesión para calcular su ancho.
 */
export function assignLanes(sessions: readonly PlacedSession[]): Array<{
  session: PlacedSession;
  lane: number;
  laneCount: number;
}> {
  const sorted = [...sessions].sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const result: Array<{ session: PlacedSession; lane: number; laneCount: number }> = [];

  let cluster: { members: typeof result; lanes: number[]; end: number } | null = null;

  for (const session of sorted) {
    if (!cluster || session.startMin >= cluster.end) {
      cluster = { members: [], lanes: [], end: session.endMin };
    }
    let lane = cluster.lanes.findIndex((laneEnd) => laneEnd <= session.startMin);
    if (lane < 0) {
      lane = cluster.lanes.length;
      cluster.lanes.push(session.endMin);
    } else {
      cluster.lanes[lane] = session.endMin;
    }
    cluster.end = Math.max(cluster.end, session.endMin);

    const entry = { session, lane, laneCount: 0 };
    cluster.members.push(entry);
    result.push(entry);

    // Todo el racimo comparte el ancho de carril del momento de mayor solape.
    for (const member of cluster.members) member.laneCount = cluster.lanes.length;
  }

  return result;
}
