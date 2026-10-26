import { ArrowLeft, Check as CheckIcon, ChevronDown, ChevronLeft, ChevronRight, Download, Info, Search, X, LoaderCircle } from 'lucide-react';
import { Children, Fragment, isValidElement, useCallback, useEffect, useId, useRef, useState, type CSSProperties, type InputHTMLAttributes, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/messages';
import { downloadChartPng } from '../lib/chartImage';

// Same controls as e-Vet Field: subtle borders, rounded-lg, a soft green focus ring, and a 1px press.
export const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 hover:border-slate-300 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:opacity-70 dark:border-slate-700 dark:bg-surface-dark dark:text-white dark:hover:border-slate-600 dark:disabled:bg-slate-800';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-brand-500 px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-50';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 hover:text-slate-900 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/40 disabled:pointer-events-none disabled:opacity-50 dark:border-slate-700 dark:bg-transparent dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white';
export const btnDanger = 'inline-flex items-center justify-center gap-2 rounded-lg border border-transparent bg-red-500/10 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-500/20 active:translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-red-500/30 disabled:pointer-events-none disabled:opacity-50 dark:bg-red-500/20 dark:text-red-300 dark:hover:bg-red-500/30';
// Segmented tab switcher, as in e-Vet Field: a tinted track with the selected tab raised on a white pill that slides between tabs (seg-track, see lib/segmented.ts).
export const tabList = 'seg-track no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1 dark:bg-slate-800';
export const tabItem = (selected: boolean) => `inline-flex h-9 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selected ? 'bg-white font-semibold text-brand-700 shadow-sm dark:bg-surface-bar dark:text-brand-300' : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'}`;

/** Mobile number inputs everywhere: digits only, at most 11, starting with 09 (the API stores the same 11 digits). No maxLength: a pasted 0917-123-4567 would be cut before its dashes are dropped. */
export const mobileInput = { type: 'tel', inputMode: 'numeric', pattern: '09[0-9]{9}', placeholder: '09XXXXXXXXX', title: '11 digits starting with 09, like 09171234567' } as const;
export const mobileDigits = (value: string) => value.replace(/\D/g, '').slice(0, 11);

/** A page's explanation kept out of the layout: an (i) beside the title shows it on hover, focus or tap. */
export function InfoTip({ children, label = 'More details' }: { children: ReactNode; label?: string }) {
  const id = useId();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = (target: HTMLElement) => { const box = target.getBoundingClientRect(); setPos({ top: box.bottom + 6, left: Math.max(16, Math.min(box.left, window.innerWidth - 16 - 288)) }); };
  return <span className="ml-1.5 inline-flex align-middle" onMouseEnter={(event) => show(event.currentTarget)} onMouseLeave={() => setPos(null)}>
    <button type="button" aria-label={label} aria-describedby={pos ? id : undefined} onFocus={(event) => show(event.currentTarget)} onBlur={() => setPos(null)} onKeyDown={(event) => { if (event.key === 'Escape') setPos(null); }} className="grid h-6 w-6 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"><Info aria-hidden className="h-4 w-4" /></button>
    {pos && createPortal(<span role="tooltip" id={id} style={{ top: pos.top, left: pos.left }} className="pointer-events-none fixed z-[70] w-72 max-w-[calc(100vw-2rem)] rounded-xl bg-slate-900 px-3 py-2 text-xs font-normal leading-relaxed tracking-normal text-white shadow-lg dark:bg-slate-700">{children}</span>, document.body)}
  </span>;
}

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
}

type SelectOption = { value: string; label: string; disabled?: boolean; group?: string };
const textOf = (node: ReactNode): string => Children.toArray(node).map((part) => typeof part === 'string' || typeof part === 'number' ? String(part) : isValidElement(part) ? textOf((part.props as { children?: ReactNode }).children) : '').join('');
function readOptions(children: ReactNode, group?: string, out: SelectOption[] = []) {
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    const props = child.props as { value?: unknown; label?: string; disabled?: boolean; children?: ReactNode };
    if (child.type === 'option') { const label = textOf(props.children); out.push({ value: props.value === undefined ? label : String(props.value), label, disabled: props.disabled, group }); }
    else readOptions(props.children, child.type === 'optgroup' ? props.label : group, out);
  });
  return out;
}

