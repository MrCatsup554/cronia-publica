/**
 * Utilidades de texto en español.
 *
 * El código original mezclaba criterios: plurales sin concordancia
 * («1 materias»), el signo de grado `°` usado como ordinal y rangos de acentos
 * escritos con caracteres combinantes literales dentro de una expresión
 * regular. Todo eso se centraliza y se corrige aquí.
 */

/** Rango Unicode de marcas diacríticas combinantes (bloque «Combining Diacritical Marks»). */
const COMBINING_MARKS = /[̀-ͯ]/gu;

/**
 * Quita tildes y diéresis.
 *
 * `normalize('NFD')` separa cada letra de su tilde; luego se eliminan las
 * marcas combinantes. La «ñ» también se reduce a «n», lo cual es intencional:
 * esta función alimenta comparaciones, y un OCR que lea «DISENO» debe seguir
 * casando con «DISEÑO».
 */
export const stripAccents = (value: string): string =>
  value.normalize('NFD').replace(COMBINING_MARKS, '');

/** Clave de comparación insensible a mayúsculas, tildes y espacios sobrantes. */
export const foldKey = (value: string): string =>
  stripAccents(value).toUpperCase().replace(/\s+/g, ' ').trim();

/**
 * Concuerda un sustantivo con su cantidad.
 *
 * @example plural(1, 'materia', 'materias') // '1 materia'
 * @example plural(3, 'materia', 'materias') // '3 materias'
 */
export const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count === 1 ? singular : pluralForm}`;

/**
 * Ordinal masculino abreviado, como pide la ortografía académica: `7.º`.
 *
 * El signo de grado `°` (U+00B0) que usaba el código original es un símbolo de
 * temperatura o de ángulo; el ordinal correcto es `º` (U+00BA).
 */
export const ordinalMasculine = (n: number): string => `${n}.º`;

/** Palabras que no se capitalizan dentro de un título, salvo al inicio. */
const LOWERCASE_WORDS = new Set([
  'a',
  'al',
  'con',
  'de',
  'del',
  'e',
  'el',
  'en',
  'la',
  'las',
  'los',
  'o',
  'para',
  'por',
  'u',
  'y',
]);

const ROMAN_NUMERAL = /^(i{1,3}|iv|v|vi{1,3}|ix|x{1,3})$/i;

/**
 * Pasa un texto a «Tipo Título» respetando el español: preposiciones y
 * artículos en minúscula, números romanos en mayúscula.
 */
export function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(/(\s+)/)
    .map((word, index) => {
      if (/^\s+$/.test(word)) return word;
      if (ROMAN_NUMERAL.test(word)) return word.toUpperCase();
      if (index > 0 && LOWERCASE_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join('');
}

export type NameCase = 'title' | 'original';

/**
 * Aplica el criterio de capitalización elegido.
 *
 * Sólo se reescribe el texto que viene ENTERAMENTE en mayúsculas, que es como
 * suelen exportarlo los sistemas escolares. Un nombre ya capitalizado a mano se
 * respeta tal cual.
 */
export function displayName(value: string, nameCase: NameCase): string {
  if (nameCase !== 'title') return value;
  return value === value.toUpperCase() ? toTitleCase(value) : value;
}

/** Convierte un título en un nombre de archivo seguro: «Mi Horario» → `mi-horario`. */
export function slugify(value: string, fallback = 'horario'): string {
  const slug = stripAccents(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || fallback;
}
