import type { TabKey } from '../../store/types.js';

export interface ChatAnswer {
  text: string;
  action?: { tab: TabKey; label: string };
}

export const chatTopics = ['Importar horario', 'Editar materias', 'Exportar PDF', 'Google Calendar'];

const topics: Array<{ match: RegExp; answer: ChatAnswer }> = [
  {
    match: /calendar|calendario|sincron|\.ics\b|google/,
    answer: {
      text: 'Abre Exportar y busca Calendario. Puedes descargar un archivo ICS para importarlo a tu calendario o conectar Google Calendar si la sincronización está habilitada.',
      action: { tab: 'export', label: 'Ir a Calendario' },
    },
  },
  {
    match: /import|carg|subir|pega|ocr|captura|escane|leer/,
    answer: {
      text: 'En Cargar puedes pegar el texto de tu horario o seleccionar un archivo compatible. Revisa las materias y los bloques detectados antes de exportar.',
      action: { tab: 'load', label: 'Ir a Cargar' },
    },
  },
  {
    match: /fondo|wallpaper|celular|telefono/,
    answer: {
      text: 'En Exportar, elige el modo Fondo de pantalla y un formato para tu teléfono. Después descarga la imagen que aparece en la vista previa.',
      action: { tab: 'export', label: 'Ir a Exportar' },
    },
  },
  {
    match: /export|descarg|pdf|excel|xlsx|png|jpg|imprim/,
    answer: {
      text: 'En Exportar puedes elegir PDF para imprimir, PNG o JPG para compartir como imagen, y Excel para trabajar con el horario en una hoja de cálculo.',
      action: { tab: 'export', label: 'Ir a Exportar' },
    },
  },
  {
    match: /disen|temas?|color|fuente|personaliz/,
    answer: {
      text: 'En Diseño puedes ajustar el tema y los colores. Comprueba el resultado en la vista previa antes de descargarlo.',
      action: { tab: 'design', label: 'Ir a Diseño' },
    },
  },
  {
    match: /materia|editar|clase|bloque|conflicto|choque|profesor/,
    answer: {
      text: 'En Materias puedes corregir los datos de cada clase y sus bloques. Si dos clases coinciden, revisa sus días y horas de inicio y fin.',
      action: { tab: 'courses', label: 'Ir a Materias' },
    },
  },
];

export function answerChat(question: string): ChatAnswer {
  const normalized = question.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
  return topics.find(({ match }) => match.test(normalized))?.answer ?? {
    text: 'Puedo ayudarte a importar horarios, editar materias, personalizar el diseño o exportar. Para otra consulta, selecciona Contactar al equipo si esa opción está disponible.',
  };
}
