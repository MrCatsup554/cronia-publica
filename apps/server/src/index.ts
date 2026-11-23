import { buildApp } from './app.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { shutdownOcr, warmUp } from './services/ocr.js';

/** Arranca el servidor y lo apaga de forma ordenada al recibir una señal. */
async function main(): Promise<void> {
  const app = await buildApp();

  await app.listen({ host: config.HOST, port: config.PORT });
  logger.info(`Cronia OCR escuchando en http://localhost:${config.PORT}`);

  // Cargar el modelo de idioma tarda unos segundos: mejor hacerlo ahora que
  // durante la primera petición de quien esté usando la app.
  warmUp().catch((error: unknown) => {
    logger.warn({ error }, 'No se pudo precargar el motor de OCR; se cargará al primer uso');
  });

  let closing = false;
  const shutdown = (signal: string): void => {
    if (closing) return;
    closing = true;
    logger.info({ signal }, 'Cerrando el servidor');
    void (async () => {
      try {
        await app.close();
        await shutdownOcr();
        process.exit(0);
      } catch (error) {
        logger.error({ error }, 'Fallo al cerrar');
        process.exit(1);
      }
    })();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((error: unknown) => {
  logger.error({ error }, 'No se pudo arrancar el servidor');
  process.exit(1);
});
