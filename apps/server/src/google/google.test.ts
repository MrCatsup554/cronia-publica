import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarSeries, type Course } from '@cronia/core';
import { googleRoutes } from './routes.js';
import { GoogleStorage } from './storage.js';
import { GoogleSync, fingerprint } from './sync.js';
import type { GoogleAccount, GoogleProvider, GoogleSettings } from './types.js';

const course: Course = {
  id: 'math',
  name: 'Matemáticas',
  teacher: 'Ana',
  code: 'MAT',
  color: null,
  place: 'A',
  sessions: [{ day: 0, start: '08:00', end: '10:00', room: '12' }],
};
const options = {
  title: 'Mi horario',
  startDate: '2026-09-21',
  endDate: '2026-12-18',
  timeZone: 'America/Merida',
};
let directory: string;
let storage: GoogleStorage;
let provider: GoogleProvider;
let settings: GoogleSettings;
const accountId = `account-${fingerprint('subject-one')}`;
const newAccount = (): GoogleAccount => ({
  email: 'test@example.com',
  credentials: { refresh_token: 'secret-refresh-token' },
  calendarMarker: 'Cronia test marker',
  revision: 1,
  syncedRevision: 0,
  events: {},
  desired: { options, series: calendarSeries([course], options) },
});

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'cronia-google-'));
  const tokenKey = randomBytes(32).toString('base64');
  settings = {
    clientId: 'test',
    clientSecret: 'test-secret',
    tokenKey,
    origin: 'http://localhost:5173',
    dataDirectory: directory,
  };
  storage = new GoogleStorage(directory, Buffer.from(tokenKey, 'base64'));
  provider = {
    authorization: vi.fn((state) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`),
    exchange: vi.fn(async () => ({
      credentials: { refresh_token: 'secret-refresh-token' },
      subject: 'subject-one',
      email: 'test@example.com',
    })),
    createCalendar: vi.fn(async (_account, beforeCreate) => {
      await beforeCreate();
      return 'calendar-id';
    }),
    putEvent: vi.fn(async () => {}),
    deleteEvent: vi.fn(async () => {}),
    revoke: vi.fn(async () => {}),
  };
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function account() {
  return (await storage.get<GoogleAccount>(accountId))!;
}

describe('encrypted persistence and synchronization', () => {
  it('encrypts credentials and detects tampering', async () => {
    await storage.set(accountId, newAccount());
    const raw = await readFile(join(directory, `${accountId}.json`), 'utf8');
    expect(raw).not.toContain('secret-refresh-token');
    expect(raw).not.toContain('Matemáticas');
    expect((await account()).credentials.refresh_token).toBe('secret-refresh-token');
    const wrongKey = new GoogleStorage(directory, randomBytes(32));
    await expect(wrongKey.get(accountId)).rejects.toThrow();
  });
  it('creates once, updates existing IDs, and deletes only removed classes', async () => {
    await storage.set(accountId, newAccount());
    const sync = new GoogleSync(storage, provider);
    await sync.run(accountId);
    expect(provider.createCalendar).toHaveBeenCalledTimes(1);
    expect(provider.putEvent).toHaveBeenCalledTimes(1);
    const first = await account();
    const eventId = Object.values(first.events)[0]!.id;
    expect(first.syncedRevision).toBe(1);
    expect(vi.mocked(provider.putEvent).mock.calls[0]![1]).toMatchObject({
      start: { dateTime: '2026-09-21T08:00:00', timeZone: 'America/Merida' },
      recurrence: ['RRULE:FREQ=WEEKLY;COUNT=13'],
    });
    await sync.run(accountId);
    expect(provider.putEvent).toHaveBeenCalledTimes(1);
    first.desired!.series[0]!.summary = 'Álgebra';
    first.revision++;
    await storage.set(accountId, first);
    await sync.run(accountId);
    expect(vi.mocked(provider.putEvent).mock.calls[1]![1].id).toBe(eventId);
    const updated = await account();
    updated.desired!.series = [];
    updated.revision++;
    await storage.set(accountId, updated);
    await sync.run(accountId);
    expect(provider.deleteEvent).toHaveBeenCalledWith(expect.anything(), eventId);
    expect((await account()).events).toEqual({});
  });
  it('reuses the stored event ID after an ambiguous network failure and restart', async () => {
    await storage.set(accountId, newAccount());
    vi.mocked(provider.putEvent).mockRejectedValueOnce(new Error('network lost after insert'));
    await new GoogleSync(storage, provider).run(accountId);
    const pending = await account();
    const pendingId = Object.values(pending.events)[0]!.id;
    expect(pending.syncedRevision).toBe(0);
    expect(pending.error).toContain('reintentará');
    pending.nextAttempt = 0;
    await storage.set(accountId, pending);
    await new GoogleSync(
      new GoogleStorage(directory, Buffer.from(settings.tokenKey, 'base64')),
      provider,
    ).retryPending();
    expect(vi.mocked(provider.putEvent).mock.calls[1]![1].id).toBe(pendingId);
    expect(provider.createCalendar).toHaveBeenCalledTimes(1);
    expect((await account()).syncedRevision).toBe(1);
  });
  it('serializes concurrent work so it cannot duplicate events', async () => {
    await storage.set(accountId, newAccount());
    const sync = new GoogleSync(storage, provider);
    await Promise.all([sync.run(accountId), sync.run(accountId), sync.run(accountId)]);
    expect(provider.createCalendar).toHaveBeenCalledTimes(1);
    expect(provider.putEvent).toHaveBeenCalledTimes(1);
  });
  it('interrupts pending work between requests and resumes without resending completed events', async () => {
    const record = newAccount();
    record.desired!.series.push({ ...record.desired!.series[0]!, key: 'math:1' });
    await storage.set(accountId, record);
    let release!: () => void;
    let entered!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(provider.putEvent).mockImplementationOnce(async () => {
      entered();
      await gate;
    });
    const sync = new GoogleSync(storage, provider);
    const running = sync.run(accountId);
    await started;
    sync.interrupt(accountId);
    release();
    await running;
    expect(provider.putEvent).toHaveBeenCalledTimes(1);
    expect((await account()).syncedRevision).toBe(0);
    await sync.run(accountId);
    expect(provider.putEvent).toHaveBeenCalledTimes(2);
    expect((await account()).syncedRevision).toBe(1);
  });

  it('stops retries after revoked credentials and stores a safe message', async () => {
    await storage.set(accountId, newAccount());
    vi.mocked(provider.putEvent).mockRejectedValue({
      response: { status: 400, data: { error: 'invalid_grant' } },
      token: 'secret',
    });
    const sync = new GoogleSync(storage, provider);
    await sync.run(accountId);
    await sync.run(accountId);
    expect((await account()).reconnect).toBe(true);
    expect((await account()).error).not.toContain('secret');
    expect(provider.putEvent).toHaveBeenCalledTimes(1);
  });
  it('persists creation intent before the external call to recover without duplicates', async () => {
    await storage.set(accountId, newAccount());
    vi.mocked(provider.createCalendar).mockImplementationOnce(async (_account, before) => {
      await before();
      throw new Error('ambiguous timeout');
    });
    const sync = new GoogleSync(storage, provider);
    await sync.run(accountId);
    const pending = await account();
    expect(pending.calendarCreating).toBe(true);
    pending.nextAttempt = 0;
    await storage.set(accountId, pending);
    await sync.run(accountId);
    expect(vi.mocked(provider.createCalendar).mock.calls[1]![0].calendarId).toBe('calendar-id');
    expect((await account()).calendarCreating).toBe(false);
  });
});

describe('Google routes', () => {
  async function setup(configured = true) {
    const app = Fastify();
    await googleRoutes(app, configured ? settings : undefined, provider);
    await app.ready();
    return app;
  }
  async function login(app: Awaited<ReturnType<typeof setup>>) {
    const initial = await app.inject('/api/google/status');
    const cookie = initial.cookies[0]!.name + '=' + initial.cookies[0]!.value;
    const csrf = initial.json().csrf;
    const connected = await app.inject({
      method: 'POST',
      url: '/api/google/connect',
      headers: { cookie, origin: settings.origin, 'x-cronia-csrf': csrf },
      payload: {},
    });
    const state = new URL(connected.json().url).searchParams.get('state');
    const callback = await app.inject({
      url: `/api/google/callback?state=${state}&code=good-code`,
      headers: { cookie },
    });
    const authCookie = callback.cookies[0]!.name + '=' + callback.cookies[0]!.value;
    const result = await app.inject({ url: '/api/google/status', headers: { cookie: authCookie } });
    return { cookie: authCookie, status: result.json(), oldCookie: cookie, state };
  }
  it('works without credentials and advertises unavailability', async () => {
    const app = await setup(false);
    try {
      expect((await app.inject('/api/google/status')).json()).toEqual({
        configured: false,
        connected: false,
      });
    } finally {
      await app.close();
    }
  });
  it('requires CSRF and matching origin; callback is bound to its browser and single-use', async () => {
    const app = await setup();
    try {
      const initial = await app.inject('/api/google/status');
      const cookie = initial.cookies[0]!.name + '=' + initial.cookies[0]!.value;
      expect(initial.cookies[0]!.httpOnly).toBe(true);
      const csrf = initial.json().csrf;
      for (const headers of [
        { cookie },
        { cookie, origin: 'https://evil.test', 'x-cronia-csrf': csrf },
      ]) {
        expect(
          (await app.inject({ method: 'POST', url: '/api/google/connect', headers, payload: {} }))
            .statusCode,
        ).toBe(403);
      }
      const connected = await app.inject({
        method: 'POST',
        url: '/api/google/connect',
        headers: { cookie, origin: settings.origin, 'x-cronia-csrf': csrf },
        payload: {},
      });
      const state = new URL(connected.json().url).searchParams.get('state');
      expect(
        (await app.inject(`/api/google/callback?state=${state}&code=code`)).headers.location,
      ).toContain('expired');
      expect(provider.exchange).not.toHaveBeenCalled();
      await app.inject({
        url: `/api/google/callback?state=${state}&code=code`,
        headers: { cookie },
      });
      await app.inject({
        url: `/api/google/callback?state=${state}&code=code`,
        headers: { cookie },
      });
      expect(provider.exchange).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
  it('rejects stale revisions and invalid input, and pauses/disconnects without deleting classes', async () => {
    const app = await setup();
    try {
      const session = await login(app);
      expect(session.status.connected).toBe(true);
      expect(JSON.stringify(session.status)).not.toContain('secret-refresh-token');
      const headers = {
        cookie: session.cookie,
        origin: settings.origin,
        'x-cronia-csrf': session.status.csrf,
      };
      const invalid = await app.inject({
        method: 'POST',
        url: '/api/google/sync',
        headers,
        payload: { revision: 0, options: { ...options, endDate: 'bad' }, courses: [course] },
      });
      expect(invalid.statusCode).toBe(400);
      const sent = await app.inject({
        method: 'POST',
        url: '/api/google/sync',
        headers,
        payload: { revision: 0, options, courses: [course] },
      });
      expect(sent.statusCode).toBe(200);
      expect(sent.json().revision).toBe(1);
      // Wait through the same account lock before testing subsequent actions.
      await vi.waitFor(async () => expect((await account()).syncedRevision).toBe(1));
      const stale = await app.inject({
        method: 'POST',
        url: '/api/google/sync',
        headers,
        payload: { revision: 0, options, courses: [] },
      });
      expect(stale.statusCode).toBe(409);
      expect(
        (await app.inject({ method: 'POST', url: '/api/google/pause', headers, payload: {} }))
          .statusCode,
      ).toBe(200);
      expect((await account()).desired).toBeUndefined();
      expect(
        (
          await app.inject({ method: 'POST', url: '/api/google/disconnect', headers, payload: {} })
        ).json(),
      ).toEqual({ ok: true, revoked: true });
      expect(provider.revoke).toHaveBeenCalledTimes(1);
      expect(provider.deleteEvent).not.toHaveBeenCalled();
      expect((await account()).credentials).toEqual({});
      expect(
        (
          await app.inject({ url: '/api/google/status', headers: { cookie: session.cookie } })
        ).json().connected,
      ).toBe(false);
    } finally {
      await app.close();
    }
  });
  it('isolates accounts and retains event identities when reconnecting', async () => {
    const app = await setup();
    try {
      const first = await login(app);
      const stored = await account();
      stored.calendarId = 'saved-calendar';
      stored.events = { key: { id: 'saved-id', fingerprint: 'hash' } };
      await storage.set(accountId, stored);
      const second = await login(app);
      expect(second.status.accountId).toBe(first.status.accountId);
      expect((await account()).calendarId).toBe('saved-calendar');
      vi.mocked(provider.exchange).mockResolvedValueOnce({
        credentials: { refresh_token: 'another' },
        subject: 'another-user',
        email: 'other@example.com',
      });
      const other = await login(app);
      expect(other.status.accountId).not.toBe(first.status.accountId);
      expect(other.status.calendarUrl).toBeUndefined();
    } finally {
      await app.close();
    }
  });
});
