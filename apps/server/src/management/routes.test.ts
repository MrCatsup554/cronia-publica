import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '../errors.js';
import { managementRoutes } from './routes.js';

const password = randomUUID();
const headers = { authorization: `Bearer ${password}` };

describe('Gestión de Crónia', () => {
  let directory: string;
  let app: FastifyInstance;

  async function start() {
    const server = Fastify();
    server.setErrorHandler((error, _request, reply) => {
      if (error instanceof ApiError) return reply.code(error.statusCode).send({ message: error.message });
      return reply.send(error);
    });
    await server.register(async (instance) => managementRoutes(instance, { directory, password }));
    return server;
  }

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'cronia-management-'));
    app = await start();
  });

  afterEach(async () => {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  });

  it('registra una consulta una sola vez, protege el CRM y conserva el seguimiento al reiniciar', async () => {
    const id = randomUUID();
    const payload = { id, name: 'Estudiante', email: 'demo@example.org', message: 'Duda sobre PDF' };
    expect((await app.inject({ url: '/admin/crm' })).statusCode).toBe(401);
    expect((await app.inject({ url: '/admin/erp', headers: { authorization: 'Bearer wrong' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'POST', url: '/support', payload })).json()).toEqual({ id });
    expect((await app.inject({ method: 'POST', url: '/support', payload })).statusCode).toBe(201);

    const updated = await app.inject({
      method: 'POST', url: '/admin/crm/update', headers,
      payload: { id, status: 'in_progress', note: 'Revisar el archivo de ejemplo' },
    });
    expect(updated.statusCode).toBe(200);
    await app.close();
    app = await start();
    const list = await app.inject({ url: '/admin/crm', headers });
    expect(list.headers['cache-control']).toBe('no-store');
    expect(list.json()).toEqual([expect.objectContaining({
      id, source: 'chat', status: 'in_progress', note: 'Revisar el archivo de ejemplo',
    })]);
  });

  it('actualiza el saldo con entradas y salidas atómicas y conserva un historial sin duplicados', async () => {
    const resourceId = randomUUID();
    const resource = await app.inject({
      method: 'POST', url: '/admin/erp/resources', headers,
      payload: { id: resourceId, code: ' eq-1 ', name: 'Equipo', minimum: 1 },
    });
    expect(resource.statusCode).toBe(200);
    const movement = (id: string, direction: 'in' | 'out', quantity: number) =>
      app.inject({
        method: 'POST', url: '/admin/erp/movements', headers,
        payload: { id, resourceId, direction, quantity, reason: 'Prueba de inventario' },
      });
    const receipt = randomUUID();
    expect((await movement(receipt, 'in', 5)).statusCode).toBe(200);
    expect((await movement(receipt, 'in', 5)).statusCode).toBe(200);
    const concurrent = await Promise.all([movement(randomUUID(), 'out', 4), movement(randomUUID(), 'out', 4)]);
    expect(concurrent.map(({ statusCode }) => statusCode).sort()).toEqual([200, 409]);
    const inventory = (await app.inject({ url: '/admin/erp', headers })).json();
    expect(inventory.resources).toEqual([{ id: resourceId, code: 'EQ-1', name: 'Equipo', minimum: 1, quantity: 1 }]);
    expect(inventory.movements).toHaveLength(2);
  });
});
