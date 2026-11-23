import { OAuth2Client, CodeChallengeMethod, type Credentials } from 'google-auth-library';
import type { GoogleAccount, GoogleEvent, GoogleProvider, GoogleSettings } from './types.js';

const API = 'https://www.googleapis.com/calendar/v3';
export const GOOGLE_SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.app.created',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

export function googleErrorStatus(error: unknown): number | undefined {
  return (error as { response?: { status?: number } })?.response?.status;
}

export class LiveGoogleProvider implements GoogleProvider {
  constructor(private settings: GoogleSettings) {}
  private client(credentials?: Credentials): OAuth2Client {
    const client = new OAuth2Client(
      this.settings.clientId,
      this.settings.clientSecret,
      `${this.settings.origin}/api/google/callback`,
    );
    if (credentials) client.setCredentials(credentials);
    return client;
  }
  authorization(state: string, challenge: string): string {
    return this.client().generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent select_account',
      scope: GOOGLE_SCOPES,
      state,
      code_challenge: challenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
  }
  async exchange(code: string, verifier: string) {
    const client = this.client();
    const { tokens } = await client.getToken({ code, codeVerifier: verifier });
    if (
      !tokens.id_token ||
      !tokens.refresh_token ||
      !GOOGLE_SCOPES.slice(2).every((scope) => tokens.scope?.split(' ').includes(scope))
    ) {
      throw new Error('Google no concedió los permisos necesarios.');
    }
    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.settings.clientId,
    });
    const identity = ticket.getPayload();
    if (!identity?.sub || !identity.email || !identity.email_verified)
      throw new Error('No se pudo verificar la cuenta.');
    delete tokens.id_token;
    return { credentials: tokens, subject: identity.sub, email: identity.email };
  }
  private async request<T>(
    account: GoogleAccount,
    path: string,
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    data?: unknown,
  ): Promise<T> {
    const client = this.client(account.credentials);
    try {
      const result = await client.request<T>({
        url: `${API}${path}`,
        method,
        data,
        timeout: 20_000,
        retry: false,
      });
      return result.data;
    } finally {
      // Incluye los access tokens renovados incluso si Calendar devuelve un error.
      account.credentials = { ...account.credentials, ...client.credentials };
    }
  }
  async createCalendar(account: GoogleAccount, beforeCreate: () => Promise<void>): Promise<string> {
    // Recupera una creación cuyo resultado se perdió por un corte de red o reinicio.
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        maxResults: '250',
        fields: 'items(id,description,accessRole),nextPageToken',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const page = await this.request<{
        items?: { id: string; description?: string; accessRole?: string }[];
        nextPageToken?: string;
      }>(account, `/users/me/calendarList?${params}`, 'GET');
      const found = page.items?.find(
        (item) => item.description === account.calendarMarker && item.accessRole === 'owner',
      );
      if (found) return found.id;
      pageToken = page.nextPageToken;
    } while (pageToken);
    if (account.calendarCreating) throw new Error('calendar_creation_uncertain');
    await beforeCreate();
    // Un fallo ambiguo nunca crea otro calendario.
    const result = await this.request<{ id: string }>(account, '/calendars', 'POST', {
      summary: 'Cronia',
      description: account.calendarMarker,
      timeZone: account.desired?.options.timeZone,
    });
    return result.id;
  }
  async putEvent(account: GoogleAccount, event: GoogleEvent, exists: boolean): Promise<void> {
    const base = `/calendars/${encodeURIComponent(account.calendarId!)}/events`;
    const path = `${base}/${event.id}`;
    const patch = () => this.request(account, path, 'PATCH', event);
    if (exists) {
      try {
        await patch();
        return;
      } catch (error) {
        if (googleErrorStatus(error) !== 404) throw error;
      }
    }
    try {
      await this.request(account, base, 'POST', event);
    } catch (error) {
      if (googleErrorStatus(error) !== 409) throw error;
      const existing = await this.request<{ status?: string }>(account, path, 'GET');
      if (existing.status === 'cancelled') throw { response: { status: 410 } };
      await patch();
    }
  }
  async deleteEvent(account: GoogleAccount, id: string): Promise<void> {
    try {
      await this.request(
        account,
        `/calendars/${encodeURIComponent(account.calendarId!)}/events/${id}`,
        'DELETE',
      );
    } catch (error) {
      if (![404, 410].includes(googleErrorStatus(error) ?? 0)) throw error;
    }
  }
  async revoke(account: GoogleAccount): Promise<void> {
    const token = account.credentials.refresh_token || account.credentials.access_token;
    if (!token) return;
    try {
      await this.client().revokeToken(token);
    } catch (error) {
      if (googleErrorStatus(error) !== 400) throw error;
    }
  }
}
