import { useEffect, useId, useState } from 'react';
import { api } from '../lib/api';
import { useT } from '../i18n';

export type ReferenceSource = 'barangay' | 'owners' | 'pets';
export type ReferenceSuggestion = Record<string, unknown> & { id: string | number; name: string };

type ApiRecord = Record<string, unknown> & { id: string | number };
type SuggestionsResponse = { data: ApiRecord[] };
type BarangaysResponse = { data: Array<{ id: number; name: string; acronym: string; district: string; zip: string }> };

function displayName(source: ReferenceSource, row: ApiRecord): string {
  if (source === 'barangay') return String(row.name ?? '');
  const name = source === 'owners'
    ? row.owner_name ?? row.name ?? row.ownerName
    : row.pet_name ?? row.name ?? row.petName;
  return String(name ?? '');
}

async function loadSuggestions(source: ReferenceSource, query: string): Promise<ReferenceSuggestion[]> {
  if (source === 'barangay') {
    const response = await api<BarangaysResponse>('GET', `/barangays?q=${encodeURIComponent(query)}`);
    return response.data.map((row) => ({ ...row, name: row.name }));
  }
  const response = await api<SuggestionsResponse>(
    'GET',
    `/records/${source}?page=1&pageSize=8&archived=false&q=${encodeURIComponent(query)}`,
  );
  return response.data
    .map((row) => ({ ...row, name: displayName(source, row) }))
    .filter((row) => row.name.trim().length > 0);
}

export function ReferenceInput({
  source,
  value,
  onChange,
  onSelect,
  className,
  required,
  maxLength,
}: {
  source: ReferenceSource;
  value: string;
  onChange: (value: string) => void;
  onSelect?: (suggestion: ReferenceSuggestion) => void;
  className: string;
  required?: boolean;
  maxLength?: number;
}) {
  const { t } = useT();
  const listId = useId();
  const [suggestions, setSuggestions] = useState<ReferenceSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const query = value.trim();

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      setError('');
      setLoading(false);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void loadSuggestions(source, query)
        .then((rows) => {
          if (active) setSuggestions(rows);
        })
        .catch((reason: unknown) => {
          if (active) {
            setSuggestions([]);
            setError(reason instanceof Error ? reason.message : t('references.failed'));
          }
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, source, t]);

  const status = error
    ? t('references.failed')
    : loading
      ? t('references.loading')
      : suggestions.length > 0
        ? t('references.hint')
        : '';

  return (
    <>
      <input
        list={listId}
        value={value}
        required={required}
        maxLength={maxLength}
        onChange={(event) => {
          const next = event.target.value;
          onChange(next);
          const selected = suggestions.find((suggestion) => suggestion.name.toLocaleLowerCase() === next.trim().toLocaleLowerCase());
          if (selected) onSelect?.(selected);
        }}
        className={className}
        autoComplete="off"
      />
      <datalist id={listId}>
        {suggestions.map((suggestion) => (
          <option
            key={`${source}-${suggestion.id}`}
            value={suggestion.name}
            label={String(suggestion.address ?? suggestion.acronym ?? suggestion.species ?? '')}
          />
        ))}
      </datalist>
      {status && <span aria-live="polite" className={`mt-1 block text-xs ${error ? 'text-red-700 dark:text-red-300' : 'text-slate-500'}`}>{status}</span>}
    </>
  );
}
