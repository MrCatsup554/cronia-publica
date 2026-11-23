import {
  drawSchedule,
  drawWallpaper,
  layoutSchedule,
  slugify,
  toRgb,
  WALLPAPER_FORMATS,
  wallpaperPixelSize,
  type RenderOptions,
  type WallpaperFormatKey,
} from '@cronia/core';
import { loadFonts } from './fonts.js';
import type { PaperSize } from '../store/types.js';

/**
 * Exportación a imagen y a PDF.
 *
 * Todo se genera en el navegador: el horario nunca sale del dispositivo.
 */

/** Calidad JPEG de las imágenes que se incrustan en el PDF. */
const PDF_JPEG_QUALITY = 0.95;
/** Margen del PDF en puntos, cuando la hoja es de tamaño fijo. */
const PDF_MARGIN = 18;
/** Factor de unidades de diseño a puntos para la hoja «Ajustado». */
const FIT_SCALE = 0.6;

/** Dibuja el horario en un lienzo nuevo, a la escala de exportación. */
async function renderToCanvas(
  options: RenderOptions,
  scale: number,
): Promise<HTMLCanvasElement> {
  // Sin esperar a las tipografías, la exportación puede salir con la fuente de
  // reserva y con los textos recortados en otros puntos.
  await loadFonts(options.theme.font);

  const canvas = document.createElement('canvas');
  drawSchedule(canvas, options, scale);
  return canvas;
}

export interface ExportedFile {
  filename: string;
  blob: Blob;
  /** URL de vista previa, para ofrecer la descarga a mano si falla. */
  previewUrl?: string;
}

/** Tamaño en píxeles que tendrá la exportación, para mostrarlo antes de generarla. */
export function exportPixelSize(options: RenderOptions, scale: number): { w: number; h: number } {
  const layout = layoutSchedule(options);
  return { w: Math.round(layout.width * scale), h: Math.round(layout.height * scale) };
}

export async function exportImage(
  options: RenderOptions,
  scale: number,
  format: 'png' | 'jpg',
): Promise<ExportedFile> {
  const canvas = await renderToCanvas(options, scale);
  const mime = format === 'jpg' ? 'image/jpeg' : 'image/png';

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.95));
  if (!blob) throw new Error('No se pudo generar la imagen.');

  return {
    filename: `${slugify(options.title)}.${format}`,
    blob,
    previewUrl: canvas.toDataURL(mime, 0.9),
  };
}

/**
 * Genera el fondo de pantalla como imagen.
 *
 * La escala no la elige la persona usuaria sino el propio formato: un fondo de
 * pantalla tiene que salir exactamente a la resolución de la pantalla, ni más
 * ni menos. Nunca lleva las guías de zona segura, que son sólo de la vista
 * previa.
 */
export async function exportWallpaper(
  options: RenderOptions,
  formatKey: WallpaperFormatKey,
  imageFormat: 'png' | 'jpg' = 'png',
): Promise<ExportedFile> {
  await loadFonts(options.theme.font);

  const format = WALLPAPER_FORMATS[formatKey];
  const canvas = document.createElement('canvas');
  drawWallpaper(canvas, options, format, format.scale);

  const mime = imageFormat === 'jpg' ? 'image/jpeg' : 'image/png';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, 0.95));
  if (!blob) throw new Error('No se pudo generar el fondo de pantalla.');

  return {
    filename: `${slugify(options.title)}-fondo.${imageFormat}`,
    blob,
    previewUrl: canvas.toDataURL(mime, 0.9),
  };
}

/** Tamaño en píxeles que tendrá el fondo de pantalla de un formato. */
export const wallpaperSize = (formatKey: WallpaperFormatKey): { w: number; h: number } =>
  wallpaperPixelSize(WALLPAPER_FORMATS[formatKey]);

export async function exportPdf(
  options: RenderOptions,
  scale: number,
  paper: PaperSize,
): Promise<ExportedFile> {
  // jsPDF sólo hace falta al exportar: se carga bajo demanda para no cargarlo
  // en el arranque de la aplicación.
  const { jsPDF } = await import('jspdf');

  const canvas = await renderToCanvas(options, scale);
  const layout = layoutSchedule(options);
  const image = canvas.toDataURL('image/jpeg', PDF_JPEG_QUALITY);

  let doc: InstanceType<typeof jsPDF>;

  if (paper === 'fit') {
    // Hoja a la medida exacta del horario, sin márgenes ni recortes.
    const width = layout.width * FIT_SCALE;
    const height = layout.height * FIT_SCALE;
    doc = new jsPDF({
      orientation: width > height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [width, height],
      compress: true,
    });
    doc.addImage(image, 'JPEG', 0, 0, width, height, undefined, 'FAST');
  } else {
    doc = new jsPDF({
      orientation: options.orientation,
      unit: 'pt',
      format: paper,
      compress: true,
    });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();

    // El fondo se pinta primero para que los márgenes no queden en blanco
    // cuando el tema es oscuro.
    const [r, g, b] = toRgb(options.theme.bg);
    doc.setFillColor(r, g, b);
    doc.rect(0, 0, pageWidth, pageHeight, 'F');

    const fit = Math.min(
      (pageWidth - 2 * PDF_MARGIN) / layout.width,
      (pageHeight - 2 * PDF_MARGIN) / layout.height,
    );
    const width = layout.width * fit;
    const height = layout.height * fit;
    doc.addImage(
      image,
      'JPEG',
      (pageWidth - width) / 2,
      (pageHeight - height) / 2,
      width,
      height,
      undefined,
      'FAST',
    );
  }

  doc.setProperties({ title: options.title || 'Horario', creator: 'Cronia' });
  return { filename: `${slugify(options.title)}.pdf`, blob: doc.output('blob') };
}

/**
 * Ofrece el archivo para descarga.
 *
 * Se usa un enlace con `download`, que es lo que entienden todos los
 * navegadores, y se libera la URL temporal en cuanto termina.
 */
export function downloadFile({ filename, blob }: ExportedFile): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revocar de inmediato cancelaría la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
