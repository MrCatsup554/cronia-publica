import type { Course, PlacedSession } from '../domain/types.js';
import { DAYS, DAYS_SHORT, formatHour, formatTimeRange } from '../domain/time.js';
import { displayName, plural } from '../domain/text.js';
import { courseMinutes, formatHours, totalMinutes } from '../domain/schedule.js';
import { isDark, mix } from '../theme/color.js';
import { inkOn } from '../theme/color.js';
import { colorOf, type ResolvedTheme } from '../theme/resolve.js';
import { ellipsize, fontSpec, roundedRect, wrapText } from './text.js';
import {
  assignLanes,
  layoutSchedule,
  type GridLayout,
  type HitRegion,
  type RenderOptions,
  type ScheduleLayout,
} from './layout.js';
import { layoutWallpaper, type WallpaperFormat, type WallpaperLayout } from './wallpaper.js';

type Ctx = CanvasRenderingContext2D;

/** Una línea de texto dentro de un bloque de clase. */
interface BlockLine {
  text: string;
  font: string;
  color: string;
  lineHeight: number;
  /** Número máximo de líneas si el texto debe ajustarse. */
  wrap?: number;
}

export interface DrawResult {
  layout: ScheduleLayout;
  hits: HitRegion[];
}

/**
 * Dibuja el horario completo en un lienzo.
 *
 * El lienzo se redimensiona al tamaño de diseño multiplicado por `scale`, y
 * todo el trazado ocurre en unidades de diseño: subir la escala da más
 * resolución sin tocar el layout. Devuelve las zonas sensibles al clic para que
 * la interfaz pueda abrir la materia correspondiente.
 */
export function drawSchedule(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: RenderOptions,
  scale: number,
): DrawResult {
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del lienzo.');

  const layout = layoutSchedule(options);
  const theme = options.theme;

  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = 'alphabetic';

  const hits: HitRegion[] = [];

  drawBackground(ctx, layout, theme);
  drawHeader(ctx, layout, options);
  drawGrid(ctx, layout, options, hits);
  drawLegend(ctx, layout, options, hits);
  drawFooter(ctx, layout, options);

  return { layout, hits };
}

