const TTL = 60000;
type Entry<T> = { value: T; updatedAt: number };
let generation = 0;
const values = new Map<string, Entry<unknown>>();
const pending = new Map<string, Promise<Entry<unknown>>>();

export function invalidateSummaries() { generation++; values.clear(); pending.clear(); }

/** Call only after authentication/feature checks. Never cache detail records, writes, or permission decisions. */
export async function readSummary<T>(key: string, fresh: boolean, load: () => Promise<T>): Promise<Entry<T>> {
  const previous = values.get(key);
  if (!fresh && previous && Date.now() - previous.updatedAt < TTL) return previous as Entry<T>;
  let flight = pending.get(key);
  if (!flight) {
    const startedGeneration = generation;
    const created = Promise.resolve().then(load).then((value) => {
      const entry = { value, updatedAt: Date.now() };
      if (startedGeneration === generation) {
        values.set(key, entry);
        while(values.size > 64) values.delete(values.keys().next().value!);
      }
      return entry;
    }).finally(() => { if (pending.get(key) === created) pending.delete(key); });
    pending.set(key, created); flight = created;
  }
  return flight as Promise<Entry<T>>;
}

export function summaryHeaders(entry: { updatedAt: number }): Record<string, string> {
  return { 'Cache-Control': 'no-store', 'X-Data-Updated-At': new Date(entry.updatedAt).toISOString(), 'X-Data-Age-Ms': String(Math.max(0, Date.now() - entry.updatedAt)) };
}
