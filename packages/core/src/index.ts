/**
 * @cronia/core — dominio compartido entre el navegador y el servidor.
 *
 * Nada de este paquete toca el DOM ni el sistema de archivos, salvo el módulo
 * de render, que sólo necesita un contexto de canvas (y funciona igual con un
 * `OffscreenCanvas`).
 */

export * from './domain/types.js';
export * from './domain/time.js';
export * from './domain/text.js';
export * from './domain/schedule.js';

export * from './parser/types.js';
export * from './parser/days.js';
export * from './parser/grid.js';
export * from './parser/parse.js';

export * from './theme/color.js';
export * from './theme/palettes.js';
export * from './theme/themes.js';
export * from './theme/resolve.js';

export * from './render/text.js';
export * from './render/layout.js';
export * from './render/wallpaper.js';
export * from './render/draw.js';

export * from './domain/calendar.js';

export { contactStatuses } from './domain/management.js';
export type {
  Contact,
  ContactStatus,
  Inventory,
  Movement,
  Resource,
} from './domain/management.js';
