import { describe, expect, it } from 'vitest';
import type { PositionedItem, TextPage } from './types.js';
import { parseSchedule } from './parse.js';
import { findHeader } from './grid.js';
import { dayIndexOf } from './days.js';

const item = (str: string, x: number, y: number, w = str.length * 5, h = 8): PositionedItem => ({
  str,
  x,
  y,
  w,
  h,
});

/**
 * Arma una página que imita un horario escolar real: encabezados de día
 * arriba, nombres y claves de materia a la izquierda, docente a la derecha y
 * los rangos de hora en la columna del día que corresponde.
 */
function buildPage(): TextPage {
  const items: PositionedItem[] = [];
  const dayX = [200, 320, 440, 560, 680];

  ['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'].forEach((name, i) => {
    items.push(item(name, dayX[i]!, 10, 60));
  });

  // Materia 1, ocupa y ≈ 40–80
  items.push(item('ADMINISTRACIÓN DE REDES', 20, 40, 150));
  items.push(item('[001028-1582-23]', 20, 52, 90));
  items.push(item('08:00 - 10:00', dayX[0]!, 40, 60));
  items.push(item('FIB2AUL006', dayX[0]!, 50, 60));
  items.push(item('12:00 - 14:00', dayX[2]!, 40, 60));
  items.push(item('FIB2AUL006', dayX[2]!, 50, 60));
  items.push(item('FACULTAD DE INGENIERIA', 800, 40, 120));
  items.push(item('MENDEZ GONGORA CHRISTIAN', 800, 52, 120));

  // Materia 2, ocupa y ≈ 90–130
  items.push(item('FÍSICA 2', 20, 90, 60));
  items.push(item('[001029-2062-32]', 20, 102, 90));
  items.push(item('16:00 - 18:00', dayX[1]!, 90, 60));
  items.push(item('FIB2AUL008', dayX[1]!, 100, 60));
  items.push(item('FACULTAD DE INGENIERIA', 800, 90, 120));
  items.push(item('CHAN BLANCO KAREN SARAI', 800, 102, 120));

  items.push(item('Ciclo Escolar: 2026 - 2027', 20, 200, 140));
  items.push(item('7° Periodo SEMESTRAL', 20, 212, 120));

  return { width: 900, height: 300, items };
}

describe('dayIndexOf', () => {
  it('reconoce los días con y sin tilde', () => {
    expect(dayIndexOf('MIÉRCOLES', false)).toBe(2);
    expect(dayIndexOf('miercoles', false)).toBe(2);
    expect(dayIndexOf('Sábado', false)).toBe(5);
  });

  it('acepta inglés, porque muchas plantillas vienen así', () => {
    expect(dayIndexOf('Monday', false)).toBe(0);
  });

  it('sólo usa abreviaturas cuando se le permite', () => {
    expect(dayIndexOf('MIE', false)).toBe(-1);
    expect(dayIndexOf('MIE', true)).toBe(2);
  });

  it('devuelve -1 para lo que no es un día', () => {
    expect(dayIndexOf('FIB2AUL006', true)).toBe(-1);
  });
});

describe('findHeader', () => {
  it('localiza la fila de días y deduce las columnas', () => {
    const grid = findHeader(buildPage().items);
    expect(grid).not.toBeNull();
    expect(grid!.columns).toHaveLength(5);
    expect(grid!.columns.map((c) => c.day)).toEqual([0, 1, 2, 3, 4]);
  });

  it('devuelve null cuando no hay tabla', () => {
    expect(findHeader([item('Hola', 0, 0), item('mundo', 50, 0)])).toBeNull();
  });
});

describe('parseSchedule', () => {
  it('extrae materias, sesiones y días de la columna correcta', () => {
    const result = parseSchedule([buildPage()]);

    expect(result.found).toBe(true);
    expect(result.courses).toHaveLength(2);

    const redes = result.courses.find((c) => c.name.includes('REDES'));
    expect(redes).toBeDefined();
    expect(redes!.code).toBe('001028-1582-23');
    expect(redes!.sessions).toHaveLength(2);
    expect(redes!.sessions.map((s) => s.day).sort()).toEqual([0, 2]);
    expect(redes!.sessions[0]!.start).toBe('08:00');
    expect(redes!.sessions[0]!.end).toBe('10:00');
    expect(redes!.sessions[0]!.room).toBe('FIB2AUL006');

    const fisica = result.courses.find((c) => c.name.includes('FÍSICA'));
    expect(fisica!.sessions).toHaveLength(1);
    expect(fisica!.sessions[0]!.day).toBe(1);
  });

  it('arma el subtítulo con el ordinal correcto', () => {
    const result = parseSchedule([buildPage()]);
    expect(result.meta.subtitle).toBe('7.º semestre · Ciclo 2026-2027');
  });

  it('funde las materias repetidas entre páginas', () => {
    const page = buildPage();
    const result = parseSchedule([page, page]);
    const redes = result.courses.find((c) => c.name.includes('REDES'));
    expect(result.courses).toHaveLength(2);
    expect(redes!.sessions).toHaveLength(4);
  });

  it('no revienta con una página sin tabla', () => {
    const result = parseSchedule([{ width: 100, height: 100, items: [item('nada', 0, 0)] }]);
    expect(result.found).toBe(false);
    expect(result.courses).toEqual([]);
  });
});
