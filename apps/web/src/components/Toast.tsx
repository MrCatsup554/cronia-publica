import { useCallback, useEffect, useRef, useState } from 'react';

/** Aviso breve, con una acción opcional para deshacer. */
export interface ToastMessage {
  text: string;
  action?: { label: string; run: () => void };
}

/** Milisegundos que permanece visible según lleve acción o no. */
const DURATION = { plain: 2600, withAction: 6000 } as const;

export function useToastController() {
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const show = useCallback((message: ToastMessage) => {
    clearTimeout(timer.current);
    setToast(message);
    timer.current = setTimeout(
      () => setToast(null),
      message.action ? DURATION.withAction : DURATION.plain,
    );
  }, []);

  const dismiss = useCallback(() => {
    clearTimeout(timer.current);
    setToast(null);
  }, []);

  // Un temporizador vivo tras desmontar intentaría actualizar un componente
  // que ya no existe.
  useEffect(() => () => clearTimeout(timer.current), []);

  return { toast, show, dismiss };
}

interface Props {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: Props) {
  if (!toast) return null;

  return (
    // `status` lo anuncia sin interrumpir lo que esté leyendo la persona.
    <div className="toast" role="status" aria-live="polite">
      <span>{toast.text}</span>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onDismiss();
          }}
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}
