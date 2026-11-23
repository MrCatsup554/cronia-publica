import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let api: typeof import('./google.js');
let google: typeof import('../store/useGoogleCalendar.js').useGoogleCalendar;
let schedule: typeof import('../store/useSchedule.js').useSchedule;
const status = {
  configured: true,
  connected: true,
  csrf: 'csrf',
  accountId: 'account',
  revision: 0,
  syncedRevision: 0,
  email: 'user@example.com',
};
const json = (body: unknown, code = 200) =>
  new Response(JSON.stringify(body), {
    status: code,
    headers: { 'content-type': 'application/json' },
  });
const fetchMock = vi.fn<typeof fetch>();

beforeAll(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  api = await import('./google.js');
  google = (await import('../store/useGoogleCalendar.js')).useGoogleCalendar;
  schedule = (await import('../store/useSchedule.js')).useSchedule;
});
beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  google.setState({
    enabled: true,
    accountId: 'account',
    revision: 0,
    lastSubmitted: '',
    status,
    message: '',
    busy: false,
    startDate: '2026-09-21',
    endDate: '2026-12-18',
    timeZone: 'America/Merida',
  });
  schedule.getState().loadSample();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('automatic Google sync client', () => {
  it('sends the desired schedule with CSRF and revision, without Google tokens', async () => {
    fetchMock.mockResolvedValue(json({ revision: 1, pending: true }));
    await api.sendGoogleChanges();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/google/sync');
    expect(init?.headers).toMatchObject({ 'X-Cronia-CSRF': 'csrf' });
    expect(JSON.parse(init?.body as string).revision).toBe(0);
    expect(google.getState().revision).toBe(1);
    await api.sendGoogleChanges();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('sends updates and deletions, but ignores color changes', async () => {
    fetchMock.mockImplementation(async () => json({ revision: google.getState().revision + 1 }));
    await api.sendGoogleChanges();
    const first = schedule.getState().courses[0]!;
    schedule.getState().updateCourse(first.id, { color: '#ffffff' });
    await api.sendGoogleChanges();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    schedule.getState().updateCourse(first.id, { name: 'Changed' });
    await api.sendGoogleChanges();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    schedule.getState().clearAll();
    await api.sendGoogleChanges();
    expect(JSON.parse(fetchMock.mock.calls[2]![1]!.body as string).courses).toEqual([]);
  });
  it('keeps edits pending after network failure and retries', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('offline'));
    await api.sendGoogleChanges();
    expect(google.getState().enabled).toBe(true);
    expect(google.getState().lastSubmitted).toBe('');
    fetchMock.mockResolvedValueOnce(json({ revision: 1 }));
    await api.sendGoogleChanges();
    expect(google.getState().message).toBe('');
    expect(google.getState().lastSubmitted).not.toBe('');
  });
  it('stops on a revision conflict instead of overwriting another device', async () => {
    fetchMock.mockResolvedValue(json({ error: { message: 'Conflicto' } }, 409));
    await api.sendGoogleChanges();
    expect(google.getState().enabled).toBe(false);
    await api.sendGoogleChanges();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('validates incomplete edits before contacting the server', async () => {
    google.setState({ endDate: '' });
    await api.sendGoogleChanges();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(google.getState().message).toContain('fechas');
  });
  it('does not send until explicitly enabled or to a different connected account', async () => {
    google.setState({ enabled: false });
    await api.sendGoogleChanges();
    google.setState({ enabled: true, accountId: 'another-account' });
    await api.sendGoogleChanges();
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('detects a changed server revision on refresh', async () => {
    fetchMock.mockResolvedValue(json({ ...status, revision: 3 }));
    await api.refreshGoogle();
    expect(google.getState().enabled).toBe(false);
    expect(google.getState().message).toContain('otra pestaña');
  });
});
