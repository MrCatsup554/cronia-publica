import { OAuth2Client } from 'google-auth-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LiveGoogleProvider, GOOGLE_SCOPES } from './provider.js';
import type { GoogleAccount, GoogleEvent } from './types.js';

const provider = new LiveGoogleProvider({
  clientId: 'test-client',
  clientSecret: 'secret',
  origin: 'https://cronia.example',
  tokenKey: '',
  dataDirectory: '',
});
const account = (): GoogleAccount => ({
  email: 'user@example.com',
  calendarId: 'calendar',
  calendarMarker: 'unique marker',
  credentials: { refresh_token: 'refresh' },
  events: {},
  revision: 0,
  syncedRevision: 0,
});
const event: GoogleEvent = {
  id: 'abc123',
  summary: 'Math',
  description: '',
  location: '',
  start: { dateTime: '2026-09-21T08:00:00', timeZone: 'America/Merida' },
  end: { dateTime: '2026-09-21T09:00:00', timeZone: 'America/Merida' },
  recurrence: ['RRULE:FREQ=WEEKLY;COUNT=2'],
  extendedProperties: { private: { cronia: 'key' } },
};
afterEach(() => vi.restoreAllMocks());

describe('Google provider', () => {
  it('uses offline consent, narrow permissions and PKCE', () => {
    const url = new URL(provider.authorization('nonce', 'challenge'));
    expect(url.searchParams.get('state')).toBe('nonce');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('redirect_uri')).toBe('https://cronia.example/api/google/callback');
    expect(url.searchParams.get('scope')).not.toContain(
      'https://www.googleapis.com/auth/calendar ',
    );
  });
  it('rejects a partially granted connection before storing tokens', async () => {
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({
      tokens: { id_token: 'id', refresh_token: 'refresh', scope: 'openid email' },
    } as any);
    await expect(provider.exchange('code', 'verifier')).rejects.toThrow('permisos');
  });
  it('verifies Google identity and strips the ID token', async () => {
    const exchange = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockResolvedValue({
        tokens: { id_token: 'id', refresh_token: 'refresh', scope: GOOGLE_SCOPES.join(' ') },
      } as any);
    vi.spyOn(OAuth2Client.prototype, 'verifyIdToken').mockResolvedValue({
      getPayload: () => ({ sub: 'subject', email: 'user@example.com', email_verified: true }),
    } as any);
    const result = await provider.exchange('code', 'verifier');
    expect(exchange).toHaveBeenCalledWith({ code: 'code', codeVerifier: 'verifier' });
    expect(result.subject).toBe('subject');
    expect(result.credentials.id_token).toBeUndefined();
  });
  it('recovers the calendar across paginated results without creating another', async () => {
    const call = vi.spyOn(OAuth2Client.prototype, 'request');
    call.mockResolvedValueOnce({ data: { items: [], nextPageToken: 'page-2' } } as any);
    call.mockResolvedValueOnce({
      data: { items: [{ id: 'recovered', description: 'unique marker', accessRole: 'owner' }] },
    } as any);
    const before = vi.fn();
    expect(await provider.createCalendar({ ...account(), calendarCreating: true }, before)).toBe(
      'recovered',
    );
    expect(before).not.toHaveBeenCalled();
    expect(call.mock.calls[1]![0].url).toContain('pageToken=page-2');
  });
  it('does not repeat a calendar creation with an uncertain outcome', async () => {
    vi.spyOn(OAuth2Client.prototype, 'request').mockResolvedValue({ data: { items: [] } } as any);
    await expect(
      provider.createCalendar({ ...account(), calendarCreating: true }, vi.fn()),
    ).rejects.toThrow('calendar_creation_uncertain');
  });
  it('resolves event insert conflicts by updating the same ID', async () => {
    const call = vi.spyOn(OAuth2Client.prototype, 'request');
    call.mockRejectedValueOnce({ response: { status: 409 } });
    call.mockResolvedValueOnce({ data: { status: 'confirmed' } } as any);
    call.mockResolvedValueOnce({ data: {} } as any);
    await provider.putEvent(account(), event, false);
    expect(call.mock.calls.map(([input]) => input.method)).toEqual(['POST', 'GET', 'PATCH']);
    expect(call.mock.calls[2]![0].url).toContain('/events/abc123');
  });
  it('reports deleted event tombstones so the queue can allocate a new ID', async () => {
    const call = vi.spyOn(OAuth2Client.prototype, 'request');
    call.mockRejectedValueOnce({ response: { status: 409 } });
    call.mockResolvedValueOnce({ data: { status: 'cancelled' } } as any);
    await expect(provider.putEvent(account(), event, false)).rejects.toMatchObject({
      response: { status: 410 },
    });
  });
  it('tolerates an event already removed from Google', async () => {
    vi.spyOn(OAuth2Client.prototype, 'request').mockRejectedValue({ response: { status: 410 } });
    await expect(provider.deleteEvent(account(), 'abc123')).resolves.toBeUndefined();
  });
});
