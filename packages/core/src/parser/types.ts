/**
 * Contrato de entrada del parser.
 *
 * El parser no sabe de dónde vino el texto: le da igual que lo haya extraído
 * pdf.js de un PDF con texto o Tesseract de una imagen escaneada. Ambos
 * producen palabras con una caja delimitadora, y eso es todo lo que necesita.
 */

/** Una palabra o fragmento de texto con su posición en la página. */
export interface PositionedItem {
  str: string;
  /** Borde izquierdo, en píxeles desde la esquina superior izquierda. */
  x: number;
  /** Borde superior, en píxeles desde la esquina superior izquierda. */
  y: number;
  /** Ancho en píxeles. */
  w: number;
  /** Alto en píxeles; aproxima el tamaño de letra y sirve de unidad de tolerancia. */
  h: number;
}

/** Una página de texto posicionado. */
export interface TextPage {
  width: number;
  height: number;
  items: PositionedItem[];
}

/** Región de la cuadrícula en la que cae un fragmento. */
export type Region =
  /** Columna izquierda: nombres y claves de materia. */
  | 'L'
  /** Columna derecha: docente y lugar. */
  | 'R'
  /** Columna de un día concreto, por ejemplo `D0` = lunes. */
  | `D${number}`;

export interface PositionedCell extends PositionedItem {
  region: Region;
}

/** Una columna de día localizada, con sus fronteras horizontales. */
export interface DayColumn {
  day: number;
  /** Centro horizontal de la columna. */
  centerX: number;
  /** Frontera izquierda. */
  left: number;
  /** Frontera derecha. */
  right: number;
}

/** Geometría de la cuadrícula detectada en una página. */
export interface GridGeometry {
  /** Coordenada vertical de la fila de encabezados. */
  y: number;
  /** Alto de la fila de encabezados. */
  h: number;
  columns: DayColumn[];
  left: number;
  right: number;
}
