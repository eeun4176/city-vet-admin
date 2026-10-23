import { ArrowLeft, X, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import type { MessageKey } from '../i18n/messages';

export const inputCls = 'w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 disabled:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-800';
export const btnPrimary = 'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 dark:ring-offset-slate-900';
export const btnGhost = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800';
export const btnDanger = 'inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950';

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
      <span className="mt-1 block">{children}</span>
      {hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
    </label>
  );
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
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLE[status] ?? STATUS_STYLE.withdrawn}`}>{t(`census.status.${status}` as MessageKey)}</span>;
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'error' | 'success'; children: ReactNode }) {
  const style = kind === 'error' ? 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200'
    : kind === 'success' ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-900 dark:bg-brand-900/40 dark:text-brand-100'
    : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200';
  return <div role={kind === 'error' ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-sm ${style}`}>{children}</div>;
}

export function Loading({ label }: { label?: string } = {}) {
  const { t } = useT();
  return <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500"><LoaderCircle aria-hidden className="h-5 w-5 animate-spin text-brand-600" /><span>{label ?? t('common.loading')}</span></div>;
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
  return (
    <nav aria-label="Table pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-slate-500">Showing {firstItem}–{lastItem} of {total}</span>
      <div className="flex items-center gap-2">
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={btnGhost}>Previous</button>
        <span aria-live="polite">Page {page} of {lastPage}</span>
        <button type="button" disabled={page >= lastPage} onClick={() => onPage(page + 1)} className={btnGhost}>Next</button>
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
      {dismissible ? <button type="button" tabIndex={-1} aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-slate-900/60" /> : <div className="absolute inset-0 bg-slate-900/60"/>}
      <div ref={panel} tabIndex={-1} className={`ui-modal-panel relative max-h-[94dvh] w-full overflow-auto rounded-2xl bg-white p-4 shadow-panel sm:p-5 focus:outline-none dark:bg-surface-dark ${wide ? 'max-w-4xl' : 'max-w-md'}`}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-100 bg-white pb-3 dark:border-slate-800 dark:bg-surface-dark">

          <h2 className="text-base font-semibold">{title}</h2>{dismissible&&<button type="button" onClick={onClose} aria-label={t('common.close')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-brand-500 dark:hover:bg-slate-800"><X aria-hidden className="h-5 w-5"/></button>}
        </div>
        <div className="mt-3">{children}</div>
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
