import { useState } from 'react';
import { createCalendar, slugify } from '@cronia/core';
import { useSchedule } from '../../store/useSchedule.js';
import { useGoogleCalendar } from '../../store/useGoogleCalendar.js';
import {
  connectGoogle,
  googleScheduleSnapshot,
  startGoogleSync,
  stopGoogleSync,
} from '../../lib/google.js';
import { downloadFile } from '../../lib/export.js';

export function CalendarExport() {
  const courses = useSchedule((state) => state.courses);
  const title = useSchedule((state) => state.title);
  const state = useGoogleCalendar();
  const { startDate, endDate, timeZone, status, enabled, busy, message, patch } = state;
  const [downloadMessage, setDownloadMessage] = useState('');
  const hasSessions = courses.some((course) => course.sessions.length > 0);
  const unsent = enabled && googleScheduleSnapshot() !== state.lastSubmitted;
  const synced = enabled && !unsent && !status?.pending && !status?.error && !message;

  return (
    <div className="group">
      <h3>Calendario (.ics)</h3>
      <p className="hint">
        Lleva tus clases a Google Calendar, Microsoft Outlook o Calendario de Apple (Mac). El
        archivo .ics contiene los eventos y sus repeticiones semanales; no necesitas conectar una
        cuenta en Cronia.
      </p>
      <form
        className="calendar-form"
        onSubmit={(event) => {
          event.preventDefault();
          // La descarga y la conexión se eligen con sus respectivos botones.
        }}
      >
        <div className="field">
          <label htmlFor="calendar-start">Inicio del ciclo</label>
          <input
            className="inp"
            id="calendar-start"
            type="date"
            required
            value={startDate}
            max={endDate || undefined}
            onChange={(event) => patch({ startDate: event.target.value, message: '' })}
          />
        </div>
        <div className="field">
          <label htmlFor="calendar-end">Fin del ciclo</label>
          <input
            className="inp"
            id="calendar-end"
            type="date"
            required
            value={endDate}
            min={startDate || undefined}
            onChange={(event) => patch({ endDate: event.target.value, message: '' })}
          />
        </div>
        <div className="field">
          <label htmlFor="calendar-zone">Zona horaria de las clases</label>
          <input
            className="inp"
            id="calendar-zone"
            required
            value={timeZone}
            placeholder="America/Merida"
            onChange={(event) => patch({ timeZone: event.target.value.trim(), message: '' })}
          />
          <p className="hint">
            Usa la zona donde se imparten las clases, por ejemplo America/Merida o
            America/Mexico_City.
          </p>
        </div>
      </form>
      <div>
        <p className="hint">
          Elige el inicio y fin del ciclo y la zona horaria antes de descargar. Incluye todas las
          clases, con docente y salón, también en días festivos.
        </p>
        <button
          className="btn"
          type="button"
          disabled={!hasSessions}
          onClick={() => {
            try {
              const content = createCalendar(courses, { title, startDate, endDate, timeZone });
              downloadFile({
                filename: `${slugify(title) || 'horario'}.ics`,
                blob: new Blob([content], { type: 'text/calendar;charset=utf-8' }),
              });
              setDownloadMessage(
                'Archivo descargado. Elige tu aplicación en «Cómo importar el archivo» y sigue los pasos.',
              );
            } catch (error) {
              setDownloadMessage(
                error instanceof Error ? error.message : 'No se pudo descargar el calendario.',
              );
            }
          }}
        >
          Descargar horario (.ics)
        </button>
        <p className="hint" role="status">
          {downloadMessage}
        </p>
      </div>
      {!hasSessions && (
        <p className="hint">Agrega al menos una sesión en Materias para descargar el calendario.</p>
      )}
      <p className="hint">
        Es una copia del horario: los cambios posteriores en Cronia no se actualizan en el archivo
        importado.
      </p>
      <details>
        <summary className="hint">Cómo importar el archivo</summary>
        <ol className="hint">
          <li>
            <strong>Google Calendar (computadora):</strong> abre Configuración → Importar y
            exportar. Selecciona el archivo .ics, el calendario de destino y pulsa Importar.{' '}
            <a
              href="https://support.google.com/calendar/answer/37118?hl=es"
              target="_blank"
              rel="noreferrer"
            >
              Ayuda de Google
            </a>
            .
          </li>
          <li>
            <strong>Outlook en la web:</strong> abre Calendario → Agregar calendario → Cargar desde
            archivo. Elige el .ics y el calendario de destino, y pulsa Importar.{' '}
            <a
              href="https://support.microsoft.com/es-es/office/importar-o-suscribirse-a-un-calendario-en-outlook-com-o-en-outlook-en-la-web-cff1429c-5af6-41ec-a5b4-74f2c278e98c"
              target="_blank"
              rel="noreferrer"
            >
              Ayuda de Outlook
            </a>
            .
          </li>
          <li>
            <strong>Calendario de Apple (Mac):</strong> abre Calendario → Archivo → Importar,
            selecciona el .ics y el calendario donde quieras añadir las clases.{' '}
            <a
              href="https://support.apple.com/guide/calendar/import-or-export-calendars-icl1023/mac"
              target="_blank"
              rel="noreferrer"
            >
              Ayuda de Apple
            </a>
            .
          </li>
        </ol>
        <p className="hint">
          Otras aplicaciones que admiten iCalendar (.ics) también pueden importarlo. En teléfonos,
          las opciones dependen de la aplicación; si no aparece Importar, usa una computadora.
          Importa el archivo una sola vez para evitar clases duplicadas.
        </p>
      </details>
      <h3>Sincronización con Google</h3>
      <p className="hint">
        Si prefieres que los cambios se actualicen automáticamente, conecta tu cuenta. Se usará un
        calendario independiente llamado Cronia y las fechas de arriba.
      </p>
      {!status && <p className="hint">Comprobando conexión con Google…</p>}
      {status && !status.configured && (
        <p className="hint">
          La conexión con Google aún no está habilitada en esta instalación. Puedes descargar una
          copia del horario mientras tanto.
        </p>
      )}
      {status?.configured && (!status.connected || status.reconnect) && (
        <button
          className="btn primary"
          type="button"
          disabled={busy}
          onClick={() => void connectGoogle()}
        >
          {busy
            ? 'Conectando…'
            : status.reconnect
              ? 'Volver a conectar Google'
              : 'Conectar con Google'}
        </button>
      )}
      {status?.connected && (
        <p className="hint">
          Cuenta conectada: <strong>{status.email}</strong>
        </p>
      )}
      {status?.connected && !status.reconnect && !enabled && (
        <button
          className="btn primary"
          type="button"
          onClick={() => void startGoogleSync()}
          disabled={busy || (!hasSessions && !status.lastSynced)}
        >
          {status.lastSynced ? 'Reanudar sincronización' : 'Activar sincronización automática'}
        </button>
      )}
      <div role="status" className="hint" aria-live="polite">
        {message ||
          status?.error ||
          (busy
            ? 'Enviando cambios…'
            : synced
              ? 'Sincronizado con Google Calendar'
              : enabled
                ? 'Cambios pendientes de sincronizar…'
                : '')}
      </div>
      {status?.lastSynced && (
        <p className="hint">
          Última sincronización: {new Date(status.lastSynced).toLocaleString('es-MX')}
        </p>
      )}
      {status?.connected && (
        <div className="row calendar-actions">
          {enabled && (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => void stopGoogleSync()}
            >
              Pausar
            </button>
          )}
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => void stopGoogleSync(true)}
          >
            Desconectar Google
          </button>
          {status.calendarUrl && (
            <a
              className="btn calendar-link"
              href={status.calendarUrl}
              target="_blank"
              rel="noreferrer"
            >
              Ver calendario
            </a>
          )}
        </div>
      )}
      <p className="hint">
        Al activar la sincronización, los cambios en Cronia crean, actualizan o eliminan sus clases
        en Google. Incluye docente y salón. Los cambios hechos en Google no se importan a Cronia.
      </p>
      <p className="hint">
        Las clases se repiten durante el ciclo, incluidos los días festivos. Los cambios se envían
        mientras Cronia está abierto; el servidor reintenta los envíos pendientes. Al desconectar se
        conservan las clases ya enviadas.
      </p>
    </div>
  );
}
