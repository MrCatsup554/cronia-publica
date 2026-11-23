import { foldKey } from '../domain/text.js';

/**
 * Reconocimiento de nombres de día.
 *
 * Se aceptan español e inglés porque muchos sistemas escolares exportan la
 * plantilla en inglés aunque el contenido esté en español. Las claves ya vienen
 * sin tildes: {@link foldKey} las quita antes de buscar.
 */
const FULL_NAMES: Record<string, number> = {
  LUNES: 0,
  MARTES: 1,
  MIERCOLES: 2,
  JUEVES: 3,
  VIERNES: 4,
  SABADO: 5,
  DOMINGO: 6,
  MONDAY: 0,
  TUESDAY: 1,
  WEDNESDAY: 2,
  THURSDAY: 3,
  FRIDAY: 4,
  SATURDAY: 5,
  SUNDAY: 6,
};

const ABBREVIATIONS: Record<string, number> = {
  LUN: 0,
  MAR: 1,
  MIE: 2,
  MIER: 2,
  JUE: 3,
  VIE: 4,
  SAB: 5,
  DOM: 6,
  MON: 0,
  TUE: 1,
  WED: 2,
  THU: 3,
  FRI: 4,
  SAT: 5,
  SUN: 6,
};

/**
 * Devuelve el índice de día de un texto, o `-1` si no es un nombre de día.
 *
 * Las abreviaturas se consultan en una segunda pasada porque son ambiguas:
 * «MAR» es martes en español pero marzo en un encabezado de fecha, y «SAB»
 * aparece en códigos de aula. Sólo se recurre a ellas si la búsqueda por
 * nombre completo no encontró una cuadrícula.
 */
export function dayIndexOf(text: string, allowAbbreviations: boolean): number {
  const key = foldKey(text).replace(/[.:]/g, '');
  const full = FULL_NAMES[key];
  if (full !== undefined) return full;
  if (allowAbbreviations) {
    const abbr = ABBREVIATIONS[key];
    if (abbr !== undefined) return abbr;
  }
  return -1;
}
