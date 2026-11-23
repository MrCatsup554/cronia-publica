import { PALETTES, THEMES, pad2, type PaletteKey, type ThemeKey } from '@cronia/core';
import { Segmented } from '../../components/Segmented.js';
import { ThemeThumbnail } from './ThemeThumbnail.js';
import { useResolvedTheme } from '../../hooks/useRenderOptions.js';
import { useSchedule } from '../../store/useSchedule.js';
import type { ToastMessage } from '../../components/Toast.jsx';

/** Opciones de hora para los desplegables «Desde» y «Hasta». */
const HOUR_OPTIONS = [
  { value: 'auto', label: 'Automático' },
  ...Array.from({ length: 25 }, (_, hour) => ({ value: String(hour), label: `${pad2(hour)}:00` })),
];

/** Qué mostrar en el horario. La clave debe existir en `show`. */
const SHOW_FIELDS = [
  { key: 'time', label: 'Hora' },
  { key: 'room', label: 'Salón' },
  { key: 'teacher', label: 'Docente' },
  { key: 'code', label: 'Clave' },
  { key: 'place', label: 'Lugar' },
  { key: 'legend', label: 'Lista de materias' },
  { key: 'halfHours', label: 'Líneas de media hora' },
] as const;

export function DesignPanel({ onToast }: { onToast: (message: ToastMessage) => void }) {
  const state = useSchedule();
  const theme = useResolvedTheme();

  return (
    <>
      <div className="group">
        <h3>Encabezado</h3>
        <div className="field">
          <label htmlFor="title">Título</label>
          <input
            className="inp"
            id="title"
            maxLength={80}
            value={state.title}
            onChange={(event) => state.patch({ title: event.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="subtitle">Subtítulo</label>
          <input
            className="inp"
            id="subtitle"
            maxLength={120}
            value={state.subtitle}
            onChange={(event) => state.patch({ subtitle: event.target.value })}
          />
        </div>
      </div>

      <div className="group">
        <h3>Tema</h3>
        <div className="themes" role="radiogroup" aria-label="Tema del horario">
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
            <button
              key={key}
              className="theme"
              type="button"
              role="radio"
              aria-checked={state.theme === key}
              onClick={() => state.selectTheme(key)}
            >
              <ThemeThumbnail themeKey={key} />
              <span>{THEMES[key].name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="group">
        <h3>Colores de las materias</h3>
        <div className="palettes" role="radiogroup" aria-label="Paleta de colores">
          {(Object.keys(PALETTES) as PaletteKey[]).map((key) => (
            <button
              key={key}
              className="pal"
              type="button"
              role="radio"
              aria-checked={(state.palette ?? THEMES[state.theme].palette) === key}
              onClick={() => state.patch({ palette: key })}
            >
              <span>{PALETTES[key].name}</span>
              <span className="dots" aria-hidden="true">
                {PALETTES[key].colors.map((color) => (
                  <i key={color} style={{ background: color }} />
                ))}
              </span>
            </button>
          ))}
        </div>
        <button
          className="btn small ghost"
          type="button"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => {
            state.clearCustomColors();
            onToast({ text: 'Se restauraron los colores de la paleta' });
          }}
        >
          Quitar colores personalizados
        </button>
      </div>

      <div className="group">
        <h3>Bloques</h3>
        <Segmented
          label="Estilo de los bloques"
          value={theme.block}
          onChange={(block) => state.patch({ block })}
          options={[
            { value: 'solid', label: 'Sólido' },
            { value: 'soft', label: 'Suave' },
            { value: 'outline', label: 'Contorno' },
          ]}
        />
        <label className="opt" htmlFor="radius">
          Redondeo
          <input
            type="range"
            id="radius"
            min={0}
            max={18}
            step={1}
            value={theme.radius}
            onChange={(event) => state.patch({ radius: Number(event.target.value) })}
          />
        </label>
        <label className="opt" htmlFor="density">
          Alto por hora
          <input
            type="range"
            id="density"
            min={0.7}
            max={1.6}
            step={0.05}
            value={state.density}
            onChange={(event) => state.patch({ density: Number(event.target.value) })}
          />
        </label>
      </div>

      <div className="group">
        <h3>Tipografía y fondo</h3>
        <div className="field">
          <label htmlFor="font">Fuente</label>
          <select
            className="inp"
            id="font"
            value={state.font}
            onChange={(event) => state.patch({ font: event.target.value })}
          >
            <option value="">La del tema</option>
            <option value="Schibsted Grotesk">Schibsted Grotesk</option>
            <option value="Space Grotesk">Space Grotesk</option>
            <option value="Nunito">Nunito (redondeada)</option>
            <option value="Source Serif 4">Source Serif (con remates)</option>
            <option value="IBM Plex Mono">IBM Plex Mono</option>
          </select>
        </div>
        <div className="colors">
          <label className="colorpick" htmlFor="bg">
            <input
              type="color"
              id="bg"
              value={theme.bg.startsWith('#') ? theme.bg : '#ffffff'}
              onChange={(event) => state.patch({ bg: event.target.value })}
            />
            Fondo
          </label>
          <label className="colorpick" htmlFor="head">
            <input
              type="color"
              id="head"
              value={theme.head.startsWith('#') ? theme.head : '#000000'}
              onChange={(event) => state.patch({ head: event.target.value })}
            />
            Encabezado de días
          </label>
          <button
            className="btn small ghost"
            type="button"
            onClick={() => {
              state.resetThemeOverrides();
              onToast({ text: 'Tema restablecido' });
            }}
          >
            Restablecer tema
          </button>
        </div>
      </div>

      <div className="group">
        <h3>Qué mostrar</h3>
        <div className="checks">
          {SHOW_FIELDS.map((field) => (
            <label className="check" key={field.key}>
              <input
                type="checkbox"
                checked={state.show[field.key]}
                onChange={(event) => state.toggleShow(field.key, event.target.checked)}
              />
              {field.label}
            </label>
          ))}
        </div>

        <div className="field">
          <span className="label">Nombres</span>
          <Segmented
            label="Capitalización de los nombres"
            value={state.nameCase}
            onChange={(nameCase) => state.patch({ nameCase })}
            options={[
              { value: 'title', label: 'Tipo Título' },
              { value: 'original', label: 'Como en el documento' },
            ]}
          />
        </div>

        <div className="field">
          <span className="label">Formato de hora</span>
          <Segmented
            label="Formato de hora"
            value={state.hourFormat}
            onChange={(hourFormat) => state.patch({ hourFormat })}
            options={[
              { value: '24', label: '24 h', description: 'Veinticuatro horas' },
              { value: '12', label: '12 h', description: 'Doce horas, con a. m. y p. m.' },
            ]}
          />
        </div>

        <div className="field">
          <span className="label">Días</span>
          <Segmented
            label="Días visibles"
            value={state.days}
            onChange={(days) => state.patch({ days })}
            options={[
              { value: 'auto', label: 'Automático' },
              { value: '5', label: 'Lun–Vie', description: 'De lunes a viernes' },
              { value: '6', label: 'Lun–Sáb', description: 'De lunes a sábado' },
              { value: '7', label: 'Semana', description: 'Toda la semana' },
            ]}
          />
        </div>

        <div className="two">
          <div className="field">
            <label htmlFor="from">Desde</label>
            <select
              className="inp"
              id="from"
              value={state.from}
              onChange={(event) => state.patch({ from: event.target.value })}
            >
              {HOUR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="to">Hasta</label>
            <select
              className="inp"
              id="to"
              value={state.to}
              onChange={(event) => state.patch({ to: event.target.value })}
            >
              {HOUR_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  );
}
