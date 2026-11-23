import { useEffect, useRef, useState } from 'react';
import {
  drawSchedule,
  drawWallpaper,
  layoutSchedule,
  layoutWallpaper,
  WALLPAPER_FORMATS,
  type HitRegion,
  type RenderOptions,
  type WallpaperFormatKey,
} from '@cronia/core';
import { loadFonts } from '../lib/fonts.js';
import type { ExportMode } from '../store/types.js';

/** Límites de la relación de píxeles: por debajo se ve borroso, por encima no se nota. */
const MIN_DPR = 1.25;
const MAX_DPR = 2;

/** Ancho máximo en pantalla de la vista previa del fondo, en píxeles CSS. */
const WALLPAPER_PREVIEW_WIDTH = 320;

interface Props {
  options: RenderOptions;
  mode: ExportMode;
  wallpaperFormat: WallpaperFormatKey;
  /** Se llama al pulsar sobre una clase o sobre la lista de materias. */
  onSelectCourse: (courseId: string) => void;
}

/**
 * Vista previa del horario, como hoja o como fondo de pantalla.
 *
 * El dibujo es imperativo sobre un lienzo: React se ocupa del elemento, y el
 * render de `@cronia/core` de su contenido. Cada redibujado se agrupa en un
 * `requestAnimationFrame` para que arrastrar un deslizador no dispare docenas
 * de repintados.
 */
export function ScheduleCanvas({ options, mode, wallpaperFormat, onSelectCourse }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hitsRef = useRef<HitRegion[]>([]);
  const frameRef = useRef(0);
  const [fontsReady, setFontsReady] = useState(false);

  const isWallpaper = mode === 'wallpaper';
  const format = WALLPAPER_FORMATS[wallpaperFormat];

  // Las tipografías cambian las medidas del texto: hay que redibujar al
  // terminar de cargarlas, o la primera pintura queda con la fuente de reserva.
  useEffect(() => {
    let active = true;
    void loadFonts(options.theme.font).then(() => {
      if (active) setFontsReady(true);
    });
    return () => {
      active = false;
    };
  }, [options.theme.font]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    cancelAnimationFrame(frameRef.current);
    frameRef.current = requestAnimationFrame(() => {
      const dpr = Math.max(MIN_DPR, Math.min(MAX_DPR, window.devicePixelRatio || 1));
      const { hits } = isWallpaper
        ? // En la vista previa sí se pintan las guías de zona segura; el archivo
          // exportado nunca las lleva.
          drawWallpaper(canvas, options, format, dpr * 2, true)
        : drawSchedule(canvas, options, dpr);
      hitsRef.current = hits;
    });

    return () => cancelAnimationFrame(frameRef.current);
    // `fontsReady` no se usa dentro, pero al cambiar debe forzar un redibujado.
  }, [options, isWallpaper, format, fontsReady]);

  const layout = isWallpaper ? layoutWallpaper(options, format) : layoutSchedule(options);

  const handleClick = (event: React.MouseEvent<HTMLCanvasElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // El lienzo se muestra escalado por CSS: hay que pasar de píxeles de
    // pantalla a las unidades de diseño en las que están las zonas sensibles.
    const rect = canvas.getBoundingClientRect();
    const ratio = layout.width / rect.width;
    const x = (event.clientX - rect.left) * ratio;
    const y = (event.clientY - rect.top) * ratio;

    // Se recorre al revés para que gane lo dibujado encima.
    const hit = [...hitsRef.current]
      .reverse()
      .find(
        (region) =>
          x >= region.x && x <= region.x + region.w && y >= region.y && y <= region.y + region.h,
      );

    if (hit) onSelectCourse(hit.courseId);
  };

  const sheetStyle = isWallpaper
    ? { maxWidth: WALLPAPER_PREVIEW_WIDTH, minWidth: 0, borderRadius: 22 }
    : { maxWidth: layout.width, minWidth: Math.min(640, layout.width) };

  return (
    <>
      <div className="sheet" style={sheetStyle}>
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          role="img"
          aria-label={
            isWallpaper
              ? `Vista previa del fondo de pantalla en formato ${format.name}`
              : `Vista semanal del horario con ${layoutSchedule(options).legendCourses.length} materias y ${layout.sessions.length} sesiones`
          }
        />
      </div>
      <p className="caption" style={{ maxWidth: isWallpaper ? 420 : layout.width }}>
        {isWallpaper
          ? 'Las franjas sombreadas quedan bajo el reloj y los botones del sistema; no se incluyen en la imagen.'
          : 'Pulsa sobre una clase para editarla.'}
      </p>
    </>
  );
}
