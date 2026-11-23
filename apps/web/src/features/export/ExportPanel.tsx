import {
  layoutWallpaper,
  WALLPAPER_FORMATS,
  WALLPAPER_FORMAT_KEYS,
  type WallpaperFormatKey,
} from '@cronia/core';
import { CalendarExport } from './CalendarExport.js';
import { Segmented } from '../../components/Segmented.js';
import { exportPixelSize, wallpaperSize } from '../../lib/export.js';
import { useRenderOptions } from '../../hooks/useRenderOptions.js';
import { useSchedule } from '../../store/useSchedule.js';

export type ExportFormat = 'pdf' | 'png' | 'jpg' | 'wallpaper-png' | 'wallpaper-jpg' | 'xlsx';

interface Props {
  busy: boolean;
  onExport: (format: ExportFormat) => void;
}

export function ExportPanel({ busy, onExport }: Props) {
  const state = useSchedule();
  const options = useRenderOptions();
  const isWallpaper = state.exportMode === 'wallpaper';

  return (
    <>
      <div className="group">
        <h3>Excel</h3>
        <p className="hint">
          Descarga un archivo editable (.xlsx) con dos hojas: Horario semanal y Clases. Incluye
          todas las materias, horas, docentes y salones.
        </p>
        <button
          className="btn primary"
          type="button"
          disabled={busy || !state.courses.length}
          onClick={() => onExport('xlsx')}
        >
          {busy ? 'Generando…' : 'Descargar Excel (.xlsx)'}
        </button>
        <p className="hint">
          No requiere fechas del ciclo ni conectar una cuenta. Se genera en tu navegador. Los
          cambios en Excel no se sincronizan con Cronia.
        </p>
      </div>
      <CalendarExport />
      <div className="group">
        <h3>Qué vas a crear</h3>
        <Segmented
          label="Tipo de exportación"
          value={state.exportMode}
          onChange={(exportMode) => state.patch({ exportMode })}
          options={[
            { value: 'sheet', label: 'Hoja', description: 'Hoja para imprimir o compartir' },
            {
              value: 'wallpaper',
              label: 'Fondo de pantalla',
              description: 'Imagen para la pantalla del teléfono',
            },
          ]}
        />
      </div>

      {isWallpaper ? <WallpaperOptions busy={busy} onExport={onExport} /> : null}

      {!isWallpaper && (
        <>
          <div className="group">
            <h3>Orientación</h3>
            <Segmented
              label="Orientación de la hoja"
              value={state.orientation}
              onChange={(orientation) => state.patch({ orientation })}
              options={[
                { value: 'landscape', label: 'Horizontal' },
                { value: 'portrait', label: 'Vertical' },
              ]}
            />
          </div>

          <div className="group">
            <h3>Tamaño de hoja (PDF)</h3>
            <Segmented
              label="Tamaño de hoja"
              value={state.paper}
              onChange={(paper) => state.patch({ paper })}
              options={[
                { value: 'letter', label: 'Carta' },
                { value: 'a4', label: 'A4' },
                { value: 'fit', label: 'Ajustado' },
              ]}
            />
            <p className="hint">
              «Ajustado» crea una hoja del tamaño exacto del horario, sin márgenes.
            </p>
          </div>

          <div className="group">
            <h3>Resolución de imagen</h3>
            <Segmented
              label="Resolución de la imagen"
              value={state.scale}
              onChange={(scale) => state.patch({ scale })}
              options={[
                { value: '1.5', label: 'Normal' },
                { value: '2.5', label: 'Alta' },
                { value: '4', label: 'Impresión' },
              ]}
            />
            <p className="hint">
              {(() => {
                const size = exportPixelSize(options, Number(state.scale));
                return `${size.w} × ${size.h} píxeles`;
              })()}
            </p>
          </div>

          <div className="group">
            <h3>Descargar</h3>
            <div className="row">
              <button
                className="btn primary"
                type="button"
                disabled={busy}
                onClick={() => onExport('pdf')}
              >
                {busy ? 'Generando…' : 'Exportar PDF'}
              </button>
              <button className="btn" type="button" disabled={busy} onClick={() => onExport('png')}>
                Imagen PNG
              </button>
              <button className="btn" type="button" disabled={busy} onClick={() => onExport('jpg')}>
                Imagen JPG
              </button>
            </div>
            <p className="hint">
              Este archivo se genera en tu navegador, sin enviarlo a ningún servidor.
            </p>
          </div>
        </>
      )}
    </>
  );
}

/** Opciones propias del fondo de pantalla. */
function WallpaperOptions({ busy, onExport }: Props) {
  const state = useSchedule();
  const options = useRenderOptions();

  const formatKey = state.wallpaperFormat;
  const format = WALLPAPER_FORMATS[formatKey];
  const size = wallpaperSize(formatKey);
  const layout = layoutWallpaper(options, format);

  return (
    <>
      <div className="group">
        <h3>Formato de pantalla</h3>
        <Segmented
          label="Formato de pantalla"
          value={formatKey}
          onChange={(value) => state.patch({ wallpaperFormat: value as WallpaperFormatKey })}
          options={WALLPAPER_FORMAT_KEYS.map((key) => ({
            value: key,
            label: WALLPAPER_FORMATS[key].name,
            description: WALLPAPER_FORMATS[key].hint,
          }))}
        />
        <p className="hint">
          {format.hint} · se exporta a {size.w} × {size.h} píxeles.
        </p>
      </div>

      <div className="group">
        <h3>Cómo queda</h3>
        <p className="hint">
          El horario se centra en la franja que dejan libres el reloj, los widgets y los botones de
          linterna y cámara, para que nada quede tapado en la pantalla de bloqueo.
        </p>
        {layout.overflows && (
          <p className="hint" style={{ color: 'var(--danger)' }}>
            El horario no cabe entero en esa franja. Reduce el rango de horas en la pestaña Diseño,
            con «Desde» y «Hasta», o baja el «Alto por hora».
          </p>
        )}
      </div>

      <div className="group">
        <h3>Descargar</h3>
        <div className="row">
          <button
            className="btn primary"
            type="button"
            disabled={busy}
            onClick={() => onExport('wallpaper-png')}
          >
            {busy ? 'Generando…' : 'Descargar PNG'}
          </button>
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={() => onExport('wallpaper-jpg')}
          >
            Descargar JPG
          </button>
        </div>
        <p className="hint">
          Guarda la imagen en tu galería y ponla como fondo de pantalla desde los ajustes del
          teléfono.
        </p>
      </div>
    </>
  );
}
