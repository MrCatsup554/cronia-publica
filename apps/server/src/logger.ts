import { pino } from 'pino';
import { config } from './config.js';

/**
 * Registro de la aplicación.
 *
 * En desarrollo se imprime legible; en producción, JSON en una línea, que es
 * lo que esperan los agregadores de logs.
 */
export const logger = pino({
  // No registrar códigos OAuth ni cookies de sesión.
  serializers: {
    req: (request) => ({
      method: request.method,
      url: request.url?.split('?')[0],
      hostname: request.hostname,
    }),
  },
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers.set-cookie'],
  level: config.NODE_ENV === 'test' ? 'silent' : config.isProduction ? 'info' : 'debug',
  ...(config.isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
        },
      }),
});
