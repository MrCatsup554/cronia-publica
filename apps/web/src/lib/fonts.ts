import { FONT_FAMILIES } from '@cronia/core';

/**
 * Precarga de tipografías.
 *
 * El lienzo dibuja con la fuente que esté disponible en ese instante: si aún no
 * ha cargado, el texto sale con la de reserva y las medidas cambian. Por eso se
 * espera a que estén listas antes de exportar, y se vuelve a dibujar cuando
 * terminan de cargar.
 */
const WEIGHTS = [400, 500, 600, 700, 800] as const;

export async function loadFonts(extra?: string): Promise<void> {
  if (!document.fonts) return;

  const families = new Set<string>(FONT_FAMILIES);
  if (extra) families.add(extra);

  await Promise.all(
    [...families].flatMap((family) =>
      WEIGHTS.map((weight) =>
        // Una fuente que no exista rechaza la promesa; no es motivo para
        // detener la carga de las demás.
        document.fonts.load(`${weight} 16px "${family}"`).catch(() => undefined),
      ),
    ),
  );
}
