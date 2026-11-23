import { useEffect, useRef, useState, type FormEvent } from 'react';
import { contactStatuses, type Contact, type Inventory } from '@cronia/core';
import { homePath, isPagesDemo } from '../../preview.js';
import { formText, managementError, managementRequest } from './api.js';

type Section = 'crm' | 'erp';
const timestamp = new Intl.DateTimeFormat('es-MX', { dateStyle: 'short', timeStyle: 'short' });

export function ManagementPage() {
  const [password, setPassword] = useState('');
  const [initialContacts, setInitialContacts] = useState<Contact[]>([]);
  const [section, setSection] = useState<Section>('crm');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const key = isPagesDemo ? 'demo' : formText(new FormData(form), 'password').trim();
    setBusy(true);
    setError('');
    try {
      setInitialContacts(await managementRequest<Contact[]>('admin/crm', { password: key }));
      setPassword(key);
      setSection('crm');
    } catch (failure) {
      setError(managementError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="management-page">
      <header className="management-header">
        <div><a href={homePath}>← Volver al horario</a><h1>Gestión de Crónia</h1></div>
        {password && <button className="btn" type="button" onClick={() => {
          setPassword('');
          setInitialContacts([]);
        }}>Cerrar sesión</button>}
      </header>
      {isPagesDemo && <p className="management-muted">Demostración local. Usa datos ficticios. Los cambios quedan en este navegador.</p>}
      {password ? (
        <>
          <nav className="management-nav" aria-label="Módulos de gestión">
            <button type="button" className={section === 'crm' ? 'btn primary' : 'btn'} aria-pressed={section === 'crm'} onClick={() => setSection('crm')}>CRM · Contactos</button>
            <button type="button" className={section === 'erp' ? 'btn primary' : 'btn'} aria-pressed={section === 'erp'} onClick={() => setSection('erp')}>ERP · Inventario</button>
          </nav>
          {section === 'crm'
            ? <CrmPanel password={password} contacts={initialContacts} onChange={setInitialContacts} />
            : <ErpPanel password={password} />}
        </>
      ) : (
        <section className="management-card management-login">
          <h2>{isPagesDemo ? 'Demostración del CRM y ERP' : 'Acceso del equipo'}</h2>
          <form className="management-form" onSubmit={(event) => void signIn(event)}>
            {!isPagesDemo && <label>Clave de gestión<input autoComplete="current-password" name="password" type="password" maxLength={128} required /></label>}
            {error && <p className="management-error" role="alert">{error}</p>}
            <button className="btn primary" type="submit" disabled={busy}>{busy ? 'Cargando…' : isPagesDemo ? 'Entrar a la demostración' : 'Entrar'}</button>
          </form>
        </section>
      )}
    </main>
  );
}

function useOperation() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ message: string; error: boolean } | null>(null);
  const attempt = useRef<{ payload: string; id: string } | null>(null);

  function requestId(payload: object) {
    const encoded = JSON.stringify(payload);
    if (attempt.current?.payload !== encoded) {
      attempt.current = { payload: encoded, id: crypto.randomUUID() };
    }
    return attempt.current.id;
  }

  async function run(action: () => Promise<void>, success: string) {
    if (busy) return;
    setBusy(true);
    setStatus(null);
    try {
      await action();
      attempt.current = null;
      setStatus({ message: success, error: false });
    } catch (failure) {
      setStatus({ message: managementError(failure), error: true });
    } finally {
      setBusy(false);
    }
  }

  return {
    busy, run, requestId, feedback: status && (
      <p role={status.error ? 'alert' : 'status'} className={status.error ? 'management-error' : 'management-success'}>
        {status.message}
      </p>
    ),
  };
}

