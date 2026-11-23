import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TabKey } from '../../store/types.js';
import { isPagesDemo } from '../../preview.js';
import { formText, managementError, managementRequest } from './api.js';
import { answerChat, chatTopics, type ChatAnswer } from './chatAnswers.js';

interface Message {
  id: number;
  author: 'assistant' | 'visitor';
  answer: ChatAnswer;
}

export function ChatWidget({ onNavigate }: { onNavigate: (tab: TabKey) => void }) {
  const [open, setOpen] = useState(false);
  const [supportAvailable, setSupportAvailable] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, author: 'assistant', answer: { text: 'Hola. ¿En qué te ayudo con tu horario?' } },
  ]);
  const nextMessage = useRef(1);
  const supportAttempt = useRef<{ payload: string; id: string } | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const questionInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    questionInput.current?.focus();
    const controller = new AbortController();
    void managementRequest<{ supportAvailable: boolean }>('status', { signal: controller.signal })
      .then((status) => setSupportAvailable(status.supportAvailable))
      .catch(() => {});
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, messages]);

  function close() {
    setOpen(false);
    trigger.current?.focus();
  }

  function ask(text: string) {
    const trimmed = text.trim();
    if (!trimmed) return;
    const visitor: Message = { id: nextMessage.current++, author: 'visitor', answer: { text: trimmed } };
    const assistant: Message = { id: nextMessage.current++, author: 'assistant', answer: answerChat(trimmed) };
    setMessages((current) => [...current.slice(-38), visitor, assistant]);
    setQuestion('');
  }

  async function submitSupport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const fields = new FormData(event.currentTarget);
    const contact = {
      name: formText(fields, 'name'),
      email: formText(fields, 'email'),
      message: formText(fields, 'message'),
    };
    const payload = JSON.stringify(contact);
    if (supportAttempt.current?.payload !== payload) {
      supportAttempt.current = { payload, id: crypto.randomUUID() };
    }
    setBusy(true);
    setError('');
    try {
      const { id } = await managementRequest<{ id: string }>('support', {
        body: { id: supportAttempt.current.id, ...contact },
      });
      supportAttempt.current = null;
      const confirmation: Message = {
        id: nextMessage.current++,
        author: 'assistant',
        answer: { text: `Recibimos tu consulta. Guarda este folio para darle seguimiento: ${id}.` },
      };
      setMessages((current) => [...current.slice(-39), confirmation]);
      setSupportOpen(false);
      questionInput.current?.focus();
    } catch (failure) {
      setError(managementError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cronia-chat" onKeyDown={(event) => {
      if (event.key === 'Escape' && open) close();
    }}>
      {open && (
        <section id="cronia-chat-panel" className="cronia-chat-panel" aria-labelledby="cronia-chat-title">
          <header>
            <h2 id="cronia-chat-title">Asistente de Crónia</h2>
            <button type="button" className="btn" onClick={close}>Cerrar</button>
          </header>
          <div className="chat-log" role="log" aria-label="Conversación" ref={log}>
            {messages.map(({ id, author, answer }) => (
              <div className={`chat-message chat-message-${author}`} key={id}>
                <p>{answer.text}</p>
                {answer.action && (
                  <button type="button" className="btn" onClick={() => {
                    const tab = answer.action!.tab;
                    onNavigate(tab);
                    setOpen(false);
                    document.getElementById(`tab-${tab}`)?.focus();
                  }}>{answer.action.label}</button>
                )}
              </div>
            ))}
          </div>
          {messages.length === 1 && (
            <div className="chat-topics">
              {chatTopics.map((topic) => <button type="button" className="btn" key={topic} onClick={() => ask(topic)}>{topic}</button>)}
            </div>
          )}
          <form className="chat-question" onSubmit={(event) => { event.preventDefault(); ask(question); }}>
            <input ref={questionInput} aria-label="Tu pregunta" placeholder="Escribe tu pregunta" maxLength={300} value={question} onChange={(event) => setQuestion(event.target.value)} />
            <button type="submit" className="btn primary" disabled={!question.trim()}>Enviar</button>
          </form>
          {supportAvailable && (
            <div className="chat-support">
              <button className="btn" type="button" aria-expanded={supportOpen} disabled={busy} onClick={() => setSupportOpen(!supportOpen)}>Contactar al equipo</button>
              {supportOpen && (
                <form className="management-form" onSubmit={(event) => void submitSupport(event)}>
                  <label>Nombre<input name="name" autoComplete="name" required maxLength={100} /></label>
                  <label>Correo<input name="email" type="email" autoComplete="email" required maxLength={160} /></label>
                  <label>Consulta<textarea name="message" rows={2} required maxLength={1200} /></label>
                  <p className="management-muted">{isPagesDemo ? 'Usa datos ficticios. La consulta se guardará en el CRM de demostración de este navegador.' : 'El equipo de Crónia usará estos datos para dar seguimiento a tu consulta.'}</p>
                  {error && <p role="alert" className="management-error">{error}</p>}
                  <button type="submit" className="btn primary" disabled={busy}>{busy ? 'Enviando…' : 'Enviar consulta'}</button>
                </form>
              )}
            </div>
          )}
        </section>
      )}
      <button className="btn primary chat-trigger" ref={trigger} type="button" aria-expanded={open}
        aria-controls={open ? 'cronia-chat-panel' : undefined} onClick={() => open ? close() : setOpen(true)}>
        <span aria-hidden="true">?</span> Ayuda de Crónia
      </button>
    </div>
  );
}
