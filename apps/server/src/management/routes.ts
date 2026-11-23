import { createHash, timingSafeEqual } from 'node:crypto';
import { type Contact, type Inventory } from '@cronia/core';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { ManagementStorage } from './storage.js';

const identifier = z.string().uuid().transform((id) => id.toLowerCase());
const contactForm = z.object({
  id: identifier,
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(160).transform((email) => email.toLowerCase()),
  message: z.string().trim().min(1).max(1200),
});
const contactUpdate = z.object({
  id: identifier,
  status: z.enum(['new', 'in_progress', 'resolved']),
  note: z.string().trim().max(1200),
});
const resourceForm = z.object({
  id: identifier,
  code: z.string().trim().min(1).max(32).transform((code) => code.toUpperCase()),
  name: z.string().trim().min(1).max(100),
  minimum: z.number().int().min(0).max(1_000_000),
});
const movementForm = z.object({
  id: identifier,
  resourceId: identifier,
  direction: z.enum(['in', 'out']),
  quantity: z.number().int().min(1).max(1_000_000),
  reason: z.string().trim().min(1).max(240),
});

type Options = {
  password?: string;
  directory: string;
  redis?: { url: string; token: string };
};

function invalid(message: string, status = 400): never {
  throw new ApiError('peticion_invalida', message, status);
}

function parse<T extends z.ZodTypeAny>(schema: T, body: unknown): z.output<T> {
  const parsed = schema.safeParse(body);
  if (!parsed.success) invalid('Revisa los campos e inténtalo otra vez.');
  return parsed.data;
}

function digest(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export async function managementRoutes(app: FastifyInstance, options: Options) {
  const enabled = Boolean(options.password);
  const expected = options.password ? digest(options.password) : undefined;
  const contacts = new ManagementStorage<Contact[]>('crm', () => [], options.directory, options.redis);
  const inventory = new ManagementStorage<Inventory>(
    'erp', () => ({ resources: [], movements: [] }), options.directory, options.redis,
  );

  function authenticate(request: FastifyRequest) {
    if (!expected) invalid('El equipo aún no ha habilitado el panel de gestión.', 503);
    const authorization = request.headers.authorization ?? '';
    if (!authorization.startsWith('Bearer ') ||
        !timingSafeEqual(expected, digest(authorization.slice(7)))) {
      invalid('Clave de gestión incorrecta.', 401);
    }
  }

  async function createContact(input: z.output<typeof contactForm>, source: Contact['source']) {
    const record: Contact = {
      ...input, source, status: 'new', note: '', createdAt: new Date().toISOString(),
    };
    return contacts.update((state) => {
      if (state.some((contact) => contact.id === record.id)) return;
      if (state.length >= 500) invalid('El registro de contactos alcanzó su capacidad.', 409);
      state.unshift(record);
    });

  }

  app.addHook('onRequest', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
  });
  app.get('/status', async () => ({ supportAvailable: enabled }));
  app.post('/support', { bodyLimit: 8192, config: { rateLimit: { max: 6, timeWindow: '1 minute' } } }, async (request, reply) => {
    if (!enabled) invalid('El envío de consultas aún no está habilitado.', 503);
    const input = parse(contactForm, request.body);
    await createContact(input, 'chat');
    return reply.code(201).send({ id: input.id });
  });

  await app.register(async (admin) => {
    admin.addHook('onRequest', async (request) => authenticate(request));
    admin.get('/crm', async () => contacts.get());
    admin.post('/crm', { bodyLimit: 8192 }, async (request, reply) => {
      const result = await createContact(parse(contactForm, request.body), 'manual');
      return reply.code(201).send(result);
    });
    admin.post('/crm/update', { bodyLimit: 8192 }, async (request) => {
      const input = parse(contactUpdate, request.body);
      return contacts.update((state) => {
        const contact = state.find(({ id }) => id === input.id);
        if (!contact) invalid('No se encontró el contacto.', 404);
        contact.status = input.status;
        contact.note = input.note;
      });
    });

    admin.get('/erp', async () => inventory.get());
    admin.post('/erp/resources', { bodyLimit: 4096 }, async (request) => {
      const input = parse(resourceForm, request.body);
      return inventory.update(({ resources }) => {
        if (resources.some(({ id }) => id === input.id)) return;
        if (resources.some(({ code }) => code === input.code)) invalid('El código ya está registrado.', 409);
        if (resources.length >= 250) invalid('El inventario alcanzó su capacidad.', 409);
        resources.push({ ...input, quantity: 0 });
      });
    });
    admin.post('/erp/movements', { bodyLimit: 4096 }, async (request) => {
      const input = parse(movementForm, request.body);
      const createdAt = new Date().toISOString();
      return inventory.update(({ resources, movements }) => {
        if (movements.some(({ id }) => id === input.id)) return;
        const resource = resources.find(({ id }) => id === input.resourceId);
        if (!resource) invalid('No se encontró el recurso.', 404);
        const quantity = resource.quantity + (input.direction === 'in' ? input.quantity : -input.quantity);
        if (quantity < 0) invalid('La salida supera las existencias disponibles.', 409);
        if (quantity > 1_000_000) invalid('La existencia supera el máximo permitido.', 409);
        if (movements.length >= 2000) invalid('El historial de inventario alcanzó su capacidad.', 409);
        resource.quantity = quantity;
        movements.unshift({ ...input, createdAt });
      });
    });
  }, { prefix: '/admin' });
}
