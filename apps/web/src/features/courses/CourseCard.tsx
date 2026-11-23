import {
  colorOf,
  courseMinutes,
  DAYS,
  DAYS_SHORT,
  displayName,
  formatHours,
  isValidSession,
  type Course,
  type DayIndex,
  type NameCase,
  type ResolvedTheme,
} from '@cronia/core';

const TrashIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
  </svg>
);

interface Props {
  course: Course;
  index: number;
  theme: ResolvedTheme;
  nameCase: NameCase;
  open: boolean;
  flash: boolean;
  onToggle: (open: boolean) => void;
  onChange: (patch: Partial<Course>) => void;
  onRemove: () => void;
  onAddSession: () => void;
  onUpdateSession: (index: number, patch: Partial<Course['sessions'][number]>) => void;
  onRemoveSession: (index: number) => void;
}

export function CourseCard({
  course,
  index,
  theme,
  nameCase,
  open,
  flash,
  onToggle,
  onChange,
  onRemove,
  onAddSession,
  onUpdateSession,
  onRemoveSession,
}: Props) {
  const color = colorOf(course, index, theme);

  const summary = course.sessions.length
    ? course.sessions.map((s) => `${DAYS_SHORT[s.day]} ${s.start}–${s.end}`).join(' · ')
    : 'Sin sesiones';

  return (
    <details
      className={`course${flash ? ' flash' : ''}`}
      open={open}
      onToggle={(event) => onToggle(event.currentTarget.open)}
    >
      <summary>
        <span className="swatch" style={{ background: color }}>
          <input
            type="color"
            value={color}
            aria-label={`Color de ${course.name || 'la materia'}`}
            onChange={(event) => onChange({ color: event.target.value })}
            // Sin esto, pulsar el selector de color plegaría la tarjeta.
            onClick={(event) => event.stopPropagation()}
          />
        </span>
        <span>
          <span className="nm">{displayName(course.name, nameCase) || 'Sin nombre'}</span>
          <span className="sm">{summary}</span>
        </span>
        <span className="hrs">{formatHours(courseMinutes(course))}</span>
      </summary>

      <div className="body">
        <div className="field">
          <label htmlFor={`name-${course.id}`}>Nombre</label>
          <input
            className="inp"
            id={`name-${course.id}`}
            value={course.name}
            onChange={(event) => onChange({ name: event.target.value })}
          />
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor={`teacher-${course.id}`}>Docente</label>
            <input
              className="inp"
              id={`teacher-${course.id}`}
              value={course.teacher}
              onChange={(event) => onChange({ teacher: event.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`code-${course.id}`}>Clave</label>
            <input
              className="inp"
              id={`code-${course.id}`}
              value={course.code}
              onChange={(event) => onChange({ code: event.target.value })}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`place-${course.id}`}>Lugar</label>
          <input
            className="inp"
            id={`place-${course.id}`}
            value={course.place}
            placeholder="Facultad o edificio"
            onChange={(event) => onChange({ place: event.target.value })}
          />
        </div>

        <div className="field">
          <span className="label" id={`sessions-${course.id}`}>
            Sesiones · día, inicio, fin y salón
          </span>
          <div role="group" aria-labelledby={`sessions-${course.id}`}>
            {course.sessions.map((session, sessionIndex) => {
              const invalid = !isValidSession(session);
              return (
                <div className="sess" key={sessionIndex}>
                  <select
                    className="inp"
                    value={session.day}
                    aria-label="Día"
                    onChange={(event) =>
                      onUpdateSession(sessionIndex, { day: Number(event.target.value) as DayIndex })
                    }
                  >
                    {DAYS.map((day, dayIndex) => (
                      <option key={day} value={dayIndex}>
                        {DAYS_SHORT[dayIndex]}
                      </option>
                    ))}
                  </select>
                  <input
                    className={`inp${invalid ? ' invalid' : ''}`}
                    type="time"
                    step="300"
                    value={session.start}
                    aria-label="Hora de inicio"
                    aria-invalid={invalid}
                    onChange={(event) => onUpdateSession(sessionIndex, { start: event.target.value })}
                  />
                  <input
                    className={`inp${invalid ? ' invalid' : ''}`}
                    type="time"
                    step="300"
                    value={session.end}
                    aria-label="Hora de fin"
                    aria-invalid={invalid}
                    onChange={(event) => onUpdateSession(sessionIndex, { end: event.target.value })}
                  />
                  <input
                    className="inp"
                    value={session.room}
                    placeholder="Salón"
                    aria-label="Salón"
                    onChange={(event) => onUpdateSession(sessionIndex, { room: event.target.value })}
                  />
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`Quitar la sesión de ${DAYS[session.day]}`}
                    onClick={() => onRemoveSession(sessionIndex)}
                  >
                    <TrashIcon />
                  </button>
                </div>
              );
            })}
          </div>
          {course.sessions.some((session) => !isValidSession(session)) && (
            <p className="hint" style={{ color: 'var(--danger)' }}>
              Hay una sesión cuya hora de fin no es posterior a la de inicio; no se dibujará.
            </p>
          )}
        </div>

        <div className="row spread">
          <button className="btn small" type="button" onClick={onAddSession}>
            + Sesión
          </button>
          <button className="btn small ghost danger" type="button" onClick={onRemove}>
            Eliminar materia
          </button>
        </div>
      </div>
    </details>
  );
}