/** Barangays split into District I and II, as in e-Vet Field's barangay menus (the API sends "1st District" or 1). */
export function districtOptions<T extends { id: number; name: string; district?: number | string | null }>(rows: T[] | undefined, valueOf: (row: T) => string | number = (row) => row.id, labelOf: (row: T) => string = (row) => row.name) {
  const items = rows ?? [];
  if (!items.some((row) => row.district)) return items.map((row) => <option key={row.id} value={valueOf(row)}>{labelOf(row)}</option>);
  return [1, 2].map((district) => <optgroup key={district} label={`District ${district === 1 ? 'I' : 'II'}`}>{items.filter((row) => parseInt(String(row.district), 10) === district).map((row) => <option key={row.id} value={valueOf(row)}>{labelOf(row)}</option>)}</optgroup>);
}

/**
 * Drop-in for <select> with e-Vet Field's menu: same props and <option>/<optgroup> children, but a button opens a rounded list
 * headed by the field's label, with a check on the chosen option, district headings, and a search box for long lists.
 */
export function Select({ value, onChange, children, className = '', disabled, required, name, id, title, 'aria-label': ariaLabel }: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> & { onChange?: (event: { target: { value: string }; currentTarget: { value: string } }) => void }) {
  const options = readOptions(children);
  const current = options.find((option) => option.value === String(value ?? '')) ?? options[0];
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [heading, setHeading] = useState('');
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number; up: boolean } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const listId = useId();
  const searchable = options.length > 10;
  const needle = query.trim().toLowerCase();
  const shown = needle ? options.filter((option) => `${option.label} ${option.group ?? ''}`.toLowerCase().includes(needle)) : options;
  const place = useCallback(() => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 12, above = rect.top - 12, up = below < 240 && above > below;
    setPos({ ...(up ? { bottom: window.innerHeight - rect.top + 6 } : { top: rect.bottom + 6 }), left: Math.max(8, Math.min(rect.left, window.innerWidth - Math.max(rect.width, 224) - 8)), width: rect.width, maxHeight: Math.min(352, up ? above : below), up });
  }, []);
  const openMenu = () => {
    if (disabled) return;
    const label = trigger.current?.closest('label');
    const text = label ? [...label.childNodes].find((node) => !node.contains(trigger.current) && node.textContent?.trim())?.textContent?.trim() : '';
    setHeading((ariaLabel ?? text ?? '').replace(/^Row \d+ (\w)/,(_, first: string) => first.toUpperCase())); setQuery(''); setActive(Math.max(0, options.indexOf(current))); place(); setOpen(true);
  };
  const close = (focus = true) => { setOpen(false); if (focus) trigger.current?.focus(); };
  const choose = (option?: SelectOption) => {
    if (!option || option.disabled) return;
    close();
    if (option.value !== String(value ?? '')) onChange?.({ target: { value: option.value }, currentTarget: { value: option.value } });
  };
  const move = (from: number, step: number) => { for (let i = from + step; i >= 0 && i < shown.length; i += step) if (!shown[i].disabled) return setActive(i); };
  const onKey = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!open) { if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); openMenu(); } return; }
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
    else if (event.key === 'Tab') close(false);
    else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(active, event.key === 'ArrowDown' ? 1 : -1); }
    else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); move(event.key === 'Home' ? -1 : shown.length, event.key === 'Home' ? 1 : -1); }
    else if (event.key === 'Enter' || (event.key === ' ' && !searchable)) { event.preventDefault(); choose(shown[active]); }
    else if (!searchable && event.key.length === 1) {
      // Type to jump, like a native select.
      const next = [...shown.slice(active + 1), ...shown.slice(0, active + 1)].find((option) => option.label.toLowerCase().startsWith(event.key.toLowerCase()));
      if (next) setActive(shown.indexOf(next));
    }
  };
  useEffect(() => { if (open) setActive(0); }, [needle]);
  useEffect(() => { if (open) panel.current?.querySelector('[data-active]')?.scrollIntoView({ block: 'nearest' }); }, [open, active]);
  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => { const target = event.target as Node; if (!trigger.current?.contains(target) && !panel.current?.contains(target)) setOpen(false); };
    const onMove = (event: Event) => { if (!panel.current?.contains(event.target as Node)) place(); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onMove, true); window.removeEventListener('resize', onMove); };
  }, [open, place]);
  const button = <button ref={trigger} type="button" id={id} role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? listId : undefined} aria-activedescendant={open && !searchable && shown[active] ? `${listId}-${active}` : undefined} aria-label={ariaLabel} aria-required={required || undefined} title={title} disabled={disabled}
    onClick={() => (open ? close() : openMenu())} onKeyDown={onKey}
    className={`${className} flex items-center justify-between gap-2 text-left ${open ? '!border-brand-500 ring-[3px] ring-brand-500/15' : ''}`}>
    <span className={`min-w-0 truncate ${current?.value === '' ? 'text-slate-400' : ''}`}>{current?.label ?? ''}</span>
    <ChevronDown aria-hidden className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
  </button>;
  return <>
    {/* A hidden native select keeps the browser's required-field check on submit. */}
    {required ? <span className="relative block">{button}<select tabIndex={-1} aria-hidden required name={name} value={String(value ?? '')} onChange={() => undefined} className="pointer-events-none absolute bottom-0 left-4 h-px w-px opacity-0">{children}</select></span> : button}
    {open && pos && createPortal(
      <div ref={panel} data-lenis-prevent data-side={pos.up ? 'top' : 'bottom'} style={{ top: pos.top, bottom: pos.bottom, left: pos.left, minWidth: pos.width, maxHeight: pos.maxHeight }}
        className="menu-pop fixed z-[70] flex min-w-44 max-w-[min(26rem,calc(100vw-16px))] flex-col rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-panel dark:border-slate-700 dark:bg-surface-bar">
        {searchable && <div className="relative mb-1 shrink-0"><Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={onKey} aria-label={`Search ${(heading || 'options').toLowerCase()}`} aria-controls={listId} aria-activedescendant={shown[active] ? `${listId}-${active}` : undefined} placeholder={`Search ${(heading || 'options').toLowerCase()}`} autoComplete="off" className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-[3px] focus:ring-brand-500/15 dark:border-slate-700 dark:bg-surface-dark dark:text-white" /></div>}
        {heading && !searchable && <p className="shrink-0 px-2.5 pb-1 pt-1 text-xs font-medium text-slate-500">{heading}</p>}
        <div id={listId} role="listbox" aria-label={heading || undefined} className="min-h-0 overflow-y-auto">
          {shown.map((option, index) => <Fragment key={`${option.group ?? ''}:${option.value}`}>
            {option.group && option.group !== shown[index - 1]?.group && <p role="presentation" className="flex items-center gap-2 px-2.5 pb-1 pt-2 text-xs font-semibold text-brand-700 after:h-px after:flex-1 after:bg-slate-200 dark:text-brand-300 dark:after:bg-slate-700">{option.group}</p>}
            <div id={`${listId}-${index}`} role="option" aria-selected={option === current} aria-disabled={option.disabled || undefined} data-active={index === active || undefined} style={{ '--i': Math.min(index, 8) } as CSSProperties}
              onMouseEnter={() => setActive(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}
              className={`menu-item flex min-h-9 cursor-pointer items-center gap-3 rounded-lg px-2.5 py-2 ${index === active ? 'bg-slate-100 dark:bg-white/[0.06]' : ''} ${option.disabled ? 'cursor-not-allowed opacity-50' : ''} ${option === current ? 'font-medium text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}`}>
              <span className="min-w-0 flex-1">{option.label}</span>{option === current && <CheckIcon aria-hidden className="h-4 w-4 shrink-0" />}
            </div>
          </Fragment>)}
          {!shown.length && <p className="px-2.5 py-3 text-slate-500">No matches for “{query.trim()}”.</p>}
        </div>
      </div>, document.body)}
  </>;
}

export function DateInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  return <input {...props} type="date" />;
}

