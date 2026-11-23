import { isPagesDemo } from '../preview.js';
import type { ParseResult, TextPage } from '@cronia/core';

/**
 * Cliente del servidor de OCR.
 *
 * La base se toma de `VITE_API_URL`; si no está, se usa el mismo origen, que
 * es lo que ocurre en desarrollo gracias al proxy de Vite y en producción
 * cuando el servidor sirve también el frontend.
 */
const BASE = (import.meta.env['VITE_API_URL'] ?? '').replace(/\/$/, '');

/** Códigos de error que devuelve el servidor. */
export type ApiErrorCode =
  | 'sin_archivos'
  | 'formato_no_admitido'
  | 'archivo_muy_grande'
  | 'demasiados_archivos'
  | 'peticion_invalida'
  | 'ocr_fallido'
  | 'sin_resultados'
  | 'limite_alcanzado'
  | 'error_interno'
  | 'sin_conexion';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    override readonly message: string,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface OcrStats {
  pages: number;
  courses: number;
  sessions: number;
  /** Confianza media del reconocimiento, de 0 a 100. */
  confidence: number;
}

export interface OcrResponse extends ParseResult {
  stats: OcrStats;
}

export interface HealthResponse {
  status: string;
  engine: string;
  langs: string[];
  limits: { maxFiles: number; maxBytes: number; mimeTypes: string[] };
}

/** Convierte una respuesta de error en un {@link ApiError} con mensaje en español. */
async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string; hint?: string } };
    if (body.error?.message) {
      return new ApiError(
        (body.error.code ?? 'error_interno') as ApiErrorCode,
        body.error.message,
        body.error.hint,
      );
    }
  } catch {
    // La respuesta no era JSON; se cae al mensaje genérico de abajo.
  }
  return new ApiError('error_interno', `El servidor respondió con un error (${response.status}).`);
}

/** Envuelve los fallos de red, que no llevan respuesta. */
async function request(path: string, init?: RequestInit): Promise<Response> {
  if (isPagesDemo) throw new ApiError('sin_conexion', 'Esta función requiere el servidor de Crónia.');
  try {
    return await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError(
      'sin_conexion',
      'No se pudo conectar con el servidor de lectura.',
      'Revisa que esté en marcha, o captura las materias a mano en la pestaña Materias.',
    );
  }
}

/** Comprueba si el servidor de OCR está disponible. */
export async function checkHealth(signal?: AbortSignal): Promise<HealthResponse | null> {
  if (isPagesDemo) return null;
  try {
    const response = await fetch(`${BASE}/api/health`, { signal });
    if (!response.ok) return null;
    return (await response.json()) as HealthResponse;
  } catch {
    return null;
  }
}

/** Manda una o varias imágenes al servidor y recibe el horario reconocido. */
export async function readImages(
  images: readonly Blob[],
  signal?: AbortSignal,
): Promise<OcrResponse> {
  const form = new FormData();
  images.forEach((image, index) => {
    form.append('file', image, `pagina-${index + 1}.png`);
  });

  const response = await request('/api/ocr/schedule', { method: 'POST', body: form, signal });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as OcrResponse;
}

/**
 * Pide al servidor que interprete texto ya posicionado.
 *
 * Es opcional: si el servidor no está disponible, quien llama puede hacer el
 * mismo análisis en el navegador con `parseSchedule` de `@cronia/core`.
 */
export async function parsePages(
  pages: readonly TextPage[],
  signal?: AbortSignal,
): Promise<ParseResult> {
  const response = await request('/api/parse/pages', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pages }),
    signal,
  });
  if (!response.ok) throw await toApiError(response);
  return (await response.json()) as ParseResult;
}
