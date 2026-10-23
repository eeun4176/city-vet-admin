import { Printer } from 'lucide-react';
import type { ReactNode } from 'react';
import { useT } from '../i18n';
import { btnPrimary } from './ui';

/** Letterhead of the official City Veterinary Office forms (printed wording stays in English like the paper forms). */
export function Letterhead({ title }: { title: string }) {
  return (
    <header className="text-center">
      <img src="/images.jpg" alt="" className="mx-auto h-16 w-16 object-contain print:h-14 print:w-14" />
      <p className="mt-2 text-xs leading-snug">Republic of the Philippines<br />Province of Bulacan<br />City of San Jose del Monte</p>
      <p className="text-base font-bold tracking-wide">CITY VETERINARY OFFICE</p>
      <p className="text-xs">Productivity Complex, Brgy. Sapang Palay Proper</p>
      <h2 className="mt-4 text-lg font-bold uppercase">{title}</h2>
    </header>
  );
}

export function SheetFooter() {
  return (
    <footer className="mt-10 border-t border-slate-300 pt-2 text-xs text-slate-600 print:mt-6">
      <p>Address: Productivity Complex, Brgy. Sapang Palay Proper, City of San Jose del Monte, Bulacan</p>
      <p>Contact: 044-306-5341 / 0966-3181892 · Email: cityvet20@yahoo.com</p>
    </footer>
  );
}

export function Signature({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="w-64 text-center text-sm">
      <p className="text-left text-xs italic">{label}</p>
      <div className="mt-10 border-t border-slate-800" />
      <p className="mt-1">{caption}</p>
    </div>
  );
}

export function PrintButton({ children }: { children?: ReactNode }) {
  const { t } = useT();
  return <button type="button" onClick={() => window.print()} className={btnPrimary}><Printer aria-hidden className="h-4 w-4" />{children ?? t('census.print')}</button>;
}
