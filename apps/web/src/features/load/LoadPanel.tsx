import { useCallback, useEffect, useRef, useState } from 'react';
import { checkHealth } from '../../lib/api.js';
import { useSchedule } from '../../store/useSchedule.js';
import { useFileImport } from './useFileImport.js';
import type { ToastMessage } from '../../components/Toast.jsx';

interface Props {
  onToast: (message: ToastMessage) => void;
  onImported: () => void;
}

export function LoadPanel({ onToast, onImported }: Props) {
  const [dragging, setDragging] = useState(false);
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSample = useSchedule((s) => s.loadSample);
  const clearAll = useSchedule((s) => s.clearAll);
  const courses = useSchedule((s) => s.courses);
  const subtitle = useSchedule((s) => s.subtitle);
  const replaceCourses = useSchedule((s) => s.replaceCourses);
  const setTab = useSchedule((s) => s.setTab);

  const handleImported = useCallback(() => {
    onImported();
  }, [onImported]);

  const { steps, detail, busy, progress, importFile, cancel } = useFileImport(handleImported);

  // Saber si hay servidor permite avisar antes de que alguien suelte una
  // imagen y se encuentre con un error a mitad del proceso.
  useEffect(() => {
    const controller = new AbortController();
    void checkHealth(controller.signal).then((health) => setServerUp(health !== null));
    return () => controller.abort();
  }, []);

  const handleFiles = (files: FileList | null): void => {
    const file = files?.[0];
    if (file) void importFile(file, file.name);
  };

  return (
    <>
      <label
        className={`drop${dragging ? ' over' : ''}`}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <svg className="doc" viewBox="0 0 74 56" fill="none" aria-hidden="true">
          <rect x="2" y="4" width="30" height="40" rx="3" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
          <path d="M8 13h18M8 19h14M8 25h18M8 31h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
          <path d="M35 24h6m0 0-3-3m3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="44" y="10" width="28" height="40" rx="3" stroke="currentColor" strokeWidth="1.5" />
          <rect x="48" y="16" width="6" height="10" rx="1.5" fill="#E4572E" />
          <rect x="55" y="22" width="6" height="8" rx="1.5" fill="#2E86AB" />
          <rect x="62" y="15" width="6" height="12" rx="1.5" fill="#F2A541" />
          <rect x="48" y="30" width="6" height="12" rx="1.5" fill="#3BB273" />
          <rect x="62" y="32" width="6" height="8" rx="1.5" fill="#7768AE" />
        </svg>
        <strong>Suelta aquí tu horario</strong>
        <small>o pulsa para elegir un archivo</small>
        <div className="formats">
          <span>PDF</span>
          <span>PNG</span>
          <span>JPG</span>
          <span>WEBP</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp,image/bmp"
          disabled={busy}
          onChange={(event) => {
            handleFiles(event.target.files);
            // Permite volver a elegir el mismo archivo tras corregirlo.
            event.target.value = '';
          }}
        />
      </label>

      {steps.length > 0 && (
        <div className="status" aria-live="polite">
          {steps.map((step, index) => (
            <div key={`${step.kind}-${index}`} className={`st ${step.kind}`}>
              {step.text}
            </div>
          ))}
          {progress !== null && (
            <div className="progress">
              <i style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
          {detail && <pre className="detail">{detail}</pre>}
          {busy && (
            <button className="btn small" type="button" onClick={cancel}>
              Detener
            </button>
          )}
        </div>
      )}

      <div className="row">
        <button className="btn small" type="button" disabled={busy} onClick={() => {
          loadSample();
          onToast({ text: 'Horario de ejemplo cargado' });
        }}>
          Cargar ejemplo
        </button>
        <button
          className="btn small ghost"
          type="button"
          disabled={busy}
          onClick={() => {
            const previous = courses;
            const previousSubtitle = subtitle;
            clearAll();
            setTab('courses');
            onToast({
              text: 'Horario vaciado',
              action: {
                label: 'Deshacer',
                run: () => replaceCourses(previous, previousSubtitle),
              },
            });
          }}
        >
          Empezar en blanco
        </button>
      </div>

      <div className="group">
        <h3>Cómo se lee tu archivo</h3>
        <div className="methods">
          <div className="method">
            <span className="tag">PDF</span>
            <b>Lectura por coordenadas</b>
            <p>
              Si el PDF tiene texto, Cronia localiza los encabezados de día y asigna cada horario a
              su columna y cada materia a su fila. Es exacto y no sale de tu navegador.
            </p>
          </div>
          <div className="method">
            <span className="tag">OCR</span>
            <b>Lectura óptica</b>
            <p>
              Para imágenes y PDF escaneados, el servidor de Cronia reconoce el texto con Tesseract,
              un motor libre que corre en tu propia instalación. No interviene ningún servicio
              externo.
            </p>
          </div>
          <div className="method">
            <span className="tag">EDIT</span>
            <b>Revisa y corrige</b>
            <p>
              Todo lo detectado queda editable en la pestaña Materias: nombres, horas, salones,
              docentes y colores.
            </p>
          </div>
        </div>

        {serverUp === false && (
          <p className="hint">
            El servidor de lectura óptica no responde, así que de momento sólo se pueden leer PDF con
            texto. Puedes capturar las materias a mano en la pestaña Materias.
          </p>
        )}
      </div>
    </>
  );
}
