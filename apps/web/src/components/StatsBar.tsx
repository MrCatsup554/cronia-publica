import {
  findConflicts,
  formatHours,
  placeSessions,
  plural,
  totalMinutes,
  type Course,
} from '@cronia/core';

/**
 * Resumen del horario.
 *
 * Todos los textos concuerdan en número: el original escribía «1 materias» y
 * «1 sesiones», porque sólo pluralizaba la palabra «empalme».
 */
export function StatsBar({ courses }: { courses: readonly Course[] }) {
  const sessions = placeSessions(courses);
  const conflicts = findConflicts(sessions);
  const withoutSessions = courses.filter((course) => course.sessions.length === 0).length;

  return (
    <div className="stats">
      <span className="chip">{plural(courses.length, 'materia', 'materias')}</span>
      <span className="chip">{plural(sessions.length, 'sesión', 'sesiones')}</span>
      <span className="chip">{formatHours(totalMinutes(sessions))} por semana</span>

      {conflicts.length > 0 && (
        <span className="chip warn">
          {plural(conflicts.length, 'empalme de horario', 'empalmes de horario')}
        </span>
      )}
      {withoutSessions > 0 && (
        <span className="chip warn">
          {plural(withoutSessions, 'materia sin sesiones', 'materias sin sesiones')}
        </span>
      )}
    </div>
  );
}
