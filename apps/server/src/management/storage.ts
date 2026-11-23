import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ApiError } from '../errors.js';

type Redis = { url: string; token: string };

const compareAndSet = [
  "local current = redis.call('GET', KEYS[1]) or ''",
  'if current ~= ARGV[1] then return 0 end',
  "redis.call('SET', KEYS[1], ARGV[2])",
  'return 1',
].join('\n');

export class ManagementStorage<T> {
  private pending = Promise.resolve();

  constructor(
    private readonly name: 'crm' | 'erp',
    private readonly empty: () => T,
    private readonly directory: string,
    private readonly redis?: Redis,
  ) {}

  private async command<R>(args: string[]): Promise<R> {
    const response = await fetch(this.redis!.url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.redis!.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('El almacenamiento de gestión no está disponible.');
    const reply = (await response.json()) as { result: R; error?: string };
    if (reply.error) throw new Error('Falló una operación de gestión.');
    return reply.result;
  }

  private get key() {
    return `cronia:management:v1:${this.name}`;
  }

  private get path() {
    return join(this.directory, `${this.name}.json`);
  }

  private async read() {
    if (this.redis) return this.command<string | null>(['GET', this.key]);
    return readFile(this.path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
  }

  private decode(raw: string | null): T {
    return raw === null ? this.empty() : (JSON.parse(raw) as T);
  }

  async get(): Promise<T> {
    return this.decode(await this.read());
  }

  private async updateRemote(change: (state: T) => void): Promise<T> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const raw = await this.read();
      const state = this.decode(raw);
      change(state);
      const saved = await this.command<number>([
        'EVAL', compareAndSet, '1', this.key, raw ?? '', JSON.stringify(state),
      ]);
      if (saved === 1) return state;
    }
    throw new ApiError('peticion_invalida', 'Hay cambios simultáneos. Inténtalo otra vez.', 409);
  }

  async update(change: (state: T) => void): Promise<T> {
    if (this.redis) return this.updateRemote(change);
    const operation = this.pending.then(async () => {
      const state = await this.get();
      change(state);
      await mkdir(this.directory, { recursive: true, mode: 0o700 });
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      try {
        await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
        await rename(temporary, this.path);
      } catch (error) {
        await rm(temporary, { force: true }).catch(() => {});
        throw error;
      }
      return state;
    });
    this.pending = operation.then(() => {}, () => {});
    return operation;
  }
}
