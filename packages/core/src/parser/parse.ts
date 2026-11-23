import type { DayIndex, ParseResult, ParsedCourse, ScheduleMeta, Session } from '../domain/types.js';
import { pad2 } from '../domain/time.js';
import { foldKey, ordinalMasculine } from '../domain/text.js';
import { findHeader, flattenText, median, toCells } from './grid.js';
import type { GridGeometry, PositionedCell, TextPage } from './types.js';

/** Rango horario dentro de una celda: `08:00 - 10:00`, `8.00 a 10.00`, `08:00hrs–10:00`. */
export const TIME_RANGE =
  /(\d{1,2})\s*[:.h]\s*(\d{2})\s*(?:hrs?\.?)?\s*(?:-|–|—|a|to)\s*(\d{1,2})\s*[:.h]\s*(\d{2})/i;

/** Clave de materia: `[001028-1582-23]` o `001028-1582-23`. */
const COURSE_CODE = /^\[.*\]$|^\(?[A-Z0-9]{2,}[-\s][0-9-]{3,}\)?$/;

/** Un bloque de materia en la columna izquierda, con el tramo vertical que ocupa. */
interface CourseBlock {
  top: number;
  bottom: number;
  name: string;
  code: string;
  teacher: string;
  place: string;
  sessions: Session[];
}

/**
 * Agrupa las líneas de la columna izquierda en bloques de materia.
 *
 * Se prueban dos estrategias. Si el documento trae claves de materia, cada
 * clave cierra el bloque que la precede, lo cual es exacto. Si no, se recurre a
 * la separación vertical: un salto mayor a ~2 líneas indica materia nueva.
 */
function groupIntoBlocks(left: PositionedCell[], lineHeight: number): CourseBlock[] {
  const blocks: CourseBlock[] = [];
  const make = (lines: PositionedCell[], code: string): CourseBlock => ({
    top: lines[0]!.y,
    bottom: 0,
    name: lines.map((line) => line.str).join(' '),
    code,
    teacher: '',
    place: '',
    sessions: [],
  });

  if (left.some((cell) => COURSE_CODE.test(cell.str))) {
    let current: PositionedCell[] = [];
    for (const cell of left) {
      if (COURSE_CODE.test(cell.str)) {
        if (current.length) blocks.push(make(current, cell.str.replace(/^\[\s*|\s*\]$/g, '')));
        current = [];
      } else {
        // Un hueco muy grande significa que la clave anterior faltaba: se descarta.
        if (current.length && cell.y - current[current.length - 1]!.y > lineHeight * 3.2) {
          current = [];
        }
        current.push(cell);
      }
    }
  }

  if (blocks.length) return blocks;

  let current: PositionedCell[] = [];
  const flush = (): void => {
    if (current.length) blocks.push(make(current, ''));
    current = [];
  };
  for (const cell of left) {
    if (current.length && cell.y - current[current.length - 1]!.y > lineHeight * 1.9) flush();
    current.push(cell);
  }
  flush();
  return blocks;
}

