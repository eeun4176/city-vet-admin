import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useApi } from '../lib/useApi';
import { InfoTip, Notice, Select, Spinner, btnPrimary, districtOptions } from '../components/ui';
import { emptyRegistryPet, type RegistryDraft, type RegistryPreview } from '../../shared/registry';
import { groupOwnerRows, type OwnerRow } from './ownerSheetRows';
import { sheetCell as cell, sheetHead as head } from '../components/PetSheet';

const blank = (): OwnerRow => ({ owner: '', barangayId: '', address: '', contact: '', pet: '', species: 'Dog', sex: '', ageMonths: '', color: '' });

/**
 * Owners and pets typed straight into a sheet, as in e-Vet Field: one row per pet, the owner cell left blank for more pets of the owner above.
 * Save reviews each owner with the server; owners with possible existing matches stay in the sheet for a full review (onReview).
 */
export function OwnerSheet({ onSaved, onReview }: { onSaved: (owners: number) => void; onReview: (draft: RegistryDraft) => void }) {
  const areas = useApi<{ data: { id: number; name: string; district?: number }[] }>('/barangays');
  const [rows, setRows] = useState<OwnerRow[]>(() => [blank(), blank(), blank()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [flags, setFlags] = useState<Record<number, string>>({});
  const setRow = (index: number, next: Partial<OwnerRow>) => setRows((all) => all.map((row, i) => (i === index ? { ...row, ...next } : row)));
  const grouped = groupOwnerRows(rows);
  const pets = grouped.owners.reduce((sum, owner) => sum + owner.pets.length, 0);

  const save = async () => {
    if (busy) return;
    if (grouped.error) return setError(grouped.error);
    setBusy(true); setError(''); setFlags({});
    const kept = new Set<number>(), notes: Record<number, string> = {};
    let saved = 0;
    for (const owner of grouped.owners) {
      const draft: RegistryDraft = { requestId: crypto.randomUUID(), mode: 'create-owner', reason: '', owner: { name: owner.name, address: owner.address, contact: owner.contact, barangayId: owner.barangayId }, pets: owner.pets.map((pet) => ({ ...emptyRegistryPet(), ...pet })) };
      try {
        const review = await api<RegistryPreview>('POST', '/registry-workspace', { action: 'preview', draft }, { readOnly: true });
        if (review.needsAcknowledgement) { owner.rows.forEach((i) => kept.add(i)); notes[owner.rows[0]] = JSON.stringify(review.draft); continue; }
        await api('POST', '/registry-workspace', { action: 'save', draft: review.draft, token: review.token, acknowledgeMatches: false, matchReason: '' });
        saved++;
      } catch (failure) { owner.rows.forEach((i) => kept.add(i)); notes[owner.rows[0]] = `error:${failure instanceof Error ? failure.message : 'Save failed.'}`; }
    }
    // Saved owners leave the sheet; the rest stay with a note on their first row.
    const left = rows.map((row, index) => ({ row, index })).filter(({ index }) => kept.has(index));
    setRows(left.length ? [...left.map(({ row }) => row), blank()] : [blank(), blank(), blank()]);
    setFlags(Object.fromEntries(left.flatMap(({ index }, position) => (notes[index] ? [[position, notes[index]]] : []))));
    setBusy(false);
    if (saved) onSaved(saved);
    if (left.length) setError('Some owners were not saved. Check the highlighted rows.');
  };

  return <section aria-labelledby="owner-sheet-title" className="space-y-3">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 id="owner-sheet-title" className="font-semibold">Add Owners and Pets<InfoTip>One row per pet. Leave the owner blank for another pet of the owner above.</InfoTip></h2></div><p aria-live="polite" className="text-sm tabular-nums text-slate-500">{grouped.owners.length} owner{grouped.owners.length === 1 ? '' : 's'} · {pets} pet{pets === 1 ? '' : 's'}</p></div>
    <div className="data-table overflow-x-auto">
      <table className="w-full min-w-[78rem] table-fixed text-sm">
        <thead><tr>
          <th className={`${head} w-10 text-center`}>#</th><th className={`${head} w-52`}>Owner</th><th className={`${head} w-48`}>Barangay</th><th className={`${head} w-52`}>Address</th><th className={`${head} w-36`}>Contact</th>
          <th className={`${head} w-40`}>Pet</th><th className={`${head} w-28`}>Species</th><th className={`${head} w-32`}>Sex</th><th className={`${head} w-24`}>Age (mo)</th><th className={`${head} w-28`}>Color</th><th className={`${head} w-11`}><span className="sr-only">Remove</span></th>
        </tr></thead>
        <tbody>{rows.map((row, index) => {
          const n = index + 1, flag = flags[index], cont = !row.owner.trim() && index > 0;
          return <tr key={index} className={flag ? 'bg-amber-50 dark:bg-amber-500/10' : ''}>
            <td className="!h-10 !p-0 text-center text-xs tabular-nums text-slate-400">{n}</td>
            <td className="!h-10 !p-0"><input aria-label={`Row ${n} owner`} value={row.owner} onChange={(e) => setRow(index, { owner: e.target.value })} maxLength={120} placeholder={index ? 'Same as above' : 'Owner name'} className={cell} /></td>
            <td className="!h-10 !p-0"><Select aria-label={`Row ${n} barangay`} disabled={cont} value={row.barangayId} onChange={(e) => setRow(index, { barangayId: e.target.value })} className={`${cell} disabled:opacity-40`}><option value="">{cont ? '—' : 'Choose'}</option>{districtOptions(areas.data?.data)}</Select></td>
            <td className="!h-10 !p-0"><input aria-label={`Row ${n} address`} disabled={cont} value={row.address} onChange={(e) => setRow(index, { address: e.target.value })} maxLength={300} placeholder={cont ? '' : 'Street, purok'} className={`${cell} disabled:opacity-40`} /></td>
            <td className="!h-10 !p-0"><input aria-label={`Row ${n} contact`} disabled={cont} value={row.contact} onChange={(e) => setRow(index, { contact: e.target.value })} maxLength={20} inputMode="tel" placeholder={cont ? '' : '09XX-XXX-XXXX'} className={`${cell} disabled:opacity-40`} /></td>
            <td className="!h-10 !p-0"><input aria-label={`Row ${n} pet`} value={row.pet} onChange={(e) => setRow(index, { pet: e.target.value })} maxLength={80} placeholder="Pet name" className={cell} /></td>
            <td className="!h-10 !p-0"><Select aria-label={`Row ${n} species`} value={row.species} onChange={(e) => setRow(index, { species: e.target.value as OwnerRow['species'] })} className={cell}><option>Dog</option><option>Cat</option></Select></td>
            <td className="!h-10 !p-0"><Select aria-label={`Row ${n} sex`} value={row.sex} onChange={(e) => setRow(index, { sex: e.target.value as OwnerRow['sex'] })} className={cell}><option value="">Not recorded</option><option>Male</option><option>Female</option></Select></td>
            <td className="!h-10 !p-0"><input aria-label={`Row ${n} age in months`} type="number" min={0} max={600} value={row.ageMonths} onChange={(e) => setRow(index, { ageMonths: e.target.value })} className={cell} /></td>
            <td className="!h-10 !p-0"><input aria-label={`Row ${n} color`} value={row.color} onChange={(e) => setRow(index, { color: e.target.value })} maxLength={100} className={cell} /></td>
            <td className="!h-10 !p-0"><button type="button" aria-label={`Remove row ${n}`} disabled={rows.length === 1} onClick={() => { setRows((all) => all.filter((_, i) => i !== index)); setFlags({}); }} className="grid h-10 w-11 place-items-center text-slate-400 hover:text-slate-700 disabled:opacity-30 dark:hover:text-white"><Trash2 aria-hidden className="h-4 w-4" /></button></td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {Object.entries(flags).map(([position, note]) => <div key={position} className="flex flex-wrap items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
      <span>Row {Number(position) + 1}: {note.startsWith('error:') ? note.slice(6) : 'possible existing owner or pets.'}</span>
      {!note.startsWith('error:') && <button type="button" className="font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300" onClick={() => onReview(JSON.parse(note) as RegistryDraft)}>Review matches</button>}
    </div>)}
    {error && <Notice kind="error">{error}</Notice>}
    {areas.error && <Notice kind="error">{areas.error.message}</Notice>}
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setRows((all) => [...all, blank()])} className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 px-3.5 text-sm font-semibold text-brand-700 hover:bg-slate-50 dark:border-slate-700 dark:text-brand-300 dark:hover:bg-slate-800"><Plus aria-hidden className="h-4 w-4" />Add row</button>
      <button type="button" onClick={() => setRows((all) => [...all, blank(), blank(), blank(), blank(), blank()])} className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">Add 5 rows</button>
      <button type="button" disabled={busy || !grouped.owners.length} onClick={() => void save()} className={`${btnPrimary} ml-auto`}>{busy ? <Spinner label="Saving owners…" /> : grouped.owners.length ? `Save ${grouped.owners.length} owner${grouped.owners.length === 1 ? '' : 's'}` : 'Save owners'}</button>
    </div>
  </section>;
}
