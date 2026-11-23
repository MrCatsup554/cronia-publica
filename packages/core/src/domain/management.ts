export const contactStatuses = {
  new: 'Nuevo',
  in_progress: 'En seguimiento',
  resolved: 'Resuelto',
} as const;

export type ContactStatus = keyof typeof contactStatuses;

export interface Contact {
  id: string;
  name: string;
  email: string;
  message: string;
  source: 'chat' | 'manual';
  status: ContactStatus;
  note: string;
  createdAt: string;
}

export interface Resource {
  id: string;
  code: string;
  name: string;
  minimum: number;
  quantity: number;
}

export interface Movement {
  id: string;
  resourceId: string;
  direction: 'in' | 'out';
  quantity: number;
  reason: string;
  createdAt: string;
}

export interface Inventory {
  resources: Resource[];
  movements: Movement[];
}