/** Extrae las materias de una sola página. */
function parsePage(
  page: TextPage,
  previousGrid: GridGeometry | null,
): { grid: GridGeometry | null; courses: ParsedCourse[] } {
  // Una tabla que sigue en la página 2 suele omitir los encabezados: se reusa
  // la geometría de la página anterior, que tiene las mismas columnas.
  const ownGrid = findHeader(page.items);
  const grid = ownGrid ?? previousGrid;
  if (!grid) return { grid: null, courses: [] };

  // Sólo se descarta la fila de encabezados si es de esta página.
  const headerBottom = ownGrid ? grid.y + grid.h * 0.5 : -Infinity;
  const cells = toCells(page.items, grid).filter((cell) => cell.y > headerBottom);

  const left = cells.filter((cell) => cell.region === 'L').sort((a, b) => a.y - b.y);
  const right = cells.filter((cell) => cell.region === 'R').sort((a, b) => a.y - b.y);
  const dayCells = cells.filter((cell) => cell.region.startsWith('D'));
  const timeCells = dayCells.filter((cell) => TIME_RANGE.test(cell.str));
  if (!timeCells.length) return { grid, courses: [] };

  const lineHeight = median(left.map((cell) => cell.h)) || 8;
  const blocks = groupIntoBlocks(left, lineHeight);
  if (!blocks.length) return { grid, courses: [] };

  // El pie de cada bloque es el techo del siguiente; el último usa el espaciado medio.
  const spacing =
    median(blocks.slice(1).map((block, i) => block.top - blocks[i]!.top)) || lineHeight * 7;
  blocks.forEach((block, i) => {
    block.bottom = i < blocks.length - 1 ? blocks[i + 1]!.top : block.top + spacing;
  });

  const blockAt = (y: number): CourseBlock | null => {
    let found: CourseBlock | null = null;
    for (const block of blocks) {
      if (block.top <= y + lineHeight * 0.6) found = block;
    }
    return found && y < found.bottom ? found : null;
  };

  for (const cell of timeCells) {
    const block = blockAt(cell.y);
    if (!block) continue;
    const match = TIME_RANGE.exec(cell.str);
    if (!match) continue;

    const startMin = Number(match[1]) * 60 + Number(match[2]);
    const endMin = Number(match[3]) * 60 + Number(match[4]);
    if (endMin <= startMin) continue;

    // El salón se escribe justo debajo de la hora, en la misma columna.
    const room = dayCells.find(
      (candidate) =>
        candidate.region === cell.region &&
        candidate !== cell &&
        candidate.y > cell.y + 0.5 &&
        candidate.y - cell.y < cell.h * 2.4 &&
        !TIME_RANGE.test(candidate.str),
    );

    block.sessions.push({
      day: Number(cell.region.slice(1)) as DayIndex,
      start: `${pad2(Number(match[1]))}:${match[2]}`,
      end: `${pad2(Number(match[3]))}:${match[4]}`,
      room: room?.str ?? '',
    });
  }

  // La columna derecha trae lugar y docente, en ese orden cuando hay dos líneas.
  for (const block of blocks) {
    const lines = right
      .filter((cell) => cell.y >= block.top - lineHeight * 0.6 && cell.y < block.bottom - lineHeight * 0.6)
      .map((cell) => cell.str);
    if (lines.length >= 2) {
      block.place = lines[0]!;
      block.teacher = lines.slice(1).join(' ');
    } else {
      block.place = '';
      block.teacher = lines[0] ?? '';
    }
  }

  return {
    grid,
    courses: blocks
      .filter((block) => block.sessions.length)
      .map(({ name, code, teacher, place, sessions }) => ({ name, code, teacher, place, sessions })),
  };
}

/** Busca el ciclo escolar y el periodo para armar el subtítulo. */
function extractMeta(pages: readonly TextPage[]): ScheduleMeta {
  const all = flattenText(pages);
  const parts: string[] = [];

  const period = /(\d{1,2})\s*[°º]\s*Per[ií]odo\s+([A-ZÁÉÍÓÚ]+)/i.exec(all);
  if (period) {
    const label = period[2]!.toLowerCase();
    parts.push(`${ordinalMasculine(Number(period[1]))} ${label.startsWith('semes') ? 'semestre' : label}`);
  }

  const cycle = /Ciclo\s+Escolar\s*:?\s*(\d{4}\s*-\s*\d{4})/i.exec(all);
  if (cycle) parts.push(`Ciclo ${cycle[1]!.replace(/\s/g, '')}`);

  return parts.length ? { subtitle: parts.join(' · ') } : {};
}

/**
 * Extrae un horario semanal de un documento de texto posicionado.
 *
 * Las materias que aparecen en varias páginas se funden en una sola, sumando
 * sus sesiones: la clave de materia, o su nombre normalizado, sirve de
 * identidad.
 */
export function parseSchedule(pages: readonly TextPage[]): ParseResult {
  let grid: GridGeometry | null = null;
  const merged = new Map<string, ParsedCourse>();

  for (const page of pages) {
    const result = parsePage(page, grid);
    if (result.grid) grid = result.grid;
    for (const course of result.courses) {
      const key = `${foldKey(course.name)}|${course.code}`;
      const existing = merged.get(key);
      if (existing) existing.sessions.push(...course.sessions);
      else merged.set(key, course);
    }
  }

  return { courses: [...merged.values()], meta: extractMeta(pages), found: Boolean(grid) };
}
