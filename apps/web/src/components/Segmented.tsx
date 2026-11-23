/**
 * Selector de una opción entre varias.
 *
 * Usa `role="radiogroup"` en vez del `aria-pressed` del original: son opciones
 * mutuamente excluyentes, no botones de alternar, y con esto un lector de
 * pantalla anuncia «1 de 3» y las flechas del teclado funcionan.
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  /** Texto largo para el lector de pantalla, si la etiqueta es abreviada. */
  description?: string;
}

interface Props<T extends string> {
  label: string;
  value: T;
  options: ReadonlyArray<SegmentedOption<T>>;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange }: Props<T>) {
  const move = (delta: number): void => {
    const index = options.findIndex((option) => option.value === value);
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      className="seg"
      role="radiogroup"
      aria-label={label}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          move(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          // La descripción se añade al texto visible en vez de sustituirlo: si
          // lo reemplazara, el nombre accesible dejaría de contener la etiqueta
          // que se ve, y quien maneje el equipo por voz no podría nombrarla.
          aria-label={option.description ? `${option.label} — ${option.description}` : undefined}
          // Sólo la opción activa entra en el orden de tabulación: dentro del
          // grupo se navega con las flechas.
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
