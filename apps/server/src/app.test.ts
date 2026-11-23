import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type App } from './app.js';
import { shutdownOcr } from './services/ocr.js';

/**
 * El OCR real tarda unos segundos y la primera vez descarga el modelo de
 * idioma, así que esa prueba es opcional: se activa con `RUN_OCR_TESTS=1`.
 */
const runOcrTests = process.env.RUN_OCR_TESTS === '1';

let app: App;

beforeAll(async () => {
  app = await buildApp();
});

afterAll(async () => {
  await app.close();
  await shutdownOcr();
});

/** Arma un cuerpo `multipart/form-data` con un archivo. */
function multipart(
  file: Buffer,
  filename: string,
  contentType: string,
): { headers: Record<string, string>; payload: Buffer } {
  const boundary = '----croniaTestBoundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
        `Content-Type: ${contentType}\r\n\r\n`,
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload };
}

describe('GET /api/health', () => {
  it('informa del motor y de los límites', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe('ok');
    expect(body.engine).toBe('tesseract.js');
    expect(body.langs).toContain('spa');
    expect(body.limits.maxFiles).toBeGreaterThan(0);
  });
});

describe('POST /api/parse/pages', () => {
  it('interpreta texto ya posicionado', async () => {
    const dayX = [200, 320, 440, 560, 680];
    const items = [
      ...['LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES'].map((str, i) => ({
        str,
        x: dayX[i]!,
        y: 10,
        w: 60,
        h: 8,
      })),
      { str: 'CÁLCULO I', x: 20, y: 40, w: 80, h: 8 },
      { str: '[001-2]', x: 20, y: 52, w: 50, h: 8 },
      { str: '08:00 - 10:00', x: dayX[0]!, y: 40, w: 60, h: 8 },
      { str: 'A-12', x: dayX[0]!, y: 50, w: 30, h: 8 },
    ];

    const response = await app.inject({
      method: 'POST',
      url: '/api/parse/pages',
      payload: { pages: [{ width: 800, height: 200, items }] },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.found).toBe(true);
    expect(body.courses).toHaveLength(1);
    expect(body.courses[0].name).toBe('CÁLCULO I');
    expect(body.courses[0].sessions[0]).toMatchObject({ day: 0, start: '08:00', end: '10:00' });
  });

  it('rechaza un cuerpo con la forma equivocada usando el formato de error propio', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/parse/pages',
      payload: { pages: [] },
    });

    expect(response.statusCode).toBe(400);
    // El manejador de errores propio debe envolver el error en `error: {...}`.
    expect(response.json()).toEqual({
      error: expect.objectContaining({ code: 'peticion_invalida' }),
    });
  });
});

describe('POST /api/ocr/schedule', () => {
  it('rechaza un formato que no es imagen', async () => {
    const { headers, payload } = multipart(Buffer.from('no soy una imagen'), 'a.txt', 'text/plain');
    const response = await app.inject({ method: 'POST', url: '/api/ocr/schedule', headers, payload });

    expect(response.statusCode).toBe(415);
    expect(response.json().error.code).toBe('formato_no_admitido');
  });

  it('avisa cuando no llega ningún archivo', async () => {
    const boundary = '----vacio';
    const response = await app.inject({
      method: 'POST',
      url: '/api/ocr/schedule',
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: Buffer.from(`--${boundary}--\r\n`),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('sin_archivos');
  });

  it.runIf(runOcrTests)(
    'lee un horario real con Tesseract y devuelve las materias',
    async () => {
      const fixture = fileURLToPath(new URL('../test/fixtures/horario.png', import.meta.url));
      const { headers, payload } = multipart(readFileSync(fixture), 'horario.png', 'image/png');
      const response = await app.inject({
        method: 'POST',
        url: '/api/ocr/schedule',
        headers,
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.stats.courses).toBe(4);
      expect(body.stats.sessions).toBe(8);

      const names = body.courses.map((c: { name: string }) => c.name).sort();
      expect(names).toEqual([
        'ADMINISTRACION DE REDES',
        'CALIDAD Y PRUEBAS DE SOFTWARE',
        'SEGURIDAD INFORMATICA',
        'SISTEMAS INTELIGENTES',
      ]);

      const redes = body.courses.find((c: { name: string }) => c.name.includes('REDES'));
      expect(redes.code).toBe('001028-1582-23');
      expect(redes.sessions).toHaveLength(2);
      expect(redes.sessions.map((s: { day: number }) => s.day).sort()).toEqual([0, 2]);
      expect(redes.sessions[0].room).toBe('FIB2AUL006');
    },
    120_000,
  );
});
