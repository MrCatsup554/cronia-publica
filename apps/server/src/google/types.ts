import type { CalendarOptions, CalendarSeries } from '@cronia/core';
import type { Credentials } from 'google-auth-library';

export interface GoogleSettings {
  clientId: string;
  clientSecret: string;
  origin: string;
  tokenKey: string;
  dataDirectory: string;
  redis?: { url: string; token: string };
}
export interface GoogleSession {
  expires: number;
  csrf: string;
  account?: string;
  oauth?: { state: string; verifier: string; expires: number };
}
export interface GoogleAccount {
  email: string;
  credentials: Credentials;
  calendarId?: string;
  calendarMarker: string;
  calendarCreating?: boolean;
  revision: number;
  syncedRevision: number;
  events: Record<string, { id: string; fingerprint: string }>;
  desired?: { options: CalendarOptions; series: CalendarSeries[] };
  lastSynced?: string;
  error?: string;
  reconnect?: boolean;
  nextAttempt?: number;
  failures?: number;
}
export interface GoogleEvent {
  id: string;
  summary: string;
  description: string;
  location: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  recurrence: string[];
  extendedProperties: { private: { cronia: string } };
}
export interface GoogleProvider {
  authorization(state: string, challenge: string): string;
  exchange(
    code: string,
    verifier: string,
  ): Promise<{ credentials: Credentials; subject: string; email: string }>;
  createCalendar(account: GoogleAccount, beforeCreate: () => Promise<void>): Promise<string>;
  putEvent(account: GoogleAccount, event: GoogleEvent, exists: boolean): Promise<void>;
  deleteEvent(account: GoogleAccount, id: string): Promise<void>;
  revoke(account: GoogleAccount): Promise<void>;
}
