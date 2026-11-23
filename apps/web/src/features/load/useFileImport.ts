import { useCallback, useRef, useState } from 'react';
import { parseSchedule } from '@cronia/core';
import { ApiError, readImages } from '../../lib/api.js';
import { extractPdfText, rasterizePdf } from '../../lib/pdf.js';
import { useSchedule } from '../../store/useSchedule.js';
import { plural } from '@cronia/core';

/** Una línea del informe de lectura que se muestra a la persona usuaria. */
export interface Step {
  kind: 'run' | 'ok' | 'err' | 'info';
  text: string;
}

export interface ImportState {
  steps: Step[];
  detail?: string;
  busy: boolean;
  /** Progreso de 0 a 1 mientras se convierten páginas; `null` si no aplica. */
  progress: number | null;
}

/**
 * Por debajo de este número de fragmentos se considera que el PDF es una
 * imagen escaneada y no un documento con texto seleccionable.
 */
const SCANNED_THRESHOLD = 15;

const IMAGE_PATTERN = /^image\/(png|jpe?g|webp|bmp)$/;
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|bmp)$/i;

/**
 * Orquesta la importación de un archivo.
 *
 * El orden importa: un PDF con texto se lee entero en el navegador, que es
 * instantáneo y exacto. Sólo se recurre al servidor de OCR cuando no hay texto
 * que leer, porque es más lento y menos fiable.
 */
export function useFileImport(onDone: (courses: number, sessions: number) => void) {
  const [state, setState] = useState<ImportState>({ steps: [], busy: false, progress: null });
  const abortRef = useRef<AbortController | null>(null);
  const applyParsed = useSchedule((s) => s.applyParsed);

  const report = useCallback((steps: Step[], detail?: string, progress: number | null = null) => {
    setState((current) => ({ ...current, steps, detail, progress }));
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const importFile = useCallback(
    async (file: File | Blob, name: string) => {
      if (state.busy) return;

      const controller = new AbortController();
      abortRef.current = controller;
      setState({ steps: [{ kind: 'run', text: `Abriendo ${name}…` }], busy: true, progress: null });

      try {
        const type = file.type;
        const isPdf = type === 'application/pdf' || /\.pdf$/i.test(name);
        const isImage = IMAGE_PATTERN.test(type) || IMAGE_EXTENSION.test(name);

        if (!isPdf && !isImage) {
          report([
            { kind: 'err', text: `«${name}» no es un PDF ni una imagen.` },
            { kind: 'info', text: 'Usa PDF, PNG, JPG o WEBP.' },
          ]);
          return;
        }

        const steps: Step[] = [];

        if (isPdf) {
          const { pages, pageCount, itemCount } = await extractPdfText(file);
          steps.push({
            kind: 'ok',
            text: `PDF de ${plural(pageCount, 'página', 'páginas')} · ${plural(itemCount, 'fragmento de texto', 'fragmentos de texto')}`,
          });

          if (itemCount > SCANNED_THRESHOLD) {
            // El PDF trae texto: se interpreta aquí mismo, sin salir del equipo.
            const result = parseSchedule(pages);
            const sessions = result.courses.reduce((total, c) => total + c.sessions.length, 0);

            if (result.courses.length && sessions) {
              applyParsed(result.courses, result.meta);
              steps.push({
                kind: 'ok',
                text: `Lectura por coordenadas: ${plural(result.courses.length, 'materia', 'materias')}, ${plural(sessions, 'sesión', 'sesiones')}`,
              });

              const missingTeacher = result.courses.filter((c) => !c.teacher).length;
              if (missingTeacher) {
                steps.push({
                  kind: 'info',
                  text: `${plural(missingTeacher, 'materia se quedó', 'materias se quedaron')} sin docente; puedes completarlo en Materias.`,
                });
              }

              report(steps);
              onDone(result.courses.length, sessions);
              return;
            }

            steps.push({
              kind: 'info',
              text: 'No se encontró una tabla con columnas de día. Se intentará leer la página como imagen…',
            });
          } else {
            steps.push({ kind: 'info', text: 'El PDF parece escaneado: no contiene texto.' });
          }

          // Sin texto aprovechable, se rasteriza y se manda al OCR.
          report([...steps, { kind: 'run', text: 'Convirtiendo las páginas en imágenes…' }], undefined, 0);
          const images = await rasterizePdf(file, (done, total) => {
            report(
              [...steps, { kind: 'run', text: `Convirtiendo página ${done} de ${total}…` }],
              undefined,
              done / total,
            );
          });
          steps.push({
            kind: 'ok',
            text: `${plural(images.length, 'página convertida', 'páginas convertidas')} en imagen`,
          });
          await runOcr(images, steps, controller.signal);
          return;
        }

        steps.push({ kind: 'ok', text: `Imagen recibida: ${name}` });
        await runOcr([file], steps, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) {
          report([{ kind: 'info', text: 'Lectura detenida.' }]);
          return;
        }
        if (error instanceof ApiError) {
          report([
            { kind: 'err', text: error.message },
            ...(error.hint ? [{ kind: 'info' as const, text: error.hint }] : []),
          ]);
          return;
        }
        console.error(error);
        report(
          [
            { kind: 'err', text: 'No se pudo leer el archivo.' },
            {
              kind: 'info',
              text: 'Prueba con otro archivo, o captura las materias a mano en la pestaña Materias.',
            },
          ],
          error instanceof Error ? error.message : String(error),
        );
      } finally {
        abortRef.current = null;
        setState((current) => ({ ...current, busy: false, progress: null }));
      }

      /** Manda las imágenes al servidor y aplica el resultado. */
      async function runOcr(images: Blob[], steps: Step[], signal: AbortSignal): Promise<void> {
        report(
          [...steps, { kind: 'run', text: 'Leyendo el texto de la imagen… puede tardar un poco.' }],
          undefined,
          null,
        );

        const result = await readImages(images, signal);
        applyParsed(result.courses, result.meta);

        const done: Step[] = [
          ...steps,
          {
            kind: 'ok',
            text: `Lectura óptica: ${plural(result.stats.courses, 'materia', 'materias')}, ${plural(result.stats.sessions, 'sesión', 'sesiones')}`,
          },
        ];

        // Por debajo de este nivel de confianza conviene avisar de que hay que
        // revisar; el OCR se equivoca sobre todo con claves y nombres propios.
        if (result.stats.confidence < 75) {
          done.push({
            kind: 'info',
            text: `La imagen se leyó con una confianza del ${result.stats.confidence} %. Revisa los datos en Materias.`,
          });
        } else {
          done.push({ kind: 'info', text: 'Revisa los datos en Materias antes de exportar.' });
        }

        report(done);
        onDone(result.stats.courses, result.stats.sessions);
      }
    },
    [applyParsed, onDone, report, state.busy],
  );

  return { ...state, importFile, cancel };
}
