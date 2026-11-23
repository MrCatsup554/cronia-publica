import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Red de seguridad de la interfaz.
 *
 * El original no tenía ninguna: cualquier excepción al dibujar dejaba la
 * página en blanco sin explicación y sin forma de recuperarse. Aquí al menos
 * se explica qué pasó y se ofrece empezar de cero, porque el origen más
 * probable es un estado guardado que ya no encaja.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Cronia falló al dibujar la interfaz:', error, info.componentStack);
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ padding: 32, maxWidth: 560, margin: '0 auto' }} role="alert">
        <h1 style={{ fontSize: 20 }}>Algo se rompió</h1>
        <p>
          Cronia no pudo mostrar tu horario. Suele deberse a datos guardados de una versión
          anterior.
        </p>
        <pre
          style={{
            background: 'var(--surface-2)',
            padding: 12,
            borderRadius: 8,
            overflow: 'auto',
            fontSize: 12,
          }}
        >
          {error.message}
        </pre>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" type="button" onClick={() => window.location.reload()}>
            Recargar la página
          </button>
          <button
            className="btn ghost danger"
            type="button"
            onClick={() => {
              try {
                localStorage.removeItem('cronia');
              } catch {
                // Si el almacenamiento está bloqueado no hay nada que borrar.
              }
              window.location.reload();
            }}
          >
            Borrar los datos guardados y empezar de cero
          </button>
        </div>
      </div>
    );
  }
}
