import { useCallback, useState } from 'react';
import { AdPlacement } from './components/AdPlacement.js';
import { ScheduleCanvas } from './components/ScheduleCanvas.js';
import { StatsBar } from './components/StatsBar.js';
import { Tabs, TabPanel, type TabDefinition } from './components/Tabs.js';
import { Toast, useToastController } from './components/Toast.js';
import { CoursesPanel } from './features/courses/CoursesPanel.js';
import { DesignPanel } from './features/design/DesignPanel.js';
import { ExportPanel, type ExportFormat } from './features/export/ExportPanel.js';
import { isPagesDemo, managementPath } from './preview.js';
import { ChatWidget } from './features/management/ChatWidget.js';
import { LoadPanel } from './features/load/LoadPanel.js';
import { useRenderOptions } from './hooks/useRenderOptions.js';
import { downloadFile, exportImage, exportPdf, exportWallpaper } from './lib/export.js';
import { useGoogleSync } from './hooks/useGoogleSync.js';
import { useSchedule } from './store/useSchedule.js';

const ImageIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="m21 15-5-5L5 21" />
  </svg>
);

const DownloadIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14" />
  </svg>
);

export default function App() {
  useGoogleSync();
  const tab = useSchedule((s) => s.tab);
  const setTab = useSchedule((s) => s.setTab);
  const courses = useSchedule((s) => s.courses);
  const paper = useSchedule((s) => s.paper);
  const scale = useSchedule((s) => s.scale);
  const exportMode = useSchedule((s) => s.exportMode);
  const wallpaperFormat = useSchedule((s) => s.wallpaperFormat);

  const options = useRenderOptions();
  const { toast, show, dismiss } = useToastController();

  const [exporting, setExporting] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);

  const tabs: TabDefinition[] = [
    { key: 'load', label: 'Cargar' },
    { key: 'courses', label: 'Materias', count: courses.length },
    { key: 'design', label: 'Diseño' },
    { key: 'export', label: 'Exportar' },
  ];

  /** Salta a una materia desde el lienzo y la resalta en el editor. */
  const selectCourse = useCallback(
    (courseId: string) => {
      setTab('courses');
      setFocusId(courseId);
    },
    [setTab],
  );

  const runExport = useCallback(
    async (format: ExportFormat) => {
      if (exporting) return;
      setExporting(true);
      try {
        let file;
        if (format === 'wallpaper-png' || format === 'wallpaper-jpg') {
          file = await exportWallpaper(
            options,
            wallpaperFormat,
            format === 'wallpaper-jpg' ? 'jpg' : 'png',
          );
        } else if (format === 'xlsx') {
          const { exportExcel } = await import('./lib/excel.js');
          const schedule = useSchedule.getState();
          file = await exportExcel(schedule.courses, schedule.title, schedule.subtitle);
        } else if (format === 'pdf') {
          file = await exportPdf(options, Number(scale), paper);
        } else {
          file = await exportImage(options, Number(scale), format);
        }
        downloadFile(file);
        show({ text: `Se descargó ${file.filename}` });
      } catch (error) {
        console.error(error);
        show({ text: error instanceof Error ? error.message : 'No se pudo exportar. Inténtalo de nuevo.' });
      } finally {
        setExporting(false);
      }
    },
    [exporting, options, paper, scale, show, wallpaperFormat],
  );

  return (
    <div className="app">
      <a className="skip-link" href={`#panel-${tab}`}>
        Saltar al editor
      </a>

      <header className="top">
        <div className="brand">
          <div className="glyph" aria-hidden="true">
            <i />
            <i className="a" />
            <i />
            <i className="b" />
            <i />
            <i className="a" />
            <i />
            <i />
            <i className="b" />
          </div>
          <b>Cronia</b>
          <span>Organizador de horarios</span>
        </div>

        {exportMode === 'wallpaper' ? (
          // En modo fondo de pantalla un PDF no tiene sentido: el botón
          // principal descarga directamente la imagen para el teléfono.
          <button
            className="btn primary"
            type="button"
            disabled={exporting}
            onClick={() => void runExport('wallpaper-png')}
          >
            <DownloadIcon />
            <span>{exporting ? 'Generando…' : 'Fondo'}</span>
            <span className="lbl">&nbsp;de pantalla</span>
          </button>
        ) : (
          <>
            <button
              className="btn"
              type="button"
              disabled={exporting}
              onClick={() => void runExport('png')}
            >
              <ImageIcon />
              <span>PNG</span>
              <span className="lbl">&nbsp;imagen</span>
            </button>
            <button
              className="btn primary"
              type="button"
              disabled={exporting}
              onClick={() => void runExport('pdf')}
            >
              <DownloadIcon />
              <span>{exporting ? 'Generando…' : 'PDF'}</span>
            </button>
          </>
        )}
      </header>

      {isPagesDemo && <p className="cronia-demo-notice">Demostración. Usa datos ficticios. El CRM y el ERP guardan los cambios en este navegador. El OCR y la sincronización con Google Calendar requieren el servidor.</p>}

      <main className="layout">
        <aside className="panel">
          <div className="workspace-heading">
            <h1>Mi horario</h1>
            <a className="preview-link" href="#vista-previa">Ver horario</a>
          </div>
          <Tabs tabs={tabs} active={tab} onChange={setTab} />

          <TabPanel tab="load" active={tab}>
            <LoadPanel onToast={show} onImported={() => setTab('courses')} />
          </TabPanel>

          <TabPanel tab="courses" active={tab}>
            <CoursesPanel
              onToast={show}
              focusId={focusId}
              onFocusHandled={() => setFocusId(null)}
            />
          </TabPanel>

          <TabPanel tab="design" active={tab}>
            <DesignPanel onToast={show} />
          </TabPanel>

          <TabPanel tab="export" active={tab}>
            <ExportPanel busy={exporting} onExport={(format) => void runExport(format)} />
          </TabPanel>
          <AdPlacement placement="editor">
            <button type="button" onClick={() => { setTab('design'); document.getElementById('tab-design')?.focus(); }}>
              Personaliza los colores de tu horario
            </button>
          </AdPlacement>
        </aside>

        <section id="vista-previa" className="stage" tabIndex={-1} aria-labelledby="preview-title">
          <div className="stagebar">
            <h2 id="preview-title">Vista previa</h2>
            <StatsBar courses={courses} />
          </div>
          <div className="sheet-wrap">
            <ScheduleCanvas
              options={options}
              mode={exportMode}
              wallpaperFormat={wallpaperFormat}
              onSelectCourse={selectCourse}
            />
            <AdPlacement placement="preview">
              <button type="button" onClick={() => { setTab('export'); document.getElementById('tab-export')?.focus(); }}>
                Lleva tu horario en el celular
              </button>
            </AdPlacement>
          </div>
        </section>
      </main>

      <footer className="cronia-footer"><a href={managementPath}>Gestión del equipo</a></footer>
      <ChatWidget onNavigate={setTab} />
      <Toast toast={toast} onDismiss={dismiss} />
    </div>
  );
}
