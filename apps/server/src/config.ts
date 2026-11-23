import { z } from 'zod';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true });

/**
 * Configuración del servidor, leída del entorno y validada al arrancar.
 *
 * Si algo está mal, el proceso muere de inmediato con un mensaje claro en vez
 * de fallar a media petición.
 */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().positive().default(8787),

  /** Orígenes permitidos por CORS, separados por comas. `*` permite cualquiera. */
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  /** Idiomas de Tesseract separados por `+`. `spa` = español. */
  OCR_LANGS: z.string().default('spa+eng'),

  /** Carpeta donde se cachean los modelos de idioma descargados. */
  OCR_CACHE_DIR: z.string().default('.cache/tesseract'),

  /** Tamaño máximo por archivo, en bytes. */
  MAX_UPLOAD_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(10 * 1024 * 1024),

  /** Número máximo de imágenes por petición. */
  MAX_FILES: z.coerce.number().int().positive().max(10).default(4),

  /** Peticiones permitidas por ventana de tiempo, por dirección IP. */
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),

  /** Carpeta con el frontend compilado. Si existe, el servidor también lo sirve. */
  STATIC_DIR: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_TOKEN_KEY: z.string().optional(),
  GOOGLE_APP_ORIGIN: z.string().url().default('http://localhost:5173'),
  UPSTASH_REDIS_REST_URL: z.string().url().startsWith('https://').optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  MANAGEMENT_PASSWORD: z.string().regex(/^[A-Za-z0-9_-]{24,128}$/).optional(),
  MANAGEMENT_DATA_DIR: z.string().default('.data/management'),
  GOOGLE_DATA_DIR: z.string().default('.data/google'),
});

type Env = z.infer<typeof EnvSchema>;

export interface Config extends Readonly<Env> {
  /** Lista de orígenes permitidos, o `true` para permitir cualquiera. */
  readonly corsOrigins: readonly string[] | true;
  readonly isProduction: boolean;
}

function load(): Config {
  const parsed = EnvSchema.safeParse({
    GOOGLE_APP_ORIGIN: process.env.RENDER_EXTERNAL_URL,
    CORS_ORIGIN: process.env.RENDER_EXTERNAL_URL,
    ...process.env,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  · ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Configuración inválida:\n${issues}`);
  }

  const env = parsed.data;
  if (Boolean(env.UPSTASH_REDIS_REST_URL) !== Boolean(env.UPSTASH_REDIS_REST_TOKEN)) {
    throw new Error('Configura juntos la URL y el token REST de Redis.');
  }
  if (process.env.RENDER && env.GOOGLE_CLIENT_ID && !env.UPSTASH_REDIS_REST_URL) {
    throw new Error('Google Calendar en Render requiere almacenamiento persistente en Redis.');
  }
  const googleFields = [env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_TOKEN_KEY];
  if (googleFields.some(Boolean) && !googleFields.every(Boolean)) {
    throw new Error('Configura GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_TOKEN_KEY juntos.');
  }
  if (env.GOOGLE_TOKEN_KEY && Buffer.from(env.GOOGLE_TOKEN_KEY, 'base64').length !== 32) {
    throw new Error('GOOGLE_TOKEN_KEY debe contener 32 bytes en base64.');
  }
  const origin = new URL(env.GOOGLE_APP_ORIGIN);
  if (
    origin.origin !== env.GOOGLE_APP_ORIGIN ||
    (env.GOOGLE_CLIENT_ID &&
      origin.protocol !== 'https:' &&
      !['localhost', '127.0.0.1'].includes(origin.hostname))
  ) {
    throw new Error(
      'GOOGLE_APP_ORIGIN debe ser un origen HTTPS sin ruta (HTTP sólo en localhost).',
    );
  }
  return {
    ...env,
    corsOrigins:
      env.CORS_ORIGIN.trim() === '*'
        ? true
        : env.CORS_ORIGIN.split(',')
            .map((origin) => origin.trim())
            .filter(Boolean),
    isProduction: env.NODE_ENV === 'production',
  };
}

export const config = load();