function CrmPanel({ password, contacts, onChange }: {
  password: string;
  contacts: Contact[];
  onChange: (contacts: Contact[]) => void;
}) {
  const operation = useOperation();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const visible = contacts.filter((contact) =>
    (!status || contact.status === status) &&
    [contact.id, contact.name, contact.email, contact.message]
      .some((field) => field.toLowerCase().includes(query.trim().toLowerCase())),
  );

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const details = {
      name: formText(fields, 'name'),
      email: formText(fields, 'email'),
      message: formText(fields, 'message'),
    };
    await operation.run(async () => {
      onChange(await managementRequest<Contact[]>('admin/crm', {
        password, body: { ...details, id: operation.requestId(details) },
      }));
      form.reset();
    }, 'Contacto registrado.');
  }

  return (
    <>
      <div className="management-heading"><h2>Contactos y consultas</h2>
        <button type="button" className="btn" disabled={operation.busy} onClick={() => void operation.run(async () => {
          onChange(await managementRequest<Contact[]>('admin/crm', { password }));
        }, 'Contactos actualizados.')}>Actualizar lista</button>
      </div>
      <div className="management-summary">
        {Object.entries(contactStatuses).map(([value, label]) => (
          <div key={value}><strong>{contacts.filter((contact) => contact.status === value).length}</strong> {label}</div>
        ))}
      </div>
      <section className="management-card">
        <h3>Nuevo contacto</h3>
        <form className="management-form management-columns" onSubmit={(event) => void add(event)}>
          <label>Nombre<input name="name" maxLength={100} required /></label>
          <label>Correo<input name="email" type="email" maxLength={160} required /></label>
          <label className="management-wide">Motivo<textarea name="message" rows={2} maxLength={1200} required /></label>
          {operation.feedback && <div className="management-wide">{operation.feedback}</div>}
          <button className="btn primary" type="submit" disabled={operation.busy}>Registrar contacto</button>
        </form>
      </section>
      <section className="management-card">
        <h3>Seguimiento</h3>
        <div className="management-form management-columns">
          <label>Buscar por nombre, correo o folio<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <label>Estado<select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">Todos</option>
            {Object.entries(contactStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
        </div>
        {visible.length === 0 && <p className="management-muted">No hay contactos que mostrar.</p>}
        {visible.map((contact) => <ContactDetails key={contact.id} contact={contact} password={password} onChange={onChange} />)}
      </section>
    </>
  );
}

function ContactDetails({ contact, password, onChange }: {
  contact: Contact;
  password: string;
  onChange: (contacts: Contact[]) => void;
}) {
  const operation = useOperation();

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    await operation.run(async () => {
      onChange(await managementRequest<Contact[]>('admin/crm/update', {
        password,
        body: { id: contact.id, status: formText(fields, 'status'), note: formText(fields, 'note') },
      }));
    }, 'Seguimiento guardado.');
  }

  return (
    <details className="management-contact">
      <summary><strong>{contact.name}</strong><span>{contactStatuses[contact.status]} · {contact.source === 'chat' ? 'Chatbot' : 'Registro manual'}</span></summary>
      <p className="management-muted">{contact.email} · {timestamp.format(new Date(contact.createdAt))}</p>
      <p className="management-folio">Folio <code>{contact.id}</code></p>
      <p className="management-preserve">{contact.message}</p>
      <form className="management-form" key={`${contact.status}-${contact.note}`} onSubmit={(event) => void save(event)}>
        <label>Estado<select name="status" defaultValue={contact.status}>
          {Object.entries(contactStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        <label>Nota interna<textarea name="note" defaultValue={contact.note} rows={2} maxLength={1200} /></label>
        <button className="btn primary" type="submit" disabled={operation.busy}>Guardar seguimiento</button>
      </form>
      {operation.feedback}
    </details>
  );
}

function ErpPanel({ password }: { password: string }) {
  const [inventory, setInventory] = useState<Inventory | null>(null);
  const [resourceId, setResourceId] = useState('');
  const [loaded, setLoaded] = useState(false);
  const resourceOperation = useOperation();
  const movementOperation = useOperation();

  async function refresh() {
    await resourceOperation.run(async () => {
      setInventory(await managementRequest<Inventory>('admin/erp', { password }));
    }, 'Inventario actualizado.');
  }

  useEffect(() => {
    const controller = new AbortController();
    void managementRequest<Inventory>('admin/erp', { password, signal: controller.signal })
      .then((result) => setInventory(result))
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoaded(true);
      });
    return () => controller.abort();
  }, [password]);

  async function registerResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const details = {
      code: formText(fields, 'code'),
      name: formText(fields, 'name'),
      minimum: Number(formText(fields, 'minimum')),
    };
    await resourceOperation.run(async () => {
      const id = resourceOperation.requestId(details);
      setInventory(await managementRequest<Inventory>('admin/erp/resources', {
        password, body: { id, ...details },
      }));
      setResourceId(id);
      form.reset();
    }, 'Recurso registrado.');
  }

  async function registerMovement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const details = {
      resourceId,
      direction: formText(fields, 'direction'),
      quantity: Number(formText(fields, 'quantity')),
      reason: formText(fields, 'reason'),
    };
    await movementOperation.run(async () => {
      setInventory(await managementRequest<Inventory>('admin/erp/movements', {
        password, body: { ...details, id: movementOperation.requestId(details) },
      }));
      form.reset();
    }, 'Movimiento registrado.');
  }

  const resources = inventory?.resources ?? [];
  const busy = resourceOperation.busy || movementOperation.busy;
  const names = new Map(resources.map(({ id, name }) => [id, name]));

  return (
    <>
      <div className="management-heading"><h2>Recursos e inventario</h2>
        <button type="button" className="btn" disabled={busy || !loaded} onClick={() => void refresh()}>Actualizar inventario</button>
      </div>
      {resourceOperation.feedback}
      {!inventory && <p role="status">{loaded ? 'No se pudo cargar el inventario. Intenta actualizarlo.' : 'Cargando inventario…'}</p>}
      {inventory && (
        <>
          <div className="management-summary">
            <div><strong>{resources.length}</strong> Recursos</div>
            <div><strong>{resources.filter(({ quantity, minimum }) => quantity <= minimum).length}</strong> En mínimo o por debajo</div>
            <div><strong>{inventory.movements.length}</strong> Movimientos</div>
          </div>
          <div className="management-columns">
            <section className="management-card">
              <h3>Nuevo recurso</h3>
              <form className="management-form" onSubmit={(event) => void registerResource(event)}>
                <label>Código<input name="code" maxLength={32} required /></label>
                <label>Nombre<input name="name" maxLength={100} required /></label>
                <label>Existencia mínima<input type="number" name="minimum" min={0} max={1000000} step={1} defaultValue={0} required /></label>
                <button className="btn primary" type="submit" disabled={busy}>Registrar recurso</button>
              </form>
            </section>
            <section className="management-card">
              <h3>Entrada o salida</h3>
              <form className="management-form" onSubmit={(event) => void registerMovement(event)}>
                <label>Recurso<select required value={resourceId} onChange={(event) => setResourceId(event.target.value)}>
                  <option value="">Seleccionar recurso</option>
                  {resources.map(({ id, code, name }) => <option value={id} key={id}>{code} · {name}</option>)}
                </select></label>
                <label>Tipo<select name="direction"><option value="in">Entrada</option><option value="out">Salida</option></select></label>
                <label>Cantidad<input type="number" name="quantity" min={1} max={1000000} step={1} required /></label>
                <label>Motivo<input name="reason" maxLength={240} required /></label>
                {movementOperation.feedback}
                <button className="btn primary" type="submit" disabled={busy || resources.length === 0}>Registrar movimiento</button>
              </form>
            </section>
          </div>
          <section className="management-card">
            <h3>Existencias</h3>
            {resources.length === 0 ? <p className="management-muted">Aún no hay recursos registrados.</p> : (
              <div className="management-table" tabIndex={0} role="region" aria-label="Tabla de existencias">
                <table><thead><tr><th scope="col">Código</th><th scope="col">Recurso</th><th scope="col">Existencia</th><th scope="col">Mínimo</th><th scope="col">Estado</th></tr></thead>
                  <tbody>{resources.map(({ id, code, name, quantity, minimum }) => (
                    <tr key={id}><td>{code}</td><th scope="row">{name}</th><td>{quantity}</td><td>{minimum}</td><td>{quantity <= minimum ? 'Existencia baja' : 'Disponible'}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
          <section className="management-card">
            <h3>Historial de movimientos</h3>
            {inventory.movements.length === 0 ? <p className="management-muted">Aún no hay movimientos.</p> : (
              <div className="management-table" tabIndex={0} role="region" aria-label="Tabla de movimientos">
                <table><thead><tr><th scope="col">Fecha</th><th scope="col">Recurso</th><th scope="col">Tipo</th><th scope="col">Cantidad</th><th scope="col">Motivo</th></tr></thead>
                  <tbody>{inventory.movements.map(({ id, resourceId: movedId, direction, quantity, reason, createdAt }) => (
                    <tr key={id}><td>{timestamp.format(new Date(createdAt))}</td><th scope="row">{names.get(movedId)}</th>
                      <td>{direction === 'in' ? 'Entrada' : 'Salida'}</td><td>{quantity}</td><td>{reason}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </>
  );
}
