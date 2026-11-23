import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import type { PositionedItem, TextPage } from '@cronia/core';
import { config } from '../config.js';
import { logger } from '../logger.js';

/**
 * Motor de OCR basado en Tesseract.
 *
 * Tesseract es software libre (Apache-2.0) y corre entero en este servidor: no
 * se envía nada a terceros. Los modelos de idioma se descargan una sola vez y
 * quedan en caché en disco.
 *
 * Crear un worker es caro —hay que cargar el modelo de idioma—, así que se
 * mantiene uno vivo y se serializan las peticiones sobre él. Tesseract no es
 * reentrante: dos `recognize` simultáneos sobre el mismo worker se corrompen
 * entre sí, de ahí la cola.
 */

/**
 * Cuántas veces más ancha que la media puede ser una palabra antes de
 * considerarla corrupta.
 *
 * Cuando una línea de la tabla queda pegada al texto, Tesseract la absorbe
 * dentro de la caja de la primera palabra de la fila, que pasa a medir el ancho
 * completo de la hoja. Esa caja envenenaría la detección de columnas, y es
 * preferible perder la palabra a colocarla en el día equivocado. El umbral se
 * calibra con la propia página, así que no depende de la resolución.
 */
const MAX_CHAR_WIDTH_RATIO = 4;

let workerPromise: Promise<Worker> | null = null;
/** Cola que serializa el acceso al worker. */
let queue: Promise<unknown> = Promise.resolve();

async function getWorker(): Promise<Worker> {
  workerPromise ??= (async () => {
    const cachePath = resolve(process.cwd(), config.OCR_CACHE_DIR);
    await mkdir(cachePath, { recursive: true });

    logger.info({ langs: config.OCR_LANGS, cachePath }, 'Iniciando el motor de OCR');
    const worker = await createWorker(config.OCR_LANGS.split('+'), 1, {
      cachePath,
      // Tesseract llama a `logger` sin comprobar que exista, así que siempre
      // debe ser una función. Su salida es muy ruidosa: sólo interesa depurando.
      logger: config.isProduction ? () => {} : (m) => logger.debug(m, 'tesseract'),
      errorHandler: (error) => logger.error({ error }, 'Error interno de Tesseract'),
    });
    logger.info('Motor de OCR listo');
    return worker;
  })().catch((error: unknown) => {
    // Un fallo al arrancar no debe dejar la promesa en caché para siempre.
    workerPromise = null;
    throw error;
  });

  return workerPromise;
}

/** Encola una tarea sobre el worker, garantizando que no haya dos a la vez. */
function enqueue<T>(task: (worker: Worker) => Promise<T>): Promise<T> {
  const run = queue.then(async () => task(await getWorker()));
  // La cola nunca se rompe: un fallo se propaga a quien llamó, no al siguiente.
  queue = run.catch(() => undefined);
  return run;
}

export interface OcrPageResult extends TextPage {
  /** Confianza media de la página, de 0 a 100. */
  confidence: number;
  /** Texto plano reconocido, útil para depurar. */
  text: string;
}

/**
 * Reconoce el texto de una imagen y devuelve las palabras con su posición,
 * en el mismo formato que produce pdf.js. Así el parser por coordenadas
 * funciona igual venga de donde venga el texto.
 */
export async function recognizeImage(image: Buffer): Promise<OcrPageResult> {
  return enqueue(async (worker) => {
    const started = Date.now();
    // `blocks: true` es lo que puebla `lines` y `words`; sin él sólo vuelve texto.
    const { data } = await worker.recognize(image, {}, { blocks: true, text: true });

    // Primero se recogen todas las palabras: tanto el descarte de cajas
    // corruptas como la altura de referencia necesitan ver la página entera.
    interface Candidate extends PositionedItem {
      charWidth: number;
    }
    const candidates: Candidate[] = [];

    for (const line of data.lines ?? []) {
      for (const word of line.words ?? []) {
        const text = word.text?.trim();
        if (!text) continue;

        // No se filtra por confianza a propósito. Tesseract puntúa bajo el
        // texto grueso o con mucho espaciado —los encabezados de día salen
        // sobre 30 aun cuando están perfectamente leídos—, así que un umbral
        // destruye justo las palabras que el parser necesita. El filtrado real
        // lo hace la estructura: sólo se aceptan nombres de día y rangos de hora.
        const { x0, y0, x1, y1 } = word.bbox;
        const w = Math.max(1, x1 - x0);
        candidates.push({
          str: text,
          x: x0,
          // Se ancla cada palabra a su centro vertical, no a la `y` de la línea
          // ni al borde superior de su tinta.
          //
          // La `y` de la línea no sirve porque Tesseract junta en una sola
          // «línea» filas distintas que están cerca —el nombre de la materia y
          // su clave—, y eso las fundiría en una celda ilegible. El borde
          // superior tampoco: en «08:00 - 10:00» el guion empieza mucho más
          // abajo que los dígitos, así que quedaría en otra fila y el rango
          // horario nunca se recompondría. El centro coincide en ambos.
          y: (y0 + y1) / 2,
          w,
          h: Math.max(1, y1 - y0),
          charWidth: w / text.length,
        });
      }
    }

    const typicalCharWidth = medianOf(candidates.map((item) => item.charWidth));
    const maxCharWidth = typicalCharWidth * MAX_CHAR_WIDTH_RATIO;

    // El parser usa `h` como unidad de tolerancia para decidir qué está en la
    // misma línea y qué separa dos materias. La altura de una palabra suelta es
    // demasiado ruidosa para eso —«a» y «08:00» miden muy distinto—, así que
    // todas comparten la altura típica de la página, que equivale al tamaño de
    // letra que aporta pdf.js en el otro origen de texto.
    const typicalHeight = medianOf(candidates.map((item) => item.h)) || 8;

    const items: PositionedItem[] = [];
    let width = 0;
    let height = 0;
    let discarded = 0;

    for (const candidate of candidates) {
      if (typicalCharWidth > 0 && candidate.charWidth > maxCharWidth) {
        discarded++;
        continue;
      }
      const { charWidth: _ignored, ...item } = candidate;
      items.push({ ...item, h: typicalHeight });
      width = Math.max(width, item.x + item.w);
      height = Math.max(height, item.y + item.h);
    }

    logger.info(
      {
        words: items.length,
        discarded,
        confidence: Math.round(data.confidence),
        ms: Date.now() - started,
      },
      'Página reconocida',
    );

    return { width, height, items, confidence: data.confidence, text: data.text ?? '' };
  });
}

/** Mediana de una lista de números; `0` si está vacía. */
function medianOf(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

/** Deja el motor listo antes de la primera petición, para que no espere nadie. */
export async function warmUp(): Promise<void> {
  await getWorker();
}

/** Apaga el worker de forma ordenada. */
export async function shutdownOcr(): Promise<void> {
  const pending = workerPromise;
  workerPromise = null;
  if (!pending) return;
  try {
    const worker = await pending;
    await worker.terminate();
    logger.info('Motor de OCR detenido');
  } catch (error) {
    logger.warn({ error }, 'No se pudo detener el motor de OCR limpiamente');
  }
}
