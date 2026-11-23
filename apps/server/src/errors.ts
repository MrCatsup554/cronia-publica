/**
 * Errores de la API.
 *
 * Cada uno lleva un `code` estable que el frontend usa para elegir el mensaje
 * que muestra, y un `message` en español ya listo para enseñar tal cual.
 */

export type ApiErrorCode =
  | 'sin_archivos'
  | 'formato_no_admitido'
  | 'archivo_muy_grande'
  | 'demasiados_archivos'
  | 'peticion_invalida'
  | 'ocr_fallido'
  | 'sin_resultados'
  | 'limite_alcanzado'
  | 'error_interno';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    override readonly message: string,
    readonly statusCode = 400,
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Cuerpo de respuesta ante un error. */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    hint?: string;
  };
}

export const toErrorBody = (error: ApiError): ApiErrorBody => ({
  error: { code: error.code, message: error.message, ...(error.hint ? { hint: error.hint } : {}) },
});
