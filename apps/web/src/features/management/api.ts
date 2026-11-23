import { isPagesDemo } from '../../preview.js';

export async function managementRequest<T>(
  path: string,
  options: { body?: object; password?: string; signal?: AbortSignal } = {},
): Promise<T> {
  const { body, password, signal } = options;
  if (isPagesDemo) {
    const { demoRequest } = await import('./demo.js');
    signal?.throwIfAborted();
    return demoRequest(path, body) as T;
  }
  const headers = new Headers();
  if (password) headers.set('Authorization', `Bearer ${password}`);
  if (body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`/api/management/${path}`, {
    method: body ? 'POST' : 'GET',
    headers,
    ...(body && { body: JSON.stringify(body) }),
    ...(signal && { signal }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error?.message ?? 'No se pudo conectar con el servicio de gestión.');
  }
  return data as T;
}

export function formText(data: FormData, name: string): string {
  return String(data.get(name) ?? '');
}

export function managementError(error: unknown): string {
  return error instanceof Error ? error.message : 'Ocurrió un error. Inténtalo otra vez.';
}
