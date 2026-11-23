import type {
  BlockStyle,
  Course,
  DaysSetting,
  HourBound,
  HourFormat,
  NameCase,
  Orientation,
  PaletteKey,
  ShowOptions,
  ThemeKey,
  WallpaperFormatKey,
} from '@cronia/core';

export type TabKey = 'load' | 'courses' | 'design' | 'export';
export type PaperSize = 'letter' | 'a4' | 'fit';
/**
 * Qué se está componiendo: una hoja para imprimir o compartir, o un fondo de
 * pantalla de teléfono. Cambia el render entero, no sólo el tamaño.
 */
export type ExportMode = 'sheet' | 'wallpaper';
/** Escala de exportación, como cadena porque viene de botones. */
export type ExportScale = '1.5' | '2.5' | '4';

/** Estado completo de la aplicación, tal y como se guarda en el navegador. */
export interface ScheduleState {
  title: string;
  subtitle: string;
  courses: Course[];

  // Apariencia
  theme: ThemeKey;
  palette: PaletteKey | null;
  block: BlockStyle | null;
  radius: number | null;
  font: string;
  bg: string | null;
  head: string | null;
  density: number;

  // Contenido
  show: ShowOptions;
  nameCase: NameCase;
  hourFormat: HourFormat;
  days: DaysSetting;
  from: HourBound;
  to: HourBound;

  // Exportación
  exportMode: ExportMode;
  orientation: Orientation;
  paper: PaperSize;
  scale: ExportScale;
  wallpaperFormat: WallpaperFormatKey;

  // Interfaz
  tab: TabKey;
}