export function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
      {children}
    </label>
  );
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  approved: 'bg-brand-50 text-brand-700 dark:bg-brand-900/60 dark:text-brand-100',
  rejected: 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-200',
  withdrawn: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function StatusBadge({ status }: { status: string }) {
  const { t } = useT();
  return <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${STATUS_STYLE[status] ?? STATUS_STYLE.withdrawn}`}>{t(`census.status.${status}` as MessageKey)}</span>;
}

// Statuses stored in lower case or with underscores ("in_progress") read as "In progress".
export const statusLabel = (status: string | null | undefined) => status ? status[0].toUpperCase() + status.slice(1).replaceAll('_', ' ') : '';

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const style = kind === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
    : kind === 'success' ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-900/40 dark:text-brand-100'
    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

export function Loading({ label }: { label?: string } = {}) {
  const { t } = useT();
  // Skeleton cards stand in for the content while it loads; the label is for screen readers.
  return <div role="status" className="space-y-3 py-2"><span className="sr-only">{label ?? t('common.loading')}</span>{[0, 1, 2].map((i) => <div key={i} aria-hidden style={{ opacity: 1 - i * 0.22 }} className="flex items-center gap-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-800"><div className="h-10 w-10 shrink-0 rounded-xl bg-slate-100 motion-safe:animate-pulse dark:bg-slate-800" /><div className="flex-1 space-y-2"><div className="h-3.5 w-2/5 rounded bg-slate-100 motion-safe:animate-pulse dark:bg-slate-800" /><div className="h-3 w-3/4 rounded bg-slate-100 motion-safe:animate-pulse dark:bg-slate-800" /></div></div>)}</div>;
}

/** Comparison bars: one row per value, the largest in green (and bold), the rest grey; bars grow in once. */
export function ComparisonBars({ title, rows, className = '' }: { title?: string; rows: { label: string; value: number }[]; className?: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  const top = rows.reduce((best, row, index) => (row.value > rows[best].value ? index : best), 0);
  return <div data-chart className={`grid gap-3 ${className}`}>
    {title && <div className="flex items-center justify-between gap-2"><p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.12em] text-slate-500">{title}</p><SaveChartImage name={title} /></div>}
    <ul aria-label={title} className="grid gap-3">{rows.map((row, index) => <li key={index} aria-label={`${row.label}: ${row.value}`} className={`grid grid-cols-[minmax(3rem,8rem)_1fr_auto] items-center gap-2.5 text-xs ${index === top ? 'font-semibold text-slate-900 dark:text-white' : 'font-medium text-slate-500 dark:text-slate-400'}`}>
      <span aria-hidden className="truncate capitalize">{row.label}</span>
      <span aria-hidden className="h-3.5 overflow-hidden rounded-full bg-slate-100 print:border dark:bg-slate-800"><span style={{ width: `${Math.max(0, row.value) / max * 100}%`, '--i': index } as CSSProperties} className={`bar-grow block h-full rounded-full print:bg-slate-700 ${index === top ? 'bg-gradient-to-r from-brand-500 to-brand-400' : 'bg-brand-200 dark:bg-brand-800'}`} /></span>
      <span aria-hidden className={`min-w-[2ch] text-right font-semibold tabular-nums ${index === top ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-300'}`}>{row.value}</span>
    </li>)}</ul>
  </div>;
}

