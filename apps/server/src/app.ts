import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { config } from './config.js';
import { ApiError, toErrorBody } from './errors.js';
import { logger } from './logger.js';
import { healthRoutes } from './routes/health.js';
import { googleRoutes } from './google/routes.js';
import { managementRoutes } from './management/routes.js';
import { ocrRoutes } from './routes/ocr.js';

/** Instancia de Fastify ya configurada, con el tipo del logger que realmente usa. */
export type App = Awaited<ReturnType<typeof buildApp>>;

/**
 * Construye la aplicación sin arrancarla, para que las pruebas puedan usar
 * `app.inject()` sin abrir un puerto.
 */
export async function buildApp() {
  const app = Fastify({ loggerInstance: logger, bodyLimit: config.MAX_UPLOAD_BYTES });

  await app.register(cors, {
    origin: config.corsOrigins as string[] | boolean,
    methods: ['GET', 'POST'],
  });

  await app.register(rateLimit, {
    max: config.RATE_LIMIT_MAX,
    timeWindow: config.RATE_LIMIT_WINDOW,
    // El OCR es caro en CPU: conviene frenar antes de saturar la máquina.
    errorResponseBuilder: () =>
      toErrorBody(
        new ApiError(
          'limite_alcanzado',
          'Demasiadas peticiones seguidas. Espera un momento e inténtalo otra vez.',
          429,
        ),
      ),
  });

  // El manejador debe instalarse ANTES de registrar las rutas: en Fastify cada
  // contexto encapsulado hereda el manejador de errores vigente en el momento
  // de crearse, así que uno declarado después no llegaría a esas rutas.
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      request.log.info({ code: error.code }, error.message);
      return reply.status(error.statusCode).send(toErrorBody(error));
    }

    // `@fastify/multipart` lanza este código cuando el archivo pasa del límite.
    if ((error as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      const tooLarge = new ApiError(
        'archivo_muy_grande',
        `El archivo supera el máximo de ${Math.round(config.MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
        413,
      );
      return reply.status(413).send(toErrorBody(tooLarge));
    }

    request.log.error({ err: error }, 'Error no controlado');
    const internal = new ApiError(
      'error_interno',
      'Ocurrió un error inesperado en el servidor.',
      500,
    );
    return reply.status(500).send(toErrorBody(internal));
  });

  await app.register(multipart, {
    limits: { fileSize: config.MAX_UPLOAD_BYTES, files: config.MAX_FILES },
  });

  await app.register(async (instance) =>
    googleRoutes(
      instance,
      config.GOOGLE_CLIENT_ID
        ? {
            clientId: config.GOOGLE_CLIENT_ID,
            clientSecret: config.GOOGLE_CLIENT_SECRET!,
            tokenKey: config.GOOGLE_TOKEN_KEY!,
            origin: config.GOOGLE_APP_ORIGIN,
            ...(config.UPSTASH_REDIS_REST_URL && { redis: {
              url: config.UPSTASH_REDIS_REST_URL,
              token: config.UPSTASH_REDIS_REST_TOKEN!,
            } }),
            dataDirectory: config.GOOGLE_DATA_DIR,
          }
        : undefined,
    ),
  );

  await app.register(async (instance) => managementRoutes(instance, {
    password: process.env.RENDER && !config.UPSTASH_REDIS_REST_URL
      ? undefined
      : config.MANAGEMENT_PASSWORD,
    directory: config.MANAGEMENT_DATA_DIR,
    redis: config.UPSTASH_REDIS_REST_URL && config.UPSTASH_REDIS_REST_TOKEN
      ? { url: config.UPSTASH_REDIS_REST_URL, token: config.UPSTASH_REDIS_REST_TOKEN }
      : undefined,
  }), { prefix: '/api/management' });

  await app.register(healthRoutes);
  await app.register(ocrRoutes);

  // En producción el mismo proceso puede servir el frontend compilado.
  const staticDir = config.STATIC_DIR ? resolve(process.cwd(), config.STATIC_DIR) : null;
  if (staticDir && existsSync(staticDir)) {
    await app.register(fastifyStatic, { root: staticDir });
    app.setNotFoundHandler((request, reply) => {
      // Las rutas de API que no existen son un 404 de verdad; el resto va al
      // index para que funcione el enrutado del cliente.
      if (request.url.startsWith('/api/')) {
        return reply
          .status(404)
          .send(toErrorBody(new ApiError('peticion_invalida', 'Ruta no encontrada.', 404)));
      }
      return reply.sendFile('index.html');
    });
    logger.info({ staticDir }, 'Sirviendo el frontend compilado');
  }

  return app;
}
