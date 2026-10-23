import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { btnGhost, Loading, LoadError } from '../components/ui';
import { DataFreshness } from '../components/DataFreshness';

type RecordResponse = { data: Record<string, unknown>[] };
type CalendarEvent = { id: string; date: string; title: string; kind: string; barangay: string; status: string };

const COLORS: Record<string, string> = {
  paravet: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100',
  vaccination: 'bg-sky-100 text-sky-900 dark:bg-sky-900 dark:text-sky-100',
  clinic: 'bg-amber-100 text-amber-900 dark:bg-amber-900 dark:text-amber-100',
  followup: 'bg-violet-100 text-violet-900 dark:bg-violet-900 dark:text-violet-100',
};
const EVENT_TYPES = ['paravet', 'vaccination', 'clinic', 'followup'];

function eventDate(record: Record<string, unknown>) {
  const raw = record.date ?? record.startDate ?? record.start_date ?? record.program_date ?? record.eventDate;
  if (typeof raw !== 'string') return '';
  return raw.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? '';
}

function eventKind(record: Record<string, unknown>): string {
  const raw = String(record.type ?? record.kind ?? record.category ?? '').toLowerCase();
  if (EVENT_TYPES.includes(raw)) return raw;
  const name = String(record.program ?? record.title ?? record.name ?? '').toLowerCase();
  return name.includes('follow') ? 'followup' : name.includes('clinic') || name.includes('kapon') ? 'clinic'
    : name.includes('rabies') || name.includes('vaccin') ? 'vaccination' : 'paravet';
}

