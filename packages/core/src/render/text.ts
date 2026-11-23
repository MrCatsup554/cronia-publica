/** Medición y recorte de texto sobre un contexto de canvas. */

type Ctx = CanvasRenderingContext2D;

/** Recorta con puntos suspensivos hasta que quepa en `maxWidth`. */
export function ellipsize(ctx: Ctx, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped.trimEnd()}…`;
}

/**
 * Parte un texto en como mucho `maxLines` líneas que quepan en `maxWidth`.
 * Si sobra texto, la última línea termina en puntos suspensivos.
 */
export function wrapText(ctx: Ctx, text: string, maxWidth: number, maxLines: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];

  const lines: string[] = [];
  let current = '';
  let overflowed = false;

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    current = word;
    if (lines.length === maxLines) {
      overflowed = true;
      break;
    }
  }

  if (!overflowed && current) lines.push(current);

  const result = lines.slice(0, maxLines).map((line) => ellipsize(ctx, line, maxWidth));
  if (overflowed && result.length) {
    // Quedó texto fuera: la última línea debe avisarlo aunque por sí sola quepa.
    const last = lines[maxLines - 1];
    if (last !== undefined) {
      let clipped = last;
      while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
        clipped = clipped.slice(0, -1);
      }
      result[result.length - 1] = `${clipped.trimEnd()}…`;
    }
  }
  return result;
}

/** Construye una declaración `font` de canvas con reserva tipográfica. */
export const fontSpec = (family: string, weight: number, size: number, mono = false): string =>
  mono
    ? `${weight} ${size}px "IBM Plex Mono", ui-monospace, monospace`
    : `${weight} ${size}px "${family}", system-ui, sans-serif`;

/** Traza un rectángulo de esquinas redondeadas, acotando el radio al tamaño. */
export function roundedRect(
  ctx: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
