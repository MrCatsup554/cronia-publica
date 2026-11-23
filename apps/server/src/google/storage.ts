import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, unlink, readdir } from 'node:fs/promises';
import { join } from 'node:path';

/** Almacenamiento para un único proceso, cifrado en reposo y con escrituras atómicas. */
export class GoogleStorage {
  private locks = new Map<string, Promise<unknown>>();
  constructor(
    private directory: string,
    private key: Buffer,
    private redis?: { url: string; token: string },
  ) {
    if (key.length !== 32) throw new Error('GOOGLE_TOKEN_KEY debe contener 32 bytes en base64.');
  }
  private async command<T>(args: string[]): Promise<T> {
    const response = await fetch(this.redis!.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.redis!.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('No se pudo acceder al almacenamiento persistente.');
    const reply = await response.json() as { result: T; error?: string };
    if (reply.error) throw new Error('Falló la operación de almacenamiento.');
    return reply.result;
  }
  private hash(id: string): string {
    return id.startsWith('session-') ? 'cronia:sessions' : 'cronia:accounts';
  }
  private path(id: string): string {
    if (!/^(account|session)-[a-f0-9]{64}$/.test(id)) throw new Error('Invalid storage key');
    return join(this.directory, `${id}.json`);
  }
  async get<T>(id: string): Promise<T | null> {
    const path = this.path(id);
    let raw: string | null;
    try {
      raw = this.redis
        ? await this.command<string | null>(['HGET', this.hash(id), id])
        : await readFile(path, 'utf8');
      if (raw === null) return null;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const [iv, tag, data] = JSON.parse(raw) as string[];
    const cipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv!, 'base64'));
    cipher.setAAD(Buffer.from(id));
    cipher.setAuthTag(Buffer.from(tag!, 'base64'));
    return JSON.parse(
      Buffer.concat([cipher.update(Buffer.from(data!, 'base64')), cipher.final()]).toString('utf8'),
    ) as T;
  }
  async set(id: string, value: unknown): Promise<void> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const data = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
    const path = this.path(id);
    const encoded = JSON.stringify([iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')]);
    if (this.redis) {
      await this.command(['HSET', this.hash(id), id, encoded]);
      return;
    }
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = `${path}.${randomBytes(8).toString('hex')}.tmp`;
    await writeFile(temporary, encoded, { mode: 0o600 });
    await rename(temporary, path);
  }
  async remove(id: string): Promise<void> {
    const path = this.path(id);
    if (this.redis) {
      await this.command(['HDEL', this.hash(id), id]);
      return;
    }
    await unlink(path).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    });
  }
  async keys(prefix: 'account' | 'session'): Promise<string[]> {
    if (this.redis) return this.command<string[]>(['HKEYS', this.hash(prefix + '-')]);
    const entries = await readdir(this.directory).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return entries
      .filter((name) => new RegExp(`^${prefix}-[a-f0-9]{64}\\.json$`).test(name))
      .map((name) => name.slice(0, -5));
  }
  async locked<T>(id: string, action: () => Promise<T>): Promise<T> {
    const previous = this.locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(action);
    this.locks.set(id, next);
    try {
      return await next;
    } finally {
      if (this.locks.get(id) === next) this.locks.delete(id);
    }
  }
}