/** Column (bar) chart, as in the motion-library bar card: columns grow up from the axis one after another, the highest is solid green and the rest light green.
 *  Each column carries its number on top, so the chart never relies on colour alone; `second` draws a paired, darker column (e.g. completed next to attended). */
export function ColumnChart({ bars, unit = '', legend }: { bars: { label: string; value: number | null; second?: number; note?: string }[]; unit?: string; legend?: [string, string] }) {
  const max = Math.max(1, ...bars.flatMap((bar) => [bar.value ?? 0, bar.second ?? 0]));
  const top = Math.max(...bars.map((bar) => bar.value ?? 0));
  const shown = (value: number | null | undefined) => value == null ? '—' : `${value.toLocaleString('en-PH')}${unit}`;
  const height = (value: number | null | undefined) => (value ? `${(value / max) * 100}%` : '0');
  const columns = { gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` };
  // Many columns (a year of months) keep a readable width and scroll sideways inside the card on phones.
  return <div className="overflow-x-auto"><div role="img" style={{ minWidth: `${bars.length * (legend ? 4.5 : 3)}rem` }} aria-label={bars.map((bar) => `${bar.label}: ${shown(bar.value)}${bar.second !== undefined && legend ? `, ${legend[1]} ${shown(bar.second)}` : ''}`).join('; ')}>
    {/* pt-5 leaves room for the number above the tallest column. */}
    <div aria-hidden className="grid h-40 gap-2 border-b border-slate-200 pt-5 dark:border-slate-700" style={columns}>{bars.map((bar, index) => <div key={bar.label} className="flex min-w-0 items-end justify-center gap-1">
      <div className="flex h-full w-full max-w-14 flex-col items-center justify-end"><span className="mb-1 text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">{shown(bar.value)}</span><i style={{ height: height(bar.value), '--i': index } as CSSProperties} className={`col-grow block w-full rounded-b-[3px] rounded-t-[7px] print:border print:border-slate-700 ${bar.value === top && top > 0 && bar.second === undefined ? 'bg-gradient-to-t from-brand-600 to-brand-400' : 'bg-brand-200 dark:bg-brand-800'}`} /></div>
      {bar.second !== undefined && <div className="flex h-full w-full max-w-14 flex-col items-center justify-end"><span className="mb-1 text-[11px] font-semibold tabular-nums text-brand-700 dark:text-brand-300">{shown(bar.second)}</span><i style={{ height: height(bar.second), '--i': index } as CSSProperties} className="col-grow block w-full rounded-b-[3px] rounded-t-[7px] bg-gradient-to-t from-brand-600 to-brand-400 print:border print:border-slate-700" /></div>}
    </div>)}</div>
    <div aria-hidden className="mt-2 grid gap-2 text-center font-mono text-[10.5px] font-medium leading-tight text-slate-500" style={columns}>{bars.map((bar) => <span key={bar.label} className="min-w-0 break-words">{bar.label}{bar.note && <span className="mt-0.5 block font-sans text-[10px] text-slate-400">{bar.note}</span>}</span>)}</div>
    {legend && <p aria-hidden className="mt-3 flex gap-4 text-xs text-slate-500"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200 dark:bg-brand-800" />{legend[0]}</span><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />{legend[1]}</span></p>}
  </div></div>;
}

/** Saves the surrounding [data-chart] card (title, legend and chart) as a PNG to use in presentations. */
export function SaveChartImage({ name }: { name: string }) {
  const [busy, setBusy] = useState(false);
  return <button type="button" data-export-ignore disabled={busy} aria-label={`Save ${name} as an image`} className={`${btnGhost} shrink-0 px-2.5 py-1 text-xs print:hidden`} onClick={(event) => {
    const card = event.currentTarget.closest<HTMLElement>('[data-chart]');
    if (!card) return;
    setBusy(true);
    downloadChartPng(card, name).catch((error: unknown) => window.dispatchEvent(new CustomEvent('cv:api-error', { detail: { message: error instanceof Error ? error.message : 'The chart could not be saved.' } }))).finally(() => setBusy(false));
  }}><Download aria-hidden className="h-3.5 w-3.5" />{busy ? 'Saving…' : 'Save image'}</button>;
}

export function Spinner({ label = 'Working…' }: { label?: string }) {
  return <span role="status" className="inline-flex items-center gap-2"><LoaderCircle aria-hidden className="h-4 w-4 animate-spin" />{label}</span>;
}

export function EmptyState({ title, description, children }: { title: string; description?: string; children?: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center dark:border-slate-700">
    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{title}</p>
    {description && <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{description}</p>}
    {children && <div className="mt-4">{children}</div>}
  </div>;
}

export function LoadError({ message, onRetry, label = 'Try again' }: { message: string; onRetry: () => void; label?: string }) {
  return <div className="space-y-3"><Notice kind="error">{message}</Notice><button type="button" className={btnGhost} onClick={onRetry}>{label}</button></div>;
}

export function Pagination({ page, pageSize, total, onPage }: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > lastPage) onPage(lastPage); }, [lastPage, onPage, page]);
  if (total === 0) return null;
  const firstItem = (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, total);
  // Numbered pager: first, last and the pages next to the current one; gaps become an ellipsis.
  const shown = [...new Set([1, page - 1, page, page + 1, lastPage])].filter((n) => n >= 1 && n <= lastPage).sort((a, b) => a - b);
  const pageBtn = 'grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-[13px] font-semibold tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:pointer-events-none disabled:opacity-35';
  return (
    <nav aria-label="Table pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="tabular-nums text-slate-500">Showing {firstItem}–{lastItem} of {total}</span>
      <div className="flex items-center gap-1">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className={`${pageBtn} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}><ChevronLeft aria-hidden className="h-4 w-4" /></button>
        {shown.map((n, index) => <span key={n} className="flex items-center gap-1">{index > 0 && n - shown[index - 1] > 1 && <span aria-hidden className="px-1 text-slate-400">…</span>}<button type="button" onClick={() => onPage(n)} aria-label={`Page ${n} of ${lastPage}`} aria-current={n === page ? 'page' : undefined} className={`${pageBtn} ${n === page ? 'bg-brand-500 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'}`}>{n}</button></span>)}
        <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)} aria-label="Next page" className={`${pageBtn} text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800`}><ChevronRight aria-hidden className="h-4 w-4" /></button>
      </div>
    </nav>
  );
}

