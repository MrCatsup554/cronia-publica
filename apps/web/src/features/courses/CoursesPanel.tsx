import { useEffect, useRef, useState } from 'react';
import { plural } from '@cronia/core';
import { CourseCard } from './CourseCard.js';
import { useResolvedTheme } from '../../hooks/useRenderOptions.js';
import { useSchedule } from '../../store/useSchedule.js';
import type { ToastMessage } from '../../components/Toast.jsx';

/** Duración del resaltado al saltar a una materia desde el lienzo. */
const FLASH_MS = 1400;

interface Props {
  onToast: (message: ToastMessage) => void;
  /** Materia a la que hay que saltar y resaltar; la fija el clic en el lienzo. */
  focusId: string | null;
  onFocusHandled: () => void;
}

export function CoursesPanel({ onToast, focusId, onFocusHandled }: Props) {
  const courses = useSchedule((s) => s.courses);
  const nameCase = useSchedule((s) => s.nameCase);
  const addCourse = useSchedule((s) => s.addCourse);
  const updateCourse = useSchedule((s) => s.updateCourse);
  const removeCourse = useSchedule((s) => s.removeCourse);
  const restoreCourse = useSchedule((s) => s.restoreCourse);
  const replaceCourses = useSchedule((s) => s.replaceCourses);
  const addSession = useSchedule((s) => s.addSession);
  const updateSession = useSchedule((s) => s.updateSession);
  const removeSession = useSchedule((s) => s.removeSession);

  const theme = useResolvedTheme();
  const [openIds, setOpenIds] = useState<Set<string>>(new Set());
  const [flashId, setFlashId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Al pulsar una clase en el lienzo se abre su tarjeta, se desplaza hasta ella
  // y se resalta un instante para que se vea a dónde saltó la vista.
  useEffect(() => {
    if (!focusId) return;

    setOpenIds((current) => new Set(current).add(focusId));
    setFlashId(focusId);
    onFocusHandled();

    const element = containerRef.current?.querySelector(`[data-id="${CSS.escape(focusId)}"]`);
    element?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const timer = setTimeout(() => setFlashId(null), FLASH_MS);
    return () => clearTimeout(timer);
  }, [focusId, onFocusHandled]);

  const setOpen = (id: string, open: boolean): void => {
    setOpenIds((current) => {
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <>
      <div className="group-head">
        <h3>Materias y sesiones</h3>
        <div className="row">
          {courses.length > 0 && (
            <button
              className="btn small ghost danger"
              type="button"
              onClick={() => {
                const previous = courses;
                replaceCourses([]);
                setOpenIds(new Set());
                onToast({
                  text: `Se ${previous.length === 1 ? 'eliminó 1 materia' : `eliminaron ${previous.length} materias`}`,
                  action: { label: 'Deshacer', run: () => replaceCourses(previous) },
                });
              }}
            >
              Eliminar todas
            </button>
          )}
          <button
            className="btn small"
            type="button"
            onClick={() => {
              const course = addCourse();
              setOpen(course.id, true);
              // El foco va al nombre, que es lo primero que se quiere escribir.
              requestAnimationFrame(() => {
                const input = document.getElementById(`name-${course.id}`);
                if (input instanceof HTMLInputElement) input.select();
              });
            }}
          >
            + Materia
          </button>
        </div>
      </div>

      <div className="group" ref={containerRef}>
        {courses.length === 0 ? (
          <p className="empty">
            Aún no hay materias. Carga un archivo o añade una con «+ Materia».
          </p>
        ) : (
          courses.map((course, index) => (
            <div key={course.id} data-id={course.id}>
              <CourseCard
                course={course}
                index={index}
                theme={theme}
                nameCase={nameCase}
                open={openIds.has(course.id)}
                flash={flashId === course.id}
                onToggle={(open) => setOpen(course.id, open)}
                onChange={(patch) => updateCourse(course.id, patch)}
                onAddSession={() => addSession(course.id)}
                onUpdateSession={(sessionIndex, patch) =>
                  updateSession(course.id, sessionIndex, patch)
                }
                onRemoveSession={(sessionIndex) => removeSession(course.id, sessionIndex)}
                onRemove={() => {
                  const removed = removeCourse(course.id);
                  if (!removed) return;
                  onToast({
                    text: `Se eliminó «${removed.course.name || 'Sin nombre'}»`,
                    action: {
                      label: 'Deshacer',
                      run: () => restoreCourse(removed.course, removed.index),
                    },
                  });
                }}
              />
            </div>
          ))
        )}
      </div>

      {courses.length > 0 && (
        <p className="hint">
          {plural(courses.length, 'materia en total', 'materias en total')}.
        </p>
      )}
    </>
  );
}
