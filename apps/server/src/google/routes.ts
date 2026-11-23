import { createHash, randomBytes } from 'node:crypto';
import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { calendarSeries, type Course } from '@cronia/core';
import { GoogleStorage } from './storage.js';
import { GoogleSync, fingerprint } from './sync.js';
import { LiveGoogleProvider } from './provider.js';
import type { GoogleAccount, GoogleProvider, GoogleSession, GoogleSettings } from './types.js';

const COOKIE = 'cronia_google';
const TTL = 30 * 24 * 60 * 60;
const random = () => randomBytes(32).toString('hex');
const optionsSchema = z.object({
  title: z.string().max(200),
  startDate: z.string().max(10),
  endDate: z.string().max(10),
  timeZone: z.string().max(100),
});
const syncSchema = z.object({
  revision: z.number().int().nonnegative(),
  options: optionsSchema,
  courses: z
    .array(
      z.object({
        id: z.string().min(1).max(150),
        name: z.string().max(500),
        teacher: z.string().max(500),
        code: z.string().max(150),
        place: z.string().max(500),
        sessions: z
          .array(
            z.object({
              day: z.number().int().min(0).max(6),
              start: z.string().max(5),
              end: z.string().max(5),
              room: z.string().max(500),
            }),
          )
          .max(35),
      }),
    )
    .max(100),
});

