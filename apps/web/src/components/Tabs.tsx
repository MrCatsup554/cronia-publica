import { useRef } from 'react';
import type { TabKey } from '../store/types.js';

export interface TabDefinition {
  key: TabKey;
  label: string;
  /** Contador opcional junto a la etiqueta, como el número de materias. */
  count?: number;
}

interface Props {
  tabs: readonly TabDefinition[];
  active: TabKey;
  onChange: (tab: TabKey) => void;
}

/**
 * Pestañas del panel lateral.
 *
 * El original marcaba `role="tab"` pero no enlazaba las pestañas con sus
 * paneles ni permitía moverse con el teclado, así que para un lector de
 * pantalla eran botones sueltos. Aquí se completa el patrón: `aria-controls`,
 * paneles con `aria-labelledby` (en {@link TabPanel}) y navegación con flechas.
 */
export function Tabs({ tabs, active, onChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null);

  const move = (delta: number): void => {
    const index = tabs.findIndex((tab) => tab.key === active);
    const next = tabs[(index + delta + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.key);
    // El foco tiene que seguir a la selección, o el teclado se queda atrás.
    const button = listRef.current?.querySelector<HTMLButtonElement>(`#tab-${next.key}`);
    button?.focus();
  };

  return (
    <div className="tabs" role="tablist" aria-label="Secciones del editor" ref={listRef}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          id={`tab-${tab.key}`}
          className="tab"
          type="button"
          role="tab"
          aria-selected={tab.key === active}
          aria-controls={`panel-${tab.key}`}
          tabIndex={tab.key === active ? 0 : -1}
          onClick={() => onChange(tab.key)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') {
              event.preventDefault();
              move(1);
            } else if (event.key === 'ArrowLeft') {
              event.preventDefault();
              move(-1);
            }
          }}
        >
          {tab.label}
          {tab.count !== undefined && <span className="count">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

interface PanelProps {
  tab: TabKey;
  active: TabKey;
  children: React.ReactNode;
}

export function TabPanel({ tab, active, children }: PanelProps) {
  const selected = tab === active;
  return (
    <section
      className="pane"
      id={`panel-${tab}`}
      role="tabpanel"
      aria-labelledby={`tab-${tab}`}
      hidden={!selected}
      // Un panel sin controles enfocables debe poder recibir el foco él mismo.
      tabIndex={selected ? 0 : -1}
    >
      {selected && children}
    </section>
  );
}
