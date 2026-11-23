import { useEffect, useRef } from 'react';
import { isDark, mix, PALETTES, roundedRect, THEMES, type ThemeKey } from '@cronia/core';

/** Tamaño de la miniatura en unidades de diseño, y factor de nitidez. */
const W = 120;
const H = 72;
const SCALE = 2;

/** Bloques de ejemplo: [columna, hora de inicio, duración]. */
const DEMO_BLOCKS: Array<[number, number, number]> = [
  [0, 0, 2],
  [1, 1, 2],
  [2, 0, 1],
  [3, 2, 2],
  [0, 2.4, 1.4],
  [2, 1.5, 2],
  [1, 3.2, 1],
];

/** Dibuja un horario en miniatura para previsualizar un tema. */
export function ThemeThumbnail({ themeKey }: { themeKey: ThemeKey }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme = THEMES[themeKey];
    const palette = PALETTES[theme.palette].colors;

    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);

    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);

    roundedRect(ctx, 8, 8, 104, 58, Math.min(theme.radius, 6) / 1.5);
    ctx.fillStyle = theme.surface;
    ctx.fill();

    ctx.save();
    ctx.clip();
    ctx.fillStyle = theme.head;
    ctx.fillRect(8, 8, 104, 10);
    ctx.restore();

    // Sin contraste entre encabezado y cuadrícula hace falta una línea.
    if (theme.head === theme.surface) {
      ctx.fillStyle = theme.gridStrong;
      ctx.fillRect(8, 18, 104, 1);
    }

    DEMO_BLOCKS.forEach(([column, start, duration], index) => {
      const x = 12 + column * 25;
      const y = 21 + start * 10;
      const width = 21;
      const height = duration * 10 - 2;
      const color = palette[index % palette.length]!;

      roundedRect(ctx, x, y, width, height, Math.min(theme.radius, 8) / 3);
      if (theme.block === 'solid') {
        ctx.fillStyle = color;
        ctx.fill();
      } else if (theme.block === 'soft') {
        ctx.fillStyle = mix(color, theme.surface, isDark(theme.surface) ? 0.3 : 0.2);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.fillRect(x, y, 2, height);
      } else {
        ctx.lineWidth = 1.2;
        ctx.strokeStyle = color;
        ctx.stroke();
      }
    });
  }, [themeKey]);

  return <canvas ref={ref} aria-hidden="true" />;
}