export function CalendarPage({ embedded = false }: { embedded?: boolean }) {
  const [month, setMonth] = useState(() => new Date());
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const { data, loading: syncing, error, updatedAt, reload } = useApi<RecordResponse>(`/calendar/events?month=${year}-${String(monthIndex + 1).padStart(2, '0')}`, { refreshIntervalMs: 60000 });
  const events: CalendarEvent[] = (data?.data ?? []).map((record) => ({ id: String(record.id ?? ''), date: eventDate(record), title: String(record.title ?? record.name ?? record.program ?? 'App event'), kind: eventKind(record), barangay: String(record.barangay ?? ''), status: String(record.status ?? '') })).filter((event) => event.date);
  const firstDay = new Date(year, monthIndex, 1);
  const offset = firstDay.getDay();
  const dayCount = new Date(year, monthIndex + 1, 0).getDate();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const days = Array.from({ length: Math.ceil((offset + dayCount) / 7) * 7 }, (_, index) => index - offset + 1);
  const monthEvents = useMemo(() => events.filter((event) => event.date.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}`))
    .sort((a, b) => a.date.localeCompare(b.date)), [events, monthIndex, year]);
  const eventByDate = useMemo(() => monthEvents.reduce<Record<string, CalendarEvent[]>>((grouped, event) => {
    (grouped[event.date] ??= []).push(event);
    return grouped;
  }, {}), [monthEvents]);
  const eventLink = (event: CalendarEvent) => event.id ? `/program-day?recordId=${encodeURIComponent(event.id)}` : '/program-day';

  return <div className={embedded ? '' : 'mx-auto max-w-6xl'}>
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h1 className={embedded ? 'text-lg font-semibold' : 'text-2xl font-semibold'}>Calendar</h1>{!embedded && <p className="mt-1 text-sm text-slate-500">Program schedule and field activity by month.</p>}</div>
      <div className="calendar-controls flex flex-wrap items-center gap-2">
        <button className={embedded ? `${btnGhost} px-2 py-1.5` : btnGhost} aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft className="h-4 w-4" /></button>
        <strong className={`${embedded ? 'min-w-28 text-xs' : 'min-w-36'} text-center`}>{month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}</strong>
        <button className={embedded ? `${btnGhost} px-2 py-1.5` : btnGhost} aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight className="h-4 w-4" /></button>
        <button className={embedded ? `${btnGhost} px-2 py-1.5 text-xs` : btnGhost} onClick={() => setMonth(new Date())}><RefreshCw className="h-4 w-4" />Today</button>
      </div>
    </div>

    {syncing && !data && <Loading label="Loading calendar events…" />}
    {error && <div className="mt-4"><LoadError message={`Could not sync app events: ${error.message}`} onRetry={reload} /></div>}

    {data && !error && <>
    <div className={`schedule-section mt-3 rounded-2xl border border-slate-200 bg-white shadow-panel dark:border-slate-700 dark:bg-surface-dark ${embedded ? 'p-3' : 'mt-5 p-4 md:p-5'}`}>
      <div className={`schedule-legend mb-3 flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 ${embedded ? 'text-[10px]' : ''}`}>
        {EVENT_TYPES.map((kind) => <span key={kind} className="inline-flex items-center gap-2 capitalize"><i className={`h-2.5 w-2.5 rounded-full ${kind === 'paravet' ? 'bg-emerald-500' : kind === 'vaccination' ? 'bg-sky-500' : kind === 'clinic' ? 'bg-amber-500' : 'bg-violet-500'}`} />{kind}</span>)}
      </div>
      <div className={embedded ? 'grid' : 'grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]'}>
        <div className="min-w-0">
          <div role="grid" aria-label={`Calendar for ${month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`} className="grid grid-cols-7 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <div role="columnheader" key={day} className="border-b border-r border-slate-200 bg-slate-50 p-2 text-center text-xs font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900">{day}</div>)}
            {days.map((day, index) => {
              const date = day > 0 && day <= dayCount ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
              const dayEvents = date ? eventByDate[date] ?? [] : [];
              return <div role="gridcell" key={index} aria-label={date || undefined}
                className={`${embedded ? 'min-h-14 p-1 sm:min-h-[4.25rem] sm:p-1.5' : 'min-h-20 p-1.5 sm:min-h-24 sm:p-2'} min-w-0 border-b border-r border-slate-100 dark:border-slate-800 ${date ? '' : 'bg-slate-50/60 dark:bg-slate-900/40'} ${date === today ? 'shadow-[inset_0_0_0_2px_theme(colors.emerald.500)]' : ''}`}>
                <span className={`calendar-day-number text-xs ${date === today ? 'font-bold text-emerald-700 dark:text-emerald-300' : 'text-slate-500'}`}>{date ? day : ''}</span>
                {dayEvents.slice(0, embedded ? 2 : 3).map((event) => <Link to={eventLink(event)} key={event.id || `${event.title}-${event.date}`} title={`${event.title}${event.barangay ? ` · ${event.barangay}` : ''} · ${event.status}`}
                  className={`calendar-event mt-1 block truncate rounded px-1 py-0.5 text-[10px] hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 ${COLORS[event.kind]}`}>{event.title}</Link>)}
                {dayEvents.length > 3 && <span className="block px-1 text-[10px] text-slate-500">+{dayEvents.length - 3} more</span>}
              </div>;
            })}
          </div>
        </div>
        <aside aria-label="Programs this month" className={`${embedded ? 'hidden' : ''} min-w-0 border-t border-slate-200 pt-4 dark:border-slate-700 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0`}>
          <h2 className="text-sm font-semibold">Programs this month</h2>
          <p className="mt-1 text-xs text-slate-500">{monthEvents.length} scheduled events</p>
          <ul className="mt-3 space-y-2">
            {monthEvents.slice(0, embedded ? 5 : 8).map((event) => <li key={event.id || `${event.title}-${event.date}`} className={`rounded-lg text-xs ${COLORS[event.kind]}`}>
              <Link to={eventLink(event)} className="block rounded-lg p-2.5 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
              <p className="font-semibold">{event.title}</p>
              <p className="mt-1">{new Date(`${event.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}{event.barangay ? ` · ${event.barangay}` : ''}</p>
              {event.status && <p className="mt-0.5 opacity-80">{event.status}</p>}
              </Link>
            </li>)}
          </ul>
          {!monthEvents.length && <p className="mt-3 text-sm text-slate-500">No programs scheduled this month.</p>}
        </aside>
      </div>
      <div className="calendar-note mt-4 space-y-2"><p className="text-xs text-slate-500">{events.length} app events this month</p><DataFreshness updatedAt={updatedAt} loading={syncing} onRefresh={reload} maxAgeMs={60000} /></div>
    </div>
    </>}
  </div>;
}
