import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X } from 'lucide-react';
import type { StubPrintData } from '../../shared/stubs';
import { Loading, Notice, Spinner, btnGhost, btnPrimary } from './ui';
import '../pages/stub-workflow.css';

const dateLabel = (value: string) => new Date(`${value.slice(0, 10)}T12:00:00+08:00`).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
const timeLabel = (value?: string | null) => value ? `${Number(value.slice(0, 2)) % 12 || 12}:${value.slice(3, 5)} ${Number(value.slice(0, 2)) < 12 ? 'AM' : 'PM'}` : '';
const whenLabel = (program: StubPrintData['program']) => [dateLabel(program.date), [timeLabel(program.startTime), timeLabel(program.endTime)].filter(Boolean).join('–')].filter(Boolean).join(' · ');

export function StubPrintSheet({ data, saving, actionError, onConfirmPrinted, onClose }: { data: StubPrintData; saving: boolean; actionError?: string; onConfirmPrinted: () => void; onClose: () => void }) {
  const [images, setImages] = useState<Record<number, string>>({});
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [openedPrint, setOpenedPrint] = useState(false);
  const [fitChecked, setFitChecked] = useState(false);
  const [fitError, setFitError] = useState('');
  const pagesRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const savingRef = useRef(saving);
  onCloseRef.current = onClose; savingRef.current = saving;
  useEffect(() => {
    let live = true;
    setImages({}); setError('');
    void import('qrcode').then(async (module) => {
      const encoder = module.default;
      const entries = await Promise.all(data.stubs.map(async (stub) => [stub.id, await encoder.toDataURL(stub.code, { errorCorrectionLevel: 'M', margin: 4, width: 384, color: { dark: '#000000', light: '#ffffff' } })] as const));
      if (live) setImages(Object.fromEntries(entries));
    }).catch((failure: unknown) => { if (live) setError(failure instanceof Error ? failure.message : 'QR images could not be prepared.'); });
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !savingRef.current) onCloseRef.current(); };
    document.addEventListener('keydown', key);
    return () => { live = false; document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', key); };
  }, [data, attempt]);
  const ready = data.stubs.length > 0 && Object.keys(images).length === data.stubs.length;
  useEffect(() => {
    let live = true;
    setFitChecked(false); setFitError('');
    if (!ready) return;
    const check = async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(pagesRef.current?.querySelectorAll('img') ?? []).map((image) => image.decode().catch(() => undefined)));
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (!live) return;
      const copies = Array.from(pagesRef.current?.querySelectorAll<HTMLElement>('.stub-slip-copy') ?? []);
      const overflow = copies.some((copy) => {
        const bounds = copy.getBoundingClientRect();
        return Array.from(copy.children).some((child) => { const item = child.getBoundingClientRect(); return item.top < bounds.top - 1 || item.bottom > bounds.bottom + 1 || item.left < bounds.left - 1 || item.right > bounds.right + 1; });
      });
      setFitError(overflow ? 'The full program title or location does not fit this compact stub. Shorten the program title or location before printing.' : '');
      setFitChecked(true);
    };
    void check();
    return () => { live = false; };
  }, [ready, images, data]);
  const pages = Array.from({ length: Math.ceil(data.stubs.length / 12) }, (_, index) => data.stubs.slice(index * 12, index * 12 + 12));
  return createPortal(<div className="stub-print-root fixed inset-0 z-[70] overflow-auto bg-slate-100 text-slate-900" role="dialog" aria-modal="true" aria-label="Print owner stubs">
    <div className="stub-print-controls sticky top-0 z-10 border-b border-slate-200 bg-white p-4 shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Print owner stubs</h2><p className="text-sm text-slate-500">{data.stubs.length} stubs · 90 × 40 mm · 12 per A4 sheet · print at actual size (100%).</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" className={btnGhost} disabled={saving} onClick={onClose}><X className="h-4 w-4" />Close</button><button type="button" className={btnGhost} disabled={!ready || !fitChecked || !!fitError || saving} onClick={() => { setOpenedPrint(true); window.print(); }}><Printer className="h-4 w-4" />Print / save PDF</button><button type="button" className={btnPrimary} disabled={!ready || !fitChecked || !!fitError || saving || !openedPrint} onClick={onConfirmPrinted}>{saving ? <Spinner label="Confirming…" /> : data.batch.status !== 'Approved' ? 'Confirm reprint complete' : 'Confirm printing complete'}</button></div>
      </div><p className="mx-auto mt-2 max-w-6xl text-xs text-slate-500">Confirm only after the sheets have printed successfully. Reprints keep the same QR; a redeemed QR stays used.</p>
    </div>
    {actionError && <div className="stub-print-controls mx-auto max-w-3xl p-4"><Notice kind="error">{actionError}</Notice></div>}
    {error && <div className="stub-print-controls mx-auto max-w-3xl p-4"><Notice kind="error">{error}</Notice><button className={`${btnGhost} mt-3`} onClick={() => setAttempt((value) => value + 1)}>Prepare again</button></div>}
    {fitError && <div className="stub-print-controls mx-auto max-w-3xl p-4"><Notice kind="error">{fitError}</Notice></div>}
    {!ready && !error && <div className="stub-print-controls"><Loading label="Preparing private QR images…" /></div>}
    {ready && !fitChecked && <div className="stub-print-controls"><Loading label="Checking compact layout…" /></div>}
    {ready && <div className="stub-print-pages" ref={pagesRef}>{pages.map((stubs, pageIndex) => <section className="stub-print-page" key={pageIndex} aria-label={`Sheet ${pageIndex + 1}`}>{stubs.map((stub) => <article className="stub-owner-slip" key={stub.id}>
      <div className="stub-slip-copy"><img className="stub-slip-logo" src="/favicon.png" alt="City Veterinary Office" /><h3 style={{ fontSize: data.program.title.length > 90 ? '7pt' : data.program.title.length > 55 ? '8pt' : '8.5pt' }}>{data.program.title}</h3><p className="stub-slip-number">Stub No. {stub.id}</p><p>{whenLabel(data.program)}</p><p style={{ fontSize: data.program.location.length > 100 ? '7pt' : '7.5pt' }}>{data.program.location}</p><p className="stub-slip-services">{data.program.processes.map((process) => <span key={process}><span className="stub-box">{stub.services?.includes(process) ? '✓' : ''}</span>{process}</span>)}</p><p className="stub-owner-name">Owner: ______________________________</p></div>
      <img src={images[stub.id]} className="stub-slip-qr" alt="Program stub QR" />
    </article>)}</section>)}</div>}
  </div>, document.body);
}
