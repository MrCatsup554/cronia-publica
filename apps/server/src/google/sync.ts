import { createHash, randomBytes } from 'node:crypto';
import type { GoogleAccount, GoogleEvent, GoogleProvider } from './types.js';
import { GoogleStorage } from './storage.js';
import { googleErrorStatus } from './provider.js';

export const fingerprint = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'undefined')
    .digest('hex');

export class GoogleSync {
  private generations = new Map<string, number>();
  interrupt(id: string): void {
    this.generations.set(id, (this.generations.get(id) ?? 0) + 1);
  }
  constructor(
    readonly storage: GoogleStorage,
    readonly provider: GoogleProvider,
  ) {}

  async run(id: string): Promise<void> {
    const generation = this.generations.get(id) ?? 0;
    const interrupted = () => generation !== (this.generations.get(id) ?? 0);
    await this.storage.locked(id, async () => {
      if (interrupted()) return;
      const account = await this.storage.get<GoogleAccount>(id);
      if (
        !account?.desired ||
        account.reconnect ||
        account.syncedRevision === account.revision ||
        (account.nextAttempt ?? 0) > Date.now()
      )
        return;
      const save = () => this.storage.set(id, account);
      let attemptedCreation = false;
      try {
        if (!account.calendarId) {
          account.calendarId = await this.provider.createCalendar(account, async () => {
            attemptedCreation = true;
            account.calendarCreating = true;
            await save();
          });
          account.calendarCreating = false;
          await save();
        }
        const wanted = new Set<string>();
        for (const series of account.desired.series) {
          if (interrupted()) {
            await save();
            return;
          }
          const key = fingerprint(series.key);
          wanted.add(key);
          const body = {
            summary: series.summary,
            description: series.description,
            location: series.location,
            start: { dateTime: series.start, timeZone: account.desired.options.timeZone },
            end: { dateTime: series.end, timeZone: account.desired.options.timeZone },
            recurrence: [series.recurrence],
            extendedProperties: { private: { cronia: key } },
          };
          const hash = fingerprint(body);
          let entry = account.events[key];
          if (entry?.fingerprint === hash) continue;
          if (!entry) {
            entry = { id: randomBytes(20).toString('hex'), fingerprint: '' };
            account.events[key] = entry;
            await save(); // El ID se guarda ANTES de enviarlo: reintentos sin duplicados.
          }
          const event: GoogleEvent = { id: entry.id, ...body };
          try {
            await this.provider.putEvent(account, event, !!entry.fingerprint);
          } catch (error) {
            if (googleErrorStatus(error) !== 410) throw error;
            entry.id = randomBytes(20).toString('hex');
            entry.fingerprint = '';
            await save();
            await this.provider.putEvent(account, { ...event, id: entry.id }, false);
          }
          entry.fingerprint = hash;
          await save();
        }
        // Sólo elimina IDs creados por esta conexión, jamás eventos ajenos del calendario.
        for (const [key, entry] of Object.entries(account.events)) {
          if (interrupted()) {
            await save();
            return;
          }
          if (wanted.has(key)) continue;
          await this.provider.deleteEvent(account, entry.id);
          delete account.events[key];
          await save();
        }
        account.syncedRevision = account.revision;
        account.lastSynced = new Date().toISOString();
        account.error = undefined;
        account.failures = 0;
        account.nextAttempt = undefined;
      } catch (error) {
        const status = googleErrorStatus(error);
        if (
          attemptedCreation &&
          !account.calendarId &&
          status &&
          status >= 400 &&
          status < 500 &&
          status !== 408
        )
          account.calendarCreating = false;
        const invalidGrant =
          (error as { response?: { data?: { error?: string } } })?.response?.data?.error ===
          'invalid_grant';
        account.reconnect = status === 401 || invalidGrant;
        account.error = account.reconnect
          ? 'La autorización de Google venció o fue revocada. Vuelve a conectar tu cuenta.'
          : error instanceof Error && error.message === 'calendar_creation_uncertain'
            ? 'Google no ha confirmado la creación del calendario. Se reintentará recuperar el mismo calendario sin crear duplicados.'
            : status === 404
              ? 'No se encontró el calendario Cronia. Revisa que no se haya eliminado en Google.'
              : status === 403
                ? 'Google rechazó el acceso. Revisa los permisos de Calendar y la configuración del proyecto.'
                : 'No se pudo completar la sincronización con Google. Se reintentará automáticamente.';
        account.failures = (account.failures ?? 0) + 1;
        account.nextAttempt =
          Date.now() + Math.min(15 * 60_000, 15_000 * 2 ** Math.min(account.failures, 6));
      }
      await save();
    });
  }
  async retryPending(): Promise<void> {
    for (const id of await this.storage.keys('account')) await this.run(id);
    for (const id of await this.storage.keys('session')) {
      await this.storage.locked(id, async () => {
        const session = await this.storage.get<{ expires: number }>(id);
        if (session && session.expires < Date.now()) await this.storage.remove(id);
      });
    }
  }
}
