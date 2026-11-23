import { dayIndexOf } from './days.js';
import type {
  DayColumn,
  GridGeometry,
  PositionedCell,
  PositionedItem,
  Region,
  TextPage,
} from './types.js';

/** Fragmentos que forman parte de un rango horario y deben unirse pese al hueco: `08:00 – 10:00`. */
const TIME_FRAGMENT = /^\d{1,2}[:.]\d{2}$|^[-–—]$|^(a|to)$/i;

/**
 * Localiza la fila de encabezados de día y deduce las fronteras de cada columna.
 *
 * Se agrupan los nombres de día por línea base y se elige la fila con más días
 * distintos; una tabla real tiene al menos tres. Las fronteras se ponen a medio
 * camino entre centros consecutivos, y en los extremos se extrapola con el paso
 * medio entre columnas.
 *
 * @returns La geometría detectada, o `null` si la página no tiene una tabla.
 */
export function findHeader(items: readonly PositionedItem[]): GridGeometry | null {
  for (const allowAbbreviations of [false, true]) {
    const hits = items
      .map((item) => ({ item, day: dayIndexOf(item.str, allowAbbreviations) }))
      .filter((hit) => hit.day >= 0);

    const rows: Array<{ y: number; h: number; days: Map<number, number> }> = [];
    for (const { item, day } of hits) {
      const tolerance = Math.max(3, item.h * 0.6);
      let row = rows.find((candidate) => Math.abs(candidate.y - item.y) < tolerance);
      if (!row) {
        row = { y: item.y, h: item.h, days: new Map() };
        rows.push(row);
      }
      if (!row.days.has(day)) row.days.set(day, item.x + item.w / 2);
    }

    const best = rows
      .filter((row) => row.days.size >= 3)
      .sort((a, b) => b.days.size - a.days.size)[0];
    if (!best) continue;

    const centers = [...best.days.entries()]
      .map(([day, centerX]) => ({ day, centerX }))
      .sort((a, b) => a.centerX - b.centerX);

    const first = centers[0]!;
    const last = centers[centers.length - 1]!;
    const step = centers.length > 1 ? (last.centerX - first.centerX) / (centers.length - 1) : 0;

    const columns: DayColumn[] = centers.map((column, i) => ({
      day: column.day,
      centerX: column.centerX,
      left: i === 0 ? column.centerX - step / 2 : (centers[i - 1]!.centerX + column.centerX) / 2,
      right:
        i === centers.length - 1
          ? column.centerX + step / 2
          : (column.centerX + centers[i + 1]!.centerX) / 2,
    }));

    return {
      y: best.y,
      h: best.h,
      columns,
      left: columns[0]!.left,
      right: columns[columns.length - 1]!.right,
    };
  }
  return null;
}

/**
 * Decide en qué región de la cuadrícula cae un fragmento: columna lateral
 * izquierda, lateral derecha, o la columna del día más cercano.
 */
export function regionOf(item: PositionedItem, grid: GridGeometry): Region {
  const centerX = item.x + item.w / 2;
  if (item.x + item.w <= grid.left + 2 || (item.x < grid.left - 4 && centerX < grid.left)) {
    return 'L';
  }
  if (item.x >= grid.right - 2) return 'R';

  let best = grid.columns[0]!;
  let bestDistance = Infinity;
  for (const column of grid.columns) {
    const distance = Math.abs(column.centerX - centerX);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = column;
    }
  }
  return `D${best.day}`;
}

/**
 * Une los fragmentos sueltos en celdas legibles.
 *
 * Tanto pdf.js como Tesseract entregan el texto troceado en palabras o incluso
 * en grupos de letras. Se agrupan por línea base y luego se fusionan los
 * fragmentos contiguos de la misma región, tratando el hueco entre ellos como
 * separador de palabra o de celda según su tamaño relativo a la altura de letra.
 */
export function toCells(items: readonly PositionedItem[], grid: GridGeometry): PositionedCell[] {
  const sorted = items
    .filter((item) => item.str.trim())
    .map((item) => ({ ...item, region: regionOf(item, grid) }))
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const lines: Array<{ y: number; items: PositionedCell[] }> = [];
  for (const item of sorted) {
    const tolerance = Math.max(2, item.h * 0.45);
    let line = lines.find((candidate) => Math.abs(candidate.y - item.y) < tolerance);
    if (!line) {
      line = { y: item.y, items: [] };
      lines.push(line);
    }
    line.items.push(item);
  }

  const cells: PositionedCell[] = [];
  for (const line of lines) {
    line.items.sort((a, b) => a.x - b.x);
    let current: PositionedCell | null = null;
    for (const item of line.items) {
      const gap = current ? item.x - (current.x + current.w) : Infinity;
      const sameRegion = current?.region === item.region;
      const isTimeRun =
        current?.region.startsWith('D') && TIME_FRAGMENT.test(item.str.trim()) && gap < item.h * 2.5;
      const joinable = sameRegion && (gap < Math.max(3.5, item.h * 0.9) || isTimeRun);

      if (joinable && current) {
        current.str += (gap > 0.6 ? ' ' : '') + item.str;
        current.w = item.x + item.w - current.x;
        current.h = Math.max(current.h, item.h);
      } else {
        current = { str: item.str, x: item.x, y: line.y, w: item.w, h: item.h, region: item.region };
        cells.push(current);
      }
    }
  }

  return cells.map((cell) => ({ ...cell, str: cell.str.replace(/\s+/g, ' ').trim() }));
}

/** Mediana de una lista de números; `0` si está vacía. */
export function median(values: readonly number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

/** Aplana todo el texto de las páginas en una sola cadena, para buscar metadatos. */
export const flattenText = (pages: readonly TextPage[]): string =>
  pages.map((page) => page.items.map((item) => item.str).join(' ')).join(' ');
