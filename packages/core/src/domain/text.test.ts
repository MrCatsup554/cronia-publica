import { describe, expect, it } from 'vitest';
import {
  displayName,
  foldKey,
  ordinalMasculine,
  plural,
  slugify,
  stripAccents,
  toTitleCase,
} from './text.js';

describe('stripAccents', () => {
  it('quita tildes y diéresis', () => {
    expect(stripAccents('Miércoles')).toBe('Miercoles');
    expect(stripAccents('Sábado')).toBe('Sabado');
    expect(stripAccents('pingüino')).toBe('pinguino');
  });

  it('reduce la eñe a n, para que el OCR impreciso siga casando', () => {
    expect(stripAccents('DISEÑO')).toBe('DISENO');
  });
});

describe('foldKey', () => {
  it('ignora mayúsculas, tildes y espacios de más', () => {
    expect(foldKey('  Física   2 ')).toBe('FISICA 2');
    expect(foldKey('física 2')).toBe(foldKey('FÍSICA 2'));
  });
});

describe('plural', () => {
  it('concuerda el sustantivo con la cantidad', () => {
    expect(plural(0, 'materia', 'materias')).toBe('0 materias');
    expect(plural(1, 'materia', 'materias')).toBe('1 materia');
    expect(plural(2, 'materia', 'materias')).toBe('2 materias');
    expect(plural(1, 'sesión', 'sesiones')).toBe('1 sesión');
    expect(plural(1, 'día', 'días')).toBe('1 día');
  });
});

describe('ordinalMasculine', () => {
  it('usa el indicador ordinal U+00BA, no el signo de grado U+00B0', () => {
    expect(ordinalMasculine(7)).toBe('7.º');
    expect(ordinalMasculine(7)).not.toContain('°');
  });
});

describe('toTitleCase', () => {
  it('deja en minúscula las palabras vacías salvo al inicio', () => {
    expect(toTitleCase('DISEÑO Y ARQUITECTURA DE SOFTWARE')).toBe(
      'Diseño y Arquitectura de Software',
    );
    expect(toTitleCase('DE LA CRUZ')).toBe('De la Cruz');
  });

  it('respeta los números romanos', () => {
    expect(toTitleCase('CÁLCULO III')).toBe('Cálculo III');
    expect(toTitleCase('TALLER IV')).toBe('Taller IV');
  });
});

describe('displayName', () => {
  it('reescribe sólo lo que viene todo en mayúsculas', () => {
    expect(displayName('SEGURIDAD INFORMÁTICA', 'title')).toBe('Seguridad Informática');
    expect(displayName('Seguridad informática', 'title')).toBe('Seguridad informática');
  });

  it('no toca nada en modo original', () => {
    expect(displayName('SEGURIDAD INFORMÁTICA', 'original')).toBe('SEGURIDAD INFORMÁTICA');
  });
});

describe('slugify', () => {
  it('produce un nombre de archivo seguro', () => {
    expect(slugify('Mi horario')).toBe('mi-horario');
    expect(slugify('Horario 7.º semestre · 2026')).toBe('horario-7-semestre-2026');
  });

  it('cae al valor por defecto cuando no queda nada', () => {
    expect(slugify('¿¡!?')).toBe('horario');
  });
});
