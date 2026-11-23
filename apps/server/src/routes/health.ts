import type { FastifyPluginAsync } from 'fastify';
import { config } from '../config.js';

export const healthRoutes: FastifyPluginAsync = async (app) => {
  /** Sonda de vida, para orquestadores y para que el frontend sepa si hay servidor. */
  app.get('/api/health', async () => ({
    status: 'ok',
    service: 'cronia-ocr',
    engine: 'tesseract.js',
    langs: config.OCR_LANGS.split('+'),
    limits: {
      maxFiles: config.MAX_FILES,
      maxBytes: config.MAX_UPLOAD_BYTES,
      mimeTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/bmp'],
    },
  }));
};
