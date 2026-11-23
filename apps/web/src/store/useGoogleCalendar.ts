import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  csrf?: string;
  accountId?: string;
  email?: string;
  revision?: number;
  syncedRevision?: number;
  lastSynced?: string;
  pending?: boolean;
  active?: boolean;
  error?: string;
  reconnect?: boolean;
  calendarUrl?: string;
}
interface GoogleState {
  startDate: string;
  endDate: string;
  timeZone: string;
  enabled: boolean;
  accountId: string;
  revision: number;
  lastSubmitted: string;
  status: GoogleStatus | null;
  message: string;
  busy: boolean;
  patch: (value: Partial<Omit<GoogleState, 'patch'>>) => void;
}
export const useGoogleCalendar = create<GoogleState>()(
  persist(
    (set) => ({
      startDate: '',
      endDate: '',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Merida',
      enabled: false,
      accountId: '',
      revision: 0,
      lastSubmitted: '',
      status: null,
      message: '',
      busy: false,
      patch: (value) => set(value),
    }),
    {
      name: 'cronia-google',
      storage: createJSONStorage(() => localStorage),
      partialize: ({
        startDate,
        endDate,
        timeZone,
        enabled,
        accountId,
        revision,
        lastSubmitted,
      }) => ({ startDate, endDate, timeZone, enabled, accountId, revision, lastSubmitted }),
    },
  ),
);
