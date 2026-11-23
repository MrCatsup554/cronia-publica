import ExcelJS from 'exceljs';
import { DAYS, placeSessions, slugify, toMinutes, toTimeString, type Course } from '@cronia/core';
import type { ExportedFile } from './export.js';

const GREEN = 'FF244F42';
const PALE = 'FFE4F0EA';

/** Un libro editable, independiente de los filtros de la vista previa. */
export function createScheduleWorkbook(
  courses: readonly Course[],
  title: string,
  subtitle: string,
): ExcelJS.Workbook {
  if (!courses.length) throw new Error('Agrega al menos una materia para exportar a Excel.');
  for (const course of courses) {
    if (!course.name.trim()) throw new Error('Pon nombre a todas las materias antes de exportar.');
    for (const session of course.sessions) {
      const from = toMinutes(session.start),
        to = toMinutes(session.end);
      if (
        !Number.isInteger(session.day) ||
        session.day < 0 ||
        session.day > 6 ||
        !Number.isFinite(from) ||
        !Number.isFinite(to) ||
        from >= to ||
        from >= 1440 ||
        to > 1440
      ) {
        throw new Error(`Revisa el día y las horas de «${course.name}» antes de exportar.`);
      }
    }
  }
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Cronia';
  workbook.title = title || 'Mi horario';
  const weekly = workbook.addWorksheet('Horario semanal');
  const classes = workbook.addWorksheet('Clases');
  const sessions = placeSessions(courses).sort(
    (a, b) =>
      a.session.day - b.session.day ||
      a.startMin - b.startMin ||
      a.course.name.localeCompare(b.course.name),
  );
  const dayCount = Math.max(5, ...sessions.map(({ session }) => session.day + 1));

  function heading(sheet: ExcelJS.Worksheet, columns: number, note: string) {
    sheet.mergeCells(1, 1, 1, columns);
    sheet.getCell(1, 1).value = title || 'Mi horario';
    sheet.getCell(1, 1).font = { name: 'Calibri', size: 20, bold: true, color: { argb: GREEN } };
    sheet.getRow(1).height = 32;
    sheet.mergeCells(2, 1, 2, columns);
    sheet.getCell(2, 1).value = subtitle;
    sheet.getRow(2).height = 25;
    sheet.mergeCells(3, 1, 3, columns);
    sheet.getCell(3, 1).value = note;
    sheet.getCell(3, 1).alignment = { wrapText: true, vertical: 'middle' };
    sheet.getRow(3).height = 32;
    sheet.views = [{ state: 'frozen', ySplit: 5, xSplit: 1, showGridLines: false }];
    sheet.pageSetup = {
      orientation: 'landscape',
      paperSize: 9,
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:5',
    };
  }
  heading(
    weekly,
    dayCount + 1,
    'Vista semanal de todas las clases. Es una copia: editar aquí no modifica Cronia ni la hoja Clases.',
  );
  heading(
    classes,
    9,
    'Una fila por sesión. Las materias sin sesiones también se incluyen. Duración calculada en horas.',
  );
  weekly.getColumn(1).width = 19;
  for (let day = 0; day < dayCount; day++) weekly.getColumn(day + 2).width = 29;
  weekly.getRow(5).values = ['Hora', ...DAYS.slice(0, dayCount)];

  const boundaries = new Set<number>();
  for (const session of sessions) {
    boundaries.add(session.startMin);
    boundaries.add(session.endMin);
  }
  if (sessions.length) {
    const first = Math.min(...sessions.map((session) => session.startMin));
    const last = Math.max(...sessions.map((session) => session.endMin));
    for (let time = Math.ceil(first / 60) * 60; time < last; time += 60) boundaries.add(time);
  }
  const times = [...boundaries].sort((a, b) => a - b);
  for (let i = 0; i < times.length - 1; i++) {
    const row = weekly.getRow(i + 6);
    row.height = 45;
    row.getCell(1).value = `${toTimeString(times[i]!)}–${toTimeString(times[i + 1]!)}`;
    row.getCell(1).alignment = { vertical: 'middle', horizontal: 'center' };
  }
  for (let day = 0; day < dayCount; day++) {
    let previous = '',
      blockStart = 6;
    const finishBlock = (end: number) => {
      if (previous && end > blockStart) weekly.mergeCells(blockStart, day + 2, end, day + 2);
    };
    for (let i = 0; i < times.length - 1; i++) {
      const active = sessions.filter(
        (session) =>
          session.session.day === day &&
          session.startMin < times[i + 1]! &&
          session.endMin > times[i]!,
      );
      const signature = active
        .map((session) => `${session.courseIndex}:${session.sessionIndex}`)
        .join('|');
      const row = i + 6;
      if (signature !== previous) {
        finishBlock(row - 1);
        blockStart = row;
        previous = signature;
      }
      if (!active.length) continue;
      const cell = weekly.getCell(row, day + 2);
      cell.value = active
        .map(({ course, session }) =>
          [
            course.name,
            `${session.start}–${session.end}`,
            [course.place, session.room].filter(Boolean).join(' · '),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n\n');
      cell.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' };
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: active.length > 1 ? 'FFFFEDD5' : PALE },
      };
      cell.font = { name: 'Calibri', size: 11, color: { argb: 'FF172B23' } };
      // Deja espacio para empalmes y nombres largos sin perder información.
      const lines =
        active.reduce(
          (sum, { course, session }) =>
            sum +
            Math.ceil(course.name.length / 27) +
            1 +
            Math.ceil([course.place, session.room].join(' ').length / 27),
          0,
        ) +
        active.length -
        1;
      weekly.getRow(row).height = Math.max(
        weekly.getRow(row).height ?? 45,
        Math.min(409, lines * 15),
      );
    }
    finishBlock(times.length + 4);
  }
  if (!sessions.length) weekly.getCell('A6').value = 'Sin sesiones asignadas';

  const rows: ExcelJS.CellValue[][] = sessions.map(
    ({ course, session, startMin, endMin }, index) => [
      DAYS[session.day],
      course.name,
      startMin / 1440,
      endMin / 1440,
      { formula: `(D${index + 6}-C${index + 6})*24`, result: (endMin - startMin) / 60 },
      course.teacher,
      session.room,
      course.place,
      course.code,
    ],
  );
  for (const course of courses.filter((course) => !course.sessions.length))
    rows.push([
      'Sin asignar',
      course.name,
      null,
      null,
      null,
      course.teacher,
      '',
      course.place,
      course.code,
    ]);
  classes.addTable({
    name: 'ClasesCronia',
    ref: 'A5',
    headerRow: true,
    style: { theme: 'TableStyleMedium4', showRowStripes: true },
    columns: [
      'Día',
      'Materia',
      'Inicio',
      'Fin',
      'Duración (h)',
      'Docente',
      'Salón',
      'Lugar',
      'Clave',
    ].map((name) => ({ name, filterButton: true })),
    rows,
  });
  [17, 42, 12, 12, 16, 32, 20, 25, 23].forEach((width, i) => {
    classes.getColumn(i + 1).width = width;
  });
  classes.getColumn(3).numFmt = '[h]:mm';
  classes.getColumn(4).numFmt = '[h]:mm';
  classes.getColumn(5).numFmt = '0.##';
  for (let row = 6; row <= classes.rowCount; row++) {
    classes.getRow(row).height = 42;
    classes.getRow(row).alignment = { vertical: 'middle', wrapText: true };
  }
  for (const sheet of [weekly, classes]) {
    sheet.getRow(5).height = 28;
    sheet.getRow(5).eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
  }
  return workbook;
}

export async function exportExcel(
  courses: readonly Course[],
  title: string,
  subtitle: string,
): Promise<ExportedFile> {
  const workbook = createScheduleWorkbook(courses, title, subtitle);
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    filename: `${slugify(title) || 'horario'}.xlsx`,
    blob: new Blob([new Uint8Array(buffer)], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  };
}
