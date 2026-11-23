import * as pdfjs from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PositionedItem, TextPage } from '@cronia/core';

/**
 * Lectura de PDF en el navegador.
 *
 * El worker se empaqueta con la aplicación en lugar de cargarse de un CDN: así
 * la app funciona sin conexión, no depende de que un tercero siga sirviendo esa
 * versión, y no hay riesgo de que cambie bajo nuestros pies.
 */
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/** Tope de páginas que se leen; un horario nunca ocupa más. */
const MAX_TEXT_PAGES = 12;
/** Tope de páginas que se rasterizan para OCR, que es mucho más caro. */
const MAX_RASTER_PAGES = 4;
/** Lado mayor, en píxeles, al que se rasteriza una página para OCR. */
const RASTER_TARGET = 2200;

export interface PdfText {
  pages: TextPage[];
  pageCount: number;
  /** Número total de fragmentos de texto encontrados. */
  itemCount: number;
}

/**
 * Extrae el texto posicionado de un PDF.
 *
 * Un PDF escaneado devolverá muy pocos fragmentos: quien llama decide entonces
 * si conviene rasterizar y pasar por OCR.
 */
export async function extractPdfText(file: File | Blob): Promise<PdfText> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // Desactivar `eval` es una defensa razonable: un PDF no debería poder
    // ejecutar código, y no se pierde nada para lo que aquí se hace.
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: TextPage[] = [];
  let itemCount = 0;

  for (let index = 1; index <= Math.min(pdf.numPages, MAX_TEXT_PAGES); index++) {
    const page = await pdf.getPage(index);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();

    const items: PositionedItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;

      // `transform` es la matriz del texto: [a, b, c, d, e, f]. El tamaño de
      // letra sale de la magnitud del vector (a, b), y (e, f) es su origen en
      // coordenadas del PDF, que hay que pasar a las de la vista.
      const [a, b, , , e, f] = item.transform as number[];
      const fontSize = Math.hypot(a ?? 0, b ?? 0) || item.height || 8;
      const [x, baselineY] = viewport.convertToViewportPoint(e ?? 0, f ?? 0);

      items.push({
        str: item.str,
        x: x ?? 0,
        // `convertToViewportPoint` da la línea base; el borde superior queda
        // una altura de letra más arriba.
        y: (baselineY ?? 0) - fontSize,
        w: item.width * (viewport.scale || 1),
        h: fontSize,
      });
    }

    itemCount += items.length;
    pages.push({ width: viewport.width, height: viewport.height, items });
  }

  return { pages, pageCount: pdf.numPages, itemCount };
}

/**
 * Rasteriza las primeras páginas de un PDF a PNG, para mandarlas al OCR.
 * Se dibuja sobre blanco porque un PDF con fondo transparente saldría negro.
 */
export async function rasterizePdf(
  file: File | Blob,
  onProgress?: (done: number, total: number) => void,
): Promise<Blob[]> {
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const total = Math.min(pdf.numPages, MAX_RASTER_PAGES);
  const blobs: Blob[] = [];

  for (let index = 1; index <= total; index++) {
    const page = await pdf.getPage(index);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(3, RASTER_TARGET / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No se pudo preparar el lienzo para leer el PDF.');

    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: context, viewport }).promise;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob) blobs.push(blob);
    onProgress?.(index, total);
  }

  return blobs;
}
