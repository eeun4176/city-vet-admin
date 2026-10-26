import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useT } from '../i18n';
import { emptyOwner, emptyPet, todayManila, toPayload, type OwnerDraft, type OwnerPayload, type PetDraft } from '../lib/census';
import { btnGhost, btnPrimary, DateInput, Field, inputCls, Notice, Select, mobileInput, mobileDigits } from './ui';
import { ReferenceInput, type ReferenceSuggestion } from './ReferenceInput';

function text(value: unknown): string | undefined {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}
function CensusFlag({value,onChange,label}:{value:boolean|null;onChange:(value:boolean|null)=>void;label:string}){
 return <Field label={label}><Select className={inputCls} value={value===null?'unknown':value?'yes':'no'} onChange={e=>onChange(e.target.value==='unknown'?null:e.target.value==='yes')}><option value="unknown">Not recorded</option><option value="yes">Yes</option><option value="no">No</option></Select></Field>;
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | undefined {
  if (typeof value !== 'string') return undefined;
  return allowed.find((candidate) => candidate.toLowerCase() === value.toLowerCase());
}

function petFromSuggestion(pet: PetDraft, suggestion: ReferenceSuggestion): PetDraft {
  const age = Number(suggestion.ageMonths ?? suggestion.age_months);
  return {
    ...pet,
    petName: suggestion.name,
    species: enumValue(suggestion.species, ['Dog', 'Cat'] as const) ?? pet.species,
    sex: enumValue(suggestion.sex, ['Male', 'Female'] as const) ?? pet.sex,
    ageYears: Number.isFinite(age) && age >= 0 ? String(Math.floor(age / 12)) : pet.ageYears,
    ageMonths: Number.isFinite(age) && age >= 0 ? String(age % 12) : pet.ageMonths,
    breedType: enumValue(suggestion.breedType ?? suggestion.breed_type, ['Mongrel', 'Mix', 'Pure'] as const) ?? pet.breedType,
    color: text(suggestion.color) ?? pet.color,
    sterilized: typeof suggestion.sterilized === 'boolean' ? suggestion.sterilized : pet.sterilized,
    confinement: enumValue(suggestion.confinement, ['Confined', 'Semi-confined', 'Free-roaming'] as const) ?? pet.confinement,
  };
}

function PetFields({ pet, index, onChange, onRemove, canRemove }: { pet: PetDraft; index: number; onChange: (pet: PetDraft) => void; onRemove: () => void; canRemove: boolean }) {
  const { t } = useT();
  const set = <K extends keyof PetDraft>(name: K, value: PetDraft[K]) => onChange({ ...pet, [name]: value });
  const thisYear = new Date().getFullYear();
  return (
    <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-night-border">
      <legend className="px-1 text-xs font-semibold text-slate-500">{t('census.pet', { n: index + 1 })}</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('census.pet.name')} className="sm:col-span-2"><ReferenceInput source="pets" value={pet.petName} onChange={(value) => set('petName', value)} onSelect={(suggestion) => onChange(petFromSuggestion(pet, suggestion))} required maxLength={80} className={inputCls} /></Field>
        <Field label={t('census.pet.species')}>
          <Select value={pet.species} onChange={(e) => set('species', e.target.value as PetDraft['species'])} className={inputCls}>
            <option value="Dog">{t('census.pet.dog')}</option><option value="Cat">{t('census.pet.cat')}</option>
          </Select>
        </Field>
        <Field label={t('census.pet.sex')}>
          <Select value={pet.sex} onChange={(e) => set('sex', e.target.value as PetDraft['sex'])} className={inputCls}>
            <option value="Male">{t('census.pet.male')}</option><option value="Female">{t('census.pet.female')}</option>
          </Select>
        </Field>
        <Field label={t('census.pet.ageYears')}><input type="number" min={0} max={50} inputMode="numeric" value={pet.ageYears} onChange={(e) => set('ageYears', e.target.value)} className={inputCls} /></Field>
        <Field label={t('census.pet.ageMonths')}><input type="number" min={0} max={11} inputMode="numeric" value={pet.ageMonths} onChange={(e) => set('ageMonths', e.target.value)} className={inputCls} /></Field>
        <Field label={t('census.pet.breed')}>
          <Select value={pet.breedType} onChange={(e) => set('breedType', e.target.value as PetDraft['breedType'])} className={inputCls}>
            <option value="">{t('census.pet.unknown')}</option><option value="Mongrel">{t('census.pet.mongrel')}</option><option value="Mix">Mix</option><option value="Pure">{t('census.pet.pure')}</option>
          </Select>
        </Field>
        <Field label={t('census.pet.color')}><input maxLength={60} value={pet.color} onChange={(e) => set('color', e.target.value)} className={inputCls} /></Field>
        <Field label={t('census.pet.classification')}>
          <Select value={pet.confinement} onChange={(e) => set('confinement', e.target.value as PetDraft['confinement'])} className={inputCls}>
            <option value="">{t('census.pet.unknown')}</option><option value="Confined">{t('census.pet.confined')}</option>
            <option value="Semi-confined">{t('census.pet.semi')}</option><option value="Free-roaming">{t('census.pet.free')}</option>
          </Select>
        </Field>
        <Field label={t('census.pet.registered')}>
          <Select value={pet.registeredYear} onChange={(e) => set('registeredYear', e.target.value)} className={inputCls}>
            <option value="">{t('census.pet.unknown')}</option>
            {[thisYear, thisYear - 1, thisYear - 2].map((year) => <option key={year} value={year}>{year}</option>)}
          </Select>
        </Field>
        <Field label={t('census.pet.vOther')}><input maxLength={120} value={pet.vaccineOther} onChange={(e) => set('vaccineOther', e.target.value)} className={inputCls} /></Field>
        <Field label={t('census.pet.remarks')}><input maxLength={300} value={pet.remarks} onChange={(e) => set('remarks', e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
        <CensusFlag value={pet.sterilized} onChange={(v) => set('sterilized', v)} label={t(pet.sex === 'Male' ? 'census.pet.castrated' : 'census.pet.spayed')}/>
        <span className="text-xs text-slate-500">{t('census.pet.vaccination')}:</span>
        <CensusFlag value={pet.vaccine1st} onChange={(v) => set('vaccine1st', v)} label={t('census.pet.v1')}/>
        <CensusFlag value={pet.vaccine2nd} onChange={(v) => set('vaccine2nd', v)} label={t('census.pet.v2')}/>
        <CensusFlag value={pet.vaccine3rd} onChange={(v) => set('vaccine3rd', v)} label={t('census.pet.v3')}/>
        <CensusFlag value={pet.booster} onChange={(v) => set('booster', v)} label={t('census.pet.booster')}/>
        <CensusFlag value={pet.laps} onChange={(v) => set('laps', v)} label={t('census.pet.laps')}/>
        {canRemove && (
          <button type="button" onClick={onRemove} className="ml-auto inline-flex items-center gap-1 text-xs text-red-700 hover:underline dark:text-red-300">
            <Trash2 aria-hidden className="h-3.5 w-3.5" />{t('census.pet.remove')}
          </button>
        )}
      </div>
    </fieldset>
  );
}

export interface SheetValues { label: string; censusDate: string; householdsVisited: number; owners: OwnerPayload[] }

interface Props {
  initial?: { label: string; censusDate: string; householdsVisited: number; owners: OwnerDraft[] };
  /** Show title, date and households (hidden when staff only type in owners from photos). */
  showMeta?: boolean;
  barangay?: string | null;
  submitLabel: string;
  onSubmit: (values: SheetValues) => Promise<void>;
}

/** The digital door-to-door sheet: one block per owner, one card per pet. */
export function CensusSheetEditor({ initial, showMeta = true, barangay, submitLabel, onSubmit }: Props) {
  const { t } = useT();
  const [label, setLabel] = useState(initial?.label ?? '');
  const [censusDate, setCensusDate] = useState(initial?.censusDate ?? todayManila());
  const [households, setHouseholds] = useState(String(initial?.householdsVisited ?? ''));
  const [owners, setOwners] = useState<OwnerDraft[]>(initial?.owners.length ? initial.owners : [emptyOwner()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setOwner = (index: number, next: OwnerDraft) => setOwners((list) => list.map((owner, i) => (i === index ? next : owner)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onSubmit({
        label: label.trim() || `${barangay ? `${barangay} ` : ''}${censusDate}`, censusDate,
        householdsVisited: households === '' ? 0 : Number(households), owners: toPayload(owners),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.loadFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {showMeta && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {barangay && <Field label={t('census.meta.barangay')}><input readOnly value={barangay} className={inputCls} /></Field>}
          <Field label={t('census.meta.date')}><DateInput required max={todayManila()} value={censusDate} onChange={(e) => setCensusDate(e.target.value)} className={inputCls} /></Field>
          <Field label={t('census.meta.households')} hint={t('census.meta.householdsHelp')}><input type="number" min={0} inputMode="numeric" value={households} onChange={(e) => setHouseholds(e.target.value)} className={inputCls} /></Field>
          <Field label={`${t('census.meta.title')} (${t('common.optional')})`}><input maxLength={160} value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} /></Field>
        </div>
      )}

      {owners.map((owner, index) => (
        <section key={owner.key} className="rounded-2xl border border-slate-200 p-4 dark:border-night-border">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">{t('census.owner', { n: index + 1 })}</h3>
            {owners.length > 1 && (
              <button type="button" onClick={() => setOwners((list) => list.filter((_, i) => i !== index))} className="inline-flex items-center gap-1 text-xs text-red-700 hover:underline dark:text-red-300">
                <Trash2 aria-hidden className="h-3.5 w-3.5" />{t('census.owner.remove')}
              </button>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('census.owner.name')}><ReferenceInput source="owners" value={owner.ownerName} onChange={(value) => setOwner(index, { ...owner, ownerName: value })} onSelect={(suggestion) => setOwner(index, {
              ...owner,
              ownerName: suggestion.name,
              address: text(suggestion.address) ?? owner.address,
              contact: text(suggestion.contact ?? suggestion.mobile) ?? owner.contact,
            })} required maxLength={120} className={inputCls} /></Field>
            <Field label={t('census.owner.address')}><input required maxLength={240} value={owner.address} onChange={(e) => setOwner(index, { ...owner, address: e.target.value })} className={inputCls} /></Field>
            <Field label={`${t('census.owner.contact')} (${t('common.optional')})`}><input {...mobileInput} value={owner.contact} onChange={(e) => setOwner(index, { ...owner, contact: mobileDigits(e.target.value) })} className={inputCls} /></Field>
          </div>
          <div className="mt-4 space-y-3">
            {owner.pets.map((pet, petIndex) => (
              <PetFields key={pet.key} pet={pet} index={petIndex} canRemove={owner.pets.length > 1}
                onChange={(next) => setOwner(index, { ...owner, pets: owner.pets.map((p, i) => (i === petIndex ? next : p)) })}
                onRemove={() => setOwner(index, { ...owner, pets: owner.pets.filter((_, i) => i !== petIndex) })} />
            ))}
            <button type="button" onClick={() => setOwner(index, { ...owner, pets: [...owner.pets, emptyPet()] })} className={btnGhost}>
              <Plus aria-hidden className="h-4 w-4" />{t('census.pet.add')}
            </button>
          </div>
        </section>
      ))}

      <button type="button" onClick={() => setOwners((list) => [...list, emptyOwner()])} className={btnGhost}>
        <Plus aria-hidden className="h-4 w-4" />{t('census.owner.add')}
      </button>
      {error && <Notice kind="error">{error}</Notice>}
      <div><button type="submit" disabled={busy} className={btnPrimary}>{busy ? t('census.saving') : submitLabel}</button></div>
    </form>
  );
}
