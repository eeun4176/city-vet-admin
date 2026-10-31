import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';

// A quiet "Last updated" line; its small refresh icon reloads only this section (the header button reloads every page).
export function DataFreshness({ updatedAt, loading, onRefresh, maxAgeMs = 0 }: { updatedAt: number | null; loading: boolean; onRefresh: () => void; maxAgeMs?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const stale = updatedAt !== null && maxAgeMs > 0 && now - updatedAt >= maxAgeMs;
  return <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-night-muted print:hidden">
    <span>{updatedAt ? <>Last updated <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit' })}</time>{stale ? ' · Update needed' : ''}</> : 'Not loaded yet'}</span>
    <button type="button" aria-label={loading ? 'Refreshing…' : 'Refresh this section'} title="Refresh this section" disabled={loading} onClick={onRefresh} className="grid h-7 w-7 place-items-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60 dark:hover:bg-night-tile dark:hover:text-night-text">
      <RefreshCw aria-hidden className={`h-3.5 w-3.5 ${loading ? 'motion-safe:animate-spin' : ''}`} />
    </button>
  </div>;
}
