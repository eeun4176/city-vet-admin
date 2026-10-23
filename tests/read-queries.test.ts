import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReadQueries, queryKey, summaryLifetime } from '../src/lib/readQueries';

const signal = () => new AbortController().signal;
const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void; const promise = new Promise<T>((yes,no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
afterEach(() => vi.useRealTimers());

describe('memory-only read coordination', () => {
  it('shares identical in-flight reads and keeps one caller cancelling from cancelling another', async () => {
    const queries = new ReadQueries(), gate = deferred<{data:number}>();
    const load = vi.fn(() => gate.promise), first = new AbortController();
    const a = queries.read('/records/owners?page=1', load, {signal:first.signal});
    const b = queries.read('/records/owners?page=1', load, {signal:signal()});
    const rejected = expect(a).rejects.toMatchObject({name:'AbortError'});
    first.abort(); gate.resolve({data:12});
    await rejected; expect((await b).data).toBe(12); expect(load).toHaveBeenCalledTimes(1);
  });
  it('cancels the underlying request when the last view leaves', async () => {
    const queries = new ReadQueries(), controller = new AbortController();
    let underlying!: AbortSignal;
    const waiting = queries.read('/records/pets', (s) => { underlying = s; return new Promise((_,reject) => s.addEventListener('abort',() => reject(new DOMException('stopped','AbortError')))); }, {signal:controller.signal});
    const rejected = expect(waiting).rejects.toMatchObject({name:'AbortError'});
    await Promise.resolve(); controller.abort(); await rejected; await Promise.resolve();
    expect(underlying.aborted).toBe(true);
  });
  it('reuses eligible summaries for 60 seconds and manual refresh bypasses stored results', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-17T00:00:00Z'));
    const queries = new ReadQueries(), load = vi.fn(async () => ({data:42}));
    const first = await queries.read('/dashboard/counts',load,{signal:signal()});
    vi.advanceTimersByTime(59000);
    expect((await queries.read('/dashboard/counts',load,{signal:signal()})).reused).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    await queries.read('/dashboard/counts',load,{signal:signal(),force:true});
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60000);
    const next = await queries.read('/dashboard/counts',load,{signal:signal()});
    expect(next.reused).toBe(false); expect(next.updatedAt).toBeGreaterThan(first.updatedAt);
  });
  it('includes server-side age so two reuse layers cannot double the freshness window', async () => {
    vi.useFakeTimers(); vi.setSystemTime(100000);
    const queries = new ReadQueries(), load = vi.fn(async () => ({data:5,updatedAt:Date.now()-55000}));
    await queries.read('/analytics?year=2026',load,{signal:signal()});
    vi.advanceTimersByTime(5001);
    expect((await queries.read('/analytics?year=2026',load,{signal:signal()})).reused).toBe(false);
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('does not store detail records, permissions, QR lookup, or custom report snapshots', async () => {
    const queries = new ReadQueries();
    for(const path of ['/records/owners','/stub-workflow?mode=lookup&code=secret','/program-workspace?id=1','/admin/controls','/auth/me','/reports?mode=report','/reports?mode=options']) {
      const load = vi.fn(async () => ({data:1}));
      await queries.read(path,load,{signal:signal()}); await queries.read(path,load,{signal:signal()});
      expect(load,path).toHaveBeenCalledTimes(2); expect(summaryLifetime(path)).toBe(0);
    }
  });
  it('isolates account/barangay/permission changes and invalidates summaries after a write', async () => {
    const queries = new ReadQueries(), load = vi.fn(async () => ({data:1}));
    queries.setScope('admin:1'); await queries.read('/dashboard/counts',load,{signal:signal()});
    queries.setScope('paravet:2:barangay3'); await queries.read('/dashboard/counts',load,{signal:signal()});
    queries.invalidate(); await queries.read('/dashboard/counts',load,{signal:signal()});
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('does not store a late response from a previous account or before a write', async () => {
    const queries = new ReadQueries(), gate = deferred<{data:number}>();
    const waiting = queries.read('/dashboard/counts',()=>gate.promise,{signal:signal()});
    const rejected = expect(waiting).rejects.toMatchObject({name:'AbortError'});
    await Promise.resolve(); queries.setScope('another account'); gate.resolve({data:99}); await rejected;
    const fresh = await queries.read('/dashboard/counts',async()=>({data:1}),{signal:signal()});
    expect(fresh.data).toBe(1); expect(fresh.reused).toBe(false);
  });
  it('does not cache failures and keeps different filters separate', async () => {
    const queries = new ReadQueries(), load = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({data:1});
    await expect(queries.read('/analytics?year=2026',load,{signal:signal()})).rejects.toThrow('offline');
    await queries.read('/analytics?year=2026',load,{signal:signal()});
    await queries.read('/analytics?year=2025',load,{signal:signal()}); expect(load).toHaveBeenCalledTimes(3);
    expect(queryKey('/analytics?year=2026&source=live&refresh=2')).toBe(queryKey('/analytics?source=live&year=2026'));
  });
});
