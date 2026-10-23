import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { isAbort, queryKey, readQueries, summaryLifetime } from './readQueries';
import { visibleRefresh } from './visibleRefresh';

/** Keeps controlled search input responsive while delaying dependent requests until typing pauses. */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);
  return debounced;
}

type State<T> = { key: string; generation: number; data: T | null; error: Error | null; loading: boolean; updatedAt: number | null };
type Options<T> = { refreshIntervalMs?: number; refreshWhen?: (data: T | null) => boolean };

/** Shared reads, cancellable searches, and visible-only refresh. Writes always use the authoritative API. */
export function useApi<T>(path: string | null, options: Options<T> = {}) {
  const key = path === null ? '' : queryKey(path);
  const [state, setState] = useState<State<T>>({ key, generation: readQueries.generation, data: null, error: null, loading: path !== null, updatedAt: null });
  const [tick, setTick] = useState(0);
  const force = useRef(false);
  const stateRef = useRef(state); stateRef.current = state;
  const optionsRef = useRef(options); optionsRef.current = options;
  const reload = useCallback(() => { force.current = true; setTick((value) => value + 1); }, []);
  const interval = options.refreshIntervalMs ?? (path ? summaryLifetime(path) : 0);

  useEffect(() => readQueries.subscribe((change) => {
    setState((previous) => ({ ...previous, generation: readQueries.generation, ...(change === 'scope' ? { data: null, updatedAt: null } : {}) }));
    reload();
  }), [reload]);

  useEffect(() => {
    if (path === null) return;
    const controller = new AbortController(), generation = readQueries.generation;
    const bypass = force.current; force.current = false;
    setState((previous) => ({ ...previous, key, generation, error: null, loading: true,
      ...(previous.key !== key || previous.generation !== generation ? { data: null, updatedAt: null } : {}) }));
    readQueries.read<T>(path, async (signal) => {
      let updatedAt: number | undefined;
      const data = await api<T>('GET', path, undefined, { signal, fresh: bypass, onUpdatedAt: (value) => { updatedAt = value; } });
      return { data, updatedAt };
    }, { signal: controller.signal, force: bypass }).then((result) => {
      if (!controller.signal.aborted) setState({ key, generation, data: result.data, loading: false, error: null, updatedAt: result.updatedAt });
    }).catch((error: Error) => {
      if (!controller.signal.aborted && !isAbort(error)) setState((previous) => ({ ...previous, loading: false, error }));
    });
    return () => controller.abort();
  }, [path, key, tick]);

  useEffect(() => {
    if (path === null || !interval) return;
    return visibleRefresh(reload, interval, () => !stateRef.current.loading && (optionsRef.current.refreshWhen?.(stateRef.current.data) ?? true), () => stateRef.current.updatedAt);
  }, [path, interval, reload]);

  useEffect(() => {
    if (path === null || interval) return;
    const check = () => { if (!document.hidden && !stateRef.current.loading && stateRef.current.updatedAt !== null && Date.now() - stateRef.current.updatedAt > 1000) reload(); };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => { document.removeEventListener('visibilitychange', check); window.removeEventListener('focus', check); };
  }, [path, interval, reload]);

  const current = state.key === key && state.generation === readQueries.generation;
  return { data: current ? state.data : null, error: current ? state.error : null, loading: path !== null && (!current || state.loading), updatedAt: current ? state.updatedAt : null, reload };
}