export async function googleRoutes(
  app: FastifyInstance,
  settings?: GoogleSettings,
  provider?: GoogleProvider,
) {
  await app.register(cookie);
  const storage = settings
    ? new GoogleStorage(settings.dataDirectory, Buffer.from(settings.tokenKey, 'base64'), settings.redis)
    : null;
  const sync =
    storage && settings
      ? new GoogleSync(storage, provider ?? new LiveGoogleProvider(settings))
      : null;
  const jobs = new Set<Promise<void>>();
  const cookies = {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: settings?.origin.startsWith('https:') ?? false,
    path: '/api/google',
    maxAge: TTL,
  };
  const routeOptions = {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    logLevel: 'silent' as const,
  };

  const fail = (reply: FastifyReply, status: number, message: string) =>
    reply.code(status).send({ error: { message } });
  async function sessionFor(request: FastifyRequest) {
    const token = request.cookies[COOKIE];
    if (!token || !/^[a-f0-9]{64}$/.test(token) || !storage) return null;
    const id = `session-${fingerprint(token)}`;
    const data = await storage.get<GoogleSession>(id);
    return data && data.expires > Date.now() ? { id, data } : null;
  }
  async function protect(request: FastifyRequest, reply: FastifyReply) {
    if (!settings || !storage || !sync) {
      fail(reply, 503, 'La conexión con Google todavía no está configurada.');
      return null;
    }
    const session = await sessionFor(request);
    if (
      !session ||
      request.headers.origin !== settings.origin ||
      request.headers['x-cronia-csrf'] !== session.data.csrf
    ) {
      fail(reply, 403, 'La sesión cambió. Recarga Cronia para continuar.');
      return null;
    }
    return session;
  }
  const publicAccount = (account: GoogleAccount) => ({
    email: account.email,
    revision: account.revision,
    syncedRevision: account.syncedRevision,
    lastSynced: account.lastSynced,
    error: account.error,
    reconnect: !!account.reconnect,
    pending: !!account.desired && account.revision !== account.syncedRevision,
    active: !!account.desired,
    options: account.desired?.options,
    calendarUrl: account.calendarId
      ? `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(account.calendarId)}`
      : undefined,
  });

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/api/google/'))
      reply.header('Cache-Control', 'no-store').header('Referrer-Policy', 'no-referrer');
  });

  app.get('/api/google/status', routeOptions, async (request, reply) => {
    if (!storage) return { configured: false, connected: false };
    let session = await sessionFor(request);
    if (!session) {
      const token = random();
      session = {
        id: `session-${fingerprint(token)}`,
        data: { csrf: random(), expires: Date.now() + TTL * 1000 },
      };
      await storage.set(session.id, session.data);
      reply.setCookie(COOKIE, token, cookies);
    }
    const account = session.data.account
      ? await storage.get<GoogleAccount>(session.data.account)
      : null;
    return {
      configured: true,
      connected: !!account?.credentials.refresh_token,
      csrf: session.data.csrf,
      ...(account?.credentials.refresh_token
        ? { accountId: session.data.account, ...publicAccount(account) }
        : {}),
    };
  });

  app.post('/api/google/connect', routeOptions, async (request, reply) => {
    const session = await protect(request, reply);
    if (!session || !storage || !sync) return;
    return storage.locked(session.id, async () => {
      const current = await storage.get<GoogleSession>(session.id);
      if (!current) return fail(reply, 401, 'La sesión venció. Recarga la página.');
      const verifier = randomBytes(48).toString('base64url');
      const state = random();
      current.oauth = { verifier, state, expires: Date.now() + 10 * 60_000 };
      await storage.set(session.id, current);
      return {
        url: sync.provider.authorization(
          state,
          createHash('sha256').update(verifier).digest('base64url'),
        ),
      };
    });
  });

  app.get('/api/google/callback', routeOptions, async (request, reply) => {
    if (!settings || !storage || !sync) return fail(reply, 503, 'Google no está configurado.');
    const redirect = (result: string) => reply.redirect(`${settings.origin}/?google=${result}`);
    const session = await sessionFor(request);
    if (!session) return redirect('expired');
    const query = z
      .object({
        state: z.string().max(100),
        code: z.string().max(4096).optional(),
        error: z.string().max(200).optional(),
      })
      .safeParse(request.query);
    if (!query.success) return redirect('failed');
    return storage.locked(session.id, async () => {
      const current = await storage.get<GoogleSession>(session.id);
      const pending = current?.oauth;
      if (
        !current ||
        !pending ||
        pending.expires < Date.now() ||
        pending.state !== query.data.state
      )
        return redirect('expired');
      delete current.oauth;
      await storage.set(session.id, current); // Estado de un solo uso, incluso si Google falla.
      if (query.data.error || !query.data.code) return redirect('denied');
      try {
        const identity = await sync.provider.exchange(query.data.code, pending.verifier);
        const accountId = `account-${fingerprint(identity.subject)}`;
        await storage.locked(accountId, async () => {
          const account = (await storage.get<GoogleAccount>(accountId)) ?? {
            email: identity.email,
            credentials: {},
            revision: 0,
            syncedRevision: 0,
            events: {},
            calendarMarker: `Calendario administrado por Cronia. Referencia: ${random()}`,
          };
          account.credentials = identity.credentials;
          account.email = identity.email;
          account.reconnect = false;
          account.error = undefined;
          account.nextAttempt = undefined;
          await storage.set(accountId, account);
        });
        const token = random();
        await storage.set(`session-${fingerprint(token)}`, {
          expires: Date.now() + TTL * 1000,
          csrf: random(),
          account: accountId,
        } satisfies GoogleSession);
        await storage.remove(session.id);
        reply.setCookie(COOKIE, token, cookies);
        return redirect('connected');
      } catch {
        return redirect('failed');
      }
    });
  });

  app.post(
    '/api/google/sync',
    { ...routeOptions, bodyLimit: 512 * 1024 },
    async (request, reply) => {
      const session = await protect(request, reply);
      if (!session || !storage || !sync) return;
      const accountId = session.data.account;
      if (!accountId) return fail(reply, 401, 'Conecta tu cuenta de Google.');
      const input = syncSchema.safeParse(request.body);
      if (!input.success) return fail(reply, 400, 'Revisa las fechas y los datos de las materias.');
      const { courses, options, revision } = input.data;
      if (
        new Set(courses.map((course) => course.id)).size !== courses.length ||
        courses.reduce((sum, course) => sum + course.sessions.length, 0) > 500
      )
        return fail(reply, 400, 'El horario contiene materias duplicadas o demasiadas sesiones.');
      let desired: GoogleAccount['desired'];
      try {
        desired = {
          options,
          series: calendarSeries(
            courses.map((course) => ({ ...course, color: null })) as Course[],
            options,
          ),
        };
      } catch (error) {
        return fail(reply, 400, error instanceof Error ? error.message : 'Horario inválido.');
      }
      sync.interrupt(accountId);
      const result = await storage.locked(accountId, async () => {
        const account = await storage.get<GoogleAccount>(accountId);
        if (!account?.credentials.refresh_token || account.reconnect)
          return fail(reply, 401, 'Vuelve a conectar tu cuenta de Google.');
        if (revision !== account.revision)
          return fail(
            reply,
            409,
            'El horario se modificó desde otra pestaña o dispositivo. Revisa el horario y pulsa Reanudar para enviar esta versión.',
          );
        if (fingerprint(desired) !== fingerprint(account.desired)) {
          account.desired = desired;
          account.revision++;
        }
        account.nextAttempt = undefined;
        await storage.set(accountId, account);
        return publicAccount(account);
      });
      if (reply.sent) return;
      const job = sync
        .run(accountId)
        .catch(() => app.log.error('No se pudo guardar la sincronización de Google.'));
      jobs.add(job);
      void job.finally(() => jobs.delete(job));
      return result;
    },
  );

  app.post('/api/google/pause', routeOptions, async (request, reply) => {
    const session = await protect(request, reply);
    if (!session || !storage) return;
    if (session.data.account) sync?.interrupt(session.data.account);
    if (session.data.account)
      await storage.locked(session.data.account, async () => {
        const account = await storage.get<GoogleAccount>(session.data.account!);
        if (!account) return;
        account.desired = undefined;
        account.revision++;
        account.error = undefined;
        await storage.set(session.data.account!, account);
      });
    return { ok: true };
  });

  app.post('/api/google/disconnect', routeOptions, async (request, reply) => {
    const session = await protect(request, reply);
    if (!session || !storage || !sync) return;
    if (session.data.account) sync.interrupt(session.data.account);
    let revoked = true;
    if (session.data.account)
      await storage.locked(session.data.account, async () => {
        const account = await storage.get<GoogleAccount>(session.data.account!);
        if (!account) return;
        try {
          await sync.provider.revoke(account);
        } catch {
          revoked = false;
        }
        account.credentials = {};
        account.desired = undefined;
        account.revision++;
        account.error = undefined;
        await storage.set(session.data.account!, account);
      });
    await storage.remove(session.id);
    reply.clearCookie(COOKIE, cookies);
    return { ok: true, revoked };
  });

  if (sync) {
    let running: Promise<void> | undefined;
    const tick = () => {
      if (!running)
        running = sync
          .retryPending()
          .catch(() => app.log.error('No se pudo procesar la cola de Google.'))
          .finally(() => {
            running = undefined;
          });
    };
    const timer = setInterval(tick, 30_000);
    timer.unref();
    app.addHook('onClose', async () => {
      clearInterval(timer);
      await running;
      await Promise.all(jobs);
    });
    tick();
  }
}
