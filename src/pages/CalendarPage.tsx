import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useApi } from '../lib/useApi';
import { btnGhost, Loading, LoadError } from '../components/ui';
import { DataFreshness } from '../components/DataFreshness';

type RecordResponse = { data: Record<string, unknown>[] };
type CalendarEvent = { id: string; date: string; title: string; kind: string; barangay: string; status: string };

const COLORS: Record<string, string> = {
  paravet: 'bg-brand-500 text-white',
  vaccination: 'bg-sky-100 text-sky-900 ring-1 ring-inset ring-sky-200 dark:bg-sky-950 dark:text-sky-100 dark:ring-sky-900',
  clinic: 'bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-200 dark:bg-amber-950 dark:text-amber-100 dark:ring-amber-900',
  followup: 'bg-violet-100 text-violet-900 ring-1 ring-inset ring-violet-200 dark:bg-violet-950 dark:text-violet-100 dark:ring-violet-900',
};
const DOTS: Record<string, string> = { paravet: 'bg-brand-500', vaccination: 'bg-sky-500', clinic: 'bg-amber-500', followup: 'bg-violet-500' };
const calIcon = 'grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:text-slate-300 dark:hover:bg-slate-800';
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

  const monthLabel = month.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  const todayEvents = monthEvents.filter((event) => event.date === today);

  // Month calendar (e-Vet look): a rounded grid card, day numbers in circles (today filled green), event chips; on phones chips become thin bars.
  return <div className={embedded ? '' : 'w-full'}>
    <div className="flex flex-wrap items-center gap-2">
      <h1 className={`${embedded ? 'text-lg' : 'text-[26px] leading-tight'} mr-1 min-w-0 font-semibold tracking-tight sm:min-w-[13rem]`}>{monthLabel}</h1>
      <div className="flex gap-0.5">
        <button type="button" className={calIcon} aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><ChevronLeft aria-hidden className="h-[18px] w-[18px]" /></button>
        <button type="button" className={calIcon} aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><ChevronRight aria-hidden className="h-[18px] w-[18px]" /></button>
      </div>
      <button type="button" className={`${btnGhost} py-1.5`} onClick={() => setMonth(new Date())}>Today</button>
      <span className="flex-1" />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
        {EVENT_TYPES.map((kind) => <span key={kind} className="inline-flex items-center gap-1.5 capitalize"><i className={`h-2.5 w-2.5 rounded-[4px] ${DOTS[kind]}`} />{kind}</span>)}
      </div>
    </div>
    {!embedded && <p className="mt-1 text-sm text-slate-500">Program schedule and field activity by month.</p>}

    {syncing && !data && <div className="mt-5"><Loading label="Loading calendar events…" /></div>}
    {error && <div className="mt-4"><LoadError message={`Could not sync app events: ${error.message}`} onRetry={reload} /></div>}

    {data && !error && <div className={`mt-5 grid gap-5 ${embedded ? '' : 'lg:grid-cols-[minmax(0,1fr)_16rem]'}`}>
      <div className="min-w-0">
        <div aria-hidden className="grid grid-cols-7 pb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span key={day} className="text-center sm:pl-2.5 sm:text-left">{day}</span>)}
        </div>
        <div role="grid" aria-label={`Calendar for ${monthLabel}`} className="grid grid-cols-7 overflow-hidden rounded-2xl bg-white shadow-panel ring-1 ring-inset ring-slate-200 dark:bg-surface-dark dark:ring-slate-800">
          {days.map((day, index) => {
            const inMonth = day > 0 && day <= dayCount;
            const date = inMonth ? `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : '';
            const dayEvents = date ? eventByDate[date] ?? [] : [];
            return <div role="gridcell" key={index} aria-label={date ? `${date}${dayEvents.length ? `, ${dayEvents.length} events` : ''}` : undefined}
              className={`${embedded ? 'min-h-14' : 'min-h-[4.5rem] sm:min-h-[6.5rem]'} flex min-w-0 flex-col items-center gap-1 border-b border-r border-slate-200 px-0.5 pb-1 pt-1.5 dark:border-slate-800 sm:items-stretch sm:px-1.5 ${index % 7 === 6 ? 'border-r-0' : ''} ${index >= days.length - 7 ? 'border-b-0' : ''} ${inMonth ? '' : 'bg-slate-50/70 dark:bg-white/[0.02]'}`}>
              <span className={`grid h-[26px] min-w-[26px] place-items-center self-center rounded-full px-1 text-[13px] font-semibold tabular-nums sm:self-start ${date === today ? 'bg-brand-500 text-white' : inMonth ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'}`}>{new Date(year, monthIndex, day).getDate()}</span>
              <div className="flex w-full min-w-0 flex-col gap-[3px]">
                {dayEvents.slice(0, embedded ? 2 : 3).map((event) => <Link to={eventLink(event)} key={event.id || `${event.title}-${event.date}`} title={`${event.title}${event.barangay ? ` · ${event.barangay}` : ''} · ${event.status}`}
                  className={`block h-[5px] truncate rounded-[3px] text-[0px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-500 sm:h-[22px] sm:rounded-[7px] sm:px-1.5 sm:text-xs sm:font-semibold sm:leading-[22px] ${COLORS[event.kind]}`}>{event.title}</Link>)}
                {dayEvents.length > (embedded ? 2 : 3) && <span className="hidden pl-1.5 text-[11.5px] font-semibold text-slate-500 sm:block">+{dayEvents.length - (embedded ? 2 : 3)} more</span>}
              </div>
            </div>;
          })}
        </div>
        <div className="mt-3"><DataFreshness updatedAt={updatedAt} loading={syncing} onRefresh={reload} maxAgeMs={60000} /></div>
      </div>
      <aside aria-label="Programs this month" className={`${embedded ? 'hidden' : ''} min-w-0`}>
        <p className="px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Today, {new Date(`${today}T00:00:00`).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}</p>
        <ul className="mb-5 space-y-2">
          {todayEvents.map((event) => <EventRow key={event.id || event.title} event={event} to={eventLink(event)} />)}
          {!todayEvents.length && <li className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm text-slate-500 dark:bg-slate-800">{today.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}`) ? 'Nothing scheduled today.' : 'Today is in another month.'}</li>}
        </ul>
        <p className="px-1 pb-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">This month · {monthEvents.length}</p>
        <ul className="space-y-2">
          {monthEvents.slice(0, 8).map((event) => <EventRow key={event.id || `${event.title}-${event.date}`} event={event} to={eventLink(event)} showDate />)}
        </ul>
        {!monthEvents.length && <p className="px-1 text-sm text-slate-500">No programs scheduled this month.</p>}
      </aside>
    </div>}
  </div>;
}

/** An agenda row: a colored bar for the kind, then the title and date / barangay. */
function EventRow({ event, to, showDate = false }: { event: CalendarEvent; to: string; showDate?: boolean }) {
  return <li><Link to={to} className="flex gap-2.5 rounded-xl bg-slate-100 px-2.5 py-2 text-[13px] leading-snug hover:bg-slate-200/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:bg-slate-800 dark:hover:bg-slate-700">
    <i aria-hidden className={`w-[3px] shrink-0 rounded-full ${DOTS[event.kind]}`} />
    <span className="min-w-0"><b className="block truncate font-semibold">{event.title}</b><small className="block truncate text-xs text-slate-500">{[showDate ? new Date(`${event.date}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }) : '', event.barangay, event.status].filter(Boolean).join(' · ')}</small></span>
  </Link></li>;
}
