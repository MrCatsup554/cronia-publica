import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import type { Course } from '@cronia/core';
import { createScheduleWorkbook, exportExcel } from './excel.js';

const course: Course = {
  id: 'math',
  name: 'Matemáticas',
  teacher: 'Ana',
  code: '00123',
  place: 'Edificio A',
  color: null,
  sessions: [{ day: 0, start: '08:15', end: '10:00', room: '12' }],
};

describe('Excel export', () => {
  it('creates a real XLSX with editable cells, numeric times, formulas and preserved codes', async () => {
    const file = await exportExcel([course], 'Mi horario', 'Semestre 1');
    expect(file.filename).toBe('mi-horario.xlsx');
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await file.blob.arrayBuffer());
    expect(restored.worksheets.map((sheet) => sheet.name)).toEqual(['Horario semanal', 'Clases']);
    const classes = restored.getWorksheet('Clases')!;
    expect(classes.getCell('B6').value).toBe('Matemáticas');
    expect((classes.getCell('C6').value as Date).toISOString()).toBe('1899-12-30T08:15:00.000Z');
    expect((classes.getCell('D6').value as Date).toISOString()).toBe('1899-12-30T10:00:00.000Z');
    expect(classes.getCell('E6').value).toEqual({ formula: '(D6-C6)*24', result: 1.75 });
    expect(classes.getCell('I6').value).toBe('00123');
    expect(restored.getWorksheet('Horario semanal')!.getCell('B6').text).toContain('08:15–10:00');
  });
  it('includes weekend and overlapping classes without replacing either one', () => {
    const other: Course = {
      ...course,
      id: 'other',
      name: 'Física',
      sessions: [
        { day: 0, start: '09:00', end: '11:00', room: '5' },
        { day: 6, start: '23:00', end: '24:00', room: '8' },
      ],
    };
    const workbook = createScheduleWorkbook([course, other], 'Horario', '');
    const weekly = workbook.getWorksheet('Horario semanal')!;
    expect(weekly.getCell('H5').value).toBe('Domingo');
    expect(weekly.getCell('B7').text).toContain('Matemáticas');
    expect(weekly.getCell('B7').text).toContain('Física');
    const classes = workbook.getWorksheet('Clases')!;
    expect(classes.getCell('D8').value).toBe(1);
    expect(classes.getCell('A8').value).toBe('Domingo');
  });
  it('keeps unscheduled courses and treats formula-like names as plain text', async () => {
    const unsafeName = '=HYPERLINK("https://example.com")';
    const workbook = createScheduleWorkbook(
      [{ ...course, name: unsafeName, sessions: [] }],
      'Horario',
      '',
    );
    const restored = new ExcelJS.Workbook();
    await restored.xlsx.load(await workbook.xlsx.writeBuffer());
    expect(restored.getWorksheet('Clases')!.getCell('B6').value).toBe(unsafeName);
    expect(restored.getWorksheet('Clases')!.getCell('A6').value).toBe('Sin asignar');
  });
  it('rejects empty schedules and invalid times instead of silently omitting classes', () => {
    expect(() => createScheduleWorkbook([], '', '')).toThrow('Agrega');
    expect(() =>
      createScheduleWorkbook(
        [{ ...course, sessions: [{ day: 0, start: '10:00', end: '09:00', room: '' }] }],
        '',
        '',
      ),
    ).toThrow('Revisa');
  });
});
