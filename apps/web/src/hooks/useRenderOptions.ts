import { useMemo } from 'react';
import { resolveTheme, type RenderOptions, type ResolvedTheme } from '@cronia/core';
import { useSchedule } from '../store/useSchedule.js';

/**
 * Traduce el estado de la aplicación a lo que entiende el motor de render.
 *
 * Esta capa es la que mantiene a `@cronia/core` ignorante de React y de Zustand:
 * el render recibe datos planos y podría ejecutarse igual en el servidor.
 */
export function useResolvedTheme(): ResolvedTheme {
  const theme = useSchedule((s) => s.theme);
  const palette = useSchedule((s) => s.palette);
  const block = useSchedule((s) => s.block);
  const radius = useSchedule((s) => s.radius);
  const font = useSchedule((s) => s.font);
  const bg = useSchedule((s) => s.bg);
  const head = useSchedule((s) => s.head);

  return useMemo(
    () => resolveTheme({ theme, palette, block, radius, font, bg, head }),
    [theme, palette, block, radius, font, bg, head],
  );
}

export function useRenderOptions(): RenderOptions {
  const resolvedTheme = useResolvedTheme();

  const title = useSchedule((s) => s.title);
  const subtitle = useSchedule((s) => s.subtitle);
  const courses = useSchedule((s) => s.courses);
  const orientation = useSchedule((s) => s.orientation);
  const density = useSchedule((s) => s.density);
  const hourFormat = useSchedule((s) => s.hourFormat);
  const nameCase = useSchedule((s) => s.nameCase);
  const days = useSchedule((s) => s.days);
  const from = useSchedule((s) => s.from);
  const to = useSchedule((s) => s.to);
  const show = useSchedule((s) => s.show);

  return useMemo(
    () => ({
      title,
      subtitle,
      courses,
      theme: resolvedTheme,
      orientation,
      density,
      hourFormat,
      nameCase,
      days,
      from,
      to,
      show,
    }),
    [
      title,
      subtitle,
      courses,
      resolvedTheme,
      orientation,
      density,
      hourFormat,
      nameCase,
      days,
      from,
      to,
      show,
    ],
  );
}
