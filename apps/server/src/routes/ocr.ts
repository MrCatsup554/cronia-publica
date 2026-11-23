import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parseSchedule, type TextPage } from '@cronia/core';
import { config } from '../config.js';
import { ApiError } from '../errors.js';
import { recognizeImage } from '../services/ocr.js';

/** Formatos de imagen que Tesseract lee sin conversión previa. */
const ACCEPTED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/bmp']);

/** Página de texto posicionado, tal como la manda el navegador tras leer un PDF. */
const TextPageSchema = z.object({
  width: z.number().nonnegative(),
  height: z.number().nonnegative(),
  items: z
    .array(
      z.object({
        str: z.string(),
        x: z.number(),
        y: z.number(),
        w: z.number(),
        h: z.number(),
      }),
    )
    .max(50_000),
});

const ParseBodySchema = z.object({
  pages: z.array(TextPageSchema).min(1).max(20),
});

export const ocrRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Reconoce una o varias imágenes de horario y devuelve las materias.
   *
   * Acepta `multipart/form-data` con uno o más archivos. Varias imágenes se
   * tratan como páginas del mismo documento y se funden en un solo horario.
   */
  app.post('/api/ocr/schedule', async (request, reply) => {
    const pages: TextPage[] = [];
    const confidences: number[] = [];

    for await (const part of request.files({ limits: { fileSize: config.MAX_UPLOAD_BYTES } })) {
      if (pages.length >= config.MAX_FILES) {
        throw new ApiError(
          'demasiados_archivos',
          `Se admiten como máximo ${config.MAX_FILES} imágenes por envío.`,
          413,
        );
      }

      if (!ACCEPTED_MIME.has(part.mimetype)) {
        throw new ApiError(
          'formato_no_admitido',
          `El archivo «${part.filename}» no es una imagen admitida.`,
          415,
          'Usa PNG, JPG o WEBP.',
        );
      }

      let buffer: Buffer;
      try {
        buffer = await part.toBuffer();
      } catch {
        // `@fastify/multipart` corta el flujo al superar el límite.
        throw new ApiError(
          'archivo_muy_grande',
          `«${part.filename}» supera el tamaño máximo de ${Math.round(config.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
          413,
        );
      }

      const page = await recognizeImage(buffer);
      pages.push({ width: page.width, height: page.height, items: page.items });
      confidences.push(page.confidence);
    }

    if (!pages.length) {
      throw new ApiError('sin_archivos', 'No se recibió ninguna imagen.', 400);
    }

    const result = parseSchedule(pages);
    const sessionCount = result.courses.reduce((total, c) => total + c.sessions.length, 0);

    if (!result.courses.length || !sessionCount) {
      throw new ApiError(
        'sin_resultados',
        'No se reconocieron clases con días y horas en la imagen.',
        422,
        result.found
          ? 'Se encontró la tabla, pero no se leyeron los horarios. Prueba con una imagen más nítida.'
          : 'No se localizaron encabezados de día. Revisa que la imagen esté derecha y completa.',
      );
    }

    return reply.send({
      ...result,
      stats: {
        pages: pages.length,
        courses: result.courses.length,
        sessions: sessionCount,
        /** Confianza media del OCR, de 0 a 100. Por debajo de ~70 conviene revisar. */
        confidence: Math.round(
          confidences.reduce((sum, value) => sum + value, 0) / confidences.length,
        ),
      },
    });
  });

  /**
   * Interpreta texto ya posicionado, sin pasar por OCR.
   *
   * El navegador usa esta ruta cuando el PDF trae texto seleccionable: extrae
   * las coordenadas con pdf.js y delega aquí el análisis, de modo que la lógica
   * de interpretación viva en un solo sitio.
   */
  app.post('/api/parse/pages', async (request, reply) => {
    const parsed = ParseBodySchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(
        'peticion_invalida',
        'El cuerpo de la petición no tiene el formato esperado.',
        400,
        parsed.error.issues[0]?.message,
      );
    }

    const result = parseSchedule(parsed.data.pages);
    return reply.send(result);
  });
};
