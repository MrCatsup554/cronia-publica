import type { Contact, Inventory, Movement, Resource } from '@cronia/core';

const storageKey = 'cronia-publica:management:v1';
type DemoState = { contacts: Contact[]; inventory: Inventory };
type ContactInput = Pick<Contact, 'id' | 'name' | 'email' | 'message'>;
type ContactUpdate = Pick<Contact, 'id' | 'status' | 'note'>;

export function demoRequest(path: string, body?: object): unknown {
  if (path === 'status') return { supportAvailable: true };
  const existing = localStorage.getItem(storageKey);
  const state: DemoState = existing
    ? JSON.parse(existing)
    : { contacts: [], inventory: { resources: [], movements: [] } };
  const { contacts, inventory } = state;
  const save = () => localStorage.setItem(storageKey, JSON.stringify(state));
  const createdAt = new Date().toISOString();

  if (!body) {
    if (path === 'admin/crm') return contacts;
    if (path === 'admin/erp') return inventory;
  } else if (path === 'support' || path === 'admin/crm') {
    const { id, name, email, message } = body as ContactInput;
    if (!name.trim() || !message.trim()) throw new Error('Completa el nombre y la consulta.');
    if (!contacts.some((contact) => contact.id === id)) {
      contacts.unshift({
        id, name: name.trim(), email: email.trim().toLowerCase(), message: message.trim(),
        source: path === 'support' ? 'chat' : 'manual', status: 'new', note: '', createdAt,
      });
      save();
    }
    return path === 'support' ? { id } : contacts;
  } else if (path === 'admin/crm/update') {
    const { id, status, note } = body as ContactUpdate;
    const contact = contacts.find((record) => record.id === id);
    if (!contact) throw new Error('No se encontró el contacto.');
    Object.assign(contact, { status, note: note.trim() });
    save();
    return contacts;
  } else if (path === 'admin/erp/resources') {
    const { id, name, code, minimum } = body as Omit<Resource, 'quantity'>;
    const normalized = code.trim().toUpperCase();
    if (!normalized || !name.trim()) throw new Error('Completa el código y el nombre.');
    if (inventory.resources.some((resource) => resource.id === id)) return inventory;
    if (inventory.resources.some((resource) => resource.code === normalized)) {
      throw new Error('El código ya está registrado.');
    }
    inventory.resources.push({ id, name: name.trim(), code: normalized, minimum, quantity: 0 });
    save();
    return inventory;
  } else if (path === 'admin/erp/movements') {
    const movement = body as Omit<Movement, 'createdAt'>;
    if (inventory.movements.some(({ id }) => id === movement.id)) return inventory;
    const resource = inventory.resources.find(({ id }) => id === movement.resourceId);
    if (!resource) throw new Error('No se encontró el recurso.');
    if (!movement.reason.trim()) throw new Error('Escribe el motivo del movimiento.');
    const quantity = resource.quantity + (movement.direction === 'in' ? movement.quantity : -movement.quantity);
    if (quantity < 0) throw new Error('La salida supera las existencias disponibles.');
    if (quantity > 1_000_000) throw new Error('La existencia supera el máximo permitido.');
    resource.quantity = quantity;
    inventory.movements.unshift({ ...movement, reason: movement.reason.trim(), createdAt });
    save();
    return inventory;
  }

  throw new Error('La operación no está disponible en la demostración.');
}