const modalStack: HTMLDivElement[] = [];
let previousBodyOverflow = '';

/** Portal dialog with nested-dialog focus handling and visible entry transitions. */
export function Modal({ title, onClose, children, wide = false, dismissible = true }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; dismissible?: boolean }) {
  const { t } = useT();
  const panel = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const dismissibleRef = useRef(dismissible); dismissibleRef.current = dismissible;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const current = panel.current!;
    if (!modalStack.length) previousBodyOverflow = document.body.style.overflow;
    modalStack.push(current); current.focus();
    const onKey = (event: KeyboardEvent) => {
      if (modalStack.at(-1) !== current) return;
      if (event.key === 'Escape') { event.stopPropagation(); if(dismissibleRef.current)onCloseRef.current(); }
      if (event.key === 'Tab') {
        const items = [...current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter((item) => item.getClientRects().length > 0);
        const first = items[0], last = items.at(-1);
        if (!first) { event.preventDefault(); current.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === current)) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); modalStack.splice(modalStack.indexOf(current), 1); if (!modalStack.length) document.body.style.overflow = previousBodyOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  return createPortal(
    <div className="ui-modal-overlay fixed inset-0 z-50 grid place-items-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label={title}>
      {dismissible ? <button type="button" tabIndex={-1} aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]" /> : <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"/>}
      <div ref={panel} tabIndex={-1} data-lenis-prevent className={`ui-modal-panel relative max-h-[92dvh] w-full overflow-auto rounded-[20px] bg-white px-5 pb-5 shadow-[0_24px_64px_-16px_rgb(16_40_28/0.35)] ring-1 ring-slate-900/5 sm:px-6 sm:pb-6 focus:outline-none dark:bg-surface-bar dark:ring-white/10 ${wide ? 'max-w-4xl' : 'max-w-lg'}`}>
        {/* Clean header: the title and a quiet close button, pinned while the body scrolls. */}
        <div className="sticky top-0 z-10 -mx-5 flex items-center justify-between gap-3 bg-white/95 px-5 pb-3 pt-4 backdrop-blur sm:-mx-6 sm:px-6 sm:pt-5 dark:bg-surface-bar/95">
          <h2 className="text-[17px] font-semibold leading-snug tracking-[-0.01em] text-slate-900 dark:text-white">{title}</h2>{dismissible&&<button type="button" onClick={onClose} aria-label={t('common.close')} className="-mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-white/10 dark:hover:text-white"><X aria-hidden className="h-[18px] w-[18px]"/></button>}
        </div>
        <div className="mt-1">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const { t } = useT();
  return <button type="button" onClick={onClick} className={`${btnGhost} px-3 py-1.5 text-xs`}><ArrowLeft aria-hidden className="h-3.5 w-3.5" />{label ?? t('common.back')}</button>;
}

export function ConfirmDialog({ title, message, confirmLabel, danger, busy, onConfirm, onClose }: {
  title: string; message: string; confirmLabel: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  const { t } = useT();
  return (
    <Modal title={title} onClose={onClose} dismissible={!busy}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={btnGhost}>{t('common.cancel')}</button>
        <button type="button" onClick={onConfirm} disabled={busy} className={danger ? btnDanger : btnPrimary}>{busy ? <Spinner label="Saving…" /> : confirmLabel}</button>
      </div>
    </Modal>
  );
}

export const formatDate = (value: string | null | undefined, locale = 'en-PH') =>
  value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Manila' }) : '';
