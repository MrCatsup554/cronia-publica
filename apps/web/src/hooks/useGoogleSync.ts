import { useEffect } from 'react';
import { isPagesDemo } from '../preview.js';
import { refreshGoogle, sendGoogleChanges } from '../lib/google.js';
import { useSchedule } from '../store/useSchedule.js';
import { useGoogleCalendar } from '../store/useGoogleCalendar.js';

/** Vive en App: cambiar de pestaña nunca detiene la sincronización. */
export function useGoogleSync(): void {
  useEffect(() => {
    if (isPagesDemo) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void sendGoogleChanges(), 1800);
    };
    const unsubscribeSchedule = useSchedule.subscribe(schedule);
    const unsubscribeGoogle = useGoogleCalendar.subscribe((state, previous) => {
      if (
        state.enabled !== previous.enabled ||
        state.startDate !== previous.startDate ||
        state.endDate !== previous.endDate ||
        state.timeZone !== previous.timeZone ||
        (previous.busy && !state.busy && !state.message)
      )
        schedule();
    });
    const refresh = async () => {
      await refreshGoogle();
      await sendGoogleChanges();
    };
    const onOnline = () => void refresh();
    const onVisible = () => {
      if (!document.hidden) void refresh();
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === 'cronia-google' && useGoogleCalendar.getState().enabled) {
        useGoogleCalendar
          .getState()
          .patch({
            enabled: false,
            message: 'La conexión cambió en otra pestaña. Revisa el horario y pulsa Reanudar.',
          });
      }
    };
    const result = new URLSearchParams(window.location.search).get('google');
    if (result) {
      useSchedule.getState().setTab('export');
      useGoogleCalendar
        .getState()
        .patch({
          message:
            result === 'connected'
              ? 'Cuenta conectada. Confirma las fechas y activa la sincronización.'
              : result === 'denied'
                ? 'No se concedió acceso a Google Calendar. Puedes volver a conectar.'
                : 'No se pudo conectar Google. Inténtalo de nuevo.',
        });
      const url = new URL(window.location.href);
      url.searchParams.delete('google');
      window.history.replaceState(null, '', url);
    }
    void refresh();
    const interval = setInterval(() => void refresh(), 15_000);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('storage', onStorage);
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      unsubscribeSchedule();
      unsubscribeGoogle();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