function drawBackground(ctx: Ctx, layout: ScheduleLayout, theme: ResolvedTheme): void {
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

function drawHeader(ctx: Ctx, layout: ScheduleLayout, options: RenderOptions): void {
  const { theme } = options;
  const { padding: p, width } = layout;
  // Se reservan 200 px a la derecha para el total de horas.
  const titleWidth = width - p * 2 - 200;

  ctx.fillStyle = theme.text;
  ctx.font = fontSpec(theme.font, 800, layout.landscape ? 34 : 30);
  ctx.fillText(ellipsize(ctx, options.title || 'Horario', titleWidth), p, p + 30);

  if (options.subtitle) {
    ctx.fillStyle = theme.muted;
    ctx.font = fontSpec(theme.font, 500, 16);
    ctx.fillText(ellipsize(ctx, options.subtitle, titleWidth), p, p + 58);
  }

  const total = totalMinutes(layout.sessions);
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.text;
  ctx.font = fontSpec(theme.font, 700, 26, true);
  ctx.fillText(formatHours(total).replace(' h', ''), width - p, p + 28);
  ctx.fillStyle = theme.muted;
  ctx.font = fontSpec(theme.font, 500, 12, true);
  ctx.fillText('HORAS POR SEMANA', width - p, p + 46);
  ctx.textAlign = 'left';
}

/**
 * Dibuja la cuadrícula completa: superficie, fila de días, líneas de hora,
 * etiquetas laterales y bloques de clase.
 *
 * Sólo depende de {@link GridLayout}, así que sirve igual para una hoja y para
 * un fondo de pantalla: lo único que cambia es dónde cae el rectángulo.
 */
function drawGrid(ctx: Ctx, layout: GridLayout, options: RenderOptions, hits: HitRegion[]): void {
  const { theme, show } = options;
  const { days, firstHour, lastHour, rowHeight, gridTop, dayRowHeight } = layout;

  const left = layout.gridLeft;
  const boxWidth = layout.gridWidth;
  const right = left + boxWidth;

  // Dentro del rectángulo, la columna de horas va a la izquierda y los días
  // ocupan el resto.
  const bodyLeft = left + layout.gutter;
  const bodyWidth = boxWidth - layout.gutter;
  const columnWidth = bodyWidth / days.length;
  const bodyTop = gridTop + dayRowHeight;
  const bodyHeight = (lastHour - firstHour) * rowHeight;
  const radius = Math.min(theme.radius, 14);

  // Un tema sin contraste entre hoja y cuadrícula necesita un borde para leerse.
  const surfaceMatchesBg = theme.surface.toLowerCase() === theme.bg.toLowerCase();
  const headMatchesSurface = theme.head.toLowerCase() === theme.surface.toLowerCase();

  ctx.save();
  roundedRect(ctx, left, gridTop, boxWidth, layout.gridHeight, radius);
  ctx.fillStyle = theme.surface;
  ctx.fill();
  if (surfaceMatchesBg) {
    ctx.strokeStyle = theme.gridStrong;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.clip();

  // Fila de días
  ctx.fillStyle = theme.head;
  ctx.fillRect(left, gridTop, boxWidth, dayRowHeight);
  if (headMatchesSurface) {
    ctx.fillStyle = theme.gridStrong;
    ctx.fillRect(left, gridTop + dayRowHeight - 1.5, boxWidth, 1.5);
  }
  ctx.fillStyle = theme.headText;
  ctx.textAlign = 'center';
  const dayLabelSize = 13;
  // La línea base se calcula a partir del alto de la fila en vez de fijarla:
  // el fondo de pantalla usa filas más bajas que la hoja.
  const dayLabelBaseline = gridTop + dayRowHeight / 2 + dayLabelSize * 0.36;
  days.forEach((day, index) => {
    const centerX = bodyLeft + columnWidth * index + columnWidth / 2;
    ctx.font = fontSpec(theme.font, 700, dayLabelSize);
    ctx.letterSpacing = '1.5px';
    const label = (columnWidth < 120 ? DAYS_SHORT[day] : DAYS[day]).toUpperCase();
    ctx.fillText(label, centerX, dayLabelBaseline);
    ctx.letterSpacing = '0px';
  });
  ctx.textAlign = 'left';

  // Líneas horizontales de hora, y punteado opcional de media hora
  for (let hour = firstHour; hour <= lastHour; hour++) {
    const y = bodyTop + (hour - firstHour) * rowHeight;
    if (hour > firstHour && hour < lastHour) {
      ctx.fillStyle = theme.grid;
      ctx.fillRect(left, Math.round(y) - 0.5, boxWidth, 1);
    }
    if (show.halfHours && hour < lastHour) {
      ctx.fillStyle = theme.grid;
      for (let x = bodyLeft; x < right; x += 8) {
        ctx.fillRect(x, Math.round(y + rowHeight / 2) - 0.5, 4, 1);
      }
    }
  }

  // Separadores verticales entre días
  ctx.fillStyle = theme.grid;
  for (let i = 1; i < days.length; i++) {
    ctx.fillRect(Math.round(bodyLeft + columnWidth * i) - 0.5, bodyTop, 1, bodyHeight);
  }
  ctx.fillStyle = theme.gridStrong;
  ctx.fillRect(
    bodyLeft - 0.5,
    gridTop + (headMatchesSurface ? dayRowHeight : 0),
    1,
    layout.gridHeight,
  );

  // Etiquetas de hora en la columna lateral
  ctx.font = fontSpec(theme.font, 500, 11.5, true);
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'right';
  // Igual que con los días: el desplazamiento se acomoda a filas más bajas.
  const hourLabelOffset = Math.min(16, rowHeight * 0.75);
  for (let hour = firstHour; hour < lastHour; hour++) {
    ctx.fillText(
      formatHour(hour, options.hourFormat),
      bodyLeft - 10,
      bodyTop + (hour - firstHour) * rowHeight + hourLabelOffset,
    );
  }
  ctx.textAlign = 'left';

  // Bloques de clase
  days.forEach((day, dayIndex) => {
    const daySessions = layout.sessions.filter((s) => s.session.day === day);
    for (const { session, lane, laneCount } of assignLanes(daySessions)) {
      const laneWidth = columnWidth / laneCount;
      const x = bodyLeft + columnWidth * dayIndex + lane * laneWidth + 4;
      const w = laneWidth - 8;
      const top =
        bodyTop +
        ((Math.max(session.startMin, firstHour * 60) - firstHour * 60) / 60) * rowHeight +
        2.5;
      const bottom =
        bodyTop +
        ((Math.min(session.endMin, lastHour * 60) - firstHour * 60) / 60) * rowHeight -
        2.5;
      if (bottom <= top) continue;

      drawBlock(ctx, options, session, x, top, w, bottom - top, laneCount > 1);
      hits.push({ x, y: top, w, h: bottom - top, courseId: session.course.id });
    }
  });

  ctx.restore();
}

/** Dibuja un bloque de clase con su texto, recortado a su propia caja. */
function drawBlock(
  ctx: Ctx,
  options: RenderOptions,
  placed: PlacedSession,
  x: number,
  y: number,
  w: number,
  h: number,
  crowded: boolean,
): void {
  const { theme, show } = options;
  const color = colorOf(placed.course, placed.courseIndex, theme);
  const radius = Math.min(theme.radius, h / 2, 12);

  let foreground: string;
  let subtle: string;
  let timeColor: string;
  let blockX = x;
  let blockW = w;

  ctx.save();

  if (theme.block === 'solid') {
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = color;
    ctx.fill();
    foreground = inkOn(color);
    subtle = foreground === '#ffffff' ? 'rgba(255,255,255,0.82)' : 'rgba(22,26,23,0.72)';
    timeColor = subtle;
  } else if (theme.block === 'soft') {
    const dark = isDark(theme.surface);
    roundedRect(ctx, x, y, w, h, radius);
    ctx.fillStyle = mix(color, theme.surface, dark ? 0.3 : 0.17);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 4, h);
    ctx.restore();
    foreground = dark ? theme.text : mix(color, '#101010', 0.45);
    subtle = theme.muted;
    timeColor = dark ? mix(color, '#ffffff', 0.7) : mix(color, '#101010', 0.7);
    // El texto se corre para no montarse sobre la franja de color.
    blockX += 3;
    blockW -= 3;
  } else {
    roundedRect(ctx, x + 1, y + 1, w - 2, h - 2, radius);
    ctx.fillStyle = mix(color, theme.surface, 0.08);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = color;
    ctx.stroke();
    foreground = theme.text;
    subtle = theme.muted;
    timeColor = isDark(theme.surface) ? color : mix(color, '#101010', 0.75);
  }

  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();

  const insetX = crowded || w < 120 ? 7 : 10;
  const innerWidth = blockW - insetX * 2;
  const bottom = y + h - 5;
  let cursorY = y + 7;

  const { session } = placed;
  // En modo compacto las columnas son mucho más estrechas, así que el nombre
  // baja un escalón más de tamaño para que quepa algo más de texto por línea.
  const nameSize = options.compact && w < 75 ? 11 : w < 110 ? 12 : 13.5;

  const lines: BlockLine[] = [];
  if (show.time) {
    lines.push({
      text: formatTimeRange(session.start, session.end, options.hourFormat, options.compact),
      font: fontSpec(theme.font, 600, 10.5, true),
      color: timeColor,
      lineHeight: 14,
    });
  }
  if (show.room && session.room) {
    lines.push({
      text: session.room,
      font: fontSpec(theme.font, 600, 11.5),
      color: foreground,
      lineHeight: 15,
    });
  }
  if (show.teacher && placed.course.teacher) {
    lines.push({
      text: displayName(placed.course.teacher, options.nameCase),
      font: fontSpec(theme.font, 400, 11),
      color: subtle,
      lineHeight: 14,
      wrap: 2,
    });
  }
  if (show.code && placed.course.code) {
    lines.push({
      text: placed.course.code,
      font: fontSpec(theme.font, 400, 10, true),
      color: subtle,
      lineHeight: 13,
    });
  }

  // El nombre va primero, pero necesita saber cuánto espacio dejan los demás.
  const nameLineHeight = nameSize + 3;
  const available = bottom - cursorY;

  // Cuánto espacio se guarda para lo que va después del nombre.
  //
  // En modo compacto sólo se reserva la hora: el nombre manda, y el salón o el
  // docente aparecen nada más si sobra sitio. Reservarles hueco por adelantado
  // —como hace la hoja, donde las columnas son anchas y siempre cabe todo—
  // dejaría el nombre en una sola línea recortada justo donde menos espacio hay.
  const reserved = options.compact
    ? (show.time ? 14 : 0)
    : (show.time ? 14 : 0) + (show.room && session.room ? 15 : 0);

  const maxNameLines = Math.max(1, Math.min(3, Math.floor((available - reserved) / nameLineHeight)));

  ctx.font = fontSpec(theme.font, 700, nameSize);
  const nameLines = wrapText(
    ctx,
    displayName(placed.course.name || 'Sin nombre', options.nameCase),
    innerWidth,
    maxNameLines,
  );

  const timeLine = show.time ? lines.shift() : undefined;
  if (timeLine) {
    ctx.font = timeLine.font;
    ctx.fillStyle = timeLine.color;
    if (cursorY + timeLine.lineHeight <= bottom + 3) {
      ctx.fillText(
        ellipsize(ctx, timeLine.text, innerWidth),
        blockX + insetX,
        cursorY + timeLine.lineHeight - 3.5,
      );
      cursorY += timeLine.lineHeight;
    }
  }

  ctx.font = fontSpec(theme.font, 700, nameSize);
  ctx.fillStyle = foreground;
  for (const line of nameLines) {
    if (cursorY + nameLineHeight > bottom + 3) break;
    ctx.fillText(line, blockX + insetX, cursorY + nameLineHeight - 4);
    cursorY += nameLineHeight;
  }
  cursorY += 2;

  for (const line of lines) {
    ctx.font = line.font;
    const parts = line.wrap
      ? wrapText(ctx, line.text, innerWidth, line.wrap)
      : [ellipsize(ctx, line.text, innerWidth)];
    for (const part of parts) {
      if (cursorY + line.lineHeight > bottom + 2) break;
      ctx.fillStyle = line.color;
      ctx.fillText(part, blockX + insetX, cursorY + line.lineHeight - 3.5);
      cursorY += line.lineHeight;
    }
  }

  ctx.restore();
}

function drawLegend(
  ctx: Ctx,
  layout: ScheduleLayout,
  options: RenderOptions,
  hits: HitRegion[],
): void {
  if (!layout.legendHeight) return;

  const { theme, show } = options;
  const { padding: p, width } = layout;
  let y = layout.gridTop + layout.gridHeight + 26;

  ctx.fillStyle = theme.muted;
  ctx.font = fontSpec(theme.font, 700, 11.5);
  ctx.letterSpacing = '1.4px';
  ctx.fillText(`MATERIAS · ${layout.legendCourses.length}`, p, y + 12);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = theme.gridStrong;
  ctx.fillRect(p, y + 22, width - 2 * p, 1);
  y += 34;

  const columnWidth = (width - 2 * p) / layout.legendColumns;

  layout.legendCourses.forEach((course: Course, index) => {
    const courseIndex = options.courses.indexOf(course);
    const color = colorOf(course, courseIndex, theme);
    const x = p + (index % layout.legendColumns) * columnWidth;
    const itemY = y + Math.floor(index / layout.legendColumns) * layout.legendItemHeight;

    roundedRect(ctx, x, itemY + 6, 14, 14, Math.min(4, theme.radius));
    ctx.fillStyle = color;
    ctx.fill();

    const textWidth = columnWidth - 90;
    ctx.fillStyle = theme.text;
    ctx.font = fontSpec(theme.font, 700, 13.5);
    ctx.fillText(
      ellipsize(ctx, displayName(course.name || 'Sin nombre', options.nameCase), textWidth),
      x + 24,
      itemY + 18,
    );

    const meta = [
      show.teacher && course.teacher ? displayName(course.teacher, options.nameCase) : '',
      show.code && course.code ? course.code : '',
      show.place && course.place ? displayName(course.place, options.nameCase) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    if (meta) {
      ctx.fillStyle = theme.muted;
      ctx.font = fontSpec(theme.font, 400, 12);
      ctx.fillText(ellipsize(ctx, meta, textWidth), x + 24, itemY + 36);
    }

    ctx.textAlign = 'right';
    ctx.fillStyle = theme.muted;
    ctx.font = fontSpec(theme.font, 500, 12, true);
    ctx.fillText(formatHours(courseMinutes(course)), x + columnWidth - 20, itemY + 18);
    ctx.textAlign = 'left';

    hits.push({ x, y: itemY, w: columnWidth, h: layout.legendItemHeight, courseId: course.id });
  });
}

function drawFooter(ctx: Ctx, layout: ScheduleLayout, options: RenderOptions): void {
  const { theme } = options;
  const y = layout.height - 20;

  ctx.fillStyle = theme.muted;
  ctx.font = fontSpec(theme.font, 500, 11.5, true);

  const summary = [
    plural(layout.legendCourses.length, 'materia', 'materias'),
    plural(layout.sessions.length, 'sesión', 'sesiones'),
    plural(layout.days.length, 'día', 'días'),
    `${formatHour(layout.firstHour, options.hourFormat)}–${formatHour(layout.lastHour, options.hourFormat)}`,
  ].join(' · ');

  ctx.fillText(summary, layout.padding, y);
  ctx.textAlign = 'right';
  ctx.fillText('Hecho con Cronia', layout.width - layout.padding, y);
  ctx.textAlign = 'left';
}

/** Resultado de dibujar un fondo de pantalla. */
export interface WallpaperDrawResult {
  layout: WallpaperLayout;
  hits: HitRegion[];
}

/**
 * Dibuja el horario como fondo de pantalla de teléfono.
 *
 * A diferencia de la hoja, aquí no hay título, lista de materias ni pie: la
 * franja utilizable es estrecha y todo eso robaría sitio a lo único que
 * interesa ver de un vistazo desde la pantalla de bloqueo. La cuadrícula queda
 * centrada entre las zonas que ocupa el sistema.
 *
 * @param guides Dibuja las marcas de las zonas reservadas. Es para la vista
 *   previa dentro de la aplicación; el archivo exportado nunca las lleva.
 */
export function drawWallpaper(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  options: RenderOptions,
  format: WallpaperFormat,
  scale: number,
  guides = false,
): WallpaperDrawResult {
  const ctx = canvas.getContext('2d') as Ctx | null;
  if (!ctx) throw new Error('No se pudo obtener el contexto 2D del lienzo.');

  // El rango horario compacto es lo que hace legibles bloques tan estrechos.
  const wallpaperOptions: RenderOptions = { ...options, compact: options.compact ?? true };
  const layout = layoutWallpaper(wallpaperOptions, format);

  canvas.width = Math.round(layout.width * scale);
  canvas.height = Math.round(layout.height * scale);
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.textBaseline = 'alphabetic';

  ctx.fillStyle = options.theme.bg;
  ctx.fillRect(0, 0, layout.width, layout.height);

  const hits: HitRegion[] = [];
  drawGrid(ctx, layout, wallpaperOptions, hits);

  if (guides) drawSafeAreaGuides(ctx, layout, options.theme);

  return { layout, hits };
}

/** Marca en la vista previa dónde caen el reloj y los botones del sistema. */
function drawSafeAreaGuides(ctx: Ctx, layout: WallpaperLayout, theme: ResolvedTheme): void {
  const bandBottom = layout.height - layout.safeBottom;

  ctx.save();
  // Las zonas del sistema se velan para que se entienda que no son utilizables.
  ctx.fillStyle = isDark(theme.bg) ? 'rgba(255,255,255,0.06)' : 'rgba(20,32,26,0.06)';
  ctx.fillRect(0, 0, layout.width, layout.safeTop);
  ctx.fillRect(0, bandBottom, layout.width, layout.safeBottom);

  ctx.strokeStyle = isDark(theme.bg) ? 'rgba(255,255,255,0.35)' : 'rgba(20,32,26,0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  for (const y of [layout.safeTop, bandBottom]) {
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y) - 0.5);
    ctx.lineTo(layout.width, Math.round(y) - 0.5);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.fillStyle = theme.muted;
  ctx.font = fontSpec(theme.font, 600, 10);
  ctx.textAlign = 'center';
  ctx.fillText('reloj y widgets', layout.width / 2, layout.safeTop - 10);
  ctx.fillText('linterna y cámara', layout.width / 2, bandBottom + 20);
  ctx.textAlign = 'left';
  ctx.restore();
}
