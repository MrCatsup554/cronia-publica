import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { Course, ParsedCourse, ScheduleMeta, Session } from '@cronia/core';
import { blankCourse, DEFAULT_STATE, sampleCourses, toCourses } from './defaults.js';
import { sanitizeState } from './sanitize.js';
import type { ScheduleState, TabKey } from './types.js';

/**
 * Estado de la aplicación.
 *
 * El horario vive en el navegador. Al activar Google Calendar se envía una copia
 * al servidor para sincronizarla; la lectura OCR también envía las imágenes.
 */

interface Actions {
  setTab: (tab: TabKey) => void;
  patch: (partial: Partial<ScheduleState>) => void;
  toggleShow: (key: keyof ScheduleState['show'], value: boolean) => void;

  addCourse: () => Course;
  updateCourse: (id: string, patch: Partial<Course>) => void;
  removeCourse: (id: string) => { course: Course; index: number } | null;
  restoreCourse: (course: Course, index: number) => void;

  addSession: (courseId: string) => void;
  updateSession: (courseId: string, index: number, patch: Partial<Session>) => void;
  removeSession: (courseId: string, index: number) => void;

  /** Sustituye todas las materias por las leídas de un documento. */
  applyParsed: (courses: readonly ParsedCourse[], meta: ScheduleMeta) => void;
  replaceCourses: (courses: Course[], subtitle?: string) => void;

  loadSample: () => void;
  clearAll: () => void;

  clearCustomColors: () => void;
  resetThemeOverrides: () => void;
  selectTheme: (theme: ScheduleState['theme']) => void;
}

export type ScheduleStore = ScheduleState & Actions;

const STORAGE_KEY = 'cronia';
/** Subir esta versión invalida lo guardado por versiones anteriores. */
const STORAGE_VERSION = 2;

export const useSchedule = create<ScheduleStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_STATE,
      courses: sampleCourses(),

      setTab: (tab) => set({ tab }),
      patch: (partial) => set(partial),
      toggleShow: (key, value) => set((state) => ({ show: { ...state.show, [key]: value } })),

      addCourse: () => {
        const course = blankCourse();
        set((state) => ({ courses: [...state.courses, course] }));
        return course;
      },

      updateCourse: (id, patch) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id === id ? { ...course, ...patch } : course,
          ),
        })),

      removeCourse: (id) => {
        const index = get().courses.findIndex((course) => course.id === id);
        if (index < 0) return null;
        const course = get().courses[index]!;
        set((state) => ({ courses: state.courses.filter((c) => c.id !== id) }));
        return { course, index };
      },

      restoreCourse: (course, index) =>
        set((state) => {
          const courses = [...state.courses];
          courses.splice(index, 0, course);
          return { courses };
        }),

      addSession: (courseId) =>
        set((state) => ({
          courses: state.courses.map((course) => {
            if (course.id !== courseId) return course;
            // La sesión nueva copia la anterior y avanza un día: casi siempre
            // es lo que se quiere, y si no, se corrige con un clic.
            const last = course.sessions[course.sessions.length - 1];
            const next: Session = last
              ? { ...last, day: (Math.min(6, last.day + 1) as Session['day']) }
              : { day: 0, start: '08:00', end: '10:00', room: '' };
            return { ...course, sessions: [...course.sessions, next] };
          }),
        })),

      updateSession: (courseId, index, patch) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id === courseId
              ? {
                  ...course,
                  sessions: course.sessions.map((session, i) =>
                    i === index ? { ...session, ...patch } : session,
                  ),
                }
              : course,
          ),
        })),

      removeSession: (courseId, index) =>
        set((state) => ({
          courses: state.courses.map((course) =>
            course.id === courseId
              ? { ...course, sessions: course.sessions.filter((_, i) => i !== index) }
              : course,
          ),
        })),

      applyParsed: (courses, meta) => {
        const state = get();
        set({
          courses: toCourses(courses),
          // Un subtítulo detectado manda; si no lo hay, se borra el del
          // ejemplo para no atribuirle a este horario un ciclo que no es suyo.
          subtitle: meta.subtitle ?? (state.subtitle === DEFAULT_STATE.subtitle ? '' : state.subtitle),
          title: state.title || DEFAULT_STATE.title,
        });
      },

      replaceCourses: (courses, subtitle) =>
        set(subtitle === undefined ? { courses } : { courses, subtitle }),

      loadSample: () =>
        set({
          courses: sampleCourses(),
          title: DEFAULT_STATE.title,
          subtitle: DEFAULT_STATE.subtitle,
        }),

      clearAll: () => set({ courses: [], subtitle: '' }),

      clearCustomColors: () =>
        set((state) => ({ courses: state.courses.map((course) => ({ ...course, color: null })) })),

      resetThemeOverrides: () =>
        set({ palette: null, block: null, radius: null, font: '', bg: null, head: null }),

      selectTheme: (theme) =>
        set({ theme, palette: null, block: null, radius: null, font: '', bg: null, head: null }),
    }),
    {
      name: STORAGE_KEY,
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),

      // Las acciones no se guardan; sólo los datos.
      partialize: (state) =>
        Object.fromEntries(
          Object.entries(state).filter(([, value]) => typeof value !== 'function'),
        ) as ScheduleState,

      // Lo guardado puede venir de otra versión, de otra pestaña o estar
      // corrupto: se valida campo a campo antes de usarlo.
      merge: (persisted, current) => ({
        ...current,
        ...sanitizeState(persisted, current.courses),
      }),
    },
  ),
);
