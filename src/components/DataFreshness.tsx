import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { Spinner, btnGhost } from './ui';

export function DataFreshness({ updatedAt, loading, onRefresh, maxAgeMs = 0 }: { updatedAt: number | null; loading: boolean; onRefresh: () => void; maxAgeMs?: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);
  const stale = updatedAt !== null && maxAgeMs > 0 && now - updatedAt >= maxAgeMs;
  return <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 print:hidden">
    <span>{updatedAt ? <>Last updated <time dateTime={new Date(updatedAt).toISOString()}>{new Date(updatedAt).toLocaleTimeString('en-PH', { timeZone: 'Asia/Manila', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>{stale ? ' · Update needed' : ''}</> : 'Not loaded yet'}</span>
    <button type="button" className={`${btnGhost} px-3 py-1.5 text-xs`} disabled={loading} onClick={onRefresh}>{loading ? <Spinner label="Refreshing…" /> : <><RefreshCw aria-hidden className="h-3.5 w-3.5" />Refresh</>}</button>
  </div>;
}
