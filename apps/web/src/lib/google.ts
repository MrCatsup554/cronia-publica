import { calendarSeries } from '@cronia/core';
import { useGoogleCalendar, type GoogleStatus } from '../store/useGoogleCalendar.js';
import { useSchedule } from '../store/useSchedule.js';

class GoogleRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
let working = false;
let connectionFailed = false;
let refreshing: Promise<void> | null = null;
const patch = useGoogleCalendar.getState().patch;

// Siempre mismo origen: el navegador no expone tokens de Google ni cookies a otro servidor.
async function request<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api/google/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers:
      body === undefined
        ? undefined
        : {
            'Content-Type': 'application/json',
            'X-Cronia-CSRF': useGoogleCalendar.getState().status?.csrf ?? '',
          },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json()) as T & { error?: { message?: string } };
  if (!response.ok)
    throw new GoogleRequestError(
      result.error?.message || 'No se pudo conectar con Google.',
      response.status,
    );
  return result;
}
function currentSchedule() {
  const schedule = useSchedule.getState();
  const { startDate, endDate, timeZone } = useGoogleCalendar.getState();
  return {
    options: { title: schedule.title, startDate, endDate, timeZone },
    courses: schedule.courses.map(({ color: _color, ...course }) => course),
  };
}
export function googleScheduleSnapshot(): string {
  return JSON.stringify(currentSchedule());
}

export async function refreshGoogle(): Promise<void> {
  if (working) return;
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const status = await request<GoogleStatus>('status');
      // Una respuesta de estado anterior a un envío no debe revertir su revisión.
      if (working) return;
      const state = useGoogleCalendar.getState();
      patch({ status, ...(connectionFailed ? { message: '' } : {}) });
      connectionFailed = false;
      if (
        state.enabled &&
        (!status.connected || status.accountId !== state.accountId || status.reconnect)
      ) {
        patch({
          enabled: false,
          message: status.reconnect
            ? 'Vuelve a conectar Google para continuar.'
            : 'Conecta Google y activa la sincronización de este horario.',
        });
      } else if (state.enabled && status.revision !== state.revision) {
        patch({
          enabled: false,
          message:
            'El horario cambió en otra pestaña o dispositivo. Revisa las materias y pulsa Reanudar para enviar esta versión.',
        });
      }
    } catch {
      connectionFailed = true;
      patch({
        message:
          'No se pudo contactar con el servidor. Los cambios locales se conservan y se reintentará la conexión.',
      });
    }
  })().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

export async function connectGoogle(): Promise<void> {
  if (working) return;
  working = true;
  patch({ busy: true, message: '' });
  try {
    const result = await request<{ url: string }>('connect', {});
    window.location.assign(result.url);
  } catch {
    patch({ message: 'No se pudo iniciar la conexión. Recarga Cronia e inténtalo de nuevo.' });
  } finally {
    working = false;
    patch({ busy: false });
  }
}

export async function sendGoogleChanges(): Promise<void> {
  const state = useGoogleCalendar.getState();
  if (
    working ||
    !state.enabled ||
    !state.status?.connected ||
    state.status.accountId !== state.accountId
  )
    return;
  const payload = currentSchedule();
  const snapshot = JSON.stringify(payload);
  if (snapshot === state.lastSubmitted) return;
  try {
    calendarSeries(useSchedule.getState().courses, payload.options);
  } catch (error) {
    patch({
      message:
        error instanceof Error
          ? error.message
          : 'Completa las fechas y materias antes de sincronizar.',
    });
    return;
  }
  working = true;
  patch({ busy: true, message: '' });
  try {
    const result = await request<Partial<GoogleStatus>>('sync', {
      ...payload,
      revision: state.revision,
    });
    patch({
      revision: result.revision!,
      lastSubmitted: snapshot,
      status: { ...state.status, ...result },
      message: '',
    });
  } catch (error) {
    const stop = error instanceof GoogleRequestError && [400, 401, 403, 409].includes(error.status);
    patch({
      ...(stop ? { enabled: false } : {}),
      message:
        error instanceof GoogleRequestError
          ? error.message
          : 'Sin conexión. Tus cambios se enviarán cuando se restablezca.',
    });
  } finally {
    working = false;
    patch({ busy: false });
  }
}

export async function startGoogleSync(): Promise<void> {
  await refreshGoogle();
  const state = useGoogleCalendar.getState();
  if (!state.status?.connected || state.status.reconnect || working) return;
  try {
    calendarSeries(useSchedule.getState().courses, currentSchedule().options);
    patch({
      enabled: true,
      accountId: state.status.accountId!,
      revision: state.status.revision!,
      lastSubmitted: '',
      message: '',
    });
    await sendGoogleChanges();
  } catch (error) {
    patch({ message: error instanceof Error ? error.message : 'Revisa el horario.' });
  }
}

export async function stopGoogleSync(disconnect = false): Promise<void> {
  if (working) return;
  working = true;
  patch({ busy: true });
  try {
    const result = await request<{ revoked?: boolean }>(disconnect ? 'disconnect' : 'pause', {});
    patch({
      enabled: false,
      lastSubmitted: '',
      message: disconnect
        ? result.revoked === false
          ? 'Desconectado de Cronia. No pudimos revocar el permiso en Google; puedes retirarlo desde tu cuenta de Google.'
          : 'Google desconectado. Las clases que ya se enviaron permanecen en tu calendario.'
        : 'Sincronización pausada. Las clases permanecen en Google Calendar.',
    });
  } catch {
    patch({
      message:
        'No se pudo detener la sincronización en el servidor. Reintenta cuando vuelva la conexión.',
    });
  } finally {
    working = false;
    patch({ busy: false });
  }
  await refreshGoogle();
}
