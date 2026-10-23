type Result<T> = { data: T; updatedAt: number; reused: boolean };
type Stored = { data: unknown; updatedAt: number; expiresAt: number };
type Flight = { controller: AbortController; users: Set<symbol>; promise: Promise<Result<unknown>> };
type Change = 'write' | 'scope';

export function queryKey(path: string): string {
  const url = new URL(path, 'http://local');
  url.searchParams.delete('refresh');
  url.searchParams.sort();
  return `${url.pathname}${url.searchParams.size ? `?${url.searchParams}` : ''}`;
}

/** Only summaries/reference data may be reused. Detail records and permissions never enter the cache. */
export function summaryLifetime(path: string): number {
  const url = new URL(path, 'http://local');
  if (url.pathname === '/dashboard/counts' || url.pathname === '/barangays' || url.pathname === '/program-outcomes') return 60000;
  if (url.pathname === '/analytics' && (url.searchParams.get('mode') ?? 'summary') === 'summary') return 60000;
  if (url.pathname === '/reports' && url.searchParams.get('mode') === 'options' && url.searchParams.get('compact') === '1' && !url.searchParams.has('kind')) return 60000;
  return 0;
}

export const aborted = () => new DOMException('Request cancelled.', 'AbortError');
export const isAbort = (error: unknown) => error instanceof Error && error.name === 'AbortError';

/** Memory only. All entries and in-flight reads are discarded on account/scope changes and successful writes. */
export class ReadQueries {
  private stored = new Map<string, Stored>();
  private flights = new Map<string, Flight>();
  private listeners = new Set<(change: Change) => void>();
  private scope = 'anonymous';
  generation = 0;

  setScope(scope: string) {
    if (scope !== this.scope) { this.scope = scope; this.invalidate('scope'); }
  }
  invalidate(change: Change = 'write') {
    this.generation++;
    this.stored.clear();
    for (const flight of this.flights.values()) flight.controller.abort();
    this.flights.clear();
    for (const listener of this.listeners) listener(change);
  }
  subscribe(listener: (change: Change) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  read<T>(path: string, load: (signal: AbortSignal) => Promise<{ data: T; updatedAt?: number }>, options: { signal: AbortSignal; force?: boolean } ): Promise<Result<T>> {
    if (options.signal.aborted) return Promise.reject(aborted());
    const key = queryKey(path), lifetime = summaryLifetime(path);
    const cached = this.stored.get(key);
    if (!options.force && cached && cached.expiresAt > Date.now()) return Promise.resolve({ data: cached.data as T, updatedAt: cached.updatedAt, reused: true });
    this.stored.delete(key);
    let flight = this.flights.get(key);
    if (!flight) {
      const controller = new AbortController(), generation = this.generation;
      const created: Flight = { controller, users: new Set(), promise: Promise.resolve({ data: null, updatedAt: 0, reused: false }) };
      created.promise = Promise.resolve().then(() => load(controller.signal)).then(({ data, updatedAt = Date.now() }) => {
        if (controller.signal.aborted || generation !== this.generation) throw aborted();
        if (lifetime && updatedAt + lifetime > Date.now()) {
          this.stored.set(key, { data, updatedAt, expiresAt: updatedAt + lifetime });
          while (this.stored.size > 64) this.stored.delete(this.stored.keys().next().value!);
        }
        return { data, updatedAt, reused: false };
      }).finally(() => { if (this.flights.get(key) === created) this.flights.delete(key); });
      this.flights.set(key, created); flight = created;
    }
    const shared = flight;
    return new Promise<Result<T>>((resolve, reject) => {
      const user = Symbol(); shared.users.add(user);
      const release = () => {
        options.signal.removeEventListener('abort', cancel);
        shared.users.delete(user);
        // A StrictMode re-subscription in the same turn can keep the single request.
        queueMicrotask(() => { if (!shared.users.size && this.flights.get(key) === shared) { this.flights.delete(key); shared.controller.abort(); } });
      };
      const cancel = () => { release(); reject(aborted()); };
      options.signal.addEventListener('abort', cancel, { once: true });
      shared.promise.then((result) => { release(); if (!options.signal.aborted) resolve(result as Result<T>); }, (error) => { release(); reject(error); });
    });
  }
}

export const readQueries = new ReadQueries();
export const authTabId = crypto.randomUUID();
